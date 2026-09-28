"""s03 - Defined-risk premium selling on SPX, 30/45 DTE, on the calibrated synthetic surface.

APPROXIMATION: option prices are modelled (optmodel, calibrated to CBOE PUT/PUTY/CNDR/BFLY in 1990-2007,
validated 2008-2026).  Known bias: in 2008-2026 the model is ~1.2% of max loss per cycle too generous
to condor-type structures (s02).

Grid (every combination is reported; N counts all of them for the deflated-Sharpe haircut):
  structure : PCS (put credit spread) | IC (iron condor), short leg at 0.30 / 0.20 / 0.10 delta,
              long leg(s) 2% or 5% of spot further OTM                                   (12)
  DTE       : 30 | 45 (entry = last trading day <= monthly expiry - DTE; one cycle/month)  (2)
  management: hold | tp (50% of credit) | tp21 (50% or 21 DTE) | dte21 | tp21stop (+ stop at 2x credit) (5)
  filters   : F0 none | F1 VIX/VIX3M<0.9 | F2 12<=VIX<=30 | F3 SPX>200d | F4 no FOMC/CPI week |
              F5 = F1..F4 (prescribed) | F6 = F1+F3                                         (7)
Costs: fill at mid -/+ fill_frac x (sum of leg quoted spreads) on open and on early close, $1.30/leg;
fill_frac 0.25 = base, 0.5 = harsh (natural), 0 = mid.  Cash settlement at expiry is free.
Periods: IS = entries 1990-2007, OOS = 2008-2026 (VIX3M exists only from 2006-07: F1 before that
uses a proxy and is flagged).
"""
from __future__ import annotations

import itertools
import time

import numpy as np
import pandas as pd

import optmodel as om
from common14 import OUT, deflated_sharpe, kelly_fraction, log_growth, save
from spreadsim import build_legs, manage, simulate_path, third_fridays

STRUCTS = [(s, d, w) for s in ("PCS", "IC") for d in (0.30, 0.20, 0.10) for w in (0.02, 0.05)]
DTES = (30, 45)
RULES = ("hold", "tp", "tp21", "dte21", "tp21stop")
FILTERS = ("F0", "F1", "F2", "F3", "F4", "F5", "F6")
FILLS = (0.0, 0.25, 0.5)
PRIMARY = [("PCS", 0.20, 0.05, 45, "tp21", "F5"), ("IC", 0.20, 0.05, 45, "tp21", "F5")]


def entry_flags(mk: pd.DataFrame, d0) -> dict:
    row = mk.loc[d0]
    ts = row.vix / row.vix3m_act if np.isfinite(row.vix3m_act) else np.nan
    ts_proxy = row.vix / row.vix3m
    f1 = (ts < 0.9) if np.isfinite(ts) else (ts_proxy < 0.9)
    f2 = 12 <= row.vix <= 30
    f3 = bool(row.spx > row.ma200) if np.isfinite(row.ma200) else False
    f4 = not (bool(row.fomc_week) or bool(row.cpi_week))
    return dict(F0=True, F1=bool(f1), F2=bool(f2), F3=f3, F4=f4, F5=bool(f1 and f2 and f3 and f4), F6=bool(f1 and f3),
                ts_actual=np.isfinite(ts), vix=row.vix, ts=ts if np.isfinite(ts) else ts_proxy)


def trade_stats(R: np.ndarray, years: float) -> dict:
    R = np.asarray(R, float)
    R = R[np.isfinite(R)]
    n = len(R)
    if n < 5:
        return dict(n=n)
    win = R > 0
    fk = kelly_fraction(R, fmax=1.0)
    fq = fk / 4
    g = log_growth(R, fq)
    return dict(n=n, per_year=n / years, win_rate=win.mean(), avg_win=R[win].mean() if win.any() else np.nan,
                avg_loss=R[~win].mean() if (~win).any() else np.nan, mean=R.mean(), median=np.median(R),
                std=R.std(ddof=1), t=R.mean() / (R.std(ddof=1) / np.sqrt(n)), worst=R.min(),
                p05=np.percentile(R, 5), share_maxloss=(R <= -0.9).mean(),
                sharpe_trade=R.mean() / R.std(ddof=1),
                sharpe_ann=R.mean() / R.std(ddof=1) * np.sqrt(n / years),
                kelly=fk, qkelly=fq, glog_per_trade_q=g, glog_per_year_q=g * n / years,
                skew=pd.Series(R).skew(), kurt=pd.Series(R).kurt())


def main(resim: bool = False):
    t0 = time.time()
    mk = om.market()
    mode, markup = om.settings()
    trades_path = OUT / "s03_trades_all.csv.gz"
    if trades_path.exists() and not resim:
        tr = pd.read_csv(trades_path, parse_dates=["entry", "expiry", "exit"])
        return analyse(tr, mk, t0)
    exps = third_fridays(mk.index)
    exps = exps[(exps >= "1990-04-01") & (exps <= mk.index[-1])]
    rows = []
    for struct, sdelta, width in STRUCTS:
        for dte in DTES:
            for E in exps:
                cand = mk.index[mk.index <= E - pd.Timedelta(days=dte)]
                if len(cand) == 0:
                    continue
                d0 = cand[-1]
                if not np.isfinite(mk.loc[d0, "ma200"]) and d0 < pd.Timestamp("1991-01-01"):
                    pass
                tau0 = float((E - d0).days)
                legs = build_legs(mk.loc[d0], tau0, struct, sdelta, width, mode, markup)
                path = simulate_path(mk, d0, E, legs, mode, markup)
                flags = entry_flags(mk, d0)
                for fill in FILLS:
                    for rule in RULES:
                        res = manage(path, legs, fill, rule)
                        if res is None:
                            continue
                        rows.append(dict(struct=struct, sdelta=sdelta, width=width, dte=dte, rule=rule, fill=fill,
                                         entry=d0, expiry=E, exit=res["exit_date"], reason=res["reason"],
                                         days_held=res["days_held"], R=res["R"], min_R=res["min_R"],
                                         credit_over_ml=res["credit_over_ml"], ml_pct_spot=res["ml"] / res["S0"],
                                         entry_cost_over_ml=res["entry_cost_pts"] / res["ml"],
                                         **{k: v for k, v in flags.items()}))
        print(f"{struct} {sdelta} {width} done, {time.time() - t0:.0f}s", flush=True)
    tr = pd.DataFrame(rows)
    tr.to_csv(trades_path, index=False, float_format="%.5f", compression="gzip")
    return analyse(tr, mk, t0)


def analyse(tr: pd.DataFrame, mk: pd.DataFrame, t0: float):
    # ---------------- statistics by variant and period ----------------
    periods = {"IS 1990-2007": ("1990-01-01", "2007-12-31"), "OOS 2008-2026": ("2008-01-01", "2026-12-31"),
               "post-2010": ("2010-01-01", "2026-12-31"), "full": ("1990-01-01", "2026-12-31")}
    stat_rows = []
    for (struct, sdelta, width, dte, rule, fill), g in tr.groupby(["struct", "sdelta", "width", "dte", "rule", "fill"]):
        for f in FILTERS:
            gf = g[g[f]]
            for pname, (a, b) in periods.items():
                gp = gf[(gf.entry >= a) & (gf.entry <= b)]
                yrs = (min(pd.Timestamp(b), mk.index[-1]) - max(pd.Timestamp(a), pd.Timestamp("1990-04-01"))).days / 365.25
                st = trade_stats(gp.R.values, yrs)
                st.update(struct=struct, sdelta=sdelta, width=width, dte=dte, rule=rule, fill=fill, filter=f, period=pname,
                          avg_days_held=gp.days_held.mean() if len(gp) else np.nan,
                          avg_credit_over_ml=gp.credit_over_ml.mean() if len(gp) else np.nan)
                stat_rows.append(st)
    st = pd.DataFrame(stat_rows)
    save(st, "s03_variant_stats", index=False)

    # ---------------- deflated Sharpe across the grid (base costs, IS) ----------------
    base = st[(st.fill == 0.25) & (st.n >= 20)]
    isr = base[base.period == "IS 1990-2007"].copy()
    oos = base[base.period == "OOS 2008-2026"].set_index(["struct", "sdelta", "width", "dte", "rule", "filter"])
    n_trials = len(isr)
    sr_var = isr.sharpe_trade.var()
    best = isr.sort_values("sharpe_trade", ascending=False).head(10)
    out = []
    for _, b in best.iterrows():
        key = (b.struct, b.sdelta, b.width, b.dte, b.rule, b["filter"])
        dsr, sr0 = deflated_sharpe(b.sharpe_trade, int(b.n), n_trials, sr_var, b["skew"], b["kurt"] + 3)
        o = oos.loc[key] if key in oos.index else None
        out.append(dict(struct=b.struct, sdelta=b.sdelta, width=b.width, dte=b.dte, rule=b.rule, filter=b["filter"],
                        IS_n=b.n, IS_mean=b["mean"], IS_sharpe_trade=b.sharpe_trade, IS_t=b.t, DSR=dsr, SR0=sr0,
                        OOS_n=o.n if o is not None else np.nan, OOS_mean=o["mean"] if o is not None else np.nan,
                        OOS_sharpe_trade=o.sharpe_trade if o is not None else np.nan,
                        OOS_t=o.t if o is not None else np.nan, OOS_worst=o.worst if o is not None else np.nan))
    dsr_tab = pd.DataFrame(out)
    save(dsr_tab, "s03_best_is_variants_dsr", index=False)
    print("trials:", n_trials, "var(SR_trade) across trials:", round(sr_var, 4))
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        print(dsr_tab.round(3).to_string(index=False))
        prim = st[st.apply(lambda r: (r.struct, r.sdelta, r.width, r.dte, r.rule, r["filter"]) in
                           [p for p in PRIMARY], axis=1)]
        print(prim[["struct", "rule", "filter", "fill", "period", "n", "per_year", "win_rate", "avg_win", "avg_loss",
                    "mean", "median", "worst", "t", "sharpe_ann", "kelly", "glog_per_year_q"]].round(3).to_string(index=False))
    print(f"total {time.time() - t0:.0f}s")


if __name__ == "__main__":
    import sys
    main(resim="--resim" in sys.argv)
