"""How many trades a year should "few trades" mean?  (track 18, section 2.6)

A candidate pipeline produces C screened candidates a year.  Each has a TRUE net per-trade Sharpe
s_i ~ N(mu0, tau^2).  The system sees a noisy, optimistic estimate  s_hat = s + bias + e,
e ~ N(0, sigma_e^2), shrinks it (s_used = kappa * s_hat, kappa = 0.5 as in 00-SYNTHESIS §3.4),
sizes at quarter-Kelly capped by the per-trade stress cap, and sends the trade only if its expected
growth contribution computed with s_used clears a per-trade hurdle h.

Outputs: trades a year, the true edge of what is selected (winner's curse), expected log growth a
year from the selected trades, and the years needed to detect their edge from P&L (80% power,
one-sided 5%).  Growth is per trade r*s*sd - r^2*E[X^2]/2, summed (independent trades; concurrency
caps are handled in sim_portfolio.py).  Fully analytic in expectation + Monte Carlo over candidates.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from util18 import SEED, save_table

SD_R = 1.30            # s.d. of one trade's R-multiple (trade_model: 1.0-1.6 by holding period)
CAP_R = 0.02 / 2.4     # stress cap 2% at the P99 gap multiple 2.4 -> 0.83% risk per trade
Z = stats.norm.ppf(0.95) + stats.norm.ppf(0.80)

PIPELINES = {
    # name: (candidates/yr, mu0, tau, sigma_e, bias)
    "A. Honest-average pipeline, strong skill (corr 0.71)": (250, 0.00, 0.05, 0.05, 0.05),
    "B. Honest-average pipeline, moderate skill (corr 0.45)": (250, 0.00, 0.05, 0.10, 0.05),
    "C. Honest-average pipeline, weak skill (corr 0.24)": (250, 0.00, 0.05, 0.20, 0.05),
    "D. Good pipeline (mean +0.03), moderate skill": (250, 0.03, 0.05, 0.10, 0.05),
    "E. Rich pipeline (1,000 cands), moderate skill": (1000, 0.00, 0.05, 0.10, 0.05),
    "F. Proven-edge pipeline (mean +0.05), moderate skill": (250, 0.05, 0.05, 0.10, 0.05),
}


def risk_for(s_used):
    m = s_used * SD_R
    r = 0.25 * m / (SD_R ** 2 + m ** 2)
    return np.clip(r, 0.0, CAP_R)


def dg(s, r):
    m = s * SD_R
    return r * m - 0.5 * r ** 2 * (SD_R ** 2 + m ** 2)


def run(n_years=200, kappa=0.5, hurdles=tuple(np.round(np.arange(0.0, 0.00255, 0.00005), 6)),
        n_max=None, seed=SEED + 21):
    rows = []
    for name, (C, mu0, tau, se, bias) in PIPELINES.items():
        rng = np.random.default_rng(seed)
        s_true = rng.normal(mu0, tau, (n_years, C))
        s_hat = s_true + bias + rng.normal(0, se, (n_years, C))
        s_used = kappa * s_hat
        r = risk_for(s_used)
        g_used = dg(s_used, r)
        g_true = dg(s_true, r)
        # ideal Bayes posterior mean (if the prior and noise were known exactly)
        w = tau ** 2 / (tau ** 2 + se ** 2)
        s_post = mu0 + w * (s_hat - bias - mu0)
        for h in hurdles:
            sel = (g_used >= h) & (r > 0)
            if n_max is not None:
                # keep the n_max best per year by s_used
                order = np.argsort(-np.where(sel, s_used, -np.inf), axis=1)
                keep = np.zeros_like(sel)
                np.put_along_axis(keep, order[:, :n_max], True, axis=1)
                sel &= keep
            n_sel = sel.sum(1)
            G = np.where(sel, g_true, 0).sum(1)
            s_sel = np.where(sel, s_true, 0).sum() / max(sel.sum(), 1)
            s_claim = np.where(sel, s_hat, 0).sum() / max(sel.sum(), 1)
            s_post_sel = np.where(sel, s_post, 0).sum() / max(sel.sum(), 1)
            nbar = n_sel.mean()
            yrs = (Z / s_sel) ** 2 / nbar if s_sel > 0 and nbar > 0 else np.inf
            rows.append({"Pipeline": name, "Hurdle per trade (bp of log growth)": 1e4 * h,
                         "Trades/yr": nbar, "Claimed s of selected": s_claim,
                         "Ideal posterior s": s_post_sel, "True s of selected": s_sel,
                         "E[log growth]/yr from trades": G.mean(),
                         "P(year negative)": float(np.mean(G < 0)),
                         "Years to detect (80% power)": yrs})
    return pd.DataFrame(rows)


def frontier_summary(df):
    out = []
    for name, g in df.groupby("Pipeline", sort=False):
        gmax = g["E[log growth]/yr from trades"].max()
        best = g.loc[g["E[log growth]/yr from trades"].idxmax()]
        knee = g[g["E[log growth]/yr from trades"] >= 0.8 * gmax].sort_values("Trades/yr").iloc[0]
        out.append({"Pipeline": name, "Max growth/yr": gmax, "Trades/yr at max": best["Trades/yr"],
                    "Hurdle at max (bp)": best["Hurdle per trade (bp of log growth)"],
                    "Fewest trades for 80% of max": knee["Trades/yr"],
                    "Hurdle there (bp)": knee["Hurdle per trade (bp of log growth)"],
                    "True s there": knee["True s of selected"],
                    "Years to detect there": knee["Years to detect (80% power)"]})
    return pd.DataFrame(out)


def at_fixed_n(df, ns=(12, 25, 50, 100)):
    """Read the frontier at fixed trade counts (linear interpolation along the hurdle grid)."""
    out = []
    for name, g in df.groupby("Pipeline", sort=False):
        g = g.sort_values("Trades/yr")
        row = {"Pipeline": name, "Max growth/yr": g["E[log growth]/yr from trades"].max(),
               "Trades/yr at max": g.loc[g["E[log growth]/yr from trades"].idxmax(), "Trades/yr"]}
        for n in ns:
            x = g["Trades/yr"].values
            if n > x.max():
                row[f"growth @{n}"] = np.nan; row[f"true s @{n}"] = np.nan; row[f"hurdle bp @{n}"] = np.nan
                continue
            row[f"growth @{n}"] = float(np.interp(n, x, g["E[log growth]/yr from trades"].values))
            row[f"true s @{n}"] = float(np.interp(n, x, g["True s of selected"].values))
            row[f"claimed s @{n}"] = float(np.interp(n, x, g["Claimed s of selected"].values))
            row[f"hurdle bp @{n}"] = float(np.interp(n, x, g["Hurdle per trade (bp of log growth)"].values))
        out.append(row)
    return pd.DataFrame(out)


if __name__ == "__main__":
    pd.set_option("display.width", 250); pd.set_option("display.max_columns", 40)
    df = run()
    save_table(df, "selection_frontier")
    fs = frontier_summary(df)
    save_table(fs, "selection_knee")
    fx = at_fixed_n(df)
    save_table(fx, "selection_at_fixed_n")
    print(fs.round(4).to_string()); print(fx.round(4).to_string())
