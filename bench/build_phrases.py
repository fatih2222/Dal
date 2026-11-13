"""Multi-word entries of the CEFR-J 1.5 and Octanove C1/C2 lists (according to, eke out, global warming).

Input: the two CSV files of github.com/openlanguageprofiles/olp-en-cefrj (CEFR-J: free with citation;
Octanove: CC BY-SA 4.0). Prints {level: "phrase|phrase|..."} as JSON, lower case, letters and spaces only.
"""
import csv, json, re, sys

levels = {l: set() for l in ("A1", "A2", "B1", "B2", "C1", "C2")}
for path in sys.argv[1:]:
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            lv = (row.get("CEFR") or "").strip()
            if lv not in levels:
                continue
            for form in row["headword"].split("/"):
                words = re.findall(r"[a-z]+", form.lower())
                if len(words) >= 2 and all(len(w) > 1 or w == "a" for w in words) and "'" not in form:
                    levels[lv].add(" ".join(words))
seen = set()
out = {}
for lv in levels:
    ps = sorted(p for p in levels[lv] if p not in seen)
    seen.update(ps)
    out[lv] = "|".join(ps)
print(json.dumps(out))
print({l: len(v.split("|")) if v else 0 for l, v in out.items()}, file=sys.stderr)
