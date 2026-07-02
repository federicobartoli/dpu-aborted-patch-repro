# Declarative Partial Updates: aborted patch repro

This is a minimal repro for testing what happens when a streamed
`<template for>` patch is interrupted before the template closes.

This is not a bug report. It is a measurement harness for:

- when the existing fallback content is removed;
- what DOM remains after the network stream aborts;
- whether processing instruction markers remain targetable;
- whether a JS retry can patch the same range afterwards;
- how this differs from ordinary top-down HTML streaming truncation.

## Run

```bash
npm start
```

Open:

```text
http://127.0.0.1:8800
```

Use Chrome 150 or newer. Declarative Partial Updates via streamed
`<template for>` are available unflagged in Chrome 150.

## Scenarios

- `/complete`: complete DPU patch baseline.
- `/abort-empty`: sends `<template for=...>` and aborts before replacement content.
- `/abort-partial`: sends partial replacement content, then aborts before closing the template.
- `/clean-empty`: sends `<template for=...>`, then ends the response cleanly before replacement content.
- `/clean-truncation`: sends partial replacement content, then ends the response cleanly before closing the template.
- `/multi-abort`: applies one complete patch, then aborts during a second patch for the same target.
- `/classic-abort`: ordinary top-down HTML streaming abort, without DPU.
- `/classic-clean`: ordinary top-down HTML clean EOF, without DPU.

Each page writes a structured log to `window.__dpuAbortLog` and to the visible
`#result` element.
