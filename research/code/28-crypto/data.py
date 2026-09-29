"""Track 28 data layer: download and cache every raw series (idempotent, incremental).

Sources (all public, no keys):
  * Coinbase Exchange candles, api.exchange.coinbase.com: BTC-USD (from 2015-07-20) and ETH-USD (from 2016-05-18),
    daily (UTC days) and hourly. Row format [time, low, high, open, close, volume], as parsed by
    traderec.data.providers.parse_coinbase_candles (which keeps the close only; hourly work needs the open too).
  * Coin Metrics community API, PriceUSD (daily reference rate at 00:00 UTC of the next day): BTC before
    Coinbase's first full day, ETH before Coinbase's first full day. Checked against Coinbase on the overlap.
  * yfinance: SPY (dividend-adjusted OHLC), IBIT, FBTC, ETHA, BITX, BITU, ETHU, SSO; BTC-USD/ETH-USD as a cross-check.
  * Kenneth French data library: daily RF (one-month T-bill), extended past its last date with FRED DTB3.

Cache directory: $TRACK28_CACHE, default <system temp>/track28-cache. Delete it to force a full refresh.
"""
from __future__ import annotations

import io
import json
import os
import tempfile
import time
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import requests

CACHE = Path(os.environ.get("TRACK28_CACHE", Path(tempfile.gettempdir()) / "track28-cache"))
CACHE.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "traderec-research/28 (public data)"}
END = pd.Timestamp(os.environ.get("TRACK28_END", "2026-09-29"))  # data cut-off (exclusive); fixed for reproducibility

CB_URL = "https://api.exchange.coinbase.com/products/{pid}/candles"
CB_START = {"BTC-USD": pd.Timestamp("2015-07-20"), "ETH-USD": pd.Timestamp("2016-05-18")}
CM_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics"
FRENCH_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip"
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def _get(url: str, params: dict | None = None, timeout: int = 60, retries: int = 6):
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout)
            if r.status_code == 429:
                time.sleep(1.0 + i)
                continue
            r.raise_for_status()
            return r
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(0.5 * (i + 1))
    raise RuntimeError(f"GET failed {url} {params}: {last}")


# ----------------------------------------------------------------------------------------------- Coinbase
def _parse_cb(rows) -> pd.DataFrame:
    if not isinstance(rows, list):
        raise ValueError(f"Coinbase payload is not a list: {str(rows)[:120]}")
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"], dtype=float)
    a = np.asarray(rows, dtype=float)
    df = pd.DataFrame({"open": a[:, 3], "high": a[:, 2], "low": a[:, 1], "close": a[:, 4], "volume": a[:, 5]},
                      index=pd.to_datetime(a[:, 0].astype(np.int64), unit="s"))
    return df[~df.index.duplicated(keep="last")].sort_index()


def coinbase_candles(pid: str, granularity: int) -> pd.DataFrame:
    """All candles of `granularity` seconds from the product's start to END (exclusive), cached incrementally."""
    path = CACHE / f"cb_{pid}_{granularity}.csv"
    step = pd.Timedelta(seconds=granularity)
    have = pd.read_csv(path, index_col=0, parse_dates=True) if path.exists() else None
    start = CB_START[pid] if have is None or have.empty else have.index[-1] + step
    stop = END - step  # last candle start we want (it must be complete before END)
    parts = [have] if have is not None else []
    n = 0
    s = start
    while s <= stop:
        e = min(s + step * 299, stop)
        rows = _get(CB_URL.format(pid=pid), {"granularity": granularity,
                                             "start": s.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                             "end": e.strftime("%Y-%m-%dT%H:%M:%SZ")}).json()
        parts.append(_parse_cb(rows))
        s = e + step
        n += 1
        time.sleep(0.12)
    df = pd.concat([p for p in parts if p is not None and not p.empty])
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df[df.index < END]
    if n:
        df.to_csv(path)
        print(f"  coinbase {pid} g={granularity}: {n} requests, {len(df)} candles {df.index[0]} -> {df.index[-1]}")
    return df


# ----------------------------------------------------------------------------------------------- Coin Metrics
def coinmetrics(asset: str) -> pd.Series:
    path = CACHE / f"cm_{asset}.json"
    if not path.exists():
        rows, url, params = [], CM_URL, {"assets": asset, "metrics": "PriceUSD", "frequency": "1d",
                                         "start_time": "2010-07-01", "page_size": 10000}
        while url:
            j = _get(url, params, timeout=120).json()
            rows += j.get("data", [])
            url, params = j.get("next_page_url"), None
        path.write_text(json.dumps(rows))
    rows = json.loads(path.read_text())
    s = pd.Series({pd.Timestamp(r["time"][:10]): float(r["PriceUSD"]) for r in rows if r.get("PriceUSD")})
    return s.sort_index()


# ----------------------------------------------------------------------------------------------- yfinance
def yf_bars(ticker: str) -> pd.DataFrame:
    """Daily OHLC, dividend- and split-adjusted (auto_adjust=True), cached."""
    path = CACHE / f"yf_{ticker.replace('^', 'IDX_')}.csv"
    if not path.exists():
        import yfinance as yf
        df = yf.download(ticker, start="2010-01-01", end=END.strftime("%Y-%m-%d"), auto_adjust=True,
                         progress=False, threads=False)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
        df.columns = ["open", "high", "low", "close", "volume"]
        df.index = pd.DatetimeIndex(df.index).tz_localize(None).normalize()
        df.to_csv(path)
    df = pd.read_csv(path, index_col=0, parse_dates=True)
    return df[df.index < END]


# ----------------------------------------------------------------------------------------------- risk-free
def french_rf() -> pd.Series:
    """Daily risk-free return (decimal per trading day): French RF, then FRED DTB3 after French's last date."""
    path = CACHE / "french_daily.csv"
    if not path.exists():
        z = zipfile.ZipFile(io.BytesIO(_get(FRENCH_URL, timeout=120).content))
        text = z.read(z.namelist()[0]).decode("latin-1")
        rows = []
        for line in text.splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 5 and len(parts[0]) == 8 and parts[0].isdigit():
                rows.append((parts[0], float(parts[4])))
        pd.DataFrame(rows, columns=["date", "rf_pct"]).to_csv(path, index=False)
    fr = pd.read_csv(path, dtype={"date": str})
    rf = pd.Series(fr["rf_pct"].values / 100.0, index=pd.to_datetime(fr["date"], format="%Y%m%d"))
    dpath = CACHE / "fred_DTB3.csv"
    if not dpath.exists():
        try:
            dpath.write_text(_get(FRED_URL, {"id": "DTB3"}, timeout=60, retries=2).text)
        except RuntimeError:  # FRED unreachable: yfinance ^IRX (13-week T-bill yield, %) instead
            irx = yf_bars("^IRX")["close"]
            pd.DataFrame({"date": irx.index.strftime("%Y-%m-%d"), "v": irx.values}).to_csv(dpath, index=False)
    d = pd.read_csv(dpath)
    d.columns = ["date", "v"]
    d = pd.Series(pd.to_numeric(d["v"], errors="coerce").values, index=pd.to_datetime(d["date"])).dropna()
    tail = ((1 + d / 100.0) ** (1 / 252) - 1)
    tail = tail[tail.index > rf.index[-1]]
    return pd.concat([rf, tail]).sort_index()


# ----------------------------------------------------------------------------------------------- panels
def crypto_daily(asset: str) -> tuple[pd.Series, dict]:
    """UTC daily close: Coin Metrics before Coinbase's first full day, Coinbase from then on."""
    pid = f"{asset.upper()}-USD"
    cb = coinbase_candles(pid, 86400)["close"]
    cb = cb[cb.index >= CB_START[pid] + pd.Timedelta(days=1)]
    cm = coinmetrics(asset)
    both = pd.concat([cm, cb], axis=1, keys=["cm", "cb"]).dropna()
    diff = (np.log(both["cb"] / both["cm"])).abs()
    check = {"asset": asset, "overlap_days": int(len(both)), "median_abs_diff_pct": float(diff.median() * 100),
             "p99_abs_diff_pct": float(diff.quantile(0.99) * 100)}
    s = pd.concat([cm[cm.index < cb.index[0]], cb]).sort_index()
    s = s[(s.index < END) & (s > 0)]
    s = s[~s.index.duplicated(keep="last")]
    # fill any missing UTC day (Coinbase outages) with the previous close
    s = s.reindex(pd.date_range(s.index[0], s.index[-1], freq="D")).ffill()
    s.name = asset
    return s, check


def crypto_hourly(asset: str) -> pd.DataFrame:
    return coinbase_candles(f"{asset.upper()}-USD", 3600)[["open", "close"]]


def load_all() -> dict:
    out = {}
    print("loading crypto daily ...")
    out["btc"], cb_btc = crypto_daily("btc")
    out["eth"], cb_eth = crypto_daily("eth")
    out["splice_checks"] = [cb_btc, cb_eth]
    print("loading crypto hourly (first run pages ~600 requests) ...")
    out["btc_h"] = crypto_hourly("btc")
    out["eth_h"] = crypto_hourly("eth")
    print("loading yfinance ...")
    for t in ["SPY", "IBIT", "FBTC", "ETHA", "BITX", "BITU", "BTCL", "ETHU", "ETHT", "SSO", "BTC-USD", "ETH-USD"]:
        out[t] = yf_bars(t)
    print("loading risk-free ...")
    out["rf"] = french_rf()
    return out


if __name__ == "__main__":
    d = load_all()
    for k, v in d.items():
        if isinstance(v, (pd.Series, pd.DataFrame)):
            print(f"{k:8s} {v.index[0]} -> {v.index[-1]} n={len(v)}")
    print(d["splice_checks"])
