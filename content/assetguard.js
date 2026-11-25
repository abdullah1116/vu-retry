(() => {
  const KEY = "__vuRetryCount";
  const LOAD_WINDOW_MS = 5000;
  const VU_DOMAIN = "vu.edu.pk";
  const started = Date.now();
  let fired = false;

  if (window.__vuAssetGuard) return;
  window.__vuAssetGuard = true;

  const max = () => {
    const n = Number(document.documentElement?.dataset?.vuPageReloads);
    return Number.isFinite(n) && n >= 0 ? n : 5;
  };

  const isVuUrl = (url) => {
    try {
      const host = new URL(url, location.href).hostname.toLowerCase();
      return host === VU_DOMAIN || host.endsWith(`.${VU_DOMAIN}`);
    } catch {
      return false;
    }
  };

  const editing = () => {
    for (const el of document.querySelectorAll("input, textarea")) {
      if (el.value && el.value !== el.defaultValue) return true;
    }
    return false;
  };

  window.addEventListener("error", (event) => {
    if (fired) return;
    const el = event.target;
    if (!el || (el.tagName !== "SCRIPT" && el.tagName !== "LINK")) return;
    if (Date.now() - started > LOAD_WINDOW_MS) return;

    const url = el.src || el.href;
    if (!url || !isVuUrl(url)) return;
    if (editing()) return;

    const limit = max();
    if (limit === 0) return;

    const stored = Number(sessionStorage.getItem(KEY));
    const attempt = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;

    if (attempt >= limit) {
      window.__vuBar("gave up", `upstream refused ${limit} reloads in a row`);
      return;
    }

    fired = true;
    sessionStorage.setItem(KEY, String(attempt + 1));
    chrome.runtime.sendMessage({ type: "vu-report", reloads: 1, absorbed: 1 }).catch(() => {});

    const delay = Math.min(500 * 2 ** attempt, 8000) + Math.random() * 300;
    window.__vuBar("asset failed to load", `reload ${attempt + 1}/${limit} in ${(delay / 1000).toFixed(1)}s`);

    setTimeout(() => location.reload(), delay);
  }, true);
})();
