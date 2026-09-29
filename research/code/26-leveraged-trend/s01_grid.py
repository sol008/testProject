"""s01 - the variant grid: every trend-filtered leverage rule, chosen in-sample, tested out of sample.

S&P 500: in-sample (IS) 1929-01 .. 1989-12, out-of-sample (OOS) 1990-01 .. 2026-09.
Nasdaq-100: IS 1986-10 .. 2005-12 (after the 1985-10 start and a 1-year warm-up), OOS 2006-01 .. 2026-09.
Execution: signal at the close of a decision day, traded at the next close (LAG = 2).

Families (every cell is counted in the multiple-testing tally, s04):
  T  trend filters: none (buy & hold), SMA 50/100/150/200/250 days, 10-month SMA (monthly only),
     50/200 cross, dual (200d SMA AND 12m return > T-bills), either (200d SMA OR 12m > T-bills)
     x leverage 1, 1.5, 2, 3 x evaluation daily / weekly / monthly x band 0/1/2/3%
     x brake none / VIX>30 / VIX>40 (pre-1986 VIX proxy from 20-day realised vol)
  V  vol targeting: exposure = min(cap, target / realised vol), quarter-unit steps, weekly,
     changes < 0.25x skipped; trend gate none or 200d SMA; target 15/20/25/30%; vol window 20/60 days;
     cap 1.5/2/3; brake none / VIX>40
Outputs: output/s01_grid.csv.gz (one row per variant x index), and the IS daily return matrix
(cache only, for s04).
"""
from __future__ import annotations

import itertools

import numpy as np
import pandas as pd

import common as c

PERIODS = {
    "SPX": dict(is_=("1929-01-02", "1989-12-31"), oos=("1990-01-01", "2026-12-31")),
    "NDX": dict(is_=("1986-10-01", "2005-12-31"), oos=("2006-01-01", "2026-12-31")),
}


def variants():
    out = []
    filters = ["none", "sma50", "sma100", "sma150", "sma200", "sma250", "sma10m", "x50_200", "dual", "either"]
    for L, f, fr, b, br in itertools.product([1, 1.5, 2, 3], filters, ["D", "W", "M"], [0, .01, .02, .03],
                                             [None, 30, 40]):
        if f == "sma10m" and fr != "M":
            continue
        if f == "none" and (fr != "W" or b != 0):      # buy & hold (+ brake) only once
            continue
        out.append(dict(fam="T", L=L, filt=f, freq=fr, band=b, brake=br, voltgt=None, vol_n=20))
    for gate, tgt, vn, cap, br in itertools.product(["none", "sma200"], [.15, .20, .25, .30], [20, 60],
                                                    [1.5, 2, 3], [None, 40]):
        out.append(dict(fam="V", L=cap, filt=gate, freq="W", band=0, brake=br, voltgt=tgt, vol_n=vn))
    return out


def label(v):
    s = f"{v['fam']}|L{v['L']}|{v['filt']}|{v['freq']}|b{int(v['band'] * 100)}"
    if v["voltgt"] is not None:
        s += f"|vt{int(v['voltgt'] * 100)}n{v['vol_n']}"
    if v["brake"] is not None:
        s += f"|vix{v['brake']}"
    return s


def seg_stats(s: pd.DataFrame, df: pd.DataFrame, a: str, b: str) -> dict:
    x = s.loc[a:b]
    ret = x["ret"]
    spy = df.spy.loc[ret.index]
    y = c.years(ret.index)
    ex = ret - df.rf.loc[ret.index]
    wk = x["trade"].groupby(ret.index.to_period("W-FRI")).sum()
    return dict(cagr=c.cagr_from(ret), spy=c.cagr_from(spy), excess=c.cagr_from(ret) - c.cagr_from(spy),
                maxdd=c.maxdd(ret), sharpe=ex.mean() / ex.std() * np.sqrt(c.TD) if ex.std() > 0 else np.nan,
                orders_yr=x["trade"].sum() / y, max_orders_wk=int(wk.max()), time_in=float((x.E > 0).mean()))


def main():
    vs = variants()
    rows = []
    for name, per in PERIODS.items():
        df = c.spx_panel() if name == "SPX" else c.ndx_panel()
        a0, b0 = per["is_"]
        isx = df.loc[a0:b0].index
        mat = np.zeros((len(isx), len(vs)), dtype=np.float32)
        for j, v in enumerate(vs):
            tgt = c.exposure_path(df, v["L"], v["filt"], v["freq"], v["band"], voltgt=v["voltgt"],
                                  vol_n=v["vol_n"], brake=v["brake"])
            s = c.run(df, tgt, v["L"])
            r = dict(index=name, variant=label(v), **{k: v[k] for k in ["fam", "L", "filt", "freq", "band", "brake",
                                                                        "voltgt", "vol_n"]})
            for tag, (a, b) in [("is", per["is_"]), ("oos", per["oos"]), ("p16", ("2016-01-01", "2026-12-31"))]:
                for k, val in seg_stats(s, df, a, b).items():
                    r[f"{tag}_{k}"] = val
            rows.append(r)
            mat[:, j] = s["ret"].loc[isx].values
        np.save(c.CACHE_DIR / f"s01_is_returns_{name}.npy", mat)
        pd.Series(isx).to_csv(c.CACHE_DIR / f"s01_is_dates_{name}.csv", index=False)
        print(name, "done", len(vs), "variants")
    g = pd.DataFrame(rows)
    g.to_csv(c.OUT / "s01_grid.csv.gz", index=False, float_format="%.4f", compression="gzip")
    print("variants per index:", len(vs), " total cells:", len(g))

    # --- summaries --------------------------------------------------------------------------------
    comp = g[g.freq.isin(["W", "M"])]            # compliant with <= 1 recommendation a week
    lines = []
    for name in PERIODS:
        gi = comp[comp["index"] == name]
        for L in [1, 1.5, 2, 3]:
            gl = gi[(gi.L == L) & (gi.fam == "T") & (gi.filt != "none")]
            best = gl.sort_values("is_cagr", ascending=False).head(1)
            lines.append(best.assign(pick=f"IS-best trend, L={L}"))
        gv = gi[gi.fam == "V"].sort_values("is_cagr", ascending=False).head(1)
        lines.append(gv.assign(pick="IS-best vol-target"))
        bh = gi[(gi.filt == "none") & (gi.fam == "T") & (gi.brake.isna())]
        lines.append(bh.assign(pick="buy & hold"))
    picks = pd.concat(lines)
    cols = ["index", "pick", "variant", "is_cagr", "is_excess", "is_maxdd", "oos_cagr", "oos_excess", "oos_maxdd",
            "oos_sharpe", "p16_cagr", "p16_excess", "oos_orders_yr", "oos_max_orders_wk"]
    picks[cols].to_csv(c.OUT / "s01_is_picks.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_columns", 30, "display.max_colwidth", 45):
        print(picks[cols].round(3).to_string(index=False))

    # rank correlation IS -> OOS (does the in-sample ranking carry over?)
    rc = []
    for name in PERIODS:
        gi = comp[(comp["index"] == name)]
        for L in [1.5, 2, 3]:
            gl = gi[(gi.L == L)]
            rc.append(dict(index=name, L=L, n=len(gl), spearman_is_oos_cagr=gl.is_cagr.rank().corr(gl.oos_cagr.rank()),
                           oos_cagr_top10pct_by_is=gl[gl.is_cagr >= gl.is_cagr.quantile(.9)].oos_cagr.median(),
                           oos_cagr_median_all=gl.oos_cagr.median()))
    rc = pd.DataFrame(rc)
    rc.to_csv(c.OUT / "s01_is_oos_rank.csv", index=False, float_format="%.4f")
    print(rc.round(3).to_string(index=False))

    # canonical rules, weekly, T-bills exit, by filter x band x L (median over brakes excluded: brake=None)
    canon = comp[(comp.fam == "T") & (comp.brake.isna()) & (comp.freq == "W") | (comp.filt == "sma10m") & comp.brake.isna()]
    piv = canon.pivot_table(index=["index", "filt", "band"], columns="L", values=["is_cagr", "oos_cagr", "p16_cagr"])
    piv.to_csv(c.OUT / "s01_canonical_weekly.csv", float_format="%.4f")


if __name__ == "__main__":
    main()
