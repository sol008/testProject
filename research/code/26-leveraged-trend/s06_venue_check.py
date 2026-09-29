"""s06 - are the leveraged funds tradable with dollar (fractional) market orders on Robinhood?

Public, unauthenticated Robinhood instruments API (same method as track 20's check_venues.py).
Account-level rules (IRA eligibility of leveraged ETFs, the in-app acknowledgement) are not visible
without logging in; see the report for what Robinhood's help pages say.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import requests

import common as c

UA = {"User-Agent": "Mozilla/5.0 (research check)"}
FIELDS = ["state", "tradeable", "tradability", "fractional_tradability", "extended_hours_fractional_tradability",
          "all_day_tradability", "type", "simple_name"]


def main():
    out = {"as_of_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "robinhood": {}}
    for sym in ["UPRO", "SSO", "SPXL", "TQQQ", "QLD", "SGOV", "BIL", "SPY", "QQQ"]:
        try:
            r = requests.get("https://api.robinhood.com/instruments/", params={"symbol": sym}, headers=UA, timeout=20)
            res = r.json().get("results", [])
            ins = res[0] if res else {}
            row = {k: ins.get(k) for k in FIELDS}
            row["has_option_chain"] = bool(ins.get("tradable_chain_id"))
        except Exception as e:  # pragma: no cover - network
            row = {"error": str(e)}
        out["robinhood"][sym] = row
        print(sym, row)
    (c.OUT / "s06_venue_check.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
