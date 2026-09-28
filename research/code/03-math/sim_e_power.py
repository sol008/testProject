"""(e) Power analysis: how long until a real edge is distinguishable from luck?

One-sided tests at the 90 % confidence level (alpha = 0.10), as asked, plus the more
conventional alpha = 0.05 and multiple-testing (Bonferroni) variants.
Exact binomial calculations for hit-rate edges; Monte Carlo (fixed seed) t-tests for
per-trade Sharpe edges, including a skewed (+3R/-1R) return distribution.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from common import OPTION, SEED, TREND, save_table

FREQS = (6, 12, 24)
POWERS = (0.5, 0.8, 0.9)


def n_needed_normal(sr, alpha=0.10, power=0.5):
    za = stats.norm.ppf(1 - alpha)
    zb = stats.norm.ppf(power)
    return ((za + zb) / sr) ** 2


def exact_binomial_power_curve(p0, p1, n_max, alpha=0.10):
    n = np.arange(1, n_max + 1)
    # smallest k with P(K >= k | p0) <= alpha
    kc = stats.binom.isf(alpha, n, p0) + 1   # isf gives k with P(K > k) <= alpha
    size = stats.binom.sf(kc - 1, n, p0)
    power = stats.binom.sf(kc - 1, n, p1)
    return n, power, size


def first_stable(n, power, target):
    """Smallest N from which power stays >= target (binomial power is saw-toothed)."""
    ok = power >= target
    bad = np.nonzero(~ok)[0]
    if bad.size == 0:
        return int(n[0])
    last_bad = bad[-1]
    return int(n[last_bad + 1]) if last_bad + 1 < len(n) else None


def part_e1_sharpe():
    rows = []
    for sr in (0.1, 0.2, 0.3, 0.5):
        for power in POWERS:
            for alpha, lab in ((0.10, "90% conf."), (0.05, "95% conf.")):
                n = n_needed_normal(sr, alpha, power)
                row = {"Per-trade Sharpe": sr, "Test": f"one-sided {lab}", "Power": f"{int(power * 100)}%",
                       "Trades needed": int(np.ceil(n))}
                for f in FREQS:
                    row[f"Years @ {f}/yr"] = round(n / f, 1)
                rows.append(row)
    df = pd.DataFrame(rows)
    save_table(df, "e1_power_sharpe_normal_approx")
    return df


def part_e1_mc(n_sims=20_000):
    """Monte Carlo t-test power for SR=0.3: normal returns vs the skewed trend trade."""
    rng = np.random.default_rng(SEED + 5)
    rows = []
    sr_trend = TREND.sharpe
    for label, sampler in (
        ("Normal returns, SR=0.306", lambda size: rng.normal(sr_trend, 1.0, size)),
        ("Trend trade +3R/-1R, p=0.40 (SR=0.306)", lambda size: np.where(rng.random(size) < TREND.p, 3.0, -1.0)),
        ("Convex option +10x/-1x, p=0.15 (SR=0.165)", lambda size: np.where(rng.random(size) < OPTION.p, 10.0, -1.0)),
    ):
        for n in (12, 18, 24, 36, 50, 73, 100, 150, 250, 350):
            x = sampler((n_sims, n))
            t = x.mean(axis=1) / (x.std(axis=1, ddof=1) / np.sqrt(n))
            crit = stats.t.ppf(0.90, n - 1)
            rows.append({"Return model": label, "Trades": n,
                         "Rejection rate (power) at one-sided 90%": f"{100 * np.mean(t > crit):.0f}%"})
    df = pd.DataFrame(rows)
    save_table(df, "e1_power_sharpe_mc")
    return df


def part_e2_hitrate():
    rows = []
    cases = [("Hit rate 55% vs 50% (even payoff)", 0.50, 0.55),
             ("Hit rate 60% vs 50% (even payoff)", 0.50, 0.60),
             ("Convex option p=.15 vs breakeven 1/11 (EV +65% vs 0)", 1 / 11, 0.15),
             ("Trend trade p=.40 vs breakeven .25 (+3R/-1R)", 0.25, 0.40),
             ("Crisis buy p=.80 vs breakeven .286 (+100%/-40%)", 0.4 / 1.4, 0.80)]
    for label, p0, p1 in cases:
        for alpha in (0.10, 0.05):
            n, power, _ = exact_binomial_power_curve(p0, p1, 5000, alpha)
            for target in POWERS:
                nn = first_stable(n, power, target)
                row = {"Edge": label, "Confidence": f"{int(100 * (1 - alpha))}% (one-sided)",
                       "Power": f"{int(target * 100)}%", "Trades needed": nn}
                for f in FREQS:
                    row[f"Years @ {f}/yr"] = round(nn / f, 1) if nn else None
                rows.append(row)
    df = pd.DataFrame(rows)
    save_table(df, "e2_power_hit_rate_exact")
    return df


def part_e3_multiple_testing():
    rows = []
    for k in (1, 10, 100, 1000):
        alpha = 0.10 / k
        z = stats.norm.ppf(1 - alpha)
        for sr in (0.1, 0.3):
            n50 = n_needed_normal(sr, alpha, 0.5)
            n90 = n_needed_normal(sr, alpha, 0.9)
            rows.append({"Variants tried (K)": k, "Required z (Bonferroni, 90% family conf.)": round(z, 2),
                         "Per-trade Sharpe": sr, "Trades for 50% power": int(np.ceil(n50)),
                         "Trades for 90% power": int(np.ceil(n90)),
                         "Years @12/yr (50% power)": round(n50 / 12, 1),
                         "Years @12/yr (90% power)": round(n90 / 12, 1)})
    df = pd.DataFrame(rows)
    save_table(df, "e3_multiple_testing")
    return df


def part_e4_monthly_noise():
    """How noisy is a 'monthly self-improvement' signal? Standard errors by window."""
    rows = []
    for f in FREQS:
        for months in (1, 3, 12, 36, 60):
            n = f * months / 12
            rows.append({"Trades/yr": f, "Look-back (months)": months, "Trades in window": round(n, 1),
                         "SE of hit rate (p=.5)": f"{100 * np.sqrt(0.25 / n):.0f}pp",
                         "SE of mean R/trade (sd=2R)": f"{2 / np.sqrt(n):.2f}R",
                         "95% CI half-width on hit rate": f"+/-{100 * 1.96 * np.sqrt(0.25 / n):.0f}pp"})
    df = pd.DataFrame(rows)
    save_table(df, "e4_monthly_estimation_noise")
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.max_rows", 300)
    print(part_e1_sharpe().to_string())
    print(part_e1_mc().to_string())
    print(part_e2_hitrate().to_string())
    print(part_e3_multiple_testing().to_string())
    print(part_e4_monthly_noise().to_string())
