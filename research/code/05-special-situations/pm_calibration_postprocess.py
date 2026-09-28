"""Post-process the complete-event Polymarket panel: net-of-cost returns, stability by year/category.

Cost model for a buyer at quoted price p (history = mid/last): pay p + HALF_SPREAD, plus a
2026-style taker fee RATE*p*(1-p) (Polymarket charged ~no fees on most markets before 2026,
so 'pre-fee' is the historical figure and 'net' is the forward-looking one).

Run: python pm_calibration_postprocess.py   Output: output/pm_poly_events_net.json
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import OUT, save_json
from pm_calibration_polymarket import BUCKETS, boot_ci

HALF_SPREAD = 0.005
RATE = 0.04


def table(df: pd.DataFrame, col: str) -> pd.DataFrame:
    d = df.dropna(subset=[col])
    d = d[(d[col] > 0) & (d[col] < 1)]
    both = pd.concat([d.assign(price=d[col], win=d["y"]), d.assign(price=1 - d[col], win=1 - d["y"])])
    cost = both["price"] + HALF_SPREAD + RATE * both["price"] * (1 - both["price"])
    both["ret_pre"] = both["win"] / both["price"] - 1
    both["ret_net"] = both["win"] / cost.clip(upper=0.9999) - 1
    both["bucket"] = pd.cut(both["price"], BUCKETS, right=False)
    rows = []
    for b, g in both.groupby("bucket", observed=True):
        lo, hi = boot_ci(g, "ret_net")
        rows.append({"bucket": str(b), "n": len(g), "events": g["event_id"].nunique(), "price": round(g["price"].mean(), 4),
                     "win": round(g["win"].mean(), 4), "ret_pre_%": round(100 * g["ret_pre"].mean(), 2),
                     "ret_net_%": round(100 * g["ret_net"].mean(), 2), "net_ci_lo_%": round(100 * lo, 2), "net_ci_hi_%": round(100 * hi, 2)})
    return pd.DataFrame(rows), both


def main():
    df = pd.read_csv(OUT / "pm_poly_events_calibration_panel.csv.gz", dtype={"event_id": str})
    out = {}
    for k in (1, 7, 30):
        tab, both = table(df, f"p{k}")
        out[f"h{k}d"] = tab.to_dict(orient="records")
        print(f"\n=== horizon {k}d ===\n", tab.to_string())
    # stability: favourites 0.90-0.98 and longshots 0.02-0.10 at 7d, by category
    tab, both = table(df, "p7")
    fav = both[(both["price"] >= 0.90) & (both["price"] < 0.98)]
    ls = both[(both["price"] >= 0.02) & (both["price"] < 0.10)]
    out["h7d_fav_0.90_0.98_by_category"] = fav.groupby("category").agg(n=("win", "size"), win=("win", "mean"), price=("price", "mean"),
                                                                       ret_net=("ret_net", "mean")).round(4).reset_index().to_dict(orient="records")
    out["h7d_longshot_0.02_0.10_by_category"] = ls.groupby("category").agg(n=("win", "size"), win=("win", "mean"), price=("price", "mean"),
                                                                           ret_net=("ret_net", "mean")).round(4).reset_index().to_dict(orient="records")
    print(pd.DataFrame(out["h7d_fav_0.90_0.98_by_category"]).to_string())
    print(pd.DataFrame(out["h7d_longshot_0.02_0.10_by_category"]).to_string())
    save_json(out, "pm_poly_events_net.json")


if __name__ == "__main__":
    main()
