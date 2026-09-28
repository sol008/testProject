"""Investable-proxy evidence for several special-situation strategies.

1. Merger arbitrage funds/ETFs (MERFX, ARBIX, MNA, MRGR, ARB) vs SPY and T-bills:
   CAGR, vol, drawdown, skew, beta, and behaviour in the worst SPY months
   (the "short put on the market" signature of Mitchell & Pulvino 2001).
2. Spin-offs: Invesco S&P Spin-Off ETF (CSD) vs SPY / mid-cap / small-cap.
3. Fallen angels: ANGL (2012+), FALN (2016+) vs HYG/JNK.
4. Closed-end-fund discount activism: CEFS vs SPY.
5. Credit-spread timing: forward 12-month return of a high-yield fund (VWEHX)
   conditional on Moody's Baa-10y spread (FRED BAA10Y) regimes.
6. Share-class spreads: GOOGL/GOOG and BRK-A vs 1500*BRK-B.

Run: python etf_proxies.py    Outputs: output/etf_proxies.json (+ CSV tables)
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import OUT, fred, perf_stats, save_json, yf_close


def rf_daily() -> pd.Series:
    tb = fred("DTB3") / 100
    return (tb / 252).asfreq("B").ffill()


def monthly(px: pd.DataFrame) -> pd.DataFrame:
    return px.resample("ME").last().pct_change()


def beta_stats(r: pd.Series, m: pd.Series) -> dict:
    x = pd.concat([r, m], axis=1).dropna()
    x.columns = ["r", "m"]
    b = np.cov(x.r, x.m)[0, 1] / x.m.var()
    down = x[x.m < 0]
    bd = np.cov(down.r, down.m)[0, 1] / down.m.var() if len(down) > 5 else np.nan
    up = x[x.m > 0]
    bu = np.cov(up.r, up.m)[0, 1] / up.m.var() if len(up) > 5 else np.nan
    worst = x[x.m <= x.m.quantile(0.05)]
    return {"beta": round(b, 3), "down_beta": round(bd, 3), "up_beta": round(bu, 3), "corr": round(x.r.corr(x.m), 3),
            "avg_ret_in_worst5pct_mkt_months_%": round(100 * worst.r.mean(), 2),
            "avg_mkt_in_those_months_%": round(100 * worst.m.mean(), 2)}


def main():
    res = {}
    rf = rf_daily()
    tick = ["MERFX", "ARBIX", "MNA", "MRGR", "ARB", "SPY", "BIL", "AGG", "CSD", "IJH", "IWM", "RSP", "ANGL", "FALN",
            "HYG", "JNK", "CEFS", "VWEHX", "GOOG", "GOOGL", "BRK-A", "BRK-B"]
    px = yf_close(tick, start="1990-01-01")
    px.to_csv(OUT / "etf_proxies_prices.csv.gz", compression="gzip")
    mret = monthly(px)
    rfm = (1 + rf).resample("ME").prod() - 1

    # 1. merger arb
    ma = {}
    for t in ["MERFX", "ARBIX", "MNA", "MRGR", "ARB"]:
        s = px[t].dropna()
        st = perf_stats(s, rf)
        st.update(beta_stats(mret[t], mret["SPY"]))
        ex = (mret[t] - rfm).dropna()
        st["avg_excess_over_tbill_ann_%"] = round(100 * 12 * ex.mean(), 2)
        spy_same = perf_stats(px["SPY"].loc[s.index[0]:].dropna(), rf)
        st["SPY_same_period_CAGR_%"] = spy_same["CAGR_%"]
        tb = ((1 + rf.loc[s.index[0]:]).prod()) ** (252 / len(rf.loc[s.index[0]:])) - 1
        st["tbill_same_period_%"] = round(100 * tb, 2)
        ma[t] = st
    # crisis windows for MERFX
    wins = {"GFC 2007-10..2009-03": ("2007-10-01", "2009-03-31"), "COVID Feb-Mar 2020": ("2020-02-19", "2020-03-23"),
            "2022 bear": ("2022-01-03", "2022-10-12"), "Aug 1998 LTCM": ("1998-07-17", "1998-10-08")}
    cw = {}
    for name, (a, b) in wins.items():
        row = {}
        for t in ["MERFX", "MNA", "SPY"]:
            s = px[t].loc[a:b].dropna()
            if len(s) > 2:
                row[t] = round(100 * (s.iloc[-1] / s.iloc[0] - 1), 1)
        cw[name] = row
    ma["crisis_windows_%"] = cw
    ann = px[["MERFX", "MNA", "SPY", "BIL"]].resample("YE").last().pct_change().dropna(how="all")
    ann.index = ann.index.year
    ann.round(4).to_csv(OUT / "merger_arb_annual_returns.csv")
    res["merger_arb"] = ma

    # 2. spin-offs
    so = {}
    base = px["CSD"].dropna().index[0]
    for t in ["CSD", "SPY", "IJH", "IWM", "RSP"]:
        s = px[t].loc[base:].dropna()
        so[t] = perf_stats(s, rf)
    # sub-periods
    for a, b in [("2006-12-15", "2013-12-31"), ("2014-01-01", "2019-12-31"), ("2020-01-01", "2026-12-31")]:
        so[f"{a[:4]}-{b[:4]}"] = {t: round(100 * ((px[t].loc[a:b].dropna().iloc[-1] / px[t].loc[a:b].dropna().iloc[0]) **
                                               (365.25 / (px[t].loc[a:b].dropna().index[-1] - px[t].loc[a:b].dropna().index[0]).days) - 1), 2)
                                   for t in ["CSD", "SPY", "IJH"]}
    res["spinoffs_CSD"] = so

    # 3. fallen angels
    fa = {}
    for grp in [("ANGL", ["ANGL", "HYG", "JNK", "SPY"]), ("FALN", ["FALN", "HYG", "JNK"])]:
        b0 = px[grp[0]].dropna().index[0]
        fa[f"since_{grp[0]}_inception"] = {t: perf_stats(px[t].loc[b0:].dropna(), rf) for t in grp[1]}
    res["fallen_angels"] = fa

    # 4. CEF activism ETF
    b0 = px["CEFS"].dropna().index[0]
    res["cef_activism_CEFS"] = {t: perf_stats(px[t].loc[b0:].dropna(), rf) for t in ["CEFS", "SPY", "AGG"]}

    # 5. credit-spread timing with Baa-10y and VWEHX
    spread = fred("BAA10Y")
    hy = px["VWEHX"].dropna()
    m_sp = spread.resample("ME").last()
    m_hy = hy.resample("ME").last()
    fwd12 = m_hy.shift(-12) / m_hy - 1
    df = pd.concat([m_sp.rename("spread"), fwd12.rename("fwd12")], axis=1).dropna()
    bins = [0, 2.0, 2.5, 3.0, 3.5, 4.0, 10]
    df["regime"] = pd.cut(df["spread"], bins)
    tab = df.groupby("regime", observed=True)["fwd12"].agg(["count", "mean", "median", "min", "max"]).round(4)
    tab["share_negative"] = df.groupby("regime", observed=True)["fwd12"].apply(lambda s: round(float((s < 0).mean()), 3))
    tab.to_csv(OUT / "credit_spread_regimes_vwehx.csv")
    res["credit_spread_timing"] = {
        "note": "Monthly obs 1990-2025, overlapping 12m windows (effective independent obs ~ n/12). Spread = Moody's Baa minus 10y UST (FRED BAA10Y).",
        "current_BAA10Y": float(spread.iloc[-1]),
        "table": tab.reset_index().astype({"regime": str}).to_dict(orient="records"),
    }

    # 6. share-class spreads
    g = (px["GOOGL"] / px["GOOG"] - 1).dropna()
    g = g.loc["2014-04-03":]
    b = (px["BRK-A"] / (1500 * px["BRK-B"]) - 1).dropna().loc["2010-01-21":]
    res["share_class"] = {
        "GOOGL_premium_over_GOOG_%": {"mean": round(100 * g.mean(), 2), "min": round(100 * g.min(), 2), "max": round(100 * g.max(), 2),
                                        "p5": round(100 * g.quantile(0.05), 2), "p95": round(100 * g.quantile(0.95), 2), "last": round(100 * g.iloc[-1], 2),
                                        "daily_std_%": round(100 * g.std(), 2)},
        "BRKA_vs_1500xBRKB_%": {"mean": round(100 * b.mean(), 3), "min": round(100 * b.min(), 3), "max": round(100 * b.max(), 3),
                                 "p5": round(100 * b.quantile(0.05), 3), "p95": round(100 * b.quantile(0.95), 3), "last": round(100 * b.iloc[-1], 3)},
    }
    save_json(res, "etf_proxies.json")
    print(json.dumps(res, indent=1, default=str)[:12000])
    print(ann.round(3).to_string())
    print(tab.to_string())


if __name__ == "__main__":
    main()
