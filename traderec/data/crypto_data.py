"""Crypto market data for the M6 and ETH shadow books (design v3.3 §3 M6, §10 "hourly, 24/7"; docs/phase-b/crypto.md).

These are network adapters, like `providers.py`, and the only crypto code that touches the network. The rules in
`traderec.modules.crypto_shadows` take what these return.

Sources (public endpoints, no API key; checked 29 Sep 2026):

* stablecoin books ........ best bid and ask per venue: Coinbase Exchange `/products/{id}/ticker`, Kraken
                            `/0/public/Ticker` (all pairs in one request) and Gemini `/v1/pubticker/{symbol}`.
                            Coinbase has no USDC-USD book (USDC converts 1:1 there), so a Coinbase symbol may be
                            a cross, "USDT-USD/USDT-USDC": USDC's USD book implied by two books on one venue;
* ETH-USD per UTC day ..... Coinbase Exchange daily candles, falling back to yfinance ETH-USD (as `btc_daily_utc`);
* CME Bitcoin futures ..... Yahoo's chart API for explicit months ("BTCX26.CME", then the micro "MBTX26.CME").
                            The continuous "BTC=F" counts only when its name states the same month. No explicit
                            month means no quote, and the rule fails closed;
* BTC-USD at a given time . Coinbase Exchange one-minute candles, to pair with a futures quote's timestamp.

`crypto_source(provider)` picks the adapter for a data provider, in this order:
1. an injected `provider.crypto` (tests use `FakeCryptoData`);
2. a provider that implements these methods itself;
3. `LiveCryptoData` around a `LiveProvider`.
Any other provider has no crypto feeds (None).
"""
from __future__ import annotations

import copy
import logging
import math
import numbers
import re
import time
from collections.abc import Callable, Mapping
from typing import Any, Protocol, runtime_checkable
from urllib.parse import quote as urlquote

import pandas as pd
import requests

from traderec.data.providers import (
    COINBASE_DAY_SECONDS,
    USER_AGENT,
    YAHOO_CHART_URL,
    DataError,
    LiveProvider,
    parse_coinbase_candles,
)

__all__ = [
    "CRYPTO_METHODS",
    "CryptoSource",
    "FakeCryptoData",
    "LiveCryptoData",
    "VENUES",
    "cme_btc_tickers",
    "crypto_source",
    "cross_quote",
    "parse_candle_close_at",
    "parse_coinbase_ticker",
    "parse_gemini_ticker",
    "parse_kraken_ticker",
    "parse_yahoo_future",
]

log = logging.getLogger(__name__)

VENUES = ("coinbase", "kraken", "gemini")
COINBASE_TICKER_URL = "https://api.exchange.coinbase.com/products/{product}/ticker"
COINBASE_PRODUCT_CANDLES_URL = "https://api.exchange.coinbase.com/products/{product}/candles"
KRAKEN_TICKER_URL = "https://api.kraken.com/0/public/Ticker"
GEMINI_TICKER_URL = "https://api.gemini.com/v1/pubticker/{symbol}"

# The hourly job must stay cheap even when a venue is down: short timeouts and one retry.
TIMEOUT_SECONDS = 10.0
BACKOFF_SECONDS: tuple[float, ...] = (2.0,)
ETH_DAYS = 300                   # one page of daily candles; ten weekly closes need about 70 days
CME_MONTH_CODES = "FGHJKMNQUVXZ"
MONTH_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_NAME_MONTH = re.compile(r"([A-Z][a-z]{2})-(\d{4})\s*$")        # "Bitcoin Futures,Nov-2026"
CRYPTO_METHODS = ("stablecoin_quotes", "eth_daily_utc", "btc_future_quote", "btc_spot_at")


@runtime_checkable
class CryptoSource(Protocol):
    """What the crypto shadow books read (docs/phase-b/crypto.md)."""

    sources: dict[str, str]

    def stablecoin_quotes(self, markets: Mapping[str, Mapping[str, str]]) -> dict:
        """{"quotes": {coin: {venue: {"bid", "ask", "last", "time", "symbol"} | None}}, "errors": {...}}."""
        ...

    def eth_daily_utc(self) -> pd.Series:
        """ETH-USD close per complete UTC day (index = UTC candle start date, tz-naive)."""
        ...

    def btc_future_quote(self, year: int, month: int) -> dict | None:
        """{"ticker", "price", "time", "month", "name"} for the CME Bitcoin future of that month, or None."""
        ...

    def btc_spot_at(self, when: Any) -> float | None:
        """BTC-USD at `when` (UTC), or None."""
        ...


# --------------------------------------------------------------------------------------------------------
# Pure payload parsers (no network, no clock)
# --------------------------------------------------------------------------------------------------------

def _num(value: Any) -> float | None:
    """A finite, positive float from a number or numeric string, else None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) and x > 0 else None


def _first(value: Any) -> float | None:
    """The first element of a Kraken [price, volume, ...] list, as a price."""
    if isinstance(value, (list, tuple)) and value:
        return _num(value[0])
    return None


def _utc(when: Any) -> pd.Timestamp:
    ts = pd.Timestamp(when)
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")


def _utc_z(when: Any) -> str:
    return _utc(when).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_coinbase_ticker(payload: Any) -> dict | None:
    """Coinbase Exchange `/products/{id}/ticker` -> {"bid", "ask", "last", "time"}, or None.

    Errors come back as {"message": "NotFound"} (or "Not allowed for delisted products"): None. `time` is the last
    trade's time; the bid and ask are the live book.
    """
    if not isinstance(payload, Mapping) or "message" in payload:
        return None
    bid, ask = _num(payload.get("bid")), _num(payload.get("ask"))
    if bid is None and ask is None:
        return None
    return {"bid": bid, "ask": ask, "last": _num(payload.get("price")), "time": payload.get("time")}


def parse_kraken_ticker(payload: Any, pair: str) -> dict | None:
    """Kraken `/0/public/Ticker` -> {"bid", "ask", "last", "time": None} for `pair`, or None.

    Kraken keys its result by its own pair name, which can differ from an altname in the query ("USDTUSD" comes back
    as "USDTZUSD"). So the config uses the result key, and a one-pair answer is read whatever its key. `a`, `b`
    and `c` are [price, ...] lists. The ticker carries no timestamp: it is the live book.
    """
    result = payload.get("result") if isinstance(payload, Mapping) else None
    if not isinstance(result, Mapping) or not result:
        return None
    row = result.get(pair)
    if row is None and len(result) == 1:
        row = next(iter(result.values()))
    if not isinstance(row, Mapping):
        return None
    bid, ask = _first(row.get("b")), _first(row.get("a"))
    if bid is None and ask is None:
        return None
    return {"bid": bid, "ask": ask, "last": _first(row.get("c")), "time": None}


def parse_gemini_ticker(payload: Any) -> dict | None:
    """Gemini `/v1/pubticker/{symbol}` -> {"bid", "ask", "last", "time"}, or None.

    `time` comes from volume.timestamp (epoch milliseconds). Gemini answers an unknown symbol with text such as
    "'pyusdusd' does not have available data yet", which is no quote.
    """
    if not isinstance(payload, Mapping):
        return None
    bid, ask = _num(payload.get("bid")), _num(payload.get("ask"))
    if bid is None and ask is None:
        return None
    stamp = (payload.get("volume") or {}).get("timestamp") if isinstance(payload.get("volume"), Mapping) else None
    when = None
    if isinstance(stamp, numbers.Real) and not isinstance(stamp, bool):
        when = _utc_z(pd.Timestamp(float(stamp), unit="ms", tz="UTC"))
    return {"bid": bid, "ask": ask, "last": _num(payload.get("last")), "time": when}


def cross_quote(num: Mapping[str, Any] | None, den: Mapping[str, Any] | None) -> dict | None:
    """The USD book of X implied by two books on one venue: A-USD (`num`) and A-X (`den`).

    Coinbase has no USDC-USD book, but it has USDT-USD and USDT-USDC. Selling 1 USDC buys 1 / den.ask USDT, which
    sells for num.bid dollars. So bid = num.bid / den.ask and ask = num.ask / den.bid. Both legs are live on the
    same venue, so this is a price a Coinbase customer could trade at.
    """
    if not num or not den:
        return None
    nb, na, db, da = (_num(num.get("bid")), _num(num.get("ask")), _num(den.get("bid")), _num(den.get("ask")))
    if nb is None or na is None or db is None or da is None:
        return None
    nl, dl = _num(num.get("last")), _num(den.get("last"))
    return {"bid": nb / da, "ask": na / db, "last": nl / dl if nl and dl else None,
            "time": num.get("time") or den.get("time")}


def parse_yahoo_future(payload: Any) -> dict | None:
    """Yahoo chart API meta for a futures ticker -> {"symbol", "price", "time", "month", "name"}, or None.

    price = regularMarketPrice (the last trade). time = regularMarketTime as a UTC ISO string. month = "YYYY-MM",
    read from the contract's name ("Bitcoin Futures,Nov-2026"), or None when the name states no month.
    """
    try:
        meta = payload["chart"]["result"][0]["meta"]
    except (KeyError, IndexError, TypeError):
        return None
    if not isinstance(meta, Mapping):
        return None
    price, stamp = _num(meta.get("regularMarketPrice")), meta.get("regularMarketTime")
    if price is None or not isinstance(stamp, numbers.Real) or isinstance(stamp, bool):
        return None
    name = str(meta.get("longName") or meta.get("shortName") or "").strip()
    found = _NAME_MONTH.search(name)
    month = None
    if found and found.group(1) in MONTH_ABBR:
        month = f"{int(found.group(2)):04d}-{MONTH_ABBR.index(found.group(1)) + 1:02d}"
    return {"symbol": meta.get("symbol"), "price": price,
            "time": _utc_z(pd.Timestamp(float(stamp), unit="s", tz="UTC")), "month": month, "name": name or None}


def parse_candle_close_at(rows: Any, when: Any, max_gap_seconds: int = 300) -> float | None:
    """The close of the one-minute Coinbase candle that contains `when`, or None.

    Rows are [start, low, high, open, close, volume]. With no trade in that minute there is no candle, so the latest
    candle that started within `max_gap_seconds` before `when` is used instead.
    """
    if not isinstance(rows, list):
        return None
    t = _utc(when).timestamp()
    best: tuple[float, float] | None = None
    for row in rows:
        try:
            start, close = float(row[0]), float(row[4])
        except (TypeError, ValueError, IndexError):
            continue
        if not math.isfinite(close) or close <= 0:
            continue
        if start <= t < start + 60:
            return close
        if start <= t <= start + max_gap_seconds and (best is None or start > best[0]):
            best = (start, close)
    return best[1] if best else None


def cme_btc_tickers(year: int, month: int) -> list[str]:
    """Yahoo's explicit-month tickers for the CME Bitcoin future: ["BTCX26.CME", "MBTX26.CME"] for Nov 2026."""
    code = f"{CME_MONTH_CODES[month - 1]}{year % 100:02d}"
    return [f"BTC{code}.CME", f"MBT{code}.CME"]


# --------------------------------------------------------------------------------------------------------
# Live adapter
# --------------------------------------------------------------------------------------------------------

class LiveCryptoData:
    """Network-backed crypto data (public endpoints, no API key).

    * HTTP: every GET has a 10 s timeout. It gets one retry 2 s later on a connection error, timeout, invalid JSON,
      HTTP 429 or 5xx. Other 4xx answers fail at once. The hourly job stays short even when a venue is down.
    * One venue failing never loses the others: `stablecoin_quotes` reports it under "errors".
    * `sources` records what served each item ("coinbase", "kraken", "gemini", "yahoo:BTCX26.CME", ...).
    * `provider` (a LiveProvider) is only used for the yfinance ETH-USD fallback. `session`, `sleep` and `clock`
      are test seams; `clock` returns the current time, tz-aware.
    """

    def __init__(self, provider: Any = None, *, session: Any = None, sleep: Callable[[float], None] = time.sleep,
                 clock: Callable[[], pd.Timestamp] | None = None, user_agent: str = USER_AGENT,
                 timeout: float = TIMEOUT_SECONDS, backoff: tuple[float, ...] = BACKOFF_SECONDS) -> None:
        self._provider = provider
        self._session = session if session is not None else requests.Session()
        self._sleep = sleep
        self._clock = clock or (lambda: pd.Timestamp.now(tz="UTC"))
        self.user_agent = user_agent
        self.timeout = float(timeout)
        self.backoff = tuple(backoff)
        self.sources: dict[str, str] = {}

    def now(self) -> pd.Timestamp:
        return _utc(self._clock())

    # --- stablecoin books ------------------------------------------------------------------------------

    def stablecoin_quotes(self, markets: Mapping[str, Mapping[str, str]]) -> dict:
        """Best bid and ask for each coin on each venue.

        `markets` is {coin: {venue: symbol}}. A Coinbase symbol may be a cross "A-USD/A-X" (see `cross_quote`).
        Requests: one per Coinbase product (a product shared by two coins is fetched once), one for all Kraken
        pairs, and one per Gemini symbol. Returns {"quotes": {coin: {venue: quote | None}}, "errors": {"venue:symbol":
        reason}, "fetched_at": ISO}. Each quote is {"bid", "ask", "last", "time", "symbol"}.
        """
        errors: dict[str, str] = {}
        coinbase: dict[str, dict | None] = {}

        def coinbase_book(product: str) -> dict | None:
            if product not in coinbase:
                try:
                    url = COINBASE_TICKER_URL.format(product=urlquote(product, safe=""))
                    coinbase[product] = parse_coinbase_ticker(self._get_json(url))
                    if coinbase[product] is None:
                        errors[f"coinbase:{product}"] = "no book"
                except DataError as exc:
                    coinbase[product] = None
                    errors[f"coinbase:{product}"] = str(exc)
            return coinbase[product]

        pairs = sorted({str(v["kraken"]) for v in markets.values() if v and v.get("kraken")})
        kraken = self._kraken(pairs, errors) if pairs else {}
        quotes: dict[str, dict[str, dict | None]] = {}
        for coin, venues in markets.items():
            quotes[str(coin)] = {}
            for venue, symbol in (venues or {}).items():
                symbol = str(symbol)
                if venue == "coinbase" and "/" in symbol:
                    num, den = (part.strip() for part in symbol.split("/", 1))
                    q = cross_quote(coinbase_book(num), coinbase_book(den))
                elif venue == "coinbase":
                    q = coinbase_book(symbol)
                elif venue == "kraken":
                    q = kraken.get(symbol)
                elif venue == "gemini":
                    q = self._gemini(symbol, errors)
                else:
                    errors[f"{venue}:{symbol}"] = "unknown venue"
                    q = None
                if q is not None:
                    q = {**q, "symbol": symbol}
                    self.sources[f"stablecoins:{venue}"] = venue
                quotes[str(coin)][str(venue)] = q
        return {"quotes": quotes, "errors": errors, "fetched_at": _utc_z(self.now())}

    def _kraken(self, pairs: list[str], errors: dict[str, str]) -> dict[str, dict]:
        """One Ticker request for every pair.

        Kraken rejects a whole batch when one pair is unknown ("EQuery:Unknown asset pair"). A rejected batch is
        therefore retried pair by pair, and so is a pair missing from a good batch (its result key may differ).
        """
        try:
            payload = self._get_json(KRAKEN_TICKER_URL, params={"pair": ",".join(pairs)})
        except DataError as exc:
            for p in pairs:
                errors[f"kraken:{p}"] = str(exc)
            return {}
        out: dict[str, dict] = {}
        if len(pairs) == 1:
            q = parse_kraken_ticker(payload, pairs[0])
            if q is None:
                errors[f"kraken:{pairs[0]}"] = "; ".join(map(str, (payload or {}).get("error") or [])) or "no book"
            else:
                out[pairs[0]] = q
            return out
        missing = []
        for p in pairs:
            q = _kraken_exact(payload, p)
            if q is None:
                missing.append(p)
            else:
                out[p] = q
        for p in missing:
            out.update(self._kraken([p], errors))
        return out

    def _gemini(self, symbol: str, errors: dict[str, str]) -> dict | None:
        try:
            q = parse_gemini_ticker(self._get_json(GEMINI_TICKER_URL.format(symbol=urlquote(symbol.lower(), safe=""))))
        except DataError as exc:
            errors[f"gemini:{symbol}"] = str(exc)
            return None
        if q is None:
            errors[f"gemini:{symbol}"] = "no book"
        return q

    # --- ETH-USD ---------------------------------------------------------------------------------------

    def eth_daily_utc(self) -> pd.Series:
        """ETH-USD close per complete UTC day: Coinbase daily candles (the last 300 days), then yfinance ETH-USD.

        The index is the UTC candle start date (tz-naive). Today's candle is still trading and is dropped. Raises
        DataError when both sources fail.
        """
        today = self.now().tz_localize(None).normalize()
        try:
            start = today - pd.Timedelta(days=ETH_DAYS - 1)
            rows = self._get_json(COINBASE_PRODUCT_CANDLES_URL.format(product="ETH-USD"), params={
                "granularity": COINBASE_DAY_SECONDS, "start": _utc_z(start), "end": _utc_z(today)})
            series, source = parse_coinbase_candles(rows).rename("ETH-USD"), "coinbase"
            if series.empty:
                raise DataError("Coinbase returned no ETH-USD candles")
        except (DataError, ValueError) as exc:
            if self._provider is None or not hasattr(self._provider, "daily_bars"):
                raise DataError(f"ETH-USD candles unavailable ({exc})") from exc
            log.warning("Coinbase ETH-USD candles unavailable (%s); using yfinance ETH-USD", exc)
            series, source = self._provider.daily_bars("ETH-USD")["close"].rename("ETH-USD"), "yfinance:ETH-USD"
        series = series[series.index < today]
        if series.empty:
            raise DataError("no complete UTC-day ETH-USD closes")
        self.sources["eth_daily_utc"] = source
        return series

    # --- CME Bitcoin futures and the spot to pair them with --------------------------------------------

    def btc_future_quote(self, year: int, month: int) -> dict | None:
        """The last trade of the CME Bitcoin future for (year, month), from Yahoo's chart API.

        Tries the explicit month ("BTCX26.CME", then the micro "MBTX26.CME"), then the continuous "BTC=F" only when
        its name states the same month: a continuous series is never read across a roll. An explicit ticker whose
        name states another month is rejected too. Returns {"ticker", "symbol", "price", "time", "month", "name"},
        or None when no explicit month is available (the caller fails closed).
        """
        want = f"{int(year):04d}-{int(month):02d}"
        for ticker in (*cme_btc_tickers(int(year), int(month)), "BTC=F"):
            try:
                q = parse_yahoo_future(self._get_json(YAHOO_CHART_URL.format(ticker=urlquote(ticker, safe="")),
                                                      params={"range": "1d", "interval": "1d"}))
            except DataError as exc:
                log.warning("Yahoo quote for %s unavailable (%s)", ticker, exc)
                continue
            if q is None or (q["month"] != want and (ticker == "BTC=F" or q["month"] is not None)):
                continue
            self.sources[f"btc_future:{want}"] = f"yahoo:{ticker}"
            return {**q, "ticker": ticker}
        return None

    def btc_spot_at(self, when: Any) -> float | None:
        """BTC-USD at `when`: the close of Coinbase's one-minute candle containing it (`parse_candle_close_at`)."""
        t = _utc(when)
        start, end = t.floor("min") - pd.Timedelta(minutes=5), t.floor("min") + pd.Timedelta(minutes=1)
        rows = self._get_json(COINBASE_PRODUCT_CANDLES_URL.format(product="BTC-USD"),
                              params={"granularity": 60, "start": _utc_z(start), "end": _utc_z(end)})
        price = parse_candle_close_at(rows, t)
        if price is not None:
            self.sources["btc_spot"] = "coinbase"
        return price

    # --- plumbing --------------------------------------------------------------------------------------

    def _get_json(self, url: str, *, params: Mapping[str, Any] | None = None) -> Any:
        """GET under the retry policy above. Raises DataError when no usable JSON answer arrives."""
        headers = {"User-Agent": self.user_agent, "Accept": "application/json"}
        problem = "no attempt made"
        for attempt in range(len(self.backoff) + 1):
            if attempt:
                self._sleep(self.backoff[attempt - 1])
            try:
                resp = self._session.get(url, params=params, headers=headers, timeout=self.timeout)
            except requests.RequestException as exc:
                problem = type(exc).__name__
                continue
            status = int(resp.status_code)
            if status >= 400:
                problem = f"HTTP {status}"
                if status == 429 or status >= 500:
                    continue
                break                                   # a permanent client error: retrying will not help
            try:
                return resp.json()
            except ValueError:
                problem = "invalid JSON"
        raise DataError(f"GET {url} failed ({problem})")


def _kraken_exact(payload: Any, pair: str) -> dict | None:
    """A batch answer is read by exact key only, so one pair never takes another's row."""
    result = payload.get("result") if isinstance(payload, Mapping) else None
    if not isinstance(result, Mapping) or pair not in result:
        return None
    return parse_kraken_ticker({"result": {pair: result[pair]}}, pair)


# --------------------------------------------------------------------------------------------------------
# Fake adapter for tests, and the adapter lookup
# --------------------------------------------------------------------------------------------------------

class FakeCryptoData:
    """In-memory crypto data for offline tests: no network, no clock.

        FakeCryptoData(
            quotes={"USDC": {"kraken": {"bid": 0.95, "ask": 0.951}, "gemini": None}},   # stablecoin_quotes()
            eth=eth_close,                                   # eth_daily_utc(); None raises DataError
            futures={(2026, 11): {"ticker": "BTCX26.CME", "price": 83730.0,
                                  "time": "2026-09-29T01:09:57Z", "month": "2026-11"}},   # missing -> None
            spot=82997.79,                                   # btc_spot_at(): a number, a callable(when) or None
            down={"gemini"},                                 # venues that fail: None quotes and an error each
        )

    Change the attributes between calls to move the market. Attach it to any provider as `provider.crypto`.
    """

    def __init__(self, *, quotes: Mapping[str, Mapping[str, Any]] | None = None, eth: pd.Series | None = None,
                 futures: Mapping[tuple[int, int], Mapping[str, Any]] | None = None, spot: Any = None,
                 down: Any = ()) -> None:
        self.quotes = {str(c): dict(v) for c, v in (quotes or {}).items()}
        self.eth = eth
        self.futures = dict(futures or {})
        self.spot = spot
        self.down = set(down)
        self.sources: dict[str, str] = {}
        self.calls: list[str] = []

    def stablecoin_quotes(self, markets: Mapping[str, Mapping[str, str]]) -> dict:
        self.calls.append("stablecoin_quotes")
        quotes: dict[str, dict[str, dict | None]] = {}
        errors: dict[str, str] = {}
        for coin, venues in markets.items():
            quotes[str(coin)] = {}
            for venue, symbol in (venues or {}).items():
                q = None if venue in self.down else (self.quotes.get(str(coin)) or {}).get(venue)
                if q is None:
                    errors[f"{venue}:{symbol}"] = "down" if venue in self.down else "no book"
                else:
                    q = {**copy.deepcopy(dict(q)), "symbol": str(symbol)}
                    self.sources[f"stablecoins:{venue}"] = "fake"
                quotes[str(coin)][str(venue)] = q
        return {"quotes": quotes, "errors": errors, "fetched_at": None}

    def eth_daily_utc(self) -> pd.Series:
        self.calls.append("eth_daily_utc")
        if self.eth is None:
            raise DataError("FakeCryptoData has no ETH-USD series")
        self.sources["eth_daily_utc"] = "fake"
        return self.eth.copy()

    def btc_future_quote(self, year: int, month: int) -> dict | None:
        self.calls.append(f"btc_future_quote:{int(year):04d}-{int(month):02d}")
        q = self.futures.get((int(year), int(month)))
        if q is None:
            return None
        self.sources[f"btc_future:{int(year):04d}-{int(month):02d}"] = "fake"
        return dict(q)

    def btc_spot_at(self, when: Any) -> float | None:
        self.calls.append("btc_spot_at")
        if callable(self.spot):
            return self.spot(when)
        return None if self.spot is None else float(self.spot)


def crypto_source(provider: Any) -> Any:
    """The crypto adapter for a data provider, or None when it has no crypto feeds.

    In order: an injected `provider.crypto`; the provider itself when it implements CRYPTO_METHODS; LiveCryptoData
    around a LiveProvider (sharing its HTTP session, clock and User-Agent).
    """
    injected = getattr(provider, "crypto", None)
    if injected is not None:
        return injected
    if all(callable(getattr(provider, m, None)) for m in CRYPTO_METHODS):
        return provider
    if isinstance(provider, LiveProvider):
        return LiveCryptoData(provider, session=getattr(provider, "_session", None),
                              sleep=getattr(provider, "_sleep", time.sleep), clock=getattr(provider, "_clock", None),
                              user_agent=getattr(provider, "user_agent", USER_AGENT))
    return None
