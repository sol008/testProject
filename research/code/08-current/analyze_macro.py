"""Macro / rates / credit gauge table: latest value, 1y change, percentile vs full FRED history and vs the
post-2000 history, plus derived spreads (equity yield gap, real policy rate, curve).

Inputs: SCRATCH/fred_*.csv (fetch_fred.py), SCRATCH/market_close.csv (fetch_market.py)
Output: SCRATCH/snapshot_macro.csv (+ printed)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import SCRATCH, change_over, last_on_or_before, pct_rank


def rd(sid: str) -> pd.Series:
    s = pd.read_csv(SCRATCH / f"fred_{sid}.csv", index_col=0, parse_dates=True).iloc[:, 0]
    return s.dropna()


def yoy(s: pd.Series, periods: int = 12) -> pd.Series:
    return (s / s.shift(periods) - 1) * 100


GAUGES = [
    ("DFF", "Effective fed funds %", None), ("DGS2", "2y UST %", None), ("DGS10", "10y UST %", None),
    ("DGS30", "30y UST %", None), ("T10Y2Y", "10y-2y (pp)", None), ("T10Y3M", "10y-3m (pp)", None),
    ("DFII10", "10y TIPS real %", None), ("T10YIE", "10y breakeven %", None), ("T5YIFR", "5y5y infl fwd %", None),
    ("THREEFYTP10", "10y term premium (KW) %", None), ("MORTGAGE30US", "30y mortgage %", None),
    ("BAMLH0A0HYM2", "HY OAS %", None), ("BAMLC0A0CM", "IG OAS %", None), ("BAMLH0A3HYC", "CCC OAS %", None),
    ("BAMLH0A1HYBB", "BB OAS %", None), ("BAMLEMCBPIOAS", "EM corp OAS %", None), ("BAMLHE00EHYIOAS", "Euro HY OAS %", None),
    ("NFCI", "Chicago Fed NFCI", None), ("STLFSI4", "St Louis FSI", None), ("USEPUINDXD", "EPU daily (30d avg)", "ma30"),
    ("UNRATE", "Unemployment %", None), ("ICSA", "Initial claims (4wk avg)", "ma4"), ("CCSA", "Continuing claims", None),
    ("SAHMREALTIME", "Sahm rule", None), ("UMCSENT", "UMich sentiment", None), ("MICH", "UMich 1y infl exp %", None),
    ("CPIAUCSL", "CPI y/y %", "yoy"), ("CPILFESL", "Core CPI y/y %", "yoy"), ("PCEPILFE", "Core PCE y/y %", "yoy"),
    ("PAYEMS", "Payrolls 3m avg chg (k)", "d3"), ("DTWEXBGS", "Broad USD index", None), ("M2SL", "M2 y/y %", "yoy"),
    ("WALCL", "Fed assets ($bn)", "bn"), ("WRESBAL", "Reserves ($bn)", "bn_m"), ("RRPONTSYD", "ON RRP ($bn)", None),
    ("DRCCLACBS", "Card delinquency %", None), ("GFDEGDQ188S", "Fed debt % GDP", None),
    ("A091RC1Q027SBEA", "Fed interest outlays ($bn saar)", None), ("IRLTLT01JPM156N", "Japan 10y % (m)", None),
    ("IRLTLT01DEM156N", "Germany 10y % (m)", None), ("IRLTLT01GBM156N", "UK 10y % (m)", None),
    ("IRLTLT01FRM156N", "France 10y % (m)", None), ("IRLTLT01ITM156N", "Italy 10y % (m)", None),
]


def transform(s: pd.Series, how: str | None) -> pd.Series:
    if how == "yoy":
        return yoy(s)
    if how == "ma4":
        return s.rolling(4).mean().dropna()
    if how == "ma30":
        return s.rolling(30).mean().dropna()
    if how == "d3":
        return s.diff().rolling(3).mean().dropna()
    if how == "bn":
        return s / 1000.0
    if how == "bn_m":
        return s / 1000.0
    return s


def main():
    rows = []
    for sid, name, how in GAUGES:
        try:
            s = transform(rd(sid), how).dropna()
        except Exception as e:  # noqa: BLE001
            print("skip", sid, e)
            continue
        post2000 = s[s.index >= "2000-01-01"]
        rows.append({
            "series": sid, "name": name, "last_date": s.index[-1].date(), "last": s.iloc[-1],
            "1y_ago": last_on_or_before(s, s.index[-1] - pd.Timedelta(days=365)),
            "chg_1y": change_over(s, 365, pct=False), "pctile_full": pct_rank(s), "pctile_post2000": pct_rank(post2000),
            "min_post2000": post2000.min(), "max_post2000": post2000.max(), "hist_start": s.index[0].date(),
        })
    df = pd.DataFrame(rows).set_index("series")

    # Derived gauges
    close = pd.read_csv(SCRATCH / "market_close.csv", index_col=0, parse_dates=True)
    dgs10, dgs2, dff, dfii10 = rd("DGS10"), rd("DGS2"), rd("DFF"), rd("DFII10")
    core_pce = yoy(rd("PCEPILFE")).dropna()
    real_policy = dff.iloc[-1] - core_pce.iloc[-1]
    fwd_pe = 19.2  # FactSet Earnings Insight, 2026-09-25
    fwd_ey = 100 / fwd_pe
    extra = {
        "Real policy rate (EFFR - core PCE y/y), pp": real_policy,
        "Fwd earnings yield (1/19.2), %": fwd_ey,
        "Equity yield gap vs 10y nominal (pp)": fwd_ey - dgs10.iloc[-1],
        "Equity yield gap vs 10y real (pp)": fwd_ey - dfii10.iloc[-1],
        "2y minus EFFR (pp) [>0 = hikes priced]": dgs2.iloc[-1] - dff.iloc[-1],
        "30y UST max since 2007 (%)": rd("DGS30")[rd("DGS30").index >= "2007-01-01"].max(),
        "30y UST: date of last higher close": None,
        "10y UST: date of last higher close": None,
    }
    d30 = rd("DGS30")
    higher30 = d30[(d30 > d30.iloc[-1]) & (d30.index < d30.index[-1])]
    extra["30y UST: date of last higher close"] = higher30.index[-1].date() if len(higher30) else None
    higher10 = dgs10[(dgs10 > dgs10.iloc[-1]) & (dgs10.index < dgs10.index[-1])]
    extra["10y UST: date of last higher close"] = higher10.index[-1].date() if len(higher10) else None
    # yfinance live (today) yields for comparison, CBOE indices
    for t in ["^TNX", "^TYX", "^FVX", "^IRX"]:
        extra[f"{t} live (yfinance) %"] = float(close[t].dropna().iloc[-1])
    tyx = close["^TYX"].dropna()
    h = tyx[(tyx > tyx.iloc[-1]) & (tyx.index < tyx.index[-1])]
    extra["^TYX (30y) last higher close before today"] = h.index[-1].date() if len(h) else None
    tnx = close["^TNX"].dropna()
    h = tnx[(tnx > tnx.iloc[-1]) & (tnx.index < tnx.index[-1])]
    extra["^TNX (10y) last higher close before today"] = h.index[-1].date() if len(h) else None

    df.to_csv(SCRATCH / "snapshot_macro.csv")
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 200)
    print(df.round(3).to_string())
    print()
    for k, v in extra.items():
        print(f"{k}: {v if not isinstance(v, float) else round(v, 3)}")


if __name__ == "__main__":
    main()
