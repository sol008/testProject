"""Run the full track-08 data pull + analysis in order.

    python run_all.py            # everything (takes ~10-15 min; network required)
    python run_all.py --fast     # skip the slow option-chain pulls

Environment overrides: TRACK08_SCRATCH (cache dir), TRACK08_ASOF (label only).
Order / outputs (all in SCRATCH):
  fetch_market.py              -> market_close.csv, market_meta.csv            (yfinance, ~230 tickers)
  fetch_fred.py                -> fred_<ID>.csv, fred_all.csv                  (FRED public CSV)
  fetch_valuation.py           -> shiller_ie.csv (Yale file is stale after 2023-09; live CAPE taken from multpl in report)
  fetch_prediction_markets.py  -> pm_markets.csv, kalshi_markets.csv           (Polymarket gamma + Kalshi public API)
  analyze_snapshot.py          -> snapshot_market.csv, snapshot_ratios.csv
  analyze_macro.py             -> snapshot_macro.csv
  analyze_btc_cycle.py         -> btc_cycle.csv
  analyze_event_studies.py     -> printed base rates
  fetch_options.py             -> options_iv.csv                               (yfinance option chains)
  price_structures.py          -> structures.csv
  implied_probs.py             -> printed risk-neutral probabilities
Futures curves (CL/BZ/NG/GC/HG by contract month) and the MOF JGB curve were pulled ad hoc; see
futures_and_jgb.py.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
STEPS = ["fetch_market.py", "fetch_fred.py", "fetch_valuation.py", "fetch_prediction_markets.py",
         "futures_and_jgb.py", "analyze_snapshot.py", "analyze_macro.py", "analyze_btc_cycle.py",
         "analyze_event_studies.py", "fetch_options.py", "price_structures.py", "implied_probs.py"]
SLOW = {"fetch_options.py", "price_structures.py"}


def main():
    fast = "--fast" in sys.argv
    for step in STEPS:
        if fast and step in SLOW:
            continue
        print(f"\n######## {step}")
        r = subprocess.run([sys.executable, str(HERE / step)], cwd=HERE)
        if r.returncode != 0:
            print(f"step {step} failed with code {r.returncode}; continuing", file=sys.stderr)


if __name__ == "__main__":
    main()
