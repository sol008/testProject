"""s03b - Sizing (Kelly with tail stress), portfolio simulation, crisis trades and tax drag for the
defined-risk premium-selling variants simulated in s03 (reads output/s03_trades_all.csv.gz).

Robust Kelly: the historical sample may miss the true worst case, so the per-trade distribution is
augmented with synthetic max-loss trades (R = -1) at a rate of one per `tail_every` trades before
computing Kelly.  Portfolio: each trade risks a fraction f of equity at max loss; the rest earns
T-bills (the collateral is cash).  Reported CAGR is the EXCESS over T-bills.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import optmodel as om
from common14 import OUT, kelly_fraction, log_growth, save

VARIANTS = {
    "PCS20/5% 45d tp21 F5 (prescribed)": dict(struct="PCS", sdelta=0.2, width=0.05, dte=45, rule="tp21", filt="F5"),
    "PCS20/5% 45d tp21 F3 (trend only)": dict(struct="PCS", sdelta=0.2, width=0.05, dte=45, rule="tp21", filt="F3"),
    "PCS20/5% 45d tp21 F0 (no filter)": dict(struct="PCS", sdelta=0.2, width=0.05, dte=45, rule="tp21", filt="F0"),
    "IC20/5% 45d tp21 F5 (prescribed)": dict(struct="IC", sdelta=0.2, width=0.05, dte=45, rule="tp21", filt="F5"),
    "IC20/5% 45d tp21 F3 (trend only)": dict(struct="IC", sdelta=0.2, width=0.05, dte=45, rule="tp21", filt="F3"),
    "IC20/5% 45d tp21 F0 (no filter)": dict(struct="IC", sdelta=0.2, width=0.05, dte=45, rule="tp21", filt="F0"),
    "PCS10/5% 45d hold F0": dict(struct="PCS", sdelta=0.1, width=0.05, dte=45, rule="hold", filt="F0"),
    "IC10/5% 45d hold F6 (best IS Sharpe)": dict(struct="IC", sdelta=0.1, width=0.05, dte=45, rule="hold", filt="F6"),
    "PCS30/2% 30d tp F0 (retail-typical)": dict(struct="PCS", sdelta=0.3, width=0.02, dte=30, rule="tp", filt="F0"),
}
CRISES = [("Oct-2008", "2008-09-01", "2008-11-30"), ("May-2010 flash", "2010-04-15", "2010-06-15"),
          ("Aug-2011", "2011-07-15", "2011-09-30"), ("Aug-2015", "2015-07-20", "2015-09-30"),
          ("Feb-2018", "2018-01-10", "2018-02-28"), ("Q4-2018", "2018-10-01", "2018-12-31"),
          ("Mar-2020", "2020-02-01", "2020-04-15"), ("2022", "2022-01-01", "2022-10-31"),
          ("Aug-2024", "2024-07-10", "2024-08-20"), ("Apr-2025", "2025-03-15", "2025-04-30")]


def select(tr, v, fill=0.25):
    g = tr[(tr.struct == v["struct"]) & np.isclose(tr.sdelta, v["sdelta"]) & np.isclose(tr.width, v["width"]) &
           (tr.dte == v["dte"]) & (tr.rule == v["rule"]) & np.isclose(tr.fill, fill)]
    return g[g[v["filt"]]].sort_values("entry")


def robust_kelly(R, tail_every=100):
    R = np.asarray(R, float)
    k = max(1, int(round(len(R) / tail_every)))
    return kelly_fraction(np.concatenate([R, -np.ones(k)]), fmax=1.0)


def portfolio(g: pd.DataFrame, f: float) -> dict:
    """Sequential compounding on exit dates (overlaps sized off equity at entry). Excess over T-bills."""
    eq = 1.0
    curve = []
    open_pos = []
    events = []
    for _, t in g.iterrows():
        events.append((t.entry, "open", t))
        events.append((t.exit, "close", t))
    events.sort(key=lambda e: (e[0], 0 if e[1] == "close" else 1))
    stake = {}
    for d, kind, t in events:
        key = (t.entry, t.expiry)
        if kind == "open":
            stake[key] = f * eq
        else:
            eq += stake.pop(key) * t.R
            curve.append((d, eq))
    c = pd.Series([e for _, e in curve], index=[d for d, _ in curve])
    c = c[~c.index.duplicated(keep="last")]
    yrs = (g.exit.max() - g.entry.min()).days / 365.25
    cagr = c.iloc[-1] ** (1 / yrs) - 1 if len(c) else np.nan
    dd = (c / c.cummax().clip(lower=1.0) - 1).min() if len(c) else np.nan
    return dict(cagr_excess=cagr, maxdd=dd, final=c.iloc[-1] if len(c) else np.nan)


def main():
    tr = pd.read_csv(OUT / "s03_trades_all.csv.gz", parse_dates=["entry", "expiry", "exit"])
    rows, crisis_rows, sim_rows = [], [], []
    for name, v in VARIANTS.items():
        for per, a, b in [("IS", "1990-01-01", "2007-12-31"), ("OOS", "2008-01-01", "2026-12-31"), ("full", "1990-01-01", "2026-12-31")]:
            g = select(tr, v)
            g = g[(g.entry >= a) & (g.entry <= b)]
            R = g.R.values
            yrs = (min(pd.Timestamp(b), pd.Timestamp("2026-09-25")) - max(pd.Timestamp(a), pd.Timestamp("1990-04-01"))).days / 365.25
            fk = kelly_fraction(R)
            fr50 = robust_kelly(R, 50)
            fr100 = robust_kelly(R, 100)
            fq = fr100 / 4
            rows.append(dict(variant=name, period=per, n=len(R), per_year=len(R) / yrs, win=(R > 0).mean(),
                             mean=R.mean(), median=np.median(R), worst=R.min(), kelly_sample=fk,
                             kelly_tail1per100=fr100, kelly_tail1per50=fr50, quarter_kelly_robust=fq,
                             glog_yr_quarter_robust=log_growth(R, fq) * len(R) / yrs,
                             glog_yr_at_2pct=log_growth(R, 0.02) * len(R) / yrs,
                             glog_yr_at_5pct=log_growth(R, 0.05) * len(R) / yrs,
                             mean_minus_model_bias=R.mean() - (0.012 if v["struct"] == "IC" else 0.006)))
            if per == "full":
                for f in (0.02, 0.05, 0.10, 0.20):
                    p = portfolio(g, f)
                    for pp, a2, b2 in [("IS", "1990-01-01", "2007-12-31"), ("OOS", "2008-01-01", "2026-12-31")]:
                        gg = g[(g.entry >= a2) & (g.entry <= b2)]
                        q = portfolio(gg, f) if len(gg) > 5 else {}
                        sim_rows.append(dict(variant=name, f_at_maxloss=f, period=pp, **q))
                    sim_rows.append(dict(variant=name, f_at_maxloss=f, period="full", **p))
        g = select(tr, v)
        for lab, a, b in CRISES:
            x = g[(g.exit >= a) & (g.entry <= b)]
            crisis_rows.append(dict(variant=name, window=lab, trades=len(x), sum_R=x.R.sum(), worst_R=x.R.min() if len(x) else np.nan,
                                    worst_intratrade_R=x.min_R.min() if len(x) else np.nan))
    res = pd.DataFrame(rows)
    save(res, "s03b_sizing", index=False)
    cr = pd.DataFrame(crisis_rows)
    save(cr, "s03b_crisis_trades", index=False)
    sims = pd.DataFrame(sim_rows)
    save(sims, "s03b_portfolio_sims", index=False)
    with pd.option_context("display.width", 250, "display.max_columns", 30, "display.max_rows", 200):
        print(res.round(4).to_string(index=False))
        print(cr.pivot_table(index="window", columns="variant", values="sum_R").round(2).to_string())
        print(sims.round(4).to_string(index=False))

    # tax drag illustration: per-year pre-tax excess return x (1 - rate)
    tax = []
    for label, st_rate, lt_rate in [("37% bracket (+3.8% NIIT)", 0.408, 0.238), ("24% bracket", 0.24, 0.15)]:
        t1256 = 0.6 * lt_rate + 0.4 * st_rate
        tax.append(dict(bracket=label, short_term_rate=st_rate, section1256_blended=t1256,
                        keep_per_100_short_term=100 * (1 - st_rate), keep_per_100_1256=100 * (1 - t1256)))
    pd.DataFrame(tax).to_csv(OUT / "s03b_tax_rates.csv", index=False)
    print(pd.DataFrame(tax).to_string(index=False))


if __name__ == "__main__":
    main()
