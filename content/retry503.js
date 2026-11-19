(() => {
  const KEY = "__vuRetryCount";
  const configured = Number(document.documentElement?.dataset?.vuPageReloads);
  const MAX = Number.isFinite(configured) && configured >= 0 ? configured : 5;

  const bodyText = (document.body?.innerText ?? "").trim();
  const broken =
    bodyText.length < 600 &&
    (/service is unavailable/i.test(bodyText) ||
      /server error in/i.test(bodyText) ||
      /runtime error/i.test(bodyText));

  if (!broken) {
    sessionStorage.removeItem(KEY);
    return;
  }

  const attempt = Number(sessionStorage.getItem(KEY) ?? 0);
  chrome.runtime.sendMessage({ type: "vu-report", reloads: 1, absorbed: 1 }).catch(() => {});

  if (MAX === 0) {
    bar("auto-reload disabled \u00b7 page left as-is");
    return;
  }

  if (attempt >= MAX) {
    bar(`gave up \u00b7 upstream refused ${MAX} reloads in a row`);
    return;
  }

  sessionStorage.setItem(KEY, String(attempt + 1));

  const delay = Math.min(500 * 2 ** attempt, 8000) + Math.random() * 300;
  const until = Date.now() + delay;
  const label = `upstream 503 \u00b7 retry ${attempt + 1}/${MAX} in ${(delay / 1000).toFixed(1)}s`;

  bar(label);

  const tick = setInterval(() => {
    const left = Math.max(0, until - Date.now());
    bar(`upstream 503 \u00b7 retry ${attempt + 1}/${MAX} in ${(left / 1000).toFixed(1)}s`);
  }, 200);

  setTimeout(() => {
    clearInterval(tick);
    location.reload();
  }, delay);

  function bar(message) {
    let el = document.getElementById("__vu-retry-bar");
    if (!el) {
      el = document.createElement("div");
      el.id = "__vu-retry-bar";
      el.style.cssText =
        "position:fixed;inset:0 0 auto 0;z-index:2147483647;padding:10px 16px;text-align:center;" +
        "font:600 13px/1.4 system-ui,sans-serif;background:#111;color:#fff;letter-spacing:.2px";
      document.documentElement.appendChild(el);
    }
    el.textContent = message;
  }
})();
