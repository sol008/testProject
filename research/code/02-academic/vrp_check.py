"""Variance risk premium check (Carr & Wu 2009; Bollerslev, Tauchen & Zhou 2009) with public data.

Implied: VIX close on day t (30-calendar-day S&P 500 implied vol, annualized %).
Realized: annualized close-to-close vol of ^GSPC over the next 21 trading days.
Short-variance P&L proxy per month (non-overlapping, month-end start): (VIX^2 - RV^2)/100 in 'variance points',
scaled so a 1-unit vega-notional variance swap seller earns VIX^2 - RV^2 (in vol^2 %).
Run:  python vrp_check.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf

d = yf.download(["^GSPC", "^VIX"], start="1990-01-01", end="2026-09-27", auto_adjust=True, progress=False)["Close"].dropna()
r = np.log(d["^GSPC"]).diff()
fwd_rv = r[::-1].rolling(21).std()[::-1].shift(-1) * np.sqrt(252) * 100  # next 21 days, annualized %
x = pd.DataFrame({"vix": d["^VIX"], "rv": fwd_rv}).dropna()
x["vrp_vol"] = x.vix - x.rv
x["vrp_var"] = x.vix ** 2 - x.rv ** 2
m = x.groupby(x.index.to_period("M")).head(1)  # first trading day of each month -> ~non-overlapping
print(f"Sample {x.index[0].date()} .. {x.index[-1].date()}\n")
print("| Period | Months | Mean VIX | Mean fwd RV | Mean VIX-RV (vol pts) | % months VIX>RV | Mean VIX^2-RV^2 | Median | Worst month (VIX^2-RV^2) | Worst month date | Worst / mean |")
print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|")
for pname, a, b in [("1990-2026", None, None), ("1990-2007", None, "2007-12-31"), ("2008-2026", "2008-01-01", None), ("2015-2026", "2015-01-01", None)]:
    y = m.copy()
    if a:
        y = y[y.index >= pd.Timestamp(a)]
    if b:
        y = y[y.index <= pd.Timestamp(b)]
    worst = y.vrp_var.idxmin()
    print(f"| {pname} | {len(y)} | {y.vix.mean():.1f} | {y.rv.mean():.1f} | {y.vrp_vol.mean():.1f} | {100 * (y.vrp_vol > 0).mean():.0f}% | "
          f"{y.vrp_var.mean():.0f} | {y.vrp_var.median():.0f} | {y.vrp_var.min():.0f} | {worst.date()} | {y.vrp_var.min() / y.vrp_var.mean():.0f}x |")
print("\n5 worst months for a variance seller (VIX^2 - RV^2):")
for t, v in m.vrp_var.nsmallest(5).items():
    print(f"  {t.date()}: VIX {m.loc[t, 'vix']:.1f} vs realized {m.loc[t, 'rv']:.1f} -> {v:.0f}")
