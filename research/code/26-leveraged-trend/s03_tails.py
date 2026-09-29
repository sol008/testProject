"""s03 - tail risk: October 1987, the 1929-32 and 2000-02 paths, whipsaw years, and block-bootstrap
probabilities of -50% / -80% drawdowns within 10 years (historical drift)."""
from __future__ import annotations

import numpy as np
import pandas as pd

import boot
import common as c


def oct_1987():
    df = c.spx_panel()
    m = c.sma(df.px, 200)
    w = df.loc["1987-10-01":"1987-10-23"].copy()
    w["sma200"] = m.loc[w.index]
    w["px_vs_sma"] = w.px / w.sma200 - 1
    rows = []
    for lab, freq, band in [("weekly b2 (recommended)", "W", 0.02), ("weekly b0", "W", 0.0),
                            ("daily b0", "D", 0.0), ("daily b2", "D", 0.02)]:
        st = pd.Series(c.trend_state(df, "sma200", freq, band), index=df.index)
        s = c.run(df, c.exposure_path(df, 3, "sma200", freq, band), 3)
        for d in ["1987-10-09", "1987-10-14", "1987-10-15", "1987-10-16", "1987-10-19", "1987-10-20"]:
            rows.append(dict(rule=lab, date=d, px=df.px.loc[d], sma200=m.loc[d], gap=df.px.loc[d] / m.loc[d] - 1,
                             state_at_close=st.loc[d], exposure_held_that_day=s.E.loc[d], strat_ret=s.ret.loc[d]))
    t = pd.DataFrame(rows)
    t.to_csv(c.OUT / "s03_oct1987.csv", index=False, float_format="%.4f")
    print(t.round(4).to_string(index=False))
    # a 3x fund on 19 Oct 1987 (index TR -20.5%)
    r19 = df.r.loc["1987-10-19"]
    print(f"S&P TR 19-Oct-1987 {r19:.4f}; 2x fund {2 * r19:.3f}; 3x fund {3 * r19:.3f}")


def crash_paths():
    spx, ndx = c.spx_panel(), c.ndx_panel()
    rules = [("S&P 1x b2", spx, 1), ("S&P 2x b2", spx, 2), ("S&P 3x b2", spx, 3), ("NDX 3x b2", ndx, 3)]
    wins = [("1929-09-03 to 1932-06-01", "1929-09-03", "1932-06-01"),
            ("1929-09-03 to 1935-12-31", "1929-09-03", "1935-12-31"),
            ("1937-03-01 to 1942-04-30", "1937-03-01", "1942-04-30"),
            ("1973-01-02 to 1974-12-31", "1973-01-02", "1974-12-31"),
            ("1987-08-25 to 1987-12-31", "1987-08-25", "1987-12-31"),
            ("2000-03-24 to 2002-10-09", "2000-03-24", "2002-10-09"),
            ("2007-10-09 to 2009-03-09", "2007-10-09", "2009-03-09"),
            ("2020-02-19 to 2020-03-23", "2020-02-19", "2020-03-23"),
            ("2022-01-03 to 2022-10-12", "2022-01-03", "2022-10-12"),
            ("2025-02-19 to 2025-04-08", "2025-02-19", "2025-04-08")]
    rows = []
    for w, a, b in wins:
        row = {"window": w, "SPY": float(np.prod(1 + spx.spy.loc[a:b])) - 1}
        for lab, df, L in rules:
            if df.index[0] > pd.Timestamp(a):
                row[lab] = np.nan
                continue
            s = c.run(df, c.exposure_path(df, L, "sma200", "W", 0.02), L).loc[a:b]
            row[lab] = float(np.prod(1 + s.ret)) - 1
            row[lab + " worst DD in window"] = c.maxdd(s.ret)
            row[lab + " switches"] = int(s.trade.sum())
        bh = c.run(spx, np.full(len(spx), 3.0), 3).loc[a:b]
        row["S&P 3x buy&hold"] = float(np.prod(1 + bh.ret)) - 1
        rows.append(row)
    t = pd.DataFrame(rows)
    t.to_csv(c.OUT / "s03_crash_paths.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        print(t.round(3).to_string(index=False))
    # the rule's own worst drawdown spells (peak, trough, recovery)
    out = []
    for lab, df, L in rules:
        s = c.run(df, c.exposure_path(df, L, "sma200", "W", 0.02), L)
        s = s.loc["1929-01-02":] if df is spx else s.loc["1986-10-01":]
        eq = (1 + s.ret).cumprod()
        dd = eq / eq.cummax() - 1
        for _ in range(3):
            tr = dd.idxmin()
            pk = eq.loc[:tr].idxmax()
            rec = eq.loc[tr:][eq.loc[tr:] >= eq.loc[pk]]
            rd = rec.index[0] if len(rec) else None
            out.append(dict(rule=lab, peak=pk.date(), trough=tr.date(), depth=dd.loc[tr],
                            recovered=rd.date() if rd is not None else "not yet",
                            years_to_recover=((rd - pk).days / 365.25) if rd is not None else np.nan))
            end = rd if rd is not None else dd.index[-1]
            dd.loc[pk:end] = 0
    o = pd.DataFrame(out)
    o.to_csv(c.OUT / "s03_worst_drawdowns.csv", index=False, float_format="%.4f")
    print(o.round(3).to_string(index=False))


def bootstrap_hist(n_paths=4000, H=10, seed=26):
    rng = np.random.default_rng(seed)
    rows = []
    spx = c.spx_panel().loc["1928-01-03":]
    ndx = c.ndx_panel()
    for name, df in [("S&P pool 1928-2026", spx), ("NDX pool 1985-2026", ndx)]:
        r_tr = df.r.values
        r_px = df.px.pct_change().fillna(0).values
        spy = df.spy.values
        rf = df.rf.values
        T = c.TD * (H + 1)
        idx = boot.make_paths(len(df), n_paths, T, rng)
        R, RP, B, RF = r_tr[idx], r_px[idx], spy[idx], rf[idx]
        for lab, L, filt in [("1x 200d-W b2", 1, True), ("2x 200d-W b2", 2, True), ("3x 200d-W b2", 3, True),
                             ("3x buy & hold", 3, False), ("1x buy & hold (SPY-like)", 1, False)]:
            ret = boot.run_rule(R, RP, RF, L, filt=filt)
            st = boot.path_stats(ret, B, c.TD)
            rows.append(dict(pool=name, rule=lab, horizon_yrs=H, **boot.summarize(st)))
    t = pd.DataFrame(rows)
    t.to_csv(c.OUT / "s03_bootstrap_hist.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        print(t.round(3).to_string(index=False))


def stress_and_te():
    """Design-§4 stress inputs (worst 10-session loss of a daily-reset 1x/2x/3x S&P fund, 1928-2026),
    the in-sample tracking error vs SPY of the 2x/3x rules, and calendar-year loss counts."""
    df = c.spx_panel()
    rows = []
    for L in (1, 2, 3):
        s = c.run(df, np.full(len(df), float(L)), L).ret.loc["1928-02-01":]
        eq = (1 + s).cumprod()
        w = eq / eq.shift(10) - 1
        row = dict(L=L, worst_10_session=float(w.min()), when=w.idxmin().date(),
                   max_notional_at_2pct_stress=0.02 / abs(float(w.min())))
        if L > 1:
            r = c.run(df, c.exposure_path(df, L, "sma200", "W", 0.02), L)
            x = r.ret.loc["1929-01-02":"1989-12-31"]
            d = np.log1p(x) - np.log1p(df.spy.loc[x.index])
            row.update(rule_te_vs_spy_is=float(d.std() * np.sqrt(c.TD)), rule_log_excess_is=float(d.mean() * c.TD))
            full = r.ret.loc["1929-01-02":]
            yr = (1 + full).groupby(full.index.year).prod() - 1
            row.update(rule_years_le_minus20=int((yr <= -0.20).sum()), rule_share_losing_years=float((yr < 0).mean()),
                       rule_years=len(yr), rule_max_switches_in_a_year=int(r.trade.loc["1929-01-02":].groupby(
                           full.index.year).sum().max()),
                       rule_share_years_no_switch=float((r.trade.loc["1929-01-02":].groupby(full.index.year).sum() == 0).mean()))
        rows.append(row)
    spy = df.spy.loc["1929-01-02":]
    yr = (1 + spy).groupby(spy.index.year).prod() - 1
    t = pd.DataFrame(rows)
    t["spy_share_losing_years"] = float((yr < 0).mean())
    t.to_csv(c.OUT / "s03_stress_te.csv", index=False, float_format="%.4f")
    print(t.round(4).to_string(index=False))


if __name__ == "__main__":
    oct_1987()
    crash_paths()
    bootstrap_hist()
    stress_and_te()
