"""Closed-form power analysis: how long until an edge is statistically visible?

Normal approximation, one-sided alpha = 5 %, power = 80 % unless stated:
    n_required = ((z_{1-alpha} + z_{power}) / effect_in_sd_units)^2
For an annualised Sharpe ratio S the t-stat after T years is ~ S*sqrt(T), so
    T_years = ((z_a + z_b) / S)^2       (independent of trade count!)
For per-trade Sharpe s (mean / sd of one trade's return) the unit is trades.
Lo (2002, FAJ 58(4)) gives SE(SR) ~ sqrt((1 + SR^2/2)/T) for iid returns;
the (1 + ...) correction is negligible for the small per-period SRs here.
"""
from __future__ import annotations

import numpy as np
from scipy import stats

from overfitting import min_trl


def z_sum(alpha: float = 0.05, power: float = 0.8) -> float:
    return stats.norm.ppf(1 - alpha) + stats.norm.ppf(power)


def years_to_detect_sharpe(sr_annual: float, alpha=0.05, power=0.8) -> float:
    return (z_sum(alpha, power) / sr_annual) ** 2


def trades_to_detect(per_trade_sr: float, alpha=0.05, power=0.8) -> float:
    return (z_sum(alpha, power) / per_trade_sr) ** 2


def hit_rate_n(p0: float, p1: float, alpha=0.05, power=0.8) -> int:
    """Exact one-sided binomial test: smallest n with power >= target."""
    for n in range(5, 20000):
        k_crit = stats.binom.ppf(1 - alpha, n, p0) + 1  # reject if wins >= k_crit
        # make sure size <= alpha
        while stats.binom.sf(k_crit - 1, n, p0) > alpha:
            k_crit += 1
        if stats.binom.sf(k_crit - 1, n, p1) >= power:
            return n
    return -1


def binary_payoff_stats(p_win: float, win_mult: float, loss_mult: float = 1.0):
    """Per-trade mean, sd and Sharpe of a trade that returns +win_mult (x risk)
    with prob p_win, else -loss_mult.  E.g. a long option bought for 1 that
    pays 4 net when right and loses the premium otherwise: win_mult=4."""
    mean = p_win * win_mult - (1 - p_win) * loss_mult
    sd = (win_mult + loss_mult) * np.sqrt(p_win * (1 - p_win))
    skew = (1 - 2 * p_win) / np.sqrt(p_win * (1 - p_win))
    kurt = 3 + (1 - 6 * p_win * (1 - p_win)) / (p_win * (1 - p_win))
    return dict(mean=mean, sd=sd, sr=mean / sd, skew=skew, kurt=kurt)


def design_effect(m: int, icc: float) -> float:
    """Kish design effect for m correlated sub-questions per trade."""
    return 1 + (m - 1) * icc


def expected_longest_streak_prob(n: int, p: float, k: int, n_sims: int = 200_000,
                                 seed: int = 7) -> float:
    """P(at least one run of >= k consecutive wins in n trades)."""
    rng = np.random.default_rng(seed)
    wins = rng.random((n_sims, n)) < p
    run = np.zeros(n_sims, dtype=int)
    best = np.zeros(n_sims, dtype=int)
    for j in range(n):
        run = np.where(wins[:, j], run + 1, 0)
        best = np.maximum(best, run)
    return float(np.mean(best >= k))


def tables():
    """Return the power tables used in the report as lists of dicts."""
    out = {}
    out["sharpe_years"] = [dict(sr_annual=s, years=years_to_detect_sharpe(s))
                           for s in (0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0)]
    rows = []
    for s in (0.1, 0.2, 0.3, 0.5, 0.75):
        n = trades_to_detect(s)
        rows.append(dict(per_trade_sr=s, trades=n, years_at_12=n / 12, years_at_24=n / 24))
    out["per_trade"] = rows
    out["hit_rate"] = [dict(p0=0.5, p1=p1, n=hit_rate_n(0.5, p1),
                            years_at_12=hit_rate_n(0.5, p1) / 12)
                       for p1 in (0.55, 0.60, 0.65, 0.70, 0.80)]
    opt = []
    for p_skill, mult in ((0.25, 4.0), (0.30, 4.0), (0.15, 9.0), (0.40, 2.0), (0.55, 1.0)):
        st = binary_payoff_stats(p_skill, mult)
        p_be = 1 / (1 + mult)
        n_normal = trades_to_detect(st["sr"])
        # skew/kurtosis-adjusted normal approximation: the SR estimator's
        # variance is v = 1 - skew*SR + (kurt-1)/4*SR^2 (Mertens 2002) under H1
        v = 1 - st["skew"] * st["sr"] + (st["kurt"] - 1) / 4 * st["sr"] ** 2
        za, zb = stats.norm.ppf(0.95), stats.norm.ppf(0.8)
        n_adj = ((za + zb * np.sqrt(v)) / st["sr"]) ** 2
        n_exact = hit_rate_n(p_be, p_skill)
        # MinTRL (Bailey & Lopez de Prado 2012) = length at which the *point
        # estimate* reaches PSR >= 95 %, i.e. ~50 % power -- shown for reference
        n_mintrl = min_trl(st["sr"], 0.0, st["skew"], st["kurt"])
        opt.append(dict(payoff=f"+{mult:g}x / -1x", breakeven_hit=p_be,
                        true_hit=p_skill, ev_per_trade=st["mean"], per_trade_sr=st["sr"],
                        trades_normal_80=n_normal, trades_skew_adj_80=n_adj,
                        trades_exact_binomial_80=n_exact, mintrl_50pct_power=n_mintrl,
                        years_at_12_exact=n_exact / 12))
    out["option_like"] = opt
    out["streaks"] = [dict(n=n, p=p, k=k, prob=expected_longest_streak_prob(n, p, k))
                      for (n, p, k) in ((24, 0.5, 5), (24, 0.4, 4), (60, 0.5, 6), (12, 0.5, 4))]
    out["design_effect"] = [dict(m=m, icc=icc, deff=design_effect(m, icc),
                                 effective_per_trade=m / design_effect(m, icc))
                            for m in (4, 6, 10) for icc in (0.3, 0.5, 0.7)]
    return out


if __name__ == "__main__":
    import json
    print(json.dumps(tables(), indent=1, default=float))
