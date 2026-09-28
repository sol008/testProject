"""Ex-ante base rates for the worked example email in 00-SYNTHESIS.md.

For every S&P 500 all-time-high drawdown that reached -30% before 2020, take the
first close at or beyond -30% as the entry and measure:
  * the index price change 21 months later (the life of a ~2-year call bought then),
  * an approximate at-the-money call multiple at that horizon (Black-Scholes premium
    at a flat 30% implied vol, r=2%, q=2%; an approximation, not a quote),
  * the 1x index result if held 3 years, and years until a new all-time high.
Only data before 2020-01-01 feeds the base rates, so the 2020 example uses nothing
it could not have known at the time. Price index only (calls do not earn dividends).
"""
import numpy as np
import pandas as pd
import yfinance as yf
from scipy.stats import norm

px = yf.download("^GSPC", start="1927-12-01", end="2026-09-29", progress=False, auto_adjust=True)["Close"].squeeze()
ath = px.cummax()
dd = px / ath - 1


def bs_call(S, K, T, sigma=0.30, r=0.02, q=0.02):
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    return S * np.exp(-q * T) * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)


rows = []
in_episode = False
for t, d in dd.items():
    if not in_episode and d <= -0.30:
        in_episode = True
        entry_px = float(px.loc[t])
        exp_t = px.index[px.index.searchsorted(t + pd.DateOffset(months=21))] if t + pd.DateOffset(months=21) <= px.index[-1] else None
        p21 = float(px.loc[exp_t]) if exp_t is not None else np.nan
        t3 = t + pd.DateOffset(years=3)
        p3 = float(px.iloc[px.index.searchsorted(t3)]) if t3 <= px.index[-1] else np.nan
        prior_ath = float(ath.loc[t])
        after = px.loc[t:]
        new_high = after[after >= prior_ath]
        yrs_to_ath = (new_high.index[0] - t).days / 365.25 if len(new_high) else np.nan
        prem = bs_call(entry_px, entry_px, 21 / 12)
        payoff = max(p21 - entry_px, 0.0) if not np.isnan(p21) else np.nan
        rows.append({
            "entry_date": t.date(), "drawdown_at_entry": round(d * 100, 1), "entry_level": round(entry_px, 2),
            "index_change_21m_pct": round((p21 / entry_px - 1) * 100, 1),
            "atm_call_multiple_21m_approx": round(payoff / prem, 2) if not np.isnan(payoff) else np.nan,
            "index_change_3y_pct": round((p3 / entry_px - 1) * 100, 1),
            "years_to_new_ath": round(yrs_to_ath, 1),
        })
    if in_episode and d == 0:
        in_episode = False

res = pd.DataFrame(rows)
pre = res[pd.to_datetime(res.entry_date) < "2020-01-01"]
print(res.to_string(index=False))
print("\nPre-2020 episodes:", len(pre))
print("  index up after 21 months:", int((pre.index_change_21m_pct > 0).sum()), "of", len(pre))
print("  approx ATM call profitable (multiple > 1):", int((pre.atm_call_multiple_21m_approx > 1).sum()), "of", len(pre))
print("  approx ATM call worthless or near (multiple < 0.2):", int((pre.atm_call_multiple_21m_approx < 0.2).sum()), "of", len(pre))
print("  median call multiple:", pre.atm_call_multiple_21m_approx.median())
print("  1x index up after 3 years:", int((pre.index_change_3y_pct > 0).sum()), "of", len(pre), "; median", pre.index_change_3y_pct.median(), "%; worst", pre.index_change_3y_pct.min(), "%")
res.to_csv(__file__.replace("example_base_rates.py", "example_base_rates.csv"), index=False)
