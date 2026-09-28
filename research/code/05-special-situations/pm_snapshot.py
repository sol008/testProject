"""Snapshot of live prediction-market microstructure (Kalshi + Polymarket).

Measures, for all open markets at run time:
  * how many markets actually trade (volume / open interest),
  * quoted bid-ask spreads (the dominant transaction cost),
  * "near-certain bond" markets (best ask >= 0.95) and the annualised return
    they imply AFTER taker fees if they resolve as priced,
  * a cross-venue comparison is done separately (pm_crossvenue.py).

Run:  python pm_snapshot.py      (takes ~2-5 min; paginates public APIs)
Outputs: output/pm_snapshot_summary.json, output/kalshi_open_markets.csv.gz,
         output/polymarket_open_markets.csv.gz
"""
from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from common import OUT, get_json, save_json

NOW = datetime.now(timezone.utc)
KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
GAMMA = "https://gamma-api.polymarket.com"


def kalshi_fee(p: float, theta: float = 0.07) -> float:
    """Kalshi taker fee per $1 contract: ceil-to-cent of theta*p*(1-p) (per-contract approx, 100-lot rounding)."""
    return math.ceil(theta * p * (1 - p) * 100 * 100) / 100 / 100  # fee for 100 contracts, rounded up, per contract


def fetch_kalshi_open() -> pd.DataFrame:
    rows, cursor, pages = [], None, 0
    while True:
        params = {"limit": 1000, "status": "open", "mve_filter": "exclude"}
        if cursor:
            params["cursor"] = cursor
        d = None
        for _ in range(6):
            d = get_json(f"{KALSHI}/markets", params, sleep=0.15)
            if d:
                break
            time.sleep(10)
        ms = (d or {}).get("markets", [])
        rows.extend(ms)
        cursor = d.get("cursor")
        pages += 1
        if not cursor or not ms or pages > 400:
            break
    df = pd.DataFrame(rows)
    num = ["yes_bid_dollars", "yes_ask_dollars", "no_bid_dollars", "no_ask_dollars", "last_price_dollars",
           "volume_fp", "volume_24h_fp", "open_interest_fp", "liquidity_dollars"]
    for c in num:
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["close_time"] = pd.to_datetime(df["close_time"], utc=True, errors="coerce")
    # categories from events
    ev_rows, cursor, pages = [], None, 0
    while True:
        params = {"limit": 200, "status": "open"}
        if cursor:
            params["cursor"] = cursor
        d = None
        for _ in range(6):
            d = get_json(f"{KALSHI}/events", params, sleep=0.15)
            if d:
                break
            time.sleep(10)
        ev = (d or {}).get("events", [])
        ev_rows.extend({"event_ticker": e["event_ticker"], "category": e.get("category"), "series_ticker": e.get("series_ticker"), "event_title": e.get("title")} for e in ev)
        cursor = d.get("cursor")
        pages += 1
        if not cursor or not ev or pages > 2000:
            break
    evdf = pd.DataFrame(ev_rows).drop_duplicates("event_ticker")
    df = df.merge(evdf, on="event_ticker", how="left")
    return df


def fetch_polymarket_open() -> pd.DataFrame:
    # ordered by 24h volume so that every actively traded market is captured before the (huge) dormant tail
    rows, cursor = [], None
    for _ in range(1500):
        params = {"closed": "false", "active": "true", "limit": 500, "order": "volume24hr", "ascending": "false"}
        if cursor:
            params["after_cursor"] = cursor
        d = get_json(f"{GAMMA}/markets/keyset", params, sleep=0.1)
        ms = d.get("markets", [])
        rows.extend(ms)
        cursor = d.get("next_cursor")
        if not cursor or not ms or float(ms[-1].get("volume24hr") or 0) == 0 and len(rows) > 60000:
            break
    keep = ["id", "question", "slug", "endDate", "volumeNum", "volume24hr", "liquidityNum", "bestBid", "bestAsk",
            "spread", "lastTradePrice", "outcomePrices", "negRisk", "feesEnabled", "feeType", "feeSchedule",
            "holdingRewardsEnabled", "restricted", "acceptingOrders", "enableOrderBook"]
    df = pd.DataFrame(rows)
    df = df[[c for c in keep if c in df.columns]].copy()
    for c in ["volumeNum", "volume24hr", "liquidityNum", "bestBid", "bestAsk", "spread", "lastTradePrice"]:
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["endDate"] = pd.to_datetime(df["endDate"], utc=True, errors="coerce")
    return df


def q(s: pd.Series, qs=(0.1, 0.25, 0.5, 0.75, 0.9)):
    s = s.dropna()
    return {f"p{int(100*x)}": round(float(s.quantile(x)), 4) for x in qs} | {"n": int(s.size), "mean": round(float(s.mean()), 4) if s.size else None}


def bond_yields(df_prices: pd.DataFrame, price_col: str, end_col: str, fee_fn, min_days=3, max_days=400):
    """Annualised return from buying the favourite at `price_col` (ask) if it resolves as expected."""
    x = df_prices[[price_col, end_col]].dropna().copy()
    x = x[(x[price_col] >= 0.95) & (x[price_col] <= 0.995)]
    days = (x[end_col] - NOW).dt.total_seconds() / 86400
    x = x[(days >= min_days) & (days <= max_days)]
    days = (x[end_col] - NOW).dt.total_seconds() / 86400
    fee = x[price_col].apply(fee_fn)
    gross = 1 / (x[price_col] + fee) - 1
    ann = (1 + gross) ** (365 / days) - 1
    return x.assign(days=days, fee=fee, gross_ret=gross, ann_ret=ann)


def main():
    out = {"as_of_utc": NOW.isoformat()}
    prev = OUT / "pm_snapshot_summary.json"
    if os.environ.get("SKIP_KALSHI") == "1" and prev.exists():
        # reuse the Kalshi half of an earlier run (Kalshi paginates ~100k markets and rate-limits)
        out["kalshi"] = json.loads(prev.read_text())["kalshi"]
        out["kalshi_as_of_utc"] = json.loads(prev.read_text())["as_of_utc"]
        return poly_part(out)

    # ---------------- Kalshi ----------------
    k = fetch_kalshi_open()
    k.to_csv(OUT / "kalshi_open_markets.csv.gz", index=False, compression="gzip",
             columns=[c for c in ["ticker", "event_ticker", "category", "title", "yes_bid_dollars", "yes_ask_dollars", "last_price_dollars",
                                  "volume_fp", "volume_24h_fp", "open_interest_fp", "close_time"] if c in k.columns])
    k["two_sided"] = (k["yes_bid_dollars"] > 0) & (k["yes_ask_dollars"] < 1) & (k["yes_ask_dollars"] > 0)
    k["spread"] = np.where(k["two_sided"], k["yes_ask_dollars"] - k["yes_bid_dollars"], np.nan)
    k["mid"] = np.where(k["two_sided"], (k["yes_ask_dollars"] + k["yes_bid_dollars"]) / 2, np.nan)
    traded = k[k["volume_24h_fp"] > 0]
    ks = {
        "open_markets_non_combo": int(len(k)),
        "markets_with_any_volume": int((k["volume_fp"] > 0).sum()),
        "markets_with_24h_volume": int(len(traded)),
        "two_sided_quotes": int(k["two_sided"].sum()),
        "total_open_interest_contracts": float(k["open_interest_fp"].sum()),
        "total_24h_volume_contracts": float(k["volume_24h_fp"].sum()),
        "spread_all_two_sided": q(k["spread"]),
        "spread_markets_with_24h_volume": q(traded["spread"]),
        "spread_top200_by_24h_volume": q(k.nlargest(200, "volume_24h_fp")["spread"]),
        "share_24h_volume_top1pct_markets": round(float(k["volume_24h_fp"].nlargest(max(1, len(k) // 100)).sum() / max(1, k["volume_24h_fp"].sum())), 3),
    }
    bycat = (k.groupby("category").agg(markets=("ticker", "size"), vol24h=("volume_24h_fp", "sum"), oi=("open_interest_fp", "sum"),
                                       med_spread=("spread", "median")).sort_values("vol24h", ascending=False))
    ks["by_category"] = bycat.round(3).reset_index().to_dict(orient="records")
    # near-certain "bonds": buy whichever side has ask >=0.95 (YES side via yes_ask, NO side via no_ask)
    kb = pd.concat([
        k.loc[k["volume_24h_fp"] > 0, ["ticker", "title", "yes_ask_dollars", "close_time"]].rename(columns={"yes_ask_dollars": "ask"}).assign(side="yes"),
        k.loc[k["volume_24h_fp"] > 0, ["ticker", "title", "no_ask_dollars", "close_time"]].rename(columns={"no_ask_dollars": "ask"}).assign(side="no"),
    ])
    kby = bond_yields(kb, "ask", "close_time", lambda p: kalshi_fee(p))
    ks["bond_markets_ask_95_995_3to400d"] = {
        "n": int(len(kby)),
        "median_days": round(float(kby["days"].median()), 1) if len(kby) else None,
        "median_gross_ret_%": round(100 * float(kby["gross_ret"].median()), 2) if len(kby) else None,
        "median_annualised_ret_%": round(100 * float(kby["ann_ret"].median()), 1) if len(kby) else None,
        "share_ann_ret_above_10pct": round(float((kby["ann_ret"] > 0.10).mean()), 3) if len(kby) else None,
    }
    out["kalshi"] = ks
    return poly_part(out)


def poly_part(out: dict):
    # ---------------- Polymarket (international CLOB; US users: close-only) ----------------
    p = fetch_polymarket_open()
    p.to_csv(OUT / "polymarket_open_markets.csv.gz", index=False, compression="gzip")
    p["two_sided"] = (p["bestBid"] > 0) & (p["bestAsk"] < 1) & (p["bestAsk"] > p["bestBid"])
    p["spread2"] = np.where(p["two_sided"], p["bestAsk"] - p["bestBid"], np.nan)
    ptr = p[p["volume24hr"] > 0]
    ps = {
        "open_markets": int(len(p)),
        "markets_with_24h_volume": int(len(ptr)),
        "total_24h_volume_usd": round(float(p["volume24hr"].sum()), 0),
        "total_liquidity_usd": round(float(p["liquidityNum"].sum()), 0),
        "spread_all_two_sided": q(p["spread2"]),
        "spread_markets_with_24h_volume": q(ptr["spread2"]),
        "spread_top200_by_24h_volume": q(p.nlargest(200, "volume24hr")["spread2"]),
        "feeType_counts": p["feeType"].fillna("none").value_counts().head(12).to_dict(),
        "holding_rewards_markets": int(p.get("holdingRewardsEnabled", pd.Series(dtype=bool)).fillna(False).astype(bool).sum()),
        "share_24h_volume_top1pct_markets": round(float(p["volume24hr"].nlargest(max(1, len(p) // 100)).sum() / max(1, p["volume24hr"].sum())), 3),
    }

    def poly_fee(price: float, rate: float = 0.04) -> float:
        # Fee Structure V2 (2026): taker fee = rate * p * (1-p) per share (exponent 1); politics/finance rate 0.04
        return rate * price * (1 - price)

    pb = pd.concat([
        ptr[["question", "bestAsk", "endDate"]].rename(columns={"bestAsk": "ask"}).assign(side="yes"),
        ptr.assign(no_ask=1 - ptr["bestBid"])[["question", "no_ask", "endDate"]].rename(columns={"no_ask": "ask"}).assign(side="no"),
    ])
    pby = bond_yields(pb, "ask", "endDate", poly_fee)
    ps["bond_markets_ask_95_995_3to400d"] = {
        "n": int(len(pby)),
        "median_days": round(float(pby["days"].median()), 1) if len(pby) else None,
        "median_gross_ret_%": round(100 * float(pby["gross_ret"].median()), 2) if len(pby) else None,
        "median_annualised_ret_%": round(100 * float(pby["ann_ret"].median()), 1) if len(pby) else None,
        "share_ann_ret_above_10pct": round(float((pby["ann_ret"] > 0.10).mean()), 3) if len(pby) else None,
    }
    out["polymarket"] = ps
    save_json(out, "pm_snapshot_summary.json")
    print(json.dumps(out, indent=2, default=str)[:6000])


if __name__ == "__main__":
    main()
