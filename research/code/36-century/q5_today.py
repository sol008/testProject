"""Q5: what the meta-rule would hold today (data to 2026-09-28), in the instruments the owner can buy
with one dollar market order each on Robinhood (country ETFs, GLD, DBC, IBIT, TLT, SPY, LETFs).

Output: q5_today_ranking.csv
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import data36 as D
from q3_meta_rule import COUNTRY_ETFS

OUT = D.RESULTS
EXTRA = {"GLD": "Gold", "DBC": "Commodities", "TLT": "US 20y Treasuries", "IBIT": "Bitcoin (spot ETF)", "QQQ": "Nasdaq-100",
         "SOXX": "Semiconductors", "SSO": "2x S&P 500", "UPRO": "3x S&P 500", "BIL": "T-bills"}


def run() -> None:
    rows = []
    for t, name in {**COUNTRY_ETFS, **EXTRA}.items():
        try:
            px = D.yf_close(t)
        except Exception:
            continue
        m = D.month_end(px)
        m = m[m.index <= D.ASOF]
        if len(m) < 13:
            continue
        last = float(px.iloc[-1])
        sma10 = float(m.iloc[-10:].mean())
        rows.append({"ticker": t, "name": name, "last_date": str(px.index[-1].date()), "last": last,
                     "ret_12m": last / float(m.iloc[-13]) - 1, "ret_6m": last / float(m.iloc[-7]) - 1,
                     "ret_3m": last / float(m.iloc[-4]) - 1, "ret_1m": last / float(m.iloc[-2]) - 1,
                     "above_10m_sma": last > sma10, "pct_vs_10m_sma": last / sma10 - 1})
    df = pd.DataFrame(rows).set_index("ticker").sort_values("ret_12m", ascending=False)
    bill12 = float(np.exp(np.log1p(D.fred("TB3MS").iloc[-12:] / 1200).sum()) - 1)
    df["eligible"] = df["above_10m_sma"] & (df["ret_12m"] > bill12)
    df.to_csv(os.path.join(OUT, "q5_today_ranking.csv"))
    with pd.option_context("display.width", 250):
        print(df.round(3).to_string())
    elig = df[df.eligible & ~df.index.isin(["SSO", "UPRO", "BIL"])]
    print("\n12-month bill return: %.3f" % bill12)
    print("Meta-rule top-1 today:", elig.index[0] if len(elig) else "bills")
    print("Meta-rule top-3 today:", list(elig.index[:3]))


if __name__ == "__main__":
    run()
