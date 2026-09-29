"""G3, the gems satellite (design v4 §3 G3, §4; track 35 §3.3 and §6 G1-G2): the pure rules, with no I/O.

* G3a, the CEF crash-discount buy (track 35 G2; the rule of `research/code/35-gems/cef_crash_discounts.py`): a
  closed-end fund's discount to NAV at the close at least `z` (2.5) standard deviations below its trailing
  `lookback` (252)-session mean, with a NAV printed the same evening, fund leverage <= `leverage_max` (35%), price
  >= `price_min` ($5) and a 20-session average dollar volume >= `adv_min_usd` ($1m); at most `slots` (2) open, the
  widest discount (the lowest z) first; out at the last session within `hold_days` (60 calendar days) of the entry
  or on the first close where the discount is back at its trailing mean. Crash mode: when `crash_mode_triggers`
  (10) funds trigger in one Monday-Sunday week the entries are staggered over `crash_mode_weeks` (3) weeks, at most
  ceil(slots / weeks) new entries a week (the rule's only losing year, 2008, bought the first leg).
* G3b, the crypto-trust discount with a filed catalyst (track 35 G1): a US-listed closed-end crypto trust without
  redemptions at a discount <= `discount_le` (-25%) on each of the last `closes` (5) closes, with a conversion
  filing (S-1, S-1/A, S-3 or S-3/A by the trust's own CIK, not withdrawn) or a dated decision within
  `catalyst_days` (120) days; never at a premium. Out at a discount >= `exit_discount_ge` (-3%) on `exit_closes`
  (3) consecutive closes, at the conversion (NAV tracking begins), or when the filing is withdrawn or denied. NAV
  is rebuilt from the coin's price and the sponsor's coins-per-share figure decayed at the sponsor fee (track 35
  §3.1), or read from a sponsor NAV series when the provider has one.
* The promotion tests (track 35 §6): the CEF rule needs >= 30 closed shadow trades with a mean excess over random
  entry >= +1.5% per 60 sessions and a positive median excess in both halves of the sample (by entry date); the
  trust rule >= 3 resolved episodes with a mean excess over the coin >= +10% and no episode whose discount widened
  by more than 15 points after the entry. Promotion itself is the owner's decision (`status: live`).

Conventions. Discounts are fractions (price / NAV - 1; -0.25 is a 25% discount). NAV histories are cleaned the way
the reference script cleans them: non-positive prints dropped, a gap carried forward at most 3 sessions, a discount
outside +-60% blanked as a bad print; the rolling mean and standard deviation use 252 sessions with at least 200
observations. Every check returns a dict with a boolean verdict, the numbers it looked at and `reasons` (the
conditions that held when it fires, the ones that failed otherwise), as `w10_crashbuy.w10_signal` does. A missing
or stale input fails closed: a forward-filled or older NAV is "nav stale", an unknown leverage figure is "leverage
unknown", fewer than 200 discount observations is "insufficient history". The runner (`traderec.runners.g3`) reads
the bars, keeps the state and writes the ledger.
"""
from __future__ import annotations

import math
from datetime import date as date_type
from datetime import timedelta
from typing import Any, Iterable, Sequence

import numpy as np
import pandas as pd

from traderec.market_calendar import is_trading_day, iso, next_trading_day

__all__ = [
    "BAD_PRINT", "CONVERSION_FORMS", "DEFAULT_HORIZON", "DEFAULT_LOOKBACK", "DEFAULT_MIN_OBS",
    "average_dollar_volume", "catalyst_status", "cef_crash_check", "cef_discount", "cef_exit_check", "cef_exit_due",
    "cef_promotion_test", "crash_mode_update", "crypto_trust_check", "crypto_trust_exit_check", "discount_stats",
    "entry_capacity", "fnum", "iso_week", "nav_symbol", "random_entry_baseline", "rank_triggers", "same_evening_nav",
    "shadow_stats", "total_return_price", "trust_nav", "trust_nav_series", "trust_promotion_test",
    "week_bounds", "widened",
]

BAD_PRINT = 0.60              # a discount outside +-60% is a bad NAV print (the reference script blanks it)
NAV_FFILL_LIMIT = 3           # a NAV gap is carried forward at most 3 sessions in the history (never on the signal day)
DEFAULT_LOOKBACK = 252        # sessions of the rolling mean and standard deviation ...
DEFAULT_MIN_OBS = 200         # ... with at least this many discount observations
DEFAULT_ADV_SESSIONS = 20     # the average dollar volume's window
DEFAULT_HORIZON = 60          # sessions: the scoring horizon and the random-entry baseline's window
DEFAULT_MIN_WINDOWS = 100     # the baseline needs this many complete 60-session windows in the trailing lookback
CONVERSION_FORMS = ("S-1", "S-1/A", "S-3", "S-3/A")     # the conversion filings that count as a catalyst
WIDENING_POINTS = 0.15        # "the discount widened by more than 15 points after entry" (track 35 G1)


# --------------------------------------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------------------------------------

def fnum(x: Any) -> float | None:
    """A finite float, or None (bools, strings that are not numbers and NaN are not numbers here)."""
    if isinstance(x, bool) or x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


_f = fnum


def _closes(bars: pd.DataFrame | None, upto: pd.Timestamp, column: str = "close") -> pd.Series:
    """The positive, finite values of one column up to and including `upto`, sorted, as floats."""
    if bars is None or column not in bars or not len(bars):
        return pd.Series(dtype=float)
    s = pd.to_numeric(bars[column], errors="coerce").dropna().astype(float).sort_index()
    s = s[np.isfinite(s.values) & (s.values > 0)]
    return s.loc[:upto]


def nav_symbol(ticker: str, pattern: str = "X{ticker}X") -> str:
    """Yahoo's NAV symbol for a closed-end fund ("PCN" -> "XPCNX"), as the EDGAR CEF screen builds it."""
    return str(pattern).format(ticker=str(ticker).upper())


def iso_week(date: str) -> str:
    """The ISO week of a date, "2026-W41" (Monday to Sunday: the crash-mode counting week)."""
    y, w, _ = pd.Timestamp(date).isocalendar()
    return f"{int(y)}-W{int(w):02d}"


def week_bounds(date: str) -> tuple[str, str]:
    """(Monday, Sunday) of the ISO week holding `date`."""
    d = pd.Timestamp(date).date()
    monday = d - timedelta(days=d.weekday())
    return monday.isoformat(), (monday + timedelta(days=6)).isoformat()


# --------------------------------------------------------------------------------------------------------
# G3a: the CEF crash-discount rule
# --------------------------------------------------------------------------------------------------------

def cef_discount(price_close: pd.Series, nav_close: pd.Series) -> pd.Series:
    """The discount history (price / NAV - 1) with the reference script's cleaning.

    NAV prints that are not positive are dropped, a NAV gap is carried forward at most `NAV_FFILL_LIMIT` (3)
    sessions, sessions without both a price and a NAV are left out, and a discount outside +-`BAD_PRINT` (60%) is
    blanked as a bad print (NaN). The result is indexed by the sessions that have a price and a (carried) NAV.
    """
    p = pd.to_numeric(price_close, errors="coerce").dropna().astype(float)
    p = p[p > 0].rename("p")
    n = pd.to_numeric(nav_close, errors="coerce").astype(float)
    n = n.where(n > 0).rename("nav")
    df = pd.concat([p, n], axis=1).sort_index()
    df["nav"] = df["nav"].ffill(limit=NAV_FFILL_LIMIT)
    df = df.dropna(subset=["p", "nav"])
    disc = df["p"] / df["nav"] - 1.0
    disc[(disc < -BAD_PRINT) | (disc > BAD_PRINT)] = np.nan
    return disc.rename("discount")


def discount_stats(discount: pd.Series, lookback: int = DEFAULT_LOOKBACK, min_obs: int = DEFAULT_MIN_OBS) -> pd.DataFrame:
    """The rolling mean, standard deviation and z-score of a discount history (252 sessions, at least 200 prints).

    Returns a frame with columns discount, mean, sd, z and n (the observations in the window); z is NaN where the
    window holds fewer than `min_obs` prints or the standard deviation is zero.
    """
    d = pd.to_numeric(discount, errors="coerce").astype(float)
    roll = d.rolling(int(lookback), min_periods=int(min_obs))
    m, s, n = roll.mean(), roll.std(), roll.count()
    z = (d - m) / s.where(s > 0)
    return pd.DataFrame({"discount": d, "mean": m, "sd": s, "z": z, "n": n})


def same_evening_nav(nav_bars: pd.DataFrame | None, date: str) -> float | None:
    """The NAV printed for `date` itself (no forward fill), or None: a stale NAV never makes a signal."""
    ts = pd.Timestamp(date)
    s = _closes(nav_bars, ts)
    if s.empty or s.index[-1] != ts:
        return None
    return float(s.iloc[-1])


def average_dollar_volume(bars: pd.DataFrame | None, date: str, sessions: int = DEFAULT_ADV_SESSIONS) -> float | None:
    """The mean of close x volume over the last `sessions` sessions up to `date`; None with fewer sessions."""
    if bars is None or not len(bars) or "volume" not in bars:
        return None
    ts = pd.Timestamp(date)
    upto = bars.loc[:ts]
    dv = (pd.to_numeric(upto["close"], errors="coerce") * pd.to_numeric(upto["volume"], errors="coerce")).dropna()
    if len(dv) < int(sessions):
        return None
    v = float(dv.tail(int(sessions)).mean())
    return v if math.isfinite(v) else None


def cef_crash_check(bars: pd.DataFrame | None, nav_bars: pd.DataFrame | None, date: str, cfg_rule: dict,
                    fund_meta: dict | None) -> dict[str, Any]:
    """The CEF crash-discount trigger at the close of `date` (design v4 §3 G3a; track 35 §3.3).

    Triggers only when ALL hold: the fund's discount z-score on the close of `date` is <= -`z` (2.5) against its
    trailing 252-session mean and standard deviation (at least 200 observations); the NAV series has a print
    stamped `date` (a forward-filled or older NAV is "nav stale"); the close is >= `price_min`; the 20-session
    average dollar volume is >= `adv_min_usd`; and the fund's leverage (`fund_meta["leverage"]`, an owner-maintained
    figure with its `as_of` date) is <= `leverage_max`. A missing leverage figure or date fails closed ("leverage
    unknown"). Returns {"trigger", "z", "discount", "mean252", "sd252", "price", "adv_usd", "leverage", "nav",
    "observations", "reasons"}.
    """
    ts = pd.Timestamp(date)
    meta = fund_meta or {}
    out: dict[str, Any] = {"trigger": False, "z": None, "discount": None, "mean252": None, "sd252": None,
                           "price": None, "adv_usd": None, "leverage": _f(meta.get("leverage")), "nav": None,
                           "observations": 0, "reasons": []}
    z_max = -abs(float(cfg_rule.get("z", 2.5)))
    lookback = int(cfg_rule.get("lookback", DEFAULT_LOOKBACK))
    min_obs = int(cfg_rule.get("min_observations", DEFAULT_MIN_OBS))
    price_min = float(cfg_rule.get("price_min", 5.0))
    adv_min = float(cfg_rule.get("adv_min_usd", 1_000_000))
    lev_max = float(cfg_rule.get("leverage_max", 0.35))
    passed: list[str] = []
    failed: list[str] = []

    closes = _closes(bars, ts)
    price = None
    if closes.empty or closes.index[-1] != ts:
        failed.append(f"no close on {ts.date()}")
    else:
        price = float(closes.iloc[-1])
        out["price"] = price

    nav_all = _closes(nav_bars, ts)
    nav_today = same_evening_nav(nav_bars, date)
    if nav_all.empty:
        failed.append("no NAV series")
    elif nav_today is None:
        failed.append(f"nav stale (last print {nav_all.index[-1].date()})")
    out["nav"] = nav_today

    if price is not None and nav_today is not None:
        disc = cef_discount(closes, nav_all)
        stats = discount_stats(disc, lookback, min_obs)
        row = stats.loc[ts] if ts in stats.index else None
        raw = price / nav_today - 1.0
        if abs(raw) > BAD_PRINT:
            failed.append(f"discount {raw:+.1%} outside +-{BAD_PRINT:.0%}: a bad NAV print")
        elif row is None:
            failed.append("no discount observation on the signal day")
        else:
            out.update(discount=float(row["discount"]), observations=int(row["n"]) if pd.notna(row["n"]) else 0,
                       mean252=_f(row["mean"]), sd252=_f(row["sd"]), z=_f(row["z"]))
            if out["z"] is None:
                failed.append(f"insufficient history: {out['observations']} discount observations in the last "
                              f"{lookback} sessions, fewer than {min_obs}")
            elif out["z"] <= z_max:
                passed.append(f"discount {out['discount']:+.1%} is {abs(out['z']):.1f} sd below its {lookback}-session "
                              f"mean {out['mean252']:+.1%} (z {out['z']:.2f} <= {z_max:.1f})")
            else:
                failed.append(f"z {out['z']:.2f} > {z_max:.1f} (discount {out['discount']:+.1%}, mean "
                              f"{out['mean252']:+.1%}, sd {out['sd252']:.1%})")

    if price is not None:
        if price >= price_min:
            passed.append(f"price {price:.2f} >= {price_min:g}")
        else:
            failed.append(f"price {price:.2f} below {price_min:g}")
    adv = average_dollar_volume(bars, date)
    out["adv_usd"] = adv
    if adv is None:
        failed.append("average dollar volume unknown")
    elif adv >= adv_min:
        passed.append(f"average dollar volume {adv:,.0f} >= {adv_min:,.0f}")
    else:
        failed.append(f"average dollar volume {adv:,.0f} below {adv_min:,.0f}")
    lev = out["leverage"]
    if lev is None or not meta.get("as_of"):
        failed.append("leverage unknown")
    elif lev <= lev_max:
        passed.append(f"leverage {lev:.0%} <= {lev_max:.0%} (as of {meta.get('as_of')})")
    else:
        failed.append(f"leverage {lev:.0%} above {lev_max:.0%} (as of {meta.get('as_of')})")

    out["trigger"] = not failed and out["z"] is not None
    out["reasons"] = failed if failed else passed
    return out


def cef_exit_due(entry_date: str, hold_days: int) -> str:
    """The last NYSE session dated on or before entry + `hold_days` calendar days (design §4 "Time stops")."""
    d = (pd.Timestamp(entry_date) + pd.Timedelta(days=int(hold_days))).date()
    while not is_trading_day(d):
        d -= timedelta(days=1)
    return d.isoformat()


def cef_exit_check(bars: pd.DataFrame | None, nav_bars: pd.DataFrame | None, date: str, event: dict,
                   cfg_rule: dict, *, next_chance: str | None = None) -> dict[str, Any]:
    """The exit test at the close of `date` for an open CEF slot (design v4 §3 G3a).

    The exit is signalled tonight when the position must be sold at the next opportunity to stay within
    `hold_days` calendar days of the entry (`next_chance` is the date of the opportunity after the next one: the
    second session after `date` for the shadow book, the Monday after the next Sunday email's Monday for a live
    slot; the exit fires when `exit_due` comes before it), or when today's discount is at or above its trailing
    252-session mean (the same-evening NAV and at least 200 observations are needed; without them only the time
    stop applies). Returns {"exit", "reason", "exit_due", "discount", "mean252", "z", "days_held", "reasons"}.
    """
    entry = str(event.get("entry_date") or event.get("signal_date"))
    exit_due = str(event.get("exit_due") or cef_exit_due(entry, int(cfg_rule.get("hold_days", 60))))
    ts = pd.Timestamp(date)
    nxt = iso(next_trading_day(date))
    chance = str(next_chance or iso(next_trading_day(nxt)))
    out: dict[str, Any] = {"exit": False, "reason": None, "exit_due": exit_due, "discount": None, "mean252": None,
                           "z": None, "days_held": int((ts - pd.Timestamp(entry)).days), "reasons": []}
    reasons: list[str] = []
    if exit_due < chance:
        reasons.append(f"time stop: the last session within {int(cfg_rule.get('hold_days', 60))} calendar days of "
                       f"the entry is {exit_due}")
    closes = _closes(bars, ts)
    nav_today = same_evening_nav(nav_bars, date)
    if not closes.empty and closes.index[-1] == ts and nav_today is not None:
        stats = discount_stats(cef_discount(closes, _closes(nav_bars, ts)),
                               int(cfg_rule.get("lookback", DEFAULT_LOOKBACK)),
                               int(cfg_rule.get("min_observations", DEFAULT_MIN_OBS)))
        if ts in stats.index:
            row = stats.loc[ts]
            out.update(discount=_f(row["discount"]), mean252=_f(row["mean"]), z=_f(row["z"]))
            if out["discount"] is not None and out["mean252"] is not None and out["discount"] >= out["mean252"]:
                reasons.append(f"discount {out['discount']:+.1%} is back at its mean {out['mean252']:+.1%}")
    if reasons:
        out["exit"] = True
        out["reason"] = "time_stop" if reasons[0].startswith("time stop") else "mean_reversion"
        out["reasons"] = reasons
    else:
        out["reasons"] = [f"held {out['days_held']} days, exit due {exit_due}"
                          + (f", discount {out['discount']:+.1%} below its mean {out['mean252']:+.1%}"
                             if out["discount"] is not None and out["mean252"] is not None else "")]
    return out


def crash_mode_update(prev: dict | None, date: str, week_triggers: int, cfg_rule: dict) -> dict | None:
    """The crash-mode state after this week's distinct trigger count (design v4 §3 G3a; track 35 §6 G2).

    Crash mode starts (or restarts) when at least `crash_mode_triggers` (10) funds have triggered in the Monday-
    Sunday week holding `date`; it lasts that week and the next `crash_mode_weeks` - 1 weeks, and allows at most
    ceil(slots / crash_mode_weeks) new entries a week. Returns the state ({"since", "until", "week", "per_week",
    "weeks", "triggers"}) or None once it has lapsed.
    """
    threshold = int(cfg_rule.get("crash_mode_triggers", 10))
    weeks = max(int(cfg_rule.get("crash_mode_weeks", 3)), 1)
    slots = int(cfg_rule.get("slots", 2))
    per_week = max(int(math.ceil(slots / weeks)), 1)
    monday, _ = week_bounds(date)
    if int(week_triggers) >= threshold:
        until = (pd.Timestamp(monday) + pd.Timedelta(days=7 * weeks - 1)).strftime("%Y-%m-%d")
        if prev and prev.get("week") == iso_week(date):
            return {**prev, "triggers": int(week_triggers)}
        return {"since": str(date), "until": until, "week": iso_week(date), "per_week": per_week, "weeks": weeks,
                "triggers": int(week_triggers)}
    if prev and str(date) <= str(prev.get("until") or ""):
        return prev
    return None


def entry_capacity(open_count: int, slots: int, crash_mode: dict | None, entries_this_week: int) -> int:
    """How many new entries the rule may open tonight: the free slots, and in crash mode at most `per_week` a week."""
    free = max(int(slots) - int(open_count), 0)
    if crash_mode:
        free = min(free, max(int(crash_mode.get("per_week", 1)) - int(entries_this_week), 0))
    return free


def rank_triggers(triggers: Iterable[dict]) -> list[dict]:
    """The widest discount first: the lowest z, then the lowest discount, then the ticker."""
    return sorted(triggers, key=lambda t: (float(t.get("z") if t.get("z") is not None else 0.0),
                                           float(t.get("discount") if t.get("discount") is not None else 0.0),
                                           str(t.get("ticker") or "")))


# --------------------------------------------------------------------------------------------------------
# G3b: the crypto-trust discount with a filed catalyst
# --------------------------------------------------------------------------------------------------------

def _coins_on(coins_per_share: Any, as_of: Any, fee_annual: Any, day: Any) -> float | None:
    cps, fee = _f(coins_per_share), _f(fee_annual)
    if cps is None or cps <= 0 or fee is None or fee < 0 or not as_of:
        return None
    try:
        days = (pd.Timestamp(day) - pd.Timestamp(str(as_of)[:10])).days
    except (TypeError, ValueError):
        return None
    return cps * (1.0 - fee / 365.0) ** days


def trust_nav(coin_close: pd.Series, coins_per_share: Any, as_of: Any, fee_annual: Any, date: str) -> float | None:
    """NAV per share on `date`: the coin's close that day x the sponsor's coins-per-share figure decayed at the
    sponsor fee (a daily accrual of `fee_annual` / 365 from `as_of`; track 35 §3.1). None when an input is missing
    or the coin has no close stamped `date` (a stale coin price never makes a NAV)."""
    ts = pd.Timestamp(date)
    s = _closes(pd.DataFrame({"close": coin_close}), ts) if isinstance(coin_close, pd.Series) else pd.Series(dtype=float)
    if s.empty or s.index[-1] != ts:
        return None
    coins = _coins_on(coins_per_share, as_of, fee_annual, ts)
    return None if coins is None else float(s.iloc[-1]) * coins


def trust_nav_series(coin_close: pd.Series, coins_per_share: Any, as_of: Any, fee_annual: Any) -> pd.Series:
    """The rebuilt NAV history (see `trust_nav`), one value per coin close; empty when an input is missing."""
    s = pd.to_numeric(coin_close, errors="coerce").dropna().astype(float).sort_index()
    s = s[s > 0]
    coins = [_coins_on(coins_per_share, as_of, fee_annual, d) for d in s.index]
    if not len(s) or any(c is None for c in coins):
        return pd.Series(dtype=float, name="nav")
    return pd.Series(s.values * np.asarray(coins, dtype=float), index=s.index, name="nav")


def catalyst_status(catalyst: dict | None, date: str, cfg_rule: dict, cik: Any = None) -> dict[str, Any]:
    """Whether a catalyst is on file for `date` (design v4 §3 G3b): a conversion filing (`filing`: {form, filed,
    url, cik, withdrawn}) whose form is S-1, S-1/A, S-3 or S-3/A, by the trust's own CIK and not withdrawn, or a
    dated decision (`decision_date`) within `catalyst_days` days after `date`. Returns {"ok", "kind", "reasons"}."""
    cat = catalyst or {}
    days = int(cfg_rule.get("catalyst_days", 120))
    filing = cat.get("filing") if isinstance(cat.get("filing"), dict) else None
    reasons: list[str] = []
    if filing:
        form = str(filing.get("form") or "").upper()
        filer = filing.get("cik")
        if form not in CONVERSION_FORMS:
            reasons.append(f"filing {form or '?'} is not a conversion form")
        elif filing.get("withdrawn"):
            reasons.append(f"the {form} filed {filing.get('filed')} was withdrawn")
        elif cik is not None and (filer is None or str(filer) != str(cik)):
            reasons.append(f"the {form} is not by the trust's own CIK")
        else:
            return {"ok": True, "kind": "filing", "reasons": [f"{form} filed {filing.get('filed')} by the trust"]}
    else:
        reasons.append("no conversion filing on file")
    decision = cat.get("decision_date")
    if decision:
        try:
            delta = (pd.Timestamp(str(decision)[:10]) - pd.Timestamp(date)).days
        except (TypeError, ValueError):
            delta = None
        if delta is not None and 0 <= delta <= days:
            return {"ok": True, "kind": "decision", "reasons": [f"decision dated {str(decision)[:10]}, in {delta} days"]}
        reasons.append(f"decision dated {str(decision)[:10]} is not within {days} days")
    else:
        reasons.append("no dated decision")
    return {"ok": False, "kind": None, "reasons": reasons}


def _last_discounts(price_close: pd.Series, nav_close: pd.Series, date: str, n: int) -> tuple[list[float], list[str]]:
    """The discounts on the last `n` sessions ending at `date` and the problems found (a missing close or NAV)."""
    ts = pd.Timestamp(date)
    p = _closes(pd.DataFrame({"close": price_close}), ts)
    problems: list[str] = []
    if p.empty or p.index[-1] != ts:
        return [], [f"no close on {ts.date()}"]
    tail = p.tail(int(n))
    if len(tail) < int(n):
        return [], [f"fewer than {n} closes"]
    nav = pd.to_numeric(nav_close, errors="coerce").astype(float) if isinstance(nav_close, pd.Series) else pd.Series(dtype=float)
    out: list[float] = []
    for day, px in tail.items():
        v = nav.get(day) if len(nav) else None
        v = _f(v)
        if v is None or v <= 0:
            problems.append(f"NAV missing on {pd.Timestamp(day).date()}")
            continue
        out.append(float(px) / v - 1.0)
    return out, problems


def crypto_trust_check(price_close: pd.Series, nav_close: pd.Series, date: str, cfg_rule: dict,
                       catalyst: dict | None, *, cik: Any = None) -> dict[str, Any]:
    """The crypto-trust entry at the close of `date` (design v4 §3 G3b; track 35 §6 G1).

    Triggers when the discount is <= `discount_le` (-25%) on each of the last `closes` (5) sessions (each with its
    own NAV) AND a catalyst is on file (`catalyst_status`). A premium (discount > 0) never triggers. Returns
    {"trigger", "discount", "discounts", "price", "nav", "catalyst", "reasons"}.
    """
    n = int(cfg_rule.get("closes", 5))
    level = float(cfg_rule.get("discount_le", -0.25))
    discounts, problems = _last_discounts(price_close, nav_close, date, n)
    ts = pd.Timestamp(date)
    p = _closes(pd.DataFrame({"close": price_close}), ts)
    out: dict[str, Any] = {"trigger": False, "discount": discounts[-1] if discounts and not problems else None,
                           "discounts": discounts, "price": float(p.iloc[-1]) if len(p) and p.index[-1] == ts else None,
                           "nav": None, "catalyst": None, "reasons": []}
    if out["price"] is not None and out["discount"] is not None:
        out["nav"] = out["price"] / (1.0 + out["discount"])
    passed: list[str] = []
    failed: list[str] = list(problems)
    if not problems:
        if out["discount"] > 0:
            failed.append(f"premium {out['discount']:+.1%}: never bought")
        deep = [d for d in discounts if d <= level]
        if len(deep) == n:
            passed.append(f"discount <= {level:+.0%} on each of the last {n} closes (today {out['discount']:+.1%})")
        else:
            failed.append(f"discount above {level:+.0%} on {n - len(deep)} of the last {n} closes (today "
                          f"{out['discount']:+.1%})")
    cat = catalyst_status(catalyst, date, cfg_rule, cik)
    out["catalyst"] = cat
    if cat["ok"]:
        passed.append("catalyst: " + "; ".join(cat["reasons"]))
    else:
        failed.append("no catalyst: " + "; ".join(cat["reasons"]))
    out["trigger"] = not failed
    out["reasons"] = failed if failed else passed
    return out


def crypto_trust_exit_check(price_close: pd.Series, nav_close: pd.Series, date: str, episode: dict, cfg_rule: dict,
                            catalyst: dict | None, trust_meta: dict | None = None) -> dict[str, Any]:
    """The exit test at the close of `date` for an open trust episode: the discount >= `exit_discount_ge` (-3%) on
    `exit_closes` (3) consecutive closes ("discount_closed"), the conversion date reached (`trust_meta["conversion_date"]`,
    "conversion"), or the filing withdrawn or denied (the catalyst's filing marked withdrawn, or
    `trust_meta["withdrawn_date"]` reached; "filing_withdrawn"). Returns {"exit", "reason", "discount",
    "discounts", "reasons"}; the discounts feed the widening flag."""
    n = int(cfg_rule.get("exit_closes", 3))
    level = float(cfg_rule.get("exit_discount_ge", -0.03))
    meta = trust_meta or {}
    discounts, problems = _last_discounts(price_close, nav_close, date, n)
    out: dict[str, Any] = {"exit": False, "reason": None, "discount": discounts[-1] if discounts and not problems else None,
                           "discounts": discounts, "reasons": []}
    reasons: list[tuple[str, str]] = []
    if not problems and len(discounts) == n and all(d >= level for d in discounts):
        reasons.append(("discount_closed", f"discount >= {level:+.0%} on {n} consecutive closes (today {discounts[-1]:+.1%})"))
    conv = meta.get("conversion_date")
    if conv and str(conv)[:10] <= str(date):
        reasons.append(("conversion", f"conversion date {str(conv)[:10]} reached: NAV tracking begins"))
    filing = (catalyst or {}).get("filing") if isinstance((catalyst or {}).get("filing"), dict) else None
    withdrawn_on = meta.get("withdrawn_date")
    if (filing and filing.get("withdrawn")) or (withdrawn_on and str(withdrawn_on)[:10] <= str(date)):
        reasons.append(("filing_withdrawn", "the conversion filing was withdrawn or denied"))
    if reasons:
        out.update(exit=True, reason=reasons[0][0], reasons=[r for _, r in reasons])
    else:
        out["reasons"] = problems or [f"discount {discounts[-1]:+.1%}, exit at {level:+.0%} on {n} closes"]
    return out


def widened(entry_discount: Any, min_discount: Any, points: float = WIDENING_POINTS) -> bool:
    """True when the discount widened by more than `points` (15 points) after the entry: entry -30%, low -46%."""
    e, m = _f(entry_discount), _f(min_discount)
    return e is not None and m is not None and (e - m) > float(points)


# --------------------------------------------------------------------------------------------------------
# Scoring: the total-return basis and the random-entry baseline
# --------------------------------------------------------------------------------------------------------

def total_return_price(bars: pd.DataFrame | None, day: str, price: float) -> float:
    """`price` on the total-return basis: x adj_close / close of `day` (the fund's distributions during the hold
    count, as the reference script's adjusted closes do); the price itself when the ratio is unavailable."""
    try:
        ts = pd.Timestamp(day)
        if bars is None or ts not in bars.index:
            return float(price)
        adj, close = _f(bars.at[ts, "adj_close"]), _f(bars.at[ts, "close"])
        if adj is None or close is None or close <= 0 or adj <= 0:
            return float(price)
        return float(price) * adj / close
    except (KeyError, TypeError, ValueError):
        return float(price)


def random_entry_baseline(adj_close: pd.Series, entry_date: str, horizon: int = DEFAULT_HORIZON,
                          lookback: int = DEFAULT_LOOKBACK, min_windows: int = DEFAULT_MIN_WINDOWS) -> float | None:
    """The fund's unconditional mean `horizon`-session total return over the trailing `lookback` sessions before
    the entry: every window that starts in those sessions and ends before the entry day (no look-ahead). None with
    fewer than `min_windows` complete windows (the event then carries no excess)."""
    s = pd.to_numeric(adj_close, errors="coerce").dropna().astype(float).sort_index()
    s = s[s > 0]
    s = s[s.index < pd.Timestamp(entry_date)]
    h = int(horizon)
    L = len(s)
    starts = range(max(L - int(lookback), 0), L - h)
    if len(starts) < int(min_windows):
        return None
    v = s.values
    rets = [v[t + h] / v[t] - 1.0 for t in starts]
    return float(np.mean(rets))


# --------------------------------------------------------------------------------------------------------
# Promotion tests (track 35 §6) and the shadow tally
# --------------------------------------------------------------------------------------------------------

def _check(name: str, value: Any, threshold: Any, ok: bool) -> dict:
    return {"name": name, "value": value, "threshold": threshold, "ok": bool(ok)}


def _result(checks: list[dict], n: int, extra: dict) -> dict:
    passed = bool(checks) and all(c["ok"] for c in checks)
    failing = [c for c in checks if not c["ok"]]
    reason = "every check passes" if passed else (
        f"{failing[0]['name']}: {_fmt(failing[0]['value'])} against {_fmt(failing[0]['threshold'])}" if failing
        else "no checks")
    return {"passed": passed, "n": int(n), "checks": checks, "reason": reason,
            "checks_ok": sum(1 for c in checks if c["ok"]), "checks_total": len(checks), **extra}


def _fmt(x: Any) -> str:
    v = _f(x)
    if v is None:
        return "unknown"
    return f"{v:.4g}"


def _median(xs: Sequence[float]) -> float | None:
    return float(np.median(xs)) if len(xs) else None


def _event_excess(e: dict, baseline: Any) -> tuple[float | None, float | None]:
    """(return, excess) of a closed CEF event: its own `excess`, else return - baseline (the event's own
    `baseline`, else the `baseline` given: a number, or a dict keyed by the event's id)."""
    r = _f(e.get("return"))
    if r is None:
        return None, None
    ex = _f(e.get("excess"))
    if ex is not None:
        return r, ex
    b = _f(e.get("baseline"))
    if b is None:
        b = _f(baseline.get(str(e.get("id")))) if isinstance(baseline, dict) else _f(baseline)
    return r, (None if b is None else r - b)


def cef_promotion_test(closed_events: Iterable[dict], baseline: Any = None, rule: dict | None = None) -> dict:
    """The CEF rule's pre-registered promotion test (track 35 §6 G2) on its closed shadow trades.

    n >= `min_trades` (30) events with a scored excess; mean excess over random entry >= `min_mean_excess` (+1.5%
    per 60 sessions; the baseline is the fund's unconditional mean 60-session return over the trailing 252
    sessions before each entry, stored on the event by the runner, else `baseline`); and a positive median excess in
    both halves of the sample by entry date. Events without a scored excess do not count. Returns {"passed", "n",
    "checks": [{"name", "value", "threshold", "ok"}], "reason", "checks_ok", "checks_total", "mean_excess",
    "median_excess", "mean_return", "win_rate", "halves"}.
    """
    rule = {"min_trades": 30, "min_mean_excess": 0.015, **(rule or {})}
    rows: list[tuple[str, float, float]] = []
    for e in closed_events:
        if e.get("status") not in (None, "closed"):
            continue
        r, ex = _event_excess(e, baseline)
        if r is None or ex is None:
            continue
        rows.append((str(e.get("entry_date") or e.get("signal_date") or ""), r, ex))
    rows.sort(key=lambda x: x[0])
    n = len(rows)
    rets = [r for _, r, _ in rows]
    exs = [x for _, _, x in rows]
    mean_ex = float(np.mean(exs)) if exs else None
    half = n // 2
    first, second = exs[:half], exs[half:]
    med1, med2 = _median(first), _median(second)
    checks = [
        _check("closed shadow trades", n, int(rule["min_trades"]), n >= int(rule["min_trades"])),
        _check("mean excess over random entry", mean_ex, float(rule["min_mean_excess"]),
               mean_ex is not None and mean_ex >= float(rule["min_mean_excess"])),
        _check("median excess, first half", med1, 0.0, med1 is not None and med1 > 0.0),
        _check("median excess, second half", med2, 0.0, med2 is not None and med2 > 0.0),
    ]
    return _result(checks, n, {"mean_excess": mean_ex, "median_excess": _median(exs),
                               "mean_return": float(np.mean(rets)) if rets else None,
                               "win_rate": float(np.mean([r > 0 for r in rets])) if rets else None,
                               "halves": [{"n": len(first), "median_excess": med1}, {"n": len(second), "median_excess": med2}],
                               "basis": "random entry"})


def trust_promotion_test(resolved_episodes: Iterable[dict], rule: dict | None = None) -> dict:
    """The crypto-trust rule's promotion test (track 35 §6 G1) on its resolved episodes: n >= `min_episodes` (3)
    with a scored excess over the coin, mean excess >= `min_mean_excess` (+10%), and no episode whose discount
    widened by more than `max_widening` (15 points) after the entry (the runner's `widened` flag, else computed
    from `entry_discount` and `min_discount`). Returns the same shape as `cef_promotion_test`."""
    rule = {"min_episodes": 3, "min_mean_excess": 0.10, "max_widening": WIDENING_POINTS, **(rule or {})}
    rows: list[tuple[float, float, bool]] = []
    for e in resolved_episodes:
        if e.get("status") not in (None, "closed"):
            continue
        r, ex = _f(e.get("return")), _f(e.get("excess"))
        if ex is None and r is not None and _f(e.get("coin_return")) is not None:
            ex = r - float(e["coin_return"])
        if ex is None:
            continue
        flag = e.get("widened")
        if flag is None:
            flag = widened(e.get("entry_discount"), e.get("min_discount"), float(rule["max_widening"]))
        rows.append((r if r is not None else ex, ex, bool(flag)))
    n = len(rows)
    exs = [x for _, x, _ in rows]
    mean_ex = float(np.mean(exs)) if exs else None
    n_wide = sum(1 for _, _, w in rows if w)
    checks = [
        _check("resolved episodes", n, int(rule["min_episodes"]), n >= int(rule["min_episodes"])),
        _check("mean excess over the coin", mean_ex, float(rule["min_mean_excess"]),
               mean_ex is not None and mean_ex >= float(rule["min_mean_excess"])),
        _check("episodes whose discount widened by more than the limit", n_wide, 0, n_wide == 0),
    ]
    rets = [r for r, _, _ in rows]
    return _result(checks, n, {"mean_excess": mean_ex, "median_excess": _median(exs),
                               "mean_return": float(np.mean(rets)) if rets else None,
                               "win_rate": float(np.mean([x > 0 for x in exs])) if exs else None,
                               "widened": n_wide, "basis": "the coin"})


def shadow_stats(closed_events: Iterable[dict]) -> dict[str, Any]:
    """The tally the Sunday email and the reviews show: n, mean and median excess, mean return, win rate, the
    last exit date, over the closed events (an event without a scored excess counts in n, not in the excess)."""
    events = [e for e in closed_events if e.get("status") in (None, "closed") and _f(e.get("return")) is not None]
    rets = [float(e["return"]) for e in events]
    exs = [float(e["excess"]) for e in events if _f(e.get("excess")) is not None]
    return {"n": len(events), "n_scored": len(exs), "mean_return": float(np.mean(rets)) if rets else None,
            "mean_excess": float(np.mean(exs)) if exs else None, "median_excess": _median(exs),
            "win_rate": float(np.mean([r > 0 for r in rets])) if rets else None,
            "last_exit": max((str(e.get("exit_date") or "") for e in events), default=None) or None}


def as_date(value: Any) -> date_type | None:
    """A date from a date-like value, or None."""
    try:
        return pd.Timestamp(value).date()
    except (TypeError, ValueError):
        return None
