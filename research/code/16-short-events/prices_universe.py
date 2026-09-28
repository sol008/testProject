"""Download Yahoo daily prices (total-return adjusted OHLCV, 2005 onward) for the current
SEC list of NYSE / Nasdaq / Cboe tickers plus benchmark ETFs.

Survivorship: Yahoo drops delisted tickers entirely, and some old tickers have been reused
by new companies.  Every event study in this track therefore (a) validates the ticker
against an EDGAR price where possible and (b) reports the share of events with no price.

Run: python prices_universe.py
"""
from __future__ import annotations

import json

import pandas as pd

from common import SCRATCH, UA, load_prices, sec_get

BENCH = ["SPY", "IWM", "IWC", "IJR", "IJH", "MDY", "QQQ", "XBI", "IBB", "MNA", "MERFX", "ARBIX", "^VIX", "RSP",
         "IWB", "IWN", "IWO", "CSD", "IPO", "SPSM", "VTI", "BIL", "SHV", "^IRX", "BTC-USD", "IBIT"]


def universe() -> pd.DataFrame:
    f = SCRATCH / "company_tickers_exchange.json"
    if not f.exists():
        d = sec_get("https://www.sec.gov/files/company_tickers_exchange.json")
        f.write_text(json.dumps(d))
    d = json.loads(f.read_text())
    df = pd.DataFrame(d["data"], columns=d["fields"])
    df = df[df["exchange"].isin(["Nasdaq", "NYSE", "CBOE"])].copy()
    df["yf"] = df["ticker"].str.replace(".", "-", regex=False).str.upper()
    return df


def main():
    u = universe()
    print("universe tickers:", len(u))
    tick = BENCH + sorted(set(u["yf"]))
    px = load_prices(tick, start="2005-01-01", end="2026-09-27", batch=200)
    print("loaded", len(px), "of", len(tick))


if __name__ == "__main__":
    main()
