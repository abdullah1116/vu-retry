(async () => {
  const DEFAULTS = { pageReloads: 5, fetchRetries: 3 };

  const apply = async () => {
    const cfg = await chrome.storage.local.get(DEFAULTS);
    const root = document.documentElement;
    if (!root) return false;
    root.dataset.vuPageReloads = String(cfg.pageReloads);
    root.dataset.vuFetchRetries = String(cfg.fetchRetries);
    return true;
  };

  if (await apply()) return;

  let tries = 0;
  const wait = setInterval(async () => {
    tries += 1;
    if ((await apply()) || tries > 40) clearInterval(wait);
  }, 5);
})();
