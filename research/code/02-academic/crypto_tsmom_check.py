"""Out-of-sample check of crypto time-series momentum (Liu & Tsyvinski 2021, RFS; sample to 2018).

Rule tested (weekly, decided at Sunday close UTC, applied next week): hold BTC if the trailing N-week
return > 0, else hold cash (0%). N in {1, 4, 20 (~140d)}; plus a 20-week moving-average rule.
Split: 2014-09..2018-12 (overlaps the paper's sample) vs 2019-01..2026-09 (post-publication).
Cost: 0.25% per switch (retail exchange fee + spread). Taxes ignored.
Run:  python crypto_tsmom_check.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf

px = yf.download("BTC-USD", start="2014-09-01", end="2026-09-27", auto_adjust=True, progress=False)["Close"]
px = px.iloc[:, 0] if isinstance(px, pd.DataFrame) else px
w = px.resample("W-SUN").last().dropna()
r = w.pct_change().dropna()
COST = 0.0025


def run(sig: pd.Series) -> tuple[pd.Series, pd.Series]:
    s = sig.shift(1).reindex(r.index).fillna(0)
    sw = s.diff().abs().fillna(0)
    return s * r - sw * COST, sw


rules = {
    "Buy & hold BTC": pd.Series(1.0, index=w.index),
    "TSMOM 1-week": (w.pct_change(1) > 0).astype(float),
    "TSMOM 4-week": (w.pct_change(4) > 0).astype(float),
    "TSMOM 20-week": (w.pct_change(20) > 0).astype(float),
    "Price > 20-week MA": (w > w.rolling(20).mean()).astype(float),
}
print(f"BTC weekly data {r.index[0].date()} .. {r.index[-1].date()}\n")
print("| Rule | Period | CAGR | Ann. vol | Sharpe (rf=0) | Max DD | % weeks invested | Switches / yr |")
print("|---|---|---:|---:|---:|---:|---:|---:|")
for name, sig in rules.items():
    rr, sw = run(sig) if name != "Buy & hold BTC" else (r, pd.Series(0.0, index=r.index))
    for pname, a, b in [("2014-2018 (paper's sample era)", "2014-10-01", "2018-12-31"), ("2019-2026 (post-publication)", "2019-01-01", None), ("Full", None, None)]:
        x = rr.copy()
        if a:
            x = x[x.index >= pd.Timestamp(a)]
        if b:
            x = x[x.index <= pd.Timestamp(b)]
        # skip warm-up weeks
        x = x[x.index >= r.index[0] + pd.Timedelta(weeks=21)]
        wealth = (1 + x).cumprod()
        yrs = (x.index[-1] - x.index[0]).days / 365.25
        cagr = wealth.iloc[-1] ** (1 / yrs) - 1
        vol = x.std() * np.sqrt(52)
        sh = x.mean() * 52 / vol
        mdd = (wealth / wealth.cummax() - 1).min()
        inv = sig.shift(1).reindex(x.index).fillna(0).mean() if name != "Buy & hold BTC" else 1.0
        swy = sw.reindex(x.index).sum() / yrs
        print(f"| {name} | {pname} | {100 * cagr:.0f}% | {100 * vol:.0f}% | {sh:.2f} | {100 * mdd:.0f}% | {100 * inv:.0f}% | {swy:.1f} |")
