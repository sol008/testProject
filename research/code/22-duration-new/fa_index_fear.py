"""Family (a): index crash / fear buys held 42 (60-day cap), 63 (90-day) and 84 (120-day) sessions.

Signals (market-wide, at the S&P close; track-13 definitions):
  DD-10/-15/-20   first close at or below -10/-15/-20% from the all-time high since the last ATH
  VIX>=30/40/45   first close at or above the level after 20 sessions below (VIX 1990-, VXO 1986-89,
                  realised-vol proxy RV21+4 before 1986 -- a proxy, reported in its own block)
  VIX/VIX3M>=1    first close >= 1.0 after 20 sessions below (VIX3M exists from 2006-07)
  DAY-3 / DAY-4   first S&P close of -3% / -4% or worse in 20 sessions (DAY-3 + up200 = track 17's W10)
Filter: none, or 'up200' = the PRIOR close above its 200-day SMA ("fear arriving in an uptrend").
Design: S&P total return 1928-2007 (next-close entries; opens are stale before ~2000), sub-blocks
1928-85 and 1986-2007.  Test: S&P 2008-2026 (next close) and SPY 2008-2026 (next open = executable).
VIX/VIX3M: design 2006-2015, test 2016-2026.  Robustness (not selection candidates): QQQ, IWM, EFA.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common22 as K

FAMILY = "a_index_fear"
HOLDS = (42, 63, 84)


def vix_series(spx: pd.DataFrame):
    vix = K.load("^VIX")["C"]
    vxo = K.fred("VXOCLS")
    rv = np.log(spx["C"]).diff().rolling(21).std() * np.sqrt(252) * 100 + 4.0
    g = rv.copy()
    m = (spx.index >= "1986-01-02") & (spx.index < "1990-01-02")
    vxo_d = vxo.reindex(spx.index)
    g[m & vxo_d.notna().values] = vxo_d[m & vxo_d.notna().values]
    vix_d = vix.reindex(spx.index)
    m2 = (spx.index >= "1990-01-02") & vix_d.notna().values
    g[m2] = vix_d[m2]
    return g.ffill()


def build_signals(spx: pd.DataFrame, gauge: pd.Series) -> dict[str, pd.Series]:
    s = {}
    dd = K.drawdown(spx["C"])
    for X in (10, 15, 20):
        s[f"DD-{X}"] = K.first_since_ath(dd, -X / 100)
    for L in (30, 40, 45):
        s[f"VIX>={L}"] = K.first_cross(gauge >= L, 20)
    v3 = K.load("^VIX3M")["C"].reindex(spx.index)
    vx = K.load("^VIX")["C"].reindex(spx.index)
    ratio = vx / v3
    s["VIX/VIX3M>=1"] = K.first_cross((ratio >= 1.0) & ratio.notna(), 20)
    r1 = spx["C"].pct_change()
    for D in (3, 4):
        s[f"DAY-{D}"] = K.first_cross(r1 <= -D / 100, 20)
    return s


def main():
    spx = K.load("^GSPC")
    spy = K.load("SPY")
    gauge = vix_series(spx)
    sigs = build_signals(spx, gauge)
    up200 = (spx["C"].shift(1) > K.sma(spx["C"], 200).shift(1))
    reg = K.Registry(FAMILY)
    robust = {t: K.load(t) for t in ("QQQ", "IWM", "EFA")}
    for name, sig in sigs.items():
        for filt in ("none", "up200"):
            e = sig & up200 if filt == "up200" else sig
            e = e.fillna(False)
            var = f"{name}|{filt}"
            is_ts = name.startswith("VIX/VIX3M")
            holds = HOLDS + ((60,) if name == "DAY-3" and filt == "up200" else ())
            for H in holds:
                vH = f"{var}|H{H}"
                role_sfx = "" if H in HOLDS else "_link"
                if is_ts:
                    blocks = [("design", spx, "close", "2006-07-17", "2015-12-31"),
                              ("test", spx, "close", "2016-01-01", None),
                              ("test_exec", spy, "open", "2016-01-01", None)]
                else:
                    blocks = [("design", spx, "close", "1928-01-01", "2007-12-31"),
                              ("design_1928_85", spx, "close", "1928-01-01", "1985-12-31"),
                              ("design_1986_07", spx, "close", "1986-01-01", "2007-12-31"),
                              ("test", spx, "close", "2008-01-01", None),
                              ("test_exec", spy, "open", "2008-01-01", None),
                              ("full", spx, "close", "1928-01-01", None)]
                for role, df, mode, a, b in blocks:
                    ee = e.reindex(df.index).fillna(False)
                    tr, st = K.evaluate(df, ee, H, mode, a, b, vix=gauge)
                    reg.add(vH, df.attrs["ticker"], role + role_sfx, st, tr, signal=name, filt=filt)
                # robustness (test period only; executable next-open fills)
                if H in HOLDS:
                    a0 = "2016-01-01" if is_ts else "2008-01-01"
                    for t, df in robust.items():
                        ee = e.reindex(df.index).fillna(False)
                        tr, st = K.evaluate(df, ee, H, "open", a0, None, vix=gauge)
                        reg.add(vH, t, "robust", st, None, signal=name, filt=filt)
        print("done", name, flush=True)
    df = reg.save()
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 500)
    df = main()
    cols = ["variant", "instrument", "role", "n", "per_yr", "win", "mean_net", "median_net", "worst",
            "mean_ex", "base", "edge", "t_edge", "p_placebo", "mdd"]
    show = df[df["role"].isin(["design", "test", "test_exec"])][cols]
    print(show.round(4).to_string())
