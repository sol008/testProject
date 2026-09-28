"""Track 13: multiple-testing accounting, in-sample selection -> out-of-sample test, deflated
Sharpe ratios, and the final candidate table.

Protocol
  1. Count every variant evaluated (results/variant_registry.csv, written by s01-s06).
  2. Within each family pick the variant with the highest in-sample (pre-2008) t-stat
     (n >= 8 trades) on the primary instrument, then report that one variant out of sample.
  3. For the finalists compute per-trade Sharpe, skew, kurtosis on the OOS trades and the
     deflated Sharpe ratio (Bailey & Lopez de Prado 2014) for N = all variants, N = the
     family's variants, and N = number of families; plus the Bonferroni t hurdle.
  4. Quarter-Kelly (on returns shrunk halfway to zero edge) and expected log-growth per
     year; after-tax excess return at the top ordinary rate, the 24% rate and 60/40 futures.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy import stats

from common13 import (SPLIT, TAX_1256_TOP, TAX_ST_MID, TAX_ST_TOP, TODAY, bonferroni_t, read_result,
                      deflated_sr, expected_max_z, load, rsi_wilder, run_rule, save, sma,
                      stream_stats, strategy_daily, trade_stats, RESULTS)

END = TODAY + pd.Timedelta(days=1)


def first_cross(cond: pd.Series, quiet: int = 20) -> pd.Series:
    prev = cond.shift(1).rolling(quiet, min_periods=1).max().fillna(0).astype(bool)
    return cond & ~prev


# ----------------------------------------------------------------------------- counting
def count_variants(reg: pd.DataFrame) -> pd.DataFrame:
    reg = reg.copy()
    reg["fam_top"] = reg["family"].str.split(":").str[0].str.split("|").str[0]
    g = reg.groupby(["script", "family"]).agg(variants=("variant", "nunique"),
                                              instruments=("ticker", "nunique"),
                                              evaluations=("variant", "size")).reset_index()
    return g


# ----------------------------------------------------------------------------- IS -> OOS
def u_daily(inst: str, lo, hi) -> float:
    """Mean daily total-return excess over T-bills of an instrument in [lo, hi)."""
    df = load(inst)
    x = (df["aC"].pct_change() - df["rf"]).loc[pd.Timestamp(lo):pd.Timestamp(hi) - pd.Timedelta(days=1)]
    return float(x.mean())


def select_then_test() -> pd.DataFrame:
    rows = []
    # panic sub-families on ^GSPC (close entries): IS 1986-2007, OOS 2008-2026.
    # Two selection criteria: raw excess t (rewards drift) and timing-edge t (excess minus
    # the unconditional H-session excess from random entry days).
    p = read_result("panic_all_variants.csv")
    p["t_edge"] = p["edge_vs_uncond"] / p["sd_ex"] * np.sqrt(p["n"])
    g = p[(p.inst == "^GSPC") & (p["mode"] == "close")]
    for (fam, crit) in [(f, c) for f in g["family"].unique() for c in ("t", "t_edge")]:
        gg = g[g.family == fam]
        isd = gg[(gg.period == "1986-2007 (IS)") & (gg.n >= 8)]
        if not len(isd):
            continue
        best = isd.sort_values(crit, ascending=False).iloc[0]
        key = (best.signal, best.filt, best.H)
        oos = gg[(gg.period == "2008-2026 (OOS)") & (gg.signal == key[0]) & (gg.filt == key[1]) & (gg.H == key[2])]
        spy = p[(p.inst == "SPY") & (p["mode"] == "open") & (p.period == "OOS (2008-)") & (p.signal == key[0]) &
                (p.filt == key[1]) & (p.H == key[2])]
        o = oos.iloc[0] if len(oos) else None
        s = spy.iloc[0] if len(spy) else None
        rows.append(dict(family="panic:" + fam, criterion=crit, n_variants=len(gg[gg.period == "1986-2007 (IS)"]),
                         selected=f"{key[0]} | {key[1]} | H{key[2]}", primary="^GSPC next close",
                         is_n=best.n, is_mean=best.mean_ex, is_t=best.t, is_edge=best.edge_vs_uncond,
                         is_t_edge=best.t_edge,
                         oos_n=o.n if o is not None else np.nan, oos_mean=o.mean_ex if o is not None else np.nan,
                         oos_t=o.t if o is not None else np.nan, oos_edge=o.edge_vs_uncond if o is not None else np.nan,
                         oos_t_edge=o.t_edge if o is not None else np.nan,
                         spy_oos_n=s.n if s is not None else np.nan, spy_oos_mean=s.mean_ex if s is not None else np.nan,
                         spy_oos_t=s.t if s is not None else np.nan,
                         spy_oos_t_edge=s.t_edge if s is not None else np.nan))
    # mean reversion: SPY next open, ^GSPC next close (timing edge = excess minus the
    # instrument's mean daily excess x average sessions held)
    m = read_result("meanrev_all.csv")
    for inst, mode, isp, oosp, (ilo, ihi), (olo, ohi) in (
            ("SPY", "open", "IS (<2008)", "OOS (2008-)", ("1993-01-01", SPLIT), (SPLIT, END)),
            ("^GSPC", "close", "1990-2007", "2008-2026", ("1990-01-01", SPLIT), (SPLIT, END))):
        g = m[(m.inst == inst) & (m["mode"] == mode)].copy()
        u_is, u_oos = u_daily(inst, ilo, ihi), u_daily(inst, olo, ohi)
        g["u"] = np.where(g.period == isp, u_is, u_oos)
        g["edge"] = g["mean_ex"] - g["u"] * g["sessions"]
        g["t_edge"] = g["edge"] / g["sd_ex"] * np.sqrt(g["n"])
        for crit in ("t", "t_edge"):
            isd = g[(g.period == isp) & (g.n >= 8)]
            best = isd.sort_values(crit, ascending=False).iloc[0]
            oos = g[(g.period == oosp) & (g.entry == best.entry) & (g.exit == best.exit) & (g.filt == best.filt)].iloc[0]
            rows.append(dict(family="meanrev", criterion=crit, n_variants=len(g[g.period == isp]),
                             selected=f"{best.entry} | {best.exit} | {best.filt}", primary=f"{inst} next {mode}",
                             is_n=best.n, is_mean=best.mean_ex, is_t=best.t, is_edge=best.edge, is_t_edge=best.t_edge,
                             oos_n=oos.n, oos_mean=oos.mean_ex, oos_t=oos.t, oos_edge=oos.edge, oos_t_edge=oos.t_edge))
    # Donchian: SPY next open
    d = read_result("donchian_all.csv")
    g = d[(d.inst == "SPY") & (d["mode"] == "open")]
    isd = g[g.period == "IS (<2008)"]
    best = isd.sort_values("t", ascending=False).iloc[0]
    oos = g[(g.period == "OOS (2008-)") & (g.variant == best.variant)].iloc[0]
    rows.append(dict(family="donchian", n_variants=len(isd), selected=best.variant, primary="SPY next open",
                     is_n=best.n, is_mean=best.mean_ex, is_t=best.t, is_edge=best.edge_vs_uncond,
                     oos_n=oos.n, oos_mean=oos.mean_ex, oos_t=oos.t, oos_edge=oos.edge_vs_uncond))
    # rotation: select on KF12 1927-2007, test KF12 2008- and sector SPDRs 2008-
    r = read_result("rotation_all.csv")
    isd = r[(r.universe == "KF12") & (r.period == "IS (<2008)")]
    best = isd.sort_values("rel_t", ascending=False).iloc[0]
    o1 = r[(r.universe == "KF12") & (r.period == "OOS (2008-)") & (r.variant == best.variant)].iloc[0]
    o2 = r[(r.universe == "sectors") & (r.period == "OOS (2008-)") & (r.variant == best.variant) & (r.fill == "open")].iloc[0]
    o3 = r[(r.universe == "countries") & (r.period == "OOS (2008-)") & (r.variant == best.variant) & (r.fill == "open")].iloc[0]
    rows.append(dict(family="rotation", n_variants=len(isd), selected=best.variant, primary="KF12 industries (monthly, vs equal weight)",
                     is_n=best.months, is_mean=best.rel_mean_m, is_t=best.rel_t,
                     oos_n=o1.months, oos_mean=o1.rel_mean_m, oos_t=o1.rel_t,
                     spy_oos_n=o2.months, spy_oos_mean=o2.rel_mean_m, spy_oos_t=o2.rel_t,
                     note=f"sector SPDRs OOS in spy_* columns; country ETFs OOS rel {o3.rel_mean_m:.4f}/month t {o3.rel_t:.2f}"))
    # calendar: each rule pre-registered (one variant): pre-publication vs 2008+ (edge vs drift)
    c = read_result("calendar_all.csv")
    for rule in ("TOM", "PREHOL", "FOMC", "CPI", "OPEX", "POSTOPEX", "MIDTERM|H60|event-years",
                 "ELECTION|H20|event-years"):
        g = c[(c.inst == "^GSPC") & (c.rule == rule)]
        pre = g[g.period.isin(["pre-pub", "pre-1970"])]
        post = g[g.period == "2008-2026"]
        if not len(pre) or not len(post):
            continue
        pre, post = pre.iloc[0], post.iloc[0]
        rows.append(dict(family="calendar:" + rule.split("|")[0], n_variants=1, selected=rule, primary="^GSPC MOC-to-MOC",
                         is_n=pre.n, is_mean=pre.mean_ex, is_t=pre.t, is_edge=pre.edge,
                         oos_n=post.n, oos_mean=post.mean_ex, oos_t=post.t, oos_edge=post.edge))
    out = pd.DataFrame(rows)
    save(out, "is_selected_oos.csv")
    return out


# ----------------------------------------------------------------------------- finalists
def finalist_trades():
    """Trade lists for the finalists (OOS 2008- and full)."""
    F = {}
    spy = load("SPY")
    c = spy["C"]
    r2 = rsi_wilder(c, 2)
    dip = (r2 < 10) & (c > sma(c, 200))
    sma5 = c > sma(c, 5)
    vix_s = load("^VIX")["C"].reindex(spy.index)
    # ST-1 (recommended): VIX-gated dip-buy, exit on the first close above the 5-day SMA.
    # The exit was chosen on pre-2008 evidence (SPY 1993-2007 t 4.8 vs 4.3; S&P 1986-2007
    # t 4.1 vs 2.5 and a -4% instead of -21% trade in Oct 1987); OOS the two exits tie.
    F["ST-1 dip-buy SPY: RSI2<10 & >SMA200 & VIX>=20; exit close>SMA5 (cap 20); next open"] = (
        spy, run_rule(spy, dip & (vix_s >= 20), mode="open", hold=20, exit_sig=sma5))
    F["ST-1 variant with RSI2>70 exit"] = (
        spy, run_rule(spy, dip & (vix_s >= 20), mode="open", hold=20, exit_sig=r2 > 70))
    F["ST-1b dip-buy SPY without VIX gate (exit close>SMA5)"] = (
        spy, run_rule(spy, dip, mode="open", hold=20, exit_sig=sma5))
    F["ST-1b variant with RSI2>70 exit (IS-best by t on SPY)"] = (
        spy, run_rule(spy, dip, mode="open", hold=20, exit_sig=r2 > 70))
    qqq = load("QQQ")
    cq = qqq["C"]
    r2q = rsi_wilder(cq, 2)
    dipq = (r2q < 10) & (cq > sma(cq, 200))
    F["ST-1b on QQQ (exit close>SMA5)"] = (qqq, run_rule(qqq, dipq, mode="open", hold=20, exit_sig=cq > sma(cq, 5)))
    gs0 = load("^GSPC")
    cg = gs0["C"]
    r2g = rsi_wilder(cg, 2)
    F["ST-1b on ^GSPC 1928-2026 (next close, exit close>SMA5)"] = (
        gs0, run_rule(gs0, (r2g < 10) & (cg > sma(cg, 200)), mode="close", hold=20, exit_sig=cg > sma(cg, 5)))
    from common13 import fred as _fred
    vxo = _fred("VXOCLS")
    vv = load("^VIX")["C"]
    gauge = pd.concat([vxo[vxo.index < "1990-01-02"], vv[vv.index >= "1990-01-02"]]).reindex(gs0.index)
    ent = (r2g < 10) & (cg > sma(cg, 200)) & (gauge >= 20)
    ent[gs0.index < "1986-01-02"] = False
    F["ST-1 on ^GSPC 1986-2026 (VXO/VIX gate, next close, exit close>SMA5)"] = (
        gs0, run_rule(gs0, ent, mode="close", hold=20, exit_sig=cg > sma(cg, 5)))
    vix = load("^VIX")["C"].reindex(spy.index)
    v3 = load("^VIX3M")["C"].reindex(spy.index)
    vt = first_cross((vix / v3 >= 1.0).fillna(False)) & (c > sma(c, 200))
    F["C2 VIX/VIX3M>=1 first cross & SPY>SMA200, hold 20, next open (in-sample only)"] = (
        spy, run_rule(spy, vt, mode="open", hold=20))
    # midterm: close of last September session of midterm years, 60 sessions (MOC both ways)
    ent = pd.Series(False, index=spy.index)
    for y in range(1994, 2023, 4):          # midterm years with a completed window
        p = spy.index.searchsorted(pd.Timestamp(y, 9, 30), side="right") - 1
        ent.iloc[p] = True
    F["C3 midterm Q4 (SPY, last Sep close -> +60 sessions)"] = (spy, run_rule(spy, ent, mode="ideal", hold=60))
    gs = load("^GSPC")
    ent = pd.Series(False, index=gs.index)
    for y in range(1930, 2023, 4):
        p = gs.index.searchsorted(pd.Timestamp(y, 9, 30), side="right") - 1
        ent.iloc[p] = True
    F["C3 midterm Q4 (^GSPC 1930-2022)"] = (gs, run_rule(gs, ent, mode="ideal", hold=60))
    return F


def finalist_table(F, N_all, N_fam_map, N_families):
    rows = []
    for name, (df, tr) in F.items():
        for pname, (lo, hi) in {"IS (<2008)": (df.index[0], SPLIT), "OOS (2008-)": (SPLIT, END),
                                "full": (df.index[0], END)}.items():
            sub = tr[(tr["signal"] >= pd.Timestamp(lo)) & (tr["signal"] < pd.Timestamp(hi))]
            if len(sub) < 3:
                continue
            lo2, hi2 = max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1])
            st = trade_stats(sub, lo2, hi2)
            r = strategy_daily(df, sub, lo2, hi2)
            ss = stream_stats(r, df["rf"])
            x = sub["excess"].values
            sr = st["sr_trade"]
            u = u_daily(df.attrs.get("ticker"), lo2, hi2 + pd.Timedelta(days=1))
            edge_i = sub["excess"].values - u * sub["sessions"].values
            st["edge"] = float(edge_i.mean())
            st["t_edge"] = float(edge_i.mean() / edge_i.std(ddof=1) * np.sqrt(len(edge_i)))
            fam = "meanrev" if name.startswith("ST-1") else ("panic" if name.startswith("C2") else "calendar")
            nf = N_fam_map.get(fam, 50)
            row = dict(candidate=name, period=pname, **st, strat_cagr=ss.get("cagr"), strat_sharpe=ss.get("sharpe"),
                       strat_mdd=ss.get("mdd"),
                       exposure=float(sub["sessions"].sum() / max(len(df.loc[lo2:hi2]), 1)),
                       dsr_N_all=deflated_sr(sr, st["n"], st["skew"], st["kurt"], N_all),
                       dsr_N_family=deflated_sr(sr, st["n"], st["skew"], st["kurt"], nf),
                       dsr_N_families=deflated_sr(sr, st["n"], st["skew"], st["kurt"], N_families),
                       dsr_single=deflated_sr(sr, st["n"], st["skew"], st["kurt"], 1),
                       excess_per_yr_1x=st["mean_ex"] * st["per_yr"],
                       after_tax_top=st["mean_ex"] * st["per_yr"] * (1 - TAX_ST_TOP),
                       after_tax_24=st["mean_ex"] * st["per_yr"] * (1 - TAX_ST_MID),
                       after_tax_1256=st["mean_ex"] * st["per_yr"] * (1 - TAX_1256_TOP))
            rows.append(row)
    return pd.DataFrame(rows)


def cost_sensitivity(F):
    rows = []
    for name, (df, tr) in F.items():
        if not (name.startswith("ST-1") or name.startswith("C2")):
            continue
        sub = tr[tr["signal"] >= SPLIT]
        for c in (0.0, 1.0, 2.0, 5.0, 10.0, 20.0):
            # re-price costs on the same trades
            net = sub["exit_px"] * (1 - c / 1e4) / (sub["entry_px"] * (1 + c / 1e4)) - 1
            ex = net - sub["rf"]
            rows.append(dict(candidate=name, cost_bps_side=c, mean_net=net.mean(), t=ex.mean() / ex.std() * np.sqrt(len(ex)),
                             excess_per_yr=ex.mean() * len(ex) / ((END - SPLIT).days / 365.25)))
    return pd.DataFrame(rows)


def main():
    reg = read_result("variant_registry.csv")
    cnt = count_variants(reg)
    save(cnt, "variant_counts.csv")
    # distinct hypotheses (family, variant) regardless of instrument / fill / period
    distinct = reg.drop_duplicates(["family", "variant"])
    N_all = len(distinct)
    fam_top = distinct["family"].str.split(":").str[0].str.split("|").str[0]
    N_fam_map = fam_top.value_counts().to_dict()
    N_families = distinct["family"].nunique()
    print("distinct variants:", N_all, "families:", N_families, N_fam_map)
    print("E[max Z] for N_all:", round(expected_max_z(N_all), 2), " Bonferroni t (5%, two-sided):",
          round(bonferroni_t(N_all), 2))
    sel = select_then_test()
    F = finalist_trades()
    ft = finalist_table(F, N_all, N_fam_map, N_families)
    save(ft, "finalists.csv")
    cs = cost_sensitivity(F)
    save(cs, "finalists_cost_sensitivity.csv")
    for name, (df, tr) in F.items():
        tag = name.split(" ")[0]
        save(tr, f"finalist_trades_{tag}_{df.attrs.get('ticker', '').replace('^', '')}.csv")
    meta = pd.DataFrame([dict(N_all=N_all, N_families=N_families, E_max_z_all=expected_max_z(N_all),
                              bonferroni_t_all=bonferroni_t(N_all), E_max_z_families=expected_max_z(N_families),
                              bonferroni_t_families=bonferroni_t(N_families), **{f"N_{k}": v for k, v in N_fam_map.items()})])
    save(meta, "multiple_testing_meta.csv")
    pd.set_option("display.width", 250)
    print(sel.round(4).to_string(index=False))
    print(ft.round(4).to_string(index=False))
    print(cs.round(5).to_string(index=False))


if __name__ == "__main__":
    main()
