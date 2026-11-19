const HOST = "datesheet.vu.edu.pk";
const PROBE_URL = `https://${HOST}/authenticateStudent.aspx`;

const DEFAULTS = {
  autoReload: true,
  retryCertErrors: true,
  pageReloads: 5,
  fetchRetries: 3,
  maxNavRetries: 4,
  baseDelayMs: 400,
  maxDelayMs: 8000,
  probeTimeoutMs: 25000,
};

const BOUNDS = {
  maxNavRetries: [0, 20],
  baseDelayMs: [100, 5000],
  maxDelayMs: [500, 20000],
  probeTimeoutMs: [3000, 120000],
};

const CERT_ERRORS = ["net::ERR_CERT_AUTHORITY_INVALID", "net::ERR_CERT_COMMON_NAME_INVALID"];

const RETRYABLE = [
  "net::ERR_EMPTY_RESPONSE",
  "net::ERR_CONNECTION_RESET",
  "net::ERR_CONNECTION_CLOSED",
  "net::ERR_CONNECTION_TIMED_OUT",
  "net::ERR_TIMED_OUT",
  "net::ERR_SSL_PROTOCOL_ERROR",
  "net::ERR_HTTP2_PROTOCOL_ERROR",
  ...CERT_ERRORS,
];

const clamp = (key, value) => {
  const [lo, hi] = BOUNDS[key];
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : DEFAULTS[key];
};

async function settings() {
  const stored = await chrome.storage.local.get(null);
  const cfg = { ...DEFAULTS, ...stored };
  for (const key of Object.keys(BOUNDS)) cfg[key] = clamp(key, cfg[key]);
  return cfg;
}

async function paint(text, color, title) {
  try {
    await chrome.action.setBadgeText({ text });
    if (color) await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setTitle({ title });
  } catch {}
}

const navKey = (tabId) => `nav:${tabId}`;

async function navBudget(tabId) {
  const key = navKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const rec = stored[key];
  const now = Date.now();
  if (!rec || now - rec.windowStart > 60000) return { count: 0, windowStart: now };
  return rec;
}

async function saveNavBudget(tabId, rec) {
  await chrome.storage.session.set({ [navKey(tabId)]: rec });
}

let probing = false;

async function probe() {
  if (probing) return null;

  let open = [];
  try {
    open = await chrome.tabs.query({ url: `https://${HOST}/*` });
  } catch {}
  if (open.length === 0) return null;

  probing = true;
  try {
    const s = await settings();
    const started = Date.now();
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), s.probeTimeoutMs);

    let status = 0;
    let detail = "";
    let reachable = false;

    try {
      const res = await fetch(PROBE_URL, {
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        signal: ctrl.signal,
      });
      status = res.status;
      reachable = res.type === "opaqueredirect" || (status > 0 && status < 500);
    } catch (err) {
      detail = err?.name === "AbortError" ? "timeout" : String(err?.message ?? err);
    } finally {
      clearTimeout(killer);
    }

    const latency = Date.now() - started;

    await chrome.storage.session.set({
      lastProbe: { ok: reachable, status, detail, latency, at: Date.now() },
    });

    if (reachable) await paint("OK", "#1a7f37", `VU reachable · ${status} · ${latency}ms`);
    else if (status > 0) await paint(String(status), "#b42318", `VU upstream ${status}`);
    else await paint("ERR", "#b54708", `VU unreachable · ${detail}`);

    return { ok: reachable, status };
  } finally {
    probing = false;
  }
}

function ensureProbe() {
  chrome.alarms.create("probe", { periodInMinutes: 0.5 });
}

chrome.runtime.onInstalled.addListener(ensureProbe);
chrome.runtime.onStartup.addListener(ensureProbe);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "probe") probe().catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(navKey(tabId)).catch(() => {});
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
  try {
    if (details.frameId !== 0) return;
    if (new URL(details.url).hostname !== HOST) return;

    const s = await settings();
    if (!s.autoReload) return;

    const error = String(details.error);

    if (!s.retryCertErrors && CERT_ERRORS.some((prefix) => error.startsWith(prefix))) {
      await paint("CERT", "#b42318", `VU certificate error left as-is · ${error}`);
      return;
    }

    if (!RETRYABLE.some((prefix) => error.startsWith(prefix))) return;

    const rec = await navBudget(details.tabId);

    if (rec.count >= s.maxNavRetries) {
      await saveNavBudget(details.tabId, rec);
      await paint("STOP", "#6b7280", `VU · gave up after ${rec.count} retries · ${error}`);
      return;
    }

    const count = rec.count + 1;
    await saveNavBudget(details.tabId, { count, windowStart: rec.windowStart });

    const delay = Math.min(s.baseDelayMs * 2 ** (count - 1), s.maxDelayMs) + Math.random() * 250;
    const target = details.url;

    setTimeout(() => {
      chrome.tabs.update(details.tabId, { url: target }).catch(() => {});
    }, delay);
  } catch {}
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "vu-report") {
    (async () => {
      try {
        const stored = await chrome.storage.session.get({ stats: { reloads: 0, absorbed: 0 } });
        const stats = stored.stats;
        stats.reloads += msg.reloads ?? 0;
        stats.absorbed += msg.absorbed ?? 0;
        await chrome.storage.session.set({
          stats,
          lastReport: { ...msg, at: Date.now(), tabId: sender.tab?.id ?? -1 },
        });
      } catch {}
      try {
        reply({ ok: true });
      } catch {}
    })();
    return true;
  }

  if (msg?.type === "vu-status") {
    (async () => {
      try {
        reply(await chrome.storage.session.get(["lastProbe", "stats", "lastReport"]));
      } catch {
        try {
          reply({});
        } catch {}
      }
    })();
    return true;
  }

  return false;
});
