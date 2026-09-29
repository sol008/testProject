"""Question 1: which vehicle gives the highest CAGR for a trend-filtered 2x / 3x equity core?

Runs every vehicle on the S&P 500 (1990-2026, 2008-2026 and 1990-2007 run separately from scratch) and on the
Nasdaq-100 (2001-2026 with real VXN; 1990-2026 with a VXN proxy before 2001), writes
  vehicles_main.csv        headline table (vehicle x leverage x period)
  calls_grid.csv           deep ITM call grid: delta x tenor x hold x leverage x pricing x half-spread
  pput_validation.csv      model replica of CBOE PPUT (S&P + monthly 5% OTM puts) vs the real index
  equity_daily.csv.gz      daily equity of the headline strategies (for s03)
"""
from __future__ import annotations

import dataclasses
import itertools
import time

import numpy as np
import pandas as pd

from common30 import OUT, cboe, load_panel, perf, surface_and_models
from engine import FastSurface, Market, Params, leverage_cost, simulate

PERIODS = {"1990-2026": ("1990-01-02", "2026-09-25"), "2008-2026": ("2008-01-02", "2026-09-25"),
           "1990-2007": ("1990-01-02", "2007-12-31")}
NDX_KAPPA = 0.48          # NDX smile / SPX smile, from the 2026-09-28 chains (s01: 0.85F ratio 1.25 vs 1.52)


def markets(panel, surf, variants):
    out = {}
    for vn, v in variants.items():
        mu, ss = v.get("markup", 0.0), v.get("skew_scale", 1.0)
        out[("SPX", vn)] = Market(panel, "SPX", FastSurface(surf, v["a1m"], v["a1y"], v["skew_mode"],
                                                            skew_scale=ss, markup=mu))
        out[("NDX", vn)] = Market(panel, "NDX", FastSurface(surf, v["a1m"], v["a1y"], v["skew_mode"],
                                                            skew_scale=NDX_KAPPA * ss, markup=mu))
    return out


def row(res, mkt, P, period, bench_cagr, pricing):
    pf = perf(res["equity"])
    lc = leverage_cost(res, mkt, None, None)
    yrs = (res["equity"].index[-1] - res["equity"].index[0]).days / 365.25
    return dict(underlying=P.underlying, vehicle=P.vehicle, L=P.L, label=P.label, period=period, pricing=pricing,
                delta=P.delta, tenor=P.tenor, hold=P.hold, hs=P.hs, f=P.f, trend=P.trend,
                cagr=pf["cagr"], excess_vs_spy=pf["cagr"] - bench_cagr, maxdd=pf["maxdd"], vol=pf["vol"],
                worst_day=pf["worst_day"], ulcer=pf["ulcer"], final_multiple=pf["final_multiple"],
                cost_per_yr_invested=lc["cost_per_yr_invested"], cost_per_unit_extra=lc["cost_per_unit_extra"],
                mean_exposure_invested=lc["mean_exposure_invested"], time_invested=lc["time_invested"],
                orders_per_yr=res["orders"] / yrs, emails_per_yr=res["emails"] / yrs,
                margin_calls=res["margin_calls"])


def headline_params(und="SPX"):
    ps = [Params("bh", L=1, trend=False, label="Buy and hold 1x (SPY)"),
          Params("margin", L=1, label="Trend 1x (ETF or T-bills)"),
          Params("margin", L=2, label="Trend 2x, Robinhood margin ($100k tier)"),
          Params("margin", L=2, margin_tier="<50k", label="Trend 2x, Robinhood margin (<$50k tier)"),
          Params("margin", L=3, label="Trend 3x, margin (NOT allowed under Reg T; reference)"),
          Params("letf", L=2, label="Trend 2x LETF (SSO/QLD)"),
          Params("letf", L=3, label="Trend 3x LETF (UPRO/TQQQ)"),
          Params("letf", L=3, trend=False, label="Buy and hold 3x LETF (no filter)"),
          Params("calls", L=2, delta=0.80, tenor=182, hold=42, label="Trend 2x, deep ITM calls d0.80 6m, roll 6w"),
          Params("calls", L=3, delta=0.80, tenor=182, hold=42, label="Trend 3x, deep ITM calls d0.80 6m, roll 6w"),
          Params("calls", L=2, delta=0.90, tenor=365, hold=56, label="Trend 2x, deep ITM calls d0.90 12m, roll 8w"),
          Params("calls", L=3, delta=0.90, tenor=365, hold=56, label="Trend 3x, deep ITM calls d0.90 12m, roll 8w"),
          Params("spread", L=2, delta=0.80, ds=0.25, tenor=182, hold=42, label="Trend 2x, call debit spread d0.80/0.25 6m"),
          Params("spread", L=3, delta=0.80, ds=0.25, tenor=182, hold=42, label="Trend 3x, call debit spread d0.80/0.25 6m"),
          Params("pmcc", L=2, delta=0.80, ds=0.25, tenor=182, hold=42, label="Trend 2x, PMCC (d0.80 6m long, 30d d0.25 short)"),
          Params("barbell", f=0.10, tenor=182, hold=42, label="Trend barbell 90/10, ATM 6m calls"),
          Params("barbell", f=0.20, tenor=182, hold=42, label="Trend barbell 80/20, ATM 6m calls"),
          Params("barbell", f=0.10, tenor=365, hold=56, trend=False, label="Barbell 90/10, ATM 12m calls, no filter"),
          Params("barbell", f=0.20, tenor=365, hold=56, trend=False, label="Barbell 80/20, ATM 12m calls, no filter")]
    for p in ps:
        p.underlying = und
    return ps


_W = {}


def _init_worker():
    panel = load_panel()
    surf, variants = surface_and_models()
    _W["mk"] = markets(panel, surf, variants)


def _grid_one(args):
    pname, a, b, d, ten, hold, L, pr, hs, spy_c = args
    P = Params("calls", L=L, delta=d, tenor=ten, hold=hold, hs=hs, underlying="SPX")
    m = _W["mk"][("SPX", pr)]
    return row(simulate(m, P, a, b), m, P, pname, spy_c, pr)


def spy_cagrs(mk):
    return {p: perf(simulate(mk[("SPX", "base")], Params("bh", L=1, trend=False), a, b)["equity"])["cagr"]
            for p, (a, b) in PERIODS.items()}


def grid(mk, procs=4):
    """Deep ITM call grid (S&P): delta x tenor x hold x leverage x (pricing, half-spread), two periods."""
    import multiprocessing as mp
    spy = spy_cagrs(mk)
    jobs = []
    for (pname, (a, b)), d, ten, hold, L in itertools.product(
            [("1990-2026", PERIODS["1990-2026"]), ("2008-2026", PERIODS["2008-2026"])],
            [0.70, 0.80, 0.90], [91, 182, 365], [28, 56], [2, 3]):
        for pr, hs in [("base", 0.004), ("real", 0.002)]:
            jobs.append((pname, a, b, d, ten, hold, L, pr, hs, spy[pname]))
    with mp.get_context("fork").Pool(procs, initializer=_init_worker) as pool:
        g = pd.DataFrame(pool.map(_grid_one, jobs, chunksize=4))
    g.to_csv(OUT / "calls_grid.csv", index=False, float_format="%.4f")
    return g


def main():
    t0 = time.time()
    panel = load_panel()
    surf, variants = surface_and_models()
    mk = markets(panel, surf, variants)
    headline(panel, mk)
    print(f"headline done {time.time() - t0:.0f}s", flush=True)
    grid(mk)
    print(f"grid done {time.time() - t0:.0f}s", flush=True)
    pput_check(panel, mk)
    print(f"all done {time.time() - t0:.0f}s", flush=True)


def headline(panel, mk):
    rows, curves = [], {}
    # ---- benchmark CAGRs (SPY = S&P TR minus fee), per period and underlying
    bench = {}
    for und, (pname, (a, b)) in itertools.product(["SPX", "NDX"], PERIODS.items()):
        r = simulate(mk[(und, "base")], Params("bh", L=1, trend=False, underlying=und), a, b)
        bench[(und, pname)] = perf(r["equity"])["cagr"]
    spy = {p: bench[("SPX", p)] for p in PERIODS}
    # ---- headline table: S&P 500 (all periods, base pricing; options also cheap/dear)
    for pname, (a, b) in PERIODS.items():
        for P in headline_params("SPX"):
            prs = (["base", "cheap", "dear", "real"] if P.vehicle in ("calls", "spread", "pmcc", "barbell")
                   else ["base"])
            for pr in prs:
                m = mk[("SPX", pr)]
                if pr == "real":
                    P = dataclasses.replace(P, hs=0.002)          # XSP quoted half-spread (s01)
                res = simulate(m, P, a, b)
                rows.append(row(res, m, P, pname, spy[pname], pr))
                if pname == "1990-2026" and pr in ("base", "real"):
                    curves[P.label + (" [real-price surface]" if pr == "real" else "")] = res["equity"]
    # ---- Nasdaq-100 core (QQQ): 2001-2026 real VXN; 1990-2026 with proxy VXN before 2001
    nd_periods = {"2001-2026 (QQQ)": ("2001-02-01", "2026-09-25"), "1990-2026 (QQQ, VXN proxy <2001)":
                  ("1990-01-02", "2026-09-25"), "2008-2026 (QQQ)": ("2008-01-02", "2026-09-25")}
    for pname, (a, b) in nd_periods.items():
        r = simulate(mk[("SPX", "base")], Params("bh", L=1, trend=False), a, b)
        spy_c = perf(r["equity"])["cagr"]
        for P in headline_params("NDX")[:12]:
            for pr in (["base", "real"] if P.vehicle == "calls" else ["base"]):
                m = mk[("NDX", pr)]
                PP = dataclasses.replace(P, hs=0.002) if pr == "real" else P
                res = simulate(m, PP, a, b)
                rows.append(row(res, m, PP, pname, spy_c, pr))
                if pname == "2001-2026 (QQQ)" and pr == "base":
                    curves["QQQ: " + P.label] = res["equity"]
    main_tab = pd.DataFrame(rows)
    main_tab.to_csv(OUT / "vehicles_main.csv", index=False, float_format="%.4f")
    eqs = pd.DataFrame(curves)
    eqs.resample("W-FRI").last().to_csv(OUT / "equity_weekly.csv.gz", float_format="%.5f", compression="gzip")
    with pd.option_context("display.width", 250, "display.max_rows", 300, "display.max_columns", 30):
        cols = ["underlying", "label", "period", "pricing", "cagr", "excess_vs_spy", "maxdd", "worst_day",
                "cost_per_yr_invested", "cost_per_unit_extra", "mean_exposure_invested", "emails_per_yr",
                "orders_per_yr"]
        print(main_tab[cols].round(4).to_string(index=False))


def pput_check(panel, mk):
    """S&P + monthly 5% OTM put == 95%-strike 1-month call + T-bills (put-call parity): model vs real PPUT."""
    pput = cboe("PPUT")
    val = []
    for pr in ("base", "cheap", "dear", "real"):
        for hs in (0.0, 0.004):
            P = Params("calls", L=1, mny=0.95, tenor=31, hold=28, min_left=0, band=99, hs=hs, trend=False)
            m = mk[("SPX", pr)]
            res = simulate(m, P, "1990-01-02", "2026-09-25")
            e = res["equity"]
            em = e.resample("ME").last().pct_change()
            pm = pput.reindex(e.index).ffill().resample("ME").last().pct_change()
            j = pd.concat([em, pm], axis=1).dropna()
            val.append(dict(series=f"model replica ({pr} surface, half-spread {hs:.1%})", cagr=perf(e)["cagr"],
                            maxdd=perf(e)["maxdd"], vol=perf(e)["vol"], corr_monthly=float(j.corr().iloc[0, 1])))
    real = pput.loc["1990-01-02":"2026-09-25"]
    val.append(dict(series="CBOE PPUT (real prices)", cagr=perf(real)["cagr"], maxdd=perf(real)["maxdd"],
                    vol=perf(real)["vol"], corr_monthly=1.0))
    val.append(dict(series="S&P 500 TR (SPY before fee)", cagr=perf(panel.spxtr.loc["1990-01-02":])["cagr"],
                    maxdd=perf(panel.spxtr.loc["1990-01-02":])["maxdd"],
                    vol=perf(panel.spxtr.loc["1990-01-02":])["vol"], corr_monthly=np.nan))
    v = pd.DataFrame(val)
    v.to_csv(OUT / "pput_validation.csv", index=False, float_format="%.4f")
    print(v.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
