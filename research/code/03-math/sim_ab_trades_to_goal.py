"""(a) How many independent trades to reach 11x (+1000 %) with 50/75/90 % probability,
(b) distribution of terminal wealth and max drawdown after 10/30/100 trades.

Exact binomial / lattice-DP calculations are used for reach probabilities and terminal
quantiles; Monte Carlo (fixed seed) is used for maximum drawdown and to cross-check.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import (ALL_TRADES, CRISIS, FRACTIONS, GOAL, LN_GOAL, SEED, first_n_reaching,
                    fmt_pct, fmt_x, hitting_reach_prob, prob_terminal_below, save_table,
                    simulate_max_drawdown, terminal_quantiles, terminal_reach_prob)

N_MAX = 6000
TARGETS = (0.50, 0.75, 0.90)


def sizing_variants(trade):
    rows = [(label, c * trade.kelly) for label, c in FRACTIONS.items()]
    if trade is CRISIS:
        rows.insert(1, ("100% invested, no leverage (0.56 Kelly)", 1.0))
    return rows


def part_a():
    out = []
    for t in ALL_TRADES:
        for label, f in sizing_variants(t):
            g = float(t.growth(f))
            term = terminal_reach_prob(t, f, N_MAX)
            hit = hitting_reach_prob(t, f, N_MAX)
            row = {
                "Trade": t.name,
                "Sizing": label,
                "Stake (% of wealth)": f"{100 * f:.1f}%",
                "E[return] per trade on wealth": f"{100 * f * t.ev:+.1f}%",
                "E[log growth] per trade": f"{g:.4f}",
                "ln(11)/g": f"{LN_GOAL / g:.0f}" if g > 0 else "never",
            }
            for tgt in TARGETS:
                n_t = first_n_reaching(term, tgt)
                n_h = first_n_reaching(hit, tgt)
                row[f"N for P(end>=11x)>={int(tgt * 100)}%"] = n_t if n_t is not None else f">{N_MAX}"
                row[f"N for P(touch 11x)>={int(tgt * 100)}%"] = n_h if n_h is not None else f">{N_MAX}"
            out.append(row)
    df = pd.DataFrame(out)
    save_table(df, "a_trades_to_11x")
    return df


def part_b(n_paths=200_000):
    rng = np.random.default_rng(SEED)
    out = []
    for t in ALL_TRADES[:5]:
        for label, f in sizing_variants(t):
            # Crisis buys arrive ~once per 5-10 years, so 30-100 of them is not a lifetime.
            for n in ((3, 5, 10) if t is CRISIS else (10, 30, 100)):
                p5, med, p95 = terminal_quantiles(t, f, n)
                mean = (1 + f * t.ev) ** n
                mdd, _ = simulate_max_drawdown(t, f, n, n_paths, rng)
                out.append({
                    "Trade": t.name,
                    "Sizing": label,
                    "Trades": n,
                    "Mean W": fmt_x(mean),
                    "Median W": fmt_x(med),
                    "5th pct W": fmt_x(p5),
                    "95th pct W": fmt_x(p95),
                    "P(W<1)": fmt_pct(prob_terminal_below(t, f, n, 1.0)),
                    "P(W>=11x)": fmt_pct(float(terminal_reach_prob(t, f, n)[-1])),
                    "Median maxDD": fmt_pct(float(np.median(mdd))),
                    "P(maxDD>=50%)": fmt_pct(float(np.mean(mdd >= 0.5))),
                    "P(maxDD>=80%)": fmt_pct(float(np.mean(mdd >= 0.8))),
                })
    df = pd.DataFrame(out)
    save_table(df, "b_distribution_after_n")
    return df


def mc_crosscheck(n_paths=400_000):
    """Monte Carlo check of the exact reach probabilities for a few cases."""
    rng = np.random.default_rng(SEED + 1)
    rows = []
    from common import TREND, OPTION, EVENT10
    for t, c, n in [(TREND, 0.5, 58), (OPTION, 0.5, 170), (EVENT10, 0.25, 400), (CRISIS, 0.5, 6)]:
        f = c * t.kelly
        lu, ld = t.log_steps(f)
        wins = rng.binomial(n, t.p, size=n_paths)
        logw = wins * lu + (n - wins) * ld
        exact = float(terminal_reach_prob(t, f, n)[-1])
        rows.append({"Trade": t.name, "Kelly multiple": c, "N": n,
                     "exact P(end>=11x)": round(exact, 4),
                     "MC P(end>=11x)": round(float(np.mean(logw >= np.log(GOAL) - 1e-12)), 4)})
    df = pd.DataFrame(rows)
    save_table(df, "a_mc_crosscheck")
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    print(part_a().to_string())
    print(mc_crosscheck().to_string())
    print(part_b().to_string())
