"""Re-run every track-04 study in dependency order.

  python run_all.py            # uses cached data in TRACK04_DATA (downloads if missing)

Order matters:
  s06  live option-chain snapshot  (ONLY re-run deliberately: it overwrites nothing
       historical but produces a new dated chain file; s02 is pinned to the
       2026-09-28 snapshot via SNAP_FILE / SNAP_VIX / SNAP_VIX1Y)
  s01  VIX vs realised-vol study           -> output/vrp_*.csv, vrp_panel.csv.gz
  s02  synthetic option back-tests         -> output/options_*.csv, straddle_1m_screens.csv
  s03  leveraged ETFs, 1928-2026 sims      -> output/letf_*.csv
  s04  CBOE strategy indices (real prices) -> output/cboe_*.csv
  s05  vol ETPs, BTC/FX leverage, credit   -> output/vol_etps_summary.csv, btc_*, eurusd_*, credit_*
  s08  misc checks (IV-vs-forecast, box rates, stock replacement, spreads, 1 trade/yr)
  s07  figures
All outputs land in ./output/.  Data end date is pinned in common.END_DATE.
"""
import importlib
import sys

STEPS = ["s01_vrp_analysis", "s02_synthetic_options_backtest", "s03_letf_analysis",
         "s04_cboe_strategy_indices", "s05_vol_crypto_fx_credit"]

if __name__ == "__main__":
    if "--snapshot" in sys.argv:
        importlib.import_module("s06_option_chain_snapshot").main()
    for s in STEPS:
        print(f"\n######## {s} ########")
        importlib.import_module(s).main()
    m = importlib.import_module("s08_misc_checks")
    for f in ("iv_vs_forecast", "box_rate", "stock_replacement", "regime_now", "spreads_from_trades",
              "one_trade_per_year"):
        getattr(m, f)()
    f = importlib.import_module("s07_figures")
    f.fig_vrp(); f.fig_option_returns(); f.fig_letf()
