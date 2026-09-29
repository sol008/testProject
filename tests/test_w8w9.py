"""W8 / W9 macro-event call spreads: pure rules, macro data, and the runner end to end (offline).

The runner tests drive real `pipeline.Run` objects on a temporary state with hand-built option chains, a fake
prediction-market adapter, a fake earnings source and a fake veto. `risk.admit_premium` (M4 build) and
`options.chain.liquidity_check` (options build) are built in parallel, so they are monkeypatched here; the tests at
the bottom exercise the real ones once they exist (skipped until then).
"""
from __future__ import annotations

import inspect
import json
import math
import re
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from traderec import emails, forecasts, pipeline, risk, validator
from traderec.config import load_config
from traderec.data import FakeProvider
from traderec.data.macro_data import (MacroData, combine_earnings, contango, contract_symbol, day_move, domain_allowed,
                                      front_contracts, front_month, load_supply_input, parse_nasdaq_earnings,
                                      parse_yahoo_calendar, roll_yield, supply_loss_check)
from traderec.data.prediction_markets import Http
from traderec.data.providers import DataError
from traderec.email_text import w8w9 as w8w9_text
from traderec.market_calendar import is_trading_day
from traderec.modules import w8w9_macro as rules
from traderec.options import chain as chain_mod
from traderec.options.chain import CHAIN_COLUMNS, OptionChain, occ_symbol
from traderec.runners import macro
from traderec.types import Fill, Recommendation

FIX = Path(__file__).parent / "fixtures" / "w8w9"
SESSIONS = pd.DatetimeIndex([d for d in pd.date_range("2026-06-01", "2027-03-31", freq="B") if is_trading_day(d)])
DAY1, DAY2 = "2026-10-14", "2026-10-15"          # snapshot night, de-escalation night (entry session 16 Oct)
RELEASES = {"FOMC": ["2026-10-28", "2026-12-09"], "CPI": ["2026-10-14", "2026-11-10", "2026-12-10"],
            "NFP": ["2026-11-06", "2026-12-04"]}
CITES = ["https://whitehouse.gov/briefings-statements/x", "https://state.gov/releases/y"]


# ================================================================================================
# pure rules
# ================================================================================================

def test_sessions_and_time_stop() -> None:
    assert rules.sessions_after("2026-10-16", 0) == "2026-10-16"
    assert rules.time_stop_date("2026-10-16", 20) == "2026-11-13"            # 20 sessions later (session 21)
    assert rules.sessions_held("2026-10-16", "2026-10-16") == 1
    assert rules.sessions_held("2026-10-16", "2026-11-12") == 20
    assert rules.sessions_held("2026-10-16", "2026-10-15") == 0


def test_move_leg() -> None:
    ok = lambda r: {"ok": True, "ret": r}  # noqa: E731
    bad = {"ok": False, "ret": None}
    assert rules.move_leg({"BZZ26": ok(-0.07), "BNO": ok(-0.05)}, -0.06)["fired"]
    assert rules.move_leg({"BZZ26": bad, "BNO": ok(-0.065)}, -0.06)["by"] == ["BNO"]
    dis = rules.move_leg({"BZZ26": ok(-0.07), "BNO": ok(0.01)}, -0.06)
    assert dis["disagree"] and not dis["fired"]
    assert not rules.move_leg({"BZZ26": ok(-0.03), "BNO": ok(-0.02)}, -0.06)["fired"]
    assert rules.move_leg({"a": bad, "b": bad}, -0.06)["reason"] == "no valid price move"
    assert rules.move_leg({"CLX26": ok(0.06), "BZZ26": ok(0.02)}, 0.05)["fired"]
    assert rules.move_leg({"CLX26": ok(0.06), "BZZ26": ok(-0.01)}, 0.05)["disagree"]


def test_pm_leg() -> None:
    prev = {"market_id": "1", "price": 0.55, "asof": DAY1, "question": "Q?"}
    now = lambda y: {"yes": y, "resolved": False, "problem": None}  # noqa: E731
    assert rules.pm_leg(prev, now(0.70), DAY1, 0.15, 0.75)["fired"]                         # +15 points
    through = rules.pm_leg({**prev, "price": 0.70}, now(0.76), DAY1, 0.15, 0.75)
    assert through["fired"] and through["through"]
    assert not rules.pm_leg(prev, now(0.65), DAY1, 0.15, 0.75)["fired"]
    assert not rules.pm_leg(prev, now(0.90), "2026-10-13", 0.15, 0.75)["fired"]          # stale snapshot
    assert not rules.pm_leg(None, now(0.90), DAY1, 0.15, 0.75)["fired"]
    assert rules.pm_leg(prev, {"resolved": True, "outcome": "yes"}, DAY1, 0.15, 0.75)["price"] == 1.0
    assert not rules.pm_leg(prev, {"yes": None, "problem": "x"}, DAY1, 0.15, 0.75)["fired"]
    assert not rules.pm_leg(prev, None, DAY1, 0.15, 0.75)["fired"]


def test_release_ban() -> None:
    assert not rules.release_ban("2026-10-16", RELEASES, 5)["banned"]                      # window 16-23 Oct
    ban = rules.release_ban("2026-10-21", RELEASES, 5)                                     # FOMC 28 Oct inside
    assert ban["banned"] and ban["hits"] == [["FOMC", "2026-10-28"]]
    assert rules.release_ban("2026-10-14", RELEASES, 5)["hits"] == [["CPI", "2026-10-14"]]   # the entry day counts


def test_discretionary_pause() -> None:
    cfg = load_config().module("W8")["circuit_breakers"]
    mark = lambda d, nav, dd=0.0: {"date": d, "nav": nav, "drawdown": dd}  # noqa: E731
    assert not rules.discretionary_pause([], cfg, 0.2)["paused"]
    assert rules.discretionary_pause([mark("a", 100, 0.21)], cfg, 0.2)["paused"]
    assert rules.discretionary_pause([mark("a", 100), mark("b", 97.9)], cfg, 0.2)["paused"]       # -2.1% day
    week = [mark(str(i), nav) for i, nav in enumerate([100, 99, 98.5, 98, 97, 95.9, 96, 96.2, 96.5])]
    assert rules.discretionary_pause(week, cfg, 0.2)["paused"]                  # -4.1% week, 3 sessions ago
    assert not rules.discretionary_pause(week + [mark("x", 97)] * 5, cfg, 0.2)["paused"]


def _bs_call(s: float, k: float, t: float, vol: float, r: float = 0.04) -> float:
    d1 = (math.log(s / k) + (r + vol * vol / 2) * t) / (vol * math.sqrt(t))
    n = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))  # noqa: E731
    return s * n(d1) - k * math.exp(-r * t) * n(d1 - vol * math.sqrt(t))


def make_chain(root: str, spot: float, asof: str, expiries: list[str], strikes: list[float], vol: float = 0.2,
               oi: int = 1000, half_spread: float = 0.05) -> OptionChain:
    rows = []
    for e in expiries:
        t = max((pd.Timestamp(e) - pd.Timestamp(asof)).days, 1) / 365.0
        for k in strikes:
            px = max(_bs_call(spot, k, t, vol), 0.02)
            bid, ask = round(max(px - half_spread, 0.01), 2), round(px + half_spread, 2)
            rows.append({"occ": occ_symbol(root, e, "C", k), "root": root, "right": "C", "strike": float(k),
                         "expiry": e, "bid": bid, "ask": ask, "mid": (bid + ask) / 2, "iv": vol, "delta": None,
                         "gamma": None, "theta": None, "vega": None, "open_interest": oi, "volume": 10,
                         "last_trade_time": f"{asof}T16:00:00"})
    return OptionChain(root, f"{asof}T22:17:00", spot, "fake", pd.DataFrame(rows, columns=CHAIN_COLUMNS))


XSP_EXP = ["2026-11-20", "2026-12-11", "2026-12-18", "2027-01-15"]
XSP_STRIKES = [float(k) for k in range(600, 801, 5)]
USO_STRIKES = [float(k) for k in range(100, 251, 5)]
DAL_STRIKES = [float(k) for k in range(60, 111, 1)]


def test_structure_selection_helpers() -> None:
    chain = make_chain("XSP", 700.0, DAY2, XSP_EXP, XSP_STRIKES)
    assert rules.expiry_candidates(chain.expiries(), "2026-10-16", 56, 75) == ["2026-12-18", "2026-12-11"]
    assert rules.expiry_candidates(chain.expiries(), "2026-10-16", 56, 75, before="2026-12-15") == ["2026-12-11"]
    sp = rules.call_spread(chain, "2026-12-18", 700.0, [1.015, 1.04])
    assert sp["ok"] and (sp["long"], sp["short"]) == (710.0, 730.0)
    assert [leg["position"] for leg in sp["legs"]] == ["long", "short"]
    assert sp["legs"][0]["occ"] == "XSP261218C00710000"
    assert not rules.call_spread(chain, "2026-12-18", 700.0, [1.04, 1.015])["ok"]           # inverted
    assert not rules.call_spread(chain, "2027-06-18", 700.0, [1.0, 1.05])["ok"]             # no such expiry


def test_never_an_oil_short() -> None:
    uso = rules.order_legs("USO", "2026-12-18", 165, 200)
    rules.no_oil_short("W9", "USO", uso)
    with pytest.raises(ValueError, match="never trades oil"):
        rules.no_oil_short("W8", "USO", uso)
    puts = rules.order_legs("XSP", "2026-12-18", 710, 690, right="P")
    with pytest.raises(ValueError, match="call debit spreads"):
        rules.no_oil_short("W8", "XSP", puts)
    with pytest.raises(ValueError):
        rules.no_oil_short("W8", "XSP", rules.order_legs("XSP", "2026-12-18", 730, 710))     # a bear call spread


def test_prices_and_contracts() -> None:
    assert rules.round_price(7.2331, "buy") == 7.24 and rules.round_price(7.2331, "sell") == 7.23
    assert rules.round_price(7.20, "buy") == 7.20
    assert rules.contracts_for(1000, 7.24) == 1 and rules.contracts_for(1000, 10.01) == 0
    assert rules.contracts_for(1500, 3.72) == 4 and rules.contracts_for(100, 0) == 0


def test_exit_check_order_and_reasons() -> None:
    cfg8, cfg9 = load_config().module("W8"), load_config().module("W9")
    ot = {"fill_date": "2026-10-16", "exit_date": "2026-11-13", "expiry": "2026-12-18", "width": 20.0,
          "entry_price": 7.0}
    assert not rules.exit_check("W8", "2026-10-20", ot, 10.0, cfg8)["exit"]
    tp = rules.exit_check("W8", "2026-10-20", ot, 16.0, cfg8)                               # 80% of 20
    assert tp["reason"] == "take_profit" and tp["tp_value"] == pytest.approx(16.0)
    assert rules.exit_check("W9", "2026-10-20", ot, 14.0, cfg9)["reason"] == "take_profit"  # 2 x 7.0
    assert rules.exit_check("W8", "2026-11-12", ot, 10.0, cfg8)["reason"] == "time_stop"     # next session 13 Nov
    assert rules.exit_check("W8", "2026-11-12", ot, None, cfg8)["reason"] == "time_stop"     # no quote needed
    assert rules.exit_check("W8", "2026-10-20", ot, 10.0, cfg8, "market at 35%")["reason"] == "invalidation"
    assert rules.exit_check("W8", "2026-10-20", {**ot, "invalidated_on": "2026-10-19"}, 10.0,
                            cfg8)["reason"] == "invalidation"                                # sticky
    late = rules.exit_check("W8", "2026-12-03", {**ot, "exit_date": "2027-01-01"}, 10.0, cfg8)
    assert late["reason"] == "expiry_rule"                             # 10 sessions before 18 Dec is 4 Dec


# ================================================================================================
# macro data
# ================================================================================================

def test_explicit_contract_months() -> None:
    assert front_contracts("BZ", "2026-09-28") == ["BZZ26.NYM", "BZF27.NYM"]   # the design's "December contract"
    assert front_contracts("CL", "2026-09-29") == ["CLX26.NYM", "CLZ26.NYM"]   # as pipeline._contango_veto
    assert front_contracts("BZ", "2026-10-01", 1) == ["BZZ26.NYM"]
    assert front_contracts("BZ", "2026-10-16", 1) == ["BZF27.NYM"]
    assert front_contracts("CL", "2026-10-15", 1) == ["CLX26.NYM"]
    assert front_contracts("CL", "2026-10-16", 1) == ["CLZ26.NYM"]
    assert contract_symbol("CL", front_month("CL", "2026-12-20")) == "CLG27.NYM"


def _bars(values: list[float], end: str = DAY2) -> pd.DataFrame:
    idx = SESSIONS[SESSIONS <= pd.Timestamp(end)][-len(values):]
    s = pd.Series(values, index=idx, dtype=float)
    return pd.DataFrame({"open": s, "high": s, "low": s, "close": s, "adj_close": s, "volume": 1e5})


def test_day_move_is_dated_and_fails_closed() -> None:
    mv = day_move(_bars([100.0, 93.0]), DAY2)
    assert mv["ok"] and mv["ret"] == pytest.approx(-0.07) and mv["prev_date"] == DAY1
    assert not day_move(_bars([100.0, 93.0], end=DAY1), DAY2)["ok"]                         # stale
    assert not day_move(_bars([93.0]), DAY2)["ok"]
    assert not day_move(None, DAY2)["ok"]


def test_contango() -> None:
    assert roll_yield(93.99, 90.32) == pytest.approx(math.log(93.99 / 90.32) * 12)
    back = contango(_bars([94.0]), _bars([90.0]), DAY2, -0.20)
    assert back["ok"] and not back["veto"] and back["roll_yield"] > 0
    steep = contango(_bars([90.0]), _bars([92.0]), DAY2, -0.20)                             # -26% a year
    assert steep["ok"] and steep["veto"]
    assert not contango(_bars([90.0], end="2026-10-01"), _bars([92.0]), DAY2, -0.20)["ok"]


def test_dal_earnings_date_sources() -> None:
    payload = json.loads((FIX / "nasdaq_dal_earnings.json").read_text())
    assert parse_nasdaq_earnings(payload, "2026-09-29") == "2026-10-09"
    assert parse_nasdaq_earnings(payload, "2026-10-10") is None                              # already passed
    text_only = {"data": {"announcement": "", "reportText": "expected* to report earnings on 01/14/2027 before"}}
    assert parse_nasdaq_earnings(text_only, "2026-10-10") == "2027-01-14"
    assert parse_nasdaq_earnings({"data": None}, "2026-10-10") is None
    assert parse_yahoo_calendar({"Earnings Date": [pd.Timestamp("2026-10-09").date()]}, "2026-09-29") == ["2026-10-09"]
    assert parse_yahoo_calendar({}, "2026-09-29") == []
    assert combine_earnings("2026-10-09", ["2026-10-09"], "2026-09-29")["date"] == "2026-10-09"
    assert combine_earnings("2026-10-09", ["2026-10-07"], "2026-09-29")["date"] == "2026-10-07"   # earlier wins
    assert not combine_earnings("2026-10-09", ["2026-11-20"], "2026-09-29")["ok"]                   # disagree
    assert not combine_earnings(None, ["2026-10-09"], "2026-09-29")["ok"]
    assert combine_earnings("2026-10-09", [], "2026-09-29")["ok"]


def test_macro_data_adapter_on_a_fake_session() -> None:
    payload = json.loads((FIX / "nasdaq_dal_earnings.json").read_text())

    class Session:
        def get(self, url, params=None, headers=None, timeout=None):
            assert url == "https://api.nasdaq.com/api/analyst/DAL/earnings-date" and "Mozilla" in headers["User-Agent"]
            return type("R", (), {"status_code": 200, "text": json.dumps(payload)})()

    md = MacroData(Http(session=Session()), yahoo_calendar=lambda t: {"Earnings Date": [pd.Timestamp("2026-10-09")]})
    assert md.next_earnings("DAL", "2026-09-29") == {"ok": True, "date": "2026-10-09", "reason": "",
                                                      "sources": {"nasdaq": "2026-10-09", "yahoo": ["2026-10-09"]}}

    class Down:
        def get(self, *a, **k):
            return type("R", (), {"status_code": 404, "text": "no"})()
    assert not MacroData(Http(session=Down()), yahoo_calendar=lambda t: {}).next_earnings("DAL", "2026-09-29")["ok"]


SUPPLY = {"min_mbd_offline": 1.0, "min_no_restoration_days": 14, "min_citations": 2,
          "source_domains": ["iea.org", "eia.gov", "aramco.com"]}
EVENT = {"id": "yanbu-2026-10", "event_date": DAY2, "mbd_offline": 1.8, "no_restoration_days": 21,
         "what": "Yanbu terminal and the East-West pipeline damaged",
         "sources": ["https://www.iea.org/news/x", "https://www.aramco.com/en/news/y"]}


def test_supply_loss_check() -> None:
    assert supply_loss_check([EVENT], DAY2, DAY1, SUPPLY)["ok"]
    assert supply_loss_check([{**EVENT, "event_date": DAY1}], DAY2, DAY1, SUPPLY)["ok"]     # classified next day
    for bad in ({"event_date": "2026-10-13"}, {"mbd_offline": 0.8}, {"mbd_offline": "2"},
                {"no_restoration_days": 7}, {"sources": ["https://www.iea.org/news/x"]},
                {"sources": ["https://www.iea.org/a", "http://www.eia.gov/b"]},                # not https
                {"sources": ["https://www.iea.org/a", "https://iea.org.example.com/b"]},        # look-alike host
                {"restored_on": DAY2}, {"id": ""}):
        res = supply_loss_check([{**EVENT, **bad}], DAY2, DAY1, SUPPLY)
        assert not res["ok"], bad
    later = {**EVENT, "id": "fujairah", "event_date": DAY2}
    assert supply_loss_check([{**EVENT, "event_date": DAY1}, later], DAY2, DAY1, SUPPLY)["event"]["id"] == "fujairah"
    assert domain_allowed("https://news.iea.org/x", ["iea.org"]) and not domain_allowed("https://xiea.org", ["iea.org"])


def test_load_supply_input(tmp_path: Path) -> None:
    assert load_supply_input(tmp_path / "none.json") == {"ok": True, "events": [], "reason": "no supply-loss input file"}
    (tmp_path / "bad.json").write_text("{not json")
    assert not load_supply_input(tmp_path / "bad.json")["ok"]
    (tmp_path / "odd.json").write_text(json.dumps({"events": "x"}))
    assert not load_supply_input(tmp_path / "odd.json")["ok"]
    (tmp_path / "good.json").write_text(json.dumps({"events": [EVENT]}))
    assert load_supply_input(tmp_path / "good.json")["events"][0]["id"] == EVENT["id"]


# ================================================================================================
# email text and forecasts
# ================================================================================================

def _strings(obj: Any) -> list[str]:
    """Every text value (not the table keys: module ids like "W8" are keys)."""
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        return [s for v in obj.values() for s in _strings(v)]
    if isinstance(obj, (list, tuple)):
        return [s for v in obj for s in _strings(v)]
    return []


def test_email_text_has_no_digits_and_is_merged() -> None:
    for s in _strings({k: v for k, v in w8w9_text.TEXT.items() if k != "PLAN_NAMES_EXIT_EMAIL"}):
        literal = re.sub(r"\{[^{}]*\}", "", s)                                # placeholders are filled from facts
        for allowed in validator.ALLOWED_LITERALS:                            # "10:00", "S&P 500", ...
            literal = literal.replace(allowed, "")
        assert not any(ch.isdigit() for ch in literal), s
    assert emails.MODULE_NAMES["W8"] == "De-escalation call spread" and "W9" in emails.PLAN_NAMES_EXIT_EMAIL
    assert "EXIT:invalidation" in emails.WHY["W8"] and emails.RISKS["W9"]


def test_forecasts_are_registered() -> None:
    cfg = load_config()
    rec = Recommendation("NEW_TRADE", "W8", "T-2026-10-15-W8", DAY2, [], {})
    fcs = forecasts.make_forecasts(rec, cfg)
    assert [f["event"] for f in fcs] == ["profit", "time_stop"] and fcs[0]["p"] == cfg.module("W8")["forecasts"]["p_profit"]
    assert "20-trading-day" in fcs[1]["question"]
    rec9 = Recommendation("NEW_TRADE", "W9", "T-2026-10-15-W9", DAY2, [], {})
    assert [f["ticker"] for f in forecasts.make_forecasts(rec9, cfg)] == ["USO", "USO"]
    resolved = forecasts.resolve_trade_forecasts(fcs, {"profit": True, "exit_reason": "take_profit"})
    assert [f["outcome"] for f in resolved] == [1, 0]


# ================================================================================================
# the runner end to end
# ================================================================================================

def q(mid: str, question: str, date: str, yes: float, *, listed: bool = True, resolved: bool = False,
      outcome: str | None = None) -> dict:
    return {"venue": "polymarket", "id": mid, "question": question, "date": date, "end": date, "yes": yes,
            "listed": listed, "resolved": resolved, "outcome": outcome, "problem": None, "bid": None, "ask": None,
            "one_day_change": None, "closed_time": None, "event_id": "e", "event_closed": False}


class FakePM:
    """Quote-level stand-in for PredictionMarkets."""

    def __init__(self) -> None:
        self.quotes: dict[str, dict] = {}
        self.fail: set[str] = set()
        self.releases = {k: list(v) for k, v in RELEASES.items()}
        self.payload_sha256: list[str] = []
        self.set("B1231", "US announces end of Iranian blockade by December 31, 2026?", "2026-12-31", 0.55)
        self.set("B1130", "US announces end of Iranian blockade by November 30, 2026?", "2026-11-30", 0.40)
        self.set("H1231", "Strait of Hormuz traffic returns to normal by December 31?", "2026-12-31", 0.20)
        self.set("C1031", "US x Iran ceasefire continues through October 31?", "2026-10-31", 0.56)
        self.set("C1130", "US x Iran ceasefire continues through November 30?", "2026-11-30", 0.45)
        self.set("C1231", "US x Iran ceasefire continues through December 31?", "2026-12-31", 0.33)

    def set(self, mid: str, question: str | None = None, date: str | None = None, yes: float | None = None,
            **kw: Any) -> None:
        old = self.quotes.get(mid, {})
        self.quotes[mid] = q(mid, question or old["question"], date or old["date"],
                             yes if yes is not None else old["yes"], **kw)

    def family(self, spec: dict) -> dict:
        if spec["query"] in self.fail:
            raise DataError("down")
        import re
        rx = re.compile(spec["pattern"])
        return {"quotes": [dict(v) for v in self.quotes.values() if rx.match(v["question"])], "incomplete": False}

    def refresh(self, ids: list[str], venue: str = "polymarket") -> dict:
        if "refresh" in self.fail:
            raise DataError("down")
        return {i: dict(self.quotes[i]) for i in ids if i in self.quotes}

    def release_dates(self, series: dict) -> dict:
        if "releases" in self.fail:
            raise DataError("calendar down")
        return self.releases


class FakeMD:
    def __init__(self, earnings: str | None = "2027-01-20") -> None:
        self.earnings = earnings

    def next_earnings(self, ticker: str, asof: str) -> dict:
        if self.earnings is None:
            return {"ok": False, "date": None, "sources": {}, "reason": "no earnings date from Nasdaq"}
        return {"ok": True, "date": self.earnings, "sources": {"nasdaq": self.earnings}, "reason": ""}


class MacroProvider(FakeProvider):
    def __init__(self, bars: dict, pm: FakePM, md: FakeMD) -> None:
        super().__init__(bars=bars)
        self.prediction_markets, self.macro_data = pm, md
        self.chains: dict[str, OptionChain] = {}

    def set_bars(self, ticker: str, frame: pd.DataFrame) -> None:
        self._bars[ticker] = frame

    def option_chain(self, root: str) -> OptionChain:
        if root not in self.chains:
            raise DataError(f"no chain for {root}")
        return self.chains[root]


def series(level: float, moves: dict[str, float] | None = None) -> pd.DataFrame:
    """Flat closes at `level` with day returns applied on the given dates (and carried after)."""
    values, v = [], level
    for d in SESSIONS:
        v *= 1.0 + (moves or {}).get(d.strftime("%Y-%m-%d"), 0.0)
        values.append(v)
    s = pd.Series(values, index=SESSIONS)
    return pd.DataFrame({"open": s, "high": s, "low": s, "close": s, "adj_close": s, "volume": 1e6})


class Recorder:
    def __init__(self) -> None:
        self.sent: list = []
        self.issues: list = []

    def services(self, veto: Any) -> pipeline.Services:
        def send(email, *, dry_run, outbox):
            self.sent.append(email)
            return {"sent": True, "id": str(len(self.sent))}

        def create_issue(title, body, labels=None):
            self.issues.append(title)
            return f"https://github.com/example/repo/issues/{len(self.issues)}"

        svc = pipeline.Services(send=send, create_issue=create_issue, healthcheck=lambda s: None,
                                fetch_comments=lambda url: [])
        svc.veto = veto
        return svc


class FakeVeto:
    def __init__(self, status: str = "proceed", verdict: str = "PROCEED") -> None:
        self.status, self.verdict, self.calls = status, verdict, []

    def __call__(self, module: str, facts: dict, cfg_veto: dict) -> dict:
        self.calls.append((module, facts))
        ok = self.status == "proceed"
        return {"status": self.status, "proceed": ok, "verdict": self.verdict, "citations": CITES if ok else [],
                "cited": CITES, "retrieved": CITES, "reason": "test", "problems": [] if ok else ["test veto"],
                "prompt_sha256": cfg_veto["prompt_sha256"], "request_sha256": "a" * 64, "model_sha256": "b" * 64,
                "response_sha256": "c" * 64, "response": [], "stop_reason": "end_turn", "usage": {}, "requests": 1}


class World:
    def __init__(self, tmp_path: Path, monkeypatch, *, cfg=None, veto: FakeVeto | None = None) -> None:
        self.cfg = cfg or load_config()
        self.state_dir = tmp_path / "state"
        pipeline.run_init(self.cfg, self.state_dir, created="2026-10-01")
        self.pm, self.md = FakePM(), FakeMD()
        bars = {"BZZ26.NYM": series(99.43, {DAY2: -0.07}), "BZF27.NYM": series(95.78, {DAY2: -0.06}),
                "BNO": series(60.33, {DAY2: -0.065}), "CLX26.NYM": series(93.99), "CLZ26.NYM": series(90.32),
                "CLF27.NYM": series(87.5), "SPY": series(700.0)}
        self.provider = MacroProvider(bars, self.pm, self.md)
        self.provider.chains = {"XSP": make_chain("XSP", 700.0, DAY2, XSP_EXP, XSP_STRIKES),
                                "SPY": make_chain("SPY", 700.0, DAY2, XSP_EXP, XSP_STRIKES),
                                "USO": make_chain("USO", 150.0, DAY2, XSP_EXP, USO_STRIKES, vol=0.5),
                                "DAL": make_chain("DAL", 84.0, DAY2, XSP_EXP, DAL_STRIKES, vol=0.4, half_spread=0.03)}
        self.veto = veto or FakeVeto()
        self.recorder = Recorder()
        self.admits: list[dict] = []
        self.liquidity: dict[str, bool] = {}

        def admit_premium(module, root, premium_usd, cluster, positions_stress, cfg, drawdown, *,
                          exempt_governor=False, min_premium_usd=0.0):
            self.admits.append({"module": module, "root": root, "premium_usd": premium_usd, "cluster": cluster,
                                "exempt_governor": exempt_governor, "min_premium_usd": min_premium_usd})
            return {"ok": True, "premium_usd": premium_usd, "binding": None, "notes": [], "cluster_overflow": 0.0}

        def liquidity_check(chain, legs, cfg_liquidity, *, expected_gain=None):
            ok = self.liquidity.get(chain.underlying, True)
            return {"ok": ok, "reasons": [] if ok else ["leg spread too wide"], "per_leg": [], "round_trip_frac": 0.01}

        monkeypatch.setattr(risk, "admit_premium", admit_premium)
        monkeypatch.setattr(chain_mod, "liquidity_check", liquidity_check, raising=False)

    def run(self, date: str, kind: str = "daily") -> pipeline.Run:
        run = pipeline.Run(self.cfg, self.provider, self.state_dir, kind, date,
                           services=self.recorder.services(self.veto))
        assert run.begin()
        return run

    def day(self, date: str) -> pipeline.Run:
        """One evening: the macro runner alone (the Phase A modules have their own tests), then save."""
        run = self.run(date)
        macro.daily(run, {})
        run.finish("ok")
        return run

    def state(self) -> dict:
        return json.loads((self.state_dir / "state.json").read_text())

    def ledger(self) -> list[dict]:
        return [json.loads(line) for line in (self.state_dir / "ledger.jsonl").read_text().splitlines()]

    def blocked(self, module: str = "W8") -> list[dict]:
        return [r["payload"] for r in self.ledger() if r["record_type"] == "shadow" and r["payload"]["book"] == module]

    def de_escalation(self) -> pipeline.Run:
        self.day(DAY1)                                             # the market map's snapshot
        self.pm.set("B1231", yes=0.81)                             # +26 points and through 75%
        return self.day(DAY2)


@pytest.fixture()
def world(tmp_path, monkeypatch) -> World:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("TRADEREC_VETO_MODEL", raising=False)
    return World(tmp_path, monkeypatch)


def _w8_emails(w: World, kind: str = "NEW_TRADE") -> list:
    return [e for e in w.recorder.sent if e.meta.get("kind") == kind and e.meta.get("module") == "W8"]


def test_w8_de_escalation_emits_a_call_spread(world: World) -> None:
    run = world.de_escalation()
    st = world.state()
    assert not [a for a in st["alerts"] if a["kind"] in ("validator", "data", "veto", "risk")], st["alerts"]
    ot = st["modules"]["W8"]["open_trade"]
    assert ot["status"] == "pending_entry" and ot["root"] == "XSP" and ot["expiry"] == "2026-12-18"
    assert (ot["long_strike"], ot["short_strike"], ot["contracts"]) == (710.0, 730.0, 1)
    assert ot["exit_date"] == "2026-11-13" and ot["invalidation"]["market_id"] == "C1130"   # first date >= 13 Nov
    (order,) = st["broker"]["pending"]
    assert order["order_type"] == "spread_limit" and order["ticker"] == "XSP" and order["account"] == "taxable"
    assert order["side"] == "buy" and 0 < order["limit_price"] <= order["max_price"] < 20.0
    assert order["max_price"] * 100 <= 0.01 * run.current_nav()                           # premium <= 1% of NAV
    assert world.admits[-1]["cluster"] == "oil" and not world.admits[-1]["exempt_governor"]
    # the veto was asked last, with the mechanical facts, and logged before the recommendation
    (module, facts), = world.veto.calls
    assert module == "W8" and "BZZ26" in facts["oil_facts"] and "December 2026" in facts["oil_facts"]
    assert "55% to 81%" in facts["market_facts"]
    kinds = [(r["record_type"], r["payload"].get("check")) for r in world.ledger()]
    assert kinds.index(("signal", "veto")) < kinds.index(("recommendation", None))
    assert ("signal", "trigger") in kinds
    assert [f["event"] for f in st["forecasts"]["open"]] == ["profit", "time_stop"]
    (email,) = _w8_emails(world)
    assert not validator.validate(email)
    assert "De-escalation call spread" in email.text and "after 10:00 ET" in email.text
    assert "never shorts oil" in email.text
    assert macro.roots_needed(run) == {"XSP"}


def test_w8_needs_a_snapshot_from_the_previous_session(world: World) -> None:
    world.pm.set("B1231", yes=0.81)
    world.day(DAY2)                                                # first night: nothing to compare with
    assert world.state()["modules"]["W8"]["open_trade"] is None and not world.veto.calls


def test_w8_near_miss_is_logged_without_a_trade(world: World) -> None:
    world.day(DAY1)
    world.day(DAY2)                                                # oil falls but the markets do not move
    st = world.state()
    assert st["modules"]["W8"]["open_trade"] is None and not world.veto.calls
    assert st["modules"]["W8"]["events"][-1]["outcome"] == "near_miss"


def test_w8_oil_sources_that_disagree_fail_closed(world: World) -> None:
    world.provider.set_bars("BNO", series(60.33, {DAY2: 0.01}))
    world.de_escalation()
    (blocked,) = world.blocked()
    assert blocked["stage"] == "oil_data" and not world.veto.calls
    assert any(a["kind"] == "data" and "W8" in a["message"] for a in world.state()["alerts"])


def test_w8_release_window_blocks(world: World) -> None:
    world.pm.releases["NFP"].append("2026-10-20")
    world.de_escalation()
    (blocked,) = world.blocked()
    assert blocked["stage"] == "release_ban" and "NFP 2026-10-20" in blocked["reason"] and not world.veto.calls


def test_w8_no_release_calendar_fails_closed(world: World) -> None:
    world.pm.fail.add("releases")
    world.de_escalation()
    assert world.blocked()[0]["stage"] == "release_calendar"
    assert any(a["kind"] == "data" for a in world.state()["alerts"])


def test_w8_invalidation_market_must_be_mapped_and_above_the_threshold(world: World) -> None:
    world.pm.set("C1130", yes=0.35)
    world.de_escalation()
    assert world.blocked()[0]["stage"] == "invalidation_market" and "35.0%" in world.blocked()[0]["reason"]


def test_w8_ambiguous_invalidation_market_fails_closed(world: World) -> None:
    world.pm.set("C1130X", "US-Iran ceasefire continues through November 30?", "2026-11-30", 0.47)
    world.de_escalation()
    blocked = world.blocked()[0]
    assert blocked["stage"] == "invalidation_market" and blocked["reason"].startswith("ambiguous")


def test_w8_falls_back_to_spy_when_xsp_fails_liquidity(world: World) -> None:
    world.liquidity["XSP"] = False
    world.de_escalation()
    ot = world.state()["modules"]["W8"]["open_trade"]
    assert ot["root"] == "SPY" and ot["legs"][0]["occ"].startswith("SPY261218C")


def test_w8_dal_legs_expire_before_earnings(world: World, tmp_path: Path) -> None:
    cfg = load_config()
    cfg.constitution["modules"]["W8"]["roots"] = ["DAL"]
    w = world
    w.cfg = cfg
    w.md.earnings = "2026-12-15"                                     # before 18 Dec: only 11 Dec qualifies
    w.de_escalation()
    ot = w.state()["modules"]["W8"]["open_trade"]
    assert ot["root"] == "DAL" and ot["expiry"] == "2026-12-11" and ot["contracts"] >= 1


def test_w8_dal_without_an_expiry_before_earnings_is_blocked(world: World) -> None:
    world.cfg.constitution["modules"]["W8"]["roots"] = ["DAL"]
    world.md.earnings = "2026-11-10"
    world.de_escalation()
    assert world.blocked()[0]["stage"] == "structure" and "before earnings" in world.blocked()[0]["reason"]
    world.md.earnings = None


def test_w8_unknown_earnings_date_fails_closed_for_dal_only(world: World) -> None:
    world.cfg.constitution["modules"]["W8"]["roots"] = ["DAL", "SPY"]
    world.md.earnings = None
    world.de_escalation()
    assert world.state()["modules"]["W8"]["open_trade"]["root"] == "SPY"


def test_w8_veto_blocks_and_is_logged(world: World) -> None:
    world.veto.status, world.veto.verdict = "veto", "VETO_REVERSED"
    world.de_escalation()
    st = world.state()
    assert st["modules"]["W8"]["open_trade"] is None and not st["broker"]["pending"]
    blocked = world.blocked()[0]
    assert blocked["stage"] == "veto" and "VETO_REVERSED" in blocked["reason"]
    assert not [a for a in st["alerts"] if a["kind"] == "veto"]          # a real veto is not an alert
    assert any(r["payload"].get("check") == "veto" for r in world.ledger())


def test_w8_without_llm_credentials_is_shadow_only(world: World) -> None:
    world.veto = None                                                  # services.veto unset: the real llm_veto,
    world.de_escalation()                                              # with no key and no model in the env
    st = world.state()
    assert st["modules"]["W8"]["open_trade"] is None and not st["broker"]["pending"]
    assert world.blocked()[0]["stage"] == "veto" and "unavailable" in world.blocked()[0]["reason"]
    assert any(a["kind"] == "veto" for a in st["alerts"])


def test_w8_injected_veto_that_raises_fails_closed(world: World) -> None:
    def broken(module, facts, cfg):
        raise RuntimeError("boom")
    world.veto = broken
    world.de_escalation()
    assert world.blocked()[0]["stage"] == "veto" and world.state()["modules"]["W8"]["open_trade"] is None


def test_w8_never_trades_an_oil_root(world: World) -> None:
    world.cfg.constitution["modules"]["W8"]["roots"] = ["USO"]
    world.cfg.constitution["modules"]["W8"]["moneyness"]["USO"] = [1.0, 1.1]
    world.de_escalation()                                              # blocked with an alert, the run goes on
    assert world.blocked()[0]["stage"] == "structure" and "never trades oil" in world.blocked()[0]["reason"]
    assert any(a["kind"] == "config" for a in world.state()["alerts"])


def test_w8_a_family_that_cannot_be_mapped_alerts_once(world: World) -> None:
    world.pm.fail.add("Strait of Hormuz traffic returns to normal")
    world.de_escalation()
    alerts = [a for a in world.state()["alerts"] if "hormuz_normal" in a["message"]]
    assert len(alerts) == 1 and alerts[0]["date"] == DAY1
    assert world.state()["modules"]["W8"]["open_trade"] is not None       # the blockade family still triggers


def test_w8_premium_admission_is_required(world: World, monkeypatch) -> None:
    def not_built(*a, **k):
        raise NotImplementedError("risk.admit_premium is not built yet")
    monkeypatch.setattr(risk, "admit_premium", not_built)
    world.de_escalation()
    assert world.blocked()[0]["stage"] == "admit" and not world.veto.calls
    assert any(a["kind"] == "risk" for a in world.state()["alerts"])


def test_w8_one_contract_or_skip(world: World) -> None:
    big = make_chain("XSP", 7000.0, DAY2, XSP_EXP, [float(k) for k in range(6000, 8001, 50)])
    world.provider.chains.update(XSP=big, SPY=big)
    world.provider.chains.pop("DAL")
    world.de_escalation()
    blocked = world.blocked()[0]
    assert blocked["stage"] == "structure" and "premium cap" in blocked["reason"] and not world.veto.calls


def test_w8_takes_the_next_root_when_one_contract_does_not_fit(world: World) -> None:
    big = make_chain("XSP", 7000.0, DAY2, XSP_EXP, [float(k) for k in range(6000, 8001, 50)])
    world.provider.chains.update(XSP=big, SPY=big)                     # DAL (about $84) still fits
    world.de_escalation()
    ot = world.state()["modules"]["W8"]["open_trade"]
    assert ot["root"] == "DAL" and ot["expiry"] < "2027-01-20"          # before FakeMD's earnings date


def test_w8_pauses_in_a_deep_drawdown(world: World) -> None:
    world.day(DAY1)
    st = world.state()
    st["marks"] = [{"date": DAY1, "nav": 78000.0, "drawdown": 0.22, "peak": 100000.0}]
    (world.state_dir / "state.json").write_text(json.dumps(st))
    world.pm.set("B1231", yes=0.81)
    world.day(DAY2)
    assert world.blocked()[0]["stage"] == "pause"


def _open_w8(world: World) -> dict:
    """De-escalation night, then the 10:17 ET fill on 16 Oct (the options job's part, simulated)."""
    world.de_escalation()
    run = world.run("2026-10-16", kind="options")
    ot = run.state["modules"]["W8"]["open_trade"]
    (intent,) = run.broker.pending()
    price = ot["limit_price"]
    fill = Fill(intent.intent_id, intent.trade_id, "W8", "taxable", "XSP", "buy", 1, price, price - 0.1, price * 100,
                "2026-10-16", 0.0, "1.0", multiplier=100, legs=intent.legs, fill_time="10:17")
    run.broker._pending = []
    macro.on_spread_fill(run, fill, intent)
    run.finish("ok")
    return world.state()["modules"]["W8"]["open_trade"]


def _close(world: World, date: str, price: float) -> dict:
    run = world.run(date, kind="options")
    ot = run.state["modules"]["W8"]["open_trade"]
    intent = next(o for o in run.broker.pending() if o.side == "sell")
    fill = Fill(intent.intent_id, intent.trade_id, "W8", "taxable", "XSP", "sell", ot["contracts"], price, price,
                price * 100 * ot["contracts"], date, 0.0, "1.0", multiplier=100, legs=intent.legs)
    run.broker._pending = []
    macro.on_spread_fill(run, fill, intent)
    run.finish("ok")
    return world.state()


def test_w8_fill_then_take_profit_then_close(world: World) -> None:
    ot = _open_w8(world)
    assert ot["status"] == "open" and ot["fill_date"] == "2026-10-16" and ot["exit_date"] == "2026-11-13"
    world.provider.chains["XSP"] = make_chain("XSP", 780.0, "2026-10-22", XSP_EXP, XSP_STRIKES)   # rally
    world.day("2026-10-22")
    st = world.state()
    ot = st["modules"]["W8"]["open_trade"]
    assert ot["status"] == "pending_exit" and ot["exit_reason"] == "take_profit"
    sell = [o for o in st["broker"]["pending"] if o["side"] == "sell"][0]
    assert sell["close_all"] and sell["order_type"] == "spread_limit" and sell["limit_price"] >= sell["max_price"]
    (email,) = _w8_emails(world, "EXIT")
    assert not validator.validate(email) and "maximum value" in email.text
    st = _close(world, "2026-10-23", 17.0)
    (trade,) = st["modules"]["W8"]["history"]
    assert trade["exit_reason"] == "take_profit" and trade["profit"] and trade["pnl"] > 0
    assert st["modules"]["W8"]["open_trade"] is None
    resolved = [f for f in st["forecasts"]["resolved"] if f["trade_id"] == trade["trade_id"]]
    assert [(f["event"], f["outcome"]) for f in resolved] == [("profit", 1), ("time_stop", 0)]


def test_w8_time_stop_on_the_evening_of_session_20(world: World) -> None:
    _open_w8(world)
    world.provider.chains["XSP"] = make_chain("XSP", 700.0, "2026-11-11", XSP_EXP, XSP_STRIKES)
    world.day("2026-11-11")
    assert world.state()["modules"]["W8"]["open_trade"]["status"] == "open"
    world.day("2026-11-12")
    ot = world.state()["modules"]["W8"]["open_trade"]
    assert ot["status"] == "pending_exit" and ot["exit_reason"] == "time_stop"


def test_w8_invalidation_exit_is_sticky_and_a_failed_exit_is_reissued(world: World) -> None:
    _open_w8(world)
    world.pm.set("C1130", yes=0.35)
    world.day("2026-10-20")
    ot = world.state()["modules"]["W8"]["open_trade"]
    assert ot["exit_reason"] == "invalidation" and ot["invalidated_on"] == "2026-10-20"
    (email,) = _w8_emails(world, "EXIT")
    assert "ceasefire" in email.text and not validator.validate(email)
    # 10:17 ET: the close is not filled within the stated minimum -> re-opened; tonight re-issues it
    run = world.run("2026-10-21", kind="options")
    intent = next(o for o in run.broker.pending() if o.side == "sell")
    run.broker._pending = []
    macro.on_spread_cancel(run, intent, "model price beyond the stated minimum")
    run.finish("ok")
    assert world.state()["modules"]["W8"]["open_trade"]["status"] == "open"
    assert any(a["kind"] == "fill" for a in world.state()["alerts"])
    world.pm.set("C1130", yes=0.50)                                       # recovered, but invalidation is sticky
    world.day("2026-10-21")
    ot = world.state()["modules"]["W8"]["open_trade"]
    assert ot["status"] == "pending_exit" and ot["exit_reason"] == "invalidation"


def test_w8_invalidation_market_is_remapped_when_it_disappears(world: World) -> None:
    _open_w8(world)
    del world.pm.quotes["C1130"]
    world.pm.set("C1215", "US x Iran ceasefire continues through December 15?", "2026-12-15", 0.44)
    world.day("2026-10-20")
    ot = world.state()["modules"]["W8"]["open_trade"]
    assert ot["status"] == "open" and ot["invalidation"]["market_id"] == "C1215"
    assert any(r["payload"].get("check") == "invalidation_remap" for r in world.ledger())


def test_w8_ceasefire_resolving_no_invalidates(world: World) -> None:
    _open_w8(world)
    world.pm.set("C1130", yes=0.0, listed=False, resolved=True, outcome="no")
    world.day("2026-10-20")
    assert world.state()["modules"]["W8"]["open_trade"]["exit_reason"] == "invalidation"


def test_w8_entry_not_filled_voids_its_forecasts(world: World) -> None:
    world.de_escalation()
    run = world.run("2026-10-16", kind="options")
    (intent,) = run.broker.pending()
    run.broker._pending = []
    macro.on_spread_cancel(run, intent, "model price beyond the stated maximum")
    run.finish("ok")
    st = world.state()
    assert st["modules"]["W8"]["open_trade"] is None and not st["forecasts"]["open"]
    recs = world.ledger()
    assert any(r["record_type"] == "correction" and "voided_forecasts" in r["payload"] for r in recs)
    assert world.blocked()[-1]["event"] == "entry_not_filled"


def test_w8_one_trade_at_a_time(world: World) -> None:
    _open_w8(world)
    world.pm.set("B1231", yes=0.50)
    world.day("2026-10-19")                                                # the map's new snapshot
    world.provider.set_bars("BZZ26.NYM", series(99.43, {DAY2: -0.07, "2026-10-20": -0.08}))
    world.provider.set_bars("BZF27.NYM", series(95.78, {DAY2: -0.06, "2026-10-20": -0.08}))
    world.provider.set_bars("BNO", series(60.33, {DAY2: -0.065, "2026-10-20": -0.07}))
    world.pm.set("B1231", yes=0.80)
    world.day("2026-10-20")
    assert world.blocked()[-1]["stage"] == "one_at_a_time"


# --- W9 ------------------------------------------------------------------------------------------------------

def _w9_world(world: World, *, event_date: str = DAY2) -> World:
    world.provider.set_bars("CLX26.NYM", series(93.99, {DAY2: 0.06}))
    world.provider.set_bars("CLZ26.NYM", series(90.32))                  # backwardation: no contango veto
    world.provider.set_bars("BZZ26.NYM", series(99.43, {DAY2: 0.04}))
    world.provider.set_bars("BNO", series(60.33, {DAY2: 0.04}))
    inputs = world.state_dir / "inputs"
    inputs.mkdir(parents=True, exist_ok=True)
    event = {**EVENT, "event_date": event_date,
             "sources": ["https://www.iea.org/news/oil-market-alert", "https://www.aramco.com/en/news-media/x"]}
    (inputs / "w9_supply_loss.json").write_text(json.dumps({"events": [event]}))
    return world


def test_w9_barrel_loss_emits_a_uso_call_spread(world: World) -> None:
    _w9_world(world)
    world.day(DAY1)
    world.day(DAY2)
    st = world.state()
    ot = st["modules"]["W9"]["open_trade"]
    assert ot and ot["root"] == "USO" and (ot["long_strike"], ot["short_strike"]) == (165.0, 200.0)
    assert ot["supply_event_id"] == EVENT["id"] and ot["pre_event_closes"]["CLX26.NYM"] == pytest.approx(93.99)
    assert st["modules"]["W9"]["processed_events"] == [EVENT["id"]]
    order = [o for o in st["broker"]["pending"] if o["module"] == "W9"][0]
    assert order["max_price"] * 100 * order["contracts"] <= 0.0075 * 100000 + 1e-6
    (module, facts), = [c for c in world.veto.calls if c[0] == "W9"]
    assert "1.8 million barrels" in facts["supply_facts"] and "CLX26" in facts["price_facts"]
    email = [e for e in world.recorder.sent if e.meta.get("module") == "W9"][0]
    assert not validator.validate(email) and "paper-only" in email.text
    world.day("2026-10-16")                                                # the same record never fires twice
    assert len([c for c in world.veto.calls if c[0] == "W9"]) == 1


def test_w9_a_vetoed_record_is_not_asked_again_on_its_grace_day(world: World) -> None:
    _w9_world(world)
    world.veto.status, world.veto.verdict = "veto", "VETO_NOT_CONFIRMED"
    world.day(DAY1)
    world.day(DAY2)
    world.day("2026-10-16")                                                # the record is still in its window
    assert len([c for c in world.veto.calls if c[0] == "W9"]) == 1
    assert world.state()["modules"]["W9"]["open_trade"] is None


def test_w9_contango_veto(world: World) -> None:
    _w9_world(world)
    world.provider.set_bars("CLZ26.NYM", series(103.0))                  # front 99.63 < second 103: -40% a year
    world.day(DAY1)
    world.day(DAY2)
    blocked = world.blocked("W9")
    assert blocked and blocked[-1]["stage"] == "contango" and not world.state()["modules"]["W9"]["open_trade"]
    assert "R3" in blocked[-1]["reason"] and not [c for c in world.veto.calls if c[0] == "W9"]


def test_w9_is_shadow_only_in_live_mode(world: World) -> None:
    _w9_world(world)
    world.cfg.account["mode"] = "live"
    world.day(DAY1)
    world.day(DAY2)
    assert world.blocked("W9")[-1]["stage"] == "paper_only" and not [c for c in world.veto.calls if c[0] == "W9"]


def test_w9_needs_the_supply_record(world: World) -> None:
    _w9_world(world, event_date="2026-10-01")                              # a stale record
    world.day(DAY1)
    world.day(DAY2)
    st = world.state()
    assert st["modules"]["W9"]["open_trade"] is None
    assert st["modules"]["W9"]["events"][-1]["outcome"] == "near_miss"


def test_w9_invalidation_below_the_pre_event_close(world: World) -> None:
    _w9_world(world)
    world.day(DAY1)
    world.day(DAY2)
    run = world.run("2026-10-16", kind="options")
    ot = run.state["modules"]["W9"]["open_trade"]
    intent = next(o for o in run.broker.pending() if o.module == "W9")
    fill = Fill(intent.intent_id, intent.trade_id, "W9", "taxable", "USO", "buy", ot["contracts"], ot["limit_price"],
                ot["limit_price"], ot["limit_price"] * 100, "2026-10-16", 0.0, "1.0", multiplier=100)
    run.broker._pending = [o for o in run.broker._pending if o.module != "W9"]
    macro.on_spread_fill(run, fill, intent)
    run.finish("ok")
    world.provider.set_bars("CLX26.NYM", series(93.99, {DAY2: 0.06, "2026-10-19": -0.08}))    # back below 93.99
    world.day("2026-10-19")
    ot = world.state()["modules"]["W9"]["open_trade"]
    assert ot["status"] == "pending_exit" and ot["exit_reason"] == "invalidation"


# --- through the real daily pipeline ----------------------------------------------------------------------------

def test_the_daily_pipeline_runs_w8(world: World) -> None:
    """pipeline.run_daily calls runners.macro.daily (after M1, W10, M4, M2 and M3) and the W8 email goes out."""
    svc = world.recorder.services(world.veto)
    assert pipeline.run_daily(world.cfg, world.provider, world.state_dir, date=DAY1, services=svc).status == "ok"
    world.pm.set("B1231", yes=0.81)
    res = pipeline.run_daily(world.cfg, world.provider, world.state_dir, date=DAY2, services=svc)
    assert res.status == "ok"
    assert [e for e in res.emails if e["kind"] == "NEW_TRADE" and e["trade_id"] == "T-2026-10-15-W8"]
    assert world.state()["modules"]["W8"]["open_trade"]["status"] == "pending_entry"


def _fill_pending_skips_spreads() -> bool:
    return "spread_limit" in inspect.getsource(pipeline._fill_pending)


@pytest.mark.skipif(not _fill_pending_skips_spreads(),
                    reason="pipeline._fill_pending still loads daily bars for spread roots (integration fix)")
def test_the_next_daily_run_leaves_the_pending_spread_to_the_options_job(world: World) -> None:
    svc = world.recorder.services(world.veto)
    pipeline.run_daily(world.cfg, world.provider, world.state_dir, date=DAY1, services=svc)
    world.pm.set("B1231", yes=0.81)
    pipeline.run_daily(world.cfg, world.provider, world.state_dir, date=DAY2, services=svc)
    res = pipeline.run_daily(world.cfg, world.provider, world.state_dir, date="2026-10-16", services=svc)
    assert res.status == "ok" and [o["order_type"] for o in world.state()["broker"]["pending"]] == ["spread_limit"]


# --- the parts built in parallel (skipped until they exist) ---------------------------------------------------

@pytest.mark.skipif(not hasattr(chain_mod, "liquidity_check"),
                    reason="options.chain.liquidity_check is built by the options build")
def test_real_liquidity_check_accepts_a_liquid_xsp_spread() -> None:
    chain = make_chain("XSP", 700.0, DAY2, XSP_EXP, XSP_STRIKES, half_spread=0.02)
    legs = rules.call_spread(chain, "2026-12-18", 700.0, [1.015, 1.04])["legs"]
    cfg_liq = (load_config().constitution.get("options") or {}).get("liquidity") or load_config().module("W8")["liquidity"]
    assert chain_mod.liquidity_check(chain, legs, cfg_liq)["ok"]


@pytest.mark.skipif("NotImplementedError" in inspect.getsource(risk.admit_premium),
                    reason="risk.admit_premium is built by the M4 build")
def test_real_admit_premium_admits_one_w8_spread() -> None:
    cfg = load_config()
    adm = risk.admit_premium("W8", "XSP", 800.0, "oil", {"total": 0.0, "us_equity": 0.0, "by_module": {},
                                                         "nav": 100000.0, "premium": 0.0},   # open_stress(spreads=)
                             cfg, 0.0, min_premium_usd=800.0)
    assert adm["ok"] and adm["premium_usd"] == pytest.approx(800.0)
