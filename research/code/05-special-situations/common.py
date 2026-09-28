"""Shared helpers for track 05 (special situations & alternative markets).

All scripts write small, human-readable outputs to ./output/ and cache raw
downloads under the session scratchpad (SCRATCH) so re-runs are cheap.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
OUT.mkdir(exist_ok=True)
SCRATCH = Path(os.environ.get(
    "TRACK05_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/05-special-situations",
))
SCRATCH.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "ResearchBot research@example.com"}


def get_json(url: str, params: dict | None = None, sleep: float = 0.12, retries: int = 4, timeout: int = 30):
    """GET with polite pacing and simple exponential back-off."""
    for i in range(retries):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout)
            if r.status_code == 429:
                time.sleep(2 ** i)
                continue
            r.raise_for_status()
            time.sleep(sleep)
            return r.json()
        except Exception:  # noqa: BLE001
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))
    return None


def fred(series_id: str) -> pd.Series:
    """Download a FRED series via the public CSV endpoint (cached)."""
    cache = SCRATCH / f"fred_{series_id}.csv"
    if not cache.exists() or time.time() - cache.stat().st_mtime > 86400:
        r = requests.get("https://fred.stlouisfed.org/graph/fredgraph.csv", params={"id": series_id}, headers=UA, timeout=60)
        r.raise_for_status()
        cache.write_text(r.text)
    df = pd.read_csv(cache)
    date_col = df.columns[0]
    s = pd.to_numeric(df[series_id], errors="coerce")
    s.index = pd.to_datetime(df[date_col])
    return s.dropna()


def yf_close(tickers, start="1990-01-01", auto_adjust=True) -> pd.DataFrame:
    import yfinance as yf

    df = yf.download(tickers, start=start, auto_adjust=auto_adjust, progress=False)["Close"]
    if isinstance(df, pd.Series):
        df = df.to_frame(tickers if isinstance(tickers, str) else tickers[0])
    return df


def perf_stats(px: pd.Series, rf_daily: pd.Series | None = None, periods: int = 252) -> dict:
    """CAGR, vol, Sharpe (vs rf if given), max drawdown, monthly skew/kurtosis, worst month."""
    px = px.dropna()
    r = px.pct_change().dropna()
    yrs = (px.index[-1] - px.index[0]).days / 365.25
    cagr = (px.iloc[-1] / px.iloc[0]) ** (1 / yrs) - 1
    vol = r.std() * np.sqrt(periods)
    if rf_daily is not None:
        ex = (r - rf_daily.reindex(r.index).ffill().fillna(0)).dropna()
    else:
        ex = r
    sharpe = ex.mean() / r.std() * np.sqrt(periods) if r.std() > 0 else np.nan
    dd = (px / px.cummax() - 1).min()
    m = px.resample("ME").last().pct_change().dropna()
    return {
        "start": str(px.index[0].date()),
        "end": str(px.index[-1].date()),
        "years": round(yrs, 1),
        "CAGR_%": round(100 * cagr, 2),
        "vol_%": round(100 * vol, 2),
        "sharpe": round(float(sharpe), 2),
        "maxDD_%": round(100 * dd, 1),
        "monthly_skew": round(float(m.skew()), 2),
        "monthly_exkurt": round(float(m.kurt()), 2),
        "worst_month_%": round(100 * float(m.min()), 1),
        "best_month_%": round(100 * float(m.max()), 1),
    }


def save_json(obj, name: str):
    p = OUT / name
    p.write_text(json.dumps(obj, indent=2, default=str))
    return p
