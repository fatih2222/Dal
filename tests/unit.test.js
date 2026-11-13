// Unit tests: pure logic and the app's own layers, against a fresh app in test mode.
"use strict";

suite("Hazırlık", (t) => {
  t("uygulama test modunda açılıyor", async () => {
    await loadApp();
    eq(A("TEST_MODE"), true, "test mode");
    eq(A("KEY_LS"), "dal-api-key-test", "separate key slot");
    assert(!Q("#home").hidden, "home visible");
    assert(Q("#noDb").hidden, "database available");
    noScriptErrors();
  });
});

suite("Kelime seviyeleri (Aşama 2)", (t) => {
  const lv = (w) => A("wordLevel")(w), info = (w) => A("wordInfo")(w);
  t("kalıptan düşen kelimeler geri geldi", () => { eq(lv("according"), 3, "according = B1"); eq(lv("polar"), 4); });
  t("kök bulma: born, cannot, iyelik, -ves, sıra sayısı, tek harfli ön ek", () => {
    assert(lv("born") > 0, "born"); eq(lv("cannot"), lv("can"), "cannot");
    eq(lv("children's"), lv("child"), "children's"); eq(lv("wolves"), lv("wolf"), "wolves");
    eq(lv("seventh"), lv("seven"), "seventh"); eq(lv("twentieth"), lv("twenty"), "twentieth");
    eq(lv("e-cigarette"), lv("cigarette"), "e-cigarette");
  });
  t("listede olmayan kelimeye sıklıktan seviye, işaretli", () => {
    const b = info("bacteria"); assert(b && b.freq, "bacteria has a frequency level"); assert(b.l >= 2 && b.l <= 5, "level " + b.l);
    assert(!info("the").freq, "list words are not marked");
    eq(info("xqzzv"), null, "nonsense stays off-list");
  });
  t("sıklık seviyeleri puan ölçeğini değiştirmiyor", () => {
    let n = 0; A("LEXMAP").forEach(() => n++);
    const c = A("FREQMAP"); let overlap = 0; c.forEach((_, w) => { if (A("LEXMAP").has(w)) overlap++; });
    eq(overlap, 0, "no word in both"); assert(n > 8000, "list size intact");
  });
  t("Türkçe ortak kelime en fazla B1, kartta belirtiliyor", () => {
    const d = info("ideology"); eq(d.l, 3); eq(d.cog, true); eq(d.listL, 4, "B2 in the list");
    eq(info("ideologies").l, 3, "inflected form too");
    eq(info("democracy").cog, undefined, "already B1 or easier: untouched");
    assert(A("unitLevelLabel")({ lemma: "ideology" }).includes("B2, Türkçede de var"), "label");
    assert(!info("chemical") || !info("chemical").cog, "false friend excluded");
    eq(info("house").cog, undefined, "easy words untouched");
  });
  t("sıklıktan gelen konu terimleri hâlâ hesaba katılmıyor", () => {
    const p = ["The bacteria live in the soil. Scientists study the bacteria in many places around the world."];
    const withT = A("measure")(p, 47, ["bacteria"]), without = A("measure")(p, 47, []);
    assert(withT.n < without.n, `term left out: ${withT.n} < ${without.n}`);
  });
  t("cümle başındaki büyük harfli sıklık kelimesi isim sayılıyor", () => {
    const m = A("measure")(["London is big. We like it."], 47, []);
    eq(m.n, 5, "London left out: " + m.n);
  });
  t("geçmiş yeni ölçekle bir kez yeniden hesaplanıyor", () => {
    const s = A("state.settings"), lib = A("state.library");
    const keep = { h: s.history, v: s.scoreV };
    lib.push({ kind: "text", id: "rs1", finished: true, paragraphs: ["The democracy of the country was strong and the people were happy with it."], target: 47, terms: [], taps: [], result: { text: 99, reader: 99 } });
    s.history = [{ id: "rs1", text: 99, reader: 99, at: 1 }]; delete s.scoreV;
    A("rescoreHistory()");
    assert(s.history[0].text < 99, "rescored: " + s.history[0].text); eq(s.scoreV, A("SCORE_V"));
    const once = s.history[0].text; s.history[0].text = 1; A("rescoreHistory()"); eq(s.history[0].text, 1, "runs only once");
    lib.splice(lib.findIndex((d) => d.id === "rs1"), 1); s.history = keep.h; s.scoreV = keep.v;
  });
});

suite("Puan hesabı", (t) => {
  const easy = ["The cat is on the bed. My mother has a big house and a small car.", "We go to school every day. I like to play with my friends in the park."];
  const hard = ["The epistemological ramifications of hegemonic discourse necessitate a rigorous interrogation of ostensibly neutral paradigms.", "Contemporary scholarship scrutinises the ideological underpinnings that perpetuate entrenched socioeconomic stratification."];
  t("kolay metin zor metinden düşük puan alıyor", () => {
    const m1 = A("measure")(easy, 40, []), m2 = A("measure")(hard, 40, []);
    assert(m1.score < m2.score, `easy ${m1.score} < hard ${m2.score}`);
  });
  t("seviye sayıları kelime sayısıyla tutarlı", () => {
    const m = A("measure")(easy, 40, []);
    assert(m.n > 0, "counts words");
    const sum = m.counts.reduce((a, b) => a + b, 0);
    assert(sum <= m.n + 1 && sum > 0, `counts ${sum} vs n ${m.n}`);
  });
  t("konu terimleri puanı yükseltmiyor", () => {
    const p = ["Hegemony is a key idea here. People talk about hegemony in class and at home."];
    const withT = A("measure")(p, 40, ["hegemony"]), without = A("measure")(p, 40, []);
    assert(withT.score <= without.score, `${withT.score} <= ${without.score}`);
  });
  t("seviye adları sınırlarda doğru", () => {
    eq(A("scoreName")(1), "A1"); eq(A("scoreName")(99), "C2");
  });
});

suite("PDF ligatürleri", (t) => {
  const LIGTEXT = "The signiﬁcant ﬁrst ﬂow of eﬀort was oﬃcial. Many people agree with it today.";
  t("ligatür harfleri normal harfe çevriliyor", () => eq(A("fixLig")("signiﬁcant ﬂow eﬀort oﬃce"), "significant flow effort office"));
  t("yapıştırılan metinde kelimeler bölünmüyor", () => {
    const blocks = A("textToBlocks")(LIGTEXT + "\n\nSecond paragraph with enough words to be a real paragraph of text here.");
    assert(blocks[0].paras[0].includes("significant first flow of effort was official"), blocks[0].paras[0]);
  });
  t("puan temiz metinle aynı", () => {
    const fixed = A("textToBlocks")(LIGTEXT)[0].paras;
    const clean = ["The significant first flow of effort was official. Many people agree with it today."];
    eq(Math.round(A("measure")(fixed, 47, []).score), Math.round(A("measure")(clean, 47, []).score));
  });
  t("kayıtlı belge onarılıyor, dokunuşlar doğru kelimede kalıyor", () => {
    // Old tokens: The signi cant rst ow of e ort was o cial Many people agree with it today
    const WORD_RE = A("WORD_RE");
    const d = { kind: "text", paragraphs: [LIGTEXT], title: "Oﬃce", taps: [
      { key: "u:agree", idx: [13] }, { key: "u:significant", idx: [1, 2] }, { key: "u:official", idx: [9] },
    ] };
    eq((d.paragraphs[0].match(WORD_RE) || [])[13], "agree", "old position of agree");
    assert(A("ligDoc")(d), "changed");
    const words = d.paragraphs[0].match(WORD_RE);
    eq(words[d.taps[0].idx[0]], "agree", "agree still tapped");
    eq(JSON.stringify(d.taps[1].idx), "[1]", "two halves became one word"); eq(words[1], "significant");
    eq(words[d.taps[2].idx[0]], "official");
    eq(d.title, "Office", "title fixed");
  });
  t("uyarlanmış ve orijinal görünümler de onarılıyor", () => {
    const d = { kind: "text", paragraphs: ["ok text"], views: { orig: { paragraphs: ["ﬁrst word here"], taps: [{ idx: [2] }] } } };
    assert(A("ligDoc")(d)); eq(d.views.orig.paragraphs[0], "first word here"); eq(d.views.orig.taps[0].idx[0], 2);
  });
  t("ligatürsüz belgeye dokunulmuyor", () => eq(A("ligDoc")({ kind: "text", paragraphs: ["Plain text."], taps: [{ idx: [0] }] }), false));
});

suite("Cümle bölme", (t) => {
  t("noktalama ve tırnaklarla doğru bölüyor", () => {
    const s = A("splitSentences")('He left. She said "Yes." Then it rained! Did it stop? 1990 was hot.');
    eq(s.length, 5, "sentence count");
  });
  t("kısaltmasız tek cümle bölünmüyor", () => eq(A("splitSentences")("Just one sentence here").length, 1));
});

suite("Kelime değişiklikleri", (t) => {
  const paras = ["The important idea is clear. Many important people agree with the idea.", "In 1945 the war ended."];
  t("değişikliği metinde buluyor ve cümleyi kuruyor", () => {
    const c = A("locateSwaps")(paras, [{ old: "important idea", new: "key idea" }], []);
    eq(c.length, 1); eq(c[0].after, "The key idea is clear.");
  });
  t("sayı içeren ve konu terimine dokunan değişiklikleri reddediyor", () => {
    const c = A("locateSwaps")(paras, [{ old: "In 1945", new: "In 1946" }, { old: "the idea", new: "the thought" }], ["idea"]);
    eq(c.length, 0);
  });
  t("aynı yeri iki kez değiştirmiyor", () => {
    const c = A("locateSwaps")(paras, [{ old: "important idea", new: "key idea" }, { old: "important", new: "main" }], []);
    eq(c.length, 2, "second swap goes to the next free occurrence");
    assert(c[1].before.includes("Many important people"), "second occurrence used");
  });
  t("sadece hedefe yaklaştıran değişiklikleri uyguluyor", () => {
    const hardP = ["The ostensibly rigorous interrogation was ubiquitous. Scholars scrutinise it."];
    const m0 = A("measure")(hardP, 30, []);
    const cands = A("locateSwaps")(hardP, [{ old: "ostensibly rigorous", new: "careful" }, { old: "ubiquitous", new: "common" }], []);
    const res = A("applySwaps")(hardP, cands, 30, [], m0);
    assert(res.m.score <= m0.score, `score did not rise: ${m0.score} -> ${res.m.score}`);
  });
});

suite("Wikipedia bölümleri", (t) => {
  const ex = "Intro line.\n\n== History ==\nOld times about the institute.\n\n=== Early ===\nEarly days.\n\n== See also ==\nX\n\n=== Sub of junk ===\nY\n\n== Legacy ==\nThe institute today.";
  t("kaynakça ve alt bölümlerini atıyor", () => {
    const s = A("wikiSections")(ex).map((x) => x.head);
    eq(JSON.stringify(s), JSON.stringify(["", "History", "Early", "Legacy"]));
  });
  t("kelime sınırına uyuyor ve ilgili bölümü öne alıyor", () => {
    const big = (w, n) => Array.from({ length: n }, () => w).join(" ");
    const arts = [{ title: "A", sections: [{ head: "", level: 1, text: "intro " + big("x", 50), idx: 0 }, { head: "Unrelated", level: 2, text: big("y", 900), idx: 1 }, { head: "Urbanisation", level: 2, text: "cities " + big("cities", 300), idx: 2 }] }];
    const out = A("pickSections")(arts, ["cities"], 600);
    assert(A("wcount")(out) <= 640, "budget respected: " + A("wcount")(out));
    assert(out.includes("== Urbanisation =="), "relevant section picked");
  });
  t("Türkçe karakterleri sadeleştiriyor", () => eq(A("fold")("Şımarık İğne"), "simarik igne"));
});

suite("Okur seviyesi", (t) => {
  t("elle girilen seviye yeni başlangıç oluyor", () => {
    const s = A("state.settings");
    const keep = JSON.stringify({ h: s.history, r: s.levelReset });
    s.history = [{ id: "a", text: 40, reader: 40, at: 1000 }, { id: "b", text: 40, reader: 40, at: 2000 }];
    s.levelReset = { at: 3000, value: 60 };
    near(A("readerLevel")(), 60, 0.01, "after reset");
    s.history.push({ id: "c", text: 62, reader: 64, at: 4000 });
    const lv = A("readerLevel")();
    assert(lv > 60 && lv < 64, "moves gradually: " + lv);
    const k = JSON.parse(keep); s.history = k.h; if (k.r) s.levelReset = k.r; else delete s.levelReset;
  });
  t("tek metin sonucu makul aralıkta kalıyor", () => {
    const d = { taps: [] };
    const m = A("measure")(["The cat is on the bed and the dog is in the garden today."], 40, []);
    const r = A("readerResult")(d, m);
    assert(r.reader >= m.score - 15 && r.reader <= m.score + 6, "bounded");
  });
});

suite("Hata mesajları", (t) => {
  for (const [code, piece] of [["no_key", "API anahtarı"], ["bad_key", "geçersiz"], ["offline", "İnternet"], ["overloaded", "yoğun"], ["rate_limited", "Çok sık"], ["refusal", "reddedildi"], ["invalid_json", "beklenen biçimde"]]) {
    t(`${code} için Türkçe mesaj`, () => assert(A("errorCopy")({ code }, "Metin").includes(piece), A("errorCopy")({ code }, "Metin")));
  }
});

suite("Veritabanı", (t) => {
  t("kaydet, oku, sil", async () => {
    const c = A("col()");
    await c.doc("zz1").set({ kind: "probe", v: 1 });
    await c.doc("zz2").set({ kind: "probe", v: 2 });
    let docs = (await c.get()).docs.map((d) => d.data()).filter((d) => d.kind === "probe");
    eq(docs.length, 2, "two saved");
    await c.doc("zz1").delete();
    docs = (await c.get()).docs.map((d) => d.data()).filter((d) => d.kind === "probe");
    eq(docs.length, 1, "one left"); eq(docs[0].v, 2);
    await c.doc("zz2").delete();
  });
  t("başka koleksiyonun belgelerini karıştırmıyor", async () => {
    const db = A("state.db");
    await db.collection("other").doc("x").set({ kind: "probe" });
    const mine = (await A("col()").get()).docs.map((d) => d.data()).filter((d) => d.kind === "probe");
    eq(mine.length, 0);
    await db.collection("other").doc("x").delete();
  });
});

suite("API katmanı", (t) => {
  t("anahtar yoksa no_key", async () => {
    W.localStorage.removeItem("dal-api-key-test");
    await rejects(A("makeSample()")("hi", {}), "no_key");
  });
  t("akışı parça parça okuyor ve ilerleme bildiriyor", async () => {
    setKey();
    NET.calls = []; let seen = 0;
    NET.override = () => ({ text: "Hello world, this is a long streamed answer that crosses chunk borders." });
    const r = await A("state.sample")("anything", { modelTier: "quick", onText: () => seen++ });
    NET.override = null;
    eq(r.text, "Hello world, this is a long streamed answer that crosses chunk borders.");
    assert(seen > 1, "onText called several times");
    eq(NET.calls[0].model, "claude-haiku-5-5"); eq(NET.calls[0].key, "sk-ant-test-fake");
  });
  t("model ayarları: varsayılan ve hızlı Haiku, okuma Sonnet", () => {
    eq(A("TIERS.default.model"), "claude-haiku-5-5"); eq(A("TIERS.quick.model"), "claude-haiku-5-5"); eq(A("TIERS.vision.model"), "claude-sonnet-5-5");
  });
  t("şema verilince output_config.format gönderiyor", async () => {
    NET.calls = [];
    await A("state.sample.json")("You are revising x", { modelTier: "default", schema: A("SWAPS_SCHEMA") });
    eq(NET.calls[0].schema, true);
  });
  t("kod bloğu içindeki JSON'u ayıklıyor", async () => {
    NET.override = () => ({ text: "```json\n{\"a\": 1}\n```" });
    const r = await A("state.sample.json")("x", { modelTier: "quick" });
    NET.override = null; eq(r.a, 1);
  });
  t("bozuk JSON'da bir kez yeniden deniyor", async () => {
    let n = 0; NET.calls = [];
    NET.override = () => (++n === 1 ? { text: '{"old": "say "hi""}' } : { text: '{"ok": true}' });
    const r = await A("state.sample.json")("x", { modelTier: "quick" });
    NET.override = null;
    eq(r.ok, true); eq(NET.calls.length, 2, "two calls");
  });
  t("iki kez bozuk gelirse invalid_json", async () => {
    NET.override = () => ({ text: "not json" });
    await rejects(A("state.sample.json")("x", { modelTier: "quick" }), "invalid_json");
    NET.override = null;
  });
  t("401 tekrar denenmiyor, bad_key veriyor", async () => {
    NET.calls = []; NET.override = () => ({ status: 401, message: "invalid x-api-key" });
    await rejects(A("state.sample")("x", { modelTier: "quick" }), "bad_key");
    NET.override = null; eq(NET.calls.length, 1, "no retry");
  });
  t("529 yoğunlukta tekrar deneyip başarıyor", async () => {
    let n = 0; NET.calls = [];
    NET.override = () => (++n === 1 ? { status: 529 } : { text: "fine" });
    const r = await A("state.sample")("x", { modelTier: "quick" });
    NET.override = null;
    eq(r.text, "fine"); eq(NET.calls.length, 2);
  });
  t("ret (refusal) ayrı hata kodu veriyor", async () => {
    NET.override = () => ({ text: "", stop: "refusal" });
    await rejects(A("state.sample")("x", { modelTier: "quick" }), "refusal");
    NET.override = null;
  });
  t("iptal edilince cancelled", async () => {
    NET.delayMs = 2000;
    const ctl = new W.AbortController();
    const p = A("state.sample")("x", { modelTier: "quick", signal: ctl.signal });
    setTimeout(() => ctl.abort(), 50);
    await rejects(p, "cancelled");
    NET.delayMs = 0;
  });
  t("bağlantı yoksa network hatası", async () => {
    NET.override = () => ({ throwNetwork: true });
    const e = await rejects(A("state.sample")("x", { modelTier: "quick" }));
    NET.override = null;
    assert(e.code === "network" || e.code === "offline", "code " + e.code);
  });
  t("Sonnet isteğinde yedek model başlığı var, Haiku'da yok", async () => {
    NET.calls = [];
    await A("state.sample")("x", { modelTier: "vision" });
    await A("state.sample")("x", { modelTier: "quick" });
    eq(NET.calls[0].beta, "server-side-fallback-2026-07-01"); eq(NET.calls[1].beta, "");
  });
});

suite("Wikipedia seçimi", (t) => {
  t("Türkçe konu için gerçek adaylardan seçiyor", async () => {
    const s = await A("wikiSource")("Frankfurt Okulu");
    eq(s.titles[0], "Frankfurt School");
    assert(!s.text.includes("== See also =="), "junk removed");
  });
  t("dal başlığında yapay zekâya sormadan doğrudan madde", async () => {
    NET.calls = [];
    const s = await A("wikiSource")("Theodor W. Adorno", undefined, true);
    eq(s.title, "Theodor W. Adorno"); eq(NET.calls.length, 0, "no API call");
  });
  t("çok anlamlı sayfa aday listesine girmiyor", async () => {
    const c = await A("wikiCandidates")("Mercury planet", ["Mercury"]);
    assert(!c.some((x) => x.title === "Mercury"), "disambiguation excluded");
    assert(c.some((x) => x.title === "Mercury (planet)"), "planet found");
  });
  t("uygun madde yoksa seçenek döndürüyor", async () => {
    const s = await A("wikiSource")("asdf mavi kedi");
    eq(s.none, true); assert(s.options.length > 0, "options given");
  });
});

suite("Ağaç düzeni", (t) => {
  t("önce okunan dallar sonra öneriler, derinlik doğru", () => {
    const lib = A("state.library");
    const keep = lib.splice(0, lib.length);
    lib.push({ id: "r", title: "R", branches: [{ title: "S1" }, { title: "C", childId: "c" }], createdAt: 1 }, { id: "c", title: "C", parentId: "r", branches: [{ title: "S2" }], createdAt: 2 });
    const rows = []; A("treeRows")(A("byId")("r"), 0, null, rows);
    eq(rows.map((r) => r.key + ":" + r.depth).join(","), "r:0,c:1,c#0:2,r#0:1");
    lib.splice(0, lib.length, ...keep);
  });
});
