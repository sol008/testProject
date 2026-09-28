"""
Step 4 - Build point-in-time-ish fundamentals for June-30 formation dates from SEC XBRL frames.
For formation date F-06-30 we only use annual data for calendar year F-1 (10-Ks for Dec FYs are
filed by ~March of F) and balance sheet items as of ~Dec F-1, i.e. no look-ahead in timing
(frames can carry later restated values - noted in the report).
Output: fundamentals.pkl  dict F -> DataFrame indexed by ticker
"""
import os, json, glob
import numpy as np
import pandas as pd

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
FR = os.path.join(SCR, "frames")
uni = pd.read_csv(os.path.join(SCR, "universe.csv"))
cik2t = dict(zip(uni.cik, uni.ticker))


def load(tx, tag, unit, period):
    fn = os.path.join(FR, f"{tx}__{tag}__{unit}__{period}.json")
    if not os.path.exists(fn):
        return pd.DataFrame(columns=["cik", "end", "val"])
    d = json.load(open(fn))
    df = pd.DataFrame(d.get("data", []))
    if df.empty:
        return pd.DataFrame(columns=["cik", "end", "val"])
    return df[["cik", "end", "val"]]


def annual(tag, y, unit="USD"):
    df = load("us-gaap", tag, unit, f"CY{y}")
    return df.drop_duplicates("cik").set_index("cik")["val"]


def revenue(y):
    s = [annual(t, y) for t in ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
                                "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"]]
    return pd.concat(s, axis=1).max(axis=1)


def instant(tx, tag, unit, y, q):
    df = load(tx, tag, unit, f"CY{y}Q{q}I")
    return df


# long table of cover-page share counts
sh = []
for y in range(2008, 2026):
    for q in (1, 2, 3, 4):
        d = instant("dei", "EntityCommonStockSharesOutstanding", "shares", y, q)
        sh.append(d)
sh = pd.concat(sh)
sh["end"] = pd.to_datetime(sh["end"])
sh = sh[sh.val > 0]

out = {}
for F in range(2009, 2026):
    fdate = pd.Timestamp(f"{F}-06-30")
    s = sh[(sh.end <= fdate) & (sh.end > fdate - pd.Timedelta(days=366))]
    s = s.sort_values("end").drop_duplicates("cik", keep="last").set_index("cik")["val"]
    s_prev = sh[(sh.end <= fdate - pd.Timedelta(days=365)) & (sh.end > fdate - pd.Timedelta(days=731))]
    s_prev = s_prev.sort_values("end").drop_duplicates("cik", keep="last").set_index("cik")["val"]
    wab = annual("WeightedAverageNumberOfSharesOutstandingBasic", F - 1, "shares")
    shares = s.combine_first(wab)
    y = F - 1
    df = pd.DataFrame({
        "shares": shares, "shares_prev": s_prev,
        "rev": revenue(y), "rev_prev": revenue(y - 1),
        "ni": annual("NetIncomeLoss", y), "ocf": annual("NetCashProvidedByUsedInOperatingActivities", y),
        "capex": annual("PaymentsToAcquirePropertyPlantAndEquipment", y),
        "gp": annual("GrossProfit", y), "opinc": annual("OperatingIncomeLoss", y),
    })
    eq = instant("us-gaap", "StockholdersEquity", "USD", y, 4).drop_duplicates("cik").set_index("cik")["val"]
    eq2 = instant("us-gaap", "StockholdersEquity", "USD", y, 2).drop_duplicates("cik").set_index("cik")["val"]
    at = instant("us-gaap", "Assets", "USD", y, 4).drop_duplicates("cik").set_index("cik")["val"]
    at2 = instant("us-gaap", "Assets", "USD", y, 2).drop_duplicates("cik").set_index("cik")["val"]
    atp = instant("us-gaap", "Assets", "USD", y - 1, 4).drop_duplicates("cik").set_index("cik")["val"]
    df["equity"] = eq.combine_first(eq2)
    df["assets"] = at.combine_first(at2)
    df["assets_prev"] = atp
    df = df[df.index.isin(cik2t.keys())]
    df.index = [cik2t[c] for c in df.index]
    out[F] = df
    print(F, len(df), df.notna().sum().to_dict(), flush=True)

pd.to_pickle(out, os.path.join(SCR, "fundamentals.pkl"))
