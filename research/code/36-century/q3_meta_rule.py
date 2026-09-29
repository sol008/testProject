"""Q3: 'ride the strongest asset on Earth'.

Part A (annual, JST 1871–2020): universe = 16 country equity markets + 16 government bond markets +
gold, all in USD. At each year-end rank by trailing L-year USD return; hold the top-1 or top-3 (equal
weight) next year. Trend exit: a pick whose trailing return is below trailing US bills goes to US bills.
Exposure 1x or 2x (2x = 2*r - r_bills - 1%/yr financing spread, i.e. monthly/annual-reset leverage).
Cost 0.5% one-way per switch. Grid: L in {1,3,5} x k in {1,3} x exit in {no, yes} x lev in {1,2}.

Part B (monthly, ETFs 1996-07 – 2026-09): 22 country ETFs (from inception), SPY, EEM/FXI/INDA, gold
(monthly spot until GLD lists in 2004-11), commodities (^SPGSCI spot + bills until DBC lists in
2006-02), US 10y/20y Treasuries (synthetic from GS10 until TLT lists in 2002-08), bitcoin (Coin Metrics,
from 2010-07; also a variant that admits it only from 2014 or excludes it). Cash = 3-month T-bills.
12-month momentum, 10-month SMA trend exit, decisions monthly / quarterly / annual; top-1 and top-3;
1x and 2x. Cost 0.10% one-way for ETFs, 0.6% for bitcoin.

Outputs: q3_annual_grid.csv, q3_annual_series.csv, q3_monthly_grid.csv, q3_monthly_series.csv,
q3_monthly_holdings.csv, q3_decades.csv
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import data36 as D

OUT = D.RESULTS
COST_A = 0.005
FIN_SPREAD = 0.01  # financing spread over bills for 2x
COUNTRY_ETFS = {"EWJ": "Japan", "EWG": "Germany", "EWU": "UK", "EWH": "Hong Kong", "EWA": "Australia", "EWC": "Canada",
                "EWS": "Singapore", "EWW": "Mexico", "EWI": "Italy", "EWP": "Spain", "EWQ": "France", "EWL": "Switzerland",
                "EWD": "Sweden", "EWN": "Netherlands", "EWK": "Belgium", "EWO": "Austria", "EWM": "Malaysia",
                "EWY": "Korea", "EWT": "Taiwan", "EWZ": "Brazil", "EZA": "South Africa", "FXI": "China", "INDA": "India",
                "EEM": "Emerging", "SPY": "USA"}


# ----------------------------------------------------------------------------- Part A
def trailing(w: pd.DataFrame, t: int, L: int) -> pd.Series:
    x = w[(w.index > t - L) & (w.index <= t)]
    return ((1 + x).prod() - 1).where(x.notna().sum() == L)


def annual_universe() -> tuple[pd.DataFrame, pd.Series]:
    eq = D.usd_wide("eq").add_suffix(" eq")
    bd = D.usd_wide("bond").add_suffix(" bond")
    gold = D.gold_annual().rename("gold")
    u = pd.concat([eq, bd, gold], axis=1).sort_index()
    u = u[(u.index >= 1870) & (u.index <= 2020)]
    bills = D.usd_wide("bill")["USA"]
    return u, bills


def run_annual(u: pd.DataFrame, bills: pd.Series, L: int, k: int, exit_: bool, lev: float, cost: float = COST_A,
               universe_filter=None) -> tuple[pd.Series, pd.Series]:
    cols = [c for c in u.columns if universe_filter is None or universe_filter(c)]
    w = u[cols]
    out, held_hist, prev = {}, {}, set()
    for t in w.index[:-1]:
        nxt = t + 1
        if nxt not in w.index:
            continue
        mom = trailing(w, t, L)
        ok = mom.notna() & w.loc[nxt].notna()
        mom = mom[ok].sort_values(ascending=False)
        if len(mom) == 0:
            continue
        bt = float((1 + bills[(bills.index > t - L) & (bills.index <= t)]).prod() - 1)
        rb = float(bills.get(nxt, 0.0))
        picks = list(mom.index[:k])
        rets, held = [], set()
        for c in picks:
            if exit_ and mom[c] <= bt:
                rets.append(rb)
            else:
                rets.append(float(w.loc[nxt, c]))
                held.add(c)
        r = float(np.mean(rets))
        switches = len(held - prev) + len(prev - held)
        r_net = r - cost * switches / k
        if lev != 1.0:
            r_net = max(lev * r_net - (lev - 1) * (rb + FIN_SPREAD), -1.0)  # a loss beyond 100% is ruin
        out[nxt] = r_net
        held_hist[nxt] = "+".join(sorted(held)) if held else "bills"
        prev = held
    s = pd.Series(out).sort_index()
    ruined = s[s <= -1.0]
    if len(ruined):  # after ruin there is nothing left to compound
        s.loc[s.index > ruined.index[0]] = 0.0
    return s, pd.Series(held_hist).sort_index()


EX_CONTROLS = {"Germany": range(1931, 1950), "Japan": range(1941, 1950)}  # capital controls / enemy assets


def drop_controls(u: pd.DataFrame) -> pd.DataFrame:
    u = u.copy()
    for c, yrs in EX_CONTROLS.items():
        for col in [x for x in u.columns if x.startswith(c + " ")]:
            u.loc[u.index.isin(list(yrs)), col] = np.nan
    return u


def decade_table(r: pd.Series, bench: pd.Series) -> pd.DataFrame:
    rows = []
    for dec, g in r.groupby((r.index // 10) * 10):
        b = bench.reindex(g.index).dropna()
        rows.append({"decade": f"{dec}s", "n": len(g), "cagr": D.cagr(float((1 + g).prod()), len(g)),
                     "bench_cagr": D.cagr(float((1 + b).prod()), len(b)) if len(b) else np.nan})
    d = pd.DataFrame(rows).set_index("decade")
    d["excess"] = d["cagr"] - d["bench_cagr"]
    return d


def part_a() -> None:
    u, bills = annual_universe()
    us = u["USA eq"].dropna()
    rows, series, holds = [], {"US eq": us, "US bills": bills, "EW eq world": D.usd_wide("eq").mean(axis=1)}, {}
    grids = []
    u_ctrl = drop_controls(u)
    for L in (1, 3, 5):
        for k in (1, 3):
            for exit_ in (False, True):
                for lev in (1.0, 2.0):
                    for uni, flt in (("all", None), ("eq_only", lambda c: c.endswith(" eq")), ("ex_controls", None)):
                        if uni == "ex_controls" and (L != 1 or not exit_):
                            continue
                        s, h = run_annual(u_ctrl if uni == "ex_controls" else u, bills, L, k, exit_, lev, universe_filter=flt)
                        name = f"{uni}_L{L}_top{k}_{'exit' if exit_ else 'noexit'}_{int(lev)}x"
                        if lev != 1.0:
                            st_ruin = s[s <= -1.0]
                            if len(st_ruin):
                                print(f"  {name}: ruined in {int(st_ruin.index[0])}")
                        series[name] = s
                        if uni == "all" and lev == 1.0:
                            holds[name] = h
                        st = D.series_stats(s, 1)
                        st["ruin_year"] = int(s[s <= -1.0].index[0]) if (s <= -1.0).any() else None
                        a = pd.concat([s, us], axis=1).dropna()
                        st.update({"rule": name, "universe": uni, "L": L, "k": k, "exit": exit_, "lev": lev,
                                   "us_cagr": D.cagr(float((1 + a.iloc[:, 1]).prod()), len(a))})
                        st["excess_vs_us"] = st["cagr"] - st["us_cagr"]
                        st.update({f"r10_{kk}": v for kk, v in D.rolling_10y_share(s, us, 1).items()})
                        dt = decade_table(s, us)
                        st["worst_decade"] = dt["cagr"].idxmin()
                        st["worst_decade_cagr"] = dt["cagr"].min()
                        st["worst_decade_excess"] = dt["excess"].min()
                        st["decades_beating_us"] = float((dt["excess"] > 0).mean())
                        for lab, lo, hi in [("pre1950", 1871, 1950), ("post1950", 1951, 2020), ("post1990", 1991, 2020)]:
                            ss = s[(s.index >= lo) & (s.index <= hi)]
                            uu = us[(us.index >= lo) & (us.index <= hi)]
                            st[f"{lab}_excess"] = D.cagr(float((1 + ss).prod()), len(ss)) - D.cagr(float((1 + uu).prod()), len(uu))
                        st["time_in_bills"] = float((h == "bills").mean())
                        st["switches_per_year"] = float((h != h.shift(1)).mean())
                        rows.append(st)
                        grids.append(dt.rename(columns=lambda c: f"{name}:{c}"))
    for nm in ("US eq", "US bills", "EW eq world"):
        s = series[nm].loc[1872:2020].dropna()
        st = D.series_stats(s, 1)
        st.update({"rule": nm})
        dt = decade_table(s, us)
        st["worst_decade"] = dt["cagr"].idxmin()
        st["worst_decade_cagr"] = dt["cagr"].min()
        rows.append(st)
    res = pd.DataFrame(rows).set_index("rule")
    res.to_csv(os.path.join(OUT, "q3_annual_grid.csv"))
    pd.DataFrame(series).to_csv(os.path.join(OUT, "q3_annual_series.csv"))
    pd.DataFrame(holds).to_csv(os.path.join(OUT, "q3_annual_holdings.csv"))
    # decade table of the headline rule
    head = "all_L1_top1_exit_1x"
    dt = decade_table(series[head], us)
    dt3 = decade_table(series["all_L1_top3_exit_1x"], us)
    dd = dt.join(dt3, rsuffix="_top3")
    dd.to_csv(os.path.join(OUT, "q3_decades.csv"))
    cols = ["cagr", "us_cagr", "excess_vs_us", "vol", "max_dd", "worst_period", "ruin_year", "worst_decade", "worst_decade_cagr",
            "r10_share_beat", "r10_share_beat_5pt", "pre1950_excess", "post1950_excess", "post1990_excess", "time_in_bills", "switches_per_year"]
    print("Part A: annual meta-rule grid, 1871–2020 (USD, cost 0.5% one-way):")
    with pd.option_context("display.width", 300, "display.max_rows", 200):
        print(res[[c for c in cols if c in res.columns]].round(3).to_string())
    print("\nHeadline (L1 top1 exit 1x) by decade vs US:")
    print(dd.round(3).to_string())
    print("\nHoldings, headline rule:")
    print(holds[head].to_string())


# ----------------------------------------------------------------------------- Part B
def monthly_universe() -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """Monthly USD total-return matrix (decimal), the monthly bill return, and the price-level matrix
    used for the 10-month SMA (total-return index)."""
    rets = {}
    for t in COUNTRY_ETFS:
        px = D.month_end(D.yf_close(t))
        rets[t] = px.pct_change()
    # gold: spot monthly average before GLD, GLD after (0.4%/yr fee already inside GLD)
    g = D.gold_monthly()
    gr = g.pct_change() - 0.004 / 12
    gld = D.month_end(D.yf_close("GLD")).pct_change()
    gold = pd.concat([gr[gr.index < gld.index[1]], gld.iloc[1:]])
    rets["GOLD"] = gold
    # commodities: GSCI spot + bills before DBC
    bills = D.fred("TB3MS")
    bills.index = bills.index + pd.offsets.MonthEnd(0)
    rb = bills / 1200.0
    gsci = D.month_end(D.yf_close("^SPGSCI")).pct_change()
    dbc = D.month_end(D.yf_close("DBC")).pct_change()
    com = pd.concat([(gsci + rb.reindex(gsci.index).fillna(0))[gsci.index < dbc.index[1]], dbc.iloc[1:]])
    rets["COMMOD"] = com
    # long Treasuries: synthetic from GS10 (duration 7.5) before TLT
    y = D.fred("GS10")
    y.index = y.index + pd.offsets.MonthEnd(0)
    syn = (y.shift(1) / 1200.0 - 7.5 * (y - y.shift(1)) / 100.0)
    tlt = D.month_end(D.yf_close("TLT")).pct_change()
    bond = pd.concat([syn[syn.index < tlt.index[1]], tlt.iloc[1:]])
    rets["BOND"] = bond
    # bitcoin
    b = D.month_end(D.btc_daily()).pct_change()
    rets["BTC"] = b
    R = pd.DataFrame(rets).sort_index()
    R = R[(R.index >= "1990-01-31") & (R.index <= D.ASOF)]
    lvl = (1 + R.fillna(0)).cumprod().where(R.notna())
    return R, rb.reindex(R.index).ffill(), lvl


def run_monthly(R: pd.DataFrame, rb: pd.Series, lvl: pd.DataFrame, k: int, freq: str, lev: float, sma_exit: bool = True,
                cols=None, start="1996-07-31", cost_etf: float = 0.001, cost_btc: float = 0.006,
                btc_from: str | None = None, mom_months: int = 12) -> tuple[pd.Series, pd.Series]:
    cols = list(cols or R.columns)
    R = R[cols]
    lvl = lvl[cols]
    mom = lvl / lvl.shift(mom_months) - 1
    sma = lvl.rolling(10).mean()
    above = lvl > sma
    bill12 = np.exp(np.log1p(rb).rolling(12).sum()) - 1
    idx = R.index[R.index >= start]
    step = {"M": 1, "Q": 3, "A": 12}[freq]
    out, held_hist, prev, cur = {}, {}, {}, None
    for i, t in enumerate(idx[:-1]):
        nxt = idx[i + 1]
        if i % step == 0 or cur is None:
            m = mom.loc[t].copy()
            if btc_from is not None and t < pd.Timestamp(btc_from):
                m["BTC"] = np.nan
            ok = m.notna() & R.loc[nxt].notna()
            if sma_exit:
                ok &= above.loc[t] & (m > bill12.loc[t])
            m = m[ok].sort_values(ascending=False)
            cur = {c: 1.0 / k for c in m.index[:k]}
        elif sma_exit:
            # between decisions: drop a holding that breaks its 10-month SMA (weekly/monthly exit check)
            cur = {c: w for c, w in cur.items() if bool(above.loc[t, c]) and pd.notna(R.loc[nxt, c])}
        w_cash = 1.0 - sum(cur.values())
        r = sum(w * float(R.loc[nxt, c]) for c, w in cur.items()) + w_cash * float(rb.loc[nxt])
        # costs on weight changes
        cost = 0.0
        for c in set(cur) | set(prev):
            dw = abs(cur.get(c, 0.0) - prev.get(c, 0.0))
            cost += dw * (cost_btc if c == "BTC" else cost_etf)
        r_net = r - cost
        if lev != 1.0:
            r_net = max(lev * r_net - (lev - 1) * (float(rb.loc[nxt]) + FIN_SPREAD / 12), -1.0)
        out[nxt] = r_net
        held_hist[nxt] = "+".join(sorted(cur)) if cur else "bills"
        prev = dict(cur)
    s = pd.Series(out)
    ruined = s[s <= -1.0]
    if len(ruined):
        s.loc[s.index > ruined.index[0]] = 0.0
    return s, pd.Series(held_hist)


def part_b() -> None:
    R, rb, lvl = monthly_universe()
    spy = R["SPY"].dropna()
    spy = spy[spy.index >= "1996-07-31"]
    rows, series, holds = [], {"SPY": spy, "bills": rb.reindex(spy.index)}, {}
    variants = []
    for k in (1, 3):
        for freq in ("M", "Q", "A"):
            for lev in (1.0, 2.0):
                for uni, kw in (("all", {}), ("no_btc", {"cols": [c for c in R.columns if c != "BTC"]}),
                                ("btc2014", {"btc_from": "2014-01-31"}), ("countries_only", {"cols": list(COUNTRY_ETFS)})):
                    for ex in (True, False):
                        if not ex and (uni != "all" or freq != "M"):
                            continue
                        variants.append((k, freq, lev, uni, kw, ex))
    for k, freq, lev, uni, kw, ex in variants:
        s, h = run_monthly(R, rb, lvl, k, freq, lev, sma_exit=ex, **kw)
        name = f"{uni}_top{k}_{freq}_{int(lev)}x{'' if ex else '_noexit'}"
        series[name] = s
        if lev == 1.0:
            holds[name] = h
        st = D.series_stats(s, 12)
        st["ruin_month"] = str(s[s <= -1.0].index[0].date()) if (s <= -1.0).any() else None
        a = pd.concat([s, spy], axis=1).dropna()
        st.update({"rule": name, "universe": uni, "k": k, "freq": freq, "lev": lev, "exit": ex,
                   "spy_cagr": D.cagr(float((1 + a.iloc[:, 1]).prod()), len(a) / 12)})
        st["excess_vs_spy"] = st["cagr"] - st["spy_cagr"]
        st.update({f"r10_{kk}": v for kk, v in D.rolling_10y_share(s, spy, 12).items()})
        ann = (1 + s).groupby(s.index.year).prod() - 1
        spy_ann = (1 + spy).groupby(spy.index.year).prod() - 1
        st["worst_year"] = float(ann.min())
        st["worst_year_id"] = int(ann.idxmin())
        st["years_beating_spy"] = float((ann - spy_ann.reindex(ann.index) > 0).mean())
        for lab, lo, hi in [("1996-2010", "1996-07-31", "2010-12-31"), ("2011-2026", "2011-01-31", "2026-12-31")]:
            ss = s[(s.index >= lo) & (s.index <= hi)]
            pp = spy[(spy.index >= lo) & (spy.index <= hi)]
            st[f"{lab}_excess"] = D.cagr(float((1 + ss).prod()), len(ss) / 12) - D.cagr(float((1 + pp).prod()), len(pp) / 12)
        st["time_in_bills"] = float((h == "bills").mean())
        st["decisions_changed_per_year"] = float((h != h.shift(1)).sum()) / (len(h) / 12)
        rows.append(st)
    st = D.series_stats(spy, 12)
    st.update({"rule": "SPY"})
    rows.append(st)
    res = pd.DataFrame(rows).set_index("rule")
    res.to_csv(os.path.join(OUT, "q3_monthly_grid.csv"))
    pd.DataFrame(series).to_csv(os.path.join(OUT, "q3_monthly_series.csv"))
    pd.DataFrame(holds).to_csv(os.path.join(OUT, "q3_monthly_holdings.csv"))
    cols = ["cagr", "spy_cagr", "excess_vs_spy", "vol", "max_dd", "worst_year", "worst_year_id", "r10_share_beat", "r10_share_beat_5pt",
            "1996-2010_excess", "2011-2026_excess", "years_beating_spy", "time_in_bills", "decisions_changed_per_year"]
    print("\nPart B: monthly ETF-era meta-rule, 1996-07 – 2026-09:")
    with pd.option_context("display.width", 300, "display.max_rows", 200):
        print(res[[c for c in cols if c in res.columns]].round(3).to_string())
    # what the rule held each year (headline all_top1_M_1x)
    h = holds["all_top1_M_1x"]
    yr = h.groupby(h.index.year).agg(lambda x: ", ".join(pd.Series(x).value_counts().index[:3]))
    print("\nHoldings by year (all_top1_M_1x, most frequent):")
    print(yr.to_string())


if __name__ == "__main__":
    part_a()
    part_b()
