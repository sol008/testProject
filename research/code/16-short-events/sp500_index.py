"""S&P 500 additions and deletions, 2010-2026: can a follower still earn the index effect?

Data (point in time, incl. later-delisted names):
  * fja05680/sp500 "S&P 500 Historical Components & Changes.csv" (daily membership 1996-2019-01;
    delisted tickers carry a -YYYYMM suffix)   https://github.com/fja05680/sp500
  * fja05680/sp500 sp500_changes_since_2019.csv (2019-01 -> 2026-08)
E = first date the stock is a member (the change is effective before that open), so index
funds trade at the CLOSE of E-1.  S&P announces additions after the close, usually 3-7
sessions before E for ad hoc changes and ~10 sessions before E for quarterly rebalances.
Exact announcement dates are not in free data, so we report fixed windows:
  pre_long  : close E-11 -> close E-6   (contains most announcement jumps)
  follow_5  : close E-5  -> close E-1   (a follower who buys ~4 sessions before E)
  follow_3  : close E-3  -> close E-1
  post_5/20/60 : close E-1 -> close E+4 / E+19 / E+59 (reversal after inclusion)
Benchmark: SPY.  Cost: 0.10% round trip (large caps).
Run: python sp500_index.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import SCRATCH, load_prices, save_csv, save_json, trade_stats, tr_index
from evstudy import cal, px

RENAMES = {("META", "2022-06-09"), ("ELV", "2022-06-28"), ("BNY", "2026-05-21"), ("PARA", "2022-02-16")}


def build() -> pd.DataFrame:
    comp = pd.read_csv(SCRATCH / "sp500_hist_components.csv")
    comp["date"] = pd.to_datetime(comp["date"])
    rows, prev = [], None
    for d, t in zip(comp["date"], comp["tickers"]):
        s = set(t.split(","))
        if prev is not None:
            rows += [(d, a, "add") for a in s - prev] + [(d, r, "del") for r in prev - s]
        prev = s
    ch = pd.read_csv(SCRATCH / "sp500_changes_since_2019.csv")
    for d, a, r in zip(ch["date"], ch["add"], ch["remove"]):
        for x in (a.split(",") if isinstance(a, str) else []):
            rows.append((pd.Timestamp(d), x.strip(), "add"))
        for x in (r.split(",") if isinstance(r, str) else []):
            rows.append((pd.Timestamp(d), x.strip(), "del"))
    ev = pd.DataFrame(rows, columns=["E", "raw", "type"])
    ev = ev[(ev["E"] >= "2010-01-01")]
    ev["delisted_suffix"] = ev["raw"].str.contains(r"-\d{6}$")
    ev["ticker"] = ev["raw"].str.replace(r"-\d{6}$", "", regex=True).str.replace(".", "-", regex=False)
    ev = ev[~ev.apply(lambda r: (r["ticker"], str(r["E"].date())) in RENAMES, axis=1)]
    return ev.drop_duplicates(["E", "ticker", "type"]).reset_index(drop=True)


def wret(t: str, i0: int, i1: int, E) -> float:
    """close-to-close total return between session offsets i0 and i1 relative to E."""
    d = px(t)
    if d is None:
        return np.nan
    c = cal()
    k = c.searchsorted(pd.Timestamp(E))
    if k + min(i0, i1) < 0 or k + max(i0, i1) >= len(c):
        return np.nan
    d0, d1 = c[k + i0], c[k + i1]
    tr = tr_index(d)
    if tr.index[0] > d0 or tr.index[-1] < d1:
        return np.nan
    a = tr[tr.index <= d0]
    b = tr[tr.index <= d1]
    if a.empty or b.empty or (d0 - a.index[-1]).days > 5 or (d1 - b.index[-1]).days > 5:
        return np.nan
    return float(b.iloc[-1] / a.iloc[-1] - 1)


WINDOWS = {"pre_long": (-11, -6), "follow_5": (-5, -1), "follow_3": (-3, -1), "day_E": (-1, 0),
           "post_5": (-1, 4), "post_20": (-1, 19), "post_60": (-1, 59)}


def main():
    ev = build()
    ok = ev[~ev["delisted_suffix"]]
    load_prices(sorted(set(ok["ticker"])) + ["SPY"], batch=100, verbose=False)
    out = []
    for r in ev.itertuples(index=False):
        rec = {"E": r.E, "ticker": r.ticker, "type": r.type, "delisted_suffix": r.delisted_suffix}
        d = None if r.delisted_suffix else px(r.ticker)
        if d is not None:
            c = cal()
            k = c.searchsorted(pd.Timestamp(r.E))
            first = d.index[0]
            rec["hist_sessions_before_E"] = int(((d.index < r.E)).sum())
            for w, (i0, i1) in WINDOWS.items():
                x = wret(r.ticker, i0, i1, r.E)
                b = wret("SPY", i0, i1, r.E)
                rec[w] = x - b if np.isfinite(x) and np.isfinite(b) else np.nan
        out.append(rec)
    df = pd.DataFrame(out)
    df["has_px"] = df["follow_5"].notna()
    df = df[(df["hist_sessions_before_E"].fillna(0) >= 60) | ~df["has_px"]]
    df["period"] = np.where(df["E"] < "2016-01-01", "2010-15", "2016-26")
    save_csv(df, "sp500_changes_events.csv")
    cost = 0.001
    summary = {"coverage": df.groupby(["type", "period"])["has_px"].agg(["size", "mean"]).round(3).reset_index().to_dict("records")}
    rows = []
    for typ in ["add", "del"]:
        for per in ["2010-15", "2016-26", "all"]:
            s = df[(df["type"] == typ) & df["has_px"]]
            if per != "all":
                s = s[s["period"] == per]
            for w in WINDOWS:
                st = trade_stats(s[w] - (cost if w.startswith(("follow", "post")) else 0))
                rows.append({"type": typ, "period": per, "window": w, **st})
    tab = pd.DataFrame(rows)
    save_csv(tab, "sp500_changes_summary.csv")
    summary["table"] = tab.to_dict("records")
    save_json(summary, "sp500_changes_summary.json")
    pd.set_option("display.width", 220)
    print(df.groupby(["type", "period"])["has_px"].agg(["size", "mean"]))
    print(tab[["type", "period", "window", "n", "mean_%", "median_%", "t", "win_%", "p5_%", "max_loss_%"]].to_string())


if __name__ == "__main__":
    main()
