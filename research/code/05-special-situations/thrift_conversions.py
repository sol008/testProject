"""Mutual-to-stock thrift conversion IPOs: first-day and 1-year returns vs the $10.00 offering price.

Universe: companies filing an S-1 containing "plan of conversion", "savings" and
"depositors" (EDGAR full-text search, 2012-2026) whose EDGAR name carries a
ticker and whose Yahoo price history STARTS within 270 days after the S-1 (i.e.
a first-time listing = standard conversion or MHC minority IPO; second-step
conversions of already-listed MHCs are excluded because their history predates
the offering).  Conversion IPOs are almost always priced at $10.00/share.

Caveats: survivorship (acquired/delisted thrifts are missing from Yahoo, and
acquisitions are usually good outcomes); Yahoo 'first close' may be the first
full session; subscription-rights holders (eligible depositors) buy at $10 but
allocations in oversubscribed deals are rationed; outsiders can only buy after
the first trade.

Run: python thrift_conversions.py     Output: output/thrift_conversions.csv
"""
from __future__ import annotations

import re
import time

import numpy as np
import pandas as pd
import requests
import yfinance as yf

from common import OUT, UA, save_json

EFTS = "https://efts.sec.gov/LATEST/search-index"
TICK = re.compile(r"\(([A-Z][A-Z0-9.\-]{0,6})(?:,[^)]*)?\)\s*\(CIK")


def filers() -> pd.DataFrame:
    rows = []
    for y in range(2012, 2027):
        frm = 0
        while True:
            r = requests.get(EFTS, params={"q": '"plan of conversion" "savings" "depositors"', "forms": "S-1", "dateRange": "custom",
                                           "startdt": f"{y}-01-01", "enddt": f"{y}-12-31", "from": frm}, headers=UA, timeout=60)
            d = r.json()
            hits = d["hits"]["hits"]
            for h in hits:
                s = h["_source"]
                if s["form"] != "S-1":
                    continue
                name = (s.get("display_names") or [""])[0]
                m = TICK.search(name)
                rows.append({"cik": s["ciks"][0], "name": name[:70], "ticker": m.group(1) if m else None, "s1_date": s["file_date"]})
            frm += len(hits)
            time.sleep(0.25)
            if not hits or frm >= d["hits"]["total"]["value"]:
                break
    df = pd.DataFrame(rows).sort_values("s1_date").drop_duplicates("cik", keep="first")
    return df[df["ticker"].notna()]


def main():
    f = filers()
    out = []
    for r in f.itertuples(index=False):
        s1 = pd.Timestamp(r.s1_date)
        try:
            h = yf.download(r.ticker, start=s1 - pd.Timedelta(days=400), end=s1 + pd.Timedelta(days=1000), auto_adjust=True, progress=False)
        except Exception:  # noqa: BLE001
            continue
        if h is None or h.empty:
            out.append({**r._asdict(), "status": "no_yahoo_data"})
            continue
        c = h["Close"].squeeze().dropna()
        first = c.index[0]
        if first < s1 or first > s1 + pd.Timedelta(days=270):
            out.append({**r._asdict(), "status": "history_predates_or_too_late (second-step/other)"})
            continue
        p1 = float(c.iloc[0])
        def ret(days):
            w = c[c.index >= first + pd.Timedelta(days=days)]
            return float(w.iloc[0] / 10.0 - 1) if len(w) else np.nan
        out.append({**r._asdict(), "status": "ok", "first_trade": str(first.date()), "first_close": round(p1, 2),
                    "day1_ret_vs_10_%": round(100 * (p1 / 10 - 1), 1), "ret_6m_vs_10_%": round(100 * ret(182), 1),
                    "ret_1y_vs_10_%": round(100 * ret(365), 1), "ret_2y_vs_10_%": round(100 * ret(730), 1),
                    "ret_1y_from_first_close_%": round(100 * ((1 + ret(365)) * 10 / p1 - 1), 1) if not np.isnan(ret(365)) else np.nan})
    df = pd.DataFrame(out)
    df.to_csv(OUT / "thrift_conversions.csv", index=False)
    ok = df[df["status"] == "ok"].copy()
    # guard against non-$10 deals: drop first closes far from 10 (likely not a $10 conversion IPO)
    ok = ok[(ok["first_close"] > 5) & (ok["first_close"] < 25)]
    # keep depository institutions only (full-text query also hits a few non-bank S-1s, e.g. an E&P MLP)
    ok = ok[ok["name"].str.contains(r"banc|bank|financial|savings|thrift|federal|homestead|mutual", case=False, regex=True)]
    summ = {"n_filers_with_ticker": int(len(df)), "n_first_time_listings_used": int(len(ok)),
            "day1_ret_%": ok["day1_ret_vs_10_%"].describe().round(1).to_dict(),
            "share_day1_below_10": round(float((ok["day1_ret_vs_10_%"] < 0).mean()), 2),
            "ret_1y_vs_10_%": ok["ret_1y_vs_10_%"].describe().round(1).to_dict(),
            "ret_1y_from_first_close_%": ok["ret_1y_from_first_close_%"].describe().round(1).to_dict(),
            "by_year_median_day1_%": ok.assign(y=ok["first_trade"].str[:4]).groupby("y")["day1_ret_vs_10_%"].median().round(1).to_dict(),
            "by_year_n": ok.assign(y=ok["first_trade"].str[:4]).groupby("y").size().to_dict()}
    save_json(summ, "thrift_conversions_summary.json")
    print(ok[["ticker", "name", "first_trade", "first_close", "day1_ret_vs_10_%", "ret_1y_vs_10_%", "ret_1y_from_first_close_%"]].to_string())
    print(summ)


if __name__ == "__main__":
    main()
