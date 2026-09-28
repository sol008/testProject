"""Base rates for the user's objective ("e.g. +1000%"): how often did simple, documented
strategies turn $1 into >= $11 over rolling 5/10/20-year windows (US data 1927-2026)?

Strategies (gross of taxes; trading costs as noted):
 - US total market (VW CRSP, Ken French)
 - Top-decile momentum winners, value-weighted (Ken French 10 prior-return portfolios; gross of the
   high turnover costs this portfolio would incur -> an upper bound)
 - Small-value corner (Ken French 6 size x B/M portfolios, 'SMALL HiBM', VW; gross)
 - 2x and 3x daily-rebalanced market (financing RF+0.5%, 0.9% fee), with and without 10m-SMA filter
Run:  python base_rates.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from kf_utils import daily_returns, monthly_returns

ff3 = monthly_returns("F-F_Research_Data_Factors")
rf = ff3["RF"]
mkt = ff3["Mkt-RF"] + rf
mom10 = monthly_returns("10_Portfolios_Prior_12_2", "Value Weight Returns -- Monthly")
six = monthly_returns("6_Portfolios_2x3", "Value Weight")
d3 = daily_returns("F-F_Research_Data_Factors_daily")
dm = d3["Mkt-RF"] + d3["RF"]
drf = d3["RF"]
dpy = pd.Series(dm.index.year, index=dm.index).map(pd.Series(dm.index.year).value_counts())
idx = (1 + mkt).cumprod()
sig_m = (idx > idx.rolling(10).mean()).astype(float).shift(1)
sig_d = pd.Series(dm.index.to_period("M").map(sig_m).values, index=dm.index).astype(float)
sw_d = sig_d.diff().abs().fillna(0)


def lev_monthly(L: int, filt: bool) -> pd.Series:
    r = L * dm - (L - 1) * (drf + 0.005 / dpy) - (0.009 / dpy if L > 1 else 0.0)
    r = r.clip(lower=-1)
    if filt:
        r = sig_d * r + (1 - sig_d) * drf - sw_d * 0.001
    return (1 + r).groupby(r.index.to_period("M")).prod() - 1


strats = {
    "US market 1x": mkt,
    "Top-decile momentum (VW, gross)": mom10["Hi PRIOR"],
    "Small value (VW, gross)": six["SMALL HiBM"],
    "2x market, buy&hold": lev_monthly(2, False),
    "2x market + 10m SMA": lev_monthly(2, True),
    "3x market, buy&hold": lev_monthly(3, False),
    "3x market + 10m SMA": lev_monthly(3, True),
}

print("CAGR needed for +1000% (11x): 5y = {:.1f}%, 10y = {:.1f}%, 20y = {:.1f}%\n".format(
    100 * (11 ** (1 / 5) - 1), 100 * (11 ** (1 / 10) - 1), 100 * (11 ** (1 / 20) - 1)))
print("| Strategy | Horizon | Windows | Median multiple | 10th pct | 90th pct | P(>= 11x, i.e. +1000%) | P(< 1x, i.e. loss) |")
print("|---|---|---:|---:|---:|---:|---:|---:|")
for name, r in strats.items():
    r = r.dropna()
    r = r[r.index >= pd.Period("1927-01", "M")]
    logw = np.log1p(r).cumsum()
    for yrs in [5, 10, 20]:
        n = 12 * yrs
        mult = np.exp(logw.shift(-n) - logw).dropna()
        print(f"| {name} | {yrs}y | {len(mult)} | {mult.median():.2f}x | {mult.quantile(0.1):.2f}x | {mult.quantile(0.9):.2f}x | "
              f"{100 * (mult >= 11).mean():.1f}% | {100 * (mult < 1).mean():.1f}% |")
