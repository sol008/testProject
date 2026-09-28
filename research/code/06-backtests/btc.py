"""Part 4: Bitcoin few-trade rules (2010-07-18 .. today; Coin Metrics community PriceUSD + yfinance tail).

Rules:
  (a) buy after a 75% / 80% drawdown from the all-time high (first crossing per ATH episode),
      exit at 1y / 2y / 3y or when the old ATH is regained;
  (b) buy when the daily close is at/below 1.0x or 1.2x the 200-week moving average (approximated by the
      1400-day SMA of daily closes), first touch per ATH episode; same exits;
  (c) halving-cycle timing: buy 18 or 12 months BEFORE a halving, sell 12 or 18 months AFTER it.
Entries/exits at the next daily close after the signal.  Round-trip cost 0.5% (spot exchange + spread).
TINY SAMPLE: 3-5 independent cycles.  Survivorship: BTC is the survivor of thousands of coins.
Early prices (2010-2013) come from thin, now-defunct exchanges (Mt.Gox).
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import common as C
import data

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
COST = 0.005
HALVINGS = [pd.Timestamp("2012-11-28"), pd.Timestamp("2016-07-09"), pd.Timestamp("2020-05-11"),
            pd.Timestamp("2024-04-20")]
LAST_HALVING_HEIGHT = 840_000


def next_halving_estimate(height_now: int, asof: pd.Timestamp) -> pd.Timestamp:
    days = (asof - HALVINGS[-1]).days
    per_day = (height_now - LAST_HALVING_HEIGHT) / days
    return asof + pd.Timedelta(days=(1_050_000 - height_now) / per_day)


def _exit(px, entry, rule, peak):
    idx = px.index
    if rule == "ATH":
        after = px.loc[entry:]
        rec = after[after >= peak]
        if len(rec):
            return rec.index[0], False
        return idx[-1], True
    t = C.first_on_or_after(idx, entry + pd.DateOffset(years=int(rule[0])))
    if t is None:
        return idx[-1], True
    return t, False


def dd_rule(px: pd.Series, thr: float, cond: pd.Series | None = None, label=""):
    ath = px.cummax()
    eid = (px >= ath).cumsum()
    dd = px / ath - 1
    rows = []
    c = cond.reindex(px.index).fillna(False) if cond is not None else pd.Series(True, index=px.index)
    for k, g in dd.groupby(eid):
        if thr is not None:
            hit = g[g <= -thr]
        else:
            hit = g
        if len(hit) == 0:
            continue
        hc = c.loc[hit.index]
        hc = hc[hc]
        if len(hc) == 0:
            continue
        sd = hc.index[0]
        pos = px.index.get_loc(sd)
        if pos + 1 >= len(px):
            continue
        entry = px.index[pos + 1]
        peak = ath.loc[sd]
        for rule in ["1y", "2y", "3y", "ATH"]:
            ex, op = _exit(px, entry, rule, peak)
            seg = px.loc[entry:ex]
            ret = seg.iloc[-1] / seg.iloc[0] * (1 - COST) - 1
            rows.append({"rule": label, "peak_date": g.index[0].date(), "peak": round(peak, 2),
                         "signal": sd.date(), "entry": entry.date(), "entry_px": round(px.loc[entry], 2),
                         "dd_at_entry": px.loc[entry] / peak - 1, "exit_rule": rule, "exit": ex.date(),
                         "open": op, "years": round(C.years_between(entry, ex), 2), "ret": ret,
                         "cagr": (1 + ret) ** (1 / max(C.years_between(entry, ex), 1e-6)) - 1,
                         "mdd_in_trade": float((seg / seg.cummax() - 1).min()),
                         "further_fall_from_entry": float(seg.min() / seg.iloc[0] - 1)})
    return pd.DataFrame(rows)


def halving_rule(px: pd.Series, buy_before_m: int, sell_after_m: int):
    rows = []
    for h in HALVINGS:
        b = C.first_on_or_after(px.index, h - pd.DateOffset(months=buy_before_m))
        s = C.first_on_or_after(px.index, h + pd.DateOffset(months=sell_after_m))
        if b is None:
            continue
        op = s is None
        if op:
            s = px.index[-1]
        seg = px.loc[b:s]
        ret = seg.iloc[-1] / seg.iloc[0] * (1 - COST) - 1
        rows.append({"halving": h.date(), "buy": b.date(), "buy_px": round(px.loc[b], 2), "sell": s.date(),
                     "sell_px": round(px.loc[s], 2), "open": op, "years": round(C.years_between(b, s), 2),
                     "ret": ret, "mdd_in_trade": float((seg / seg.cummax() - 1).min()),
                     "rule": f"buy -{buy_before_m}m / sell +{sell_after_m}m"})
    return pd.DataFrame(rows)


def halving_strategy_equity(px: pd.Series, buy_before_m, sell_after_m, rf_d):
    """In BTC during windows, T-bills otherwise; from the first buy date."""
    idx = px.index
    pos = pd.Series(False, index=idx)
    for h in HALVINGS + [pd.Timestamp("2028-04-10")]:
        b = h - pd.DateOffset(months=buy_before_m)
        s = h + pd.DateOffset(months=sell_after_m)
        pos.loc[(idx > b) & (idx <= s)] = True
    r = px.pct_change().fillna(0)
    rf = rf_d.reindex(rf_d.index.union(idx)).ffill().reindex(idx).fillna(0)
    # crypto trades 7 days a week: scale the per-trading-day rf to calendar days
    rf = rf * 252 / 365
    sw = pos.astype(int).diff().abs().fillna(0)
    rr = np.where(pos, r, rf) - sw * COST / 2
    eq = pd.Series(np.cumprod(1 + rr), index=idx)
    return eq, pos


def run():
    px = data.btc_daily()
    rf = data.daily_rf()
    res = {}
    t75 = dd_rule(px, 0.75, label="DD>=75%")
    t80 = dd_rule(px, 0.80, label="DD>=80%")
    sma1400 = px.rolling(1400, min_periods=1400).mean()
    w10 = dd_rule(px, 0.0, px <= sma1400 * 1.0, label="close<=200WMA")
    w12 = dd_rule(px, 0.0, px <= sma1400 * 1.2, label="close<=1.2x200WMA")
    trades = pd.concat([t75, t80, w10, w12], ignore_index=True)
    trades.to_csv(os.path.join(OUT, "btc_dd_wma_trades.csv"), index=False)
    hv = pd.concat([halving_rule(px, b, s) for b in (18, 12) for s in (12, 18)], ignore_index=True)
    hv.to_csv(os.path.join(OUT, "btc_halving_trades.csv"), index=False)
    # strategy equity for halving rules vs buy & hold from the first common date
    eqs = {}
    for b in (18, 12):
        for s in (12, 18):
            eq, pos = halving_strategy_equity(px, b, s, rf)
            eqs[f"halving -{b}m/+{s}m"] = (eq, pos)
    start = HALVINGS[0] - pd.DateOffset(months=18)
    rows = []
    bh = px.loc[start:] / px.loc[start:].iloc[0]
    for k, (eq, pos) in eqs.items():
        e = eq.loc[start:]
        e = e / e.iloc[0]
        yrs = C.years_between(e.index[0], e.index[-1])
        rows.append({"strategy": k, "start": e.index[0].date(), "CAGR": (e.iloc[-1]) ** (1 / yrs) - 1,
                     "maxDD": C.max_drawdown(e), "time_in_mkt": float(pos.loc[start:].mean()), "total_x": e.iloc[-1],
                     "trades": int((pos.loc[start:].astype(int).diff() == 1).sum())})
    yrs = C.years_between(bh.index[0], bh.index[-1])
    rows.append({"strategy": "BTC buy&hold", "start": bh.index[0].date(), "CAGR": bh.iloc[-1] ** (1 / yrs) - 1,
                 "maxDD": C.max_drawdown(bh), "time_in_mkt": 1.0, "total_x": bh.iloc[-1], "trades": 1})
    strat = pd.DataFrame(rows)
    strat.to_csv(os.path.join(OUT, "btc_halving_strategies.csv"), index=False)
    # BTC drawdown episodes
    ath = px.cummax()
    eid = (px >= ath).cumsum()
    dd = px / ath - 1
    eps = []
    for k, g in dd.groupby(eid):
        if g.min() > -0.5:
            continue
        pdate = g.index[0]
        tdate = g.idxmin()
        after = px.loc[tdate:]
        rec = after[after >= ath.loc[pdate]]
        eps.append({"peak_date": pdate.date(), "peak": round(ath.loc[pdate], 2), "trough_date": tdate.date(),
                    "trough": round(px.loc[tdate], 2), "max_dd": g.min(),
                    "recovery": rec.index[0].date() if len(rec) else "not yet",
                    "days_to_recover_from_trough": (rec.index[0] - tdate).days if len(rec) else np.nan})
    eps = pd.DataFrame(eps)
    eps.to_csv(os.path.join(OUT, "btc_episodes.csv"), index=False)
    # current state
    last = px.index[-1]
    cur = {"date": last.date(), "price": px.iloc[-1], "ath": ath.iloc[-1], "ath_date": px.idxmax().date(),
           "dd_from_ath": px.iloc[-1] / ath.iloc[-1] - 1, "sma1400": sma1400.iloc[-1],
           "price_over_200wma": px.iloc[-1] / sma1400.iloc[-1]}
    res.update({"trades": trades, "halving": hv, "strat": strat, "episodes": eps, "current": cur, "px": px})
    return res


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.max_rows", 300)
    r = run()
    print(r["episodes"].to_string())
    print(r["trades"].round(3).to_string())
    print(r["halving"].round(3).to_string())
    print(r["strat"].round(3).to_string())
    print(r["current"])
    print("next halving estimate", next_halving_estimate(969_048, pd.Timestamp("2026-09-28")).date())
