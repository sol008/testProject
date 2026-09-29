"""Reproduce every number in research/27-momentum-rotation.md.

    python3 run_all.py            # 15-30 minutes on 4 cores with a warm cache (downloads on first run)

Order matters: s01 and s02 write the variant registries (full copies in the scratchpad, trimmed
copies in results/) that s03-s05 read.
"""
from __future__ import annotations

import time

import s00_data
import s01_etf_grid
import s02_kf_grid
import s03_leverage
import s04_select_test
import s05_forward

if __name__ == "__main__":
    for name, fn in [("s00 data", s00_data.main), ("s01 ETF grid", s01_etf_grid.main),
                     ("s02 Ken French grid", s02_kf_grid.main), ("s03 leverage", s03_leverage.main),
                     ("s04 selection and tests", s04_select_test.main), ("s05 forward view", s05_forward.main)]:
        t = time.time()
        print(f"\n===== {name} =====", flush=True)
        fn()
        print(f"----- {name}: {time.time() - t:.0f}s", flush=True)
