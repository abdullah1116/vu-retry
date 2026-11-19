import fs from "node:fs";
import vm from "node:vm";

const source = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const RETRY503 = source("content/retry503.js");
const FETCHPATCH = source("content/fetchpatch.js");

function retry503(bodyText, stored, dataset) {
  const timers = [];
  const el = { id: "", style: {}, textContent: "" };
  const store = { v: stored ?? null };
  const ctx = {
    document: {
      body: { innerText: bodyText },
      documentElement: { dataset, appendChild() {} },
      getElementById: () => null,
      createElement: () => el,
    },
    sessionStorage: {
      getItem: () => store.v,
      setItem: (_k, v) => { store.v = String(v); },
      removeItem: () => { store.v = null; },
    },
    chrome: { runtime: { sendMessage: () => Promise.resolve() } },
    location: { reload: () => {} },
    setTimeout: (_fn, ms) => { timers.push(ms); return 1; },
    setInterval: () => 2,
    clearInterval: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(RETRY503, ctx, { filename: "content/retry503.js" });
  return { timers, store: store.v, banner: el.textContent };
}

async function fetchPatch(dataset) {
  const calls = [];
  const el = { textContent: "" };
  class FakeXHR {
    open() {}
    send() {}
    setRequestHeader() {}
    addEventListener() {}
  }
  const ctx = {
    document: {
      documentElement: { dataset },
      createElement: () => el,
    },
    XMLHttpRequest: FakeXHR,
    window: null,
    Request,
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    setTimeout,
    clearTimeout,
    Promise,
    Math,
    Number,
    console,
  };
  ctx.fetch = async (input) => {
    calls.push(String(input));
    return { status: 503, ok: false };
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FETCHPATCH, ctx, { filename: "content/fetchpatch.js" });
  await ctx.window.fetch("https://datesheet.vu.edu.pk/x", { method: "GET" });
  return calls.length;
}

async function main() {
  const results = [];

  const a = retry503("The service is unavailable.", null, {});
  results.push(["503, no config", a.store === "1" && /1\/5\b/.test(a.banner), a.banner]);

  const b = retry503("The service is unavailable.", null, { vuPageReloads: "2" });
  results.push(["503, pageReloads=2", b.store === "1" && /1\/2\b/.test(b.banner), b.banner]);

  const c = retry503("The service is unavailable.", "2", { vuPageReloads: "2" });
  results.push(["cap 2 reached", c.timers.length === 0 && /gave up/.test(c.banner), c.banner]);

  const d = retry503("The service is unavailable.", null, { vuPageReloads: "0" });
  results.push(["pageReloads=0 disables", d.timers.length === 0, d.banner]);

  const e = retry503("Login : VULMS " + "x".repeat(400), "4", {});
  results.push(["healthy page", e.timers.length === 0 && e.store === null, "(silent)"]);

  const n3 = await fetchPatch({});
  results.push(["fetch default cap", n3 === 4, `network calls=${n3} (1 + 3 retries)`]);

  const n1 = await fetchPatch({ vuFetchRetries: "1" });
  results.push(["fetch cap=1", n1 === 2, `network calls=${n1} (1 + 1 retry)`]);

  const n0 = await fetchPatch({ vuFetchRetries: "0" });
  results.push(["fetch cap=0", n0 === 1, `network calls=${n0} (no retry)`]);

  for (const [name, ok, detail] of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(24)} ${detail}`);
  }

  const passed = results.every((r) => r[1]);
  console.log(passed ? "\nALL PASS" : "\nFAILURES PRESENT");
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL  harness error: ${err?.stack ?? err}`);
  process.exit(1);
});
