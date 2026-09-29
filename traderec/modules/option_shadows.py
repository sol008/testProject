"""Option shadow books - the rules (design v3.3 §3 "M7" and "Shadow ledger"; tracks 14 and 13 §11.3).

Pure functions: no I/O, no clock, no LLM. The runner (`traderec.runners.option_shadows`) feeds them closes, the VIX
and VIX3M series and the 10:17 ET option chains, and keeps the books in the state.

Put credit spreads are priced per share of the combo (a contract is x100):

* value V = mid(short put) - mid(long put), what buying the spread back costs at mid; natural width nw = the sum
  of the legs' (ask - bid).
* Fill model v1.0 (design §7; `fills.options.concession` c = 0.3), mirrored for credit spreads from
  `traderec.options.fillmodel`: sell to open at V - c x nw, buy back at V + c x nw. A spread held to expiry settles
  at intrinsic value from the official close, at no cost.
* max loss = width - credit. Results are R = P&L / max loss (track 14 §1: "returns are in units of risk"), which does
  not depend on the size of the paper account.

Books (config `shadow.<BOOK>`):

* O1 (M7): sell the 0.20-delta put and buy the put 5% of spot lower, one entry per monthly expiry cycle at 45-40 DTE,
  when the S&P 500 closes above its 200-day average, VIX < 30 and VIX/VIX3M < 1.0. Take profit when the spread can
  be bought back for 50% of the credit, else close at 21 DTE (track 14 §3.2-§3.3, §7.1-§7.3).
* O1-h: the same with the 0.10-delta put, held to expiry (track 14 §7.1).
* I1: the 0.20-delta / 5% spread at 45 DTE after a fading VIX spike, held to expiry (track 14 §4.4, §7.1).
* I2: O1's logic on IBIT, with O1's filters translated to Bitcoin (track 14 §7.1).
* ST-2: SPY bought at the next open after the first VIX/VIX3M close >= 1.00 in 20 sessions while SPY is above its
  200-day average, and sold at the close of session 20 (track 13 §11.3).
"""
from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from datetime import date, timedelta
from typing import Any

import pandas as pd

from traderec import indicators
from traderec.market_calendar import is_trading_day, prev_trading_day
from traderec.modules.m1_dipbuy import as_float, closes_upto, value_on
from traderec.options.chain import OptionChain
from traderec.options.fillmodel import combo_quote

MULTIPLIER = 100          # an option contract is 100 shares of the combo
MAX_IV = 5.0              # an implied volatility above 500% is treated as a bad print
_EPS = 1e-9


def _iso(ts: Any) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%d")


# ------------------------------------------------------------------------------------------------ calendar

def monthly_expiry(year: int, month: int) -> str:
    """The standard monthly expiry: the third Friday, or the session before it when that Friday is an exchange
    holiday (Good Friday, 18 Apr 2025 -> Thursday 17 Apr)."""
    first = date(year, month, 1)
    friday = first + timedelta(days=(4 - first.weekday()) % 7 + 14)
    return (friday if is_trading_day(friday) else prev_trading_day(friday)).isoformat()


def days_to_expiry(expiry: str, day: str) -> int:
    """Calendar days from `day` to `expiry` (both YYYY-MM-DD)."""
    return (date.fromisoformat(str(expiry)[:10]) - date.fromisoformat(str(day)[:10])).days


def cycle_expiry(entry_date: str, window: Sequence[int]) -> str | None:
    """The monthly expiry that is `window[0]`-`window[1]` calendar days after `entry_date`, or None.

    One entry per monthly cycle (track 14 §3.2: "entered ... about 45 calendar days before a monthly expiry"; §7.7
    "Monthly cycle, 40-50 DTE"). Monthly expiries are 28 or 35 days apart, so a window narrower than that names at
    most one.
    """
    lo, hi = int(window[0]), int(window[1])
    d = date.fromisoformat(str(entry_date)[:10])
    for k in range(4):
        m = d.month - 1 + k
        expiry = monthly_expiry(d.year + m // 12, m % 12 + 1)
        if lo <= days_to_expiry(expiry, entry_date) <= hi:
            return expiry
    return None


def nth_session(sessions: pd.DatetimeIndex, start: str, n: int) -> pd.Timestamp | None:
    """The n-th session of `sessions` counting `start` as session 1, or None when the index ends first."""
    after = sessions[sessions >= pd.Timestamp(start)]
    return after[n - 1] if len(after) >= n else None


# -------------------------------------------------------------------------------------------- the signals

def _decide(out: dict, passed: list[str], failed: list[str], missing: list[str], key: str = "pass") -> dict:
    """A conjunctive rule: any failed condition decides "no"; else missing data fails closed; else "yes"."""
    if failed:
        out.update({key: False, "data_ok": True, "reasons": failed})
    elif missing:
        out.update({key: False, "data_ok": False, "reasons": missing})
    else:
        out.update({key: True, "data_ok": True, "reasons": passed})
    return out


def o1_filters(index: pd.DataFrame | None, vix: float | None, vix3m: float | None, date: str,
               cfg_filters: dict) -> dict:
    """O1 / O1-h entry filters at the close of `date` (design §3 M7; track 14 §7.2), all of which must hold:

    * the index's raw close > its `sma_trend`-session simple average, today included (track 14 F3);
    * VIX < `vix_below` (30) and VIX/VIX3M < `vix_ratio_below` (1.0), the safety vetoes.

    Returns {"pass", "data_ok", "close", "sma", "vix", "vix3m", "ratio", "reasons"}. A failed filter decides the
    day; otherwise a missing input (no index close on `date`, too little history, no VIX or VIX3M) gives
    data_ok=False and pass=False (fail closed).
    """
    ts = pd.Timestamp(date)
    n = int(cfg_filters["sma_trend"])
    vix_below, ratio_below = float(cfg_filters["vix_below"]), float(cfg_filters["vix_ratio_below"])
    v, v3 = as_float(vix), as_float(vix3m)
    out: dict[str, Any] = {"pass": False, "data_ok": True, "close": None, "sma": None, "vix": v, "vix3m": v3,
                           "ratio": None, "reasons": []}
    passed: list[str] = []
    failed: list[str] = []
    missing: list[str] = []

    close = closes_upto(index["close"], ts) if index is not None and "close" in index else pd.Series(dtype=float)
    if close.empty or close.index[-1] != ts:
        missing.append(f"no index close on {ts.date()}")
    elif len(close) < n:
        missing.append(f"fewer than {n} index closes")
    else:
        c, sma = float(close.iloc[-1]), float(indicators.sma(close, n).iloc[-1])
        out.update(close=c, sma=sma)
        if c > sma:
            passed.append(f"index close {c:.2f} > SMA{n} {sma:.2f}")
        else:
            failed.append(f"index close {c:.2f} <= SMA{n} {sma:.2f} (no uptrend)")

    if v is None:
        missing.append("no VIX close")
    elif v < vix_below:
        passed.append(f"VIX {v:.2f} < {vix_below:g}")
    else:
        failed.append(f"VIX {v:.2f} >= {vix_below:g} (crisis veto)")

    if v3 is None or v3 <= 0:
        missing.append("no VIX3M close")
    elif v is not None:
        ratio = v / v3
        out["ratio"] = ratio
        if ratio < ratio_below:
            passed.append(f"VIX/VIX3M {ratio:.3f} < {ratio_below:g}")
        else:
            failed.append(f"VIX/VIX3M {ratio:.3f} >= {ratio_below:g} (backwardation veto)")
    return _decide(out, passed, failed, missing)


def vix_fade_signal(vix: pd.Series | None, date: str, last_signal: str | None, cfg_trigger: dict) -> dict:
    """I1's trigger (track 14 §4.4; research/code/14-short-options/s05 `signals`, "FADE"):

    * VIX closed >= `vix_peak` (30) at some close among the last `lookback_sessions` (10, today included);
    * today's close is <= `fade_ratio` (0.8) x that peak: the spike has started to fade;
    * more than `cooldown_days` (30) calendar days have passed since the last signal.

    Returns {"signal", "data_ok", "vix", "peak", "peak_date", "reasons"}; data_ok=False when there is no VIX close
    on `date` or fewer than `lookback_sessions` closes.
    """
    ts = pd.Timestamp(date)
    level, n = float(cfg_trigger["vix_peak"]), int(cfg_trigger["lookback_sessions"])
    fade, cool = float(cfg_trigger["fade_ratio"]), int(cfg_trigger["cooldown_days"])
    out: dict[str, Any] = {"signal": False, "data_ok": True, "vix": None, "peak": None, "peak_date": None,
                           "reasons": []}
    s = closes_upto(vix, ts) if vix is not None else pd.Series(dtype=float)
    if s.empty or s.index[-1] != ts:
        return _decide(out, [], [], [f"no VIX close on {ts.date()}"], key="signal")
    if len(s) < n:
        return _decide(out, [], [], [f"fewer than {n} VIX closes"], key="signal")
    window = s.iloc[-n:]
    v, peak = float(s.iloc[-1]), float(window.max())
    out.update(vix=v, peak=peak, peak_date=_iso(window.idxmax()))
    passed: list[str] = []
    failed: list[str] = []
    if peak >= level:
        passed.append(f"{n}-session VIX peak {peak:.2f} >= {level:g}")
    else:
        failed.append(f"{n}-session VIX peak {peak:.2f} < {level:g} (no spike)")
    if v <= fade * peak:
        passed.append(f"VIX {v:.2f} <= {fade:g} x peak ({fade * peak:.2f})")
    else:
        failed.append(f"VIX {v:.2f} > {fade:g} x peak ({fade * peak:.2f}) (not fading yet)")
    if last_signal is not None:
        gap = (ts - pd.Timestamp(last_signal)).days
        if gap > cool:
            passed.append(f"{gap} days since the last signal > {cool}")
        else:
            failed.append(f"{gap} days since the last signal <= {cool} (cool-down)")
    return _decide(out, passed, failed, [], key="signal")


def btc_trend(btc: pd.Series | None, date: str, sma_days: int) -> dict:
    """I2's trend filter, O1's 200-day rule on Bitcoin: the BTC-USD close of the UTC day `date` above the average of
    its last `sma_days` daily closes. Returns {"pass", "data_ok", "close", "sma", "reasons"}."""
    ts = pd.Timestamp(date)
    out: dict[str, Any] = {"pass": False, "data_ok": True, "close": None, "sma": None, "reasons": []}
    s = closes_upto(btc, ts) if btc is not None else pd.Series(dtype=float)
    if s.empty or s.index[-1] != ts:
        return _decide(out, [], [], [f"no BTC-USD close for the UTC day {ts.date()}"])
    if len(s) < sma_days:
        return _decide(out, [], [], [f"fewer than {sma_days} BTC-USD closes"])
    c, sma = float(s.iloc[-1]), float(indicators.sma(s, sma_days).iloc[-1])
    out.update(close=c, sma=sma)
    if c > sma:
        return _decide(out, [f"BTC-USD {c:,.2f} > SMA{sma_days} {sma:,.2f}"], [], [])
    return _decide(out, [], [f"BTC-USD {c:,.2f} <= SMA{sma_days} {sma:,.2f} (no uptrend)"], [])


def vix_ratio_on(vix: pd.Series | None, vix3m: pd.Series | None, day: pd.Timestamp) -> float | None:
    v, v3 = value_on(vix, day), value_on(vix3m, day)
    return v / v3 if v is not None and v3 is not None and v3 > 0 else None


def st2_signal(spy: pd.DataFrame, vix: pd.Series | None, vix3m: pd.Series | None, date: str, cfg: dict) -> dict:
    """ST-2 (track 13 §11.3; research/code/13-short-index s08_summary `finalist_trades` with `first_cross`):

    * the VIX/VIX3M close on `date` is >= `ratio_at_least` (1.00) and was below it on each of the previous
      `quiet_sessions` (20) SPY sessions;
    * the raw SPY close is above its `sma_trend` (200)-session average.

    Ratios are read on SPY's sessions. Returns {"signal", "data_ok", "ratio", "close", "sma", "reasons"}. Fails
    closed (data_ok=False) when SPY has no close on `date` or too little history, today's ratio is missing, or a
    ratio in the quiet window is missing while everything else says "signal".
    """
    ts = pd.Timestamp(date)
    n_trend, quiet, level = int(cfg["sma_trend"]), int(cfg["quiet_sessions"]), float(cfg["ratio_at_least"])
    out: dict[str, Any] = {"signal": False, "data_ok": True, "ratio": None, "close": None, "sma": None,
                           "reasons": []}
    close = closes_upto(spy["close"], ts)
    if close.empty or close.index[-1] != ts:
        return _decide(out, [], [], [f"no SPY close on {ts.date()}"], key="signal")
    if len(close) < max(n_trend, quiet + 1):
        return _decide(out, [], [], ["insufficient SPY history"], key="signal")
    c, sma = float(close.iloc[-1]), float(indicators.sma(close, n_trend).iloc[-1])
    out.update(close=c, sma=sma)
    sessions = close.index[-(quiet + 1):]
    ratios = [vix_ratio_on(vix, vix3m, d) for d in sessions]
    today, prior = ratios[-1], ratios[:-1]
    out["ratio"] = today
    passed: list[str] = []
    failed: list[str] = []
    missing: list[str] = []
    if c > sma:
        passed.append(f"SPY {c:.2f} > SMA{n_trend} {sma:.2f}")
    else:
        failed.append(f"SPY {c:.2f} <= SMA{n_trend} {sma:.2f} (no uptrend)")
    if today is None:
        missing.append(f"no VIX/VIX3M ratio on {ts.date()}")
    elif today < level:
        failed.append(f"VIX/VIX3M {today:.3f} < {level:g}")
    elif any(r is not None and r >= level for r in prior):
        failed.append(f"VIX/VIX3M was already >= {level:g} within {quiet} sessions (not the first close)")
    elif any(r is None for r in prior):
        missing.append(f"VIX/VIX3M missing on a session of the {quiet}-session quiet window")
    else:
        passed.append(f"VIX/VIX3M {today:.3f} >= {level:g}, the first close in {quiet} sessions")
    return _decide(out, passed, failed, missing, key="signal")


# ------------------------------------------------------------------------------------------ option chains

def put_delta(spot: float | None, strike: float | None, years: float, iv: float | None,
              rate: float = 0.0) -> float | None:
    """Black-Scholes put delta without dividends (the fallback when a chain carries no delta), or None."""
    s, k, v = as_float(spot), as_float(strike), as_float(iv)
    if s is None or k is None or v is None or s <= 0 or k <= 0 or years <= 0 or not 0 < v <= MAX_IV:
        return None
    d1 = (math.log(s / k) + (rate + 0.5 * v * v) * years) / (v * math.sqrt(years))
    return 0.5 * (1.0 + math.erf(d1 / math.sqrt(2.0))) - 1.0


def pick_expiry(expiries: Iterable[str], day: str, *, target: str | None = None, target_dte: int = 45,
                dte_range: Sequence[int] = (40, 50)) -> str | None:
    """The listed expiry to trade, `dte_range[0]`-`dte_range[1]` days after `day`, or None.

    * With `target` (a monthly cycle's expiry): the target when listed, else the listed expiry nearest to it.
    * Without (I1): the last listed expiry at most `target_dte` days out (track 14 s05: "the last trading day on or
      before entry + 45 days"), else the one nearest `target_dte`.
    """
    lo, hi = int(dte_range[0]), int(dte_range[1])
    listed = sorted({str(e)[:10] for e in expiries if lo <= days_to_expiry(str(e), day) <= hi})
    if not listed:
        return None
    if target:
        if target in listed:
            return target
        return min(listed, key=lambda e: (abs(days_to_expiry(e, target)), e))
    within = [e for e in listed if days_to_expiry(e, day) <= target_dte]
    if within:
        return within[-1]
    return min(listed, key=lambda e: (abs(days_to_expiry(e, day) - target_dte), e))


def _leg(chain: OptionChain, row: dict, expiry: str, position: str) -> dict:
    return {"occ": row["occ"], "root": chain.underlying, "right": "P", "strike": row["strike"], "expiry": expiry,
            "position": position, "ratio": 1}


def pick_put_spread(chain: OptionChain, expiry: str, day: str, cfg: dict, *, rate: float = 0.0) -> dict:
    """The put credit spread for `expiry` (track 14 §7.1, §7.7):

    * short: the quoted put whose |delta| is nearest `short_delta`, within `delta_tolerance`. A missing delta is
      computed from the put's implied volatility (`put_delta`);
    * long: the quoted put nearest to the short strike - `width_pct_spot` x spot, below the short strike, with the
      width within `width_pct_spot` +/- `width_tolerance` of spot (4-6%).

    "Quoted" means a two-sided quote (bid > 0, ask >= bid), which the fill needs. Ties go to the lower strike.
    Returns {"ok", "reasons", "legs", "short_strike", "long_strike", "width", "width_pct", "short_delta",
    "short_iv", "delta_source"}; the legs are contract §2 position legs.
    """
    out: dict[str, Any] = {"ok": False, "reasons": [], "legs": None, "short_strike": None, "long_strike": None,
                           "width": None, "width_pct": None, "short_delta": None, "short_iv": None,
                           "delta_source": None}
    spot = as_float(chain.spot)
    if spot is None or spot <= 0:
        out["reasons"] = ["the chain has no spot price"]
        return out
    years = max(days_to_expiry(expiry, day), 0) / 365.0
    rows = []
    for rec in chain.select("P", expiry).to_dict("records"):
        bid, ask, strike = as_float(rec.get("bid")), as_float(rec.get("ask")), as_float(rec.get("strike"))
        if bid is None or ask is None or strike is None or bid <= 0 or ask < bid:
            continue
        iv, delta, source = as_float(rec.get("iv")), as_float(rec.get("delta")), "chain"
        if delta is None:
            delta, source = put_delta(spot, strike, years, iv, rate), "black_scholes"
        if delta is None:
            continue
        rows.append({"occ": str(rec["occ"]), "strike": strike, "abs_delta": abs(delta), "iv": iv, "source": source})
    if not rows:
        out["reasons"] = [f"no quoted put with a delta on {expiry}"]
        return out
    target, tol = float(cfg["short_delta"]), float(cfg["delta_tolerance"])
    short = min(rows, key=lambda r: (abs(r["abs_delta"] - target), r["strike"]))
    if abs(short["abs_delta"] - target) > tol + _EPS:
        out["reasons"] = [f"no put within {tol:g} of {target:g} delta (nearest {short['abs_delta']:.3f})"]
        return out
    pct, wtol = float(cfg["width_pct_spot"]), float(cfg["width_tolerance"])
    goal = short["strike"] - pct * spot
    longs = [r for r in rows if r["strike"] < short["strike"]]
    if not longs:
        out["reasons"] = [f"no quoted put below the {short['strike']:g} strike"]
        return out
    long = min(longs, key=lambda r: (abs(r["strike"] - goal), r["strike"]))
    width = short["strike"] - long["strike"]
    out.update(short_strike=short["strike"], long_strike=long["strike"], width=width, width_pct=width / spot,
               short_delta=short["abs_delta"], short_iv=short["iv"], delta_source=short["source"])
    if not pct - wtol - _EPS <= width / spot <= pct + wtol + _EPS:
        out["reasons"] = [f"the nearest long strike {long['strike']:g} makes the spread {width / spot:.2%} of spot "
                          f"wide, outside {pct - wtol:.0%}-{pct + wtol:.0%}"]
        return out
    out.update(ok=True, legs=[_leg(chain, short, expiry, "short"), _leg(chain, long, expiry, "long")],
               reasons=[f"short {short['strike']:g} put at {short['abs_delta']:.3f} delta, long {long['strike']:g} "
                        f"({width / spot:.2%} of spot)"])
    return out


def credit_quote(chain: OptionChain, legs: list[dict]) -> dict | None:
    """{"value" (V = short mid - long mid), "natural_width", "legs"}: the fill model's combo quote seen from the
    seller's side, or None when a leg has no two-sided quote."""
    quote = combo_quote(chain, legs)
    if quote is None:
        return None
    return {"value": -float(quote["mid"]), "natural_width": float(quote["natural_width"]), "legs": quote["legs"]}


def sell_to_open_price(quote: dict, concession: float) -> float:
    """The credit received at fill model v1.0: V - c x nw (per share)."""
    return float(quote["value"]) - concession * float(quote["natural_width"])


def buy_to_close_price(quote: dict, concession: float) -> float:
    """The cost of buying the spread back at fill model v1.0: V + c x nw (per share)."""
    return float(quote["value"]) + concession * float(quote["natural_width"])


def credit_liquidity(chain: OptionChain, quote: dict, legs: list[dict], cfg_liquidity: dict) -> dict:
    """Track 14 §7.2's liquidity rule for credit spreads, measured on the market-hours snapshot:

    * the natural combo spread <= `max_natural_frac_of_credit` (10%) of the mid credit;
    * ETF options also need open interest >= `min_open_interest` (500) on each leg (0 for SPX/XSP, whose strikes
      are market-maker quoted, so the spread test governs).

    Returns {"ok", "natural_frac_of_credit", "open_interest", "reasons"}.
    """
    max_frac = float(cfg_liquidity.get("max_natural_frac_of_credit", 0.10))
    min_oi = float(cfg_liquidity.get("min_open_interest") or 0)
    value, width = float(quote["value"]), float(quote["natural_width"])
    frac = width / value if value > 0 else None
    reasons: list[str] = []
    if frac is None:
        reasons.append(f"no mid credit ({value:.2f})")
    elif frac > max_frac + _EPS:
        reasons.append(f"natural width {width:.2f} is {frac:.1%} of the mid credit {value:.2f} (> {max_frac:.0%})")
    ois = []
    for leg in legs:
        oi = as_float((chain.quote(leg["occ"]) or {}).get("open_interest"))
        ois.append(oi)
        if min_oi > 0 and (oi is None or oi < min_oi):
            reasons.append(f"open interest {oi if oi is None else int(oi)} < {min_oi:g} at the {leg['strike']:g} put")
    return {"ok": not reasons, "natural_frac_of_credit": frac, "open_interest": ois, "reasons": reasons}


def atm_iv(chain: OptionChain, expiry: str) -> float | None:
    """The mean implied volatility of the options at the strike nearest spot on `expiry`, or None."""
    spot = as_float(chain.spot)
    frame = chain.frame[chain.frame["expiry"] == expiry]
    if spot is None or frame.empty:
        return None
    strikes = pd.to_numeric(frame["strike"], errors="coerce")
    if strikes.isna().all():
        return None
    nearest = float(strikes.loc[(strikes - spot).abs().idxmin()])
    ivs = [as_float(x) for x in frame.loc[strikes == nearest, "iv"]]
    usable = [x for x in ivs if x is not None and 0 < x <= MAX_IV]
    return sum(usable) / len(usable) if usable else None


def iv_term_ratio(chain: OptionChain, day: str, near_dte: int, far_dte: int) -> dict:
    """I2's stand-in for "DVOL not in backwardation" (track 14 §7.1): the at-the-money implied volatility of the
    listed expiry nearest `near_dte` (30; 15-45 days out) over that of the expiry nearest `far_dte` (90; 60-135 days
    out), the chain's analogue of VIX/VIX3M. Returns {"data_ok", "ratio", "near_expiry", "far_expiry", "iv_near",
    "iv_far", "reasons"}."""
    out: dict[str, Any] = {"data_ok": False, "ratio": None, "near_expiry": None, "far_expiry": None,
                           "iv_near": None, "iv_far": None, "reasons": []}
    dtes = {e: days_to_expiry(e, day) for e in chain.expiries()}
    near = [e for e, n in dtes.items() if near_dte / 2 <= n <= near_dte * 1.5]
    far = [e for e, n in dtes.items() if far_dte * 2 / 3 <= n <= far_dte * 1.5]
    if not near or not far:
        out["reasons"] = [f"no listed expiries near {near_dte} and {far_dte} days out"]
        return out
    e_near = min(near, key=lambda e: (abs(dtes[e] - near_dte), e))
    e_far = min(far, key=lambda e: (abs(dtes[e] - far_dte), e))
    iv_near, iv_far = atm_iv(chain, e_near), atm_iv(chain, e_far)
    out.update(near_expiry=e_near, far_expiry=e_far, iv_near=iv_near, iv_far=iv_far)
    if iv_near is None or iv_far is None:
        out["reasons"] = ["no at-the-money implied volatility on " + " and ".join(
            e for e, iv in ((e_near, iv_near), (e_far, iv_far)) if iv is None)]
        return out
    out.update(data_ok=True, ratio=iv_near / iv_far,
               reasons=[f"ATM IV {iv_near:.3f} ({e_near}) / {iv_far:.3f} ({e_far}) = {iv_near / iv_far:.3f}"])
    return out


# ------------------------------------------------------------------------------------------------- results

def spread_intrinsic(legs: list[dict], spot: float) -> float:
    """The short spread's value at expiry per share: intrinsic value of the short legs minus the long legs."""
    total = 0.0
    for leg in legs:
        k = float(leg["strike"])
        value = max(k - spot, 0.0) if str(leg.get("right", "P")).upper() == "P" else max(spot - k, 0.0)
        total += value if leg["position"] == "short" else -value
    return total


def managed_exit(credit: float, cost_to_close: float, days_left: int, cfg: dict) -> str | None:
    """O1's exits (design §3 M7; track 14 §7.3; research/code/14-short-options spreadsim `manage`, rule "tp21"):
    "take_profit" when buying back costs <= `take_profit_at` (50%) of the credit, else "time_stop" at
    <= `exit_dte` (21) days to expiry. No stop; never roll. None keeps the trade open."""
    tp, exit_dte = cfg.get("take_profit_at"), cfg.get("exit_dte")
    if tp is not None and cost_to_close <= float(tp) * credit + _EPS:
        return "take_profit"
    if exit_dte is not None and days_left <= int(exit_dte):
        return "time_stop"
    return None


def result_on_max_loss(credit: float, width: float, cost: float) -> dict:
    """{"pnl", "max_loss", "return"} per share: P&L = credit - cost; return R = P&L / (width - credit)."""
    max_loss = width - credit
    pnl = credit - cost
    return {"pnl": pnl, "max_loss": max_loss, "return": pnl / max_loss if max_loss > 0 else None}


def o1_promotion_check(trades: list[dict], cfg_promotion: dict, *, months: float | None = None) -> dict:
    """Track 14 §7.6's paper-to-real test for O1 (design §3 M7: "Promotion needs >= 24 paper trades passing track
    14's test") on closed shadow trades:

    1. at least `min_trades` (24) trades, or `max_months` (30) months, whichever comes first ("ready");
    2. mean R not below the model's `model_mean_r` (+2.0%) minus 2 standard errors (per-trade SD `model_sd_r`, 8.4%);
    3. median slippage <= 1/4 of the natural width: needs the practice account's fills, because the model's fills
       concede 0.3 of the natural width by construction, so it is reported, not tested;
    4. no loss beyond 100% of the stated max loss;
    5. the entry filters held on every entry.

    Returns {"n", "ready", "mean_r", "floor_r", "mean_ok", "worst_r", "within_max_loss", "filters_respected",
    "passes", "slippage"}; "passes" covers criteria 1, 2, 4 and 5.
    """
    rs = [float(t["return"]) for t in trades if as_float(t.get("return")) is not None]
    n = len(rs)
    model_mean, model_sd = float(cfg_promotion["model_mean_r"]), float(cfg_promotion["model_sd_r"])
    long_enough = months is not None and months >= float(cfg_promotion["max_months"])
    ready = n >= int(cfg_promotion["min_trades"]) or long_enough
    mean = sum(rs) / n if n else None
    floor = model_mean - 2.0 * model_sd / math.sqrt(n) if n else None
    mean_ok = mean is not None and floor is not None and mean >= floor
    within = all(r >= -1.0 - _EPS for r in rs)
    filters_ok = all(bool((t.get("filters") or {}).get("pass")) for t in trades)
    return {"n": n, "ready": ready, "mean_r": mean, "floor_r": floor, "mean_ok": mean_ok,
            "worst_r": min(rs) if rs else None, "within_max_loss": within, "filters_respected": filters_ok,
            "passes": bool(ready and mean_ok and within and filters_ok),
            "slippage": "not tested: needs practice-account fills (the model's fills concede 0.3 of the natural "
                        "width by construction)"}
