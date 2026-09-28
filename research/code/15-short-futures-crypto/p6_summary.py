"""Part 6: data-mining haircuts, Kelly sizing and calendar-year tables across all families.

Reads results/*.csv written by p1-p3b. For each family: number of variants tried, the design-selected
variant's test result (no selection bias), the best test variant with its deflated-Sharpe probability
(Bailey & Lopez de Prado 2014) and the Bonferroni t threshold; quarter-Kelly on 50%-shrunk edges.
"""
from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd

import common as C


def family_haircuts():
    rows = []
    # multi-asset trend, three universes
    T = pd.read_csv(C.RES / "p1_trend_summary.csv")
    for uni in T["universe"].unique():
        x = T[T["universe"] == uni]
        dname = [p for p in x["period"].unique() if p.startswith("design")]
        test = x[x["period"] == "test 2008-2026"].set_index("variant")
        n = len(test)
        if dname:
            des = x[x["period"] == dname[0]].set_index("variant")
            sel = des["sharpe"].idxmax()
            sel_test = test.loc[sel, "sharpe"]
        else:
            sel, sel_test = "n/a (no pre-2008 ETF history)", np.nan
        best = test["sharpe"].idxmax()
        b = test.loc[best]
        dsr = C.deflated_sharpe(b["sharpe"], n, float(test["sharpe"].var()), b["years"], b["skew"], b["exkurt"])
        rows.append({"family": f"Multi-asset trend: {uni}", "variants": n, "design_pick": sel, "design_pick_test_SR": sel_test,
                     "median_test_SR": round(test["sharpe"].median(), 2), "best_test": best, "best_test_SR": b["sharpe"],
                     "best_t": b["t_stat"], "bonferroni_t": round(C.bonferroni_t(n), 2), "DSR_prob": dsr["DSR_prob"],
                     "SR0_expected_max_under_null": dsr["SR0_ann"]})
    # crypto trend (vs zero and vs hold)
    CT = pd.read_csv(C.RES / "p3_crypto_trend.csv")
    CT = CT[(CT["cost"] == "exchange_0.25%") & (CT["rule"] != "HOLD")]
    AL = pd.read_csv(C.RES / "p3_crypto_alpha_vs_hold.csv")
    for asset in ["BTC", "ETH"]:
        d = CT[(CT["asset"] == asset) & (CT["period"] == "design")].set_index("rule")
        t = CT[(CT["asset"] == asset) & (CT["period"] == "test")].set_index("rule")
        a = AL[(AL["asset"] == asset) & (AL["period"] == "test")].set_index("rule")
        sel = d["sharpe"].idxmax()
        best = a["alpha_t"].idxmax()
        n = len(t)
        # DSR on the alpha t-stat: convert to an annual 'information ratio' = t / sqrt(years)
        yrs = t["years"].iloc[0]
        ir = a["alpha_t"] / math.sqrt(yrs)
        dsr = C.deflated_sharpe(float(ir.max()), n, float(ir.var()), yrs, 0, 3, periods_per_year=365)
        rows.append({"family": f"Crypto trend {asset} (alpha vs buy&hold, 0.25%/side)", "variants": n, "design_pick": sel,
                     "design_pick_test_SR": f"alpha {a.loc[sel, 'alpha_ann_%']}%/yr (t {a.loc[sel, 'alpha_t']})",
                     "median_test_SR": f"median alpha t {a['alpha_t'].median():.2f}", "best_test": best,
                     "best_test_SR": f"alpha {a.loc[best, 'alpha_ann_%']}%/yr", "best_t": a.loc[best, "alpha_t"],
                     "bonferroni_t": round(C.bonferroni_t(n), 2), "DSR_prob": dsr["DSR_prob"], "SR0_expected_max_under_null": dsr["SR0_ann"]})
    # other families: counts only (tests reported in their own tables)
    counts = {
        "Energy term structure (4 markets x 6 rules + 6 portfolio rules)": 30,
        "FX carry (3 FX rules x 4 periods + ETF)": 4,
        "Bond carry & roll-down (7 rules)": 7,
        "Crypto day-of-week (7 days x 2 assets) + weekend rules (2 x 2)": 18,
        "Crypto rebounds (4 triggers x 6 horizons x 2 assets)": 48,
        "Crypto funding (3 venues x 3 horizons x 6 buckets) + 3 rules x 3 venues": 63,
        "Bitcoin ETF flows (3 windows x 3 horizons + 1 trigger)": 10,
        "Altcoin momentum (8 strategies x 4 universes)": 32,
    }
    for k, v in counts.items():
        rows.append({"family": k, "variants": v, "bonferroni_t": round(C.bonferroni_t(v), 2)})
    return pd.DataFrame(rows)


def kelly_cards():
    daily = pd.read_csv(C.SCRATCH / "p1_daily_net.csv", index_col=0, parse_dates=True)
    rows = []
    T = pd.read_csv(C.RES / "p1_trend_summary.csv")
    for col in daily.columns:
        uni, name = col.split("|")
        umap = {"LONG": "LONG (synthetic futures)", "ETF": "ETF (tradable)", "MICRO8": "MICRO8 (micro-futures markets)"}
        x = T[(T["universe"] == umap[uni]) & (T["variant"] == name) & (T["period"] == "test 2008-2026")]
        if x.empty:
            continue
        x = x.iloc[0]
        mu, sd = x["ann_ret_%"] / 100, x["vol_%"] / 100
        k = C.kelly_continuous(mu, sd, frac=0.25, shrink=0.5)
        rows.append({"universe": uni, "variant": name, "test_SR": x["sharpe"], "test_ret_%_at_10%vol": x["ann_ret_%"],
                     "qK_leverage_of_10%vol_book": k["lev_qK"], "shrunk_SR": k.get("shrunk_SR"), "g_%_per_yr": k["g_per_yr_%"]})
    return pd.DataFrame(rows)


def calendar_years():
    daily = pd.read_csv(C.SCRATCH / "p1_daily_net.csv", index_col=0, parse_dates=True)
    T = pd.read_csv(C.RES / "p1_trend_summary.csv")
    cols = ["MICRO8|TSMOM L252 H21", "MICRO8|BLEND H21", "LONG|TSMOM L252 H21", "ETF|TSMOM L126 H21"]
    out = {}
    for c in cols:
        uni, name = c.split("|")
        umap = {"LONG": "LONG (synthetic futures)", "ETF": "ETF (tradable)", "MICRO8": "MICRO8 (micro-futures markets)"}
        sc = T[(T["universe"] == umap[uni]) & (T["variant"] == name)]["scale"].iloc[0]
        r = daily[c].loc["2008-01-01":] * sc
        rf = C.rf_on(r.index, "trading")
        yr = (1 + r + rf).groupby(r.index.year).prod() - 1
        out[c + " (10% vol, + T-bills)"] = (100 * yr).round(1)
    Y = pd.DataFrame(out)
    F = pd.read_csv(C.RES / "p1_mf_funds_calendar.csv", index_col=0)
    Y = Y.join(F[["AQMIX", "DBMF", "KMLM"]], how="left")
    return Y


def main():
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    H = family_haircuts()
    C.save(H, "p6_haircuts.csv")
    print(H.to_string())
    K = kelly_cards()
    C.save(K, "p6_kelly_trend.csv")
    print(K.to_string())
    Y = calendar_years()
    C.save(Y, "p6_trend_calendar_years.csv")
    print(Y.to_string())


if __name__ == "__main__":
    main()
