"""Track 29, part D: live momentum funds since inception vs SPY (net of fees, dividends reinvested, before tax).

Yahoo adjusted closes (auto_adjust) are net of each fund's expense ratio.  XMMO tracked a different index before
its 2019 change (then "Dynamic MidCap Growth"), so it is also shown from July 2019.  AQR's Large Cap Momentum fund
(AMOMX) has no Yahoo history and is not included.
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import numpy as np
import pandas as pd

import data29 as D

FUNDS = {
    "MTUM": ("iShares MSCI USA Momentum Factor", 0.0015),
    "SPMO": ("Invesco S&P 500 Momentum", 0.0013),
    "QMOM": ("Alpha Architect US Quantitative Momentum (~50 stocks)", 0.0029),
    "XMMO": ("Invesco S&P MidCap Momentum", 0.0034),
    "PDP": ("Invesco Dorsey Wright Momentum", 0.0062),
    "JMOM": ("JPMorgan US Momentum Factor", 0.0012),
    "VFMO": ("Vanguard US Momentum Factor (active)", 0.0013),
    "MMTM": ("SPDR S&P 1500 Momentum Tilt", 0.0012),
}


def main() -> pd.DataFrame:
    px = D.prices()["Close"]
    rows = []
    for t, (name, fee) in FUNDS.items():
        for since in (None, "2019-07-01") if t == "XMMO" else (None,):
            s = px[t].dropna()
            if since:
                s = s.loc[since:]
            b = px["SPY"].reindex(s.index).ffill()
            yrs = (s.index[-1] - s.index[0]).days / 365.25
            cagr = (s.iloc[-1] / s.iloc[0]) ** (1 / yrs) - 1
            bc = (b.iloc[-1] / b.iloc[0]) ** (1 / yrs) - 1
            m, mb = s.resample("ME").last().pct_change().dropna(), b.resample("ME").last().pct_change().dropna()
            ex = m - mb
            r3 = (np.log1p(m).rolling(36).sum() - np.log1p(mb).rolling(36).sum()).dropna()
            rows.append(dict(ticker=t + (" (since Jul 2019)" if since else ""), fund=name, expense_ratio=fee,
                             start=str(s.index[0].date()), years=round(yrs, 1), cagr=cagr, spy_cagr=bc,
                             excess=cagr - bc, tracking_error=ex.std() * np.sqrt(12),
                             t_excess=ex.mean() / ex.std() * np.sqrt(len(ex)),
                             share_36m_windows_ahead=(r3 > 0).mean(),
                             maxdd=float((s / s.cummax() - 1).min()), spy_maxdd=float((b / b.cummax() - 1).min())))
    out = pd.DataFrame(rows)
    out.to_csv(D.RESULTS / "etf_live.csv", index=False, float_format="%.4f")
    return out


if __name__ == "__main__":
    print(main().to_string(index=False, float_format=lambda v: f"{v:.3f}"))
