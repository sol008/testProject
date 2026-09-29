"""Track 37: what the published LLM news-return effect is worth to one long-only retail account that takes one
position a week at the next open. Two independent routes, both from published numbers to points of NAV a year.

Route A (per trade, in basis points): start from the overnight strategy of Lopez-Lira & Tang (arXiv 2304.07619 v6,
Oct 2021-May 2024): news after the close, enter at the next open, exit at that day's close. Its cost sensitivity
(§6.2, Fig. 4: over +300% cumulative at 5 bp per trade, above +100% at 10 bp, unprofitable at 20 bp) pins the
gross daily long-short return and the turnover. Then: the long leg only (the short leg carries more of the effect),
the size tilt (the effect sits in small stocks), the period level (annualized Sharpe 6.54 in 2021Q4 -> 3.68 in
2022 -> 2.33 in 2023 -> 1.22 in Jan-May 2024; 2.97 overall), the system's own round-trip cost table by market cap
(config shadow.EDGAR.costs, track 16 §1.3), the forward publication haircut (track 02: x0.5), one trade a week at
track 16's 5% single-stock weight.

Route B (breadth): the fundamental law of active management, IR = IC x sqrt(breadth). The published Sharpe comes
from hundreds of names a day; one name a week has a breadth of about 50 a year.

Run: python3 edge_shrinkage.py  -> prints the tables and writes results/edge_scenarios.csv, results/breadth.csv.
Every input is a named constant with its source. Nothing here is a backtest; it is arithmetic on published results.
"""
from __future__ import annotations

import math
import os

import numpy as np
import pandas as pd

# ---- Lopez-Lira & Tang v6, §6.2 Fig. 4 (overnight strategy), read as net daily return vs cost per trade -------------
SESSIONS_IN_SAMPLE = 660          # Oct 2021 - May 2024 (about 32 months)
NET_AT_5BP = (1 + 3.00) ** (1 / SESSIONS_IN_SAMPLE) - 1    # "over 300%" cumulative at 5 bp   -> per session
NET_AT_10BP = (1 + 1.00) ** (1 / SESSIONS_IN_SAMPLE) - 1   # "above 100%" cumulative at 10 bp -> per session
# net(c) = g - k*c  (c in bp per trade). Two points give k and g; the third check is "unprofitable at 20 bp".
K_PER_BP = (NET_AT_5BP - NET_AT_10BP) / 5.0                # daily return lost per bp of cost = trades per session
G_LS_DAILY = NET_AT_5BP + 5.0 * K_PER_BP                   # gross daily long-short return
SHARPE = {"2021Q4": 6.54, "2022": 3.68, "2023": 2.33, "2024 (Jan-May)": 1.22, "overall (Oct 2021-May 2024)": 2.97}

LONG_LEG_SHARE = 0.40             # Ke, Kelly & Xiu 2019: the long side earns less than the short side (Sharpe 2.12 vs
                                  # the long-short 4.29); Lopez-Lira & Tang: the effect is stronger for negative news
SIZE_TILT = {"large": 0.3, "mid": 0.8, "small": 1.5}   # Lopez-Lira & Tang: interaction with size 0.404 (t 4.75);
                                  # Chen, Kelly & Xiu: large-cap predictability "dissipates quickly", small persists
ROUND_TRIP_BP = {"large": 15, "mid": 30, "small": 80}  # config shadow.EDGAR.costs (track 16 §1.3), the system's own
SLIPPAGE_ONLY_BP = {"large": 10, "mid": 24, "small": 50}  # the fill model's next-open slippage alone (track 18 §5.1:
                                  # 5 / 12 / 25 bp a side), i.e. no spread: the cheapest defensible execution
FULL_FILING_MULTIPLIER = 2.0      # upper bound: a model reading the whole filing, not a headline, finds twice the
                                  # effect (Lopez-Lira & Tang: ability rises with model size; Chen, Kelly & Xiu:
                                  # embeddings beat simple text representations). Assumed, not measured
FORWARD_HAIRCUT = 0.5             # track 02 §2: published premia are about 2x the future premium (McLean & Pontiff)
TRADES_PER_YEAR = 50              # at most one recommendation a week
POSITION = 0.05                   # track 16's single-stock weight (5% of NAV)
WEEKLY_HOLD_MULTIPLIER = 1.0      # Ke, Kelly & Xiu: news is fully in prices by day +3, so holding to day 5 adds no
                                  # mean, only noise

# ---- Route B: breadth ---------------------------------------------------------------------------------------------
NAMES_PER_DAY = {"100 names/day": 100, "300 names/day": 300}   # the published daily long-short's breadth (assumed)
OUR_BREADTH = TRADES_PER_YEAR     # one name a week
SINGLE_STOCK_VOL = 0.40           # annualized vol of a small/mid-cap name (assumed; large caps about 0.25)


def route_a() -> pd.DataFrame:
    base_sr = SHARPE["overall (Oct 2021-May 2024)"]
    long_leg_bp = G_LS_DAILY * LONG_LEG_SHARE * 1e4     # gross bp per long position-day at the overall level
    rows = []
    scenarios = [  # label, level vs the 2021-24 average, forward haircut, extra multiplier, cost table
        ("upper bound: 2x effect (whole filing), 2021Q4 level, slippage-only costs",
         SHARPE["2021Q4"] / base_sr, 1.0, FULL_FILING_MULTIPLIER, SLIPPAGE_ONLY_BP),
        ("optimistic: 2021Q4 level, no forward decay", SHARPE["2021Q4"] / base_sr, 1.0, 1.0, ROUND_TRIP_BP),
        ("published average 2021-24, no forward decay", 1.0, 1.0, 1.0, ROUND_TRIP_BP),
        ("central: 2024 level, then x0.5 forward haircut", SHARPE["2024 (Jan-May)"] / base_sr, FORWARD_HAIRCUT, 1.0,
         ROUND_TRIP_BP),
        ("pessimistic: adoption finished the job (gross 0)", 0.0, 1.0, 1.0, ROUND_TRIP_BP),
    ]
    for label, level, haircut, extra, costs in scenarios:
        for bucket, tilt in SIZE_TILT.items():
            gross = long_leg_bp * level * tilt * haircut * extra * WEEKLY_HOLD_MULTIPLIER
            net = gross - costs[bucket]
            rows.append({"scenario": label, "bucket": bucket, "gross_bp_per_trade": round(gross, 1),
                         "round_trip_bp": costs[bucket], "net_bp_per_trade": round(net, 1),
                         "points_per_year_at_5pct_weekly": round(TRADES_PER_YEAR * POSITION * net / 1e4 * 100, 3)})
    return pd.DataFrame(rows)


def route_b() -> pd.DataFrame:
    rows = []
    for period, sr in SHARPE.items():
        for label, names in NAMES_PER_DAY.items():
            ic = sr / math.sqrt(names * 252)
            ours = ic * math.sqrt(OUR_BREADTH)
            pos_vol = POSITION * SINGLE_STOCK_VOL           # the position's contribution to NAV vol, a year
            gross_points = ours * pos_vol * 100
            cost_points = {b: TRADES_PER_YEAR * POSITION * c / 1e4 * 100 for b, c in ROUND_TRIP_BP.items()}
            rows.append({"period": period, "published_sharpe": sr, "breadth": label, "implied_IC": round(ic, 4),
                         "our_gross_sharpe_1_name_a_week": round(ours, 3),
                         "gross_points_per_year": round(gross_points, 3),
                         "cost_points_per_year_large": round(cost_points["large"], 2),
                         "cost_points_per_year_small": round(cost_points["small"], 2)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, "results"), exist_ok=True)
    pd.set_option("display.width", 200)
    print(f"Lopez-Lira & Tang v6 cost sensitivity, read as a line: net at 5 bp = {NET_AT_5BP*1e4:.1f} bp/session, "
          f"net at 10 bp = {NET_AT_10BP*1e4:.1f} bp/session")
    print(f"  -> trades per session (turnover) k = {K_PER_BP*1e4:.2f} bp lost per bp of cost; gross long-short "
          f"g = {G_LS_DAILY*1e4:.1f} bp/session; check at 20 bp: {(G_LS_DAILY - 20*K_PER_BP)*1e4:.1f} bp "
          f"(paper: unprofitable)")
    print(f"  -> long leg only ({LONG_LEG_SHARE:.0%}): {G_LS_DAILY*LONG_LEG_SHARE*1e4:.1f} bp gross per long "
          f"position-day at the 2021-24 average level\n")
    a = route_a()
    print("Route A: per trade, one long position a week at the next open, 5% of NAV")
    print(a.to_string(index=False))
    a.to_csv(os.path.join(here, "results", "edge_scenarios.csv"), index=False)
    b = route_b()
    print("\nRoute B: the fundamental law. IC implied by the published Sharpe; our breadth = 50 names a year")
    print(b.to_string(index=False))
    b.to_csv(os.path.join(here, "results", "breadth.csv"), index=False)
    central = a[(a.scenario.str.startswith("central")) & (a.bucket != "mid")]
    lo, hi = a.points_per_year_at_5pct_weekly.min(), a.points_per_year_at_5pct_weekly.max()
    print(f"\nSummary: central cells (large, small) {central.points_per_year_at_5pct_weekly.tolist()} points a year; "
          f"all cells {lo:+.2f} to {hi:+.2f}. Route B gross Sharpe for one name a week: "
          f"{b.our_gross_sharpe_1_name_a_week.min():.2f} to {b.our_gross_sharpe_1_name_a_week.max():.2f} "
          f"(gross {b.gross_points_per_year.min():.2f} to {b.gross_points_per_year.max():.2f} points a year, before "
          f"costs of {b.cost_points_per_year_large.iloc[0]:.2f} to {b.cost_points_per_year_small.iloc[0]:.2f}).")
