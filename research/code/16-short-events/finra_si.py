"""Download FINRA consolidated short interest (twice-monthly settlement dates, 2018-01 onward;
the public API has no earlier data) for exchange-listed symbols.

Endpoint: POST https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest
Point in time: FINRA publishes each settlement date's data about 7 business days later, so
event studies must only use a settlement date <= event date - 12 calendar days.
Output (SCRATCH): finra_si.pkl  [settlementDate, symbolCode, marketClassCode, currentShortPositionQuantity,
                                   averageDailyVolumeQuantity, daysToCoverQuantity]
"""
from __future__ import annotations

import time

import pandas as pd
import requests

from common import SCRATCH

URL = "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest"
KEEP = ["settlementDate", "symbolCode", "marketClassCode", "currentShortPositionQuantity", "averageDailyVolumeQuantity",
        "daysToCoverQuantity"]
LISTED = {"NYSE", "NNM", "SC", "AMEX", "ARCA", "BZX", "NGS", "NCM", "NMS"}


def settlement_dates() -> list[str]:
    """FINRA settlement dates are ~15th and month-end business days; probe candidates."""
    out = []
    for m in pd.date_range("2018-01-01", "2026-09-30", freq="MS"):
        for day in (15, None):
            base = m + pd.Timedelta(days=14) if day else (m + pd.offsets.MonthEnd(0))
            out.append(base)
    return out


def fetch_date(d: pd.Timestamp) -> pd.DataFrame | None:
    # try the nominal date and up to 4 business days earlier (settlement dates move with holidays)
    for back in range(0, 6):
        dd = (d - pd.Timedelta(days=back)).date().isoformat()
        rows, off = [], 0
        while True:
            body = {"limit": 5000, "offset": off, "fields": KEEP,
                    "compareFilters": [{"compareType": "EQUAL", "fieldName": "settlementDate", "fieldValue": dd}]}
            for i in range(4):
                try:
                    r = requests.post(URL, json=body, headers={"Accept": "application/json"}, timeout=120)
                    break
                except Exception:  # noqa: BLE001
                    time.sleep(3 * (i + 1))
            if r.status_code == 204 or not r.text.strip():
                break
            chunk = r.json()
            rows += chunk
            total = int(r.headers.get("record-total", len(rows)))
            off += len(chunk)
            if off >= total or not chunk:
                break
            time.sleep(0.2)
        if rows:
            df = pd.DataFrame(rows)
            return df[df["marketClassCode"].isin(LISTED)][KEEP]
    return None


def main():
    f = SCRATCH / "finra_si.pkl"
    parts, done = [], set()
    if f.exists():
        old = pd.read_pickle(f)
        parts.append(old)
        done = set(old["settlementDate"].unique())
    for d in settlement_dates():
        if d > pd.Timestamp("2026-09-20"):
            continue
        if any(abs((pd.Timestamp(x) - d).days) <= 5 for x in done):
            continue
        df = fetch_date(d)
        if df is not None and len(df):
            parts.append(df)
            done.add(df["settlementDate"].iloc[0])
            print(df["settlementDate"].iloc[0], len(df), flush=True)
        if len(parts) % 10 == 0:
            pd.concat(parts, ignore_index=True).to_pickle(f)
    out = pd.concat(parts, ignore_index=True).drop_duplicates(["settlementDate", "symbolCode"])
    out.to_pickle(f)
    print("rows", len(out), "dates", out["settlementDate"].nunique())


if __name__ == "__main__":
    main()
