"""Shared helpers for track 04 (derivatives, leverage, convexity).

Data sources (all public):
  * Yahoo Finance via yfinance (index levels, ETFs, vol indices)
  * CBOE public CSVs (VIX family, strategy benchmark indices)
  * FRED CSV (T-bill, 1y Treasury, Moody's Baa-10y spread, HY OAS (last 3y only))

Everything is cached under DATA_DIR so the scripts are reproducible offline
after the first run.  Set env var TRACK04_DATA to override the cache folder.
"""
from __future__ import annotations

import io
import os
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from scipy.stats import norm

warnings.filterwarnings("ignore")

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
OUT.mkdir(exist_ok=True)
DATA_DIR = Path(os.environ.get(
    "TRACK04_DATA",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/04-derivatives/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Last fully settled close used for all studies (run date 2026-09-28).
END_DATE = os.environ.get("TRACK04_END", "2026-09-25")


# --------------------------------------------------------------------------
# Data loaders
# --------------------------------------------------------------------------
def _cache(name: str) -> Path:
    return DATA_DIR / f"{name}.csv"


def yf_close(ticker: str, start: str = "1927-01-01", field: str = "Close",
             refresh: bool = False) -> pd.Series:
    """Daily close (unadjusted 'Close' or 'Adj Close') from Yahoo, cached."""
    import yfinance as yf
    safe = ticker.replace("^", "IDX_").replace("=", "_").replace("-", "_")
    p = _cache(f"yf_{safe}")
    if p.exists() and not refresh:
        df = pd.read_csv(p, index_col=0, parse_dates=True)
    else:
        df = None
        for attempt in range(3):
            try:
                df = yf.download(ticker, start=start, progress=False,
                                 auto_adjust=False, threads=False)
                if len(df):
                    break
            except Exception:  # pragma: no cover - network flakiness
                time.sleep(2)
        if df is None or len(df) == 0:
            raise RuntimeError(f"no data for {ticker}")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.to_csv(p)
    s = df[field].astype(float)
    s.index = pd.to_datetime(s.index).tz_localize(None)
    s = s[~s.index.duplicated()].sort_index()
    return s.loc[:END_DATE].dropna().rename(ticker)


def yf_ohlc(ticker: str, start: str = "1927-01-01") -> pd.DataFrame:
    import yfinance as yf
    safe = ticker.replace("^", "IDX_").replace("=", "_").replace("-", "_")
    p = _cache(f"yf_{safe}")
    if not p.exists():
        yf_close(ticker, start=start)
    df = pd.read_csv(p, index_col=0, parse_dates=True)
    df.index = pd.to_datetime(df.index).tz_localize(None)
    return df.loc[:END_DATE]


def cboe(symbol: str) -> pd.Series:
    """CBOE daily history CSV (close column)."""
    p = _cache(f"cboe_{symbol}")
    if not p.exists():
        url = f"https://cdn.cboe.com/api/global/us_indices/daily_prices/{symbol}_History.csv"
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        p.write_text(r.text)
    df = pd.read_csv(p)
    df.columns = [c.strip().upper() for c in df.columns]
    date_col = df.columns[0]
    df[date_col] = pd.to_datetime(df[date_col], format="mixed")
    df = df.set_index(date_col).sort_index()
    col = "CLOSE" if "CLOSE" in df.columns else [c for c in df.columns if c != date_col][-1]
    s = pd.to_numeric(df[col], errors="coerce").dropna()
    s = s[~s.index.duplicated()]
    return s.loc[:END_DATE].rename(symbol)


def fred(series_id: str) -> pd.Series:
    p = _cache(f"fred_{series_id}")
    if not p.exists():
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        p.write_text(r.text)
    df = pd.read_csv(p)
    df.columns = ["date", series_id]
    df["date"] = pd.to_datetime(df["date"])
    s = pd.to_numeric(df.set_index("date")[series_id], errors="coerce").dropna()
    return s.loc[:END_DATE]


# --------------------------------------------------------------------------
# Black-Scholes helpers (European, continuous dividend yield)
# --------------------------------------------------------------------------
def bs_price(S, K, T, r, q, sigma, kind="call"):
    S, K, T, r, q, sigma = map(np.asarray, (S, K, T, r, q, sigma))
    T = np.maximum(T, 1e-10)
    sigma = np.maximum(sigma, 1e-6)
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    if kind == "call":
        return S * np.exp(-q * T) * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
    return K * np.exp(-r * T) * norm.cdf(-d2) - S * np.exp(-q * T) * norm.cdf(-d1)


def bs_delta(S, K, T, r, q, sigma, kind="call"):
    T = np.maximum(T, 1e-10)
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    if kind == "call":
        return np.exp(-q * T) * norm.cdf(d1)
    return np.exp(-q * T) * (norm.cdf(d1) - 1.0)


def bs_iv(price, S, K, T, r, q, kind="call", lo=1e-4, hi=5.0, tol=1e-7):
    """Implied vol by bisection (vectorised-safe scalar)."""
    intrinsic = max(0.0, (S * np.exp(-q * T) - K * np.exp(-r * T)) if kind == "call"
                    else (K * np.exp(-r * T) - S * np.exp(-q * T)))
    if not np.isfinite(price) or price <= intrinsic + 1e-12:
        return np.nan
    a, b = lo, hi
    for _ in range(200):
        m = 0.5 * (a + b)
        pm = bs_price(S, K, T, r, q, m, kind)
        if pm > price:
            b = m
        else:
            a = m
        if b - a < tol:
            break
    return 0.5 * (a + b)


# --------------------------------------------------------------------------
# Misc stats helpers
# --------------------------------------------------------------------------
def cagr(equity: pd.Series) -> float:
    equity = equity.dropna()
    yrs = (equity.index[-1] - equity.index[0]).days / 365.25
    return (equity.iloc[-1] / equity.iloc[0]) ** (1 / yrs) - 1


def max_drawdown(equity: pd.Series) -> float:
    return float((equity / equity.cummax() - 1).min())


def fmt_pct(x, nd=1):
    return "n/a" if x is None or not np.isfinite(x) else f"{100 * x:.{nd}f}%"


def save_table(df: pd.DataFrame, name: str, floatfmt: str = "%.4f"):
    df.to_csv(OUT / f"{name}.csv", float_format=floatfmt)
    return OUT / f"{name}.csv"
