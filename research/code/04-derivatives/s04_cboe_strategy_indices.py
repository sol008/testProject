"""CBOE benchmark strategy indices built from REAL traded option prices.

These complement the synthetic back-test (s02), which has to model option prices:
  PPUT  S&P 500 5% Put Protection: long SPX + long monthly 5%-OTM SPX put (1986-)
  VXTH  VIX Tail Hedge: long SPX + 1-month 30-delta VIX calls, size by VIX level (2006-)
  PUT   S&P 500 PutWrite: short ATM monthly SPX puts, T-bill collateral (1986-/1991- here)
  BXM   S&P 500 BuyWrite: long SPX + short 1-month ATM call
  CLL   S&P 500 95-110 Collar
Benchmark: S&P 500 total return (^SP500TR, 1988-).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT, cagr, cboe, fred, max_drawdown, yf_close


def main():
    idx = {s: cboe(s) for s in ["PPUT", "VXTH", "PUT", "BXM", "CLL"]}
    spxtr = yf_close("^SP500TR", start="1988-01-01").rename("SPXTR")
    spx = yf_close("^GSPC").rename("SPX")
    rf = (fred("DTB3") / 100)
    rows = []
    for name, s in idx.items():
        df = pd.concat([s.rename(name), spxtr], axis=1).dropna()
        m = df.resample("ME").last()
        rm = m.pct_change().dropna()
        rfm = (rf.resample("ME").last().reindex(rm.index).ffill() / 12)
        ex = rm.sub(rfm, axis=0)
        rows.append(dict(index=name, start=df.index[0].date(), end=df.index[-1].date(),
                         cagr=cagr(df[name]), spxtr_cagr=cagr(df.SPXTR),
                         cagr_gap_vs_spxtr=cagr(df[name]) - cagr(df.SPXTR),
                         vol=rm[name].std() * np.sqrt(12), spxtr_vol=rm.SPXTR.std() * np.sqrt(12),
                         sharpe=ex[name].mean() / ex[name].std() * np.sqrt(12),
                         spxtr_sharpe=ex.SPXTR.mean() / ex.SPXTR.std() * np.sqrt(12),
                         maxdd=max_drawdown(df[name]), spxtr_maxdd=max_drawdown(df.SPXTR),
                         worst_month=rm[name].min(), spxtr_worst_month=rm.SPXTR.min(),
                         beta=np.cov(rm[name], rm.SPXTR)[0, 1] / rm.SPXTR.var()))
    res = pd.DataFrame(rows)
    res.to_csv(OUT / "cboe_indices_summary.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        print(res.round(3).to_string(index=False))

    # crisis windows
    ev = []
    wins = [("1987 crash (Oct 1987, vs SPX price)", "1987-10-01", "1987-10-30"),
            ("GFC 2007-10-09..2009-03-09", "2007-10-09", "2009-03-09"),
            ("COVID 2020-02-19..2020-03-23", "2020-02-19", "2020-03-23"),
            ("2022 bear 2022-01-03..2022-10-12", "2022-01-03", "2022-10-12"),
            ("2018-02 Volmageddon 02-01..02-09", "2018-02-01", "2018-02-09"),
            ("2025-04 tariff shock 02-19..04-08", "2025-02-19", "2025-04-08")]
    for lab, a, b in wins:
        row = {"window": lab}
        for name, s in list(idx.items()) + [("SPXTR", spxtr), ("SPX", spx)]:
            x = s.loc[:b]
            x0 = s.loc[:a]
            if len(x0) == 0 or x0.index[-1] < pd.Timestamp(a) - pd.Timedelta(days=7):
                row[name] = np.nan
                continue
            row[name] = x.iloc[-1] / x0.iloc[-1] - 1 if len(x) else np.nan
        ev.append(row)
    ev = pd.DataFrame(ev)
    ev.to_csv(OUT / "cboe_indices_crises.csv", index=False, float_format="%.4f")
    print(ev.round(3).to_string(index=False))

    # calendar-year returns of PPUT/VXTH vs SPXTR (how often does protection pay?)
    yr = pd.concat([idx["PPUT"].rename("PPUT"), idx["VXTH"].rename("VXTH"), spxtr], axis=1).resample("YE").last().pct_change()
    yr["PPUT-SPXTR"] = yr.PPUT - yr.SPXTR
    yr["VXTH-SPXTR"] = yr.VXTH - yr.SPXTR
    yr.index = yr.index.year
    yr.to_csv(OUT / "cboe_hedge_calendar_years.csv", float_format="%.4f")
    print(yr.dropna(how="all").round(3).to_string())
    print("share of years PPUT beat SPXTR:", round((yr["PPUT-SPXTR"].dropna() > 0).mean(), 3),
          " mean gap:", round(yr["PPUT-SPXTR"].dropna().mean(), 4))
    print("share of years VXTH beat SPXTR:", round((yr["VXTH-SPXTR"].dropna() > 0).mean(), 3),
          " mean gap:", round(yr["VXTH-SPXTR"].dropna().mean(), 4))


if __name__ == "__main__":
    main()
