"""NYSE trading calendar (regular holidays only).

Used to tell a holiday from missing data and to name the next session in emails. Fills never rely on
it: the pipeline fills orders at the first session that actually appears in the price data after the
order's creation date, so unscheduled closures (e.g. a national day of mourning) are handled by data.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")


def _as_date(d: str | date | datetime) -> date:
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    return date.fromisoformat(str(d)[:10])


def easter(year: int) -> date:
    """Gregorian Easter Sunday (anonymous Gregorian algorithm)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """n-th (1-based) weekday (Mon=0) of a month."""
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    last = nxt - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _observed(d: date, *, saturday_to_friday: bool = True) -> date | None:
    if d.weekday() == 5:
        return d - timedelta(days=1) if saturday_to_friday else None
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return d


@lru_cache(maxsize=None)
def nyse_holidays(year: int) -> frozenset[date]:
    """Full-day NYSE holidays for a year (rules in force since 2022)."""
    days = [
        # New Year's Day: a Saturday holiday is not moved to Friday 31 Dec (NYSE rule 7.2).
        _observed(date(year, 1, 1), saturday_to_friday=False),
        _nth_weekday(year, 1, 0, 3),                 # Martin Luther King Jr. Day
        _nth_weekday(year, 2, 0, 3),                 # Washington's Birthday
        easter(year) - timedelta(days=2),            # Good Friday
        _last_weekday(year, 5, 0),                   # Memorial Day
        _observed(date(year, 6, 19)) if year >= 2022 else None,  # Juneteenth
        _observed(date(year, 7, 4)),                 # Independence Day
        _nth_weekday(year, 9, 0, 1),                 # Labor Day
        _nth_weekday(year, 11, 3, 4),                # Thanksgiving
        _observed(date(year, 12, 25)),               # Christmas
    ]
    return frozenset(d for d in days if d is not None)


def is_trading_day(d: str | date | datetime) -> bool:
    day = _as_date(d)
    return day.weekday() < 5 and day not in nyse_holidays(day.year)


def next_trading_day(d: str | date | datetime) -> date:
    day = _as_date(d) + timedelta(days=1)
    while not is_trading_day(day):
        day += timedelta(days=1)
    return day


def prev_trading_day(d: str | date | datetime) -> date:
    day = _as_date(d) - timedelta(days=1)
    while not is_trading_day(day):
        day -= timedelta(days=1)
    return day


def now_et() -> datetime:
    return datetime.now(ET)


def today_et() -> date:
    return now_et().date()


def iso(d: str | date | datetime) -> str:
    return _as_date(d).isoformat()


SESSION_DONE = time(16, 15)    # the close is final a little after 16:00 ET


def latest_session(now: datetime | None = None) -> date:
    """The most recent NYSE session whose close is in (16:15 ET or later), as of `now` (default: now in ET).

    A delayed evening run that starts after midnight ET still maps to the session it was meant for.
    """
    now = (now or now_et()).astimezone(ET)
    d = now.date()
    if is_trading_day(d) and now.time() >= SESSION_DONE:
        return d
    return prev_trading_day(d)


def latest_sunday(now: datetime | None = None) -> date:
    """The most recent Sunday on or before today in ET (the weekly Bitcoin job's date)."""
    d = (now or now_et()).astimezone(ET).date()
    return d - timedelta(days=(d.weekday() + 1) % 7)
