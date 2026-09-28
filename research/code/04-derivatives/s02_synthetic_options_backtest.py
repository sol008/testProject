"""Synthetic (Black-Scholes-priced) back-test of BUYING S&P 500 options.

*** APPROXIMATION - READ BEFORE USING THE NUMBERS ***
No free historical option-price database is available here, so option prices are
MODELLED, not observed:
  * 1-month ATM IV          = a1m * VIX_t
  * 1-year  ATM IV          = a1y * VIX1Y_t  (VIX1Y exists from 2007; before that a
                              regression-predicted VIX1Y from VIX and its 1y mean)
  * other maturities        = linear interpolation in total variance (1m..1y);
                              beyond 1y the snapshot's ATM term slope is applied
  * skew (strike dependence)= today's (2026-09-28) SPX surface shape from the live
                              option chain (s06), applied proportionally
                              ("ratio") or in vol points ("abs"); base = average
  * premium paid            = model mid * (1 + h); early sale at mid * (1 - h);
                              SPX is European & cash-settled -> no cost at expiry
Calibration from the 2026-09-28 SPX chain: ATM30d/VIX = 0.80, ATM1y/VIX1Y = 0.74.
Because the pricing is an assumption, every result is also reported as a
"break-even IV markup": how many vol points the entry IV could be raised before
the average trade stops making money.  Treat conclusions as directional.

Strategies (pre-specified; all reported, none cherry-picked)
  A) calls: 1y ATM / 5% / 10% OTM, 3m 5%/10% OTM, 2y 10%/20% OTM, bought on the first
     trading day of each month when condition X holds; exits: hold to expiry |
     take profit at 3x cost | sell at half the tenor.
  B) puts: 1y 5%/10% OTM, 3m 10%/20% OTM under complacency/trend/credit conditions.
  C) 1-month ATM straddles bought daily under VRP screens (monetises VRP directly).
  D) delta-hedged P&L of A/B (isolates the volatility premium from the equity drift)
  E) small portfolio simulation: f% of equity into each monthly option purchase.
In-sample: entries 1990-2007.  Out-of-sample: entries 2008-2025.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm

from common import DATA_DIR, OUT, bs_delta, bs_price, cagr, fred, max_drawdown, yf_close
from s01_vrp_analysis import build_panel

SNAP_FILE = DATA_DIR / "chain_raw_20260928.csv"
SNAP_VIX, SNAP_VIX1Y = 16.05, 21.64          # closes on 2026-09-28 (snapshot day)
IS_END, OOS_START = "2007-12-31", "2008-01-01"


# ---------------------------------------------------------------------------
# 1. Vol-surface model
# ---------------------------------------------------------------------------
class Surface:
    def __init__(self, raw: pd.DataFrame):
        s = raw[raw.ticker == "^SPX"].copy()
        s = s[((s.kind == "put") & (s.moneyness < 1.0)) | ((s.kind == "call") & (s.moneyness >= 1.0))]
        s = s[(s.moneyness > 0.55) & (s.moneyness < 1.5) & s.iv_mid.notna() & (s.spread_pct_mid < 0.5)]
        self.days, self.coefs, self.kr = [], [], []
        for days, g in s.groupby("days"):
            if len(g) < 12:
                continue
            k = np.log(g.moneyness.values)
            w = 1.0 / np.clip(g.spread_pct_mid.values, 0.003, 0.5)
            c = np.polyfit(k, g.iv_mid.values, 4, w=np.sqrt(w))
            self.days.append(days)
            self.coefs.append(c)
            self.kr.append((k.min(), k.max()))
        self.days = np.array(self.days)
        self.atm = np.array([np.polyval(c, 0.0) for c in self.coefs])
        self.build_grid()

    def _curve(self, i, k):
        lo, hi = self.kr[i]
        return np.polyval(self.coefs[i], np.clip(k, lo, hi))

    def _shape_scalar(self, kv, td, mode):
        if td <= self.days[0]:
            kv_eff = kv * np.sqrt(self.days[0] / max(td, 1.0))   # skew steepens ~1/sqrt(T)
            v = [self._curve(0, kv_eff), self.atm[0]]
        elif td >= self.days[-1]:
            v = [self._curve(len(self.days) - 1, kv), self.atm[-1]]
        else:
            j = np.searchsorted(self.days, td)
            w = (td - self.days[j - 1]) / (self.days[j] - self.days[j - 1])
            a = self._curve(j - 1, kv); b = self._curve(j, kv)
            v = [(1 - w) * a + w * b, (1 - w) * self.atm[j - 1] + w * self.atm[j]]
        return v[0] / v[1] if mode == "ratio" else v[0] - v[1]

    def build_grid(self):
        from scipy.interpolate import RegularGridInterpolator
        self.kg = np.linspace(-1.2, 0.8, 401)
        self.tg = np.array([1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 63, 94, 130, 184, 230, 275, 320, 367, 420,
                            480, 560, 640, 730, 809])
        self.grids = {}
        for mode in ("ratio", "abs"):
            g = np.array([[self._shape_scalar(k, t, mode) for t in self.tg] for k in self.kg])
            self.grids[mode] = RegularGridInterpolator((self.kg, self.tg), g, bounds_error=False, fill_value=None)

    def shape(self, m, tau_years, mode="ratio"):
        """IV(m,tau)/ATM(tau) ('ratio') or IV-ATM in vol ('abs') from snapshot, m=K/F."""
        k = np.clip(np.log(np.atleast_1d(np.asarray(m, float))), self.kg[0], self.kg[-1])
        td = np.clip(np.atleast_1d(np.asarray(tau_years, float)) * 365.0, self.tg[0], self.tg[-1])
        k, td = np.broadcast_arrays(k, td)
        pts = np.column_stack([k.ravel(), td.ravel()])
        return self.grids[mode](pts).reshape(k.shape)

    def atm_at(self, tau_years):
        return np.interp(np.asarray(tau_years) * 365.0, self.days, self.atm)


def vix1y_model(panel: pd.DataFrame):
    """Regress log VIX1Y on log VIX and log 252d-mean VIX (2007+), fill pre-2007."""
    d = panel[["vix", "vix1y"]].copy()
    d["lv"] = np.log(d.vix)
    d["lvm"] = np.log(d.vix.rolling(252, min_periods=20).mean())
    fit = d.dropna()
    X = sm.add_constant(fit[["lv", "lvm"]])
    m = sm.OLS(np.log(fit.vix1y), X).fit()
    Xall = sm.add_constant(d[["lv", "lvm"]].dropna())
    pred = np.exp(m.predict(Xall))
    out = d.vix1y.copy().fillna(pred)
    print(f"VIX1Y model (2007-2026 fit): R2={m.rsquared:.3f} coefs={m.params.round(3).to_dict()} "
          f"resid sd (log)={np.sqrt(m.scale):.3f}")
    return out, m


class IVModel:
    def __init__(self, panel, surface: Surface, a1m, a1y, skew_mode="avg", markup=0.0):
        self.p = panel
        self.s = surface
        self.a1m, self.a1y, self.mode, self.markup = a1m, a1y, skew_mode, markup
        self.v1y = panel["vix1y_filled"]
        self.long_slope = lambda tau: np.where(
            tau > 1.0, surface.atm_at(np.minimum(tau, 809 / 365)) / surface.atm_at(1.0), 1.0)

    def atm_vec(self, vix, v1y, tau):
        s1m = self.a1m * np.asarray(vix, float) / 100.0
        s1y = self.a1y * np.asarray(v1y, float) / 100.0
        t1, t2 = 30 / 365.0, 1.0
        tau = np.asarray(tau, float)
        w1, w2 = s1m ** 2 * t1, s1y ** 2 * t2
        tv = np.where(tau <= t1, s1m ** 2 * tau,
                      np.where(tau >= t2, (s1y * self.long_slope(tau)) ** 2 * tau,
                               w1 + (w2 - w1) * (tau - t1) / (t2 - t1)))
        return np.sqrt(tv / np.maximum(tau, 1e-6))

    def iv_vec(self, vix, v1y, m, tau):
        atm = self.atm_vec(vix, v1y, tau)
        if self.mode == "ratio":
            v = atm * self.s.shape(m, tau, "ratio")
        elif self.mode == "abs":
            v = atm + self.s.shape(m, tau, "abs")
        else:
            v = 0.5 * (atm * self.s.shape(m, tau, "ratio") + atm + self.s.shape(m, tau, "abs"))
        return np.maximum(v + self.markup / 100.0, 0.03)

    def iv(self, date, m, tau):
        return self.iv_vec(self.p.at[date, "vix"], self.v1y.at[date], m, tau)


# ---------------------------------------------------------------------------
# 2. Market data
# ---------------------------------------------------------------------------
def load_market():
    panel = build_panel()
    panel["vix"] = panel["vix"].ffill()          # 4 missing CBOE prints (1991-2000) -> carry forward
    tr = yf_close("^SP500TR", start="1988-01-01")
    divy = (tr / tr.shift(252)) / (panel.spx / panel.spx.shift(252)) - 1
    panel["q"] = divy.reindex(panel.index).clip(0.0, 0.06).ffill().fillna(0.03)
    panel["r1y"] = (fred("DGS1") / 100).reindex(panel.index).ffill()
    panel["r3m"] = (fred("DTB3") / 100).reindex(panel.index).ffill()
    panel["vix1y_filled"], _ = vix1y_model(panel)
    panel["vix1y_filled"] = panel["vix1y_filled"].ffill().bfill()
    panel["spxtr"] = tr.reindex(panel.index)
    return panel


def rates_for(panel, dates, tau):
    r3 = panel.r3m.loc[dates].values
    r1 = panel.r1y.loc[dates].values
    return r3 + (r1 - r3) * np.clip((np.asarray(tau) - 0.25) / 0.75, 0.0, 1.0)


# ---------------------------------------------------------------------------
# 3. Option back-test engine
# ---------------------------------------------------------------------------
def month_starts(idx, start, end):
    s = pd.Series(idx, index=idx).loc[start:end]
    return list(s.groupby([s.index.year, s.index.month]).first())


def run_options(panel, ivm: IVModel, kind, mny, tenor_days=365, h=0.02, tp_mult=3.0, entries=None,
                keep_marks=False):
    idx = panel.index
    spx = panel.spx
    rows, marks = [], {}
    for t0 in entries:
        expiry_target = t0 + pd.Timedelta(days=tenor_days)
        if expiry_target > idx[-1]:
            continue
        j_exp = idx.searchsorted(expiry_target, side="right") - 1
        t_exp = idx[j_exp]
        S0 = spx.at[t0]
        K = mny * S0
        T = (expiry_target - t0).days / 365.0
        r0 = float(rates_for(panel, [t0], T)[0])
        q0 = panel.at[t0, "q"]
        F0 = S0 * np.exp((r0 - q0) * T)
        iv0 = float(np.ravel(ivm.iv(t0, K / F0, T))[0])
        p0 = float(bs_price(S0, K, T, r0, q0, iv0, kind))
        cost = p0 * (1 + h)
        ST = spx.iloc[j_exp]
        payoff = max(ST - K, 0.0) if kind == "call" else max(K - ST, 0.0)
        R_hold = payoff / cost - 1
        j0 = idx.get_loc(t0)
        path = idx[j0: j_exp + 1]                      # includes entry day
        S = spx.loc[path].values
        tau = np.maximum(np.array([(expiry_target - d).days / 365.0 for d in path]), 1e-4)
        r = rates_for(panel, path, np.maximum(tau, 0.02))
        q = panel.q.loc[path].values
        F = S * np.exp((r - q) * tau)
        ivs = ivm.iv_vec(panel.vix.loc[path].values, ivm.v1y.loc[path].values, K / F, tau)
        val = bs_price(S, K, tau, r, q, ivs, kind)
        val[0] = p0
        val[-1] = payoff
        sell = val * (1 - h)
        sell[-1] = payoff                              # cash settlement at expiry
        hit = np.where(sell[1:] >= tp_mult * cost)[0]
        R_tp = sell[1:][hit[0]] / cost - 1 if len(hit) else R_hold
        jt = min(np.searchsorted(path, t0 + pd.Timedelta(days=tenor_days // 2)), len(path) - 1)
        R_half = sell[jt] / cost - 1
        # delta-hedged P&L (Bakshi-Kapadia style, daily rebalanced, model deltas)
        delta = bs_delta(S[:-1], K, tau[:-1], r[:-1], q[:-1], ivs[:-1], kind)
        dt = np.diff(np.array([(d - t0).days for d in path])) / 365.0
        dS = np.diff(S)
        hedge = np.sum(delta * (dS + q[:-1] * S[:-1] * dt))
        fin = np.sum(r[:-1] * (val[:-1] - delta * S[:-1]) * dt)
        dh = payoff - cost - hedge - fin
        rows.append(dict(entry=t0, expiry=t_exp, T=T, kind=kind, mny=mny, tenor=tenor_days, S0=S0, K=K,
                         iv0=iv0, r0=r0, q0=q0, prem_pct_spot=p0 / S0, cost=cost, ST=ST, payoff=payoff,
                         R_hold=R_hold, R_tp=R_tp, R_half=R_half, max_mult=np.max(sell[1:]) / cost,
                         dh_pct_cost=dh / cost, dh_bp_spot=1e4 * dh / S0,
                         realized_vol=np.sqrt(252 * np.mean(np.diff(np.log(S)) ** 2))))
        if keep_marks:
            marks[t0] = pd.Series(val / cost, index=path)   # value per $ of premium paid
    return pd.DataFrame(rows), marks


def nw_tstat(x, lags=11):
    x = pd.Series(x).dropna()
    if len(x) < 5 or x.std() == 0:
        return np.nan
    m = sm.OLS(x.values, np.ones(len(x))).fit(cov_type="HAC", cov_kwds={"maxlags": lags})
    return float(m.tvalues[0])


def kelly(R):
    R = np.asarray(R)
    fs = np.linspace(0.0, 0.999, 1000)
    g = np.array([np.mean(np.log1p(f * R)) for f in fs])
    i = int(np.nanargmax(g))
    return fs[i], g[i]


def summarise(tr: pd.DataFrame, col="R_hold", lags=11):
    R = tr[col].dropna().values
    if len(R) == 0:
        return {}
    fstar, gstar = kelly(R)
    return dict(n=len(R), hit=(R > 0).mean(), mean=R.mean(), median=np.median(R),
                t_nw=nw_tstat(R, lags), p_gt_100=(R > 1).mean(), p_gt_300=(R > 3).mean(),
                p_total_loss=(R <= -0.99).mean(), best=R.max(), worst=R.min(),
                kelly_f=fstar, kelly_growth_per_trade=gstar,
                mean_dh_pct_cost=tr.dh_pct_cost.mean(), t_dh=nw_tstat(tr.dh_pct_cost, lags),
                mean_dh_bp_spot=tr.dh_bp_spot.mean())


def breakeven_markup(trades: pd.DataFrame, kind, h):
    """Vol points that could be added to the entry IV before mean hold-to-expiry R = 0."""
    if len(trades) == 0:
        return np.nan
    S0, K, r0, q0, T = (trades[c].values for c in ("S0", "K", "r0", "q0", "T"))
    iv0, pay = trades.iv0.values, trades.payoff.values

    def meanR(dv):
        p = bs_price(S0, K, T, r0, q0, np.maximum(iv0 + dv / 100, 0.01), kind)
        return np.mean(pay / (p * (1 + h))) - 1

    lo, hi = -15.0, 40.0
    if meanR(lo) < 0:
        return lo
    if meanR(hi) > 0:
        return hi
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if meanR(mid) > 0 else (lo, mid)
    return 0.5 * (lo + hi)


def conditions(panel):
    p = panel
    c = {
        "always": pd.Series(True, index=p.index),
        "VIX pct252<=20%": p.vix_pct252 <= 0.20,
        "VIX<15": p.vix < 15,
        "SPX>MA200": p.trend200 > 0,
        "SPX<MA200": p.trend200 < 0,
        "SPX<MA200 & VIX>25": (p.trend200 < 0) & (p.vix > 25),
        "VIX<RV_past21": p.iv_minus_past < 0,
        "VIX<13 & SPX>MA200": (p.vix < 13) & (p.trend200 > 0),
        "dBAA21>+0.10": p.dbaa21 > 0.10,
        "VIX/VIX3M<0.85 (2006+)": p.ts3m < 0.85,
        "VIX/VIX3M>1 (2006+)": p.ts3m > 1.0,
    }
    return {k: v.fillna(False) for k, v in c.items()}


# ---------------------------------------------------------------------------
# 4. Portfolio simulation (monthly marks)
# ---------------------------------------------------------------------------
def portfolio(panel, trades, marks, cond_mask, f, start="1990-01-01", end=None):
    """Each month-start: if condition true, spend f*equity on the option; rest in T-bills."""
    idx = panel.index
    end = end or trades.expiry.max()
    days = idx[(idx >= pd.Timestamp(start)) & (idx <= end)]
    msd = set(month_starts(days, days[0], days[-1]))
    cash = 1.0
    open_pos = []            # (units_of_premium_dollars, entry)
    eq = []
    prev = days[0]
    tmap = trades.set_index("entry")
    for d in days:
        cash *= 1 + panel.r3m.at[prev] * (d - prev).days / 365.0
        prev = d
        # settle expiries
        still = []
        for units, t0 in open_pos:
            m = marks[t0]
            if d >= m.index[-1]:
                cash += units * m.iloc[-1]
            else:
                still.append((units, t0))
        open_pos = still
        pos_val = sum(units * marks[t0].get(d, np.nan) for units, t0 in open_pos)
        equity = cash + pos_val
        if d in msd and d in tmap.index and bool(cond_mask.get(d, False)):
            spend = f * equity
            cash -= spend
            open_pos.append((spend, d))         # marks are per $ premium (incl. spread)
        eq.append((d, equity))
    e = pd.Series(dict(eq))
    return e


def main():
    panel = load_market()
    raw = pd.read_csv(SNAP_FILE)
    surf = Surface(raw)
    a1m_snap = float(surf.atm_at(30 / 365)) / (SNAP_VIX / 100)
    a1y_snap = float(surf.atm_at(1.0)) / (SNAP_VIX1Y / 100)
    print(f"snapshot ATM 30d={float(surf.atm_at(30/365)):.4f} (a1m={a1m_snap:.3f}); "
          f"ATM 1y={float(surf.atm_at(1.0)):.4f} (a1y={a1y_snap:.3f}); ATM 809d={float(surf.atm_at(809/365)):.4f}")
    for m in (0.8, 0.9, 0.95, 1.05, 1.1, 1.2):
        print(f"  shape m={m}: 1y ratio={surf.shape(m, 1.0,'ratio')[0]:.3f} abs={surf.shape(m,1.0,'abs')[0]:+.4f}"
              f" | 3m ratio={surf.shape(m, 0.25,'ratio')[0]:.3f} | 30d ratio={surf.shape(m, 30/365,'ratio')[0]:.3f}")

    variants = {
        "base": dict(a1m=0.88, a1y=0.80, skew_mode="avg", h=0.02),
        "cheap": dict(a1m=a1m_snap, a1y=a1y_snap, skew_mode="ratio", h=0.02),
        "dear": dict(a1m=0.95, a1y=0.85, skew_mode="abs", h=0.05),
    }
    conds = conditions(panel)
    entries_all = month_starts(panel.index, "1990-01-01", "2025-09-30")
    instruments = [("call", 1.00, 365), ("call", 1.05, 365), ("call", 1.10, 365),
                   ("call", 1.05, 91), ("call", 1.10, 91), ("call", 1.10, 730), ("call", 1.20, 730),
                   ("put", 0.95, 365), ("put", 0.90, 365), ("put", 0.90, 91), ("put", 0.80, 91)]
    cond_for = {
        "call": ["always", "VIX pct252<=20%", "VIX<15", "SPX>MA200", "SPX<MA200 & VIX>25", "VIX<RV_past21",
                 "VIX/VIX3M>1 (2006+)"],
        "put": ["always", "VIX pct252<=20%", "VIX<13 & SPX>MA200", "SPX<MA200", "dBAA21>+0.10",
                "VIX/VIX3M<0.85 (2006+)", "VIX<RV_past21"],
    }
    all_rows, all_trades, keep = [], [], {}
    for vname, v in variants.items():
        ivm = IVModel(panel, surf, v["a1m"], v["a1y"], v["skew_mode"])
        for kind, mny, ten in instruments:
            tr, marks = run_options(panel, ivm, kind, mny, tenor_days=ten, h=v["h"], entries=entries_all,
                                    keep_marks=(vname == "base"))
            tr["variant"] = vname
            all_trades.append(tr)
            if vname == "base":
                keep[(kind, mny, ten)] = (tr, marks)
            lags = max(int(round(ten / 30.4)) - 1, 1)
            for cname in cond_for[kind]:
                cm = conds[cname]
                sel = tr[tr.entry.map(lambda d: bool(cm.get(d, False)))]
                for period, sub in [("IS 1990-2007", sel[sel.entry <= IS_END]),
                                    ("OOS 2008-2025", sel[sel.entry >= OOS_START]),
                                    ("ALL", sel)]:
                    if len(sub) == 0:
                        continue
                    for exit_rule, col in [("hold", "R_hold"), ("tp3x", "R_tp"), ("half", "R_half")]:
                        s = summarise(sub, col, lags)
                        s.update(variant=vname, kind=kind, mny=mny, tenor=ten, cond=cname, period=period,
                                 exit=exit_rule, mean_iv0=sub.iv0.mean(), mean_prem_pct_spot=sub.prem_pct_spot.mean(),
                                 mean_realized_vol=sub.realized_vol.mean())
                        if exit_rule == "hold":
                            s["breakeven_iv_markup_volpts"] = breakeven_markup(sub, kind, v["h"])
                        all_rows.append(s)
    res = pd.DataFrame(all_rows)
    front = ["variant", "kind", "mny", "tenor", "cond", "period", "exit", "n", "hit", "mean", "median", "t_nw"]
    res = res[front + [c for c in res.columns if c not in front]]
    res.to_csv(OUT / "options_backtest_summary.csv", index=False, float_format="%.4f")
    pd.concat(all_trades).to_csv(OUT / "options_backtest_trades.csv.gz", index=False, compression="gzip",
                                 float_format="%.5f")
    with pd.option_context("display.width", 260, "display.max_rows", 1000, "display.max_columns", 40):
        cols = ["variant", "kind", "mny", "tenor", "cond", "period", "n", "hit", "mean", "median", "t_nw",
                "p_gt_300", "kelly_f", "breakeven_iv_markup_volpts", "mean_dh_pct_cost", "t_dh", "mean_iv0",
                "mean_realized_vol"]
        show = res[(res.exit == "hold") & (res.period != "ALL") & (res.variant == "base")]
        print(show[cols].round(3).to_string(index=False))
        print("\nUnconditional ('always'), all variants, hold to expiry")
        show = res[(res.exit == "hold") & (res.cond == "always")]
        print(show[cols].round(3).to_string(index=False))
        print("\nExit-rule comparison (base variant, ALL period, 'always' and 'VIX<15'/'SPX>MA200')")
        b = res[(res.variant == "base") & (res.period == "ALL") & res.cond.isin(["always", "SPX>MA200", "VIX<15", "SPX<MA200"])]
        print(b[["kind", "mny", "tenor", "cond", "exit", "n", "hit", "mean", "median", "t_nw", "kelly_f",
                 "kelly_growth_per_trade"]].round(3).to_string(index=False))

    # ---------------- portfolio simulation (base pricing) ----------------
    port_rows = []
    spxtr = panel.spxtr.dropna()
    for (kind, mny, ten), cname, f in [(("call", 1.05, 365), "always", 0.01), (("call", 1.05, 365), "always", 0.02),
                                        (("call", 1.05, 365), "always", 0.05),
                                        (("call", 1.00, 365), "always", 0.02), (("call", 1.10, 365), "always", 0.02),
                                        (("call", 1.05, 365), "SPX>MA200", 0.02), (("call", 1.05, 365), "VIX<15", 0.02),
                                        (("call", 1.10, 91), "always", 0.02),
                                        (("put", 0.90, 365), "always", 0.01), (("put", 0.90, 91), "always", 0.01)]:
        tr, marks = keep[(kind, mny, ten)]
        for start, end, lab in [("1990-01-02", "2007-12-31", "IS"), ("2008-01-02", "2025-09-24", "OOS"),
                                ("1990-01-02", "2025-09-24", "ALL")]:
            e = portfolio(panel, tr, marks, conds[cname], f, start=start, end=pd.Timestamp(end))
            e = e.dropna()
            b = spxtr.loc[e.index[0]:e.index[-1]]
            assert e.index[-1] >= pd.Timestamp(end) - pd.Timedelta(days=10), "equity path truncated"
            port_rows.append(dict(strategy=f"{kind} {mny:.2f} {ten}d / {cname} / f={f:.0%} per month",
                                  period=lab, start=e.index[0].date(), end=e.index[-1].date(),
                                  cagr=cagr(e), maxdd=max_drawdown(e),
                                  vol=np.log(e.resample("ME").last()).diff().std() * np.sqrt(12),
                                  spxtr_cagr=cagr(b), spxtr_maxdd=max_drawdown(b)))
    pr = pd.DataFrame(port_rows)
    pr.to_csv(OUT / "options_portfolio_sim.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_rows", 200):
        print("\nPortfolio simulation (base pricing; T-bills otherwise; monthly purchases)")
        print(pr.round(3).to_string(index=False))

    straddle_study(panel, a1m_snap)


def straddle_study(panel, a1m_snap):
    idx = panel.index
    spx = panel.spx.values
    rows = []
    for a1m, lab in [(a1m_snap, f"ATM IV = {a1m_snap:.2f} x VIX (snapshot ratio)"), (0.88, "ATM IV = 0.88 x VIX"),
                     (1.0, "ATM IV = VIX")]:
        vix = panel.vix.values / 100
        T = 30 / 365.0
        r, q = panel.r3m.values, panel.q.values
        S0, ST = spx[:-21], spx[21:]
        iv = a1m * vix[:-21]
        prem = bs_price(S0, S0, T, r[:-21], q[:-21], iv, "call") + bs_price(S0, S0, T, r[:-21], q[:-21], iv, "put")
        R = np.abs(ST - S0) / (prem * 1.01) - 1
        rows.append((lab, pd.DataFrame({"R": R}, index=idx[:-21])))
    screens = {
        "all days": pd.Series(True, index=idx),
        "VIX pct252<=10%": panel.vix_pct252 <= 0.10,
        "VIX<13": panel.vix < 13,
        "VIX<RV_past21": panel.iv_minus_past < 0,
        "SPX<MA200 & VIX<RV_past21": (panel.trend200 < 0) & (panel.iv_minus_past < 0),
        "dBAA21>+0.25": panel.dbaa21 > 0.25,
        "VIX/VIX3M>1": panel.ts3m > 1.0,
        "VIX/VIX3M>1.1": panel.ts3m > 1.1,
        "VIX9D/VIX>1.1": panel.ts9d > 1.1,
    }
    out = []
    for lab, d in rows:
        for sname, m in screens.items():
            mm = m.reindex(d.index).fillna(False)
            for period, sl in [("IS 1990-2007", slice(None, IS_END)), ("OOS 2008-2026", slice(OOS_START, None))]:
                x = d.loc[sl].R[mm.loc[sl]]
                if len(x) < 20:
                    continue
                out.append(dict(pricing=lab, screen=sname, period=period, n_days=len(x), mean=x.mean(),
                                median=x.median(), hit=(x > 0).mean(), t_nw=nw_tstat(x, 21),
                                p_gt_100=(x > 1).mean()))
    st = pd.DataFrame(out)
    st.to_csv(OUT / "straddle_1m_screens.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_rows", 200):
        print("\n1-month ATM straddle (hold to expiry, 1% half-spread), daily entries")
        print(st.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
