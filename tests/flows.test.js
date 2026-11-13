// Flow tests: the app is used like a person would, screen by screen, with the fake network.
"use strict";

const click = (sel) => { const e = typeof sel === "string" ? Q(sel) : sel; assert(e, "element not found: " + sel); e.click(); return e; };
const visible = (id) => Q("#" + id) && !Q("#" + id).hidden;
const callsOf = (k) => NET.calls.filter((c) => c.kind === k);
async function generateFromHome(topic) {
  Q("#topic").value = topic;
  Q("#askForm").requestSubmit();
  await waitFor(() => visible("reader") || (visible("home") && Q("#homeNotice")), "reader or home notice", 15000);
}

suite("Akış: metin üretme ve okuma", (t) => {
  t("anahtarsız: düğme kapalı, uyarı açık", async () => {
    await loadApp();
    eq(Q("#goBtn").disabled, true); assert(!Q("#noSample").hidden, "notice shown"); assert(Q("#keyBox").open, "key box open");
  });
  t("anahtar kaydedilince düğme açılıyor", () => {
    Q("#keyIn").value = "sk-ant-test-fake";
    click("#keySave");
    eq(Q("#goBtn").disabled, false); assert(Q("#noSample").hidden, "notice hidden");
    eq(W.localStorage.getItem("dal-api-key-test"), "sk-ant-test-fake");
  });
  t("Türkçe konudan metin üretiliyor ve okuyucu açılıyor", async () => {
    NET.calls = [];
    await generateFromHome("Frankfurt Okulu");
    assert(visible("reader"), "reader shown: " + (Q("#homeNotice") && Q("#homeNotice").textContent));
    assert(Q("#article h1").textContent.includes("Frankfurt School"), "title");
    assert(Q("#article .lvl").textContent.startsWith("Hedef"), "level line");
    eq(callsOf("draft").length, 1, "one draft"); eq(callsOf("draft")[0].model, "claude-haiku-5-5");
    assert(callsOf("draft")[0].prompt.includes("# Frankfurt School"), "source given to the model");
    noScriptErrors();
  });
  t("seviye düzeltmesi gerekirse şemalı istek gidiyor", () => {
    const rev = callsOf("revise"), chk = callsOf("check");
    if (rev.length) { assert(rev.every((c) => c.schema), "revise uses schema"); assert(chk.every((c) => c.schema), "check uses schema"); }
    const d = A("state.doc");
    assert(d.diag && d.diag.final && typeof d.diag.final.score === "number", "diagnostics stored");
  });
  t("kaynak ve dallar metnin sonunda", () => {
    const links = QA(".sources a").map((a) => a.textContent);
    eq(links[0], "Frankfurt School");
    assert(QA("#endBox .branch").length >= 1, "branches shown");
  });
  t("metin veritabanına kaydediliyor", async () => {
    const id = A("state.doc.id");
    A("flushSaves()");
    await waitFor(async () => true);
    await wait(900);
    const docs = (await A("col()").get()).docs.map((d) => d.data());
    assert(docs.some((d) => d.id === id && d.kind === "text"), "saved");
  });
  t("kelimeye dokununca kart açılıyor ve deftere giriyor", async () => {
    NET.calls = [];
    const w = QA("#article .text .w").find((x) => x.textContent === "pessimistic") || QA("#article .text .w")[5];
    w.click();
    await waitFor(() => Q("#sheet") && Q("#sheet").classList.length && !Q("#front .wait"), "card filled", 8000);
    assert(callsOf("lookup").length + callsOf("translateUnit").length >= 1, "lookup sent");
    assert(Q("#front").textContent.length > 5, "card has content");
    noScriptErrors();
  });
  t("cümle kartı: sadeleştirme, çeviri ve yapı", async () => {
    NET.calls = [];
    A("openSentence(0)");
    await waitFor(() => Q("#simpleBox") && !Q("#simpleBox .wait"), "simplified", 8000);
    await waitFor(() => Q("#sentTrBox") && Q("#sentTrBox").className === "sent", "translated", 8000);
    const sb = QA("#front .acts button").find((b) => b.textContent.includes("Yapısını"));
    assert(sb, "structure button");
    sb.click();
    await waitFor(() => Q("#structBox ol li"), "structure shown", 8000);
    assert(callsOf("structure").length === 1 && callsOf("simplify").length === 1 && callsOf("translate").length === 1, "three calls");
    A("closeCard()");
    noScriptErrors();
  });
  t("Bitirdim: sonuç ve okur seviyesi güncelleniyor", async () => {
    const before = A("state.settings.history.length");
    click("#endBox .finishbtn");
    await waitFor(() => Q("#endBox .result h2"), "result shown");
    eq(A("state.settings.history.length"), before + 1, "history grew");
    assert(Q("#endBox .result").textContent.includes("Okur seviyen şimdi"), "level text");
  });
  t("Bitirmeyi geri al", async () => {
    const b = QA("#endBox .result button").find((x) => x.textContent.includes("geri al"));
    b.click();
    await waitFor(() => Q("#endBox .finishbtn"), "finish button back");
    click("#endBox .finishbtn");
    await waitFor(() => Q("#endBox .result h2"), "finished again");
  });
});

suite("Akış: dallar ve ağaç", (t) => {
  t("öneri dalı açılınca alt metin üretiliyor", async () => {
    const parent = A("state.doc");
    NET.calls = [];
    const b = QA("#endBox .branch").find((x) => x.textContent.includes("Adorno"));
    assert(b, "Adorno branch");
    b.click();
    await waitFor(() => A("state.doc") && A("state.doc.parentId") === parent.id && visible("reader"), "child opened", 15000);
    eq(callsOf("hints").length, 0, "branch title used directly");
    assert(Q("#article .crumbs"), "breadcrumbs shown");
    assert(parent.branches.some((x) => x.childId === A("state.doc.id")), "parent links child");
  });
  t("ağaç görünümü: satırlar ve çizgiler", async () => {
    const root = A("rootOf(state.doc)");
    A(`showTree("${root}")`);
    await waitFor(() => QA("#tree .dlines path").length, "lines drawn");
    const rows = QA("#tree .drow").length, paths = QA("#tree .dlines path").length;
    eq(paths, rows - 1, "one line per non-root row");
    assert(QA("#tree .drow.sugg").length >= 1, "suggestions shown");
    eq(W.document.documentElement.scrollWidth, W.document.documentElement.clientWidth, "no sideways scroll");
  });
  t("Ağaçlar sekmesi listesi", async () => {
    click('#tabs button[data-v="trees"]');
    await waitFor(() => visible("trees"));
    eq(QA("#libList li").length, 1, "one tree");
    assert(Q("#libList li").textContent.includes("2 metin"), "count shown");
  });
  t("aynı dalı ikinci kez açınca soruyor", async () => {
    const root = A("byId(rootOf(state.doc))");
    A("openDoc")(root);
    const crit = QA("#endBox .branch").find((x) => x.textContent.includes("Critical"));
    // Make a library text with that title so the duplicate question appears.
    A("state.library").push({ kind: "text", id: "dupx", title: "Critical theory", paragraphs: ["Text."], branches: [], createdAt: 5 });
    crit.click();
    await waitFor(() => Q("#endBox .dupask"), "duplicate question");
    A("state.library").splice(A("state.library").findIndex((d) => d.id === "dupx"), 1);
  });
});

suite("Akış: defter ve tekrar", (t) => {
  t("Defter açılıyor ve kelime listede", async () => {
    click('#tabs button[data-v="notebook"]');
    await waitFor(() => visible("notebook"));
    assert(Object.keys(A("state.nb.words")).length >= 1, "word in notebook");
    noScriptErrors();
  });
  t("Tekrar: göster, hatırladım", async () => {
    click('#tabs button[data-v="review"]');
    await waitFor(() => visible("review"));
    const show = QA("#review button").find((b) => b.textContent.includes("Anlamını göster"));
    if (!show) { assert(Q("#review").textContent.includes("tekrar edilecek kelime yok"), "empty state"); return; }
    show.click();
    const yes = await waitFor(() => QA("#review button").find((b) => b.textContent === "Hatırladım"));
    yes.click();
    await waitFor(() => Q("#review .rvcard"));
    noScriptErrors();
  });
});

suite("Akış: kendi metnini getir", (t) => {
  t("yapıştırılan metin bölümlere ayrılıyor", async () => {
    click("#impOpen");
    Q("#impText").value = FIX.importText;
    click("#impGo");
    await waitFor(() => visible("importdoc"), "import page");
    assert(QA("#importdoc .seclist li").length >= 2, "sections listed");
  });
  t("orijinal bölüm açılınca terimler hazırlanıyor", async () => {
    NET.calls = [];
    const first = A("state.imports[0].sections[0]");
    A(`openDoc(byId("${first}"))`);
    await waitFor(() => callsOf("terms").length && A("state.doc.unitsReady"), "terms prepared");
    assert(Q("#article .lvl").textContent.startsWith("Orijinal metin"), "orig line");
  });
  t("Seviyeme uyarla: Haiku ile uyarlanıyor", async () => {
    NET.calls = [];
    const b = QA("#article .readtools .chip").find((x) => x.textContent === "Seviyeme uyarla");
    b.click();
    await waitFor(() => visible("reader") && A("state.doc.mode") === "adapt", "adapted", 15000);
    eq(callsOf("adapt")[0].model, "claude-haiku-5-5");
    assert(Q("#article .lvl").textContent.startsWith("Seviyene uyarlanmış"), "adapt line");
    assert(Q("#article .text").textContent.includes("adapted first paragraph"), "adapted text shown");
  });
  t("Orijinal'e geri dönüş", async () => {
    QA("#article .readtools .chip").find((x) => x.textContent === "Orijinal").click();
    await waitFor(() => A("state.doc.mode") === "orig");
    assert(!Q("#article .text").textContent.includes("adapted first paragraph"), "original text back");
  });
  t("Kitaplık rafında kitap görünüyor, yana kayma yok", async () => {
    click('#tabs button[data-v="library"]');
    await waitFor(() => visible("library"));
    eq(QA("#books .book").length, 1);
    eq(W.document.documentElement.scrollWidth, W.document.documentElement.clientWidth, "no sideways scroll");
  });
  t("fotoğraf: Sonnet ile okunuyor, metin kutusuna geliyor", async () => {
    NET.calls = [];
    click("#impOpen");
    const c = W.document.createElement("canvas"); c.width = 300; c.height = 400;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 300, 400); g.fillStyle = "#000"; g.fillText("Page text", 20, 40);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    setFile(Q("#impPhoto"), blob, "page.png", "image/png");
    await waitFor(() => Q("#impText").value.includes("Chapter One"), "transcribed text", 10000);
    const tc = callsOf("transcribe")[0];
    eq(tc.model, "claude-sonnet-5-5"); eq(tc.images, 1);
    click("#impGo");
    await waitFor(() => visible("importdoc"), "import page");
    eq(A("state.imports[0].source"), "photo");
  });
  t("metinli PDF: telefonda bedava okunuyor", async () => {
    NET.calls = [];
    click("#impOpen");
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of a real text page about the history of the river and the old city.`);
    setFile(Q("#impPdf"), makePdf([lines, lines]), "River Book.pdf", "application/pdf");
    await waitFor(() => visible("importdoc") || /açılamadı|alınamadı/.test(Q("#impMsg").textContent), "pdf imported", 20000);
    assert(visible("importdoc"), "import page: " + Q("#impMsg").textContent);
    eq(NET.calls.length, 0, "no API calls");
    assert(Q("#importdoc h1").textContent.includes("River Book"), "title from file name");
  });
  t("taranmış PDF: sayfalar resim olarak okunuyor", async () => {
    NET.calls = [];
    click("#impOpen");
    setFile(Q("#impPdf"), makePdf([null, null]), "Scan.pdf", "application/pdf");
    await waitFor(() => Q("#impText").value.includes("Chapter One") || /açılamadı|alınamadı/.test(Q("#impMsg").textContent), "scan read", 20000);
    const tc = callsOf("transcribe");
    eq(tc.length, 1, "one transcribe call"); eq(tc[0].images, 2, "two page images"); eq(tc[0].model, "claude-sonnet-5-5");
    click("#impGo");
    await waitFor(() => visible("importdoc"));
    eq(A("state.imports[0].source"), "scan");
    noScriptErrors();
  });
});

suite("Akış: hatalar ve kenar durumları", (t) => {
  t("geçersiz anahtar: anlaşılır mesaj", async () => {
    show_home();
    NET.override = (c) => (c.kind === "draft" ? { status: 401 } : null);
    await generateFromHome("Theodor W. Adorno");
    NET.override = null;
    assert(Q("#homeNotice") && Q("#homeNotice").textContent.includes("geçersiz"), "bad key message");
  });
  t("uygun madde yoksa seçenek öneriliyor, metin üretilmiyor", async () => {
    show_home(); NET.calls = [];
    await generateFromHome("asdf mavi kedi");
    assert(Q("#homeNotice").textContent.includes("Şunlardan birini"), Q("#homeNotice").textContent);
    eq(callsOf("draft").length, 0, "no draft");
  });
  t("Wikipedia'ya ulaşılamazsa mesaj", async () => {
    show_home();
    NET.wikiOverride = () => ({ throwNetwork: true });
    await generateFromHome("Theodor W. Adorno");
    NET.wikiOverride = null;
    assert(/ulaşılamadı|İnternet/.test(Q("#homeNotice").textContent), Q("#homeNotice").textContent);
  });
  t("Vazgeç ile üretim iptal ediliyor", async () => {
    show_home();
    NET.delayMs = 3000;
    Q("#topic").value = "Theodor W. Adorno"; Q("#askForm").requestSubmit();
    await waitFor(() => visible("loading"));
    await waitFor(() => callsOf("draft").length || NET.calls.length, "request sent", 4000).catch(() => {});
    click("#stopBtn");
    await waitFor(() => visible("home"), "back home");
    NET.delayMs = 0;
    assert(!Q("#homeNotice") || !Q("#homeNotice").textContent.includes("alınamadı"), "no error message after cancel");
  });
  t("okur seviyesini elle güncelleme", () => {
    show_home();
    Q("#readerIn").value = "58"; click("#readerSet");
    eq(Q("#gauge .gnum").textContent, "58");
    assert(Q("#levelInfo").textContent.includes("58"), "info mentions it");
    Q("#readerIn").value = ""; click("#readerSet");
    assert(Q("#readerMsg").textContent.includes("5 ile 95"), "validation message");
  });
  t("okuma ayarları: tema ve yazı boyutu", () => {
    const keepTheme = localStorage.getItem("dal-theme");
    A("openDoc(state.library.find(d => !d.importId))");
    click("#article .readtools button[aria-label='Okuma ayarları']");
    const dark = QA("#article .readpanel .chip").find((c) => c.textContent === "Koyu");
    dark.click();
    eq(W.document.documentElement.getAttribute("data-dal"), "dark");
    QA("#article .readpanel .chip").find((c) => c.textContent === "Açık").click();
    if (keepTheme == null) localStorage.removeItem("dal-theme"); else localStorage.setItem("dal-theme", keepTheme);
  });
  t("silme iki dokunuşla yapılıyor", async () => {
    click('#tabs button[data-v="trees"]');
    await waitFor(() => visible("trees"));
    const n = A("state.library.length");
    const del = Q("#libList .del");
    del.click();
    assert(del.classList.contains("sure"), "asks first");
    del.click();
    await waitFor(() => A("state.library.length") < n, "deleted");
  });
  t("sayfa yenilenince veriler yerinde", async () => {
    A("flushSaves()"); await wait(1200);
    const lib = A("state.library.length"), imps = A("state.imports.length"), words = Object.keys(A("state.nb.words")).length;
    await loadApp({ fresh: false });
    await waitFor(() => A("state.library.length") === lib, "library reloaded");
    eq(A("state.imports.length"), imps, "imports reloaded");
    eq(Object.keys(A("state.nb.words")).length, words, "notebook reloaded");
    noScriptErrors();
  });
  t("eski kayıtlı ligatürlü belge açılışta onarılıp kaydediliyor", async () => {
    await A("col()").doc("ligold").set({ kind: "text", id: "ligold", title: "Old ﬁle", paragraphs: ["A signiﬁcant idea. People agree."], taps: [{ key: "u:agree", lemma: "agree", idx: [5] }], branches: [], createdAt: 1 });
    await loadApp({ fresh: false });
    const d = A('byId("ligold")');
    eq(d.paragraphs[0], "A significant idea. People agree."); eq(d.title, "Old file"); eq(d.taps[0].idx[0], 4);
    A("flushSaves()"); await wait(1200);
    const saved = (await A("col()").get()).docs.map((x) => x.data()).find((x) => x.id === "ligold");
    eq(saved.paragraphs[0], "A significant idea. People agree.", "repaired copy saved");
    noScriptErrors();
  });
  t("temizlik: test veritabanı ve anahtar siliniyor", async () => {
    frame.remove(); frame = null;
    await deleteTestDb();
    localStorage.removeItem("dal-api-key-test");
    eq(localStorage.getItem("dal-api-key-test"), null);
  });
});

function show_home() { A('show("home")'); const n = Q("#homeNotice"); if (n) n.remove(); }
