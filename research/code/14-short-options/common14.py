"""Shared helpers for track 14 (short-horizon options and volatility strategies).

Data sources (all public):
  * CBOE index history CSVs (strategy benchmark indices, VIX family, equity VIX)
  * Yahoo Finance via yfinance (index levels, ETFs)
  * FRED CSV (T-bills)
Raw data is cached under DATA_DIR (session scratchpad).  If a file is already in
track 04's cache it is copied from there instead of being downloaded again.
Set TRACK14_DATA to relocate the cache.  END_DATE pins the last close used.
"""
from __future__ import annotations

import os
import shutil
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from scipy.stats import norm

warnings.filterwarnings("ignore")

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
OUT.mkdir(exist_ok=True)
SCRATCH = Path("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad")
DATA_DIR = Path(os.environ.get("TRACK14_DATA", SCRATCH / "14-short-options" / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
T04_CACHE = SCRATCH / "04-derivatives" / "data"
T02_DATA = HERE.parent / "02-academic" / "data"

END_DATE = os.environ.get("TRACK14_END", "2026-09-25")
IS_END = "2007-12-31"      # design sample ends here; 2008+ is out-of-sample


def _cache(name: str) -> Path:
    p = DATA_DIR / f"{name}.csv"
    if not p.exists() and (T04_CACHE / f"{name}.csv").exists():
        shutil.copy(T04_CACHE / f"{name}.csv", p)
    return p


def _get(url: str, tries: int = 3) -> requests.Response:
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, timeout=60, allow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0 research-script"})
            if r.status_code == 200:
                return r
            last = RuntimeError(f"HTTP {r.status_code} for {url}")
        except Exception as e:  # network flakiness
            last = e
        time.sleep(2 * (i + 1))
    raise last


def cboe(symbol: str, col: str | None = None) -> pd.Series:
    """CBOE daily history CSV -> close series (or `col`)."""
    p = _cache(f"cboe_{symbol}")
    if not p.exists():
        url = f"https://cdn.cboe.com/api/global/us_indices/daily_prices/{symbol}_History.csv"
        p.write_text(_get(url).text)
    df = pd.read_csv(p)
    df.columns = [c.strip().upper() for c in df.columns]
    date_col = df.columns[0]
    df[date_col] = pd.to_datetime(df[date_col], format="mixed")
    df = df.set_index(date_col).sort_index()
    if col is None:
        col = "CLOSE" if "CLOSE" in df.columns else [c for c in df.columns if c != date_col][-1]
    s = pd.to_numeric(df[col], errors="coerce").dropna()
    s = s[s > 0]
    s = s[~s.index.duplicated(keep="last")]
    return s.loc[:END_DATE].rename(symbol)


def dense(s: pd.Series, max_gap_days: int = 40) -> pd.Series:
    """Drop the sparse head of a series (keep data after the last gap > max_gap_days)."""
    gaps = s.index.to_series().diff().dt.days
    big = gaps[gaps > max_gap_days]
    return s.loc[big.index[-1]:] if len(big) else s


def put_index() -> pd.Series:
    """CBOE PUT: the CBOE CSV is daily only from 2007; Yahoo ^PUT is daily from 1996-08 and
    matches CBOE on the 2007-2026 overlap (median ratio 1.000).  Splice at 2007-01-03."""
    c = dense(cboe("PUT"))
    y = yf_close("^PUT").loc[:c.index[0] - pd.Timedelta(days=1)]
    y = y * (c.iloc[0] / yf_close("^PUT").reindex([c.index[0]]).iloc[0])
    return pd.concat([y, c]).rename("PUT")


def cboe_ohlc(symbol: str) -> pd.DataFrame:
    cboe(symbol)
    df = pd.read_csv(_cache(f"cboe_{symbol}"))
    df.columns = [c.strip().upper() for c in df.columns]
    date_col = df.columns[0]
    df[date_col] = pd.to_datetime(df[date_col], format="mixed")
    df = df.set_index(date_col).sort_index()
    df = df[~df.index.duplicated(keep="last")]
    return df.apply(pd.to_numeric, errors="coerce").loc[:END_DATE]


def yf_df(ticker: str, start: str = "1927-01-01") -> pd.DataFrame:
    import yfinance as yf
    safe = ticker.replace("^", "IDX_").replace("=", "_").replace("-", "_")
    p = _cache(f"yf_{safe}")
    if p.exists():
        df = pd.read_csv(p, index_col=0, parse_dates=True)
    else:
        df = None
        for _ in range(3):
            try:
                df = yf.download(ticker, start=start, progress=False, auto_adjust=False, threads=False)
                if len(df):
                    break
            except Exception:
                time.sleep(2)
        if df is None or len(df) == 0:
            raise RuntimeError(f"no data for {ticker}")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.to_csv(p)
    df.index = pd.to_datetime(df.index, utc=True).tz_localize(None).normalize() if df.index.tz is not None \
        else pd.to_datetime(df.index).normalize()
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return df.loc[:END_DATE]


def yf_close(ticker: str, field: str = "Close", start: str = "1927-01-01") -> pd.Series:
    df = yf_df(ticker, start)
    return df[field].astype(float).dropna().rename(ticker)


def fred(series_id: str) -> pd.Series:
    p = _cache(f"fred_{series_id}")
    if not p.exists():
        p.write_text(_get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}").text)
    df = pd.read_csv(p)
    df.columns = ["date", series_id]
    df["date"] = pd.to_datetime(df["date"])
    return pd.to_numeric(df.set_index("date")[series_id], errors="coerce").dropna().loc[:END_DATE]


def tbill_daily() -> pd.Series:
    """Annualised 3m T-bill (decimal), daily, ffilled; pre-1954 not needed here."""
    return (fred("DTB3") / 100.0).rename("rf")


def fomc_dates() -> pd.DatetimeIndex:
    """Scheduled FOMC announcement dates 1994-2026 (scraped by track 02)."""
    d = pd.read_csv(T02_DATA / "fomc_dates.csv", parse_dates=["date"])["date"]
    return pd.DatetimeIndex(sorted(d))


# --------------------------------------------------------------------------
# Black-Scholes (European, continuous dividend yield), vectorised
# --------------------------------------------------------------------------
def bs_price(S, K, T, r, q, sigma, kind="put"):
    S, K, T, r, q, sigma = (np.asarray(x, dtype=float) for x in (S, K, T, r, q, sigma))
    T = np.maximum(T, 1e-8)
    sigma = np.maximum(sigma, 1e-4)
    sq = sigma * np.sqrt(T)
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / sq
    d2 = d1 - sq
    if kind == "call":
        return S * np.exp(-q * T) * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
    return K * np.exp(-r * T) * norm.cdf(-d2) - S * np.exp(-q * T) * norm.cdf(-d1)


def bs_delta(S, K, T, r, q, sigma, kind="put"):
    S, K, T, r, q, sigma = (np.asarray(x, dtype=float) for x in (S, K, T, r, q, sigma))
    T = np.maximum(T, 1e-8)
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    if kind == "call":
        return np.exp(-q * T) * norm.cdf(d1)
    return np.exp(-q * T) * (norm.cdf(d1) - 1.0)


def strike_from_delta(S, T, r, q, sigma, delta, kind="put"):
    """Strike with the given BS delta (put delta negative, pass abs value)."""
    a = abs(delta)
    if kind == "put":  # N(d1) - 1 = -a e^{qT}  =>  d1 = N^-1(1 - a e^{qT})
        d1 = norm.ppf(1 - a * np.exp(q * T))
    else:
        d1 = norm.ppf(a * np.exp(q * T))
    return S * np.exp(-(d1 * sigma * np.sqrt(T)) + (r - q + 0.5 * sigma ** 2) * T)


def bs_iv(price, S, K, T, r, q, kind="put", lo=1e-4, hi=5.0):
    intrinsic = max(0.0, (K * np.exp(-r * T) - S * np.exp(-q * T)) if kind == "put"
                    else (S * np.exp(-q * T) - K * np.exp(-r * T)))
    if not np.isfinite(price) or price <= intrinsic + 1e-10:
        return np.nan
    a, b = lo, hi
    for _ in range(100):
        m = 0.5 * (a + b)
        if bs_price(S, K, T, r, q, m, kind) > price:
            b = m
        else:
            a = m
        if b - a < 1e-7:
            break
    return 0.5 * (a + b)


# --------------------------------------------------------------------------
# Statistics helpers
# --------------------------------------------------------------------------
def cagr(eq: pd.Series) -> float:
    eq = eq.dropna()
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    return float((eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1)


def max_dd(eq: pd.Series) -> float:
    return float((eq / eq.cummax() - 1).min())


def kelly_fraction(R: np.ndarray, fmax: float = 1.0) -> float:
    """Growth-optimal fraction of capital put at risk, where R is return per unit
    of capital at risk (R >= -1).  Grid + refine; returns 0 if mean <= 0."""
    R = np.asarray(R, float)
    R = R[np.isfinite(R)]
    if len(R) == 0 or R.mean() <= 0:
        return 0.0
    grid = np.linspace(0, fmax, 1001)[1:]
    g = np.array([np.mean(np.log1p(np.clip(f * R, -0.999999, None))) for f in grid])
    return float(grid[int(np.argmax(g))])


def log_growth(R: np.ndarray, f: float) -> float:
    R = np.asarray(R, float)
    R = R[np.isfinite(R)]
    return float(np.mean(np.log1p(np.clip(f * R, -0.999999, None))))


def deflated_sharpe(sr_hat: float, n_obs: int, n_trials: int, sr_var_trials: float,
                    skew: float, kurt: float) -> tuple[float, float]:
    """Bailey & Lopez de Prado (2014) deflated Sharpe ratio.
    sr_hat is per-period (not annualised).  Returns (DSR probability, SR0)."""
    emc = 0.5772156649
    n = max(n_trials, 2)
    sr0 = np.sqrt(max(sr_var_trials, 1e-12)) * ((1 - emc) * norm.ppf(1 - 1.0 / n)
                                                + emc * norm.ppf(1 - 1.0 / (n * np.e)))
    denom = np.sqrt(max(1 - skew * sr_hat + (kurt - 1) / 4.0 * sr_hat ** 2, 1e-12))
    z = (sr_hat - sr0) * np.sqrt(n_obs - 1) / denom
    return float(norm.cdf(z)), float(sr0)


def pct(x, nd=1):
    return "n/a" if x is None or not np.isfinite(x) else f"{100 * x:.{nd}f}%"


def save(df: pd.DataFrame, name: str, index: bool = True, fmt: str = "%.4f"):
    p = OUT / f"{name}.csv"
    df.to_csv(p, index=index, float_format=fmt)
    return p
