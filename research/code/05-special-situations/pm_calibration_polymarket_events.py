"""Selection-robust Polymarket calibration: complete events.

The per-market volume filter in pm_calibration_polymarket.py conditions on a
post-outcome variable (winning longshots attract late volume), which biases
longshot win-rates upward.  Here we take the same events (chosen by their
highest-volume market) but include EVERY resolved binary market in each event,
whatever its own volume, then redo the calibration table.

Run after pm_calibration_polymarket.py:  python pm_calibration_polymarket_events.py
Outputs: output/pm_poly_events_calibration_{1,7,30}d.csv, output/pm_poly_events_calibration_summary.json
"""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from common import OUT, SCRATCH, get_json, save_json
from pm_calibration_polymarket import BUCKETS, boot_ci, classify, history

GAMMA = "https://gamma-api.polymarket.com"
EVCACHE = SCRATCH / "poly_events"
EVCACHE.mkdir(exist_ok=True)
MAX_MARKETS_PER_EVENT = 80


def event(eid: str) -> dict:
    f = EVCACHE / f"{eid}.json"
    if f.exists():
        return json.loads(f.read_text())
    try:
        d = get_json(f"{GAMMA}/events/{eid}", sleep=0.1)
    except Exception:  # noqa: BLE001
        d = {}
    keep = {"id": d.get("id"), "title": d.get("title"), "volume": d.get("volume"),
            "markets": [{k: m.get(k) for k in ("id", "question", "outcomes", "outcomePrices", "endDate", "closedTime", "clobTokenIds", "volumeNum")}
                        for m in d.get("markets", [])]}
    f.write_text(json.dumps(keep))
    return keep


def main():
    panel = pd.read_csv(OUT / "pm_poly_calibration_panel.csv.gz", dtype={"event_id": str, "id": str})
    eids = panel["event_id"].dropna().astype(str).unique().tolist()
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as ex:
        evs = list(ex.map(event, eids))
    print("events fetched", len(evs), f"{time.time()-t0:.0f}s", flush=True)
    rows = []
    for e in evs:
        ms = e.get("markets") or []
        if not ms or len(ms) > MAX_MARKETS_PER_EVENT:
            continue
        for m in ms:
            if m.get("outcomePrices") not in ('["1", "0"]', '["0", "1"]'):
                continue
            if '"Yes", "No"' not in str(m.get("outcomes")):
                continue
            rows.append({"event_id": str(e["id"]), "id": str(m["id"]), "question": m.get("question"), "y": int(m["outcomePrices"] == '["1", "0"]'),
                         "endDate": m.get("endDate"), "closedTime": m.get("closedTime"),
                         "yes_token": json.loads(m["clobTokenIds"])[0] if m.get("clobTokenIds") else None,
                         "volume": float(m.get("volumeNum") or 0), "n_in_event": len(ms)})
    mk = pd.DataFrame(rows)
    mk["endDate"] = pd.to_datetime(mk["endDate"], utc=True, errors="coerce")
    mk["closedTime"] = pd.to_datetime(mk["closedTime"], utc=True, errors="coerce", format="mixed")
    # event-level anchor: earliest of (endDate, closedTime) across the event's markets that resolved NO is
    # not appropriate (losers can close early); use each market's own min(endDate, closedTime)
    mk["anchor"] = mk[["endDate", "closedTime"]].min(axis=1)
    mk = mk.dropna(subset=["anchor", "yes_token"])
    print("markets in complete events:", len(mk), " of which volume<100k:", int((mk["volume"] < 100_000).sum()), flush=True)
    todo = [t for t in mk["yes_token"].unique() if not (SCRATCH / "poly_hist" / f"{t}.json").exists()]
    print("histories to fetch:", len(todo), flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, _ in enumerate(ex.map(history, todo)):
            if i % 500 == 0:
                print(f"fetched {i}/{len(todo)} {time.time()-t0:.0f}s", flush=True)
    recs = []
    for r in mk.itertuples(index=False):
        h = history(r.yes_token)
        if not h:
            continue
        ts = np.array([x["t"] for x in h], dtype=float)
        px = np.array([x["p"] for x in h], dtype=float)
        a = r.anchor.timestamp()
        rec = {"event_id": r.event_id, "id": r.id, "y": r.y, "volume": r.volume, "category": classify(r.question or ""), "n_in_event": r.n_in_event}
        for k in (1, 7, 30):
            cut = a - k * 86400
            j = np.searchsorted(ts, cut, side="right") - 1
            rec[f"p{k}"] = float(px[j]) if j >= 0 and ts[0] <= cut else np.nan
        recs.append(rec)
    df = pd.DataFrame(recs)
    df.to_csv(OUT / "pm_poly_events_calibration_panel.csv.gz", index=False, compression="gzip")
    summary = {"n_markets": int(len(df)), "n_events": int(df["event_id"].nunique()), "share_markets_volume_below_100k": round(float((df["volume"] < 1e5).mean()), 3)}
    for k in (1, 7, 30):
        col = f"p{k}"
        d = df.dropna(subset=[col])
        d = d[(d[col] > 0) & (d[col] < 1)]
        both = pd.concat([d.assign(price=d[col], win=d["y"]), d.assign(price=1 - d[col], win=1 - d["y"])])
        both["ret"] = both["win"] / both["price"] - 1
        both["bucket"] = pd.cut(both["price"], BUCKETS, right=False)
        tab = []
        for b, g in both.groupby("bucket", observed=True):
            lo, hi = boot_ci(g, "win")
            rlo, rhi = boot_ci(g, "ret")
            tab.append({"bucket": str(b), "n": len(g), "n_events": g["event_id"].nunique(), "mean_price": g["price"].mean(), "win_rate": g["win"].mean(),
                        "win_ci_lo": lo, "win_ci_hi": hi, "mean_ret_prefee": g["ret"].mean(), "ret_ci_lo": rlo, "ret_ci_hi": rhi})
        tab = pd.DataFrame(tab)
        tab.to_csv(OUT / f"pm_poly_events_calibration_{k}d.csv", index=False)
        summary[f"h{k}d"] = {"n_markets": int(len(d)), "brier": round(float(((d[col] - d['y']) ** 2).mean()), 4), "table": tab.round(4).to_dict(orient="records")}
        print(k, "d\n", tab.round(4).to_string(), flush=True)
    save_json(summary, "pm_poly_events_calibration_summary.json")


if __name__ == "__main__":
    main()
