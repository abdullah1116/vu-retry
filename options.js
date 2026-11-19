const DEFAULTS = {
  autoReload: true,
  pageReloads: 5,
  fetchRetries: 3,
  maxNavRetries: 4,
  baseDelayMs: 400,
  maxDelayMs: 8000,
  probeTimeoutMs: 25000,
};

const NUMERIC = ["pageReloads", "fetchRetries", "maxNavRetries", "baseDelayMs", "maxDelayMs", "probeTimeoutMs"];

const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get(null);
  const cfg = { ...DEFAULTS, ...stored };

  $("autoReload").checked = Boolean(cfg.autoReload);
  for (const key of NUMERIC) $(key).value = String(cfg[key]);

  render();
}

async function save() {
  const cfg = { autoReload: $("autoReload").checked };
  for (const key of NUMERIC) {
    const n = Number($(key).value);
    if (Number.isFinite(n) && n >= 0) cfg[key] = n;
  }
  await chrome.storage.local.set(cfg);
  $("saved").classList.add("on");
  setTimeout(() => $("saved").classList.remove("on"), 1200);
  render();
}

async function render() {
  const el = $("status");
  let data = {};
  try {
    data = (await chrome.runtime.sendMessage({ type: "vu-status" })) ?? {};
  } catch {
    el.textContent = "service worker not reachable (extension reloaded?)";
    return;
  }

  const p = data.lastProbe;
  const s = data.stats ?? { reloads: 0, absorbed: 0 };

  const lines = [];
  lines.push(
    p
      ? `probe   ${p.ok ? "OK" : "FAIL"}  status=${p.status || "-"}  ${p.latency}ms  ${new Date(p.at).toLocaleTimeString()}`
      : "probe   (none yet)",
  );
  if (p?.detail) lines.push(`detail  ${p.detail}`);
  lines.push(`reloads ${s.reloads}   absorbed ${s.absorbed}`);
  el.textContent = lines.join("\n");
}

$("save").addEventListener("click", save);

load();
setInterval(render, 3000);
