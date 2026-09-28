"""Robustness checks used in the report.

1) SPY event-day |move| in the recent regime (2024-2026) and day-after-midterm moves, for comparison with the
   option-implied event moves (analyze_implied17).
2) 'Buy the crash day' split by trend regime (prior close above/below 200-day MA), threshold (-3%, -4%) and period
   (1928-1989 vs 1990-2026): does the above-200d effect survive out of sample?
3) De-escalation equity continuation: S&P f20 after de-escalations in the broad list vs the oil-era subset.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from event_lists17 import midterm_dates
from lib17 import ASOF, SCRATCH, asset_panel, permutation_p

P = asset_panel()


def recent_event_days():
    spy = P["SPY"].pct_change() * 100
    tlt = P["TLT"].pct_change() * 100
    out = []
    for name, f in [("NFP", "sched_NFP_days.csv"), ("CPI", "sched_CPI_days.csv"), ("FOMC", "sched_fomc_days.csv")]:
        d = pd.to_datetime(pd.read_csv(SCRATCH / f).day0)
        for per, a, b in [("2024-2026", "2024-01-01", "2026-12-31"), ("2025-2026", "2025-01-01", "2026-12-31")]:
            dd = d[(d >= a) & (d <= b)]
            s = spy.reindex(dd).dropna().abs()
            t = tlt.reindex(dd).dropna().abs()
            base = spy[(spy.index >= a) & (spy.index <= b) & (~spy.index.isin(d))].abs()
            out.append({"event": name, "period": per, "n": len(s), "SPY_mean_abs": s.mean(), "SPY_median_abs": s.median(),
                        "SPY_nonevent_mean_abs": base.mean(), "ratio": s.mean() / base.mean(), "TLT_mean_abs": t.mean()})
    t = pd.DataFrame(out)
    print("=== Recent-regime event-day |moves| (%)")
    print(t.round(2).to_string(index=False))
    spx = P["SPX"]
    rows = []
    for e in midterm_dates(1934, 2022):
        p = spx.index.searchsorted(e, side="right")  # first session after election day
        rows.append({"year": e.year, "day_after": spx.index[p].date(), "move%": (spx.iloc[p] / spx.iloc[p - 1] - 1) * 100})
    m = pd.DataFrame(rows)
    print("Day-after-midterm S&P |move|: mean %.2f%% median %.2f%% (1982-2022 mean %.2f%%)" % (
        m["move%"].abs().mean(), m["move%"].abs().median(), m[m.year >= 1982]["move%"].abs().mean()))
    print(m[m.year >= 1990].round(2).to_string(index=False))


def crash_regimes():
    s = P["SPX"]
    r = s.pct_change() * 100
    ma = s.rolling(200).mean()
    rows = []
    for thr in [-3.0, -4.0]:
        idx = np.where(r.values <= thr)[0]
        keep, last = [], -10 ** 9
        for i in idx:
            if i - last > 20:
                keep.append(i)
            last = i
        for i in keep:
            if i + 60 >= len(s) or i < 200:
                continue
            rows.append({"thr": thr, "date": s.index[i], "above200": bool(s.iloc[i - 1] > ma.iloc[i - 1]),
                         "period": "1928-1989" if s.index[i].year < 1990 else "1990-2026",
                         "f5": (s.iloc[i + 5] / s.iloc[i] - 1) * 100, "f20": (s.iloc[i + 20] / s.iloc[i] - 1) * 100,
                         "f60": (s.iloc[i + 60] / s.iloc[i] - 1) * 100,
                         "mae60": (s.iloc[i: i + 61].min() / s.iloc[i] - 1) * 100})
    t = pd.DataFrame(rows)
    g = t.groupby(["thr", "above200", "period"]).agg(n=("f60", "size"), f5=("f5", "mean"), f20=("f20", "mean"),
                                                      f60=("f60", "mean"), f60_med=("f60", "median"),
                                                      hit60=("f60", lambda x: (x > 0).mean() * 100),
                                                      worst_mae60=("mae60", "min"), med_mae60=("mae60", "median"))
    print("\n=== S&P after first-in-cluster crash days, by trend regime and period (S&P price %, from crash close)")
    print(g.round(2).to_string())
    for thr in [-3.0, -4.0]:
        for per in ["1928-1989", "1990-2026"]:
            sub = t[(t.thr == thr) & t.above200 & (t.period == per)]
            if len(sub) >= 3:
                p, pm = permutation_p(s, list(sub.date), 60, sub.f60.mean(), era_years=3)
                print(f"thr {thr} above200 {per}: n={len(sub)} f60 mean {sub.f60.mean():.2f} vs placebo {pm:.2f} p={p:.3f}")
    t.to_csv(SCRATCH / "robust_crash_regimes.csv", index=False)
    last = t[t.date >= "2020-01-01"]
    print(last.round(2).to_string(index=False))


def deesc_equity():
    m = pd.read_csv(SCRATCH / "shock_events_deesc_all.csv")
    print("\n=== S&P f20 after de-escalations: all (n=%d) mean %.2f hit %.0f%% | oil era 1986+ mean %.2f hit %.0f%%" % (
        m.f20.notna().sum(), m.f20.mean(), 100 * (m.f20 > 0).mean(),
        m[pd.to_datetime(m.day0) >= "1986-01-01"].f20.mean(), 100 * (m[pd.to_datetime(m.day0) >= "1986-01-01"].f20 > 0).mean()))


def main():
    recent_event_days()
    crash_regimes()
    deesc_equity()


if __name__ == "__main__":
    main()
