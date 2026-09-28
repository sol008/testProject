"""s05 - Short-horizon trades after crashes and volatility spikes: stock vs long calls vs call spreads vs
put credit spreads (model-priced options; APPROXIMATION).

Signals (pre-registered, non-overlapping, 1990-2026; IS = 1990-2007, OOS = 2008-2026):
  CRASH : SPX >= 15% below its 252-day high AND VIX >= 30 (first day; 60-calendar-day cool-down)
  FADE  : VIX >= 30 at some close in the last 10 days AND today's VIX <= 0.8 x that 10-day max
          (the spike has started to fade; 30-day cool-down)
Vehicles, entry at the signal-day close, exit after H calendar days (H = 7, 30, 60) or at expiry:
  STOCK    SPX price return (+ dividends) -- return on notional
  CALL60   long 60-DTE ATM call, sold after H days (bid)          -- return on premium
  CALL_H   long ATM call expiring at H (H = 30, 60), held to expiry -- return on premium
  CSPR60   long 60-DTE ATM / short 105% call spread, sold after H  -- return on debit
  PCS45    short 0.20-delta / 5%-wide put credit spread, 45 DTE, TP 50% or 21 DTE -- return on max loss
Costs: long legs filled at mid + 0.25 x quoted spread, short legs at mid - 0.25 x spread, same on exit.
For each vehicle we report per-trade stats and the growth-optimal (Kelly) fraction, so vehicles are
compared on expected log growth, not on per-trade % return.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import optmodel as om
from common14 import OUT, kelly_fraction, log_growth, save
from spreadsim import build_legs, manage, simulate_path

FILL = 0.25


def signals(mk: pd.DataFrame) -> dict:
    hi = mk.spx.rolling(252, min_periods=60).max()
    dd = mk.spx / hi - 1
    crash = (dd <= -0.15) & (mk.vix >= 30)
    vmax10 = mk.vix.rolling(10).max()
    fade = (vmax10 >= 30) & (mk.vix <= 0.8 * vmax10)
    out = {}
    for name, cond, cool in [("CRASH", crash, 60), ("FADE", fade, 30)]:
        dates, last = [], None
        for d in mk.index[cond.fillna(False).values]:
            if d < pd.Timestamp("1990-03-01"):
                continue
            if last is None or (d - last).days > cool:
                dates.append(d)
                last = d
        out[name] = pd.DatetimeIndex(dates)
    return out


def option_value(mk, d, K, expiry, kind, mode, markup):
    row = mk.loc[d]
    tau = float((expiry - d).days)
    if tau <= 0:
        return (max(row.spx - K, 0) if kind == "call" else max(K - row.spx, 0)), 0.0
    vl = np.array([[row.vix9d, row.vix, row.vix3m, row.vix6m]])
    m = np.array([om.m_from_mode(row.m_skew, mode)])
    p, _ = om.price(row.spx, np.array([K]), np.array([tau]), row.rf, row.q, vl, m, kind, iv_markup=markup)
    p = float(p[0])
    return p, float(om.quoted_spread(np.array([p]), np.array([row.vix]), d.year)[0])


def exit_day(mk, d0, days):
    target = d0 + pd.Timedelta(days=days)
    cand = mk.index[mk.index <= target]
    return cand[-1]


def run(mk: pd.DataFrame, sig: dict) -> pd.DataFrame:
    mode, markup = om.settings()
    rows = []
    for sname, dates in sig.items():
        for d0 in dates:
            r0 = mk.loc[d0]
            S0 = r0.spx
            for H in (7, 30, 60):
                d1 = exit_day(mk, d0, H)
                if d1 <= d0 or (d0 + pd.Timedelta(days=H)) > mk.index[-1]:
                    continue
                S1 = mk.loc[d1].spx
                div = r0.q * (d1 - d0).days / 365
                rows.append(dict(signal=sname, entry=d0, H=H, vehicle="STOCK", R=S1 / S0 - 1 + div))
                # 60-DTE ATM call sold after H days
                E60 = d0 + pd.Timedelta(days=60)
                c0, s0 = option_value(mk, d0, S0, E60, "call", mode, markup)
                c1, s1 = option_value(mk, d1, S0, E60, "call", mode, markup)
                paid = c0 + FILL * s0
                recv = max(c1 - FILL * s1, 0) if H < 60 else c1
                rows.append(dict(signal=sname, entry=d0, H=H, vehicle="CALL60", R=recv / paid - 1))
                # call expiring at H (hold to expiry)
                if H in (30, 60):
                    EH = d0 + pd.Timedelta(days=H)
                    ch0, sh0 = option_value(mk, d0, S0, EH, "call", mode, markup)
                    ST = mk.loc[d1].spx
                    rows.append(dict(signal=sname, entry=d0, H=H, vehicle="CALL_H", R=max(ST - S0, 0) / (ch0 + FILL * sh0) - 1))
                # 60-DTE 100/105 call spread sold after H
                K2 = S0 * 1.05
                u0, us0 = option_value(mk, d0, K2, E60, "call", mode, markup)
                u1, us1 = option_value(mk, d1, K2, E60, "call", mode, markup)
                debit = (c0 + FILL * s0) - (u0 - FILL * us0)
                value = (c1 - FILL * s1) - (u1 + FILL * us1) if H < 60 else (c1 - u1)
                rows.append(dict(signal=sname, entry=d0, H=H, vehicle="CSPR60", R=value / debit - 1))
            # put credit spread, 45 DTE, managed (tp21)
            E45 = d0 + pd.Timedelta(days=45)
            E45 = mk.index[mk.index <= E45][-1]
            if E45 <= mk.index[-1] and (d0 + pd.Timedelta(days=45)) <= mk.index[-1]:
                legs = build_legs(r0, float((E45 - d0).days), "PCS", 0.20, 0.05, mode, markup)
                path = simulate_path(mk, d0, E45, legs, mode, markup)
                res = manage(path, legs, FILL, "tp21")
                if res:
                    rows.append(dict(signal=sname, entry=d0, H=res["days_held"], vehicle="PCS45", R=res["R"]))
                res = manage(path, legs, FILL, "hold")
                if res:
                    rows.append(dict(signal=sname, entry=d0, H=res["days_held"], vehicle="PCS45hold", R=res["R"]))
    return pd.DataFrame(rows)


def summarize(t: pd.DataFrame) -> pd.DataFrame:
    rows = []
    t = t.copy()
    t["Hb"] = np.where(t.vehicle.str.startswith("PCS"), "45d", t.H.astype(str) + "d")
    for (sname, veh, Hb), g in t.groupby(["signal", "vehicle", "Hb"]):
        for per, a, b in [("IS", "1990", "2007"), ("OOS", "2008", "2026"), ("all", "1990", "2026")]:
            x = g[(g.entry >= a) & (g.entry <= b + "-12-31")].R.values
            if len(x) < 3:
                continue
            fmax = 3.0 if veh == "STOCK" else 1.0
            fk = kelly_fraction(x, fmax=fmax)
            rows.append(dict(signal=sname, vehicle=veh, H=Hb, period=per, n=len(x), mean=x.mean(), median=np.median(x),
                             win=(x > 0).mean(), worst=x.min(), best=x.max(), kelly=fk,
                             glog_per_trade_full_kelly=log_growth(x, fk), glog_per_trade_quarter=log_growth(x, fk / 4)))
    return pd.DataFrame(rows)


def main():
    mk = om.market()
    sig = signals(mk)
    for k, v in sig.items():
        print(k, len(v), [d.date().isoformat() for d in v])
    t = run(mk, sig)
    t.to_csv(OUT / "s05_trades.csv", index=False, float_format="%.5f")
    s = summarize(t)
    save(s, "s05_summary", index=False)
    with pd.option_context("display.width", 250, "display.max_rows", 300):
        print(s[s.period != "all"].round(3).to_string(index=False))


if __name__ == "__main__":
    main()
