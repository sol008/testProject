"""
Step 5 - Main equity study: base rates of 5-year 10-baggers, ex-ante characteristics, screens,
path statistics of the winners, basket (N-stock) simulations.

Universe: companies registered with the SEC *today* (Sep-2026) and listed on NYSE/Nasdaq/Cboe,
one share class per CIK, US-domiciled (appear in us-gaap XBRL frames with a US location).
=> SURVIVOR SAMPLE. Every company that died, was acquired or delisted between the formation date
and today is missing. See survivorship section of the report.

Formation dates: end of June 2005 ... June 2021 (17 annual cohorts), 5-year forward window
(t -> t+60 months, month-end total-return prices). Fundamentals only from June 2010 on.
"""
import os, sys, json, pickle, glob
import numpy as np
import pandas as pd
import statsmodels.api as sm

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mdtable import md

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
RES = "/home/user/testProject/research/code/07-multibaggers/results"
os.makedirs(RES, exist_ok=True)
rng = np.random.default_rng(7)

P = pickle.load(open(os.path.join(SCR, "panels.pkl"), "rb"))
F = pd.read_pickle(os.path.join(SCR, "fundamentals.pkl"))
daily = pickle.load(open(os.path.join(SCR, "daily_adj.pkl"), "rb"))
uni = pd.read_csv(os.path.join(SCR, "universe.csv"))

# ---- US-domestic flag from XBRL frames locations -------------------------------------------
loc = {}
for fn in glob.glob(os.path.join(SCR, "frames", "*.json")):
    d = json.load(open(fn)).get("data", [])
    for r in d:
        if r.get("loc"):
            loc[r["cik"]] = r["loc"]
uni["loc"] = uni.cik.map(loc)
uni["us"] = uni["loc"].fillna("").str.startswith("US-")
US = set(uni.loc[uni.us, "ticker"])

adj, px, hi52, lo52 = P["adj"], P["px"], P["hi52"], P["lo52"]
vol1y, dvol, max1m = P["vol1y"], P["dvol3m"], P["max1m"]
first_date = P["first_date"]
months = adj.index
# treat the partial Sep-2026 bar as the last month-end
LAST = months[-1]


def mi(p):
    return months.get_loc(p)


# ---- data-quality screens on the daily series --------------------------------------------------
def window_flags(t, start, end):
    s = daily[t].loc[str(start.start_time.date()):str(end.end_time.date())]
    r = s.pct_change().dropna()
    if len(r) == 0:
        return np.nan, np.nan
    return float(r.max()), float(r.min())


# ---- build the cohort panel ---------------------------------------------------------------
rows = []
cohorts = [pd.Period(f"{y}-06", "M") for y in range(2005, 2022)]
for t in cohorts:
    i = mi(t)
    j = i + 60
    if j >= len(months):
        continue
    tj = months[j]
    for tk in adj.columns:
        a0 = adj.at[t, tk]
        if not np.isfinite(a0) or a0 <= 0:
            continue
        a1 = adj.at[tj, tk]
        a12 = adj.iloc[i - 12][tk]
        if not np.isfinite(a1) or not np.isfinite(a12):
            continue  # need 12m history and the 5y outcome
        rows.append((t, tk, a0, a1))
base = pd.DataFrame(rows, columns=["t", "tk", "a0", "a5"])
base["M5"] = base.a5 / base.a0
print("raw obs", len(base))


def g(panel, t, tk, lag=0):
    return panel.iloc[mi(t) - lag][tk]


feat = []
for t, grp in base.groupby("t"):
    i = mi(t)
    tks = grp.tk.values
    a = adj.iloc[i][tks].values
    d = pd.DataFrame({"tk": tks, "t": t})
    d["px"] = px.iloc[i][tks].values
    d["mom12_1"] = adj.iloc[i - 1][tks].values / adj.iloc[i - 12][tks].values - 1
    d["ret1"] = a / adj.iloc[i - 1][tks].values - 1
    d["ret6"] = a / adj.iloc[i - 6][tks].values - 1
    h, l = hi52.iloc[i][tks].values, lo52.iloc[i][tks].values
    d["dist_hi"] = a / h
    d["dist_lo"] = a / l
    d["pos_range"] = (a - l) / (h - l)
    d["vol1y"] = vol1y.iloc[i][tks].values
    d["max1m"] = max1m.iloc[i][tks].values
    d["dvol"] = dvol.iloc[i][tks].values
    d["age_yrs"] = [(t.end_time - first_date[x]).days / 365.25 for x in tks]
    # forward path within the window (month-end)
    win = adj.iloc[i:i + 61][tks]
    d["maxM"] = (win.max() / win.iloc[0]).values
    d["path_mdd"] = (win / win.cummax() - 1).min().values
    d["M1"] = adj.iloc[i + 12][tks].values / a
    d["M3"] = adj.iloc[i + 36][tks].values / a
    j10 = i + 120
    d["M10"] = adj.iloc[j10][tks].values / a if j10 < len(months) else np.nan
    feat.append(d)
feat = pd.concat(feat)
df = base.merge(feat, on=["t", "tk"])
df["year"] = df.t.dt.year
df["us"] = df.tk.isin(US)

# fundamentals (formation June F uses FY F-1)
fund = []
for y, fd in F.items():
    if y < 2010 or y > 2021:
        continue
    x = fd.copy()
    x["year"] = y
    x["tk"] = x.index
    fund.append(x)
fund = pd.concat(fund, ignore_index=True)
df = df.merge(fund, on=["tk", "year"], how="left")
df["mcap"] = df.shares * df.px
df.loc[(df.mcap <= 0) | (df.year < 2010), "mcap"] = np.nan
df["capex"] = df.capex.fillna(0)
df["fcf"] = df.ocf - df.capex
df["fcf_yield"] = df.fcf / df.mcap
df["ps"] = df.mcap / df.rev.where(df.rev > 0)
df["bm"] = df.equity / df.mcap
df["ey"] = df.ni / df.mcap
df["gm"] = df.gp / df.rev.where(df.rev > 0)
df["roe"] = df.ni / df.equity.where(df.equity > 0)
df["roa"] = df.ni / df.assets.where(df.assets > 0)
df["rev_g"] = df.rev / df.rev_prev.where(df.rev_prev > 0) - 1
df["asset_g"] = df.assets / df.assets_prev.where(df.assets_prev > 0) - 1
df["share_chg"] = df.shares / df.shares_prev.where(df.shares_prev > 0) - 1
df["opm"] = df.opinc / df.rev.where(df.rev > 0)

# ---- data-quality: drop implausible windows -----------------------------------------------------
# (1) sub-$1 prices at formation (tick-size noise, frequent reverse-split errors)
df = df[df.px >= 1.0]
# (2) daily-jump diagnostics only needed for extreme outcomes
cand = df[(df.M5 >= 5) | (df.maxM >= 10)].index
mx, mn = [], []
for ix in cand:
    r = df.loc[ix]
    a, b = window_flags(r.tk, r.t, months[mi(r.t) + 60])
    mx.append(a)
    mn.append(b)
df["max_daily_up"] = np.nan
df.loc[cand, "max_daily_up"] = mx
df["max_daily_dn"] = np.nan
df.loc[cand, "max_daily_dn"] = mn
bad = (df.max_daily_up > 3.0)  # a single +300% day inside the window: usually a data/split error
print("flagged suspicious windows:", int(bad.sum()), "of which M5>=10:", int((bad & (df.M5 >= 10)).sum()))
df["suspect"] = bad
df = df[~df.suspect]
df = df[df.us]

df["tenx"] = (df.M5 >= 10).astype(int)
df["fivex"] = (df.M5 >= 5).astype(int)
df["threex"] = (df.M5 >= 3).astype(int)
df["loss80"] = (df.M5 <= 0.2).astype(int)
df["liquid"] = (df.px >= 3) & (df.dvol >= 1e6)
df.to_pickle(os.path.join(SCR, "cohort_panel.pkl"))
print("final obs", len(df), "tenx", int(df.tenx.sum()))
