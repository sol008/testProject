"""Forward view at CAPE ~41: replay the test period (and 1986-2026 for the index switches) in a world
with lower equity returns and today's T-bill rate.

Replay: every equity ETF's daily log return is cut by the same constant so that SPY compounds at
FWD_SPY (5 %/yr, the top of the design's 3-6 % range; see research/00-SYSTEM-DESIGN-v3.md sec. 6) instead of
its realized 15 %; T-bills and leveraged-fund financing are set to FWD_RF = 4.0 %. Relative momentum
(which ETF led) is untouched, so what survives is the rule's structure, not the 2013-2026 bull market.
Also: rolling 10-year windows of the 1986-2026 3x index switches, raw and drift-adjusted."""
from __future__ import annotations

import numpy as np
import pandas as pd

import common27 as K
import s01_etf_grid as G
import s03_leverage as S3

FWD_SPY = 0.05
FWD_RF = 0.040       # the 13-week bill yielded 4.06 % on 2026-09-28 (track 08)
EQUITY = S3.EQUITY + K.COUNTRIES


def shifted_panel(delta_ann: float, rf_ann: float) -> K.Panel:
    base = G.get_panel()
    idx = base.idx
    C = pd.DataFrame(base.C, index=idx, columns=base.names)
    O = pd.DataFrame(base.O, index=idx, columns=base.names)
    d = np.log(1 + delta_ann) / 252.0
    t = np.arange(len(idx))
    for x in EQUITY:
        if x not in C:
            continue
        f = np.exp(-d * t)
        C[x] = C[x] * f
        O[x] = O[x] * f      # same factor for the day's open: the cut is spread over whole sessions
    rf = pd.Series(rf_ann / 252.0, index=idx)
    C["CASH"] = O["CASH"] = (1 + rf - K.CASH_FEE / 252.0).cumprod()
    syn = {}
    for x in ["SPY", "QQQ", "IWM", "MDY", "SMH", "EFA", "EEM"] + K.SECTORS9:
        for L in (2, 3):
            syn[f"L{L}_{x}"] = K.letf_series(C[x], rf, L, K.UNDERLYING_ER.get(x, 0.0009))
    for k2, v in syn.items():
        C[k2] = v
        u = C[k2.split("_", 1)[1]]
        gap = O[k2.split("_", 1)[1]] / u.shift(1) - 1
        Lx = int(k2[1])
        O[k2] = (v.shift(1) * (1 + Lx * gap)).fillna(v)
    return K.Panel(C, O, rf)


def replay(P: K.Panel, reg: pd.DataFrame, label: str) -> list[dict]:
    out = []
    spy = pd.Series(P.C[:, P.col["SPY"]], index=P.idx)
    rfs = pd.Series(P.rf, index=P.idx)
    cases = []
    for u in ["us4", "us13", "us14_smh", "global4", "sectors9"]:
        sel = K.select_is(reg, u)
        cases.append((f"{u} IS-selected ({sel['lookback']} k{int(sel['k'])} {sel['filter']} {sel['cadence']})",
                      G.UNIVERSES[u], sel["lookback"], int(sel["k"]), sel["filter"], bool(sel["voladj"]), sel["cadence"]))
    for x in ["SPY", "QQQ", "SMH"]:
        cases.append((f"{x} 200-day switch", [x], None, 1, "sma1", False, "W"))
        cases.append((f"{x} buy and hold", [x], None, 1, "hold", False, "W"))
    for name, uni, look, k, filt, va, cad in cases:
        if filt in ("sma1", "hold"):
            x = uni[0]
            ci = P.col[x]
            M = K.sma(P.C[:, [ci]])[:, 0]
            start = int(np.where(np.isfinite(M))[0][0]) + 60
            rows = K.decision_rows(P.idx, "W")
            rows = rows[rows >= start - 1]
            tl = [((x,) if (filt == "hold" or P.C[r, ci] > M[r]) else ("CASH",)) for r in rows]
        else:
            rows, tl = K.targets_for(P, uni, look, k, filt, va, cad)
            start = G.common_start(P, uni)
        for L in (1, 2, 3):
            tlL = [tuple(a if (a == "CASH" or L == 1) else f"L{L}_{a}" for a in t) for t in tl]
            res = K.run_engine(P, rows, tlL, k, mode="open", start_row=start)
            eq = res["equity"]
            row = dict(world=label, rule=name, L=L)
            st = K.period_stats(eq, spy, rfs, K.OOS_START, K.ASOF, "oos")
            st2 = K.period_stats(eq, spy, rfs, eq.index[0], K.IS_END, "is")
            row.update({k2: st.get(k2) for k2 in ("oos_cagr", "oos_spy_cagr", "oos_excess", "oos_maxdd", "oos_win5y")})
            row.update({k2: st2.get(k2) for k2 in ("is_cagr", "is_spy_cagr", "is_excess", "is_maxdd")})
            out.append(row)
    return out


def rolling_10y_index_switches() -> pd.DataFrame:
    """3x / 2x index switches, 1986-2026: distribution of rolling 10-year CAGR gaps vs the index,
    realized and with the index drift cut to FWD_SPY + financing at FWD_RF."""
    out = []
    for ix in ["^NDX", "^GSPC"]:
        raw = K.yf_raw(ix)
        c0 = raw["Close"].loc[:K.ASOF].dropna()
        o0 = raw["Open"].reindex(c0.index)
        o0 = o0.where(o0 > 0, c0)
        yrs = (c0.index[-1] - c0.index[0]).days / 365.25
        realized = (c0.iloc[-1] / c0.iloc[0]) ** (1 / yrs) - 1
        for world in ["realized", "forward"]:
            if world == "forward":
                d = np.log((1 + realized) / (1 + FWD_SPY)) / 252.0
                f = np.exp(-d * np.arange(len(c0)))
                c, o = c0 * f, o0 * f
                rf = pd.Series(FWD_RF / 252.0, index=c0.index)
            else:
                c, o = c0, o0
                rf = K.rf_daily(c0.index)
            M = c.rolling(200).mean()
            rows = K.decision_rows(c.index, "W")
            sig = pd.Series(np.nan, index=c.index)
            for r in rows:
                if np.isfinite(M.iloc[r]):
                    sig.iloc[min(r + 1, len(sig) - 1)] = float(c.iloc[r] > M.iloc[r])
            sig = sig.ffill().fillna(0.0)
            ru = c.pct_change().fillna(0.0)
            for L in (1, 2, 3):
                fund = L * ru - (L - 1) * (rf + K.LETF_SPREAD / 252) - (K.LETF_ER / 252 if L > 1 else 0.0)
                # switch days: out -> in earns the open->close leg; in -> out earns close->open leg (approximated
                # here at the close; the engine-based tables use the open)
                strat = np.where(sig > 0, fund, rf - K.CASH_FEE / 252) - sig.diff().abs().fillna(0) * 3e-4
                eq = pd.Series(np.cumprod(1 + strat), index=c.index)
                hold = pd.Series(np.cumprod(1 + fund.clip(lower=-0.999)), index=c.index)
                ixe = pd.Series(np.cumprod(1 + ru), index=c.index)
                m = eq.resample("ME").last()
                mh = hold.resample("ME").last()
                mi = ixe.resample("ME").last()
                for H in (5, 10):
                    n = 12 * H
                    g = ((m.shift(-n) / m) ** (1 / H) - (mi.shift(-n) / mi) ** (1 / H)).dropna()
                    gh = ((mh.shift(-n) / mh) ** (1 / H) - (mi.shift(-n) / mi) ** (1 / H)).dropna()
                    out.append(dict(index=ix, world=world, L=L, horizon_yrs=H, windows=len(g),
                                    switch_median_gap=g.median(), switch_p10_gap=g.quantile(0.1),
                                    switch_share_ge5=(g >= 0.05).mean(), switch_share_gt0=(g > 0).mean(),
                                    hold_median_gap=gh.median(), hold_share_ge5=(gh >= 0.05).mean(),
                                    switch_maxdd=K.maxdd(eq), hold_maxdd=K.maxdd(hold),
                                    switch_cagr=K.cagr_of(eq), index_cagr=K.cagr_of(ixe)))
    return pd.DataFrame(out)


def main():
    reg = pd.read_csv(K.SCRATCH / "etf_grid_full.csv")
    rows = []
    P0 = S3.lev_panel()
    rows += replay(P0, reg, "realized 2013-2026")
    spy = pd.Series(G.get_panel().C[:, G.get_panel().col["SPY"]], index=G.get_panel().idx)
    oos = K.slice_eq(spy, K.OOS_START, K.ASOF)
    realized = K.cagr_of(oos)
    for fwd in (FWD_SPY, 0.08):
        delta = (1 + realized) / (1 + fwd) - 1
        P1 = shifted_panel(delta, FWD_RF)
        rows += replay(P1, reg, f"forward: SPY {fwd:.0%}, T-bills {FWD_RF:.2%}")
    df = pd.DataFrame(rows)
    K.save(df, "forward_replay.csv")
    print(df.round(3).to_string(index=False))
    r10 = rolling_10y_index_switches()
    K.save(r10, "forward_rolling_index_switches.csv")
    print(r10.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
