"""Track 23: reproduce every number in research/23-duration-cap-verification.md.

    python3 run_all.py          (about 1 minute on one core; reads the earlier tracks' cached raw data)

Order: s1 (W10 replication) -> s2 (rule details, cluster simulation, kill switches) -> s3 (portfolio) ->
s4 (reconciliation, clustering, deflated Sharpe, claims table) -> variant registry.
All outputs are small CSVs in results/.  No code from tracks 13, 15, 21 or 22 is imported; tracks 21/22
OUTPUT files are read only to reconcile against them.
"""
from __future__ import annotations

import time

import common23 as K
import s1_w10_replication as S1
import s2_w10_rules as S2
import s3_portfolio as S3
import s4_reconcile_mt as S4


def main():
    t0 = time.time()
    for name, mod in (("s1 W10 replication", S1), ("s2 rule details", S2), ("s3 portfolio", S3),
                      ("s4 reconciliation", S4)):
        print(f"\n==================== {name}", flush=True)
        mod.main()
    print("\n==================== variant registry")
    print(S4.registry().to_string(index=False))
    print(f"\nregistry rows: {len(K.REG)}; done in {time.time() - t0:.0f} s; outputs in {K.RESULTS}")


if __name__ == "__main__":
    main()
