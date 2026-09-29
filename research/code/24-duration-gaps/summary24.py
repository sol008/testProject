"""Track 24 summary: multiple-testing ledger, deflated Sharpe for the best candidates, and the expected change in
the system's annual return at 90 and 120 days vs 60 from the families tested here.

Contribution convention (tracks 21-22): contribution a year = trades a year x notional x (forward drift per trade +
kappa x edge per trade), pre-tax, over T-bills, whole portfolio.
  * notional = 2% stress / |the instrument's worst 10-session loss| (design section 4, no stop);
  * forward drift: US equity / small caps +0.3% a year over bills (S&P 3-6% vs bills 4.2%), CEF assets +0.5%,
    merger arb = the arb rate itself;
  * edge = the test-period (post-2008 / 2016-26) edge vs an era-matched random entry or a size-matched ETF;
  * kappa = 0.5 (>= 20 independent episodes), 0.25 (10-19); below 10 the rule is paper-only (track 17 R9);
  * capacity: one position per family at a time unless stated (the 2% per-trade stress, the 10% total and the
    <= 8 open positions are shared with M1-M4 and M2's sleeve), so trades a year = min(signals a year, 252 / H).
  * low = edge gone and low drift; high = unshrunk edge, two positions where the family allows it.
The LIVE change counts only rules that would be live or policy modules; every family here ends paper, shadow or
never, so the live change is zero.  The hypothetical column says what they would add if ever promoted.
Outputs: results/summary_*.csv
"""
from __future__ import annotations

import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import stats as sps  # noqa: E402

import common24 as C  # noqa: E402

R = C.RESULTS
CAP_H = {60: 42, 90: 63, 120: 84}
PRIOR_N = {"tracks 13-17": 2900, "track 21 (decision variants)": 38, "track 22": 260}


def rd(name: str) -> pd.DataFrame:
    p = R / f"{name}.csv"
    return pd.read_csv(p if p.exists() else R / f"{name}.csv.gz")


# ============================================================================ ledger
def ledger() -> tuple[pd.DataFrame, int]:
    fams = ["f1_merger_arb", "f2_option_premium", "f3_sector_momentum", "f4_single_stock", "f5_cef_index", "f6_other"]
    L = pd.concat([rd(f"ledger_{f}") for f in fams], ignore_index=True)
    test_like = L["sample"].astype(str).str.contains("test|2008|2016|OOS|2017", case=False, regex=True)
    L["role"] = np.where(test_like, "test", "design")
    N_total = int(L.groupby("family")["variant"].nunique().sum())
    bar = C.bonferroni_t(N_total)
    rows = []
    for f, g in L.groupby("family"):
        n = g["variant"].nunique()
        r = dict(family=f, variants=n, cells=len(g), bonferroni_t_family=C.bonferroni_t(n), bonferroni_t_track=bar,
                 noise_max_t_family=C.expected_max_z(n))
        for role in ("design", "test"):
            gg = g[(g["role"] == role) & (g["stat"] > 0)].sort_values("stat", ascending=False)
            if len(gg):
                b = gg.iloc[0]
                r[f"best_{role}"] = f"{b['variant']} [{b['sample']}]"
                r[f"best_{role}_t"] = b["stat"]
            else:
                r[f"best_{role}"], r[f"best_{role}_t"] = "", np.nan
        r["test_clears_track_bar"] = bool(r["best_test_t"] >= bar) if np.isfinite(r["best_test_t"]) else False
        r["share_test_cells_positive"] = float((g.loc[g["role"] == "test", "stat"] > 0).mean())
        rows.append(r)
    tot = dict(family="TOTAL (this track)", variants=N_total, cells=len(L), bonferroni_t_family=bar, bonferroni_t_track=bar,
               noise_max_t_family=C.expected_max_z(N_total),
               best_test_t=float(L.loc[L["role"] == "test", "stat"].max()),
               share_test_cells_positive=float((L.loc[L["role"] == "test", "stat"] > 0).mean()))
    tot["test_clears_track_bar"] = bool(tot["best_test_t"] >= bar)
    rows.append(tot)
    cum = N_total + sum(PRIOR_N.values())
    rows.append(dict(family="CUMULATIVE (tracks 13-17, 21, 22, 24)", variants=cum, bonferroni_t_family=C.bonferroni_t(cum),
                     bonferroni_t_track=C.bonferroni_t(cum), noise_max_t_family=C.expected_max_z(cum)))
    out = pd.DataFrame(rows)
    C.save(out, "summary_ledger")
    return out, N_total


# ============================================================================ deflated Sharpe
def dsr_of(x: np.ndarray, N: int) -> tuple[float, float, int]:
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    if len(x) < 5:
        return np.nan, np.nan, len(x)
    sr = x.mean() / x.std(ddof=1)
    return float(sr), C.dsr(sr, len(x), float(sps.skew(x)), float(sps.kurtosis(x, fisher=False)), N), len(x)


def dsr_table(N_fam: dict, N_total: int) -> pd.DataFrame:
    rows = []
    # CEF: monthly-mean edges (primary variant), test period, 60/90/120
    tr = rd("f5_cef_trades")
    tr["signal"] = pd.to_datetime(tr["signal"])
    for H in C.HOLDS:
        g = tr[(tr.variant == "z-2 w756") & (tr.H == H) & (tr.role == "test")]
        x = g.groupby(g["signal"].dt.to_period("M"))["edge"].mean().values
        for lab, N in (("family", N_fam["f5_cef_index"]), ("track", N_total)):
            sr, p, n = dsr_of(x, N)
            rows.append(dict(candidate=f"CEF z<=-2 (3y) H{H}, 2008-26, signal-month means", N=lab, n=n, sr=sr, dsr=p))
    # spin-offs from session 61, 2016-26
    sp = rd("f4_spinoff_events")
    for H in C.HOLDS:
        g = sp[(sp.start_session == 61) & (sp.period.astype(str).str.startswith("2016"))]
        x = (g[f"x{H}"] - g["cost_rt"]).values
        for lab, N in (("family", N_fam["f4_single_stock"]), ("track", N_total)):
            sr, p, n = dsr_of(x, N)
            rows.append(dict(candidate=f"Spin-off from session 61, H{H}, 2016-26", N=lab, n=n, sr=sr, dsr=p))
    # S&P deletions, open of E, 2008-26
    ev = rd("f5_sp500_events")
    ev["E"] = pd.to_datetime(ev["E"])
    for H in C.HOLDS:
        g = ev[(ev.type == "del") & (ev.E >= "2008-01-01")]
        x = ((1 + g[f"h{H}"]) / (1 + g["gap0"]) - 1 - g[f"h{H}_IWM"] - 0.002).values
        for lab, N in (("family", N_fam["f5_cef_index"]), ("track", N_total)):
            sr, p, n = dsr_of(x, N)
            rows.append(dict(candidate=f"S&P 500 deletion, open of E, H{H}, 2008-26", N=lab, n=n, sr=sr, dsr=p))
    # rows scored by track 22's evaluate(): per-trade timing-edge statistics
    t1 = rd("f1_timing_tests")
    t6 = rd("f6_turn_of_year")
    v6 = rd("f6_vol_carry")
    picks = [
        ("MNA after a 21-session loss <= -2%, H63, 2010-26", t1[(t1.fund == "MNA") & (t1.variant == "r21_2") & (t1.H == 63)], "f1_merger_arb"),
        ("Turn of year: IWM from 1 Nov, 90-day cap, 2008-26", t6[(t6.series == "IWM") & (t6.entry == "Nov1") & (t6.cap == 90) & (t6.era == "2008-2026")], "f6_other"),
        ("Turn of year: KF small quintile from 15 Dec, 60-day cap, 2008-26", t6[(t6.series == "KF small quintile") & (t6.entry == "Dec15") & (t6.cap == 60) & (t6.era == "2008-2026")], "f6_other"),
        ("VIX carry VPD, VIX/VIX3M < 0.90, H84, 2017-26", v6[(v6.series == "VPD") & (v6.variant == "ts<0.90") & (v6.H == 84) & (v6.role == "test")], "f6_other"),
    ]
    for name, g, fam in picks:
        if not len(g):
            continue
        st = g.iloc[0].to_dict()
        for lab, N in (("family", N_fam[fam]), ("track", N_total)):
            rows.append(dict(candidate=name, N=lab, n=int(st.get("n", 0)), sr=st.get("sr_edge"),
                             dsr=C.C22.dsr_row(st, N)))
    out = pd.DataFrame(rows)
    C.save(out, "summary_dsr")
    return out


# ============================================================================ contributions
def worst10(ticker: str) -> float:
    return C.C22.worst_window_loss(C.yf_frame(ticker)["aC"], 10)


def contributions() -> pd.DataFrame:
    rows = []

    def add(family, candidate, status, cap, trades, notional, drift, edge, kappa, note, dg=None, high=None, low=None):
        cen = trades * notional * (drift + kappa * edge)
        lo = low if low is not None else trades * notional * (drift * (C.EQ_EXCESS_FWD[0] / C.EQ_EXCESS_FWD[1])
                                                               if drift > 0 else drift)
        hi = high if high is not None else trades * notional * (max(drift, 0) * 2 + edge)
        if dg is None:
            dg = C.dg_bp(notional, drift + kappa * edge, 0.0)
        rows.append(dict(family=family, candidate=candidate, status=status, cap=cap, trades_yr=trades, notional=notional,
                         drift_trade=drift, edge_trade=edge, kappa=kappa, contrib_central=cen, contrib_low=lo,
                         contrib_high=hi, dg_bp_trade=dg, passes_6bp=dg >= C.HURDLE_BP,
                         live_contrib=cen if status in ("live", "policy") else 0.0, note=note))

    # ---------------- F1 merger arbitrage
    win = rd("f1_fund_windows")
    rate_c = float(win[(win.fund == "MERFX") & (win.period == "2008-2026") & (win.H == 42)].rate_yr.iloc[0])
    rate_hi = float(win[(win.fund == "MERFX") & (win.period == "1990-2007") & (win.H == 42)].rate_yr.iloc[0])
    sz = rd("f1_single_deal_sizing")
    for cap in (60, 90, 120):
        days = {60: 55, 90: 85, 120: 115}[cap]
        mna = win[(win.fund == "MNA") & (win.H == CAP_H[cap])]
        rate_lo = float(mna.rate_yr.iloc[0]) if len(mna) else 0.005
        notional, slots = 0.02 / 0.30, 1.5
        trades = slots * 365.0 / days
        edge = rate_c * days / 365
        dg = float(sz[(sz.break_loss == 0.30) & (sz.cap == cap) & (np.isclose(sz.rate_yr, 0.02))].dg_bp_kappa.iloc[0])
        add("1 Merger arb", "Single cash deals held to completion (1.5 open, 2% stress at a 30% break loss)", "shadow",
            cap, trades, notional, 0.0, edge, C.KAPPA,
            "rate = MERFX 2008-26 excess over bills; the stress budget, not the cap, limits deals open at once",
            dg=dg, low=trades * notional * 0.3 * rate_lo * days / 365, high=trades * notional * rate_hi * days / 365)
    t1 = rd("f1_timing_tests")
    d = t1[(t1.fund == "MERFX") & (t1.role == "design") & (t1.n >= 8)].sort_values("z_placebo", ascending=False).iloc[0]
    notional_mna = min(1.0, 0.02 / abs(worst10("MNA")))
    for cap, H in CAP_H.items():
        g = t1[(t1.fund == "MNA") & (t1.variant == d["variant"]) & (t1.H == H)]
        if not len(g):
            continue
        g = g.iloc[0]
        add("1 Merger arb", f"MNA after a spread blow-out (design pick on MERFX: {d['variant']})", "shadow", cap,
            float(g.per_yr), notional_mna, float(g.base), float(g.edge), 0.25,
            f"MERFX 1990-2007 design edge {d['edge']:+.2%} at H{int(d['H'])}; MNA test n={int(g.n)} (< 10 episodes: paper-only)")

    # ---------------- F2 option premium at longer DTE (model; bias-adjusted)
    st = rd("f2_putspread_stats")
    base = st[(st.cost == "base") & (st["filter"] == "M7")]
    for cap in (60, 90, 120):
        for drift_lab in ("fwd_mid",):
            v = base[(base.drift == drift_lab) & (base.period == "2008-2026")]
            v = v[v.caps.astype(str).str.contains(str(cap))]
            v = v.assign(adj=v.per_yr * 0.02 * (v.mean_R - 0.006))
            best = v.sort_values("adj", ascending=False).iloc[0]
            pre = base[(base.drift == drift_lab) & (base.period == "1990-2007") & (base.dte == best.dte) & (base.rule == best.rule)]
            m7 = base[(base.drift == drift_lab) & (base.period == "2008-2026") & (base.dte == 45) & (base.rule == "tp21")].iloc[0]
            add("2 Option premium", f"Best put spread feasible under the cap (DTE {int(best.dte)}, {best.rule}); M7 today = DTE 45 tp21",
                "paper (M7 off at $100k)", cap, float(best.per_yr), 0.02, 0.0, float(best.mean_R - 0.006), C.KAPPA,
                f"model, CAPE-41 drift, -0.6% bias; 1990-2007 same rule {float(pre.mean_R.iloc[0]):+.1%}/trade; "
                f"M7 today {m7.mean_R - 0.006:+.1%}/trade x {m7.per_yr:.1f}/yr",
                high=float(best.per_yr) * 0.02 * float(best.mean_R), low=0.0)

    # ---------------- F3 sector momentum (SPDR, k = 1, design-selected lookback per hold)
    rv = rd("f3_rotation_variants")
    sp = rv[(rv.universe == "SPDR9") & (rv.k == 1) & (~rv.absmom.astype(bool))]
    w10s = np.median([worst10(t) for t in ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"]])
    for cap, H in CAP_H.items():
        g = sp[sp.H == H]
        des = g[g.role == "design"].sort_values("t_med", ascending=False).iloc[0]
        tst = g[(g.role == "test") & (g.look == des.look)].iloc[0]
        notional = 0.02 / abs(w10s)
        add("3 Sector momentum", "Top-1 sector SPDR, design-selected lookback, re-decided every H sessions", "never", cap,
            252.0 / H, notional, C.EQ_EXCESS_FWD[1] * H / 252, float(tst.active_yr) * H / 252, C.KAPPA,
            f"{des.look}: design 1999-2007 {des.active_yr:+.1%}/yr vs SPY; test 2008-26 {tst.active_yr:+.1%}/yr (t {tst.t_med:.1f})")

    # ---------------- F4 single stocks
    pe = rd("f4_pead")
    sps_ = rd("f4_spinoffs")
    ins = rd("f4_insiders")
    stress = rd("f4_spinoff_stress")
    notional_ss = float(stress.notional_at_2pct_median.iloc[0])
    for cap, H in CAP_H.items():
        g = pe[(pe.setup == "PEAD SUE top decile long [>=$2bn]") & (pe.period == "2016-26 (OOS)") & (pe.H == H)].iloc[0]
        add("4 Single stocks", "PEAD: top SUE decile, >= $2bn, buy at D+2", "never", cap, 252.0 / H, notional_ss,
            C.EQ_EXCESS_FWD[1] * H / 252, float(g["mean"]), C.KAPPA, f"2016-26 net excess {g['mean']:+.2%} (t {g.t_clustered:.1f})")
        s = sps_[(sps_.setup.str.startswith("spinco from session 61")) & (sps_.period == "2016-26") & (sps_.H == H)].iloc[0]
        si = sps_[(sps_.setup.str.startswith("spinco from session 61")) & (sps_.period == "2011-15") & (sps_.H == H)].iloc[0]
        trades = min(float(s.per_yr), 252.0 / H)
        add("4 Single stocks", "Spin-off bought at session 61 (after the never-list's 60-session ban)", "shadow", cap,
            trades, notional_ss, C.EQ_EXCESS_FWD[1] * H / 252, float(s["mean"]), C.KAPPA,
            f"2016-26 {s['mean']:+.1%} (t {s.t_clustered:.1f}); 2011-15 {si['mean']:+.1%} (t {si.t_clustered:.1f}); one position",
            high=2 * min(float(s.per_yr) / 2, 252.0 / H) * notional_ss * float(s["mean"]))
        n = ins[(ins.setup == "Insider cluster W30K2 [>=$300m]") & (ins.period == "2016-26 (OOS)") & (ins.H == H)].iloc[0]
        add("4 Single stocks", "Insider cluster (>= 2 insiders), >= $300m, buy at D+1", "shadow (unchanged)", cap, 252.0 / H,
            notional_ss, C.EQ_EXCESS_FWD[1] * H / 252, float(n["mean"]), C.KAPPA, f"2016-26 net {n['mean']:+.2%} (t {n.t_clustered:.1f})")

    # ---------------- F5 CEF discounts, index effects
    cap_t = rd("f5b_cef_capacity")
    for cap, H in CAP_H.items():
        g1 = cap_t[(cap_t.H == H) & (cap_t.role == "test") & (cap_t.slots == 1)]
        g2 = cap_t[(cap_t.H == H) & (cap_t.role == "test") & (cap_t.slots == 2)]
        gd = cap_t[(cap_t.H == H) & (cap_t.role == "design") & (cap_t.slots == 1)]
        cen = float(g1.contrib_kappa.mean())
        rows.append(dict(family="5 CEF / index", candidate="CEF discount unusually wide (z <= -1.5/-2 vs own 1-3y), buy next open",
                         status="shadow (new; not cap-dependent)", cap=cap, trades_yr=float(g1.per_yr.mean()),
                         notional=float(g1.notional.mean()), drift_trade=0.005 * H / 252, edge_trade=float(g1.edge.mean()),
                         kappa=C.KAPPA, contrib_central=cen, contrib_low=0.0, contrib_high=float(g2.contrib_hist.mean()),
                         dg_bp_trade=float(g1.dg_bp_mean.mean()), passes_6bp=bool(g1.dg_bp_mean.mean() >= 6),
                         live_contrib=0.0,
                         note=f"mean of 3 variants, one position; two positions {g2.contrib_kappa.mean():+.2%}; "
                              f"1999-2007 one position {gd.contrib_kappa.mean():+.2%}"))
    spt = rd("f5_sp500_adds_deletes")
    evd = rd("f5_sp500_events")
    notional_del = 0.02 / 0.40
    for cap, H in CAP_H.items():
        g = spt[(spt.type == "del") & (spt.entry == "open E") & (spt.period == "2008-2026") & (spt.H == H)].iloc[0]
        per_yr = float(g.n) / C.years("2008-01-01", "2026-09-28")
        add("5 CEF / index", "S&P 500 deletion, buy at the open of the effective day", "never-list (unchanged)", cap,
            min(per_yr, 252.0 / H), notional_del, C.EQ_EXCESS_FWD[1] * H / 252, float(g["mean"]), C.KAPPA,
            f"2008-26 {g['mean']:+.1%} vs IWM (t {g.t_clustered:.1f}); {int(g.n)} of {int(g.n_total)} deletions priced (survivorship)")
    ru = rd("f5_russell_recon")
    for cap, H in CAP_H.items():
        g = ru[(ru.etf == "IWM") & (ru.role == "2008-2025") & (ru.H == H)].iloc[0]
        add("5 CEF / index", "Russell reconstitution: long IWM after recon day", "never", cap, 1.0,
            0.02 / abs(worst10("IWM")), C.EQ_EXCESS_FWD[1] * H / 252, float(g.edge), 0.25, f"2008-25 edge {g.edge:+.1%}")

    # ---------------- F6 other
    toy = rd("f6_turn_of_year")
    vc = rd("f6_vol_carry")
    nw = 0.02 / abs(worst10("IWM"))
    for cap, H in CAP_H.items():
        g = toy[(toy.series == "IWM") & (toy.entry == "Nov1") & (toy.cap == cap) & (toy.era == "2008-2026")].iloc[0]
        g2 = toy[(toy.series == "IWM") & (toy.entry == "Dec1") & (toy.cap == 60) & (toy.era == "2008-2026")].iloc[0]
        add("6 Other", "Turn of year: IWM from 1 Nov to the cap", "never (calendar)", cap, 1.0, nw,
            C.EQ_EXCESS_FWD[1] * g.H / 252, float(g.edge), 0.25,
            f"2008-26 edge {g.edge:+.1%} (t {g.t_edge:.1f}); from 1 Dec under 60 days {g2.edge:+.1%}")
        v = vc[(vc.series == "VPD") & (vc.variant == "ts<0.90") & (vc.role == "test") & (vc.H == H)].iloc[0]
        add("6 Other", "VIX carry: short VIX futures (VPD) when VIX/VIX3M < 0.90", "never (short-VIX product)", cap,
            float(v.per_yr), 0.02 / 0.522, 0.0, float(v.edge), 0.25, f"2017-26 edge {v.edge:+.1%} (p {v.p_placebo:.2f}); worst 10 sessions -52%")
    out = pd.DataFrame(rows)
    C.save(out, "summary_contributions")
    # change vs 60 days per candidate
    piv = out.pivot_table(index=["family", "candidate", "status"], columns="cap",
                          values=["contrib_central", "live_contrib"], aggfunc="first")
    delta = pd.DataFrame({"central_60": piv[("contrib_central", 60)], "central_90": piv[("contrib_central", 90)],
                          "central_120": piv[("contrib_central", 120)]})
    delta["d90"] = delta["central_90"] - delta["central_60"]
    delta["d120"] = delta["central_120"] - delta["central_60"]
    delta["live_d90"] = piv[("live_contrib", 90)] - piv[("live_contrib", 60)]
    delta["live_d120"] = piv[("live_contrib", 120)] - piv[("live_contrib", 60)]
    delta = delta.reset_index()
    # totals: live (policy/live rules only: none), and this track's three new shadow candidates, signed -- what
    # they would add if they were promoted anyway
    # the three NEW candidates of this track (single cash deals and the best put spread change by exactly 0)
    promo = delta[delta["candidate"].astype(str).str.startswith(("CEF discount", "Spin-off bought", "MNA after"))]
    tot = [dict(family="TOTAL live", candidate="live and policy modules (none from these families)", status="",
                d90=float(delta["live_d90"].sum()), d120=float(delta["live_d120"].sum()), live_d90=0.0, live_d120=0.0),
           dict(family="TOTAL if promoted", candidate="; ".join(promo["candidate"].str.slice(0, 40)), status="",
                central_60=float(promo["central_60"].sum()), central_90=float(promo["central_90"].sum()),
                central_120=float(promo["central_120"].sum()), d90=float(promo["d90"].sum()), d120=float(promo["d120"].sum()))]
    delta = pd.concat([delta, pd.DataFrame(tot)], ignore_index=True)
    C.save(delta, "summary_delta_vs_60")
    return out, delta


def sensitivity(ds: pd.DataFrame) -> pd.DataFrame:
    """The three NEW promotable candidates (CEF-Z, spin-offs from session 61, MNA after a blow-out) under four
    scenarios.  Single cash deals and the best put spread change by exactly 0 with the cap, so they are left out.
      central    : one position, kappa 0.5, test-period edges (the contribution table);
      two        : two positions (CEF from the capacity simulation; spin-offs trade min(signals, 2 x 252 / H));
      other_half : one position, the OTHER half's edges (CEF 1999-2007; spin-offs 2011-15; MNA rule on MERFX
                   1990-2007 edges, at MNA's frequency and size);
      dsr_kappa  : one position, kappa = 0.5 x the deflated-Sharpe probability at the track's N."""
    cap_t = rd("f5b_cef_capacity")
    sp = rd("f4_spinoffs")
    t1 = rd("f1_timing_tests")
    notional_ss = float(rd("f4_spinoff_stress").notional_at_2pct_median.iloc[0])
    notional_mna = min(1.0, 0.02 / abs(worst10("MNA")))
    dsr_t = ds[ds["N"] == "track"].copy()

    def dsr_for(prefix: str, H: int) -> float:
        g = dsr_t[dsr_t["candidate"].str.startswith(prefix) & dsr_t["candidate"].str.contains(f"H{H}")]
        if not len(g):
            g = dsr_t[dsr_t["candidate"].str.startswith(prefix)]
        return float(g["dsr"].iloc[0]) if len(g) else 0.0

    rows = []
    for scen in ("central", "two", "other_half", "dsr_kappa"):
        for cap, H in CAP_H.items():
            drift_eq = C.EQ_EXCESS_FWD[1] * H / 252
            # CEF (mean of the three variants)
            role = "design" if scen == "other_half" else "test"
            slots = 2 if scen == "two" else 1
            g = cap_t[(cap_t.H == H) & (cap_t.role == role) & (cap_t.slots == slots)]
            cef = float(g.contrib_kappa.mean())
            if scen == "dsr_kappa":
                drift_part = float((g.per_yr * g.notional).mean()) * 0.005 * H / 252
                cef = drift_part + (cef - drift_part) * dsr_for("CEF", H)
            # spin-offs from session 61
            per = "2011-15" if scen == "other_half" else "2016-26"
            s = sp[(sp.setup.str.startswith("spinco from session 61")) & (sp.period == per) & (sp.H == H)].iloc[0]
            per_yr = float(sp[(sp.setup.str.startswith("spinco from session 61")) & (sp.period == "2016-26") & (sp.H == H)].per_yr.iloc[0])
            trades = min(per_yr, (2 if scen == "two" else 1) * 252.0 / H)
            k = C.KAPPA * (dsr_for("Spin-off", H) if scen == "dsr_kappa" else 1.0)
            spin = trades * notional_ss * (drift_eq + k * float(s["mean"]))
            # MNA after a blow-out (dd5, the design pick)
            m = t1[(t1.fund == "MNA") & (t1.variant == "dd5") & (t1.H == H)].iloc[0]
            edge = float(m.edge)
            if scen == "other_half":
                edge = float(t1[(t1.fund == "MERFX") & (t1.variant == "dd5") & (t1.role == "design") & (t1.H == H)].edge.iloc[0])
            k = 0.25 * (dsr_for("MNA", H) if scen == "dsr_kappa" else 1.0)
            mna = float(m.per_yr) * notional_mna * (float(m.base) + k * edge)
            rows.append(dict(scenario=scen, cap=cap, cef=cef, spinoff=spin, mna=mna, total=cef + spin + mna))
    out = pd.DataFrame(rows)
    piv = out.pivot_table(index="scenario", columns="cap", values="total")
    summ = pd.DataFrame({"level_60": piv[60], "level_90": piv[90], "level_120": piv[120],
                         "d90": piv[90] - piv[60], "d120": piv[120] - piv[60]}).reset_index()
    C.save(out, "summary_sensitivity_detail")
    C.save(summ, "summary_sensitivity")
    return summ


def main():
    led, N_total = ledger()
    N_fam = dict(zip(led["family"], led["variants"]))
    ds = dsr_table(N_fam, N_total)
    out, delta = contributions()
    sens = sensitivity(ds)
    with pd.option_context("display.width", 200):
        print(sens.round(5).to_string(index=False))
    with pd.option_context("display.width", 260, "display.max_colwidth", 80, "display.max_rows", 200):
        print(led.round(3).to_string(index=False))
        print(ds.round(3).to_string(index=False))
        print(out[["family", "candidate", "status", "cap", "trades_yr", "notional", "drift_trade", "edge_trade", "kappa",
                   "contrib_central", "contrib_low", "contrib_high", "dg_bp_trade"]].round(5).to_string(index=False))
        print(delta.round(5).to_string(index=False))


if __name__ == "__main__":
    main()
