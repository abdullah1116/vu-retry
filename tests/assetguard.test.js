import fs from "node:fs";
import vm from "node:vm";

const source = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const TOAST = source("content/toast.js");
const ASSETGUARD = source("content/assetguard.js");

function harness({ stored = null, dataset = {}, fields = [], guard = true } = {}) {
  const timers = [];
  const nodes = [];
  const reloads = [];
  const store = { v: stored };
  const clock = { t: 1_700_000_000_000 };
  let listener = null;
  let capture = null;

  const make = (tag) => {
    const node = {
      tagName: tag,
      id: "",
      style: {},
      dataset: {},
      textContent: "",
      children: [],
      appendChild(child) { this.children.push(child); },
    };
    nodes.push(node);
    return node;
  };
  const byId = (id) => nodes.find((node) => node.id === id) ?? null;

  const ctx = {
    document: {
      documentElement: { dataset, appendChild() {} },
      querySelectorAll: () => fields,
      getElementById: byId,
      createElement: make,
    },
    sessionStorage: {
      getItem: () => store.v,
      setItem: (_k, v) => { store.v = String(v); },
      removeItem: () => { store.v = null; },
    },
    chrome: { runtime: { sendMessage: () => Promise.resolve() } },
    location: {
      href: "https://vulms.vu.edu.pk/page",
      reload: () => { reloads.push(1); },
    },
    setTimeout: (fn, ms) => { timers.push([fn, ms]); return 1; },
    URL,
    Math,
    Number,
    String,
    Promise,
    console,
    Date: { now: () => clock.t },
  };
  ctx.window = ctx;
  ctx.addEventListener = (type, fn, isCapture) => {
    listener = fn;
    capture = isCapture;
  };
  vm.createContext(ctx);
  vm.runInContext(TOAST, ctx, { filename: "content/toast.js" });
  if (guard) vm.runInContext(ASSETGUARD, ctx, { filename: "content/assetguard.js" });

  return {
    store,
    timers,
    reloads,
    clock,
    toast: typeof ctx.window.__vuBar === "function",
    capture: () => capture,
    fire: (target) => listener({ target }),
    advance: (ms) => { clock.t += ms; },
    title: () => byId("__vu-retry-title")?.textContent ?? "",
    sub: () => byId("__vu-retry-sub")?.textContent ?? "",
  };
}

async function main() {
  const results = [];

  const toastOnly = harness({ guard: false });
  results.push(["toast exposes __vuBar", toastOnly.toast, "shared global present"]);

  const a = harness();
  a.fire({ tagName: "SCRIPT", src: "https://vulms.vu.edu.pk/app.js" });
  const aMs = a.timers[0]?.[1] ?? 0;
  a.timers[0]?.[0]();
  results.push([
    "script error reload",
    a.timers.length === 1 && a.store.v === "1" && aMs >= 500 && aMs < 800 && a.reloads.length === 1,
    `${a.timers.length} timer(s), store=${a.store.v}, ${aMs.toFixed(0)}ms, ${a.reloads.length} reload(s)`,
  ]);
  results.push(["script banner", a.title() === "asset failed to load" && /1\/5/.test(a.sub()), `${a.title()} / ${a.sub()}`]);

  const b = harness();
  b.fire({ tagName: "LINK", href: "https://vu.edu.pk/site.css" });
  results.push(["stylesheet error reload", b.timers.length === 1 && b.store.v === "1", `${b.timers.length} timer(s)`]);

  const c = harness();
  c.fire({ tagName: "SCRIPT", src: "https://cdn.example.com/lib.js" });
  results.push(["third-party ignored", c.timers.length === 0 && c.store.v === null, `${c.timers.length} timer(s)`]);

  const d = harness();
  d.fire({ tagName: "SCRIPT", src: "https://vu.edu.pk.evil.com/x.js" });
  results.push(["lookalike ignored", d.timers.length === 0 && d.store.v === null, `${d.timers.length} timer(s)`]);

  const e = harness();
  e.advance(6000);
  e.fire({ tagName: "SCRIPT", src: "https://vulms.vu.edu.pk/late.js" });
  results.push(["late error ignored", e.timers.length === 0, `${e.timers.length} timer(s)`]);

  const f = harness({ fields: [{ value: "exam answer", defaultValue: "" }] });
  f.fire({ tagName: "SCRIPT", src: "https://vulms.vu.edu.pk/app.js" });
  results.push(["dirty input skips", f.timers.length === 0 && f.store.v === null, `${f.timers.length} timer(s)`]);

  const g = harness({ fields: [{ value: "same", defaultValue: "same" }] });
  g.fire({ tagName: "SCRIPT", src: "https://vulms.vu.edu.pk/app.js" });
  results.push(["pristine input reloads", g.timers.length === 1, `${g.timers.length} timer(s)`]);

  const h = harness({ stored: "5" });
  h.fire({ tagName: "SCRIPT", src: "https://vulms.vu.edu.pk/app.js" });
  results.push(["budget exhausted", h.timers.length === 0 && h.title() === "gave up", `${h.title()} / ${h.sub()}`]);

  const i = harness();
  i.fire({ tagName: "SCRIPT", src: "https://vulms.vu.edu.pk/a.js" });
  i.fire({ tagName: "SCRIPT", src: "https://lms.vu.edu.pk/b.js" });
  results.push(["one reload per page", i.timers.length === 1 && i.store.v === "1", `${i.timers.length} timer(s)`]);

  const j = harness({ dataset: { vuPageReloads: "0" } });
  j.fire({ tagName: "SCRIPT", src: "https://vulms.vu.edu.pk/app.js" });
  results.push(["pageReloads=0 disables", j.timers.length === 0 && j.title() === "" && j.sub() === "", `${j.timers.length} timer(s)`]);

  const k = harness();
  k.fire({ tagName: undefined });
  results.push([
    "capture listener, non-element ignored",
    k.capture() === true && k.timers.length === 0,
    `capture=${k.capture()}, ${k.timers.length} timer(s)`,
  ]);

  for (const [name, ok, detail] of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${detail}`);
  }

  const passed = results.every((r) => r[1]);
  console.log(passed ? "\nALL PASS" : "\nFAILURES PRESENT");
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL  harness error: ${err?.stack ?? err}`);
  process.exit(1);
});
