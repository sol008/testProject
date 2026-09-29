"""The growth book (design v4, Appendix A.4 groups 1, 2, 3, 5, 7, 8 and the first Sunday of §11): offline, synthetic."""
from __future__ import annotations

import copy
import dataclasses
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from traderec import growth, pipeline
from traderec.broker import PaperBroker
from traderec.config import load_config
from traderec.data.providers import FakeProvider, iso_date
from traderec.growth import governor
from traderec.growth import orders as orders_mod
from traderec.ledger import Ledger
from traderec.market_calendar import is_trading_day
from traderec.modules.g1_lev_trend import below_sma_today, g1_signal, last_session_before, leg_check, sma_snapshot
from traderec.modules.g2_btc_switch import g2_signal, realized_vol, two_source_check, vol_cut
from traderec.types import OrderIntent

HIST_START, END = "2025-06-02", "2026-11-06"
LAUNCH = "2026-09-27"                         # design v4 §11: the first Sunday
SIG = {"sma_days": 200, "band": 0.02}
GOV = {"governor": {"full_until": 0.15, "floor": 0.25, "floor_at": 0.35, "min_step": 0.10},
       "hard_stop": {"at": 0.40}, "drawdown_limit": 0.40}


# ------------------------------------------------------------------------------------------- helpers
def trading_days(start: str = HIST_START, end: str = END) -> pd.DatetimeIndex:
    return pd.DatetimeIndex([d for d in pd.date_range(start, end, freq="B") if is_trading_day(d)])


def frame(close: pd.Series) -> pd.DataFrame:
    open_ = close.shift(1).fillna(close.iloc[0])
    return pd.DataFrame({"open": open_, "high": np.maximum(open_, close), "low": np.minimum(open_, close),
                         "close": close, "adj_close": close, "volume": 1e6})


def path(index: pd.DatetimeIndex, points: list[tuple[str, float]]) -> pd.Series:
    """Closes on `index`: linear between the dated points, flat before the first and after the last."""
    ts = pd.DatetimeIndex([pd.Timestamp(d) for d, _ in points])
    vals = np.asarray([v for _, v in points], dtype=float)
    x = np.interp(index.view("int64"), ts.view("int64"), vals)
    return pd.Series(x, index=index)


def levered(index: pd.Series, mult: float = 2.0, start: float = 100.0) -> pd.Series:
    r = index.pct_change().fillna(0.0)
    return start * (1.0 + mult * r).cumprod()


def cfg_for(*, taxable: bool = True, limited_margin: bool = True, enabled: bool = True, rule_e: bool = True):
    """The real config with every v3.3 module and shadow book off, so the book is alone in the paper IRA.

    `rule_e=False` keeps the mid-week exit out of a test that pins the Sunday job alone (tests/test_growth_email.py
    covers Rule E)."""
    real = load_config()
    const = copy.deepcopy(real.constitution)
    acct = copy.deepcopy(real.account)
    for m in ("M1", "M2", "M3", "M4", "W8", "W9", "W10"):
        const["modules"][m]["enabled"] = False
    for book in const["shadow"].values():
        if isinstance(book, dict):
            book["enabled"] = False
    const["options"]["enabled"] = False
    const["growth"]["enabled"] = enabled
    const["growth"]["rule_e"]["enabled"] = rule_e
    acct["accounts"]["ira"]["limited_margin"] = limited_margin
    acct["accounts"]["taxable"]["enabled"] = taxable
    acct["github_issues"] = False
    return dataclasses.replace(real, constitution=const, account=acct)


class GrowthProvider(FakeProvider):
    """FakeProvider whose second source echoes every close (index tickers included), with optional disagreement."""

    def __init__(self, bars, btc, vix, disagree=None) -> None:
        super().__init__(bars=bars, vix=vix, btc=btc, tbill_rate=0.04)
        self.disagree = dict(disagree or {})          # (ticker, date) -> factor on the second source's close

    def second_source_close(self, ticker: str, date: str) -> dict | None:
        day = iso_date(date)
        f = self._bars.get(ticker)
        if f is None:
            return None
        closes = f["close"][f.index == pd.Timestamp(day)].dropna()
        if closes.empty:
            return None
        return {"close": float(closes.iloc[-1]) * self.disagree.get((ticker, day), 1.0), "source": "nasdaq"}


def market(index: pd.Series, btc: pd.Series) -> dict:
    days = index.index
    ibit = (btc / 1000.0).reindex(days).ffill()
    bars = {"^GSPC": frame(index), "^NDX": frame(index * 3.0), "SPY": frame(index / 10.0), "QQQ": frame(index / 15.0),
            "SSO": frame(levered(index)), "QLD": frame(levered(index * 3.0)), "IBIT": frame(ibit),
            "SGOV": frame(pd.Series(100.0, index=days)), "^VIX": frame(pd.Series(15.0, index=days)),
            "BTC-USD": frame(btc)}
    return {"bars": bars, "btc": btc, "vix": pd.Series(15.0, index=days)}


def btc_on() -> pd.Series:
    """40k for a long time, 90k from 13 Sep 2026: above its 10-week and 200-day averages at the 27 Sep close."""
    days = pd.date_range("2025-06-01", END, freq="D")
    return path(days, [("2025-06-01", 40_000.0), ("2026-09-12", 40_000.0), ("2026-09-13", 90_000.0), (END, 90_000.0)])


def ramp_index() -> pd.Series:
    """The S&P 500 of §11: a ramp to 7,743 on 25 Sep 2026, well above its 200-day average, flat afterwards."""
    return path(trading_days(), [(HIST_START, 6_500.0), ("2026-09-25", 7_743.0), (END, 7_743.0)])


class Recorder:
    def __init__(self) -> None:
        self.sent: list = []
        self.pings: list[str] = []

    def services(self) -> pipeline.Services:
        def send(email, *, dry_run, outbox):
            self.sent.append(email)
            return {"sent": not dry_run, "reason": "dry run" if dry_run else None}
        return pipeline.Services(send=send, create_issue=lambda *a, **k: None, healthcheck=self.pings.append,
                                 fetch_comments=lambda url: [])


def state_of(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def records(state_dir: Path, kind: str | None = None) -> list[dict]:
    recs = [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]
    return [r for r in recs if kind is None or r["record_type"] == kind]


def sunday_then_monday(cfg, provider, state_dir, sunday: str, rec: Recorder) -> dict:
    """The Sunday growth run, then Monday's daily run (which fills its orders at the open). Returns the facts."""
    res = pipeline.run_weekly(cfg, provider, state_dir, date=sunday, services=rec.services())
    assert res.status == "ok", res.summary()
    facts = state_of(state_dir)["growth"]["last_facts"]
    monday = (pd.Timestamp(sunday) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    day = pipeline.run_daily(cfg, provider, state_dir, date=monday, services=rec.services())
    assert day.status == "ok", day.summary()
    return facts


# ==================================================================================== 1. signals: G1
def flat_then_weeks(levels: list[float], base: float = 100.0) -> tuple[pd.Series, list[str]]:
    """200+ flat sessions at `base`, then one week per level (Monday to Friday at that level). Returns the closes and
    the Sundays that end each level's week."""
    days = trading_days("2025-01-02", "2026-12-31")
    first_monday = pd.Timestamp("2026-01-05")
    close = pd.Series(base, index=days)
    sundays = []
    for k, level in enumerate(levels):
        monday = first_monday + pd.Timedelta(weeks=k)
        close.loc[(close.index >= monday) & (close.index < monday + pd.Timedelta(days=5))] = level
        sundays.append((monday + pd.Timedelta(days=6)).strftime("%Y-%m-%d"))
    return close.loc[: pd.Timestamp(sundays[-1])], sundays


def test_g1_sma_is_the_200_day_average_including_friday():
    close = ramp_index()
    snap = sma_snapshot(frame(close), LAUNCH, 200)
    assert snap["date"] == "2026-09-25" and snap["close"] == pytest.approx(7_743.0)
    assert snap["sma"] == pytest.approx(float(close.loc[:"2026-09-25"].iloc[-200:].mean()))
    res = g1_signal(frame(close), LAUNCH, None, SIG)
    assert res["signal"] and res["in"] is True and res["changed"] and res["action"] == "enter"
    assert res["pct_vs_sma"] > 0.05


def test_g1_band_never_switches_at_1_9_pct_and_switches_once_per_crossing_at_2_1_pct():
    close, sundays = flat_then_weeks([101.9, 98.1, 101.9, 98.1, 101.9, 98.1])
    state = None
    for s in sundays:
        res = g1_signal(close, s, state, SIG)
        assert res["signal"] and res["in"] is True and abs(res["pct_vs_sma"]) < 0.02
        state = res["in"]
    close, sundays = flat_then_weeks([102.1, 97.9, 102.1, 97.9, 102.1])
    state, actions = None, []
    for s in sundays:
        res = g1_signal(close, s, state, SIG)
        assert res["signal"]
        actions.append(res["action"])
        state = res["in"]
    assert actions == ["enter", "exit", "enter", "exit", "enter"]


def test_g1_decides_on_friday_only_a_wednesday_crossing_waits():
    close, sundays = flat_then_weeks([103.0, 103.0])
    wednesday = pd.Timestamp("2026-01-14")
    close.loc[wednesday] = 96.0                                   # a mid-week close 4% below the average
    res = g1_signal(close, sundays[1], True, SIG)
    assert res["signal"] and res["in"] is True and res["action"] is None and res["date"] == "2026-01-16"
    rule_e = below_sma_today(close, "2026-01-14", SIG)            # Rule E's daily check sees it, band-free
    assert rule_e["below"] is True and rule_e["close"] == 96.0
    assert below_sma_today(close, "2026-01-15", SIG)["below"] is False


def test_g1_holiday_shortened_week_uses_thursday():
    assert last_session_before("2026-04-05") == "2026-04-02"      # Good Friday 3 Apr 2026
    assert last_session_before(LAUNCH) == "2026-09-25"
    days = trading_days("2025-01-02", "2026-04-05")
    close = pd.Series(100.0, index=days)
    close.loc[days >= pd.Timestamp("2026-03-30")] = 103.0
    res = g1_signal(close, "2026-04-05", False, SIG)
    assert res["signal"] and res["date"] == "2026-04-02" and res["action"] == "enter"
    stale = g1_signal(close.loc[:"2026-04-01"], "2026-04-05", False, SIG)   # Thursday's close missing: no signal
    assert stale["signal"] is False and stale["in"] is False and "state kept" in stale["reason"]


def test_g1_two_source_disagreement_gives_no_signal():
    mk = market(ramp_index(), btc_on())
    ok = leg_check(GrowthProvider(**mk), mk["bars"]["^GSPC"], "^GSPC", LAUNCH, None, SIG, 0.001)
    assert ok["signal"] and ok["agree"] and ok["in"] is True and ok["check"]["ok"]
    bad = GrowthProvider(**mk, disagree={("^GSPC", "2026-09-25"): 0.99})
    res = leg_check(bad, mk["bars"]["^GSPC"], "^GSPC", LAUNCH, False, SIG, 0.001)
    assert res["signal"] is False and res["in"] is False and res["agree"] is False and "two-source" in res["reason"]
    none = GrowthProvider(**mk, disagree={("^GSPC", "2026-09-25"): 0.0})   # a second source with no close
    assert leg_check(none, mk["bars"]["^GSPC"], "^GSPC", LAUNCH, None, SIG, 0.001)["signal"] is False


# ==================================================================================== 1. signals: G2
def btc_path(points) -> pd.Series:
    return path(pd.date_range("2025-06-01", END, freq="D"), points)


def test_g2_on_needs_both_the_10_week_and_the_200_day_condition():
    cfg = {"weekly_ma_weeks": 10, "sma_days": 200}
    res = g2_signal(btc_on(), "2026-09-28", cfg)
    assert res["complete"] and res["on"] and res["week_end"] == "2026-09-27" and res["weekly_close"] == 90_000.0
    assert res["above_ma10w"] and res["above_sma200"] and res["ma10w"] < 90_000.0 < 200_000.0
    sundays = pd.date_range("2026-07-26", "2026-09-27", freq="7D")
    assert res["ma10w"] == pytest.approx(float(btc_on().loc[sundays].mean()))
    # above the 10-week average but below the 200-day one: off
    high_then_low = btc_path([("2025-06-01", 100_000.0), ("2026-06-01", 100_000.0), ("2026-06-02", 60_000.0),
                              ("2026-07-19", 60_000.0), ("2026-09-27", 70_000.0), (END, 70_000.0)])
    res = g2_signal(high_then_low, "2026-09-28", cfg)
    assert res["complete"] and res["above_ma10w"] and not res["above_sma200"] and res["on"] is False
    # above the 200-day average but below the 10-week one: off
    spike_then_dip = btc_path([("2025-06-01", 50_000.0), ("2026-07-25", 50_000.0), ("2026-07-26", 90_000.0),
                               ("2026-09-13", 90_000.0), ("2026-09-14", 70_000.0), (END, 70_000.0)])
    res = g2_signal(spike_then_dip, "2026-09-28", cfg)
    assert res["complete"] and res["above_sma200"] and not res["above_ma10w"] and res["on"] is False
    # the Sunday run itself cannot use the week in progress (M3's convention), and short data is incomplete
    assert g2_signal(btc_on(), "2026-09-27", cfg)["week_end"] == "2026-09-20"
    assert g2_signal(btc_on().loc["2026-08-01":], "2026-09-28", cfg)["complete"] is False


def test_g2_two_source_check_and_tolerance():
    assert two_source_check(90_000.0, 90_300.0, 0.005, "yahoo")["ok"]
    assert two_source_check(90_000.0, 90_500.0, 0.005, "yahoo")["ok"] is False
    assert two_source_check(90_000.0, None, 0.005)["reason"].startswith("no_second_source")


def test_g2_vol_cut_after_a_quarter_and_restore_below_60():
    cfg = {"realized_60d_vol_gt": 0.70, "quarters": 1, "factor": 0.667, "restore_below": 0.60}
    st = {"vol_cut_factor": 1.0, "vol_high_since": None}
    assert vol_cut(0.80, st, "2026-01-04", cfg)["factor"] == 1.0 and st["vol_high_since"] == "2026-01-04"
    assert vol_cut(0.75, st, "2026-03-29", cfg)["factor"] == 1.0            # 84 days: not a quarter yet
    assert vol_cut(0.75, st, "2026-04-05", cfg)["factor"] == 0.667          # 91 days above 70%: cut by a third
    assert vol_cut(0.65, st, "2026-04-12", cfg)["factor"] == 0.667          # below 70% but not below 60%: kept
    assert st["vol_high_since"] is None
    assert vol_cut(0.55, st, "2026-04-19", cfg)["factor"] == 1.0            # restored below 60%
    assert vol_cut(None, st, "2026-04-26", cfg)["factor"] == 1.0            # no reading: nothing changes
    steady = btc_path([("2025-06-01", 50_000.0), (END, 50_000.0)])
    assert realized_vol(steady, "2026-09-27") == pytest.approx(0.0)


# ==================================================================================== 2. the governor
def test_governor_values():
    assert governor.G(0.0, GOV) == 1.0 and governor.G(0.15, GOV) == 1.0 and governor.G(0.10, GOV) == 1.0
    assert governor.G(0.25, GOV) == pytest.approx(0.625)
    assert governor.G(0.35, GOV) == 0.25 and governor.G(0.50, GOV) == 0.25
    assert governor.G(float("nan"), GOV) == 0.25 and governor.G(None, GOV) == 0.25
    assert governor.G(0.30, GOV) == pytest.approx(0.4375)
    assert governor.hard_stop(0.40, GOV) and governor.hard_stop(0.45, GOV) and not governor.hard_stop(0.399, GOV)
    assert governor.drawdown(80.0, 100.0) == pytest.approx(0.2) and governor.drawdown(110.0, 100.0) == 0.0
    assert governor.peak_nav(None, 100.0) == 100.0 and governor.peak_nav(100.0, 90.0) == 100.0


def test_peak_starts_at_the_first_sunday_never_falls_and_g_moves_weekly_only():
    st = growth.new_growth_state()
    rec = governor.update(st, 100_000.0, "2026-09-27", GOV)
    assert st["peak_nav"] == 100_000.0 and st["G"] == 1.0 and rec["step"] is None and st["first_run"] == "2026-09-27"
    governor.update(st, 80_000.0, "2026-10-04", GOV)
    assert st["peak_nav"] == 100_000.0 and st["drawdown"] == pytest.approx(0.2) and st["G"] == pytest.approx(0.8125)
    rec = governor.update(st, 70_000.0, "2026-10-11", GOV)
    assert st["G"] == pytest.approx(0.4375) and rec["step"] == pytest.approx(0.4375 - 0.8125)
    governor.update(st, 90_000.0, "2026-10-18", GOV)             # the NAV recovers: G rises, the peak stays
    assert st["peak_nav"] == 100_000.0 and st["G"] == 1.0 and not st["paused"]
    governor.update(st, 105_000.0, "2026-10-25", GOV)
    assert st["peak_nav"] == 105_000.0


def test_hard_stop_sends_everything_to_sgov_and_pauses_buys_but_not_sells():
    st = growth.new_growth_state()
    governor.update(st, 100_000.0, "2026-09-27", GOV)
    rec = governor.update(st, 60_000.0, "2026-10-04", GOV)
    assert rec["hard_stop"] and st["paused"] and st["hard_stop_hit_on"] == "2026-10-04" and st["G"] == 0.25
    assert governor.paused_blocks(st, "buy") and not governor.paused_blocks(st, "sell")
    cfg = load_config().constitution["growth"]
    targets = orders_mod.sleeve_targets({"SSO": False, "QLD": False}, False, 60_000.0, st["G"], cfg)
    held = {"SSO": 12_000.0, "QLD": 12_000.0, "IBIT": 14_000.0, "SGOV": 16_000.0}
    os = orders_mod.build_order_set(targets, held, 0.0, G=0.25, G_last_order=1.0, cfg_growth=cfg, paused=True)
    assert [(o["action"], o["ticker"]) for o in os["orders"]] == [("sell_all", "IBIT"), ("sell_all", "SSO"), ("sell_all", "QLD")]
    assert all(o["reason"] == "hard_stop" for o in os["orders"])
    assert [o["ticker"] for o in os["deferred"]] == ["SGOV"]            # the proceeds go to SGOV a week later
    # paused: an entry target is skipped, a sell is not
    targets = orders_mod.sleeve_targets({"SSO": True, "QLD": False}, False, 60_000.0, 0.25, cfg)
    os = orders_mod.build_order_set(targets, {"SSO": 0.0, "QLD": 5_000.0}, 20_000.0, G=0.25, G_last_order=None,
                                    cfg_growth=cfg, paused=True)
    assert [o["ticker"] for o in os["orders"] if o["action"] == "buy" and o["ticker"] != "SGOV"] == []
    assert any(s["ticker"] == "SSO" and "paused" in s["reason"] for s in os["skipped"])
    assert [(o["action"], o["ticker"]) for o in os["orders"]][0] == ("sell_all", "QLD")
    governor.restart(st, 60_000.0, "2026-10-11")
    assert not st["paused"] and st["peak_nav"] == 60_000.0 and st["G"] == 1.0


# ==================================================================================== 3. the order set
@pytest.fixture(scope="module")
def gcfg() -> dict:
    return load_config().constitution["growth"]


def test_sleeve_targets_are_pct_of_the_ira_times_g(gcfg):
    t = orders_mod.sleeve_targets({"SSO": True, "QLD": True}, True, 80_000.0, 1.0, gcfg)
    assert {k: v["target_usd"] for k, v in t.items()} == {"SSO": 20_000.0, "QLD": 20_000.0, "IBIT": 24_000.0, "SGOV": 16_000.0}
    assert t["SGOV"]["g3_reserve_usd"] == 12_000.0 and t["SGOV"]["cash_sleeve_usd"] == 4_000.0
    assert t["SSO"]["target_pct"] == 25.0 and t["SGOV"]["state"] == "reserve"
    t = orders_mod.sleeve_targets({"SSO": True, "QLD": False}, True, 80_000.0, 0.5, gcfg, vol_factor=0.667)
    assert t["SSO"]["target_usd"] == 10_000.0 and t["QLD"]["target_usd"] == 0.0 and t["QLD"]["state"] == "out"
    assert t["IBIT"]["target_usd"] == pytest.approx(0.30 * 0.667 * 0.5 * 80_000.0, abs=0.01)
    assert t["SGOV"]["target_usd"] == pytest.approx(80_000.0 - 10_000.0 - t["IBIT"]["target_usd"], abs=0.01)
    capped = orders_mod.sleeve_targets({}, True, 80_000.0, 1.0, {**gcfg, "sleeves": {**gcfg["sleeves"], "G2": {
        **gcfg["sleeves"]["G2"], "weight": 0.60}}})
    assert capped["IBIT"]["target_usd"] == 40_000.0                    # the 50% ceiling


def test_netting_two_sgov_sells_become_one_order(gcfg):
    targets = orders_mod.sleeve_targets({"SSO": True, "QLD": True}, False, 80_000.0, 1.0, gcfg)
    os = orders_mod.build_order_set(targets, {"SGOV": 80_000.0}, 0.0, G=1.0, G_last_order=None, cfg_growth=gcfg)
    assert [(o["action"], o["ticker"], o["usd"]) for o in os["orders"]] == [
        ("sell", "SGOV", pytest.approx(40_000.0 / 0.9, abs=0.01)), ("buy", "SSO", 20_000.0), ("buy", "QLD", 20_000.0)]
    assert sum(1 for o in os["orders"] if o["ticker"] == "SGOV") == 1 and os["orders"][0]["step"] == 1
    assert os["orders"][1]["cash_cap_usd"] == pytest.approx(20_000.0, abs=0.01)   # 90% of the cash it will see
    assert os["deferred"] == [] and os["sgov_sell_usd"] == pytest.approx(44_444.45, abs=0.01)


def test_bands_300_dollars_25_pct_and_the_g_step(gcfg):
    def one(held: float, target: float, G: float = 1.0, G_last=None):
        targets = {"SSO": {"sleeve": "G1", "state": "in", "target_usd": target, "target_pct": 25.0},
                   "SGOV": {"sleeve": "SGOV", "state": "reserve", "target_usd": 50_000.0}}
        os = orders_mod.build_order_set(targets, {"SSO": held, "SGOV": 50_000.0}, 50_000.0, G=G, G_last_order=G_last,
                                        cfg_growth=gcfg)
        return {**os, "orders": [o for o in os["orders"] if o["ticker"] == "SSO"]}   # the SGOV sweep aside
    assert one(20_000.0, 20_250.0)["orders"] == [] and "minimum" in one(20_000.0, 20_250.0)["skipped"][0]["reason"]
    assert one(20_000.0, 24_000.0)["orders"] == []                     # 16.7% < 25%
    assert one(20_000.0, 26_000.0)["orders"] == []                     # 23% < 25%
    big = one(20_000.0, 27_000.0)["orders"]                            # 25.9% >= 25%
    assert [(o["action"], o["usd"], o["reason"]) for o in big] == [("buy", 7_000.0, "rebalance")]
    cut = one(20_000.0, 17_000.0, G=0.85, G_last=1.0)["orders"]        # 17.6% < 25% but G moved 0.15 >= 0.10
    assert [(o["action"], o["usd"], o["reason"]) for o in cut] == [("sell", 3_000.0, "governor_cut")]
    assert one(20_000.0, 17_000.0, G=0.95, G_last=1.0)["orders"] == []  # G moved 0.05 < 0.10: inside the band
    assert one(0.0, 299.0)["orders"] == [] and one(0.0, 300.0)["orders"][0]["reason"] == "switch_on"
    exit_ = one(250.0, 0.0)["orders"]                                   # an exit ignores the band: sell all
    assert exit_[0]["action"] == "sell_all" and exit_[0]["reason"] == "switch_off" and exit_[0]["held_usd"] == 250.0


def test_ranking_the_three_order_cut_the_deferred_list_and_w10_dropped(gcfg):
    targets = orders_mod.sleeve_targets({"SSO": False, "QLD": True}, True, 80_000.0, 0.75, gcfg, w10_buy_usd=3_600.0)
    targets["IBIT"]["target_usd"] = 12_000.0                           # a cut from 24k (G 1 -> 0.75 and a drift)
    held = {"SSO": 20_000.0, "QLD": 0.0, "IBIT": 24_000.0, "SGOV": 0.0}
    w10 = {"buy_usd": 3_600.0, "ticker": "SPY", "module": "W10", "trade_id": "T-2026-09-29-W10"}
    os = orders_mod.build_order_set(targets, held, 16_000.0, G=0.75, G_last_order=1.0, cfg_growth=gcfg, w10=w10)
    assert [(o["rank"], o["action"], o["ticker"]) for o in os["orders"]] == [
        (1, "sell_all", "SSO"), (2, "sell", "IBIT"), (3, "buy", "QLD")]
    assert os["orders"][1]["reason"] == "governor_cut" and os["orders"][1]["usd"] == 12_000.0
    assert os["orders"][2]["usd"] == 15_000.0 and os["orders"][2]["step"] == 2
    assert [o["ticker"] for o in os["deferred"]] == ["SGOV"] and "wait a week" in os["deferred"][0]["why"]
    assert [d["ticker"] for d in os["dropped"]] == ["SPY"] and "3 orders" in os["dropped"][0]["why"]
    # with room, W10 is funded from SGOV and ranked last
    targets = orders_mod.sleeve_targets({"SSO": True, "QLD": True}, True, 80_000.0, 1.0, gcfg, w10_buy_usd=4_800.0)
    held = {"SSO": 20_000.0, "QLD": 20_000.0, "IBIT": 24_000.0, "SGOV": 16_000.0}
    os = orders_mod.build_order_set(targets, held, 0.0, G=1.0, G_last_order=1.0, cfg_growth=gcfg, w10=w10 | {"buy_usd": 4_800.0})
    assert [(o["action"], o["ticker"]) for o in os["orders"]] == [("sell", "SGOV"), ("buy", "SPY")]
    assert os["orders"][0]["usd"] == pytest.approx(4_800.0 / 0.9, abs=0.01) and os["orders"][1]["sleeve"] == "W10"


def test_cash_rules_90_pct_queued_and_insufficient_cash_defers(gcfg):
    targets = orders_mod.sleeve_targets({"SSO": True, "QLD": False}, False, 80_000.0, 1.0, gcfg)
    os = orders_mod.build_order_set(targets, {"SSO": 0.0, "SGOV": 0.0}, 22_222.23, G=1.0, G_last_order=None, cfg_growth=gcfg)
    assert [(o["action"], o["ticker"]) for o in os["orders"]] == [("buy", "SSO"), ("buy", "SGOV")]   # then the sweep
    assert os["orders"][0]["cash_cap_usd"] == pytest.approx(20_000.0, abs=0.01)
    assert os["orders"][1]["usd"] == pytest.approx(2_222.22, abs=0.02) and "max_cash_frac" not in os["orders"][1]
    short = orders_mod.build_order_set(targets, {"SSO": 0.0, "SGOV": 0.0}, 21_000.0, G=1.0, G_last_order=None, cfg_growth=gcfg)
    assert [(o["action"], o["ticker"], o["usd"]) for o in short["orders"]] == [("buy", "SGOV", 21_000.0)]   # the sweep
    assert short["deferred"][0]["ticker"] == "SSO" and "insufficient cash" in short["deferred"][0]["why"]
    assert gcfg["rebalance"]["queued_cash_frac"] == 0.90 and gcfg["rebalance"]["market_hours_cash_frac"] == 0.95


def test_monday_holiday_shifts_the_fill_to_tuesday():
    assert orders_mod.holiday_shift("2026-09-06") == "2026-09-08"       # Labor Day
    assert orders_mod.holiday_shift(LAUNCH) is None
    assert orders_mod.holiday_shift("2027-01-17") == "2027-01-19"       # Martin Luther King Jr. Day


# ==================================================================================== 5. the paper broker
def growth_intent(n: int, ticker: str, side: str, dollars: float | None, *, created: str = "2026-09-27",
                  module: str = "G1", close_all: bool = False, cap: float | None = 0.90) -> OrderIntent:
    meta = {"max_cash_frac": cap} if (side == "buy" and cap is not None) else {}
    return OrderIntent(intent_id=f"O-{n}", trade_id=f"G-{created}-{ticker}", module=module, account="ira", ticker=ticker,
                       side=side, created_date=created, reason="test", dollars=dollars, close_all=close_all, meta=meta)


def seeded(cfg) -> PaperBroker:
    """An $80k IRA holding $50k of SGOV (bought at par on 21 Sep) and $30k of cash."""
    b = PaperBroker.new(cfg)
    b.queue(growth_intent(0, "SGOV", "buy", 50_000.0, created="2026-09-18", module="GROWTH", cap=None))
    (fill,) = b.fill_pending("2026-09-21", {})
    assert fill.price == 1.0 and fill.qty == 50_000.0 and fill.slippage_bps == 0.0
    return b


def test_limited_margin_lets_mondays_sells_fund_mondays_buys():
    b = seeded(cfg_for(limited_margin=True))
    b.queue(growth_intent(1, "SGOV", "sell", 20_000.0, module="GROWTH"))
    b.queue(growth_intent(2, "SSO", "buy", 45_000.0))                  # needs the SGOV proceeds
    fills = b.fill_pending("2026-09-28", {"SSO": 100.0})
    assert [(f.ticker, f.side) for f in fills] == [("SGOV", "sell"), ("SSO", "buy")]
    assert b.pending() == [] and b.cash("ira") == pytest.approx(5_000.0)
    assert b.position("ira", "SGOV", "GROWTH")["qty"] == pytest.approx(30_000.0)


def test_without_limited_margin_the_buy_waits_until_tuesday():
    b = seeded(cfg_for(limited_margin=False))
    b.queue(growth_intent(1, "SGOV", "sell", 20_000.0, module="GROWTH"))
    b.queue(growth_intent(2, "SSO", "buy", 45_000.0))
    monday = b.fill_pending("2026-09-28", {"SSO": 100.0})
    assert [(f.ticker, f.side) for f in monday] == [("SGOV", "sell")]
    assert [o.intent_id for o in b.pending()] == ["O-2"] and b.pending()[0].meta["waited_settlement"] == "2026-09-28"
    tuesday = b.fill_pending("2026-09-29", {"SSO": 101.0})
    assert [(f.ticker, f.fill_date) for f in tuesday] == [("SSO", "2026-09-29")]
    assert b.cash("ira") == pytest.approx(5_000.0)


def test_sgov_accrues_at_the_tbill_rate_and_is_valued_at_par():
    b = seeded(cfg_for())
    interest = b.accrue_interest("2026-09-21", "2026-10-21", 0.04)
    lot = b.position("ira", "SGOV", "GROWTH")
    assert lot["qty"] == pytest.approx(50_000.0 * (1 + 0.04 * 30 / 365))
    assert interest == pytest.approx((50_000.0 + 30_000.0 + 20_000.0) * 0.04 * 30 / 365)   # SGOV, IRA and taxable cash
    assert lot["dividends"] == pytest.approx(50_000.0 * 0.04 * 30 / 365) and lot["cost"] == 50_000.0
    assert b.apply_dividend("2026-10-01", "SGOV", 0.3) == 0.0            # no double counting with real SGOV bars
    v = b.valuation({"SGOV": 100.6})                                   # a bar close never prices the vehicle
    assert v["by_account"]["ira"]["positions_value"] == pytest.approx(lot["qty"])
    mark = b.mark("2026-10-21", {"SGOV": 100.6})
    assert mark["by_account"]["ira"]["positions_value"] == pytest.approx(lot["qty"])
    b.queue(growth_intent(3, "SGOV", "sell", None, created="2026-10-21", module="GROWTH", close_all=True))
    (fill,) = b.fill_pending("2026-10-22", {})
    assert fill.dollars == pytest.approx(lot["qty"]) and b.last_fill_meta["O-3"]["realized_pnl"] == pytest.approx(lot["dividends"])


def test_a_queued_buy_above_90_pct_of_cash_is_cancelled_and_alerted(tmp_path):
    b = seeded(cfg_for())
    b.queue(growth_intent(1, "SSO", "buy", 27_500.0))                  # 91.7% of the $30k cash
    assert b.fill_pending("2026-09-28", {"SSO": 100.0}) == [] and b.pending() == []
    assert "exceeds 90%" in b.cancelled[-1].meta["cancel_reason"]
    b.queue(growth_intent(2, "SSO", "buy", 27_000.0))                  # exactly 90%: fills in full
    (fill,) = b.fill_pending("2026-09-28", {"SSO": 100.0})
    assert fill.dollars == 27_000.0 and b.last_fill_meta["O-2"]["partial"] is False
    # Phase A/B orders carry no cap: a buy beyond the cash still part-fills as before
    b.queue(growth_intent(3, "SPY", "buy", 5_000.0, module="M1", cap=None))
    (fill,) = b.fill_pending("2026-09-29", {"SPY": 500.0})
    assert fill.dollars == pytest.approx(3_000.0) and b.last_fill_meta["O-3"]["partial"] is True
    # through the pipeline the cancellation raises a `fill` alert
    cfg = cfg_for()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    run = pipeline.Run(cfg, GrowthProvider(**market(ramp_index(), btc_on())), state_dir, "daily", "2026-09-28")
    try:
        run.broker.queue(growth_intent(9, "SSO", "buy", 75_000.0))       # 93.75% of the $80k
        pipeline._fill_pending(run, run.bars("SPY").index)
        assert run.broker.pending() == [] and any(a["kind"] == "fill" and "O-9" in a["message"] for a in run.state["alerts"])
    finally:
        run.close()


# ======================================================== the weekly run: the first Sunday (design §11)
def test_first_sunday_buys_sso_qld_ibit_and_defers_the_sgov_buy(tmp_path):
    cfg = cfg_for()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = GrowthProvider(**market(ramp_index(), btc_on()))
    rec = Recorder()
    before = (state_dir / "state.json").read_bytes(), (state_dir / "ledger.jsonl").read_bytes()
    dry = pipeline.run_weekly(cfg, provider, state_dir, date=LAUNCH, dry_run=True, services=rec.services())
    assert dry.status == "ok" and dry.dry_run
    assert ((state_dir / "state.json").read_bytes(), (state_dir / "ledger.jsonl").read_bytes()) == before
    res = pipeline.run_weekly(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    assert res.status == "ok" and rec.pings[-1] == "success", res.summary()
    st = state_of(state_dir)
    facts = st["growth"]["last_facts"]
    assert facts["kind"] == "GROWTH" and facts["label"] == "PAPER" and facts["date"] == LAUNCH and facts["week"] == 39
    assert facts["nav"] == {"ira": 80_000.0, "taxable": 20_000.0, "total": 100_000.0, "peak": 100_000.0, "drawdown": 0.0}
    assert facts["governor"]["G"] == 1.0 and facts["governor"]["hard_stop"] is False and facts["holiday"] is None
    assert facts["orders"]["step1"] == []
    assert [(o["ticker"], o["usd"]) for o in facts["orders"]["step2"]] == [("SSO", 20_000.0), ("QLD", 20_000.0), ("IBIT", 24_000.0)]
    assert [(o["action"], o["ticker"], o["usd"]) for o in facts["orders"]["deferred"]] == [("buy", "SGOV", 16_000.0)]
    assert facts["summary"] == {"changes": 3, "orders": 3, "recommendation": True}
    states = {s["ticker"]: (s["state"], s["changed"], s["target_usd"]) for s in facts["sleeves"]}
    assert states == {"SSO": ("in", True, 20_000.0), "QLD": ("in", True, 20_000.0), "IBIT": ("on", True, 24_000.0),
                      "SGOV": ("reserve", False, 16_000.0)}
    sso = next(s for s in facts["sleeves"] if s["ticker"] == "SSO")
    assert sso["why"]["close"] == 7_743.0 and sso["why"]["sma200"] < 7_743.0 and sso["why"]["pct_vs_sma"] > 5.0
    ibit = next(s for s in facts["sleeves"] if s["ticker"] == "IBIT")
    assert ibit["why"]["weekly_close"] == 90_000.0 and ibit["why"]["ma10w"] < 90_000.0 and ibit["why"]["sma200"] < 90_000.0
    assert facts["risk"]["leveraged_held"] == ["SSO", "QLD", "IBIT"] and facts["risk"]["crash_day_loss_pct"] == 29.5
    assert facts["risk"]["hard_stop_pct"] == 40.0 and facts["w10"]["state"] == "armed"
    assert all(s["agree"] for s in facts["sources"]) and {s["ticker"] for s in facts["sources"]} == {"^GSPC", "^NDX", "BTC-USD"}
    recs = {r["record_type"]: r for r in records(state_dir) if r["record_type"] in ("growth_decision", "governor", "order_set")}
    assert facts["ids"] == {k: recs[k]["hash"] for k in ("growth_decision", "governor", "order_set")}
    assert len(records(state_dir, "order")) == 3 and len(st["broker"]["pending"]) == 3
    assert all(o["meta"]["max_cash_frac"] == 0.9 for o in st["broker"]["pending"])
    assert st["growth"]["G_at_last_order"] == 1.0 and st["growth"]["sleeves"]["G1"]["SSO"]["in"] is True
    assert st["growth"]["sleeves"]["G2"]["on"] is True and st["growth"]["sleeves"]["G3"]["reserve"] == 12_000.0
    assert st["modules"]["M3"]["open_trade"] is None                   # M3 is superseded: no M3 switch-on
    again = pipeline.run_weekly(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    assert again.status == "already_done"


def test_missing_index_data_fails_closed_with_an_alert(tmp_path):
    cfg = cfg_for()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    mk = market(ramp_index(), btc_on())
    del mk["bars"]["^NDX"]
    res = pipeline.run_weekly(cfg, GrowthProvider(**mk), state_dir, date=LAUNCH, services=Recorder().services())
    assert res.status == "ok"
    st = state_of(state_dir)
    facts = st["growth"]["last_facts"]
    assert [(o["ticker"], o["usd"]) for o in facts["orders"]["step2"]] == [("SSO", 20_000.0), ("IBIT", 24_000.0), ("SGOV", 36_000.0)]
    assert next(s for s in facts["sleeves"] if s["ticker"] == "QLD")["state"] == "out"
    assert any(a["kind"] == "data" and "QLD" in a["message"] for a in st["alerts"])


# ==================================================================================== 7. a 1987 Monday
def test_a_1987_day_costs_the_book_29_5_pct_and_the_next_sunday_cuts_first(tmp_path):
    cfg = cfg_for(taxable=False)                                   # the book is the whole NAV, as in design §6
    days = trading_days()
    index = path(days, [(HIST_START, 6_500.0), ("2026-09-25", 7_743.0), ("2026-09-29", 7_743.0),
                        ("2026-09-30", 7_743.0 * 0.795), (END, 7_743.0 * 0.795)])       # -20.5% on Wednesday
    btc = path(pd.date_range("2025-06-01", END, freq="D"),
               [("2025-06-01", 40_000.0), ("2026-09-12", 40_000.0), ("2026-09-13", 90_000.0), ("2026-09-29", 90_000.0),
                ("2026-09-30", 90_000.0 * 0.703), (END, 90_000.0 * 0.703)])              # Bitcoin -29.7%
    provider = GrowthProvider(**market(index, btc))
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    rec = Recorder()
    first = sunday_then_monday(cfg, provider, state_dir, LAUNCH, rec)
    assert [o["ticker"] for o in first["orders"]["step2"]] == ["SSO", "QLD", "IBIT"]
    st = state_of(state_dir)
    assert {k.split("|")[1] for k in st["broker"]["lots"]} == {"SSO", "QLD", "IBIT"}
    res = pipeline.run_weekly(cfg, provider, state_dir, date="2026-10-04", services=rec.services())
    assert res.status == "ok"
    facts = state_of(state_dir)["growth"]["last_facts"]
    loss = 1.0 - facts["nav"]["total"] / 80_000.0
    assert loss == pytest.approx(0.5 * 0.41 + 0.3 * 0.297, abs=0.001)          # 0.5 x 41% + the IBIT move
    assert facts["nav"]["peak"] == 80_000.0 and round(facts["governor"]["G"], 2) == 0.46
    step1 = [(o["action"], o["ticker"], o["reason"]) for o in facts["orders"]["step1"]]
    assert step1 == [("sell_all", "SSO", "switch_off"), ("sell_all", "QLD", "switch_off"), ("sell", "IBIT", "governor_cut")]
    assert facts["orders"]["step2"] == [] and [o["ticker"] for o in facts["orders"]["deferred"]] == ["SGOV"]
    ibit = next(s for s in facts["sleeves"] if s["ticker"] == "IBIT")
    assert ibit["state"] == "on" and ibit["target_usd"] == pytest.approx(0.30 * facts["governor"]["G"] * facts["nav"]["ira"], abs=0.01)
    assert facts["risk"]["leveraged_held"] == ["SSO", "QLD", "IBIT"]


# ==================================================================================== 8. a whipsaw sequence
def test_whipsaw_switches_out_and_in_twice_with_at_most_3_orders_and_a_verified_ledger(tmp_path):
    # Rule E off: this path crosses the average on a Monday close, and only the Mondays run here (the Rule E sell
    # would otherwise fill only when the next daily run happens); tests/test_growth_email.py covers Rule E
    cfg = cfg_for(rule_e=False)
    days = trading_days()
    index = path(days, [(HIST_START, 7_000.0), ("2026-09-18", 7_000.0), ("2026-09-21", 7_210.0), ("2026-09-25", 7_210.0),
                        ("2026-09-28", 6_790.0), ("2026-10-02", 6_790.0), ("2026-10-05", 7_210.0), ("2026-10-09", 7_210.0),
                        ("2026-10-12", 6_790.0), ("2026-10-16", 6_790.0), ("2026-10-19", 7_210.0), (END, 7_210.0)])
    provider = GrowthProvider(**market(index, btc_on()))
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    rec = Recorder()
    sso_states, per_email = [], []
    for sunday in ("2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"):
        facts = sunday_then_monday(cfg, provider, state_dir, sunday, rec)
        sso_states.append(next(s for s in facts["sleeves"] if s["ticker"] == "SSO")["state"])
        per_email.append([(o["action"], o["ticker"]) for o in facts["orders"]["step1"] + facts["orders"]["step2"]])
    assert sso_states == ["in", "out", "in", "out", "in"]
    assert all(len(orders) <= 3 for orders in per_email)
    assert per_email[1][:2] == [("sell_all", "SSO"), ("sell_all", "QLD")]
    assert per_email[2][0] == ("sell", "SGOV") and set(per_email[2][1:]) == {("buy", "SSO"), ("buy", "QLD")}
    st = state_of(state_dir)
    lots = {k.split("|")[1] for k in st["broker"]["lots"]}
    assert lots >= {"SSO", "QLD", "IBIT"}
    assert not [a for a in st["alerts"] if a["kind"] in ("fill", "order", "validator")], st["alerts"]
    ok, why = Ledger(state_dir / "ledger.jsonl").verify()
    assert ok, why
    decisions = records(state_dir, "growth_decision")
    assert [r["payload"]["date"] for r in decisions] == ["2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]
    assert [r["payload"]["state_after"]["G1"]["SSO"] for r in decisions] == [True, False, True, False, True]
    assert len(records(state_dir, "order_set")) == 5 and len(records(state_dir, "governor")) == 5
    assert all(len(r["payload"]["sent"]) <= 3 for r in records(state_dir, "order_set"))
    assert st["growth"]["weeks_with_orders"]["2026"] == 5


# ==================================================================================== W10 folded in
def test_w10_fired_this_week_is_bought_from_sgov_on_monday(tmp_path):
    cfg = cfg_for()
    provider = GrowthProvider(**market(ramp_index(), btc_on()))
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    rec = Recorder()
    sunday_then_monday(cfg, provider, state_dir, LAUNCH, rec)
    sunday_then_monday(cfg, provider, state_dir, "2026-10-04", rec)         # the SGOV buy of the $16k
    st = state_of(state_dir)
    assert "ira|SGOV|GROWTH" in st["broker"]["lots"]
    st["modules"]["W10"]["fired"] = {"signal_date": "2026-10-06", "ret": -0.031}   # the daily run's signal record
    (state_dir / "state.json").write_text(json.dumps(st))
    facts = sunday_then_monday(cfg, provider, state_dir, "2026-10-11", rec)
    assert facts["w10"]["state"] == "fired" and facts["w10"]["buy_usd"] == pytest.approx(0.06 * facts["nav"]["ira"], abs=0.01)
    assert [(o["action"], o["ticker"]) for o in facts["orders"]["step1"]] == [("sell", "SGOV")]
    assert [(o["action"], o["ticker"], o["sleeve"]) for o in facts["orders"]["step2"]] == [("buy", "SPY", "W10")]
    st = state_of(state_dir)
    assert st["modules"]["W10"]["open_trade"]["status"] == "open" and st["modules"]["W10"]["open_trade"]["trade_id"] == "T-2026-10-06-W10"
    assert st["modules"]["W10"]["fired"]["handled"] == "2026-10-11" and "ira|SPY|W10" in st["broker"]["lots"]
    facts = sunday_then_monday(cfg, provider, state_dir, "2026-10-18", rec)
    assert facts["w10"]["state"] == "open" and facts["w10"]["exit_due"] == "2027-01-08"   # 12 Oct + 90 days: a Sunday
