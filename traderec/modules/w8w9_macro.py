"""W8 and W9: macro-event call debit spreads (design v3.3 §3 M5; track 17 §5.2 W8/W9, §7.1 R2/R3, §7.2 R6-R8).

Pure rule logic on in-memory data. The runner (`traderec.runners.macro`) fetches the data, asks the frozen LLM veto
and emits the orders.

W8, de-escalation confirmed (policy module, small). All must hold at the close:
  (i)   an official announcement: the veto's allow-listed citations (or an announcement market resolved Yes);
  (ii)  Brent (the explicit front-safe month, BZZ26 in late Sep 2026) or BNO down >= 6% on the day;
  (iii) the Polymarket blockade-end or Hormuz-normal market up >= 15 points on the day, or through 75%.
  Trade: an XSP, SPY or DAL call debit spread, 56-75 DTE, premium <= 1% of NAV; DAL legs expire before DAL's next
  earnings. Exits: 80% of maximum value, 20 trading days, or "US x Iran ceasefire continues through <first listed
  date >= the time stop>" below 40%. Never an oil short.
W9, escalation that removes barrels (paper, n = 5): >= 1 mb/d physically offline and front Brent/WTI up >= 5% on
  the day. Trade: a USO call debit spread, 56-75 DTE, <= 0.75% of NAV, 20-trading-day time stop, contango veto (R3).
  Where the design is terse, track 17 §5.2 W9 adds: take profit at +100% of the premium; invalidation when WTI
  closes below the pre-event close or the supply is restored.
"""
from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import timedelta
from typing import Any

import pandas as pd

from traderec.market_calendar import is_trading_day, next_trading_day
from traderec.options.chain import OptionChain, occ_symbol

OIL_ROOTS = frozenset({"USO", "BNO", "USL", "UCO", "SCO", "XLE", "XOP", "CL", "MCL", "BZ"})
CENTS = 100


def _f(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


# --------------------------------------------------------------------------------------------------------
# Sessions
# --------------------------------------------------------------------------------------------------------

def sessions_after(date: str, n: int) -> str:
    """The NYSE session n sessions after `date` (n = 0 -> `date` itself)."""
    d = pd.Timestamp(date).date()
    for _ in range(int(n)):
        d = next_trading_day(d)
    return d.isoformat()


def sessions_held(fill_date: str, date: str) -> int:
    """Sessions from the fill session (session 1) to `date` inclusive; 0 before the fill."""
    start, end = pd.Timestamp(fill_date).date(), pd.Timestamp(date).date()
    n, d = 0, start
    while d <= end:
        n += is_trading_day(d)
        d += timedelta(days=1)
    return n


def time_stop_date(entry_date: str, sessions: int) -> str:
    """The exit session of an `sessions`-trading-day time stop: the entry session is session 1, so the exit order
    is queued on the evening of session `sessions` and fills in the next session (as M1's session-21 exit)."""
    return sessions_after(entry_date, sessions)


# --------------------------------------------------------------------------------------------------------
# Trigger legs
# --------------------------------------------------------------------------------------------------------

def move_leg(moves: Mapping[str, Mapping[str, Any]], threshold: float) -> dict[str, Any]:
    """One price condition over alternative instruments ("Brent or BNO down >= 6%": threshold -0.06; "Brent/WTI up
    >= 5%": +0.05). Fires when any instrument with a valid move crosses the threshold. Fails closed on disagreement:
    one instrument crosses while another moved the other way.

    {"fired", "disagree", "by": [names that crossed], "rets": {name: ret | None}, "reason"}.
    """
    down = threshold < 0
    rets = {k: (_f(v.get("ret")) if v and v.get("ok") else None) for k, v in moves.items()}
    crossed = [k for k, r in rets.items() if r is not None and (r <= threshold if down else r >= threshold)]
    against = [k for k, r in rets.items() if r is not None and (r > 0 if down else r < 0)]
    out = {"fired": False, "disagree": False, "by": crossed, "rets": rets, "reason": ""}
    if crossed and against:
        return {**out, "disagree": True, "reason": f"{', '.join(crossed)} crossed but {', '.join(against)} moved "
                                                   "the other way"}
    if crossed:
        return {**out, "fired": True, "reason": f"{', '.join(crossed)} crossed {threshold:+.0%}"}
    if all(r is None for r in rets.values()):
        return {**out, "reason": "no valid price move"}
    return {**out, "reason": f"no instrument crossed {threshold:+.0%}"}


def pm_leg(prev: Mapping[str, Any] | None, today: Mapping[str, Any] | None, prev_session: str,
           jump: float, through: float) -> dict[str, Any]:
    """Condition (iii) for one market family: "up >= `jump` on the day, or through `through`".

    `prev` is the family's snapshot stored by the previous session's run ({"market_id", "price", "asof", ...});
    `today` is the same market now ({"yes", "resolved", "outcome", ...} from the adapter). A market that resolved
    Yes since counts at 1.0 and one that resolved No at 0.0. Fails closed without a snapshot from the previous
    session, or when the market is missing or flawed.
    """
    out: dict[str, Any] = {"fired": False, "up": None, "through": False, "prev": None, "price": None,
                           "market_id": (prev or {}).get("market_id"), "question": (prev or {}).get("question"),
                           "reason": ""}
    if not prev or prev.get("asof") != prev_session or _f(prev.get("price")) is None:
        return {**out, "reason": "no snapshot from the previous session"}
    if not today:
        return {**out, "reason": "the mapped market is missing today"}
    if today.get("resolved"):
        price = 1.0 if today.get("outcome") == "yes" else 0.0
    elif today.get("problem") or _f(today.get("yes")) is None:
        return {**out, "reason": f"the mapped market is flawed today ({today.get('problem') or 'no price'})"}
    else:
        price = float(today["yes"])
    p0 = float(prev["price"])
    up = price - p0
    crossed = p0 < through <= price
    fired = up >= jump - 1e-12 or crossed
    return {**out, "fired": fired, "up": up, "through": crossed, "prev": p0, "price": price,
            "reason": (f"up {up:+.1%} points" + (f", through {through:.0%}" if crossed else "")) if fired
            else f"moved {up:+.1%} points (needs {jump:+.0%} or a cross of {through:.0%})"}


def release_ban(entry_date: str, releases: Mapping[str, list[str]], sessions: int) -> dict[str, Any]:
    """Never-list (design §5; red team M5): no option "bought to play a scheduled release ... entered <= 5 sessions
    before it". Banned when a release falls on the entry session or within the `sessions` sessions after it.

    {"banned", "hits": [[kind, date], ...], "window": [first, last]}.
    """
    last = sessions_after(entry_date, sessions)
    hits = sorted([k, d] for k, dates in releases.items() for d in dates if entry_date <= str(d)[:10] <= last)
    return {"banned": bool(hits), "hits": hits, "window": [entry_date, last]}


def discretionary_pause(marks: list[Mapping[str, Any]], cfg: Mapping[str, Any], pause_at: float) -> dict[str, Any]:
    """Design §4: a drawdown >= `pause_at` pauses discretionary entries; a daily loss <= cfg["daily_loss"] pauses
    them for 1 day and a loss over `weekly_sessions` sessions <= cfg["weekly_loss"] for `weekly_pause_sessions`.
    M1, M4 and W10 are exempt; W8/W9 are not. `marks` are the state's daily marks, today's last."""
    if not marks:
        return {"paused": False, "reason": ""}
    dd = _f(marks[-1].get("drawdown")) or 0.0
    if dd >= float(pause_at):
        return {"paused": True, "reason": f"drawdown {dd:.1%} (entries pause at {float(pause_at):.0%})"}
    navs = [_f(m.get("nav")) for m in marks]
    if len(navs) >= 2 and navs[-1] and navs[-2] and navs[-1] / navs[-2] - 1.0 <= float(cfg["daily_loss"]):
        return {"paused": True, "reason": f"daily loss {navs[-1] / navs[-2] - 1.0:.1%}"}
    n, hold = int(cfg["weekly_sessions"]), int(cfg["weekly_pause_sessions"])
    for back in range(hold):                   # a weekly breach on any of the last `hold` sessions still pauses
        end = len(navs) - 1 - back
        if end - n < 0:
            break
        a, b = navs[end - n], navs[end]
        if a and b and b / a - 1.0 <= float(cfg["weekly_loss"]):
            return {"paused": True, "reason": f"{n}-session loss {b / a - 1.0:.1%} on {marks[end].get('date')}"}
    return {"paused": False, "reason": ""}


# --------------------------------------------------------------------------------------------------------
# The structure
# --------------------------------------------------------------------------------------------------------

def expiry_candidates(expiries: list[str], entry_date: str, dte_min: int, dte_max: int,
                      before: str | None = None) -> list[str]:
    """Listed expiries with DTE (calendar days from the entry session) in [dte_min, dte_max], strictly before
    `before` when given (DAL: its next earnings date). Latest first: the most time value inside the window."""
    e = pd.Timestamp(entry_date)
    out = [x for x in expiries if dte_min <= (pd.Timestamp(x) - e).days <= dte_max and (before is None or x < before)]
    return sorted(set(out), reverse=True)


def strike_near(chain: OptionChain, expiry: str, right: str, target: float) -> float | None:
    """The listed strike nearest `target` among contracts with a two-sided quote (ties: the lower strike)."""
    rows = chain.select(right, expiry)
    rows = rows[(pd.to_numeric(rows["bid"], errors="coerce") > 0) & (pd.to_numeric(rows["ask"], errors="coerce") > 0)]
    if rows.empty:
        return None
    strikes = sorted({float(s) for s in rows["strike"]})
    return min(strikes, key=lambda k: (abs(k - target), k))


def call_spread(chain: OptionChain, expiry: str, spot: float, moneyness: list[float] | tuple[float, float]) -> dict:
    """A bull call spread: long the call nearest spot x moneyness[0], short the one nearest spot x moneyness[1].
    {"ok", "long", "short", "legs", "reason"}; not ok when the strikes coincide or are inverted."""
    k1 = strike_near(chain, expiry, "C", spot * float(moneyness[0]))
    k2 = strike_near(chain, expiry, "C", spot * float(moneyness[1]))
    if k1 is None or k2 is None:
        return {"ok": False, "long": k1, "short": k2, "legs": [], "reason": f"no quoted calls on {expiry}"}
    if not k2 > k1:
        return {"ok": False, "long": k1, "short": k2, "legs": [], "reason": f"strikes {k1:g}/{k2:g} give no spread"}
    return {"ok": True, "long": k1, "short": k2, "legs": order_legs(chain.underlying, expiry, k1, k2), "reason": ""}


def order_legs(root: str, expiry: str, k_long: float, k_short: float, right: str = "C") -> list[dict[str, Any]]:
    """The position legs of a two-leg vertical (contract §2)."""
    return [{"occ": occ_symbol(root, expiry, right, k), "root": root, "right": right, "strike": float(k),
             "expiry": expiry, "position": pos, "ratio": 1} for k, pos in ((k_long, "long"), (k_short, "short"))]


def no_oil_short(module: str, root: str, legs: list[Mapping[str, Any]]) -> None:
    """Design §3 M5 and §5: W8 never shorts oil, and W8/W9 only buy call debit spreads. Raises ValueError."""
    if module == "W8" and root.upper() in OIL_ROOTS:
        raise ValueError(f"W8 never trades oil ({root}): no oil shorts after a ceasefire headline")
    long = [leg for leg in legs if leg.get("position") == "long"]
    short = [leg for leg in legs if leg.get("position") == "short"]
    if (len(long) != 1 or len(short) != 1 or any(leg.get("right") != "C" for leg in legs)
            or not float(short[0]["strike"]) > float(long[0]["strike"])):
        raise ValueError(f"{module} only buys call debit spreads (long the lower strike)")


def round_price(price: float, side: str) -> float:
    """A net limit rounded to the cent so the fill model's price stays inside it: up for buys, down for sells."""
    cents = float(price) * CENTS
    return (math.ceil(cents - 1e-9) if side == "buy" else math.floor(cents + 1e-9)) / CENTS


def contracts_for(budget_usd: float, max_price: float, multiplier: int = 100) -> int:
    """Whole contracts whose stated maximum debit fits in `budget_usd` (0 means skip: at least one or nothing)."""
    per = float(max_price) * int(multiplier)
    return int(math.floor(float(budget_usd) / per + 1e-9)) if per > 0 else 0


# --------------------------------------------------------------------------------------------------------
# Exits
# --------------------------------------------------------------------------------------------------------

def exit_check(module: str, date: str, ot: Mapping[str, Any], value: float | None, cfg: Mapping[str, Any],
               invalidated: str | None = None) -> dict[str, Any]:
    """Tonight's exit decision for an open spread; the order is placed after 10:00 ET next session.

    Checked in order: "expiry_rule" (the next session is within `expiry_close_sessions` of expiry, design §4),
    "invalidation" (`invalidated` names the reason, and it is sticky once recorded on the trade), "take_profit" (W8:
    value >= take_profit_frac_of_max x width; W9: value >= take_profit_multiple x entry price) and "time_stop" (the
    next session is the trade's exit session). `value` is tonight's combo mid per share (None when not quoted: only
    the take-profit needs it).
    """
    nxt = next_trading_day(date).isoformat()
    held = sessions_held(ot["fill_date"], date) if ot.get("fill_date") else None
    out: dict[str, Any] = {"exit": False, "reason": None, "sessions_held": held, "value": value, "detail": ""}
    expiry = str(ot.get("expiry") or "")
    if expiry:
        last_ok = expiry
        for _ in range(int(cfg.get("expiry_close_sessions", 10))):
            last_ok = (pd.Timestamp(last_ok).date() - timedelta(days=1)).isoformat()
            while not is_trading_day(last_ok):
                last_ok = (pd.Timestamp(last_ok).date() - timedelta(days=1)).isoformat()
        if nxt >= last_ok:
            return {**out, "exit": True, "reason": "expiry_rule", "detail": f"expiry {expiry}"}
    if invalidated or ot.get("invalidated_on"):
        return {**out, "exit": True, "reason": "invalidation", "detail": invalidated or ot.get("invalidation_reason")}
    v = _f(value)
    if v is not None:
        if module == "W8":
            tp = float(cfg["take_profit_frac_of_max"]) * float(ot["width"])
        else:
            tp = float(cfg["take_profit_multiple"]) * float(ot["entry_price"])
        out["tp_value"] = tp
        if v >= tp - 1e-9:
            return {**out, "exit": True, "reason": "take_profit", "detail": f"value {v:.2f} >= {tp:.2f}"}
    if ot.get("exit_date") and nxt >= str(ot["exit_date"]):
        return {**out, "exit": True, "reason": "time_stop", "detail": f"exit session {ot['exit_date']}"}
    return out
