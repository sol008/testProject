"""Part 2: carry signals with ~1-month holds.

A. Commodity term structure (NYMEX energy, EIA contracts 1-4, 1985-2024-04):
   long the 2nd-month contract for the next 21 trading days when the front is backwardated
   (ln(C1/C2)*12 > 0), flat or short otherwise; plus a 'never long in steep contango' filter test.
B. FX carry (G10 vs USD, FRED spot + OECD 3m rates, 1976-2026): monthly
   (i) cross-sectional: long the 3 highest-yield / short the 3 lowest-yield currencies (USD included
       as a zero-return 'currency'), equal weight; (ii) each currency vs USD by the sign of its
       rate differential; (iii) ETF implementation 2008-2026 with CurrencyShares ETFs.
C. Bond carry & roll-down (US Treasuries from FRED constant-maturity yields, 1962-2026):
   long the 10y when expected 1-month carry+roll-down > 0 (or > threshold), else flat;
   and choose the maturity with the best carry+roll per unit of duration.
Design <= 2007, test >= 2008. Costs: futures 2-4 bp one-way + rolls; ETFs 6-10 bp + borrow.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import assets as A
import common as C

H = 21


def monthly_blocks(index: pd.DatetimeIndex, H: int = H):
    starts = np.arange(0, len(index), H)
    return [(index[a], index[min(a + H, len(index) - 1)]) for a in starts[:-1]]


def run_signal_blocks(ret: pd.Series, sig: pd.Series, H: int = H, cost_1way: float = 0.0003,
                      roll_cost_yr: float = 0.0, lag: int = 1):
    """sig observed at close of block start t (index position a); position taken at close a+lag and held
    until close of a+H+lag. Returns block (trade) returns and daily net return series."""
    idx = ret.index
    r = ret.fillna(0).values
    s = sig.reindex(idx).values
    pos = np.zeros(len(idx))
    trades = []
    prev = 0.0
    for a in range(0, len(idx) - H - lag, H):
        x = s[a]
        if np.isnan(x):
            x = 0.0
        e0, e1 = a + lag, a + H + lag
        pos[e0 + 1:e1 + 1] = x
        if x != 0:
            seg = r[e0 + 1:e1 + 1]
            tr = np.prod(1 + x * seg) - 1
            tc = cost_1way * (abs(x - prev)) + cost_1way * 0  # only on changes
            trades.append((idx[a], idx[e1], x, tr - tc - roll_cost_yr * H / 252 * abs(x)))
        prev = x
    daily = pd.Series(pos, index=idx) * ret.fillna(0)
    turn = pd.Series(pos, index=idx).diff().abs().fillna(0)
    daily = daily - turn * cost_1way - pd.Series(np.abs(pos), index=idx) * roll_cost_yr / 252
    T = pd.DataFrame(trades, columns=["signal_date", "exit", "pos", "ret"])
    return T, daily, pd.Series(pos, index=idx)


def summarize(daily, T, a, b, af=252):
    x = daily.loc[a:b]
    p = C.perf(x, af=af)
    tt = T[(T["signal_date"] >= a) & (T["signal_date"] <= b)]
    yrs = p.get("years", np.nan)
    st = C.trade_stats(tt["ret"], yrs)
    return p, st


# --------------------------------------------------------------------------- A. energy
def energy_carry():
    rows, trades_all = [], {}
    for sym in ["CL", "HO", "NG", "RB"]:
        e = A.energy_rolled(sym)
        ret = e["ret"]
        slope = e["slope_ann"]
        mom = (1 + ret.fillna(0)).cumprod()
        mom12 = mom / mom.shift(252) - 1
        rules = {
            "long-only (always)": pd.Series(1.0, index=ret.index),
            "long if backwardated": (slope > 0).astype(float),
            "long if backwardated, short if contango": np.sign(slope),
            "long unless contango steeper than -10%/yr": (slope > -0.10).astype(float),
            "long if backwardated & 12m trend up": ((slope > 0) & (mom12 > 0)).astype(float),
            "TSMOM 12m (sign), for reference": np.sign(mom12),
        }
        for name, sig in rules.items():
            T, daily, pos = run_signal_blocks(ret, sig, cost_1way=A.FUT_COST_BP["CM"] / 1e4,
                                              roll_cost_yr=2 * A.FUT_COST_BP["CM"] / 1e4 * 12)
            for per, a, b in [("design", "1985-01-01", "2007-12-31"), ("test", "2008-01-01", "2024-04-05")]:
                p, st = summarize(daily, T, a, b)
                if not p:
                    continue
                rows.append({"market": sym, "rule": name, "period": per, **{k: p[k] for k in ["years", "ann_ret_%", "vol_%", "sharpe", "maxDD_%", "t_stat"]},
                             "time_in_mkt_%": round(100 * (pos.loc[a:b] != 0).mean(), 0), **{f"tr_{k}": v for k, v in st.items()}})
            trades_all[(sym, name)] = (T, daily)
    df = pd.DataFrame(rows)
    # equal-weight portfolio across the 4 markets (vol-scaled not needed for a qualitative check)
    prow = []
    for name in ["long-only (always)", "long if backwardated", "long if backwardated, short if contango",
                 "long unless contango steeper than -10%/yr", "long if backwardated & 12m trend up", "TSMOM 12m (sign), for reference"]:
        d = pd.concat([trades_all[(s, name)][1] for s in ["CL", "HO", "NG", "RB"]], axis=1)
        # inverse-vol weights (trailing 252d vol of each market's underlying return, lagged)
        vols = pd.concat([A.energy_rolled(s)["ret"].rolling(252, min_periods=120).std().shift(1) for s in ["CL", "HO", "NG", "RB"]], axis=1)
        vols.columns = d.columns = ["CL", "HO", "NG", "RB"]
        vols = vols.reindex(d.index).ffill()
        w = (1 / vols).div((1 / vols).sum(axis=1), axis=0)
        port = (d * w).sum(axis=1, min_count=1).dropna()
        for per, a, b in [("design", "1986-01-01", "2007-12-31"), ("test", "2008-01-01", "2024-04-05")]:
            p = C.perf(port.loc[a:b], af=252)
            prow.append({"rule": name, "period": per, **{k: p[k] for k in ["ann_ret_%", "vol_%", "sharpe", "maxDD_%", "t_stat"]}})
    # conditional forward returns by slope bucket (all markets pooled, 21d forward, non-overlapping)
    brows = []
    for sym in ["CL", "HO", "NG", "RB"]:
        e = A.energy_rolled(sym)
        fwd = (1 + e["ret"].fillna(0)).rolling(H).apply(np.prod, raw=True).shift(-H - 1) - 1
        z = pd.DataFrame({"slope": e["slope_ann"], "fwd": fwd}).iloc[::H].dropna()
        z["per"] = np.where(z.index < "2008-01-01", "design", "test")
        z["mkt"] = sym
        brows.append(z)
    Z = pd.concat(brows)
    Z["bucket"] = pd.cut(Z["slope"], [-10, -0.2, -0.05, 0, 0.05, 0.2, 10],
                         labels=["<-20%", "-20..-5%", "-5..0%", "0..5%", "5..20%", ">20%"])
    B = Z.groupby(["per", "bucket"], observed=True)["fwd"].agg(["count", "mean", "median"]).reset_index()
    B["mean"] = (100 * B["mean"]).round(2)
    B["median"] = (100 * B["median"]).round(2)
    return df, pd.DataFrame(prow), B


# --------------------------------------------------------------------------- B. FX carry
FX_CODES = list(A.FX.keys())


def fx_rates_monthly():
    us = C.fred("IR3TIB01USM156N") / 100
    out = {}
    for name, (sid, usd_first, rid) in A.FX.items():
        out[name] = A.short_rate(name, rid)
    R = pd.DataFrame(out)
    R["USD"] = us
    R.index = R.index + pd.offsets.MonthEnd(0)
    # some OECD series stop a few months early (GBP, EUR end 2026-01): carry forward up to 12 months
    return R.ffill(limit=12)


def fx_carry():
    X = A.fx_excess(with_carry=True)            # daily excess returns of long FCY vs USD (incl. carry)
    X = X[~X.index.duplicated()].sort_index()
    rates = fx_rates_monthly()
    # month-end signal dates (use the rate known for the prior month: OECD monthly averages published with a lag)
    me = X.resample("ME").last().index
    diff = rates.sub(rates["USD"], axis=0).drop(columns="USD").shift(1)   # one-month publication lag
    diff = diff.reindex(me, method="ffill")
    Xd = X.fillna(0)
    mret = (1 + Xd).resample("ME").prod() - 1
    mret = mret.where(X.resample("ME").count() > 5)
    rows = []
    strat = {}
    # (i) cross-sectional top3/bottom3 incl. USD (zero excess return)
    sig_cs = pd.DataFrame(0.0, index=me, columns=FX_CODES)
    for t in me:
        d = diff.loc[t].dropna()
        avail = [c for c in d.index if not np.isnan(mret.shift(-1).loc[t, c])] if t in mret.index else []
        d = d[avail]
        if len(d) < 5:
            continue
        dd = pd.concat([d, pd.Series({"USD": 0.0})]).sort_values()
        lo, hi = dd.index[:3], dd.index[-3:]
        for c in hi:
            if c != "USD":
                sig_cs.loc[t, c] += 1 / 3
        for c in lo:
            if c != "USD":
                sig_cs.loc[t, c] -= 1 / 3
    strat["XS top3-bottom3 (USD incl.)"] = sig_cs
    # (ii) each vs USD by sign of the differential, equal weight
    sig_vs = np.sign(diff).fillna(0) / diff.notna().sum(axis=1).replace(0, np.nan).values[:, None]
    strat["each vs USD, sign of differential"] = sig_vs.fillna(0)
    # (iii) high-yielder basket long only vs USD: long currencies whose rate exceeds USD by >1pp
    strat["long FCY if rate > USD+1pp"] = ((diff > 0.01).astype(float)).div((diff > 0.01).sum(axis=1).replace(0, np.nan), axis=0).fillna(0)
    cost = A.FUT_COST_BP["FX"] / 1e4
    for name, sig in strat.items():
        pnl = (sig.shift(1).reindex(mret.index) * mret).sum(axis=1)
        turn = sig.diff().abs().sum(axis=1).reindex(mret.index).fillna(0)
        roll = sig.abs().sum(axis=1).reindex(mret.index).fillna(0) * 2 * cost * 4 / 12
        net = (pnl - turn.shift(1).fillna(0) * cost - roll.shift(1).fillna(0)).loc["1976-01-01":]
        for per, a, b in [("design 1976-2007", "1976-01-01", "2007-12-31"), ("test 2008-2026", "2008-01-01", "2026-09-30"),
                          ("since 2010", "2010-01-01", "2026-09-30"), ("2022-2026 (rate dispersion back)", "2022-01-01", "2026-09-30")]:
            p = C.perf(net.loc[a:b], af=12)
            if p:
                rows.append({"strategy": name, "period": per, **{k: p[k] for k in ["years", "ann_ret_%", "vol_%", "sharpe", "maxDD_%", "t_stat", "skew"]},
                             "worst_month_%": round(100 * net.loc[a:b].min(), 1)})
        strat[name] = (sig, net)
    # (iv) ETF implementation 2008-2026: long top-2 / short bottom-2 among CurrencyShares ETFs by rate differential
    etf_map = {"EUR": "FXE", "JPY": "FXY", "GBP": "FXB", "AUD": "FXA", "CAD": "FXC", "CHF": "FXF"}
    px = C.yf_close(list(etf_map.values()), adjusted=True)
    er = px.pct_change(fill_method=None)
    er = er.sub(C.rf_on(er.index, "trading"), axis=0)
    em = (1 + er.fillna(0)).resample("ME").prod() - 1
    em = em.where(er.resample("ME").count() > 5)
    em.columns = [k for k, v in etf_map.items() for c in em.columns if v == c]
    dsub = diff[list(etf_map.keys())].reindex(em.index)
    sig = pd.DataFrame(0.0, index=em.index, columns=em.columns)
    for t in em.index:
        d = dsub.loc[t].dropna()
        d = d[[c for c in d.index if not np.isnan(em.shift(-1).loc[t, c])]]
        if len(d) < 4:
            continue
        d = d.sort_values()
        sig.loc[t, d.index[-2:]] = 0.5
        sig.loc[t, d.index[:2]] = -0.5
    pnl = (sig.shift(1) * em).sum(axis=1)
    ecost = 0.0008
    borrow = sig.shift(1).clip(upper=0).abs().sum(axis=1) * 0.015 / 12
    turn = sig.diff().abs().sum(axis=1).fillna(0)
    net = (pnl - turn * ecost - borrow).loc["2008-01-01":]
    for per, a, b in [("test 2008-2026", "2008-01-01", "2026-09-30"), ("2022-2026", "2022-01-01", "2026-09-30")]:
        p = C.perf(net.loc[a:b], af=12)
        rows.append({"strategy": "ETF: long top-2 / short bottom-2 CurrencyShares", "period": per,
                     **{k: p[k] for k in ["years", "ann_ret_%", "vol_%", "sharpe", "maxDD_%", "t_stat", "skew"]},
                     "worst_month_%": round(100 * net.loc[a:b].min(), 1)})
    cur = diff.iloc[-1].sort_values()
    return pd.DataFrame(rows), strat, (100 * cur).round(2), rates.iloc[-3:]


# --------------------------------------------------------------------------- C. bond carry
def bond_carry():
    y = pd.concat({k: C.fred(v) / 100 for k, v in {"3m": "DTB3", "1": "DGS1", "2": "DGS2", "5": "DGS5", "7": "DGS7",
                                                   "10": "DGS10", "30": "DGS30"}.items()}, axis=1)
    y = y[~y.index.duplicated()].sort_index().ffill(limit=5)
    B = A.bond_excess()
    rows = []
    # expected 1-month excess return from carry + roll-down (annualised), per maturity
    D10, _ = A.par_bond_duration(y["10"], 10)
    D5, _ = A.par_bond_duration(y["5"], 5)
    D2, _ = A.par_bond_duration(y["2"], 2)
    D30, _ = A.par_bond_duration(y["30"], 30)
    cr = pd.DataFrame({
        "UST10": (y["10"] - y["3m"]) + D10 * (y["10"] - y["7"]) / 3.0,
        "UST5": (y["5"] - y["3m"]) + D5 * (y["5"] - y["2"]) / 3.0,
        "UST2": (y["2"] - y["3m"]) + D2 * (y["2"] - y["1"]) / 1.0,
        "UST30": (y["30"] - y["3m"]) + D30 * (y["30"] - y["10"]) / 20.0,
    })
    out = {}
    cost = A.FUT_COST_BP["BD"] / 1e4
    for name, sig in {
        "UST10 always long": pd.Series(1.0, index=B.index),
        "UST10 long if carry+roll>0": (cr["UST10"] > 0).astype(float),
        "UST10 long if carry+roll>1%": (cr["UST10"] > 0.01).astype(float),
        "UST10 long if carry+roll>0 else short": np.sign(cr["UST10"]),
        "UST10 long if carry+roll>0 & 12m trend up": ((cr["UST10"] > 0) & (((1 + B["UST10"].fillna(0)).cumprod().pct_change(252)) > 0)).astype(float),
        "UST10 TSMOM 12m (reference)": np.sign((1 + B["UST10"].fillna(0)).cumprod().pct_change(252)),
    }.items():
        T, daily, pos = run_signal_blocks(B["UST10"], sig.reindex(B.index).ffill(), cost_1way=cost, roll_cost_yr=2 * cost * 4)
        for per, a, b in [("design 1962-2007", "1962-06-01", "2007-12-31"), ("test 2008-2026", "2008-01-01", "2026-09-28"),
                          ("since 2010", "2010-01-01", "2026-09-28"), ("2022-2026", "2022-01-01", "2026-09-28")]:
            p, st = summarize(daily, T, a, b)
            if p:
                rows.append({"rule": name, "period": per, **{k: p[k] for k in ["years", "ann_ret_%", "vol_%", "sharpe", "maxDD_%", "t_stat"]},
                             "time_long_%": round(100 * (pos.loc[a:b] > 0).mean(), 0),
                             **{f"tr_{k}": v for k, v in st.items() if k in ("n", "per_yr", "win_%", "mean_%", "median_%", "worst_%")}})
        out[name] = daily
    # duration-neutral 'best carry per unit duration' across 2/5/10/30 (each position scaled to 10y duration)
    durs = pd.DataFrame({"UST2": D2, "UST5": D5, "UST10": D10, "UST30": D30})
    per_dur = (cr / durs).dropna(how="any")
    best = per_dur.idxmax(axis=1)
    idx = B.index
    pos = pd.DataFrame(0.0, index=idx, columns=["UST2", "UST5", "UST10", "UST30"])
    blocks = range(0, len(idx) - H - 1, H)
    for a in blocks:
        t = idx[a]
        if t not in best.index or pd.isna(best.loc[:t].iloc[-1]):
            continue
        k = best.loc[:t].iloc[-1]
        scale = (D10.loc[:t].iloc[-1] / durs[k].loc[:t].iloc[-1])
        pos.iloc[a + 2:a + H + 2, pos.columns.get_loc(k)] = scale
    daily = (pos * B[pos.columns].fillna(0)).sum(axis=1) - pos.diff().abs().sum(axis=1).fillna(0) * cost
    for per, a, b in [("design 1977-2007", "1977-03-01", "2007-12-31"), ("test 2008-2026", "2008-01-01", "2026-09-28")]:
        p = C.perf(daily.loc[a:b], af=252)
        rows.append({"rule": "best carry+roll per unit duration (2/5/10/30y), 10y-duration equiv.", "period": per,
                     **{k: p[k] for k in ["years", "ann_ret_%", "vol_%", "sharpe", "maxDD_%", "t_stat"]}})
    now = {"asof": str(y.index[-1].date()), "yields_%": (100 * y.iloc[-1]).round(2).to_dict(),
           "carry_roll_ann_%": (100 * cr.iloc[-1]).round(2).to_dict()}
    return pd.DataFrame(rows), now


def main():
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 300)
    pd.set_option("display.max_columns", 40)
    E, EP, EB = energy_carry()
    C.save(E, "p2_energy_carry_by_market.csv")
    C.save(EP, "p2_energy_carry_portfolio.csv")
    C.save(EB, "p2_energy_slope_buckets.csv")
    print(E[["market", "rule", "period", "ann_ret_%", "sharpe", "maxDD_%", "t_stat", "time_in_mkt_%", "tr_n", "tr_win_%", "tr_mean_%", "tr_median_%", "tr_worst_%"]].to_string())
    print(EP.to_string())
    print(EB.to_string())
    F, strat, cur, rates = fx_carry()
    C.save(F, "p2_fx_carry.csv")
    print(F.to_string())
    print("current rate differentials vs USD (pp):", cur.to_dict())
    Bd, now = bond_carry()
    C.save(Bd, "p2_bond_carry.csv")
    print(Bd.to_string())
    print(now)
    C.save({"fx_diff_vs_usd_pp": cur.to_dict(), "bond": now}, "p2_current.json")


if __name__ == "__main__":
    main()
