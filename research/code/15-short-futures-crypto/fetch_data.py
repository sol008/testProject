"""Warm the cache: download every raw series used by track 15 (idempotent; cached in SCRATCH).

Run: python fetch_data.py [yahoo|fred|eia|crypto|all]
"""
from __future__ import annotations

import sys

import common as C

YAHOO = [
    # ETF test universe (tradable proxies of futures markets)
    "SPY", "QQQ", "IWM", "EFA", "EEM", "EWJ", "TLT", "IEF", "SHY", "GLD", "SLV", "USO", "USL", "BNO", "UNG", "DBC", "DBA",
    "UUP", "FXE", "FXY", "FXB", "FXA", "FXC", "FXF", "DBV", "CPER",
    # long-history indices (design set)
    "^GSPC", "^IXIC", "^N225", "^FTSE", "^GDAXI", "^HSI", "^RUT", "^GSPTSE", "^AXJO", "^DJI", "^NDX",
    # futures (stitched front month; used only where roll bias is handled or irrelevant)
    "ES=F", "NQ=F", "RTY=F", "GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "ZN=F", "ZB=F", "6E=F", "6J=F", "BTC=F", "ETH=F",
    # managed futures funds / ETFs (live evidence)
    "AQMIX", "DBMF", "KMLM", "WTMF", "CTA", "RYMFX", "EQCHX", "ASFYX", "PQTAX", "AMFAX",
    # crypto
    "BTC-USD", "ETH-USD", "SOL-USD", "IBIT", "FBTC", "GBTC", "BITO",
    # vol
    "^VIX", "^TNX", "^IRX",
]
FRED = ["DTB3", "DGS3MO", "DGS1", "DGS2", "DGS5", "DGS7", "DGS10", "DGS30", "DFF",
        "DEXJPUS", "DEXUSUK", "DEXSZUS", "DEXCAUS", "DEXUSAL", "DEXGEUS", "DEXUSEU", "DEXUSNZ", "DEXSDUS", "DEXNOUS", "DEXMXUS",
        "IR3TIB01JPM156N", "IR3TIB01GBM156N", "IR3TIB01CHM156N", "IR3TIB01CAM156N", "IR3TIB01AUM156N", "IR3TIB01DEM156N",
        "IR3TIB01EZM156N", "IR3TIB01NZM156N", "IR3TIB01SEM156N", "IR3TIB01NOM156N", "IR3TIB01USM156N", "IR3TIB01MXM156N",
        "DCOILWTICO", "DCOILBRENTEU"]


def main(what: str = "all"):
    if what in ("yahoo", "all"):
        for t in YAHOO:
            try:
                df = C.yf_ohlc(t)
                print(f"YF {t:8s} {df.index[0].date()} -> {df.index[-1].date()} n={len(df)}")
            except Exception as e:  # noqa: BLE001
                print("YF FAIL", t, e)
            try:
                C.yf_ohlc(t, adjusted=False)
            except Exception:  # noqa: BLE001
                pass
    if what in ("fred", "all"):
        for s in FRED:
            try:
                x = C.fred(s)
                print(f"FRED {s:18s} {x.index[0].date()} -> {x.index[-1].date()} n={len(x)} last={x.iloc[-1]}")
            except Exception as e:  # noqa: BLE001
                print("FRED FAIL", s, e)
    if what in ("eia", "all"):
        for sym in C.EIA_SERIES:
            try:
                df = C.eia_curve(sym)
                print(f"EIA {sym} {df.dropna(how='all').index[0].date()} -> {df.index[-1].date()} n={len(df)}")
            except Exception as e:  # noqa: BLE001
                print("EIA FAIL", sym, e)
    if what in ("crypto", "all"):
        for a in ("btc", "eth"):
            s = C.crypto_daily(a)
            print(f"CM {a} {s.index[0].date()} -> {s.index[-1].date()} n={len(s)} last={s.iloc[-1]:.0f}")
        f = C.bitmex_funding()
        print("BitMEX funding", f.index[0], f.index[-1], len(f))
        for sym in ("BTCUSDT", "ETHUSDT"):
            b = C.binance_funding(sym)
            print("Binance funding", sym, b.index[0], b.index[-1], len(b))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
