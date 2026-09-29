"""Track 22 summary: multiple testing, design -> test selection, stress-based sizing and kappa-shrunk
contributions for the candidate families at H42 (60-day cap), H63 (90-day) and H84 (120-day).

Writes results/summary_*.csv and prints the tables used in research/22-duration-cap-new-strategies.md.
"""
from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd

import common22 as K

R = K.RESULTS
FWD_T_BILL = 0.042
# forward-looking excess drift over T-bills, % a year (central, low, high)
FWD = {"US equity": (0.003, -0.012, 0.018),        # SPY 3-6% nominal at CAPE ~41 vs bills 4.2%
       "Intl equity": (0.015, -0.005, 0.030),      # cheaper ex-US valuations
       "HY credit": (0.010, 0.000, 0.020),         # OAS ~2.9% minus expected default losses
       "Treasuries": (0.010, 0.000, 0.015)}        # 10y ~5.2% vs bills 4.2% if yields unchanged


# ============================================================================ variant counts
def load_regs() -> dict[str, pd.DataFrame]:
    out = {}
    for f in ["a_index_fear", "b_credit", "d_intl", "e_btc", "f_seasonal", "g_bonds", "h_gold", "i_macro"]:
        out[f] = pd.read_csv(R / f"registry_{f}.csv")
    out["c_trend"] = pd.read_csv(R / "registry_c_trend.csv")
    return out


def variant_counts(regs) -> pd.DataFrame:
    rows = []
    for f, df in regs.items():
        if f == "c_trend":
            n = df[df["period"] == "design"]["variant"].nunique() + df[df["universe"] == "ETF8"]["variant"].nunique()
        elif f == "d_intl":
            n = df["variant"].nunique()
        elif f == "h_gold":
            n = df["variant"].nunique()
        else:
            n = df[df["role"].str.startswith("design")]["variant"].nunique()
        rows.append(dict(family=f, variants=n))
    v = pd.DataFrame(rows)
    return v


# ============================================================================ selection protocol
def selection(regs, N_total) -> pd.DataFrame:
    rows = []
    spec = {  # family: (design role, test role(s), min n)
        "a_index_fear": ("design", ["test_exec", "test"], 8),
        "b_credit": ("design_eq", ["test_eq_exec", "test_eq"], 5),
        "b_credit_hy": ("design", ["test_exec", "test"], 3),
        "e_btc": ("design", ["test"], 2),
        "f_seasonal": ("design", ["test_exec", "test"], 8),
        "g_bonds": ("design", ["test_exec", "test"], 8),
        "h_gold": ("design", ["test_exec", "test"], 5),
        "i_macro": ("design", ["test_exec", "test"], 8),
    }
    for fam, (drole, troles, mn) in spec.items():
        df = regs["b_credit" if fam.startswith("b_credit") else fam]
        Nf = df[df["role"] == drole]["variant"].nunique()
        d = df[(df["role"] == drole) & (df["n"] >= mn)].copy()
        if fam.startswith("a_") or fam.startswith("f_"):
            d = d[d["instrument"] == "^GSPC"]
        d = d.dropna(subset=["z_placebo"])
        if len(d) == 0:
            continue
        best = d.sort_values("z_placebo", ascending=False).iloc[0]
        t = pd.DataFrame()
        for tr in troles:
            t = df[(df["role"] == tr) & (df["variant"] == best["variant"])]
            if len(t):
                break
        trow = t.iloc[0] if len(t) else None
        rows.append(dict(
            family=fam, N_family=Nf, selected=best["variant"], design_n=int(best["n"]),
            design_edge=best["edge"], design_z=best["z_placebo"], design_p=best["p_placebo"],
            test_role=trow["role"] if trow is not None else "", test_n=int(trow["n"]) if trow is not None else 0,
            test_mean=trow["mean_net"] if trow is not None else np.nan,
            test_edge=trow["edge"] if trow is not None else np.nan,
            test_t=trow["t_edge"] if trow is not None else np.nan,
            test_p=trow["p_placebo"] if trow is not None else np.nan,
            bonf_t_family=K.bonferroni_t(max(Nf, 1)), bonf_t_total=K.bonferroni_t(N_total),
            dsr_test_family=K.dsr_row(trow.to_dict(), Nf) if trow is not None and trow["n"] >= 3 else np.nan,
            dsr_test_total=K.dsr_row(trow.to_dict(), N_total) if trow is not None and trow["n"] >= 3 else np.nan,
        ))
    # (d) pooled international: select on design t_cluster (n >= 5)
    P = pd.read_csv(R / "pooled_d_intl.csv")
    d = P[(P["role"] == "design") & (P["n"] >= 5)].sort_values("t_cluster", ascending=False)
    if len(d):
        b = d.iloc[0]
        t = P[(P["role"] == "test_exec") & (P["variant"] == b["variant"])].iloc[0]
        Nf = P["variant"].nunique()
        rows.append(dict(family="d_intl (pooled, cluster-t)", N_family=Nf, selected=b["variant"],
                         design_n=int(b["n"]), design_edge=b["edge"], design_z=b["t_cluster"], design_p=np.nan,
                         test_role="test_exec", test_n=int(t["n"]), test_mean=t["mean_net"], test_edge=t["edge"],
                         test_t=t["t_cluster"], test_p=np.nan, bonf_t_family=K.bonferroni_t(Nf),
                         bonf_t_total=K.bonferroni_t(N_total),
                         dsr_test_family=K.deflated_sr(t["sr_edge"], int(t["clusters"]), t["skew_edge"], t["kurt_edge"], Nf),
                         dsr_test_total=K.deflated_sr(t["sr_edge"], int(t["clusters"]), t["skew_edge"], t["kurt_edge"], N_total)))
    # (c) trend: design-selected H by design Sharpe for L252 LO on MICRO8 -> test on ETF8 LO
    C = pd.read_csv(R / "registry_c_trend.csv")
    dsg = C[(C["universe"] == "MICRO8") & (C["period"] == "design") & (C["long_only"])]
    b = dsg.sort_values("sharpe", ascending=False).iloc[0]
    t = C[(C["universe"] == "ETF8") & (C["period"] == "test") & (C["long_only"]) & (C["L"] == b["L"]) & (C["H"] == b["H"])].iloc[0]
    rows.append(dict(family="c_trend (Sharpe)", N_family=C["variant"].nunique(), selected=f"LO L{b['L']} H{b['H']}",
                     design_n=np.nan, design_edge=np.nan, design_z=b["sharpe"], design_p=np.nan,
                     test_role="ETF8 test", test_n=np.nan, test_mean=np.nan, test_edge=np.nan, test_t=t["sharpe"],
                     test_p=np.nan, bonf_t_family=np.nan, bonf_t_total=np.nan, dsr_test_family=np.nan, dsr_test_total=np.nan))
    return pd.DataFrame(rows)


# ============================================================================ stress
def stress_table() -> pd.DataFrame:
    rows = []
    spx = K.load("^GSPC")

    def add(name, tr, note):
        rows.append(dict(instrument=name, s10=K.worst_window_loss(tr, 10), s42=K.worst_window_loss(tr, 42),
                         s63=K.worst_window_loss(tr, 63), s84=K.worst_window_loss(tr, 84), source=note))
    add("SPY (S&P 500 TR 1928-)", spx["aC"], "S&P 500 total return, 1928-2026")
    for t in ("SPY", "HYG", "JNK", "VWEHX", "EFA", "EEM", "EWJ", "EWG", "EWZ", "EWY", "IEF", "TLT", "GLD"):
        try:
            add(t, K.load(t)["aC"], "own history")
        except Exception as e:  # noqa: BLE001
            print("stress skip", t, e)
    add("Long bond synthetic 1962-", K.bond_tr(30), "FRED yields")
    add("10y synthetic 1962-", K.bond_tr(10), "FRED yields")
    import fe_btc
    add("BTC (daily, 7-day weeks)", fe_btc.btc_series(), "Coin Metrics + Yahoo (10/42/63/84 calendar days)")
    return pd.DataFrame(rows)


# ============================================================================ special runs
def union_and_w10() -> pd.DataFrame:
    """(1) W10 reconciliation with track 17 (1990-2026; day-0 close vs next close vs next open);
    (2) the 'uptrend shock' union: first of {VIX >= 30 first close, S&P -3% day} with the prior close
    above the 200-day average (a post-hoc composite of two pre-specified cells -- labelled as such)."""
    import fa_index_fear as FA
    spx = K.load("^GSPC")
    spy = K.load("SPY")
    gauge = K.vix_gauge(spx)
    sigs = FA.build_signals(spx, gauge)
    up200 = (spx["C"].shift(1) > K.sma(spx["C"], 200).shift(1))
    w10 = (sigs["DAY-3"] & up200).fillna(False)
    vix30 = (sigs["VIX>=30"] & up200).fillna(False)
    union = (w10 | vix30)
    rows = []
    # W10 reconciliation: signal-close ('ideal') entry, price-only vs TR, 1990-2026, H60
    for mode, lbl in (("close", "next close"),):
        for a, b in (("1990-01-01", None), ("1928-01-01", "1989-12-31")):
            tr, st = K.evaluate(spx, w10, 60, mode, a, b, vix=gauge)
            rows.append(dict(rule="W10 (DAY-3 up200)", H=60, entry=lbl, period=st["period"], **{k: st.get(k) for k in
                        ("n", "mean_net", "median_net", "win", "worst", "base", "edge", "t_edge", "p_placebo")}))
    # day-0 close entry: shift the signal back one session and use 'close' mode (entry at the signal close)
    w10_prev = w10.shift(-1, fill_value=False)
    for a, b in (("1990-01-01", None), ("1928-01-01", "1989-12-31")):
        tr, st = K.evaluate(spx, w10_prev, 60, "close", a, b, vix=gauge)
        rows.append(dict(rule="W10 (DAY-3 up200)", H=60, entry="crash-day close (track 17)", period=st["period"],
                         **{k: st.get(k) for k in ("n", "mean_net", "median_net", "win", "worst", "base", "edge", "t_edge", "p_placebo")}))
    tr, st = K.evaluate(spy, w10.reindex(spy.index).fillna(False), 60, "open", "1993-02-01", None, vix=gauge)
    rows.append(dict(rule="W10 (DAY-3 up200)", H=60, entry="SPY next open", period=st["period"],
                     **{k: st.get(k) for k in ("n", "mean_net", "median_net", "win", "worst", "base", "edge", "t_edge", "p_placebo")}))
    # union rule
    reg = K.Registry("a_union")
    for H in (42, 60, 63, 84):
        for role, df, mode, a, b in (("design", spx, "close", "1928-01-01", "2007-12-31"),
                                     ("design_1928_85", spx, "close", "1928-01-01", "1985-12-31"),
                                     ("design_1986_07", spx, "close", "1986-01-01", "2007-12-31"),
                                     ("test", spx, "close", "2008-01-01", None),
                                     ("test_exec", spy, "open", "2008-01-01", None),
                                     ("full", spx, "close", "1928-01-01", None),
                                     ("full_exec", spy, "open", "1993-02-01", None)):
            tr, st = K.evaluate(df, union.reindex(df.index).fillna(False), H, mode, a, b, vix=gauge)
            reg.add(f"UNION|H{H}", df.attrs["ticker"], role, st, tr)
            rows.append(dict(rule="UNION (VIX>=30 or -3% day, up200)", H=H, entry=f"{mode} {df.attrs['ticker']}",
                             period=role + " " + st["period"],
                             **{k: st.get(k) for k in ("n", "mean_net", "median_net", "win", "worst", "base", "edge", "t_edge", "p_placebo")},
                             mdd=st.get("mdd"), per_yr=st.get("per_yr")))
    reg.save("registry_a_union.csv")
    return pd.DataFrame(rows)


# ============================================================================ contributions
def candidates(regs) -> list[dict]:
    """Candidate cells: (label, family registry, variant pattern {H}, executable role, full role,
    design role, test role, asset class, stress instrument)."""
    a = regs["a_index_fear"]
    U = pd.read_csv(R / "registry_a_union.csv")
    b = regs["b_credit"]
    f = regs["f_seasonal"]
    P = pd.read_csv(R / "pooled_d_intl.csv")
    out = []

    def pick(df, v, role, inst=None):
        x = df[(df["variant"] == v) & (df["role"] == role)]
        if inst is not None:
            x = x[x["instrument"] == inst]
        return x.iloc[0].to_dict() if len(x) else None
    for H in (42, 63, 84):
        out.append(dict(label="W10: -3% day in an uptrend", H=H, cls="US equity", stress="SPY",
                        full=pick(a, f"DAY-3|up200|H{H}", "full"), design=pick(a, f"DAY-3|up200|H{H}", "design"),
                        test=pick(a, f"DAY-3|up200|H{H}", "test_exec")))
        out.append(dict(label="VIX>=30 first close in an uptrend", H=H, cls="US equity", stress="SPY",
                        full=pick(a, f"VIX>=30|up200|H{H}", "full"), design=pick(a, f"VIX>=30|up200|H{H}", "design"),
                        test=pick(a, f"VIX>=30|up200|H{H}", "test_exec")))
        out.append(dict(label="Uptrend shock (union of the two)", H=H, cls="US equity", stress="SPY",
                        full=pick(U, f"UNION|H{H}", "full"), design=pick(U, f"UNION|H{H}", "design"),
                        test=pick(U, f"UNION|H{H}", "test_exec")))
        out.append(dict(label="Credit crisis (Baa-10y >= 3.5% month end) in HY", H=H, cls="HY credit", stress="HYG",
                        full=pick(b, f"ABS35|every|H{H}", "full"), design=pick(b, f"ABS35|every|H{H}", "design"),
                        test=pick(b, f"ABS35|every|H{H}", "test_exec")))
        out.append(dict(label="Credit crisis (Baa-10y >= 3.5%) in SPY", H=H, cls="US equity", stress="SPY",
                        full=pick(b, f"ABS35|every|H{H}", "full_eq"), design=pick(b, f"ABS35|every|H{H}", "design_eq"),
                        test=pick(b, f"ABS35|every|H{H}", "test_eq_exec")))
        dfull = P[(P["variant"] == f"DD-20|p10<1.3|H{H}") & (P["role"] == "test_exec")]
        ddes = P[(P["variant"] == f"DD-20|p10<1.3|H{H}") & (P["role"] == "design")]
        dt = dfull.iloc[0].to_dict() if len(dfull) else None
        if dt:
            dt["per_yr"] = dt["episodes_per_yr"]          # one position per crisis month cluster
            dt["p_placebo"] = np.nan
            dt["t_edge"] = dt["t_cluster"]
            dt["mdd"] = np.nan
        dd = ddes.iloc[0].to_dict() if len(ddes) else None
        out.append(dict(label="Intl -20% crash, price < 1.3x 10y avg (USD ETF)", H=H, cls="Intl equity", stress="EEM",
                        full=dt, design=dd, test=dt))
        out.append(dict(label="Midterm-year Q4 (end-Sep entry)", H=H, cls="US equity", stress="SPY",
                        full=pick(f, f"MIDTERM-SEP|H{H}", "full"), design=pick(f, f"MIDTERM-SEP|H{H}", "design"),
                        test=pick(f, f"MIDTERM-SEP|H{H}", "test_exec")))
    return out


N_EFF = {  # independent episodes behind each candidate (for kappa and the n < 10 paper-only rule)
    "Intl": "clusters",            # crisis months across markets (crashes are global)
    "Credit crisis (Baa-10y >= 3.5% month end) in HY": 5,   # 1982, 2002, 2008-09, 2016, 2020 (VWEHX era)
    "Credit crisis (Baa-10y >= 3.5%) in SPY": 9,            # 1921/31/34/38, 1982, 2002, 2008, 2016, 2020
}


def contributions(cands, stress: pd.DataFrame, N_family: int, N_total: int) -> pd.DataFrame:
    st = stress.set_index("instrument")
    s10 = {"SPY": abs(st.loc["SPY (S&P 500 TR 1928-)", "s10"]), "HYG": abs(st.loc["HYG", "s10"]),
           "EEM": abs(st.loc["EEM", "s10"])}
    sH = {k: {H: abs(st.loc[("SPY (S&P 500 TR 1928-)" if k == "SPY" else k), f"s{H}"]) for H in (42, 63, 84)} for k in s10}
    rows = []
    for c in cands:
        fu, de, te = c["full"], c["design"], c["test"]
        if fu is None or te is None:
            continue
        H = c["H"]
        n_full = int(fu["n"]) if fu.get("n") == fu.get("n") else 0
        n_eff = n_full
        for k, v in N_EFF.items():
            if c["label"].startswith(k):
                n_eff = int(fu["clusters"]) if v == "clusters" else v
        kap = K.kappa_for(n_eff)
        status = "live-eligible (kappa 0.5)" if n_eff >= 20 else ("kappa 0.25" if n_eff >= 10 else "paper only (n_eff < 10)")
        dsr_f = K.dsr_row(te, N_family) if te.get("sr_edge") == te.get("sr_edge") and te.get("n", 0) >= 3 else np.nan
        dsr_t = K.dsr_row(te, N_total) if te.get("sr_edge") == te.get("sr_edge") and te.get("n", 0) >= 3 else np.nan
        notional = min(0.02 / s10[c["stress"]], 0.10)
        notional_h = min(0.02 / sH[c["stress"]][H], 0.10)
        per_yr = fu["per_yr"] if c["label"].startswith("Intl") else fu["per_yr"]
        base_hist = fu["base"]
        edge = fu["edge"]
        fc, flo, fhi = FWD[c["cls"]]
        yrs_h = H / 252.0
        ctr_hist = K.contribution(per_yr, notional, base_hist, edge, kap)
        ctr_fwd = K.contribution(per_yr, notional, fc * yrs_h, edge, kap)
        ctr_fwd_lo = K.contribution(per_yr, notional_h, flo * yrs_h, edge * 0.0, kap)   # edge fully gone, low drift
        ctr_fwd_hi = K.contribution(per_yr, notional, fhi * yrs_h, edge, 0.5 if kap >= 0.25 else kap)
        dg = notional * (fc * yrs_h + kap * edge) - 0.5 * notional ** 2 * (te.get("sd_edge") or 0.1) ** 2
        rows.append(dict(
            label=c["label"], H=H, cap=K.CAP_OF[H], asset=c["cls"],
            n_full=n_full, n_eff=n_eff, status=status, dsr_test_Nfam=dsr_f, dsr_test_Ntot=dsr_t, per_yr=per_yr, win=fu.get("win"), mean=fu.get("mean_net"), median=fu.get("median_net"),
            worst=fu.get("worst"), mdd=fu.get("mdd"),
            design_n=(de or {}).get("n"), design_edge=(de or {}).get("edge"), design_t=(de or {}).get("t_edge", (de or {}).get("t_cluster")),
            test_n=te.get("n"), test_edge=te.get("edge"), test_t=te.get("t_edge"),
            full_edge=edge, full_p=fu.get("p_placebo"), base_hist=base_hist, kappa=kap,
            notional=notional, notional_horizon_stress=notional_h,
            ctr_hist=ctr_hist, ctr_fwd=ctr_fwd, ctr_fwd_lo=ctr_fwd_lo, ctr_fwd_hi=ctr_fwd_hi, dg_trade_bp=1e4 * dg))
    return pd.DataFrame(rows)


def main():
    regs = load_regs()
    vc = variant_counts(regs)
    N_total = int(vc["variants"].sum())
    vc.loc[len(vc)] = dict(family="TOTAL", variants=N_total)
    vc["bonferroni_t"] = vc["variants"].apply(lambda n: K.bonferroni_t(int(n)))
    vc["expected_max_t_noise"] = vc["variants"].apply(lambda n: K.expected_max_z(int(n)))
    vc.to_csv(R / "summary_variant_counts.csv", index=False, float_format="%.3g")
    print(vc.to_string())
    uw = union_and_w10()
    uw.to_csv(R / "summary_w10_union.csv", index=False, float_format="%.5g")
    print(uw.round(4).to_string())
    regs = load_regs()
    sel = selection(regs, N_total)
    sel.to_csv(R / "summary_selection.csv", index=False, float_format="%.4g")
    print(sel.round(3).to_string())
    stt = stress_table()
    stt.to_csv(R / "summary_stress.csv", index=False, float_format="%.4g")
    print(stt.round(3).to_string())
    ctr = contributions(candidates(regs), stt, int(vc.loc[vc["family"] == "a_index_fear", "variants"].iloc[0]) + 1, N_total)
    ctr.to_csv(R / "summary_contributions.csv", index=False, float_format="%.5g")
    pd.set_option("display.width", 300)
    print(ctr.round(4).to_string())
    json.dump(dict(N_total=N_total), open(R / "summary_meta.json", "w"))


if __name__ == "__main__":
    pd.set_option("display.width", 300)
    pd.set_option("display.max_rows", 300)
    pd.set_option("display.max_columns", 60)
    main()
