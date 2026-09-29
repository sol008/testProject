"""Tests for the data layer (traderec/data).

Offline: FakeProvider, verify_close, the payload parsers (small fixtures trimmed from real responses on
2026-09-29), and LiveProvider's retry, fallback and memo logic against a fake HTTP session and a stubbed
yfinance call. The live smoke tests at the bottom run only with RUN_NETWORK_TESTS=1.
"""
from __future__ import annotations

import json
import math
import os
from collections.abc import Callable
from typing import Any

import numpy as np
import pandas as pd
import pytest
import requests

from traderec.config import load_config
from traderec.data import BAR_COLUMNS, DataError, DataProvider, FakeProvider, LiveProvider, verify_close
from traderec.data.providers import (
    BROWSER_HEADERS,
    CBOE_CSV_URL,
    COINBASE_CANDLES_URL,
    COINBASE_MAX_CANDLES,
    FRED_CSV_URL,
    ROBINHOOD_QUOTES_URL,
    TIMEOUT_SECONDS,
    USER_AGENT,
    YAHOO_CHART_URL,
    normalise_yf_frame,
    parse_cboe_csv,
    parse_coinbase_candles,
    parse_fred_csv,
    parse_nasdaq_historical,
    parse_robinhood_quote,
    parse_yahoo_quote,
)

SEED = 20260929
NOW = pd.Timestamp("2026-09-29 02:30", tz="UTC")   # 22:30 ET on Mon 28 Sep 2026: after the close
TODAY_UTC = pd.Timestamp("2026-09-29")
BACKOFF = [1.0, 2.0, 4.0]

# --- payload fixtures (trimmed from real responses) --------------------------------------------------------

NASDAQ_HEADERS = {"date": "Date", "close": "Close/Last", "volume": "Volume", "open": "Open", "high": "High",
                  "low": "Low"}
NASDAQ_ETF = {
    "data": {"symbol": "SPY", "totalRecords": 2, "tradesTable": {"asOf": None, "headers": NASDAQ_HEADERS, "rows": [
        {"date": "09/25/2026", "close": "771.35", "volume": "36,666,730", "open": "768.78", "high": "772.28",
         "low": "766.29"},
        {"date": "09/24/2026", "close": "767.18", "volume": "43,983,660", "open": "764.065", "high": "768.95",
         "low": "763.245"},
    ]}},
    "message": None, "status": {"rCode": 200, "bCodeMessage": None, "developerMessage": None},
}
NASDAQ_STOCK = {
    "data": {"symbol": "AAPL", "totalRecords": 1, "tradesTable": {"asOf": None, "headers": NASDAQ_HEADERS, "rows": [
        {"date": "09/25/2026", "close": "$1,341.07", "volume": "30,002,510", "open": "$1,336.04",
         "high": "$1,341.67", "low": "$1,334.53"},
    ]}},
    "message": None, "status": {"rCode": 200, "bCodeMessage": None, "developerMessage": None},
}
NASDAQ_NO_SYMBOL = {"data": None, "message": None, "status": {
    "rCode": 400, "bCodeMessage": [{"code": 1001, "errorMessage": "Symbol not exists."}], "developerMessage": None}}
NASDAQ_SAME_DAY_WINDOW = {"data": None, "message": None, "status": {
    "rCode": 400, "bCodeMessage": [{"code": 1011, "errorMessage": "Provided date is less than from date"}],
    "developerMessage": None}}
NASDAQ_NO_ROWS = {"data": {"symbol": "SPY", "totalRecords": 0,
                           "tradesTable": {"asOf": None, "headers": NASDAQ_HEADERS, "rows": None}},
                  "message": None, "status": {"rCode": 200, "bCodeMessage": None, "developerMessage": None}}
NASDAQ_SPY_0928 = {
    "data": {"symbol": "SPY", "totalRecords": 1, "tradesTable": {"asOf": None, "headers": NASDAQ_HEADERS, "rows": [
        {"date": "09/28/2026", "close": "765.61", "volume": "42,121,217", "open": "768.35", "high": "769.54",
         "low": "763.715"}]}},
    "message": None, "status": {"rCode": 200, "bCodeMessage": None, "developerMessage": None},
}

# Yahoo chart API (/v8/finance/chart/SPY?range=1d&interval=1d) at 20:55 ET on 28 Sep 2026, trimmed.
YAHOO_CLOSE_0928 = 1790625600          # 2026-09-28 20:00:00 UTC = 16:00:00 ET
YAHOO_META_SPY = {
    "currency": "USD", "symbol": "SPY", "exchangeName": "PCX", "instrumentType": "ETF",
    "regularMarketTime": YAHOO_CLOSE_0928, "gmtoffset": -14400, "timezone": "EDT",
    "exchangeTimezoneName": "America/New_York", "regularMarketPrice": 765.61, "chartPreviousClose": 771.35,
    "priceHint": 2, "dataGranularity": "1d", "range": "1d",
    "currentTradingPeriod": {"regular": {"timezone": "EDT", "start": 1790602200, "end": 1790625600,
                                         "gmtoffset": -14400}},
}
YAHOO_CHART_SPY = {"chart": {"result": [{"meta": YAHOO_META_SPY, "timestamp": [1790602200],
                                         "indicators": {"quote": [{}]}}], "error": None}}
YAHOO_NOT_FOUND = {"chart": {"result": None, "error": {"code": "Not Found",
                                                       "description": "No data found, symbol may be delisted"}}}


def yahoo_chart(**meta: Any) -> dict:
    return {"chart": {"result": [{"meta": {**YAHOO_META_SPY, **meta}}], "error": None}}

CBOE_CSV = (
    "DATE,OPEN,HIGH,LOW,CLOSE\n"
    "09/24/2026,15.830000,16.570000,15.340000,15.670000\n"
    "09/23/2026,14.160000,15.450000,14.120000,15.180000\n"
    "09/25/2026,15.610000,15.940000,14.680000,14.870000\n"
)

# [time, low, high, open, close, volume], newest first as Coinbase sends them; 28 Sep appears twice.
COINBASE_ROWS = [
    [1790640000, 83296.25, 83511.48, 83456.74, 83417.05, 43.45041629],      # 29 Sep (still trading)
    [1790553600, 82510.37, 84992, 84463.08, 83456.74, 6680.12066817],       # 28 Sep
    [1790553600, 82510.37, 84992, 84463.08, 83456.74, 6680.12066817],       # 28 Sep, duplicate
    [1790467200, 84113.56, 85158.5, 84416.64, 84462.14, 2958.05456342],     # 27 Sep
]

FRED_CSV = "observation_date,DTB3\n2026-09-23,4.04\n2026-09-24,4.08\n2026-09-25,4.07\n2026-09-28,\n"
FRED_CSV_OLD = "DATE,DTB3\n2026-09-23,4.04\n2026-09-24,4.08\n2026-09-25,.\n"


def robinhood_quote(**overrides: Any) -> dict:
    quote = {
        "ask_price": "766.640000", "bid_price": "765.620000",
        "last_trade_price": "765.560000", "venue_last_trade_time": "2026-09-28T19:59:59.999496895Z",
        "last_extended_hours_trade_price": "765.960000",
        "previous_close": "771.350000", "adjusted_previous_close": "771.350000",
        "previous_close_date": "2026-09-25", "symbol": "SPY", "trading_halted": False, "has_traded": True,
        "updated_at": "2026-09-29T00:00:00Z", "state": "active",
    }
    quote.update(overrides)
    return {"results": [quote]}


# --- builders -----------------------------------------------------------------------------------------------

def make_bars(closes: Any, start: str = "2026-08-17") -> pd.DataFrame:
    """A contract price frame on business days."""
    close = np.asarray(closes, dtype=float)
    return pd.DataFrame(
        {"open": close, "high": close * 1.01, "low": close * 0.99, "close": close, "adj_close": close,
         "volume": np.full(len(close), 1e6)},
        index=pd.bdate_range(start, periods=len(close)),
    )


def yf_raw(ticker: str, dates: list[str], closes: list[float], *, opens: list[float] | None = None,
           tz: str | None = None, ticker_first: bool = False) -> pd.DataFrame:
    """A frame shaped like yfinance 1.7 ``download(ticker, auto_adjust=False)``: ("Price", "Ticker") columns.

    Opens default to the closes; high/low are open +/- 1.
    """
    index = pd.DatetimeIndex(pd.to_datetime(dates), name="Date")
    if tz:
        index = index.tz_localize(tz)
    close = np.asarray(closes, dtype=float)
    open_ = close if opens is None else np.asarray(opens, dtype=float)
    frame = pd.DataFrame({"Adj Close": close * 0.99, "Close": close, "High": open_ + 1.0, "Low": open_ - 1.0,
                          "Open": open_, "Volume": np.full(len(close), 1e6)}, index=index)
    frame.columns = pd.MultiIndex.from_product([frame.columns, [ticker]], names=["Price", "Ticker"])
    if ticker_first:
        frame.columns = frame.columns.swaplevel(0, 1)
    return frame


class FakeResponse:
    def __init__(self, status_code: int = 200, text: str = "", payload: Any = None) -> None:
        self.status_code = status_code
        self.text = json.dumps(payload) if payload is not None else text

    def json(self) -> Any:
        return json.loads(self.text)


class FakeSession:
    """Records GET calls and answers each with handler(url, params): a FakeResponse, or it raises."""

    def __init__(self, handler: Callable[[str, dict], FakeResponse]) -> None:
        self.handler = handler
        self.calls: list[dict] = []

    def get(self, url: str, params: Any = None, headers: Any = None, timeout: Any = None,
            allow_redirects: bool = True) -> FakeResponse:
        call = {"url": url, "params": dict(params or {}), "headers": dict(headers or {}), "timeout": timeout}
        self.calls.append(call)
        return self.handler(url, call["params"])


def no_network(url: str, params: dict) -> FakeResponse:
    pytest.fail(f"unexpected GET {url} {params}")


def live(handler: Callable[[str, dict], FakeResponse] = no_network,
         now: pd.Timestamp = NOW) -> tuple[LiveProvider, FakeSession, list[float]]:
    """A LiveProvider on a fake session, with a recording sleep and a fixed clock."""
    session = FakeSession(handler)
    sleeps: list[float] = []
    provider = LiveProvider(load_config(), session=session, sleep=sleeps.append, clock=lambda: now)
    return provider, session, sleeps


def stub_yfinance(provider: LiveProvider, answers: dict[str, Any]) -> list[str]:
    """Replace the raw yfinance call. An answer is a frame, None or an exception; a list is consumed in order."""
    calls: list[str] = []

    def download(ticker: str) -> Any:
        calls.append(ticker)
        answer = answers.get(ticker)
        if isinstance(answer, list):
            answer = answer.pop(0) if len(answer) > 1 else answer[0]
        if isinstance(answer, Exception):
            raise answer
        return answer

    provider._yf_download = download  # type: ignore[method-assign]
    return calls


@pytest.fixture
def spy() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    return make_bars(700.0 * np.exp(np.cumsum(rng.normal(0.0, 0.01, 30))))


# --- FakeProvider -------------------------------------------------------------------------------------------

def test_fake_provider_satisfies_the_protocol() -> None:
    assert isinstance(FakeProvider(), DataProvider)
    assert isinstance(LiveProvider(load_config()), DataProvider)


def test_fake_daily_bars_are_session_indexed_copies(spy: pd.DataFrame) -> None:
    shifted = spy.copy()
    shifted.index = (spy.index + pd.Timedelta(hours=16)).tz_localize("America/New_York")
    fake = FakeProvider(bars={"SPY": shifted.iloc[::-1]})

    bars = fake.daily_bars("SPY")
    assert bars.index.tz is None
    assert bars.index.equals(spy.index)          # same dates, same unit, sorted
    pd.testing.assert_frame_equal(bars, spy, check_freq=False)

    bars.loc[:, "close"] = 0.0                    # the caller's copy only
    assert fake.daily_bars("SPY")["close"].tolist() == spy["close"].tolist()
    assert fake.sources["daily_bars:SPY"] == "fake"


def test_fake_series_getters_and_missing_data(spy: pd.DataFrame) -> None:
    vix = pd.Series([15.67, 14.87], index=pd.to_datetime(["2026-09-24", "2026-09-25"]))
    btc = pd.Series([84462.14, 83456.74], index=pd.to_datetime(["2026-09-27", "2026-09-28"]))
    fake = FakeProvider(bars={"SPY": spy}, vix=vix, btc=btc)
    assert fake.vix().tolist() == [15.67, 14.87]
    assert fake.vix("^vix").tolist() == [15.67, 14.87]      # a bare Series means {"VIX": series}
    assert fake.btc_daily_utc().tolist() == [84462.14, 83456.74]
    assert fake.tbill_rate() == 0.04
    with pytest.raises(DataError):
        fake.vix("VIX3M")
    with pytest.raises(DataError):
        fake.daily_bars("QQQ")
    with pytest.raises(DataError):
        FakeProvider().btc_daily_utc()
    with pytest.raises(DataError):
        FakeProvider(tbill_rate=None).tbill_rate()
    assert FakeProvider(tbill_rate=0.0425).tbill_rate() == 0.0425


def test_fake_second_source_defaults_and_overrides(spy: pd.DataFrame) -> None:
    day, other = spy.index[-1], spy.index[-2].strftime("%Y-%m-%d")
    gspc = make_bars(np.linspace(7600.0, 7700.0, 30))
    fake = FakeProvider(bars={"SPY": spy, "^GSPC": gspc},
                        second_source={("SPY", other): 701.5, ("SPY", "2026-08-17"): None,
                                       ("^GSPC", other): 7690.0})
    # Default: echo the primary close (agreeing source); index tickers get None, as with LiveProvider.
    assert fake.second_source_close("SPY", day.strftime("%Y-%m-%d")) == {
        "close": float(spy["close"].iloc[-1]), "source": "nasdaq"}
    assert fake.second_source_close("SPY", day) == fake.second_source_close("SPY", day.strftime("%Y-%m-%d"))
    assert fake.second_source_close("^GSPC", day.strftime("%Y-%m-%d")) is None
    assert fake.second_source_close("SPY", "2026-12-25") is None
    assert fake.second_source_close("QQQ", other) is None
    # Overrides win: a number is the second-source close, None means no second source.
    assert fake.second_source_close("SPY", other) == {"close": 701.5, "source": "nasdaq"}
    assert fake.second_source_close("SPY", "2026-08-17") is None
    assert fake.second_source_close("^GSPC", other) == {"close": 7690.0, "source": "nasdaq"}
    named = FakeProvider(bars={"SPY": spy}, second_source_name="robinhood")
    assert named.second_source_close("SPY", day)["source"] == "robinhood"


# --- verify_close -------------------------------------------------------------------------------------------

def test_verify_close_ok_when_the_sources_agree(spy: pd.DataFrame) -> None:
    day = spy.index[-1].strftime("%Y-%m-%d")
    res = verify_close(FakeProvider(bars={"SPY": spy}), spy, "SPY", day, 0.001)
    close = float(spy["close"].iloc[-1])
    assert res == {"ok": True, "primary": close, "secondary": close, "source": "nasdaq",
                   "reason": res["reason"]}
    assert res["reason"].startswith("match:")


def test_verify_close_ok_within_and_at_the_tolerance(spy: pd.DataFrame) -> None:
    day = spy.index[-1].strftime("%Y-%m-%d")
    close = float(spy["close"].iloc[-1])
    near = FakeProvider(bars={"SPY": spy}, second_source={("SPY", day): close * 1.0009})
    assert verify_close(near, spy, "SPY", day, 0.001)["ok"] is True

    # 3.003 / 3.0 - 1 is 0.001000000000000112 in floating point: exactly at the tolerance, so it passes.
    bars = make_bars([3.0], start=day)
    edge = FakeProvider(second_source={("XYZ", day): 3.003})
    res = verify_close(edge, bars, "XYZ", day, 0.001)
    assert res["ok"] is True and res["secondary"] == 3.003


def test_verify_close_mismatch_above_the_tolerance(spy: pd.DataFrame) -> None:
    day = spy.index[-1].strftime("%Y-%m-%d")
    close = float(spy["close"].iloc[-1])
    fake = FakeProvider(bars={"SPY": spy}, second_source={("SPY", day): close * 1.002},
                        second_source_name="robinhood")
    res = verify_close(fake, spy, "SPY", day, 0.001)
    assert res["ok"] is False
    assert res["primary"] == close and res["secondary"] == pytest.approx(close * 1.002)
    assert res["source"] == "robinhood"
    assert res["reason"].startswith("mismatch:")


def test_verify_close_fails_closed_without_a_second_source(spy: pd.DataFrame) -> None:
    day = spy.index[-1].strftime("%Y-%m-%d")
    fake = FakeProvider(bars={"SPY": spy, "^GSPC": spy}, second_source={("SPY", day): None})
    for ticker in ("SPY", "^GSPC"):
        res = verify_close(fake, spy, ticker, day, 0.001)
        assert res["ok"] is False
        assert res["primary"] == float(spy["close"].iloc[-1])
        assert res["secondary"] is None and res["source"] is None
        assert res["reason"].startswith("no_second_source:")


def test_verify_close_without_a_primary_close_does_not_query(spy: pd.DataFrame) -> None:
    class MustNotBeCalled(FakeProvider):
        def second_source_close(self, ticker: str, date: str) -> dict | None:
            pytest.fail("second source queried without a primary close")

    holey = spy.copy()
    holey.loc[holey.index[-1], "close"] = np.nan
    for day in ("2026-12-25", holey.index[-1]):
        res = verify_close(MustNotBeCalled(), holey, "SPY", day, 0.001)
        assert res["ok"] is False and math.isnan(res["primary"])
        assert res["secondary"] is None and res["source"] is None
        assert res["reason"].startswith("no_primary_close:")


def test_verify_close_fails_closed_on_a_broken_provider(spy: pd.DataFrame) -> None:
    day = spy.index[-1].strftime("%Y-%m-%d")

    class Broken(FakeProvider):
        def __init__(self, answer: Any) -> None:
            super().__init__()
            self.answer = answer

        def second_source_close(self, ticker: str, date: str) -> Any:
            if isinstance(self.answer, Exception):
                raise self.answer
            return self.answer

    for answer in (RuntimeError("network down"), {"close": "n/a", "source": "nasdaq"},
                   {"close": -1.0, "source": "nasdaq"}, {"close": float("nan")}, [771.35], "771.35"):
        res = verify_close(Broken(answer), spy, "SPY", day, 0.001)
        assert res["ok"] is False and res["secondary"] is None, answer
        assert res["reason"].startswith("no_second_source:")


# --- parsers ------------------------------------------------------------------------------------------------

def test_parse_nasdaq_historical_etf_and_stock_rows() -> None:
    assert parse_nasdaq_historical(NASDAQ_ETF, "2026-09-25") == 771.35
    assert parse_nasdaq_historical(NASDAQ_ETF, "2026-09-24") == 767.18
    assert parse_nasdaq_historical(NASDAQ_ETF, pd.Timestamp("2026-09-24")) == 767.18
    assert parse_nasdaq_historical(NASDAQ_STOCK, "2026-09-25") == 1341.07      # "$1,341.07"
    assert parse_nasdaq_historical(NASDAQ_ETF, "2026-09-28") is None           # not published yet


@pytest.mark.parametrize("payload", [NASDAQ_NO_SYMBOL, NASDAQ_SAME_DAY_WINDOW, NASDAQ_NO_ROWS, {}, None, [],
                                     {"data": {"tradesTable": {"rows": [{"date": "09/25/2026", "close": "N/A"},
                                                                        {"date": "bad", "close": "1"}, None]}}}])
def test_parse_nasdaq_historical_without_a_usable_row(payload: Any) -> None:
    assert parse_nasdaq_historical(payload, "2026-09-25") is None


def test_parse_cboe_csv() -> None:
    vix = parse_cboe_csv(CBOE_CSV)
    assert list(vix.index.strftime("%Y-%m-%d")) == ["2026-09-23", "2026-09-24", "2026-09-25"]
    assert vix.tolist() == [15.18, 15.67, 14.87]                  # the CLOSE column, sorted by date
    assert isinstance(vix.index, pd.DatetimeIndex) and vix.index.tz is None


@pytest.mark.parametrize("text", ["<html><body>Service unavailable</body></html>",
                                  "DATE,OPEN,HIGH,LOW\n09/25/2026,1,2,3\n",
                                  "DATE,OPEN,HIGH,LOW,CLOSE\n2026-09-25,1,2,3,4\n",
                                  "DATE,OPEN,HIGH,LOW,CLOSE\n"])
def test_parse_cboe_csv_rejects_other_payloads(text: str) -> None:
    with pytest.raises(ValueError):
        parse_cboe_csv(text)


def test_parse_coinbase_candles() -> None:
    btc = parse_coinbase_candles(COINBASE_ROWS)
    assert list(btc.index.strftime("%Y-%m-%d")) == ["2026-09-27", "2026-09-28", "2026-09-29"]
    assert btc.tolist() == [84462.14, 83456.74, 83417.05]         # element 4 is the close
    assert btc.index.tz is None and btc.index.is_unique
    assert parse_coinbase_candles([]).empty


@pytest.mark.parametrize("rows", [{"message": "granularity too small for the requested time range"},
                                  [[1790640000, 1.0]], [["x", 1, 2, 3, 4, 5]], None])
def test_parse_coinbase_candles_rejects_error_payloads(rows: Any) -> None:
    with pytest.raises(ValueError):
        parse_coinbase_candles(rows)


def test_parse_fred_csv_headers_and_missing_markers() -> None:
    new = parse_fred_csv(FRED_CSV)
    assert new.iloc[-1] == 4.07 and new.index[-1] == pd.Timestamp("2026-09-25")   # empty 28 Sep skipped
    old = parse_fred_csv(FRED_CSV_OLD)
    assert old.iloc[-1] == 4.08 and old.index[-1] == pd.Timestamp("2026-09-24")    # "." skipped
    with pytest.raises(ValueError):
        parse_fred_csv("observation_date,DTB3\n2026-09-28,.\n")
    with pytest.raises(ValueError):
        parse_fred_csv("<html>blocked</html>")


def test_parse_robinhood_quote_last_trade_on_the_date() -> None:
    quote = robinhood_quote()
    # 19:59:59.999 UTC on 28 Sep is 15:59:59 ET on 28 Sep (nanosecond timestamp).
    assert parse_robinhood_quote(quote, "2026-09-28") == 765.56
    assert parse_robinhood_quote(quote, "2026-09-28", now=NOW) == 765.56
    # No venue time: updated_at (00:00 UTC on 29 Sep = 20:00 ET on 28 Sep) dates the last trade.
    assert parse_robinhood_quote(robinhood_quote(venue_last_trade_time=None), "2026-09-28") == 765.56
    # Robinhood's previous close covers the previous session.
    assert parse_robinhood_quote(quote, "2026-09-25") == 771.35
    assert parse_robinhood_quote(quote, "2026-09-24") is None


def test_parse_robinhood_quote_guards() -> None:
    intraday = robinhood_quote(venue_last_trade_time="2026-09-28T18:00:00Z", previous_close_date="2026-09-25")
    # 14:00 ET: the session of 28 Sep is not over, so the last trade is not a close.
    assert parse_robinhood_quote(intraday, "2026-09-28", now=pd.Timestamp("2026-09-28 18:00:05", tz="UTC")) is None
    assert parse_robinhood_quote(intraday, "2026-09-28", now=pd.Timestamp("2026-09-28 20:00", tz="UTC")) == 765.56
    # A trade after midnight UTC but before midnight ET belongs to the ET date.
    late = robinhood_quote(venue_last_trade_time="2026-09-29T01:30:00Z", previous_close_date="2026-09-25")
    assert parse_robinhood_quote(late, "2026-09-28") == 765.56
    assert parse_robinhood_quote(late, "2026-09-29") is None
    for payload in ({"results": []}, {"results": [None]}, {"missing_instruments": ["NOPE"]}, None, [],
                    robinhood_quote(last_trade_price=None, previous_close_date=None)):
        assert parse_robinhood_quote(payload, "2026-09-28") is None


def test_parse_yahoo_quote_on_the_date_at_or_after_the_close() -> None:
    assert parse_yahoo_quote(YAHOO_CHART_SPY, "2026-09-28") == 765.61
    assert parse_yahoo_quote(YAHOO_META_SPY, "2026-09-28") == 765.61               # a bare meta dict
    yf_meta = {**YAHOO_META_SPY, "regularMarketTime": pd.Timestamp("2026-09-28 16:00", tz="America/New_York")}
    assert parse_yahoo_quote(yf_meta, pd.Timestamp("2026-09-28")) == 765.61       # yfinance's copy
    # 01:00 UTC on 29 Sep is 21:00 ET on 28 Sep: still the 28th, after the close.
    assert parse_yahoo_quote(yahoo_chart(regularMarketTime=YAHOO_CLOSE_0928 + 5 * 3600), "2026-09-28") == 765.61


@pytest.mark.parametrize("payload", [
    yahoo_chart(regularMarketTime=YAHOO_CLOSE_0928 - 1),               # 15:59:59 ET: an intraday price
    yahoo_chart(regularMarketTime=YAHOO_CLOSE_0928 - 4 * 3600),        # 12:00 ET
    yahoo_chart(regularMarketTime=YAHOO_CLOSE_0928 - 3 * 86400),       # the 25th's close
    yahoo_chart(regularMarketTime=None), yahoo_chart(regularMarketTime="soon"),
    yahoo_chart(regularMarketPrice=None), yahoo_chart(regularMarketPrice="n/a"),
    YAHOO_NOT_FOUND, {"chart": {"result": [], "error": None}}, {}, None, [],
])
def test_parse_yahoo_quote_rejects_other_times_and_payloads(payload: Any) -> None:
    assert parse_yahoo_quote(payload, "2026-09-28") is None


def test_normalise_yf_frame_flattens_and_cleans() -> None:
    raw = yf_raw("SPY", ["2026-09-24", "2026-09-25", "2026-09-28"], [767.18, 771.35, np.nan],
                 tz="America/New_York")
    bars = normalise_yf_frame(raw, "SPY")
    assert list(bars.columns) == list(BAR_COLUMNS)
    assert bars.index.tz is None and bars.index.name == "date"
    assert list(bars.index.strftime("%Y-%m-%d")) == ["2026-09-24", "2026-09-25"]   # NaN close dropped
    assert bars["close"].tolist() == [767.18, 771.35]
    assert bars["adj_close"].tolist() == pytest.approx([767.18 * 0.99, 771.35 * 0.99])
    assert (bars.dtypes == float).all()

    swapped = normalise_yf_frame(yf_raw("SPY", ["2026-09-25", "2026-09-24"], [771.35, 767.18],
                                        ticker_first=True), "SPY")
    assert swapped["close"].tolist() == [767.18, 771.35]
    flat = yf_raw("SPY", ["2026-09-25"], [771.35])
    flat.columns = flat.columns.get_level_values(0)
    assert normalise_yf_frame(flat, "SPY")["close"].tolist() == [771.35]


def test_normalise_yf_frame_empty_and_incomplete() -> None:
    for raw in (None, yf_raw("NOPE", [], [])):
        empty = normalise_yf_frame(raw, "NOPE")
        assert empty.empty and list(empty.columns) == list(BAR_COLUMNS)
    no_adj = yf_raw("SPY", ["2026-09-25"], [771.35]).drop(columns="Adj Close", level=0)
    with pytest.raises(DataError, match="adj_close"):
        normalise_yf_frame(no_adj, "SPY")


# --- LiveProvider, offline ----------------------------------------------------------------------------------

def test_user_agent_is_descriptive() -> None:
    assert USER_AGENT.startswith("traderec/") and "+https://" in USER_AGENT
    assert TIMEOUT_SECONDS == 20.0


def test_get_retries_transient_failures_with_backoff() -> None:
    answers = [requests.ConnectionError("reset"), FakeResponse(503), FakeResponse(429), FakeResponse(text="ok")]

    def handler(url: str, params: dict) -> FakeResponse:
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    provider, session, sleeps = live(handler)
    assert provider._get("https://example.test/data").text == "ok"
    assert sleeps == BACKOFF and len(session.calls) == 4
    assert all(c["timeout"] == 20.0 and c["headers"]["User-Agent"] == USER_AGENT for c in session.calls)


def test_get_gives_up_after_three_retries() -> None:
    provider, session, sleeps = live(lambda url, params: FakeResponse(500))
    with pytest.raises(DataError, match="HTTP 500"):
        provider._get("https://example.test/data")
    assert len(session.calls) == 4 and sleeps == BACKOFF


def test_get_does_not_retry_client_errors() -> None:
    provider, session, sleeps = live(lambda url, params: FakeResponse(404))
    with pytest.raises(DataError, match="HTTP 404"):
        provider._get("https://example.test/data")
    assert len(session.calls) == 1 and sleeps == []


def test_daily_bars_normalises_memoises_and_copies() -> None:
    provider, _, _ = live()
    calls = stub_yfinance(provider, {"SPY": yf_raw("SPY", ["2026-09-24", "2026-09-25", "2026-09-28"],
                                                   [767.18, 771.35, np.nan], tz="America/New_York")})
    bars = provider.daily_bars("SPY")
    assert list(bars.columns) == list(BAR_COLUMNS)
    assert list(bars.index.strftime("%Y-%m-%d")) == ["2026-09-24", "2026-09-25"]
    bars.loc[:, "close"] = 0.0
    assert provider.daily_bars("SPY")["close"].tolist() == [767.18, 771.35]
    assert calls == ["SPY"]                                   # memoised
    assert provider.sources["daily_bars:SPY"] == "yfinance"


def test_daily_bars_retries_yfinance_then_raises() -> None:
    provider, _, sleeps = live()
    good = yf_raw("QQQ", ["2026-09-25"], [600.0])
    calls = stub_yfinance(provider, {"QQQ": [RuntimeError("rate limited"), good]})
    assert provider.daily_bars("QQQ")["close"].tolist() == [600.0]
    assert calls == ["QQQ", "QQQ"] and sleeps == [1.0]

    provider, _, sleeps = live()
    calls = stub_yfinance(provider, {"NOPE": yf_raw("NOPE", [], [])})
    with pytest.raises(DataError, match="NOPE"):
        provider.daily_bars("NOPE")
    assert calls == ["NOPE"] * 4 and sleeps == BACKOFF


def test_vix_reads_the_cboe_csv() -> None:
    provider, session, _ = live(lambda url, params: FakeResponse(text=CBOE_CSV))
    vix = provider.vix("VIX")
    assert vix.name == "VIX" and vix.loc["2026-09-25"] == 14.87
    call = session.calls[0]
    assert call["url"] == CBOE_CSV_URL.format(name="VIX")
    assert call["url"] == "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv"
    assert call["headers"]["User-Agent"] == USER_AGENT and call["timeout"] == 20.0
    assert provider.sources["vix:VIX"] == "cboe"
    provider.vix("vix")
    assert len(session.calls) == 1                            # memoised, name case-insensitive


def test_vix_falls_back_to_yfinance() -> None:
    provider, session, sleeps = live(lambda url, params: FakeResponse(403))
    stub_yfinance(provider, {"^VIX3M": yf_raw("^VIX3M", ["2026-09-25", "2026-09-28"], [17.93, 18.23])})
    vix3m = provider.vix("VIX3M")
    assert vix3m.name == "VIX3M" and vix3m.tolist() == [17.93, 18.23]
    assert provider.sources["vix:VIX3M"] == "yfinance:^VIX3M"
    assert len(session.calls) == 1 and sleeps == []           # a 403 is not retried

    provider, _, _ = live(lambda url, params: FakeResponse(text="<html>maintenance</html>"))
    stub_yfinance(provider, {"^VIX": None})
    with pytest.raises(DataError):
        provider.vix()


def coinbase_history(first_day: pd.Timestamp) -> Callable[[str, dict], FakeResponse]:
    """Coinbase's candle endpoint for a product listed on `first_day` (close = 1000 + day number)."""

    def handler(url: str, params: dict) -> FakeResponse:
        assert url == COINBASE_CANDLES_URL and params["granularity"] == 86400
        start = pd.Timestamp(params["start"]).tz_localize(None)
        end = pd.Timestamp(params["end"]).tz_localize(None)
        if (end - start).days + 1 > COINBASE_MAX_CANDLES:
            return FakeResponse(400, payload={"message": "Count of aggregations requested exceeds 300"})
        days = pd.date_range(max(start, first_day), min(end, TODAY_UTC), freq="D")
        rows = [[int(d.timestamp()), 1.0, 2.0, 1.5, 1000.0 + (d - first_day).days, 5.0] for d in reversed(days)]
        return FakeResponse(payload=rows)

    return handler


def test_btc_pages_coinbase_backwards_and_drops_the_open_day() -> None:
    first_day = TODAY_UTC - pd.Timedelta(days=3000)
    provider, session, _ = live(coinbase_history(first_day))
    btc = provider.btc_daily_utc()
    assert len(session.calls) == 4                            # 4 x 300 candles >= 1,100 complete days
    windows = [(pd.Timestamp(c["params"]["start"]), pd.Timestamp(c["params"]["end"])) for c in session.calls]
    assert windows[0][1] == pd.Timestamp("2026-09-29T00:00:00Z")
    assert all((end - start).days == COINBASE_MAX_CANDLES - 1 for start, end in windows)
    assert all(later[0] - earlier[1] == pd.Timedelta(days=1) for later, earlier in zip(windows, windows[1:]))
    assert len(btc) == 1199 and btc.index.is_unique and btc.index.is_monotonic_increasing
    assert btc.index[-1] == pd.Timestamp("2026-09-28")        # 29 Sep is still trading: dropped
    assert btc.iloc[-1] == 1000.0 + 2999
    assert btc.name == "BTC-USD" and provider.sources["btc_daily_utc"] == "coinbase"


def test_btc_stops_paging_when_history_ends() -> None:
    first_day = TODAY_UTC - pd.Timedelta(days=500)
    provider, session, _ = live(coinbase_history(first_day))
    btc = provider.btc_daily_utc()
    assert len(session.calls) == 3                            # the third window is empty
    assert len(btc) == 500 and btc.index[0] == first_day and btc.index[-1] == pd.Timestamp("2026-09-28")


def test_btc_falls_back_to_yfinance() -> None:
    provider, session, sleeps = live(lambda url, params: FakeResponse(503))
    stub_yfinance(provider, {"BTC-USD": yf_raw("BTC-USD", ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"],
                                               [84406.45, 84458.09, 83456.74, 83421.09])})
    btc = provider.btc_daily_utc()
    assert list(btc.index.strftime("%Y-%m-%d")) == ["2026-09-26", "2026-09-27", "2026-09-28"]
    assert btc.name == "BTC-USD" and provider.sources["btc_daily_utc"] == "yfinance:BTC-USD"
    assert len(session.calls) == 4 and sleeps == BACKOFF


def test_tbill_rate_reads_fred_dtb3_once() -> None:
    provider, session, _ = live(lambda url, params: FakeResponse(text=FRED_CSV))
    assert provider.tbill_rate() == pytest.approx(0.0407)
    assert session.calls[0]["url"] == FRED_CSV_URL and session.calls[0]["params"] == {"id": "DTB3"}
    assert provider.sources["tbill_rate"] == "fred:DTB3"
    assert provider.tbill_rate() == pytest.approx(0.0407)
    assert len(session.calls) == 1


def test_tbill_rate_falls_back_to_irx_then_config() -> None:
    provider, _, sleeps = live(lambda url, params: FakeResponse(503))
    stub_yfinance(provider, {"^IRX": yf_raw("^IRX", ["2026-09-25", "2026-09-28"], [4.07, 4.057])})
    assert provider.tbill_rate() == pytest.approx(0.04057)
    assert provider.sources["tbill_rate"] == "yfinance:^IRX"
    assert sleeps == BACKOFF                                  # FRED was retried three times first

    provider, _, _ = live(lambda url, params: FakeResponse(text="<html>blocked</html>"))
    stub_yfinance(provider, {"^IRX": RuntimeError("yahoo down")})
    assert provider.tbill_rate() == load_config().data["fallback_tbill_rate"] == 0.04
    assert provider.sources["tbill_rate"] == "config:fallback_tbill_rate"

    provider, _, _ = live(lambda url, params: FakeResponse(text="observation_date,DTB3\n2026-09-25,407\n"))
    stub_yfinance(provider, {"^IRX": None})                   # 407% is not a T-bill yield
    assert provider.tbill_rate() == 0.04


def second_sources(nasdaq: dict[str, Any], robinhood: Any = 404,
                   yahoo: Any = None) -> Callable[[str, dict], FakeResponse]:
    """Nasdaq answers per assetclass; Robinhood and the Yahoo chart API with one answer each.

    An answer is a payload, an HTTP status or an exception. A None `yahoo` makes any Yahoo call fail the test.
    """

    def handler(url: str, params: dict) -> FakeResponse:
        if url.startswith("https://api.nasdaq.com/api/quote/"):
            answer = nasdaq.get(params["assetclass"], NASDAQ_NO_SYMBOL)
        elif url == ROBINHOOD_QUOTES_URL:
            answer = robinhood
        elif url.startswith("https://query1.finance.yahoo.com/v8/finance/chart/") and yahoo is not None:
            answer = yahoo
        else:
            pytest.fail(f"unexpected GET {url}")
        if isinstance(answer, Exception):
            raise answer
        return FakeResponse(answer) if isinstance(answer, int) else FakeResponse(payload=answer)

    return handler


def test_second_source_skips_index_tickers() -> None:
    provider, session, _ = live()
    assert provider.second_source_close("^GSPC", "2026-09-25") is None
    assert provider.second_source_close("^VIX", "2026-09-25") is None
    assert session.calls == []


def test_second_source_nasdaq_etf_with_a_one_day_window() -> None:
    provider, session, _ = live(second_sources({"etf": NASDAQ_ETF}))
    assert provider.second_source_close("SPY", "2026-09-25") == {"close": 771.35, "source": "nasdaq"}
    call = session.calls[0]
    assert call["url"] == "https://api.nasdaq.com/api/quote/SPY/historical"
    # Nasdaq rejects fromdate == todate, so the window is [date, date + 1].
    assert call["params"] == {"assetclass": "etf", "fromdate": "2026-09-25", "todate": "2026-09-26", "limit": 10}
    assert call["headers"]["User-Agent"] == BROWSER_HEADERS["User-Agent"]
    assert call["headers"]["User-Agent"].startswith("Mozilla/5.0")
    assert call["headers"]["Accept"] == "application/json, text/plain, */*"
    assert provider.second_source_close("spy", pd.Timestamp("2026-09-25")) == {"close": 771.35, "source": "nasdaq"}
    assert len(session.calls) == 1                            # memoised


def test_second_source_tries_nasdaq_stocks_when_etf_has_nothing() -> None:
    provider, session, _ = live(second_sources({"etf": NASDAQ_NO_SYMBOL, "stocks": NASDAQ_STOCK}))
    assert provider.second_source_close("AAPL", "2026-09-25") == {"close": 1341.07, "source": "nasdaq"}
    assert [c["params"]["assetclass"] for c in session.calls] == ["etf", "stocks"]


def test_second_source_falls_back_to_robinhood() -> None:
    handler = second_sources({"etf": requests.ConnectionError("reset")}, robinhood=robinhood_quote())
    provider, session, sleeps = live(handler)
    assert provider.second_source_close("SPY", "2026-09-28") == {"close": 765.56, "source": "robinhood"}
    nasdaq_calls = [c for c in session.calls if "nasdaq" in c["url"]]
    assert len(nasdaq_calls) == 4 and {c["params"]["assetclass"] for c in nasdaq_calls} == {"etf"}
    assert sleeps == BACKOFF
    rh_call = session.calls[-1]
    assert rh_call["params"] == {"symbols": "SPY"} and rh_call["headers"]["User-Agent"] == USER_AGENT


def test_second_source_robinhood_needs_the_session_to_be_over() -> None:
    quote = robinhood_quote(venue_last_trade_time="2026-09-28T18:00:00Z")
    intraday = pd.Timestamp("2026-09-28 18:00:10", tz="UTC")
    provider, _, _ = live(second_sources({"etf": NASDAQ_NO_ROWS}, robinhood=quote), now=intraday)
    assert provider.second_source_close("SPY", "2026-09-28") is None


def test_second_source_returns_none_and_caches_nothing_when_all_fail() -> None:
    provider, session, _ = live(second_sources({"etf": NASDAQ_NO_ROWS, "stocks": NASDAQ_NO_SYMBOL}, robinhood=404))
    assert provider.second_source_close("SPY", "2026-09-28") is None
    assert len(session.calls) == 3                            # etf, stocks, Robinhood (404: no retry)
    assert provider.second_source_close("SPY", "2026-09-28") is None
    assert len(session.calls) == 6                            # a miss is not cached


def test_second_source_never_raises() -> None:
    def explode(url: str, params: dict) -> FakeResponse:
        raise RuntimeError("unexpected failure")

    provider, _, _ = live(explode)
    assert provider.second_source_close("SPY", "2026-09-25") is None
    assert provider.second_source_close("SPY", "not a date") is None
    assert provider.second_source_close("", "2026-09-25") is None


# --- the newest bar without a close (integrator's live finding, 20:55 ET on 2026-09-28) ------------------

DATES3 = ["2026-09-24", "2026-09-25", "2026-09-28"]


def spy_open_bar() -> pd.DataFrame:
    """yfinance's SPY at 20:55 ET on 28 Sep: the 28th has open, high, low and volume but no close."""
    return yf_raw("SPY", DATES3, [767.18, 771.35, np.nan], opens=[764.07, 768.78, 768.35])


def filled_spy(nasdaq: dict[str, Any], yahoo: Any = None,
               now: pd.Timestamp = NOW) -> tuple[LiveProvider, FakeSession, list[float], pd.DataFrame]:
    """A provider whose SPY close for the 28th came from Robinhood (765.56), and its bars."""
    provider, session, sleeps = live(second_sources(nasdaq, robinhood=robinhood_quote(), yahoo=yahoo), now=now)
    stub_yfinance(provider, {"SPY": spy_open_bar()})
    return provider, session, sleeps, provider.daily_bars("SPY")


def urls(session: FakeSession) -> list[str]:
    return [call["url"] for call in session.calls]


def test_daily_bars_fills_the_open_newest_bar_from_robinhood() -> None:
    provider, session, _, bars = filled_spy({})
    assert list(bars.index.strftime("%Y-%m-%d")) == DATES3
    newest = bars.loc["2026-09-28"]
    assert newest["close"] == newest["adj_close"] == 765.56           # Robinhood's last trade, 15:59:59 ET
    assert newest["open"] == 768.35 and newest["volume"] == 1e6       # yfinance's values are kept
    assert bars["close"].iloc[:2].tolist() == [767.18, 771.35]        # older rows untouched
    assert bars["adj_close"].iloc[:2].tolist() == pytest.approx([767.18 * 0.99, 771.35 * 0.99])
    assert provider.sources["daily_bars:SPY"] == "yfinance+robinhood-close"
    assert urls(session) == [ROBINHOOD_QUOTES_URL] and session.calls[0]["params"] == {"symbols": "SPY"}
    provider.daily_bars("SPY")
    assert len(session.calls) == 1                                    # memoised, fill included


@pytest.mark.parametrize("now, filled", [
    (pd.Timestamp("2026-09-28 20:14:59", tz="UTC"), False),   # 16:14:59 ET: too early
    (pd.Timestamp("2026-09-28 20:15:00", tz="UTC"), True),    # 16:15 ET
    (pd.Timestamp("2026-09-29 13:00:00", tz="UTC"), True),    # 09:00 ET the next day
])
def test_daily_bars_fills_only_from_16_15_et(now: pd.Timestamp, filled: bool) -> None:
    provider, session, _ = live(second_sources({}, robinhood=robinhood_quote()), now=now)
    stub_yfinance(provider, {"SPY": spy_open_bar()})
    bars = provider.daily_bars("SPY")
    assert (bars.index[-1] == pd.Timestamp("2026-09-28")) is filled
    assert len(session.calls) == int(filled)
    assert provider.sources["daily_bars:SPY"] == ("yfinance+robinhood-close" if filled else "yfinance")


@pytest.mark.parametrize("robinhood", [
    404, requests.ConnectionError("reset"),
    robinhood_quote(venue_last_trade_time="2026-09-25T19:59:59Z", previous_close_date="2026-09-24"),
])
def test_daily_bars_drops_the_open_bar_when_robinhood_has_nothing(robinhood: Any) -> None:
    provider, session, _ = live(second_sources({}, robinhood=robinhood))
    stub_yfinance(provider, {"SPY": spy_open_bar()})
    bars = provider.daily_bars("SPY")
    assert bars.index[-1] == pd.Timestamp("2026-09-25")
    assert provider.sources["daily_bars:SPY"] == "yfinance"
    assert set(urls(session)) == {ROBINHOOD_QUOTES_URL}


def test_daily_bars_never_fills_index_tickers_older_rows_or_bars_without_an_open() -> None:
    provider, session, _ = live()                                     # any GET fails the test
    stub_yfinance(provider, {
        "^GSPC": yf_raw("^GSPC", DATES3, [7743.41, 7683.69, np.nan], opens=[7709.86, 7721.70, 7721.70]),
        "QQQ": yf_raw("QQQ", DATES3, [600.0, np.nan, 605.0], opens=[599.0, 601.0, 603.0]),
        "IEF": yf_raw("IEF", DATES3, [96.0, 96.1, np.nan], opens=[96.0, 96.1, np.nan]),
        "GLD": yf_raw("GLD", ["2026-09-25", "2026-09-28", "2026-09-28"], [393.41, 390.0, np.nan],
                      opens=[392.0, 391.0, 391.0]),                   # the 28th already has a close
    })
    assert provider.daily_bars("^GSPC").index[-1] == pd.Timestamp("2026-09-25")
    assert list(provider.daily_bars("QQQ").index.strftime("%Y-%m-%d")) == ["2026-09-24", "2026-09-28"]
    assert provider.daily_bars("IEF").index[-1] == pd.Timestamp("2026-09-25")
    assert provider.daily_bars("GLD")["close"].tolist() == [393.41, 390.0]
    assert session.calls == []
    assert set(provider.sources.values()) == {"yfinance"}


def test_filled_close_is_checked_against_nasdaq_first() -> None:
    provider, session, _, bars = filled_spy({"etf": NASDAQ_SPY_0928})
    res = verify_close(provider, bars, "SPY", "2026-09-28", 0.001)
    assert res["ok"] is True
    assert (res["primary"], res["secondary"], res["source"]) == (765.56, 765.61, "nasdaq")
    assert urls(session).count(ROBINHOOD_QUOTES_URL) == 1             # the fill only


def test_filled_close_falls_back_to_the_yahoo_quote_not_robinhood() -> None:
    provider, session, _, bars = filled_spy({"etf": NASDAQ_NO_ROWS}, yahoo=YAHOO_CHART_SPY)
    res = verify_close(provider, bars, "SPY", "2026-09-28", 0.001)
    assert res["ok"] is True and res["reason"].startswith("match:")
    assert (res["primary"], res["secondary"], res["source"]) == (765.56, 765.61, "yahoo-quote")
    assert urls(session).count(ROBINHOOD_QUOTES_URL) == 1             # Robinhood never checks itself
    yahoo_call = next(call for call in session.calls if "finance.yahoo.com" in call["url"])
    assert yahoo_call["url"] == YAHOO_CHART_URL.format(ticker="SPY")
    assert yahoo_call["url"] == "https://query1.finance.yahoo.com/v8/finance/chart/SPY"
    assert yahoo_call["params"] == {"range": "1d", "interval": "1d"}
    assert yahoo_call["headers"]["User-Agent"] == USER_AGENT          # a browser UA gets HTTP 429
    # Only the filled (ticker, date) changes: the 25th still falls back to Robinhood's previous close.
    assert provider.second_source_close("SPY", "2026-09-25") == {"close": 771.35, "source": "robinhood"}


def test_filled_close_uses_yfinance_quote_meta_when_the_chart_api_fails() -> None:
    provider, session, sleeps, _ = filled_spy({"etf": NASDAQ_NO_ROWS}, yahoo=429)
    meta_calls: list[str] = []

    def quote_meta(symbol: str) -> dict:
        meta_calls.append(symbol)
        return {**YAHOO_META_SPY, "regularMarketTime": pd.Timestamp("2026-09-28 16:00", tz="America/New_York")}

    provider._yf_quote_meta = quote_meta  # type: ignore[method-assign]
    assert provider.second_source_close("SPY", "2026-09-28") == {"close": 765.61, "source": "yahoo-quote"}
    assert meta_calls == ["SPY"]
    assert sum("finance.yahoo.com" in url for url in urls(session)) == 4   # HTTP 429 is retried
    assert sleeps == BACKOFF


@pytest.mark.parametrize("yahoo", [
    yahoo_chart(regularMarketTime=YAHOO_CLOSE_0928 - 60),             # 15:59 ET: not a close
    yahoo_chart(regularMarketTime=YAHOO_CLOSE_0928 - 3 * 86400),      # the 25th's quote
    YAHOO_NOT_FOUND, 503,
])
def test_filled_close_fails_closed_without_nasdaq_or_a_closing_yahoo_quote(yahoo: Any) -> None:
    provider, session, _, bars = filled_spy({"etf": NASDAQ_NO_ROWS}, yahoo=yahoo)
    provider._yf_quote_meta = lambda symbol: None  # type: ignore[method-assign]
    res = verify_close(provider, bars, "SPY", "2026-09-28", 0.001)
    assert res["ok"] is False and res["primary"] == 765.56 and res["secondary"] is None
    assert res["reason"].startswith("no_second_source:")
    assert urls(session).count(ROBINHOOD_QUOTES_URL) == 1


def test_fill_discards_a_cached_robinhood_second_source() -> None:
    handler = second_sources({"etf": NASDAQ_NO_ROWS}, robinhood=robinhood_quote(), yahoo=YAHOO_CHART_SPY)
    provider, _, _ = live(handler)
    stub_yfinance(provider, {"SPY": spy_open_bar()})
    assert provider.second_source_close("SPY", "2026-09-28") == {"close": 765.56, "source": "robinhood"}
    bars = provider.daily_bars("SPY")                                 # now the close itself is Robinhood's
    res = verify_close(provider, bars, "SPY", "2026-09-28", 0.001)
    assert res["ok"] is True and res["source"] == "yahoo-quote" and res["secondary"] == 765.61


# --- live smoke tests (RUN_NETWORK_TESTS=1) -----------------------------------------------------------------

network = pytest.mark.skipif(os.environ.get("RUN_NETWORK_TESTS") != "1",
                             reason="live smoke test: set RUN_NETWORK_TESTS=1 to reach the real data sources")


@pytest.fixture(scope="module")
def live_provider() -> LiveProvider:
    return LiveProvider(load_config())


def _is_recent(index: pd.DatetimeIndex, days: int = 10) -> bool:
    return (pd.Timestamp.now(tz="UTC").tz_localize(None) - index[-1]).days <= days


@network
@pytest.mark.parametrize("ticker", ["SPY", "^GSPC", "^VIX", "BTC-USD"])
def test_live_yfinance_daily_bars(live_provider: LiveProvider, ticker: str) -> None:
    bars = live_provider.daily_bars(ticker)
    assert list(bars.columns) == list(BAR_COLUMNS)
    assert bars.index.tz is None and (bars.index == bars.index.normalize()).all()
    assert bars.index.is_unique and bars.index.is_monotonic_increasing
    assert bars["close"].notna().all() and len(bars) > 1000 and _is_recent(bars.index)


@network
@pytest.mark.parametrize("name", ["VIX", "VIX3M"])
def test_live_cboe_vix(live_provider: LiveProvider, name: str) -> None:
    series = live_provider._cboe_close(name)
    assert len(series) > 1000 and _is_recent(series.index) and 5.0 < series.iloc[-1] < 150.0


@network
def test_live_coinbase_btc(live_provider: LiveProvider) -> None:
    btc = live_provider.btc_daily_utc()
    assert live_provider.sources["btc_daily_utc"] == "coinbase"
    assert len(btc) >= 1100 and btc.index.is_unique and btc.index.is_monotonic_increasing
    assert btc.index[-1] == pd.Timestamp.now(tz="UTC").tz_localize(None).normalize() - pd.Timedelta(days=1)


@network
def test_live_fred_tbill(live_provider: LiveProvider) -> None:
    assert 0.0 < live_provider._fred_tbill() < 0.2


@network
def test_live_irx_tbill(live_provider: LiveProvider) -> None:
    assert 0.0 < live_provider._irx_tbill() < 0.2


@network
def test_live_nasdaq_close(live_provider: LiveProvider) -> None:
    bars = live_provider.daily_bars("SPY")
    day = bars.index[-2].strftime("%Y-%m-%d")                # a session Nasdaq has certainly published
    assert live_provider._nasdaq_close("SPY", day) == pytest.approx(float(bars["close"].iloc[-2]), rel=1e-3)


@network
def test_live_robinhood_quote(live_provider: LiveProvider) -> None:
    payload = live_provider._get_json(ROBINHOOD_QUOTES_URL, params={"symbols": "SPY"})
    day = payload["results"][0]["previous_close_date"]
    close = parse_robinhood_quote(payload, day)
    assert close is not None and close > 0
    bars = live_provider.daily_bars("SPY")
    if pd.Timestamp(day) in bars.index:
        assert close == pytest.approx(float(bars.at[pd.Timestamp(day), "close"]), rel=1e-3)


@network
def test_live_yahoo_quote(live_provider: LiveProvider) -> None:
    payload = live_provider._get_json(YAHOO_CHART_URL.format(ticker="SPY"), params={"range": "1d", "interval": "1d"})
    meta = payload["chart"]["result"][0]["meta"]
    stamp = pd.Timestamp(meta["regularMarketTime"], unit="s", tz="UTC").tz_convert("America/New_York")
    closed = stamp.strftime("%H:%M") >= "16:00"
    assert parse_yahoo_quote(payload, stamp.strftime("%Y-%m-%d")) == (meta["regularMarketPrice"] if closed else None)


@network
def test_live_verify_close_spy(live_provider: LiveProvider) -> None:
    bars = live_provider.daily_bars("SPY")
    day = bars.index[-1].strftime("%Y-%m-%d")
    res = verify_close(live_provider, bars, "SPY", day, float(load_config().data["two_source_tolerance"]))
    print(live_provider.sources["daily_bars:SPY"], res)
    assert res["ok"] and res["secondary"] is not None, res
    if live_provider.sources["daily_bars:SPY"] == "yfinance+robinhood-close":
        assert res["source"] in ("nasdaq", "yahoo-quote")
    assert live_provider.second_source_close("^GSPC", day) is None
