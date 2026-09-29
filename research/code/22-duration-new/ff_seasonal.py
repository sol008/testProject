"""Family (f): seasonal and midterm windows held 42 / 63 / 84 sessions (expected weak).

Windows (signal = the named close; entry next close for the S&P, next open for SPY):
  MIDTERM-SEP       midterm years (1930, 1934, ... 2022), last September session  (track 13: t 1.9 at 60)
  MIDTERM-SEP-DD5   the same, only if the S&P is > 5% below its 52-week high that day (track 17's split)
  ALL-OCT           every year, last October session (first half of the 'best six months')
  ALL-SEP           every year, last September session (control for the midterm effect)
Design: S&P total return 1928-2007.  Test: 2008-2026 (S&P next close; SPY next open).
"""
from __future__ import annotations

import pandas as pd

import common22 as K

FAMILY = "f_seasonal"
HOLDS = (42, 63, 84)


def last_session(idx: pd.DatetimeIndex, month: int) -> pd.Series:
    s = pd.Series(idx, index=idx)
    m = s[s.index.month == month]
    last = m.groupby(m.index.year).max()
    out = pd.Series(False, index=idx)
    out.loc[last.values] = True
    return out


def main():
    spx = K.load("^GSPC")
    spy = K.load("SPY")
    gauge = K.vix_gauge(spx)
    idx = spx.index
    sep = last_session(idx, 9)
    octo = last_session(idx, 10)
    midterm = pd.Series(((idx.year - 1930) % 4 == 0), index=idx)
    hi52 = spx["C"].rolling(252, min_periods=200).max()
    dd5 = spx["C"] / hi52 - 1 < -0.05
    sigs = {"MIDTERM-SEP": sep & midterm, "MIDTERM-SEP-DD5": sep & midterm & dd5,
            "ALL-OCT": octo, "ALL-SEP": sep}
    reg = K.Registry(FAMILY)
    for v, s in sigs.items():
        for H in HOLDS:
            vH = f"{v}|H{H}"
            for role, df, mode, a, b in (("design", spx, "close", "1928-01-01", "2007-12-31"),
                                         ("test", spx, "close", "2008-01-01", None),
                                         ("test_exec", spy, "open", "2008-01-01", None),
                                         ("full", spx, "close", "1928-01-01", None)):
                tr, st = K.evaluate(df, s.reindex(df.index).fillna(False), H, mode, a, b, vix=gauge)
                reg.add(vH, df.attrs["ticker"], role, st, tr, signal=v)
    return reg.save()


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    df = main()
    cols = ["variant", "instrument", "role", "n", "win", "mean_net", "median_net", "worst", "base", "edge",
            "t_edge", "p_placebo"]
    print(df[cols].round(3).to_string())
