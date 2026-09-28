"""Reproduce every table in research/03-sizing-and-growth-math.md.

Usage:  python3 run_all.py            (about 5 minutes on 4 cores)
Outputs: results/*.csv and results/*.md. All random draws use fixed seeds (common.SEED).
Data: data/F-F_Research_Data_Factors_daily.csv (Kenneth French Data Library, CRSP-based,
through Aug 2026). yfinance is only used to validate the leveraged-ETF cost model.
"""
import runpy
import time

SCRIPTS = ["sim_ab_trades_to_goal.py", "sim_c_estimation_error.py", "sim_e_power.py",
           "sim_f_goal_seeking.py", "sim_g_misc.py", "sim_d_barbell.py"]

if __name__ == "__main__":
    for s in SCRIPTS:
        t0 = time.time()
        print(f"=== {s}")
        runpy.run_path(s, run_name="__main__")
        print(f"=== {s} done in {time.time() - t0:.0f}s\n")
