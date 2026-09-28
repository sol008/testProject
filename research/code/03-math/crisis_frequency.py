"""Base rate: how often does the US market offer a 'crisis buy' (drawdown >= X% from peak)?

Counts distinct episodes in the CRSP value-weighted total-return index (Fama-French daily,
1926-07 to 2026-08). An episode starts when the drawdown first crosses the threshold and
ends when the index regains its prior peak.
"""
import numpy as np
import pandas as pd

from common import load_ff_daily, save_table

d = load_ff_daily()
w = (1 + d["mkt"]).cumprod()
dd = 1 - w / w.cummax()
rows = []
for thr in (0.20, 0.30, 0.40, 0.50):
    episodes, in_ep = [], False
    for date, x in dd.items():
        if not in_ep and x >= thr:
            in_ep, start = True, date
        elif in_ep and x == 0:
            episodes.append((start, date))
            in_ep = False
    if in_ep:
        episodes.append((start, None))
    years = (d.index[-1] - d.index[0]).days / 365.25
    rows.append({"Drawdown threshold": f"{thr:.0%}", "Episodes 1926-2026": len(episodes),
                 "Per decade": round(10 * len(episodes) / years, 1),
                 "Trigger dates": ", ".join(str(s.date())[:7] for s, _ in episodes)})
df = pd.DataFrame(rows)
save_table(df, "h_crisis_buy_frequency")
if __name__ == "__main__":
    pd.set_option("display.width", 250); pd.set_option("display.max_colwidth", 200)
    print(df.to_string())
