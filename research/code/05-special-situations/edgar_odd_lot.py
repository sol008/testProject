"""Odd-lot priority in issuer tender offers: frequency and 'free' premium, from SEC EDGAR.

Method
  1. EDGAR full-text search (efts.sec.gov) for the phrase "odd lot" in original
     Schedule TO-I filings (issuer tender offers), 2012-2026.  Keep only filers
     whose EDGAR display name carries an exchange ticker (listed companies;
     drops non-traded REITs/BDCs/interval funds that dominate SC TO-I volume).
  2. Download the offer document and parse the price terms:
        modified Dutch auction  "not greater than $X nor less than $Y per share"
        fixed price             "at a price of $X per share" / "purchase price of $X"
  3. Compare the *minimum* price an odd-lot holder can receive (the low end of
     the Dutch range, or the fixed price) with the market close ~30 calendar
     days after filing (≈ just before expiry; offers must stay open >= 20
     business days).  Positive gap = locked-in gain for a <100-share holder who
     tenders at the clearing price, provided the offer closes (conditions!).

Caveats: regex parsing is imperfect (manually spot-check the output CSV);
the final clearing price of Dutch auctions is >= the minimum, so the gap is a
conservative lower bound; ignores broker tender fees; some offers are
conditional (financing, minimum tender) or withdrawn.

Run:  python edgar_odd_lot.py      Outputs: output/odd_lot_tenders.csv, output/odd_lot_summary.json
"""
from __future__ import annotations

import json
import re
import time
from datetime import timedelta

import numpy as np
import pandas as pd
import requests

from common import OUT, SCRATCH, UA, save_json

EFTS = "https://efts.sec.gov/LATEST/search-index"
CACHE = SCRATCH / "edgar_docs"
CACHE.mkdir(exist_ok=True)
TICK_RE = re.compile(r"\(([A-Z][A-Z0-9.\-]{0,6}(?:,\s*[A-Z][A-Z0-9.\-]{0,6})*)\)\s*\(CIK")


def efts(q: str, forms: str, start: str, end: str, frm: int = 0) -> dict:
    params = {"q": q, "forms": forms, "dateRange": "custom", "startdt": start, "enddt": end, "from": frm}
    for i in range(5):
        r = requests.get(EFTS, params=params, headers=UA, timeout=60)
        if r.status_code == 200:
            time.sleep(0.25)
            return r.json()
        time.sleep(2 * (i + 1))
    r.raise_for_status()


def collect(q='"odd lot"', forms="SC TO-I", years=range(2012, 2027)) -> pd.DataFrame:
    rows = []
    for y in years:
        frm = 0
        while True:
            d = efts(q, forms, f"{y}-01-01", f"{y}-12-31", frm)
            hits = d["hits"]["hits"]
            for h in hits:
                s = h["_source"]
                rows.append({"adsh": s["adsh"], "file": h["_id"].split(":", 1)[1], "form": s["form"], "file_type": s.get("file_type"),
                             "file_date": s["file_date"], "cik": s["ciks"][0] if s.get("ciks") else None,
                             "name": s["display_names"][0] if s.get("display_names") else ""})
            frm += len(hits)
            if not hits or frm >= d["hits"]["total"]["value"] or frm >= 1000:
                break
        print(y, "hits so far", len(rows), flush=True)
    return pd.DataFrame(rows)


def fetch_doc(cik: str, adsh: str, fname: str) -> str:
    f = CACHE / f"{adsh}_{fname}"
    if f.exists():
        return f.read_text(errors="ignore")
    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{adsh.replace('-', '')}/{fname}"
    for i in range(4):
        r = requests.get(url, headers=UA, timeout=60)
        if r.status_code == 200:
            txt = re.sub(r"<[^>]+>", " ", r.text)
            txt = re.sub(r"&nbsp;|&#160;|&#xa0;", " ", txt)
            txt = re.sub(r"&#8217;|&rsquo;", "'", txt)
            txt = re.sub(r"\s+", " ", txt)
            f.write_text(txt)
            time.sleep(0.2)
            return txt
        time.sleep(2 * (i + 1))
    return ""


NUM = r"\$\s?([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{1,4})?)"
PS = r"(?: per (?:share|unit|common share|share of common stock))?,?"
DUTCH = [
    re.compile(r"not (?:greater|more) than " + NUM + PS + r" (?:nor|or|and not) (?:less|lower) than " + NUM, re.I),
    re.compile(r"not (?:less|lower) than " + NUM + PS + r" (?:nor|and not|or|and) (?:greater|more|higher) than " + NUM, re.I),
    re.compile(r"(?:at|of) (?:a price|prices) (?:of )?(?:between|from) " + NUM + PS + r" (?:and|to) " + NUM, re.I),
    re.compile(r"price range of " + NUM + r" to " + NUM, re.I),
    re.compile(r"(?:between|range of) " + NUM + r" and " + NUM + r" per share", re.I),
]
FIXED = [
    re.compile(r"at a (?:cash )?(?:purchase )?price of " + NUM + r" per (?:share|unit)", re.I),
    re.compile(r"purchase price of " + NUM + r" per (?:share|unit)", re.I),
    re.compile(r"for " + NUM + r" per (?:share|unit), net to the seller in cash", re.I),
]


def fnum(s: str) -> float:
    return float(s.replace(",", ""))


def parse_terms(txt: str) -> dict:
    head = txt[:150000]
    if re.search(r"Canadian dollars|C\$\s?[0-9]|CDN\$|substantial issuer bid", head[:40000], re.I):
        return {"type": "non-USD", "lo": np.nan, "hi": np.nan}
    for i, rx in enumerate(DUTCH):
        m = rx.search(head)
        if m:
            a, b = fnum(m.group(1)), fnum(m.group(2))
            hi, lo = max(a, b), min(a, b)
            if lo > 0 and hi / lo < 3:
                return {"type": "dutch", "lo": lo, "hi": hi}
    for rx in FIXED:
        m = rx.search(head)
        if m:
            p = fnum(m.group(1))
            if p > 0:
                return {"type": "fixed", "lo": p, "hi": p}
    return {"type": None, "lo": np.nan, "hi": np.nan}


def has_odd_lot_priority(txt: str) -> bool:
    return bool(re.search(r"odd lot", txt, re.I)) and bool(re.search(r"(fewer than|less than) 100 shares", txt, re.I))


def main():
    raw_cache = SCRATCH / "edgar_oddlot_hits.csv"
    if raw_cache.exists():
        hits = pd.read_csv(raw_cache, dtype=str)
    else:
        hits = collect()
        hits.to_csv(raw_cache, index=False)
    hits["ticker"] = hits["name"].apply(lambda n: (TICK_RE.search(n or "").group(1).split(",")[0].strip() if TICK_RE.search(n or "") else None))
    orig = hits[hits["form"] == "SC TO-I"].copy()
    all_filings = orig.drop_duplicates("adsh")
    listed = all_filings[all_filings["ticker"].notna()].copy()
    print("unique SC TO-I filings mentioning odd lot:", len(all_filings), " listed:", len(listed))

    # choose the offer document: prefer exhibit (a)(1)(A) / offer to purchase, else the largest match
    recs = []
    for adsh, g in orig[orig["adsh"].isin(listed["adsh"])].groupby("adsh"):
        g = g.copy()
        g["score"] = g["file_type"].fillna("").str.contains(r"\(A\)\(1\)\(A\)|\(a\)\(1\)\(A\)|\(A\)\(1\)\(I\)", regex=True).astype(int) * 2 \
            + g["file"].str.contains(r"a1a|a1i|ex99a1a|exa1a|offer", case=False, regex=True).astype(int)
        g = g.sort_values("score", ascending=False)
        terms, used, prio = {"type": None, "lo": np.nan, "hi": np.nan}, None, False
        for r in g.itertuples(index=False):
            txt = fetch_doc(r.cik, r.adsh, r.file)
            t = parse_terms(txt)
            prio = prio or has_odd_lot_priority(txt)
            if t["type"]:
                terms, used = t, r.file
                break
        first = g.iloc[0]
        recs.append({"adsh": adsh, "ticker": first["ticker"], "name": first["name"][:80], "file_date": first["file_date"],
                     "doc": used, "odd_lot_priority_text": prio, **terms})
    df = pd.DataFrame(recs)
    df["file_date"] = pd.to_datetime(df["file_date"])

    # prices
    import yfinance as yf
    out = []
    for r in df.itertuples(index=False):
        if not isinstance(r.ticker, str) or pd.isna(r.lo):
            out.append({**r._asdict()})
            continue
        try:
            h = yf.download(r.ticker, start=r.file_date - timedelta(days=10), end=r.file_date + timedelta(days=70),
                            auto_adjust=False, progress=False)
            c = h["Close"].squeeze().dropna() if len(h) else pd.Series(dtype=float)
        except Exception:  # noqa: BLE001
            c = pd.Series(dtype=float)
        rec = {**r._asdict()}
        if len(c):
            pre = c[c.index < r.file_date]
            near_exp = c[c.index <= r.file_date + timedelta(days=30)]
            rec["px_pre"] = float(pre.iloc[-1]) if len(pre) else np.nan
            rec["px_day30"] = float(near_exp.iloc[-1]) if len(near_exp) else np.nan
            rec["px_min_d20_d35"] = float(c[(c.index >= r.file_date + timedelta(days=20)) & (c.index <= r.file_date + timedelta(days=35))].min()) if len(c) else np.nan
        out.append(rec)
    res = pd.DataFrame(out)
    # drop OTC foreign ordinaries (5-letter tickers ending in F) - prices in a different currency/market
    res = res[~res["ticker"].fillna("").str.match(r"^[A-Z]{4}F$")]
    res["premium_vs_pre_%"] = 100 * (res["lo"] / res["px_pre"] - 1)
    res["edge_min_vs_day30_%"] = 100 * (res["lo"] / res["px_day30"] - 1)
    res["profit_99sh_usd"] = 99 * (res["lo"] - res["px_day30"])
    res = res.sort_values("file_date")
    res.to_csv(OUT / "odd_lot_tenders.csv", index=False)

    ok = res.dropna(subset=["edge_min_vs_day30_%"])
    ok = ok[(ok["edge_min_vs_day30_%"].abs() < 60)]  # drop parse errors / unit mismatches
    ok["year"] = ok["file_date"].dt.year
    per_year = ok.groupby("year").agg(n=("adsh", "size"), n_pos_edge=("edge_min_vs_day30_%", lambda s: int((s > 0.5).sum())),
                                      med_edge=("edge_min_vs_day30_%", "median"),
                                      med_profit_99=("profit_99sh_usd", "median")).round(2)
    summary = {
        "unique_SC_TO-I_mentioning_odd_lot": int(len(all_filings)),
        "listed_with_ticker": int(len(listed)),
        "parsed_with_price_terms": int(res["lo"].notna().sum()),
        "usable_with_prices": int(len(ok)),
        "share_dutch": round(float((ok["type"] == "dutch").mean()), 3),
        "median_premium_vs_pre_announcement_%": round(float(ok["premium_vs_pre_%"].median()), 2),
        "median_edge_min_price_vs_day30_close_%": round(float(ok["edge_min_vs_day30_%"].median()), 2),
        "share_edge_gt_0.5pct": round(float((ok["edge_min_vs_day30_%"] > 0.5).mean()), 3),
        "share_edge_gt_2pct": round(float((ok["edge_min_vs_day30_%"] > 2).mean()), 3),
        "median_profit_99_shares_when_edge_gt_0.5pct_usd": round(float(ok.loc[ok["edge_min_vs_day30_%"] > 0.5, "profit_99sh_usd"].median()), 0),
        "mean_profit_99_shares_when_edge_gt_0.5pct_usd": round(float(ok.loc[ok["edge_min_vs_day30_%"] > 0.5, "profit_99sh_usd"].mean()), 0),
        "per_year": per_year.reset_index().to_dict(orient="records"),
    }
    save_json(summary, "odd_lot_summary.json")
    print(json.dumps(summary, indent=1, default=str))
    print(ok[["file_date", "ticker", "type", "lo", "hi", "px_pre", "px_day30", "edge_min_vs_day30_%", "profit_99sh_usd"]].tail(40).to_string())


if __name__ == "__main__":
    main()
