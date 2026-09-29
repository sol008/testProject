"""s00 - calibrate the leveraged-fund model to the real funds, and validate the proxies.

1. Financing spread: pick the spread over T-bills (on borrowed notional) that makes the simulated
   2x/3x S&P and Nasdaq-100 funds match the realised CAGR of SSO, UPRO, QLD and TQQQ since inception.
2. Synthetic 10-year bond vs IEF (2002-2026).
3. VIX proxy (pre-1986) = a + b x 20-day realised vol, fit on 1990-2026.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common as c


def sim_fixed(df: pd.DataFrame, L: float, spread: float, fee_total: float) -> pd.Series:
    r, rf = df.r, df.rf
    return L * r - (L - 1) * (rf + spread / c.TD) - fee_total / c.TD


def main():
    spx, ndx = c.spx_panel(), c.ndx_panel()
    rows = []
    for fund, und, L, fee_total in [("SSO", spx, 2, 0.0089), ("UPRO", spx, 3, 0.0091),
                                    ("QLD", ndx, 2, 0.0095), ("TQQQ", ndx, 3, 0.0084)]:
        a = c.yf_df(fund, start="2006-01-01")["Adj Close"].pct_change().dropna()
        idx = a.index.intersection(und.index)
        a = a.loc[idx]
        act = c.cagr_from(a)
        res = {}
        for sp in np.arange(0.0, 0.0151, 0.0005):
            s = sim_fixed(und.loc[idx], L, sp, fee_total)
            res[round(sp, 4)] = c.cagr_from(s)
        best = min(res, key=lambda k: abs(res[k] - act))
        s = sim_fixed(und.loc[idx], L, c.SPREAD, fee_total)
        rows.append(dict(fund=fund, L=L, start=idx[0].date(), actual_cagr=act,
                         sim_cagr_at_model_spread=c.cagr_from(s), gap=c.cagr_from(s) - act,
                         spread_that_matches=best, corr=np.corrcoef(s, a)[0, 1],
                         tracking_err=(s - a).std() * np.sqrt(c.TD)))
    cal = pd.DataFrame(rows)
    cal.to_csv(c.OUT / "s00_letf_calibration.csv", index=False, float_format="%.4f")
    print("LETF calibration (model spread = %.2f%%)" % (100 * c.SPREAD))
    print(cal.round(4).to_string(index=False))

    # bond proxy
    ief = c.yf_df("IEF", start="2002-07-01")["Adj Close"].pct_change().dropna()
    b = c.bond10_daily(spx.index).reindex(ief.index)
    bv = pd.DataFrame([dict(series="IEF actual", cagr=c.cagr_from(ief)),
                       dict(series="synthetic 10y (DGS10)", cagr=c.cagr_from(b.fillna(0)),
                            corr=np.corrcoef(b.fillna(0), ief)[0, 1])])
    bv.to_csv(c.OUT / "s00_bond_proxy.csv", index=False, float_format="%.4f")
    print("\nBond proxy check 2002-2026\n", bv.round(4).to_string(index=False))

    # VIX proxy
    x = spx.loc["1990":, ["rv20", "vix"]].dropna()
    slope, icpt = np.polyfit(x.rv20 * 100, x.vix, 1)
    corr = np.corrcoef(x.rv20, x.vix)[0, 1]
    print(f"\nVIX = {icpt:.2f} + {slope:.2f} x RV20(%)  (corr {corr:.2f}, 1990-2026)")
    pd.DataFrame([dict(intercept=icpt, slope=slope, corr=corr)]).to_csv(
        c.OUT / "s00_vix_proxy.csv", index=False, float_format="%.4f")


if __name__ == "__main__":
    main()
