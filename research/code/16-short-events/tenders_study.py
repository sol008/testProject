"""Issuer tender offers (Dutch auction and fixed price), 2012-2026: odd-lot priority economics
and the round-lot follower's 1-60 day return.

Input: track 05's parsed EDGAR sample (research/code/05-special-situations/output/odd_lot_tenders.csv:
SC TO-I filings by listed issuers mentioning odd-lot priority, with parsed minimum price 'lo').
  * Odd-lot trade: buy <= 99 shares ~30 calendar days after filing (near expiry) when the minimum
    tender price exceeds the market; tender at the purchase price; cash ~5-10 sessions later.
    Per-trade return = lo / px_day30 - 1 minus a $25 broker voluntary-action fee (0-50 range).
  * Round-lot follower: buy at the close of the first session after the filing date and hold
    5 / 20 / 60 sessions (no tender: proration makes tendering a partial exit), IWM/SPY-adjusted.
Closed-end funds / BDCs / interval funds are excluded (name filter).
Run: python tenders_study.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import COST_RT, OUT, cap_bucket, load_prices, save_csv, save_json, trade_stats
from fastev import anchor_windows

SRC = OUT.parent.parent / "05-special-situations" / "output" / "odd_lot_tenders.csv"
FUND = r"FUND|TRUST|INCOME|MUNICIPAL|CAPITAL CORP|BDC|INVESTMENT CORP|PORTFOLIO|OPPORTUNITIES|CREDIT|LENDING|FINANCE CORP|STRATEGIES|PARTNERS LP"


def main():
    t = pd.read_csv(SRC, parse_dates=["file_date"])
    t = t[t["ticker"].notna() & ~t["name"].str.upper().str.contains(FUND, regex=True)].copy()
    t["ticker"] = t["ticker"].str.replace(".", "-", regex=False)
    # ---- odd-lot economics (price-parsed subset)
    ok = t.dropna(subset=["lo", "px_day30"]).copy()
    ok["edge"] = ok["lo"] / ok["px_day30"] - 1
    ok = ok[ok["edge"].abs() < 0.6]
    pos = ok[ok["edge"] > 0.005].copy()
    pos["gross_usd_99"] = 99 * (pos["lo"] - pos["px_day30"])
    pos["net_usd_99"] = pos["gross_usd_99"] - 25
    pos["capital_usd_99"] = 99 * pos["px_day30"]
    pos["net_ret"] = pos["net_usd_99"] / pos["capital_usd_99"]
    years = (ok["file_date"].max() - ok["file_date"].min()).days / 365.25
    odd = {"n_parsed_operating_cos": int(len(ok)), "years": round(years, 1),
           "share_with_min_price_above_market_by_0.5%": round(float((ok["edge"] > 0.005).mean()), 3),
           "qualifying_per_year": round(len(pos) / years, 1),
           "median_edge_%_qualifying": round(100 * float(pos["edge"].median()), 2),
           "median_net_usd_per_trade_($25 fee)": round(float(pos["net_usd_99"].median()), 0),
           "mean_net_usd_per_trade": round(float(pos["net_usd_99"].mean()), 0),
           "median_capital_usd": round(float(pos["capital_usd_99"].median()), 0),
           "median_net_return_%": round(100 * float(pos["net_ret"].median()), 2),
           "share_net_negative_after_fee": round(float((pos["net_usd_99"] < 0).mean()), 3),
           "annual_usd_if_all_taken_median_x_n": round(float(pos["net_usd_99"].median() * len(pos) / years), 0),
           "annual_usd_if_all_taken_mean_x_n": round(float(pos["net_usd_99"].mean() * len(pos) / years), 0)}
    # ---- round-lot follower returns
    load_prices(sorted(set(t["ticker"])) + ["SPY", "IWM"], batch=100, verbose=False)
    ev = t.rename(columns={"file_date": "anchor"})[["ticker", "anchor", "type", "name"]].reset_index(drop=True)
    ev = anchor_windows(ev, {"ann": (-1, 1), "f5": (1, 6), "f20": (1, 21), "f60": (1, 61), "exp_to_60": (21, 61)},
                        bench=["SPY", "IWM"])
    ev = ev[(ev["raw_px"] >= 2) & (ev["hist"] >= 60)]
    ev["mcap_proxy_bucket"] = np.where(ev["dvol20"] >= 2e7, "mid (>=$2bn)", np.where(ev["dvol20"] >= 2e6, "small ($0.3-2bn)", "micro ($50-300m)"))
    ev["cost_rt"] = ev["mcap_proxy_bucket"].map({"mid (>=$2bn)": COST_RT["mid ($2-10bn)"], "small ($0.3-2bn)": COST_RT["small ($0.3-2bn)"],
                                                 "micro ($50-300m)": COST_RT["micro ($50-300m)"]})
    for w in ["ann", "f5", "f20", "f60", "exp_to_60"]:
        ev[f"x_{w}"] = ev[w] - ev[f"{w}_IWM"]
    rows = []
    for typ, g in list(ev.groupby("type")) + [("ALL", ev)]:
        for w in ["ann", "f5", "f20", "f60", "exp_to_60"]:
            r = g[f"x_{w}"] - (g["cost_rt"] if w != "ann" else 0)
            rows.append({"type": typ, "window": w, **trade_stats(r, per_year=len(r.dropna()) / years)})
    tab = pd.DataFrame(rows)
    save_csv(tab, "issuer_tender_follower.csv")
    save_json({"odd_lot": odd, "note": "round-lot table in issuer_tender_follower.csv"}, "issuer_tender_summary.json")
    pd.set_option("display.width", 220)
    print(odd)
    print(tab[["type", "window", "n", "per_yr", "mean_%", "median_%", "t", "win_%", "p5_%", "max_loss_%"]].to_string())


if __name__ == "__main__":
    main()
