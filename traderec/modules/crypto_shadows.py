"""M6 crypto structural shadow books and the ETH switch shadow: pure rules (design v3.3 §3 "M6", "M3" and
"Shadow ledger"; tracks 05, 15 and 20).

No network and no clock: `traderec.runners.crypto` fetches the data (`traderec.data.crypto_data`) and passes the
time in. Each function returns a decision, or advances a shadow book (a plain dict from the state) and returns the
changes to log. No emails, no orders, no LLM.

* **Depeg buy** (design §3 M6; track 05 §7.3 and §11). Trigger: a regulated, fiat-backed coin at or below $0.97 on
  at least two venues. Track 05 also asks for attested reserves and primary redemptions not suspended for more than
  72 hours. Neither can be read mechanically, so every event records both as "unverified". Shadow size: 3% of NAV,
  with stress = 100% of the position. Exit at $0.995 or better, or after 30 calendar days (track 05 §11).
* **Cash-and-carry** (design §3 M6; track 05 §7.1). Long spot Bitcoin (IBIT) and short the CME Bitcoin future
  with at most 60 days to expiry, when its annualised basis is at least T-bills + 6 points. 15% notional, held to
  expiry.
* **ETH switch** (design §3 M3 and "Shadow ledger"; track 15 R2). M3's rule applied to ETH: the weekly close (the
  Sunday UTC candle) above its 10-week average. Trades at the next UTC daily close (track 15's one-day lag).
"""
from __future__ import annotations

import copy
import math
from collections.abc import Mapping
from datetime import date, timedelta
from statistics import median
from typing import Any

import numpy as np
import pandas as pd

from traderec.market_calendar import easter, nyse_holidays
from traderec.modules.m3_btc import _utc_daily, btc_weekly_switch, last_sunday_before

ET = "America/New_York"
CME_MONTH_CODES = "FGHJKMNQUVXZ"
MONTH_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

DEPEG_DEFAULTS: dict[str, Any] = {
    "trigger_price": 0.97,      # a regulated, fiat-backed coin <= $0.97 ...
    "min_venues": 2,            # ... on >= 2 venues (design §3 M6)
    "max_spread": 0.02,         # a venue counts only with a two-sided book no wider than this
    "exit_price": 0.995,        # track 05 §11: exit at >= $0.995 ...
    "time_stop_days": 30,       # ... or after 30 calendar days
    "size_pct_nav": 0.03,       # <= 3% of NAV (design §3 M6)
    "stress_pct": 1.0,          # stress = 100% of the position
    "fee_per_side": 0.0025,     # track 15 §1.2 crypto base case
    "update_step": 0.005,       # a new low is recorded only when it is at least this much lower
}
CARRY_DEFAULTS: dict[str, Any] = {
    "max_days_to_expiry": 60,   # CME contracts with <= 60 days to expiry (design §3 M6)
    "excess_over_tbill": 0.06,  # annualised basis >= T-bills + 6 points
    "notional_pct_nav": 0.15,   # <= 15% notional
    "cost_round_trip": 0.0015,  # IBIT ~0.05% + MBT ~0.10% round trip (track 15 §4.7)
    "ibit_fee_annual": 0.0025,  # IBIT's expense ratio over the days held
}
ETH_DEFAULTS: dict[str, Any] = {
    "weeks": 10,                # M3's 10-week rule
    "cost_per_side": 0.0025,    # track 15 §1.2 crypto base case
    "max_catchup_weeks": 12,    # missed weeks the daily run replays, oldest first
}
ETH_PROMOTION: dict[str, Any] = {"min_months": 24, "min_t": 2.0, "nw_lags": 4}   # track 15 R2


# --------------------------------------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------------------------------------

def _num(value: Any) -> float | None:
    """A finite, positive float, or None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) and x > 0 else None


def _utc(when: Any) -> pd.Timestamp:
    """A tz-aware UTC Timestamp; a naive value is taken as UTC."""
    ts = pd.Timestamp(when)
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")


def utc_iso(when: Any) -> str:
    """'YYYY-MM-DDTHH:MM:SSZ' for a time (naive = UTC)."""
    return _utc(when).strftime("%Y-%m-%dT%H:%M:%SZ")


def hour_label(when: Any) -> str:
    """The UTC hour of `when` as 'YYYY-MM-DDTHHZ' (the hourly job's run key)."""
    return _utc(when).floor("h").strftime("%Y-%m-%dT%HZ")


def _mean(xs: list[float]) -> float | None:
    return float(sum(xs) / len(xs)) if xs else None


# --------------------------------------------------------------------------------------------------------
# Depeg buy (hourly job)
# --------------------------------------------------------------------------------------------------------

def book_view(quote: Mapping[str, Any] | None, max_spread: float) -> dict:
    """One venue's book as the rule reads it: {"usable", "bid", "ask", "mid", "spread", "reason"}.

    Only a two-sided book counts: 0 < bid <= ask and (ask - bid) / mid <= max_spread. The last trade is ignored,
    because thin books print stale trades. An empty or one-sided book is unusable, not a depeg: Gemini quotes USDG
    at 0.000005 / 0.99, which is no market at all.
    """
    out: dict[str, Any] = {"usable": False, "bid": None, "ask": None, "mid": None, "spread": None, "reason": None}
    if not quote:
        out["reason"] = "no quote"
        return out
    bid, ask = _num(quote.get("bid")), _num(quote.get("ask"))
    out.update(bid=bid, ask=ask)
    if bid is None or ask is None:
        out["reason"] = "one-sided book"
        return out
    if ask < bid:
        out["reason"] = "crossed book"
        return out
    mid = (bid + ask) / 2.0
    spread = (ask - bid) / mid
    out.update(mid=mid, spread=spread)
    if spread > max_spread:
        out["reason"] = f"spread {spread:.1%} is wider than {max_spread:.1%}"
        return out
    out["usable"] = True
    return out


def depeg_check(quotes: Mapping[str, Mapping[str, Any] | None], cfg: Mapping[str, Any]) -> dict:
    """The depeg trigger for one coin: a usable book at or below `trigger_price` on at least `min_venues` venues.

    `quotes` is {venue: {"bid", "ask", ...} | None}. Returns {"trigger", "prices" ({venue: mid} for usable books),
    "below" (venues at or below the trigger), "usable" (count), "median" (median mid), "views", "reason"}.
    Fewer confirming venues means no trigger (fail closed), whether the other venues disagree or have no usable
    book.
    """
    cfg = {**DEPEG_DEFAULTS, **cfg}
    trig, need = float(cfg["trigger_price"]), int(cfg["min_venues"])
    views = {v: book_view(q, float(cfg["max_spread"])) for v, q in sorted(quotes.items())}
    prices = {v: x["mid"] for v, x in views.items() if x["usable"]}
    below = sorted(v for v, p in prices.items() if p <= trig)
    trigger = len(below) >= need
    if trigger:
        reason = f"at or below ${trig:.2f} on {len(below)} venues ({', '.join(below)})"
    elif below:
        others = sorted(set(prices) - set(below))
        rest = f"{', '.join(others)} disagree" if others else "no other venue has a usable book"
        reason = f"at or below ${trig:.2f} on {', '.join(below)} only; {rest} (the rule needs {need} venues)"
    elif prices:
        reason = f"above ${trig:.2f} on {len(prices)} venue(s)"
    else:
        reason = "no usable book on any venue"
    return {"trigger": trigger, "prices": prices, "below": below, "usable": len(prices),
            "median": float(median(prices.values())) if prices else None, "views": views, "reason": reason}


def depeg_step(book: dict, quotes: Mapping[str, Mapping[str, Any]], now: Any, cfg: Mapping[str, Any],
               nav: float | None, coins: Mapping[str, bool], *,
               markets: Mapping[str, Mapping[str, str]] | None = None) -> list[dict]:
    """Advance the depeg monitor by one hourly observation. Mutates `book`; returns the changes to log.

    book:    state["shadow"]["M6"]: {"events": [...], "watch": {coin: ...}}.
    quotes:  {coin: {venue: quote | None}} for this hour.
    coins:   {coin: eligible}. Watch-only coins (eligible False, e.g. USDT) are scored the same way but flagged.
    nav:     the NAV that sizes a new event (3%); None leaves the size empty (a dry plan).
    markets: {coin: {venue: symbol}}, stored in each new event so its exit can be checked later.

    Each change is a dict with "event" and "alert" (a data-alert message, or None):
    * depeg_open: a coin at or below $0.97 on >= 2 venues opens a hypothetical buy at the worst confirming ask.
    * depeg_low: an open event's median price falls at least `update_step` below its recorded low.
    * depeg_close: the median price is back at $0.995 or better ("recovered"), or 30 days have passed
      ("time_stop"). The exit is at the median bid.
    * unconfirmed_start / unconfirmed_end: a coin is at or below $0.97 on fewer than two venues (fail closed: no
      entry). Logged once when it starts, with a data alert, and once when it ends.
    A quiet hour returns [] and changes nothing in `book` (beyond adding its missing keys). An hour without a
    usable book for a coin changes nothing for that coin.
    """
    cfg = {**DEPEG_DEFAULTS, **cfg}
    now = _utc(now)
    events = book.setdefault("events", [])
    watch = book.setdefault("watch", {})
    changes: list[dict] = []
    open_events = {e["coin"]: e for e in events if e.get("kind") == "depeg" and e.get("status") == "open"}
    for coin in sorted(set(coins) | set(open_events)):
        chk = depeg_check((quotes.get(coin) or {}), cfg)
        ev = open_events.get(coin)
        if ev is not None:
            changes += _depeg_manage(ev, chk, now, cfg)
            continue
        eligible = bool(coins.get(coin, False))
        if chk["trigger"]:
            ev = _depeg_open(coin, eligible, chk, now, cfg, nav, (markets or {}).get(coin))
            ev["unconfirmed_since"] = (watch.pop(coin, None) or {}).get("since")
            events.append(ev)
            changes.append({"event": "depeg_open", **copy.deepcopy(ev), "alert": None})
        elif chk["below"]:
            if coin not in watch:
                watch[coin] = {"since": utc_iso(now), "signal_date": now.strftime("%Y-%m-%d"),
                               "below": chk["below"], "prices": chk["prices"], "reason": chk["reason"]}
                changes.append({"event": "unconfirmed_start", "coin": coin, "eligible": eligible,
                                **copy.deepcopy(watch[coin]),
                                "alert": f"M6 depeg not confirmed for {coin}: {chk['reason']}; no shadow entry "
                                         "(fail closed)"})
        elif coin in watch and chk["usable"]:
            started = watch.pop(coin)
            changes.append({"event": "unconfirmed_end", "coin": coin, "since": started.get("since"),
                            "time": utc_iso(now), "prices": chk["prices"], "alert": None})
    return changes


def _depeg_open(coin: str, eligible: bool, chk: dict, now: pd.Timestamp, cfg: Mapping[str, Any],
                nav: float | None, markets: Mapping[str, str] | None) -> dict:
    fee, trig = float(cfg["fee_per_side"]), float(cfg["trigger_price"])
    ask = max(float(chk["views"][v]["ask"]) for v in chk["below"])        # the worst confirming venue
    size = float(cfg["size_pct_nav"]) * float(nav) if nav is not None else None
    return {
        "id": f"S-{hour_label(now)}-M6-{coin}", "kind": "depeg", "coin": coin, "eligible": eligible,
        "status": "open", "signal_date": now.strftime("%Y-%m-%d"), "signal_time": utc_iso(now),
        "venues_below": list(chk["below"]), "prices": dict(chk["prices"]),
        "conditions": {
            "price": f"<= ${trig:.2f} on {len(chk['below'])} venues",
            "regulated_fiat_backed": "yes (config list)" if eligible else "no (watch only)",
            "reserves_attested": "unverified",          # can't be read mechanically (docs/phase-b/crypto.md)
            "redemptions_open_72h": "unverified",
        },
        "entry_time": utc_iso(now), "entry_ask": ask, "entry_price": ask * (1.0 + fee),
        "size_pct_nav": float(cfg["size_pct_nav"]), "size_usd": size,
        "stress_pct": float(cfg["stress_pct"]),
        "stress_usd": size * float(cfg["stress_pct"]) if size is not None else None,
        "low": chk["median"], "low_time": utc_iso(now), "updates": 0,
        "exit_time": None, "exit_date": None, "exit_price": None, "exit_reason": None,
        "return": None, "pnl_usd": None, "hours_held": None,
        "markets": dict(markets or {}),
    }


def _depeg_manage(ev: dict, chk: dict, now: pd.Timestamp, cfg: Mapping[str, Any]) -> list[dict]:
    if not chk["usable"]:
        return []                                    # no usable book this hour: nothing to decide
    med = float(chk["median"])
    held = (now - _utc(ev["entry_time"])).total_seconds()
    reason = None
    if med >= float(cfg["exit_price"]):
        reason = "recovered"
    elif held >= float(cfg["time_stop_days"]) * 86_400:
        reason = "time_stop"
    if reason is not None:
        bid = float(median(chk["views"][v]["bid"] for v in chk["prices"]))
        exit_price = bid * (1.0 - float(cfg["fee_per_side"]))
        ret = exit_price / float(ev["entry_price"]) - 1.0
        ev.update(status="closed", exit_time=utc_iso(now), exit_date=now.strftime("%Y-%m-%d"),
                  exit_bid=bid, exit_price=exit_price, exit_reason=reason, exit_prices=dict(chk["prices"]),
                  hours_held=round(held / 3600.0, 2), **{"return": ret},
                  pnl_usd=float(ev["size_usd"]) * ret if ev.get("size_usd") is not None else None)
        return [{"event": "depeg_close", **copy.deepcopy(ev), "alert": None}]
    low = ev.get("low")
    if low is None or med <= float(low) - float(cfg["update_step"]):
        ev.update(low=med, low_time=utc_iso(now), updates=int(ev.get("updates") or 0) + 1)
        return [{"event": "depeg_low", "id": ev["id"], "coin": ev["coin"], "low": med, "time": utc_iso(now),
                 "prices": dict(chk["prices"]), "alert": None}]
    return []


# --------------------------------------------------------------------------------------------------------
# Cash-and-carry (daily run)
# --------------------------------------------------------------------------------------------------------

def _uk_holidays(year: int) -> set[date]:
    """UK bank holidays that can fall on the last Friday of a month: Good Friday, 25 and 26 December."""
    return {easter(year) - timedelta(days=2), date(year, 12, 25), date(year, 12, 26)}


def cme_btc_expiry(year: int, month: int) -> date:
    """Last trading day of the CME Bitcoin future for (year, month).

    CME's rule: the last Friday of the contract month, or the business day before it when that Friday is not both
    a London and a US business day. Holidays used here: NYSE's, plus UK Good Friday, 25 and 26 December.
    """
    last = date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)
    day = last - timedelta(days=(last.weekday() - 4) % 7)
    while day.weekday() >= 5 or day in nyse_holidays(day.year) or day in _uk_holidays(day.year):
        day -= timedelta(days=1)
    return day


def contract_code(year: int, month: int) -> str:
    """'X26' for November 2026."""
    return f"{CME_MONTH_CODES[month - 1]}{year % 100:02d}"


def carry_contracts(asof: str, max_days: int = 60, months_ahead: int = 4) -> list[dict]:
    """CME Bitcoin futures with 1..max_days calendar days to expiry as of `asof`, the longest first.

    Each row: {"year", "month", "code" ("X26"), "label" ("Nov-2026"), "expiry", "days"}. The carry rule uses the
    first row. Contracts are monthly, so that contract always has about 28-60 days left.
    """
    d = date.fromisoformat(str(asof)[:10])
    out = []
    for k in range(months_ahead):
        y, m = d.year + (d.month - 1 + k) // 12, (d.month - 1 + k) % 12 + 1
        expiry = cme_btc_expiry(y, m)
        days = (expiry - d).days
        if 0 < days <= int(max_days):
            out.append({"year": y, "month": m, "code": contract_code(y, m), "label": f"{MONTH_ABBR[m - 1]}-{y}",
                        "expiry": expiry.isoformat(), "days": days})
    return sorted(out, key=lambda c: -c["days"])


def quote_window(run_date: str) -> tuple[pd.Timestamp, pd.Timestamp]:
    """The quote times (UTC) that the daily run for `run_date` may use.

    The window runs from 00:00 ET on the run date to 06:00 ET the next day. An older quote is stale. A later one
    would be look-ahead in a catch-up run for an earlier date.
    """
    start = pd.Timestamp(f"{str(run_date)[:10]} 00:00").tz_localize(ET)
    end = (pd.Timestamp(f"{str(run_date)[:10]} 06:00") + pd.Timedelta(days=1)).tz_localize(ET)
    return start.tz_convert("UTC"), end.tz_convert("UTC")


def annualised_basis(future: float, spot: float, days: int) -> float:
    """(F / S - 1) x 365 / days: the carry locked by buying spot and selling the future until its expiry."""
    return (float(future) / float(spot) - 1.0) * 365.0 / float(days)


def carry_check(contract: Mapping[str, Any], quote: Mapping[str, Any] | None, spot: float | None, tbill: float,
                cfg: Mapping[str, Any]) -> dict:
    """The cash-and-carry test on one contract: annualised basis >= T-bills + `excess_over_tbill`.

    `quote` is the future's {"ticker", "price", "time"}. `spot` is BTC-USD at the quote's time. Missing either
    gives on=False with basis None: the caller fails closed and raises a data alert.
    """
    cfg = {**CARRY_DEFAULTS, **cfg}
    threshold = float(tbill) + float(cfg["excess_over_tbill"])
    out = {"on": False, "contract": contract.get("code"), "label": contract.get("label"),
           "expiry": contract.get("expiry"), "days": contract.get("days"),
           "ticker": (quote or {}).get("ticker"), "quote_time": (quote or {}).get("time"),
           "future": None, "spot": None, "basis": None, "basis_annual": None,
           "tbill": float(tbill), "threshold": threshold}
    future, spot = _num((quote or {}).get("price")), _num(spot)
    if future is None or spot is None or not contract.get("days"):
        return out
    basis = future / spot - 1.0
    annual = annualised_basis(future, spot, int(contract["days"]))
    out.update(future=future, spot=spot, basis=basis, basis_annual=annual, on=bool(annual >= threshold))
    return out


def carry_open(chk: Mapping[str, Any], run_date: str, nav: float, cfg: Mapping[str, Any]) -> dict:
    """A hypothetical carry position from a check that is on: long spot, short the future, held to expiry."""
    cfg = {**CARRY_DEFAULTS, **cfg}
    return {
        "id": f"S-{run_date}-M6-carry", "kind": "carry", "status": "open", "signal_date": run_date,
        "contract": chk["contract"], "label": chk.get("label"), "ticker": chk.get("ticker"),
        "expiry": chk["expiry"], "days": chk["days"], "quote_time": chk.get("quote_time"),
        "future": chk["future"], "spot": chk["spot"], "basis": chk["basis"], "basis_annual": chk["basis_annual"],
        "tbill": chk["tbill"], "threshold": chk["threshold"],
        "notional_pct_nav": float(cfg["notional_pct_nav"]), "notional_usd": float(cfg["notional_pct_nav"]) * nav,
        "legs": "long IBIT (spot), short MBT (CME) in the same taxable account",
        "exit_date": None, "exit_reason": None, "return": None, "return_annual": None, "excess_annual": None,
        "pnl_usd": None,
    }


def carry_close(ev: dict, asof: str, cfg: Mapping[str, Any]) -> bool:
    """Close an open carry event once `asof` reaches its expiry. Returns True when it closed.

    The future settles to spot at expiry, so the hedged position earns the basis locked at entry, less the round
    trip and IBIT's fee for the days held. The shadow can't measure IBIT's tracking or margin costs.
    """
    if ev.get("status") != "open" or str(asof)[:10] < str(ev["expiry"]):
        return False
    cfg = {**CARRY_DEFAULTS, **cfg}
    days = max((date.fromisoformat(ev["expiry"]) - date.fromisoformat(ev["signal_date"])).days, 1)
    ret = float(ev["basis"]) - float(cfg["cost_round_trip"]) - float(cfg["ibit_fee_annual"]) * days / 365.0
    annual = ret * 365.0 / days
    ev.update(status="closed", exit_date=ev["expiry"], exit_reason="expiry", days_held=days,
              return_annual=annual, excess_annual=annual - float(ev["tbill"]),
              pnl_usd=float(ev["notional_usd"]) * ret, **{"return": ret})
    return True


# --------------------------------------------------------------------------------------------------------
# ETH weekly switch (daily run)
# --------------------------------------------------------------------------------------------------------

def _sundays_after(last: str, latest: str) -> list[str]:
    days = pd.date_range(pd.Timestamp(last) + pd.Timedelta(days=7), pd.Timestamp(latest), freq="7D")
    return [d.strftime("%Y-%m-%d") for d in days]


def eth_step(book: dict, closes: pd.Series, asof_utc: str, cfg: Mapping[str, Any], *,
             tbill: float | None = None) -> dict:
    """Advance the ETH switch shadow to `asof_utc` (the UTC date the run can see complete candles before).

    1. Fill a pending entry or exit at the first UTC daily close after its signal week (track 15: signal at the
       close, trade at the next close), net of `cost_per_side`.
    2. Decide every complete week not decided yet, oldest first (the first run decides only the latest week):
       on -> buy, off -> sell, as M3's rule applied to ETH. Each week is recorded in book["weeks"] for the
       promotion test.
    Only candles dated before `asof_utc` are used, so a catch-up run never sees later prices.
    Returns {"changes": [...], "notes": [...], "problems": [...]}. A problem is missing data, which fails closed.
    """
    cfg = {**ETH_DEFAULTS, **cfg}
    for key, default in (("on", None), ("last_week_end", None), ("open_trade", None), ("trades", []),
                         ("weeks", [])):
        book.setdefault(key, copy.deepcopy(default))
    weeks, cost = int(cfg["weeks"]), float(cfg["cost_per_side"])
    asof = pd.Timestamp(asof_utc)
    s = _utc_daily(closes)
    s = s[s.index < asof]
    out: dict[str, list] = {"changes": _eth_fill(book, s, cost), "notes": [], "problems": []}
    latest = btc_weekly_switch(s, asof_utc, weeks)
    if not latest["complete"]:
        want = last_sunday_before(asof).strftime("%Y-%m-%d")
        if book["last_week_end"] is None or book["last_week_end"] < want:
            out["problems"].append(f"no ETH-USD close for Sunday {want}; that week is not decided")
        return out
    last, newest = book["last_week_end"], str(latest["week_end"])
    if last is not None and last >= newest:
        return out
    todo = [newest] if last is None else _sundays_after(last, newest)
    if len(todo) > int(cfg["max_catchup_weeks"]):
        out["notes"].append(f"{len(todo) - int(cfg['max_catchup_weeks'])} missed week(s) before "
                            f"{todo[-int(cfg['max_catchup_weeks'])]} were not replayed")
        todo = todo[-int(cfg["max_catchup_weeks"]):]
    for week_end in todo:
        sw = latest if week_end == newest else btc_weekly_switch(
            s, (pd.Timestamp(week_end) + pd.Timedelta(days=1)).strftime("%Y-%m-%d"), weeks)
        if not sw["complete"] or sw["week_end"] != week_end:
            out["problems"].append(f"no ETH-USD close for Sunday {week_end}; that week is skipped")
            continue
        out["changes"] += _eth_decide(book, sw, tbill)
        out["changes"] += _eth_fill(book, s, cost)
    return out


def _eth_decide(book: dict, sw: Mapping[str, Any], tbill: float | None) -> list[dict]:
    week_end = str(sw["week_end"])
    obs = {"week_end": week_end, "close": sw["weekly_close"], "sma": sw["sma"], "on": bool(sw["on"]), "rf": tbill}
    book["weeks"].append(obs)
    book.update(on=bool(sw["on"]), last_week_end=week_end)
    changes: list[dict] = [{"event": "weekly", **obs}]
    ot = book.get("open_trade")
    if sw["on"]:
        if ot is None:
            book["open_trade"] = {"trade_id": f"S-{week_end}-ETH", "status": "pending_entry",
                                  "signal_date": week_end, "weekly_close": sw["weekly_close"], "sma": sw["sma"]}
            changes.append({"event": "signal_on", **book["open_trade"]})
        elif ot.get("status") == "pending_exit":
            ot.update(status="open", exit_signal_date=None)
            changes.append({"event": "exit_cancelled", "trade_id": ot["trade_id"], "week_end": week_end})
    elif ot is not None and ot.get("status") == "open":
        ot.update(status="pending_exit", exit_signal_date=week_end)
        changes.append({"event": "signal_off", "trade_id": ot["trade_id"], "week_end": week_end})
    elif ot is not None and ot.get("status") == "pending_entry":
        book["open_trade"] = None
        changes.append({"event": "entry_cancelled", "trade_id": ot["trade_id"], "week_end": week_end})
    return changes


def _eth_fill(book: dict, s: pd.Series, cost: float) -> list[dict]:
    ot = book.get("open_trade")
    if not ot or ot.get("status") not in ("pending_entry", "pending_exit"):
        return []
    since = ot["signal_date"] if ot["status"] == "pending_entry" else ot["exit_signal_date"]
    after = s[s.index > pd.Timestamp(since)]
    if not len(after):
        return []
    day, px = after.index[0], float(after.iloc[0])
    if ot["status"] == "pending_entry":
        ot.update(status="open", entry_date=day.strftime("%Y-%m-%d"), entry_price=px * (1.0 + cost))
        return [{"event": "entry", **copy.deepcopy(ot)}]
    exit_price = px * (1.0 - cost)
    trade = {**ot, "status": "closed", "exit_date": day.strftime("%Y-%m-%d"), "exit_price": exit_price,
             "return": exit_price / float(ot["entry_price"]) - 1.0,
             "days_held": int((day - pd.Timestamp(ot["entry_date"])).days)}
    book["trades"].append(trade)
    book["open_trade"] = None
    return [{"event": "exit", **copy.deepcopy(trade)}]


# --------------------------------------------------------------------------------------------------------
# Scoring: what each book's promotion test needs
# --------------------------------------------------------------------------------------------------------

def _ols_newey_west(y: np.ndarray, x: np.ndarray, lags: int) -> tuple[float, float, float | None]:
    """OLS y = a + b x; returns (a, b, t of a) with Newey-West (Bartlett) standard errors."""
    X = np.column_stack([np.ones_like(x), x])
    xtx_inv = np.linalg.pinv(X.T @ X)
    coef = xtx_inv @ X.T @ y
    resid = y - X @ coef
    xe = X * resid[:, None]
    s = xe.T @ xe
    for lag in range(1, min(int(lags), len(y) - 1) + 1):
        gamma = xe[lag:].T @ xe[:-lag]
        s += (1.0 - lag / (lags + 1.0)) * (gamma + gamma.T)
    var = (xtx_inv @ s @ xtx_inv)[0, 0]
    t = float(coef[0] / math.sqrt(var)) if var > 0 else None
    return float(coef[0]), float(coef[1]), t


def eth_promotion(weeks: list[Mapping[str, Any]], cfg: Mapping[str, Any] | None = None) -> dict:
    """Track 15 R2's promotion test for the ETH switch: timing alpha vs holding ETH with t >= 2 over >= 24 months.

    Built from the weekly records: over each week the switch holds ETH if the previous week's switch was on
    (paying `cost_per_side` on each change), and T-bills otherwise. The switch's weekly excess return is regressed
    on ETH's, with Newey-West standard errors. The weekly series ignores the one-day fill lag. The trade list in
    the book is the exact record.
    Returns {"weeks", "months", "alpha_annual", "beta", "t", "passes", "rule"}.
    """
    cfg = dict(cfg or {})
    rule = {**ETH_PROMOTION, **(cfg.get("promotion") or {})}
    cost = float(cfg.get("cost_per_side", ETH_DEFAULTS["cost_per_side"]))
    obs = [w for w in weeks if _num(w.get("close")) is not None]
    out = {"weeks": max(len(obs) - 1, 0), "months": 0.0, "alpha_annual": None, "beta": None, "t": None,
           "passes": False, "rule": f"t >= {rule['min_t']} over >= {rule['min_months']} months (track 15 R2)"}
    if len(obs) < 2:
        return out
    dates = pd.DatetimeIndex([pd.Timestamp(w["week_end"]) for w in obs])
    out["months"] = float((dates[-1] - dates[0]).days / 30.4375)
    closes = np.array([float(w["close"]) for w in obs])
    on = np.array([1.0 if w.get("on") else 0.0 for w in obs])
    rf_annual = np.array([float(w.get("rf") or 0.0) for w in obs])
    span = np.array([(b - a).days for a, b in zip(dates[:-1], dates[1:])], dtype=float)   # days per period
    hold = closes[1:] / closes[:-1] - 1.0
    rf = rf_annual[:-1] * span / 365.0
    pos = on[:-1]
    switches = np.abs(np.diff(np.concatenate([[0.0], pos])))
    strat = pos * hold + (1.0 - pos) * rf - cost * switches
    if len(hold) < 8 or float(np.std(hold)) == 0.0:
        return out
    alpha, beta, t = _ols_newey_west(strat - rf, hold - rf, int(rule["nw_lags"]))
    periods_a_year = 365.0 / float(np.mean(span))
    out.update(alpha_annual=alpha * periods_a_year, beta=beta, t=t,
               passes=bool(t is not None and t >= float(rule["min_t"]) and out["months"] >= float(rule["min_months"])))
    return out


def m6_summary(events: list[Mapping[str, Any]]) -> dict:
    """Evidence per M6 sub-book for the reviews: events, open, closed, mean return and hit rate.

    Depeg rows also give the eligible coins alone (watch-only coins such as USDT are scored but not counted).
    Carry rows give the mean annualised excess over T-bills. Track 05 §11 expects +3-14% per depeg in days
    (n about 3) and a basis less costs of about 10-20% a year when the carry trigger holds.
    """
    out: dict[str, dict] = {}
    for kind in ("depeg", "carry"):
        evs = [e for e in events if e.get("kind") == kind]
        done = [e for e in evs if e.get("status") == "closed" and e.get("return") is not None]
        rets = [float(e["return"]) for e in done]
        row: dict[str, Any] = {"events": len(evs), "open": sum(1 for e in evs if e.get("status") == "open"),
                               "closed": len(done), "mean_return": _mean(rets),
                               "hit_rate": _mean([1.0 if r > 0 else 0.0 for r in rets])}
        if kind == "depeg":
            counted = [float(e["return"]) for e in done if e.get("eligible", True)]
            row.update(eligible_closed=len(counted), eligible_mean_return=_mean(counted))
        else:
            row["mean_excess_annual"] = _mean([float(e["excess_annual"]) for e in done
                                               if e.get("excess_annual") is not None])
        out[kind] = row
    return out
