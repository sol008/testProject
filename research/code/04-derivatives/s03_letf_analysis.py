"""Leveraged ETFs: realised history (TQQQ, UPRO, SSO, QLD, SPXL, inverse) and a
1928-2026 daily-reset simulation of 2x/3x S&P 500 (plus 1985-2026 3x Nasdaq-100),
including financing and fees, the volatility-drag decomposition, and the
Gayed & Bilello (2016) 200-day-moving-average "Leverage for the Long Run" rule
with a genuine post-publication (2016-2026) out-of-sample check.

Simulation assumptions (documented, adjustable):
  * index total return = ^GSPC price return + dividend yield/252
    (Shiller D/P monthly before 1988, ^SP500TR-implied after)
  * short rate = 3m T-bill (NBER M1329A 1920-34, TB3MS 1934-54, DTB3 daily after)
  * L-times fund daily return = L*r_TR - (L-1)*(rf + spread)/252 - ER/252
    spread = 0.40%/yr on borrowed notional (swap financing), ER = 0.90%/yr
  * 200-DMA rule: signal on close t-1, trade at close t, 0.05% cost per switch
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import DATA_DIR, OUT, cagr, fred, max_drawdown, yf_close

SPREAD, ER = 0.004, 0.009


def short_rate_daily(idx):
    old = fred("M1329AUSM193NNBR") / 100
    tb3ms = fred("TB3MS") / 100
    dtb3 = fred("DTB3") / 100
    m = pd.concat([old.loc[:"1933-12-31"], tb3ms.loc["1934-01-01":"1953-12-31"]])
    s = pd.concat([m, dtb3.loc["1954-01-01":]]).sort_index()
    s = s[~s.index.duplicated()]
    return s.reindex(idx.union(s.index)).ffill().reindex(idx).bfill()


def shiller_divyield():
    x = pd.read_excel(DATA_DIR / "shiller_ie_data.xls", sheet_name="Data", header=7)
    x = x[["Date", "P", "D"]].dropna()
    x = x[pd.to_numeric(x.Date, errors="coerce").notna()]
    yr = x.Date.astype(float).astype(int)
    mo = ((x.Date.astype(float) - yr) * 100).round().astype(int)
    idx = pd.to_datetime(dict(year=yr, month=mo, day=1))
    return pd.Series((x.D.astype(float) / x.P.astype(float)).values, index=idx).sort_index()


def index_tr_daily():
    spx = yf_close("^GSPC")
    r = spx.pct_change()
    tr = yf_close("^SP500TR", start="1988-01-01")
    dy_sh = shiller_divyield().reindex(spx.index.union(shiller_divyield().index)).ffill().reindex(spx.index)
    rtr = r + dy_sh / 252.0
    rtr_modern = tr.pct_change()
    rtr.loc[rtr_modern.index[1]:] = rtr_modern.reindex(rtr.loc[rtr_modern.index[1]:].index)
    return spx, rtr.dropna()


def simulate(r_tr: pd.Series, rf: pd.Series, L: float, spread=SPREAD, er=ER):
    fund = L * r_tr - (L - 1) * (rf + spread) / 252.0 - er / 252.0
    return fund.clip(lower=-1.0)


def stats(ret: pd.Series, label: str):
    eq = (1 + ret).cumprod()
    years = (ret.index[-1] - ret.index[0]).days / 365.25
    return dict(series=label, start=ret.index[0].date(), end=ret.index[-1].date(),
                cagr=eq.iloc[-1] ** (1 / years) - 1 if eq.iloc[-1] > 0 else -1.0,
                vol=ret.std() * np.sqrt(252), maxdd=max_drawdown(eq), worst_day=ret.min(),
                final_multiple=eq.iloc[-1])


def actual_letfs():
    pairs = [("TQQQ", "QQQ", 3), ("QLD", "QQQ", 2), ("SQQQ", "QQQ", -3), ("UPRO", "SPY", 3), ("SPXL", "SPY", 3),
             ("SSO", "SPY", 2), ("SDS", "SPY", -2), ("SPXU", "SPY", -3)]
    rows, roll = [], []
    for letf, und, L in pairs:
        a = yf_close(letf, field="Adj Close", start="2006-01-01")
        u = yf_close(und, field="Adj Close", start="1993-01-01")
        df = pd.concat([a.rename("a"), u.rename("u")], axis=1).dropna()
        ra, ru = df.a.pct_change().dropna(), df.u.pct_change().dropna()
        # daily tracking
        beta = np.cov(ra, ru)[0, 1] / ru.var()
        daily_gap = (ra - L * ru).mean() * 252
        eq_a, eq_u = (1 + ra).cumprod(), (1 + ru).cumprod()
        yrs = (ra.index[-1] - ra.index[0]).days / 365.25
        sig2 = ru.var() * 252
        rows.append(dict(letf=letf, underlying=und, L=L, start=ra.index[0].date(), end=ra.index[-1].date(),
                         letf_cagr=eq_a.iloc[-1] ** (1 / yrs) - 1, und_cagr=eq_u.iloc[-1] ** (1 / yrs) - 1,
                         letf_total=eq_a.iloc[-1] - 1, und_total=eq_u.iloc[-1] - 1,
                         L_x_und_total=L * (eq_u.iloc[-1] - 1),
                         letf_maxdd=max_drawdown(eq_a), und_maxdd=max_drawdown(eq_u),
                         daily_beta=beta, daily_gap_vs_Lx_ann=daily_gap,
                         und_vol=np.sqrt(sig2), theory_vol_drag_ann=-(L * L - L) / 2 * sig2,
                         realized_log_gap_ann=(np.log(eq_a.iloc[-1]) - L * np.log(eq_u.iloc[-1])) / yrs))
        for w, lab in [(21, "1m"), (63, "3m"), (252, "1y"), (756, "3y")]:
            ga = df.a / df.a.shift(w) - 1
            gu = df.u / df.u.shift(w) - 1
            d = (ga - L * gu).dropna()
            roll.append(dict(letf=letf, window=lab, n=len(d), p_letf_beats_L_x_und=(d > 0).mean(),
                             median_gap=d.median(), p10_gap=d.quantile(0.1), p90_gap=d.quantile(0.9),
                             p_letf_below_und=((ga - gu).dropna() < 0).mean() if L > 0 else np.nan,
                             p_letf_loss=(ga.dropna() < 0).mean()))
    return pd.DataFrame(rows), pd.DataFrame(roll)


def ma_rule(price: pd.Series, r_lev: pd.Series, rf: pd.Series, n=200, cost=0.0005):
    ma = price.rolling(n).mean()
    sig = (price > ma).shift(1).reindex(r_lev.index).fillna(False).astype(bool)   # yesterday's close
    switches = sig.astype(int).diff().abs().fillna(0)
    ret = np.where(sig, r_lev, rf.reindex(r_lev.index) / 252.0) - switches * cost
    return pd.Series(ret, index=r_lev.index), switches


def main():
    # ------------- actual LETF history -------------
    act, roll = actual_letfs()
    act.to_csv(OUT / "letf_actual_summary.csv", index=False, float_format="%.4f")
    roll.to_csv(OUT / "letf_actual_rolling.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        print(act.round(3).to_string(index=False))
        print(roll.round(3).to_string(index=False))

    # ------------- long-run simulation -------------
    spx, rtr = index_tr_daily()
    rf = short_rate_daily(rtr.index)
    sims = {"1x TR (no fee)": rtr}
    for L in (2, 3):
        sims[f"{L}x daily-reset"] = simulate(rtr, rf, L)
    # validate against actual UPRO / SSO
    upro = yf_close("UPRO", field="Adj Close").pct_change().dropna()
    sso = yf_close("SSO", field="Adj Close").pct_change().dropna()
    val = []
    for name, act_r, L in [("UPRO", upro, 3), ("SSO", sso, 2)]:
        s = sims[f"{L}x daily-reset"].reindex(act_r.index).dropna()
        a = act_r.reindex(s.index)
        val.append(dict(fund=name, start=s.index[0].date(), sim_cagr=cagr((1 + s).cumprod()),
                        actual_cagr=cagr((1 + a).cumprod()), corr=np.corrcoef(s, a)[0, 1],
                        te_ann=(s - a).std() * np.sqrt(252)))
    val = pd.DataFrame(val)
    print("\nSimulation validation vs actual funds\n", val.round(4).to_string(index=False))
    val.to_csv(OUT / "letf_sim_validation.csv", index=False, float_format="%.4f")

    rows = []
    periods = [("1928-2026", "1928-01-01", "2026-12-31"), ("1928-1949", "1928-01-01", "1949-12-31"),
               ("1950-1979", "1950-01-01", "1979-12-31"), ("1980-1999", "1980-01-01", "1999-12-31"),
               ("2000-2012", "2000-01-01", "2012-12-31"), ("2013-2026", "2013-01-01", "2026-12-31")]
    for plab, a, b in periods:
        for k, s in sims.items():
            x = s.loc[a:b]
            st = stats(x, k)
            st["period"] = plab
            rows.append(st)
    # 200-DMA rule (Gayed-Bilello style); in-sample = their 1928-2015 window, OOS = 2016-2026
    price = spx.reindex(rtr.index)
    for L in (1, 2, 3):
        base = rtr if L == 1 else sims[f"{L}x daily-reset"]
        rr, sw = ma_rule(price, base, rf)
        for plab, a, b in [("1928-2015 (GB sample)", "1928-01-01", "2015-12-31"),
                           ("2016-2026 (post-publication OOS)", "2016-01-01", "2026-12-31"),
                           ("1928-2026", "1928-01-01", "2026-12-31")]:
            x = rr.loc[a:b]
            st = stats(x, f"{L}x + 200DMA rule")
            st["period"] = plab
            st["switches_per_year"] = sw.loc[a:b].sum() / ((x.index[-1] - x.index[0]).days / 365.25)
            rows.append(st)
            y = base.loc[a:b]
            st2 = stats(y, f"{L}x buy&hold" if L > 1 else "1x buy&hold")
            st2["period"] = plab
            rows.append(st2)
    res = pd.DataFrame(rows)
    res.to_csv(OUT / "letf_longrun_sim.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_rows", 200):
        print("\nLong-run simulation\n", res.round(3).to_string(index=False))

    # crash anatomy
    ev = []
    for lab, a, b in [("1929-09 to 1932-06", "1929-09-01", "1932-06-30"), ("1987-10-19", "1987-10-19", "1987-10-19"),
                      ("2000-03 to 2002-10", "2000-03-24", "2002-10-09"), ("2007-10 to 2009-03", "2007-10-09", "2009-03-09"),
                      ("2020-02-19 to 2020-03-23", "2020-02-20", "2020-03-23"), ("2022", "2022-01-03", "2022-12-30")]:
        row = {"episode": lab}
        for k, s in sims.items():
            row[k] = (1 + s.loc[a:b]).prod() - 1
        ev.append(row)
    ev = pd.DataFrame(ev)
    ev.to_csv(OUT / "letf_crash_episodes.csv", index=False, float_format="%.4f")
    print("\nCrash episodes (simulated S&P)\n", ev.round(3).to_string(index=False))

    # Nasdaq-100 3x (TQQQ-like) from 1985 (price return + 0.8% div approx; financing as above)
    ndx = yf_close("^NDX")
    rn = ndx.pct_change().dropna() + 0.008 / 252
    rfn = short_rate_daily(rn.index)
    n3 = simulate(rn, rfn, 3, er=0.0095)
    nd = []
    for plab, a, b in [("1985-2026", "1985-10-01", "2026-12-31"), ("1985-1999", "1985-10-01", "1999-12-31"),
                       ("2000-03-10 to 2002-10-09", "2000-03-10", "2002-10-09"), ("2010-2026", "2010-02-11", "2026-12-31")]:
        for k, s in [("NDX 1x", rn), ("NDX 3x sim", n3)]:
            st = stats(s.loc[a:b], k)
            st["period"] = plab
            nd.append(st)
    nd = pd.DataFrame(nd)
    nd.to_csv(OUT / "letf_ndx3x_sim.csv", index=False, float_format="%.4f")
    print("\nNasdaq-100 3x simulation\n", nd.round(3).to_string(index=False))

    # When does 3x beat 3x the index over 1 year?  Bucket by index return and realised vol
    s3 = sims["3x daily-reset"]
    df = pd.DataFrame({"i": (1 + rtr).cumprod(), "l": (1 + s3).cumprod()})
    w = 252
    g = pd.DataFrame({"idx_ret": df.i / df.i.shift(w) - 1, "lev_ret": df.l / df.l.shift(w) - 1,
                      "rv": rtr.rolling(w).std() * np.sqrt(252)}).dropna()
    g["beats_3x"] = g.lev_ret > 3 * g.idx_ret
    g["ret_b"] = pd.cut(g.idx_ret, [-1, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 5])
    g["vol_b"] = pd.cut(g.rv, [0, 0.12, 0.16, 0.20, 0.30, 2])
    tab = g.pivot_table(index="ret_b", columns="vol_b", values="beats_3x", aggfunc="mean", observed=True)
    tab.to_csv(OUT / "letf_beats_3x_by_ret_vol.csv", float_format="%.3f")
    print("\nP(3x daily fund 1y return > 3 x index 1y return) by index return (rows) and realised vol (cols)\n",
          tab.round(2).to_string())
    print("overall share of 1y windows 3x beats 3x index:", round(g.beats_3x.mean(), 3))
    gap = (g.lev_ret - 3 * g.idx_ret)
    print("median gap (3x fund - 3x index), 1y windows:", round(gap.median(), 4))


if __name__ == "__main__":
    main()
