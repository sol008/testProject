"""Part 5: CAPE and forward 10-year real total returns (Shiller data 1871-2023, extended to 2026-09).

Forward return = annualised real total return (dividends reinvested monthly, CPI-deflated) from month m
to month m+120, for start months 1881-01 .. 2016-09.  Deciles are formed over that whole sample (so the
decile BOUNDARIES use hindsight; fixed buckets are shown too).  Overlapping 10-year windows mean the
~1,630 monthly observations contain only ~14 independent decades.
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import statsmodels.api as sm

import data

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")


def run():
    sh = data.shiller_extended()
    trr = sh["TRR"]
    fwd = (trr.shift(-120) / trr) ** (1 / 10) - 1
    fwd5 = (trr.shift(-60) / trr) ** (1 / 5) - 1
    df = pd.DataFrame({"CAPE": sh["CAPE"], "fwd10": fwd, "fwd5": fwd5}).dropna(subset=["CAPE"])
    samp = df.loc["1881-01-01":"2016-09-01"].dropna(subset=["fwd10"])
    samp["decile"] = pd.qcut(samp["CAPE"], 10, labels=False) + 1
    dec = samp.groupby("decile").agg(cape_min=("CAPE", "min"), cape_max=("CAPE", "max"), n=("fwd10", "size"),
                                     mean=("fwd10", "mean"), median=("fwd10", "median"), min=("fwd10", "min"),
                                     max=("fwd10", "max"), pct_negative=("fwd10", lambda x: (x < 0).mean()))
    bins = [0, 10, 15, 20, 25, 30, 35, 100]
    samp["bucket"] = pd.cut(samp["CAPE"], bins)
    bk = samp.groupby("bucket", observed=True).agg(n=("fwd10", "size"), mean=("fwd10", "mean"), median=("fwd10", "median"),
                                                    min=("fwd10", "min"), max=("fwd10", "max"),
                                                    pct_negative=("fwd10", lambda x: (x < 0).mean()),
                                                    first=("fwd10", lambda x: x.index.min().strftime("%Y-%m")),
                                                    last=("fwd10", lambda x: x.index.max().strftime("%Y-%m")))
    # regression of fwd10 on log CAPE, full sample and post-1950
    reg = {}
    for lab, s in [("1881-2016", samp), ("1950-2016", samp.loc["1950":]), ("1990-2016", samp.loc["1990":])]:
        X = sm.add_constant(np.log(s["CAPE"]))
        m = sm.OLS(s["fwd10"], X).fit(cov_type="HAC", cov_kwds={"maxlags": 120})
        reg[lab] = {"a": m.params.iloc[0], "b": m.params.iloc[1], "t_b": m.tvalues.iloc[1], "r2": m.rsquared,
                    "n": len(s)}
    cur_cape = float(sh["CAPE"].dropna().iloc[-1])
    cur_month = sh["CAPE"].dropna().index[-1]
    pctile = float((df["CAPE"].dropna() < cur_cape).mean())
    preds = {k: v["a"] + v["b"] * np.log(cur_cape) for k, v in reg.items()}
    # historical months with CAPE >= 35 and their forward returns
    hi = samp[samp["CAPE"] >= 35]
    # extremes: first month CAPE crossed 30 in each episode
    c = df["CAPE"]
    cross = c[(c >= 30) & (c.shift(1) < 30)]
    ep = []
    last = None
    for d in cross.index:
        if last is not None and (d - last).days < 365 * 3:
            continue
        last = d
        ep.append({"first_month_CAPE>=30": d.strftime("%Y-%m"), "CAPE": round(c.loc[d], 1),
                   "fwd5_real": df.loc[d, "fwd5"], "fwd10_real": df.loc[d, "fwd10"]})
    ep = pd.DataFrame(ep)
    dec.to_csv(os.path.join(OUT, "cape_deciles.csv"))
    bk.to_csv(os.path.join(OUT, "cape_buckets.csv"))
    ep.to_csv(os.path.join(OUT, "cape_above30_episodes.csv"), index=False)
    return {"deciles": dec, "buckets": bk, "reg": pd.DataFrame(reg).T, "current": cur_cape, "current_month": cur_month,
            "pctile": pctile, "preds": preds, "hi": hi, "ep30": ep, "sh": sh, "samp": samp}


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    r = run()
    print(r["deciles"].round(3).to_string())
    print(r["buckets"].round(3).to_string())
    print(r["reg"].round(4).to_string())
    print("current CAPE", r["current"], r["current_month"], "percentile", r["pctile"], "preds", r["preds"])
    print(r["ep30"].round(3).to_string())
    print("months CAPE>=35 in 1881-2016 sample:", len(r["hi"]), r["hi"]["fwd10"].describe().round(3).to_dict())
    print(r["hi"].index.min(), r["hi"].index.max())
