"""Single-trade model used by the portfolio simulation (track 18).

Units: the underlying's log price is measured in units of its own daily volatility (sigma = 1).
Each trading day has an overnight gap (share GAMMA of the daily variance, Student-t tails) and an
intraday move (Gaussian).  Rare jumps model earnings/news gaps.

Two trade types
---------------
* STOP  : protective stop at -D (D = 3 sigma ~ 2 x ATR14), take-profit limit at +2D, time stop H days.
          Gap through the stop -> exit at the open (loss > 1R); gap through the target -> exit at
          the open (a limit sell fills at the better price).  Intraday barrier crossings use the
          Brownian-bridge crossing probability exp(-2 a b / v).
* DEFINED: a call-debit-spread-like payoff held to the time stop: premium = 1R, pays up to
          +B_OPT R.  X = (1 + B_OPT) * clip(Z_H / K2, 0, 1) - 1, where Z_H is the underlying move.
          The loss can never exceed 1R, whatever the gap.

The drift MU (sigma units per day) is chosen to hit a target per-trade Sharpe; `calibrate()`
builds the lookup table by Monte Carlo (fixed seed).
"""
from __future__ import annotations

import numpy as np
from scipy import stats

GAMMA = 0.35          # overnight share of daily variance (empirical median 0.34-0.36 for stocks/ETFs)
T_DOF = 3.0           # Student-t tails for the overnight component
JUMP_P = 1 / 126      # idiosyncratic news/earnings jump at the open, ~2 a year per name
JUMP_SD = 4.0         # jump size s.d. in daily sigmas
D_STOP = 3.0          # stop distance in daily sigmas (~2 x ATR14)
TARGET_R = 2.0        # take profit at +2R
B_OPT = 2.0           # defined-risk payoff: debit = 1/3 of width
K2_MULT = 1.0         # short strike at K2_MULT * sqrt(H) sigmas above spot
COST_STOP_R = 0.03    # round-trip cost in R (commission + spread + open-auction slippage)
STOP_SLIP_R = 0.02    # extra slippage when a stop-market order fills intraday
COST_DEF_R = 0.08     # round-trip cost for a two-leg option spread, in premium units
HOLD_DAYS = np.array([5, 10, 20, 40, 60])
HOLD_P = np.array([0.20, 0.30, 0.30, 0.10, 0.10])   # mean 20.5 trading days


def t_unit(rng, size, dof=T_DOF):
    """Student-t draws scaled to unit variance."""
    return rng.standard_t(dof, size=size) / np.sqrt(dof / (dof - 2))


def gap_draw(rng, size):
    g = np.sqrt(GAMMA) * t_unit(rng, size)
    jump = rng.random(size) < JUMP_P
    g = g + jump * rng.normal(0.0, JUMP_SD, size)
    return g


def bridge_cross(a, b, v, u):
    """Crossing indicator for a Brownian bridge from distance a to distance b (both >= 0 means
    still on the safe side) with variance v over the interval.  u ~ U(0,1)."""
    a = np.maximum(a, 0.0); b = np.maximum(b, 0.0)
    p = np.exp(-2.0 * a * b / np.maximum(v, 1e-12))
    return u < p


def bachelier_spread_value(z, rem, k2):
    """E[clip(Z_T, 0, k2)] for Z_T ~ N(z, rem) (zero drift): used to mark defined-risk trades."""
    sd = np.sqrt(np.maximum(rem, 1e-12))

    def call(k):
        m = (z - k) / sd
        return (z - k) * stats.norm.cdf(m) + sd * stats.norm.pdf(m)
    return call(0.0) - call(k2)


CRASH_P = 1 / 500      # market-wide gap day (factor), as in sim_portfolio.py
CRASH_SIZE = -6.0      # factor sigmas


def simulate_trades(mu, H, kind, n, rng, crash_load=0.0):
    """Monte Carlo of n independent trades of one type/horizon.  Returns R-multiples net of costs.
    crash_load > 0 adds the market-wide crash gap (prob CRASH_P a day) with that loading, so a
    stand-alone calibration matches the joint simulations."""
    level = np.zeros(n)
    alive = np.ones(n, dtype=bool)
    out = np.zeros(n)
    k2 = K2_MULT * np.sqrt(H)
    for day in range(H):
        g = gap_draw(rng, n)
        if crash_load:
            g = g + crash_load * (rng.random(n) < CRASH_P) * CRASH_SIZE
        i = rng.normal(0.0, np.sqrt(1 - GAMMA), n)
        lo = level + GAMMA * mu + g
        lc = lo + (1 - GAMMA) * mu + i
        if kind == "stop":
            stop_gap = alive & (lo <= -D_STOP)
            tgt_gap = alive & ~stop_gap & (lo >= TARGET_R * D_STOP)
            out[stop_gap] = lo[stop_gap] / D_STOP - STOP_SLIP_R
            out[tgt_gap] = lo[tgt_gap] / D_STOP
            alive &= ~(stop_gap | tgt_gap)
            u1, u2 = rng.random(n), rng.random(n)
            v = 1 - GAMMA
            hit_s = alive & ((lc <= -D_STOP) | bridge_cross(lo + D_STOP, lc + D_STOP, v, u1))
            hit_t = alive & ~hit_s & ((lc >= TARGET_R * D_STOP) |
                                      bridge_cross(TARGET_R * D_STOP - lo, TARGET_R * D_STOP - lc, v, u2))
            out[hit_s] = -1.0 - STOP_SLIP_R
            out[hit_t] = TARGET_R
            alive &= ~(hit_s | hit_t)
        level = lc
    if kind == "stop":
        out[alive] = level[alive] / D_STOP
        return out - COST_STOP_R
    x = (1 + B_OPT) * np.clip(level / k2, 0.0, 1.0) - 1.0
    return x - COST_DEF_R


def per_trade_stats(x):
    return dict(mean=float(x.mean()), sd=float(x.std()), sharpe=float(x.mean() / x.std()),
                m2=float(np.mean(x ** 2)), p01=float(np.quantile(x, 0.01)),
                worst=float(x.min()), p_win=float(np.mean(x > 0)))


def calibrate(targets=(0.0, 0.05, 0.1, 0.2, 0.3), n=200_000, seed=11):
    """Find the daily drift giving each target NET per-trade Sharpe, for each (kind, H)."""
    table = {}
    for kind in ("stop", "defined"):
        for H in HOLD_DAYS:
            mus = np.linspace(-0.05, 0.5, 23)
            srs = []
            for m in mus:
                rng = np.random.default_rng(seed)          # common random numbers
                srs.append(per_trade_stats(simulate_trades(m, int(H), kind, n // 4, rng))["sharpe"])
            srs = np.array(srs)
            for s in targets:
                mu = float(np.interp(s, srs, mus)) if srs.min() <= s <= srs.max() else np.nan
                rng = np.random.default_rng(seed + 1)
                st = per_trade_stats(simulate_trades(mu, int(H), kind, n, rng))
                table[(kind, int(H), s)] = dict(mu=mu, **st)
    return table


if __name__ == "__main__":
    import pandas as pd
    rng = np.random.default_rng(3)
    # Empirical check against gap_risk.py: stop-outs at 3 sigma (~2 ATR), zero drift, 20 days
    level = np.zeros(400_000); alive = np.ones_like(level, bool); loss = np.full(level.size, np.nan)
    gapped = np.zeros(level.size, bool)
    for day in range(20):
        g = gap_draw(rng, level.size); i = rng.normal(0, np.sqrt(1 - GAMMA), level.size)
        lo = level + g; lc = lo + i
        sg = alive & (lo <= -D_STOP); loss[sg] = -lo[sg] / D_STOP; gapped |= sg; alive &= ~sg
        u = rng.random(level.size)
        hs = alive & ((lc <= -D_STOP) | bridge_cross(lo + D_STOP, lc + D_STOP, 1 - GAMMA, u))
        loss[hs] = 1.0; alive &= ~hs; level = lc
    L = loss[np.isfinite(loss)]
    print(f"stopped {np.isfinite(loss).mean():.3f}  via gap {gapped.sum()/np.isfinite(loss).sum():.3f}  "
          f"mean {L.mean():.3f}R  P95 {np.quantile(L,.95):.2f}R  P99 {np.quantile(L,.99):.2f}R  "
          f"P99.9 {np.quantile(L,.999):.2f}R  worst {L.max():.1f}R")
    tab = calibrate()
    df = pd.DataFrame([{"kind": k[0], "H": k[1], "target_s": k[2], **v} for k, v in tab.items()])
    pd.set_option("display.width", 200)
    print(df.round(4).to_string())
