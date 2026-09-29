"""Track 33 (strategy zoo): statistics, rankings, out-of-sample re-ranking, selection-bias
corrections (deflated Sharpe ratio, White's reality check), rolling 5-year windows, walk-forward
selection and block bootstrap."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.stats import norm, spearmanr

WPY = 365.25 / 7.0          # weeks per year
LN2W = math.log(2.0) / WPY  # weekly log growth of +100% a year


class Frame:
    """Weekly returns of all variants: M (K x N), with period start/end dates."""

    def __init__(self, z, reg):
        self.z = z
        self.meta = pd.DataFrame(reg.rows)
        self.M = np.vstack(reg.rets).T.astype(np.float64)        # (K, N)
        self.start = z.start
        self.end = z.end
        self.cash = z.Rcash
        self.K, self.N = self.M.shape
        self.yr = z.end.year.values
        last_full = pd.Timestamp(z.end[-1]).year - 1
        self.year_rng = {}
        for y in np.unique(self.yr):
            if y > last_full:
                continue
            idx = np.flatnonzero(self.yr == y)
            self.year_rng[int(y)] = (idx[0], idx[-1])

    def k_of(self, date: str) -> int:
        return int(np.searchsorted(self.start.values, np.datetime64(pd.Timestamp(date))))

    def k_end(self, date: str) -> int:
        """Index of the last period ending on or before date (inclusive)."""
        return int(np.searchsorted(self.end.values, np.datetime64(pd.Timestamp(date)), side="right")) - 1


def perf(fr: Frame, j: int, ka: int | None = None, kb: int | None = None, yearly=True, strict=True) -> dict:
    """Stats for variant j over periods [ka, kb] (inclusive).  strict: must be live at ka."""
    r_all = fr.M[:, j]
    live = ~np.isnan(r_all)
    if not live.any():
        return {}
    f, l = int(np.argmax(live)), int(len(live) - 1 - np.argmax(live[::-1]))
    if ka is None:
        ka = f
    if kb is None:
        kb = l
    if strict and f > ka:
        return {}
    ka, kb = max(ka, f), min(kb, l)
    if kb - ka < 26:
        return {}
    r = np.nan_to_num(r_all[ka:kb + 1])
    c = fr.cash[ka:kb + 1]
    yrs = (fr.end[kb] - fr.start[ka]).days / 365.25
    eq = np.cumprod(1 + r)
    mult = eq[-1]
    cagr = mult ** (1 / yrs) - 1 if mult > 0 else -1.0
    dd = float((eq / np.maximum.accumulate(np.maximum(eq, 1e-300)) - 1).min())
    ex = r - c
    sd = r.std(ddof=1)
    out = dict(start=fr.start[ka].date(), end=fr.end[kb].date(), years=round(yrs, 2), cagr=cagr, mult=mult,
               maxdd=dd, vol=sd * math.sqrt(WPY), sharpe=ex.mean() / sd * math.sqrt(WPY) if sd > 0 else np.nan)
    if yearly:
        ys = [(y, np.prod(1 + np.nan_to_num(r_all[a:b + 1])) - 1) for y, (a, b) in fr.year_rng.items()
              if a >= ka and b <= kb and live[a:b + 1].all()]
        if ys:
            v = np.array([x[1] for x in ys])
            out.update(n_years=len(v), median_yr=float(np.median(v)), best_yr=float(v.max()), worst_yr=float(v.min()),
                       best_year=int(ys[int(v.argmax())][0]), worst_year=int(ys[int(v.argmin())][0]),
                       share_ge100=float((v >= 1.0).mean()), share_le_m50=float((v <= -0.5).mean()))
        lr = np.log1p(np.maximum(r, -0.999999))
        n5 = 261
        if len(lr) >= n5:
            cs = np.concatenate([[0.0], np.cumsum(lr)])
            roll = np.exp((cs[n5:] - cs[:-n5]) / 5.0) - 1
            i = int(roll.argmax())
            out.update(max5y_cagr=float(roll.max()), max5y_from=fr.start[ka + i].date(),
                       min5y_cagr=float(roll.min()))
    return out


def window_table(fr: Frame, ka=None, kb=None, strict=True, yearly=True) -> pd.DataFrame:
    rows = []
    for j in range(fr.N):
        s = perf(fr, j, ka, kb, yearly=yearly, strict=strict)
        if s:
            s["id"] = j
            rows.append(s)
    return pd.DataFrame(rows).set_index("id")


# ------------------------------------------------------------------------ selection bias
def deflated_sharpe(fr: Frame, ids, ka, kb, j_stars) -> pd.DataFrame:
    """Bailey & Lopez de Prado (2014) deflated Sharpe ratio for each variant in j_stars, treating all
    `ids` as the trials; reported with N = all trials and with N_eff = the participation ratio of the
    eigenvalues of the trials' return-correlation matrix (an effective number of independent trials)."""
    ids = list(ids)
    X = np.nan_to_num(fr.M[ka:kb + 1][:, ids]) - fr.cash[ka:kb + 1][:, None]
    sd = X.std(axis=0, ddof=1)
    sr = np.where(sd > 0, X.mean(axis=0) / np.where(sd > 0, sd, 1), 0.0)          # weekly SR
    T = X.shape[0]
    V = sr.var(ddof=1)
    Zs = (X[:, sd > 0] - X[:, sd > 0].mean(axis=0)) / sd[sd > 0]
    ev = np.linalg.svd(Zs, compute_uv=False) ** 2 / (T - 1)       # eigenvalues of the correlation matrix
    n_eff = float(ev.sum() ** 2 / (ev ** 2).sum())
    em = 0.5772156649
    rows = []
    pos = {j: i for i, j in enumerate(ids)}
    for j in j_stars:
        x = X[:, pos[j]]
        s_star = x.mean() / x.std(ddof=1)
        g3 = float(pd.Series(x).skew())
        g4 = float(pd.Series(x).kurt()) + 3.0
        den = math.sqrt(max(1 - g3 * s_star + (g4 - 1) / 4 * s_star ** 2, 1e-9))
        res = dict(id=j, sr_ann=s_star * math.sqrt(WPY), T_weeks=T, skew=g3, kurt=g4,
                   psr_vs_0=float(norm.cdf(s_star * math.sqrt(T - 1) / den)), n_trials=len(ids), n_eff=n_eff)
        for lab, N in (("N", len(ids)), ("Neff", max(n_eff, 2.0))):
            sr0 = math.sqrt(V) * ((1 - em) * norm.ppf(1 - 1 / N) + em * norm.ppf(1 - 1 / (N * math.e)))
            res[f"sr0_ann_{lab}"] = sr0 * math.sqrt(WPY)
            res[f"dsr_{lab}"] = float(norm.cdf((s_star - sr0) * math.sqrt(T - 1) / den))
        rows.append(res)
    return pd.DataFrame(rows).set_index("id")


def stationary_indices(T, B, mean_block, rng):
    p = 1.0 / mean_block
    idx = np.empty((B, T), dtype=np.int64)
    idx[:, 0] = rng.integers(0, T, B)
    jump = rng.random((B, T)) < p
    new = rng.integers(0, T, (B, T))
    for t in range(1, T):
        idx[:, t] = np.where(jump[:, t], new[:, t], (idx[:, t - 1] + 1) % T)
    return idx


def reality_check(F: np.ndarray, B=1000, mean_block=13, seed=7) -> dict:
    """White (2000) reality check.  F: (T, N) performance differentials (positive = better than the
    benchmark/hurdle).  H0: no variant has a positive mean.  Returns the p-value of the best one."""
    T, N = F.shape
    rng = np.random.default_rng(seed)
    mu = F.mean(axis=0)
    V = math.sqrt(T) * mu.max()
    idx = stationary_indices(T, B, mean_block, rng)
    vstar = np.empty(B)
    for b in range(B):
        vstar[b] = math.sqrt(T) * (F[idx[b]].mean(axis=0) - mu).max()
    return dict(stat=V, best=int(mu.argmax()), best_mean_ann=float(mu.max() * WPY), p_value=float((vstar >= V).mean()),
                T=T, N=N)


# ------------------------------------------------------------------------ walk-forward selection
def walk_forward(fr: Frame, first_year=2001, look=156, top=(1, 10), ids=None) -> tuple[pd.DataFrame, dict]:
    """Each January pick the variant(s) with the best trailing `look`-week CAGR among variants live
    for the whole look-back; hold them (equal weight) for the calendar year."""
    ids = np.arange(fr.N) if ids is None else np.asarray(ids)
    years = sorted(y for y in set(fr.start.year) if y >= first_year)
    series = {n: np.full(fr.K, np.nan) for n in top}
    picks = []
    for y in years:
        k0 = fr.k_of(f"{y}-01-01")
        if k0 - look < 0 or k0 >= fr.K:
            continue
        k1 = min(fr.k_of(f"{y + 1}-01-01"), fr.K)
        W = fr.M[k0 - look:k0][:, ids]
        ok = ~np.isnan(W).any(axis=0)
        if not ok.any():
            continue
        score = np.where(ok, np.log1p(np.maximum(np.nan_to_num(W), -0.999999)).sum(axis=0), -np.inf)
        order = np.argsort(-score)
        for n in top:
            sel = ids[order[:n]]
            blk = fr.M[k0:k1][:, sel]
            blk = np.where(np.isnan(blk), fr.cash[k0:k1][:, None], blk)
            series[n][k0:k1] = blk.mean(axis=1)
        j = ids[order[0]]
        yr_ret = np.prod(1 + np.nan_to_num(fr.M[k0:k1, j])) - 1
        picks.append(dict(year=y, pick=fr.meta.loc[j, "name"], family=fr.meta.loc[j, "family"],
                          trailing_3y_cagr=math.exp(score[order[0]] / (look / WPY)) - 1, next_year_return=yr_ret,
                          top10_next_year=np.prod(1 + series[10][k0:k1]) - 1 if 10 in series else np.nan))
    return pd.DataFrame(picks), series


def series_stats(fr: Frame, r: np.ndarray, a=None, b=None) -> dict:
    ka = fr.k_of(a) if a else int(np.argmax(~np.isnan(r)))
    kb = fr.k_end(b) if b else fr.K - 1
    x = np.nan_to_num(r[ka:kb + 1])
    yrs = (fr.end[kb] - fr.start[ka]).days / 365.25
    eq = np.cumprod(1 + x)
    lr = np.log1p(np.maximum(x, -0.999999))
    out = dict(start=fr.start[ka].date(), end=fr.end[kb].date(), years=round(yrs, 2),
               cagr=eq[-1] ** (1 / yrs) - 1 if eq[-1] > 0 else -1, maxdd=float((eq / np.maximum.accumulate(eq) - 1).min()))
    if len(lr) >= 261:
        cs = np.concatenate([[0.0], np.cumsum(lr)])
        roll = np.exp((cs[261:] - cs[:-261]) / 5.0) - 1
        out.update(max5y_cagr=float(roll.max()), max5y_from=fr.start[ka + int(roll.argmax())].date())
    return out


# ------------------------------------------------------------------------ bootstrap
def block_bootstrap(r: np.ndarray, weeks=261, block=26, n=10000, seed=11) -> dict:
    r = r[~np.isnan(r)]
    T = len(r)
    rng = np.random.default_rng(seed)
    nb = int(math.ceil(weeks / block))
    starts = rng.integers(0, T, (n, nb))
    idx = (starts[:, :, None] + np.arange(block)[None, None, :]) % T
    idx = idx.reshape(n, -1)[:, :weeks]
    paths = np.cumprod(1 + r[idx], axis=1)
    term = paths[:, -1]
    peak = np.maximum.accumulate(np.concatenate([np.ones((n, 1)), paths], axis=1), axis=1)[:, 1:]
    mdd = (paths / peak - 1).min(axis=1)
    cagr = np.where(term > 0, term, 1e-12) ** (1 / 5.0) - 1
    return dict(n_weeks_source=T, p_5y_cagr_ge100=float((term >= 32).mean()), p_5y_cagr_ge50=float((term >= 1.5 ** 5).mean()),
                p_maxdd_ge80=float((mdd <= -0.8).mean()), p_end_loss_ge80=float((term <= 0.2).mean()),
                p_end_below_start=float((term < 1).mean()), median_5y_cagr=float(np.median(cagr)),
                p10_5y_cagr=float(np.quantile(cagr, 0.1)), p90_5y_cagr=float(np.quantile(cagr, 0.9)))


def is_oos(fr: Frame, a: str, mid: str, b: str, ids=None, top=10) -> tuple[pd.DataFrame, dict]:
    """Choose on [a, mid), test on [mid, b]; variants must be live at a."""
    ka, km, kb = fr.k_of(a), fr.k_of(mid), fr.k_end(b)
    ids = range(fr.N) if ids is None else ids
    rows = []
    for j in ids:
        s1 = perf(fr, j, ka, km - 1, yearly=False)
        if not s1:
            continue
        s2 = perf(fr, j, km, kb, yearly=False, strict=False)
        if not s2:
            continue
        rows.append(dict(id=j, is_cagr=s1["cagr"], is_maxdd=s1["maxdd"], is_sharpe=s1["sharpe"],
                         oos_cagr=s2["cagr"], oos_maxdd=s2["maxdd"], oos_sharpe=s2["sharpe"]))
    t = pd.DataFrame(rows).set_index("id")
    t["is_rank"] = t.is_cagr.rank(ascending=False, method="first").astype(int)
    t["oos_rank"] = t.oos_cagr.rank(ascending=False, method="first").astype(int)
    rho = spearmanr(t.is_cagr, t.oos_cagr).correlation
    topt = t.sort_values("is_cagr", ascending=False).head(top).copy()
    summ = dict(window=f"IS {a}..{mid}, OOS {mid}..{b}", n=len(t), spearman_is_oos=float(rho),
                is_top10_mean_oos_cagr=float(topt.oos_cagr.mean()), all_median_oos_cagr=float(t.oos_cagr.median()),
                oos_best_cagr=float(t.oos_cagr.max()), oos_best_id=int(t.oos_cagr.idxmax()),
                is_best_oos_rank=int(topt.oos_rank.iloc[0]), ka=ka, km=km, kb=kb,
                n_is_ge100=int((t.is_cagr >= 1).sum()), n_oos_ge100=int((t.oos_cagr >= 1).sum()))
    return t, summ
