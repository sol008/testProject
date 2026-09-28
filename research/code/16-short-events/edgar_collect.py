"""Collect event filings from EDGAR full-text search (EFTS), 2011-01 -> 2026-09.

  13d      : original Schedule 13D (form 'SC 13D' through 2024; 'SCHEDULE 13D' from Dec-2024)
  buyback  : 8-Ks mentioning a share/stock repurchase (or buyback) program
  specdiv  : 8-Ks mentioning a "special dividend" / "special cash dividend"
  earn     : 8-Ks whose text contains Item 2.02's title (earnings releases)
EFTS returns one hit per document; we keep one row per accession number (adsh) with the
union of item numbers.  Outputs: SCRATCH/edgar_<kind>.pkl
Run: python edgar_collect.py [kind ...]
"""
from __future__ import annotations

import sys

import pandas as pd

from common import SCRATCH, efts_search

KINDS = {
    "13d": [("", "SC 13D"), ("", "SCHEDULE 13D")],
    "buyback": [('"share repurchase program" OR "stock repurchase program" OR "share buyback program" OR '
                 '"repurchase authorization" OR "authorized the repurchase"', "8-K")],
    "specdiv": [('"special dividend" OR "special cash dividend"', "8-K")],
    "earn": [('"results of operations and financial condition"', "8-K")],
    "ipo": [('"initial public offering"', "424B4")],
}


def windows(kind: str):
    """monthly windows (weekly for the high-volume earnings search)."""
    if kind == "earn":
        d = pd.date_range("2011-01-01", "2026-09-27", freq="7D")
        return [(a.date().isoformat(), (b - pd.Timedelta(days=1)).date().isoformat()) for a, b in zip(d[:-1], d[1:])] + \
               [(d[-1].date().isoformat(), "2026-09-27")]
    m = pd.date_range("2011-01-01", "2026-10-01", freq="MS")
    return [(a.date().isoformat(), (b - pd.Timedelta(days=1)).date().isoformat()) for a, b in zip(m[:-1], m[1:])]


def collect(kind: str, y0: int = 2011, y1: int = 2026, assemble: bool = True) -> pd.DataFrame:
    parts = []
    for q, forms in KINDS[kind]:
        for s, e in windows(kind):
            if not (y0 <= int(s[:4]) <= y1):
                continue
            if forms == "SCHEDULE 13D" and e < "2024-11-01":
                continue
            if forms == "SC 13D" and s > "2025-03-31":
                continue
            df = efts_search(q, forms, s, e, max_hits=10000, cache_tag=f"{kind}_{forms.replace(' ', '')}_{s}")
            if len(df):
                parts.append(df)
        print(kind, forms, "done", sum(len(p) for p in parts), flush=True)
    if not assemble:
        return pd.DataFrame()
    raw = pd.concat(parts, ignore_index=True)
    raw["items_s"] = raw["items"].apply(lambda x: ",".join(sorted(set(x or []))))
    g = raw.groupby("adsh").agg(form=("form", "first"), file_date=("file_date", "first"), ciks=("ciks", "first"),
                                names=("names", "first"), items=("items_s", lambda s: ",".join(sorted({i for x in s for i in x.split(",") if i}))),
                                files=("file", lambda s: list(s)), sics=("sics", "first")).reset_index()
    g["file_date"] = pd.to_datetime(g["file_date"])
    g.to_pickle(SCRATCH / f"edgar_{kind}.pkl")
    print(kind, "filings:", len(g), g["form"].value_counts().head(6).to_dict(), flush=True)
    return g


if __name__ == "__main__":
    # usage: python edgar_collect.py 13d buyback      (full collection + assembly)
    #        python edgar_collect.py earn:2011:2014   (cache-fill a year range only, no assembly)
    kinds = sys.argv[1:] or ["13d", "specdiv", "buyback", "earn"]
    for k in kinds:
        if ":" in k:
            kk, a, b = k.split(":")
            collect(kk, int(a), int(b), assemble=False)
        else:
            collect(k)
