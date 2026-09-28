"""Part 3: trend following with few trades.

  A. Faber (2007) 10-month SMA timing on the S&P 500 (monthly, 1928-2026), 1x/2x/3x.
  B. Gayed & Bilello (2016) 200-day MA timing with daily-rebalanced 1x/2x/3x leverage (1928-2026),
     plus a 'few-trade' variant that only acts at month-end, and a 3% band variant.
  C. Antonacci dual momentum (GEM): S&P 500 vs developed ex-US (Ken French) vs T-bills -> bonds
     (synthetic 5-year Treasury TR), monthly 1991-2026.
Conventions: signals use closes up to t; the new position earns returns from the NEXT period
(daily: one full day of delay; monthly: next month).  Out of the market = T-bills.
Costs: 0.10% per switch at 1x, 0.20% per switch for 2x/3x.
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import common as C
import data

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(OUT, exist_ok=True)


def _stats(eq: pd.Series, inv: pd.Series, switches: int, periods_per_year: float) -> dict:
    eq = eq.dropna()
    r = eq.pct_change().dropna()
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    cg = (eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1
    mdd = float((eq / eq.cummax() - 1).min())
    return {"start": eq.index[0].date(), "end": eq.index[-1].date(), "CAGR": cg,
            "vol": float(r.std() * np.sqrt(periods_per_year)), "maxDD": mdd,
            "MAR": cg / abs(mdd) if mdd < 0 else np.nan,
            "time_in_mkt": float(inv.reindex(eq.index).fillna(0).mean()),
            "switches": int(switches), "round_trips_per_yr": switches / 2 / yrs,
            "total_x": eq.iloc[-1] / eq.iloc[0]}


def decade_table(eqs: dict, start_year=1930) -> pd.DataFrame:
    rows = []
    for name, eq in eqs.items():
        y = eq.resample("YE").last()
        for dec in range(start_year, 2030, 10):
            a = y[(y.index.year >= dec - 1) & (y.index.year <= dec + 9)]
            if len(a) < 2:
                continue
            e0 = a.iloc[0]
            e1 = a.iloc[-1]
            n = a.index[-1].year - a.index[0].year
            rows.append({"strategy": name, "decade": f"{dec}s", "CAGR": (e1 / e0) ** (1 / n) - 1})
    return pd.DataFrame(rows).pivot(index="decade", columns="strategy", values="CAGR")


# ------------------------------------------------------------------------------------------- daily 200DMA
def daily_timing(px: pd.Series, tr: pd.Series, rf: pd.Series, L: int, signal: pd.Series):
    """signal[t]=True means 'be invested' decided at close t -> position applies to return of day t+2
    (trade executed at close t+1)."""
    idx = px.index
    r = tr.pct_change().fillna(0.0)
    rf = rf.reindex(rf.index.union(idx)).ffill().reindex(idx).fillna(0.0)
    rin = C.lev_returns(r, rf, L)
    pos = signal.reindex(idx).fillna(False).astype(bool).shift(2).fillna(False).astype(bool)
    daily = np.where(pos, rin, rf)
    sw = pos.astype(int).diff().abs().fillna(0)
    cost = C.RT_COST_1X / 2 if L == 1 else C.RT_COST_LEV / 2
    daily = daily - sw.values * cost
    eq = pd.Series(np.cumprod(1 + daily), index=idx)
    return eq, pos, int(sw.sum())


def run_200dma():
    spx = data.sp500_daily_tr()
    px, tr = spx["px"], spx["tr"]
    rf = data.daily_rf()
    sma = px.rolling(200).mean()
    sig = px > sma
    # month-end-only variant: evaluate the 200DMA rule only on the last trading day of each month
    me = px.groupby(px.index.to_period("M")).tail(1).index
    sig_me = sig.where(sig.index.isin(me)).ffill().fillna(False).astype(bool)
    # 3% band: enter when px > 1.03*sma, exit when px < 0.97*sma
    st = np.zeros(len(px), dtype=bool)
    inpos = False
    pv, sv = px.values, sma.values
    for i in range(len(px)):
        if np.isnan(sv[i]):
            st[i] = False
            continue
        if not inpos and pv[i] > 1.03 * sv[i]:
            inpos = True
        elif inpos and pv[i] < 0.97 * sv[i]:
            inpos = False
        st[i] = inpos
    sig_band = pd.Series(st, index=px.index)
    start = px.index[200]
    rows, curves = [], {}
    for L in [1, 2, 3]:
        bh = (1 + C.lev_returns(tr.pct_change().fillna(0), rf.reindex(px.index).ffill().fillna(0), L)).cumprod()
        bh = bh.loc[start:]
        curves[f"B&H {L}x"] = bh
        rows.append({"strategy": f"Buy&hold {L}x", "L": L, **_stats(bh, pd.Series(1.0, index=bh.index), 0, 252)})
        for nm, s in [("200DMA daily", sig), ("200DMA month-end", sig_me), ("200DMA 3% band", sig_band)]:
            eq, pos, n = daily_timing(px, tr, rf, L, s)
            eq = eq.loc[start:]
            pos = pos.loc[start:]
            curves[f"{nm} {L}x"] = eq
            rows.append({"strategy": f"{nm} {L}x", "L": L, **_stats(eq, pos.astype(float), n, 252)})
    res = pd.DataFrame(rows)
    # post-publication (Gayed & Bilello, 'Leverage for the Long Run', SSRN 2016; data ended 2015)
    post = []
    for k, eq in curves.items():
        e = eq.loc["2016-01-01":]
        post.append({"strategy": k, **_stats(e, pd.Series(1.0, index=e.index), 0, 252)})
    post = pd.DataFrame(post)[["strategy", "start", "end", "CAGR", "vol", "maxDD", "MAR"]]
    dec = decade_table({k: v for k, v in curves.items() if k.endswith("1x") or k.endswith("3x")})
    return res, post, dec, curves


# ------------------------------------------------------------------------------------------- monthly 10m SMA
def monthly_series():
    spx = data.sp500_daily_tr()
    px_m = spx["px"].resample("ME").last()
    tr_m = spx["tr"].resample("ME").last()
    rf_d = data.daily_rf()
    rf_m = (1 + rf_d).resample("ME").prod() - 1
    lev_m = {}
    rfd = rf_d.reindex(spx.index).ffill().fillna(0)
    r = spx["tr"].pct_change().fillna(0)
    for L in [1, 2, 3]:
        eq = (1 + C.lev_returns(r, rfd, L)).cumprod()
        lev_m[L] = eq.resample("ME").last().pct_change()
    return px_m, tr_m, rf_m.reindex(px_m.index).fillna(0), lev_m


def run_sma10():
    px_m, tr_m, rf_m, lev_m = monthly_series()
    sma10 = px_m.rolling(10).mean()
    sig = (px_m > sma10)
    pos = sig.shift(1).fillna(False).astype(bool)  # decided at month-end t, held during month t+1
    rows, curves = [], {}
    start = px_m.index[10]
    for L in [1, 2, 3]:
        rin = lev_m[L].fillna(0)
        cost = C.RT_COST_1X / 2 if L == 1 else C.RT_COST_LEV / 2
        sw = pos.astype(int).diff().abs().fillna(0)
        rr = np.where(pos, rin, rf_m) - sw * cost
        eq = pd.Series(np.cumprod(1 + rr), index=px_m.index).loc[start:]
        bh = (1 + rin).cumprod().loc[start:]
        curves[f"10m SMA {L}x"] = eq
        curves[f"B&H {L}x"] = bh
        rows.append({"strategy": f"Buy&hold {L}x", **_stats(bh, pd.Series(1.0, index=bh.index), 0, 12)})
        rows.append({"strategy": f"10m SMA {L}x", **_stats(eq, pos.loc[start:].astype(float), int(sw.loc[start:].sum()), 12)})
    res = pd.DataFrame(rows)
    post = []
    for k, eq in curves.items():
        e = eq.loc["2006-12-31":]
        post.append({"strategy": k, **_stats(e, pd.Series(1.0, index=e.index), 0, 12)})
    post = pd.DataFrame(post)[["strategy", "start", "end", "CAGR", "vol", "maxDD", "MAR"]]
    dec = decade_table(curves)
    # list of 10m SMA switches (few trades: show them)
    sw_dates = pos[pos.astype(int).diff().fillna(0) != 0]
    trades = []
    entry = None
    eq1 = curves["10m SMA 1x"]
    for d, v in sw_dates.items():
        if d < start:
            continue
        if v and entry is None:
            entry = d
        elif (not v) and entry is not None:
            trades.append((entry, d))
            entry = None
    if entry is not None:
        trades.append((entry, None))
    tl = []
    for e, x in trades:
        # position true in month e..(x-1); trade return = product of monthly TR during held months
        held = pos.loc[e:(x if x is not None else pos.index[-1])]
        held = held[held]
        rr = (1 + lev_m[1].reindex(held.index).fillna(0)).prod() - 1
        tl.append({"first_month_in": e.date(), "first_month_out": x.date() if x is not None else "open",
                   "months": len(held), "ret_1x": rr})
    return res, post, dec, curves, pd.DataFrame(tl)


# ------------------------------------------------------------------------------------------- GEM
def bond_tr_from_yield(y: pd.Series, maturity: float = 5.0) -> pd.Series:
    """Monthly total return of a constant-maturity par bond from month-end yields (in %):
    buy a par bond (coupon = last month's yield), one month later reprice it at the new yield with
    maturity shortened by one month, plus one month of coupon accrual.  Semiannual compounding."""
    y = (y / 100.0).astype(float)
    c = y.shift(1)
    n = maturity - 1 / 12
    v = (1 + y / 2) ** (-2 * n)
    price = (c / y) * (1 - v) + v
    r = price - 1 + c / 12
    return r.dropna()


def run_gem():
    px_m, tr_m, rf_m, lev_m = monthly_series()
    us = lev_m[1]
    dx = data.ff_developed_ex_us_monthly()
    exus = dx["MktRF"] + dx["RF"]
    gs5 = data.fred("DGS5").resample("ME").last()  # month-end 5y CMT yield (daily series from 1962)
    bond = bond_tr_from_yield(gs5, 5.0)
    df = pd.concat({"US": us, "EXUS": exus, "BOND": bond, "RF": rf_m}, axis=1).dropna()
    # validation of the synthetic bond against the IEI ETF (3-7y Treasuries) where both exist
    try:
        iei = data.yf_close("IEI", adj=True).resample("ME").last().pct_change().dropna()
        j = pd.concat([bond, iei], axis=1).dropna()
        j.columns = ["syn", "IEI"]
        yrs = len(j) / 12
        print("bond check vs IEI", j.index[0].date(), j.index[-1].date(), "corr", round(j.corr().iloc[0, 1], 3),
              "CAGR syn", round((1 + j.syn).prod() ** (1 / yrs) - 1, 4), "IEI", round((1 + j.IEI).prod() ** (1 / yrs) - 1, 4))
    except Exception as e:
        print("bond check failed", e)
    # validate synthetic bond vs IEF/AGG where available (printed in main)
    look = 12
    cum = (1 + df).rolling(look).apply(np.prod, raw=True) - 1
    choice = []
    for t in df.index:
        c = cum.loc[t]
        if c.isna().any():
            choice.append(None)
            continue
        if c["US"] > c["RF"]:
            choice.append("US" if c["US"] >= c["EXUS"] else "EXUS")
        else:
            choice.append("BOND")
    ch = pd.Series(choice, index=df.index).shift(1)  # decided at month end, held next month
    valid = ch.dropna().index
    d = df.loc[valid]
    ch = ch.loc[valid]
    rr = np.array([d.loc[t, a] for t, a in ch.items()])
    sw = (ch != ch.shift(1)).astype(int)
    sw.iloc[0] = 0
    rr = rr - sw.values * (C.RT_COST_1X)  # a switch = sell one ETF, buy another
    eq = pd.Series(np.cumprod(1 + rr), index=valid)
    bh = (1 + d["US"]).cumprod()
    exb = (1 + d["EXUS"]).cumprod()
    b6040 = (1 + 0.6 * d["US"] + 0.4 * d["BOND"]).cumprod()
    rows = [
        {"strategy": "GEM dual momentum", **_stats(eq, (ch != "BOND").astype(float), int(sw.sum()), 12)},
        {"strategy": "S&P 500 B&H", **_stats(bh, pd.Series(1.0, index=bh.index), 0, 12)},
        {"strategy": "Dev ex-US B&H", **_stats(exb, pd.Series(1.0, index=exb.index), 0, 12)},
        {"strategy": "60/40 US/5y bond (monthly rebal)", **_stats(b6040, pd.Series(1.0, index=b6040.index), 0, 12)},
    ]
    res = pd.DataFrame(rows)
    post = []
    for nm, e in [("GEM", eq), ("S&P 500", bh), ("Dev ex-US", exb), ("60/40", b6040)]:
        for lab, st in [("post-paper 2013-", "2012-12-31"), ("post-book 2015-", "2014-12-31")]:
            ee = e.loc[st:]
            post.append({"strategy": nm, "period": lab, **_stats(ee, pd.Series(1.0, index=ee.index), 0, 12)})
    post = pd.DataFrame(post)[["strategy", "period", "start", "end", "CAGR", "vol", "maxDD", "MAR"]]
    alloc = ch.value_counts(normalize=True)
    return res, post, eq, ch, alloc


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    r, p, dec, curves, tl = run_sma10()
    print(r.round(3).to_string()); print(p.round(3).to_string()); print(dec.round(3).to_string()); print(tl.round(3).to_string())
    r.to_csv(os.path.join(OUT, "trend_sma10.csv"), index=False)
    p.to_csv(os.path.join(OUT, "trend_sma10_postpub.csv"), index=False)
    dec.to_csv(os.path.join(OUT, "trend_sma10_decades.csv"))
    tl.to_csv(os.path.join(OUT, "trend_sma10_trades.csv"), index=False)
    r2, p2, dec2, curves2 = run_200dma()
    print(r2.round(3).to_string()); print(p2.round(3).to_string()); print(dec2.round(3).to_string())
    r2.to_csv(os.path.join(OUT, "trend_200dma.csv"), index=False)
    p2.to_csv(os.path.join(OUT, "trend_200dma_postpub.csv"), index=False)
    dec2.to_csv(os.path.join(OUT, "trend_200dma_decades.csv"))
    r3, p3, eq3, ch3, alloc = run_gem()
    print(r3.round(3).to_string()); print(p3.round(3).to_string()); print(alloc)
    print(ch3.tail(14))
    r3.to_csv(os.path.join(OUT, "trend_gem.csv"), index=False)
    p3.to_csv(os.path.join(OUT, "trend_gem_postpub.csv"), index=False)
    ch3.to_frame("holding").to_csv(os.path.join(OUT, "trend_gem_holdings.csv"))
