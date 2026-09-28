"""
Step 7 - Extra tables: absolute size/price buckets, regime (post-crash) effect, any-5y-window census,
daily path stats of the 10-baggers, and holding-rule experiments (stops/trims) on monthly paths.
"""
import os, sys, pickle
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mdtable import md

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
RES = "/home/user/testProject/research/code/07-multibaggers/results"
df = pd.read_pickle(os.path.join(SCR, "cohort_panel.pkl"))
for c in ["mcap", "fcf", "ps", "rev_g", "ni"]:
    df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
P = pickle.load(open(os.path.join(SCR, "panels.pkl"), "rb"))
daily = pickle.load(open(os.path.join(SCR, "daily_adj.pkl"), "rb"))
adj, px = P["adj"], P["px"]
months = adj.index
out = open(os.path.join(RES, "equity_results_extra.md"), "w")


def W(s=""):
    out.write(s + "\n")
    print(s)


def summ(g):
    return {"N": len(g), "%10x": round(100 * g.tenx.mean(), 2), "%5x": round(100 * g.fivex.mean(), 1),
            "%lost>=80%": round(100 * g.loss80.mean(), 1), "median_x": round(g.M5.median(), 2),
            "mean_x": round(g.M5.mean(), 2)}


# ---- 1. absolute buckets ------------------------------------------------------------------------
W("## A. 10x rate by absolute starting market cap (2010-2021 cohorts)\n")
b = pd.cut(df.mcap, [0, 1e8, 3e8, 1e9, 2e9, 1e10, 1e14],
           labels=["<$100M", "$100-300M", "$300M-1B", "$1-2B", "$2-10B", ">$10B"])
W(md(pd.DataFrame([{"mcap": k, **summ(g)} for k, g in df.groupby(b, observed=True)])))
W("\n## B. 10x rate by starting share price (2005-2021 cohorts)\n")
b = pd.cut(df.px, [1, 3, 5, 10, 20, 50, 1e9], labels=["$1-3", "$3-5", "$5-10", "$10-20", "$20-50", ">$50"],
           include_lowest=True)
W(md(pd.DataFrame([{"price": k, **summ(g)} for k, g in df.groupby(b, observed=True)])))

# ---- 2. regime ---------------------------------------------------------------------------------
W("\n## C. Regime: cohorts formed within ~4 months of a bear-market low (Jun-2009, Jun-2016 small-cap low, Jun-2020) vs the rest\n")
post = df.year.isin([2009, 2016, 2020])
W(md(pd.DataFrame([{"cohorts": "post-crash (2009, 2016, 2020)", **summ(df[post])},
                   {"cohorts": "all other (14)", **summ(df[~post])}])))

# ---- 3. any-5y-window census ------------------------------------------------------------------
W("\n## D. Census: stocks with at least one month-end-to-month-end 60-month window >= 10x (starts 2005-01..2021-09)\n")
US = set(df.tk.unique())  # US-domiciled tickers that pass filters somewhere
A = adj[[c for c in adj.columns if c in US]]
PX = px[[c for c in A.columns]]
i0, i1 = months.get_loc(pd.Period("2005-01", "M")), months.get_loc(pd.Period("2021-09", "M"))
fwd = (A.shift(-60) / A).iloc[i0:i1 + 1]
ok = PX.iloc[i0:i1 + 1] >= 1.0
hits = (fwd >= 10) & ok
ever = hits.any()
n_ever = int(ever.sum())
n_names = int((A.iloc[i0:i1 + 1].notna() & ok).any().sum())
best = fwd.where(ok).max().sort_values(ascending=False)
W(f"US-domiciled survivors with any eligible start month: {n_names}; with >=1 ten-bagger 5y window: {n_ever} "
  f"({100*n_ever/n_names:.1f}%). Share of (stock, start-month) windows that are 10x: "
  f"{100*hits.sum().sum()/ok.where(fwd.notna()).sum().sum():.2f}%")
top = best.head(30)
W("\nTop 30 best 5-year windows (multiple): " + ", ".join(f"{k} {v:.0f}x" for k, v in top.items()))
# which start months produced the most 10x windows
by_m = hits.sum(axis=1) / ok.where(fwd.notna()).sum(axis=1)
yr = by_m.groupby(by_m.index.year).mean()
W("\nShare of 60m windows that are 10x, by start year: " + ", ".join(f"{k}: {100*v:.2f}%" for k, v in yr.items()))

# ---- 4. daily path stats for cohort 10-baggers -------------------------------------------------
W("\n## E. Daily path statistics of the cohort ten-baggers (entry at June month-end, 5-year window)\n")
rows = []
for _, r in df[df.tenx == 1].iterrows():
    s = daily[r.tk].loc[str(r.t.end_time.date() + pd.Timedelta(days=-3)):str((r.t + 60).end_time.date())]
    s = s.loc[s.index >= s.index[s.index <= r.t.end_time][-1]] if (s.index <= r.t.end_time).any() else s
    s = s / s.iloc[0]
    peak = s.cummax()
    dd = s / peak - 1
    first10 = s[s >= 10]
    newhigh = s >= peak
    ep = newhigh.cumsum()
    worst = dd.groupby(ep).min()
    rows.append({"tk": r.tk, "cohort": r.year, "M5": r.M5, "maxDD": dd.min(),
                 "n_dd30": int((worst <= -0.3).sum()), "n_dd50": int((worst <= -0.5).sum()),
                 "pct_days_20pct_below_peak": (dd <= -0.2).mean(),
                 "min_vs_entry": s.min(), "yrs_to_first_10x": (first10.index[0] - s.index[0]).days / 365.25 if len(first10) else np.nan,
                 "yrs_to_first_2x": (s[s >= 2].index[0] - s.index[0]).days / 365.25 if (s >= 2).any() else np.nan})
pth = pd.DataFrame(rows)
pth.to_csv(os.path.join(RES, "tenbagger_paths.csv"), index=False)
q = pth[["maxDD", "n_dd30", "n_dd50", "pct_days_20pct_below_peak", "min_vs_entry", "yrs_to_first_2x", "yrs_to_first_10x"]].quantile([0.1, 0.25, 0.5, 0.75, 0.9])
W(md(q.round(2), index=True))
W(f"\nShare of 10-baggers with a daily drawdown >=50% inside the window: {100*(pth.maxDD<=-0.5).mean():.0f}%; "
  f">=40%: {100*(pth.maxDD<=-0.4).mean():.0f}%; >=30%: {100*(pth.maxDD<=-0.3).mean():.0f}%; "
  f"that traded below the entry price at some point: {100*(pth.min_vs_entry<1).mean():.0f}%; "
  f"that fell >=30% below entry at some point: {100*(pth.min_vs_entry<0.7).mean():.0f}%")

# ---- 5. holding-rule experiments --------------------------------------------------------------
W("\n## F. Holding rules on monthly paths (all 2005-2021 cohort windows; cash earns 0 after exit)\n")


def run_rules(g):
    res = {k: [] for k in ["hold", "stop_-50%_from_cost", "trail_-30%", "trail_-50%", "trim_half_at_3x",
                           "trim_half_at_10x", "sell_all_at_3x"]}
    for _, r in g.iterrows():
        i = months.get_loc(r.t)
        path = (adj[r.tk].iloc[i:i + 61] / adj[r.tk].iloc[i]).values
        path = pd.Series(path).ffill().values
        end = path[-1]
        res["hold"].append(end)
        # stop from cost
        hit = np.where(path <= 0.5)[0]
        res["stop_-50%_from_cost"].append(path[hit[0]] if len(hit) else end)
        pk = np.maximum.accumulate(path)
        for lab, th in (("trail_-30%", 0.7), ("trail_-50%", 0.5)):
            hit = np.where(path <= th * pk)[0]
            res[lab].append(path[hit[0]] if len(hit) else end)
        for lab, lvl in (("trim_half_at_3x", 3), ("trim_half_at_10x", 10)):
            hit = np.where(path >= lvl)[0]
            res[lab].append(0.5 * path[hit[0]] + 0.5 * end if len(hit) else end)
        hit = np.where(path >= 3)[0]
        res["sell_all_at_3x"].append(path[hit[0]] if len(hit) else end)
    rows = []
    for k, v in res.items():
        v = np.array(v)
        rows.append({"rule": k, "mean_x": round(v.mean(), 3), "median_x": round(np.median(v), 3),
                     "%>=10x": round(100 * (v >= 10).mean(), 2), "%>=5x": round(100 * (v >= 5).mean(), 2),
                     "%<=0.5x": round(100 * (v <= 0.5).mean(), 1),
                     "p99_x": round(np.percentile(v, 99), 2)})
    return pd.DataFrame(rows)


pools = {"all 2005-2021": df, "small caps $50M-2B (2010-21)": df[df.mcap.between(5e7, 2e9)],
         "lottery (px<$5 & vol top quintile)": df[(df.px < 5) & (df.groupby("year").vol1y.transform(lambda s: s.rank(pct=True)) > 0.8)]}
for name, g in pools.items():
    W(f"\n### Pool: {name} (N={len(g)})\n")
    W(md(run_rules(g)))
out.close()
