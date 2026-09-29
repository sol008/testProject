"""s04 - multiple testing: how much of the in-sample edge survives the search?

Uses the in-sample daily returns of every s01 variant (cached by s01).
  1. Variant count (raw) and an effective number of independent trials
     (participation ratio of the correlation eigenvalues).
  2. Deflated Sharpe ratio (Bailey & Lopez de Prado 2014) for the recommended rule, on
     (a) Sharpe vs T-bills and (b) the information ratio of daily log excess return vs SPY.
  3. White's (2000) reality check, stationary bootstrap (mean block 250 days, 1000 draws), on the
     mean daily log excess return vs SPY, over all weekly/monthly variants of each index.
  4. Empirical shrinkage: regress OOS excess on IS excess across variants (same leverage),
     and predict the recommended rule's out-of-sample excess.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm, kurtosis, skew

import common as c

EULER = 0.5772156649
REC = {"SPX": "T|L3|sma200|W|b2", "NDX": "T|L3|sma200|W|b2"}
ALSO = {"SPX": ["T|L2|sma200|W|b2", "T|L3|sma50|W|b3|vix40"], "NDX": ["T|L2|sma200|W|b2", "T|L3|either|W|b3|vix30"]}


def expected_max_sr(var_sr: float, n: float) -> float:
    return np.sqrt(var_sr) * ((1 - EULER) * norm.ppf(1 - 1 / n) + EULER * norm.ppf(1 - 1 / (n * np.e)))


def dsr(x: np.ndarray, sr_all: np.ndarray, n: float) -> tuple[float, float, float]:
    """x: daily series of the selected rule; sr_all: per-day SRs of all trials.  Returns
    (annualised SR, annualised SR0 = expected max under the null, DSR probability)."""
    sr = x.mean() / x.std()
    sr0 = expected_max_sr(np.var(sr_all), n)
    g3, g4 = skew(x), kurtosis(x, fisher=False)
    T = len(x)
    z = (sr - sr0) * np.sqrt(T - 1) / np.sqrt(1 - g3 * sr + (g4 - 1) / 4 * sr ** 2)
    return sr * np.sqrt(c.TD), sr0 * np.sqrt(c.TD), float(norm.cdf(z))


def psr(x: np.ndarray) -> float:
    return dsr(x, np.array([0.0, 0.0]), 2)[2] if False else float(norm.cdf(
        (x.mean() / x.std()) * np.sqrt(len(x) - 1) / np.sqrt(1 - skew(x) * x.mean() / x.std()
                                                             + (kurtosis(x, fisher=False) - 1) / 4 * (x.mean() / x.std()) ** 2)))


def reality_check(D: np.ndarray, reps: int = 1000, block: int = 250, seed: int = 7) -> tuple[np.ndarray, float]:
    """White's RC on columns of D (T x K, daily log excess vs benchmark).  Returns the per-column
    'single test' bootstrap p-values and the RC p-value for the best column."""
    rng = np.random.default_rng(seed)
    T, K = D.shape
    mu = D.mean(0)
    stat = np.sqrt(T) * mu.max()
    cs = np.vstack([np.zeros((1, K)), np.cumsum(D, 0)])
    tot = cs[-1]
    mx = np.empty(reps)
    single = np.zeros(K)
    for b in range(reps):
        s = np.zeros(K)
        n = 0
        while n < T:
            st = rng.integers(0, T)
            ln = min(rng.geometric(1 / block), T - n)
            end = st + ln
            if end <= T:
                s += cs[end] - cs[st]
            else:           # wrap around
                s += (tot - cs[st]) + cs[end - T]
            n += ln
        m = s / T
        v = np.sqrt(T) * (m - mu)
        mx[b] = v.max()
        single += (v >= np.sqrt(T) * mu)
    return single / reps, float((mx >= stat).mean())


def main():
    g = pd.read_csv(c.OUT / "s01_grid.csv.gz")
    rows, shrink = [], []
    for name in ["SPX", "NDX"]:
        gi = g[g["index"] == name].reset_index(drop=True)
        M = np.load(c.CACHE_DIR / f"s01_is_returns_{name}.npy").astype(np.float64)
        dates = pd.to_datetime(pd.read_csv(c.CACHE_DIR / f"s01_is_dates_{name}.csv").iloc[:, 0])
        df = (c.spx_panel() if name == "SPX" else c.ndx_panel()).loc[dates]
        rf = df.rf.values[:, None]
        spy = df.spy.values[:, None]
        EX = M - rf                                   # excess over T-bills
        D = np.log1p(M) - np.log1p(spy)               # log excess vs SPY
        comp = gi.freq.isin(["W", "M"]).values        # <= 1 recommendation a week
        # effective number of trials
        # effective number of trials = participation ratio of the eigenvalues of the correlation
        # matrix of the variants' excess-vs-SPY series (the quantity being selected on)
        corr = np.corrcoef(D[:, comp].T)
        ev = np.clip(np.linalg.eigvalsh(np.nan_to_num(corr)), 0, None)
        n_eff = ev.sum() ** 2 / (ev ** 2).sum()
        sr_all = EX.mean(0) / EX.std(0)
        ir_all = D.mean(0) / D.std(0)
        # reality check over the compliant variants
        single_p, rc_p = reality_check(D[:, comp])
        compl_labels = gi.variant[comp].values
        best_is = compl_labels[np.argmax(D[:, comp].mean(0))]
        for lab in [REC[name]] + ALSO[name]:
            j = int(np.flatnonzero(gi.variant.values == lab)[0])
            for n_trials, tag in [(len(gi), "raw N (all cells)"), (comp.sum(), "N compliant"), (n_eff, "effective N")]:
                sr, sr0, p = dsr(EX[:, j], sr_all[comp], n_trials)
                ir, ir0, pir = dsr(D[:, j], ir_all[comp], n_trials)
                rows.append(dict(index=name, rule=lab, trials=tag, N=round(float(n_trials), 1), sharpe_is=sr,
                                 sharpe_needed=sr0, dsr_prob=p, ir_vs_spy_is=ir, ir_needed=ir0, dsr_prob_vs_spy=pir,
                                 psr_vs_spy_single=psr(D[:, j]),
                                 boot_p_single_vs_spy=float(single_p[list(compl_labels).index(lab)]) if lab in compl_labels else np.nan,
                                 rc_p_best_of_all=rc_p, is_best_by_excess=best_is, n_eff=n_eff))
        # empirical IS -> OOS shrinkage within each leverage level (compliant trend variants)
        for L in [1.5, 2, 3]:
            x = gi[comp & (gi.L == L).values]
            b, a = np.polyfit(x.is_excess, x.oos_excess, 1)
            rec = gi[gi.variant == REC[name].replace("L3", f"L{L:g}")]
            pred = a + b * float(rec.is_excess.iloc[0]) if len(rec) else np.nan
            shrink.append(dict(index=name, L=L, n=len(x), slope_oos_on_is=b, intercept=a,
                               mean_is_excess=x.is_excess.mean(), mean_oos_excess=x.oos_excess.mean(),
                               rule=rec.variant.iloc[0] if len(rec) else "", rule_is_excess=float(rec.is_excess.iloc[0]) if len(rec) else np.nan,
                               rule_oos_excess=float(rec.oos_excess.iloc[0]) if len(rec) else np.nan, predicted_oos_excess=pred))
    t = pd.DataFrame(rows)
    t.to_csv(c.OUT / "s04_deflated_sharpe_rc.csv", index=False, float_format="%.4f")
    s = pd.DataFrame(shrink)
    s.to_csv(c.OUT / "s04_shrinkage.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 260, "display.max_columns", 30):
        print(t.round(3).to_string(index=False))
        print(s.round(4).to_string(index=False))
    print("variant cells in s01:", len(g), "; per index:", len(g) // 2)


if __name__ == "__main__":
    main()
