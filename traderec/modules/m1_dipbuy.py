"""M1 - ST-1: VIX-gated uptrend dip-buy on SPY (policy module).

Rule (design v3.2 §3 "M1"; track 13 §11.1), evaluated after the close of `date` on RAW (unadjusted) SPY
closes up to and including `date`:

* entry: close > SMA(sma_trend = 200), Wilder RSI(rsi_period = 2) < rsi_below (10), and the VIX close
  on `date` >= vix_min (20.00). Bought with a dollar market order at the next open.
* exit: the first close above SMA(exit_sma = 5) -> "exit_rule"; otherwise, once the position has been
  held `max_sessions` (20) sessions -> "time_stop". Either way the sell is a market order queued for the
  next open (session 21 for the time stop). No stop and no bracket.

ST-1b, the same entry rule without the VIX gate, is M1's shadow evidence set
(`traderec.modules.shadow.st1b_entry_check`); both call `dip_entry_check`.
"""
from __future__ import annotations

import math
from typing import Any

import pandas as pd

from traderec import indicators

# Sessions required BEFORE `date`: SMA200 must exist and the Wilder RSI seed must wash out
# (indicators.rsi_wilder needs >= 250 sessions).
MIN_HISTORY_SESSIONS = 250


def as_float(x: Any) -> float | None:
    """`x` as a plain float, or None when it is missing, NaN or infinite (keeps outputs JSON-safe)."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def closes_upto(close: pd.Series, date: pd.Timestamp) -> pd.Series:
    """Non-missing closes stamped on or before `date`, oldest first, as floats."""
    return close.dropna().sort_index().loc[:date].astype(float)


def value_on(series: pd.Series | None, date: pd.Timestamp) -> float | None:
    """The value stamped exactly `date` (e.g. the VIX close), or None when absent or NaN."""
    if series is None:
        return None
    try:
        v = series.loc[date]
    except KeyError:
        return None
    if isinstance(v, pd.Series):  # duplicated labels: take the last print
        v = v.iloc[-1] if len(v) else None
    return as_float(v)


def dip_entry_check(spy: pd.DataFrame, vix: pd.Series | None, date: str, cfg_m1: dict,
                    *, vix_gate: bool = True) -> dict:
    """ST-1 entry rule on raw SPY closes up to `date`; `vix_gate=False` gives ST-1b.

    Returns {"signal", "close", "sma200", "rsi2", "vix", "reasons"}. `reasons` explains `signal`: the
    conditions that held when it is True, the ones that failed when it is False. Fail-closed cases:

    * no SPY close stamped `date` -> ["no SPY close on <date>"];
    * fewer than MIN_HISTORY_SESSIONS (250) sessions before `date` -> exactly ["insufficient history"];
    * no VIX close stamped `date` (gated rule only) -> "vix missing" among the reasons.

    `sma200` and `rsi2` keep their contract names whatever `sma_trend` and `rsi_period` are set to.
    """
    ts = pd.Timestamp(date)
    vix_value = value_on(vix, ts)
    out: dict[str, Any] = {"signal": False, "close": None, "sma200": None, "rsi2": None,
                           "vix": vix_value, "reasons": []}

    close = closes_upto(spy["close"], ts)
    if close.empty or close.index[-1] != ts:
        out["reasons"] = [f"no SPY close on {ts.date()}"]
        return out
    if len(close) - 1 < MIN_HISTORY_SESSIONS:
        out["reasons"] = ["insufficient history"]
        return out

    n_trend, n_rsi = int(cfg_m1["sma_trend"]), int(cfg_m1["rsi_period"])
    rsi_below = float(cfg_m1["rsi_below"])
    c = float(close.iloc[-1])
    sma = as_float(indicators.sma(close, n_trend).iloc[-1])
    rsi = as_float(indicators.rsi_wilder(close, n_rsi).iloc[-1])
    out.update(close=c, sma200=sma, rsi2=rsi)

    passed: list[str] = []
    failed: list[str] = []
    if sma is None:
        failed.append(f"SMA{n_trend} undefined")
    elif c > sma:
        passed.append(f"close {c:.2f} > SMA{n_trend} {sma:.2f}")
    else:
        failed.append(f"close {c:.2f} <= SMA{n_trend} {sma:.2f} (no uptrend)")

    if rsi is None:
        failed.append(f"RSI{n_rsi} undefined")
    elif rsi < rsi_below:
        passed.append(f"RSI{n_rsi} {rsi:.2f} < {rsi_below:g}")
    else:
        failed.append(f"RSI{n_rsi} {rsi:.2f} >= {rsi_below:g} (no dip)")

    if vix_gate:
        vix_min = float(cfg_m1["vix_min"])
        if vix_value is None:
            failed.append("vix missing")
        elif vix_value >= vix_min:
            passed.append(f"VIX {vix_value:.2f} >= {vix_min:.2f}")
        else:
            failed.append(f"VIX {vix_value:.2f} < {vix_min:.2f} (volatility gate closed)")

    out["signal"] = not failed
    out["reasons"] = failed if failed else passed
    return out


def m1_entry_check(spy: pd.DataFrame, vix: pd.Series, date: str, cfg_m1: dict) -> dict:
    """M1 entry (ST-1, track 13 §11.1): close > SMA200, RSI2 < rsi_below and VIX close >= vix_min.

    Returns {"signal", "close", "sma200", "rsi2", "vix", "reasons"}; see `dip_entry_check`.
    """
    return dip_entry_check(spy, vix, date, cfg_m1, vix_gate=True)


def m1_exit_check(spy: pd.DataFrame, date: str, open_trade: dict, cfg_m1: dict) -> dict:
    """M1 exit (design §3 M1): first close > SMA5 -> "exit_rule"; else held >= max_sessions -> "time_stop".

    `sessions_held` counts SPY sessions from `open_trade["fill_date"]` (the fill day is session 1) to
    `date`, inclusive. The fill-day close already counts for the exit rule, as in track 13's next-open
    backtest. The time stop fires on the close of session `max_sessions`, so the sell fills at the open of
    session max_sessions + 1 (session 21).

    Returns {"exit", "reason", "sessions_held", "close", "sma5"}. Fail-safe cases return exit=False:
    no SPY close stamped `date` (close and sma5 stay None), or `date` before the fill (sessions_held 0).
    `open_trade["opened"]` is accepted when "fill_date" is absent.
    """
    ts = pd.Timestamp(date)
    fill_raw = open_trade.get("fill_date") or open_trade.get("opened")
    if not fill_raw:
        raise ValueError("m1_exit_check: open_trade has no 'fill_date'")
    fill = pd.Timestamp(fill_raw)

    close = closes_upto(spy["close"], ts)
    held = int((close.index >= fill).sum())
    out: dict[str, Any] = {"exit": False, "reason": None, "sessions_held": held, "close": None, "sma5": None}
    if close.empty or close.index[-1] != ts:
        return out

    c = float(close.iloc[-1])
    sma_exit = as_float(indicators.sma(close, int(cfg_m1["exit_sma"])).iloc[-1])
    out.update(close=c, sma5=sma_exit)
    if held < 1:
        return out
    if sma_exit is not None and c > sma_exit:
        out.update(exit=True, reason="exit_rule")
    elif held >= int(cfg_m1["max_sessions"]):
        out.update(exit=True, reason="time_stop")
    return out
