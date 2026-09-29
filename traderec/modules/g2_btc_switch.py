"""G2 - the Bitcoin switch (design v4 §3 G2; track 28 §9, track 31 §3.1): IBIT in the IRA, SGOV when off.

After the Sunday 00:00 UTC weekly close (the Sunday UTC daily candle, as M3 uses today, from the provider's
`btc_daily_utc()`): on when the Sunday close is above BOTH its 10-week average of Sunday closes and the 200-day
average of daily UTC closes; off otherwise. No band on the switch; the 25% rebalance band is in the order set.
M3's weekly-close mechanics (`btc_weekly_switch`, `last_sunday_before`, the UTC day normaliser) are imported from
`m3_btc`, which is not changed. The two-source rule: the Sunday close must agree with a second source within the
tolerance, else no signal (the state is kept). The vol cut: 60-day realised volatility above 70% for a quarter cuts
the size to 0.667 until it falls below 60%.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from traderec.modules.m3_btc import _utc_daily, btc_weekly_switch, last_sunday_before

__all__ = ["g2_signal", "realized_vol", "two_source_check", "vol_cut", "btc_weekly_switch", "last_sunday_before"]

DAYS_PER_YEAR = 365          # Bitcoin trades every day
QUARTER_DAYS = 91            # "for a quarter": 13 weekly readings


def realized_vol(btc_daily_utc: pd.Series, asof: str, days: int = 60) -> float | None:
    """Annualised standard deviation of the last `days` daily log returns up to and including `asof` (UTC days)."""
    s = _utc_daily(btc_daily_utc).loc[: pd.Timestamp(asof)]
    if len(s) < days + 1:
        return None
    r = np.log(s.to_numpy(dtype=float)[-(days + 1):])
    r = np.diff(r)
    return float(np.std(r, ddof=1) * math.sqrt(DAYS_PER_YEAR))


def g2_signal(btc_daily_utc: pd.Series, asof_utc_date: str, cfg_sig: dict) -> dict[str, Any]:
    """The switch as of `asof_utc_date` (the Monday UTC date after the Sunday run; M3's convention).

    Returns {"on", "complete", "week_end", "weekly_close", "ma10w", "sma200", "above_ma10w", "above_sma200",
    "vol60", "reason"}. `on` is False, with `complete` False, when the last week is incomplete, the 10 weekly closes
    or 200 daily closes are missing: callers keep the state then.
    """
    weeks, n = int(cfg_sig.get("weekly_ma_weeks", 10)), int(cfg_sig.get("sma_days", 200))
    sw = btc_weekly_switch(btc_daily_utc, asof_utc_date, weeks=weeks)
    out: dict[str, Any] = {"on": False, "complete": False, "week_end": sw["week_end"], "weekly_close": sw["weekly_close"],
                           "ma10w": sw["sma"], "sma200": None, "above_ma10w": None, "above_sma200": None,
                           "vol60": None, "reason": ""}
    if not sw["complete"]:
        out["reason"] = "no complete week to evaluate: state kept"
        return out
    if sw["sma"] is None:
        out["reason"] = f"fewer than {weeks} weekly closes: state kept"
        return out
    daily = _utc_daily(btc_daily_utc).loc[: pd.Timestamp(sw["week_end"])]
    if len(daily) < n:
        out["reason"] = f"fewer than {n} daily closes: state kept"
        return out
    sma200 = float(daily.iloc[-n:].mean())
    close = float(sw["weekly_close"])
    above_w, above_d = close > float(sw["sma"]), close > sma200
    out.update(complete=True, sma200=sma200, above_ma10w=above_w, above_sma200=above_d, on=bool(above_w and above_d),
               vol60=realized_vol(btc_daily_utc, sw["week_end"]),
               reason=(f"weekly close {close:,.0f} vs 10-week average {sw['sma']:,.0f} "
                       f"({'above' if above_w else 'below'}) and 200-day average {sma200:,.0f} "
                       f"({'above' if above_d else 'below'}): {'on' if above_w and above_d else 'off'}"))
    return out


def two_source_check(primary: float | None, secondary: float | None, tolerance: float,
                     source: str | None = None) -> dict[str, Any]:
    """{"ok", "primary", "secondary", "source", "reason"} for the Sunday close against a second source."""
    if primary is None or not math.isfinite(float(primary)):
        return {"ok": False, "primary": primary, "secondary": secondary, "source": source, "reason": "no_primary_close"}
    if secondary is None or not math.isfinite(float(secondary)) or float(secondary) <= 0:
        return {"ok": False, "primary": float(primary), "secondary": None, "source": source,
                "reason": "no_second_source: no second-source Bitcoin close (fail closed)"}
    diff = abs(float(secondary) / float(primary) - 1.0)
    ok = diff <= float(tolerance) + 1e-12
    return {"ok": ok, "primary": float(primary), "secondary": float(secondary), "source": source,
            "reason": f"{'match' if ok else 'mismatch'}: {source or 'second source'} {float(secondary):,.2f} vs "
                      f"primary {float(primary):,.2f}, diff {diff:.4%} {'<=' if ok else '>'} tolerance {float(tolerance):.2%}"}


def vol_cut(vol60: float | None, st: dict, date: str, cfg_vol: dict) -> dict[str, Any]:
    """The size cut (design v4 §3 G2 "Kill / review"), updating `st` (= state.growth.sleeves.G2).

    Above `realized_60d_vol_gt` the high-vol clock runs (`vol_high_since`); after `quarters` x 91 days the factor
    becomes `factor` and stays until the vol falls below `restore_below`. A None vol keeps everything as it is.
    Returns {"factor", "vol60", "high_since", "cut", "days_high"}.
    """
    factor = float(st.get("vol_cut_factor") or 1.0)
    if vol60 is None:
        return {"factor": factor, "vol60": None, "high_since": st.get("vol_high_since"), "cut": factor < 1.0,
                "days_high": None}
    gt, below = float(cfg_vol.get("realized_60d_vol_gt", 0.70)), float(cfg_vol.get("restore_below", 0.60))
    need_days = QUARTER_DAYS * int(cfg_vol.get("quarters", 1))
    cut_to = float(cfg_vol.get("factor", 0.667))
    days_high = None
    if vol60 > gt:
        st["vol_high_since"] = st.get("vol_high_since") or date
        days_high = (pd.Timestamp(date) - pd.Timestamp(st["vol_high_since"])).days
        if days_high >= need_days:
            factor = cut_to
    else:
        st["vol_high_since"] = None
        if vol60 < below:
            factor = 1.0
    st["vol_cut_factor"] = factor
    st["vol60"] = float(vol60)
    return {"factor": factor, "vol60": float(vol60), "high_since": st.get("vol_high_since"), "cut": factor < 1.0,
            "days_high": days_high}
