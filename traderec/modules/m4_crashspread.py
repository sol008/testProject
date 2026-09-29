"""M4 — O2 crash call debit spread: policy module with the 90-day exception (design v3.3 §3 "M4"; tracks 14, 21, 23).

Pure functions on in-memory data; the runner (`traderec.runners.m4`) wires them to the run.

Signal, after the close, on unrounded S&P 500 closes (research/code/14-short-options/s05_crash_and_spike_trades.py,
research/code/21-duration/o2_duration.py, research/code/23-duration-verify/modules23.py):

* the close is 15% or more below its 252-session high: the highest close of the last 252 sessions, today's
  included (`closes.rolling(252).max()`);
* the VIX closes at 30 or higher;
* first day only: a day on which both hold is a signal only if no earlier signal lies within the cool-down
  (90 calendar days under decision 12; a new signal needs `(day - last signal).days > cool-down`). The chain of
  signals is rebuilt from the whole history each evening, exactly as the research builds it, so a missed run
  never turns a later day of the same crash into a "first day".

Trade (design §3 M4, §3a): buy the at-the-money call and sell the 105% call on the listed expiry nearest to, but not
beyond, entry + 90 calendar days, where entry is the session after the signal. Debit <= 2% of NAV, rounded to the
nearest whole contract within the 3% premium cap; skipped under one contract. Close >= 1 trading day before expiry:
the close is planned for the session two trading days before expiry, so one retry session remains. No stop and no
profit target (track 14's optional take-profit at 80% of the width was not adopted by the design).
"""
from __future__ import annotations

import math
from typing import Any

import pandas as pd

from traderec.market_calendar import iso, next_trading_day, prev_trading_day
from traderec.options.chain import OptionChain
from traderec.options.fillmodel import combo_quote

TWO_SIDED_EPS = 1e-12


def _f(x: Any) -> float | None:
    """`x` as a finite float, or None."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _day(d: Any) -> pd.Timestamp:
    return pd.Timestamp(str(d)[:10])


# ------------------------------------------------------------------------------------------------ signal

def crash_condition(closes: pd.Series, vix: pd.Series, cfg_m4: dict) -> pd.Series:
    """True on every session whose close is at least `drop_from_high` below its `high_sessions`-session high (today's
    close included) and whose VIX close is at least `vix_min`. Sessions without a VIX close are False."""
    n = int(cfg_m4["high_sessions"])
    c = closes.dropna().astype(float).sort_index()
    high = c.rolling(n, min_periods=n).max()
    v = vix.dropna().astype(float).sort_index()
    v = v[~v.index.duplicated(keep="last")].reindex(c.index)
    cond = (c / high - 1.0 <= float(cfg_m4["drop_from_high"])) & (v >= float(cfg_m4["vix_min"]))
    return cond.fillna(False).astype(bool)


def signal_chain(condition: pd.Series, cooldown_days: int) -> list[pd.Timestamp]:
    """The research's first-day chain: a condition day is a signal when no signal lies within `cooldown_days`
    calendar days before it, i.e. `(day - last).days > cooldown_days`."""
    out: list[pd.Timestamp] = []
    last: pd.Timestamp | None = None
    for d in condition.index[condition.to_numpy(dtype=bool)]:
        if last is None or (d - last).days > int(cooldown_days):
            out.append(d)
            last = d
    return out


def m4_signal(spx: pd.DataFrame, vix: pd.Series, date: str, cfg_m4: dict, *, cooldown_until: str | None = None,
              close_override: float | None = None, vix_override: float | None = None) -> dict:
    """The entry test on ^GSPC closes and VIX closes up to and including `date` (never later).

    `close_override` / `vix_override` re-run today's test on a second source's close (the two-source rule: both
    sources must give a signal); the chain before today always uses the primary series. `cooldown_until` is the
    module's stored cool-down (no signal on or before that date), a second guard next to the chain.

    Returns {"signal", "condition", "first_day", "close", "high", "drawdown", "vix", "last_signal",
    "cooldown_until", "reasons"}: `reasons` lists the conditions that held when it fires and the ones that failed
    otherwise. Fail closed: no close stamped `date`, fewer than `high_sessions` closes, or no VIX close for `date`.
    """
    ts = _day(date)
    n = int(cfg_m4["high_sessions"])
    drop = float(cfg_m4["drop_from_high"])
    vix_min = float(cfg_m4["vix_min"])
    cool = int(cfg_m4["cooldown_days"])
    out: dict[str, Any] = {"signal": False, "condition": False, "first_day": False, "close": None, "high": None,
                           "drawdown": None, "vix": None, "last_signal": None, "cooldown_until": cooldown_until,
                           "reasons": []}
    closes = spx["close"].dropna().astype(float).sort_index().loc[:ts]
    if closes.empty or closes.index[-1] != ts:
        out["reasons"] = [f"no S&P 500 close on {ts.date()}"]
        return out
    if len(closes) < n:
        out["reasons"] = ["insufficient history"]
        return out
    vix_hist = vix.dropna().astype(float).sort_index().loc[:ts]
    v_today = _f(vix_override) if vix_override is not None else (
        _f(vix_hist.iloc[-1]) if len(vix_hist) and vix_hist.index[-1] == ts else None)
    close = _f(close_override) if close_override is not None else float(closes.iloc[-1])
    if close is None or close <= 0:
        out["reasons"] = ["no usable S&P 500 close"]
        return out
    high = max(float(closes.iloc[-n:-1].max()) if n > 1 else close, close)
    dd = close / high - 1.0
    out.update(close=close, high=high, drawdown=dd, vix=v_today)
    if vix_hist.empty or vix_hist.index[0] > closes.index[-n]:
        out["reasons"] = ["VIX history too short for the first-day rule"]      # e.g. only today's value
        return out

    prior = crash_condition(closes.iloc[:-1], vix_hist, cfg_m4)
    chain = signal_chain(prior, cool)
    last = chain[-1] if chain else None
    out["last_signal"] = iso(last) if last is not None else None
    tests = [
        (dd <= drop, f"S&P 500 {dd:+.2%} from its {n}-session high {high:,.2f} (needs {drop:+.0%} or lower)"),
        (v_today is not None and v_today >= vix_min,
         f"VIX {v_today:.2f} (needs {vix_min:g} or higher)" if v_today is not None else "vix missing"),
    ]
    out["condition"] = all(ok for ok, _ in tests)
    first = last is None or (ts - last).days > cool
    first_msg = (f"first day: no signal in the {cool} days before" if last is None or first
                 else f"not the first day: the last signal was {iso(last)}, within {cool} days")
    stored = cooldown_until is None or ts > _day(cooldown_until)
    tests.append((first, first_msg))
    if not stored:
        tests.append((False, f"cool-down until {str(cooldown_until)[:10]}"))
    out["first_day"] = bool(first and stored)
    out["signal"] = bool(out["condition"] and out["first_day"])
    out["reasons"] = [m for ok, m in tests if ok] if out["signal"] else [m for ok, m in tests if not ok]
    return out


def cooldown_end(signal_date: str, cooldown_days: int) -> str:
    """The last date still inside the cool-down: a new signal needs a later date."""
    return iso(_day(signal_date) + pd.Timedelta(days=int(cooldown_days)))


# ----------------------------------------------------------------------------------------- the structure

def entry_session(signal_date: str) -> str:
    """Entry is the session after the signal (the order is placed after 10:00 ET that day)."""
    return iso(next_trading_day(signal_date))


def choose_expiry(expiries: list[str], entry_date: str, max_calendar_days: int, min_dte: int) -> str | None:
    """The listed expiry nearest to, but not beyond, entry + `max_calendar_days`, with at least `min_dte` days left
    at entry; None when no listed expiry fits."""
    start = _day(entry_date)
    limit = start + pd.Timedelta(days=int(max_calendar_days))
    earliest = start + pd.Timedelta(days=int(min_dte))
    fits = sorted(str(e)[:10] for e in expiries if earliest <= _day(e) <= limit)
    return fits[-1] if fits else None


def _two_sided(frame: pd.DataFrame) -> pd.DataFrame:
    bid = pd.to_numeric(frame["bid"], errors="coerce")
    ask = pd.to_numeric(frame["ask"], errors="coerce")
    return frame[(bid > 0) & (ask >= bid - TWO_SIDED_EPS)]


def _nearest(strikes: list[float], target: float) -> float | None:
    """The strike nearest to `target`; a tie goes to the lower strike."""
    return min(strikes, key=lambda k: (abs(k - target), k)) if strikes else None


def choose_strikes(chain: OptionChain, expiry: str, spot: float, short_ratio: float, tolerance: float) -> dict:
    """The at-the-money call (the quoted strike nearest to `spot`) and the call nearest to `short_ratio` x spot.

    Only calls with a two-sided quote at `expiry` are candidates. Each chosen strike must lie within `tolerance`
    (a fraction) of its target, else no structure (fail closed). Returns {"ok", "long_strike", "short_strike",
    "legs", "reasons"}; `legs` are the position legs (long first) with the chain's own OCC symbols.
    """
    out: dict[str, Any] = {"ok": False, "long_strike": None, "short_strike": None, "legs": [], "reasons": []}
    s = _f(spot)
    if s is None or s <= 0:
        out["reasons"] = ["no usable spot"]
        return out
    calls = _two_sided(chain.select("C", expiry))
    strikes = sorted({float(k) for k in pd.to_numeric(calls["strike"], errors="coerce").dropna()})
    long_k = _nearest(strikes, s)
    target = s * float(short_ratio)
    short_k = _nearest([k for k in strikes if long_k is not None and k > long_k], target)
    if long_k is None or short_k is None:
        out["reasons"] = [f"no quoted calls for {expiry}"]
        return out
    out.update(long_strike=long_k, short_strike=short_k)
    tol = float(tolerance)
    if abs(long_k / s - 1.0) > tol:
        out["reasons"].append(f"nearest quoted strike {long_k:g} is more than {tol:.1%} from the spot {s:,.2f}")
    if abs(short_k / target - 1.0) > tol:
        out["reasons"].append(f"nearest quoted strike {short_k:g} is more than {tol:.1%} from {target:,.2f}")
    if out["reasons"]:
        return out
    legs = []
    for strike, position in ((long_k, "long"), (short_k, "short")):
        row = calls[pd.to_numeric(calls["strike"], errors="coerce") == strike].iloc[0]
        legs.append({"occ": str(row["occ"]), "root": str(row.get("root") or chain.underlying), "right": "C",
                     "strike": float(strike), "expiry": str(expiry)[:10], "position": position, "ratio": 1})
    out.update(ok=True, legs=legs)
    return out


def size_contracts(nav: float, per_contract_usd: float, target_frac: float, cap_frac: float) -> dict:
    """Whole contracts for a debit of `target_frac` x NAV, rounded to the nearest contract (halves up), then cut to
    fit `cap_frac` x NAV. Returns {"contracts", "target_usd", "cap_usd", "per_contract_usd", "reason"}; `reason`
    says why it is 0 (under one contract within the cap)."""
    nav_v, per = _f(nav), _f(per_contract_usd)
    out: dict[str, Any] = {"contracts": 0, "target_usd": None, "cap_usd": None, "per_contract_usd": per,
                           "reason": None}
    if nav_v is None or nav_v <= 0 or per is None or per <= 0:
        out["reason"] = "no NAV or no positive price per contract"
        return out
    target, cap = float(target_frac) * nav_v, float(cap_frac) * nav_v
    nearest = int(math.floor(target / per + 0.5))
    within = int(math.floor(cap / per + 1e-9))
    n = max(min(nearest, within), 0)
    out.update(contracts=n, target_usd=target, cap_usd=cap)
    if n < 1:
        out["reason"] = (f"one contract (${per:,.2f}) exceeds the cap (${cap:,.2f})" if within < 1
                         else f"the nearest whole number of contracts to ${target:,.2f} is zero")
    return out


def spread_terms(legs: list[dict], price: float, contracts: int, multiplier: int = 100) -> dict:
    """Width, maximum value, break-even and payout multiple of a call debit spread bought at `price` per share."""
    long_k = next(float(leg["strike"]) for leg in legs if leg.get("position") == "long")
    short_k = next(float(leg["strike"]) for leg in legs if leg.get("position") == "short")
    width = short_k - long_k
    p = float(price)
    return {"long_strike": long_k, "short_strike": short_k, "width": width,
            "width_usd": width * multiplier, "max_value_usd": width * multiplier * int(contracts),
            "breakeven": long_k + p, "max_multiple": width / p if p > 0 else None}


def intrinsic_value(legs: list[dict], underlying: float) -> float:
    """Value per share at expiry: sum of the long calls' intrinsic values minus the short calls'."""
    s = float(underlying)
    total = 0.0
    for leg in legs:
        intrinsic = max(s - float(leg["strike"]), 0.0) if leg.get("right", "C") == "C" else \
            max(float(leg["strike"]) - s, 0.0)
        total += intrinsic * (1.0 if leg.get("position") == "long" else -1.0) * int(leg.get("ratio", 1) or 1)
    return total


# -------------------------------------------------------------------------------------------------- exit

def last_close_date(expiry: str) -> str:
    """The last session on which the spread may be closed: one trading day before expiry (design §3a.4)."""
    return iso(prev_trading_day(expiry))


def planned_exit_date(expiry: str, sessions_before: int = 2) -> str:
    """The planned close: `sessions_before` trading days before expiry (two, so one retry session remains)."""
    d = _day(expiry).date()
    for _ in range(max(int(sessions_before), 1)):
        d = prev_trading_day(d)
    return d.isoformat()


def m4_exit_check(date: str, open_trade: dict, sessions_before: int = 2) -> dict:
    """Queue the close tonight when the next session is the planned close (or later) but still before expiry.

    `open_trade` needs "expiry"; "exit_date" (the planned close) is recomputed when missing. Returns {"exit",
    "reason", "exit_date", "last_close_date", "expiry", "next_session", "too_late", "days_held"}. `too_late` is
    True once the next session is the expiry itself or later: no close is allowed then (the safety net settles it).
    """
    expiry = str(open_trade["expiry"])[:10]
    exit_date = str(open_trade.get("exit_date") or planned_exit_date(expiry, sessions_before))[:10]
    last = last_close_date(expiry)
    nxt = iso(next_trading_day(date))
    too_late = nxt > last
    due = nxt >= exit_date and not too_late
    held = open_trade.get("fill_date")
    return {"exit": bool(due), "reason": "expiry_rule" if due else None, "exit_date": exit_date,
            "last_close_date": last, "expiry": expiry, "next_session": nxt, "too_late": bool(too_late),
            "days_held": (_day(date) - _day(held)).days if held else None}


# --------------------------------------------------------------------------------------------- liquidity

def liquidity_fallback(chain: OptionChain, legs: list[dict], cfg_liquidity: dict | None = None, *,
                       expected_gain: float | None = None) -> dict:
    """Design §4 "Option liquidity" (track 17 R8), used only while `traderec.options.chain.liquidity_check` is not
    built: each leg's (ask - bid) <= 10% of its mid with open interest >= 500, and the structure's round trip (its
    natural width) <= 10% of the debit (mid), or <= 20% when `expected_gain` (a fraction of the debit) is at least
    twice that cost. Returns {"ok", "reasons", "per_leg", "round_trip_frac"}."""
    c = cfg_liquidity or {}
    max_leg = float(c.get("max_leg_spread_frac", 0.10))
    min_oi = float(c.get("min_open_interest", 500))
    max_rt = float(c.get("max_round_trip_frac", 0.10))
    max_rt_gain = float(c.get("max_round_trip_frac_high_gain", 0.20))
    reasons: list[str] = []
    per_leg = []
    for leg in legs:
        q = chain.quote(leg["occ"]) or {}
        bid, ask, oi = _f(q.get("bid")), _f(q.get("ask")), _f(q.get("open_interest"))
        row = {"occ": leg["occ"], "bid": bid, "ask": ask, "open_interest": oi, "spread_frac": None}
        if bid is None or ask is None or bid <= 0 or ask < bid:
            reasons.append(f"{leg['occ']}: no two-sided quote")
        else:
            row["spread_frac"] = (ask - bid) / ((ask + bid) / 2.0)
            if row["spread_frac"] > max_leg + 1e-12:
                reasons.append(f"{leg['occ']}: bid-ask {row['spread_frac']:.1%} of mid (limit {max_leg:.0%})")
        if oi is None or oi < min_oi:
            reasons.append(f"{leg['occ']}: open interest {oi if oi is not None else 'missing'} (needs {min_oi:g})")
        per_leg.append(row)
    quote = combo_quote(chain, legs, "buy")
    rt = None
    if quote is None:
        reasons.append("no two-sided quote for every leg")
    elif quote["mid"] <= 0:
        reasons.append("the spread's mid is not positive")
    else:
        rt = quote["natural_width"] / quote["mid"]
        bound = max_rt_gain if expected_gain is not None and float(expected_gain) >= 2.0 * rt else max_rt
        if rt > bound + 1e-12:
            reasons.append(f"round trip {rt:.1%} of the debit (limit {bound:.0%})")
    return {"ok": not reasons, "reasons": reasons, "per_leg": per_leg, "round_trip_frac": rt}
