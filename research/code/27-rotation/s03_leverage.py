"""Leverage on the rotation winners, with a trend filter.

1. The leveraged-fund model (track 04: L x index - (L-1)(T-bill + 0.40 %) - 0.95 %/yr, daily reset) is
   checked against the real QLD, TQQQ, SSO, UPRO, SOXL, USD and ROM.
2. Single-asset trend switches (weekly, next open): hold L x {SPY, QQQ, SMH} while the underlying is
   above its 200-session average (or beats T-bills over 12 months), else T-bills. L = 1, 2, 3.
3. The design-selected rotation rules of track 27's equity universes, holding 2x / 3x versions of
   whatever the rule picks (signals always on the unlevered ETF).
4. Long history: 3x Nasdaq-100 and 3x S&P 500 price indexes, 1985-2026, with the same weekly filter,
   to see 1987, 2000-02 and 2008 through a leveraged trend switch. Gaps: the worst weeks the filter
   could not avoid.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common27 as K
import s01_etf_grid as G

PAIRS = [("QLD", "QQQ", 2), ("TQQQ", "QQQ", 3), ("SSO", "SPY", 2), ("UPRO", "SPY", 3),
         ("SOXL", "SOXX", 3), ("USD", "SOXX", 2), ("ROM", "XLK", 2)]
EQUITY = ["SPY", "QQQ", "IWM", "MDY", "SMH", "SOXX", "EFA", "EEM"] + K.SECTORS9


def lev_panel():
    base = G.get_panel()
    idx = base.idx
    rf = pd.Series(base.rf, index=idx)
    syn = {"BTC": pd.Series(base.C[:, base.col["BTC"]], index=idx)}
    for x in EQUITY:
        s = pd.Series(base.C[:, base.col[x]], index=idx) if x in base.col else K.adjusted(x)["aC"].reindex(idx)
        for L in (2, 3):
            syn[f"L{L}_{x}"] = K.letf_series(s, rf, L, K.UNDERLYING_ER.get(x, 0.0009))
    P = K.build_etf_panel(G.all_tickers() + ["SOXX"], syn)
    # leveraged funds trade at the next open too: approximate their open with the underlying's open move
    for x in EQUITY:
        if x not in P.col:
            continue
        u = P.col[x]
        gap = P.O[:, u] / np.r_[np.nan, P.C[:-1, u]] - 1          # underlying overnight return
        for L in (2, 3):
            j = P.col[f"L{L}_{x}"]
            prev = np.r_[np.nan, P.C[:-1, j]]
            o = prev * (1 + L * gap)
            P.O[:, j] = np.where(np.isfinite(o), o, P.C[:, j])
    return P


def validate(P):
    rows = []
    for fund, und, L in PAIRS:
        a = K.adjusted(fund)["aC"]
        s = pd.Series(P.C[:, P.col[f"L{L}_{und}"]], index=P.idx).reindex(a.index).dropna()
        a = a.reindex(s.index)
        ra, rs = a.pct_change().dropna(), s.pct_change().dropna()
        rows.append(dict(fund=fund, underlying=und, L=L, start=s.index[0].date(),
                         actual_cagr=K.cagr_of(a), model_cagr=K.cagr_of(s),
                         gap_pts_yr=K.cagr_of(s) - K.cagr_of(a), daily_corr=float(np.corrcoef(ra, rs)[0, 1]),
                         tracking_err=float((ra - rs).std() * np.sqrt(252)),
                         actual_maxdd=K.maxdd(a), model_maxdd=K.maxdd(s)))
    return pd.DataFrame(rows)


def run_rule(P, rows, tl, k, start, label, extra):
    res = K.run_engine(P, rows, tl, k, mode="open", start_row=start)
    eq = res["equity"]
    spy = pd.Series(P.C[:, P.col["SPY"]], index=P.idx)
    rf = pd.Series(P.rf, index=P.idx)
    row = dict(rule=label, **extra, start=eq.index[0].date())
    row.update(K.period_stats(eq, spy, rf, eq.index[0], K.IS_END, "is"))
    row.update(K.period_stats(eq, spy, rf, K.OOS_START, K.ASOF, "oos"))
    row.update(K.activity_stats(res, K.OOS_START, K.ASOF, P.idx, "oos"))
    return row, eq


def single_asset_switches(P):
    out, curves = [], {}
    for x in ["SPY", "QQQ", "SMH"]:
        ci = P.col[x]
        sc = K.momentum_scores(P.C[:, [ci, P.col["CASH"]]], "12m")
        M = K.sma(P.C[:, [ci]])[:, 0]
        start = int(np.where(np.isfinite(sc[:, 0]) & np.isfinite(M))[0][0]) + 1
        rows = K.decision_rows(P.idx, "W")
        rows = rows[rows >= start - 1]
        for filt in ["none", "sma", "abs"]:
            tl2 = []
            for r in rows:
                if filt == "none":
                    ok = True
                elif filt == "sma":
                    ok = P.C[r, ci] > M[r]
                else:
                    ok = sc[r, 0] > sc[r, 1]
                tl2.append((x,) if ok else ("CASH",))
            for L in (1, 2, 3):
                name = x if L == 1 else f"L{L}_{x}"
                tl3 = [tuple(name if a == x else a for a in t) for t in tl2]
                row, eq = run_rule(P, rows, tl3, 1, start, f"{L}x {x} {filt}", dict(asset=x, L=L, filter=filt))
                out.append(row)
                curves[f"{L}x {x} {filt}"] = eq
    return pd.DataFrame(out), curves


def selected_rotations_levered(P, reg: pd.DataFrame):
    out = []
    for u in ["us4", "us13", "us14_smh", "global4", "sectors9"]:
        sel = K.select_is(reg, u)
        uni = G.UNIVERSES[u]
        rows, tl = K.targets_for(P, uni, sel["lookback"], int(sel["k"]), sel["filter"], bool(sel["voladj"]),
                                 sel["cadence"])
        start = G.common_start(P, uni)
        for L in (1, 2, 3):
            tlL = [tuple(a if (a == "CASH" or L == 1) else f"L{L}_{a}" for a in t) for t in tl]
            row, _ = run_rule(P, rows, tlL, int(sel["k"]), start, f"{u} IS-selected, {L}x",
                              dict(universe=u, L=L, lookback=sel["lookback"], k=int(sel["k"]),
                                   filter=sel["filter"], voladj=bool(sel["voladj"]), cadence=sel["cadence"]))
            out.append(row)
    return pd.DataFrame(out)


def long_history():
    """Price-index 3x switches, 1985-2026 (no dividends: conservative by ~1-2 %/yr unlevered)."""
    out, gaps = [], []
    rfall = None
    for ix in ["^NDX", "^GSPC"]:
        raw = K.yf_raw(ix)
        c = raw["Close"].loc[:K.ASOF].dropna()
        o = raw["Open"].reindex(c.index)
        o = o.where(o > 0, c)
        idx = c.index
        rf = K.rf_daily(idx)
        cash = (1 + rf - K.CASH_FEE / 252).cumprod()
        syn = {}
        for L in (2, 3):
            syn[f"L{L}"] = K.letf_series(c, rf, L, 0.0)
        C = pd.DataFrame({"IX": c, "CASH": cash, **syn})
        O = C.copy()
        O["IX"] = o
        gap = o / c.shift(1) - 1
        for L in (2, 3):
            O[f"L{L}"] = C[f"L{L}"].shift(1) * (1 + L * gap)
            O[f"L{L}"] = O[f"L{L}"].fillna(C[f"L{L}"])
        P = K.Panel(C, O, rf, bench="IX")
        rows = K.decision_rows(idx, "W")
        M = K.sma(P.C[:, [0]])[:, 0]
        start = int(np.where(np.isfinite(M))[0][0]) + 5
        rows = rows[rows >= start - 1]
        for L in (1, 2, 3):
            name = "IX" if L == 1 else f"L{L}"
            for filt in ["none", "sma"]:
                tl = [((name,) if (filt == "none" or P.C[r, 0] > M[r]) else ("CASH",)) for r in rows]
                res = K.run_engine(P, rows, tl, 1, mode="open", start_row=start)
                eq = res["equity"]
                ixs = pd.Series(P.C[:, 0], index=idx)
                rfs = pd.Series(P.rf, index=idx)
                row = dict(index=ix, L=L, filter=filt, start=eq.index[0].date())
                for lab, a, b in [("1986-1999", "1986-01-01", "1999-12-31"), ("2000-2012", "2000-01-01", "2012-12-31"),
                                  ("2013-2026", "2013-01-01", K.ASOF), ("1986-2026", "1986-01-01", K.ASOF)]:
                    x = K.slice_eq(eq, a, b)
                    bx = K.slice_eq(ixs.reindex(eq.index), a, b)
                    row[f"cagr_{lab}"] = K.cagr_of(x)
                    row[f"maxdd_{lab}"] = K.maxdd(x)
                    row[f"index_cagr_{lab}"] = K.cagr_of(bx)
                out.append(row)
                if L == 3 and filt == "sma":
                    wk = eq.resample("W-FRI").last().pct_change().dropna()
                    worst = wk.nsmallest(8)
                    for d, v in worst.items():
                        gaps.append(dict(index=ix, week_ending=d.date(), strategy_week=v,
                                         index_week=float(ixs.resample("W-FRI").last().pct_change().get(d, np.nan))))
                    rd = eq.pct_change().dropna()
                    for d, v in rd.nsmallest(5).items():
                        gaps.append(dict(index=ix, week_ending=d.date(), strategy_week=np.nan, strategy_day=v,
                                         index_day=float(ixs.pct_change().get(d, np.nan))))
    return pd.DataFrame(out), pd.DataFrame(gaps)


def main():
    P = lev_panel()
    v = validate(P)
    K.save(v, "lev_model_validation.csv")
    print(v.round(4).to_string(index=False))
    sa, curves = single_asset_switches(P)
    K.save(sa, "lev_single_asset_switches.csv")
    print(sa[["rule", "is_cagr", "is_maxdd", "oos_cagr", "oos_excess", "oos_maxdd", "oos_worst_year", "oos_win5y",
              "oos_recs_yr"]].round(3).to_string(index=False))
    reg = pd.read_csv(K.SCRATCH / "etf_grid_full.csv")
    lr = selected_rotations_levered(P, reg)
    K.save(lr, "lev_selected_rotations.csv")
    print(lr[["rule", "lookback", "k", "filter", "cadence", "is_cagr", "is_maxdd", "oos_cagr", "oos_excess",
              "oos_maxdd", "oos_worst_year"]].round(3).to_string(index=False))
    lh, gaps = long_history()
    K.save(lh, "lev_long_history.csv")
    K.save(gaps, "lev_gap_weeks.csv")
    print(lh.round(3).to_string(index=False))
    print(gaps.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
