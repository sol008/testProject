"""Download the SEC "Insider Transactions Data Sets" (Forms 3/4/5, 2006Q1 onward) and extract
open-market purchases (code P) and sales (code S) by reporting owners.

Source: https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets
(quarterly zips of the XML Form 4 content, flattened by the SEC).  Point-in-time: every
row carries the EDGAR FILING_DATE, which is when the trade became public.  Delisted
issuers are included (their filings stay on EDGAR).

Output (SCRATCH): insider_PS.pkl.gz  - one row per non-derivative P/S transaction line.
Run: python insider_download.py
"""
from __future__ import annotations

import io
import re
import time
import zipfile

import pandas as pd
import requests

from common import SCRATCH, UA

ZDIR = SCRATCH / "f345"
ZDIR.mkdir(exist_ok=True)
PAGE = "https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets"


def links() -> list[str]:
    html = requests.get(PAGE, headers=UA, timeout=60).text
    ls = re.findall(r'href="([^"]*form345\.zip)"', html)
    return sorted(set(ls))


def fetch(link: str) -> bytes:
    name = link.rsplit("/", 1)[1]
    f = ZDIR / name
    if f.exists() and f.stat().st_size > 1_000_000:
        return f.read_bytes()
    for i in range(5):
        r = requests.get("https://www.sec.gov" + link, headers=UA, timeout=300)
        if r.status_code == 200 and r.content[:2] == b"PK":
            f.write_bytes(r.content)
            time.sleep(0.3)
            return r.content
        time.sleep(3 * (i + 1))
    raise RuntimeError(f"failed {link}")


def read_tsv(z: zipfile.ZipFile, name: str, cols: list[str]) -> pd.DataFrame:
    with z.open(name) as fh:
        df = pd.read_csv(fh, sep="\t", dtype=str, usecols=lambda c: c in cols, quoting=3, on_bad_lines="skip",
                         encoding="latin-1")
    return df


def extract(blob: bytes, qname: str) -> pd.DataFrame:
    z = zipfile.ZipFile(io.BytesIO(blob))
    sub = read_tsv(z, "SUBMISSION.tsv", ["ACCESSION_NUMBER", "FILING_DATE", "DOCUMENT_TYPE", "ISSUERCIK",
                                          "ISSUERNAME", "ISSUERTRADINGSYMBOL"])
    own = read_tsv(z, "REPORTINGOWNER.tsv", ["ACCESSION_NUMBER", "RPTOWNERCIK", "RPTOWNERNAME",
                                              "RPTOWNER_RELATIONSHIP", "RPTOWNER_TITLE"])
    tr = read_tsv(z, "NONDERIV_TRANS.tsv", ["ACCESSION_NUMBER", "SECURITY_TITLE", "TRANS_DATE", "TRANS_FORM_TYPE",
                                             "TRANS_CODE", "TRANS_SHARES", "TRANS_PRICEPERSHARE",
                                             "TRANS_ACQUIRED_DISP_CD", "SHRS_OWND_FOLWNG_TRANS",
                                             "DIRECT_INDIRECT_OWNERSHIP"])
    tr = tr[tr["TRANS_CODE"].isin(["P", "S"])]
    # one row per accession for the owner: keep all owners but flag the count (joint filings)
    own["n_owners"] = own.groupby("ACCESSION_NUMBER")["RPTOWNERCIK"].transform("count")
    own = own.drop_duplicates("ACCESSION_NUMBER", keep="first")  # first-listed owner represents the filing
    df = tr.merge(sub, on="ACCESSION_NUMBER", how="left").merge(own, on="ACCESSION_NUMBER", how="left")
    df["quarter"] = qname
    return df


def main():
    ls = links()
    print(len(ls), "quarterly files")
    parts = []
    for l in ls:
        q = l.rsplit("/", 1)[1].split("_")[0]
        blob = fetch(l)
        d = extract(blob, q)
        parts.append(d)
        print(q, len(blob) // 1_000_000, "MB", len(d), "P/S rows", flush=True)
    df = pd.concat(parts, ignore_index=True)
    for c in ["TRANS_SHARES", "TRANS_PRICEPERSHARE", "SHRS_OWND_FOLWNG_TRANS"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["FILING_DATE"] = pd.to_datetime(df["FILING_DATE"], format="%d-%b-%Y", errors="coerce")
    df["TRANS_DATE"] = pd.to_datetime(df["TRANS_DATE"], format="%d-%b-%Y", errors="coerce")
    df.to_pickle(SCRATCH / "insider_PS.pkl.gz")
    print("rows", len(df), "P rows", (df["TRANS_CODE"] == "P").sum(), "S rows", (df["TRANS_CODE"] == "S").sum())
    print(df.groupby(df["FILING_DATE"].dt.year)["TRANS_CODE"].value_counts().unstack())


if __name__ == "__main__":
    main()
