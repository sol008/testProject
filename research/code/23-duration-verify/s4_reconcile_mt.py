"""Reconciliation diagnostics and multiple-testing bookkeeping.

  * episode clustering: events within 180 days of the previous one form an episode; episode-mean t and an
    era placebo on episode means;
  * entry timing: the first night (signal close -> next open, SPY) and the first day (signal close -> next
    close, index) by era;
  * deflated-Sharpe probabilities of the per-trade edge series (trade minus its era-pool mean) at several
    trial counts N, and Bonferroni bars;
  * the track 21 / 22 claims next to this track's numbers;
  * the variant registry (every cell run here), with counts.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common23 as K

N_LEVELS = {"track 17 cells (8)": 8, "8 cells x 3 caps (24)": 24,
            "W10 cells in tracks 17+19+21+22+23 (~120)": 120,
            "whole dossier (~3,300)": 3300}


def episodes(dates: pd.Series, gap_days=180) -> np.ndarray:
    d = pd.to_datetime(dates).values
    ep = [0]
    for k in range(1, len(d)):
        ep.append(ep[-1] + (1 if (d[k] - d[k - 1]) / np.timedelta64(1, "D") > gap_days else 0))
    return np.array(ep)


def clustering() -> pd.DataFrame:
    T = pd.read_csv(K.RESULTS / "w10_trades_one_at_a_time.csv", parse_dates=["signal"])
    A = pd.read_csv(K.RESULTS / "w10_events_all.csv", parse_dates=["signal"])
    rows = []
    for src, D in (("one at a time", T), ("all events", A)):
        for samp in ("SPY 1993-2026", "Index 1990-2026", "Index 1928-1989", "Index 1928-2026"):
            for rule in ("CAL60", "CAL90", "CAL120"):
                t = D[(D["sample"] == samp) & (D.rule == rule)].sort_values("signal")
                if len(t) < 3:
                    continue
                ep = episodes(t.signal)
                em = t.groupby(ep).net.mean()
                ee = t.groupby(ep).edge_vs_pool.mean()
                rows.append(dict(version=src, sample=samp, rule=rule, trades=len(t), episodes=len(em),
                                 ep_mean=em.mean(), ep_t=K.tstat(em.values), ep_edge_mean=ee.mean(),
                                 ep_edge_t=K.tstat(ee.values), trade_edge_t=K.tstat(t.edge_vs_pool.values),
                                 largest_episode=int(pd.Series(ep).value_counts().max())))
    C = pd.DataFrame(rows)
    K.save(C, "check_episode_clustering")
    return C


def entry_timing() -> pd.DataFrame:
    w = K.w10_frame()
    s = K.spy()
    ev = w.index[w["sig"]]
    rows = []
    for d in ev:
        i = w.index.get_loc(d)
        rec = dict(signal=d.date(), crash=w["r"].iloc[i], day1_index_tr=w["tr"].iloc[i + 1] / w["tr"].iloc[i] - 1)
        if d in s.index:
            k = s.index.get_loc(d)
            rec["night_spy"] = s["aO"].iloc[k + 1] / s["aC"].iloc[k] - 1
            rec["day1_spy_open_to_close"] = s["aC"].iloc[k + 1] / s["aO"].iloc[k + 1] - 1
        rows.append(rec)
    E = pd.DataFrame(rows)
    E["era"] = np.where(pd.to_datetime(E.signal) < pd.Timestamp("1990-01-01"), "1928-1989", "1990-2026")
    S = E.groupby("era").agg(n=("signal", "size"), mean_crash=("crash", "mean"), mean_day1_index=("day1_index_tr", "mean"),
                             median_day1_index=("day1_index_tr", "median"), up_day1=("day1_index_tr", lambda x: (x > 0).mean()),
                             mean_night_spy=("night_spy", "mean"), mean_day1_spy_intraday=("day1_spy_open_to_close", "mean"))
    K.save(E, "check_entry_timing_events")
    K.save(S.reset_index(), "check_entry_timing")
    return S


def dsr_table() -> pd.DataFrame:
    T = pd.read_csv(K.RESULTS / "w10_trades_one_at_a_time.csv")
    rows = []
    for samp in ("SPY 1993-2026", "Index 1990-2026", "Index 1928-2026", "Index 1928-1989"):
        for rule in ("CAL60", "CAL90", "CAL120", "F63"):
            t = T[(T["sample"] == samp) & (T.rule == rule)]
            e = t.edge_vs_pool.values
            rec = dict(sample=samp, rule=rule, n=len(e), edge_mean=e.mean(), edge_t=K.tstat(e),
                       sr_per_trade=e.mean() / e.std(ddof=1))
            for lab, N in N_LEVELS.items():
                rec[f"DSR N={N}"] = K.deflated_sr(e, N)
                rec[f"Bonferroni t N={N}"] = K.bonferroni_t(N)
            rows.append(rec)
    D = pd.DataFrame(rows)
    K.save(D, "check_deflated_sharpe")
    return D


def claims_vs_mine() -> pd.DataFrame:
    """Headline claims of tracks 21 and 22 next to this track's numbers (same or corrected convention)."""
    R = pd.read_csv(K.RESULTS / "w10_stats.csv")

    def g(samp, rule, ver, col):
        x = R[(R["sample"] == samp) & (R.rule == rule) & (R.version == ver)]
        return float(x[col].iloc[0]) if len(x) else np.nan
    E = pd.read_csv(K.RESULTS / "portfolio_w10_expectation.csv")
    M4 = pd.read_csv(K.RESULTS / "portfolio_m4_from_track21.csv")
    B = pd.read_csv(K.RESULTS / "portfolio_book_expectation.csv")

    def bk(cap, name):
        return float(B[(B.cap == cap) & (B.book == name)].central.iloc[0])
    rows = [
        ("T21: W10 63 sessions, 1990-2026, mean", 0.0693, g("SPY 1993-2026", "CAL90", "all events", "mean"),
         "SPY 1993-2026, calendar-exact 90 days, all 20 events (T21 mixes in the 1991 index event)"),
        ("T21: W10 63 sessions, era placebo", 0.0272, g("SPY 1993-2026", "CAL90", "all events", "era_placebo"), ""),
        ("T21: W10 63 sessions, p_era", 0.017, g("SPY 1993-2026", "CAL90", "all events", "p_era"), ""),
        ("T21: W10 63 sessions, p_up", 0.003, g("SPY 1993-2026", "CAL90", "all events", "p_up"), ""),
        ("T21: W10 one at a time (18 trades), p_era", 0.013, g("SPY 1993-2026", "CAL90", "one at a time", "p_era"),
         "17 SPY trades"),
        ("T21: W10 42 sessions, p_era", 0.131, g("SPY 1993-2026", "CAL60", "all events", "p_era"), "calendar-exact 60 days"),
        ("T21: 1928-89 next close 63 sessions, edge", 0.0103, g("Index 1928-1989", "CAL90", "all events", "edge_era"), ""),
        ("T21: 1928-89 next close 63 sessions, p", 0.66, g("Index 1928-1989", "CAL90", "all events", "p_era"), ""),
        ("T21: W10 contribution at 90 days (6.7%, % NAV/yr)", 0.00103,
         float(E[E.cap == 90].central.iloc[0]), "6% of NAV; forward 4.5%, kappa 0.5 on the 1928-2026 edge"),
        ("T21: W10 range high at 90 days", 0.00129, float(E[E.cap == 90].high.iloc[0]), "kappa x SPY 1993-2026 mean excess"),
        ("T21: M4 at 90 DTE, central", 0.0013, float(M4[(M4.dte == 90) & (M4.kappa == 0.25)].central_track21_style.iloc[0]),
         "same method at kappa 0.25 (12 episodes)"),
        ("T21: Lean over bills, 60 days", 0.0025, bk(60, "Design Lean, M4 at kappa 0.25"), "M4 at kappa 0.25"),
        ("T21: Lean over bills, 90 days", 0.0043, bk(90, "Design Lean, M4 at kappa 0.25"), "W10 6%, M4 kappa 0.25"),
        ("T21: Lean over bills, 120 days", 0.0040, bk(120, "Design Lean, M4 at kappa 0.25"), ""),
        ("T21: Lean over bills, 90 days (M4 per T21)", 0.0043, bk(90, "Design Lean (M1, M3, M4, W8, W10), M4 per track 21"),
         "only W10 corrected"),
        ("T22: W10 alone at 90 days (% NAV/yr)", 0.0006, float(E[E.cap == 90].central.iloc[0]), ""),
        ("T22: share of 63-session holds over 90 days", 0.34, np.nan, "see rules_calendar_spans.csv (close exit 32%, open exit 75%)"),
    ]
    C = pd.DataFrame(rows, columns=["claim", "their_value", "this_track", "note"])
    K.save(C, "check_claims_vs_this_track")
    return C


def subperiods() -> pd.DataFrame:
    """One-at-a-time CAL60/90/120 trades split 1993-2007 / 2008-2026 (SPY) and by era (index)."""
    T = pd.read_csv(K.RESULTS / "w10_trades_one_at_a_time.csv", parse_dates=["signal"])
    rows = []
    for samp, cuts in (("SPY 1993-2026", [("1993-2007", "1993-01-01", "2007-12-31"), ("2008-2026", "2008-01-01", "2026-12-31")]),
                       ("Index 1928-2026", [("1928-1949", "1928-01-01", "1949-12-31"), ("1950-1989", "1950-01-01", "1989-12-31"),
                                            ("1990-2007", "1990-01-01", "2007-12-31"), ("2008-2026", "2008-01-01", "2026-12-31")])):
        for rule in ("CAL60", "CAL90", "CAL120"):
            t = T[(T["sample"] == samp) & (T.rule == rule)]
            for lab, a, b in cuts:
                x = t[(t.signal >= a) & (t.signal <= b)]
                if len(x) == 0:
                    continue
                rows.append(dict(sample=samp, rule=rule, period=lab, n=len(x), mean=x.net.mean(), win=(x.net > 0).mean(),
                                 worst=x.net.min(), edge_vs_pool=x.edge_vs_pool.mean(), edge_t=K.tstat(x.edge_vs_pool.values)))
    S = pd.DataFrame(rows)
    K.save(S, "check_subperiods")
    return S


def threshold_sensitivity() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Diagnostic only (not a selection step): the same rule with the crash threshold moved, CAL90, one
    position at a time; and the near-misses / borderline days within 0.10 points of -3%."""
    w = K.w10_frame()
    rng = np.random.default_rng(K.SEED + 11)
    rows = []
    base_sig = w["sig"].copy()
    for thr in (-0.025, -0.0275, -0.03, -0.0325, -0.035):
        crash = w["r"] <= thr
        quiet = crash.shift(1).astype(float).rolling(20, min_periods=20).sum() == 0
        sig = (crash & w["up_prior"] & quiet).fillna(False)
        for I, a, b in ((K.inst_spy(), "1993-01-29", "2026-09-28"), (K.inst_index(), "1928-10-01", "2026-09-28")):
            I.sig = sig.reindex(I.dates).fillna(False).values
            lo = int(np.searchsorted(I.dnum, np.datetime64(a, "D").astype(np.int64)))
            ev = np.flatnonzero(I.sig[lo:]) + lo
            tr = K.trade_returns(I, ev, "CAL90")
            keep, busy = [], -1
            for k, i in enumerate(ev):
                if tr["ok"][k] and i >= busy:
                    keep.append(k)
                    busy = tr["X"][k]
            keep = np.array(keep)
            allpos = np.arange(I.n - 1)
            tv = K.trade_returns(I, allpos, "CAL90")
            vec = np.full(I.n, np.nan)
            vec[allpos[tv["ok"]]] = tv["net"][tv["ok"]]
            fin = np.flatnonzero(np.isfinite(vec))
            pm, null = K.placebo(vec, ev[keep], lo, int(fin[-1]) + 1, era=True, rng=rng, draws=5000)
            x = tr["net"][keep]
            rows.append(dict(threshold=thr, sample=f"{I.name} {a[:4]}-2026", trades=len(x), per_yr=len(x) / ((K.TODAY - pd.Timestamp(a)).days / 365.25),
                             mean=x.mean(), edge=x.mean() - null.mean(), p_era=K.two_sided_p(x.mean(), null)))
            K.register("W10 threshold (diagnostic)", f"{thr} CAL90 one at a time", f"{I.name} {a[:4]}-2026", "diagnostic", len(x))
    S = pd.DataFrame(rows)
    near = w[(w["r"] > -0.031) & (w["r"] <= -0.029) & w["up_prior"] & w["quiet20"].fillna(False)][["r", "sig"]].copy()
    near["distance_bp"] = (near["r"] + 0.03) * 1e4
    K.save(S, "check_threshold_sensitivity")
    K.save(near.reset_index().rename(columns={"index": "date", "Date": "date"}), "check_borderline_days")
    return S, near


def registry() -> pd.DataFrame:
    Rg = pd.DataFrame(K.REG)
    K.save(Rg, "variant_registry")
    cnt = Rg.groupby(["family", "kind"]).size().rename("cells").reset_index()
    K.save(cnt, "variant_counts")
    return cnt


def main():
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    print(clustering().round(4).to_string(index=False))
    print(entry_timing().round(4).to_string())
    print(dsr_table().round(3).to_string(index=False))
    print(claims_vs_mine().round(4).to_string(index=False))
    print(subperiods().round(4).to_string(index=False))
    S, near = threshold_sensitivity()
    print(S.round(4).to_string(index=False))
    print(near.round(5).to_string())


if __name__ == "__main__":
    main()
