"""Tests for the crypto shadow books: M6 depeg buy and cash-and-carry, the ETH switch, and the hourly 24/7 job.

Offline. The payload fixtures are trimmed from real responses captured on 2026-09-29 (Coinbase Exchange, Kraken,
Gemini and Yahoo's chart API), and every HTTP call goes to a fake session. Runs use the real Run transaction on a
temporary state directory.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd
import pytest
import yaml

from traderec import cli, pipeline
from traderec.config import Config, load_config
from traderec.data import DataError, FakeProvider, LiveProvider
from traderec.data.crypto_data import (
    COINBASE_PRODUCT_CANDLES_URL,
    COINBASE_TICKER_URL,
    GEMINI_TICKER_URL,
    KRAKEN_TICKER_URL,
    CryptoSource,
    FakeCryptoData,
    LiveCryptoData,
    cme_btc_tickers,
    cross_quote,
    crypto_source,
    parse_candle_close_at,
    parse_coinbase_ticker,
    parse_gemini_ticker,
    parse_kraken_ticker,
    parse_yahoo_future,
)
from traderec.data.providers import YAHOO_CHART_URL
from traderec.ledger import Ledger
from traderec.modules import crypto_shadows as rules
from traderec.runners import crypto

REPO = Path(__file__).resolve().parent.parent

# --- payload fixtures (trimmed from real responses, 2026-09-29) -------------------------------------------------

CB_USDT_USD = {"ask": "0.99953", "bid": "0.99952", "volume": "100629688.25", "trade_id": 148641309,
               "price": "0.99953", "size": "1000", "time": "2026-09-29T02:56:14.279169183Z"}
CB_USDT_USDC = {"ask": "0.9996", "bid": "0.9995", "volume": "18838672.16", "trade_id": 13652480, "price": "0.9995",
                "size": "680.22", "time": "2026-09-29T02:51:38.746468018Z"}
CB_PAX_USD = {"ask": "0.9994", "bid": "0.9867", "volume": "70280.28", "trade_id": 305734, "price": "0.9867",
              "size": "1.9", "time": "2026-09-29T02:30:59.216736787Z"}
CB_NOT_FOUND = {"message": "NotFound"}
CB_DELISTED = {"message": "Not allowed for delisted products"}
KRAKEN = {"error": [], "result": {
    "PYUSDUSD": {"a": ["1.00010000", "430", "430.000"], "b": ["0.99990000", "9969", "9969.000"],
                 "c": ["0.99990000", "13.00000"], "o": "1.00000000"},
    "RLUSDUSD": {"a": ["1.000000000", "320000", "320000.000"], "b": ["0.999950000", "320000", "320000.000"],
                 "c": ["0.999950000", "3.32307"], "o": "0.999950000"},
    "USDCUSD": {"a": ["1.00000000", "592528", "592528.000"], "b": ["0.99990000", "5527565", "5527565.000"],
                "c": ["0.99990000", "1150.90395289"], "o": "0.99990000"},
    "USDTZUSD": {"a": ["0.99950000", "1286631", "1286631.000"], "b": ["0.99949000", "249475", "249475.000"],
                 "c": ["0.99950000", "236.25450180"], "o": "0.99950000"},
}}
KRAKEN_UNKNOWN = {"error": ["EQuery:Unknown asset pair"]}
GEMINI_USDC = {"bid": "0.99991", "ask": "0.99992", "last": "0.99992",
               "volume": {"USD": "4239234.32422979128", "USDC": "4239573.490109", "timestamp": 1790651220000}}
GEMINI_RLUSD = {"bid": "0.9998", "ask": "1.0000", "last": "0.9998",
                "volume": {"RLUSD": "17859.648044", "USD": "17856.0761143912", "timestamp": 1790651220000}}
GEMINI_USDT = {"bid": "0.99936", "ask": "0.99937", "last": "0.99936",
               "volume": {"USD": "4040074.97719712352", "USDT": "4042662.281057", "timestamp": 1790651220000}}
GEMINI_USDG_EMPTY = {"bid": "0.00000500", "ask": "0.99000000", "last": "0.98292300",
                     "volume": {"USD": "0", "USDG": "0", "timestamp": 1790650980000}}
GEMINI_UNKNOWN = "'pyusdusd' does not have available data yet"


def yahoo(symbol: str, price: float, stamp: int, name: str | None) -> dict:
    meta = {"currency": "USD", "symbol": symbol, "exchangeName": "CME", "instrumentType": "FUTURE",
            "regularMarketTime": stamp, "regularMarketPrice": price, "shortName": name, "longName": name,
            "exchangeTimezoneName": "America/New_York"}
    return {"chart": {"result": [{"meta": meta}], "error": None}}


YAHOO_BTCX26 = yahoo("BTCX26.CME", 83730.0, 1790644197, "Bitcoin Futures,Nov-2026")    # 2026-09-29 01:09:57Z
YAHOO_BTC_F = yahoo("BTC=F", 83445.0, 1790650089, "Bitcoin Futures,Oct-2026")
YAHOO_NOT_FOUND = {"chart": {"result": None, "error": {"code": "Not Found",
                                                       "description": "No data found, symbol may be delisted"}}}
# [start, low, high, open, close, volume], newest first, around the BTCX26 quote above
CB_BTC_MINUTES = [[1790644200, 82979.15, 83025.95, 83006.03, 82993.96, 7.28640683],
                  [1790644140, 82987.04, 83022.67, 83004.01, 82997.79, 9.09061065],
                  [1790644080, 83004.01, 83059.33, 83040.81, 83004.01, 3.503882],
                  [1790644020, 83022, 83098.82, 83081.83, 83040.81, 4.92175104]]
CB_ETH_DAYS = [[1790640000, 2650.54, 2694.36, 2687.44, 2658.65, 14791.09315337],   # 29 Sep (still trading)
               [1790553600, 2634.38, 2720, 2688.23, 2687.41, 97173.06220934],     # 28 Sep
               [1790467200, 2669.01, 2723.29, 2695.53, 2688.23, 47319.86560281],  # 27 Sep (Sunday)
               [1790380800, 2663.54, 2697.41, 2691.24, 2695.53, 28518.33327125]]  # 26 Sep
NOW = pd.Timestamp("2026-09-29 03:00", tz="UTC")                                # 23:00 ET on Mon 28 Sep


# --- fakes and builders ---------------------------------------------------------------------------------------

class FakeResponse:
    def __init__(self, payload: Any = None, status_code: int = 200, text: str | None = None) -> None:
        self.status_code = status_code
        self.text = json.dumps(payload) if text is None else text

    def json(self) -> Any:
        return json.loads(self.text)


class FakeSession:
    """Answers each GET with route(url, params): a FakeResponse, or an exception to raise."""

    def __init__(self, route: Callable[[str, dict], Any]) -> None:
        self.route = route
        self.calls: list[tuple[str, dict]] = []

    def get(self, url: str, params: Any = None, headers: Any = None, timeout: Any = None) -> FakeResponse:
        self.calls.append((url, dict(params or {})))
        answer = self.route(url, dict(params or {}))
        if isinstance(answer, Exception):
            raise answer
        return answer


VENUE_ANSWERS = {
    COINBASE_TICKER_URL.format(product="USDT-USD"): FakeResponse(CB_USDT_USD),
    COINBASE_TICKER_URL.format(product="USDT-USDC"): FakeResponse(CB_USDT_USDC),
    COINBASE_TICKER_URL.format(product="PAX-USD"): FakeResponse(CB_PAX_USD),
    GEMINI_TICKER_URL.format(symbol="usdcusd"): FakeResponse(GEMINI_USDC),
    GEMINI_TICKER_URL.format(symbol="rlusdusd"): FakeResponse(GEMINI_RLUSD),
    GEMINI_TICKER_URL.format(symbol="usdtusd"): FakeResponse(GEMINI_USDT),
    KRAKEN_TICKER_URL: FakeResponse(KRAKEN),
}


def route_table(table: dict[str, Any]) -> Callable[[str, dict], Any]:
    def route(url: str, params: dict) -> Any:
        if url not in table:
            raise AssertionError(f"unexpected GET {url} {params}")
        answer = table[url]
        return answer(params) if callable(answer) else answer
    return route


def live(route: Callable[[str, dict], Any], provider: Any = None) -> tuple[LiveCryptoData, FakeSession, list]:
    session, sleeps = FakeSession(route), []
    return LiveCryptoData(provider, session=session, sleep=sleeps.append, clock=lambda: NOW), session, sleeps


def q(mid: float, spread: float = 0.0004) -> dict:
    """A two-sided book around `mid`."""
    return {"bid": round(mid - spread / 2, 6), "ask": round(mid + spread / 2, 6)}


def market(**coins: dict) -> dict:
    """Every configured coin at 0.9999 on all its venues, with overrides per coin."""
    base = {"USDC": {"coinbase": q(0.9999), "kraken": q(0.9999), "gemini": q(0.9999)},
            "RLUSD": {"kraken": q(0.9999), "gemini": q(0.9999)},
            "PYUSD": {"kraken": q(0.9999)}, "USDP": {"coinbase": q(0.993, 0.01)},
            "USDT": {"coinbase": q(0.9995), "kraken": q(0.9995), "gemini": q(0.9994)}}
    for coin, venues in coins.items():
        base[coin] = {**base.get(coin, {}), **venues}
    return base


@pytest.fixture()
def cfg() -> Config:
    return load_config()


def with_shadow(cfg: Config, name: str, **changes: Any) -> Config:
    """A copy of `cfg` with shadow.<name> updated (nested dicts merged one level down)."""
    const = copy.deepcopy(cfg.constitution)
    block = const["shadow"][name]
    for key, value in changes.items():
        block[key] = {**block.get(key, {}), **value} if isinstance(value, dict) else value
    return Config(account=cfg.account, constitution=const, whitelist=cfg.whitelist,
                  constitution_sha256=cfg.constitution_sha256)


class Pings:
    def __init__(self) -> None:
        self.pings: list[str] = []
        self.sent: list = []

    def services(self) -> pipeline.Services:
        def send(email, *, dry_run, outbox):
            self.sent.append(email)
            return {"sent": False, "reason": "dry run"}
        return pipeline.Services(send=send, create_issue=lambda *a, **k: None, healthcheck=self.pings.append,
                                 fetch_comments=lambda url: [])


def provider_with(src: FakeCryptoData, **kwargs: Any) -> FakeProvider:
    p = FakeProvider(**kwargs)
    p.crypto = src
    return p


def new_state(cfg: Config, tmp_path: Path, created: str = "2026-09-01") -> Path:
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=created)
    return state_dir


def files(state_dir: Path) -> dict[str, bytes]:
    return {p.name: p.read_bytes() for p in sorted(state_dir.iterdir()) if p.is_file()}


def ledger(state_dir: Path) -> list[dict]:
    return [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]


def shadow_events(state_dir: Path, book: str) -> list[str]:
    return [r["payload"]["event"] for r in ledger(state_dir)
            if r["record_type"] == "shadow" and r["payload"].get("book") == book]


def state(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def eth_series(crash_from: str | None = None, start: str = "2026-01-01", end: str = "2026-12-31",
               drop: float = 0.6) -> pd.Series:
    """ETH-USD per UTC day: a steady uptrend (the 10-week switch is on), optionally cut by `drop` from a date."""
    days = pd.date_range(start, end, freq="D")
    close = pd.Series(1000.0 * (1.0 + 0.002 * np.arange(len(days))), index=days)
    if crash_from:
        close[close.index >= pd.Timestamp(crash_from)] *= drop
    return close


def daily_run(cfg: Config, state_dir: Path, provider: Any, date: str) -> pipeline.Run:
    """One daily Run that calls only the crypto hook (the real transaction: begin, hook, finish)."""
    run = pipeline.Run(cfg, provider, state_dir, "daily", date)
    try:
        assert run.begin()
        crypto.daily(run, {})
        run.finish("ok")
    finally:
        run.close()
    return run


# --- payload parsers --------------------------------------------------------------------------------------------

def test_parse_coinbase_ticker() -> None:
    assert parse_coinbase_ticker(CB_USDT_USD) == {"bid": 0.99952, "ask": 0.99953, "last": 0.99953,
                                                  "time": "2026-09-29T02:56:14.279169183Z"}
    assert parse_coinbase_ticker(CB_NOT_FOUND) is None and parse_coinbase_ticker(CB_DELISTED) is None
    assert parse_coinbase_ticker({"bid": "0", "ask": ""}) is None and parse_coinbase_ticker([1, 2]) is None


def test_parse_kraken_ticker_by_result_key() -> None:
    assert parse_kraken_ticker(KRAKEN, "USDCUSD") == {"bid": 0.9999, "ask": 1.0, "last": 0.9999, "time": None}
    assert parse_kraken_ticker(KRAKEN, "USDTZUSD")["bid"] == 0.99949
    assert parse_kraken_ticker(KRAKEN, "USDTUSD") is None                    # an altname is not a result key
    one = {"error": [], "result": {"USDTZUSD": KRAKEN["result"]["USDTZUSD"]}}
    assert parse_kraken_ticker(one, "USDTUSD")["ask"] == 0.9995              # ...except in a one-pair answer
    assert parse_kraken_ticker(KRAKEN_UNKNOWN, "USDCUSD") is None


def test_parse_gemini_ticker() -> None:
    assert parse_gemini_ticker(GEMINI_USDC) == {"bid": 0.99991, "ask": 0.99992, "last": 0.99992,
                                                "time": "2026-09-29T03:07:00Z"}
    assert parse_gemini_ticker(GEMINI_UNKNOWN) is None and parse_gemini_ticker({"bid": None}) is None


def test_cross_quote_implies_usdc_from_two_coinbase_books() -> None:
    usdc = cross_quote(parse_coinbase_ticker(CB_USDT_USD), parse_coinbase_ticker(CB_USDT_USDC))
    assert usdc["bid"] == pytest.approx(0.99952 / 0.9996) and usdc["ask"] == pytest.approx(0.99953 / 0.9995)
    assert 0.9998 < (usdc["bid"] + usdc["ask"]) / 2 < 1.0001
    # A USDC depeg shows as USDT costing more USDC: USDT-USDC at 1.111 means USDC is worth $0.90
    depeg = cross_quote({"bid": 0.9995, "ask": 0.9996}, {"bid": 1.1110, "ask": 1.1112})
    assert depeg["bid"] == pytest.approx(0.9995 / 1.1112) and depeg["ask"] == pytest.approx(0.9996 / 1.1110)
    assert cross_quote(None, CB_USDT_USDC) is None and cross_quote({"bid": 1.0}, {"bid": 1.0, "ask": 1.0}) is None


def test_parse_yahoo_future_reads_the_month_from_the_name() -> None:
    got = parse_yahoo_future(YAHOO_BTCX26)
    assert got == {"symbol": "BTCX26.CME", "price": 83730.0, "time": "2026-09-29T01:09:57Z", "month": "2026-11",
                   "name": "Bitcoin Futures,Nov-2026"}
    assert parse_yahoo_future(YAHOO_BTC_F)["month"] == "2026-10"
    assert parse_yahoo_future(yahoo("X", 1.0, 1790644197, None))["month"] is None
    assert parse_yahoo_future(YAHOO_NOT_FOUND) is None
    assert parse_yahoo_future(yahoo("X", 0.0, 1790644197, "Bitcoin Futures,Nov-2026")) is None


def test_parse_candle_close_at() -> None:
    t = pd.Timestamp(1790644197, unit="s", tz="UTC")
    assert parse_candle_close_at(CB_BTC_MINUTES, t) == 82997.79                        # the minute containing t
    gap = [row for row in CB_BTC_MINUTES if row[0] != 1790644140]
    assert parse_candle_close_at(gap, t) == 83004.01                                   # no trade: the minute before
    assert parse_candle_close_at(CB_BTC_MINUTES[:1], t) is None                        # only a later candle
    assert parse_candle_close_at({"message": "x"}, t) is None


def test_cme_btc_tickers() -> None:
    assert cme_btc_tickers(2026, 11) == ["BTCX26.CME", "MBTX26.CME"]
    assert cme_btc_tickers(2027, 1) == ["BTCF27.CME", "MBTF27.CME"]


# --- the live adapter, on a fake session ------------------------------------------------------------------------

def depeg_markets(cfg: Config) -> tuple[dict, dict]:
    return crypto._depeg_markets(cfg.shadow("M6")["depeg"], {})


def test_stablecoin_quotes_from_three_venues(cfg: Config) -> None:
    src, session, _ = live(route_table(VENUE_ANSWERS))
    coins, markets = depeg_markets(cfg)
    snap = src.stablecoin_quotes(markets)
    quotes = snap["quotes"]
    assert set(quotes) == {"USDC", "RLUSD", "PYUSD", "USDP", "USDT"} and snap["errors"] == {}
    assert quotes["USDC"]["kraken"]["bid"] == 0.9999 and quotes["USDC"]["gemini"]["ask"] == 0.99992
    assert quotes["USDC"]["coinbase"]["symbol"] == "USDT-USD/USDT-USDC"
    assert quotes["USDC"]["coinbase"]["bid"] == pytest.approx(0.99952 / 0.9996)
    urls = [u for u, _ in session.calls]
    assert urls.count(KRAKEN_TICKER_URL) == 1                                          # one batch for every pair
    assert urls.count(COINBASE_TICKER_URL.format(product="USDT-USD")) == 1             # shared by USDC and USDT
    kraken_pairs = next(p for u, p in session.calls if u == KRAKEN_TICKER_URL)["pair"].split(",")
    assert sorted(kraken_pairs) == ["PYUSDUSD", "RLUSDUSD", "USDCUSD", "USDTZUSD"]
    assert src.sources["stablecoins:gemini"] == "gemini"


def test_a_failing_venue_never_loses_the_others(cfg: Config) -> None:
    table = dict(VENUE_ANSWERS)
    table[GEMINI_TICKER_URL.format(symbol="usdcusd")] = FakeResponse(status_code=503, text="down")
    table[COINBASE_TICKER_URL.format(product="PAX-USD")] = FakeResponse(CB_DELISTED, status_code=400)
    src, session, sleeps = live(route_table(table))
    snap = src.stablecoin_quotes(depeg_markets(cfg)[1])
    assert snap["quotes"]["USDC"]["gemini"] is None and snap["quotes"]["USDC"]["kraken"] is not None
    assert snap["quotes"]["USDP"]["coinbase"] is None
    assert set(snap["errors"]) == {"gemini:usdcusd", "coinbase:PAX-USD"}
    assert sleeps == [2.0]                              # the 503 was retried once; the 400 was not retried
    assert [u for u, _ in session.calls].count(GEMINI_TICKER_URL.format(symbol="usdcusd")) == 2


def test_kraken_batch_rejected_is_retried_pair_by_pair(cfg: Config) -> None:
    def kraken(params: dict) -> FakeResponse:
        pairs = params["pair"].split(",")
        if len(pairs) > 1:
            return FakeResponse(KRAKEN_UNKNOWN)
        row = KRAKEN["result"].get(pairs[0])
        return FakeResponse({"error": [], "result": {pairs[0]: row}} if row else KRAKEN_UNKNOWN)

    table = {**VENUE_ANSWERS, KRAKEN_TICKER_URL: kraken}
    src, session, _ = live(route_table(table))
    markets = {"USDC": {"kraken": "USDCUSD"}, "GONE": {"kraken": "GONEUSD"}}
    snap = src.stablecoin_quotes(markets)
    assert snap["quotes"]["USDC"]["kraken"]["ask"] == 1.0 and snap["quotes"]["GONE"]["kraken"] is None
    assert snap["errors"] == {"kraken:GONEUSD": "EQuery:Unknown asset pair"}
    assert len(session.calls) == 3                                                     # the batch, then 2 singles


def test_eth_daily_utc_drops_the_trading_day() -> None:
    url = COINBASE_PRODUCT_CANDLES_URL.format(product="ETH-USD")
    src, session, _ = live(route_table({url: FakeResponse(CB_ETH_DAYS)}))
    eth = src.eth_daily_utc()
    assert eth.index[-1] == pd.Timestamp("2026-09-28") and eth.iloc[-1] == 2687.41 and len(eth) == 3
    params = session.calls[0][1]
    assert params["granularity"] == 86400 and params["end"] == "2026-09-29T00:00:00Z"
    assert params["start"] == "2025-12-04T00:00:00Z"                                  # 300 days, one page
    assert src.sources["eth_daily_utc"] == "coinbase"


def test_eth_daily_utc_falls_back_to_yfinance() -> None:
    url = COINBASE_PRODUCT_CANDLES_URL.format(product="ETH-USD")
    days = pd.date_range("2026-09-20", "2026-09-29")
    bars = pd.DataFrame({c: np.linspace(2500, 2700, len(days)) for c in ("open", "high", "low", "close", "adj_close",
                                                                         "volume")}, index=days)
    yf = FakeProvider(bars={"ETH-USD": bars})
    src, _, _ = live(route_table({url: FakeResponse(status_code=500, text="oops")}), provider=yf)
    eth = src.eth_daily_utc()
    assert eth.index[-1] == pd.Timestamp("2026-09-28") and src.sources["eth_daily_utc"] == "yfinance:ETH-USD"
    alone, _, _ = live(route_table({url: FakeResponse(status_code=500, text="oops")}))
    with pytest.raises(DataError):
        alone.eth_daily_utc()


def yahoo_route(answers: dict[str, Any]) -> Callable[[str, dict], Any]:
    table = {YAHOO_CHART_URL.format(ticker=t.replace("=", "%3D")): a for t, a in answers.items()}
    return route_table(table)


def test_btc_future_quote_prefers_the_explicit_month() -> None:
    src, session, _ = live(yahoo_route({"BTCX26.CME": FakeResponse(YAHOO_BTCX26)}))
    got = src.btc_future_quote(2026, 11)
    assert got["ticker"] == "BTCX26.CME" and got["price"] == 83730.0 and got["month"] == "2026-11"
    assert session.calls[0][1] == {"range": "1d", "interval": "1d"}
    assert src.sources["btc_future:2026-11"] == "yahoo:BTCX26.CME"


def test_btc_future_quote_uses_btc_f_only_for_its_named_month() -> None:
    missing = FakeResponse(YAHOO_NOT_FOUND, status_code=404)
    src, _, _ = live(yahoo_route({"BTCV26.CME": missing, "MBTV26.CME": missing, "BTC=F": FakeResponse(YAHOO_BTC_F)}))
    assert src.btc_future_quote(2026, 10)["ticker"] == "BTC=F"                         # it names Oct-2026
    src, session, _ = live(yahoo_route({"BTCX26.CME": missing, "MBTX26.CME": missing,
                                        "BTC=F": FakeResponse(YAHOO_BTC_F)}))
    assert src.btc_future_quote(2026, 11) is None                                      # fail closed
    assert len(session.calls) == 3
    wrong = FakeResponse(yahoo("BTCX26.CME", 1.0, 1790644197, "Bitcoin Futures,Dec-2026"))
    src, _, _ = live(yahoo_route({"BTCX26.CME": wrong, "MBTX26.CME": missing, "BTC=F": FakeResponse(YAHOO_BTC_F)}))
    assert src.btc_future_quote(2026, 11) is None                                      # another month's contract


def test_btc_spot_at_reads_the_minute_candle() -> None:
    url = COINBASE_PRODUCT_CANDLES_URL.format(product="BTC-USD")
    src, session, _ = live(route_table({url: FakeResponse(CB_BTC_MINUTES)}))
    assert src.btc_spot_at("2026-09-29T01:09:57Z") == 82997.79
    assert session.calls[0][1] == {"granularity": 60, "start": "2026-09-29T01:04:00Z", "end": "2026-09-29T01:10:00Z"}


def test_crypto_source_lookup(cfg: Config) -> None:
    assert isinstance(crypto_source(LiveProvider(cfg)), LiveCryptoData)
    fake = FakeCryptoData()
    assert crypto_source(provider_with(fake)) is fake
    assert crypto_source(FakeProvider()) is None                        # no crypto feeds: the books are skipped
    assert isinstance(fake, CryptoSource) and isinstance(LiveCryptoData(), CryptoSource)


# --- depeg rules ------------------------------------------------------------------------------------------------

DEPEG = load_config().shadow("M6")["depeg"]


def test_book_view_needs_a_sane_two_sided_book() -> None:
    assert rules.book_view(parse_gemini_ticker(GEMINI_USDG_EMPTY), 0.02)["usable"] is False   # no bids: no market
    thin = rules.book_view(parse_coinbase_ticker(CB_PAX_USD), 0.02)
    assert thin["usable"] and thin["mid"] == pytest.approx((0.9867 + 0.9994) / 2)          # last 0.9867 ignored
    assert rules.book_view({"bid": 0.99, "ask": 0.98}, 0.02)["reason"] == "crossed book"
    assert rules.book_view({"bid": 0.99}, 0.02)["reason"] == "one-sided book"
    assert rules.book_view(None, 0.02)["reason"] == "no quote"


def test_depeg_check_needs_two_confirming_venues() -> None:
    two = rules.depeg_check({"kraken": q(0.95), "gemini": q(0.97, 0.0), "coinbase": q(0.999)}, DEPEG)
    assert two["trigger"] and two["below"] == ["gemini", "kraken"] and two["median"] == pytest.approx(0.97)
    disagree = rules.depeg_check({"kraken": q(0.95), "gemini": q(0.999), "coinbase": q(0.999)}, DEPEG)
    assert not disagree["trigger"] and disagree["below"] == ["kraken"] and "disagree" in disagree["reason"]
    alone = rules.depeg_check({"kraken": q(0.95), "gemini": None}, DEPEG)
    assert not alone["trigger"] and "no other venue" in alone["reason"]
    empty = rules.depeg_check({"gemini": parse_gemini_ticker(GEMINI_USDG_EMPTY), "kraken": q(0.9999)}, DEPEG)
    assert not empty["below"] and empty["usable"] == 1              # an empty book is not a depeg


def step(book: dict, quotes: dict, now: str, nav: float | None = 100_000.0) -> list[dict]:
    coins = {"USDC": True, "RLUSD": True, "PYUSD": True, "USDP": True, "USDT": False}
    return rules.depeg_step(book, quotes, pd.Timestamp(now, tz="UTC"), DEPEG, nav, coins,
                            markets={"USDC": {"kraken": "USDCUSD", "gemini": "usdcusd"}})


def test_depeg_lifecycle_open_low_close() -> None:
    book: dict = {}
    assert step(book, market(), "2023-03-11 01:41") == [] and book == {"events": [], "watch": {}}
    usdc = {"kraken": q(0.960), "gemini": q(0.962), "coinbase": q(0.975)}
    opened = step(book, market(USDC=usdc), "2023-03-11 02:41")
    assert [c["event"] for c in opened] == ["depeg_open"]
    ev = book["events"][0]
    assert ev["id"] == "S-2023-03-11T02Z-M6-USDC" and ev["status"] == "open" and ev["eligible"] is True
    assert ev["venues_below"] == ["gemini", "kraken"] and ev["signal_date"] == "2023-03-11"
    assert ev["entry_price"] == pytest.approx(0.9622 * 1.0025)                   # the worst confirming ask + fee
    assert ev["size_usd"] == pytest.approx(3_000.0) and ev["stress_usd"] == pytest.approx(3_000.0)
    assert ev["conditions"]["reserves_attested"] == "unverified"
    assert ev["conditions"]["redemptions_open_72h"] == "unverified"
    assert ev["markets"] == {"kraken": "USDCUSD", "gemini": "usdcusd"} and ev["low"] == pytest.approx(0.962)

    lower = {"kraken": q(0.900), "gemini": q(0.905), "coinbase": q(0.910)}
    assert [c["event"] for c in step(book, market(USDC=lower), "2023-03-11 03:41")] == ["depeg_low"]
    assert ev["low"] == pytest.approx(0.905) and ev["updates"] == 1
    barely = {"kraken": q(0.899), "gemini": q(0.903), "coinbase": q(0.909)}      # less than half a cent lower
    assert step(book, market(USDC=barely), "2023-03-11 04:41") == []
    assert step(book, market(USDC={"kraken": None, "gemini": None, "coinbase": None}), "2023-03-12 04:41") == []

    closed = step(book, market(USDC={"kraken": q(0.998), "gemini": q(0.9985), "coinbase": q(0.9975)}),
                  "2023-03-13 14:41")
    assert [c["event"] for c in closed] == ["depeg_close"]
    assert ev["status"] == "closed" and ev["exit_reason"] == "recovered" and ev["exit_date"] == "2023-03-13"
    assert ev["exit_price"] == pytest.approx(0.9978 * 0.9975)                     # the median bid - fee
    assert ev["return"] == pytest.approx(0.9978 * 0.9975 / (0.9622 * 1.0025) - 1.0)
    assert ev["pnl_usd"] == pytest.approx(3_000.0 * ev["return"]) and ev["hours_held"] == 60.0


def test_depeg_time_stop_after_30_days() -> None:
    book: dict = {}
    usdc = {"kraken": q(0.96), "gemini": q(0.96), "coinbase": q(0.96)}
    step(book, market(USDC=usdc), "2026-01-01 00:41")
    assert step(book, market(USDC=usdc), "2026-01-30 23:41") == []
    closed = step(book, market(USDC=usdc), "2026-01-31 00:41")
    assert closed[0]["event"] == "depeg_close" and book["events"][0]["exit_reason"] == "time_stop"
    assert book["events"][0]["return"] < 0


def test_unconfirmed_depeg_is_logged_once_with_a_data_alert() -> None:
    book: dict = {}
    one = market(USDC={"kraken": q(0.95), "gemini": None, "coinbase": q(0.9999)})
    started = step(book, one, "2026-03-07 10:41")
    assert [c["event"] for c in started] == ["unconfirmed_start"] and "USDC" in started[0]["alert"]
    assert book["events"] == [] and book["watch"]["USDC"]["below"] == ["kraken"]
    assert step(book, one, "2026-03-07 11:41") == []                              # still unconfirmed: no change
    assert step(book, market(USDC={"kraken": None, "gemini": None, "coinbase": None}), "2026-03-07 12:41") == []
    ended = step(book, market(), "2026-03-07 13:41")
    assert [c["event"] for c in ended] == ["unconfirmed_end"] and book["watch"] == {}


def test_watch_only_usdt_is_scored_but_flagged() -> None:
    book: dict = {}
    changes = step(book, market(USDT={"coinbase": q(0.95), "kraken": q(0.951), "gemini": q(0.999)}), "2026-05-12 08:41")
    assert changes[0]["event"] == "depeg_open" and changes[0]["coin"] == "USDT" and changes[0]["eligible"] is False
    assert changes[0]["conditions"]["regulated_fiat_backed"] == "no (watch only)"


def test_depeg_trigger_that_follows_an_unconfirmed_print() -> None:
    book: dict = {}
    step(book, market(USDC={"kraken": q(0.96), "gemini": None}), "2026-03-07 10:41")
    opened = step(book, market(USDC={"kraken": q(0.955), "gemini": q(0.96)}), "2026-03-07 11:41")
    assert opened[0]["event"] == "depeg_open" and opened[0]["unconfirmed_since"] == "2026-03-07T10:41:00Z"
    assert book["watch"] == {}


# --- cash-and-carry rules ---------------------------------------------------------------------------------------

@pytest.mark.parametrize("year, month, expiry", [
    (2026, 10, "2026-10-30"), (2026, 11, "2026-11-27"),
    (2026, 12, "2026-12-24"),            # Friday 25 Dec is Christmas
    (2027, 3, "2027-03-25"),             # Friday 26 Mar is Good Friday
    (2025, 12, "2025-12-24"),            # Friday 26 Dec is Boxing Day in London; 25 Dec is Christmas
])
def test_cme_btc_expiry(year: int, month: int, expiry: str) -> None:
    assert rules.cme_btc_expiry(year, month).isoformat() == expiry


def test_carry_contracts_within_60_days() -> None:
    rows = rules.carry_contracts("2026-09-28", 60)
    assert [(r["code"], r["days"]) for r in rows] == [("X26", 60), ("V26", 32)]
    assert rows[0]["label"] == "Nov-2026" and rows[0]["expiry"] == "2026-11-27"
    assert [(r["code"], r["days"]) for r in rules.carry_contracts("2026-10-30", 60)] == [("Z26", 55), ("X26", 28)]


def test_quote_window_is_the_run_evening() -> None:
    assert rules.quote_window("2026-09-28") == (pd.Timestamp("2026-09-28 04:00", tz="UTC"),
                                                pd.Timestamp("2026-09-29 10:00", tz="UTC"))
    assert rules.quote_window("2026-12-01")[0] == pd.Timestamp("2026-12-01 05:00", tz="UTC")      # EST


def test_carry_check_on_the_29_sep_quotes_is_off() -> None:
    target = rules.carry_contracts("2026-09-28", 60)[0]
    chk = rules.carry_check(target, parse_yahoo_future(YAHOO_BTCX26) | {"ticker": "BTCX26.CME"}, 82997.79, 0.0408,
                            {})
    assert chk["basis"] == pytest.approx(83730.0 / 82997.79 - 1.0)
    assert chk["basis_annual"] == pytest.approx(0.0537, abs=5e-4)            # track 05: ~5.3%
    assert chk["threshold"] == pytest.approx(0.1008) and chk["on"] is False   # design §11: M6 off
    rich = rules.carry_check(target, {"price": 82_000.0, "time": "x"}, 80_000.0, 0.04, {})
    assert rich["basis_annual"] == pytest.approx(0.025 * 365 / 60) and rich["on"] is True
    assert rules.carry_check(target, None, 80_000.0, 0.04, {})["basis_annual"] is None
    assert rules.carry_check(target, {"price": 82_000.0}, None, 0.04, {})["on"] is False


def test_carry_close_at_expiry_earns_the_locked_basis_less_costs() -> None:
    target = rules.carry_contracts("2026-09-28", 60)[0]
    chk = rules.carry_check(target, {"ticker": "BTCX26.CME", "price": 82_000.0, "time": "t"}, 80_000.0, 0.04, {})
    ev = rules.carry_open(chk, "2026-09-28", 100_000.0, {})
    assert ev["notional_usd"] == pytest.approx(15_000.0) and ev["status"] == "open"
    assert rules.carry_close(ev, "2026-11-26", {}) is False
    assert rules.carry_close(ev, "2026-11-27", {}) is True
    ret = 0.025 - 0.0015 - 0.0025 * 60 / 365
    assert ev["return"] == pytest.approx(ret) and ev["exit_date"] == "2026-11-27" and ev["days_held"] == 60
    assert ev["excess_annual"] == pytest.approx(ret * 365 / 60 - 0.04)
    assert ev["pnl_usd"] == pytest.approx(15_000.0 * ret)
    assert rules.carry_close(ev, "2026-12-01", {}) is False                  # already closed


# --- ETH switch rules -------------------------------------------------------------------------------------------

ETH_CFG = load_config().shadow("ETH")


def test_eth_step_enters_at_the_next_utc_close() -> None:
    closes = eth_series(crash_from="2026-09-29", drop=0.1)          # a later crash must stay invisible
    book: dict = {}
    out = rules.eth_step(book, closes, "2026-09-29", ETH_CFG, tbill=0.04)
    assert [c["event"] for c in out["changes"]] == ["weekly", "signal_on", "entry"] and out["problems"] == []
    ot = book["open_trade"]
    assert ot["trade_id"] == "S-2026-09-27-ETH" and ot["signal_date"] == "2026-09-27"
    assert ot["entry_date"] == "2026-09-28"
    assert ot["entry_price"] == pytest.approx(float(closes["2026-09-28"]) * 1.0025)
    assert book["on"] is True and book["last_week_end"] == "2026-09-27"
    assert book["weeks"] == [{"week_end": "2026-09-27", "close": float(closes["2026-09-27"]),
                              "sma": out["changes"][0]["sma"], "on": True, "rf": 0.04}]
    again = rules.eth_step(book, closes, "2026-09-30", ETH_CFG, tbill=0.04)
    assert again == {"changes": [], "notes": [], "problems": []}          # the same week: nothing new


def test_eth_step_replays_missed_weeks_and_exits() -> None:
    closes = eth_series(crash_from="2026-10-05")
    book: dict = {}
    rules.eth_step(book, closes, "2026-09-29", ETH_CFG, tbill=0.04)
    out = rules.eth_step(book, closes, "2026-10-13", ETH_CFG, tbill=0.04)    # 5 and 12 Oct were missed
    assert [c["event"] for c in out["changes"]] == ["weekly", "weekly", "signal_off", "exit"]
    assert [w["week_end"] for w in book["weeks"]] == ["2026-09-27", "2026-10-04", "2026-10-11"]
    assert [w["on"] for w in book["weeks"]] == [True, True, False]
    trade = book["trades"][0]
    assert book["open_trade"] is None and trade["exit_date"] == "2026-10-12" and trade["days_held"] == 14
    expected = float(closes["2026-10-12"]) * 0.9975 / (float(closes["2026-09-28"]) * 1.0025) - 1.0
    assert trade["return"] == pytest.approx(expected) and trade["return"] < -0.3


def test_eth_step_fails_closed_without_the_sunday_candle() -> None:
    closes = eth_series().drop(pd.Timestamp("2026-09-27"))
    book: dict = {}
    out = rules.eth_step(book, closes, "2026-09-29", ETH_CFG)
    assert out["changes"] == [] and out["problems"] == ["no ETH-USD close for Sunday 2026-09-27; "
                                                        "that week is not decided"]
    assert book["last_week_end"] is None and book["open_trade"] is None


def test_eth_decide_cancels_an_unfilled_order() -> None:
    book = {"on": True, "last_week_end": "2026-09-20", "trades": [], "weeks": [],
            "open_trade": {"trade_id": "S-2026-09-20-ETH", "status": "pending_entry", "signal_date": "2026-09-20"}}
    off = {"week_end": "2026-09-27", "weekly_close": 1.0, "sma": 2.0, "on": False}
    assert [c["event"] for c in rules._eth_decide(book, off, None)] == ["weekly", "entry_cancelled"]
    book["open_trade"] = {"trade_id": "T", "status": "pending_exit", "exit_signal_date": "2026-09-27"}
    on = {"week_end": "2026-10-04", "weekly_close": 3.0, "sma": 2.0, "on": True}
    assert [c["event"] for c in rules._eth_decide(book, on, None)] == ["weekly", "exit_cancelled"]
    assert book["open_trade"]["status"] == "open"


def synthetic_weeks(n: int, timing: bool, seed: int = 7) -> list[dict]:
    """Weekly records where the next week's return is +3% after an "on" week and -3% after an "off" week
    (timing=True), or unrelated to the switch (timing=False)."""
    rng = np.random.default_rng(seed)
    on = rng.random(n) < 0.5
    closes = [2000.0]
    for i in range(1, n):
        drift = (0.03 if on[i - 1] else -0.03) if timing else 0.0
        closes.append(closes[-1] * (1.0 + drift + rng.normal(0.0, 0.02)))
    ends = pd.date_range("2024-01-07", periods=n, freq="7D")
    return [{"week_end": d.strftime("%Y-%m-%d"), "close": c, "sma": None, "on": bool(o), "rf": 0.04}
            for d, c, o in zip(ends, closes, on)]


def test_eth_promotion_needs_t_2_over_24_months() -> None:
    strong = rules.eth_promotion(synthetic_weeks(120, timing=True), ETH_CFG)
    assert strong["weeks"] == 119 and strong["months"] > 24 and strong["t"] > 2 and strong["passes"] is True
    assert strong["alpha_annual"] > 0
    short = rules.eth_promotion(synthetic_weeks(60, timing=True), ETH_CFG)
    assert short["t"] > 2 and short["months"] < 24 and short["passes"] is False
    noise = rules.eth_promotion(synthetic_weeks(120, timing=False), ETH_CFG)
    assert noise["t"] < 2 and noise["passes"] is False
    assert rules.eth_promotion([], ETH_CFG)["t"] is None


def test_m6_summary() -> None:
    events = [{"kind": "depeg", "status": "closed", "return": 0.05, "eligible": True},
              {"kind": "depeg", "status": "closed", "return": -0.02, "eligible": False},
              {"kind": "depeg", "status": "open"},
              {"kind": "carry", "status": "closed", "return": 0.02, "excess_annual": 0.08}]
    s = rules.m6_summary(events)
    assert s["depeg"] == {"events": 3, "open": 1, "closed": 2, "mean_return": pytest.approx(0.015),
                          "hit_rate": 0.5, "eligible_closed": 1, "eligible_mean_return": pytest.approx(0.05)}
    assert s["carry"]["mean_excess_annual"] == pytest.approx(0.08) and s["carry"]["closed"] == 1


# --- the daily hook -----------------------------------------------------------------------------------------------

X26_QUOTE = {"ticker": "BTCX26.CME", "price": 83730.0, "time": "2026-09-29T01:09:57Z", "month": "2026-11"}


def test_daily_hook_decides_eth_and_checks_the_basis(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    src = FakeCryptoData(eth=eth_series(), futures={(2026, 11): X26_QUOTE}, spot=82997.79)
    run = daily_run(cfg, state_dir, provider_with(src), "2026-09-28")
    assert run.outgoing == [] and run.broker.pending() == []                     # shadow only: no email, no order
    st = state(state_dir)
    eth = st["shadow"]["ETH"]
    assert eth["open_trade"]["status"] == "open" and eth["open_trade"]["entry_date"] == "2026-09-28"
    assert shadow_events(state_dir, "ETH") == ["weekly", "signal_on", "entry"]
    assert shadow_events(state_dir, "M6") == ["carry_check"]
    last = st["shadow"]["M6"]["carry_last"]
    assert last["contract"] == "X26" and last["on"] is False and last["basis_annual"] == pytest.approx(0.0537, abs=5e-4)
    assert not st["alerts"] and Ledger(state_dir / "ledger.jsonl").verify()[0]
    manifest = [r for r in ledger(state_dir) if r["record_type"] == "run_manifest"][-1]["payload"]
    assert "fake" in manifest["sources"]


def test_daily_hook_fails_closed_on_missing_or_stale_quotes(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    src = FakeCryptoData(eth=eth_series(), futures={}, spot=82997.79,          # no explicit month, tonight
                         clock=lambda: pd.Timestamp("2026-09-29T02:30:00Z"))
    daily_run(cfg, state_dir, provider_with(src), "2026-09-28")
    alerts = state(state_dir)["alerts"]
    assert [a["kind"] for a in alerts] == ["data"] and "no explicit-month quote for Nov-2026" in alerts[0]["message"]
    src.futures = {(2026, 11): {**X26_QUOTE, "time": "2026-09-28T03:00:00Z"}}  # before the run date's window
    daily_run(cfg, state_dir, provider_with(src), "2026-09-29")
    assert "stale" in state(state_dir)["alerts"][-1]["message"]
    src.futures, src.spot = {(2026, 11): {**X26_QUOTE, "time": "2026-09-30T23:00:00Z"}}, None
    daily_run(cfg, state_dir, provider_with(src), "2026-09-30")
    assert "no BTC-USD price" in state(state_dir)["alerts"][-1]["message"]
    assert not [e for e in state(state_dir)["shadow"]["M6"]["events"] if e["kind"] == "carry"]
    checks = [r["payload"] for r in ledger(state_dir) if r["payload"].get("event") == "carry_check"]
    assert len(checks) == 3 and all(c["basis_annual"] is None and c["problem"] for c in checks)


def test_daily_hook_catch_up_run_does_not_use_later_quotes(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    src = FakeCryptoData(eth=eth_series(), futures={(2026, 10): {**X26_QUOTE, "month": "2026-10"}}, spot=82997.79)
    run = daily_run(cfg, state_dir, provider_with(src), "2026-09-21")         # a run for last Monday, made today
    assert state(state_dir)["alerts"] == []                                    # not a data problem: a note
    assert any("after the run date" in n for n in run.result.notes)
    assert state(state_dir)["shadow"]["M6"]["carry_last"]["basis_annual"] is None


def test_catch_up_run_for_an_expired_month_is_a_note_not_an_alert(cfg: Config, tmp_path: Path) -> None:
    """Yahoo answers 404 for an expired month, so a catch-up run for a date before that expiry can't quote its
    target: a note, like a quote stamped after the run date, not a data alert every replayed evening."""
    state_dir = new_state(cfg, tmp_path)
    src = FakeCryptoData(eth=eth_series(), futures={}, spot=82997.79,          # Nov-26 expired on 27 Nov
                         clock=lambda: pd.Timestamp("2026-12-15T03:00:00Z"))
    run = daily_run(cfg, state_dir, provider_with(src), "2026-09-28")        # made in December for 28 Sep
    assert state(state_dir)["alerts"] == []
    assert any("Nov-2026 (X26): it expired on 2026-11-27, before this catch-up run for 2026-09-28" in n
               for n in run.result.notes)
    assert state(state_dir)["shadow"]["M6"]["carry_last"]["basis_annual"] is None
    check = [r["payload"] for r in ledger(state_dir) if r["payload"].get("event") == "carry_check"][-1]
    assert check["basis_annual"] is None and "expired" in check["problem"]
    # the provider's clock serves too, when the source has none (a LiveProvider carries one)
    src = FakeCryptoData(eth=eth_series(), futures={}, spot=82997.79)
    prov = provider_with(src)
    prov._clock = lambda: pd.Timestamp("2026-12-15T03:00:00Z")
    daily_run(cfg, state_dir, prov, "2026-09-29")
    assert state(state_dir)["alerts"] == []


def test_carry_opens_and_closes_at_expiry(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    rich = {**X26_QUOTE, "price": 82_000.0}
    src = FakeCryptoData(eth=eth_series(), futures={(2026, 11): rich}, spot=80_000.0)
    daily_run(cfg, state_dir, provider_with(src), "2026-09-28")
    ev = state(state_dir)["shadow"]["M6"]["events"][0]
    assert ev["kind"] == "carry" and ev["status"] == "open" and ev["contract"] == "X26" and ev["days"] == 60
    assert ev["notional_usd"] == pytest.approx(15_000.0) and ev["threshold"] == pytest.approx(0.10)
    src.futures = {(2026, 11): {**rich, "time": "2026-09-30T01:00:00Z"}}
    daily_run(cfg, state_dir, provider_with(src), "2026-09-29")                # still on: no second position
    assert len(state(state_dir)["shadow"]["M6"]["events"]) == 1
    daily_run(cfg, state_dir, provider_with(src), "2026-11-27")                # expiry
    ev = state(state_dir)["shadow"]["M6"]["events"][0]
    assert ev["status"] == "closed" and ev["exit_reason"] == "expiry"
    assert ev["return"] == pytest.approx(82_000.0 / 80_000.0 - 1.0 - 0.0015 - 0.0025 * 60 / 365)
    assert shadow_events(state_dir, "M6").count("carry_close") == 1


def test_daily_hook_without_crypto_feeds_is_a_note(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    run = daily_run(cfg, state_dir, FakeProvider(), "2026-09-28")
    assert "crypto shadows skipped: the data provider has no crypto feeds" in run.result.notes
    assert state(state_dir)["alerts"] == [] and shadow_events(state_dir, "ETH") == []


def test_daily_hook_eth_data_missing_alerts(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    daily_run(cfg, state_dir, provider_with(FakeCryptoData(eth=None, futures={(2026, 11): X26_QUOTE},
                                                           spot=82997.79)), "2026-09-28")
    alerts = state(state_dir)["alerts"]
    assert any(a["kind"] == "data" and "ETH-USD prices unavailable" in a["message"] for a in alerts)
    assert shadow_events(state_dir, "ETH") == ["data_missing"]


def spy_provider(src: FakeCryptoData) -> FakeProvider:
    from traderec.market_calendar import is_trading_day
    days = pd.DatetimeIndex([d for d in pd.date_range("2025-06-02", "2026-10-30", freq="B") if is_trading_day(d)])
    close = pd.Series(600.0 * np.exp(0.0004 * np.arange(len(days))), index=days)
    spy = pd.DataFrame({"open": close * 0.999, "high": close * 1.002, "low": close * 0.997, "close": close,
                        "adj_close": close, "volume": 1e6})
    vix = pd.Series(15.0, index=days)
    vix_bars = pd.DataFrame({c: vix for c in ("open", "high", "low", "close", "adj_close")}).assign(volume=0.0)
    return provider_with(src, bars={"SPY": spy, "^VIX": vix_bars}, vix=vix, tbill_rate=0.04)


def test_pipeline_daily_runs_the_crypto_shadows(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    src = FakeCryptoData(eth=eth_series(), futures={(2026, 11): X26_QUOTE}, spot=82997.79)
    rec = Pings()
    res = pipeline.run_daily(cfg, spy_provider(src), state_dir, date="2026-09-28", services=rec.services())
    assert res.status == "ok" and rec.sent == []
    st = state(state_dir)
    assert st["shadow"]["ETH"]["open_trade"]["entry_date"] == "2026-09-28"
    assert st["shadow"]["M6"]["carry_last"]["on"] is False
    assert not [a for a in st["alerts"] if a["kind"] == "shadow"]
    assert Ledger(state_dir / "ledger.jsonl").verify()[0]


# --- the hourly job -----------------------------------------------------------------------------------------------

def hourly(cfg: Config, state_dir: Path, src: FakeCryptoData, now: str, rec: Pings, **kw: Any) -> pipeline.RunResult:
    return crypto.run_hourly(cfg, provider_with(src), state_dir, now=pd.Timestamp(now, tz="UTC"),
                             services=rec.services(), **kw)


def test_quiet_hour_writes_nothing(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    before = files(state_dir)
    rec = Pings()
    res = hourly(cfg, state_dir, FakeCryptoData(quotes=market()), "2026-09-29 14:41", rec)
    assert res.status == "no_change" and res.kind == "hourly" and res.date == "2026-09-29T14Z"
    assert files(state_dir) == before and not (state_dir / "pre_run.json").exists()
    assert rec.pings == ["success"] and any(n.startswith("USDC: coinbase 0.9999") for n in res.notes)


def test_saturday_depeg_is_recorded_hour_by_hour(cfg: Config, tmp_path: Path) -> None:
    """The one US precedent (USDC, March 2023) bottomed on a Saturday: the 24/7 job must see it."""
    state_dir = new_state(cfg, tmp_path, created="2023-03-01")
    src, rec = FakeCryptoData(quotes=market()), Pings()
    src.quotes = market(USDC={"kraken": q(0.960), "gemini": q(0.962), "coinbase": q(0.975)})
    res = hourly(cfg, state_dir, src, "2023-03-11 02:41", rec)                  # Saturday
    assert res.status == "ok" and any("M6 depeg USDC: shadow buy" in n for n in res.notes)
    st = state(state_dir)
    ev = st["shadow"]["M6"]["events"][0]
    assert ev["status"] == "open" and ev["size_usd"] == pytest.approx(3_000.0)
    assert ev["conditions"]["reserves_attested"] == "unverified"
    assert st["runs"]["hourly:2023-03-11T02Z"]["status"] == "ok" and (state_dir / "pre_run.json").exists()
    assert shadow_events(state_dir, "M6") == ["depeg_open"]

    src.quotes = market(USDC={"kraken": q(0.900), "gemini": q(0.905), "coinbase": q(0.910)})
    assert hourly(cfg, state_dir, src, "2023-03-11 03:41", rec).status == "ok"                  # new low
    before = files(state_dir)
    src.quotes = market(USDC={"kraken": q(0.899), "gemini": q(0.903), "coinbase": q(0.909)})
    assert hourly(cfg, state_dir, src, "2023-03-11 04:41", rec).status == "no_change"
    assert files(state_dir) == before                                                            # nothing to commit
    src.quotes = market(USDC={"kraken": q(0.998), "gemini": q(0.9985), "coinbase": q(0.9975)})
    assert hourly(cfg, state_dir, src, "2023-03-13 14:41", rec).status == "ok"                   # recovered
    st = state(state_dir)
    ev = st["shadow"]["M6"]["events"][0]
    assert ev["status"] == "closed" and ev["exit_reason"] == "recovered" and ev["return"] > 0.03
    assert shadow_events(state_dir, "M6") == ["depeg_open", "depeg_low", "depeg_close"]
    assert sorted(k for k in st["runs"] if k.startswith("hourly:")) == [
        "hourly:2023-03-11T02Z", "hourly:2023-03-11T03Z", "hourly:2023-03-13T14Z"]
    assert rec.sent == [] and rec.pings == ["success"] * 4
    assert Ledger(state_dir / "ledger.jsonl").verify()[0]


def test_recorded_hour_is_idempotent(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    src, rec = FakeCryptoData(quotes=market(USDC={"kraken": q(0.95), "gemini": q(0.95)})), Pings()
    assert hourly(cfg, state_dir, src, "2026-09-29 14:41", rec).status == "ok"
    before, calls = files(state_dir), len(src.calls)
    again = hourly(cfg, state_dir, src, "2026-09-29 14:55", rec)
    assert again.status == "already_done" and files(state_dir) == before and len(src.calls) == calls


def test_unconfirmed_depeg_alerts_once(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    src = FakeCryptoData(quotes=market(USDC={"kraken": q(0.95)}), down={"gemini"})
    rec = Pings()
    assert hourly(cfg, state_dir, src, "2026-03-07 10:41", rec).status == "ok"
    alerts = state(state_dir)["alerts"]
    assert len(alerts) == 1 and alerts[0]["kind"] == "data" and "USDC" in alerts[0]["message"]
    assert alerts[0]["run"] == "hourly:2026-03-07T10Z"
    assert hourly(cfg, state_dir, src, "2026-03-07 11:41", rec).status == "no_change"
    src.quotes, src.down = market(), set()
    assert hourly(cfg, state_dir, src, "2026-03-07 12:41", rec).status == "ok"
    assert shadow_events(state_dir, "M6") == ["unconfirmed_start", "unconfirmed_end"]
    assert state(state_dir)["shadow"]["M6"]["events"] == []


def test_no_usable_quotes_is_data_missing_without_a_ping(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    before, rec = files(state_dir), Pings()
    res = hourly(cfg, state_dir, FakeCryptoData(quotes=market(), down={"coinbase", "kraken", "gemini"}),
                 "2026-09-29 14:41", rec)
    assert res.status == "data_missing" and rec.pings == [] and files(state_dir) == before


def test_hourly_dry_run_writes_nothing(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    before, rec = files(state_dir), Pings()
    src = FakeCryptoData(quotes=market(USDC={"kraken": q(0.95), "gemini": q(0.95)}))
    res = hourly(cfg, state_dir, src, "2026-09-29 14:41", rec, dry_run=True)
    assert res.status == "ok" and res.dry_run and files(state_dir) == before and rec.pings == []


def test_hourly_disabled_and_error_paths(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    off = with_shadow(cfg, "M6", depeg={"enabled": False})
    rec = Pings()
    assert hourly(off, state_dir, FakeCryptoData(), "2026-09-29 14:41", rec).status == "disabled"

    class Broken(FakeCryptoData):
        def stablecoin_quotes(self, markets: Any) -> dict:
            raise RuntimeError("bug")

    rec = Pings()
    with pytest.raises(RuntimeError):
        hourly(cfg, state_dir, Broken(), "2026-09-29 14:41", rec)
    assert rec.pings == ["fail"]
    with pytest.raises(pipeline.RunError):
        hourly(cfg, tmp_path / "nowhere", FakeCryptoData(), "2026-09-29 14:41", Pings())


def test_open_event_is_managed_after_its_coin_leaves_the_config(cfg: Config, tmp_path: Path) -> None:
    state_dir = new_state(cfg, tmp_path)
    src, rec = FakeCryptoData(quotes=market(RLUSD={"kraken": q(0.95), "gemini": q(0.95)})), Pings()
    hourly(cfg, state_dir, src, "2026-09-29 14:41", rec)
    coins = {k: v for k, v in cfg.shadow("M6")["depeg"]["coins"].items() if k != "RLUSD"}
    fewer = with_shadow(cfg, "M6", depeg={"coins": coins})
    assert "RLUSD" not in fewer.shadow("M6")["depeg"]["coins"]
    src.quotes = market()
    assert hourly(fewer, state_dir, src, "2026-09-29 15:41", rec).status == "ok"
    assert state(state_dir)["shadow"]["M6"]["events"][0]["exit_reason"] == "recovered"


def test_cli_hourly_maps_data_missing_to_exit_3(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    seen: dict = {}

    def fake_run_hourly(cfg: Any, provider: Any, state_dir: Any, *, dry_run: bool = False) -> pipeline.RunResult:
        seen.update(provider=provider, state_dir=state_dir, dry_run=dry_run)
        return pipeline.RunResult("hourly", "2026-09-29T14Z", seen.get("status", "data_missing"))

    monkeypatch.setattr(crypto, "run_hourly", fake_run_hourly)
    assert cli.main(["--state-dir", str(tmp_path), "hourly", "--dry-run"]) == 3
    assert isinstance(seen["provider"], LiveProvider) and seen["dry_run"] is True
    seen["status"] = "no_change"
    assert cli.main(["--state-dir", str(tmp_path), "hourly"]) == 0


# --- config and workflow -------------------------------------------------------------------------------------------

def test_config_blocks(cfg: Config) -> None:
    eth, m6 = cfg.shadow("ETH"), cfg.shadow("M6")
    assert eth["enabled"] is True and eth["weeks"] == 10 and eth["promotion"]["min_months"] == 24
    assert m6["enabled"] and m6["depeg"]["enabled"] and m6["carry"]["enabled"]
    depeg = m6["depeg"]
    assert depeg["trigger_price"] == 0.97 and depeg["min_venues"] == 2
    assert depeg["size_pct_nav"] == 0.03 and depeg["stress_pct"] == 1.0
    assert {"USDC", "PYUSD", "USDP"} <= set(depeg["coins"]) and "USDT" not in depeg["coins"]
    assert set(depeg["watch_only"]) == {"USDT"}                          # not a regulated issuer (docs)
    assert all(set(v) <= {"coinbase", "kraken", "gemini"} for v in {**depeg["coins"], **depeg["watch_only"]}.values())
    carry = m6["carry"]
    assert carry["max_days_to_expiry"] == 60 and carry["excess_over_tbill"] == 0.06
    assert carry["notional_pct_nav"] == 0.15


def test_hourly_workflow() -> None:
    wf = yaml.safe_load((REPO / ".github/workflows/hourly.yml").read_text())
    triggers = wf.get("on", wf.get(True))                                # YAML 1.1 reads a bare `on` as True
    assert triggers["schedule"] == [{"cron": "41 * * * *"}] and "workflow_dispatch" in triggers
    assert wf["concurrency"] == {"group": "traderec-state", "cancel-in-progress": False}
    job = wf["jobs"]["hourly"]
    text = json.dumps(job)
    assert "python -m traderec hourly" in text and "HC_PING_URL_HOURLY" in text
    assert "cache: pip" in (REPO / ".github/workflows/hourly.yml").read_text()
    assert any(s.get("name") == "Commit state changes" for s in job["steps"])
    assert job["timeout-minutes"] <= 10
