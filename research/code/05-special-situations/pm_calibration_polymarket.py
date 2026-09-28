"""Calibration / favourite-longshot test on resolved Polymarket markets.

Universe: closed, cleanly-resolved (payout exactly 1/0) binary markets on the
international Polymarket CLOB, largest by lifetime volume (>= MIN_VOL USD).
For each market we pull the YES-token daily price history from the public CLOB
endpoint and read the price k days before the resolution anchor
  anchor = min(endDate, closedTime)
for k in {1, 7, 30}.  Both sides are used (YES at p, NO at 1-p), as in
Burgi, Deng & Whelan (2026) for Kalshi.

Caveats (stated in the report):
  * price history is the CLOB "price" series (mid/last), not executable asks;
  * selection: biggest-volume markets only; heavy in sports/elections/crypto;
  * outcomes inside one multi-outcome event are dependent -> bootstrap by event.

Run:  python pm_calibration_polymarket.py   (~15-25 min, polite pacing)
Outputs: output/pm_poly_calibration_{1,7,30}d.csv, output/pm_poly_calibration_summary.json
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from common import OUT, SCRATCH, get_json, save_json

GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"
MIN_VOL = float(sys.argv[1]) if len(sys.argv) > 1 else 100_000
MAX_MARKETS = int(sys.argv[2]) if len(sys.argv) > 2 else 6000
CACHE = SCRATCH / "poly_hist"
CACHE.mkdir(exist_ok=True)

BUCKETS = [0, 0.02, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.98, 1.0001]


def classify(q: str) -> str:
    s = q.lower()
    if re.search(r"bitcoin|btc|ethereum|\beth\b|solana|\bsol\b|xrp|doge|crypto|token|fdv|airdrop|microstrategy|coinbase|binance", s):
        return "crypto"
    if re.search(r"\bfed\b|interest rate|bps|cpi|inflation|recession|gdp|unemployment|jobs report|tariff|s&p|nasdaq|treasury|yield|gold|oil|stock|ipo|earnings|market cap", s):
        return "macro/markets"
    if re.search(r"election|president|senate|house|governor|mayor|prime minister|chancellor|parliament|primary|nominee|democrat|republican|vote|referendum|cabinet|impeach|trump|biden|harris|putin|zelensk|netanyahu|xi jinping|pope", s):
        return "politics/geopolitics"
    if re.search(r" vs\.? | vs |win the|nba|nfl|mlb|nhl|premier league|champions league|la liga|serie a|bundesliga|uefa|fifa|world cup|super bowl|stanley cup|world series|finals|grand slam|wimbledon|us open|french open|australian open|ufc|boxing|f1|grand prix|masters|golf|tennis|cricket|ipl|olympic|match|game \d|series", s):
        return "sports"
    return "other"


def fetch_closed_markets() -> pd.DataFrame:
    cache = SCRATCH / f"poly_closed_markets_{int(MIN_VOL)}_{MAX_MARKETS}.json"
    if cache.exists():
        return pd.DataFrame(json.loads(cache.read_text()))
    rows, cursor = [], None
    while len(rows) < MAX_MARKETS:
        params = {"closed": "true", "limit": 500, "order": "volumeNum", "ascending": "false"}
        if cursor:
            params["after_cursor"] = cursor
        d = get_json(f"{GAMMA}/markets/keyset", params, sleep=0.2)
        ms = d.get("markets", [])
        if not ms:
            break
        for m in ms:
            ev = (m.get("events") or [{}])[0]
            rows.append({
                "id": m.get("id"), "question": m.get("question"), "outcomes": m.get("outcomes"),
                "outcomePrices": m.get("outcomePrices"), "endDate": m.get("endDate"), "closedTime": m.get("closedTime"),
                "volumeNum": float(m.get("volumeNum") or 0), "clobTokenIds": m.get("clobTokenIds"),
                "negRisk": m.get("negRisk"), "event_id": ev.get("id"), "event_title": ev.get("title"),
            })
        cursor = d.get("next_cursor")
        if not cursor or float(ms[-1].get("volumeNum") or 0) < MIN_VOL:
            break
    cache.write_text(json.dumps(rows))
    return pd.DataFrame(rows)


def history(token: str) -> list:
    f = CACHE / f"{token}.json"
    if f.exists():
        return json.loads(f.read_text())
    try:
        d = get_json(f"{CLOB}/prices-history", {"market": token, "interval": "max", "fidelity": 1440}, sleep=0.15)
    except Exception:  # noqa: BLE001
        return []
    h = d.get("history", []) if d else []
    f.write_text(json.dumps(h))
    return h


def boot_ci(df: pd.DataFrame, col: str, n=400, seed=0):
    """Event-clustered bootstrap CI for the mean of `col`."""
    rng = np.random.default_rng(seed)
    g = df.groupby("event_id")[col].agg(["sum", "count"])
    if len(g) < 5:
        return (np.nan, np.nan)
    sums, cnts = g["sum"].to_numpy(), g["count"].to_numpy()
    idx = rng.integers(0, len(g), size=(n, len(g)))
    means = sums[idx].sum(1) / cnts[idx].sum(1)
    return (float(np.quantile(means, 0.025)), float(np.quantile(means, 0.975)))


def main():
    mk = fetch_closed_markets()
    mk = mk[mk["volumeNum"] >= MIN_VOL].copy()
    mk = mk[mk["outcomes"].astype(str).str.contains('"Yes", "No"', regex=False)]
    mk = mk[mk["outcomePrices"].isin(['["1", "0"]', '["0", "1"]'])]
    mk["y"] = (mk["outcomePrices"] == '["1", "0"]').astype(int)
    mk["endDate"] = pd.to_datetime(mk["endDate"], utc=True, errors="coerce")
    mk["closedTime"] = pd.to_datetime(mk["closedTime"], utc=True, errors="coerce", format="mixed")
    mk["anchor"] = mk[["endDate", "closedTime"]].min(axis=1)
    mk = mk.dropna(subset=["anchor"])
    mk["yes_token"] = mk["clobTokenIds"].apply(lambda s: json.loads(s)[0] if isinstance(s, str) else None)
    mk["category"] = mk["question"].fillna("").apply(classify)
    print(f"markets after filters: {len(mk)}", flush=True)

    # prefetch price histories with a small thread pool (4 workers, ~polite)
    from concurrent.futures import ThreadPoolExecutor

    todo = [t for t in mk["yes_token"].dropna().unique() if not (CACHE / f"{t}.json").exists()]
    print("to fetch:", len(todo), flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, _ in enumerate(ex.map(lambda t: (history(t) if t else None), todo)):
            if i % 250 == 0:
                print(f"fetched {i}/{len(todo)}  {time.time()-t0:.0f}s", flush=True)

    recs = []
    for i, r in enumerate(mk.itertuples(index=False)):
        try:
            h = history(r.yes_token)
        except Exception as e:  # noqa: BLE001
            print("err", r.id, e, flush=True)
            continue
        if not h:
            continue
        ts = np.array([x["t"] for x in h], dtype=float)
        px = np.array([x["p"] for x in h], dtype=float)
        a = r.anchor.timestamp()
        rec = {"id": r.id, "event_id": r.event_id or r.id, "question": r.question, "category": r.category,
               "y": r.y, "volume": r.volumeNum, "anchor": r.anchor, "hist_start": datetime.fromtimestamp(ts[0], timezone.utc)}
        for k in (1, 7, 30):
            cut = a - k * 86400
            j = np.searchsorted(ts, cut, side="right") - 1
            rec[f"p{k}"] = float(px[j]) if j >= 0 and ts[0] <= cut else np.nan
        recs.append(rec)
        if i % 250 == 0:
            print(f"{i}/{len(mk)}  {time.time()-t0:.0f}s", flush=True)
    df = pd.DataFrame(recs)
    df.to_csv(OUT / "pm_poly_calibration_panel.csv.gz", index=False, compression="gzip")

    summary = {"n_markets": int(len(df)), "min_volume_usd": MIN_VOL,
               "anchor_range": [str(df["anchor"].min()), str(df["anchor"].max())],
               "category_counts": df["category"].value_counts().to_dict()}
    for k in (1, 7, 30):
        col = f"p{k}"
        d = df.dropna(subset=[col])
        d = d[(d[col] > 0) & (d[col] < 1)]
        # both sides
        both = pd.concat([
            d.assign(price=d[col], win=d["y"], side="yes"),
            d.assign(price=1 - d[col], win=1 - d["y"], side="no"),
        ])
        both["ret"] = both["win"] / both["price"] - 1
        both["bucket"] = pd.cut(both["price"], BUCKETS, right=False)
        rows = []
        for b, g in both.groupby("bucket", observed=True):
            lo, hi = boot_ci(g, "win")
            rlo, rhi = boot_ci(g, "ret")
            rows.append({"bucket": str(b), "n": len(g), "n_events": g["event_id"].nunique(), "mean_price": g["price"].mean(),
                         "win_rate": g["win"].mean(), "win_ci_lo": lo, "win_ci_hi": hi,
                         "mean_ret_prefee": g["ret"].mean(), "ret_ci_lo": rlo, "ret_ci_hi": rhi})
        tab = pd.DataFrame(rows)
        tab.to_csv(OUT / f"pm_poly_calibration_{k}d.csv", index=False)
        brier = float(((d[col] - d["y"]) ** 2).mean())
        mae = float((d[col] - d["y"]).abs().mean())
        summary[f"h{k}d"] = {"n_markets": int(len(d)), "brier": round(brier, 4), "mae": round(mae, 4),
                             "table": tab.round(4).to_dict(orient="records")}
        # category-level returns for favourites >=0.9 and longshots <0.1
        cat = []
        for c, g in both.groupby("category"):
            fav = g[g["price"] >= 0.9]
            ls = g[g["price"] < 0.1]
            cat.append({"category": c, "fav_n": len(fav), "fav_ret": fav["ret"].mean(), "ls_n": len(ls), "ls_ret": ls["ret"].mean()})
        summary[f"h{k}d"]["by_category"] = pd.DataFrame(cat).round(4).to_dict(orient="records")
    save_json(summary, "pm_poly_calibration_summary.json")
    print(json.dumps({k: v for k, v in summary.items() if not k.startswith("h")}, indent=2, default=str))
    for k in (1, 7, 30):
        print(k, "d:", pd.DataFrame(summary[f"h{k}d"]["table"]).to_string())


if __name__ == "__main__":
    main()
