"""g8: P(peak-to-trough drawdown >= X within 10 years) for c x Kelly, by strategy Sharpe.

GBM log-wealth: drift theta^2 (c - c^2/2), vol c*theta (r = 0). Daily steps, fixed seed.
Also P(double before halving) from the scale function: kappa = 2/c - 1.
"""
import numpy as np
import pandas as pd

from common import SEED, fmt_pct, save_table

rng = np.random.default_rng(SEED + 21)
YEARS, SPY, N = 10, 252, 10_000
z = rng.standard_normal((N, YEARS * SPY)).astype(np.float32)
rows = []
for theta in (0.3, 0.5, 0.8):
    for c in (0.25, 0.3, 0.35, 0.4, 0.5, 0.75, 1.0):
        nu, s, dt = theta ** 2 * (c - c * c / 2), c * theta, 1 / SPY
        lw = np.cumsum(nu * dt + s * np.sqrt(dt) * z, axis=1, dtype=np.float64)
        peak = np.maximum.accumulate(np.maximum(lw, 0), axis=1)
        mdd = 1 - np.exp((lw - peak).min(axis=1))
        kappa = 2 / c - 1
        p_double_first = (1 - 2 ** kappa) / (2 ** -kappa - 2 ** kappa)
        rows.append({"Annual Sharpe": theta, "Kelly multiple c": c,
                     "Growth/yr": f"{100 * nu:.1f}%", "Vol of log wealth/yr": f"{100 * s:.0f}%",
                     "P(DD>=30%) in 10y": fmt_pct(float(np.mean(mdd >= 0.3))),
                     "P(DD>=50%) in 10y": fmt_pct(float(np.mean(mdd >= 0.5))),
                     "Median max DD": fmt_pct(float(np.median(mdd))),
                     "P(double before halving)": fmt_pct(p_double_first)})
df = pd.DataFrame(rows)
save_table(df, "g8_drawdown_by_kelly_multiple_and_sharpe")
if __name__ == "__main__":
    pd.set_option("display.width", 250)
    print(df.to_string())
