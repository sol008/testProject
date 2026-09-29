"""
Track 35 — favourite-longshot returns on Polymarket, sampled by resolution month (not by volume rank).

Track 05 built a complete-event sample selected through the top-volume markets. Here the markets are drawn
by END DATE: for each month from Jan-2024 to Aug-2026 we take the first N closed markets the Gamma API
returns for that end-date window (its default ordering, not volume), keep those with lifetime volume
>= $5k (needed for a daily price history), and price both sides at 1, 7, 30 and 90 days before the end
date from the CLOB daily history. Both sides of every market are included, so buckets are symmetric.

Net return = pre-cost return after a 0.5c half-spread and the 2026 taker fee 0.04*p*(1-p) per share.

Caveats: lifetime volume is still a (weak) post-outcome filter; the daily "price" is the last trade/mid,
not an executable ask; sports markets dominate 2025-26.

Output: output/polymarket_buckets.csv, output/polymarket_markets.csv
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUT, exist_ok=True)
GAMMA = "https://gamma-api.polymarket.com/markets"
CLOB = "https://clob.polymarket.com/prices-history"
PER_MONTH = 120
MIN_VOL = 5_000
HORIZONS = (1, 7, 30, 90)
S = requests.Session()
S.headers["User-Agent"] = "traderec-research/35"


def month_windows():
    d = datetime(2024, 1, 1, tzinfo=timezone.utc)
    end = datetime(2026, 9, 1, tzinfo=timezone.utc)
    while d < end:
        nxt = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield d, nxt
        d = nxt


def fetch_markets():
    rows = []
    for a, b in month_windows():
        got, offset = 0, 0
        while got < PER_MONTH:
            try:
                r = S.get(GAMMA, params=dict(closed="true", limit=100, offset=offset,
                                             end_date_min=a.strftime("%Y-%m-%dT00:00:00Z"),
                                             end_date_max=b.strftime("%Y-%m-%dT00:00:00Z")), timeout=30)
                r.raise_for_status()
                data = r.json()
            except Exception as e:  # noqa: BLE001
                print("gamma error", a.date(), e)
                time.sleep(2)
                break
            if not data:
                break
            for m in data:
                try:
                    outs = json.loads(m.get("outcomes") or "[]")
                    prices = json.loads(m.get("outcomePrices") or "[]")
                    toks = json.loads(m.get("clobTokenIds") or "[]")
                except Exception:  # noqa: BLE001
                    continue
                if len(outs) != 2 or len(prices) != 2 or len(toks) != 2:
                    continue
                p0 = float(prices[0])
                if p0 not in (0.0, 1.0):
                    continue  # not a clean binary resolution
                vol = float(m.get("volumeNum") or 0)
                if vol < MIN_VOL:
                    continue
                rows.append(dict(id=m.get("id"), question=m.get("question"), end=m.get("endDate"), start=m.get("startDate"),
                                 volume=vol, yes_token=toks[0], yes_won=int(p0 == 1.0),
                                 slug=m.get("slug"), tags=";".join(t.get("label", "") for t in (m.get("tags") or []) if isinstance(t, dict))))
                got += 1
                if got >= PER_MONTH:
                    break
            offset += 100
        print(a.date(), "markets kept:", got)
    return pd.DataFrame(rows).drop_duplicates("id")


def price_at(hist, t_target):
    """last price at or before t_target, if within 3 days of it"""
    best = None
    for h in hist:
        if h["t"] <= t_target:
            best = h
        else:
            break
    if best is None or t_target - best["t"] > 3 * 86400:
        return np.nan
    return float(best["p"])


def fetch_hist(row):
    for attempt in range(3):
        try:
            r = S.get(CLOB, params=dict(market=row["yes_token"], interval="max", fidelity=1440), timeout=30)
            if r.status_code == 429:
                time.sleep(2 + attempt)
                continue
            r.raise_for_status()
            hist = sorted(r.json().get("history", []), key=lambda x: x["t"])
            break
        except Exception:  # noqa: BLE001
            time.sleep(1)
            hist = []
    end_ts = pd.Timestamp(row["end"]).timestamp()
    out = {}
    for h in HORIZONS:
        out[f"p_{h}"] = price_at(hist, end_ts - h * 86400) if hist else np.nan
    return out


def categorize(q, tags):
    s = (q or "").lower() + " " + (tags or "").lower()
    if any(k in s for k in ["nba", "nfl", "mlb", "nhl", "soccer", "premier league", "ufc", "tennis", " vs. ", "vs ", "win on", "match", "game", "sports", "f1", "grand prix", "cricket", "la liga", "serie a", "bundesliga", "esports", "counter-strike", "lol", "dota"]):
        return "sports"
    if any(k in s for k in ["bitcoin", "btc", "ethereum", "eth ", "solana", "crypto", "$", "price of", "token"]):
        return "crypto/prices"
    if any(k in s for k in ["election", "president", "senate", "house", "governor", "trump", "biden", "harris", "vote", "party", "minister", "parliament", "congress", "nominee", "poll"]):
        return "politics"
    if any(k in s for k in ["fed", "fomc", "rate cut", "cpi", "inflation", "gdp", "unemployment", "payroll", "interest rate", "recession"]):
        return "macro"
    return "other"


def main():
    mk = fetch_markets()
    print("markets:", len(mk))
    with ThreadPoolExecutor(max_workers=8) as ex:
        hists = list(ex.map(fetch_hist, mk.to_dict("records")))
    hp = pd.DataFrame(hists)
    mk = pd.concat([mk.reset_index(drop=True), hp], axis=1)
    mk["category"] = [categorize(q, t) for q, t in zip(mk["question"], mk["tags"])]
    # slim per-market file (the question text is dropped to keep the output folder small; the id + slug identify it)
    mk.drop(columns=["yes_token", "question", "tags"]).to_csv(os.path.join(OUT, "polymarket_markets.csv"), index=False)
    edges = [0, .02, .05, .10, .20, .50, .80, .90, .95, .98, 1.0001]
    labels = ["<2c", "2-5c", "5-10c", "10-20c", "20-50c", "50-80c", "80-90c", "90-95c", "95-98c", ">=98c"]
    rows = []
    for h in HORIZONS:
        col = f"p_{h}"
        d = mk.dropna(subset=[col])
        # both sides: yes at p (wins if yes_won), no at 1-p (wins if not yes_won)
        sides = pd.DataFrame({"p": np.r_[d[col].values, 1 - d[col].values],
                              "won": np.r_[d["yes_won"].values, 1 - d["yes_won"].values],
                              "category": np.r_[d["category"].values, d["category"].values]})
        sides = sides[(sides["p"] > 0) & (sides["p"] < 1)]
        sides["bucket"] = pd.cut(sides["p"], edges, labels=labels, right=False)
        sides["ret"] = np.where(sides["won"] == 1, 1 / sides["p"] - 1, -1.0)
        cost = 0.005 + 0.04 * sides["p"] * (1 - sides["p"])
        pe = sides["p"] + cost
        sides["ret_net"] = np.where(sides["won"] == 1, 1 / pe - 1, -1.0)
        for cat in ["all"] + sorted(sides["category"].unique()):
            g = sides if cat == "all" else sides[sides["category"] == cat]
            for b, gg in g.groupby("bucket", observed=True):
                if len(gg) < 10:
                    continue
                se = gg["ret"].std() / np.sqrt(len(gg))
                rows.append(dict(horizon_days=h, category=cat, bucket=b, n=len(gg), mean_price=gg["p"].mean(), win_rate=gg["won"].mean(),
                                 ret_pre_cost=gg["ret"].mean(), ret_net=gg["ret_net"].mean(), se=se,
                                 net_annualised=(1 + gg["ret_net"].mean()) ** (365 / h) - 1 if gg["ret_net"].mean() > -1 else np.nan))
    res = pd.DataFrame(rows).round(4)
    res.to_csv(os.path.join(OUT, "polymarket_buckets.csv"), index=False)
    pd.set_option("display.width", 250, "display.max_rows", 500)
    print(res[res["category"] == "all"].to_string(index=False))
    print(res[(res["category"] != "all") & (res["horizon_days"] == 7)].to_string(index=False))
    print(mk["category"].value_counts())


if __name__ == "__main__":
    main()
