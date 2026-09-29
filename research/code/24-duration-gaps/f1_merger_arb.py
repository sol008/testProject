"""Family 1: merger arbitrage in cash deals whose expected close falls within the cap.

Evidence used (single-deal target prices are not in free data: Yahoo drops delisted targets, track 16 section 4.1):
  (a) Investable proxies, total return from Yahoo: The Merger Fund MERFX (1989-), Arbitrage Fund ARBFX (2000-),
      IQ Merger Arbitrage ETF MNA (2009-), ProShares Merger ETF MRGR (2012-), AltShares ARB (2020-).
      Buy-and-hold: excess over T-bills, CAPM alpha / beta / down-market beta (monthly, Newey-West), skew, drawdown,
      split before / after 2008.
  (b) Holding windows of 42 / 63 / 84 sessions (the 60 / 90 / 120-day caps), overlapping, excess over bills:
      mean, Newey-West t, 5th percentile and worst window.  The diversified book earns a roughly constant RATE per
      day held, so the cap changes the per-trade size of the edge, not its rate.
  (c) A timing test with a 3-4 month mechanism: buy the arb proxy after a spread blow-out (fund drawdown from its
      252-session high <= -3% / -5%, or a 21-session loss <= -2% / -3%), hold 42 / 63 / 84 sessions; edge vs an
      era-matched random entry (track 22 placebo).  Design MERFX/ARBFX before 2008, test 2008-2026 (+ MNA).
  (d) Single-deal sizing under the design's rules: notional = 2% stress / break loss; per-trade growth increment
      (6 bp hurdle) and the annual contribution when the stress budget allows 1-2 deals open at a time, for deal
      lengths admitted by each cap (deal durations from f1b_deal_durations.py and Offenberg & Pirinsky 2015).
Outputs: results/f1_*.csv
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import common24 as C  # noqa: E402

FUNDS = {"MERFX": "close", "ARBFX": "close", "MNA": "open", "MRGR": "open", "ARB": "open"}
COST = {"MERFX": 0.0, "ARBFX": 0.0, "MNA": 5.0, "MRGR": 8.0, "ARB": 5.0}      # bp per side (no-load funds: 0)


def monthly(s: pd.Series) -> pd.Series:
    return s.resample("ME").last().pct_change().dropna()


def bh_stats(name: str, px: pd.Series, spx_tr: pd.Series, rf_d: pd.Series, a, b) -> dict:
    p = px.loc[a:b].dropna()
    if len(p) < 300:
        return {}
    r = p.pct_change().dropna()
    rf = rf_d.reindex(r.index).fillna(0)
    yrs = len(r) / 252
    cagr = (p.iloc[-1] / p.iloc[0]) ** (1 / yrs) - 1
    rf_cagr = (1 + rf).prod() ** (1 / yrs) - 1
    eq = p / p.iloc[0]
    mdd = float((eq / eq.cummax() - 1).min())
    rm = monthly(p)
    mm = monthly(spx_tr.loc[a:b])
    rfm = (1 + rf).resample("ME").prod() - 1
    cap = C.capm(rm, mm, rfm.reindex(rm.index).fillna(0))
    # worst-5% S&P months
    j = pd.concat([rm, mm], axis=1, keys=["f", "m"]).dropna()
    q05 = j["m"].quantile(0.05)
    bad = j[j["m"] <= q05]
    return dict(fund=name, start=p.index[0].date(), end=p.index[-1].date(), years=yrs, cagr=cagr, bills=rf_cagr,
                excess=cagr - rf_cagr, vol=r.std() * np.sqrt(252), mdd=mdd, skew_m=float(rm.skew()),
                alpha_yr=cap.get("alpha_yr"), t_alpha=cap.get("t_alpha"), beta=cap.get("beta"),
                beta_down=cap.get("beta_down"), worst5pct_fund=bad["f"].mean(), worst5pct_spx=bad["m"].mean(),
                worst10=C22_worst(p, 10))


def C22_worst(p: pd.Series, H: int) -> float:
    return float((p.shift(-H) / p - 1).min())


def window_table(name: str, df: pd.DataFrame, a, b) -> list[dict]:
    rows = []
    for H in (21,) + C.HOLDS:
        fx = C.C22.fwd_excess(df, H, FUNDS[name], COST[name])
        s = pd.Series(fx, index=df.index).loc[a:b].dropna()
        if len(s) < 250:
            continue
        rows.append(dict(fund=name, period=f"{max(pd.Timestamp(a), s.index[0]).year}-{min(pd.Timestamp(b), df.index[-1]).year}", H=H,
                         n_windows=len(s), mean_excess=s.mean(), rate_yr=s.mean() * 252 / H, nw_t=C.nw_t(s.values, H),
                         share_pos=(s > 0).mean(), p05=s.quantile(0.05), worst=s.min()))
    return rows


def timing_tests(frames: dict) -> pd.DataFrame:
    """Spread blow-out -> buy the arb proxy.  One registry row per (signal, fund, period, H)."""
    rows = []
    variants = {"dd3": ("dd", -0.03), "dd5": ("dd", -0.05), "r21_2": ("r21", -0.02), "r21_3": ("r21", -0.03)}
    periods = {"MERFX": [("design", "1990-01-01", "2007-12-31"), ("test", "2008-01-01", None)],
               "ARBFX": [("design", "2002-01-01", "2007-12-31"), ("test", "2008-01-01", None)],
               "MNA": [("test", "2010-01-01", None)]}
    for fund, pers in periods.items():
        df = frames[fund]
        c = df["aC"]
        hi = c.rolling(252, min_periods=120).max()
        for vname, (kind, lvl) in variants.items():
            cond = (c / hi - 1 <= lvl) if kind == "dd" else (c / c.shift(21) - 1 <= lvl)
            sig = C.first_cross(cond, quiet=20)
            for role, a, b in pers:
                for H in C.HOLDS:
                    tr, st = C.evaluate(df, sig, H, FUNDS[fund], a, b, cost_bps=COST[fund], B=2000)
                    st.update(fund=fund, variant=vname, role=role)
                    rows.append(st)
                    C.Ledger.add("f1_merger_arb", f"{vname}_H{H}", f"{fund} {role}", st.get("n", 0),
                                 st.get("t_edge", np.nan), edge=st.get("edge"), p=st.get("p_placebo"))
    return pd.DataFrame(rows)


def sizing_model(rate_grid=(0.01, 0.02, 0.03, 0.04), breaks=(0.20, 0.30, 0.45)) -> pd.DataFrame:
    """Single cash deal held to completion.  Expected excess over bills per deal = rate x days/365 (the arb premium
    accrues at a roughly constant rate over a deal's life; a break costs the downside d, which the rate already
    prices on average).  Notional so that the break loss is <= 2% of NAV; per-trade dg at kappa 0.5; the SD of a
    deal's outcome is set by the break mix: p_break x d (p_break 5% for 60-120-day deals)."""
    rows = []
    for d in breaks:
        f = min(1.0, C.STRESS_CAP / d)
        for rate in rate_grid:
            for cap, days in ((60, 55), (90, 85), (120, 115)):
                mu = rate * days / 365
                p = 0.05
                sd = np.sqrt(p * (1 - p)) * d
                dg = C.dg_bp(f, C.KAPPA * mu, sd)
                rows.append(dict(break_loss=d, notional=f, rate_yr=rate, cap=cap, days=days, mu_deal=mu,
                                 dg_bp_kappa=dg, passes_6bp=dg >= C.HURDLE_BP))
    return pd.DataFrame(rows)


def main():
    rf_all = C.daily_rf(pd.bdate_range("1985-01-01", "2026-09-28"))
    spx = C.load("^GSPC")["aC"]
    frames = {t: C.yf_frame(t) for t in FUNDS}
    # ARBFX's 2000-01 Yahoo history has +-10-20% one-day reversals (a data error for an arb fund): start in 2002
    # and remove reverting spikes from every fund series.
    for t in frames:
        tk = frames[t].attrs.get("ticker", t)
        frames[t] = C.clean_spikes(frames[t], start="2002-01-01" if t == "ARBFX" else None)
        frames[t].attrs["ticker"] = tk
    # (a) buy-and-hold
    bh = []
    for t, df in frames.items():
        px = df["aC"]
        for a, b in (("1990-01-01", "2007-12-31"), ("2008-01-01", "2026-12-31"), ("1990-01-01", "2026-12-31")):
            if a == "1990-01-01" and b == "2026-12-31" and px.index[0] >= pd.Timestamp("2008-01-01"):
                continue                                   # full period = post-2008 period for young funds
            st = bh_stats(t, px, spx, rf_all, a, b)
            if st:
                st["period"] = f"{max(pd.Timestamp(a), px.index[0]).year}-{min(pd.Timestamp(b), px.index[-1]).year}"
                bh.append(st)
    bh = pd.DataFrame(bh)
    C.save(bh, "f1_fund_buyhold")
    # (b) windows
    wt = []
    for t, df in frames.items():
        for a, b in (("1990-01-01", "2007-12-31"), ("2008-01-01", "2026-12-31")):
            wt += window_table(t, df, a, b)
    wt = pd.DataFrame(wt)
    C.save(wt, "f1_fund_windows")
    # (c) timing
    tt = timing_tests(frames)
    C.save(tt, "f1_timing_tests")
    # (d) sizing
    sz = sizing_model()
    C.save(sz, "f1_single_deal_sizing")
    C.Ledger.save("f1_merger_arb")
    with pd.option_context("display.width", 250, "display.max_columns", 40):
        print(bh.round(4).to_string(index=False))
        print(wt.round(4).to_string(index=False))
        cols = ["fund", "variant", "role", "period", "H", "n", "per_yr", "mean_ex", "base", "edge", "t_edge", "p_placebo", "worst"]
        print(tt[[c for c in cols if c in tt.columns]].round(4).to_string(index=False))
        print(sz[sz.break_loss == 0.30].round(5).to_string(index=False))


if __name__ == "__main__":
    main()
