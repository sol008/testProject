"""M2 - R1: slow multi-asset trend book, long-only ETF8 in the Robinhood IRA.

Design v3.2 §3 "M2" (vehicle (a), owner decision 29 Sep) and track 15 R1:

* signal: sign of each leg's 252-session excess return (total return minus the annual T-bill rate);
* size: sign x vol_target_per_leg / 60-session EWMA volatility x scale, as a fraction of NAV;
* caps: long-only; single leg <= single_leg_cap_pct_nav; gross <= gross_cap_pct_nav; the US-equity legs'
  stress <= us_equity_stress_cap_pct_nav of NAV (design §4 clusters: M2 <= 3% of the US-equity room);
* orders: a no-trade band (25% of the leg's target or $300), sells first, at most 3 orders per email
  (design §3a.3).

Decided at the first close of each month and executed at the next open with dollar market orders.
"""
from __future__ import annotations

import math
from typing import Any

import pandas as pd

from traderec import indicators

US_EQUITY_CLUSTER = "us_equity"
MISSING_STRESS = 1.0  # a leg with no stress figure is assumed able to lose 100% (fail closed)


def _as_float(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _skipped(note: str) -> dict:
    return {"ret_252": None, "excess": None, "sign": None, "vol": None, "raw_target_frac": None,
            "skipped": True, "note": note}


def _leg_signal(series: pd.Series | None, ts: pd.Timestamp, lookback: int, span: int, rf_annual: float,
                vol_target: float, scale: float) -> dict:
    """One leg's signal on adjusted closes up to `ts` (track 15 R1, TSMOM L252)."""
    if series is None:
        return _skipped("no price series")
    s = series.dropna().sort_index().loc[:ts].astype(float)
    if s.empty or s.index[-1] != ts:
        return _skipped(f"no close on {ts.date()}")
    if len(s) < lookback + 1:
        return _skipped(f"insufficient history: {len(s)} closes, need {lookback + 1}")
    ret = _as_float(s.iloc[-1] / s.iloc[-1 - lookback] - 1.0)
    if ret is None:
        return _skipped(f"{lookback}-session return undefined")
    vol = _as_float(indicators.ewma_vol(s, span).iloc[-1])
    if vol is None or vol <= 0.0:
        return _skipped("EWMA volatility undefined")
    excess = ret - rf_annual
    sign = 1 if excess > 0 else -1
    return {"ret_252": ret, "excess": excess, "sign": sign, "vol": vol,
            "raw_target_frac": sign * vol_target / vol * scale, "skipped": False, "note": None}


def m2_signals(adj: dict[str, pd.Series], date: str, rf_annual: float, cfg_m2: dict) -> dict[str, dict]:
    """Per-leg trend signals on adjusted closes up to and including `date` (track 15 R1).

    For every leg in `cfg_m2["legs"]` (tickers in `adj` that are not legs are ignored):
    ret_252 = adj[t] / adj[t - lookback] - 1 (t = `date`); excess = ret_252 - rf_annual;
    sign = +1 if excess > 0 else -1; vol = indicators.ewma_vol(adj, ewma_span) at `date`;
    raw_target_frac = sign x vol_target_per_leg / vol x scale (a fraction of NAV).

    Each value is {"ret_252", "excess", "sign", "vol", "raw_target_frac", "skipped", "note"}. A leg with no
    series, no close stamped `date`, fewer than lookback + 1 closes, or undefined volatility is returned with
    skipped=True, None numbers and a `note` saying why; `m2_targets` then leaves its position unchanged.
    """
    ts = pd.Timestamp(date)
    lookback = int(cfg_m2["lookback_sessions"])
    span = int(cfg_m2["ewma_span"])
    vol_target = float(cfg_m2["vol_target_per_leg"])
    scale = float(cfg_m2["scale"])
    return {ticker: _leg_signal(adj.get(ticker), ts, lookback, span, float(rf_annual), vol_target, scale)
            for ticker in cfg_m2["legs"]}


def m2_targets(signals: dict, nav: float, stress: dict[str, float], cfg_m2: dict) -> dict:
    """Dollar targets per leg after M2's caps (design §3 M2 "Stress and caps", §4).

    Applied in order:
    1. long-only: a negative fraction becomes 0; dollars = fraction x nav;
    2. single leg: |dollars| <= single_leg_cap_pct_nav x nav;
    3. gross: sum |dollars| <= gross_cap_pct_nav x nav, scaling every leg by the same factor;
    4. US-equity: legs whose cluster in cfg legs is "us_equity" are scaled by one factor so that
       sum(|dollars| x stress[ticker]) <= us_equity_stress_cap_pct_nav x nav. A missing stress figure
       counts as 100%.

    Legs with no usable signal (skipped, or raw_target_frac None) get no target, so `m2_orders` leaves
    them alone; an explicit 0 target closes the position.

    Returns {"targets": {ticker: dollars}, "scalers": {"single_leg_cap": {ticker: factor},
    "gross_cap": factor, "us_equity_stress": factor}, "notes": [...]}; a factor of 1.0 means not binding.
    """
    nav = float(nav)
    if not nav > 0.0:
        raise ValueError(f"m2_targets: nav must be positive, got {nav}")
    legs: dict[str, str] = cfg_m2.get("legs") or {}
    long_only = bool(cfg_m2.get("long_only", True))
    notes: list[str] = []

    dollars: dict[str, float] = {}
    for ticker, sig in signals.items():
        frac = None if sig.get("skipped") else _as_float(sig.get("raw_target_frac"))
        if frac is None:
            why = sig.get("note") or "no signal"
            notes.append(f"{ticker}: no target ({why}); position left unchanged")
            continue
        if long_only and frac < 0.0:
            notes.append(f"{ticker}: trend negative; long-only, so the target is 0")
            frac = 0.0
        dollars[ticker] = frac * nav

    leg_cap_frac = float(cfg_m2["single_leg_cap_pct_nav"])
    leg_cap = leg_cap_frac * nav
    single: dict[str, float] = {}
    for ticker, d in dollars.items():
        if abs(d) > leg_cap:
            single[ticker] = leg_cap / abs(d)
            notes.append(f"{ticker}: {abs(d) / nav:.1%} of NAV capped at the {leg_cap_frac:.0%} single-leg cap")
            dollars[ticker] = math.copysign(leg_cap, d)

    gross_cap_frac = float(cfg_m2["gross_cap_pct_nav"])
    gross = sum(abs(d) for d in dollars.values())
    gross_factor = 1.0
    if gross > gross_cap_frac * nav:
        gross_factor = gross_cap_frac * nav / gross
        dollars = {t: d * gross_factor for t, d in dollars.items()}
        notes.append(f"gross {gross / nav:.1%} of NAV is above the {gross_cap_frac:.0%} cap: "
                     f"every leg scaled by {gross_factor:.3f}")

    us_cap_frac = float(cfg_m2["us_equity_stress_cap_pct_nav"])
    us_legs = [t for t in dollars if legs.get(t) == US_EQUITY_CLUSTER]
    us_stress = 0.0
    for ticker in us_legs:
        s = _as_float(stress.get(ticker))
        if s is None:
            notes.append(f"{ticker}: no stress figure; assumed {MISSING_STRESS:.0%} for the US-equity cap")
            s = MISSING_STRESS
        us_stress += abs(dollars[ticker]) * s
    us_factor = 1.0
    if us_stress > us_cap_frac * nav:
        us_factor = us_cap_frac * nav / us_stress
        for ticker in us_legs:
            dollars[ticker] *= us_factor
        notes.append(f"US-equity legs ({', '.join(us_legs)}) stress {us_stress / nav:.2%} of NAV is above the "
                     f"{us_cap_frac:.0%} cap: scaled by {us_factor:.3f}")

    return {"targets": dollars,
            "scalers": {"single_leg_cap": single, "gross_cap": gross_factor, "us_equity_stress": us_factor},
            "notes": notes}


def _order(ticker: str, side: str, dollars: float, close_all: bool) -> dict:
    return {"ticker": ticker, "side": side, "dollars": float(dollars), "close_all": close_all}


def m2_orders(current: dict[str, float], targets: dict[str, float], cfg_m2: dict) -> dict:
    """Rebalance orders from current market values to targets (design §3 M2 "No-trade band", §3a.3).

    For each ticker in `targets` (tickers only in `current` are left untouched), diff = target - current:

    * target == 0 and current > 0 -> sell everything (close_all=True, dollars = current value), band or not;
    * current == 0 and target >= band_abs_usd -> buy `target` dollars;
    * otherwise skip when |diff| < max(band_rel x |target|, band_abs_usd), else buy/sell |diff| dollars.

    At most `max_orders_per_email` orders are kept, choosing by |diff| descending (ties by ticker); the rest
    go to "deferred" in the same order. The kept orders are listed sells first, then buys.

    Returns {"orders": [...], "deferred": [...], "skipped_band": [...]}. Orders are
    {"ticker", "side", "dollars", "close_all"}; skipped entries are {"ticker", "target", "current",
    "diff", "band"}. Dollar amounts are unrounded.
    """
    band_rel = float(cfg_m2["band_rel"])
    band_abs = float(cfg_m2["band_abs_usd"])
    max_orders = int(cfg_m2["max_orders_per_email"])

    candidates: list[tuple[float, dict]] = []
    skipped: list[dict] = []
    for ticker in sorted(targets):
        target = float(targets[ticker])
        cur = float(current.get(ticker, 0.0))
        diff = target - cur
        if target == 0.0 and cur > 0.0:
            candidates.append((abs(diff), _order(ticker, "sell", cur, True)))
        elif cur == 0.0 and target >= band_abs:
            candidates.append((abs(diff), _order(ticker, "buy", target, False)))
        elif diff == 0.0:
            continue
        else:
            band = max(band_rel * abs(target), band_abs)
            if abs(diff) < band:
                skipped.append({"ticker": ticker, "target": target, "current": cur, "diff": diff, "band": band})
            else:
                candidates.append((abs(diff), _order(ticker, "buy" if diff > 0 else "sell", abs(diff), False)))

    candidates.sort(key=lambda c: (-c[0], c[1]["ticker"]))
    kept = [o for _, o in candidates[:max_orders]]
    deferred = [o for _, o in candidates[max_orders:]]
    orders = [o for o in kept if o["side"] == "sell"] + [o for o in kept if o["side"] == "buy"]
    return {"orders": orders, "deferred": deferred, "skipped_band": skipped}
