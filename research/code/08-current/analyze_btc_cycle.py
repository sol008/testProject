"""Bitcoin halving-cycle analog: days from halving to cycle peak, peak-to-trough drawdown and timing,
and where the current cycle (halving 2024-04-20) sits.

Uses yfinance BTC-USD (from 2014-09) plus hard-coded pre-2014 cycle facts (widely documented; approximate).
Output: printed table + SCRATCH/btc_cycle.csv
"""
from __future__ import annotations

import pandas as pd
import yfinance as yf

from common import SCRATCH

HALVINGS = [pd.Timestamp("2012-11-28"), pd.Timestamp("2016-07-09"), pd.Timestamp("2020-05-11"),
            pd.Timestamp("2024-04-20"), pd.Timestamp("2028-04-15")]  # 2028 date is an estimate (block-time dependent)

# Pre-yfinance cycle (2012 halving): peak ~2013-12-04 (~$1,150), trough ~2015-01-14 (~$170) -> approx figures
PRE = {"halving": "2012-11-28", "peak_date": "2013-12-04", "peak": 1150.0, "trough_date": "2015-01-14", "trough": 170.0}


def main():
    h = yf.Ticker("BTC-USD").history(start="2014-09-01", auto_adjust=False)
    hi, lo, cl = h["High"], h["Low"], h["Close"]
    hi.index = hi.index.tz_localize(None)
    lo.index = lo.index.tz_localize(None)
    cl.index = cl.index.tz_localize(None)
    rows = [{
        "halving": PRE["halving"], "peak_date": PRE["peak_date"], "peak": PRE["peak"],
        "days_halving_to_peak": (pd.Timestamp(PRE["peak_date"]) - pd.Timestamp(PRE["halving"])).days,
        "trough_date": PRE["trough_date"], "trough": PRE["trough"],
        "dd_%": (PRE["trough"] / PRE["peak"] - 1) * 100,
        "days_peak_to_trough": (pd.Timestamp(PRE["trough_date"]) - pd.Timestamp(PRE["peak_date"])).days,
    }]
    for i, hv in enumerate(HALVINGS[1:4], start=1):
        nxt = HALVINGS[i + 1]
        # cycle peaks historically land 1-1.5y after the halving; cap the window at 900d so the next cycle's
        # pre-halving rally (e.g. Mar-2024) is not mistaken for the prior cycle's peak
        win_hi = hi[(hi.index >= hv) & (hi.index < min(nxt, hv + pd.Timedelta(days=900)))]
        pk_date = win_hi.idxmax()
        pk = float(win_hi.max())
        after = lo[(lo.index > pk_date) & (lo.index < nxt)]
        # trough = min low before the next halving (for the in-progress cycle: min low to date)
        tr_date = after.idxmin() if len(after) else pd.NaT
        tr = float(after.min()) if len(after) else float("nan")
        rows.append({
            "halving": hv.date(), "peak_date": pk_date.date(), "peak": pk,
            "days_halving_to_peak": (pk_date - hv).days, "trough_date": tr_date.date() if pd.notna(tr_date) else None,
            "trough": tr, "dd_%": (tr / pk - 1) * 100,
            "days_peak_to_trough": (tr_date - pk_date).days if pd.notna(tr_date) else None,
        })
    df = pd.DataFrame(rows)
    df.to_csv(SCRATCH / "btc_cycle.csv", index=False)
    pd.set_option("display.width", 220)
    print(df.to_string())
    last = float(cl.iloc[-1])
    cur_pk = df.iloc[-1]
    today = cl.index[-1]
    print(f"\nToday {today.date()} BTC close {last:,.0f}; days since 2024 halving: {(today - HALVINGS[3]).days}; "
          f"days since cycle peak: {(today - pd.Timestamp(cur_pk['peak_date'])).days}; "
          f"drawdown from peak: {(last / cur_pk['peak'] - 1) * 100:.1f}%; bounce off 2026 low: {(last / cur_pk['trough'] - 1) * 100:.1f}%")
    # Historical analog: trough typically ~360-410 days after peak
    for d in (363, 376, 406):
        print(f"  peak + {d}d = {(pd.Timestamp(cur_pk['peak_date']) + pd.Timedelta(days=d)).date()}")
    # 200-week moving average (classic cycle-floor gauge)
    wk = cl.resample("W").last()
    ma200w = wk.rolling(200).mean().iloc[-1]
    print(f"200-week MA: {ma200w:,.0f} (price/200wMA = {last / ma200w:.2f})")
    # Realized-price proxy unavailable without on-chain data; note in report.


if __name__ == "__main__":
    main()
