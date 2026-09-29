"""Macro shadow books: W3 (cool-CPI TLT), W4 (BoJ), the gold spike fade, and the scheduled-release log.

Design v3.3 §3 M5 ("Scheduled releases. Never traded; logged for calibration only") and §3 "Shadow ledger";
research/17-short-horizon-macro-events.md §0.1, §1, §2, §3.1, §5.2 (W3, W4) and §7 (R1, R2, R6, R9). Pure
functions on in-memory data: no network, no clock, no state. `traderec.runners.macro_shadows` feeds them data
cut at the run date and records the results in the shadow ledger. Nothing here is emailed or traded.

* **Release reactions (R1).** A release's day-0 move runs from the prior session's close to the reaction
  session's close: total-return closes for ETFs, basis points for yields. Forward moves run from the day-0
  close over 1, 5 and 20 sessions (§0.1). The 2-year's day-0 move is the surprise proxy that sets the bucket
  (§2.1-2.2).
* **W3, cool-CPI TLT (§5.2 W3).** On a CPI day the 2-year falls 6bp or more and core CPI prints 0.1% m/m or
  less. Long TLT at the next open. Exit at the open after the 10-year closes above its pre-CPI close (the
  invalidation), or after 20 sessions (R6).
* **W4, BoJ (§5.2 W4).** The BoJ raises its policy rate and the Fed holds at its nearest meeting. Long FXY at
  the next open. Stop at USDJPY +1.5%, target at USDJPY -4%, time stop at 20 sessions. FXY is the yen per
  dollar, so the levels are checked on FXY closes: stop at entry / 1.015, target at entry / 0.96.
* **Gold spike fade (§3.1, R2).** After a listed war onset, short GLD at the next open and cover at the
  following open. The track's own measure, day-0 close to day-1 close, is recorded next to it.

Every rule decides on closes and acts at the next open, as the execution standard requires (§3a): stops and
targets are checked on closes, never as resting orders. A hypothetical trade is entered at the first open after
the evening the rule was *evaluated* (its `signal_date`), never earlier: when an input arrives late (FRED's core
CPI a day late, the BoJ's rate file 1-4 business days after the meeting) the entry is late too, as a live run's
would be. The track's own timing is kept next to it (`research_signal_date`, `research_entry_date`,
`research_entry_open`, `entry_lag_sessions`) for the promotion review. Closed trades are scored against the
random-day baseline (§1) for the promotion tests: R1 for W3 and W4, R2 for the fade.
"""
from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Mapping
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import pandas as pd

from traderec.modules.m1_dipbuy import as_float, value_on

WAIT = "wait"            # an exit check without data for a session: stop there and try again next run


def iso(ts: Any) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%d")


# --------------------------------------------------------------------------------------------------------
# Series helpers
# --------------------------------------------------------------------------------------------------------

def total_return_closes(bars: pd.DataFrame) -> pd.Series:
    """Closes that include distributions: adj_close where present, else close."""
    close = bars["close"].astype(float)
    if "adj_close" not in bars.columns:
        return close.dropna()
    adj = bars["adj_close"].astype(float)
    return adj.where(adj.notna(), close).dropna()


def adjusted_opens(bars: pd.DataFrame) -> pd.Series:
    """Opens scaled by the day's adj_close / close, so that open-to-open returns include distributions."""
    opens = bars["open"].astype(float)
    if "adj_close" not in bars.columns:
        return opens
    factor = (bars["adj_close"].astype(float) / bars["close"].astype(float)).where(lambda f: f > 0)
    return opens * factor.fillna(1.0)


def prior_session(sessions: pd.DatetimeIndex, session: str) -> str | None:
    """The session before `session` in `sessions` (None at the start)."""
    before = sessions[sessions < pd.Timestamp(session)]
    return iso(before[-1]) if len(before) else None


def session_after(sessions: pd.DatetimeIndex, session: str, n: int = 1) -> str | None:
    """The n-th session after `session`, or None when `sessions` does not reach it yet."""
    after = sessions[sessions > pd.Timestamp(session)]
    return iso(after[n - 1]) if len(after) >= n else None


def sessions_between(sessions: pd.DatetimeIndex, start: str, end: str) -> int:
    """Sessions after `start` up to and including `end`."""
    return int(((sessions > pd.Timestamp(start)) & (sessions <= pd.Timestamp(end))).sum())


def window_move(series: pd.Series | None, start: str | None, end: str | None, *,
                is_yield: bool = False) -> float | None:
    """The move from the close of `start` to the close of `end`.

    Prices: a return; `end` must have a value, and the start value is the last one on or before `start`.
    Yields: a change in basis points; the end value is the last one after `start` up to `end`, so a bond-market
    holiday inside the window does not lose the move (None when the bond market printed nothing in it).
    None when a value is missing.
    """
    if series is None or start is None or end is None:
        return None
    s = series.dropna().sort_index()
    t0, t1 = pd.Timestamp(start), pd.Timestamp(end)
    head = s.loc[:t0]
    if head.empty:
        return None
    a = as_float(head.iloc[-1])
    if is_yield:
        tail = s[(s.index > t0) & (s.index <= t1)]
        b = as_float(tail.iloc[-1]) if len(tail) else None
    else:
        b = value_on(s, t1)
    if a is None or b is None:
        return None
    if is_yield:
        return (b - a) * 100.0
    return b / a - 1.0 if a > 0 else None


def value_at_or_before(series: pd.Series | None, day: str | None) -> float | None:
    """The last value on or before `day` (e.g. the 10-year's pre-CPI close)."""
    if series is None or day is None:
        return None
    head = series.dropna().sort_index().loc[:pd.Timestamp(day)]
    return as_float(head.iloc[-1]) if len(head) else None


# --------------------------------------------------------------------------------------------------------
# Release reactions (R1)
# --------------------------------------------------------------------------------------------------------

def bucket(kind: str, d2y_bp: float | None, thresholds: Mapping[str, Mapping[str, float]]) -> str | None:
    """Track 17's surprise proxy (§2.1-2.2): "hawkish" when the 2-year rose at least the kind's `hawkish` bp on
    day 0, "dovish" when it fell to its `dovish` bp or lower, else "neutral". None when the kind has no
    thresholds (GDP, PCE, BoJ, ECB) or the 2-year move is unknown."""
    th = thresholds.get(kind)
    if not th or d2y_bp is None:
        return None
    if d2y_bp >= float(th["hawkish"]):
        return "hawkish"
    if d2y_bp <= float(th["dovish"]):
        return "dovish"
    return "neutral"


def cpi_mm(index: pd.Series | None, reference: str | None) -> dict | None:
    """The m/m change of a monthly index for `reference` ("YYYY-MM") as BLS publishes it: the percent change of
    the published (three-decimal) index levels, rounded half up to one decimal.

    Returns {"pct" (unrounded), "rounded", "index", "prev_index"}, or None when either month is missing.
    """
    if index is None or not reference:
        return None
    try:
        month = pd.Period(str(reference)[:7], freq="M")
    except (ValueError, TypeError):
        return None
    s = index.dropna()
    cur = value_on(s, month.to_timestamp())
    prev = value_on(s, (month - 1).to_timestamp())
    if cur is None or prev is None or prev <= 0:
        return None
    pct = (cur / prev - 1.0) * 100.0
    rounded = float(Decimal(repr(round(pct, 8))).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
    return {"pct": round(pct, 6), "rounded": rounded, "index": cur, "prev_index": prev}


# --------------------------------------------------------------------------------------------------------
# Policy decisions (W4)
# --------------------------------------------------------------------------------------------------------

def fed_decision(target_upper: pd.Series | None, decision_date: str) -> dict | None:
    """The FOMC's move at `decision_date`, read from the upper bound of its target range (FRED DFEDTARU).

    The new target takes effect the day after the decision, so the move is the first value dated after the
    decision day against the value on it. Returns {"change_bp", "before", "after", "effective"}, or None until
    the series has a value dated after the decision.
    """
    if target_upper is None:
        return None
    s = target_upper.dropna().sort_index()
    d = pd.Timestamp(decision_date)
    before, after = s.loc[:d], s[s.index > d]
    if before.empty or after.empty:
        return None
    b, a = float(before.iloc[-1]), float(after.iloc[0])
    return {"change_bp": round((a - b) * 100.0, 1), "before": b, "after": a, "effective": iso(after.index[0])}


def boj_decision(basic_loan_rate: pd.Series | None, decision_date: str, asof: str, window_days: int) -> dict | None:
    """The BoJ's move at `decision_date`, read from its basic loan rate (the policy rate + 0.25 point).

    The file changes only on a change's effective date, 1-4 business days after the meeting. A change dated
    within `window_days` after the decision is the decision. No change by the time `asof` is `window_days`
    past the decision means the rate was held. Otherwise None (not known yet). `basic_loan_rate` must already
    be cut at `asof`.
    """
    if basic_loan_rate is None:
        return None
    s = basic_loan_rate.dropna().sort_index()
    d = pd.Timestamp(decision_date)
    end = d + pd.Timedelta(days=int(window_days))
    before = s.loc[:d]
    if before.empty:
        return None
    level = float(before.iloc[-1])
    window = s[(s.index > d) & (s.index <= end)]
    moved = window[(window - level).abs() > 1e-9]
    if len(moved):
        new = float(moved.iloc[0])
        return {"change_bp": round((new - level) * 100.0, 1), "before": level, "after": new,
                "effective": iso(moved.index[0])}
    if pd.Timestamp(asof) >= end:
        return {"change_bp": 0.0, "before": level, "after": level, "effective": None}
    return None


def nearest_fomc(boj_date: str, fomc_dates: Iterable[str], max_days: int) -> str | None:
    """The FOMC decision nearest to a BoJ decision, at most `max_days` calendar days away (a tie: the earlier)."""
    d = pd.Timestamp(boj_date)
    best: tuple[int, str] | None = None
    for f in sorted(fomc_dates):
        gap = abs((pd.Timestamp(f) - d).days)
        if gap <= max_days and (best is None or gap < best[0]):
            best = (gap, f)
    return best[1] if best else None


# --------------------------------------------------------------------------------------------------------
# Triggers
# --------------------------------------------------------------------------------------------------------

def _decide(tests: list[tuple[bool, str]], missing: list[str]) -> dict:
    """{"trigger", "complete", "reasons"}. `complete` is False only while a missing input could still change the
    answer, i.e. no available condition has failed yet (fail closed: a missing input never triggers)."""
    failed = [m for ok, m in tests if not ok]
    trigger = not failed and not missing
    return {"trigger": trigger, "complete": bool(failed) or not missing,
            "reasons": [m for _, m in tests] if trigger else failed + missing}


def w3_check(d2y_bp: float | None, core_mm: float | None, cfg_w3: Mapping[str, Any]) -> dict:
    """W3's trigger on a CPI day: the 2-year's day-0 move <= d2y_max_bp (-6) and core CPI m/m, as published to
    one decimal, <= core_cpi_mm_max (0.1)."""
    lim_y, lim_c = float(cfg_w3["d2y_max_bp"]), float(cfg_w3["core_cpi_mm_max"])
    tests: list[tuple[bool, str]] = []
    missing: list[str] = []
    if d2y_bp is None:
        missing.append("2-year yield move unavailable")
    else:
        tests.append((d2y_bp <= lim_y + 1e-9, f"2-year {d2y_bp:+.1f}bp on the day (needs {lim_y:+.0f}bp or lower)"))
    if core_mm is None:
        missing.append("core CPI m/m unavailable")
    else:
        tests.append((core_mm <= lim_c + 1e-9, f"core CPI {core_mm:+.1f}% m/m (needs {lim_c:.1f}% or less)"))
    return {**_decide(tests, missing), "d2y_bp": d2y_bp, "core_cpi_mm": core_mm}


def w4_check(boj_change_bp: float | None, fed_change_bp: float | None) -> dict:
    """W4's trigger: the BoJ raised its policy rate and the Fed held at its paired meeting."""
    tests: list[tuple[bool, str]] = []
    missing: list[str] = []
    if boj_change_bp is None:
        missing.append("BoJ decision not confirmed yet")
    else:
        tests.append((boj_change_bp > 0, f"BoJ {boj_change_bp:+.0f}bp (needs a hike)"))
    if fed_change_bp is None:
        missing.append("Fed decision not confirmed yet")
    else:
        tests.append((abs(fed_change_bp) < 1e-9, f"Fed {fed_change_bp:+.0f}bp (needs a hold)"))
    return {**_decide(tests, missing), "boj_change_bp": boj_change_bp, "fed_change_bp": fed_change_bp}


# --------------------------------------------------------------------------------------------------------
# Hypothetical trades
# --------------------------------------------------------------------------------------------------------

def new_trade(rule: str, trade_id: str, signal_date: str, ticker: str, side: str, max_sessions: int,
              **extra: Any) -> dict:
    """A hypothetical trade, entered at the first open after `signal_date`: the evening the rule was evaluated
    and fired, which is the run date, never an earlier session (no look-ahead). Pass `research_signal_date`
    (the session the track's rule keys on, e.g. the CPI day) when it differs, and `advance_trade` records the
    research timing next to the entry."""
    if side not in ("long", "short"):
        raise ValueError(f"side must be long or short, not {side!r}")
    return {"rule": rule, "id": trade_id, "signal_date": signal_date, "ticker": ticker, "side": side,
            "max_sessions": int(max_sessions), "status": "pending_entry", **extra}


def _adj_factor(bars: pd.DataFrame, day: pd.Timestamp) -> float:
    """adj_close / close on `day`: the total-return scale of that session's prices (1.0 without adj_close)."""
    if "adj_close" not in bars.columns or day not in bars.index:
        return 1.0
    f = as_float(bars.at[day, "adj_close"] / bars.at[day, "close"])
    return f if f and f > 0 else 1.0


def _open_at(bars: pd.DataFrame, after: str) -> tuple[pd.Timestamp, float, float] | None:
    """(session, raw open, adj factor) of the first bar after `after` with a usable open."""
    later = bars.index[bars.index > pd.Timestamp(after)]
    if not len(later):
        return None
    day = later[0]
    raw = as_float(bars.at[day, "open"])
    if raw is None or raw <= 0:
        return None
    return day, raw, _adj_factor(bars, day)


def advance_trade(trade: dict, bars: pd.DataFrame, asof: str, slip: float,
                  exit_check: Callable[[str, int, dict], str | None]) -> list[str]:
    """Move a hypothetical trade forward through the sessions of `bars` up to `asof`; returns what happened
    ("entry", "exit_signal", "exit"), in order.

    * pending_entry: filled at the first open after `signal_date`, open x (1 + slip) for a long and x (1 - slip)
      for a short. When the trade carries a `research_signal_date` (the session the track keys on, at or before
      `signal_date`), the entry the research would have taken is recorded next to it: `research_entry_date`
      and `research_entry_open` (the first open after that session) and `entry_lag_sessions` (how many
      sessions later this book entered; 0 when the rule was evaluated the same evening).
    * open: from the entry session on, each close is checked with exit_check(session, sessions_held, trade),
      where sessions_held counts the entry session as 1. It returns a reason (exit at the next open), None
      (hold), or WAIT (data missing for that session: stop and try again next run).
    * pending_exit: filled at the first open after the exit signal, with slippage against the trade.

    `return` is the total return (distributions included, slippage deducted) from the trade's side; `held` is
    the number of open-to-open sessions. Both adj factors come from the exit run's `bars`: a back-adjusted
    series (yfinance) is rescaled at every later ex-date, so a factor kept from the entry run would not
    match the exit day's and the distribution would be lost.
    """
    b = bars.loc[:pd.Timestamp(asof)]
    sign = 1.0 if trade["side"] == "long" else -1.0
    done: list[str] = []
    if trade["status"] == "pending_entry":
        got = _open_at(b, trade["signal_date"])
        if got is None:
            return done
        day, raw, _ = got
        price = raw * (1.0 + sign * slip)
        trade.update(status="open", entry_date=iso(day), entry_open=raw, entry_price=price,
                     sessions_held=0, checked=None)
        if trade.get("research_signal_date"):
            ref = _open_at(b, trade["research_signal_date"])
            if ref is not None:
                trade.update(research_entry_date=iso(ref[0]), research_entry_open=ref[1],
                             entry_lag_sessions=int(((b.index > ref[0]) & (b.index <= day)).sum()))
        done.append("entry")
    if trade["status"] == "open":
        entry = pd.Timestamp(trade["entry_date"])
        checked = pd.Timestamp(trade["checked"]) if trade.get("checked") else None
        days = b.index[b.index >= entry]
        for n, day in enumerate(days, start=1):
            if checked is not None and day <= checked:
                continue
            reason = exit_check(iso(day), n, trade)
            if reason == WAIT:
                break
            trade.update(checked=iso(day), sessions_held=n)
            if reason:
                trade.update(status="pending_exit", exit_signal_date=iso(day), exit_reason=reason)
                done.append("exit_signal")
                break
    if trade["status"] == "pending_exit":
        got = _open_at(b, trade["exit_signal_date"])
        if got is None:
            return done
        day, raw, factor = got
        price = raw * (1.0 - sign * slip)
        entry = pd.Timestamp(trade["entry_date"])
        entry_adj = float(trade["entry_price"]) * _adj_factor(b, entry)
        held = int(((b.index > entry) & (b.index <= day)).sum())
        trade.update(status="closed", exit_date=iso(day), exit_open=raw, exit_price=price, held=held,
                     price_return=sign * (price / float(trade["entry_price"]) - 1.0),
                     **{"return": sign * (price * factor / entry_adj - 1.0)})
        done.append("exit")
    return done


def w3_exit_check(ten_year: pd.Series | None, pre_release_10y: float, max_sessions: int,
                  *, invalidation: bool = True, stale: Callable[[str], bool] = lambda _: True
                  ) -> Callable[[str, int, dict], str | None]:
    """W3's exits: "invalidation" when the 10-year closes above its pre-CPI close, else "time_stop" after
    `max_sessions`. A session without a 10-year print waits for it, unless stale(session) says it will not
    come (a bond-market holiday): then only the time stop is checked and the session is listed in "unchecked"."""
    def check(session: str, held: int, trade: dict) -> str | None:
        if invalidation:
            y = value_on(ten_year.dropna(), pd.Timestamp(session)) if ten_year is not None else None
            if y is None:
                if not stale(session):
                    return WAIT
                trade.setdefault("unchecked", []).append(session)
            elif y > pre_release_10y + 1e-9:
                return "invalidation"
        return "time_stop" if held >= max_sessions else None
    return check


def w4_exit_check(closes: pd.Series, stop_move: float, target_move: float, max_sessions: int
                  ) -> Callable[[str, int, dict], str | None]:
    """W4's exits on FXY closes: the stop is USDJPY `stop_move` (+1.5%) from entry, so FXY at entry / (1 + 0.015)
    or lower; the target is USDJPY `target_move` (-4%), so FXY at entry / 0.96 or higher; else "time_stop"."""
    def check(session: str, held: int, trade: dict) -> str | None:
        if "stop_level" not in trade:
            trade["stop_level"] = float(trade["entry_open"]) / (1.0 + stop_move)
            trade["target_level"] = float(trade["entry_open"]) / (1.0 + target_move)
        c = value_on(closes, pd.Timestamp(session))
        if c is None:
            return WAIT
        if c <= trade["stop_level"]:
            return "stop"
        if c >= trade["target_level"]:
            return "target"
        return "time_stop" if held >= max_sessions else None
    return check


def time_exit_check(max_sessions: int) -> Callable[[str, int, dict], str | None]:
    """A pure time stop (the gold fade: one session)."""
    return lambda session, held, trade: "time_stop" if held >= max_sessions else None


# --------------------------------------------------------------------------------------------------------
# Scoring and the promotion tests
# --------------------------------------------------------------------------------------------------------

def baseline_mean(bars: pd.DataFrame, before: str, sessions: int, *, years: float = 3.0,
                  min_obs: int = 100) -> float | None:
    """The random-day bar (track 17 §1): the mean open-to-open total return over `sessions` sessions, across
    every start in the `years` before `before` whose window had ended by `before` (no look-ahead). None with
    fewer than `min_obs` windows."""
    if sessions < 1:
        return None
    end = pd.Timestamp(before)
    s = adjusted_opens(bars).dropna().loc[:end]
    s = s[s.index >= end - pd.DateOffset(years=years)]
    r = (s.shift(-sessions) / s - 1.0).dropna()
    return float(r.mean()) if len(r) >= min_obs else None


def score_trade(trade: dict, bars: pd.DataFrame, *, years: float = 3.0) -> dict:
    """Add the baseline and the excess to a closed trade. A short's baseline return is minus the long's, so
    excess = return - baseline for a long and return + baseline for a short. The return is net of slippage, so
    the excess is net of costs (R1)."""
    base = baseline_mean(bars, trade["entry_date"], int(trade.get("held") or 0), years=years)
    sign = 1.0 if trade["side"] == "long" else -1.0
    trade["baseline"] = base
    trade["excess"] = None if base is None else float(trade["return"]) - sign * base
    return trade


def _betacf(a: float, b: float, x: float) -> float:
    """Continued fraction of the incomplete beta function (modified Lentz)."""
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, 300):
        m2 = 2 * m
        for aa in (m * (b - m) * x / ((qam + m2) * (a + m2)), -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))):
            d = 1.0 + aa * d
            d = 1.0 / (d if abs(d) > tiny else tiny)
            c = 1.0 + aa / c
            c = c if abs(c) > tiny else tiny
            h *= d * c
        if abs(d * c - 1.0) < 3e-14:
            break
    return h


def _betainc(a: float, b: float, x: float) -> float:
    """The regularized incomplete beta function I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    front = math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log1p(-x))
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - front * _betacf(b, a, 1.0 - x) / b


def t_pvalue(t: float, df: int) -> float:
    """Two-sided p-value of Student's t with `df` degrees of freedom."""
    return _betainc(df / 2.0, 0.5, df / (df + t * t))


def t_stats(values: Iterable[float]) -> dict:
    """{"n", "mean", "sd", "t", "p"} of a one-sample t test of mean = 0 (None where undefined)."""
    xs = [float(v) for v in values]
    n = len(xs)
    out: dict[str, Any] = {"n": n, "mean": None, "sd": None, "t": None, "p": None}
    if n == 0:
        return out
    mean = sum(xs) / n
    out["mean"] = mean
    if n < 2:
        return out
    sd = math.sqrt(sum((x - mean) ** 2 for x in xs) / (n - 1))
    out["sd"] = sd
    if sd > 0:
        t = mean / (sd / math.sqrt(n))
        out.update(t=t, p=t_pvalue(t, n - 1))
    return out


def promotion_summary(trades: Iterable[dict], promotion: Mapping[str, Any]) -> dict:
    """What a rule's pre-registered promotion test needs, from its closed, counted trades' excess returns.

    R1 (W3, W4): at least 24 paper instances with a mean excess of t >= 2 net of costs, and a pass of BH-FDR
    together with the rules tested alongside it (apply `bh_fdr` to the "p" of every rule). R2 (the fade): paper
    only until n >= 10. Returns the t statistics plus "min_instances", "min_t", "meets_n", "meets_t".
    """
    counted = [t for t in trades if t.get("status") == "closed" and t.get("counted", True)
               and as_float(t.get("excess")) is not None]
    st = t_stats(t["excess"] for t in counted)
    need_n = int(promotion.get("min_instances", 0))
    need_t = promotion.get("min_t")
    meets_t = need_t is None or (st["t"] is not None and st["t"] >= float(need_t))
    return {**st, "min_instances": need_n, "min_t": need_t, "meets_n": st["n"] >= need_n, "meets_t": meets_t,
            "hit_rate": (sum(1 for t in counted if float(t["return"]) > 0) / len(counted)) if counted else None}


def bh_fdr(pvalues: Mapping[str, float | None], q: float = 0.10) -> dict[str, bool]:
    """Benjamini-Hochberg at false-discovery rate `q`: which of the named p-values are discoveries.
    Missing p-values are never discoveries."""
    named = sorted(((p, k) for k, p in pvalues.items() if as_float(p) is not None))
    m = len(named)
    cut = 0
    for i, (p, _) in enumerate(named, start=1):
        if p <= q * i / m:
            cut = i
    passed = {k for _, k in named[:cut]}
    return {k: k in passed for k in pvalues}
