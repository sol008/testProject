"""Spin-offs, 2011-2026: the spinco's first 1-120 sessions of regular-way trading.

When-issued prices are not in free data, so the test starts at the spinco's first Yahoo session F
(normally the first regular-way day; for some deals Yahoo includes a few when-issued days).
Spincos: original Form 10-12B registrations (EDGAR full-text search), mapped by CIK to today's
exchange ticker, kept if F is 0-450 days after the Form 10 filing.
Windows (session offsets from F):
  d1_20   close(F)    -> close(F+20)     buy after the first day, hold ~1 month (forced selling?)
  d1_60   close(F)    -> close(F+60)
  d20_60  close(F+20) -> close(F+60)     wait out the index/forced selling, then buy
  d20_120 close(F+20) -> close(F+120)
IWM-adjusted; COST_RT by size.  Survivorship: spincos later acquired or delisted are missing.
Literature: Cusatis, Miles & Woolridge (1993); McConnell & Ovtchinnikov (2004); forced-selling
argument in Greenblatt (1997).  Track 05: CSD spin-off ETF 9.6%/yr vs SPY 10.9% (2006-26).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import COST_RT, SCRATCH, cap_bucket, load_prices, save_csv, trade_stats
from evstudy import px
from fastev import anchor_windows
from shares_out import SharesLookup

WIN = {"d1_20": (0, 20), "d1_60": (0, 60), "d20_60": (20, 60), "d20_120": (20, 120), "d60_120": (60, 120)}


def main():
    d = pd.read_pickle(SCRATCH / "edgar_spinoff.pkl")
    d = d[d["form"] == "10-12B"].copy()
    d["cik"] = d["ciks"].apply(lambda x: int(x[0]) if len(x) else -1)
    first = d.sort_values("file_date").drop_duplicates("cik")
    cte = json.loads((SCRATCH / "company_tickers_exchange.json").read_text())
    cte = pd.DataFrame(cte["data"], columns=cte["fields"])
    cte = cte[cte["exchange"].isin(["Nasdaq", "NYSE", "CBOE"])]
    m = cte.drop_duplicates("cik").set_index("cik")["ticker"].str.replace(".", "-", regex=False).to_dict()
    first["ticker"] = first["cik"].map(m)
    n_all = len(first)
    first = first.dropna(subset=["ticker"])
    load_prices(sorted(set(first["ticker"])) + ["IWM"], batch=100, verbose=False)
    rows = []
    for r in first.itertuples(index=False):
        p = px(r.ticker)
        if p is None:
            continue
        F = p.index[0]
        lag = (F - r.file_date).days
        if 0 <= lag <= 450 and F >= pd.Timestamp("2011-01-01"):
            rows.append({"cik": r.cik, "ticker": r.ticker, "anchor": F, "form10_date": r.file_date, "lag_days": lag})
    ev = pd.DataFrame(rows)
    print(f"Form 10 registrants: {n_all}; with current ticker: {len(first)}; validated spincos: {len(ev)}")
    ev = anchor_windows(ev, WIN, bench="IWM", features=True)
    sl = SharesLookup()
    # market cap on day F+1 (raw price at anchor-1 is undefined for a new listing -> use first close)
    ev["first_close"] = [float(px(t)["Close"].iloc[0]) for t in ev["ticker"]]
    ev["mcap"] = [sl.asof(c, dd + pd.Timedelta(days=120)) * p_ for c, dd, p_ in zip(ev["cik"], ev["anchor"], ev["first_close"])]
    ev["bucket"] = ev["mcap"].apply(cap_bucket)
    ev["cost_rt"] = ev["bucket"].map(COST_RT)
    for w in WIN:
        ev[f"x_{w}"] = ev[w] - ev[f"{w}_IWM"]
    ev["period"] = np.where(ev["anchor"] < "2016-01-01", "2011-15", "2016-26")
    ev = ev[ev["first_close"] >= 2]
    ev.to_pickle(SCRATCH / "spinoff_events.pkl")
    rows = []
    for per, g in list(ev.groupby("period")) + [("all", ev)]:
        yrs = 5.0 if per == "2011-15" else (10.7 if per == "2016-26" else 15.7)
        for w in WIN:
            rows.append({"period": per, "window": w, **trade_stats(g[f"x_{w}"] - g["cost_rt"], per_year=len(g) / yrs)})
    tab = pd.DataFrame(rows)
    save_csv(tab, "spinoff_summary.csv")
    pd.set_option("display.width", 220)
    print(tab[["period", "window", "n", "per_yr", "mean_%", "median_%", "t", "win_%", "p5_%", "max_loss_%"]].to_string())


if __name__ == "__main__":
    main()
