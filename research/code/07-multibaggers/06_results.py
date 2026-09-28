"""
Step 6 - Tables for the report from cohort_panel.pkl (built by 05_equity_analysis.py).
Writes results/*.md and prints the key numbers.
"""
import os, sys, pickle
import numpy as np
import pandas as pd
import statsmodels.api as sm
import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mdtable import md

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
RES = "/home/user/testProject/research/code/07-multibaggers/results"
rng = np.random.default_rng(11)
df = pd.read_pickle(os.path.join(SCR, "cohort_panel.pkl"))
for c in ["mcap", "shares", "fcf", "fcf_yield", "ps", "bm", "ey", "gm", "roe", "roa", "rev_g", "asset_g", "share_chg", "opm",
          "ni", "ocf", "rev", "equity", "assets"]:
    df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
out = open(os.path.join(RES, "equity_results.md"), "w")


def W(s=""):
    out.write(s + "\n")
    print(s)


# ---- SPY benchmark (5y total return multiple for each cohort) ------------------------------------
cache = os.path.join(SCR, "spy.pkl")
if os.path.exists(cache):
    spy = pd.read_pickle(cache)
else:
    spy = yf.download("SPY", start="2000-01-01", auto_adjust=True, progress=False)["Close"]["SPY"]
    spy.to_pickle(cache)
spy_m = spy.groupby(spy.index.to_period("M")).last()
df["SPY5"] = [spy_m[t + 60] / spy_m[t] for t in df.t]
df["SPY10"] = [spy_m[t + 120] / spy_m[t] if (t + 120) in spy_m.index else np.nan for t in df.t]

# WFE / World Bank listed domestic companies (per-capita series x population), for a rough
# survivorship correction of the denominator (2020-21 not published in that series; approx.)
WFE = {2005: 5145, 2006: 5133, 2007: 5109, 2008: 4666, 2009: 4401, 2010: 4279, 2011: 4171,
       2012: 4102, 2013: 4180, 2014: 4369, 2015: 4381, 2016: 4331, 2017: 4336, 2018: 4397,
       2019: 4266, 2020: 4300, 2021: 4600}

# =========================== 1. base rates ======================================================
W("## 1. Base rates of 5-year 10-baggers by cohort (survivor sample, US-domiciled, price >= $1)\n")
rows = []
for y, g in df.groupby("year"):
    gl = g[g.liquid]
    rows.append({
        "cohort(Jun)": y, "N": len(g), "N_liquid": len(gl), "SPY_5y_x": round(g.SPY5.iloc[0], 2),
        "EW_mean_x": round(g.M5.mean(), 2), "median_x": round(g.M5.median(), 2),
        "n_10x": int(g.tenx.sum()), "%10x": round(100 * g.tenx.mean(), 2),
        "%10x_liquid": round(100 * gl.tenx.mean(), 2),
        "%5x": round(100 * g.fivex.mean(), 1), "%3x": round(100 * g.threex.mean(), 1),
        "%beat_SPY": round(100 * (g.M5 > g.SPY5).mean(), 1),
        "%lost>=80%": round(100 * g.loss80.mean(), 1),
        "WFE_listed": WFE[y], "%10x_vs_all_listed(lower bd)": round(100 * g.tenx.sum() / WFE[y], 2),
    })
base = pd.DataFrame(rows)
W(md(base))
tot = {
    "obs": len(df), "tenx": int(df.tenx.sum()), "rate": df.tenx.mean(),
    "rate_liquid": df[df.liquid].tenx.mean(), "fivex": df.fivex.mean(), "loss80": df.loss80.mean(),
    "beatspy": (df.M5 > df.SPY5).mean(), "median": df.M5.median(), "mean": df.M5.mean(),
    "wfe_rate": base.n_10x.sum() / sum(WFE[y] for y in base["cohort(Jun)"]),
}
W(f"\nPooled: {tot['obs']} stock-cohorts, {tot['tenx']} ten-baggers = {100*tot['rate']:.2f}% "
  f"(liquid subset {100*tot['rate_liquid']:.2f}%); 5x+ {100*tot['fivex']:.1f}%; lost>=80% {100*tot['loss80']:.1f}%; "
  f"beat SPY {100*tot['beatspy']:.1f}%; median multiple {tot['median']:.2f}, mean {tot['mean']:.2f}. "
  f"Survivorship-corrected (10x count / all listed companies) ~{100*tot['wfe_rate']:.2f}%.")
W(f"Distinct tickers with >=1 cohort 10x: {df[df.tenx==1].tk.nunique()}")

# 10-year horizon
d10 = df.dropna(subset=["M10"])
W(f"\n10-year horizon (Jun 2005-Jun 2016 cohorts): N={len(d10)}, %10x in 10y = {100*(d10.M10>=10).mean():.2f}%, "
  f"%lost>=80% = {100*(d10.M10<=0.2).mean():.1f}%, median {d10.M10.median():.2f}x, %beat SPY {100*(d10.M10>d10.SPY10).mean():.1f}%")

# =========================== 2. univariate characteristics =====================================
W("\n## 2. 10x rate by within-cohort quintile of each characteristic (Q1 = lowest)\n")
feats = {
    "mcap": "market cap (2010+)", "px": "share price", "mom12_1": "12-1m momentum",
    "ret6": "6m return", "ret1": "1m return", "dist_hi": "price / 52w high", "pos_range": "position in 52w range",
    "vol1y": "1y volatility", "max1m": "max daily return last month", "dvol": "$ volume",
    "age_yrs": "years since first price (trunc. 2003)",
    "fcf_yield": "FCF yield", "ps": "price/sales", "bm": "book/market", "ey": "earnings yield",
    "gm": "gross margin", "roe": "ROE", "rev_g": "revenue growth", "asset_g": "asset growth",
    "share_chg": "share count change", "opm": "operating margin",
}
uni_rows = []
for f_, lab in feats.items():
    d = df.dropna(subset=[f_]).copy()
    if f_ == "age_yrs":
        d = d[d.year >= 2008]
    d["q"] = d.groupby("year")[f_].transform(lambda s: pd.qcut(s.rank(method="first"), 5, labels=False) + 1)
    for q, g in d.groupby("q"):
        uni_rows.append({"feature": lab, "Q": int(q), "N": len(g), "median_value": round(g[f_].median(), 3),
                         "%10x": round(100 * g.tenx.mean(), 2), "%5x": round(100 * g.fivex.mean(), 1),
                         "%lost>=80%": round(100 * g.loss80.mean(), 1),
                         "mean_x": round(g.M5.mean(), 2), "median_x": round(g.M5.median(), 2),
                         "%beat_SPY": round(100 * (g.M5 > g.SPY5).mean(), 1)})
uni = pd.DataFrame(uni_rows)
W(md(uni))
uni.to_csv(os.path.join(RES, "univariate_quintiles.csv"), index=False)

# =========================== 3. logit + out-of-sample ============================================
W("\n## 3. Multivariate logit for P(10x in 5y), cohort fixed effects, SE clustered by ticker\n")


def prep(d, cols):
    X = d[cols].copy()
    for c in cols:
        lo, hi = X[c].quantile([0.01, 0.99])
        X[c] = X[c].clip(lo, hi)
        X[c] = (X[c] - X[c].mean()) / X[c].std()
    return X


def auc(y, s):
    y = np.asarray(y)
    s = pd.Series(np.asarray(s)).rank().values
    n1 = y.sum()
    n0 = len(y) - n1
    return (s[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)


df["log_px"] = np.log(df.px)
df["log_dvol"] = np.log(df.dvol.clip(lower=1e3))
df["log_mcap"] = np.log(df.mcap)
df["log_ps"] = np.log(df.ps)
df["young"] = (df.age_yrs < 3).astype(float)
df["profitable"] = (df.ni > 0).astype(float)
df["fcf_pos"] = (df.fcf > 0).astype(float)

models = {
    "A_price_only_2005_2021": (["log_px", "mom12_1", "ret6", "dist_hi", "vol1y", "max1m", "log_dvol"],
                               df, 2013),
    "B_fundamentals_2010_2021": (["log_mcap", "mom12_1", "ret6", "dist_hi", "vol1y", "max1m", "fcf_yield",
                                  "log_ps", "bm", "rev_g", "profitable", "share_chg", "asset_g"],
                                 df[df.year >= 2010], 2015),
}
oos_rows = []
for name, (cols, d, split) in models.items():
    d = d.dropna(subset=cols + ["tenx"]).copy()
    ev = d.groupby("year").tenx.transform("sum")
    d = d[ev > 0]  # cohorts without any 10x cannot identify a fixed effect
    X = prep(d, cols)
    FE = pd.get_dummies(d.year, prefix="y", drop_first=True, dtype=float)
    XX = sm.add_constant(pd.concat([X, FE], axis=1))
    m = sm.Logit(d.tenx.values, XX.values).fit(disp=0, cov_type="cluster",
                                                cov_kwds={"groups": pd.factorize(d.tk)[0]})
    co = pd.DataFrame({"coef_per_1SD": m.params[1:len(cols) + 1], "z": m.tvalues[1:len(cols) + 1]},
                      index=cols)
    co["odds_ratio_per_1SD"] = np.exp(co.coef_per_1SD)
    W(f"\n### Model {name}: N={len(d)}, 10x events={int(d.tenx.sum())}, pseudo-R2={m.prsquared:.3f}\n")
    W(md(co.round(3), index=True))
    # out of sample: fit on cohorts <= split, test on later
    tr, te = d[d.year <= split], d[d.year > split]
    Xtr, Xte = prep(tr, cols), None
    # standardise test with train moments
    Xall = d[cols].copy()
    for c in cols:
        lo, hi = tr[c].quantile([0.01, 0.99])
        Xall[c] = Xall[c].clip(lo, hi)
        Xall[c] = (Xall[c] - tr[c].clip(lo, hi).mean()) / tr[c].clip(lo, hi).std()
    mtr = sm.Logit(tr.tenx.values, sm.add_constant(Xall.loc[tr.index].values)).fit(disp=0)
    p = mtr.predict(sm.add_constant(Xall.loc[te.index].values, has_constant="add"))
    te = te.assign(p=p)
    te["dec"] = te.groupby("year")["p"].transform(lambda s: pd.qcut(s.rank(method="first"), 10, labels=False) + 1)
    top = te[te.dec == 10]
    oos_rows.append({"model": name, "train": f"<= {split}", "test": f"{split+1}-2021", "N_test": len(te),
                     "AUC": round(auc(te.tenx, te.p), 3),
                     "base_%10x": round(100 * te.tenx.mean(), 2), "topdecile_%10x": round(100 * top.tenx.mean(), 2),
                     "lift": round(top.tenx.mean() / te.tenx.mean(), 2),
                     "topdecile_mean_x": round(top.M5.mean(), 2), "all_mean_x": round(te.M5.mean(), 2),
                     "topdecile_median_x": round(top.M5.median(), 2), "all_median_x": round(te.M5.median(), 2),
                     "topdecile_%lost80": round(100 * top.loss80.mean(), 1), "all_%lost80": round(100 * te.loss80.mean(), 1),
                     "bottomdecile_%10x": round(100 * te[te.dec == 1].tenx.mean(), 2),
                     "share_of_all_10x_caught_by_topdecile_%": round(100 * top.tenx.sum() / te.tenx.sum(), 1),
                     "top3deciles_%10x": round(100 * te[te.dec >= 8].tenx.mean(), 2),
                     "top3deciles_mean_x": round(te[te.dec >= 8].M5.mean(), 2)})
oos = pd.DataFrame(oos_rows)
W("\n### Out-of-sample (train early cohorts, test later cohorts; deciles of predicted probability within cohort)\n")
W(md(oos))

# =========================== 4. screens ============================================================
W("\n## 4. Simple screens (2010-2021 cohorts unless noted): hit rates vs base rate\n")
f = df[df.year >= 2010].copy()
small = f.mcap.between(50e6, 2e9)
screens = {
    "ALL (2010-21, base)": f.index == f.index,
    "Small cap $50M-2B": small,
    "Micro cap $50-300M": f.mcap.between(50e6, 3e8),
    "Large cap > $10B": f.mcap > 1e10,
    "Small + mom12_1>0": small & (f.mom12_1 > 0),
    "Small + mom>0 + FCF>0": small & (f.mom12_1 > 0) & (f.fcf > 0),
    "Small + FCF yield>5% + B/M>0.5 (value)": small & (f.fcf_yield > 0.05) & (f.bm > 0.5),
    "Yartseva-like: small + FCFy>5% + B/M>0.5 + lower 30% of 52w range": small & (f.fcf_yield > 0.05) & (f.bm > 0.5) & (f.pos_range < 0.3),
    "Growth: small + rev_g>25% + GM>40%": small & (f.rev_g > 0.25) & (f.gm > 0.4),
    "Growth + near 52w high (>=90%) (CANSLIM-lite)": small & (f.rev_g > 0.25) & (f.gm > 0.4) & (f.dist_hi >= 0.9),
    "Growth + near 52w high + profitable": small & (f.rev_g > 0.25) & (f.gm > 0.4) & (f.dist_hi >= 0.9) & (f.ni > 0),
    "Quality compounder: ROE>15% + rev_g>10% + mcap<$5B": (f.roe > 0.15) & (f.rev_g > 0.10) & (f.mcap < 5e9) & (f.mcap > 5e7),
    "Fisher super-stock: P/S<0.75 + rev_g>15% + small": small & (f.ps < 0.75) & (f.rev_g > 0.15),
    "Top-decile 12-1 momentum (all caps)": f.groupby("year").mom12_1.transform(lambda s: s.rank(pct=True)) > 0.9,
    "Top-decile momentum + small": small & (f.groupby("year").mom12_1.transform(lambda s: s.rank(pct=True)) > 0.9),
    "Lottery: top-quintile vol + price<$5": (f.groupby("year").vol1y.transform(lambda s: s.rank(pct=True)) > 0.8) & (f.px < 5),
    "Unprofitable + rev_g>50% (story stocks)": (f.ni < 0) & (f.rev_g > 0.5),
    "Heavy dilution: shares +20% y/y": f.share_chg > 0.2,
}
sc_rows = []
for name, mask in screens.items():
    g = f[mask.fillna(False) if hasattr(mask, "fillna") else mask]
    if len(g) == 0:
        continue
    # per-cohort excess of screen EW mean multiple vs cohort EW mean multiple
    coh = g.groupby("year").agg(n=("M5", "size"), sm=("M5", "mean"), s10=("tenx", "mean"))
    allc = f.groupby("year").agg(am=("M5", "mean"), a10=("tenx", "mean"))
    coh = coh.join(allc)
    sc_rows.append({"screen": name, "N": len(g), "avg_per_cohort": round(len(g) / f.year.nunique(), 0),
                    "%10x": round(100 * g.tenx.mean(), 2), "lift_vs_base": round(g.tenx.mean() / f.tenx.mean(), 2),
                    "%5x": round(100 * g.fivex.mean(), 1), "%lost>=80%": round(100 * g.loss80.mean(), 1),
                    "median_x": round(g.M5.median(), 2), "EW_mean_x": round(g.M5.mean(), 2),
                    "%beat_SPY": round(100 * (g.M5 > g.SPY5).mean(), 1),
                    "cohorts_10x_rate>base": f"{int((coh.s10 > coh.a10).sum())}/{len(coh)}",
                    "cohorts_mean>base": f"{int((coh.sm > coh.am).sum())}/{len(coh)}"})
sc = pd.DataFrame(sc_rows)
W(md(sc))
sc.to_csv(os.path.join(RES, "screens.csv"), index=False)

# =========================== 5. what did the winners look like / path =========================
W("\n## 5. Ten-baggers vs the rest: medians of characteristics at formation\n")
comp_cols = ["mcap", "px", "mom12_1", "ret6", "dist_hi", "pos_range", "vol1y", "max1m", "dvol", "fcf_yield",
             "ps", "bm", "gm", "roe", "rev_g", "share_chg"]
cmp_ = pd.DataFrame({
    "10-baggers": df[df.tenx == 1][comp_cols].median(),
    "others": df[df.tenx == 0][comp_cols].median(),
    "10x: share with data": df[df.tenx == 1][comp_cols].notna().mean(),
})
cmp_["10x: %profitable"] = np.nan
W(md(cmp_.round(3), index=True))
tb = df[df.tenx == 1]
W(f"\n10-baggers (N={len(tb)}): profitable at start {100*(tb.ni>0).mean():.0f}% (of those with data {tb.ni.notna().sum()}), "
  f"FCF>0 {100*(tb.fcf>0)[tb.ocf.notna()].mean():.0f}%, mcap<$2B {100*(tb.mcap<2e9)[tb.mcap.notna()].mean():.0f}%, "
  f"mcap<$300M {100*(tb.mcap<3e8)[tb.mcap.notna()].mean():.0f}%; "
  f"others: profitable {100*(df[df.tenx==0].ni>0)[df[df.tenx==0].ni.notna()].mean():.0f}%, "
  f"mcap<$2B {100*(df[df.tenx==0].mcap<2e9)[df[df.tenx==0].mcap.notna()].mean():.0f}%")
W(f"\nPath inside the 5-year window for ten-baggers (month-end data): median max drawdown {100*tb.path_mdd.median():.0f}%, "
  f"IQR {100*tb.path_mdd.quantile(0.75):.0f}% to {100*tb.path_mdd.quantile(0.25):.0f}%; "
  f"share with a >=50% drawdown {100*(tb.path_mdd<=-0.5).mean():.0f}%; >=30%: {100*(tb.path_mdd<=-0.3).mean():.0f}%; "
  f"share below entry price after 1 year {100*(tb.M1<1).mean():.0f}%; median multiple after 1y {tb.M1.median():.2f}, after 3y {tb.M3.median():.2f}")
hit = df[df.maxM >= 10]
W(f"\nStocks that touched 10x (month-end) at some point within 5 years: {len(hit)}; of these ended the window "
  f">=10x: {100*(hit.M5>=10).mean():.0f}%, ended <5x: {100*(hit.M5<5).mean():.0f}%, ended <2x: {100*(hit.M5<2).mean():.0f}%")
W(f"All stocks: share with >=50% drawdown within window {100*(df.path_mdd<=-0.5).mean():.0f}%; "
  f"of stocks with a >=50% drawdown, share that still ended >=10x: {100*df[df.path_mdd<=-0.5].tenx.mean():.2f}%")

# =========================== 6. baskets =============================================================
W("\n## 6. Basket simulation: pick N stocks at random from a pool, equal weight, hold 5 years\n")


def basket(pool, Ns=(1, 3, 5, 10, 20, 30, 50), sims=4000):
    res = []
    for N in Ns:
        agg = []
        for y, g in pool.groupby("year"):
            if len(g) < 5:
                continue  # need a minimally populated cohort; sample WITH replacement (empirical distribution)
            M = g.M5.values
            T = g.tenx.values
            spy5 = g.SPY5.iloc[0]
            idx = rng.integers(0, len(g), size=(sims, N))
            bm = M[idx].mean(axis=1)
            anyx = T[idx].max(axis=1)
            agg.append([anyx.mean(), np.median(bm), (bm > spy5).mean(), (bm < 1).mean(),
                        np.percentile(bm, 5), np.percentile(bm, 95), bm.mean()])
        a = np.array(agg).mean(axis=0)
        res.append({"N": N, "P(>=1 tenbagger)": round(a[0], 3), "median basket x": round(a[1], 2),
                    "P(beat SPY)": round(a[2], 3), "P(lose money)": round(a[3], 3),
                    "5th pct x": round(a[4], 2), "95th pct x": round(a[5], 2), "mean x": round(a[6], 2)})
    return pd.DataFrame(res)


pools = {
    "Liquid universe 2005-21 (price>=$3, ADV>=$1M)": df[df.liquid],
    "Small caps $50M-2B 2010-21": f[small],
    "Small + mom>0 + FCF>0 2010-21": f[small & (f.mom12_1 > 0) & (f.fcf > 0)],
    "Lottery pool (top-quintile vol, px<$5) 2010-21": f[(f.groupby("year").vol1y.transform(lambda s: s.rank(pct=True)) > 0.8) & (f.px < 5)],
}
for name, pool in pools.items():
    W(f"\n### Pool: {name} (base 10x rate {100*pool.tenx.mean():.2f}%)\n")
    W(md(basket(pool)))

# candidate "multibagger sleeve" pools (post-hoc, informed by sections 2-4: in-sample, survivor data)
W("\n## 7. Candidate sleeve pools (POST-HOC, in-sample 2010-2021, survivor data -> optimistic)\n")
f["psq"] = f.groupby("year").ps.transform(lambda s: s.rank(pct=True))
cand = {
    "GARP-small: $50M-2B, P/S<2, rev_g>15%, share_chg<10%": f[small & (f.ps < 2) & (f.rev_g > 0.15) & (f.share_chg < 0.10)],
    "Cheapest P/S quintile, any size >$50M": f[(f.psq <= 0.2) & (f.mcap > 5e7)],
    "Quality compounder: ROE>15%, rev_g>10%, $50M-5B": f[(f.roe > 0.15) & (f.rev_g > 0.10) & f.mcap.between(5e7, 5e9)],
}
for name, pool in cand.items():
    W(f"\n### Pool: {name}: N={len(pool)}, {len(pool)/f.year.nunique():.0f}/cohort, 10x rate {100*pool.tenx.mean():.2f}%, "
      f"mean {pool.M5.mean():.2f}x vs all {f.M5.mean():.2f}x, median {pool.M5.median():.2f}x, lost>=80% {100*pool.loss80.mean():.1f}%\n")
    W(md(basket(pool, Ns=(1, 5, 10, 20, 30))))

# analytical
W("\n### Analytical P(at least one 10x) = 1-(1-p)^N\n")
rows = []
for p in (0.005, 0.01, 0.02, 0.03, 0.05, 0.10):
    rows.append({"p": f"{100*p:.1f}%", **{f"N={n}": round(1 - (1 - p) ** n, 3) for n in (1, 5, 10, 20, 30, 50, 100)}})
W(md(pd.DataFrame(rows)))
out.close()
