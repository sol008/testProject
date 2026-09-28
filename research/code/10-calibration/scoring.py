"""Proper scoring rules and calibration diagnostics.

Binary forecasts:  p in [0, 1], outcome y in {0, 1}.
Quantile / distribution forecasts: pinball loss, CRPS, PIT, interval score.

References
----------
Brier (1950) Monthly Weather Review 78(1).
Murphy (1973) J. Applied Meteorology 12(4)  -- REL/RES/UNC partition.
Stephenson, Coelho & Jolliffe (2008) Weather & Forecasting 23(4) -- within-bin terms.
Good (1952) JRSS-B 14(1)  -- logarithmic score.
Gneiting & Raftery (2007) JASA 102(477) -- proper scoring rules, CRPS, interval score.
Dimitriadis, Gneiting & Jordan (2021) PNAS 118(8) -- CORP reliability / decomposition.
Cox (1958) Biometrika 45 -- calibration slope/intercept (logistic recalibration).
Diebold & Mariano (1995) JBES 13(3) -- comparing predictive accuracy.
Kelly (1956) Bell System Tech. J. 35(4) -- log score differential == Kelly log-growth.
"""
from __future__ import annotations

import numpy as np
from scipy import stats
from scipy.optimize import isotonic_regression

EPS = 0.01  # default probability clip for log scores (1%..99%)


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def _check(p, y):
    p = np.asarray(p, dtype=float)
    y = np.asarray(y, dtype=float)
    if p.shape != y.shape:
        raise ValueError("p and y must have the same shape")
    if np.any((p < 0) | (p > 1)) or np.any(~np.isfinite(p)):
        raise ValueError("probabilities must be finite and in [0, 1]")
    if not np.all((y == 0) | (y == 1)):
        raise ValueError("outcomes must be 0/1")
    return p, y


def clip_prob(p, eps: float = EPS):
    return np.clip(np.asarray(p, dtype=float), eps, 1.0 - eps)


def logit(p, eps: float = 1e-6):
    p = np.clip(np.asarray(p, dtype=float), eps, 1 - eps)
    return np.log(p / (1 - p))


def expit(x):
    x = np.clip(np.asarray(x, dtype=float), -500, 500)
    return 1.0 / (1.0 + np.exp(-x))


# ----------------------------------------------------------------------------
# binary scoring rules
# ----------------------------------------------------------------------------
def brier(p, y) -> float:
    """Mean Brier score (lower is better). 0 = perfect, 0.25 = always 50%."""
    p, y = _check(p, y)
    return float(np.mean((p - y) ** 2))


def brier_skill(p, y, p_ref) -> float:
    """Brier skill score vs a reference forecast (market-implied, base rate...).
    > 0 means better than the reference."""
    return 1.0 - brier(p, y) / brier(p_ref, y)


def log_score(p, y, eps: float = EPS) -> float:
    """Mean logarithmic score in nats (higher is better; 0 is perfect).
    Probabilities are clipped to [eps, 1-eps] so one bad miss is not -inf."""
    p, y = _check(p, y)
    p = clip_prob(p, eps)
    return float(np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def log_loss(p, y, eps: float = EPS) -> float:
    return -log_score(p, y, eps)


def log_score_diff(p, q, y, eps: float = EPS):
    """Per-question log-score differential ln p(y) - ln q(y) (nats).

    Interpretation (Kelly 1956): if q is the market price of a binary contract
    and you bet your beliefs p (Kelly), your log-wealth changes by exactly this
    amount per unit bankroll.  Mean > 0  <=>  your forecasts would have grown
    money against market odds.  This is the single best-aligned metric for a
    system whose objective is compounded % return."""
    p, y = _check(p, y)
    q = np.asarray(q, dtype=float)
    p = clip_prob(p, eps)
    q = clip_prob(q, eps)
    return np.where(y == 1, np.log(p / q), np.log((1 - p) / (1 - q)))


def brier_diff(p, q, y):
    """Per-question Brier improvement over reference q: (q-y)^2 - (p-y)^2.
    Bounded in [-1, 1]; positive = better than reference."""
    p, y = _check(p, y)
    q = np.asarray(q, dtype=float)
    return (q - y) ** 2 - (p - y) ** 2


# ----------------------------------------------------------------------------
# calibration / reliability
# ----------------------------------------------------------------------------
def _bin_index(p, bins):
    if np.isscalar(bins):
        edges = np.linspace(0.0, 1.0, int(bins) + 1)
    else:
        edges = np.asarray(bins, dtype=float)
    idx = np.clip(np.digitize(p, edges[1:-1], right=False), 0, len(edges) - 2)
    return idx, edges


def reliability_table(p, y, bins=10, level: float = 0.90):
    """Binned reliability table with Jeffreys intervals for the observed rate.

    Returns a list of dicts: bin_lo, bin_hi, n, mean_forecast, observed_rate,
    ci_lo, ci_hi, flag ("ok" | "over" | "under" | "n<10").
    'over'  = forecasts too high (observed below the interval);
    'under' = forecasts too low.
    Plain-English use: "when we said ~70% it happened 6/9 times (67%)"."""
    p, y = _check(p, y)
    idx, edges = _bin_index(p, bins)
    out = []
    a = (1 - level) / 2
    for k in range(len(edges) - 1):
        m = idx == k
        n = int(m.sum())
        if n == 0:
            continue
        hits = float(y[m].sum())
        mp = float(p[m].mean())
        rate = hits / n
        lo = stats.beta.ppf(a, hits + 0.5, n - hits + 0.5) if hits > 0 else 0.0
        hi = stats.beta.ppf(1 - a, hits + 0.5, n - hits + 0.5) if hits < n else 1.0
        if n < 10:
            flag = "n<10"
        elif mp > hi:
            flag = "over"
        elif mp < lo:
            flag = "under"
        else:
            flag = "ok"
        out.append(dict(bin_lo=float(edges[k]), bin_hi=float(edges[k + 1]), n=n,
                        hits=int(hits), mean_forecast=mp, observed_rate=rate,
                        ci_lo=float(lo), ci_hi=float(hi), flag=flag))
    return out


def murphy_decomposition(p, y, bins=10):
    """Binned Murphy (1973) decomposition with the Stephenson et al. (2008)
    within-bin terms, so that the identity is exact:

        BS = REL - RES + UNC + WBV - WBC

    REL = (1/N) sum_k n_k (pbar_k - obar_k)^2          reliability (lower better)
    RES = (1/N) sum_k n_k (obar_k - obar)^2            resolution  (higher better)
    UNC = obar (1 - obar)                              uncertainty (not controllable)
    WBV = (1/N) sum_k sum_i (p_i - pbar_k)^2           within-bin forecast variance
    WBC = (2/N) sum_k sum_i (o_i - obar_k)(p_i - pbar_k) within-bin covariance
    """
    p, y = _check(p, y)
    n = len(p)
    idx, edges = _bin_index(p, bins)
    obar = y.mean()
    rel = res = wbv = wbc = 0.0
    for k in range(len(edges) - 1):
        m = idx == k
        nk = m.sum()
        if nk == 0:
            continue
        pk, ok = p[m].mean(), y[m].mean()
        rel += nk * (pk - ok) ** 2
        res += nk * (ok - obar) ** 2
        wbv += np.sum((p[m] - pk) ** 2)
        wbc += 2 * np.sum((y[m] - ok) * (p[m] - pk))
    rel, res, wbv, wbc = rel / n, res / n, wbv / n, wbc / n
    unc = obar * (1 - obar)
    bs = brier(p, y)
    return dict(brier=bs, rel=rel, res=res, unc=unc, wbv=wbv, wbc=wbc,
                identity_error=bs - (rel - res + unc + wbv - wbc))


def pav_calibrate(p, y):
    """Isotonic (pool-adjacent-violators) recalibration of y on p, ties pooled.
    Returns calibrated probabilities aligned with the input order."""
    p, y = _check(p, y)
    uniq, inv, counts = np.unique(p, return_inverse=True, return_counts=True)
    sums = np.bincount(inv, weights=y)
    fit = isotonic_regression(sums / counts, weights=counts, increasing=True).x
    return fit[inv]


def corp_decomposition(p, y):
    """CORP decomposition (Dimitriadis, Gneiting & Jordan 2021), exact and bin-free:
        BS = MCB - DSC + UNC
    MCB (miscalibration) = BS(p) - BS(p_iso);   DSC (discrimination) = UNC - BS(p_iso)
    where p_iso is the PAV-isotonic recalibration of p."""
    p, y = _check(p, y)
    p_iso = pav_calibrate(p, y)
    bs = brier(p, y)
    bs_iso = brier(p_iso, y)
    obar = y.mean()
    unc = obar * (1 - obar)
    return dict(brier=bs, mcb=bs - bs_iso, dsc=unc - bs_iso, unc=unc)


def calibration_slope_intercept(p, y, eps: float = 1e-4, ridge: float = 1e-6,
                                max_iter: int = 100):
    """Logistic recalibration  logit P(y=1) = a + b * logit(p)   (Cox 1958).

    b < 1: forecasts too extreme (overconfident) -> shrink toward 50%.
    b > 1: forecasts too timid (underconfident) -> extremize (GJP finding
           for aggregated crowds; Baron et al. 2014).
    Returns dict(a, b, se_a, se_b, citl) where citl = mean(y) - mean(p)
    (calibration-in-the-large)."""
    p, y = _check(p, y)
    x = logit(p, eps)
    X = np.column_stack([np.ones_like(x), x])
    beta = np.array([0.0, 1.0])
    for _ in range(max_iter):
        mu = expit(X @ beta)
        w = mu * (1 - mu)
        H = X.T @ (X * w[:, None]) + ridge * np.eye(2)
        g = X.T @ (y - mu) - ridge * (beta - np.array([0.0, 1.0]))
        step = np.linalg.solve(H, g)
        beta = beta + step
        if np.max(np.abs(step)) < 1e-10:
            break
    mu = expit(X @ beta)
    H = X.T @ (X * (mu * (1 - mu))[:, None]) + ridge * np.eye(2)
    cov = np.linalg.inv(H)
    return dict(a=float(beta[0]), b=float(beta[1]), se_a=float(np.sqrt(cov[0, 0])),
                se_b=float(np.sqrt(cov[1, 1])), citl=float(y.mean() - p.mean()))


def ece(p, y, bins=10) -> float:
    """Expected calibration error (display only: biased upward in small samples
    and bin-dependent; prefer REL/MCB and the calibration slope)."""
    p, y = _check(p, y)
    idx, edges = _bin_index(p, bins)
    tot = 0.0
    for k in range(len(edges) - 1):
        m = idx == k
        if m.any():
            tot += m.sum() * abs(p[m].mean() - y[m].mean())
    return float(tot / len(p))


def sharpness(p, base_rate=None):
    """Sharpness = how far forecasts move away from the base rate.
    Superforecasters are sharp *and* calibrated (Gneiting et al. 2007:
    maximise sharpness subject to calibration)."""
    p = np.asarray(p, dtype=float)
    br = np.mean(p) if base_rate is None else base_rate
    return dict(var=float(np.var(p)), mean_abs_dev=float(np.mean(np.abs(p - br))))


# ----------------------------------------------------------------------------
# quantile / distribution forecasts
# ----------------------------------------------------------------------------
def pinball_loss(y, q, tau):
    """Quantile (pinball) loss rho_tau(y - q) = (tau - 1{y<q}) (y - q); lower better."""
    y = np.asarray(y, dtype=float)
    q = np.asarray(q, dtype=float)
    return np.mean((tau - (y < q)) * (y - q))


def crps_from_quantiles(y, quantiles, taus):
    """CRPS approximation from quantile forecasts:
        CRPS(F, y) = 2 * integral_0^1 rho_tau(y - F^-1(tau)) dtau
    approximated by the midpoint rule, so use evenly spaced midpoint levels
    tau_j = (j - 0.5)/J (e.g. 0.05, 0.15, ..., 0.95).  quantiles: shape (n, J)."""
    y = np.asarray(y, dtype=float)[:, None]
    Q = np.asarray(quantiles, dtype=float)
    t = np.asarray(taus, dtype=float)[None, :]
    rho = (t - (y < Q)) * (y - Q)
    return 2.0 * rho.mean(axis=1)


def crps_normal(y, mu, sigma):
    """Closed-form CRPS of N(mu, sigma^2) (Gneiting & Raftery 2007)."""
    z = (np.asarray(y, float) - mu) / sigma
    return sigma * (z * (2 * stats.norm.cdf(z) - 1) + 2 * stats.norm.pdf(z)
                    - 1 / np.sqrt(np.pi))


def pit_from_quantiles(y, quantiles, taus):
    """Probability integral transform by linear interpolation of the quantile
    forecast (flat extrapolation to 0/1 beyond the extreme quantiles)."""
    y = np.asarray(y, dtype=float)
    Q = np.asarray(quantiles, dtype=float)
    t = np.asarray(taus, dtype=float)
    return np.array([np.interp(yi, qi, t, left=0.0, right=1.0) for yi, qi in zip(y, Q)])


def pit_uniformity(u, n_bins: int = 5):
    """KS and chi-square tests of PIT uniformity.  With n < ~50 these have
    little power; read the histogram / coverage instead of the p-value."""
    u = np.asarray(u, dtype=float)
    ks = stats.kstest(u, "uniform")
    counts, _ = np.histogram(u, bins=np.linspace(0, 1, n_bins + 1))
    chi = stats.chisquare(counts)
    return dict(ks_stat=float(ks.statistic), ks_p=float(ks.pvalue),
                chi2_p=float(chi.pvalue), hist=counts.tolist())


def interval_coverage(y, lo, hi) -> float:
    y = np.asarray(y, float)
    return float(np.mean((y >= lo) & (y <= hi)))


def interval_score(y, lo, hi, alpha):
    """Interval score for a central (1-alpha) interval (Gneiting & Raftery 2007);
    lower better; penalises width and misses (2/alpha per unit of miss)."""
    y = np.asarray(y, float)
    return np.mean((hi - lo) + (2 / alpha) * (lo - y) * (y < lo)
                   + (2 / alpha) * (y - hi) * (y > hi))


# ----------------------------------------------------------------------------
# comparing two forecasters
# ----------------------------------------------------------------------------
def cluster_mean_test(d, clusters=None):
    """One-sided test that mean(d) > 0 with cluster-robust standard errors.

    d: per-question score differentials (e.g. log_score_diff vs market).
    clusters: labels (trade id, candidate id or month).  Questions about the
    same trade are strongly correlated; treating them as independent
    overstates evidence by the design effect 1 + (m - 1) * icc."""
    d = np.asarray(d, dtype=float)
    n = len(d)
    mean = d.mean()
    if clusters is None:
        se = d.std(ddof=1) / np.sqrt(n)
        g = n
    else:
        clusters = np.asarray(clusters)
        _, inv = np.unique(clusters, return_inverse=True)
        g = inv.max() + 1
        sums = np.bincount(inv, weights=d - mean)
        se = np.sqrt(g / (g - 1) * np.sum(sums ** 2)) / n
    t = mean / se if se > 0 else np.inf
    dof = max(g - 1, 1)
    return dict(mean=float(mean), se=float(se), t=float(t),
                p_one_sided=float(1 - stats.t.cdf(t, dof)), n=n, clusters=int(g))


def diebold_mariano(loss_a, loss_b, h: int = 1):
    """Diebold-Mariano test of equal predictive accuracy with Newey-West HAC
    variance (lag h-1).  Positive stat => forecaster A has *higher* loss."""
    d = np.asarray(loss_a, float) - np.asarray(loss_b, float)
    n = len(d)
    dbar = d.mean()
    dc = d - dbar
    gamma0 = np.dot(dc, dc) / n
    lrv = gamma0
    for lag in range(1, h):
        w = 1 - lag / h
        lrv += 2 * w * np.dot(dc[lag:], dc[:-lag]) / n
    stat = dbar / np.sqrt(lrv / n)
    return dict(stat=float(stat), p_two_sided=float(2 * (1 - stats.norm.cdf(abs(stat)))))


def icc_oneway(values, groups):
    """ANOVA estimator of the intra-class correlation of `values` within
    `groups` (used to compute the design effect of sub-questions)."""
    values = np.asarray(values, float)
    _, inv = np.unique(groups, return_inverse=True)
    k = inv.max() + 1
    n_i = np.bincount(inv)
    means = np.bincount(inv, weights=values) / n_i
    grand = values.mean()
    ssb = np.sum(n_i * (means - grand) ** 2)
    ssw = np.sum((values - means[inv]) ** 2)
    N = len(values)
    msb = ssb / (k - 1)
    msw = ssw / (N - k)
    n0 = (N - np.sum(n_i ** 2) / N) / (k - 1)
    return float((msb - msw) / (msb + (n0 - 1) * msw))
