const HOST = "datesheet.vu.edu.pk";
const PROBE_URL = `https://${HOST}/authenticateStudent.aspx`;

const DEFAULTS = {
  autoReload: true,
  pageReloads: 5,
  fetchRetries: 3,
  maxNavRetries: 4,
  baseDelayMs: 400,
  maxDelayMs: 8000,
  probeTimeoutMs: 25000,
};

const RETRYABLE = [
  "net::ERR_EMPTY_RESPONSE",
  "net::ERR_CONNECTION_RESET",
  "net::ERR_CONNECTION_CLOSED",
  "net::ERR_CONNECTION_TIMED_OUT",
  "net::ERR_TIMED_OUT",
  "net::ERR_CERT_AUTHORITY_INVALID",
  "net::ERR_CERT_COMMON_NAME_INVALID",
  "net::ERR_SSL_PROTOCOL_ERROR",
  "net::ERR_HTTP2_PROTOCOL_ERROR",
];

const navState = new Map();

async function settings() {
  const stored = await chrome.storage.local.get(null);
  return { ...DEFAULTS, ...stored };
}

async function paint(text, color, title) {
  await chrome.action.setBadgeText({ text });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setTitle({ title });
}

async function probe() {
  const s = await settings();
  const started = Date.now();
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), s.probeTimeoutMs);
  let status = 0;
  let detail = "";

  try {
    const res = await fetch(PROBE_URL, {
      cache: "no-store",
      credentials: "include",
      redirect: "manual",
      signal: ctrl.signal,
    });
    status = res.status;
  } catch (err) {
    detail = err?.name === "AbortError" ? "timeout" : (err?.message ?? String(err));
  } finally {
    clearTimeout(killer);
  }

  const latency = Date.now() - started;
  const ok = status > 0 && status < 500;

  await chrome.storage.session.set({
    lastProbe: { ok, status, detail, latency, at: Date.now() },
  });

  if (ok) await paint("OK", "#1a7f37", `VU reachable · ${status} · ${latency}ms`);
  else if (status > 0) await paint(String(status), "#b42318", `VU upstream ${status}`);
  else await paint("ERR", "#b54708", `VU unreachable · ${detail}`);

  return { ok, status };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("probe", { periodInMinutes: 0.5, delayInMinutes: 0.02 });
  probe().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("probe", { periodInMinutes: 0.5, delayInMinutes: 0.02 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "probe") probe().catch(() => {});
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
  if (details.frameId !== 0) return;

  let host = "";
  try {
    host = new URL(details.url).hostname;
  } catch {
    return;
  }
  if (host !== HOST) return;
  if (!RETRYABLE.some((prefix) => String(details.error).startsWith(prefix))) return;

  const s = await settings();
  if (!s.autoReload) return;

  const now = Date.now();
  const rec = navState.get(details.tabId) ?? { count: 0, windowStart: now };
  if (now - rec.windowStart > 60000) {
    rec.count = 0;
    rec.windowStart = now;
  }

  if (rec.count >= s.maxNavRetries) {
    navState.set(details.tabId, rec);
    await paint("STOP", "#6b7280", `VU · gave up after ${rec.count} retries · ${details.error}`);
    return;
  }

  rec.count += 1;
  navState.set(details.tabId, rec);

  const delay = Math.min(s.baseDelayMs * 2 ** (rec.count - 1), s.maxDelayMs) + Math.random() * 250;
  const target = details.url;

  setTimeout(() => {
    chrome.tabs.update(details.tabId, { url: target }).catch(() => {});
  }, delay);
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "vu-report") {
    (async () => {
      const stored = await chrome.storage.session.get({ stats: { reloads: 0, absorbed: 0 } });
      const stats = stored.stats;
      stats.reloads += msg.reloads ?? 0;
      stats.absorbed += msg.absorbed ?? 0;
      await chrome.storage.session.set({
        stats,
        lastReport: { ...msg, at: Date.now(), tabId: sender.tab?.id ?? -1 },
      });
      reply({ ok: true });
    })();
    return true;
  }

  if (msg?.type === "vu-status") {
    (async () => {
      reply(await chrome.storage.session.get(["lastProbe", "stats", "lastReport"]));
    })();
    return true;
  }

  return false;
});

probe().catch(() => {});
