"""Tests for the option shadow books (design v3.3 §3 "M7" and "Shadow ledger"): M7 (O1), O1-h, I1, I2 and ST-2.

Offline and deterministic: a synthetic market in a FakeProvider, hand-built 10:17 ET option chains, and real `Run`
transactions over a temporary state. The runner's `daily` and `options_job` are called directly, as the daily run
and the options job call them; one test goes through `pipeline.run_daily`.
"""
from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from traderec import pipeline
from traderec.config import load_config
from traderec.data import FakeProvider
from traderec.market_calendar import is_trading_day
from traderec.modules import option_shadows as rules
from traderec.options.chain import CHAIN_COLUMNS, OptionChain, occ_symbol
from traderec.runners import option_shadows

MINE = ("O1", "O1H", "I1", "I2", "ST2")
SESSIONS = pd.DatetimeIndex([d for d in pd.date_range("2025-06-02", "2027-01-29", freq="B") if is_trading_day(d)])
REF = pd.Timestamp("2026-10-05")           # the S&P 500 closes at 6,800 here, in a steady uptrend
XSP_STRIKES = list(range(500, 725, 5))
IBIT_STRIKES = list(range(35, 71))
NAN = float("nan")
FILTERS = {"sma_trend": 200, "vix_below": 30.0, "vix_ratio_below": 1.0}
SPREAD = {"short_delta": 0.20, "delta_tolerance": 0.05, "width_pct_spot": 0.05, "width_tolerance": 0.01}
FADE = {"vix_peak": 30.0, "lookback_sessions": 10, "fade_ratio": 0.8, "cooldown_days": 30}
ST2 = {"sma_trend": 200, "ratio_at_least": 1.0, "quiet_sessions": 20, "hold_sessions": 20}
SERVICES = pipeline.Services(send=lambda email, *, dry_run, outbox: {"sent": False, "reason": "dry run"},
                             create_issue=lambda title, body, labels=None: None,
                             healthcheck=lambda status: None, fetch_comments=lambda url: [])


# ------------------------------------------------------------------------------------------------ market
def _bars(close: pd.Series) -> pd.DataFrame:
    prev = close.shift(1).fillna(close.iloc[0])
    return pd.DataFrame({"open": prev * 1.0005, "high": close * 1.002, "low": close * 0.998, "close": close,
                         "adj_close": close, "volume": 1e6})


def market(*, vix: dict | None = None, gspc: dict | None = None, vix3m: float | None = 17.0,
           second: dict | None = None) -> FakeProvider:
    """S&P 500 up 0.03% a session (6,800 on 5 Oct 2026), SPY = S&P / 10, VIX 15, VIX3M 17 (None: no VIX3M), BTC-USD
    up. `vix` / `gspc` override closes by date; `second` overrides the S&P 500's second-source closes."""
    i = np.arange(len(SESSIONS)) - SESSIONS.get_loc(REF)
    spx = pd.Series(6800.0 * np.exp(0.0003 * i), index=SESSIONS)
    for d, v in (gspc or {}).items():
        spx.loc[pd.Timestamp(d)] = v
    vix_s = pd.Series(15.0, index=SESSIONS)
    for d, v in (vix or {}).items():
        vix_s.loc[pd.Timestamp(d)] = v
    days = pd.date_range("2025-01-01", "2027-01-31", freq="D")
    btc = pd.Series(60_000.0 * np.exp(0.001 * np.arange(len(days))), index=days)
    ibit = pd.Series(50.0 * np.exp(0.0005 * np.arange(len(SESSIONS))), index=SESSIONS)
    vixes = {"VIX": vix_s} if vix3m is None else {"VIX": vix_s, "VIX3M": pd.Series(vix3m, index=SESSIONS)}
    seconds = {("^GSPC", d.strftime("%Y-%m-%d")): float(v) for d, v in spx.items()}
    seconds.update({("^GSPC", d): v for d, v in (second or {}).items()})
    return FakeProvider(bars={"SPY": _bars(spx / 10.0), "^GSPC": _bars(spx), "IBIT": _bars(ibit)}, vix=vixes,
                        btc=btc, tbill_rate=0.04, second_source=seconds)


def _ncdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def bs_put(spot: float, strike: float, days: int, iv: float) -> tuple[float, float]:
    t = days / 365.0
    d1 = (math.log(spot / strike) + 0.5 * iv * iv * t) / (iv * math.sqrt(t))
    return strike * _ncdf(-d1 + iv * math.sqrt(t)) - spot * _ncdf(-d1), _ncdf(d1) - 1.0


def chain(root: str, day: str, spot: float, expiries: list[str], strikes: list[int], *, iv: float | dict = 0.18,
          spread_pct: float = 0.02, min_half: float = 0.01, oi: float = 1000.0, deltas: bool = True,
          asof: str | None = None) -> OptionChain:
    """Puts priced by Black-Scholes, quoted mid -/+ max(min_half, spread_pct x price); unquoted when the bid is <= 0."""
    rows = []
    for e in expiries:
        v = iv[e] if isinstance(iv, dict) else iv
        for k in strikes:
            price, delta = bs_put(spot, k, (date.fromisoformat(e) - date.fromisoformat(day)).days, v)
            half = max(min_half, spread_pct * price)
            bid, ask = round(price - half, 4), round(price + half, 4)
            bid = bid if bid > 0 else 0.0
            rows.append({"occ": occ_symbol(root, e, "P", k), "root": root, "right": "P", "strike": float(k),
                         "expiry": e, "bid": bid, "ask": ask, "mid": (bid + ask) / 2 if bid > 0 else NAN, "iv": v,
                         "delta": delta if deltas else NAN, "gamma": NAN, "theta": NAN, "vega": NAN,
                         "open_interest": oi, "volume": 10.0, "last_trade_time": None})
    return OptionChain(root, asof or f"{day}T10:17:00", spot, "fake", pd.DataFrame(rows, columns=CHAIN_COLUMNS))


def xsp(day: str, spot: float, expiries: list[str], **kw) -> dict[str, OptionChain]:
    return {"XSP": chain("XSP", day, spot, expiries, XSP_STRIKES, **kw)}


def ibit(day: str, ivs: dict[str, float], **kw) -> dict[str, OptionChain]:
    return {"IBIT": chain("IBIT", day, 60.0, list(ivs), IBIT_STRIKES, iv=ivs, spread_pct=0.01, min_half=0.005, **kw)}


def leg_quote(ch: OptionChain, strike: float, expiry: str) -> dict:
    return ch.quote(occ_symbol(ch.underlying, expiry, "P", strike))


# ----------------------------------------------------------------------------------------- runs and state
def config(*books: str):
    cfg = load_config()
    for name in MINE:
        cfg.constitution["shadow"][name]["enabled"] = name in books
    return cfg


@pytest.fixture()
def sd(tmp_path) -> Path:
    state_dir = tmp_path / "state"
    pipeline.run_init(load_config(), state_dir, created="2025-12-01")
    return state_dir


def checks(prov: FakeProvider, day: str, **over) -> dict:
    vix = prov.vix("VIX")
    vix = vix[vix.index <= pd.Timestamp(day)]
    return {"spy_ok": True, "vix": float(vix.iloc[-1]), "vix_ok": True, "vix_series": vix, **over}


def step(cfg, prov, state_dir: Path, kind: str, day: str, fn) -> pipeline.Run:
    run = pipeline.Run(cfg, prov, state_dir, kind, day, services=SERVICES)
    assert run.begin()
    try:
        fn(run)
        run.finish("ok")
    finally:
        run.close()
    return run


def daily(cfg, prov, state_dir: Path, day: str, **over) -> pipeline.Run:
    return step(cfg, prov, state_dir, "daily", day, lambda run: option_shadows.daily(run, checks(prov, day, **over)))


def options(cfg, prov, state_dir: Path, day: str, chains: dict) -> set[str]:
    roots: set[str] = set()

    def job(run):
        roots.update(option_shadows.roots_needed(run))
        option_shadows.options_job(run, chains)
    step(cfg, prov, state_dir, "options", day, job)
    return roots


def state(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def events(state_dir: Path, book: str) -> list[dict]:
    recs = [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]
    return [r["payload"] for r in recs if r["record_type"] == "shadow" and r["payload"].get("book") == book]


def kinds(state_dir: Path, book: str) -> list[str]:
    return [e["event"] for e in events(state_dir, book)]


# ------------------------------------------------------------------------------------------ rules: dates
def test_monthly_expiry_is_the_third_friday_or_the_session_before():
    assert rules.monthly_expiry(2026, 11) == "2026-11-20"
    assert rules.monthly_expiry(2026, 10) == "2026-10-16"
    assert rules.monthly_expiry(2025, 4) == "2025-04-17"          # Good Friday: the Thursday


def test_one_entry_window_per_monthly_cycle_from_45_to_40_dte():
    window = [40, 45]
    assert rules.cycle_expiry("2026-10-05", window) is None       # 46 days before 20 Nov
    assert rules.cycle_expiry("2026-10-06", window) == "2026-11-20"
    assert rules.cycle_expiry("2026-10-09", window) == "2026-11-20"
    assert rules.cycle_expiry("2026-10-12", window) is None       # 39 days
    assert rules.cycle_expiry("2026-09-01", window) == "2026-10-16"


# ---------------------------------------------------------------------------------------- rules: signals
def test_o1_filters_pass_veto_and_fail_closed():
    spx = market().daily_bars("^GSPC")
    ok = rules.o1_filters(spx, 15.0, 17.0, "2026-10-05", FILTERS)
    assert ok["pass"] and ok["data_ok"] and ok["ratio"] == pytest.approx(15 / 17) and ok["close"] > ok["sma"]
    assert not rules.o1_filters(spx, 30.0, 40.0, "2026-10-05", FILTERS)["pass"]           # VIX < 30 only
    assert not rules.o1_filters(spx, 17.0, 17.0, "2026-10-05", FILTERS)["pass"]           # VIX/VIX3M < 1.0 only
    down = spx.iloc[::-1].copy()
    down.index = spx.index
    falling = rules.o1_filters(down, 15.0, 17.0, "2026-10-05", FILTERS)
    assert not falling["pass"] and falling["data_ok"] and "no uptrend" in falling["reasons"][0]
    missing = rules.o1_filters(spx, 15.0, None, "2026-10-05", FILTERS)
    assert not missing["pass"] and not missing["data_ok"] and missing["reasons"] == ["no VIX3M close"]
    decided = rules.o1_filters(spx, 31.0, None, "2026-10-05", FILTERS)      # a failed veto decides the day
    assert not decided["pass"] and decided["data_ok"]
    assert not rules.o1_filters(spx, 15.0, 17.0, "2026-10-04", FILTERS)["data_ok"]        # a Sunday: no close


def test_vix_fade_signal_needs_a_spike_a_fade_and_the_cooldown():
    idx = SESSIONS[(SESSIONS >= "2026-08-03") & (SESSIONS <= "2026-10-30")]
    vix = pd.Series(15.0, index=idx)
    vix.loc[pd.Timestamp("2026-09-21")] = 35.0
    vix.loc[pd.Timestamp("2026-09-22")] = 29.0
    vix.loc[pd.Timestamp("2026-09-23")] = 27.0
    assert not rules.vix_fade_signal(vix, "2026-09-22", None, FADE)["signal"]               # 29 > 0.8 x 35
    hit = rules.vix_fade_signal(vix, "2026-09-23", None, FADE)
    assert hit["signal"] and hit["peak"] == 35.0 and hit["peak_date"] == "2026-09-21"
    assert not rules.vix_fade_signal(vix, "2026-09-24", "2026-09-23", FADE)["signal"]       # cool-down
    assert rules.vix_fade_signal(vix, "2026-09-24", "2026-08-24", FADE)["signal"]           # 31 days later
    assert not rules.vix_fade_signal(vix, "2026-10-06", None, FADE)["signal"]               # peak left the window
    assert not rules.vix_fade_signal(vix, "2026-11-02", None, FADE)["data_ok"]              # no close that day


def test_btc_trend():
    days = pd.date_range("2025-01-01", "2026-10-05", freq="D")
    up = pd.Series(np.exp(0.001 * np.arange(len(days))), index=days)
    assert rules.btc_trend(up, "2026-10-05", 200)["pass"]
    falling = rules.btc_trend(pd.Series(up.values[::-1], index=days), "2026-10-05", 200)
    assert not falling["pass"] and falling["data_ok"]
    assert not rules.btc_trend(up, "2026-10-06", 200)["data_ok"]                            # UTC day not in yet


def test_st2_fires_on_the_first_inversion_in_20_sessions_in_an_uptrend():
    spy = market().daily_bars("SPY")
    vix3m = pd.Series(17.0, index=spy.index)
    t = "2026-09-15"

    def vix(overrides: dict) -> pd.Series:
        s = pd.Series(15.0, index=spy.index)
        for d, v in overrides.items():
            s.loc[pd.Timestamp(d)] = v
        return s

    hit = rules.st2_signal(spy, vix({t: 17.0}), vix3m, t, ST2)                  # exactly 1.00 counts
    assert hit["signal"] and hit["ratio"] == pytest.approx(1.0)
    assert not rules.st2_signal(spy, vix({t: 16.9}), vix3m, t, ST2)["signal"]
    assert not rules.st2_signal(spy, vix({t: 18.0, "2026-08-28": 18.0}), vix3m, t, ST2)["signal"]   # not first
    assert rules.st2_signal(spy, vix({t: 18.0, "2026-08-14": 18.0}), vix3m, t, ST2)["signal"]  # 21 sessions back
    gap = vix3m.drop(pd.Timestamp("2026-09-01"))
    blind = rules.st2_signal(spy, vix({t: 18.0}), gap, t, ST2)
    assert not blind["signal"] and not blind["data_ok"]                         # fail closed on the quiet window
    down = spy.iloc[::-1].copy()
    down.index = spy.index
    assert not rules.st2_signal(down, vix({t: 18.0}), vix3m, t, ST2)["signal"]


# ----------------------------------------------------------------------------------------- rules: chains
def test_pick_expiry():
    listed = ["2026-11-02", "2026-11-06", "2026-11-13", "2026-11-20", "2026-12-18"]
    day = "2026-10-06"
    assert rules.pick_expiry(listed, day, target="2026-11-20") == "2026-11-20"
    assert rules.pick_expiry(["2026-11-13", "2026-11-19", "2026-11-23"], day, target="2026-11-20") == "2026-11-19"
    assert rules.pick_expiry(listed, "2026-09-24") == "2026-11-06"             # the last within 45 days (I1)
    assert rules.pick_expiry(["2026-12-18"], day, target="2026-11-20") is None  # 73 days: outside 40-50


def test_pick_put_spread_by_delta_and_width_with_an_iv_fallback():
    ch = chain("XSP", "2026-10-06", 680.0, ["2026-11-20"], XSP_STRIKES)
    sel = rules.pick_put_spread(ch, "2026-11-20", "2026-10-06", SPREAD)
    assert sel["ok"] and (sel["short_strike"], sel["long_strike"]) == (645.0, 610.0)
    assert abs(sel["short_delta"] - 0.20) <= 0.05 and 0.04 <= sel["width_pct"] <= 0.06
    assert [(leg["position"], leg["strike"]) for leg in sel["legs"]] == [("short", 645.0), ("long", 610.0)]
    assert sel["legs"][0]["occ"] == "XSP261120P00645000" and sel["delta_source"] == "chain"
    no_delta = chain("XSP", "2026-10-06", 680.0, ["2026-11-20"], XSP_STRIKES, deltas=False)
    again = rules.pick_put_spread(no_delta, "2026-11-20", "2026-10-06", SPREAD)
    assert again["ok"] and again["short_strike"] == 645.0 and again["delta_source"] == "black_scholes"
    coarse = chain("XSP", "2026-10-06", 680.0, ["2026-11-20"], list(range(500, 725, 50)))
    assert not rules.pick_put_spread(coarse, "2026-11-20", "2026-10-06", SPREAD)["ok"]     # no 4-6% width
    far = rules.pick_put_spread(ch, "2026-11-20", "2026-10-06", dict(SPREAD, short_delta=0.95))
    assert not far["ok"] and "delta" in far["reasons"][0]


def test_credit_spread_fill_model_and_liquidity():
    ch = chain("XSP", "2026-10-06", 680.0, ["2026-11-20"], XSP_STRIKES)
    legs = rules.pick_put_spread(ch, "2026-11-20", "2026-10-06", SPREAD)["legs"]
    short, long = leg_quote(ch, 645, "2026-11-20"), leg_quote(ch, 610, "2026-11-20")
    value = (short["bid"] + short["ask"]) / 2 - (long["bid"] + long["ask"]) / 2
    width = short["ask"] - short["bid"] + long["ask"] - long["bid"]
    q = rules.credit_quote(ch, legs)
    assert q["value"] == pytest.approx(value) and q["natural_width"] == pytest.approx(width)
    assert rules.sell_to_open_price(q, 0.3) == pytest.approx(value - 0.3 * width)       # mid - 0.3 x natural
    assert rules.buy_to_close_price(q, 0.3) == pytest.approx(value + 0.3 * width)       # mid + 0.3 x natural
    assert rules.credit_liquidity(ch, q, legs, {"max_natural_frac_of_credit": 0.10})["ok"]
    wide = chain("XSP", "2026-10-06", 680.0, ["2026-11-20"], XSP_STRIKES, spread_pct=0.10, min_half=0.2)
    liq = rules.credit_liquidity(wide, rules.credit_quote(wide, legs), legs, {"max_natural_frac_of_credit": 0.10})
    assert not liq["ok"] and liq["natural_frac_of_credit"] > 0.10
    thin = chain("XSP", "2026-10-06", 680.0, ["2026-11-20"], XSP_STRIKES, oi=100)
    oi = rules.credit_liquidity(thin, q, legs, {"max_natural_frac_of_credit": 0.10, "min_open_interest": 500})
    assert not oi["ok"] and "open interest" in oi["reasons"][0]
    one_sided = ch.frame.copy()
    one_sided.loc[one_sided["occ"] == legs[1]["occ"], "bid"] = 0.0
    assert rules.credit_quote(OptionChain("XSP", ch.asof, 680.0, "fake", one_sided), legs) is None


def test_intrinsic_value_exits_and_results():
    legs = [{"strike": 645.0, "right": "P", "position": "short"}, {"strike": 610.0, "right": "P", "position": "long"}]
    assert rules.spread_intrinsic(legs, 700.0) == 0.0
    assert rules.spread_intrinsic(legs, 630.0) == pytest.approx(15.0)
    assert rules.spread_intrinsic(legs, 500.0) == pytest.approx(35.0)                  # the width: max loss
    res = rules.result_on_max_loss(4.0, 35.0, 35.0)
    assert res["max_loss"] == 31.0 and res["return"] == pytest.approx(-1.0)
    exits = {"take_profit_at": 0.5, "exit_dte": 21}
    assert rules.managed_exit(4.0, 2.0, 30, exits) == "take_profit"                    # exactly half the credit
    assert rules.managed_exit(4.0, 2.01, 22, exits) is None
    assert rules.managed_exit(4.0, 2.01, 21, exits) == "time_stop"
    assert rules.managed_exit(4.0, 0.1, 0, {"take_profit_at": None, "exit_dte": None}) is None   # held to expiry


def test_o1_promotion_check_follows_track_14():
    promo = load_config().shadow("O1")["promotion"]
    good = [{"return": 0.02, "filters": {"pass": True}}] * 24
    res = rules.o1_promotion_check(good, promo)
    assert res["ready"] and res["passes"] and res["floor_r"] == pytest.approx(0.02 - 2 * 0.084 / math.sqrt(24))
    assert not rules.o1_promotion_check(good[:10], promo)["passes"]
    assert rules.o1_promotion_check(good[:10], promo, months=30)["ready"]
    assert not rules.o1_promotion_check(good[:23] + [{"return": -1.2, "filters": {"pass": True}}],
                                        promo)["within_max_loss"]
    assert not rules.o1_promotion_check([{"return": -0.03, "filters": {"pass": True}}] * 24, promo)["mean_ok"]
    assert not rules.o1_promotion_check(good[:23] + [{"return": 0.02, "filters": {"pass": False}}],
                                        promo)["filters_respected"]


# ------------------------------------------------------------------------------------ runner: M7 / O1
def _o1_entry(sd: Path, cfg, prov, spot: float = 680.0) -> dict[str, OptionChain]:
    daily(cfg, prov, sd, "2026-10-02")                  # the window opens with Tuesday's entry: nothing yet
    assert state(sd)["shadow"]["O1"]["open_trade"] is None
    daily(cfg, prov, sd, "2026-10-05")                  # 45 days before the November monthly
    snap = xsp("2026-10-06", spot, ["2026-11-06", "2026-11-20", "2026-12-18"])
    assert options(cfg, prov, sd, "2026-10-06", snap) == {"XSP"}
    return snap


def test_m7_enters_at_the_1017_snapshot_and_takes_profit(sd):
    cfg, prov = config("O1"), market()
    snap = _o1_entry(sd, cfg, prov)["XSP"]
    ot = state(sd)["shadow"]["O1"]["open_trade"]
    short, long = leg_quote(snap, 645, "2026-11-20"), leg_quote(snap, 610, "2026-11-20")
    value = short["mid"] - long["mid"]
    width = short["ask"] - short["bid"] + long["ask"] - long["bid"]
    assert ot["status"] == "open" and ot["signal_date"] == "2026-10-05" and ot["fill_date"] == "2026-10-06"
    assert ot["expiry"] == "2026-11-20" and ot["dte"] == 45 and (ot["short_strike"], ot["long_strike"]) == (645, 610)
    assert ot["credit"] == pytest.approx(value - 0.3 * width) and ot["slippage"] == pytest.approx(0.3 * width)
    assert ot["max_loss"] == pytest.approx(35.0 - ot["credit"])
    assert ot["planned_exit"] == "2026-10-30" and ot["filters"]["pass"] and ot["fill_time"] == "10:17"
    assert ot["contracts_at_nav"] == 0                                  # $100k: shadow only (design §3 M7)
    assert ot["nav_for_one_contract"] == pytest.approx(ot["max_loss_usd"] / 0.02)
    assert state(sd)["shadow"]["O1"]["last_cycle"] == "2026-11-20"
    daily(cfg, prov, sd, "2026-10-06")                  # one open at a time: no second signal
    assert kinds(sd, "O1") == ["signal", "entry"]

    rally = xsp("2026-10-13", 720.0, ["2026-11-20"])
    options(cfg, prov, sd, "2026-10-13", rally)
    book = state(sd)["shadow"]["O1"]
    assert book["open_trade"] is None and len(book["trades"]) == 1
    trade = book["trades"][0]
    q = rules.credit_quote(rally["XSP"], ot["legs"])
    cost = q["value"] + 0.3 * q["natural_width"]
    assert trade["exit_reason"] == "take_profit" and trade["exit_date"] == "2026-10-13"
    assert trade["exit_price"] == pytest.approx(cost) and cost <= 0.5 * trade["credit"]
    assert trade["return"] == pytest.approx((trade["credit"] - cost) / (35.0 - trade["credit"]))
    assert trade["return_basis"] == "max_loss" and trade["pnl_usd"] == pytest.approx(100 * (trade["credit"] - cost))
    assert kinds(sd, "O1") == ["signal", "entry", "mark", "exit"]
    assert all(e["book"] == "O1" for e in events(sd, "O1"))


def test_m7_closes_at_21_days_to_expiry(sd):
    cfg, prov = config("O1"), market()
    _o1_entry(sd, cfg, prov)
    options(cfg, prov, sd, "2026-10-28", {})                                            # no chain: no mark
    assert events(sd, "O1")[-1] == {"book": "O1", "event": "no_quote", "trade_id": "S-2026-10-05-O1",
                                    "reason": "no option chain in the snapshot"}
    options(cfg, prov, sd, "2026-10-29", xsp("2026-10-29", 650.0, ["2026-11-20"]))     # 22 days: hold
    ot = state(sd)["shadow"]["O1"]["open_trade"]
    assert ot["status"] == "open" and ot["mark"]["return"] < 0 and ot["min_return"] <= ot["mark"]["return"]
    options(cfg, prov, sd, "2026-10-30", xsp("2026-10-30", 650.0, ["2026-11-20"]))     # 21 days: close
    trade = state(sd)["shadow"]["O1"]["trades"][0]
    assert trade["exit_reason"] == "time_stop" and trade["exit_date"] == trade["planned_exit"] == "2026-10-30"
    assert -1.0 < trade["return"] < 0 and trade["days_held"] == 24


def test_m7_expiry_safety_net_settles_at_intrinsic_with_an_alert(sd):
    cfg, prov = config("O1"), market()
    _o1_entry(sd, cfg, prov)
    run = daily(cfg, prov, sd, "2026-11-20")            # no 10:17 job closed it
    trade = state(sd)["shadow"]["O1"]["trades"][0]
    settle = float(prov.daily_bars("^GSPC").at[pd.Timestamp("2026-11-20"), "close"]) / 10.0
    assert trade["exit_reason"] == "expiry_settlement" and trade["settle_price"] == pytest.approx(settle)
    assert trade["exit_price"] == 0.0 and trade["return"] == pytest.approx(trade["credit"] / trade["max_loss"])
    assert any("still open at expiry" in n for n in run.result.notes)


def test_a_failed_entry_keeps_the_cycle_open(sd):
    cfg, prov = config("O1"), market()
    daily(cfg, prov, sd, "2026-10-05")
    wide = xsp("2026-10-06", 680.0, ["2026-11-20"], spread_pct=0.10, min_half=0.2)
    options(cfg, prov, sd, "2026-10-06", wide)
    book = state(sd)["shadow"]["O1"]
    assert book["open_trade"] is None and "last_cycle" not in book
    skip = events(sd, "O1")[-1]
    assert skip["event"] == "skip" and skip["reason"].startswith("liquidity") and skip["credit"] > 0
    daily(cfg, prov, sd, "2026-10-06")                  # still 44 days out: try again tomorrow
    assert state(sd)["shadow"]["O1"]["open_trade"]["signal_date"] == "2026-10-06"
    options(cfg, prov, sd, "2026-10-07", {})
    assert events(sd, "O1")[-1]["reason"] == "no option chain in the snapshot"


def test_an_entry_no_options_job_took_expires(sd):
    cfg, prov = config("O1"), market()
    daily(cfg, prov, sd, "2026-10-05")
    daily(cfg, prov, sd, "2026-10-06")                  # the 10:17 ET job did not run today
    assert kinds(sd, "O1") == ["signal", "expired", "signal"]
    options(cfg, prov, sd, "2026-10-08", xsp("2026-10-08", 680.0, ["2026-11-20"]))    # a day late: stale
    assert kinds(sd, "O1")[-1] == "expired" and state(sd)["shadow"]["O1"]["open_trade"] is None
    stale = xsp("2026-10-09", 680.0, ["2026-11-20"], asof="2026-10-08T10:17:00")
    daily(cfg, prov, sd, "2026-10-08")
    options(cfg, prov, sd, "2026-10-09", stale)
    assert events(sd, "O1")[-1]["reason"].startswith("the option chain is stale")


def test_o1_fails_closed_on_unconfirmed_closes(sd):
    cfg = config("O1")
    prov = market(second={"2026-10-05": 6800.0 * 1.01})    # the second source disagrees by 1%
    run = daily(cfg, prov, sd, "2026-10-05")
    blocked = events(sd, "O1")[-1]
    assert blocked["event"] == "blocked" and "two-source" in blocked["reasons"][0]
    assert state(sd)["shadow"]["O1"]["open_trade"] is None
    assert any(n.startswith("ALERT data: option shadow books fail closed: O1:") for n in run.result.notes)
    daily(cfg, market(), sd, "2026-10-06", vix_ok=False)
    assert "VIX close is not confirmed" in events(sd, "O1")[-1]["reasons"][0]


def test_missing_vix3m_blocks_o1_o1h_and_st2_with_one_data_alert(sd):
    cfg, prov = config("O1", "O1H", "ST2"), market(vix3m=None)
    run = daily(cfg, prov, sd, "2026-10-05")
    for book in ("O1", "O1H", "ST2"):
        assert kinds(sd, book) == ["blocked"] and state(sd)["shadow"][book]["open_trade"] is None
    alerts = [a for a in state(sd)["alerts"] if a["kind"] == "data"]
    assert len(alerts) == 1 and all(f"{b}:" in alerts[0]["message"] for b in ("O1", "O1H", "ST2"))
    assert not [n for n in run.result.notes if "shadow" in n and "failed" in n]


# -------------------------------------------------------------------------------------- runner: O1-h, I1
def test_o1h_holds_to_expiry_overlaps_the_next_cycle_and_settles(sd):
    cfg, prov = config("O1H"), market()
    daily(cfg, prov, sd, "2026-10-05")
    options(cfg, prov, sd, "2026-10-06", xsp("2026-10-06", 680.0, ["2026-11-20"]))
    first = state(sd)["shadow"]["O1H"]["open_trade"]
    assert first["status"] == "open" and first["short_strike"] == 630 and first["short_delta"] == pytest.approx(
        0.10, abs=0.05) and first["planned_exit"] == "2026-11-20"
    options(cfg, prov, sd, "2026-10-13", xsp("2026-10-13", 720.0, ["2026-11-20"]))   # no take-profit: held
    assert state(sd)["shadow"]["O1H"]["open_trade"]["status"] == "open"
    daily(cfg, prov, sd, "2026-11-02")                  # the December cycle opens while November is held
    book = state(sd)["shadow"]["O1H"]
    assert [t["trade_id"] for t in book["held"]] == [first["trade_id"]]
    assert book["open_trade"]["status"] == "pending_entry" and book["open_trade"]["target_expiry"] == "2026-12-18"
    options(cfg, prov, sd, "2026-11-03", xsp("2026-11-03", 685.0, ["2026-11-20", "2026-12-18"],
                                              iv={"2026-11-20": 0.35, "2026-12-18": 0.18}))
    book = state(sd)["shadow"]["O1H"]
    assert book["open_trade"]["expiry"] == "2026-12-18" and book["held"][0]["mark"]["date"] == "2026-11-03"
    daily(cfg, prov, sd, "2026-11-20")
    book = state(sd)["shadow"]["O1H"]
    assert book["held"] == [] and book["open_trade"]["expiry"] == "2026-12-18"
    trade = book["trades"][0]
    assert trade["exit_reason"] == "expiry" and trade["exit_date"] == "2026-11-20" and trade["exit_price"] == 0.0
    assert trade["return"] == pytest.approx(trade["credit"] / (35.0 - trade["credit"]))
    assert not [a for a in state(sd)["alerts"] if a["kind"] in ("shadow", "data")]


def test_o1h_settles_in_the_money_at_the_official_close(sd):
    cfg, prov = config("O1H"), market(gspc={"2026-11-20": 6200.0})
    daily(cfg, prov, sd, "2026-10-05")
    options(cfg, prov, sd, "2026-10-06", xsp("2026-10-06", 680.0, ["2026-11-20"]))
    daily(cfg, prov, sd, "2026-11-20")
    trade = state(sd)["shadow"]["O1H"]["trades"][0]
    assert trade["settle_price"] == pytest.approx(620.0) and trade["exit_price"] == pytest.approx(10.0)
    assert trade["return"] == pytest.approx((trade["credit"] - 10.0) / (35.0 - trade["credit"]))


def test_i1_enters_after_a_fading_vix_spike_and_holds_to_expiry(sd):
    cfg = config("I1")
    prov = market(vix={"2026-09-21": 35.0, "2026-09-22": 29.0, "2026-09-23": 27.0, "2026-09-24": 26.0})
    daily(cfg, prov, sd, "2026-09-22")
    assert events(sd, "I1") == []                       # 29 > 0.8 x 35: not fading yet
    daily(cfg, prov, sd, "2026-09-23")
    assert state(sd)["shadow"]["I1"]["open_trade"]["trigger"]["peak"] == 35.0
    snap = xsp("2026-09-24", 680.0, ["2026-11-02", "2026-11-06", "2026-11-13", "2026-11-20"], iv=0.24)
    options(cfg, prov, sd, "2026-09-24", snap)
    ot = state(sd)["shadow"]["I1"]["open_trade"]
    assert ot["status"] == "open" and ot["expiry"] == "2026-11-06" and ot["dte"] == 43
    daily(cfg, prov, sd, "2026-09-24")                  # still fading, but inside the 30-day cool-down
    assert kinds(sd, "I1") == ["signal", "entry"]
    daily(cfg, prov, sd, "2026-11-06")
    trade = state(sd)["shadow"]["I1"]["trades"][0]
    assert trade["exit_reason"] == "expiry" and trade["return"] == pytest.approx(trade["credit"] / trade["max_loss"])


# ----------------------------------------------------------------------------------------- runner: I2
def test_i2_ibit_spread_with_bitcoin_uptrend_and_iv_contango(sd):
    cfg, prov = config("I2"), market()
    daily(cfg, prov, sd, "2026-10-05")
    assert state(sd)["shadow"]["I2"]["open_trade"]["filters"]["pass"]
    roots = options(cfg, prov, sd, "2026-10-06", ibit("2026-10-06", {"2026-11-06": 0.50, "2026-11-20": 0.52,
                                                                     "2027-01-15": 0.55}))
    ot = state(sd)["shadow"]["I2"]["open_trade"]
    assert roots == {"IBIT"} and ot["status"] == "open" and ot["expiry"] == "2026-11-20"
    assert (ot["short_strike"], ot["long_strike"]) == (52, 49) and ot["term_structure"]["ratio"] == pytest.approx(
        0.50 / 0.55)
    assert min(ot["liquidity"]["open_interest"]) >= 500


@pytest.mark.parametrize("ivs, oi, reason", [
    ({"2026-11-06": 0.60, "2026-11-20": 0.55, "2027-01-15": 0.50}, 1000.0, "backwardation"),
    ({"2026-11-06": 0.50, "2026-11-20": 0.52, "2027-01-15": 0.55}, 100.0, "open interest"),
])
def test_i2_skips_on_backwardation_or_thin_open_interest(sd, ivs, oi, reason):
    cfg, prov = config("I2"), market()
    daily(cfg, prov, sd, "2026-10-05")
    options(cfg, prov, sd, "2026-10-06", ibit("2026-10-06", ivs, oi=oi))
    skip = events(sd, "I2")[-1]
    assert skip["event"] == "skip" and reason in skip["reason"]
    assert state(sd)["shadow"]["I2"]["open_trade"] is None


def test_i2_without_iv_data_fails_closed(sd):
    cfg, prov = config("I2"), market()
    daily(cfg, prov, sd, "2026-10-05")
    options(cfg, prov, sd, "2026-10-06", ibit("2026-10-06", {"2026-11-20": 0.52}))    # no ~30 or ~90-day expiry
    assert kinds(sd, "I2")[-1] == "blocked"
    assert [a for a in state(sd)["alerts"] if a["kind"] == "data" and "I2:" in a["message"]]


# ----------------------------------------------------------------------------------------- runner: ST-2
def test_st2_buys_the_next_open_and_sells_at_the_close_of_session_20(sd):
    cfg = config("ST2")
    prov = market(vix={"2026-09-15": 18.0, "2026-09-25": 18.0})
    spy = prov.daily_bars("SPY")
    last = SESSIONS[SESSIONS >= "2026-09-16"][19]
    assert last == pd.Timestamp("2026-10-13")
    for day in ("2026-09-15", "2026-09-16", "2026-09-25", "2026-10-12", "2026-10-13", "2026-10-14"):
        daily(cfg, prov, sd, day)
    book = state(sd)["shadow"]["ST2"]
    assert book["open_trade"] is None and len(book["trades"]) == 1
    trade = book["trades"][0]
    entry = float(spy.at[pd.Timestamp("2026-09-16"), "open"]) * 1.0001      # SPY slippage: 1 bp
    exit_ = float(spy.at[last, "close"]) * 0.9999
    assert trade["signal_date"] == "2026-09-15" and trade["fill_date"] == "2026-09-16"
    assert trade["entry_price"] == pytest.approx(entry) and trade["exit_price"] == pytest.approx(exit_)
    assert trade["exit_date"] == "2026-10-13" and trade["sessions"] == 20 and trade["return_basis"] == "notional"
    assert trade["return"] == pytest.approx(exit_ / entry - 1.0)
    assert trade["excess_return"] == pytest.approx(trade["return"] - 0.04 * 20 / 252)
    assert kinds(sd, "ST2") == ["signal", "entry", "exit"]         # the 25 Sep inversion came while it was open


def test_st2_fails_closed_on_an_unconfirmed_close(sd):
    cfg, prov = config("ST2"), market(vix={"2026-09-15": 18.0})
    daily(cfg, prov, sd, "2026-09-15", spy_ok=False)
    assert kinds(sd, "ST2") == ["blocked"] and state(sd)["shadow"]["ST2"]["open_trade"] is None
    assert [a for a in state(sd)["alerts"] if a["kind"] == "data" and "ST2:" in a["message"]]


# --------------------------------------------------------------------------------------- runner: plumbing
def test_one_broken_book_does_not_stop_the_others(sd):
    cfg, prov = config("O1", "ST2"), market(vix={"2026-10-05": 18.0})
    cfg.constitution["shadow"]["O1"]["signal"] = "no-such-rule"
    daily(cfg, prov, sd, "2026-10-05")
    st = state(sd)
    assert kinds(sd, "O1") == ["error"] and any(a["kind"] == "shadow" and "O1 failed" in a["message"]
                                                for a in st["alerts"])
    assert st["shadow"]["ST2"]["open_trade"]["status"] == "pending_entry"


def test_roots_disabled_books_and_older_states(sd):
    cfg, prov = config(), market()
    options(cfg, prov, sd, "2026-10-06", {})
    daily(cfg, prov, sd, "2026-10-05")
    assert all(events(sd, b) == [] for b in MINE)
    st = state(sd)
    for book in MINE:
        del st["shadow"][book]                          # a state from before Phase B
    (sd / "state.json").write_text(json.dumps(st))
    cfg = config(*MINE)
    assert options(cfg, prov, sd, "2026-10-07", {}) == set()
    daily(cfg, prov, sd, "2026-10-07")
    st = state(sd)
    assert all(st["shadow"][b]["trades"] == [] for b in MINE)
    assert st["shadow"]["O1"]["open_trade"]["status"] == "pending_entry"


def test_the_daily_pipeline_runs_the_books(tmp_path):
    cfg = load_config()
    for block in cfg.constitution["modules"].values():
        block["enabled"] = False
    for name, block in cfg.constitution["shadow"].items():
        block["enabled"] = name in MINE
    prov = market(vix={"2026-09-15": 18.0})
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created="2026-09-01")
    for day in SESSIONS[(SESSIONS >= "2026-09-14") & (SESSIONS <= "2026-10-14")]:
        res = pipeline.run_daily(cfg, prov, state_dir, date=day.strftime("%Y-%m-%d"), services=SERVICES)
        assert res.status == "ok", res.notes
    st = state(state_dir)
    assert [t["exit_date"] for t in st["shadow"]["ST2"]["trades"]] == ["2026-10-13"]
    assert kinds(state_dir, "O1") == ["signal", "expired"] * 4        # no 10:17 ET job in this test
    ours = ("option shadow books", "option_shadows") + tuple(f"{b} " for b in MINE)
    assert not [a for a in st["alerts"] if a["kind"] in ("shadow", "data") and a["message"].startswith(ours)]
