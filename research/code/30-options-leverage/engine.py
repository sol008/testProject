"""Daily simulation of a weekly-decided, trend-filtered leveraged equity core, one vehicle at a time.

Timing: the decision is made on the last session of each week (Friday close) from that close's data, and
executed at the NEXT session's close (one email a week, orders placed the next day). Marks are daily closes.

Vehicles (all hold T-bills when the trend is down):
  bh       buy and hold the index (SPY = S&P 500 TR - 0.09%/yr fee); no trend filter
  margin   index ETF with Robinhood margin: shares worth L x equity; borrowing at Fed upper bound + tier
           spread; weekly rebalance only if exposure drifts outside +-10% of target; forced sale when equity
           falls below 30% of the position (house maintenance)
  letf     daily-reset L x fund: L*r_TR - (L-1)*(T-bill+0.40%)/252 - 0.90%/252 (validated in track 04)
  calls    long calls at target delta and tenor, sized so delta x notional = L x equity, rest in T-bills;
           rolled when older than `hold` days, when exposure drifts outside +-25% of target, or with < 21 days left
  spread   call debit spread (long delta d, short delta ds, same expiry), sized on net delta; rolled as calls
  barbell  ATM calls costing f x equity at each roll, rest in T-bills (the "90/10" at f = 10%)
  pmcc     `calls` plus a short ~30-day call (delta ds) on the same number of contracts, re-sold each month

Options are priced with Black-Scholes on the track-04 surface: ATM from VIX (1m) and VIX1Y (1y) interpolated in
total variance, the real 2026-09-28 SPX smile (skew_scale shrinks it for NDX), financing at the Treasury curve
plus BOX_SPREAD_OVER_TSY. Buys pay mid*(1+hs), sells receive mid*(1-hs); cash-settled at expiry (XSP-like).
"""
from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from common30 import (BOX_SPREAD_OVER_TSY, ETF_COST, LETF_ER, LETF_SPREAD, MAINT, RH_MARGIN_SPREAD, bs_call,
                      bs_call_delta, ninv)

SPY_ER = 0.000945


class FastSurface:
    """Bilinear lookup on track 04's smile grids (much faster than RegularGridInterpolator per point)."""

    def __init__(self, surf, a1m, a1y, skew_mode, skew_scale=1.0, markup=0.0):
        self.kg = list(surf.kg)
        self.tg = list(surf.tg)
        self.G = {m: surf.grids[m].values for m in ("ratio", "abs")}
        self.a1m, self.a1y, self.mode, self.kappa, self.markup = a1m, a1y, skew_mode, skew_scale, markup

    def _shape(self, mode, k, td):
        kg, tg, G = self.kg, self.tg, self.G[mode]
        k = min(max(k, kg[0]), kg[-1])
        td = min(max(td, tg[0]), tg[-1])
        i = min(max(bisect.bisect_right(kg, k) - 1, 0), len(kg) - 2)
        j = min(max(bisect.bisect_right(tg, td) - 1, 0), len(tg) - 2)
        wk = (k - kg[i]) / (kg[i + 1] - kg[i])
        wt = (td - tg[j]) / (tg[j + 1] - tg[j])
        return ((1 - wk) * (1 - wt) * G[i, j] + wk * (1 - wt) * G[i + 1, j]
                + (1 - wk) * wt * G[i, j + 1] + wk * wt * G[i + 1, j + 1])

    def atm(self, vol1m, vol1y, tau):
        s1m, s1y = self.a1m * vol1m / 100.0, self.a1y * vol1y / 100.0
        t1 = 30 / 365.0
        if tau <= t1:
            return s1m
        if tau >= 1.0:
            return s1y
        w1, w2 = s1m * s1m * t1, s1y * s1y
        return math.sqrt((w1 + (w2 - w1) * (tau - t1) / (1.0 - t1)) / tau)

    def iv(self, vol1m, vol1y, m, tau):
        a = self.atm(vol1m, vol1y, tau)
        k, td = math.log(m), tau * 365.0
        ratio = 1.0 + self.kappa * (self._shape("ratio", k, td) - 1.0)
        absd = self.kappa * self._shape("abs", k, td)
        if self.mode == "ratio":
            v = a * ratio
        elif self.mode == "abs":
            v = a + absd
        else:
            v = 0.5 * (a * ratio + a + absd)
        return max(v + self.markup / 100.0, 0.03)


@dataclass
class Leg:
    n: float            # contracts per index unit (signed: + long, - short)
    K: float
    expiry: pd.Timestamp
    role: str           # "long" / "short"
    opened: pd.Timestamp
    value: float = 0.0
    delta: float = 0.0


@dataclass
class Params:
    vehicle: str
    L: float = 2.0
    delta: float = 0.80
    tenor: int = 182
    hold: int = 42
    band: float = 0.25
    f: float = 0.10                 # barbell premium fraction
    ds: float = 0.25                # short-leg delta (spread, pmcc)
    short_tenor: int = 35           # pmcc short leg tenor
    hs: float = 0.004               # half-spread, fraction of mid, long legs (XSP-like quotes)
    hs_short: float = 0.015         # half-spread for short OTM legs
    margin_tier: str = "100k-1m"
    min_left: int = 21              # roll when fewer calendar days than this remain
    mny: float = 0.0                # if > 0: strike = mny x spot and 1 unit of index per unit of equity (PPUT replica)
    trend: bool = True
    underlying: str = "SPX"
    fee_per_contract_frac: float = 0.0   # per-contract fees as a fraction of the index level (ignored: tiny)
    label: str = ""
    extra: dict = field(default_factory=dict)


class Market:
    def __init__(self, panel: pd.DataFrame, underlying: str, surf_fast: FastSurface):
        p = panel
        self.idx = p.index
        if underlying == "SPX":
            self.S = p.spx.values
            self.rtr = p.rtr_spx.fillna(0).values
            self.q = p.q.values
            self.v1m = p.vix.values
            self.v1y = p.vix1y_filled.values
            self.ma = p.ma200_spx.values
        else:
            self.S = p.ndx.values
            self.rtr = p.rtr_ndx.fillna(0).values
            self.q = p.q_ndx.values
            self.v1m = p.vxn.values
            self.v1y = (p.vix1y_filled * p.vxn / p.vix).values
            self.ma = p.ma200_ndx.values
        self.r3m = p.r3m.values
        self.r1y = p.r1y.values
        self.fed = p.fed_upper.values
        self.surf = surf_fast
        dates = pd.Series(self.idx, index=self.idx)
        wk = dates.groupby([dates.index.isocalendar().year.values, dates.index.isocalendar().week.values]).max()
        self.decision = np.isin(self.idx, pd.DatetimeIndex(wk.values))
        self.dt = np.r_[0.0, np.diff(self.idx.values).astype("timedelta64[D]").astype(float)] / 365.0

    def r_opt(self, i, tau):
        w = min(max((tau - 0.25) / 0.75, 0.0), 1.0)
        return self.r3m[i] + (self.r1y[i] - self.r3m[i]) * w + BOX_SPREAD_OVER_TSY

    def price(self, i, K, expiry):
        tau = (expiry - self.idx[i]).days / 365.0
        S = self.S[i]
        if tau <= 0:
            return max(S - K, 0.0), (1.0 if S > K else 0.0)
        r, q = self.r_opt(i, tau), self.q[i]
        F = S * math.exp((r - q) * tau)
        sig = self.surf.iv(self.v1m[i], self.v1y[i], K / F, tau)
        return bs_call(S, K, tau, r, q, sig), bs_call_delta(S, K, tau, r, q, sig)

    def strike_for_delta(self, i, target, tau_days):
        tau = tau_days / 365.0
        S, r, q = self.S[i], self.r_opt(i, tau), self.q[i]
        F = S * math.exp((r - q) * tau)
        sig = self.surf.atm(self.v1m[i], self.v1y[i], tau)
        x = ninv(min(max(target * math.exp(q * tau), 1e-4), 1 - 1e-4))
        K = F
        for _ in range(6):
            K = F * math.exp(-sig * math.sqrt(tau) * x + 0.5 * sig * sig * tau)
            sig = self.surf.iv(self.v1m[i], self.v1y[i], K / F, tau)
        return K


def simulate(mkt: Market, P: Params, start: str, end: str) -> dict:
    idx = mkt.idx
    i0 = int(idx.searchsorted(pd.Timestamp(start)))
    i1 = int(idx.searchsorted(pd.Timestamp(end), side="right")) - 1
    S, rtr, r3m, fed, dtv = mkt.S, mkt.rtr, mkt.r3m, mkt.fed, mkt.dt
    trend_up = (S > mkt.ma) if P.trend else np.ones(len(S), bool)
    margin_spread = RH_MARGIN_SPREAD[P.margin_tier]
    cash, units_val, letf_val = 1.0, 0.0, 0.0
    legs: list[Leg] = []
    eq = np.full(i1 - i0 + 1, np.nan)
    expo = np.zeros(i1 - i0 + 1)
    orders, emails, rolls, margin_calls, cost_paid = 0, 0, 0, 0, 0.0
    pending = False
    tcost_long, tcost_short = P.hs, P.hs_short

    def legs_value_delta(i):
        v, d = 0.0, 0.0
        for lg in legs:
            px, de = mkt.price(i, lg.K, lg.expiry)
            lg.value, lg.delta = px, de
            v += lg.n * px
            d += lg.n * de * S[i]
        return v, d

    def close_legs(i, which=None):
        nonlocal cash, orders, cost_paid
        keep = []
        for lg in legs:
            if which is None or lg.role == which:
                px = lg.value
                hs = tcost_long if lg.n > 0 else tcost_short
                if (lg.expiry - idx[i]).days <= 0:
                    cash += lg.n * px                 # cash settlement, no spread
                else:
                    cash += lg.n * px * (1 - hs) if lg.n > 0 else lg.n * px * (1 + hs)
                    cost_paid += abs(lg.n) * px * hs
                    orders += 1
            else:
                keep.append(lg)
        legs[:] = keep

    def open_leg(i, n, K, expiry, role):
        nonlocal cash, orders, cost_paid
        px, de = mkt.price(i, K, expiry)
        hs = tcost_long if n > 0 else tcost_short
        cash -= n * px * (1 + hs) if n > 0 else n * px * (1 - hs)
        cost_paid += abs(n) * px * hs
        orders += 1
        legs.append(Leg(n, K, expiry, role, idx[i], px, de))

    if P.vehicle == "bh":
        units_val, cash = 1.0 - ETF_COST, 0.0
    for t, i in enumerate(range(i0, i1 + 1)):
        dt = dtv[i] if t > 0 else 0.0
        # 1. carry: cash interest (margin debit at Fed upper + spread), ETF / LETF returns
        if t > 0:
            rate = r3m[i - 1] if cash >= 0 else fed[i - 1] + margin_spread
            cash *= 1 + rate * dt
            if units_val:
                units_val *= 1 + rtr[i] - SPY_ER / 252
            if letf_val:
                L = P.L
                letf_val *= max(1 + L * rtr[i] - (L - 1) * (r3m[i - 1] + LETF_SPREAD) * dt - LETF_ER * dt, 0.0)
        # 2. options: settle expired legs, mark the rest
        if legs:
            for lg in [lg for lg in legs if (lg.expiry - idx[i]).days <= 0]:
                cash += lg.n * max(S[i] - lg.K, 0.0)
                legs.remove(lg)
            lv, ld = legs_value_delta(i)
        else:
            lv, ld = 0.0, 0.0
        equity = cash + units_val + letf_val + lv
        # 3. margin maintenance (house 30%): forced sale at today's close back to 40% equity
        if P.vehicle == "margin" and units_val > 0 and equity < MAINT * units_val:
            target_pos = equity / 0.40
            sell = units_val - target_pos
            units_val -= sell
            cash += sell * (1 - ETF_COST)
            margin_calls += 1
            orders += 1
            equity = cash + units_val + letf_val + lv
        # 4. execute last week's decision at today's close
        if pending:
            pending = False
            up = trend_up[i - 1]
            e_prev = expo[t - 1] if t > 0 else 0.0
            did = orders
            v = P.vehicle
            if v in ("bh",):
                if units_val == 0 and cash > 0:
                    units_val, cash = cash * (1 - ETF_COST), 0.0
                    orders += 1
            elif v == "margin":
                target = P.L * equity if up else 0.0
                cur = units_val
                if (target == 0 and cur > 0) or (target > 0 and abs(cur / target - 1) > 0.10):
                    trade = target - cur
                    cash -= trade + abs(trade) * ETF_COST
                    cost_paid += abs(trade) * ETF_COST
                    units_val = target
                    orders += 1
            elif v == "letf":
                if up and letf_val == 0:
                    letf_val = equity * (1 - ETF_COST)
                    cash -= equity
                    orders += 1
                elif not up and letf_val > 0:
                    cash += letf_val * (1 - ETF_COST)
                    letf_val = 0.0
                    orders += 1
            else:
                longs = [lg for lg in legs if lg.role == "long"]
                if not up:
                    if legs:
                        close_legs(i)
                        rolls += 1
                else:
                    need = not longs
                    if longs:
                        lg0 = longs[0]
                        age = (idx[i] - lg0.opened).days
                        left = (lg0.expiry - idx[i]).days
                        if age >= P.hold or left < P.min_left:
                            need = True
                        elif v in ("calls", "spread", "pmcc") and not (
                                P.L * (1 - P.band) <= e_prev <= P.L * (1 + P.band)):
                            need = True
                    if need:
                        which = "long" if v == "pmcc" else None
                        close_legs(i, which)
                        if v == "spread":
                            close_legs(i)
                        eq_now = cash + units_val + letf_val + sum(lg.n * lg.value for lg in legs)
                        expiry = idx[i] + pd.Timedelta(days=P.tenor)
                        if v == "barbell":
                            K = mkt.strike_for_delta(i, 0.5, P.tenor)
                            px, de = mkt.price(i, K, expiry)
                            n = P.f * eq_now / (px * (1 + tcost_long))
                            open_leg(i, n, K, expiry, "long")
                        else:
                            K = (P.mny * S[i]) if P.mny > 0 else mkt.strike_for_delta(i, P.delta, P.tenor)
                            px, de = mkt.price(i, K, expiry)
                            net_delta = de - P.ds if v == "pmcc" else de
                            if P.mny > 0:
                                net_delta = 1.0
                            if v == "spread":
                                K2 = mkt.strike_for_delta(i, P.ds, P.tenor)
                                px2, de2 = mkt.price(i, K2, expiry)
                                net_delta = de - de2
                            n = P.L * eq_now / (net_delta * S[i])
                            cost = n * px * (1 + tcost_long)
                            if v == "spread":
                                cost -= n * px2 * (1 - tcost_short)
                            if cost > 0.98 * eq_now:          # never spend more than the book (no margin)
                                n *= 0.98 * eq_now / cost
                            open_leg(i, n, K, expiry, "long")
                            if v == "spread":
                                open_leg(i, -n, K2, expiry, "short")
                        rolls += 1
                    if v == "pmcc":
                        shorts = [lg for lg in legs if lg.role == "short"]
                        n_long = sum(lg.n for lg in legs if lg.role == "long")
                        if not shorts and n_long > 0:
                            exp_s = idx[i] + pd.Timedelta(days=P.short_tenor)
                            K2 = mkt.strike_for_delta(i, P.ds, P.short_tenor)
                            open_leg(i, -n_long, K2, exp_s, "short")
            if orders > did:
                emails += 1
            lv, ld = legs_value_delta(i) if legs else (0.0, 0.0)
            equity = cash + units_val + letf_val + lv
        if mkt.decision[i]:
            pending = True
        eq[t] = equity
        e = (units_val + P.L * letf_val + ld) / equity if equity > 0 else 0.0
        expo[t] = e
        if equity <= 0:
            eq[t:] = 0.0
            break
    dates = idx[i0:i1 + 1]
    return dict(equity=pd.Series(eq, index=dates), exposure=pd.Series(expo, index=dates), orders=orders,
                emails=emails, rolls=rolls, margin_calls=margin_calls, cost_paid=cost_paid)


def leverage_cost(res: dict, mkt: Market, start, end) -> dict:
    """Annual carry cost vs a frictionless position with the same daily exposure financed at T-bills."""
    eq, ex = res["equity"], res["exposure"]
    i0 = int(mkt.idx.searchsorted(eq.index[0]))
    rtr = pd.Series(mkt.rtr[i0:i0 + len(eq)], index=eq.index)
    rf = pd.Series(mkt.r3m[i0:i0 + len(eq)], index=eq.index).shift(1)
    dt = pd.Series(mkt.dt[i0:i0 + len(eq)], index=eq.index)
    rb = eq.pct_change()
    e1 = ex.shift(1)
    c = (e1 * rtr - (e1 - 1) * rf * dt - rb)
    inv = e1 > 0.05
    yrs_inv = dt[inv].sum()
    total = c[inv].sum()
    mean_e = float(e1[inv].mean()) if inv.any() else np.nan
    return dict(cost_per_yr_invested=total / yrs_inv if yrs_inv > 0 else np.nan, mean_exposure_invested=mean_e,
                time_invested=float(inv.mean()),
                cost_per_unit_extra=(total / yrs_inv) / (mean_e - 1) if mean_e and mean_e > 1.05 else np.nan)
