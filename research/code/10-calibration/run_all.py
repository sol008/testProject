"""Reproduce every number in research/10-calibration-and-self-improvement.md.

    cd research/code/10-calibration && python run_all.py          # ~3-5 minutes
    python run_all.py --quick                                     # smaller sims

Writes results/results.json and results/demo_ledger.jsonl; prints tables.
All simulations use fixed seeds.
"""
from __future__ import annotations

import json
import os
import sys
import time

import numpy as np

import power
import simulate
from ledger import Ledger, canonical_json, sha256_hex
from overfitting import (dsr, expected_max_sr, min_btl_years, min_trl, pbo_cscv, psr)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "results")


def overfitting_tables(seed=99):
    rng = np.random.default_rng(seed)
    tab = {}
    tab["expected_max_insample_sr_annual"] = [
        dict(n_trials=n, **{f"T{T}y": expected_max_sr(n, 1.0 / T) for T in (1, 3, 5, 10)})
        for n in (1, 5, 10, 20, 45, 100, 1000)]
    tab["min_backtest_years_for_max_sr_below_1"] = [
        dict(n_trials=n, years=min_btl_years(n, 1.0)) for n in (5, 10, 20, 45, 100, 1000)]
    # DSR of a 36-month live record, annualised SR 1.2, skew -0.3, kurt 4
    T, sr_m = 36, 1.2 / np.sqrt(12)
    tab["dsr_example_36m_sr1.2"] = [
        dict(n_trials=n, sr0_monthly=expected_max_sr(n, 1.0 / T),
             dsr=dsr(sr_m, T, n, 1.0 / T, skew=-0.3, kurt=4.0)) for n in (1, 5, 20, 100)]
    tab["psr_vs_0_36m_sr1.2"] = psr(sr_m, 0.0, T, -0.3, 4.0)
    tab["mintrl_months_sr1.2_vs0"] = min_trl(sr_m, 0.0, -0.3, 4.0)
    # PBO demos (120 months, 50 variants)
    T, N = 120, 50
    noise = rng.normal(0, 0.05, (T, N))
    one_real = noise.copy()
    one_real[:, 0] += 1.0 * 0.05 / np.sqrt(12)
    all_equal = rng.normal(0.5 * 0.05 / np.sqrt(12), 0.05, (T, N))
    graded = rng.normal(0, 0.05, (T, N)) + np.linspace(0, 1.5, N) * 0.05 / np.sqrt(12)
    tab["pbo"] = {
        "all_zero_skill": pbo_cscv(noise)["pbo"],
        "one_real_sr1_among_49_noise": pbo_cscv(one_real)["pbo"],
        "all_equal_sr0.5": pbo_cscv(all_equal)["pbo"],
        "graded_sr_0_to_1.5": pbo_cscv(graded)["pbo"]}
    return tab


def ledger_demo():
    path = os.path.join(OUT, "demo_ledger.jsonl")
    if os.path.exists(path):
        os.remove(path)
    L = Ledger(path)
    counter = iter(range(1, 1000))
    _append = L.append
    L.append = lambda *a, **k: _append(*a, record_id=f"demo-{next(counter):04d}", **k)
    model = dict(llm_id="example-llm-2026-09", prompt_sha256="ab" * 32, code_commit="deadbeef",
                 temperature=0.3, n_samples=7, aggregation="median log-odds")
    const = dict(version="1.0.0", content_sha256=sha256_hex("constitution text v1.0.0"),
                 invariants=["max_risk_per_trade<=0.05", "evaluator_code_frozen",
                             "human_approval_for_tier4"],
                 parameters=dict(kelly_fraction=0.25, prior_strength=50, min_edge_nats=0.02,
                                 change_budget_per_month=2),
                 changelog=["initial version"])
    L.append("constitution", const, as_of="2026-10-01T00:00:00Z", author="human_owner",
             strategy_version="v1.0.0", created_at="2026-10-01T09:00:00.000Z")
    L.append("shadow_candidate", dict(
        candidate_id="c-2026-10-01-001", scan_id="scan-2026-10-01", archetype="pead_long",
        instrument="call_debit_spread", underlying="XYZ", score_raw=2.7, rank=1,
        selection_status="selected", sampling_weight=1.0,
        hypothetical_plan=dict(entry="next open", size=0.03), forecast_ids=["f1", "f2"]),
        as_of="2026-10-01T09:30:00Z", strategy_version="v1.0.0", model=model,
        created_at="2026-10-01T10:00:00.000Z")
    fc = []
    for i, (q, h, p_raw, p_fin, pm) in enumerate([
            ("XYZ total return minus SPY > 0 at 2026-11-02 close", "2026-11-02T21:00:00Z", 0.66, 0.61, 0.52),
            ("XYZ minus SPY > +10% at 2027-01-04 close", "2027-01-04T21:00:00Z", 0.35, 0.29, 0.21)]):
        fid = f"f{i + 1}"
        fc.append(fid)
        L.append("forecast", dict(
            forecast_id=fid, parent_id="c-2026-10-01-001", family="price_threshold_rel",
            question=q, resolution_rule="at_date",
            resolution_criteria=dict(source="vendor:adjusted_close", benchmark="SPY"),
            resolution_date=h, p_raw=p_raw, p_final=p_fin,
            calibration_map="platt:v3(a=-0.04,b=0.78,n=412)",
            baseline=dict(p_market_physical=pm, p_base_rate=0.5, method="option-implied, ERP-adjusted"),
            cluster=dict(trade_id="c-2026-10-01-001", underlying="XYZ", month="2026-10"),
            is_live=True), as_of="2026-10-01T09:30:00Z", strategy_version="v1.0.0", model=model,
            created_at=f"2026-10-01T10:0{i + 1}:00.000Z")
    L.append("resolution", dict(forecast_id="f1", outcome=1, resolved_at="2026-11-02T21:30:00Z",
                                source="vendor:adjusted_close@2026-11-02", status="resolved",
                                resolver="auto"),
             as_of="2026-11-02T21:30:00Z", author="evaluator", strategy_version="v1.0.0",
             created_at="2026-11-02T22:00:00.000Z")
    ok, msg = L.verify()
    head = L.head
    # tamper test: raise a probability after the fact in a copy of the file
    lines = open(path).read().splitlines()
    rec = json.loads(lines[2])
    rec["payload"]["p_final"] = 0.95
    lines[2] = canonical_json(rec)
    tampered = os.path.join(OUT, "demo_ledger_tampered.jsonl")
    open(tampered, "w").write("\n".join(lines) + "\n")
    try:
        Ledger(tampered)
        tamper_detected = False
    except Exception as exc:  # LedgerError
        tamper_detected = str(exc)
    os.remove(tampered)
    # refusal test: a forecast registered after its resolution date
    refused = None
    try:
        L.append("forecast", dict(
            forecast_id="f_late", parent_id="x", family="gym", question="late",
            resolution_rule="at_date", resolution_criteria={}, resolution_date="2026-10-15T00:00:00Z",
            p_raw=0.5, p_final=0.5, calibration_map="identity", baseline={}),
            as_of="2026-11-03T00:00:00Z", created_at="2026-11-03T00:00:00.000Z")
    except Exception as exc:
        refused = str(exc)
    return dict(verify=msg, ok=ok, head=head, tamper_detected=tamper_detected,
                late_forecast_refused=refused, n_records=sum(1 for _ in L.records()))


def main(quick=False):
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    res = {}
    res["power"] = power.tables()
    res["overfitting"] = overfitting_tables()
    res["ledger_demo"] = ledger_demo()
    s = 0.25 if quick else 1.0
    res["A_forecaster_detection"] = simulate.forecaster_detection(n_sims=int(400 * s))
    res["B_permabull_trap"] = simulate.permabull_trap(n_sims=int(2000 * s))
    res["C_peeking"] = simulate.peeking(n_sims=int(20000 * s))
    loops = {}
    for name, kw in {
        "A1_pnl_evidence_K12": dict(),
        "A2_pnl_evidence_K50": dict(K=50),
        "A3_pnl_evidence_all_tweaks_irrelevant": dict(delta_mean=0.0, delta_sd=0.0),
        "A4_pnl_evidence_tweaks_mostly_harmful": dict(delta_mean=-0.002, delta_sd=0.001),
        "B1_surrogate_evidence_K12": dict(sigma_idio=0.0042),
        "B2_surrogate_evidence_all_tweaks_irrelevant": dict(sigma_idio=0.0042, delta_mean=0.0,
                                                            delta_sd=0.0),
    }.items():
        loops[name] = simulate.improvement_loop(n_worlds=int(4000 * s), **kw)
    res["D_improvement_loop"] = loops
    res["E_drawdown_bands"] = simulate.drawdown_bands(n_sims=int(20000 * s))
    res["F_streak_sizing"] = simulate.streak_sizing()
    res["G_archetype_allocation"] = simulate.archetype_allocation(n_worlds=int(400 * s))
    res["H_recalibration"] = simulate.recalibration_curves(n_rep=int(200 * s))
    res["I_cusum_decay"] = simulate.cusum_decay(n_sims=int(20000 * s))
    res["runtime_seconds"] = time.time() - t0
    with open(os.path.join(OUT, "results.json"), "w") as fh:
        json.dump(res, fh, indent=1, default=float)
    print_summary(res)


def _fmt(x):
    return f"{x:.2f}" if isinstance(x, float) else str(x)


def print_summary(res):
    A = res["A_forecaster_detection"]["detection"]
    print("\n=== A. detection rate of 'better than market' (one-sided 5%) ===")
    for kind in A:
        for key in ("live_only|log", "live+shadow|log", "live+shadow+gym|log",
                    "live+shadow+gym|eprocC", "pnl|ttest"):
            rows = A[kind][key]
            vals = [(r["month"], r.get("seq", r.get("detect", r.get("fixed")))) for r in rows]
            print(f"{kind:26s} {key:26s} " + "  ".join(f"m{m}:{v:.2f}" for m, v in vals))
    print("ICC of live sub-question log-score diffs:", res["A_forecaster_detection"].get("icc_live_log"))
    print("\n=== B. permabull trap ===")
    for k, v in res["B_permabull_trap"].items():
        if k != "params":
            print(k, [(r["month"], _fmt(r["claim_skill_iid"]), _fmt(r["claim_skill_month_clustered"])) for r in v])
    print("\n=== C. peeking ===")
    for k, v in res["C_peeking"].items():
        print(k, [(r["month"], _fmt(r["monthly_peeking_ttest"]), _fmt(r["anytime_valid_eprocess"]),
                   _fmt(r["fixed_horizon_single_test"])) for r in v])
    print("\n=== D. improvement loop (bp/month vs static, net of switch cost; switches; P(end worse)) ===")
    for name, r in res["D_improvement_loop"].items():
        print(name)
        for pol in ("oracle", "naive_trailing_3m", "naive_trailing_12m", "guarded_forward_validated"):
            x = r[pol]
            print(f"   {pol:28s} gross {x['vs_static_bp_per_month']:7.1f}  net {x['vs_static_net_of_switch_cost_bp']:7.1f}"
                  f"  switches {x['switches_mean']:5.1f}  end_worse {x['end_worse_than_original']:.2f}")
    print("\n=== E. drawdown bands ===")
    for b in res["E_drawdown_bands"]["bands"]:
        print(f"   {b['model']:52s} {b['months']:3d}m  p50 {b['p50']:.2f} p80 {b['p80']:.2f} p95 {b['p95']:.2f}")
    print("   P(>=5 consecutive losses in 24 trades):", res["E_drawdown_bands"]["p_5plus_consecutive_losses_in_24_trades"])
    print("\n=== G. archetype allocation ===")
    for k, v in res["G_archetype_allocation"].items():
        if k != "params":
            print(k, v)
    print("\n=== H. recalibration ===")
    for k, v in res["H_recalibration"].items():
        print(k, "max gain", round(v["max_possible_gain"], 4))
        for r in v["rows"]:
            print("   ", {kk: (round(vv, 4) if isinstance(vv, float) else vv) for kk, vv in r.items()})
    print("\n=== I. CUSUM ===", res["I_cusum_decay"])
    print("\n=== ledger demo ===", res["ledger_demo"])
    print(f"\nruntime {res['runtime_seconds']:.0f}s")


if __name__ == "__main__":
    main(quick="--quick" in sys.argv)
