"""Track 26 - leveraged index trend core.  Reproduces every number in research/26-leveraged-trend-core.md.

    python run_all.py            # about 6-12 minutes; downloads are cached in TRACK26_CACHE

Order: s00 calibration -> s01 variant grid -> s02 finalists, exit assets, real ETFs -> s03 tails and
bootstrap -> s04 multiple testing (needs s01's cached returns) -> s05 forward scenarios -> s06 venue check.
"""
from __future__ import annotations

import time

import s00_calibrate
import s01_grid
import s02_finalists
import s03_tails
import s04_multiple_testing
import s05_forward
import s06_venue_check


def main():
    t0 = time.time()
    for name, fn in [("s00 calibration", s00_calibrate.main), ("s01 grid", s01_grid.main),
                     ("s02 finalists", lambda: (s02_finalists.finalists(), s02_finalists.exit_assets(),
                                                s02_finalists.real_etfs(), s02_finalists.ixic_splice_check())),
                     ("s03 tails", lambda: (s03_tails.oct_1987(), s03_tails.crash_paths(), s03_tails.bootstrap_hist(),
                                            s03_tails.stress_and_te())),
                     ("s04 multiple testing", s04_multiple_testing.main),
                     ("s05 forward", lambda: (s05_forward.split_in_out(), s05_forward.scenarios())),
                     ("s06 venue check", s06_venue_check.main)]:
        print(f"\n===== {name} =====", flush=True)
        fn()
        print(f"[{name} done at {time.time() - t0:.0f}s]", flush=True)


if __name__ == "__main__":
    main()
