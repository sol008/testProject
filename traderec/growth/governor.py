"""The book-level governor and the hard stop (design v4 §3 "The book-level governor", §4; track 38 §4).

Drawdown = 1 - NAV / peak NAV, both marked at Friday's close over the IRA and the taxable account together. The peak
starts at the first Sunday run (and at every restart) and never falls. G(drawdown) = 1 until `full_until`, linear to
`floor` at `floor_at`, `floor` beyond; it is re-set on the Sunday run only and multiplies every sleeve's target. At a
drawdown of `hard_stop.at` (= D) everything is sold to SGOV, the book is paused (buys blocked, sells allowed) and it
restarts only after a review with the owner (`restart`).
"""
from __future__ import annotations

import math
from typing import Any


def _finite(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def peak_nav(prev_peak: float | None, nav: float) -> float:
    """The running peak: `nav` on the first call, then max(prev_peak, nav). It never falls."""
    v = _finite(nav)
    if v is None:
        raise ValueError(f"peak_nav: nav must be a number, got {nav!r}")
    p = _finite(prev_peak)
    return v if p is None else max(p, v)


def drawdown(nav: float, peak: float) -> float:
    """1 - nav / peak, floored at 0 (0.0 when the peak is not positive)."""
    v, p = _finite(nav), _finite(peak)
    if v is None or p is None or p <= 0:
        return 0.0
    return max(0.0, 1.0 - v / p)


def G(dd: float, cfg_gov: dict) -> float:
    """G = 1 until `full_until`, then linear to `floor` at `floor_at`, `floor` beyond (design v4 §3, §4).

    With the constitution's D = 40% values (0.15, 0.35, 0.25): G(10%) = 1, G(25%) = 0.625, G(35%) = G(50%) = 0.25.
    A NaN or None drawdown returns the floor (fail closed). `cfg_gov` may be the `growth.governor` block or the whole
    `growth` block.
    """
    g = cfg_gov.get("governor", cfg_gov)
    full, floor_at, floor = float(g["full_until"]), float(g["floor_at"]), float(g["floor"])
    d = _finite(dd)
    if d is None:
        return floor
    d = abs(d)
    if d <= full:
        return 1.0
    if d >= floor_at:
        return floor
    return 1.0 - (d - full) / (floor_at - full) * (1.0 - floor)


def hard_stop(dd: float, cfg_hs: dict) -> bool:
    """True at or beyond the hard stop (`hard_stop.at`, = D); a NaN drawdown counts as hit (fail closed)."""
    hs = cfg_hs.get("hard_stop", cfg_hs)
    at = float(hs.get("at") if hs.get("at") is not None else cfg_hs.get("drawdown_limit", 0.40))
    d = _finite(dd)
    return True if d is None else abs(d) >= at


def update(st: dict, nav: float, date: str, cfg_growth: dict) -> dict:
    """The Sunday state update: peak, drawdown, G, the hard stop and `paused` on `st` (= state.growth).

    G moves on this call only (weekly reset); the peak starts at the first call and never falls. The hard stop sets
    `paused` and `hard_stop_hit_on` once; `restart` clears them. Returns the `governor` ledger record.
    """
    prev_g = _finite(st.get("G"))
    peak = peak_nav(st.get("peak_nav"), nav)
    dd = drawdown(nav, peak)
    g = G(dd, cfg_growth)
    hit = hard_stop(dd, cfg_growth)
    if st.get("first_run") is None:
        st["first_run"] = date
    st.update(peak_nav=peak, drawdown=dd, G=g, G_date=date, last_run=date)
    if hit and not st.get("paused"):
        st["paused"] = True
        st["hard_stop_hit_on"] = date
    gov = cfg_growth.get("governor") or {}
    return {
        "date": date, "nav": float(nav), "peak": peak, "drawdown": dd, "G": g,
        "step": None if prev_g is None else g - prev_g, "previous_G": prev_g,
        "full_until": float(gov.get("full_until", 0.15)), "floor_at": float(gov.get("floor_at", 0.35)),
        "floor": float(gov.get("floor", 0.25)), "hard_stop_at": float((cfg_growth.get("hard_stop") or {}).get("at", 0.40)),
        "hard_stop": bool(hit), "paused": bool(st.get("paused")), "hard_stop_hit_on": st.get("hard_stop_hit_on"),
    }


def restart(st: dict, nav: float, date: str) -> None:
    """After the owner's review (design v4 §3): clear the pause and start the peak again at `nav`."""
    st.update(paused=False, hard_stop_hit_on=None, peak_nav=float(nav), drawdown=0.0, G=1.0, G_date=date,
              G_at_last_order=None, restarted_on=date)


def paused_blocks(st: dict, side: str) -> bool:
    """Paused (after the hard stop) blocks buys of the risk sleeves and allows sells."""
    return bool(st.get("paused")) and side == "buy"
