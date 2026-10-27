#!/usr/bin/env python3
"""Contact sheet of sweep screenshots: contact.py SWEEP_DIR OUT.jpg map1 map2 ... (4 columns, labelled, < 400 KB)."""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

src, out, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
COLS, TW, TH, LAB = 4, 320, 180, 18
rows = (len(ids) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * TW, rows * (TH + LAB)), (16, 16, 20))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
except OSError:
    font = ImageFont.load_default()
for i, mid in enumerate(ids):
    x, y = (i % COLS) * TW, (i // COLS) * (TH + LAB)
    p = os.path.join(src, mid + '.jpg')
    if os.path.exists(p):
        im = Image.open(p).convert('RGB').resize((TW, TH), Image.LANCZOS)
        sheet.paste(im, (x, y + LAB))
    d.text((x + 6, y + 2), mid, fill=(230, 220, 200), font=font)
for q in (80, 72, 64, 56, 48):
    sheet.save(out, quality=q, optimize=True)
    if os.path.getsize(out) < 400 * 1024:
        break
print(out, os.path.getsize(out) // 1024, 'KB', sheet.size)
