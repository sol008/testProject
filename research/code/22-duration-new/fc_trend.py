"""Family (c): time-series momentum with quarterly (H63) or four-monthly (H84) re-decision vs the monthly
R1 / M2 book (L252, H21), re-using track 15's universes, costs and portfolio engine.

Universes (track 15): LONG = 26 synthetic futures markets (design 1971-2007, test 2008-2026);
MICRO8 = the 8 micro-contract markets (design 1990-2007); ETF8 = SPY QQQ IEF GLD USO FXE FXY FXA
(test 2008-2026 only; long-only ETF8 is the chosen M2 vehicle).
Grid: lookback L in {63, 126, 252} x re-decision H in {21, 42, 63, 84} x {long/short, long-only}.
Each H is run at every phase offset (0, 21, 42, ... < H) and averaged, so a quarterly schedule is not a
single lucky/unlucky draw of rebalance dates.
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

import common22 as K

sys.path.insert(0, str(K.CODE.parent / "15-short-futures-crypto"))
import assets as A  # noqa: E402
import common as C15  # noqa: E402
import p1_trend as P  # noqa: E402

FAMILY = "c_trend"
ETF8 = ["SPY", "QQQ", "IEF", "GLD", "USO", "FXE", "FXY", "FXA"]
LS = (63, 126, 252)
HS = (21, 42, 63, 84)


def tsmom_weights_off(R, L, H, long_only=False, offset=0, cap=4.0):
    """track 15's tsmom_weights with a rebalance-phase offset."""
    Pp = (1 + R.fillna(0)).cumprod().where(R.notna().cumsum() > 0)
    vol = P.ewma_vol(R)
    N = P.n_active(R)
    vt = P.PORT_VOL / np.sqrt(N)
    m = Pp / Pp.shift(L) - 1
    sig = np.sign(m).fillna(0)
    if long_only:
        sig = sig.clip(lower=0)
    elig = R.notna().cumsum() >= L + 1
    w = (sig * np.minimum(vt.values[:, None] / vol, cap)).where(elig).fillna(0)
    reb = np.zeros(len(R), dtype=bool)
    reb[offset::H] = True
    return w.where(pd.Series(reb, index=R.index), np.nan).ffill().fillna(0)


def flips_per_year(W, a, b):
    s = np.sign(W.loc[a:b])
    ch = (s.diff().abs() > 0).sum().sum()
    yrs = (pd.Timestamp(b) - pd.Timestamp(a)).days / 365.25
    return ch / yrs


def run_grid(R, cls, kind, periods, uni):
    costs, borrow, roll = P.cost_vectors(R.columns, cls, kind)
    rows = []
    for lo in (False, True):
        for L in LS:
            for H in HS:
                offs = list(range(0, H, 21))
                per_off = []
                for off in offs:
                    W = tsmom_weights_off(R, L, H, long_only=lo, offset=off)
                    out = P.run_portfolio(R, W, costs, borrow, roll)
                    for pname, a, b in periods:
                        s = P.summarize(out, a, b)
                        if not s:
                            continue
                        per_off.append(dict(period=pname, off=off, sharpe=s["sharpe"], ann=s["ann_ret_%"],
                                            vol=s["vol_%"], mdd=s["maxDD_%"], cost=s["cost_%yr"],
                                            turn=s["turnover_x_yr"], lev=s["avg_gross_lev"],
                                            flips=flips_per_year(W, a, b)))
                d = pd.DataFrame(per_off)
                for pname, g in d.groupby("period"):
                    rows.append(dict(universe=uni, long_only=lo, L=L, H=H, period=pname,
                                     variant=f"{uni}|{'LO' if lo else 'LS'}|L{L}|H{H}",
                                     sharpe=g["sharpe"].mean(), sharpe_min=g["sharpe"].min(),
                                     sharpe_max=g["sharpe"].max(), ann_ret=g["ann"].mean(), vol=g["vol"].mean(),
                                     mdd=g["mdd"].mean(), cost=g["cost"].mean(), turnover=g["turn"].mean(),
                                     gross_lev=g["lev"].mean(), flips_yr=g["flips"].mean(),
                                     rebal_yr=252 / H, n_offsets=len(g)))
    return pd.DataFrame(rows)


def main():
    RL, clsL = A.long_universe()
    RM = P.micro_universe(RL)
    RE, clsE = A.etf_universe(start="2004-01-01")
    R8 = RE[ETF8]
    cls8 = {k: clsE[k] for k in ETF8}
    res = []
    res.append(run_grid(RL, clsL, "fut", [("design", "1971-01-01", "2007-12-31"),
                                            ("test", "2008-01-01", "2026-09-28")], "LONG26"))
    print("LONG26 done", flush=True)
    res.append(run_grid(RM, clsL, "fut", [("design", "1990-01-01", "2007-12-31"),
                                            ("test", "2008-01-01", "2026-09-28")], "MICRO8"))
    print("MICRO8 done", flush=True)
    res.append(run_grid(R8, cls8, "etf", [("test", "2008-01-01", "2026-09-28"),
                                           ("since2013", "2013-01-01", "2026-09-28")], "ETF8"))
    df = pd.concat(res, ignore_index=True)
    df.insert(0, "family", FAMILY)
    df.to_csv(K.RESULTS / "registry_c_trend.csv", index=False, float_format="%.4g")
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 500)
    df = main()
    piv = df.pivot_table(index=["universe", "long_only", "L"], columns=["period", "H"], values="sharpe")
    print(piv.round(2).to_string())
    e = df[df["universe"] == "ETF8"][["variant", "period", "sharpe", "sharpe_min", "sharpe_max", "ann_ret",
                                       "vol", "mdd", "cost", "flips_yr", "rebal_yr"]]
    print(e.round(2).to_string())
