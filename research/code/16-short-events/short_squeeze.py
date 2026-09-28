"""Short-squeeze setups, 2018-2026: high short interest plus a catalyst.

Data: FINRA consolidated short interest (finra_si.py; 2018+), XBRL shares outstanding, Yahoo.
Point in time: a settlement date's short interest is usable from settlement + 12 calendar days
(FINRA publishes ~7 business days after settlement).
SI% = short position / shares outstanding (XBRL, as of the settlement date).
Catalyst day C: market-adjusted (IWM) daily return >= +10% and volume >= 3x its 20-day median.
Setups (entry = close of the session after C, exits h = 5 / 20 / 60 sessions):
  squeeze   : latest published SI% >= 20% on C
  mid_si    : 10% <= SI% < 20%
  low_si    : SI% < 5% (same catalyst, control group)
  high_si_baseline : every stock-month with SI% >= 20% (no catalyst), entry at the publication date
Filters: price >= $5, 20-day median dollar volume >= $1m.  One event per stock per 20 sessions.
Costs: size-bucket COST_RT (longs).  IWM-adjusted.  Split: 2018-21 vs 2022-26.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import COST_RT, SCRATCH, cap_bucket, clustered_t, kelly_growth, save_csv, save_json, trade_stats
from evstudy import cal, px
from fastev import anchor_windows
from shares_out import SharesLookup

WIN = {"f5": (1, 6), "f20": (1, 21), "f60": (1, 61)}


def main():
    si = pd.read_pickle(SCRATCH / "finra_si.pkl")
    si["settlementDate"] = pd.to_datetime(si["settlementDate"])
    si["ticker"] = si["symbolCode"].str.replace(".", "-", regex=False).str.replace("/", "-", regex=False)
    cte = json.loads((SCRATCH / "company_tickers_exchange.json").read_text())
    cte = pd.DataFrame(cte["data"], columns=cte["fields"])
    cte["yf"] = cte["ticker"].str.replace(".", "-", regex=False)
    t2c = cte.drop_duplicates("yf").set_index("yf")["cik"].to_dict()
    si["cik"] = si["ticker"].map(t2c)
    si = si.dropna(subset=["cik"])
    sl = SharesLookup()
    si["shares"] = [sl.asof(int(c), d) for c, d in zip(si["cik"], si["settlementDate"])]
    si["si_pct"] = si["currentShortPositionQuantity"] / si["shares"]
    si = si[(si["si_pct"] > 0) & (si["si_pct"] < 1.5)]
    si["pub"] = si["settlementDate"] + pd.Timedelta(days=12)
    print("SI rows:", len(si), "symbols:", si["ticker"].nunique())
    c = cal()
    iwm = px("IWM")
    iwm_r = (iwm["Adj Close"] / iwm["Adj Close"].shift(1) - 1).reindex(c)
    events = []
    base = []
    for t, g in si.groupby("ticker"):
        p = px(t)
        if p is None or len(p) < 80:
            continue
        g = g.sort_values("pub")
        tr = p["Adj Close"].reindex(c).ffill(limit=5)
        r = tr / tr.shift(1) - 1
        x = r - iwm_r
        vol = p["Volume"].reindex(c)
        vr = vol / vol.rolling(20, min_periods=10).median().shift(1)
        dv = (p["Close"] * p["Volume"]).reindex(c).rolling(20, min_periods=10).median().shift(1)
        rawc = p["Close"].reindex(c)
        # latest published SI% as of each session (strictly before the session)
        s = pd.Series(g["si_pct"].values, index=g["pub"].values)
        s = s[~s.index.duplicated(keep="last")]
        si_now = s.reindex(c.union(s.index)).sort_index().ffill().reindex(c).shift(1)
        m = (x >= 0.10) & (vr >= 3) & (dv >= 1e6) & (rawc >= 5) & (c >= "2018-02-01") & si_now.notna()
        last = -99
        for i in np.where(m.values)[0]:
            if i - last < 20:
                continue
            last = i
            events.append({"ticker": t, "anchor": c[i], "si_pct": float(si_now.iloc[i]), "cat_ret": float(x.iloc[i]),
                           "cik": int(g["cik"].iloc[0])})
        # baseline: each publication date with SI% >= 20%
        for pubd, sp in zip(g["pub"], g["si_pct"]):
            if sp >= 0.20 and pubd >= pd.Timestamp("2018-02-01") and pubd.day > 20:  # one per month (month-end settlement)
                j = c.searchsorted(pubd)
                if j < len(c) and dv.iloc[j] >= 1e6 and rawc.iloc[j - 1] >= 5:
                    base.append({"ticker": t, "anchor": c[j], "si_pct": float(sp), "cik": int(g["cik"].iloc[0])})
    ev = pd.DataFrame(events)
    bs = pd.DataFrame(base)
    print("catalyst events:", len(ev), " high-SI baseline stock-months:", len(bs))
    ev = anchor_windows(ev, WIN, bench="IWM")
    bs = anchor_windows(bs, {"f20": (0, 20), "f60": (0, 60)}, bench="IWM")
    for df in (ev, bs):
        df["mcap"] = [sl.asof(cc, dd) * p_ if np.isfinite(p_) else np.nan for cc, dd, p_ in zip(df["cik"], df["anchor"], df["raw_px"])]
        df["bucket"] = df["mcap"].apply(cap_bucket)
        df["cost_rt"] = df["bucket"].map(COST_RT)
        df["period"] = np.where(df["anchor"] < "2022-01-01", "2018-21", "2022-26")
    for w in WIN:
        ev[f"x_{w}"] = ev[w] - ev[f"{w}_IWM"]
    for w in ("f20", "f60"):
        bs[f"x_{w}"] = bs[w] - bs[f"{w}_IWM"]
    ev["grp"] = pd.cut(ev["si_pct"], [-1, 0.05, 0.10, 0.20, 10], labels=["low_si <5%", "5-10%", "mid_si 10-20%", "squeeze >=20%"])
    rows = []
    for per in ["2018-21", "2022-26", "all"]:
        e = ev if per == "all" else ev[ev["period"] == per]
        yrs = 4.0 if per == "2018-21" else (4.7 if per == "2022-26" else 8.7)
        for grp, g in e.groupby("grp", observed=True):
            for w in WIN:
                rr = g[f"x_{w}"] - g["cost_rt"]
                st = trade_stats(rr, per_year=len(rr.dropna()) / yrs)
                st["t_clustered"] = round(clustered_t(rr, g["anchor"]), 2) if len(rr.dropna()) > 30 else None
                rows.append({"setup": f"catalyst, {grp}", "period": per, "window": w, **st})
        b = bs if per == "all" else bs[bs["period"] == per]
        for w in ("f20", "f60"):
            rr = b[f"x_{w}"] - b["cost_rt"]
            st = trade_stats(rr, per_year=len(rr.dropna()) / yrs)
            st["t_clustered"] = round(clustered_t(rr, b["anchor"]), 2) if len(rr.dropna()) > 30 else None
            rows.append({"setup": "high-SI (>=20%) baseline, long", "period": per, "window": w, **st})
    tab = pd.DataFrame(rows)
    save_csv(tab, "short_squeeze_summary.csv")
    sq = ev[(ev["grp"] == "squeeze >=20%")]
    save_json({"kelly_squeeze_f20": kelly_growth((sq["x_f20"] - sq["cost_rt"]).dropna(), 0.5, 0.25, 0.05),
               "right_tail_share_f20_gt_+50%": round(float((sq["f20"] > 0.5).mean()), 3),
               "left_tail_share_f20_lt_-30%": round(float((sq["f20"] < -0.3).mean()), 3)}, "short_squeeze_extra.json")
    pd.set_option("display.width", 250)
    print(tab[["setup", "period", "window", "n", "per_yr", "mean_%", "median_%", "t_clustered", "win_%", "p5_%", "p95_%", "max_loss_%"]].to_string())


if __name__ == "__main__":
    main()
