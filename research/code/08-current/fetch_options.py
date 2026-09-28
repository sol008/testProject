"""Option-implied volatility snapshot for candidate underlyings (yfinance option chains).

For each underlying and each target tenor (~30/90/180/365 calendar days) we take the nearest listed expiry and report:
  - ATM IV (average of call & put IV at the strike nearest spot)
  - 10%-OTM put IV, 10%-OTM call IV (skew proxy), 20%-OTM put / 20%-OTM call where available
  - realized vol (20d, 60d, 1y) from daily closes, and IV/RV ratio
  - indicative mid prices for a few structures used in the report (ATM straddle %, 10% OTM put/call % of spot)
Output: SCRATCH/options_iv.csv
Caveat: yfinance IVs are vendor-computed from last/bid/ask snapshots and can be noisy, esp. far OTM or illiquid names.
"""
from __future__ import annotations

import math
import sys
import time

import numpy as np
import pandas as pd
import yfinance as yf

from common import SCRATCH

UNDERLYINGS = ["SPY", "QQQ", "IWM", "SMH", "NVDA", "MU", "AMD", "TSM", "ORCL", "CRWV", "MSFT", "META", "GOOGL",
               "TLT", "IEF", "HYG", "LQD", "KRE", "BIZD", "OWL", "BX", "ARCC", "GLD", "SLV", "GDX", "USO", "XLE", "XOP",
               "UNG", "COPX", "URA", "CCJ", "IBIT", "ETHA", "MSTR", "COIN", "FXI", "KWEB", "EWJ", "EWY", "EWT", "INDA",
               "EEM", "FXY", "FXE", "UUP", "XLU", "ITB", "TSLA", "SPCX", "UVXY", "EWZ", "VNQ", "XHB"]
TENORS = [30, 90, 180, 365]


def realized_vol(px: pd.Series, n: int) -> float:
    r = np.log(px).diff().dropna().iloc[-n:]
    return float(r.std() * math.sqrt(252) * 100) if len(r) >= max(10, n // 2) else np.nan


def iv_at(chain_df: pd.DataFrame, strike: float) -> tuple[float, float, float]:
    """Return (IV, mid, strike_used) for the listed strike nearest `strike` (IV in %)."""
    if chain_df is None or chain_df.empty:
        return np.nan, np.nan, np.nan
    df = chain_df.dropna(subset=["impliedVolatility"]).copy()
    df = df[(df["impliedVolatility"] > 0.01) & (df["impliedVolatility"] < 5)]
    if df.empty:
        return np.nan, np.nan, np.nan
    i = (df["strike"] - strike).abs().idxmin()
    row = df.loc[i]
    bid, ask, last = row.get("bid", np.nan), row.get("ask", np.nan), row.get("lastPrice", np.nan)
    mid = (bid + ask) / 2 if (bid and ask and bid > 0 and ask > 0) else last
    return float(row["impliedVolatility"] * 100), float(mid), float(row["strike"])


def one(tkr: str) -> list[dict]:
    t = yf.Ticker(tkr)
    try:
        exps = t.options
    except Exception as e:  # noqa: BLE001
        print(tkr, "no options", e, file=sys.stderr)
        return []
    if not exps:
        return []
    hist = t.history(period="2y", auto_adjust=False)["Close"].dropna()
    if hist.empty:
        return []
    spot = float(hist.iloc[-1])
    rv20, rv60, rv252 = realized_vol(hist, 20), realized_vol(hist, 60), realized_vol(hist, 252)
    today = pd.Timestamp.today().normalize()
    exp_dates = pd.to_datetime(list(exps))
    rows = []
    used = set()
    for tenor in TENORS:
        target = today + pd.Timedelta(days=tenor)
        k = int(np.argmin(np.abs((exp_dates - target).days)))
        exp = exps[k]
        dte = int((exp_dates[k] - today).days)
        if exp in used or dte < 7 or abs(dte - tenor) > max(20, tenor * 0.5):
            continue
        used.add(exp)
        try:
            ch = t.option_chain(exp)
        except Exception as e:  # noqa: BLE001
            print(tkr, exp, "chain fail", e, file=sys.stderr)
            continue
        c_atm, c_mid, k_c = iv_at(ch.calls, spot)
        p_atm, p_mid, k_p = iv_at(ch.puts, spot)
        p90, p90_mid, k90 = iv_at(ch.puts, spot * 0.9)
        c110, c110_mid, k110 = iv_at(ch.calls, spot * 1.1)
        p80, p80_mid, k80 = iv_at(ch.puts, spot * 0.8)
        c120, c120_mid, k120 = iv_at(ch.calls, spot * 1.2)
        atm = np.nanmean([c_atm, p_atm])
        rows.append({
            "ticker": tkr, "spot": spot, "expiry": exp, "dte": dte, "atm_iv": atm,
            "put90_iv": p90, "call110_iv": c110, "put80_iv": p80, "call120_iv": c120,
            "skew_90_110": p90 - c110 if not (np.isnan(p90) or np.isnan(c110)) else np.nan,
            "straddle_pct": (c_mid + p_mid) / spot * 100 if not (np.isnan(c_mid) or np.isnan(p_mid)) else np.nan,
            "put90_pct": p90_mid / spot * 100 if not np.isnan(p90_mid) else np.nan, "put90_strike": k90,
            "call110_pct": c110_mid / spot * 100 if not np.isnan(c110_mid) else np.nan, "call110_strike": k110,
            "put80_pct": p80_mid / spot * 100 if not np.isnan(p80_mid) else np.nan, "put80_strike": k80,
            "call120_pct": c120_mid / spot * 100 if not np.isnan(c120_mid) else np.nan, "call120_strike": k120,
            "rv20": rv20, "rv60": rv60, "rv252": rv252, "iv_rv60": atm / rv60 if rv60 else np.nan,
        })
    return rows


def main():
    allrows = []
    for tkr in UNDERLYINGS:
        for attempt in range(2):
            try:
                allrows.extend(one(tkr))
                break
            except Exception as e:  # noqa: BLE001
                print(tkr, "attempt", attempt, e, file=sys.stderr)
                time.sleep(3)
    df = pd.DataFrame(allrows)
    df.to_csv(SCRATCH / "options_iv.csv", index=False)
    pd.set_option("display.width", 260)
    pd.set_option("display.max_rows", 400)
    cols = ["ticker", "spot", "expiry", "dte", "atm_iv", "put90_iv", "call110_iv", "skew_90_110", "straddle_pct",
            "put90_pct", "call110_pct", "call120_pct", "rv20", "rv60", "rv252", "iv_rv60"]
    print(df[cols].round(2).to_string())


if __name__ == "__main__":
    main()
