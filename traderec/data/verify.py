"""Two-source close check (docs/INTERFACES.md §1).

Design v3.2 §3 (M1) computes signals "on two-source-checked data". Track 13 §11.1 says never to trade on
"a two-source close mismatch above 0.1%" (constitution ``data.two_source_tolerance``). When there is no
second source the check fails closed: new entries are blocked, and the pipeline decides what else to do.
"""
from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

import pandas as pd

from traderec.data.providers import DataProvider, iso_date, session_index

__all__ = ["verify_close"]

# Float slack, so a difference exactly at the tolerance passes; only differences above it fail.
_REL_EPS = 1e-12


def verify_close(provider: DataProvider, bars: pd.DataFrame, ticker: str, date: str,
                 tolerance: float) -> dict:
    """Cross-check the close of `ticker` on `date` in `bars` against `provider.second_source_close`.

    Returns {"ok", "primary", "secondary", "source", "reason"}:

    * primary: the close in `bars` on `date`, or NaN when `bars` has no usable close that day;
    * secondary, source: the second-source close and its name, or None for both;
    * ok: True only when both closes exist and |secondary / primary - 1| <= tolerance. A mismatch above
      the tolerance, a missing second source and a missing primary close all give ok=False;
    * reason: a stable code, then ": ", then details. The codes are "match", "mismatch",
      "no_second_source" and "no_primary_close".

    Data problems never raise: a provider that raises, or returns an unusable close, counts as no second
    source. Only an unparseable `date` raises ValueError. With no primary close the second source is not
    queried.
    """
    day = iso_date(date)
    primary = _primary_close(bars, day)
    if primary is None:
        return _result(False, math.nan, None, None,
                       f"no_primary_close: no {ticker} close on {day} in the primary bars")
    second = _second_close(provider, ticker, day)
    if second is None:
        return _result(False, primary, None, None,
                       f"no_second_source: no second-source close for {ticker} on {day} (fail closed)")
    secondary, source = second
    diff = abs(secondary / primary - 1.0)
    detail = f"{source} {secondary:.4f} vs primary {primary:.4f} for {ticker} on {day}, diff {diff:.4%}"
    if diff <= tolerance + _REL_EPS:
        return _result(True, primary, secondary, source, f"match: {detail} <= tolerance {tolerance:.4%}")
    return _result(False, primary, secondary, source, f"mismatch: {detail} > tolerance {tolerance:.4%}")


def _primary_close(bars: pd.DataFrame, day: str) -> float | None:
    """The last finite, positive close in `bars` on `day`, or None."""
    try:
        close = pd.to_numeric(bars["close"], errors="coerce")
        index = session_index(close.index)
    except (KeyError, TypeError, ValueError):
        return None
    values = close.to_numpy(dtype=float)[index == pd.Timestamp(day)]
    usable = [float(v) for v in values if math.isfinite(v) and v > 0]
    return usable[-1] if usable else None


def _second_close(provider: DataProvider, ticker: str, day: str) -> tuple[float, str] | None:
    """(close, source) from the provider, or None when it is missing, unusable or the provider raised."""
    try:
        found = provider.second_source_close(ticker, day)
    except Exception:  # noqa: BLE001 - a failing provider means no second source (fail closed)
        return None
    if not isinstance(found, Mapping):
        return None
    try:
        value = float(found.get("close"))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value) or value <= 0:
        return None
    return value, str(found.get("source") or "unknown")


def _result(ok: bool, primary: float, secondary: float | None, source: str | None,
            reason: str) -> dict[str, Any]:
    return {"ok": ok, "primary": primary, "secondary": secondary, "source": source, "reason": reason}
