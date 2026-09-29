"""Track 22 (research task RB): which NEW strategy families become feasible, and worth adding, if the
holding-period cap is loosened from 60 calendar days (~42 sessions) to 90 (~63) or 120 (~84) days.

Shared helpers.  Re-uses track 13's loaders and trade engine (common13: total-return price panels,
T-bills, non-overlapping trade engine, strategy stream, deflated Sharpe) with the cache pointed at this
track's scratchpad (whose cache/ folder symlinks tracks 13/06/15/17 caches, so nothing is re-downloaded).

Conventions (same as tracks 13/17):
  * Signal at the CLOSE of day t.  ETFs enter at the next OPEN ('open' mode); indices, mutual funds and
    synthetic series enter at the next CLOSE ('close' mode).  Time exit after exactly H sessions.
  * Trades never overlap within a variant (a new signal is ignored while a trade is open).
  * excess = net trade return - T-bill return over the same sessions.
  * TIMING EDGE = excess - era-matched random-entry excess: for each trade, the mean H-session excess of
    every entry day within +-3 years of its signal (same period only), i.e. what a random entry at the
    same time would have earned.  A permutation test (B draws of one random date per trade) gives the
    placebo p-value (two-sided) and a z-score.  This is the track-17 placebo, and it removes drift.
  * Holding periods: H42 = the current 60-calendar-day cap, H63 = 90 days, H84 = 120 days.
"""
from __future__ import annotations

import math
import os
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

SCR = Path(os.environ.get(
    "TRACK22_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/22-duration-new"))
os.environ["TRACK13_SCRATCH"] = str(SCR)          # common13 caches in SCR/cache
CODE = Path(__file__).resolve().parent
RESULTS = CODE / "results"
RESULTS.mkdir(exist_ok=True)
sys.path.insert(0, str(CODE.parent / "13-short-index"))
import common13 as C13  # noqa: E402

CACHE = C13.CACHE
TODAY = pd.Timestamp("2026-09-28")
SPLIT = pd.Timestamp("2008-01-01")
HOLDS = (42, 63, 84)
CAP_OF = {42: "60d cap", 60: "~87d", 63: "90d cap", 84: "120d cap"}
B_DRAWS = 4000
WINDOW = 756                                      # +-3 years of sessions for the era-matched placebo

load = C13.load
fred = C13.fred
sma = C13.sma
drawdown = C13.drawdown
run_rule = C13.run_rule
strategy_daily = C13.strategy_daily
deflated_sr = C13.deflated_sr
bonferroni_t = C13.bonferroni_t
expected_max_z = C13.expected_max_z
daily_rf = C13.daily_rf


# ============================================================================ small utilities
def first_cross(cond: pd.Series, quiet: int = 20) -> pd.Series:
    """cond true today and false on each of the previous `quiet` sessions (track 13 definition)."""
    cond = cond.fillna(False).astype(bool)
    prev = cond.shift(1).rolling(quiet, min_periods=1).max().fillna(0).astype(bool)
    return cond & ~prev


def first_since_ath(dd: pd.Series, level: float) -> pd.Series:
    """First close with drawdown <= level since the last all-time high (track 13 definition)."""
    ath = dd >= 0
    ep = ath.cumsum()
    hit = dd <= level
    return hit & (hit.groupby(ep).cumsum() == 1)


def synthetic_frame(tr: pd.Series, name: str, rf: pd.Series | None = None) -> pd.DataFrame:
    """A close-only total-return frame usable by the track-13 engine ('close' mode only)."""
    tr = tr.dropna()
    tr = tr[tr > 0]
    df = pd.DataFrame(index=tr.index)
    for c in ("O", "H", "L", "C", "aO", "aH", "aL", "aC"):
        df[c] = tr.values
    df["V"] = np.nan
    df["rf"] = (rf.reindex(df.index).ffill().fillna(0.0).values if rf is not None
                else daily_rf(df.index).values)
    df.attrs["ticker"] = name
    return df


def month_end_positions(idx: pd.DatetimeIndex, months: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """Map month stamps to the last trading day of that month present in idx."""
    s = pd.Series(idx, index=idx)
    me = s.groupby(idx.to_period("M")).last()
    per = pd.PeriodIndex(months, freq="M")
    out = me.reindex(per).dropna()
    return pd.DatetimeIndex(out.values)


def vix_gauge(spx: pd.DataFrame) -> pd.Series:
    """Spliced fear gauge on the ^GSPC calendar (track 13): VIX 1990-, VXO 1986-89, RV21+4 before."""
    vix = load("^VIX")["C"]
    vxo = fred("VXOCLS")
    rv = np.log(spx["C"]).diff().rolling(21).std() * np.sqrt(252) * 100 + 4.0
    g = rv.copy()
    m = (spx.index >= "1986-01-02") & (spx.index < "1990-01-02")
    vxo_d = vxo.reindex(spx.index)
    g[m & vxo_d.notna().values] = vxo_d[m & vxo_d.notna().values]
    vix_d = vix.reindex(spx.index)
    m2 = (spx.index >= "1990-01-02") & vix_d.notna().values
    g[m2] = vix_d[m2]
    return g.ffill()


def shiller_col(col: str = "Rate GS10") -> pd.Series:
    """A monthly column of Shiller's ie_data.xls (month-start stamps)."""
    x = pd.read_excel(CACHE / "shiller_ie_data.xls", sheet_name="Data", header=None, engine="xlrd")
    hdr = None
    for i in range(20):
        row = [str(v).strip() for v in x.iloc[i].tolist()]
        if "Date" in row and "P" in row:
            hdr = i
            break
    cols = [str(v).strip() for v in x.iloc[hdr].tolist()]
    body = x.iloc[hdr + 1:].copy()
    body.columns = cols
    body = body[pd.to_numeric(body["Date"], errors="coerce").notna()]
    d = pd.to_numeric(body["Date"]).astype(float)
    yr = np.floor(d).astype(int)
    mo = np.round((d - yr) * 100).astype(int).clip(lower=1)
    idx = pd.to_datetime(dict(year=yr, month=mo, day=1))
    s = pd.Series(pd.to_numeric(body[col], errors="coerce").values, index=idx).dropna()
    return s[~s.index.duplicated()]


def bond_tr(maturity: int = 10) -> pd.Series:
    """Synthetic constant-maturity par-bond total-return index from FRED yields (track 15 method:
    carry + duration + convexity).  maturity 10 -> DGS10 (1962-); 30 -> DGS30 with DGS20 filling
    1962-76 and the 2002-06 DGS30 gap (a 'long bond' comparable to TLT)."""
    sys.path.insert(0, str(CODE.parent / "15-short-futures-crypto"))
    if maturity == 10:
        y = fred("DGS10") / 100
        m = pd.Series(10.0, index=y.index)
    else:
        y30 = fred("DGS30") / 100
        y20 = fred("DGS20") / 100
        idx = y20.index.union(y30.index)
        y = y30.reindex(idx)
        m = pd.Series(30.0, index=idx)
        gap = y.isna()
        y[gap] = y20.reindex(idx)[gap]
        m[gap] = 20.0
        y = y.dropna()
        m = m.reindex(y.index)
    y = y[~y.index.duplicated()]
    n = 2 * m
    yy = y.clip(lower=1e-4)
    h = yy / 2
    D = (1 - (1 + h) ** (-n)) / yy
    dy = 1e-4

    def price(yv):
        hh = yv / 2
        return (yy / 2) * (1 - (1 + hh) ** (-n)) / hh + (1 + hh) ** (-n)
    Cx = (price(yy + dy) + price(yy - dy) - 2 * price(yy)) / (dy ** 2) / price(yy)
    days = y.index.to_series().diff().dt.days.fillna(1)
    carry = y.shift(1) * days / 365.0
    chg = y.diff()
    same_m = m == m.shift(1)
    r = carry - D.shift(1) * chg + 0.5 * Cx.shift(1) * chg ** 2
    r[~same_m] = carry[~same_m]           # maturity switch: no price effect on the splice day
    r = r.fillna(0.0)
    return (1 + r).cumprod()


# ============================================================================ forward excess & placebo
def fwd_excess(df: pd.DataFrame, H: int, mode: str, cost_bps: float, vix: pd.Series | None = None,
               hv_mult: float = 2.0) -> np.ndarray:
    """Net H-session excess return for an entry signalled at every close t (NaN where the window runs
    past the data).  Identical arithmetic to common13.run_rule's time exit."""
    aO, aC, rf = df["aO"].values, df["aC"].values, df["rf"].values
    n = len(df)
    rfc = np.concatenate([[0.0], np.cumsum(rf)])
    c = np.full(n, cost_bps / 1e4)
    if vix is not None:
        vx = vix.reindex(df.index).ffill().values
        c = np.where(np.nan_to_num(vx) > 30, c * hv_mult, c)
    out = np.full(n, np.nan)
    t = np.arange(n)
    if mode == "open":
        ok = t + H < n
        tt = t[ok]
        e, x = aO[tt + 1], aC[tt + H]
        rfh = rfc[tt + H + 1] - rfc[tt + 1]
    elif mode == "close":
        ok = t + 1 + H < n
        tt = t[ok]
        e, x = aC[tt + 1], aC[tt + 1 + H]
        rfh = rfc[tt + H + 2] - rfc[tt + 2]
    else:
        raise ValueError(mode)
    cc = c[tt]
    out[tt] = x * (1 - cc) / (e * (1 + cc)) - 1 - rfh
    return out


def placebo(fx: np.ndarray, pos: np.ndarray, lo: int, hi: int, window: int = WINDOW,
            B: int = B_DRAWS, rng: np.random.Generator | None = None):
    """Era-matched random-entry baseline.  For trade j (signal at position pos[j]) the pool is every
    valid entry day within +-window sessions, restricted to [lo, hi).  Returns (per-trade pool mean,
    B null means of one random draw per trade)."""
    rng = rng or np.random.default_rng(22)
    valid = ~np.isnan(fx)
    m = np.full(len(pos), np.nan)
    draws = np.zeros((B, len(pos)))
    for j, p in enumerate(pos):
        a, b = max(lo, p - window), min(hi, p + window + 1)
        pool = np.flatnonzero(valid[a:b]) + a
        if len(pool) < 20:
            pool = np.flatnonzero(valid[lo:hi]) + lo
        if len(pool) < 20:
            pool = np.flatnonzero(valid)
        if len(pool) == 0:
            m[j] = np.nan
            draws[:, j] = np.nan
            continue
        m[j] = fx[pool].mean()
        draws[:, j] = fx[rng.choice(pool, size=B)]
    return m, np.nanmean(draws, axis=1)


def period_bounds(idx: pd.DatetimeIndex, start, end) -> tuple[int, int]:
    lo = 0 if start is None else int(idx.searchsorted(pd.Timestamp(start)))
    hi = len(idx) if end is None else int(idx.searchsorted(pd.Timestamp(end), side="right"))
    return lo, hi


def years_between(start, end) -> float:
    return max((pd.Timestamp(end) - pd.Timestamp(start)).days / 365.25, 1e-9)


def evaluate(df: pd.DataFrame, entry: pd.Series, H: int, mode: str, start, end,
             cost_bps: float | None = None, vix: pd.Series | None = None, B: int = B_DRAWS,
             window: int = WINDOW, seed: int = 22, span_start=None, span_end=None):
    """Run a variant on one period and compare it with the era-matched placebo.

    span_start/span_end: the calendar span used for trades-per-year (defaults to the period, clipped to
    the instrument's data).  Returns (trades DataFrame incl. per-trade baseline and edge, stats dict)."""
    tk = df.attrs.get("ticker", "?")
    if cost_bps is None:
        cost_bps = C13.base_cost(tk)
    idx = df.index
    lo, hi = period_bounds(idx, start, end)
    entry = entry.reindex(idx).fillna(False).astype(bool)
    tr = run_rule(df, entry, mode=mode, hold=H, cost_bps=cost_bps, start=idx[lo] if lo < len(idx) else None,
                  end=(idx[hi - 1] + pd.Timedelta(days=1)) if hi > 0 else None, vix=vix)
    s0 = pd.Timestamp(span_start) if span_start is not None else max(pd.Timestamp(start) if start else idx[0], idx[0])
    s1 = pd.Timestamp(span_end) if span_end is not None else min(pd.Timestamp(end) if end else idx[-1], idx[-1])
    yrs = years_between(s0, s1)
    st = dict(ticker=tk, H=H, mode=mode, period=f"{s0.year}-{s1.year}", years=yrs)
    if tr is None or len(tr) == 0:
        st.update(n=0, per_yr=0.0)
        return pd.DataFrame(), st
    tr = tr[tr["how"] != "open_at_end"].copy()
    if len(tr) == 0:
        st.update(n=0, per_yr=0.0)
        return pd.DataFrame(), st
    fx = fwd_excess(df, H, mode, cost_bps, vix)
    pos = np.array([idx.get_loc(s) for s in tr["signal"]])
    rng = np.random.default_rng(seed + H)
    m, null = placebo(fx, pos, lo, hi, window=window, B=B, rng=rng)
    tr["base"] = m
    tr["edge"] = tr["excess"].values - m
    x = tr["excess"].values
    e = tr["edge"].values
    n = len(tr)
    mu_null, sd_null = float(null.mean()), float(null.std(ddof=1))
    mean_ex = float(x.mean())
    edge = mean_ex - mu_null
    p = float(np.mean(np.abs(null - mu_null) >= abs(mean_ex - mu_null)))
    sd_e = float(np.std(e, ddof=1)) if n > 1 else float("nan")
    from scipy import stats as sps
    daily = strategy_daily(df, tr, start=s0, end=s1)
    eq = (1 + daily).cumprod()
    mdd = float((eq / eq.cummax() - 1).min()) if len(eq) else float("nan")
    st.update(
        n=n, per_yr=n / yrs, win=float(np.mean(tr["net"] > 0)),
        mean_net=float(tr["net"].mean()), median_net=float(tr["net"].median()),
        worst=float(tr["net"].min()), best=float(tr["net"].max()),
        mean_ex=mean_ex, base=float(np.mean(m)), edge=edge,
        edge_trade_mean=float(np.mean(e)), sd_edge=sd_e,
        t_edge=float(np.mean(e) / sd_e * math.sqrt(n)) if n > 1 and sd_e > 0 else float("nan"),
        z_placebo=edge / sd_null if sd_null > 0 else float("nan"), p_placebo=p,
        sr_edge=float(np.mean(e) / sd_e) if n > 1 and sd_e > 0 else float("nan"),
        skew_edge=float(sps.skew(e)) if n > 2 else float("nan"),
        kurt_edge=float(sps.kurtosis(e, fisher=False)) if n > 3 else float("nan"),
        mae_worst=float(tr["mae"].min()), mdd=mdd, sessions=float(tr["sessions"].mean()),
        t_raw=float(mean_ex / np.std(x, ddof=1) * math.sqrt(n)) if n > 1 and np.std(x, ddof=1) > 0 else float("nan"),
    )
    return tr, st


# ============================================================================ registry
class Registry:
    """Every (family, variant, instrument, period) evaluated, so deflation knows N."""

    def __init__(self, family: str):
        self.family = family
        self.rows: list[dict] = []
        self.trades: list[pd.DataFrame] = []

    def add(self, variant: str, instrument: str, role: str, st: dict, tr: pd.DataFrame | None = None, **extra):
        row = dict(family=self.family, variant=variant, instrument=instrument, role=role)
        row.update(st)
        row.update(extra)
        self.rows.append(row)
        if tr is not None and len(tr):
            t = tr.copy()
            t.insert(0, "role", role)
            t.insert(0, "instrument", instrument)
            t.insert(0, "variant", variant)
            t.insert(0, "family", self.family)
            self.trades.append(t)
        return row

    def frame(self) -> pd.DataFrame:
        return pd.DataFrame(self.rows)

    def save(self, name: str | None = None):
        name = name or f"registry_{self.family}.csv"
        df = self.frame()
        df.to_csv(RESULTS / name, index=False, float_format="%.6g")
        if self.trades:
            t = pd.concat(self.trades, ignore_index=True)
            p = RESULTS / name.replace("registry_", "trades_")
            t.to_csv(p, index=False, float_format="%.6g")
            if p.stat().st_size > 400_000:                  # keep the repo lean (track 13 convention)
                t.to_csv(str(p) + ".gz", index=False, float_format="%.6g", compression="gzip")
                p.unlink()
        return df


def select_and_test(reg: pd.DataFrame, design_role: str = "design", test_role: str = "test",
                    min_n: int = 8, key: str = "z_placebo", group_cols=("variant", "instrument")) -> dict:
    """In-sample selection: the design variant with the best placebo z (n >= min_n) -> its test row."""
    d = reg[(reg["role"] == design_role) & (reg["n"] >= min_n)].copy()
    if len(d) == 0:
        return {}
    best = d.sort_values(key, ascending=False).iloc[0]
    t = reg[(reg["role"] == test_role) & (reg["variant"] == best["variant"])]
    if "instrument_test" in reg.columns:
        pass
    return dict(best=best, test=t)


# ============================================================================ significance
def dsr_row(st: dict, N: int) -> float:
    """Deflated-Sharpe probability of the per-trade TIMING EDGE series, best of N trials."""
    if not st or st.get("n", 0) < 3:
        return float("nan")
    return deflated_sr(st.get("sr_edge", float("nan")), int(st["n"]), st.get("skew_edge", 0.0),
                       st.get("kurt_edge", 3.0), N)


# ============================================================================ sizing & contribution
def worst_window_loss(tr: pd.Series, H: int) -> float:
    """Worst H-session loss of a total-return series (close to close)."""
    s = tr.dropna()
    r = s.shift(-H) / s - 1
    return float(r.min())


def kappa_for(n_episodes: int) -> float:
    """Shrinkage per the constitution: 0.5 for n >= 20, 0.25 for 10 <= n < 20, 0 (paper only) below 10."""
    if n_episodes >= 20:
        return 0.5
    if n_episodes >= 10:
        return 0.25
    return 0.25          # reported, but such families are paper-only by rule (n < 10)


def contribution(per_yr: float, notional: float, base_per_trade: float, edge_per_trade: float,
                 kappa: float) -> float:
    """Expected pre-tax contribution to whole-portfolio return per year, over T-bills."""
    return per_yr * notional * (base_per_trade + kappa * edge_per_trade)


def fmt(x, d=1, pct=True):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "–"
    return f"{100 * x:+.{d}f}%" if pct else f"{x:.{d}f}"
