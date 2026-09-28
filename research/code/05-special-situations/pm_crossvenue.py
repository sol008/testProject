"""Cross-venue check (Kalshi vs Polymarket) on identical high-volume questions.

Pulls live quotes for hand-matched pairs and computes the cost of the 'riskless'
cross-venue box: buy YES on one venue + buy NO (i.e. the complementary outcome) on
the other, including taker fees.  Cost < $1 would be an arbitrage (ignoring
resolution-wording risk, capital lock-up and the fact that US persons cannot
trade the international Polymarket book).

Run: python pm_crossvenue.py      Output: output/pm_crossvenue.csv
"""
from __future__ import annotations

import math

import pandas as pd

from common import OUT, get_json

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
GAMMA = "https://gamma-api.polymarket.com"

# (label, kalshi YES ticker, polymarket slug-substring for the SAME outcome, polymarket question substring)
PAIRS = [
    ("Democrats win House 2026", "CONTROLH-2026-D", "Will the Democratic Party control the House after the 2026 Midterm elections?"),
    ("Democrats win Senate 2026", "CONTROLS-2026-D", "Will the Democratic Party control the Senate after the 2026 Midterm elections?"),
    ("Fed hikes 25bp Oct-2026", "KXFEDDECISION-26OCT-H25", "Will the Fed increase interest rates by 25 bps after the October 2026 meeting?"),
    ("Fed no change Oct-2026", "KXFEDDECISION-26OCT-H0", "Will there be no change in Fed interest rates after the October 2026 meeting?"),
]


def kalshi_fee(p: float) -> float:
    return math.ceil(0.07 * p * (1 - p) * 100 * 100) / 100 / 100


def poly_fee(p: float, rate: float = 0.04) -> float:
    return rate * p * (1 - p)


def main():
    rows = []
    for label, kt, pq in PAIRS:
        k = get_json(f"{KALSHI}/markets/{kt}")["market"]
        kya, kyb = float(k["yes_ask_dollars"]), float(k["yes_bid_dollars"])
        kna = float(k["no_ask_dollars"])
        snap = pd.read_csv(OUT / "polymarket_open_markets.csv.gz", usecols=["id", "question"], dtype={"id": str})
        ids = snap.loc[snap["question"] == pq, "id"].tolist()
        if not ids:
            continue
        m = get_json(f"{GAMMA}/markets/{ids[0]}")
        pya, pyb = float(m["bestAsk"]), float(m["bestBid"])
        pna = 1 - pyb
        box1 = kya + kalshi_fee(kya) + pna + poly_fee(pna)  # YES on Kalshi + NO on Polymarket
        box2 = pya + poly_fee(pya) + kna + kalshi_fee(kna)  # YES on Polymarket + NO on Kalshi
        rows.append({"question": label, "kalshi_yes_bid": kyb, "kalshi_yes_ask": kya, "poly_yes_bid": pyb, "poly_yes_ask": pya,
                     "mid_gap_cents": round(100 * ((kya + kyb) / 2 - (pya + pyb) / 2), 2),
                     "box_cost_K_yes_P_no": round(box1, 4), "box_cost_P_yes_K_no": round(box2, 4)})
    df = pd.DataFrame(rows)
    df.to_csv(OUT / "pm_crossvenue.csv", index=False)
    print(df.to_string())


if __name__ == "__main__":
    main()
