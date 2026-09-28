"""Volatility ETPs, crypto leverage/liquidation, retail FX leverage, credit proxies.

  (a) VIX ETPs (VIXY, UVXY, SVXY, VXX): long-run decay, share of positive windows,
      the 5-Feb-2018 short-vol blow-up, the 2020 long-vol pay-off.
  (b) Crypto: probability that a leveraged BTC position is liquidated within H days,
      from daily highs/lows (Yahoo BTC-USD, 2014-).  Daily bars miss exchange-
      specific intraday wicks, so these are LOWER BOUNDS.  Plus Kraken perpetual
      funding-rate history (public API).
  (c) FX: EUR/USD adverse-excursion probabilities at US (50:1) / EU (30:1) leverage.
  (d) Credit proxies for retail (CDS is not retail-accessible): HYG/JNK behaviour.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import requests

from common import DATA_DIR, OUT, cagr, cboe, max_drawdown, yf_close, yf_ohlc


def vol_etps():
    rows = []
    for t in ["VIXY", "UVXY", "SVXY", "VXX"]:
        s = yf_close(t, field="Adj Close", start="2009-01-01")
        r = s.pct_change().dropna()
        yrs = (s.index[-1] - s.index[0]).days / 365.25
        m12 = (s / s.shift(252) - 1).dropna()
        m1 = (s / s.shift(21) - 1).dropna()
        rows.append(dict(etp=t, start=s.index[0].date(), end=s.index[-1].date(),
                         total_return=s.iloc[-1] / s.iloc[0] - 1, cagr=cagr(s),
                         ann_log_return=np.log(s.iloc[-1] / s.iloc[0]) / yrs, maxdd=max_drawdown(s),
                         p_pos_1m=(m1 > 0).mean(), p_pos_12m=(m12 > 0).mean(), best_day=r.max(), worst_day=r.min(),
                         ret_2018_02_05_to_06=(s.loc["2018-02-06"] / s.loc["2018-02-02"] - 1) if s.index[0] < pd.Timestamp("2018-02-01") else np.nan,
                         ret_2020_02_19_to_03_18=s.loc[:"2020-03-18"].iloc[-1] / s.loc[:"2020-02-19"].iloc[-1] - 1))
    df = pd.DataFrame(rows)
    vix = cboe("VIX")
    print("VIX 2018-02-02 close", vix.loc["2018-02-02"], "-> 2018-02-05 close", vix.loc["2018-02-05"],
          f"({vix.loc['2018-02-05']/vix.loc['2018-02-02']-1:+.1%})")
    # VIX spot is flat over the VIXY life while VIXY decays: decay is roll cost, not "VIX went down"
    vixy = yf_close("VIXY", field="Adj Close", start="2011-01-01")
    v = vix.reindex(vixy.index).ffill()
    yrs = (vixy.index[-1] - vixy.index[0]).days / 365.25
    print(f"VIX {v.iloc[0]:.2f} -> {v.iloc[-1]:.2f} over VIXY life; VIXY annualised log return "
          f"{np.log(vixy.iloc[-1]/vixy.iloc[0])/yrs:+.1%}")
    # monthly VIXY return conditional on VIX term structure at start of month
    vix3m = yf_close("^VIX3M", start="2006-01-01").reindex(vixy.index).ffill()
    mstart = vixy.resample("MS").first().index
    recs = []
    for d in mstart:
        d0 = vixy.index[vixy.index.searchsorted(d)]
        j = vixy.index.get_loc(d0)
        if j + 21 >= len(vixy):
            break
        recs.append(dict(date=d0, ts=v.iloc[j] / vix3m.iloc[j], ret=vixy.iloc[j + 21] / vixy.iloc[j] - 1))
    mr = pd.DataFrame(recs).dropna()
    mr["ts_b"] = pd.cut(mr.ts, [0, 0.85, 0.9, 0.95, 1.0, 3])
    tab = mr.groupby("ts_b", observed=True).ret.agg(["count", "mean", "median", lambda x: (x > 0).mean()])
    tab.columns = ["months", "mean_21d_ret", "median_21d_ret", "p_positive"]
    print("VIXY next-21d return by VIX/VIX3M at entry\n", tab.round(3).to_string())
    tab.to_csv(OUT / "vixy_by_term_structure.csv", float_format="%.4f")
    return df


def liquidation_table(o, h, l, c, levers, horizons, mm=0.005, side="long"):
    """P(adverse excursion from entry close reaches 1/L - mm within H days)."""
    out = []
    n = len(c)
    cv, lv, hv = c.values, l.values, h.values
    for L in levers:
        thr = 1.0 / L - mm
        for H in horizons:
            hits, tot, eq_end = 0, 0, []
            for i in range(0, n - H):
                entry = cv[i]
                if side == "long":
                    worst = lv[i + 1:i + 1 + H].min() / entry - 1
                    liq = worst <= -thr
                    end_ret = cv[i + H] / entry - 1
                else:
                    worst = hv[i + 1:i + 1 + H].max() / entry - 1
                    liq = worst >= thr
                    end_ret = -(cv[i + H] / entry - 1)
                hits += liq
                tot += 1
                eq_end.append(0.0 if liq else max(0.0, 1 + L * end_ret))
            eq_end = np.array(eq_end)
            out.append(dict(side=side, leverage=L, horizon_days=H, p_liquidated=hits / tot,
                            mean_equity_multiple=eq_end.mean(), median_equity_multiple=np.median(eq_end),
                            p_equity_below_half=(eq_end < 0.5).mean()))
    return pd.DataFrame(out)


def crypto():
    df = yf_ohlc("BTC-USD", start="2014-01-01")
    df = df[["Open", "High", "Low", "Close"]].dropna()
    r = np.log(df.Close).diff().dropna()
    print(f"BTC-USD {df.index[0].date()}..{df.index[-1].date()}: ann vol {r.std()*np.sqrt(365):.1%}, "
          f"worst day {r.min():.1%}, days with |move|>10%: {(r.abs()>0.10).mean():.2%}")
    lt = pd.concat([liquidation_table(df.Open, df.High, df.Low, df.Close, [2, 3, 5, 10, 20, 50, 100],
                                      [1, 7, 30, 90, 365], side=s) for s in ("long", "short")])
    lt.to_csv(OUT / "btc_liquidation_probabilities.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 200, "display.max_rows", 200):
        print(lt.pivot_table(index=["side", "leverage"], columns="horizon_days", values="p_liquidated").round(3).to_string())
        print(lt.pivot_table(index=["side", "leverage"], columns="horizon_days", values="mean_equity_multiple").round(3).to_string())
    # recent-regime check (2023+)
    rec = df.loc["2023-01-01":]
    lt2 = liquidation_table(rec.Open, rec.High, rec.Low, rec.Close, [5, 10, 20, 50], [7, 30, 90], side="long")
    lt2.to_csv(OUT / "btc_liquidation_probabilities_2023plus.csv", index=False, float_format="%.4f")
    print("2023+ long:\n", lt2.pivot_table(index="leverage", columns="horizon_days", values="p_liquidated").round(3).to_string())
    # Kraken perpetual funding (public)
    fr = None
    try:
        p = DATA_DIR / "kraken_funding_PF_XBTUSD.json"
        if not p.exists():
            txt = requests.get("https://futures.kraken.com/derivatives/api/v4/historicalfundingrates?symbol=PF_XBTUSD",
                               timeout=60).text
            p.write_text(txt)
        js = json.loads(p.read_text())
        fr = pd.DataFrame(js["rates"])
        fr["timestamp"] = pd.to_datetime(fr.timestamp)
        fr = fr.set_index("timestamp").sort_index()
        # relativeFundingRate is per funding period (hourly on Kraken)
        per = fr.index.to_series().diff().median()
        ppy = pd.Timedelta(days=365) / per
        ann = fr.relativeFundingRate.mean() * ppy
        by_year = fr.relativeFundingRate.groupby(fr.index.year).mean() * ppy
        print(f"Kraken PF_XBTUSD funding: {fr.index[0].date()}..{fr.index[-1].date()}, period {per}, "
              f"mean annualised {ann:.2%} paid by longs, share of periods positive {(fr.relativeFundingRate>0).mean():.1%}")
        print("by year:", by_year.round(4).to_dict())
        pd.DataFrame({"annualised_funding": by_year}).to_csv(OUT / "kraken_btc_funding_by_year.csv", float_format="%.4f")
    except Exception as ex:
        print("funding fetch failed", ex)
    return lt


def fx():
    """EUR/USD from FRED DEXUSEU (daily noon rates, 1999-).  Yahoo EURUSD=X has bad
    2008/2012 prints (16% 'daily moves'), so it is not used.  Close-only data miss
    intraday excursions -> probabilities are LOWER BOUNDS."""
    from common import fred
    c = fred("DEXUSEU").dropna()
    r = np.log(c).diff().dropna()
    print(f"EURUSD (FRED) {c.index[0].date()}..{c.index[-1].date()} ann vol {r.std()*np.sqrt(252):.1%}, "
          f"max |daily move| {r.abs().max():.2%}")
    out = []
    cv = c.values
    for side in ("long", "short"):
        for L in (10, 20, 30, 50):
            for H in (1, 5, 21, 63, 252):
                wipe, half = 0, 0
                n = len(cv) - H
                for i in range(n):
                    path = cv[i + 1:i + 1 + H] / cv[i] - 1
                    adv = -path.min() if side == "long" else path.max()
                    wipe += adv >= 1.0 / L
                    half += adv >= 0.5 / L
                out.append(dict(side=side, leverage=L, horizon_days=H, p_margin_closeout_50pct=half / n,
                                p_equity_wiped=wipe / n))
    t = pd.DataFrame(out)
    t.to_csv(OUT / "eurusd_leverage_excursions.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 200):
        print(t[t.side == "long"].pivot_table(index="leverage", columns="horizon_days",
                                                values=["p_margin_closeout_50pct", "p_equity_wiped"]).round(3).to_string())
    return t


def credit():
    rows = []
    spy = yf_close("SPY", field="Adj Close", start="2007-01-01")
    for t in ["HYG", "JNK", "LQD"]:
        s = yf_close(t, field="Adj Close", start="2007-01-01")
        g0 = max(pd.Timestamp("2007-10-09"), s.index[0])
        rows.append(dict(etf=t, start=s.index[0].date(), cagr=cagr(s), maxdd=max_drawdown(s),
                         gfc_from=g0.date(),
                         gfc=s.loc[:"2008-12-12"].iloc[-1] / s.loc[:g0].iloc[-1] - 1,
                         covid=s.loc[:"2020-03-23"].iloc[-1] / s.loc[:"2020-02-20"].iloc[-1] - 1,
                         spy_gfc=spy.loc[:"2008-12-12"].iloc[-1] / spy.loc[:"2007-10-09"].iloc[-1] - 1,
                         spy_covid=spy.loc[:"2020-03-23"].iloc[-1] / spy.loc[:"2020-02-20"].iloc[-1] - 1))
    df = pd.DataFrame(rows)
    df.to_csv(OUT / "credit_proxies.csv", index=False, float_format="%.4f")
    print(df.round(3).to_string(index=False))
    return df


def main():
    v = vol_etps()
    v.to_csv(OUT / "vol_etps_summary.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        print(v.round(3).to_string(index=False))
    crypto()
    fx()
    credit()


if __name__ == "__main__":
    main()
