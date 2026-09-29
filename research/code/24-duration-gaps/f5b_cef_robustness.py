"""Family 5b: is the CEF wide-discount result robust, and is it worth more under a 90/120-day cap than under 60?

Reads f5's full trade list (every signal in every fund, all three variants; kept in the scratchpad).  Checks:
  * overlap-robust inference: signal-month means, Newey-West t with lags = holding months (a 63-84-session hold
    overlaps the next 2-3 signal months);
  * without the two crises that dominate the sample (signals Sep-2008 to Jun-2009 and Feb to Jun 2020);
  * equity-like (NAV volatility > 12%) vs fixed-income-like funds;
  * +0.3% extra round-trip cost (CEF spreads widen in stress);
  * CAPACITY: the design allows one order kind (a), <= 3 orders per email, per-trade stress <= 2% of NAV
    (notional = 2% / the fund's own worst 10-session loss), total open stress <= 10% shared with M1-M4, <= 8
    positions.  So the system can hold one, at most two, CEF positions at a time.  The simulation takes signals
    chronologically into S free slots (widest z first), holds H sessions, and reports trades a year and the
    kappa-shrunk contribution a year: sum over trades of notional x (kappa x edge + forward drift) / years.
    Forward drift: CEF assets at +0.5% a year over bills (between equities' +0.3% and credit's +1%).
Outputs: results/f5b_*.csv
"""
from __future__ import annotations

import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import common24 as C  # noqa: E402

CRISES = [("2008-09-01", "2009-06-30"), ("2020-02-15", "2020-06-30")]
FWD_DRIFT_YR = 0.005


def nw_monthly(tr: pd.DataFrame, col: str, H: int) -> tuple[float, float, int]:
    mm = tr.groupby(tr["signal"].dt.to_period("M"))[col].mean()
    full = mm.reindex(pd.period_range(mm.index.min(), mm.index.max(), freq="M"))
    x = full.dropna().values                 # NW over the months that have signals (gaps ignored)
    return float(mm.mean()), C.nw_t(x, max(1, math.ceil(H / 21))), len(mm)


def in_crisis(d: pd.Series) -> pd.Series:
    m = pd.Series(False, index=d.index)
    for a, b in CRISES:
        m |= (d >= a) & (d <= b)
    return m


def robustness(tr: pd.DataFrame, meta: pd.DataFrame) -> pd.DataFrame:
    rows = []
    eq = set(meta.loc[meta["nav_vol"] > 0.12, "fund"])
    for (v, H, role), g in tr.groupby(["variant", "H", "role"]):
        cases = {"all": g, "ex-crisis": g[~in_crisis(g["signal"])], "equity-like": g[g["fund"].isin(eq)],
                 "fixed-income-like": g[~g["fund"].isin(eq)]}
        for lab, x in cases.items():
            if len(x) < 10:
                continue
            e, t_e, nm = nw_monthly(x, "edge", H)
            p, t_p, _ = nw_monthly(x, "disc_change", H)
            rows.append(dict(variant=v, H=H, role=role, case=lab, n=len(x), n_months=nm, edge=e, nw_t_edge=t_e,
                             disc_change=p, nw_t_disc=t_p, edge_cost_plus30bp=e - 0.003,
                             excess=x["excess"].mean(), win=(x["net"] > 0).mean(), worst=x["net"].min()))
    return pd.DataFrame(rows)


def capacity(tr: pd.DataFrame, meta: pd.DataFrame, variant: str) -> pd.DataFrame:
    w10 = meta.set_index("fund")["worst10"]
    rows = []
    for H in (21,) + C.HOLDS:
        for role, a, b in (("design", "1999-01-01", "2007-12-31"), ("test", "2008-01-01", "2026-09-28")):
            g = tr[(tr["variant"] == variant) & (tr["H"] == H) & (tr["role"] == role)].copy()
            g = g.sort_values(["signal", "z_entry"])
            yrs = C.years(max(pd.Timestamp(a), g["signal"].min()) if len(g) else a, b)
            for S in (1, 2):
                busy_until = [pd.Timestamp("1900-01-01")] * S
                took = []
                for r in g.itertuples(index=False):
                    free = [k for k in range(S) if busy_until[k] < r.entry]
                    if not free:
                        continue
                    busy_until[free[0]] = r.exit
                    took.append(r)
                if not took:
                    continue
                T = pd.DataFrame([t._asdict() for t in took])
                T["notional"] = [min(0.10, C.STRESS_CAP / abs(w10.get(f, -0.4))) for f in T["fund"]]
                drift = FWD_DRIFT_YR * H / 252
                contrib_c = float((T["notional"] * (C.KAPPA * T["edge"] + drift)).sum() / yrs)
                contrib_hist = float((T["notional"] * T["excess"]).sum() / yrs)
                dg = [C.dg_bp(n, C.KAPPA * e + drift, T["net"].std(ddof=1)) for n, e in zip(T["notional"], T["edge"])]
                rows.append(dict(variant=variant, H=H, cap=[k for k, v in C.CAPS.items() if v == H][0] if H in C.HOLDS else 30,
                                 role=role, slots=S, trades=len(T), per_yr=len(T) / yrs, notional=T["notional"].mean(),
                                 edge=T["edge"].mean(), excess=T["excess"].mean(), worst=T["net"].min(),
                                 contrib_kappa=contrib_c, contrib_hist=contrib_hist,
                                 dg_bp_mean=float(np.mean(dg)), share_trades_in_crises=float(in_crisis(T["signal"]).mean())))
    return pd.DataFrame(rows)


def main():
    tr = pd.read_csv(C.SCRATCH / "f5_cef_trades_all.csv.gz", parse_dates=["signal", "entry", "exit"])  # written by f5
    meta = pd.read_csv(C.RESULTS / "f5_cef_panel.csv")
    rb = robustness(tr, meta)
    C.save(rb, "f5b_cef_robustness")
    cap = pd.concat([capacity(tr, meta, v) for v in tr["variant"].unique()], ignore_index=True)
    C.save(cap, "f5b_cef_capacity")
    with pd.option_context("display.width", 250, "display.max_rows", 300):
        print(rb[rb.variant == "z-2 w756"].round(4).to_string(index=False))
        print(cap.round(5).to_string(index=False))


if __name__ == "__main__":
    main()
