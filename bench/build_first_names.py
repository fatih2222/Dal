"""Common English first names, for telling a surname (George Bush) from a word in an institution's name
(Grand National Assembly).

Input: baby-names.csv from github.com/hadley/data-baby-names (US Social Security Administration data,
1880-2008, the 1000 most common names of each year; public domain). Names are ranked by their summed yearly
share; the top N are printed as a JSON array, lower case.
"""
import csv, json, sys

N = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
total = {}
with open(sys.argv[1], encoding="utf-8") as f:
    for row in csv.DictReader(f):
        name = row["name"].lower()
        total[name] = total.get(name, 0.0) + float(row["percent"])
top = sorted(total, key=lambda n: -total[n])[:N]
print(json.dumps(sorted(n for n in top if n.isalpha() and len(n) > 1)))
