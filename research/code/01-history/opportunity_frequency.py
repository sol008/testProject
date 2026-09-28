"""How often do 'generational' buying opportunities occur?  Counts peak-to-recovery drawdown
episodes of at least 20/30/40/50% in the S&P 500 (since 1928) and in major foreign equity
indices (Yahoo history, mostly since the 1980s-90s).

Output: ./output/opportunity_frequency.csv
"""
from __future__ import annotations

import pandas as pd

from common import OUT_DIR, drawdown_episodes, yf_daily

INDICES = {"^GSPC": "US S&P 500", "^N225": "Japan Nikkei 225", "^GDAXI": "Germany DAX",
           "^FTSE": "UK FTSE 100", "^HSI": "Hong Kong Hang Seng", "^BVSP": "Brazil Bovespa",
           "^KS11": "Korea KOSPI", "^IXIC": "Nasdaq Composite", "^STOXX50E": "Euro Stoxx 50",
           "^MXX": "Mexico IPC", "^BSESN": "India Sensex", "000001.SS": "China Shanghai Comp."}


def main():
    rows = []
    for tk, name in INDICES.items():
        try:
            s = yf_daily(tk)["Close"].dropna()
        except Exception as e:  # noqa: BLE001
            print(tk, "failed", e)
            continue
        s = s[s > 0]
        yrs = (s.index[-1] - s.index[0]).days / 365.25
        r = dict(index=name, ticker=tk, start=s.index[0].date(), years=round(yrs, 1))
        for thr in (0.2, 0.3, 0.4, 0.5):
            eps = drawdown_episodes(s, -thr)
            r[f"n_dd_ge_{int(thr*100)}"] = len(eps)
            r[f"per_decade_ge_{int(thr*100)}"] = round(len(eps) / yrs * 10, 2)
            if thr == 0.4:
                r["episodes_ge_40"] = "; ".join(f"{e['peak'].year}-{e['trough'].year} {e['depth']:.0%}"
                                               + ("" if pd.notna(e['recovered']) else " (unrecovered)")
                                               for e in eps)
        rows.append(r)
    df = pd.DataFrame(rows)
    df.to_csv(OUT_DIR / "opportunity_frequency.csv", index=False)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_colwidth", 120)
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
