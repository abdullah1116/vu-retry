(() => {
  if (window.__vuBar) return;

  window.__vuBar = (title, sub) => {
    if (!document.getElementById("__vu-retry-style")) {
      const style = document.createElement("style");
      style.id = "__vu-retry-style";
      style.textContent =
        "@keyframes __vu-spin{to{transform:rotate(360deg)}}" +
        "#__vu-retry-bar{position:fixed;top:16px;right:16px;z-index:2147483647;" +
        "display:flex;align-items:center;gap:10px;max-width:340px;padding:10px 14px;border-radius:12px;" +
        "background:rgba(17,20,24,.94);color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);" +
        "border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px)}" +
        "#__vu-retry-bar::before{content:\"\";flex:0 0 auto;width:13px;height:13px;border-radius:50%;" +
        "border:2px solid rgba(255,255,255,.22);border-top-color:#fff;animation:__vu-spin .8s linear infinite}" +
        "#__vu-retry-text{display:flex;flex-direction:column;gap:2px}" +
        "#__vu-retry-title{font:600 12.5px/1.25 system-ui,sans-serif;letter-spacing:.2px}" +
        "#__vu-retry-sub{font:400 11.5px/1.25 system-ui,sans-serif;color:rgba(255,255,255,.62)}";
      document.documentElement.appendChild(style);
    }

    let el = document.getElementById("__vu-retry-bar");
    if (!el) {
      el = document.createElement("div");
      el.id = "__vu-retry-bar";
      const text = document.createElement("div");
      text.id = "__vu-retry-text";
      const head = document.createElement("span");
      head.id = "__vu-retry-title";
      const detail = document.createElement("span");
      detail.id = "__vu-retry-sub";
      text.appendChild(head);
      text.appendChild(detail);
      el.appendChild(text);
      document.documentElement.appendChild(el);
    }

    document.getElementById("__vu-retry-title").textContent = title;
    document.getElementById("__vu-retry-sub").textContent = sub ?? "";
  };
})();
