"""Tests for traderec.risk: governor, stress table, open stress and trade admission."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from traderec.config import Config, load_config
from traderec.risk import admit, governor, is_crypto, open_stress, stress_table, unit_stress

# The constitution's risk values, pinned here so the expected numbers do not drift with the YAML.
CONSTITUTION = {
    "version": "test",
    "modules": {
        "M1": {"ticker": "SPY", "stress_loss": 0.326},
        "M2": {"legs": {"SPY": "us_equity", "QQQ": "us_equity", "IEF": "duration", "GLD": "gold", "USO": "oil",
                        "FXE": "usd", "FXY": "usd", "FXA": "usd"},
               "sleeve_stress_pct_nav": 0.045},
        "M3": {"ticker": "IBIT"},
    },
    "risk": {
        "governor": {"full_until": 0.05, "floor_at": 0.15, "floor": 0.25},
        "caps": {"per_trade_stress": 0.02, "us_equity_cluster": 0.07, "total_open_stress": 0.10},
        "stress_floor": 0.15,
        "crypto_stress": 0.45,
    },
}
CFG = Config(account={}, constitution=CONSTITUTION,
             whitelist={"robinhood": {"SPY": {}, "GLD": {}, "IBIT": {}}, "coinbase": {"BTC-USD": {}, "ETH-USD": {}}},
             constitution_sha256="test")
NAV = 100_000.0
STRESS = {"SPY": 0.30, "QQQ": 0.35, "GLD": 0.15, "IEF": 0.15, "IBIT": 0.45}


def book(total: float = 0.0, us_equity: float = 0.0) -> dict:
    return {"total": total, "us_equity": us_equity, "by_module": {}, "nav": NAV}


def series(values) -> pd.Series:
    return pd.Series(np.asarray(values, dtype=float), index=pd.bdate_range("2020-01-01", periods=len(values)))


# ------------------------------------------------------------------------------------------ governor
@pytest.mark.parametrize("d, g", [(0.0, 1.0), (0.03, 1.0), (0.05, 1.0), (0.075, 0.8125), (0.10, 0.625),
                                  (0.125, 0.4375), (0.15, 0.25), (0.20, 0.25), (0.60, 0.25)])
def test_governor_points(d, g):
    assert governor(d, CFG.risk["governor"]) == pytest.approx(g)


def test_governor_accepts_either_config_block_and_either_sign():
    assert governor(0.10, CFG.risk) == pytest.approx(0.625)
    assert governor(-0.10, CFG.risk["governor"]) == pytest.approx(0.625)
    assert governor(float("nan"), CFG.risk) == 0.25                 # unknown drawdown: fail closed
    assert governor(0.10, load_config().risk["governor"]) == pytest.approx(0.625)


# -------------------------------------------------------------------------------------- stress table
def test_stress_table():
    crash20 = [100.0] * 30 + list(np.linspace(100.0, 80.0, 11)[1:]) + [80.0] * 20   # -20% over 10 sessions
    crash40 = [50.0] * 15 + list(np.linspace(50.0, 30.0, 11)[1:]) + [30.0] * 5      # -40%
    table = stress_table({"SPY": series(crash20), "USO": series(crash40), "IEF": series(np.linspace(100, 101, 60)),
                          "GLD": series([100.0, 90.0, 80.0]), "IBIT": series(np.linspace(40, 60, 60)),
                          "BTC-USD": series(crash20), "FXA": None}, CFG)
    assert table["SPY"] == pytest.approx(0.20)
    assert table["USO"] == pytest.approx(0.40)
    assert table["IEF"] == 0.15                                     # calm history: floor
    assert table["GLD"] == 0.15                                     # too short for a 10-session return
    assert table["IBIT"] == 0.45 and table["BTC-USD"] == 0.45       # crypto: fixed stress
    assert table["FXA"] == 0.15


def test_is_crypto():
    assert all(is_crypto(t, CFG) for t in ("IBIT", "FBTC", "BTC-USD", "eth-usd"))
    assert not any(is_crypto(t, CFG) for t in ("SPY", "GLD", "USO"))


def test_unit_stress_module_floor_and_missing_ticker():
    assert unit_stress("M1", "SPY", {"SPY": 0.20}, CFG) == pytest.approx(0.326)     # M1's stress_loss floor
    assert unit_stress("M2", "SPY", {"SPY": 0.20}, CFG) == pytest.approx(0.20)
    assert unit_stress("M1", "SPY", {"SPY": 0.40}, CFG) == pytest.approx(0.40)
    assert unit_stress("M5", "DAL", {}, CFG) == 1.0                                 # unknown: total loss
    assert unit_stress("M3", "IBIT", {}, CFG) == 0.45


# --------------------------------------------------------------------------------------- open stress
def pos(ticker: str, module: str, account: str = "ira") -> dict:
    return {"account": account, "ticker": ticker, "module": module, "qty": 1.0, "cost": 1.0,
            "opened": "2026-09-01", "trade_id": f"T-{module}-{ticker}"}


def test_open_stress_counts_m2_once_as_its_sleeve():
    positions = [pos("SPY", "M1"), pos("SPY", "M2"), pos("QQQ", "M2"), pos("GLD", "M2"), pos("IEF", "M2"),
                 pos("IBIT", "M3"), pos("SPY", "SHADOW:W10")]
    values = {"ira|SPY|M1": 6_000.0, "ira|SPY|M2": 10_000.0, "ira|QQQ|M2": 5_000.0, "ira|GLD|M2": 20_000.0,
              "ira|IEF|M2": 15_000.0, "ira|IBIT|M3": 3_000.0, "__nav__": NAV}
    stress = {"SPY": 0.30, "QQQ": 0.35, "GLD": 0.20, "IEF": 0.15, "IBIT": 0.45}
    res = open_stress(positions, values, stress, CFG)
    m1 = 6_000 * 0.326                                  # M1 uses the S&P's 32.6%, not SPY's 30%
    assert res["by_module"]["M1"] == pytest.approx(m1)
    assert res["by_module"]["M2"] == pytest.approx(4_500)          # 11,000 raw, capped at 4.5% of NAV
    assert res["by_module"]["M3"] == pytest.approx(1_350)
    assert set(res["by_module"]) == {"M1", "M2", "M3"}              # shadow ignored
    assert res["total"] == pytest.approx(m1 + 4_500 + 1_350)
    assert res["us_equity"] == pytest.approx(m1 + 10_000 * 0.30 + 5_000 * 0.35)
    assert res["nav"] == NAV


def test_open_stress_small_m2_book_and_empty_book():
    res = open_stress([pos("GLD", "M2")], {"ira|GLD|M2": 10_000.0, "__nav__": NAV}, {"GLD": 0.20}, CFG)
    assert res["by_module"] == {"M2": pytest.approx(2_000)} and res["us_equity"] == 0.0
    assert open_stress([], {"__nav__": NAV}, {}, CFG) == {"total": 0.0, "us_equity": 0.0, "by_module": {}, "nav": NAV}


def test_open_stress_fails_loudly_without_values():
    with pytest.raises(KeyError):
        open_stress([pos("SPY", "M1")], {"__nav__": NAV}, STRESS, CFG)
    with pytest.raises(ValueError):
        open_stress([], {}, STRESS, CFG)


# -------------------------------------------------------------------------------------------- admit
def test_admit_m1_full_size_on_a_clean_book():
    res = admit("M1", "SPY", 6_000.0, book(), STRESS, CFG, 0.0)
    assert res == {"ok": True, "dollars": 6_000.0, "binding": None, "notes": []}   # 1,956 stress < 2,000


def test_admit_governor_scales():
    res = admit("M1", "SPY", 6_000.0, book(), STRESS, CFG, 0.10)
    assert res["ok"] and res["dollars"] == pytest.approx(3_750) and res["binding"] == "governor"
    assert len(res["notes"]) == 1


def test_admit_per_trade_stress_cap():
    res = admit("M3", "IBIT", 6_000.0, book(), STRESS, CFG, 0.0)
    assert res["dollars"] == pytest.approx(2_000 / 0.45) and res["binding"] == "per_trade_stress"
    big_m1 = admit("M1", "SPY", 7_000.0, book(), {"SPY": 0.20}, CFG, 0.0)    # 32.6% floor, not 20%
    assert big_m1["dollars"] == pytest.approx(2_000 / 0.326) and big_m1["binding"] == "per_trade_stress"


def test_admit_us_equity_cluster_cap_applies_to_us_equity_only():
    busy = book(total=6_500, us_equity=6_500)
    res = admit("M1", "SPY", 6_000.0, busy, STRESS, CFG, 0.0)
    assert res["dollars"] == pytest.approx(500 / 0.326) and res["binding"] == "us_equity_cluster"
    assert res["dollars"] * 0.326 + 6_500 == pytest.approx(0.07 * NAV)
    gold = admit("M9", "GLD", 6_000.0, busy, STRESS, CFG, 0.0)
    assert gold == {"ok": True, "dollars": 6_000.0, "binding": None, "notes": []}


def test_admit_total_open_stress_cap_and_minimum():
    res = admit("M1", "SPY", 6_000.0, book(total=9_900), STRESS, CFG, 0.0)
    assert res["ok"] and res["dollars"] == pytest.approx(100 / 0.326) and res["binding"] == "total_open_stress"
    tiny = admit("M1", "SPY", 6_000.0, book(total=9_990), STRESS, CFG, 0.0)
    assert tiny["ok"] is False and tiny["dollars"] < 50 and tiny["binding"] == "total_open_stress"
    assert any("minimum" in n for n in tiny["notes"])
    full = admit("M1", "SPY", 6_000.0, book(total=12_000), STRESS, CFG, 0.0)
    assert full["ok"] is False and full["dollars"] == 0.0


def test_admit_binding_is_the_tightest_step():
    res = admit("M1", "SPY", 6_000.0, book(total=6_500, us_equity=6_500), STRESS, CFG, 0.10)
    assert res["dollars"] == pytest.approx(500 / 0.326)             # governor 3,750, then cluster room
    assert res["binding"] == "us_equity_cluster" and len(res["notes"]) == 2


def test_admit_m4_exempt_from_governor_and_missing_stress_note():
    assert admit("M4", "GLD", 1_000.0, book(), STRESS, CFG, 0.20)["dollars"] == 1_000.0
    res = admit("M5", "DAL", 6_000.0, book(), STRESS, CFG, 0.0)
    assert res["dollars"] == pytest.approx(2_000) and res["binding"] == "per_trade_stress"
    assert any("no stress figure for DAL" in n for n in res["notes"])


def test_admit_small_request_and_bad_input():
    res = admit("M1", "SPY", 40.0, book(), STRESS, CFG, 0.0)
    assert res["ok"] is False and res["binding"] is None and res["dollars"] == 40.0
    with pytest.raises(ValueError):
        admit("M1", "SPY", 6_000.0, {"total": 0.0, "us_equity": 0.0}, STRESS, CFG, 0.0)


def test_admit_with_the_real_constitution():
    cfg = load_config()
    nav = 100_000.0
    dollars = cfg.module("M1")["notional_pct_nav"] * nav
    ps = open_stress([], {"__nav__": nav}, {}, cfg)
    res = admit("M1", "SPY", dollars, ps, {"SPY": 0.30}, cfg, 0.0)
    assert res["ok"] and res["dollars"] == pytest.approx(6_000) and res["binding"] is None
    assert res["dollars"] * cfg.module("M1")["stress_loss"] <= cfg.risk["caps"]["per_trade_stress"] * nav
