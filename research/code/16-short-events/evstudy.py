"""Reusable event-study engine for track 16.

Input: a DataFrame of events with at least
    ticker      Yahoo symbol
    entry_date  trading day on which the position is opened
    entry_type  'close' (default) or 'open'
Output: the same rows with, for each horizon h (trading days after entry):
    r{h}   stock total return from entry to the close h sessions later
    b{h}   benchmark total return over the same interval (per-row benchmark in column 'bench')
    x{h}   r{h} - b{h}  (market-adjusted)
plus pre-event features (pre20 return, 60d vol, 20d median $ volume, Abdi-Ranaldo spread,
raw close) measured strictly before entry.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd

from common import abdi_ranaldo_spread, load_prices, raw_close, tr_index


@lru_cache(maxsize=None)
def px(t: str) -> pd.DataFrame | None:
    d = load_prices([t], verbose=False, download=False)
    return d.get(t)


@lru_cache(maxsize=1)
def cal() -> pd.DatetimeIndex:
    return px("SPY").index


def first_session_after(d, strictly=True) -> pd.Timestamp:
    c = cal()
    i = c.searchsorted(pd.Timestamp(d), side="right" if strictly else "left")
    return c[i] if i < len(c) else pd.NaT


def session_offset(d, k: int) -> pd.Timestamp:
    c = cal()
    i = c.searchsorted(pd.Timestamp(d), side="left")
    j = i + k
    return c[j] if 0 <= j < len(c) else pd.NaT


def _val_at(s: pd.Series, d, how="last"):
    """value of series at date d (or last available before d if how='last')."""
    if s is None or len(s) == 0 or pd.isna(d):
        return np.nan
    i = s.index.searchsorted(pd.Timestamp(d), side="right") - 1
    if i < 0:
        return np.nan
    return float(s.iloc[i])


def compute(events: pd.DataFrame, horizons=(1, 5, 20, 60), bench_col: str = "bench", features: bool = True,
            last_date=None) -> pd.DataFrame:
    ev = events.copy().reset_index(drop=True)
    if "entry_type" not in ev:
        ev["entry_type"] = "close"
    last_date = pd.Timestamp(last_date) if last_date is not None else cal()[-1]
    res = {f"{p}{h}": np.full(len(ev), np.nan) for h in horizons for p in ("r", "b", "x")}
    feat = {k: np.full(len(ev), np.nan) for k in ["pre20", "pre5", "vol60", "dvol20", "ar_spread", "raw_px", "entry_px",
                                                  "mdd60", "hist_days"]}
    for i, row in ev.iterrows():
        t, ed, et = row["ticker"], row["entry_date"], row["entry_type"]
        d = px(t) if isinstance(t, str) else None
        if d is None or pd.isna(ed):
            continue
        tr = tr_index(d)
        if pd.Timestamp(ed) not in tr.index:
            # stock did not trade on the entry session; use next available session
            j = tr.index.searchsorted(pd.Timestamp(ed))
            if j >= len(tr) or (tr.index[j] - pd.Timestamp(ed)).days > 7:
                continue
            ed = tr.index[j]
        if et == "open":
            adj = d.loc[ed, "Adj Close"] / d.loc[ed, "Close"] if d.loc[ed, "Close"] else np.nan
            p0 = d.loc[ed, "Open"] * adj
        else:
            p0 = tr.loc[ed]
        if not np.isfinite(p0) or p0 <= 0:
            continue
        bt = row.get(bench_col, "SPY") if bench_col in ev.columns else "SPY"
        bd = px(bt)
        btr = tr_index(bd)
        if et == "open":
            badj = bd.loc[ed, "Adj Close"] / bd.loc[ed, "Close"] if ed in bd.index else np.nan
            b0 = bd.loc[ed, "Open"] * badj if ed in bd.index else np.nan
        else:
            b0 = _val_at(btr, ed)
        for h in horizons:
            xd = session_offset(ed, h)
            if pd.isna(xd) or xd > last_date:
                continue
            p1 = _val_at(tr[tr.index <= xd], xd)
            if tr.index[-1] < xd - pd.Timedelta(days=7):
                continue  # series ends before exit (delisting); leave NaN
            b1 = _val_at(btr, xd)
            r = p1 / p0 - 1
            b = b1 / b0 - 1 if np.isfinite(b0) and b0 > 0 else np.nan
            res[f"r{h}"][i], res[f"b{h}"][i], res[f"x{h}"][i] = r, b, r - b
        if features:
            pre = d[d.index < ed]
            if len(pre) >= 2:
                trp = tr_index(pre)
                feat["hist_days"][i] = len(pre)
                feat["raw_px"][i] = float(raw_close(d).loc[pre.index[-1]])
                feat["entry_px"][i] = float(raw_close(d).loc[ed]) if ed in d.index else np.nan
                if len(pre) >= 21:
                    feat["pre20"][i] = trp.iloc[-1] / trp.iloc[-21] - 1
                    feat["pre5"][i] = trp.iloc[-1] / trp.iloc[-6] - 1
                    dv = (pre["Close"] * pre["Volume"]).iloc[-20:]
                    feat["dvol20"][i] = float(dv.median())
                if len(pre) >= 61:
                    lr = np.log(trp).diff().iloc[-60:]
                    feat["vol60"][i] = float(lr.std() * np.sqrt(252))
                    w = pre.iloc[-60:]
                    feat["ar_spread"][i] = abdi_ranaldo_spread(w["High"], w["Low"], w["Close"])
            # path max drawdown during the first 60 sessions after entry (for stop analysis)
            xd = session_offset(ed, 60)
            if not pd.isna(xd):
                path = tr[(tr.index >= ed) & (tr.index <= xd)] / p0 - 1
                if len(path):
                    feat["mdd60"][i] = float(path.min())
    for k, v in res.items():
        ev[k] = v
    if features:
        for k, v in feat.items():
            ev[k] = v
    ev["entry_date_used"] = ev["entry_date"]
    return ev


def net(ev: pd.DataFrame, h: int, cost_col: str = "cost_rt", excess: bool = True) -> pd.Series:
    base = ev[f"x{h}"] if excess else ev[f"r{h}"]
    return base - ev[cost_col]


def calendar_portfolio(ev: pd.DataFrame, h: int, ret_col_prefix="x", date_col="entry_date") -> pd.Series:
    """Equal-weight calendar-time portfolio: each event contributes its average daily log
    excess return spread evenly over its holding window; returns a daily series of the
    cross-sectional mean (approximation used only for correlation / drawdown diagnostics)."""
    c = cal()
    rows = []
    for _, r in ev.dropna(subset=[f"{ret_col_prefix}{h}"]).iterrows():
        i = c.searchsorted(pd.Timestamp(r[date_col]))
        if i + h >= len(c):
            continue
        daily = np.log1p(r[f"{ret_col_prefix}{h}"]) / h
        rows.append((i + 1, i + h, daily))
    if not rows:
        return pd.Series(dtype=float)
    s = np.zeros(len(c))
    n = np.zeros(len(c))
    for a, b, v in rows:
        s[a:b + 1] += v
        n[a:b + 1] += 1
    out = pd.Series(np.where(n > 0, s / np.maximum(n, 1), np.nan), index=c)
    return out.dropna()
