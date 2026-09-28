"""Which rules are triggered / near-triggered as of the last available close (target date 2026-09-28)."""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import btc as B
import common as C
import crash_buy as CB
import data
import intl as I

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")


def us_status():
    spx = data.sp500_daily_tr()
    px = spx["px"]
    last = px.index[-1]
    ath = px.max()
    ath_d = px.idxmax()
    vix = data.yf_close("^VIX")
    sma200 = px.rolling(200).mean().iloc[-1]
    me = px.resample("ME").last()
    # 10-month SMA on month-end closes; the September 2026 month-end is not final yet -> use last close as proxy
    sma10 = pd.concat([me.iloc[:-1].iloc[-9:], pd.Series([px.iloc[-1]])]).mean()
    sh = data.shiller_extended()
    cape = sh["CAPE"].dropna().iloc[-1]
    multpl = data.multpl_table("shiller-pe")
    baa10y = data.fred("BAA10Y")
    hy = data.fred("BAMLH0A0HYM2")
    t10y3m = data.fred("T10Y3M")
    t10y2y = data.fred("T10Y2Y")
    dd52 = px.iloc[-1] / px.loc[last - pd.Timedelta(days=365):].max() - 1
    d = {
        "last_close_date": last.date(), "S&P 500": round(px.iloc[-1], 2), "ATH": round(ath, 2), "ATH_date": ath_d.date(),
        "drawdown_from_ATH": px.iloc[-1] / ath - 1, "drawdown_from_52w_high": dd52,
        "S&P needed for -20% trigger": round(ath * 0.8, 0), "S&P needed for -30%": round(ath * 0.7, 0),
        "VIX": round(vix.iloc[-1], 2), "VIX_date": vix.index[-1].date(),
        "above_200DMA": bool(px.iloc[-1] > sma200), "200DMA": round(sma200, 1),
        "pct_vs_200DMA": px.iloc[-1] / sma200 - 1,
        "above_10m_SMA(provisional)": bool(px.iloc[-1] > sma10), "10m_SMA": round(sma10, 1),
        "CAPE_computed(Sep avg)": round(cape, 2), "CAPE_multpl": float(multpl.iloc[-1]),
        "CAPE_multpl_date": multpl.index[-1].date(),
        "BAA-10y spread": float(baa10y.iloc[-1]), "HY OAS (ICE BofA)": float(hy.iloc[-1]), "HY_date": hy.index[-1].date(),
        "10y-3m": float(t10y3m.iloc[-1]), "10y-2y": float(t10y2y.iloc[-1]),
    }
    return d


def gem_status():
    """12-month total returns through the latest close using ETFs: SPY (US), VEU/EFA (ex-US), BIL/SHY (bills)."""
    out = {}
    for tk in ["SPY", "VEU", "EFA", "SHY", "AGG", "IEI"]:
        s = data.yf_close(tk, adj=True)
        t = s.index[-1]
        base = s.loc[: t - pd.DateOffset(years=1)].iloc[-1]
        out[tk] = s.iloc[-1] / base - 1
    rf = data.fred("DTB3")
    out["T-bill 12m (approx avg yield)"] = float(rf.loc[rf.index[-1] - pd.DateOffset(years=1):].mean() / 100)
    if out["SPY"] > out["T-bill 12m (approx avg yield)"]:
        pick = "US (SPY)" if out["SPY"] >= out["VEU"] else "ex-US (VEU)"
    else:
        pick = "bonds (AGG)"
    out["GEM_pick"] = pick
    return out


def crash_state_all():
    rows = []
    mkts = [("S&P 500", CB.us_market())]
    for label, src, tk, kind in I.MARKETS:
        try:
            mkts.append((label, I.load_market(label, src, tk, kind)))
        except Exception:
            continue
    for label, m in mkts:
        px = m.px
        ath = px.max()
        dd = px.iloc[-1] / ath - 1
        # max drawdown within the current ATH episode (has a threshold already fired?)
        since = px.loc[px.idxmax():]
        mdd_ep = (since / ath - 1).min()
        fired = [int(t * 100) for t in CB.THRESHOLDS if mdd_ep <= -t]
        rows.append({"market": label, "last": px.index[-1].date(), "ATH_date": px.idxmax().date(),
                     "dd_now": dd, "max_dd_this_episode": mdd_ep,
                     "thresholds_fired_this_episode": ",".join(map(str, fired)) if fired else "-",
                     "p10ma_now": float(m.p10ma.iloc[-1]) if pd.notna(m.p10ma.iloc[-1]) else np.nan,
                     "above_200DMA": bool(px.iloc[-1] > m.sma200.iloc[-1])})
    return pd.DataFrame(rows)


def btc_status():
    r = B.run()
    cur = r["current"]
    nh = B.next_halving_estimate(969_048, pd.Timestamp("2026-09-28"))
    cur["next_halving_est"] = nh.date()
    cur["buy_window_-18m"] = (nh - pd.DateOffset(months=18)).date()
    cur["buy_window_-12m"] = (nh - pd.DateOffset(months=12)).date()
    return cur


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    u = us_status()
    for k, v in u.items():
        print(f"{k:32s} {v}")
    g = gem_status()
    print(g)
    b = btc_status()
    print(b)
    cs = crash_state_all()
    print(cs.round(3).to_string())
    cs.to_csv(os.path.join(OUT, "status_crash_state_by_market.csv"), index=False)
    pd.Series({**{k: str(v) for k, v in u.items()}, **{f"GEM_{k}": str(v) for k, v in g.items()},
               **{f"BTC_{k}": str(v) for k, v in b.items()}}).to_csv(os.path.join(OUT, "status_summary.csv"))
