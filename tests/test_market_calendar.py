"""NYSE calendar and the default run dates."""
from datetime import date, datetime

import pytest

from traderec.market_calendar import (ET, easter, is_trading_day, latest_session, latest_sunday, next_trading_day,
                                      nyse_holidays, prev_trading_day)


def test_2026_and_2027_holidays_match_nyse():
    assert sorted(d.isoformat() for d in nyse_holidays(2026)) == [
        "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
        "2026-09-07", "2026-11-26", "2026-12-25"]
    assert date(2027, 6, 18) in nyse_holidays(2027)          # Juneteenth on a Saturday -> Friday
    assert date(2027, 12, 24) in nyse_holidays(2027)         # Christmas on a Saturday -> Friday
    assert date(2027, 12, 31) not in nyse_holidays(2027)     # New Year 2028 is a Saturday: no Friday holiday


def test_easter():
    assert easter(2026) == date(2026, 4, 5) and easter(2027) == date(2027, 3, 28)


def test_next_and_prev_session():
    assert next_trading_day("2026-11-25") == date(2026, 11, 27)
    assert next_trading_day("2026-10-02") == date(2026, 10, 5)
    assert prev_trading_day("2026-10-05") == date(2026, 10, 2)
    assert not is_trading_day("2026-10-03")


@pytest.mark.parametrize("now, session", [
    (datetime(2026, 9, 28, 22, 17, tzinfo=ET), date(2026, 9, 28)),   # the scheduled evening run
    (datetime(2026, 9, 29, 0, 40, tzinfo=ET), date(2026, 9, 28)),    # a run delayed past midnight
    (datetime(2026, 9, 28, 16, 5, tzinfo=ET), date(2026, 9, 25)),    # before the close is final
    (datetime(2026, 10, 3, 10, 0, tzinfo=ET), date(2026, 10, 2)),    # Saturday
    (datetime(2026, 11, 27, 1, 0, tzinfo=ET), date(2026, 11, 25)),   # after Thanksgiving
])
def test_latest_session(now, session):
    assert latest_session(now) == session


def test_latest_sunday():
    assert latest_sunday(datetime(2026, 9, 27, 21, 17, tzinfo=ET)) == date(2026, 9, 27)
    assert latest_sunday(datetime(2026, 9, 28, 0, 30, tzinfo=ET)) == date(2026, 9, 27)
    assert latest_sunday(datetime(2026, 10, 3, 12, 0, tzinfo=ET)) == date(2026, 9, 27)


def test_unscheduled_closures_are_not_trading_days():
    from traderec.market_calendar import is_trading_day, next_trading_day
    for d in ("2025-01-09", "2018-12-05", "2012-10-29", "2012-10-30", "2001-09-11", "2007-01-02"):
        assert not is_trading_day(d), d
    assert is_trading_day("2025-01-08") and is_trading_day("2025-01-10")
    assert next_trading_day("2025-01-08").isoformat() == "2025-01-10"

