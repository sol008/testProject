"""
Step 1 - Build the (survivor) universe of currently exchange-listed US-registered companies from
SEC's company_tickers_exchange.json and download daily price history from Yahoo (yfinance).

SURVIVORSHIP BIAS WARNING: the SEC file only lists companies that are registered *today*. Every
company that went bankrupt, was acquired, went private or otherwise delisted before 2026-09 is
missing. Base rates computed from this universe are therefore biased (see 03_analysis.py and the
report for the rough correction we apply).

Output (scratchpad, not repo):
  prices/chunk_XXX.pkl  dict ticker -> DataFrame[Close, AdjClose, High, Low, Volume, Splits] (float32)
  universe.csv          cik, name, ticker, exchange (one ticker per CIK, primary share class)
"""
import json, os, re, time, pickle, sys
import pandas as pd
import numpy as np
import yfinance as yf

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
OUT = os.path.join(SCR, "prices")
os.makedirs(OUT, exist_ok=True)

d = json.load(open(os.path.join(SCR, "company_tickers_exchange.json")))
df = pd.DataFrame(d["data"], columns=d["fields"])
df = df[df.exchange.isin(["Nasdaq", "NYSE", "CBOE"])].copy()
# plain common-share style tickers only; drop warrants/units/rights (Nasdaq 5th letter W/U/R)
df = df[df.ticker.str.match(r"^[A-Z]{1,5}(-[A-Z])?$")]
df = df[~((df.ticker.str.len() == 5) & df.ticker.str[-1].isin(list("WUR")))]
# keep first ticker per CIK (SEC lists the primary class first)
df = df.drop_duplicates("cik", keep="first")
df.to_csv(os.path.join(SCR, "universe.csv"), index=False)
tickers = df.ticker.tolist()
print("universe size", len(tickers), flush=True)

CH = 100
chunks = [tickers[i:i + CH] for i in range(0, len(tickers), CH)]
for ci, ch in enumerate(chunks):
    fn = os.path.join(OUT, f"chunk_{ci:03d}.pkl")
    if os.path.exists(fn):
        continue
    for attempt in range(3):
        try:
            raw = yf.download(ch, start="2003-01-01", end="2026-09-29", interval="1d",
                              auto_adjust=False, actions=True, progress=False,
                              group_by="ticker", threads=True)
            break
        except Exception as e:  # noqa
            print("retry", ci, e, flush=True)
            time.sleep(10)
    else:
        continue
    res = {}
    for t in ch:
        try:
            sub = raw[t]
        except KeyError:
            continue
        sub = sub.dropna(subset=["Adj Close"])
        if len(sub) < 60:
            continue
        sub = sub.rename(columns={"Adj Close": "AdjClose", "Stock Splits": "Splits"})
        keep = [c for c in ["Close", "AdjClose", "High", "Low", "Volume", "Splits"] if c in sub]
        res[t] = sub[keep].astype("float32")
    pickle.dump(res, open(fn, "wb"))
    print(f"chunk {ci+1}/{len(chunks)} saved {len(res)} tickers", flush=True)
    time.sleep(1.5)
print("done")
