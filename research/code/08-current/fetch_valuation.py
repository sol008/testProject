"""Valuation data: Shiller CAPE (Yale ie_data.xls) extended to today with S&P 500 price.

Output: SCRATCH/shiller_ie.csv, printed CAPE stats. Note: Shiller's file lags (monthly, earnings lag ~1-2 qtrs);
we compute a 'live' CAPE = today's S&P level / latest 10y avg real earnings (with inflation adjustment to latest CPI).
"""
from __future__ import annotations

import io

import numpy as np
import pandas as pd
import requests

from common import SCRATCH, UA, pct_rank

URL = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"


def load_shiller() -> pd.DataFrame:
    r = requests.get(URL, timeout=120, headers=UA)
    r.raise_for_status()
    (SCRATCH / "ie_data.xls").write_bytes(r.content)
    raw = pd.read_excel(io.BytesIO(r.content), sheet_name="Data", header=7)
    raw = raw.rename(columns={raw.columns[0]: "Date"})
    raw = raw[pd.to_numeric(raw["Date"], errors="coerce").notna()].copy()
    d = raw["Date"].astype(float)
    year = np.floor(d).astype(int)
    month = np.round((d - year) * 100).astype(int).clip(1, 12)
    raw.index = pd.to_datetime(dict(year=year, month=month, day=1))
    keep = {"P": "price", "D": "div", "E": "earn", "CPI": "cpi"}
    out = raw[[c for c in keep if c in raw.columns]].rename(columns=keep).apply(pd.to_numeric, errors="coerce")
    # CAPE column name differs across vintages
    cape_col = [c for c in raw.columns if str(c).strip().upper() in ("CAPE", "P/E10")]
    if cape_col:
        out["cape"] = pd.to_numeric(raw[cape_col[0]], errors="coerce")
    return out


def main():
    df = load_shiller()
    df.to_csv(SCRATCH / "shiller_ie.csv")
    cape = df["cape"].dropna() if "cape" in df else pd.Series(dtype=float)
    print("Shiller last rows:\n", df.dropna(subset=["price"]).tail(6))
    print("Latest official CAPE:", cape.index[-1].date(), round(cape.iloc[-1], 2),
          "percentile (1881+):", round(pct_rank(cape), 1), "max:", round(cape.max(), 2), cape.idxmax().date())

    # Live CAPE: 10y avg real earnings (to latest available E), scaled to today's price.
    e = df[["earn", "cpi"]].dropna()
    cpi_last = e["cpi"].iloc[-1]
    real_e = e["earn"] * cpi_last / e["cpi"]
    avg10 = real_e.iloc[-120:].mean()
    close = pd.read_csv(SCRATCH / "market_close.csv", index_col=0, parse_dates=True)["^GSPC"].dropna()
    spx = close.iloc[-1]
    # Adjust price to CPI of the earnings' last month using FRED CPI (approximation: price is nominal today;
    # real earnings are in e['cpi'] last-month dollars; inflate them to today's CPI).
    try:
        cpi_fred = pd.read_csv(SCRATCH / "fred_CPIAUCSL.csv", index_col=0, parse_dates=True).iloc[:, 0]
        infl_adj = cpi_fred.iloc[-1] / cpi_fred[cpi_fred.index <= e.index[-1]].iloc[-1]
    except Exception:  # noqa: BLE001
        infl_adj = 1.0
    live_cape = spx / (avg10 * infl_adj)
    print(f"E data through {e.index[-1].date()}, avg10 real E (latest $) = {avg10*infl_adj:.2f}; S&P {spx:.0f} -> live CAPE ~ {live_cape:.1f}")
    print("Percentile of live CAPE vs 1881+ monthly history:", round(pct_rank(cape, live_cape), 1))
    # Historical context
    for yr in ["1929-09", "1966-01", "1999-12", "2000-03", "2007-10", "2021-11", "2024-12", "2025-12"]:
        try:
            print(yr, round(cape.loc[yr].iloc[0], 2))
        except Exception:  # noqa: BLE001
            pass
    # Earnings yield vs real yield
    tips = pd.read_csv(SCRATCH / "fred_DFII10.csv", index_col=0, parse_dates=True).iloc[:, 0]
    print(f"CAPE earnings yield = {100/live_cape:.2f}% vs 10y TIPS real {tips.iloc[-1]:.2f}% -> excess CAPE yield {100/live_cape - tips.iloc[-1]:.2f}pp")


if __name__ == "__main__":
    main()
