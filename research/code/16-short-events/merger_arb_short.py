"""Merger arbitrage on a 1-60 day horizon: fund proxies, crash behaviour, and near-completion
deal economics.

Historical single-deal target prices are not available from free data (targets are delisted
after completion and Yahoo drops them), so this script uses:
  1. Investable proxies (MNA ETF 2009-, MERFX 1990s-, ARBIX 2000s-): distribution of 20- and
     60-session returns vs T-bills (^IRX), and behaviour in the worst SPY windows.
  2. A break-risk model for a single near-completion cash deal:
        EV per trade = (1-p)*spread - p*downside - costs ;  annualised = EV * 365/days
     evaluated on the live cross-section of pending cash deals (track 05 merger_scan.csv).
Run: python merger_arb_short.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT, load_prices, save_csv, save_json, tr_index


def main():
    tick = ["MNA", "MERFX", "ARBIX", "SPY", "^IRX"]
    px = load_prices(tick, verbose=False)
    irx = px["^IRX"]["Close"] / 100.0  # annualised 13-week bill yield (discount basis, close enough)
    out = {}
    rows = []
    spy = tr_index(px["SPY"])
    for f in ["MNA", "MERFX", "ARBIX"]:
        s = tr_index(px[f]).dropna()
        s = s[s.index >= "2009-01-01"]
        for h in (20, 60):
            r = (s.shift(-h) / s - 1).dropna()
            rf = (irx.reindex(r.index).ffill() * h / 252).fillna(0)
            ex = r - rf
            b = (spy.reindex(r.index).shift(-h) / spy.reindex(r.index) - 1)
            worst = b <= b.quantile(0.05)
            rows.append({"fund": f, "h": h, "start": str(r.index[0].date()), "n_windows": len(r),
                         "mean_%": round(100 * r.mean(), 2), "median_%": round(100 * r.median(), 2),
                         "mean_excess_over_bills_%": round(100 * ex.mean(), 2), "win_vs_bills_%": round(100 * (ex > 0).mean(), 1),
                         "p5_%": round(100 * r.quantile(0.05), 2), "min_%": round(100 * r.min(), 2),
                         "corr_with_SPY": round(float(np.corrcoef(r.values, b.reindex(r.index).fillna(0).values)[0, 1]), 2),
                         "mean_in_worst5%_SPY_windows_%": round(100 * r[worst.reindex(r.index).fillna(False)].mean(), 2),
                         "SPY_mean_in_those_%": round(100 * b[worst].mean(), 2)})
    tab = pd.DataFrame(rows)
    save_csv(tab, "merger_arb_proxies_short_windows.csv")

    # live cross-section (track 05 scan, 28-Sep-2026) + break-risk model
    scan = pd.read_csv(OUT.parent.parent / "05-special-situations" / "output" / "merger_scan.csv")
    live = scan[(scan["gross_spread_%"] > 0) & (scan["gross_spread_%"] < 40) & (~scan["stock_component_flag"])].copy()
    out["live_cash_deals_with_positive_spread"] = int(len(live))
    out["live_spread_median_%"] = round(float(live["gross_spread_%"].median()), 2)
    out["live_spread_quartiles_%"] = [round(float(x), 2) for x in live["gross_spread_%"].quantile([0.25, 0.5, 0.75])]
    grid = []
    for spread in (0.25, 0.5, 1.0, 2.0, 4.0):
        for days in (10, 30, 60):
            for p_break in (0.005, 0.01, 0.02, 0.05):
                for downside in (15.0, 30.0):
                    cost = 0.10  # % round trip, liquid target; tender/merger proceeds paid in cash
                    ev = (1 - p_break) * spread - p_break * downside - cost
                    grid.append({"spread_%": spread, "days_to_close": days, "p_break": p_break, "downside_%": downside,
                                 "EV_per_trade_%": round(ev, 3), "EV_annualised_%": round(ev * 365 / days, 1),
                                 "break_even_p_%": round(100 * (spread - cost) / (spread + downside), 2)})
    g = pd.DataFrame(grid)
    save_csv(g, "merger_arb_near_close_model.csv")
    save_json(out, "merger_arb_short_summary.json")
    pd.set_option("display.width", 250)
    print(tab.to_string())
    print(out)
    print(g[(g["downside_%"] == 30.0) & (g["p_break"].isin([0.01, 0.02]))].to_string())


if __name__ == "__main__":
    main()
