"""Builds the frequency-based fallback levels (FREQ_LV) for words that are not in the CEFR lists.

Input: bench/data/wf/en.json (wordfreq Zipf values, CC BY-SA 4.0; export with wordfreq.top_n_list("en", 60000)).
Cut points between levels are the midpoints of the median Zipf frequency of neighbouring levels in the app's own
word list (A1 4.97, A2 4.49, B1 4.13, B2 3.70, C1 3.35, C2 3.01). Words rarer than the C1/C2 cut are left out:
they stay "off-list", as before. Words whose simple stems are already listed are skipped (the app finds them).
Prints a JavaScript object literal.
"""
import json, re, sys

html = open(sys.argv[1], encoding="utf-8").read()
en = json.load(open(sys.argv[2], encoding="utf-8"))

lex = json.loads(re.search(r"^const LEX = (\{.*?\});$", html, re.M).group(1))
awl = re.search(r'^const AWL = "([^"]*)";$', html, re.M).group(1).split()
phrase = re.search(r"^const PHRASE_WORDS = (\{.*?\});$", html, re.M).group(1)
phrase = json.loads(re.sub(r"(\w\d):", r'"\1":', phrase))
listed = set(awl)
for v in list(lex.values()) + list(phrase.values()):
    listed.update(v.split())

def stems(w):
    out = {w}
    for suf, rep in (("ies", "y"), ("es", ""), ("s", ""), ("ied", "y"), ("ed", ""), ("ed", "e"), ("ing", ""), ("ing", "e"),
                     ("ly", ""), ("er", ""), ("er", "e"), ("est", ""), ("est", "e"), ("ves", "f"), ("ves", "fe")):
        if w.endswith(suf) and len(w) - len(suf) >= 2:
            out.add(w[: -len(suf)] + rep)
    return out

CUTS = [4.73, 4.31, 3.92, 3.53, 3.18]
LV = ["A1", "A2", "B1", "B2", "C1"]
levels = {l: [] for l in LV}
for w, z in en.items():
    if len(w) < 3 or "'" in w or z < CUTS[-1]:
        continue
    if stems(w) & listed:
        continue
    for i, c in enumerate(CUTS):
        if z >= c:
            levels[LV[i]].append(w)
            break
print(json.dumps({l: " ".join(sorted(ws)) for l, ws in levels.items()}, ensure_ascii=False))
print({l: len(ws) for l, ws in levels.items()}, file=sys.stderr)
