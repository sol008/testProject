"""Builds the Markdown tables used in research/06-backtests-few-trade-strategies.md from results/*.csv.
Run after run_all.py.  Writes results/report_tables.md (a scratch aid for the written report)."""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import common as C
import crash_buy as CB
import data
import intl as I

OUT = CB.OUT
SCR = os.path.join(data.CACHE_DIR, "..")
P = lambda x: "" if pd.isna(x) else f"{x*100:+.0f}%"  # noqa: E731
P1 = lambda x: "" if pd.isna(x) else f"{x*100:+.1f}%"  # noqa: E731
F1 = lambda x: "" if pd.isna(x) else f"{x:.1f}"  # noqa: E731
F2 = lambda x: "" if pd.isna(x) else f"{x:.2f}"  # noqa: E731


def md(df, fmt=None):
    return C.df_to_md(df, fmt or {})


def sp_trade_table():
    t = pd.read_csv(os.path.join(OUT, "us_crash_trades.csv"))
    b = t[(t["mode"] == "ath") & (t["variant"] == "base")]
    rows = []
    for (thr, entry), g in b.groupby(["thr", "entry"], sort=False):
        r = {"thr": f"-{int(thr*100)}%", "entry": entry, "dd@entry": g["dd_at_entry"].iloc[0],
             "CAPE": g["cape_at_entry"].iloc[0], "vol": g["vol_at_entry"].iloc[0]}
        for rule in ["1y", "2y", "3y", "5y"]:
            x = g[g["exit_rule"] == rule]
            r[f"{rule} 1x"] = x["ret_1x"].iloc[0] if len(x) else np.nan
            if len(x) and x["open"].iloc[0]:
                r[f"{rule} 1x"] = np.nan
        for rule in ["3y", "5y"]:
            x = g[g["exit_rule"] == rule]
            r[f"{rule} 3x*"] = (x["ret_3x_ruin"].iloc[0] if len(x) and not x["open"].iloc[0] else np.nan)
        a = g[g["exit_rule"] == "ATH"].iloc[0]
        r["to-ATH yrs"] = a["years"]
        r["to-ATH 1x"] = a["ret_1x"]
        r["to-ATH CAGR"] = a["cagr_1x"]
        r["to-ATH 3x*"] = a["ret_3x_ruin"]
        c = g[g["exit_rule"] == "CALL2Y"].iloc[0]
        r["2y call (IV)"] = f"{c['call2y_central_ret']*100:+.0f}% ({c['call2y_central_iv']*100:.0f}%)"
        r["2y call @VIX"] = c["call2y_vix_ret"]
        rows.append(r)
    df = pd.DataFrame(rows)
    fmt = {k: P for k in df.columns if ("1x" in k or "3x" in k or k in ("dd@entry", "to-ATH CAGR", "2y call @VIX"))}
    fmt.update({"CAPE": F1, "vol": F1, "to-ATH yrs": F1})
    return md(df, fmt)


def sp_summary_table():
    s = pd.read_csv(os.path.join(OUT, "us_crash_summary.csv"))
    x = s[(s["mode"] == "ath") & (s["variant"] == "base") & (s["rule"].isin(["1y", "2y", "3y", "5y", "ATH"]))]
    x = x[x["col"].isin(["ret_1x", "ret_2x_ruin", "ret_3x_ruin"])]
    x = x.assign(L=x["col"].map({"ret_1x": "1x", "ret_2x_ruin": "2x", "ret_3x_ruin": "3x"}))
    x = x[["thr", "rule", "L", "n", "win", "mean", "median", "worst", "geo_mean", "median_cagr", "worst_mdd"]]
    x["thr"] = x["thr"].map(lambda v: f"-{int(v*100)}%")
    fmt = {k: P for k in ["win", "mean", "median", "worst", "geo_mean", "median_cagr", "worst_mdd"]}
    return md(x, fmt)


def sp_filters_table():
    s = pd.read_csv(os.path.join(OUT, "us_crash_summary.csv"))
    rows = []
    for var in ["base", "vix40", "credit3", "credit4", "trend50", "trend200", "cape<20", "cape<25", "p10ma<1.3", "easing1pp"]:
        for thr in [0.2, 0.3]:
            r = {"filter": var, "thr": f"-{int(thr*100)}%"}
            for rule, col, lab in [("3y", "ret_1x", "3y 1x"), ("3y", "ret_3x_ruin", "3y 3x*"), ("ATH", "ret_1x", "to-ATH 1x")]:
                x = s[(s["mode"] == "ath") & (s["variant"] == var) & (s["thr"] == thr) & (s["rule"] == rule) & (s["col"] == col)]
                if len(x) == 0:
                    continue
                x = x.iloc[0]
                r["n"] = int(x["n"])
                r[f"{lab} win"] = x["win"]
                r[f"{lab} median"] = x["median"]
                r[f"{lab} worst"] = x["worst"]
                if rule == "ATH":
                    r["to-ATH avg yrs"] = x["avg_years"]
            rows.append(r)
    df = pd.DataFrame(rows)
    fmt = {k: P for k in df.columns if any(w in k for w in ("win", "median", "worst"))}
    fmt["to-ATH avg yrs"] = F1
    return md(df, fmt)


def sp_bear_table():
    s = pd.read_csv(os.path.join(OUT, "us_crash_summary.csv"))
    x = s[(s["mode"] == "bear") & (s["variant"] == "base") & (s["rule"].isin(["1y", "3y", "5y"])) &
          (s["col"].isin(["ret_1x", "ret_3x_ruin"]))]
    x = x.assign(L=x["col"].map({"ret_1x": "1x", "ret_3x_ruin": "3x"}))
    x = x[["thr", "rule", "L", "n", "win", "mean", "median", "worst", "geo_mean"]]
    x["thr"] = x["thr"].map(lambda v: f"-{int(v*100)}%")
    return md(x, {k: P for k in ["win", "mean", "median", "worst", "geo_mean"]})


def strategy_table():
    S = pd.read_csv(os.path.join(OUT, "us_crash_strategies_by_start.csv"))
    x = S[(S["thr"].isin(["20", "30", "20+30+40+50"])) & (S["rule"].isin(["3y", "ATH"]))]
    x = x[["from_", "thr", "rule", "L", "idle", "CAGR", "maxDD", "time_in_mkt", "trades"]]
    return md(x, {"CAGR": P1, "maxDD": P, "time_in_mkt": P})


def failure_tables():
    t = pd.read_csv(os.path.join(OUT, "failure_market_trades.csv"))
    b = t[t["variant"] == "base"]
    out = {}
    for mk in ["Nikkei 225", "Nasdaq Composite", "Nasdaq 100", "Athens General", "FTSE MIB (Italy)", "ISEQ (Ireland)",
               "Hang Seng", "Shanghai Comp", "MSCI Greece ETF (USD)", "MSCI Brazil ETF (USD)"]:
        x = b[b["market"] == mk]
        rows = []
        for (pk, thr, entry), g in x.groupby(["peak_date", "thr", "entry"], sort=False):
            r = {"peak": pk, "thr": f"-{int(thr*100)}%", "entry": entry, "px/10y avg": g["p10ma_at_entry"].iloc[0]}
            for rule in ["1y", "3y", "5y"]:
                y = g[g["exit_rule"] == rule]
                r[f"{rule} 1x"] = y["ret_1x"].iloc[0] if len(y) and not y["open"].iloc[0] else np.nan
                r[f"{rule} 3x*"] = y["ret_3x_ruin"].iloc[0] if len(y) and not y["open"].iloc[0] else np.nan
            a = g[g["exit_rule"] == "ATH"].iloc[0]
            r["to-ATH"] = f"{a['exit']}{' (open)' if a['open'] else ''}"
            r["yrs"] = a["years"]
            r["to-ATH 1x"] = a["ret_1x"]
            rows.append(r)
        df = pd.DataFrame(rows)
        out[mk] = md(df, {**{k: P for k in df.columns if "1x" in k or "3x" in k}, "px/10y avg": F2, "yrs": F1})
    return out


def japan_easing_test():
    m = I.load_market("Nikkei 225", "fred", "NIKKEI225", "px")
    dr = data.fred("INTDSRJPM193N")
    cr = data.fred("IRSTCI01JPM156N")
    rate = pd.concat([dr[dr.index < cr.index[0]], cr]).sort_index()
    rate.index = rate.index + pd.offsets.MonthEnd(0)
    rate = rate.reindex(rate.index.union(m.idx)).ffill().reindex(m.idx)
    past = rate.reindex(m.idx - pd.Timedelta(days=365), method="ffill")
    past.index = m.idx
    ease = rate <= past - 1.0
    sigs = CB.find_signals(m, CB.THRESHOLDS, "ath", ease, False, start="1989-12-29", end="2012-12-31")
    tr = CB.build_trades(m, sigs, rules=("1y", "3y", "5y", "ATH"), with_calls=False)
    t = tr[["thr", "entry", "entry_px", "exit_rule", "ret_1x", "ret_3x_ruin", "years", "open"]]
    return t


def oos_table():
    p = pd.read_csv(os.path.join(OUT, "oos_filter_pooled.csv"))
    rows = []
    for var in ["base", "base+stop25", "vix40", "trend50", "trend200", "p10ma<1.3", "p10ma<1.1", "cape<20", "credit3", "easing1pp"]:
        for L in [1, 3]:
            r = {"filter": var, "L": f"{L}x"}
            for samp, lab in [("IS: US 1928-85", "IS US 28-85"), ("OOS: US 1986-2026", "OOS US 86-26"), ("OOS: intl", "OOS intl")]:
                x = p[(p["sample"] == samp) & (p["mode"] == "ath") & (p["variant"] == var) & (p["rule"] == "3y") & (p["L"] == L)]
                if len(x) == 0:
                    r[f"{lab} n"] = ""
                    continue
                x = x.iloc[0]
                r[f"{lab} n"] = int(x["n"])
                r[f"{lab} median"] = x["median"]
                r[f"{lab} P(loss>30%)"] = x["p_loss30"]
                r[f"{lab} geo"] = x["geo_mean"]
            rows.append(r)
    df = pd.DataFrame(rows)
    return md(df, {k: P for k in df.columns if any(w in k for w in ("median", "P(", "geo"))})


def main():
    parts = []
    ep = pd.read_csv(os.path.join(OUT, "us_ath_episodes.csv"))
    parts.append("## US ATH episodes\n" + md(ep, {"max_dd": P, "yrs_peak_to_trough": F1, "yrs_trough_to_recovery": F1, "yrs_underwater": F1}))
    epb = pd.read_csv(os.path.join(OUT, "us_bear_episodes.csv"))
    parts.append("## US bear-cycle episodes\n" + md(epb, {"max_dd": P, "yrs_peak_to_trough": F1, "yrs_trough_to_recovery": F1, "yrs_underwater": F1}))
    parts.append("## S&P trades\n" + sp_trade_table())
    parts.append("## S&P summary\n" + sp_summary_table())
    parts.append("## S&P filters\n" + sp_filters_table())
    parts.append("## S&P bear mode\n" + sp_bear_table())
    parts.append("## Strategies\n" + strategy_table())
    for k, v in failure_tables().items():
        parts.append(f"## Failure: {k}\n" + v)
    parts.append("## OOS\n" + oos_table())
    je = japan_easing_test()
    parts.append("## Japan easing\n" + md(je, {"ret_1x": P, "ret_3x_ruin": P, "years": F1}))
    txt = "\n\n".join(parts)
    with open(os.path.join(SCR, "report_tables.md"), "w") as f:
        f.write(txt)
    print(txt)


if __name__ == "__main__":
    main()
