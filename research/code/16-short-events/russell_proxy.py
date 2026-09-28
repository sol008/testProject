"""Russell reconstitution: index-level proxy only (stock-level membership changes are not in
free point-in-time data).

Recon day R = last Friday of June (the annual reconstitution through 2025; FTSE Russell moves
to semi-annual reconstitution from 2026 [verify]).  Rank day ~ April 30.
Measures (total return):
  IWM - IWB : Russell 2000 minus Russell 1000 ETFs  (small-vs-large pressure)
  IWC - IWM : Russell Microcap minus Russell 2000   (the band where additions/deletions happen)
over  rank->R-1 (May 1 close to close before R), R-5->R, R->R+10, R->R+20 sessions.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import load_prices, save_csv, tr_index


def last_friday_june(y: int) -> pd.Timestamp:
    d = pd.Timestamp(f"{y}-06-30")
    while d.weekday() != 4:
        d -= pd.Timedelta(days=1)
    return d


def main():
    px = load_prices(["IWM", "IWB", "IWC", "SPY"], verbose=False)
    tr = {k: tr_index(v) for k, v in px.items()}
    c = tr["SPY"].index
    rows = []
    for y in range(2007, 2026):
        R = last_friday_june(y)
        iR = c.searchsorted(R)
        if iR >= len(c) or c[iR] != R:
            iR = c.searchsorted(R) - 1
        i_rank = c.searchsorted(pd.Timestamp(f"{y}-05-01"))
        rec = {"year": y, "recon": c[iR].date()}
        for name, (a, b) in {"rank_to_R-1": (i_rank, iR - 1), "R-5_to_R": (iR - 5, iR), "R_to_R+10": (iR, iR + 10),
                             "R_to_R+20": (iR, iR + 20)}.items():
            if b >= len(c):
                continue
            r = {k: tr[k].loc[c[b]] / tr[k].loc[c[a]] - 1 for k in tr}
            rec[f"IWM-IWB {name}"] = round(100 * (r["IWM"] - r["IWB"]), 2)
            rec[f"IWC-IWM {name}"] = round(100 * (r["IWC"] - r["IWM"]), 2)
        rows.append(rec)
    df = pd.DataFrame(rows)
    save_csv(df, "russell_proxy.csv")
    pd.set_option("display.width", 250)
    print(df.to_string())
    num = df.drop(columns=["year", "recon"])
    print(pd.DataFrame({"mean": num.mean(), "median": num.median(), "t": num.mean() / num.std() * np.sqrt(num.count()),
                        "pos_share": (num > 0).mean()}).round(2).to_string())


if __name__ == "__main__":
    main()
