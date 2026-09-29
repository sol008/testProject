"""Track 33 - the strategy zoo.  Reproduces every number in research/33-strategy-zoo.md.

    python run_all.py            # ~3-5 minutes after the first (downloading) run

Writes research/code/33-zoo/output/:
  ranking_full.csv.gz   every variant: longest-window, 2010-2026 and 2016-2026 statistics, IS/OOS CAGRs
  top25_*.csv           leaders per window;  family_best.csv  best variant per family
  is_oos_*.csv          top 10 in sample vs out of sample for designs A (2016-26), B (2000-26), C (1929-26)
  dsr_*.csv             deflated Sharpe ratios; reality_check.csv  White's reality check p-values
  fiveyear_ge100.csv    variants whose best 5-year window averaged >= +100% a year, with an ex-ante rank
  walkforward_*.csv     pick-the-leader meta strategy;  bootstrap.csv  5-year block-bootstrap odds
  summary.json          headline numbers;  tables.md  the markdown tables used in the report
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from zoo_analysis import (LN2W, WPY, Frame, block_bootstrap, deflated_sharpe, is_oos, reality_check, series_stats,
                          walk_forward, window_table)
from zoo_data import END, build_panel
from zoo_engine import Zoo, build_all

OUT = Path(__file__).resolve().parent / "output"
OUT.mkdir(exist_ok=True)
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


def pct(x, nd=0):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "n/a"
    return f"{100 * x:+,.{nd}f}%"


def md(df: pd.DataFrame) -> str:
    return df.to_markdown(index=False)


CRYPTO_U = ("BTC", "ETH", "LTC", "SOL")


def uses_2x_crypto(row) -> bool:
    """True if the variant ever holds a synthetic 2x crypto fund (none existed before BITX, June 2023)."""
    d = dict(kv.split("=", 1) for kv in str(row["params"]).split(";") if "=" in kv)
    fam = row["family"]
    if fam.startswith("3"):
        return d.get("univ") in ("crypto", "risk-mix", "growth") and int(d.get("L", 1)) >= 2
    if fam.startswith("7"):
        return "BTC 2x" in row["name"] or "ETH 2x" in row["name"]
    if d.get("u") in CRYPTO_U:
        return int(d.get("L", d.get("Lmax", 1))) >= 2
    return False


def main():
    panel = build_panel()
    z = Zoo(panel)
    log(f"calendar {z.cal[0].date()}..{z.cal[-1].date()}, {z.K} weekly periods")
    reg = build_all(z, log=log)
    fr = Frame(z, reg)
    meta = fr.meta
    meta["uses_2x_crypto"] = meta.apply(uses_2x_crypto, axis=1)
    log(f"{fr.N} variants built ({int(meta.uses_2x_crypto.sum())} use synthetic 2x crypto)")

    # ------------------------------------------------------------------ 1. ranking tables
    full = window_table(fr, strict=False)
    w10 = window_table(fr, fr.k_of("2010-01-01"), None, strict=True)
    w16 = window_table(fr, fr.k_of("2016-01-01"), None, strict=True)
    log("window tables done")
    cols = ["start", "end", "years", "cagr", "median_yr", "best_yr", "worst_yr", "maxdd", "share_ge100",
            "share_le_m50", "sharpe", "vol", "n_years", "max5y_cagr", "max5y_from", "min5y_cagr", "mult"]
    rank = meta.join(full[cols])
    for lab, t in (("w2010_", w10), ("w2016_", w16)):
        rank = rank.join(t[["cagr", "median_yr", "best_yr", "worst_yr", "maxdd", "share_ge100", "share_le_m50"]].add_prefix(lab))

    # ------------------------------------------------------------------ 2. out-of-sample designs
    designs = {"A": ("2016-01-01", "2021-05-15", END), "B": ("2000-01-01", "2013-05-14", END),
               "C": ("1929-02-01", "1977-11-15", END)}
    iso, isos = {}, {}
    for d, (a, m, b) in designs.items():
        ids = None
        if d == "C":
            ids = [j for j in range(fr.N) if meta.loc[j, "assets"] == "SPX"]
        t, s = is_oos(fr, a, m, b, ids=ids)
        iso[d], isos[d] = t, s
        rank = rank.join(t[["is_cagr", "oos_cagr"]].add_prefix(f"{d}_"))
        log(f"design {d}: {s}")
    rank.to_csv(OUT / "ranking_full.csv.gz", float_format="%.4f", compression="gzip")


    t_full = rank[rank.years >= 10].sort_values("cagr", ascending=False).head(25)
    t_2010 = rank.dropna(subset=["w2010_cagr"]).sort_values("w2010_cagr", ascending=False).head(25)
    t_2016 = rank.dropna(subset=["w2016_cagr"]).sort_values("w2016_cagr", ascending=False).head(25)
    t_full.to_csv(OUT / "top25_longest.csv", float_format="%.4f")
    t_2010.to_csv(OUT / "top25_2010_2026.csv", float_format="%.4f")
    t_2016.to_csv(OUT / "top25_2016_2026.csv", float_format="%.4f")
    real = rank[~rank.uses_2x_crypto]
    t_full_r = real[real.years >= 10].sort_values("cagr", ascending=False).head(15)
    t_2016_r = real.dropna(subset=["w2016_cagr"]).sort_values("w2016_cagr", ascending=False).head(15)
    t_full_r.to_csv(OUT / "top15_longest_no2xcrypto.csv", float_format="%.4f")
    t_2016_r.to_csv(OUT / "top15_2016_2026_no2xcrypto.csv", float_format="%.4f")
    nocrypto = rank[~rank.assets.str.contains("BTC|ETH|LTC|SOL")]
    t_full_nc = nocrypto[nocrypto.years >= 20].sort_values("cagr", ascending=False).head(15)
    t_full_nc.to_csv(OUT / "top15_longest_nocrypto_20y.csv", float_format="%.4f")

    fam = []
    for f_, g in rank.groupby("family"):
        row = dict(family=f_, variants=len(g))
        g10 = g[g.years >= 10]
        if len(g10):
            b = g10.sort_values("cagr", ascending=False).iloc[0]
            row.update(best_longest=b["name"], longest_from=b.start, longest_cagr=b.cagr, longest_maxdd=b.maxdd,
                       median_variant_cagr_longest=g10.cagr.median())
        for lab in ("w2010", "w2016"):
            gg = g.dropna(subset=[f"{lab}_cagr"])
            if len(gg):
                b = gg.sort_values(f"{lab}_cagr", ascending=False).iloc[0]
                row.update({f"best_{lab}": b["name"], f"{lab}_cagr": b[f"{lab}_cagr"], f"{lab}_maxdd": b[f"{lab}_maxdd"]})
        fam.append(row)
    fam = pd.DataFrame(fam)
    fam.to_csv(OUT / "family_best.csv", index=False, float_format="%.4f")
    log("rankings written")

    # ------------------------------------------------------------------ 3. selection bias
    dsr_all = {}
    for d, (a, m, b) in designs.items():
        t = iso[d]
        ka, km = isos[d]["ka"], isos[d]["km"]
        tops = list(t.sort_values("is_cagr", ascending=False).head(10).index)
        dd = deflated_sharpe(fr, list(t.index), ka, km - 1, tops)
        dd = dd.join(meta.set_index("id")[["name"]])
        dd.to_csv(OUT / f"dsr_{d}.csv", float_format="%.4f")
        dsr_all[d] = dd
        ot = t.loc[tops].join(meta.set_index("id")[["family", "name"]]).join(dd[["sr_ann", "dsr_N", "dsr_Neff"]])
        ot.to_csv(OUT / f"is_oos_{d}_top10.csv", float_format="%.4f")
    log("deflated Sharpe done")

    rc_rows = []
    spx_bh = int(meta[(meta.name == "SPX 1x buy-and-hold")].id.iloc[0])
    for d in ("A", "B"):
        t = iso[d]
        ids = list(t.index)
        ka, km, kb = isos[d]["ka"], isos[d]["km"], isos[d]["kb"]
        for lab, (x0, x1) in (("in-sample", (ka, km - 1)), ("out-of-sample", (km, kb))):
            R = np.nan_to_num(fr.M[x0:x1 + 1][:, ids])
            bench = np.nan_to_num(fr.M[x0:x1 + 1, spx_bh])
            r1 = reality_check(R - bench[:, None], B=1000)
            r2 = reality_check(np.log1p(np.maximum(R, -0.999999)) - LN2W, B=1000)
            rc_rows.append(dict(design=d, sample=lab, test="best mean weekly return > S&P 500 buy-and-hold",
                                best=meta.loc[ids[r1["best"]], "name"], best_excess_ann=r1["best_mean_ann"],
                                p_value=r1["p_value"], N=r1["N"], T=r1["T"]))
            rc_rows.append(dict(design=d, sample=lab, test="best log growth > +100%/yr hurdle",
                                best=meta.loc[ids[r2["best"]], "name"], best_excess_ann=r2["best_mean_ann"],
                                p_value=r2["p_value"], N=r2["N"], T=r2["T"]))
    rc = pd.DataFrame(rc_rows)
    rc.to_csv(OUT / "reality_check.csv", index=False, float_format="%.4f")
    log("reality check done")

    # ------------------------------------------------------------------ 4. the 100% question
    five = rank[rank.max5y_cagr >= 1.0].sort_values("max5y_cagr", ascending=False)
    # ex-ante rank at the window start: percentile of trailing-3y growth among variants live for it
    ex = []
    for j, row in five.iterrows():
        k0 = fr.k_of(str(row.max5y_from))
        if k0 < 156:
            ex.append((np.nan, np.nan, 0))
            continue
        W = fr.M[k0 - 156:k0]
        ok = ~np.isnan(W).any(axis=0)
        sc = np.log1p(np.maximum(np.nan_to_num(W), -0.999999)).sum(axis=0)
        if not ok[j]:
            ex.append((np.nan, np.nan, int(ok.sum())))
            continue
        rk = int((sc[ok] > sc[j]).sum()) + 1
        ex.append((rk, rk / ok.sum(), int(ok.sum())))
    five = five.assign(exante_rank=[e[0] for e in ex], exante_pctile=[e[1] for e in ex], exante_pool=[e[2] for e in ex])
    five[["family", "name", "start", "years", "cagr", "max5y_cagr", "max5y_from", "exante_rank", "exante_pctile",
          "exante_pool", "maxdd"]].to_csv(OUT / "fiveyear_ge100.csv", float_format="%.4f")
    log(f"{len(five)} variants had a 5-year window >= +100%/yr")

    wf_picks, wf = walk_forward(fr, first_year=2001, look=156, top=(1, 10))
    wf_picks.to_csv(OUT / "walkforward_picks.csv", index=False, float_format="%.4f")
    wf_stats = []
    for n, s in wf.items():
        for a, b in ((None, None), ("2016-01-01", None), ("2021-05-15", None)):
            st = series_stats(fr, s, a, b)
            st.update(meta=f"top-{n} by trailing 3y CAGR, yearly", window=f"{a or 'first'}..end")
            wf_stats.append(st)
    wf_picks_nc, wf_nc = walk_forward(fr, first_year=2001, look=156, top=(1, 10),
                                      ids=[j for j in range(fr.N) if not any(c in meta.loc[j, "assets"] for c in ("BTC", "ETH", "LTC", "SOL", "crypto"))])
    for n, s in wf_nc.items():
        for a, b in ((None, None), ("2016-01-01", None)):
            st = series_stats(fr, s, a, b)
            st.update(meta=f"top-{n} (no crypto) by trailing 3y CAGR, yearly", window=f"{a or 'first'}..end")
            wf_stats.append(st)
    wf_picks_r, wf_r = walk_forward(fr, first_year=2001, look=156, top=(1, 10),
                                    ids=[j for j in range(fr.N) if not meta.loc[j, "uses_2x_crypto"]])
    wf_picks_r.to_csv(OUT / "walkforward_picks_no2xcrypto.csv", index=False, float_format="%.4f")
    for n, s in wf_r.items():
        for a, b in ((None, None), ("2016-01-01", None), ("2021-05-15", None)):
            st = series_stats(fr, s, a, b)
            st.update(meta=f"top-{n} (no 2x crypto) by trailing 3y CAGR, yearly", window=f"{a or 'first'}..end")
            wf_stats.append(st)
    wf_stats = pd.DataFrame(wf_stats)
    wf_stats.to_csv(OUT / "walkforward_stats.csv", index=False, float_format="%.4f")
    log("walk-forward done")

    # 10-year out-of-sample: best OOS CAGR among the in-sample top 10 of designs B (13.4y) and C (48.9y)
    ten = []
    for d in ("B", "C"):
        t = iso[d].sort_values("is_cagr", ascending=False).head(10)
        j = int(t.oos_cagr.idxmax())
        ten.append(dict(design=d, oos_years=round((fr.end[isos[d]["kb"]] - fr.start[isos[d]["km"]]).days / 365.25, 1),
                        is_winner=meta.loc[int(t.index[0]), "name"], is_winner_oos_cagr=float(t.oos_cagr.iloc[0]),
                        best_of_is_top10=meta.loc[j, "name"], best_of_is_top10_oos_cagr=float(t.oos_cagr.max()),
                        best_any_oos_cagr_hindsight=isos[d]["oos_best_cagr"],
                        best_any_oos_hindsight=meta.loc[isos[d]["oos_best_id"], "name"]))
    ten = pd.DataFrame(ten)
    ten.to_csv(OUT / "ten_year_oos.csv", index=False, float_format="%.4f")

    # ------------------------------------------------------------------ reference systems across windows
    refs = ["SPX 1x buy-and-hold", "NDX 1x buy-and-hold", "NDX 3x buy-and-hold", "SPX 3x SMA200 (off=cash)",
            "NDX 3x SMA200 (off=cash)", "NDX 3x when 21d vol<25% (off=cash)", "SPX 3x turn-of-month weeks",
            "SMH 3x SMA200 (off=cash)", "BTC 1x buy-and-hold", "BTC 1x SMA200 (off=cash)", "ETH 1x buy-and-hold",
            "BTC 2x buy-and-hold", "crypto top1 blend mom, every 4w +abs filter, 1x",
            "50% NDX 3x SMA200 + 50% BTC 1x SMA200, rebalance 13w",
            "1/3 each NDX 3x SMA200 + BTC 1x SMA200 + ETH 1x SMA200, rebalance 13w",
            "NDX calls K=1.00S 91d, 25% of equity, SMA200 uptrend, roll 6w"]
    ref = rank[rank.name.isin(refs)].set_index("name").reindex(refs)
    ref[["start", "cagr", "maxdd", "median_yr", "worst_yr", "w2010_cagr", "w2016_cagr", "A_is_cagr", "A_oos_cagr",
         "B_is_cagr", "B_oos_cagr", "C_is_cagr", "C_oos_cagr"]].to_csv(OUT / "reference_systems.csv", float_format="%.4f")

    # ------------------------------------------------------------------ bootstrap of the leaders
    pick = {}
    for j in t_full.head(3).index:
        pick[j] = "top-3 longest window"
    for j in t_2016.head(3).index:
        pick.setdefault(j, "top-3 2016-2026")
    for j in iso["A"].sort_values("is_cagr", ascending=False).head(3).index:
        pick.setdefault(j, "top-3 in-sample design A")
    for nm in ("SPX 1x buy-and-hold", "NDX 3x SMA200 (off=cash)", "BTC 1x buy-and-hold", "BTC 1x SMA200 (off=cash)",
               "NDX 3x buy-and-hold", "50% NDX 3x SMA200 + 50% BTC 1x SMA200, rebalance 13w",
               "1/3 each NDX 3x SMA200 + BTC 1x SMA200 + ETH 1x SMA200, rebalance 13w",
               "NDX 3x when 21d vol<25% (off=cash)", "SPX 3x turn-of-month weeks",
               "crypto top1 blend mom, every 4w +abs filter, 1x"):
        m = meta[meta.name == nm]
        if len(m):
            pick.setdefault(int(m.id.iloc[0]), "reference")
    boots = []
    k_recent = fr.k_of("2021-09-20")
    for j, why in pick.items():
        r = fr.M[:, j]
        b1 = block_bootstrap(r)
        b2 = block_bootstrap(r[k_recent:])
        row = dict(id=j, why=why, name=meta.loc[j, "name"], hist_from=str(rank.loc[j, "start"]), hist_cagr=rank.loc[j, "cagr"])
        row.update({f"all_{k}": v for k, v in b1.items()})
        row.update({f"last5y_{k}": v for k, v in b2.items()})
        boots.append(row)
    wf1 = wf[1]
    for lab, r in (("meta: top-1 by trailing 3y (yearly)", wf1), ("meta: top-10 by trailing 3y (yearly)", wf[10])):
        b1 = block_bootstrap(r)
        b2 = block_bootstrap(r[k_recent:])
        row = dict(id=-1, why="walk-forward", name=lab, hist_from=str(fr.start[int(np.argmax(~np.isnan(r)))].date()),
                   hist_cagr=series_stats(fr, r)["cagr"])
        row.update({f"all_{k}": v for k, v in b1.items()})
        row.update({f"last5y_{k}": v for k, v in b2.items()})
        boots.append(row)
    boots = pd.DataFrame(boots)
    boots.to_csv(OUT / "bootstrap.csv", index=False, float_format="%.4f")
    log("bootstrap done")

    # ------------------------------------------------------------------ summary + markdown tables
    fam_counts = meta.family.value_counts().sort_index()
    summary = dict(
        n_variants=int(fr.N), families={k: int(v) for k, v in fam_counts.items()}, end=str(fr.end[-1].date()),
        n_ge100_cagr_longest_10y=int(((rank.years >= 10) & (rank.cagr >= 1)).sum()),
        n_ge100_cagr_2016=int((rank.w2016_cagr >= 1).sum()), n_ge100_cagr_2010=int((rank.w2010_cagr >= 1).sum()),
        best_cagr_longest_10y=dict(name=t_full.iloc[0]["name"], cagr=float(t_full.iloc[0].cagr), start=str(t_full.iloc[0].start)),
        best_cagr_2016=dict(name=t_2016.iloc[0]["name"], cagr=float(t_2016.iloc[0].w2016_cagr)),
        best_cagr_2010=dict(name=t_2010.iloc[0]["name"], cagr=float(t_2010.iloc[0].w2010_cagr)),
        n_5y_window_ge100=int(len(five)), designs=isos,
        five_by_family={k: int(v) for k, v in five.family.value_counts().items()},
    )
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1, default=str))

    def fmt_rank(df, ccols, prefix=""):
        x = df.copy()
        out = pd.DataFrame({"system": x["name"], "family": x["family"].str[2:]})
        if prefix == "":
            out["from"] = x.start.astype(str).str[:7]
        c = lambda k: x[f"{prefix}{k}"]
        out["CAGR"] = c("cagr").map(lambda v: pct(v, 1))
        out["median yr"] = c("median_yr").map(pct)
        out["best yr"] = c("best_yr").map(pct)
        out["worst yr"] = c("worst_yr").map(pct)
        out["max DD"] = c("maxdd").map(pct)
        out["yrs >= +100%"] = c("share_ge100").map(lambda v: f"{100 * v:.0f}%")
        out["yrs <= -50%"] = c("share_le_m50").map(lambda v: f"{100 * v:.0f}%")
        return out

    lines = [f"# Track 33 tables (generated by run_all.py, data to {fr.end[-1].date()})\n",
             f"Variants: {fr.N}\n", md(fam_counts.rename_axis("family").reset_index(name="variants")), "\n"]
    lines += ["## Top 25, longest window (>= 10 years of history)\n", md(fmt_rank(t_full, cols)), "\n"]
    lines += ["## Top 25, 2010-2026\n", md(fmt_rank(t_2010, cols, "w2010_")), "\n"]
    lines += ["## Top 25, 2016-2026\n", md(fmt_rank(t_2016, cols, "w2016_")), "\n"]
    lines += ["## Top 15, longest window, excluding synthetic 2x crypto\n", md(fmt_rank(t_full_r, cols)), "\n"]
    lines += ["## Top 15, 2016-2026, excluding synthetic 2x crypto\n", md(fmt_rank(t_2016_r, cols, "w2016_")), "\n"]
    lines += ["## Top 15, no crypto at all, >= 20 years of history\n", md(fmt_rank(t_full_nc, cols)), "\n"]
    fb = fam.copy()
    for c_ in [c for c in fb.columns if c.endswith("_cagr") or c.endswith("_maxdd")]:
        fb[c_] = fb[c_].map(lambda v: pct(v, 1) if pd.notna(v) else "")
    lines += ["## Best per family\n", md(fb), "\n"]
    for d in ("A", "B", "C"):
        ot = pd.read_csv(OUT / f"is_oos_{d}_top10.csv")
        ot = pd.DataFrame({"system": ot["name"], "IS CAGR": ot.is_cagr.map(lambda v: pct(v, 1)),
                           "IS max DD": ot.is_maxdd.map(pct), "OOS CAGR": ot.oos_cagr.map(lambda v: pct(v, 1)),
                           "OOS max DD": ot.oos_maxdd.map(pct), "OOS rank": ot.oos_rank.astype(str) + f"/{isos[d]['n']}",
                           "DSR (N)": ot.dsr_N.map(lambda v: f"{v:.2f}"), "DSR (N_eff)": ot.dsr_Neff.map(lambda v: f"{v:.2f}")})
        s = isos[d]
        lines += [f"## Design {d}: {s['window']} ({s['n']} variants)\n", md(ot),
                  f"\nSpearman(IS, OOS CAGR) = {s['spearman_is_oos']:.2f}; mean OOS CAGR of IS top 10 = "
                  f"{pct(s['is_top10_mean_oos_cagr'], 1)}; median OOS CAGR of all = {pct(s['all_median_oos_cagr'], 1)}; "
                  f"best OOS (hindsight) = {pct(s['oos_best_cagr'], 1)} ({meta.loc[s['oos_best_id'], 'name']}); "
                  f"variants >= +100%/yr: IS {s['n_is_ge100']}, OOS {s['n_oos_ge100']}\n"]
    rcm = rc.copy()
    rcm["best_excess_ann"] = rcm.best_excess_ann.map(lambda v: f"{v:+.3f}")
    lines += ["## White's reality check\n", md(rcm), "\n"]
    fv = five.head(30)
    fvm = pd.DataFrame({"system": fv["name"], "family": fv.family.str[2:], "best 5y CAGR": fv.max5y_cagr.map(lambda v: pct(v, 0)),
                        "window from": fv.max5y_from.astype(str), "ex-ante rank": fv.exante_rank.map(lambda v: "" if pd.isna(v) else f"{int(v)}"),
                        "pool": fv.exante_pool, "full CAGR": fv.cagr.map(lambda v: pct(v, 1)), "max DD": fv.maxdd.map(pct)})
    lines += [f"## Best 5-year window >= +100%/yr ({len(five)} variants; top 30)\n", md(fvm), "\n",
              md(five.family.value_counts().rename_axis("family").reset_index(name="variants")), "\n"]
    wfp = wf_picks.copy()
    for c_ in ("trailing_3y_cagr", "next_year_return", "top10_next_year"):
        wfp[c_] = wfp[c_].map(lambda v: pct(v, 0))
    lines += ["## Walk-forward: each January pick the best trailing-3y variant\n", md(wfp), "\n"]
    wsm = wf_stats.copy()
    for c_ in ("cagr", "maxdd", "max5y_cagr"):
        wsm[c_] = wsm[c_].map(lambda v: pct(v, 1) if pd.notna(v) else "")
    lines += [md(wsm), "\n", "## 10-year+ out-of-sample\n", md(ten), "\n"]
    bm = boots[["name", "why", "hist_from", "hist_cagr", "all_median_5y_cagr", "all_p_5y_cagr_ge100", "all_p_maxdd_ge80",
                "all_p_end_loss_ge80", "last5y_median_5y_cagr", "last5y_p_5y_cagr_ge100", "last5y_p_maxdd_ge80"]].copy()
    for c_ in bm.columns[3:]:
        bm[c_] = bm[c_].map(lambda v: f"{100 * v:.1f}%" if "_p_" in c_ else pct(v, 1))
    lines += ["## Block bootstrap (26-week blocks, 10,000 five-year paths)\n", md(bm), "\n"]
    rf_ = pd.read_csv(OUT / "reference_systems.csv")
    for c_ in rf_.columns[2:]:
        rf_[c_] = rf_[c_].map(lambda v: pct(v, 1) if pd.notna(v) else "")
    lines += ["## Reference systems across windows\n", md(rf_), "\n"]
    extras(z, fr, rank, five, lines)
    (OUT / "tables.md").write_text("\n".join(lines))
    log("done")


def extras(z, fr, rank, five, lines):
    """Smaller numbers quoted in the report: eras, time in market, LETF validation, 5-year episodes."""
    from zoo_data import yf_close
    from zoo_engine import Signals, on_off
    S = Signals(z)
    ex = {}

    def cagr_between(ret, a, b):
        s = pd.Series(ret, index=fr.end).loc[a:b].dropna()
        yrs = (s.index[-1] - s.index[0]).days / 365.25 + 7 / 365.25
        return float((1 + s).prod() ** (1 / yrs) - 1)

    systems = {"NDX 3x when 21d vol<25%": ("NDX", 3, ("rvol", 21, 0.25)), "NDX 3x SMA200": ("NDX", 3, ("sma", 200, 0.0)),
               "BTC 1x SMA200": ("BTC", 1, ("sma", 200, 0.0))}
    for nm, (u, L, spec) in systems.items():
        sig = S.get(u, spec)
        ret = z.run(on_off(z, u, L, sig))
        v = sig[~np.isnan(sig)]
        ex[nm] = {f"{a}..{b}": cagr_between(ret, a, b) for a, b in
                  (("1985", "1999"), ("2000", "2012"), ("2013", "2026"), ("2016", "2026"), ("2021-05-15", "2026"))
                  if pd.Series(ret, index=fr.end).loc[a:b].notna().sum() > 26}
        ex[nm].update(time_in_market=float(v.mean()), switches_per_year=float(np.abs(np.diff(v)).sum() / (len(v) / WPY)))
    for u in ("NDX", "SPX"):
        ret = z.run({(u, 1): np.where(np.isnan(z.R(u, 1)), np.nan, 1.0)})
        ex[f"{u} 1x"] = {f"{a}..{b}": cagr_between(ret, a, b) for a, b in
                         (("1985", "1999"), ("2000", "2012"), ("2001-01-08", "2026"), ("2013", "2026"))}
    # synthetic 3x fund vs the real one
    for tk, u in (("TQQQ", "NDX"), ("UPRO", "SPX")):
        a = yf_close(tk)
        lv = pd.Series(np.cumprod(1 + np.nan_to_num(z.inst_daily(u, 3))), index=z.cal)
        s = lv.reindex(a.index).dropna()
        a = a.reindex(s.index)
        yrs = (s.index[-1] - s.index[0]).days / 365.25
        ex[f"{tk} validation"] = dict(start=str(s.index[0].date()), sim_cagr=float((s.iloc[-1] / s.iloc[0]) ** (1 / yrs) - 1),
                                      actual_cagr=float((a.iloc[-1] / a.iloc[0]) ** (1 / yrs) - 1))
    eth = z.p["crypto_native"]["ETH"]
    ex["ETH mean price Jun 2016"] = float(eth.loc["2016-06"].mean())
    # out-of-sample rank of named systems in design A
    a = rank.dropna(subset=["A_oos_cagr"])
    for nm in ("50% NDX 3x SMA200 + 50% BTC 1x SMA200, rebalance 13w", "NDX 3x when 21d vol<25% (off=cash)"):
        row = a[a.name == nm]
        if len(row):
            ex[f"A OOS rank: {nm}"] = f"{int((a.A_oos_cagr > row.A_oos_cagr.iloc[0]).sum()) + 1} / {len(a)}"
    # 5-year >= +100% windows by episode, and the ex-ante ranks
    yr = pd.to_datetime(five.max5y_from).dt.year
    ep = pd.Series(np.select([yr <= 1935, yr.between(1994, 1996), yr == 2009, yr.between(2012, 2013), yr.between(2016, 2017),
                              yr.between(2019, 2020), yr == 2021],
                             ["1932-37 rebound", "1995-2000 Nasdaq bubble", "post-2009 rebound", "2013-18 bitcoin arrives",
                              "2016-21 crypto boom", "2019/20-2024/25 crypto and chips", "2021-26 AI-chip boom"], "other"),
                   index=five.index)
    epi = five.assign(episode=ep).groupby("episode").agg(variants=("name", "size"), best_5y_cagr=("max5y_cagr", "max"))
    epi["best"] = [five.assign(episode=ep)[ep == e].sort_values("max5y_cagr", ascending=False)["name"].iloc[0] for e in epi.index]
    ranked = five.dropna(subset=["exante_rank"])
    ex["five_year_exante"] = dict(n=len(five), too_new=int(five.exante_rank.isna().sum()), ranked=len(ranked),
                                  ranked_top10=int((ranked.exante_rank <= 10).sum()),
                                  ranked_top1pct=int((ranked.exante_pctile <= 0.01).sum()),
                                  median_pctile=float(ranked.exante_pctile.median()),
                                  share_crypto=float(five.assets.str.contains("BTC|ETH|LTC|SOL").mean()),
                                  share_2x_crypto=float(five.uses_2x_crypto.mean()))
    spx16 = rank.loc[rank.name == "SPX 1x buy-and-hold", "w2016_cagr"].iloc[0]
    ex["zoo medians"] = dict(longest=float(rank.cagr.median()), w2016=float(rank.w2016_cagr.median()),
                             share_beat_spy_2016=float((rank.w2016_cagr > spx16).mean()),
                             share_beat_spy_by_10pts_2016=float((rank.w2016_cagr > spx16 + 0.10).mean()))
    (OUT / "extras.json").write_text(json.dumps(ex, indent=1, default=str))
    epi.to_csv(OUT / "fiveyear_episodes.csv", float_format="%.4f")
    lines += ["## 5-year >= +100% windows by episode\n", md(epi.reset_index()), "\n",
              "## Extras (eras, time in market, LETF validation, ex-ante ranks)\n", "```", json.dumps(ex, indent=1, default=str), "```\n"]


if __name__ == "__main__":
    main()
