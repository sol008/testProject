"""Tests for the macro shadow books: W3 (cool-CPI TLT), W4 (BoJ), the gold spike fade and the scheduled-release
log (traderec/modules/macro_shadows.py, traderec/runners/macro_shadows.py), and for the release calendar and
macro-data adapter (traderec/data/econ_calendar.py, config/econ_calendar.yaml).

Offline and deterministic: FakeProvider bars, FakeMacroData, a fake HTTP session, and fixtures trimmed from
real responses retrieved on 2026-09-29 (tests/fixtures/macro_shadows/). The synthetic market is built so that
in October-November 2026:
- payrolls on 2 Oct lift the 2-year 10bp (a hawkish bucket);
- CPI on 14 Oct is cool: the 2-year falls 8bp and core CPI prints +0.1% m/m, so W3 buys TLT at the 15 Oct
  open; the 10-year closes above its pre-CPI close on 5 Nov, so W3 sells at the 6 Nov open (invalidation);
- the Fed holds on 28 Oct and the BoJ hikes on 30 Oct (effective 2 Nov), so W4 buys FXY at the 2 Nov open;
  the yen then rallies to the USDJPY -4% target, and W4 sells at the 11 Nov open;
- a war onset listed for 4 Nov lifts GLD 2% that day and it gives back 1.5% the next: the fade shorts GLD at
  the 5 Nov open and covers at the 6 Nov open.
Bond-market holidays (12 Oct, 11 Nov) have no Treasury curve, as in reality.
"""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest
import requests

from traderec import emails as email_mod
from traderec import facts as facts_mod
from traderec import pipeline, validator
from traderec.config import Config, load_config
from traderec.data import DataError, FakeProvider, LiveProvider
from traderec.data.econ_calendar import (
    BOJ_BASIC_LOAN_RATE_URL,
    KINDS,
    TREASURY_CSV_URL,
    CalendarError,
    FakeMacroData,
    LiveMacroData,
    load_calendar,
    macro_data_for,
    parse_boj_rate_csv,
    parse_calendar,
    parse_treasury_csv,
    reaction_session,
)
from traderec.data.providers import FRED_CSV_URL
from traderec.ledger import Ledger
from traderec.market_calendar import is_trading_day
from traderec.modules import macro_shadows as ms
from traderec.runners import macro_shadows as runner

FIXTURES = Path(__file__).parent / "fixtures" / "macro_shadows"
LAUNCH = "2026-09-29"
NFP_DAY, CPI_DAY, FOMC_DAY, BOJ_DAY, BOJ_EFFECTIVE, ONSET_DAY = (
    "2026-10-02", "2026-10-14", "2026-10-28", "2026-10-30", "2026-11-02", "2026-11-04")
SESSIONS = pd.DatetimeIndex([d for d in pd.date_range("2023-01-02", "2027-03-31", freq="B") if is_trading_day(d)])
BOND_HOLIDAYS = pd.DatetimeIndex(["2026-10-12", "2026-11-11"])     # Columbus and Veterans Day: NYSE open
TLT_EX_DATE, TLT_DISTRIBUTION = pd.Timestamp("2026-11-02"), 0.30

# Explicit parameters (the constitution's values), so the tests pin behaviour, not the current YAML.
W3_CFG = {"enabled": True, "ticker": "TLT", "d2y_max_bp": -6, "core_cpi_mm_max": 0.1, "hold_sessions": 20,
          "invalidation": True, "yield_tolerance_bp": 2, "forecast_p_profit": 0.55,
          "promotion": {"min_instances": 24, "min_t": 2.0, "fdr_q": 0.10}}
W4_CFG = {"enabled": True, "ticker": "FXY", "fed_pair_max_days": 10, "boj_window_days": 10, "max_wait_days": 14,
          "stop_usdjpy": 0.015, "target_usdjpy": -0.04, "hold_sessions": 20, "forecast_p_profit": 0.5,
          "promotion": {"min_instances": 24, "min_t": 2.0, "fdr_q": 0.10}}
GOLD_CFG = {"enabled": True, "ticker": "GLD", "hold_sessions": 1, "near_miss_move": 0.02, "forecast_p_profit": 0.6,
            "promotion": {"min_instances": 10}}
MACRO_CFG = {
    "enabled": True, "calendar": None, "reverify_days": 60, "pending_sessions": 3, "baseline_years": 3,
    "state_keep_days": 400,
    "releases": {"kinds": list(KINDS),
                 "assets": {"SPY": ["SPY"], "TLT": ["TLT"], "GLD": ["GLD"], "USO": ["USO"],
                            "USD": ["UUP", "DX-Y.NYB"], "BTC": ["BTC-USD"]},
                 "yields": ["2Y", "10Y"], "forward_sessions": [1, 5, 20],
                 "buckets_bp": {"FOMC": {"hawkish": 5, "dovish": -7}, "CPI": {"hawkish": 4, "dovish": -6},
                                "NFP": {"hawkish": 8, "dovish": -6}}},
    "W3": W3_CFG, "W4": W4_CFG, "GOLD_FADE": GOLD_CFG,
}

TEST_CALENDAR = """
verified: "2026-09-29"
kinds:
  CPI:
    time: "08:30 ET"
    source: https://www.bls.gov/schedule/news_release/cpi.htm
    covered: ["2026-01-01", "2026-12-31"]
    releases:
      - {date: "2026-10-14", reference: "2026-09"}
      - {date: "2026-11-10", reference: "2026-10"}
      - {date: "2026-12-10", reference: "2026-11"}
  NFP:
    time: "08:30 ET"
    source: https://www.bls.gov/schedule/news_release/empsit.htm
    covered: ["2026-01-01", "2026-12-31"]
    releases: [{date: "2026-10-02"}, {date: "2026-11-06"}, {date: "2026-12-04"}]
  FOMC:
    time: "14:00 ET"
    source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
    covered: ["2026-01-01", "2027-12-31"]
    releases: [{date: "2026-09-16"}, {date: "2026-10-28"}, {date: "2026-12-09"}]
  GDP:
    time: "08:30 ET"
    source: https://www.bea.gov/news/schedule/full
    covered: ["2026-01-01", "2026-12-31"]
    releases: [{date: "2026-09-30"}, {date: "2026-10-29"}, {date: "2026-11-25"}]
  PCE:
    time: "08:30 ET"
    source: https://www.bea.gov/news/schedule/full
    covered: ["2026-01-01", "2026-12-31"]
    releases: [{date: "2026-09-30"}, {date: "2026-10-29"}, {date: "2026-11-25"}]
  BOJ:
    time: "about 12:00 JST"
    source: https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm
    covered: ["2026-01-01", "2027-12-31"]
    releases: [{date: "2026-09-18"}, {date: "2026-10-30"}, {date: "2026-12-18"}]
  ECB:
    time: "14:15 CET"
    source: https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
    covered: ["2026-01-01", "2027-12-31"]
    releases: [{date: "2026-09-10"}, {date: "2026-10-29"}, {date: "2026-12-17"}]
geopolitical_onsets: ONSETS
"""
ONSET = '[{date: "2026-11-04", label: "test onset", during_session: true}]'


# ------------------------------------------------------------------------------------------------ the world

def _path(start: float, daily: float, moves: dict[str, float] | None = None,
          run: tuple[str, int, float] | None = None) -> pd.Series:
    """A close path on SESSIONS: `daily` growth, one-day `moves`, and `run` = (first day, sessions, move)."""
    r = pd.Series(daily, index=SESSIONS)
    for d, m in (moves or {}).items():
        r.loc[pd.Timestamp(d)] = m
    if run:
        first = SESSIONS.get_loc(pd.Timestamp(run[0]))
        r.iloc[first:first + run[1]] = run[2]
    return start * (1.0 + r).cumprod()


def _bars(close: pd.Series, adj: pd.Series | None = None) -> pd.DataFrame:
    """Opens at the previous close, so every open is known exactly."""
    opens = close.shift(1).fillna(close.iloc[0])
    return pd.DataFrame({"open": opens, "high": np.maximum(opens, close), "low": np.minimum(opens, close),
                         "close": close, "adj_close": close if adj is None else adj, "volume": 1e6})


def _tlt() -> pd.DataFrame:
    close = _path(88.0, 0.00005, {CPI_DAY: 0.01}, run=("2026-10-15", 5, 0.003))
    prev = float(close.shift(1).loc[TLT_EX_DATE])
    adj = close.copy()
    adj.loc[adj.index < TLT_EX_DATE] *= 1.0 - TLT_DISTRIBUTION / prev       # a $0.30 distribution on 2 Nov
    return _bars(close, adj)


def market_bars() -> dict[str, pd.DataFrame]:
    return {
        "SPY": _bars(_path(600.0, 0.0004)),
        "TLT": _tlt(),
        "GLD": _bars(_path(300.0, 0.0002, {ONSET_DAY: 0.02, "2026-11-05": -0.015})),
        "USO": _bars(_path(80.0, 0.0001, {CPI_DAY: -0.02})),
        "UUP": _bars(_path(28.0, 0.00002, {FOMC_DAY: 0.004})),
        "FXY": _bars(_path(60.0, 0.0, run=(BOJ_EFFECTIVE, 10, 0.006))),
    }


def market_btc() -> pd.Series:
    days = pd.date_range("2023-01-01", "2027-03-31", freq="D")
    return pd.Series(50_000.0 * 1.001 ** np.arange(len(days)), index=days)


def market_yields() -> dict[str, pd.Series]:
    idx = SESSIONS[~SESSIONS.isin(BOND_HOLIDAYS)]
    two = pd.Series(4.80, index=idx)
    two[idx >= NFP_DAY] = 4.90                       # payrolls: +10bp (hawkish)
    two[idx >= CPI_DAY] = 4.82                       # CPI: -8bp (dovish; W3's 2-year test)
    two[idx >= FOMC_DAY] = 4.85                      # FOMC: +3bp (neutral)
    ten = pd.Series(5.20, index=idx)                 # the pre-CPI close is 5.20
    ten[idx >= CPI_DAY] = 5.12
    ten[idx >= "2026-10-15"] = 5.10
    ten[idx >= "2026-11-05"] = 5.25                  # back above the pre-CPI close: W3's invalidation
    return {"2Y": two, "10Y": ten}


def market_fred(yields: dict[str, pd.Series]) -> dict[str, pd.Series]:
    months = pd.date_range("2025-01-01", "2026-08-01", freq="MS")
    core = pd.Series(np.linspace(330.0, 337.765, len(months)), index=months)
    core.loc[pd.Timestamp("2026-09-01")] = 338.10    # +0.0992% -> 0.1% as published
    core.loc[pd.Timestamp("2026-10-01")] = 339.11    # +0.3%
    head = core * 0.98
    head.loc[pd.Timestamp("2026-09-01")] = head.loc[pd.Timestamp("2026-08-01")] * 1.002
    days = pd.date_range("2026-01-01", "2027-03-31", freq="D")
    target = pd.Series(np.where(days >= pd.Timestamp("2026-09-17"), 4.00, 3.75), index=days)   # hike 16 Sep, then holds
    return {"CPILFESL": core, "CPIAUCSL": head, "DFEDTARU": target, "DGS2": yields["2Y"], "DGS10": yields["10Y"]}


def market_boj() -> pd.Series:
    return pd.Series([1.0, 1.25, 1.5, 1.75],
                     index=pd.to_datetime(["2025-12-22", "2026-06-17", "2026-09-24", BOJ_EFFECTIVE]))


def world(*, macro: bool = True, fred_overrides: dict[str, pd.Series] | None = None,
          extra_bars: dict[str, pd.DataFrame] | None = None, vix: pd.Series | None = None,
          cut: str | None = None) -> FakeProvider:
    """The synthetic market; `cut` truncates every series at that date (to test for look-ahead)."""
    bars = {**market_bars(), **(extra_bars or {})}
    btc = market_btc()
    yields = market_yields()
    fred = {**market_fred(yields), **(fred_overrides or {})}
    boj = market_boj()
    if cut:
        ts = pd.Timestamp(cut)
        bars = {t: b.loc[:ts] for t, b in bars.items()}
        btc, yields, boj = btc.loc[:ts], {k: v.loc[:ts] for k, v in yields.items()}, boj.loc[:ts]
        fred = {k: v.loc[:ts] for k, v in fred.items()}
    provider = FakeProvider(bars=bars, btc=btc, vix=vix)
    if macro:
        provider.macro_data = FakeMacroData(yields=yields, fred=fred, boj=boj)
    return provider


def make_cfg(calendar: Path, **overrides: Any) -> Config:
    base = load_config()
    const = copy.deepcopy(base.constitution)
    macro = copy.deepcopy(MACRO_CFG)
    macro["calendar"] = str(calendar)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(macro.get(key), dict):
            macro[key].update(value)
        else:
            macro[key] = value
    const["shadow"]["MACRO"] = macro
    return Config(account=base.account, constitution=const, whitelist=base.whitelist,
                  constitution_sha256=base.constitution_sha256)


def write_calendar(path: Path, onsets: str = "[]", text: str = TEST_CALENDAR) -> Path:
    path.write_text(text.replace("ONSETS", onsets), encoding="utf-8")
    return path


def run_days(cfg: Config, provider: Any, state_dir: Path, start: str, end: str) -> list[pipeline.Run]:
    """The macro runner alone, once per NYSE session in [start, end], each in its own run transaction."""
    runs = []
    for d in pd.date_range(start, end, freq="D"):
        day = d.strftime("%Y-%m-%d")
        if not is_trading_day(day):
            continue
        run = pipeline.Run(cfg, provider, state_dir, "daily", day)
        assert run.begin()
        runner.daily(run, {})
        run.finish("ok")
        run.close()
        runs.append(run)
    return runs


def state_of(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def events_of(state_dir: Path) -> dict[str, dict]:
    return {e["id"]: e for e in state_of(state_dir)["shadow"]["MACRO"]["events"]}


def ledger_payloads(state_dir: Path) -> list[dict]:
    lines = (state_dir / "ledger.jsonl").read_text().splitlines()
    return [json.loads(line)["payload"] for line in lines
            if json.loads(line)["record_type"] == "shadow"]


def new_state(tmp_path: Path, cfg: Config, created: str = LAUNCH) -> Path:
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=created)
    return state_dir


@pytest.fixture(scope="module")
def scenario(tmp_path_factory) -> dict:
    """The full October-November 2026 scenario, run once: 29 Sep to 4 Dec, the macro runner alone."""
    tmp = tmp_path_factory.mktemp("macro")
    cfg = make_cfg(write_calendar(tmp / "calendar.yaml", ONSET))
    state_dir = new_state(tmp, cfg)
    provider = world()
    runs = run_days(cfg, provider, state_dir, LAUNCH, "2026-12-04")
    return {"cfg": cfg, "state_dir": state_dir, "provider": provider, "runs": runs,
            "events": events_of(state_dir), "state": state_of(state_dir), "ledger": ledger_payloads(state_dir)}


def adj(ticker: str) -> pd.Series:
    return ms.total_return_closes(market_bars()[ticker])


def move(ticker: str, start: str, end: str) -> float:
    s = adj(ticker)
    return float(s.loc[end] / s.loc[start] - 1.0)


# ------------------------------------------------------------------------------ the checked-in calendar

def test_real_calendar_holds_the_official_dates() -> None:
    cal = load_calendar()
    assert set(cal.coverage) == set(KINDS) and cal.verified and len(cal.sha256) == 64
    in_2026 = {k: [r.date for r in cal.of_kind(k) if r.date.startswith("2026")] for k in KINDS}
    assert {k: len(v) for k, v in in_2026.items()} == {"CPI": 12, "NFP": 12, "FOMC": 8, "GDP": 13, "PCE": 13,
                                                      "BOJ": 8, "ECB": 8}
    # the catalysts named in design §11 and tracks 08 and 17, as the official schedules give them
    listed = {r.id for r in cal.releases}
    assert {"NFP:2026-10-02", "CPI:2026-10-14", "FOMC:2026-10-28", "GDP:2026-10-29", "PCE:2026-10-29",
            "ECB:2026-10-29", "BOJ:2026-10-30", "NFP:2026-11-06", "CPI:2026-11-10", "NFP:2026-12-04",
            "FOMC:2026-12-09", "CPI:2026-12-10", "FOMC:2027-01-27", "FOMC:2027-03-17", "BOJ:2026-12-18",
            "ECB:2026-12-17"} <= listed
    domains = {"CPI": "www.bls.gov", "NFP": "www.bls.gov", "FOMC": "www.federalreserve.gov", "GDP": "www.bea.gov",
               "PCE": "www.bea.gov", "BOJ": "www.boj.or.jp", "ECB": "www.ecb.europa.eu"}
    for kind, host in domains.items():
        assert cal.sources[kind].startswith(f"https://{host}/"), cal.sources[kind]
        lo, hi = cal.coverage[kind]
        assert lo <= "2026-01-01" and hi >= "2026-12-31"             # every 2026 date is listed
    for r in cal.releases:
        assert pd.Timestamp(r.date).weekday() < 5, r.id              # releases fall on weekdays
    sessions = pd.DatetimeIndex([d for d in pd.date_range("2026-01-01", "2028-01-31") if is_trading_day(d)])
    assert reaction_session(sessions, "2026-04-03") == "2026-04-06"   # Good Friday payrolls: Monday's session
    assert all(reaction_session(sessions, r.date) == r.date for r in cal.releases if r.date != "2026-04-03")


def test_reaction_session_rules() -> None:
    assert reaction_session(SESSIONS, "2026-10-14") == "2026-10-14"
    assert reaction_session(SESSIONS, "2026-10-14", during_session=False) == "2026-10-15"
    assert reaction_session(SESSIONS, "2026-10-17") == "2026-10-19"              # a Saturday
    assert reaction_session(SESSIONS[SESSIONS <= "2026-10-13"], "2026-10-14") is None


@pytest.mark.parametrize("bad, message", [
    ("kinds: {XYZ: {covered: [2026-01-01, 2026-12-31]}}", "unknown release kind"),
    ("kinds: {CPI: {covered: [2026-01-01, 2026-12-31], releases: [{date: 2027-01-13}]}}", "outside"),
    ("kinds: {CPI: {covered: [2026-01-01, 2026-12-31], releases: [{date: 2026-10-14}, {date: 2026-10-14}]}}",
     "twice"),
    ("kinds: {CPI: {covered: [2026-01-01, 2026-12-31], releases: [{date: 2026-10-14, status: maybe}]}}", "status"),
    ("kinds: {CPI: {covered: [2026-01-01, 2026-12-31], releases: [{date: 14 Oct}]}}", "not a YYYY-MM-DD"),
    ("kinds: {CPI: {covered: [2026-12-31]}}", "covered"),
    ("verified: 2026-09-29", "kinds"),
])
def test_calendar_validation(bad: str, message: str) -> None:
    with pytest.raises(CalendarError, match=message):
        parse_calendar(bad)


def test_calendar_accepts_unquoted_dates_and_reports_coverage_gaps() -> None:
    cal = parse_calendar("kinds: {CPI: {covered: [2026-01-01, 2026-12-31], releases: [{date: 2026-10-14}]},"
                         " BOJ: {covered: [2027-01-01, 2027-12-31]}}\n"
                         "geopolitical_onsets: [{date: 2026-11-04, label: x, during_session: false}]")
    assert [r.id for r in cal.releases] == ["CPI:2026-10-14"] and cal.releases[0].time == ""
    assert cal.covers("CPI", "2026-06-01") and not cal.covers("CPI", "2027-01-04")
    assert not cal.covers("GDP", "2026-06-01")
    assert cal.coverage_gaps("2026-06-01", ["CPI", "BOJ", "GDP"]) == {"before": ["BOJ"], "after": ["GDP"]}
    assert cal.onsets[0].id == "ONSET:2026-11-04" and cal.onsets[0].during_session is False
    with pytest.raises(CalendarError, match="no calendar"):
        load_calendar("/nonexistent/econ_calendar.yaml")


def test_constitution_block_matches_the_runner() -> None:
    real = load_config().shadow("MACRO")
    assert real["enabled"] is True and load_calendar(real["calendar"]).releases
    for key in ("reverify_days", "pending_sessions", "releases", "W3", "W4", "GOLD_FADE"):
        assert key in real
    for rule, cfg in (("W3", W3_CFG), ("W4", W4_CFG), ("GOLD_FADE", GOLD_CFG)):
        assert set(cfg) <= set(real[rule]), rule
        assert real[rule]["promotion"] == cfg["promotion"], rule        # R1 and R2, as pre-registered
    assert real["W3"]["d2y_max_bp"] == -6 and real["W3"]["core_cpi_mm_max"] == 0.1 and real["W3"]["hold_sessions"] == 20
    assert set(real["releases"]["assets"]) == {"SPY", "TLT", "GLD", "USO", "USD", "BTC"}


# ----------------------------------------------------------------------------- parsers and the live client

def test_parse_treasury_fixture() -> None:
    frame = parse_treasury_csv((FIXTURES / "treasury_2026.csv").read_text())
    assert frame.index.is_monotonic_increasing and frame.index[-1] == pd.Timestamp("2026-09-28")
    assert frame.at[pd.Timestamp("2026-09-28"), "2 Yr"] == 4.92
    assert frame.at[pd.Timestamp("2026-09-25"), "10 Yr"] == 5.17
    with pytest.raises(ValueError):
        parse_treasury_csv("When,2 Yr\n09/28/2026,4.92\n")


def test_parse_boj_fixture() -> None:
    rate = parse_boj_rate_csv((FIXTURES / "boj_cdab0101.csv").read_bytes())
    assert rate.loc["2024-08-01"] == 0.5 and rate.loc["2025-12-22"] == 1.0 and rate.iloc[-1] == 1.5
    assert rate.index[-1] == pd.Timestamp("2026-09-24")               # the 18 Sep 2026 hike, effective 24 Sep
    with pytest.raises(ValueError):
        parse_boj_rate_csv(b"no rows here")


class FakeResponse:
    def __init__(self, status_code: int = 200, text: str = "", content: bytes | None = None) -> None:
        self.status_code = status_code
        self.text = text
        self.content = content if content is not None else text.encode()


class FakeSession:
    def __init__(self, handler) -> None:
        self.handler = handler
        self.calls: list[dict] = []

    def get(self, url, params=None, headers=None, timeout=None, allow_redirects=True):
        self.calls.append({"url": url, "params": dict(params or {}), "headers": dict(headers or {}),
                           "timeout": timeout})
        return self.handler(url, dict(params or {}))


def test_live_macro_data_sources_and_memo() -> None:
    treasury_2026 = (FIXTURES / "treasury_2026.csv").read_text()
    treasury_2025 = 'Date,"2 Yr","10 Yr"\n12/31/2025,3.47,4.17\n'
    boj = (FIXTURES / "boj_cdab0101.csv").read_bytes()

    def handler(url: str, params: dict) -> FakeResponse:
        if url == TREASURY_CSV_URL.format(year=2026):
            return FakeResponse(text=treasury_2026)
        if url == TREASURY_CSV_URL.format(year=2025):
            return FakeResponse(text=treasury_2025)
        if url == FRED_CSV_URL:
            return FakeResponse(text=f"observation_date,{params['id']}\n2026-09-24,4.87\n2026-09-25,4.81\n")
        if url == BOJ_BASIC_LOAN_RATE_URL:
            return FakeResponse(content=boj)
        raise AssertionError(url)

    session = FakeSession(handler)
    md = LiveMacroData(session=session, sleep=lambda s: None)
    two = md.treasury_yields("2Y", [2025, 2026])
    assert two.loc["2025-12-31"] == 3.47 and two.loc["2026-09-28"] == 4.92
    assert session.calls[0]["params"] == {"type": "daily_treasury_yield_curve", "field_tdr_date_value": "2025",
                                          "page": "", "_format": "csv"}
    assert md.treasury_yields("10Y", [2026]).loc["2026-09-28"] == 5.24
    assert md.fred_series("DGS2").loc["2026-09-25"] == 4.81 and md.boj_basic_loan_rate().iloc[-1] == 1.5
    md.fred_series("DGS2")
    assert len(session.calls) == 4                                   # two years, FRED once, BoJ once: memoised
    assert all(c["headers"]["User-Agent"].startswith("traderec/") and c["timeout"] == 20.0 for c in session.calls)
    assert md.sources == {"yield:2Y": "treasury", "yield:10Y": "treasury", "fred:DGS2": "fred",
                          "boj:basic_loan_rate": "boj"}
    with pytest.raises(ValueError):
        md.treasury_yields("5Y")


def test_live_macro_data_retries_then_fails_closed() -> None:
    answers = [FakeResponse(503), FakeResponse(text="observation_date,DGS10\n2026-09-25,5.17\n")]
    sleeps: list[float] = []
    md = LiveMacroData(session=FakeSession(lambda url, params: answers.pop(0)), sleep=sleeps.append)
    assert md.fred_series("DGS10").iloc[-1] == 5.17 and sleeps == [1.0]
    calls: list[str] = []
    md = LiveMacroData(session=FakeSession(lambda url, params: calls.append(url) or FakeResponse(404)),
                       sleep=sleeps.append)
    with pytest.raises(DataError):
        md.boj_basic_loan_rate()
    assert len(calls) == 1                                           # a 404 is not retried

    def down(url, params):
        raise requests.ConnectionError("down")

    sleeps.clear()
    md = LiveMacroData(session=FakeSession(down), sleep=sleeps.append)
    with pytest.raises(DataError):
        md.treasury_yields("2Y", [2026])
    assert sleeps == [1.0, 2.0, 4.0]
    md = LiveMacroData(session=FakeSession(lambda url, params: FakeResponse(text="<html>maintenance</html>")),
                       sleep=sleeps.append)
    with pytest.raises(DataError):
        md.fred_series("CPILFESL")


network = pytest.mark.skipif(os.environ.get("RUN_NETWORK_TESTS") != "1",
                             reason="live smoke test: set RUN_NETWORK_TESTS=1 to reach the real data sources")


@network
def test_live_macro_sources() -> None:
    md = LiveMacroData()
    year = pd.Timestamp.now(tz="America/New_York").year
    two = md.treasury_yields("2Y", [year])
    assert len(two) > 5 and 0.0 < two.iloc[-1] < 15.0
    assert ms.cpi_mm(md.fred_series("CPILFESL"), (pd.Timestamp.now() - pd.DateOffset(months=3)).strftime("%Y-%m"))
    assert md.fred_series("DFEDTARU").iloc[-1] > 0.0
    boj = md.boj_basic_loan_rate()
    assert boj.index[-1] >= pd.Timestamp("2026-09-24") and 0.0 < boj.iloc[-1] < 10.0


def test_macro_data_reached_through_the_provider() -> None:
    fake = FakeMacroData()
    provider = FakeProvider()
    assert macro_data_for(provider) is None                          # a fake without macro data: fail closed
    provider.macro_data = fake
    assert macro_data_for(provider) is fake
    live = LiveProvider(load_config())
    md = macro_data_for(live)
    assert isinstance(md, LiveMacroData) and macro_data_for(live) is md   # one client per run
    with pytest.raises(DataError):
        fake.treasury_yields("2Y")


# ------------------------------------------------------------------------------------------ the pure rules

def test_window_move_prices_and_yields() -> None:
    px = pd.Series([100.0, 101.0, 99.99], index=pd.to_datetime(["2026-10-09", "2026-10-12", "2026-10-13"]))
    assert ms.window_move(px, "2026-10-09", "2026-10-12") == pytest.approx(0.01)
    assert ms.window_move(px, "2026-10-08", "2026-10-12") is None    # nothing on or before the start
    assert ms.window_move(px, "2026-10-12", "2026-10-14") is None    # no value on the end date
    y = pd.Series([4.90, 4.82], index=pd.to_datetime(["2026-10-09", "2026-10-13"]))     # 12 Oct: bond holiday
    assert ms.window_move(y, "2026-10-09", "2026-10-13", is_yield=True) == pytest.approx(-8.0)
    assert ms.window_move(y, "2026-10-09", "2026-10-12", is_yield=True) is None   # no bond close in the window
    assert ms.window_move(None, "2026-10-09", "2026-10-13") is None
    assert ms.value_at_or_before(y, "2026-10-12") == 4.90


def test_buckets_use_track_17_thresholds() -> None:
    th = MACRO_CFG["releases"]["buckets_bp"]
    assert [ms.bucket("FOMC", v, th) for v in (5.0, 4.9, -7.0, -6.9)] == ["hawkish", "neutral", "dovish", "neutral"]
    assert [ms.bucket("CPI", v, th) for v in (4.0, -6.0, 0.0)] == ["hawkish", "dovish", "neutral"]
    assert [ms.bucket("NFP", v, th) for v in (8.0, -6.0, 7.9)] == ["hawkish", "dovish", "neutral"]
    assert ms.bucket("GDP", 20.0, th) is None and ms.bucket("CPI", None, th) is None


def test_cpi_mm_is_rounded_half_up_as_published() -> None:
    idx = pd.to_datetime(["2026-08-01", "2026-09-01"])
    assert ms.cpi_mm(pd.Series([100.0, 100.05], index=idx), "2026-09")["rounded"] == 0.1
    assert ms.cpi_mm(pd.Series([100.0, 100.049], index=idx), "2026-09")["rounded"] == 0.0
    assert ms.cpi_mm(pd.Series([100.0, 99.95], index=idx), "2026-09")["rounded"] == -0.1
    got = ms.cpi_mm(pd.Series([337.765, 338.10], index=idx), "2026-09")
    assert got["rounded"] == 0.1 and got["pct"] == pytest.approx(0.0991814, abs=1e-6)
    assert ms.cpi_mm(pd.Series([100.0], index=idx[:1]), "2026-09") is None     # the month is not published yet
    assert ms.cpi_mm(None, "2026-09") is None and ms.cpi_mm(pd.Series([1.0], index=idx[:1]), None) is None


def test_fed_decision_reads_the_target_the_day_after() -> None:
    days = pd.date_range("2026-09-10", "2026-09-17", freq="D")
    target = pd.Series([3.75] * 7 + [4.00], index=days)
    assert ms.fed_decision(target, "2026-09-16") == {"change_bp": 25.0, "before": 3.75, "after": 4.0,
                                                     "effective": "2026-09-17"}
    assert ms.fed_decision(target.loc[:"2026-09-16"], "2026-09-16") is None   # not published yet
    assert ms.fed_decision(target, "2026-09-12")["change_bp"] == 0.0


def test_boj_decision_waits_for_the_effective_date() -> None:
    rate = market_boj()
    assert ms.boj_decision(rate.loc[:"2026-10-30"], BOJ_DAY, "2026-10-30", 10) is None          # pending
    hike = ms.boj_decision(rate, BOJ_DAY, BOJ_EFFECTIVE, 10)
    assert hike == {"change_bp": 25.0, "before": 1.5, "after": 1.75, "effective": BOJ_EFFECTIVE}
    assert ms.boj_decision(rate, "2026-12-18", "2026-12-24", 10) is None                      # not yet known
    assert ms.boj_decision(rate, "2026-12-18", "2026-12-28", 10)["change_bp"] == 0.0          # held
    assert ms.boj_decision(rate, "2026-09-18", "2026-09-30", 10)["effective"] == "2026-09-24"


def test_nearest_fomc_pairs_within_the_limit() -> None:
    fomc = ["2026-10-28", "2026-12-09", "2027-01-27"]
    assert ms.nearest_fomc("2026-10-30", fomc, 10) == "2026-10-28"
    assert ms.nearest_fomc("2026-12-18", fomc, 10) == "2026-12-09"
    assert ms.nearest_fomc("2027-01-22", fomc, 10) == "2027-01-27"
    assert ms.nearest_fomc("2026-11-20", fomc, 10) is None
    assert ms.nearest_fomc("2026-11-18", ["2026-11-16", "2026-11-20"], 10) == "2026-11-16"   # a tie: the earlier


def test_w3_and_w4_checks_fail_closed() -> None:
    fire = ms.w3_check(-8.0, 0.1, W3_CFG)
    assert fire["trigger"] and fire["complete"]
    assert not ms.w3_check(-5.9, 0.1, W3_CFG)["trigger"]
    assert not ms.w3_check(-8.0, 0.2, W3_CFG)["trigger"]
    wait = ms.w3_check(-8.0, None, W3_CFG)
    assert not wait["trigger"] and not wait["complete"] and "core CPI m/m unavailable" in wait["reasons"]
    done = ms.w3_check(-2.0, None, W3_CFG)                          # a failed test settles it: no need to wait
    assert not done["trigger"] and done["complete"]
    assert ms.w4_check(25.0, 0.0)["trigger"]
    assert not ms.w4_check(25.0, 25.0)["trigger"] and not ms.w4_check(0.0, 0.0)["trigger"]
    assert not ms.w4_check(-25.0, 0.0)["trigger"]                   # a cut is not a hike
    assert ms.w4_check(None, 0.0)["complete"] is False and ms.w4_check(0.0, None)["complete"] is True


def _frame(opens: list[float], closes: list[float], start: str = "2026-10-01", adj: list[float] | None = None
           ) -> pd.DataFrame:
    idx = pd.DatetimeIndex([d for d in pd.date_range(start, periods=len(opens) * 2, freq="B")
                            if is_trading_day(d)][:len(opens)])
    return pd.DataFrame({"open": opens, "high": closes, "low": closes, "close": closes,
                         "adj_close": closes if adj is None else adj, "volume": 1e6}, index=idx)


def test_advance_trade_long_time_stop_with_distributions() -> None:
    b = _frame([10.0, 10.2, 10.4, 10.6, 10.8], [10.1, 10.3, 10.5, 10.7, 10.9],
               adj=[9.9 * 10.1 / 10.0, 9.9 * 10.3 / 10.0, 10.5, 10.7, 10.9])   # a 1% distribution on day 3
    trade = ms.new_trade("W3", "W3:x", "2026-09-30", "TLT", "long", 2)
    assert ms.advance_trade(trade, b, "2026-10-01", 0.001, ms.time_exit_check(2)) == ["entry"]
    assert trade["entry_date"] == "2026-10-01" and trade["entry_price"] == pytest.approx(10.01)
    assert ms.advance_trade(trade, b, "2026-10-02", 0.001, ms.time_exit_check(2)) == ["exit_signal"]
    assert trade["exit_signal_date"] == "2026-10-02" and trade["sessions_held"] == 2
    assert ms.advance_trade(trade, b, "2026-10-06", 0.001, ms.time_exit_check(2)) == ["exit"]
    assert trade["exit_date"] == "2026-10-05" and trade["held"] == 2 and trade["exit_price"] == pytest.approx(10.3896)
    assert trade["price_return"] == pytest.approx(10.3896 / 10.01 - 1.0)
    entry_factor = 9.9 * 10.1 / 10.0 / 10.1
    assert trade["return"] == pytest.approx(10.3896 / (10.01 * entry_factor) - 1.0)
    assert trade["return"] > trade["price_return"]                  # the distribution counts
    assert ms.advance_trade(trade, b, "2026-10-07", 0.001, ms.time_exit_check(2)) == []


def test_advance_trade_short_and_waiting() -> None:
    b = _frame([100.0, 102.0, 98.0, 97.0], [101.0, 99.0, 97.5, 97.0])
    trade = ms.new_trade("GOLD_FADE", "g", "2026-09-30", "GLD", "short", 1)
    waits = {"count": 0}

    def check(session: str, held: int, t: dict) -> str | None:
        if session == "2026-10-01" and waits["count"] == 0:
            waits["count"] += 1
            return ms.WAIT                                           # data for that close is not there yet
        return "time_stop" if held >= 1 else None

    assert ms.advance_trade(trade, b, "2026-10-02", 0.0002, check) == ["entry"]
    assert trade["status"] == "open" and trade.get("checked") is None
    assert ms.advance_trade(trade, b, "2026-10-02", 0.0002, check) == ["exit_signal", "exit"]
    assert trade["entry_price"] == pytest.approx(100.0 * 0.9998)
    assert trade["exit_price"] == pytest.approx(102.0 * 1.0002)
    assert trade["return"] == pytest.approx(-(102.0 * 1.0002 / (100.0 * 0.9998) - 1.0))
    with pytest.raises(ValueError):
        ms.new_trade("X", "x", "2026-10-01", "GLD", "flat", 1)


def test_exit_checks() -> None:
    ten = pd.Series([5.10, 5.21], index=pd.to_datetime(["2026-10-15", "2026-10-19"]))
    check = ms.w3_exit_check(ten, 5.20, 20, stale=lambda s: s < "2026-10-16")
    trade: dict = {}
    assert check("2026-10-15", 1, trade) is None
    assert check("2026-10-16", 2, trade) == ms.WAIT                   # no 10-year print yet: wait
    assert check("2026-10-14", 2, trade) is None and trade["unchecked"] == ["2026-10-14"]   # stale: skipped
    assert check("2026-10-19", 3, trade) == "invalidation"
    assert check("2026-10-15", 20, trade) == "time_stop"
    closes = pd.Series([59.0, 60.0, 62.6], index=pd.to_datetime(["2026-11-02", "2026-11-03", "2026-11-04"]))
    w4 = ms.w4_exit_check(closes, 0.015, -0.04, 20)
    t = {"entry_open": 60.0}
    assert w4("2026-11-02", 1, t) == "stop" and t["stop_level"] == pytest.approx(60.0 / 1.015)
    assert w4("2026-11-03", 2, t) is None and w4("2026-11-04", 3, t) == "target"
    assert t["target_level"] == pytest.approx(62.5)
    assert w4("2026-11-05", 4, t) == ms.WAIT and w4("2026-11-03", 20, t) == "time_stop"


def test_baseline_uses_only_data_before_entry() -> None:
    bars = market_bars()["SPY"]
    base = ms.baseline_mean(bars, "2026-10-15", 20)
    assert base == pytest.approx((1.0004 ** 20) - 1.0, rel=1e-6)
    changed = bars.copy()
    changed.loc[changed.index > "2026-10-15", ["open", "close", "adj_close"]] *= 3.0     # a different future
    assert ms.baseline_mean(changed, "2026-10-15", 20) == base
    assert ms.baseline_mean(bars.iloc[:50], "2026-10-15", 20) is None                   # too little history
    trade = {"side": "short", "entry_date": "2026-10-15", "held": 20, "return": 0.01}
    assert ms.score_trade(trade, bars)["excess"] == pytest.approx(0.01 + base)


def test_t_pvalue_bh_fdr_and_promotion() -> None:
    assert ms.t_pvalue(2.0687, 23) == pytest.approx(0.05, abs=5e-4)        # t(0.975, 23)
    assert ms.t_pvalue(0.0, 10) == pytest.approx(1.0)
    assert ms.t_pvalue(12.706, 1) == pytest.approx(0.05, abs=5e-4)
    assert ms.t_pvalue(1.96, 100_000) == pytest.approx(0.05, abs=5e-4)
    assert ms.bh_fdr({"a": 0.01, "b": 0.04, "c": 0.5, "d": None}, 0.10) == {"a": True, "b": True, "c": False,
                                                                           "d": False}
    assert ms.bh_fdr({"a": 0.2, "b": 0.3}, 0.10) == {"a": False, "b": False}
    trades = [{"status": "closed", "counted": True, "excess": x, "return": x} for x in
              (0.02, 0.01, 0.03, -0.01, 0.02)]
    trades += [{"status": "closed", "counted": False, "excess": -0.5, "return": -0.5},
               {"status": "open", "excess": None}]
    got = ms.promotion_summary(trades, {"min_instances": 5, "min_t": 2.0})
    assert got["n"] == 5 and got["mean"] == pytest.approx(0.014) and got["hit_rate"] == pytest.approx(0.8)
    assert got["meets_n"] and got["t"] == pytest.approx(0.014 / (np.std([0.02, 0.01, 0.03, -0.01, 0.02], ddof=1)
                                                                  / np.sqrt(5)))
    assert got["meets_t"] == (got["t"] >= 2.0)
    assert ms.promotion_summary([], {"min_instances": 10}) | {} == {
        "n": 0, "mean": None, "sd": None, "t": None, "p": None, "min_instances": 10, "min_t": None,
        "meets_n": False, "meets_t": True, "hit_rate": None}


# ----------------------------------------------------------------------------------- the runner, end to end

def test_disabled_book_is_a_no_op(tmp_path: Path) -> None:
    cfg = make_cfg(write_calendar(tmp_path / "cal.yaml"), enabled=False)
    state_dir = new_state(tmp_path, cfg)
    run_days(cfg, world(), state_dir, CPI_DAY, CPI_DAY)
    assert state_of(state_dir)["shadow"]["MACRO"] == {"events": []}


def test_release_log(scenario: dict) -> None:
    ev = scenario["events"]
    releases = sorted(i for i, e in ev.items() if e["rule"] == "RELEASE")
    assert releases == ["BOJ:2026-10-30", "CPI:2026-10-14", "CPI:2026-11-10", "ECB:2026-10-29", "FOMC:2026-10-28",
                        "GDP:2026-09-30", "GDP:2026-10-29", "GDP:2026-11-25", "NFP:2026-10-02", "NFP:2026-11-06",
                        "NFP:2026-12-04", "PCE:2026-09-30", "PCE:2026-10-29", "PCE:2026-11-25"]
    # nothing before launch: the 10 Sep ECB, 16 Sep FOMC and 18 Sep BoJ decisions are not logged
    cpi = ev["CPI:2026-10-14"]
    assert cpi["signal_date"] == CPI_DAY and cpi["prev_session"] == "2026-10-13" and cpi["reference"] == "2026-09"
    assert cpi["day0"]["TLT"] == pytest.approx(move("TLT", "2026-10-13", CPI_DAY), abs=1e-6)
    assert cpi["day0"]["USO"] == pytest.approx(-0.02, abs=1e-6)
    assert cpi["day0"]["UST2Y"] == -8.0 and cpi["day0"]["UST10Y"] == -8.0 and cpi["bucket"] == "dovish"
    btc = market_btc()
    assert cpi["day0"]["BTC"] == pytest.approx(btc.loc[CPI_DAY] / btc.loc["2026-10-13"] - 1.0, abs=1e-6)
    assert set(cpi["day0"]) == {"SPY", "TLT", "GLD", "USO", "USD", "BTC", "UST2Y", "UST10Y"} and cpi["src"] == {}
    assert cpi["fwd"]["1"]["TLT"] == pytest.approx(move("TLT", CPI_DAY, "2026-10-15"), abs=1e-6)
    assert cpi["fwd"]["20"]["SPY"] == pytest.approx(move("SPY", CPI_DAY, "2026-11-11"), abs=1e-6)
    assert cpi["fwd"]["20"]["UST10Y"] == pytest.approx(13.0)         # 11 Nov has no bond close: 10 Nov's is used
    assert cpi["status"] == "complete" and "missing" not in cpi
    assert ev["NFP:2026-10-02"]["bucket"] == "hawkish" and ev["FOMC:2026-10-28"]["bucket"] == "neutral"
    assert ev["FOMC:2026-10-28"]["day0"]["USD"] == pytest.approx(0.004, abs=1e-6)
    assert ev["GDP:2026-10-29"]["bucket"] is None                    # no thresholds for GDP
    assert ev["GDP:2026-10-29"]["same_session"] == ["ECB:2026-10-29", "PCE:2026-10-29"]
    nov10 = ev["CPI:2026-11-10"]
    assert nov10["status"] == "open" and set(nov10["fwd"]) == {"1", "5", "20"} - {"20"}
    assert "UST2Y" not in nov10["fwd"]["1"]                          # 11 Nov: no bond close in the window
    assert ev["NFP:2026-12-04"]["fwd"] == {}
    complete = [e for e in ev.values() if e["rule"] == "RELEASE" and e["status"] == "complete"]
    assert {e["id"] for e in complete} == {"GDP:2026-09-30", "PCE:2026-09-30", "NFP:2026-10-02", "CPI:2026-10-14",
                                           "FOMC:2026-10-28", "GDP:2026-10-29", "PCE:2026-10-29", "ECB:2026-10-29",
                                           "BOJ:2026-10-30"}
    logged = [p for p in scenario["ledger"] if p.get("rule") == "RELEASE"]
    assert sum(p["event"] == "release" for p in logged) == 14 and sum(p["event"] == "complete" for p in logged) == 9
    assert all(p.get("calendar_sha256") for p in logged if p["event"] == "release")


def test_w3_buys_tlt_after_the_cool_cpi_and_exits_on_invalidation(scenario: dict) -> None:
    ev = scenario["events"]
    w3 = ev["CPI:2026-10-14"]["w3"]
    assert w3["status"] == "evaluated" and w3["trigger"] and w3["evaluated"] == CPI_DAY
    assert w3["core_cpi_mm"]["rounded"] == 0.1 and w3["headline_cpi_mm"] == 0.2 and w3["d2y_bp"] == -8.0
    assert ev["CPI:2026-11-10"]["w3"]["trigger"] is False             # the 2-year did not fall: settled at once
    trade = ev[f"W3:{CPI_DAY}"]
    tlt = market_bars()["TLT"]
    assert trade["status"] == "closed" and trade["exit_reason"] == "invalidation"
    assert trade["entry_date"] == "2026-10-15" and trade["exit_signal_date"] == "2026-11-05"
    assert trade["exit_date"] == "2026-11-06" and trade["sessions_held"] == 16 and trade["held"] == 16
    assert trade["pre_release_10y"] == 5.20
    entry = float(tlt.at[pd.Timestamp("2026-10-15"), "open"]) * 1.0003
    exit_ = float(tlt.at[pd.Timestamp("2026-11-06"), "open"]) * 0.9997
    assert trade["entry_price"] == pytest.approx(entry) and trade["exit_price"] == pytest.approx(exit_)
    assert trade["price_return"] == pytest.approx(exit_ / entry - 1.0, abs=1e-6)
    assert trade["return"] > trade["price_return"] + 0.003           # the 2 Nov distribution is included
    base = ms.baseline_mean(tlt, "2026-10-15", 16)
    assert trade["baseline"] == pytest.approx(base, abs=1e-6) and trade["excess"] == pytest.approx(
        trade["return"] - base, abs=1e-6)
    assert trade["forecast"] == {"question": "TLT total return from entry to exit above 0", "p": 0.55,
                                 "outcome": 1, "brier": pytest.approx(0.2025)}
    events = [p["event"] for p in scenario["ledger"] if p.get("rule") == "W3"]
    assert events == ["signal", "trade", "entry", "exit_signal", "exit", "no_signal"]   # the last: 10 Nov's CPI


def test_w4_waits_for_the_boj_file_then_buys_fxy(scenario: dict) -> None:
    ev = scenario["events"]
    w4 = ev["BOJ:2026-10-30"]["w4"]
    assert w4["status"] == "evaluated" and w4["trigger"] and w4["evaluated"] == BOJ_EFFECTIVE
    assert w4["fomc"] == FOMC_DAY and w4["signal_date"] == BOJ_DAY
    assert w4["boj"]["change_bp"] == 25.0 and w4["fed"] == {"change_bp": 0.0, "before": 4.0, "after": 4.0,
                                                           "effective": "2026-10-29"}
    trade = ev[f"W4:{BOJ_DAY}"]
    assert trade["entry_date"] == BOJ_EFFECTIVE and trade["entry_open"] == pytest.approx(60.0)
    assert trade["exit_reason"] == "target" and trade["exit_signal_date"] == "2026-11-10"
    assert trade["exit_date"] == "2026-11-11" and trade["target_level"] == pytest.approx(62.5)
    assert trade["return"] == pytest.approx(60.0 * 1.006 ** 7 * (1 - 8e-4) / (60.0 * (1 + 8e-4)) - 1.0, abs=1e-6)
    pending = [r for r in scenario["runs"] if r.date == BOJ_DAY][0]
    assert not any("W4" in n for n in pending.result.notes)          # waiting is not a problem
    assert [p["event"] for p in scenario["ledger"] if p.get("rule") == "W4"][:3] == ["signal", "trade", "entry"]


def test_gold_fade_shorts_the_day_after_the_onset(scenario: dict) -> None:
    trade = scenario["events"]["ONSET:2026-11-04"]
    gld = market_bars()["GLD"]
    assert trade["rule"] == "GOLD_FADE" and trade["side"] == "short" and trade["counted"] is True
    assert trade["first_seen"] == LAUNCH and trade["signal_date"] == ONSET_DAY
    assert trade["day0_move"] == pytest.approx(0.02, abs=1e-6)
    assert trade["entry_date"] == "2026-11-05" and trade["exit_date"] == "2026-11-06"
    entry = float(gld.at[pd.Timestamp("2026-11-05"), "open"]) * (1 - 2e-4)
    exit_ = float(gld.at[pd.Timestamp("2026-11-06"), "open"]) * (1 + 2e-4)
    assert trade["return"] == pytest.approx(1.0 - exit_ / entry, abs=1e-6)
    assert trade["research_f1"] == pytest.approx(-0.015, abs=1e-6)
    assert not any(p.get("event") == "near_miss" for p in scenario["ledger"])   # the jump had an onset listed


def test_promotion_record_and_alerts(scenario: dict) -> None:
    meta = scenario["state"]["shadow"]["MACRO"]["meta"]
    promo = meta["promotion"]
    assert promo["W3"]["n"] == 1 and promo["W4"]["n"] == 1 and promo["GOLD_FADE"]["n"] == 1
    assert not any(p["ready"] for p in promo.values())
    assert promo["W3"]["min_instances"] == 24 and promo["GOLD_FADE"]["min_instances"] == 10
    assert meta["last_date"] == "2026-12-04" and meta["calendar_verified"] == "2026-09-29"
    assert set(meta["unavailable"]) == {"market_implied_probability", "options_implied_move", "consensus"}
    alerts = [(a["date"], a["message"]) for a in scenario["state"]["alerts"]]
    stale = ("MACRO: the release calendar was last verified 2026-09-29; re-check the dates against the official "
             "schedules and update 'verified'")
    assert alerts == [("2026-11-30", stale), ("2026-12-01", stale)]   # past 60 days: once a month, nothing else
    ok, why = Ledger(scenario["state_dir"] / "ledger.jsonl").verify()
    assert ok, why


def test_no_look_ahead(tmp_path: Path) -> None:
    """The book on 16 Oct is the same whether or not the data after each run date exists."""
    cfg = make_cfg(write_calendar(tmp_path / "cal.yaml"))
    full_dir = new_state(tmp_path / "full", cfg)
    run_days(cfg, world(), full_dir, LAUNCH, "2026-10-16")
    cut_dir = new_state(tmp_path / "cut", cfg)
    for d in pd.date_range(LAUNCH, "2026-10-16", freq="D"):
        day = d.strftime("%Y-%m-%d")
        if is_trading_day(day):
            run_days(cfg, world(cut=day), cut_dir, day, day)
    full, cut = state_of(full_dir)["shadow"]["MACRO"]["events"], state_of(cut_dir)["shadow"]["MACRO"]["events"]
    assert full == cut and any(e["rule"] == "W3" for e in full)


def test_fail_closed_without_macro_data(tmp_path: Path) -> None:
    cfg = make_cfg(write_calendar(tmp_path / "cal.yaml"))
    state_dir = new_state(tmp_path, cfg)
    runs = run_days(cfg, world(macro=False), state_dir, "2026-10-12", "2026-10-20")
    ev = events_of(state_dir)
    cpi = ev["CPI:2026-10-14"]
    assert "TLT" in cpi["day0"] and "UST2Y" not in cpi["day0"] and "bucket" not in cpi
    assert cpi["w3"]["status"] == "unavailable" and cpi["w3"]["evaluated"] == "2026-10-19"
    assert not any(e["rule"] == "W3" for e in ev.values())
    before = [r for r in runs if r.date == "2026-10-16"][0]
    assert not any(a for a in before.state["alerts"] if "W3" in a["message"])     # still pending on 16 Oct
    alerts = [a["message"] for a in state_of(state_dir)["alerts"]]
    assert any("W3 for CPI:2026-10-14 not evaluated" in m and "no macro-data adapter" in m for m in alerts)
    assert any("CPI:2026-10-14: day-0 UST2Y, UST10Y unavailable after 3 sessions" in m for m in alerts)
    assert all(a["kind"] == "data" for a in state_of(state_dir)["alerts"])
    payloads = ledger_payloads(state_dir)
    assert any(p.get("event") == "data_problem" for p in payloads)
    assert any(p.get("rule") == "W3" and p["event"] == "unavailable" for p in payloads)


def test_disagreeing_yield_sources_block_w3(tmp_path: Path) -> None:
    cfg = make_cfg(write_calendar(tmp_path / "cal.yaml"))
    state_dir = new_state(tmp_path, cfg)
    fred_two = market_yields()["2Y"].copy()
    fred_two.loc[pd.Timestamp(CPI_DAY)] = 4.87                       # FRED says -3bp, Treasury -8bp
    run_days(cfg, world(fred_overrides={"DGS2": fred_two}), state_dir, CPI_DAY, "2026-10-16")
    ev = events_of(state_dir)
    assert ev["CPI:2026-10-14"]["w3"]["trigger"] is False and not any(e["rule"] == "W3" for e in ev.values())
    assert any("Treasury and FRED 2-year yields disagree on 2026-10-14" in a["message"]
               for a in state_of(state_dir)["alerts"])


def test_missing_core_cpi_waits_then_evaluates(tmp_path: Path) -> None:
    """FRED publishes the core index a day late: W3 is evaluated then, and still enters at the next open."""
    cfg = make_cfg(write_calendar(tmp_path / "cal.yaml"))
    state_dir = new_state(tmp_path, cfg)
    core = market_fred(market_yields())["CPILFESL"].drop(pd.Timestamp("2026-09-01"))
    run_days(cfg, world(fred_overrides={"CPILFESL": core}), state_dir, CPI_DAY, CPI_DAY)
    assert events_of(state_dir)["CPI:2026-10-14"]["w3"]["status"] == "pending"
    run_days(cfg, world(), state_dir, "2026-10-15", "2026-10-15")
    ev = events_of(state_dir)
    assert ev["CPI:2026-10-14"]["w3"]["evaluated"] == "2026-10-15"
    assert ev[f"W3:{CPI_DAY}"]["entry_date"] == "2026-10-15"          # the first open after the CPI day
    assert not state_of(state_dir)["alerts"]


def test_late_listed_onset_is_recorded_but_not_counted(tmp_path: Path) -> None:
    cal = write_calendar(tmp_path / "cal.yaml")
    cfg = make_cfg(cal)
    state_dir = new_state(tmp_path, cfg)
    runs = run_days(cfg, world(), state_dir, "2026-11-02", "2026-11-05")
    assert [p for p in ledger_payloads(state_dir) if p.get("event") == "near_miss"] == [
        {"book": "MACRO", "rule": "GOLD_FADE", "event": "near_miss", "session": ONSET_DAY, "ticker": "GLD",
         "move": pytest.approx(0.02, abs=1e-6)}]
    assert any("GLD +2.00% today with no war onset listed" in n for r in runs for n in r.result.notes)
    write_calendar(tmp_path / "cal.yaml", ONSET)                      # the owner lists it a day late
    run_days(cfg, world(), state_dir, "2026-11-06", "2026-11-06")
    trade = events_of(state_dir)["ONSET:2026-11-04"]
    assert trade["counted"] is False and trade["first_seen"] == "2026-11-06" and trade["status"] == "closed"
    promo = state_of(state_dir)["shadow"]["MACRO"]["meta"]["promotion"]["GOLD_FADE"]
    assert promo["n"] == 0                                           # not counted toward R2's n >= 10


def test_postponed_release_is_voided(tmp_path: Path) -> None:
    cal = write_calendar(tmp_path / "cal.yaml")
    cfg = make_cfg(cal)
    state_dir = new_state(tmp_path, cfg)
    run_days(cfg, world(), state_dir, "2026-11-09", "2026-11-10")
    assert events_of(state_dir)["CPI:2026-11-10"]["status"] == "open"
    cal.write_text(cal.read_text().replace('{date: "2026-11-10", reference: "2026-10"}',
                                           '{date: "2026-11-10", reference: "2026-10", status: postponed}'))
    run_days(cfg, world(), state_dir, "2026-11-12", "2026-11-12")
    rec = events_of(state_dir)["CPI:2026-11-10"]
    assert rec["status"] == "void" and rec["void_reason"] == "postponed in the calendar"


def test_calendar_coverage_and_reverify_alerts(tmp_path: Path) -> None:
    cfg = make_cfg(write_calendar(tmp_path / "cal.yaml"))
    state_dir = new_state(tmp_path, cfg, created="2027-01-04")
    run_days(cfg, world(), state_dir, "2027-01-04", "2027-01-06")
    alerts = [a["message"] for a in state_of(state_dir)["alerts"]]
    assert len(alerts) == 2                                          # each once a month, not every evening
    assert alerts[0].startswith("MACRO: config/econ_calendar.yaml has no CPI, NFP, GDP, PCE dates for 2027-01-04")
    assert "last verified 2026-09-29" in alerts[1]


def test_old_release_records_leave_the_state_but_never_come_back(tmp_path: Path) -> None:
    cfg = make_cfg(write_calendar(tmp_path / "cal.yaml"), state_keep_days=30)
    state_dir = new_state(tmp_path, cfg)
    run_days(cfg, world(), state_dir, LAUNCH, "2026-10-16")
    assert {"GDP:2026-09-30", "PCE:2026-09-30", "NFP:2026-10-02", f"W3:{CPI_DAY}"} <= set(events_of(state_dir))
    run_days(cfg, world(), state_dir, "2026-11-30", "2026-12-01")       # completed on 30 Nov, ...
    ev = events_of(state_dir)
    assert ev["GDP:2026-09-30"]["completed"] == "2026-11-30" and "NFP:2026-11-06" in ev   # later ones still log
    assert ev[f"W3:{CPI_DAY}"]["status"] == "closed"
    run_days(cfg, world(), state_dir, "2027-01-04", "2027-01-04")       # ... gone 30 days later
    ev = events_of(state_dir)
    assert "GDP:2026-09-30" not in ev and "NFP:2026-10-02" not in ev and f"W3:{CPI_DAY}" in ev
    completed = [p["id"] for p in ledger_payloads(state_dir) if p.get("event") == "complete"]
    assert "GDP:2026-09-30" in completed                                  # the ledger keeps the full record
    assert all(v >= "2026-12-05" for v in state_of(state_dir)["shadow"]["MACRO"]["meta"]["alerted"].values())


def test_invalid_calendar_is_a_data_alert(tmp_path: Path) -> None:
    bad = tmp_path / "cal.yaml"
    bad.write_text("kinds: {XYZ: {}}")
    cfg = make_cfg(bad)
    state_dir = new_state(tmp_path, cfg)
    run_days(cfg, world(), state_dir, CPI_DAY, "2026-10-15")
    alerts = state_of(state_dir)["alerts"]
    assert len(alerts) == 1 and alerts[0]["kind"] == "data" and "release calendar unusable" in alerts[0]["message"]


# ------------------------------------------------------------------------------ inside the daily pipeline

class Recorder:
    def __init__(self) -> None:
        self.sent: list = []

    def services(self) -> pipeline.Services:
        def send(email, *, dry_run, outbox):
            self.sent.append(email)
            return {"sent": True, "id": f"msg-{len(self.sent)}"}

        return pipeline.Services(send=send, create_issue=lambda title, body, labels=None: None,
                                 healthcheck=lambda status: None, fetch_comments=lambda url: [])


def test_inside_the_daily_pipeline(tmp_path: Path) -> None:
    """The whole daily run with every Phase A module: the book runs in the shadow guard without an error, and
    the monthly report reads it."""
    cfg = make_cfg(write_calendar(tmp_path / "cal.yaml", ONSET))
    state_dir = new_state(tmp_path, cfg)
    spy = market_bars()["SPY"]
    extra = {t: _bars(_path(start, drift)) for t, start, drift in (
        ("QQQ", 500.0, 0.0005), ("IEF", 95.0, 0.0001), ("FXE", 100.0, 0.0), ("FXA", 65.0, 0.0001),
        ("IBIT", 50.0, 0.001))}
    extra["^GSPC"] = spy * 10.0
    vix = pd.Series(16.0, index=SESSIONS)
    extra["^VIX"] = _bars(vix)
    provider = world(extra_bars=extra, vix=vix)
    rec = Recorder()
    results = []
    for d in pd.date_range(LAUNCH, "2026-10-30", freq="D"):
        day = d.strftime("%Y-%m-%d")
        if d.weekday() < 5:
            results.append(pipeline.run_daily(cfg, provider, state_dir, date=day, services=rec.services()))
    assert {r.status for r in results} == {"ok"}
    st = state_of(state_dir)
    assert not [a for a in st["alerts"] if a["kind"] in ("shadow", "validator")], st["alerts"]
    ev = {e["id"]: e for e in st["shadow"]["MACRO"]["events"]}
    assert ev[f"W3:{CPI_DAY}"]["status"] == "open" and ev["CPI:2026-10-14"]["bucket"] == "dovish"
    assert not [e for e in rec.sent if "MACRO" in e.subject or "W3" in e.subject]     # never emailed
    ok, why = Ledger(state_dir / "ledger.jsonl").verify()
    assert ok, why
    run = pipeline.Run(cfg, provider, state_dir, "daily", "2026-10-30")
    report = facts_mod.monthly_report(run, "2026-10")
    run.close()
    assert any(row["name"].startswith("MACRO") for row in report["shadow"])
    email = email_mod.render_monthly(report, {"mode": "paper", "nav": report["nav"], "ledger_head": "x",
                                             "data_asof": report["asof"], "sources": ["fake"],
                                             "constitution_version": cfg.version})
    assert validator.validate(email) == []
