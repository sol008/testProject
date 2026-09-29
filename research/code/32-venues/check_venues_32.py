"""Track 32: can the owner actually trade the "make-rich" candidates on Robinhood and Coinbase?

Extends research/code/20-executability/check_venues.py to the instruments the new research
round is considering: 2x/3x index ETFs, inverse ETFs, spot and 2x crypto ETFs, and T-bill ETFs.

Public, unauthenticated endpoints only:
  * Robinhood instruments API: tradability, fractional (dollar) orders, extended-hours fractional,
    24-hour market eligibility, listed options, margin ratios, and per-account-type tradability.
  * Coinbase Exchange products API: spot BTC/ETH product status and minimum order size.
Account-level rules (IRA options level, IRA restrictions, acknowledgements) are not visible here;
they are checked against Robinhood's help pages in research/32-venues-tax-cadence.md.

Run:  python research/code/32-venues/check_venues_32.py
Output: venue_check_32.json next to this file, and a table on stdout.
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
UA = {"User-Agent": "Mozilla/5.0 (research check)"}

# ticker -> (group, leverage, why it is on the list)
TICKERS = {
    "SPY": ("index 1x", 1, "benchmark; M1/W10 today"),
    "VOO": ("index 1x", 1, "low-fee S&P 500"),
    "QQQ": ("index 1x", 1, "Nasdaq-100"),
    "SSO": ("index 2x", 2, "2x S&P 500 (ProShares)"),
    "UPRO": ("index 3x", 3, "3x S&P 500 (ProShares)"),
    "SPXL": ("index 3x", 3, "3x S&P 500 (Direxion)"),
    "QLD": ("index 2x", 2, "2x Nasdaq-100 (ProShares)"),
    "TQQQ": ("index 3x", 3, "3x Nasdaq-100 (ProShares)"),
    "SOXL": ("sector 3x", 3, "3x semiconductors (Direxion)"),
    "TECL": ("sector 3x", 3, "3x technology (Direxion)"),
    "SH": ("inverse", -1, "-1x S&P 500"),
    "SDS": ("inverse", -2, "-2x S&P 500"),
    "SPXU": ("inverse", -3, "-3x S&P 500"),
    "SQQQ": ("inverse", -3, "-3x Nasdaq-100"),
    "IBIT": ("crypto 1x", 1, "spot Bitcoin (iShares)"),
    "FBTC": ("crypto 1x", 1, "spot Bitcoin (Fidelity)"),
    "ETHA": ("crypto 1x", 1, "spot Ether (iShares)"),
    "BITX": ("crypto 2x", 2, "2x Bitcoin (Volatility Shares)"),
    "BITU": ("crypto 2x", 2, "2x Bitcoin (ProShares)"),
    "ETHU": ("crypto 2x", 2, "2x Ether (Volatility Shares)"),
    "NVDL": ("single-stock 2x", 2, "2x NVDA (GraniteShares), for flag comparison"),
    "SGOV": ("cash", 0, "0-3 month T-bills (iShares)"),
    "BIL": ("cash", 0, "1-3 month T-bills (SPDR)"),
}

FIELDS = [
    "state", "tradeable", "tradability", "type", "tax_security_type", "fractional_tradability",
    "extended_hours_fractional_tradability", "all_day_tradability", "tradable_chain_id",
    "margin_initial_ratio", "maintenance_ratio", "day_trade_ratio", "is_high_investment_risk",
    "car_required", "account_type_tradabilities", "reserved_buying_power_percent_queued",
    "reserved_buying_power_percent_immediate", "default_collar_fraction", "list_date", "simple_name",
]


def rh_instrument(sym):
    r = requests.get("https://api.robinhood.com/instruments/", params={"symbol": sym}, headers=UA, timeout=20)
    r.raise_for_status()
    res = r.json().get("results", [])
    return res[0] if res else None


def yes(v):
    return "yes" if v in (True, "tradable") else ("no" if v in (False, "untradable", None, "") else str(v))


def main():
    out = {"as_of_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "robinhood": {}, "coinbase": {}}
    hdr = f"{'ticker':5} {'group':15} {'trade':5} {'$ord':4} {'ext$':4} {'24h':4} {'opts':4} {'init':5} {'maint':5} {'car':5} acct-types"
    print(hdr)
    for sym, (group, lev, use) in TICKERS.items():
        try:
            ins = rh_instrument(sym)
        except Exception as e:  # network or schema issue
            ins = None
            print(sym, "ERROR", e)
        rec = {k: (ins or {}).get(k) for k in FIELDS} if ins else {"found": False}
        rec.update({"group": group, "leverage": lev, "use": use})
        out["robinhood"][sym] = rec
        if ins:
            acct = ",".join(f"{a['account_type']}:{a['account_type_tradability']}"
                            for a in (ins.get("account_type_tradabilities") or []))
            print(f"{sym:5} {group:15} {yes(ins.get('tradability')):5} {yes(ins.get('fractional_tradability')):4} "
                  f"{yes(ins.get('extended_hours_fractional_tradability')):4} {yes(ins.get('all_day_tradability')):4} "
                  f"{'yes' if ins.get('tradable_chain_id') else 'no':4} {ins.get('margin_initial_ratio')[:4]:5} "
                  f"{ins.get('maintenance_ratio')[:4]:5} {str(ins.get('car_required')):5} {acct}")
        else:
            print(f"{sym:5} NOT FOUND")
        time.sleep(0.4)

    print("\nCoinbase Exchange spot products:")
    for pid in ["BTC-USD", "ETH-USD"]:
        try:
            r = requests.get(f"https://api.exchange.coinbase.com/products/{pid}", headers=UA, timeout=20)
            rec = ({k: r.json().get(k) for k in ["status", "trading_disabled", "cancel_only", "post_only",
                                                  "limit_only", "auction_mode", "min_market_funds",
                                                  "quote_increment"]}
                   if r.status_code == 200 else {"http": r.status_code})
        except Exception as e:
            rec = {"error": str(e)}
        out["coinbase"][pid] = rec
        print(f"  {pid:8} {rec}")
        time.sleep(0.3)

    (HERE / "venue_check_32.json").write_text(json.dumps(out, indent=2))
    print("\nwritten", HERE / "venue_check_32.json")


if __name__ == "__main__":
    main()
