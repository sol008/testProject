"""Part 3: crypto rules with 1-60 day holds (BTC, ETH).

A. Trend: price vs 10/20/50/100/200-day MA (daily evaluation), 20-day breakout (exit on 10-day low),
   TSMOM 7/14/28-day, weekly-close vs 10/20-week MA. Long/flat, cash earns T-bills, 60-day max hold
   (forced exit and re-entry if the signal is still on). Signal at the UTC daily close, executed at the
   next daily close (LAG=1). Costs per side: 0.05% (ETF / CME), 0.25% (exchange, base case), 0.50% (retail).
B. Day-of-week and weekend effects.
C. Rebounds after large drops (1-day <= -10%, 3-day <= -15%, 30-day drawdown <= -25%).
D. Perpetual funding-rate extremes as a contrarian signal (BitMEX XBTUSD 2016+, Binance BTCUSDT/ETHUSDT 2020+).
E. Spot-Bitcoin-ETF flows (The Block daily flow series, 2024-01 onward).
Design sample: <= 2020-12-31 (BTC from 2013, ETH from 2016-06); test: 2021-01-01 .. 2026-09-28.
"""
from __future__ import annotations

import json
import os
import math

import numpy as np
import pandas as pd

import common as C

LAG = 1
DESIGN = ("2013-01-01", "2020-12-31")
TEST = ("2021-01-01", "2026-09-28")
COSTS = {"etf_cme_0.05%": 0.0005, "exchange_0.25%": 0.0025, "retail_0.50%": 0.005}
BASE_COST = 0.0025
MAXHOLD = 60


def load(asset: str) -> pd.Series:
    s = C.crypto_daily(asset)
    s = s.asfreq("D").ffill()
    return s


def rf_cal(index) -> pd.Series:
    return C.rf_on(index, "calendar")


# --------------------------------------------------------------------------- A. trend engine
def signal_series(px: pd.Series, rule: str) -> pd.Series:
    """Desired position (1 long / 0 flat) observed at close t, from information up to t."""
    if rule.startswith("MA"):
        n = int(rule[2:])
        return (px > px.rolling(n).mean()).astype(float).where(px.rolling(n).mean().notna())
    if rule.startswith("TSMOM"):
        n = int(rule[5:])
        return (px.pct_change(n) > 0).astype(float).where(px.pct_change(n).notna())
    if rule.startswith("WMA"):
        n = int(rule[3:])
        wk = px.resample("W-SUN").last()
        ma = wk.rolling(n).mean()
        s = (wk > ma).astype(float).where(ma.notna())
        return s.reindex(px.index, method="ffill")
    if rule == "BRK20":
        hi = px.rolling(20).max().shift(1)
        lo = px.rolling(10).min().shift(1)
        pos = np.zeros(len(px))
        p = 0
        for t in range(len(px)):
            if np.isnan(hi.iat[t]):
                continue
            if p == 0 and px.iat[t] > hi.iat[t]:
                p = 1
            elif p == 1 and px.iat[t] < lo.iat[t]:
                p = 0
            pos[t] = p
        return pd.Series(pos, index=px.index)
    if rule == "HOLD":
        return pd.Series(1.0, index=px.index)
    raise ValueError(rule)


def backtest(px: pd.Series, sig: pd.Series, cost: float, lag: int = LAG, maxhold: int = MAXHOLD, a=None, b=None):
    """Long/flat with a hard max holding period: after `maxhold` days in a trade, exit and re-enter
    (a new trade) at the same close if the signal is still on (costs a round trip)."""
    if a is not None:
        px = px.loc[a:b]
        sig = sig.loc[a:b]
    r = px.pct_change().fillna(0).values
    rf = rf_cal(px.index).values
    want = sig.shift(lag).fillna(0).values          # position decided at t-lag, held over (t, t+1]
    n = len(px)
    pos = np.zeros(n)
    trades = []
    in_trade, t0, acc = False, 0, 1.0
    eq = np.ones(n)
    for t in range(1, n):
        p_prev = pos[t - 1]
        # return over day t accrues to the position held at end of t-1
        day = p_prev * r[t] + (1 - p_prev) * rf[t]
        eq[t] = eq[t - 1] * (1 + day)
        if in_trade:
            acc *= (1 + r[t])
        # decide position at end of day t
        w = want[t] if not np.isnan(want[t]) else 0.0
        if in_trade and (w == 0 or t - t0 >= maxhold):
            eq[t] *= (1 - cost)
            trades.append((px.index[t0], px.index[t], acc * (1 - cost) ** 2 - 1, t - t0))
            in_trade = False
        if not in_trade and w == 1:
            eq[t] *= (1 - cost)
            in_trade, t0, acc = True, t, 1.0
        pos[t] = 1.0 if in_trade else 0.0
    if in_trade:
        trades.append((px.index[t0], px.index[-1], acc * (1 - cost) ** 2 - 1, n - 1 - t0))
    eq = pd.Series(eq, index=px.index)
    T = pd.DataFrame(trades, columns=["entry", "exit", "ret", "days"])
    return eq, T, pd.Series(pos, index=px.index)


def stats(eq: pd.Series, T: pd.DataFrame, pos: pd.Series) -> dict:
    r = eq.pct_change().dropna()
    rf = rf_cal(r.index)
    p = C.perf(r, rf=rf, af=365)
    yrs = p["years"]
    st = C.trade_stats(T["ret"], yrs)
    kel = C.kelly_from_trades(T["ret"], st.get("per_yr", 0) or 0)
    out = {k: p[k] for k in ["years", "cagr_%", "ann_ret_%", "vol_%", "sharpe", "maxDD_%"]}
    out["time_in_mkt_%"] = round(100 * pos.mean(), 0)
    out.update({f"tr_{k}": v for k, v in st.items()})
    out.update({f"qK_{k}": v for k, v in kel.items()})
    return out


def trend_tables():
    rows = []
    rules = ["HOLD", "MA10", "MA20", "MA50", "MA100", "MA200", "BRK20", "TSMOM7", "TSMOM14", "TSMOM28", "WMA10", "WMA20"]
    for asset, design_start in [("btc", DESIGN[0]), ("eth", "2016-06-01")]:
        px = load(asset)
        for rule in rules:
            sig = signal_series(px, rule)
            for per, a, b in [("design", design_start, DESIGN[1]), ("test", TEST[0], TEST[1])]:
                for cname, cost in COSTS.items():
                    if cname != "exchange_0.25%" and rule in ("HOLD",):
                        continue
                    eq, T, pos = backtest(px, sig, cost, a=a, b=b)
                    s = stats(eq, T, pos)
                    rows.append({"asset": asset.upper(), "rule": rule, "period": per, "cost": cname, **s})
    df = pd.DataFrame(rows)
    # lag sensitivity for the base cost
    lrows = []
    for asset in ["btc", "eth"]:
        px = load(asset)
        for rule in ["MA10", "MA20", "MA50", "BRK20", "WMA20"]:
            sig = signal_series(px, rule)
            for lag in [0, 1, 2]:
                eq, T, pos = backtest(px, sig, BASE_COST, lag=lag, a=TEST[0], b=TEST[1])
                s = stats(eq, T, pos)
                lrows.append({"asset": asset.upper(), "rule": rule, "lag_days": lag, "sharpe": s["sharpe"], "cagr_%": s["cagr_%"],
                              "maxDD_%": s["maxDD_%"], "trades_yr": s["tr_per_yr"]})
    return df, pd.DataFrame(lrows)


def trend_by_year(asset="btc", rules=("HOLD", "MA20", "MA50", "WMA20", "BRK20")):
    px = load(asset)
    out = {}
    for rule in rules:
        eq, T, pos = backtest(px, signal_series(px, rule), BASE_COST, a="2013-01-01", b=TEST[1])
        yr = eq.resample("YE").last().pct_change()
        yr.iloc[0] = eq.resample("YE").last().iloc[0] / eq.iloc[0] - 1
        out[rule] = (100 * yr).round(1)
    t = pd.DataFrame(out)
    t.index = t.index.year
    return t


# --------------------------------------------------------------------------- B. day of week
def day_of_week():
    rows = []
    for asset, start in [("btc", "2013-01-01"), ("eth", "2016-06-01")]:
        px = load(asset)
        r = px.pct_change().dropna().loc[start:]
        for per, a, b in [("design", start, DESIGN[1]), ("test", TEST[0], TEST[1])]:
            x = r.loc[a:b]
            for d, g in x.groupby(x.index.dayofweek):
                others = x[x.index.dayofweek != d]
                t = (g.mean() - others.mean()) / math.sqrt(g.var() / len(g) + others.var() / len(others))
                rows.append({"asset": asset.upper(), "period": per, "day": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d],
                             "n": len(g), "mean_%": round(100 * g.mean(), 3), "median_%": round(100 * g.median(), 3),
                             "t_vs_other_days": round(t, 2), "vol_%": round(100 * g.std(), 2)})
    D = pd.DataFrame(rows)
    # weekend-only vs weekday-only holding (BTC), with costs of 2 round trips per week
    wrows = []
    for asset in ["btc", "eth"]:
        px = load(asset)
        r = px.pct_change().fillna(0)
        rf = rf_cal(r.index)
        dow = r.index.dayofweek
        wk = ((dow == 5) | (dow == 6))             # Sat and Sun returns (Fri close -> Sun close)
        for name, mask in [("weekend only (Fri->Sun close)", wk), ("weekdays only", ~wk)]:
            strat = pd.Series(np.where(mask, r, rf), index=r.index)
            # one round trip per week at 0.25%/side
            entries = pd.Series(mask, index=r.index).astype(int).diff().clip(lower=0).fillna(0)
            strat = strat - entries * 2 * BASE_COST
            for per, a, b in [("design", "2013-01-01" if asset == "btc" else "2016-06-01", DESIGN[1]), ("test", TEST[0], TEST[1])]:
                p = C.perf(strat.loc[a:b], rf=rf, af=365)
                g = C.perf(pd.Series(np.where(mask, r, rf), index=r.index).loc[a:b], rf=rf, af=365)
                wrows.append({"asset": asset.upper(), "strategy": name, "period": per, "gross_sharpe": g["sharpe"], "net_sharpe": p["sharpe"],
                              "net_cagr_%": p["cagr_%"]})
    return D, pd.DataFrame(wrows)


# --------------------------------------------------------------------------- C. rebounds
def rebounds():
    rows = []
    evrows = []
    for asset, start in [("btc", "2013-01-01"), ("eth", "2016-06-01")]:
        px = load(asset)
        r1 = px.pct_change()
        r3 = px.pct_change(3)
        dd30 = px / px.rolling(30).max() - 1
        rf = rf_cal(px.index)
        events = {"1d <= -10%": r1 <= -0.10, "3d <= -15%": r3 <= -0.15, "30d drawdown <= -25%": dd30 <= -0.25,
                  "1d <= -7%": r1 <= -0.07}
        for ename, cond in events.items():
            cond = cond.loc[start:]
            # decluster: first event, then skip 10 days
            ev = []
            last = None
            for t in cond[cond].index:
                if last is None or (t - last).days > 10:
                    ev.append(t)
                    last = t
            for H in [1, 3, 7, 14, 30, 60]:
                fwd = px.shift(-(H + LAG)) / px.shift(-LAG) - 1          # buy at next close, hold H days
                base = fwd.loc[start:].dropna()
                for per, a, b in [("design", start, DESIGN[1]), ("test", TEST[0], TEST[1])]:
                    e = [t for t in ev if pd.Timestamp(a) <= t <= pd.Timestamp(b) and t in fwd.index and not np.isnan(fwd.loc[t])]
                    if len(e) < 3:
                        continue
                    x = fwd.loc[e] - 2 * BASE_COST
                    bb = base.loc[a:b]
                    # bootstrap p-value: mean of random draws of the same size from all days
                    rng = np.random.default_rng(0)
                    draws = rng.choice(bb.values - 2 * BASE_COST, size=(4000, len(x)), replace=True).mean(axis=1)
                    pval = float((draws >= x.mean()).mean())
                    rows.append({"asset": asset.upper(), "event": ename, "H_days": H, "period": per, "n_events": len(x),
                                 "mean_%": round(100 * x.mean(), 2), "median_%": round(100 * x.median(), 2),
                                 "win_%": round(100 * (x > 0).mean(), 0), "worst_%": round(100 * x.min(), 1),
                                 "uncond_mean_%": round(100 * (bb.mean() - 2 * BASE_COST), 2),
                                 "p_boot(mean>=uncond)": round(pval, 3)})
            for t in ev:
                evrows.append({"asset": asset.upper(), "event": ename, "date": t.date()})
    return pd.DataFrame(rows), pd.DataFrame(evrows)


# --------------------------------------------------------------------------- D. funding
def funding_daily():
    bm = C.bitmex_funding()
    bm_d = bm.resample("D").sum()                      # sum of 8h (earlier: 24h) prints per day
    bn = C.binance_funding("BTCUSDT").resample("D").sum()
    bne = C.binance_funding("ETHUSDT").resample("D").sum()
    return pd.DataFrame({"bitmex_btc": bm_d, "binance_btc": bn, "binance_eth": bne})


def funding_tests():
    F = funding_daily()
    rows = []
    rule_rows = []
    for venue, asset in [("bitmex_btc", "btc"), ("binance_btc", "btc"), ("binance_eth", "eth")]:
        px = load(asset)
        f7 = F[venue].rolling(7, min_periods=5).mean() * 365          # annualised 7-day average
        f7 = f7.reindex(px.index)
        for H in [7, 14, 30]:
            fwd = px.shift(-(H + LAG)) / px.shift(-LAG) - 1
            z = pd.DataFrame({"f": f7, "fwd": fwd}).dropna()
            z = z.iloc[::H]                                          # non-overlapping
            z["bucket"] = pd.cut(z["f"], [-10, 0, 0.05, 0.10, 0.20, 0.40, 10],
                                 labels=["<0", "0-5%", "5-10%", "10-20%", "20-40%", ">40%"])
            for per, a, b in [("design", "2016-01-01", DESIGN[1]), ("test", TEST[0], TEST[1])]:
                zz = z.loc[a:b]
                if len(zz) < 20:
                    continue
                g = zz.groupby("bucket", observed=True)["fwd"].agg(["count", "mean", "median"])
                for bkt, row in g.iterrows():
                    rows.append({"venue": venue, "H_days": H, "period": per, "funding_7d_ann": bkt, "n": int(row["count"]),
                                 "mean_%": round(100 * row["mean"], 2), "median_%": round(100 * row["median"], 2)})
                # rank correlation
                rows.append({"venue": venue, "H_days": H, "period": per, "funding_7d_ann": "spearman(f,fwd)", "n": len(zz),
                             "mean_%": round(float(zz[["f", "fwd"]].corr("spearman").iloc[0, 1]), 3), "median_%": np.nan})
        # trading rules: (i) long 14d when 7d funding < 0; (ii) trend MA20 but flat when funding > 30%
        for rname in ["long 14d after 7d funding < 0", "MA20 trend", "MA20 trend, flat if funding > 30%"]:
            if rname.startswith("long 14d"):
                sig = (f7 < 0).astype(float)
                maxh = 14
                # enter on signal; hold exactly 14 days (time exit) -> emulate with maxhold and signal 'sticky'
                s2 = sig.copy()
                eq, T, pos = backtest_fixed_hold(px, sig, 14, BASE_COST)
            else:
                sig = signal_series(px, "MA20")
                if "flat if" in rname:
                    sig = sig.where(~(f7 > 0.30), 0.0)
                eq, T, pos = backtest(px, sig, BASE_COST)
            for per, a, b in [("design", "2016-06-01", DESIGN[1]), ("test", TEST[0], TEST[1])]:
                e = eq.loc[a:b]
                if len(e) < 100:
                    continue
                TT = T[(T["entry"] >= a) & (T["entry"] <= b)]
                pp = pos.loc[a:b]
                s = stats(e / e.iloc[0], TT, pp)
                rule_rows.append({"venue": venue, "rule": rname, "period": per, **s})
    return pd.DataFrame(rows), pd.DataFrame(rule_rows), F


def backtest_fixed_hold(px, sig, H, cost, a=None, b=None):
    """Enter at the close after a signal day (LAG), hold exactly H days, no overlapping trades."""
    r = px.pct_change().fillna(0)
    rf = rf_cal(px.index)
    pos = pd.Series(0.0, index=px.index)
    trades = []
    idx = px.index
    t = 0
    s = sig.reindex(idx).fillna(0).values
    while t < len(idx) - 1:
        if s[t] == 1:
            e0 = t + LAG
            e1 = min(e0 + H, len(idx) - 1)
            if e0 >= len(idx) - 1:
                break
            pos.iloc[e0 + 1:e1 + 1] = 1.0
            trades.append((idx[e0], idx[e1], px.iloc[e1] / px.iloc[e0] * (1 - cost) ** 2 - 1, e1 - e0))
            t = e1
        else:
            t += 1
    day = pos * r + (1 - pos) * rf
    entries = pos.diff().clip(lower=0).fillna(0)
    exits = (-pos.diff()).clip(lower=0).fillna(0)
    day = day - (entries + exits).shift(-1).fillna(0) * cost
    eq = (1 + day).cumprod()
    return eq, pd.DataFrame(trades, columns=["entry", "exit", "ret", "days"]), pos


# --------------------------------------------------------------------------- E. ETF flows
def etf_flows():
    fn = C.CACHE / "theblock_etf_flows.json"
    if not fn.exists():
        r = C.http_get("https://www.theblock.co/api/charts/chart/crypto-markets/spot-bitcoin-etf/spot-bitcoin-etf-flows")
        fn.write_bytes(r.content)
    d = json.loads(fn.read_text())
    j = json.loads(d["jsonFile"]["data"])
    ser = {}
    for k, v in j["Series"].items():
        s = pd.Series({pd.Timestamp(x["Timestamp"], unit="s").normalize(): x["Result"] for x in v["Data"]})
        ser[k] = s
    fl = pd.DataFrame(ser).sort_index().fillna(0)
    total = fl.sum(axis=1)
    px = load("btc")
    # a flow for US trading day d is published that evening; BTC 'close' stamped d is 00:00 UTC of d+1
    # (~8pm New York). To be conservative the trade happens at the close stamped d+1.
    rows = []
    for L in [1, 5, 20]:
        sig = total.rolling(L).sum()
        sig = sig.reindex(px.index).ffill(limit=3)
        z = (sig - sig.rolling(120, min_periods=40).mean()) / sig.rolling(120, min_periods=40).std()
        for H in [1, 5, 20]:
            fwd = px.shift(-(H + 1)) / px.shift(-1) - 1
            past = px / px.shift(L) - 1
            df = pd.DataFrame({"flow": sig, "z": z, "fwd": fwd, "past": past}).dropna()
            df = df[df.index.isin(total.index)]                       # US trading days only
            dfn = df.iloc[::H]
            q = pd.qcut(dfn["flow"], 5, labels=False, duplicates="drop")
            top = dfn["fwd"][q == q.max()].mean()
            bot = dfn["fwd"][q == 0].mean()
            rows.append({"flow_window_days": L, "fwd_days": H, "n_nonoverlap": len(dfn),
                         "spearman(flow,fwd)": round(float(dfn[["flow", "fwd"]].corr("spearman").iloc[0, 1]), 3),
                         "spearman(flow,past_ret)": round(float(df[["flow", "past"]].corr("spearman").iloc[0, 1]), 3),
                         "top_quintile_fwd_%": round(100 * top, 2), "bottom_quintile_fwd_%": round(100 * bot, 2)})
    # track-08 style trigger: 4 consecutive weeks of positive net flows
    wk = total.resample("W-FRI").sum()
    trig = (wk > 0).astype(int).rolling(4).sum() == 4
    fw = px.resample("W-FRI").last()
    f4 = fw.shift(-4) / fw - 1
    tt = pd.DataFrame({"trig": trig, "f4": f4}).dropna()
    tt["trig"] = tt["trig"].astype(bool)
    trig_stats = {"weeks": len(tt), "weeks_trigger_on": int(tt["trig"].sum()),
                  "fwd4w_when_on_%": round(100 * tt.loc[tt["trig"], "f4"].mean(), 2),
                  "fwd4w_when_off_%": round(100 * tt.loc[~tt["trig"], "f4"].mean(), 2),
                  "last_4_weeks_flows_$bn": [round(x / 1e9, 2) for x in wk.iloc[-4:].values],
                  "first": str(total.index[0].date()), "last": str(total.index[-1].date()),
                  "cum_flows_$bn": round(total.sum() / 1e9, 1)}
    return pd.DataFrame(rows), trig_stats, total


def main():
    pd.set_option("display.width", 260)
    pd.set_option("display.max_rows", 500)
    pd.set_option("display.max_columns", 40)
    T, L = trend_tables()
    C.save(T, "p3_crypto_trend.csv")
    C.save(L, "p3_crypto_trend_lag.csv")
    base = T[T["cost"] == "exchange_0.25%"]
    print(base[["asset", "rule", "period", "cagr_%", "sharpe", "maxDD_%", "time_in_mkt_%", "tr_n", "tr_per_yr", "tr_win_%",
                "tr_avg_win_%", "tr_avg_loss_%", "tr_mean_%", "tr_median_%", "tr_worst_%", "qK_kelly_full", "qK_stake_qK", "qK_g_per_yr_%"]].to_string())
    print(T[T["cost"] != "exchange_0.25%"][["asset", "rule", "period", "cost", "cagr_%", "sharpe", "maxDD_%"]].to_string())
    print(L.to_string())
    Y = trend_by_year()
    C.save(Y, "p3_btc_trend_by_year.csv")
    print(Y.to_string())
    D, W = day_of_week()
    C.save(D, "p3_day_of_week.csv")
    C.save(W, "p3_weekend.csv")
    print(D.to_string())
    print(W.to_string())
    RB, EV = rebounds()
    C.save(RB, "p3_rebounds.csv")
    C.save(EV, "p3_rebound_events.csv")
    print(RB.to_string())
    FT, FR, F = funding_tests()
    C.save(FT, "p3_funding_buckets.csv")
    C.save(FR, "p3_funding_rules.csv")
    print(FT.to_string())
    print(FR[["venue", "rule", "period", "cagr_%", "sharpe", "maxDD_%", "time_in_mkt_%", "tr_n", "tr_per_yr", "tr_win_%", "tr_mean_%", "tr_median_%", "tr_worst_%"]].to_string())
    fnow = {c: round(float(F[c].dropna().iloc[-7:].mean() * 365 * 100), 2) for c in F.columns}
    fl, trig, total = etf_flows()
    C.save(fl, "p3_etf_flows.csv")
    print(fl.to_string())
    print(trig)
    C.save({"funding_7d_ann_%_latest": fnow, "funding_last_dates": {c: str(F[c].dropna().index[-1].date()) for c in F.columns},
            "etf_flow_trigger": trig}, "p3_current.json")
    print(fnow)


if __name__ == "__main__":
    main()


# --------------------------------------------------------------------------- timing alpha vs buy & hold
def alpha_vs_hold(rules=("MA10", "MA20", "MA50", "MA100", "MA200", "BRK20", "TSMOM7", "TSMOM14", "TSMOM28", "WMA10", "WMA20")):
    """OLS of daily strategy excess returns on the asset's excess returns (test and design periods):
    alpha (annualised), t-stat (Newey-West 10 lags), beta; plus drawdown and worst-month comparison."""
    import statsmodels.api as sm
    rows = []
    for asset, ds in [("btc", DESIGN[0]), ("eth", "2016-06-01")]:
        px = load(asset)
        for rule in rules:
            sig = signal_series(px, rule)
            for per, a, b in [("design", ds, DESIGN[1]), ("test", TEST[0], TEST[1])]:
                eq, T, pos = backtest(px, sig, BASE_COST, a=a, b=b)
                r = eq.pct_change().dropna()
                rb = px.loc[a:b].pct_change().dropna().reindex(r.index)
                rf = rf_cal(r.index)
                y, x = r - rf, rb - rf
                X = sm.add_constant(x.values)
                m = sm.OLS(y.values, X).fit(cov_type="HAC", cov_kwds={"maxlags": 10})
                mo = (1 + r).resample("ME").prod() - 1
                mb = (1 + rb).resample("ME").prod() - 1
                rows.append({"asset": asset.upper(), "rule": rule, "period": per, "alpha_ann_%": round(100 * m.params[0] * 365, 1),
                             "alpha_t": round(m.tvalues[0], 2), "beta": round(m.params[1], 2),
                             "worst_month_%": round(100 * mo.min(), 1), "hold_worst_month_%": round(100 * mb.min(), 1)})
    return pd.DataFrame(rows)


def current_state():
    out = {}
    for asset in ["btc", "eth"]:
        px = load(asset)
        last = float(px.iloc[-1])
        d = {"date": str(px.index[-1].date()), "price": round(last, 0)}
        for n in (10, 20, 50, 100, 200):
            ma = float(px.rolling(n).mean().iloc[-1])
            d[f"MA{n}"] = round(ma, 0)
            d[f"above_MA{n}"] = bool(last > ma)
        wk = px.resample("W-SUN").last()
        for n in (10, 20):
            d[f"weekly_close_above_{n}wMA"] = bool(wk.iloc[-1] > wk.rolling(n).mean().iloc[-1])
            d[f"{n}wMA"] = round(float(wk.rolling(n).mean().iloc[-1]), 0)
        d["ret_28d_%"] = round(100 * (last / float(px.iloc[-29]) - 1), 1)
        d["high_20d_prior"] = round(float(px.iloc[-21:-1].max()), 0)
        d["low_10d_prior"] = round(float(px.iloc[-11:-1].min()), 0)
        d["drawdown_from_ATH_%"] = round(100 * (last / float(px.max()) - 1), 1)
        d["ret_1d_%"] = round(100 * (last / float(px.iloc[-2]) - 1), 2)
        d["ret_3d_%"] = round(100 * (last / float(px.iloc[-4]) - 1), 2)
        d["dd_30d_high_%"] = round(100 * (last / float(px.iloc[-30:].max()) - 1), 1)
        out[asset.upper()] = d
    return out


if __name__ == "__main__" and os.environ.get("P3_EXTRA"):
    pass
