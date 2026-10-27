#!/bin/bash
# usage: tools/r3d/nature/shots.sh outdir "qs1" "qs2" ...   — renders each query string with the asset viewer
out=$1; shift; mkdir -p "$out"; i=0
for q in "$@"; do node "$(dirname "$0")/../shot.js" "$q" "$out/s$i.png" & i=$((i+1)); done; wait
