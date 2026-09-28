"""Path simulator for defined-risk SPX option structures on the synthetic surface (optmodel).

A trade is opened at the close of `d0` and expires at the close of `expiry` (PM-settled, cash).
simulate_path() prices every leg on every trading day of the life of the trade and returns mid
values and the sum of quoted leg spreads; manage() then applies costs and exit rules, so the same
path can be re-used for several management / cost assumptions.

Sign convention: value V = liability of the short structure (what it costs to buy it back at mid);
credit structures have V > 0.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import optmodel as om

COMMISSION_PTS = 0.013  # $1.30 per leg per SPX contract (commission + exchange fees) in index points


def third_fridays(idx: pd.DatetimeIndex) -> pd.DatetimeIndex:
    out = []
    for (y, mth), g in pd.Series(idx, index=idx).groupby([idx.year, idx.month]):
        fr = pd.date_range(f"{y}-{mth:02d}-01", periods=31, freq="D")
        fr = fr[(fr.month == mth) & (fr.dayofweek == 4)]
        cand = g[g <= fr[2]]
        if len(cand):
            out.append(cand.iloc[-1])
    return pd.DatetimeIndex(out)


def build_legs(row, tau0: float, structure: str, short_delta: float, width: float, mode: str, markup: float):
    """Return list of (kind, sign, strike). sign=+1 short (liability), -1 long."""
    S, r, q = row.spx, row.rf, row.q
    vl = np.array([[row.vix9d, row.vix, row.vix3m, row.vix6m]])
    m = np.array([om.m_from_mode(row.m_skew, mode)])
    t = np.array([tau0])
    legs = []
    if structure in ("PCS", "IC"):
        k1 = float(om.strike_for_delta(S, t, r, q, vl, m, short_delta, "put", iv_markup=markup)[0])
        legs += [("put", +1, k1), ("put", -1, k1 - width * S)]
    if structure in ("CCS", "IC"):
        k3 = float(om.strike_for_delta(S, t, r, q, vl, m, short_delta, "call", iv_markup=markup)[0])
        legs += [("call", +1, k3), ("call", -1, k3 + width * S)]
    if structure == "PUT":      # naked (cash-secured) put at delta
        k1 = float(om.strike_for_delta(S, t, r, q, vl, m, short_delta, "put", iv_markup=markup)[0])
        legs += [("put", +1, k1)]
    return legs


def simulate_path(mk: pd.DataFrame, d0: pd.Timestamp, expiry: pd.Timestamp, legs, mode: str, markup: float):
    days = mk.loc[d0:expiry]
    tau = (expiry - days.index).days.values.astype(float)
    S = days.spx.values
    r = days.rf.values
    q = days.q.values
    vl = days[["vix9d", "vix", "vix3m", "vix6m"]].values
    m = om.m_from_mode(days.m_skew.values, mode)
    V = np.zeros(len(days))
    spr = np.zeros(len(days))
    live = tau > 0
    for kind, sign, K in legs:
        p = np.zeros(len(days))
        if live.any():
            pl, _ = om.price(S[live], np.full(live.sum(), K), tau[live], r[live], q[live], vl[live], m[live], kind,
                             iv_markup=markup)
            p[live] = pl
        intrinsic = np.maximum(K - S, 0) if kind == "put" else np.maximum(S - K, 0)
        p[~live] = intrinsic[~live]
        V += sign * p
        s = om.quoted_spread(p, days.vix.values, days.index.year.values)
        spr += np.where(live, s, 0.0)
    return dict(dates=days.index, tau=tau, S=S, V=V, spr=spr, vix=days.vix.values)


def max_loss(legs, credit: float) -> float:
    puts = sorted([K for k, s, K in legs if k == "put"])
    calls = sorted([K for k, s, K in legs if k == "call"])
    wp = (puts[-1] - puts[0]) if len(puts) == 2 else 0.0
    wc = (calls[-1] - calls[0]) if len(calls) == 2 else 0.0
    if len(puts) == 1 and not calls:          # cash-secured put: max loss = strike - credit
        return puts[0] - credit
    return max(wp, wc) - credit


def manage(path: dict, legs, fill_frac: float, rule: str, tp: float = 0.5, stop_mult: float = 2.0,
           exit_dte: float = 21.0):
    """Apply costs and exit rules.  Returns dict with R (P&L / max loss), exit info and MTM path.
    rule: 'hold' | 'tp' | 'tp21' | 'dte21' | 'tp21stop'."""
    nleg = len(legs)
    V, spr, tau = path["V"], path["spr"], path["tau"]
    credit = V[0] - fill_frac * spr[0] - nleg * COMMISSION_PTS
    ml = max_loss(legs, credit)
    if credit <= 0 or ml <= 0:
        return None
    close_cost = np.where(tau > 0, V + fill_frac * spr + nleg * COMMISSION_PTS, V)
    pnl = credit - close_cost
    exit_i = len(V) - 1
    reason = "expiry"
    for i in range(1, len(V)):
        if rule in ("tp", "tp21", "tp21stop") and tau[i] > 0 and close_cost[i] <= (1 - tp) * credit:
            exit_i, reason = i, "take_profit"
            break
        if rule == "tp21stop" and tau[i] > 0 and pnl[i] <= -stop_mult * credit:
            exit_i, reason = i, "stop"
            break
        if rule in ("tp21", "dte21", "tp21stop") and tau[i] <= exit_dte and tau[i] > 0:
            exit_i, reason = i, "dte21"
            break
    R_path = pnl[: exit_i + 1] / ml
    return dict(R=float(pnl[exit_i] / ml), credit=float(credit), ml=float(ml), credit_over_ml=float(credit / ml),
                exit_date=path["dates"][exit_i], reason=reason, days_held=int((path["dates"][exit_i] - path["dates"][0]).days),
                min_R=float(R_path.min()), R_path=R_path, dates=path["dates"][: exit_i + 1],
                entry_cost_pts=float(fill_frac * spr[0] + nleg * COMMISSION_PTS),
                S0=float(path["S"][0]), S_exit=float(path["S"][exit_i]))
