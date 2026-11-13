"""Pseudowords for the yes/no vocabulary test: strings that look like English words but are not words.

A letter-trigram model is trained on the app's listed English words; generated strings are kept only if they
are in neither the English nor the Turkish wordfreq list (any frequency), are not one edit away from a listed
English word (a misspelling would be a fair "yes"), and contain no vowel-less run longer than three letters.
Printed as a JSON array; the result was then read through by hand.
"""
import json, random, re, sys

random.seed(7)
html = open(sys.argv[1], encoding="utf-8").read()
en = json.load(open(sys.argv[2], encoding="utf-8"))
tr = json.load(open(sys.argv[3], encoding="utf-8"))
lex = json.loads(re.search(r"^const LEX = (\{.*?\});$", html, re.M).group(1))
listed = sorted({w for v in lex.values() for w in v.split() if re.fullmatch(r"[a-z]+", w)})
train = [w for w in listed if 4 <= len(w) <= 10]

model = {}
for w in train:
    s = "^^" + w + "$"
    for i in range(len(s) - 2):
        model.setdefault(s[i:i + 2], []).append(s[i + 2])

def gen():
    s = "^^"
    while len(s) < 14:
        c = random.choice(model[s[-2:]])
        if c == "$":
            break
        s += c
    return s[2:]

listed_set = set(listed)
by_len = {}
for w in listed:
    by_len.setdefault(len(w), set()).add(w)

def one_edit_from_word(p):
    alphabet = "abcdefghijklmnopqrstuvwxyz"
    for i in range(len(p) + 1):
        for c in alphabet:
            if p[:i] + c + p[i:] in listed_set: return True
    for i in range(len(p)):
        if p[:i] + p[i + 1:] in listed_set: return True
        for c in alphabet:
            if p[:i] + c + p[i + 1:] in listed_set: return True
    for i in range(len(p) - 1):
        if p[:i] + p[i + 1] + p[i] + p[i + 2:] in listed_set: return True
    return False

# Removed after reading the output: not English-looking (thquenly), too close to a real or slang word
# (listable, toonage, whired), or too short and odd to be a fair item (ecuch, proat).
STOP = set("""lictictic thquenly thlever stleter thway prutsh rerre uppro updadvare spittlect ocklegool sorywala puzzy
hookerell abolists catiman cooty disse ropped culty ensly ensty foloothe fuldooll inforget lisdamily endernard
corignpar comens colate latable listable outry overge toonage timeson possly beapper pacaught whired romperld ranan
rowde relple insarb rordep genct preld phygo exorm ethef evate ecuch ealar emely pably proat loont troms upect siont
zonot flumb hypeam knelle drelle jarmle almle aerst accar ablar finiz waratise smaniness""".split())

out = set()
tries = 0
while len(out) < 300 and tries < 200000:
    tries += 1
    p = gen()
    if not (5 <= len(p) <= 9) or p in out or p in en or p in tr or p in listed_set:
        continue
    if re.search(r"[^aeiouy]{4,}", p) or re.search(r"(.)\1\1", p):
        continue
    if one_edit_from_word(p):
        continue
    out.add(p)
print(json.dumps(sorted(out - STOP)))
print(len(out), tries, file=sys.stderr)
