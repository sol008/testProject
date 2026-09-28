"""Count every result cell tested in track 16 (the data-mining ledger) and the implied
Bonferroni thresholds.  Reads the summary CSVs written by the study scripts.
Output: output/variant_ledger.csv, output/variant_ledger.json
"""
from __future__ import annotations

import pandas as pd
from scipy.stats import norm

from common import OUT, save_json

FILES = {
    "insider grid (36 variants x 3 horizons x IS/OOS)": ("insider_variant_grid.csv", lambda d: len(d) * 3),
    "insider baseline tables (W,K x period x size x h)": ("insider_baseline_by_bucket.csv", len),
    "insider strength bins": ("insider_strength_bins.csv", len),
    "earnings setups": ("earnings_setups.csv", len),
    "activist 13D": ("activist_13d_summary.csv", len),
    "buyback 8-K": ("buyback_8k_summary.csv", len),
    "S&P 500 changes": ("sp500_changes_summary.csv", len),
    "special dividends": ("special_div_summary.csv", len),
    "spin-offs": ("spinoff_summary.csv", len),
    "IPO lock-ups": ("lockup_summary.csv", len),
    "issuer tenders": ("issuer_tender_follower.csv", len),
    "FDA decisions": ("pdufa_runup.csv", len),
    "short squeeze": ("short_squeeze_summary.csv", len),
    "Russell proxy": ("russell_proxy.csv", lambda d: 8),
}


def main():
    rows = []
    for fam, (f, fn) in FILES.items():
        p = OUT / f
        n = fn(pd.read_csv(p)) if p.exists() else 0
        rows.append({"family": fam, "cells": int(n), "file": f})
    df = pd.DataFrame(rows)
    total = int(df["cells"].sum())
    df.to_csv(OUT / "variant_ledger.csv", index=False)
    res = {"total_cells": total,
           "bonferroni_z_5pct_two_sided_all_cells": round(float(norm.ppf(1 - 0.05 / (2 * total))), 2),
           "bonferroni_z_5pct_two_sided_per_family_of_50": round(float(norm.ppf(1 - 0.05 / 100)), 2),
           "harvey_liu_zhu_rule_of_thumb_t": 3.0}
    save_json(res, "variant_ledger.json")
    print(df.to_string())
    print(res)


if __name__ == "__main__":
    main()
