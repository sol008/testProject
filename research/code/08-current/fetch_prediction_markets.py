"""Market-implied probabilities for macro / political events from Polymarket (gamma API) and Kalshi (public API).

Output: SCRATCH/pm_events.json, SCRATCH/pm_markets.csv, SCRATCH/kalshi_markets.csv (+ printed tables)
"""
from __future__ import annotations

import json

import pandas as pd
import requests

from common import SCRATCH

PM = "https://gamma-api.polymarket.com"
SLUGS = [
    "fed-decision-in-october-20260617190323537",
    "fed-decision-in-december-20260729232808632",
    "us-announces-end-of-iranian-blockade-byptptpt-20260713152715080",
    "us-iran-ceasefire-continues-throughptptpt",
    "us-iran-final-nuclear-deal-by-20260621201254412",
    "saudi-oil-pipeline-east-west-restarts-byptptpt",
    "strait-of-hormuz-traffic-returns-to-normal-by-october-31-20260810151043583",
    "kharg-island-no-longer-under-iranian-control-by-march-31",
    "will-the-us-invade-iran-before-2027",
    "clarity-act-signed-into-law-in-2026",
    "bitcoin-all-time-high-by",
    "what-price-will-bitcoin-hit-before-2027",
    "what-price-will-ethereum-hit-before-2027",
    "what-price-will-wti-hit-in-september-2026",
]
SEARCH_TERMS = ["midterm", "house", "senate", "recession", "fed", "rate", "inflation", "gdp", "tariff", "shutdown",
                "treasury", "yield", "oil", "hormuz", "iran", "taiwan", "china", "nvidia", "openai", "ipo",
                "gold", "s&p", "powell", "warsh", "bank of japan", "boj", "debt ceiling", "unemployment", "cpi"]


def pm_event(slug: str) -> dict | None:
    r = requests.get(f"{PM}/events", params={"slug": slug}, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d[0] if d else None


def pm_search_events(max_pages: int = 12) -> list[dict]:
    out = []
    for page in range(max_pages):
        r = requests.get(f"{PM}/events", params={"closed": "false", "limit": 100, "offset": 100 * page,
                                                 "order": "volume", "ascending": "false"}, timeout=30)
        if r.status_code != 200:
            break
        d = r.json()
        if not d:
            break
        out.extend(d)
    return out


def flatten(ev: dict) -> list[dict]:
    rows = []
    for m in ev.get("markets", []) or []:
        try:
            prices = json.loads(m.get("outcomePrices") or "[]")
            outcomes = json.loads(m.get("outcomes") or "[]")
        except Exception:  # noqa: BLE001
            prices, outcomes = [], []
        yes = None
        if outcomes and prices:
            try:
                yes = float(prices[outcomes.index("Yes")]) if "Yes" in outcomes else float(prices[0])
            except Exception:  # noqa: BLE001
                yes = None
        rows.append({
            "event": ev.get("title"), "market": m.get("question") or m.get("groupItemTitle"),
            "yes_prob": yes, "volume": float(m.get("volume") or 0), "liquidity": float(m.get("liquidity") or 0),
            "end": (m.get("endDate") or "")[:10], "closed": m.get("closed"), "slug": ev.get("slug"),
        })
    return rows


def kalshi_series(series_ticker: str) -> list[dict]:
    url = "https://api.elections.kalshi.com/trade-api/v2/markets"
    r = requests.get(url, params={"series_ticker": series_ticker, "status": "open", "limit": 200}, timeout=30)
    if r.status_code != 200:
        return []
    rows = []
    for m in r.json().get("markets", []):
        rows.append({"series": series_ticker, "event": m.get("event_ticker"), "ticker": m.get("ticker"),
                     "title": m.get("title"), "yes_sub": m.get("yes_sub_title") or m.get("subtitle"),
                     "yes_bid": m.get("yes_bid_dollars", m.get("yes_bid")),
                     "yes_ask": m.get("yes_ask_dollars", m.get("yes_ask")),
                     "last": m.get("last_price_dollars", m.get("last_price")),
                     "open_interest": m.get("open_interest_fp", m.get("open_interest")),
                     "close": (m.get("close_time") or "")[:10]})
    return rows


def main():
    rows, events = [], {}
    for s in SLUGS:
        try:
            ev = pm_event(s)
            if ev:
                events[s] = ev
                rows.extend(flatten(ev))
        except Exception as e:  # noqa: BLE001
            print("fail", s, e)
    # broad scan for macro/political events
    allev = pm_search_events()
    hits = []
    for ev in allev:
        t = (ev.get("title") or "").lower()
        if any(k in t for k in SEARCH_TERMS) and ev.get("slug") not in events:
            hits.append(ev)
            rows.extend(flatten(ev))
    (SCRATCH / "pm_events.json").write_text(json.dumps({"targeted": events, "scan_titles": [h.get("title") for h in hits]}, default=str))
    df = pd.DataFrame(rows)
    df = df[df["closed"] != True]  # noqa: E712
    df.to_csv(SCRATCH / "pm_markets.csv", index=False)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 500)
    pd.set_option("display.max_colwidth", 90)
    print(df[df["volume"] > 20000][["event", "market", "yes_prob", "volume", "end"]].to_string())

    # Kalshi: a few macro series (tickers may change; failures are non-fatal)
    krows = []
    for st in ["KXFEDDECISION", "KXFED", "FED", "KXRECSSNBER", "KXCPIYOY", "KXHOUSE", "KXSENATE", "CONTROLH",
               "CONTROLS", "KXGDP", "KXU3", "KXINXY", "KXWTI", "KXBTCMAXY", "KXSHUTDOWN", "KXPAYROLLS"]:
        try:
            krows.extend(kalshi_series(st))
        except Exception as e:  # noqa: BLE001
            print("kalshi fail", st, e)
    kdf = pd.DataFrame(krows)
    kdf.to_csv(SCRATCH / "kalshi_markets.csv", index=False)
    if not kdf.empty:
        near = kdf[kdf["close"].astype(str) <= "2027-01-31"]
        print(near[["event", "yes_sub", "yes_bid", "yes_ask", "last", "open_interest", "close"]].to_string())


if __name__ == "__main__":
    main()
