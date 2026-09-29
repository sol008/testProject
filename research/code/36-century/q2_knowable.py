"""Q2: was the decade's winner knowable in advance?

(a) Hit rates: does the country with the best trailing 1/3/5-year USD equity return at the decade's
    start turn out to be the decade's best market (top-1) or among its top-3?
(b) Cross-sectional rank correlation between entry momentum and the decade's CAGR.
(c) 'Hold the top-momentum country', re-decided every year, 1871–2020, vs the US and vs an
    equal-weight world (annual JST data). Quarterly re-decision is tested in q3 on monthly ETF data.

Outputs: q2_decade_hits.csv, q2_hit_summary.csv, q2_annual_rotation.csv, q2_rotation_series.csv
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
from scipy import stats

import data36 as D

OUT = D.RESULTS
COST = 0.005  # one-way cost per switch (decimal); 19th-century costs were higher


def trailing(eq: pd.DataFrame, year: int, L: int) -> pd.Series:
    w = eq[(eq.index > year - L) & (eq.index <= year)]
    ok = w.notna().sum() == L
    return ((1 + w).prod() - 1).where(ok)


def decade_cagr_matrix(eq: pd.DataFrame, min_years: int = 7) -> pd.DataFrame:
    rows = {}
    for dec, g in eq.groupby((eq.index // 10) * 10):
        n = g.notna().sum()
        rows[f"{dec}s"] = ((1 + g).prod() ** (1 / n) - 1).where(n >= min_years)
    return pd.DataFrame(rows).T


def hit_rates(eq: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    dm = decade_cagr_matrix(eq)
    rows = []
    for dec in dm.index:
        d0 = int(dec[:-1])
        if d0 < 1880 or d0 > 2010:
            continue
        actual = dm.loc[dec].dropna()
        if len(actual) < 5:
            continue
        winner = actual.idxmax()
        top3 = list(actual.sort_values(ascending=False).index[:3])
        for L in (1, 3, 5, 10):
            mom = trailing(eq, d0 - 1, L).dropna()
            mom = mom[mom.index.isin(actual.index)]
            if len(mom) < 5:
                continue
            pick = mom.idxmax()
            pick3 = list(mom.sort_values(ascending=False).index[:3])
            rho = stats.spearmanr(mom.values, actual[mom.index].values).correlation
            rows.append({"decade": dec, "lookback": L, "n": len(mom), "winner": winner, "winner_cagr": actual.max(),
                         "us_cagr": actual.get("USA", np.nan), "top_momentum": pick, "pick_cagr": actual[pick],
                         "hit_top1": int(pick == winner), "hit_pick_in_top3": int(pick in top3),
                         "hit_any_top3_pick_wins": int(winner in pick3), "pick_beats_us": int(actual[pick] > actual.get("USA", -9)),
                         "pick_minus_us": actual[pick] - actual.get("USA", np.nan), "spearman": rho,
                         "bottom_momentum": mom.idxmin(), "bottom_cagr": actual[mom.idxmin()]})
    hits = pd.DataFrame(rows)
    summ = hits.groupby("lookback").agg(decades=("decade", "count"), n_avg=("n", "mean"),
                                        hit_top1=("hit_top1", "mean"), hit_pick_in_top3=("hit_pick_in_top3", "mean"),
                                        hit_any_top3_pick_wins=("hit_any_top3_pick_wins", "mean"),
                                        pick_beats_us=("pick_beats_us", "mean"), pick_minus_us_mean=("pick_minus_us", "mean"),
                                        pick_minus_us_median=("pick_minus_us", "median"), spearman_mean=("spearman", "mean"),
                                        bottom_minus_pick=("bottom_cagr", "mean"))
    summ["random_top1_rate"] = 1 / hits.groupby("lookback")["n"].mean()
    summ["random_top3_rate"] = 3 / hits.groupby("lookback")["n"].mean()
    return hits, summ


def rotate(eq: pd.DataFrame, bills_us: pd.Series, L: int, k: int, cost: float = COST,
           trend_exit: bool = False, start: int = 1871) -> pd.Series:
    """Annual re-decided top-k country equity rotation on trailing L-year USD return.

    A country is eligible at year-end t if it has L valid trailing years and a valid return in t+1
    (a market that closes in t+1 is excluded; q2 reports how often the top pick was affected).
    With trend_exit, a picked country whose trailing L-year return is below the trailing L-year
    US bill return is replaced by US bills.
    """
    years = [y for y in eq.index if y >= start]
    out, prev = {}, set()
    for t in years[:-1]:
        nxt = t + 1
        if nxt not in eq.index:
            continue
        mom = trailing(eq, t, L)
        ok = mom.notna() & eq.loc[nxt].notna()
        mom = mom[ok].sort_values(ascending=False)
        if len(mom) == 0:
            continue
        picks = list(mom.index[:k])
        rets = []
        held = set()
        for c in picks:
            if trend_exit:
                bt = float((1 + bills_us[(bills_us.index > t - L) & (bills_us.index <= t)]).prod() - 1)
                if mom[c] <= bt:
                    rets.append(float(bills_us.get(nxt, 0.0)))
                    continue
            rets.append(float(eq.loc[nxt, c]))
            held.add(c)
        r = float(np.mean(rets))
        switches = len(held - prev) + len(prev - held)
        out[nxt] = r - cost * switches / max(k, 1)
        prev = held
    return pd.Series(out).sort_index()


def run() -> None:
    eq = D.usd_wide("eq")
    bills = D.usd_wide("bill")["USA"]
    hits, summ = hit_rates(eq)
    hits.to_csv(os.path.join(OUT, "q2_decade_hits.csv"), index=False)
    summ.to_csv(os.path.join(OUT, "q2_hit_summary.csv"))
    print("Decade hit rates by lookback (1880s–2010s):")
    print(summ.round(3).to_string())
    print("\nDetail, 1-year lookback:")
    print(hits[hits.lookback == 1][["decade", "n", "winner", "winner_cagr", "us_cagr", "top_momentum", "pick_cagr", "pick_minus_us", "spearman"]].round(3).to_string(index=False))

    # excluded-pick count: how often is the momentum leader unavailable next year (market closed)?
    n_excl = 0
    for t in eq.index[:-1]:
        mom = trailing(eq, t, 1).dropna()
        if len(mom) and pd.isna(eq.loc[t + 1, mom.idxmax()]):
            n_excl += 1
    print(f"\nYear-ends where the 1-year momentum leader has no return the next year (excluded): {n_excl}")

    us = eq["USA"].dropna()
    ew = eq.mean(axis=1)
    rows, series = [], {"US": us, "EW world": ew, "US bills": bills}
    for L in (1, 3, 5):
        for k in (1, 3):
            for te in (False, True):
                s = rotate(eq, bills, L, k, trend_exit=te)
                name = f"top{k}_L{L}{'_trend' if te else ''}"
                series[name] = s
                st = D.series_stats(s, 1)
                a = pd.concat([s, us], axis=1).dropna()
                st.update({"rule": name, "lookback": L, "k": k, "trend_exit": te,
                           "us_cagr_same_years": D.cagr(float((1 + a.iloc[:, 1]).prod()), len(a)),
                           "ew_cagr_same_years": D.cagr(float((1 + ew.reindex(a.index)).prod()), len(a))})
                st["excess_vs_us"] = st["cagr"] - st["us_cagr_same_years"]
                st.update({f"r10_{kk}": v for kk, v in D.rolling_10y_share(s, us, 1).items()})
                # halves
                for lab, lo, hi in [("pre1950", 1871, 1950), ("post1950", 1951, 2020), ("post1990", 1991, 2020)]:
                    ss = s[(s.index >= lo) & (s.index <= hi)]
                    uu = us[(us.index >= lo) & (us.index <= hi)]
                    st[f"{lab}_cagr"] = D.cagr(float((1 + ss).prod()), len(ss))
                    st[f"{lab}_excess"] = st[f"{lab}_cagr"] - D.cagr(float((1 + uu).prod()), len(uu))
                rows.append(st)
    for nm in ("US", "EW world", "US bills"):
        s = series[nm].loc[1872:2020]
        st = D.series_stats(s, 1)
        st.update({"rule": nm})
        rows.append(st)
    res = pd.DataFrame(rows).set_index("rule")
    res.to_csv(os.path.join(OUT, "q2_annual_rotation.csv"))
    pd.DataFrame(series).to_csv(os.path.join(OUT, "q2_rotation_series.csv"))
    cols = ["cagr", "us_cagr_same_years", "ew_cagr_same_years", "excess_vs_us", "vol", "max_dd", "worst_period",
            "r10_share_beat", "r10_share_beat_5pt", "pre1950_excess", "post1950_excess", "post1990_excess"]
    print("\nAnnual top-momentum country rotation, 1872–2020 (USD, 0.5% one-way cost):")
    with pd.option_context("display.width", 250):
        print(res[[c for c in cols if c in res.columns]].round(3).to_string())


if __name__ == "__main__":
    run()
