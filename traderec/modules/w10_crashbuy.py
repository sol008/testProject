"""W10 — uptrend crash-day buy: policy module with a 90-day exception (design v3.3 §3 "W10"; tracks 17, 21-23).

Signal (after the close, unrounded official closes): the S&P 500 closes 3.00% or more below the prior close,
the prior close was above its 200-day average (computed through the prior close), and no other S&P close in the
prior 20 sessions fell 3.00% or more. Entry: SPY at the next open. Exit: the open of the last NYSE session dated
on or before entry + 90 calendar days. No stop, no VIX void, no all-time-high exit.
"""
from __future__ import annotations

import math
from datetime import timedelta
from typing import Any

import pandas as pd

from traderec.market_calendar import is_trading_day, next_trading_day


def _f(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def w10_signal(spx: pd.DataFrame, date: str, cfg_w10: dict, *, close_override: float | None = None) -> dict:
    """The entry test on ^GSPC closes up to and including `date`.

    `close_override` re-runs the test with a second source's close for `date` (the two-source rule: if the
    sources disagree on any condition there is no signal). Returns {"signal", "ret", "close", "prev_close",
    "sma_prev", "prior_shock", "reasons"}; `reasons` lists the conditions that held when it fires and the ones
    that failed otherwise.
    """
    ts = pd.Timestamp(date)
    drop = float(cfg_w10["drop_pct"])
    n_sma = int(cfg_w10["sma_trend"])
    n_decl = int(cfg_w10["decluster_sessions"])
    out: dict[str, Any] = {"signal": False, "ret": None, "close": None, "prev_close": None, "sma_prev": None,
                           "prior_shock": None, "reasons": []}
    closes = spx["close"].dropna().astype(float).sort_index().loc[:ts]
    if closes.empty or closes.index[-1] != ts:
        out["reasons"] = [f"no S&P 500 close on {ts.date()}"]
        return out
    if len(closes) < n_sma + 1:
        out["reasons"] = ["insufficient history"]
        return out
    close = _f(close_override) if close_override is not None else float(closes.iloc[-1])
    prev = float(closes.iloc[-2])
    sma_prev = float(closes.iloc[-(n_sma + 1):-1].mean())
    ret = close / prev - 1.0
    window = closes.iloc[-(n_decl + 2):-1].pct_change().dropna()      # the n_decl sessions before `date`
    shocks = window[window <= drop]
    out.update(ret=ret, close=close, prev_close=prev, sma_prev=sma_prev,
               prior_shock=shocks.index[-1].strftime("%Y-%m-%d") if len(shocks) else None)
    tests = [
        (ret <= drop, f"S&P 500 {ret:+.3%} (needs {drop:+.2%} or worse)"),
        (prev > sma_prev, f"prior close {prev:,.2f} vs its {n_sma}-day average {sma_prev:,.2f}"),
        (len(shocks) == 0, f"no other {drop:+.0%} day in the prior {n_decl} sessions"
         + (f" (last: {out['prior_shock']})" if len(shocks) else "")),
    ]
    out["signal"] = all(ok for ok, _ in tests)
    out["reasons"] = [m for ok, m in tests if ok] if out["signal"] else [m for ok, m in tests if not ok]
    return out


def w10_exit_date(entry_date: str, max_calendar_days: int) -> str:
    """The last NYSE session dated on or before entry + max_calendar_days (the calendar-exact time stop)."""
    d = (pd.Timestamp(entry_date) + pd.Timedelta(days=int(max_calendar_days))).date()
    while not is_trading_day(d):
        d -= timedelta(days=1)
    return d.isoformat()


def w10_exit_check(date: str, open_trade: dict, cfg_w10: dict, sessions: pd.DatetimeIndex | None = None) -> dict:
    """Queue the exit tonight when the next session is the planned exit session (or it has passed).

    `open_trade` needs "fill_date". Returns {"exit", "reason", "exit_date", "days_held", "sessions_held"}.
    """
    exit_date = open_trade.get("exit_date") or w10_exit_date(open_trade["fill_date"], cfg_w10["max_calendar_days"])
    nxt = next_trading_day(date).isoformat()
    days_held = (pd.Timestamp(date) - pd.Timestamp(open_trade["fill_date"])).days
    held = None
    if sessions is not None:
        held = int(((sessions >= pd.Timestamp(open_trade["fill_date"])) & (sessions <= pd.Timestamp(date))).sum())
    due = nxt >= exit_date
    return {"exit": bool(due), "reason": "calendar_stop" if due else None, "exit_date": exit_date,
            "days_held": days_held, "sessions_held": held}


def w10_kill_check(history: list[dict], nav: float, cfg_w10: dict) -> str | None:
    """The damage-limit kill switch (track 23 §2.5): a reason string when W10 must go back to the shadow ledger."""
    ks = cfg_w10.get("kill_switch") or {}
    worst = min((float(t["return"]) for t in history if t.get("return") is not None), default=0.0)
    if worst <= float(ks.get("single_trade_loss", -1.0)):
        return f"one W10 trade lost {worst:.1%} (limit {float(ks['single_trade_loss']):.0%})"
    pnl = sum(float(t.get("pnl") or 0.0) for t in history)
    limit = float(ks.get("cumulative_pnl_pct_nav", -1.0)) * nav
    if nav > 0 and pnl <= limit:
        return f"W10's cumulative realized P&L is ${pnl:,.0f} (limit ${limit:,.0f}, {ks['cumulative_pnl_pct_nav']:.1%} of NAV)"
    return None
