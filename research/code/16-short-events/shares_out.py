"""Point-in-time shares outstanding for every SEC filer, from the XBRL 'frames' API.

dei:EntityCommonStockSharesOutstanding (cover page of 10-Q/10-K), one frame per calendar
quarter 2009Q2-2026Q2; us-gaap:CommonStockSharesOutstanding (balance sheet) as fallback.
Market cap at an event = shares (latest fact dated >= 0 days before the event)
x the actual (unadjusted) price at the time.

Output (SCRATCH): shares_out.pkl  columns [cik, end, val, src]
"""
from __future__ import annotations

import pandas as pd

from common import SCRATCH, sec_cached_json


def main():
    rows = []
    for y in range(2009, 2027):
        for q in range(1, 5):
            if (y, q) > (2026, 2):
                continue
            for tax, tag, src in [("dei", "EntityCommonStockSharesOutstanding", "dei"),
                                  ("us-gaap", "CommonStockSharesOutstanding", "gaap")]:
                url = f"https://data.sec.gov/api/xbrl/frames/{tax}/{tag}/shares/CY{y}Q{q}I.json"
                d = sec_cached_json(url, f"frame_{src}_{y}Q{q}.json.gz")
                if not d:
                    continue
                for x in d.get("data", []):
                    rows.append((x["cik"], x["end"], x["val"], src))
            print(y, q, len(rows), flush=True)
    df = pd.DataFrame(rows, columns=["cik", "end", "val", "src"])
    df["end"] = pd.to_datetime(df["end"], errors="coerce")
    df = df.dropna().sort_values(["cik", "end"])
    df.to_pickle(SCRATCH / "shares_out.pkl")
    print(df.shape, df["src"].value_counts().to_dict())


class SharesLookup:
    def __init__(self):
        df = pd.read_pickle(SCRATCH / "shares_out.pkl")
        df = df[df["val"] > 0]
        # prefer dei when both exist for the same cik/end
        df = df.sort_values(["cik", "end", "src"]).drop_duplicates(["cik", "end"], keep="first")
        self.g = {c: (g["end"].values, g["val"].values) for c, g in df.groupby("cik")}

    def asof(self, cik: int, date, max_age_days: int = 400):
        v = self.g.get(int(cik))
        if v is None:
            return float("nan")
        ends, vals = v
        i = ends.searchsorted(pd.Timestamp(date).to_datetime64(), side="right") - 1
        if i < 0:
            return float("nan")
        if (pd.Timestamp(date) - pd.Timestamp(ends[i])).days > max_age_days:
            return float("nan")
        return float(vals[i])


if __name__ == "__main__":
    main()
