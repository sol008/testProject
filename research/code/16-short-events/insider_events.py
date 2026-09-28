"""Build insider-purchase events from the SEC Form 4 data sets (2006Q1-2026Q2).

Definitions (fixed before looking at returns)
---------------------------------------------
* Purchase = Form 4 (original, not /A) non-derivative line with transaction code P,
  acquired (A), shares > 0, price > 0, common/ordinary stock, filed <= 14 calendar days
  after the trade (late filings are stale news).
* Insider = reporting owner flagged Director or Officer.  Pure 10%-owners (funds) are
  excluded.  A joint filing counts once (first-listed owner).
* Cluster event (W, K) = the first EDGAR filing date on which >= K distinct insiders of the
  same issuer have filed purchases within the trailing W calendar days.  After an event the
  issuer is locked out for 90 calendar days (no overlapping events).
* Single-insider baseline (K = 1) uses the same machinery.
* Routine vs opportunistic (Cohen, Malloy & Pomorski 2012): an insider who traded (P or S)
  in each of the three prior calendar years is "routine" if one calendar month contains a
  trade in all three years, else "opportunistic"; insiders without three years of history
  are "unclassified".  An event is "all-routine" if every participating insider is routine.

Outputs (SCRATCH): insider_purchases_daily.pkl, insider_events.pkl
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import SCRATCH

COMMON_OK = r"common|ordinary|class [abc]\b|capital stock|^shares|share[s]? of|stock$|^stock"
COMMON_BAD = r"prefer|note|warrant|unit|debenture|depositar|right|option|bond|trust pref|convertible|lp int|partnership|membership|limited"


def load_clean() -> pd.DataFrame:
    df = pd.read_pickle(SCRATCH / "insider_PS.pkl.gz")
    df = df[df["DOCUMENT_TYPE"].astype(str).str.strip() == "4"]
    df = df[df["TRANS_FORM_TYPE"].fillna("4").astype(str).str.strip().isin(["4", ""])]
    rel = df["RPTOWNER_RELATIONSHIP"].fillna("")
    df = df.assign(is_dir=rel.str.contains("Director"), is_off=rel.str.contains("Officer"),
                   is_10=rel.str.contains("TenPercent"))
    title = df["RPTOWNER_TITLE"].fillna("").str.upper()
    df["is_top"] = title.str.contains(r"\bCEO\b|CHIEF EXECUTIVE|\bCFO\b|CHIEF FINANCIAL|PRESIDENT|\bCHAIR", regex=True)
    st = df["SECURITY_TITLE"].fillna("").str.lower().str.strip()
    df = df[st.str.contains(COMMON_OK, regex=True) & ~st.str.contains(COMMON_BAD, regex=True)]
    df = df[df["TRANS_SHARES"] > 0]
    df["lag_days"] = (df["FILING_DATE"] - df["TRANS_DATE"]).dt.days
    return df


def routine_table(df: pd.DataFrame) -> pd.DataFrame:
    """Per (owner, year): CMP classification based on the three prior calendar years."""
    t = df[["RPTOWNERCIK", "TRANS_DATE"]].dropna().copy()
    t["y"] = t["TRANS_DATE"].dt.year
    t["m"] = t["TRANS_DATE"].dt.month
    ym = t.drop_duplicates(["RPTOWNERCIK", "y", "m"])
    years = ym.groupby("RPTOWNERCIK")["y"].apply(set).to_dict()
    months = ym.groupby(["RPTOWNERCIK", "y"])["m"].apply(set).to_dict()
    rows = []
    for o, ys in years.items():
        for Y in range(min(ys) + 1, 2028):
            prior = [Y - 3, Y - 2, Y - 1]
            if all(p in ys for p in prior):
                common = months[(o, prior[0])] & months[(o, prior[1])] & months[(o, prior[2])]
                rows.append((o, Y, "routine" if common else "opportunistic"))
    return pd.DataFrame(rows, columns=["RPTOWNERCIK", "year", "cmp"])


def build_events(p: pd.DataFrame, W: int, K: int, lockout: int = 90) -> pd.DataFrame:
    """p: daily insider-level purchases (one row per issuer x owner x filing date)."""
    out = []
    for cik, g in p.groupby("ISSUERCIK", sort=False):
        g = g.sort_values("FILING_DATE")
        dates = g["FILING_DATE"].values
        owners = g["RPTOWNERCIK"].values
        locked_until = np.datetime64("1900-01-01")
        for i in range(len(g)):
            d = dates[i]
            if d < locked_until:
                continue
            lo = d - np.timedelta64(W - 1, "D")
            win = (dates >= lo) & (dates <= d)
            n_ins = len(set(owners[win]))
            if n_ins >= K:
                w = g[win]
                val = w["value"].sum()
                out.append({
                    "ISSUERCIK": cik, "event_date": pd.Timestamp(d), "n_insiders": n_ins,
                    "value": val, "vwap": val / w["shares"].sum(),
                    "n_top": int(w.drop_duplicates("RPTOWNERCIK")["is_top"].sum()),
                    "n_dir": int(w.drop_duplicates("RPTOWNERCIK")["is_dir"].sum()),
                    "any_10": bool(w["is_10"].any()),
                    "last_trans": w["last_trans"].max(), "first_trans": w["first_trans"].min(),
                    "symbol": w["ISSUERTRADINGSYMBOL"].mode().iat[0] if w["ISSUERTRADINGSYMBOL"].notna().any() else None,
                    "name": w["ISSUERNAME"].iat[-1],
                    "n_routine": int((w.drop_duplicates("RPTOWNERCIK")["cmp"] == "routine").sum()),
                    "n_opp": int((w.drop_duplicates("RPTOWNERCIK")["cmp"] == "opportunistic").sum()),
                    "n_rbuyer": int(w.drop_duplicates("RPTOWNERCIK")["routine_buyer"].sum()),
                    "max_lag": int(w["lag"].max()),
                })
                locked_until = d + np.timedelta64(lockout, "D")
    ev = pd.DataFrame(out)
    ev["W"], ev["K"] = W, K
    return ev


def main():
    df = load_clean()
    print("clean P/S rows:", len(df), "P:", (df["TRANS_CODE"] == "P").sum())
    rt = routine_table(df)
    print("CMP classified owner-years:", len(rt), rt["cmp"].value_counts().to_dict())

    buys = df[(df["TRANS_CODE"] == "P") & (df["TRANS_ACQUIRED_DISP_CD"] == "A") & (df["TRANS_PRICEPERSHARE"] > 0)
              & df["lag_days"].between(0, 14) & (df["is_dir"] | df["is_off"])].copy()
    buys["value"] = buys["TRANS_SHARES"] * buys["TRANS_PRICEPERSHARE"]
    # routine *buyer*: bought in the same calendar month in each of the two prior years
    bm = buys[["RPTOWNERCIK", "TRANS_DATE"]].copy()
    bm["y"], bm["m"] = bm["TRANS_DATE"].dt.year, bm["TRANS_DATE"].dt.month
    bset = set(map(tuple, bm[["RPTOWNERCIK", "y", "m"]].drop_duplicates().values.tolist()))
    buys["routine_buyer"] = [((o, y - 1, m) in bset and (o, y - 2, m) in bset)
                             for o, y, m in zip(buys["RPTOWNERCIK"], buys["TRANS_DATE"].dt.year, buys["TRANS_DATE"].dt.month)]
    buys["year"] = buys["TRANS_DATE"].dt.year
    buys = buys.merge(rt, on=["RPTOWNERCIK", "year"], how="left")
    buys["cmp"] = buys["cmp"].fillna("unclassified")

    daily = (buys.groupby(["ISSUERCIK", "RPTOWNERCIK", "FILING_DATE"], as_index=False)
             .agg(value=("value", "sum"), shares=("TRANS_SHARES", "sum"), last_trans=("TRANS_DATE", "max"),
                  first_trans=("TRANS_DATE", "min"), lag=("lag_days", "max"), is_top=("is_top", "max"),
                  is_dir=("is_dir", "max"), is_10=("is_10", "max"), routine_buyer=("routine_buyer", "max"),
                  cmp=("cmp", "first"), ISSUERTRADINGSYMBOL=("ISSUERTRADINGSYMBOL", "first"),
                  ISSUERNAME=("ISSUERNAME", "first"), RPTOWNERNAME=("RPTOWNERNAME", "first")))
    daily.to_pickle(SCRATCH / "insider_purchases_daily.pkl")
    print("insider-day purchases:", len(daily))
    print(daily.groupby(daily["FILING_DATE"].dt.year).size().to_string())

    evs = []
    for W, K in [(30, 1), (10, 2), (30, 2), (30, 3)]:
        ev = build_events(daily, W, K)
        print(f"W={W} K={K}: {len(ev)} events")
        evs.append(ev)
    ev = pd.concat(evs, ignore_index=True)
    ev.to_pickle(SCRATCH / "insider_events.pkl")
    print(ev.groupby(["W", "K", ev["event_date"].dt.year]).size().unstack(level=[0, 1]).to_string())


if __name__ == "__main__":
    main()
