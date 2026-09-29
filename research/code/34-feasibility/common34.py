"""Shared data and helpers for research track 34 (is 100% a year feasible?).

Data sources (cached in the session scratchpad, never committed):
  * Kenneth French Data Library: daily 1-month T-bill (research/code/03-math/data, through
    Aug 2026) and the daily "10 Portfolios Formed on Prior (12-2) Return" file (downloaded).
  * Yahoo Finance via yfinance: ^NDX (price index, 1985-), TQQQ (validation), ^VXN (2001-).
  * Coin Metrics community API: BTC PriceUSD, daily from 18 Jul 2010 (reuses the track-15 cache
    when present).
Conventions: simple returns; wealth starts at 1; a path that loses 100% stays at 0.
"""
from __future__ import annotations

import io
import json
import os
import urllib.request
import zipfile

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
os.makedirs(RESULTS, exist_ok=True)
REPO_RESEARCH = os.path.abspath(os.path.join(HERE, "..", ".."))
FF_DAILY = os.path.join(REPO_RESEARCH, "code", "03-math", "data", "F-F_Research_Data_Factors_daily.csv")

SCRATCH = os.environ.get(
    "TRACK34_CACHE",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/34-feasibility/cache")
os.makedirs(SCRATCH, exist_ok=True)
OTHER_BTC_CACHES = [
    os.path.join(os.path.dirname(os.path.dirname(SCRATCH)), "15-short-futures-crypto", "cache", "cm_btc.json"),
    os.path.join(os.path.dirname(os.path.dirname(SCRATCH)), "06-backtests", "cm_btc.json"),
]

SEED = 20260929
END = "2026-09-28"


# ----------------------------------------------------------------------------- data
def rf_daily() -> pd.Series:
    """Fama-French 1-month T-bill, daily simple return (decimal), 1926-07 .. 2026-08."""
    raw = pd.read_csv(FF_DAILY, skiprows=4, index_col=0)
    raw = raw[pd.to_numeric(raw.index, errors="coerce").notna()]
    raw.index = pd.to_datetime(raw.index.astype(str).str.strip(), format="%Y%m%d")
    raw = raw.apply(pd.to_numeric, errors="coerce").dropna() / 100.0
    return raw["RF"]


def rf_annual_on(index: pd.DatetimeIndex) -> pd.Series:
    """Annualised T-bill yield (decimal) on each date; forward-filled past Aug 2026."""
    rf = rf_daily()
    ann = (1 + rf) ** 252 - 1
    ann = ann.reindex(ann.index.union(index)).ffill().bfill()
    return ann.reindex(index)


def yahoo_close(ticker: str, start="1985-01-01") -> pd.Series:
    path = os.path.join(SCRATCH, f"yf_{ticker.replace('^', '')}.csv")
    if not os.path.exists(path):
        import yfinance as yf
        d = yf.download(ticker, start=start, end="2026-09-29", progress=False, auto_adjust=False)
        if isinstance(d.columns, pd.MultiIndex):
            d.columns = d.columns.get_level_values(0)
        d[["Close", "Adj Close"]].to_csv(path)
    d = pd.read_csv(path, index_col=0, parse_dates=True)
    col = "Adj Close" if ticker in ("TQQQ", "QQQ") else "Close"
    return d[col].dropna().loc[:END]


def btc_daily() -> pd.Series:
    """BTC PriceUSD (Coin Metrics), calendar days."""
    path = os.path.join(SCRATCH, "cm_btc.json")
    if not os.path.exists(path):
        for p in OTHER_BTC_CACHES:
            if os.path.exists(p):
                path = p
                break
        else:
            url = ("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc"
                   "&metrics=PriceUSD&frequency=1d&start_time=2010-07-01&page_size=10000")
            with urllib.request.urlopen(url, timeout=60) as fh:
                data = json.load(fh)
            with open(path, "w") as fh:
                json.dump(data, fh)
    d = json.load(open(path))["data"]
    s = pd.Series({pd.Timestamp(x["time"][:10]): float(x["PriceUSD"]) for x in d}).sort_index()
    return s.asfreq("D").ffill().loc[:END]


def french_momentum_daily() -> pd.DataFrame:
    """Daily value-weighted returns of the 10 prior-(12-2) momentum deciles (decimal)."""
    path = os.path.join(SCRATCH, "10_Portfolios_Prior_12_2_Daily.csv")
    if not os.path.exists(path):
        url = ("https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
               "10_Portfolios_Prior_12_2_Daily_CSV.zip")
        with urllib.request.urlopen(url, timeout=120) as fh:
            z = zipfile.ZipFile(io.BytesIO(fh.read()))
        name = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
        with open(path, "wb") as out:
            out.write(z.read(name))
    lines = open(path, encoding="latin-1").read().splitlines()
    start = next(i for i, l in enumerate(lines) if "Value Weighted" in l) + 1
    rows = []
    for l in lines[start + 1:]:
        parts = [p.strip() for p in l.split(",")]
        if len(parts) < 11 or not parts[0].isdigit():
            break
        rows.append(parts)
    df = pd.DataFrame(rows).set_index(0)
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.astype(float) / 100.0
    df.columns = [f"D{i}" for i in range(1, 11)]
    return df


# ----------------------------------------------------------------------------- bootstrap
def stationary_bootstrap_idx(n_obs, n_paths, t_len, mean_block, rng):
    """Politis-Romano stationary bootstrap indices (circular)."""
    new = rng.random((n_paths, t_len)) < 1.0 / mean_block
    new[:, 0] = True
    starts = rng.integers(0, n_obs, size=(n_paths, t_len), dtype=np.int64)
    tt = np.arange(t_len)
    last_t = np.maximum.accumulate(np.where(new, tt, 0), axis=1)
    start_at = np.take_along_axis(starts, last_t, axis=1)
    return (start_at + (tt - last_t)) % n_obs


def path_stats(r: np.ndarray, per_year: int, years=(1, 3, 5, 10)) -> dict:
    """Statistics over simulated return paths r (n_paths x T, simple returns per period)."""
    r = np.maximum(r, -1.0)
    with np.errstate(divide="ignore"):
        lw = np.cumsum(np.log1p(r), axis=1)
    n, T = r.shape
    out = {}
    # every non-overlapping 12-month return along the path
    ny = T // per_year
    ends = lw[:, per_year - 1::per_year][:, :ny]
    starts = np.concatenate([np.zeros((n, 1)), ends[:, :-1]], axis=1)
    yr = np.exp(ends - starts) - 1
    out["P(year >= +100%)"] = float(np.mean(yr >= 1.0))
    out["P(year >= +1000%)"] = float(np.mean(yr >= 10.0))
    out["P(year <= -50%)"] = float(np.mean(yr <= -0.5))
    for y in years:
        k = y * per_year - 1
        if k < T:
            w = np.exp(lw[:, k])
            out[f"P(CAGR>=100% over {y}y)"] = float(np.mean(w >= 2.0 ** y))
    k10 = min(T, 10 * per_year) - 1
    w10 = np.exp(lw[:, k10])
    out["median 10y multiple"] = float(np.median(w10))
    out["median 10y CAGR"] = float(np.median(w10) ** (1 / 10) - 1)
    out["P(10y multiple < 1)"] = float(np.mean(w10 < 1))
    out["P(reach 10x within 10y)"] = float(np.mean(np.max(lw[:, :k10 + 1], axis=1) >= np.log(10)))
    peak = np.maximum.accumulate(np.maximum(lw[:, :k10 + 1], 0.0), axis=1)
    dd = 1 - np.exp(lw[:, :k10 + 1] - peak)
    mdd = dd.max(axis=1)
    for lvl in (0.5, 0.8, 0.95):
        out[f"P(drawdown >= {int(lvl * 100)}% within 10y)"] = float(np.mean(mdd >= lvl))
    mn = np.exp(np.min(lw[:, :k10 + 1], axis=1))
    for lvl in (0.5, 0.2, 0.05):
        out[f"P(ever <= {int(lvl * 100)}% of start within 10y)"] = float(np.mean(mn <= lvl))
    out["median max drawdown 10y"] = float(np.median(mdd))
    return out


def hist_stats(r: pd.Series, rf: pd.Series, per_year: int) -> dict:
    """Realised statistics of one historical return series."""
    r = r.dropna()
    rf = rf.reindex(r.index).fillna(0.0)
    lw = np.log1p(r.clip(lower=-1)).cumsum()
    w = np.exp(lw)
    yrs = len(r) / per_year
    cagr = w.iloc[-1] ** (1 / yrs) - 1
    ex = r - rf
    sharpe = ex.mean() / ex.std() * np.sqrt(per_year)
    peak = w.cummax().clip(lower=1.0)
    mdd = float((1 - w / peak).max())
    cal = (1 + r).groupby(r.index.year).prod() - 1
    cal = cal[r.groupby(r.index.year).size() >= 0.9 * per_year]   # full years only
    roll = {}
    for y in (1, 3, 5, 10):
        k = y * per_year
        if len(w) > k:
            m = (w / w.shift(k)).dropna()
            roll[y] = float(np.mean(m >= 2.0 ** y))
    return {"start": r.index[0].date().isoformat(), "end": r.index[-1].date().isoformat(),
            "CAGR": cagr, "vol": float(r.std() * np.sqrt(per_year)), "Sharpe": float(sharpe),
            "max drawdown": mdd, "full calendar years": int(len(cal)),
            "years >= +100%": int((cal >= 1.0).sum()),
            "best year": f"{cal.idxmax()} {cal.max():+.0%}", "worst year": f"{cal.idxmin()} {cal.min():+.0%}",
            "share of rolling 12m >= +100%": roll.get(1), "share of rolling 3y CAGR>=100%": roll.get(3),
            "share of rolling 5y CAGR>=100%": roll.get(5), "share of rolling 10y CAGR>=100%": roll.get(10)}


# ----------------------------------------------------------------------------- output
def fmt(v, kind="pct", digits=0):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "n/a"
    if kind == "pct":
        if 0 < abs(v) < 0.0005 and digits == 0:
            return "<0.1%" if v > 0 else "-<0.1%"
        if 0 < abs(v) < 0.005 and digits == 0:
            return f"{100 * v:.1f}%"
        return f"{100 * v:.{digits}f}%"
    if kind == "x":
        if v >= 1e6:
            return f"{v:.1e}x"
        if v >= 100:
            return f"{v:,.0f}x"
        return f"{v:.1f}x" if v >= 10 else f"{v:.2f}x"
    return str(v)


def to_markdown(df: pd.DataFrame, index=False) -> str:
    d = df.reset_index() if index else df
    cols = [str(c) for c in d.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for row in d.itertuples(index=False):
        lines.append("| " + " | ".join(str(v) for v in row) + " |")
    return "\n".join(lines)


def save_table(df: pd.DataFrame, stem: str, index=False):
    df.to_csv(os.path.join(RESULTS, f"{stem}.csv"), index=index)
    with open(os.path.join(RESULTS, f"{stem}.md"), "w") as fh:
        fh.write(to_markdown(df, index=index) + "\n")
    return df
