"""Render the markdown tables used in research/17-short-horizon-macro-events.md from the saved CSV outputs.
Run after the analyze_* scripts. Output: SCRATCH/report_tables.md
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from lib17 import SCRATCH

OUT = []


def md(df: pd.DataFrame, nd=1) -> str:
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_float_dtype(df[c]):
            df[c] = df[c].map(lambda v: "" if pd.isna(v) else f"{v:.{nd}f}")
    cols = list(df.columns)
    lines = ["| " + " | ".join(str(c).replace("|", " · ") for c in cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for _, r in df.iterrows():
        lines.append("| " + " | ".join(str(r[c]).replace("|", " · ") for c in cols) + " |")
    return "\n".join(lines)


def add(title, df, nd=1):
    OUT.append(f"\n### {title}\n\n{md(df, nd)}\n")


def summ_rows(csv, sets_assets, windows=("d0", "f1", "f5", "f20", "f60")):
    s = pd.read_csv(SCRATCH / csv)
    rows = []
    for st in sets_assets:
        x = s[s["set"] == st]
        for w in windows:
            y = x[x.window == w]
            if y.empty:
                continue
            y = y.iloc[0]
            rows.append({"set|asset": st, "window": w, "n": int(y.n), "mean": y["mean"], "median": y["median"],
                         "sd": y["sd"], "hit%": y["hit%"], "base mean": y.base_mean, "excess": y.excess,
                         "p": y.p_placebo})
    return pd.DataFrame(rows)


def main():
    # geo
    add("Geo onsets (declustered) — summary", summ_rows("shock_summary_geo_all.csv",
        ["geo_all|SPX", "geo_all|WTI", "geo_all|USO", "geo_all|GOLD", "geo_all|UST10Y", "geo_all|TLT", "geo_all|DXY", "geo_all|BTC"]), 2)
    add("Geo war subset — oil and gold", summ_rows("shock_summary_geo_war.csv", ["geo_war|WTI", "geo_war|USO", "geo_war|GOLD", "geo_war|SPX"]), 2)
    e = pd.read_csv(SCRATCH / "shock_events_geo_all.csv")
    cols = ["event", "day0", "d0", "f5", "f20", "f60", "mdd60_from_pre", "days_to_low", "wti_d0", "wti_f20", "gold_d0", "gold_f20", "10y_bp_f20"]
    add("Geo per-event", e[cols], 1)
    # deesc
    add("De-escalations — summary", summ_rows("shock_summary_deesc_all.csv",
        ["deesc_all|SPX", "deesc_all|WTI", "deesc_all|USO", "deesc_all|GOLD", "deesc_all|UST10Y", "deesc_all|TLT", "deesc_all|LUV", "deesc_all|XOI"]), 2)
    e = pd.read_csv(SCRATCH / "shock_events_deesc_all.csv")
    add("De-escalation per-event", e[["event", "day0", "d0", "f5", "f20", "f60", "wti_d0", "wti_f20", "wti_f60", "10y_bp_f60"]], 1)
    # oil shocks
    add("Oil shocks — summary", summ_rows("shock_summary_oil_shocks.csv",
        ["oil_shocks|WTI", "oil_shocks|BRENT", "oil_shocks|USO", "oil_shocks|SPX", "oil_shocks|XLE", "oil_shocks|JETS", "oil_shocks|INDA", "oil_shocks|EIDO"]), 2)
    # crashes
    add("Crash named — summary", summ_rows("shock_summary_crash_named.csv",
        ["crash_named|SPX", "crash_named|TLT", "crash_named|GOLD", "crash_named|UST2Y", "crash_named|BTC"]), 2)
    e = pd.read_csv(SCRATCH / "shock_events_crash_named.csv")
    add("Crash per-event", e[["event", "day0", "d0", "f5", "f20", "f60", "mdd60_from_pre", "days_to_low", "10y_bp_f20"]], 1)
    rc = pd.read_csv(SCRATCH / "robust_crash_regimes.csv")
    g = rc.groupby(["thr", "above200", "period"]).agg(n=("f60", "size"), f5=("f5", "mean"), f20=("f20", "mean"),
                                                      f60=("f60", "mean"), f60_median=("f60", "median"),
                                                      hit60=("f60", lambda x: (x > 0).mean() * 100),
                                                      median_mae60=("mae60", "median"), worst_mae60=("mae60", "min")).reset_index()
    add("Crash days by trend regime/period", g, 1)
    # unwinds
    u = pd.read_csv(SCRATCH / "unwind_oil_paths.csv")
    add("Oil unwinds — WTI path", u[["episode", "date", "type", "WTI_d0%", "WTI_cum5%", "WTI_cum20%", "WTI_cum60%", "WTI_f5%", "WTI_f20%", "WTI_f60%",
                                     "WTI_days_to_-10%", "WTI_days_to_-20%", "WTI_MAE_short_20%", "WTI_MFE_short_60%"]], 1)
    add("Oil unwinds — USO/Brent", u[["episode", "USO_d0%", "USO_f5%", "USO_f20%", "USO_f60%", "USO_MAE_short_20%", "BRENT_d0%", "BRENT_f20%", "BRENT_f60%", "BNO_f20%", "BNO_f60%"]], 1)
    add("Unwind events — assets", summ_rows("unwind_event_assets.csv",
        [f"unwind_event|{a}" for a in ["WTI", "USO", "BNO", "XLE", "JETS", "LUV", "DAL", "UAL", "INDA", "EIDO", "SPX", "TLT", "UST10Y", "UST2Y", "GOLD", "EEM"]],
        windows=("d0", "f1", "f5", "f20", "f60")), 2)
    m = pd.read_csv(SCRATCH / "unwind_event_matrix.csv")
    add("Unwind event matrix", m, 1)
    os_ = pd.read_csv(SCRATCH / "unwind_onset_split.csv")
    add("Oil onsets by class", os_, 1)
    # scheduled
    b = pd.read_csv(SCRATCH / "sched_all_buckets.csv")
    b[["event", "bucket", "asset"]] = b["set"].str.split("|", expand=True)
    keep = b[b.bucket.isin(["hawkish", "dovish"]) & b.asset.isin(["SPY", "TLT", "GOLD", "UUP", "USO", "BTC"])]
    pv = keep.assign(cell=keep.apply(lambda r: f"{r['mean']:+.2f} (p {r['p_placebo']:.2f})", axis=1))
    for w in ["f1", "f5", "f20", "f60"]:
        t = pv[pv.window == w].pivot_table(index=["event", "bucket"], columns="asset", values="cell", aggfunc="first").reset_index()
        add(f"Scheduled buckets {w}", t, 2)
    nn = keep[keep.window == "f5"].pivot_table(index=["event", "bucket"], columns="asset", values="n", aggfunc="first").reset_index()
    add("Scheduled buckets n (f5)", nn, 0)
    mt = pd.read_csv(SCRATCH / "sched_midterms.csv")
    add("Midterms per year", mt[["year", "pre_1m", "post_1w", "post_1m", "post_2m", "full_-1m_+2m", "house_flip"]], 1)
    ms = pd.read_csv(SCRATCH / "sched_midterms_summary.csv")
    add("Midterms summary", ms, 2)
    ww = pd.read_csv(SCRATCH / "sched_midterm_watchwindow.csv")
    rows = []
    for lbl, sub in [("midterm, all", ww[ww.midterm]), ("other years, all", ww[~ww.midterm]),
                     ("midterm, within 5% of 52w high", ww[ww.midterm & (ww.dist_from_52wk_high >= -5)]),
                     ("other, within 5% of 52w high", ww[~ww.midterm & (ww.dist_from_52wk_high >= -5)]),
                     ("midterm, >5% below high", ww[ww.midterm & (ww.dist_from_52wk_high < -5)])]:
        rows.append({"group": lbl, "n": len(sub), "Sep28->Eday mean": sub.sep28_to_eday.mean(), "hit%": (sub.sep28_to_eday > 0).mean() * 100,
                     "Eday->Nov27 mean": sub.eday_to_nov27.mean(), "Sep28->Nov27 mean": sub.sep28_to_nov27.mean(),
                     "median": sub.sep28_to_nov27.median(), "sd": sub.sep28_to_nov27.std(), "hit% ": (sub.sep28_to_nov27 > 0).mean() * 100,
                     "P(maxDD<=-5%)": (sub.mdd_sep28_nov27 <= -5).mean() * 100, "worst maxDD": sub.mdd_sep28_nov27.min()})
    add("Midterm watch-window", pd.DataFrame(rows), 1)
    sh = pd.read_csv(SCRATCH / "sched_shutdowns.csv")
    add("Shutdowns", sh[["set", "window", "n", "mean", "median", "sd", "hit%", "base_mean", "excess", "p_placebo"]], 2)
    bj = pd.read_csv(SCRATCH / "sched_boj.csv")
    add("BoJ", bj, 2)
    ab = pd.read_csv(SCRATCH / "sched_event_abs.csv")
    add("Event-day abs moves", ab[ab.asset.isin(["SPY", "TLT", "UST2Y"])], 2)
    # implied
    ev = pd.read_csv(SCRATCH / "implied_spy_events.csv")
    add("SPY implied events", ev[["interval_to", "contains", "tdays", "implied_event_day_1sd%", "implied_event_day_E|move|%"]], 2)
    st = pd.read_csv(SCRATCH / "implied_structures.csv")
    add("Structures", st[["label", "expiry", "K_long", "K_short", "spot", "debit_fill", "debit_%spot", "max_multiple", "breakeven_move%",
                          "RN_P(long ITM)%", "RN_P(full)%", "spread%_long", "spread%_short", "oi_long", "oi_short", "roundtrip_cost_%debit"]], 2)
    tt = pd.read_csv(SCRATCH / "implied_terms.csv")
    key = tt[tt.expiry.isin(["2026-10-16", "2026-10-30", "2026-11-20", "2026-12-18"])]
    pv = key.pivot_table(index="ticker", columns="expiry", values="implied_move%").round(1).reset_index()
    add("Implied moves by expiry", pv, 1)
    bt = pd.read_csv(SCRATCH / "betas_to_uso.csv")
    add("Betas to USO", bt, 2)
    (SCRATCH / "report_tables.md").write_text("\n".join(OUT))
    print("written", SCRATCH / "report_tables.md", len(OUT))


if __name__ == "__main__":
    main()
