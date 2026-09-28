"""IPO lock-up expiries, 2012-2026: is there a tradable negative drift around day 180?

IPOs: first 424B4 prospectus mentioning an "initial public offering" per CIK (EDGAR full-text
search), kept only if Yahoo's first trading day is within [-5, +10] calendar days of it (true
IPO, not a follow-on).  Blank-check companies (SIC 6770) and names containing 'Acquisition'
are excluded.  L = first session on/after first-trade + 180 calendar days (the standard lock-up;
some deals have staggered or earnings-linked releases, which blurs the event date).
Windows (session offsets from L):
  pre10   close(L-11)->close(L-1)
  short   close(L-6) ->close(L+1)   (the classic 'short into the unlock' window)
  win     close(L-6) ->close(L+4)
  post20  close(L+1) ->close(L+21)
IWM-adjusted.  Short cost: size-bucket spread + 1.0% borrow for the ~7-session window (recent
IPOs are often hard to borrow; 1% ~ 35%/yr annualised).  IS 2012-15, OOS 2016-26.
Literature: Field & Hanka (2001) about -1.9% 3-day abnormal return, larger for VC-backed;
Ofek & Richardson (2000).  Survivorship: IPOs later delisted are missing (biases toward
winners, i.e. against finding a negative drift).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import COST_RT, SCRATCH, cap_bucket, clustered_t, load_prices, save_csv, trade_stats
from evstudy import cal, px
from fastev import anchor_windows
from shares_out import SharesLookup

WIN = {"pre10": (-11, -1), "short": (-6, 1), "win": (-6, 4), "post20": (1, 21)}


def main():
    d = pd.read_pickle(SCRATCH / "edgar_ipo.pkl")
    d = d[d["form"] == "424B4"].copy()
    d["cik"] = d["ciks"].apply(lambda x: int(x[0]) if len(x) else -1)
    d["sic"] = d["sics"].apply(lambda x: x[0] if isinstance(x, list) and len(x) else None)
    d = d[(d["sic"] != "6770") & ~d["names"].apply(lambda n: any("ACQUISITION" in s.upper() for s in n))]
    first = d.sort_values("file_date").drop_duplicates("cik")
    cte = json.loads((SCRATCH / "company_tickers_exchange.json").read_text())
    cte = pd.DataFrame(cte["data"], columns=cte["fields"])
    cte = cte[cte["exchange"].isin(["Nasdaq", "NYSE", "CBOE"])]
    m = cte.drop_duplicates("cik").set_index("cik")["ticker"].str.replace(".", "-", regex=False).to_dict()
    first["ticker"] = first["cik"].map(m)
    print("IPO prospectuses (first per CIK):", len(first), "with current ticker:", round(first["ticker"].notna().mean(), 3))
    first = first.dropna(subset=["ticker"])
    load_prices(sorted(set(first["ticker"])) + ["IWM"], batch=100, verbose=False)
    rows = []
    for r in first.itertuples(index=False):
        p = px(r.ticker)
        if p is None:
            continue
        F = p.index[0]
        if not (-5 <= (F - r.file_date).days <= 10):
            continue
        rows.append({"cik": r.cik, "ticker": r.ticker, "ipo_date": F, "anchor": F + pd.Timedelta(days=180)})
    ev = pd.DataFrame(rows)
    ev = ev[(ev["ipo_date"] >= "2012-01-01") & (ev["anchor"] <= "2026-08-15")]
    print("validated IPOs:", len(ev), ev.groupby(ev["ipo_date"].dt.year).size().to_dict())
    ev = anchor_windows(ev, WIN, bench="IWM")
    sl = SharesLookup()
    ev["mcap"] = [sl.asof(c, dd) * p if np.isfinite(p) else np.nan for c, dd, p in zip(ev["cik"], ev["anchor"], ev["raw_px"])]
    ev["bucket"] = ev["mcap"].apply(cap_bucket)
    ev["cost_rt"] = ev["bucket"].map(COST_RT)
    for w in WIN:
        ev[f"x_{w}"] = ev[w] - ev[f"{w}_IWM"]
    ev["period"] = np.where(ev["ipo_date"] < "2015-07-01", "IS (IPO 2012-15H1)", "OOS (IPO 2015H2-26)")
    ev = ev[ev["raw_px"] >= 2]
    ev.to_pickle(SCRATCH / "lockup_events.pkl")
    rows = []
    for per, g in list(ev.groupby("period")) + [("ALL", ev)]:
        yrs = 3.5 if per.startswith("IS") else (10.5 if per.startswith("OOS") else 14.0)
        for size_lbl, gg in [("ALL", g), (">= $300m", g[g["mcap"] >= 3e8]), ("< $300m", g[g["mcap"] < 3e8])]:
            for w in WIN:
                raw = gg[f"x_{w}"]
                rows.append({"period": per, "size": size_lbl, "window": w, "side": "long gross", **trade_stats(raw, per_year=len(raw.dropna()) / yrs)})
            s = -gg["x_short"] - gg["cost_rt"] - 0.01
            st = trade_stats(s, per_year=len(s.dropna()) / yrs)
            st["t_clustered"] = round(clustered_t(s, gg["anchor"]), 2) if len(s.dropna()) > 30 else None
            rows.append({"period": per, "size": size_lbl, "window": "short", "side": "SHORT net (spread+1% borrow)", **st})
    tab = pd.DataFrame(rows)
    save_csv(tab, "lockup_summary.csv")
    pd.set_option("display.width", 250)
    print(tab[["period", "size", "window", "side", "n", "per_yr", "mean_%", "median_%", "t", "win_%", "p5_%", "p95_%"]].to_string())


if __name__ == "__main__":
    main()
