"""Share-buyback announcements in 8-Ks, 2011-2026: is there a 1-60 day drift a follower can earn?

Events: 8-Ks whose text mentions a share/stock repurchase (buyback) program or authorization
(EDGAR full-text search, edgar_collect.py buyback).  Two groups:
  standalone : no Item 2.02 in the 8-K (announcement not bundled with earnings)
  with_earn  : Item 2.02 present (announced inside an earnings release -> confounded by PEAD)
Precision caveat: a text match is not always a NEW authorization (updates, ASR agreements,
completions also match).  One event per company per 90 days.
Windows (a = first session on/after the filing date):
  announce close(a-1)->close(a+1)  [not capturable]   f5/f20/f60: close(a+1)->close(a+1+h)
Benchmark IWM (< $2bn) / SPY; costs COST_RT; IS 2011-15 vs OOS 2016-26.
Literature: Ikenberry, Lakonishok & Vermaelen (1995) +3.5% announcement, +12% 4-year drift;
Fu & Huang (2016) report the long-run drift disappeared after 2003.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import COST_RT, SCRATCH, cap_bucket, clustered_t, save_csv, trade_stats
from fastev import anchor_windows
from shares_out import SharesLookup

WIN = {"announce": (-1, 1), "f5": (1, 6), "f20": (1, 21), "f60": (1, 61)}


def main():
    d = pd.read_pickle(SCRATCH / "edgar_buyback.pkl")
    d = d[d["form"] == "8-K"].copy()
    d["cik"] = d["ciks"].apply(lambda x: int(x[0]) if len(x) else -1)
    cte = json.loads((SCRATCH / "company_tickers_exchange.json").read_text())
    cte = pd.DataFrame(cte["data"], columns=cte["fields"])
    cte = cte[cte["exchange"].isin(["Nasdaq", "NYSE", "CBOE"])]
    m = cte.drop_duplicates("cik").set_index("cik")["ticker"].str.replace(".", "-", regex=False).to_dict()
    d["ticker"] = d["cik"].map(m)
    print("buyback-mentioning 8-Ks:", len(d), "with current ticker:", round(d["ticker"].notna().mean(), 3))
    d = d.dropna(subset=["ticker"])
    d["group"] = np.where(d["items"].str.contains("2.02", regex=False), "with_earn", "standalone")
    d = d.sort_values("file_date")
    keep, last = [], {}
    for i, c, dd, g in zip(d.index, d["cik"], d["file_date"], d["group"]):
        if (c, g) in last and (dd - last[(c, g)]).days < 90:
            continue
        last[(c, g)] = dd
        keep.append(i)
    ev = d.loc[keep, ["cik", "ticker", "file_date", "group", "items"]].rename(columns={"file_date": "anchor"}).reset_index(drop=True)
    ev = anchor_windows(ev, WIN, bench=["SPY", "IWM"])
    sl = SharesLookup()
    ev["mcap"] = [sl.asof(c, dd) * p if np.isfinite(p) else np.nan for c, dd, p in zip(ev["cik"], ev["anchor"], ev["raw_px"])]
    ev["bucket"] = ev["mcap"].apply(cap_bucket)
    ev["cost_rt"] = ev["bucket"].map(COST_RT)
    big = ev["mcap"] >= 2e9
    for w in WIN:
        ev[f"x_{w}"] = ev[w] - np.where(big, ev[f"{w}_SPY"], ev[f"{w}_IWM"])
    ev["period"] = np.where(ev["anchor"] < "2016-01-01", "2011-15 (IS)", "2016-26 (OOS)")
    ev = ev[(ev["raw_px"] >= 2) & (ev["dvol20"] >= 1e5) & (ev["hist"] >= 60)]
    ev.to_pickle(SCRATCH / "buyback_events.pkl")
    rows = []
    for per in ["2011-15 (IS)", "2016-26 (OOS)"]:
        yrs = 5.0 if per.startswith("2011") else 10.7
        for grp in ["standalone", "with_earn"]:
            g0 = ev[(ev["period"] == per) & (ev["group"] == grp)]
            for size_lbl, g in [("ALL", g0), (">= $2bn", g0[g0["mcap"] >= 2e9]), ("$0.3-2bn", g0[(g0["mcap"] >= 3e8) & (g0["mcap"] < 2e9)]),
                                ("< $300m", g0[g0["mcap"] < 3e8])]:
                for w in WIN:
                    r = g[f"x_{w}"] - (g["cost_rt"] if w != "announce" else 0)
                    st = trade_stats(r, per_year=len(r.dropna()) / yrs)
                    st["t_clustered"] = round(clustered_t(r, g["anchor"]), 2) if len(r.dropna()) > 30 else None
                    rows.append({"group": grp, "size": size_lbl, "period": per, "window": w, **st})
    tab = pd.DataFrame(rows)
    save_csv(tab, "buyback_8k_summary.csv")
    pd.set_option("display.width", 250)
    print(tab[["group", "size", "period", "window", "n", "per_yr", "mean_%", "median_%", "t_clustered", "win_%", "p5_%"]].to_string())


if __name__ == "__main__":
    main()
