"""
Track 35 — SPAC trust-floor check on 2019-21 SPACs whose successor tickers still trade.

Yahoo keeps the pre-merger price history under the successor ticker. For each SPAC we measure, in the
window before the deal announcement: the minimum close (did the trust floor hold?), the share of sessions
below $9.80; then the announcement-day close and the maximum close within 60 sessions (the "free option");
and the 12-month return after the merger closed (the de-SPAC drift).

Survivorship: only SPACs that found a deal AND whose company still trades are here, so the option values
are upper bounds. The floor evidence is not biased that way: every SPAC has the same trust structure.

Output: output/spac_floor.csv
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import yfinance as yf

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUT, exist_ok=True)

# successor ticker: (SPAC ticker, announcement date, merger close date, trust per share)
SPACS = {
    "SPCE": ("IPOA", "2019-07-09", "2019-10-28", 10.0),
    "VRT": ("GSAH", "2019-12-10", "2020-02-07", 10.0),
    "DKNG": ("DEAC", "2019-12-23", "2020-04-24", 10.0),
    "NKLA": ("VTIQ", "2020-03-03", "2020-06-03", 10.0),
    "HYLN": ("SHLL", "2020-06-19", "2020-10-01", 10.0),
    "FSR": ("SPAQ", "2020-07-13", "2020-10-29", 10.0),
    "SKLZ": ("FEAC", "2020-09-02", "2020-12-16", 10.0),
    "QS": ("KCAC", "2020-09-03", "2020-11-25", 10.0),
    "OPEN": ("IPOB", "2020-09-15", "2020-12-18", 10.0),
    "CHPT": ("SBE", "2020-09-24", "2021-02-26", 10.0),
    "CLOV": ("IPOC", "2020-10-06", "2021-01-07", 10.0),
    "GENI": ("DMYD", "2020-10-27", "2021-04-20", 10.0),
    "BFLY": ("LGVW", "2020-11-20", "2021-02-12", 10.0),
    "SOFI": ("IPOE", "2021-01-07", "2021-05-28", 10.0),
    "PAYO": ("FTOC", "2021-02-03", "2021-06-25", 10.0),
    "MTTR": ("GHVI", "2021-02-08", "2021-07-22", 10.0),
    "LCID": ("CCIV", "2021-02-22", "2021-07-23", 10.0),
    "JOBY": ("RTP", "2021-02-24", "2021-08-10", 10.0),
    "MVST": ("THCB", "2021-02-01", "2021-07-23", 10.0),
    "DJT": ("DWAC", "2021-10-20", "2024-03-25", 10.0),
    "GRAB": ("AGC", "2021-04-13", "2021-12-01", 10.0),
    "LUNR": ("IPAX", "2022-09-28", "2023-02-13", 10.0),
}


def main():
    rows = []
    for succ, (spac, ann, close_dt, trust) in SPACS.items():
        try:
            h = yf.download(succ, start="2017-01-01", progress=False, auto_adjust=False, threads=False)
        except Exception as e:  # noqa: BLE001
            print(succ, "download failed", e)
            continue
        if h.empty:
            print(succ, "no data")
            continue
        c = h["Close"].iloc[:, 0] if isinstance(h["Close"], pd.DataFrame) else h["Close"]
        c = c.dropna()
        # Yahoo back-adjusts LATER reverse splits into the pre-merger history (SPCE 1:20, CHPT 1:20, LCID 1:10),
        # so the $10 trust shows as $200 / $100. Rescale by the first month's median close, snapped to a plausible
        # split ratio, so that the pre-merger series is back on the $10 trust scale.
        first = float(c.iloc[:20].median())
        scale = 1.0
        if first > 15:
            ratios = np.array([2, 3, 4, 5, 8, 10, 15, 20, 25, 30, 40, 50, 100], dtype=float)
            scale = float(ratios[np.argmin(np.abs(ratios - first / 10.0))])
            c = c / scale
        ann_ts, close_ts = pd.Timestamp(ann), pd.Timestamp(close_dt)
        pre = c.loc[:ann_ts - pd.Timedelta(days=1)]
        pre = pre.iloc[-180:]
        if len(pre) < 20:
            rows.append(dict(successor=succ, spac=spac, note="history starts after announcement", hist_start=c.index[0].date()))
            continue
        i_ann = c.index.searchsorted(ann_ts)
        ann_close = c.iloc[i_ann] if i_ann < len(c) else np.nan
        post = c.iloc[i_ann:i_ann + 61]
        i_cl = c.index.searchsorted(close_ts)
        r12 = np.nan
        if i_cl + 252 < len(c):
            r12 = c.iloc[i_cl + 252] / c.iloc[i_cl] - 1
        rows.append(dict(successor=succ, spac=spac, hist_start=c.index[0].date(), split_rescale=scale, announced=ann, pre_sessions=len(pre),
                         pre_min_close=float(pre.min()), pre_min_vs_trust=float(pre.min() / trust - 1),
                         pct_sessions_below_9_80=float((pre < 9.80).mean()), close_before_ann=float(pre.iloc[-1]),
                         ann_day_close=float(ann_close), ann_pop_vs_trust=float(ann_close / trust - 1),
                         max_close_60s_after=float(post.max()), max_vs_trust=float(post.max() / trust - 1),
                         merger_closed=close_dt, ret_12m_after_close=float(r12) if pd.notna(r12) else np.nan,
                         latest_vs_trust=float(c.iloc[-1] / trust - 1)))
    df = pd.DataFrame(rows).round(4)
    df.to_csv(os.path.join(OUT, "spac_floor.csv"), index=False)
    pd.set_option("display.width", 300, "display.max_columns", 30)
    print(df.to_string(index=False))
    ok = df.dropna(subset=["pre_min_close"]) if "pre_min_close" in df else df
    if not ok.empty:
        print("\nn =", len(ok), "| median pre-announcement min vs trust:", round(ok["pre_min_vs_trust"].median(), 3),
              "| worst:", round(ok["pre_min_vs_trust"].min(), 3),
              "| median ann-day pop vs trust:", round(ok["ann_pop_vs_trust"].median(), 3),
              "| median max within 60s vs trust:", round(ok["max_vs_trust"].median(), 3),
              "| median 12m after merger close:", round(ok["ret_12m_after_close"].median(), 3))


if __name__ == "__main__":
    main()
