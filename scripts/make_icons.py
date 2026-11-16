"""Genera le icone PWA del brand MCC (Milano City Championship)."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
OUT = Path(__file__).resolve().parents[1] / "public" / "icons"
INK, TRAM, CROSS, PAPER = (14, 21, 37), (242, 169, 0), (212, 32, 44), (246, 243, 236)

def font(size):
    for f in ["/System/Library/Fonts/Supplemental/Arial Black.ttf", "/System/Library/Fonts/Supplemental/Impact.ttf", "/System/Library/Fonts/Helvetica.ttc"]:
        try: return ImageFont.truetype(f, size)
        except OSError: pass
    return ImageFont.load_default()

def icon(size, maskable=False):
    im = Image.new("RGB", (size, size), INK)
    d = ImageDraw.Draw(im)
    pad = size * (0.18 if maskable else 0.08)
    # pallone stilizzato: cerchio tram-yellow con croce rossa di Milano
    r0 = pad; r1 = size - pad
    d.ellipse([r0, r0, r1, r1], fill=TRAM)
    w = max(2, int(size * 0.045))
    c = size / 2
    d.line([(c, r0), (c, r1)], fill=INK, width=w)
    d.line([(r0, c), (r1, c)], fill=INK, width=w)
    # croce di Milano al centro
    s = size * 0.13
    d.rectangle([c - s, c - s, c + s, c + s], fill=PAPER)
    t = s * 0.38
    d.rectangle([c - t, c - s, c + t, c + s], fill=CROSS)
    d.rectangle([c - s, c - t, c + s, c + t], fill=CROSS)
    return im

for s in (192, 512):
    icon(s).save(OUT / f"icon-{s}.png")
    icon(s, maskable=True).save(OUT / f"maskable-{s}.png")
icon(180).save(OUT / "apple-touch-icon.png")
icon(64).save(OUT / "favicon.png")
print("icone ok")
