"""Track 24: run every script in order.  `python3 run_all.py` (about 30 minutes with a warm scratchpad cache).

Order: reference check (Crossref, cached) -> EDGAR deal durations (cached) -> the six families -> CEF robustness ->
summary.  Every script reads earlier tracks' caches read-only and writes only to ./results and the scratchpad.
Bytecode writing is disabled so nothing lands in other tracks' folders.  Logs go to the scratchpad.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOGS = Path("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/24-duration-gaps/logs")
STEPS = [
    "refs24.py",                # literature check (Crossref; cached answers make it offline)
    "f1b_deal_durations.py",    # EDGAR: how long cash deals take to close (slow on a cold cache: SEC pacing)
    "f1_merger_arb.py",
    "f2_option_premium.py",
    "f3_sector_momentum.py",
    "f4_single_stock.py",
    "f5_cef_index.py",
    "f5b_cef_robustness.py",
    "f6_other.py",
    "summary24.py",
]


def main():
    LOGS.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    only = set(sys.argv[1:])
    for s in STEPS:
        if only and s not in only:
            continue
        t0 = time.time()
        log = LOGS / (Path(s).stem + ".log")
        with open(log, "w") as fh:
            rc = subprocess.run([sys.executable, str(HERE / s)], cwd=HERE, env=env, stdout=fh, stderr=subprocess.STDOUT).returncode
        print(f"{s:28s} exit {rc}  {time.time() - t0:6.0f}s  log {log}", flush=True)
        if rc != 0:
            sys.exit(rc)


if __name__ == "__main__":
    main()
