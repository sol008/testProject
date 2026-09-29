"""Family 1b: how long do US cash deals take to close?  (Which deals does a 60 / 90 / 120-day cap admit?)

Data: SEC EDGAR only (free, point in time).
  * Tender offers: original SC 14D9 filings (the TARGET's recommendation statement, filed within 10 business days
    of commencement), found with full-text search (q = "tender offer"), 2014-2025.
  * One-step cash mergers: original DEFM14A filings (the target's definitive proxy) containing the standard cash
    consideration phrase "in cash, without interest", 2014-2025.
  * For every target CIK, its full filing index (data.sec.gov/submissions) gives
      announcement = earliest DEFA14A / SC14D9C / SC TO-C / PREM14A in the chain of such filings that ends at the
                     anchor (consecutive filings <= 90 days apart, at most 300 days before the anchor);
      completion   = first Form 25-NSE / 25 / 15-12B / 15-12G / 15-15D after the anchor (delisting at closing).
    Deals with no completion form within 730 days are "unresolved" (broken, withdrawn, or still pending).
Outputs: results/f1_deal_durations.csv (one row per deal) and results/f1_deal_duration_summary.csv.
A follower enters the session after the email, i.e. at announcement + 1 business day at the earliest.

Caveats: text search misses some deals and catches some non-deals (e.g. a DEFM14A for a cash sale of assets);
announcement dates from DEFA14A chains can be late if the parties did not file soliciting material on day 0.
The completion form is filed on or within a day or two of the closing.  Prices are NOT available for completed
targets (Yahoo drops delisted tickers), so this file measures durations only; returns come from fund proxies.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import requests  # noqa: E402

from common24 import RESULTS, SCRATCH, save  # noqa: E402

SEC = SCRATCH / "sec"
SEC.mkdir(exist_ok=True)
UA = {"User-Agent": "ResearchBot research@example.com"}
_last = [0.0]
YEARS = range(2014, 2026)
ANN_FORMS = {"DEFA14A", "SC14D9C", "SC TO-C", "PREM14A"}
DONE_FORMS = {"25-NSE", "25", "15-12B", "15-12G", "15-15D"}


def sec_get(url: str, as_json: bool = True):
    for i in range(6):
        wait = 0.13 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            r = requests.get(url, headers=UA, timeout=60)
        except Exception:  # noqa: BLE001
            time.sleep(2 * (i + 1))
            continue
        if r.status_code == 200:
            return r.json() if as_json else r.content
        if r.status_code == 404:
            return None
        time.sleep(2 * (i + 1))
    return None


def efts(q: str, form: str, start: str, end: str) -> list[dict]:
    tag = "".join(ch for ch in f"{q}_{form}_{start}_{end}" if ch.isalnum() or ch in "_-")[:120]
    f = SEC / f"efts_{tag}.json"
    if f.exists():
        return json.loads(f.read_text())
    rows, frm = [], 0
    while True:
        url = ("https://efts.sec.gov/LATEST/search-index?q=" + urllib.parse.quote(q) + "&forms=" + urllib.parse.quote(form)
               + f"&dateRange=custom&startdt={start}&enddt={end}&from={frm}")
        d = sec_get(url)
        if not d or "hits" not in d:
            break
        hits = d["hits"]["hits"]
        for h in hits:
            s = h["_source"]
            rows.append(dict(adsh=h["_id"].split(":")[0], form=s.get("form"), file_date=s.get("file_date"),
                             ciks=s.get("ciks") or [], names=s.get("display_names") or []))
        frm += len(hits)
        if not hits or frm >= d["hits"]["total"]["value"] or frm >= 9900:
            break
    f.write_text(json.dumps(rows))
    return rows


def submissions(cik: int) -> pd.DataFrame | None:
    f = SEC / f"sub_{cik:010d}.json"
    if f.exists():
        d = json.loads(f.read_text())
    else:
        d = sec_get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        if d is None:
            return None
        # older filings live in extra files; fetch them too (acquired targets rarely have any)
        extra = []
        for x in d.get("filings", {}).get("files", []):
            e = sec_get("https://data.sec.gov/submissions/" + x["name"])
            if e:
                extra.append(e)
        d = dict(name=d.get("name"), tickers=d.get("tickers"), sic=d.get("sic"), recent=d["filings"]["recent"], extra=extra)
        f.write_text(json.dumps(d))
    fr = [pd.DataFrame({"form": d["recent"]["form"], "date": d["recent"]["filingDate"]})]
    for e in d.get("extra", []):
        fr.append(pd.DataFrame({"form": e["form"], "date": e["filingDate"]}))
    out = pd.concat(fr, ignore_index=True)
    out["date"] = pd.to_datetime(out["date"])
    out.attrs["name"] = d.get("name")
    out.attrs["sic"] = d.get("sic")
    return out.sort_values("date").reset_index(drop=True)


def anchors() -> pd.DataFrame:
    rows = []
    for y in YEARS:
        for kind, q, form in (("tender", "tender offer", "SC 14D9"), ("merger", '"in cash, without interest"', "DEFM14A")):
            for h in efts(q, form, f"{y}-01-01", f"{y}-12-31"):
                if h["form"] != form or not h["ciks"]:
                    continue
                rows.append(dict(kind=kind, anchor=h["file_date"], cik=int(h["ciks"][0]), adsh=h["adsh"],
                                 name=(h["names"] or [""])[0]))
        print("efts", y, len(rows), flush=True)
    a = pd.DataFrame(rows).drop_duplicates("adsh")
    a["anchor"] = pd.to_datetime(a["anchor"])
    a = a.sort_values(["cik", "anchor"])
    keep, last = [], {}
    for i, c, d in zip(a.index, a["cik"], a["anchor"]):     # one deal per target per 18 months
        if c in last and (d - last[c]).days < 540:
            continue
        last[c] = d
        keep.append(i)
    return a.loc[keep].reset_index(drop=True)


def resolve(row, sub: pd.DataFrame) -> dict:
    t0 = row["anchor"]
    pre = sub[(sub["date"] <= t0) & (sub["date"] >= t0 - pd.Timedelta(days=300)) & sub["form"].isin(ANN_FORMS)]
    ann = t0
    if len(pre):
        ds = sorted(pre["date"].unique(), reverse=True)
        ann = ds[0] if ds[0] <= t0 else t0
        prev = t0
        for d in ds:                                          # walk back while the chain is unbroken
            if (prev - d).days <= 90:
                ann = d
                prev = d
            else:
                break
    post = sub[(sub["date"] > t0) & (sub["date"] <= t0 + pd.Timedelta(days=730)) & sub["form"].isin(DONE_FORMS)]
    done = post["date"].min() if len(post) else pd.NaT
    return dict(announce=pd.Timestamp(ann), complete=done)


def main():
    a = anchors()
    print("candidate deals:", len(a), a.groupby("kind").size().to_dict(), flush=True)
    out = []
    for k, r in enumerate(a.itertuples(index=False)):
        sub = submissions(int(r.cik))
        if sub is None:
            continue
        res = resolve(r._asdict(), sub)
        out.append(dict(kind=r.kind, cik=r.cik, name=r.name, anchor=r.anchor, **res))
        if k % 250 == 0:
            print("resolved", k, flush=True)
    d = pd.DataFrame(out)
    d["days_ann_to_close"] = (d["complete"] - d["announce"]).dt.days
    d["days_anchor_to_close"] = (d["complete"] - d["anchor"]).dt.days
    d["resolved"] = d["complete"].notna()
    d["year"] = d["anchor"].dt.year
    save(d, "f1_deal_durations")
    # ------------------------------------------------------------------ summary
    rows = []
    last_ok = pd.Timestamp("2025-03-31")                     # anchors late enough to have had 18 months to close
    for kind in ("tender", "merger", "all"):
        g = d if kind == "all" else d[d["kind"] == kind]
        g = g[g["anchor"] <= last_ok]
        comp = g[g["resolved"]]
        r = dict(kind=kind, n=len(g), per_yr=len(g) / 11.25, share_completed=comp.shape[0] / max(len(g), 1),
                 median_ann_to_close=comp["days_ann_to_close"].median(), mean_ann_to_close=comp["days_ann_to_close"].mean(),
                 p25_ann=comp["days_ann_to_close"].quantile(0.25), p75_ann=comp["days_ann_to_close"].quantile(0.75),
                 median_anchor_to_close=comp["days_anchor_to_close"].median())
        for cap in (60, 90, 120):
            # a follower can buy at the earliest the day after announcement; share of ALL deals (incl. unresolved)
            # whose whole post-announcement life fits the cap, and the share of completed deals' life-days that
            # fall inside the last `cap` days before closing
            fits = (g["days_ann_to_close"] - 1 <= cap) & g["resolved"]
            r[f"fits_{cap}"] = fits.mean()
            life = (comp["days_ann_to_close"] - 1).clip(lower=0)
            r[f"lifedays_in_last_{cap}"] = np.minimum(life, cap).sum() / max(life.sum(), 1)
        rows.append(r)
    s = pd.DataFrame(rows)
    save(s, "f1_deal_duration_summary")
    with pd.option_context("display.width", 250):
        print(s.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
