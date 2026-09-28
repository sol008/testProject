"""Utilities to download and parse Kenneth French Data Library CSV files.

All returns in the library are in PERCENT. Functions here convert to decimals.
Reproducible: files are cached under DATA_DIR; delete the cache to refresh.
"""
from __future__ import annotations

import io
import os
import re
import zipfile

import numpy as np
import pandas as pd
import requests

BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/{name}_CSV.zip"
DATA_DIR = os.environ.get(
    "KF_DATA_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"),
)


def _download(name: str) -> str:
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, f"{name}.csv")
    if os.path.exists(path):
        return path
    r = requests.get(BASE.format(name=name), timeout=60)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    inner = zf.namelist()[0]
    with open(path, "wb") as fh:
        fh.write(zf.read(inner))
    return path


def read_sections(name: str) -> dict[str, pd.DataFrame]:
    """Return {section_title: DataFrame} for a Ken French CSV.

    Sections are detected by a header row starting with ',' preceded by a
    title line. Index is parsed as YYYYMM (monthly), YYYYMMDD (daily) or
    YYYY (annual). Values are returned in DECIMALS (divided by 100) for
    return sections; other sections (firm counts, sizes) are left raw.
    """
    path = _download(name)
    with open(path, "r", encoding="latin-1") as fh:
        lines = fh.read().splitlines()
    sections: dict[str, pd.DataFrame] = {}
    title = "main"
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.startswith(",") or line.startswith(" ,"):
            cols = [c.strip() for c in line.split(",")[1:]]
            rows, idx = [], []
            j = i + 1
            while j < n and re.match(r"^\s*\d{4,8}\s*,", lines[j]):
                parts = [p.strip() for p in lines[j].split(",")]
                idx.append(parts[0])
                rows.append([float(x) if x not in ("", None) else np.nan for x in parts[1:]])
                j += 1
            df = pd.DataFrame(rows, index=idx, columns=cols[: len(rows[0])] if rows else cols)
            df = df.replace([-99.99, -999.0], np.nan)
            k = idx[0] if idx else ""
            if len(k) == 6:
                df.index = pd.PeriodIndex([f"{s[:4]}-{s[4:]}" for s in idx], freq="M")
                freq = "monthly"
            elif len(k) == 8:
                df.index = pd.to_datetime(idx, format="%Y%m%d")
                freq = "daily"
            else:
                df.index = pd.PeriodIndex(idx, freq="Y")
                freq = "annual"
            key = f"{title.strip()} [{freq}]" if title.strip() else f"section{len(sections)} [{freq}]"
            if key in sections:
                key = key + f"#{len(sections)}"
            sections[key] = df
            i = j
            title = ""
            continue
        if line.strip() and not re.match(r"^\s*\d", line):
            title = line.strip()
        i += 1
    return sections


def monthly_returns(name: str, section_contains: str | None = None) -> pd.DataFrame:
    """First monthly section (or the first whose title contains the text), in decimals."""
    secs = read_sections(name)
    for k, df in secs.items():
        if not k.endswith("[monthly]"):
            continue
        if section_contains is None or section_contains.lower() in k.lower():
            return df / 100.0
    raise KeyError(f"No monthly section matching {section_contains!r} in {name}: {list(secs)}")


def daily_returns(name: str) -> pd.DataFrame:
    secs = read_sections(name)
    for k, df in secs.items():
        if k.endswith("[daily]"):
            return df / 100.0
    raise KeyError(f"No daily section in {name}")


# ---------------------------------------------------------------- statistics

def max_drawdown(r: pd.Series) -> tuple[float, object, object, object]:
    """Max drawdown of compounded series (1+r).cumprod(); returns (mdd, peak, trough, recovery)."""
    w = (1 + r.fillna(0)).cumprod()
    peak = w.cummax()
    dd = w / peak - 1
    trough = dd.idxmin()
    mdd = dd.min()
    pk = w.loc[:trough].idxmax()
    after = w.loc[trough:]
    rec = after[after >= w.loc[pk]]
    recovery = rec.index[0] if len(rec) else None
    return float(mdd), pk, trough, recovery


def stats(r: pd.Series, periods_per_year: int = 12) -> dict:
    r = r.dropna()
    n = len(r)
    if n == 0:
        return {}
    mu = r.mean() * periods_per_year
    sd = r.std(ddof=1) * np.sqrt(periods_per_year)
    t = r.mean() / (r.std(ddof=1) / np.sqrt(n))
    cagr = (1 + r).prod() ** (periods_per_year / n) - 1
    mdd, pk, tr, rec = max_drawdown(r)
    roll12 = (1 + r).rolling(periods_per_year).apply(np.prod, raw=True) - 1 if n >= periods_per_year else pd.Series(dtype=float)
    return {
        "start": str(r.index[0]),
        "end": str(r.index[-1]),
        "n": n,
        "ann_mean": mu,
        "ann_vol": sd,
        "sharpe": mu / sd if sd > 0 else np.nan,
        "t_stat": t,
        "cagr": cagr,
        "max_dd": mdd,
        "dd_peak": str(pk),
        "dd_trough": str(tr),
        "dd_recovered": str(rec) if rec is not None else "not yet",
        "worst_period": r.min(),
        "worst_period_date": str(r.idxmin()),
        "worst_12m": roll12.min() if len(roll12) else np.nan,
        "pct_pos_periods": (r > 0).mean(),
    }


def fmt_pct(x: float, nd: int = 1) -> str:
    return "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{100 * x:.{nd}f}%"
