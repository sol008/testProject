"""s00 - Live option-chain snapshot (Yahoo, via yfinance) for short-dated index options.

Pulls every expiry <= 70 calendar days for ^SPX, ^XSP, SPY, QQQ, IWM and stores the raw chain in the
scratchpad (chain_short_<date>.csv).  Per expiry it computes the forward from put-call parity and
Black-Scholes implied vols from mid quotes.  Downstream scripts use it for (i) the skew shape of
30-45 DTE SPX options, (ii) quoted spreads / fill-cost calibration, (iii) today's implied event moves.

NOTE: Yahoo quotes pulled after the 16:00 ET close can be stale or wide; treat spreads as upper bounds.
"""
from __future__ import annotations

import sys
import time
from datetime import date

import numpy as np
import pandas as pd

from common14 import DATA_DIR, bs_iv, tbill_daily

TICKERS = ["^SPX", "^XSP", "SPY", "QQQ", "IWM"]
MAX_DTE = 70


def snapshot(asof: date) -> pd.DataFrame:
    import yfinance as yf
    r = float(tbill_daily().iloc[-1])
    rows = []
    for t in TICKERS:
        tk = yf.Ticker(t)
        spot = float(tk.history(period="5d")["Close"].iloc[-1])
        for ex in tk.options:
            dte = (pd.Timestamp(ex).date() - asof).days
            if dte < 0 or dte > MAX_DTE:
                continue
            for attempt in range(3):
                try:
                    ch = tk.option_chain(ex)
                    break
                except Exception:
                    time.sleep(2)
            else:
                continue
            for kind, df in (("call", ch.calls), ("put", ch.puts)):
                d = df[["strike", "bid", "ask", "lastPrice", "volume", "openInterest", "impliedVolatility"]].copy()
                d["kind"] = kind
                d["expiry"] = ex
                d["dte"] = dte
                d["ticker"] = t
                d["spot"] = spot
                d["r"] = r
                rows.append(d)
            time.sleep(0.3)
    return pd.concat(rows, ignore_index=True)


def enrich(raw: pd.DataFrame, asof: date) -> pd.DataFrame:
    out = []
    for (t, ex), g in raw.groupby(["ticker", "expiry"]):
        g = g.copy()
        g["mid"] = (g.bid + g.ask) / 2
        dte = int(g.dte.iloc[0])
        # time to expiry: PM-settled at 16:00 ET; snapshot taken after the close -> use dte days
        T = max(dte, 0.5) / 365.0
        r = float(g.r.iloc[0])
        S = float(g.spot.iloc[0])
        c = g[g.kind == "call"].set_index("strike").mid
        p = g[g.kind == "put"].set_index("strike").mid
        common = c.index.intersection(p.index)
        common = common[(c.loc[common] > 0) & (p.loc[common] > 0)]
        if len(common) < 3:
            continue
        near = sorted(common, key=lambda k: abs(k - S))[:6]
        F = float(np.median([k + np.exp(r * T) * (c.loc[k] - p.loc[k]) for k in near]))
        q_implied = r - np.log(F / S) / T
        g["T"] = T
        g["F"] = F
        g["q_impl"] = q_implied
        g["moneyness"] = g.strike / F
        g["spread"] = g.ask - g.bid
        g["spread_pct_mid"] = np.where(g.mid > 0, g.spread / g.mid, np.nan)
        ivs = []
        for _, row in g.iterrows():
            if row.bid <= 0 or row.ask <= 0 or row.mid <= 0:
                ivs.append(np.nan)
                continue
            ivs.append(bs_iv(row.mid, F * np.exp(-r * T), row.strike, T, r, 0.0, row.kind))
        g["iv_mid"] = ivs
        out.append(g)
    return pd.concat(out, ignore_index=True)


def main():
    asof = date.today() if len(sys.argv) < 2 else pd.Timestamp(sys.argv[1]).date()
    p = DATA_DIR / f"chain_short_{asof:%Y%m%d}.csv"
    if p.exists():
        raw = pd.read_csv(p)
    else:
        raw = snapshot(asof)
        raw.to_csv(p, index=False)
    ch = enrich(raw, asof)
    ch.to_csv(DATA_DIR / f"chain_short_enriched_{asof:%Y%m%d}.csv", index=False)
    print(ch.groupby(["ticker"]).expiry.nunique())
    print(ch.groupby(["ticker"]).size())


if __name__ == "__main__":
    main()
