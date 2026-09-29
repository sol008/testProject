"""Track 32: how much does the account type cost a high-turnover "make-rich" book?

Growth multiple of $1 over 10 years at a constant pre-tax return, with every gain realized each year
(weekly or monthly switching makes nearly every gain short-term). Federal rates only (state tax,
loss years and the $3,000 loss limit ignored; the owner's state is still an open question):
  - IRA / Roth: untaxed while inside (a traditional IRA is taxed as income on withdrawal);
  - taxable, short-term: ordinary rate (24% or 37%, plus the 3.8% NIIT above the income thresholds);
  - taxable, Section 1256 (XSP options): 60% long-term / 40% short-term, whatever the holding period;
  - taxable, long-term: only if every position were held more than a year (not possible when switching weekly).
Run:  python research/code/32-venues/tax_drag.py
"""
import pandas as pd

CASES = {
    "IRA/Roth (untaxed inside)": 0.0,
    "taxable ST, 24% bracket": 0.24,
    "taxable ST, 37% + 3.8% NIIT": 0.408,
    "taxable 1256 60/40, 24% bracket (15% LT)": 0.6 * 0.15 + 0.4 * 0.24,
    "taxable 1256 60/40, top (23.8% LT, 40.8% ST)": 0.6 * 0.238 + 0.4 * 0.408,
}
rows = []
for name, tax in CASES.items():
    row = {"case": name, "tax_rate_%": round(100 * tax, 1)}
    for r in (0.15, 0.30, 0.50):
        row[f"{int(r * 100)}%/yr pre-tax: x after 10y"] = round((1 + r * (1 - tax)) ** 10, 2)
    rows.append(row)
df = pd.DataFrame(rows)
with pd.option_context("display.width", 200):
    print(df.to_string(index=False))
