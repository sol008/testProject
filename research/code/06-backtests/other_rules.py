"""Part 6: other candidate few-trade rules.

  (a) VIX spike buys: first close with VIX >= 45 (VXO 1986-89; realised-vol proxy 1928-85) after 60
      trading days below; buy next close, hold 6m/1y/2y (S&P 500 total return, 1x and 3x).
  (b) 'Buy after 3 consecutive down calendar years' (S&P total return from Shiller back to 1871, plus
      Nikkei and other long indices, price-only).
  (c) Gold 10-month SMA trend (monthly, 1971-2026; London PM monthly averages from datasets/gold-prices).
  (d) Commodity 10-month SMA trend (S&P GSCI spot index for signals and approximate returns 1984-2006;
      DBC ETF returns 2006-2026).
  (e) Yield-curve re-steepening (10y minus 3m T-bill turns positive after an inversion) as a bear/
      recession timing signal: forward S&P returns and recession incidence after each signal.
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import common as C
import crash_buy as CB
import data

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")


# ------------------------------------------------------------------------------------------ (a) VIX spikes
def vix_spikes(level=45.0, reset_days=60):
    mkt = CB.us_market()
    v = mkt.vol
    above = v >= level
    rows = []
    last_above = -10**9
    idx = mkt.idx
    for i in range(len(idx)):
        if above.iloc[i]:
            if i - last_above > reset_days:
                if i + 1 < len(idx):
                    entry = idx[i + 1]
                    d = {"signal": idx[i].date(), "vol_proxy": round(float(v.iloc[i]), 1),
                         "source": "VIX" if idx[i] >= pd.Timestamp("1990-01-02") else (
                             "VXO" if idx[i] >= pd.Timestamp("1986-01-02") else "realised vol + 4"),
                         "entry": entry.date(), "dd_from_ath_at_entry": float(mkt.px.loc[entry] / mkt.px.loc[:entry].max() - 1)}
                    for H, lab in [(0.5, "6m"), (1, "1y"), (2, "2y")]:
                        t = C.first_on_or_after(idx, entry + pd.DateOffset(months=int(H * 12)))
                        op = t is None
                        t = idx[-1] if op else t
                        for L in (1, 3):
                            ret, mdd = CB.trade_stats(mkt, entry, t, L, ruin=(L > 1))
                            d[f"ret_{lab}_{L}x"] = ret
                        d[f"open_{lab}"] = op
                    rows.append(d)
            last_above = i
    return pd.DataFrame(rows)


# ------------------------------------------------------------------------------------------ (b) 3 down years
def three_down_years():
    # US: calendar-year total returns from daily closes (1928+), Shiller Dec-average based before
    sh = data.shiller_extended()
    trn = sh["TRN"]
    yr_sh = trn.groupby(trn.index.year).last()
    spx = data.sp500_daily_tr()["tr"]
    yr_d = spx.groupby(spx.index.year).last()
    yr_d = yr_d / yr_d.loc[1928] * yr_sh.loc[1928]
    yr = pd.concat([yr_sh[yr_sh.index < 1928], yr_d[yr_d.index >= 1928]])
    yret = yr.pct_change().dropna()
    yret = yret[yret.index <= 2025]
    out = []

    def scan(name, yr_ret: pd.Series, lvl: pd.Series):
        for y in yr_ret.index:
            prev = [y - 2, y - 1, y]
            if all(p in yr_ret.index for p in prev) and all(yr_ret.loc[p] < 0 for p in prev):
                if (y - 1) in yr_ret.index and (y - 3) in yr_ret.index and yr_ret.loc[y - 3] < 0 and yr_ret.loc[y - 1] < 0 and yr_ret.loc[y - 2] < 0:
                    # only the FIRST time a run reaches 3 years (skip the 4th consecutive down year)
                    continue
                d = {"market": name, "3rd_down_year": y, "down_years": f"{yr_ret.loc[y-2]:+.0%}, {yr_ret.loc[y-1]:+.0%}, {yr_ret.loc[y]:+.0%}"}
                for H in (1, 3, 5):
                    if (y + H) in lvl.index:
                        d[f"next_{H}y"] = lvl.loc[y + H] / lvl.loc[y] - 1
                    else:
                        d[f"next_{H}y"] = np.nan
                out.append(d)

    scan("S&P composite TR (Shiller)", yret, yr)
    for label, src, tk in [("Nikkei 225 (price)", "fred", "NIKKEI225"), ("Nasdaq Comp (price)", "yf", "^IXIC"),
                           ("FTSE 100 (price)", "yf", "^FTSE"), ("DAX (TR)", "yf", "^GDAXI"),
                           ("CAC 40 (price)", "yf", "^FCHI"), ("Hang Seng (price)", "yf", "^HSI"),
                           ("TSX (price)", "yf", "^GSPTSE"), ("Straits Times (price)", "yf", "^STI"),
                           ("IBEX (price)", "yf", "^IBEX"), ("FTSE MIB (price)", "yf", "FTSEMIB.MI"),
                           ("Athens General (price)", "yf", "GD.AT"), ("KOSPI (price)", "yf", "^KS11"),
                           ("Shanghai (price)", "yf", "000001.SS"), ("SMI (price)", "yf", "^SSMI")]:
        px = data.fred(tk) if src == "fred" else data.yf_close(tk)
        y = px.groupby(px.index.year).last()
        first_full = px.index[0].year + 1
        y = y[y.index >= first_full - 1]
        r = y.pct_change().dropna()
        r = r[r.index <= 2025]
        scan(label, r, y)
    return pd.DataFrame(out)


# ------------------------------------------------------------------------------------------ (c)/(d) trend
def monthly_trend(price_m: pd.Series, ret_m: pd.Series, rf_m: pd.Series, n=10, cost=0.001, add_rf_when_in=False):
    sma = price_m.rolling(n).mean()
    sig = price_m > sma
    pos = sig.shift(1).fillna(False).astype(bool)
    r_in = ret_m + (rf_m if add_rf_when_in else 0)
    sw = pos.astype(int).diff().abs().fillna(0)
    rr = np.where(pos, r_in, rf_m) - sw * cost
    start = price_m.index[n]
    eq = pd.Series(np.cumprod(1 + rr), index=price_m.index).loc[start:]
    bh = (1 + r_in.fillna(0)).cumprod().loc[start:]
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25

    def st(e):
        return {"CAGR": (e.iloc[-1] / e.iloc[0]) ** (1 / yrs) - 1, "maxDD": C.max_drawdown(e),
                "vol": float(e.pct_change().std() * np.sqrt(12))}

    return {"start": start.date(), "end": eq.index[-1].date(), "timing": st(eq), "buyhold": st(bh),
            "time_in_mkt": float(pos.loc[start:].mean()), "round_trips_per_yr": float(sw.loc[start:].sum()) / 2 / yrs,
            "signal_now": bool(sig.iloc[-1]), "price_now": float(price_m.iloc[-1]), "sma_now": float(sma.iloc[-1])}, eq, bh


def gold_trend():
    g = data.gold_monthly()
    # append current month from GC=F futures (month-end last close) if missing
    gc = data.yf_close("GC=F").resample("ME").last()
    g = pd.concat([g, gc[gc.index > g.index[-1]]])
    g = g.loc["1971-08-31":]
    rf_m = (1 + data.daily_rf()).resample("ME").prod() - 1
    rf_m = rf_m.reindex(g.index).fillna(0)
    ret = g.pct_change().fillna(0)
    res, eq, bh = monthly_trend(g, ret, rf_m, 10, 0.002)
    post = {}
    for lab, st in [("2000-2026", "1999-12-31"), ("1980-2000 (bear)", "1980-01-31")]:
        e = eq.loc[st:] if "2026" in lab else eq.loc[st:"2000-12-31"]
        b = bh.loc[st:] if "2026" in lab else bh.loc[st:"2000-12-31"]
        yrs = (e.index[-1] - e.index[0]).days / 365.25
        post[lab] = {"timing_CAGR": (e.iloc[-1] / e.iloc[0]) ** (1 / yrs) - 1, "timing_maxDD": C.max_drawdown(e),
                     "bh_CAGR": (b.iloc[-1] / b.iloc[0]) ** (1 / yrs) - 1, "bh_maxDD": C.max_drawdown(b)}
    return res, pd.DataFrame(post).T


def commodity_trend():
    gs = data.yf_close("^SPGSCI").resample("ME").last()
    dbc = data.yf_close("DBC", adj=True).resample("ME").last()
    rf_m = (1 + data.daily_rf()).resample("ME").prod() - 1
    rf_m = rf_m.reindex(gs.index).fillna(0)
    r_gs = gs.pct_change()
    r_dbc = dbc.pct_change().reindex(gs.index)
    # returns: DBC (investable, includes collateral yield) from its first full month; before that
    # GSCI spot change + T-bill (approximation that ignores roll yield)
    r = r_gs + rf_m
    r.loc[r_dbc.dropna().index] = r_dbc.dropna()
    res, eq, bh = monthly_trend(gs, r.fillna(0), rf_m, 10, 0.002)
    res2, eq2, bh2 = monthly_trend(gs.loc["2006-01-31":], r_dbc.loc["2006-01-31":].fillna(0), rf_m.loc["2006-01-31":], 10, 0.002)
    return res, res2


# ------------------------------------------------------------------------------------------ (e) yield curve
def yield_curve():
    gs10 = data.fred("GS10")
    tb = data.fred("TB3MS")
    sp = (gs10 - tb.reindex(gs10.index)).dropna()
    sp.index = sp.index + pd.offsets.MonthEnd(0)
    rec = data.fred("USREC")
    rec.index = rec.index + pd.offsets.MonthEnd(0)
    spx = data.sp500_daily_tr()
    trm = spx["tr"].resample("ME").last()
    rows = []
    inverted_months = 0
    for i in range(1, len(sp)):
        t = sp.index[i]
        if sp.iloc[i - 1] < 0:
            inverted_months += 1
        if sp.iloc[i] > 0 and sp.iloc[i - 1] <= 0 and inverted_months >= 2:
            d = {"resteepen_month": t.strftime("%Y-%m"), "months_inverted_before": inverted_months,
                 "min_spread_pp": round(float(sp.iloc[max(0, i - inverted_months - 1):i].min()), 2)}
            for H in (6, 12, 24):
                t2 = t + pd.offsets.MonthEnd(H)
                d[f"spx_tr_next_{H}m"] = float(trm.loc[t2] / trm.loc[t] - 1) if t2 in trm.index else np.nan
            # max drawdown of S&P over next 24 months
            seg = spx["tr"].loc[t: t + pd.offsets.MonthEnd(24)]
            d["spx_maxDD_next_24m"] = float((seg / seg.cummax() - 1).min())
            r24 = rec.loc[t: t + pd.offsets.MonthEnd(24)]
            d["recession_within_24m"] = bool((r24 == 1).any())
            first_rec = r24[r24 == 1]
            d["months_to_recession"] = int(round((first_rec.index[0] - t).days / 30.44)) if len(first_rec) else np.nan
            rows.append(d)
            inverted_months = 0
        if sp.iloc[i] > 0 and sp.iloc[i - 1] > 0:
            inverted_months = 0
    ev = pd.DataFrame(rows)
    # unconditional comparison
    r12 = (trm.shift(-12) / trm - 1).loc["1953":]
    uncond = {"mean_12m": float(r12.mean()), "median_12m": float(r12.median())}
    return ev, uncond, float(sp.iloc[-1]), sp.index[-1]


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    pd.set_option("display.max_rows", 200)
    vs = vix_spikes(45)
    print(vs.round(3).to_string())
    vs.to_csv(os.path.join(OUT, "vix45_spike_trades.csv"), index=False)
    vs40 = vix_spikes(40)
    vs40.to_csv(os.path.join(OUT, "vix40_spike_trades.csv"), index=False)
    for d, lab in [(vs, "VIX>=45"), (vs40, "VIX>=40")]:
        for col in ["ret_6m_1x", "ret_1y_1x", "ret_2y_1x", "ret_1y_3x"]:
            x = d[~d[col.replace("ret_", "open_").replace("_1x", "").replace("_3x", "")]][col] if False else d[col]
            print(lab, col, "n", len(x), "win", round((x > 0).mean(), 2), "mean", round(x.mean(), 3), "median", round(x.median(), 3), "worst", round(x.min(), 3))
    td = three_down_years()
    print(td.round(3).to_string())
    td.to_csv(os.path.join(OUT, "three_down_years.csv"), index=False)
    gres, gpost = gold_trend()
    print("GOLD", gres); print(gpost.round(3))
    cres, cres2 = commodity_trend()
    print("COMMOD", cres); print("COMMOD DBC-only", cres2)
    ev, unc, sp_now, sp_date = yield_curve()
    print(ev.round(3).to_string()); print(unc, sp_now, sp_date)
    ev.to_csv(os.path.join(OUT, "yield_curve_resteepening.csv"), index=False)
