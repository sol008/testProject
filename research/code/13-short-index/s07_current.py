"""Track 13: what is firing or near-firing at the latest close (2026-09-28).

Prints and saves the state of every rule tested in this track for the US index ETFs,
sector SPDRs and country ETFs, plus the calendar of scheduled windows for the next ~90 days.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common13 import TODAY, down_streak, drawdown, load, rsi_wilder, save, sma
from s04_calendar import (cpi_dates, fomc_dates, nth_weekday, scheduled_holidays,
                          third_fridays)

UNIVERSE = ["SPY", "QQQ", "IWM", "DIA", "EFA", "EEM",
            "XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY",
            "EWA", "EWC", "EWD", "EWG", "EWH", "EWI", "EWJ", "EWK", "EWL", "EWM", "EWN", "EWO",
            "EWP", "EWQ", "EWS", "EWU", "EWW", "EWT", "EWY", "EWZ", "EZA", "FXI"]


def rsi_close_needed(c: pd.Series, target: float = 10.0) -> float:
    """Close tomorrow that would put RSI(2) exactly at `target` (bisection on the price)."""
    lo, hi = c.iloc[-1] * 0.85, c.iloc[-1] * 1.05
    for _ in range(60):
        mid = (lo + hi) / 2
        r = rsi_wilder(pd.concat([c, pd.Series([mid], index=[c.index[-1] + pd.Timedelta(days=1)])]), 2).iloc[-1]
        if r < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def state():
    rows = []
    for tk in UNIVERSE:
        df = load(tk)
        c = df["C"]
        r2 = rsi_wilder(c, 2)
        s200 = sma(c, 200)
        m20, sd20 = sma(c, 20), c.rolling(20).std()
        last = c.index[-1]
        need = rsi_close_needed(c, 10.0)
        rows.append(dict(
            ticker=tk, date=last.date(), close=round(float(c.iloc[-1]), 2),
            ret_1d=float(c.iloc[-1] / c.iloc[-2] - 1), sma200=round(float(s200.iloc[-1]), 2),
            above200=bool(c.iloc[-1] > s200.iloc[-1]), pct_vs_200=float(c.iloc[-1] / s200.iloc[-1] - 1),
            rsi2=round(float(r2.iloc[-1]), 1), down_streak=int(down_streak(c).iloc[-1]),
            pctB=float((c.iloc[-1] - (m20.iloc[-1] - 2 * sd20.iloc[-1])) / (4 * sd20.iloc[-1])),
            sma5=round(float(sma(c, 5).iloc[-1]), 2),
            close_for_rsi2_lt10=round(float(need), 2), move_needed=float(need / c.iloc[-1] - 1),
            dd_from_high=float(drawdown(c).iloc[-1]),
            hi20=bool(c.iloc[-1] > c.iloc[-21:-1].max()), hi55=bool(c.iloc[-1] > c.iloc[-56:-1].max()),
            mom1m=float(df["aC"].iloc[-1] / df["aC"].iloc[-22] - 1),
            mom3m=float(df["aC"].iloc[-1] / df["aC"].iloc[-64] - 1),
            dip_signal_today=bool((r2.iloc[-1] < 10) and (c.iloc[-1] > s200.iloc[-1])),
        ))
    st = pd.DataFrame(rows)
    save(st, "current_state_etfs.csv")
    # market-wide gauges
    g = load("^GSPC")
    vix = load("^VIX")["C"]
    v3 = load("^VIX3M")["C"]
    v9 = load("^VIX9D")["C"]
    gauges = dict(
        date=g.index[-1].date(), spx=float(g["C"].iloc[-1]), spx_1d=float(g["C"].iloc[-1] / g["C"].iloc[-2] - 1),
        spx_dd=float(drawdown(g["C"]).iloc[-1]), spx_ath=float(g["C"].cummax().iloc[-1]),
        spx_above200=bool(g["C"].iloc[-1] > sma(g["C"], 200).iloc[-1]),
        vix=float(vix.iloc[-1]), vix_1d=float(vix.iloc[-1] / vix.iloc[-2] - 1),
        vix3m=float(v3.iloc[-1]), vix_over_vix3m=float(vix.iloc[-1] / v3.iloc[-1]),
        vix9d=float(v9.iloc[-1]), vix_max_20d=float(vix.iloc[-20:].max()),
        vix_ratio_max_20d=float((vix / v3).iloc[-20:].max()),
        vix_needed_for_ratio_1=float(v3.iloc[-1]),
        spx_level_minus10=float(g["C"].cummax().iloc[-1] * 0.9),
        spx_level_minus15=float(g["C"].cummax().iloc[-1] * 0.85),
    )
    save(pd.DataFrame([gauges]), "current_state_gauges.csv")
    # scheduled calendar windows (next ~90 days)
    spy = load("SPY")
    future = pd.bdate_range(TODAY + pd.Timedelta(days=1), TODAY + pd.Timedelta(days=100))
    hol_2026 = pd.to_datetime(["2026-11-26", "2026-12-25", "2027-01-01"])
    sessions = future.difference(hol_2026)
    cal = []
    # TOM windows
    for p in pd.period_range(TODAY, TODAY + pd.Timedelta(days=100), freq="M"):
        ms = sessions[sessions.to_period("M") == p]
        if len(ms) == 0:
            continue
        lastd = ms[-1]
        nxt = sessions[sessions > lastd][:3]
        before = sessions[sessions < lastd]
        entry = before[-1] if len(before) else TODAY
        cal.append(dict(rule="TOM (dead after 2008)", entry_close=entry.date(), exit_close=nxt[-1].date() if len(nxt) == 3 else None))
    for h in hol_2026:
        pre = sessions[sessions < h]
        if len(pre) >= 2:
            cal.append(dict(rule="PREHOL (weak)", entry_close=pre[-2].date(), exit_close=pre[-1].date()))
    for d in [x for x in fomc_dates() if x > TODAY]:
        pre = sessions[sessions < d]
        cal.append(dict(rule="FOMC (dead)", entry_close=pre[-1].date() if len(pre) else TODAY.date(), exit_close=d.date()))
    for d in [x for x in cpi_dates() if x > TODAY]:
        pre = sessions[sessions < d]
        cal.append(dict(rule="CPI (dead)", entry_close=pre[-1].date() if len(pre) else TODAY.date(), exit_close=d.date()))
    for f in third_fridays(pd.DatetimeIndex(sessions)):
        cal.append(dict(rule="OPEX week (no edge)", entry_close=(f - pd.Timedelta(days=7)).date(), exit_close=f.date()))
    # midterm window: last September session of 2026 = 2026-09-30
    mid_entry = pd.Timestamp("2026-09-30")
    mid_exit = sessions[sessions > mid_entry][59]
    cal.append(dict(rule="MIDTERM Q4 (weak, t~1.9)", entry_close=mid_entry.date(), exit_close=mid_exit.date()))
    elec = nth_weekday(2026, 11, 0, 1) + pd.Timedelta(days=1)
    cal.append(dict(rule="ELECTION drift (no edge)", entry_close=elec.date(),
                    exit_close=sessions[sessions > elec][19].date()))
    cal = pd.DataFrame(cal).sort_values("entry_close")
    save(cal, "current_calendar.csv")
    return st, gauges, cal


if __name__ == "__main__":
    st, gauges, cal = state()
    pd.set_option("display.width", 250)
    print(pd.Series(gauges).to_string())
    cols = ["ticker", "close", "ret_1d", "above200", "pct_vs_200", "rsi2", "down_streak", "pctB",
            "close_for_rsi2_lt10", "move_needed", "dd_from_high", "hi20", "hi55", "mom1m", "mom3m", "dip_signal_today"]
    x = st[cols].copy()
    for c in ["ret_1d", "pct_vs_200", "move_needed", "dd_from_high", "mom1m", "mom3m", "pctB"]:
        x[c] = (100 * x[c]).round(2)
    print(x.to_string(index=False))
    print(cal.to_string(index=False))
