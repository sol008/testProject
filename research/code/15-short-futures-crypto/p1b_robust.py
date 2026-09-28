"""Robustness of the MICRO8 multi-asset trend result.

(a) leave-one-market-out: TSMOM L252/H21 and L126/H21 on MICRO8 minus each market (test 2008-2026);
(b) ETF8: the same eight exposures with ETFs (SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA), ETF costs and
    short-borrow fees -- the implementation for accounts too small for integer micro contracts;
(c) worst single-position loss in NAV terms (weight x holding-period return) at 10% portfolio vol;
(d) cost sensitivity (1x, 2x, 4x the base cost table).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import assets as A
import common as C
import p1_trend as P

ETF8 = {"SPX": "SPY", "CCMP": "QQQ", "UST10": "IEF", "GOLD": "GLD", "CL": "USO", "EUR": "FXE", "JPY": "FXY", "AUD": "FXA"}


def run(R, cls, kind, L, H, cost_mult=1.0):
    costs, borrow, roll = P.cost_vectors(R.columns, cls, kind)
    W, _ = P.tsmom_weights(R, L, H)
    out = P.run_portfolio(R, W, costs * cost_mult, borrow, roll * cost_mult)
    return out, W


def main():
    pd.set_option("display.width", 250)
    RL, clsL = A.long_universe()
    RM = P.micro_universe(RL)
    rows = []
    for L, H in [([252], 21), ([126], 21)]:
        base, _ = run(RM, clsL, "fut", L, H)
        d = P.summarize(base, "1990-01-01", "2007-12-31")
        scale = P.PORT_VOL / (d["vol_%"] / 100)
        s = P.summarize(base, "2008-01-01", "2026-09-28", scale)
        rows.append({"test": f"MICRO8 TSMOM L{L[0]} H{H}", "dropped": "none", "test_SR": s["sharpe"], "test_ret_%": s["ann_ret_%"], "maxDD_%": s["maxDD_%"]})
        for c in RM.columns:
            R2 = RM.drop(columns=[c])
            out, _ = run(R2, clsL, "fut", L, H)
            d2 = P.summarize(out, "1990-01-01", "2007-12-31")
            sc2 = P.PORT_VOL / (d2["vol_%"] / 100)
            s2 = P.summarize(out, "2008-01-01", "2026-09-28", sc2)
            rows.append({"test": f"MICRO8 TSMOM L{L[0]} H{H}", "dropped": c, "test_SR": s2["sharpe"], "test_ret_%": s2["ann_ret_%"], "maxDD_%": s2["maxDD_%"]})
        for m in [2.0, 4.0]:
            out, _ = run(RM, clsL, "fut", L, H, cost_mult=m)
            s3 = P.summarize(out, "2008-01-01", "2026-09-28", scale)
            rows.append({"test": f"MICRO8 TSMOM L{L[0]} H{H}", "dropped": f"costs x{m:.0f}", "test_SR": s3["sharpe"], "test_ret_%": s3["ann_ret_%"], "maxDD_%": s3["maxDD_%"]})
    LOO = pd.DataFrame(rows)
    C.save(LOO, "p1b_micro8_leave_one_out.csv")
    print(LOO.to_string())

    # (b) ETF8
    RE, clsE = A.etf_universe(start="2004-01-01")
    R8 = RE[list(ETF8.values())]
    cls8 = {v: clsE[v] for v in ETF8.values()}
    erows = []
    for L, H in [([252], 21), ([126], 21), ([21, 63, 126, 252], 21)]:
        out, W = run(R8, cls8, "etf", L, H)
        d = P.summarize(out, "2008-01-01", "2026-09-28")
        scale = P.PORT_VOL / (d["vol_%"] / 100)
        for per, a, b in [("test 2008-2026", "2008-01-01", "2026-09-28"), ("since 2013", "2013-01-01", "2026-09-28")]:
            s = P.summarize(out, a, b, scale)
            erows.append({"variant": f"ETF8 TSMOM L{'/'.join(map(str, L))} H{H}", "period": per, "sharpe": s["sharpe"], "ann_ret_%_at_10%vol": s["ann_ret_%"],
                          "maxDD_%": s["maxDD_%"], "cost_%yr": s["cost_%yr"], "gross_lev": s["avg_gross_lev"], "scale_expost": round(scale, 2)})
        # long-only
        costs, borrow, roll = P.cost_vectors(R8.columns, cls8, "etf")
        Wl, _ = P.tsmom_weights(R8, L, H, long_only=True)
        outl = P.run_portfolio(R8, Wl, costs, borrow, roll)
        s = P.summarize(outl, "2008-01-01", "2026-09-28")
        erows.append({"variant": f"ETF8 LONG-ONLY TSMOM L{'/'.join(map(str, L))} H{H} (unscaled)", "period": "test 2008-2026", "sharpe": s["sharpe"],
                      "ann_ret_%_at_10%vol": s["ann_ret_%"], "maxDD_%": s["maxDD_%"], "cost_%yr": s["cost_%yr"], "gross_lev": s["avg_gross_lev"], "scale_expost": 1.0})
    E8 = pd.DataFrame(erows)
    C.save(E8, "p1b_etf8.csv")
    print(E8.to_string())

    # (c) worst single-position monthly loss in NAV terms (MICRO8 TSMOM L252 H21 at 10% vol)
    out, W = run(RM, clsL, "fut", [252], 21)
    d = P.summarize(out, "1990-01-01", "2007-12-31")
    scale = P.PORT_VOL / (d["vol_%"] / 100)
    Wx = (W.shift(P.LAG).fillna(0) * scale)
    contrib = (Wx.shift(1) * RM.fillna(0))
    m = contrib.loc["2008-01-01":].resample("ME").sum()
    worst = m.stack().sort_values().head(8)
    worst_port_month = out["net"].loc["2008-01-01":].mul(scale).resample("ME").sum().sort_values().head(5)
    res = {"worst_single_market_months_%NAV": {f"{k[0].date()} {k[1]}": round(100 * v, 2) for k, v in worst.items()},
           "worst_portfolio_months_%NAV": {str(k.date()): round(100 * v, 2) for k, v in worst_port_month.items()},
           "avg_gross_leverage_x_notional": round(float(Wx.abs().sum(axis=1).loc["2008-01-01":].mean()), 2),
           "p95_gross_leverage": round(float(Wx.abs().sum(axis=1).loc["2008-01-01":].quantile(0.95)), 2)}
    C.save(res, "p1b_micro8_worst.json")
    print(res)


if __name__ == "__main__":
    main()
