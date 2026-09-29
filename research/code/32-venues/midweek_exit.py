"""Track 32: under "one recommendation a week", are mid-week emergency exits worth an exception?

Test book: a leveraged index ETF held while the index closes above its 200-day average, T-bills
otherwise. This is a stand-in for the trend-filtered LETF core other tracks are designing; only the
*cadence* question is asked here, not whether the core itself is good.

Cadences compared (all trade at the NEXT session's open after the signal close):
  weekly        decide at the week's last close, act at the next open (Monday), nothing mid-week
  weekly+E1     ... plus a mid-week exit if the index closes below its 200-day average
  weekly+E2     ... plus a mid-week exit if the index is >=7% below the last weekly decision close
  weekly+E3     ... plus a mid-week exit after a one-day index fall of >=4%
  weekly+E5     ... plus a mid-week exit if the index is >=5% below the last weekly decision close
  weekly+E1slot E1, but only in a week with no order yet (the strict "one a week" reading)
  daily         decide every close (the unconstrained benchmark)
After an emergency exit the book stays in T-bills until the next weekly decision re-decides.

Leveraged-ETF model: daily return = L x index total return - (L-1) x T-bill - fee, with the fee at
0.9% a year; entry and exit at the open use the overnight gap (L x gap). Switch cost 0.05% of the
traded value. Sample A: SPY and QQQ with real opens (1993/1999-2026). Sample B: the S&P 500 index,
1960-2026, closes only, acting at the next close (Yahoo's index opens before 2010 are the prior close).

Run:  python research/code/32-venues/midweek_exit.py   ->  midweek_exit.csv next to this file
"""
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

HERE = Path(__file__).resolve().parent
FEE = 0.009 / 252
COST = 0.0005
RULES = ["weekly", "weekly+E1", "weekly+E1slot", "weekly+E2", "weekly+E3", "weekly+E5", "daily"]


def load(sym, start):
    d = yf.download(sym, start=start, progress=False, auto_adjust=False)
    d.columns = d.columns.get_level_values(0)
    irx = yf.download("^IRX", start=start, progress=False, auto_adjust=False)
    irx.columns = irx.columns.get_level_values(0)
    rf = (irx["Close"].reindex(d.index).ffill().bfill() / 100.0) / 252
    if sym.startswith("^"):  # index: price only, closes only
        c = d["Close"]
        o = None
    else:
        f = d["Adj Close"] / d["Close"]
        c, o = d["Adj Close"], d["Open"] * f
    return pd.DataFrame({"c": c, "o": o if o is not None else np.nan, "rf": rf}).dropna(subset=["c"])


def simulate(df, lev, rule, at_open=True):
    c, o, rf = df["c"].to_numpy(), df["o"].to_numpy(), df["rf"].to_numpy()
    sma = df["c"].rolling(200).mean().to_numpy()
    week = df.index.to_period("W-FRI")
    last_of_week = np.r_[week[1:] != week[:-1], True]
    n = len(c)
    val = np.ones(n)
    pos, pending, wk_ref = 0, None, np.nan
    n_switch = n_emerg = 0
    rec_weeks, emerg_weeks, switch_weeks, blocked_weeks = set(), set(), set(), set()
    start = 200
    for t in range(start + 1, n):
        r_cc = c[t] / c[t - 1] - 1
        lev_day = lev * r_cc - (lev - 1) * rf[t] - FEE
        if pending is not None and at_open:
            gap = o[t] / c[t - 1] - 1
            if pending[0] == "enter":
                r = (1 + lev_day) / (1 + lev * gap) - 1 - COST
                pos = 1
            else:
                r = lev * gap - COST
                pos = 0
            n_switch += 1
            rec_weeks.add(week[t])
            (emerg_weeks if pending[1] else switch_weeks).add(week[t])
            pending = None
        else:
            r = lev_day if pos == 1 else rf[t]
            if pending is not None:  # act at this close (close-only sample)
                pos = 1 if pending[0] == "enter" else 0
                r -= COST
                n_switch += 1
                rec_weeks.add(week[t])
                (emerg_weeks if pending[1] else switch_weeks).add(week[t])
                pending = None
        val[t] = val[t - 1] * (1 + r)
        # decisions at the close of t
        on = c[t] > sma[t]
        if rule == "daily" or last_of_week[t]:
            wk_ref = c[t]
            if on and pos == 0:
                pending = ("enter", False)
            elif not on and pos == 1:
                pending = ("exit", False)
        elif pos == 1 and rule != "weekly":
            base = rule.removesuffix("slot")
            hit = {"weekly+E1": not on,
                   "weekly+E2": c[t] <= 0.93 * wk_ref,
                   "weekly+E3": r_cc <= -0.04,
                   "weekly+E5": c[t] <= 0.95 * wk_ref}[base]
            if hit and rule.endswith("slot") and week[t] in rec_weeks:
                blocked_weeks.add(week[t])  # this week's one order is already used: wait for Sunday
                hit = False
            if hit:
                pending = ("exit", True)
                n_emerg += 1
    v = pd.Series(val[start:], index=df.index[start:])
    years = len(v) / 252
    wk = v.resample("W-FRI").last().pct_change().dropna()
    dd = (v / v.cummax() - 1).min()
    return {
        "lev": lev, "rule": rule, "CAGR_%": round(100 * (v.iloc[-1] ** (1 / years) - 1), 1),
        "maxDD_%": round(100 * dd, 1), "worst_week_%": round(100 * wk.min(), 1),
        "switches_per_yr": round(n_switch / years, 1), "emergency_exits_per_yr": round(n_emerg / years, 2),
        "weeks_with_2_recs_per_yr": round(len(emerg_weeks & switch_weeks) / years, 2),
        "blocked_exit_weeks_per_yr": round(len(blocked_weeks) / years, 2),
        "rec_weeks_per_yr": round(len(rec_weeks) / years, 1),
    }


def main():
    out = []
    samples = [("SPY", "1993-01-01", True), ("QQQ", "1999-03-10", True), ("^GSPC", "1960-01-01", False)]
    for sym, start, at_open in samples:
        df = load(sym, start)
        span = f"{df.index[200].year}-{df.index[-1].year}"
        for lev in (2, 3):
            for rule in RULES:
                row = simulate(df, lev, rule, at_open)
                row.update({"sample": f"{sym} {span}", "fill": "next open" if at_open else "next close"})
                out.append(row)
        bh = df["c"].iloc[200:] / df["c"].iloc[200]
        yrs = len(bh) / 252
        out.append({"sample": f"{sym} {span}", "fill": "-", "lev": 1, "rule": "buy and hold (1x)",
                    "CAGR_%": round(100 * (bh.iloc[-1] ** (1 / yrs) - 1), 1),
                    "maxDD_%": round(100 * (bh / bh.cummax() - 1).min(), 1)})
    res = pd.DataFrame(out)
    cols = ["sample", "fill", "lev", "rule", "CAGR_%", "maxDD_%", "worst_week_%", "switches_per_yr",
            "emergency_exits_per_yr", "weeks_with_2_recs_per_yr", "blocked_exit_weeks_per_yr", "rec_weeks_per_yr"]
    res = res[cols]
    res.to_csv(HERE / "midweek_exit.csv", index=False)
    with pd.option_context("display.width", 220, "display.max_rows", 100):
        print(res.to_string(index=False))


if __name__ == "__main__":
    main()
