"""The same rotation grid on Ken French value-weighted industry portfolios (10, 12, 49), daily 1926-2026:
design 1927-2012, test 2013-2026. Benchmark: the CRSP value-weighted market (Mkt-RF + RF).
Industries are not directly tradable: each is charged 6 bp per side and 0.10 %/yr (an ETF-like fee).
Execution at the next session's close (no opens in the data)."""
from __future__ import annotations

import itertools
import sys
from multiprocessing import Pool

import numpy as np
import pandas as pd

import common27 as K

FEE = 0.0010
UNIS = {"kf10": "10_Industry_Portfolios_daily", "kf12": "12_Industry_Portfolios_daily",
        "kf49": "49_Industry_Portfolios_daily"}
LOOKS = ["1m", "3m", "6m", "12m", "12-1", "blend", "adm"]
FILTERS = ["none", "abs", "sma", "mkt"]
_P = {}
_CACHE = {}


def get_panel(u: str) -> K.Panel:
    if u not in _P:
        ind = K.kf_daily_table(UNIS[u])
        ff = K.kf_daily_table("F-F_Research_Data_Factors_daily")
        ind = ind.loc[:ff.index[-1]]
        rf = ff["RF"].reindex(ind.index).fillna(0.0)
        mkt = (1 + ff["Mkt-RF"] + ff["RF"]).reindex(ind.index).cumprod()
        C = {}
        for c in ind.columns:
            r = ind[c] - FEE / 252.0
            first = r.first_valid_index()
            s = (1 + r.loc[first:].fillna(0.0)).cumprod()
            C[f"{u}_{c}"] = s.reindex(ind.index)
        C["MKT"] = mkt
        C["CASH"] = (1 + rf - K.CASH_FEE / 252.0).cumprod()
        df = pd.DataFrame(C)
        _P[u] = K.Panel(df, df, rf, bench="MKT")
        _P[u].members = [n for n in df.columns if n.startswith(u + "_")]
    return _P[u]


def one(args):
    u, look, va, k, f, cad = args
    P = get_panel(u)
    uni = P.members
    ck = _CACHE.setdefault(u, {})
    rows, tl = K.targets_for(P, uni, look, k, f, va, cad, cache=ck)
    start = int(np.where(np.isfinite(K.momentum_scores(P.C[:, P.sub(uni)], "12m")).sum(1) >= 3)[0][0]) + 1
    res = K.run_engine(P, rows, tl, k, mode="close", start_row=start)
    eq = res["equity"]
    mkt = pd.Series(P.C[:, P.col["MKT"]], index=P.idx)
    rf = pd.Series(P.rf, index=P.idx)
    row = dict(universe=u, lookback=look, voladj=va, k=k, filter=f, cadence=cad, start=eq.index[0].date())
    row.update(K.period_stats(eq, mkt, rf, eq.index[0], "2007-12-31", "pre08"))
    row.update(K.period_stats(eq, mkt, rf, eq.index[0], K.IS_END, "is"))
    row.update(K.period_stats(eq, mkt, rf, K.OOS_START, K.ASOF, "oos"))
    row.update(K.activity_stats(res, K.OOS_START, K.ASOF, P.idx, "oos"))
    w = eq.resample("W-FRI").last()
    mw = mkt.reindex(eq.index).resample("W-FRI").last()
    act = (w.pct_change() - mw.pct_change()).loc[K.OOS_START:]
    return row, act.values.astype(np.float32)


def main(nproc: int = 4):
    sp = list(itertools.product(list(UNIS), LOOKS, [False, True], [1, 2, 3], FILTERS, ["W", "M"]))
    for u in UNIS:
        get_panel(u)
    print(len(sp), "KF variants", flush=True)
    with Pool(nproc) as pool:
        res = pool.map(one, sp, chunksize=6)
    df = pd.DataFrame([r[0] for r in res])
    df.insert(0, "vid", np.arange(len(df)))
    n = min(len(r[1]) for r in res)
    np.save(K.SCRATCH / "kf_oos_weekly_active.npy", np.stack([r[1][-n:] for r in res], 1))
    df.to_csv(K.SCRATCH / "kf_grid_full.csv", index=False)
    cols = ["vid", "universe", "lookback", "voladj", "k", "filter", "cadence",
            "pre08_cagr", "pre08_spy_cagr", "pre08_excess", "is_cagr", "is_spy_cagr", "is_excess", "is_sharpe",
            "is_maxdd", "oos_cagr", "oos_spy_cagr", "oos_excess", "oos_sharpe", "oos_ir", "oos_maxdd",
            "oos_worst_year", "oos_win5y", "oos_recs_yr", "oos_orders_yr"]
    K.save(df[cols], "kf_grid_registry.csv")
    print(df.groupby("universe")[["pre08_excess", "is_excess", "oos_excess"]].describe().round(3).to_string())


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)
