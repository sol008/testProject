"""s06 - 0DTE / 1DTE and weekly options: what the data say (2022-05-13 .. 2026-09-25 for VIX1D).

1-day SPX options are priced from CBOE VIX1D (the index's 1-day variance-swap vol) with the 0-5 DTE smile
shape from the 2026-09-28 snapshot; the ATM IV is set so that the model variance swap equals VIX1D.
Trades open at the close of day t and settle at the close of t+1 (the 1DTE equivalent of a 0DTE trade
opened at the open; it includes the overnight gap).  Retail round-trip cost: effective spread 5.5% of
each leg's premium paid once on entry (cash settlement at expiry), per Beckmeyer, Branger & Gayda (2023).
Structures (per day):
  long / short ATM straddle            -> P&L as % of premium (long) or of spot (short)
  short iron butterfly ATM +/- 1 sigma  -> P&L as % of max loss (defined risk)
  short 10-delta put spread (1 sigma wide) -> P&L as % of max loss
Also: weekly vs monthly put-write from CBOE WPUT vs PUT (real prices), 2006-2026.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm

import optmodel as om
from common14 import OUT, bs_price, cboe, dense, kelly_fraction, log_growth, put_index, save

EFF_SPREAD = 0.055


def one_day_prices(S, sig_vs, r, strikes, kinds, m=1.0):
    """Price 1-day options: ATM IV from the variance-swap level via the 0-5 DTE shape."""
    tau = 1.0
    atm = om.atm_over_vix(np.array([m]), np.array([3.0]))[0] * sig_vs
    T = tau / 252.0          # 1 trading day
    out = []
    for K, kind in zip(strikes, kinds):
        z = np.log(K / S) / (atm * np.sqrt(T))
        iv = atm * om.g_shape(np.array([z]), np.array([3.0]), np.array([m]))[0]
        out.append(float(bs_price(S, K, T, r, 0.0, iv, kind)))
    return np.array(out), atm


def main():
    mk = om.market()
    d = mk.loc["2022-05-13":, ["spx", "vix1d", "rf", "fomc_day", "cpi_day", "nfp_day", "m_skew"]].dropna(subset=["vix1d"])
    rows = []
    for i in range(len(d) - 1):
        t, t1 = d.index[i], d.index[i + 1]
        S0, S1 = d.spx.iloc[i], d.spx.iloc[i + 1]
        sig = d.vix1d.iloc[i] / 100
        r = d.rf.iloc[i]
        sd = sig / np.sqrt(252)
        K_lo, K_hi = S0 * (1 - sd), S0 * (1 + sd)
        prices, atm = one_day_prices(S0, sig, r, [S0, S0, K_lo, K_hi], ["call", "put", "put", "call"])
        c_atm, p_atm, p_lo, c_hi = prices
        strad = c_atm + p_atm
        pay_strad = abs(S1 - S0)
        # long straddle: pay premium * (1 + eff/2)
        long_strad = (pay_strad - strad * (1 + EFF_SPREAD / 2)) / (strad * (1 + EFF_SPREAD / 2))
        # short straddle: receive premium * (1 - eff/2); P&L % of spot
        short_strad_spot = (strad * (1 - EFF_SPREAD / 2) - pay_strad) / S0
        # iron butterfly: short ATM straddle, long 1-sd wings
        credit_bf = (strad - p_lo - c_hi) - EFF_SPREAD / 2 * (strad + p_lo + c_hi)
        width = S0 * sd
        pay_bf = min(pay_strad, width)
        ml_bf = width - credit_bf
        bf = (credit_bf - pay_bf) / ml_bf
        # 10-delta put spread 1-sd wide
        k10 = S0 * np.exp(-norm.ppf(0.90) * atm / np.sqrt(252))
        pr, _ = one_day_prices(S0, sig, r, [k10, k10 - width], ["put", "put"])
        credit_ps = (pr[0] - pr[1]) - EFF_SPREAD / 2 * (pr[0] + pr[1])
        pay_ps = min(max(k10 - S1, 0), width)
        ml_ps = width - credit_ps
        ps = (credit_ps - pay_ps) / ml_ps if ml_ps > 0 and credit_ps > 0 else np.nan
        ev = "FOMC" if d.fomc_day.iloc[i + 1] else "CPI" if d.cpi_day.iloc[i + 1] else "NFP" if d.nfp_day.iloc[i + 1] else "none"
        rows.append(dict(date=t1, event=ev, vix1d=d.vix1d.iloc[i], move=np.log(S1 / S0), straddle_pct_spot=strad / S0,
                         long_straddle=long_strad, short_straddle_pct_spot=short_strad_spot, iron_fly=bf,
                         put_spread10=ps, fly_credit_over_ml=credit_bf / ml_bf, ps_credit_over_ml=credit_ps / ml_ps))
    t = pd.DataFrame(rows)
    t.to_csv(OUT / "s06_1day_trades.csv", index=False, float_format="%.6f")
    summ = []
    for name in ["long_straddle", "short_straddle_pct_spot", "iron_fly", "put_spread10"]:
        for grp, g in [("all days", t), ("event days", t[t.event != "none"]), ("non-event", t[t.event == "none"])]:
            x = g[name].dropna().values
            fk = kelly_fraction(x) if name != "short_straddle_pct_spot" else np.nan
            summ.append(dict(trade=name, days=grp, n=len(x), mean=x.mean(), median=np.median(x), win=(x > 0).mean(),
                             worst=x.min(), best=x.max(), t=x.mean() / (x.std() / np.sqrt(len(x))),
                             ann_sharpe=x.mean() / x.std() * np.sqrt(252), kelly=fk,
                             trades_per_year=252))
    s = pd.DataFrame(summ)
    save(s, "s06_1day_summary", index=False)
    worst = t.nsmallest(8, "short_straddle_pct_spot")[["date", "event", "vix1d", "move", "straddle_pct_spot", "short_straddle_pct_spot", "iron_fly"]]
    worst.to_csv(OUT / "s06_worst_days.csv", index=False, float_format="%.4f")

    # weekly vs monthly put-write (real prices)
    wput, put = dense(cboe("WPUT")), put_index()
    j = pd.concat([wput.rename("WPUT"), put.rename("PUT")], axis=1).dropna()
    yrs = (j.index[-1] - j.index[0]).days / 365.25
    wm = pd.DataFrame({"cagr": (j.iloc[-1] / j.iloc[0]) ** (1 / yrs) - 1,
                       "vol": j.resample("ME").last().pct_change().std() * np.sqrt(12),
                       "maxdd": (j / j.cummax() - 1).min()})
    wm.to_csv(OUT / "s06_weekly_vs_monthly_putwrite.csv", float_format="%.4f")
    with pd.option_context("display.width", 250):
        print(s.round(4).to_string(index=False))
        print(worst.round(4).to_string(index=False))
        print(wm.round(4).to_string())
        print("mean 1-day straddle cost, % spot:", round(100 * t.straddle_pct_spot.mean(), 3))


if __name__ == "__main__":
    main()
