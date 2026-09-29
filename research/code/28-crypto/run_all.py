"""Track 28: aggressive crypto sleeve, decided at most once a week. Reproduces every number in
research/28-crypto-aggressive.md.

Run:  python run_all.py            (first run downloads ~700 Coinbase pages, a few minutes; later runs use the cache)
Env:  TRACK28_CACHE (raw-data cache dir), TRACK28_PATHS (Monte Carlo paths, default 2000)
Out:  results/*.csv and results/tables.md (all tables quoted in the report), < 1 MB in total.
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
import pandas as pd

import data as DATA
import engine as E

HERE = Path(__file__).resolve().parent
OUT = HERE / "results"
OUT.mkdir(exist_ok=True)
MD: list[str] = []
N_PATHS = int(os.environ.get("TRACK28_PATHS", "2000"))

# ------------------------------------------------------------------------------------------------ assumptions
SIZES = [0.03, 0.10, 0.20, 0.30, 0.50, 1.00]
PERIODS = {"2014-2026": ("2014-01-01", "2026-09-29"), "2018-2026": ("2018-01-01", "2026-09-29"),
           "2021-2026": ("2021-01-01", "2026-09-29")}
IS_OOS = {"IS 2014-2019": ("2014-01-01", "2020-01-01"), "OOS 2020-2026": ("2020-01-01", "2026-09-29")}
# 2x funds: T-bills on the borrowed unit (in the engine) + fee 1.85% + 11% futures basis/financing. The 12.85% total
# above T-bills is the cheapest realized cost among the five 2x crypto ETFs measured in `lev_etfs()` (BITU, 2024-26).
ER2, BASIS2, BASIS2_CHEAP = 0.0185, 0.11, 0.02
ROUTE_CFG = {  # per-side trading cost (BTC, ETH, BTC2X, ETH2X, base, cash) and annual fund costs
    "etf": {"cost": [0.0005, 0.0005, 0.0010, 0.0010, 0.0001, 0.0], "er1": 0.0025, "er2": ER2, "fin_spread2": BASIS2},
    "night": {"cost": [0.0015, 0.0015, 0.0030, 0.0030, 0.0001, 0.0], "er1": 0.0025, "er2": ER2, "fin_spread2": BASIS2},
    "cb": {"cost": [0.0060, 0.0060, 0.0060, 0.0060, 0.0001, 0.0], "er1": 0.0, "er2": ER2, "fin_spread2": BASIS2},
    "ideal": {"cost": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0], "er1": 0.0, "er2": ER2, "fin_spread2": BASIS2},
}
ROUTE_NAME = {"ideal": "Sunday close, no cost", "night": "IRA IBIT, 24h market Sun 9 pm ET, 0.15%/side",
              "etf": "IRA ETF, Monday open, 0.05%/side", "cb": "Coinbase, Sun night, 0.6%/side"}
MC_RULES = ["BTC_BH", "BTC_10W", "BTC_10W_200D", "BTC2X_10W"]
MAIN_RULES = ["BTC_BH", "BTC_10W", "BTC_20W", "BTC_50D", "BTC_200D", "BTC_10W_200D", "BTC_10W_VT50", "ETH_10W",
              "ROT_MOM_10W", "ROT_ETHBTC_10W", "HALF_10W", "BTC2X_BH", "BTC2X_10W", "BTC2X_10W_200D",
              "BTC_10W_VT80_L2", "HALVING_18M"]


def pct(x, d=1):
    return "n/a" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{100 * x:.{d}f}%"


def table(df: pd.DataFrame, title: str, note: str = "") -> None:
    MD.append(f"\n### {title}\n")
    if note:
        MD.append(note + "\n")
    cols = list(df.columns)
    MD.append("| " + " | ".join(str(c) for c in cols) + " |")
    MD.append("|" + "---|" * len(cols))
    for _, r in df.iterrows():
        MD.append("| " + " | ".join(str(r[c]) for c in cols) + " |")


# ------------------------------------------------------------------------------------------------ data
def load():
    D = DATA.load_all()
    sessions = pd.DatetimeIndex(D["SPY"].index)
    sch = E.schedule(sessions, "2014-01-05", DATA.END - pd.Timedelta(days=1))
    # LEVSPY base: SSO (2x daily S&P 500) when SPY's last close before Sunday is above its 200-session average
    spy_c = D["SPY"]["close"]
    sma = spy_c.rolling(200).mean()
    last = spy_c.reindex(sch.index, method="ffill")
    last_sma = sma.reindex(sch.index, method="ffill")
    sch["spy_on"] = (last > last_sma).to_numpy()
    W = {}
    for route, cfg in ROUTE_CFG.items():
        w = E.weekly_returns(sch, route, D, cfg)
        w["LEVSPY"] = np.where(sch["spy_on"].to_numpy()[:-1], w["SSO"], w["CASH"])
        W[route] = w
    rules = E.build_rules(D, sch.index)
    return D, sch, W, rules


def run(rule_df, W, route, w, base, a, b, band=0.25):
    wk = W[route]
    m = (wk["t0"] >= pd.Timestamp(a)) & (wk["t1"] <= pd.Timestamp(b) + pd.Timedelta(days=1))
    sub = wk[m]
    expo = rule_df.reindex(sub.index).to_numpy()
    R = np.column_stack([sub["BTC"], sub["ETH"], sub["BTC2X"], sub["ETH2X"],
                         sub[base] if base != "RF" else sub["CASH"], sub["CASH"]])
    nav, trade = E.simulate(expo, R, w, np.array(ROUTE_CFG[route]["cost"]), band)
    t = pd.DatetimeIndex(list(sub["t0"]) + [sub["t1"].iloc[-1]])
    met = E.metrics(nav, t, sub["CASH"].to_numpy(), trade)
    spy_nav = np.concatenate([[1.0], np.cumprod(1 + sub["SPY"].to_numpy())])
    met["spy_cagr"] = spy_nav[-1] ** (1 / met["years"]) - 1
    met["excess_vs_spy"] = met["cagr"] - met["spy_cagr"]
    met["time_in"] = float((expo.sum(axis=1) > 0).mean())
    return met, nav, t, sub


# ------------------------------------------------------------------------------------------------ 0. checks
def checks(D, sch, W):
    rows = []
    for c in D["splice_checks"]:
        rows.append({"check": f"Coin Metrics vs Coinbase daily close, {c['asset'].upper()} ({c['overlap_days']} days)",
                     "value": f"median |diff| {c['median_abs_diff_pct']:.2f}%, 99th pct {c['p99_abs_diff_pct']:.2f}%"})
    # hourly-derived price at Monday 00:00 vs the Sunday daily close
    t = pd.DatetimeIndex(sch["ideal_time"])
    t = t[t > pd.Timestamp("2016-01-01")]
    ph = E.price_at(D["btc"], D["btc_h"], t)
    pdly = D["btc"].reindex(t - pd.Timedelta(days=1)).to_numpy()
    dif = np.abs(np.log(ph / pdly))
    rows.append({"check": "BTC price at Mon 00:00 UTC from hourly candles vs Sunday daily close",
                 "value": f"median |diff| {100 * np.nanmedian(dif):.3f}%, max {100 * np.nanmax(dif):.2f}%"})
    # yfinance BTC-USD vs our daily close
    y = D["BTC-USD"]["close"]
    both = pd.concat([D["btc"], y], axis=1, keys=["ours", "yf"]).dropna()
    d2 = np.abs(np.log(both["ours"] / both["yf"]))
    rows.append({"check": f"yfinance BTC-USD close vs ours ({len(both)} days)",
                 "value": f"median |diff| {100 * d2.median():.2f}%, 99th pct {100 * d2.quantile(.99):.2f}%"})
    # IBIT actual open-to-open vs BTC proxy on the same intervals
    wk = W["etf"]
    ib = D["IBIT"]["open"].reindex(pd.DatetimeIndex(sch["session"])).to_numpy()
    ib_r = ib[1:] / ib[:-1] - 1
    m = np.isfinite(ib_r) & (wk["t0"] >= pd.Timestamp("2024-01-12")).to_numpy()
    prox = wk["BTC"].to_numpy()[m] + ROUTE_CFG["etf"]["er1"] * wk["dt"].to_numpy()[m]  # gross of fee
    act = ib_r[m]
    te = np.std(act - prox) * math.sqrt(E.WEEKS_PER_YEAR)
    yrs = wk["dt"].to_numpy()[m].sum()
    gap = (np.log1p(act).sum() - np.log1p(prox).sum()) / yrs
    rows.append({"check": f"IBIT Monday-open to Monday-open vs BTC price at 09:30 ET ({m.sum()} weeks)",
                 "value": f"corr {np.corrcoef(act, prox)[0, 1]:.4f}, tracking error {100 * te:.2f}%/yr, "
                          f"IBIT minus proxy {100 * gap:+.2f}%/yr (fee 0.25%)"})
    df = pd.DataFrame(rows)
    table(df, "Data checks")
    df.to_csv(OUT / "data_checks.csv", index=False)


# ------------------------------------------------------------------------------------------------ 1. performance
def performance(W, rules):
    rows = []
    for pname, (a, b) in PERIODS.items():
        for rule in list(E.CANDIDATES) + ["HALVING_18M"]:
            for w in SIZES:
                for base in ("SPY", "RF", "LEVSPY"):
                    if w == 1.0 and base != "RF":
                        continue
                    if base == "LEVSPY" and rule not in ("BTC_BH", "BTC_10W", "BTC_10W_200D", "BTC2X_10W"):
                        continue
                    met, *_ = run(rules[rule], W, "etf", w, base, a, b)
                    rows.append({"period": pname, "rule": rule, "w": w, "base": base, **met})
        # benchmarks
        for base in ("SPY", "LEVSPY"):
            met, *_ = run(rules["BTC_BH"], W, "etf", 0.0, base, a, b)
            rows.append({"period": pname, "rule": "NONE", "w": 0.0, "base": base, **met})
    df = pd.DataFrame(rows)
    keep = ["period", "rule", "w", "base", "cagr", "excess_vs_spy", "vol", "sharpe", "maxdd", "worst_year",
            "worst_year_which", "trades_per_year", "time_in", "spy_cagr"]
    df[keep].round(4).to_csv(OUT / "perf_etf.csv", index=False)

    # sleeve alone, all periods
    s = df[(df.w == 1.0) & (df.base == "RF")].copy()
    for pname in PERIODS:
        t = s[(s.period == pname) & s.rule.isin(MAIN_RULES)].copy()
        spy = df[(df.period == pname) & (df.rule == "NONE") & (df.base == "SPY")].iloc[0]
        t = t.set_index("rule").loc[[r for r in MAIN_RULES if r in set(t.rule)]].reset_index()
        tab = pd.DataFrame({"Rule": t.rule, "CAGR": t.cagr.map(pct), "Vol": t.vol.map(pct),
                            "Sharpe": t.sharpe.map(lambda x: f"{x:.2f}"), "Max DD (weekly marks)": t.maxdd.map(pct),
                            "Worst year": [f"{pct(v, 0)} ({y})" for v, y in zip(t.worst_year, t.worst_year_which)],
                            "Time in": t.time_in.map(lambda x: f"{100 * x:.0f}%"),
                            "Trades/yr": t.trades_per_year.map(lambda x: f"{x:.1f}")})
        table(tab, f"Sleeve alone (100% crypto rule, cash when off), IRA/ETF route, {pname}",
              f"SPY over the same weeks: CAGR {pct(spy.cagr)}, max DD {pct(spy.maxdd)}, worst year "
              f"{pct(spy.worst_year, 0)} ({spy.worst_year_which}).")

    # portfolio: rule x size, rest in SPY
    for pname in PERIODS:
        t = df[(df.period == pname) & (df.base == "SPY") & (df.w < 1.0) &
               df.rule.isin(["BTC_BH", "BTC_10W", "BTC_20W", "BTC_10W_200D", "ETH_10W", "ROT_MOM_10W",
                             "BTC2X_10W", "BTC_10W_VT80_L2"])].copy()
        t["cell"] = [f"{pct(c)} / {100 * e:+.1f} / {pct(d, 0)}" for c, e, d in zip(t.cagr, t.excess_vs_spy, t.maxdd)]
        pv = t.pivot(index="rule", columns="w", values="cell")
        pv.columns = [f"{int(round(100 * c))}% sleeve" for c in pv.columns]
        pv = pv.reset_index().rename(columns={"rule": "Rule"})
        spy = df[(df.period == pname) & (df.rule == "NONE") & (df.base == "SPY")].iloc[0]
        table(pv, f"Portfolio = sleeve + rest in SPY, IRA/ETF route, {pname}: CAGR / excess vs SPY (points) / max DD",
              f"SPY alone: CAGR {pct(spy.cagr)}, max DD {pct(spy.maxdd)}.")
    # rest in T-bills and rest in LEVSPY (full period + 2021)
    for pname in ["2014-2026", "2021-2026"]:
        for base in ("RF", "LEVSPY"):
            t = df[(df.period == pname) & (df.base == base) & (df.w < 1.0) &
                   df.rule.isin(["BTC_BH", "BTC_10W", "BTC_10W_200D", "BTC2X_10W"])].copy()
            t["cell"] = [f"{pct(c)} / {100 * e:+.1f} / {pct(d, 0)}" for c, e, d in zip(t.cagr, t.excess_vs_spy, t.maxdd)]
            pv = t.pivot(index="rule", columns="w", values="cell")
            pv.columns = [f"{int(round(100 * c))}%" for c in pv.columns]
            pv = pv.reset_index().rename(columns={"rule": "Rule"})
            if base == "LEVSPY":
                lv = df[(df.period == pname) & (df.rule == "NONE") & (df.base == "LEVSPY")].iloc[0]
                note = (f"LEVSPY alone (SSO when SPY > 200-day average, else T-bills; a stand-in for the other track): "
                        f"CAGR {pct(lv.cagr)}, excess vs SPY {100 * lv.excess_vs_spy:+.1f}, max DD {pct(lv.maxdd)}.")
            else:
                note = "Rest in T-bills: isolates what the sleeve adds on its own."
            table(pv, f"Portfolio = sleeve + rest in {base}, {pname}: CAGR / excess vs SPY / max DD", note)
    return df


# ------------------------------------------------------------------------------------------------ 2. cycles
def cycles(D):
    p = D["btc"]
    rows = []
    hv = list(E.HALVINGS) + [p.index[-1]]
    for i in range(len(hv) - 1):
        a, b = hv[i], hv[i + 1]
        pa, pb = p.asof(a), p.asof(b)
        yrs = (b - a).days / 365.25
        rows.append({"kind": "halving epoch", "from": a.date(), "to": b.date(), "p0": pa, "p1": pb, "years": yrs,
                     "log_g": math.log(pb / pa) / yrs, "complete": i < len(hv) - 2})
    peaks, troughs = [], []
    for h in E.HALVINGS:
        win = p[(p.index >= h) & (p.index < h + pd.Timedelta(days=730))]
        pk = win.idxmax()
        peaks.append(pk)
        after = p[(p.index > pk) & (p.index < pk + pd.Timedelta(days=500))]
        troughs.append(after.idxmin() if len(after) else None)
    for kind, pts in (("peak to peak", peaks), ("trough to trough", troughs)):
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            if a is None or b is None:
                continue
            yrs = (b - a).days / 365.25
            complete = not (kind == "trough to trough" and i == len(pts) - 2)  # the latest trough is provisional
            rows.append({"kind": kind, "from": a.date(), "to": b.date(), "p0": p[a], "p1": p[b], "years": yrs,
                         "log_g": math.log(p[b] / p[a]) / yrs, "complete": complete})
    cyc = pd.DataFrame(rows)
    cyc["cagr"] = np.expm1(cyc["log_g"])
    # rolling 4-year CAGR sampled at each year end and today
    ends = [pd.Timestamp(f"{y}-12-31") for y in range(2014, 2026)] + [p.index[-1]]
    roll = []
    for t in ends:
        a = t - pd.DateOffset(years=4)
        roll.append({"end": t.date(), "log_g": math.log(p.asof(t) / p.asof(a)) / 4})
    roll = pd.DataFrame(roll)
    roll["cagr"] = np.expm1(roll["log_g"])
    # calendar years
    cal = []
    for y in range(2011, 2027):
        a, b = p.asof(pd.Timestamp(f"{y - 1}-12-31")), p.asof(min(pd.Timestamp(f"{y}-12-31"), p.index[-1]))
        cal.append({"year": y, "ret": b / a - 1})
    cal = pd.DataFrame(cal)
    # decay fits -> forward (next ~5 years) log growth
    fits = []
    for kind in ("halving epoch", "peak to peak", "trough to trough"):
        c = cyc[(cyc.kind == kind) & cyc.complete & (cyc.log_g > 0)].reset_index(drop=True)
        if len(c) >= 2:
            x = np.arange(len(c))
            bfit = np.polyfit(x, np.log(c.log_g), 1)
            nxt = math.exp(np.polyval(bfit, len(c)))
            fits.append({"method": f"{kind}: exponential decay of log growth per cycle ({len(c)} complete cycles)",
                         "decay_per_cycle": math.exp(bfit[0]), "next_cycle_log_g": nxt, "next_cycle_cagr": math.expm1(nxt)})
    tt = np.array([(pd.Timestamp(e) - pd.Timestamp("2014-12-31")).days / 365.25 for e in roll.end])
    ok = roll.log_g > 0
    bfit = np.polyfit(tt[ok], np.log(roll.log_g[ok]), 1)
    t_mid = (pd.Timestamp("2029-03-31") - pd.Timestamp("2014-12-31")).days / 365.25
    nxt = math.exp(np.polyval(bfit, t_mid))
    fits.append({"method": "rolling 4-year CAGR at year ends 2014-2025 + today: exponential trend, value mid-2026-2031",
                 "decay_per_cycle": math.exp(bfit[0] * 4), "next_cycle_log_g": nxt, "next_cycle_cagr": math.expm1(nxt)})
    last = cyc[(cyc.kind == "peak to peak")].iloc[-1]
    fits.append({"method": f"latest peak-to-peak cycle ({last['from']} to {last['to']}), unshrunk",
                 "decay_per_cycle": np.nan, "next_cycle_log_g": last.log_g, "next_cycle_cagr": last.cagr})
    fits = pd.DataFrame(fits)
    med = float(np.median(fits.next_cycle_log_g))
    shrunk = 0.5 * med + 0.5 * math.log1p(0.06)
    fwd = {"median_of_methods_log_g": med, "shrunk_log_g": shrunk, "shrunk_cagr": math.expm1(shrunk)}

    t1 = cyc.copy()
    t1 = pd.DataFrame({"Measure": t1.kind, "From": t1["from"], "To": t1["to"],
                       "Price": [f"${a:,.0f} → ${b:,.0f}" for a, b in zip(t1.p0, t1.p1)],
                       "Years": t1.years.map(lambda x: f"{x:.1f}"), "CAGR": t1.cagr.map(pct),
                       "Complete?": t1.complete.map(lambda x: "yes" if x else "no (to date)")})
    table(t1, "BTC growth cycle by cycle (UTC daily closes; Coin Metrics before 20 Jul 2015, Coinbase after)")
    t2 = pd.DataFrame({"4 years ending": roll.end, "BTC CAGR": roll.cagr.map(pct)})
    table(t2, "Rolling 4-year BTC CAGR (one full halving cycle, so the cycle phase is the same at both ends)")
    t3 = pd.DataFrame({"Year": cal.year, "BTC": cal.ret.map(lambda x: pct(x, 0))})
    table(t3, "BTC calendar-year returns (2026 = to 28 Sep)")
    t4 = pd.DataFrame({"Method": fits.method, "Decay factor per 4-yr cycle": fits.decay_per_cycle.map(
        lambda x: "" if not np.isfinite(x) else f"{x:.2f}"), "Next-cycle CAGR": fits.next_cycle_cagr.map(pct)})
    table(t4, "Forward BTC growth from the decay",
          f"Median of the methods: log growth {med:.3f} (CAGR {pct(math.expm1(med))}). Shrunk halfway to SPY's "
          f"assumed 6%: **CAGR {pct(fwd['shrunk_cagr'])}** (the 'central' case below).")
    cyc.to_csv(OUT / "btc_cycles.csv", index=False)
    roll.to_csv(OUT / "btc_rolling4y.csv", index=False)
    cal.to_csv(OUT / "btc_calendar_years.csv", index=False)
    fits.to_csv(OUT / "btc_forward_fits.csv", index=False)
    # realized vol by year
    lr = np.log(p).diff()
    vol = lr.groupby(lr.index.year).std() * math.sqrt(365)
    vol = vol[vol.index >= 2014]
    table(pd.DataFrame({"Year": vol.index, "BTC realized vol": vol.map(lambda x: pct(x, 0)).values}),
          "BTC realized volatility (daily log returns, annualized with 365 days)")
    return fwd, vol


# ------------------------------------------------------------------------------------------------ 3. OOS
def oos(W, rules):
    rows = []
    for rule in E.CANDIDATES:
        r = {"rule": rule}
        for pname, (a, b) in IS_OOS.items():
            m1, nav, t, sub = run(rules[rule], W, "etf", 1.0, "RF", a, b)
            m2, *_ = run(rules[rule], W, "etf", 0.2, "SPY", a, b)
            tag = "is" if pname.startswith("IS") else "oos"
            r.update({f"{tag}_sleeve_cagr": m1["cagr"], f"{tag}_sleeve_sharpe": m1["sharpe"],
                      f"{tag}_sleeve_maxdd": m1["maxdd"], f"{tag}_p20_cagr": m2["cagr"],
                      f"{tag}_p20_excess": m2["excess_vs_spy"]})
            # timing alpha vs the coin's own buy-and-hold (weekly, Newey-West)
            coin = "ETH" if rule.startswith("ETH") else "BTC"
            if rule in ("ROT_MOM_10W", "ROT_ETHBTC_10W", "HALF_10W"):
                coin = "BTC"
            y = nav[1:] / nav[:-1] - 1 - sub["CASH"].to_numpy()
            x = sub[coin].to_numpy() - sub["CASH"].to_numpy()
            ok = np.isfinite(x) & np.isfinite(y)
            al, tal, beta = E.nw_tstat(y[ok], x[ok])
            r[f"{tag}_alpha"] = al * E.WEEKS_PER_YEAR
            r[f"{tag}_alpha_t"] = tal
            r[f"{tag}_beta"] = beta
            r[f"{tag}_years"] = m1["years"]
        rows.append(r)
    df = pd.DataFrame(rows)
    df.round(4).to_csv(OUT / "oos_selection.csv", index=False)
    n = len(df)
    from scipy.stats import norm, spearmanr
    res = {}
    for crit, col in (("growth (IS CAGR at a 20% sleeve + 80% SPY)", "is_p20_cagr"), ("IS sleeve Sharpe", "is_sleeve_sharpe")):
        win = df.sort_values(col, ascending=False).iloc[0]
        oos_col = "oos_p20_cagr" if col == "is_p20_cagr" else "oos_sleeve_sharpe"
        rank_oos = int((df[oos_col] > win[oos_col]).sum() + 1)
        rho = spearmanr(df[col], df[oos_col]).correlation
        sr = win["is_sleeve_sharpe"]
        tstat = sr * math.sqrt(win["is_years"])
        p = 2 * (1 - norm.cdf(tstat))
        p_adj = min(1.0, p * n)
        t_adj = norm.ppf(1 - p_adj / 2) if p_adj < 1 else 0.0
        sr_adj = max(0.0, t_adj / math.sqrt(win["is_years"]))
        res[crit] = {"winner": win["rule"], "oos_rank": rank_oos, "rho": rho, "sr_is": sr, "t_is": tstat,
                     "sr_haircut": sr_adj, "haircut": 1 - sr_adj / sr if sr > 0 else np.nan,
                     "oos_sharpe": win["oos_sleeve_sharpe"], "oos_p20_excess": win["oos_p20_excess"],
                     "is_p20_excess": win["is_p20_excess"], "oos_alpha": win["oos_alpha"],
                     "oos_alpha_t": win["oos_alpha_t"]}
    def al(r, tag):
        if r.rule in ("BTC_BH", "ETH_BH"):
            return "—"
        return f"{100 * r[tag + '_alpha']:+.1f}% ({r[tag + '_alpha_t']:.2f})"

    tab = pd.DataFrame({
        "Rule": df.rule,
        "IS sleeve CAGR / Sharpe": [f"{pct(a, 0)} / {b:.2f}" for a, b in zip(df.is_sleeve_cagr, df.is_sleeve_sharpe)],
        "OOS sleeve CAGR / Sharpe": [f"{pct(a, 0)} / {b:.2f}" for a, b in zip(df.oos_sleeve_cagr, df.oos_sleeve_sharpe)],
        "OOS sleeve max DD": df.oos_sleeve_maxdd.map(lambda x: pct(x, 0)),
        "20% sleeve excess vs SPY, IS → OOS": [f"{100 * a:+.1f} → {100 * b:+.1f}" for a, b in zip(df.is_p20_excess, df.oos_p20_excess)],
        "Timing alpha vs own coin, IS (t)": [al(r, "is") for _, r in df.iterrows()],
        "OOS (t)": [al(r, "oos") for _, r in df.iterrows()],
    })
    table(tab, f"Choose on 2014-2019, test on 2020-2026 ({n} candidate rules, IRA/ETF route)",
          "ETH rules hold cash before ETH has enough history (2015-16). Rotation alphas are against BTC.")
    lines = []
    for crit, r in res.items():
        lines.append(f"- **Selection by {crit}:** winner **{r['winner']}**; its OOS rank {r['oos_rank']} of {n}; "
                     f"Spearman IS→OOS rank correlation {r['rho']:.2f}. IS Sharpe {r['sr_is']:.2f} (t {r['t_is']:.2f}) → "
                     f"Bonferroni-haircut Sharpe {r['sr_haircut']:.2f} (haircut {pct(r['haircut'], 0)}); realized OOS "
                     f"Sharpe {r['oos_sharpe']:.2f}. At a 20% sleeve its excess vs SPY went {100 * r['is_p20_excess']:+.1f} → "
                     f"{100 * r['oos_p20_excess']:+.1f} points; OOS timing alpha {100 * r['oos_alpha']:+.1f}% (t {r['oos_alpha_t']:.2f}).")
    # restricted to BTC 1x rules (the instrument the IRA holds): which one wins in-sample by growth?
    btc1 = df[df.rule.str.startswith("BTC_") & ~df.rule.str.contains("2X|L2")]
    wb = btc1.sort_values("is_p20_cagr", ascending=False).iloc[0]
    ratio = (df.oos_sleeve_sharpe / df.is_sleeve_sharpe).median()
    lines.append(f"- **BTC 1x rules only ({len(btc1)} variants):** IS growth winner **{wb.rule}**: IS sleeve CAGR "
                 f"{pct(wb.is_sleeve_cagr, 0)} → OOS {pct(wb.oos_sleeve_cagr, 0)}; OOS rank among BTC 1x rules by 20%-sleeve "
                 f"CAGR {int((btc1.oos_p20_cagr > wb.oos_p20_cagr).sum() + 1)} of {len(btc1)}; OOS timing alpha t {wb.oos_alpha_t:.2f}.")
    lines.append(f"- **Decay across all {n} rules:** median OOS/IS Sharpe ratio {ratio:.2f}; median 20%-sleeve excess "
                 f"{100 * df.is_p20_excess.median():+.1f} → {100 * df.oos_p20_excess.median():+.1f} points. Bonferroni bar for "
                 f"{n} tests: t ≥ {norm.ppf(1 - 0.025 / n):.2f}; the best OOS timing-alpha t is {df.oos_alpha_t.max():.2f}.")
    MD.append("\n" + "\n".join(lines) + "\n")
    pd.DataFrame(res).T.to_csv(OUT / "oos_winners.csv")
    return df, res


# ------------------------------------------------------------------------------------------------ 4. 2x
def lev_etfs(W):
    """Every listed 1x/2x crypto ETF vs a frictionless replica on the same Monday-open intervals."""
    wk = W["etf"]
    t0 = pd.DatetimeIndex(wk["t0"]).normalize()
    t1 = pd.DatetimeIndex(wk["t1"]).normalize()
    dt = wk["dt"].to_numpy()
    carry = ER2 + BASIS2  # what the 2X columns of W already charge above T-bills
    rows = []
    for tk, asset, lev in (("IBIT", "BTC", 1), ("ETHA", "ETH", 1), ("BITX", "BTC", 2), ("BITU", "BTC", 2),
                           ("BTCL", "BTC", 2), ("ETHU", "ETH", 2), ("ETHT", "ETH", 2)):
        px = DATA.yf_bars(tk)["open"]
        act = px.reindex(t1).to_numpy() / px.reindex(t0).to_numpy() - 1
        m = np.isfinite(act)
        yrs = dt[m].sum()
        if lev == 2:
            rep = wk[asset + "2X"].to_numpy()[m] + wk["CASH"].to_numpy()[m] + carry * dt[m]
        else:
            rep = wk[asset].to_numpy()[m] + ROUTE_CFG["etf"]["er1"] * dt[m]
        rf = np.log1p(wk["CASH"].to_numpy()[m]).sum() / yrs
        g_f = np.log1p(act[m]).sum() / yrs
        g_rep = np.log1p(rep).sum() / yrs
        spot = np.log1p(wk[asset].to_numpy()[m] + ROUTE_CFG["etf"]["er1"] * dt[m]).sum() / yrs
        beta = np.polyfit(wk[asset].to_numpy()[m], act[m], 1)[0]
        rows.append({"ETF": tk, "Exposure": f"{lev}x {asset}", "From": wk["t0"][m].iloc[0].date(), "Weeks": int(m.sum()),
                     "Fund growth/yr": pct(g_f), "Spot growth/yr": pct(spot), "Frictionless replica/yr": pct(g_rep),
                     "Gap/yr": pct(g_f - g_rep),
                     "Gap beyond T-bills on the borrowed unit": pct(g_f - g_rep + (rf if lev == 2 else 0.0)) if lev == 2 else "—",
                     "Weekly beta": f"{beta:.2f}", "_gap_ex_rf": g_f - g_rep + (rf if lev == 2 else 0.0)})
    df = pd.DataFrame(rows)
    table(df.drop(columns="_gap_ex_rf"), "Listed crypto ETFs vs a frictionless replica (log growth, Monday open to Monday open)",
          "Replica = the spot price at 09:30 ET (1x, gross of fee) or 2x daily reset at UTC midnights with no financing (2x). "
          "Robinhood lists all seven as tradable with dollar orders (instruments API, 29 Sep 2026).")
    df.to_csv(OUT / "lev_etfs_vs_replica.csv", index=False)
    return df


def two_x(D, W, rules, vol):
    lev = lev_etfs(W)
    real = ER2 + BASIS2
    # (a) breakeven
    rows = []
    for s in (0.40, 0.50, 0.60, 0.70, 0.80):
        r = {"BTC vol": pct(s, 0)}
        for lab, extra in (("realized ETF carry", ER2 + BASIS2), ("cheap hypothetical", ER2 + BASIS2_CHEAP)):
            carry = 0.04 + extra - ROUTE_CFG["etf"]["er1"]
            mu = 1.5 * s * s + carry
            r[f"{lab}: 2nd-unit cost"] = pct(carry)
            r[f"{lab}: 2x beats 1x only if BTC CAGR >"] = pct(math.expm1(mu - s * s / 2), 0)
        rows.append(r)
    table(pd.DataFrame(rows), "When does a 2x daily-reset BTC fund out-grow 1x? (continuous-time approximation)",
          "Growth of an L-times daily-reset fund ≈ L·μ − (L−1)·r − extra − L²σ²/2, with μ BTC's arithmetic return. Setting "
          "L=2 equal to L=1 gives μ* = 1.5σ² + r + extra − 1x fee; the CAGR column converts μ* with g = μ − σ²/2. T-bills 4%.")
    # (b) 1x vs 2x (realized carry) vs 2x (cheap), by year and period, sleeve alone
    Wc = {"etf": W["etf"].copy()}
    add = (BASIS2 - BASIS2_CHEAP) * Wc["etf"]["dt"]
    Wc["etf"]["BTC2X"] = Wc["etf"]["BTC2X"] + add
    Wc["etf"]["ETH2X"] = Wc["etf"]["ETH2X"] + add
    yr_rows = []
    for r1, r2 in (("BTC_BH", "BTC2X_BH"), ("BTC_10W", "BTC2X_10W"), ("BTC_10W_200D", "BTC2X_10W_200D")):
        for y in range(2014, 2027):
            a, b = f"{y}-01-01", f"{y + 1}-01-01"
            out = []
            for rule, Wx in ((r1, W), (r2, W), (r2, Wc)):
                m, *_ = run(rules[rule], Wx, "etf", 1.0, "RF", a, b)
                out.append((1 + m["cagr"]) ** m["years"] - 1)
            yr_rows.append({"pair": r1, "year": y, "r1": out[0], "r2": out[1], "r2c": out[2]})
    yr = pd.DataFrame(yr_rows)
    pv = yr.assign(cell=[f"{pct(a, 0)} / {pct(b, 0)} / {pct(c, 0)}" for a, b, c in zip(yr.r1, yr.r2, yr.r2c)]).pivot(
        index="year", columns="pair", values="cell")
    pv = pv[["BTC_BH", "BTC_10W", "BTC_10W_200D"]]
    pv["BTC vol"] = [pct(vol.get(y, np.nan), 0) for y in pv.index]
    table(pv.reset_index(), "Sleeve alone by calendar year: 1x / 2x at realized carry / 2x at cheap carry",
          f"2x = daily reset at each UTC midnight, T-bills on the borrowed unit plus {pct(real)} a year (realized) or "
          f"{pct(ER2 + BASIS2_CHEAP)} (cheap hypothetical); 1x pays IBIT's 0.25%. 2x ETFs only exist since mid-2023.")
    yr.to_csv(OUT / "two_x_by_year.csv", index=False)
    per = []
    for pname, (a, b) in PERIODS.items():
        for rule in ("BTC_BH", "BTC2X_BH", "BTC_10W", "BTC2X_10W", "BTC_10W_200D", "BTC2X_10W_200D"):
            for lab, Wx in (("realized", W), ("cheap", Wc)):
                if lab == "cheap" and "2X" not in rule:
                    continue
                m, *_ = run(rules[rule], Wx, "etf", 1.0, "RF", a, b)
                per.append({"period": pname, "rule": rule + ("" if "2X" not in rule else f" ({lab} carry)"),
                            "cagr": m["cagr"], "maxdd": m["maxdd"]})
    per = pd.DataFrame(per)
    pv = per.assign(cell=[f"{pct(c)} / {pct(d, 0)}" for c, d in zip(per.cagr, per.maxdd)]).pivot(
        index="rule", columns="period", values="cell")
    table(pv.reset_index(), "1x vs 2x, sleeve alone: CAGR / max DD")
    per.to_csv(OUT / "two_x_by_period.csv", index=False)
    return lev


# ------------------------------------------------------------------------------------------------ 5. Kelly / MC
def kelly_mc(D, W, fwd, vol):
    # joint calendar-day log returns, 2018-01-01 -> end
    p = D["btc"]
    lb = np.log(p).diff()
    spy = D["SPY"]["close"]
    ls = np.log(spy).diff()
    idx = pd.date_range("2018-01-01", p.index[-1], freq="D")
    src = pd.DataFrame({"btc": lb.reindex(idx).to_numpy(), "spy": ls.reindex(idx).fillna(0.0).to_numpy()}, index=idx).dropna()
    hist_vol = src["btc"].std() * math.sqrt(365.25)
    rho_w = np.corrcoef(src["btc"].rolling(7).sum()[6::7], src["spy"].rolling(7).sum()[6::7])[0, 1]
    # (a) analytic mean-variance Kelly (weekly rebalanced mix of BTC and SPY; log-normal approximation)
    sig_s, g_s, rf = 0.17, math.log1p(0.06), 0.04
    rows = []
    for g_b in (0.0, 0.05, fwd["shrunk_log_g"], fwd["median_of_methods_log_g"], 0.25):
        for sig_b in (0.50, 0.65):
            mu_b, mu_s = g_b + sig_b ** 2 / 2, g_s + sig_s ** 2 / 2
            num = (mu_b - mu_s) + sig_s ** 2 - rho_w * sig_b * sig_s
            den = sig_b ** 2 + sig_s ** 2 - 2 * rho_w * sig_b * sig_s
            w_spy = float(np.clip(num / den, 0, 1))
            w_cash = float(np.clip((mu_b - math.log1p(rf)) / sig_b ** 2, 0, 5))
            rows.append({"BTC CAGR assumed": pct(math.expm1(g_b)), "BTC vol": pct(sig_b, 0),
                         "Kelly BTC weight, rest SPY": pct(w_spy, 0), "Half Kelly": pct(w_spy / 2, 0),
                         "Kelly BTC weight vs T-bills (unlevered cap none)": pct(w_cash, 0)})
    table(pd.DataFrame(rows), "Growth-optimal (Kelly) BTC weight, analytic",
          f"SPY CAGR 6%, vol 17%, T-bills 4%; BTC–SPY weekly correlation {rho_w:.2f} (2018-2026). Log-normal, "
          "continuously rebalanced; it ignores fat tails and trend (those are in the Monte Carlo).")
    # (b) Monte Carlo
    scen = {"bear: BTC CAGR 0%": 0.0,
            f"central: BTC CAGR {pct(fwd['shrunk_cagr'])}": fwd["shrunk_log_g"],
            f"bull: BTC CAGR {pct(math.expm1(fwd['median_of_methods_log_g']))}": fwd["median_of_methods_log_g"]}
    weights = np.array([0.0, 0.03, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.80, 1.00])
    hv = f"hist {hist_vol:.0%}"
    allr = []
    for sname, g in scen.items():
        for vb in (0.50, None):
            for blk in (7, 60):
                res = E.mc_run(src, MC_RULES, weights, ["SPY", "RF", "LEVSPY"], g_btc=g, g_spy=math.log1p(0.06),
                               rf=0.04, vol_btc=vb, n_paths=N_PATHS, block=blk, er2_all=ER2 + BASIS2)
                res["scenario"], res["btc_vol"], res["block"] = sname, ("50%" if vb else hv), blk
                allr.append(res)
                print("  MC", sname, vb, blk, "done")
    mc = pd.concat(allr, ignore_index=True)
    mc.round(4).to_csv(OUT / "mc_results.csv", index=False)
    kel = []
    for (sname, bv, blk, rule, base), g in mc.groupby(["scenario", "btc_vol", "block", "rule", "base"], sort=False):
        kel.append({"scenario": sname, "btc_vol": bv, "block": blk, "rule": rule, "base": base,
                    "w_opt": float(g.loc[g.g_mean.idxmax(), "w"])})
    kel = pd.DataFrame(kel)
    kel.to_csv(OUT / "mc_kelly.csv", index=False)
    for bv in ("50%", hv):
        k = kel[kel.btc_vol == bv].copy()
        k["col"] = [f"{s.split(':')[0]}, {b}-day blocks" for s, b in zip(k.scenario, k.block)]
        pv = k.assign(cell=k.w_opt.map(lambda x: pct(x, 0))).pivot_table(index=["rule", "base"], columns="col",
                                                                         values="cell", aggfunc="first", sort=False)
        table(pv.reset_index(), f"Monte Carlo growth-optimal (full-Kelly) crypto weight, BTC vol {bv}",
              "Grid 0, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100% (100% = the cap: no borrowing in an IRA). "
              "Half-Kelly is half. 7-day blocks remove the multi-week trend persistence (no timing skill); 60-day blocks "
              "keep 2018-2026's persistence. LEVSPY = 2x S&P above its 200-day average, else T-bills.")
    for sname in scen:
        rows = []
        for rule in MC_RULES:
            for w in (0.03, 0.10, 0.20, 0.30, 0.50):
                a7 = mc[(mc.scenario == sname) & (mc.btc_vol == "50%") & (mc.block == 7) & (mc.rule == rule) &
                        (mc.base == "SPY") & (np.isclose(mc.w, w))].iloc[0]
                a60 = mc[(mc.scenario == sname) & (mc.btc_vol == "50%") & (mc.block == 60) & (mc.rule == rule) &
                         (mc.base == "SPY") & (np.isclose(mc.w, w))].iloc[0]
                rows.append({"Rule": rule, "Sleeve": pct(w, 0), "Median CAGR": pct(a7.cagr_median),
                             "10th–90th pct CAGR": f"{pct(a7.cagr_p10)} – {pct(a7.cagr_p90)}",
                             "Median excess vs SPY": f"{100 * a7.excess_median:+.1f}",
                             "P(excess > 0)": pct(a7.p_excess_pos, 0), "P(excess ≥ +5)": pct(a7.p_excess_5, 0),
                             "P(max DD ≤ −50%)": pct(a7.p_dd50, 0), "Median max DD": pct(a7.mdd_median, 0),
                             "60-day blocks: median excess / P(DD ≤ −50%)": f"{100 * a60.excess_median:+.1f} / {pct(a60.p_dd50, 0)}"})
        spy = mc[(mc.scenario == sname) & (mc.btc_vol == "50%") & (mc.block == 7) & (mc.base == "SPY") & (mc.w == 0)].iloc[0]
        table(pd.DataFrame(rows), f"Monte Carlo, 10 years, {N_PATHS} paths — {sname}; BTC vol 50%; rest in SPY",
              f"SPY alone on the same paths: median CAGR {pct(spy.cagr_median)}, P(max DD ≤ −50%) {pct(spy.p_dd50, 0)}. "
              "Stationary block bootstrap of 2018-2026 daily BTC and SPY log returns, re-drifted (SPY 6%, T-bills 4%). "
              "Main columns: 7-day blocks (no timing skill). Rules recomputed on each path; weekly decisions, filled a "
              "day later; 0.05%/side; 25% band; 2x at the realized ETF carry.")
    return mc, kel, hist_vol, rho_w


def hindsight_kelly(W, rules):
    rows = []
    for pname, (a, b) in PERIODS.items():
        for rule in ("BTC_BH", "BTC_10W", "BTC_10W_200D", "BTC2X_10W"):
            best, bw = -9, None
            for w in np.arange(0, 1.0001, 0.05):
                m, *_ = run(rules[rule], W, "etf", float(w), "SPY", a, b)
                if m["cagr"] > best:
                    best, bw = m["cagr"], float(w)
            rows.append({"Period": pname, "Rule": rule, "Hindsight growth-optimal sleeve (rest SPY)": pct(bw, 0),
                         "CAGR there": pct(best)})
    table(pd.DataFrame(rows), "Hindsight Kelly: the sleeve size that would have maximized CAGR (rest in SPY)",
          "Upper bound only: it uses the realized, unshrunk path.")


# ------------------------------------------------------------------------------------------------ 6. execution
def execution(D, sch, W, rules):
    rows = []
    # delay between the signal (Sunday close) and each route's fill: all weeks, and on switch weeks only
    sig = D["btc"].reindex(sch.index).to_numpy()
    lab = {"night": "IBIT 24h market, Mon 01:00 UTC (+1 h)", "cb": "Coinbase, Mon 02:00 UTC (+2 h)",
           "etf": "IBIT at Monday 09:30 ET (+13.5 h)"}
    for route in ("night", "cb", "etf"):
        px = E.price_at(D["btc"], D["btc_h"], pd.DatetimeIndex(sch[f"{route}_time"]))
        d = np.log(px / sig)
        keep = np.isfinite(d) & (sch.index >= pd.Timestamp("2016-01-01"))
        r = {"Route (fill time)": lab[route],
             "All weeks: mean / std": f"{100 * d[keep].mean():+.2f}% / {100 * d[keep].std():.2f}%",
             "1st / 99th pct": f"{100 * np.quantile(d[keep], .01):+.1f}% / {100 * np.quantile(d[keep], .99):+.1f}%"}
        for rule in ("BTC_10W", "BTC_10W_200D"):
            e = rules[rule]["BTC"].to_numpy()
            prev = np.concatenate([[0], e[:-1]])
            ent, ex = keep & (e > 0) & (prev == 0), keep & (e == 0) & (prev > 0)
            yrs = keep.sum() / E.WEEKS_PER_YEAR
            cost = (d[ent].sum() - d[ex].sum()) / yrs
            r[f"{rule}: entry / exit mean move → cost a year"] = (
                f"{100 * d[ent].mean():+.2f}% / {100 * d[ex].mean():+.2f}% → {100 * cost:.1f}%")
        rows.append(r)
    table(pd.DataFrame(rows), "BTC price move between the Sunday-close signal and the fill (2016-2026)",
          "A positive entry move and a negative exit move are both costs: the price kept going the signal's way before "
          "the fill. About 40-50 entries and exits per rule, so each mean has a standard error of about 0.4%. Cost is "
          "per year of sleeve (sleeve = 100%).")
    # route comparison, sleeve alone
    rr = []
    for pname, (a, b) in PERIODS.items():
        for rule in ("BTC_BH", "BTC_10W", "BTC_10W_200D", "BTC_20W", "BTC_50D"):
            r = {"Period": pname, "Rule": rule}
            for route in ("ideal", "night", "etf", "cb"):
                m, *_ = run(rules[rule], W, route, 1.0, "RF", a, b)
                r[ROUTE_NAME[route]] = pct(m["cagr"])
            rr.append(r)
    table(pd.DataFrame(rr), "Sleeve-alone CAGR by execution route (pre-tax)",
          "The 24-hour-market route assumes a 0.15% half-spread overnight (not measured) and that Robinhood's 24 Hour "
          "Market accepts IRA orders for IBIT [verify in app].")
    # Coinbase fee sensitivity 0.9% per side
    rs = []
    for rule in ("BTC_10W", "BTC_10W_200D"):
        base_cost = ROUTE_CFG["cb"]["cost"]
        ROUTE_CFG["cb"]["cost"] = [0.009, 0.009, 0.009, 0.009, 0.0001, 0.0]
        m, *_ = run(rules[rule], W, "cb", 1.0, "RF", "2014-01-01", "2026-09-29")
        m2, *_ = run(rules[rule], W, "cb", 1.0, "RF", "2021-01-01", "2026-09-29")
        ROUTE_CFG["cb"]["cost"] = base_cost
        rs.append({"Rule": rule, "Coinbase at 0.9%/side, 2014-2026": pct(m["cagr"]), "2021-2026": pct(m2["cagr"])})
    table(pd.DataFrame(rs), "Coinbase at the 0.90% taker fee reported for US entry tier from 16 Sep 2026")
    # stylized taxes on the Coinbase route (sleeve alone): realized gains taxed each year at a short-term rate
    tx = []
    for rule in ("BTC_10W", "BTC_10W_200D", "BTC_BH"):
        for rate in (0.0, 0.24, 0.37):
            for pname, (a, b) in (("2014-2026", PERIODS["2014-2026"]), ("2021-2026", PERIODS["2021-2026"])):
                cg = after_tax(rules[rule], W, a, b, rate, rule == "BTC_BH")
                tx.append({"Rule": rule, "Tax rate": pct(rate, 0), "Period": pname, "After-tax CAGR": pct(cg)})
    t = pd.DataFrame(tx).pivot_table(index=["Rule", "Tax rate"], columns="Period", values="After-tax CAGR", aggfunc="first", sort=False)
    table(t.reset_index(), "Coinbase in a taxable account: sleeve-alone CAGR after tax (stylized)",
          "Switch rules: each year's net realized gain taxed at the rate shown (holds are mostly < 1 year), losses carried "
          "forward. BTC_BH: never sold; 20% long-term tax on the gain at the end. State tax not included.")
    # IBIT weekend gaps
    ib = D["IBIT"]
    gap = np.log(ib["open"] / ib["close"].shift(1))
    mon = gap[(gap.index.weekday == 0)].dropna()
    oth = gap[(gap.index.weekday != 0)].dropna()
    g = pd.DataFrame([{"IBIT gap": "Friday close → Monday open", "n": len(mon), "Std": pct(mon.std(), 2),
                       "1st / 99th pct": f"{pct(mon.quantile(.01))} / {pct(mon.quantile(.99))}", "Worst": pct(mon.min())},
                      {"IBIT gap": "Other overnight gaps", "n": len(oth), "Std": pct(oth.std(), 2),
                       "1st / 99th pct": f"{pct(oth.quantile(.01))} / {pct(oth.quantile(.99))}", "Worst": pct(oth.min())}])
    table(g, "IBIT opening gaps (2024-01 to 2026-09)")


def after_tax(rule_df, W, a, b, rate, bh=False):
    wk = W["cb"]
    m = (wk["t0"] >= pd.Timestamp(a)) & (wk["t1"] <= pd.Timestamp(b) + pd.Timedelta(days=1))
    sub = wk[m]
    e = rule_df.reindex(sub.index)[["BTC"]].to_numpy()[:, 0]
    cost = ROUTE_CFG["cb"]["cost"][0]
    nav, pos, basis, carry = 1.0, 0.0, 0.0, 0.0
    realized = {}
    years = (sub["t1"].iloc[-1] - sub["t0"].iloc[0]).days / 365.25
    for k in range(len(sub)):
        y = sub["t0"].iloc[k].year
        tgt = e[k] > 0 if not bh else True
        if tgt and pos == 0:
            buy = nav * (1 - cost)
            pos, basis, nav = buy, buy, 0.0
        elif not tgt and pos > 0:
            proceeds = pos * (1 - cost)
            realized[y] = realized.get(y, 0.0) + proceeds - basis
            nav, pos, basis = nav + proceeds, 0.0, 0.0
        pos *= 1 + sub["BTC"].iloc[k]
        nav *= 1 + sub["CASH"].iloc[k]
        # year end: pay tax
        nxt_year = sub["t0"].iloc[k + 1].year if k + 1 < len(sub) else y + 1
        if nxt_year != y and not bh:
            gain = realized.get(y, 0.0) + carry
            if gain > 0:
                tax = rate * gain
                carry = 0.0
                if nav >= tax:
                    nav -= tax
                else:  # sell some crypto to pay
                    need = tax - nav
                    nav = 0.0
                    frac = need / pos
                    basis *= 1 - frac
                    pos -= need
            else:
                carry = gain
    total = nav + pos
    if bh and pos > 0:
        total = nav + pos - 0.20 * max(0.0, pos - basis) * (rate > 0)
    return total ** (1 / years) - 1


# ------------------------------------------------------------------------------------------------ key table
def key_table(perf, mc, kel, fwd):
    """Rule x size: history (CAGR / excess vs SPY / max DD), forward (central, no timing skill), Kelly."""
    central = [s for s in mc.scenario.unique() if s.startswith("central")][0]
    rows = []
    for rule in MC_RULES:
        for w in (0.03, 0.10, 0.20, 0.30, 0.50):
            r = {"Rule": rule, "Sleeve": pct(w, 0)}
            for pname in PERIODS:
                h = perf[(perf.period == pname) & (perf.rule == rule) & np.isclose(perf.w, w) & (perf.base == "SPY")].iloc[0]
                r[f"{pname}: CAGR / excess / max DD"] = f"{pct(h.cagr)} / {100 * h.excess_vs_spy:+.1f} / {pct(h.maxdd, 0)}"
            h = perf[(perf.period == "2014-2026") & (perf.rule == rule) & np.isclose(perf.w, w) & (perf.base == "SPY")].iloc[0]
            r["Worst year 2014-26"] = f"{pct(h.worst_year, 0)} ({h.worst_year_which})"
            f7 = mc[(mc.scenario == central) & (mc.btc_vol == "50%") & (mc.block == 7) & (mc.rule == rule) &
                    (mc.base == "SPY") & np.isclose(mc.w, w)].iloc[0]
            r["Forward median excess (central)"] = f"{100 * f7.excess_median:+.1f}"
            r["P(10-yr excess ≥ +5)"] = pct(f7.p_excess_5, 0)
            r["P(DD ≤ −50%)"] = pct(f7.p_dd50, 0)
            rows.append(r)
    t = pd.DataFrame(rows)
    k = kel[(kel.scenario == central) & (kel.btc_vol == "50%") & (kel.block == 7) & (kel.base == "SPY")]
    note = ("History: IRA/ETF route, rest in SPY, weekly marks. Forward: Monte Carlo central case (BTC CAGR "
            f"{pct(fwd['shrunk_cagr'])}, vol 50%, SPY 6%, no timing skill), 10 years. Growth-optimal sleeve (rest SPY), "
            "central case: " + ", ".join(f"{r.rule} {pct(r.w_opt, 0)}" for r in k.itertuples()) + ".")
    MD.insert(2, "")
    table(t, "KEY TABLE — rule × sleeve size", note)
    t.to_csv(OUT / "key_table.csv", index=False)


# ------------------------------------------------------------------------------------------------ main
def main():
    D, sch, W, rules = load()
    MD.append("# Track 28 — generated tables (run_all.py)\n")
    MD.append(f"Weeks: {len(W['etf'])} decision intervals from {W['etf']['t0'].iloc[0]} to {W['etf']['t1'].iloc[-1]} (UTC).\n")
    checks(D, sch, W)
    print("performance ...")
    perf = performance(W, rules)
    print("cycles ...")
    fwd, vol = cycles(D)
    print("oos ...")
    oos(W, rules)
    print("2x ...")
    two_x(D, W, rules, vol)
    print("execution ...")
    execution(D, sch, W, rules)
    print("hindsight kelly ...")
    hindsight_kelly(W, rules)
    print("monte carlo ...")
    mc, kel, hist_vol, rho = kelly_mc(D, W, fwd, vol)
    key_table(perf, mc, kel, fwd)
    # current state
    last = sch.index[-1]
    st = {r: bool(rules[r].loc[last].sum() > 0) for r in ("BTC_10W", "BTC_20W", "BTC_50D", "BTC_200D", "BTC_10W_200D", "ETH_10W")}
    fb = E.features(D["btc"], sch.index).loc[last]
    MD.append(f"\n**State at the {last.date()} close:** BTC {fb['close']:,.0f}; 10-week average {fb['sma10w']:,.0f}; "
              f"20-week {fb['sma20w']:,.0f}; 50-day {fb['sma50d']:,.0f}; 200-day {fb['sma200d']:,.0f}; 60-day vol "
              f"{pct(fb['vol60'], 0)}. Switches: " + ", ".join(f"{k} {'ON' if v else 'off'}" for k, v in st.items()) + ".\n")
    (OUT / "tables.md").write_text("\n".join(MD) + "\n")
    print("written", OUT / "tables.md")
    tot = sum(f.stat().st_size for f in OUT.iterdir())
    print(f"results size: {tot / 1024:.0f} KB")


if __name__ == "__main__":
    main()
