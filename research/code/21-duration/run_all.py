"""Run every track 21 script in order (about 1-2 minutes on one core; all data come from earlier tracks' caches).

    python3 run_all.py
"""
import runpy
import sys

STEPS = [
    ("w10_duration.py", []),
    ("w10_horizon_profile.py", []),
    ("w10_nonoverlap.py", []),
    ("o2_duration.py", []),
    ("o2_duration.py", ["--forward"]),
    ("w8_w9_duration.py", []),
    ("m1_duration.py", []),
    ("portfolio_duration.py", []),
    ("summary21.py", []),
]

if __name__ == "__main__":
    for script, args in STEPS:
        print(f"\n===== {script} {' '.join(args)}", flush=True)
        sys.argv = [script] + args
        runpy.run_path(script, run_name="__main__")
