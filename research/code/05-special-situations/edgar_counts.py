"""Opportunity-frequency counts from SEC EDGAR full-text search (unique original filings per year).

  spin-offs            Form 10-12B mentioning "distribution"           (registration of spun-off shares)
  merger proxies       DEFM14A mentioning "merger agreement"
  cash tender offers   SC TO-T mentioning "offer to purchase"          (third-party tender offers)
  Dutch auctions       SC TO-I mentioning "modified Dutch auction"     (issuer self-tenders)
  going-private        SC 13E3
  SPAC IPOs (proxy)    S-1 mentioning "blank check company" AND "trust account"
  thrift conversions   S-1 mentioning "plan of conversion" AND "savings" AND "depositors"
  liquidations         DEF 14A / PRE 14A mentioning "plan of complete liquidation and dissolution"

Counts are *filings*, a proxy for the number of events; 10-12B can be filed for
non-spin registrations; S-1 SPAC counts include withdrawn deals.  Run time ~5-10 min.
Run: python edgar_counts.py     Output: output/edgar_counts.csv
"""
from __future__ import annotations

import time

import pandas as pd
import requests

from common import OUT, SCRATCH, UA

EFTS = "https://efts.sec.gov/LATEST/search-index"

QUERIES = {
    "spinoff_10-12B": ('"distribution"', "10-12B"),
    "merger_proxy_DEFM14A": ('"merger agreement"', "DEFM14A"),
    "cash_tender_SC_TO-T": ('"offer to purchase"', "SC TO-T"),
    "dutch_auction_SC_TO-I": ('"modified Dutch auction"', "SC TO-I"),
    "going_private_SC_13E3": ('"going private"', "SC 13E3"),
    "spac_ipo_S-1": ('"blank check company" "trust account"', "S-1"),
    "thrift_conversion_S-1": ('"plan of conversion" "savings" "depositors"', "S-1"),
    "liquidation_proxy": ('"plan of complete liquidation and dissolution"', "DEF 14A,PRE 14A"),
}


def count_unique(q: str, forms: str, y: int) -> int:
    seen, frm = set(), 0
    base_forms = set(forms.split(","))
    while True:
        params = {"q": q, "forms": forms, "dateRange": "custom", "startdt": f"{y}-01-01", "enddt": f"{y}-12-31", "from": frm}
        for i in range(5):
            r = requests.get(EFTS, params=params, headers=UA, timeout=60)
            if r.status_code == 200:
                break
            time.sleep(2 * (i + 1))
        d = r.json()
        hits = d["hits"]["hits"]
        for h in hits:
            s = h["_source"]
            if s.get("form") in base_forms:  # original filings only (exclude /A amendments)
                seen.add(s["adsh"])
        frm += len(hits)
        time.sleep(0.2)
        if not hits or frm >= d["hits"]["total"]["value"] or frm >= 9900:
            break
    return len(seen)


def main():
    cache = SCRATCH / "edgar_counts.csv"
    done = pd.read_csv(cache) if cache.exists() else pd.DataFrame(columns=["series", "year", "count"])
    rows = done.to_dict(orient="records")
    have = {(r["series"], int(r["year"])) for r in rows}
    for name, (q, forms) in QUERIES.items():
        for y in range(2012, 2027):
            if (name, y) in have:
                continue
            n = count_unique(q, forms, y)
            rows.append({"series": name, "year": y, "count": n})
            pd.DataFrame(rows).to_csv(cache, index=False)
            print(name, y, n, flush=True)
    df = pd.DataFrame(rows).pivot(index="year", columns="series", values="count").astype(int)
    df.to_csv(OUT / "edgar_counts.csv")
    print(df.to_string())


if __name__ == "__main__":
    main()
