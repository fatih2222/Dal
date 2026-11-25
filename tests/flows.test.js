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
  t("anahtarsız: düğme kapalı, uyarı ayarlara götürüyor", async () => {
    await loadApp();
    eq(Q("#goBtn").disabled, true); assert(!Q("#noSample").hidden, "notice shown");
    click("#noSampleOpen");
    await waitFor(() => Q("#settings").classList.contains("open"), "settings open");
    assert(!Q("#settings").hidden, "settings visible");
  });
  t("anahtar kaydedilince düğme açılıyor, panel geri tuşuyla kapanıyor", async () => {
    Q("#keyIn").value = "sk-ant-test-fake";
    click("#keySave");
    eq(Q("#goBtn").disabled, false); assert(Q("#noSample").hidden, "notice hidden");
    eq(W.localStorage.getItem("dal-api-key-test"), "sk-ant-test-fake");
    A("goBack()");
    await waitFor(() => !Q("#settings").classList.contains("open"), "settings closed by back");
    eq(A("curView()"), "home", "still on home");
  });
  t("üst çubuk: ana ekranda marka ve ayarlar düğmesi", () => {
    eq(Q("#abTitle").textContent, "Dal"); assert(Q("#abBack").hidden, "no back on home");
    assert(QA("#abActs .abtn").some((b) => b.getAttribute("aria-label") === "Ayarlar"), "settings button");
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
  t("üst çubuk: okurken geri düğmesi, başlık, Aa ve ağaç", () => {
    assert(!Q("#abBack").hidden, "back shown");
    eq(Q("#abTitle").textContent, A("state.doc.title"));
    const labels = QA("#abActs .abtn").map((b) => b.getAttribute("aria-label"));
    assert(labels.includes("Okuma ayarları") && labels.includes("Ağaçta göster"), labels.join(","));
    QA("#abActs .abtn").find((b) => b.getAttribute("aria-label") === "Okuma ayarları").click();
    assert(!Q("#article .readpanel").hidden, "reading panel opened from the app bar");
    QA("#abActs .abtn").find((b) => b.getAttribute("aria-label") === "Okuma ayarları").click();
  });
  t("kart iki yarıda dönüyor, yüzler birbirini gizliyor", async () => {
    A("openSentence(0)");
    await waitFor(() => Q("#sheet").classList.contains("open"));
    assert(!Q("#flip").classList.contains("flipped"), "front first");
    A("flip()");
    assert(Q("#flip").classList.contains("turn-out"), "turning out");
    await waitFor(() => Q("#flip").classList.contains("flipped"), "faces swapped");
    await waitFor(() => !Q("#flip").dataset.turning, "turn finished", 1000);
    eq(W.getComputedStyle(Q("#front")).display, "none", "front hidden"); assert(W.getComputedStyle(Q("#back")).display !== "none", "back shown");
    A("closeCard()");
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
  t("geri: ağaçtan okumaya, okumadan bir öncekine; kart önce kapanıyor", async () => {
    eq(A("curView()"), "tree");
    QA("#tree .drow:not(.sugg) .tt")[1].click();
    await waitFor(() => A("curView()") === "reader", "reader from tree");
    A("openSentence(0)");
    await waitFor(() => Q("#sheet").classList.contains("open"));
    A("goBack()");
    await waitFor(() => !Q("#sheet").classList.contains("open"), "card closed first");
    eq(A("curView()"), "reader", "still reading");
    A("goBack()");
    await waitFor(() => A("curView()") === "tree", "back to the tree");
  });
  t("sekme değiştirme: geri ana ekrana döner", async () => {
    click('#tabs button[data-v="notebook"]');
    await waitFor(() => A("curView()") === "notebook");
    A("goBack()");
    await waitFor(() => A("curView()") === "home", "back from a tab goes to Oku");
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
  t("yeni kelime bugün değil, yarın tekrar ediliyor", async () => {
    const w = Object.values(A("state.nb.words"))[0];
    eq(w.recall.due, A("addDays")(A("today")(), 1), "first review tomorrow");
    click('#tabs button[data-v="review"]');
    await waitFor(() => visible("review"));
    assert(Q("#review").textContent.includes("Bugün tekrar edilecek kelime yok"), "nothing today");
    assert(Q("#review .cal .calday.today"), "calendar shows today");
    assert(Q("#review .caldetail").textContent.includes(w.lemma), "today's looked-up word listed");
  });
  t("Tekrar: takvimden başla, hatırladım, plan ileri kayıyor", async () => {
    const words = A("state.nb.words"), w = Object.values(words)[0];
    w.recall.due = A("today")();
    A("showReviewHome()");
    const start = await waitFor(() => QA("#review button").find((b) => b.textContent === "Tekrara başla"), "start button");
    start.click();
    const show = await waitFor(() => QA("#review button").find((b) => b.textContent.includes("Anlamını göster")));
    show.click();
    const yes = await waitFor(() => QA("#review button").find((b) => b.textContent === "Hatırladım"));
    yes.click();
    await waitFor(() => Q("#review .rvtoday"), "back to the calendar");
    assert(Q("#review .rvtoday").textContent.includes("tanesini hatırladın"), "result shown");
    assert(w.recall.due > A("today")(), "next review later");
    const log = A("state.nb.log");
    eq(log[log.length - 1].k, w.key); eq(log[log.length - 1].ok, true);
    const day = Q(`#review .calday[data-day="${A("today")()}"]`);
    day.click();
    assert(Q("#review .caldetail").textContent.includes("✓ hatırladın"), "today's answers listed");
    noScriptErrors();
  });
  t("Kelimeler sekmesi: üç grup, seçilen kelime ilk grupta", async () => {
    QA("#review .rvtabs .chip").find((b) => b.textContent === "Kelimeler").click();
    await waitFor(() => Q("#review .wgroups"));
    const g = QA("#review .wgroups .chip").map((b) => b.textContent);
    assert(g[0].startsWith("Seçtiklerim") && g[1].startsWith("Görüp seçmediklerim") && g[2].startsWith("Hiç görmediklerim"), g.join(" / "));
    const w = Object.values(A("state.nb.words"))[0];
    assert(QA("#review .wlist .wl").some((x) => x.textContent === w.lemma), "notebook word in Seçtiklerim");
    QA("#review .wgroups .chip")[2].click();
    assert(QA("#review .wlist .wrow").length >= 150, "long list shown in parts");
    assert(QA("#review .acts button").some((b) => b.textContent.startsWith("Daha fazla göster")), "more button");
    eq(W.document.documentElement.scrollWidth, W.document.documentElement.clientWidth, "no sideways scroll");
    QA("#review .rvtabs .chip").find((b) => b.textContent === "Takvim").click();
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
    await waitFor(() => visible("importdoc") || visible("reader"), "import page or reader");
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
    await waitFor(() => visible("importdoc") || visible("reader"));
    eq(A("state.imports[0].source"), "scan");
    noScriptErrors();
  });
  t("tek parçalı metin doğrudan açılıyor; terimler alınamazsa puan takılı kalmıyor", async () => {
    NET.calls = [];
    NET.override = (c) => (c.kind === "terms" ? { status: 401 } : null);
    click("#impOpen");
    Q("#impTitle").value = "Short Note";
    Q("#impText").value = "The printing press changed the way ideas moved across Europe. Before it, books were copied by hand, which was slow and expensive. Only rich people could own many books. Then a new machine made it possible to print hundreds of copies quickly, so prices fell, more people learned to read, and new ideas spread across the continent within a few years.";
    click("#impGo");
    await waitFor(() => visible("reader"), "reader opened directly");
    eq(A("state.doc.title"), "Short Note");
    await waitFor(() => Q("#article .lvl").textContent.includes("yaklaşık"), "provisional score line");
    NET.override = null;
    assert(!Q("#article .lvl").textContent.includes("hesaplanıyor"), "not stuck");
  });
  t("tek parçalı metinde geri Kitaplık'a dönüyor; belge sayfası sade", async () => {
    click("#abBack");
    await waitFor(() => visible("library"), "back to library");
    A("showImport(state.imports[0].id)");
    await waitFor(() => visible("importdoc"));
    eq(Q("#importdoc .bookdel").textContent, "Metni sil");
    assert(!Q("#importdoc .auditnote"), "no clean-audit line");
    assert(!/bölüm/.test(Q("#importdoc .lvl").textContent), "no section count");
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
  t("seviye testi baştan sona: sonuç okur seviyesi oluyor", async () => {
    show_home();
    click("#ptOpen");
    await waitFor(() => visible("placement"));
    QA("#placement button").find((b) => b.textContent === "Başla").click();
    // Knows A1–B1, no pseudowords.
    for (let i = 0; i < 80; i++) {
      const word = Q("#placement .rvword").textContent;
      const it = A("state.pt.items")[A("state.pt.i")];
      eq(it.w, word, "shown word");
      QA("#placement .acts button").find((b) => b.textContent === (it.l >= 1 && it.l <= 3 ? "Biliyorum" : "Bilmiyorum")).click();
    }
    await waitFor(() => Q("#placement .ptres"), "result");
    const v = Math.round(A("BOUND")[3]);
    assert(Q("#placement .ptres").textContent.startsWith(String(v)), Q("#placement .ptres").textContent);
    eq(QA("#placement .ptbar").length, 6, "six level bars");
    QA("#placement .acts button").find((b) => b.textContent === "Seviyem olarak kaydet").click();
    await waitFor(() => visible("home"));
    eq(A("state.settings.levelReset.src"), "test"); eq(A("state.settings.levelReset.value"), v);
    eq(Q("#gauge .gnum").textContent, String(v));
    assert(Q("#levelInfo").textContent.includes("Seviye testindeki"), Q("#levelInfo").textContent);
    noScriptErrors();
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
  t("özel tema: palet, renk seçici, kontrast uyarısı ve kalıcılık", async () => {
    const keep = { t: localStorage.getItem("dal-theme"), v: localStorage.getItem("dal-theme-vars") };
    const root = W.document.documentElement;
    show_home();
    QA("#abActs .abtn").find((b) => b.getAttribute("aria-label") === "Ayarlar").click();
    await waitFor(() => Q("#settings").classList.contains("open"));
    QA("#setRead .chip").find((c) => c.textContent === "Özel").click();
    eq(root.getAttribute("data-dal"), "custom");
    eq(root.style.getPropertyValue("--bg"), "#0F1724", "first palette applied");
    eq(QA("#setRead .swatch").length, 5, "five palettes");
    QA("#setRead .swatch").find((b) => b.getAttribute("aria-label") === "Kum").click();
    eq(root.style.getPropertyValue("--bg"), "#FAF6EE");
    eq(Q('meta[name="theme-color"]').content, "#FAF6EE", "status bar follows");
    // Text colour almost the background colour: a warning.
    const inks = QA("#setRead .cpick input");
    inks[1].value = "#f0ece4"; inks[1].dispatchEvent(new W.Event("input"));
    assert(Q("#setRead .cwarn").classList.contains("err"), Q("#setRead .cwarn").textContent);
    eq(root.style.getPropertyValue("--ink"), "#F0ECE4", "applied while choosing");
    inks[1].value = "#2b2722"; inks[1].dispatchEvent(new W.Event("input"));
    assert(!Q("#setRead .cwarn").classList.contains("err"), "good contrast again");
    eq(JSON.parse(localStorage.getItem("dal-theme-vars"))["--bg"], "#FAF6EE", "saved for the next start");
    // Back to a built-in theme removes the custom colours.
    QA("#setRead .chip").find((c) => c.textContent === "Açık").click();
    eq(root.style.getPropertyValue("--bg"), "", "inline colours removed");
    eq(localStorage.getItem("dal-theme-vars"), null);
    A("closeSettings()");
    if (keep.t == null) localStorage.removeItem("dal-theme"); else localStorage.setItem("dal-theme", keep.t);
    if (keep.v == null) localStorage.removeItem("dal-theme-vars"); else localStorage.setItem("dal-theme-vars", keep.v);
  });
  t("phrasal verb'ün bir kelimesine dokununca bütün ifade açılıyor, Defter'e doğru anlamıyla giriyor", async () => {
    show_home();
    NET.calls = [];
    NET.override = (c) => {
      if (c.kind === "draft") {
        const d = FIX.draft("Phrasal Test");
        d.paragraphs[1] = d.paragraphs[1].replace("They wanted to study society", "They set out to study society");
        d.phrasal = [{ text: "set out", lemma: "set out" }, { text: "gave up", lemma: "give up" }];
        return { text: JSON.stringify(d) };
      }
      if (c.kind === "lookup") return { text: JSON.stringify({ text: "set out", lemma: "set out", type: "phrasal", forms: ["set out", "sets out"], def: "to start trying to do something", tr: "yola koyulmak", cefr: "B2", sentence_tr: "Toplumu incelemeye [[koyuldular]]." }) };
      return null;
    };
    await generateFromHome("Frankfurt Okulu");
    const pr = callsOf("draft")[0].prompt;
    assert(pr.includes('"phrasal"'), "prompt asks for the list");
    assert(!/Use \d+ to \d+ phrasal verbs/.test(pr), "prompt does not ask to add phrasal verbs");
    eq(A("state.doc.phrasal").length, 2, "list stored");
    assert(!Q("#endBox .phrasals"), "no separate section");
    QA("#article .text .w").find((x) => x.textContent === "set").click();
    await waitFor(() => callsOf("lookup").length && A("state.doc.units").some((u) => u.lemma === "set out"), "card for the phrase");
    NET.override = null;
    const lk = callsOf("lookup")[0].prompt;
    assert(lk.includes('"set out"'), "the whole phrase is looked up: " + lk.slice(0, 200));
    const w = A("state.nb.words")["set out"];
    assert(w && w.type === "phrasal" && w.tr === "yola koyulmak", "notebook has the phrasal verb with its meaning");
    A("closeCard()");
    NET.calls = [];
    QA("#article .text .w").find((x) => x.textContent === "out").click();
    await wait(300);
    eq(callsOf("lookup").length, 0, "tapping the other word reuses the card");
    A("closeCard()");
    click('#tabs button[data-v="notebook"]');
    await waitFor(() => visible("notebook"));
    assert(!QA("#notebook .chip").some((b) => b.textContent.startsWith("Phrasal verbs")), "no separate filter");
    const it = QA("#notebook .nbitem").find((x) => x.querySelector(".nbl").textContent === "set out");
    it.querySelector(".nbhead").click();
    assert(it.textContent.includes("phrasal verb"), "kind shown");
    noScriptErrors();
  });
  t("yazı: hatalar işaretleniyor, akıcı hali yan yana", async () => {
    NET.calls = [];
    click('#tabs button[data-v="writing"]');
    await waitFor(() => visible("writing"));
    const ta = Q("#wText");
    ta.value = "ı went to the market yesterday and ı bought some apples.\n\nThe seller gave me informations about the fruit.";
    ta.dispatchEvent(new W.Event("input"));
    click("#wGo");
    await waitFor(() => visible("writedoc") && A("state.writings[0].status") === "done", "checked and rewritten");
    const w = A("state.writings[0]");
    eq(w.check.errors.length, 3, "three mistakes");
    eq(w.check.errors.filter((e) => e.at >= 0).length, 3, "all found in the text");
    eq(QA("#writedoc .werr").length, 3, "three marks");
    eq(QA("#writedoc .wl").length, 2, "two rows, one per paragraph");
    assert(Q("#writedoc .wr").textContent.startsWith("Fluent: I went"), "fluent version beside the original");
    const ck = callsOf("wcheck")[0], rw = callsOf("wrewrite")[0];
    eq(ck.model, "claude-sonnet-5-5"); eq(rw.model, "claude-haiku-5-5"); assert(ck.schema && rw.schema, "both with a schema");
    assert(rw.prompt.includes("I went to the market"), "rewrite starts from the corrected text");
    eq(w.cur, String(Math.round(A("targetScore()"))), "rewrite at the reading level");
    assert(!Q("#writedoc .wsum").textContent.includes("seviyen"), "no writer level shown");
    QA("#writedoc .werr")[2].click();
    assert(Q("#writedoc .wtip.inrow") && Q("#writedoc .wtip.inrow").textContent.includes("information"), "explanation opens");
    QA("#writedoc .werr")[2].click();
    assert(!Q("#writedoc .wtip.inrow"), "and closes");
    QA("#writedoc .wseg .chip").find((b) => b.textContent === "Sadece düzeltmeler").click();
    eq(QA("#writedoc .wfix").length, 3, "corrections marked");
    QA("#writedoc .wseg .chip").find((b) => b.textContent === "Akıcı hali").click();
    const chg = QA("#writedoc .wr .ww.wchg").map((x) => x.textContent);
    assert(chg.includes("Fluent") && !chg.includes("market"), "only changed words tinted: " + chg.join(","));
    NET.calls = [];
    const word = QA("#writedoc .wr .ww").find((x) => x.textContent === "market");
    word.click();
    await waitFor(() => callsOf("lookup").length && Q("#sheet").classList.contains("open") && Q("#front h3") && Q("#front h3").textContent === "market" && !!A("state.nb.words").market, "word card");
    assert(callsOf("lookup")[0].prompt.includes("fluent version of something they wrote"), "writing lookup prompt");
    assert(A("state.nb.words").market, "word in the notebook");
    assert(word.classList.contains("here"), "word marked");
    A("closeCard()");
    assert(!word.classList.contains("here"), "mark cleared on close");
    NET.calls = [];
    QA("#writedoc .wr .ww").find((x) => x.textContent === "market").click();
    await waitFor(() => Q("#sheet").classList.contains("open"), "card again");
    eq(callsOf("lookup").length, 0, "second tap reuses the meaning");
    QA("#front .acts button").find((b) => b.textContent === "Bunu biliyordum").click();
    assert(!A("state.nb.words").market, "removed from the notebook");
    A("closeCard()");
    eq(W.document.documentElement.scrollWidth, W.document.documentElement.clientWidth, "no sideways scroll");
    noScriptErrors();
  });
  t("yazı: istenen puanda yeniden yazılıyor ve saklanıyor", async () => {
    NET.calls = [];
    const num = Q("#writedoc .wlevel .wnum");
    num.value = "70";
    QA("#writedoc .wlevel .chip").find((b) => b.textContent === "Bu puanda yaz").click();
    await waitFor(() => A("state.writings[0].versions")["70"] && A("state.writings[0].status") === "done", "second version");
    eq(callsOf("wcheck").length, 0, "no second check");
    const rw = callsOf("wrewrite")[0];
    assert(rw.prompt.includes("B2 level"), "target band in the prompt");
    eq(A("state.writings[0].cur"), "70");
    assert(QA("#writedoc .wlevel .chip").some((b) => b.textContent === "70" && b.getAttribute("aria-pressed") === "true"), "version chip");
    NET.calls = [];
    QA("#writedoc .wlevel .chip").find((b) => b.textContent.startsWith("Okuma seviyem")).click();
    await wait(200);
    eq(NET.calls.length, 0, "earlier version reused");
    click('#tabs button[data-v="writing"]');
    await waitFor(() => visible("writing"));
    assert(Q("#wListBox .wrowbtn").textContent.includes("3 hata"), "listed with its mistakes");
    noScriptErrors();
  });
  t("yazı: belirli puan seçilirse ilk yazım o puanda", async () => {
    NET.calls = [];
    QA("#writing .wlevel .chip").find((b) => b.textContent === "Belirli bir puanda").click();
    const num = Q("#writing .wnum");
    num.value = "30"; num.dispatchEvent(new W.Event("input"));
    Q("#wText").value = "We was happy because the trip was very nice for us."; Q("#wText").dispatchEvent(new W.Event("input"));
    click("#wGo");
    await waitFor(() => A("state.writings[0].status") === "done" && A("state.writings.length") === 2, "done");
    eq(A("state.writings[0].cur"), "30");
    eq(A("state.writings[0].check.errors.length"), 0);
    assert(Q("#writedoc .wcount").textContent.includes("bulunmadı"), "no mistakes said plainly");
    noScriptErrors();
  });
  t("yazı: fotoğraftaki yazı hatalarıyla okunuyor", async () => {
    NET.calls = [];
    click('#tabs button[data-v="writing"]');
    await waitFor(() => visible("writing"));
    const c = W.document.createElement("canvas"); c.width = 300; c.height = 200;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 300, 200);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    setFile(Q("#wPhoto"), blob, "note.png", "image/png");
    await waitFor(() => Q("#wText").value.includes("ı did it"), "transcribed", 10000);
    const tc = callsOf("wtranscribe")[0];
    eq(tc.model, "claude-sonnet-5-5");
    assert(tc.prompt.includes("including every mistake"), "keeps the mistakes");
    eq(A("state.wDraft.source"), "photo");
    Q("#wText").value = ""; Q("#wText").dispatchEvent(new W.Event("input"));
    noScriptErrors();
  });
  t("yazı: taslak uygulama kapanınca kaybolmuyor", async () => {
    Q("#wText").value = "This is my unfinished draft about the weekend."; Q("#wText").dispatchEvent(new W.Event("input"));
    QA("#writing .wlevel .chip").find((b) => b.textContent === "Belirli bir puanda").click();
    await wait(600);
    await loadApp({ fresh: false });
    click('#tabs button[data-v="writing"]');
    await waitFor(() => visible("writing"));
    eq(Q("#wText").value, "This is my unfinished draft about the weekend.", "draft back");
    assert(!Q("#writing .wnum").hidden, "chosen level mode back");
    Q("#wText").value = ""; Q("#wText").dispatchEvent(new W.Event("input"));
    QA("#writing .wlevel .chip").find((b) => b.textContent.startsWith("Okuma seviyemde")).click();
    await wait(500);
    noScriptErrors();
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
    const writings = A("state.writings.length");
    await loadApp({ fresh: false });
    await waitFor(() => A("state.library.length") === lib, "library reloaded");
    eq(A("state.imports.length"), imps, "imports reloaded");
    eq(Object.keys(A("state.nb.words")).length, words, "notebook reloaded");
    eq(A("state.writings.length"), writings, "writings reloaded");
    eq(A("state.writings[0].status"), "done");
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
    localStorage.removeItem("dal-wdraft-test");
    eq(localStorage.getItem("dal-api-key-test"), null);
  });
});

function show_home() { A('show("home")'); const n = Q("#homeNotice"); if (n) n.remove(); }
