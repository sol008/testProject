"""Compact report tables: random-day baselines (common 2007-2026 sample) and pivots of the scheduled-event buckets."""
from __future__ import annotations

import pandas as pd

from lib17 import SCRATCH, YIELD_LIKE, asset_panel, baseline_stats

P = asset_panel()


def baselines():
    rows = []
    for a in ["SPY", "TLT", "GOLD", "UUP", "USO", "BTC", "UST2Y", "UST10Y", "SPX"]:
        for h in [1, 5, 20, 60]:
            st = "2007-03-01" if a != "SPX" else "1928-01-01"
            b = baseline_stats(P[a], h, start=st, is_yield=a in YIELD_LIKE)
            rows.append({"asset": a, "h": h, **{k: round(v, 2) for k, v in b.items()}})
    t = pd.DataFrame(rows)
    print("=== Random-day baseline (all days; 2007-03..2026-09 except SPX 1928+): forward return %, yields bp")
    print(t.pivot_table(index="asset", columns="h", values=["mean", "sd", "hit"]).round(2).to_string())
    t.to_csv(SCRATCH / "baseline_table.csv", index=False)


def pivots():
    b = pd.read_csv(SCRATCH / "sched_all_buckets.csv")
    b[["event", "bucket", "asset"]] = b["set"].str.split("|", expand=True)
    for w in ["f5", "f20"]:
        x = b[b.window == w]
        print(f"\n=== {w}: mean (excess vs placebo, p) by event/bucket/asset")
        x = x.assign(cell=x.apply(lambda r: f"{r['mean']:+.2f} ({r['excess']:+.2f}, p={r['p_placebo']:.2f}) n={int(r['n'])}", axis=1))
        print(x.pivot_table(index=["event", "bucket"], columns="asset", values="cell", aggfunc="first").to_string())


if __name__ == "__main__":
    baselines()
    pivots()
