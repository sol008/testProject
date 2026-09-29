"""Track 29, part C: studies on the weekly single-stock book (engine29) and the survivorship-bias audit.

  bias()        coverage of PIT members by Yahoo; equal-weight universe vs RSP (the real equal-weight S&P 500);
                monthly top-quintile / top-decile momentum on our panel vs Ken French's bias-free portfolios;
                measured turnover and stock-specific (idiosyncratic) volatility -> results/turnover_measured.json
  grid()        every rule variant, PIT and survivor universes -> results/grid.csv
  distribution()rolling 5/10-year windows, pick-luck study, block bootstrap -> results/dist_*.csv
  leverage()    2x margin and synthetic 2x single-stock daily ETFs -> results/leverage.csv
  taxes()       after-tax in a taxable account vs SPY -> results/taxes.csv
"""
from __future__ import annotations

import json
import sys

sys.dont_write_bytecode = True

import numpy as np
import pandas as pd

import data29 as D
import engine29 as E

RNG = np.random.default_rng(2929)
BASE = E.Params()                        # pre-registered base: 12-1, K=8, PIT S&P 500, keep top 10%, no filter


def get_panel() -> E.Panel:
    fn = D.CACHE / "panel.pkl"
    if fn.exists():
        return pd.read_pickle(fn)
    P = E.load_panel()
    E.compute_signals(P)
    pd.to_pickle(P, fn)
    return P


def monthly_panel(P: E.Panel):
    """Month-end closes (forward-filled) and the month-start membership masks."""
    C = pd.DataFrame(P.C, index=P.dates, columns=P.tickers)
    V = pd.DataFrame(P.valid, index=P.dates, columns=P.tickers)
    me = C.groupby(C.index.to_period("M")).tail(1)
    idx = me.index
    ret = me.pct_change(fill_method=None)
    alive = V.loc[idx].shift(-1, fill_value=False)             # stock still quoted at the NEXT month end
    return me, ret, idx, alive


def bias(P: E.Panel) -> dict:
    out = {}
    me, ret, idx, alive = monthly_panel(P)
    tk = P.tickers
    pit = pd.DataFrame(P.masks["pit"], index=P.dates, columns=tk).loc[idx]
    sur = pd.DataFrame(P.masks["survivor"], index=P.dates, columns=tk).loc[idx]
    mem_all = pd.DataFrame(E.D.member_mask(P.dates, tk).values, index=P.dates, columns=tk).loc[idx]
    # (a) coverage: share of point-in-time members with a Yahoo price
    pit_raw = E.D.pit_membership()
    counts = []
    for y in range(1998, 2027):
        row = pit_raw[pit_raw.date <= f"{y}-06-30"].iloc[-1]
        n_all = len(row["tickers"].split(","))
        m = mem_all.loc[mem_all.index.year == y]
        n_data = int(pit.loc[pit.index.year == y].sum(axis=1).median())
        counts.append(dict(year=y, members=n_all, with_yahoo_data=n_data, coverage=n_data / n_all))
    cov = pd.DataFrame(counts)
    cov.to_csv(D.RESULTS / "bias_coverage.csv", index=False, float_format="%.3f")
    # (b) equal-weight universe vs RSP (Invesco S&P 500 Equal Weight, real, includes every delisted member)
    fwd = ret.shift(-1)                                         # return over the month after formation
    def ew(mask):
        x = fwd.where(mask)
        return x.mean(axis=1).shift(1).dropna()                 # realised in the month after the mask date
    ew_pit, ew_sur = ew(pit), ew(sur)
    px = D.prices()["Close"]
    rsp = px["RSP"].dropna()
    rsp_m = rsp.groupby(rsp.index.to_period("M")).last().pct_change().dropna()
    spy = px["SPY"].dropna()
    spy_m = spy.groupby(spy.index.to_period("M")).last().pct_change().dropna()
    ew_pit.index = ew_pit.index.to_period("M")
    ew_sur.index = ew_sur.index.to_period("M")
    common = ew_pit.index.intersection(rsp_m.index)
    common = common[common >= pd.Period("2003-06", "M")]
    cg = lambda r: float((1 + r).prod() ** (12 / len(r)) - 1)  # noqa: E731
    eq_rows = [dict(series=s, cagr=cg(r.loc[common])) for s, r in
               (("RSP (real equal-weight S&P 500)", rsp_m), ("EW of PIT members with Yahoo data", ew_pit),
                ("EW of today's members (survivor list)", ew_sur), ("SPY", spy_m))]
    eqw = pd.DataFrame(eq_rows)
    eqw["minus_RSP"] = eqw["cagr"] - eqw.loc[0, "cagr"]
    eqw.to_csv(D.RESULTS / "bias_equal_weight_vs_rsp.csv", index=False, float_format="%.4f")
    out["eqw"] = eqw
    # (c) monthly momentum portfolios on our panel vs Ken French (bias-free)
    mom = me.shift(1) / me.shift(12) - 1                        # 12-1 at the month end (t-12 .. t-1)
    kf = pd.DataFrame({
        "KF BigWin EW": D.KF.read_sections("25_Portfolios_ME_Prior_12_2")["Average Equal Weighted Returns -- Monthly [monthly]"]["BIG HiPRIOR"] / 100,
        "KF BigWin VW": D.KF.read_sections("25_Portfolios_ME_Prior_12_2")["Average Value Weighted Returns -- Monthly [monthly]"]["BIG HiPRIOR"] / 100,
        "KF TopDec VW": D.KF.read_sections("10_Portfolios_Prior_12_2")["Value Weight Returns -- Monthly [monthly]"]["Hi PRIOR"] / 100,
        "KF Market": D.kf_factors()["Mkt-RF"] + D.kf_factors()["RF"],
    })
    rows, tos, idios = [], {}, []
    for uname, mask in (("PIT", pit), ("survivor", sur)):
        for q, lab in ((0.8, "top quintile"), (0.9, "top decile")):
            m = mom.where(mask & mom.notna())
            thr = m.quantile(q, axis=1)
            sel = m.ge(thr, axis=0) & m.notna()
            r = fwd.where(sel).mean(axis=1).shift(1)
            r.index = r.index.to_period("M")
            w = sel.div(sel.sum(axis=1), axis=0).fillna(0)
            to = (w - w.shift(1)).clip(lower=0).sum(axis=1).iloc[13:].mean()   # one-way, per month
            tos[f"{uname} {lab}"] = float(to)
            rr = r.loc["2000-01":"2026-08"].dropna()
            rows.append(dict(portfolio=f"{uname} S&P 500 {lab} 12-1, EW monthly", months=len(rr), cagr=cg(rr),
                             one_way_turnover_month=to))
            if uname == "PIT" and q == 0.8:
                resid = fwd.where(sel).sub(fwd.where(sel).mean(axis=1), axis=0)
                idios.append(float(np.nanstd(resid.loc["2000":].values)))
    for c in kf.columns:
        rr = kf[c].loc["2000-01":"2026-08"].dropna()
        rows.append(dict(portfolio=c + " (CRSP, bias-free)", months=len(rr), cagr=cg(rr)))
    mt = pd.DataFrame(rows)
    mt.to_csv(D.RESULTS / "bias_momentum_vs_kf.csv", index=False, float_format="%.4f")
    out["mom_vs_kf"] = mt
    meas = {"top_decile": tos["PIT top decile"], "top_quintile": tos["PIT top quintile"],
            "idio_monthly_sd": idios[0],
            "source": "PIT S&P 500 panel 2000-2026, EW monthly 12-1 portfolios (studies29.bias)"}
    (D.RESULTS / "turnover_measured.json").write_text(json.dumps(meas, indent=1))
    out["coverage"] = cov
    out["turnover"] = meas
    return out


def grid(P: E.Panel) -> pd.DataFrame:
    rows = []
    signals = ["mom12_1", "mom6_1", "hi52", "fip", "resid", "riskadj", "combo"]
    for uni in ("pit", "mega"):
        for sig in signals:
            for K in (4, 8, 12):
                for trend in ("none", "entry", "exit"):
                    prm = E.Params(signal=sig, K=K, universe=uni, trend=trend)
                    s = E.summarize(P, E.run(P, prm), f"{uni}|{sig}|K{K}|{trend}")
                    s.update(universe=uni, signal=sig, K=K, trend=trend)
                    rows.append(s)
    for sig in signals:                   # the classic biased backtest, for the bias measurement
        for K in (4, 8, 12):
            prm = E.Params(signal=sig, K=K, universe="survivor")
            s = E.summarize(P, E.run(P, prm), f"survivor|{sig}|K{K}|none")
            s.update(universe="survivor", signal=sig, K=K, trend="none")
            rows.append(s)
    for keep in (0.05, 0.2, 0.5):         # continuation band sensitivity on the base rule
        prm = E.Params(keep=keep)
        s = E.summarize(P, E.run(P, prm), f"pit|mom12_1|K8|none|keep{keep}")
        s.update(universe="pit", signal="mom12_1", K=8, trend="none", keep=keep)
        rows.append(s)
    for cost in (0.0025, 0.005):
        s = E.summarize(P, E.run(P, E.Params(cost=cost)), f"pit|mom12_1|K8|none|cost{cost}")
        s.update(universe="pit", signal="mom12_1", K=8, trend="none", cost=cost)
        rows.append(s)
    g = pd.DataFrame(rows)
    g.to_csv(D.RESULTS / "grid.csv", index=False, float_format="%.4f")
    return g


def weekly_pair(P: E.Panel, eq: pd.Series) -> pd.DataFrame:
    spy = E.spy_equity(P, eq)
    w = pd.DataFrame({"s": eq, "m": spy}).resample("W-FRI").last().pct_change().dropna()
    return w


def rolling_windows(w: pd.DataFrame, label: str) -> list[dict]:
    rows = []
    for yrs in (5, 10):
        n = 52 * yrs
        ls = np.log1p(w["s"]).rolling(n).sum()
        lm = np.log1p(w["m"]).rolling(n).sum()
        ex = (np.exp(ls / yrs) - np.exp(lm / yrs)).dropna()
        rows.append(dict(rule=label, method="rolling windows (weekly starts)", years=yrs, n=len(ex),
                         p10=ex.quantile(0.1), median=ex.median(), p90=ex.quantile(0.9),
                         p_beat_spy=(ex > 0).mean(), p_beat_by_5=(ex >= 0.05).mean()))
    return rows


def block_bootstrap(w: pd.DataFrame, label: str, paths: int = 5000, block: int = 26) -> list[dict]:
    rows = []
    s, m = w["s"].values, w["m"].values
    n = len(s)
    for yrs in (5, 10):
        T = 52 * yrs
        idx = np.empty((paths, T), dtype=int)
        idx[:, 0] = RNG.integers(n, size=paths)
        jump = RNG.random((paths, T)) < 1 / block
        fresh = RNG.integers(n, size=(paths, T))
        for k in range(1, T):
            idx[:, k] = np.where(jump[:, k], fresh[:, k], (idx[:, k - 1] + 1) % n)
        rs, rm = s[idx], m[idx]
        cs = np.prod(1 + rs, axis=1) ** (1 / yrs) - 1
        cm = np.prod(1 + rm, axis=1) ** (1 / yrs) - 1
        wv = np.cumprod(1 + rs, axis=1)
        dd = (wv / np.maximum.accumulate(wv, axis=1) - 1).min(axis=1)
        ex = cs - cm
        rows.append(dict(rule=label, method=f"stationary block bootstrap ({block}-week blocks)", years=yrs, n=paths,
                         p10=np.quantile(ex, 0.1), median=np.median(ex), p90=np.quantile(ex, 0.9),
                         p_beat_spy=(ex > 0).mean(), p_beat_by_5=(ex >= 0.05).mean(),
                         median_maxdd=np.median(dd), p_dd_50=(dd <= -0.5).mean()))
    return rows


def distribution(P: E.Panel, rules: dict[str, E.Params]) -> pd.DataFrame:
    rows = []
    for label, prm in rules.items():
        eq = E.run(P, prm)["equity"]
        w = weekly_pair(P, eq)
        rows += rolling_windows(w, label)
        rows += block_bootstrap(w, label)
    # pick-luck: same rule, random choice among the top 5 each week (100 seeds)
    base = rules["base: 12-1, K=8, PIT"]
    ex_full, ex10 = [], []
    for seed in range(100):
        prm = E.Params(**{**base.__dict__, "pick_among": 5, "seed": seed})
        eq = E.run(P, prm)["equity"]
        w = weekly_pair(P, eq)
        yrs = len(w) / 52
        ex_full.append(np.prod(1 + w["s"]) ** (1 / yrs) - np.prod(1 + w["m"]) ** (1 / yrs))
        ls = np.log1p(w["s"]).rolling(520).sum()
        lm = np.log1p(w["m"]).rolling(520).sum()
        ex10.append((np.exp(ls / 10) - np.exp(lm / 10)).dropna().iloc[::52].values)
    ex_full = np.array(ex_full)
    ex10 = np.concatenate(ex10)
    rows.append(dict(rule="base, random pick among top 5 (100 seeds)", method="full 2000-2026 excess CAGR",
                     years=26, n=100, p10=np.quantile(ex_full, 0.1), median=np.median(ex_full),
                     p90=np.quantile(ex_full, 0.9), p_beat_spy=(ex_full > 0).mean(), p_beat_by_5=(ex_full >= 0.05).mean()))
    rows.append(dict(rule="base, random pick among top 5 (100 seeds)", method="10-year windows, yearly starts x seeds",
                     years=10, n=len(ex10), p10=np.quantile(ex10, 0.1), median=np.median(ex10),
                     p90=np.quantile(ex10, 0.9), p_beat_spy=(ex10 > 0).mean(), p_beat_by_5=(ex10 >= 0.05).mean()))
    d = pd.DataFrame(rows)
    d.to_csv(D.RESULTS / "dist_outcomes.csv", index=False, float_format="%.4f")
    return d


def leverage(P: E.Panel) -> pd.DataFrame:
    rows = []
    rf_w = pd.Series(P.rf, index=P.dates)
    for label, prm, L in (
        ("base 1x", BASE, 1.0),
        ("base, 2x margin (weekly reset, RF+1.5%)", BASE, 2.0),
        ("base + trend exit, 2x margin", E.Params(trend="exit"), 2.0),
        ("base, each pick as a synthetic 2x daily single-stock ETF", E.Params(letf=2.0), 1.0),
        ("mega-cap top-50, 2x daily single-stock ETF", E.Params(letf=2.0, universe="mega"), 1.0),
        ("base + trend exit, 2x daily single-stock ETF", E.Params(letf=2.0, trend="exit"), 1.0),
        ("SPY, 2x margin (weekly reset)", None, 2.0),
    ):
        if prm is None:
            eq = pd.Series(P.spy, index=P.dates).loc["2000-01-10":]
        else:
            eq = E.run(P, prm)["equity"]
        w = weekly_pair(P, eq)
        rfw = (1 + rf_w).resample("W-FRI").prod().reindex(w.index).fillna(1) - 1
        r = L * w["s"] - (L - 1) * (rfw + 0.015 / 52) if L != 1.0 else w["s"]
        wealth = (1 + r).cumprod()
        yrs = len(r) / 52
        dd = wealth / wealth.cummax() - 1
        cm = np.prod(1 + w["m"]) ** (1 / yrs) - 1
        rows.append(dict(rule=label, cagr=wealth.iloc[-1] ** (1 / yrs) - 1, spy_cagr=cm,
                         excess=wealth.iloc[-1] ** (1 / yrs) - 1 - cm, maxdd=dd.min(),
                         worst_week=r.min(), weeks_book_down_25pct_plus=int((w["s"] <= -0.25).sum()),
                         end_wealth=wealth.iloc[-1], min_wealth=wealth.min()))
        b = block_bootstrap(pd.DataFrame({"s": r, "m": w["m"]}), label, paths=4000)
        for x in b:
            rows[-1][f"boot{x['years']}_median"] = x["median"]
            rows[-1][f"boot{x['years']}_p10"] = x["p10"]
            rows[-1][f"boot{x['years']}_p90"] = x["p90"]
            rows[-1][f"boot{x['years']}_p_dd50"] = x["p_dd_50"]
    lv = pd.DataFrame(rows)
    lv.to_csv(D.RESULTS / "leverage.csv", index=False, float_format="%.4f")
    return lv


def taxes(P: E.Panel, st_rate: float = 0.37, lt_rate: float = 0.20, div_rate: float = 0.20) -> pd.DataFrame:
    """Taxable account: each calendar year's net realised gain is taxed (short-term if held <= 365 days) and the
    tax is paid out of the book at year end; losses carry forward.  SPY: dividends taxed yearly, gain deferred.
    Rates are illustrative (37% + 0% state short-term, 20% long-term / qualified dividends)."""
    res = E.run(P, BASE)
    eq = res["equity"]
    tr = res["trades"].copy()
    tr["exit_date"] = P.dates[tr["exit"].values]
    tr["days"] = (P.dates[tr["exit"].values] - P.dates[tr["entry"].values]).days
    # dollar gain per trade needs the dollar size: use equity/K at entry as the size proxy
    size = eq.reindex(P.dates[tr["entry"].values]).values / BASE.K
    tr["gain"] = size * (tr["px_out"] / tr["px_in"] - 1)
    yearly = eq.resample("YE").last()
    carry, wealth_scale, rows = 0.0, 1.0, []
    for y, g in tr.groupby(tr["exit_date"].dt.year):
        st = g.loc[g.days <= 365, "gain"].sum()
        lt = g.loc[g.days > 365, "gain"].sum()
        net_st = st + min(carry, 0)
        tax = max(net_st, 0) * st_rate + max(lt, 0) * lt_rate
        carry = min(net_st, 0)
        yv = yearly.loc[str(y)].iloc[0] if str(y) in yearly.index.year.astype(str) else np.nan
        rows.append(dict(year=y, st_gain=st, lt_gain=lt, tax=tax, tax_pct_of_book=tax / yv if yv else np.nan))
    tx = pd.DataFrame(rows)
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    drag = tx["tax_pct_of_book"].fillna(0)
    after = (eq.iloc[-1] / eq.iloc[0]) * np.prod(1 - drag.values)
    spy = E.spy_equity(P, eq)
    spy_div_drag = 0.018 * div_rate                  # ~1.8% average yield 2000-2026 taxed yearly
    spy_after = (spy.iloc[-1] / spy.iloc[0]) * (1 - spy_div_drag) ** yrs
    spy_after_liq = 1 + (spy_after - 1) * (1 - lt_rate)
    summ = pd.DataFrame([dict(item="book pre-tax CAGR", value=(eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1),
                         dict(item="book after tax CAGR (taxable)", value=after ** (1 / yrs) - 1),
                         dict(item="SPY pre-tax CAGR", value=(spy.iloc[-1] / spy.iloc[0]) ** (1 / yrs) - 1),
                         dict(item="SPY after dividend tax, gain deferred", value=spy_after ** (1 / yrs) - 1),
                         dict(item="SPY after tax, liquidated at the end", value=spy_after_liq ** (1 / yrs) - 1),
                         dict(item="share of closed trades held <= 365 days", value=(tr.days <= 365).mean())])
    summ.to_csv(D.RESULTS / "taxes.csv", index=False, float_format="%.4f")
    return summ
