"""Long-horizon predictability from valuation (CAPE) with Shiller's data.

Source: http://www.econ.yale.edu/~shiller/data/ie_data.xls (this legacy file ends 2023-09).
1) In-sample: 10-year forward annualized real total return vs log(CAPE).
2) Out-of-sample (Goyal-Welch / Campbell-Thompson style): expanding-window regression using
   only pairs whose 10y outcome was known at forecast time, vs the expanding historical mean.
3) A naive CAPE timing rule (stocks if CAPE < expanding median else 10y bonds) vs buy & hold.
Run:  python cape_predictability.py
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import statsmodels.api as sm

HERE = os.path.dirname(os.path.abspath(__file__))
raw = pd.read_excel(os.path.join(HERE, "data", "ie_data.xls"), sheet_name="Data", header=None, skiprows=8)
raw = raw.iloc[:, [0, 1, 4, 9, 12, 18]]
raw.columns = ["date", "P", "CPI", "real_tr", "cape", "real_bond_tr"]
raw = raw[pd.to_numeric(raw["date"], errors="coerce").notna()].copy()
raw["date"] = raw["date"].astype(float)
yr = raw["date"].astype(int)
mo = ((raw["date"] - yr) * 100).round().astype(int)
mo = mo.where(mo > 0, 10)  # Shiller writes Oct as .1
raw.index = pd.PeriodIndex([f"{y}-{m:02d}" for y, m in zip(yr, mo)], freq="M")
df = raw[["real_tr", "cape", "real_bond_tr"]].apply(pd.to_numeric, errors="coerce")
print(f"Shiller data {df.index[0]} .. {df.index[-1]}; last CAPE {df['cape'].dropna().iloc[-1]:.1f} ({df['cape'].dropna().index[-1]})\n")

H = 120
df["fwd10"] = (df["real_tr"].shift(-H) / df["real_tr"]) ** (1 / 10) - 1
df["logcape"] = np.log(df["cape"])
d = df.dropna(subset=["fwd10", "logcape"])

print("## 1) In-sample: 10y fwd annualized real total return on log(CAPE)\n")
print("| Sample (start dates) | N months | Slope | NW t (120 lags) | R^2 | Non-overlapping (Jan, every 10y) R^2 |")
print("|---|---:|---:|---:|---:|---:|")
for a, b in [("1881-01", "2013-09"), ("1881-01", "1949-12"), ("1950-01", "2013-09"), ("1990-01", "2013-09")]:
    x = d.loc[a:b]
    m = sm.OLS(x["fwd10"], sm.add_constant(x["logcape"])).fit(cov_type="HAC", cov_kwds={"maxlags": 120})
    nono = x[(x.index.month == 1) & ((x.index.year - x.index.year[0]) % 10 == 0)]
    m2 = sm.OLS(nono["fwd10"], sm.add_constant(nono["logcape"])).fit()
    print(f"| {a}..{b} | {len(x)} | {m.params['logcape']:.3f} | {m.tvalues['logcape']:.2f} | {m.rsquared:.2f} | {m2.rsquared:.2f} (n={len(nono)}) |")

# Bucket view
print("\n## CAPE buckets (start dates 1881-2013): subsequent 10y annualized real return\n")
print("| CAPE bucket | N months | Median | 10th pct | 90th pct | Min |")
print("|---|---:|---:|---:|---:|---:|")
bins = [0, 10, 15, 20, 25, 30, 100]
d2 = d.copy()
d2["bucket"] = pd.cut(d2["cape"], bins)
for bk, g in d2.groupby("bucket", observed=True):
    print(f"| {bk} | {len(g)} | {100 * g.fwd10.median():.1f}% | {100 * g.fwd10.quantile(0.1):.1f}% | {100 * g.fwd10.quantile(0.9):.1f}% | {100 * g.fwd10.min():.1f}% |")

# 2) OOS
print("\n## 2) Out-of-sample R^2 of 10y forecasts (expanding window, only outcomes known at t)\n")
fc_m, fc_h, act, dates = [], [], [], []
idx = d.index
for t in df.loc["1911-01":"2013-09"].index:
    known = d[d.index <= t - H]  # pairs whose 10y outcome was realized by t
    if len(known) < 240 or np.isnan(df.loc[t, "fwd10"]):
        continue
    m = sm.OLS(known["fwd10"], sm.add_constant(known["logcape"])).fit()
    fc_m.append(m.params["const"] + m.params["logcape"] * df.loc[t, "logcape"])
    fc_h.append(known["fwd10"].mean())
    act.append(df.loc[t, "fwd10"])
    dates.append(t)
o = pd.DataFrame({"model": fc_m, "histmean": fc_h, "act": act}, index=pd.PeriodIndex(dates, freq="M"))
print("| Forecast period | N | OOS R^2 vs expanding mean | Mean error model | Mean error hist. mean |")
print("|---|---:|---:|---:|---:|")
for a, b in [("1911-01", "2013-09"), ("1911-01", "1959-12"), ("1960-01", "1989-12"), ("1990-01", "2013-09")]:
    x = o.loc[a:b]
    r2 = 1 - ((x.act - x.model) ** 2).sum() / ((x.act - x.histmean) ** 2).sum()
    print(f"| {a}..{b} | {len(x)} | {r2:.2f} | {100 * (x.act - x.model).mean():.1f}pp | {100 * (x.act - x.histmean).mean():.1f}pp |")

# 3) naive timing rule
print("\n## 3) Naive CAPE switching: stocks if CAPE < expanding median CAPE (known at t-1) else 10y Treasuries (real TR)\n")
rs = df["real_tr"].pct_change()
rb = df["real_bond_tr"].pct_change()
med = df["cape"].expanding(120).median().shift(1)
sig = (df["cape"].shift(1) < med).astype(float)
strat = sig * rs + (1 - sig) * rb
print("| Period | Buy&hold stocks real CAGR | CAPE-switch real CAGR | 10y bonds real CAGR | % time in stocks | Switches/yr |")
print("|---|---:|---:|---:|---:|---:|")
for a, b in [("1891-01", "2023-08"), ("1891-01", "1959-12"), ("1960-01", "1989-12"), ("1990-01", "2023-08")]:
    s1, s2, s3, g = rs.loc[a:b].dropna(), strat.loc[a:b].dropna(), rb.loc[a:b].dropna(), sig.loc[a:b]
    c = lambda s: (1 + s).prod() ** (12 / len(s)) - 1
    print(f"| {a}..{b} | {100 * c(s1):.1f}% | {100 * c(s2):.1f}% | {100 * c(s3):.1f}% | {100 * g.mean():.0f}% | {g.diff().abs().sum() / (len(g) / 12):.2f} |")
