"""Track 31 (the growth portfolio): reproduce every number in research/31-growth-portfolio.md.

    python3 run_all.py                    build the sleeves from the cached data, run everything (~6 min)
    python3 run_all.py --paths 500        quicker, noisier Monte Carlo
    python3 run_all.py --inputs DIR [--inputs2 DIR ...] --books my_books.json --window 2008-01-01:2026-09-28
                                          generic mode: any folder of daily return CSVs (date,ret; one
                                          file per sleeve plus rf.csv) -> Kelly mix + Monte Carlo tables.
                                          Use it to re-run the synthesis with other tracks' final series.

Data: track 04's cache (Yahoo, FRED, Shiller, CBOE; TRACK04_DATA) and track 23's monthly Phase A
history (in the repo). Built sleeves are written to TRACK31_DATA/inputs/<scenario>/ (not committed).
Outputs: results/*.csv (committed, < 1 MB).
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd

import engine31 as E
import sleeves31 as S
import studies31 as ST

HERE = Path(__file__).resolve().parent
RES = HERE / "results"
RES.mkdir(exist_ok=True)
DATA = Path(os.environ.get(
    "TRACK31_DATA", "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/31-growth"))
END = "2026-09-28"
WINDOWS = {"1928-2026": ("1928-10-01", END), "1986-2026": ("1986-07-01", END), "2008-2026": ("2008-01-01", END)}
KWIN = {"1928-2026 (S&P only)": ("1928-10-01", END), "1986-2026 (S&P + Nasdaq)": ("1986-07-01", END),
        "2014-2026 (all, with Bitcoin)": ("2014-11-24", END)}
BLOCKS_KELLY = ["SPY", "QQQ", "SPX1_200d_w", "SPX3_200d_w", "NDX1_200d_w", "NDX3_200d_w", "BTC_10wk"]
GOV_BOOKS = ["S&P 3x 200d", "3x blend (S&P/NDX 50/50) 200d", "2x blend 200d + 20% BTC switch",
             "3x blend 200d + 20% BTC switch"]
GOVS = {"design G(D): 5%->15%": E.g_design, "wide G: 20%->50%": E.g_wide, "floor at 50% of peak": E.g_floor}


def save(df: pd.DataFrame, name: str):
    df.to_csv(RES / f"{name}.csv", index=False, float_format="%.4f")
    print(f"  wrote results/{name}.csv ({len(df)} rows)")


# ============================================================================ Kelly
def exposure_series(R, one, three, e):
    """Book with exposure e to a filtered index: 1x sleeve up to e = 1, then 1x + 3x funds (fully
    invested) up to e = 3, then the 3x fund on margin at T-bills + 0.4%."""
    rf = R["rf"]
    if three is None or e <= 1:
        if e <= 1:
            return e * R[one] + (1 - e) * rf
        return e * R[one] - (e - 1) * (rf + S.SPREAD / S.TD)
    if e <= 3:
        w3 = (e - 1) / 2
        return (1 - w3) * R[one] + w3 * R[three]
    return (e / 3) * R[three] - (e / 3 - 1) * (rf + S.SPREAD / S.TD)


def kelly_single(scen: dict) -> pd.DataFrame:
    rows = []
    pairs = [("S&P 500, buy-and-hold", "SPY", "SPX3_hold"), ("S&P 500 + 200-day filter", "SPX1_200d_w", "SPX3_200d_w"),
             ("Nasdaq-100, buy-and-hold", "QQQ", "NDX3_hold"), ("Nasdaq-100 + 200-day filter", "NDX1_200d_w", "NDX3_200d_w"),
             ("Bitcoin, buy-and-hold", "BTC_hold", None), ("Bitcoin 10-week switch", "BTC_10wk", None)]
    grid = np.round(np.arange(0, 6.01, 0.05), 2)
    for sname, (R, (a, b)) in scen.items():
        X = R.loc[a:b]
        for lab, one, three in pairs:
            x = X[[c for c in (one, three, "rf") if c]].dropna()
            if len(x) < 5 * S.TD:
                continue
            g = np.array([np.log1p(exposure_series(x, one, three, e)).mean() * S.TD for e in grid])
            i = int(np.argmax(g))
            e = grid[i]

            def cg(ee):
                return np.expm1(np.log1p(exposure_series(x, one, three, ee)).mean() * S.TD)
            rows.append(dict(scenario=sname, start=str(x.index[0].date()), asset=lab, full_kelly_exposure=e,
                             cagr_full=cg(e), cagr_half=cg(e / 2), cagr_quarter=cg(e / 4), cagr_1x=cg(1.0),
                             cagr_2x=cg(2.0), cagr_3x=cg(3.0), tbill_cagr=np.expm1(np.log1p(x.rf).mean() * S.TD),
                             capped_at_grid_max=e >= grid[-1]))
    return pd.DataFrame(rows)


def kelly_mix(scen_k: dict):
    rows, books = [], {}
    for sname, (R, (a, b)) in scen_k.items():
        cols = [c for c in BLOCKS_KELLY if R[c].loc[a:b].notna().mean() > 0.99]
        w, g, (d0, d1) = E.kelly(R, cols, a, b)
        for frac, lab in ((1.0, "full"), (0.5, "half"), (0.25, "quarter")):
            wf = {k: v * frac for k, v in w.items() if v > 0}
            gg, cg = E.growth_of(R, wf, a, b) if wf else (np.log1p(R.rf.loc[a:b]).mean() * S.TD, np.nan)
            r = E.book_daily(R.loc[a:b], wf).dropna()
            lw = np.log1p(r).cumsum()
            dd = np.expm1((lw - np.maximum.accumulate(np.maximum(lw, 0))).min())
            eq = sum(v * (3 if "3_" in k else 1) for k, v in wf.items() if k != "BTC_10wk")
            rows.append(dict(scenario=sname, start=str(d0.date()), kelly=lab, cagr=np.expm1(gg), maxdd_real_path=dd,
                             equity_exposure_when_in=eq, btc_weight=wf.get("BTC_10wk", 0.0),
                             cash_weight=1 - sum(wf.values()), **{f"w_{k}": wf.get(k, 0.0) for k in BLOCKS_KELLY}))
            books[(sname, lab)] = wf
    return pd.DataFrame(rows), books


def kelly_regret(R_by_eq: dict, window) -> pd.DataFrame:
    """Size the S&P 200-day book at full / half / quarter Kelly for an ASSUMED forward return, then
    live in a world with a different TRUE return."""
    a, b = window
    grid = np.round(np.arange(0, 6.01, 0.05), 2)
    kel = {}
    for lab, R in R_by_eq.items():
        x = R.loc[a:b, ["SPX1_200d_w", "SPX3_200d_w", "rf"]].dropna()
        g = [np.log1p(exposure_series(x, "SPX1_200d_w", "SPX3_200d_w", e)).mean() for e in grid]
        kel[lab] = grid[int(np.argmax(g))]
    rows = []
    for assumed, e in kel.items():
        for frac in (1.0, 0.5, 0.25):
            row = dict(assumed_world=assumed, kelly_fraction=frac, exposure=e * frac)
            for true, R in R_by_eq.items():
                x = R.loc[a:b, ["SPX1_200d_w", "SPX3_200d_w", "rf"]].dropna()
                row[f"cagr_if_true_{true}"] = np.expm1(
                    np.log1p(exposure_series(x, "SPX1_200d_w", "SPX3_200d_w", e * frac)).mean() * S.TD)
            rows.append(row)
    return pd.DataFrame(rows)


def kelly_prior_mix(R_by_eq: dict, window, p_hist_grid=(0.0, 0.1, 0.25, 0.5)) -> pd.DataFrame:
    """Exposure to the S&P 200-day book that maximises growth AVERAGED over worlds: the historical
    premium with probability p, else the three forward worlds equally (model uncertainty)."""
    a, b = window
    grid = np.round(np.arange(0, 5.01, 0.05), 2)
    G = {}
    for lab, R in R_by_eq.items():
        x = R.loc[a:b, ["SPX1_200d_w", "SPX3_200d_w", "rf"]].dropna()
        G[lab] = np.array([np.log1p(exposure_series(x, "SPX1_200d_w", "SPX3_200d_w", e)).mean() * S.TD
                           for e in grid])
    fw = [k for k in R_by_eq if k.startswith("forward")]
    hk = [k for k in R_by_eq if k.startswith("history")][0]
    rows = []
    for p in p_hist_grid:
        avg = p * G[hk] + (1 - p) * np.mean([G[k] for k in fw], axis=0)
        i = int(np.argmax(avg))
        row = dict(prob_history_premium_returns=p, best_exposure=grid[i], expected_cagr=np.expm1(avg[i]))
        for k in R_by_eq:
            row[f"cagr_if_{k}"] = np.expm1(G[k][i])
        for frac in (0.5,):
            j = int(np.argmin(np.abs(grid - grid[i] * frac)))
            row["half_of_best_exposure_expected_cagr"] = np.expm1(avg[j])
        rows.append(row)
    return pd.DataFrame(rows)


def leverage_breakeven(R_by_eq: dict, window) -> pd.DataFrame:
    """CAGR on the real (tilted) 1928-2026 path for each equity-premium world: when does leverage pay?"""
    a, b = window
    rows = []
    for lab, R in R_by_eq.items():
        X = R.loc[a:b]
        row = dict(world=lab, spy_cagr=ST.stats(X.SPY)["cagr"], tbill_cagr=ST.stats(X.rf)["cagr"])
        for c in ("SPX1_200d_w", "SPX2_200d_w", "SPX3_200d_w", "SPX2_hold", "SPX3_hold"):
            st = ST.stats(X[c])
            row[f"{c}_cagr"], row[f"{c}_maxdd"] = st["cagr"], st["maxdd"]
        rows.append(row)
    return pd.DataFrame(rows)


def btc_sensitivity(books: dict, paths: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """How much the answer rests on Bitcoin: forward BTC CAGR 0 / 7.5 / 15% x switch edge (kappa) 0 or
    the out-of-sample value. Kelly mix on 2014-2026 and the Monte Carlo of the candidate books on the
    forward 2008-2026 bootstrap."""
    kr, mr = [], []
    for btc_fwd in (0.0, 0.075, 0.15):
        for kov, klab in ((None, "out-of-sample kappa (0.26)"), ({"BTC": 0.0}, "no switch edge (kappa 0)")):
            R, _, info = S.build_all("fwd", window=WINDOWS["2008-2026"], btc_fwd=btc_fwd, kappa_override=kov,
                                     cadences=("weekly",))
            a, b = KWIN["2014-2026 (all, with Bitcoin)"]
            w, g, _ = E.kelly(R, BLOCKS_KELLY, a, b)
            sw = ST.stats(R.BTC_10wk.loc[a:b])
            kr.append(dict(btc_buy_hold_cagr=btc_fwd, switch_edge=klab, btc_switch_cagr=sw["cagr"],
                           btc_switch_maxdd=sw["maxdd"], full_kelly_cagr=np.expm1(g),
                           full_kelly_btc_weight=w["BTC_10wk"],
                           full_kelly_equity_exposure=sum(v * (3 if "3_" in k else 1) for k, v in w.items()
                                                          if k != "BTC_10wk"),
                           half_kelly_cagr=E.growth_of(R, {k: v / 2 for k, v in w.items()}, a, b)[1]))
            bs = E.Bootstrap(R, *WINDOWS["2008-2026"], n_paths=paths, years=20)
            res, _, fill = bs.run(books)
            T, _ = E.summarize(res, fill, horizons=(10,), multiples=())
            T.insert(0, "switch_edge", klab)
            T.insert(0, "btc_buy_hold_cagr", btc_fwd)
            mr.append(T)
    return pd.DataFrame(kr), pd.concat(mr)


# ============================================================================ Monte Carlo
def monte_carlo(scen: dict, books: dict, paths: int, gov=True):
    out, tt, gv = [], [], []
    for sname, (R, (a, b)) in scen.items():
        t0 = time.time()
        bs = E.Bootstrap(R, a, b, n_paths=paths, years=50)
        gb = [k for k in GOV_BOOKS if k in books] if gov else []
        res, gres, fill = bs.run(books, governors=GOVS if gov else None, gov_books=gb)
        T, TT = E.summarize(res, fill)
        T.insert(0, "scenario", sname)
        TT.insert(0, "scenario", sname)
        out.append(T)
        tt.append(TT)
        if gov:
            # the ungoverned twin, on the same 20-year paths
            base = {(k, "none"): {kk: list(v) for kk, v in res[k].items()
                                  if kk.split("_")[-1] in ("5", "10", "20")} for k in gb if k in res}
            G, _ = E.summarize({f"{k[0]} | {k[1]}": v for k, v in {**base, **gres}.items()},
                               multiples=())
            G.insert(0, "scenario", sname)
            gv.append(G)
        print(f"  MC {sname}: {len(res)} books, {time.time() - t0:.0f}s")
    return pd.concat(out), pd.concat(tt), (pd.concat(gv) if gv else None)


def headline(mc: pd.DataFrame, tt: pd.DataFrame, books: list, scenarios: list) -> pd.DataFrame:
    rows = []
    for bk in books:
        for sc in scenarios:
            m = mc[(mc.book == bk) & (mc.scenario == sc) & (mc.horizon == 10)]
            t = tt[(tt.book == bk) & (tt.scenario == sc)]
            if m.empty:
                continue
            m, t = m.iloc[0], t.iloc[0]
            rows.append(dict(book=bk, scenario=sc, median_cagr_10y=m.median_cagr, p10_cagr_10y=m.p10_cagr,
                             p90_cagr_10y=m.p90_cagr, spy_median_cagr_10y=m.bench_median_cagr,
                             p_beat_spy_10y=m.p_beat_spy, p_beat_spy_by_5pts_10y=m.p_beat_spy_5pts,
                             p_dd_over_50_10y=m.p_dd_gt_50, p_dd_over_80_10y=m.p_dd_gt_80,
                             p_below_start_10y=m.p_below_start, median_years_to_10x=t.t10x_median,
                             p10_years_to_10x=t.t10x_p10, p90_years_to_10x=t.t10x_p90,
                             share_reaching_10x_in_50y=t.t10x_share_reached))
    return pd.DataFrame(rows)


# ============================================================================ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paths", type=int, default=2000)
    ap.add_argument("--inputs", action="append", help="folder of daily return CSVs (generic mode)")
    ap.add_argument("--books", default=str(HERE / "books.json"))
    ap.add_argument("--window", default="2008-01-01:" + END)
    ap.add_argument("--skip-build", action="store_true", help="reuse TRACK31_DATA/inputs")
    args = ap.parse_args()
    books = json.load(open(args.books))
    t0 = time.time()

    if args.inputs:                                          # ---------------- generic mode
        a, b = args.window.split(":")
        scen = {Path(d).name: (E.read_inputs(Path(d)), (a, b)) for d in args.inputs}
        blocks = sorted({k for w in books.values() for k in w})
        for sname, (R, (a0, b0)) in scen.items():
            cols = [c for c in blocks if c in R and R[c].loc[a0:b0].notna().mean() > 0.99]
            w, g, _ = E.kelly(R, cols, a0, b0)
            print(sname, "full Kelly:", {k: round(v, 3) for k, v in w.items() if v > 0}, "CAGR", round(np.expm1(g), 4))
        mc, tt, _ = monte_carlo(scen, books, args.paths, gov=False)
        save(mc, "generic_mc_outcomes")
        save(tt, "generic_mc_time_to_multiple")
        return

    # ------------------------------------------------------------------------- build inputs
    print("building sleeves ...")
    Rh, pos_h, _ = S.build_all("hist")
    S.save_inputs(Rh, DATA / "inputs" / "hist")
    Rf, info_rows = {}, []
    for wname, win in {**WINDOWS, "2014-2026": ("2014-11-24", END)}.items():
        R, _, info = S.build_all("fwd", window=win)
        Rf[wname] = R
        S.save_inputs(R, DATA / "inputs" / f"fwd_{wname}")
        info_rows.append(dict(scenario=f"forward, tilted on {wname}", **info))
    Ro, _, info = S.build_all("fwd", window=WINDOWS["2008-2026"], eq_fwd=0.06, bills_fwd=0.035, btc_fwd=0.15)
    S.save_inputs(Ro, DATA / "inputs" / "opt_2008-2026")
    info_rows.append(dict(scenario="optimistic forward (equity 6%, bills 3.5%, BTC 15%), 2008-2026", **info))
    save(pd.DataFrame(info_rows), "forward_model")
    save(S.btc_decay(S.load_btc()), "btc_cycle_decay")
    rows = []
    for sname, R, wins in [("history", Rh, WINDOWS)] + [(f"forward ({w})", Rf[w], {w: WINDOWS[w]}) for w in WINDOWS]:
        for wname, (a, b) in wins.items():
            for c in R.columns:
                x = R[c].loc[a:b].dropna()
                if len(x) > S.TD:
                    rows.append(dict(scenario=sname, window=wname, sleeve=c, start=str(x.index[0].date()),
                                     **ST.stats(x)))
    save(pd.DataFrame(rows), "sleeve_stats")
    print(f"  built in {time.time() - t0:.0f}s")

    # ------------------------------------------------------------------------- Q1 Kelly
    print("Kelly ...")
    scen_single = {**{f"history {w}": (Rh, WINDOWS[w]) for w in WINDOWS},
                   **{f"forward {w}": (Rf[w], WINDOWS[w]) for w in WINDOWS},
                   "history 2014-2026": (Rh, KWIN["2014-2026 (all, with Bitcoin)"]),
                   "forward 2014-2026": (Rf["2014-2026"], KWIN["2014-2026 (all, with Bitcoin)"])}
    save(kelly_single(scen_single), "kelly_single")
    scen_k = {}
    for kw, win in KWIN.items():
        fw = {"1928-2026 (S&P only)": "1928-2026", "1986-2026 (S&P + Nasdaq)": "1986-2026",
              "2014-2026 (all, with Bitcoin)": "2014-2026"}[kw]
        Rk = Rh.copy()
        Rf_k = Rf[fw].copy()
        if kw.startswith("1928"):
            for R_ in (Rk, Rf_k):
                R_.loc[:, [c for c in R_.columns if c.startswith(("NDX", "QQQ", "BTC", "PhaseA"))]] = np.nan
        elif kw.startswith("1986"):
            for R_ in (Rk, Rf_k):
                R_.loc[:, [c for c in R_.columns if c.startswith(("BTC", "PhaseA"))]] = np.nan
        scen_k[f"history {kw}"] = (Rk, win)
        scen_k[f"forward {kw}"] = (Rf_k, win)
    KM, kbooks = kelly_mix(scen_k)
    save(KM, "kelly_mix")
    R_eq = {"forward 3%": S.build_all("fwd", window=WINDOWS["1928-2026"], eq_fwd=0.03, cadences=("weekly",))[0],
            "forward 4.5%": Rf["1928-2026"],
            "forward 6%": S.build_all("fwd", window=WINDOWS["1928-2026"], eq_fwd=0.06, cadences=("weekly",))[0],
            "history (10.0%)": Rh}
    save(kelly_regret(R_eq, WINDOWS["1928-2026"]), "kelly_regret")
    save(kelly_prior_mix(R_eq, WINDOWS["1928-2026"]), "kelly_model_uncertainty")
    R_be = {"forward 3%": R_eq["forward 3%"], "forward 4.5%": R_eq["forward 4.5%"], "forward 6%": R_eq["forward 6%"]}
    for eq in (0.075, 0.09):
        R_be[f"forward {eq * 100:g}%"] = S.build_all("fwd", window=WINDOWS["1928-2026"], eq_fwd=eq,
                                                     cadences=("weekly",))[0]
    R_be["history (10.0%, real T-bills)"] = Rh
    save(leverage_breakeven(R_be, WINDOWS["1928-2026"]), "leverage_breakeven")

    # Kelly-derived books for the Monte Carlo
    books = dict(books)
    for (sname, lab), wf in kbooks.items():
        if "2014-2026" in sname and lab in ("full", "half"):
            books[f"{lab.capitalize()} Kelly ({sname.split()[0]} 2014-26 mix)"] = wf
    json.dump({k: {kk: round(vv, 4) for kk, vv in v.items()} for k, v in books.items()},
              open(RES / "books_used.json", "w"), indent=1)

    # ------------------------------------------------------------------------- Q2 + Q4 Monte Carlo
    print("Monte Carlo ...")
    scen = {**{f"history {w}": (Rh, WINDOWS[w]) for w in WINDOWS},
            **{f"forward {w}": (Rf[w], WINDOWS[w]) for w in WINDOWS},
            "optimistic forward 2008-2026": (Ro, WINDOWS["2008-2026"])}
    mc, tt, gv = monte_carlo(scen, books, args.paths)
    save(mc, "mc_outcomes")
    save(tt, "mc_time_to_multiple")
    save(gv, "mc_governor")
    hb = ["SPY", "QQQ", "Phase A (current design)", "S&P 2x 200d", "S&P 3x 200d", "NDX 3x 200d",
          "3x blend (S&P/NDX 50/50) 200d", "2x blend 200d + 20% BTC switch", "3x blend 200d + 20% BTC switch",
          "SPY 80% + BTC switch 20%", "BTC 10-wk switch"] + [k for k in books if "Kelly" in k]
    save(headline(mc, tt, hb, list(scen)), "headline")

    cand = {k: books[k] for k in ["SPY", "Phase A (current design)", "3x blend 200d + 20% BTC switch",
                                  "2x blend 200d + 20% BTC switch", "SPY 80% + BTC switch 20%", "BTC 10-wk switch"]
            + [k for k in books if "Kelly (forward" in k]}
    KB, MB = btc_sensitivity(cand, max(500, args.paths // 2))
    save(KB, "btc_sensitivity_kelly")
    save(MB, "btc_sensitivity_mc")

    # ------------------------------------------------------------------------- Q3 cadence
    print("cadence ...")
    cw = {"1928-2026": WINDOWS["1928-2026"], "1962-2026 (real opens)": ("1962-01-02", END),
          "1986-2026": WINDOWS["1986-2026"], "2008-2026": WINDOWS["2008-2026"]}
    C = pd.concat([ST.cadence_trend(Rh, pos_h, cw, "history")] +
                  [ST.cadence_trend(Rf[w], S.build_all("fwd", window=WINDOWS[w])[1], {w: WINDOWS[w]}, "forward")
                   for w in ("1928-2026", "1986-2026")])
    save(C, "cadence_trend_daily_vs_weekly")
    save(pd.concat([ST.m1_weekly_vs_daily(), ST.w10_weekly_vs_daily()]), "cadence_m1_w10")
    orows = []
    for bk in ["2x blend 200d + 20% BTC switch", "3x blend 200d + 20% BTC switch", "3x blend (S&P/NDX 50/50) 200d",
               "S&P 3x 200d"] + [k for k in books if "Half Kelly" in k]:
        w = books[bk]
        a = "2014-11-24" if "BTC_10wk" in w else "1986-07-01"
        for etf in (True, False):
            o = ST.weekly_book_orders(Rh, pos_h, w, a, END, cash_is_etf=etf)
            orows.append(dict(book=bk, out_of_market_vehicle="T-bill ETF (SGOV)" if etf else "account cash", **o))
    save(pd.DataFrame(orows), "cadence_weekly_email_orders")

    # ------------------------------------------------------------------------- Q5 taxes
    print("taxes ...")
    spx = S.load_index("SPX")
    px = S.C04.yf_close("^GSPC").reindex(spx.index)
    r_div = (spx.r_tr - px.pct_change()).clip(lower=0)
    trows = []
    Rf08, pos_f08, _ = S.build_all("fwd", window=WINDOWS["2008-2026"])
    for sname, R, P, (a, b) in [("history 2008-2026", Rh, pos_h, WINDOWS["2008-2026"]),
                                ("history 1993-2026", Rh, pos_h, ("1993-02-01", END)),
                                ("forward 2008-2026", Rf08, pos_f08, WINDOWS["2008-2026"])]:
        for sl in ["SPX3_200d_w", "NDX3_200d_w", "SPX1_200d_w", "SPX2_200d_w", "BTC_10wk", "SPY"]:
            x = R[sl].loc[a:b].dropna()
            if len(x) < 3 * S.TD:
                continue
            a2 = str(x.index[0].date())
            pre = ST.stats(x)["cagr"]
            for prof, (st, lt) in ST.TAX.items():
                if sl == "SPY":
                    d = r_div.loc[a2:b] if sname.startswith("history") else r_div.loc[a2:b] * 0 + 0.012 / S.TD
                    post = ST.after_tax_hold(x, d, lt, liquidate=True)
                    post_nl = ST.after_tax_hold(x, d, lt, liquidate=False)
                else:
                    p = P[sl].reindex(x.index, method="ffill") if sl == "BTC_10wk" else P[sl].reindex(x.index)
                    post = ST.after_tax_switch(x, p, st, lt, liquidate=True)
                    post_nl = np.nan
                    sw = (p.diff().abs() > 0).sum() / (len(p) / S.TD)
                trows.append(dict(scenario=sname, start=a2, sleeve=sl, profile=prof, pre_tax_cagr_ira=pre,
                                  after_tax_cagr_taxable=post, tax_drag_pts=pre - post,
                                  after_tax_cagr_never_sold=post_nl,
                                  switches_pa=np.nan if sl == "SPY" else sw))
    save(pd.DataFrame(trows), "taxes_by_placement")
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
