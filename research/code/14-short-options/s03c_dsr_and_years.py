"""s03c - Data-mining haircut for the s03 grid: deflated Sharpe (Bailey & Lopez de Prado 2014) and
Bonferroni thresholds for named variants, plus calendar-year P&L (sum of R) for the main variants."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm

from common14 import OUT, deflated_sharpe, save

NAMED = {"PCS20/5 tp21 F5 (prescribed)": ("PCS", 0.2, 0.05, 45, "tp21", "F5"),
         "PCS20/5 tp21 F3 (trend)": ("PCS", 0.2, 0.05, 45, "tp21", "F3"),
         "PCS20/5 tp21 F0": ("PCS", 0.2, 0.05, 45, "tp21", "F0"),
         "IC20/5 tp21 F5 (prescribed)": ("IC", 0.2, 0.05, 45, "tp21", "F5"),
         "IC20/5 tp21 F3 (trend)": ("IC", 0.2, 0.05, 45, "tp21", "F3"),
         "IC10/5 hold F6 (best IS)": ("IC", 0.1, 0.05, 45, "hold", "F6"),
         "PCS10/5 hold F0": ("PCS", 0.1, 0.05, 45, "hold", "F0")}


def main():
    st = pd.read_csv(OUT / "s03_variant_stats.csv")
    tr = pd.read_csv(OUT / "s03_trades_all.csv.gz", parse_dates=["entry", "exit"])
    base = st[(st.fill == 0.25) & (st.n >= 20)]
    rows = []
    for per in ["IS 1990-2007", "OOS 2008-2026"]:
        b = base[base.period == per]
        n_trials, sr_var = len(b), b.sharpe_trade.var()
        for name, (s, d, w, dte, rule, f) in NAMED.items():
            x = b[(b.struct == s) & np.isclose(b.sdelta, d) & np.isclose(b.width, w) & (b.dte == dte) & (b.rule == rule) & (b["filter"] == f)]
            if x.empty:
                continue
            x = x.iloc[0]
            dsr, sr0 = deflated_sharpe(x.sharpe_trade, int(x.n), n_trials, sr_var, x["skew"], x["kurt"] + 3)
            rows.append(dict(variant=name, period=per, n=int(x.n), mean_R=x["mean"], t=x.t, sharpe_trade=x.sharpe_trade,
                             n_trials=n_trials, SR0_expected_max=sr0, DSR=dsr,
                             bonferroni_t_840=norm.ppf(1 - 0.025 / 840), bonferroni_t_50=norm.ppf(1 - 0.025 / 50),
                             passes_bonf_840=abs(x.t) > norm.ppf(1 - 0.025 / 840), passes_bonf_50=abs(x.t) > norm.ppf(1 - 0.025 / 50)))
    res = pd.DataFrame(rows)
    save(res, "s03c_dsr_named", index=False)
    yrs = []
    for name, (s, d, w, dte, rule, f) in NAMED.items():
        g = tr[(tr.struct == s) & np.isclose(tr.sdelta, d) & np.isclose(tr.width, w) & (tr.dte == dte) & (tr.rule == rule) & np.isclose(tr.fill, 0.25)]
        g = g[g[f]]
        y = g.groupby(g.entry.dt.year).R.sum().rename(name)
        yrs.append(y)
    Y = pd.concat(yrs, axis=1)
    save(Y, "s03c_calendar_year_sumR")
    with pd.option_context("display.width", 250):
        print(res.round(3).to_string(index=False))
        print(Y.round(2).to_string())
        print("negative years:", (Y < 0).sum().to_dict())


if __name__ == "__main__":
    main()
