"""Task 1: independent W10 replication at 42 / 63 / 84 sessions and at the calendar-exact 60 / 90 / 120-day exit.

Signal: first ^GSPC close <= -3% (no other <= -3% close in the prior 20 sessions) with the prior close above
its 200-day SMA computed through the prior close.

Samples
  SPY 1993-2026 : SPY (total-return adjusted) from the next OPEN; exits at an open (F<H>, CAL<N>).
  SPY 2008-2026 : the dossier's post-2008 test block (sub-sample of the above).
  Index 1990-2026, Index 1928-1989, Index 1928-2026 : S&P 500 total return from the next CLOSE.
Statistics: mean / median / win / worst / worst interim drawdown / t; edge vs era-matched random entries
(+-3 years, inside the sample) and vs uptrend-only random entries (prior close > 200-day SMA), two-sided
placebo p; a cluster-preserving (common-shift) placebo for the all-events version; the same on the
one-position-at-a-time trade list.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common23 as K

RULES_SPY = ["F42", "F63", "F84", "CAL60", "CAL90", "CAL120"]
RULES_IDX = ["F42", "F63", "F84", "CAL60", "CAL90", "CAL120"]
CAP_OF = {"F42": 60, "F63": 90, "F84": 120, "CAL60": 60, "CAL90": 90, "CAL120": 120,
          "C42": 60, "C63": 90, "C84": 120, "C60": 90}


def samples():
    Is, Ii = K.inst_spy(), K.inst_index()
    out = []

    def mk(label, I, a, b):
        lo = int(np.searchsorted(I.dnum, np.datetime64(a, "D").astype(np.int64)))
        hi = int(np.searchsorted(I.dnum, np.datetime64(b, "D").astype(np.int64), side="right"))
        # the SMA-200 must exist
        first_ok = int(np.flatnonzero(np.isfinite(K.w10_frame()["sma200"].reindex(I.dates).values))[0]) + 1
        lo = max(lo, first_ok)
        ev = np.flatnonzero(I.sig[lo:hi]) + lo
        yrs = (min(I.dates[hi - 1], K.TODAY) - I.dates[lo]).days / 365.25
        out.append(dict(label=label, I=I, lo=lo, hi=hi, ev=ev, years=yrs))
    mk("SPY 1993-2026", Is, "1993-01-29", "2026-09-28")
    mk("SPY 2008-2026", Is, "2008-01-01", "2026-09-28")
    mk("Index 1990-2026", Ii, "1990-01-01", "2026-09-28")
    mk("Index 1928-1989", Ii, "1928-01-01", "1989-12-31")
    mk("Index 1928-2026", Ii, "1928-01-01", "2026-09-28")
    return out


def one_at_a_time(I, ev, X):
    """Indices (into ev) of trades taken with one W10 position at a time: a signal is taken only if its
    date is on or after the exit date of the open trade."""
    taken, busy = [], -1
    for k, i in enumerate(ev):
        if X[k] < 0:
            continue
        if i >= busy:
            taken.append(k)
            busy = X[k]
    return np.array(taken, int)


def cell_stats(S, rule, ev_sel, tr_ev, vec, rng, label_suffix, with_shift=True):
    I, lo, hi = S["I"], S["lo"], S["hi"]
    ok = tr_ev["ok"][ev_sel]
    pos = S["ev"][ev_sel][ok]
    net = tr_ev["net"][ev_sel][ok]
    exc = tr_ev["excess"][ev_sel][ok]
    days = tr_ev["days"][ev_sel][ok]
    e = tr_ev["e"][ev_sel][ok]
    X = tr_ev["X"][ev_sel][ok]
    n = len(net)
    if n == 0:
        return None, None
    maes = np.array([K.mae(I, int(a), int(b), rule) for a, b in zip(e, X)])
    # placebo pools must have complete windows: restrict hi to the last valid position
    finite = np.flatnonzero(np.isfinite(vec[:hi]))
    hi_v = int(finite[-1]) + 1 if len(finite) else hi
    pm_era, null_era = K.placebo(vec, pos, lo, hi_v, era=True, rng=rng)
    pm_up, null_up = K.placebo(vec, pos, lo, hi_v, up=I.up, era=False, rng=rng)
    pm_upera, null_upera = K.placebo(vec, pos, lo, hi_v, up=I.up, era=True, rng=rng)
    obs = float(net.mean())
    row = dict(sample=S["label"], rule=rule, cap=CAP_OF[rule], version=label_suffix, n=n,
               per_yr=n / S["years"], mean=obs, median=float(np.median(net)), win=float((net > 0).mean()),
               worst=float(net.min()), best=float(net.max()), worst_mae=float(maes.min()),
               median_mae=float(np.median(maes)), t=K.tstat(net), mean_excess=float(exc.mean()),
               mean_days=float(days.mean()), max_days=float(days.max()),
               share_over_cap=float((days > CAP_OF[rule]).mean()),
               era_placebo=float(null_era.mean()), edge_era=obs - float(null_era.mean()),
               p_era=K.two_sided_p(obs, null_era), t_edge_era=K.tstat(net - pm_era),
               up_placebo=float(null_up.mean()), edge_up=obs - float(null_up.mean()),
               p_up=K.two_sided_p(obs, null_up),
               upera_placebo=float(null_upera.mean()), edge_upera=obs - float(null_upera.mean()),
               p_upera=K.two_sided_p(obs, null_upera))
    if with_shift:
        null_sh = K.shift_placebo(vec, pos, lo, hi_v, rng=rng)
        row["p_shift"] = K.two_sided_p(obs, null_sh)
        row["shift_placebo"] = float(null_sh.mean())
    per_trade = pd.DataFrame(dict(sample=S["label"], rule=rule, version=label_suffix,
                                  signal=I.dates[pos].date, entry=I.dates[e].date, exit=I.dates[X].date,
                                  cal_days=days.astype(int), sessions=(X - e).astype(int),
                                  gauge_at_signal=I.gauge[pos], net=net, excess=exc, mae=maes,
                                  era_pool_mean=pm_era, edge_vs_pool=net - pm_era))
    return row, per_trade


def run():
    rng = np.random.default_rng(K.SEED)
    rows, trades = [], []
    for S in samples():
        I = S["I"]
        rules = RULES_SPY if I.entry_at_open else RULES_IDX
        allpos = np.arange(I.n - 1)
        for rule in rules:
            tv = K.trade_returns(I, allpos, rule)
            vec = np.full(I.n, np.nan)
            vec[allpos[tv["ok"]]] = tv["net"][tv["ok"]]
            tr_ev = K.trade_returns(I, S["ev"], rule)
            sel_all = np.arange(len(S["ev"]))
            r_all, pt_all = cell_stats(S, rule, sel_all, tr_ev, vec, rng, "all events")
            sel_one = one_at_a_time(I, S["ev"], tr_ev["X"])
            r_one, pt_one = cell_stats(S, rule, sel_one, tr_ev, vec, rng, "one at a time", with_shift=False)
            if r_all is None:
                continue
            skipped = sorted(set(I.dates[S["ev"]].date) - set(I.dates[S["ev"][sel_one]].date))
            r_one["skipped"] = "; ".join(d.isoformat() for d in skipped)
            rows += [r_all, r_one]
            trades += [pt_all, pt_one]
            kind = "decision" if rule in ("F42", "F63", "F84", "CAL60", "CAL90", "CAL120") else "diagnostic"
            for r in (r_all, r_one):
                K.register("W10 replication", f"{rule} | {r['version']}", S["label"], kind, r["n"],
                           mean=r["mean"], edge_era=r["edge_era"], p_era=r["p_era"], p_up=r["p_up"], t=r["t"])
    R = pd.DataFrame(rows)
    T = pd.concat(trades, ignore_index=True)
    K.save(R, "w10_stats")
    K.save(T[T.version == "one at a time"], "w10_trades_one_at_a_time")
    K.save(T[T.version == "all events"], "w10_events_all")
    return R, T


def reconciliation_runs():
    """Cells in the conventions tracks 17, 19, 21 and 22 used, for a like-for-like comparison."""
    rng = np.random.default_rng(K.SEED + 1)
    w = K.w10_frame()
    Is = K.inst_spy()
    Ii = K.inst_index()
    Ip = K.Inst("S&P price", w.index, w["C"].values, w["C"].values, w["C"].values, w["rf"].values,
                w["up_prior"].values, w["gauge"].values, w["sig"].values, w["ath_prior"].values, w["C"].values,
                entry_at_open=False)
    rows = []

    def one(label, I, rule, a, b, lag=1, cost=True, one_pos=False):
        lo = int(np.searchsorted(I.dnum, np.datetime64(a, "D").astype(np.int64)))
        hi = int(np.searchsorted(I.dnum, np.datetime64(b, "D").astype(np.int64), side="right"))
        first_ok = int(np.flatnonzero(np.isfinite(w["sma200"].reindex(I.dates).values))[0]) + 1
        lo = max(lo, first_ok)
        ev = np.flatnonzero(I.sig[lo:hi]) + lo
        allpos = np.arange(I.n - 1)
        # lag 0 = buy at the signal close (track 17): shift positions back one session
        shift = 1 - lag
        tv = K.trade_returns(I, allpos - shift if shift else allpos, rule, cost_bp=K.COST_BP if cost else 0.0)
        net = tv["net"] if cost else tv["gross"]
        vec = np.full(I.n, np.nan)
        okp = tv["ok"] & (allpos - shift >= 0)
        vec[allpos[okp]] = net[okp]
        te = K.trade_returns(I, ev - shift, rule, cost_bp=K.COST_BP if cost else 0.0)
        x_ev = te["net"] if cost else te["gross"]
        sel = np.arange(len(ev))
        if one_pos:
            busy, keep = -1, []
            for k, i in enumerate(ev):
                if te["X"][k] >= 0 and i >= busy:
                    keep.append(k)
                    busy = te["X"][k]
            sel = np.array(keep)
        pos = ev[sel]
        x = x_ev[sel]
        finite = np.flatnonzero(np.isfinite(vec[:hi]))
        hi_v = int(finite[-1]) + 1
        pm, null = K.placebo(vec, pos, lo, hi_v, era=True, rng=rng)
        _, null_up = K.placebo(vec, pos, lo, hi_v, up=I.up, era=False, rng=rng)
        rows.append(dict(check=label, rule=rule, n=len(x), mean=np.nanmean(x), median=np.nanmedian(x),
                         era_placebo=null.mean(), edge_era=np.nanmean(x) - null.mean(),
                         p_era=K.two_sided_p(np.nanmean(x), null), p_up=K.two_sided_p(np.nanmean(x), null_up),
                         t=K.tstat(x)))
        K.register("W10 reconciliation", f"{label}", a[:4] + "-" + b[:4], "diagnostic", len(x),
                   mean=float(np.nanmean(x)), p_era=rows[-1]["p_era"])

    # track 17 / 19: S&P price from the crash-day close, 60 and 42 sessions, 1990-2026 (n = 21)
    one("T17/T19: price, signal close, 60 sessions", Ip, "F60", "1990-01-01", "2026-09-28", lag=0, cost=False)
    one("T19: price, signal close, 42 sessions", Ip, "F42", "1990-01-01", "2026-09-28", lag=0, cost=False)
    one("T17: price, signal close, 60 sessions, 1928-89", Ip, "F60", "1928-01-01", "1989-12-31", lag=0, cost=False)
    # track 21: SPY next open -> close of session H, no costs (their headline mixes in the 1991 index event)
    for H in (42, 63, 84):
        one(f"T21: SPY next open -> close of session {H}, gross", Is, f"C{H}", "1993-01-29", "2026-09-28", cost=False)
        one(f"T21: S&P TR next close, {H} sessions, gross, 1928-89", Ii, f"F{H}", "1928-01-01", "1989-12-31", cost=False)
        one(f"T21: S&P price signal close, {H} sessions, 1928-89", Ip, f"F{H}", "1928-01-01", "1989-12-31", lag=0, cost=False)
    # track 22: non-overlapping, costs, SPY next open -> close of session H (2008-26 test) and index next close
    for H in (42, 60, 63, 84):
        one(f"T22: SPY next open -> close of session {H}, net, one at a time, 2008-26", Is, f"C{H}",
            "2008-01-01", "2026-09-28", one_pos=True)
        one(f"T22: S&P TR next close, {H} sessions, net, one at a time, 1928-2026", Ii, f"F{H}",
            "1928-01-01", "2026-09-28", one_pos=True)
    one("T22: SPY next open -> close of session 60, net, one at a time, 1993-2026", Is, "C60",
        "1993-01-29", "2026-09-28", one_pos=True)
    one("T22: S&P TR next close, 60 sessions, net, one at a time, 1990-2026", Ii, "F60", "1990-01-01",
        "2026-09-28", one_pos=True)
    one("T22: S&P TR next close, 60 sessions, net, one at a time, 1928-89", Ii, "F60", "1928-01-01",
        "1989-12-31", one_pos=True)
    R = pd.DataFrame(rows)
    K.save(R, "w10_reconciliation_cells")
    return R


def track21_event_compare():
    """Per-event comparison with track 21's w10_events_1990.csv (SPY next open -> close t+H, gross)."""
    t21 = pd.read_csv(K.T21 / "w10_events_1990.csv", parse_dates=["date"])
    Is = K.inst_spy()
    Ii = K.inst_index()
    rows = []
    for r in t21.itertuples():
        d = pd.Timestamp(r.date)
        rec = dict(date=d.date(), t21_vix=r.vix)
        if d in Is.dates:
            i = Is.dates.get_loc(d)
            for H in (42, 63, 84):
                tv = K.trade_returns(Is, np.array([i]), f"C{H}", cost_bp=0.0)
                rec[f"mine_C{H}"] = float(tv["gross"][0])
                rec[f"t21_{H}"] = getattr(r, f"trad{H}")
        else:
            i = Ii.dates.get_loc(d)
            for H in (42, 63, 84):
                tv = K.trade_returns(Ii, np.array([i]), f"F{H}", cost_bp=0.0)
                rec[f"mine_C{H}"] = float(tv["gross"][0])
                rec[f"t21_{H}"] = getattr(r, f"trad{H}")
        rows.append(rec)
    D = pd.DataFrame(rows)
    for H in (42, 63, 84):
        D[f"diff_{H}"] = D[f"mine_C{H}"] - D[f"t21_{H}"]
    K.save(D, "w10_vs_track21_events")
    return D


def main():
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    R, T = run()
    cols = ["sample", "rule", "version", "n", "per_yr", "mean", "median", "win", "worst", "worst_mae", "t",
            "edge_era", "p_era", "edge_up", "p_up", "p_upera", "p_shift", "max_days", "share_over_cap"]
    print(R[cols].round(4).to_string(index=False))
    Rc = reconciliation_runs()
    print(Rc.round(4).to_string(index=False))
    D = track21_event_compare()
    print(D.round(4).to_string(index=False))
    return R, T, Rc, D


if __name__ == "__main__":
    main()
