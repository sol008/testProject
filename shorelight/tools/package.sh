#!/usr/bin/env bash
# Build a clean, distributable zip of the playable game.
#
#   bash tools/package.sh                 # → dist/Shorelight-<version>-<yyyymmdd>.zip
#   bash tools/package.sh -o /some/dir    # write the zip elsewhere
#   bash tools/package.sh --offline       # don't rebuild the font; ship js/core/fontdata.js as it is
#
# The zip unpacks to one folder, Shorelight/, containing exactly what the game needs: index.html, css/, every
# script index.html loads (js/**, incl. the bundled font js/core/fontdata.js), the macOS launcher (executable),
# PLAYING.md, LICENSES.txt, fonts/OFL.txt, and electron-main.js + package.json for building the optional desktop app.
# Never included: tools/ (tests, previews, build scripts), docs/, design sources, screenshots/, node_modules/, dist/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/dist"
OFFLINE=0
while [ $# -gt 0 ]; do
  case "$1" in
    -o|--out) OUT_DIR="$2"; shift ;;
    --offline) OFFLINE=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -1)"
NAME="Shorelight-${VERSION:-0}-$(date +%Y%m%d)"
STAGE_PARENT="$(mktemp -d "${TMPDIR:-/tmp}/shorelight-pkg.XXXXXX")"
trap 'rm -rf "$STAGE_PARENT"' EXIT
STAGE="$STAGE_PARENT/Shorelight"
mkdir -p "$STAGE" "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
ZIP="$OUT_DIR/$NAME.zip"

echo "▸ staging $NAME"
cd "$ROOT"

# 1. every file index.html references (scripts + stylesheet) — fail loudly if one is missing
missing=0
while IFS= read -r ref; do
  case "$ref" in http:*|https:*|data:*|//*) continue ;; esac
  if [ "$ref" = "js/core/fontdata.js" ]; then continue; fi   # handled in step 2
  if [ ! -f "$ref" ]; then echo "  ✗ index.html references missing file: $ref" >&2; missing=1; continue; fi
  mkdir -p "$STAGE/$(dirname "$ref")"
  cp "$ref" "$STAGE/$ref"
done < <(grep -oE '(src|href)="[^"]+"' index.html | sed -E 's/^(src|href)="//; s/"$//')
[ "$missing" = 0 ] || { echo "aborting: fix the missing files above" >&2; exit 1; }
cp index.html "$STAGE/"

# 2. bundled font: rebuild from the current game text (so new chapters/translations are covered), else ship the
#    committed copy; as a last resort an empty stub (no 404; the game then uses the system Kaiti/Song fonts)
mkdir -p "$STAGE/js/core"
FONT_OK=0
if [ "$OFFLINE" = 0 ] && python3 "$ROOT/tools/build_font.py" --out "$STAGE/js/core/fontdata.js" | tail -3; then
  FONT_OK=1
elif [ -s js/core/fontdata.js ]; then
  echo "  ! font rebuild skipped/failed — using the committed js/core/fontdata.js"
  cp js/core/fontdata.js "$STAGE/js/core/fontdata.js"; FONT_OK=1
else
  echo "  ! no font bundle available — shipping a stub; Chinese text will use the Mac's system fonts" >&2
  printf '%s\n' '// Font bundle not built (run python3 tools/build_font.py). The game falls back to system fonts.' 'window.QD_FONTDATA = [];' > "$STAGE/js/core/fontdata.js"
fi

# 3. launcher, docs, licenses, optional Electron wrapper
cp "Play Shorelight.command" PLAYING.md LICENSES.txt electron-main.js package.json "$STAGE/"
mkdir -p "$STAGE/fonts" && cp fonts/OFL.txt "$STAGE/fonts/"

# 4. normalise permissions (the launcher must stay executable inside the zip) and drop OS junk
find "$STAGE" -type d -exec chmod 755 {} +
find "$STAGE" -type f -exec chmod 644 {} +
chmod 755 "$STAGE/Play Shorelight.command"
find "$STAGE" \( -name '.DS_Store' -o -name '*.tmp' -o -name '*~' \) -delete

# 5. zip (unix permissions are stored, so the .command keeps its executable bit when unzipped on a Mac)
rm -f "$ZIP"
(cd "$STAGE_PARENT" && zip -q -r -X -9 "$ZIP" Shorelight)

files=$(find "$STAGE" -type f | wc -l | tr -d ' ')
echo "▸ $ZIP"
echo "  $(du -h "$ZIP" | cut -f1) zipped ($(du -sh "$STAGE" | cut -f1) unpacked, $files files), font bundle: $([ "$FONT_OK" = 1 ] && du -h "$STAGE/js/core/fontdata.js" | cut -f1 || echo 'stub')"
