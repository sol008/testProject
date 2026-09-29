"""Track 24: does loosening the holding cap from 60 to 90 or 120 calendar days unlock strategy families that
tracks 21 and 22 did NOT test?  Shared helpers.

Re-uses (read-only) the loaders and engines of earlier tracks:
  * track 22 `common22` -> track 13 `common13`: total-return price panels with dividend-adjusted opens, per-session
    T-bills, the non-overlapping trade engine and the era-matched random-entry placebo (`evaluate`).  The cache is
    pointed at this track's scratchpad (its cache/ folder symlinks the track 13/22 caches), so new downloads land
    in the scratchpad and never in the repository.
  * track 14 `optmodel` / `spreadsim`: the calibrated synthetic SPX option surface (an APPROXIMATION).
  * track 16 scratch data: EDGAR earnings / spin-off / S&P 500 membership events and its Yahoo price cache.

Conventions (same as tracks 21-22):
  * Caps of 60 / 90 / 120 calendar days are read as 42 / 63 / 84 trading sessions (track 22 section 1.1: the largest
    fixed holds that always fit are 38 / 59 / 79 sessions; results at 59/79 are reported where they matter).
  * Signals use the close of day t; ETFs enter at the next open; indices/funds at the next close.
  * TIMING EDGE = excess over T-bills minus the mean excess of every entry day within +-3 years (same hold):
    what an era-matched random entry earned.  It removes drift, which grows with the hold.
  * Forward planning: T-bills 4.2%, S&P 500 total return 3 / 4.5 / 6% a year (CAPE ~41).
  * kappa = 0.5 shrinks an edge halfway to zero (0.25 when there are only 10-19 independent episodes; below 10
    the rule is paper-only, track 17 R9).
No module here writes outside research/code/24-duration-gaps/results or the scratchpad.
"""
from __future__ import annotations

import io
import math
import os
import sys
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True           # never drop __pycache__ into other tracks' folders

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
RESULTS.mkdir(exist_ok=True)
CODE = HERE.parent
SCRATCH_ROOT = Path("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad")
SCRATCH = Path(os.environ.get("TRACK24_SCRATCH", SCRATCH_ROOT / "24-duration-gaps"))
SCRATCH.mkdir(parents=True, exist_ok=True)
(SCRATCH / "cache").mkdir(exist_ok=True)
os.environ["TRACK22_SCRATCH"] = str(SCRATCH)      # common22 -> common13 cache = SCRATCH/cache
for sub in ("22-duration-new", "13-short-index", "14-short-options"):
    p = str(CODE / sub)
    if p not in sys.path:
        sys.path.append(p)
import common22 as C22  # noqa: E402
import common13 as C13  # noqa: E402

CACHE = C13.CACHE
T16 = SCRATCH_ROOT / "16-short-events"
T05_OUT = CODE / "05-special-situations" / "output"
T16_OUT = CODE / "16-short-events" / "output"

CAPS = {60: 42, 90: 63, 120: 84}          # calendar-day cap -> trading sessions (brief convention)
STRICT = {60: 38, 90: 59, 120: 79}        # largest fixed hold that always fits the calendar cap
HOLDS = (42, 63, 84)
SPLIT = pd.Timestamp("2008-01-01")
BILLS_FWD = 0.042
EQ_FWD = (0.03, 0.045, 0.06)
EQ_EXCESS_FWD = tuple(x - BILLS_FWD for x in EQ_FWD)      # -1.2%, +0.3%, +1.8% a year over bills
KAPPA = 0.5
HURDLE_BP = 6.0                                          # design section 4: dg >= 6 bp per trade on the book
STRESS_CAP = 0.02                                        # per-trade stress <= 2% of NAV

def evaluate(df: pd.DataFrame, entry: pd.Series, H: int, mode: str, start, end, **kw):
    """Track 22's evaluate(), guarded: an instrument with no data inside [start, end] yields no trades.
    (Unguarded, an instrument that starts after `end` is run over its whole history.)"""
    s0 = pd.Timestamp(start) if start is not None else df.index[0]
    s1 = pd.Timestamp(end) if end is not None else df.index[-1]
    if len(df) == 0 or df.index[0] > s1 or df.index[-1] < s0:
        return pd.DataFrame(), dict(ticker=df.attrs.get("ticker", "?"), H=H, mode=mode, n=0, per_yr=0.0)
    return C22.evaluate(df, entry, H, mode, start, end, **kw)


load = C13.load
fred = C13.fred
daily_rf = C13.daily_rf
deflated_sr = C13.deflated_sr
bonferroni_t = C13.bonferroni_t
expected_max_z = C13.expected_max_z
run_rule = C13.run_rule
first_cross = C22.first_cross


def save(df: pd.DataFrame, name: str, index: bool = False) -> Path:
    """Small CSV into results/ (gzip if > 400 kB, the track-13 convention)."""
    p = RESULTS / f"{name}.csv"
    pz = RESULTS / f"{name}.csv.gz"
    df.to_csv(p, index=index, float_format="%.6g")
    if p.stat().st_size > 400_000:
        df.to_csv(pz, index=index, float_format="%.6g", compression="gzip")
        p.unlink()
        return pz
    if pz.exists():                       # never leave a stale gzipped copy next to the fresh plain file
        pz.unlink()
    return p


def years(a, b) -> float:
    return max((pd.Timestamp(b) - pd.Timestamp(a)).days / 365.25, 1e-9)


# ============================================================================ data helpers
def yf_frame(ticker: str) -> pd.DataFrame:
    """Track-13 style frame (O,H,L,C, adjusted aO..aC, V, rf) from Yahoo, cached in SCRATCH/cache."""
    return C13.load(ticker)


def closes(ticker: str) -> pd.Series:
    return yf_frame(ticker)["aC"].rename(ticker)


def clean_spikes(df: pd.DataFrame, thresh: float = 0.04, start=None) -> pd.DataFrame:
    """Remove one-day reverting price spikes (|r_t| > thresh, opposite |r_t+1| > thresh, net move < thresh/2),
    the Yahoo data errors track 14 found in CBOE series; optionally drop history before `start`."""
    df = df.copy()
    if start is not None:
        df = df.loc[pd.Timestamp(start):]
    for col in ("aC", "aO", "C", "O"):
        if col not in df:
            continue
        s = df[col]
        r = s.pct_change()
        spike = (r.abs() > thresh) & (r.shift(-1).abs() > thresh) & (np.sign(r) != np.sign(r.shift(-1))) \
            & ((r + r.shift(-1)).abs() < thresh / 2)
        s = s.mask(spike).interpolate()
        df[col] = s
    df.attrs.update(getattr(df, "attrs", {}))
    return df


def kf_zip(name: str) -> str:
    """Text of a Ken French library CSV zip (cached)."""
    fn = CACHE / f"{name}_CSV.zip"
    if not fn.exists():
        url = f"https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/{name}_CSV.zip"
        fn.write_bytes(C13._get(url))
    z = zipfile.ZipFile(fn)
    return z.read(z.namelist()[0]).decode("latin-1")


def kf_table(name: str, which: int = 0, daily: bool = False) -> pd.DataFrame:
    """Parse block `which` (0 = first, e.g. value-weighted returns) of a Ken French CSV into decimals."""
    txt = kf_zip(name)
    lines = txt.splitlines()
    blocks, cur, hdr = [], [], None
    ndig = 8 if daily else 6
    for ln in lines:
        p = [q.strip() for q in ln.split(",")]
        if p and p[0].isdigit() and len(p[0]) == ndig:
            cur.append(p)
        else:
            if cur:
                blocks.append((hdr, cur))
                cur = []
            if len(p) > 1 and p[0] == "" and any(x for x in p[1:]):
                hdr = [x for x in p[1:]]
    if cur:
        blocks.append((hdr, cur))
    hdr, rows = blocks[which]
    fmt = "%Y%m%d" if daily else "%Y%m"
    idx = pd.to_datetime([r[0] for r in rows], format=fmt)
    vals = np.array([[float(x) for x in r[1:1 + len(hdr)]] for r in rows])
    df = pd.DataFrame(vals / 100.0, index=idx, columns=hdr)
    df = df.where(df > -0.99)              # -99.99 (or -999) = missing; no real return is below -99%
    return df


def monthly_rf() -> pd.Series:
    return C13.ken_french_monthly_rf()


# ============================================================================ statistics
def nw_t(x: np.ndarray, lags: int) -> float:
    """Newey-West t-statistic of the mean of an (overlapping) series."""
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    n = len(x)
    if n < 5:
        return float("nan")
    e = x - x.mean()
    s = e @ e / n
    for L in range(1, min(lags, n - 1) + 1):
        w = 1 - L / (lags + 1)
        s += 2 * w * (e[L:] @ e[:-L]) / n
    return float(x.mean() / math.sqrt(s / n)) if s > 0 else float("nan")


def capm(r: pd.Series, m: pd.Series, rf: pd.Series, per_year: int = 12, lags: int = 3) -> dict:
    """CAPM on excess returns: alpha a year, beta, down-market beta (market excess < 0), NW t of alpha."""
    d = pd.concat([r - rf, m - rf], axis=1, keys=["y", "x"]).dropna()
    if len(d) < 24:
        return {}
    X = np.column_stack([np.ones(len(d)), d["x"].values])
    b = np.linalg.lstsq(X, d["y"].values, rcond=None)[0]
    res = d["y"].values - X @ b
    # Newey-West se of the intercept
    n = len(d)
    XtX_inv = np.linalg.inv(X.T @ X)
    S = np.zeros((2, 2))
    for L in range(0, lags + 1):
        w = 1.0 if L == 0 else 1 - L / (lags + 1)
        G = (X[L:] * res[L:, None]).T @ (X[:n - L] * res[:n - L, None])
        S += w * (G if L == 0 else G + G.T)
    V = XtX_inv @ S @ XtX_inv
    dn = d[d["x"] < 0]
    bd = np.polyfit(dn["x"], dn["y"], 1)[0] if len(dn) > 10 else float("nan")
    return dict(alpha_yr=b[0] * per_year, beta=b[1], beta_down=bd, t_alpha=b[0] / math.sqrt(V[0, 0]),
                n=n, ex_mean_yr=d["y"].mean() * per_year)


def dsr(sr_trade: float, n: int, skew: float, kurt: float, N: int) -> float:
    return C13.deflated_sr(sr_trade, n, skew, kurt, N)


def window_stats(x: np.ndarray) -> dict:
    from scipy import stats as sps
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    n = len(x)
    if n < 3:
        return dict(n=n)
    sd = x.std(ddof=1)
    return dict(n=n, mean=x.mean(), median=np.median(x), sd=sd, t=x.mean() / sd * math.sqrt(n) if sd > 0 else np.nan,
                win=(x > 0).mean(), worst=x.min(), p05=np.percentile(x, 5), skew=sps.skew(x),
                kurt=sps.kurtosis(x, fisher=False), sr=x.mean() / sd if sd > 0 else np.nan)


# ============================================================================ sizing & contribution
def notional_for_stress(worst10: float, cap: float = STRESS_CAP) -> float:
    """Design section 4: no stop -> stress = notional x worst 10-session loss; notional so that stress = cap."""
    return min(1.0, cap / abs(worst10)) if worst10 < 0 else 1.0


def dg_bp(notional: float, mu: float, sd: float) -> float:
    """Growth increment of one trade on the whole book, in basis points: f*mu - f^2*sd^2/2."""
    return 1e4 * (notional * mu - 0.5 * notional ** 2 * sd ** 2)


def contribution(per_yr: float, notional: float, drift_per_trade: float, edge_per_trade: float, kappa: float = KAPPA) -> float:
    """Expected pre-tax contribution a year, whole portfolio, over T-bills (track 22 section 1.3)."""
    return per_yr * notional * (drift_per_trade + kappa * edge_per_trade)


def fwd_equity_drift(sessions: int, which: int = 1) -> float:
    """Forward excess drift of US equity over bills for a hold of `sessions` (which: 0 low, 1 central, 2 high)."""
    return EQ_EXCESS_FWD[which] * sessions / 252.0


# ============================================================================ multiple-testing ledger
class Ledger:
    """One row per decision-relevant variant tested in this track (family, variant, sample, n, t)."""

    rows: list[dict] = []

    @classmethod
    def add(cls, family: str, variant: str, sample: str, n: float, stat: float, stat_kind: str = "t", **extra):
        r = dict(family=family, variant=variant, sample=sample, n=n, stat=stat, stat_kind=stat_kind)
        r.update(extra)
        cls.rows.append(r)

    @classmethod
    def save(cls, family: str):
        df = pd.DataFrame([r for r in cls.rows if r["family"] == family])
        save(df, f"ledger_{family}")
        return df


def fmt(x, d=1, pct=True):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "–"
    return f"{100 * x:+.{d}f}%" if pct else f"{x:.{d}f}"
