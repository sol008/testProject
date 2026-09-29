"""Family (e): Bitcoin after deep drawdowns or 200-week-average touches, held 60 / 90 / 120 CALENDAR days
(crypto trades every day; these are the 42 / 63 / 84-session equivalents).

Data: Coin Metrics community PriceUSD (2010-07-18 -), spliced with Yahoo BTC-USD (track 06 cache).
Signals at the UTC daily close:
  DD-50 / DD-65 / DD-75   first close at or beyond -50/-65/-75% from the all-time high since the last ATH
  200WMA                  first close at or below the 200-week (1,400-day) average after 90 days above
  1.2x200WMA              first close at or below 1.2 x that average after 90 days above
Entry at the next daily close; 0.25% per side (retail spot; IBIT would be ~0.02%).
Design: signals before 2016; test: 2016-2026 (few episodes either way -> kappa 0.25, paper only if n < 10).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import common22 as K

FAMILY = "e_btc"
HOLDS = (60, 90, 120)


def btc_series() -> pd.Series:
    j = json.load(open(K.CACHE / "cm_btc.json"))
    s = pd.Series({pd.Timestamp(r["time"][:10]): float(r["PriceUSD"]) for r in j["data"] if r.get("PriceUSD")}).sort_index()
    y = pd.read_csv(K.CACHE / "yf_BTC-USD.csv", index_col=0, parse_dates=True)["Close"]
    s = pd.concat([s, y[y.index > s.index[-1]]])
    s = s[~s.index.duplicated()].asfreq("D").ffill()
    return s[s > 0]


def main():
    px = btc_series()
    rf = (K.fred("DTB3") / 100 / 365).reindex(px.index).ffill().bfill()
    df = K.synthetic_frame(px, "BTC", rf=rf)
    dd = K.drawdown(px)
    wma = px.rolling(1400, min_periods=1400).mean()
    sigs = {f"DD-{x}": K.first_since_ath(dd, -x / 100) for x in (50, 65, 75)}
    sigs["200WMA"] = K.first_cross(px <= wma, 90)
    sigs["1.2x200WMA"] = K.first_cross(px <= 1.2 * wma, 90)
    reg = K.Registry(FAMILY)
    ev = []
    for v, s in sigs.items():
        for d in s[s].index:
            ev.append(dict(signal=v, date=str(d.date()), price=round(float(px.loc[d]), 2),
                           dd=round(float(dd.loc[d]), 3),
                           x_wma=round(float(px.loc[d] / wma.loc[d]), 2) if pd.notna(wma.loc[d]) else np.nan))
        for H in HOLDS:
            vH = f"{v}|H{H}d"
            for role, a, b in (("design", None, "2015-12-31"), ("test", "2016-01-01", None), ("full", None, None)):
                tr, st = K.evaluate(df, s, H, "close", a, b, cost_bps=25.0, window=1095)
                reg.add(vH, "BTC", role, st, tr, signal=v)
    pd.DataFrame(ev).to_csv(K.RESULTS / "e_btc_signals.csv", index=False)
    return reg.save()


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    df = main()
    cols = ["variant", "role", "n", "win", "mean_net", "median_net", "worst", "base", "edge", "t_edge", "p_placebo", "mdd"]
    print(df[cols].round(3).to_string())
    print(pd.read_csv(K.RESULTS / "e_btc_signals.csv").to_string())
