"""Track 37: the live, out-of-sample records of "an AI reads the world and picks stocks", against SPY, from prices.

1. AIEQ (the AI Powered Equity ETF, IBM Watson reading news and filings; launched 17 Oct 2017; 0.75% fee) vs SPY
   since inception. The longest live record of the idea.
2. SPY over the window of Finder's ChatGPT fund (38 stocks picked on 3 Mar 2023, equal weight, buy and hold; the
   tracker reports +57.8% to 27 Mar 2026).
3. SPY over the window of the ChatGPT micro-cap experiment (27 Jun - 26 Dec 2025; $100 -> $82.88, the author's
   final post).

Prices: Yahoo daily bars, adjusted for dividends (total return). Run: python3 live_records.py -> prints and writes
results/live_records.csv. Needs network; prints a note and exits 0 without it.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd


def _download(tickers, start, end=None):
    import yfinance as yf
    px = yf.download(tickers, start=start, end=end, auto_adjust=True, progress=False)["Close"]
    if isinstance(px, pd.Series):
        px = px.to_frame(tickers if isinstance(tickers, str) else tickers[0])
    return px.dropna()


def stats_since(px: pd.DataFrame) -> pd.DataFrame:
    rows = []
    yrs = (px.index[-1] - px.index[0]).days / 365.25
    for c in px.columns:
        s = px[c]
        r = s.pct_change().dropna()
        dd = (s / s.cummax() - 1).min()
        rows.append({"series": c, "from": px.index[0].date(), "to": px.index[-1].date(), "years": round(yrs, 2),
                     "total_return": round(float(s.iloc[-1] / s.iloc[0] - 1), 3),
                     "cagr": round(float((s.iloc[-1] / s.iloc[0]) ** (1 / yrs) - 1), 4),
                     "ann_vol": round(float(r.std() * np.sqrt(252)), 3), "max_drawdown": round(float(dd), 3),
                     "sharpe_0rf": round(float(r.mean() / r.std() * np.sqrt(252)), 2)})
    return pd.DataFrame(rows)


def window_return(px: pd.Series, a: str, b: str) -> float:
    s = px.loc[a:b]
    return float(s.iloc[-1] / s.iloc[0] - 1)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, "results"), exist_ok=True)
    try:
        aieq = _download(["AIEQ", "SPY"], "2017-10-17")
        spy = _download("SPY", "2023-02-27")["SPY"]
    except Exception as exc:  # noqa: BLE001
        print(f"no network or Yahoo failed ({type(exc).__name__}); skipped")
        sys.exit(0)
    out = stats_since(aieq)
    print("1. AIEQ vs SPY since AIEQ's inception (total return, adjusted closes):")
    print(out.to_string(index=False))
    gap = out.set_index("series").cagr
    print(f"   -> AIEQ trails SPY by {100 * (gap['SPY'] - gap['AIEQ']):.1f} points a year over {out.years[0]} years")
    finder_spy = window_return(spy, "2023-03-03", "2026-03-27")
    micro_spy = window_return(spy, "2025-06-27", "2025-12-26")
    print(f"\n2. Finder ChatGPT fund window 2023-03-03 -> 2026-03-27: fund +57.8% (reported) vs SPY {finder_spy:+.1%}")
    print(f"3. Micro-cap experiment window 2025-06-27 -> 2025-12-26: portfolio -17.1% (reported) vs SPY "
          f"{micro_spy:+.1%}")
    rec = out.to_dict("records") + [
        {"series": "Finder ChatGPT fund (reported)", "from": "2023-03-03", "to": "2026-03-27", "total_return": 0.578},
        {"series": "SPY over the Finder window", "from": "2023-03-03", "to": "2026-03-27",
         "total_return": round(finder_spy, 3)},
        {"series": "ChatGPT micro-cap experiment (reported)", "from": "2025-06-27", "to": "2025-12-26",
         "total_return": -0.171},
        {"series": "SPY over the micro-cap window", "from": "2025-06-27", "to": "2025-12-26",
         "total_return": round(micro_spy, 3)},
    ]
    pd.DataFrame(rec).to_csv(os.path.join(here, "results", "live_records.csv"), index=False)
