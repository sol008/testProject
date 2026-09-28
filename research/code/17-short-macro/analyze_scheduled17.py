"""Scheduled macro events: FOMC, CPI, payrolls, midterm elections, government shutdowns, BoJ hikes.

Surprise proxy (no consensus data): the change in the 2-year Treasury yield (FRED DGS2, bp) on the release/decision
day. Days are bucketed into hawkish/hot (top ~15% of that event type's d0 2y changes), dovish/cool (bottom ~15%),
and neutral; forward moves are measured from the day-0 close (tradable after the event) and compared with the
random-day baseline and an era-matched placebo. Also: event-day absolute moves vs ordinary days (for comparison
with today's option-implied event moves), pre-FOMC drift decay, midterm seasonality vs same-season windows in
other years, shutdown base rates, BoJ hikes.

Outputs: printed tables + SCRATCH/sched_*.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from event_lists17 import (BOJ_HIKES, FED_INTERMEETING, FIRST_CUTS, FIRST_HIKES, HOUSE_FLIP_MIDTERMS, SECOND_HIKES,
                           SHUTDOWNS, midterm_dates)
from lib17 import (ASOF, RNG, SCRATCH, YIELD_LIKE, asset_panel, bh_fdr, event_table, fmt, fred, summarize)

pd.set_option("display.width", 250)
pd.set_option("display.max_rows", 500)
pd.set_option("display.max_columns", 40)
P = asset_panel()
ASSETS = ["SPY", "TLT", "GOLD", "UUP", "USO", "BTC", "UST2Y", "UST10Y"]


def load_dates(fname: str) -> list[pd.Timestamp]:
    d = pd.read_csv(SCRATCH / fname, parse_dates=["date"])
    return [x for x in d["date"] if x <= ASOF]


def fomc_dates() -> pd.DataFrame:
    f = pd.read_csv(SCRATCH / "fomc_dates.csv", parse_dates=["date"])
    f = f[(f.kind == "meeting") & (f.date <= ASOF)].sort_values("date")
    keep = []
    for d in f.date:
        if keep and (d - keep[-1]).days <= 3:
            keep[-1] = d
        else:
            keep.append(d)
    return pd.DataFrame({"date": keep})


def policy_rate() -> pd.Series:
    a = fred("DFEDTAR")
    b = fred("DFEDTARU")
    return pd.concat([a[a.index < b.index.min()], b]).sort_index()


def d0_table(dates, same_day=True) -> pd.DataFrame:
    """Day-0 2y change (surprise proxy) and asset reactions for a list of dates."""
    ev = [(str(d.date()), d, same_day) for d in dates]
    base = event_table(P["UST2Y"], ev, is_yield=True)[["event", "day0", "d0"]].rename(columns={"d0": "d2y"})
    return base


def bucketize(tab: pd.DataFrame, col: str = "d2y", q: float = 0.15) -> pd.DataFrame:
    lo, hi = tab[col].quantile(q), tab[col].quantile(1 - q)
    tab = tab.copy()
    tab["bucket"] = np.where(tab[col] >= hi, "hawkish", np.where(tab[col] <= lo, "dovish", "neutral"))
    return tab, lo, hi


def by_bucket(name: str, tab: pd.DataFrame, assets=ASSETS) -> pd.DataFrame:
    rows = []
    for b in ["hawkish", "dovish", "neutral"]:
        ds = tab.loc[tab.bucket == b, "day0"]
        ev = [(f"{name}-{b}-{d}", pd.Timestamp(d), True) for d in ds]
        for a in assets:
            s = P[a]
            t = event_table(s, ev, is_yield=a in YIELD_LIKE)
            if len(t) < 5:
                continue
            sm = summarize(t, s, is_yield=a in YIELD_LIKE, label=f"{name}|{b}|{a}", era_years=3)
            rows.append(sm)
    out = pd.concat(rows)
    return out


def event_day_abs(name: str, dates, assets=("SPY", "TLT", "GOLD", "USO", "BTC", "UST2Y", "UST10Y"),
                  periods=(("2002-2019", "2002-01-01", "2019-12-31"), ("2020-2026", "2020-01-01", "2026-12-31"),
                           ("2022-2026", "2022-01-01", "2026-12-31"))) -> pd.DataFrame:
    rows = []
    dset = set(pd.Timestamp(d) for d in dates)
    for a in assets:
        s = P[a].dropna()
        r = (s.diff() * 100) if a in YIELD_LIKE else (s.pct_change() * 100)
        r = r.dropna()
        for lbl, st, en in periods:
            rr = r[(r.index >= st) & (r.index <= en)]
            ev = rr[rr.index.isin(dset)].abs()
            ne = rr[~rr.index.isin(dset)].abs()
            if len(ev) < 5:
                continue
            rows.append({"event": name, "asset": a, "period": lbl, "n": len(ev), "mean_abs": ev.mean(),
                         "median_abs": ev.median(), "p80_abs": ev.quantile(0.8), "max_abs": ev.max(),
                         "nonevent_mean_abs": ne.mean(), "ratio": ev.mean() / ne.mean()})
    return pd.DataFrame(rows)


# ------------------------------------------------------------------------------------------------------------
def fomc_block():
    f = fomc_dates()
    tab = d0_table(f.date)
    pr = policy_rate()
    act = []
    for d in pd.to_datetime(tab.day0):
        before = pr[pr.index < d].iloc[-1] if (pr.index < d).any() else np.nan
        after = pr[pr.index <= d + pd.Timedelta(days=1)].iloc[-1]
        act.append(after - before)
    tab["dpolicy_bp"] = np.round(np.array(act) * 100)
    tab, lo, hi = bucketize(tab)
    print(f"\n=== FOMC scheduled decisions {tab.day0.min()}..{tab.day0.max()}: n={len(tab)}; d2y buckets: dovish<= {lo:.0f}bp, hawkish>= {hi:.0f}bp")
    print("d2y distribution (bp): ", tab.d2y.describe().round(1).to_dict())
    tab.to_csv(SCRATCH / "sched_fomc_days.csv", index=False)
    out = by_bucket("FOMC", tab)
    print(fmt(out[["set", "window", "n", "mean", "median", "sd", "hit%", "base_mean", "excess", "p_placebo"]]))
    out.to_csv(SCRATCH / "sched_fomc_buckets.csv", index=False)
    # pre-FOMC drift decay (Lucca-Moench 2015): SPY close-to-close on decision day (includes the 2pm reaction)
    spy = P["SPY"].pct_change() * 100
    fd = set(pd.to_datetime(tab.day0))
    for lbl, st, en in [("1994-2011 (in-sample LM)", "1994-01-01", "2011-12-31"), ("2012-2026 (post-pub)", "2012-01-01", "2026-12-31"),
                        ("2020-2026", "2020-01-01", "2026-12-31")]:
        rr = spy[(spy.index >= st) & (spy.index <= en)].dropna()
        e = rr[rr.index.isin(fd)]
        ne = rr[~rr.index.isin(fd)]
        t, p = stats.ttest_ind(e, ne, equal_var=False)
        print(f"FOMC-day SPY return {lbl}: n={len(e)} mean {e.mean():.3f}% (median {e.median():.3f}, hit {100*(e>0).mean():.0f}%) "
              f"vs other days {ne.mean():.3f}% | Welch t={t:.2f} p={p:.3f}")
    # action classes
    for lbl, dates in [("first hikes", FIRST_HIKES), ("second hikes", SECOND_HIKES), ("first cuts", FIRST_CUTS)]:
        ev = [(d, pd.Timestamp(d), True) for d in dates]
        t = event_table(P["SPX"], ev)
        t2 = event_table(P["UST2Y"], ev, is_yield=True)
        t10 = event_table(P["UST10Y"], ev, is_yield=True)
        m = t[["day0", "d0", "f5", "f20", "f60"]].round(1).copy()
        m["2y_d0"] = t2["d0"].values
        m["2y_f60"] = t2["f60"].values
        m["10y_f60"] = t10["f60"].values
        print(f"\n-- {lbl} (S&P %, yields bp)\n", m.to_string(index=False))
    ev = [(x[0], pd.Timestamp(x[1]), x[2]) for x in FED_INTERMEETING]
    t = event_table(P["SPX"], ev)
    t2 = event_table(P["UST2Y"], ev, is_yield=True)
    t["2y_d0"] = t2["d0"].values
    t["2y_f20"] = t2["f20"].values
    print("\n-- Fed intermeeting / emergency actions (S&P %)\n", t[["event", "day0", "d0", "f5", "f20", "f60", "mdd60_from_pre", "2y_d0", "2y_f20"]].round(1).to_string(index=False))
    cuts = t[[("cut" in x[3]) for x in FED_INTERMEETING]]
    print("emergency cuts: n=%d, S&P f20 mean %.1f median %.1f hit %.0f%%; f60 mean %.1f median %.1f" % (
        len(cuts), cuts.f20.mean(), cuts.f20.median(), 100 * (cuts.f20 > 0).mean(), cuts.f60.mean(), cuts.f60.median()))
    return tab


def release_block(name: str, fname: str):
    dates = load_dates(fname)
    tab = d0_table(dates)
    tab, lo, hi = bucketize(tab)
    # inflation regime tag at release date: CPI y/y (latest available month before release)
    cpi = fred("CPIAUCSL")
    yoy = (cpi / cpi.shift(12) - 1) * 100
    tab["cpi_yoy"] = [yoy[yoy.index <= pd.Timestamp(d) - pd.Timedelta(days=40)].iloc[-1] for d in pd.to_datetime(tab.day0)]
    print(f"\n=== {name} releases {tab.day0.min()}..{tab.day0.max()}: n={len(tab)}; d2y buckets: cool/weak<= {lo:.0f}bp, hot/strong>= {hi:.0f}bp")
    print("d2y distribution (bp): ", tab.d2y.describe().round(1).to_dict())
    tab.to_csv(SCRATCH / f"sched_{name}_days.csv", index=False)
    out = by_bucket(name, tab)
    print(fmt(out[["set", "window", "n", "mean", "median", "sd", "hit%", "base_mean", "excess", "p_placebo"]]))
    out.to_csv(SCRATCH / f"sched_{name}_buckets.csv", index=False)
    # high-inflation regime subset (CPI y/y >= 3.5%)
    hi_inf = tab[tab.cpi_yoy >= 3.5]
    print(f"{name}: releases in CPI>=3.5% regime: n={len(hi_inf)}; hawkish {sum(hi_inf.bucket=='hawkish')}, dovish {sum(hi_inf.bucket=='dovish')}")
    return tab, out


def midterm_block():
    spx = P["SPX"]
    idx = spx.index
    rows = []
    for e in midterm_dates(1934, 2022):
        p0 = idx.searchsorted(e, side="right") - 1  # last close on/before election day (NYSE closed on E-day pre-1984)
        r = {"year": e.year, "eday": e.date(), "close_date": idx[p0].date()}
        r["pre_1m"] = (spx.iloc[p0] / spx.iloc[p0 - 21] - 1) * 100
        for h, lbl in [(5, "post_1w"), (21, "post_1m"), (42, "post_2m")]:
            r[lbl] = (spx.iloc[p0 + h] / spx.iloc[p0] - 1) * 100
        r["full_-1m_+2m"] = (spx.iloc[p0 + 42] / spx.iloc[p0 - 21] - 1) * 100
        r["house_flip"] = e.year in HOUSE_FLIP_MIDTERMS
        rows.append(r)
    mt = pd.DataFrame(rows)
    print(f"\n=== Midterm elections 1934-2022 (S&P 500 price, %), n={len(mt)}")
    print(mt.round(1).to_string(index=False))
    # same-season windows in all other years (seasonal baseline) + all-days baseline
    other = []
    for y in range(1929, 2026):
        if y in set(mt.year):
            continue
        d = pd.Timestamp(year=y, month=11, day=1)
        while d.weekday() != 0:
            d += pd.Timedelta(days=1)
        e = d + pd.Timedelta(days=1)
        p0 = idx.searchsorted(e, side="right") - 1
        if p0 + 42 >= len(spx):
            continue
        other.append({"year": y, "pre_1m": (spx.iloc[p0] / spx.iloc[p0 - 21] - 1) * 100,
                      "post_1w": (spx.iloc[p0 + 5] / spx.iloc[p0] - 1) * 100,
                      "post_1m": (spx.iloc[p0 + 21] / spx.iloc[p0] - 1) * 100,
                      "post_2m": (spx.iloc[p0 + 42] / spx.iloc[p0] - 1) * 100,
                      "full_-1m_+2m": (spx.iloc[p0 + 42] / spx.iloc[p0 - 21] - 1) * 100,
                      "pres_year": y % 4 == 0})
    ot = pd.DataFrame(other)
    rows = []
    for c, h in [("pre_1m", 21), ("post_1w", 5), ("post_1m", 21), ("post_2m", 42), ("full_-1m_+2m", 63)]:
        x = mt[c]
        o = ot[c]
        f = (spx.shift(-h) / spx - 1).dropna() * 100
        f = f[f.index >= "1934-01-01"]
        # permutation: mean of 23 random other-year same-season windows
        draws = np.array([RNG.choice(o.values, size=len(x), replace=True).mean() for _ in range(10000)])
        p_season = float((np.abs(draws - o.mean()) >= abs(x.mean() - o.mean())).mean())
        t, p_t = stats.ttest_ind(x, o, equal_var=False)
        rows.append({"window": c, "n": len(x), "mean": x.mean(), "median": x.median(), "sd": x.std(),
                     "hit%": (x > 0).mean() * 100, "min": x.min(), "max": x.max(),
                     "other_years_same_season_mean": o.mean(), "other_hit%": (o > 0).mean() * 100,
                     "all_days_mean": f.mean(), "all_days_hit%": (f > 0).mean() * 100,
                     "p_vs_season(perm)": p_season, "p_welch": p_t})
    s = pd.DataFrame(rows)
    print(fmt(s))
    flip = mt[mt.house_flip]
    print("House-flip midterms (n=%d): post_2m mean %.1f median %.1f hit %.0f%% | others (n=%d): mean %.1f hit %.0f%%" % (
        len(flip), flip.post_2m.mean(), flip.post_2m.median(), 100 * (flip.post_2m > 0).mean(),
        len(mt) - len(flip), mt[~mt.house_flip].post_2m.mean(), 100 * (mt[~mt.house_flip].post_2m > 0).mean()))
    for per, sub in [("1934-1978", mt[mt.year <= 1978]), ("1982-2022", mt[mt.year >= 1982])]:
        print(f"  {per}: n={len(sub)} post_2m mean {sub.post_2m.mean():.1f} hit {100*(sub.post_2m>0).mean():.0f}% | pre_1m mean {sub.pre_1m.mean():.1f}")
    mt.to_csv(SCRATCH / "sched_midterms.csv", index=False)
    s.to_csv(SCRATCH / "sched_midterms_summary.csv", index=False)
    # cross-asset around midterm day (post-1962 yields, 1971 DXY, 2006+ ETFs)
    ev = [(str(e.year), e, False) for e in midterm_dates(1962, 2022)]
    for a in ["UST10Y", "DXY", "GOLD", "TLT", "USO", "BTC"]:
        t = event_table(P[a], ev, is_yield=a in YIELD_LIKE)
        if len(t):
            print(f"  midterm {a}: n={len(t)} f20 mean {t.f20.mean():.2f} median {t.f20.median():.2f} | f60 mean {t.f60.mean():.2f}")
    return mt, s


def shutdown_block():
    ev = [(x[0], pd.Timestamp(x[1]), True) for x in SHUTDOWNS]
    rows = []
    for a in ["SPX", "UST10Y", "UST3M", "DXY", "GOLD"]:
        t = event_table(P[a], ev, is_yield=a in YIELD_LIKE)
        sm = summarize(t, P[a], is_yield=a in YIELD_LIKE, label=f"shutdown|{a}")
        rows.append(sm)
    out = pd.concat(rows)
    print("\n=== Federal funding gaps 1976-2025 (n=%d), day 0 = first trading day of the lapse" % len(SHUTDOWNS))
    print(fmt(out[["set", "window", "n", "mean", "median", "sd", "hit%", "base_mean", "excess", "p_placebo"]]))
    t = event_table(P["SPX"], ev)
    t["days_lapse"] = [x[2] for x in SHUTDOWNS if pd.Timestamp(x[1]) >= P["SPX"].index.min()][:len(t)]
    print(t[["event", "day0", "d0", "f5", "f20", "f60", "mdd60_from_pre", "days_lapse"]].round(1).to_string(index=False))
    major = t[t.days_lapse >= 3]
    major = major[pd.to_datetime(major.day0) >= "1990-01-01"]
    print("major (>=3 days, 1990+): n=%d f20 mean %.1f median %.1f | f60 mean %.1f" % (len(major), major.f20.mean(), major.f20.median(), major.f60.mean()))
    # pre-deadline drift: S&P from 10 trading days before the lapse to the last pre-lapse close
    spx = P["SPX"]
    pre = []
    for x in SHUTDOWNS:
        p0 = spx.index.searchsorted(pd.Timestamp(x[1]))
        pre.append((spx.iloc[p0 - 1] / spx.iloc[p0 - 11] - 1) * 100)
    pre = np.array(pre)
    f10 = ((spx.shift(-10) / spx - 1) * 100).dropna()
    print("pre-deadline 10d S&P: mean %.2f median %.2f hit %.0f%% vs all 10d windows %.2f" % (pre.mean(), np.median(pre), 100 * (pre > 0).mean(), f10[f10.index >= "1976"].mean()))
    out.to_csv(SCRATCH / "sched_shutdowns.csv", index=False)


def boj_block():
    ev = [(x[0], pd.Timestamp(x[1]), True) for x in BOJ_HIKES]
    print("\n=== BoJ hikes (USDJPY: negative = stronger yen)")
    frames = []
    for a in ["USDJPY", "N225", "SPX", "UST10Y"]:
        t = event_table(P[a], ev, is_yield=a in YIELD_LIKE)
        t = t[["event", "day0", "d0", "f5", "f20", "f60"]].copy()
        t.columns = ["event", "day0"] + [f"{a}_{c}" for c in ["d0", "f5", "f20", "f60"]]
        frames.append(t.set_index(["event", "day0"]))
    m = pd.concat(frames, axis=1).round(2)
    print(m.to_string())
    print("means:", m.mean().round(2).to_dict())
    m.to_csv(SCRATCH / "sched_boj.csv")


def main():
    fomc = fomc_block()
    cpi, cpi_out = release_block("CPI", "cpi_dates.csv")
    nfp, nfp_out = release_block("NFP", "nfp_dates.csv")
    # multiple-testing check across the bucket tables
    allb = pd.concat([pd.read_csv(SCRATCH / "sched_fomc_buckets.csv"), cpi_out, nfp_out])
    allb = allb[allb.window != "d0"].copy()
    allb["bh10"] = bh_fdr(allb["p_placebo"].values, 0.10)
    print("\n=== Multiple testing across FOMC/CPI/NFP bucket x asset x horizon: %d tests, %d with p<0.05, %d survive BH-FDR 10%%"
          % (allb.p_placebo.notna().sum(), (allb.p_placebo < 0.05).sum(), allb.bh10.sum()))
    print(fmt(allb[allb.p_placebo < 0.05][["set", "window", "n", "mean", "median", "hit%", "base_mean", "excess", "p_placebo", "bh10"]]))
    allb.to_csv(SCRATCH / "sched_all_buckets.csv", index=False)
    # event-day absolute moves vs ordinary days
    ab = pd.concat([event_day_abs("FOMC", pd.to_datetime(fomc.day0)), event_day_abs("CPI", pd.to_datetime(cpi.day0)),
                    event_day_abs("NFP", pd.to_datetime(nfp.day0))])
    print("\n=== Event-day absolute moves (%, yields bp) vs non-event days")
    print(fmt(ab))
    ab.to_csv(SCRATCH / "sched_event_abs.csv", index=False)
    midterm_block()
    midterm_conditional()
    shutdown_block()
    boj_block()



def midterm_conditional():
    """Watch-window returns (calendar-matched to 2026: Sep 28 -> Nov 3 -> Nov 27) in midterm years vs other years,
    and conditional on the S&P being within 5% of its 52-week high on ~Sep 28 (as in 2026: -1.5%)."""
    spx = P["SPX"]
    idx = spx.index
    rows = []
    for y in range(1934, 2026):
        d = pd.Timestamp(year=y, month=11, day=1)
        while d.weekday() != 0:
            d += pd.Timedelta(days=1)
        eday = d + pd.Timedelta(days=1)
        a = idx.searchsorted(pd.Timestamp(year=y, month=9, day=28), side="right") - 1
        e = idx.searchsorted(eday, side="right") - 1
        z = idx.searchsorted(pd.Timestamp(year=y, month=11, day=27), side="right") - 1
        hi52 = spx.iloc[max(0, a - 252): a + 1].max()
        rows.append({"year": y, "midterm": (y - 1934) % 4 == 0, "dist_from_52wk_high": (spx.iloc[a] / hi52 - 1) * 100,
                     "sep28_to_eday": (spx.iloc[e] / spx.iloc[a] - 1) * 100,
                     "eday_to_nov27": (spx.iloc[z] / spx.iloc[e] - 1) * 100,
                     "sep28_to_nov27": (spx.iloc[z] / spx.iloc[a] - 1) * 100,
                     "mdd_sep28_nov27": (spx.iloc[a:z + 1].min() / spx.iloc[a] - 1) * 100})
    t = pd.DataFrame(rows)
    t.to_csv(SCRATCH / "sched_midterm_watchwindow.csv", index=False)
    print("\n=== Watch-window (Sep 28 -> election day -> Nov 27) S&P %, 1934-2025")
    for lbl, sub in [("midterm years", t[t.midterm]), ("other years", t[~t.midterm]),
                     ("midterm & within 5% of 52w high", t[t.midterm & (t.dist_from_52wk_high >= -5)]),
                     ("other & within 5% of 52w high", t[~t.midterm & (t.dist_from_52wk_high >= -5)]),
                     ("midterm & >5% below high", t[t.midterm & (t.dist_from_52wk_high < -5)])]:
        print(f"{lbl:34s} n={len(sub):2d} | sep28->eday mean {sub.sep28_to_eday.mean():5.2f} med {sub.sep28_to_eday.median():5.2f} hit {100*(sub.sep28_to_eday>0).mean():3.0f}% "
              f"| eday->nov27 mean {sub.eday_to_nov27.mean():5.2f} hit {100*(sub.eday_to_nov27>0).mean():3.0f}% "
              f"| sep28->nov27 mean {sub.sep28_to_nov27.mean():5.2f} med {sub.sep28_to_nov27.median():5.2f} sd {sub.sep28_to_nov27.std():4.1f} hit {100*(sub.sep28_to_nov27>0).mean():3.0f}% "
              f"| worst mdd {sub.mdd_sep28_nov27.min():5.1f} P(mdd<=-5%) {100*(sub.mdd_sep28_nov27<=-5).mean():3.0f}%")
    near = t[t.midterm & (t.dist_from_52wk_high >= -5)]
    print(near.round(1).to_string(index=False))
    return t


if __name__ == "__main__":
    main()
