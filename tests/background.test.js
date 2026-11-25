import fs from "node:fs";
import vm from "node:vm";

const source = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const BACKGROUND = source("background.js");

function harness() {
  const updates = [];
  const fetches = [];
  const queries = [];
  const listeners = {};
  const session = {};

  const capture = (key) => (fn) => {
    listeners[key] = fn;
  };

  const ctx = {
    chrome: {
      runtime: {
        onInstalled: { addListener: capture("onInstalled") },
        onStartup: { addListener: capture("onStartup") },
        onMessage: { addListener: capture("onMessage") },
        openOptionsPage: async () => {},
      },
      alarms: {
        onAlarm: { addListener: capture("onAlarm") },
        create: () => {},
      },
      action: {
        onClicked: { addListener: capture("onClicked") },
        setBadgeText: async () => {},
        setBadgeBackgroundColor: async () => {},
        setTitle: async () => {},
      },
      storage: {
        local: { get: async () => ({}) },
        session: {
          get: async (keys) => {
            if (keys && typeof keys === "object" && !Array.isArray(keys)) return { ...keys };
            if (typeof keys === "string") return keys in session ? { [keys]: session[keys] } : {};
            return {};
          },
          set: async (items) => {
            Object.assign(session, items);
          },
          remove: async (key) => {
            delete session[key];
          },
        },
      },
      tabs: {
        query: async (args) => {
          queries.push(args);
          return harness.tabsResult;
        },
        update: async (id, props) => {
          updates.push({ id, props });
        },
        onRemoved: { addListener: capture("onRemoved") },
      },
      webNavigation: {
        onErrorOccurred: { addListener: capture("onErrorOccurred") },
      },
    },
    URL,
    fetch: async (url) => {
      fetches.push(String(url));
      return { status: 200, type: "basic" };
    },
    AbortController,
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
    setImmediate,
    console,
    Promise,
    Math,
    Number,
    String,
    Date,
  };

  harness.tabsResult = [];

  vm.createContext(ctx);
  vm.runInContext(BACKGROUND, ctx, { filename: "background.js" });

  return { listeners, updates, fetches, queries, session };
}

const drain = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  const results = [];
  const { listeners, updates, fetches, queries } = harness();

  const onError = listeners.onErrorOccurred;
  const onAlarm = listeners.onAlarm;

  const fire = async (details) => {
    updates.length = 0;
    await onError(details);
    await drain();
    return updates.length;
  };

  const a = await fire({
    frameId: 0,
    tabId: 1,
    url: "https://lms.vu.edu.pk/quiz",
    error: "net::ERR_EMPTY_RESPONSE",
  });
  results.push(["subdomain retry", a === 1 && updates[0].props.url === "https://lms.vu.edu.pk/quiz", `${a} update(s)`]);

  const b = await fire({ frameId: 0, tabId: 2, url: "https://vu.edu.pk/", error: "net::ERR_CONNECTION_RESET" });
  results.push(["bare domain retry", b === 1, `${b} update(s)`]);

  const c = await fire({ frameId: 0, tabId: 3, url: "https://a.b.vu.edu.pk/x", error: "net::ERR_TIMED_OUT" });
  results.push(["nested subdomain retry", c === 1, `${c} update(s)`]);

  const d = await fire({ frameId: 0, tabId: 4, url: "https://vu.edu.pk.evil.com/", error: "net::ERR_EMPTY_RESPONSE" });
  results.push(["lookalike suffix rejected", d === 0, `${d} update(s)`]);

  const e = await fire({ frameId: 0, tabId: 5, url: "https://notvu.com/", error: "net::ERR_EMPTY_RESPONSE" });
  results.push(["unrelated host rejected", e === 0, `${e} update(s)`]);

  const f = await fire({ frameId: 2, tabId: 6, url: "https://lms.vu.edu.pk/x", error: "net::ERR_EMPTY_RESPONSE" });
  results.push(["subframe ignored", f === 0, `${f} update(s)`]);

  harness.tabsResult = [{ url: "https://vulms.vu.edu.pk/foo" }];
  fetches.length = 0;
  queries.length = 0;
  onAlarm({ name: "probe" });
  await drain();
  results.push([
    "probe fetches tab origin",
    fetches.length === 1 && fetches[0] === "https://vulms.vu.edu.pk/",
    fetches[0] ?? "(no fetch)",
  ]);
  results.push([
    "probe queries subdomain pattern",
    queries.length === 1 && queries[0]?.url === "*://*.vu.edu.pk/*",
    queries[0]?.url ?? "(no query)",
  ]);

  harness.tabsResult = [{ url: "https://example.com/" }];
  fetches.length = 0;
  onAlarm({ name: "probe" });
  await drain();
  results.push(["probe skips non-VU tab", fetches.length === 0, `${fetches.length} fetch(es)`]);

  for (const [name, ok, detail] of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(28)} ${detail}`);
  }

  const passed = results.every((r) => r[1]);
  console.log(passed ? "\nALL PASS" : "\nFAILURES PRESENT");
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL  harness error: ${err?.stack ?? err}`);
  process.exit(1);
});
