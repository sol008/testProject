"""Family (h): gold after sharp drawdowns, held 2 / 3 / 4 months (monthly design) and 42 / 63 / 84
sessions (daily test).

No free daily gold price exists before 2000 (FRED dropped the LBMA fix), so:
  DESIGN 1971-2007 on monthly average prices (datasets/gold-prices, track 06 cache): at a month end,
     drawdown of the monthly average from its trailing 12-month high <= -10/-15/-20% (first in 3 months);
     filter none / 'up10m' (the prior month above its 10-month average).  Entry = next month's average
     (conservative: no look-ahead), holds of 2/3/4 months, T-bills from TB3MS, 5 bp/side.
  DESIGN-2 2000-2007 and TEST 2008-2026 on daily COMEX gold (GC=F) / GLD: drawdown from the trailing
     252-session high <= -10/-15/-20% (first in 63 sessions); filter none / 'up200' (prior close above
     the 200-day average).  GLD at the next open, 2 bp/side.
"""
from __future__ import annotations

import pandas as pd

import common22 as K

FAMILY = "h_gold"
THR = (10, 15, 20)
MON = {42: 2, 63: 3, 84: 4}


def monthly_gold() -> pd.DataFrame:
    g = pd.read_csv(K.CACHE / "gold_monthly_github.csv")
    g.index = pd.to_datetime(g["Date"]) + pd.offsets.MonthEnd(0)
    px = g["Price"].astype(float)
    px = px[px.index >= "1968-01-01"]
    tb = K.fred("TB3MS") / 100 / 12
    tb.index = tb.index + pd.offsets.MonthEnd(0)
    rf = tb.reindex(px.index).ffill()
    df = K.synthetic_frame(px, "GOLDm", rf=rf)
    return df


def main():
    reg = K.Registry(FAMILY)
    # ---------------- monthly design
    gm = monthly_gold()
    p = gm["C"]
    dd12 = p / p.rolling(12, min_periods=12).max() - 1
    up10 = (p.shift(1) > p.rolling(10).mean().shift(1))
    for thr in THR:
        base = K.first_cross(dd12 <= -thr / 100, 3)
        for filt, s in (("none", base), ("up10m", base & up10)):
            for H, Hm in MON.items():
                v = f"DD{thr}|{filt}|H{H}"
                for role, a, b in (("design", "1971-01-01", "2007-12-31"), ("full_m", "1971-01-01", None)):
                    tr, st = K.evaluate(gm, s, Hm, "close", a, b, cost_bps=5.0, window=36)
                    reg.add(v, "GOLD monthly", role, st, tr, thr=thr, filt=filt)
    # ---------------- daily
    gc = K.load("GC=F")
    gld = K.load("GLD")
    c = gc["C"]
    dd = c / c.rolling(252, min_periods=200).max() - 1
    up200 = c.shift(1) > K.sma(c, 200).shift(1)
    for thr in THR:
        base = K.first_cross(dd <= -thr / 100, 63)
        for filt, s in (("none", base), ("up200", base & up200)):
            for H in MON:
                v = f"DD{thr}|{filt}|H{H}"
                for role, df, mode, a, b in (("design_d", gc, "close", "2000-09-01", "2007-12-31"),
                                             ("test", gc, "close", "2008-01-01", None),
                                             ("test_exec", gld, "open", "2008-01-01", None)):
                    tr, st = K.evaluate(df, s.reindex(df.index).fillna(False), H, mode, a, b, cost_bps=2.0)
                    reg.add(v, df.attrs["ticker"], role, st, tr, thr=thr, filt=filt)
    return reg.save()


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 300)
    df = main()
