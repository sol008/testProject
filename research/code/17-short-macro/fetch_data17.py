"""Fetch everything track 17 needs into SCRATCH.

Outputs (SCRATCH):
  prices_adj.csv       adjusted daily closes (yfinance, auto_adjust=True) for the event-study universe
  fred_<ID>.csv        FRED series (yields, oil spot, policy rate, CPI...)
  fomc_dates.csv       scheduled FOMC decision dates 1994-2027 (federalreserve.gov historical pages + calendar)
  cpi_dates.csv        CPI release dates 2002-06 .. 2026-09 (BLS archive of news releases)
  nfp_dates.csv        Employment Situation release dates (BLS archive)
  gold_monthly.csv     monthly gold price (datahub / World Bank-LBMA compilation) for pre-2000 context
Run: python fetch_data17.py
"""
from __future__ import annotations

import re
import sys
import time

import pandas as pd
import requests
import yfinance as yf

from lib17 import SCRATCH, UA, fred

TICKERS = [
    # core cross-asset set required by the brief
    "^GSPC", "SPY", "TLT", "GLD", "UUP", "USO", "BTC-USD",
    # substitutes for long histories / extra assets
    "DX-Y.NYB", "^TNX", "^IRX", "^VIX", "GC=F", "IEF", "SHY", "BNO", "XLE", "^XOI", "XOM", "OIH",
    "JETS", "LUV", "DAL", "UAL", "AAL", "INDA", "EIDO", "EEM", "EWJ", "FXY", "EWZ",
    "QQQ", "IWM", "SMH", "NVDA", "KRE", "^OVX", "^MOVE", "IBIT", "HYG", "^VIX3M", "^N225", "JPY=X",
]
FRED_IDS = ["DGS2", "DGS10", "DGS3MO", "DGS1", "DCOILWTICO", "DCOILBRENTEU", "WTISPLC", "DFEDTAR", "DFEDTARU",
            "DFF", "T10YIE", "DTWEXBGS", "CPIAUCSL", "CPILFESL", "PAYEMS", "UNRATE", "DTB3"]
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                      "September", "October", "November", "December"], start=1)}
MONTHS3 = {k[:3]: v for k, v in MONTHS.items()}


def get(url: str) -> str:
    for i in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=60)
            r.raise_for_status()
            return r.text
        except Exception as e:  # noqa: BLE001
            print("retry", url, e, file=sys.stderr)
            time.sleep(3 * (i + 1))
    raise RuntimeError(url)


def fetch_prices():
    frames = {}
    for t in TICKERS:
        for attempt in range(3):
            try:
                h = yf.Ticker(t).history(period="max", auto_adjust=True)
                if len(h):
                    s = h["Close"].copy()
                    s.index = pd.to_datetime(s.index.date)
                    frames[t] = s[~s.index.duplicated(keep="last")]
                break
            except Exception as e:  # noqa: BLE001
                print(t, "attempt", attempt, e, file=sys.stderr)
                time.sleep(3)
    df = pd.DataFrame(frames).sort_index()
    df.to_csv(SCRATCH / "prices_adj.csv")
    print("prices:", df.shape, df.index.min().date(), df.index.max().date())


def parse_meeting_label(label: str, year: int) -> pd.Timestamp | None:
    """'January 29-30 Meeting - 2008' / 'March 18 Meeting' / 'April/May 30-1' -> decision (last) day."""
    label = re.sub(r"\s+", " ", label).strip()
    m = re.match(r"([A-Za-z]+)(?:/([A-Za-z]+))? (\d+)(?:-(\d+))?", label)
    if not m:
        return None
    m1, m2, d1, d2 = m.groups()
    month = MONTHS3.get((m2 or m1)[:3].title())
    day = int(d2 or d1)
    if month is None:
        return None
    return pd.Timestamp(year=year, month=month, day=day)


def fetch_fomc():
    rows = []
    for y in range(1994, 2021):
        t = get(f"https://www.federalreserve.gov/monetarypolicy/fomchistorical{y}.htm")
        for h in re.findall(r"<h5[^>]*>(.*?)</h5>", t, flags=re.S):
            h = re.sub(r"<[^>]+>", "", h)
            kind = "meeting" if "Meeting" in h else ("call" if "Conference Call" in h else None)
            if kind is None or "cancelled" in h.lower():
                continue
            if "unscheduled" in h.lower():
                kind = "unscheduled"
            d = parse_meeting_label(h, y)
            if d is not None:
                rows.append({"date": d, "kind": kind, "label": h.strip()})
        time.sleep(0.3)
    t = get("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm")
    # split by year panels
    for m in re.finditer(r"(\d{4}) FOMC Meetings", t):
        y = int(m.group(1))
        seg = t[m.end(): m.end() + 13000]
        nxt = re.search(r"\d{4} FOMC Meetings", seg)
        if nxt:
            seg = seg[: nxt.start()]
        for mon, dd in re.findall(r"fomc-meeting__month[^>]*>\s*<strong>([^<]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)<",
                                  seg, flags=re.S):
            dd = dd.strip()
            unsched = "(unscheduled)" in dd.lower() or "notation" in dd.lower()
            dd = dd.replace("*", "").split("(")[0].strip()
            d = parse_meeting_label(f"{mon.strip()} {dd}", y)
            if d is not None and not unsched:
                rows.append({"date": d, "kind": "meeting", "label": f"{mon.strip()} {dd} {y}"})
    df = pd.DataFrame(rows).drop_duplicates("date").sort_values("date")
    df.to_csv(SCRATCH / "fomc_dates.csv", index=False)
    print("fomc:", len(df), "meetings:", (df.kind == "meeting").sum(), df.date.min(), df.date.max())


def fetch_bls(prefix: str, page: str, out: str):
    t = get(f"https://www.bls.gov/bls/news-release/{page}.htm")
    ds = sorted(set(re.findall(rf"archives/{prefix}_(\d{{8}})\.(?:htm|pdf|txt)", t)))
    dates = sorted(pd.to_datetime(ds, format="%m%d%Y"))
    df = pd.DataFrame({"date": dates})
    df.to_csv(SCRATCH / out, index=False)
    print(prefix, len(df), df.date.min().date(), df.date.max().date())


def fetch_gold_monthly():
    t = get("https://raw.githubusercontent.com/datasets/gold-prices/master/data/monthly.csv")
    (SCRATCH / "gold_monthly.csv").write_text(t)
    print("gold monthly rows:", t.count("\n"))


def main():
    fetch_prices()
    for f in FRED_IDS:
        try:
            s = fred(f)
            print("FRED", f, len(s), s.index.min().date(), s.index.max().date())
        except Exception as e:  # noqa: BLE001
            print("FRED fail", f, e, file=sys.stderr)
    fetch_fomc()
    fetch_bls("cpi", "cpi", "cpi_dates.csv")
    fetch_bls("empsit", "empsit", "nfp_dates.csv")
    fetch_gold_monthly()


if __name__ == "__main__":
    main()
