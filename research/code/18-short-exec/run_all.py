"""Reproduce every table in research/18-short-horizon-execution-sizing-paper.md.

    python3 run_all.py            # everything (~25-35 min on 4 CPUs; downloads yfinance data once)
    python3 run_all.py quick      # skip the two portfolio grids (~3 min)

Outputs: research/code/18-short-exec/results/*.csv and *.md (fixed seeds throughout).
"""
from __future__ import annotations

import sys
import time

import calibration_cadence
import gap_risk
import latency
import paper_protocol
import sim_portfolio
import sim_selection
import sizing_v2
import tax_compare
from util18 import save_table


def main(quick=False):
    t0 = time.time()
    steps = [
        ("gap risk (yfinance)", gap_risk.main),
        ("latency / overnight returns", latency.main),
        ("selection frontier", lambda: (save_table(df := sim_selection.run(), "selection_frontier"),
                                        save_table(sim_selection.frontier_summary(df), "selection_knee"),
                                        save_table(sim_selection.at_fixed_n(df), "selection_at_fixed_n"))),
        ("sizing v2 worked examples", lambda: save_table(sizing_v2.examples(), "sizing_v2_examples")),
        ("paper protocol", lambda: (save_table(paper_protocol.fill_selftest(), "fill_model_selftest"),
                                    save_table(paper_protocol.ledger_demo(), "paper_ledger_demo"),
                                    save_table(paper_protocol.limit_adverse_selection(), "limit_adverse_selection"),
                                    save_table(oc := paper_protocol.oc_simulation(), "paper_pass_rule_oc"),
                                    save_table(paper_protocol.calibration_gate_power(), "paper_calibration_gate_power"),
                                    save_table(paper_protocol.expected_value_of_pilot(oc), "paper_pilot_value"))),
        ("calibration cadence", lambda: (save_table(calibration_cadence.mde_table(), "cadence_mde"),
                                         save_table(calibration_cadence.slope_power(), "cadence_slope_power"),
                                         save_table(calibration_cadence.cusum_delay(), "cadence_cusum"))),
        ("taxes", lambda: (save_table(tax_compare.rate_table(), "tax_rates"),
                           save_table(tax_compare.after_tax_growth(), "tax_after_tax_growth"),
                           save_table(tax_compare.wash_sales(), "tax_wash_sales"))),
    ]
    if not quick:
        steps += [("portfolio grid (main)", lambda: sim_portfolio.run(sim_portfolio.grid_main(), "portfolio_main")),
                  ("portfolio grid (sensitivity)",
                   lambda: sim_portfolio.run(sim_portfolio.grid_sensitivity(), "portfolio_sensitivity"))]
    for name, fn in steps:
        t = time.time()
        fn()
        print(f"[{time.time() - t:6.1f}s] {name}")
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main(quick=len(sys.argv) > 1 and sys.argv[1] == "quick")
