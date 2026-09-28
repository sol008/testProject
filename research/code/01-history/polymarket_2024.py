"""Price of 'Trump wins 2024' on Polymarket before the election (context for the 'Theo' whale).
Uses the public gamma + CLOB price-history endpoints (no key needed).
Output: ./output/polymarket_trump_2024.csv (daily price history)."""
from __future__ import annotations

import datetime as dt

import pandas as pd
import requests

from common import OUT_DIR

EVENT = "presidential-election-winner-2024"


def main():
    ev = requests.get(f"https://gamma-api.polymarket.com/events?slug={EVENT}", timeout=60).json()[0]
    mk = [m for m in ev["markets"] if "Donald Trump" in m["question"]][0]
    import json
    yes_token = json.loads(mk["clobTokenIds"])[0]
    h = requests.get("https://clob.polymarket.com/prices-history",
                     params={"market": yes_token, "interval": "max", "fidelity": 1440}, timeout=60).json()["history"]
    df = pd.DataFrame(h)
    df["date"] = [dt.datetime.utcfromtimestamp(t).date() for t in df["t"]]
    df = df[["date", "p"]].rename(columns={"p": "trump_yes_price"})
    df.to_csv(OUT_DIR / "polymarket_trump_2024.csv", index=False)
    sel = df[df["date"].astype(str).isin(["2024-07-01", "2024-08-15", "2024-10-01", "2024-10-15",
                                          "2024-11-01", "2024-11-04", "2024-11-05"])]
    print(f"event volume ${float(ev['volume']):,.0f}; Trump market volume ${float(mk['volume']):,.0f}")
    print(sel.to_string(index=False))
    print("min price in 2024-H2:", df[df["date"] >= dt.date(2024, 7, 1)]["trump_yes_price"].min())


if __name__ == "__main__":
    main()
