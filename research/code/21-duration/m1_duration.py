"""M1 (ST-1): would a longer maximum hold or a slower exit raise its contribution a year, robustly?

Entry (unchanged): SPY close above its 200-day average, Wilder RSI(2) < 10, VIX >= 20 -> buy at the next open.
Variants (all pre-declared here; 14 in total, counted against track 13's 533):
  exit close > SMA5 with cap 20 (M1 today), 40, 60 sessions;
  exit close > SMA10 with cap 20, 40, 60;  exit close > SMA20 with cap 40, 60;
  exit RSI(2) > 70 cap 20;  exit RSI(2) > 90 cap 40;
  time exits after 10, 20, 40, 60 sessions.
Samples: SPY next open 1993-2007 (pre) and 2008-2026 (post); S&P 1986-2026 with the VXO/VIX gate (next close);
S&P 1928-2026 WITHOUT the VIX gate (ST-1b analogue, next close) split 1928-2007 / 2008-2026.
Per variant and period: trades a year, mean excess over bills, t, timing edge (excess minus the instrument's
mean daily excess x sessions held) and its t, exposure, and the contribution a year at 6% of NAV:
  hist  = trades/yr x 6% x kappa x mean excess                  (design convention)
  edge  = trades/yr x 6% x kappa x timing edge                   (forward: drift ~ bills at CAPE 41)
Deflated Sharpe probability at N = 533 + 14.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common21 import KAPPA, save
from common13 import SPLIT, deflated_sr, fred, load, rsi_wilder, run_rule, sma, strategy_daily, stream_stats

SIZE = 0.06
END = pd.Timestamp("2026-09-29")


def variants(c: pd.Series, r2: pd.Series):
    V = []
    for cap in (20, 40, 60):
        V.append((f"SMA5 exit, cap {cap}", cap, c > sma(c, 5)))
    for cap in (20, 40, 60):
        V.append((f"SMA10 exit, cap {cap}", cap, c > sma(c, 10)))
    for cap in (40, 60):
        V.append((f"SMA20 exit, cap {cap}", cap, c > sma(c, 20)))
    V.append(("RSI2>70 exit, cap 20", 20, r2 > 70))
    V.append(("RSI2>90 exit, cap 40", 40, r2 > 90))
    for h in (10, 20, 40, 60):
        V.append((f"time exit {h}", h, None))
    return V


def period_stats(df, tr, lo, hi, u):
    sub = tr[(tr.signal >= pd.Timestamp(lo)) & (tr.signal < pd.Timestamp(hi))]
    yrs = (min(pd.Timestamp(hi), END) - max(pd.Timestamp(lo), df.index[0])).days / 365.25
    if len(sub) < 3:
        return {}
    x = sub.excess.values
    edge = x - u * sub.sessions.values
    sr = x.mean() / x.std(ddof=1)
    from scipy import stats
    r = strategy_daily(df, sub, max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1]))
    exp_ = float(sub.sessions.sum() / max(len(df.loc[lo:hi]), 1))
    return dict(n=len(sub), per_yr=len(sub) / yrs, mean_ex=x.mean(), t=sr * np.sqrt(len(x)), win=(sub.net > 0).mean(),
                sessions=sub.sessions.mean(), edge=edge.mean(), t_edge=edge.mean() / edge.std(ddof=1) * np.sqrt(len(edge)),
                exposure=exp_, worst=sub.net.min(),
                contrib_hist=len(sub) / yrs * SIZE * KAPPA * x.mean(),
                contrib_edge=len(sub) / yrs * SIZE * KAPPA * edge.mean(),
                dsr_547=deflated_sr(sr, len(x), float(stats.skew(x)), float(stats.kurtosis(x, fisher=False)), 547),
                mdd_1x=stream_stats(r, df["rf"]).get("mdd", np.nan))


def u_daily(df, lo, hi):
    x = (df["aC"].pct_change() - df["rf"]).loc[pd.Timestamp(lo):pd.Timestamp(hi) - pd.Timedelta(days=1)]
    return float(x.mean())


def main():
    rows = []
    # --- SPY, VIX-gated (M1 itself), next open
    spy = load("SPY")
    c = spy["C"]
    r2 = rsi_wilder(c, 2)
    vix = load("^VIX")["C"].reindex(spy.index)
    ent = (r2 < 10) & (c > sma(c, 200)) & (vix >= 20)
    for name, cap, ex in variants(c, r2):
        tr = run_rule(spy, ent, mode="open", hold=cap, exit_sig=ex)
        for per, lo, hi in (("SPY 1993-2007", "1993-01-01", "2008-01-01"), ("SPY 2008-2026", "2008-01-01", "2026-09-29")):
            st = period_stats(spy, tr, lo, hi, u_daily(spy, lo, hi))
            rows.append(dict(sample=per, variant=name, **st))
    # --- S&P, VXO/VIX gate, next close (1986-2026)
    gs = load("^GSPC")
    cg = gs["C"]
    r2g = rsi_wilder(cg, 2)
    vxo = fred("VXOCLS")
    vv = load("^VIX")["C"]
    gauge = pd.concat([vxo[vxo.index < "1990-01-02"], vv[vv.index >= "1990-01-02"]]).reindex(gs.index)
    entg = (r2g < 10) & (cg > sma(cg, 200)) & (gauge >= 20)
    entg[gs.index < "1986-01-02"] = False
    ent_b = (r2g < 10) & (cg > sma(cg, 200))
    for name, cap, ex in variants(cg, r2g):
        tr = run_rule(gs, entg, mode="close", hold=cap, exit_sig=ex)
        for per, lo, hi in (("S&P gated 1986-2007", "1986-01-01", "2008-01-01"), ("S&P gated 2008-2026", "2008-01-01", "2026-09-29")):
            st = period_stats(gs, tr, lo, hi, u_daily(gs, lo, hi))
            rows.append(dict(sample=per, variant=name, **st))
        trb = run_rule(gs, ent_b, mode="close", hold=cap, exit_sig=ex)
        for per, lo, hi in (("S&P ungated 1928-2007", "1928-10-01", "2008-01-01"), ("S&P ungated 2008-2026", "2008-01-01", "2026-09-29")):
            st = period_stats(gs, trb, lo, hi, u_daily(gs, lo, hi))
            rows.append(dict(sample=per, variant=name, **st))
    R = pd.DataFrame(rows)
    save(R, "m1_variants")
    pd.set_option("display.width", 260)
    cols = ["sample", "variant", "n", "per_yr", "mean_ex", "t", "sessions", "edge", "t_edge", "exposure", "worst",
            "contrib_hist", "contrib_edge", "dsr_547", "mdd_1x"]
    for smp, g in R.groupby("sample", sort=False):
        print("\n==", smp)
        print(g[cols].round(4).to_string(index=False))
    # robustness verdict: a variant "improves" if it beats the base in both halves of a family
    base = "SMA5 exit, cap 20"
    ver = []
    for fam, (a, b) in {"SPY": ("SPY 1993-2007", "SPY 2008-2026"), "S&P gated": ("S&P gated 1986-2007", "S&P gated 2008-2026"),
                        "S&P ungated": ("S&P ungated 1928-2007", "S&P ungated 2008-2026")}.items():
        for v in R.variant.unique():
            ra = R[(R["sample"] == a) & (R.variant == v)].iloc[0]
            rb = R[(R["sample"] == b) & (R.variant == v)].iloc[0]
            ba = R[(R["sample"] == a) & (R.variant == base)].iloc[0]
            bb = R[(R["sample"] == b) & (R.variant == base)].iloc[0]
            ver.append(dict(family=fam, variant=v,
                            hist_pre_vs_base=ra.contrib_hist - ba.contrib_hist, hist_post_vs_base=rb.contrib_hist - bb.contrib_hist,
                            edge_pre_vs_base=ra.contrib_edge - ba.contrib_edge, edge_post_vs_base=rb.contrib_edge - bb.contrib_edge,
                            robust_hist=(ra.contrib_hist > ba.contrib_hist) and (rb.contrib_hist > bb.contrib_hist),
                            robust_edge=(ra.contrib_edge > ba.contrib_edge) and (rb.contrib_edge > bb.contrib_edge)))
    Vt = pd.DataFrame(ver)
    save(Vt, "m1_robustness")
    print("\n== improvement vs the current M1 exit (contribution a year at 6%, kappa 0.5)")
    print(Vt.round(5).to_string(index=False))


if __name__ == "__main__":
    main()
