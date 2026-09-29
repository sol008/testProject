"""Executability check (track 20): are the instruments the v3.1 design can recommend
actually tradable on the owner's venues (Robinhood for stocks/ETFs/options, Coinbase for crypto)?

Uses public, unauthenticated endpoints only:
  * Robinhood instruments API  (tradability, fractional/dollar orders, extended/24h sessions, option chain)
  * Coinbase Exchange products API (spot crypto products and their status)
Results are a point-in-time snapshot; account-level permissions (option levels, IRA rules) are not
visible without logging in and are checked separately from Robinhood's help pages.
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
UA = {"User-Agent": "Mozilla/5.0 (research check)"}

# ticker -> why the design needs it
TICKERS = {
    "SPY": "M1 dip-buy, W10, M2 leg, O2/W8 option fallback",
    "VOO": "alternative S&P 500 ETF (core / low fee)",
    "QQQ": "M2 leg",
    "IEF": "M2 leg (7-10y Treasuries)",
    "GLD": "M2 leg (gold)",
    "USO": "M2 leg (crude), W9 options",
    "FXE": "M2 leg (euro)",
    "FXY": "M2 leg (yen)",
    "FXA": "M2 leg (Australian dollar)",
    "IBIT": "M3 Bitcoin switch (ETF route)",
    "FBTC": "M3 alternative Bitcoin ETF",
    "DAL": "W8 de-escalation call spreads",
    "TLT": "W3 shadow / rates setups",
    "BNO": "oil (Brent) alternative",
    "SGOV": "idle cash (T-bill ETF)",
    "BIL": "idle cash (T-bill ETF)",
    "DBMF": "managed-futures ETF (M2 option c, not chosen)",
}

FIELDS = ["state", "tradeable", "tradability", "fractional_tradability", "extended_hours_fractional_tradability",
          "all_day_tradability", "tradable_chain_id", "type", "simple_name"]


def rh_instrument(sym):
    r = requests.get("https://api.robinhood.com/instruments/", params={"symbol": sym}, headers=UA, timeout=20)
    r.raise_for_status()
    res = r.json().get("results", [])
    return res[0] if res else None


def main():
    out = {"as_of_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "robinhood": {}, "coinbase": {}}
    print(f"{'ticker':6} {'tradeable':9} {'fractional':11} {'ext-hrs frac':12} {'24h':12} {'options':7}  use")
    for sym, use in TICKERS.items():
        try:
            ins = rh_instrument(sym)
        except Exception as e:  # network or schema issue
            ins = None
            print(sym, "ERROR", e)
        rec = {k: (ins or {}).get(k) for k in FIELDS} if ins else {"found": False}
        rec["use"] = use
        out["robinhood"][sym] = rec
        if ins:
            print(f"{sym:6} {str(ins.get('tradeable')):9} {str(ins.get('fractional_tradability')):11} "
                  f"{str(ins.get('extended_hours_fractional_tradability')):12} {str(ins.get('all_day_tradability')):12} "
                  f"{'yes' if ins.get('tradable_chain_id') else 'no':7}  {use}")
        else:
            print(f"{sym:6} NOT FOUND  {use}")
        time.sleep(0.4)

    print("\nCoinbase Exchange spot products:")
    for pid in ["BTC-USD", "ETH-USD", "USDT-USD", "USDC-USD", "USDT-USDC", "BTC-USDC"]:
        try:
            r = requests.get(f"https://api.exchange.coinbase.com/products/{pid}", headers=UA, timeout=20)
            if r.status_code == 200:
                p = r.json()
                rec = {k: p.get(k) for k in ["status", "trading_disabled", "cancel_only", "post_only", "limit_only",
                                               "auction_mode", "min_market_funds", "quote_increment"]}
            else:
                rec = {"http": r.status_code}
        except Exception as e:
            rec = {"error": str(e)}
        out["coinbase"][pid] = rec
        print(f"  {pid:10} {rec}")
        time.sleep(0.3)

    (HERE / "venue_check.json").write_text(json.dumps(out, indent=2))
    print("\nwritten", HERE / "venue_check.json")


if __name__ == "__main__":
    main()
