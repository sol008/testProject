"""Overfitting and sequential-monitoring statistics.

- Probabilistic / Deflated Sharpe ratio, Minimum Track Record Length
  (Bailey & Lopez de Prado 2012 J. Risk 15(2); 2014 JPM 40(5)).
- Minimum Backtest Length (Bailey, Borwein, Lopez de Prado & Zhu 2014,
  Notices AMS 61(5)).
- Probability of Backtest Overfitting via CSCV (Bailey, Borwein, Lopez de
  Prado & Zhu 2017, J. Computational Finance 20(4)).
- CUSUM (Page 1954, Biometrika 41) and Wald SPRT (Wald 1945) for edge decay.
- Betting e-process (Shafer 2021 JRSS-A; Ramdas, Grunwald, Vovk & Shafer 2023
  Stat. Sci. 38(4); Waudby-Smith & Ramdas 2024 JRSS-B): an evidence measure
  that stays valid when the result is checked every month (no peeking bias).
"""
from __future__ import annotations

import itertools

import numpy as np
from scipy import stats

EULER_GAMMA = 0.5772156649015329


# ----------------------------------------------------------------------------
# Sharpe-ratio inference
# ----------------------------------------------------------------------------
def sharpe_stats(returns):
    """Per-period Sharpe (mean/sd, excess returns assumed), skewness and
    (non-excess) kurtosis of a return series."""
    r = np.asarray(returns, dtype=float)
    sr = r.mean() / r.std(ddof=1)
    return dict(sr=float(sr), skew=float(stats.skew(r)),
                kurt=float(stats.kurtosis(r, fisher=False)), n=len(r))


def psr(sr_hat: float, sr_star: float, n: int, skew: float = 0.0, kurt: float = 3.0) -> float:
    """Probabilistic Sharpe Ratio: P(true SR > sr_star) given an estimate from
    n observations, correcting for non-normality (per-period units)."""
    denom = np.sqrt(max(1e-12, 1 - skew * sr_hat + (kurt - 1) / 4 * sr_hat ** 2))
    return float(stats.norm.cdf((sr_hat - sr_star) * np.sqrt(n - 1) / denom))


def expected_max_sr(n_trials: int, var_sr: float) -> float:
    """Expected maximum of n_trials Sharpe estimates when all true SRs are 0
    (False Strategy Theorem approximation)."""
    if n_trials <= 1:
        return 0.0
    z1 = stats.norm.ppf(1 - 1 / n_trials)
    z2 = stats.norm.ppf(1 - 1 / (n_trials * np.e))
    return float(np.sqrt(var_sr) * ((1 - EULER_GAMMA) * z1 + EULER_GAMMA * z2))


def dsr(sr_hat: float, n: int, n_trials: int, var_sr_trials: float,
        skew: float = 0.0, kurt: float = 3.0) -> float:
    """Deflated Sharpe Ratio = PSR against the expected max SR of n_trials
    zero-skill trials.  n_trials must count *every* variant ever evaluated
    (the trial registry), not only the ones that were proposed."""
    return psr(sr_hat, expected_max_sr(n_trials, var_sr_trials), n, skew, kurt)


def min_trl(sr_hat: float, sr_star: float = 0.0, skew: float = 0.0, kurt: float = 3.0,
            alpha: float = 0.05) -> float:
    """Minimum Track Record Length (in periods) for PSR(sr_star) >= 1 - alpha."""
    if sr_hat <= sr_star:
        return np.inf
    z = stats.norm.ppf(1 - alpha)
    return float(1 + (1 - skew * sr_hat + (kurt - 1) / 4 * sr_hat ** 2)
                 * (z / (sr_hat - sr_star)) ** 2)


def min_btl_years(n_trials: int, max_insample_sr_annual: float = 1.0) -> float:
    """Minimum backtest length (years) so that the best of n_trials zero-skill
    configurations is *expected* to show an annualised in-sample SR below
    `max_insample_sr_annual` (annualised SR estimate has sd ~ 1/sqrt(years))."""
    e = expected_max_sr(n_trials, 1.0)
    return float((e / max_insample_sr_annual) ** 2)


# ----------------------------------------------------------------------------
# Probability of Backtest Overfitting (CSCV)
# ----------------------------------------------------------------------------
def pbo_cscv(M, n_splits: int = 10, metric=None):
    """Combinatorially-symmetric cross-validation.

    M: (T, N) matrix of per-period returns of N strategy variants.
    Splits rows into n_splits blocks; for each half/half combination picks the
    in-sample best variant and records its out-of-sample relative rank.
    PBO = fraction of combinations where the IS winner ranks below the OOS
    median (logit <= 0).  PBO ~ 0.5+ means selection adds nothing."""
    M = np.asarray(M, dtype=float)
    T, N = M.shape
    if metric is None:
        def metric(x):
            sd = x.std(axis=0, ddof=1)
            return np.divide(x.mean(axis=0), sd, out=np.zeros(x.shape[1]), where=sd > 0)
    blocks = np.array_split(np.arange(T), n_splits)
    logits = []
    for combo in itertools.combinations(range(n_splits), n_splits // 2):
        is_idx = np.concatenate([blocks[i] for i in combo])
        oos_idx = np.concatenate([blocks[i] for i in range(n_splits) if i not in combo])
        is_perf = metric(M[is_idx])
        oos_perf = metric(M[oos_idx])
        best = int(np.argmax(is_perf))
        rank = stats.rankdata(oos_perf)[best] / (N + 1)  # relative rank in (0,1)
        logits.append(np.log(rank / (1 - rank)))
    logits = np.array(logits)
    return dict(pbo=float(np.mean(logits <= 0)), logits=logits)


# ----------------------------------------------------------------------------
# Sequential monitoring
# ----------------------------------------------------------------------------
def cusum_downshift(x, mu_good: float, mu_bad: float, sigma: float, h: float):
    """Page's CUSUM on the Gaussian log-likelihood ratio for a *downward*
    shift of the per-trade mean from mu_good (edge intact) to mu_bad (edge gone).
    Returns (statistic path, index of first alarm or None).  Choose h by
    simulation so the false-alarm rate under mu_good is acceptable (see
    simulate.py: calibrate_cusum)."""
    x = np.asarray(x, dtype=float)
    k = (mu_bad - mu_good) / sigma ** 2
    mid = (mu_good + mu_bad) / 2
    s = 0.0
    path = []
    alarm = None
    for i, xi in enumerate(x):
        s = max(0.0, s + k * (xi - mid))
        path.append(s)
        if alarm is None and s >= h:
            alarm = i
    return np.array(path), alarm


def sprt_bernoulli(outcomes, p0: float, p1: float, alpha: float = 0.05, beta: float = 0.2):
    """Wald SPRT for H0: hit rate = p0 vs H1: hit rate = p1 (p1 > p0).
    Returns ('accept_H1' | 'accept_H0' | 'continue', n_used, llr_path)."""
    A = np.log((1 - beta) / alpha)
    B = np.log(beta / (1 - alpha))
    llr = 0.0
    path = []
    for i, o in enumerate(outcomes):
        llr += np.log(p1 / p0) if o else np.log((1 - p1) / (1 - p0))
        path.append(llr)
        if llr >= A:
            return "accept_H1", i + 1, np.array(path)
        if llr <= B:
            return "accept_H0", i + 1, np.array(path)
    return "continue", len(path), np.array(path)


DEFAULT_LAMBDAS = (0.02, 0.05, 0.1, 0.2, 0.35, 0.5)


def betting_eprocess(x, bound: float, lambdas=DEFAULT_LAMBDAS):
    """Mixture-of-bets e-process for H0: E[x_t | past] <= 0, where
    |x_t| <= bound.  Each bettor stakes lambda/bound of its wealth on 'x > 0';
    the average of test supermartingales is a test supermartingale, so by
    Ville's inequality P(sup_t E_t >= 1/alpha) <= alpha under H0 -- valid no
    matter how often we look.  Use one x per *month* (average of that month's
    per-trade or per-question differentials) so dependence inside a month does
    not break validity."""
    x = np.asarray(x, dtype=float) / bound
    if np.any(np.abs(x) > 1 + 1e-12):
        raise ValueError("|x| must be <= bound")
    lam = np.asarray(lambdas, dtype=float)[:, None]
    wealth = np.cumprod(1 + lam * x[None, :], axis=1)
    return wealth.mean(axis=0)


def first_crossing(path, threshold: float):
    idx = np.nonzero(np.asarray(path) >= threshold)[0]
    return int(idx[0]) if len(idx) else None
