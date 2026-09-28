"""s01b - Per-trade view of the REAL-price CBOE indices: one monthly cycle (third Friday to third Friday)
= one trade.  CNDR/BFLY hold T-bills = 10 x max loss, so 10 x (index return - T-bill return) is the P&L
per unit of max loss (mid-quote fills, no retail costs, held to expiry, no management, no filters).
PUT/PUTY: P&L per unit of notional (cash-secured).  Kelly fraction in units of max loss / notional."""
from __future__ import annotations

import numpy as np
import pandas as pd

from common14 import OUT, kelly_fraction, log_growth, save


def main():
    j = pd.read_csv(OUT / "model_vs_actual_monthly.csv", header=[0, 1], index_col=0, parse_dates=True)
    act = j["actual"]
    rows = []
    for k, scale in [("CNDR", 10), ("BFLY", 10), ("PUT", 1), ("PUTY", 1)]:
        for per, a, b in [("IS 1990-2007", "1990", "2007"), ("OOS 2008-2026", "2008", "2026"), ("post-2010", "2010", "2026")]:
            x = (act[k].loc[a:b].dropna() * scale).values
            if len(x) < 12:
                continue
            fk = kelly_fraction(x, fmax=1.0 if scale == 10 else 3.0)
            rows.append(dict(index=k, unit="max loss" if scale == 10 else "notional", period=per, n=len(x),
                             win=(x > 0).mean(), avg_win=x[x > 0].mean(), avg_loss=x[x <= 0].mean(), mean=x.mean(),
                             median=np.median(x), worst=x.min(), t=x.mean() / (x.std() / np.sqrt(len(x))),
                             kelly=fk, glog_yr_quarter=12 * log_growth(x, fk / 4)))
    r = pd.DataFrame(rows)
    save(r, "s01b_cboe_per_cycle", index=False)
    print(r.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
