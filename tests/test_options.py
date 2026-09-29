"""Tests for the options infrastructure (docs/PHASE_B_CONTRACTS.md §1-§5).

Covers option chains and their helpers, fill model v1.0 for spreads, paper-broker spreads, the snapshot store,
the 10:17 ET options job, and the daily run's spread marks and expiry safety net.

Offline: CBOE payloads recorded after the 28 Sep 2026 close and trimmed to a few contracts
(tests/fixtures/cboe_*_2026-09-28.json), FakeProvider chains and a fake HTTP session. The live smoke test at the
bottom runs only with RUN_NETWORK_TESTS=1.
"""
from __future__ import annotations

import copy
import dataclasses
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest
import yaml

from traderec import market_calendar, pipeline, runners
from traderec.broker import PaperBroker
from traderec.config import load_config
from traderec.data import DataError, FakeProvider, LiveProvider
from traderec.data.providers import USER_AGENT, cboe_option_symbol
from traderec.ledger import Ledger
from traderec.market_calendar import ET, is_trading_day
from traderec.options import snapshots
from traderec.options.chain import (CHAIN_COLUMNS, OptionChain, chain_root, expiries_between, expiry_on_or_before,
                                    liquidity_check, occ_symbol, parse_cboe_chain, parse_occ, parse_yahoo_chain,
                                    strike_by_delta, strike_nearest)
from traderec.options.fillmodel import at_price_floor, combo_quote, decide_fill, min_tick, model_price, order_prices
from traderec.options.job import intrinsic_value, run_options
from traderec.state import load_state, save_state
from traderec.types import OrderIntent

FIXTURES = Path(__file__).parent / "fixtures"
D0, D1, D2 = "2026-09-28", "2026-09-29", "2026-09-30"          # Mon (the recorded close), Tue, Wed
TRADE = "T-2026-09-28-M4"
KEY = f"taxable|{TRADE}"
LONG, SHORT = "XSP261120C00770000", "XSP261120C00805000"


def leg(occ: str, position: str) -> dict[str, Any]:
    p = parse_occ(occ)
    return {"occ": occ, "root": p["root"], "right": p["right"], "strike": p["strike"], "expiry": p["expiry"],
            "position": position, "ratio": 1}


LEGS = [leg(LONG, "long"), leg(SHORT, "short")]
# The recorded quotes: long 16.72/16.86 (mid 16.79), short 3.26/3.32 (mid 3.29).
MID, WIDTH = 13.50, 0.20                     # combo mid and natural width, per share
LIMIT, MAXIMUM = MID + 0.3 * WIDTH, MID + 0.5 * WIDTH      # 13.56 and 13.60 (contract §2)
FILLS = {"concession": 0.3, "max_concession": 0.5, "multiplier": 100}


def payload(name: str = "xsp") -> dict:
    return json.loads((FIXTURES / f"cboe_{name}_2026-09-28.json").read_text())


@pytest.fixture(scope="module")
def cfg():
    return load_config()


@pytest.fixture(scope="module")
def xsp() -> OptionChain:
    return parse_cboe_chain(payload("xsp"), "XSP", raw_sha256="f" * 64)


@pytest.fixture(scope="module")
def spx() -> OptionChain:
    return parse_cboe_chain(payload("spx"), "SPX")


def at(chain: OptionChain, asof: str, shift: dict[str, float] | None = None) -> OptionChain:
    """`chain` restamped `asof`; `shift` moves a contract's bid and ask by the given amount."""
    frame = chain.frame.copy()
    for occ, delta in (shift or {}).items():
        rows = frame["occ"] == occ
        frame.loc[rows, ["bid", "ask"]] += delta
    two_sided = (frame["bid"] > 0) & (frame["ask"] > 0) & (frame["ask"] >= frame["bid"])
    frame["mid"] = ((frame["bid"] + frame["ask"]) / 2.0).where(two_sided)
    return dataclasses.replace(chain, asof=asof, frame=frame)


def spread_order(n: int = 1, *, side: str = "buy", created: str = D0, legs: list[dict] | None = None,
                 limit: float | None = LIMIT, maximum: float | None = MAXIMUM, **kw: Any) -> OrderIntent:
    """An M4 XSP call-vertical order: open (buy) by default, or close (sell, close_all)."""
    base = dict(intent_id=f"O-{created}-M4-{n:04d}", trade_id=TRADE, module="M4", account="taxable",
                ticker="XSP", side=side, created_date=created, reason="entry" if side == "buy" else "time_stop",
                close_all=side == "sell", order_type="spread_limit", legs=copy.deepcopy(legs or LEGS), contracts=1,
                limit_price=limit, max_price=maximum)
    base.update(kw)
    return OrderIntent(**base)


# ============================================================================================ chains


def test_parse_cboe_fixture(xsp):
    assert (xsp.underlying, xsp.source, xsp.spot, xsp.raw_sha256) == ("XSP", "cboe", 768.37, "f" * 64)
    assert xsp.asof == "2026-09-28T22:53:56"               # the file's UTC stamp 02:53:56 on the 29th, in ET
    assert list(xsp.frame.columns) == CHAIN_COLUMNS and len(xsp.frame) == 72
    assert xsp.expiries() == ["2026-09-28", "2026-10-16", "2026-11-20", "2026-12-18", "2027-06-17"]
    q = xsp.quote(LONG)
    assert (q["root"], q["right"], q["strike"], q["expiry"]) == ("XSP", "C", 770.0, "2026-11-20")
    assert (q["bid"], q["ask"], q["mid"], q["iv"], q["delta"], q["open_interest"]) == (
        16.72, 16.86, pytest.approx(16.79), 0.1387, 0.5234, 203.0)
    assert q["last_trade_time"] == "2026-09-28T15:55:59"
    assert xsp.quote("XSP261120P00730000")["delta"] == -0.2001            # put deltas are negative
    no_bid = xsp.quote("XSP260928C00770000")                               # bid 0.00: no quote
    assert np.isnan(no_bid["mid"]) and no_bid["ask"] == 0.01
    unmodelled = xsp.quote("XSP260928P00770000")                           # iv 0.0: greeks are placeholders
    assert np.isnan(unmodelled["iv"]) and np.isnan(unmodelled["delta"]) and unmodelled["mid"] == pytest.approx(2.035)
    assert xsp.quote("XSP261120C09990000") is None
    calls = xsp.select("C", "2026-11-20")
    assert calls["strike"].is_monotonic_increasing and set(calls["right"]) == {"C"} and len(calls) == 22


def test_parse_cboe_spx_file_holds_spx_and_spxw(spx):
    assert spx.underlying == "SPX" and set(spx.frame["root"]) == {"SPX", "SPXW"}
    third_friday = spx.select("C", "2026-11-20")
    assert sorted(set(third_friday["root"])) == ["SPX", "SPXW"] and len(third_friday) == 10
    assert spx.quote("SPX261120C07675000")["bid"] == 181.0                  # AM-settled
    assert spx.quote("SPXW261120C07675000")["bid"] == 182.3                 # PM-settled, same date and strike
    assert strike_nearest(spx, "2026-11-13", "C", 7690.0) == 7700.0
    assert strike_nearest(spx, "2026-11-13", "C", 7690.0, root="SPX") is None   # SPX has no 13 Nov weekly


@pytest.mark.parametrize("bad", [
    {}, {"data": {}}, {"timestamp": "2026-09-29 02:53:56"},
    {"timestamp": "2026-09-29 02:53:56", "data": {"current_price": 0.0, "options": [{"option": LONG}]}},
    {"timestamp": "2026-09-29 02:53:56", "data": {"current_price": 768.0, "options": []}},
    {"timestamp": "2026-09-29 02:53:56", "data": {"current_price": 768.0, "options": [{"option": "junk"}]}},
    {"timestamp": "not a time", "data": {"current_price": 768.0, "options": [{"option": LONG}]}},
])
def test_parse_cboe_rejects_unusable_payloads(bad):
    with pytest.raises(ValueError):
        parse_cboe_chain(bad, "XSP")


def yahoo_frame(expiry: str, right: str, strikes: list[float], bids: list[float], ivs: list[float]) -> pd.DataFrame:
    """A frame shaped like yfinance's option_chain(expiry).calls / .puts (columns checked 2026-09-29)."""
    ymd = expiry.replace("-", "")[2:]
    n = len(strikes)
    return pd.DataFrame({
        "contractSymbol": [f"XSP{ymd}{right}{int(k * 1000):08d}" for k in strikes],
        "lastTradeDate": pd.to_datetime(["2026-09-29 14:05:00"] * n, utc=True),
        "strike": strikes, "lastPrice": bids, "bid": bids, "ask": [b + 0.1 for b in bids], "change": 0.0,
        "percentChange": 0.0, "volume": [5] * n, "openInterest": [600] * n, "impliedVolatility": ivs,
        "inTheMoney": False, "contractSize": "REGULAR", "currency": "USD"})


def test_parse_yahoo_chain():
    frames = [yahoo_frame("2026-11-20", "C", [770.0, 805.0], [16.7, 0.0], [0.14, 1e-5]),
              yahoo_frame("2026-11-20", "P", [730.0], [5.9], [0.18])]
    chain = parse_yahoo_chain(frames, "xsp", 768.4, "2026-09-29T10:17:05")
    assert (chain.underlying, chain.source, chain.spot, chain.asof) == ("XSP", "yahoo", 768.4, "2026-09-29T10:17:05")
    assert list(chain.frame.columns) == CHAIN_COLUMNS and len(chain.frame) == 3
    assert chain.raw_sha256 and len(chain.raw_sha256) == 64
    q = chain.quote(LONG)
    assert q["mid"] == pytest.approx(16.75) and q["open_interest"] == 600 and np.isnan(q["delta"])
    assert q["last_trade_time"] == "2026-09-29T10:05:00"                    # 14:05 UTC in ET
    short = chain.quote(SHORT)
    assert np.isnan(short["mid"]) and np.isnan(short["iv"])                 # no bid; Yahoo's 1e-5 IV placeholder
    assert strike_by_delta(chain, "2026-11-20", "P", -0.2) is None          # no greeks on Yahoo
    with pytest.raises(ValueError):
        parse_yahoo_chain(frames, "XSP", 0.0, "2026-09-29T10:17:05")
    with pytest.raises(ValueError):
        parse_yahoo_chain([pd.DataFrame()], "XSP", 768.0, "2026-09-29T10:17:05")


@pytest.mark.parametrize("occ, parts", [
    ("XSP261218C00770000", ("XSP", "2026-12-18", "C", 770.0)),
    ("SPXW261120P07350000", ("SPXW", "2026-11-20", "P", 7350.0)),
    ("SPY261120C00772500", ("SPY", "2026-11-20", "C", 772.5)),
    ("DAL261218C00047500", ("DAL", "2026-12-18", "C", 47.5)),
])
def test_occ_round_trip(occ, parts):
    p = parse_occ(occ)
    assert (p["root"], p["expiry"], p["right"], p["strike"]) == parts
    assert occ_symbol(*parts) == occ
    assert parse_occ(occ.replace(parts[0], parts[0].ljust(6))) == p        # OCC's space-padded form parses too


def test_parse_occ_rejects_other_symbols_and_chain_root_maps_spxw():
    for bad in ("", "XSP", "XSP261218X00770000", "XSP26121C00770000"):
        with pytest.raises(ValueError):
            parse_occ(bad)
    assert (chain_root("SPXW"), chain_root("xsp"), chain_root("SPY")) == ("SPX", "XSP", "SPY")


def test_expiry_helpers(xsp):
    assert expiry_on_or_before(xsp, "2026-11-27") == "2026-11-20"
    assert expiry_on_or_before(xsp, "2026-11-20") == "2026-11-20"
    assert expiry_on_or_before(xsp, "2026-12-31", earliest="2026-11-21") == "2026-12-18"
    assert expiry_on_or_before(xsp, "2026-11-19", earliest="2026-11-01") is None
    assert expiry_on_or_before(xsp, pd.Timestamp("2026-10-31")) == "2026-10-16"
    assert expiries_between(xsp, "2026-10-01", "2026-12-18") == ["2026-10-16", "2026-11-20", "2026-12-18"]
    assert expiries_between(xsp, "2027-01-01", "2027-03-01") == []


def test_strike_selection(xsp):
    assert strike_nearest(xsp, "2026-11-20", "C", xsp.spot) == 770.0                 # at the money
    assert strike_nearest(xsp, "2026-11-20", "C", 1.05 * xsp.spot) == 805.0          # the 105% call (M4)
    assert strike_nearest(xsp, "2026-11-20", "C", 767.5) == 765.0                    # a tie goes to the lower
    assert strike_nearest(xsp, "2026-11-20", "C", 5000.0) == 830.0
    assert strike_nearest(xsp, "2026-11-27", "C", 770.0) is None                     # not a listed expiry
    assert strike_by_delta(xsp, "2026-11-20", "P", -0.20) == 730.0                   # delta -0.2001
    assert strike_by_delta(xsp, "2026-11-20", "P", 0.20) == 730.0                    # the sign does not matter
    assert strike_by_delta(xsp, "2026-11-20", "C", 0.20) == 805.0                    # 0.1803 beats 0.2216
    assert strike_by_delta(xsp, "2026-09-28", "P", -0.5) is None                     # only unmodelled rows


def test_liquidity_check_passes_tight_legs_with_open_interest(xsp):
    legs = [leg("XSP261218C00790000", "long"), leg("XSP261218C00800000", "short")]   # OI 1,008 and 707
    res = liquidity_check(xsp, legs, {})
    assert res["ok"] and res["reasons"] == []
    assert res["combo_mid"] == pytest.approx(11.745 - 8.045) and res["natural_width"] == pytest.approx(0.22)
    assert res["round_trip_frac"] == pytest.approx(0.22 / 3.70) and res["round_trip_cap"] == 0.10
    assert [p["ok"] for p in res["per_leg"]] == [True, True]
    assert res["per_leg"][0]["spread_frac"] == pytest.approx(0.11 / 11.745)


def test_liquidity_check_open_interest_rule(xsp):
    res = liquidity_check(xsp, LEGS, {"min_open_interest": 500})
    assert not res["ok"]
    assert res["reasons"] == [f"{LONG}: open interest 203 is below 500", f"{SHORT}: open interest 84 is below 500"]
    assert res["round_trip_frac"] == pytest.approx(WIDTH / MID)                     # the structure itself passes
    assert liquidity_check(xsp, LEGS, {"min_open_interest": 50})["ok"]


def test_liquidity_check_round_trip_and_expected_gain(xsp):
    wide = at(xsp, xsp.asof, {SHORT: 0.0})
    frame = wide.frame
    frame.loc[frame["occ"] == LONG, ["bid", "ask"]] = [16.0, 17.2]                  # 7.2% of mid: the leg passes
    frame.loc[frame["occ"] == SHORT, ["bid", "ask"]] = [3.2, 3.5]                   # 9.0% of mid: passes
    frame["mid"] = (frame["bid"] + frame["ask"]) / 2
    cfg_liq = {"min_open_interest": 0}
    res = liquidity_check(wide, LEGS, cfg_liq)                                      # width 1.5 on a 13.25 debit
    assert not res["ok"] and res["round_trip_frac"] == pytest.approx(1.5 / 13.25)
    assert res["reasons"] == ["round trip 11.3% of the debit is above 10%"]
    assert liquidity_check(wide, LEGS, cfg_liq, expected_gain=3.0)["ok"]            # gain >= 2 x 1.5: cap 20%
    assert not liquidity_check(wide, LEGS, cfg_liq, expected_gain=2.9)["ok"]


def test_liquidity_check_fails_closed_on_missing_quotes(xsp):
    res = liquidity_check(xsp, [leg(LONG, "long"), leg("XSP261120C00990000", "short")], {"min_open_interest": 0})
    assert not res["ok"] and res["round_trip_frac"] is None
    assert res["reasons"] == ["XSP261120C00990000: not listed in the XSP chain"]
    one_sided = liquidity_check(xsp, [leg("XSP260928C00770000", "long"), leg(LONG, "short")], {})
    assert any("no two-sided quote" in r for r in one_sided["reasons"]) and not one_sided["ok"]
    nan_oi = at(xsp, xsp.asof)
    nan_oi.frame["open_interest"] = np.nan
    assert "open interest unknown is below 500" in liquidity_check(nan_oi, LEGS, {})["reasons"][0]


# ============================================================================================ fill model


def test_combo_quote_and_order_prices(xsp):
    q = combo_quote(xsp, LEGS, "buy")
    assert q["mid"] == pytest.approx(MID) and q["natural_width"] == pytest.approx(WIDTH)
    assert [leg_q["occ"] for leg_q in q["legs"]] == [LONG, SHORT]
    assert order_prices(q, "buy", FILLS) == {"limit_price": pytest.approx(LIMIT), "max_price": pytest.approx(MAXIMUM)}
    assert order_prices(q, "sell", FILLS) == {"limit_price": pytest.approx(13.44), "max_price": pytest.approx(13.40)}
    assert model_price(q, "buy", 0.3) == pytest.approx(LIMIT)
    assert combo_quote(xsp, [leg("XSP260928C00770000", "long"), leg(LONG, "short")], "buy") is None   # bid 0


def test_a_close_is_never_priced_below_one_tick(xsp):
    """Both legs far out of the money: mid - 0.3 x natural width <= 0. A $0.00 limit can't be placed, so the close is
    priced at one tick ($0.01 where the quotes are in pennies, else $0.05), and the model price still has to reach it."""
    penny = {"mid": 0.0, "natural_width": 0.04, "legs": [{"occ": LONG, "bid": 0.01, "ask": 0.03, "mid": 0.02},
                                                          {"occ": SHORT, "bid": 0.01, "ask": 0.03, "mid": 0.02}]}
    assert model_price(penny, "sell", 0.3) == 0.0
    assert order_prices(penny, "sell", FILLS) == {"limit_price": 0.01, "max_price": 0.01}
    assert at_price_floor(penny, "sell", FILLS) == 0.01
    nickel = {"mid": 0.0, "natural_width": 0.10, "legs": [{"occ": LONG, "bid": 0.05, "ask": 0.10},
                                                           {"occ": SHORT, "bid": 0.05, "ask": 0.10}]}
    assert min_tick(nickel) == 0.05 and order_prices(nickel, "sell", FILLS) == {"limit_price": 0.05, "max_price": 0.05}
    assert min_tick({"mid": 0.01, "natural_width": 0.06}) == 0.05             # no leg quotes: the larger tick
    close = spread_order(2, side="sell", created=D1, limit=0.01, maximum=0.01)
    assert decide_fill(close, penny, FILLS)["filled"] is False               # the model's 0.00 doesn't reach 0.01
    q = combo_quote(xsp, LEGS, "sell")                                       # a normal close is untouched
    assert min_tick(q) == 0.01 and at_price_floor(q, "sell", FILLS) is None
    assert order_prices(q, "sell", FILLS) == {"limit_price": pytest.approx(13.44), "max_price": pytest.approx(13.40)}
    assert at_price_floor(penny, "buy", FILLS) is None and order_prices(penny, "buy", FILLS)["limit_price"] > 0


@pytest.mark.parametrize("shift, filled, attempt, price", [
    (0.00, True, "limit", 13.56),      # P = limit
    (-0.10, True, "limit", 13.46),     # P below the limit: filled at P, not at the limit
    (0.02, True, "reprice", 13.58),    # above the limit, within the stated maximum
    (0.04, True, "reprice", 13.60),    # exactly the stated maximum
    (0.05, False, None, 13.61),        # beyond it
])
def test_decide_fill_opening_order(xsp, shift, filled, attempt, price):
    quote = combo_quote(at(xsp, xsp.asof, {LONG: shift}), LEGS, "buy")
    d = decide_fill(spread_order(), quote, FILLS)
    assert (d["filled"], d["attempt"]) == (filled, attempt) and d["price"] == pytest.approx(price)
    assert filled or d["reason"] == "model price above the stated maximum"


@pytest.mark.parametrize("shift, filled, attempt, price", [
    (1.00, True, "limit", 14.44),
    (1.10, True, "limit", 14.54),      # above the limit credit: filled at P
    (0.98, True, "reprice", 14.42),    # below the limit, above the stated minimum
    (0.90, False, None, 14.34),        # below the stated minimum
])
def test_decide_fill_closing_order(xsp, shift, filled, attempt, price):
    close = spread_order(2, side="sell", created=D1, limit=14.44, maximum=14.40)
    d = decide_fill(close, combo_quote(at(xsp, xsp.asof, {LONG: shift}), LEGS, "sell"), FILLS)
    assert (d["filled"], d["attempt"]) == (filled, attempt) and d["price"] == pytest.approx(price)
    assert filled or d["reason"] == "model price below the stated minimum"


def test_decide_fill_fails_closed(xsp):
    assert decide_fill(spread_order(), None, FILLS) == {
        "filled": False, "price": None, "attempt": None, "reason": "no two-sided quote for every leg"}
    upside_down = {"mid": -0.2, "natural_width": 0.1, "legs": []}
    d = decide_fill(spread_order(), upside_down, FILLS)
    assert not d["filled"] and "not positive" in d["reason"]
    no_prices = spread_order(side="sell", created=D1, limit=None, maximum=None)
    assert not decide_fill(no_prices, combo_quote(xsp, LEGS, "sell"), FILLS)["filled"]


# ============================================================================================ broker spreads


@pytest.fixture
def broker(cfg) -> PaperBroker:
    return PaperBroker.new(cfg)


def open_spread(broker: PaperBroker, chain: OptionChain, order: OrderIntent | None = None, date: str = D1):
    broker.queue(order or spread_order())
    return broker.fill_spreads(date, "10:17", {"XSP": at(chain, f"{date}T10:17:00")})


def test_spread_lifecycle_open_mark_close(broker, xsp):
    cash0 = broker.cash("taxable")
    (fill,) = open_spread(broker, xsp)
    assert (fill.side, fill.qty, fill.multiplier, fill.fill_time, fill.slippage_bps, fill.model_version) == (
        "buy", 1, 100, "10:17", 0.0, "1.0")
    assert fill.price == pytest.approx(LIMIT) and fill.ref_price == pytest.approx(MID)
    assert fill.dollars == pytest.approx(LIMIT * 100) and fill.fill_date == D1 and fill.ticker == "XSP"
    assert [(q["occ"], q["position"], q["bid"], q["ask"]) for q in fill.legs] == [
        (LONG, "long", 16.72, 16.86), (SHORT, "short", 3.26, 3.32)]
    meta = broker.last_fill_meta[fill.intent_id]
    assert (meta["attempt"], meta["cancelled"], meta["realized_pnl"]) == ("limit", False, 0.0)
    assert meta["quote"]["natural_width"] == pytest.approx(WIDTH) and meta["model_price"] == pytest.approx(LIMIT)
    assert broker.cash("taxable") == pytest.approx(cash0 - LIMIT * 100)
    assert broker.pending() == [] and broker.positions() == []
    (s,) = broker.spreads()
    assert (s["key"], s["account"], s["module"], s["trade_id"], s["root"], s["contracts"]) == (
        KEY, "taxable", "M4", TRADE, "XSP", 1)
    assert (s["expiry"], s["opened"], s["mark"], s["mark_date"], s["width"]) == ("2026-11-20", D1, None, None, 35.0)
    assert s["entry_price"] == pytest.approx(LIMIT) and s["cost"] == pytest.approx(LIMIT * 100)
    assert s["legs"] == LEGS and broker.spreads(module="W8") == [] and broker.spreads(account="ira") == []

    marks = broker.mark_spreads(D1, {"XSP": at(xsp, f"{D1}T22:17:00", {LONG: 1.0})})
    assert marks == {KEY: pytest.approx(14.50)}
    assert broker.spreads()[0]["mark"] == pytest.approx(14.50) and broker.spreads()[0]["mark_date"] == D1

    broker.queue(spread_order(2, side="sell", created=D1, limit=14.44, maximum=14.40))
    (close,) = broker.fill_spreads(D2, "10:17", {"XSP": at(xsp, f"{D2}T10:17:00", {LONG: 1.0})})
    assert (close.side, close.qty) == ("sell", 1) and close.price == pytest.approx(14.44)
    assert close.dollars == pytest.approx(1444.0)
    meta = broker.last_fill_meta[close.intent_id]
    assert meta["realized_pnl"] == pytest.approx(1444.0 - LIMIT * 100) and meta["attempt"] == "limit"
    assert broker.cash("taxable") == pytest.approx(cash0 + 1444.0 - LIMIT * 100)
    assert broker.spreads() == [] and broker.pending() == []


def test_open_without_a_fill_is_cancelled(broker, xsp):
    cash0 = broker.cash("taxable")
    assert open_spread(broker, at(xsp, xsp.asof, {LONG: 0.05})) == []
    meta = broker.last_fill_meta[spread_order().intent_id]
    assert meta["cancelled"] and meta["attempt"] is None and meta["reason"] == "model price above the stated maximum"
    assert meta["model_price"] == pytest.approx(13.61) and meta["quote"]["mid"] == pytest.approx(13.55)
    (cancelled,) = broker.cancelled
    assert cancelled.meta["cancel_date"] == D1 and "above the stated maximum" in cancelled.meta["cancel_reason"]
    assert broker.pending() == [] and broker.spreads() == [] and broker.cash("taxable") == cash0


def test_close_without_a_fill_is_cancelled_and_the_spread_stays(broker, xsp):
    open_spread(broker, xsp)
    broker.queue(spread_order(2, side="sell", created=D1, limit=14.44, maximum=14.40))
    assert broker.fill_spreads(D2, "10:17", {"XSP": at(xsp, f"{D2}T10:17:00", {LONG: 0.90})}) == []
    meta = broker.last_fill_meta[spread_order(2, created=D1).intent_id]
    assert meta["cancelled"] and meta["reason"] == "model price below the stated minimum"
    assert [o.intent_id for o in broker.cancelled] == [spread_order(2, created=D1).intent_id]
    assert [s["key"] for s in broker.spreads()] == [KEY] and broker.pending() == []


def test_close_without_an_open_spread_and_open_without_cash_are_cancelled(broker, xsp):
    broker.queue(spread_order(1, side="sell", created=D0, limit=13.4, maximum=13.3))
    broker.queue(spread_order(2, contracts=50))                    # 50 x $1,356 is more than the $20,000
    assert broker.fill_spreads(D1, "10:17", {"XSP": at(xsp, f"{D1}T10:17:00")}) == []
    reasons = [o.meta["cancel_reason"] for o in broker.cancelled]
    assert reasons == ["no open spread to close", "not enough cash for the $67,800.00 debit"]
    assert broker.cash("taxable") == 20000.0


def test_spreads_need_level_3_options(broker):
    with pytest.raises(ValueError, match="options level"):
        broker.queue(spread_order(account="ira"))
    assert broker.pending() == []


@pytest.mark.parametrize("legs, side, match", [
    ([leg(LONG, "long"), leg("XSP261218C00800000", "short")], "buy", "vertical"),      # two expiries
    ([leg(LONG, "long"), leg("XSP261120P00805000", "short")], "buy", "vertical"),      # a call and a put
    ([leg(LONG, "long"), leg(LONG, "short")], "buy", "vertical"),                      # one strike
    ([leg(SHORT, "long"), leg(LONG, "short")], "buy", "debit"),                        # a credit call spread
    ([leg("XSP261120P00770000", "long"), leg("XSP261120P00730000", "short")], "buy", None),   # put debit: ok
    ([leg("SPY261120C00770000", "long"), leg("SPY261120C00805000", "short")], "buy", "one OCC root"),
    ([{**leg(LONG, "long"), "ratio": 2}, leg(SHORT, "short")], "buy", "ratio"),
    ([{"position": "long", "occ": "junk"}, leg(SHORT, "short")], "buy", "OCC"),
    ([leg(LONG, "long")], "buy", "one long and one short"),
    ([leg(SHORT, "long"), leg(LONG, "short")], "sell", None),                          # closes are not debit-checked
])
def test_queue_accepts_only_two_leg_verticals(broker, legs, side, match):
    order = spread_order(legs=legs, side=side, limit=1.0, maximum=1.2)
    if match is None:
        broker.queue(order)
        assert len(broker.pending()) == 1
    else:
        with pytest.raises(ValueError, match=match):
            broker.queue(order)


def test_fill_pending_ignores_spread_orders(broker):
    broker.queue(spread_order())
    assert broker.fill_pending(D1, {"XSP": 700.0}) == []
    assert broker.fill_pending(D2, {}) == []                       # no missed-open count, no cancellation
    (o,) = broker.pending()
    assert o.meta == {} and broker.cancelled == []


def test_fill_spreads_waits_for_its_session_and_a_chain_of_that_day(broker, xsp):
    broker.queue(spread_order())                                   # created on D0's close
    assert broker.fill_spreads(D0, "10:17", {"XSP": at(xsp, f"{D0}T10:17:00")}) == []   # not before its session
    assert broker.fill_spreads(D1, "10:17", {}) == []                                   # no chain: stays pending
    assert broker.fill_spreads(D1, "10:17", {"XSP": at(xsp, f"{D0}T15:00:00")}) == []   # quotes from another day
    assert broker.fill_spreads(D1, "10:17", {"SPX": at(xsp, f"{D1}T10:17:00")}) == []   # another root's chain
    assert len(broker.pending()) == 1 and broker.cancelled == [] and broker.last_fill_meta == {}


def test_spxw_orders_fill_from_the_spx_chain(broker, spx):
    legs = [leg("SPXW261120C07675000", "long"), leg("SPXW261120C07725000", "short")]
    broker.queue(spread_order(ticker="SPXW", legs=legs, limit=30.46, maximum=30.9))
    (fill,) = broker.fill_spreads(D1, "10:17", {"SPX": at(spx, f"{D1}T10:17:00")})
    assert fill.ticker == "SPXW" and fill.ref_price == pytest.approx(182.9 - 153.1)
    assert fill.price == pytest.approx(29.8 + 0.3 * 2.2) and broker.spreads()[0]["width"] == 50.0
    assert broker.mark_spreads(D1, {"SPX": at(spx, f"{D1}T22:17:00")}) == {KEY: pytest.approx(29.8)}


def test_spread_state_round_trip_and_older_states(cfg, broker, xsp):
    open_spread(broker, xsp)
    broker.mark_spreads(D1, {"XSP": at(xsp, f"{D1}T22:17:00")})
    broker.queue(spread_order(2, side="sell", created=D1, limit=13.4, maximum=13.3))
    state = broker.to_state()
    restored = PaperBroker.from_state(json.loads(json.dumps(state)), cfg)
    assert restored.to_state() == state and restored.spreads() == broker.spreads()
    chains = {"XSP": at(xsp, f"{D2}T10:17:00")}
    assert broker.fill_spreads(D2, "10:17", chains) == restored.fill_spreads(D2, "10:17", chains)
    assert broker.to_state() == restored.to_state()
    old = copy.deepcopy(state)
    del old["spreads"]                                             # a state saved before Phase B
    assert PaperBroker.from_state(old, cfg).spreads() == []
    state["spreads"][KEY]["mark"] = 0.0                            # to_state() is a copy
    assert broker.to_state() != state or broker.spreads() == []


def test_nav_includes_spreads_at_cost_then_at_their_mark(broker, xsp):
    open_spread(broker, xsp)
    m = broker.mark(D1, {})
    assert m["by_account"]["taxable"]["positions_value"] == pytest.approx(LIMIT * 100)   # never marked: cost
    assert m["nav"] == pytest.approx(100000.0)
    broker.mark_spreads(D1, {"XSP": at(xsp, f"{D1}T22:17:00", {LONG: 1.0})})
    m = broker.mark(D1, {})
    assert m["by_account"]["taxable"] == {"cash": pytest.approx(20000.0 - LIMIT * 100),
                                          "positions_value": pytest.approx(1450.0),
                                          "equity": pytest.approx(20000.0 - LIMIT * 100 + 1450.0)}
    assert m["nav"] == pytest.approx(100000.0 - LIMIT * 100 + 1450.0) and m["peak"] == m["nav"]
    assert broker.mark_spreads(D2, {"XSP": at(xsp, f"{D1}T22:17:00")}) == {}          # stale chain: last mark kept
    assert broker.spreads()[0]["mark"] == pytest.approx(14.50)


def test_settle_spread(broker, xsp):
    open_spread(broker, xsp)
    broker.queue(spread_order(2, side="sell", created=D1, limit=13.4, maximum=13.3))
    fill = broker.settle_spread(KEY, "2026-11-20", 40.0, "expiry_settlement")         # clamped to the 35 width
    assert (fill.intent_id, fill.side, fill.qty, fill.price, fill.multiplier) == (
        f"SETTLE-2026-11-20-{TRADE}", "sell", 1, 35.0, 100)
    assert fill.dollars == 3500.0 and fill.fill_date == "2026-11-20" and fill.fill_time is None
    meta = broker.last_fill_meta[fill.intent_id]
    assert meta["realized_pnl"] == pytest.approx(3500.0 - LIMIT * 100) and meta["reason"] == "expiry_settlement"
    assert meta["cancelled_orders"] == [spread_order(2, created=D1).intent_id]
    assert broker.spreads() == [] and broker.pending() == []
    assert broker.cash("taxable") == pytest.approx(20000.0 - LIMIT * 100 + 3500.0)
    with pytest.raises(KeyError):
        broker.settle_spread(KEY, "2026-11-20", 1.0, "expiry_settlement")


def test_cancel_pending(broker):
    broker.queue(spread_order())
    assert broker.cancel_pending("nope", D1, "x") is None
    got = broker.cancel_pending(spread_order().intent_id, D1, "missed")
    assert got.meta == {"cancel_reason": "missed", "cancel_date": D1} and broker.pending() == []


# ============================================================================================ providers


def test_fake_provider_serves_chains_in_order(xsp):
    first, second = at(xsp, f"{D1}T10:17:00"), at(xsp, f"{D1}T22:17:00")
    fake = FakeProvider(chains={"XSP": [DataError("CBOE down"), first, second], "SPX": second})
    with pytest.raises(DataError, match="CBOE down"):
        fake.option_chain("XSP")
    got = fake.option_chain("XSP")
    assert got.asof == first.asof
    got.frame.loc[0, "bid"] = -1.0                                  # callers get copies
    assert fake.option_chain("xsp").asof == second.asof and fake.option_chain("XSP").frame.loc[0, "bid"] != -1.0
    assert fake.option_chain("SPXW").asof == second.asof           # SPXW is served from the SPX chain
    with pytest.raises(DataError):
        fake.option_chain("DAL")
    assert fake.chain_calls == ["XSP", "XSP", "XSP", "XSP", "SPX", "DAL"]
    assert fake.sources["option_chain:XSP"] == "fake"


class Resp:
    """A requests-style response with raw bytes."""

    def __init__(self, status: int = 200, body: bytes = b"") -> None:
        self.status_code = status
        self.content = body
        self.text = body.decode("utf-8", "replace")

    def json(self) -> Any:
        return json.loads(self.content)


class Session:
    def __init__(self, handler) -> None:
        self.handler = handler
        self.calls: list[dict] = []

    def get(self, url, params=None, headers=None, timeout=None, allow_redirects=True):
        self.calls.append({"url": url, "headers": dict(headers or {}), "allow_redirects": allow_redirects})
        return self.handler(url)


def live(handler, now: str = "2026-09-29 14:17") -> tuple[LiveProvider, Session, list[float]]:
    session, sleeps = Session(handler), []
    provider = LiveProvider(load_config(), session=session, sleep=sleeps.append,
                            clock=lambda: pd.Timestamp(now, tz="UTC"))
    return provider, session, sleeps


def test_live_option_chain_reads_cboe_once_per_run():
    raw = (FIXTURES / "cboe_xsp_2026-09-28.json").read_bytes()
    provider, session, sleeps = live(lambda url: Resp(200, raw))
    chain = provider.option_chain("xsp")
    assert [c["url"] for c in session.calls] == ["https://cdn.cboe.com/api/global/delayed_quotes/options/_XSP.json"]
    assert session.calls[0]["headers"]["User-Agent"] == USER_AGENT and session.calls[0]["allow_redirects"]
    assert chain.source == "cboe" and chain.raw_sha256 == hashlib.sha256(raw).hexdigest() and len(chain.frame) == 72
    assert provider.sources["option_chain:XSP"] == "cboe" and sleeps == []
    chain.frame.loc[0, "bid"] = -1.0
    again = provider.option_chain("XSP")                            # memo: no second GET, and a fresh copy
    assert len(session.calls) == 1 and again.frame.loc[0, "bid"] != -1.0
    assert [cboe_option_symbol(r) for r in ("XSP", "SPX", "SPXW", "SPY", "DAL", "USO")] == [
        "_XSP", "_SPX", "_SPX", "SPY", "DAL", "USO"]


def test_live_option_chain_falls_back_to_yahoo_in_market_hours():
    provider, session, sleeps = live(lambda url: Resp(503, b"busy"), now="2026-09-29 14:20")   # 10:20 EDT
    asked: list[tuple[str, str]] = []
    provider._yf_option_expiries = lambda symbol: ["2026-10-16", "2026-11-20", "2027-12-17"]  # type: ignore
    frames = {"2026-10-16": yahoo_frame("2026-10-16", "C", [765.0], [10.9], [0.13]),
              "2026-11-20": yahoo_frame("2026-11-20", "C", [770.0, 805.0], [16.7, 3.2], [0.14, 0.12])}

    def option_frames(symbol, expiry):
        asked.append((symbol, expiry))
        return frames[expiry], frames[expiry].iloc[0:0], {"regularMarketPrice": 768.2}

    provider._yf_option_frames = option_frames  # type: ignore[method-assign]
    chain = provider.option_chain("XSP")
    assert chain.source == "yahoo" and chain.spot == 768.2 and chain.asof == "2026-09-29T10:20:00"
    assert asked == [("^XSP", "2026-10-16"), ("^XSP", "2026-11-20")]          # 2027-12-17 is beyond 200 days
    assert len(session.calls) == 4 and sleeps == [1.0, 2.0, 4.0]               # CBOE was retried first
    assert provider.sources["option_chain:XSP"] == "yahoo" and len(chain.frame) == 3


def test_live_option_chain_never_uses_yahoo_after_hours():
    provider, _, _ = live(lambda url: Resp(200, b"not json"), now="2026-09-29 02:30")   # 22:30 ET Monday

    def must_not_call(symbol):
        raise AssertionError("Yahoo must not be asked outside market hours")

    provider._yf_option_expiries = must_not_call  # type: ignore[method-assign]
    with pytest.raises(DataError, match="market hours only"):
        provider.option_chain("XSP")
    assert "option_chain:XSP" not in provider.sources


def stale_cboe(now: str = "2026-09-29 14:18") -> tuple[LiveProvider, Session, list[str]]:
    """A LiveProvider at `now` (UTC; 10:18 EDT) whose CBOE file parses but is stamped 14:12 UTC = 10:12 EDT (a CDN
    copy made before the 10:15 ET window), and whose Yahoo fallback quotes LEGS (combo mid 13.50, width 0.20)."""
    body = payload("xsp")
    body["timestamp"] = "2026-09-29 14:12:00"
    raw = json.dumps(body).encode()
    provider, session, _ = live(lambda url: Resp(200, raw), now=now)
    asked: list[str] = []

    def expiries(symbol):
        asked.append(symbol)
        return ["2026-11-20"]

    provider._yf_option_expiries = expiries  # type: ignore[method-assign]
    provider._yf_option_frames = lambda symbol, expiry: (  # type: ignore[method-assign]
        yahoo_frame(expiry, "C", [770.0, 805.0], [16.7, 3.2], [0.14, 0.12]), yahoo_frame(expiry, "C", [], [], []),
        {"regularMarketPrice": 768.2})
    return provider, session, asked


def test_live_option_chain_check_rejects_a_source_and_its_memo():
    provider, session, asked = stale_cboe()

    def window(chain):                                          # the options job's check: 10:15 ET or later
        return None if chain.asof[11:16] >= "10:15" else f"quotes stamped {chain.asof[11:16]} ET"

    stale = provider.option_chain("XSP")                        # no check: the CBOE file, memoised
    assert (stale.source, stale.asof, asked) == ("cboe", "2026-09-29T10:12:00", [])
    chain = provider.option_chain("XSP", check=window)          # the memo fails: CBOE is asked again, then Yahoo
    assert (chain.source, chain.asof, asked) == ("yahoo", "2026-09-29T10:18:00", ["^XSP"])
    assert len(session.calls) == 2 and provider.sources["option_chain:XSP"] == "yahoo"
    assert provider.option_chain("XSP", check=window).source == "yahoo"          # the memo holds Yahoo's now
    assert provider.option_chain("XSP").source == "yahoo" and len(session.calls) == 2 and asked == ["^XSP"]
    with pytest.raises(DataError, match=r"no option chain for XSP \(cboe: never; yahoo: never\)"):
        provider.option_chain("XSP", check=lambda c: "never")
    assert provider.option_chain("XSP").source == "cboe" and len(session.calls) == 4    # nothing rejected is kept


# ============================================================================================ snapshots


def big_chain(asof: str = f"{D1}T10:17:00", spot: float = 768.0) -> OptionChain:
    """A dense synthetic chain: daily expiries for 200 days, $1 strikes from 400 to 1,200."""
    expiries = [d.strftime("%Y-%m-%d") for d in pd.bdate_range("2026-09-30", periods=140)]
    grid = pd.MultiIndex.from_product([expiries, ["C", "P"], np.arange(400.0, 1201.0, 1.0)],
                                      names=["expiry", "right", "strike"]).to_frame(index=False)
    grid["root"] = "XSP"
    grid["occ"] = [occ_symbol("XSP", e, r, k) for e, r, k in zip(grid["expiry"], grid["right"], grid["strike"])]
    grid["bid"] = 1.0 + (grid["strike"] % 7) * 0.13
    grid["ask"] = grid["bid"] + 0.1
    grid["mid"] = grid["bid"] + 0.05
    grid["iv"], grid["delta"], grid["gamma"], grid["theta"], grid["vega"] = 0.15, 0.5, 0.01, -0.1, 1.0
    grid["open_interest"], grid["volume"], grid["last_trade_time"] = 700.0, 12.0, "2026-09-29T10:01:00"
    return OptionChain("XSP", asof, spot, "fake", grid[CHAIN_COLUMNS], raw_sha256="a" * 64)


def test_snapshot_sample_keeps_legs_and_a_thinned_surface():
    chain = big_chain()
    legs = {"XSP261120C00770000", "XSP270115C00770000", "XSP261001P00500000"}   # 2 outside the surface window
    rows = snapshots.sample(chain, legs, {})
    assert legs <= set(rows["occ"])                                 # legs are kept wherever they are
    surface = rows[~rows["occ"].isin(legs)]
    dte = (pd.to_datetime(surface["expiry"]) - pd.Timestamp(D1)).dt.days
    assert dte.between(20, 120).all() and (surface["strike"] - 768.0).abs().max() <= 0.25 * 768.0
    weeks = pd.to_datetime(pd.Series(surface["expiry"].unique())).dt.isocalendar()
    assert 1 < len(weeks) <= 12 and not weeks.duplicated(["year", "week"]).any()   # at most one expiry a week
    per_side = surface.groupby(["expiry", "right"]).size()
    assert per_side.max() == 21                                    # a 2.5% grid over +/-25%
    assert list(rows.columns) == CHAIN_COLUMNS
    legs_only = snapshots.sample(chain, legs, {}, surface=False)
    assert sorted(legs_only["occ"]) == sorted(legs)


def test_snapshot_store_fits_the_budget_and_round_trips(tmp_path):
    chain = big_chain()
    legs = {"XSP261120C00770000"}
    rec = snapshots.store(tmp_path, D1, chain, legs, {}, surface=True, budget=100_000)
    path = tmp_path / rec["path"]
    assert rec["path"] == f"options/{D1}/XSP-1017.csv.gz" and path.exists() and rec["bytes"] == path.stat().st_size
    assert rec["level"] == 0 and rec["surface"] and rec["bytes"] <= 100_000 and rec["rows_total"] == len(chain.frame)
    assert rec["file_sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert rec["legs_kept"] == ["XSP261120C00770000"] and rec["legs_missing"] == []
    back = snapshots.load_snapshot(path)
    assert (back.underlying, back.asof, back.spot, back.source, back.raw_sha256) == (
        "XSP", chain.asof, 768.0, "fake", "a" * 64)
    assert list(back.frame.columns) == CHAIN_COLUMNS and len(back.frame) == rec["rows"]
    assert back.quote("XSP261120C00770000")["bid"] == pytest.approx(chain.quote("XSP261120C00770000")["bid"])
    assert snapshots.encode(chain, snapshots.sample(chain, legs, {})) == path.read_bytes()   # deterministic bytes

    half = rec["bytes"] // 2
    small = snapshots.store(tmp_path, D2, chain, legs, {}, surface=True, budget=half)
    assert small["level"] > 0 and small["surface"] and small["bytes"] <= half and small["rows"] < rec["rows"]
    tiny = snapshots.store(tmp_path, "2026-10-01", chain, legs | {"XSP261120C00999500"}, {}, surface=True, budget=10)
    assert not tiny["surface"] and tiny["rows"] == 1 and tiny["legs_missing"] == ["XSP261120C00999500"]
    assert snapshots.day_bytes(tmp_path, D1) == rec["bytes"]
    assert snapshots.day_bytes(tmp_path, D1, exclude=("XSP-1017.csv.gz",)) == 0


# ============================================================================================ the options job


class Svc:
    """Stands in for Gmail, GitHub issues and healthchecks."""

    def __init__(self) -> None:
        self.pings: list[str] = []
        self.sent: list = []

    def make(self) -> pipeline.Services:
        def send(email, *, dry_run, outbox):
            self.sent.append(email)
            return {"sent": False, "reason": "dry run"}

        return pipeline.Services(send=send, create_issue=lambda *a, **k: None, healthcheck=self.pings.append,
                                 fetch_comments=lambda url: [])


@pytest.fixture
def hooks(monkeypatch) -> dict[str, list]:
    """Record M4's spread callbacks (the runner stubs are no-ops until the M4 build)."""
    calls: dict[str, list] = {"fill": [], "cancel": []}
    monkeypatch.setattr(runners.m4, "on_spread_fill", lambda run, fill, intent: calls["fill"].append((fill, intent)))
    monkeypatch.setattr(runners.m4, "on_spread_cancel",
                        lambda run, intent, reason: calls["cancel"].append((intent, reason)))
    return calls


def book(tmp_path: Path, cfg, orders: list[OrderIntent] = (), *, created: str = D0) -> Path:
    """A fresh state whose broker holds `orders`, as if the evening run had emitted them."""
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=created)
    st = load_state(state_dir / "state.json")
    broker = PaperBroker.from_state(st["broker"], cfg)
    for o in orders:
        broker.queue(o)
    st["broker"] = broker.to_state()
    save_state(state_dir / "state.json", st)
    return state_dir


def add_orders(cfg, state_dir: Path, orders: list[OrderIntent]) -> None:
    st = load_state(state_dir / "state.json")
    broker = PaperBroker.from_state(st["broker"], cfg)
    for o in orders:
        broker.queue(o)
    st["broker"] = broker.to_state()
    save_state(state_dir / "state.json", st)


def records(state_dir: Path, record_type: str | None = None) -> list[dict]:
    return [r for r in Ledger(state_dir / "ledger.jsonl").records(record_type)]


def state_of(state_dir: Path) -> dict:
    return load_state(state_dir / "state.json")


def test_run_options_fills_logs_and_calls_the_runner(cfg, tmp_path, hooks, xsp):
    state_dir = book(tmp_path, cfg, [spread_order()])
    svc = Svc()
    res = run_options(cfg, FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00")}), state_dir, date=D1,
                      services=svc.make())
    assert res.status == "ok" and svc.pings == ["start", "success"] and svc.sent == []
    assert [f["intent_id"] for f in res.fills] == [spread_order().intent_id]
    ((fill, intent),) = hooks["fill"]
    assert fill.price == pytest.approx(LIMIT) and intent.intent_id == fill.intent_id and intent.side == "buy"
    assert hooks["cancel"] == []
    st = state_of(state_dir)
    assert st["broker"]["pending"] == [] and st["runs"][f"options:{D1}"]["status"] == "ok"
    spread = st["broker"]["spreads"][KEY]
    assert spread["mark"] == pytest.approx(MID) and spread["mark_date"] == D1          # marked at the 10:17 mid
    assert st["broker"]["cash"]["taxable"] == pytest.approx(20000.0 - LIMIT * 100)
    assert st["fills"][-1]["order_type"] == "spread_limit" and st["fills"][-1]["natural_width"] == pytest.approx(0.2)
    snap_file = state_dir / "options" / D1 / "XSP-1017.csv.gz"
    stored = snapshots.load_snapshot(snap_file)
    assert set(stored.frame["occ"]) == {LONG, SHORT}                                   # legs only: no runner asked
    (snap,) = [r["payload"] for r in records(state_dir, "snapshot")]
    assert snap["raw_sha256"] == "f" * 64 and snap["file_sha256"] == hashlib.sha256(snap_file.read_bytes()).hexdigest()
    assert snap["needed_for"] == ["orders"] and snap["path"] == f"options/{D1}/XSP-1017.csv.gz"
    fill_rec = [r["payload"] for r in records(state_dir, "fill")]
    assert len(fill_rec) == 1 and fill_rec[0]["attempt"] == "limit" and fill_rec[0]["fill_time"] == "10:17"
    assert [r["payload"]["kind"] for r in records(state_dir, "mark")] == ["spreads"]
    assert Ledger(state_dir / "ledger.jsonl").verify()[0]
    text = pipeline.status_text(cfg, state_dir)
    assert "spread taxable XSP [M4]: 1 x +770C/-805C 2026-11-20, paid 13.56 ($1,356.00), mark 13.50" in text


def test_run_options_is_idempotent_and_dry_runs_change_nothing(cfg, tmp_path, hooks, xsp):
    state_dir = book(tmp_path, cfg, [spread_order()])
    provider = FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00")})
    before = [(state_dir / n).read_bytes() for n in ("state.json", "ledger.jsonl")]
    svc = Svc()
    dry = run_options(cfg, provider, state_dir, date=D1, dry_run=True, services=svc.make())
    assert dry.status == "ok" and dry.dry_run and len(dry.fills) == 1 and svc.pings == []
    assert [(state_dir / n).read_bytes() for n in ("state.json", "ledger.jsonl")] == before
    assert not (state_dir / "options").exists()
    assert run_options(cfg, provider, state_dir, date=D1, services=svc.make()).status == "ok"
    size = (state_dir / "ledger.jsonl").stat().st_size
    again = run_options(cfg, provider, state_dir, date=D1, services=svc.make())
    assert again.status == "already_done" and (state_dir / "ledger.jsonl").stat().st_size == size
    assert len(hooks["fill"]) == 2                                  # the dry run and the real run


def test_run_options_force_reruns_from_the_pre_run_state(cfg, tmp_path, hooks, xsp):
    state_dir = book(tmp_path, cfg, [spread_order()])
    provider = FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00")})
    run_options(cfg, provider, state_dir, date=D1, services=Svc().make())
    res = run_options(cfg, provider, state_dir, date=D1, force=True, services=Svc().make())
    assert res.status == "ok" and len(res.fills) == 1
    st = state_of(state_dir)
    assert list(st["broker"]["spreads"]) == [KEY]
    assert st["broker"]["cash"]["taxable"] == pytest.approx(20000.0 - LIMIT * 100)     # debited once
    assert any("superseded_seq" in r["payload"] for r in records(state_dir, "correction"))


def test_run_options_no_fill_cancels_and_tells_the_runner(cfg, tmp_path, hooks, xsp):
    state_dir = book(tmp_path, cfg, [spread_order()])
    res = run_options(cfg, FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00", {LONG: 0.05})}), state_dir,
                      date=D1, services=Svc().make())
    assert res.status == "ok" and res.fills == [] and hooks["fill"] == []
    ((intent, reason),) = hooks["cancel"]
    assert intent.intent_id == spread_order().intent_id and reason == "model price above the stated maximum"
    st = state_of(state_dir)
    assert st["broker"]["pending"] == [] and st["broker"]["spreads"] == {}
    assert st["broker"]["cancelled"][0]["meta"]["cancel_date"] == D1
    (rec,) = [r["payload"] for r in records(state_dir, "fill")]
    assert rec["type"] == "no_fill" and rec["model_price"] == pytest.approx(13.61) and not rec["filled"]
    assert any("entry skipped" in n for n in res.notes) and not [a for a in st["alerts"] if a["kind"] == "fill"]


def test_run_options_close_fill_and_close_no_fill(cfg, tmp_path, hooks, xsp):
    state_dir = book(tmp_path, cfg, [spread_order()])
    run_options(cfg, FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00")}), state_dir, date=D1,
                services=Svc().make())
    add_orders(cfg, state_dir, [spread_order(2, side="sell", created=D1, limit=14.44, maximum=14.40)])
    res = run_options(cfg, FakeProvider(chains={"XSP": at(xsp, f"{D2}T10:17:00", {LONG: 0.90})}), state_dir,
                      date=D2, services=Svc().make())
    assert res.status == "ok" and res.fills == []
    st = state_of(state_dir)
    assert list(st["broker"]["spreads"]) == [KEY]                   # still open: the module re-issues the exit
    assert any(a["kind"] == "fill" and "re-issued tonight" in a["message"] for a in st["alerts"])
    assert hooks["cancel"][-1][0].side == "sell"
    add_orders(cfg, state_dir, [spread_order(3, side="sell", created=D2, limit=14.44, maximum=14.40)])
    res = run_options(cfg, FakeProvider(chains={"XSP": at(xsp, "2026-10-01T10:17:00", {LONG: 1.0})}), state_dir,
                      date="2026-10-01", services=Svc().make())
    ((close, intent),) = [c for c in hooks["fill"] if c[0].side == "sell"]
    assert close.price == pytest.approx(14.44) and intent.intent_id == spread_order(3, created=D2).intent_id
    st = state_of(state_dir)
    assert st["broker"]["spreads"] == {}
    assert st["broker"]["cash"]["taxable"] == pytest.approx(20000.0 - LIMIT * 100 + 1444.0)
    (rec,) = [r["payload"] for r in records(state_dir, "fill") if r["payload"].get("side") == "sell"
              and r["payload"].get("type") != "no_fill"]
    assert rec["realized_pnl"] == pytest.approx(1444.0 - LIMIT * 100)


def test_run_options_missing_quotes_are_retryable(cfg, tmp_path, hooks, xsp):
    state_dir = book(tmp_path, cfg, [spread_order()])
    provider = FakeProvider(chains={"XSP": [DataError("CBOE down"), at(xsp, f"{D1}T09:40:00"),
                                            at(xsp, f"{D1}T11:17:00")]})
    svc = Svc()
    first = run_options(cfg, provider, state_dir, date=D1, services=svc.make())
    assert first.status == "data_missing" and svc.pings == ["start", "fail"]
    st = state_of(state_dir)
    assert len(st["broker"]["pending"]) == 1 and st["runs"][f"options:{D1}"]["status"] == "data_missing"
    assert any(a["kind"] == "data" and "CBOE down" in a["message"] for a in st["alerts"])
    second = run_options(cfg, provider, state_dir, date=D1, services=svc.make())       # 09:40: before the window
    assert second.status == "data_missing" and any("outside the 10:15-16:00 ET window" in n for n in second.notes)
    third = run_options(cfg, provider, state_dir, date=D1, services=svc.make())
    assert third.status == "ok" and len(hooks["fill"]) == 1 and hooks["fill"][0][0].fill_time == "11:17"
    checks = [r["payload"] for r in records(state_dir, "signal") if r["payload"].get("check") == "option_chain"]
    assert [c["ok"] for c in checks] == [False, False]


def test_run_options_falls_back_to_yahoo_when_the_cboe_file_is_stale(cfg, tmp_path, hooks):
    """A CBOE file stamped before the window must not end the run as data_missing while Yahoo has market-hours
    quotes: the job's window check reaches LiveProvider, which then tries its next source."""
    state_dir = book(tmp_path, cfg, [spread_order()])
    provider, session, asked = stale_cboe()
    res = run_options(cfg, provider, state_dir, date=D1, services=Svc().make())
    assert res.status == "ok" and asked == ["^XSP"] and len(session.calls) == 1
    ((fill, intent),) = hooks["fill"]
    assert intent.intent_id == spread_order().intent_id and fill.fill_time == "10:18"
    assert fill.price == pytest.approx(LIMIT)
    (snap,) = [r["payload"] for r in records(state_dir, "snapshot")]
    assert (snap["source"], snap["asof"]) == ("yahoo", f"{D1}T10:18:00")


def test_options_workflow_retries_in_every_slot_but_the_last(cfg):
    """Exit code 3 (no usable quotes yet) is a warning in every slot but the last, and each season has a retry slot
    inside the snapshot window: in winter the 14:17 UTC slot is 09:17 EST, too early, so 16:17 UTC is the retry."""
    wf = yaml.safe_load((Path(__file__).parents[1] / ".github" / "workflows" / "options.yml").read_text())
    triggers = wf.get("on", wf.get(True))                            # YAML 1.1 reads a bare `on` as True
    crons = [s["cron"] for s in triggers["schedule"]]
    assert crons == ["17 14 * * 1-5", "17 15 * * 1-5", "17 16 * * 1-5"]
    early = wf["jobs"]["options"]["env"]["EARLY_SLOT"]
    assert [f"'{c}'" in early for c in crons] == [True, True, False]
    start, end = cfg.constitution["options"]["snapshot_window_et"]
    for utc_offset in (4, 5):                                        # EDT (summer), EST (winter)
        et = [f"{int(c.split()[1]) - utc_offset:02d}:{c.split()[0]}" for c in crons]
        assert sum(start <= t <= end for t in et) >= 2, et


def test_run_options_cancels_orders_whose_session_passed(cfg, tmp_path, hooks):
    state_dir = book(tmp_path, cfg, [spread_order()])               # its session was D1; the job runs on D2
    provider = FakeProvider()
    res = run_options(cfg, provider, state_dir, date=D2, services=Svc().make())
    assert res.status == "ok" and provider.chain_calls == []        # nothing left to quote
    ((intent, reason),) = hooks["cancel"]
    assert intent.intent_id == spread_order().intent_id and f"its session {D1} passed" in reason
    st = state_of(state_dir)
    assert st["broker"]["pending"] == [] and any(a["kind"] == "fill" for a in st["alerts"])


def test_scheduled_runs_check_the_clock(cfg, tmp_path, hooks, xsp, monkeypatch):
    state_dir = book(tmp_path, cfg, [spread_order()])
    before = (state_dir / "state.json").read_bytes()
    provider = FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00")})
    for hhmm, status in (((9, 17), "too_early"), ((16, 30), "too_late")):
        monkeypatch.setattr(market_calendar, "now_et", lambda hhmm=hhmm: datetime(2026, 9, 29, *hhmm, tzinfo=ET))
        res = run_options(cfg, provider, state_dir, services=Svc().make())
        assert (res.status, res.date) == (status, D1) and "outside the 10:15-16:00 ET" in res.notes[0]
        assert (state_dir / "state.json").read_bytes() == before and provider.chain_calls == []
    monkeypatch.setattr(market_calendar, "now_et", lambda: datetime(2026, 9, 29, 10, 17, tzinfo=ET))
    assert run_options(cfg, provider, state_dir, services=Svc().make()).status == "ok"
    assert len(hooks["fill"]) == 1


def test_run_options_disabled_and_holidays(cfg, tmp_path, hooks):
    state_dir = book(tmp_path, cfg)
    off = dataclasses.replace(cfg, constitution={**cfg.constitution,
                                                 "options": {**cfg.constitution["options"], "enabled": False}})
    before = (state_dir / "state.json").read_bytes()
    assert run_options(off, FakeProvider(), state_dir, date=D1, services=Svc().make()).status == "disabled"
    assert (state_dir / "state.json").read_bytes() == before
    thanksgiving = run_options(cfg, FakeProvider(), state_dir, date="2026-11-26", services=Svc().make())
    assert thanksgiving.status == "no_session"


def test_run_options_runner_hooks_and_guards(cfg, tmp_path, hooks, xsp, spx, monkeypatch):
    state_dir = book(tmp_path, cfg, [spread_order()])
    seen: list = []
    monkeypatch.setattr(runners.m4, "roots_needed", lambda run: {"XSP"})
    monkeypatch.setattr(runners.option_shadows, "roots_needed", lambda run: {"SPXW"})
    monkeypatch.setattr(runners.m4, "options_job", lambda run, chains: seen.append(("m4", sorted(chains))))

    def broken(run, chains):
        seen.append(("option_shadows", sorted(chains)))
        raise RuntimeError("shadow bug")

    monkeypatch.setattr(runners.option_shadows, "options_job", broken)

    def bad_roots(run):
        raise KeyError("macro bug")

    monkeypatch.setattr(runners.macro, "roots_needed", bad_roots)
    provider = FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00"), "SPX": at(spx, f"{D1}T10:17:05")})
    res = run_options(cfg, provider, state_dir, date=D1, services=Svc().make())
    assert res.status == "ok" and len(hooks["fill"]) == 1           # fills first, then the runners
    assert seen == [("m4", ["SPX", "XSP"]), ("option_shadows", ["SPX", "XSP"])]
    kinds = {a["kind"]: a["message"] for a in state_of(state_dir)["alerts"]}
    assert "shadow bug" in kinds["shadow"] and "macro.roots_needed failed" in kinds["runner"]
    snaps = {r["payload"]["root"]: r["payload"] for r in records(state_dir, "snapshot")}
    assert snaps["XSP"]["surface"] and snaps["SPX"]["surface"]      # runners asked for both: surface samples
    assert snaps["XSP"]["needed_for"] == ["orders", "runner:m4"] and snaps["SPX"]["needed_for"] == [
        "runner:option_shadows"]
    assert sum(s["bytes"] for s in snaps.values()) <= 100_000
    assert LONG in set(snapshots.load_snapshot(state_dir / snaps["XSP"]["path"]).frame["occ"])


# ============================================================================================ the daily run


def market(chains: dict | None = None) -> FakeProvider:
    """A quiet synthetic market for daily runs: a smooth uptrend (no M1 dip, no W10 shock), VIX 15, BTC falling."""
    sessions = pd.DatetimeIndex([d for d in pd.date_range("2025-06-02", "2026-10-30", freq="B") if is_trading_day(d)])
    close = pd.Series(700.0 * np.exp(np.linspace(0.0, 0.10, len(sessions))), index=sessions)

    def bars(c: pd.Series) -> pd.DataFrame:
        return pd.DataFrame({"open": c * 0.999, "high": c * 1.002, "low": c * 0.997, "close": c, "adj_close": c,
                             "volume": 1e6})

    vix = pd.Series(15.0, index=sessions)
    days = pd.date_range("2024-01-01", "2026-10-30", freq="D")
    btc = pd.Series(90_000.0 * np.exp(np.linspace(0.0, -0.5, len(days))), index=days)
    return FakeProvider(bars={"SPY": bars(close), "^GSPC": bars(close * 10.0), "^VIX": bars(vix)}, vix=vix, btc=btc,
                        chains=chains or {})


@pytest.fixture(scope="module")
def daily_cfg(cfg):
    """The real config with M2 and the Phase B shadow books off, and the gems rules' universes empty, so the
    synthetic market needs no trend-book legs and no VIX3M, crypto, EDGAR, macro, closed-end fund or trust data."""
    modules = {**cfg.constitution["modules"], "M2": {**cfg.constitution["modules"]["M2"], "enabled": False}}
    shadow = {name: ({**book, "enabled": False} if name not in ("ST1B", "W10") else book)
              for name, book in cfg.constitution["shadow"].items()}
    growth = cfg.constitution["growth"]
    g3 = growth["sleeves"]["G3"]
    rules = {name: ({**rule, "universe": []} if isinstance(rule, dict) and "universe" in rule else rule)
             for name, rule in g3["rules"].items()}
    growth = {**growth, "sleeves": {**growth["sleeves"], "G3": {**g3, "rules": rules}}}
    return dataclasses.replace(cfg, constitution={**cfg.constitution, "modules": modules, "shadow": shadow,
                                                  "growth": growth})


def test_daily_run_marks_spreads_and_nav_includes_them(daily_cfg, tmp_path, hooks, xsp):
    cfg = daily_cfg
    state_dir = book(tmp_path, cfg, [spread_order()])
    run_options(cfg, FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00")}), state_dir, date=D1,
                services=Svc().make())
    daily = pipeline.run_daily(cfg, market({"XSP": at(xsp, f"{D1}T22:17:00", {LONG: 1.0})}), state_dir, date=D1,
                               services=Svc().make())
    assert daily.status == "ok", daily.notes
    st = state_of(state_dir)
    spread = st["broker"]["spreads"][KEY]
    assert spread["mark"] == pytest.approx(14.50) and spread["mark_date"] == D1
    cash = sum(st["broker"]["cash"].values())
    assert st["marks"][-1]["nav"] == pytest.approx(cash + 1450.0) and daily.nav == pytest.approx(cash + 1450.0)
    marks = [r["payload"] for r in records(state_dir, "mark") if r["payload"].get("kind") == "spreads"]
    assert marks[-1]["marks"] == {KEY: pytest.approx(14.50)} and marks[-1]["kept"] == {}
    assert (state_dir / "options" / D1 / "XSP-2217.csv.gz").exists()
    assert not [a for a in st["alerts"] if a["kind"] in ("data", "expiry", "fill")]


def test_daily_run_keeps_the_last_mark_without_a_closing_chain(daily_cfg, tmp_path, hooks, xsp):
    cfg = daily_cfg
    state_dir = book(tmp_path, cfg, [spread_order()])
    run_options(cfg, FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00")}), state_dir, date=D1,
                services=Svc().make())
    daily = pipeline.run_daily(cfg, market({"XSP": at(xsp, f"{D1}T15:30:00")}), state_dir, date=D1,
                               services=Svc().make())                 # an intraday chain is not a close
    assert daily.status == "ok"
    assert any("keep their last marks" in n and "before the 16:00 ET close" in n for n in daily.notes)
    st = state_of(state_dir)
    assert st["broker"]["spreads"][KEY]["mark"] == pytest.approx(MID)                  # the 10:17 mark
    assert st["marks"][-1]["nav"] == pytest.approx(sum(st["broker"]["cash"].values()) + MID * 100)


def test_daily_run_skips_pending_spread_orders_at_the_open(daily_cfg, tmp_path):
    state_dir = book(tmp_path, daily_cfg, [spread_order()])         # the options job never ran on D1
    provider = market()
    daily = pipeline.run_daily(daily_cfg, provider, state_dir, date=D1, services=Svc().make())
    assert daily.status == "ok" and "XSP" not in provider.sources.get("daily_bars:XSP", "")
    assert [o["intent_id"] for o in state_of(state_dir)["broker"]["pending"]] == [spread_order().intent_id]
    assert "pending spread open XSP 1 x +770C/-805C 2026-11-20 limit 13.56, stated max 13.60 [M4]" in \
        pipeline.status_text(daily_cfg, state_dir)


def test_daily_run_settles_a_spread_still_open_at_expiry(daily_cfg, tmp_path, hooks, xsp):
    cfg = daily_cfg
    legs = [leg("XSP261016C00765000", "long"), leg("XSP261016C00770000", "short")]   # mid 3.00, width 0.26
    state_dir = book(tmp_path, cfg, [spread_order(legs=legs, limit=3.078, maximum=3.13)])
    run_options(cfg, FakeProvider(chains={"XSP": at(xsp, f"{D1}T10:17:00")}), state_dir, date=D1,
                services=Svc().make())
    add_orders(cfg, state_dir, [spread_order(2, side="sell", created="2026-10-15", legs=legs, limit=2.0,
                                             maximum=1.9)])            # an exit that never got its fill
    provider = market()
    expiry = "2026-10-16"
    daily = pipeline.run_daily(cfg, provider, state_dir, date=expiry, services=Svc().make())
    assert daily.status == "ok", daily.notes
    close = float(provider.daily_bars("^GSPC").at[pd.Timestamp(expiry), "close"]) / 10.0
    value = intrinsic_value(legs, close)
    assert value == pytest.approx(min(max(close - 765.0, 0.0), 5.0))
    st = state_of(state_dir)
    assert st["broker"]["spreads"] == {} and st["broker"]["pending"] == []
    assert st["broker"]["cancelled"][-1]["meta"]["cancel_reason"] == "the spread was settled (expiry_settlement)"
    assert any(a["kind"] == "expiry" and "still open at its 2026-10-16 expiry" in a["message"] for a in st["alerts"])
    ((fill, intent),) = [c for c in hooks["fill"] if c[0].side == "sell"]
    assert intent.reason == "expiry_settlement" and fill.intent_id == f"SETTLE-{expiry}-{TRADE}"
    assert fill.price == pytest.approx(value) and fill.fill_date == expiry and fill.dollars == pytest.approx(value * 100)
    (rec,) = [r["payload"] for r in records(state_dir, "fill") if r["payload"].get("settled")]
    assert rec["reason"] == "expiry_settlement" and rec["settlement_ticker"] == "^GSPC"
    assert rec["underlying_close"] == pytest.approx(close * 10.0)
    assert rec["realized_pnl"] == pytest.approx(value * 100 - 307.8)          # opened at 3.078 a share
    nav = st["marks"][-1]["nav"]                                               # settled before the book was marked
    assert nav == pytest.approx(sum(st["broker"]["cash"].values()))


def test_intrinsic_value():
    call_spread = [leg("XSP261016C00765000", "long"), leg("XSP261016C00770000", "short")]
    assert [intrinsic_value(call_spread, s) for s in (760.0, 767.5, 780.0)] == [0.0, 2.5, 5.0]
    put_spread = [leg("XSP261120P00770000", "long"), leg("XSP261120P00730000", "short")]
    assert [intrinsic_value(put_spread, s) for s in (780.0, 750.0, 700.0)] == [0.0, 20.0, 40.0]


# ============================================================================================ live smoke test

network = pytest.mark.skipif(os.environ.get("RUN_NETWORK_TESTS") != "1",
                             reason="live smoke test: set RUN_NETWORK_TESTS=1 to reach CBOE")


@network
@pytest.mark.parametrize("root, roots", [("XSP", {"XSP"}), ("SPY", {"SPY"})])
def test_live_cboe_option_chain(root, roots):
    provider = LiveProvider(load_config())
    chain = provider.option_chain(root)
    assert chain.source == "cboe" and provider.sources[f"option_chain:{root}"] == "cboe"
    assert len(chain.frame) > 1000 and chain.spot > 0 and set(chain.frame["root"]) == roots
    assert chain.raw_sha256 and pd.Timestamp(chain.asof).year >= 2026
    near = expiry_on_or_before(chain, (pd.Timestamp(chain.asof) + pd.Timedelta(days=60)).strftime("%Y-%m-%d"),
                               earliest=(pd.Timestamp(chain.asof) + pd.Timedelta(days=40)).strftime("%Y-%m-%d"))
    assert near is not None and strike_nearest(chain, near, "C", chain.spot) is not None
