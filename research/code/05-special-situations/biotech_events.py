"""Stock reactions to FDA decisions: approvals (Drugs@FDA) vs complete response letters (openFDA CRLs).

Events 2020-2026:
  * approvals: original NDA (class TYPE 1 = new molecular entity) and original BLA approvals in Drugs@FDA
  * CRLs: openFDA transparency/crl letters (letter_date)
Sponsors are matched to listed tickers by normalised company name (SEC company_tickers.json).
Returns (Yahoo, split-adjusted closes) are market-adjusted with XBI:
  pre   = t-30 .. t-1 trading days      (run-up into the decision)
  event = t-1 .. t+2                    (decision/announcement window; CRL letters are often
                                         disclosed 0-3 days after the letter date)
  post  = t+2 .. t+30                   (drift after)
Split: 'small/volatile' = prior-60-day annualised vol > 60% (proxy for single-asset biotechs).

Caveats: name matching misses subsidiaries/private sponsors; letter dates != disclosure dates;
Drugs@FDA approval dates are action dates (PDUFA dates are usually known in advance, which is
exactly why the 'event' return should be small on average for expected approvals).
Run: python biotech_events.py      Output: output/biotech_events.csv, output/biotech_events_summary.json
"""
from __future__ import annotations

import json
import re
from datetime import timedelta

import numpy as np
import pandas as pd
import requests
import yfinance as yf

from common import OUT, SCRATCH, UA, get_json, save_json

SUFFIX = r"\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|ag|nv|se|llc|lp|holdings|holding|group|the)\b"


def norm(s: str) -> str:
    s = (s or "").lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(SUFFIX, " ", s)
    return re.sub(r"\s+", " ", s).strip()


def tickers() -> dict:
    f = SCRATCH / "company_tickers.json"
    if not f.exists():
        f.write_text(requests.get("https://www.sec.gov/files/company_tickers.json", headers=UA, timeout=60).text)
    d = json.loads(f.read_text())
    m = {}
    for v in d.values():
        m.setdefault(norm(v["title"]), v["ticker"])
    return m


def crl_events() -> pd.DataFrame:
    rows, skip = [], 0
    while True:
        d = get_json("https://api.fda.gov/transparency/crl.json", {"limit": 100, "skip": skip}, sleep=0.3)
        res = d.get("results", [])
        rows += res
        skip += len(res)
        if not res or skip >= d["meta"]["results"]["total"]:
            break
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["letter_date"], format="%m/%d/%Y", errors="coerce")
    return pd.DataFrame({"type": "CRL", "date": df["date"], "sponsor": df["company_name"], "app": df["application_number"].astype(str)})


def approval_events() -> pd.DataFrame:
    rows = []
    for y in range(2020, 2027):
        for half in [("0101", "0630"), ("0701", "1231")]:
            skip = 0
            while True:
                q = (f"submissions.submission_type:ORIG+AND+submissions.submission_status:AP+AND+"
                     f"submissions.submission_status_date:[{y}{half[0]}+TO+{y}{half[1]}]")
                url = f"https://api.fda.gov/drug/drugsfda.json?search={q}&limit=1000&skip={skip}"
                r = requests.get(url, timeout=60)
                if r.status_code != 200:
                    break
                d = r.json()
                res = d.get("results", [])
                for a in res:
                    app = a.get("application_number", "")
                    if not (app.startswith("NDA") or app.startswith("BLA")):
                        continue
                    for s in a.get("submissions", []):
                        if s.get("submission_type") == "ORIG" and s.get("submission_status") == "AP":
                            dt = s.get("submission_status_date", "")
                            cls = s.get("submission_class_code", "") or ""
                            if dt[:4] == str(y) and (app.startswith("BLA") or cls.startswith("TYPE 1")):
                                rows.append({"type": "APPROVAL", "date": pd.to_datetime(dt), "sponsor": a.get("sponsor_name"), "app": app})
                skip += len(res)
                if not res or skip >= d["meta"]["results"]["total"]:
                    break
    return pd.DataFrame(rows).drop_duplicates(["app", "date"])


def main():
    tk = tickers()
    ev = pd.concat([crl_events(), approval_events()], ignore_index=True)
    ev = ev[(ev["date"] >= "2020-01-01")].copy()
    ev["ticker"] = ev["sponsor"].map(lambda s: tk.get(norm(s)))
    matched = ev.dropna(subset=["ticker"]).copy()
    print("events:", ev["type"].value_counts().to_dict(), " matched:", matched["type"].value_counts().to_dict(), flush=True)
    syms = sorted(set(matched["ticker"]) | {"XBI"})
    px = yf.download(syms, start="2019-06-01", auto_adjust=True, progress=False)["Close"]
    xbi = px["XBI"]
    recs = []
    for r in matched.itertuples(index=False):
        if r.ticker not in px:
            continue
        s = px[r.ticker].dropna()
        if len(s) < 100:
            continue
        idx = s.index.searchsorted(r.date)
        if idx < 61 or idx + 31 >= len(s):
            continue
        def ar(a, b):
            ra = s.iloc[idx + b] / s.iloc[idx + a] - 1
            m = xbi.reindex(s.index)
            rm = m.iloc[idx + b] / m.iloc[idx + a] - 1
            return float(ra - rm)
        vol = float(np.log(s.iloc[idx - 61:idx - 1]).diff().std() * np.sqrt(252))
        recs.append({"type": r.type, "date": r.date.date(), "ticker": r.ticker, "sponsor": r.sponsor, "prior_vol": round(vol, 3),
                     "pre_-30_-1": ar(-31, -1), "event_-1_+2": ar(-1, 2), "post_+2_+30": ar(2, 30)})
    df = pd.DataFrame(recs)
    df.to_csv(OUT / "biotech_events.csv", index=False)
    df["small"] = df["prior_vol"] > 0.60
    summ = {}
    for (t, sm), g in df.groupby(["type", "small"]):
        key = f"{t}_{'small_volatile' if sm else 'large_or_calm'}"
        summ[key] = {"n": int(len(g))}
        for c in ["pre_-30_-1", "event_-1_+2", "post_+2_+30"]:
            summ[key][c] = {"mean_%": round(100 * g[c].mean(), 1), "median_%": round(100 * g[c].median(), 1),
                            "share_neg": round(float((g[c] < 0).mean()), 2)}
        summ[key]["event_p10_%"] = round(100 * g["event_-1_+2"].quantile(0.10), 1)
        summ[key]["event_p90_%"] = round(100 * g["event_-1_+2"].quantile(0.90), 1)
    save_json(summ, "biotech_events_summary.json")
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main()
