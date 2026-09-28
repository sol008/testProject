"""Empirical gap risk for stop-based trades (track 18, section 2.2).

Questions
---------
1. How big and how frequent are overnight / weekend gaps, in units of the recent daily vol?
2. When a protective stop is hit, how much worse than the planned 1R is the realised loss?
   (A sell-stop becomes a market order; if the market opens below the stop, the fill is
   at or below the open -- SEC Investor Bulletin "Stop, Stop-Limit, and Trailing Stop Orders".)
3. What "gap-adjusted stress multiple" should the sizing rule use per instrument group?

Method
------
* yfinance daily OHLC, split/dividend-adjusted (auto_adjust=True), 2005-01 .. 2026-09.
* Hypothetical long AND short entries at the close of every trading day (stride 1),
  stop at k x ATR(14) (k = 1, 2, 3), time stop 20 trading days, no target.
  Day d after entry: if Open_d is beyond the stop -> exit at Open_d (gap-through);
  elif the day's Low (High for shorts) touches the stop -> exit exactly at the stop.
  Realised loss in R = (entry - exit) / (entry - stop).  No extra slippage is added here.
* Universe = today's liquid names (survivorship bias: the worst historical gappers that
  were delisted are missing, so tails here are, if anything, understated).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from util18 import load_daily, save_table

GROUPS = {
    "Broad/sector ETFs": ["SPY", "QQQ", "IWM", "DIA", "EFA", "EEM", "XLE", "XLF", "XLK", "XLV",
                          "XLU", "XLI", "SMH", "XBI", "KRE", "FXI"],
    "Rates/commodity ETFs": ["TLT", "IEF", "HYG", "GLD", "SLV", "USO"],
    "Large-cap stocks": ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "JPM", "XOM",
                         "JNJ", "UNH", "PG", "V", "HD", "BAC", "INTC", "AMD", "NFLX", "CRM",
                         "ADBE", "PFE", "KO", "WMT", "DIS", "BA", "CSCO", "ORCL", "MRK", "CVX",
                         "WFC", "C", "GS", "NKE", "MCD", "T", "VZ", "GE", "F", "GM", "CAT"],
    "High-vol stocks": ["COIN", "MSTR", "PLTR", "SMCI", "ROKU", "SNAP", "MRNA", "SHOP", "UBER",
                        "CVNA", "ENPH", "TWLO", "ZM", "PTON", "BYND", "GME", "TDOC", "RIVN"],
    "Bitcoin ETFs (IBIT, BITO)": ["IBIT", "BITO"],
}
HORIZON = 20
ATR_N = 14


def atr(df, n=ATR_N):
    h, l, c = df["High"].values, df["Low"].values, df["Close"].values
    pc = np.r_[np.nan, c[:-1]]
    tr = np.nanmax(np.vstack([h - l, np.abs(h - pc), np.abs(l - pc)]), axis=0)
    return pd.Series(tr, index=df.index).rolling(n).mean().values


def gap_stats(df):
    o, c = df["Open"].values, df["Close"].values
    lr_cc = np.diff(np.log(c))
    gap = o[1:] / c[:-1] - 1.0
    sig = pd.Series(lr_cc).rolling(20).std().shift(1).values  # vol known before the gap
    dates = df.index[1:]
    wk = np.r_[False, (np.diff(dates.values).astype("timedelta64[D]").astype(int) > 1)[:]]
    wk = wk[: len(gap)]
    ok = np.isfinite(sig) & (sig > 0)
    z = gap[ok] / sig[ok]
    lr_on = np.log(o[1:] / c[:-1])[ok]
    lr_id = np.log(c[1:] / o[1:])[ok]
    return dict(z=z, weekend=wk[ok], var_share_overnight=np.var(lr_on) / np.var(lr_on + lr_id),
                gap=gap[ok])


def stop_outcomes(df, k, side=+1, horizon=HORIZON):
    """Realised loss in R for stop-outs of hypothetical entries at every close."""
    o, h, l, c = (df[x].values for x in ("Open", "High", "Low", "Close"))
    a = atr(df)
    n = len(c)
    idx = np.arange(ATR_N, n - horizon)
    idx = idx[np.isfinite(a[idx]) & (a[idx] > 0)]
    entry = c[idx]
    dist = k * a[idx]
    stop = entry - side * dist
    O = sliding_window_view(o, horizon)[idx + 1]       # rows: entries; cols: days 1..h
    H = sliding_window_view(h, horizon)[idx + 1]
    L = sliding_window_view(l, horizon)[idx + 1]
    if side > 0:
        gap_hit = O <= stop[:, None]
        touch = (L <= stop[:, None]) | gap_hit
    else:
        gap_hit = O >= stop[:, None]
        touch = (H >= stop[:, None]) | gap_hit
    any_hit = touch.any(axis=1)
    first = np.argmax(touch, axis=1)
    rows = np.arange(len(idx))
    via_gap = gap_hit[rows, first] & any_hit
    exit_px = np.where(via_gap, O[rows, first], stop)
    loss_R = side * (entry - exit_px) / dist
    return dict(hit=any_hit, via_gap=via_gap, loss_R=loss_R[any_hit], n=len(idx),
                gap_loss_R=loss_R[any_hit & via_gap])


def main():
    tickers = sorted({t for g in GROUPS.values() for t in g})
    data = load_daily(tickers, start="2005-01-01")
    gap_rows, stop_rows, tail_rows = [], [], []
    for g, names in GROUPS.items():
        zs, wks, shares = [], [], []
        for t in names:
            if t not in data:
                continue
            s = gap_stats(data[t])
            zs.append(s["z"]); wks.append(s["weekend"]); shares.append(s["var_share_overnight"])
        z = np.concatenate(zs); wk = np.concatenate(wks)
        gap_rows.append({
            "Group": g, "Tickers": sum(t in data for t in names), "Stock-days": len(z),
            "Overnight share of daily variance (median)": float(np.median(shares)),
            "P(|gap| > 1 sigma)": float(np.mean(np.abs(z) > 1)),
            "P(|gap| > 2 sigma)": float(np.mean(np.abs(z) > 2)),
            "P(|gap| > 4 sigma)": float(np.mean(np.abs(z) > 4)),
            "P(gap < -4 sigma)": float(np.mean(z < -4)),
            "P(|gap| > 2 sigma) after weekend/holiday": float(np.mean(np.abs(z[wk]) > 2)),
            "P(|gap| > 2 sigma) other days": float(np.mean(np.abs(z[~wk]) > 2)),
            "Worst gap (sigma)": float(z.min()),
        })
        for k in (1, 2, 3):
            for side, lab in ((+1, "long"), (-1, "short")):
                hits, gaps, losses, n = 0, 0, [], 0
                for t in names:
                    if t not in data:
                        continue
                    r = stop_outcomes(data[t], k, side)
                    n += r["n"]; hits += r["hit"].sum(); gaps += r["via_gap"].sum()
                    losses.append(r["loss_R"])
                L = np.concatenate(losses)
                stop_rows.append({
                    "Group": g, "Stop (x ATR14)": k, "Side": lab, "Entries": n,
                    "Stopped out within 20d": hits / n,
                    "Stop-outs that gapped through": gaps / max(hits, 1),
                    "Mean loss when stopped (R)": float(L.mean()),
                    "P95 loss (R)": float(np.quantile(L, 0.95)),
                    "P99 loss (R)": float(np.quantile(L, 0.99)),
                    "P99.9 loss (R)": float(np.quantile(L, 0.999)),
                    "Worst (R)": float(L.max()),
                })
        # tail multiple used for sizing: P99 of long and short stop-outs at 2 x ATR
    gdf = save_table(pd.DataFrame(gap_rows), "gap_distribution")
    sdf = save_table(pd.DataFrame(stop_rows), "stop_gap_through")
    # IBIT weekend vs weekday, and BTC spot for comparison
    for t in ("IBIT", "BITO"):
        if t in data:
            s = gap_stats(data[t])
            tail_rows.append({"Ticker": t, "Days": len(s["gap"]),
                              "Mean |gap| after weekend": float(np.mean(np.abs(s["gap"][s["weekend"]]))),
                              "Mean |gap| other days": float(np.mean(np.abs(s["gap"][~s["weekend"]]))),
                              "P(|gap|>5%) after weekend": float(np.mean(np.abs(s["gap"][s["weekend"]]) > 0.05)),
                              "P(|gap|>5%) other days": float(np.mean(np.abs(s["gap"][~s["weekend"]]) > 0.05)),
                              "Worst gap": float(s["gap"].min())})
    save_table(pd.DataFrame(tail_rows), "btc_etf_weekend_gaps")
    # Entry bands: how often does the next open fall outside close +/- k daily sigmas (skip rate)?
    band_rows = []
    for g, names in GROUPS.items():
        z = np.concatenate([gap_stats(data[t])["z"] for t in names if t in data])
        band_rows.append({"Group": g, **{f"Skip rate, band +/-{k} sigma": float(np.mean(np.abs(z) > k))
                                         for k in (0.5, 1.0, 1.5, 2.0)},
                          "Buy side only: P(open > close + 1 sigma)": float(np.mean(z > 1.0))})
    save_table(pd.DataFrame(band_rows), "entry_band_skip_rates")
    return gdf, sdf


if __name__ == "__main__":
    pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
    g, s = main()
    print(g.to_string())
    print(s.to_string())
