// Small test framework + fake network for Dal. No real API or Wikipedia requests are made.
"use strict";

const T = { list: [], passed: 0, failed: 0, done: false, current: "" };
window.__T = T;

class AssertError extends Error {}
function assert(cond, msg) { if (!cond) throw new AssertError(msg || "assertion failed"); }
function eq(a, b, msg) { if (a !== b) throw new AssertError(`${msg || "eq"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new AssertError(`${msg || "near"}: expected ${b}±${tol}, got ${a}`); }
async function rejects(p, code, msg) {
  try { await p; } catch (e) { if (code && (!e || e.code !== code)) throw new AssertError(`${msg || "rejects"}: expected code ${code}, got ${JSON.stringify(e)}`); return e; }
  throw new AssertError(`${msg || "rejects"}: expected rejection${code ? " " + code : ""}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, msg, timeout = 8000) {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = fn(); } catch (e) { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new AssertError("timed out waiting for: " + (msg || fn.toString().slice(0, 80)));
    await wait(40);
  }
}

const suites = [];
function suite(name, fn) { suites.push({ name, fn }); }

function render(r) {
  const li = document.createElement("li");
  li.className = r.ok ? "ok" : "fail";
  li.textContent = `${r.ok ? "✓" : "✗"} ${r.suite} › ${r.name}${r.ok ? "" : " — " + r.error}`;
  document.getElementById("out").append(li);
}
async function runAll() {
  for (const s of suites) {
    const tests = [];
    const t = (name, fn) => tests.push({ name, fn });
    await s.fn(t);
    for (const x of tests) {
      T.current = `${s.name} › ${x.name}`;
      const r = { suite: s.name, name: x.name, ok: true };
      const t0 = Date.now();
      try { await x.fn(); } catch (e) { r.ok = false; r.error = e instanceof AssertError ? e.message : (e && (e.stack || e.message)) || JSON.stringify(e); }
      r.ms = Date.now() - t0;
      if (r.ok) T.passed++; else T.failed++;
      T.list.push(r);
      render(r);
    }
  }
  T.done = true;
  document.getElementById("sum").textContent = `${T.passed} geçti, ${T.failed} başarısız`;
  document.getElementById("sum").className = T.failed ? "fail" : "ok";
}

/* ---------------- The app in an iframe ---------------- */
let frame = null, W = null;
const A = (expr) => W.eval(expr); // evaluates in the app's global scope (sees const/let too)
const Q = (sel) => W.document.querySelector(sel);
const QA = (sel) => [...W.document.querySelectorAll(sel)];
function deleteTestDb() {
  return new Promise((res) => { const r = indexedDB.deleteDatabase("dal-test"); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}
async function loadApp({ fresh = true } = {}) {
  if (frame) { frame.remove(); frame = null; await wait(50); }
  if (fresh) { await deleteTestDb(); localStorage.removeItem("dal-api-key-test"); }
  frame = document.createElement("iframe");
  frame.style.cssText = "width:390px;height:760px;border:1px solid #ccc";
  document.getElementById("stage").append(frame);
  await new Promise((r) => { frame.onload = r; frame.src = "../index.html?test&t=" + Date.now(); });
  W = frame.contentWindow;
  installFakeNetwork(W);
  await waitFor(() => A("state.db") && A("state.uid"), "app database ready");
  await wait(100);
  return W;
}
// Script errors and unhandled promise rejections that the app itself logged.
const scriptErrors = () => (A("state.errlog") || []).filter((e) => e.where === "script" || e.where === "promise");
function noScriptErrors() { const e = scriptErrors(); assert(!e.length, "script errors: " + JSON.stringify(e.slice(0, 3))); }
function setKey() { W.localStorage.setItem("dal-api-key-test", "sk-ant-test-fake"); A("setupKeyBox()"); }

/* ---------------- Fake network ---------------- */
const NET = { calls: [], wiki: [], override: null, delayMs: 0 };
function installFakeNetwork(w) {
  const realFetch = w.fetch.bind(w);
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/")) return fakeAnthropic(w, opts);
    if (/^https:\/\/(en|tr)\.wikipedia\.org\//.test(u)) return fakeWiki(w, u, opts);
    return realFetch(url, opts);
  };
}
function sseResponse(w, text, { stop = "end_turn", model = "x", status = 200, chunk = 37 } = {}) {
  const events = [
    { type: "message_start", message: { model, usage: { input_tokens: 100 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  ];
  for (let i = 0; i < text.length; i += 23) events.push({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + 23) } });
  events.push({ type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 50 } }, { type: "message_stop" });
  const body = new TextEncoder().encode(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""));
  // Odd-sized chunks so the app's stream parser has to stitch events across chunk borders.
  const stream = new w.ReadableStream({ start(c) { for (let i = 0; i < body.length; i += chunk) c.enqueue(body.slice(i, i + chunk)); c.close(); } });
  return new w.Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}
const jsonResponse = (w, obj, status = 200) => new w.Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

function promptKind(p) {
  if (p.startsWith("<source>")) return "draft";
  if (p.startsWith("You are revising")) return "revise";
  if (p.startsWith("An editor replaced")) return "check";
  if (p.startsWith("A reader wants a text")) return p.includes("These English Wikipedia articles exist") ? "choose" : "hints";
  if (p.startsWith("You are adapting a section")) return "adapt";
  if (p.includes("List the specialist topic terms")) return "terms";
  if (p.startsWith("You help a Turkish learner of English who is reading")) return "lookup";
  if (p.startsWith("Break this English sentence")) return "structure";
  if (p.startsWith("Rewrite this sentence in simpler English")) return "simplify";
  if (p.includes("wrap the words that translate the expression")) return "translateUnit";
  if (p.startsWith("Translate this English sentence")) return "translate";
  if (p.includes("page image(s) from a document")) return "transcribe";
  return "other";
}
async function fakeAnthropic(w, opts) {
  const body = JSON.parse(opts.body);
  const content = body.messages[0].content;
  const prompt = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const call = {
    kind: promptKind(prompt), model: body.model, effort: body.output_config && body.output_config.effort,
    schema: !!(body.output_config && body.output_config.format), images: content.filter((c) => c.type === "image").length,
    beta: opts.headers["anthropic-beta"] || "", key: opts.headers["x-api-key"], prompt,
  };
  NET.calls.push(call);
  if (NET.delayMs) await new Promise((r, rej) => {
    const t = setTimeout(r, NET.delayMs);
    if (opts.signal) opts.signal.addEventListener("abort", () => { clearTimeout(t); rej(new w.DOMException("aborted", "AbortError")); });
  });
  if (opts.signal && opts.signal.aborted) throw new w.DOMException("aborted", "AbortError");
  if (NET.override) {
    const o = NET.override(call);
    if (o) {
      if (o.throwNetwork) throw new w.TypeError("Failed to fetch");
      if (o.status && o.status !== 200) return jsonResponse(w, { type: "error", error: { type: "x", message: o.message || "err" } }, o.status);
      return sseResponse(w, o.text, { stop: o.stop, model: body.model });
    }
  }
  const out = RESPOND[call.kind] ? RESPOND[call.kind](prompt, call) : "{}";
  return sseResponse(w, typeof out === "string" ? out : JSON.stringify(out), { model: body.model });
}
const between = (s, a, b) => { const i = s.indexOf(a); if (i < 0) return ""; const j = s.indexOf(b, i + a.length); return s.slice(i + a.length, j < 0 ? undefined : j); };
const RESPOND = {
  hints: (p) => {
    const topic = between(p, 'English): "', '"');
    const t = FIX.hints[topic] || { titles: [topic], query: topic, keywords: [] };
    return t;
  },
  choose: (p) => {
    const topic = between(p, 'English): "', '"');
    if (FIX.chooseNone.includes(topic)) return { pick: [] };
    const lines = p.split("\n").filter((l) => /^\d+\. /.test(l));
    const want = (FIX.hints[topic] || { titles: [] }).titles;
    const idx = lines.findIndex((l) => want.some((t) => l.startsWith(l.match(/^\d+\. /)[0] + t)));
    return { pick: [idx >= 0 ? idx + 1 : 1] };
  },
  draft: (p) => {
    const titles = [...p.matchAll(/^# (.+)$/gm)].map((m) => m[1]);
    return FIX.draft(titles[0] || "Topic");
  },
  revise: (p) => ({ swaps: FIX.swapPairs.filter(([o]) => p.includes(o)).map(([o, n]) => ({ old: o, new: n })) }),
  check: (p) => ({ ok: [...p.matchAll(/^(\d+)\.\nOriginal/gm)].map((m) => +m[1]) }),
  adapt: (p) => ({ paragraphs: FIX.adapted, terms: ["critical theory"] }),
  terms: () => ({ terms: ["dialectic"] }),
  lookup: (p) => {
    const w = between(p, 'Tapped word: "', '"') || between(p, 'in the sentence: "', '"') || "word";
    const lemma = w.replace(/\.\.\. /g, "").toLowerCase();
    return { text: w.replace(/\.\.\. /g, ""), lemma, type: "word", forms: [w, lemma + "s"], def: "a short simple definition", tr: "çeviri", cefr: "B2", sentence_tr: "Bu [[çeviri]] cümlesidir." };
  },
  translateUnit: () => ({ sentence: "Bu bir [[deneme]] cümlesidir.", unit: "deneme" }),
  structure: (p) => ({ parts: [{ text: between(p, 'Sentence: "', '"').split(" ").slice(0, 3).join(" ") || "part", role: "ana cümle", note: "Cümlenin ana fikri." }] }),
  simplify: () => "This is a simpler sentence. It keeps the meaning.",
  translate: () => "Bu, cümlenin Türkçe çevirisidir.",
  transcribe: () => FIX.transcribed,
};

async function fakeWiki(w, url, opts) {
  if (opts && opts.signal && opts.signal.aborted) throw new w.DOMException("aborted", "AbortError");
  const u = new URL(url);
  const lang = u.hostname.slice(0, 2);
  const p = Object.fromEntries(u.searchParams);
  NET.wiki.push({ lang, ...p });
  if (NET.wikiOverride) { const o = NET.wikiOverride(p); if (o) { if (o.throwNetwork) throw new w.TypeError("Failed to fetch"); return jsonResponse(w, o.body || {}, o.status || 200); } }
  const art = (t) => FIX.find(t);
  if (lang === "tr") return jsonResponse(w, { query: { pages: [] } });
  if (p.prop === "extracts") {
    const a = art(p.titles);
    return jsonResponse(w, { query: { pages: [a ? { title: a.title, extract: a.extract } : { title: p.titles, missing: true }] } });
  }
  if (p.generator === "search") {
    const hits = FIX.search(p.gsrsearch).map((a, i) => ({ title: a.title, index: i + 1, description: a.desc, ...(a.disambig ? { pageprops: { disambiguation: "" } } : {}) }));
    return jsonResponse(w, { query: { pages: hits } });
  }
  if (p.list === "search") return jsonResponse(w, { query: { search: FIX.search(p.srsearch).map((a) => ({ title: a.title })) } });
  if (p.titles) {
    const pages = p.titles.split("|").map((t) => {
      const a = art(t);
      if (!a) return { title: t, missing: true };
      return { title: a.title, description: a.desc, ...(a.disambig ? { pageprops: { disambiguation: "" } } : {}) };
    });
    return jsonResponse(w, { query: { pages } });
  }
  return jsonResponse(w, { query: {} });
}

/* ---------------- Fixtures ---------------- */
const SECTION = (h, body) => `\n\n== ${h} ==\n${body}`;
const LOREM = (topic, n) => Array.from({ length: n }, (_, i) => `${topic} is discussed in many books and articles. Scholars study its history, its main ideas and its effects on society. Part ${i + 1} explains how people understood ${topic} in different periods.`).join(" ");
const ARTICLES = [
  { title: "Frankfurt School", desc: "School of social theory", extract: `The Frankfurt School is a school of social theory and critical philosophy.` + SECTION("History", LOREM("the institute", 3)) + SECTION("Critical theory", "Critical theory criticises society. " + LOREM("critical theory", 3)) + SECTION("Culture industry", LOREM("the culture industry", 2)) + SECTION("See also", "Other things.") + SECTION("References", "Ref 1. Ref 2.") },
  { title: "Critical theory", desc: "Approach to social philosophy", extract: `Critical theory is an approach to social philosophy.` + SECTION("Overview", LOREM("critical theory", 3)) + SECTION("External links", "Links.") },
  { title: "Theodor W. Adorno", desc: "German philosopher (1903–1969)", extract: `Theodor W. Adorno was a German philosopher and sociologist.` + SECTION("Life", LOREM("Adorno", 3)) + SECTION("Works", LOREM("his work", 2)) },
  { title: "Mercury (planet)", desc: "First planet from the Sun", extract: `Mercury is the first planet from the Sun.` + SECTION("Orbit", LOREM("the orbit", 2)) },
  { title: "Mercury", desc: "Topics referred to by the same term", disambig: true, extract: "Mercury may refer to:" },
  { title: "Planet", desc: "Large astronomical object", extract: "A planet is a large object." + SECTION("Definition", LOREM("planets", 2)) },
];
const FIX = {
  find: (t) => ARTICLES.find((a) => a.title.toLowerCase() === String(t).toLowerCase()),
  search: (q) => { const ws = String(q).toLowerCase().split(/\s+/).filter((x) => x.length > 2); return ARTICLES.filter((a) => ws.some((w) => (a.title + " " + a.desc).toLowerCase().includes(w))).slice(0, 8); },
  hints: {
    "Frankfurt Okulu": { titles: ["Frankfurt School", "Critical theory"], query: "Frankfurt School critical theory", keywords: ["critical", "institute"] },
    "Merkür gezegeni": { titles: ["Mercury"], query: "Mercury planet", keywords: ["orbit"] },
    "asdf mavi kedi": { titles: ["Mercury"], query: "planet", keywords: [] },
  },
  chooseNone: ["asdf mavi kedi"],
  draft: (title) => ({
    insufficient: false, note: "", title: "About " + title, summary: "A short summary. It has two sentences.",
    paragraphs: [
      `The ${title} is an important topic in the study of society. Many people want to understand how it began and why it still matters today.`,
      `In the 1920s, a group of thinkers met in a German city. They wanted to study society in a new way, and they called their method "critical theory".`,
      `Theodor Adorno was one of the most famous members of the group. He wrote about music, culture and modern life, and his books are still read by students.`,
      `Today, many universities teach these ideas. Some people agree with them, while others think they are too pessimistic about the modern world.`,
    ],
    terms: ["critical theory"], sources: [title],
    branches: [
      { title: "Theodor W. Adorno", mention: "Theodor Adorno", type: "person", why: "Grubun en ünlü üyesi." },
      { title: "Critical theory", mention: "critical theory", type: "concept", why: "Grubun yöntemi." },
    ],
  }),
  swapPairs: [["important", "significant"], ["famous", "renowned"], ["study", "examine"], ["agree", "concur"]],
  adapted: ["This is the adapted first paragraph. It uses simple words for the reader.", "This is the adapted second paragraph. It keeps the same ideas in the same order."],
  transcribed: "## Chapter One\n\n" + LOREM("the old city", 4) + "\n\n" + LOREM("the river", 4),
  importText: "A Short Book\n\n## The First Part\n\n" + LOREM("the first idea", 5) + "\n\n" + LOREM("the second idea", 5) + "\n\n## The Second Part\n\n" + LOREM("the third idea", 6),
};

/* ---------------- Tiny PDF builder (text pages or blank pages) ---------------- */
function makePdf(pages) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesObj = add(null), font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = [];
  pages.forEach((lines) => {
    const ops = (lines || []).map((l, i) => `BT /F1 11 Tf 50 ${760 - i * 16} Td (${l.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
    const stream = add(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}
function setFile(input, blob, name, type) {
  const dt = new W.DataTransfer();
  dt.items.add(new W.File([blob], name, { type }));
  input.files = dt.files;
  input.dispatchEvent(new W.Event("change", { bubbles: true }));
}
