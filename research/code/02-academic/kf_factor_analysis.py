"""Verify headline factor claims with the Ken French Data Library (data through 2026-08).

Outputs Markdown-ready tables to stdout and CSVs to ./results/.
Run:  python kf_factor_analysis.py
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import statsmodels.api as sm

from kf_utils import fmt_pct, max_drawdown, monthly_returns, stats

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(OUT, exist_ok=True)

ff3 = monthly_returns("F-F_Research_Data_Factors")
mom = monthly_returns("F-F_Momentum_Factor")
ff5 = monthly_returns("F-F_Research_Data_5_Factors_2x3")
st = monthly_returns("F-F_ST_Reversal_Factor")
lt = monthly_returns("F-F_LT_Reversal_Factor")

fac = pd.concat(
    [
        ff3[["Mkt-RF", "SMB", "HML", "RF"]],
        mom.rename(columns={mom.columns[0]: "UMD"}),
        ff5[["RMW", "CMA"]],
        st.rename(columns={st.columns[0]: "STREV"}),
        lt.rename(columns={lt.columns[0]: "LTREV"}),
    ],
    axis=1,
).sort_index()
fac.to_csv(os.path.join(OUT, "factors_monthly.csv"))
last = fac.index[-1]
print(f"Data through {last}\n")

# Publication dates (first month AFTER publication) used for pre/post splits.
PUB = {
    "SMB": ("Banz 1981", "1981-01"),
    "HML": ("Fama-French 1992 (B/M: Rosenberg et al. 1985)", "1992-07"),
    "UMD": ("Jegadeesh-Titman 1993", "1993-03"),
    "RMW": ("Novy-Marx 2013 / FF 2015", "2013-04"),
    "CMA": ("Titman-Wei-Xie 2004 / Cooper-Gulen-Schill 2008", "2004-12"),
    "STREV": ("Jegadeesh 1990 / Lehmann 1990", "1990-07"),
    "LTREV": ("De Bondt-Thaler 1985", "1985-07"),
}

PERIODS = [
    ("Full", None, None),
    ("1926-1962", None, "1962-12"),
    ("1963-1999", "1963-01", "1999-12"),
    ("2000-2026", "2000-01", None),
    ("2010-2026", "2010-01", None),
    ("2015-2026", "2015-01", None),
]


def sub(s: pd.Series, a, b) -> pd.Series:
    s = s.dropna()
    if a:
        s = s[s.index >= pd.Period(a, "M")]
    if b:
        s = s[s.index <= pd.Period(b, "M")]
    return s


rows = []
for f in ["Mkt-RF", "SMB", "HML", "UMD", "RMW", "CMA", "STREV", "LTREV"]:
    for pname, a, b in PERIODS:
        s = sub(fac[f], a, b)
        if len(s) < 24:
            continue
        d = stats(s)
        rows.append({"factor": f, "period": pname, **d})
    if f in PUB:
        label, p = PUB[f]
        pre = sub(fac[f], None, (pd.Period(p, "M") - 1).strftime("%Y-%m"))
        post = sub(fac[f], p, None)
        for pname, s in [(f"pre-pub ({label})", pre), ("post-pub", post)]:
            rows.append({"factor": f, "period": pname, **stats(s)})
tab = pd.DataFrame(rows)
tab.to_csv(os.path.join(OUT, "factor_period_stats.csv"), index=False)

print("## Factor statistics by period (long-short, gross of costs, monthly rebalanced)\n")
print("| Factor | Period | Months | Ann. mean | Ann. vol | Sharpe | t-stat | Max DD (compounded) | Worst month | Worst 12m |")
print("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
for _, r in tab.iterrows():
    print(
        f"| {r.factor} | {r.period} | {r.n} | {fmt_pct(r.ann_mean)} | {fmt_pct(r.ann_vol)} | {r.sharpe:.2f} | {r.t_stat:.2f} | "
        f"{fmt_pct(r.max_dd)} ({r.dd_peak}->{r.dd_trough}, rec. {r.dd_recovered}) | {fmt_pct(r.worst_period)} ({r.worst_period_date}) | {fmt_pct(r.worst_12m)} |"
    )

# ---------------------------------------------------------- CAPM alphas
print("\n## CAPM alphas of factors (annualized), full sample and post-2000\n")
print("| Factor | Period | Alpha (ann.) | t(alpha) | Beta |")
print("|---|---|---:|---:|---:|")
for f in ["SMB", "HML", "UMD", "RMW", "CMA", "STREV", "LTREV"]:
    for pname, a in [("Full", None), ("2000-2026", "2000-01"), ("2010-2026", "2010-01")]:
        d = fac[[f, "Mkt-RF"]].dropna()
        if a:
            d = d[d.index >= pd.Period(a, "M")]
        X = sm.add_constant(d["Mkt-RF"])
        m = sm.OLS(d[f], X).fit(cov_type="HAC", cov_kwds={"maxlags": 6})
        print(f"| {f} | {pname} | {fmt_pct(m.params['const'] * 12)} | {m.tvalues['const']:.2f} | {m.params['Mkt-RF']:.2f} |")

# ---------------------------------------------------------- momentum crashes
print("\n## UMD: 10 worst months\n")
w = fac["UMD"].dropna().nsmallest(10)
mk = fac["Mkt-RF"]
print("| Month | UMD | Mkt-RF same month |")
print("|---|---:|---:|")
for d, v in w.items():
    print(f"| {d} | {fmt_pct(v)} | {fmt_pct(mk.loc[d])} |")

# Daniel-Moskowitz style conditioning: bear state = cumulative past-24m market return < 0
mkt_tot = fac["Mkt-RF"] + fac["RF"]
past24 = (1 + mkt_tot).rolling(24).apply(np.prod, raw=True).shift(1) - 1
state = pd.DataFrame({"UMD": fac["UMD"], "bear": past24 < 0, "up": fac["Mkt-RF"] > 0}).dropna()
print("\n## UMD conditional on market state (Daniel-Moskowitz 2016 style; bear = past 24m market return < 0)\n")
print("| State | Months | UMD mean/month | UMD ann. mean | UMD Sharpe |")
print("|---|---:|---:|---:|---:|")
for lbl, msk in [
    ("Bull (past 24m > 0)", ~state.bear),
    ("Bear (past 24m < 0)", state.bear),
    ("Bear & market up this month", state.bear & state.up),
    ("Bear & market down this month", state.bear & ~state.up),
]:
    s = state.loc[msk, "UMD"]
    print(f"| {lbl} | {len(s)} | {fmt_pct(s.mean(), 2)} | {fmt_pct(s.mean() * 12)} | {s.mean() / s.std() * np.sqrt(12):.2f} |")

# ---------------------------------------------------------- value drawdown
print("\n## HML drawdown anatomy\n")
h = fac["HML"].dropna()
wealth = (1 + h).cumprod()
dd = wealth / wealth.cummax() - 1
mdd, pk, tr, rec = max_drawdown(h)
print(f"HML max drawdown {fmt_pct(mdd)} from {pk} to {tr}; recovered: {rec}")
print(f"HML drawdown at {last}: {fmt_pct(dd.iloc[-1])} (peak {wealth.loc[:last].idxmax()})")
for a, b in [("2007-01", "2020-12"), ("2021-01", "2022-12"), ("2023-01", None)]:
    s = sub(h, a, b)
    print(f"HML cumulative {a}..{b or last}: {fmt_pct((1 + s).prod() - 1)}  (ann. mean {fmt_pct(s.mean() * 12)})")

# ---------------------------------------------------------- rolling 10-year windows
print("\n## Share of rolling 10-year (120m) windows with negative average factor return\n")
print("| Factor | Windows | % negative | Worst 10y ann. mean | Best 10y ann. mean |")
print("|---|---:|---:|---:|---:|")
for f in ["Mkt-RF", "SMB", "HML", "UMD", "RMW", "CMA", "STREV", "LTREV"]:
    r10 = fac[f].dropna().rolling(120).mean().dropna() * 12
    print(f"| {f} | {len(r10)} | {fmt_pct((r10 < 0).mean())} | {fmt_pct(r10.min())} | {fmt_pct(r10.max())} |")

# ---------------------------------------------------------- value + momentum combo
print("\n## 50/50 HML + UMD combination\n")
c = fac[["HML", "UMD"]].dropna()
print(f"corr(HML, UMD) full = {c.corr().iloc[0, 1]:.2f}; post-2000 = {c[c.index >= pd.Period('2000-01', 'M')].corr().iloc[0, 1]:.2f}")
combo = c.mean(axis=1)
for pname, a, b in PERIODS:
    s = sub(combo, a, b)
    if len(s) < 24:
        continue
    d = stats(s)
    print(f"{pname}: ann mean {fmt_pct(d['ann_mean'])}, vol {fmt_pct(d['ann_vol'])}, Sharpe {d['sharpe']:.2f}, maxDD {fmt_pct(d['max_dd'])}")

# ---------------------------------------------------------- calendar-year table for recent years
print("\n## Calendar-year factor returns, 2015-2026YTD (compounded monthly, %; 2026 = Jan-Aug)\n")
yr = fac[["Mkt-RF", "SMB", "HML", "UMD", "RMW", "CMA", "STREV"]].copy()
yr = yr[yr.index >= pd.Period("2015-01", "M")]
ann = (1 + yr).groupby(yr.index.year).prod() - 1
print("| Year | " + " | ".join(ann.columns) + " |")
print("|---|" + "---:|" * len(ann.columns))
for y, row in ann.iterrows():
    print(f"| {y} | " + " | ".join(f"{100 * v:.1f}" for v in row.values) + " |")
