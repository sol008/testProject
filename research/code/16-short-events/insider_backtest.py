"""Insider-purchase clusters: 1-60 day returns after costs, in-sample 2009-2015 vs out-of-sample
2016-2026, by size bucket, with a pre-registered selection rule and multiple-testing haircuts.

Pipeline: insider_download.py -> insider_events.py -> shares_out.py -> insider_map.py -> this.

Protocol (fixed before running)
  * Entry: CLOSE of the first session after the EDGAR filing date of the cluster-completing
    Form 4 (filings are accepted until 22:00 ET, so the next session is the first tradable one).
  * Exit: close h sessions later, h in {5, 20, 60}.  Primary horizon: h = 20.
  * Benchmark: IWM (market cap < $2bn or unknown) or SPY (>= $2bn).
  * Cost: COST_RT by market-cap bucket (4.0% nano, 2.0% micro, 0.8% small, 0.3% mid, 0.15% large).
  * Tradability filters (all variants): actual price >= $2 at the filing date; 20-day median
    dollar volume >= $100k.
  * Variant grid (36): (W,K) in {(10,2),(30,2),(30,3)} x opportunistic filter {all, no routine
    participant} x total $ bought {any, >=$100k, >=$500k} x top officer {any, >=1 CEO/CFO/President/Chair}.
  * Selection: the variant with the highest month-clustered t-stat of net 20-day excess return
    in 2009-2015 among variants with >= 100 in-sample events.  It is then evaluated once on
    2016-2026H1.  All 36 variants are reported out of sample as well.
Outputs: output/insider_*.csv / .json
"""
from __future__ import annotations

import itertools
import math

import numpy as np
import pandas as pd

from common import (COST_RT, SCRATCH, cap_bucket, clustered_t, deflated_sharpe_prob, kelly_growth, save_csv,
                    save_json, trade_stats)
from evstudy import calendar_portfolio, compute, first_session_after

H = (1, 5, 20, 60)


def period(d):
    if d < pd.Timestamp("2009-01-01"):
        return "2006-08 (pre-pub)"
    if d < pd.Timestamp("2016-01-01"):
        return "2009-15 (IS)"
    return "2016-26 (OOS)"


def prepare() -> pd.DataFrame:
    f = SCRATCH / "insider_returns.pkl"
    if f.exists():
        return pd.read_pickle(f)
    ev = pd.read_pickle(SCRATCH / "insider_events_mapped.pkl")
    ev = ev[(ev["map_status"] == "ok") & (ev["event_date"] <= "2026-06-26")].copy()
    ev["entry_date"] = [first_session_after(d) for d in ev["event_date"]]
    ev["entry_type"] = "close"
    ev["bench"] = np.where(ev["mcap"] >= 2e9, "SPY", "IWM")
    res = compute(ev, horizons=H)
    # open-entry variant for the primary horizon only
    ev2 = ev[["ticker", "entry_date", "bench"]].copy()
    ev2["entry_type"] = "open"
    r2 = compute(ev2, horizons=(20,), features=False)
    res["x20_open"] = r2["x20"].values
    res["r20_open"] = r2["r20"].values
    res.to_pickle(f)
    return res


def add_fields(res: pd.DataFrame) -> pd.DataFrame:
    res = res.copy()
    res["bucket"] = res["mcap"].apply(cap_bucket)
    res["cost_rt"] = res["bucket"].map(COST_RT)
    res["cost_ar"] = np.maximum(res["cost_rt"], res["ar_spread"].fillna(0))
    res["period"] = res["event_date"].apply(period)
    res["year"] = res["event_date"].dt.year
    res["tradable"] = (res["raw_px"] >= 2) & (res["dvol20"] >= 1e5)
    res["opp"] = (res["n_routine"] == 0) & (res["n_rbuyer"] == 0)
    for h in H:
        res[f"n{h}"] = res[f"x{h}"] - res["cost_rt"]
    res["n20_open"] = res["x20_open"] - res["cost_rt"]
    res["n20_ar"] = res["x20"] - res["cost_ar"]
    return res


def variants():
    for (W, K), opp, val, top in itertools.product([(10, 2), (30, 2), (30, 3)], [False, True], [0, 1e5, 5e5], [False, True]):
        yield {"W": W, "K": K, "opp_only": opp, "min_value": val, "top_officer": top}


def select(res: pd.DataFrame, v: dict) -> pd.DataFrame:
    s = res[(res["W"] == v["W"]) & (res["K"] == v["K"]) & res["tradable"]]
    if v["opp_only"]:
        s = s[s["opp"]]
    s = s[s["value"] >= v["min_value"]]
    if v["top_officer"]:
        s = s[s["n_top"] >= 1]
    return s


def vname(v):
    return f"W{v['W']}K{v['K']}{'_opp' if v['opp_only'] else ''}_v{int(v['min_value'] / 1000)}k{'_top' if v['top_officer'] else ''}"


def summarize(s: pd.DataFrame, col: str, years: float) -> dict:
    st = trade_stats(s[col], per_year=len(s.dropna(subset=[col])) / years if years else None)
    st["t_clustered"] = round(clustered_t(s[col], s["event_date"]), 2) if len(s) > 10 else None
    return st


YEARS = {"2006-08 (pre-pub)": 3.0, "2009-15 (IS)": 7.0, "2016-26 (OOS)": 10.5}


def main():
    res = add_fields(prepare())
    out = {}
    # ---------------------------------------------------------------- coverage / survivorship
    allev = pd.read_pickle(SCRATCH / "insider_events_mapped.pkl")
    cov = allev[allev["K"] == 2].groupby([allev["event_date"].dt.year, "map_status"]).size().unstack(fill_value=0)
    cov["ok_share"] = (cov.get("ok", 0) / cov.sum(axis=1)).round(3)
    save_csv(cov.reset_index(), "insider_coverage_by_year.csv")
    out["coverage_note"] = "share of W30K2 events with a validated Yahoo price series, by year"

    # ---------------------------------------------------------------- baseline tables by period x bucket
    rows = []
    for (W, K) in [(30, 1), (10, 2), (30, 2), (30, 3)]:
        base = res[(res["W"] == W) & (res["K"] == K) & res["tradable"]]
        for per, g in base.groupby("period"):
            for bk, gb in list(g.groupby("bucket")) + [("ALL", g)]:
                for h in H:
                    st = summarize(gb, f"n{h}", YEARS[per])
                    st.update({"W": W, "K": K, "period": per, "bucket": bk, "h": h,
                               "gross_excess_mean_%": round(100 * gb[f"x{h}"].mean(), 2),
                               "raw_mean_%": round(100 * gb[f"r{h}"].mean(), 2)})
                    rows.append(st)
    base_tab = pd.DataFrame(rows)
    save_csv(base_tab, "insider_baseline_by_bucket.csv")

    # ---------------------------------------------------------------- variant grid, IS selection
    grid = []
    for v in variants():
        s = select(res, v)
        rec = {"variant": vname(v), **v}
        for per in ["2009-15 (IS)", "2016-26 (OOS)"]:
            g = s[s["period"] == per]
            for h in (5, 20, 60):
                col = f"n{h}"
                x = g[col].dropna()
                tag = "IS" if per.endswith("(IS)") else "OOS"
                rec[f"{tag}_n{h}"] = len(x)
                rec[f"{tag}_mean{h}_%"] = round(100 * x.mean(), 2) if len(x) else np.nan
                rec[f"{tag}_med{h}_%"] = round(100 * x.median(), 2) if len(x) else np.nan
                rec[f"{tag}_tc{h}"] = round(clustered_t(g[col], g["event_date"]), 2) if len(x) > 20 else np.nan
        grid.append(rec)
    grid = pd.DataFrame(grid)
    save_csv(grid, "insider_variant_grid.csv")
    elig = grid[grid["IS_n20"] >= 100]
    best = elig.sort_values("IS_tc20", ascending=False).iloc[0]
    out["n_variants"] = int(len(grid))
    out["n_tests_incl_horizons"] = int(len(grid) * 3)
    out["selected_variant_IS"] = best["variant"]
    bonf_z = float(__import__("scipy.stats", fromlist=["norm"]).norm.ppf(1 - 0.05 / (2 * len(grid) * 3)))
    out["bonferroni_t_threshold_(108 tests, 5% two-sided)"] = round(bonf_z, 2)
    out["IS_share_of_variants_t>2_h20"] = round(float((grid["IS_tc20"] > 2).mean()), 3)
    out["OOS_share_of_variants_t>2_h20"] = round(float((grid["OOS_tc20"] > 2).mean()), 3)
    out["OOS_share_of_variants_mean>0_h20"] = round(float((grid["OOS_mean20_%"] > 0).mean()), 3)

    # ---------------------------------------------------------------- selected variant: full stats
    v = {k: best[k] for k in ["W", "K", "opp_only", "min_value", "top_officer"]}
    v = {"W": int(v["W"]), "K": int(v["K"]), "opp_only": bool(v["opp_only"]), "min_value": float(v["min_value"]),
         "top_officer": bool(v["top_officer"])}
    sel = select(res, v)
    det = []
    for per, g in sel.groupby("period"):
        for bk, gb in list(g.groupby("bucket")) + [("ALL", g)]:
            for h in H:
                st = summarize(gb, f"n{h}", YEARS[per])
                st.update({"period": per, "bucket": bk, "h": h})
                det.append(st)
            for col in ["n20_open", "n20_ar"]:
                st = summarize(gb, col, YEARS[per])
                st.update({"period": per, "bucket": bk, "h": col})
                det.append(st)
    det = pd.DataFrame(det)
    save_csv(det, "insider_selected_detail.csv")

    # deflated Sharpe on the OOS per-trade net returns of the selected variant (n_trials = 36)
    oos = sel[sel["period"] == "2016-26 (OOS)"]
    x = oos["n20"].dropna()
    if len(x) > 10:
        sr = x.mean() / x.std()
        out["OOS_selected_per_trade_SR_h20"] = round(float(sr), 3)
        out["OOS_deflated_sharpe_prob_36_trials"] = round(deflated_sharpe_prob(sr, len(x), 36, float(x.skew()), float(x.kurt() + 3)), 3)

    # ---------------------------------------------------------------- crash behaviour (OOS, selected)
    cr = {}
    for h in (20, 60):
        g = oos.dropna(subset=[f"r{h}", f"b{h}"])
        cr[f"corr_raw_vs_bench_h{h}"] = round(float(np.corrcoef(g[f"r{h}"], g[f"b{h}"])[0, 1]), 2)
        bad = g[g[f"b{h}"] < -0.10]
        cr[f"n_windows_bench_below_-10%_h{h}"] = int(len(bad))
        cr[f"mean_raw_when_bench_below_-10%_h{h}_%"] = round(100 * float(bad[f"r{h}"].mean()), 1) if len(bad) else None
        cr[f"mean_excess_when_bench_below_-10%_h{h}_%"] = round(100 * float(bad[f"x{h}"].mean()), 1) if len(bad) else None
    port = calendar_portfolio(sel[sel["period"] != "2006-08 (pre-pub)"].assign(n20=lambda d: d["n20"]), 20, ret_col_prefix="n")
    if len(port):
        ann = port.mean() * 252
        vol = port.std() * math.sqrt(252)
        eq = np.exp(port.cumsum())
        cr["calendar_portfolio_2009_26_ann_net_excess_%"] = round(100 * ann, 1)
        cr["calendar_portfolio_vol_%"] = round(100 * vol, 1)
        cr["calendar_portfolio_sharpe"] = round(float(ann / vol), 2) if vol > 0 else None
        cr["calendar_portfolio_maxDD_%"] = round(100 * float((eq / eq.cummax() - 1).min()), 1)
        yearly = port.groupby(port.index.year).sum().apply(lambda z: round(100 * (math.exp(z) - 1), 1))
        cr["calendar_portfolio_by_year_%"] = yearly.to_dict()
    out["crash_and_portfolio"] = cr

    # ---------------------------------------------------------------- sizing (OOS, selected), unhedged and hedged
    rf20 = 0.04 * 20 / 252
    sz = {}
    for label, col in [("hedged_excess_net", "n20"), ("unhedged_raw_net", None)]:
        r = oos["n20"] if col else (oos["r20"] - oos["cost_rt"])
        kg = kelly_growth(r.dropna(), kappa=0.5, k=0.25, cap=0.05, rf_per_trade=0.0 if col else rf20)
        sz[label] = {k: (round(v_, 4) if isinstance(v_, float) else v_) for k, v_ in kg.items()}
        for n_per_yr in (6, 12, 24):
            sz[label][f"dg_per_year_%_at_{n_per_yr}_trades"] = round(100 * n_per_yr * kg["g_per_trade"], 3) if np.isfinite(kg["g_per_trade"]) else None
    out["sizing_quarter_kelly_OOS_h20"] = sz

    # ---------------------------------------------------------------- strength ranking inside the OOS
    rk = []
    for col, bins in [("value", [0, 1e5, 5e5, 2e6, 1e12]), ("n_insiders", [1, 2, 3, 4, 100]), ("pre20", [-5, -0.2, -0.05, 0.05, 5]),
                      ("mcap", [0, 5e7, 3e8, 2e9, 1e13])]:
        for per in ["2009-15 (IS)", "2016-26 (OOS)"]:
            g = res[(res["W"] == 30) & (res["K"] == 2) & res["tradable"] & (res["period"] == per)]
            cut = pd.cut(g[col], bins)
            t = g.groupby(cut, observed=True)["n20"].agg(["size", "mean", "median"])
            for idx, r_ in t.iterrows():
                rk.append({"feature": col, "period": per, "bin": str(idx), "n": int(r_["size"]),
                           "mean_net20_%": round(100 * r_["mean"], 2), "median_net20_%": round(100 * r_["median"], 2)})
    save_csv(pd.DataFrame(rk), "insider_strength_bins.csv")
    save_json(out, "insider_summary.json")

    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    print(cov.to_string())
    print(base_tab[(base_tab["bucket"] == "ALL")][["W", "K", "period", "h", "n", "per_yr", "gross_excess_mean_%", "mean_%", "median_%",
                                                   "t_clustered", "win_%"]].to_string())
    print(base_tab[(base_tab["W"] == 30) & (base_tab["K"] == 2) & (base_tab["h"] == 20)][["period", "bucket", "n", "per_yr", "gross_excess_mean_%", "mean_%", "median_%", "t_clustered", "win_%"]].to_string())
    print(grid[["variant", "IS_n20", "IS_mean20_%", "IS_tc20", "OOS_n20", "OOS_mean20_%", "OOS_med20_%", "OOS_tc20", "OOS_mean60_%", "OOS_tc60"]].to_string())
    print(det[det["bucket"] == "ALL"].to_string())
    import json
    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
