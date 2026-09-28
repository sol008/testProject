"""
Step 3 - Turn daily Yahoo data into month-end panels (dates x tickers):
  adj      dividend+split adjusted close (total-return index)
  px       actual traded price that day (split-adjusted close x later split factors)
  hi52/lo52 52-week high / low of the (dividend-adjusted) daily high/low
  vol1y    annualised stdev of daily log returns, trailing 252 trading days
  dvol3m   average daily dollar volume, trailing 63 trading days (actual $)
  max1m    maximum single-day return within the trailing 21 trading days (Bali et al. MAX)
  maxjump  largest single-day simple return in trailing 21 days (data-error diagnostics)
Also saves the daily adjusted-close dict for path statistics (drawdowns).
"""
import os, glob, pickle
import numpy as np
import pandas as pd

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
files = sorted(glob.glob(os.path.join(SCR, "prices", "chunk_*.pkl")))
panels = {k: {} for k in ["adj", "px", "hi52", "lo52", "vol1y", "dvol3m", "max1m"]}
daily_adj = {}
first_date = {}
for fn in files:
    res = pickle.load(open(fn, "rb"))
    for t, df in res.items():
        df = df.astype("float64")
        df = df[df.AdjClose > 0].copy()
        if len(df) < 60:
            continue
        # cumulative split factor for splits strictly after each date
        spl = df["Splits"].fillna(0.0)
        spl = spl.where(spl > 0, 1.0)
        # factor_t = product of split ratios with date > t
        rev_cum = spl[::-1].cumprod()[::-1]          # includes own date
        after = rev_cum / spl                         # exclude own date
        px = df["Close"] * after
        ratio = df["AdjClose"] / df["Close"]
        hi = df["High"] * ratio
        lo = df["Low"] * ratio
        lr = np.log(df["AdjClose"]).diff()
        dv = (df["Close"] * df["Volume"])
        d = pd.DataFrame({
            "adj": df["AdjClose"], "px": px,
            "hi52": hi.rolling(252, min_periods=200).max(),
            "lo52": lo.rolling(252, min_periods=200).min(),
            "vol1y": lr.rolling(252, min_periods=200).std() * np.sqrt(252),
            "dvol3m": dv.rolling(63, min_periods=40).mean(),
            "max1m": (np.exp(lr) - 1).rolling(21, min_periods=15).max(),
        })
        me = d.groupby(d.index.to_period("M")).tail(1)
        me.index = me.index.to_period("M")
        for k in panels:
            panels[k][t] = me[k]
        daily_adj[t] = df["AdjClose"].astype("float32")
        first_date[t] = df.index[0]
    print(fn, len(daily_adj), flush=True)

out = {k: pd.DataFrame(v).sort_index() for k, v in panels.items()}
out["first_date"] = pd.Series(first_date)
pickle.dump(out, open(os.path.join(SCR, "panels.pkl"), "wb"))
pickle.dump(daily_adj, open(os.path.join(SCR, "daily_adj.pkl"), "wb"))
print({k: v.shape for k, v in out.items() if hasattr(v, "shape")})
