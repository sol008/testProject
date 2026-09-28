"""Live merger-arbitrage scan from free data (SEC EDGAR + Yahoo) — demonstrates detectability.

Finds (a) third-party cash tender offers (SC TO-T) filed in the last LOOKBACK_TO days and
(b) definitive merger proxies (DEFM14A) filed in the last LOOKBACK_PROXY days, parses the
per-share cash consideration, and computes the current gross spread to the offer.

Heuristics (spot-check before use!):
  * price regex: "$X per share, net to the seller in cash" / "right to receive $X in cash"
  * target ticker = the listed party whose current price is closest to (and not far above) the offer
  * stock-for-stock and mixed deals are flagged, not priced; CVRs flagged
Run: python merger_scan.py     Output: output/merger_scan.csv
"""
from __future__ import annotations

import re
import time
from datetime import date, timedelta

import numpy as np
import pandas as pd
import requests
import yfinance as yf

from common import OUT, SCRATCH, UA

EFTS = "https://efts.sec.gov/LATEST/search-index"
TODAY = date.today()
LOOKBACK_TO, LOOKBACK_PROXY = 60, 120
TICK = re.compile(r"\(([A-Z][A-Z0-9.\-]{0,6}(?:,\s*[A-Z][A-Z0-9.\-]{0,6})*)\)\s*\(CIK")
NUM = r"\$\s?([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{1,4})?)"
PRICE_RX = [
    re.compile(NUM + r" per [Ss]hare,? net to the (?:seller|holder)[^.]{0,40}in cash", re.I),
    re.compile(r"(?:offer to purchase|to purchase) all (?:of the )?(?:issued and )?outstanding[^$]{0,200}?for " + NUM + r" per [Ss]hare", re.I),
    re.compile(r"right to receive " + NUM + r" (?:per share )?in cash", re.I),
    re.compile(r"converted into the right to receive (?:an amount in cash equal to )?" + NUM, re.I),
    re.compile(r"(?:merger consideration|per share merger consideration)[^$]{0,80}" + NUM + r" (?:per share )?in cash", re.I),
]


def efts_filings(q: str, forms: str, days: int) -> pd.DataFrame:
    rows, frm = [], 0
    start = (TODAY - timedelta(days=days)).isoformat()
    while True:
        r = requests.get(EFTS, params={"q": q, "forms": forms, "dateRange": "custom", "startdt": start, "enddt": TODAY.isoformat(), "from": frm},
                         headers=UA, timeout=60)
        d = r.json()
        hits = d["hits"]["hits"]
        for h in hits:
            s = h["_source"]
            rows.append({"adsh": s["adsh"], "file": h["_id"].split(":", 1)[1], "form": s["form"], "file_type": s.get("file_type"),
                         "date": s["file_date"], "ciks": s.get("ciks"), "names": s.get("display_names")})
        frm += len(hits)
        time.sleep(0.25)
        if not hits or frm >= d["hits"]["total"]["value"] or frm >= 2000:
            break
    return pd.DataFrame(rows)


def fetch(cik: str, adsh: str, fname: str) -> str:
    f = SCRATCH / "edgar_docs" / f"{adsh}_{fname}"
    f.parent.mkdir(exist_ok=True)
    if f.exists():
        return f.read_text(errors="ignore")
    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{adsh.replace('-', '')}/{fname}"
    r = requests.get(url, headers=UA, timeout=60)
    time.sleep(0.2)
    if r.status_code != 200:
        return ""
    t = re.sub(r"<[^>]+>", " ", r.text)
    t = re.sub(r"&nbsp;|&#160;|&#xa0;", " ", t)
    t = re.sub(r"\s+", " ", t)
    f.write_text(t)
    return t


def parse_price(txt: str):
    head = txt[:200000]
    for rx in PRICE_RX:
        m = rx.search(head)
        if m:
            v = float(m.group(1).replace(",", ""))
            if 0.05 < v < 5000:
                return v
    return np.nan


def scan(q: str, forms: str, days: int, kind: str) -> list:
    df = efts_filings(q, forms, days)
    if df.empty:
        return []
    df = df[df["form"] == forms]
    out = []
    for adsh, g in df.groupby("adsh"):
        names = g.iloc[0]["names"] or []
        tickers = []
        for n in names:
            m = TICK.search(n)
            if m:
                tickers += [t.strip() for t in m.group(1).split(",")]
        if not tickers:
            continue
        price = np.nan
        g = g.assign(pri=g["file_type"].fillna("").str.contains(r"\(A\)\(1\)\(A\)|DEFM14A|SC TO-T", regex=True).astype(int)).sort_values("pri", ascending=False)
        txt_all = ""
        for r in g.head(4).itertuples(index=False):
            txt = fetch(r.ciks[0], r.adsh, r.file)
            txt_all += txt[:50000]
            price = parse_price(txt)
            if not np.isnan(price):
                break
        stock_deal = bool(re.search(r"exchange ratio|shares of (?:parent|acquirer) common stock for each", txt_all, re.I))
        cvr = bool(re.search(r"contingent value right", txt_all, re.I))
        out.append({"kind": kind, "adsh": adsh, "filed": g.iloc[0]["date"], "names": " | ".join(n[:60] for n in names),
                    "tickers": ",".join(dict.fromkeys(tickers)), "offer_cash": price, "stock_component_flag": stock_deal, "cvr_flag": cvr})
    return out


def main():
    rows = scan('"offer to purchase"', "SC TO-T", LOOKBACK_TO, "tender") + scan('"merger agreement"', "DEFM14A", LOOKBACK_PROXY, "merger_vote")
    df = pd.DataFrame(rows)
    tick = sorted({t for s in df["tickers"] for t in s.split(",") if t})
    px = yf.download(tick, period="5d", auto_adjust=False, progress=False)["Close"].ffill().iloc[-1] if tick else pd.Series(dtype=float)
    best_t, best_p = [], []
    for r in df.itertuples(index=False):
        cands = [(t, float(px.get(t, np.nan))) for t in r.tickers.split(",") if t in px.index and not np.isnan(px.get(t, np.nan))]
        if np.isnan(r.offer_cash) or not cands:
            best_t.append(cands[0][0] if cands else None)
            best_p.append(cands[0][1] if cands else np.nan)
            continue
        # target = listed party trading closest to the offer (acquirer usually far away)
        t, p = min(cands, key=lambda c: abs(np.log(c[1] / r.offer_cash)))
        best_t.append(t)
        best_p.append(p)
    df["target_guess"] = best_t
    df["price_now"] = best_p
    df["gross_spread_%"] = 100 * (df["offer_cash"] / df["price_now"] - 1)
    df = df.sort_values("gross_spread_%", ascending=False)
    df.to_csv(OUT / "merger_scan.csv", index=False)
    pd.set_option("display.width", 250)
    print(df[["kind", "filed", "target_guess", "offer_cash", "price_now", "gross_spread_%", "stock_component_flag", "cvr_flag", "names"]].to_string())
    sane = df[(df["gross_spread_%"].abs() < 40) & (~df["stock_component_flag"])]
    print("\nparsed cash deals:", len(sane), " median gross spread %:", round(sane["gross_spread_%"].median(), 2),
          " share with spread < 0 (trading above offer -> bump expected):", round((sane["gross_spread_%"] < 0).mean(), 2))


if __name__ == "__main__":
    main()
