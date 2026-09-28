"""Track 14 - short-horizon (1-60 day) options and volatility strategies.  Runs every step in order.

    python run_all.py            # uses cached raw data (scratchpad) and the cached 2026-09-28 chain
    python run_all.py --snapshot # also re-pulls today's short-dated option chains (s00)

Steps (outputs in ./output):
  s00  live chain snapshot (SPX/XSP/SPY/QQQ/IWM, <=70 DTE)            chain_short_*.csv (scratchpad)
  s01  CBOE strategy indices (real prices) vs S&P 500 TR               cboe_index_*.csv
  s02  calibrate the synthetic SPX surface to PUT/PUTY/CNDR/BFLY        model_calibration_vs_cboe.csv, model_settings.csv
  s01b per-cycle ("per trade") stats of the real-price indices          s01b_cboe_per_cycle.csv
  s03  840-variant grid: SPX put credit spreads / iron condors          s03_variant_stats.csv, s03_trades_all.csv.gz
  s03b sizing (robust Kelly), portfolio sims, crisis trades, tax        s03b_*.csv
  s03c deflated Sharpe / Bonferroni, calendar-year P&L                  s03c_*.csv
  s04  event volatility: FOMC/CPI/NFP (VIX1D, VIX9D), earnings          s04*_*.csv
  s04f conditional event-straddle rule                                  s04f_*.csv
  s05  post-crash / vol-spike trades: stock vs calls vs spreads         s05_*.csv
  s06  0DTE/1DTE (VIX1D) and weekly vs monthly put-write                s06_*.csv
  s07  practicalities from the live chain: costs, margin, event moves   s07_*.csv
  s08  Bitcoin variance risk premium (Deribit DVOL)                     s08_*.csv
  s09  figures                                                          fig_*.png
Event calendars: event_data/ (CPI and NFP release dates parsed from BLS archive filenames; FOMC from track 02).
"""
from __future__ import annotations

import runpy
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ["s01_cboe_indices", "s02_calibrate_model", "s01b_cboe_per_trade", "s03_credit_spreads",
         "s03b_sizing_tails", "s03c_dsr_and_years", "s04_event_vol", "s04f_event_rule_test",
         "s05_crash_and_spike_trades", "s06_0dte_weeklies", "s07_practicalities", "s08_crypto_vrp", "s09_figures"]

if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    if "--snapshot" in sys.argv:
        sys.argv = ["s00_chain_snapshot.py"]
        runpy.run_path(str(HERE / "s00_chain_snapshot.py"), run_name="__main__")
    for s in STEPS:
        t0 = time.time()
        print(f"=== {s}", flush=True)
        sys.argv = [f"{s}.py"]
        runpy.run_path(str(HERE / f"{s}.py"), run_name="__main__")
        print(f"=== {s} done in {time.time() - t0:.0f}s", flush=True)
