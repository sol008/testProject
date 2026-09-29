"""Shared helpers for track 21: how the holding-period cap (60 / 90 / 120 calendar days) changes the
existing modules' expected returns.

Re-uses the cached data and engines of earlier tracks (nothing is re-downloaded):
  * track 13 (`common13`): ^GSPC total-return panel (Shiller D/P before 1988, ^SP500TR after), SPY with
    dividend-adjusted opens, ^VIX, per-session T-bills, the non-overlapping trade engine `run_rule`.
  * track 14 (`optmodel`, `spreadsim`): the synthetic SPX option surface calibrated to CBOE indices.
  * track 17 (`event_lists17`, `lib17`): the hand-curated de-escalation and oil-shock event lists.

Conventions used throughout track 21
  * A cap of 60 / 90 / 120 calendar days is read as 42 / 63 / 84 trading sessions (252 sessions a year).
  * "Next open" = the open of the session after the signal close (SPY, dividend-adjusted).  ^GSPC opens are
    stale before the 2000s, so pre-1993 S&P tests enter at the next close.
  * Forward-looking planning uses T-bills at 4.2% a year and a forward S&P total return of 3-6% a year
    (CAPE ~41; central 4.5%).
  * kappa = 0.5 shrinks the edge (event mean minus placebo mean) halfway toward zero.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
RESULTS.mkdir(exist_ok=True)
SCRATCH = Path("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/21-duration")
SCRATCH.mkdir(parents=True, exist_ok=True)
CODE = HERE.parent
for sub in ("13-short-index", "14-short-options", "17-short-macro"):
    p = str(CODE / sub)
    if p not in sys.path:
        sys.path.insert(0, p)

CAPS = {60: 42, 90: 63, 120: 84}          # calendar-day cap -> trading sessions
BILLS_FWD = 0.042                          # T-bill yield used for forward planning
EQ_FWD = (0.03, 0.045, 0.06)               # forward S&P total return (low, central, high) at CAPE ~41
KAPPA = 0.5
RNG_SEED = 21


def save(df: pd.DataFrame, name: str, index: bool = False) -> Path:
    p = RESULTS / f"{name}.csv"
    df.to_csv(p, index=index, float_format="%.6g")
    return p


def placebo_p(obs: float, sims: np.ndarray) -> float:
    """Two-sided p of `obs` against a null distribution of simulated means (centred on its own mean)."""
    m = sims.mean()
    return float(np.mean(np.abs(sims - m) >= abs(obs - m) - 1e-15))


def sidak(p: float, n: int) -> float:
    return float(1 - (1 - p) ** n)


def years(a, b) -> float:
    return (pd.Timestamp(b) - pd.Timestamp(a)).days / 365.25


def fmt_pct(x, nd=2):
    return "n/a" if x is None or not np.isfinite(x) else f"{100 * x:+.{nd}f}%"
