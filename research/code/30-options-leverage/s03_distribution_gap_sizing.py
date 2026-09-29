"""Questions 2 and 3, plus gap risk.

  dist_rolling.csv        rolling 5y / 10y CAGR minus SPY's, percentiles, P(>= +5 points), P(< 0)
  dist_bootstrap.csv      paired 12-month block bootstrap of monthly returns, 10-year paths (10,000 draws)
  gap_1987_signal.csv     was the weekly 200-day filter "up" going into 19 Oct 1987?
  gap_shock.csv           one-day -20.5% (1987) and -30% index gaps applied to today's positions, IV spiking
  sizing_contracts.csv    whole-contract sizing at $20k / $50k / $100k / $250k (XSP, SPY, QQQ; 28 Sep chains)
  tax_after.csv           after-tax CAGR, taxable account: Section 1256 (XSP) vs ordinary (SPY/QQQ options, ETFs)
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from common30 import OUT, RH_MARGIN_SPREAD, bs_call, load_panel, surface_and_models, yf_close
from engine import FastSurface, Market, Params, simulate

HEAD = ["Buy and hold 1x (SPY)", "Trend 1x (ETF or T-bills)", "Trend 2x, Robinhood margin ($100k tier)",
        "Trend 2x LETF (SSO/QLD)", "Trend 3x LETF (UPRO/TQQQ)", "Buy and hold 3x LETF (no filter)",
        "Trend 2x, deep ITM calls d0.80 6m, roll 6w", "Trend 3x, deep ITM calls d0.80 6m, roll 6w",
        "Trend 2x, deep ITM calls d0.90 12m, roll 8w", "Trend 3x, deep ITM calls d0.90 12m, roll 8w",
        "Trend 2x, deep ITM calls d0.80 6m, roll 6w [real-price surface]",
        "Trend 3x, deep ITM calls d0.80 6m, roll 6w [real-price surface]",
        "Trend 2x, deep ITM calls d0.90 12m, roll 8w [real-price surface]",
        "Trend 3x, deep ITM calls d0.90 12m, roll 8w [real-price surface]",
        "Trend 2x, call debit spread d0.80/0.25 6m", "Trend barbell 90/10, ATM 6m calls",
        "Barbell 80/20, ATM 12m calls, no filter",
        "QQQ: Trend 2x LETF (SSO/QLD)", "QQQ: Trend 3x LETF (UPRO/TQQQ)", "QQQ: Buy and hold 3x LETF (no filter)",
        "QQQ: Trend 3x, deep ITM calls d0.80 6m, roll 6w", "QQQ: Buy and hold 1x (SPY)"]


def rolling_dist(eq: pd.DataFrame) -> pd.DataFrame:
    m = eq.resample("ME").last()
    rows = []
    spy = m["Buy and hold 1x (SPY)"]
    for yrs in (5, 10):
        h = 12 * yrs
        for c in [c for c in HEAD if c in m.columns]:
            s = m[c].dropna()
            if len(s) <= h:
                continue
            cg = (s / s.shift(h)) ** (1 / yrs) - 1
            b = (spy / spy.shift(h)) ** (1 / yrs) - 1
            x = (cg - b.reindex(cg.index)).dropna()
            rows.append(dict(strategy=c, window_years=yrs, n_windows=len(x), p5=x.quantile(0.05),
                             p25=x.quantile(0.25), median=x.median(), p75=x.quantile(0.75), p95=x.quantile(0.95),
                             share_ge_5pts=(x >= 0.05).mean(), share_below_0=(x < 0).mean(),
                             first=str(s.index[h].date())))
    return pd.DataFrame(rows)


def bootstrap(eq: pd.DataFrame, n=10000, years=10, block=12, seed=30) -> pd.DataFrame:
    cols = [c for c in HEAD if c in eq.columns and not c.startswith("QQQ")]
    m = eq[cols].resample("ME").last().pct_change().dropna()
    R = m.values
    T = len(R)
    rng = np.random.default_rng(seed)
    nb = years * 12 // block
    starts = rng.integers(0, T - block, size=(n, nb))
    paths = np.concatenate([R[s:s + block] for s in starts.ravel()]).reshape(n, nb * block, len(cols))
    wealth = np.cumprod(1 + paths, axis=1)
    cagr = wealth[:, -1, :] ** (1 / years) - 1
    peak = np.maximum.accumulate(wealth, axis=1)
    mdd = (wealth / peak - 1).min(axis=1)
    spy = cagr[:, cols.index("Buy and hold 1x (SPY)")]
    rows = []
    for j, c in enumerate(cols):
        x = cagr[:, j] - spy
        rows.append(dict(strategy=c, median_cagr=np.median(cagr[:, j]), p5_excess=np.quantile(x, 0.05),
                         p25_excess=np.quantile(x, 0.25), median_excess=np.median(x),
                         p75_excess=np.quantile(x, 0.75), p95_excess=np.quantile(x, 0.95),
                         p_excess_ge_5pts=(x >= 0.05).mean(), p_excess_below_0=(x < 0).mean(),
                         p_loss_10y=(cagr[:, j] < 0).mean(), median_maxdd=np.median(mdd[:, j]),
                         p_maxdd_worse_50=(mdd[:, j] <= -0.5).mean()))
    return pd.DataFrame(rows)


def gap_1987():
    spx = yf_close("^GSPC")
    ma = spx.rolling(200).mean()
    d = pd.DataFrame({"spx": spx, "ma200": ma, "pct_above": spx / ma - 1}).loc["1987-09-25":"1987-10-23"]
    d["weekday"] = d.index.day_name()
    return d


def gap_shock(panel, surf, variants):
    """Apply a one-day index gap to each vehicle's position as sized on 25 Sep 2026."""
    v = variants["base"]
    fs = FastSurface(surf, v["a1m"], v["a1y"], v["skew_mode"])
    m = Market(panel, "SPX", fs)
    i = len(panel) - 1
    S0 = m.S[i]
    rows = []
    for gap, vix_s, v1y_s, lab in [(-0.205, 80.0, 45.0, "-20.5% day (19 Oct 1987), VIX to 80, VIX1Y to 45"),
                                   (-0.205, None, None, "-20.5% day, implied vols unchanged"),
                                   (-0.30, 100.0, 50.0, "-30% day, VIX to 100, VIX1Y to 50"),
                                   (-0.12, 80.0, 40.0, "-12% day (16 Mar 2020), VIX to 80, VIX1Y to 40")]:
        S1 = S0 * (1 + gap)
        vol1m = vix_s if vix_s else m.v1m[i]
        vol1y = v1y_s if v1y_s else m.v1y[i]

        def px(K, tau, S, v1m_, v1y_):
            r, q = m.r_opt(i, tau), m.q[i]
            F = S * math.exp((r - q) * tau)
            return bs_call(S, K, tau, r, q, fs.iv(v1m_, v1y_, K / F, tau))

        for L in (2, 3):
            rows.append(dict(shock=lab, L=L, vehicle="margin (index ETF)", book_change=L * gap,
                             note=("margin call" if (1 + L * gap) / (L * (1 + gap)) < 0.30 else "no call")
                             if L == 2 else "3x not allowed under Reg T"))
            rows.append(dict(shock=lab, L=L, vehicle="LETF (daily reset)", book_change=max(L * gap, -1.0),
                             note="fund loses L x the day (before any intraday reset)"))
            for d, ten, name in [(0.80, 182, "calls d0.80 6m"), (0.90, 365, "calls d0.90 12m"),
                                 (0.70, 182, "calls d0.70 6m")]:
                K = m.strike_for_delta(i, d, ten)
                tau = ten / 365
                p0 = px(K, tau, S0, m.v1m[i], m.v1y[i])
                from common30 import bs_call_delta
                de = bs_call_delta(S0, K, tau, m.r_opt(i, tau), m.q[i],
                                   fs.iv(m.v1m[i], m.v1y[i], K / (S0 * math.exp((m.r_opt(i, tau) - m.q[i]) * tau)), tau))
                n = L / (de * S0)                     # per $1 of book
                p1 = px(K, tau - 1 / 365, S1, vol1m, vol1y)
                prem = n * p0
                rows.append(dict(shock=lab, L=L, vehicle=name, book_change=n * (p1 - p0),
                                 note=f"premium {prem:.0%} of book, strike {K / S0:.0%} of spot"))
        for f, ten in [(0.10, 182), (0.20, 365)]:
            K = m.strike_for_delta(i, 0.5, ten)
            tau = ten / 365
            p0 = px(K, tau, S0, m.v1m[i], m.v1y[i])
            p1 = px(K, tau - 1 / 365, S1, vol1m, vol1y)
            rows.append(dict(shock=lab, L=np.nan, vehicle=f"barbell {1 - f:.0%}/{f:.0%} ATM {ten // 30}m",
                             book_change=f * (p1 / p0 - 1), note="loss capped at the premium"))
    return pd.DataFrame(rows)


def sizing():
    ext = pd.read_csv(OUT / "chain_calls_extract.csv", parse_dates=["expiry"])
    rows = []
    for root in ("XSP", "SPY", "QQQ"):
        e = ext[ext.root_ == root]
        for target_d, dte_lo, dte_hi, lab in [(0.8, 150, 200, "d0.80 ~6m"), (0.9, 330, 400, "d0.90 ~12m"),
                                             (0.5, 150, 200, "ATM ~6m")]:
            c = e[e.dte.between(dte_lo, dte_hi)]
            if c.empty:
                continue
            c = c.iloc[(c.delta_calc - target_d).abs().argsort()[:1]].iloc[0]
            per_contract_exposure = c.delta_calc * 100 * c.spot
            per_contract_cost = c.ask * 100
            for book in (20_000, 50_000, 100_000, 250_000):
                for L in (2, 3):
                    exact = L * book / per_contract_exposure
                    affordable = int(0.98 * book // per_contract_cost)      # no margin: premium <= the book
                    n = max(min(int(round(exact)), affordable), 0)
                    rows.append(dict(root=root, contract=f"{lab} ({c.expiry.date()} {c.strike:g}C)",
                                     book=book, target_L=L, contracts_exact=exact, contracts=n,
                                     achieved_L=n * per_contract_exposure / book,
                                     premium_pct_book=n * per_contract_cost / book,
                                     exposure_per_contract=per_contract_exposure,
                                     cost_per_contract=per_contract_cost,
                                     step_in_L=per_contract_exposure / book,
                                     spread_cost_round_trip_pct_book=n * (c.ask - c.bid) * 100 / book))
    return pd.DataFrame(rows)


def tax_table(eq: pd.DataFrame, panel) -> pd.DataFrame:
    """Annual-tax approximation for the taxable account (top bracket, federal): each year's net gain is taxed
    at the vehicle's rate, losses carried forward. Section 1256 (XSP): 60% x 20% + 40% x 37% = 26.8% + 3.8% NIIT
    = 30.6%. SPY/QQQ options held < 1 year: 37% + 3.8% = 40.8%. ETF trend spells: long-term (23.8%) for the
    share of gains made in spells longer than a year, short-term otherwise."""
    trend = (panel.spx > panel.ma200_spx)
    spells = (trend != trend.shift()).cumsum()
    lr = np.log(panel.spxtr).diff()
    g = pd.DataFrame({"t": trend, "sp": spells, "lr": lr})[trend]
    s = g.groupby("sp").agg(n=("lr", "size"), lr=("lr", "sum"))
    lt_share = s[s.n > 252].lr.clip(lower=0).sum() / s.lr.clip(lower=0).sum()
    etf_rate = lt_share * 0.238 + (1 - lt_share) * 0.408
    cases = [("Trend 2x, deep ITM calls d0.80 6m, roll 6w", "XSP (Section 1256)", 0.306),
             ("Trend 2x, deep ITM calls d0.80 6m, roll 6w", "SPY options (short-term)", 0.408),
             ("Trend 3x, deep ITM calls d0.80 6m, roll 6w", "XSP (Section 1256)", 0.306),
             ("Trend 2x, deep ITM calls d0.90 12m, roll 8w [real-price surface]", "XSP (Section 1256)", 0.306),
             ("Trend 3x, deep ITM calls d0.90 12m, roll 8w [real-price surface]", "XSP (Section 1256)", 0.306),
             ("Trend 3x, deep ITM calls d0.90 12m, roll 8w [real-price surface]", "SPY options (short-term)", 0.408),
             ("Trend 2x, Robinhood margin ($100k tier)", "ETF, spell-based LT/ST mix", etf_rate),
             ("Trend 2x LETF (SSO/QLD)", "ETF, spell-based LT/ST mix", etf_rate),
             ("Trend 3x LETF (UPRO/TQQQ)", "ETF, spell-based LT/ST mix", etf_rate),
             ("Buy and hold 1x (SPY)", "held, taxed only at the end (LT, 23.8%)", None)]
    rows = []
    y = eq.resample("YE").last()
    for strat, how, rate in cases:
        s = y[strat].dropna()
        start = eq[strat].dropna().iloc[0]
        vals = np.r_[start, s.values]
        if rate is None:
            pre = (vals[-1] / vals[0]) ** (1 / (len(vals) - 1)) - 1
            final = 1 + (vals[-1] / vals[0] - 1) * (1 - 0.238)
            rows.append(dict(strategy=strat, tax_treatment=how, rate=0.238, pre_tax_cagr=pre,
                             after_tax_cagr=final ** (1 / (len(vals) - 1)) - 1))
            continue
        w, carry = 1.0, 0.0
        for a, b in zip(vals[:-1], vals[1:]):
            gain = w * (b / a - 1)
            taxable = gain + carry
            tax = max(taxable, 0.0) * rate
            carry = min(taxable, 0.0)
            w = w + gain - tax
        yrs = len(vals) - 1
        rows.append(dict(strategy=strat, tax_treatment=how, rate=rate,
                         pre_tax_cagr=(vals[-1] / vals[0]) ** (1 / yrs) - 1, after_tax_cagr=w ** (1 / yrs) - 1))
    out = pd.DataFrame(rows)
    out.attrs["lt_share"] = lt_share
    return out


def letf_actual_check(panel, surf, variants) -> pd.DataFrame:
    """Trend-filtered real LETFs (adjusted closes) vs the engine's simulated LETF, same weekly signal/timing."""
    v = variants["base"]
    rows = []
    for tick, und, L, start in [("SSO", "SPX", 2, "2006-07-03"), ("UPRO", "SPX", 3, "2009-07-01"),
                                ("QLD", "NDX", 2, "2006-07-03"), ("TQQQ", "NDX", 3, "2010-03-01")]:
        px = yf_close(tick, field="Adj Close")
        m = Market(panel, und, FastSurface(surf, v["a1m"], v["a1y"], v["skew_mode"]))
        sim = simulate(m, Params("letf", L=L, underlying=und), start, "2026-09-25")["equity"]
        # same positions with the real fund: in the fund on days the simulated book held the LETF
        e = simulate(m, Params("letf", L=L, underlying=und), start, "2026-09-25")
        held = (e["exposure"] > 0.5).shift(1, fill_value=False)
        r_f = px.pct_change().reindex(sim.index).fillna(0)
        rf = pd.Series(m.r3m, index=m.idx).reindex(sim.index).shift(1).fillna(0) / 252
        real = (1 + np.where(held, r_f, rf)).cumprod()
        real = pd.Series(real, index=sim.index)
        yrs = (sim.index[-1] - sim.index[0]).days / 365.25
        rows.append(dict(fund=tick, start=start, sim_cagr=(sim.iloc[-1] / sim.iloc[0]) ** (1 / yrs) - 1,
                         real_cagr=(real.iloc[-1] / real.iloc[0]) ** (1 / yrs) - 1,
                         sim_maxdd=float((sim / sim.cummax() - 1).min()),
                         real_maxdd=float((real / real.cummax() - 1).min()),
                         corr_daily=float(np.corrcoef(sim.pct_change().fillna(0), real.pct_change().fillna(0))[0, 1])))
    return pd.DataFrame(rows)


def main():
    panel = load_panel()
    surf, variants = surface_and_models()
    eq = pd.read_csv(OUT / "equity_weekly.csv.gz", index_col=0, parse_dates=True)
    rd = rolling_dist(eq)
    rd.to_csv(OUT / "dist_rolling.csv", index=False, float_format="%.4f")
    bs = bootstrap(eq)
    bs.to_csv(OUT / "dist_bootstrap.csv", index=False, float_format="%.4f")
    g87 = gap_1987()
    g87.to_csv(OUT / "gap_1987_signal.csv", float_format="%.4f")
    gs = gap_shock(panel, surf, variants)
    gs.to_csv(OUT / "gap_shock.csv", index=False, float_format="%.4f")
    sz = sizing()
    sz.to_csv(OUT / "sizing_contracts.csv", index=False, float_format="%.4f")
    tx = tax_table(eq, panel)
    tx.to_csv(OUT / "tax_after.csv", index=False, float_format="%.4f")
    la = letf_actual_check(panel, surf, variants)
    la.to_csv(OUT / "letf_actual_check.csv", index=False, float_format="%.4f")
    print(la.round(4).to_string(index=False))
    with pd.option_context("display.width", 250, "display.max_rows", 300, "display.max_columns", 30):
        print(rd.round(3).to_string(index=False))
        print(bs.round(3).to_string(index=False))
        print(g87.round(4).to_string())
        print(gs.round(3).to_string(index=False))
        print(sz.round(3).to_string(index=False))
        print(tx.round(4).to_string(index=False), "LT share of trend-spell gains:", round(tx.attrs["lt_share"], 3))
    print("Robinhood margin spreads over Fed upper bound:", RH_MARGIN_SPREAD)


if __name__ == "__main__":
    main()
