#!/bin/sh
# tools/r3d/monsters_b/sheet.sh <id> <outdir> — clip sheet: idle, attack anticipation/impact, cast, hurt, die, special
cd "$(dirname "$0")"
node shot.js "ids=$1&set=idle:1,attack:0.3,attack:0.45,cast:0.5,hurt:0.12,die:0.55,special:0.5,walk:0.6&cols=4&yaw=10&pitch=32&dist=0.8&gap=${3:-1.25}" "$2/sheet_$1.png" | grep -iv pcf
