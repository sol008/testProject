"""Shared helpers for track 15 (futures-like markets and crypto, 1-60 day holds).

Everything downloaded is cached under SCRATCH so the analysis re-runs offline.
Small result tables go to ./results/.

Data sources (all public, no keys):
  * Yahoo Finance via yfinance: ETFs, indices, BTC-USD/ETH-USD, managed-futures funds
  * FRED CSV endpoint: Treasury yields, T-bill, FX spot, OECD 3-month rates
  * EIA: NYMEX energy futures, contracts 1-4, daily (term structure, roll-clean returns)
  * Coin Metrics community API: BTC/ETH daily reference rate (long history)
  * Binance public archive (data.binance.vision): spot daily klines (alts), USD-M funding
  * BitMEX / Deribit / Kraken Futures public APIs: perpetual funding history
"""
from __future__ import annotations

import io
import json
import math
import os
import time
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
RES = HERE / "results"
RES.mkdir(exist_ok=True)
SCRATCH = Path(os.environ.get(
    "TRACK15_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/15-short-futures-crypto",
))
CACHE = SCRATCH / "cache"
CACHE.mkdir(parents=True, exist_ok=True)
ASOF = pd.Timestamp("2026-09-28")
UA = {"User-Agent": "ResearchBot research@example.com"}


# ----------------------------------------------------------------------------- HTTP
def http_get(url: str, params: dict | None = None, timeout: int = 60, retries: int = 4, sleep: float = 0.1):
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout)
            if r.status_code == 429:
                time.sleep(2 ** (i + 1))
                continue
            if r.status_code == 404:
                return None
            r.raise_for_status()
            time.sleep(sleep)
            return r
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"GET failed {url}: {last}")


# ----------------------------------------------------------------------------- Yahoo
def yf_ohlc(ticker: str, start: str = "1950-01-01", refresh: bool = False, adjusted: bool = True) -> pd.DataFrame:
    """Daily OHLCV (dividend/split adjusted if adjusted=True), cached per ticker."""
    tag = "adj" if adjusted else "raw"
    fn = CACHE / f"yf_{tag}_{ticker.replace('^', 'IDX_').replace('=', '_').replace('/', '_')}.csv"
    if fn.exists() and not refresh:
        return pd.read_csv(fn, index_col=0, parse_dates=True)
    import yfinance as yf
    df = yf.download(ticker, start=start, end="2026-09-29", progress=False, auto_adjust=adjusted, threads=False)
    if df is None or len(df) == 0:
        raise RuntimeError(f"no Yahoo data for {ticker}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df.to_csv(fn)
    return df


def yf_close(tickers, start: str = "1950-01-01", adjusted: bool = True) -> pd.DataFrame:
    if isinstance(tickers, str):
        tickers = [tickers]
    out = {}
    for t in tickers:
        try:
            s = yf_ohlc(t, start=start, adjusted=adjusted)["Close"].astype(float)
            out[t] = s[s > 0]
        except Exception as e:  # noqa: BLE001
            print("yahoo fail", t, e)
    return pd.DataFrame(out)


# ----------------------------------------------------------------------------- FRED
def fred(series_id: str, refresh: bool = False) -> pd.Series:
    fn = CACHE / f"fred_{series_id}.csv"
    if not fn.exists() or refresh:
        try:
            r = http_get("https://fred.stlouisfed.org/graph/fredgraph.csv", {"id": series_id}, retries=6)
            if r is None:
                raise RuntimeError(f"FRED missing {series_id}")
            fn.write_bytes(r.content)
        except Exception:
            # fall back to an identical same-day FRED download cached by an earlier track
            for d in ("06-backtests/cache", "05-special-situations", "08-current"):
                alt = SCRATCH.parent / d / f"fred_{series_id}.csv"
                if alt.exists():
                    fn.write_bytes(alt.read_bytes())
                    break
            else:
                raise
    df = pd.read_csv(fn)
    s = pd.to_numeric(df.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(df.iloc[:, 0])
    s.name = series_id
    return s.dropna()


def rf_daily() -> pd.Series:
    """Annualised 3-month T-bill yield (decimal), daily, from FRED DTB3 (1954+), forward-filled."""
    s = fred("DTB3") / 100.0
    return s


def rf_on(index: pd.DatetimeIndex, per: str = "trading") -> pd.Series:
    """Per-period risk-free return aligned to an index (trading: /252, calendar: /365)."""
    y = rf_daily()
    y = y.reindex(y.index.union(index)).ffill().reindex(index).fillna(0.0)
    return y / (252.0 if per == "trading" else 365.0)


# ----------------------------------------------------------------------------- EIA energy futures
EIA_SERIES = {
    # NYMEX futures, contracts 1..4 (EIA "Contract n" = n-th nearest delivery month), daily
    "CL": ("pet", ["RCLC1", "RCLC2", "RCLC3", "RCLC4"]),
    "NG": ("ng", ["RNGC1", "RNGC2", "RNGC3", "RNGC4"]),
    "HO": ("pet", ["EER_EPD2F_PE1_Y35NY_DPG", "EER_EPD2F_PE2_Y35NY_DPG", "EER_EPD2F_PE3_Y35NY_DPG", "EER_EPD2F_PE4_Y35NY_DPG"]),
    "RB": ("pet", ["EER_EPMRR_PE1_Y35NY_DPG", "EER_EPMRR_PE2_Y35NY_DPG", "EER_EPMRR_PE3_Y35NY_DPG", "EER_EPMRR_PE4_Y35NY_DPG"]),
}


def eia_series(code: str, kind: str = "pet") -> pd.Series:
    fn = CACHE / f"eia_{code}.xls"
    if not fn.exists():
        r = http_get(f"https://www.eia.gov/dnav/{kind}/hist_xls/{code}d.xls", timeout=120)
        if r is None:
            raise RuntimeError(f"EIA missing {code}")
        fn.write_bytes(r.content)
    x = pd.read_excel(fn, sheet_name="Data 1", header=2)
    x = x.iloc[:, :2].dropna()
    s = pd.to_numeric(x.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(x.iloc[:, 0])
    s = s.dropna()
    s = s[~s.index.duplicated(keep="last")].sort_index()
    s.name = code
    return s


def eia_curve(sym: str) -> pd.DataFrame:
    kind, codes = EIA_SERIES[sym]
    df = pd.concat([eia_series(c, kind) for c in codes], axis=1)
    df.columns = ["C1", "C2", "C3", "C4"]
    return df


# ----------------------------------------------------------------------------- crypto
def coinmetrics_price(asset: str = "btc") -> pd.Series:
    fn = CACHE / f"cm_{asset}.json"
    if not fn.exists():
        url = ("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets="
               f"{asset}&metrics=PriceUSD&frequency=1d&page_size=10000&start_time=2009-01-01")
        rows = []
        while url:
            j = http_get(url, timeout=120).json()
            rows += j.get("data", [])
            url = j.get("next_page_url")
        fn.write_text(json.dumps({"data": rows}))
    j = json.loads(fn.read_text())
    s = pd.Series({pd.Timestamp(r["time"][:10]): float(r["PriceUSD"]) for r in j["data"] if r.get("PriceUSD")}).sort_index()
    s.name = asset.upper()
    return s[s > 0]


def crypto_daily(asset: str = "btc") -> pd.Series:
    """Coin Metrics daily reference rate (00:00 UTC stamped) spliced with Yahoo close for recent days."""
    s = coinmetrics_price(asset)
    try:
        y = yf_close(f"{asset.upper()}-USD")[f"{asset.upper()}-USD"].dropna()
        newer = y[y.index > s.index[-1]]
        s = pd.concat([s, newer])
    except Exception:  # noqa: BLE001
        pass
    s = s[~s.index.duplicated(keep="first")].sort_index()
    return s[s.index <= ASOF]


def binance_list_symbols(prefix: str = "data/spot/monthly/klines/") -> list[str]:
    fn = CACHE / f"binance_list_{prefix.replace('/', '_')}.json"
    if fn.exists():
        return json.loads(fn.read_text())
    syms, marker = [], ""
    while True:
        params = {"delimiter": "/", "prefix": prefix}
        if marker:
            params["marker"] = marker
        r = http_get("https://s3-ap-northeast-1.amazonaws.com/data.binance.vision", params, timeout=60)
        txt = r.text
        import re
        found = re.findall(r"<Prefix>" + re.escape(prefix) + r"([^/<]+)/</Prefix>", txt)
        syms += found
        trunc = "<IsTruncated>true</IsTruncated>" in txt
        if not trunc or not found:
            break
        m = re.findall(r"<NextMarker>([^<]+)</NextMarker>", txt)
        marker = m[0] if m else prefix + found[-1] + "/"
    syms = sorted(set(syms))
    fn.write_text(json.dumps(syms))
    return syms


def binance_klines(symbol: str, start="2017-08", end="2026-09", interval="1d") -> pd.DataFrame:
    """Daily klines from monthly archive zips (open time UTC). Missing months are skipped."""
    fn = CACHE / f"bn_{symbol}_{interval}.csv"
    if fn.exists():
        return pd.read_csv(fn, index_col=0, parse_dates=True)
    frames = []
    for per in pd.period_range(start, end, freq="M"):
        url = f"https://data.binance.vision/data/spot/monthly/klines/{symbol}/{interval}/{symbol}-{interval}-{per.strftime('%Y-%m')}.zip"
        r = http_get(url, timeout=60, sleep=0.02)
        if r is None:
            continue
        z = zipfile.ZipFile(io.BytesIO(r.content))
        df = pd.read_csv(z.open(z.namelist()[0]), header=None)
        frames.append(df)
    if not frames:
        pd.DataFrame().to_csv(fn)
        return pd.DataFrame()
    df = pd.concat(frames)
    df = df.iloc[:, :11]
    df.columns = ["open_time", "open", "high", "low", "close", "volume", "close_time", "quote_volume", "trades", "tb_base", "tb_quote"]
    ot = df["open_time"].astype("int64")
    # Binance switched spot archive timestamps to microseconds in 2025
    ot = np.where(ot > 10**14, ot // 1000, ot)
    df.index = pd.to_datetime(ot, unit="ms")
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df[["open", "high", "low", "close", "volume", "quote_volume", "trades"]].astype(float)
    df.to_csv(fn)
    return df


def binance_funding(symbol: str = "BTCUSDT", start="2019-09", end="2026-08") -> pd.Series:
    fn = CACHE / f"bnf_{symbol}.csv"
    if fn.exists():
        s = pd.read_csv(fn, index_col=0, parse_dates=True).iloc[:, 0]
        return s
    frames = []
    for per in pd.period_range(start, end, freq="M"):
        url = f"https://data.binance.vision/data/futures/um/monthly/fundingRate/{symbol}/{symbol}-fundingRate-{per.strftime('%Y-%m')}.zip"
        r = http_get(url, timeout=60, sleep=0.02)
        if r is None:
            continue
        z = zipfile.ZipFile(io.BytesIO(r.content))
        df = pd.read_csv(z.open(z.namelist()[0]))
        frames.append(df)
    df = pd.concat(frames)
    tcol = [c for c in df.columns if "time" in c.lower()][0]
    rcol = [c for c in df.columns if "rate" in c.lower()][0]
    t = df[tcol].astype("int64")
    t = np.where(t > 10**14, t // 1000, t)
    s = pd.Series(df[rcol].astype(float).values, index=pd.to_datetime(t, unit="ms")).sort_index()
    s = s[~s.index.duplicated()]
    s.to_csv(fn)
    return s


def bitmex_funding() -> pd.Series:
    fn = CACHE / "bitmex_funding_xbtusd.csv"
    t05 = SCRATCH.parent / "05-special-situations" / "bitmex_funding_xbtusd.csv"
    if not fn.exists() and t05.exists():
        fn.write_bytes(t05.read_bytes())
    if not fn.exists():
        rows, start = [], 0
        while True:
            d = http_get("https://www.bitmex.com/api/v1/funding",
                         {"symbol": "XBTUSD", "count": 500, "start": start, "reverse": "false"}, sleep=1.2).json()
            if not d:
                break
            rows.extend(d)
            start += len(d)
            if len(d) < 500:
                break
        pd.DataFrame(rows)[["timestamp", "fundingRate"]].to_csv(fn, index=False)
    df = pd.read_csv(fn)
    idx = pd.DatetimeIndex(pd.to_datetime(df["timestamp"], utc=True)).tz_localize(None)
    s = pd.Series(df["fundingRate"].astype(float).values, index=idx)
    return s.sort_index()


# ----------------------------------------------------------------------------- statistics
def ann_factor(index: pd.DatetimeIndex) -> float:
    """Observations per year inferred from the index (252 for trading days, 365 for crypto)."""
    if len(index) < 3:
        return 252.0
    yrs = (index[-1] - index[0]).days / 365.25
    return len(index) / yrs if yrs > 0 else 252.0


def perf(r: pd.Series, rf: pd.Series | None = None, af: float | None = None) -> dict:
    """Stats of a periodic *excess* return series r (already net of rf if rf is None)."""
    r = r.dropna()
    if len(r) < 10:
        return {}
    af = af or ann_factor(r.index)
    ex = r - (rf.reindex(r.index).fillna(0) if rf is not None else 0.0)
    mu, sd = ex.mean() * af, ex.std() * math.sqrt(af)
    eq = (1 + r).cumprod()
    dd = (eq / eq.cummax() - 1).min()
    yrs = (r.index[-1] - r.index[0]).days / 365.25
    cagr = eq.iloc[-1] ** (1 / yrs) - 1 if yrs > 0 else np.nan
    return {"start": str(r.index[0].date()), "end": str(r.index[-1].date()), "years": round(yrs, 1),
            "ann_ret_%": round(100 * mu, 2), "vol_%": round(100 * sd, 2),
            "sharpe": round(mu / sd, 2) if sd > 0 else np.nan, "cagr_%": round(100 * cagr, 2),
            "maxDD_%": round(100 * dd, 1),
            "t_stat": round(mu / sd * math.sqrt(yrs), 2) if sd > 0 else np.nan,
            "skew": round(float(ex.skew()), 2), "exkurt": round(float(ex.kurt()), 2)}


def trade_stats(tr: pd.Series, years: float | None = None) -> dict:
    """Per-trade statistics for a series of net trade returns (decimal)."""
    tr = pd.Series(tr).dropna()
    n = len(tr)
    if n == 0:
        return {"n": 0}
    w, l = tr[tr > 0], tr[tr <= 0]
    out = {"n": n, "per_yr": round(n / years, 1) if years else np.nan,
           "win_%": round(100 * len(w) / n, 1),
           "avg_win_%": round(100 * w.mean(), 2) if len(w) else 0.0,
           "avg_loss_%": round(100 * l.mean(), 2) if len(l) else 0.0,
           "mean_%": round(100 * tr.mean(), 2), "median_%": round(100 * tr.median(), 2),
           "worst_%": round(100 * tr.min(), 1), "best_%": round(100 * tr.max(), 1),
           "t_mean": round(tr.mean() / tr.std() * math.sqrt(n), 2) if n > 2 and tr.std() > 0 else np.nan}
    return out


def kelly_from_trades(tr: pd.Series, per_yr: float, frac: float = 0.25, shrink: float = 0.5) -> dict:
    """Quarter-Kelly stake per trade from per-trade returns, after shrinking the mean edge by `shrink`
    (0.5 = assume half the backtest edge survives). Exact Kelly by numeric maximisation of E ln(1+f R)
    on the empirical distribution with the shrunk mean. Returns stake (fraction of capital) and
    expected log-growth contribution per year at that stake."""
    tr = pd.Series(tr).dropna().values
    if len(tr) < 5:
        return {}
    m = tr.mean()
    adj = tr - m + shrink * m                 # shift distribution so the mean is shrunk
    if adj.mean() <= 0:
        return {"kelly_full": 0.0, "stake_qK": 0.0, "g_per_yr_%": 0.0, "shrunk_mean_%": round(100 * adj.mean(), 3)}
    fs = np.linspace(0, 20, 4001)
    lo = adj.min()
    fmax = 0.999 / -lo if lo < 0 else 20
    fs = fs[fs < fmax]
    g = np.array([np.mean(np.log1p(f * adj)) for f in fs])
    fstar = fs[g.argmax()]
    fq = frac * fstar
    gq = np.mean(np.log1p(fq * adj))
    return {"kelly_full": round(float(fstar), 2), "stake_qK": round(float(fq), 3),
            "g_per_yr_%": round(100 * float(gq) * per_yr, 2), "shrunk_mean_%": round(100 * adj.mean(), 3)}


def kelly_continuous(mu: float, sigma: float, frac: float = 0.25, shrink: float = 0.5) -> dict:
    """Continuous-time Kelly for an excess-return stream: f* = mu/sigma^2 on the shrunk mean;
    growth at c*Kelly = SR^2 (c - c^2/2) with SR the shrunk Sharpe."""
    mu_s = shrink * mu
    if mu_s <= 0 or sigma <= 0:
        return {"lev_full": 0.0, "lev_qK": 0.0, "g_per_yr_%": 0.0}
    f = mu_s / sigma ** 2
    sr = mu_s / sigma
    return {"lev_full": round(f, 2), "lev_qK": round(frac * f, 2),
            "g_per_yr_%": round(100 * sr ** 2 * (frac - frac ** 2 / 2), 2), "shrunk_SR": round(sr, 2)}


def deflated_sharpe(sr_ann: float, n_trials: int, sr_var_ann: float, years: float,
                    skew: float = 0.0, exkurt: float = 0.0, periods_per_year: float = 252.0) -> dict:
    """Bailey & Lopez de Prado (2014) deflated Sharpe ratio.
    sr_ann: best annualised Sharpe; sr_var_ann: variance of annualised SRs across trials."""
    from scipy.stats import norm
    T = years * periods_per_year
    sr = sr_ann / math.sqrt(periods_per_year)
    v = sr_var_ann / periods_per_year
    emc = 0.5772156649
    if n_trials > 1:
        sr0 = math.sqrt(max(v, 1e-12)) * ((1 - emc) * norm.ppf(1 - 1 / n_trials) + emc * norm.ppf(1 - 1 / (n_trials * math.e)))
    else:
        sr0 = 0.0
    kurt = exkurt + 3
    denom = math.sqrt(max(1e-12, 1 - skew * sr + (kurt - 1) / 4 * sr ** 2))
    z = (sr - sr0) * math.sqrt(T - 1) / denom
    return {"SR0_ann": round(sr0 * math.sqrt(periods_per_year), 2), "DSR_prob": round(float(norm.cdf(z)), 3)}


def bonferroni_t(n_trials: int, alpha: float = 0.05) -> float:
    from scipy.stats import norm
    return float(norm.ppf(1 - alpha / (2 * n_trials)))


def by_period(r: pd.Series, bins: list[tuple[str, str, str]], af: float | None = None) -> pd.DataFrame:
    rows = []
    for name, a, b in bins:
        x = r.loc[a:b]
        if len(x) > 20:
            p = perf(x, af=af)
            p["period"] = name
            rows.append(p)
    return pd.DataFrame(rows).set_index("period") if rows else pd.DataFrame()


DECADES = [("1970s", "1970", "1979"), ("1980s", "1980", "1989"), ("1990s", "1990", "1999"),
           ("2000s", "2000", "2009"), ("2010s", "2010", "2019"), ("2020s", "2020", "2026")]


def save(df, name: str):
    p = RES / name
    if isinstance(df, (dict, list)):
        p.write_text(json.dumps(df, indent=1, default=str))
    else:
        df.to_csv(p)
    return p


def md(df: pd.DataFrame, floatfmt: str = ".2f") -> str:
    """Minimal markdown table without tabulate dependency."""
    d = df.copy()
    cols = [str(c) for c in d.columns]
    idx_name = d.index.name or ""
    lines = ["| " + " | ".join([idx_name] + cols) + " |", "|" + "---|" * (len(cols) + 1)]
    for i, row in d.iterrows():
        vals = []
        for v in row.values:
            if isinstance(v, float):
                vals.append("" if np.isnan(v) else format(v, floatfmt))
            else:
                vals.append(str(v))
        lines.append("| " + " | ".join([str(i)] + vals) + " |")
    return "\n".join(lines)
