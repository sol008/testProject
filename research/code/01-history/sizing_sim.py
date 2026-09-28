"""Why the famous 'bet the ranch' winners are survivorship: Monte Carlo of a trader who makes
a small number of genuinely positive-EV, asymmetric bets, sized at different fractions of
capital.  Also shows what happens when the bettor overestimates his hit rate.

Outputs (./output): sizing_sim.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DIR

RNG = np.random.default_rng(20260928)
N_PATHS = 100_000


def kelly_binary(p: float, gross_mult: float) -> float:
    """Kelly fraction for a bet that returns gross_mult x stake with prob p, else loses the stake."""
    b = gross_mult - 1.0  # net odds
    return max(0.0, (b * p - (1 - p)) / b)


def simulate(p_true: float, gross_mult: float, frac: float, n_bets: int) -> np.ndarray:
    wins = RNG.random((N_PATHS, n_bets)) < p_true
    step = np.where(wins, 1 + frac * (gross_mult - 1), 1 - frac)
    return step.cumprod(axis=1)


def main():
    rows = []
    archetypes = [
        # name, believed p, true p, gross payoff multiple on the stake, bets
        ("Cheap convexity (10% chance of 15x)", 0.10, 0.10, 15.0, 30),
        ("Catalyst asymmetric bet (35% chance of 4x)", 0.35, 0.35, 4.0, 30),
        ("Same bet, but hit rate overestimated (true 25%)", 0.35, 0.25, 4.0, 30),
        ("Lottery-like bet with no edge (7% chance of 10x)", 0.07, 0.07, 10.0, 30),
    ]
    for name, p_bel, p_true, mult, n in archetypes:
        k = kelly_binary(p_bel, mult)
        ev = p_true * mult - 1
        for label, f in [("1% per bet", 0.01), ("2% per bet", 0.02), ("5% per bet", 0.05),
                         ("half-Kelly (believed)", k / 2), ("full Kelly (believed)", k),
                         ("2x Kelly", 2 * k), ("25% per bet", 0.25), ("all-in (100%)", 1.0)]:
            if f <= 0:
                continue
            w = simulate(p_true, mult, min(f, 1.0), n)
            term = w[:, -1]
            running_max = np.maximum.accumulate(np.concatenate([np.ones((N_PATHS, 1)), w], axis=1), axis=1)[:, 1:]
            mdd = (w / running_max - 1).min(axis=1)
            rows.append(dict(archetype=name, true_EV_per_bet=round(ev, 2), kelly_believed=round(k, 3),
                             sizing=label, fraction=round(min(f, 1.0), 3), n_bets=n,
                             median_terminal_x=round(float(np.median(term)), 2),
                             mean_terminal_x=round(float(term.mean()), 2),
                             p_lose_money=round(float((term < 1).mean()), 3),
                             p_lose_90pct=round(float((term < 0.1).mean()), 3),
                             p_drawdown_worse_50pct=round(float((mdd <= -0.5).mean()), 3),
                             p_10x_or_more=round(float((term >= 10).mean()), 4),
                             p99_terminal_x=round(float(np.quantile(term, 0.99)), 1)))
    df = pd.DataFrame(rows)
    df.to_csv(OUT_DIR / "sizing_sim.csv", index=False)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
