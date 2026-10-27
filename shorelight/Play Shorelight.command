#!/bin/bash
# 彼岸燈 Shorelight — macOS launcher.
# Double-click to play. Opens the game in its own window (Chrome / Edge / Brave app mode),
# falling back to your default browser (Safari works too). No internet required.
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="file://${DIR}/index.html"
PROFILE="$HOME/Library/Application Support/Shorelight/browser-profile"
mkdir -p "$PROFILE"
for APP in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  if [ -d "/Applications/$APP.app" ] || [ -d "$HOME/Applications/$APP.app" ]; then
    open -na "$APP" --args --app="$URL" --user-data-dir="$PROFILE" --window-size=1280,760 --autoplay-policy=no-user-gesture-required
    exit 0
  fi
done
open "$URL"
