"""Out-of-sample check of the 10-month SMA rule on the 36 non-US indices / ETFs used in intl.py
(price-only indices, so both timing and buy-and-hold exclude dividends; cash earns US T-bills)."""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import common as C
import data
import intl as I
import trend as T

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")


def run():
    rf_m = (1 + data.daily_rf()).resample("ME").prod() - 1
    rows = []
    for label, src, tk, kind in I.MARKETS:
        try:
            m = I.load_market(label, src, tk, kind)
        except Exception:
            continue
        pm = m.px.resample("ME").last()
        if len(pm) < 60:
            continue
        r = pm.pct_change().fillna(0)
        rf = rf_m.reindex(pm.index).fillna(0)
        sma = pm.rolling(10).mean()
        pos = (pm > sma).shift(1).fillna(False).astype(bool)
        sw = pos.astype(int).diff().abs().fillna(0)
        rr = np.where(pos, r, rf) - sw * 0.001
        start = pm.index[10]
        eq = pd.Series(np.cumprod(1 + rr), index=pm.index).loc[start:]
        bh = (1 + r).cumprod().loc[start:]
        yrs = (eq.index[-1] - eq.index[0]).days / 365.25
        rows.append({"market": label, "start": start.date(), "years": round(yrs, 1),
                     "timing_CAGR": (eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1, "bh_CAGR": (bh.iloc[-1] / bh.iloc[0]) ** (1 / yrs) - 1,
                     "timing_maxDD": C.max_drawdown(eq), "bh_maxDD": C.max_drawdown(bh),
                     "round_trips_per_yr": float(sw.loc[start:].sum()) / 2 / yrs, "time_in_mkt": float(pos.loc[start:].mean())})
    df = pd.DataFrame(rows)
    df["CAGR_diff"] = df["timing_CAGR"] - df["bh_CAGR"]
    df["maxDD_improvement"] = df["timing_maxDD"] - df["bh_maxDD"]
    df.to_csv(os.path.join(OUT, "trend_sma10_intl.csv"), index=False)
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    d = run()
    print(d.round(3).to_string())
    print("markets:", len(d), "timing CAGR > B&H:", int((d.CAGR_diff > 0).sum()), "median CAGR diff", round(d.CAGR_diff.median(), 4),
          "maxDD better:", int((d.maxDD_improvement > 0).sum()), "median maxDD timing", round(d.timing_maxDD.median(), 3),
          "median maxDD bh", round(d.bh_maxDD.median(), 3))
