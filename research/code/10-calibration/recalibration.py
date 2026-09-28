"""Recalibration maps for the system's raw probabilities.

Platt / logistic recalibration (Platt 1999; Cox 1958):
    logit p_cal = a + b * logit p_raw
Here fitted with a Gaussian penalty that shrinks (a, b) toward the identity
map (0, 1), so with little data the map stays close to "do nothing".
b < 1 shrinks overconfident forecasts; b > 1 extremizes timid ones -- the
same mechanism as GJP extremizing (Baron et al. 2014; Satopaa et al. 2014).

Isotonic regression (Zadrozny & Elkan 2002): non-parametric, monotone; needs
far more data -- Niculescu-Mizil & Caruana (2005) find it overfits small
calibration sets and only reliably matches/beats Platt at >= ~1000 points.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import isotonic_regression

from scoring import expit, logit


@dataclass(frozen=True)
class PlattMap:
    a: float = 0.0
    b: float = 1.0
    n_fit: int = 0

    def apply(self, p, eps: float = 1e-4):
        return expit(self.a + self.b * logit(p, eps))


def fit_platt(p, y, prior_sd_a: float = 0.5, prior_sd_b: float = 0.5,
              eps: float = 1e-4, max_iter: int = 100) -> PlattMap:
    """MAP logistic recalibration with N(0, prior_sd_a^2) on a and
    N(1, prior_sd_b^2) on b (shrink toward identity)."""
    p = np.asarray(p, dtype=float)
    y = np.asarray(y, dtype=float)
    x = logit(p, eps)
    X = np.column_stack([np.ones_like(x), x])
    prior_mean = np.array([0.0, 1.0])
    P = np.diag([1 / prior_sd_a ** 2, 1 / prior_sd_b ** 2])
    beta = prior_mean.copy()
    for _ in range(max_iter):
        mu = expit(X @ beta)
        w = mu * (1 - mu)
        H = X.T @ (X * w[:, None]) + P
        g = X.T @ (y - mu) - P @ (beta - prior_mean)
        step = np.linalg.solve(H, g)
        beta = beta + step
        if np.max(np.abs(step)) < 1e-10:
            break
    return PlattMap(float(beta[0]), float(beta[1]), len(p))


@dataclass(frozen=True)
class IsotonicMap:
    x: np.ndarray  # sorted unique raw probabilities
    fx: np.ndarray  # calibrated values
    eps: float = 0.01

    def apply(self, p):
        out = np.interp(np.asarray(p, dtype=float), self.x, self.fx)
        return np.clip(out, self.eps, 1 - self.eps)


def fit_isotonic(p, y, eps: float = 0.01) -> IsotonicMap:
    p = np.asarray(p, dtype=float)
    y = np.asarray(y, dtype=float)
    uniq, inv, counts = np.unique(p, return_inverse=True, return_counts=True)
    sums = np.bincount(inv, weights=y)
    fx = isotonic_regression(sums / counts, weights=counts, increasing=True).x
    return IsotonicMap(uniq, fx, eps)


def choose_map(n_resolved: int, min_platt: int = 150, min_isotonic: int = 1000) -> str:
    """Policy used by the monthly loop (thresholds are defaults; see report)."""
    if n_resolved < min_platt:
        return "identity"
    if n_resolved < min_isotonic:
        return "platt"
    return "isotonic_if_oos_better"
