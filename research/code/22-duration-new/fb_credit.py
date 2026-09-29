"""Family (b): credit-crisis buys held 42 / 63 / 84 sessions (track 05 held 12-24 months).

Credit spread = Moody's Baa minus the 10-year Treasury:
  * 1986-: FRED BAA10Y (daily), month-end value;
  * 1919-1985: FRED BAA (monthly average) minus the 10-year yield (FRED GS10 from 1953, Shiller's
    'Rate GS10' before), known at the month end.
Signals at a month-end close:
  ABS35  spread >= 3.5%  (track 05's trigger, chosen on 1990-2025 data, so in-sample there)
  Z2     spread >= its trailing 60-month mean + 2 sd  (a level-free proxy that also works in the 1930s-70s)
  flavour 'first' = first qualifying month-end after >= 6 non-qualifying ones; 'every' = every
  qualifying month-end (non-overlapping trades, so the position is re-bought while the condition lasts).
Instruments: Vanguard High-Yield Corporate fund VWEHX (NAV, 1980-; next-close entry), HYG (2007-; next
open), JNK, ANGL (robustness), S&P 500 total return (1928-; the equity expression) and SPY (next open).
Design: before 2008 (VWEHX 1980-2007; S&P 1928-2007).  Test: 2008-2026.  Reference: the 252-session
(12-month) hold track 05 used.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common22 as K

FAMILY = "b_credit"
HOLDS = (42, 63, 84)


def monthly_spread() -> pd.Series:
    baa = K.fred("BAA")                       # monthly avg, month-start stamps
    g10 = K.fred("GS10")
    sh = K.shiller_col("Rate GS10")
    ten = pd.concat([sh[sh.index < g10.index[0]], g10]).sort_index()
    pre = (baa - ten.reindex(baa.index)).dropna()
    pre.index = pre.index.to_period("M")
    d = K.fred("BAA10Y")
    post = d.groupby(d.index.to_period("M")).last()
    s = pd.concat([pre[pre.index < post.index[0]], post]).sort_index()
    return s


def month_signals(spread: pd.Series) -> dict[str, pd.Series]:
    mu = spread.rolling(60, min_periods=48).mean()
    sd = spread.rolling(60, min_periods=48).std()
    z = (spread - mu) / sd
    conds = {"ABS35": spread >= 3.5, "Z2": z >= 2.0}
    out = {}
    for k, c in conds.items():
        c = c.fillna(False)
        prev = c.shift(1).rolling(6, min_periods=1).max().fillna(0).astype(bool)
        out[f"{k}|first"] = c & ~prev
        out[f"{k}|every"] = c
    return out


def to_daily(msig: pd.Series, idx: pd.DatetimeIndex) -> pd.Series:
    months = msig[msig].index.to_timestamp()
    days = K.month_end_positions(idx, months)
    out = pd.Series(False, index=idx)
    out.loc[out.index.isin(days)] = True
    return out


def main():
    spread = monthly_spread()
    ms = month_signals(spread)
    spx = K.load("^GSPC")
    gauge = K.vix_gauge(spx)
    inst = {
        "VWEHX": (K.load("VWEHX"), "close", 10.0),
        "HYG": (K.load("HYG"), "open", 5.0),
        "JNK": (K.load("JNK"), "open", 5.0),
        "ANGL": (K.load("ANGL"), "open", 8.0),
        "^GSPC": (spx, "close", 1.0),
        "SPY": (K.load("SPY"), "open", 1.0),
    }
    reg = K.Registry(FAMILY)
    # episode listing for the report
    ep = []
    for k, s in ms.items():
        if k.endswith("|first"):
            for m in s[s].index:
                ep.append(dict(signal=k, month=str(m), spread=round(float(spread.loc[m]), 2)))
    pd.DataFrame(ep).to_csv(K.RESULTS / "b_credit_episodes.csv", index=False)
    for name, msig in ms.items():
        for H in HOLDS + (252,):
            role_sfx = "" if H in HOLDS else "_ref"
            v = f"{name}|H{H}"
            blocks = [
                ("VWEHX", "design", "1980-01-01", "2007-12-31"),
                ("VWEHX", "test", "2008-01-01", None),
                ("HYG", "test_exec", "2008-01-01", None),
                ("JNK", "robust", "2008-01-01", None),
                ("ANGL", "robust", "2012-06-01", None),
                ("^GSPC", "design_eq", "1928-01-01", "2007-12-31"),
                ("^GSPC", "test_eq", "2008-01-01", None),
                ("SPY", "test_eq_exec", "2008-01-01", None),
                ("VWEHX", "full", "1980-01-01", None),
                ("^GSPC", "full_eq", "1928-01-01", None),
            ]
            for tk, role, a, b in blocks:
                df, mode, cost = inst[tk]
                e = to_daily(msig, df.index)
                tr, st = K.evaluate(df, e, H, mode, a, b, cost_bps=cost, vix=gauge)
                reg.add(v, tk, role + role_sfx, st, tr, signal=name)
        print("done", name, flush=True)
    return reg.save()


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 500)
    df = main()
    cols = ["variant", "instrument", "role", "n", "per_yr", "win", "mean_net", "median_net", "worst",
            "mean_ex", "base", "edge", "t_edge", "p_placebo", "mdd"]
    print(df[cols].round(4).to_string())
