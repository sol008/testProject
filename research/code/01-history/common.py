"""Shared data loaders for track 01 (greatest trades & blowups).

All downloads are cached under CACHE_DIR so that the analysis scripts are
reproducible and do not hammer the data providers.  Re-running with the
cache deleted re-downloads everything (results may differ slightly as
providers revise data, e.g. Yahoo dividend adjustments).

Sources
-------
* Yahoo Finance via yfinance (daily OHLC; "Close" is split-adjusted but NOT
  dividend-adjusted when auto_adjust=False; "Adj Close" includes dividends).
* FRED CSV endpoint  https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES
* Robert Shiller's monthly S&P composite data  http://www.econ.yale.edu/~shiller/data/ie_data.xls
"""
from __future__ import annotations

import io
import os
from pathlib import Path

import numpy as np
import pandas as pd
import requests

CACHE_DIR = Path(os.environ.get(
    "HIST_CACHE",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/01-history/cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR = Path(__file__).resolve().parent / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "ResearchBot research@example.com"}


def yf_daily(ticker: str, refresh: bool = False) -> pd.DataFrame:
    """Daily bars for `ticker` (max history). Columns: Open High Low Close AdjClose Volume."""
    f = CACHE_DIR / f"yf_{ticker.replace('^', 'IDX_').replace('=', '_').replace('/', '_')}.csv"
    if f.exists() and not refresh:
        return pd.read_csv(f, index_col=0, parse_dates=True)
    import yfinance as yf
    d = yf.download(ticker, period="max", auto_adjust=False, progress=False)
    if isinstance(d.columns, pd.MultiIndex):
        d.columns = d.columns.get_level_values(0)
    d = d.rename(columns={"Adj Close": "AdjClose"})
    d.index = pd.to_datetime(d.index).tz_localize(None)
    d = d[[c for c in ["Open", "High", "Low", "Close", "AdjClose", "Volume"] if c in d.columns]]
    d = d.dropna(subset=["Close"])
    d.to_csv(f)
    return d


def fred(series: str, refresh: bool = False) -> pd.Series:
    f = CACHE_DIR / f"fred_{series}.csv"
    if not f.exists() or refresh:
        r = requests.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}", headers=UA, timeout=60)
        r.raise_for_status()
        f.write_bytes(r.content)
    s = pd.read_csv(f)
    s.columns = ["date", series]
    s["date"] = pd.to_datetime(s["date"])
    s[series] = pd.to_numeric(s[series], errors="coerce")
    return s.set_index("date")[series].dropna()


def shiller(refresh: bool = False) -> pd.DataFrame:
    """Monthly Shiller data: P (price, monthly avg of daily closes), D (annualised dividend),
    E, CPI, GS10, CAPE.  Adds a nominal and real total-return index (dividends reinvested monthly)."""
    f = CACHE_DIR / "ie_data.xls"
    if not f.exists() or refresh:
        r = requests.get("http://www.econ.yale.edu/~shiller/data/ie_data.xls", headers=UA, timeout=120)
        r.raise_for_status()
        f.write_bytes(r.content)
    raw = pd.read_excel(f, sheet_name="Data", skiprows=7, header=0)
    raw = raw.rename(columns={raw.columns[0]: "Date"})
    raw = raw[pd.to_numeric(raw["Date"], errors="coerce").notna()].copy()
    # Shiller encodes October as 1871.1 (i.e. .1 = October), so parse via string with 2 decimals
    ds = raw["Date"].astype(float).map(lambda x: f"{x:.2f}")
    year = ds.str.slice(0, 4).astype(int)
    month = ds.str.slice(5, 7).astype(int)
    idx = pd.to_datetime(dict(year=year, month=month, day=1))
    out = pd.DataFrame({
        "P": pd.to_numeric(raw["P"], errors="coerce").values,
        "D": pd.to_numeric(raw["D"], errors="coerce").values,
        "E": pd.to_numeric(raw["E"], errors="coerce").values,
        "CPI": pd.to_numeric(raw["CPI"], errors="coerce").values,
    }, index=idx)
    # CAPE column name varies across file versions
    cape_col = [c for c in raw.columns if str(c).strip().upper() in ("CAPE", "P/E10", "CAPE ")]
    if cape_col:
        out["CAPE"] = pd.to_numeric(raw[cape_col[0]], errors="coerce").values
    out = out.dropna(subset=["P", "CPI"])
    # dividends: forward-fill the latest months where D is not yet reported
    out["D"] = out["D"].ffill()
    ret = (out["P"] + out["D"] / 12.0) / out["P"].shift(1)
    out["TR"] = ret.fillna(1.0).cumprod()
    out["TR_real"] = out["TR"] / out["CPI"] * out["CPI"].iloc[-1]
    out["P_real"] = out["P"] / out["CPI"] * out["CPI"].iloc[-1]
    return out


def drawdown(series: pd.Series) -> pd.Series:
    return series / series.cummax() - 1.0


def max_drawdown(series: pd.Series) -> float:
    return float(drawdown(series).min())


def drawdown_episodes(series: pd.Series, threshold: float = -0.5) -> list[dict]:
    """Peak-to-trough episodes whose depth is <= threshold (e.g. -0.5 = 50% decline).
    An episode starts at an all-time high and ends when a new all-time high is made."""
    s = series.dropna()
    peak_val, peak_date = s.iloc[0], s.index[0]
    trough_val, trough_date = peak_val, peak_date
    eps = []
    for dt, v in s.items():
        if v >= peak_val:
            depth = trough_val / peak_val - 1
            if depth <= threshold:
                eps.append(dict(peak=peak_date, trough=trough_date, recovered=dt, depth=depth))
            peak_val, peak_date, trough_val, trough_date = v, dt, v, dt
        elif v < trough_val:
            trough_val, trough_date = v, dt
    depth = trough_val / peak_val - 1
    if depth <= threshold:
        eps.append(dict(peak=peak_date, trough=trough_date, recovered=pd.NaT, depth=depth))
    return eps


def fmt_mult(x: float) -> str:
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "n/a"
    return f"{x:,.1f}x" if x < 1000 else f"{x:,.0f}x"
