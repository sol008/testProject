"""Bayesian edge tracking, shrinkage/pooling and allocation.

- BetaBinomial: per-archetype hit rate (or P(thesis correct)).
- NormalInverseGamma: per-archetype mean trade return with unknown variance.
- empirical_bayes_normal / james_stein: partial pooling of archetype means.
- beta_binomial_pooling: hierarchical pooling of hit rates.
- thompson_allocation: attention/capital weights = P(sleeve is best), damped,
  with floors, caps and a maximum monthly step.
- Bayesian Kelly sizing (Browne & Whitt 1996) using posterior predictive.

References: Gelman et al. (2013) Bayesian Data Analysis 3e ch.2-5;
Efron & Morris (1975) JASA 70(350); DerSimonian & Laird (1986);
Thompson (1933) Biometrika 25; Russo et al. (2018) A Tutorial on Thompson
Sampling, FnT ML 11(1); Browne & Whitt (1996) Adv. Appl. Prob. 28(4);
Smith & Winkler (2006) Management Science 52(3) (optimizer's curse).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import stats


# ----------------------------------------------------------------------------
# Beta-Binomial
# ----------------------------------------------------------------------------
@dataclass(frozen=True)
class BetaBinomial:
    alpha: float
    beta: float

    @classmethod
    def from_mean_strength(cls, mean: float, strength: float) -> "BetaBinomial":
        """Prior centred on `mean` worth `strength` pseudo-trades.
        Default recommendation: strength 20 (a 5-trade streak moves the mean
        by at most 5/25 = 0.2 of the distance to 100%)."""
        return cls(mean * strength, (1 - mean) * strength)

    def update(self, wins: int, n: int) -> "BetaBinomial":
        if wins < 0 or wins > n:
            raise ValueError("0 <= wins <= n required")
        return BetaBinomial(self.alpha + wins, self.beta + n - wins)

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)

    @property
    def strength(self) -> float:
        return self.alpha + self.beta

    def interval(self, level: float = 0.9):
        a = (1 - level) / 2
        return (float(stats.beta.ppf(a, self.alpha, self.beta)),
                float(stats.beta.ppf(1 - a, self.alpha, self.beta)))

    def prob_greater(self, x: float) -> float:
        """Posterior P(hit rate > x), e.g. x = break-even hit rate 1/(1+b)."""
        return float(stats.beta.sf(x, self.alpha, self.beta))

    def sample(self, size, rng):
        return rng.beta(self.alpha, self.beta, size=size)


# ----------------------------------------------------------------------------
# Normal-Inverse-Gamma (unknown mean and variance of per-trade returns)
# ----------------------------------------------------------------------------
@dataclass(frozen=True)
class NormalInverseGamma:
    """mu | s2 ~ N(mu0, s2 / kappa),  s2 ~ InvGamma(a, b)."""
    mu0: float
    kappa: float
    a: float
    b: float

    @classmethod
    def from_beliefs(cls, mean_guess: float, mean_weight_trades: float,
                     sd_guess: float, sd_weight_trades: float) -> "NormalInverseGamma":
        """mean_guess: prior per-trade expected return (already haircut, e.g.
        50% of backtest; McLean & Pontiff 2016 find -58% post-publication).
        mean_weight_trades: how many trades the prior mean is worth.
        sd_guess / sd_weight_trades: same for the dispersion."""
        a = max(sd_weight_trades / 2.0, 1.01)
        b = sd_guess ** 2 * (a - 1)  # prior E[s2] = sd_guess^2
        return cls(mean_guess, mean_weight_trades, a, b)

    def update(self, x) -> "NormalInverseGamma":
        x = np.asarray(x, dtype=float)
        n = len(x)
        if n == 0:
            return self
        xbar = x.mean()
        ss = np.sum((x - xbar) ** 2)
        kn = self.kappa + n
        mun = (self.kappa * self.mu0 + n * xbar) / kn
        an = self.a + n / 2
        bn = self.b + 0.5 * ss + self.kappa * n * (xbar - self.mu0) ** 2 / (2 * kn)
        return NormalInverseGamma(mun, kn, an, bn)

    def mu_posterior(self):
        """Marginal posterior of the mean edge: Student-t."""
        return stats.t(df=2 * self.a, loc=self.mu0,
                       scale=np.sqrt(self.b / (self.a * self.kappa)))

    def predictive(self):
        """Posterior predictive of the next trade's return: Student-t."""
        return stats.t(df=2 * self.a, loc=self.mu0,
                       scale=np.sqrt(self.b * (self.kappa + 1) / (self.a * self.kappa)))

    def prob_edge_positive(self, threshold: float = 0.0) -> float:
        return float(self.mu_posterior().sf(threshold))


# ----------------------------------------------------------------------------
# Shrinkage / partial pooling across archetypes
# ----------------------------------------------------------------------------
def empirical_bayes_normal(means, ses):
    """Normal-normal partial pooling with the DerSimonian-Laird estimate of
    between-archetype variance tau^2.

    theta_k = B_k * grand + (1 - B_k) * mean_k,  B_k = se_k^2 / (se_k^2 + tau^2).
    With few trades per archetype se_k is large -> B_k near 1 -> heavy pooling,
    which is exactly the protection against the optimizer's curse."""
    x = np.asarray(means, dtype=float)
    se2 = np.asarray(ses, dtype=float) ** 2
    w = 1 / se2
    mu_fe = np.sum(w * x) / np.sum(w)
    Q = np.sum(w * (x - mu_fe) ** 2)
    k = len(x)
    denom = np.sum(w) - np.sum(w ** 2) / np.sum(w)
    tau2 = max(0.0, (Q - (k - 1)) / denom) if denom > 0 else 0.0
    wr = 1 / (se2 + tau2)
    grand = np.sum(wr * x) / np.sum(wr)
    B = se2 / (se2 + tau2) if tau2 > 0 else np.ones_like(x)
    theta = B * grand + (1 - B) * x
    return dict(theta=theta, shrink=B, tau2=tau2, grand=grand)


def james_stein(means, sigma2_common: float):
    """Positive-part James-Stein toward the grand mean (equal variances, K>=4)."""
    x = np.asarray(means, dtype=float)
    k = len(x)
    xbar = x.mean()
    s = np.sum((x - xbar) ** 2)
    c = max(0.0, 1 - (k - 3) * sigma2_common / s) if s > 0 else 0.0
    return xbar + c * (x - xbar)


def beta_binomial_pooling(wins, trials, min_strength: float = 4.0,
                          max_strength: float = 200.0, fixed_strength=None):
    """Hierarchical pooling of hit rates across archetypes.

    Prior Beta(m*s, (1-m)*s) with m = pooled rate and s estimated by method of
    moments from the between-archetype dispersion (ICC rho = 1/(s+1)), clipped
    to [min_strength, max_strength].  With < ~8 archetypes the MoM estimate is
    very noisy, so pass fixed_strength (recommended 20) until more data exist.
    Returns posterior means and the prior strength used."""
    k_ = np.asarray(wins, dtype=float)
    n_ = np.asarray(trials, dtype=float)
    N = n_.sum()
    m = k_.sum() / N
    K = len(n_)
    if fixed_strength is None:
        p_i = np.divide(k_, n_, out=np.full_like(k_, m), where=n_ > 0)
        S = np.sum(n_ * (p_i - m) ** 2)
        denom = N - np.sum(n_ ** 2) / N
        rho = (S / (m * (1 - m)) - (K - 1)) / denom if denom > 0 else 0.0
        rho = float(np.clip(rho, 1 / (max_strength + 1), 1 / (min_strength + 1)))
        s = 1 / rho - 1
    else:
        s = float(fixed_strength)
    post = (m * s + k_) / (s + n_)
    return dict(posterior_mean=post, prior_mean=m, prior_strength=s)


# ----------------------------------------------------------------------------
# Thompson-sampling allocation with guard rails
# ----------------------------------------------------------------------------
def _project_box_simplex(w, lo, hi, iters: int = 200):
    """Make weights sum to 1 while respecting lo <= w <= hi (requires
    K*lo <= 1 <= K*hi).  Spreads the surplus/deficit equally over the
    sleeves that can still move, then re-clips, until it balances."""
    w = np.clip(np.asarray(w, dtype=float), lo, hi)
    for _ in range(iters):
        gap = 1.0 - w.sum()
        if abs(gap) < 1e-12:
            break
        free = (w > lo + 1e-12) if gap < 0 else (w < hi - 1e-12)
        if not free.any():
            break
        w[free] += gap / free.sum()
        w = np.clip(w, lo, hi)
    return w


def prob_best(draws):
    """draws: array (n_draws, K) of posterior samples -> P(each sleeve is best)."""
    best = np.argmax(draws, axis=1)
    return np.bincount(best, minlength=draws.shape[1]) / draws.shape[0]


def thompson_allocation(draws, prev_weights=None, floor: float = 0.10, cap: float = 0.50,
                        damping: float = 0.25, max_step: float = 0.10):
    """Probability-matching weights (Thompson sampling in expectation), then
    guard rails: move only `damping` of the way toward the target each month,
    never more than `max_step` per sleeve per month, and keep every active
    sleeve within [floor, cap] so no sleeve is starved of evidence."""
    target = prob_best(draws)
    K = len(target)
    if prev_weights is None:
        prev_weights = np.full(K, 1.0 / K)
    prev = np.asarray(prev_weights, dtype=float)
    step = np.clip(damping * (target - prev), -max_step, max_step)
    return dict(target=target, weights=_project_box_simplex(prev + step, floor, cap))


# ----------------------------------------------------------------------------
# Bayesian Kelly sizing
# ----------------------------------------------------------------------------
def kelly_binary(p: float, b: float) -> float:
    """Kelly fraction for a bet winning b per unit staked with prob p."""
    return max(0.0, p - (1 - p) / b)


def bayesian_kelly_binary(post: BetaBinomial, b: float, fraction: float = 0.25) -> float:
    """For a single binary bet, expected log utility under a Beta posterior
    depends only on the posterior mean (linearity in p), so the Bayesian
    Kelly bet uses the posterior mean.  Then apply fractional Kelly."""
    return fraction * kelly_binary(post.mean, b)


def bayesian_kelly_continuous(post: NormalInverseGamma, fraction: float = 0.25) -> float:
    """Growth-optimal fraction ~ mean / variance of the posterior *predictive*
    (parameter uncertainty inflates the variance -> smaller bets)."""
    pred = post.predictive()
    var = pred.var()
    return max(0.0, fraction * pred.mean() / var) if np.isfinite(var) and var > 0 else 0.0
