"""Pre-FOMC / FOMC-day returns (Lucca & Moench 2015) re-checked with daily data through 2026-08.

Scheduled FOMC announcement dates are scraped from federalreserve.gov (historical pages
1994-2020, current calendar page 2021+). Unscheduled meetings and conference calls are excluded.
With daily close data we measure the close(t-1)->close(t) return on the announcement day, which
contains the pre-announcement drift plus the post-2pm reaction (Lucca-Moench's intraday 2pm-2pm
window is not available from daily data).
Run:  python fomc_drift.py
"""
from __future__ import annotations

import os
import re

import numpy as np
import pandas as pd
import requests

from kf_utils import daily_returns

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "data", "fomc_dates.csv")
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], 1)}
UA = {"User-Agent": "ResearchBot research@example.com"}
ABBR = {k[:3]: v for k, v in MONTHS.items()}
# 2003-09-15 is listed as a "Meeting" but the scheduled policy meeting/statement was 2003-09-16.
EXCLUDE = {pd.Timestamp("2003-09-15")}


def parse_hist(year: int) -> list[pd.Timestamp]:
    s = requests.get(f"https://www.federalreserve.gov/monetarypolicy/fomchistorical{year}.htm", headers=UA, timeout=60).text
    out = []
    for h in re.findall(r"<h5[^>]*>(.*?)</h5>", s, re.S):
        h = re.sub(r"<[^>]+>", "", h).strip()
        if "Meeting" not in h or "Conference Call" in h or "nscheduled" in h:
            continue
        body = h.split(" Meeting")[0].strip()  # "January 31-February 1", "March 16", "Jan/Feb 31-1"
        m2 = re.match(r"([A-Za-z]+)/([A-Za-z]+)\s+(\d+)\s*-\s*(\d+)", body)
        m = re.match(r"([A-Za-z]+)\s+(\d+)(?:\s*-\s*(?:([A-Za-z]+)\s+)?(\d+))?", body)
        if m2:
            mon, day = m2.group(2), int(m2.group(4))
        elif m:
            mon1, d1, mon2, d2 = m.groups()
            mon = mon2 or mon1
            day = int(d2 or d1)
        else:
            continue
        mon = ABBR.get(mon[:3], None)
        if mon is None:
            continue
        ts = pd.Timestamp(year, mon, day)
        if ts in EXCLUDE:
            continue
        out.append(ts)
    return out


def parse_current() -> list[pd.Timestamp]:
    s = requests.get("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", headers=UA, timeout=60).text
    out = []
    for blk in re.split(r'<div class="[^"]*fomc-meeting"', s)[1:]:
        yr_m = None
        mon = re.search(r"fomc-meeting__month[^>]*><strong>([A-Za-z/]+)</strong>", blk)
        dt = re.search(r"fomc-meeting__date[^>]*>([^<]+)</div>", blk)
        st = re.search(r"monetary(\d{8})a\.htm", blk)
        if not (mon and dt):
            continue
        dtxt = dt.group(1)
        if "unscheduled" in dtxt.lower() or "notation" in dtxt.lower():
            continue
        if st:
            out.append(pd.Timestamp(st.group(1)))
    return out


if os.path.exists(CACHE):
    dates = pd.to_datetime(pd.read_csv(CACHE)["date"]).tolist()
else:
    dates = []
    for y in range(1994, 2021):
        dates += parse_hist(y)
    dates += [d for d in parse_current() if d.year >= 2021]
    dates = sorted(set(dates))
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    pd.DataFrame({"date": dates}).to_csv(CACHE, index=False)

dates = pd.DatetimeIndex(sorted(set(dates)))
print(f"{len(dates)} scheduled FOMC announcement dates, {dates[0].date()} .. {dates[-1].date()}")
print("Per-year counts:", pd.Series(dates.year).value_counts().sort_index().to_dict(), "\n")

d3 = daily_returns("F-F_Research_Data_Factors_daily")
ex = d3["Mkt-RF"]
dates = dates[(dates >= ex.index[0]) & (dates <= ex.index[-1])]
is_f = ex.index.isin(dates)

print("| Period | FOMC days | Mean excess on FOMC day | Mean excess other days | t (diff) | Share of cum. excess return on FOMC days | % FOMC days positive |")
print("|---|---:|---:|---:|---:|---:|---:|")
for lbl, a, b in [
    ("1994-09..2011-03 (Lucca-Moench sample)", "1994-09-01", "2011-03-31"),
    ("2011-04..2026-08 (post-sample)", "2011-04-01", None),
    ("2016-01..2026-08", "2016-01-01", None),
    ("1994-09..2026-08 (all)", "1994-09-01", None),
]:
    m = (ex.index >= pd.Timestamp(a)) & ((ex.index <= pd.Timestamp(b)) if b else True)
    f1 = ex[m & is_f]
    f0 = ex[m & ~is_f]
    se = np.sqrt(f1.var() / len(f1) + f0.var() / len(f0))
    share = f1.sum() / ex[m].sum()
    print(f"| {lbl} | {len(f1)} | {100 * f1.mean():.3f}% | {100 * f0.mean():.3f}% | {(f1.mean() - f0.mean()) / se:.2f} | {100 * share:.0f}% | {100 * (f1 > 0).mean():.0f}% |")
