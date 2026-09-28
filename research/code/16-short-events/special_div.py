"""Special dividends, 2011-2026: announcement drift, the pre-ex-date run-up, and ex-day capture.

Events: 8-Ks mentioning "special (cash) dividend" (EDGAR full-text search) matched to Yahoo's
dividend history: the special dividend is the largest dividend with ex-date 3-75 calendar days
after the 8-K that is >= 1.5x the median regular dividend of the prior 2 years (or the firm
paid none) and >= 1% of the price.  D = 8-K filing date, X = ex-dividend date, A = amount.
Trades (all IWM/SPY-adjusted, net of size-bucket costs):
  follow    : close(D+1) -> close(X-1)  (buy after the news, sell on the last cum day)
  thru_ex   : close(D+1) -> close(X)    (hold through the ex-date; total return incl. A)
  capture   : close(X-1) -> close(X)    (1-day dividend capture; incl. A; tax matters!)
  post_ex20 : close(X)   -> close(X+20)
Also reports the ex-day drop ratio (P_cum - P_ex_open) / A.
Survivorship: only tickers listed today.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import COST_RT, SCRATCH, cap_bucket, load_prices, save_csv, save_json, trade_stats, tr_index
from evstudy import cal, px
from shares_out import SharesLookup


def main():
    d = pd.read_pickle(SCRATCH / "edgar_specdiv.pkl")
    d = d[d["form"] == "8-K"].copy()
    d["cik"] = d["ciks"].apply(lambda x: int(x[0]) if len(x) else -1)
    cte = json.loads((SCRATCH / "company_tickers_exchange.json").read_text())
    cte = pd.DataFrame(cte["data"], columns=cte["fields"])
    cte = cte[cte["exchange"].isin(["Nasdaq", "NYSE", "CBOE"])]
    m = cte.drop_duplicates("cik").set_index("cik")["ticker"].str.replace(".", "-", regex=False).to_dict()
    d["ticker"] = d["cik"].map(m)
    d = d.dropna(subset=["ticker"])
    load_prices(sorted(set(d["ticker"])) + ["SPY", "IWM"], batch=100, verbose=False)
    sl = SharesLookup()
    c = cal()
    spy, iwm = tr_index(px("SPY")), tr_index(px("IWM"))
    rows = []
    for r in d.sort_values("file_date").itertuples(index=False):
        p = px(r.ticker)
        if p is None:
            continue
        D = r.file_date
        dv = p["Dividends"]
        dv = dv[dv > 0]
        win = dv[(dv.index > D + pd.Timedelta(days=2)) & (dv.index <= D + pd.Timedelta(days=75))]
        if win.empty:
            continue
        X = win.idxmax()
        A = float(win.max())
        prior = dv[(dv.index < D) & (dv.index >= D - pd.Timedelta(days=730))]
        reg = float(prior.median()) if len(prior) else 0.0
        iX = p.index.get_loc(X)
        if iX < 70:
            continue
        pcum = float(p["Close"].iloc[iX - 1])
        if not (A >= 1.5 * reg and A / pcum >= 0.01):
            continue
        rows.append({"cik": r.cik, "ticker": r.ticker, "D": D, "X": X, "A": A, "yld": A / pcum, "reg": reg, "items": r.items})
    ev = pd.DataFrame(rows).drop_duplicates(["ticker", "X"], keep="first")
    print("special-dividend events matched:", len(ev))
    out = []
    for r in ev.itertuples(index=False):
        p = px(r.ticker)
        tr = tr_index(p)
        iD1 = c.searchsorted(r.D, side="right")  # first session after D
        if iD1 >= len(c):
            continue
        d1 = c[iD1]
        iX = c.searchsorted(r.X)
        if iX - 1 <= iD1 or iX + 20 >= len(c):
            continue
        xm1, x0, x20 = c[iX - 1], c[iX], c[iX + 20]

        def tv(s, dd):
            s2 = s[s.index <= dd]
            return float(s2.iloc[-1]) if len(s2) else np.nan

        mc = sl.asof(r.cik, r.D) * float(p["Close"][p.index <= r.D].iloc[-1]) if len(p[p.index <= r.D]) else np.nan
        big = mc >= 2e9
        b = spy if big else iwm
        rec = {"ticker": r.ticker, "D": r.D, "X": r.X, "yield": r.yld, "mcap": mc}
        for name, a0, a1 in [("follow", d1, xm1), ("thru_ex", d1, x0), ("capture", xm1, x0), ("post_ex20", x0, x20)]:
            rr = tv(tr, a1) / tv(tr, a0) - 1
            bb = tv(b, a1) / tv(b, a0) - 1
            rec[name] = rr - bb
            rec[name + "_raw"] = rr
        rec["drop_ratio"] = (float(p.loc[xm1, "Close"]) - float(p.loc[x0, "Open"])) / r.A if x0 in p.index and xm1 in p.index else np.nan
        rec["days_D_to_X"] = int(iX - iD1)
        out.append(rec)
    res = pd.DataFrame(out)
    res["bucket"] = res["mcap"].apply(cap_bucket)
    res["cost_rt"] = res["bucket"].map(COST_RT)
    res["period"] = np.where(res["D"] < "2016-01-01", "2011-15", "2016-26")
    save_csv(res, "special_div_events.csv")
    rows = []
    for per, g in list(res.groupby("period")) + [("all", res)]:
        years = 5 if per == "2011-15" else (10.7 if per == "2016-26" else 15.7)
        for w in ["follow", "thru_ex", "capture", "post_ex20"]:
            rows.append({"period": per, "window": w, **trade_stats(g[w] - g["cost_rt"], per_year=len(g) / years)})
        rows.append({"period": per, "window": "drop_ratio (median)", "n": int(g["drop_ratio"].notna().sum()),
                     "median_%": round(100 * float(g["drop_ratio"].median()), 1), "mean_%": round(100 * float(g["drop_ratio"].clip(-2, 3).mean()), 1)})
    tab = pd.DataFrame(rows)
    save_csv(tab, "special_div_summary.csv")
    save_json({"n_events": int(len(res)), "median_yield_%": round(100 * float(res["yield"].median()), 2),
               "median_days_D_to_X": float(res["days_D_to_X"].median())}, "special_div_meta.json")
    pd.set_option("display.width", 220)
    print(tab.to_string())
    print("median yield", res["yield"].median(), "median days D->X", res["days_D_to_X"].median())


if __name__ == "__main__":
    main()
