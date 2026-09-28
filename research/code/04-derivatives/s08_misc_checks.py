"""Miscellaneous checks used in the report.

 (a) Does "implied below forecast realised vol" help 1-year calls? (IV-vs-forecast test)
 (b) SPX box-spread implied financing rate from the 2026-09-28 chain
 (c) Deep-ITM LEAPS "stock replacement": what the embedded put (time value) costs
 (d) Current regime snapshot (for illustration only)
 (e) Spreads built from same-date legs of the s02 trades (call/put spreads, risk reversal)
 (f) "Few trades" variant: one 1-year call per year (January), f% of equity
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import DATA_DIR, OUT, bs_delta, bs_price

CHAIN = DATA_DIR / "chain_raw_20260928.csv"


def iv_vs_forecast():
    t = pd.read_csv(OUT / "options_backtest_trades.csv.gz", parse_dates=["entry", "expiry"])
    p = pd.read_csv(OUT / "vrp_panel.csv.gz", index_col=0, parse_dates=True)
    r = p.r
    p["rv_past252"] = np.sqrt(252 * (r ** 2).rolling(252).mean()) * 100
    # simple forecast: average of 21d, 63d, 252d trailing realised (a HAR-style blend)
    p["rv_fcst"] = (p.rv_past21 + p.rv_past63 + p.rv_past252) / 3
    rows = []
    for (kind, mny, ten) in [("call", 1.0, 365), ("call", 1.05, 365), ("call", 1.10, 730), ("put", 0.90, 365)]:
        sub = t[(t.variant == "base") & (t.kind == kind) & np.isclose(t.mny, mny) & (t.tenor == ten)].copy()
        # ATM-equivalent IV of that entry date = iv of the ATM 1y call trade on the same date
        atm = t[(t.variant == "base") & (t.kind == "call") & np.isclose(t.mny, 1.0) & (t.tenor == 365)].set_index("entry").iv0
        sub["atm_iv"] = sub.entry.map(atm) * 100
        sub["fcst"] = sub.entry.map(p.rv_fcst)
        sub["spread"] = sub.atm_iv - sub.fcst
        sub = sub.dropna(subset=["spread"])
        sub["tercile"] = pd.qcut(sub.spread, 3, labels=["IV cheap vs forecast", "middle", "IV rich vs forecast"])
        for per, s2 in [("IS", sub[sub.entry <= "2007-12-31"]), ("OOS", sub[sub.entry >= "2008-01-01"]), ("ALL", sub)]:
            g = s2.groupby("tercile", observed=True)
            for terc, x in g:
                rows.append(dict(instrument=f"{kind} {mny:.2f} {ten}d", period=per, bucket=terc, n=len(x),
                                 mean_spread_volpts=x.spread.mean(), mean_R_hold=x.R_hold.mean(),
                                 median_R_hold=x.R_hold.median(), mean_dh_pct_cost=x.dh_pct_cost.mean()))
    out = pd.DataFrame(rows)
    out.to_csv(OUT / "iv_vs_forecast_terciles.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 220, "display.max_rows", 100):
        print(out.round(3).to_string(index=False))
    # how often is 1-month implied below the forecast at all?
    pp = p.dropna(subset=["rv_fcst", "vix"])
    print(f"\nShare of days VIX < HAR-style forecast of realised vol: {(pp.vix < pp.rv_fcst).mean():.1%}")
    print(f"Share of days 0.88*VIX (ATM proxy) < forecast: {(0.88*pp.vix < pp.rv_fcst).mean():.1%}")


def box_rate():
    d = pd.read_csv(CHAIN)
    s = d[d.ticker == "^SPX"]
    out = []
    for days, g in s.groupby("days"):
        c = g[g.kind == "call"].set_index("strike")
        pu = g[g.kind == "put"].set_index("strike")
        ks = sorted(set(c.index) & set(pu.index))
        spot = g.spot.iloc[0]
        ks = [k for k in ks if 0.8 * spot <= k <= 1.2 * spot]
        if len(ks) < 4:
            continue
        # use pairs roughly 10% apart around spot
        rates = []
        for k1 in ks:
            for k2 in ks:
                if k2 - k1 < 0.08 * spot or k2 - k1 > 0.25 * spot:
                    continue
                box_mid = (c.loc[k1, "mid"] - pu.loc[k1, "mid"]) - (c.loc[k2, "mid"] - pu.loc[k2, "mid"])
                box_ask = (c.loc[k1, "ask"] - pu.loc[k1, "bid"]) - (c.loc[k2, "bid"] - pu.loc[k2, "ask"])
                T = days / 365.0
                if box_mid <= 0:
                    continue
                rates.append((-np.log(box_mid / (k2 - k1)) / T, -np.log(box_ask / (k2 - k1)) / T))
        if rates:
            rr = np.array(rates)
            out.append(dict(days=days, n_pairs=len(rr), implied_rate_mid=np.median(rr[:, 0]),
                            implied_rate_if_lend_at_ask=np.median(rr[:, 1]), r_curve_used=g.r.iloc[0]))
    out = pd.DataFrame(out)
    out.to_csv(OUT / "spx_box_rates_20260928.csv", index=False, float_format="%.4f")
    print("\nSPX box-spread implied rates (2026-09-28 snapshot)\n", out.round(4).to_string(index=False))


def stock_replacement():
    d = pd.read_csv(CHAIN)
    s = d[(d.ticker == "^SPX")]
    rows = []
    for days in sorted(s.days.unique()):
        if days < 250:
            continue
        g = s[s.days == days]
        spot, F, r, T = g.spot.iloc[0], g.F.iloc[0], g.r.iloc[0], g["T"].iloc[0]
        q_impl = r - np.log(F / spot) / T
        for mny in (0.70, 0.75, 0.80, 0.85, 0.90):
            cc = g[(g.kind == "call")]
            pp = g[(g.kind == "put")]
            kc = cc.iloc[(cc.strike - mny * spot).abs().argsort()[:1]]
            if len(kc) == 0:
                continue
            K = float(kc.strike.iloc[0])
            prow = pp[pp.strike == K]
            call_mid = float(kc["mid"].iloc[0])
            put_mid = float(prow["mid"].iloc[0]) if len(prow) else np.nan
            iv = float(kc.iv_mid.iloc[0])
            delta = float(bs_delta(spot, K, T, r, q_impl, iv, "call"))
            rows.append(dict(days=days, strike=K, k_over_spot=K / spot, call_mid=call_mid,
                             call_spread_pct=float(kc.spread_pct_mid.iloc[0]), iv_mid=iv, delta=delta,
                             notional_leverage=delta * spot / call_mid,
                             embedded_put_mid=put_mid, embedded_put_pct_spot_per_year=put_mid / spot / T,
                             put_iv=float(prow.iv_mid.iloc[0]) if len(prow) else np.nan))
    out = pd.DataFrame(rows)
    out.to_csv(OUT / "spx_stock_replacement_20260928.csv", index=False, float_format="%.4f")
    print("\nDeep-ITM SPX calls as stock replacement (2026-09-28)\n", out.round(4).to_string(index=False))


def regime_now():
    p = pd.read_csv(OUT / "vrp_panel.csv.gz", index_col=0, parse_dates=True)
    last = p.iloc[-1]
    cols = ["spx", "vix", "vix3m", "vix9d", "vix6m", "vix1y", "vvix", "skew", "rv_past21", "rv_past63", "trend200",
            "ret21", "vix_pct252", "ts3m", "ts9d", "iv_minus_past", "baa", "dbaa21", "hy"]
    snap = last[cols]
    print("\nLatest regime snapshot", p.index[-1].date())
    print(snap.round(3).to_string())
    snap.to_frame("value").to_csv(OUT / "regime_snapshot.csv", float_format="%.4f")



def spreads_from_trades():
    """Combine same-date legs of the base-variant trades into spreads (hold to expiry).
    Long leg paid at mid*(1+h); short leg sold at mid*(1-h); h = 2% (base)."""
    h = 0.02
    t = pd.read_csv(OUT / "options_backtest_trades.csv.gz", parse_dates=["entry", "expiry"])
    t = t[(t.variant == "base") & (t.tenor == 365)]
    leg = {(k, round(m, 2)): g.set_index("entry") for (k, m), g in t.groupby(["kind", t.mny.round(2)])}
    rows = []

    def add(name, longk, shortk, kind_of_return="debit"):
        L, S = leg[longk], leg[shortk]
        idx = L.index.intersection(S.index)
        L, S = L.loc[idx], S.loc[idx]
        mid_L, mid_S = L.cost / (1 + h), S.cost / (1 + h)
        debit = mid_L * (1 + h) - mid_S * (1 - h)
        pay = L.payoff - S.payoff
        R = pay / debit - 1
        for per, sl in [("IS 1990-2007", idx <= "2007-12-31"), ("OOS 2008-2025", idx >= "2008-01-01"), ("ALL", idx == idx)]:
            x = R[sl]
            rows.append(dict(structure=name, period=per, n=len(x), mean=x.mean(), median=x.median(), hit=(x > 0).mean(),
                             max_multiple=(1 + x).max(), debit_pct_spot=(debit[sl] / L.S0[sl]).mean()))

    add("1y call spread 100/110", ("call", 1.0), ("call", 1.1))
    add("1y call spread 105/110", ("call", 1.05), ("call", 1.1))
    add("1y put spread 95/90", ("put", 0.95), ("put", 0.9))
    out = pd.DataFrame(rows)
    # risk reversal: short 90 put, long 110 call -> P&L per unit of spot (needs margin)
    P, C = leg[("put", 0.9)], leg[("call", 1.1)]
    idx = P.index.intersection(C.index)
    P, C = P.loc[idx], C.loc[idx]
    credit = P.cost / (1 + h) * (1 - h) - C.cost
    pnl = (credit - P.payoff + C.payoff) / C.S0
    rr = []
    for per, sl in [("IS 1990-2007", idx <= "2007-12-31"), ("OOS 2008-2025", idx >= "2008-01-01"), ("ALL", idx == idx)]:
        x = pnl[sl]
        rr.append(dict(structure="1y risk reversal: short 90% put / long 110% call (P&L % of spot)", period=per,
                       n=len(x), mean_pnl_pct_spot=x.mean(), median=x.median(), worst=x.min(), best=x.max(),
                       hit=(x > 0).mean()))
    rr = pd.DataFrame(rr)
    out.to_csv(OUT / "spreads_from_trades.csv", index=False, float_format="%.4f")
    rr.to_csv(OUT / "risk_reversal_from_trades.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 220):
        print(out.round(3).to_string(index=False))
        print(rr.round(3).to_string(index=False))
    # best single-trade multiples for the outright legs (context for 'max multiple')
    allt = pd.read_csv(OUT / "options_backtest_trades.csv.gz", parse_dates=["entry"])
    b = allt[allt.variant == "base"]
    best = b.groupby(["kind", "mny", "tenor"]).agg(best_R=("R_hold", "max"), p99=("R_hold", lambda x: x.quantile(0.99)),
                                                  best_entry=("R_hold", lambda x: b.loc[x.idxmax(), "entry"].date()))
    print(best.round(2).to_string())
    best.to_csv(OUT / "best_multiples.csv", float_format="%.3f")



def one_trade_per_year():
    """'Few trades' variant: one 1-year SPX call bought on the first trading day of each
    January, f% of equity in premium, rest in 1y T-bills; compare with SPX TR."""
    from common import fred, yf_close
    t = pd.read_csv(OUT / "options_backtest_trades.csv.gz", parse_dates=["entry", "expiry"])
    t = t[(t.variant == "base") & (t.tenor == 365) & (t.kind == "call") & (t.entry.dt.month == 1)]
    tr = yf_close("^SP500TR", start="1988-01-01")
    rows = []
    for mny in (1.0, 1.05, 1.10):
        x = t[np.isclose(t.mny, mny)].set_index("entry").sort_index()
        for f in (0.10, 0.20, 0.30, 0.50):
            eq = 1.0
            path = []
            for d, r in x.iterrows():
                eq *= 1 + f * r.R_hold + (1 - f) * r.r0
                path.append(eq)
            path = np.array(path)
            yrs = len(path)
            dd = (path / np.maximum.accumulate(np.r_[1.0, path])[1:] - 1).min()
            rows.append(dict(call=f"1y {mny:.2f}", f=f, years=yrs, first=x.index[0].date(), last=x.index[-1].date(),
                             cagr=path[-1] ** (1 / yrs) - 1, worst_year_end_dd=dd,
                             per_trade_mean=x.R_hold.mean(), per_trade_median=x.R_hold.median(),
                             hit=(x.R_hold > 0).mean(),
                             mean_IS=x[x.index <= "2007-12-31"].R_hold.mean(),
                             mean_OOS=x[x.index >= "2008-01-01"].R_hold.mean()))
    out = pd.DataFrame(rows)
    b = tr.loc[t.entry.min():t.expiry.max()]
    print(f"SPX TR CAGR over same span: {(b.iloc[-1]/b.iloc[0])**(365.25/(b.index[-1]-b.index[0]).days)-1:.3f}")
    out.to_csv(OUT / "one_trade_per_year.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 220):
        print(out.round(3).to_string(index=False))


if __name__ == "__main__":
    iv_vs_forecast()
    box_rate()
    stock_replacement()
    regime_now()
    spreads_from_trades()
    one_trade_per_year()
