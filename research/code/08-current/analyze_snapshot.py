"""Compute the cross-asset snapshot table: level, 1y / YTD change, drawdown from ATH, distance from
200-day MA, and percentile vs full available history (for level-type gauges).

Inputs: SCRATCH/market_close.csv, SCRATCH/fred_*.csv (run fetch_market.py and fetch_fred.py first)
Output: SCRATCH/snapshot_market.csv, SCRATCH/snapshot_fred.csv (+ printed tables)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import SCRATCH, change_over, last_on_or_before, pct_rank

close = pd.read_csv(SCRATCH / "market_close.csv", index_col=0, parse_dates=True)
meta = pd.read_csv(SCRATCH / "market_meta.csv", index_col=0)

# Gauges where the *level* percentile is meaningful (vs. price series where drawdown/MA are used)
LEVEL_GAUGES = {"^VIX", "^VIX9D", "^VIX3M", "^VIX6M", "^VVIX", "^SKEW", "^MOVE", "^OVX", "^GVZ", "^VXN",
                "^IRX", "^FVX", "^TNX", "^TYX"}


def row_for(tkr: str) -> dict:
    s = close[tkr].dropna()
    if len(s) < 5:
        return {"ticker": tkr, "name": meta.loc[tkr, "name"], "last": s.iloc[-1] if len(s) else np.nan}
    last = float(s.iloc[-1])
    ath = float(s.max())
    ath_date = s.idxmax().date()
    atl_1y = float(s[s.index >= s.index[-1] - pd.Timedelta(days=365)].min())
    ma200 = float(s.rolling(200).mean().iloc[-1]) if len(s) >= 200 else np.nan
    ytd_base = last_on_or_before(s, "2025-12-31")
    out = {
        "ticker": tkr,
        "name": meta.loc[tkr, "name"],
        "last": last,
        "last_date": s.index[-1].date(),
        "chg_1d_%": (last / float(s.iloc[-2]) - 1) * 100,
        "chg_1m_%": change_over(s, 30),
        "chg_ytd_%": (last / ytd_base - 1) * 100 if not np.isnan(ytd_base) else np.nan,
        "chg_1y_%": change_over(s, 365),
        "dd_from_ath_%": (last / ath - 1) * 100,
        "ath": ath,
        "ath_date": ath_date,
        "vs_200dma_%": (last / ma200 - 1) * 100 if not np.isnan(ma200) else np.nan,
        "1y_low": atl_1y,
        "hist_start": s.index[0].date(),
    }
    if tkr in LEVEL_GAUGES:
        out["pctile_full_hist"] = pct_rank(s)
        out["pctile_10y"] = pct_rank(s[s.index >= s.index[-1] - pd.Timedelta(days=3652)])
        out["chg_1y_level"] = change_over(s, 365, pct=False)
    return out


def main():
    rows = [row_for(t) for t in close.columns if close[t].notna().sum() > 0]
    snap = pd.DataFrame(rows).set_index("ticker")
    snap.to_csv(SCRATCH / "snapshot_market.csv")

    # --- Derived ratios
    derived = {}
    def ratio(a, b, name):
        r = (close[a] / close[b]).dropna()
        derived[name] = {
            "last": r.iloc[-1], "chg_1y_%": change_over(r, 365), "dd_from_max_%": (r.iloc[-1] / r.max() - 1) * 100,
            "max_date": r.idxmax().date(), "pctile_full": pct_rank(r), "start": r.index[0].date(),
        }
    ratio("RSP", "SPY", "RSP/SPY (equal vs cap weight)")
    ratio("^RUT", "^GSPC", "Russell 2000 / S&P 500")
    ratio("^NDX", "^GSPC", "Nasdaq100 / S&P500")
    ratio("GC=F", "^GSPC", "Gold / S&P 500")
    ratio("SI=F", "GC=F", "Silver / Gold (x1)")
    ratio("HG=F", "GC=F", "Copper / Gold")
    ratio("ETH-USD", "BTC-USD", "ETH / BTC")
    ratio("KRE", "SPY", "KRE / SPY")
    ratio("BIZD", "SPY", "BDC ETF / SPY")
    ratio("SMH", "SPY", "Semis / SPY")
    ratio("IGV", "SPY", "Software / SPY")
    ratio("XLU", "SPY", "Utilities / SPY")
    ratio("SPHB", "SPLV", "High beta / Low vol")
    ratio("XLY", "XLP", "Discretionary / Staples")
    ratio("HYG", "IEF", "HYG / IEF (credit risk appetite)")
    ratio("EEM", "SPY", "EM / SPY")
    ratio("EFA", "SPY", "EAFE / SPY")
    ratio("^VIX", "^VIX3M", "VIX / VIX3M (term structure)")
    ratio("^VIX9D", "^VIX", "VIX9D / VIX")
    dr = pd.DataFrame(derived).T
    dr.to_csv(SCRATCH / "snapshot_ratios.csv")

    pd.set_option("display.width", 260)
    pd.set_option("display.max_rows", 400)
    pd.set_option("display.max_columns", 30)
    cols = ["name", "last", "chg_1d_%", "chg_1m_%", "chg_ytd_%", "chg_1y_%", "dd_from_ath_%", "ath", "ath_date",
            "vs_200dma_%", "pctile_full_hist", "pctile_10y", "hist_start"]
    print(snap[cols].round(2).to_string())
    print()
    print(dr.round(3).to_string())


if __name__ == "__main__":
    main()
