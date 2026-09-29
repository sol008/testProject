"""Track 31 engine: works on ANY set of daily return CSVs (columns date,ret; one file per sleeve,
plus rf.csv for T-bills). A book is a dict of sleeve weights; cash (1 - sum of weights) earns rf.
Books are rebalanced to their weights every day in the Monte Carlo (the LETF sleeves reset daily
anyway); `studies31.rebalance_effect` measures monthly/band rebalancing on the real path.

Block bootstrap: each simulated path is a chain of blocks of 21, 42 or 63 sessions (1-3 months,
equally likely) drawn uniformly from the window, so all sleeves share the same dates (their
correlation and crash timing are kept). If a sleeve's history starts after a drawn block (e.g. Bitcoin
before 2014), that sleeve alone gets a block drawn from its own history instead ("fill"); the share of
filled blocks is reported, and books whose sleeves cover < 50% of the window are skipped.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

TD = 252
BLOCKS = (21, 42, 63)
HORIZONS = (5, 10, 20)
MULTIPLES = (2, 5, 10)


# ----------------------------------------------------------------------------- inputs
def read_inputs(folder: Path, names=None) -> pd.DataFrame:
    folder = Path(folder)
    out = {}
    for f in sorted(folder.glob("*.csv")):
        if names is not None and f.stem not in names and f.stem != "rf":
            continue
        s = pd.read_csv(f, index_col=0, parse_dates=True).iloc[:, 0]
        out[f.stem] = s
    R = pd.DataFrame(out).sort_index()
    if "rf" not in R:
        raise ValueError("rf.csv (daily T-bill return) is required")
    R["rf"] = R["rf"].ffill()
    return R


def book_daily(R: pd.DataFrame, w: dict) -> pd.Series:
    """Daily-rebalanced book return on the real path (NaN where a sleeve is missing)."""
    r = R["rf"] * (1 - sum(w.values()))
    for k, v in w.items():
        r = r + v * R[k]
    return r


# ----------------------------------------------------------------------------- bootstrap
class Bootstrap:
    """Common random numbers: one set of block draws per window, shared by every book."""

    def __init__(self, R: pd.DataFrame, start: str, end: str, n_paths=2000, years=50, seed=31,
                 chunk=250, min_cover=0.5):
        self.W = R.loc[start:end]
        self.n = len(self.W)
        self.days = years * TD
        self.n_paths, self.chunk, self.seed, self.min_cover = n_paths, chunk, seed, min_cover
        self.first = {c: int(np.argmax(self.W[c].notna().values)) if self.W[c].notna().any() else self.n
                      for c in self.W.columns}
        self.cover = {c: self.W[c].notna().mean() for c in self.W.columns}
        # fill gaps inside a sleeve's own history (none expected) with rf
        self.X = {c: self.W[c].fillna(self.W["rf"]).values for c in self.W.columns}

    def _blocks(self, rng, n_paths):
        """Block starts and lengths for n_paths paths of self.days sessions."""
        L = rng.choice(BLOCKS, size=(n_paths, self.days // min(BLOCKS) + 2))
        S = rng.random(size=L.shape)
        S2 = rng.random(size=L.shape)       # independent draw for a sleeve's own-history fill
        return L, (S, S2)

    def _index(self, L, S, first):
        """Session index array (paths x days) for a sleeve whose history starts at `first`."""
        S, S2 = S
        P, K = L.shape
        idx = np.empty((P, self.days), dtype=np.int32)
        for p in range(P):
            pos = 0
            for k in range(K):
                ln = int(L[p, k])
                s = int(S[p, k] * (self.n - ln))
                if s < first:           # block lies (partly) before the sleeve exists: draw from its history
                    s = first + int(S2[p, k] * (self.n - ln - first))
                take = min(ln, self.days - pos)
                idx[p, pos:pos + take] = np.arange(s, s + take)
                pos += take
                if pos >= self.days:
                    break
        return idx

    def run(self, books: dict, bench: str = "SPY", governors: dict | None = None, gov_books=(),
            gov_years=20):
        rng = np.random.default_rng(self.seed)
        ok_books = {b: w for b, w in books.items()
                    if all(self.cover.get(k, 0) >= self.min_cover for k in w)}
        res = {b: {} for b in ok_books}
        gres = {}
        firsts = sorted({self.first[k] for w in ok_books.values() for k in w} | {0})
        for c0 in range(0, self.n_paths, self.chunk):
            npth = min(self.chunk, self.n_paths - c0)
            L, S = self._blocks(rng, npth)
            IDX = {f: self._index(L, S, f) for f in firsts}
            base = IDX[0]
            rf = self.X["rf"][base]
            bench_lw = np.cumsum(np.log1p(self.X[bench][base]), axis=1)
            for b, w in ok_books.items():
                r = rf * (1 - sum(w.values()))
                for k, v in w.items():
                    r = r + v * self.X[k][IDX[self.first[k]]]
                lw = np.cumsum(np.log1p(np.maximum(r, -0.999999)), axis=1)
                _collect(res[b], lw, bench_lw)
                if governors and b in gov_books:
                    D = gov_years * TD
                    for gname, gfun in governors.items():
                        lwg = governed(r[:, :D], rf[:, :D], gfun)
                        _collect(gres.setdefault((b, gname), {}), lwg, bench_lw[:, :D], horizons=(5, 10, 20),
                                 multiples=())
        fill = {b: {k: 1 - self.cover[k] for k in w} for b, w in ok_books.items()}
        return res, gres, fill


def _collect(store, lw, bench_lw, horizons=HORIZONS, multiples=MULTIPLES):
    runmax = np.maximum.accumulate(np.maximum(lw, 0.0), axis=1)
    ddlog = runmax - lw
    for H in horizons:
        D = H * TD
        if D > lw.shape[1]:
            continue
        g = lw[:, D - 1] / H
        gb = bench_lw[:, D - 1] / H
        store.setdefault(f"cagr_{H}", []).append(np.expm1(g))
        store.setdefault(f"bench_{H}", []).append(np.expm1(gb))
        store.setdefault(f"maxdd_{H}", []).append(-np.expm1(-ddlog[:, :D].max(axis=1)))
        store.setdefault(f"end_{H}", []).append(np.exp(lw[:, D - 1]))
    for m in multiples:
        hit = lw >= np.log(m)
        t = np.where(hit.any(axis=1), hit.argmax(axis=1) + 1, np.inf) / TD
        store.setdefault(f"t{m}x", []).append(t)


def summarize(res: dict, fill: dict | None = None, horizons=HORIZONS, multiples=MULTIPLES,
              max_years=50) -> pd.DataFrame:
    rows = []
    for b, st in res.items():
        a = {k: np.concatenate(v) for k, v in st.items()}
        for H in horizons:
            if f"cagr_{H}" not in a:
                continue
            c, cb, dd, end = a[f"cagr_{H}"], a[f"bench_{H}"], a[f"maxdd_{H}"], a[f"end_{H}"]
            row = dict(book=b, horizon=H, median_cagr=np.median(c), p10_cagr=np.percentile(c, 10),
                       p90_cagr=np.percentile(c, 90), bench_median_cagr=np.median(cb),
                       p_beat_spy=np.mean(c > cb), p_beat_spy_5pts=np.mean(c - cb >= 0.05),
                       p_dd_gt_50=np.mean(dd > 0.5), p_dd_gt_80=np.mean(dd > 0.8), median_maxdd=np.median(dd),
                       p_below_start=np.mean(end < 1), median_multiple=np.median(end),
                       p_10x=np.mean(end >= 10))
            if fill:
                row["filled_share"] = max(fill[b].values()) if fill.get(b) else 0.0
            rows.append(row)
    T = pd.DataFrame(rows)
    trows = []
    for b, st in res.items():
        a = {k: np.concatenate(v) for k, v in st.items()}
        row = dict(book=b)
        for m in multiples:
            if f"t{m}x" not in a:
                continue
            t = a[f"t{m}x"]
            for q, lab in ((50, "median"), (10, "p10"), (90, "p90")):
                v = np.percentile(t, q)
                row[f"t{m}x_{lab}"] = v if np.isfinite(v) else np.nan    # NaN = beyond max_years
            row[f"t{m}x_share_reached"] = np.mean(np.isfinite(t))
        trows.append(row)
    return T, pd.DataFrame(trows)


# ----------------------------------------------------------------------------- governor
def g_design(dd):
    """Design s4: G = 1 to a 5% drawdown, linear to 0.25 at 15%, 0.25 beyond."""
    return np.clip(1 - 0.75 * (dd - 0.05) / 0.10, 0.25, 1.0)


def g_wide(dd):
    """Scaled to a leveraged book: 1 to a 20% drawdown, linear to 0.25 at 50%."""
    return np.clip(1 - 0.75 * (dd - 0.20) / 0.30, 0.25, 1.0)


def g_floor(dd, floor=0.5):
    """Grossman-Zhou style: exposure proportional to the cushion above a floor at 50% of the peak."""
    return np.clip((1 - dd - floor) / (1 - floor), 0.0, 1.0)


def governed(r, rf, gfun, every=5):
    """Scale the book's excess over T-bills by G(drawdown), re-set every `every` sessions (weekly)."""
    P, D = r.shape
    lw = np.zeros((P, D))
    cur, peak, G = np.zeros(P), np.zeros(P), np.ones(P)
    for t in range(D):
        if t % every == 0:
            G = gfun(1 - np.exp(cur - peak))
        cur = cur + np.log1p(np.maximum(rf[:, t] + G * (r[:, t] - rf[:, t]), -0.999999))
        peak = np.maximum(peak, cur)
        lw[:, t] = cur
    return lw


# ----------------------------------------------------------------------------- Kelly
def kelly(R: pd.DataFrame, sleeves: list, start=None, end=None, cap_total=1.0, x0=None):
    """Weights (>= 0, sum <= cap_total) maximising mean daily log growth, on the joint history."""
    X = R.loc[start:end, sleeves + ["rf"]].dropna()
    ex = (X[sleeves].values - X[["rf"]].values)
    rf = X["rf"].values

    def f(w):
        g = rf + ex @ w
        return -np.mean(np.log1p(np.maximum(g, -0.999999)))

    def grad(w):
        g = rf + ex @ w
        return -(ex / (1 + g)[:, None]).mean(axis=0)

    n = len(sleeves)
    best = None
    starts = [np.full(n, cap_total / n / 2)] + ([np.asarray(x0)] if x0 is not None else [])
    starts += [np.eye(n)[i] * cap_total * 0.9 for i in range(n)]
    for s0 in starts:
        r = minimize(f, s0, jac=grad, method="SLSQP", bounds=[(0, cap_total)] * n,
                     constraints=[{"type": "ineq", "fun": lambda w: cap_total - w.sum()}],
                     options=dict(maxiter=500, ftol=1e-12))
        if best is None or r.fun < best.fun:
            best = r
    w = np.clip(best.x, 0, None)
    w[w < 1e-4] = 0.0
    g = -f(w) * TD
    return dict(zip(sleeves, w)), g, (X.index[0], X.index[-1])


def growth_of(R, w, start=None, end=None):
    """Annualised log growth (and CAGR) of a daily-rebalanced book on the real path."""
    r = book_daily(R.loc[start:end], w).dropna()
    g = np.log1p(r).mean() * TD
    return g, np.expm1(g)


def exposure_kelly(r_sleeve: pd.Series, rf: pd.Series, e_max=10.0):
    """Full-Kelly exposure to one sleeve's excess return (continuous leverage, no extra costs)."""
    x = pd.concat([r_sleeve, rf], axis=1).dropna().values
    ex, f = x[:, 0] - x[:, 1], x[:, 1]
    grid = np.linspace(0, e_max, 401)
    g = [np.mean(np.log1p(np.maximum(f + e * ex, -0.999999))) * TD for e in grid]
    i = int(np.argmax(g))
    return grid[i], g[i], g
