import http from "node:http";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8800);
const patchStartDelay = 1800;

http
  .createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    try {
      if (url.pathname === "/") return index(response);
      if (url.pathname === "/complete") return completePatch(response);
      if (url.pathname === "/abort-empty") return abortEmptyPatch(response);
      if (url.pathname === "/abort-partial") return abortPartialPatch(response);
      if (url.pathname === "/clean-empty") return cleanEmptyPatch(response);
      if (url.pathname === "/clean-truncation") return cleanTruncationPatch(response);
      if (url.pathname === "/multi-abort") return multiAbortPatch(response);
      if (url.pathname === "/classic-abort") return classicAbort(response);
      if (url.pathname === "/classic-clean") return classicClean(response);

      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      }
      response.end(String(error?.stack || error));
    }
  })
  .listen(port, host, () => {
    console.log(`DPU aborted patch repro: http://${host}:${port}`);
  });

function headers(response) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "transfer-encoding": "chunked",
  });
}

function write(response, html, delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      response.write(html);
      resolve();
    }, delay);
  });
}

function abort(response, delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      response.socket?.destroy();
      resolve();
    }, delay);
  });
}

async function index(response) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>DPU aborted patch repro</title>
<body>
  <h1>DPU aborted patch repro</h1>
  <ul>
    <li><a href="/complete">complete patch baseline</a></li>
    <li><a href="/abort-empty">abort after template start</a></li>
    <li><a href="/abort-partial">abort during replacement content</a></li>
    <li><a href="/clean-empty">clean EOF after template start</a></li>
    <li><a href="/clean-truncation">clean EOF during replacement content</a></li>
    <li><a href="/multi-abort">second patch aborts after first patch</a></li>
    <li><a href="/classic-abort">classic top-down streaming abort</a></li>
    <li><a href="/classic-clean">classic top-down clean EOF</a></li>
  </ul>
</body>
</html>`);
}

async function completePatch(response) {
  headers(response);
  await write(response, dpuHead("Complete DPU patch baseline"));
  await write(response, dpuShell({
    caseName: "complete",
    markerName: "complete-range",
    hostId: "complete-host",
    inputId: "complete-input",
  }));
  await write(response, dpuSchedule("complete", "complete-host", "complete-range", "complete-input"));
  await write(response, `
<template for="complete-range">
  <section id="complete-new">
    <p>Replacement content arrived completely.</p>
    <input id="complete-new-input" value="server-complete">
  </section>
</template>`, patchStartDelay);
  await write(response, dpuFoot(), 1600);
  response.end();
}

async function abortEmptyPatch(response) {
  headers(response);
  await write(response, dpuHead("Abort after template start"));
  await write(response, dpuShell({
    caseName: "abort-empty",
    markerName: "abort-empty-range",
    hostId: "abort-empty-host",
    inputId: "abort-empty-input",
  }));
  await write(response, dpuSchedule("abort-empty", "abort-empty-host", "abort-empty-range", "abort-empty-input"));
  await write(response, `
<template for="abort-empty-range">`, patchStartDelay);
  await abort(response, 700);
}

async function abortPartialPatch(response) {
  headers(response);
  await write(response, dpuHead("Abort during replacement content"));
  await write(response, dpuShell({
    caseName: "abort-partial",
    markerName: "abort-partial-range",
    hostId: "abort-partial-host",
    inputId: "abort-partial-input",
  }));
  await write(response, dpuSchedule("abort-partial", "abort-partial-host", "abort-partial-range", "abort-partial-input"));
  await write(response, `
<template for="abort-partial-range">
  <section id="partial-new">
    <p>Replacement started but will not finish.</p>
    <input id="partial-new-input" value="server-partial">`, patchStartDelay);
  await abort(response, 900);
}

async function cleanEmptyPatch(response) {
  headers(response);
  await write(response, dpuHead("Clean EOF after template start"));
  await write(response, dpuShell({
    caseName: "clean-empty",
    markerName: "clean-empty-range",
    hostId: "clean-empty-host",
    inputId: "clean-empty-input",
  }));
  await write(response, dpuSchedule("clean-empty", "clean-empty-host", "clean-empty-range", "clean-empty-input"));
  await write(response, `
<template for="clean-empty-range">`, patchStartDelay);
  response.end();
}

async function cleanTruncationPatch(response) {
  headers(response);
  await write(response, dpuHead("Clean EOF during replacement content"));
  await write(response, dpuShell({
    caseName: "clean-truncation",
    markerName: "clean-truncation-range",
    hostId: "clean-truncation-host",
    inputId: "clean-truncation-input",
  }));
  await write(response, dpuSchedule("clean-truncation", "clean-truncation-host", "clean-truncation-range", "clean-truncation-input"));
  await write(response, `
<template for="clean-truncation-range">
  <section id="clean-truncation-new">
    <p>Replacement started but the response ends cleanly before the template closes.</p>
    <input id="clean-truncation-new-input" value="server-clean-truncation">`, patchStartDelay);
  response.end();
}

async function multiAbortPatch(response) {
  headers(response);
  await write(response, dpuHead("Second patch aborts after first patch"));
  await write(response, dpuShell({
    caseName: "multi-abort",
    markerName: "multi-abort-range",
    hostId: "multi-abort-host",
    inputId: "multi-abort-input",
  }));
  await write(response, dpuSchedule("multi-abort", "multi-abort-host", "multi-abort-range", "multi-abort-input"));
  await write(response, `
<template for="multi-abort-range">
  <section id="multi-first">
    <p>First replacement completed.</p>
    <input id="multi-first-input" value="server-first">
  </section>
</template>`, patchStartDelay);
  await write(response, `
<template for="multi-abort-range">
  <section id="multi-second">
    <p>Second replacement started but will not finish.</p>`, patchStartDelay);
  await abort(response, 900);
}

async function classicAbort(response) {
  headers(response);
  await write(response, dpuHead("Classic top-down streaming abort"));
  await write(response, `
<section class="box" id="classic-stable">
  <h2>Classic stable content</h2>
  <label>
    Stable input
    <input id="classic-input" value="" autocomplete="off">
  </label>
  <p>This content is above the later truncated stream.</p>
</section>

<section class="box">
  <h2>Observed result</h2>
  <pre id="result">Waiting...</pre>
</section>

<script>
  window.addEventListener("error", (event) => {
    record("window-error", { message: event.message });
  });
  window.addEventListener("unhandledrejection", (event) => {
    record("unhandled-rejection", { reason: String(event.reason) });
  });
  scheduleClassicCase();
</script>`);
  await write(response, `
<section id="classic-late">
  <h2>Late streamed content</h2>
  <p>This part starts and then the connection aborts.`, patchStartDelay);
  await abort(response, 900);
}

async function classicClean(response) {
  headers(response);
  await write(response, dpuHead("Classic top-down clean EOF"));
  await write(response, `
<section class="box" id="classic-stable">
  <h2>Classic stable content</h2>
  <label>
    Stable input
    <input id="classic-input" value="" autocomplete="off">
  </label>
  <p>This content is above the later truncated stream.</p>
</section>

<section class="box">
  <h2>Observed result</h2>
  <pre id="result">Waiting...</pre>
</section>

<script>
  window.addEventListener("error", (event) => {
    record("window-error", { message: event.message });
  });
  window.addEventListener("unhandledrejection", (event) => {
    record("unhandled-rejection", { reason: String(event.reason) });
  });
  scheduleClassicCase();
</script>`);
  await write(response, `
<section id="classic-late">
  <h2>Late streamed content</h2>
  <p>This part starts and then the response ends cleanly.`, patchStartDelay);
  response.end();
}

function dpuHead(title) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;background:#f7f7f4;color:#1d1f22;font-family:system-ui,sans-serif;line-height:1.5}
    main{width:min(980px,calc(100% - 32px));margin:0 auto;padding:40px 0}
    h1{margin:0 0 12px;font-size:clamp(2rem,6vw,4rem);line-height:1}
    .box{margin-top:20px;padding:18px;border:1px solid #d8d7d0;border-radius:8px;background:white}
    input{display:block;margin-top:8px;padding:10px 12px;border:1px solid #bbb8ad;border-radius:6px;font:inherit}
    pre{overflow:auto;padding:14px;border-radius:8px;background:#1d1f22;color:#f7f7f4;min-height:360px}
    .patched{color:#1e6b58;font-weight:700}
  </style>
  <script>
    window.__dpuAbortLog = [];
    window.__dpuAbortStartedAt = performance.now();

    function now() {
      return Math.round(performance.now() - window.__dpuAbortStartedAt);
    }

    function activeElementLabel() {
      const active = document.activeElement;
      if (!active) return "none";
      return active.tagName.toLowerCase() + "#" + (active.id || "");
    }

    function markerSnapshot() {
      const markers = [];
      const walker = document.createTreeWalker(document, NodeFilter.SHOW_PROCESSING_INSTRUCTION);
      let node;
      while ((node = walker.nextNode())) {
        markers.push({
          target: node.target,
          data: node.data,
          parentId: node.parentElement?.id || "",
          parentTag: node.parentElement?.tagName?.toLowerCase() || ""
        });
      }
      return markers;
    }

    function compactHtml(element) {
      if (!element) return "missing";
      return element.innerHTML.replace(/\\s+/g, " ").trim();
    }

    function record(event, data = {}) {
      window.__dpuAbortLog.push({
        t: now(),
        event,
        readyState: document.readyState,
        activeElement: activeElementLabel(),
        markers: markerSnapshot(),
        ...data
      });
      renderLog();
    }

    function snapshot(event, hostId, inputId) {
      const host = document.querySelector("#" + hostId);
      const input = document.querySelector("#" + inputId);
      record(event, {
        hostId,
        hostText: host?.textContent?.replace(/\\s+/g, " ").trim() || "missing",
        hostHtml: compactHtml(host),
        originalInputExists: Boolean(input),
        originalInputValue: input?.value ?? "missing",
        bodyText: document.body?.textContent?.replace(/\\s+/g, " ").trim().slice(0, 500) || ""
      });
    }

    function renderLog() {
      const result = document.querySelector("#result");
      if (result) result.textContent = JSON.stringify(window.__dpuAbortLog, null, 2);
    }

    function attemptRetry(markerName, hostId) {
      const host = document.querySelector("#" + hostId);

      record("retry-before", {
        markerName,
        hostHtml: compactHtml(host),
        setHTMLUnsafeAvailable: typeof host?.setHTMLUnsafe === "function"
      });

      document.body.insertAdjacentHTML("beforeend", \`
        <template for="\${markerName}">
          <section class="patched" id="\${markerName}-insertadjacent-retry">
            Retry patch inserted by insertAdjacentHTML after abort.
          </section>
        </template>
      \`);

      record("retry-insertadjacent-after", {
        markerName,
        retryExists: Boolean(document.querySelector("#" + markerName + "-insertadjacent-retry")),
        hostHtml: compactHtml(host)
      });

      if (host && typeof host.setHTMLUnsafe === "function") {
        host.setHTMLUnsafe(\`
          \${host.innerHTML}
          <template for="\${markerName}">
            <section class="patched" id="\${markerName}-sethtmlunsafe-retry">
              Retry patch inserted by setHTMLUnsafe after abort.
            </section>
          </template>
        \`);
      }

      record("retry-sethtmlunsafe-after", {
        markerName,
        retryExists: Boolean(document.querySelector("#" + markerName + "-sethtmlunsafe-retry")),
        hostHtml: compactHtml(host)
      });
    }

    function scheduleDpuCase(caseName, hostId, markerName, inputId) {
      const params = new URL(location.href).searchParams;
      const skipRetry = params.has("no-retry");

      window.addEventListener("error", (event) => {
        record("window-error", { message: event.message });
      });
      window.addEventListener("unhandledrejection", (event) => {
        record("unhandled-rejection", { reason: String(event.reason) });
      });
      document.addEventListener("readystatechange", () => {
        snapshot("readystatechange-" + document.readyState, hostId, inputId);
      });

      setTimeout(() => {
        const input = document.querySelector("#" + inputId);
        input?.focus();
        if (input) input.value = "typed-before-patch";
        snapshot(caseName + ":before-patch", hostId, inputId);
      }, 150);

      setTimeout(() => snapshot(caseName + ":after-template-start-window", hostId, inputId), 2400);
      setTimeout(() => snapshot(caseName + ":after-partial-or-abort-window", hostId, inputId), 3400);
      if (!skipRetry) {
        setTimeout(() => attemptRetry(markerName, hostId), 4300);
      }
      setTimeout(() => snapshot(caseName + ":after-retry-window", hostId, inputId), 4800);
      setTimeout(() => snapshot(caseName + ":late-window", hostId, inputId), 6500);
      setTimeout(() => snapshot(caseName + ":very-late-window-10s", hostId, inputId), 10000);
      setTimeout(() => snapshot(caseName + ":very-late-window-15s", hostId, inputId), 15000);
    }

    function scheduleClassicCase() {
      setTimeout(() => {
        const input = document.querySelector("#classic-input");
        input?.focus();
        if (input) input.value = "typed-before-truncation";
        record("classic:before-late-stream", {
          stableHtml: compactHtml(document.querySelector("#classic-stable")),
          stableInputValue: input?.value ?? "missing",
          lateExists: Boolean(document.querySelector("#classic-late"))
        });
      }, 150);

      setTimeout(() => {
        record("classic:after-abort-window", {
          stableHtml: compactHtml(document.querySelector("#classic-stable")),
          stableInputValue: document.querySelector("#classic-input")?.value ?? "missing",
          lateHtml: compactHtml(document.querySelector("#classic-late")),
          lateExists: Boolean(document.querySelector("#classic-late"))
        });
      }, 2300);

      setTimeout(() => {
        record("classic:very-late-window-10s", {
          stableHtml: compactHtml(document.querySelector("#classic-stable")),
          stableInputValue: document.querySelector("#classic-input")?.value ?? "missing",
          lateHtml: compactHtml(document.querySelector("#classic-late")),
          lateExists: Boolean(document.querySelector("#classic-late"))
        });
      }, 10000);

      setTimeout(() => {
        record("classic:very-late-window-15s", {
          stableHtml: compactHtml(document.querySelector("#classic-stable")),
          stableInputValue: document.querySelector("#classic-input")?.value ?? "missing",
          lateHtml: compactHtml(document.querySelector("#classic-late")),
          lateExists: Boolean(document.querySelector("#classic-late"))
        });
      }, 15000);
    }
  </script>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>`;
}

function dpuShell({ caseName, markerName, hostId, inputId }) {
  return `
<section class="box" id="${hostId}">
  <?start name="${markerName}">
  <h2>Fallback content for ${escapeHtml(caseName)}</h2>
  <label>
    Editable fallback input
    <input id="${inputId}" value="" autocomplete="off">
  </label>
  <p>This is visible, functioning fallback content before the patch arrives.</p>
  <?end>
</section>

<section class="box">
  <h2>Observed result</h2>
  <pre id="result">Waiting...</pre>
</section>`;
}

function dpuSchedule(caseName, hostId, markerName, inputId) {
  return `
<script>
  scheduleDpuCase(${JSON.stringify(caseName)}, ${JSON.stringify(hostId)}, ${JSON.stringify(markerName)}, ${JSON.stringify(inputId)});
</script>`;
}

function dpuFoot() {
  return `
</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
