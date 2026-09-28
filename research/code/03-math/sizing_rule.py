"""Reference implementation of the proposed position-sizing rule (track 03).

size = min( k * Kelly(p_shrunk),            # fractional Kelly on a skeptical probability
            Kelly(p_model - delta),         # robustness: stay <= Kelly if p is overstated by delta,
                                    # delta = min(5 pp, p/3)
            per-trade cap,
            remaining cluster / portfolio stress budget / stress loss per $ )
       * drawdown governor G(D)

p_shrunk = p_breakeven + kappa * (p_model - p_breakeven), where kappa is the posterior mean of
the "edge realisation ratio" (realised edge / claimed edge) learned from resolved trades.
A trade is only recommended if its expected log-growth contribution at that size
(computed with p_shrunk, net of costs) clears a hurdle.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from common import save_table


@dataclass
class Policy:
    kappa: float = 0.5          # prior: half of the model's claimed edge is real
    k: float = 0.25             # Kelly multiple (launch); <= 0.5 once proven
    delta_abs: float = 0.05     # probability stress: 5 pp ...
    delta_rel: float = 1 / 3    # ... or one third of p for long shots (whichever is smaller)
    hurdle: float = 0.002       # min expected log-growth contribution per trade (0.2 %)
    min_prob_edge_positive: float = 0.0   # (placeholder for a posterior-probability test)


def kelly(p, b, a):
    return max(0.0, p / a - (1 - p) / b)


def governor(drawdown, start=0.10, floor=0.40):
    """1 until a 10 % drawdown, linear to 0 at a 40 % drawdown from the high-water mark."""
    if drawdown <= start:
        return 1.0
    return max(0.0, (floor - drawdown) / (floor - start))


def size_binary(p_model, b_net, a_stress, cap, pol: Policy, stress_budget_left=1.0, drawdown=0.0):
    p_be = a_stress / (a_stress + b_net)
    p_s = p_be + pol.kappa * (p_model - p_be)
    delta = min(pol.delta_abs, pol.delta_rel * p_model)
    f_frac = pol.k * kelly(p_s, b_net, a_stress)
    f_robust = kelly(p_model - delta, b_net, a_stress)
    f_budget = stress_budget_left / a_stress
    f = min(f_frac, f_robust, cap, f_budget) * governor(drawdown)
    binding = ["fractional Kelly", "robust Kelly (p - delta)", "per-trade cap", "stress budget"][
        int(np.argmin([f_frac, f_robust, cap, f_budget]))]
    dg = p_s * np.log1p(f * b_net) + (1 - p_s) * np.log1p(-f * a_stress) if f > 0 else 0.0
    return dict(p_breakeven=p_be, p_shrunk=p_s, f=f, binding=binding, dg=dg, send=dg >= pol.hurdle)


def demo():
    trades = [
        # name, p_model, net win per $ (after costs), stress loss per $, per-trade cap (fraction of W)
        ("Crisis buy (index after crash)", 0.80, 1.00 - 0.002, 0.50, 1.00),
        ("Trend trade (stake = R to stop)", 0.40, 3.0 - 0.1, 1.0 + 0.1 + 0.1, 0.02 / 1.2),
        ("Convex option (premium)", 0.15, 10.0 * 0.95 - 0.05, 1.0, 0.03),
        ("Binary event 60c vs 50c", 0.60, (1 - 0.51) / 0.51, 1.0, 0.03),
        ("Binary event 55c vs 50c", 0.55, (1 - 0.51) / 0.51, 1.0, 0.03),
    ]
    rows = []
    for label, pol in (("Launch (kappa=0.5, k=0.25)", Policy()),
                       ("Proven (kappa=0.9, k=0.5)", Policy(kappa=0.9, k=0.5))):
        for name, p, b, a, cap in trades:
            r = size_binary(p, b, a, cap, pol)
            rows.append({"Stage": label, "Trade": name, "p (model)": p,
                         "Breakeven p": round(r["p_breakeven"], 3), "p used": round(r["p_shrunk"], 3),
                         "Stake (% of W)": f"{100 * r['f']:.2f}%",
                         "Max loss (% of W)": f"{100 * r['f'] * a:.2f}%",
                         "Binding constraint": r["binding"],
                         "Growth contribution": f"{100 * r['dg']:.2f}%",
                         "Recommend?": "yes" if r["send"] else "no (below 0.2% hurdle)"})
    df = pd.DataFrame(rows)
    save_table(df, "i_sizing_rule_worked_examples")
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 20)
    print(demo().to_string())
