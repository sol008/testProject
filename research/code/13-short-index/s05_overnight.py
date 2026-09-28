"""Track 13 / test 5: overnight vs intraday decomposition (buy the close, sell the open).

overnight_t = adjOpen_t / adjClose_{t-1} - 1   (dividends included via the Yahoo factor)
intraday_t  = adjClose_t / adjOpen_t - 1
Strategy 'overnight': buy at every close, sell at the next open: 1 round trip per session.
Break-even cost per side = mean(overnight - rf) / 2.
Instruments: SPY (1993-), QQQ (1999-), IWM (2000-), DIA (1998-), EFA (2001-).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common13 import SPLIT, TODAY, Registry, load, save

REG = Registry("s05_overnight")


def decompose(tk: str) -> pd.DataFrame:
    df = load(tk)
    on = df["aO"] / df["aC"].shift(1) - 1
    intra = df["aC"] / df["aO"] - 1
    cc = df["aC"].pct_change()
    out = pd.DataFrame({"on": on, "intra": intra, "cc": cc, "rf": df["rf"]}).dropna()
    # drop the handful of days with a stale/zero open
    out = out[(df["O"].reindex(out.index) != df["C"].shift(1).reindex(out.index)) | (out.index.year > 2001)]
    return out


def stats_block(x: pd.DataFrame, label: str, tk: str) -> list[dict]:
    rows = []
    yrs = len(x) / 252.0
    for leg in ("on", "intra", "cc"):
        r = x[leg]
        ann = (1 + r).prod() ** (1 / yrs) - 1
        rows.append(dict(inst=tk, period=label, leg=leg, days=len(x), ann_geo=ann,
                         mean_bp=1e4 * r.mean(), sd_bp=1e4 * r.std(),
                         sharpe=(r - x["rf"]).mean() / r.std() * np.sqrt(252),
                         t=(r - x["rf"]).mean() / r.std() * np.sqrt(len(r)), win=(r > 0).mean()))
    # overnight strategy net of costs (rf earned only intraday; we charge rf nothing overnight)
    for c in (0.0, 0.5, 1.0, 2.0, 3.0):
        net = (1 + x["on"]) * (1 - c / 1e4) / (1 + c / 1e4) - 1
        ann = (1 + net).prod() ** (1 / yrs) - 1
        rows.append(dict(inst=tk, period=label, leg=f"overnight_net_{c}bp", days=len(x), ann_geo=ann,
                         mean_bp=1e4 * net.mean(), sd_bp=1e4 * net.std(),
                         sharpe=(net - x["rf"]).mean() / net.std() * np.sqrt(252),
                         t=(net - x["rf"]).mean() / net.std() * np.sqrt(len(net)), win=(net > 0).mean()))
    be = (x["on"] - x["rf"]).mean() / 2 * 1e4
    rows.append(dict(inst=tk, period=label, leg="breakeven_cost_bp_per_side", mean_bp=be))
    return rows


def main():
    rows = []
    yearly = []
    for tk in ["SPY", "QQQ", "IWM", "DIA", "EFA"]:
        x = decompose(tk)
        for label, (lo, hi) in {"full": (x.index[0], TODAY), "IS (<2008)": (x.index[0], SPLIT - pd.Timedelta(days=1)),
                                "OOS (2008-)": (SPLIT, TODAY), "2016-2026": ("2016-01-01", TODAY)}.items():
            rows += stats_block(x.loc[lo:hi], label, tk)
        g = x.groupby(x.index.year)
        for y, gg in g:
            yearly.append(dict(inst=tk, year=y, on=(1 + gg["on"]).prod() - 1, intra=(1 + gg["intra"]).prod() - 1,
                               cc=(1 + gg["cc"]).prod() - 1))
        # registry: per-trade view of the overnight strategy at 1bp/side, OOS
        xo = x.loc[SPLIT:]
        net = (1 + xo["on"]) * (1 - 1e-4) / (1 + 1e-4) - 1 - xo["rf"] * 0
        REG.add("overnight", "buyclose_sellopen", tk, "close->open", "OOS (2008-)",
                dict(n=len(net), per_yr=252, mean_ex=float((net - xo["rf"]).mean()), sd_ex=float(net.std()),
                     sr_trade=float((net - xo["rf"]).mean() / net.std()),
                     t=float((net - xo["rf"]).mean() / net.std() * np.sqrt(len(net)))))
    save(pd.DataFrame(rows), "overnight_summary.csv")
    save(pd.DataFrame(yearly), "overnight_by_year.csv")
    REG.save()
    print(pd.DataFrame(rows).query("leg in ['on','intra','cc'] and period in ['IS (<2008)','OOS (2008-)']")
          [["inst", "period", "leg", "ann_geo", "mean_bp", "sharpe", "t"]].round(4).to_string(index=False))


if __name__ == "__main__":
    main()
