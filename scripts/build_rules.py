"""Estrae il Regolamento ufficiale dal PDF e lo divide in articoli -> seed/rules.json"""
import json, re, sys
from pathlib import Path
import pypdf

SRC = Path.home() / 'Downloads' / 'Regolamento Milano City Championship.pdf'
OUT = Path(__file__).resolve().parents[1] / 'seed' / 'rules.json'
text = '\n'.join(p.extract_text() for p in pypdf.PdfReader(SRC).pages)
lines = [re.sub(r'\s+', ' ', l).strip() for l in text.split('\n')]

head = re.compile(r'^(\d+(?:\.\d+)?)\s*(?:–|-)?\s+([A-ZÀ-Ü][^.]{2,80})$')
sections, cur = [], None
for l in lines:
    if not l or l == 'REGOLAMENTO FANTANBA':
        if cur is not None: cur['raw'].append('')
        continue
    m = head.match(l)
    if m and len(l) < 90 and not l.endswith(':'):
        cur = {'num': m.group(1), 'title': m.group(2).strip(), 'raw': []}
        sections.append(cur)
    elif cur is not None:
        cur['raw'].append(l)

def paragraphs(raw):
    out, buf = [], []
    def flush():
        if buf: out.append(' '.join(buf).strip()); buf.clear()
    for l in raw:
        if l == '':
            flush(); continue
        bullet = re.match(r'^([-•]|\d+° |[A-Z0-9]{1,3} vs )', l)
        if bullet: flush(); out.append(l); continue
        buf.append(l)
        if re.search(r'[.:;!?)]$', l) and len(l) < 95: flush()
    flush()
    return [p for p in out if p]

for s in sections:
    s['body'] = '\n\n'.join(paragraphs(s.pop('raw')))
    s['id'] = 'art-' + s['num'].replace('.', '-')
# tabella Rookie Scale (nel PDF è una tabella: il testo estratto la appiattisce)
ROOKIE = """| Pick | 1° anno | 2° anno | 3° anno | 4° anno |
| 1 | 10 | 11 | 12 | 13 |
| 2 - 3 | 9 | 10 | 11 | 12 |
| 4 - 5 | 8 | 8 | 9 | 10 |
| 6 - 10 | 7 | 7 | 8 | 9 |
| 11 - 20 | 6 | 6 | 7 | 7 |
| 21 - 30 | 5 | 5 | 6 | 6 |
| 31 - 60 | 4 | 4 | 5 | 5 |"""
for s in sections:
    s['body'] = re.sub(r'Pick 1° anno 2° anno 3° anno 4° anno [0-9 -]+', ROOKIE, s['body'])
OUT.write_text(json.dumps({'title': 'Regolamento FantaNBA', 'source': SRC.name, 'sections': sections}, ensure_ascii=False, indent=1))
print(len(sections), 'articoli:', ', '.join(f"{s['num']} {s['title'][:28]}" for s in sections))
