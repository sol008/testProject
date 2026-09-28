"""(c) Why estimation error favours fractional Kelly.

c1  The system believes the stated p, but the truth is 5 or 10 percentage points lower.
c2  p is estimated from a finite track record of n trades (plug-in vs shrunk sizing).
c3  Several simultaneous, correlated bets sized at individual Kelly vs jointly.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from common import (CRISIS, EVENT10, EVENT5, FRACTIONS, LN_GOAL, OPTION, SEED, TREND,
                    BinaryTrade, fmt_pct, fmt_x, prob_terminal_below, save_table,
                    terminal_reach_prob)


# --------------------------------------------------------------------------- c1
def part_c1():
    rows = []
    for t in (CRISIS, TREND, OPTION, EVENT5, EVENT10):
        # reference horizon: trades needed for a 50 % chance of 11x at correct half Kelly
        ref = terminal_reach_prob(t, 0.5 * t.kelly, 6000)
        n_ref = int(np.nonzero(ref >= 0.5)[0][0])
        for delta in (0.0, 0.05, 0.10):
            true_t = t.with_p(t.p - delta)
            g_opt = float(true_t.growth(true_t.kelly)) if true_t.kelly > 0 else 0.0
            for label, c in FRACTIONS.items():
                f = c * t.kelly                       # sized on the (wrong) belief
                g = float(true_t.growth(f))
                rows.append({
                    "Trade (believed p)": t.name,
                    "True p": f"{true_t.p:.2f}",
                    "True EV/$": f"{true_t.ev:+.2f}",
                    "Sizing on belief": label,
                    "Stake": f"{100 * f:.1f}%",
                    "Stake / true Kelly": (f"{f / true_t.kelly:.1f}x" if true_t.kelly > 0 else "inf (no edge)"),
                    "True log growth/trade": f"{g:+.4f}",
                    "% of best achievable": ("n/a (no edge)" if g_opt <= 0 else
                                             ("negative" if g < 0 else f"{100 * g / g_opt:.0f}%")),
                    "Ref. N trades": n_ref,
                    "P(end>=11x) at ref N": fmt_pct(float(terminal_reach_prob(true_t, f, n_ref)[-1])),
                    "P(end<0.5x) at ref N": fmt_pct(prob_terminal_below(true_t, f, n_ref, 0.5)),
                    "Median W at ref N": fmt_x(float(np.exp(n_ref * g)) if np.isfinite(g) else 0.0),
                })
    df = pd.DataFrame(rows)
    save_table(df, "c1_overestimated_p")
    return df


# --------------------------------------------------------------------------- c2
def expected_growth_under_estimation(t: BinaryTrade, n: int, policy) -> float:
    """E over track-record outcomes k~Bin(n,p) of the TRUE growth of the chosen stake."""
    k = np.arange(n + 1)
    w = stats.binom.pmf(k, n, t.p)
    f = np.clip(policy(k, n), 0.0, 0.99 / t.a)
    return float(np.sum(w * t.growth(f)))


def part_c2():
    rows = []
    cs = np.round(np.arange(0.0, 1.51, 0.01), 2)
    for t in (TREND, OPTION, EVENT10, EVENT5):
        p_be = t.a / (t.a + t.b)          # breakeven (zero-edge) win rate
        g_star = float(t.growth(t.kelly))
        for n in (10, 20, 50, 100, 250, 1000):
            def plug(c):
                return lambda k, n_: c * np.maximum(0, (k / n_) / t.a - (1 - k / n_) / t.b)

            res = {"Trade": t.name, "Track record n": n}
            for label, c in (("plug-in full", 1.0), ("plug-in half", 0.5), ("plug-in quarter", 0.25)):
                res[label] = f"{100 * expected_growth_under_estimation(t, n, plug(c)) / g_star:.0f}%"
            # best constant multiplier on the plug-in estimate
            vals = [expected_growth_under_estimation(t, n, plug(c)) for c in cs]
            i = int(np.argmax(vals))
            res["best constant multiplier"] = f"{cs[i]:.2f}"
            res["growth at best multiplier"] = f"{100 * vals[i] / g_star:.0f}%"

            # Bayesian: Beta prior centred on breakeven (no edge), strength n0 pseudo-trades
            for n0 in (20,):
                def bayes(k, n_, n0=n0, c=0.5):
                    pbar = (k + n0 * p_be) / (n_ + n0)
                    return c * np.maximum(0, pbar / t.a - (1 - pbar) / t.b)
                res["Bayes (prior=no edge, n0=20) x0.5"] = f"{100 * expected_growth_under_estimation(t, n, bayes) / g_star:.0f}%"
                res["Bayes (prior=no edge, n0=20) x1.0"] = f"{100 * expected_growth_under_estimation(t, n, lambda k, n_: bayes(k, n_, c=1.0)) / g_star:.0f}%"

            # t-stat shrinkage: multiplier = t^2/(1+t^2) on the plug-in Kelly, t from the record
            def tshrink(k, n_):
                ph = np.clip(k / n_, 1e-9, 1 - 1e-9)
                ev = ph * t.b - (1 - ph) * t.a
                sd = (t.a + t.b) * np.sqrt(ph * (1 - ph))
                tt = np.where(sd > 0, ev / (sd / np.sqrt(n_)), 0.0)
                tt = np.maximum(tt, 0)
                c = tt ** 2 / (1 + tt ** 2)
                return c * np.maximum(0, ph / t.a - (1 - ph) / t.b)
            res["plug-in x t^2/(1+t^2)"] = f"{100 * expected_growth_under_estimation(t, n, tshrink) / g_star:.0f}%"

            # James-Stein style: E[t_hat^2] = t^2 + 1, so an unbiased plug-in for the ideal
            # multiplier t^2/(1+t^2) is max(0, 1 - 1/t_hat^2)
            def js(k, n_, extra=1.0):
                ph = np.clip(k / n_, 1e-9, 1 - 1e-9)
                ev = ph * t.b - (1 - ph) * t.a
                sd = (t.a + t.b) * np.sqrt(ph * (1 - ph))
                tt = np.maximum(ev / (sd / np.sqrt(n_)), 1e-9)
                c = extra * np.maximum(0.0, 1 - 1 / tt ** 2)
                return c * np.maximum(0, ph / t.a - (1 - ph) / t.b)
            res["plug-in x max(0,1-1/t^2)"] = f"{100 * expected_growth_under_estimation(t, n, js) / g_star:.0f}%"
            res["plug-in x 0.5*max(0,1-1/t^2)"] = f"{100 * expected_growth_under_estimation(t, n, lambda k, n_: js(k, n_, 0.5)) / g_star:.0f}%"
            # standard error of the hit-rate estimate
            res["SE of hit rate"] = f"{100 * np.sqrt(t.p * t.q / n):.1f}pp"
            rows.append(res)
    df = pd.DataFrame(rows)
    save_table(df, "c2_finite_track_record")
    return df


# --------------------------------------------------------------------------- c3
def part_c3(n_bets=5, n_scen=1_000_000):
    rng = np.random.default_rng(SEED + 3)
    rows = []
    for t in (TREND, OPTION):
        thr = stats.norm.ppf(t.p)
        z = rng.standard_normal((n_scen, 1)).astype(np.float32)
        e = rng.standard_normal((n_scen, n_bets)).astype(np.float32)
        for rho in (0.0, 0.3, 0.6, 0.9):
            latent = np.sqrt(rho) * z + np.sqrt(1 - rho) * e
            wins = latent < thr
            nwins = wins.sum(axis=1)
            # sum of per-unit returns across the n bets in each scenario
            tot = nwins * t.b - (n_bets - nwins) * t.a
            uniq, cnt = np.unique(tot, return_counts=True)
            prob = cnt / n_scen
            outcome_corr = np.corrcoef(wins[:200_000, 0], wins[:200_000, 1])[0, 1]

            def g(f):
                x = 1 + f * uniq
                return -np.inf if np.any(x <= 0) else float(np.sum(prob * np.log(x)))

            fgrid = np.linspace(0, t.kelly, 2001)
            gv = np.array([g(f) for f in fgrid])
            i = int(np.nanargmax(gv))
            f_heur = t.kelly / (1 + (n_bets - 1) * rho)
            p_all_lose = float(prob[uniq == uniq.min()].sum())
            rows.append({
                "Trade": t.name,
                "Bets at once": n_bets,
                "Latent corr": rho,
                "Outcome corr": f"{outcome_corr:.2f}",
                "P(all lose)": fmt_pct(p_all_lose, 1),
                "Stake each at individual Kelly": f"{100 * t.kelly:.1f}%",
                "Growth/round at individual Kelly": ("-inf (ruin possible)" if not np.isfinite(g(t.kelly)) else f"{g(t.kelly):+.4f}"),
                "Joint-optimal stake each": f"{100 * fgrid[i]:.1f}%",
                "Joint-optimal total": f"{100 * n_bets * fgrid[i]:.0f}%",
                "Growth/round joint-optimal": f"{gv[i]:+.4f}",
                "Heuristic f*/(1+(n-1)rho) each": f"{100 * f_heur:.1f}%",
                "Growth/round heuristic": f"{g(f_heur):+.4f}" if np.isfinite(g(f_heur)) else "-inf",
                "Growth/round, half-heuristic": f"{g(0.5 * f_heur):+.4f}",
            })
    df = pd.DataFrame(rows)
    save_table(df, "c3_correlated_simultaneous_bets")
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    print(part_c1().to_string())
    print(part_c2().to_string())
    print(part_c3().to_string())
