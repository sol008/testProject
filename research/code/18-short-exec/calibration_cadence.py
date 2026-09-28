"""What can a monthly loop learn at 20-100 resolved short-horizon trades a year?  (track 18, §6)

For each question the loop might ask, the minimum detectable effect (MDE, 80% power, one-sided 5%)
after 1, 3, 6 and 12 months, given the evidence volume:
  * N live/paper trades a year (20 / 50 / 100), 3 pre-registered sub-forecasts each
    (design effect 1 + (3-1) x 0.4 = 1.8, track 10 ICC 0.37-0.41);
  * a deterministic shadow book of S rule triggers a year per rule family (250 / 1,000);
  * 2 fills per trade (entry, exit) for slippage.
Also: calibration-slope power (simulated logistic fits) and CUSUM delay to notice a dead edge.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from util18 import SEED, save_table

ZA, ZB = stats.norm.ppf(0.95), stats.norm.ppf(0.80)
DEFF = 1.8


def mde_proportion(n, p0=0.5):
    """Smallest shift in a hit rate / calibration-in-the-large detectable with n effective obs."""
    if n <= 0:
        return np.nan
    return (ZA + ZB) * np.sqrt(p0 * (1 - p0) / n)


def mde_mean(n, sd):
    return (ZA + ZB) * sd / np.sqrt(n) if n > 0 else np.nan


def mde_table():
    rows = []
    for N in (20, 50, 100):
        for months in (1, 3, 6, 12, 24):
            f = months / 12
            n_tr = N * f
            rows.append({
                "Trades/yr": N, "Months of data": months, "Resolved trades": n_tr,
                "Edge: MDE per-trade Sharpe (P&L t-test)": mde_mean(n_tr, 1.0),
                "LLM calibration-in-the-large MDE (pp)": 100 * mde_proportion(3 * n_tr / DEFF),
                "Shadow family hit-rate drift MDE, S=250/yr (pp)": 100 * mde_proportion(250 * f),
                "Shadow family hit-rate drift MDE, S=1000/yr (pp)": 100 * mde_proportion(1000 * f),
                "Slippage bias MDE, liquid ETF fills, sd 10bp (bp)": mde_mean(2 * n_tr, 10.0),
                "Slippage bias MDE, option fills, sd 25% of half-spread (% of half-spread)": mde_mean(2 * n_tr, 25.0),
                "Skip-rate MDE vs 0% (pp)": 100 * (1 - 0.05 ** (1 / max(n_tr, 1))),
            })
    return pd.DataFrame(rows)


def _logit_fit(x, y, iters=25):
    """Vectorised 2-parameter logistic regression y ~ a + b x for many samples (rows)."""
    a = np.zeros(x.shape[0]); b = np.ones(x.shape[0])
    for _ in range(iters):
        eta = a[:, None] + b[:, None] * x
        p = 1 / (1 + np.exp(-np.clip(eta, -30, 30)))
        w = p * (1 - p) + 1e-9
        r = y - p
        g0 = r.sum(1); g1 = (r * x).sum(1)
        h00 = w.sum(1); h01 = (w * x).sum(1); h11 = (w * x * x).sum(1)
        det = h00 * h11 - h01 ** 2
        a = a + (h11 * g0 - h01 * g1) / det
        b = b + (-h01 * g0 + h00 * g1) / det
    eta = a[:, None] + b[:, None] * x
    p = 1 / (1 + np.exp(-np.clip(eta, -30, 30))); w = p * (1 - p) + 1e-12
    h00 = w.sum(1); h01 = (w * x).sum(1); h11 = (w * x * x).sum(1)
    var_b = h00 / (h00 * h11 - h01 ** 2)
    return a, b, np.sqrt(var_b)


def slope_power(n_sims=4000, seed=SEED + 51):
    """Power to detect over-confidence (true calibration slope 0.6 or 0.8) with n forecasts
    (one-sided test of slope < 1, Wald, effective n = n / DEFF)."""
    rng = np.random.default_rng(seed)
    rows = []
    for b_true in (0.6, 0.8, 1.0):
        for n in (50, 100, 150, 300, 600, 1200):
            n_eff = int(n / DEFF)
            true_logit = rng.normal(0, 0.8, (n_sims, n_eff))
            stated = true_logit / b_true              # overconfident: stated logits stretched
            y = (rng.random((n_sims, n_eff)) < 1 / (1 + np.exp(-true_logit))).astype(float)
            a, b, se = _logit_fit(stated, y)
            z = (b - 1) / se
            rows.append({"True slope": b_true, "Forecasts": n, "Effective n": n_eff,
                         "P(detect slope < 1)": float(np.mean(z < -ZA)),
                         "Median fitted slope": float(np.median(b))})
    return pd.DataFrame(rows)


def cusum_delay(n_sims=4000, seed=SEED + 52):
    """Trades until a CUSUM notices that a per-trade edge s has fallen to zero (R-multiples, sd 1.3),
    threshold set for <= 10% false alarms in 3 years while the edge is intact."""
    rng = np.random.default_rng(seed)
    sd = 1.3
    rows = []
    for s in (0.1, 0.2, 0.3):
        mu_g, mu_b = s * sd, 0.0
        k = (mu_g + mu_b) / 2
        for N in (25, 50, 100):
            n3 = 3 * N
            x = rng.normal(mu_g, sd, (n_sims, n3))
            # downward CUSUM on (k - x)
            def run(xs):
                S = np.zeros(xs.shape[0]); mx = np.zeros(xs.shape[0])
                path = np.zeros(xs.shape)
                for j in range(xs.shape[1]):
                    S = np.maximum(0, S + (k - xs[:, j]) / sd)
                    path[:, j] = S
                return path
            pg = run(x).max(1)
            h = float(np.quantile(pg, 0.90))
            xb = rng.normal(mu_b, sd, (n_sims, 20 * N))
            pb = run(xb)
            hit = pb >= h
            first = np.where(hit.any(1), hit.argmax(1) + 1, np.nan)
            rows.append({"Edge before decay (s)": s, "Trades/yr": N, "Threshold h": h,
                         "Median trades to alarm": float(np.nanmedian(first)),
                         "Median months to alarm": float(np.nanmedian(first) / N * 12),
                         "P(alarm within 12 months)": float(np.mean(first <= N))})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    pd.set_option("display.width", 260); pd.set_option("display.max_columns", 30)
    t = mde_table(); save_table(t, "cadence_mde"); print(t.round(3).to_string())
    sp = slope_power(); save_table(sp, "cadence_slope_power"); print(sp.round(3).to_string())
    cd = cusum_delay(); save_table(cd, "cadence_cusum"); print(cd.round(2).to_string())
