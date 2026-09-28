"""Activist Schedule 13D filings, 2011-2026: announcement return and the 1-60 day drift a
follower can still capture.

Events: original Schedules 13D (EDGAR full-text search, edgar_collect.py 13d).  Subject =
first entity in EFTS display names (checked: EFTS lists the subject company first), mapped
to today's exchange ticker via its CIK (delisted subjects are missing -> survivorship).
Filer classes:
  known_activist : filer name matches a list of activist funds (list includes some post-2015
                   entrants -> mild hindsight; 'pre2015_list' flag marks names active by 2014)
  fund_like      : filer name looks like an investment firm (CAPITAL|PARTNERS|MANAGEMENT|FUND|...)
  other          : individuals, corporations, etc.
D = EDGAR filing date (no acceptance time in EFTS).  Windows relative to the first session on/
after D (a):
  run-up     close(a-21) -> close(a-1)
  announce   close(a-1)  -> close(a+1)   (not capturable by a follower)
  follow h   close(a+1)  -> close(a+1+h), h in {5, 20, 60}
Benchmark IWM (< $2bn) / SPY.  Cost COST_RT by size.  IS 2011-15, OOS 2016-26.
"""
from __future__ import annotations

import json
import re

import numpy as np
import pandas as pd

from common import COST_RT, SCRATCH, cap_bucket, clustered_t, kelly_growth, save_csv, save_json, trade_stats
from fastev import anchor_windows
from shares_out import SharesLookup

PRE2015 = ["ELLIOTT ", "ICAHN", "TRIAN ", "THIRD POINT", "PERSHING SQUARE", "JANA PARTNERS", "VALUEACT", "STARBOARD VALUE",
           "CORVEX", "SACHEM HEAD", "ENGAGED CAPITAL", "LEGION PARTNERS", "LAND & BUILDINGS", "ANCORA", "BARINGTON",
           "CLINTON GROUP", "MARCATO", "GLENVIEW", "RELATIONAL INVESTORS", "BLUE HARBOUR", "CEVIAN", "LONE STAR VALUE",
           "BIGLARI", "GAMCO", "GABELLI", "MILL ROAD", "RAGING CAPITAL", "STEEL PARTNERS", "WYNNEFIELD", "PL CAPITAL",
           "STILWELL", "FRONTFOUR", "SCOPIA", "SANDELL", "SOUTHEASTERN ASSET", "OASIS MANAGEMENT", "MANGROVE PARTNERS",
           "SABA CAPITAL", "BULLDOG INVESTORS", "KARPUS", "CANNELL", "HARBINGER", "CASABLANCA", "SHAMROCK", "PIRATE CAPITAL",
           "WESTERN INVESTMENT", "ENGINE CAPITAL", "VOSS CAPITAL", "SARISSA", "HG VORA", "JCP INVESTMENT", "BLR PARTNERS",
           "LEUCADIA", "CARL C. ICAHN", "SPRING OWL", "LITESPEED", "SOROS"]
POST2015 = ["MANTLE RIDGE", "IMPACTIVE", "POLITAN", "IRENIC", "BLACKWELLS", "MACELLUM", "BROWNING WEST", "ANSON FUNDS",
            "DRIVER MANAGEMENT", "INCLUSIVE CAPITAL", "LEGION", "ALTAI", "CAAS CAPITAL", "SNOW PARK", "D. E. SHAW", "KENT LAKE",
            "ELEMENT POINT", "STADIUM CAPITAL", "PALLINGHURST", "VINTAGE CAPITAL", "ENVIRO STAR", "ANCORA ALTERNATIVES",
            "LAMPE CONWAY", "BRADLEY RADOFF", "TOMS CAPITAL", "STARBOARD", "ELLIOTT INVESTMENT"]
FUNDLIKE = re.compile(r"CAPITAL|PARTNERS|MANAGEMENT|FUND|ADVIS[OE]RS|INVESTMENT|MASTER|OFFSHORE|OPPORTUNIT|L\.?P\.?\b|VALUE|ASSET|EQUIT", re.I)
NAME_RE = re.compile(r"^(.*?)\s+\((?:[A-Z0-9.\-, ]+)\)\s+\(CIK|^(.*?)\s+\(CIK")

WIN = {"runup": (-21, -1), "announce": (-1, 1), "f5": (1, 6), "f20": (1, 21), "f60": (1, 61), "ann_f20": (-1, 21)}


def clean_name(n: str) -> str:
    m = NAME_RE.search(n or "")
    return ((m.group(1) or m.group(2)) if m else (n or "")).strip().upper()


def main():
    d = pd.read_pickle(SCRATCH / "edgar_13d.pkl")
    d = d[d["form"].isin(["SC 13D", "SCHEDULE 13D"])].copy()
    cte = json.loads((SCRATCH / "company_tickers_exchange.json").read_text())
    cte = pd.DataFrame(cte["data"], columns=cte["fields"])
    cte = cte[cte["exchange"].isin(["Nasdaq", "NYSE", "CBOE"])]
    cik2t = cte.drop_duplicates("cik").set_index("cik")["ticker"].str.replace(".", "-", regex=False).to_dict()
    rows = []
    for r in d.itertuples(index=False):
        ciks = [int(c) for c in r.ciks]
        names = list(r.names)
        if not ciks:
            continue
        subj_i = 0
        subj = ciks[0]
        filers = [clean_name(n) for j, n in enumerate(names) if j != subj_i]
        fl = " | ".join(filers)
        up = " " + fl + " "
        known_pre = any(k in up for k in PRE2015)
        known_post = any(k in up for k in POST2015)
        cls = "known_activist" if (known_pre or known_post) else ("fund_like" if FUNDLIKE.search(fl) else "other")
        rows.append({"adsh": r.adsh, "anchor": r.file_date, "subject_cik": subj, "subject": clean_name(names[0]),
                     "filers": fl[:200], "cls": cls, "pre2015_list": known_pre, "ticker": cik2t.get(subj)})
    ev = pd.DataFrame(rows)
    print("original 13Ds:", len(ev), ev["cls"].value_counts().to_dict(), "with current ticker:", ev["ticker"].notna().mean().round(3))
    # one event per subject per 90 days (multiple group members / refilings)
    ev = ev.sort_values("anchor")
    ev = ev[ev["ticker"].notna()]
    keep, last = [], {}
    for i, c, dd, cl in zip(ev.index, ev["subject_cik"], ev["anchor"], ev["cls"]):
        key = (c, cl)
        if key in last and (dd - last[key]).days < 90:
            continue
        last[key] = dd
        keep.append(i)
    ev = ev.loc[keep].reset_index(drop=True)
    ev = anchor_windows(ev, WIN, bench=["SPY", "IWM"])
    sl = SharesLookup()
    ev["mcap"] = [sl.asof(c, dd) * p if np.isfinite(p) else np.nan for c, dd, p in zip(ev["subject_cik"], ev["anchor"], ev["raw_px"])]
    ev["bucket"] = ev["mcap"].apply(cap_bucket)
    ev["cost_rt"] = ev["bucket"].map(COST_RT)
    big = ev["mcap"] >= 2e9
    for w in WIN:
        ev[f"x_{w}"] = ev[w] - np.where(big, ev[f"{w}_SPY"], ev[f"{w}_IWM"])
    ev["period"] = np.where(ev["anchor"] < "2016-01-01", "2011-15 (IS)", "2016-26 (OOS)")
    ev = ev[(ev["raw_px"] >= 2) & (ev["dvol20"] >= 1e5) & (ev["hist"] >= 60)]
    ev.to_pickle(SCRATCH / "activist_events.pkl")
    out = []
    for per in ["2011-15 (IS)", "2016-26 (OOS)"]:
        for cls in ["known_activist", "fund_like", "other"]:
            g0 = ev[(ev["period"] == per) & (ev["cls"] == cls)]
            for size_lbl, g in [("ALL", g0), (">= $300m", g0[g0["mcap"] >= 3e8]), ("< $300m", g0[g0["mcap"] < 3e8])]:
                yrs = 5.0 if per.startswith("2011") else 10.7
                for w in ["runup", "announce", "f5", "f20", "f60", "ann_f20"]:
                    col = f"x_{w}"
                    r = g[col] - (g["cost_rt"] if w.startswith("f") else 0)
                    st = trade_stats(r, per_year=len(r.dropna()) / yrs)
                    st["t_clustered"] = round(clustered_t(r, g["anchor"]), 2) if len(r.dropna()) > 30 else None
                    out.append({"class": cls, "size": size_lbl, "period": per, "window": w, "net_of_cost": w.startswith("f"), **st})
    tab = pd.DataFrame(out)
    save_csv(tab, "activist_13d_summary.csv")
    oos = ev[(ev["period"] == "2016-26 (OOS)") & (ev["cls"] == "known_activist")]
    res = {"kelly_known_activist_f20_oos": kelly_growth((oos["x_f20"] - oos["cost_rt"]).dropna(), 0.5, 0.25, 0.05),
           "kelly_known_activist_f60_oos": kelly_growth((oos["x_f60"] - oos["cost_rt"]).dropna(), 0.5, 0.25, 0.05),
           "corr_raw_vs_bench_f20": None}
    g = oos.dropna(subset=["f20"])
    if len(g) > 10:
        b = np.where(g["mcap"] >= 2e9, g["f20_SPY"], g["f20_IWM"])
        res["corr_raw_vs_bench_f20"] = round(float(np.corrcoef(g["f20"], b)[0, 1]), 2)
        bad = g[b < -0.10]
        res["n_bench_below_-10%"] = int(len(bad))
        res["mean_excess_when_bench_below_-10%_%"] = round(100 * float(bad["x_f20"].mean()), 2) if len(bad) else None
    save_json(res, "activist_13d_extra.json")
    pd.set_option("display.width", 250)
    print(tab[["class", "size", "period", "window", "n", "per_yr", "mean_%", "median_%", "t_clustered", "win_%", "p5_%", "max_loss_%"]].to_string())
    print(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
