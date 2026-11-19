(() => {
  if (window.__vuNetPatched) return;
  window.__vuNetPatched = true;

  const RETRY = new Set([408, 425, 429, 502, 503, 504]);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const backoff = (n) => Math.min(300 * 2 ** (n - 1), 3000) + Math.random() * 150;

  const maxRetries = () => {
    const n = Number(document.documentElement?.dataset?.vuFetchRetries);
    return Number.isFinite(n) && n >= 0 ? n : 3;
  };

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function vuFetch(input, init) {
    let base;
    try {
      base = new Request(input, init);
    } catch {
      return nativeFetch(input, init);
    }

    const idempotent = base.method === "GET" || base.method === "HEAD";

    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await nativeFetch(base.clone());
        if (!idempotent || !RETRY.has(res.status) || attempt >= maxRetries()) return res;
        await sleep(backoff(attempt + 1));
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        if (!idempotent || attempt >= maxRetries()) throw err;
        await sleep(backoff(attempt + 1));
      }
    }
  };
})();
