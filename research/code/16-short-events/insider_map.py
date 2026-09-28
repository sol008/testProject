"""Map insider events to Yahoo tickers and validate the mapping against EDGAR prices.

Candidates per event: (1) every current ticker of the issuer CIK (SEC company_tickers_exchange,
incl. OTC), (2) the Form 4 trading symbol at the time.  A candidate is accepted when the
actual (split-unadjusted) Yahoo close on the insiders' last trade date is within +-25% of the
insiders' volume-weighted purchase price and Yahoo history starts >= 60 sessions earlier.
This rejects reused tickers (e.g. BBBY, EMC now belong to different companies).

Output (SCRATCH): insider_events_mapped.pkl, with 'ticker' (validated) and 'map_status'.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import SCRATCH, load_prices, raw_close, yf_symbol
from shares_out import SharesLookup


def main():
    ev = pd.read_pickle(SCRATCH / "insider_events.pkl")
    ev = ev[ev["event_date"] >= "2006-01-01"].copy()
    d = json.loads((SCRATCH / "company_tickers_exchange.json").read_text())
    cte = pd.DataFrame(d["data"], columns=d["fields"])
    cte["yf"] = cte["ticker"].str.replace(".", "-", regex=False).str.upper()
    cik2t = cte.groupby("cik")["yf"].apply(list).to_dict()

    ev["cik_int"] = ev["ISSUERCIK"].astype(int)
    ev["cands"] = [list(dict.fromkeys(cik2t.get(c, []) + ([yf_symbol(s)] if isinstance(s, str) and s.upper() not in ("NONE", "N/A", "NA", "") else [])))
                   for c, s in zip(ev["cik_int"], ev["symbol"])]
    allc = sorted({t for cs in ev["cands"] for t in cs if t and len(t) <= 10})
    print("candidate tickers:", len(allc))
    px = load_prices(allc, batch=200)
    print("with Yahoo data:", len(px))

    sl = SharesLookup()
    tick, status, ratio, mcap = [], [], [], []
    rc_cache = {}
    for r in ev.itertuples(index=False):
        best, best_err = None, 9.0
        any_data = False
        for t in r.cands:
            dd = px.get(t)
            if dd is None:
                continue
            any_data = True
            if t not in rc_cache:
                rc_cache[t] = raw_close(dd)
            rc = rc_cache[t]
            i = rc.index.searchsorted(pd.Timestamp(r.last_trans), side="right") - 1
            if i < 60:
                continue
            err = abs(np.log(r.vwap / rc.iloc[i])) if rc.iloc[i] > 0 else 9.0
            if err < best_err:
                best, best_err = t, err
        if best is not None and best_err <= np.log(1.25):
            tick.append(best), status.append("ok"), ratio.append(float(np.exp(best_err)))
        else:
            tick.append(None), ratio.append(np.nan)
            status.append("price_mismatch" if best is not None else ("short_history" if any_data else "no_yahoo_data"))
        sh = sl.asof(r.cik_int, r.event_date)
        mcap.append(sh * r.vwap if np.isfinite(sh) else np.nan)
    ev["ticker"], ev["map_status"], ev["px_ratio"], ev["mcap"] = tick, status, ratio, mcap
    ev.to_pickle(SCRATCH / "insider_events_mapped.pkl")
    tab = ev[ev["K"] == 2].groupby([ev["event_date"].dt.year, "map_status"]).size().unstack(fill_value=0)
    tab["ok_share"] = (tab.get("ok", 0) / tab.sum(axis=1)).round(3)
    print(tab.to_string())


if __name__ == "__main__":
    main()
