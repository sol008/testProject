"""Track 37: run every script in order (about 10 seconds; live_records.py needs network).

python3 run_all.py
"""
from __future__ import annotations

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ["prompt_hash.py", "edge_shrinkage.py", "power.py", "live_records.py"]

if __name__ == "__main__":
    for s in SCRIPTS:
        print("=" * 100 + f"\n{s}\n" + "=" * 100)
        subprocess.run([sys.executable, os.path.join(HERE, s)], check=True)
