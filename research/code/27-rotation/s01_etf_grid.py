"""Every rotation variant on the ETF universes: design 1999/2003-2012, test 2013-2026.

Grid per universe: lookback {1m,3m,6m,12m,12-1,blend,adm} x vol-adjusted {no,yes} x top-k {1,2,3}
x filter {none, abs (beat T-bills), sma (own 200-day), mkt (SPY 200-day)} x cadence {W, M}
= 336 variants, plus named rules (GEM, accelerating dual momentum). Execution at the next open.
"""
from __future__ import annotations

import itertools
import sys
from multiprocessing import Pool

import numpy as np
import pandas as pd

import common27 as K

BTC_FROM = "2013-01-01"     # BTC may enter only from the test period (no design-period data used)

UNIVERSES = {
    "sectors9": K.SECTORS9,
    "us4": ["SPY", "QQQ", "IWM", "MDY"],
    "us13": ["SPY", "QQQ", "IWM", "MDY"] + K.SECTORS9,
    "us14_smh": ["SPY", "QQQ", "IWM", "MDY"] + K.SECTORS9 + ["SMH"],
    "global4": ["SPY", "QQQ", "EFA", "EEM"],
    "countries": ["SPY", "EFA", "EEM"] + K.COUNTRIES,
    "cross9": ["SPY", "QQQ", "IWM", "EFA", "EEM", "TLT", "IEF", "GLD", "DBC"],
    "cross9_btc": ["SPY", "QQQ", "IWM", "EFA", "EEM", "TLT", "IEF", "GLD", "DBC", "BTC"],
    "kitchen_sink": ["SPY", "QQQ", "IWM", "MDY"] + K.SECTORS9 + ["SMH", "EFA", "EEM", "TLT", "IEF", "GLD", "DBC", "BTC"],
}
LOOKS = ["1m", "3m", "6m", "12m", "12-1", "blend", "adm"]
FILTERS = ["none", "abs", "sma", "mkt"]
_PANEL = None
_CACHE = {}


def all_tickers():
    s = set()
    for u in UNIVERSES.values():
        s.update(u)
    s.update(["SPY", "AGG", "IEF", "TLT", "EFA", "SCZ"])
    s.discard("BTC")
    return sorted(s)


def get_panel():
    global _PANEL
    if _PANEL is None:
        spy = K.adjusted("SPY")
        idx = spy.loc["1993-01-29":].index
        _PANEL = K.build_etf_panel(all_tickers(), {"BTC": K.btc_ibit_series(idx)})
    return _PANEL


def common_start(panel: K.Panel, universe) -> int:
    """First session at which >= min(3, N) members have a 12-month score (all lookbacks comparable)."""
    cols = panel.sub(universe)
    sc = K.momentum_scores(panel.C[:, cols], "12m")
    elig = np.isfinite(sc)
    if "BTC" in universe:
        elig[:, universe.index("BTC")] = False
    need = min(3, len(universe))
    ok = np.where(elig.sum(1) >= need)[0]
    return int(ok[0]) + 1


def one(args):
    uname, look, voladj, k, filt, cad, mode, safe, extra = args
    panel = get_panel()
    uni = UNIVERSES.get(uname, extra.get("universe") if extra else None)
    elig = {"BTC": BTC_FROM} if "BTC" in uni else None
    rows, tl = K.targets_for(panel, uni, look, k, filt, voladj, cad, safe=safe, eligible_from=elig,
                             cache=_CACHE)
    start = common_start(panel, uni) if not extra or "start" not in extra else extra["start"]
    # safe asset unavailable (e.g. IEF before 2002-07): fall back to CASH
    if safe != "CASH":
        si = panel.col[safe]
        tl = [tuple(("CASH" if (x == safe and not np.isfinite(panel.C[r, si])) else x) for x in t)
              for r, t in zip(rows, tl)]
    res = K.run_engine(panel, rows, tl, k, mode=mode, start_row=start)
    if res is None:
        return None
    eq = res["equity"]
    spy = pd.Series(panel.C[:, panel.col["SPY"]], index=panel.idx)
    rf = pd.Series(panel.rf, index=panel.idx)
    name = extra.get("name") if extra else None
    row = dict(universe=uname, rule=name or "grid", lookback=look, voladj=voladj, k=k, filter=filt,
               cadence=cad, mode=mode, safe=safe, start=eq.index[0].date())
    row.update(K.period_stats(eq, spy, rf, eq.index[0], K.IS_END, "is"))
    row.update(K.period_stats(eq, spy, rf, K.OOS_START, K.ASOF, "oos"))
    row.update(K.period_stats(eq, spy, rf, eq.index[0], K.ASOF, "full"))
    row.update(K.activity_stats(res, eq.index[0], K.IS_END, panel.idx, "is"))
    row.update(K.activity_stats(res, K.OOS_START, K.ASOF, panel.idx, "oos"))
    # weekly active returns in the test period (for the reality check / deflation)
    w = eq.loc[:K.ASOF].resample("W-FRI").last()
    sw = spy.reindex(eq.index).resample("W-FRI").last()
    act = (w.pct_change() - sw.pct_change()).loc[K.OOS_START:]
    wr = w.pct_change().loc[K.OOS_START:]
    return row, act.values.astype(np.float32), wr.values.astype(np.float32)


def specs():
    out = []
    for u in UNIVERSES:
        for look, va, k, f, cad in itertools.product(LOOKS, [False, True], [1, 2, 3], FILTERS, ["W", "M"]):
            out.append((u, look, va, k, f, cad, "open", "CASH", None))
    # named rules
    for cad in ["W", "M"]:
        out.append(("gem", "12m", False, 1, "mkt_abs", cad, "open", "IEF",
                    dict(name="GEM (SPY/EFA, 12m, else IEF)", universe=["SPY", "EFA"])))
        out.append(("adm", "adm", False, 1, "abs0", cad, "open", "TLT",
                    dict(name="Accelerating dual momentum (SPY/EFA, 1+3+6m, else TLT)", universe=["SPY", "EFA"])))
        out.append(("adm_scz", "adm", False, 1, "abs0", cad, "open", "TLT",
                    dict(name="Accelerating dual momentum (SPY/SCZ, 1+3+6m, else TLT)", universe=["SPY", "SCZ"])))
    return out


def main(nproc: int = 4):
    get_panel()
    sp = specs()
    print(f"{len(sp)} variants", flush=True)
    with Pool(nproc, initializer=get_panel) as pool:
        res = pool.map(one, sp, chunksize=8)
    rows, acts, wrs, keep = [], [], [], []
    for s, r in zip(sp, res):
        if r is None:
            continue
        rows.append(r[0])
        acts.append(r[1])
        wrs.append(r[2])
    df = pd.DataFrame(rows)
    df.insert(0, "vid", np.arange(len(df)))
    n = min(len(a) for a in acts)
    A = np.stack([a[-n:] for a in acts], 1)
    W = np.stack([a[-n:] for a in wrs], 1)
    np.save(K.SCRATCH / "etf_oos_weekly_active.npy", A)
    np.save(K.SCRATCH / "etf_oos_weekly_ret.npy", W)
    df.to_csv(K.SCRATCH / "etf_grid_full.csv", index=False)
    cols = ["vid", "universe", "rule", "lookback", "voladj", "k", "filter", "cadence", "start",
            "is_cagr", "is_spy_cagr", "is_excess", "is_sharpe", "is_maxdd",
            "oos_cagr", "oos_spy_cagr", "oos_excess", "oos_sharpe", "oos_ir", "oos_maxdd", "oos_worst_year",
            "oos_win5y", "oos_med5y_gap", "oos_recs_yr", "oos_orders_yr", "oos_turnover_yr", "oos_max_orders",
            "oos_share_gt3", "full_cagr", "full_excess", "full_maxdd", "full_win5y"]
    K.save(df[cols], "etf_grid_registry.csv")
    print(df.groupby("universe")[["is_excess", "oos_excess"]].describe().round(3).to_string())


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)
