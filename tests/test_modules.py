"""Tests for the trading modules (M1, M2, M3 and the shadow book) on deterministic synthetic prices."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from traderec.config import load_config
from traderec.modules import (w10_exit_check, w10_exit_date, w10_kill_check, w10_signal, btc_weekly_switch, m1_entry_check, m1_exit_check, m2_orders, m2_signals,
                              m2_targets, st1b_entry_check, w10_check)
from traderec.modules.m3_btc import last_sunday_before

# Explicit parameters (the constitution's values) so the tests pin behaviour, not the current YAML.
M1_CFG = {"sma_trend": 200, "rsi_period": 2, "rsi_below": 10, "vix_min": 20.0, "exit_sma": 5, "max_sessions": 20}
W10_CFG = {"drop_pct": -0.03, "decluster_sessions": 20, "hold_sessions": 42, "void_vix_above": 45}
M2_LEGS = {"SPY": "us_equity", "QQQ": "us_equity", "IEF": "duration", "GLD": "gold", "USO": "oil",
           "FXE": "usd", "FXY": "usd", "FXA": "usd"}
M2_CFG = {"legs": M2_LEGS, "lookback_sessions": 252, "vol_target_per_leg": 0.035, "ewma_span": 60, "scale": 0.5,
          "long_only": True, "gross_cap_pct_nav": 0.60, "single_leg_cap_pct_nav": 0.25,
          "us_equity_stress_cap_pct_nav": 0.03, "band_rel": 0.25, "band_abs_usd": 300, "max_orders_per_email": 3}


# ----------------------------------------------------------------------------------------------- helpers
def bars(closes, start: str = "2024-01-01", adj=None) -> pd.DataFrame:
    """A price frame on business days; `adj` overrides adj_close (defaults to the raw close)."""
    idx = pd.bdate_range(start, periods=len(closes))
    c = pd.Series(np.asarray(closes, dtype=float), index=idx)
    a = c if adj is None else pd.Series(np.asarray(adj, dtype=float), index=idx)
    return pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "adj_close": a, "volume": 1e6})


def uptrend(n: int, drift: float = 0.001, start: float = 100.0) -> list[float]:
    return list(start * (1.0 + drift) ** np.arange(n))


def extend(closes: list[float], returns) -> list[float]:
    out = list(closes)
    for r in returns:
        out.append(out[-1] * (1.0 + r))
    return out


def day(frame: pd.DataFrame, i: int) -> str:
    return frame.index[i].strftime("%Y-%m-%d")


def vix_on(date: str, level: float) -> pd.Series:
    return pd.Series([level], index=[pd.Timestamp(date)])


def dip_frame(n: int = 300, after=()) -> pd.DataFrame:
    """`n` uptrend sessions, then a sharp two-day dip (-2%, -2%) ending at index n + 1, then `after`."""
    return bars(extend(uptrend(n), [-0.02, -0.02, *after]))


def log_path(pattern, n: int, start: str = "2024-01-01", p0: float = 100.0) -> pd.Series:
    """Adjusted closes built from a repeating pattern of daily log returns."""
    r = np.resize(np.asarray(pattern, dtype=float), n - 1)
    return pd.Series(p0 * np.exp(np.concatenate([[0.0], np.cumsum(r)])), index=pd.bdate_range(start, periods=n))


# ------------------------------------------------------------------------------------------ M1 entry
def test_m1_triggers_on_sharp_dip_in_uptrend_with_vix_25():
    spy = dip_frame()
    d = day(spy, -1)
    res = m1_entry_check(spy, vix_on(d, 25.0), d, M1_CFG)
    assert res["signal"] is True
    assert res["rsi2"] < 10
    assert res["close"] > res["sma200"]
    assert res["vix"] == 25.0
    assert len(res["reasons"]) == 3


def test_m1_vix_gate_blocks_at_15():
    spy = dip_frame()
    d = day(spy, -1)
    res = m1_entry_check(spy, vix_on(d, 15.0), d, M1_CFG)
    assert res["signal"] is False
    assert res["rsi2"] < 10 and res["close"] > res["sma200"]   # only the VIX gate failed
    assert len(res["reasons"]) == 1 and "VIX 15.00 < 20.00" in res["reasons"][0]


def test_m1_vix_exactly_at_threshold_passes():
    spy = dip_frame()
    d = day(spy, -1)
    assert m1_entry_check(spy, vix_on(d, 20.0), d, M1_CFG)["signal"] is True


def test_m1_no_signal_without_a_dip():
    spy = dip_frame()
    d = day(spy, -3)                                            # last uptrend session: RSI2 = 100
    res = m1_entry_check(spy, vix_on(d, 25.0), d, M1_CFG)
    assert res["signal"] is False
    assert res["rsi2"] == pytest.approx(100.0)
    assert any("RSI2" in r for r in res["reasons"])


def test_m1_no_signal_below_sma200():
    spy = bars(extend(uptrend(300, drift=-0.001), [-0.02, -0.02]))
    d = day(spy, -1)
    res = m1_entry_check(spy, vix_on(d, 25.0), d, M1_CFG)
    assert res["signal"] is False
    assert res["close"] < res["sma200"]
    assert any("no uptrend" in r for r in res["reasons"])


def test_m1_insufficient_history_boundary():
    short = dip_frame(n=248)                                    # 249 sessions before the date
    d = day(short, -1)
    res = m1_entry_check(short, vix_on(d, 25.0), d, M1_CFG)
    assert res["signal"] is False and res["reasons"] == ["insufficient history"]
    enough = dip_frame(n=249)                                   # exactly 250 sessions before the date
    d = day(enough, -1)
    assert m1_entry_check(enough, vix_on(d, 25.0), d, M1_CFG)["signal"] is True


def test_m1_vix_missing_fails_closed():
    spy = dip_frame()
    d = day(spy, -1)
    res = m1_entry_check(spy, vix_on(day(spy, -2), 30.0), d, M1_CFG)   # VIX only for the day before
    assert res["signal"] is False and res["vix"] is None
    assert "vix missing" in res["reasons"]
    res = m1_entry_check(spy, pd.Series([np.nan], index=[pd.Timestamp(d)]), d, M1_CFG)
    assert res["signal"] is False and "vix missing" in res["reasons"]


def test_m1_no_bar_on_date_and_no_lookahead():
    spy = dip_frame()
    friday = spy.index[spy.index.weekday == 4][-1]
    saturday = (friday + pd.Timedelta(days=1)).strftime("%Y-%m-%d")      # inside the data, not a session
    assert pd.Timestamp(saturday) < spy.index[-1]
    res = m1_entry_check(spy, vix_on(saturday, 25.0), saturday, M1_CFG)
    assert res["signal"] is False and res["reasons"] == [f"no SPY close on {saturday}"]
    # sessions after `date` never change the answer
    longer = dip_frame(after=[0.05] * 5)
    d = day(dip_frame(), -1)
    assert m1_entry_check(longer, vix_on(d, 25.0), d, M1_CFG) == m1_entry_check(dip_frame(), vix_on(d, 25.0), d, M1_CFG)


def test_m1_uses_raw_closes_not_adjusted():
    closes = extend(uptrend(300), [-0.02, -0.02])
    spy = bars(closes, adj=uptrend(302))                        # adj_close shows no dip at all
    d = day(spy, -1)
    assert m1_entry_check(spy, vix_on(d, 25.0), d, M1_CFG)["signal"] is True


# ------------------------------------------------------------------------------------------- M1 exit
def test_m1_exits_on_first_close_above_sma5():
    spy = dip_frame(after=[-0.005, 0.03])                       # fill at index 302, rebound at 303
    trade = {"fill_date": day(spy, 302)}
    first = m1_exit_check(spy, day(spy, 302), trade, M1_CFG)
    assert first["exit"] is False and first["reason"] is None and first["sessions_held"] == 1
    assert first["close"] < first["sma5"]
    second = m1_exit_check(spy, day(spy, 303), trade, M1_CFG)
    assert second["exit"] is True and second["reason"] == "exit_rule"
    assert second["sessions_held"] == 2 and second["close"] > second["sma5"]


def test_m1_time_stop_at_20_sessions():
    spy = dip_frame(after=[-0.003] * 25)                        # a slow slide: never above SMA5
    trade = {"fill_date": day(spy, 302)}
    for k in range(1, 20):
        res = m1_exit_check(spy, day(spy, 301 + k), trade, M1_CFG)
        assert res["exit"] is False and res["sessions_held"] == k
    res = m1_exit_check(spy, day(spy, 321), trade, M1_CFG)
    assert res["exit"] is True and res["reason"] == "time_stop" and res["sessions_held"] == 20


def test_m1_exit_rule_takes_precedence_on_session_20():
    spy = dip_frame(after=[-0.003] * 19 + [0.05])
    res = m1_exit_check(spy, day(spy, 321), {"fill_date": day(spy, 302)}, M1_CFG)
    assert res["sessions_held"] == 20 and res["reason"] == "exit_rule"


def test_m1_exit_not_before_fill():
    spy = dip_frame(after=[0.03])
    res = m1_exit_check(spy, day(spy, 301), {"fill_date": day(spy, 302)}, M1_CFG)
    assert res["exit"] is False and res["sessions_held"] == 0


# ------------------------------------------------------------------------------------------ shadow
def test_st1b_is_m1_without_the_vix_gate():
    spy = dip_frame()
    d = day(spy, -1)
    assert m1_entry_check(spy, vix_on(d, 15.0), d, M1_CFG)["signal"] is False
    res = st1b_entry_check(spy, vix_on(d, 15.0), d, M1_CFG)
    assert res["signal"] is True and res["vix"] == 15.0
    assert not any("VIX" in r for r in res["reasons"])
    assert st1b_entry_check(spy, None, d, M1_CFG)["signal"] is True   # no VIX needed at all
    flat = st1b_entry_check(spy, None, day(spy, -3), M1_CFG)
    assert flat["signal"] is False                                      # still needs the dip


def crash_frame(n: int = 260, drift: float = 0.0005, crash: float = -0.035) -> pd.DataFrame:
    return bars(extend(uptrend(n, drift=drift), [crash]))


def test_w10_triggers_on_uptrend_crash_day():
    spx = crash_frame()
    d = day(spx, -1)
    res = w10_check(spx, vix_on(d, 30.0), d, None, W10_CFG)
    assert res["trigger"] is True
    assert res["ret"] == pytest.approx(-0.035)
    assert res["prev_close"] > res["sma200_prev"]
    assert res["vix"] == 30.0


def test_w10_needs_a_3pct_drop():
    spx = crash_frame(crash=-0.02)
    d = day(spx, -1)
    res = w10_check(spx, vix_on(d, 30.0), d, None, W10_CFG)
    assert res["trigger"] is False and any("no crash day" in r for r in res["reasons"])


def test_w10_void_above_vix_45():
    spx = crash_frame()
    d = day(spx, -1)
    res = w10_check(spx, vix_on(d, 50.0), d, None, W10_CFG)
    assert res["trigger"] is False and any("void" in r for r in res["reasons"])
    assert w10_check(spx, vix_on(d, 45.0), d, None, W10_CFG)["trigger"] is True
    missing = w10_check(spx, pd.Series(dtype=float), d, None, W10_CFG)
    assert missing["trigger"] is False and "vix missing" in missing["reasons"]


def test_w10_needs_prior_close_above_sma200():
    spx = crash_frame(drift=-0.0005)
    d = day(spx, -1)
    res = w10_check(spx, vix_on(d, 30.0), d, None, W10_CFG)
    assert res["trigger"] is False and res["prev_close"] < res["sma200_prev"]


def test_w10_declustering():
    spx = crash_frame()
    d = day(spx, -1)
    vix = vix_on(d, 30.0)
    assert w10_check(spx, vix, d, day(spx, -1 - 10), W10_CFG)["trigger"] is False
    assert w10_check(spx, vix, d, day(spx, -1 - 19), W10_CFG)["trigger"] is False
    res = w10_check(spx, vix, d, day(spx, -1 - 20), W10_CFG)
    assert res["trigger"] is True and any("20 sessions" in r for r in res["reasons"])
    blocked = w10_check(spx, vix, d, day(spx, -1 - 10), W10_CFG)
    assert any("declustered" in r for r in blocked["reasons"])


def test_w10_insufficient_history():
    spx = crash_frame(n=150)
    d = day(spx, -1)
    assert w10_check(spx, vix_on(d, 30.0), d, None, W10_CFG)["reasons"] == ["insufficient history"]


# ------------------------------------------------------------------------------------------- M2
UP = [0.01, 0.01, -0.01]           # |log return| is always 1%, so EWMA vol = 0.01 * sqrt(252) exactly
DOWN = [-0.01, -0.01, 0.01]
WEAK = [0.0101, -0.0099]           # +2.55% over 252 sessions: positive, but below a 4% T-bill rate


def test_m2_signal_signs_vol_and_raw_fraction():
    up, down, weak = log_path(UP, 300), log_path(DOWN, 300), log_path(WEAK, 300)
    date = up.index[-1].strftime("%Y-%m-%d")
    cfg = {**M2_CFG, "legs": {"SPY": "us_equity", "IEF": "duration", "GLD": "gold"}}
    sig = m2_signals({"SPY": up, "IEF": down, "GLD": weak, "XLE": up}, date, 0.04, cfg)
    assert set(sig) == {"SPY", "IEF", "GLD"}                  # only configured legs

    vol = 0.01 * math.sqrt(252)
    spy = sig["SPY"]
    assert spy["ret_252"] == pytest.approx(up.iloc[-1] / up.iloc[-253] - 1.0)
    assert spy["excess"] == pytest.approx(spy["ret_252"] - 0.04)
    assert spy["sign"] == 1 and spy["skipped"] is False
    assert spy["vol"] == pytest.approx(vol, rel=1e-9)
    assert spy["raw_target_frac"] == pytest.approx(0.035 / vol * 0.5, rel=1e-9)

    ief = sig["IEF"]
    assert ief["sign"] == -1 and ief["raw_target_frac"] == pytest.approx(-0.035 / vol * 0.5, rel=1e-9)

    gld = sig["GLD"]
    assert 0.0 < gld["ret_252"] < 0.04 and gld["sign"] == -1   # positive return, negative excess
    assert m2_signals({"GLD": weak}, date, 0.0, {**cfg, "legs": {"GLD": "gold"}})["GLD"]["sign"] == 1


def test_m2_signals_skip_legs_without_usable_history():
    up = log_path(UP, 300)
    date = up.index[-1].strftime("%Y-%m-%d")
    short = log_path(UP, 252, start=(up.index[-252]).strftime("%Y-%m-%d"))      # ends on `date`, too short
    exact = log_path(UP, 253, start=(up.index[-253]).strftime("%Y-%m-%d"))      # just enough
    stale = up.iloc[:-1]                                                        # no close on `date`
    cfg = {**M2_CFG, "legs": {"SPY": "us_equity", "QQQ": "us_equity", "IEF": "duration", "GLD": "gold",
                              "USO": "oil"}}
    sig = m2_signals({"SPY": up, "QQQ": short, "IEF": stale, "USO": exact}, date, 0.04, cfg)
    assert sig["SPY"]["skipped"] is False and sig["USO"]["skipped"] is False
    assert sig["QQQ"]["skipped"] and "insufficient history" in sig["QQQ"]["note"]
    assert sig["QQQ"]["raw_target_frac"] is None
    assert sig["IEF"]["skipped"] and "no close on" in sig["IEF"]["note"]
    assert sig["GLD"]["skipped"] and sig["GLD"]["note"] == "no price series"

    # skipped legs get no target, so their positions are left alone
    tg = m2_targets(sig, 100_000, {"SPY": 0.3, "QQQ": 0.35}, cfg)
    assert set(tg["targets"]) == {"SPY", "USO"}
    assert any(n.startswith("QQQ: no target") for n in tg["notes"])
    orders = m2_orders({"QQQ": 5_000.0, "IEF": 4_000.0}, tg["targets"], cfg)
    assert {o["ticker"] for o in orders["orders"] + orders["deferred"]} <= {"SPY", "USO"}


def test_m2_signals_ignore_data_after_date():
    up = log_path(UP, 300)
    date = up.index[-40].strftime("%Y-%m-%d")
    cfg = {**M2_CFG, "legs": {"SPY": "us_equity"}}
    assert m2_signals({"SPY": up}, date, 0.04, cfg) == m2_signals({"SPY": up.loc[:date]}, date, 0.04, cfg)


def test_m2_targets_long_only_leg_cap_gross_cap_and_us_equity_stress():
    fracs = {"SPY": 0.30, "QQQ": 0.20, "IEF": -0.10, "GLD": 0.15, "USO": 0.05, "FXA": 0.10}
    signals = {t: {"raw_target_frac": f, "skipped": False} for t, f in fracs.items()}
    stress = {"SPY": 0.30, "QQQ": 0.35, "IEF": 0.15, "GLD": 0.20, "USO": 0.40, "FXA": 0.15}
    res = m2_targets(signals, 100_000, stress, M2_CFG)
    t = res["targets"]

    us = 3_000 / 11_600                                         # SPY 20k x 0.30 + QQQ 16k x 0.35 = 11.6k
    assert t["IEF"] == 0.0                                      # long-only
    assert t["SPY"] == pytest.approx(25_000 * 0.8 * us)         # leg cap, then gross 0.8, then US scale
    assert t["QQQ"] == pytest.approx(20_000 * 0.8 * us)
    assert t["GLD"] == pytest.approx(12_000)
    assert t["USO"] == pytest.approx(4_000)
    assert t["FXA"] == pytest.approx(8_000)
    assert res["scalers"]["single_leg_cap"] == {"SPY": pytest.approx(25_000 / 30_000)}
    assert res["scalers"]["gross_cap"] == pytest.approx(0.8)
    assert res["scalers"]["us_equity_stress"] == pytest.approx(us)
    assert t["SPY"] * 0.30 + t["QQQ"] * 0.35 == pytest.approx(3_000)
    assert len(res["notes"]) == 4                               # long-only, leg cap, gross, US equity


def test_m2_targets_nothing_binding():
    signals = {"SPY": {"raw_target_frac": 0.02}, "GLD": {"raw_target_frac": 0.10}}
    res = m2_targets(signals, 100_000, {"SPY": 0.30}, M2_CFG)
    assert res["targets"] == {"SPY": pytest.approx(2_000), "GLD": pytest.approx(10_000)}
    assert res["scalers"] == {"single_leg_cap": {}, "gross_cap": 1.0, "us_equity_stress": 1.0}
    assert res["notes"] == []


def test_m2_targets_missing_stress_assumed_total_loss():
    res = m2_targets({"SPY": {"raw_target_frac": 0.05}}, 100_000, {}, M2_CFG)
    assert res["targets"]["SPY"] == pytest.approx(3_000)       # 5k x 100% stress scaled to the 3k cap
    assert any("no stress figure" in n for n in res["notes"])


def test_m2_end_to_end_respects_every_cap():
    patterns = {"SPY": UP, "QQQ": [0.02, 0.02, -0.02], "IEF": DOWN, "GLD": [0.004, 0.004, -0.003],
                "USO": [0.03, -0.028], "FXE": DOWN, "FXY": [0.001, -0.0012], "FXA": [0.005, 0.005, -0.004]}
    adj = {t: log_path(p, 400) for t, p in patterns.items()}
    date = adj["SPY"].index[-1].strftime("%Y-%m-%d")
    nav = 100_000.0
    stress = {"SPY": 0.30, "QQQ": 0.35, "IEF": 0.15, "GLD": 0.20, "USO": 0.45, "FXE": 0.15, "FXY": 0.15,
              "FXA": 0.15}
    res = m2_targets(m2_signals(adj, date, 0.04, M2_CFG), nav, stress, M2_CFG)
    t = res["targets"]
    assert set(t) == set(M2_LEGS)
    assert all(v >= 0.0 for v in t.values())
    assert t["IEF"] == 0.0 and t["FXE"] == 0.0
    assert max(t.values()) <= 0.25 * nav + 1e-6
    assert sum(t.values()) <= 0.60 * nav + 1e-6
    assert t["SPY"] * 0.30 + t["QQQ"] * 0.35 <= 0.03 * nav + 1e-6


def test_m2_orders_band_exits_and_order_cap():
    current = {"SPY": 20_000.0, "QQQ": 10_000.0, "GLD": 5_000.0, "USO": 200.0, "FXA": 0.0, "IEF": 8_000.0}
    targets = {"SPY": 21_000.0, "QQQ": 4_000.0, "GLD": 9_000.0, "USO": 0.0, "FXA": 5_000.0, "IEF": 0.0}
    res = m2_orders(current, targets, M2_CFG)
    assert res["orders"] == [
        {"ticker": "IEF", "side": "sell", "dollars": 8_000.0, "close_all": True},
        {"ticker": "QQQ", "side": "sell", "dollars": 6_000.0, "close_all": False},
        {"ticker": "FXA", "side": "buy", "dollars": 5_000.0, "close_all": False},
    ]
    assert res["deferred"] == [
        {"ticker": "GLD", "side": "buy", "dollars": 4_000.0, "close_all": False},
        {"ticker": "USO", "side": "sell", "dollars": 200.0, "close_all": True},
    ]
    assert res["skipped_band"] == [
        {"ticker": "SPY", "target": 21_000.0, "current": 20_000.0, "diff": 1_000.0, "band": 5_250.0}]


def test_m2_orders_exit_to_zero_ignores_band():
    res = m2_orders({"USO": 120.0}, {"USO": 0.0}, M2_CFG)
    assert res["orders"] == [{"ticker": "USO", "side": "sell", "dollars": 120.0, "close_all": True}]


def test_m2_orders_band_edges():
    assert m2_orders({}, {"FXA": 299.99}, M2_CFG)["orders"] == []                       # new leg below $300
    assert m2_orders({}, {"FXA": 300.0}, M2_CFG)["orders"][0]["dollars"] == 300.0
    small = m2_orders({"GLD": 10_000.0}, {"GLD": 12_499.0}, M2_CFG)                   # 2,499 < 25% of 12,499
    assert small["orders"] == [] and small["skipped_band"][0]["ticker"] == "GLD"
    big = m2_orders({"GLD": 10_000.0}, {"GLD": 14_000.0}, M2_CFG)                     # 4,000 >= 3,500
    assert big["orders"] == [{"ticker": "GLD", "side": "buy", "dollars": 4_000.0, "close_all": False}]
    assert m2_orders({"GLD": 0.0}, {"GLD": 0.0}, M2_CFG) == {"orders": [], "deferred": [], "skipped_band": []}


def test_m2_orders_sells_first_even_when_smaller():
    res = m2_orders({"GLD": 10_000.0}, {"GLD": 6_000.0, "FXA": 9_000.0}, M2_CFG)
    assert [(o["ticker"], o["side"]) for o in res["orders"]] == [("GLD", "sell"), ("FXA", "buy")]


def test_m2_orders_leave_positions_without_target_alone():
    assert m2_orders({"GLD": 5_000.0}, {}, M2_CFG) == {"orders": [], "deferred": [], "skipped_band": []}


# ------------------------------------------------------------------------------------------- M3
def btc_series(start: str = "2026-05-04", end: str = "2026-09-28", values=None) -> pd.Series:
    idx = pd.date_range(start, end, freq="D")
    v = np.linspace(50_000, 90_000, len(idx)) if values is None else np.asarray(values, dtype=float)
    return pd.Series(v, index=idx)


def sundays(s: pd.Series, last: str, n: int) -> pd.Series:
    x = s[(s.index.weekday == 6) & (s.index <= pd.Timestamp(last))]
    return x.iloc[-n:]


def test_last_sunday_before():
    assert last_sunday_before(pd.Timestamp("2026-09-28")) == pd.Timestamp("2026-09-27")   # Monday
    assert last_sunday_before(pd.Timestamp("2026-09-27")) == pd.Timestamp("2026-09-20")   # Sunday
    assert last_sunday_before(pd.Timestamp("2026-10-03")) == pd.Timestamp("2026-09-27")   # Saturday


def test_m3_monday_run_uses_the_week_that_just_ended():
    btc = btc_series()                                          # includes Monday 28 Sep (in progress)
    res = btc_weekly_switch(btc, "2026-09-28", weeks=10)
    assert res["week_end"] == "2026-09-27" and res["complete"] is True
    assert res["weekly_close"] == pytest.approx(btc[pd.Timestamp("2026-09-27")])
    assert res["sma"] == pytest.approx(sundays(btc, "2026-09-27", 10).mean())
    assert res["on"] is True


def test_m3_sunday_run_cannot_use_the_current_week():
    btc = btc_series(end="2026-09-27")                          # the Sunday candle is still forming
    res = btc_weekly_switch(btc, "2026-09-27")
    assert res["week_end"] == "2026-09-20" and res["complete"] is True
    assert res["weekly_close"] == pytest.approx(btc[pd.Timestamp("2026-09-20")])


def test_m3_missing_sunday_candle_is_incomplete():
    btc = btc_series().drop(pd.Timestamp("2026-09-27"))
    res = btc_weekly_switch(btc, "2026-09-28")
    assert res["week_end"] == "2026-09-20" and res["complete"] is False
    assert res["weekly_close"] == pytest.approx(btc[pd.Timestamp("2026-09-20")])


def test_m3_mid_week_run_still_complete():
    res = btc_weekly_switch(btc_series(end="2026-09-30"), "2026-09-30")
    assert res["week_end"] == "2026-09-27" and res["complete"] is True


def test_m3_interior_week_uses_last_available_close():
    btc = btc_series().drop(pd.Timestamp("2026-09-13"))        # an older Sunday is missing
    res = btc_weekly_switch(btc, "2026-09-28")
    closes = sundays(btc_series(), "2026-09-27", 10).copy()
    closes[pd.Timestamp("2026-09-13")] = btc[pd.Timestamp("2026-09-12")]   # Saturday stands in
    assert res["complete"] is True and res["sma"] == pytest.approx(closes.mean())


def test_m3_off_after_a_sharp_drop_and_ignores_later_data():
    values = np.linspace(50_000, 90_000, len(pd.date_range("2026-05-04", "2026-09-28")))
    values[-8:] = 60_000.0                                      # the last week collapses below the average
    btc = btc_series(values=values)
    res = btc_weekly_switch(btc, "2026-09-28")
    assert res["on"] is False and res["weekly_close"] == 60_000.0 and res["weekly_close"] < res["sma"]
    later = pd.concat([btc, pd.Series(150_000.0, index=pd.date_range("2026-09-29", "2026-10-20"))])
    assert btc_weekly_switch(later, "2026-09-28") == res


def test_m3_falling_series_is_off():
    res = btc_weekly_switch(btc_series(values=np.linspace(90_000, 50_000, 148)), "2026-09-28")
    assert res["on"] is False and res["complete"] is True


def test_m3_insufficient_weeks_and_no_data():
    short = btc_weekly_switch(btc_series(start="2026-08-24"), "2026-09-28")   # 5 complete weeks
    assert short["sma"] is None and short["on"] is False and short["week_end"] == "2026-09-27"
    empty = btc_weekly_switch(pd.Series(dtype=float), "2026-09-28")
    assert empty == {"on": False, "week_end": None, "weekly_close": None, "sma": None, "complete": False}


# ------------------------------------------------------------------------------ real constitution
def test_modules_run_on_the_real_constitution():
    cfg = load_config()
    spy = dip_frame()
    d = day(spy, -1)
    assert m1_entry_check(spy, vix_on(d, 25.0), d, cfg.module("M1"))["signal"] is True
    assert st1b_entry_check(spy, vix_on(d, 15.0), d, cfg.module("M1"))["signal"] is True
    spx = crash_frame()
    assert w10_signal(spx, day(spx, -1), cfg.module("W10"))["signal"] is True      # v3.3: W10 is a module
    adj = {t: log_path(UP, 300) for t in cfg.module("M2")["legs"]}
    date = adj["SPY"].index[-1].strftime("%Y-%m-%d")
    tg = m2_targets(m2_signals(adj, date, 0.04, cfg.module("M2")), 100_000, {"SPY": 0.3, "QQQ": 0.3}, cfg.module("M2"))
    assert len(m2_orders({}, tg["targets"], cfg.module("M2"))["orders"]) == cfg.module("M2")["max_orders_per_email"]
    assert btc_weekly_switch(btc_series(), "2026-09-28", cfg.module("M3")["weeks"])["on"] is True


# ------------------------------------------------------------------------------ W10 (design v3.3)
def w10_cfg() -> dict:
    return load_config().module("W10")


def spx_path(shock_day: int, shock: float = -0.031, n: int = 260, early_shock: int | None = None) -> pd.DataFrame:
    idx = pd.bdate_range("2025-01-02", periods=n)
    closes = 5_000.0 * np.exp(np.linspace(0.0, 0.15, n))              # a smooth uptrend
    rets = np.diff(closes) / closes[:-1]
    if early_shock is not None:
        rets[early_shock - 1] = -0.035
    rets[shock_day - 1] = shock
    closes = np.concatenate([[closes[0]], closes[0] * np.cumprod(1 + rets)])
    return pd.DataFrame({"close": closes}, index=idx)


def test_w10_signal_fires_on_a_first_uptrend_shock():
    spx = spx_path(250)
    d = spx.index[250].strftime("%Y-%m-%d")
    res = w10_signal(spx, d, w10_cfg())
    assert res["signal"] is True and res["ret"] == pytest.approx(-0.031) and res["prior_shock"] is None


def test_w10_signal_needs_an_unrounded_3pct_drop():
    spx = spx_path(250, shock=-0.02997)                                 # 5 Aug 2024 was -2.997%: no signal
    d = spx.index[250].strftime("%Y-%m-%d")
    assert w10_signal(spx, d, w10_cfg())["signal"] is False


def test_w10_signal_is_declustered_and_needs_the_uptrend():
    spx = spx_path(250, early_shock=240)                                 # another -3% day 10 sessions earlier
    d = spx.index[250].strftime("%Y-%m-%d")
    res = w10_signal(spx, d, w10_cfg())
    assert res["signal"] is False and res["prior_shock"] == spx.index[240].strftime("%Y-%m-%d")
    down = spx_path(250)
    down["close"] = down["close"].iloc[::-1].to_numpy()                 # a downtrend: prior close below its SMA
    assert w10_signal(down, d, w10_cfg())["signal"] is False


def test_w10_second_source_can_veto_the_signal():
    spx = spx_path(250, shock=-0.0301)
    d = spx.index[250].strftime("%Y-%m-%d")
    prev = float(spx["close"].iloc[249])
    assert w10_signal(spx, d, w10_cfg())["signal"] is True
    assert w10_signal(spx, d, w10_cfg(), close_override=prev * 0.9705)["signal"] is False   # -2.95% elsewhere


def test_w10_exit_is_calendar_exact():
    assert w10_exit_date("2025-10-08", 90) == "2026-01-06"
    assert w10_exit_date("2026-09-30", 90) == "2026-12-29"
    assert w10_exit_date("2026-04-06", 90) == "2026-07-02"                # 5 Jul is a Sunday; 3 Jul a holiday
    trade = {"fill_date": "2025-10-08"}
    assert w10_exit_check("2026-01-02", trade, w10_cfg())["exit"] is False   # next session 5 Jan
    last_eve = w10_exit_check("2026-01-05", trade, w10_cfg())
    assert last_eve["exit"] is True and last_eve["exit_date"] == "2026-01-06" and last_eve["days_held"] == 89
    assert w10_exit_check("2026-01-09", trade, w10_cfg())["exit"] is True    # missed: sell at the next open


def test_w10_kill_switch_is_a_damage_limit():
    cfg = w10_cfg()
    assert w10_kill_check([{"return": 0.05, "pnl": 300}], 100_000, cfg) is None
    assert "lost" in w10_kill_check([{"return": -0.16, "pnl": -960}], 100_000, cfg)
    many = [{"return": -0.10, "pnl": -600}] * 3
    assert "cumulative" in w10_kill_check(many, 100_000, cfg)
