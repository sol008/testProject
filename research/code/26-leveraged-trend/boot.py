"""Stationary block bootstrap of index paths, with the weekly trend rule re-run on every synthetic path.

Each path = 1 year of warm-up (for the 200-day average) + H years scored.  Blocks of daily
(index total return, index price return, benchmark total return, T-bill) tuples are drawn with a
geometric length of mean BLOCK days (Politis & Romano 1994), so volatility clustering and trends of
up to about a year survive.  Forward scenarios shift the daily index returns by a constant so the
1x index compounds at a chosen rate, and set T-bills to a constant rate.
"""
from __future__ import annotations

import numpy as np

import common as c

BLOCK = 250


def make_paths(n_pool: int, n_paths: int, T: int, rng: np.random.Generator, block: int = BLOCK) -> np.ndarray:
    idx = np.empty((n_paths, T), dtype=np.int64)
    idx[:, 0] = rng.integers(0, n_pool, n_paths)
    jump = rng.random((n_paths, T)) < 1.0 / block
    fresh = rng.integers(0, n_pool, (n_paths, T))
    for t in range(1, T):
        nxt = idx[:, t - 1] + 1
        nxt[nxt >= n_pool] = 0
        idx[:, t] = np.where(jump[:, t], fresh[:, t], nxt)
    return idx


def shift_for_target(r: np.ndarray, target: float, fee: float = 0.0) -> float:
    """Constant daily shift d so that the pool of (1 + r - d - fee/252) compounds at `target` a year."""
    lo, hi = -0.01, 0.01
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        g = np.exp(np.mean(np.log1p(r - mid - fee / c.TD)) * c.TD) - 1
        if g > target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def run_rule(r_tr, r_px, rf, L, band=0.02, n=200, filt=True, spread=None):
    """Vectorised weekly 200-day rule on (paths x days) arrays.  Decision every 5th day (Friday close),
    traded at the next close (position from day d+2).  Returns daily strategy returns."""
    sp = c.SPREAD if spread is None else spread
    P, T = r_tr.shape
    px = np.cumprod(1 + r_px, axis=1)
    cs = np.cumsum(px, axis=1)
    sma = np.full_like(px, np.nan)
    sma[:, n - 1:] = (cs[:, n - 1:] - np.concatenate([np.zeros((P, 1)), cs[:, :-n]], axis=1)) / n
    state = np.zeros((P, T))
    if filt:
        cur = np.zeros(P)
        for t in range(T):
            if t % 5 == 4 and t >= n - 1:
                up = px[:, t] > sma[:, t] * (1 + band)
                dn = px[:, t] < sma[:, t] * (1 - band)
                cur = np.where(up, 1.0, np.where(dn, 0.0, cur))
            state[:, t] = cur
    else:
        state[:] = 1.0
    E = np.zeros((P, T))
    E[:, 2:] = state[:, :-2] * L
    dE = np.abs(np.diff(np.concatenate([np.zeros((P, 1)), E], axis=1), axis=1))
    ret = E * r_tr - np.maximum(E - 1, 0) * (rf + sp / c.TD) - c.fee(E) / c.TD + np.maximum(1 - E, 0) * rf \
        - c.trade_cost(dE, L)
    return np.maximum(ret, -1.0)


def path_stats(ret: np.ndarray, bench: np.ndarray, warm: int) -> dict:
    r = ret[:, warm:]
    b = bench[:, warm:]
    yrs = r.shape[1] / c.TD
    eq = np.cumprod(1 + r, axis=1)
    cg = eq[:, -1] ** (1 / yrs) - 1
    cb = np.cumprod(1 + b, axis=1)[:, -1] ** (1 / yrs) - 1
    dd = (eq / np.maximum.accumulate(eq, axis=1) - 1).min(axis=1)
    return dict(cagr=cg, bench=cb, excess=cg - cb, maxdd=dd)


def summarize(st: dict) -> dict:
    ex, dd, cg = st["excess"], st["maxdd"], st["cagr"]
    return dict(med_cagr=float(np.median(cg)), p10_cagr=float(np.percentile(cg, 10)),
                p90_cagr=float(np.percentile(cg, 90)), med_spy=float(np.median(st["bench"])),
                med_excess=float(np.median(ex)), p_beat_spy=float((ex > 0).mean()),
                p_beat_by5=float((ex >= 0.05).mean()), p_dd50=float((dd <= -0.5).mean()),
                p_dd80=float((dd <= -0.8).mean()), med_maxdd=float(np.median(dd)),
                p_lose_money=float((cg < 0).mean()))
