"""Quarterly and annual reviews, the go-live gates and the generic monthly report (traderec.reports; design v3.3 §7,
§8). Offline: the synthetic market of test_pipeline.py and fakes only."""
from __future__ import annotations

import dataclasses
import json
import math
import os
import re
import shutil
import subprocess
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import yaml

from test_pipeline import LAUNCH, Recorder, SynthProvider, _run_until

from traderec import growth, pipeline, reports
from traderec.config import Config, load_config
from traderec.emails import render_annual, render_monthly, render_quarterly
from traderec.ledger import Ledger
from traderec.validator import validate

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github" / "workflows" / "monthly.yml"


def flat(text: str) -> str:
    return " ".join(text.replace("│", " ").split())


def in_order(text: str, headings: list[str]) -> bool:
    """The section headings appear on their own lines, in this order."""
    positions = [text.index(f"\n{h}\n") for h in headings]
    return positions == sorted(positions)


def _state(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def _records(state_dir: Path) -> list[dict]:
    return [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]


def _review_records(state_dir: Path, review: str) -> list[dict]:
    return [r["payload"] for r in _records(state_dir) if r["payload"].get("review") == review
            and r["record_type"] in ("monthly_report", f"{review}_report")]


def _live(cfg: Config) -> Config:
    return dataclasses.replace(cfg, account=dict(cfg.account, mode="live"))


@pytest.fixture(scope="module")
def cfg():
    """The v3.3 book (test_pipeline's synthetic market has no SSO/QLD/SGOV bars): the v4 growth book is off."""
    return growth.with_enabled(load_config(), False)


@pytest.fixture(scope="module")
def year_end(tmp_path_factory, cfg):
    """The synthetic market from launch (29 Sep 2025) to 31 Dec 2025, run once for the module."""
    state_dir = tmp_path_factory.mktemp("reports") / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    _run_until(cfg, state_dir, SynthProvider(), Recorder(), "2025-12-31")
    return state_dir


@pytest.fixture()
def world(year_end, tmp_path):
    state_dir = tmp_path / "state"
    shutil.copytree(year_end, state_dir)
    return state_dir, SynthProvider(), Recorder()


# ------------------------------------------------------------------------------------------ pure math

def test_normal_cdf_and_chi_square_tails():
    assert reports.norm_cdf(0.0) == pytest.approx(0.5)
    assert reports.norm_cdf(reports.Z90) == pytest.approx(0.95, abs=1e-9)
    assert reports.chi2_sf(3.841459, 1) == pytest.approx(0.05, abs=1e-6)
    assert reports.chi2_sf(5.991465, 2) == pytest.approx(0.05, abs=1e-6)
    with pytest.raises(ValueError):
        reports.chi2_sf(1.0, 3)


def test_edge_posterior_is_track_18s_formula():
    # P(s > 0) = Φ(n·ŝ / √(n + 1/0.1²)): 30 trades at a per-trade Sharpe of 0.2 give about 70%
    assert reports.edge_posterior(30, 0.2) == pytest.approx(reports.norm_cdf(30 * 0.2 / math.sqrt(130)))
    assert reports.edge_posterior(30, 0.2) == pytest.approx(0.70, abs=0.01)
    assert reports.edge_posterior(50, 0.0) == pytest.approx(0.5)
    assert reports.edge_posterior(50, -0.1) < 0.5
    assert reports.edge_posterior(0, 0.3) is None and reports.edge_posterior(10, None) is None
    # the sceptical prior: the same Sharpe on 5 trades says far less than on 200
    assert reports.edge_posterior(5, 0.3) < 0.7 < reports.edge_posterior(200, 0.3)


def test_edge_evidence_pools_usable_families_in_sharpe_units():
    a = [0.02, -0.01, 0.03, 0.01, 0.00, 0.02, -0.02, 0.04, 0.01, 0.02]
    b = [5.0, -3.0, 4.0, 6.0, -2.0, 7.0]                       # a much wider family: same weight per unit
    out = reports.edge_evidence({"A": a, "B": b, "few": [0.1, 0.2], "flat": [0.01] * 8}, min_units=5)
    rows = {r["family"]: r for r in out["families"]}
    assert rows["few"]["usable"] is False and rows["few"]["p_positive"] is None
    assert rows["flat"]["usable"] is False                     # no variation: no Sharpe
    s_a = np.mean(a) / np.std(a, ddof=1)
    s_b = np.mean(b) / np.std(b, ddof=1)
    assert rows["A"]["sharpe"] == pytest.approx(s_a)
    assert out["units"] == 16 and out["sharpe"] == pytest.approx((10 * s_a + 6 * s_b) / 16)
    assert out["p_positive"] == pytest.approx(reports.edge_posterior(16, out["sharpe"]))
    # paper units at half weight count as half a unit each
    half = reports.edge_evidence({"A": [(x, 0.5) for x in a]}, min_units=5)
    assert half["weight"] == pytest.approx(5.0)
    assert half["p_positive"] == pytest.approx(reports.edge_posterior(5.0, s_a))
    assert reports.edge_evidence({})["p_positive"] is None


def test_kappa_starts_at_the_prior_updates_and_is_clipped():
    prior = reports.kappa_posterior([])
    assert prior["prior_only"] and prior["mean"] == pytest.approx(0.35) and prior["kappa"] == pytest.approx(0.35)
    assert prior["lo80"] == pytest.approx(0.35 - reports.Z80 * 0.15)
    k, se = reports.kappa_observation([0.01, 0.02, 0.03], 0.02)
    assert k == pytest.approx(1.0) and se == pytest.approx(0.01 / (math.sqrt(3) * 0.02))
    strong = reports.kappa_posterior([(0.9, 0.01)])
    assert strong["mean"] > 0.85 and strong["kappa"] == pytest.approx(0.6)      # clipped to [0.1, 0.6]
    assert reports.kappa_posterior([(-0.5, 0.01)])["kappa"] == pytest.approx(0.1)
    mid = reports.kappa_posterior([(0.2, 0.15)])                                   # equal precision: halfway
    assert mid["mean"] == pytest.approx(0.275)
    assert reports.kappa_observation([0.01], 0.02) is None and reports.kappa_observation([0.1, 0.2], 0.0) is None


def _forecasts(p: float, outcomes: list[int], per_trade: int = 2) -> list[dict]:
    return [{"forecast_id": f"F-{i}", "trade_id": f"T-{i // per_trade}", "module": "M1", "event": "profit", "p": p,
             "outcome": y} for i, y in enumerate(outcomes)]


def test_calibration_in_the_large_design_effect_warning_and_gross_bias():
    ok = reports.calibration_in_the_large(_forecasts(0.75, [1] * 30 + [0] * 10))
    assert ok["n"] == 40 and ok["n_eff"] == pytest.approx(20 * 2 / 1.4)          # 20 trades, 2 forecasts each
    assert ok["diff"] == pytest.approx(0.0) and not ok["warning"] and not ok["gross_bias"]
    warn = reports.calibration_in_the_large(_forecasts(0.75, [1] * 22 + [0] * 18))
    assert warn["diff"] == pytest.approx(-0.2) and warn["warning"] and not warn["gross_bias"]
    gross = reports.calibration_in_the_large(_forecasts(0.75, [1] * 12 + [0] * 28))
    assert gross["warning"] and gross["gross_bias"] and gross["hi90"] < -0.2
    few = reports.calibration_in_the_large(_forecasts(0.75, [0] * 6))           # a big miss, too few to flag
    assert few["diff"] == pytest.approx(-0.75) and not few["warning"] and not few["enough"]
    assert reports.calibration_in_the_large([])["n"] == 0
    junk = [{"p": "x", "outcome": 1}, {"p": 0.5, "outcome": None}, {"p": 1.5, "outcome": 1}, None]
    assert reports.calibration_in_the_large(junk)["n"] == 0


def _logistic_sample(n: int, stretch: float, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """True probabilities on a grid; stated = the truth stretched in log-odds (stretch > 1 is over-confident)."""
    rng = np.random.default_rng(seed)
    true = rng.choice([0.2, 0.35, 0.5, 0.65, 0.8], n)
    y = (rng.random(n) < true).astype(float)
    logit = np.log(true / (1 - true))
    return 1 / (1 + np.exp(-stretch * logit)), y


def test_lr_gate_platt_map_and_slope():
    p, y = _logistic_sample(3000, 1.0, seed=11)                               # honest odds
    assert reports.miscalibration_lr_test(p, y) > 0.05
    slope = reports.calibration_slope(p, y)
    assert slope["b_lo90"] <= 1.0 <= slope["b_hi90"]
    p2, y2 = _logistic_sample(3000, 2.0, seed=12)                             # over-confident odds
    assert reports.miscalibration_lr_test(p2, y2) < 1e-6
    slope2 = reports.calibration_slope(p2, y2)
    assert slope2["b"] == pytest.approx(0.5, abs=0.08) and slope2["b_hi90"] < 1.0
    a, b = reports.fit_platt(p2, y2)
    assert b < 0.7
    assert abs(reports.apply_platt(a, b, 0.9) - 0.5) < abs(0.9 - 0.5)        # the map pulls extreme odds in
    assert reports.calibration_slope([0.6] * 50, [1, 0] * 25) is None        # one stated value: no slope
    # one stated value: the test has one degree of freedom and compares against the hit rate
    assert reports.miscalibration_lr_test([0.75] * 200, [1] * 100 + [0] * 100) < 1e-6


def _family_forecasts(p: np.ndarray, y: np.ndarray) -> list[dict]:
    return [{"forecast_id": f"F-{i:04d}", "trade_id": f"T-{i}", "p": float(pi), "outcome": int(yi),
             "resolved_date": f"2026-{1 + i * 12 // len(p):02d}-01"} for i, (pi, yi) in enumerate(zip(p, y))]


def test_recalibration_is_gated_at_150_and_by_the_test():
    few = reports.recalibration_review(_forecasts(0.75, [1, 0] * 60))
    assert few["status"] == "identity" and few["n"] == 120 and few["needed"] == 150
    # the gate keeps honest odds almost always and catches over-confident ones almost always (track 10 §4.8)
    honest = [reports.recalibration_review(_family_forecasts(*_logistic_sample(300, 1.0, seed=5000 + s)))["status"]
              for s in range(100)]
    bold = [reports.recalibration_review(_family_forecasts(*_logistic_sample(300, 2.5, seed=6000 + s)))["status"]
            for s in range(100)]
    assert honest.count("recommend map") <= 8 and set(honest) <= {"keep identity", "recommend map"}
    assert bold.count("recommend map") >= 90
    rec = reports.recalibration_review(_family_forecasts(*_logistic_sample(600, 2.5, seed=22)))
    assert rec["status"] == "recommend map" and rec["lr_p"] < 0.05 and rec["oos_gain"] > 0
    assert rec["b"] < 1.0 and rec["mapped"] and all(abs(m["recalibrated"] - 0.5) < abs(m["stated"] - 0.5)
                                                     for m in rec["mapped"] if m["stated"] != 0.5)


def test_base_rate_drift_statuses():
    base = {"win_rate": 0.73, "mean_pct": 0.43}
    assert reports.base_rate_drift([0.01, 0.02], base)["status"] == "too few"
    in_line = reports.base_rate_drift([0.01] * 7 + [-0.01] * 3, base)
    assert in_line["status"] == "in line" and in_line["win_rate"] == pytest.approx(0.7)
    early = reports.base_rate_drift([-0.01] * 8 + [0.01] * 2, base)
    assert early["status"] == "early sign" and "win_rate" in early["flags"]
    drift = reports.base_rate_drift([-0.01] * 100 + [0.01] * 60, base)
    assert drift["status"] == "drift" and drift["n"] == 160
    assert reports.base_rate_drift([0.01] * 10, None)["status"] == "in line"   # nothing to compare against


def test_m2_sleeve_review_triggers():
    calm = [{"return": 0.004, "excess": 0.001 * (-1) ** i} for i in range(40)]
    assert reports.sleeve_review(calm)["status"] == "ok"
    crash = [{"return": 0.01, "excess": 0.005}] * 5 + [{"return": -0.08, "excess": -0.085}] * 3
    rv = reports.sleeve_review(crash)
    assert rv["drawdown"] == pytest.approx(1 - 0.92 ** 3) and rv["status"] == "review"
    bleed = [{"return": -0.002 + 0.001 * (i % 2), "excess": -0.005 + 0.002 * (i % 2)} for i in range(36)]
    out = reports.sleeve_review(bleed)
    assert out["sharpe"] < -0.5 and out["status"] == "pause"
    assert reports.sleeve_review(bleed[:30])["status"] == "ok"                # the pause needs 36 months
    assert reports.sleeve_review([])["sharpe"] is None


def test_periods():
    assert reports.quarter_bounds("2026-Q3") == (date(2026, 7, 1), date(2026, 9, 30))
    assert reports.quarter_bounds("2025-Q4") == (date(2025, 10, 1), date(2025, 12, 31))
    assert reports.last_quarter(date(2026, 10, 1)) == "2026-Q3"
    assert reports.last_quarter(date(2026, 2, 14)) == "2025-Q4"
    assert reports.quarter_of("2026-10") == "2026-Q4" and reports.quarter_of("2026-03-31") == "2026-Q1"
    assert reports.period_end("2026-02") == "2026-02-28" and reports.period_end("2024-02") == "2024-02-29"
    assert reports.period_end("2026-Q1") == "2026-03-31" and reports.period_end("2026") == "2026-12-31"
    assert reports.period_end("2026-10-05") == "2026-10-05" and reports.period_end("") == ""
    assert reports.months_between("2025-09-29", "2025-12-31") == 3
    for bad in ("2026-Q5", "2026Q1", "Q1-2026"):
        with pytest.raises(ValueError):
            reports.quarter_bounds(bad)
    with pytest.raises(ValueError):
        reports.year_bounds("26")


def test_gates_take_overrides_from_an_optional_reports_block(cfg):
    assert reports.gates(cfg)["edge_go_live"] == 0.70 and reports.gates(cfg)["gate_on_time"] == 0.95
    custom = dataclasses.replace(cfg, constitution={**cfg.constitution,
                                                    "reports": {"edge_go_live": 0.8, "not_a_gate": 1}})
    g = reports.gates(custom)
    assert g["edge_go_live"] == 0.8 and "not_a_gate" not in g


# ------------------------------------------------------------------------------------------ generic state

PHASE_B_STATE = {
    "modules": {
        "M1": {"open_trade": None, "history": [{"trade_id": "T-2025-10-15-M1", "entry_date": "2025-10-16",
                                                "exit_date": "2025-10-21", "return": 0.018, "pnl": 106.5}]},
        "M2": {"history": [{"trade_id": "T-2025-10-01-M2", "date": "2025-10-01", "targets": {"SPY": 1.0}}]},
        "M4": {"open_trade": None, "cooldown_until": "2026-01-05", "history": [
            {"trade_id": "T-2025-10-06-M4", "entry_date": "2025-10-07", "exit_date": "2025-10-28", "return": 0.35,
             "pnl": 640.0, "legs": [{"occ": "XSP251219C00660000"}], "contracts": 1}]},
        "W8": {"open_trade": {"trade_id": "T-2025-10-20-W8", "status": "open", "fill_date": "2025-10-21",
                              "legs": [], "contracts": 2, "expiry": "2025-12-19", "exit_date": "2025-11-18"},
               "history": []},
        "W9": {"open_trade": {"trade_id": "T-2025-10-30-W9", "status": "pending_entry", "signal_date": "2025-10-30"},
               "history": [None, "junk", {"note": "no dates"}]},
        "ZZ": "not a dict",
    },
    "shadow": {
        "ST1B": {"open_trade": None, "trades": [{"signal_date": "2025-10-07", "fill_date": "2025-10-08",
                                                 "exit_date": "2025-10-13", "return": 0.015}]},
        "W10": {"events": [{"signal_date": "2025-10-07", "entry_date": "2025-10-08",
                            "scores": {"60": {"exit_date": "2025-12-05", "return": -0.006}}}]},
        "O1": {"open_trade": {"signal_date": "2025-10-29"}, "trades": [
            {"signal_date": "2025-10-01", "exit_date": "2025-10-24", "return": 0.21},
            {"signal_date": "2025-10-09", "exit_date": "2025-10-30", "ret": -0.4}]},
        "M6": {"events": [{"date": "2025-10-11", "kind": "depeg", "venues": 2}, {"venue": "no date"}]},
        "MACRO": {"events": [{"event_date": "2025-10-15", "release": "CPI"}, 42]},
        "EDGAR": {"events": [                          # the EDGAR book: events per setup, scored on the entry basis
            {"setup": "SH3", "signal_date": "2025-10-03", "status": "closed", "exit_date": "2025-10-31",
             "scores": {"follow": {"exit_date": "2025-10-31", "return": 0.012, "basis": "close"}}},
            {"setup": "SH3", "signal_date": "2025-09-02", "status": "closed", "exit_date": "2025-09-30",
             "scores": {"follow": {"exit_date": "2025-09-30", "return": -0.02, "basis": "close"}}},
            {"setup": "SH2", "signal_date": "2025-10-20", "status": "pending_entry", "scores": {}},
            {"filed": "2025-10-03", "form": "13D"}], "seen": {"0001": True}},
        "ETH": {"on": True, "last_week_end": "2025-10-26", "open_trade": None, "trades": []},
        "BROKEN": ["not", "a", "dict"],
    },
}


def test_module_and_shadow_activity_are_generic():
    inside = reports.in_period("2025-10-01", "2025-10-31")
    rows, opened, closed = reports.module_activity(PHASE_B_STATE, inside)
    by = {r["module"]: r for r in rows}
    assert by["M1"] == {"module": "M1", "opened": 1, "closed": 1, "pnl_usd": 106.5}
    assert by["M2"]["opened"] == 1 and by["M2"]["closed"] == 0 and by["M2"]["pnl_usd"] is None
    assert by["M4"]["closed"] == 1 and by["M4"]["pnl_usd"] == 640.0
    assert by["W8"]["opened"] == 1 and "W9" not in by and "ZZ" not in by       # W9 has not filled yet
    assert (opened, closed) == (4, 2)
    all_rows = reports.shadow_activity(PHASE_B_STATE, None, inside)
    shadow = {r["book"]: r for r in all_rows if r["book"] != "EDGAR"}
    assert shadow["O1"]["signals"] == 3 and shadow["O1"]["closed"] == 2
    assert shadow["O1"]["mean_ret"] == pytest.approx((0.21 - 0.4) / 2)          # "ret" is read too
    assert shadow["M6"]["signals"] == 1 and shadow["MACRO"]["signals"] == 1
    assert shadow["W10"]["signals"] == 1 and shadow["W10"]["name"].endswith("60-day score")
    assert "BROKEN" not in shadow
    edgar = {r["setup"]: r for r in all_rows if r["book"] == "EDGAR"}         # one row per setup with activity
    assert edgar["SH3"] == {"book": "EDGAR", "setup": "SH3", "name": "EDGAR SH3 activist Schedule 13D",
                            "enabled": True, "signals": 1, "closed": 1, "mean_ret": pytest.approx(0.012)}
    assert edgar["SH2"]["signals"] == 1 and edgar["SH2"]["closed"] == 0 and edgar["SH2"]["mean_ret"] is None
    assert set(edgar) == {"SH2", "SH3"}
    quiet = reports.shadow_activity(PHASE_B_STATE, None, reports.in_period("2024-01-01", "2024-01-31"))
    assert [r for r in quiet if r["book"] == "EDGAR"] == [
        {"book": "EDGAR", "name": reports.SHADOW_LABELS["EDGAR"], "enabled": True, "signals": 0, "closed": 0,
         "mean_ret": None}]
    trades = reports.open_trades(PHASE_B_STATE)
    assert {t["module"] for t in trades} == {"W8", "W9"}


def test_monthly_report_handles_phase_b_modules_and_books(cfg, tmp_path):
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider, rec = SynthProvider(), Recorder()
    _run_until(cfg, state_dir, provider, rec, "2025-10-31")
    st = _state(state_dir)
    for name, mod in PHASE_B_STATE["modules"].items():
        if name not in ("M1", "M2"):
            st["modules"][name] = mod
    for name, book in PHASE_B_STATE["shadow"].items():
        if name not in ("ST1B", "W10"):
            st["shadow"][name] = book
    st["modules"]["W10"]["disabled"] = {"date": "2025-10-30", "reason": "one W10 trade lost -16.0%"}
    (state_dir / "state.json").write_text(json.dumps(st))
    res = pipeline.run_monthly(cfg, provider, state_dir, month="2025-10", services=rec.services())
    assert res.status == "ok"
    email = [e for e in rec.sent if e.meta.get("kind") == "MONTHLY"][-1]
    assert validate(email) == []
    report = _review_records(state_dir, "monthly")[-1]
    by = {r["module"]: r for r in report["trades"]}
    assert by["M4"]["closed"] == 1 and by["W8"]["opened"] == 1
    books = {r["book"]: r for r in report["shadow"]}
    assert books["O1"]["closed"] == 2 and books["M6"]["signals"] == 1
    assert report["stage"] == "paper" and report["next_quarterly"] == "2025-Q4"
    assert report["edge_threshold"] == 0.7 and report["edge_binding"] is False
    assert {"module": "W10", "date": "2025-10-30", "reason": "one W10 trade lost -16.0%"} in report["paused_modules"]
    f = flat(email.text)
    assert "Trend-filtered put credit spread (M7) 3 2 −9.5%" in f        # the book's name from its config block
    assert re.search(r"\bM4\b[^$]{0,60}? 1 1 \+\$640", f)                     # a closed spread trade in the table
    assert "Chance of a real edge (the same rules run wide) at least 70%" in f
    assert "W8 T-2025-10-20-W8 (open); W9 T-2025-10-30-W9 (entry order waiting)." in f
    assert "Back in the shadow ledger by a kill switch: W10 since Thu 30 Oct 2025" in f
    assert "Stage: paper. The next quarterly review (Q4 2025)" in f


# ------------------------------------------------------------------------------------------ the reviews

def test_quarterly_review_end_to_end(cfg, world):
    state_dir, provider, rec = world
    before = _state(state_dir)
    res = reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    assert res.status == "ok" and res.date == "2025-Q4"
    email = rec.sent[-1]
    assert email.meta["kind"] == "QUARTERLY" and email.meta["quarter"] == "2025-Q4"
    assert email.subject.startswith("[PAPER][QUARTERLY] Q4 2025 review")
    assert validate(email) == []
    assert in_order(email.text, [
        "PROBLEMS FIRST", "GO-LIVE AND RAMP (YOU DECIDE)", "RESULTS THIS QUARTER", "EDGE EVIDENCE: THE SAME RULES RUN WIDE",
        "CLAIMED VS REALISED EDGE", "COSTS AND SLIPPAGE", "CALIBRATION: ARE THE STATED ODDS HONEST?", "BASE-RATE DRIFT",
        "RECALIBRATION MAPS", "KILL SWITCHES AND MODULE REVIEWS",
        "SHADOW BOOKS (RULES TRACKED ON PAPER ONLY, NEVER EMAILED)", "RULE CHANGES"])
    st = _state(state_dir)
    assert st["runs"]["quarterly:2025-Q4"]["status"] == "ok"
    assert st["modules"] == before["modules"] and st["broker"] == before["broker"]   # reviews change no rule or book
    ok, why = Ledger(state_dir / "ledger.jsonl").verify()
    assert ok, why
    report = _review_records(state_dir, "quarterly")[-1]
    assert report["quarter"] == "2025-Q4" and report["months_elapsed"] == 3
    assert report["changes"] == [] and report["stage"] == "paper"
    assert report["go_live_ready"] is False                                       # nobody recorded a fill
    again = reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    assert again.status == "already_done"


def test_quarterly_evidence_matches_the_state_and_ledger(cfg, world):
    state_dir, provider, rec = world
    reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    report = _review_records(state_dir, "quarterly")[-1]
    st = _state(state_dir)
    fams = {f["family"]: f for f in report["edge_families"]}
    assert fams["ST1B"]["units"] == len(st["shadow"]["ST1B"]["trades"])
    assert fams["M3"]["units"] == len(st["modules"]["M3"]["history"])
    m2_signals = [r for r in _records(state_dir) if r["record_type"] == "signal"
                  and r["payload"].get("module") == "M2" and r["payload"].get("check") == "monthly"]
    legs = sum(1 for r in m2_signals for v in r["payload"]["targets"].values() if v > 0)
    assert 0 < fams["M2"]["units"] <= legs
    fills = [r["payload"] for r in _records(state_dir) if r["record_type"] == "fill"
             and r["payload"].get("type") != "dividend" and "2025-10-01" <= r["payload"]["fill_date"] <= "2025-12-31"]
    assert report["costs"]["fills"] == len(fills)
    expected_cost = sum(abs(f["price"] - f["ref_price"]) * f["qty"] * f["multiplier"] for f in fills)
    assert report["costs"]["cost_usd"] == pytest.approx(expected_cost)
    assert report["kappa"]["prior_only"] and report["kappa"]["kappa"] == pytest.approx(0.35)
    assert report["nav"] == pytest.approx(st["marks"][-1]["nav"])
    assert report["module_reviews"]["m2"]["months"] >= 2
    assert {d["family"] for d in report["drift"]} >= {"M1", "W10", "ST1B", "W10@60", "W10@90"}


def test_quarterly_gate_counts_recorded_fills(cfg, world):
    state_dir, provider, rec = world
    for issue in _state(state_dir)["issues"]:
        rec.comments[issue["url"]] = ["skipped"]
    reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    report = _review_records(state_dir, "quarterly")[-1]
    assert report["emails_handled_rate_to_date"] == pytest.approx(1.0)
    assert report["gate_checks"]["emails_handled"] is True
    assert report["fills_ok_to_date"] is None and report["ops_ok"] is None       # fills not measured: fail closed
    assert "Emails handled (fill or skip recorded) at least 90% 100% yes" in flat(rec.sent[-1].text)


def _practice_fills(state_dir: Path, rec, worse: list[float]) -> int:
    """Comment a practice fill on every single-order issue that has a paper fill: the i-th at `worse[i]` (a fraction,
    worse for the owner; 0 after the list ends). Other issues get "skipped". Returns the number of fills commented."""
    st = _state(state_dir)
    by_key: dict[tuple, list[dict]] = {}
    for f in st.get("fills", []):
        by_key.setdefault((f["trade_id"], f["ticker"]), []).append(f)
    n = 0
    for i in st["issues"]:
        ms = [f for f in by_key.get((i["trade_id"], i["tickers"][0]), []) if f["fill_date"] > i["date"]]
        if len(i["tickers"]) == 1 and ms:
            f, w = ms[0], (worse[n] if n < len(worse) else 0.0)
            px = f["price"] * (1 + w if f["side"] == "buy" else 1 - w)
            rec.comments[i["url"]] = [f"filled {abs(f['dollars']):.0f} @ {px:.4f}"]
            n += 1
        else:
            rec.comments[i["url"]] = ["skipped"]
    return n


def test_quarterly_fills_gate_is_the_average_gap(cfg, world):
    """Track 18 §5.4(3): ETF practice fills at 0, 0, +60 and 0 bp have a median |gap| of 0 bp (the old gate passed
    them) but average +15 bp to date, beyond the 10 bp the rule allows; the quarter's three average +20 bp."""
    state_dir, provider, rec = world
    assert _practice_fills(state_dir, rec, [0.0, 0.0, 0.0060]) == 4          # the first one is Q3's (30 Sep)
    reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    report = _review_records(state_dir, "quarterly")[-1]
    assert report["median_fill_gap_bps_to_date"] == pytest.approx(0.0, abs=0.01)
    assert report["mean_fill_gap_bps_to_date"] == pytest.approx(15.0, abs=0.01) and report["fill_n_to_date"] == 4
    assert report["fills_ok_to_date"] is False and report["go_live_ready"] is False
    assert report["costs"]["mean_gap_bps"] == pytest.approx(20.0, abs=0.01)
    email = rec.sent[-1]
    assert validate(email) == []
    f = flat(email.text)
    assert "Practice fills match the fill model yes no no" in f
    assert ("Practice fills differ from the fill model by more than the pre-registered rule allows: ETF fills average "
            "+15.0 bp against the model over 4 fills (above zero is worse for you; the rule allows at most 10 bp).") in f
    assert "3 ETF fills measured, a median gap of 0.0 bp and an average of +20.0 bp (above zero means worse for you; " \
           "the go-live rule allows an average of at most 10 bp)." in f


def test_quarterly_spread_fills_are_held_to_the_half_spread_rule(cfg, world):
    """An M4 fill typed as the email's own total ("filled 2 @ 1490") reads as $7.45 a share, not $14.90; the spread
    statistic (count, median, average in half-spreads) is shown beside the ETF one."""
    state_dir, provider, rec = world
    _practice_fills(state_dir, rec, [])
    st = _state(state_dir)
    url = "https://github.com/example/repo/issues/999"
    st["issues"].append({"url": url, "trade_id": "T-2025-11-20-M4", "kind": "NEW_TRADE", "module": "M4",
                         "date": "2025-11-20", "tickers": ["XSP"], "intents": ["O-2025-11-20-M4-0001"]})
    st["fills"].append({"intent_id": "O-2025-11-20-M4-0001", "trade_id": "T-2025-11-20-M4", "module": "M4",
                        "ticker": "XSP", "side": "buy", "price": 7.45, "dollars": 1490.0, "fill_date": "2025-11-21",
                        "qty": 2.0, "order_type": "spread_limit", "ref_price": 7.30, "multiplier": 100,
                        "natural_width": 0.5, "fill_time": "10:17", "attempt": "limit", "reason": "x"})
    (state_dir / "state.json").write_text(json.dumps(st))
    rec.comments[url] = ["filled 2 @ 1490"]
    reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    report = _review_records(state_dir, "quarterly")[-1]
    assert report["spread_fill_n_to_date"] == 1 and report["spread_mean_fill_gap_half_spread_to_date"] == 0.0
    assert report["spread_fills_ok_to_date"] is True and report["fills_ok_to_date"] is True
    assert report["costs"]["spread_practice_fills"] == 1
    email = rec.sent[-1]
    assert validate(email) == []
    f = flat(email.text)
    assert "Practice fills match the fill model yes yes yes" in f and "PROBLEMS FIRST None this quarter" in f
    assert ("Option spread fills against the model: 1 measured, a median gap of 0 bp of the net price and an average "
            "of 0% of the half-spread over the 1 with a stored quote width (the go-live rule allows an average of at "
            "most 20%).") in f
    rec.comments[url] = ["filled 2 @ 0"]                     # a typo is set aside with its reason, never measured
    reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", dry_run=True, force=True,
                          services=rec.services())
    f = flat(rec.sent[-1].text)
    assert ('1 fill comment was set aside as a typo, so it doesn\'t count: "filled 2 @ 0" (the price must be above '
            "zero). Correct it on the trade's issue.") in f
    assert validate(rec.sent[-1]) == []


def test_implementation_shortfall_is_per_module_family():
    """One option trade can't flip the ramp's shortfall: ETF returns and returns on a spread's debit are not pooled."""
    g = reports.gates(None)
    state = {"runs": {"daily:2026-01-05": {"emails": [{"subject": "[LIVE][TRADE T-1] BUY", "kind": "NEW_TRADE",
                                                       "trade_id": "T-1"}]}}, "modules": {}}
    run = SimpleNamespace(state=state)
    gate = {"fill_gaps_to_date": [{"gap_bps": 6.0}] * 30}            # ETF practice fills 6 bp worse on average
    m1 = [{"trade_id": f"T-M1-{i}", "entry": "2026-02-01", "exit": "2026-02-10", "return": 0.003, "pnl": 18.0}
          for i in range(30)]
    m4_win = [{"trade_id": "T-M4", "entry": "2026-03-01", "exit": "2026-05-28", "return": 1.18, "pnl": 2059.0}]
    m4_loss = [dict(m4_win[0], **{"return": -1.0, "pnl": -1678.0})]
    results = []
    for closed in ({"M1": m1}, {"M1": m1, "M4": m4_win}, {"M1": m1, "M4": m4_loss}):
        ev = reports.Evidence(asof="2027-06-30", default_rate=0.04, closed=closed)
        results.append(reports.ramp_review(run, ev, g, gate, {"kappa": 0.3, "prior_only": False}, {"verified": False}))
    for r in results:                                    # 2 x 6 bp against a 30 bp edge: 40%, whatever M4 did
        assert r["shortfall"] == pytest.approx(0.40) and r["half"]["shortfall"] is False
        assert r["paper_edge_bps"] == pytest.approx(30.0) and r["shortfall_family"] == "etfs"
    assert results[1]["shortfall_by_family"]["spreads"] == {
        "label": "option spreads", "trades": 1, "paper_edge_bps": pytest.approx(11800.0), "fills": 0,
        "cost_bps": None, "shortfall": None}                         # no spread practice fills: not measured
    with_spread_fills = dict(gate, fill_gaps_to_date=[{"gap_bps": 1.0}] * 30,
                             spread_fill_gaps_to_date=[{"gap_bps": 100.0}] * 4)
    ev = reports.Evidence(asof="2027-06-30", default_rate=0.04, closed={"M1": m1, "M4": m4_win})
    r = reports.ramp_review(run, ev, g, with_spread_fills, {"kappa": 0.3, "prior_only": False}, {"verified": False})
    fams = r["shortfall_by_family"]
    assert fams["etfs"]["shortfall"] == pytest.approx(2 / 30) and fams["spreads"]["shortfall"] == pytest.approx(
        200 / 11800)
    assert r["half"]["shortfall"] is True and r["shortfall_family"] == "etfs"   # the worst family is reported


def test_kappa_ramp_check_needs_data():
    """κ̂ on the prior alone (0.35 >= 0.2) is not evidence: the check is not measured, so the ramp cannot pass on it."""
    g = reports.gates(None)
    run = SimpleNamespace(state={"runs": {}, "modules": {}})
    ev = reports.Evidence(asof="2027-06-30", default_rate=0.04, closed={})
    prior = reports.ramp_review(run, ev, g, {}, reports.kappa_posterior([]), {"verified": False})
    assert prior["kappa"] == pytest.approx(0.35) and prior["kappa_prior_only"] and prior["half"]["kappa"] is None
    data = reports.ramp_review(run, ev, g, {}, reports.kappa_posterior([(0.3, 0.05)]), {"verified": False})
    assert data["half"]["kappa"] is True and not data["kappa_prior_only"]
    email = render_quarterly({"quarter": "2027-Q2", "label": "Q2 2027", "stage": "live", "ramp": prior}, {})
    assert "κ̂ (realised over claimed edge) at least 0.2 0.35 (the starting view only) not measured" in flat(email.text)
    assert validate(email) == []


def test_tbill_returns_cover_the_same_span_as_the_portfolio(cfg, world):
    """The first year starts at the paper phase's start: "this year" and "since start" are one span, one T-bill
    return (not +1.03% against +1.02%)."""
    state_dir, provider, rec = world
    reports.run_annual(cfg, provider, state_dir, year="2025", services=rec.services())
    annual = _review_records(state_dir, "annual")[-1]
    assert annual["tbill_ret_period"] == pytest.approx(annual["tbill_ret_since_start"])
    reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    q = _review_records(state_dir, "quarterly")[-1]
    marks = _state(state_dir)["marks"]
    prev = [m["date"] for m in marks if m["date"] < "2025-10-01"][-1]            # the NAV the quarter starts from
    days = (date.fromisoformat(q["asof"]) - date.fromisoformat(prev)).days
    created = date.fromisoformat(_state(state_dir)["created"][:10])
    assert q["tbill_ret_period"] == pytest.approx(q["tbill_ret_since_start"] * days
                                                  / (date.fromisoformat(q["asof"]) - created).days)


def test_annual_hurdle_line_names_the_policy_modules_from_the_config(cfg, world):
    state_dir, provider, rec = world
    reports.run_annual(cfg, provider, state_dir, year="2025", services=rec.services())
    f = flat(rec.sent[-1].text)
    assert "every module so far is a policy module" not in f
    # design v4 (Phase C1): the constitution's `status` keys name the v3.3 modules' new statuses, and
    # reports.module_statuses reads them whether or not the growth book is on. (Under v4 W10 and the growth book are
    # the policy modules; how the annual report should say so is for the integrator, docs/phase-c/replay.md.)
    assert ("Neither bound this year. M1 (shadow), M2 (retired), M3 (superseded_by: G2), W10 (active), M4 (shadow), "
            "W8 (shadow) and W9 (shadow) are not policy modules.") in f
    only_policy = render_annual({"year": "2026", "label": "2026", "hurdle_bp": 6, "budget": 100,
                                 "module_statuses": [{"module": "M1", "status": "policy module", "policy": True}]}, {})
    assert "Every enabled module is a policy module, which the hurdle exempts." in flat(only_policy.text)
    assert validate(only_policy) == []


def test_quarterly_dry_run_and_force(cfg, world):
    state_dir, provider, rec = world
    before = (state_dir / "state.json").read_bytes(), (state_dir / "ledger.jsonl").read_bytes()
    res = reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", dry_run=True, services=rec.services())
    assert res.status == "ok" and res.dry_run and rec.sent
    assert ((state_dir / "state.json").read_bytes(), (state_dir / "ledger.jsonl").read_bytes()) == before
    reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    forced = reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", force=True, services=rec.services())
    assert forced.status == "ok"
    assert any(r["record_type"] == "correction" and r["payload"].get("run") == "quarterly:2025-Q4"
               for r in _records(state_dir))


def test_annual_review_end_to_end(cfg, world):
    state_dir, provider, rec = world
    res = reports.run_annual(cfg, provider, state_dir, year="2025", services=rec.services())
    assert res.status == "ok" and res.date == "2025"
    email = rec.sent[-1]
    assert email.meta["kind"] == "ANNUAL" and email.subject.startswith("[PAPER][ANNUAL] 2025 review with you")
    assert validate(email) == []
    assert in_order(email.text, [
        "PROBLEMS FIRST", "DECISIONS FOR YOU", "THE YEAR'S RESULTS", "CALIBRATION SLOPE", "RETIREMENTS",
        "W10: THE ANNUAL RE-DECISION", "M2: REVIEW AND PAUSE TRIGGERS", "HURDLE AND TRADE BUDGET", "RULE CHANGES"])
    f = flat(email.text)
    assert "Keep W10 as a policy module (the default)" in f
    assert "60 days 1" in f and "Reference since 1993" in f                    # the record at 60 and 90 days
    report = _review_records(state_dir, "annual")[-1]
    assert report["w10"]["record"]["60"]["scored"] == 1 and report["w10"]["record"]["90"]["scored"] == 0
    assert report["w10"]["recommendation"] == "keep"
    assert report["trades_year"] == _state(state_dir)["counters"]["trades"]["2025"]
    assert {r["module"]: r["status"] for r in report["retirement"]}["M1"] == "too early"
    assert report["budget"] == cfg.risk["trade_budget_per_year"]
    assert _state(state_dir)["runs"]["annual:2025"]["status"] == "ok"


def test_reviews_after_decembers_monthly_review(cfg, world):
    state_dir, provider, rec = world
    monthly = pipeline.run_monthly(cfg, provider, state_dir, month="2025-12", services=rec.services())
    quarterly = reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q4", services=rec.services())
    annual = reports.run_annual(cfg, provider, state_dir, year="2025", services=rec.services())
    assert [r.status for r in (monthly, quarterly, annual)] == ["ok", "ok", "ok"]
    kinds = [e.meta.get("kind") for e in rec.sent[-3:]]
    assert kinds == ["MONTHLY", "QUARTERLY", "ANNUAL"] and all(validate(e) == [] for e in rec.sent[-3:])
    assert "The next quarterly review (Q4 2025) comes right after this review" in flat(rec.sent[-3].text)
    st = _state(state_dir)
    assert not [a for a in st["alerts"] if a["kind"] == "validator"]
    assert Ledger(state_dir / "ledger.jsonl").verify()[0]


def test_review_periods_are_validated_and_default_to_the_last_one(cfg, world, monkeypatch):
    state_dir, provider, rec = world
    with pytest.raises(pipeline.RunError):
        reports.run_quarterly(cfg, provider, state_dir, quarter="2025-Q5", services=rec.services())
    with pytest.raises(pipeline.RunError):
        reports.run_annual(cfg, provider, state_dir, year="25", services=rec.services())
    monkeypatch.setattr(reports, "today_et", lambda: date(2026, 1, 2))
    assert reports.run_quarterly(cfg, provider, state_dir, dry_run=True, services=rec.services()).date == "2025-Q4"
    assert reports.run_annual(cfg, provider, state_dir, dry_run=True, services=rec.services()).date == "2025"


def test_live_mode_shows_the_ramp(cfg, world):
    state_dir, provider, rec = world
    st = _state(state_dir)
    for key, run in st["runs"].items():                        # pretend the account went live on 1 Nov
        if key.startswith("daily:") and key >= "daily:2025-11-01":
            for e in run.get("emails", []):
                e["subject"] = e["subject"].replace("[PAPER]", "[LIVE]", 1)
    live = reports.live_record(st, "2025-12-31")
    assert live == {"since": "2025-11-03", "trade_ids": {"T-2025-11-03-M2"}}      # November's rebalance
    (state_dir / "state.json").write_text(json.dumps(st))
    res = reports.run_quarterly(_live(cfg), provider, state_dir, quarter="2025-Q4", services=rec.services())
    assert res.status == "ok"
    email = rec.sent[-1]
    assert email.subject.startswith("[LIVE][QUARTERLY]") and validate(email) == []
    f = flat(email.text)
    assert "Ramp to half size" in f and "Ramp to full size:" in f and "Calibration verified" in f
    report = _review_records(state_dir, "quarterly")[-1]
    ramp = report["ramp"]
    assert ramp["live_since"] == "2025-11-03" and ramp["live_trades"] == 1 and ramp["live_months"] == 1
    assert ramp["half"]["live_trades"] is False and ramp["half_ok"] is False and ramp["full_ok"] is False
    assert ramp["resolved_weighted"] > 0


def test_live_record_reads_the_live_entry_emails():
    runs = {"daily:2026-03-02": {"emails": [{"subject": "[PAPER][TRADE T-2026-03-02-M1] BUY", "kind": "NEW_TRADE",
                                             "trade_id": "T-2026-03-02-M1"}]},
            "daily:2026-04-01": {"emails": [{"subject": "[LIVE][TREND T-2026-04-01-M2] Trend book", "kind": "REBALANCE",
                                             "trade_id": "T-2026-04-01-M2"},
                                            {"subject": "[LIVE][EXIT T-2026-03-02-M1] SELL", "kind": "EXIT",
                                             "trade_id": "T-2026-03-02-M1"}]},
            "monthly:2026-04": {"emails": [{"subject": "[LIVE][MONTHLY] April", "kind": "MONTHLY"}]},
            "daily:2026-06-01": {"emails": [{"subject": "[LIVE][TRADE T-2026-06-01-M1] BUY", "kind": "NEW_TRADE",
                                             "trade_id": "T-2026-06-01-M1"}]}}
    out = reports.live_record({"runs": runs}, "2026-05-31")
    assert out == {"since": "2026-04-01", "trade_ids": {"T-2026-04-01-M2"}}


# ------------------------------------------------------------------------------------------ rendering

def test_render_sparse_reviews_validate():
    q = render_quarterly({"quarter": "2026-Q3", "label": "Q3 2026"}, {})
    assert q.subject.startswith("[PAPER][QUARTERLY] Q3 2026 review") and validate(q) == []
    a = render_annual({"year": "2026", "label": "2026"}, {})
    assert a.subject.startswith("[PAPER][ANNUAL] 2026 review with you") and validate(a) == []
    assert render_quarterly({}, {}).meta["kind"] == "QUARTERLY" and validate(render_annual({}, {"mode": "live"})) == []


def test_render_quarterly_puts_problems_first_and_registers_every_number():
    problems = [
        {"kind": "validator", "n": 1},
        {"kind": "data", "n": 2, "notes": ["nasdaq second source down on 2026-08-14"]},
        {"kind": "late_runs", "late": 2, "expected": 64},
        {"kind": "calibration_warning", "family": "M1 closes with a profit", "mean_p": 0.75, "hit_rate": 0.55,
         "n": 40},
        {"kind": "drift", "family": "ST-1b (M1 without the VIX gate)", "win_rate": 0.55, "base_win_rate": 0.73,
         "mean_pct": 0.1, "base_mean_pct": 0.43, "n": 160},
        {"kind": "kill_switch", "module": "W10", "date": "2026-08-05", "reason": "one W10 trade lost -16.0%"},
        {"kind": "m2_pause", "drawdown": 0.08, "review_drawdown": 0.2, "sharpe": -0.61, "pause_sharpe": -0.5,
         "window": 36},
        {"kind": "unknown_kind"},
    ]
    report = {"quarter": "2026-Q3", "label": "Q3 2026", "problems": problems, "failures": ["send failed for T-1"],
              "edge_p": 0.63, "edge_units": 212, "edge_threshold": 0.7, "edge_binding": False, "edge_min_units": 5,
              "gate_months": 3, "months_elapsed": 11, "trades_to_date": 17, "gate_trades": 30}
    email = render_quarterly(report, {"constitution_version": "3.4.0"})
    assert validate(email) == []
    assert "— 8 problems —" in email.subject
    text = email.text
    section = flat(text[text.index("PROBLEMS FIRST"):text.index("GO-LIVE AND RAMP")])
    for s in ("The validator blocked 1 email.", "2 data problems: nasdaq second source down on 2026-08-14.",
              "2 of 64 scheduled runs were late or missing.", "the forecasts said 75% and 55% came true (40 scored)",
              "Base-rate drift in ST-1b (M1 without the VIX gate): 55% won against a base rate of 73%",
              "W10 went back to the shadow ledger on Wed 5 Aug: one W10 trade lost -16.0%.",
              "below −0.5: the design says pause it to the shadow ledger. You decide.", "send failed for T-1"):
        assert s in section, s
    assert "Chance of a real edge (the same rules run wide) at least 70% 63% advisory" in flat(text)
    assert "61%" not in email.numbers_registered
    tampered = dataclasses.replace(email, text=text.replace("63%", "61%"))
    assert any('"61%"' in p for p in validate(tampered))


def test_render_monthly_edge_row_binds_after_thirty_trades():
    from test_emails import monthly_report
    advisory = render_monthly(monthly_report(edge_p=0.64, edge_units=40, edge_threshold=0.7, edge_binding=False,
                                             stage="paper", next_quarterly="2026-Q4"), {})
    f = flat(advisory.text)
    assert "Chance of a real edge (the same rules run wide) at least 70% 64% advisory" in f
    assert "GATE 4 of 6 go-live checks pass" in f
    assert "Stage: paper. The next quarterly review (Q4 2026) comes after its last monthly review" in f
    assert validate(advisory) == []
    binding = render_monthly(monthly_report(edge_p=0.74, edge_units=240, edge_threshold=0.7, edge_binding=True,
                                            trades_to_date=31, fills_ok_to_date=True), {})
    fb = flat(binding.text)
    assert "at least 70% 74% yes" in fb and "GATE 6 of 7 go-live checks pass" in fb
    assert validate(binding) == []
    few = render_monthly(monthly_report(edge_units=0), {})
    assert "too few results advisory" in flat(few.text) and validate(few) == []


# ------------------------------------------------------------------------------------------ the workflow

def _steps() -> list[dict]:
    return yaml.safe_load(WORKFLOW.read_text())["jobs"]["monthly"]["steps"]


def test_workflow_runs_the_quarterly_and_annual_reviews_after_the_monthly():
    steps = _steps()
    ids = [s.get("id") for s in steps]
    assert ids.index("plan") < ids.index("review") < ids.index("quarterly") < ids.index("annual") < \
        ids.index("venue_check")
    by = {s.get("id"): s for s in steps}
    assert "steps.plan.outputs.quarter" in by["quarterly"]["if"] and "!cancelled()" in by["quarterly"]["if"]
    assert "steps.plan.outputs.year" in by["annual"]["if"]
    assert "python -m traderec quarterly" in by["quarterly"]["run"] and "--quarter" in by["quarterly"]["run"]
    assert "python -m traderec annual" in by["annual"]["run"] and "--year" in by["annual"]["run"]
    commit = next(s for s in steps if s.get("name") == "Commit state changes")
    assert all(f"steps.{k}.outcome == 'success'" in commit["if"] for k in ("review", "quarterly", "annual"))
    for s in (by["quarterly"], by["annual"]):
        assert s["env"]["HC_PING_URL"] == "${{ secrets.HC_PING_URL_MONTHLY }}"


@pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")
@pytest.mark.parametrize("month, review, force, want", [
    ("2026-09", "auto", "false", {"monthly": "true", "quarter": "2026-Q3", "year": ""}),
    ("2026-12", "auto", "false", {"monthly": "true", "quarter": "2026-Q4", "year": "2026"}),
    ("2026-08", "auto", "false", {"monthly": "true", "quarter": "", "year": ""}),
    ("2026-03", "monthly", "true", {"monthly": "true", "quarter": "", "year": ""}),
    ("", "quarterly", "false", {"monthly": "false", "quarter": "latest", "year": ""}),
    ("2026-12", "annual", "true", {"monthly": "false", "quarter": "", "year": "2026"}),
    ("2026-08", "quarterly", "false", None),                   # August ends no quarter
    ("2026-06", "annual", "false", None),                      # the annual review follows December's
    ("2026-09", "auto", "true", None),                         # force needs one chosen review
    ("2026-13", "auto", "false", None),
])
def test_workflow_plan_step(tmp_path, month, review, force, want):
    plan = next(s for s in _steps() if s.get("id") == "plan")
    out = tmp_path / "out"
    out.write_text("")
    env = dict(os.environ, RUN_MONTH=month, REVIEW=review, FORCE=force, GITHUB_OUTPUT=str(out))
    res = subprocess.run(["bash", "-c", plan["run"]], env=env, capture_output=True, text=True, timeout=30)
    if want is None:
        assert res.returncode != 0 and "::error::" in res.stdout
        return
    if res.returncode != 0 and "date:" in res.stderr:              # pragma: no cover - no GNU date here
        pytest.skip("needs GNU date")
    assert res.returncode == 0, res.stderr
    got = dict(line.split("=", 1) for line in out.read_text().splitlines())
    assert {k: got[k] for k in want} == want


def test_edgar_setups_get_promotion_tests_and_drift_rows():
    """The EDGAR book is reviewed per setup: promotion tests (track 16 §10.2) and base-rate drift (docs/phase-b/edgar.md)."""
    from types import SimpleNamespace
    rets = [0.01, 0.02, -0.005, 0.015, 0.01, 0.0, 0.02, 0.01, -0.01, 0.03, 0.01, 0.02]
    sh2 = [{"setup": "SH2", "signal_date": f"2025-{m:02d}-10", "status": "closed", "exit_date": f"2025-{m:02d}-20",
            "scores": {"dividend": {"exit_date": f"2025-{m:02d}-20", "return": r, "basis": "close"}}}
           for m, r in zip(range(1, 13), rets)]
    sh1 = [{"setup": "SH1", "signal_date": "2025-06-02", "status": "closed", "exit_date": "2025-07-01",
            "filing_reaction": 0.03, "scores": {"follow": {"exit_date": "2025-07-01", "return": -0.004, "basis": "open",
                                                           "close": {"excess": -0.002}}}},
           {"setup": "SH1", "signal_date": "2026-01-05", "status": "closed", "exit_date": "2026-02-03",      # after asof
            "scores": {"follow": {"exit_date": "2026-02-03", "return": 0.5, "basis": "open"}}}]
    state = {"shadow": {"EDGAR": {"events": sh2 + sh1 + [{"setup": "CEF", "signal_date": "2025-11-03",
                                                          "status": "open", "scores": {}}, "junk"]}}}
    cfg = SimpleNamespace(constitution={"shadow": {"EDGAR": {
        "SH2": {"promotion": {"min_trades": 30, "min_mean": 0.005, "min_t": 2.0},
                "base_rate": {"win_rate": 0.52, "mean": 0.0038}},
        "SH1": {"enabled": False, "promotion": {"min_trades": 60, "min_mean": 0.01, "min_t": 2.5,
                                                "max_reaction_median": 0.01},
                "base_rate": {"win_rate": 0.42, "mean": -0.0106}}}}}, risk={})
    run = SimpleNamespace(state=state, cfg=cfg)
    rows = {r["setup"]: r for r in reports.edgar_review(run, "2025-12-31")}
    assert set(rows) == {"SH1", "SH2", "CEF"}
    assert rows["SH2"]["label"] == "EDGAR SH2 special dividend" and rows["SH2"]["enabled"] is True
    assert rows["SH2"]["stats"]["n"] == 12 and rows["SH2"]["passed"] is False and rows["SH2"]["demote"] is False
    checks = {c["name"]: c for c in rows["SH2"]["checks"]}
    assert checks["trades"] == {"name": "trades", "value": 12, "threshold": 30, "ok": False}
    assert checks["mean net excess"]["ok"] is True and checks["median"]["ok"] is True
    assert rows["SH1"]["enabled"] is False and rows["SH1"]["reaction"]["n"] == 1     # the 2026 event is after asof
    assert rows["SH1"]["reaction"]["filing_reaction_median"] == pytest.approx(0.03)
    assert rows["CEF"]["passed"] is None and rows["CEF"]["stats"]["n"] == 0 and "reaction" not in rows["CEF"]
    ev = SimpleNamespace(asof="2025-12-31", closed={}, excess=lambda ret, s, e: ret)
    drift = {r["family"]: r for r in reports.drift_review(run, ev, reports.gates())}
    d = drift["EDGAR/SH2"]
    assert d["kind"] == "shadow" and d["label"] == "EDGAR SH2 special dividend" and d["since"] == 2016
    assert d["n"] == 12 and d["base_win_rate"] == 0.52 and d["base_mean_pct"] == pytest.approx(0.38)
    assert d["win_rate"] == pytest.approx(9 / 12) and d["status"] in ("in line", "early sign")
    assert drift["EDGAR/SH1"]["n"] == 1 and drift["EDGAR/SH1"]["status"] == "too few"    # 2026 not resolved yet
    inside = reports.in_period("2025-01-01", "2025-12-31")
    activity = {r["setup"]: r for r in reports.shadow_activity(state, cfg, inside) if r.get("setup")}
    assert activity["SH2"]["closed"] == 12 and activity["SH2"]["mean_ret"] == pytest.approx(sum(rets) / 12)
    assert activity["SH1"] == {"book": "EDGAR", "setup": "SH1", "name": "EDGAR SH1 insider cluster buy",
                               "enabled": False, "signals": 1, "closed": 1, "mean_ret": pytest.approx(-0.004)}
    assert activity["CEF"]["signals"] == 1 and activity["CEF"]["closed"] == 0
