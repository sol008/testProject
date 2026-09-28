"""Uniform scorecard across all setups tested in track 16 (out-of-sample / recent period).

For each setup: events per year, holding period, win rate, average win / loss, mean and median
per-trade return after costs, t-stat, worst trade, capacity (1% of the median 20-day dollar
volume of the event stocks - the constitution's liquidity gate), crash behaviour (correlation of
the raw trade return with the benchmark over the same window; mean excess return when the
benchmark fell > 10%), and the quarter-Kelly size on the shrunk (kappa = 0.5) per-trade excess
distribution with its expected log-growth contribution per year at min(events/yr, 12) trades.
Output: output/scorecard.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT, SCRATCH, kelly_growth


def row(name, per, net, raw=None, bench=None, dvol=None, hold=None, years=None, note=""):
    net = pd.Series(np.asarray(net, dtype=float))
    ok = net.notna().values
    x = net[ok]
    n = len(x)
    rec = {"setup": name, "period": per, "n": n, "per_yr": round(n / years, 1) if years else None, "hold_sessions": hold}
    if n == 0:
        return rec
    rec.update({"win_%": round(100 * (x > 0).mean(), 1), "avg_win_%": round(100 * x[x > 0].mean(), 2) if (x > 0).any() else None,
                "avg_loss_%": round(100 * x[x <= 0].mean(), 2) if (x <= 0).any() else None,
                "mean_%": round(100 * x.mean(), 2), "median_%": round(100 * x.median(), 2),
                "t": round(x.mean() / x.std() * np.sqrt(n), 2) if n > 2 and x.std() > 0 else None,
                "worst_%": round(100 * x.min(), 1), "p5_%": round(100 * x.quantile(0.05), 1)})
    if dvol is not None:
        dv = pd.Series(np.asarray(dvol, dtype=float))[ok].dropna()
        rec["capacity_1%ADV_$k"] = round(float(dv.median()) * 0.01 / 1000, 0) if len(dv) else None
    if raw is not None and bench is not None:
        rr = pd.Series(np.asarray(raw, dtype=float))[ok].reset_index(drop=True)
        bb = pd.Series(np.asarray(bench, dtype=float))[ok].reset_index(drop=True)
        m = rr.notna() & bb.notna()
        if m.sum() > 10:
            rec["corr_with_bench"] = round(float(np.corrcoef(rr[m], bb[m])[0, 1]), 2)
            bad = m & (bb < -0.10)
            rec["n_bench<-10%"] = int(bad.sum())
            rec["excess_when_bench<-10%_%"] = round(100 * float((rr[bad] - bb[bad]).mean()), 1) if bad.sum() else None
    kg = kelly_growth(x.values, kappa=0.5, k=0.25, cap=0.05)
    rec["qK_size_%"] = round(100 * kg["f_used"], 2) if np.isfinite(kg["f_used"]) else None
    ntr = min(rec["per_yr"] or 0, 12)
    rec["dg_%/yr_at_min(n,12)"] = round(100 * ntr * kg["g_per_trade"], 3) if np.isfinite(kg["g_per_trade"]) else None
    rec["note"] = note
    return rec


def main():
    rows = []
    # 1 insider clusters (W30,K2), follower close entry, 20 sessions, OOS
    ins = pd.read_pickle(SCRATCH / "insider_returns.pkl")
    from common import COST_RT, cap_bucket
    ins["cost_rt"] = ins["mcap"].apply(cap_bucket).map(COST_RT)
    ins = ins[(ins["W"] == 30) & (ins["K"] == 2) & (ins["raw_px"] >= 2) & (ins["dvol20"] >= 1e5)]
    for per, g, yrs in [("2016-26", ins[ins["event_date"] >= "2016-01-01"], 10.5), ("2009-15", ins[(ins["event_date"] >= "2009-01-01") & (ins["event_date"] < "2016-01-01")], 7)]:
        rows.append(row("Insider cluster buys (>=2 insiders/30d), follow 20d", per, g["x20"] - g["cost_rt"], g["r20"], g["b20"], g["dvol20"], 20, yrs))
        rows.append(row("Insider cluster buys, follow 60d", per, g["x60"] - g["cost_rt"], g["r60"], g["b60"], g["dvol20"], 60, yrs))
    # 2 activist 13D (known activists) follower
    a = pd.read_pickle(SCRATCH / "activist_events.pkl")
    big = a["mcap"] >= 2e9
    a["b20"] = np.where(big, a["f20_SPY"], a["f20_IWM"])
    for per, g, yrs in [("2016-26", a[(a["period"] == "2016-26 (OOS)") & (a["cls"] == "known_activist")], 10.7),
                        ("2011-15", a[(a["period"] == "2011-15 (IS)") & (a["cls"] == "known_activist")], 5)]:
        rows.append(row("Activist 13D (known activists), follow 20d", per, g["x_f20"] - g["cost_rt"], g["f20"], g["b20"], g["dvol20"], 20, yrs,
                        "announcement window +2.6-4.4% not capturable"))
    # 3 buybacks standalone
    b = pd.read_pickle(SCRATCH / "buyback_events.pkl")
    b["b20"] = np.where(b["mcap"] >= 2e9, b["f20_SPY"], b["f20_IWM"])
    g = b[(b["period"] == "2016-26 (OOS)") & (b["group"] == "standalone")]
    rows.append(row("Buyback 8-K (standalone), follow 20d", "2016-26", g["x_f20"] - g["cost_rt"], g["f20"], g["b20"], g["dvol20"], 20, 10.7))
    # 4 S&P 500 additions
    sp = pd.read_csv(OUT / "sp500_changes_events.csv", parse_dates=["E"])
    g = sp[(sp["type"] == "add") & (sp["E"] >= "2016-01-01")]
    rows.append(row("S&P 500 addition, buy E-5 sell E-1", "2016-26", g["follow_5"] - 0.001, None, None, None, 4, 10.7))
    # 5 special dividends
    sd = pd.read_csv(OUT / "special_div_events.csv", parse_dates=["D"])
    for per, gg, yrs in [("2016-26", sd[sd["D"] >= "2016-01-01"], 10.7), ("2011-15", sd[sd["D"] < "2016-01-01"], 5)]:
        rows.append(row("Special dividend, buy D+1 sell ex-1", per, gg["follow"] - gg["cost_rt"], gg["follow_raw"], gg["follow_raw"] - gg["follow"], None, 9, yrs))
    from evstudy import px as _px
    dvl = []
    for t_, d_ in zip(sd["ticker"], sd["D"]):
        q = _px(t_)
        q = q[q.index < d_].tail(20) if q is not None else None
        dvl.append(float((q["Close"] * q["Volume"]).median()) if q is not None and len(q) else np.nan)
    sd["dvol20"] = dvl
    gg = sd[(sd["D"] >= "2016-01-01") & (sd["dvol20"] >= 1e6)]
    rows.append(row("Special dividend (ADV >= $1m), buy D+1 sell ex-1", "2016-26", gg["follow"] - gg["cost_rt"], gg["follow_raw"], gg["follow_raw"] - gg["follow"], gg["dvol20"], 9, 10.7))
    gg = sd[(sd["D"] < "2016-01-01") & (sd["dvol20"] >= 1e6)]
    rows.append(row("Special dividend (ADV >= $1m), buy D+1 sell ex-1", "2011-15", gg["follow"] - gg["cost_rt"], gg["follow_raw"], gg["follow_raw"] - gg["follow"], gg["dvol20"], 9, 5))
    # 6 spin-offs
    s = pd.read_pickle(SCRATCH / "spinoff_events.pkl")
    g = s[s["period"] == "2016-26"]
    rows.append(row("Spin-off: buy day 1, hold 20", "2016-26", g["x_d1_20"] - g["cost_rt"], g["d1_20"], g["d1_20_IWM"], None, 20, 10.7))
    rows.append(row("Spin-off: buy day 20, hold 40", "2016-26", g["x_d20_60"] - g["cost_rt"], g["d20_60"], g["d20_60_IWM"], None, 40, 10.7))
    # 7 IPO lockups (short)
    lk = pd.read_pickle(SCRATCH / "lockup_events.pkl")
    g = lk[lk["period"].str.startswith("OOS")]
    rows.append(row("IPO lock-up: short L-6 to L+1", "2016-26", -g["x_short"] - g["cost_rt"] - 0.01, -g["short"], -g["short_IWM"], g["dvol20"], 7, 10.5,
                    "short; 1% borrow assumed"))
    # 8 issuer tenders (Dutch/fixed) round-lot follower
    te = pd.read_pickle(SCRATCH / "tender_events.pkl")
    rows.append(row("Issuer tender (Dutch/fixed), follow 20d", "2012-26", te["x_f20"] - te["cost_rt"], te["f20"], te["f20_IWM"], te["dvol20"], 20, 14.6))
    # 9 FDA decision run-up (track 05 file)
    bio = pd.read_csv(OUT.parent.parent / "05-special-situations" / "output" / "biotech_events.csv")
    cost = np.where(bio["prior_vol"] > 0.6, 0.02, 0.003)
    rows.append(row("FDA decision: run-up t-30 to t-1", "2020-26", bio["pre_-30_-1"] - cost, None, None, None, 29, 6.7, "selective sample, XBI-adjusted"))
    rows.append(row("FDA decision: hold through (t-1 to t+2)", "2020-26", bio["event_-1_+2"] - cost, None, None, None, 3, 6.7, "binary"))
    # 10 earnings (survivor universe, liquid: price>=$5, $1m/day), OOS 2016-26, >= $300m caps
    eu_p = SCRATCH / "earn_universe.pkl"
    if eu_p.exists():
        eu = pd.read_pickle(eu_p)
        eu = eu[(eu["anchor"] >= "2016-01-01") & (eu["mcap"] >= 3e8)]
        bpost20 = np.where(eu["mcap"] >= 2e9, eu["post20_SPY"], eu["post20_IWM"])
        eu = eu.assign(b_post20=bpost20)
        g = eu[eu["ear_dec"] == 10]
        rows.append(row("PEAD (announcement-return top decile), long 20d", "2016-26", g["x_post20"] - g["cost_rt"], g["post20"], g["b_post20"], g["dvol20"], 20, 10.7))
        g = eu[eu["sue_dec"] == 10]
        rows.append(row("PEAD (SUE top decile), long 20d", "2016-26", g["x_post20"] - g["cost_rt"], g["post20"], g["b_post20"], g["dvol20"], 20, 10.7))
        g = eu[eu["gapR"] < -0.05]
        b5 = np.where(g["mcap"] >= 2e9, g["post5_SPY"], g["post5_IWM"])
        rows.append(row("Earnings gap-down >5%, buy the fade 5d", "2016-26", g["x_post5"] - g["cost_rt"], g["post5"], b5, g["dvol20"], 5, 10.7))
        g = eu[eu["mcap"] >= 2e9]
        bp = g["pre10_SPY"]
        rows.append(row("Pre-earnings run-up (>= $2bn), D-11 to D-1", "2016-26", g["x_pre10"] - g["cost_rt"], g["pre10"], bp, g["dvol20"], 10, 10.7))
    # 11 short squeeze (FINRA SI >= 20% + catalyst day), 2018-26
    sq_p = SCRATCH / "squeeze_events.pkl"
    if sq_p.exists():
        sq = pd.read_pickle(sq_p)
        g = sq[sq["grp"] == "squeeze >=20%"]
        rows.append(row("Short squeeze: SI>=20% + catalyst day, long 20d", "2018-26", g["x_f20"] - g["cost_rt"], g["f20"], g["f20_IWM"], g["dvol20"], 20, 8.7))
        g = sq[sq["grp"] == "low_si <5%"]
        rows.append(row("Control: same catalyst, SI<5%, long 20d", "2018-26", g["x_f20"] - g["cost_rt"], g["f20"], g["f20_IWM"], g["dvol20"], 20, 8.7))
    # 12 merger-arb proxy (MNA ETF), rolling 20-session windows (overlapping), excess over bills
    from common import load_prices, tr_index
    pxm = load_prices(["MNA", "SPY", "^IRX"], verbose=False, download=False)
    s_ = tr_index(pxm["MNA"]).dropna()
    r20 = (s_.shift(-20) / s_ - 1).dropna()
    rf = (pxm["^IRX"]["Close"] / 100).reindex(r20.index).ffill() * 20 / 252
    spy_ = tr_index(pxm["SPY"])
    b20 = (spy_.shift(-20) / spy_ - 1).reindex(r20.index)
    step = r20.iloc[::20]
    rows.append(row("Merger-arb proxy (MNA ETF), 20-session blocks, excess of bills", "2009-26", (step - rf.reindex(step.index)).values - 0.0005,
                    step.values, b20.reindex(step.index).values, None, 20, 16.9, "diversified proxy; single near-close deals not testable"))
    out = pd.DataFrame(rows)
    # append earnings / squeeze if present
    for f in ["earnings_scorecard_rows.csv", "short_squeeze_scorecard_rows.csv"]:
        p = OUT / f
        if p.exists():
            out = pd.concat([out, pd.read_csv(p)], ignore_index=True)
    out.to_csv(OUT / "scorecard.csv", index=False)
    pd.set_option("display.width", 300)
    pd.set_option("display.max_columns", 30)
    print(out.drop(columns=["note"]).to_string())


if __name__ == "__main__":
    main()
