"""s02 - full statistics for the finalist rules, exit-asset variants, and the real-ETF record.

Finalists (weekly Friday-close decision, 2% hysteresis band around the 200-day SMA of the index price;
T-bills when out; traded at the next close in the long simulation):
  S&P 500 at 1x / 1.5x / 2x / 3x, Nasdaq-100 at 2x / 3x, plus buy & hold 1x/3x and a vol-target variant.
Real ETFs, 2016-01 .. 2026-09 (post-publication of Gayed & Bilello 2016): UPRO, SSO, TQQQ, QLD and
SGOV (BIL before SGOV's 2020-06 launch); signals from ^GSPC / ^NDX closes; filled at the Monday OPEN
(the realistic Robinhood fill for an evening email) and, for comparison, at the Monday close.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common as c

FINAL = [  # label, index, L, filt, band, extra
    ("SPY buy & hold (benchmark)", "SPX", 1, "none", 0.0, {}),
    ("S&P 1x 200d-W b2", "SPX", 1, "sma200", 0.02, {}),
    ("S&P 1.5x 200d-W b2", "SPX", 1.5, "sma200", 0.02, {}),
    ("S&P 2x 200d-W b2 (SSO)", "SPX", 2, "sma200", 0.02, {}),
    ("S&P 3x 200d-W b2 (UPRO)", "SPX", 3, "sma200", 0.02, {}),
    ("S&P 3x 200d-W b0", "SPX", 3, "sma200", 0.0, {}),
    ("S&P 3x vol-target 25% (60d) + 200d", "SPX", 3, "sma200", 0.0, dict(voltgt=0.25, vol_n=60)),
    ("S&P 3x buy & hold", "SPX", 3, "none", 0.0, {}),
    ("NDX 1x buy & hold (QQQ-like)", "NDX", 1, "none", 0.0, {}),
    ("NDX 1x 200d-W b2", "NDX", 1, "sma200", 0.02, {}),
    ("NDX 2x 200d-W b2 (QLD)", "NDX", 2, "sma200", 0.02, {}),
    ("NDX 3x 200d-W b2 (TQQQ)", "NDX", 3, "sma200", 0.02, {}),
    ("NDX 3x buy & hold", "NDX", 3, "none", 0.0, {}),
]
PERIODS = {"SPX": [("1929-2026", "1929-01-02", "2026-12-31"), ("IS 1929-1989", "1929-01-02", "1989-12-31"),
                   ("OOS 1990-2026", "1990-01-01", "2026-12-31"), ("2016-2026", "2016-01-01", "2026-12-31")],
           "NDX": [("1986-2026", "1986-10-01", "2026-12-31"), ("IS 1986-2005", "1986-10-01", "2005-12-31"),
                   ("OOS 2006-2026", "2006-01-01", "2026-12-31"), ("2016-2026", "2016-01-01", "2026-12-31")]}


def panel(ix):
    return c.spx_panel() if ix == "SPX" else c.ndx_panel()


def sim(label, ix, L, filt, band, extra, exit_ret=None):
    df = panel(ix)
    tgt = c.exposure_path(df, L, filt, "W", band, **extra)
    return c.run(df, tgt, L, exit_ret=exit_ret)


def finalists():
    rows, roll = [], []
    series = {}
    for lab, ix, L, filt, band, extra in FINAL:
        s = sim(lab, ix, L, filt, band, extra)
        df = panel(ix)
        series[lab] = s
        for pl, a, b in PERIODS[ix]:
            x = s.loc[a:b]
            st = c.full_stats(x, df.spy, df.rf, lab)
            st["period"] = pl
            rows.append(st)
            if pl in ("1929-2026", "1986-2026", "OOS 1990-2026", "OOS 2006-2026"):
                rr = dict(rule=lab, period=pl)
                for y in (5, 10):
                    rr.update(c.rolling_beat(x["ret"], df.spy, y))
                roll.append(rr)
    st = pd.DataFrame(rows)
    st.to_csv(c.OUT / "s02_finalists_stats.csv", index=False, float_format="%.4f")
    ro = pd.DataFrame(roll)
    ro.to_csv(c.OUT / "s02_rolling_vs_spy.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 260, "display.max_columns", 30, "display.max_rows", 100):
        print(st[["rule", "period", "cagr", "spy_cagr", "excess", "vol", "sharpe", "maxdd", "worst_year",
                  "worst_year_when", "dd20_share", "longest_uw_yrs", "orders_per_yr", "time_in"]].round(3).to_string(index=False))
        print(ro.round(3).to_string(index=False))
    # calendar-year table for the main rules (for the whipsaw section and the report)
    spx = c.spx_panel()
    yr = {}
    for lab in ["S&P 1x 200d-W b2", "S&P 2x 200d-W b2 (SSO)", "S&P 3x 200d-W b2 (UPRO)", "S&P 3x buy & hold",
                "NDX 3x 200d-W b2 (TQQQ)"]:
        r = series[lab]["ret"]
        yr[lab] = (1 + r).groupby(r.index.year).prod() - 1
        yr[lab + " switches"] = series[lab]["trade"].groupby(r.index.year).sum()
    yr["SPY"] = (1 + spx.spy).groupby(spx.index.year).prod() - 1
    ydf = pd.DataFrame(yr).loc[1929:]
    ydf.to_csv(c.OUT / "s02_calendar_years.csv", float_format="%.4f")
    return series


def exit_assets():
    """Exit asset: T-bills vs synthetic 10y Treasuries (IEF-like; TLT only real, 2002+) vs gold."""
    spx = c.spx_panel()
    bond = c.bond10_daily(spx.index)
    gold = c.gold_daily(spx.index)
    tlt = c.yf_df("TLT", start="2002-07-01")["Adj Close"].pct_change()
    rows = []
    for L in (2, 3):
        for name, ex, a in [("T-bills", None, "1962-01-02"), ("10y Treasury (IEF-like)", bond, "1962-01-02"),
                            ("gold (monthly pre-2004, GLD after)", gold, "1975-01-02"),
                            ("T-bills", None, "1975-01-02"), ("T-bills", None, "2002-08-01"),
                            ("TLT (real)", tlt, "2002-08-01"), ("10y Treasury (IEF-like)", bond, "2002-08-01"),
                            ("gold (monthly pre-2004, GLD after)", gold, "2002-08-01")]:
            s = sim("x", "SPX", L, "sma200", 0.02, {}, exit_ret=ex)
            for pl, a2, b2 in [(f"{a[:4]}-2026", a, "2026-12-31"), ("2022", "2022-01-01", "2022-12-31")]:
                x = s.loc[a2:b2]
                rows.append(dict(L=L, exit=name, period=pl, cagr=c.cagr_from(x.ret), maxdd=c.maxdd(x.ret)))
    ea = pd.DataFrame(rows).drop_duplicates()
    ea.to_csv(c.OUT / "s02_exit_assets.csv", index=False, float_format="%.4f")
    print(ea.round(3).to_string(index=False))


def real_etfs():
    """Post-publication record on the real funds, 2016-01-04 .. 2026-09-25."""
    spx, ndx = c.spx_panel(), c.ndx_panel()
    def etf(t, start="2009-01-01"):
        d = c.yf_df(t, start=start)
        adj = d["Adj Close"] / d["Close"]
        return pd.DataFrame({"o": d["Open"] * adj, "c": d["Adj Close"]}).dropna()
    bil, sgov = etf("BIL", "2007-06-01"), etf("SGOV", "2020-05-01")
    cash_c = bil["c"].pct_change()
    sg = sgov["c"].pct_change()
    cash_c.loc[sg.index[1]:] = sg.loc[sg.index[1]:]
    spy = etf("SPY", "1993-01-01")
    rows, curves = [], {}
    for lab, fund, und, L, sig_df in [("UPRO 3x S&P", "UPRO", "SPY", 3, spx), ("SSO 2x S&P", "SSO", "SPY", 2, spx),
                                      ("TQQQ 3x NDX", "TQQQ", "QQQ", 3, ndx), ("QLD 2x NDX", "QLD", "QQQ", 2, ndx),
                                      ("SPY 1x S&P", "SPY", "SPY", 1, spx)]:
        f = etf(fund)
        idx = f.index.intersection(sig_df.index).intersection(cash_c.dropna().index)
        idx = idx[idx >= pd.Timestamp("2015-01-02")]
        state = c.trend_state(sig_df, "sma200", "W", 0.02)
        st = pd.Series(state, index=sig_df.index).reindex(idx).ffill().values
        fo, fc = f["o"].reindex(idx).values, f["c"].reindex(idx).values
        cc = cash_c.reindex(idx).fillna(0).values
        n = len(idx)
        for mode in ("open", "close"):
            ret = np.zeros(n)
            held = 0.0     # fraction in fund (0/1)
            trades = 0
            for i in range(1, n):
                want = st[i - 1]                      # decided at close i-1
                r_close = fc[i] / fc[i - 1] - 1
                if want != held:
                    trades += 1
                    if mode == "open":                # overnight on old holding, intraday on new
                        r_on = fo[i] / fc[i - 1] - 1
                        r_in = fc[i] / fo[i] - 1
                        leg1 = held * r_on + (1 - held) * cc[i] * 0.5
                        leg2 = want * r_in + (1 - want) * cc[i] * 0.5
                        ret[i] = (1 + leg1) * (1 + leg2) - 1 - c.TC - 0.0001
                        held = want
                        continue
                    else:                             # trade at the close of day i: day i on old
                        ret[i] = held * r_close + (1 - held) * cc[i] - c.TC - 0.0001
                        held = want
                        continue
                ret[i] = held * r_close + (1 - held) * cc[i]
            r = pd.Series(ret, index=idx).loc["2016-01-01":]
            bh = pd.Series(fc, index=idx).pct_change().loc["2016-01-01":]
            spyr = spy["c"].pct_change().reindex(r.index)
            yrs = c.years(r.index)
            rows.append(dict(fund=lab, fill=mode, cagr=c.cagr_from(r), maxdd=c.maxdd(r),
                             fund_buyhold_cagr=c.cagr_from(bh), fund_buyhold_maxdd=c.maxdd(bh),
                             spy_cagr=c.cagr_from(spyr), excess_vs_spy=c.cagr_from(r) - c.cagr_from(spyr),
                             switches_per_yr=trades * (yrs / c.years(idx)) / yrs if yrs else np.nan))
            if mode == "open":
                curves[lab] = r
    re = pd.DataFrame(rows)
    re.to_csv(c.OUT / "s02_real_etfs_2016_2026.csv", index=False, float_format="%.4f")
    print(re.round(3).to_string(index=False))
    # model vs real, same period and fill convention (next close), for the 3x rules
    s = sim("x", "SPX", 3, "sma200", 0.02, {}).loc["2016-01-01":]
    s2 = sim("x", "NDX", 3, "sma200", 0.02, {}).loc["2016-01-01":]
    print("model (next close) 2016-2026: S&P 3x", round(c.cagr_from(s.ret), 4), " NDX 3x", round(c.cagr_from(s2.ret), 4))
    return curves


def ixic_splice_check():
    """Robustness only: Nasdaq-100 history extended back to 1971 with ^IXIC daily returns.  The early
    Composite has stale small-cap prices (positive autocorrelation), which flatters trend rules, so the
    reported NDX results start in 1985; this shows what the splice would add for 1972-1985."""
    df = c.ndx_panel(splice_ixic=True)
    rows = []
    for L in (1, 2, 3):
        s = c.run(df, c.exposure_path(df, L, "sma200", "W", 0.02), L).loc["1972-01-03":"1985-09-30"]
        rows.append(dict(rule=f"IXIC-spliced {L}x 200d-W b2", cagr=c.cagr_from(s.ret), maxdd=c.maxdd(s.ret),
                         spy=c.cagr_from(df.spy.loc[s.index]), index_1x_bh=c.cagr_from(df.r.loc[s.index]),
                         lag1_autocorr_index=float(df.r.loc[s.index].autocorr(1))))
    t = pd.DataFrame(rows)
    t.to_csv(c.OUT / "s02_ixic_splice_1972_1985.csv", index=False, float_format="%.4f")
    print(t.round(3).to_string(index=False))


if __name__ == "__main__":
    finalists()
    exit_assets()
    real_etfs()
    ixic_splice_check()
