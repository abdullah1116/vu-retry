(() => {
  const KEY = "__vuRetryCount";
  const configured = Number(document.documentElement?.dataset?.vuPageReloads);
  const MAX = Number.isFinite(configured) && configured >= 0 ? configured : 5;

  const bodyText = (document.body?.innerText ?? "").trim();
  const broken =
    bodyText.length < 600 &&
    (/the service is unavailable/i.test(bodyText) || /server error in '\/' application/i.test(bodyText));

  if (!broken) {
    sessionStorage.removeItem(KEY);
    return;
  }

  if (MAX === 0) {
    bar("auto-reload disabled \u00b7 page left as-is");
    return;
  }

  const stored = Number(sessionStorage.getItem(KEY));
  const attempt = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;

  if (attempt >= MAX) {
    bar(`gave up \u00b7 upstream refused ${MAX} reloads in a row`);
    return;
  }

  sessionStorage.setItem(KEY, String(attempt + 1));
  chrome.runtime.sendMessage({ type: "vu-report", reloads: 1, absorbed: 1 }).catch(() => {});

  const delay = Math.min(500 * 2 ** attempt, 8000) + Math.random() * 300;
  const until = Date.now() + delay;

  bar(`upstream 503 \u00b7 retry ${attempt + 1}/${MAX} in ${(delay / 1000).toFixed(1)}s`);

  const tick = setInterval(() => {
    const left = Math.max(0, until - Date.now());
    bar(`upstream 503 \u00b7 retry ${attempt + 1}/${MAX} in ${(left / 1000).toFixed(1)}s`);
  }, 200);

  setTimeout(() => {
    clearInterval(tick);
    location.reload();
  }, delay);

  function bar(message) {
    if (!document.getElementById("__vu-retry-style")) {
      const style = document.createElement("style");
      style.id = "__vu-retry-style";
      style.textContent =
        "@keyframes __vu-spin{to{transform:rotate(360deg)}}" +
        "#__vu-retry-bar{position:fixed;top:16px;right:16px;z-index:2147483647;" +
        "display:flex;align-items:center;gap:9px;max-width:320px;padding:9px 14px;border-radius:12px;" +
        "background:rgba(17,20,24,.94);color:#fff;font:600 12px/1.35 system-ui,sans-serif;" +
        "letter-spacing:.2px;box-shadow:0 6px 24px rgba(0,0,0,.35);" +
        "border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px)}" +
        "#__vu-retry-bar::before{content:\"\";flex:0 0 auto;width:13px;height:13px;border-radius:50%;" +
        "border:2px solid rgba(255,255,255,.22);border-top-color:#fff;animation:__vu-spin .8s linear infinite}";
      document.documentElement.appendChild(style);
    }

    let el = document.getElementById("__vu-retry-bar");
    if (!el) {
      el = document.createElement("div");
      el.id = "__vu-retry-bar";
      document.documentElement.appendChild(el);
    }
    el.textContent = message;
  }
})();
