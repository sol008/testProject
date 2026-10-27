#!/usr/bin/env bash
# Run the whole Shorelight QA suite: content validator → unit tests → Playwright e2e.
#
#   tools/test/run.sh                 # full run (e2e sweeps every map and every troop)
#   tools/test/run.sh --quick         # e2e: scenario tests + map sweep + first 12 troops
#   tools/test/run.sh -- --only menu  # extra args after `--` go to e2e.js
#
# Exit code: 0 if every stage passed, 1 otherwise. Logs: tools/test/out/<stage>.log
set -u
cd "$(dirname "$0")/../.." || exit 2
OUT=tools/test/out
mkdir -p "$OUT"

E2E_ARGS=()
QUICK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) QUICK=1 ;;
    --) shift; E2E_ARGS+=("$@"); break ;;
    *) E2E_ARGS+=("$1") ;;
  esac
  shift
done
[ "$QUICK" = 1 ] && E2E_ARGS+=(--troops 12)

declare -a NAMES STATUS SUMMARY TIMES
run_stage() {
  local name="$1"; shift
  local t0=$(date +%s)
  echo
  echo "════════ $name ════════"
  "$@" 2>&1 | tee "$OUT/$name.log"
  local rc=${PIPESTATUS[0]}
  local t1=$(date +%s)
  NAMES+=("$name"); TIMES+=("$((t1 - t0))s")
  if [ "$rc" = 0 ]; then STATUS+=("PASS"); else STATUS+=("FAIL"); fi
  # last summary-looking line of the log
  SUMMARY+=("$(grep -E '^(validate|unit|e2e):' "$OUT/$name.log" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')")
}

run_stage validate node tools/test/validate.js
run_stage unit node tools/test/unit.js
run_stage e2e node tools/test/e2e.js "${E2E_ARGS[@]}"

echo
echo "┌────────────┬────────┬────────┬──────────────────────────────────────────────────────────────"
printf "│ %-10s │ %-6s │ %-6s │ %s\n" "stage" "result" "time" "summary"
echo "├────────────┼────────┼────────┼──────────────────────────────────────────────────────────────"
FAILED=0
for i in "${!NAMES[@]}"; do
  printf "│ %-10s │ %-6s │ %-6s │ %s\n" "${NAMES[$i]}" "${STATUS[$i]}" "${TIMES[$i]}" "${SUMMARY[$i]}"
  [ "${STATUS[$i]}" = "FAIL" ] && FAILED=1
done
echo "└────────────┴────────┴────────┴──────────────────────────────────────────────────────────────"
echo "logs: $OUT/{validate,unit,e2e}.log   e2e report: $OUT/e2e-report.json"
exit $FAILED
