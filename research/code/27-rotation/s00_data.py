"""Download (or reuse from cache) every series track 27 uses and write a coverage table."""
from __future__ import annotations

import pandas as pd

import common27 as K

ETFS = (["SPY", "QQQ", "IWM", "MDY"] + K.SECTORS9 + ["SMH", "SOXX", "EFA", "EEM", "VEU", "SCZ"]
        + K.COUNTRIES + ["TLT", "IEF", "GLD", "DBC", "AGG", "IBIT"]
        + ["QLD", "TQQQ", "SSO", "UPRO", "SOXL", "USD", "ROM", "BTC-USD"])


def main():
    rows = []
    for t in ETFS:
        try:
            df = K.yf_raw(t)
            df = df.loc[:K.ASOF]
            rows.append(dict(ticker=t, first=df.index[0].date(), last=df.index[-1].date(), sessions=len(df),
                             cost_bps=K.cost_of("BTC" if t == "BTC-USD" else t)))
        except Exception as e:  # noqa: BLE001
            rows.append(dict(ticker=t, first=None, last=None, sessions=0, cost_bps=None, error=str(e)[:80]))
    b = K.btc_series()
    rows.append(dict(ticker="BTC (Coin Metrics + Yahoo)", first=b.index[0].date(), last=b.index[-1].date(),
                     sessions=len(b), cost_bps=K.cost_of("BTC")))
    K.fred("DTB3")
    for name in ("10_Industry_Portfolios_daily", "12_Industry_Portfolios_daily", "49_Industry_Portfolios_daily",
                 "F-F_Research_Data_Factors_daily"):
        tab = K.kf_daily_table(name)
        rows.append(dict(ticker=f"KF {name}", first=tab.index[0].date(), last=tab.index[-1].date(),
                         sessions=len(tab), cost_bps=5.0))
    out = pd.DataFrame(rows)
    K.save(out, "data_coverage.csv")
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
