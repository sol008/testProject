"""Track 13 / test 4: calendar and event effects with holds <= 60 sessions.

All entries/exits are scheduled in advance, so market-on-close fills are implementable:
  'ideal' here = enter at the close of the session BEFORE the window, exit at the close of
  the window's last session (MOC both ways).  'open' = enter at the open of the first
  window session instead (misses the overnight gap into the window).

Rules (standard definitions, one variant each unless noted):
  TOM        last trading day of the month through the 3rd trading day of the next (4 sessions)
  PREHOL     the session before a scheduled NYSE holiday (1 session)
  FOMC       scheduled FOMC announcement day (1 session; 1994-)
  CPI        CPI release day (1 session; first-release dates from ALFRED vintages, 1995-)
  OPEX       the options-expiration week (sessions after the prior Friday through the 3rd Friday)
  POSTOPEX   the 5 sessions after options expiration (reported as an 'avoid' check)
  MIDTERM    midterm years: last September session + 20 / 40 / 60 sessions (vs other years)
  ELECTION   election day (even years) + 20 / 40 / 60 sessions (vs other years)
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from dateutil.easter import easter

from common13 import (SPLIT, TODAY, Registry, load, run_rule, save, trade_stats)
from s00_data import cpi_release_dates

REG = Registry("s04_calendar")
END = TODAY + pd.Timedelta(days=1)

# ----------------------------------------------------------------------------- calendars
def nth_weekday(y, m, wd, n):
    d = pd.Timestamp(y, m, 1)
    d += pd.Timedelta(days=(wd - d.weekday()) % 7)
    return d + pd.Timedelta(weeks=n - 1)


def last_weekday(y, m, wd):
    d = pd.Timestamp(y, m, 1) + pd.offsets.MonthEnd(0)
    return d - pd.Timedelta(days=(d.weekday() - wd) % 7)


def holiday_candidates(y: int) -> dict:
    """Dates (with observed shifts) of every holiday the NYSE has ever observed."""
    c = {}
    def obs(d):
        return [d, d - pd.Timedelta(days=1), d + pd.Timedelta(days=1)]
    c["newyear"] = obs(pd.Timestamp(y, 1, 1)) + [pd.Timestamp(y, 12, 31)]
    c["mlk"] = [nth_weekday(y, 1, 0, 3)] if y >= 1998 else []
    c["lincoln"] = obs(pd.Timestamp(y, 2, 12))
    c["washington"] = obs(pd.Timestamp(y, 2, 22)) + [nth_weekday(y, 2, 0, 3)]
    c["goodfriday"] = [pd.Timestamp(easter(y)) - pd.Timedelta(days=2)]
    c["memorial"] = obs(pd.Timestamp(y, 5, 30)) + [last_weekday(y, 5, 0)]
    c["juneteenth"] = obs(pd.Timestamp(y, 6, 19)) if y >= 2022 else []
    c["july4"] = obs(pd.Timestamp(y, 7, 4))
    c["labor"] = [nth_weekday(y, 9, 0, 1)]
    c["columbus"] = obs(pd.Timestamp(y, 10, 12))
    c["election"] = [nth_weekday(y, 11, 0, 1) + pd.Timedelta(days=1)]
    c["veterans"] = obs(pd.Timestamp(y, 11, 11))
    c["thanksgiving"] = [nth_weekday(y, 11, 3, 4), last_weekday(y, 11, 3), nth_weekday(y, 11, 3, 3)]
    c["christmas"] = obs(pd.Timestamp(y, 12, 25))
    return c


def scheduled_holidays(idx: pd.DatetimeIndex) -> pd.Series:
    """Weekday closures that match a holiday rule (unscheduled closures are dropped)."""
    allb = pd.bdate_range(idx[0], idx[-1])
    closed = allb.difference(idx)
    out = {}
    for d in closed:
        for name, ds in holiday_candidates(d.year).items():
            if d in ds or (name == "newyear" and d in holiday_candidates(d.year + 1)["newyear"]):
                out[d] = name
                break
    # 1968 paperwork-crisis Wednesdays and similar one-offs never match except by accident:
    s = pd.Series(out)
    s = s[~((s.index.year == 1968) & (s.index.weekday == 2) & (s.index.month >= 6))]
    return s


def third_fridays(idx: pd.DatetimeIndex) -> pd.DatetimeIndex:
    out = []
    for p in pd.period_range(idx[0], idx[-1], freq="M"):
        f = nth_weekday(p.year, p.month, 4, 3)
        if f > idx[-1]:
            continue
        # if the Friday is a holiday, expiration moves to the prior session
        pos = idx.searchsorted(f, side="right") - 1
        if pos >= 0 and idx[pos].to_period("M") == p:
            out.append(idx[pos])
    return pd.DatetimeIndex(out)


def fomc_dates() -> pd.DatetimeIndex:
    d = pd.read_csv("/home/user/testProject/research/code/02-academic/data/fomc_dates.csv", parse_dates=["date"])["date"]
    extra = pd.to_datetime(["2026-10-28", "2026-12-09"])      # scheduled, per the Fed calendar
    return pd.DatetimeIndex(sorted(set(d) | set(extra)))


def cpi_dates() -> pd.DatetimeIndex:
    s = cpi_release_dates()
    s = s.copy()
    # ALFRED probe granularity: the Sep-2025 CPI (shutdown) came out on Fri 24 Oct 2025
    if pd.Timestamp("2025-09-01") in s.index:
        s.loc[pd.Timestamp("2025-09-01")] = pd.Timestamp("2025-10-24")
    return pd.DatetimeIndex(sorted(s.values)).append(pd.DatetimeIndex(["2026-10-14"]))


# ----------------------------------------------------------------------------- windows
def window_signals(idx: pd.DatetimeIndex) -> dict:
    """For each rule: (entry-day bool Series = session BEFORE the window, exit-day Series, H cap)."""
    pos = pd.Series(np.arange(len(idx)), index=idx)
    S = {}
    # TOM: window = last session of month (-1) .. 3rd session of next month (+3)
    last = pd.Series(idx, index=idx).groupby(idx.to_period("M")).last()
    ent = pd.Series(False, index=idx)
    ext = pd.Series(False, index=idx)
    for d in last.values:
        p = pos[pd.Timestamp(d)]
        if p - 1 >= 0 and p + 3 < len(idx):
            ent.iloc[p - 1] = True
            ext.iloc[p + 3] = True
    S["TOM"] = (ent, ext, 6)
    # pre-holiday
    hol = scheduled_holidays(idx)
    ent = pd.Series(False, index=idx)
    ext = pd.Series(False, index=idx)
    for h in hol.index:
        p = idx.searchsorted(h) - 1       # pre-holiday session
        if p - 1 >= 0:
            ent.iloc[p - 1] = True
            ext.iloc[p] = True
    S["PREHOL"] = (ent, ext, 2)
    # FOMC / CPI: 1-session windows on the event day
    for name, dates in (("FOMC", fomc_dates()), ("CPI", cpi_dates())):
        ent = pd.Series(False, index=idx)
        ext = pd.Series(False, index=idx)
        for d in dates:
            if d in pos.index:
                p = pos[d]
                if p - 1 >= 0:
                    ent.iloc[p - 1] = True
                    ext.iloc[p] = True
        S[name] = (ent, ext, 2)
    # OPEX week: sessions after the previous Friday's close through the 3rd Friday
    tf = third_fridays(idx)
    ent = pd.Series(False, index=idx)
    ext = pd.Series(False, index=idx)
    ent2 = pd.Series(False, index=idx)
    for f in tf:
        p = pos[f]
        prev_fri = f - pd.Timedelta(days=7)
        q = idx.searchsorted(prev_fri, side="right") - 1
        if q >= 0 and p - q <= 6:
            ent.iloc[q] = True
            ext.iloc[p] = True
        ent2.iloc[p] = True
    S["OPEX"] = (ent, ext, 7)
    S["POSTOPEX"] = (ent2, None, 5)
    return S


def calendar_entries(idx: pd.DatetimeIndex, kind: str) -> pd.Series:
    """MIDTERM: last September session of midterm years.  ELECTION: election-day close (or
    the prior session if closed), even years.  Also returns the 'other years' comparison."""
    e_mid = pd.Series(False, index=idx)
    e_oth = pd.Series(False, index=idx)
    for y in range(idx[0].year, idx[-1].year + 1):
        if kind == "MIDTERM":
            d = pd.Timestamp(y, 9, 30)
        else:
            d = nth_weekday(y, 11, 0, 1) + pd.Timedelta(days=1)
        p = idx.searchsorted(d, side="right") - 1
        if p < 0 or idx[p].year != y:
            continue
        if kind == "MIDTERM":
            is_ev = (y % 4 == 2)
        else:
            is_ev = (y % 2 == 0)
        (e_mid if is_ev else e_oth).iloc[p] = True
    return e_mid, e_oth


# ----------------------------------------------------------------------------- run
PUB = {"TOM": "1988-01-01", "PREHOL": "1990-01-01", "FOMC": "2011-04-01", "CPI": "2010-01-01",
       "OPEX": "2013-01-01", "POSTOPEX": "2013-01-01", "MIDTERM": "1970-01-01", "ELECTION": "1970-01-01"}


def uncond_H(df, H, lo, hi):
    aC, rfc = df["aC"], df["rf"].cumsum()
    x = aC.shift(-H) / aC - 1 - (rfc.shift(-H) - rfc)
    x = x[(x.index >= pd.Timestamp(lo)) & (x.index < pd.Timestamp(hi))].dropna()
    return float(x.mean()), float(x.std())


def run():
    rows = []
    insts = {"^GSPC": ["ideal"], "SPY": ["ideal", "open"], "QQQ": ["ideal", "open"], "IWM": ["ideal", "open"]}
    for tk, modes in insts.items():
        df = load(tk)
        idx = df.index
        S = window_signals(idx)
        for rule, (ent, ext, cap) in S.items():
            pub = pd.Timestamp(PUB[rule])
            if tk == "^GSPC":
                periods = {"pre-pub": ("1928-01-01", pub), "pub-2007": (pub, SPLIT), "2008-2026": (SPLIT, END),
                           "full": ("1928-01-01", END)}
            else:
                periods = {"IS (<2008)": (idx[0], SPLIT), "OOS (2008-)": (SPLIT, END), "post-pub": (max(pub, idx[0]), END)}
            for mode in modes:
                tr = run_rule(df, ent, mode=mode, hold=cap, exit_sig=ext, scheduled_exit=True)
                for pname, (lo, hi) in periods.items():
                    first_ev = ent[ent].index[0] if ent.any() else idx[0]
                    lo2, hi2 = max(pd.Timestamp(lo), idx[0], first_ev), min(pd.Timestamp(hi), idx[-1])
                    if hi2 <= lo2:
                        continue
                    sub = tr[(tr["signal"] >= lo2) & (tr["signal"] < hi2)] if len(tr) else tr
                    st = trade_stats(sub, lo2, hi2)
                    if not st.get("n"):
                        continue
                    H = max(int(round(st["sessions"])), 1)
                    um, us = uncond_H(df, H, lo2, hi2)
                    REG.add("calendar:" + rule, rule, tk, mode, pname, st)
                    rows.append(dict(inst=tk, rule=rule, mode=mode, period=pname, u_mean=um, u_sd=us,
                                     edge=st["mean_ex"] - um, t_edge=(st["mean_ex"] - um) / st["sd_ex"] * np.sqrt(st["n"]) if st["n"] > 1 else np.nan,
                                     **st))
        # election-cycle windows
        for kind in ("MIDTERM", "ELECTION"):
            e_ev, e_oth = calendar_entries(idx, kind)
            for H in (20, 40, 60):
                for grp, ent in (("event-years", e_ev), ("other-years", e_oth)):
                    for mode in modes:
                        tr = run_rule(df, ent, mode=mode, hold=H)
                        pub = pd.Timestamp(PUB[kind])
                        if tk == "^GSPC":
                            periods = {"pre-1970": ("1928-01-01", pub), "1970-2007": (pub, SPLIT),
                                       "2008-2026": (SPLIT, END), "full": ("1928-01-01", END)}
                        else:
                            periods = {"full": (idx[0], END)}
                        for pname, (lo, hi) in periods.items():
                            lo2, hi2 = max(pd.Timestamp(lo), idx[0]), min(pd.Timestamp(hi), idx[-1])
                            sub = tr[(tr["signal"] >= lo2) & (tr["signal"] < hi2)] if len(tr) else tr
                            st = trade_stats(sub, lo2, hi2)
                            if not st.get("n"):
                                continue
                            um, us = uncond_H(df, H, lo2, hi2)
                            if grp == "event-years":
                                REG.add("calendar:" + kind, f"{kind}|H{H}", tk, mode, pname, st)
                            rows.append(dict(inst=tk, rule=f"{kind}|H{H}|{grp}", mode=mode, period=pname,
                                             u_mean=um, u_sd=us, edge=st["mean_ex"] - um,
                                             t_edge=(st["mean_ex"] - um) / st["sd_ex"] * np.sqrt(st["n"]) if st["n"] > 1 else np.nan,
                                             **st))
                            if kind == "MIDTERM" and grp == "event-years" and tk == "^GSPC" and mode == "ideal" and pname == "full":
                                save(sub, f"midterm_trades_H{H}.csv")
    res = pd.DataFrame(rows)
    save(res, "calendar_all.csv")
    # decade table for the four short calendar rules on ^GSPC
    df = load("^GSPC")
    S = window_signals(df.index)
    drows = []
    for rule in ("TOM", "PREHOL", "FOMC", "CPI", "OPEX", "POSTOPEX"):
        ent, ext, cap = S[rule]
        tr = run_rule(df, ent, mode="ideal", hold=cap, exit_sig=ext, scheduled_exit=True)
        if not len(tr):
            continue
        tr["dec"] = (tr["signal"].dt.year // 10) * 10
        for dec, g in tr.groupby("dec"):
            H = max(int(round(g["sessions"].mean())), 1)
            um, _ = uncond_H(df, H, pd.Timestamp(f"{dec}-01-01"), pd.Timestamp(f"{dec + 10}-01-01"))
            drows.append(dict(rule=rule, decade=dec, n=len(g), mean_ex=g["excess"].mean(), u_mean=um,
                              edge=g["excess"].mean() - um, win=(g["net"] > 0).mean(),
                              t=g["excess"].mean() / g["excess"].std() * np.sqrt(len(g))))
    save(pd.DataFrame(drows), "calendar_decades.csv")
    hol = scheduled_holidays(df.index)
    save(pd.DataFrame({"date": hol.index, "holiday": hol.values}), "holidays_used.csv")
    REG.save()
    print("done", len(res))


if __name__ == "__main__":
    run()
