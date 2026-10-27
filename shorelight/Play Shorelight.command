#!/bin/bash
# 彼岸燈 Shorelight — macOS launcher.  See PLAYING.md.
# Double-click to play. Opens the game in its own window (Chrome / Edge / Brave / Chromium app mode),
# falling back to Safari or your default browser. No internet, server or installation required.
#
# First run only: macOS may block this file because it was downloaded. Right-click (Control-click) it → Open → Open.
# On macOS 15 Sequoia and later: double-click once, then System Settings → Privacy & Security → "Open Anyway".
#
# Saves are kept in a dedicated browser profile: ~/Library/Application Support/Shorelight/browser-profile
# (so they never mix with your normal browsing and survive browser updates).

# Folder this script lives in — works with spaces, CJK and other special characters in the path.
DIR="$(cd "$(dirname "$0")" && pwd -P)"
GAME="$DIR/index.html"

if [ ! -f "$GAME" ]; then
  MSG="找不到遊戲檔案 index.html。請將整個 Shorelight 資料夾解壓縮後再執行。 / Can't find index.html next to this launcher. Unzip the whole Shorelight folder first, then try again."
  osascript -e "display alert \"彼岸燈 Shorelight\" message \"$MSG\" as critical" >/dev/null 2>&1 || echo "$MSG"
  exit 1
fi

# Percent-encode the path for a file:// URL (byte-wise, so it is safe for spaces, '#', '%', '?' and UTF-8 names).
urlencode_path() {
  local hex out="" b ch
  hex="$(printf '%s' "$1" | od -An -v -tx1 | tr -d ' \n')"
  while [ -n "$hex" ]; do
    b="${hex:0:2}"; hex="${hex:2}"
    case "$b" in
      2[def]|3[0-9]|4[1-9a-f]|5[0-9af]|6[1-9a-f]|7[0-9ae]) printf -v ch "\\x$b"; out="$out$ch" ;;  # - . / 0-9 A-Z _ a-z ~
      *) out="$out%$b" ;;
    esac
  done
  printf '%s' "$out"
}
URL="file://$(urlencode_path "$GAME")"
# Low-spec Macs: run   "./Play Shorelight.command" lite   in Terminal for the light 3D mode
# (half resolution, no shadows, no post-processing) — same as adding ?r3lite to the address.
[ "${1:-}" = "lite" ] && URL="$URL?r3lite"

PROFILE="$HOME/Library/Application Support/Shorelight/browser-profile"
mkdir -p "$PROFILE"

# Chromium-family browsers support --app (a clean game window without tabs / address bar).
for APP in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  if open -Ra "$APP" >/dev/null 2>&1 || [ -d "/Applications/$APP.app" ] || [ -d "$HOME/Applications/$APP.app" ]; then
    # --ignore-gpu-blocklist: use WebGL / GPU acceleration even on older Macs whose GPU Chrome blocklists
    #   (the game falls back to its 2D renderer by itself if WebGL is still unavailable).
    # --autoplay-policy: let the synthesised music start without an extra click.
    open -na "$APP" --args \
      --app="$URL" \
      --user-data-dir="$PROFILE" \
      --window-size=1280,760 \
      --no-first-run --no-default-browser-check \
      --ignore-gpu-blocklist \
      --autoplay-policy=no-user-gesture-required
    exit 0
  fi
done

# Fallback: Safari (fully supported — WebGL 2, Web Audio, saves in Safari's local storage), else the default browser.
# Tip for Safari: View → Enter Full Screen (⌃⌘F) for the best experience. Saves made in Safari stay in Safari.
if open -Ra "Safari" >/dev/null 2>&1; then
  open -a "Safari" "$URL"
else
  open "$URL"
fi
exit 0
