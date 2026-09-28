"""Crypto structural trades: funding carry, futures basis, halving cycles, stablecoin depegs.

A. Perpetual-swap funding carry: BitMEX XBTUSD funding history (8-hourly, 2016-05 ->),
   annualised by year; share of negative funding; the payoff of the classic
   'long spot / short perp' carry (collects funding, market-neutral in USD terms
   ignoring basis/exchange risk).
B. Dated-futures basis: Deribit quarterly BTC futures vs BTC-PERPETUAL (≈ index),
   daily UTC closes 2019->, using the quarterly contract with 45-135 days to expiry.
C. Live term-structure snapshot (Deribit, Kraken Futures, CME via Yahoo) and
   current funding on several venues.
D. Bitcoin halving cycles (n=4; tiny sample!) from Yahoo BTC-USD.
E. Stablecoin de-peg events from DefiLlama daily stablecoin prices: depth,
   time below $0.99, and whether the peg recovered.

Run: python crypto_structural.py      Outputs: output/crypto_structural.json + CSVs
"""
from __future__ import annotations

import json
import time
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

from common import OUT, SCRATCH, UA, fred, get_json, save_json, yf_close

NOW = datetime.now(timezone.utc)


# ---------------- A. BitMEX funding ----------------
def bitmex_funding() -> pd.DataFrame:
    cache = SCRATCH / "bitmex_funding_xbtusd.csv"
    if cache.exists() and time.time() - cache.stat().st_mtime < 86400:
        return pd.read_csv(cache, parse_dates=["timestamp"])
    rows, start = [], 0
    while True:
        d = get_json("https://www.bitmex.com/api/v1/funding", {"symbol": "XBTUSD", "count": 500, "start": start, "reverse": "false"}, sleep=1.2)
        if not d:
            break
        rows.extend(d)
        start += len(d)
        if len(d) < 500:
            break
    df = pd.DataFrame(rows)[["timestamp", "fundingRate"]]
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df.to_csv(cache, index=False)
    return df


def funding_stats(df: pd.DataFrame) -> dict:
    s = df.set_index("timestamp")["fundingRate"]
    # BitMEX funding interval was daily in 2016 and 8-hourly later -> annualise from daily sums
    daily = s.resample("D").sum()
    daily = daily[daily.index >= s.index[0].normalize()]
    per_year = pd.DataFrame({
        "annualised_%": daily.groupby(daily.index.year).mean() * 365 * 100,
        "share_negative": s.groupby(s.index.year).apply(lambda x: (x < 0).mean()),
        "n": s.groupby(s.index.year).size(),
    })
    roll30 = daily.rolling(30).sum() * 365 / 30 * 100
    cum = daily.cumsum()
    # carry P&L: compounding funding received by short-perp leg (ignores fees, basis at entry/exit, collateral)
    total_years = (s.index[-1] - s.index[0]).days / 365.25
    ann_all = 100 * daily.mean() * 365
    # worst 90-day stretch of cumulative funding
    worst90 = float((daily.rolling(90).sum()).min() * 100)
    return {
        "period": [str(s.index[0].date()), str(s.index[-1].date())],
        "annualised_mean_all_%": round(float(ann_all), 2),
        "share_8h_periods_negative": round(float((s < 0).mean()), 3),
        "rolling30d_annualised_%_quantiles": {q: round(float(roll30.quantile(q)), 1) for q in (0.05, 0.25, 0.5, 0.75, 0.95)},
        "max_rolling30d_annualised_%": round(float(roll30.max()), 1),
        "min_rolling30d_annualised_%": round(float(roll30.min()), 1),
        "worst_90d_cumulative_funding_%": round(worst90, 2),
        "per_year": per_year[["annualised_%", "share_negative", "n"]].round(3).reset_index().rename(columns={"timestamp": "year"}).to_dict(orient="records"),
        "years": round(total_years, 1),
    }


# ---------------- B. Deribit quarterly basis ----------------
MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def last_friday(y: int, m: int) -> date:
    d = date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
    while d.weekday() != 4:
        d -= timedelta(days=1)
    return d


def deribit_candles(inst: str, start: datetime, end: datetime) -> pd.Series:
    cache = SCRATCH / f"deribit_{inst}.csv"
    if cache.exists():
        s = pd.read_csv(cache, index_col=0, parse_dates=True).iloc[:, 0]
        return s
    d = get_json("https://www.deribit.com/api/v2/public/get_tradingview_chart_data",
                 {"instrument_name": inst, "start_timestamp": int(start.timestamp() * 1000),
                  "end_timestamp": int(end.timestamp() * 1000), "resolution": "1D"}, sleep=0.2)
    r = (d or {}).get("result") or {}
    if not r or r.get("status") == "no_data" or not r.get("ticks"):
        s = pd.Series(dtype=float)
    else:
        s = pd.Series(r["close"], index=pd.to_datetime(r["ticks"], unit="ms", utc=True).normalize())
    s.to_csv(cache)
    return s


def deribit_basis() -> pd.DataFrame:
    start = datetime(2019, 1, 1, tzinfo=timezone.utc)
    # BTC-PERPETUAL daily closes (≈ index), one call per calendar year, cached
    parts = []
    for y in range(2019, NOW.year + 1):
        cache = SCRATCH / f"deribit_perp_{y}.csv"
        if cache.exists():
            parts.append(pd.read_csv(cache, index_col=0, parse_dates=True).iloc[:, 0])
            continue
        d = get_json("https://www.deribit.com/api/v2/public/get_tradingview_chart_data",
                     {"instrument_name": "BTC-PERPETUAL", "start_timestamp": int(datetime(y, 1, 1, tzinfo=timezone.utc).timestamp() * 1000),
                      "end_timestamp": int(min(NOW, datetime(y, 12, 31, 23, tzinfo=timezone.utc)).timestamp() * 1000), "resolution": "1D"}, sleep=0.2)
        r = d["result"]
        s = pd.Series(r["close"], index=pd.to_datetime(r["ticks"], unit="ms", utc=True).normalize())
        s.to_csv(cache)
        parts.append(s)
    perp = pd.concat(parts)
    perp = perp[~perp.index.duplicated()].sort_index()
    perp.index = pd.to_datetime(perp.index, utc=True)

    rows = []
    for y in range(2018, NOW.year + 2):
        for m in (3, 6, 9, 12):
            exp = last_friday(y, m)
            exp_dt = datetime(exp.year, exp.month, exp.day, 8, tzinfo=timezone.utc)
            if exp_dt < start + timedelta(days=45) or exp_dt - timedelta(days=200) > NOW - timedelta(days=2):
                continue
            inst = f"BTC-{exp.day}{MON[exp.month-1]}{str(exp.year)[2:]}"
            s = deribit_candles(inst, exp_dt - timedelta(days=200), min(NOW, exp_dt))
            if s.empty:
                continue
            s.index = pd.to_datetime(s.index, utc=True)
            df = pd.DataFrame({"fut": s}).join(perp.rename("spot"), how="inner")
            df["dte"] = (pd.Timestamp(exp_dt) - df.index).days
            df = df[(df["dte"] >= 45) & (df["dte"] <= 135)]
            df["basis_ann_%"] = 100 * ((df["fut"] / df["spot"]) ** (365 / df["dte"]) - 1)
            df["inst"] = inst
            rows.append(df)
    b = pd.concat(rows).sort_index()
    b = b[~b.index.duplicated(keep="first")]
    return b


# ---------------- C. snapshot ----------------
def snapshot() -> dict:
    out = {}
    d = get_json("https://www.deribit.com/api/v2/public/get_book_summary_by_currency", {"currency": "BTC", "kind": "future"})
    rows = []
    for x in d["result"]:
        name = x["instrument_name"]
        if "PERPETUAL" in name:
            continue
        exp = datetime.strptime(name.split("-")[1], "%d%b%y").replace(hour=8, tzinfo=timezone.utc)
        dte = (exp - NOW).total_seconds() / 86400
        if dte < 7:
            continue
        mid = x.get("mark_price")
        idx = x.get("estimated_delivery_price") or x.get("underlying_price")
        rows.append({"venue": "Deribit", "inst": name, "dte": round(dte, 1), "fut": mid, "index": idx,
                     "basis_ann_%": round(100 * ((mid / idx) ** (365 / dte) - 1), 2), "oi_usd": x.get("open_interest")})
    k = get_json("https://futures.kraken.com/derivatives/api/v3/tickers")
    for x in k["tickers"]:
        s = x["symbol"]
        if s.startswith("FF_XBTUSD_"):
            exp = datetime.strptime(s.split("_")[-1], "%y%m%d").replace(hour=16, tzinfo=timezone.utc)
            dte = (exp - NOW).total_seconds() / 86400
            if dte < 7:
                continue
            rows.append({"venue": "Kraken", "inst": s, "dte": round(dte, 1), "fut": x["markPrice"], "index": x["indexPrice"],
                         "basis_ann_%": round(100 * ((x["markPrice"] / x["indexPrice"]) ** (365 / dte) - 1), 2), "oi_usd": None})
    out["term_structure"] = sorted(rows, key=lambda r: (r["venue"], r["dte"]))
    px = yf_close(["BTC=F", "BTC-USD"], start=(NOW - timedelta(days=10)).strftime("%Y-%m-%d"))
    out["cme_front_vs_spot_%_(timing-mismatched closes)"] = round(float(100 * (px["BTC=F"].dropna().iloc[-1] / px["BTC-USD"].dropna().iloc[-1] - 1)), 2)
    # funding now
    f = {}
    try:
        f["Kraken_PF_XBTUSD_ann_%"] = round(100 * [x for x in k["tickers"] if x["symbol"] == "PF_XBTUSD"][0]["fundingRate"] /
                                            [x for x in k["tickers"] if x["symbol"] == "PF_XBTUSD"][0]["markPrice"] * 24 * 365, 2)
    except Exception:  # noqa: BLE001
        pass
    try:
        o = get_json("https://www.okx.com/api/v5/public/funding-rate", {"instId": "BTC-USDT-SWAP"})
        f["OKX_BTC-USDT-SWAP_ann_%"] = round(100 * float(o["data"][0]["fundingRate"]) * 3 * 365, 2)
    except Exception:  # noqa: BLE001
        pass
    try:
        bm = get_json("https://www.bitmex.com/api/v1/instrument", {"symbol": "XBTUSD", "columns": "fundingRate,indicativeFundingRate"})
        f["BitMEX_XBTUSD_ann_%"] = round(100 * float(bm[0]["fundingRate"]) * 3 * 365, 2)
    except Exception:  # noqa: BLE001
        pass
    try:
        r = requests.post("https://api.hyperliquid.xyz/info", json={"type": "metaAndAssetCtxs"}, timeout=30).json()
        names = [u["name"] for u in r[0]["universe"]]
        ctx = r[1][names.index("BTC")]
        f["Hyperliquid_BTC_ann_%"] = round(100 * float(ctx["funding"]) * 24 * 365, 2)
    except Exception:  # noqa: BLE001
        pass
    out["funding_now"] = f
    out["tbill_3m_%"] = float(fred("DTB3").iloc[-1])
    return out


# ---------------- D. halvings ----------------
def halvings() -> list:
    btc = yf_close("BTC-USD", start="2014-01-01")["BTC-USD"].dropna()
    rows = [{"halving": "2012-11-28", "px_at_halving": 12.35, "ret_12m_%": round(100 * (1000 / 12.35 - 1)), "peak_mult_within_18m": "~95x (Dec-2013 ~$1,150)",
             "note": "pre-Yahoo data; approximate public Mt.Gox-era prices"}]
    for h in ["2016-07-09", "2020-05-11", "2024-04-20"]:
        t = pd.Timestamp(h)
        p0 = btc[btc.index >= t].iloc[0]
        w12 = btc[(btc.index >= t) & (btc.index <= t + pd.Timedelta(days=365))]
        w18 = btc[(btc.index >= t) & (btc.index <= t + pd.Timedelta(days=548))]
        p12 = w12.iloc[-1]
        rows.append({"halving": h, "px_at_halving": round(float(p0), 0), "ret_12m_%": round(100 * float(p12 / p0 - 1)),
                     "peak_mult_within_18m": round(float(w18.max() / p0), 2),
                     "max_drawdown_after_cycle_peak_%": round(100 * float((btc[btc.index >= w18.idxmax()].min() / w18.max()) - 1)) if h != "2024-04-20" else None})
    last = btc.iloc[-1]
    peak = btc.loc["2024-04-20":].max()
    rows.append({"current": str(btc.index[-1].date()), "px": round(float(last)), "cycle_peak": round(float(peak)), "peak_date": str(btc.loc["2024-04-20":].idxmax().date()),
                 "drawdown_from_peak_%": round(100 * float(last / peak - 1), 1)})
    return rows


# ---------------- E. stablecoin depegs ----------------
def depegs() -> list:
    cache = SCRATCH / "llama_stablecoinprices.json"
    if not cache.exists() or time.time() - cache.stat().st_mtime > 86400:
        r = requests.get("https://stablecoins.llama.fi/stablecoinprices", headers=UA, timeout=180)
        cache.write_text(r.text)
    data = json.loads(cache.read_text())
    recs = {}
    for row in data:
        dt = pd.Timestamp(row["date"], unit="s")
        for k, v in row["prices"].items():
            recs.setdefault(k, {})[dt] = v
    coins = {
        "usd-coin": "USDC", "tether": "USDT", "dai": "DAI", "first-digital-usd": "FDUSD", "terrausd": "UST", "true-usd": "TUSD",
        "binance-usd": "BUSD", "paypal-usd": "PYUSD", "ethena-usde": "USDe", "frax": "FRAX", "liquity-usd": "LUSD",
        "gemini-dollar": "GUSD", "paxos-standard": "USDP", "usds": "USDS", "stables-labs-usdx": "USDX", "stream-finance-xusd": "xUSD",
        "elixir-deusd": "deUSD", "neutrino": "USDN", "husd": "HUSD", "fei-usd": "FEI", "magic-internet-money": "MIM",
    }
    out = []
    for key, sym in coins.items():
        if key not in recs:
            # try fuzzy
            cand = [k for k in recs if k.startswith(key.split("-")[0])]
            if not cand:
                continue
            key = cand[0]
        raw = pd.Series(recs[key]).sort_index()
        raw = raw[(raw > 0) & (raw < 2) & (raw.index >= "2018-01-01")]
        if raw.empty:
            continue
        # robustness: DefiLlama has isolated one-day glitches -> also report a 3-day rolling median
        s = raw.rolling(3, center=True, min_periods=2).median().dropna()
        below = s[s < 0.99]
        mn = s.min()
        dmin = s.idxmin()
        after = s[s.index > dmin]
        rec = after[after >= 0.995]
        out.append({"coin": sym, "llama_id": key, "raw_daily_min": round(float(raw.min()), 4), "raw_min_date": str(raw.idxmin().date()),
                    "smoothed_min": round(float(mn), 4), "smoothed_min_date": str(dmin.date()),
                    "days_below_0.99_smoothed": int(len(below)),
                    "recovered_to_0.995": bool(len(rec) > 0),
                    "days_min_to_recovery": int((rec.index[0] - dmin).days) if len(rec) else None,
                    "last_price": round(float(raw.iloc[-1]), 4), "last_date": str(raw.index[-1].date())})
    return sorted(out, key=lambda r: r["smoothed_min"])


def yahoo_depegs() -> list:
    """Intraday lows from Yahoo daily bars (captures short depegs DefiLlama's daily closes miss)."""
    import yfinance as yf

    out = []
    for t in ["USDC-USD", "USDT-USD", "DAI-USD", "FDUSD-USD", "TUSD-USD", "BUSD-USD", "PYUSD-USD", "USDE-USD", "USDS-USD"]:
        try:
            h = yf.download(t, start="2018-01-01", auto_adjust=False, progress=False)
            if h.empty:
                continue
            lo = h["Low"].squeeze()
            lo = lo[(lo > 0.3)]  # drop obvious bad ticks
            cl = h["Close"].squeeze()
            d = lo.idxmin()
            nxt = cl[cl.index > d]
            rec = nxt[nxt >= 0.995]
            out.append({"ticker": t, "intraday_low": round(float(lo.min()), 4), "date": str(d.date()),
                        "close_that_day": round(float(cl.loc[d]), 4),
                        "days_to_close_>=0.995": int((rec.index[0] - d).days) if len(rec) else None,
                        "ret_low_to_par_%": round(100 * (1 / float(lo.min()) - 1), 1)})
        except Exception as e:  # noqa: BLE001
            out.append({"ticker": t, "error": str(e)[:80]})
    return out


def main():
    res = {}
    fb = bitmex_funding()
    res["A_bitmex_funding"] = funding_stats(fb)
    try:
        b = deribit_basis()
        b.to_csv(OUT / "deribit_quarterly_basis.csv")
        by = b["basis_ann_%"].groupby(b.index.year).agg(["mean", "median", "min", "max", "count"]).round(2)
        res["B_deribit_quarterly_basis_by_year"] = by.reset_index().rename(columns={"index": "year"}).to_dict(orient="records")
        res["B_basis_quantiles_all"] = {q: round(float(b["basis_ann_%"].quantile(q)), 2) for q in (0.05, 0.25, 0.5, 0.75, 0.95)}
    except Exception as e:  # noqa: BLE001
        res["B_error"] = str(e)
    res["C_snapshot"] = snapshot()
    res["D_halvings"] = halvings()
    res["E_depegs_defillama"] = depegs()
    res["E_depegs_yahoo_intraday"] = yahoo_depegs()
    save_json(res, "crypto_structural.json")
    print(json.dumps(res, indent=1, default=str)[:15000])


if __name__ == "__main__":
    main()
