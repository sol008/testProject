"""Vectorised event-window returns for large event sets (earnings, 8-Ks, 13Ds).

anchor_windows(ev, windows) computes, for every event row, close-to-close total returns
between session offsets (i0, i1) relative to an anchor session, where
    anchor session = first market session ON or AFTER ev['anchor'] (a calendar date).
Prices are aligned to the SPY session calendar; a stock's total-return index is
forward-filled for at most 5 sessions (trading halts); before its first Yahoo date it is NaN.
Also returns simple features measured strictly before the anchor session.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import raw_close, tr_index
from evstudy import cal, px


def _aligned(t: str):
    d = px(t)
    if d is None:
        return None
    c = cal()
    d = d[~d.index.duplicated()]
    tr = tr_index(d).reindex(c).ffill(limit=5).values
    op = (d["Open"] * (d["Adj Close"] / d["Close"])).reindex(c).values  # dividend-adjusted open, same basis as tr
    cl_split = d["Close"].reindex(c).values
    rc = raw_close(d).reindex(c).ffill(limit=5).values
    dv = (d["Close"] * d["Volume"]).reindex(c).values
    return tr, op, cl_split, rc, dv


def anchor_windows(ev: pd.DataFrame, windows: dict, anchor_col: str = "anchor", bench: str | None = "SPY",
                   features: bool = True, gap_offsets: tuple = ()) -> pd.DataFrame:
    ev = ev.reset_index(drop=True).copy()
    c = cal()
    n = len(ev)
    a_all = c.searchsorted(pd.to_datetime(ev[anchor_col]).values, side="left")
    ev["anchor_idx"] = a_all
    res = {k: np.full(n, np.nan) for k in windows}
    feats = {k: np.full(n, np.nan) for k in ["raw_px", "dvol20", "vol60", "hist"]}
    gaps = {f"gap{g}": np.full(n, np.nan) for g in gap_offsets}
    gaps.update({f"oc{g}": np.full(n, np.nan) for g in gap_offsets})
    for t, g in ev.groupby("ticker"):
        al = _aligned(t) if isinstance(t, str) else None
        if al is None:
            continue
        tr, op, cls, rc, dv = al
        idx = g.index.values
        a = a_all[idx]
        for k, (i0, i1) in windows.items():
            j0, j1 = a + i0, a + i1
            ok = (j0 >= 0) & (j1 < len(c)) & (j0 < len(c)) & (j1 >= 0)
            v = np.full(len(idx), np.nan)
            v[ok] = tr[j1[ok]] / tr[j0[ok]] - 1
            res[k][idx] = v
        for gof in gap_offsets:
            j = a + gof
            ok = (j >= 1) & (j < len(c))
            v = np.full(len(idx), np.nan)
            w = np.full(len(idx), np.nan)
            v[ok] = op[j[ok]] / tr[j[ok] - 1] - 1
            w[ok] = tr[j[ok]] / op[j[ok]] - 1
            gaps[f"gap{gof}"][idx] = v
            gaps[f"oc{gof}"][idx] = w
        if features:
            for m, ai in zip(idx, a):
                if ai < 2 or ai > len(c):
                    continue
                feats["raw_px"][m] = rc[ai - 1]
                lo = max(0, ai - 20)
                seg = dv[lo:ai]
                seg = seg[np.isfinite(seg)]
                feats["dvol20"][m] = np.median(seg) if len(seg) else np.nan
                lo60 = max(0, ai - 61)
                trs = tr[lo60:ai]
                trs = trs[np.isfinite(trs)]
                feats["hist"][m] = np.isfinite(tr[:ai]).sum()
                if len(trs) > 20:
                    feats["vol60"][m] = np.std(np.diff(np.log(trs))) * np.sqrt(252)
    for k, v in res.items():
        ev[k] = v
    for k, v in gaps.items():
        ev[k] = v
    if features:
        for k, v in feats.items():
            ev[k] = v
    if bench:
        for b in ([bench] if isinstance(bench, str) else bench):
            al = _aligned(b)
            tr = al[0]
            for k, (i0, i1) in windows.items():
                j0, j1 = a_all + i0, a_all + i1
                ok = (j0 >= 0) & (j1 < len(c))
                v = np.full(n, np.nan)
                v[ok] = tr[j1[ok]] / tr[j0[ok]] - 1
                ev[f"{k}_{b}"] = v
    return ev
