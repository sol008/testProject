"""Reproduce every number in research/36-century-view.md.

    python3 run_all.py            # ~10 minutes cold (downloads ~40 small series), ~3 minutes warm
    python3 run_all.py q4_manias  # one module

Raw downloads are cached in $CENTURY_CACHE (default: the scratchpad); only small CSVs go to results/.
Order matters: q6 reads q3's outputs.
"""
import runpy
import sys
import warnings

warnings.filterwarnings("ignore")
MODULES = ["q1_decade_winners", "q2_knowable", "q3_meta_rule", "q4_manias", "q5_today", "q6_verdict"]

if __name__ == "__main__":
    for m in sys.argv[1:] or MODULES:
        print(f"\n######## {m}", flush=True)
        runpy.run_module(m, run_name="__main__")
