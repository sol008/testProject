"""Tests for pre-registered forecasts and Brier scoring (traderec/forecasts.py)."""
from __future__ import annotations

import copy

import pytest

from traderec.config import load_config
from traderec.forecasts import brier, make_forecasts, resolve_forecast, resolve_trade_forecasts, summarize
from traderec.types import OrderIntent, Recommendation


@pytest.fixture(scope="module")
def cfg():
    return load_config()


def rec(kind: str, module: str, facts: dict | None = None, ticker: str | None = None,
        created: str = "2026-09-28") -> Recommendation:
    trade_id = f"T-{created}-{module}"
    orders = []
    if ticker:
        orders.append(OrderIntent(intent_id=f"O-{created}-{module}-001", trade_id=trade_id, module=module,
                                  account="ira", ticker=ticker, side="buy", created_date=created,
                                  reason="entry", dollars=6000.0))
    return Recommendation(kind=kind, module=module, trade_id=trade_id, created_date=created, orders=orders,
                          facts=facts or {})


# ---------------------------------------------------------------------- creation


def test_m1_new_trade_registers_profit_and_time_stop(cfg):
    fs = make_forecasts(rec("NEW_TRADE", "M1", ticker="SPY"), cfg)
    assert fs == [
        {"forecast_id": "F-T-2026-09-28-M1-1", "trade_id": "T-2026-09-28-M1", "module": "M1",
         "question": "Trade closes with a profit (exit price above entry price)", "p": 0.75,
         "resolves": "on_exit", "due": None, "event": "profit", "ticker": "SPY", "created_date": "2026-09-28"},
        {"forecast_id": "F-T-2026-09-28-M1-2", "trade_id": "T-2026-09-28-M1", "module": "M1",
         "question": "Trade exits on the 20-session time stop rather than the 5-day-average rule", "p": 0.10,
         "resolves": "on_exit", "due": None, "event": "time_stop", "ticker": "SPY", "created_date": "2026-09-28"},
    ]


def test_m1_probabilities_come_from_the_constitution(cfg):
    constitution = copy.deepcopy(cfg.constitution)
    constitution["modules"]["M1"]["forecasts"] = {"p_profit": 0.6, "p_time_stop": 0.2}
    other = type(cfg)(cfg.account, constitution, cfg.whitelist, cfg.constitution_sha256)
    assert [f["p"] for f in make_forecasts(rec("NEW_TRADE", "M1"), other)] == [0.6, 0.2]


def test_m2_rebalance_registers_one_forecast_per_held_leg(cfg):
    targets = {"SPY": 12000.0, "QQQ": 0.0, "IEF": 9000.0, "GLD": 7500.5, "USO": None, "FXE": float("nan")}
    fs = make_forecasts(rec("REBALANCE", "M2", facts={"targets": targets}, created="2026-10-01"), cfg)
    assert [f["forecast_id"] for f in fs] == ["F-T-2026-10-01-M2-1", "F-T-2026-10-01-M2-2", "F-T-2026-10-01-M2-3"]
    assert [f["ticker"] for f in fs] == ["SPY", "IEF", "GLD"]
    assert fs[0]["question"] == "SPY total return over the next month is above 0"
    assert fs[1]["question"] == "IEF total return over the next month is above 0"
    for f in fs:
        assert f["p"] == 0.54 and f["resolves"] == "date" and f["due"] == "2026-11-01"
        assert f["event"] == "leg_up_next_month" and f["module"] == "M2" and f["created_date"] == "2026-10-01"


def test_m2_due_date_is_31_calendar_days_later(cfg):
    fs = make_forecasts(rec("REBALANCE", "M2", facts={"targets": {"GLD": 1.0}}, created="2027-02-01"), cfg)
    assert fs[0]["due"] == "2027-03-04"


def test_m2_without_targets_registers_nothing(cfg):
    assert make_forecasts(rec("REBALANCE", "M2"), cfg) == []
    assert make_forecasts(rec("REBALANCE", "M2", facts={"targets": {"SPY": 0.0}}), cfg) == []


def test_m3_switch_on_registers_profit(cfg):
    (f,) = make_forecasts(rec("SWITCH_ON", "M3", ticker="IBIT"), cfg)
    assert f["forecast_id"] == "F-T-2026-09-28-M3-1"
    assert f["question"] == "The Bitcoin position closes with a profit"
    assert (f["p"], f["resolves"], f["due"], f["event"], f["ticker"]) == (0.45, "on_exit", None, "profit", "IBIT")


def test_ticker_defaults_to_the_module_config_without_orders(cfg):
    assert make_forecasts(rec("SWITCH_ON", "M3"), cfg)[0]["ticker"] == "IBIT"
    assert make_forecasts(rec("NEW_TRADE", "M1"), cfg)[0]["ticker"] == "SPY"


@pytest.mark.parametrize("kind, module", [
    ("EXIT", "M1"), ("SWITCH_OFF", "M3"), ("REBALANCE", "M1"), ("NEW_TRADE", "M2"), ("SWITCH_ON", "M1"),
])
def test_other_kinds_register_nothing(cfg, kind, module):
    assert make_forecasts(rec(kind, module, facts={"targets": {"SPY": 1000.0}}), cfg) == []


# ---------------------------------------------------------------------- scoring


@pytest.mark.parametrize("p, outcome, expected", [
    (0.75, 1, 0.0625), (0.75, 0, 0.5625), (0.10, 0, 0.01), (0.10, 1, 0.81), (0.0, 0, 0.0), (1.0, 0, 1.0),
    (0.5, True, 0.25),
])
def test_brier(p, outcome, expected):
    assert brier(p, outcome) == pytest.approx(expected)


@pytest.mark.parametrize("p, outcome", [(0.5, 2), (0.5, -1), (0.5, 0.5), (1.2, 1), (-0.1, 0), (float("nan"), 1)])
def test_brier_rejects_invalid_input(p, outcome):
    with pytest.raises(ValueError):
        brier(p, outcome)


def test_resolve_profitable_rule_exit(cfg):
    fs = make_forecasts(rec("NEW_TRADE", "M1", ticker="SPY"), cfg)
    before = copy.deepcopy(fs)
    out = resolve_trade_forecasts(fs, {"profit": True, "exit_reason": "exit_rule"})
    assert [(f["forecast_id"], f["outcome"]) for f in out] == [("F-T-2026-09-28-M1-1", 1), ("F-T-2026-09-28-M1-2", 0)]
    assert out[0]["brier"] == pytest.approx(0.0625) and out[1]["brier"] == pytest.approx(0.01)
    assert {k: v for k, v in out[0].items() if k not in ("outcome", "brier")} == fs[0]
    assert fs == before  # inputs are not modified


def test_resolve_losing_time_stop_exit(cfg):
    fs = make_forecasts(rec("NEW_TRADE", "M1", ticker="SPY"), cfg)
    out = resolve_trade_forecasts(fs, {"profit": False, "exit_reason": "time_stop"})
    assert [f["outcome"] for f in out] == [0, 1]
    assert [f["brier"] for f in out] == [pytest.approx(0.5625), pytest.approx(0.81)]


def test_resolve_m3_and_skip_date_forecasts(cfg):
    m3 = make_forecasts(rec("SWITCH_ON", "M3", ticker="IBIT"), cfg)
    m2 = make_forecasts(rec("REBALANCE", "M2", facts={"targets": {"SPY": 1.0}}), cfg)
    out = resolve_trade_forecasts(m3 + m2, {"profit": True})  # no time-stop forecast: exit_reason not needed
    assert [(f["module"], f["outcome"], f["brier"]) for f in out] == [("M3", 1, pytest.approx(0.3025))]


def test_resolve_forecast_for_date_forecasts(cfg):
    (leg,) = make_forecasts(rec("REBALANCE", "M2", facts={"targets": {"GLD": 5000.0}}), cfg)
    done = resolve_forecast(leg, 0)
    assert done["outcome"] == 0 and done["brier"] == pytest.approx(0.54 ** 2) and "outcome" not in leg


def test_resolve_rejects_unknown_on_exit_event():
    bad = {"forecast_id": "F-X-1", "module": "M9", "p": 0.5, "resolves": "on_exit", "event": "moon"}
    with pytest.raises(ValueError, match="moon"):
        resolve_trade_forecasts([bad], {"profit": True, "exit_reason": "exit_rule"})


# ---------------------------------------------------------------------- summary


def test_summarize_overall_and_per_module():
    resolved = [
        {"module": "M1", "p": 0.75, "outcome": 1},
        {"module": "M1", "p": 0.75, "outcome": 0},
        {"module": "M1", "p": 0.10, "outcome": 0},
        {"module": "M3", "p": 0.45, "outcome": 1},
        {"module": "M2", "p": 0.54, "resolves": "date"},  # not resolved yet
    ]
    s = summarize(resolved)
    assert s["n"] == 4 and s["hits"] == 2 and s["n_unresolved"] == 1
    assert s["mean_p"] == pytest.approx((0.75 + 0.75 + 0.10 + 0.45) / 4)
    assert s["hit_rate"] == pytest.approx(0.5)
    assert s["mean_brier"] == pytest.approx((0.0625 + 0.5625 + 0.01 + 0.3025) / 4)
    assert list(s["by_module"]) == ["M1", "M3"]
    m1 = s["by_module"]["M1"]
    assert (m1["n"], m1["hits"]) == (3, 1)
    assert m1["mean_p"] == pytest.approx(1.6 / 3) and m1["hit_rate"] == pytest.approx(1 / 3)
    assert m1["mean_brier"] == pytest.approx((0.0625 + 0.5625 + 0.01) / 3)
    assert s["by_module"]["M3"] == {"n": 1, "hits": 1, "mean_p": 0.45, "hit_rate": 1.0,
                                    "mean_brier": pytest.approx(0.3025)}


def test_summarize_empty():
    assert summarize([]) == {"n": 0, "hits": 0, "mean_p": None, "hit_rate": None, "mean_brier": None,
                             "n_unresolved": 0, "by_module": {}}


def test_summarize_resolved_trade_end_to_end(cfg):
    fs = make_forecasts(rec("NEW_TRADE", "M1", ticker="SPY"), cfg)
    s = summarize(resolve_trade_forecasts(fs, {"profit": True, "exit_reason": "exit_rule"}))
    assert (s["n"], s["hits"]) == (2, 1)
    assert s["mean_brier"] == pytest.approx((0.0625 + 0.01) / 2)
