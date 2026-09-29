"""O2 / M4 (crash call debit spread) re-priced with a NEXT-DAY entry, for expiries of ~60, 90 and 120 DTE.

Signal (track 14, unchanged): SPX >= 15% below its 252-day high AND VIX >= 30; first day; 60-calendar-day
cool-down (also run with cool-down = DTE so positions never overlap).
Structure: buy the ATM call, sell the 105% call (registered); sensitivity: short strike 100 + 5*sqrt(DTE/60)%.
Expiry: the last trading day on or before entry + DTE calendar days (XSP lists daily expiries).
Entry (the system can only trade after 10:00 ET on the day after the signal):
  * 'd0close'  : the signal-day close (track 14's convention; replication only);
  * 'nextopen' : SPX open proxied by the SPX close x SPY's overnight total return (SPY from 1993; before
                 that the signal close), VIX at its CBOE open (1992+), the VIX term structure scaled by
                 VIX open / prior close, SKEW / rates / dividend yield from the signal day;
  * 'nextclose': every input at the close of the next session.
  The 10:00-10:30 ET fill lies between the two proxies; their average is reported as the central case.
Exit: sell to close at the close of the trading day before expiry (design rule: >=1 trading day before
expiration); the value is floored at zero (a worthless spread is left to expire).  'hold' = settle at expiry.
Costs: the design's frozen fill model, mid +/- 0.3 x quoted spread per leg (track 14's SPX spread model:
premium bucket x sqrt(VIX/16) x era multiplier), plus 0.013 SPX points per leg per side (SPX fees).
Stress case "XSP": 2x spreads and $0.75 per leg (0.075 SPX-equivalent points).
Pricing: track 14's synthetic surface (optmodel, setting 'blend', IV markup -5%), an APPROXIMATION.  The
smile shape for 90-120 DTE re-uses the 21-70 DTE bucket; the 120-day tenor interpolates VIX3M-VIX6M (VIX6M
proxied before 2008).
Placebo: the same spread bought at the next close after a random session within +-3 years of each event
(5,000 draws) -> "edge vs a plain call spread".
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common21 import BILLS_FWD, KAPPA, RNG_SEED, SCRATCH, placebo_p, save
import optmodel as om
from common13 import load
from common14 import cboe_ohlc

FILL = 0.30
COMM = 0.013
DTES = [60, 90, 120]
NDRAW = 5000


def market_plus() -> pd.DataFrame:
    mk = om.market().copy()
    spy = load("SPY")
    mk["spy_night"] = (spy["aO"] / spy["aC"].shift(1)).reindex(mk.index)          # overnight TR into day t
    vx = cboe_ohlc("VIX")
    vo = vx["OPEN"].reindex(mk.index)
    real_open = (vx["OPEN"] != vx["CLOSE"]).reindex(mk.index).fillna(False) & (mk.index >= "1992-01-01")
    mk["vix_open"] = vo.where(real_open)
    return mk


def crash_signals(mk: pd.DataFrame, cool: int) -> pd.DatetimeIndex:
    hi = mk.spx.rolling(252, min_periods=60).max()
    crash = (mk.spx / hi - 1 <= -0.15) & (mk.vix >= 30)
    dates, last = [], None
    for d in mk.index[crash.fillna(False).values]:
        if d < pd.Timestamp("1990-03-01"):
            continue
        if last is None or (d - last).days > cool:
            dates.append(d)
            last = d
    return pd.DatetimeIndex(dates)


def state(mk, d0, mode):
    """(date used for tau, S, r, q, vl[4], m, vix, year) at entry."""
    i = mk.index.get_loc(d0)
    mode_, markup = om.settings()
    if mode == "d0close":
        row = mk.iloc[i]
        return mk.index[i], row.spx, row.rf, row.q, np.array([row.vix9d, row.vix, row.vix3m, row.vix6m]), \
            om.m_from_mode(row.m_skew, mode_), row.vix
    if mode == "nextclose":
        row = mk.iloc[i + 1]
        return mk.index[i + 1], row.spx, row.rf, row.q, np.array([row.vix9d, row.vix, row.vix3m, row.vix6m]), \
            om.m_from_mode(row.m_skew, mode_), row.vix
    # next open
    r0, r1 = mk.iloc[i], mk.iloc[i + 1]
    night = r1.spy_night if np.isfinite(r1.spy_night) else 1.0
    S = r0.spx * night
    vo = r1.vix_open if np.isfinite(r1.vix_open) else r0.vix
    sc = vo / r0.vix
    vl = np.array([r0.vix9d * sc, vo, r0.vix3m * sc, r0.vix6m * sc])
    return mk.index[i + 1], S, r0.rf, r0.q, vl, om.m_from_mode(r0.m_skew, mode_), vo


def px(S, K, tau, r, q, vl, m, kind="call"):
    _, markup = om.settings()
    S = np.atleast_1d(np.asarray(S, float))
    K = np.atleast_1d(np.asarray(K, float))
    tau = np.atleast_1d(np.asarray(tau, float))
    r = np.atleast_1d(np.asarray(r, float))
    q = np.atleast_1d(np.asarray(q, float))
    vl = np.atleast_2d(np.asarray(vl, float))
    m = np.atleast_1d(np.asarray(m, float))
    p, _ = om.price(S, K, tau, r, q, vl, m, kind, iv_markup=markup)
    return p


def expiry_and_exit(idx: pd.DatetimeIndex, d_entry: pd.Timestamp, dte: int):
    E = idx[idx.searchsorted(d_entry + pd.Timedelta(days=dte), side="right") - 1]
    x = idx[idx.get_loc(E) - 1]
    return E, x


def trade(mk, d0, dte, mode, width_fn, spr_mult=1.0, comm=COMM, dmu=0.0):
    idx = mk.index
    d_e, S, r, q, vl, m, vix = state(mk, d0, mode)
    E, x = expiry_and_exit(idx, d_e, dte)
    if E > idx[-1] or (d_e + pd.Timedelta(days=dte)) > idx[-1] or x <= d_e:
        return None
    K1, K2 = S, S * (1 + width_fn(dte))
    tau0 = float((E - d_e).days)
    c1, c2 = px([S, S], [K1, K2], [tau0, tau0], [r, r], [q, q], [vl, vl], [m, m])
    s1, s2 = om.quoted_spread(np.array([c1, c2]), np.array([vix, vix]), d_e.year) * spr_mult
    debit = (c1 + FILL * s1 + comm) - (c2 - FILL * s2 - comm)
    rx = mk.loc[x]
    mode_, _ = om.settings()
    mx = om.m_from_mode(rx.m_skew, mode_)
    taux = float((E - x).days)
    vlx = np.array([rx.vix9d, rx.vix, rx.vix3m, rx.vix6m])
    Sx = rx.spx * np.exp(dmu * (x - d_e).days / 365.0)        # forward-drift adjustment (dmu = 0: history)
    e1, e2 = px([Sx, Sx], [K1, K2], [taux, taux], [rx.rf, rx.rf], [rx.q, rx.q], [vlx, vlx], [mx, mx])
    t1, t2 = om.quoted_spread(np.array([e1, e2]), np.array([rx.vix, rx.vix]), x.year) * spr_mult
    val = max((e1 - FILL * t1 - comm) - (e2 + FILL * t2 + comm), 0.0)
    SE = mk.loc[E].spx * np.exp(dmu * (E - d_e).days / 365.0)
    val_hold = max(SE - K1, 0) - max(SE - K2, 0)
    # path: worst mark-to-market (mid) during the life, for drawdown bookkeeping
    return dict(signal=d0, entry=d_e, expiry=E, exit=x, S0=S, vix_entry=vix, debit=debit, debit_pct_spot=debit / S,
                max_mult=(K2 - K1) / debit, R=val / debit - 1, R_hold=val_hold / debit - 1,
                S_exit_ret=rx.spx / S - 1)


def episodes(dates: pd.Series, gap_days: int = 180) -> np.ndarray:
    ep = [0]
    d = list(pd.to_datetime(dates))
    for k in range(1, len(d)):
        ep.append(ep[-1] + (1 if (d[k] - d[k - 1]).days > gap_days else 0))
    return np.array(ep)


def all_day_R(mk, dte, width_fn, spr_mult=1.0, comm=COMM, dmu=0.0) -> pd.Series:
    """R for a spread bought at the close of every session e (placebo universe; next-close convention)."""
    idx = mk.index
    mode_, markup = om.settings()
    n = len(idx)
    ent = np.arange(n)
    tgt = idx + pd.Timedelta(days=dte)
    Epos = idx.searchsorted(tgt, side="right") - 1
    ok = (tgt <= idx[-1]) & (Epos - 1 > ent)
    e = ent[ok]
    E = Epos[ok]
    x = E - 1
    S = mk.spx.values
    vl = mk[["vix9d", "vix", "vix3m", "vix6m"]].values
    m = om.m_from_mode(mk.m_skew.values, mode_)
    r, q, vix = mk.rf.values, mk.q.values, mk.vix.values
    yr = idx.year.values
    tau0 = (idx[E] - idx[e]).days.values.astype(float)
    taux = (idx[E] - idx[x]).days.values.astype(float)
    K1 = S[e]
    K2 = S[e] * (1 + width_fn(dte))
    c1, _ = om.price(S[e], K1, tau0, r[e], q[e], vl[e], m[e], "call", iv_markup=markup)
    c2, _ = om.price(S[e], K2, tau0, r[e], q[e], vl[e], m[e], "call", iv_markup=markup)
    s1 = om.quoted_spread(c1, vix[e], yr[e]) * spr_mult
    s2 = om.quoted_spread(c2, vix[e], yr[e]) * spr_mult
    debit = (c1 + FILL * s1 + comm) - (c2 - FILL * s2 - comm)
    Sx = S[x] * np.exp(dmu * (idx[x] - idx[e]).days.values / 365.0)
    e1, _ = om.price(Sx, K1, taux, r[x], q[x], vl[x], m[x], "call", iv_markup=markup)
    e2, _ = om.price(Sx, K2, taux, r[x], q[x], vl[x], m[x], "call", iv_markup=markup)
    t1 = om.quoted_spread(e1, vix[x], yr[x]) * spr_mult
    t2 = om.quoted_spread(e2, vix[x], yr[x]) * spr_mult
    val = np.maximum((e1 - FILL * t1 - comm) - (e2 + FILL * t2 + comm), 0.0)
    out = pd.Series(val / debit - 1, index=idx[e])
    return out[np.isfinite(out.values) & (out.index >= "1990-01-02")]


def main():
    mk = market_plus()
    idx = mk.index
    w_reg = lambda dte: 0.05
    w_sqrt = lambda dte: 0.05 * np.sqrt(dte / 60.0)
    rows, trades = [], []
    sig60 = crash_signals(mk, 60)
    print("CRASH signals (60-day cool-down):", len(sig60))
    widths = {"100/105": w_reg, "sqrt-width": w_sqrt}
    costs = {"base": (1.0, COMM), "xsp-stress": (2.0, 0.075)}
    configs = []
    for dte in DTES:
        configs.append((dte, 60, "d0close", "100/105", "base"))          # track 14's entry (replication)
        for mode in ("nextopen", "nextclose"):
            configs.append((dte, 60, mode, "100/105", "base"))
            configs.append((dte, 60, mode, "100/105", "xsp-stress"))
            if dte != 60:
                configs.append((dte, 60, mode, "sqrt-width", "base"))
                configs.append((dte, dte, mode, "100/105", "base"))       # cool-down = DTE (no overlap)
    sig_cache = {}
    for dte, cool, mode, wname, cname in configs:
        if cool not in sig_cache:
            sig_cache[cool] = crash_signals(mk, cool)
        sm, cm = costs[cname]
        tt = [trade(mk, d, dte, mode, widths[wname], sm, cm) for d in sig_cache[cool]]
        t = pd.DataFrame([z for z in tt if z is not None])
        t["dte"], t["mode"], t["width"], t["cost"], t["cool"] = dte, mode, wname, cname, cool
        trades.append(t)
    T = pd.concat(trades, ignore_index=True)
    save(T, "o2_trades")
    # summaries
    yrs = (pd.Timestamp("2026-09-25") - pd.Timestamp("1990-03-01")).days / 365.25
    for key, g in T.groupby(["dte", "cool", "mode", "width", "cost"]):
        g = g.sort_values("signal").reset_index(drop=True)
        ep = episodes(g.signal)
        epm = g.groupby(ep).R.mean()
        is_ = g[g.signal < "2008-01-01"].R
        oos = g[g.signal >= "2008-01-01"].R
        n = len(g)
        mean_R = g.R.mean()
        trades_yr = n / yrs
        bills_drag = BILLS_FWD * key[0] / 365.0
        rows.append(dict(dte=key[0], cool=key[1], mode=key[2], width=key[3], cost=key[4], n=n, episodes=len(epm),
                         trades_per_yr=trades_yr, mean_R=mean_R, median_R=g.R.median(), sd_R=g.R.std(),
                         se_R=g.R.std() / np.sqrt(n), win=(g.R > 0).mean(), lost_all=(g.R <= -0.999).sum(),
                         mean_R_hold=g.R_hold.mean(), IS_mean=is_.mean(), OOS_mean=oos.mean(), IS_n=len(is_), OOS_n=len(oos),
                         ep_mean=epm.mean(), ep_t=epm.mean() / (epm.std() / np.sqrt(len(epm))),
                         debit_pct_spot=g.debit_pct_spot.mean(), max_mult=g.max_mult.mean(),
                         contrib_unshrunk=trades_yr * 0.02 * (mean_R - bills_drag),
                         contrib_k05=trades_yr * 0.02 * (KAPPA * mean_R - bills_drag),
                         contrib_k03=trades_yr * 0.02 * (0.3 * mean_R - bills_drag),
                         overlap_max=int(max_overlap(g))))
    S = pd.DataFrame(rows)
    save(S, "o2_summary")
    pd.set_option("display.width", 260)
    print(S.round(4).to_string(index=False))

    # episode table for the central cases
    for dte in DTES:
        g = T[(T.dte == dte) & (T.cool == 60) & (T.width == "100/105") & (T.cost == "base")]
        piv = g.pivot_table(index="signal", columns="mode", values="R")
        piv["ep"] = episodes(pd.Series(piv.index))
        print(f"\nDTE {dte}: per-trade R by entry convention")
        print(piv.round(3).to_string())
        save(piv.reset_index(), f"o2_pertrade_dte{dte}")

    # placebo: plain call spreads bought on random sessions within +-3 years (next-close convention)
    rng = np.random.default_rng(RNG_SEED)
    prow = []
    for dte in DTES:
        allR = all_day_R(mk, dte, w_reg)
        sig = crash_signals(mk, 60)
        ev_R = []
        ev_pos = []
        for d in sig:
            i = idx.get_loc(d)
            if i + 1 < len(idx) and idx[i + 1] in allR.index:
                ev_R.append(allR.loc[idx[i + 1]])
                ev_pos.append(allR.index.get_loc(idx[i + 1]))
        ev_R = np.array(ev_R)
        ev_pos = np.array(ev_pos)
        vals = allR.values
        n_all = len(vals)
        ev_dates = allR.index[ev_pos]
        for per, msk in (("1990-2026", np.ones(len(ev_pos), bool)), ("1990-2007", ev_dates < "2008-01-01"),
                         ("2008-2026", ev_dates >= "2008-01-01")):
            draws = np.zeros(NDRAW)
            for p0 in ev_pos[msk]:
                a, b = max(0, p0 - 756), min(n_all - 1, p0 + 756)
                draws += vals[rng.integers(a, b + 1, size=NDRAW)]
            draws /= msk.sum()
            lo, hi = ("1990", "2007-12-31") if per == "1990-2007" else (("2008", "2026-12-31") if per == "2008-2026" else ("1990", "2026-12-31"))
            av = allR.loc[lo:hi].values
            prow.append(dict(dte=dte, period=per, n=int(msk.sum()), event_mean_R=ev_R[msk].mean(),
                             placebo_mean_R=draws.mean(), edge=ev_R[msk].mean() - draws.mean(),
                             p_era=placebo_p(ev_R[msk].mean(), draws),
                             all_days_mean_R=av.mean(), all_days_median_R=np.median(av), all_days_win=(av > 0).mean()))
    P = pd.DataFrame(prow)
    save(P, "o2_placebo")
    print("\nPlacebo (next-close entry, 100/105, base costs, sell 1 day before expiry):")
    print(P.round(4).to_string(index=False))


def forward_block():
    """Forward-looking O2: re-price the exits with the S&P drift moved from its 1990-2026 level to a
    CAPE-41 level (forward total return 3 / 4.5 / 6% minus a 1.2% dividend yield), for the events and for
    the random-day placebo.  E[R] = drift-adjusted placebo + kappa x (event - placebo)."""
    mk = market_plus()
    idx = mk.index
    s = mk.spx.loc["1990-01-02":]
    mu_hist = np.log(s.iloc[-1] / s.iloc[0]) / ((s.index[-1] - s.index[0]).days / 365.25)
    div = 0.012
    w_reg = lambda dte: 0.05
    rng = np.random.default_rng(RNG_SEED + 1)
    yrs = (pd.Timestamp("2026-09-25") - pd.Timestamp("1990-03-01")).days / 365.25
    rows = []
    for dte in DTES:
        for cool in sorted({60, dte}):
            sig = crash_signals(mk, cool)
            tr_yr = len(sig) / yrs
            for lab, eq in (("history", None), ("fwd_lo", 0.03), ("fwd_mid", 0.045), ("fwd_hi", 0.06)):
                dmu = 0.0 if eq is None else (np.log(1 + eq) - np.log(1 + div)) - mu_hist
                ev = {}
                for mode in ("nextopen", "nextclose"):
                    tt = [trade(mk, d, dte, mode, w_reg, dmu=dmu) for d in sig]
                    ev[mode] = pd.DataFrame([z for z in tt if z is not None]).R.mean()
                allR = all_day_R(mk, dte, w_reg, dmu=dmu)
                pos = [allR.index.get_loc(idx[idx.get_loc(d) + 1]) for d in sig if idx[idx.get_loc(d) + 1] in allR.index]
                vals = allR.values
                draws = np.zeros(NDRAW)
                for p0 in pos:
                    a, b = max(0, p0 - 756), min(len(vals) - 1, p0 + 756)
                    draws += vals[rng.integers(a, b + 1, size=NDRAW)]
                draws /= len(pos)
                ev_mid = 0.5 * (ev["nextopen"] + ev["nextclose"])
                rows.append(dict(dte=dte, cool=cool, trades_per_yr=tr_yr, drift=lab, dmu=dmu,
                                 ev_nextopen=ev["nextopen"], ev_nextclose=ev["nextclose"], ev_mid=ev_mid,
                                 placebo=draws.mean(), edge=ev_mid - draws.mean()))
    F = pd.DataFrame(rows)
    # expected R: drift-adjusted placebo + kappa x historical edge (edge measured at dmu = 0)
    out = []
    for (dte, cool), g in F.groupby(["dte", "cool"]):
        edge_hist = g[g.drift == "history"].edge.iloc[0]
        for r in g.itertuples():
            for kap in (KAPPA, 0.3):
                ER = r.placebo + kap * edge_hist
                out.append(dict(dte=dte, cool=cool, drift=r.drift, kappa=kap, trades_per_yr=r.trades_per_yr,
                                ev_mid=r.ev_mid, placebo=r.placebo, edge_hist=edge_hist, ER=ER,
                                contrib=r.trades_per_yr * 0.02 * (ER - BILLS_FWD * dte / 365.0),
                                contrib_design_conv=r.trades_per_yr * 0.02 * (kap * r.ev_mid - BILLS_FWD * dte / 365.0)))
    O = pd.DataFrame(out)
    save(F, "o2_forward_raw")
    save(O, "o2_forward_contrib")
    pd.set_option("display.width", 250)
    print("mu_hist (log, 1990-2026) %.4f" % mu_hist)
    print(F.round(4).to_string(index=False))
    print(O.round(5).to_string(index=False))


def max_overlap(g: pd.DataFrame) -> int:
    ev = sorted([(d, 1) for d in g.entry] + [(d, -1) for d in g.exit], key=lambda z: (z[0], -z[1]))
    cur = best = 0
    for _, s in ev:
        cur += s
        best = max(best, cur)
    return best


if __name__ == "__main__":
    import sys
    if "--forward" in sys.argv:
        forward_block()
    else:
        main()
