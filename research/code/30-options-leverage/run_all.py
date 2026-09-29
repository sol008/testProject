"""Reproduce every number in research/30-options-leverage.md.

  python run_all.py            # uses the cached track-04 data (TRACK04_DATA) and the saved 28 Sep 2026 chains
  python run_all.py --fetch    # also re-pulls live CBOE chains first (a new day's chains change s01's tables)

Order:
  s01_chain_check              real XSP/SPY/QQQ chains: spreads, box rates, carry, model-surface validation
  s02_vehicles                 question 1: vehicles x leverage x period, the deep-ITM call grid, PPUT check
  s03_distribution_gap_sizing  questions 2-3: rolling / bootstrap distributions, gap shocks, sizing, tax
Needs Python 3.11 with pandas, numpy, scipy, statsmodels, yfinance, requests, xlrd.
"""
import sys

import s01_chain_check
import s02_vehicles
import s03_distribution_gap_sizing

if __name__ == "__main__":
    if "--fetch" not in sys.argv:
        sys.argv = [sys.argv[0]]
    s01_chain_check.main()
    s02_vehicles.main()
    s03_distribution_gap_sizing.main()
