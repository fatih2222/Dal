"""Finds English words that a Turkish reader already knows in Turkish form (democracy → demokrasi).

Each English word is respelled with regular English → Turkish loanword rules (suffixes such as -tion → -syon,
-logy → -loji, -ism → -izm, and letters such as c → k/s, ph → f, x → ks). A word counts as a cognate when one of
its respellings is a common Turkish word in wordfreq (Zipf >= MIN_TR). Short words are skipped: chance look-alikes
("can" / "kan") are common among them.

Input: index.html (for the word lists), bench/data/wf/en.json and tr.json (wordfreq, CC BY-SA 4.0).
Prints a JSON array of English words; details go to stderr.
"""
import json, re, sys, itertools

MIN_LEN, MIN_TR = 5, 3.0
html = open(sys.argv[1], encoding="utf-8").read()
en = json.load(open(sys.argv[2], encoding="utf-8"))
tr = json.load(open(sys.argv[3], encoding="utf-8"))

def words_of(name):
    m = re.search(r"^const %s = (\{.*?\});$" % name, html, re.M).group(1)
    return json.loads(re.sub(r"(?<=[{,] )(\w\d):|(?<=\{)(\w\d):", lambda x: '"%s":' % (x.group(1) or x.group(2)), m))
lists = words_of("LEX")
freq = words_of("FREQ_LV")
candidates = set()
for d in (lists, freq):
    for v in d.values():
        candidates.update(w for w in v.split() if re.fullmatch(r"[a-z]+", w) and len(w) >= MIN_LEN)

SUFFIX = [("isation", "izasyon"), ("ization", "izasyon"), ("ation", "asyon"), ("ition", "isyon"), ("tion", "syon"),
          ("ssion", "syon"), ("sion", "zyon"), ("sion", "syon"), ("ology", "oloji"), ("logical", "lojik"), ("graphy", "grafi"),
          ("ism", "izm"), ("ist", "ist"), ("ical", "ik"), ("ic", "ik"), ("cracy", "krasi"), ("acy", "asi"), ("cy", "si"),
          ("ity", "ite"), ("ure", "ür"), ("ment", "man"), ("ive", "if"), ("ary", "er"), ("ia", "i"), ("ia", "ya"),
          ("ine", "in"), ("al", "al"), ("e", ""), ("y", "i"), ("", "")]
LETTERS = [("ph", "f"), ("th", "t"), ("sh", "ş"), ("ch", "ş"), ("ch", "k"), ("ck", "k"), ("qu", "kv"), ("x", "ks"),
           ("sc", "ş"), ("w", "v"), ("j", "c"), ("y", "i")]

def letters(s):
    outs = {s}
    for a, b in LETTERS:
        outs |= {o.replace(a, b) for o in outs if a in o}
    res = set()
    for o in outs:
        o = re.sub(r"c(?=[eiy])", "s", o).replace("c", "k")
        o = re.sub(r"(.)\1", r"\1", o)
        res.add(o)
    return res

def umlauts(s):
    # u → ü and o → ö are common in loanwords (kültür, otomobil); try both for the first two occurrences.
    spots = [i for i, ch in enumerate(s) if ch in "uo"][:2]
    out = set()
    for flips in itertools.product([0, 1], repeat=len(spots)):
        t = list(s)
        for f, i in zip(flips, spots):
            if f: t[i] = "ü" if t[i] == "u" else "ö"
        out.add("".join(t))
    return out

# A loanword suffix (-syon, -loji, -izm, -ik …) is strong evidence. Without one, only letter changes remain,
# which also produce chance look-alikes (choose → köse, policy → polisi), so those need stricter checks.
WEAK = {"", "e", "y", "al"}
listed = set()
for v in lists.values():
    listed.update(v.split())

def respell(w):
    out = {}
    for suf, rep in SUFFIX:
        if suf and not w.endswith(suf):
            continue
        stem = w[: len(w) - len(suf)] if suf else w
        for s in letters(stem):
            for u in umlauts(s + rep):
                strong = suf not in WEAK
                out[u] = out.get(u, False) or strong
    return out

def accept(w, t, strong):
    if t == w or tr.get(t, 0) < MIN_TR or len(t) < MIN_LEN - 1:
        return False
    if en.get(t, 0) >= 2.5:          # the Turkish form is itself a common English word (mark, forest)
        return False
    if strong:
        return True
    # Letter changes only: the word must be in the CEFR lists (no names), be long, and differ by more than doubled letters.
    return w in listed and len(w) >= 6 and re.sub(r"(.)\1", r"\1", w) != t

# Removed after reading the full list by hand: chance look-alikes (chemical/kemik, church/kürk), false friends
# (thesis/tesis = facility, statue/statü = status, fragment/fragman = trailer) and personal names.
STOP = set("""amelia arabia arcane assure attach attic binary bucket cartoon celia cheeky cheese chemical chilli chilly
choose church commute define demise dominic engine finally generally golden ideally innate insane lydia morally
multiple nadia philistine policy sedate serene sofia sophia summary summer supper surely thesis unsure unity
fragment parcel seminary statue conserve""".split())

found = {}
for w in sorted(candidates - STOP):
    hits = [t for t, strong in respell(w).items() if accept(w, t, strong)]
    if hits:
        found[w] = max(hits, key=lambda t: tr[t])
print(json.dumps(sorted(found)))
print(len(found), file=sys.stderr)
for w in sorted(found):
    print(w, "→", found[w], file=sys.stderr)
