"""M3 - R2: Bitcoin weekly trend switch (policy module; opt-in sleeve).

Design v3.2 §3 "M3" and track 15 R2 (research/code/15-short-futures-crypto/p3_crypto.py): weekly closes are
the UTC daily closes resampled to weeks ending Sunday ("W-SUN", last close of the week). The switch is on
when the last complete weekly close is above the simple average of the last `weeks` (10) weekly closes.
When on, hold IBIT at the sleeve size; when off, hold nothing.
"""
from __future__ import annotations

import pandas as pd

SUNDAY = 6  # pandas weekday numbering: Monday = 0


def _utc_daily(series: pd.Series) -> pd.Series:
    """Closes on a tz-naive UTC-date index, sorted, NaNs and duplicate days dropped."""
    s = series.dropna().astype(float)
    idx = pd.DatetimeIndex(pd.to_datetime(s.index))
    if idx.tz is not None:
        idx = idx.tz_convert("UTC").tz_localize(None)
    s.index = idx.normalize()
    s = s[~s.index.duplicated(keep="last")]
    return s.sort_index()


def last_sunday_before(asof: pd.Timestamp) -> pd.Timestamp:
    """The latest Sunday strictly before `asof` (for a Sunday, the one a week earlier)."""
    days_back = (asof.weekday() - SUNDAY) % 7 or 7
    return asof.normalize() - pd.Timedelta(days=days_back)


def btc_weekly_switch(btc_daily_utc: pd.Series, asof_utc_date: str, weeks: int = 10) -> dict:
    """The Bitcoin 10-week switch as of `asof_utc_date` (track 15 R2).

    A week (Monday to Sunday, UTC candles) is complete only if its Sunday candle exists and
    asof_utc_date > that Sunday. The Sunday candle closes at Monday 00:00 UTC, so a job running on or after
    Monday UTC can see it. The switch uses the last complete week: weekly_close is its Sunday close;
    sma is the mean of the last `weeks` weekly closes up to and including that week. Each weekly close is
    the last daily close available in its week. Candles after that week (in progress or later) are never
    used.

    Returns {"on", "week_end", "weekly_close", "sma", "complete"}:

    * on: weekly_close > sma. It is False when fewer than `weeks` weekly closes exist; sma is then None.
    * week_end: "YYYY-MM-DD" (a Sunday), or None when no complete week exists.
    * complete: True when week_end is the latest Sunday before asof, so the result is up to date. False
      when that Sunday's candle is missing (the values then come from the last complete week, which is
      older) or when no complete week exists. Callers should not switch on a False.
    """
    if weeks < 1:
        raise ValueError(f"btc_weekly_switch: weeks must be >= 1, got {weeks}")
    asof = pd.Timestamp(asof_utc_date)
    latest_sunday = last_sunday_before(asof)
    out: dict = {"on": False, "week_end": None, "weekly_close": None, "sma": None, "complete": False}

    s = _utc_daily(btc_daily_utc)
    sundays = s.index[(s.index.weekday == SUNDAY) & (s.index <= latest_sunday)]
    if len(sundays) == 0:
        return out
    week_end = sundays[-1]

    weekly = s.loc[:week_end].resample("W-SUN").last().dropna()
    weekly_close = float(weekly.iloc[-1])
    window = weekly.iloc[-weeks:]
    sma = float(window.mean()) if len(window) == weeks else None
    out.update(on=bool(sma is not None and weekly_close > sma),
               week_end=week_end.strftime("%Y-%m-%d"),
               weekly_close=weekly_close,
               sma=sma,
               complete=bool(week_end == latest_sunday))
    return out
