"""Q6: the verdict. Shrinks the best in-sample results for multiple testing and for today's valuations,
and estimates the probability of beating the US market by >= 5 points a year over 10 years.

Multiple testing: 'best of N random pickers'. Each year (annual JST universe) or month (ETF universe)
a random eligible asset is held instead of the momentum leader, with the same costs. We draw 2,000
random rules and report the distribution of their excess CAGR vs the US and the expected best of N,
where N is the number of variants actually tested in q3.

Probability of a >= 5-point 10-year win: stationary block bootstrap (mean block 3 years) of the annual
excess log-returns of the headline rules, with the mean excess shrunk by kappa (0.5) and the
valuation drag; 20,000 ten-year paths.

Outputs: q6_random_pickers.csv, q6_verdict.csv
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import data36 as D
from q3_meta_rule import annual_universe, monthly_universe, run_annual

OUT = D.RESULTS
RNG = np.random.default_rng(36)
KAPPA = 0.5


def random_annual(u: pd.DataFrame, bills: pd.Series, n: int = 2000, cost: float = 0.005) -> np.ndarray:
    """Excess CAGR vs US equities of n random top-1 annual pickers (all assets), 1871–2020."""
    us = u["USA eq"]
    yrs = [y for y in u.index[:-1] if y + 1 in u.index]
    elig = {t: list(u.columns[u.loc[t].notna() & u.loc[t + 1].notna()]) for t in yrs}
    out = np.empty(n)
    for j in range(n):
        lw, lu, prev = 0.0, 0.0, None
        for t in yrs:
            cands = elig[t]
            if not cands:
                continue
            c = cands[RNG.integers(len(cands))]
            r = float(u.loc[t + 1, c]) - cost * (2 if prev is not None and c != prev else (1 if prev is None else 0))
            prev = c
            lw += np.log1p(max(r, -0.99))
            lu += np.log1p(float(us.loc[t + 1])) if pd.notna(us.loc[t + 1]) else 0.0
        ny = len(yrs)
        out[j] = np.exp(lw / ny) - np.exp(lu / ny)
    return out


def random_monthly(R: pd.DataFrame, rb: pd.Series, lvl: pd.DataFrame, n: int = 2000) -> np.ndarray:
    R = R[R.index >= "1996-07-31"]
    spy = R["SPY"]
    sma_ok = (lvl > lvl.rolling(10).mean()).reindex(R.index)
    out = np.empty(n)
    idx = R.index
    valid = R.notna().values
    ok = (sma_ok.fillna(False).values & valid)
    cols = list(R.columns)
    for j in range(n):
        lw, ls = 0.0, 0.0
        for i in range(len(idx) - 1):
            cand = np.where(ok[i] & valid[i + 1])[0]
            if len(cand) == 0:
                r = float(rb.iloc[i + 1])
            else:
                c = cand[RNG.integers(len(cand))]
                r = float(R.iloc[i + 1, c]) - (0.006 if cols[c] == "BTC" else 0.001) * 2
            lw += np.log1p(max(r, -0.99))
            ls += np.log1p(float(spy.iloc[i + 1]))
        ny = (len(idx) - 1) / 12
        out[j] = np.exp(lw / ny) - np.exp(ls / ny)
    return out


def expected_max_of(sample: np.ndarray, n_tested: int, draws: int = 4000) -> float:
    m = np.empty(draws)
    for i in range(draws):
        m[i] = RNG.choice(sample, n_tested, replace=True).max()
    return float(m.mean())


def block_bootstrap_prob(excess_annual: np.ndarray, shrink_to_mean: float, years: int = 10, n: int = 20000,
                         mean_block: float = 3.0, margin: float = 0.05) -> dict:
    x = np.asarray(excess_annual, float)
    x = x - x.mean() + shrink_to_mean  # recentre on the shrunk mean (log excess)
    L = len(x)
    res = np.empty(n)
    p = 1.0 / mean_block
    for j in range(n):
        path, i = [], RNG.integers(L)
        while len(path) < years:
            path.append(x[i])
            i = RNG.integers(L) if RNG.random() < p else (i + 1) % L
        res[j] = np.exp(np.mean(path)) - 1
    return {"p_beat": float((res > 0).mean()), f"p_beat_{int(margin*100)}pt": float((res >= margin).mean()),
            "p_lose_5pt": float((res <= -margin).mean()), "median_10y_excess": float(np.median(res))}


def run() -> None:
    ann = pd.read_csv(os.path.join(OUT, "q3_annual_grid.csv"), index_col=0)
    mon = pd.read_csv(os.path.join(OUT, "q3_monthly_grid.csv"), index_col=0)
    ann_ser = pd.read_csv(os.path.join(OUT, "q3_annual_series.csv"), index_col=0)
    mon_ser = pd.read_csv(os.path.join(OUT, "q3_monthly_series.csv"), index_col=0, parse_dates=True)

    u, bills = annual_universe()
    R, rb, lvl = monthly_universe()
    ra = random_annual(u, bills)
    rm = random_monthly(R, rb, lvl)
    n_ann = int(ann["lev"].notna().sum()) if "lev" in ann else 48
    n_mon = int(mon["lev"].notna().sum()) if "lev" in mon else 45
    rp = pd.DataFrame({
        "universe": ["annual JST 1871-2020 (top-1, all assets)", "monthly ETF era 1996-2026 (top-1, SMA filter)"],
        "n_random_rules": [len(ra), len(rm)],
        "random_excess_mean": [ra.mean(), rm.mean()], "random_excess_p50": [np.median(ra), np.median(rm)],
        "random_excess_p95": [np.quantile(ra, 0.95), np.quantile(rm, 0.95)], "random_excess_p99": [np.quantile(ra, 0.99), np.quantile(rm, 0.99)],
        "n_variants_tested": [n_ann, n_mon],
        "expected_best_of_n_random": [expected_max_of(ra, n_ann), expected_max_of(rm, n_mon)],
    })
    one_x_ann = ann[(ann.get("lev") == 1.0)]
    one_x_mon = mon[(mon.get("lev") == 1.0)]
    rp["best_tested_1x_excess"] = [one_x_ann["excess_vs_us"].max(), one_x_mon["excess_vs_spy"].max()]
    rp["best_tested_1x_rule"] = [one_x_ann["excess_vs_us"].idxmax(), one_x_mon["excess_vs_spy"].idxmax()]
    rp["share_random_beating_best_tested"] = [float((ra >= rp.best_tested_1x_excess[0]).mean()), float((rm >= rp.best_tested_1x_excess[1]).mean())]
    rp.to_csv(os.path.join(OUT, "q6_random_pickers.csv"), index=False)
    print("Random pickers vs the best tested rule:")
    print(rp.T.to_string())

    # ---- probability of a >= 5-point 10-year win, from the headline series
    rows = []
    us = ann_ser["US eq"]
    spy = mon_ser["SPY"]
    spy_ann = (1 + spy).groupby(spy.index.year).prod() - 1
    cases = [
        ("century: all assets, L1 top1, trend exit, 1x", ann_ser["all_L1_top1_exit_1x"], us, 1),
        ("century: all assets, L1 top3, trend exit, 1x", ann_ser["all_L1_top3_exit_1x"], us, 1),
        ("century: best tested 1x variant", ann_ser[one_x_ann["excess_vs_us"].idxmax()], us, 1),
        ("ETF era: all assets, top1, monthly, SMA exit, 1x", mon_ser["all_top1_M_1x"], spy, 12),
        ("ETF era: all assets, top3, monthly, SMA exit, 1x", mon_ser["all_top3_M_1x"], spy, 12),
        ("ETF era: no bitcoin, top3, monthly, 1x", mon_ser["no_btc_top3_M_1x"], spy, 12),
        ("ETF era: best tested 1x variant", mon_ser[one_x_mon["excess_vs_spy"].idxmax()], spy, 12),
        ("ETF era: all assets, top1, monthly, 2x", mon_ser["all_top1_M_2x"], spy, 12),
    ]
    for name, s, b, ppy in cases:
        s = s.dropna()
        if ppy == 12:
            s = (1 + s).groupby(s.index.year).prod() - 1
            b = spy_ann
            full_years = s.index[(s.index > s.index[0]) & (s.index < 2026)]
            s = s.loc[full_years]
        a = pd.concat([s, b], axis=1).dropna()
        ex = np.log1p(a.iloc[:, 0].clip(lower=-0.99)) - np.log1p(a.iloc[:, 1])
        raw_mean = float(ex.mean())
        raw = block_bootstrap_prob(ex.values, raw_mean)
        shr = block_bootstrap_prob(ex.values, KAPPA * raw_mean)
        zero = block_bootstrap_prob(ex.values, 0.0)
        rows.append({"case": name, "years": len(ex), "hist_excess_cagr": float(np.exp(raw_mean) - 1),
                     "hist_share_10y_beat_5pt": D.rolling_10y_share(a.iloc[:, 0], a.iloc[:, 1], 1).get("share_beat_5pt", np.nan),
                     "p_beat_5pt_raw": raw["p_beat_5pt"], "p_beat_5pt_shrunk": shr["p_beat_5pt"], "p_beat_5pt_if_no_edge": zero["p_beat_5pt"],
                     "p_beat_raw": raw["p_beat"], "p_beat_shrunk": shr["p_beat"], "p_lose_5pt_shrunk": shr["p_lose_5pt"],
                     "median_10y_excess_shrunk": shr["median_10y_excess"]})
    v = pd.DataFrame(rows).set_index("case")
    v.to_csv(os.path.join(OUT, "q6_verdict.csv"))
    with pd.option_context("display.width", 300, "display.max_columns", 30):
        print("\nProbability of beating the US market over 10 years (block bootstrap, kappa=%.1f):" % KAPPA)
        print(v.round(3).to_string())


if __name__ == "__main__":
    run()
