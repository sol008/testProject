"""Quick base-rate event studies used to calibrate the candidate setups in the track-08 report.

1) S&P 500 forward returns after the 10y UST yield rises >= 45bp in 21 trading days (bond-shock months),
   and specifically when that happens with the S&P within 3% of its all-time high.
2) USDJPY forward changes after the first day of known Japanese MoF yen-buying intervention episodes.
3) S&P 500 forward returns when VIX < 17 and S&P within 2% of ATH (unconditional "calm near highs" base rate).
4) Midterm-election-year seasonality: S&P 500 return from end-Sep to end-Dec, and 12m after midterm day.
Inputs: SCRATCH/market_close.csv. Output: printed tables.
Caveats: overlapping windows (not independent), small n for 2) and 4); descriptive only.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import SCRATCH

close = pd.read_csv(SCRATCH / "market_close.csv", index_col=0, parse_dates=True)
spx = close["^GSPC"].dropna()
tnx = close["^TNX"].dropna()
vix = close["^VIX"].dropna()
jpy = close["JPY=X"].dropna()


def fwd(s: pd.Series, days: int) -> pd.Series:
    return (s.shift(-days) / s - 1) * 100


def fwd_maxdd(s: pd.Series, days: int) -> pd.Series:
    vals = s.values
    out = np.full(len(vals), np.nan)
    for i in range(len(vals) - days):
        w = vals[i:i + days + 1]
        out[i] = (w.min() / vals[i] - 1) * 100
    return pd.Series(out, index=s.index)


def declutter(mask: pd.Series, gap: int = 21) -> pd.Series:
    """Keep only the first signal day in each cluster (no new signal within `gap` trading days)."""
    idx = np.where(mask.values)[0]
    keep, last = [], -10**9
    for i in idx:
        if i - last > gap:
            keep.append(i)
        last = i if i - last > gap else last
    m = pd.Series(False, index=mask.index)
    m.iloc[keep] = True
    return m


def summarize(sig_dates, name):
    df = pd.DataFrame({
        "fwd21": fwd(spx, 21), "fwd63": fwd(spx, 63), "fwd126": fwd(spx, 126), "maxdd63": fwd_maxdd(spx, 63),
    }).reindex(sig_dates).dropna(how="all")
    base = pd.DataFrame({"fwd21": fwd(spx, 21), "fwd63": fwd(spx, 63), "fwd126": fwd(spx, 126),
                         "maxdd63": fwd_maxdd(spx, 63)}).dropna()
    print(f"\n== {name}: n={len(df)} (declustered)")
    print(df.round(2).tail(20).to_string())
    print("mean:", df.mean().round(2).to_dict())
    print("median:", df.median().round(2).to_dict())
    print("share fwd63<0:", round((df['fwd63'] < 0).mean() * 100, 1), "% | share maxdd63 <= -10%:",
          round((df['maxdd63'] <= -10).mean() * 100, 1), "%")
    print("UNCONDITIONAL base (1990+): mean", base.mean().round(2).to_dict(), "| P(maxdd63<=-10%)",
          round((base['maxdd63'] <= -10).mean() * 100, 1), "%")


def main():
    # 1) bond-shock months
    a = pd.concat([spx, tnx], axis=1, keys=["spx", "tnx"]).dropna()
    d21 = a["tnx"] - a["tnx"].shift(21)
    ath = a["spx"].cummax()
    near_ath = a["spx"] >= 0.97 * ath
    sig = declutter(d21 >= 0.45)
    summarize(sig[sig].index, "10y +45bp in 21d")
    sig2 = declutter((d21 >= 0.45) & near_ath)
    summarize(sig2[sig2].index, "10y +45bp in 21d AND S&P within 3% of ATH")
    print("Current 21d change in 10y (bp):", round((a['tnx'].iloc[-1] - a['tnx'].iloc[-22]) * 100, 1))

    # 2) yen interventions (first day of each episode; public MoF confirmations / widely reported)
    episodes = ["1998-06-17", "2011-03-18", "2011-08-04", "2011-10-31", "2022-09-22", "2022-10-21", "2024-04-29",
                "2024-07-11", "2026-04-15", "2026-07-31"]
    rows = []
    for d in episodes:
        d = pd.Timestamp(d)
        s = jpy[jpy.index >= d]
        if len(s) < 5:
            continue
        p0 = s.iloc[0]
        r = {"date": s.index[0].date(), "usdjpy": round(p0, 2)}
        for n, lbl in [(21, "1m"), (63, "3m"), (126, "6m")]:
            r[f"chg_{lbl}_%"] = round((s.iloc[n] / p0 - 1) * 100, 2) if len(s) > n else np.nan
        r["min_6m_%"] = round((s.iloc[:127].min() / p0 - 1) * 100, 2)
        r["max_6m_%"] = round((s.iloc[:127].max() / p0 - 1) * 100, 2)
        rows.append(r)
    print("\n== USDJPY after intervention episode start (negative = yen stronger)")
    print(pd.DataFrame(rows).to_string())
    print("NOTE: 2026-04-15 is an approximate start date for the Apr-May 2026 episode (MoF reported ¥11.73tn over Apr-May); "
          "2026-07-31 approximates the joint US-Japan operation (reported Jul 30-Aug 26, ¥15.4tn).")

    # 3) calm near highs
    b = pd.concat([spx, vix], axis=1, keys=["spx", "vix"]).dropna()
    calm = (b["vix"] < 17) & (b["spx"] >= 0.98 * b["spx"].cummax())
    sig3 = declutter(calm, gap=63)
    summarize(sig3[sig3].index, "VIX<17 & S&P within 2% of ATH (declustered 63d)")

    # 4) midterm-year seasonality (end-Sep -> end-Dec) and 12m after election day
    rows = []
    for y, eday in [(1990, "1990-11-06"), (1994, "1994-11-08"), (1998, "1998-11-03"), (2002, "2002-11-05"),
                    (2006, "2006-11-07"), (2010, "2010-11-02"), (2014, "2014-11-04"), (2018, "2018-11-06"),
                    (2022, "2022-11-08")]:
        s0 = spx[spx.index <= f"{y}-09-30"].iloc[-1]
        s1 = spx[spx.index <= f"{y}-12-31"].iloc[-1]
        e0 = spx[spx.index <= eday].iloc[-1]
        e1 = spx[spx.index <= pd.Timestamp(eday) + pd.Timedelta(days=365)].iloc[-1]
        rows.append({"year": y, "Q4_ret_%": round((s1 / s0 - 1) * 100, 1), "12m_after_election_%": round((e1 / e0 - 1) * 100, 1)})
    mt = pd.DataFrame(rows)
    print("\n== Midterm years (S&P 500 price)")
    print(mt.to_string())
    print("mean Q4:", round(mt['Q4_ret_%'].mean(), 1), "| mean 12m after:", round(mt['12m_after_election_%'].mean(), 1),
          "| share 12m>0:", round((mt['12m_after_election_%'] > 0).mean() * 100))


if __name__ == "__main__":
    main()
