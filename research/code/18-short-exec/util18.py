"""Shared helpers for track 18 (short-horizon execution, sizing, paper trading).

Conventions
-----------
* Seeds are fixed (SEED plus a per-script offset); every simulation is vectorised numpy.
* Results go to research/code/18-short-exec/results/ as CSV + Markdown twins.
* Downloaded market data are cached as parquet/CSV in the scratchpad (not in the repo).
* "R" = the planned loss at the stop (stop-based trades) or the premium (defined-risk trades).
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
os.makedirs(RESULTS, exist_ok=True)

SCRATCH = os.environ.get(
    "T18_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/18-short-exec")
os.makedirs(SCRATCH, exist_ok=True)

SEED = 20260928
TRADING_DAYS = 252
RF_ANNUAL = 0.042          # 3-month T-bill investment yield, 28 Sep 2026 (00-SYNTHESIS §4, track 12 m8)

# Reusable code from earlier tracks -------------------------------------------------
MATH03 = os.path.normpath(os.path.join(HERE, "..", "03-math"))
CAL10 = os.path.normpath(os.path.join(HERE, "..", "10-calibration"))


def import_track03():
    """Import track 03's sizing_rule without clobbering this package's modules."""
    if MATH03 not in sys.path:
        sys.path.insert(0, MATH03)
    import sizing_rule as sr03  # noqa: E402
    return sr03


def import_track10():
    if CAL10 not in sys.path:
        sys.path.append(CAL10)
    import bayes  # noqa: E402
    import ledger  # noqa: E402
    import overfitting  # noqa: E402
    import scoring  # noqa: E402
    return dict(bayes=bayes, ledger=ledger, overfitting=overfitting, scoring=scoring)


# Formatting -------------------------------------------------------------------------
def to_markdown(df: pd.DataFrame, index: bool = False, floatfmt: str = "{:.3g}") -> str:
    d = df.reset_index() if index else df
    cols = [str(c) for c in d.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for row in d.itertuples(index=False):
        cells = []
        for v in row:
            if isinstance(v, (float, np.floating)):
                cells.append("n/a" if np.isnan(v) else floatfmt.format(v))
            else:
                cells.append(str(v))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def save_table(df: pd.DataFrame, stem: str, index: bool = False, floatfmt: str = "{:.3g}"):
    df.to_csv(os.path.join(RESULTS, f"{stem}.csv"), index=index)
    with open(os.path.join(RESULTS, f"{stem}.md"), "w") as fh:
        fh.write(to_markdown(df, index=index, floatfmt=floatfmt))
        fh.write("\n")
    return df


def pct(x, d=1):
    return f"{100 * x:.{d}f}%"


# Market data (cached) -------------------------------------------------------------
def load_daily(tickers, start="2005-01-01", end="2026-09-28", auto_adjust=True, tag="daily"):
    """Daily OHLCV from yfinance, cached in the scratchpad.  Returns {ticker: DataFrame}."""
    import yfinance as yf
    cache = os.path.join(SCRATCH, f"{tag}_{'adj' if auto_adjust else 'raw'}.pkl")
    have = {}
    if os.path.exists(cache):
        have = pd.read_pickle(cache)
    missing = [t for t in tickers if t not in have]
    if missing:
        raw = yf.download(missing, start=start, end=end, auto_adjust=auto_adjust,
                          progress=False, group_by="ticker", threads=True)
        for t in missing:
            try:
                df = raw[t].dropna(how="all") if len(missing) > 1 else raw.dropna(how="all")
            except KeyError:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(-1)
            df = df.dropna(subset=["Open", "High", "Low", "Close"])
            if len(df) > 50:
                have[t] = df
        pd.to_pickle(have, cache)
    return {t: have[t] for t in tickers if t in have}
