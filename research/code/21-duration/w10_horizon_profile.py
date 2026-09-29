"""Diagnostic (not a selection step): W10 tradable mean, era-placebo edge and p across holding lengths
H = 20..100 sessions, 1990-2026 (n = 21) and 1928-1989 (n = 39, next-close entry)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from common21 import RNG_SEED, placebo_p, save
import w10_duration as W


def main():
    df = W.panel()
    ev = W.crash_events(df)
    idx = df.index
    n = len(df)
    rows = []
    for H in list(range(20, 101, 5)) + [42, 63, 84]:
        f = W.forward_tables(df, H)
        for lab, sel, key in (("1990-2026 tradable", [i for i in ev if idx[i] >= pd.Timestamp("1990-01-01") and i + 1 + 100 < n], "trad"),
                              ("1928-1989 next close", [i for i in ev if idx[i] < pd.Timestamp("1990-01-01")], "nc"),
                              ("1928-1989 signal close", [i for i in ev if idx[i] < pd.Timestamp("1990-01-01")], "px")):
            v = f[key]
            x = v[sel]
            rng = np.random.default_rng(RNG_SEED + H)
            draws = np.zeros(2000)
            for i in sel:
                a, b = max(0, i - 756), min(n - 2 - H, i + 756)
                draws += v[rng.integers(a, b + 1, size=2000)]
            draws /= len(sel)
            rows.append(dict(sample=lab, H=H, n=len(sel), mean=np.nanmean(x), median=np.nanmedian(x),
                             placebo=draws.mean(), edge=np.nanmean(x) - draws.mean(), p_era=placebo_p(np.nanmean(x), draws)))
    R = pd.DataFrame(rows).drop_duplicates(["sample", "H"]).sort_values(["sample", "H"])
    save(R, "w10_horizon_profile")
    pd.set_option("display.width", 200)
    print(R.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
