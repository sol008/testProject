"""Part 1: time-series momentum and breakout trend with 1-60 day holds, across asset classes.

Design sample: long-history synthetic futures excess returns, 1962-2007 (assets.long_universe).
Test sample:   (a) the same construction 2008-2026; (b) tradable ETF proxies 2008-2026 (assets.etf_universe).
Live evidence: managed-futures mutual funds / ETFs.

Rules (all volatility-scaled, per-asset vol target sigma_a = 10%/sqrt(N_active), EWMA vol com=60d,
signal at close t, trade at close t+1):
  TSMOM(L, H): sign of trailing L-day excess return, re-decided every H trading days (H<=42 ~ 60 calendar days).
  BLEND(H):    average of the four TSMOM signs (L=21,63,126,252).
  BRK(N):      enter on a close above the prior N-day high (below the N-day low for shorts),
               exit on the N/2-day opposite extreme or after 42 trading days (time stop).
  LO-*:        long-only variants (flat instead of short), for accounts that cannot short.
Costs: one-way bp per unit of notional traded (futures table in assets.FUT_COST_BP, ETF table in
assets.ETF_UNIVERSE), futures roll costs (2 x one-way per roll), ETF short-borrow costs.
"""
from __future__ import annotations

import itertools
import json
import math

import numpy as np
import pandas as pd

import assets as A
import common as C

MAXHOLD = 42          # trading days ~ 60 calendar days
LAG = 1               # execute one day after the signal close
PORT_VOL = 0.10


def ewma_vol(R: pd.DataFrame, com: int = 60) -> pd.DataFrame:
    v = (R ** 2).ewm(com=com, min_periods=40).mean()
    return np.sqrt(v * 252)


def cost_vectors(cols, cls, kind: str):
    if kind == "etf":
        c = pd.Series({k: A.ETF_UNIVERSE[k][1] / 1e4 for k in cols})
        borrow = pd.Series({k: A.ETF_UNIVERSE[k][2] / 100 for k in cols})
        roll = pd.Series(0.0, index=cols)
    else:
        c = pd.Series({k: A.FUT_COST_BP[cls[k]] / 1e4 for k in cols})
        borrow = pd.Series(0.0, index=cols)
        rp = {k: A.ROLLS_PER_YEAR["GOLD" if k == "GOLD" else cls[k]] for k in cols}
        roll = pd.Series({k: 2 * c[k] * rp[k] for k in cols})  # annual cost per unit |w|
    return c, borrow, roll


def n_active(R: pd.DataFrame, L: int = 252) -> pd.Series:
    """Number of assets with at least L days of history (eligible for signals)."""
    avail = R.notna().cumsum() >= L
    return avail.sum(axis=1).clip(lower=1)


def tsmom_weights(R, L_list, H, long_only=False, cap=4.0):
    P = (1 + R.fillna(0)).cumprod().where(R.notna().cumsum() > 0)
    vol = ewma_vol(R)
    N = n_active(R)
    vt = (PORT_VOL / np.sqrt(N))
    sig = 0
    for L in L_list:
        m = P / P.shift(L) - 1
        sig = sig + np.sign(m).fillna(0)
    sig = sig / len(L_list)
    if long_only:
        sig = sig.clip(lower=0)
    elig = R.notna().cumsum() >= max(L_list) + 1
    w = (sig * np.minimum(vt.values[:, None] / vol, cap)).where(elig).fillna(0)
    reb = np.zeros(len(R), dtype=bool)
    reb[::H] = True
    wt = w.where(pd.Series(reb, index=R.index), np.nan).ffill().fillna(0)
    return wt, sig.where(elig)


def breakout_weights(R, N, long_only=False, cap=4.0, maxhold=MAXHOLD):
    P = (1 + R.fillna(0)).cumprod().where(R.notna().cumsum() > 0)
    vol = ewma_vol(R)
    Nact = n_active(R)
    vt = (PORT_VOL / np.sqrt(Nact)).values
    W = np.zeros(R.shape)
    trades = []
    ex = max(2, N // 2)
    for j, c in enumerate(R.columns):
        p = P[c].values
        hi = pd.Series(p).rolling(N).max().shift(1).values
        lo = pd.Series(p).rolling(N).min().shift(1).values
        hx = pd.Series(p).rolling(ex).max().shift(1).values
        lx = pd.Series(p).rolling(ex).min().shift(1).values
        v = vol[c].values
        pos, size, t0 = 0, 0.0, 0
        for t in range(len(p)):
            if np.isnan(p[t]) or np.isnan(hi[t]) or np.isnan(v[t]):
                W[t, j] = 0.0
                continue
            if pos != 0:
                held = t - t0
                stop = (pos > 0 and p[t] < lx[t]) or (pos < 0 and p[t] > hx[t])
                if stop or held >= maxhold:
                    trades.append((c, R.index[t0], R.index[t], pos, size))
                    pos, size = 0, 0.0
            if pos == 0:
                if p[t] > hi[t]:
                    pos, t0 = 1, t
                elif p[t] < lo[t] and not long_only:
                    pos, t0 = -1, t
                if pos != 0:
                    size = min(vt[t] / v[t], cap)
            W[t, j] = pos * size
        if pos != 0:
            trades.append((c, R.index[t0], R.index[-1], pos, size))
    return pd.DataFrame(W, index=R.index, columns=R.columns), trades


def run_portfolio(R, Wsig, costs, borrow, roll):
    """Wsig: weights decided at close t (target). Executed at close t+LAG, earn from t+LAG+1."""
    Wx = Wsig.shift(LAG).fillna(0)                 # held position after execution at close t+LAG
    gross = (Wx.shift(1) * R.fillna(0)).sum(axis=1)
    turn = Wx.diff().abs().fillna(Wx.abs())
    tc = (turn * costs).sum(axis=1)
    bc = (Wx.shift(1).clip(upper=0).abs() * borrow).sum(axis=1) / 252
    rc = (Wx.shift(1).abs() * roll).sum(axis=1) / 252
    net = gross - tc - bc - rc
    return pd.DataFrame({"gross": gross, "net": net, "tcost": tc, "borrow": bc, "rollcost": rc,
                         "turnover": turn.sum(axis=1), "npos": (Wx.abs() > 1e-9).sum(axis=1),
                         "gross_lev": Wx.abs().sum(axis=1)})


def period_trades(R, Wsig, H):
    """Per-asset 'trades' for TSMOM = each rebalance holding period with a non-zero position.
    Return = unlevered notional return in the signal direction over the period, net of a round trip
    only when the position direction changes (continuations roll without cost)."""
    Wx = Wsig.shift(LAG).fillna(0)
    S = np.sign(Wx)
    reb = np.zeros(len(R), dtype=bool)
    reb[::H] = True
    reb_idx = np.where(reb)[0] + LAG
    rows = []
    Rf = R.fillna(0).values
    for j, c in enumerate(R.columns):
        prev = 0
        for a, b in zip(reb_idx[:-1], reb_idx[1:]):
            if a >= len(R):
                break
            s = S.iat[a, j]
            if s != 0:
                seg = Rf[a + 1:b + 1, j]
                ret = np.prod(1 + s * seg) - 1          # daily-rebalanced long/short notional return
                rows.append((c, R.index[a], R.index[min(b, len(R) - 1)], int(s), float(ret), s != prev))
            prev = s
    return pd.DataFrame(rows, columns=["asset", "entry", "exit", "dir", "ret", "new"])


def brk_trade_returns(R, trades, costs):
    rows = []
    Rf = R.fillna(0)
    for c, t0, t1, pos, size in trades:
        # executed with LAG: earn from t0+LAG+1 through t1+LAG
        i0 = R.index.get_loc(t0) + LAG + 1
        i1 = R.index.get_loc(t1) + LAG
        seg = Rf[c].values[i0:i1 + 1]
        if len(seg) == 0:
            continue
        ret = np.prod(1 + pos * seg) - 1 - 2 * costs[c]
        rows.append((c, t0, t1, pos, float(ret), len(seg)))
    return pd.DataFrame(rows, columns=["asset", "entry", "exit", "dir", "ret", "days"])


def summarize(out: pd.DataFrame, a: str, b: str, scale: float = 1.0) -> dict:
    x = out.loc[a:b]
    if len(x) < 50:
        return {}
    net = x["net"] * scale
    p = C.perf(net, af=252)
    yrs = (x.index[-1] - x.index[0]).days / 365.25
    p.update({"gross_sharpe": C.perf(x["gross"], af=252).get("sharpe"),
              "cost_%yr": round(100 * scale * (x["tcost"] + x["borrow"] + x["rollcost"]).sum() / yrs, 2),
              "turnover_x_yr": round(scale * x["turnover"].sum() / yrs, 1),
              "avg_positions": round(x["npos"].mean(), 1),
              "avg_gross_lev": round(scale * x["gross_lev"].mean(), 2)})
    return p


MICRO = ["SPX", "CCMP", "UST10", "GOLD", "CL", "EUR", "JPY", "AUD"]


def micro_universe(RL: pd.DataFrame) -> pd.DataFrame:
    RM = RL[MICRO].copy()
    uso = C.yf_close("USO")["USO"].pct_change(fill_method=None)
    uso = uso - C.rf_on(uso.index, "trading")
    last = RM["CL"].last_valid_index()
    ext = uso[uso.index > last].reindex(RM.index[RM.index > last])
    RM.loc[ext.index, "CL"] = ext.fillna(0.0).values
    return RM


def single_asset_table(RL: pd.DataFrame, cls: dict) -> pd.DataFrame:
    """TSMOM L252/H21 and BRK N50 on each asset separately (unit vol target), design vs test Sharpe."""
    rows = []
    costs, borrow, roll = cost_vectors(RL.columns, cls, "fut")
    for c in RL.columns:
        R1 = RL[[c]]
        for name, fn in [("TSMOM L252 H21", lambda R: tsmom_weights(R, [252], 21)[0]),
                         ("BRK N50", lambda R: breakout_weights(R, 50)[0])]:
            W = fn(R1)
            out = run_portfolio(R1, W, costs[[c]], borrow[[c]], roll[[c]])
            for per, a, b in [("design", "1971-01-01", "2007-12-31"), ("test", "2008-01-01", "2026-09-28")]:
                p = C.perf(out["net"].loc[a:b], af=252)
                if p and p.get("vol_%", 0) > 0:
                    flips = (np.sign(W[c].loc[a:b]).diff().abs() > 0).sum() / max(p["years"], 0.1)
                    rows.append({"asset": c, "class": cls[c], "rule": name, "period": per, "sharpe": p["sharpe"],
                                 "entries_per_yr": round(flips, 1), "years": p["years"]})
    return pd.DataFrame(rows)


def variants():
    V = []
    for L, H in itertools.product([21, 63, 126, 252], [5, 21, 42]):
        V.append(("TSMOM", f"TSMOM L{L} H{H}", dict(L_list=[L], H=H)))
    V.append(("TSMOM", "BLEND H21", dict(L_list=[21, 63, 126, 252], H=21)))
    V.append(("TSMOM", "BLEND H42", dict(L_list=[21, 63, 126, 252], H=42)))
    for N in [20, 50, 100]:
        V.append(("BRK", f"BRK N{N}", dict(N=N)))
    V.append(("TSMOM", "LO-TSMOM L252 H21", dict(L_list=[252], H=21, long_only=True)))
    V.append(("TSMOM", "LO-BLEND H21", dict(L_list=[21, 63, 126, 252], H=21, long_only=True)))
    V.append(("BRK", "LO-BRK N50", dict(N=50, long_only=True)))
    return V


def run_universe(R, cls, kind):
    costs, borrow, roll = cost_vectors(R.columns, cls, kind)
    res = {}
    for fam, name, kw in variants():
        if fam == "TSMOM":
            W, sig = tsmom_weights(R, kw["L_list"], kw["H"], long_only=kw.get("long_only", False))
            out = run_portfolio(R, W, costs, borrow, roll)
            tr = period_trades(R, W, kw["H"])
            tr["ret"] = tr["ret"] - np.where(tr["new"], 2 * tr["asset"].map(costs), 0.0)
        else:
            W, trades = breakout_weights(R, kw["N"], long_only=kw.get("long_only", False))
            out = run_portfolio(R, W, costs, borrow, roll)
            tr = brk_trade_returns(R, trades, costs)
        res[name] = (out, tr, W)
    return res


def fund_stats():
    funds = ["RYMFX", "AQMIX", "ASFYX", "AMFAX", "WTMF", "PQTAX", "DBMF", "KMLM", "CTA"]
    px = C.yf_close(funds + ["SPY"], adjusted=True)
    r = px.pct_change(fill_method=None)
    rf = C.rf_on(r.index, "trading")
    rows = []
    for f in funds:
        x = r[f].dropna()
        x = x[x.index >= x.index[0] + pd.Timedelta(days=5)]
        p = C.perf(x - rf.reindex(x.index), af=252)
        eq = (1 + x).cumprod()
        yrs = (x.index[-1] - x.index[0]).days / 365.25
        spy = r["SPY"].reindex(x.index)
        beta = np.cov(x.fillna(0), spy.fillna(0))[0, 1] / spy.var()
        rows.append({"fund": f, "start": str(x.index[0].date()), "years": round(yrs, 1),
                     "CAGR_%": round(100 * (eq.iloc[-1] ** (1 / yrs) - 1), 2),
                     "excess_ret_%": p["ann_ret_%"], "vol_%": p["vol_%"], "sharpe": p["sharpe"],
                     "maxDD_%": round(100 * (eq / eq.cummax() - 1).min(), 1), "beta_SPY": round(beta, 2),
                     "bills_CAGR_%": round(100 * ((1 + rf.reindex(x.index)).prod() ** (1 / yrs) - 1), 2)})
    # calendar-year returns (NaN before each fund's first full year)
    yr = (1 + r[funds]).groupby(r.index.year).prod() - 1
    for f in funds:
        first = r[f].first_valid_index()
        yr.loc[yr.index < first.year + (0 if first.month == 1 else 1), f] = np.nan
    yr = yr[yr.index >= 2008]
    return pd.DataFrame(rows).set_index("fund"), (100 * yr).round(1), r


def main():
    RL, clsL = A.long_universe()
    RE, clsE = A.etf_universe(start="2004-01-01")
    resL = run_universe(RL, clsL, "fut")
    resE = run_universe(RE, clsE, "etf")

    rows = []
    for name, (out, tr, W) in resL.items():
        d = summarize(out, "1971-01-01", "2007-12-31")
        scale = PORT_VOL / (d["vol_%"] / 100) if d else 1.0
        for per, a, b in [("design 1971-2007", "1971-01-01", "2007-12-31"), ("test 2008-2026", "2008-01-01", "2026-09-28"),
                          ("since 2010", "2010-01-01", "2026-09-28"), ("post-pub 2013-2026", "2013-01-01", "2026-09-28")]:
            s = summarize(out, a, b, scale)
            s.update({"variant": name, "universe": "LONG (synthetic futures)", "period": per, "scale": round(scale, 2)})
            rows.append(s)
    for name, (out, tr, W) in resE.items():
        d = summarize(out, "2008-01-01", "2026-09-28")
        # no pre-2008 ETF history to calibrate on: scaled ex-post to 10% vol (Sharpe unaffected)
        scale = PORT_VOL / (d["vol_%"] / 100) if d else 1.0
        for per, a, b in [("test 2008-2026", "2008-01-01", "2026-09-28"), ("since 2010", "2010-01-01", "2026-09-28"),
                          ("post-pub 2013-2026", "2013-01-01", "2026-09-28")]:
            s = summarize(out, a, b, scale)
            s.update({"variant": name, "universe": "ETF (tradable)", "period": per, "scale": round(scale, 2)})
            rows.append(s)
    # realistic micro-futures portfolio (markets with CME micro contracts), synthetic series;
    # crude oil after the EIA data end (2024-04) is spliced with USO excess returns
    RM = micro_universe(RL)
    resM = run_universe(RM, clsL, "fut")
    for name, (out, tr, W) in resM.items():
        d = summarize(out, "1990-01-01", "2007-12-31")
        scale = PORT_VOL / (d["vol_%"] / 100) if d else 1.0
        for per, a, b in [("design 1990-2007", "1990-01-01", "2007-12-31"), ("test 2008-2026", "2008-01-01", "2026-09-28"),
                          ("since 2010", "2010-01-01", "2026-09-28"), ("post-pub 2013-2026", "2013-01-01", "2026-09-28")]:
            s = summarize(out, a, b, scale)
            s.update({"variant": name, "universe": "MICRO8 (micro-futures markets)", "period": per, "scale": round(scale, 2)})
            rows.append(s)
    T = pd.DataFrame(rows)
    C.save(T, "p1_trend_summary.csv")

    # decade table for selected variants (LONG universe, design-scaled)
    dec_rows = []
    for name in ["TSMOM L252 H21", "TSMOM L63 H21", "TSMOM L21 H21", "BLEND H21", "BRK N20", "BRK N50", "BRK N100"]:
        out = resL[name][0]
        d = summarize(out, "1971-01-01", "2007-12-31")
        scale = PORT_VOL / (d["vol_%"] / 100)
        for dec, a, b in C.DECADES:
            s = summarize(out, a + "-01-01", b + "-12-31", scale)
            if s:
                dec_rows.append({"variant": name, "decade": dec, "ann_ret_%": s["ann_ret_%"], "sharpe": s["sharpe"],
                                 "maxDD_%": s["maxDD_%"], "cost_%yr": s["cost_%yr"]})
    D = pd.DataFrame(dec_rows)
    C.save(D, "p1_trend_decades.csv")

    SA = single_asset_table(RL, clsL)
    C.save(SA, "p1_single_asset.csv")

    # per-trade statistics (unlevered notional returns per asset-trade) by period
    trows = []
    for uni, res in [("LONG", resL), ("ETF", resE), ("MICRO8", resM)]:
        for name, (out, tr, W) in res.items():
            for per, a, b in [("design", "1971-01-01", "2007-12-31"), ("test", "2008-01-01", "2026-09-28")]:
                x = tr[(tr["entry"] >= a) & (tr["entry"] <= b)]
                if len(x) < 20:
                    continue
                yrs = (pd.Timestamp(b) - max(pd.Timestamp(a), out.index[out["npos"] > 0][0])).days / 365.25
                st = C.trade_stats(x["ret"], yrs)
                st.update({"universe": uni, "variant": name, "period": per,
                           "new_positions_per_yr": round(x["new"].sum() / yrs, 1) if "new" in x else st["per_yr"],
                           "avg_days": round(x["days"].mean(), 1) if "days" in x else None,
                           "long_share_%": round(100 * (x["dir"] > 0).mean(), 1)})
                trows.append(st)
    TT = pd.DataFrame(trows)
    C.save(TT, "p1_trend_trades.csv")

    # per asset class split for the key variants (test period, LONG + ETF)
    cls_rows = []
    for uni, res, cls in [("LONG", resL, clsL), ("ETF", resE, clsE)]:
        for name in ["TSMOM L252 H21", "BLEND H21", "BRK N50"]:
            out, tr, W = res[name]
            Wx = W.shift(LAG).fillna(0)
            R = RL if uni == "LONG" else RE
            for k in sorted(set(cls.values())):
                cols = [c for c in R.columns if cls[c] == k]
                g = (Wx[cols].shift(1) * R[cols].fillna(0)).sum(axis=1)
                for per, a, b in [("design", "1971-01-01", "2007-12-31"), ("test", "2008-01-01", "2026-09-28")]:
                    p = C.perf(g.loc[a:b], af=252)
                    if p:
                        cls_rows.append({"universe": uni, "variant": name, "class": k, "period": per,
                                         "gross_ret_%": p["ann_ret_%"], "sharpe": p["sharpe"]})
    CL = pd.DataFrame(cls_rows)
    C.save(CL, "p1_trend_by_class.csv")

    # managed futures funds, and correlation with our ETF/LONG strategy
    FS, FY, fr = fund_stats()
    C.save(FS, "p1_mf_funds.csv")
    C.save(FY, "p1_mf_funds_calendar.csv")
    corr = {}
    for f in ["AQMIX", "DBMF", "KMLM"]:
        x = fr[f].dropna()
        for uni, res in [("LONG", resL), ("ETF", resE)]:
            s = res["TSMOM L252 H21"][0]["net"]
            j = pd.concat([x, s], axis=1).dropna()
            m = (1 + j).resample("ME").prod() - 1
            corr[f"{f}~{uni} TSMOM L252 H21 (monthly)"] = round(float(m.corr().iloc[0, 1]), 2)
            s2 = res["BLEND H21"][0]["net"]
            j = pd.concat([x, s2], axis=1).dropna()
            m = (1 + j).resample("ME").prod() - 1
            corr[f"{f}~{uni} BLEND H21 (monthly)"] = round(float(m.corr().iloc[0, 1]), 2)
    C.save(corr, "p1_mf_corr.json")

    # data-mining haircut on the test period (all variants on both universes)
    for uni in ["LONG (synthetic futures)", "ETF (tradable)"]:
        x = T[(T["universe"] == uni) & (T["period"] == "test 2008-2026")]
        best = x.sort_values("sharpe").iloc[-1]
        dsr = C.deflated_sharpe(best["sharpe"], len(x), float(x["sharpe"].var()), best["years"], best["skew"], best["exkurt"])
        print(uni, "test best", best["variant"], best["sharpe"], "DSR", dsr, "Bonferroni t*", round(C.bonferroni_t(len(x)), 2))
    # save daily net series for later use
    keep = {}
    for uni, res in [("LONG", resL), ("ETF", resE), ("MICRO8", resM)]:
        for name in ["TSMOM L252 H21", "BLEND H21", "BRK N50", "TSMOM L63 H21", "LO-BLEND H21", "TSMOM L126 H21"]:
            keep[f"{uni}|{name}"] = res[name][0]["net"]
    pd.DataFrame(keep).to_csv(C.SCRATCH / "p1_daily_net.csv")
    # current signals (as of the last date) for the micro portfolio, TSMOM L252/L126 and BLEND
    now = {}
    for name in ["TSMOM L252 H21", "TSMOM L126 H21", "BLEND H21", "BRK N50"]:
        W = resM[name][2]
        now[name] = {c: round(float(W[c].iloc[-1]), 3) for c in W.columns}
    RMc = (1 + RM.fillna(0)).cumprod()
    now["trailing_12m_excess_%"] = {c: round(100 * float(RMc[c].iloc[-1] / RMc[c].iloc[-253] - 1), 1) for c in RM.columns}
    now["trailing_6m_excess_%"] = {c: round(100 * float(RMc[c].iloc[-1] / RMc[c].iloc[-127] - 1), 1) for c in RM.columns}
    now["last_date"] = str(RM.index[-1].date())
    C.save(now, "p1_current_signals.json")
    print(SA.pivot_table(index=["asset", "class"], columns=["rule", "period"], values="sharpe").to_string())
    print(json.dumps(now, indent=1))

    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 400)
    cols = ["universe", "variant", "period", "ann_ret_%", "vol_%", "sharpe", "gross_sharpe", "maxDD_%", "t_stat", "cost_%yr",
            "turnover_x_yr", "avg_positions", "avg_gross_lev"]
    print(T[cols].to_string())
    print(D.to_string())
    print(TT.to_string())
    print(CL.to_string())
    print(FS.to_string())
    print(FY.to_string())
    print(corr)


if __name__ == "__main__":
    main()
