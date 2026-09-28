"""Reproduce every result of track 06 (few-trade backtests).

    python3 run_all.py            # ~5-10 minutes; downloads/caches raw data in $BT06_CACHE (scratchpad)

Order: data warm-up -> crash-buying (US) -> failure markets + IS/OOS filters -> trend following ->
Bitcoin -> CAPE -> other rules -> leaderboard -> current status -> report tables.
Outputs: results/*.csv (small) ; large intermediate files stay in the scratchpad cache.
"""
import runpy
import sys

MODULES = ["crash_buy", "intl", "trend", "trend_intl", "btc", "cape", "other_rules", "leaderboard", "status", "report_tables"]

if __name__ == "__main__":
    todo = sys.argv[1:] or MODULES
    for m in todo:
        print(f"\n######## {m}", flush=True)
        runpy.run_module(m, run_name="__main__")
