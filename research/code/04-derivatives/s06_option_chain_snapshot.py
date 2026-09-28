"""Current option-chain snapshot (SPX, SPY, QQQ + a few single names).

Purpose
  1. Measure what a retail buyer actually pays: quoted bid-ask spread as % of
     mid premium, by moneyness and expiry.
  2. Calibrate the implied-vol surface shape (skew and term structure) that the
     synthetic back-test (s02) needs: IV(K/F, T) relative to VIX / VIX1Y.

This is a single snapshot (yfinance only serves current chains), so it
calibrates *shape*, not history.  Saved to output/chain_snapshot_*.csv.
"""
from __future__ import annotations

import datetime as dt
import sys

import numpy as np
import pandas as pd
import yfinance as yf
from scipy.stats import norm

from common import OUT, DATA_DIR

TODAY = pd.Timestamp(dt.date.today())


def black76(F, K, T, r, sigma, kind):
    sigma = max(sigma, 1e-6)
    d1 = (np.log(F / K) + 0.5 * sigma ** 2 * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    df = np.exp(-r * T)
    if kind == "call":
        return df * (F * norm.cdf(d1) - K * norm.cdf(d2))
    return df * (K * norm.cdf(-d2) - F * norm.cdf(-d1))


def iv76(price, F, K, T, r, kind):
    intrinsic = np.exp(-r * T) * max(0.0, F - K if kind == "call" else K - F)
    if not np.isfinite(price) or price <= intrinsic + 1e-9:
        return np.nan
    a, b = 1e-4, 4.0
    for _ in range(100):
        m = 0.5 * (a + b)
        if black76(F, K, T, r, m, kind) > price:
            b = m
        else:
            a = m
        if b - a < 1e-6:
            break
    return 0.5 * (a + b)


def rate_for(T, curve):
    # linear interpolation on a tiny curve {years: rate}
    xs = np.array(sorted(curve))
    ys = np.array([curve[x] for x in xs])
    return float(np.interp(T, xs, ys))


def snapshot(ticker: str, target_days=(30, 60, 90, 180, 270, 365, 540, 730),
             curve=None):
    tk = yf.Ticker(ticker)
    exps = [pd.Timestamp(e) for e in tk.options]
    spot_hist = tk.history(period="5d")
    spot = float(spot_hist["Close"].iloc[-1])
    rows = []
    chosen = []
    for td in target_days:
        if not exps:
            break
        e = min(exps, key=lambda x: abs((x - TODAY).days - td))
        if e in chosen:
            continue
        chosen.append(e)
    for e in chosen:
        T = max((e - TODAY).days, 1) / 365.0
        r = rate_for(T, curve)
        try:
            ch = tk.option_chain(e.strftime("%Y-%m-%d"))
        except Exception as ex:  # pragma: no cover
            print("chain error", ticker, e, ex, file=sys.stderr)
            continue
        c = ch.calls[["strike", "bid", "ask", "lastPrice", "volume", "openInterest", "impliedVolatility"]].copy()
        p = ch.puts[["strike", "bid", "ask", "lastPrice", "volume", "openInterest", "impliedVolatility"]].copy()
        c["kind"], p["kind"] = "call", "put"
        both = pd.concat([c, p])
        both = both[(both.bid > 0) & (both.ask > 0) & (both.ask >= both.bid)]
        both["mid"] = 0.5 * (both.bid + both.ask)
        # implied forward from put-call parity on strikes near spot
        m = c.merge(p, on="strike", suffixes=("_c", "_p"))
        m = m[(m.bid_c > 0) & (m.bid_p > 0)]
        m["mid_c"] = 0.5 * (m.bid_c + m.ask_c)
        m["mid_p"] = 0.5 * (m.bid_p + m.ask_p)
        near = m.iloc[(m.strike - spot).abs().argsort()[:6]]
        if len(near) == 0:
            continue
        F_est = float(np.median(near.strike + np.exp(r * T) * (near.mid_c - near.mid_p)))
        both["T"] = T
        both["F"] = F_est
        both["moneyness"] = both.strike / F_est
        both["spread_pct_mid"] = (both.ask - both.bid) / both["mid"]
        both["iv_mid"] = [iv76(pr, F_est, K, T, r, k) for pr, K, k in zip(both["mid"], both.strike, both.kind)]
        both["expiry"] = e.date()
        both["days"] = (e - TODAY).days
        both["ticker"] = ticker
        both["spot"] = spot
        both["r"] = r
        rows.append(both)
    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True)


def summarise(df: pd.DataFrame, buckets=(0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20)):
    """IV and % spread at chosen moneyness points; OTM side only (puts K<F, calls K>=F)."""
    out = []
    for (tkr, exp), g in df.groupby(["ticker", "expiry"]):
        for mny in buckets:
            kind = "put" if mny < 1.0 else "call"
            gg = g[g.kind == kind]
            if len(gg) == 0:
                continue
            idx = (gg.moneyness - mny).abs().idxmin()
            row = gg.loc[idx]
            if abs(row.moneyness - mny) > 0.025:
                continue
            out.append(dict(ticker=tkr, expiry=exp, days=int(row.days), target_mny=mny,
                            strike=row.strike, kind=kind, moneyness=round(row.moneyness, 4),
                            bid=row.bid, ask=row.ask, mid=row["mid"],
                            spread_pct_mid=row.spread_pct_mid, iv_mid=row.iv_mid,
                            premium_pct_spot=row["mid"] / row.spot, oi=row.openInterest))
    return pd.DataFrame(out)


def main():
    # rates curve from Yahoo (13w bill ^IRX, 5y ^FVX) and FRED 1y as fallback
    irx = yf.Ticker("^IRX").history(period="5d")["Close"].iloc[-1] / 100
    fvx = yf.Ticker("^FVX").history(period="5d")["Close"].iloc[-1] / 100
    curve = {0.0: irx, 0.25: irx, 5.0: fvx}
    try:
        dgs1 = pd.read_csv(DATA_DIR / "fred_DGS1.csv").iloc[:, 1]
        curve[1.0] = float(pd.to_numeric(dgs1, errors="coerce").dropna().iloc[-1]) / 100
    except Exception:
        pass
    print("rate curve", curve)
    allrows = []
    for tkr in ["^SPX", "SPY", "QQQ", "IWM", "AAPL", "NVDA", "TSLA", "IBIT"]:
        try:
            df = snapshot(tkr, curve=curve)
        except Exception as ex:
            print("fail", tkr, ex)
            continue
        if len(df):
            allrows.append(df)
            print(tkr, "rows", len(df), "expiries", df.expiry.nunique())
    raw = pd.concat(allrows, ignore_index=True)
    stamp = TODAY.strftime("%Y%m%d")
    raw.to_csv(DATA_DIR / f"chain_raw_{stamp}.csv", index=False)
    summ = summarise(raw)
    summ.to_csv(OUT / f"chain_snapshot_{stamp}.csv", index=False, float_format="%.4f")
    # pivot tables for the report
    for field in ["iv_mid", "spread_pct_mid", "premium_pct_spot"]:
        pv = summ.pivot_table(index=["ticker", "days"], columns="target_mny", values=field)
        pv.to_csv(OUT / f"chain_{field}_{stamp}.csv", float_format="%.4f")
        with pd.option_context("display.width", 250, "display.max_columns", 30):
            print(f"\n=== {field} ===")
            print(pv.round(4))


if __name__ == "__main__":
    main()
