"""Live latency probe for the detection pipeline (run on a weekday evening, US Eastern time).

1. EDGAR 'current filings' Atom feed (Form 4, 8-K, SC 13D/SCHEDULE 13D): newest acceptance
   times vs. now  -> how fresh the free real-time feed is.
2. EDGAR full-text search (EFTS): for the newest Form 4 accessions in the feed, is the filing
   already searchable (query by filer CIK and today's date)?  -> indexing lag.
3. data.sec.gov submissions API for the same issuer: is the filing listed yet?
Output: output/latency_probe.json
"""
from __future__ import annotations

import re
import time
from datetime import datetime, timezone

import requests

from common import EFTS, UA, save_json, sec_get

ATOM = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type={t}&company=&dateb=&owner=include&count=40&output=atom"


def atom(t: str):
    r = requests.get(ATOM.format(t=t.replace(" ", "+")), headers=UA, timeout=60)
    txt = r.text
    entries = re.findall(r"<entry>(.*?)</entry>", txt, re.S)
    out = []
    for e in entries:
        upd = re.search(r"<updated>([^<]+)</updated>", e)
        acc = re.search(r"accession-number=([0-9\-]+)|(\d{10}-\d{2}-\d{6})", e)
        cik = re.search(r"/data/(\d+)/", e) or re.search(r"CIK=(\d+)", e)
        title = re.search(r"<title>([^<]+)</title>", e)
        out.append({"updated": upd.group(1) if upd else None, "acc": (acc.group(1) or acc.group(2)) if acc else None,
                    "cik": cik.group(1) if cik else None, "title": title.group(1)[:80] if title else None})
    return out


def main():
    now = datetime.now(timezone.utc)
    res = {"probe_time_utc": now.isoformat()}
    for t in ["4", "8-K", "SC 13D", "SCHEDULE 13D"]:
        t0 = time.time()
        try:
            es = atom(t)
        except Exception as e:  # noqa: BLE001
            res[f"atom_{t}"] = f"error {e}"
            continue
        lat = time.time() - t0
        ages = []
        for e in es:
            if e["updated"]:
                try:
                    u = datetime.fromisoformat(e["updated"])
                    ages.append((now - u).total_seconds() / 60)
                except Exception:  # noqa: BLE001
                    pass
        res[f"atom_{t}"] = {"entries": len(es), "request_secs": round(lat, 2),
                            "newest_age_min": round(min(ages), 1) if ages else None,
                            "oldest_of_40_age_min": round(max(ages), 1) if ages else None}
        if t == "4" and es:
            found, checked = 0, 0
            today = now.astimezone().date().isoformat()
            for e in es[:10]:
                if not e["acc"]:
                    continue
                checked += 1
                d = sec_get(EFTS, params={"q": "", "forms": "4", "dateRange": "custom", "startdt": today, "enddt": today,
                                          "ciks": (e["cik"] or "").zfill(10)})
                hits = (d or {}).get("hits", {}).get("hits", [])
                if any(h["_source"].get("adsh") == e["acc"] for h in hits):
                    found += 1
            res["efts_indexed_share_of_10_newest_form4"] = f"{found}/{checked}"
    save_json(res, "latency_probe.json")
    print(res)


if __name__ == "__main__":
    main()
