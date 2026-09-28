"""s01 - CBOE option-strategy benchmark indices built from REAL SPX option prices.

Indices (CBOE methodology documents were read on 2026-09-28):
  PUT   sell 1-month ATM SPX put monthly, fully cash-secured (T-bills = strike); VWAP fill 11:30-12:00
        (CBOE CSV daily from 2007; spliced with Yahoo ^PUT 1996-08..2006, which matches on the overlap)
  PUTY  same, 2% OTM put
  WPUT  sell 1-WEEK ATM SPX put every Friday, fully cash-secured; sells at BID, buys back PM-settled at ASK
  PUTD  Cboe Validus S&P 500 Dynamic PutWrite (IV-dependent strikes, 5 staggered rolls/month; backfilled to 2006)
  BXM   long S&P 500 + short 1-month ATM call ; BXMD 30-delta call ; BXY 2% OTM call
  CNDR  iron condor: short 20-delta put+call, long 5-delta put+call, monthly, T-bills = 10x max loss
  BFLY  iron butterfly: short ATM put+call, long 5% OTM put+call, monthly, T-bills = 10x max loss
  CLL   long S&P + long 5% OTM put + short 10% OTM call (95-110 collar)
  PPUT  long S&P + long 1-month 5% OTM put
  PUTR  Russell 2000 monthly ATM put-write
  VPD   short front VIX futures sized to keep 75% of value if VIX futures +25 pts ; VPN capped version
Benchmarks: S&P 500 total return (^SP500TR from 1988; before 1988 SPX price + 3.2%/yr dividend proxy),
3m T-bills (FRED DTB3).  Mid-quote/VWAP fills: these indices do NOT include retail commissions or
the full bid-ask spread (except WPUT, which sells at the bid).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common14 import OUT, cagr, cboe, dense, max_dd, put_index, save, tbill_daily, yf_close

INDICES = ["PUT", "PUTY", "WPUT", "PUTD", "BXM", "BXMD", "BXY", "CNDR", "BFLY", "CLL", "PPUT",
           "PUTR", "VPD", "VPN"]

CRISES = [
    ("Oct-1987 crash (Oct 1-Oct 30)", "1987-09-30", "1987-10-30"),
    ("1987 peak->trough (Aug 25-Dec 4)", "1987-08-25", "1987-12-04"),
    ("Aug-1998 LTCM (Jul 17-Oct 8)", "1998-07-17", "1998-10-08"),
    ("Sep-Nov 2008", "2008-08-29", "2008-11-20"),
    ("GFC peak->trough (2007-10-09..2009-03-09)", "2007-10-09", "2009-03-09"),
    ("Aug-2011 downgrade (Jul 22-Oct 3)", "2011-07-22", "2011-10-03"),
    ("Aug-2015 flash (Aug 17-Aug 25)", "2015-08-17", "2015-08-25"),
    ("Feb-2018 Volmageddon (Jan 26-Feb 8)", "2018-01-26", "2018-02-08"),
    ("Q4-2018 (Sep 20-Dec 24)", "2018-09-20", "2018-12-24"),
    ("COVID (2020-02-19..03-23)", "2020-02-19", "2020-03-23"),
    ("2022 bear (01-03..10-12)", "2022-01-03", "2022-10-12"),
    ("Aug-2024 yen-carry (Jul 16-Aug 5)", "2024-07-16", "2024-08-05"),
    ("Apr-2025 tariff (02-19..04-08)", "2025-02-19", "2025-04-08"),
]


def spx_tr() -> pd.Series:
    """S&P 500 total return: ^SP500TR from 1988, spliced backwards with SPX price + 3.2%/yr."""
    tr = yf_close("^SP500TR")
    px = cboe("SPX")
    early = px.loc[:tr.index[0]]
    div = (1 + 0.032) ** (1 / 252) - 1
    r = early.pct_change().fillna(0) + div
    lvl = (1 + r).cumprod()
    lvl = lvl / lvl.iloc[-1] * tr.iloc[0]
    return pd.concat([lvl.iloc[:-1], tr]).rename("SPXTR")


def stats(level: pd.Series, rf: pd.Series, bench: pd.Series | None = None) -> dict:
    level = level.dropna()
    d = level.pct_change().dropna()
    m = level.resample("ME").last().pct_change().dropna()
    rfm = ((1 + rf.reindex(level.index).ffill().fillna(0.03)) ** (1 / 12) - 1).resample("ME").last().reindex(m.index)
    ex = m - rfm
    out = dict(start=level.index[0].date(), end=level.index[-1].date(), years=(level.index[-1] - level.index[0]).days / 365.25,
               cagr=cagr(level), vol=m.std() * np.sqrt(12), sharpe=ex.mean() / ex.std() * np.sqrt(12),
               maxdd=max_dd(level), worst_month=m.min(), worst_month_date=m.idxmin().strftime("%Y-%m"),
               worst_day=d.min(), worst_day_date=d.idxmin().date(), best_month=m.max(),
               skew_m=m.skew(), kurt_m=m.kurt(), pos_months=(m > 0).mean())
    dd = level / level.cummax() - 1
    trough = dd.idxmin()
    peak = level.loc[:trough].idxmax()
    rec = level.loc[trough:]
    rec = rec[rec >= level.loc[peak]]
    out["dd_peak"] = peak.date()
    out["dd_trough"] = trough.date()
    out["recovery_months"] = ((rec.index[0] - peak).days / 30.44) if len(rec) else np.nan
    if bench is not None:
        b = bench.reindex(level.index).ffill()
        bm = b.resample("ME").last().pct_change().reindex(m.index)
        out["beta_m"] = np.cov(m, bm)[0, 1] / bm.var()
        out["corr_m"] = np.corrcoef(m, bm)[0, 1]
        out["bench_cagr"] = cagr(b)
        exb = bm - rfm
        out["bench_sharpe"] = exb.mean() / exb.std() * np.sqrt(12)
        out["bench_maxdd"] = max_dd(b)
        out["bench_worst_month"] = bm.min()
        # CAPM alpha of monthly excess returns on the benchmark's excess return (HAC t-stat)
        import statsmodels.api as sm
        X = sm.add_constant(exb.values)
        fit = sm.OLS(ex.values, X).fit(cov_type="HAC", cov_kwds={"maxlags": 6})
        out["alpha_ann"] = fit.params[0] * 12
        out["alpha_t"] = fit.tvalues[0]
        # down-capture in the worst 5% of benchmark months
        worst = bm <= bm.quantile(0.05)
        out["mean_in_worst5pct_bench_months"] = m[worst].mean()
        out["bench_mean_in_worst5pct"] = bm[worst].mean()
    return out


def main():
    rf = tbill_daily()
    bench = spx_tr()
    lv = {s: (put_index() if s == "PUT" else dense(cboe(s))) for s in INDICES}

    rows = []
    for s, x in lv.items():
        for per, a, b in [("full", None, None), ("IS <=2007", None, "2007-12-31"),
                          ("OOS 2008+", "2008-01-01", None), ("post-2010", "2010-01-01", None)]:
            y = x.loc[a:b] if (a or b) else x
            if len(y) < 250:
                continue
            st = stats(y, rf, bench)
            st.update(index=s, period=per)
            rows.append(st)
    # benchmark rows over the same windows
    for per, a, b in [("full-1986", "1986-06-20", None), ("IS <=2007", "1986-06-20", "2007-12-31"),
                      ("OOS 2008+", "2008-01-01", None), ("post-2010", "2010-01-01", None)]:
        st = stats(bench.loc[a:b], rf, bench)
        st.update(index="SPXTR", period=per)
        rows.append(st)
    res = pd.DataFrame(rows)
    cols = ["index", "period", "start", "end", "years", "cagr", "bench_cagr", "vol", "sharpe", "bench_sharpe",
            "maxdd", "bench_maxdd", "worst_month", "worst_month_date", "bench_worst_month", "worst_day",
            "worst_day_date", "skew_m", "kurt_m", "pos_months", "beta_m", "corr_m", "alpha_ann", "alpha_t",
            "mean_in_worst5pct_bench_months", "bench_mean_in_worst5pct", "dd_peak", "dd_trough", "recovery_months"]
    res = res[cols]
    save(res, "cboe_index_stats", index=False)

    # crisis windows (index level change, start close -> end close)
    crow = []
    allser = dict(lv)
    allser["SPXTR"] = bench
    for lab, a, b in CRISES:
        row = {"window": lab}
        for s, x in allser.items():
            x0 = x.loc[:a]
            x1 = x.loc[:b]
            if len(x0) == 0 or x0.index[-1] < pd.Timestamp(a) - pd.Timedelta(days=6) or x.index[0] > pd.Timestamp(a):
                row[s] = np.nan
                continue
            row[s] = x1.iloc[-1] / x0.iloc[-1] - 1
        crow.append(row)
    cr = pd.DataFrame(crow).set_index("window")
    save(cr, "cboe_index_crises")

    # calendar-year returns
    yr = pd.concat({s: x.resample("YE").last() for s, x in allser.items()}, axis=1).pct_change()
    yr.index = yr.index.year
    save(yr, "cboe_index_calendar_years")

    # worst single days for the premium sellers
    wd = {}
    for s in ["PUT", "WPUT", "CNDR", "BFLY", "PUTY", "VPD", "SPXTR"]:
        d = allser[s].pct_change().dropna()
        wd[s] = d.nsmallest(5).rename(lambda t: t.date()).round(4).to_dict()
    pd.DataFrame({k: pd.Series(list(v.items())) for k, v in wd.items()}).to_csv(OUT / "cboe_worst_days.csv")

    with pd.option_context("display.width", 250, "display.max_columns", 40, "display.max_rows", 200):
        show = res[["index", "period", "start", "cagr", "bench_cagr", "vol", "sharpe", "bench_sharpe", "maxdd",
                    "bench_maxdd", "worst_month", "worst_month_date", "worst_day", "skew_m", "beta_m", "alpha_ann", "alpha_t", "recovery_months"]]
        print(show.round(3).to_string(index=False))
        print(cr.round(3).to_string())
        print(pd.DataFrame(wd).to_string())


if __name__ == "__main__":
    main()
