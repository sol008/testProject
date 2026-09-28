"""Variance-risk-premium study: VIX vs subsequent realised vol of the S&P 500.

Questions
  Q1  How often is implied (VIX) below subsequent 21-trading-day realised vol?
  Q2  Average VRP (vol points and variance terms), by era.
  Q3  Which observable conditions predict negative VRP ("cheap options")?
      VIX level / percentile, VIX term structure (VIX/VIX3M, VIX9D/VIX),
      index trend, credit spreads, implied-minus-trailing-realised.
  Q4  Is the premium smaller per unit of time at longer horizons?
      (VIX9D, VIX, VIX3M, VIX6M, VIX1Y vs matched forward realised vol)
  Q5  Out-of-sample: does a model fitted 1990-2007 identify negative-VRP days
      in 2008-2026 well enough to matter for a long-vol trade?

Definitions
  RV_fwd(h)_t = 100*sqrt(252/h * sum_{i=1..h} r_{t+i}^2), r = log close-to-close.
  VRP_t       = VIX_t - RV_fwd(21)_t (vol points);  var-VRP = VIX^2 - RV^2.
  Negative VRP ("implied < realised") <=> buyer of 1-month variance would profit.

Note: FRED now serves only the last ~3y of ICE BofA HY OAS (BAMLH0A0HYM2),
so the long-history credit proxy is Moody's Baa minus 10y Treasury (BAA10Y).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import rankdata

from common import OUT, cboe, fred, yf_close, save_table

H = 21


def fwd_rv(r: pd.Series, h: int) -> pd.Series:
    sq = r ** 2
    s = sq[::-1].rolling(h).sum()[::-1].shift(-1)
    return np.sqrt(252.0 / h * s) * 100


def past_rv(r: pd.Series, h: int) -> pd.Series:
    return np.sqrt(252.0 / h * (r ** 2).rolling(h).sum()) * 100


def auc(y, p):
    y = np.asarray(y).astype(bool)
    p = np.asarray(p)
    n1, n0 = y.sum(), (~y).sum()
    if n1 == 0 or n0 == 0:
        return np.nan
    ranks = rankdata(p)
    return (ranks[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)


def rolling_pct(s: pd.Series, w: int = 252) -> pd.Series:
    return s.rolling(w, min_periods=int(w * 0.8)).apply(lambda x: (x[:-1] < x[-1]).mean(), raw=True)


def build_panel() -> pd.DataFrame:
    spx = yf_close("^GSPC")
    vix = cboe("VIX")
    vix3m = yf_close("^VIX3M", start="2006-01-01")
    vix9d = cboe("VIX9D")
    vix6m = cboe("VIX6M")
    vix1y = cboe("VIX1Y")
    vvix = cboe("VVIX")
    skew = cboe("SKEW")
    baa = fred("BAA10Y")
    hy = fred("BAMLH0A0HYM2")

    r = np.log(spx).diff()
    df = pd.DataFrame({"spx": spx, "r": r})
    df = df.join(pd.DataFrame({"vix": vix, "vix3m": vix3m, "vix9d": vix9d, "vix6m": vix6m,
                               "vix1y": vix1y, "vvix": vvix, "skew": skew}), how="left")
    df = df.join(pd.DataFrame({"baa": baa, "hy": hy}), how="left")
    df[["baa", "hy"]] = df[["baa", "hy"]].ffill(limit=5)
    for h in (6, 21, 63, 126, 252):
        df[f"rv_fwd{h}"] = fwd_rv(df.r, h)
    df["rv_past21"] = past_rv(df.r, 21)
    df["rv_past63"] = past_rv(df.r, 63)
    df["ma200"] = df.spx.rolling(200).mean()
    df["trend200"] = df.spx / df.ma200 - 1
    df["ret21"] = np.log(df.spx).diff(21)
    df["ret63"] = np.log(df.spx).diff(63)
    df = df.loc["1990-01-02":]
    df["vix_pct252"] = rolling_pct(df.vix, 252)
    df["lvix"] = np.log(df.vix)
    df["vrp"] = df.vix - df.rv_fwd21
    df["var_vrp"] = df.vix ** 2 - df.rv_fwd21 ** 2
    df["neg"] = (df.rv_fwd21 > df.vix).astype(float)
    df.loc[df.rv_fwd21.isna(), "neg"] = np.nan
    df["iv_minus_past"] = df.vix - df.rv_past21
    df["ts3m"] = df.vix / df.vix3m
    df["ts9d"] = df.vix9d / df.vix
    df["dbaa21"] = df.baa.diff(21)
    df["baa_pct5y"] = df.baa.rolling(1260, min_periods=500).apply(lambda x: (x[:-1] < x[-1]).mean(), raw=True)
    df["dvix5"] = df.vix.diff(5)
    return df


def bucket_table(df, col, bins, labels=None):
    d = df.dropna(subset=[col, "vrp"])
    cats = pd.cut(d[col], bins=bins, labels=labels)
    g = d.groupby(cats, observed=True)
    t = pd.DataFrame({
        "days": g.size(),
        "share_days": g.size() / len(d),
        "p_neg_vrp": g.neg.mean(),
        "mean_vrp_volpts": g.vrp.mean(),
        "median_vrp_volpts": g.vrp.median(),
        "mean_vix": g.vix.mean(),
        "mean_rv_fwd21": g.rv_fwd21.mean(),
        "mean_neg_size_when_neg": g.apply(lambda x: x.loc[x.neg == 1, "vrp"].mean()),
        "p_rv_gt_1.5x_vix": g.apply(lambda x: (x.rv_fwd21 > 1.5 * x.vix).mean()),
    })
    return t


def main():
    df = build_panel()
    df.to_csv(OUT.parent / "output" / "vrp_panel.csv.gz", compression="gzip", float_format="%.5f")
    d = df.dropna(subset=["vrp"])
    print(f"Sample {d.index[0].date()} -> {d.index[-1].date()}  n={len(d)}")

    # ---------------- Q1/Q2 headline ----------------
    head = {}
    for name, sub in [("1990-2026", d), ("1990-1999", d.loc[:"1999"]), ("2000-2009", d.loc["2000":"2009"]),
                      ("2010-2019", d.loc["2010":"2019"]), ("2020-2026", d.loc["2020":])]:
        head[name] = dict(n=len(sub), mean_vix=sub.vix.mean(), mean_rv_fwd21=sub.rv_fwd21.mean(),
                          mean_vrp=sub.vrp.mean(), median_vrp=sub.vrp.median(),
                          mean_var_vrp=sub.var_vrp.mean(),
                          var_vrp_pct_of_vix2=(sub.var_vrp / sub.vix ** 2).mean(),
                          p_neg=sub.neg.mean(),
                          mean_vrp_when_neg=sub.loc[sub.neg == 1, "vrp"].mean(),
                          mean_vrp_when_pos=sub.loc[sub.neg == 0, "vrp"].mean(),
                          p_rv_gt_vix_plus5=(sub.rv_fwd21 > sub.vix + 5).mean(),
                          p_rv_gt_vix_plus10=(sub.rv_fwd21 > sub.vix + 10).mean())
    head = pd.DataFrame(head).T
    save_table(head, "vrp_headline")
    print(head.round(3).to_string())

    # ---------------- Q3 conditional tables ----------------
    tabs = {}
    tabs["vix_level"] = bucket_table(d, "vix", [0, 12, 15, 20, 25, 30, 40, 100])
    tabs["vix_pct252"] = bucket_table(d, "vix_pct252", [-0.01, 0.1, 0.2, 0.4, 0.6, 0.8, 0.9, 1.01])
    tabs["ts_vix_over_vix3m"] = bucket_table(d, "ts3m", [0, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 3])
    tabs["ts_vix9d_over_vix"] = bucket_table(d, "ts9d", [0, 0.8, 0.9, 1.0, 1.1, 3])
    tabs["trend200"] = bucket_table(d, "trend200", [-1, -0.1, -0.05, 0, 0.05, 0.1, 1])
    tabs["ret21"] = bucket_table(d, "ret21", [-1, -0.1, -0.05, -0.02, 0, 0.02, 0.05, 1])
    tabs["iv_minus_past_rv"] = bucket_table(d, "iv_minus_past", [-100, -5, 0, 2, 4, 6, 8, 100])
    tabs["baa_spread"] = bucket_table(d, "baa", [0, 1.5, 2.0, 2.5, 3.0, 4.0, 10])
    tabs["baa_pct5y"] = bucket_table(d, "baa_pct5y", [-0.01, 0.2, 0.4, 0.6, 0.8, 1.01])
    tabs["dbaa21"] = bucket_table(d, "dbaa21", [-5, -0.2, 0, 0.1, 0.25, 5])
    tabs["hy_oas_2023plus"] = bucket_table(d, "hy", [0, 3, 3.5, 4, 5, 20])
    tabs["vvix"] = bucket_table(d, "vvix", [0, 80, 90, 100, 110, 125, 300])
    tabs["skew_idx"] = bucket_table(d, "skew", [0, 115, 125, 135, 145, 200])
    for k, t in tabs.items():
        save_table(t, f"vrp_bucket_{k}")
        print(f"\n--- {k} ---")
        print(t.round(3).to_string())

    # Combined "cheapest options" screens (ex-ante observable)
    screens = {
        "all days": pd.Series(True, index=d.index),
        "VIX<13": d.vix < 13,
        "VIX pct252<=10%": d.vix_pct252 <= 0.10,
        "VIX<RV_past21": d.iv_minus_past < 0,
        "VIX/VIX3M<0.85": d.ts3m < 0.85,
        "VIX/VIX3M>1": d.ts3m > 1.0,
        "SPX<MA200": d.trend200 < 0,
        "SPX<MA200 & VIX<RV_past21": (d.trend200 < 0) & (d.iv_minus_past < 0),
        "VIX<13 & SPX>MA200": (d.vix < 13) & (d.trend200 > 0),
        "dBAA21>+0.25": d.dbaa21 > 0.25,
        "VIX pct252<=10% & dBAA21>0": (d.vix_pct252 <= 0.10) & (d.dbaa21 > 0),
        "VIX>30": d.vix > 30,
    }
    rows = {}
    for k, m in screens.items():
        sub = d[m.fillna(False)]
        rows[k] = dict(days=len(sub), p_neg=sub.neg.mean(), mean_vrp=sub.vrp.mean(),
                       median_vrp=sub.vrp.median(), mean_var_vrp_pct=(sub.var_vrp / sub.vix ** 2).mean())
    scr = pd.DataFrame(rows).T
    save_table(scr, "vrp_screens")
    print("\n--- screens ---")
    print(scr.round(3).to_string())

    # ---------------- Q3b HAC regression (full sample) ----------------
    feats = ["lvix", "vix_pct252", "trend200", "ret21", "iv_minus_past", "baa", "dbaa21"]
    dd = d.dropna(subset=feats + ["vrp"])
    X = sm.add_constant(dd[feats])
    ols = sm.OLS(dd.vrp, X).fit(cov_type="HAC", cov_kwds={"maxlags": 25})
    print("\nOLS VRP on features (HAC NW 25 lags), full sample")
    print(ols.summary().tables[1])
    pd.DataFrame({"coef": ols.params, "t_hac": ols.tvalues}).to_csv(OUT / "vrp_ols_hac_full.csv", float_format="%.4f")

    # ---------------- Q5 out-of-sample logistic ----------------
    res = []
    specs = {
        "base_1990": dict(feats=feats, is_=("1990-01-01", "2007-12-31"), oos=("2008-01-01", "2026-12-31")),
        "base+ts_2006": dict(feats=feats + ["ts3m"], is_=("2006-07-17", "2015-12-31"), oos=("2016-01-01", "2026-12-31")),
        "base_2006_same_split": dict(feats=feats, is_=("2006-07-17", "2015-12-31"), oos=("2016-01-01", "2026-12-31")),
    }
    oos_preds = {}
    for name, sp in specs.items():
        dd = d.dropna(subset=sp["feats"] + ["neg"])
        tr = dd.loc[sp["is_"][0]:sp["is_"][1]]
        te = dd.loc[sp["oos"][0]:sp["oos"][1]]
        mu, sd = tr[sp["feats"]].mean(), tr[sp["feats"]].std()
        Xtr = sm.add_constant((tr[sp["feats"]] - mu) / sd)
        Xte = sm.add_constant((te[sp["feats"]] - mu) / sd, has_constant="add")
        m = sm.Logit(tr.neg, Xtr).fit(disp=0)
        p_tr, p_te = m.predict(Xtr), m.predict(Xte)
        oos_preds[name] = pd.DataFrame({"p": p_te, "neg": te.neg, "vrp": te.vrp, "vix": te.vix})
        # decile analysis OOS
        top = te[p_te >= np.quantile(p_te, 0.9)]
        top5 = te[p_te >= np.quantile(p_te, 0.95)]
        res.append(dict(model=name, n_is=len(tr), n_oos=len(te), base_rate_is=tr.neg.mean(), base_rate_oos=te.neg.mean(),
                        auc_is=auc(tr.neg, p_tr), auc_oos=auc(te.neg, p_te),
                        oos_top10_p_neg=top.neg.mean(), oos_top10_mean_vrp=top.vrp.mean(),
                        oos_top5_p_neg=top5.neg.mean(), oos_top5_mean_vrp=top5.vrp.mean(),
                        oos_p_gt_05_days=int((p_te > 0.5).sum()),
                        oos_p_gt_05_p_neg=te[p_te > 0.5].neg.mean() if (p_te > 0.5).any() else np.nan,
                        oos_p_gt_05_mean_vrp=te[p_te > 0.5].vrp.mean() if (p_te > 0.5).any() else np.nan))
        coefs = pd.DataFrame({"coef": m.params, "z": m.tvalues})
        coefs.to_csv(OUT / f"vrp_logit_coefs_{name}.csv", float_format="%.4f")
        print(f"\nLogit {name} (standardised feats; z-stats not HAC -> overstated)")
        print(coefs.round(3).to_string())
    res = pd.DataFrame(res).set_index("model")
    save_table(res, "vrp_logit_oos")
    print("\n--- logistic OOS ---")
    print(res.round(3).T.to_string())

    # ---------------- Q4 term structure of the premium ----------------
    pairs = [("vix9d", "rv_fwd6", "9 calendar days"), ("vix", "rv_fwd21", "30 days"),
             ("vix3m", "rv_fwd63", "3 months"), ("vix6m", "rv_fwd126", "6 months"),
             ("vix1y", "rv_fwd252", "1 year")]
    tsrows = []
    for common_start in ("2011-01-03", None):
        for iv, rv, lab in pairs:
            sub = df.dropna(subset=[iv, rv])
            if common_start:
                sub = sub.loc[common_start:]
            tsrows.append(dict(sample="common 2011+" if common_start else "max available", horizon=lab,
                               start=sub.index[0].date(), end=sub.index[-1].date(), n=len(sub),
                               mean_iv=sub[iv].mean(), mean_rv=sub[rv].mean(),
                               mean_vrp_volpts=(sub[iv] - sub[rv]).mean(),
                               mean_varswap_return_to_buyer=((sub[rv] ** 2 - sub[iv] ** 2) / sub[iv] ** 2).mean(),
                               median_varswap_return_to_buyer=((sub[rv] ** 2 - sub[iv] ** 2) / sub[iv] ** 2).median(),
                               p_iv_below_rv=(sub[rv] > sub[iv]).mean()))
    ts = pd.DataFrame(tsrows)
    save_table(ts.set_index(["sample", "horizon"]), "vrp_term_structure")
    print("\n--- term structure of VRP ---")
    print(ts.round(3).to_string())

    # charts are produced by s07_figures.py (single-axis panels, shared palette)


if __name__ == "__main__":
    main()
