"""Track 13 / robustness and implementation checks for the surviving candidates.

1. Pre-2006 test of the VIX-term-structure signal.  VIX3M only exists from 2006-07, so the
   'VIX/VIX3M >= 1 in an up-trend' result is in-sample.  Proxy: VIX / SMA_k(VIX) >= x, with
   (k, x) calibrated on 2006-2026 to reproduce the VIX/VIX3M >= 1 days (no return data
   used), then the rule is evaluated on 1990-2005 (true hold-out) and 1986-89 (VXO).
2. Stop-loss sensitivity for the RSI(2) dip-buy (closing-basis stops 3/5/8%).
3. Instrument choice for the dip-buy: SPY vs SSO/UPRO (2x/3x), QQQ vs QLD/TQQQ, E-mini
   futures (modelled as SPY excess return with 0.5 bp/side), and a synthetic 1-month ATM
   SPY call (Black-Scholes at 0.95 x VIX, 1% of premium per side).
4. Overlap between signals (how often the dip-buy, the VIX-term signal and VIX>=30 coincide).
5. Holding-period / exit sweep and trade-count reduction (stricter RSI thresholds).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.stats import norm

from common13 import (SPLIT, TODAY, Registry, load, rsi_wilder, run_rule, save, sma,
                      trade_stats, stream_stats, strategy_daily, fred)

END = TODAY + pd.Timedelta(days=1)
REG = Registry("s06_extras")


def first_cross(cond: pd.Series, quiet: int = 20) -> pd.Series:
    prev = cond.shift(1).rolling(quiet, min_periods=1).max().fillna(0).astype(bool)
    return cond & ~prev


# ----------------------------------------------------------------------------- 1. proxy
def vix_term_proxy():
    vix = load("^VIX")["C"]
    v3 = load("^VIX3M")["C"]
    both = pd.concat([vix, v3], axis=1, keys=["v", "v3"]).dropna()
    target = both["v"] / both["v3"] >= 1.0
    best = None
    for k in (10, 21, 42, 63, 126):
        s = vix / vix.rolling(k).mean()
        s = s.reindex(both.index)
        for x in np.arange(1.00, 1.60, 0.01):
            pred = s >= x
            tp = (pred & target).sum()
            fp = (pred & ~target).sum()
            fn = (~pred & target).sum()
            jac = tp / max(tp + fp + fn, 1)
            if best is None or jac > best[0]:
                best = (jac, k, round(float(x), 2), int(tp), int(fp), int(fn))
    jac, k, x, tp, fp, fn = best
    rows = [dict(item="calibration", k=k, x=x, jaccard=jac, tp=tp, fp=fp, fn=fn,
                 target_days=int(target.sum()), days=len(both))]
    # evaluate on ^GSPC (VXO before 1990) and SPY
    vxo = fred("VXOCLS")
    gauge = pd.concat([vxo[vxo.index < "1990-01-02"], vix[vix.index >= "1990-01-02"]])
    proxy = gauge / gauge.rolling(k).mean() >= x
    out = []
    for tk, modes in (("^GSPC", ["close"]), ("SPY", ["open", "close"])):
        df = load(tk)
        tr200 = df["C"] > sma(df["C"], 200)
        real = (vix / v3).reindex(df.index) >= 1.0
        for sname, sig in (("proxy", proxy.reindex(df.index).fillna(False)), ("VIX/VIX3M", real.fillna(False))):
            e = first_cross(sig) & tr200
            for H in (5, 10, 20):
                for mode in modes:
                    tr = run_rule(df, e, mode=mode, hold=H)
                    for pname, (lo, hi) in {"1986-1989": ("1986-01-01", "1990-01-01"),
                                            "1990-2005 (hold-out)": ("1990-01-01", "2006-07-17"),
                                            "2006-2026": ("2006-07-17", END), "2008-2026": (SPLIT, END)}.items():
                        lo2, hi2 = max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1])
                        if hi2 <= lo2:
                            continue
                        sub = tr[(tr["signal"] >= lo2) & (tr["signal"] < hi2)] if len(tr) else tr
                        st = trade_stats(sub, lo2, hi2)
                        # unconditional H-session excess in the same window (open entries)
                        aC, rfc = df["aC"], df["rf"].cumsum()
                        u = (aC.shift(-H) / df["aO"].shift(-1) - 1 - (rfc.shift(-H) - rfc)) if mode == "open" else \
                            (aC.shift(-(H + 1)) / aC.shift(-1) - 1 - (rfc.shift(-(H + 1)) - rfc.shift(-1)))
                        u = u.loc[lo2:hi2].dropna().mean()
                        REG.add("panic:VIXterm-proxy", f"{sname}|above200|H{H}", tk, mode, pname, st)
                        out.append(dict(inst=tk, signal=sname, H=H, mode=mode, period=pname, u_mean=u,
                                        edge=st.get("mean_ex", np.nan) - u if st.get("n") else np.nan, **st))
    save(pd.DataFrame(rows), "vixterm_proxy_calibration.csv")
    save(pd.DataFrame(out), "vixterm_proxy_test.csv")
    return k, x


# ----------------------------------------------------------------------------- helpers
def dip_signal(df: pd.DataFrame, thr: float = 10.0):
    c = df["C"]
    return (rsi_wilder(c, 2) < thr) & (c > sma(c, 200)), c > sma(c, 5)


# ----------------------------------------------------------------------------- 2. stops
def stops():
    rows = []
    for tk in ("SPY", "QQQ", "IWM"):
        df = load(tk)
        e, x = dip_signal(df)
        for stop in (None, 0.03, 0.05, 0.08):
            tr = run_rule(df, e, mode="open", hold=10, exit_sig=x, stop=stop)
            for pname, (lo, hi) in {"IS (<2008)": (df.index[0], SPLIT), "OOS (2008-)": (SPLIT, END)}.items():
                sub = tr[(tr["signal"] >= pd.Timestamp(lo)) & (tr["signal"] < pd.Timestamp(hi))]
                st = trade_stats(sub, max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1]))
                rows.append(dict(inst=tk, stop=stop or 0, period=pname, stopped=int((sub["how"] == "stop").sum()), **st))
    save(pd.DataFrame(rows), "dip_stops.csv")


# ----------------------------------------------------------------------------- 3. instruments
def bs_call(S, K, T, r, sig):
    if T <= 0:
        return max(S - K, 0.0)
    d1 = (math.log(S / K) + (r + 0.5 * sig * sig) * T) / (sig * math.sqrt(T))
    d2 = d1 - sig * math.sqrt(T)
    return S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)


def instruments():
    rows = []
    vix = load("^VIX")["C"]
    pairs = {"SPY": ["SPY", "SSO", "UPRO"], "QQQ": ["QQQ", "QLD", "TQQQ"]}
    for base, members in pairs.items():
        sdf = load(base)
        e, x = dip_signal(sdf)
        tr = run_rule(sdf, e, mode="open", hold=10, exit_sig=x, cost_bps=0.0)
        for m in members:
            mdf = load(m)
            cost = {"SPY": 1.0, "QQQ": 1.0, "SSO": 2.0, "QLD": 2.0, "UPRO": 2.0, "TQQQ": 1.5}[m]
            recs = []
            for t in tr.itertuples(index=False):
                if t.entry not in mdf.index or t.exit not in mdf.index:
                    continue
                ep = mdf.loc[t.entry, "aO"]
                # exit at the same execution point as the base trade
                xp = mdf.loc[t.exit, "aO"] if t.how == "rule" else mdf.loc[t.exit, "aC"]
                net = xp * (1 - cost / 1e4) / (ep * (1 + cost / 1e4)) - 1
                recs.append(dict(signal=t.signal, entry=t.entry, exit=t.exit, sessions=t.sessions, net=net,
                                 excess=net - t.rf, rf=t.rf, cost_bps=cost, how=t.how,
                                 entry_px=ep, exit_px=xp, gross=xp / ep - 1, mae=np.nan))
            mt = pd.DataFrame(recs)
            if not len(mt):
                continue
            lo = max(mdf.index[0] + pd.Timedelta(days=260), SPLIT)
            sub = mt[mt["signal"] >= lo]
            st = trade_stats(sub, lo, mdf.index[-1])
            rows.append(dict(base=base, instrument=m, period=f"{lo.date()}-", **st))
        # E-mini futures proxy: base excess return, 0.5 bp/side, and T-bill on collateral
        if base == "SPY":
            fut = tr.copy()
            fut["net"] = (1 + fut["gross"]) * (1 - 0.5e-4) / (1 + 0.5e-4) - 1
            fut["excess"] = fut["net"] - fut["rf"]
            sub = fut[fut["signal"] >= SPLIT]
            st = trade_stats(sub, SPLIT, sdf.index[-1])
            rows.append(dict(base=base, instrument="MES/ES futures (proxy)", period="2008-", **st))
            # synthetic 1-month ATM call
            recs = []
            for t in tr.itertuples(index=False):
                if t.signal < SPLIT:
                    continue
                S0 = sdf.loc[t.entry, "O"]
                S1 = sdf.loc[t.exit, "O"] if t.how == "rule" else sdf.loc[t.exit, "C"]
                v0 = vix.asof(t.signal) / 100 * 0.95
                v1 = vix.asof(t.exit) / 100 * 0.95
                r = float(fred("DTB3").asof(t.signal)) / 100
                T0 = 30 / 365
                T1 = max(T0 - (t.exit - t.entry).days / 365, 1 / 365)
                c0 = bs_call(S0, S0, T0, r, v0)
                c1 = bs_call(S1, S0, T1, r, v1)
                net = c1 * 0.99 / (c0 * 1.01) - 1
                recs.append(dict(signal=t.signal, entry=t.entry, exit=t.exit, sessions=t.sessions, net=net,
                                 excess=net - t.rf, rf=t.rf, cost_bps=100, how=t.how, entry_px=c0, exit_px=c1,
                                 gross=c1 / c0 - 1, mae=np.nan, prem_pct=c0 / S0))
            ct = pd.DataFrame(recs)
            st = trade_stats(ct, SPLIT, sdf.index[-1])
            rows.append(dict(base=base, instrument="1m ATM call (BS @0.95*VIX, 1%/side)", period="2008-", **st,
                             avg_premium_pct_spot=float(ct["prem_pct"].mean())))
    save(pd.DataFrame(rows), "dip_instruments.csv")


# ----------------------------------------------------------------------------- 4. overlap
def overlap(k, x):
    spy = load("SPY")
    vix = load("^VIX")["C"].reindex(spy.index)
    v3 = load("^VIX3M")["C"].reindex(spy.index)
    tr200 = spy["C"] > sma(spy["C"], 200)
    dip, _ = dip_signal(spy)
    vt = first_cross((vix / v3 >= 1.0).fillna(False)) & tr200
    v30 = first_cross(vix >= 30)
    d = spy.index >= SPLIT
    rows = []
    for a_name, a in (("dip", dip), ("vixterm_up", vt), ("vix30_first", v30)):
        for b_name, b in (("dip", dip), ("vixterm_up", vt), ("vix30_first", v30)):
            # b fires within +-3 sessions of a
            bw = b.rolling(7, center=True, min_periods=1).max().astype(bool)
            rows.append(dict(a=a_name, b=b_name, a_days=int(a[d].sum()),
                             share_of_a_with_b_within_3d=float((a & bw)[d].sum() / max(a[d].sum(), 1))))
    save(pd.DataFrame(rows), "signal_overlap.csv")


# ----------------------------------------------------------------------------- 5. exits / thresholds
def sweep():
    rows = []
    for tk in ("SPY", "QQQ"):
        df = load(tk)
        c = df["C"]
        r2 = rsi_wilder(c, 2)
        tr200 = c > sma(c, 200)
        for thr in (2, 5, 10, 15, 20):
            e = (r2 < thr) & tr200
            for xname, xs, cap in (("C>SMA5", c > sma(c, 5), 10), ("C>SMA5", c > sma(c, 5), 20),
                                   ("RSI2>70", r2 > 70, 10), ("T3", None, 3), ("T5", None, 5)):
                tr = run_rule(df, e, mode="open", hold=cap, exit_sig=xs)
                for pname, (lo, hi) in {"IS (<2008)": (df.index[0], SPLIT), "OOS (2008-)": (SPLIT, END)}.items():
                    sub = tr[(tr["signal"] >= pd.Timestamp(lo)) & (tr["signal"] < pd.Timestamp(hi))]
                    st = trade_stats(sub, max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1]))
                    REG.add("meanrev:RSI2-sweep", f"RSI2<{thr}|{xname}|cap{cap}", tk, "open", pname, st)
                    rows.append(dict(inst=tk, thr=thr, exit=xname, cap=cap, period=pname, **st))
    save(pd.DataFrame(rows), "dip_sweep.csv")


def main():
    k, x = vix_term_proxy()
    print("proxy", k, x)
    stops()
    instruments()
    overlap(k, x)
    sweep()
    REG.save()
    print("done")


if __name__ == "__main__":
    main()
