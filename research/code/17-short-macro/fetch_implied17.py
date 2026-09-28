"""Market-implied baselines for the next-60-day watch list (snapshot taken when run; report uses 2026-09-28 evening).

1) Kalshi (public API) series for the scheduled catalysts: Fed decision, payrolls, unemployment, CPI (headline m/m,
   core m/m, y/y), GDP, government shutdown, WTI (weekly/monthly), ECB, S&P daily, USDJPY, House/Senate control,
   recession, emergency Fed meeting.
2) Polymarket (gamma API): open events matching macro/geopolitical keywords (Iran/Hormuz/ceasefire/Fed/midterms/...).
3) Option chains (yfinance) for the event-trade universe, all expiries up to ~end-Jan 2027 (SPY to end-2026).

Outputs (SCRATCH): kalshi17.csv, polymarket17.csv, chains17.csv, spots17.csv
"""
from __future__ import annotations

import json
import sys
import time

import pandas as pd
import requests
import yfinance as yf

from lib17 import SCRATCH

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
PM = "https://gamma-api.polymarket.com"
K_SERIES = ["KXFEDDECISION", "KXPAYROLLS", "KXU3", "KXCPI", "KXCPICORE", "KXCPIYOY", "KXGDP", "KXGOVTSHUTDOWN",
            "KXWTI", "KXWTIW", "OIL", "OILW", "KXECB", "KXINX", "KXUSDJPY", "CONTROLH", "CONTROLS", "KXRECSSNBER",
            "KXFEDMEET", "KXCBRATEHIKE", "KXFED", "KXINXY", "KXBTCMAXY", "KXAAAGASM"]
PM_KEYWORDS = ["iran", "hormuz", "blockade", "ceasefire", "fed ", "fed rate", "fed decision", "boj", "bank of japan",
               "ecb", "midterm", "house", "senate", "shutdown", "oil", "wti", "crude", "brent", "recession", "nvidia",
               "inflation", "cpi", "unemployment", "payroll", "gdp", "bitcoin", "gold", "s&p", "treasury", "yield",
               "israel", "houthi", "saudi", "kharg", "tariff", "yen", "japan"]
OPT_UNDERLYINGS = ["SPY", "QQQ", "IWM", "TLT", "GLD", "USO", "BNO", "XLE", "JETS", "DAL", "UAL", "INDA", "EIDO",
                   "IBIT", "NVDA", "SMH", "FXY", "UUP", "KRE", "XOP", "EEM"]


def kalshi(series: str) -> list[dict]:
    rows, cursor = [], None
    for _ in range(5):
        params = {"series_ticker": series, "status": "open", "limit": 200}
        if cursor:
            params["cursor"] = cursor
        for attempt in range(4):
            r = requests.get(f"{KALSHI}/markets", params=params, timeout=30)
            if r.status_code == 429:
                time.sleep(2 + 2 * attempt)
                continue
            break
        if r.status_code != 200:
            break
        js = r.json()
        for m in js.get("markets", []):
            rows.append({"series": series, "event": m.get("event_ticker"), "ticker": m.get("ticker"),
                         "title": m.get("title"), "sub": m.get("yes_sub_title") or m.get("subtitle"),
                         "yes_bid": m.get("yes_bid_dollars", m.get("yes_bid")),
                         "yes_ask": m.get("yes_ask_dollars", m.get("yes_ask")),
                         "last": m.get("last_price_dollars", m.get("last_price")),
                         "volume": m.get("volume_fp", m.get("volume")),
                         "open_interest": m.get("open_interest_fp", m.get("open_interest")),
                         "strike_type": m.get("strike_type"), "floor": m.get("floor_strike"),
                         "cap": m.get("cap_strike"), "close": (m.get("close_time") or "")[:10],
                         "rules": (m.get("rules_primary") or "")[:300]})
        cursor = js.get("cursor")
        if not cursor:
            break
        time.sleep(0.4)
    return rows


def polymarket_scan(pages: int = 20) -> list[dict]:
    rows = []
    for page in range(pages):
        r = requests.get(f"{PM}/events", params={"closed": "false", "limit": 100, "offset": 100 * page,
                                                 "order": "volume", "ascending": "false"}, timeout=40)
        if r.status_code != 200:
            break
        evs = r.json()
        if not evs:
            break
        for ev in evs:
            title = (ev.get("title") or "")
            if not any(k in title.lower() for k in PM_KEYWORDS):
                continue
            for m in ev.get("markets", []) or []:
                try:
                    prices = json.loads(m.get("outcomePrices") or "[]")
                    outcomes = json.loads(m.get("outcomes") or "[]")
                    yes = float(prices[outcomes.index("Yes")]) if "Yes" in outcomes else float(prices[0])
                except Exception:  # noqa: BLE001
                    yes = None
                rows.append({"event": title, "market": m.get("question") or m.get("groupItemTitle"),
                             "yes": yes, "best_bid": m.get("bestBid"), "best_ask": m.get("bestAsk"),
                             "volume": float(m.get("volume") or 0), "liquidity": float(m.get("liquidity") or 0),
                             "end": (m.get("endDate") or "")[:10], "closed": m.get("closed"),
                             "slug": ev.get("slug"), "desc": (m.get("description") or "")[:400]})
        time.sleep(0.3)
    return rows


def chains(tkr: str, max_exp: str) -> list[dict]:
    t = yf.Ticker(tkr)
    exps = [e for e in (t.options or []) if e <= max_exp]
    h = t.history(period="5d", auto_adjust=False)
    spot = float(h["Close"].iloc[-1])
    rows = []
    for e in exps:
        for attempt in range(3):
            try:
                ch = t.option_chain(e)
                for typ, df in (("C", ch.calls), ("P", ch.puts)):
                    for _, r in df.iterrows():
                        rows.append({"ticker": tkr, "spot": spot, "expiry": e, "type": typ, "strike": r["strike"],
                                     "bid": r.get("bid"), "ask": r.get("ask"), "last": r.get("lastPrice"),
                                     "volume": r.get("volume"), "oi": r.get("openInterest"),
                                     "iv_vendor": r.get("impliedVolatility"),
                                     "last_trade": str(r.get("lastTradeDate"))[:19]})
                break
            except Exception as ex:  # noqa: BLE001
                print(tkr, e, "retry", ex, file=sys.stderr)
                time.sleep(2)
        time.sleep(0.15)
    return rows


def main():
    k = []
    for s in K_SERIES:
        try:
            k.extend(kalshi(s))
        except Exception as e:  # noqa: BLE001
            print("kalshi fail", s, e, file=sys.stderr)
        time.sleep(0.6)
    kdf = pd.DataFrame(k)
    kdf.to_csv(SCRATCH / "kalshi17.csv", index=False)
    print("kalshi rows", len(kdf))
    p = pd.DataFrame(polymarket_scan())
    p = p[p["closed"] != True]  # noqa: E712
    p.to_csv(SCRATCH / "polymarket17.csv", index=False)
    print("polymarket rows", len(p))
    allrows = []
    for u in OPT_UNDERLYINGS:
        try:
            allrows.extend(chains(u, "2026-12-31" if u == "SPY" else "2027-01-31"))
            print("chain", u, "ok", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print("chain fail", u, e, file=sys.stderr)
    c = pd.DataFrame(allrows)
    c.to_csv(SCRATCH / "chains17.csv", index=False)
    print("option rows", len(c), c.ticker.nunique() if len(c) else 0)


if __name__ == "__main__":
    main()
