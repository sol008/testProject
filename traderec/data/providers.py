"""Market-data providers (docs/INTERFACES.md §1): the only traderec code that touches the network.

Sources (design v3.2 §10 "Data dependencies"; research/09 free data stack):

* daily bars ......... yfinance (Yahoo): raw open/high/low/close, total-return ``adj_close``, volume;
* VIX / VIX3M ........ CBOE's official daily-close CSVs, then yfinance ^VIX / ^VIX3M;
* BTC-USD per UTC day  Coinbase Exchange public candles, then yfinance BTC-USD;
* 3-month T-bill ..... FRED DTB3, then yfinance ^IRX / 100, then constitution ``data.fallback_tbill_rate``;
* second-source close  for the two-source check (design §3 M1 "two-source-checked data"; track 13 §11.1):
  Nasdaq's public historical-quote API, then Robinhood's public quotes endpoint;
* option chains ...... CBOE's delayed-quotes JSON, then yfinance option chains in market hours only
  (docs/PHASE_B_CONTRACTS.md §1; the normalisers are in ``traderec.options.chain``).

`LiveProvider` does the network I/O. `FakeProvider` serves in-memory data to every offline test. Payload
parsing lives in pure functions (``normalise_yf_frame``, ``parse_*``), which are tested with small fixtures.
"""
from __future__ import annotations

import copy
import dataclasses
import hashlib
import io
import json
import logging
import math
import numbers
import time
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from typing import TYPE_CHECKING, Any, Protocol, TypeVar, runtime_checkable
from urllib.parse import quote

import pandas as pd
import requests

from traderec import __version__
from traderec.market_calendar import is_trading_day
from traderec.options.chain import OptionChain, chain_root, parse_cboe_chain, parse_yahoo_chain

if TYPE_CHECKING:
    from traderec.config import Config

__all__ = [
    "BAR_COLUMNS",
    "DataError",
    "DataProvider",
    "FakeProvider",
    "LiveProvider",
    "cboe_option_symbol",
    "iso_date",
    "normalise_yf_frame",
    "parse_cboe_csv",
    "parse_coinbase_candles",
    "parse_fred_csv",
    "parse_nasdaq_historical",
    "parse_robinhood_quote",
    "parse_yahoo_quote",
    "session_index",
]

log = logging.getLogger(__name__)

T = TypeVar("T")

NY_TZ = "America/New_York"
BAR_COLUMNS: tuple[str, ...] = ("open", "high", "low", "close", "adj_close", "volume")

# Network policy for every call (brief): 20 s timeout, 3 retries after the first try, 1/2/4 s apart.
TIMEOUT_SECONDS = 20.0
BACKOFF_SECONDS: tuple[float, ...] = (1.0, 2.0, 4.0)
# Descriptive UA for our own HTTP calls. FRED stalls requests whose UA looks like a browser or carries no
# URL (checked 2026-09-29), so the UA includes one. Yahoo's chart API answers this UA but returns HTTP 429
# to a browser UA sent from plain requests (checked 2026-09-28 20:55 ET).
USER_AGENT = f"traderec/{__version__} (+https://github.com/; paper-trading data layer)"
# Nasdaq's API only answers browser-like requests.
BROWSER_HEADERS: dict[str, str] = {
    "User-Agent": ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/126.0 Safari/537.36"),
    "Accept": "application/json, text/plain, */*",
}

CBOE_CSV_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/{name}_History.csv"
FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
FRED_TBILL_SERIES = "DTB3"
COINBASE_CANDLES_URL = "https://api.exchange.coinbase.com/products/BTC-USD/candles"
COINBASE_DAY_SECONDS = 86_400
COINBASE_MAX_CANDLES = 300      # per request; start and end are both inclusive
COINBASE_MIN_DAYS = 1_100       # complete UTC days to collect
COINBASE_MAX_PAGES = 8
NASDAQ_HISTORICAL_URL = "https://api.nasdaq.com/api/quote/{ticker}/historical"
ROBINHOOD_QUOTES_URL = "https://api.robinhood.com/quotes/"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
CBOE_QUOTE_URL = "https://cdn.cboe.com/api/global/delayed_quotes/quotes/_{name}.json"
# CBOE's delayed option chains (≈6-13 MB each). The URL answers 307 to cdn-api.cboe.com, which _get follows.
# Index roots take a leading underscore ("_XSP", "_SPX"; the SPX file holds SPXW too), equities do not ("SPY").
CBOE_OPTIONS_URL = "https://cdn.cboe.com/api/global/delayed_quotes/options/{symbol}.json"
CBOE_INDEX_OPTION_ROOTS = frozenset({"XSP", "SPX", "VIX", "NDX", "RUT", "XND", "MRUT", "DJX", "OEX", "XEO"})
# yfinance lists index options under the index symbol.
YAHOO_INDEX_OPTION_SYMBOLS = {"XSP": "^XSP", "SPX": "^SPX", "VIX": "^VIX", "NDX": "^NDX", "RUT": "^RUT"}
YAHOO_OPTION_MAX_DTE = 200      # the Yahoo fallback fetches expiries up to this far out, one request each
MARKET_OPEN_ET = "09:30"        # Yahoo option quotes are used only between these times on a trading day
                                # (research/14 §6.7: never use Yahoo after-hours quotes)
# Index tickers with a second source for their official close (design v3.3 W10: two-source S&P 500 closes):
# FRED's copy of S&P Dow Jones Indices' series first (published the same evening, checked 2026-09-28 22:15 ET),
# then CBOE's delayed index quote once its last trade is stamped at or after 16:00 ET that day.
INDEX_SECOND_SOURCES = {"^GSPC": {"fred": "SP500", "cboe": "SPX"}}

CLOSE_ET = "16:00"              # end of the regular NYSE session (America/New_York)
FILL_AFTER_ET = "16:15"         # earliest time a missing newest close may be filled from Robinhood

# The datetime unit pandas uses by default (datetime64[us] on pandas 3, [ns] on pandas 2). LiveProvider
# returns every index in it, so its output lines up with frames built by pd.date_range in tests.
_INDEX_UNIT = pd.date_range("2000-01-01", periods=1).unit
_RATE_BOUNDS = (-0.05, 0.25)    # a T-bill yield outside this range means a broken source


class DataError(RuntimeError):
    """A data source, or every source in a fallback chain, failed or returned unusable data."""


@runtime_checkable
class DataProvider(Protocol):
    """How every component reads market data (docs/INTERFACES.md §1)."""

    def daily_bars(self, ticker: str) -> pd.DataFrame:
        """Full daily history: open/high/low/close (raw), adj_close (total return), volume."""
        ...

    def vix(self, name: str = "VIX") -> pd.Series:
        """CBOE official daily close of a volatility index (VIX, VIX3M) on a DatetimeIndex."""
        ...

    def btc_daily_utc(self) -> pd.Series:
        """BTC-USD close per UTC day (index = UTC candle start date)."""
        ...

    def tbill_rate(self) -> float:
        """Annualised 3-month T-bill yield as a decimal (0.04 = 4%)."""
        ...

    def second_source_close(self, ticker: str, date: str) -> dict | None:
        """{"close": float, "source": "nasdaq" | "robinhood"}, or None when unavailable."""
        ...

    def option_chain(self, underlying: str) -> OptionChain:
        """A live snapshot of an option root's chain, "now" (docs/PHASE_B_CONTRACTS.md §1). No history exists."""
        ...


# --------------------------------------------------------------------------------------------------------
# Pure helpers and payload parsers (no network, no clock)
# --------------------------------------------------------------------------------------------------------

def cboe_option_symbol(root: str) -> str:
    """CBOE's file name for a root's option chain: "_XSP", "_SPX" (also for SPXW), or "SPY" for an equity."""
    r = chain_root(root)
    return f"_{r}" if r in CBOE_INDEX_OPTION_ROOTS else r

def iso_date(value: Any) -> str:
    """'YYYY-MM-DD' for a date string or timestamp-like value; ValueError when it cannot be parsed."""
    ts = pd.Timestamp(value)
    if ts is pd.NaT:
        raise ValueError(f"not a date: {value!r}")
    return ts.strftime("%Y-%m-%d")


def session_index(index: Any) -> pd.DatetimeIndex:
    """A tz-naive, normalised DatetimeIndex. A tz-aware index keeps its local calendar date."""
    idx = pd.DatetimeIndex(pd.to_datetime(index))
    if idx.tz is not None:
        idx = idx.tz_localize(None)
    return idx.normalize()


def _finalise(obj: T) -> T:
    """Copy with a session index in pandas' default unit, named "date", sorted, one row per date (last wins)."""
    out = obj.copy()
    out.index = session_index(out.index).as_unit(_INDEX_UNIT)
    out = out[~out.index.duplicated(keep="last")].sort_index()
    out.index.name = "date"
    return out


def _to_price(value: Any) -> float | None:
    """A finite, positive price from a number or a string like "$1,234.56"; None otherwise."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.replace("$", "").replace(",", "").strip()
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if math.isfinite(price) and price > 0 else None


def _snake(name: Any) -> str:
    return str(name).strip().lower().replace(" ", "_")


def _field_level(columns: pd.MultiIndex) -> int:
    """The MultiIndex level holding the price fields ("Close", "Adj Close", ...)."""
    for level in range(columns.nlevels):
        if "close" in {_snake(v) for v in columns.get_level_values(level)}:
            return level
    raise DataError(f"no price-field level in yfinance columns {list(columns)[:6]}")


def normalise_yf_frame(raw: pd.DataFrame | None, ticker: str) -> pd.DataFrame:
    """yfinance ``download(ticker, auto_adjust=False)`` output -> a contract price frame.

    Handles yfinance's MultiIndex columns (("Close", "SPY"), ...) in either level order. Columns become
    open, high, low, close, adj_close, volume (floats). The index becomes tz-naive and normalised (a
    tz-aware index keeps its exchange-local date), sorted, one row per date. Rows with a NaN close are
    dropped: yfinance leaves the close empty on a bar that is not final yet. None or an empty frame gives
    an empty frame. Raises DataError when a contract column is missing.
    """
    return _finalise_bars(_flatten_yf_frame(raw, ticker))


def _finalise_bars(frame: pd.DataFrame) -> pd.DataFrame:
    """Drop rows without a close, then `_finalise` (one row per date, sorted, named index)."""
    return _finalise(frame[frame["close"].notna()])


def _flatten_yf_frame(raw: pd.DataFrame | None, ticker: str) -> pd.DataFrame:
    """yfinance output -> contract columns (floats) on a stably sorted session index; no rows dropped yet."""
    if raw is None or len(raw) == 0:
        empty = pd.DataFrame(columns=list(BAR_COLUMNS), dtype=float)
        empty.index = pd.DatetimeIndex([], name="date").as_unit(_INDEX_UNIT)
        return empty
    df = raw
    if isinstance(df.columns, pd.MultiIndex):
        field = _field_level(df.columns)
        for level in range(df.columns.nlevels):
            if level != field and ticker in set(df.columns.get_level_values(level)):
                df = df.xs(ticker, axis=1, level=level)
                break
        if isinstance(df.columns, pd.MultiIndex):
            df = df.copy()
            df.columns = df.columns.get_level_values(_field_level(df.columns))
    df = df.rename(columns=_snake)
    if df.columns.duplicated().any():
        raise DataError(f"yfinance frame for {ticker} has duplicate columns {list(df.columns)}")
    missing = [c for c in BAR_COLUMNS if c not in df.columns]
    if missing:
        raise DataError(f"yfinance frame for {ticker} lacks columns {missing}")
    out = df[list(BAR_COLUMNS)].apply(pd.to_numeric, errors="coerce").astype(float)
    out.columns.name = None
    out.index = session_index(out.index).as_unit(_INDEX_UNIT)
    out.index.name = "date"
    return out.sort_index(kind="stable")


def parse_cboe_csv(text: str) -> pd.Series:
    """CBOE daily-price CSV (``DATE,OPEN,HIGH,LOW,CLOSE``, dates MM/DD/YYYY) -> the CLOSE series.

    Raises ValueError when the DATE/CLOSE columns are missing, a date does not parse, or there are no closes.
    """
    frame = pd.read_csv(io.StringIO(text))
    frame.columns = [str(c).strip().upper() for c in frame.columns]
    if "DATE" not in frame.columns or "CLOSE" not in frame.columns:
        raise ValueError(f"CBOE CSV lacks DATE/CLOSE columns: {list(frame.columns)[:6]}")
    dates = pd.to_datetime(frame["DATE"].astype(str).str.strip(), format="%m/%d/%Y")
    closes = pd.to_numeric(frame["CLOSE"], errors="coerce").to_numpy(dtype=float)
    series = pd.Series(closes, index=pd.DatetimeIndex(dates), name="CLOSE").dropna()
    if series.empty:
        raise ValueError("CBOE CSV has no closes")
    return _finalise(series)


def parse_fred_csv(text: str, series_id: str = FRED_TBILL_SERIES) -> pd.Series:
    """FRED ``fredgraph.csv`` -> the non-missing observations, in the file's units (percent for DTB3).

    The header is ``observation_date,<ID>`` (older files: ``DATE,<ID>``). Missing values are "." or empty.
    Raises ValueError when no observation parses.
    """
    frame = pd.read_csv(io.StringIO(text), na_values=["."])
    cols = [str(c).strip() for c in frame.columns]
    if len(cols) < 2:
        raise ValueError(f"FRED CSV has no value column: {cols}")
    frame.columns = cols
    value_col = series_id if series_id in cols else cols[-1]
    dates = pd.to_datetime(frame[cols[0]], errors="coerce")
    values = pd.to_numeric(frame[value_col], errors="coerce").to_numpy(dtype=float)
    series = pd.Series(values, index=pd.DatetimeIndex(dates), name=series_id)
    series = series[series.index.notna()].dropna()
    if series.empty:
        raise ValueError(f"FRED CSV has no {series_id} observations")
    return _finalise(series)


def parse_coinbase_candles(rows: Any) -> pd.Series:
    """Coinbase Exchange candles ``[[time, low, high, open, close, volume], ...]`` -> close per UTC day.

    ``time`` is the UTC epoch second of the candle start; the index is that UTC date (tz-naive), sorted
    and de-duplicated. An empty list gives an empty series (no candles in the window). Raises ValueError
    for a payload that is not a list of rows (Coinbase reports errors as ``{"message": ...}``).
    """
    if not isinstance(rows, list):
        raise ValueError(f"Coinbase candles payload is not a list: {str(rows)[:120]}")
    try:
        times = [int(row[0]) for row in rows]
        closes = [float(row[4]) for row in rows]
    except (TypeError, ValueError, IndexError) as exc:
        raise ValueError(f"malformed Coinbase candle row: {exc}") from exc
    series = pd.Series(closes, index=pd.to_datetime(times, unit="s"), name="BTC-USD", dtype=float)
    return _finalise(series)


def parse_nasdaq_historical(payload: Any, date: str) -> float | None:
    """The close on `date` from Nasdaq's ``/api/quote/{T}/historical`` JSON, or None.

    Rows sit at ``data.tradesTable.rows[]`` with ``date`` "MM/DD/YYYY" and ``close`` like "771.35" (ETFs)
    or "$341.07" (stocks). Errors come back as HTTP 200 with ``data: null`` and ``status.rCode`` 400.
    """
    try:
        target = pd.Timestamp(iso_date(date)).date()
        rows = payload["data"]["tradesTable"]["rows"] or []
    except (KeyError, TypeError, ValueError):
        return None
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        try:
            row_date = datetime.strptime(str(row.get("date", "")).strip(), "%m/%d/%Y").date()
        except ValueError:
            continue
        if row_date == target:
            return _to_price(row.get("close"))
    return None


def _ny_time(stamp: Any) -> pd.Timestamp | None:
    """An ISO timestamp (UTC when it carries no offset) in America/New_York, or None."""
    try:
        ts = pd.Timestamp(stamp)
    except (TypeError, ValueError):
        return None
    if ts is pd.NaT:
        return None
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    return ts.tz_convert(NY_TZ)


def _at_or_after_et(day: str, now: Any, hhmm: str = CLOSE_ET) -> bool:
    """True when `now` (UTC if naive) is at or after hh:mm America/New_York on `day`; True when now is None.

    With the default 16:00 this means the regular session of `day` is over.
    """
    if now is None:
        return True
    now_ts = pd.Timestamp(now)
    if now_ts.tzinfo is None:
        now_ts = now_ts.tz_localize("UTC")
    return bool(now_ts >= pd.Timestamp(f"{day} {hhmm}").tz_localize(NY_TZ))


def parse_cboe_quote(payload: Any, date: str) -> float | None:
    """The close on `date` from CBOE's delayed index quote JSON (``data.close``), or None.

    Only a quote whose ``last_trade_time`` (ET, no zone) falls on `date` at or after 16:00 counts as the close.
    """
    try:
        data = payload["data"]
        stamp = pd.Timestamp(str(data["last_trade_time"]))
    except (KeyError, TypeError, ValueError):
        return None
    if stamp.strftime("%Y-%m-%d") != iso_date(date) or stamp.strftime("%H:%M") < CLOSE_ET:
        return None
    return _to_price(data.get("close"))


def parse_robinhood_quote(payload: Any, date: str, now: Any = None) -> float | None:
    """The close on `date` from Robinhood's public ``/quotes/?symbols=T`` JSON, or None.

    Rule (brief): take ``last_trade_price`` only when its timestamp (``venue_last_trade_time``, else
    ``updated_at``), converted to America/New_York, falls on `date`. Two conservative additions:

    * when `now` is given, the last trade counts only once the regular session of `date` is over
      (16:00 ET), so an intraday price is never taken for a close;
    * ``previous_close`` is used when ``previous_close_date`` equals `date`. That is Robinhood's official
      prior close, and it covers checks made during the next session.
    """
    try:
        target = iso_date(date)
        results = payload.get("results") or []
        quote_row = next((q for q in results if isinstance(q, Mapping)), None)
    except (AttributeError, TypeError, ValueError):
        return None
    if quote_row is None:
        return None
    price = _to_price(quote_row.get("last_trade_price"))
    stamp = quote_row.get("venue_last_trade_time") or quote_row.get("updated_at")
    if price is not None and stamp:
        traded = _ny_time(stamp)
        if traded is not None and traded.strftime("%Y-%m-%d") == target and _at_or_after_et(target, now):
            return price
    if str(quote_row.get("previous_close_date") or "") == target:
        return _to_price(quote_row.get("previous_close"))
    return None


def _yahoo_meta(payload: Any) -> Mapping | None:
    """The quote meta of a Yahoo chart API response, or `payload` itself when it already is one; else None.

    A chart API response looks like ``{"chart": {"result": [{"meta": {...}}], "error": null}}``. yfinance's
    ``Ticker.get_history_metadata()`` returns the meta dict directly.
    """
    if not isinstance(payload, Mapping):
        return None
    if "regularMarketPrice" in payload:
        return payload
    try:
        meta = payload["chart"]["result"][0]["meta"]
    except (KeyError, IndexError, TypeError):
        return None
    return meta if isinstance(meta, Mapping) else None


def parse_yahoo_quote(payload: Any, date: str) -> float | None:
    """Yahoo's ``regularMarketPrice`` as the close on `date`, or None.

    `payload` is a chart API response (``/v8/finance/chart/T``) or its ``meta`` dict. The price counts only
    when ``regularMarketTime`` falls on `date` at or after 16:00 America/New_York. Yahoo stamps the official
    close 16:00:00 ET, so an earlier stamp is an intraday price. ``regularMarketTime`` is epoch seconds in
    the API, and a Timestamp in yfinance's copy.
    """
    meta = _yahoo_meta(payload)
    if meta is None:
        return None
    stamp = meta.get("regularMarketTime")
    try:
        target = iso_date(date)
        if isinstance(stamp, numbers.Real) and not isinstance(stamp, bool):
            quoted = pd.Timestamp(float(stamp), unit="s", tz="UTC")
        else:
            quoted = _ny_time(stamp)
            if quoted is None:
                return None
        quoted = quoted.tz_convert(NY_TZ)
    except (TypeError, ValueError, OverflowError):
        return None
    if quoted.strftime("%Y-%m-%d") != target or not _at_or_after_et(target, quoted):
        return None
    return _to_price(meta.get("regularMarketPrice"))


def _utc_iso(ts: pd.Timestamp) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")


def _plausible_rate(rate: float, what: str) -> float:
    if not math.isfinite(rate) or not _RATE_BOUNDS[0] < rate < _RATE_BOUNDS[1]:
        raise DataError(f"implausible T-bill rate {rate!r} from {what}")
    return rate


def _copy(value: T) -> T:
    """Callers get their own copy of a memoised result."""
    if isinstance(value, (pd.DataFrame, pd.Series)):
        return value.copy()
    if isinstance(value, OptionChain):
        return dataclasses.replace(value, frame=value.frame.copy())  # type: ignore[return-value]
    return copy.copy(value)


def _in_market_hours(now: pd.Timestamp) -> bool:
    """True from 09:30 to 16:00 America/New_York on an NYSE trading day. A naive `now` is read as UTC."""
    ts = pd.Timestamp(now)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    ts = ts.tz_convert(NY_TZ)
    hhmm = ts.strftime("%H:%M")
    return is_trading_day(ts.strftime("%Y-%m-%d")) and MARKET_OPEN_ET <= hhmm < CLOSE_ET


def _response_bytes(resp: Any) -> bytes:
    """The raw body of a requests-style response (its `.content`, else its `.text` as UTF-8)."""
    content = getattr(resp, "content", None)
    if isinstance(content, (bytes, bytearray)):
        return bytes(content)
    return str(resp.text).encode("utf-8")


# --------------------------------------------------------------------------------------------------------
# Live provider
# --------------------------------------------------------------------------------------------------------

class LiveProvider(DataProvider):
    """Network-backed DataProvider (docs/INTERFACES.md §1).

    * HTTP: every GET has a 20 s timeout and up to 3 retries 1/2/4 s apart on connection errors, timeouts,
      HTTP 429 and 5xx. Other 4xx answers are permanent and fail at once. Our own calls send a descriptive
      User-Agent; Nasdaq gets the browser-like headers it requires.
    * yfinance: the same timeout and retry schedule. An empty result counts as a failure. yfinance manages
      its own HTTP session and headers.
    * Memo cache per instance: one run sees one consistent snapshot. Callers get copies. Failures are not
      cached, and neither is a None from second_source_close.
    * ``sources`` records which source served each call, e.g. ``{"vix:VIX": "cboe", "tbill_rate":
      "fred:DTB3", "btc_daily_utc": "coinbase", "daily_bars:SPY": "yfinance", "option_chain:XSP": "cboe"}``.
      A newest bar whose close came from Robinhood shows as ``"yfinance+robinhood-close"`` (see
      `_fill_open_last_bar`).

    ``session`` (anything with a requests-style ``get``), ``sleep`` (the backoff wait) and ``clock`` (returns
    the current time as a tz-aware Timestamp) are test seams. ``user_agent`` overrides the default UA.
    """

    def __init__(self, cfg: Config, *, session: Any = None, sleep: Callable[[float], None] = time.sleep,
                 clock: Callable[[], pd.Timestamp] | None = None, user_agent: str = USER_AGENT) -> None:
        self._cfg = cfg
        self._session = session if session is not None else requests.Session()
        self._sleep = sleep
        self._clock = clock or (lambda: pd.Timestamp.now(tz="UTC"))
        self.user_agent = user_agent
        self.sources: dict[str, str] = {}
        self._cache: dict[tuple[Any, ...], Any] = {}
        self._robinhood_filled: set[tuple[str, str]] = set()   # (SYMBOL, date) closes taken from Robinhood

    # --- DataProvider ----------------------------------------------------------------------------------

    def daily_bars(self, ticker: str) -> pd.DataFrame:
        """Full daily history from yfinance, normalised by `normalise_yf_frame`.

        Works for ETFs, indices (^GSPC, ^VIX, ^IRX) and BTC-USD. The newest bar sometimes has no close yet.
        When its session is over, the close comes from Robinhood (see `_fill_open_last_bar`). Raises
        DataError when yfinance has nothing.
        """
        return self._memo(("daily_bars", ticker), lambda: self._fetch_daily_bars(ticker))

    def vix(self, name: str = "VIX") -> pd.Series:
        """The CBOE official daily close for `name` (VIX, VIX3M); falls back to the yfinance ^{name} close.

        The CBOE file can lag Yahoo by a session in the evening. The caller decides what a missing date
        means. Raises DataError when both sources fail.
        """
        key = name.strip().upper().lstrip("^")
        return self._memo(("vix", key), lambda: self._fetch_vix(key))

    def btc_daily_utc(self) -> pd.Series:
        """BTC-USD close per complete UTC day from Coinbase candles (>= 1,100 days); falls back to yfinance BTC-USD.

        The index is the UTC candle start date (tz-naive). The current UTC day's candle is still trading,
        so it is dropped: every value is a final daily close. Raises DataError when both sources fail.
        """
        return self._memo(("btc_daily_utc",), self._fetch_btc)

    def tbill_rate(self) -> float:
        """The FRED DTB3 last value / 100, else the yfinance ^IRX last close / 100, else the config fallback.

        The config fallback is constitution ``data.fallback_tbill_rate``.
        """
        return self._memo(("tbill_rate",), self._fetch_tbill)

    def second_source_close(self, ticker: str, date: str) -> dict | None:
        """The close of `ticker` on `date` from Nasdaq, else from Robinhood.

        When daily_bars took that close from Robinhood, Robinhood cannot also be the second source. The
        fallback is then Yahoo's quote, source "yahoo-quote" (see `_yahoo_quote_close`).

        Index tickers: those in INDEX_SECOND_SOURCES (the S&P 500) use FRED, then CBOE's delayed quote, with
        source "fred:SP500" or "cboe-quote"; other index tickers ("^...") return None.

        Returns {"close", "source"}. Returns None on any problem. Never raises.
        """
        try:
            symbol = str(ticker).strip().upper()
            if not symbol or (symbol.startswith("^") and symbol not in INDEX_SECOND_SOURCES):
                return None
            day = iso_date(date)
            key = ("second_source_close", symbol, day)
            if key not in self._cache:
                fetch = self._index_second_source if symbol.startswith("^") else self._fetch_second_source
                found = fetch(symbol, day)
                if found is None:
                    return None
                self._cache[key] = found
            return dict(self._cache[key])
        except Exception as exc:  # noqa: BLE001 - the contract says never raise
            log.warning("second-source close for %s on %s failed: %s", ticker, date, exc)
            return None

    def option_chain(self, underlying: str) -> OptionChain:
        """A snapshot of an option root's chain now: CBOE's delayed quotes, else yfinance in market hours.

        * CBOE: ``CBOE_OPTIONS_URL`` for `cboe_option_symbol(root)`, parsed by `parse_cboe_chain`. `asof` is
          CBOE's file time in ET. The quotes lag it by about 15 minutes. `raw_sha256` hashes the raw body.
        * Yahoo, the fallback, runs only in market hours (09:30-16:00 ET on a trading day, by the provider's
          clock). Track 14 §6.7 says never to use Yahoo's after-hours quotes. It fetches every expiry up to
          YAHOO_OPTION_MAX_DTE days out. `asof` is the fetch time, and `raw_sha256` hashes the frames' CSV.
        * "SPXW" is served from the SPX chain.
        * The memo cache gives one snapshot per root per provider, so one run sees one set of quotes.

        Raises DataError when both sources fail.
        """
        root = chain_root(underlying)
        return self._memo(("option_chain", root), lambda: self._fetch_option_chain(root))

    # --- fetch chains ----------------------------------------------------------------------------------

    def _fetch_daily_bars(self, ticker: str) -> pd.DataFrame:
        flat, filled = self._fill_open_last_bar(ticker, self._yf_flat(ticker))
        self.sources[f"daily_bars:{ticker}"] = "yfinance+robinhood-close" if filled else "yfinance"
        return _finalise_bars(flat)

    def _fetch_vix(self, name: str) -> pd.Series:
        try:
            series, source = self._cboe_close(name), "cboe"
        except Exception as exc:  # noqa: BLE001 - any CBOE failure falls back to Yahoo
            log.warning("CBOE %s history unavailable (%s); using yfinance ^%s", name, exc, name)
            series, source = self.daily_bars(f"^{name}")["close"], f"yfinance:^{name}"
        self.sources[f"vix:{name}"] = source
        return series.rename(name)

    def _fetch_btc(self) -> pd.Series:
        today = self._utc_today()
        try:
            series, source = self._coinbase_btc(today), "coinbase"
        except Exception as exc:  # noqa: BLE001 - any Coinbase failure falls back to Yahoo
            log.warning("Coinbase BTC-USD candles unavailable (%s); using yfinance BTC-USD", exc)
            series, source = self.daily_bars("BTC-USD")["close"], "yfinance:BTC-USD"
        series = series[series.index < today].rename("BTC-USD")
        if series.empty:
            raise DataError("no complete UTC-day BTC-USD closes")
        self.sources["btc_daily_utc"] = source
        return series

    def _fetch_tbill(self) -> float:
        for source, fetch in (("fred:DTB3", self._fred_tbill), ("yfinance:^IRX", self._irx_tbill)):
            try:
                rate = fetch()
            except Exception as exc:  # noqa: BLE001 - fall through to the next source
                log.warning("T-bill source %s unavailable: %s", source, exc)
                continue
            self.sources["tbill_rate"] = source
            return rate
        try:
            rate = float(self._cfg.data["fallback_tbill_rate"])
        except (KeyError, TypeError, ValueError) as exc:
            raise DataError("no T-bill rate: FRED and ^IRX failed and data.fallback_tbill_rate is missing") from exc
        self.sources["tbill_rate"] = "config:fallback_tbill_rate"
        return rate

    def _fetch_option_chain(self, root: str) -> OptionChain:
        problems: list[str] = []
        for source, fetch in (("cboe", self._cboe_option_chain), ("yahoo", self._yahoo_option_chain)):
            try:
                chain = fetch(root)
            except Exception as exc:  # noqa: BLE001 - fall through to the next source
                log.warning("%s option chain for %s unavailable: %s", source, root, exc)
                problems.append(f"{source}: {exc}")
                continue
            self.sources[f"option_chain:{root}"] = chain.source
            return chain
        raise DataError(f"no option chain for {root} ({'; '.join(problems)})")

    def _cboe_option_chain(self, root: str) -> OptionChain:
        resp = self._get(CBOE_OPTIONS_URL.format(symbol=cboe_option_symbol(root)))
        raw = _response_bytes(resp)
        try:
            return parse_cboe_chain(json.loads(raw), root, raw_sha256=hashlib.sha256(raw).hexdigest())
        except ValueError as exc:   # invalid JSON, or a payload that is not a usable chain
            raise DataError(f"CBOE option chain for {root}: {exc}") from exc

    def _yahoo_option_chain(self, root: str) -> OptionChain:
        now = pd.Timestamp(self._clock())
        if now.tzinfo is None:
            now = now.tz_localize("UTC")
        if not _in_market_hours(now):
            raise DataError("Yahoo option quotes are used in market hours only (research/14 §6.7)")
        symbol = YAHOO_INDEX_OPTION_SYMBOLS.get(root, root)
        day = now.tz_convert(NY_TZ).tz_localize(None).normalize()
        listed = self._with_retries(lambda: list(self._yf_option_expiries(symbol)), bool,
                                    f"yfinance option expiries for {symbol}")
        wanted = [e for e in listed if 0 <= (pd.Timestamp(e) - day).days <= YAHOO_OPTION_MAX_DTE]
        frames: list[pd.DataFrame] = []
        spot = None
        for expiry in wanted:
            calls, puts, underlying = self._with_retries(
                lambda e=expiry: self._yf_option_frames(symbol, e), lambda r: r is not None,
                f"yfinance option chain for {symbol} {expiry}")
            frames += [calls, puts]
            spot = spot or _to_price((underlying or {}).get("regularMarketPrice"))
        if spot is None:
            spot = _to_price((_yahoo_meta(self._yf_quote_meta(symbol)) or {}).get("regularMarketPrice"))
        raw = pd.concat([f for f in frames if f is not None and len(f)], ignore_index=True) if frames else None
        if raw is None or raw.empty or spot is None:
            raise DataError(f"yfinance has no usable option chain for {symbol}")
        try:
            return parse_yahoo_chain(frames, root, spot, now.tz_convert(NY_TZ).strftime("%Y-%m-%dT%H:%M:%S"),
                                     raw_sha256=hashlib.sha256(raw.to_csv(index=False).encode()).hexdigest())
        except ValueError as exc:
            raise DataError(f"yfinance option chain for {symbol}: {exc}") from exc

    def _index_second_source(self, symbol: str, day: str) -> dict | None:
        """FRED's copy of the index series, then CBOE's delayed quote (INDEX_SECOND_SOURCES)."""
        spec = INDEX_SECOND_SOURCES[symbol]
        try:
            series = parse_fred_csv(self._get(FRED_CSV_URL, params={"id": spec["fred"]}).text, spec["fred"])
            ts = pd.Timestamp(day)
            if ts in series.index:
                return {"close": float(series.loc[ts]), "source": f"fred:{spec['fred']}"}
        except Exception as exc:  # noqa: BLE001 - fall through to CBOE
            log.warning("FRED %s unavailable for %s (%s)", spec["fred"], day, exc)
        try:
            close = parse_cboe_quote(self._get_json(CBOE_QUOTE_URL.format(name=spec["cboe"])), day)
        except Exception as exc:  # noqa: BLE001 - no second source
            log.warning("CBOE quote unavailable for %s (%s)", spec["cboe"], exc)
            return None
        return {"close": close, "source": "cboe-quote"} if close is not None else None

    def _fetch_second_source(self, symbol: str, day: str) -> dict | None:
        """Nasdaq, then Robinhood. Nasdaq, then Yahoo's quote, when the primary close came from Robinhood."""
        fallback: tuple[str, Callable[[str, str], float | None]] = (
            ("yahoo-quote", self._yahoo_quote_close) if (symbol, day) in self._robinhood_filled
            else ("robinhood", self._robinhood_close))
        for source, fetch in (("nasdaq", self._nasdaq_close), fallback):
            try:
                close = fetch(symbol, day)
            except Exception as exc:  # noqa: BLE001 - fall through to the next source
                log.warning("second source %s failed for %s on %s: %s", source, symbol, day, exc)
                continue
            if close is not None:
                return {"close": close, "source": source}
        return None

    # --- single sources --------------------------------------------------------------------------------

    def _yf_download(self, ticker: str) -> pd.DataFrame | None:
        """The raw yfinance call, with the arguments the brief specifies and our timeout."""
        import yfinance as yf  # lazy: offline tests and FakeProvider users never import it

        return yf.download(ticker, period="max", interval="1d", auto_adjust=False, progress=False,
                           threads=False, timeout=TIMEOUT_SECONDS)

    def _yf_flat(self, ticker: str) -> pd.DataFrame:
        """yfinance bars before rows without a close are dropped; retried until some bar has a close."""
        return self._with_retries(lambda: _flatten_yf_frame(self._yf_download(ticker), ticker),
                                  lambda frame: bool(frame["close"].notna().any()),
                                  f"yfinance daily bars for {ticker}")

    def _fill_open_last_bar(self, ticker: str, frame: pd.DataFrame) -> tuple[pd.DataFrame, bool]:
        """Fill a missing close on the newest bar from Robinhood. Returns (frame, filled).

        Live finding at 20:55 ET on 2026-09-28: yf.download returned the 09-28 bar of SPY, QQQ, IEF, IBIT and
        GLD with open, high, low and volume but no close. Dropping that row hid the session, and the open the
        fills need, from the 22:17 ET run. Integrator's rule:

        * only the last raw row, only when its close is NaN and its open is a valid price, and only when no
          other row for that date has a close;
        * only once the session is over: at or after 16:15 ET on that date, by self._clock;
        * never for index tickers ("^...").

        close and adj_close are both set to Robinhood's close for the date (`parse_robinhood_quote`).
        Adjustments only rescale older bars, so the newest bar's adj_close equals its close. The pair is
        remembered, so second_source_close never checks Robinhood against itself. When Robinhood has nothing,
        the frame comes back unchanged and the row is dropped as before.
        """
        symbol = ticker.strip().upper()
        if frame.empty or symbol.startswith("^"):
            return frame, False
        closes_that_day = frame.loc[frame.index == frame.index[-1], "close"]   # the last row included
        if closes_that_day.notna().any() or _to_price(frame["open"].iloc[-1]) is None:
            return frame, False
        day = frame.index[-1].strftime("%Y-%m-%d")
        if not _at_or_after_et(day, self._clock(), FILL_AFTER_ET):
            return frame, False
        try:
            close = self._robinhood_close(symbol, day)
        except Exception as exc:  # noqa: BLE001 - no fill: the row is dropped as before
            log.warning("no Robinhood close for %s on %s (%s); dropping yfinance's open bar", symbol, day, exc)
            return frame, False
        if close is None:
            return frame, False
        filled = frame.copy()
        filled.iloc[-1, [filled.columns.get_loc("close"), filled.columns.get_loc("adj_close")]] = close
        self._robinhood_filled.add((symbol, day))
        self._cache.pop(("second_source_close", symbol, day), None)   # never verify Robinhood against itself
        log.info("%s %s: yfinance has no close yet; using Robinhood's %.4f", symbol, day, close)
        return filled, True

    def _cboe_close(self, name: str) -> pd.Series:
        """CBOE's daily history CSV (the cdn.cboe.com URL redirects to cdn-api.cboe.com)."""
        return parse_cboe_csv(self._get(CBOE_CSV_URL.format(name=name)).text)

    def _coinbase_btc(self, today: pd.Timestamp) -> pd.Series:
        """Page backwards through daily candles, <= 300 per request, until >= 1,100 complete days.

        Paging stops early when a window is empty, which means it is before the product's first candle.
        """
        pages: list[pd.Series] = []
        end = today
        for _ in range(COINBASE_MAX_PAGES):
            start = end - pd.Timedelta(days=COINBASE_MAX_CANDLES - 1)
            rows = self._get_json(COINBASE_CANDLES_URL, params={
                "granularity": COINBASE_DAY_SECONDS, "start": _utc_iso(start), "end": _utc_iso(end)})
            page = parse_coinbase_candles(rows)
            if page.empty:
                break
            pages.append(page)
            combined = _finalise(pd.concat(pages))
            if int((combined.index < today).sum()) >= COINBASE_MIN_DAYS:
                return combined
            end = start - pd.Timedelta(days=1)
        if not pages:
            raise DataError("Coinbase returned no BTC-USD candles")
        return _finalise(pd.concat(pages))

    def _fred_tbill(self) -> float:
        text = self._get(FRED_CSV_URL, params={"id": FRED_TBILL_SERIES}).text
        return _plausible_rate(float(parse_fred_csv(text).iloc[-1]) / 100.0, "FRED DTB3")

    def _irx_tbill(self) -> float:
        close = self.daily_bars("^IRX")["close"]
        return _plausible_rate(float(close.iloc[-1]) / 100.0, "yfinance ^IRX")

    def _nasdaq_close(self, symbol: str, day: str) -> float | None:
        """Nasdaq's historical quote for `day`: assetclass=etf, then stocks when etf returns nothing.

        Nasdaq rejects fromdate == todate ("Provided date is less than from date", rCode 400; checked
        2026-09-29), so the query spans [day, day + 1] and the parser picks the row for `day`. A transport
        failure (DataError) propagates at once, without trying the second asset class.
        """
        next_day = iso_date(pd.Timestamp(day) + pd.Timedelta(days=1))
        url = NASDAQ_HISTORICAL_URL.format(ticker=quote(symbol, safe=""))
        for assetclass in ("etf", "stocks"):
            payload = self._get_json(url, headers=BROWSER_HEADERS, params={
                "assetclass": assetclass, "fromdate": day, "todate": next_day, "limit": 10})
            close = parse_nasdaq_historical(payload, day)
            if close is not None:
                return close
        return None

    def _robinhood_close(self, symbol: str, day: str) -> float | None:
        payload = self._get_json(ROBINHOOD_QUOTES_URL, params={"symbols": symbol})
        return parse_robinhood_quote(payload, day, now=self._clock())

    def _yahoo_quote_close(self, symbol: str, day: str) -> float | None:
        """Yahoo's regular-market price for `day` (`parse_yahoo_quote`): the chart API meta, else yfinance's copy.

        This is only the second source for a close daily_bars took from Robinhood. Yahoo's quote is
        independent of that close, while Yahoo's daily bar still lacks it. The chart API answers our
        descriptive UA. yfinance's fast_info has no regular-market time, so the date rule could not be
        checked; the fallback uses get_history_metadata() instead, which returns the same meta.
        """
        meta: Mapping | None = None
        try:
            meta = _yahoo_meta(self._get_json(YAHOO_CHART_URL.format(ticker=quote(symbol, safe="")),
                                              params={"range": "1d", "interval": "1d"}))
        except DataError as exc:
            log.warning("Yahoo chart API unavailable for %s (%s); trying yfinance", symbol, exc)
        if meta is None:
            meta = _yahoo_meta(self._with_retries(lambda: self._yf_quote_meta(symbol), bool,
                                                  f"yfinance quote for {symbol}"))
        return parse_yahoo_quote(meta, day)

    def _yf_quote_meta(self, symbol: str) -> Mapping | None:
        """yfinance's copy of the chart API meta (regularMarketPrice, regularMarketTime, ...)."""
        import yfinance as yf  # lazy, as in _yf_download

        return yf.Ticker(symbol).get_history_metadata()

    def _yf_option_expiries(self, symbol: str) -> Sequence[str]:
        """yfinance's listed option expiries ("YYYY-MM-DD") for `symbol` (e.g. "SPY", "^XSP")."""
        import yfinance as yf  # lazy, as in _yf_download

        return yf.Ticker(symbol).options

    def _yf_option_frames(self, symbol: str, expiry: str) -> tuple[pd.DataFrame, pd.DataFrame, Mapping | None]:
        """(calls, puts, underlying quote) from yfinance's `Ticker.option_chain(expiry)`."""
        import yfinance as yf  # lazy, as in _yf_download

        oc = yf.Ticker(symbol).option_chain(expiry)
        return oc.calls, oc.puts, getattr(oc, "underlying", None)

    # --- plumbing --------------------------------------------------------------------------------------

    def _with_retries(self, fetch: Callable[[], T], ok: Callable[[T], bool], what: str) -> T:
        """Call `fetch` until `ok(result)`, with the same retry schedule as _get; else raise DataError.

        Used for yfinance calls, which raise assorted errors or return empty results instead of HTTP errors.
        """
        attempts = len(BACKOFF_SECONDS) + 1
        problem = "no attempt made"
        for attempt in range(attempts):
            if attempt:
                self._sleep(BACKOFF_SECONDS[attempt - 1])
            try:
                value = fetch()
            except Exception as exc:  # noqa: BLE001 - yfinance raises assorted errors
                problem = f"{type(exc).__name__}: {exc}"
                continue
            if ok(value):
                return value
            problem = "empty result"
        raise DataError(f"{what}: nothing usable after {attempts} attempts ({problem})")

    def _get(self, url: str, *, params: Mapping[str, Any] | None = None,
             headers: Mapping[str, str] | None = None) -> requests.Response:
        """GET under the retry policy. Raises DataError when no 2xx/3xx answer arrives."""
        merged = {"User-Agent": self.user_agent, **(headers or {})}
        attempts = len(BACKOFF_SECONDS) + 1
        problem = "no attempt made"
        for attempt in range(attempts):
            if attempt:
                self._sleep(BACKOFF_SECONDS[attempt - 1])
            try:
                resp = self._session.get(url, params=params, headers=merged, timeout=TIMEOUT_SECONDS,
                                         allow_redirects=True)
            except requests.RequestException as exc:
                problem = f"{type(exc).__name__}: {exc}"
                continue
            status = int(resp.status_code)
            if status < 400:
                return resp
            problem = f"HTTP {status}"
            if status != 429 and status < 500:
                break  # a permanent client error: retrying will not help
        raise DataError(f"GET {url} failed ({problem})")

    def _get_json(self, url: str, *, params: Mapping[str, Any] | None = None,
                  headers: Mapping[str, str] | None = None) -> Any:
        resp = self._get(url, params=params, headers=headers)
        try:
            return resp.json()
        except ValueError as exc:
            raise DataError(f"GET {url} returned invalid JSON: {exc}") from exc

    def _memo(self, key: tuple[Any, ...], fetch: Callable[[], T]) -> T:
        if key not in self._cache:
            self._cache[key] = fetch()
        return _copy(self._cache[key])

    def _utc_today(self) -> pd.Timestamp:
        now = pd.Timestamp(self._clock())
        if now.tzinfo is None:
            now = now.tz_localize("UTC")
        return now.tz_convert("UTC").tz_localize(None).normalize()


# --------------------------------------------------------------------------------------------------------
# Fake provider for tests
# --------------------------------------------------------------------------------------------------------

def _as_session_indexed(obj: T) -> T:
    out = obj.copy()
    out.index = session_index(out.index)
    return out.sort_index()


class FakeProvider(DataProvider):
    """In-memory DataProvider for offline tests: no network, no clock.

    Build it from plain pandas objects::

        FakeProvider(
            bars={"SPY": spy, "^VIX": vix_bars},          # daily_bars(): contract price frames
            vix={"VIX": vix_close, "VIX3M": vix3m_close}, # vix(name); a bare Series means {"VIX": series}
            btc=btc_close,                                # btc_daily_utc()
            tbill_rate=0.04,                              # tbill_rate(); None makes it raise DataError
            second_source={("SPY", "2026-09-25"): 772.5}, # overrides for second_source_close()
            chains={"XSP": chain},                        # option_chain(); a list is served in order
        )

    * Getters return copies. Each index is made tz-naive and normalised, and sorted; the data is otherwise
      returned as given, so build frames with the contract columns (open, high, low, close, adj_close,
      volume).
    * option_chain(root) serves `chains[root]` ("SPXW" asks for "SPX"). A list gives the next item on each
      call and then repeats its last one. An Exception in the list is raised, to simulate a failed source.
      A root with no chain raises DataError. `chain_calls` lists the roots asked for, in order.
    * A missing ticker, VIX name or BTC series raises DataError, as LiveProvider does when every source
      fails.
    * second_source_close(ticker, date):
      - an override wins: a number gives {"close": value, "source": second_source_name}, and None means no
        second source;
      - otherwise index tickers ("^...") get None, as with LiveProvider;
      - any other ticker echoes its `bars` close on that date, so verify_close passes by default; with no
        such close it gets None.
    * ``sources`` records "fake" per call, mirroring LiveProvider.sources.
    """

    def __init__(self, bars: Mapping[str, pd.DataFrame] | None = None,
                 vix: Mapping[str, pd.Series] | pd.Series | None = None,
                 btc: pd.Series | None = None,
                 tbill_rate: float | None = 0.04,
                 second_source: Mapping[tuple[str, str], float | None] | None = None,
                 second_source_name: str = "nasdaq",
                 chains: Mapping[str, OptionChain | Exception | Sequence[OptionChain | Exception]] | None = None,
                 ) -> None:
        self._bars = {str(t): _as_session_indexed(frame) for t, frame in (bars or {}).items()}
        vix_map = {"VIX": vix} if isinstance(vix, pd.Series) else dict(vix or {})
        self._vix = {str(n).strip().upper().lstrip("^"): _as_session_indexed(s) for n, s in vix_map.items()}
        self._btc = None if btc is None else _as_session_indexed(btc)
        self._tbill_rate = None if tbill_rate is None else float(tbill_rate)
        self._second = {(str(t), iso_date(d)): v for (t, d), v in (second_source or {}).items()}
        self._second_name = second_source_name
        self._chains: dict[str, list[OptionChain | Exception]] = {
            chain_root(root): list(v) if isinstance(v, (list, tuple)) else [v] for root, v in (chains or {}).items()}
        self.chain_calls: list[str] = []
        self.sources: dict[str, str] = {}

    def daily_bars(self, ticker: str) -> pd.DataFrame:
        if ticker not in self._bars:
            raise DataError(f"FakeProvider has no bars for {ticker}")
        self.sources[f"daily_bars:{ticker}"] = "fake"
        return self._bars[ticker].copy()

    def vix(self, name: str = "VIX") -> pd.Series:
        key = name.strip().upper().lstrip("^")
        if key not in self._vix:
            raise DataError(f"FakeProvider has no {key} series")
        self.sources[f"vix:{key}"] = "fake"
        return self._vix[key].copy()

    def btc_daily_utc(self) -> pd.Series:
        if self._btc is None:
            raise DataError("FakeProvider has no BTC series")
        self.sources["btc_daily_utc"] = "fake"
        return self._btc.copy()

    def tbill_rate(self) -> float:
        if self._tbill_rate is None:
            raise DataError("FakeProvider has no T-bill rate")
        self.sources["tbill_rate"] = "fake"
        return self._tbill_rate

    def second_source_close(self, ticker: str, date: str) -> dict | None:
        day = iso_date(date)
        if (ticker, day) in self._second:
            value = self._second[(ticker, day)]
            return None if value is None else {"close": float(value), "source": self._second_name}
        frame = self._bars.get(ticker)
        if ticker.startswith("^") or frame is None or "close" not in frame.columns:
            return None
        closes = frame["close"][frame.index == pd.Timestamp(day)].dropna()
        if closes.empty:
            return None
        return {"close": float(closes.iloc[-1]), "source": self._second_name}

    def option_chain(self, underlying: str) -> OptionChain:
        root = chain_root(underlying)
        self.chain_calls.append(root)
        served = self._chains.get(root)
        if not served:
            raise DataError(f"FakeProvider has no option chain for {root}")
        item = served.pop(0) if len(served) > 1 else served[0]
        if isinstance(item, Exception):
            raise item
        self.sources[f"option_chain:{root}"] = "fake"
        return dataclasses.replace(item, frame=item.frame.copy())
