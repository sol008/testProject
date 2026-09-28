"""Preset comparison for 00-SYNTHESIS.md §10 (after the red-team review, track 12).

Question: what does each candidate risk preset have earned on US history (1928-2026), and under a
"muted" scenario in which equities earn 3.3 points a year less (the adjustment track 03 uses to
bring history close to current long-run forecasts)?

Data
  * Equity total return: Fama-French daily Mkt-RF + RF (CRSP value-weighted market), 1926-2026.
  * Cash: Fama-French daily RF (1-month T-bills).
  * Crash triggers: S&P 500 price index (^GSPC) drawdown from its running all-time high.
  * Expensive-regime test: Shiller CAPE > 30 (file ends 2023-09, forward-filled) or price > 1.3x its
    10-year average, evaluated when an episode's first trigger fires.

Presets
  index        100% equity, bought once, never touched.
  growth_15    85% core / 15% T-bill reserve, plus crash tranches funded from the reserve.
  growth_30    70% core / 30% T-bill reserve, plus crash tranches funded from the reserve.
  static_70_30 70/30 without tranches (to isolate what the tranches add).
  conservative 100% equity with a 10-month moving-average switch to T-bills (month-end signal).
  growth_plus  1.3x equity (daily-rebalanced, financed at T-bill + 0.5%) with the same trend switch.

Crash-tranche rules (the revised S2 in the synthesis)
  * Tranches are shares of the reserve balance when the episode's first trigger fires:
      normal regime:    -20/-30/-40/-50% -> 10/20/30/40% of that reserve balance;
      expensive regime: -30/-40/-50%     -> 25/35/40%.
  * Executed at the next close; never funded beyond the reserve (gross exposure <= 1.0x).
  * Not subject to the drawdown governor.
  * Exit: the index closes at or above the pre-crash high -> the tranche returns to the reserve.
    Time stop at 5 years -> the tranche merges into the core (no sale).
  * Reserve rebalancing: once a year, only when no tranche is open, and only if the reserve has drifted
    outside [0.5x, 1.5x] of its target share.

Everything is pre-tax and pre-cost. Rolling windows start every quarter and overlap, so the counts
are not independent observations. US history is the survivor market; treat P(11x) as optimistic.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
MUTED_SHIFT = 0.033  # equity log-return reduction per year in the muted scenario (track 03)

# --- data -----------------------------------------------------------------------------------------
ff = pd.read_csv(BASE / "02-academic/data/F-F_Research_Data_Factors_daily.csv", skiprows=4, index_col=0)
ff = ff[pd.to_numeric(ff.index, errors="coerce").notna()]
ff.index = pd.to_datetime(ff.index.astype(str).str.strip(), format="%Y%m%d")
ff = ff.apply(pd.to_numeric, errors="coerce").dropna() / 100.0
dates = ff.index[(ff.index >= "1928-01-03")]
mkt_hist = (ff["Mkt-RF"] + ff["RF"]).loc[dates].values
rf = ff["RF"].loc[dates].values

gspc = yf.download("^GSPC", start="1927-12-01", end="2026-10-01", progress=False, auto_adjust=True)["Close"].squeeze()
gspc = gspc.reindex(gspc.index.union(dates)).ffill().reindex(dates).values

sh = pd.read_excel(BASE / "02-academic/data/ie_data.xls", sheet_name="Data", skiprows=7)
sh = sh[["Date", "CAPE"]].dropna()
sh = sh[pd.to_numeric(sh["CAPE"], errors="coerce").notna()]
sh["dt"] = [pd.Timestamp(year=int(x), month=max(1, min(12, int(round((x - int(x)) * 100)))), day=1)
            for x in sh["Date"].astype(float)]
cape = (pd.Series(sh["CAPE"].astype(float).values, index=sh["dt"]).sort_index()
        .reindex(pd.date_range("1881-01-01", dates[-1], freq="D")).ffill().reindex(dates).values)

N = len(dates)
YEARS = dates.year.values
# Calendar time. The Fama-French calendar includes Saturday sessions before 1952, so trading-day counts
# are not a reliable clock; everything time-based uses calendar days.
T_YEARS = (dates - dates[0]).days.values / 365.25
DT = np.r_[0.0, np.diff(T_YEARS)]  # year fraction elapsed since the previous session
# month-end flags for the trend switch (signal at the month's last trading day, trade next day)
month_end = np.r_[dates.month.values[1:] != dates.month.values[:-1], True]


def scenario(muted: bool):
    """Return (equity daily returns, trigger price path) for a scenario."""
    if not muted:
        return mkt_hist, gspc
    mkt = np.expm1(np.log1p(mkt_hist) - MUTED_SHIFT * DT)
    px = gspc * np.exp(-MUTED_SHIFT * T_YEARS)
    return mkt, px


def trend_signal(px):
    """Invested flag per day: month-end price >= 10-month SMA of month-end prices, applied next day."""
    me_idx = np.where(month_end)[0]
    me_px = px[me_idx]
    sma = pd.Series(me_px).rolling(10, min_periods=10).mean().values
    inv = np.ones(N, dtype=bool)
    state = True
    j = 0
    for k, i in enumerate(me_idx):
        # days after this month-end until the next one take this month-end's signal
        nxt = me_idx[k + 1] if k + 1 < len(me_idx) else N - 1
        if not np.isnan(sma[k]):
            state = me_px[k] >= sma[k]
        inv[i + 1:nxt + 1] = state
    return inv


def run_trend(start, end, mkt, inv, lev=1.0, fin_spread=0.005):
    W = np.empty(end - start)
    w = 1.0
    for j, i in enumerate(range(start, end)):
        if j > 0:
            if inv[i]:
                r = lev * mkt[i] - (lev - 1.0) * (rf[i] + fin_spread * DT[i])
            else:
                r = rf[i]
            w *= 1.0 + r
        W[j] = w
    return W


def run_tranche(start, end, mkt, px, avg10, core_w, tranches=True):
    s0_target = 1.0 - core_w
    s1, s0 = core_w, s0_target
    ath = px[:start + 1].max()
    episode_open = False
    sched: dict[float, float] = {}
    s0_snap = 0.0
    fired: set[float] = set()
    pending: list[tuple[int, float]] = []
    open_tr: list[list] = []  # [value, entry_i, ath_ref]
    last_year = YEARS[start]
    W = np.empty(end - start)
    for j, i in enumerate(range(start, end)):
        if j > 0:
            s1 *= 1.0 + mkt[i]
            s0 *= 1.0 + rf[i]
            for tr in open_tr:
                tr[0] *= 1.0 + mkt[i]
        # execute pending tranche buys at today's close
        still = []
        for exec_i, frac in pending:
            if exec_i == i:
                amt = min(frac * s0_snap, s0)
                if amt > 0:
                    s0 -= amt
                    open_tr.append([amt, i, ath])
            else:
                still.append((exec_i, frac))
        pending = still
        # tranche exits
        keep = []
        for tr in open_tr:
            if px[i] >= tr[2]:
                s0 += tr[0]
            elif T_YEARS[i] - T_YEARS[tr[1]] >= 5.0:
                s1 += tr[0]
            else:
                keep.append(tr)
        open_tr = keep
        # all-time-high bookkeeping and triggers
        if px[i] >= ath:
            ath = px[i]
            episode_open = False
            fired = set()
        dd = px[i] / ath - 1.0
        if tranches and i + 1 < end:
            if not episode_open and dd <= -0.20:
                episode_open = True
                expensive = (not np.isnan(cape[i]) and cape[i] > 30) or (not np.isnan(avg10[i]) and px[i] > 1.3 * avg10[i])
                sched = ({-0.30: 0.25, -0.40: 0.35, -0.50: 0.40} if expensive
                         else {-0.20: 0.10, -0.30: 0.20, -0.40: 0.30, -0.50: 0.40})
                s0_snap = s0
            if episode_open:
                for thr, frac in sched.items():
                    if dd <= thr and thr not in fired:
                        fired.add(thr)
                        pending.append((i + 1, frac))
        # yearly reserve rebalancing, only outside the band and with nothing open
        if YEARS[i] != last_year:
            last_year = YEARS[i]
            tot = s1 + s0 + sum(t[0] for t in open_tr)
            if not open_tr and not pending and s0_target > 0:
                share = s0 / tot
                if share < 0.5 * s0_target or share > 1.5 * s0_target:
                    s0, s1 = s0_target * tot, (1 - s0_target) * tot
        W[j] = s1 + s0 + sum(t[0] for t in open_tr)
    return W


def stats(W_full):
    cagr = W_full[-1] ** (1.0 / T_YEARS[len(W_full) - 1]) - 1.0
    peak = np.maximum.accumulate(W_full)
    mdd = (W_full / peak - 1.0).min()
    return cagr, mdd


def main():
    rows = []
    for muted in (False, True):
        mkt, px = scenario(muted)
        avg10 = pd.Series(px, index=dates).rolling("3652D", min_periods=1500).mean().values  # 10 calendar years
        inv = trend_signal(px)
        presets = {
            "index": lambda s, e: np.cumprod(np.r_[1.0, 1.0 + mkt[s + 1:e]]),
            "growth_15": lambda s, e: run_tranche(s, e, mkt, px, avg10, 0.85),
            "growth_30": lambda s, e: run_tranche(s, e, mkt, px, avg10, 0.70),
            "static_70_30": lambda s, e: run_tranche(s, e, mkt, px, avg10, 0.70, tranches=False),
            "conservative": lambda s, e: run_trend(s, e, mkt, inv, 1.0, 0.0),
            "growth_plus": lambda s, e: run_trend(s, e, mkt, inv, 1.3, 0.005),
        }
        starts = [i for i in range(0, N) if i == 0 or (dates[i].quarter != dates[i - 1].quarter)]
        for name, fn in presets.items():
            full = fn(0, N)
            cagr, mdd = stats(full)
            res = {"scenario": "muted" if muted else "historical", "preset": name,
                   "cagr_pct": round(cagr * 100, 2), "max_drawdown_pct": round(mdd * 100, 1)}
            for yrs in (10, 20):
                mult = []
                for s in starts:
                    e = int(np.searchsorted(T_YEARS, T_YEARS[s] + yrs))
                    if e < N:
                        Wp = fn(s, e + 1)
                        mult.append(Wp[-1] / Wp[0])
                mult = np.array(mult)
                res[f"p11x_{yrs}y_pct"] = round((mult >= 11).mean() * 100, 1)
                res[f"median_{yrs}y_x"] = round(float(np.median(mult)), 2)
                res[f"p05_{yrs}y_x"] = round(float(np.percentile(mult, 5)), 2)
                res[f"p_loss_{yrs}y_pct"] = round((mult < 1).mean() * 100, 1)
                res[f"n_windows_{yrs}y"] = len(mult)
            rows.append(res)
            print(res, flush=True)
    out = pd.DataFrame(rows)
    out.to_csv(HERE / "preset_backtest.csv", index=False)
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
