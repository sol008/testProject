"""Track 32: what does a deep in-the-money call cost as IRA leverage (Robinhood IRA = Level 2, long calls OK)?

For SPY and QQQ, at expiries near 3, 6 and 12 months, pick the call whose Black-Scholes delta
(from Yahoo's implied volatility) is closest to 0.85 and report:
  - the price of one contract (100 shares) and its share of an $80k IRA (whole contracts only);
  - the effective leverage (delta x spot / premium);
  - the time value paid, a year, as % of spot (the implied cost of the leverage);
  - the quoted bid-ask spread as % of mid, and open interest.
Quotes are Yahoo's delayed snapshot (the last session's close outside market hours).

Run:  python research/code/32-venues/ditm_calls.py   ->  ditm_calls.csv next to this file
"""
from datetime import date, datetime
from math import erf, exp, log, sqrt
from pathlib import Path

import pandas as pd
import yfinance as yf

HERE = Path(__file__).resolve().parent
TARGET_DELTA = 0.85
IRA = 80_000
RATE = 0.04  # rough risk-free rate for the delta calculation


def ncdf(x):
    return 0.5 * (1 + erf(x / sqrt(2)))


def bs_delta(s, k, t, vol, r=RATE, q=0.0):
    if vol <= 0 or t <= 0:
        return 1.0 if s > k else 0.0
    d1 = (log(s / k) + (r - q + 0.5 * vol * vol) * t) / (vol * sqrt(t))
    return exp(-q * t) * ncdf(d1)


def main():
    rows = []
    today = date.today()
    for sym in ["SPY", "QQQ"]:
        tk = yf.Ticker(sym)
        spot = float(tk.history(period="5d")["Close"].iloc[-1])
        exps = [datetime.strptime(e, "%Y-%m-%d").date() for e in tk.options]
        for target_days in (90, 180, 365):
            exp_d = min(exps, key=lambda e: abs((e - today).days - target_days))
            t = (exp_d - today).days / 365.0
            ch = tk.option_chain(exp_d.isoformat()).calls.copy()
            ch = ch[(ch["strike"] < spot) & (ch["impliedVolatility"] > 0.01)]
            if ch.empty:
                continue
            ch["delta"] = [bs_delta(spot, k, t, v) for k, v in zip(ch["strike"], ch["impliedVolatility"])]
            row = ch.iloc[(ch["delta"] - TARGET_DELTA).abs().argsort().iloc[0]]
            bid, ask, last = float(row["bid"]), float(row["ask"]), float(row["lastPrice"])
            mid = (bid + ask) / 2 if bid > 0 and ask > 0 else last
            intrinsic = max(spot - row["strike"], 0.0)
            time_value = max(mid - intrinsic, 0.0)
            rows.append({
                "underlying": sym, "spot": round(spot, 2), "expiry": exp_d.isoformat(), "days": (exp_d - today).days,
                "strike": row["strike"], "delta": round(row["delta"], 2), "iv": round(row["impliedVolatility"], 3),
                "premium": round(mid, 2), "contract_$": round(mid * 100),
                "pct_of_80k_ira": round(100 * mid * 100 / IRA, 1),
                "leverage_x": round(row["delta"] * spot / mid, 2),
                "time_value_pct_spot_per_yr": round(100 * time_value / spot / t, 2),
                "spread_pct_mid": round(100 * (ask - bid) / mid, 2) if bid > 0 and ask > 0 else None,
                "open_interest": int(row["openInterest"]) if pd.notna(row["openInterest"]) else None,
            })
    df = pd.DataFrame(rows)
    df.to_csv(HERE / "ditm_calls.csv", index=False)
    with pd.option_context("display.width", 200, "display.max_columns", 30):
        print(df.to_string(index=False))


if __name__ == "__main__":
    main()
