"""What does acting on a 22:17 ET email the next morning cost? (track 18, section 3.1)

1. Overnight vs intraday decomposition of returns (the entry at the next open misses the
   first night).  Literature: Cliff, Cooper & Gulen (2008); Lou, Polk & Skouras (2019, JFE).
2. For simple close-generated signals on liquid ETFs and large caps, the average
   close(t) -> open(t+1) return conditional on the signal ("first-night drift"), in bp and as
   a share of the 10-day forward return.  Positive = the delay costs money for a long trade.
3. Bitcoin: distribution of the price change between 22:00 ET and 09:30 ET next day
   (the window between the email and a typical morning execution), from hourly bars.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from util18 import SCRATCH, load_daily, save_table

ETFS = ["SPY", "QQQ", "IWM", "DIA", "EFA", "EEM", "XLE", "XLF", "XLK", "XLV", "XLU", "XLI",
        "SMH", "XBI", "TLT", "GLD"]
STOCKS = ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "JPM", "XOM", "JNJ", "UNH",
          "PG", "V", "HD", "BAC", "INTC", "AMD", "NFLX", "CRM", "ADBE", "PFE", "KO", "WMT", "DIS",
          "BA", "CSCO", "ORCL", "MRK", "CVX", "WFC"]


def decomposition(data, tickers, start="2005-01-01"):
    rows = []
    for t in tickers:
        df = data[t].loc[start:]
        o, c = df["Open"].values, df["Close"].values
        on = np.log(o[1:] / c[:-1]); intra = np.log(c[1:] / o[1:])
        yrs = len(on) / 252
        rows.append({"Ticker": t, "Years": yrs,
                     "Overnight log return %/yr": 100 * on.sum() / yrs,
                     "Intraday log return %/yr": 100 * intra.sum() / yrs,
                     "Overnight share of total": on.sum() / (on.sum() + intra.sum())})
    return pd.DataFrame(rows)


def signals(df):
    c = df["Close"]; h = df["High"]; l = df["Low"]
    lr = np.log(c).diff()
    sig20 = lr.rolling(20).std()
    out = {
        "20-day high breakout (long)": (c >= c.rolling(20).max()) & (c.shift(1) < c.shift(1).rolling(20).max()),
        "3-day drop > 2 sigma (long, reversal)": (np.log(c / c.shift(3)) < -2 * sig20 * np.sqrt(3)),
        "1-day drop > 2.5 sigma (long, reversal)": (lr < -2.5 * sig20.shift(1)),
        "Close > 200d avg cross-up (long)": (c > c.rolling(200).mean()) & (c.shift(1) <= c.shift(1).rolling(200).mean()),
        "Every day (baseline)": pd.Series(True, index=c.index),
    }
    return out


def first_night(data, tickers, label, start="2005-01-01"):
    acc = {}
    for t in tickers:
        df = data[t].loc[start:]
        o, c = df["Open"], df["Close"]
        night = np.log(o.shift(-1) / c)            # close(t) -> open(t+1)
        fwd10_close = np.log(c.shift(-10) / c)     # close(t) -> close(t+10)
        fwd10_open = np.log(c.shift(-10) / o.shift(-1))
        for name, s in signals(df).items():
            m = s.fillna(False).values & np.isfinite(night.values) & np.isfinite(fwd10_close.values)
            d = acc.setdefault(name, {"night": [], "c10": [], "o10": []})
            d["night"].append(night.values[m]); d["c10"].append(fwd10_close.values[m])
            d["o10"].append(fwd10_open.values[m])
    rows = []
    for name, d in acc.items():
        n = np.concatenate(d["night"]); c10 = np.concatenate(d["c10"]); o10 = np.concatenate(d["o10"])
        se = n.std(ddof=1) / np.sqrt(len(n))
        rows.append({"Universe": label, "Signal (known at the close)": name, "Events": len(n),
                     "Mean first-night return (bp)": 1e4 * n.mean(),
                     "t-stat": n.mean() / se,
                     "10d return from close (bp)": 1e4 * c10.mean(),
                     "10d return from next open (bp)": 1e4 * o10.mean(),
                     "Mean |first-night move| (bp)": 1e4 * np.abs(n).mean()})
    return pd.DataFrame(rows)


def btc_overnight_window():
    """BTC-USD hourly bars (yfinance keeps ~730 days): move from 22:00 ET to 09:30 ET."""
    import yfinance as yf
    cache = f"{SCRATCH}/btc_hourly.pkl"
    try:
        h = pd.read_pickle(cache)
    except Exception:
        h = yf.download("BTC-USD", period="729d", interval="1h", progress=False, auto_adjust=True)
        if isinstance(h.columns, pd.MultiIndex):
            h.columns = h.columns.get_level_values(0)
        h.to_pickle(cache)
    h = h.tz_convert("America/New_York")
    op = h["Open"]
    # price at 22:00 ET (open of the 22:00 bar) and at 09:00/10:00 bars -> interpolate 09:30
    p22 = op[op.index.hour == 22]
    p09 = op[op.index.hour == 9]; p10 = op[op.index.hour == 10]
    res = []
    for ts, v in p22.items():
        nxt = (ts + pd.Timedelta(hours=11)).floor("h")      # 09:00 next day
        nxt10 = nxt + pd.Timedelta(hours=1)
        if nxt in p09.index and nxt10 in p10.index:
            p930 = np.sqrt(p09[nxt] * p10[nxt10])
            res.append(np.log(p930 / v))
    r = np.array(res)
    return pd.DataFrame([{"Window": "BTC 22:00 ET -> 09:30 ET next day", "Nights": len(r),
                          "Std dev": r.std(), "Mean |move|": np.abs(r).mean(),
                          "P(|move| > 2%)": np.mean(np.abs(r) > 0.02),
                          "P(|move| > 4%)": np.mean(np.abs(r) > 0.04),
                          "P5": np.quantile(r, 0.05), "P95": np.quantile(r, 0.95)}])


def main():
    data = load_daily(sorted(set(ETFS + STOCKS)), start="2005-01-01")
    dec = pd.concat([decomposition(data, ETFS), decomposition(data, STOCKS)])
    summary = pd.DataFrame([
        {"Universe": "16 ETFs", **dec.iloc[:len(ETFS)][["Overnight log return %/yr", "Intraday log return %/yr"]].median().to_dict()},
        {"Universe": "30 large caps", **dec.iloc[len(ETFS):][["Overnight log return %/yr", "Intraday log return %/yr"]].median().to_dict()},
        {"Universe": "SPY", **dec[dec.Ticker == "SPY"][["Overnight log return %/yr", "Intraday log return %/yr"]].iloc[0].to_dict()},
    ])
    save_table(summary, "overnight_vs_intraday")
    fn = pd.concat([first_night(data, ETFS, "16 ETFs"), first_night(data, STOCKS, "30 large caps")])
    save_table(fn, "first_night_cost")
    try:
        btc = btc_overnight_window()
        save_table(btc, "btc_email_to_morning_window")
    except Exception as e:  # network or data limits
        btc = pd.DataFrame([{"error": str(e)}])
    return summary, fn, btc


if __name__ == "__main__":
    pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
    s, f, b = main()
    print(s.to_string()); print(f.to_string()); print(b.to_string())
