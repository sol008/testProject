"""(f) The 'fewest trades' frontier: the best achievable P(reach 11x), and its price.

f1  Continuous time (GBM, Sharpe theta, cash rate r): Browne (1999) gives the maximum
    probability of reaching a wealth goal by a deadline:
        P* = Phi( Phi^-1( x0 e^{rT} / goal ) + theta sqrt(T) )
    achieved by replicating a digital option (end at the goal or at ~0). Compared with
    fractional-Kelly policies:  ln W_T ~ N( (r + theta^2 (c - c^2/2)) T, (c theta)^2 T ).
f2  Discrete binary trades: dynamic programming over (log-wealth, trades left) for the
    policy maximising P(touch 11x within N trades), no leverage (stake <= 100 %),
    plus forward simulation of that policy to measure how often it ends near zero.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import optimize, stats

from common import (CRISIS, EVENT10, GOAL, LN_GOAL, OPTION, SEED, TREND, BinaryTrade,
                    fmt_pct, hitting_reach_prob, save_table)

R_CASH = 0.035


def p_frac_kelly(theta, T, c, r=R_CASH):
    drift = (r + theta ** 2 * (c - c ** 2 / 2)) * T
    sd = c * theta * np.sqrt(T)
    return stats.norm.sf((LN_GOAL - drift) / sd)


def p_browne(theta, T, r=R_CASH):
    x = np.exp(r * T) / GOAL
    if x >= 1:
        return 1.0
    return stats.norm.cdf(stats.norm.ppf(x) + theta * np.sqrt(T))


def part_f1():
    rows = []
    for T in (5, 10, 20):
        for theta in (0.2, 0.3, 0.4, 0.5, 0.75, 1.0):
            rows.append({"Years": T, "Annual Sharpe": theta,
                         "Full Kelly": fmt_pct(p_frac_kelly(theta, T, 1.0)),
                         "Half Kelly": fmt_pct(p_frac_kelly(theta, T, 0.5)),
                         "Quarter Kelly": fmt_pct(p_frac_kelly(theta, T, 0.25)),
                         "Max possible (Browne goal-seeking; else ~0)": fmt_pct(p_browne(theta, T)),
                         "Full-Kelly P(W_T<0.5)": fmt_pct(stats.norm.cdf((np.log(0.5) - (R_CASH + theta ** 2 / 2) * T) / (theta * np.sqrt(T)))),
                         "Half-Kelly P(W_T<0.5)": fmt_pct(stats.norm.cdf((np.log(0.5) - (R_CASH + theta ** 2 * 0.375) * T) / (0.5 * theta * np.sqrt(T))))})
    df = pd.DataFrame(rows)
    save_table(df, "f1_prob_11x_by_sharpe_and_policy")

    # required Sharpe for a given probability of 11x by T
    req = []
    for T in (5, 10, 20):
        for target in (0.5, 0.75, 0.9):
            row = {"Years": T, "Target P(11x)": fmt_pct(target)}
            for lab, fn in (("Full Kelly", lambda th: p_frac_kelly(th, T, 1.0)),
                            ("Half Kelly", lambda th: p_frac_kelly(th, T, 0.5)),
                            ("Quarter Kelly", lambda th: p_frac_kelly(th, T, 0.25)),
                            ("Browne max (all-or-nothing)", lambda th: p_browne(th, T))):
                th = optimize.brentq(lambda th: fn(th) - target, 1e-4, 10)
                row[f"Sharpe needed: {lab}"] = round(th, 2)
            req.append(row)
    dfr = pd.DataFrame(req)
    save_table(dfr, "f1_required_sharpe_for_11x")
    return df, dfr


# ----------------------------------------------------------------------------- f2
def make_grid(steps_to_goal=600, x_min=np.log(1e-4)):
    """Evenly spaced log-wealth grid with 0 (start) and ln(11) (goal) exactly on it."""
    h = LN_GOAL / steps_to_goal
    k0 = int(round(-x_min / h))
    x = h * (np.arange(k0 + steps_to_goal + 1) - k0)
    return x, h, k0


def floor_index(xq, x, h):
    """Grid index at or below xq (conservative: wealth rounded down). -1 = below grid."""
    i = np.floor((xq - x[0]) / h + 1e-9)
    i = np.where(np.isfinite(i), i, -1)
    return np.clip(i, -1, len(x) - 1).astype(np.int64)


def goal_dp(t: BinaryTrade, n_max: int, f_cap: float = 1.0, n_f=401):
    """Max P(touch goal within n trades) with stake f in [0, f_cap] (lower bound, exact
    up to rounding wealth down to the grid). Returns grid, V[n] and the policy."""
    x, h, k0 = make_grid()
    m = len(x)
    f = np.linspace(0, f_cap, n_f)
    with np.errstate(divide="ignore"):
        up = np.log1p(f * t.b)
        dn = np.log1p(-f * t.a)
    V = np.zeros(m)
    V[-1] = 1.0
    Vs, pols = [V.copy()], []
    for _ in range(n_max):
        Vext = np.append(V, 0.0)           # index -1 -> ruin (value 0)
        iu = floor_index(x[:, None] + up[None, :], x, h)
        idn = floor_index(x[:, None] + dn[None, :], x, h)
        val = t.p * Vext[iu] + t.q * Vext[idn]
        j = np.argmax(val - 1e-12 * f[None, :], axis=1)   # tie-break toward smaller stakes
        V = val[np.arange(m), j]
        V[-1] = 1.0
        pol = f[j]
        pol[-1] = 0.0
        Vs.append(V.copy())
        pols.append(pol)
    return x, h, k0, np.array(Vs), np.array(pols)


def simulate_policy(t, x, h, pols, n, n_paths=200_000, seed=SEED + 7):
    rng = np.random.default_rng(seed)
    lw = np.zeros(n_paths)
    done = np.zeros(n_paths, bool)
    for step in range(n):
        pol = pols[n - step - 1]
        i = floor_index(lw, x, h)
        fs = np.where(done | (i < 0), 0.0, pol[np.maximum(i, 0)])
        win = rng.random(n_paths) < t.p
        with np.errstate(divide="ignore"):
            lw = lw + np.where(win, np.log1p(fs * t.b), np.log1p(-fs * t.a))
        lw = np.where(np.isfinite(lw), lw, -50.0)
        done |= lw >= LN_GOAL - 1e-9
    return np.mean(done), np.mean(lw <= np.log(0.1)), np.mean(lw < 0)


def part_f2():
    rows = []
    for t, ns, cap in ((OPTION, (1, 2, 3, 5, 10, 20, 50, 100, 150), 1.0),
                       (TREND, (1, 2, 3, 5, 10, 20, 50, 100), 1.0),
                       (EVENT10, (1, 3, 5, 10, 20, 50, 100, 150), 1.0),
                       (CRISIS, (1, 2, 3, 4, 5, 6), 1.0),
                       (CRISIS, (1, 2, 3, 4, 5, 6), 2.0)):
        n_max = max(ns)
        x, h, i0, Vs, pols = goal_dp(t, n_max, f_cap=cap)
        kel = {c: hitting_reach_prob(t, c * t.kelly, n_max) for c in (1.0, 0.5)}
        for n in ns:
            p_goal, p_bust, p_loss = simulate_policy(t, x, h, pols, n)
            rows.append({"Trade": t.name, "Max stake": f"{cap:.0%}", "Trades allowed N": n,
                         "Max P(touch 11x) (DP)": fmt_pct(Vs[n][i0], 1),
                         "  ...MC check": fmt_pct(p_goal, 1),
                         "  ...P(end <=10% of start)": fmt_pct(p_bust, 1),
                         "  ...P(end below start)": fmt_pct(p_loss, 1),
                         "  first-trade stake": f"{100 * pols[n - 1][i0]:.0f}%",
                         "Full Kelly P(touch 11x)": fmt_pct(kel[1.0][n], 1),
                         "Half Kelly P(touch 11x)": fmt_pct(kel[0.5][n], 1)})
    df = pd.DataFrame(rows)
    save_table(df, "f2_goal_seeking_frontier_discrete")
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.max_rows", 300)
    a, b = part_f1()
    print(a.to_string())
    print(b.to_string())
    print(part_f2().to_string())
