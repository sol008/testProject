"""Shared helpers for track 08 (current environment snapshot, 2026-09-28).

All raw data are cached to SCRATCH (temp dir); code lives in research/code/08-current/.
Re-running the fetch_* scripts refreshes the cache; analyze_*.py scripts read from it.
"""
from __future__ import annotations

import io
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

SCRATCH = Path(os.environ.get(
    "TRACK08_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/08-current",
))
SCRATCH.mkdir(parents=True, exist_ok=True)
ASOF = pd.Timestamp(os.environ.get("TRACK08_ASOF", "2026-09-28"))

UA = {"User-Agent": "ResearchBot research@example.com"}


def fred(series_id: str, start: str = "1950-01-01", retries: int = 3) -> pd.Series:
    """Download a FRED series via the public graph CSV endpoint."""
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd={start}"
    last_err = None
    for i in range(retries):
        try:
            r = requests.get(url, timeout=60, headers=UA)
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))
            df.columns = ["date", series_id]
            df["date"] = pd.to_datetime(df["date"])
            s = pd.to_numeric(df[series_id], errors="coerce")
            s.index = df["date"]
            return s.dropna()
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"FRED {series_id} failed: {last_err}")


def pct_rank(series: pd.Series, value: float | None = None) -> float:
    """Percentile (0-100) of `value` (default: last obs) within the full history of `series`."""
    s = series.dropna()
    if s.empty:
        return np.nan
    v = s.iloc[-1] if value is None else value
    return float((s <= v).mean() * 100.0)


def last_on_or_before(s: pd.Series, date) -> float:
    s = s.dropna()
    s = s[s.index <= pd.Timestamp(date)]
    return float(s.iloc[-1]) if len(s) else np.nan


def change_over(s: pd.Series, days: int = 365, pct: bool = True) -> float:
    s = s.dropna()
    if s.empty:
        return np.nan
    end = s.index[-1]
    prev = last_on_or_before(s, end - pd.Timedelta(days=days))
    cur = float(s.iloc[-1])
    if np.isnan(prev):
        return np.nan
    return (cur / prev - 1.0) * 100.0 if pct else cur - prev
