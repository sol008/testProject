"""Tests for traderec.risk: governor, stress table, open stress and trade admission."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from traderec.config import Config, load_config
from traderec.risk import admit, governor, is_crypto, open_stress, stress_table, unit_stress
from traderec.risk import admit_premium, premium_caps, spread_cluster, ticker_cluster

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
    assert res == {"ok": True, "dollars": 6_000.0, "binding": None, "notes": [],   # 1,956 stress < 2,000
                   "cluster_overflow": 0.0}


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
    res = admit("M9", "SPY", 6_000.0, busy, STRESS, CFG, 0.0)          # no module floor: SPY's own 30%
    assert res["dollars"] == pytest.approx(500 / 0.30) and res["binding"] == "us_equity_cluster"
    assert res["dollars"] * 0.30 + 6_500 == pytest.approx(0.07 * NAV)
    gold = admit("M9", "GLD", 6_000.0, busy, STRESS, CFG, 0.0)
    assert gold == {"ok": True, "dollars": 6_000.0, "binding": None, "notes": [], "cluster_overflow": 0.0}


def test_admit_m1_has_cluster_priority_and_w10_needs_half_its_size():
    busy = book(total=6_500, us_equity=6_500)
    m1 = admit("M1", "SPY", 6_000.0, busy, STRESS, CFG, 0.0)       # design v3.3 §4: M1 is never blocked
    assert m1["ok"] and m1["dollars"] == 6_000.0 and m1["binding"] is None
    assert m1["cluster_overflow"] == pytest.approx(6_000 * 0.326 - 500)
    real = load_config()
    w10 = admit("W10", "SPY", 6_000.0, busy, STRESS, real, 0.0)     # 500 of room = 26% of the size: skipped
    assert w10["ok"] is False and w10["binding"] == "us_equity_cluster"
    assert any("skipped" in n for n in w10["notes"])
    roomy = book(total=5_000, us_equity=5_000)                       # 2,000 of room: 6,135 > 6,000 fits
    assert admit("W10", "SPY", 6_000.0, roomy, STRESS, real, 0.0)["ok"] is True
    half = book(total=5_900, us_equity=5_900)                        # 1,100 of room = 56% of the size: kept
    kept = admit("W10", "SPY", 6_000.0, half, STRESS, real, 0.0)
    assert kept["ok"] is True and kept["dollars"] == pytest.approx(1_100 / 0.326)


def test_admit_total_open_stress_cap_and_minimum():
    res = admit("M1", "SPY", 6_000.0, book(total=9_900), STRESS, CFG, 0.0)
    assert res["ok"] and res["dollars"] == pytest.approx(100 / 0.326) and res["binding"] == "total_open_stress"
    tiny = admit("M1", "SPY", 6_000.0, book(total=9_990), STRESS, CFG, 0.0)
    assert tiny["ok"] is False and tiny["dollars"] < 50 and tiny["binding"] == "total_open_stress"
    assert any("minimum" in n for n in tiny["notes"])
    full = admit("M1", "SPY", 6_000.0, book(total=12_000), STRESS, CFG, 0.0)
    assert full["ok"] is False and full["dollars"] == 0.0


def test_admit_binding_is_the_tightest_step():
    res = admit("M9", "SPY", 6_000.0, book(total=6_500, us_equity=6_500), STRESS, CFG, 0.10)
    assert res["dollars"] == pytest.approx(500 / 0.30)              # governor 3,750, then cluster room
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


# ------------------------------------------------------------------ Phase B: premium trades (M4 build, contract §7)
def pbook(total: float = 0.0, us_equity: float = 0.0, premium: float = 0.0, premium_by_cluster: dict | None = None,
          by_cluster: dict | None = None) -> dict:
    """open_stress(..., spreads=...) output for admit_premium."""
    return {"total": total, "us_equity": us_equity, "by_module": {}, "nav": NAV, "premium": premium,
            "premium_by_cluster": premium_by_cluster or {}, "by_cluster": by_cluster or {}, "pending": 0.0}


def spread(module: str, root: str, contracts: int = 1, **kw) -> dict:
    return {"module": module, "root": root, "contracts": contracts, "trade_id": f"T-{module}", **kw}


def test_open_stress_is_unchanged_without_spreads_and_extended_with_them():
    positions, values = [pos("SPY", "M1")], {"ira|SPY|M1": 6_000.0, "__nav__": NAV}
    plain = open_stress(positions, values, STRESS, CFG)
    extended = open_stress(positions, values, STRESS, CFG, spreads=[], pending=[])
    assert set(plain) == {"total", "us_equity", "by_module", "nav"}
    assert {k: extended[k] for k in plain} == plain
    assert extended["premium"] == 0.0 and extended["pending"] == 0.0
    assert extended["by_cluster"] == {"us_equity": pytest.approx(6_000 * 0.326)}


def test_open_stress_counts_spreads_at_the_larger_of_cost_and_value():
    spreads = [spread("M4", "XSP", 2, cost=1_800.0, mark=12.0),         # value 2,400 > cost
               spread("W8", "SPY", 3, cost=900.0, mark=2.0),            # value 600 < cost; W8 sits in the oil factor
               spread("SHADOW:M4_TWIN", "XSP", cost=5_000.0)]           # shadow: ignored
    res = open_stress([], {"__nav__": NAV}, {}, CFG, spreads=spreads)
    assert res["by_module"] == {"M4": 2_400.0, "W8": 900.0}
    assert res["us_equity"] == 2_400.0 and res["total"] == 3_300.0
    assert res["premium"] == 3_300.0 and res["premium_by_cluster"] == {"us_equity": 2_400.0, "oil": 900.0}
    by_entry = open_stress([], {"__nav__": NAV}, {}, CFG, spreads=[spread("M4", "XSP", 2, entry_price=8.5)])
    assert by_entry["premium"] == pytest.approx(1_700.0)
    with pytest.raises(ValueError):
        open_stress([], {"__nav__": NAV}, {}, CFG, spreads=[spread("M4", "XSP")])   # no cost, no value


def test_open_stress_counts_pending_buys_as_if_filled():
    pending = [{"module": "W10", "ticker": "SPY", "side": "buy", "order_type": "market_on_open", "dollars": 6_000.0},
               {"module": "W8", "ticker": "SPY", "side": "buy", "order_type": "spread_limit", "contracts": 2,
                "limit_price": 3.0, "max_price": 3.5},
               {"module": "M1", "ticker": "SPY", "side": "sell", "close_all": True, "order_type": "market_on_open"},
               {"module": "M2", "ticker": "QQQ", "side": "buy", "order_type": "market_on_open", "dollars": 5_000.0}]
    res = open_stress([], {"__nav__": NAV}, {"SPY": 0.30}, load_config(), pending=pending)
    assert res["by_module"]["W10"] == pytest.approx(6_000 * 0.326)          # W10's S&P stress floor
    assert res["by_module"]["W8"] == pytest.approx(700.0)                   # the stated maximum debit
    assert "M1" not in res["by_module"] and "M2" not in res["by_module"]    # sells and M2's rebalance left out
    assert res["us_equity"] == pytest.approx(6_000 * 0.326)
    assert res["premium_by_cluster"] == {"oil": pytest.approx(700.0)}
    assert res["pending"] == pytest.approx(6_000 * 0.326 + 700.0)


def test_clusters_and_premium_caps():
    cfg = load_config()
    assert ticker_cluster("SPY", cfg) == ticker_cluster("XSP", cfg) == "us_equity"
    assert (ticker_cluster("USO", cfg), ticker_cluster("IBIT", cfg), ticker_cluster("DAL", cfg)) == \
        ("oil", "crypto", "other")
    assert spread_cluster("M4", "SPY", cfg) == "us_equity" and spread_cluster("M7", "XSP", cfg) == "us_equity"
    assert spread_cluster("W8", "SPY", cfg) == spread_cluster("W8", "DAL", cfg) == spread_cluster("W9", "USO", cfg) \
        == "oil"
    assert premium_caps(cfg) == {"per_trade_premium": 0.03, "option_premium": 0.10, "factor_premium": 0.03,
                                 "other_cluster": 0.06}


def test_admit_premium_clean_book_and_the_per_trade_cap():
    ok = admit_premium("M4", "XSP", 2_000.0, "us_equity", pbook(), CFG, 0.0, exempt_governor=True,
                       min_premium_usd=900.0)
    assert ok == {"ok": True, "premium_usd": 2_000.0, "binding": None, "notes": [], "cluster_overflow": 0.0}
    big = admit_premium("M4", "XSP", 4_000.0, "us_equity", pbook(), CFG, 0.0)
    assert big["ok"] and big["premium_usd"] == pytest.approx(3_000.0) and big["binding"] == "per_trade_premium"


def test_admit_premium_option_total_and_factor_budget():
    total = admit_premium("W8", "SPY", 1_000.0, "oil",
                          pbook(total=9_700, premium=9_700, premium_by_cluster={"us_equity": 9_700}), CFG, 0.0)
    assert total["premium_usd"] == pytest.approx(300.0) and total["binding"] == "option_premium"
    factor = admit_premium("M4", "XSP", 2_000.0, "us_equity",
                           pbook(total=2_500, us_equity=2_500, premium=2_500, premium_by_cluster={"us_equity": 2_500}),
                           CFG, 0.0, min_premium_usd=900.0)                # a second spread would breach 3% premium
    assert not factor["ok"] and factor["premium_usd"] == pytest.approx(500.0) and factor["binding"] == "factor_premium"


def test_admit_premium_shares_the_us_equity_reserve_first_come_first_served():
    cut = admit_premium("M4", "XSP", 2_000.0, "us_equity", pbook(total=5_500, us_equity=5_500), CFG, 0.0,
                        exempt_governor=True, min_premium_usd=900.0)      # M1 + W10 left 1,500 of the 7% cluster
    assert cut["ok"] and cut["premium_usd"] == pytest.approx(1_500.0) and cut["binding"] == "us_equity_cluster"
    skip = admit_premium("M4", "XSP", 2_000.0, "us_equity", pbook(total=6_300, us_equity=6_300), CFG, 0.0,
                         exempt_governor=True, min_premium_usd=900.0)     # 700 left: under one contract
    assert not skip["ok"] and skip["premium_usd"] == pytest.approx(700.0) and skip["binding"] == "us_equity_cluster"
    assert any("under one contract" in n for n in skip["notes"])


def test_admit_premium_other_clusters_and_total_open_stress():
    oil = admit_premium("W9", "USO", 750.0, "oil", pbook(total=5_800, by_cluster={"oil": 5_800}), CFG, 0.0)
    assert oil["ok"] and oil["premium_usd"] == pytest.approx(200.0) and oil["binding"] == "oil_cluster"
    full = admit_premium("M4", "XSP", 2_000.0, "us_equity", pbook(total=9_500), CFG, 0.0, min_premium_usd=900.0)
    assert not full["ok"] and full["binding"] == "total_open_stress"
    none = admit_premium("M4", "XSP", 2_000.0, "us_equity", pbook(total=10_500), CFG, 0.0)
    assert not none["ok"] and none["premium_usd"] == 0.0 and any("no premium room" in n for n in none["notes"])


def test_admit_premium_governor_exemption():
    m4 = admit_premium("M4", "XSP", 2_000.0, "us_equity", pbook(), CFG, 0.20)
    assert m4["premium_usd"] == 2_000.0 and m4["binding"] is None             # M4 is exempt from G(D)
    w8 = admit_premium("W8", "SPY", 1_000.0, "oil", pbook(), CFG, 0.10)
    assert w8["premium_usd"] == pytest.approx(625.0) and w8["binding"] == "governor"
    assert admit_premium("W8", "SPY", 1_000.0, "oil", pbook(), CFG, 0.10, exempt_governor=True)["premium_usd"] == 1_000.0


def test_admit_premium_needs_the_premium_book_and_derives_the_cluster():
    with pytest.raises(ValueError):
        admit_premium("M4", "XSP", 2_000.0, "us_equity", book(), CFG, 0.0)          # open spreads not counted
    with pytest.raises(ValueError):
        admit_premium("M4", "XSP", 2_000.0, "us_equity", {"premium": 0.0}, CFG, 0.0)  # no NAV
    derived = admit_premium("W8", "DAL", 1_000.0, "", pbook(premium=2_500, premium_by_cluster={"oil": 2_500}), CFG, 0.0)
    assert derived["binding"] == "factor_premium" and derived["premium_usd"] == pytest.approx(500.0)


def test_admit_premium_caps_come_from_the_constitution_when_set():
    caps = {**CONSTITUTION["risk"]["caps"], "per_trade_premium": 0.01}
    cfg = Config(account={}, constitution={**CONSTITUTION, "risk": {**CONSTITUTION["risk"], "caps": caps}},
                 whitelist=CFG.whitelist, constitution_sha256="test")
    res = admit_premium("M4", "XSP", 2_000.0, "us_equity", pbook(), cfg, 0.0)
    assert res["premium_usd"] == pytest.approx(1_000.0) and res["binding"] == "per_trade_premium"


def test_admit_premium_with_the_real_constitution_after_m1_and_a_pending_w10():
    cfg = load_config()
    ps = open_stress([pos("SPY", "M1")], {"ira|SPY|M1": 6_000.0, "__nav__": NAV}, {"SPY": 0.30}, cfg, spreads=[],
                     pending=[{"module": "W10", "ticker": "SPY", "side": "buy", "dollars": 6_000.0}])
    assert ps["us_equity"] == pytest.approx(2 * 6_000 * 0.326)                  # 3,912 of the 7,000 cluster
    res = admit_premium("M4", "XSP", 1_752.0, "us_equity", ps, cfg, 0.12, exempt_governor=True, min_premium_usd=876.0)
    assert res["ok"] and res["premium_usd"] == pytest.approx(1_752.0) and res["binding"] is None
