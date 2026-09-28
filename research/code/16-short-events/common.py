"""Shared helpers for track 16 (event-driven setups with 1-60 day holds).

* Raw downloads (EDGAR, Yahoo) are cached under SCRATCH (never in the repo).
* Small result tables are written to ./output/ next to this file.

Conventions used by every event study in this track
---------------------------------------------------
* Event day D = the day the information became public (EDGAR filing date, or the
  first trading session after an after-close / evening acceptance time).
* Entry = CLOSE of the first trading day strictly after D ("D+1 close") unless a
  script says otherwise.  This is deliberately conservative for a manual trader
  who receives an email in the evening and executes the next day.
* Holding periods h are counted in trading days after entry.
* Returns use Yahoo total-return (dividend- and split-adjusted) closes.
* Abnormal return = stock return minus benchmark return over the same window.
* Costs: a round-trip cost from the size bucket (see COST_RT) is subtracted from
  every trade.  Short-term capital-gains tax is NOT deducted in the tables; the
  report discusses it separately.
"""
from __future__ import annotations

import gzip
import io
import json
import math
import os
import pickle
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
OUT.mkdir(exist_ok=True)
SCRATCH = Path(os.environ.get(
    "TRACK16_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/16-short-events",
))
SCRATCH.mkdir(parents=True, exist_ok=True)
PX_CACHE = SCRATCH / "prices"
PX_CACHE.mkdir(exist_ok=True)
SEC_CACHE = SCRATCH / "sec"
SEC_CACHE.mkdir(exist_ok=True)

UA = {"User-Agent": "ResearchBot research@example.com"}
_last_sec_call = [0.0]


# ----------------------------------------------------------------------------- SEC helpers
def sec_get(url: str, params: dict | None = None, min_interval: float = 0.125, retries: int = 6,
            timeout: int = 60, as_json: bool = True):
    """Polite GET for *.sec.gov (<= 8 requests/s), with back-off on 403/429/5xx."""
    for i in range(retries):
        wait = min_interval - (time.time() - _last_sec_call[0])
        if wait > 0:
            time.sleep(wait)
        _last_sec_call[0] = time.time()
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout)
        except Exception:  # noqa: BLE001
            time.sleep(2 * (i + 1))
            continue
        if r.status_code == 200:
            return r.json() if as_json else r.content
        if r.status_code == 404:
            return None
        time.sleep(2 * (i + 1) if r.status_code in (403, 429) else 1 + i)
    return None


def sec_cached_json(url: str, cache_name: str, params: dict | None = None, max_age_days: float | None = None):
    f = SEC_CACHE / cache_name
    if f.exists() and (max_age_days is None or time.time() - f.stat().st_mtime < max_age_days * 86400):
        with gzip.open(f, "rt") as fh:
            return json.load(fh)
    d = sec_get(url, params=params)
    if d is not None:
        with gzip.open(f, "wt") as fh:
            json.dump(d, fh)
    return d


EFTS = "https://efts.sec.gov/LATEST/search-index"


def efts_search(q: str, forms: str, start: str, end: str, max_hits: int = 10000, cache_tag: str | None = None) -> pd.DataFrame:
    """EDGAR full-text search, paging 100 hits at a time. forms e.g. 'SC 13D', '8-K', 'SCHEDULE 13D'."""
    tag = cache_tag or re.sub(r"[^A-Za-z0-9]+", "_", f"{q}_{forms}_{start}_{end}")[:150]
    f = SEC_CACHE / f"efts_{tag}.pkl"
    if f.exists():
        return pd.read_pickle(f)
    rows, frm = [], 0
    while True:
        d = sec_get(EFTS, params={"q": q, "forms": forms, "dateRange": "custom", "startdt": start, "enddt": end, "from": frm})
        if not d or "hits" not in d:
            break
        hits = d["hits"]["hits"]
        for h in hits:
            s = h["_source"]
            rows.append({"adsh": s.get("adsh"), "file": h["_id"].split(":", 1)[1] if ":" in h["_id"] else h["_id"],
                         "form": s.get("form"), "file_type": s.get("file_type"), "file_date": s.get("file_date"),
                         "ciks": s.get("ciks") or [], "names": s.get("display_names") or [], "items": s.get("items") or [],
                         "sics": s.get("sics") or []})
        frm += len(hits)
        total = d["hits"]["total"]["value"]
        if not hits or frm >= total or frm >= max_hits:
            break
    df = pd.DataFrame(rows)
    df.to_pickle(f)
    return df


TICK_RE = re.compile(r"\(([A-Z][A-Z0-9.\-]{0,6}(?:,\s*[A-Z][A-Z0-9.\-]{0,6})*)\)\s*\(CIK")


def tickers_from_display(name: str) -> list[str]:
    m = TICK_RE.search(name or "")
    return [t.strip() for t in m.group(1).split(",")] if m else []


def yf_symbol(t: str) -> str:
    """EDGAR/Form-4 style ticker -> Yahoo symbol (BRK.B -> BRK-B)."""
    t = (t or "").strip().upper()
    t = re.sub(r"^(NYSE|NASDAQ|NYSEMKT|AMEX|NYSEARCA|OTC|OTCBB|NASDAQGS|NASDAQGM|NASDAQCM)\s*[:\-]\s*", "", t)
    t = t.replace(".", "-").replace("/", "-").replace(" ", "")
    return t


# ----------------------------------------------------------------------------- prices
def _batch_name(tickers: list[str]) -> str:
    import hashlib
    return hashlib.md5(",".join(sorted(tickers)).encode()).hexdigest()[:16]


PX_COLS = ["Open", "High", "Low", "Close", "Adj Close", "Volume", "Dividends", "Stock Splits"]


def load_prices(tickers, start="2005-01-01", end="2026-09-27", batch=150, verbose=True, download=True) -> dict[str, pd.DataFrame]:
    """Download daily prices for many tickers (Yahoo, auto_adjust=False, actions=True).

    Columns: Open/High/Low/Close are split-adjusted (not dividend-adjusted); 'Adj Close' is
    the total-return series; 'Dividends' and 'Stock Splits' are the corporate actions.
    Returns {ticker: DataFrame}.  One pickle per ticker in PX_CACHE; tickers that Yahoo does
    not know are remembered in _missing.json.
    """
    import yfinance as yf
    import warnings
    warnings.filterwarnings("ignore")
    import logging
    logging.getLogger("yfinance").setLevel(logging.CRITICAL)

    tickers = sorted({t for t in tickers if isinstance(t, str) and t})
    miss_f = PX_CACHE / "_missing.json"
    missing = set(json.loads(miss_f.read_text())) if miss_f.exists() else set()
    out: dict[str, pd.DataFrame] = {}
    todo = []
    for t in tickers:
        f = PX_CACHE / f"{t}.pkl"
        if f.exists():
            out[t] = pd.read_pickle(f)
        elif t not in missing:
            todo.append(t)
    if not download:
        return out
    for i in range(0, len(todo), batch):
        chunk = todo[i:i + batch]
        for attempt in range(3):
            try:
                df = yf.download(chunk, start=start, end=end, auto_adjust=False, actions=True, progress=False,
                                 threads=True, group_by="ticker")
                break
            except Exception as e:  # noqa: BLE001
                if verbose:
                    print("  yf error", type(e).__name__, str(e)[:100], "- retrying", flush=True)
                time.sleep(10 * (attempt + 1))
                df = None
        got = 0
        for t in chunk:
            try:
                d = df[t] if (df is not None and isinstance(df.columns, pd.MultiIndex) and t in df.columns.get_level_values(0)) else None
            except Exception:  # noqa: BLE001
                d = None
            if d is None or "Close" not in d or d["Close"].dropna().empty:
                missing.add(t)
                continue
            d = d[[c for c in PX_COLS if c in d.columns]].dropna(subset=["Close"])
            for c in PX_COLS:
                if c not in d.columns:
                    d[c] = 0.0 if c in ("Dividends", "Stock Splits") else np.nan
            d = d[PX_COLS].astype("float64")
            d.index = pd.to_datetime(d.index).tz_localize(None) if getattr(d.index, "tz", None) else pd.to_datetime(d.index)
            d.to_pickle(PX_CACHE / f"{t}.pkl")
            out[t] = d
            got += 1
        miss_f.write_text(json.dumps(sorted(missing)))
        if verbose:
            print(f"  prices {i + len(chunk)}/{len(todo)} downloaded; got {got}/{len(chunk)}", flush=True)
        time.sleep(1.0)
    return out


def raw_close(d: pd.DataFrame) -> pd.Series:
    """Actual (unadjusted) close: undo the split adjustment Yahoo applies to history."""
    sp = d["Stock Splits"].replace(0, 1.0).fillna(1.0)
    # factor for date t = product of split ratios on dates strictly after t
    fut = sp[::-1].cumprod()[::-1].shift(-1).fillna(1.0)
    return d["Close"] * fut


def tr_index(d: pd.DataFrame) -> pd.Series:
    """Total-return index (Adj Close), falling back to Close."""
    s = d["Adj Close"] if "Adj Close" in d else d["Close"]
    return s.where(s.notna(), d["Close"])


def trading_days(ref: str = "SPY") -> pd.DatetimeIndex:
    px = load_prices([ref], verbose=False)[ref]
    return px.index


def next_td(days: pd.DatetimeIndex, d, k: int = 1):
    """k-th trading day strictly after date d (k>=1); k=0 -> first trading day on/after d."""
    i = days.searchsorted(pd.Timestamp(d), side="right" if k >= 1 else "left")
    j = i + max(k, 1) - 1 if k >= 1 else i
    return days[j] if j < len(days) else pd.NaT


# ----------------------------------------------------------------------------- costs
# Round-trip cost (spread + slippage + fees), fraction of notional, by market-cap bucket.
# Sources: quoted/effective spread studies (e.g. Corwin & Schultz 2012; Abdi & Ranaldo 2017)
# and current retail-broker practice ($0 commissions).  Deliberately conservative for small caps.
COST_RT = {"nano (<$50m)": 0.040, "micro ($50-300m)": 0.020, "small ($0.3-2bn)": 0.008,
           "mid ($2-10bn)": 0.003, "large (>$10bn)": 0.0015, "unknown": 0.020}
CAP_BUCKETS = [(0, 50e6, "nano (<$50m)"), (50e6, 300e6, "micro ($50-300m)"), (300e6, 2e9, "small ($0.3-2bn)"),
               (2e9, 10e9, "mid ($2-10bn)"), (10e9, 1e18, "large (>$10bn)")]


def cap_bucket(mcap: float) -> str:
    if mcap is None or not np.isfinite(mcap) or mcap <= 0:
        return "unknown"
    for lo, hi, name in CAP_BUCKETS:
        if lo <= mcap < hi:
            return name
    return "unknown"


def abdi_ranaldo_spread(h: pd.Series, l: pd.Series, c: pd.Series) -> float:
    """Abdi & Ranaldo (2017) close-high-low effective spread estimator (fraction), 2-day version."""
    lh, ll, lc = np.log(h), np.log(l), np.log(c)
    eta = (lh + ll) / 2
    s2 = 4 * (lc - eta) * (lc - eta.shift(-1))
    s2 = s2.dropna()
    s2 = s2.clip(lower=0)
    return float(np.sqrt(s2.mean())) if len(s2) else np.nan


# ----------------------------------------------------------------------------- statistics
def trade_stats(r: pd.Series, hold_days: float | None = None, per_year: float | None = None) -> dict:
    """Per-trade distribution statistics for a series of (net) returns."""
    r = pd.Series(r).dropna().astype(float)
    n = len(r)
    if n == 0:
        return {"n": 0}
    wins, losses = r[r > 0], r[r <= 0]
    sd = r.std(ddof=1) if n > 1 else np.nan
    t = r.mean() / (sd / math.sqrt(n)) if n > 1 and sd > 0 else np.nan
    return {
        "n": n,
        "per_yr": None if per_year is None else round(per_year, 1),
        "mean_%": round(100 * r.mean(), 2),
        "median_%": round(100 * r.median(), 2),
        "t": round(t, 2) if np.isfinite(t) else None,
        "win_%": round(100 * (r > 0).mean(), 1),
        "avg_win_%": round(100 * wins.mean(), 2) if len(wins) else None,
        "avg_loss_%": round(100 * losses.mean(), 2) if len(losses) else None,
        "sd_%": round(100 * sd, 2) if np.isfinite(sd) else None,
        "p5_%": round(100 * r.quantile(0.05), 1),
        "p95_%": round(100 * r.quantile(0.95), 1),
        "max_loss_%": round(100 * r.min(), 1),
        "hold_days": hold_days,
    }


def clustered_t(r: pd.Series, dates: pd.Series, freq: str = "M") -> float:
    """t-stat of the mean with returns averaged within calendar periods first (guards against
    cross-sectional correlation of overlapping events)."""
    df = pd.DataFrame({"r": pd.Series(r).values, "d": pd.to_datetime(pd.Series(dates).values)}).dropna()
    if df.empty:
        return np.nan
    g = df.groupby(df["d"].dt.to_period(freq))["r"].mean()
    if len(g) < 3 or g.std(ddof=1) == 0:
        return np.nan
    return float(g.mean() / (g.std(ddof=1) / math.sqrt(len(g))))


def kelly_growth(r: pd.Series, kappa: float = 0.5, k: float = 0.25, cap: float = 1.0, rf_per_trade: float = 0.0) -> dict:
    """Quarter-Kelly sizing on an empirical, *shrunk* per-trade return distribution.

    Shrinkage: every outcome is shifted down by (1-kappa) * mean excess return, so the
    distribution keeps its shape but only kappa of the measured edge is assumed real.
    Returns full-Kelly fraction f*, the fraction used f = min(k * f*, cap), and the expected
    log-growth per trade at f (versus holding cash at rf).
    """
    x = pd.Series(r).dropna().astype(float).values - rf_per_trade
    if len(x) < 5:
        return {"f_full": np.nan, "f_used": np.nan, "g_per_trade": np.nan}
    xs = x - (1 - kappa) * x.mean()
    if xs.mean() <= 0:
        return {"f_full": 0.0, "f_used": 0.0, "g_per_trade": 0.0, "shrunk_mean": float(xs.mean())}
    grid = np.linspace(0, 5, 2001)
    lo = xs.min()
    fmax = min(5.0, 0.999 / -lo) if lo < 0 else 5.0
    grid = grid[grid <= fmax]
    g = np.array([np.mean(np.log1p(f * xs)) for f in grid])
    f_full = float(grid[int(np.argmax(g))])
    f_used = min(k * f_full, cap)
    g_used = float(np.mean(np.log1p(f_used * xs)))
    return {"f_full": f_full, "f_used": f_used, "g_per_trade": g_used, "shrunk_mean": float(xs.mean())}


def deflated_sharpe_prob(sr_obs: float, n_obs: int, n_trials: int, skew: float = 0.0, kurt: float = 3.0,
                         sr_var_trials: float | None = None) -> float:
    """Bailey & Lopez de Prado (2014) deflated Sharpe ratio: P(true SR > 0 | best of n_trials).
    sr_obs is the per-observation Sharpe (mean/sd of per-period returns)."""
    from scipy.stats import norm
    if n_obs < 3:
        return np.nan
    emc = 0.5772156649
    v = sr_var_trials if sr_var_trials is not None else 1.0 / n_obs
    sr0 = math.sqrt(v) * ((1 - emc) * norm.ppf(1 - 1.0 / n_trials) + emc * norm.ppf(1 - 1.0 / (n_trials * math.e))) if n_trials > 1 else 0.0
    denom = math.sqrt(max(1e-12, 1 - skew * sr_obs + (kurt - 1) / 4 * sr_obs ** 2))
    return float(norm.cdf((sr_obs - sr0) * math.sqrt(n_obs - 1) / denom))


def save_json(obj, name: str):
    p = OUT / name
    p.write_text(json.dumps(obj, indent=2, default=str))
    return p


def save_csv(df: pd.DataFrame, name: str):
    p = OUT / name
    df.to_csv(p, index=False)
    return p
