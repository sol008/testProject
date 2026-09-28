"""Long-only implementability checks with Ken French portfolios (data through 2026-08).

1) Momentum deciles (prior 12-2 month return): is the long-only top decile a better
   holding than the market? (what a retail investor could approximate with an ETF)
2) Beta-sorted portfolios: low-beta anomaly and a BAB-like levered spread.

Run:  python kf_portfolio_analysis.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm

from kf_utils import fmt_pct, monthly_returns, read_sections, stats

ff3 = monthly_returns("F-F_Research_Data_Factors")
mkt = (ff3["Mkt-RF"] + ff3["RF"]).rename("MKT")
rf = ff3["RF"]

PERIODS = [
    ("1927-2026", "1927-01", None),
    ("1927-1962", "1927-01", "1962-12"),
    ("1963-1999", "1963-01", "1999-12"),
    ("2000-2026", "2000-01", None),
    ("2010-2026", "2010-01", None),
]


def sub(s, a, b):
    s = s.dropna()
    if a:
        s = s[s.index >= pd.Period(a, "M")]
    if b:
        s = s[s.index <= pd.Period(b, "M")]
    return s


def capm(r_ex: pd.Series, m_ex: pd.Series):
    d = pd.concat([r_ex, m_ex], axis=1).dropna()
    X = sm.add_constant(d.iloc[:, 1])
    res = sm.OLS(d.iloc[:, 0], X).fit(cov_type="HAC", cov_kwds={"maxlags": 6})
    return res.params.iloc[0] * 12, res.tvalues.iloc[0], res.params.iloc[1]


# ------------------------------------------------------------------ momentum deciles
mom10_vw = monthly_returns("10_Portfolios_Prior_12_2", "Value Weight Returns -- Monthly")
mom10_ew = monthly_returns("10_Portfolios_Prior_12_2", "Equal Weighted Returns -- Monthly")

print("## Long-only momentum: top decile (prior 12-2m winners) vs total market, gross of costs\n")
print("| Portfolio | Period | CAGR | Ann. vol | Sharpe (excess) | Max DD | CAPM alpha (ann., t) | Beta | Worst month |")
print("|---|---|---:|---:|---:|---:|---:|---:|---:|")
for pname, a, b in PERIODS:
    for lbl, s in [
        ("Market (VW, all CRSP)", mkt),
        ("Top-decile winners VW", mom10_vw["Hi PRIOR"]),
        ("Bottom-decile losers VW", mom10_vw["Lo PRIOR"]),
        ("Top-decile winners EW", mom10_ew["Hi PRIOR"]),
    ]:
        x = sub(s, a, b)
        d = stats(x)
        ex = x - rf.reindex(x.index)
        sh = ex.mean() / ex.std() * np.sqrt(12)
        al, t, be = capm(ex, ff3["Mkt-RF"].reindex(x.index)) if "Market" not in lbl else (0.0, np.nan, 1.0)
        print(
            f"| {lbl} | {pname} | {fmt_pct(d['cagr'])} | {fmt_pct(d['ann_vol'])} | {sh:.2f} | {fmt_pct(d['max_dd'])} ({d['dd_peak']}->{d['dd_trough']}) | "
            f"{fmt_pct(al)} ({t:.2f}) | {be:.2f} | {fmt_pct(d['worst_period'])} ({d['worst_period_date']}) |"
        )

# Winner minus loser decile spread by period
print("\n## Decile spread (Hi PRIOR - Lo PRIOR, VW), gross\n")
print("| Period | Ann. mean | Ann. vol | Sharpe | Max DD | Worst month |")
print("|---|---:|---:|---:|---:|---:|")
wml = mom10_vw["Hi PRIOR"] - mom10_vw["Lo PRIOR"]
for pname, a, b in PERIODS:
    d = stats(sub(wml, a, b))
    print(f"| {pname} | {fmt_pct(d['ann_mean'])} | {fmt_pct(d['ann_vol'])} | {d['sharpe']:.2f} | {fmt_pct(d['max_dd'])} | {fmt_pct(d['worst_period'])} ({d['worst_period_date']}) |")

# ------------------------------------------------------------------ beta portfolios
beta_vw = monthly_returns("Portfolios_Formed_on_BETA", "Value Weighted Returns -- Monthly")
secs = read_sections("Portfolios_Formed_on_BETA")
prior_beta = [v for k, v in secs.items() if "Prior Beta" in k][0]  # annual, formed end of June

# map formation-year beta to months Jul(t)..Jun(t+1)
def beta_monthly(col: str) -> pd.Series:
    out = {}
    for y, b in prior_beta[col].items():
        yr = int(str(y))
        for m in range(7, 13):
            out[pd.Period(f"{yr}-{m:02d}", "M")] = b
        for m in range(1, 7):
            out[pd.Period(f"{yr + 1}-{m:02d}", "M")] = b
    return pd.Series(out).sort_index()


# Frazzini-Pedersen (2014) style Vasicek shrinkage toward 1 (w=0.6); raw 60m betas of the
# low-beta quintile fall to ~0.00 in 2001-02, which would imply absurd leverage.
bL = 0.6 * beta_monthly("Lo 20") + 0.4
bH = 0.6 * beta_monthly("Hi 20") + 0.4
exL = beta_vw["Lo 20"] - rf.reindex(beta_vw.index)
exH = beta_vw["Hi 20"] - rf.reindex(beta_vw.index)
bab = (exL / bL.reindex(exL.index) - exH / bH.reindex(exH.index)).dropna()

print("\n## Beta-sorted quintiles (VW, 1963-07..2026-08), gross\n")
print(f"Average ex-ante beta at formation: Lo 20 = {prior_beta['Lo 20'].mean():.2f}, Hi 20 = {prior_beta['Hi 20'].mean():.2f}\n")
print("| Portfolio | Period | Ann. mean total | CAGR | Ann. vol | Sharpe (excess) | CAPM alpha (ann., t) | Realized beta | Max DD |")
print("|---|---|---:|---:|---:|---:|---:|---:|---:|")
BP = [("1963-2026", "1963-07", None), ("1963-1999", "1963-07", "1999-12"), ("2000-2026", "2000-01", None), ("2010-2026", "2010-01", None), ("post-FP (2014-11..)", "2014-11", None)]
for pname, a, b in BP:
    for lbl, s in [("Low-beta quintile", beta_vw["Lo 20"]), ("High-beta quintile", beta_vw["Hi 20"]), ("Market", mkt)]:
        x = sub(s, a, b)
        d = stats(x)
        ex = x - rf.reindex(x.index)
        sh = ex.mean() / ex.std() * np.sqrt(12)
        al, t, be = capm(ex, ff3["Mkt-RF"].reindex(x.index)) if lbl != "Market" else (0.0, float("nan"), 1.0)
        print(f"| {lbl} | {pname} | {fmt_pct(d['ann_mean'])} | {fmt_pct(d['cagr'])} | {fmt_pct(d['ann_vol'])} | {sh:.2f} | {fmt_pct(al)} ({t:.2f}) | {be:.2f} | {fmt_pct(d['max_dd'])} |")
    x = sub(bab, a, b)
    d = stats(x)
    al, t, be = capm(x, ff3["Mkt-RF"].reindex(x.index))
    print(f"| BAB-like (Lo20/bL - Hi20/bH, excess) | {pname} | {fmt_pct(d['ann_mean'])} | {fmt_pct(d['cagr'])} | {fmt_pct(d['ann_vol'])} | {d['sharpe']:.2f} | {fmt_pct(al)} ({t:.2f}) | {be:.2f} | {fmt_pct(d['max_dd'])} |")
