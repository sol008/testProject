"""Shared helpers for track 17 (short-horizon macro / geopolitical event trades, 1-60 trading days).

Design choices (applied everywhere):
- Day 0 = first trading session in which the market could react to the event. For weekend/overnight news this is
  the next session. "Pre" close = the last close before the news.
- Forward returns are measured from the day-0 CLOSE (the earliest realistic entry for an email sent after the
  close and executed manually), at h = 1, 5, 20, 60 trading days. Day-0 reaction = close(d0)/close(pre) - 1.
- Baseline (placebo) = the same-length forward return on random trading days. Two versions:
    (a) unconditional: every day in the asset's history over the event span;
    (b) era-matched permutation: each event date is replaced by a random trading day within +/- `era_years`
        of it; 5,000 draws give a null distribution of the event-mean -> p-value (two-sided).
- Returns use adjusted closes (total return for ETFs). ^GSPC is price-only; the baseline is computed the same way,
  so excess returns are unaffected by the missing dividends.
- Yield series (DGS2/DGS10) are analysed as changes in basis points, not returns.
"""
from __future__ import annotations

import io
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

SCRATCH = Path(os.environ.get(
    "TRACK17_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/17-short-macro",
))
SCRATCH.mkdir(parents=True, exist_ok=True)
ASOF = pd.Timestamp("2026-09-28")
HORIZONS = [1, 5, 20, 60]
UA = {"User-Agent": "Mozilla/5.0 (research; contact research@example.com)"}
RNG = np.random.default_rng(17)


# ----------------------------------------------------------------------------------------------------------------
# I/O
# ----------------------------------------------------------------------------------------------------------------
def fred(series_id: str, start: str = "1900-01-01", retries: int = 3) -> pd.Series:
    cache = SCRATCH / f"fred_{series_id}.csv"
    if cache.exists():
        s = pd.read_csv(cache, index_col=0, parse_dates=True).iloc[:, 0]
        return s.dropna()
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd={start}"
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, timeout=60, headers=UA)
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))
            df.columns = ["date", series_id]
            s = pd.to_numeric(df[series_id], errors="coerce")
            s.index = pd.to_datetime(df["date"])
            s = s.dropna()
            s.to_frame().to_csv(cache)
            return s
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"FRED {series_id}: {last}")


def load_prices() -> pd.DataFrame:
    return pd.read_csv(SCRATCH / "prices_adj.csv", index_col=0, parse_dates=True)


# ----------------------------------------------------------------------------------------------------------------
# Event alignment
# ----------------------------------------------------------------------------------------------------------------
def day0_index(idx: pd.DatetimeIndex, date, same_day_ok: bool = True) -> int | None:
    """Position of the first trading day on/after `date` (or strictly after if same_day_ok=False)."""
    d = pd.Timestamp(date)
    pos = idx.searchsorted(d, side="left" if same_day_ok else "right")
    return int(pos) if pos < len(idx) else None


def event_table(s: pd.Series, events: list[tuple], horizons=HORIZONS, is_yield: bool = False,
                same_day_col: int = 2) -> pd.DataFrame:
    """events: list of (label, date, same_day_ok[, ...]). Returns per-event day-0 reaction and forward moves.

    For price series: % returns. For yields: changes in bp (input in %).
    """
    s = s.dropna()
    idx = s.index
    rows = []
    for ev in events:
        label, date = ev[0], ev[1]
        same_ok = ev[same_day_col] if len(ev) > same_day_col else True
        p0 = day0_index(idx, date, same_ok)
        if p0 is None or p0 == 0:
            continue
        # guard: skip if the series starts after the event or has a gap > 7 days at the event
        if (idx[p0] - pd.Timestamp(date)).days > 7:
            continue
        pre, d0 = float(s.iloc[p0 - 1]), float(s.iloc[p0])
        r = {"event": label, "date": pd.Timestamp(date).date(), "day0": idx[p0].date()}
        r["d0"] = (d0 - pre) * 100 if is_yield else (d0 / pre - 1) * 100
        for h in horizons:
            if p0 + h < len(s):
                v = float(s.iloc[p0 + h])
                r[f"f{h}"] = (v - d0) * 100 if is_yield else (v / d0 - 1) * 100
            else:
                r[f"f{h}"] = np.nan
        # path stats over 60 days after day 0 (from the PRE close, i.e. including day-0 shock)
        w = s.iloc[p0 - 1: p0 + 61]
        if not is_yield and len(w) > 5:
            r["mdd60_from_pre"] = (w.min() / pre - 1) * 100
            r["days_to_low"] = int(np.argmin(w.values))  # 0 = pre-close itself
            r["mru60_from_pre"] = (w.max() / pre - 1) * 100
        rows.append(r)
    return pd.DataFrame(rows)


def fwd_returns(s: pd.Series, h: int, is_yield: bool = False) -> pd.Series:
    s = s.dropna()
    return (s.shift(-h) - s) * 100 if is_yield else (s.shift(-h) / s - 1) * 100


def baseline_stats(s: pd.Series, h: int, start=None, end=None, is_yield: bool = False) -> dict:
    f = fwd_returns(s, h, is_yield)
    if start is not None:
        f = f[f.index >= pd.Timestamp(start)]
    if end is not None:
        f = f[f.index <= pd.Timestamp(end)]
    f = f.dropna()
    return {"n": len(f), "mean": f.mean(), "median": f.median(), "sd": f.std(), "hit": (f > 0).mean() * 100}


def permutation_p(s: pd.Series, event_days: list, h: int, observed_mean: float, era_years: float = 3.0,
                  n_draws: int = 5000, is_yield: bool = False, exclude_days: int = 0) -> tuple[float, float]:
    """Era-matched placebo. Each event day is replaced by a random trading day within +/- era_years.
    Returns (p_two_sided, placebo_mean)."""
    f = fwd_returns(s, h, is_yield).dropna()
    fidx = f.index
    fv = f.values
    pools = []
    for d in event_days:
        d = pd.Timestamp(d)
        lo = fidx.searchsorted(d - pd.Timedelta(days=int(365.25 * era_years)))
        hi = fidx.searchsorted(d + pd.Timedelta(days=int(365.25 * era_years)))
        if hi - lo < 50:
            continue
        pools.append((lo, hi))
    if not pools:
        return np.nan, np.nan
    draws = np.zeros(n_draws)
    for j, (lo, hi) in enumerate(pools):
        draws += fv[RNG.integers(lo, hi, size=n_draws)]
    draws /= len(pools)
    pm = float(draws.mean())
    p = float((np.abs(draws - pm) >= abs(observed_mean - pm)).mean())
    return p, pm


def summarize(df: pd.DataFrame, s: pd.Series, horizons=HORIZONS, is_yield=False, era_years=3.0,
              label: str = "", perm: bool = True) -> pd.DataFrame:
    """One row per horizon: n, mean, median, sd, hit%, min, max, baseline mean/hit, excess, placebo p."""
    out = []
    cols = ["d0"] + [f"f{h}" for h in horizons]
    for c in cols:
        if c not in df:
            continue
        x = df[c].dropna()
        if len(x) == 0:
            continue
        h = 1 if c == "d0" else int(c[1:])
        days = pd.to_datetime(df.loc[x.index, "day0"]).tolist()
        if c == "d0":
            # day-0 baseline = 1-day returns on all days
            b = baseline_stats(s, 1, start=min(days) - pd.Timedelta(days=365 * 3), end=max(days) + pd.Timedelta(days=365 * 3),
                               is_yield=is_yield)
            p, pm = (np.nan, np.nan)
        else:
            b = baseline_stats(s, h, start=min(days) - pd.Timedelta(days=365 * 3), end=max(days) + pd.Timedelta(days=365 * 3),
                               is_yield=is_yield)
            p, pm = permutation_p(s, days, h, x.mean(), era_years, is_yield=is_yield) if perm else (np.nan, np.nan)
        out.append({"set": label, "window": c, "n": len(x), "mean": x.mean(), "median": x.median(), "sd": x.std(),
                    "hit%": (x > 0).mean() * 100, "min": x.min(), "max": x.max(),
                    "base_mean": b["mean"], "base_hit%": b["hit"], "base_sd": b["sd"],
                    "excess": x.mean() - (pm if not np.isnan(pm) else b["mean"]), "p_placebo": p})
    return pd.DataFrame(out)


def declutter_dates(dates: list, gap_days: int = 30) -> list:
    out, last = [], None
    for d in sorted(pd.to_datetime(dates)):
        if last is None or (d - last).days > gap_days:
            out.append(d)
            last = d
    return out


def fmt(df: pd.DataFrame, nd: int = 2) -> str:
    return df.round(nd).to_string(index=False)


def bh_fdr(pvals: np.ndarray, q: float = 0.10) -> np.ndarray:
    """Benjamini-Hochberg: boolean mask of discoveries at FDR q."""
    p = np.asarray(pvals, float)
    ok = ~np.isnan(p)
    res = np.zeros_like(p, dtype=bool)
    pv = p[ok]
    if len(pv) == 0:
        return res
    order = np.argsort(pv)
    ranked = pv[order]
    m = len(pv)
    thresh = q * (np.arange(1, m + 1) / m)
    passed = ranked <= thresh
    k = np.max(np.where(passed)[0]) + 1 if passed.any() else 0
    disc = np.zeros(m, dtype=bool)
    disc[order[:k]] = True
    res[np.where(ok)[0]] = disc
    return res


# ----------------------------------------------------------------------------------------------------------------
# Asset panel on the NYSE calendar
# ----------------------------------------------------------------------------------------------------------------
YIELD_LIKE = {"UST10Y", "UST2Y", "UST3M", "VIX"}


def asset_panel() -> dict[str, pd.Series]:
    """Series keyed by short name, all on (or reduced to) NYSE trading days. Yields in % (changes -> bp)."""
    px = load_prices()
    cal = px["^GSPC"].dropna().index
    out: dict[str, pd.Series] = {}

    def on_cal(s: pd.Series) -> pd.Series:
        s = s.dropna()
        s = s[~s.index.duplicated(keep="last")].sort_index()
        return s.reindex(cal, method="ffill", limit=3).loc[s.index.min():s.index.max()].dropna()

    out["SPX"] = px["^GSPC"].dropna()
    for k, t in [("SPY", "SPY"), ("TLT", "TLT"), ("UUP", "UUP"), ("USO", "USO"), ("BNO", "BNO"), ("XLE", "XLE"),
                 ("XOI", "^XOI"), ("JETS", "JETS"), ("LUV", "LUV"), ("DAL", "DAL"), ("UAL", "UAL"), ("INDA", "INDA"),
                 ("EIDO", "EIDO"), ("DXY", "DX-Y.NYB"), ("QQQ", "QQQ"), ("IWM", "IWM"), ("KRE", "KRE"),
                 ("FXY", "FXY"), ("EEM", "EEM"), ("IEF", "IEF"), ("SMH", "SMH"), ("NVDA", "NVDA"), ("XOM", "XOM"),
                 ("USDJPY", "JPY=X"), ("N225", "^N225")]:
        if t in px:
            out[k] = px[t].dropna()
    out["BTC"] = on_cal(px["BTC-USD"])
    g = px["GLD"].dropna()
    gc = px["GC=F"].dropna()
    gc = gc[gc.index < g.index.min()]
    # splice: scale GC=F so it joins GLD on GLD's first day
    first = g.index.min()
    gc_on = px["GC=F"].dropna()
    scale = g.iloc[0] / gc_on[gc_on.index <= first].iloc[-1]
    out["GOLD"] = pd.concat([gc * scale, g]).sort_index()
    out["VIX"] = px["^VIX"].dropna() / 100.0  # so that the x100 "bp" convention reports VIX changes in points
    wti = fred("DCOILWTICO")
    out["WTI"] = wti[wti > 0]
    brent = fred("DCOILBRENTEU")
    out["BRENT"] = brent[brent > 0]
    out["UST10Y"] = fred("DGS10")
    out["UST2Y"] = fred("DGS2")
    out["UST3M"] = fred("DTB3")
    return out
