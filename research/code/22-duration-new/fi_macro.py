"""Family (i): other 3-4 month families with literature support -- the end of a Fed hiking cycle and
yield-curve re-steepening -- held 42 / 63 / 84 sessions.

Policy rate, known in real time: FEDFUNDS monthly average (1954-07 to 1982-08, known at the month end),
then the daily target (DFEDTAR; DFEDTARU upper bound from 2008-12).  Evaluated at month ends.
  PAUSE     a hiking cycle (the 18-month high is >= 100 bp above the 3-year low), the last hike 3-5 months
            ago, no hike in the last 3 months and no cut yet (rate within 10 bp of the 18-month high;
            30 bp in the monthly-average era).  First month per cycle.  (The 'last hike' itself is only
            known ex post; this is its real-time proxy.)
  FIRSTCUT  first month end with the rate >= 25 bp (50 bp in the monthly-average era) below its 12-month
            high after such a cycle; one per 12 months.
  RESTEEP   10y - 3m (GS10 - TB3MS monthly before 1982, daily T10Y3M month end after) back >= 0 after
            >= 2 inverted month ends (track 06's definition).
Assets: synthetic 10-year (~IEF) and long bond (~TLT) total return, S&P 500 total return (next-close
entries); test also IEF / TLT / SPY at the next open.  Design: 1954-2007.  Test: 2008-2026.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common22 as K

FAMILY = "i_macro"
HOLDS = (42, 63, 84)


def policy_monthly() -> tuple[pd.Series, pd.Series]:
    ff = K.fred("FEDFUNDS")
    ff.index = ff.index.to_period("M")
    tar = pd.concat([K.fred("DFEDTAR"), K.fred("DFEDTARU")]).sort_index()
    tar = tar[~tar.index.duplicated(keep="last")]
    tm = tar.groupby(tar.index.to_period("M")).last()
    r = pd.concat([ff[ff.index < pd.Period("1982-10", "M")], tm[tm.index >= pd.Period("1982-10", "M")]]).sort_index()
    avg_era = pd.Series(r.index < pd.Period("1982-10", "M"), index=r.index)
    return r, avg_era


def fed_signals(r: pd.Series, avg_era: pd.Series) -> dict[str, pd.Series]:
    """PAUSE: exactly 3 month ends after the last hike of a cycle that rose >= 100 bp above its prior
    24-month low, with no cut since.  A 'hike' is a month-on-month rise > 5 bp (> 25 bp in the
    monthly-average era, where the effective rate is noisy).  FIRSTCUT: rate >= 25 bp (50 bp) below its
    12-month high after such a cycle, first in 12 months."""
    vals = r.values
    avg = avg_era.values
    n = len(r)
    pause = np.zeros(n, dtype=bool)
    last_hike = None
    for i in range(1, n):
        tol_h = 0.25 if avg[i] else 0.05
        tol_c = 0.30 if avg[i] else 0.10
        if vals[i] > vals[i - 1] + tol_h:
            last_hike = i
            continue
        if last_hike is None or i - last_hike != 3:
            continue
        lo24 = vals[max(0, last_hike - 24):last_hike].min() if last_hike > 0 else vals[last_hike]
        rise = vals[last_hike] - lo24
        no_cut = vals[last_hike:i + 1].min() >= vals[last_hike] - tol_c
        if rise >= 1.0 and no_cut:
            pause[i] = True
    hi12 = r.rolling(12, min_periods=6).max()
    lo36 = r.rolling(36, min_periods=24).min()
    hi18 = r.rolling(18, min_periods=12).max()
    cut = np.where(avg_era, 0.50, 0.25)
    fc_raw = ((r <= hi12 - cut) & (hi18 - lo36 >= 1.0)).fillna(False)
    fc = fc_raw & ~fc_raw.shift(1, fill_value=False).rolling(12, min_periods=1).max().astype(bool)
    return {"PAUSE": pd.Series(pause, index=r.index), "FIRSTCUT": fc}


def curve_signal() -> pd.Series:
    g10 = K.fred("GS10")
    g10.index = g10.index.to_period("M")
    tb = K.fred("TB3MS")
    tb.index = tb.index.to_period("M")
    pre = (g10 - tb.reindex(g10.index)).dropna()
    d = K.fred("T10Y3M")
    post = d.groupby(d.index.to_period("M")).last()
    s = pd.concat([pre[pre.index < post.index[0]], post]).sort_index()
    inv = s < 0
    two = inv.shift(1, fill_value=False) & inv.shift(2, fill_value=False)
    return ((s >= 0) & two).rename("RESTEEP")


def to_daily(msig: pd.Series, idx: pd.DatetimeIndex) -> pd.Series:
    months = msig[msig].index.to_timestamp()
    days = K.month_end_positions(idx, months)
    out = pd.Series(False, index=idx)
    out.loc[out.index.isin(days)] = True
    return out


def main():
    r, era = policy_monthly()
    sigs = fed_signals(r, era)
    sigs["RESTEEP"] = curve_signal()
    ev = [dict(signal=k, month=str(m)) for k, s in sigs.items() for m in s[s].index]
    pd.DataFrame(ev).to_csv(K.RESULTS / "i_macro_signals.csv", index=False)
    b10 = K.synthetic_frame(K.bond_tr(10), "UST10syn")
    b30 = K.synthetic_frame(K.bond_tr(30), "ULONGsyn")
    spx = K.load("^GSPC")
    gauge = K.vix_gauge(spx)
    etf = {"10y": K.load("IEF"), "long": K.load("TLT"), "spx": K.load("SPY")}
    syn = {"10y": (b10, 2.0), "long": (b30, 2.0), "spx": (spx, 1.0)}
    reg = K.Registry(FAMILY)
    for v, ms in sigs.items():
        for asset, (df, cost) in syn.items():
            for H in HOLDS:
                vH = f"{v}|{asset}|H{H}"
                for role, dfx, mode, a, b in (("design", df, "close", "1954-07-01", "2007-12-31"),
                                              ("test", df, "close", "2008-01-01", None),
                                              ("test_exec", etf[asset], "open", "2008-01-01", None),
                                              ("full", df, "close", "1954-07-01", None)):
                    e = to_daily(ms, dfx.index)
                    tr, st = K.evaluate(dfx, e, H, mode, a, b, cost_bps=cost, vix=gauge)
                    reg.add(vH, dfx.attrs["ticker"], role, st, tr, signal=v, asset=asset)
    return reg.save()


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 300)
    main()
    print(pd.read_csv(K.RESULTS / "i_macro_signals.csv").to_string())
