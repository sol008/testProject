"""
Path statistics for famous multibaggers: how brutal was holding them?
Stocks from Yahoo (total-return adjusted daily closes); BTC (2010-) and ETH (2015-) from Coin Metrics
community API reference prices (downloaded by 10_crypto_download.py).
Outputs results/famous_drawdowns.md and .csv
"""
import os, json, sys
import numpy as np
import pandas as pd
import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mdtable import md

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
RES = "/home/user/testProject/research/code/07-multibaggers/results"
os.makedirs(RES, exist_ok=True)

STOCKS = ["AMZN", "AAPL", "NFLX", "NVDA", "TSLA", "MNST", "AXON", "PLTR", "APP"]
cache = os.path.join(SCR, "famous_prices.pkl")
if os.path.exists(cache):
    px = pd.read_pickle(cache)
else:
    raw = yf.download(STOCKS, start="1980-01-01", end="2026-09-29", auto_adjust=True, progress=False,
                      group_by="ticker")
    px = {t: raw[t]["Close"].dropna() for t in STOCKS}
    for a in ("btc", "eth"):
        rows = json.load(open(os.path.join(SCR, "crypto", f"cm_{a}.json")))
        s = pd.Series({pd.Timestamp(r["time"][:10]): float(r["PriceUSD"]) for r in rows}).sort_index()
        px[a.upper()] = s
    pd.to_pickle(px, cache)


def episodes(s, thresh=0.5):
    """count distinct drawdown episodes deeper than thresh (reset at new all-time highs)"""
    peak = s.cummax()
    dd = s / peak - 1
    newhigh = s >= peak
    ep_id = newhigh.cumsum()
    worst = dd.groupby(ep_id).min()
    return int((worst <= -thresh).sum())


def stats(name, s):
    s = s[s > 0]
    peak = s.cummax()
    dd = s / peak - 1
    trough = dd.idxmin()
    pk = s.loc[:trough].idxmax()
    after = s.loc[trough:]
    rec = after[after >= s.loc[pk]]
    rec_date = rec.index[0] if len(rec) else None
    # longest underwater spell (from a peak to the next new high)
    newhigh = (s >= peak)
    hi_dates = s.index[newhigh.values]
    gaps = pd.Series(hi_dates[1:] - hi_dates[:-1], index=hi_dates[1:])
    open_gap = s.index[-1] - hi_dates[-1]
    longest = max(gaps.max() if len(gaps) else pd.Timedelta(0), open_gap)
    # run-up: start -> all-time-high
    ath = s.idxmax()
    run = s.loc[:ath]
    run_dd = (run / run.cummax() - 1).min()
    yrs = (s.index[-1] - s.index[0]).days / 365.25
    mult = s.iloc[-1] / s.iloc[0]
    return {
        "asset": name, "start": s.index[0].date(), "multiple_to_now": round(mult, 0),
        "CAGR_%": round(100 * (mult ** (1 / yrs) - 1), 1),
        "max_DD_%": round(100 * dd.min(), 1),
        "DD_peak": pk.date(), "DD_trough": trough.date(),
        "peak_to_trough_yrs": round((trough - pk).days / 365.25, 1),
        "recovered": rec_date.date() if rec_date is not None else "not yet",
        "peak_to_recovery_yrs": round(((rec_date or s.index[-1]) - pk).days / 365.25, 1),
        "max_DD_during_runup_to_ATH_%": round(100 * run_dd, 1),
        "n_drawdowns_>=50%": episodes(s, 0.5), "n_drawdowns_>=30%": episodes(s, 0.3),
        "pct_time_>=20%_below_ATH": round(100 * (dd <= -0.2).mean(), 0),
        "pct_time_>=50%_below_ATH": round(100 * (dd <= -0.5).mean(), 0),
        "longest_underwater_yrs": round(longest.days / 365.25, 1),
        "current_DD_%": round(100 * dd.iloc[-1], 1),
    }


rows = [stats(k, v) for k, v in px.items()]
df = pd.DataFrame(rows)
df.to_csv(os.path.join(RES, "famous_drawdowns.csv"), index=False)
with open(os.path.join(RES, "famous_drawdowns.md"), "w") as f:
    f.write("# Path statistics of famous multibaggers (daily total-return closes, first available date to 2026-09-25/28)\n\n")
    f.write(md(df) + "\n")
print(df.to_string())
