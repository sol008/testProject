#!/usr/bin/env python3
"""Bundle the LXGW WenKai TC font (SIL OFL 1.1) for offline play.

Scans every game source file (js/**, including the English dictionaries in js/i18n/ and every chapter
map/story file, plus index.html) for the characters actually used, downloads the Google Fonts
unicode-range slices that cover them, subsets each slice down to just those glyphs (fontTools, if
installed; otherwise whole slices are kept), and writes js/core/fontdata.js: base64 woff2 parts that
js/core/font.js registers with the FontFace API at boot as the family "QDKai".

Run from anywhere:  python3 tools/build_font.py [--out PATH]      (default PATH: js/core/fontdata.js)
Re-run whenever game text changes (new chapters, new translations), then reload the game.
Exit code 0 on success, 2 if the font source could not be reached (the existing output is left untouched).
Requires network access to fonts.googleapis.com / fonts.gstatic.com. Optional: pip install fonttools brotli
(without them the bundle is ~6 MB instead of ~2 MB).

js/core/fontdata.js is committed so a plain checkout plays offline with the real font; tools/package.sh rebuilds
it into the release zip so the shipped glyph set always matches the shipped text.
The font has no Reserved Font Name, so subsetting is permitted under the OFL; the name table (copyright,
license) is kept in every subset part. Full license: fonts/OFL.txt.
"""
import base64, io, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS_URL = 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&display=swap'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
OUT = os.path.join(ROOT, 'js', 'core', 'fontdata.js')

try:
    from fontTools import subset as ft_subset
    from fontTools.ttLib import TTFont
    import brotli  # noqa: F401  (needed for woff2 output)
    HAVE_FT = True
except Exception:  # pragma: no cover
    HAVE_FT = False


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def used_chars():
    """Every character in the game's sources: js/** (core, engine, data, gfx, r3d, story, maps, i18n) + index.html."""
    chars = set()
    for d, dirs, files in os.walk(os.path.join(ROOT, 'js')):
        dirs.sort()
        for f in sorted(files):
            if f.endswith('.js') and f != 'fontdata.js':
                with open(os.path.join(d, f), encoding='utf-8') as fh:
                    chars.update(fh.read())
    with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as fh:
        chars.update(fh.read())
    # always include ASCII and common punctuation
    chars.update(chr(c) for c in range(0x20, 0x7f))
    chars.update('，。、！？；：「」『』（）《》〈〉…—～・　０１２３４５６７８９')
    return {ord(c) for c in chars if ord(c) >= 0x20}


def parse_ranges(rng):
    out = []
    for part in rng.split(','):
        part = part.strip().upper().replace('U+', '')
        if '-' in part:
            a, b = part.split('-')
            out.append((int(a, 16), int(b, 16)))
        elif part:
            v = int(part, 16)
            out.append((v, v))
    return out


def format_ranges(cps):
    """Sorted code points -> CSS unicode-range string ('U+20-7e, U+4e00')."""
    cps = sorted(cps)
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f'U+{cps[i]:x}' if i == j else f'U+{cps[i]:x}-{cps[j]:x}')
        i = j + 1
    return ', '.join(out)


def subset_woff2(data, cps):
    """Subset one woff2 slice to the given code points; returns (woff2 bytes, code points actually in the font)."""
    font = TTFont(io.BytesIO(data))
    cmap = font.getBestCmap() or {}
    keep = [c for c in cps if c in cmap]
    if not keep:
        return None, []
    opts = ft_subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']          # keep copyright / license / designer records (OFL)
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    sub = ft_subset.Subsetter(options=opts)
    sub.populate(unicodes=keep)
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = 'woff2'
    font.save(buf)
    return buf.getvalue(), keep


def main():
    out = OUT
    if '--out' in sys.argv:
        out = os.path.abspath(sys.argv[sys.argv.index('--out') + 1])
    try:
        css = fetch(CSS_URL).decode('utf-8')
    except Exception as e:
        print(f'cannot reach Google Fonts ({e}); {out} left unchanged', file=sys.stderr)
        sys.exit(2)
    blocks = re.findall(r'src:\s*url\((.*?)\).*?unicode-range:\s*(.*?);', css, re.S)
    print('slices available:', len(blocks), '| subsetting:', 'fontTools' if HAVE_FT else 'OFF (pip install fonttools brotli)')
    need = used_chars()
    parts = []
    covered = set()
    raw_total = out_total = 0
    for url, rng in blocks:
        ranges = parse_ranges(rng)
        hits = [c for c in need if any(a <= c <= b for (a, b) in ranges)]
        if not hits:
            continue
        data = fetch(url)
        raw_total += len(data)
        if HAVE_FT:
            sub, keep = subset_woff2(data, hits)
            if not sub:
                continue
            covered.update(keep)
            parts.append((format_ranges(keep), sub))
            out_total += len(sub)
        else:
            covered.update(hits)
            parts.append((rng.strip(), data))
            out_total += len(data)
        sys.stdout.write('.'); sys.stdout.flush()
    print()
    missing = sorted(c for c in need if c not in covered and c > 0x7f)
    print(f'slices used: {len(parts)}, downloaded: {raw_total} bytes, bundled woff2: {out_total} bytes, '
          f'chars needed: {len(need)}, covered: {len(covered)}, uncovered: {len(missing)}')
    if missing:
        # typically emoji (drawn by the system emoji font) and characters that only occur in code comments/regexes
        print('uncovered (system fallback):', ' '.join(f'{chr(c)}(U+{c:04X})' for c in missing[:60]))
    tmp = out + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write('// Generated by tools/build_font.py — LXGW WenKai TC (霞鶩文楷), SIL Open Font License 1.1.\n')
        fh.write('// https://github.com/lxgw/LxgwWenkaiTC — see fonts/OFL.txt. Do not edit; re-run the script.\n')
        fh.write('window.QD_FONTDATA = [\n')
        for rng, data in parts:
            fh.write(f'{{range:"{rng}",data:"{base64.b64encode(data).decode("ascii")}"}},\n')
        fh.write('];\n')
    os.replace(tmp, out)  # atomic: a failed run never leaves a half-written font file behind
    print('wrote', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    main()
