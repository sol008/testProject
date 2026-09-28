"""Re-run the whole of track 13 in order (about 5 minutes after the cache is warm).

    python3 run_all.py            # uses the scratchpad cache (downloads what is missing)
    python3 run_all.py --refresh  # re-download all market data first
"""
import subprocess
import sys
import time

STEPS = ["s00_data.py", "s01_panic.py", "s02_meanrev.py", "s03_momentum.py", "s04_calendar.py",
         "s05_overnight.py", "s06_extras.py", "s08_summary.py", "s10_scorecard.py", "s07_current.py"]

if __name__ == "__main__":
    for s in STEPS:
        t0 = time.time()
        args = [sys.executable, s] + (["--refresh"] if (s == "s00_data.py" and "--refresh" in sys.argv) else [])
        r = subprocess.run(args, capture_output=True, text=True)
        print(f"{s:20s} rc={r.returncode} {time.time() - t0:6.1f}s  {r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''}")
        if r.returncode != 0:
            print(r.stderr[-3000:])
            sys.exit(r.returncode)
