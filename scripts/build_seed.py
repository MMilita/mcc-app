"""Genera seed/franchises.json dai fogli Excel della lega.

Uso: python3 scripts/build_seed.py  (dalla cartella mcc-app)
Legge ../Roster Milano City Championship.xlsx
"""
import json
import re
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
ROSTER = ROOT.parent / "Roster Milano City Championship.xlsx"
OUT = ROOT / "seed"
OUT.mkdir(exist_ok=True)

SEASONS = ["2023/2024", "2024/2025", "2025/2026", "2026/2027", "2027/2028", "2028/2029", "2029/2030"]
ROLE = {"guardia": "G", "ala": "A", "centro": "C"}
AWARD_KEYS = ["MVP", "DPY", "ROY", "6MY", "MIP", "CPY", "COY"]


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def num(v):
    return float(v) if isinstance(v, (int, float)) else None


wb = openpyxl.load_workbook(ROSTER, data_only=True)
franchises = []
for ws in wb.worksheets:
    rows = list(ws.iter_rows(values_only=True))
    name = ws.title
    roster, cut, injured, picks = [], [], [], []
    for r in rows[3:]:
        label = (r[0] or "")
        pname = r[1]
        if isinstance(pname, str) and pname.strip():
            salaries = {SEASONS[i]: num(r[5 + i]) for i in range(len(SEASONS)) if 5 + i < len(r) and num(r[5 + i]) is not None}
            entry = {"name": pname.strip(), "team": r[4], "salaries": salaries}
            if label in ROLE:
                entry["role"] = ROLE[label]
                roster.append(entry)
            elif label == "tagliato":
                cut.append(entry)
            elif label == "infortunio":
                injured.append(entry)
            elif label in ("?", "") or label is None:
                entry["role"] = "?"
                roster.append(entry)
        if label == "SCELTE DRAFT" or (picks and label in ("", None) and any(r[5:9])):
            pass
    # pannello dati societari (colonne N..P)
    info, palmares, awards, names = {}, [], {k: [] for k in AWARD_KEYS}, []
    section = None
    for r in ws.iter_rows(min_col=14, max_col=16, values_only=True):
        a, b, c = (list(r) + [None, None, None])[:3]
        vals = [x for x in (a, b, c) if x not in (None, "")]
        if not vals:
            continue
        if a == "Dati societari":
            section = "info"; continue
        if a == "Palmarès":
            section = "palmares"; continue
        if a == "Premi individuali":
            section = "awards"; continue
        if section == "info":
            if a == "Proprietario/GM": info["gm"] = c
            elif a == "Quartiere": info["quartiere"] = c
            elif a == "Zona": info["zona"] = c
            elif a == "Fondazione": info["founded"] = int(c) if c else None
            elif a == "Arena di gioco": info["arena"] = c
            elif a == "Colori sociali": info["colors"] = c
            elif a == "Denominazione": names.append(c)
            elif a is None and c: names.append(c)
        elif section == "palmares":
            palmares.append(" ".join(str(v) for v in vals))
        elif section == "awards":
            key = str(a).rstrip(":") if a else None
            if key in awards and b:
                awards[key] = [x.strip() for x in str(b).split("),") if x.strip()]
                awards[key] = [x if x.endswith(")") else x + ")" for x in awards[key]]
    # totali cap
    tot = next((r for r in rows if r[0] == "TOTALE SALARY CAP"), None)
    totals = {SEASONS[i]: num(tot[5 + i]) for i in range(4)} if tot else {}
    franchises.append({
        "id": slug(name),
        "name": name,
        **info,
        "names": [n for n in names if n],
        "palmares": palmares,
        "awards": {k: v for k, v in awards.items() if v},
        "roster": roster,
        "cut": cut,
        "injured": injured,
        "capTotals": totals,
    })

LOGOS = json.loads((OUT / "logos.json").read_text()) if (OUT / "logos.json").exists() else {}
for f in franchises:
    if f["id"] in LOGOS: f["logo"] = LOGOS[f["id"]]
(OUT / "franchises.json").write_text(json.dumps(franchises, ensure_ascii=False, indent=1))
print(f"{len(franchises)} franchigie, {sum(len(f['roster']) for f in franchises)} contratti")
for f in franchises[:2]:
    print(json.dumps({k: f[k] for k in ('id', 'name', 'gm', 'palmares', 'awards')}, ensure_ascii=False))
