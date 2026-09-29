"""Task 3: portfolio impact of a 60 / 90 / 120-day cap.

  (a) W10 expected contribution a year (pre-tax, over T-bills), 6% of NAV, one position at a time:
        design convention  = kappa x historical mean excess (over the era's bills);
        forward convention = forward S&P drift over the hold minus 4.2% bills + kappa x edge vs the era placebo;
      edges from SPY 1993-2026, the index 1990-2026 and the index 1928-2026.
  (b) M4 at 60 / 90 / 120 DTE from track 21's output files, re-computed at kappa = 0.25 as a sanity check.
  (c) Whole-book expected return (Phase A: M1, M3, W10 [+M2]; design Lean: M1, M3, M4, W8, W10 [+M2]).
  (d) Historical daily streams 1993-2026 and 2008-2026: M1 (6% x G), W10 (6% x G), M3 (3%), M2 (s = 0.5),
      bills; max drawdown, worst year, crisis windows.
  (e) Trades a year; SPY history.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common23 as K
import modules23 as M

CAL_RULE = {60: "CAL60", 90: "CAL90", 120: "CAL120"}
MODS_FIXED = {  # cap-insensitive modules: central, low, high (% of NAV a year over bills), design v3.2 / track 21
    "M1 ST-1 (6%)": (0.0008, 0.0005, 0.0010),
    "M3 BTC switch (3%)": (0.0010, -0.0030, 0.0050),
    "W8 (<=1% premium, Phase B)": (0.0002, -0.0010, 0.0020),
    "M2 trend, long-only ETF8 (s = 0.5)": (0.0060, 0.0000, 0.0120),
}


# ============================================================================ (a) W10 expectation
def w10_expectation(notional=0.06, tag="") -> pd.DataFrame:
    R = pd.read_csv(K.RESULTS / "w10_stats.csv")
    rows = []
    for cap in K.CAPS:
        rule = CAL_RULE[cap]
        for samp in ("SPY 1993-2026", "Index 1990-2026", "Index 1928-2026", "Index 1928-1989"):
            r = R[(R["sample"] == samp) & (R.rule == rule) & (R.version == "one at a time")].iloc[0]
            f = r.per_yr
            d = r.mean_days
            bills_f = (1 + K.BILLS_FWD) ** (d / 365.25) - 1
            rec = dict(cap=cap, rule=rule, basis=samp, trades_per_yr=f, notional=notional, mean=r["mean"],
                       mean_excess_hist=r.mean_excess, edge=r.edge_era, p_era=r.p_era, days=d)
            for kap in (0.5, 0.25):
                rec[f"design_k{kap}"] = f * notional * kap * r.mean_excess
                for lab, eq in K.EQ_FWD.items():
                    drift = (1 + eq) ** (d / 365.25) - 1 - bills_f
                    rec[f"fwd_{lab}_k{kap}"] = f * notional * (drift + kap * r.edge_era)
                rec[f"edge_gone_low"] = f * notional * ((1 + 0.03) ** (d / 365.25) - 1 - bills_f)
            rows.append(rec)
    E = pd.DataFrame(rows)
    K.save(E, f"portfolio_w10_expectation_detail{tag}")
    # planning summary: central = forward (4.5%) with kappa 0.5 on the 1928-2026 edge;
    # low = forward 3% with the edge gone; high = design convention (kappa 0.5 x SPY 1993-2026 mean excess)
    srows = []
    for cap in K.CAPS:
        full = E[(E.cap == cap) & (E.basis == "Index 1928-2026")].iloc[0]
        spy = E[(E.cap == cap) & (E.basis == "SPY 1993-2026")].iloc[0]
        idx90 = E[(E.cap == cap) & (E.basis == "Index 1990-2026")].iloc[0]
        srows.append(dict(cap=cap, central=full["fwd_mid_k0.5"], low=full["edge_gone_low"], high=spy["design_k0.5"],
                          fwd_1928_2026_edge_k05=full["fwd_mid_k0.5"], fwd_1990_edge_k05=idx90["fwd_mid_k0.5"],
                          fwd_1990_edge_k025=idx90["fwd_mid_k0.25"], fwd_spy_edge_k05=spy["fwd_mid_k0.5"],
                          design_spy_k05=spy["design_k0.5"], design_1928_2026_k05=full["design_k0.5"],
                          trades_per_yr_spy=spy.trades_per_yr, trades_per_yr_1928=full.trades_per_yr))
    S = pd.DataFrame(srows)
    K.save(S, f"portfolio_w10_expectation{tag}")
    for cap in K.CAPS:
        K.register("W10 contribution", f"cap {cap} notional {notional}", "planning", "diagnostic")
    return E, S


# ============================================================================ (b) M4 from track 21
def m4_from_track21() -> pd.DataFrame:
    F = pd.read_csv(K.T21 / "o2_forward_raw.csv")
    yrs = (pd.Timestamp("2026-09-25") - pd.Timestamp("1990-03-01")).days / 365.25
    freq = {60: 26 / yrs, 90: 22 / yrs, 120: 19 / yrs}           # one spread at a time (cool-down = DTE)
    rows = []
    for dte in (60, 90, 120):
        g = F[(F.dte == dte) & (F.cool == 60)]
        h = g[g.drift == "history"].iloc[0]
        bills = K.BILLS_FWD * dte / 365.0
        f = freq[dte]
        for kap in (0.5, 0.25):
            design = f * 0.02 * (kap * h.ev_mid - bills)
            fwd = {lab: f * 0.02 * (g[g.drift == lab].iloc[0].placebo + kap * h.edge - bills)
                   for lab in ("fwd_lo", "fwd_mid", "fwd_hi")}
            rows.append(dict(dte=dte, kappa=kap, trades_per_yr=f, ev_mid_hist=h.ev_mid, edge_hist=h.edge,
                             design=design, fwd_mid=fwd["fwd_mid"], fwd_lo=fwd["fwd_lo"], fwd_hi=fwd["fwd_hi"],
                             central_track21_style=0.5 * (design + fwd["fwd_mid"])))
    Mf = pd.DataFrame(rows)
    K.save(Mf, "portfolio_m4_from_track21")
    return Mf


# ============================================================================ (c) book expectation
def book_expectation(W: pd.DataFrame, M4: pd.DataFrame) -> pd.DataFrame:
    rows = []
    t21 = {60: (0.0005, -0.0014, 0.0014), 90: (0.0013, -0.0007, 0.0021), 120: (0.0011, -0.0006, 0.0017)}
    for cap in K.CAPS:
        w = W[W.cap == cap].iloc[0]
        w10 = (w.central, w.low, w.high) if cap != 60 else (0.0, 0.0, 0.0)       # 60 days: shadow (decision #5)
        m4k = M4[(M4.dte == cap) & (M4.kappa == 0.25)].iloc[0]
        m4_adj = (m4k.central_track21_style, m4k.fwd_lo, m4k.design)
        m4_t21 = t21[cap]
        m1, m3, w8, m2 = (MODS_FIXED[k] for k in MODS_FIXED)
        books = {
            "Phase A: M1 + M3 + W10": [m1, m3, w10],
            "Phase A + M2": [m1, m3, w10, m2],
            "Design Lean (M1, M3, M4, W8, W10), M4 per track 21": [m1, m3, m4_t21, w8, w10],
            "Design Lean + M2, M4 per track 21": [m1, m3, m4_t21, w8, w10, m2],
            "Design Lean, M4 at kappa 0.25": [m1, m3, m4_adj, w8, w10],
            "Design Lean + M2, M4 at kappa 0.25": [m1, m3, m4_adj, w8, w10, m2],
        }
        for name, parts in books.items():
            c = sum(p[0] for p in parts)
            lo = sum(p[1] for p in parts)
            hi = sum(p[2] for p in parts)
            rows.append(dict(cap=cap, book=name, central=c, low=lo, high=hi, nominal_central=K.BILLS_FWD + c,
                             nominal_low=K.BILLS_FWD + lo, nominal_high=K.BILLS_FWD + hi,
                             years_to_11x=np.log(11) / np.log(1 + K.BILLS_FWD + c),
                             w10_central=w10[0], m4_central=[p for p in parts if p in (m4_t21, m4_adj)][0][0]
                             if any(p in (m4_t21, m4_adj) for p in parts) else 0.0))
    B = pd.DataFrame(rows)
    K.save(B, "portfolio_book_expectation")
    return B


# ============================================================================ (d) streams
def streams(w10_notional=0.06, governor=True):
    s = K.spy()
    idx = s.index
    n = len(idx)
    aO, aC = s["aO"].values, s["aC"].values
    rf = K.rf_sessions().reindex(idx).fillna(0.0).values
    m3c, _ = M.m3_on_sessions(idx, start="2015-01-01")
    m2net, _, m2_rebal = M.m2_stream()
    m2c = m2net.reindex(idx).fillna(0.0).values
    m1 = M.m1_trades()
    trade_sets = {"M1": [(int(r.e), int(r.X), r.cost) for r in m1.itertuples()]}
    for cap, rule in CAL_RULE.items():
        w = M.w10_trades(rule)
        trade_sets[f"W10_{cap}"] = [(int(r.e), int(r.X), r.cost) for r in w.itertuples()]
    books = {
        "Lean A, 60-day cap (W10 shadow)": (["M1"], False),
        "Lean A, 60 + W10 at CAL60 (reference)": (["M1", "W10_60"], False),
        "Lean A, 90-day W10": (["M1", "W10_90"], False),
        "Lean A, 120-day W10": (["M1", "W10_120"], False),
        "Lean A + M2, 60-day cap (W10 shadow)": (["M1"], True),
        "Lean A + M2, 60 + W10 at CAL60 (reference)": (["M1", "W10_60"], True),
        "Lean A + M2, 90-day W10": (["M1", "W10_90"], True),
        "Lean A + M2, 120-day W10": (["M1", "W10_120"], True),
    }
    out = {}
    mod_streams = {}
    glog = []
    for name, (mods, with_m2) in books.items():
        nav = np.ones(n)
        peak = 1.0
        contrib = {m: np.zeros(n) for m in mods}
        base = {m: (0.06 if m == "M1" else w10_notional) for m in mods}
        starts = {m: {e: (X, c) for e, X, c in trade_sets[m]} for m in mods}
        active = {m: None for m in mods}          # (X, weight)
        r_book = np.zeros(n)
        for d in range(1, n):
            ret = rf[d] + m3c.iloc[d] + (m2c[d] if with_m2 else 0.0)
            dd = nav[d - 1] / peak - 1
            g = K.gov(dd) if governor else 1.0
            for m in mods:
                if d in starts[m] and active[m] is None:
                    X, c = starts[m][d]
                    active[m] = (X, base[m] * g, c)
                    glog.append(dict(book=name, module=m, entry=idx[d].date(), G=g, drawdown=dd))
                    w = active[m][1]
                    x = w * (aC[d] / aO[d] - 1 - c)
                elif active[m] is not None:
                    X, w, c = active[m]
                    if d == X:
                        x = w * (aO[d] / aC[d - 1] - 1 - c)
                        active[m] = None
                    else:
                        x = w * (aC[d] / aC[d - 1] - 1 - rf[d])
                else:
                    x = 0.0
                contrib[m][d] = x
                ret += x
            r_book[d] = ret
            nav[d] = nav[d - 1] * (1 + ret)
            peak = max(peak, nav[d])
        out[name] = pd.Series(r_book, index=idx)
        for m in mods:
            mod_streams[f"{name} | {m}"] = pd.Series(contrib[m], index=idx)
    out["SPY buy-and-hold"] = pd.Series(np.r_[0.0, aC[1:] / aC[:-1] - 1], index=idx)
    out["T-bills"] = pd.Series(rf, index=idx)
    mod_streams["M3 (3%)"] = pd.Series(m3c.values, index=idx)
    mod_streams["M2 (s = 0.5)"] = pd.Series(m2c, index=idx)
    G = pd.DataFrame(glog)
    K.save(G[G.G < 1], "portfolio_governor_cuts")
    return pd.DataFrame(out), pd.DataFrame(mod_streams), m2_rebal


def path_stats(S: pd.DataFrame, rf: pd.Series, a: str, b: str) -> pd.DataFrame:
    rows = []
    for c in S.columns:
        x = S[c].loc[a:b]
        r = rf.loc[a:b]
        yrs = (x.index[-1] - x.index[0]).days / 365.25
        nav = (1 + x).cumprod()
        exn = (1 + x - r).cumprod()
        yr_tot = (1 + x).groupby(x.index.year).prod() - 1
        yr_ex = yr_tot - ((1 + r).groupby(r.index.year).prod() - 1)
        ex = x - r
        rows.append(dict(period=f"{a[:4]}-{b[:4]}", book=c, cagr=nav.iloc[-1] ** (1 / yrs) - 1,
                         excess_cagr=exn.iloc[-1] ** (1 / yrs) - 1, vol=x.std() * np.sqrt(252),
                         sharpe=ex.mean() / ex.std() * np.sqrt(252) if ex.std() > 0 else np.nan,
                         max_dd=float((nav / nav.cummax() - 1).min()),
                         worst_year=float(yr_tot.min()), worst_year_when=int(yr_tot.idxmin()),
                         worst_year_excess=float(yr_ex.min()), worst_year_excess_when=int(yr_ex.idxmin()),
                         best_year=float(yr_tot.max())))
    return pd.DataFrame(rows)


def crisis_windows(S: pd.DataFrame) -> pd.DataFrame:
    wins = {"2000-02": ("2000-01-03", "2002-12-31"), "2008-09": ("2008-01-02", "2009-12-31"),
            "2018 Q4": ("2018-10-01", "2018-12-31"), "2020": ("2020-01-02", "2020-12-31"),
            "2022": ("2022-01-03", "2022-12-30")}
    rows = []
    for c in S.columns:
        for w, (a, b) in wins.items():
            x = S[c].loc[a:b]
            nav = (1 + x).cumprod()
            rows.append(dict(book=c, window=w, total=float(nav.iloc[-1] - 1), max_dd=float((nav / nav.cummax() - 1).min())))
    return pd.DataFrame(rows).pivot_table(index="book", columns="window", values=["max_dd", "total"])


# ============================================================================ (e) trades a year, SPY history
def trade_counts(m2_rebal: int) -> pd.DataFrame:
    yrs93 = (K.TODAY - pd.Timestamp("1993-01-29")).days / 365.25
    m1 = M.m1_trades()
    rows = [dict(module="M1 ST-1", trades_per_yr=len(m1) / yrs93, note="1993-2026 (first signal 1996)")]
    for cap, rule in CAL_RULE.items():
        w = M.w10_trades(rule)
        rows.append(dict(module=f"W10 ({rule})", trades_per_yr=len(w) / yrs93, note="SPY 1993-2026, one at a time"))
    pos, ret, sw = M.m3_daily()
    y3 = (pos.index[-1] - pd.Timestamp("2011-01-01")).days / 365.25
    ons = int(((pos.diff() > 0) & (pos.index >= "2011-01-01")).sum())
    rows.append(dict(module="M3 BTC switch", trades_per_yr=ons / y3, note="round trips (switch-ons) 2011-2026"))
    y2 = (K.TODAY - pd.Timestamp("2007-06-01")).days / 365.25
    rows.append(dict(module="M2 ETF8", trades_per_yr=m2_rebal / y2, note="rebalances with any order after the 25% band"))
    for dte in (60, 90, 120):
        w = M.o2_windows(dte)
        y4 = (pd.Timestamp("2026-09-25") - pd.Timestamp("1990-03-01")).days / 365.25
        rows.append(dict(module=f"M4 O2 {dte} DTE (Phase B)", trades_per_yr=len(w) / y4, note="1990-2026, one spread at a time"))
    rows.append(dict(module="W8 (Phase B)", trades_per_yr=0.4, note="design v3.2"))
    T = pd.DataFrame(rows)
    K.save(T, "portfolio_trades_per_year")
    return T


def spy_history() -> pd.DataFrame:
    tr = K.spx_tr()
    s = K.spy()["aC"]
    rf = K.rf_sessions()
    rows = []
    for lab, ser, a in (("S&P 500 TR", tr, "1928-01-03"), ("SPY", s, "1993-01-29"), ("SPY", s, "2008-01-02"),
                        ("S&P 500 TR", tr, "1993-01-29"), ("S&P 500 TR", tr, "2008-01-02")):
        x = ser.loc[a:]
        yrs = (x.index[-1] - x.index[0]).days / 365.25
        cagr = (x.iloc[-1] / x.iloc[0]) ** (1 / yrs) - 1
        ye = x.resample("YE").last()
        yr = pd.concat([pd.Series([x.iloc[0]], index=[x.index[0]]), ye]).pct_change().dropna()
        r = rf.loc[a:]
        bills = (1 + r).prod() ** (1 / yrs) - 1
        rows.append(dict(series=lab, start=a, end=str(x.index[-1].date()), cagr=cagr,
                         arith_mean_calendar_years=float(yr.mean()), bills_cagr=bills, excess_cagr=cagr - bills,
                         max_dd=float((x / x.cummax() - 1).min())))
    H = pd.DataFrame(rows)
    K.save(H, "portfolio_spy_history")
    return H


def main():
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    E, W = w10_expectation()
    print(W.round(5).to_string(index=False))
    print(E[["cap", "basis", "trades_per_yr", "mean", "mean_excess_hist", "edge", "design_k0.5", "fwd_mid_k0.5",
             "fwd_mid_k0.25", "fwd_low_k0.5", "edge_gone_low"]].round(5).to_string(index=False))
    for nt, tg in ((0.067, "_6.7pct"), (0.0416, "_4.2pct_horizon_stress")):
        print(tg, w10_expectation(nt, tg)[1][["cap", "central", "low", "high"]].round(5).to_string(index=False))
    M4 = m4_from_track21()
    print(M4.round(5).to_string(index=False))
    B = book_expectation(W, M4)
    print(B.round(5).to_string(index=False))
    S, MS, m2_rebal = streams()
    rf = S["T-bills"]
    P = pd.concat([path_stats(S, rf, "1993-02-01", "2026-09-28"), path_stats(S, rf, "2008-01-02", "2026-09-28")])
    K.save(P, "portfolio_history_paths")
    print(P.round(4).to_string(index=False))
    CW = crisis_windows(S)
    K.save(CW.reset_index(), "portfolio_crisis_windows")
    print(CW.round(4).to_string())
    # module stand-alone stats inside the streams
    mrows = []
    for c in MS.columns:
        for a, b in (("1993-02-01", "2026-09-28"), ("2008-01-02", "2026-09-28")):
            x = MS[c].loc[a:b]
            yrs = (x.index[-1] - x.index[0]).days / 365.25
            nav = (1 + x).cumprod()
            mrows.append(dict(stream=c, period=f"{a[:4]}-{b[:4]}", excess_pa=x.sum() / yrs,
                              max_dd=float((nav / nav.cummax() - 1).min()),
                              worst_year=float(((1 + x).groupby(x.index.year).prod() - 1).min())))
    MR = pd.DataFrame(mrows)
    K.save(MR, "portfolio_module_streams")
    print(MR.round(5).to_string(index=False))
    print(trade_counts(m2_rebal).round(3).to_string(index=False))
    print(spy_history().round(4).to_string(index=False))
    # compact daily book streams (monthly to keep the file small)
    Mo = (1 + S).resample("ME").prod() - 1
    K.save(Mo.reset_index().rename(columns={"Date": "month"}), "portfolio_monthly_book_returns")


if __name__ == "__main__":
    main()
