(() => {
  if (window.__vuNetPatched) return;
  window.__vuNetPatched = true;

  const RETRY = new Set([408, 425, 429, 502, 503, 504]);

  const maxRetries = () => {
    const n = Number(document.documentElement?.dataset?.vuFetchRetries);
    return Number.isFinite(n) && n >= 0 ? n : 3;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const backoff = (n) => Math.min(300 * 2 ** (n - 1), 3000) + Math.random() * 150;

  const announce = (layer, status, attempt) => {
    try {
      window.dispatchEvent(new CustomEvent("vu-retry-net", { detail: { layer, status, attempt } }));
    } catch {}
  };

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function vuFetch(input, init) {
    const probe = input instanceof Request ? input : new Request(input, init);
    const method = String(probe.method || "GET").toUpperCase();
    const idempotent = method === "GET" || method === "HEAD";

    for (let attempt = 0; ; attempt += 1) {
      try {
        const copy = input instanceof Request ? input.clone() : input;
        const res = await nativeFetch(copy, input instanceof Request ? undefined : init);
        if (!RETRY.has(res.status) || !idempotent || attempt >= maxRetries()) return res;
        announce("fetch", res.status, attempt + 1);
        await sleep(backoff(attempt + 1));
      } catch (err) {
        if (!idempotent || attempt >= maxRetries()) throw err;
        announce("fetch", 0, attempt + 1);
        await sleep(backoff(attempt + 1));
      }
    }
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__vu = {
      method: String(method || "GET").toUpperCase(),
      args: [method, url, ...rest],
      headers: [],
      attempt: 0,
    };
    return nativeOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
    if (this.__vu) this.__vu.headers.push([key, value]);
    return nativeSetHeader.call(this, key, value);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const meta = this.__vu;
    const xhr = this;

    if (meta) {
      const idempotent = meta.method === "GET" || meta.method === "HEAD";

      xhr.addEventListener("load", () => {
        if (!idempotent || !RETRY.has(xhr.status) || meta.attempt >= maxRetries()) return;
        meta.attempt += 1;
        announce("xhr", xhr.status, meta.attempt);
        setTimeout(() => {
          try {
            nativeOpen.apply(xhr, meta.args);
            for (const [k, v] of meta.headers) nativeSetHeader.call(xhr, k, v);
            nativeSend.call(xhr, body);
          } catch {}
        }, backoff(meta.attempt));
      });
    }

    return nativeSend.call(xhr, body);
  };
})();
