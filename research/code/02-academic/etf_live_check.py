"""Live, net-of-fee evidence: how did investable 'anomaly' ETFs/funds do after launch vs SPY?

These are post-publication, real-money implementations a retail investor can actually buy.
Uses yfinance adjusted closes (dividends reinvested, net of fund expenses; excludes investor taxes).
Run:  python etf_live_check.py
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import yfinance as yf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "results")
os.makedirs(OUT, exist_ok=True)

TICKERS = {
    "MTUM": "Momentum (iShares MSCI USA Momentum)",
    "SPMO": "Momentum (Invesco S&P 500 Momentum)",
    "QMOM": "Concentrated momentum (~50 stocks, Alpha Architect)",
    "VLUE": "Value (iShares MSCI USA Value Factor)",
    "QVAL": "Concentrated value (~50 stocks, Alpha Architect)",
    "IWD": "Large value (Russell 1000 Value)",
    "IWF": "Large growth (Russell 1000 Growth)",
    "VBR": "Small value (Vanguard Small-Cap Value)",
    "AVUV": "Small value (Avantis US Small Cap Value)",
    "QUAL": "Quality (iShares MSCI USA Quality)",
    "USMV": "Min-vol (iShares MSCI USA Min Vol)",
    "SPLV": "Low-vol (Invesco S&P 500 Low Volatility)",
    "SIZE": "Size (iShares MSCI USA Size Factor)",
    "IWM": "Small caps (Russell 2000)",
    "CSD": "Spin-offs (Invesco S&P Spin-Off)",
    "PKW": "Buybacks (Invesco Buyback Achievers)",
    "IPO": "IPOs (Renaissance IPO ETF)",
    "AQMIX": "Managed futures / trend (AQR Managed Futures, I shares)",
    "DBMF": "Managed futures replication (iMGP DBi)",
    "PUTW": "Put-writing / variance risk premium (WisdomTree PutWrite)",
    "SVXY": "Short VIX futures (ProShares; -1x until 2018, -0.5x after)",
}
BENCH = "SPY"


def load(tks):
    px = yf.download(tks, start="1999-01-01", end="2026-09-26", auto_adjust=True, progress=False)["Close"]
    return px


px = load(list(TICKERS) + [BENCH])
px.to_csv(os.path.join(OUT, "etf_prices.csv"))
rows = []
for t, name in TICKERS.items():
    s = px[t].dropna()
    if len(s) < 250:
        continue
    b = px[BENCH].reindex(s.index).ffill()
    yrs = (s.index[-1] - s.index[0]).days / 365.25
    cagr = (s.iloc[-1] / s.iloc[0]) ** (1 / yrs) - 1
    bcagr = (b.iloc[-1] / b.iloc[0]) ** (1 / yrs) - 1
    r, rb = s.pct_change().dropna(), b.pct_change().dropna()
    vol = r.std() * np.sqrt(252)
    mdd = (s / s.cummax() - 1).min()
    bmdd = (b / b.cummax() - 1).min()
    beta = np.cov(r, rb)[0, 1] / rb.var()
    rows.append(
        {
            "ticker": t,
            "what": name,
            "start": s.index[0].date(),
            "years": round(yrs, 1),
            "CAGR": cagr,
            "SPY CAGR same window": bcagr,
            "CAGR minus SPY": cagr - bcagr,
            "vol": vol,
            "beta vs SPY": beta,
            "max DD": mdd,
            "SPY max DD": bmdd,
            "growth of $1": s.iloc[-1] / s.iloc[0],
            "SPY growth of $1": b.iloc[-1] / b.iloc[0],
        }
    )
res = pd.DataFrame(rows)
res.to_csv(os.path.join(OUT, "etf_live_check.csv"), index=False)
print(f"Prices through {px.index[-1].date()}\n")
print("| Ticker | Exposure | Since | Yrs | CAGR | SPY CAGR (same window) | Diff | Vol | Beta | Max DD | SPY max DD |")
print("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
for _, r in res.iterrows():
    print(
        f"| {r.ticker} | {r.what} | {r.start} | {r.years} | {100 * r.CAGR:.1f}% | {100 * r['SPY CAGR same window']:.1f}% | "
        f"{100 * r['CAGR minus SPY']:+.1f}pp | {100 * r.vol:.0f}% | {r['beta vs SPY']:.2f} | {100 * r['max DD']:.0f}% | {100 * r['SPY max DD']:.0f}% |"
    )
# SVXY Feb-2018 event
s = px["SVXY"].dropna()
feb = s.loc["2018-02-01":"2018-02-09"]
print(f"\nSVXY 2018-02-02 -> 2018-02-06 close-to-close: {100 * (feb.loc['2018-02-06'] / feb.loc['2018-02-02'] - 1):.1f}%")
