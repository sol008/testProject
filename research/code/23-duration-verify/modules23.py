"""Simple, independent builders for the other modules that interact with W10 (tasks 2 and 3).

  M1  ST-1 dip-buy on SPY: close > 200-day SMA, Wilder RSI(2) < 10, VIX close >= 20; buy at the next open;
      sell at the open after the first close above the 5-day SMA; time stop: the open of session 21.
  W10 one position at a time, SPY from the next open, exit per rule (CAL<N> or F<H>).
  M4  O2 crash call-spread WINDOWS only (for cluster stress): S&P >= 15% below its 252-session high and
      VIX >= 30, first day, cool-down; open from the next session to the session before the last session
      within DTE calendar days.  (No option pricing here: the premium is the stress, 2% of NAV.)
  M3  BTC weekly (Sunday) close above its 10-week average, 3% of NAV, from the Monday after the signal.
  M2  long-only ETF8 (SPY QQQ IEF GLD USO FXE FXY FXA), sign of the 252-session excess return, per-leg
      weight 0.5 x min(3.54% / EWMA vol, 4), decided at the first close of each month and applied from the
      next session, 25% no-trade band, ETF costs per unit traded.  (Contango veto and the 3% US-cluster
      scaling are not modelled.)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common23 as K

ETF8 = ["SPY", "QQQ", "IEF", "GLD", "USO", "FXE", "FXY", "FXA"]
ETF_COST_BP = {"SPY": 2, "QQQ": 2, "IEF": 2, "GLD": 2, "USO": 4, "FXE": 6, "FXY": 6, "FXA": 8}


def vix_on(index) -> pd.Series:
    v = K._yf(K.C13 / "yf_IDX_VIX.csv")["Close"]
    return v.reindex(index).ffill(limit=3)


# ============================================================================ M1
def m1_trades(start="1993-01-29", time_stop=20) -> pd.DataFrame:
    s = K.spy()
    c = s["C"]
    vix = vix_on(s.index)
    sig = ((c > K.sma(c, 200)) & (K.rsi_wilder(c, 2) < 10) & (vix >= 20)).fillna(False).values
    ex = (c > K.sma(c, 5)).fillna(False).values
    aO, aC = s["aO"].values, s["aC"].values
    rf = K.rf_sessions().reindex(s.index).values
    rfc = np.r_[0.0, np.cumsum(rf)]
    vx = vix.values
    idx = s.index
    n = len(idx)
    t = int(np.searchsorted(idx.values, np.datetime64(start)))
    rows = []
    while t < n - 1:
        nxt = np.flatnonzero(sig[t:n - 1])
        if len(nxt) == 0:
            break
        t = t + int(nxt[0])
        e = t + 1
        last_chk = min(e + time_stop - 1, n - 2)
        seg = ex[e:last_chk + 1]
        if seg.any():
            X = e + int(np.argmax(seg)) + 1
            how = "sma5"
        else:
            X = e + time_stop
            how = "time"
        if X >= n:
            break
        cst = (2.0 if (np.isfinite(vx[t]) and vx[t] > 30) else 1.0) / 1e4
        gross = aO[X] / aO[e] - 1
        net = (1 + gross) * (1 - cst) / (1 + cst) - 1
        rows.append(dict(signal=idx[t], entry=idx[e], exit=idx[X], e=e, X=X, how=how, gross=gross, net=net,
                         excess=net - (rfc[X] - rfc[e]), sessions=X - e, cost=cst))
        t = X          # a new signal may come at the close of the exit day
    return pd.DataFrame(rows)


# ============================================================================ W10
def w10_trades(rule="CAL90", start="1993-01-29", one_at_a_time=True) -> pd.DataFrame:
    I = K.inst_spy()
    lo = int(np.searchsorted(I.dnum, np.datetime64(start, "D").astype(np.int64)))
    ev = np.flatnonzero(I.sig[lo:]) + lo
    tr = K.trade_returns(I, ev, rule)
    rows, busy = [], -1
    for k, i in enumerate(ev):
        if not tr["ok"][k]:
            continue
        if one_at_a_time and i < busy:
            continue
        e, X = int(tr["e"][k]), int(tr["X"][k])
        rows.append(dict(signal=I.dates[i], entry=I.dates[e], exit=I.dates[X], e=e, X=X, net=tr["net"][k],
                         gross=tr["gross"][k], excess=tr["excess"][k], days=tr["days"][k],
                         cost=((2.0 if np.nan_to_num(I.gauge[i]) > 30 else 1.0) / 1e4)))
        busy = X
    return pd.DataFrame(rows)


# ============================================================================ M4 windows
def o2_signals(cool_days: int, start="1990-03-01") -> pd.DatetimeIndex:
    g = K.gspc()["Close"]
    hi = g.rolling(252, min_periods=252).max()
    vix = vix_on(g.index)
    crash = ((g / hi - 1 <= -0.15) & (vix >= 30)).fillna(False)
    out, last = [], None
    for d in g.index[crash.values]:
        if d < pd.Timestamp(start):
            continue
        if last is None or (d - last).days > cool_days:
            out.append(d)
            last = d
    return pd.DatetimeIndex(out)


def o2_windows(dte: int, cool_days: int | None = None, start="1990-03-01") -> pd.DataFrame:
    cool = dte if cool_days is None else cool_days
    idx = K.gspc().index
    rows = []
    for d in o2_signals(cool, start):
        i = idx.get_loc(d)
        if i + 2 >= len(idx):
            continue
        e = idx[i + 1]
        lim = e + pd.Timedelta(days=dte)
        if lim > idx[-1]:
            continue
        E = idx[idx.searchsorted(lim, side="right") - 1]
        x = idx[idx.get_loc(E) - 1]
        rows.append(dict(signal=d, entry=e, exit=x, dte=dte, cool=cool))
    return pd.DataFrame(rows)


# ============================================================================ M3
def m3_daily(cost_side=0.0005):
    """Daily (7-day calendar) BTC position and position return; returns (on_daily, ret_daily, switches)."""
    px = K.btc_daily()
    px = px[~px.index.duplicated()].asfreq("D").ffill()
    wk = px[px.index.dayofweek == 6]                     # Sunday closes
    on_wk = wk > wk.rolling(10, min_periods=10).mean()
    # position for day d = the most recent Sunday decision strictly before d
    pos = on_wk.astype(float).reindex(px.index).shift(1).ffill().fillna(0.0)
    r = px.pct_change().fillna(0.0)
    sw = pos.diff().abs().fillna(0.0)
    ret = pos * r - sw * cost_side
    return pos, ret, int(sw.sum())


def m3_on_sessions(nyse_idx: pd.DatetimeIndex, weight=0.03, start=None) -> tuple[pd.Series, pd.Series]:
    """M3 excess contribution per NYSE session (weight x (BTC position return - bills)) and an on flag.
    start: first day the sleeve may hold BTC (the book streams use 2015-01-01, the IBIT-proxy era)."""
    pos, ret, _ = m3_daily()
    if start is not None:
        pos = pos.where(pos.index >= pd.Timestamp(start), 0.0)
        ret = ret.where(ret.index >= pd.Timestamp(start), 0.0)
    cum = (1 + ret).cumprod()
    s = cum.reindex(nyse_idx, method="ffill")
    r_sess = s.pct_change().fillna(0.0)
    on = pos.reindex(nyse_idx, method="ffill").fillna(0.0)
    rf = K.rf_sessions().reindex(nyse_idx).fillna(0.0)
    contrib = weight * (r_sess - rf * on)
    contrib[~np.isfinite(contrib)] = 0.0
    contrib[s.isna()] = 0.0
    on[s.isna()] = 0.0
    return contrib, on


# ============================================================================ M2
def m2_stream(s_scale=0.5, band=0.25):
    px = K.etf_adj(ETF8)
    px = px[px.index >= "2004-01-01"]
    r = px.pct_change()
    rf = K.rf_sessions().reindex(px.index).fillna(0.0)
    R = r.sub(rf, axis=0)
    vol = np.sqrt((R ** 2).ewm(com=60, min_periods=40).mean() * 252)
    P = (1 + R.fillna(0.0)).cumprod().where(R.notna().cumsum() > 0)
    mom = P / P.shift(252) - 1
    tgt = (s_scale * np.minimum(0.0354 / vol, 4.0) * (mom > 0)).where(R.notna().cumsum() > 252).fillna(0.0)
    first = pd.Series(px.index, index=px.index).groupby(px.index.to_period("M")).first().values
    dec = pd.DatetimeIndex(first)
    W = pd.DataFrame(np.nan, index=px.index, columns=ETF8)
    cur = pd.Series(0.0, index=ETF8)
    for d in dec:
        t = tgt.loc[d]
        new = cur.copy()
        for k in ETF8:
            if t[k] == 0 or abs(t[k] - cur[k]) >= band * abs(t[k]):
                new[k] = t[k]
        W.loc[d] = new.values
        cur = new
    W = W.ffill().fillna(0.0).shift(1).fillna(0.0)      # decided at the first close, held from the next session
    cost = pd.Series({k: ETF_COST_BP[k] / 1e4 for k in ETF8})
    turn = W.diff().abs().fillna(W.abs())
    net = (W.shift(1).fillna(0.0) * R.fillna(0.0)).sum(axis=1) - (turn * cost).sum(axis=1)
    rebal = int((turn.sum(axis=1) > 1e-9).sum())
    return net, W, rebal
