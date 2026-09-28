"""Diagnostics for insider clusters (pre-registered baseline W=30, K=2 and the in-sample pick).

Q1 Where does the return go?  Excess returns (IWM/SPY) over
     trade->file   close(first insider trade date) -> close(filing date D)   [insiders' own gain]
     file_react    close(D-1) -> close(D+1)                                  [filing reaction]
     follower      close(D+1) -> close(D+21)                                 [what a follower gets]
Q2 Decay by year (gross 20- and 60-session excess returns of the follower).
Q3 Survivorship check: 2022-26 (validated coverage 74-86%) vs 2016-21 (50-61%).
Q4 Context only (outside the 1-60 day mandate): 120- and 250-session follower returns.
Output: output/insider_diagnostics.csv, output/insider_by_year.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import COST_RT, SCRATCH, cap_bucket, save_csv, trade_stats
from fastev import anchor_windows


def main():
    ev = pd.read_pickle(SCRATCH / "insider_events_mapped.pkl")
    ev = ev[(ev["map_status"] == "ok") & (ev["W"] == 30) & (ev["K"] == 2) & (ev["event_date"] <= "2026-06-26")].copy()
    ev = ev.rename(columns={"event_date": "anchor"}).reset_index(drop=True)
    win = {"file_react": (-1, 1), "follow20": (1, 21), "follow60": (1, 61), "follow120": (1, 121), "follow250": (1, 251),
           "d1": (0, 1), "d0": (-1, 0)}
    ev = anchor_windows(ev, win, bench=["SPY", "IWM"])
    # insiders' own gain: first trade date -> filing date (close to close)
    ev2 = ev[["ticker", "first_trans"]].rename(columns={"first_trans": "anchor"}).copy()
    ev2["anchor"] = pd.to_datetime(ev2["anchor"])
    lag = (ev["anchor"] - ev2["anchor"]).dt.days.clip(lower=0)
    ev2 = anchor_windows(ev2, {"d_to_file": (0, 0)}, bench=None, features=False)
    # compute trade->file with variable length: use sessions between dates
    from evstudy import cal
    c = cal()
    i0 = c.searchsorted(pd.to_datetime(ev["first_trans"]).values)
    i1 = c.searchsorted(ev["anchor"].values)
    ev["tf_len"] = i1 - i0
    from fastev import _aligned
    tf, tfb = np.full(len(ev), np.nan), np.full(len(ev), np.nan)
    iwm = _aligned("IWM")[0]
    spy = _aligned("SPY")[0]
    for t, g in ev.groupby("ticker"):
        al = _aligned(t)
        if al is None:
            continue
        tr = al[0]
        for k in g.index:
            a, b = i0[k], i1[k]
            if 0 < a <= b < len(c):
                tf[k] = tr[b] / tr[a - 1] - 1  # from close before first trade day to filing-day close
                bm = spy if ev.at[k, "mcap"] >= 2e9 else iwm
                tfb[k] = bm[b] / bm[a - 1] - 1
    ev["trade_to_file"] = tf - tfb
    big = ev["mcap"] >= 2e9
    for w in win:
        ev[f"x_{w}"] = ev[w] - np.where(big, ev[f"{w}_SPY"], ev[f"{w}_IWM"])
    ev["bucket"] = ev["mcap"].apply(cap_bucket)
    ev["cost_rt"] = ev["bucket"].map(COST_RT)
    ev["year"] = ev["anchor"].dt.year
    ev = ev[(ev["raw_px"] >= 2) & (ev["dvol20"] >= 1e5)]
    rows = []
    for per, g in [("2006-08", ev[ev["year"] <= 2008]), ("2009-15", ev[(ev["year"] >= 2009) & (ev["year"] <= 2015)]),
                   ("2016-21", ev[(ev["year"] >= 2016) & (ev["year"] <= 2021)]), ("2022-26", ev[ev["year"] >= 2022])]:
        for col in ["trade_to_file", "x_d0", "x_d1", "x_file_react", "x_follow20", "x_follow60", "x_follow120", "x_follow250"]:
            st = trade_stats(g[col])
            rows.append({"period": per, "measure": col, "gross": True, **st})
        for col in ["x_follow20", "x_follow60"]:
            st = trade_stats(g[col] - g["cost_rt"])
            rows.append({"period": per, "measure": col + " net", "gross": False, **st})
    tab = pd.DataFrame(rows)
    save_csv(tab, "insider_diagnostics.csv")
    by = ev.groupby("year").agg(n=("x_follow20", "count"), follow20_mean=("x_follow20", "mean"), follow20_med=("x_follow20", "median"),
                                follow60_mean=("x_follow60", "mean"), react_mean=("x_file_react", "mean"),
                                trade_to_file_mean=("trade_to_file", "mean")).reset_index()
    for c_ in by.columns[2:]:
        by[c_] = (100 * by[c_]).round(2)
    save_csv(by, "insider_by_year.csv")
    pd.set_option("display.width", 220)
    print(tab[["period", "measure", "n", "mean_%", "median_%", "t", "win_%"]].to_string())
    print(by.to_string())
    print("median sessions from first insider trade to filing:", float(np.nanmedian(ev["tf_len"])))


if __name__ == "__main__":
    main()
