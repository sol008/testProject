"""Reproduce every table in research/34-hundred-percent-feasibility.md.

Usage:  python3 run_all.py      (about 2-3 minutes; fixed seeds)
Needs network on first run (Yahoo Finance for ^NDX, TQQQ, ^VXN; Ken French momentum deciles;
Coin Metrics BTC unless the track-15 cache exists). c_base_rates.py also needs the track-07
month-end panel (research/code/07-multibaggers/03_build_panels.py) in the session scratchpad.
"""
import runpy
import time

SCRIPTS = ["a_growth_math.py", "b_aggressive_systems.py", "c_base_rates.py"]

if __name__ == "__main__":
    for s in SCRIPTS:
        t0 = time.time()
        print(f"=== {s}")
        runpy.run_path(s, run_name="__main__")
        print(f"=== {s} done in {time.time() - t0:.0f}s\n")
