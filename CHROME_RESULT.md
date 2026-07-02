# Chrome result

Date: 2026-07-02

Environment:

- Chrome: `150.0.7871.47`
- URL: `http://127.0.0.1:8800`
- Experimental web platform features: not enabled
- Browser modes:
  - headless Chrome stable via DevTools Protocol, isolated temporary profile
  - headed Chrome stable session on the same build

## Purpose

This file records the observed DOM state in Chrome when a streamed
`<template for>` patch is interrupted before the template is closed.

The repro compares Declarative Partial Updates with ordinary top-down HTML
streaming under similar response-truncation conditions. It covers both abrupt
socket close cases and clean EOF cases where the response ends before the
closing `</template>` arrives.

## Observed behavior

- A complete DPU patch removes the original fallback range and markers,
  and leaves the replacement content.
- If the response aborts immediately after `<template for="...">`, the visible
  fallback content is removed and the target range is left empty except for
  `<?start>` / `<?end>` markers.
- If the response aborts after partial replacement content, the visible fallback
  content is removed and partially parsed replacement content remains inside the
  marker range.
- In both abort cases, the document remains `loading` after 15 seconds in this
  repro and no page-level error/rejection is recorded.
- If the response ends cleanly immediately after `<template for="...">`, the
  document reaches `complete`, the visible fallback content is removed, the
  target range is left empty, and the markers are removed.
- If the response ends cleanly after partial replacement content, the document
  reaches `complete`, the visible fallback content is removed, the partial
  replacement content remains, and the markers are removed.
- The classic top-down streaming abort control remains `loading` after 15
  seconds and preserves already-visible stable content.
- The classic top-down clean EOF control reaches `complete` and preserves
  already-visible stable content.
- The differentiating point is DOM state: classic streaming preserves
  already-visible content; an interrupted DPU patch may leave its target range
  empty or partially replaced. In the clean EOF DPU cases, `readyState` reaches
  `complete` even though the patch response ended before `</template>`.
- `insertAdjacentHTML()` with a new `<template for>` after abort does not recover
  the range in this repro. This is consistent with fragment-parsing behavior
  discussed in the Chrome article and WICG issue #31.
- `setHTMLUnsafe()` on the host can recover the aborted range if the markers are
  still present.
- In the multi-patch case, after one complete patch has removed the markers, a
  later aborted patch for the same target does not replace the first successful
  result in this repro.

## Notes

- If the markers remain present after an interrupted patch, the range can be
  rebuilt with an imperative API such as `setHTMLUnsafe()`.
- In the abrupt socket close cases, markers remain present. In the clean EOF
  cases, markers are removed.
- The classic top-down streaming control also remains `loading`; the clean EOF
  cases reach `complete`. Therefore `readyState` is useful as a generic document
  loading signal, but not as a patch-integrity signal.
- The relevant observable difference in this repro is DOM state: ordinary
  truncated streaming preserves already-visible stable content, while an
  interrupted streamed patch may leave its target range empty or partially
  replaced.

## Scenario matrix

| Scenario | Result |
| --- | --- |
| Classic + abrupt socket close (`/classic-abort`) | Already-visible stable content remains intact; document remains `loading`. |
| Classic + clean EOF (`/classic-clean`) | Already-visible stable content remains intact; document reaches `complete`. |
| DPU + abrupt socket close immediately after template start (`/abort-empty`) | Fallback content is removed; range is empty; markers remain; document remains `loading`. |
| DPU + abrupt socket close (`/abort-partial`) | Fallback content is removed; partial replacement content remains; markers remain; document remains `loading`. |
| DPU + clean EOF immediately after template start (`/clean-empty`) | Fallback content is removed; range is empty; markers are removed; document reaches `complete`. |
| DPU + clean EOF during replacement content (`/clean-truncation`) | Fallback content is removed; partial replacement content remains; markers are removed; document reaches `complete`. |

## Scenario details

### `/abort-empty`

Before patch:

```json
{
  "hostText": "Fallback content for abort-empty Editable fallback input This is visible, functioning fallback content before the patch arrives.",
  "originalInputValue": "typed-before-patch",
  "markers": [
    { "target": "start", "data": "name=\"abort-empty-range\"" },
    { "target": "end", "data": "" }
  ]
}
```

After `<template for="abort-empty-range">` and abort:

```json
{
  "readyState": "loading",
  "hostText": "missing",
  "hostHtml": "<?start name=\"abort-empty-range\"?><?end ?>",
  "originalInputExists": false,
  "markers": [
    { "target": "start", "data": "name=\"abort-empty-range\"" },
    { "target": "end", "data": "" }
  ]
}
```

The same state persisted at 10s and 15s with `?no-retry`.

Retry:

```json
{
  "insertAdjacentHTML": {
    "retryExists": false,
    "hostHtml": "<?start name=\"abort-empty-range\"?><?end ?>"
  },
  "setHTMLUnsafe": {
    "retryExists": true,
    "hostHtml": "<section class=\"patched\" id=\"abort-empty-range-sethtmlunsafe-retry\"> Retry patch inserted by setHTMLUnsafe after abort. </section>"
  }
}
```

### `/abort-partial`

After partial replacement and abort:

```json
{
  "readyState": "loading",
  "hostText": "Replacement started but will not finish.",
  "hostHtml": "<?start name=\"abort-partial-range\"?> <section id=\"partial-new\"> <p>Replacement started but will not finish.</p> <input id=\"partial-new-input\" value=\"server-partial\"></section><?end ?>",
  "originalInputExists": false,
  "markers": [
    { "target": "start", "data": "name=\"abort-partial-range\"" },
    { "target": "end", "data": "" }
  ]
}
```

The same partial state persisted at 10s and 15s with `?no-retry`.

Retry with `setHTMLUnsafe()` succeeds because markers are still present:

```json
{
  "retryExists": true,
  "hostHtml": "<section class=\"patched\" id=\"abort-partial-range-sethtmlunsafe-retry\"> Retry patch inserted by setHTMLUnsafe after abort. </section>"
}
```

### `/clean-empty`

After a clean EOF immediately after `<template for="clean-empty-range">`:

```json
{
  "readyState": "complete",
  "hostHtml": "",
  "originalInputExists": false,
  "markers": []
}
```

The visible fallback content is removed, the range is left empty, and the markers
are removed. The same state persisted at 10s and 15s.

### `/clean-truncation`

After a clean EOF during replacement content, before `</template>`:

```json
{
  "readyState": "complete",
  "hostText": "Replacement started but the response ends cleanly before the template closes.",
  "hostHtml": "<section id=\"clean-truncation-new\"> <p>Replacement started but the response ends cleanly before the template closes.</p> <input id=\"clean-truncation-new-input\" value=\"server-clean-truncation\"></section>",
  "originalInputExists": false,
  "markers": []
}
```

The visible fallback content is removed, the partial replacement content is
committed, and the markers are removed. The same state persisted at 10s and 15s.

### `/multi-abort`

After a first complete patch, markers are gone. A later incomplete patch for the
same target did not replace the first successful result in this repro:

```json
{
  "hostHtml": "<section id=\"multi-first\"> <p>First replacement completed.</p> <input id=\"multi-first-input\" value=\"server-first\"> </section>",
  "markers": []
}
```

### `/classic-abort`

Classic top-down streaming control:

```json
{
  "readyState": "loading",
  "lateExists": true
}
```

The already-visible stable content remains intact after the later stream aborts,
and this remained true at 10s and 15s.

### `/classic-clean`

Classic top-down clean EOF control:

```json
{
  "readyState": "complete",
  "stableHtml": "<h2>Classic stable content</h2> <label> Stable input <input id=\"classic-input\" value=\"\" autocomplete=\"off\"> </label> <p>This content is above the later truncated stream.</p>",
  "stableInputValue": "typed-before-truncation",
  "lateExists": true
}
```

The already-visible stable content remains intact after the response ends
cleanly, and the document reaches `complete`.
