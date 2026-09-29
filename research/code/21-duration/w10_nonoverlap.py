"""W10 with one position at a time (events inside an open W10 hold are skipped): effective trade count,
mean and era/uptrend placebo p per cap, 1990-2026 tradable series."""
from __future__ import annotations

import numpy as np
import pandas as pd

from common21 import RNG_SEED, placebo_p, save
import w10_duration as W


def main():
    df = W.panel()
    idx = df.index
    n = len(df)
    ev = [i for i in W.crash_events(df) if idx[i] >= pd.Timestamp("1990-01-01") and i + 85 < n]
    C, ma = df["C"].values, df["ma200"].values
    upmask = np.r_[False, C[:-1] > ma[:-1]] & (np.arange(n) + 86 < n) & (idx >= "1990-01-01")
    pool = np.where(upmask)[0]
    rows = []
    for H in (42, 63, 84):
        f = W.forward_tables(df, H)["trad"]
        taken, last_exit = [], -1
        for i in ev:
            if i + 1 > last_exit:
                taken.append(i)
                last_exit = i + H
        x = f[taken]
        rng = np.random.default_rng(RNG_SEED + 100 + H)
        era = np.zeros(5000)
        for i in taken:
            a, b = max(0, i - 756), min(n - 2 - H, i + 756)
            era += f[rng.integers(a, b + 1, size=5000)]
        era /= len(taken)
        up = f[rng.choice(pool, size=(5000, len(taken)))].mean(axis=1)
        skipped = [idx[i].date().isoformat() for i in ev if i not in taken]
        rows.append(dict(H=H, n_events=len(ev), n_trades=len(taken), mean=x.mean(), median=np.median(x),
                         hit=(x > 0).mean(), era_placebo=era.mean(), p_era=placebo_p(x.mean(), era),
                         up_placebo=up.mean(), p_up=placebo_p(x.mean(), up), skipped="; ".join(skipped)))
    R = pd.DataFrame(rows)
    save(R, "w10_nonoverlap")
    pd.set_option("display.width", 250)
    print(R.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
