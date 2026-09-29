"""Tests for M4, the O2 crash call debit spread (design v3.3 §3 M4), and its 60-DTE paper twin.

Offline and deterministic: synthetic S&P paths and hand-built option chains priced with Black-Scholes. The
synthetic market rises 0.04% a session, then falls 1.5% a session for 12 sessions from 1 Oct 2025 with the VIX at
35, then recovers. 0.985^11 - 1 = -15.3%, so the 11th down day (15 Oct 2025) is the first signal day.

Tests that need the options build (`run_options`, `PaperBroker.fill_spreads` / `spreads`) are written against
docs/PHASE_B_CONTRACTS.md and skipped until it is merged; the rest emulate the 10:17 ET job by calling the M4 hooks.
"""
from __future__ import annotations

import copy
import json
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from traderec import emails, forecasts, pipeline, validator
from traderec.broker import PaperBroker
from traderec.config import Config, load_config
from traderec.email_text import m4 as m4_text
from traderec.market_calendar import is_trading_day, next_trading_day
from traderec.modules import m4_crashspread as m4
from traderec.options.chain import CHAIN_COLUMNS, OptionChain, occ_symbol
from traderec.runners import m4 as m4r
from traderec.types import Fill, Recommendation

SIG_CFG = {"drop_from_high": -0.15, "high_sessions": 252, "vix_min": 30.0, "cooldown_days": 90}
START, END = "2024-06-03", "2026-06-30"
SESSIONS = pd.DatetimeIndex([d for d in pd.date_range(START, END, freq="B") if is_trading_day(d)])
CRASH_START = pd.Timestamp("2025-10-01")
SIGNAL = "2025-10-15"          # the 11th down day
ENTRY = "2025-10-16"
EXPIRY = "2026-01-09"          # the last Friday on or before 16 Oct + 90 days (14 Jan)
EXIT = "2026-01-07"            # two sessions before expiry
LAST = "2026-01-08"            # the last session before expiry
LAUNCH = "2025-09-29"


# ----------------------------------------------------------------------------------------------- helpers

def _ncdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def bs_call(s: float, k: float, t: float, r: float = 0.04, vol: float = 0.35) -> float:
    d1 = (math.log(s / k) + (r + 0.5 * vol * vol) * t) / (vol * math.sqrt(t))
    return s * _ncdf(d1) - k * math.exp(-r * t) * _ncdf(d1 - vol * math.sqrt(t))


def make_chain(root: str, asof: str, spot: float, *, vol: float = 0.35, spread: float = 0.01, oi: float = 1000,
               expiries: list[str] | None = None) -> OptionChain:
    """Calls on Friday expiries up to 130 days out, strikes $1 apart from 70% to 130% of spot."""
    d0 = pd.Timestamp(asof[:10])
    if expiries is None:
        expiries = [d.strftime("%Y-%m-%d") for d in pd.date_range(d0 + pd.Timedelta(days=1),
                                                                   d0 + pd.Timedelta(days=130))
                    if d.weekday() == 4 and is_trading_day(d)]
    rows = []
    for e in expiries:
        t = max((pd.Timestamp(e) - d0).days, 1) / 365.0
        for k in range(int(spot * 0.7), int(spot * 1.3) + 1):
            px = bs_call(spot, k, t, vol=vol)
            half = max(px * spread / 2.0, 0.025)
            bid, ask = round(max(px - half, 0.01), 2), round(px + half, 2)
            rows.append({"occ": occ_symbol(root, e, "C", k), "root": root, "right": "C", "strike": float(k),
                         "expiry": e, "bid": bid, "ask": ask, "mid": (bid + ask) / 2, "iv": vol, "delta": np.nan,
                         "gamma": np.nan, "theta": np.nan, "vega": np.nan, "open_interest": oi, "volume": 100,
                         "last_trade_time": asof})
    return OptionChain(underlying=root, asof=asof, spot=float(spot), source="fake",
                       frame=pd.DataFrame(rows, columns=CHAIN_COLUMNS))


def frames(closes, vix, start: str = "2023-01-02") -> tuple[pd.DataFrame, pd.Series]:
    idx = pd.bdate_range(start, periods=len(closes))
    c = pd.Series(np.asarray(closes, dtype=float), index=idx)
    df = pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "adj_close": c, "volume": 1e6})
    return df, pd.Series(np.asarray(vix, dtype=float), index=idx)


def crash(n_up: int = 300, n_down: int = 12, n_flat: int = 40, vix_crash: float = 35.0,
          vix_days: int | None = None) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    closes = list(100.0 * 1.0004 ** np.arange(n_up))
    closes += [closes[-1] * 0.985 ** (i + 1) for i in range(n_down)]
    closes += [closes[-1]] * n_flat
    n_vix = n_down + (n_flat if vix_days is None else vix_days)
    vix = [15.0] * n_up + [vix_crash] * n_vix + [15.0] * (len(closes) - n_up - n_vix)
    spx, v = frames(closes, vix)
    return spx, v, [d.strftime("%Y-%m-%d") for d in spx.index]


def _bars(close: pd.Series) -> pd.DataFrame:
    prev = close.shift(1).fillna(close.iloc[0])
    return pd.DataFrame({"open": prev * 1.0002, "high": np.maximum(prev, close) * 1.001,
                         "low": np.minimum(prev, close) * 0.999, "close": close, "adj_close": close,
                         "volume": 1_000_000.0})


class CrashProvider:
    """DataProvider with the synthetic crash and hand-built option chains (`chain_asof` is the snapshot time)."""

    def __init__(self, *, vix_level: float = 35.0) -> None:
        r = np.full(len(SESSIONS), 0.0004)
        i0 = SESSIONS.get_loc(CRASH_START)
        r[i0:i0 + 12] = -0.015
        r[i0 + 12:i0 + 32] = 0.008
        spy = pd.Series(400.0 * np.cumprod(1.0 + r), index=SESSIONS)
        vix = pd.Series(15.0, index=SESSIONS)
        vix.iloc[i0:i0 + 25] = vix_level
        self.frames = {"SPY": _bars(spy), "^GSPC": _bars(spy * 10.0), "^VIX": _bars(vix)}
        self.vix_series = vix
        self.chain_asof: str | None = None
        self.chain_kwargs: dict[str, dict] = {}
        self.chain_errors: set[str] = set()
        self.spot_bias: dict[str, float] = {}
        self.second: dict[tuple[str, str], float | None] = {}
        self.chain_calls: list[tuple[str, str | None]] = []

    def daily_bars(self, ticker: str) -> pd.DataFrame:
        if ticker not in self.frames:
            raise KeyError(ticker)
        return self.frames[ticker]

    def vix(self, name: str = "VIX") -> pd.Series:
        return self.vix_series

    def btc_daily_utc(self) -> pd.Series:
        raise KeyError("no bitcoin in this market")

    def tbill_rate(self) -> float:
        return 0.04

    def second_source_close(self, ticker: str, date: str) -> dict | None:
        if (ticker, date) in self.second:
            v = self.second[(ticker, date)]
            return None if v is None else {"close": v, "source": "fred:SP500"}
        df = self.frames.get(ticker)
        ts = pd.Timestamp(date)
        if df is None or ts not in df.index:
            return None
        return {"close": float(df.at[ts, "close"]), "source": "nasdaq"}

    def close(self, root: str, day: str) -> float:
        ticker, scale = ("^GSPC", 0.1) if root == "XSP" else (root, 1.0)
        return float(self.frames[ticker]["close"].loc[:pd.Timestamp(day)].iloc[-1]) * scale

    def option_chain(self, root: str) -> OptionChain:
        self.chain_calls.append((root, self.chain_asof))
        if root in self.chain_errors or self.chain_asof is None:
            raise RuntimeError(f"no {root} chain")
        spot = self.close(root, self.chain_asof[:10]) * self.spot_bias.get(root, 1.0)
        return make_chain(root, self.chain_asof, spot, **self.chain_kwargs.get(root, {}))


class Recorder:
    def __init__(self) -> None:
        self.sent: list = []
        self.issues: list = []

    def services(self) -> pipeline.Services:
        def send(email, *, dry_run, outbox):
            self.sent.append(email)
            return {"sent": True, "id": f"msg-{len(self.sent)}"}

        def create_issue(title, body, labels=None):
            self.issues.append((title, body))
            return f"https://github.com/example/repo/issues/{len(self.issues)}"

        return pipeline.Services(send=send, create_issue=create_issue, healthcheck=lambda status: None,
                                 fetch_comments=lambda url: [])


def _cfg(**m4_overrides) -> Config:
    base = load_config()
    const = copy.deepcopy(base.constitution)
    const["modules"]["M2"]["enabled"] = False       # no ETF8 data in this market
    const["modules"]["M3"]["enabled"] = False       # no Bitcoin data in this market
    for name, book in const["shadow"].items():      # the other Phase B shadow books need data this market lacks
        if name not in ("ST1B", "W10", "M4_TWIN"):
            book["enabled"] = False
    const["modules"]["M4"].update(m4_overrides)
    return Config(account=base.account, constitution=const, whitelist=base.whitelist,
                  constitution_sha256=base.constitution_sha256)


@pytest.fixture()
def cfg() -> Config:
    return _cfg()


@pytest.fixture()
def world(tmp_path, cfg):
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    return state_dir, CrashProvider(), Recorder()


def _state(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def _ledger(state_dir: Path) -> list[dict]:
    return [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]


def _days(start: str, end: str) -> list[str]:
    return [d.strftime("%Y-%m-%d") for d in pd.date_range(start, end, freq="D") if is_trading_day(d)]


def daily(cfg, provider, state_dir, rec, day: str, chain_time: str = "22:17:00") -> pipeline.RunResult:
    provider.chain_asof = f"{day}T{chain_time}"
    res = pipeline.run_daily(cfg, provider, state_dir, date=day, services=rec.services())
    assert res.status == "ok", res.summary()
    return res


def run_until(cfg, provider, state_dir, rec, end: str, start: str = LAUNCH) -> None:
    for day in _days(start, end):
        daily(cfg, provider, state_dir, rec, day)


def options_run(cfg, provider, state_dir, rec, day: str, work) -> None:
    """A stand-in for the 10:17 ET options job: one 'options' run in which `work(run)` calls the M4 hooks."""
    provider.chain_asof = f"{day}T10:17:00"
    run = pipeline.Run(cfg, provider, state_dir, "options", day, services=rec.services())
    try:
        assert run.begin()
        work(run)
        run.finish("ok")
    finally:
        run.close()


def fill_order(run, intent_id: str, price: float) -> Fill:
    """What the options build's fill_spreads does for one order, then M4's hook (cash is not moved here)."""
    intent = next(o for o in run.broker.pending() if o.intent_id == intent_id)
    run.broker._pending = [o for o in run.broker._pending if o.intent_id != intent_id]
    fill = Fill(intent_id=intent_id, trade_id=intent.trade_id, module=intent.module, account=intent.account,
                ticker=intent.ticker, side=intent.side, qty=float(intent.contracts), price=price, ref_price=price,
                dollars=intent.contracts * price * 100, fill_date=run.date, slippage_bps=0.0, model_version="1.0",
                multiplier=100, legs=intent.legs, fill_time="10:17")
    m4r.on_spread_fill(run, fill, intent)
    return fill


def cancel_order(run, intent_id: str, reason: str = "model price beyond the stated maximum") -> None:
    intent = next(o for o in run.broker.pending() if o.intent_id == intent_id)
    run.broker._pending = [o for o in run.broker._pending if o.intent_id != intent_id]
    m4r.on_spread_cancel(run, intent, reason)


def _m4_emails(rec: Recorder) -> list:
    return [e for e in rec.sent if (e.meta.get("trade_id") or "").endswith("-M4")]


# ------------------------------------------------------------------------------------------------ signal

def test_signal_fires_on_the_first_day_only():
    spx, vix, days = crash(vix_days=10)
    fired = [d for d in days[260:] if m4.m4_signal(spx, vix, d, SIG_CFG)["signal"]]
    assert fired == [days[310]]                         # 0.985^11 - 1 = -15.3%; 0.985^10 - 1 = -14.0%
    first = m4.m4_signal(spx, vix, days[310], SIG_CFG)
    assert first["drawdown"] == pytest.approx(0.985 ** 11 - 1) and first["vix"] == 35.0
    assert first["high"] == pytest.approx(spx["close"].iloc[299])
    nxt = m4.m4_signal(spx, vix, days[311], SIG_CFG)
    assert nxt["condition"] and not nxt["first_day"] and not nxt["signal"]
    assert nxt["last_signal"] == days[310] and any("not the first day" in r for r in nxt["reasons"])


def test_signal_thresholds_are_inclusive_and_unrounded():
    base = [100.0] * 260
    at, _ = frames(base + [85.0], [30.0] * 261)
    d = at.index[-1].strftime("%Y-%m-%d")
    assert m4.m4_signal(at, _, d, SIG_CFG)["signal"]                     # exactly -15% and VIX exactly 30
    above, v = frames(base + [85.01], [35.0] * 261)
    assert not m4.m4_signal(above, v, d, SIG_CFG)["signal"]             # -14.99%
    low_vix, v2 = frames(base + [80.0], [29.99] * 261)
    res = m4.m4_signal(low_vix, v2, d, SIG_CFG)
    assert not res["signal"] and any("VIX 29.99" in r for r in res["reasons"])


def test_signal_fails_closed_on_missing_data_and_ignores_later_data():
    spx, vix, days = crash(vix_days=10)
    assert m4.m4_signal(spx.iloc[:200], vix, days[199], SIG_CFG)["reasons"] == ["insufficient history"]
    no_bar = m4.m4_signal(spx.drop(index=spx.index[310]), vix, days[310], SIG_CFG)
    assert not no_bar["signal"] and no_bar["reasons"][0].startswith("no S&P 500 close")
    no_vix = m4.m4_signal(spx, vix.drop(index=vix.index[310]), days[310], SIG_CFG)
    assert not no_vix["signal"] and "vix missing" in no_vix["reasons"]
    cut = m4.m4_signal(spx.iloc[:311], vix.iloc[:311], days[310], SIG_CFG)
    full = m4.m4_signal(spx, vix, days[310], SIG_CFG)
    assert cut == full                                                    # no look-ahead
    short = m4.m4_signal(spx, vix.iloc[305:], days[311], SIG_CFG)          # the history before the signal is lost
    assert not short["signal"] and short["reasons"] == ["VIX history too short for the first-day rule"]


def test_cool_down_is_90_days_from_the_signal():
    spx, vix, days = crash(n_flat=150, vix_days=150)                    # the crash condition lasts 162 sessions
    fired = [d for d in days[260:] if m4.m4_signal(spx, vix, d, SIG_CFG)["signal"]]
    assert len(fired) == 3 and fired[0] == days[310]                    # about 227 calendar days: three signals
    gaps = [(pd.Timestamp(b) - pd.Timestamp(a)).days for a, b in zip(fired, fired[1:])]
    assert all(90 < g <= 93 for g in gaps)                              # the first condition day after 90 days
    assert m4.cooldown_end(fired[0], 90) == (pd.Timestamp(fired[0]) + pd.Timedelta(days=90)).strftime("%Y-%m-%d")
    stored = m4.m4_signal(spx, vix, fired[1], SIG_CFG, cooldown_until=fired[1])
    assert not stored["signal"] and any("cool-down until" in r for r in stored["reasons"])


def test_second_source_close_reruns_the_test():
    spx, vix, days = crash(vix_days=10)
    d = days[310]
    high = float(spx["close"].iloc[299])
    assert not m4.m4_signal(spx, vix, d, SIG_CFG, close_override=high * 0.86)["signal"]
    assert m4.m4_signal(spx, vix, d, SIG_CFG, close_override=high * 0.845)["signal"]


# -------------------------------------------------------------------------------------------- structure

def test_expiry_nearest_to_but_not_beyond_entry_plus_90():
    listed = ["2025-11-21", "2025-12-12", "2025-12-19", "2026-01-09", "2026-01-16", "2026-03-20"]
    assert m4.choose_expiry(listed, ENTRY, 90, 40) == EXPIRY
    assert m4.choose_expiry(listed + ["2026-01-14"], ENTRY, 90, 40) == "2026-01-14"      # exactly entry + 90
    assert m4.choose_expiry(["2025-11-14"], ENTRY, 90, 40) is None                       # 29 days: under 40
    assert m4.choose_expiry(listed, ENTRY, 60, 40) == "2025-12-12"                        # the twin: <= 15 Dec
    assert m4.choose_expiry(["2025-11-21", "2025-12-19"], ENTRY, 60, 40) is None          # 36 days, or beyond


def test_strikes_at_the_money_and_105_percent():
    chain = make_chain("XSP", "2025-10-15T22:17:00", 387.2)
    pick = m4.choose_strikes(chain, EXPIRY, 387.2, 1.05, 0.01)
    assert pick["ok"] and pick["long_strike"] == 387.0 and pick["short_strike"] == 407.0     # 406.56 -> 407
    assert [leg["position"] for leg in pick["legs"]] == ["long", "short"]
    assert pick["legs"][0]["occ"] == "XSP260109C00387000" and pick["legs"][0]["ratio"] == 1
    tie = m4.choose_strikes(chain, EXPIRY, 387.5, 1.05, 0.01)
    assert tie["long_strike"] == 387.0                                                      # a tie goes lower
    far = make_chain("XSP", "2025-10-15T22:17:00", 387.2)
    far.frame = far.frame[(far.frame["strike"] < 380) | (far.frame["strike"] > 420)]
    bad = m4.choose_strikes(far, EXPIRY, 387.2, 1.05, 0.01)
    assert not bad["ok"] and bad["reasons"]                                                 # fail closed


def test_size_rounds_to_the_nearest_contract_within_the_cap():
    assert m4.size_contracts(100_000, 876.0, 0.02, 0.03)["contracts"] == 2          # 2.28 -> 2
    assert m4.size_contracts(100_000, 800.0, 0.02, 0.03)["contracts"] == 3          # 2.5 -> 3 (halves up), $2,400
    assert m4.size_contracts(100_000, 2_600.0, 0.02, 0.03)["contracts"] == 1        # 0.77 -> 1, inside 3%
    too_big = m4.size_contracts(100_000, 3_100.0, 0.02, 0.03)
    assert too_big["contracts"] == 0 and "exceeds the cap" in too_big["reason"]
    assert m4.size_contracts(100_000, 1_400.0, 0.02, 0.03)["contracts"] == 1        # 1.43 -> 1 (2 = $2,800)
    assert m4.size_contracts(60_000, 1_300.0, 0.02, 0.03)["contracts"] == 1         # 0.92 -> 1; $1,300 <= $1,800


def test_exit_dates_and_the_exit_check():
    assert (m4.planned_exit_date(EXPIRY), m4.last_close_date(EXPIRY)) == (EXIT, LAST)
    # 3 Jul 2026 is the Independence Day holiday: a Monday 6 Jul expiry closes on Wed 1 Jul, retries Thu 2 Jul
    assert (m4.planned_exit_date("2026-07-06"), m4.last_close_date("2026-07-06")) == ("2026-07-01", "2026-07-02")
    ot = {"expiry": EXPIRY, "fill_date": ENTRY}
    assert not m4.m4_exit_check("2026-01-05", ot)["exit"]
    ev = m4.m4_exit_check("2026-01-06", ot)                     # the EXIT email goes out the evening before
    assert ev["exit"] and ev["reason"] == "expiry_rule" and ev["next_session"] == EXIT
    assert ev["days_held"] == (pd.Timestamp("2026-01-06") - pd.Timestamp(ENTRY)).days
    assert m4.m4_exit_check(EXIT, ot)["exit"]                   # the retry for the last session
    late = m4.m4_exit_check(LAST, ot)
    assert late["too_late"] and not late["exit"]


def test_spread_terms_and_intrinsic_value():
    legs = [{"strike": 100.0, "right": "C", "position": "long", "ratio": 1},
            {"strike": 105.0, "right": "C", "position": "short", "ratio": 1}]
    terms = m4.spread_terms(legs, 2.5, 2)
    assert terms["width"] == 5.0 and terms["max_value_usd"] == 1_000.0 and terms["breakeven"] == 102.5
    assert terms["max_multiple"] == pytest.approx(2.0)
    assert [m4.intrinsic_value(legs, s) for s in (90.0, 103.0, 110.0)] == [0.0, 3.0, 5.0]


def test_liquidity_fallback_applies_the_design_rule():
    chain = make_chain("XSP", "2025-10-15T22:17:00", 387.2)
    legs = m4.choose_strikes(chain, EXPIRY, 387.2, 1.05, 0.01)["legs"]
    ok = m4.liquidity_fallback(chain, legs, {})
    assert ok["ok"] and ok["round_trip_frac"] == pytest.approx(0.055, abs=0.005)
    thin = make_chain("XSP", "2025-10-15T22:17:00", 387.2, oi=100)
    assert any("open interest" in r for r in m4.liquidity_fallback(thin, legs, {})["reasons"])
    wide = make_chain("XSP", "2025-10-15T22:17:00", 387.2, spread=0.12)
    res = m4.liquidity_fallback(wide, legs, {})
    assert not res["ok"] and any("bid-ask" in r for r in res["reasons"]) and any("round trip" in r for r in
                                                                                 res["reasons"])
    mid = make_chain("XSP", "2025-10-15T22:17:00", 387.2, spread=0.03)       # legs pass, round trip ~16.5%
    assert not m4.liquidity_fallback(mid, legs, {})["ok"]
    assert m4.liquidity_fallback(mid, legs, {}, expected_gain=0.40)["ok"]    # <= 20% when the gain >= 2x costs


# ----------------------------------------------------------------------------------- email text, forecast

def test_templates_hold_no_digits_and_are_merged():
    def literal(t: str) -> str:                     # the text a template adds itself: no placeholders, no literals
        t = re.sub(r"\{[^{}]*\}", " ", t)
        for allowed in validator.ALLOWED_LITERALS:
            t = t.replace(allowed, " ")
        return t

    n = 0
    for table in ("ONE_SENTENCE", "WHY", "EXIT_PLAN", "RISKS"):
        for entry in m4_text.TEXT[table].values():
            items = entry.values() if isinstance(entry, dict) else [entry]
            for alts in items:
                for alt in (alts if isinstance(alts, list) else [alts]):
                    for t in (alt if isinstance(alt, tuple) else (alt,)):
                        n += t is not None
                        assert t is None or not re.search(r"\d", literal(t)), t
    assert n > 30
    assert emails.MODULE_NAMES["M4"] == "Crash call spread" and "M4" in emails.PLAN_NAMES_EXIT_EMAIL
    assert "EXIT:expiry_rule" in emails.WHY["M4"] and emails.DEFAULT_TICKERS["M4"] == "XSP"


def test_forecast_is_registered_and_resolves_on_the_close():
    cfg = load_config()
    rec = Recommendation("NEW_TRADE", "M4", "T-2025-10-15-M4", SIGNAL, [], {})
    fcs = forecasts.make_forecasts(rec, cfg)
    assert len(fcs) == 1 and fcs[0]["event"] == "profit" and fcs[0]["resolves"] == "on_exit"
    assert fcs[0]["p"] == pytest.approx(0.60) and fcs[0]["question"] == m4r.QUESTION
    won = forecasts.resolve_trade_forecasts(fcs, {"profit": True, "exit_reason": "expiry_rule"})
    assert won[0]["outcome"] == 1 and won[0]["brier"] == pytest.approx(0.16)


def test_config_matches_the_design():
    cfg = load_config()
    m = cfg.module("M4")
    assert m["enabled"] and m["account"] == "taxable" and (m["root"], m["fallback_root"]) == ("XSP", "SPY")
    assert (m["drop_from_high"], m["high_sessions"], m["vix_min"]) == (-0.15, 252, 30.0)
    assert (m["cooldown_days"], m["max_calendar_days"], m["short_strike_ratio"]) == (90, 90, 1.05)
    assert m["debit_pct_nav"] == 0.02 and m["close_sessions_before_expiry"] == 2
    assert cfg.shadow("M4_TWIN")["enabled"] and cfg.shadow("M4_TWIN")["max_calendar_days"] == 60
    assert cfg.account["accounts"]["taxable"]["options_level"] >= 3


# -------------------------------------------------------------------------------------- pipeline: entry

def test_pipeline_crash_emits_the_m4_trade_and_queues_the_spread(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    st = _state(state_dir)
    new = [e for e in _m4_emails(rec) if e.meta.get("kind") == "NEW_TRADE"]
    assert len(new) == 1 and new[0].meta["trade_id"] == f"T-{SIGNAL}-M4"
    assert not validator.validate(new[0])
    assert not [a for a in st["alerts"] if a["kind"] in ("validator", "data", "liquidity")], st["alerts"]
    spreads = [o for o in st["broker"]["pending"] if o["order_type"] == "spread_limit"]
    assert len(spreads) == 1
    o = spreads[0]
    assert (o["module"], o["ticker"], o["account"], o["side"]) == ("M4", "XSP", "taxable", "buy")
    spot = provider.close("XSP", SIGNAL)
    long_leg, short_leg = o["legs"]
    assert long_leg["position"] == "long" and abs(long_leg["strike"] - spot) <= 0.5
    assert short_leg["position"] == "short" and abs(short_leg["strike"] - 1.05 * spot) <= 0.5
    assert long_leg["expiry"] == short_leg["expiry"] == EXPIRY
    assert o["contracts"] >= 1 and 0 < o["limit_price"] < o["max_price"]
    assert o["contracts"] * o["max_price"] * 100 <= 0.03 * st["marks"][-1]["nav"]
    ot = st["modules"]["M4"]["open_trade"]
    assert ot["status"] == "pending_entry" and ot["intent_id"] == o["intent_id"]
    assert (ot["expiry"], ot["exit_date"], ot["last_close_date"]) == (EXPIRY, EXIT, LAST)
    assert st["modules"]["M4"]["cooldown_until"] == "2026-01-13"
    assert st["shadow"]["M4_TWIN"]["open_trade"]["status"] == "pending_entry"
    recs = [r["payload"] for r in _ledger(state_dir) if r["record_type"] == "recommendation"
            and r["payload"]["module"] == "M4"]
    facts = recs[0]["facts"]
    assert facts["root"] == "XSP" and facts["section_1256"] and facts["strategy_label"] == "call debit spread"
    assert facts["debit_usd"] == pytest.approx(o["contracts"] * o["limit_price"] * 100)
    assert facts["stress_usd"] == facts["max_debit_usd"] == pytest.approx(o["contracts"] * o["max_price"] * 100)
    assert facts["max_value_usd"] == pytest.approx((short_leg["strike"] - long_leg["strike"]) * o["contracts"] * 100)
    assert facts["base_rates"]["since"] == 1990 and recs[0]["forecasts"][0]["p"] == pytest.approx(0.60)
    assert [c[0] for c in provider.chain_calls] == ["XSP"]                     # one fetch, no SPY needed


def test_no_new_signal_the_next_day(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: cancel_order(
        run, run.state["modules"]["M4"]["open_trade"]["intent_id"]))
    daily(cfg, provider, state_dir, rec, ENTRY)                              # the condition still holds today
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None                         # cancelled entry: skipped
    assert len([e for e in _m4_emails(rec) if e.meta.get("kind") == "NEW_TRADE"]) == 1
    sigs = [r["payload"] for r in _ledger(state_dir) if r["record_type"] == "signal"
            and r["payload"].get("module") == "M4" and r["payload"].get("check") == "entry"]
    assert sigs[-1]["condition"] and not sigs[-1]["signal"]


def test_second_source_disagreement_blocks_the_trade(cfg, world):
    state_dir, provider, rec = world
    prev = float(provider.frames["^GSPC"]["close"].loc[:"2025-10-14"].iloc[-1])
    provider.second[("^GSPC", SIGNAL)] = prev * 0.99                     # the second source says -14.2%
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None and not _m4_emails(rec)
    assert any(a["kind"] == "data" and "M4 signal not confirmed" in a["message"] for a in st["alerts"])
    assert st["modules"]["M4"]["cooldown_until"] == "2026-01-13"           # the primary signal day still counts
    assert st["shadow"]["M4_TWIN"]["open_trade"] is None                   # the twin needs a confirmed signal
    shadow = [r["payload"] for r in _ledger(state_dir) if r["record_type"] == "shadow"
              and r["payload"].get("book") == "M4"]
    assert shadow and shadow[0]["event"] == "unconfirmed_signal"


def test_illiquid_xsp_falls_back_to_spy(cfg, world):
    state_dir, provider, rec = world
    provider.chain_kwargs["XSP"] = {"oi": 100}                           # open interest under 500
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    st = _state(state_dir)
    o = [o for o in st["broker"]["pending"] if o["order_type"] == "spread_limit"][0]
    assert o["ticker"] == "SPY" and o["legs"][0]["occ"].startswith("SPY")
    facts = [r["payload"]["facts"] for r in _ledger(state_dir) if r["record_type"] == "recommendation"
             and r["payload"]["module"] == "M4"][0]
    assert facts["fallback_from"] == "XSP" and not facts["section_1256"] and facts["american_root"] == "SPY"
    assert facts["settlement"] == "shares, American-style"
    assert not validator.validate([e for e in _m4_emails(rec)][0])


def test_stale_or_disagreeing_xsp_chain_fails_closed_without_spy(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, "2025-10-14")
    provider.spot_bias["XSP"] = 1.03                                     # the chain's spot is 3% off the close
    daily(cfg, provider, state_dir, rec, SIGNAL)
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None and not _m4_emails(rec)
    assert [c[0] for c in provider.chain_calls] == ["XSP"]                  # no SPY fallback on bad data
    assert any(a["kind"] == "data" and "M4 signal not traded" in a["message"] for a in st["alerts"])


def test_cboe_vix_outage_fails_closed(cfg, world, monkeypatch):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, "2025-10-14")

    def down(name="VIX"):
        raise RuntimeError("CBOE down")

    monkeypatch.setattr(provider, "vix", down)          # the pipeline patches in Yahoo's value for today only
    daily(cfg, provider, state_dir, rec, SIGNAL)
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None and not _m4_emails(rec)
    assert st["modules"]["M4"]["cooldown_until"] is None and not provider.chain_calls


def test_stale_chain_is_refused(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, "2025-10-14")
    provider.chain_asof = "2025-10-14T22:17:00"
    res = pipeline.run_daily(cfg, provider, state_dir, date=SIGNAL, services=rec.services())
    assert res.status == "ok"
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None
    assert any("not 2025-10-15" in a["message"] for a in st["alerts"])


def test_too_small_an_account_skips_under_one_contract(tmp_path):
    cfg = _cfg()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH, nav=25_000)
    provider, rec = CrashProvider(), Recorder()
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None and not _m4_emails(rec)
    sizes = [r["payload"] for r in _ledger(state_dir) if r["record_type"] == "signal"
             and r["payload"].get("check") == "size"]
    assert sizes and sizes[0]["contracts"] == 0 and "exceeds the cap" in sizes[0]["reason"]


def test_reserve_left_under_one_contract_skips(cfg, world, monkeypatch):
    state_dir, provider, rec = world
    real = m4r._book_stress

    def crowded(run):                                                    # W10 and M2 filled the US-equity cluster
        book = real(run)
        return dict(book, us_equity=0.07 * book["nav"] - 500.0, total=book["total"] + 1_000.0)

    monkeypatch.setattr(m4r, "_book_stress", crowded)
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None and not _m4_emails(rec)
    admits = [r["payload"] for r in _ledger(state_dir) if r["record_type"] == "signal"
              and r["payload"].get("module") == "M4" and r["payload"].get("check") == "admit"]
    assert admits[0]["binding"] == "us_equity_cluster" and not admits[0]["ok"]
    assert any("under one contract" in n for n in admits[0]["notes"])


def test_signal_while_a_spread_is_open_goes_to_the_shadow_ledger(cfg, world, monkeypatch):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, "2025-10-14")
    st = _state(state_dir)
    st["modules"]["M4"]["open_trade"] = {"trade_id": "T-2025-08-01-M4", "status": "open", "expiry": "2025-10-31",
                                         "exit_date": "2025-10-29", "legs": [], "root": "XSP", "contracts": 1,
                                         "entry_price": 5.0}
    (state_dir / "state.json").write_text(json.dumps(st))
    daily(cfg, provider, state_dir, rec, SIGNAL)
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"]["trade_id"] == "T-2025-08-01-M4" and not _m4_emails(rec)
    assert any(r["payload"].get("event") == "signal_while_open" for r in _ledger(state_dir)
               if r["record_type"] == "shadow")


# ---------------------------------------------------------------------------- lifecycle (emulated job)

def test_lifecycle_open_close_retry_and_resolution(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    entry_iid = _state(state_dir)["modules"]["M4"]["open_trade"]["intent_id"]
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: fill_order(run, entry_iid, 8.70))
    ot = _state(state_dir)["modules"]["M4"]["open_trade"]
    assert ot["status"] == "open" and ot["fill_date"] == ENTRY and ot["entry_price"] == 8.70
    assert ot["cost"] == pytest.approx(ot["contracts"] * 870.0)

    daily(cfg, provider, state_dir, rec, "2026-01-05")                  # not due yet
    assert not [e for e in _m4_emails(rec) if e.meta.get("kind") == "EXIT"]
    daily(cfg, provider, state_dir, rec, "2026-01-06")                  # the evening before the planned close
    exits = [e for e in _m4_emails(rec) if e.meta.get("kind") == "EXIT"]
    assert len(exits) == 1 and not validator.validate(exits[0])
    st = _state(state_dir)
    sell = [o for o in st["broker"]["pending"] if o["module"] == "M4"][0]
    assert sell["side"] == "sell" and sell["close_all"] and sell["reason"] == "expiry_rule"
    assert sell["legs"] == ot["legs"] and sell["contracts"] == ot["contracts"]
    assert 0 <= sell["max_price"] <= sell["limit_price"]                   # stated minimum below the limit
    assert st["modules"]["M4"]["open_trade"]["status"] == "pending_exit"
    first_limit = sell["limit_price"]

    options_run(cfg, provider, state_dir, rec, EXIT, lambda run: cancel_order(run, sell["intent_id"]))
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"]["status"] == "open"
    assert any(a["kind"] == "fill" and "fresh EXIT" in a["message"] for a in st["alerts"])

    provider.frames["^GSPC"].loc[pd.Timestamp(EXIT), "close"] *= 1.01   # the market moves: fresh prices differ
    daily(cfg, provider, state_dir, rec, EXIT)
    exits = [e for e in _m4_emails(rec) if e.meta.get("kind") == "EXIT"]
    assert len(exits) == 2 and not validator.validate(exits[1])
    st = _state(state_dir)
    resell = [o for o in st["broker"]["pending"] if o["module"] == "M4"][0]
    assert resell["intent_id"] != sell["intent_id"] and resell["limit_price"] != first_limit
    facts = [r["payload"]["facts"] for r in _ledger(state_dir) if r["record_type"] == "recommendation"
             and r["payload"]["kind"] == "EXIT" and r["payload"]["module"] == "M4"]
    assert facts[0]["retry_date"] == LAST and facts[1]["retry_of"] == EXIT and facts[1]["attempt"] == 2
    assert facts[1]["retry_date"] is None and facts[0]["reason"] == facts[1]["reason"] == "expiry_rule"

    options_run(cfg, provider, state_dir, rec, LAST, lambda run: fill_order(run, resell["intent_id"], 14.0))
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None
    hist = st["modules"]["M4"]["history"][-1]
    assert hist["exit_date"] == LAST and hist["exit_reason"] == "expiry_rule" and hist["profit"]
    assert hist["return"] == pytest.approx(14.0 / 8.70 - 1) and hist["pnl"] == pytest.approx(
        hist["contracts"] * (1400.0 - 870.0))
    resolved = [f for f in st["forecasts"]["resolved"] if f["trade_id"] == f"T-{SIGNAL}-M4"]
    assert len(resolved) == 1 and resolved[0]["outcome"] == 1
    assert not [f for f in st["forecasts"]["open"] if f["trade_id"] == f"T-{SIGNAL}-M4"]


def test_a_close_missed_on_the_last_session_raises_an_alert(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    iid = _state(state_dir)["modules"]["M4"]["open_trade"]["intent_id"]
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: fill_order(run, iid, 8.70))
    daily(cfg, provider, state_dir, rec, EXIT)                           # first EXIT (late start: next is LAST)
    sell = [o for o in _state(state_dir)["broker"]["pending"] if o["module"] == "M4"][0]
    options_run(cfg, provider, state_dir, rec, LAST, lambda run: cancel_order(run, sell["intent_id"]))
    daily(cfg, provider, state_dir, rec, LAST)                           # the next session is the expiry
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"]["status"] == "open"
    assert not [o for o in st["broker"]["pending"] if o["module"] == "M4"]  # no order into expiry day
    assert any("safety net" in a["message"] for a in st["alerts"])


def _flat(text: str) -> str:
    return " ".join(text.replace("│", " ").split())


@pytest.mark.parametrize("spy", [False, True])
def test_the_last_session_close_promises_no_email_that_never_comes(cfg, world, spy):
    """The retry EXIT executes on the last session before expiry. It must not promise tomorrow's EXIT email (none comes:
    the runner only alerts, and the safety net settles at expiry); it states what happens instead."""
    state_dir, provider, rec = world
    if spy:
        provider.chain_kwargs["XSP"] = {"oi": 100}                     # XSP fails the liquidity check: SPY
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    iid = _state(state_dir)["modules"]["M4"]["open_trade"]["intent_id"]
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: fill_order(run, iid, 8.70))
    daily(cfg, provider, state_dir, rec, "2026-01-06")
    first = _flat([e for e in _m4_emails(rec) if e.meta.get("kind") == "EXIT"][-1].text)
    assert "you'll get a new EXIT email tomorrow evening with fresh prices" in first      # a session is left
    sell = [o for o in _state(state_dir)["broker"]["pending"] if o["module"] == "M4"][0]
    options_run(cfg, provider, state_dir, rec, EXIT, lambda run: cancel_order(run, sell["intent_id"]))
    daily(cfg, provider, state_dir, rec, EXIT)
    retry = [e for e in _m4_emails(rec) if e.meta.get("kind") == "EXIT"][-1]
    assert retry.meta["execute_date"] == LAST and not validator.validate(retry)
    f = _flat(retry.text)
    assert "EXIT email tomorrow" not in f and "tomorrow's email" not in f
    assert "Today is the last trading day before the options expire on Fri 9 Jan, so no new EXIT email follows." in f
    if spy:
        assert ("SPY options settle in shares, Robinhood may close at-risk positions from 3:30 PM ET that day, and a "
                "call you sold that ends in the money can be assigned (exercised against you). The paper book settles "
                "it at intrinsic value at expiry.") in f
    else:
        assert "XSP options settle in cash at expiry, at their intrinsic value" in f and "The paper book settles it " \
               "the same way." in f
    resell = [o for o in _state(state_dir)["broker"]["pending"] if o["module"] == "M4"][0]
    options_run(cfg, provider, state_dir, rec, LAST, lambda run: cancel_order(run, resell["intent_id"]))
    n_before = len(rec.sent)
    daily(cfg, provider, state_dir, rec, LAST)
    assert not [e for e in rec.sent[n_before:] if (e.meta.get("trade_id") or "").endswith("-M4")]   # as promised
    assert any("safety net" in a["message"] for a in _state(state_dir)["alerts"])


def test_a_worthless_close_is_priced_at_one_tick_never_zero(cfg, world, monkeypatch):
    """Both legs far out of the money: the model's close price is 0. The EXIT asks for one tick, not $0.00, and says
    why (options.fillmodel.order_prices)."""
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    iid = _state(state_dir)["modules"]["M4"]["open_trade"]["intent_id"]
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: fill_order(run, iid, 8.70))

    def worthless(chain, legs, side="buy"):
        quotes = [{"occ": leg["occ"], "bid": 0.01, "ask": 0.03, "mid": 0.02} for leg in legs]
        return {"mid": 0.0, "natural_width": 0.04, "legs": quotes}

    monkeypatch.setattr(m4r, "combo_quote", worthless)
    daily(cfg, provider, state_dir, rec, "2026-01-06")
    sell = [o for o in _state(state_dir)["broker"]["pending"] if o["module"] == "M4"][0]
    assert sell["limit_price"] == sell["max_price"] == 0.01
    ex = [e for e in _m4_emails(rec) if e.meta.get("kind") == "EXIT"][-1]
    assert not validator.validate(ex)
    f = _flat(ex.text)
    assert "Limit price: $0.01 (the net credit per share)" in f and "re-enter once at $0.01" in f
    assert "Limit price: $0.00" not in f and "once more at $0.00" not in f            # (the mid itself is $0.00)
    assert "Tonight the spread is worth almost nothing, so the limit is the smallest price step, $0.01 a share" in f
    facts = [r["payload"]["facts"] for r in _ledger(state_dir) if r["record_type"] == "recommendation"
             and r["payload"]["kind"] == "EXIT"][-1]
    assert facts["price_floor"] == 0.01


def test_cancelled_entry_is_skipped_and_its_forecast_voided(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    iid = _state(state_dir)["modules"]["M4"]["open_trade"]["intent_id"]
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: cancel_order(run, iid))
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None and st["modules"]["M4"]["skipped"][0]["signal_date"] == SIGNAL
    assert not [f for f in st["forecasts"]["open"] if f["trade_id"] == f"T-{SIGNAL}-M4"]
    assert any(r["record_type"] == "correction" and r["payload"].get("voided_forecasts") for r in _ledger(state_dir))
    assert st["modules"]["M4"]["cooldown_until"] == "2026-01-13"


def test_expiry_settlement_fill_closes_the_record(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    iid = _state(state_dir)["modules"]["M4"]["open_trade"]["intent_id"]
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: fill_order(run, iid, 8.70))

    def settle(run):
        ot = run.state["modules"]["M4"]["open_trade"]
        fill = Fill(intent_id="settle", trade_id=ot["trade_id"], module="M4", account="taxable", ticker="XSP",
                    side="sell", qty=float(ot["contracts"]), price=0.0, ref_price=0.0, dollars=0.0,
                    fill_date=EXPIRY, slippage_bps=0.0, model_version="1.0", multiplier=100)
        m4r.on_spread_fill(run, fill, None)

    options_run(cfg, provider, state_dir, rec, EXPIRY, settle)
    hist = _state(state_dir)["modules"]["M4"]["history"][-1]
    assert hist["exit_reason"] == "expiry_settlement" and hist["return"] == -1.0 and not hist["profit"]


# ------------------------------------------------------------------------------ 10:17 ET: probe, twin

def test_roots_needed(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, "2025-10-09")               # the S&P is 10% down: armed
    run = pipeline.Run(cfg, provider, state_dir, "options", "2025-10-10")
    assert m4r.roots_needed(run) == {"XSP", "SPY"}
    run.close()
    run_until(cfg, provider, state_dir, rec, SIGNAL, start="2025-10-10")
    run = pipeline.Run(cfg, provider, state_dir, "options", ENTRY)
    assert m4r.roots_needed(run) == {"XSP"}                              # M4's order and the twin's entry
    run.close()


def test_market_hours_probe_decides_the_root(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, "2025-10-14")
    xsp_thin = make_chain("XSP", f"{SIGNAL}T10:17:00", provider.close("XSP", "2025-10-14"), oi=100)
    spy_ok = make_chain("SPY", f"{SIGNAL}T10:17:00", provider.close("SPY", "2025-10-14"))
    options_run(cfg, provider, state_dir, rec, SIGNAL,
                lambda run: m4r.options_job(run, {"XSP": xsp_thin, "SPY": spy_ok}))
    probe = _state(state_dir)["modules"]["M4"]["liquidity_probe"]
    assert probe["date"] == SIGNAL and not probe["results"]["XSP"]["ok"] and probe["results"]["SPY"]["ok"]
    daily(cfg, provider, state_dir, rec, SIGNAL)                          # tonight's XSP chain looks liquid
    o = [o for o in _state(state_dir)["broker"]["pending"] if o["order_type"] == "spread_limit"][0]
    assert o["ticker"] == "SPY"


def test_twin_enters_and_exits_at_model_prices(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    tw = _state(state_dir)["shadow"]["M4_TWIN"]["open_trade"]
    assert tw["status"] == "pending_entry" and tw["entry_session"] == ENTRY
    assert tw["ref_spot"] == pytest.approx(provider.close("XSP", SIGNAL))
    chain = make_chain("XSP", f"{ENTRY}T10:17:00", provider.close("XSP", SIGNAL) * 1.004)
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: m4r.options_job(run, {"XSP": chain}))
    tw = _state(state_dir)["shadow"]["M4_TWIN"]["open_trade"]
    assert tw["status"] == "open" and tw["expiry"] == "2025-12-12"            # last Friday <= 16 Oct + 60 days
    assert tw["exit_date"] == "2025-12-10"
    from traderec.options.fillmodel import combo_quote
    q = combo_quote(chain, tw["legs"], "buy")
    assert tw["entry_price"] == pytest.approx(q["mid"] + 0.3 * q["natural_width"])
    run = pipeline.Run(cfg, provider, state_dir, "options", "2025-12-10")
    assert "XSP" in m4r.roots_needed(run)
    run.close()
    later = make_chain("XSP", "2025-12-10T10:17:00", provider.close("XSP", "2025-12-09"))
    options_run(cfg, provider, state_dir, rec, "2025-12-10", lambda run: m4r.options_job(run, {"XSP": later}))
    book = _state(state_dir)["shadow"]["M4_TWIN"]
    assert book["open_trade"] is None and len(book["trades"]) == 1
    t = book["trades"][0]
    q2 = combo_quote(later, t["legs"], "sell")
    assert t["exit_price"] == pytest.approx(q2["mid"] - 0.3 * q2["natural_width"])
    assert t["exit_reason"] == "expiry_rule" and t["return"] == pytest.approx(t["exit_price"] / t["entry_price"] - 1)


def test_twin_settles_at_expiry_when_never_priced(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    chain = make_chain("XSP", f"{ENTRY}T10:17:00", provider.close("XSP", SIGNAL))

    def job(run):
        cancel_order(run, run.state["modules"]["M4"]["open_trade"]["intent_id"])     # M4's own entry: not filled
        m4r.options_job(run, {"XSP": chain})

    options_run(cfg, provider, state_dir, rec, ENTRY, job)
    tw = _state(state_dir)["shadow"]["M4_TWIN"]["open_trade"]
    run_until(cfg, provider, state_dir, rec, tw["expiry"], start=tw["expiry"])
    t = _state(state_dir)["shadow"]["M4_TWIN"]["trades"][-1]
    under = provider.close("XSP", tw["expiry"])
    assert t["exit_reason"] == "expiry_settlement" and t["exit_price"] == pytest.approx(
        m4.intrinsic_value(tw["legs"], under))


# ----------------------------------------------------------------------- after the options build merges

needs_options_build = pytest.mark.skipif(
    not (hasattr(PaperBroker, "fill_spreads") and hasattr(PaperBroker, "spreads")),
    reason="needs the options build (PaperBroker.fill_spreads / spreads, options.job.run_options)")


@needs_options_build
def test_options_job_fills_and_closes_the_m4_spread(cfg, world):
    from traderec.options.job import run_options

    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    provider.chain_asof = f"{ENTRY}T10:17:00"
    res = run_options(cfg, provider, state_dir, date=ENTRY, services=rec.services())
    assert res.status == "ok", res.summary()
    st = _state(state_dir)
    ot = st["modules"]["M4"]["open_trade"]
    assert ot["status"] == "open" and ot["fill_date"] == ENTRY and ot["entry_price"] > 0
    assert not [o for o in st["broker"]["pending"] if o.get("order_type") == "spread_limit"]
    assert st["shadow"]["M4_TWIN"]["open_trade"]["status"] == "open"
    for day in ("2026-01-05", "2026-01-06"):
        daily(cfg, provider, state_dir, rec, day)
    assert [e.meta.get("kind") for e in _m4_emails(rec)] == ["NEW_TRADE", "EXIT"]
    provider.chain_asof = f"{EXIT}T10:17:00"
    res = run_options(cfg, provider, state_dir, date=EXIT, services=rec.services())
    assert res.status == "ok", res.summary()
    st = _state(state_dir)
    assert st["modules"]["M4"]["open_trade"] is None and st["modules"]["M4"]["history"][-1]["exit_date"] == EXIT
    assert any(f["trade_id"] == f"T-{SIGNAL}-M4" for f in st["forecasts"]["resolved"])


@needs_options_build
def test_open_m4_spread_counts_in_the_us_equity_reserve(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    from traderec.options.job import run_options

    provider.chain_asof = f"{ENTRY}T10:17:00"
    run_options(cfg, provider, state_dir, date=ENTRY, services=rec.services())
    run = pipeline.Run(cfg, provider, state_dir, "daily", "2025-10-17")
    book = m4r._book_stress(run)
    spread = run.broker.spreads(module="M4")[0]
    assert book["by_module"]["M4"] >= float(spread["cost"]) - 1e-6 and book["premium"] >= float(spread["cost"]) - 1e-6
    run.close()


SPREAD_EMAILS = "spread_limit" in Path(emails.__file__).read_text(encoding="utf-8")


@pytest.mark.skipif(not SPREAD_EMAILS, reason="needs the spread-email build (generic spread_limit rendering)")
def test_rendered_spread_emails_carry_the_contract_values(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    new = [e for e in _m4_emails(rec) if e.meta.get("kind") == "NEW_TRADE"][0]
    o = [o for o in _state(state_dir)["broker"]["pending"] if o["order_type"] == "spread_limit"][0]
    assert not validator.validate(new) and "market order in dollars" not in new.text
    for value in (f"{o['limit_price']:.2f}", f"{o['max_price']:.2f}", "10:00 ET", f"{o['legs'][0]['strike']:g}",
                  f"{o['legs'][1]['strike']:g}"):
        assert value in new.text, value
    options_run(cfg, provider, state_dir, rec, ENTRY, lambda run: fill_order(run, o["intent_id"], 8.70))
    daily(cfg, provider, state_dir, rec, "2026-01-06")
    ex = [e for e in _m4_emails(rec) if e.meta.get("kind") == "EXIT"][0]
    sell = [s for s in _state(state_dir)["broker"]["pending"] if s["module"] == "M4"][0]
    assert not validator.validate(ex) and f"{sell['max_price']:.2f}" in ex.text and "10:00 ET" in ex.text


def test_the_day_after_an_m4_order_needs_no_option_root_bars(cfg, world):
    state_dir, provider, rec = world
    run_until(cfg, provider, state_dir, rec, SIGNAL)
    daily(cfg, provider, state_dir, rec, ENTRY)                          # the provider has no "XSP" bars
    assert _state(state_dir)["modules"]["M4"]["open_trade"]["status"] == "pending_entry"


def test_next_trading_day_helper_consistency():
    assert m4.entry_session(SIGNAL) == ENTRY == next_trading_day(SIGNAL).isoformat()
