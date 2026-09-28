"""Track 13 / test 3: short-term momentum and breakouts.

A. Donchian breakouts (long only, close-based channels so ^GSPC 1928- can be used):
   entry  : close > highest close of the prior N sessions, N = 20 or 55
   exits  : close < lowest close of the prior M sessions (M = 10 for N=20, 20 for N=55),
            capped at 60 sessions ; or a fixed 20- or 60-session hold.
B. Momentum rotation, 1-month holds:
   universes: 9 Select Sector SPDRs (1999-), Ken French 12 value-weighted industries
              (1926-; long-history proxy, not tradable), 17-22 iShares country ETFs (1996-,
              point-in-time membership).
   rule     : at each month-end close rank members by trailing L-month total return
              (L = 1, 2, 3 months = 21/42/63 sessions); hold the top K (1, 2, 3) equally
              weighted until the next month-end; optional absolute filter (a slot whose
              trailing return is below the T-bill return goes to T-bills).
   fills    : next open (ETFs) or next close; costs on turnover.
   benchmark: equal-weight universe with the same fills, and SPY.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common13 import (SPLIT, TODAY, Registry, base_cost, load, run_rule, save, sma,
                      stream_stats, strategy_daily, trade_stats)
from s00_data import ken_french_industry_daily

REG = Registry("s03_momentum")
END = TODAY + pd.Timedelta(days=1)


# ----------------------------------------------------------------------------- A. Donchian
def donchian_block(rows):
    variants = []
    for N, M in ((20, 10), (55, 20)):
        variants += [(N, "chanexit", M, 60), (N, "T20", None, 20), (N, "T60", None, 60)]
    insts = {"^GSPC": ["close"], "SPY": ["open", "close"], "QQQ": ["open", "close"],
             "IWM": ["open", "close"], "DIA": ["open", "close"], "EFA": ["open", "close"],
             "EEM": ["open", "close"]}
    for t in ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY",
              "EWA", "EWC", "EWD", "EWG", "EWH", "EWI", "EWJ", "EWK", "EWL", "EWM", "EWN", "EWO",
              "EWP", "EWQ", "EWS", "EWU", "EWW",
              "^N225", "^FTSE", "^GDAXI", "^FCHI", "^HSI", "^AXJO", "^GSPTSE", "^SSMI", "^AEX",
              "^IBEX", "^BVSP", "^MXX"]:
        insts[t] = ["close"]
    for tk, modes in insts.items():
        df = load(tk)
        c = df["C"]
        periods = {"IS (<2008)": (max(df.index[0], pd.Timestamp("1928-01-01")), SPLIT), "OOS (2008-)": (SPLIT, END)}
        if tk == "^GSPC":
            periods = {"1928-1989": ("1928-01-01", "1990-01-01"), "IS (<2008)": ("1990-01-01", SPLIT),
                       "OOS (2008-)": (SPLIT, END)}
        daily_ex = (df["aC"].pct_change() - df["rf"]).fillna(0)
        for N, xname, M, cap in variants:
            ent = c > c.shift(1).rolling(N).max()
            ex = (c < c.shift(1).rolling(M).min()) if M else None
            for mode in modes:
                tr = run_rule(df, ent, mode=mode, hold=cap, exit_sig=ex)
                for pname, (lo, hi) in periods.items():
                    lo2, hi2 = max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1])
                    sub = tr[(tr["signal"] >= lo2) & (tr["signal"] < hi2)] if len(tr) else tr
                    st = trade_stats(sub, lo2, hi2)
                    r = strategy_daily(df, sub, lo2, hi2)
                    ss = stream_stats(r, df["rf"])
                    bh = stream_stats(df["aC"].pct_change().loc[lo2:hi2].fillna(0), df["rf"])
                    u = float(daily_ex.loc[lo2:hi2].mean())
                    expo = float(sub["sessions"].sum() / max(len(df.loc[lo2:hi2]), 1)) if len(sub) else 0.0
                    edge = (st.get("mean_ex", np.nan) - u * st.get("sessions", np.nan)) if st.get("n", 0) else np.nan
                    variant = f"DC{N}|{xname}"
                    REG.add("donchian", variant, tk, mode, pname, st)
                    rows.append(dict(inst=tk, variant=variant, mode=mode, period=pname, exposure=expo,
                                     edge_vs_uncond=edge, **st, **{"s_" + k: v for k, v in ss.items()},
                                     **{"bh_" + k: v for k, v in bh.items()}))


# ----------------------------------------------------------------------------- B. rotation
def panel(tickers):
    O, C, RF = {}, {}, None
    for t in tickers:
        df = load(t)
        O[t], C[t] = df["aO"], df["aC"]
        if RF is None or len(df) > len(RF):
            RF = df["rf"]
    O, C = pd.DataFrame(O), pd.DataFrame(C)
    idx = C.index
    rf = load("SPY")["rf"].reindex(idx).ffill().fillna(0)
    return O, C, rf


def kf_panel():
    ind = ken_french_industry_daily()
    C = (1 + ind.fillna(0)).cumprod()
    C = C.where(ind.notna())
    O = C.shift(1)          # no opens: 'open' = previous close (next-open fills not available)
    g = load("^GSPC")
    rf = g["rf"].reindex(C.index).ffill().fillna(0)
    return O, C, rf


def rotation(O, C, rf, L, K, absf, fill, cost_bps, min_hist=63):
    """Monthly rotation.  Returns a DataFrame of monthly holding-period results."""
    idx = C.index
    me = pd.Series(idx, index=idx).groupby(idx.to_period("M")).last()
    me = me[me < idx[-1]]
    rows = []
    prev_w = pd.Series(dtype=float)
    lookback = 21 * L
    rfc = rf.cumsum()
    for i in range(len(me) - 1):
        t0, t1 = me.iloc[i], me.iloc[i + 1]
        p0 = idx.get_loc(t0)
        p1 = idx.get_loc(t1)
        if p0 < lookback or p1 + 1 >= len(idx):
            continue
        hist = C.iloc[p0 - lookback]
        now = C.iloc[p0]
        ok = hist.notna() & now.notna() & C.iloc[max(p0 - min_hist, 0)].notna()
        # must also be tradable over the holding period
        e_i, x_i = p0 + 1, p1 + 1
        if fill == "open":
            ent_px, ex_px = O.iloc[e_i], O.iloc[x_i]
        else:
            ent_px, ex_px = C.iloc[e_i], C.iloc[x_i]
        ok &= ent_px.notna() & ex_px.notna()
        if ok.sum() < max(K + 2, 4):
            continue
        score = (now / hist - 1)[ok]
        ret = (ex_px / ent_px - 1)[ok]
        rf_hold = float(rfc.iloc[x_i] - rfc.iloc[e_i]) if fill == "close" else float(rfc.iloc[x_i - 1] - rfc.iloc[e_i - 1])
        rf_look = float(rfc.iloc[p0] - rfc.iloc[p0 - lookback])
        top = score.sort_values(ascending=False).index[:K]
        w = pd.Series(1.0 / K, index=top)
        cash_w = 0.0
        if absf:
            bad = [t for t in top if score[t] < rf_look]
            cash_w = len(bad) / K
            w = w.drop(bad)
        allk = w.index.union(prev_w.index)
        turn = (w.reindex(allk).fillna(0) - prev_w.reindex(allk).fillna(0)).abs().sum()
        buys = int((w.reindex(allk).fillna(0) > prev_w.reindex(allk).fillna(0) + 1e-12).sum())
        gross = float((w * ret.reindex(w.index)).sum() + cash_w * rf_hold)
        net = gross - turn * cost_bps / 1e4
        ew = float(ret.mean())
        rows.append(dict(date=t0, gross=gross, net=net, ew=ew, rf=rf_hold, turnover=turn, buys=buys,
                         n_univ=int(ok.sum()), top=",".join(top), cash=cash_w,
                         pos_rets=[float(ret[t]) for t in w.index]))
        prev_w = w
    return pd.DataFrame(rows)


def rot_stats(m: pd.DataFrame, lo, hi) -> dict:
    x = m[(m["date"] >= pd.Timestamp(lo)) & (m["date"] < pd.Timestamp(hi))]
    if len(x) < 12:
        return {}
    yrs = len(x) / 12.0
    ex = x["net"] - x["rf"]
    rel = x["net"] - x["ew"]
    eq = (1 + x["net"]).cumprod()
    eqb = (1 + x["ew"]).cumprod()
    pos = np.concatenate([np.array(p) for p in x["pos_rets"] if len(p)]) if len(x) else np.array([])
    return dict(months=len(x), cagr=eq.iloc[-1] ** (1 / yrs) - 1, ew_cagr=eqb.iloc[-1] ** (1 / yrs) - 1,
                sharpe=ex.mean() / ex.std() * np.sqrt(12), ew_sharpe=(x["ew"] - x["rf"]).mean() / (x["ew"] - x["rf"]).std() * np.sqrt(12),
                mdd=float((eq / eq.cummax() - 1).min()), ew_mdd=float((eqb / eqb.cummax() - 1).min()),
                rel_mean_m=rel.mean(), rel_t=rel.mean() / rel.std() * np.sqrt(len(rel)),
                buys_per_yr=x["buys"].sum() / yrs, turnover_yr=x["turnover"].sum() / yrs,
                pos_win=float((pos > 0).mean()) if len(pos) else np.nan,
                pos_mean=float(pos.mean()) if len(pos) else np.nan, worst_pos=float(pos.min()) if len(pos) else np.nan,
                worst_month=float(x["net"].min()))


def rotation_block(rows):
    sectors = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"]
    countries = ["EWA", "EWC", "EWD", "EWG", "EWH", "EWI", "EWJ", "EWK", "EWL", "EWM", "EWN", "EWO",
                 "EWP", "EWQ", "EWS", "EWU", "EWW", "EWT", "EWY", "EWZ", "EZA", "FXI"]
    unis = {"sectors": (panel(sectors), ["open", "close"], 2.5),
            "countries": (panel(countries), ["open", "close"], 6.0),
            "KF12": (kf_panel(), ["close"], 5.0)}
    for uname, ((O, C, rf), fills, cbps) in unis.items():
        for L in (1, 2, 3):
            for K in (1, 2, 3):
                for absf in (False, True):
                    for fill in fills:
                        m = rotation(O, C, rf, L, K, absf, fill, cbps)
                        if uname == "KF12":
                            periods = {"1927-1989": ("1927-01-01", "1990-01-01"), "IS (<2008)": ("1927-01-01", SPLIT),
                                       "OOS (2008-)": (SPLIT, END)}
                        else:
                            periods = {"IS (<2008)": ("1996-01-01", SPLIT), "OOS (2008-)": (SPLIT, END)}
                        for pname, (lo, hi) in periods.items():
                            st = rot_stats(m, lo, hi)
                            if not st:
                                continue
                            variant = f"L{L}|K{K}|{'abs' if absf else 'rel'}"
                            # registry entry expressed per position (monthly holding = one trade)
                            REG.add("rotation:" + uname, variant, uname, fill, pname,
                                    dict(n=st["months"], per_yr=st["buys_per_yr"], mean_ex=st["rel_mean_m"],
                                         sr_trade=st["rel_t"] / np.sqrt(st["months"]), t=st["rel_t"]))
                            rows.append(dict(universe=uname, variant=variant, L=L, K=K, absf=absf, fill=fill,
                                             period=pname, **st))
                        if uname == "sectors" and L == 1 and K == 1 and not absf and fill == "open":
                            save(m.drop(columns=["pos_rets"]), "rotation_sectors_L1K1_months.csv")


def main():
    rows = []
    donchian_block(rows)
    save(pd.DataFrame(rows), "donchian_all.csv")
    rrows = []
    rotation_block(rrows)
    save(pd.DataFrame(rrows), "rotation_all.csv")
    REG.save()
    print("done", len(rows), len(rrows))


if __name__ == "__main__":
    main()
