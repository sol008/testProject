"""Commodity squeezes / structural shortages: episode statistics + live term-structure signal.

1. Episodes (Yahoo continuous front-month or proxies):
   cocoa (CC=F), uranium (Sprott Physical Uranium Trust SRUUF; Cameco CCJ; URA ETF),
   gold (GC=F), silver (SI=F), crude (CL=F), coffee (KC=F), copper (HG=F).
   Reports run-up multiple from 2y low to peak and subsequent drawdown.
2. Live term structure: annualised roll yield between the nearby and a ~6-12m
   deferred contract (positive = backwardation = market paying you to hold).
   Literature: Gorton, Hayashi & Rouwenhorst (2013); Koijen, Moskowitz, Pedersen & Vrugt (2018).

Run: python commodities.py     Outputs: output/commodities.json
"""
from __future__ import annotations

import json
from datetime import datetime

import numpy as np
import pandas as pd
import yfinance as yf

from common import save_json, yf_close

EPISODES = {
    "cocoa CC=F": ("CC=F", "2022-01-01"),
    "uranium trust SRUUF": ("SRUUF", "2021-07-22"),
    "uranium miners URA": ("URA", "2016-01-01"),
    "Cameco CCJ": ("CCJ", "2016-01-01"),
    "gold GC=F": ("GC=F", "2022-01-01"),
    "silver SI=F": ("SI=F", "2022-01-01"),
    "copper HG=F": ("HG=F", "2022-01-01"),
    "coffee KC=F": ("KC=F", "2022-01-01"),
    "crude CL=F": ("CL=F", "2022-01-01"),
}

CURVES = {  # (nearby, deferred, months apart)
    "crude (CL) Nov26 vs Dec27": ("CLX26.NYM", "CLZ27.NYM", 13),
    "cocoa (CC) Dec26 vs Jul27": ("CCZ26.NYB", "CCN27.NYB", 7),
    "coffee (KC) Dec26 vs Mar27": ("KCZ26.NYB", "KCH27.NYB", 3),
    "gold (GC) Dec26 vs Dec27": ("GCZ26.CMX", "GCZ27.CMX", 12),
    "silver (SI) Dec26 vs Mar27": ("SIZ26.CMX", "SIH27.CMX", 3),
    "copper (HG) Dec26 vs Mar27": ("HGZ26.CMX", "HGH27.CMX", 3),
    "corn (ZC) Dec26 vs Mar27": ("ZCZ26.CBT", "ZCH27.CBT", 3),
}


def episode(ticker: str, start: str) -> dict:
    s = yf_close(ticker, start=start)[ticker].dropna()
    peak_d = s.idxmax()
    pre = s[s.index <= peak_d]
    low_before = pre[pre.index >= peak_d - pd.Timedelta(days=730)].min()
    low_d = pre[pre.index >= peak_d - pd.Timedelta(days=730)].idxmin()
    after = s[s.index >= peak_d]
    return {"ticker": ticker, "2y_low_before_peak": round(float(low_before), 2), "low_date": str(low_d.date()),
            "peak": round(float(s.max()), 2), "peak_date": str(peak_d.date()),
            "run_up_x": round(float(s.max() / low_before), 2),
            "max_dd_after_peak_%": round(100 * float(after.min() / s.max() - 1), 1),
            "last": round(float(s.iloc[-1]), 2), "last_vs_peak_%": round(100 * float(s.iloc[-1] / s.max() - 1), 1),
            "realised_vol_1y_%": round(100 * float(np.log(s).diff().iloc[-252:].std() * np.sqrt(252)), 1)}


def main():
    res = {"episodes": {k: episode(*v) for k, v in EPISODES.items()}}
    tk = sorted({t for v in CURVES.values() for t in v[:2]})
    px = yf.download(tk, period="10d", auto_adjust=False, progress=False)["Close"].ffill().iloc[-1]
    curves = {}
    for name, (a, b, m) in CURVES.items():
        pa, pb = float(px[a]), float(px[b])
        curves[name] = {"nearby": a, "deferred": b, "p_near": round(pa, 3), "p_def": round(pb, 3),
                        "annualised_roll_yield_%": round(100 * ((pa / pb) ** (12 / m) - 1), 1)}
    res["term_structure_now"] = curves
    res["as_of"] = datetime.utcnow().isoformat()
    save_json(res, "commodities.json")
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
