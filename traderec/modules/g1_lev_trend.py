"""G1 - leveraged index trend (design v4 §3 G1; tracks 26, 31): SSO on ^GSPC, QLD on ^NDX.

Per leg, after Friday's close, on two-source-checked index closes (unrounded): the index close against its 200-day
simple average of closes including that day. Enter when out and the close is >= 2% above the average; exit when in
and the close is >= 2% below it; otherwise hold the state (the band with hysteresis). The decision is made on the
Sunday run from the last NYSE session of the week (Friday, or Thursday in a holiday-shortened week); a mid-week
crossing waits. Data disagreement on a leg: no signal for that leg (its state is kept), the event is logged.
`below_sma_today` is the band-free daily check for Rule E (§3a.7; builder C2).
"""
from __future__ import annotations

import math
from typing import Any

import pandas as pd

from traderec.data.verify import verify_close
from traderec.market_calendar import iso, prev_trading_day

__all__ = ["below_sma_today", "g1_signal", "leg_check", "sma_snapshot"]


def _closes(bars: pd.DataFrame | pd.Series, asof: str) -> pd.Series:
    s = bars["close"] if isinstance(bars, pd.DataFrame) else bars
    s = s.dropna().astype(float).sort_index()
    return s.loc[: pd.Timestamp(asof)]


def sma_snapshot(bars: pd.DataFrame | pd.Series, asof: str, sma_days: int = 200,
                 close_override: float | None = None) -> dict[str, Any]:
    """The last close on or before `asof` and its `sma_days`-day average including that close.

    Returns {"date", "close", "sma", "pct_vs_sma", "n"}; `close` and `sma` are None with fewer than `sma_days`
    closes. `close_override` (a second source's close for `date`) replaces the last close in both numbers.
    """
    closes = _closes(bars, asof)
    if closes.empty:
        return {"date": None, "close": None, "sma": None, "pct_vs_sma": None, "n": 0}
    window = closes.iloc[-int(sma_days):].to_numpy(dtype=float).copy()
    close = float(window[-1])
    if close_override is not None:
        close = float(close_override)
        window[-1] = close
    if len(window) < int(sma_days):
        return {"date": iso(closes.index[-1]), "close": close, "sma": None, "pct_vs_sma": None, "n": int(len(window))}
    sma = float(window.mean())
    return {"date": iso(closes.index[-1]), "close": close, "sma": sma, "pct_vs_sma": close / sma - 1.0,
            "n": int(len(window))}


def last_session_before(decision_date: str) -> str:
    """The last NYSE session on or before `decision_date` (the Friday of a Sunday run, Thursday on a Good Friday)."""
    d = pd.Timestamp(decision_date).date()
    return iso(prev_trading_day(d + pd.Timedelta(days=1)))


def g1_signal(bars: pd.DataFrame | pd.Series, decision_date: str, prev_in: bool | None, cfg_sig: dict,
              *, close_override: float | None = None) -> dict[str, Any]:
    """One leg's weekly decision on the closes up to `decision_date` (the Sunday).

    `prev_in` is the leg's state (None at the first decision, which is then the band-free comparison). Returns
    {"signal", "in", "changed", "action", "date", "close", "sma200", "pct_vs_sma", "band", "reason"}: `signal` is
    False (state kept) when the week's last session has no close (stale or missing data) or the history is short.
    `action` is "enter", "exit" or None.
    """
    n, band = int(cfg_sig.get("sma_days", 200)), float(cfg_sig.get("band", 0.02))
    want = last_session_before(decision_date)
    snap = sma_snapshot(bars, decision_date, n, close_override)
    out: dict[str, Any] = {"signal": False, "in": prev_in, "changed": False, "action": None, "date": snap["date"],
                           "close": snap["close"], "sma200": snap["sma"], "pct_vs_sma": snap["pct_vs_sma"],
                           "band": band, "session": want, "reason": ""}
    if snap["date"] != want:
        out["reason"] = f"no close for the week's last session {want} (last bar {snap['date']}): state kept"
        return out
    if snap["sma"] is None:
        out["reason"] = f"insufficient history ({snap['n']} of {n} closes): state kept"
        return out
    pct = float(snap["pct_vs_sma"])
    if prev_in is None:
        new_in = pct > 0.0
        why = "first decision: close above its average" if new_in else "first decision: close below its average"
    elif not prev_in and pct >= band:
        new_in, why = True, f"out and close {pct:+.2%} vs the average (>= {band:+.0%}): enter"
    elif prev_in and pct <= -band:
        new_in, why = False, f"in and close {pct:+.2%} vs the average (<= {-band:+.0%}): exit"
    else:
        new_in = bool(prev_in)
        why = f"close {pct:+.2%} vs the average inside the {band:.0%} band: {'stays in' if new_in else 'stays out'}"
    changed = prev_in is None or new_in != prev_in
    out.update(signal=True, **{"in": new_in}, changed=changed, reason=why,
               action=("enter" if new_in else "exit") if changed else None)
    return out


def below_sma_today(bars: pd.DataFrame | pd.Series, date: str, cfg_sig: dict) -> dict[str, Any]:
    """Rule E's band-free check: is the index close on `date` below its 200-day average (including that day)?

    Returns {"below", "date", "close", "sma200", "pct_vs_sma"}; `below` is False without a close on `date`.
    """
    n = int(cfg_sig.get("sma_days", 200))
    snap = sma_snapshot(bars, date, n)
    ok = snap["date"] == iso(date) and snap["sma"] is not None
    return {"below": bool(ok and snap["close"] < snap["sma"]), "date": snap["date"], "close": snap["close"],
            "sma200": snap["sma"], "pct_vs_sma": snap["pct_vs_sma"]}


def leg_check(provider: Any, bars: pd.DataFrame, index: str, decision_date: str, prev_in: bool | None,
              cfg_sig: dict, tolerance: float) -> dict[str, Any]:
    """The two-source rule on one leg: the primary decision, `verify_close` on the week's last close, and the
    decision re-run on the second source's close. Both sources must agree on the state, else no signal.

    Returns the primary decision plus {"check": verify_close's dict, "agree", "second"}; on disagreement or a missing
    second source `signal` is False, `changed` False and `in` stays `prev_in` (fail closed).
    """
    first = g1_signal(bars, decision_date, prev_in, cfg_sig)
    out = dict(first, check=None, agree=None, second=None)
    if not first["signal"]:
        return out
    chk = verify_close(provider, bars, index, first["date"], tolerance)
    out["check"] = chk
    second = (g1_signal(bars, decision_date, prev_in, cfg_sig, close_override=chk["secondary"])
              if chk.get("secondary") is not None and math.isfinite(float(chk["secondary"])) else None)
    out["second"] = second
    agree = bool(chk.get("ok")) and second is not None and second["signal"] and second["in"] == first["in"]
    out["agree"] = agree
    if not agree:
        out.update(signal=False, changed=False, action=None, **{"in": prev_in},
                   reason=f"two-source check failed ({chk.get('reason')}): no signal, state kept")
    return out
