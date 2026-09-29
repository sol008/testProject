"""Design-period selection -> test-period result, the multiple-testing haircut, and the finalists'
full statistics (concentration, years, execution and cost sensitivity, taxes)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy import stats as sps

import common27 as K
import s01_etf_grid as G

HURDLE = 0.05      # the owner's bar: beat SPY by 5 points a year


def universe_summary(reg: pd.DataFrame, label: str) -> pd.DataFrame:
    out = []
    for u, d in reg[reg.get("rule", pd.Series("grid", index=reg.index)).fillna("grid") == "grid"].groupby("universe"):
        sel = K.select_is(reg.assign(rule=reg.get("rule", "grid")), u)
        selc = K.select_is(reg.assign(rule=reg.get("rule", "grid")), u, by="is_cagr")
        out.append(dict(set=label, universe=u, variants=len(d),
                        is_excess_median=d["is_excess"].median(), oos_excess_median=d["oos_excess"].median(),
                        oos_share_beats_spy=(d["oos_excess"] > 0).mean(),
                        oos_share_beats_by_5=(d["oos_excess"] >= HURDLE).mean(),
                        oos_best_excess=d["oos_excess"].max(),
                        sel_rule=f"{sel['lookback']} k{int(sel['k'])} {sel['filter']} {'voladj ' if sel['voladj'] else ''}{sel['cadence']}",
                        sel_is_excess=sel["is_excess"], sel_oos_cagr=sel["oos_cagr"], sel_oos_excess=sel["oos_excess"],
                        sel_oos_maxdd=sel["oos_maxdd"],
                        selcagr_rule=f"{selc['lookback']} k{int(selc['k'])} {selc['filter']} {'voladj ' if selc['voladj'] else ''}{selc['cadence']}",
                        selcagr_oos_excess=selc["oos_excess"],
                        is_oos_rank_corr=sps.spearmanr(d["is_excess"], d["oos_excess"], nan_policy="omit")[0]))
    return pd.DataFrame(out)


def dimension_effects(reg: pd.DataFrame) -> pd.DataFrame:
    """Median test-period excess by each rule dimension (non-BTC ETF universes)."""
    d = reg[(reg.rule == "grid") & (~reg.universe.isin(["cross9_btc", "kitchen_sink"]))]
    out = []
    for dim in ["lookback", "voladj", "k", "filter", "cadence"]:
        for v, g in d.groupby(dim):
            out.append(dict(dimension=dim, value=str(v), variants=len(g), is_excess_median=g["is_excess"].median(),
                            oos_excess_median=g["oos_excess"].median(), oos_maxdd_median=g["oos_maxdd"].median(),
                            oos_recs_yr_median=g["oos_recs_yr"].median()))
    return pd.DataFrame(out)


def family_table(reg: pd.DataFrame, kf: pd.DataFrame) -> pd.DataFrame:
    """The simplest momentum family - hold the top 1 by 12-month (or 12-1) return, no trend filter -
    in every universe, design vs test. A family that works everywhere is more credible than a grid best."""
    out = []
    for src, d in (("ETF", reg[reg.rule == "grid"]), ("KF", kf)):
        f = d[(d.k == 1) & (d["filter"] == "none") & (~d.voladj.astype(bool)) & d.lookback.isin(["12m", "12-1"])]
        for _, r in f.iterrows():
            out.append(dict(source=src, universe=r["universe"], lookback=r["lookback"], cadence=r["cadence"],
                            design_excess=r["is_excess"], test_cagr=r["oos_cagr"], test_excess=r["oos_excess"],
                            test_maxdd=r["oos_maxdd"], test_win5y=r.get("oos_win5y", np.nan),
                            pre2008_excess=r.get("pre08_excess", np.nan)))
    return pd.DataFrame(out)


def multiple_testing(reg: pd.DataFrame, A: np.ndarray, label: str, mask=None) -> list[dict]:
    """Deflated Sharpe of the best test-period information ratio, and White / Hansen reality checks."""
    out = []
    ids = np.arange(A.shape[1]) if mask is None else np.where(mask)[0]
    X = A[:, ids].astype(float)
    X = np.nan_to_num(X)
    n = X.shape[0]
    mu, sd = X.mean(0), X.std(0, ddof=1)
    ir = mu / np.where(sd > 0, sd, np.nan)
    b = int(np.nanargmax(ir))
    x = X[:, b]
    var_ir = float(np.nanvar(ir, ddof=1))
    row = reg.iloc[ids[b]]
    dsr_emp = K.deflated_sharpe(ir[b], n, float(sps.skew(x)), float(sps.kurtosis(x, fisher=False)), len(ids), var_ir)
    dsr_null = K.deflated_sharpe(ir[b], n, float(sps.skew(x)), float(sps.kurtosis(x, fisher=False)), len(ids), None)
    for h in (0.0, HURDLE):
        rc = K.whites_reality_check(X, B=1000, mean_block=8.0, hurdle=(1 + h) ** (1 / 52) - 1)
        out.append(dict(set=label, variants=len(ids), weeks=n, hurdle_pts_yr=h,
                        best_by_ir=f"{row['universe']} {row['lookback']} k{int(row['k'])} {row['filter']} {row['cadence']}",
                        best_ir_ann=ir[b] * math.sqrt(52), best_oos_excess=row["oos_excess"],
                        dsr_empirical_var=dsr_emp, dsr_null_var=dsr_null,
                        expected_max_ir_noise_ann=math.sqrt(var_ir) * K.expected_max_z(len(ids)) * math.sqrt(52),
                        p_white_rc=rc["p_rc"], p_hansen_spa=rc["p_spa"],
                        best_mean_active_ann=(1 + rc["best_mean"] + ((1 + h) ** (1 / 52) - 1)) ** 52 - 1))
    return out


def attribution(panel: K.Panel, res: dict, a, b) -> dict:
    """Arithmetic contribution of each holding to the period's daily returns (weights at prior close)."""
    idx = panel.idx
    hist = res["values"]
    days = [d for d, _ in hist]
    contrib = {}
    total = 0.0
    prev_w = None
    for (d, v) in hist:
        if prev_w is not None and a <= idx[d] <= b:
            for n, w in prev_w.items():
                i = panel.col[n]
                r = panel.C[d, i] / panel.C[d - 1, i] - 1 if np.isfinite(panel.C[d - 1, i]) else 0.0
                contrib[n] = contrib.get(n, 0.0) + w * r
                total += w * r
        tot = sum(v.values())
        prev_w = {n: x / tot for n, x in v.items() if x > 0}
    return {n: c / total for n, c in sorted(contrib.items(), key=lambda z: -z[1])} if total else {}


def finalists(reg: pd.DataFrame):
    P = G.get_panel()
    spy = pd.Series(P.C[:, P.col["SPY"]], index=P.idx)
    rf = pd.Series(P.rf, index=P.idx)
    picks = []
    for u in ["sectors9", "us4", "us13", "us14_smh", "global4", "countries", "cross9", "cross9_btc", "kitchen_sink"]:
        picks.append(("IS-selected", u, K.select_is(reg, u)))
    g = reg[(reg.rule == "grid") & (reg.k == 1) & (reg["filter"] == "none") & (~reg.voladj.astype(bool))
            & (reg.lookback == "12m") & (reg.cadence == "M")]
    for u in ["sectors9", "us13", "us14_smh"]:
        picks.append(("Simple family (top-1 12m, no filter)", u, g[g.universe == u].iloc[0]))
    nb = reg[(reg.rule == "grid") & (~reg.universe.isin(["cross9_btc", "kitchen_sink"]))]
    picks.append(("Test-best, no BTC (hindsight)", nb.loc[nb.oos_excess.idxmax(), "universe"], nb.loc[nb.oos_excess.idxmax()]))
    al = reg[reg.rule == "grid"]
    picks.append(("Test-best overall (hindsight)", al.loc[al.oos_excess.idxmax(), "universe"], al.loc[al.oos_excess.idxmax()]))
    for nm in reg[reg.rule != "grid"].rule.unique():
        r = reg[(reg.rule == nm) & (reg.cadence == "M")].iloc[0]
        picks.append((nm, r["universe"], r))
    conc, years, sens = [], [], []
    for why, u, sel in picks:
        uni = G.UNIVERSES.get(u) or (["SPY", "EFA"] if u in ("gem", "adm") else ["SPY", "SCZ"])
        safe = sel.get("safe", "CASH") if isinstance(sel.get("safe", "CASH"), str) else "CASH"
        elig = {"BTC": G.BTC_FROM} if "BTC" in uni else None
        rows, tl = K.targets_for(P, uni, sel["lookback"], int(sel["k"]), sel["filter"], bool(sel["voladj"]),
                                 sel["cadence"], safe=safe, eligible_from=elig)
        if safe != "CASH":
            si = P.col[safe]
            tl = [tuple(("CASH" if (x == safe and not np.isfinite(P.C[r, si])) else x) for x in t) for r, t in zip(rows, tl)]
        start = G.common_start(P, uni)
        label = f"{why}: {u} {sel['lookback']} k{int(sel['k'])} {sel['filter']}{' voladj' if sel['voladj'] else ''} {sel['cadence']}"
        base = K.run_engine(P, rows, tl, int(sel["k"]), mode="open", start_row=start, record_values=True)
        eq = base["equity"]
        att = attribution(P, base, K.OOS_START, K.ASOF)
        top = list(att.items())[:6]
        conc.append(dict(pick=label, **{f"top{i + 1}": f"{n} {v:.0%}" for i, (n, v) in enumerate(top)},
                         semis_share=att.get("SMH", 0.0) + att.get("SOXX", 0.0),
                         tech_share=att.get("SMH", 0.0) + att.get("XLK", 0.0) + att.get("QQQ", 0.0),
                         btc_share=att.get("BTC", 0.0), cash_share=att.get("CASH", 0.0)))
        oos = K.slice_eq(eq, K.OOS_START, K.ASOF)
        cy = K.calendar_years(oos)
        cyb = K.calendar_years(K.slice_eq(spy.reindex(eq.index), K.OOS_START, K.ASOF))
        for y in cy.index:
            years.append(dict(pick=label, year=y, strategy=cy[y], spy=cyb.get(y, np.nan)))
        # best-3-months-removed test
        m = oos.resample("ME").last().pct_change().dropna()
        yrs = (oos.index[-1] - oos.index[0]).days / 365.25
        spy_c = K.cagr_of(K.slice_eq(spy.reindex(eq.index), K.OOS_START, K.ASOF))
        ex_best3 = (np.prod(1 + m.sort_values().iloc[:-3]) ** (1 / yrs) - 1) - spy_c
        row = dict(pick=label, signal_date=P.idx[rows[-1]].date(), holds_now=" + ".join(tl[-1]),
                   oos_cagr=K.cagr_of(oos), oos_excess=K.cagr_of(oos) - spy_c, oos_excess_wo_best3m=ex_best3)
        # execution at the next close, double costs, taxable
        alt = K.run_engine(P, rows, tl, int(sel["k"]), mode="close", start_row=start)
        row["oos_excess_next_close"] = K.cagr_of(K.slice_eq(alt["equity"], K.OOS_START, K.ASOF)) - spy_c
        saved = dict(K.COST_BPS)
        for kk in K.COST_BPS:
            K.COST_BPS[kk] = saved[kk] * 2
        dbl = K.run_engine(P, rows, tl, int(sel["k"]), mode="open", start_row=start)
        K.COST_BPS.clear()
        K.COST_BPS.update(saved)
        row["oos_excess_2x_costs"] = K.cagr_of(K.slice_eq(dbl["equity"], K.OOS_START, K.ASOF)) - spy_c
        # taxable: run from the test start with real tax bookkeeping (24 %/15 % and 40.8 %/23.8 %)
        oos_rows = [(r, t) for r, t in zip(rows, tl) if P.idx[r] >= K.OOS_START - pd.Timedelta(days=7)]
        rr = np.array([r for r, _ in oos_rows])
        tt = [t for _, t in oos_rows]
        for lab, st, lt in [("mid", 0.24, 0.15), ("top", 0.408, 0.238)]:
            tx = K.run_engine(P, rr, tt, int(sel["k"]), mode="open", start_row=int(rr[0]) + 1, tax=dict(st=st, lt=lt))
            e = tx["equity"]
            row[f"taxable_cagr_{lab}"] = K.cagr_of(e)
            # SPY buy-and-hold in the same account: dividends (~1.8 %/yr) taxed yearly at the LT rate, no sale
            sp = K.slice_eq(spy.reindex(e.index), e.index[0], e.index[-1])
            row[f"spy_taxable_cagr_{lab}"] = K.cagr_of(sp) - 0.018 * lt
        # executability
        a = K.activity_stats(base, K.OOS_START, K.ASOF, P.idx, "oos")
        row.update(a)
        row.update({k2: v for k2, v in K.period_stats(eq, spy, rf, K.OOS_START, K.ASOF, "oos").items()
                    if k2 in ("oos_maxdd", "oos_worst_year", "oos_win5y", "oos_med5y_gap", "oos_sharpe", "oos_vol")})
        row.update({k2: v for k2, v in K.period_stats(eq, spy, rf, eq.index[0], K.IS_END, "is").items()
                    if k2 in ("is_cagr", "is_spy_cagr", "is_excess", "is_maxdd")})
        sens.append(row)
    return pd.DataFrame(conc), pd.DataFrame(years), pd.DataFrame(sens)


def main():
    reg = pd.read_csv(K.SCRATCH / "etf_grid_full.csv")
    A = np.load(K.SCRATCH / "etf_oos_weekly_active.npy")
    kf = pd.read_csv(K.SCRATCH / "kf_grid_full.csv")
    kf["rule"] = "grid"
    AK = np.load(K.SCRATCH / "kf_oos_weekly_active.npy")
    us = pd.concat([universe_summary(reg, "ETF"), universe_summary(kf, "Ken French industries")])
    K.save(us, "universe_summary.csv")
    print(us.round(3).to_string(index=False))
    de = dimension_effects(reg)
    K.save(de, "dimension_effects.csv")
    print(de.round(3).to_string(index=False))
    ft = family_table(reg, kf)
    K.save(ft, "family_top1_12m.csv")
    print(ft.round(3).to_string(index=False))
    named = reg[reg.rule != "grid"][["rule", "cadence", "start", "is_cagr", "is_spy_cagr", "is_excess", "oos_cagr",
                                      "oos_spy_cagr", "oos_excess", "oos_maxdd", "oos_worst_year", "oos_win5y",
                                      "oos_recs_yr", "oos_orders_yr"]]
    K.save(named, "named_rules.csv")
    print(named.round(3).to_string(index=False))
    mt = []
    grid = (reg.rule == "grid").values
    mt += multiple_testing(reg, A, "all ETF variants", None)
    mt += multiple_testing(reg, A, "ETF, no BTC universes", grid & ~reg.universe.isin(["cross9_btc", "kitchen_sink"]).values)
    for u in ["us14_smh", "us13", "cross9", "cross9_btc"]:
        mt += multiple_testing(reg, A, f"ETF {u}", (reg.universe == u).values)
    mt += multiple_testing(kf, AK, "Ken French industries (all)", None)
    mt = pd.DataFrame(mt)
    K.save(mt, "multiple_testing.csv")
    print(mt.round(3).to_string(index=False))
    conc, yrs, sens = finalists(reg)
    K.save(conc, "finalists_concentration.csv")
    K.save(yrs, "finalists_years.csv")
    K.save(sens, "finalists_stats.csv")
    print(conc.to_string(index=False))
    print(sens.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
