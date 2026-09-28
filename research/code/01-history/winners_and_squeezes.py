"""Verify the headline multiples of famous modern trades from market data, and measure the
pain a holder had to sit through (drawdowns), plus how much of a squeeze/mania peak was
retained afterwards.

Outputs (./output):
  episodes.csv            entry -> peak -> latest multiples for named trades
  long_winner_pain.csv    full-history drawdown statistics for famous compounders
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DIR, drawdown_episodes, max_drawdown, yf_daily

# (label, ticker, entry window start, entry window end, peak window end, note)
# Entry = lowest close inside the entry window (i.e. the best-case, hindsight entry);
# peak = highest close between entry and `peak_end`.
EPISODES = [
    ("Keith Gill-style GME (2019 low -> Jan-2021 squeeze)", "GME", "2019-06-01", "2020-04-30", "2021-03-31"),
    ("GME: Jan-2021 squeeze peak -> today", "GME", "2021-01-27", "2021-01-27", "2021-01-27"),
    ("AMC meme squeeze (Dec-2020 low -> Jun-2021)", "AMC", "2020-12-01", "2021-01-15", "2021-07-31"),
    ("Volkswagen ord. squeeze (Oct-2008)", "VOW.DE", "2008-10-01", "2008-10-24", "2008-10-31"),
    ("Tesla 2019 low -> 2021 peak", "TSLA", "2019-05-01", "2019-07-31", "2021-12-31"),
    ("MicroStrategy BTC pivot (Aug-2020 -> Nov-2024)", "MSTR", "2020-07-01", "2020-08-10", "2024-12-31"),
    ("Nvidia 2022 low -> AI boom", "NVDA", "2022-09-01", "2022-10-31", "2026-09-30"),
    ("Carvana 2022 low -> recovery", "CVNA", "2022-12-01", "2023-01-31", "2026-09-30"),
    ("Palantir 2022 low -> 2025/26", "PLTR", "2022-12-01", "2023-01-31", "2026-09-30"),
    ("Super Micro 2022 -> Mar-2024 peak", "SMCI", "2022-01-01", "2022-06-30", "2024-12-31"),
    ("Bitcoin 2015 low -> 2017 peak", "BTC-USD", "2015-01-01", "2015-12-31", "2017-12-31"),
    ("Bitcoin 2018 low -> 2021 peak", "BTC-USD", "2018-12-01", "2019-01-31", "2021-12-31"),
    ("Bitcoin 2022 low -> 2025 peak", "BTC-USD", "2022-11-01", "2022-12-31", "2025-12-31"),
    ("Ether 2018 low -> 2021 peak", "ETH-USD", "2018-12-01", "2019-01-31", "2021-12-31"),
    ("Solana 2020 -> 2021 peak", "SOL-USD", "2020-05-01", "2020-06-30", "2021-12-31"),
    ("Solana 2022 low -> 2025 peak", "SOL-USD", "2022-12-01", "2023-01-31", "2025-12-31"),
    ("Hertz (post-bankruptcy HTZ) 2021 listing -> today", "HTZ", "2021-11-01", "2021-11-30", "2026-09-30"),
    ("Gold: 2024 -> 2026 peak", "GC=F", "2024-01-01", "2024-02-29", "2026-09-30"),
    ("Silver: 2024 -> 2026 peak", "SI=F", "2024-01-01", "2024-02-29", "2026-09-30"),
]

LONG_WINNERS = ["NVDA", "AMZN", "AAPL", "MSFT", "NFLX", "MNST", "TSLA", "BRK-A", "MSTR", "BTC-USD",
                "ETH-USD", "SOL-USD", "CSCO", "INTC", "GME", "CVNA", "PLTR", "SMCI", "^IXIC", "^GSPC"]


def episodes() -> pd.DataFrame:
    rows = []
    for label, tk, e0, e1, pend in EPISODES:
        s = yf_daily(tk)["Close"].dropna()
        s = s[s > 0]
        win = s.loc[e0:e1]
        if win.empty:
            continue
        entry_date = win.idxmin() if e0 != e1 else win.index[0]
        entry = float(s.loc[entry_date])
        after = s.loc[entry_date:pend]
        peak_date = after.idxmax()
        peak = float(after.max())
        # drawdown suffered between entry and peak (path pain)
        path = s.loc[entry_date:peak_date]
        dd_before_peak = float((path / path.cummax() - 1).min())
        last = float(s.iloc[-1])
        post = s.loc[peak_date:]
        rows.append(dict(
            trade=label, ticker=tk, entry_date=entry_date.date(), entry=round(entry, 4),
            peak_date=peak_date.date(), peak=round(peak, 2),
            entry_to_peak_x=round(peak / entry, 1),
            months_entry_to_peak=round((peak_date - entry_date).days / 30.44, 1),
            worst_dd_while_holding_to_peak=round(dd_before_peak, 3),
            dd_after_peak_to_low=round(float(post.min() / peak - 1), 3),
            latest_date=s.index[-1].date(), latest=round(last, 2),
            entry_to_latest_x=round(last / entry, 1),
            share_of_peak_gain_retained=round((last - entry) / (peak - entry), 2) if peak > entry else np.nan,
        ))
    return pd.DataFrame(rows)


def long_winner_pain() -> pd.DataFrame:
    rows = []
    for tk in LONG_WINNERS:
        d = yf_daily(tk)
        s = d["AdjClose"].dropna() if "AdjClose" in d else d["Close"].dropna()
        s = s[s > 0]
        eps = drawdown_episodes(s, -0.5)
        # longest time below a prior all-time high (years)
        under = (s < s.cummax())
        longest, cur, start = 0, 0, None
        runs = []
        for dt, u in under.items():
            if u and start is None:
                start = dt
            if not u and start is not None:
                runs.append((dt - start).days)
                start = None
        if start is not None:
            runs.append((s.index[-1] - start).days)
        rows.append(dict(
            ticker=tk, first_date=s.index[0].date(), years=round((s.index[-1] - s.index[0]).days / 365.25, 1),
            total_mult_first_to_latest=round(float(s.iloc[-1] / s.iloc[0]), 0),
            CAGR=round(float((s.iloc[-1] / s.iloc[0]) ** (365.25 / (s.index[-1] - s.index[0]).days) - 1), 3),
            max_drawdown=round(max_drawdown(s), 3),
            n_drawdowns_ge_50pct=len(eps),
            drawdown_episodes=", ".join(f"{e['peak'].year}-{e['trough'].year}:{e['depth']:.0%}" for e in eps),
            longest_underwater_years=round(max(runs) / 365.25, 1) if runs else 0.0,
            latest_vs_ATH=round(float(s.iloc[-1] / s.max() - 1), 3),
        ))
    return pd.DataFrame(rows)


def main():
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.max_colwidth", 80)
    e = episodes()
    e.to_csv(OUT_DIR / "episodes.csv", index=False)
    print(e.to_string(index=False))
    print()
    w = long_winner_pain()
    w.to_csv(OUT_DIR / "long_winner_pain.csv", index=False)
    print(w.to_string(index=False))


if __name__ == "__main__":
    main()
