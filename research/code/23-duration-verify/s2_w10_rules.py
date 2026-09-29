"""Task 2: rule details for a live W10 under a 90-day cap.

  (a) calendar-exact exit vs a fixed session count: calendar spans of fixed holds, paired differences;
  (b) the VIX > 45 void, read as an entry filter and as an exit trigger;
  (c) the new-all-time-high exit;
  (d) size: 6.0% vs 6.7% of NAV, stress on the 10-session worst loss vs horizon-matched;
  (e) the US-equity cluster: M1 (admitted first), W10 and, in Phase B, M4 inside the 4% reserved room, plus
      the 10% total-open cap with M2 (4.5%) and M3 (1.57% when on);
  (f) kill switches: historical behaviour and detection power by simulation.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats as sps

import common23 as K
import modules23 as M


# ============================================================================ (a) calendar spans
def calendar_spans() -> pd.DataFrame:
    I = K.inst_spy()
    e = np.arange(1, I.n)
    rows = []
    for rule in ("F42", "F60", "F61", "F62", "F63", "F84", "C42", "C63", "C84", "CAL60", "CAL90", "CAL120"):
        X = K.exit_positions(I, e, rule)
        ok = X > 0
        days = (I.dnum[X[ok]] - I.dnum[e[ok]]).astype(float)
        if rule.startswith("C"):
            sess = (X[ok] - e[ok] + 1).astype(float)          # close of session H -> H sessions held
        else:
            sess = (X[ok] - e[ok]).astype(float)              # open of session H+1 -> H sessions held
        rows.append(dict(rule=rule, median_days=np.median(days), max_days=days.max(), min_days=days.min(),
                         share_over_60=(days > 60).mean(), share_over_90=(days > 90).mean(),
                         share_over_120=(days > 120).mean(), min_sessions=sess.min(),
                         median_sessions=np.median(sess), max_sessions=sess.max()))
    R = pd.DataFrame(rows)
    K.save(R, "rules_calendar_spans")
    return R


def paired(a: np.ndarray, b: np.ndarray) -> dict:
    d = a - b
    return dict(mean_diff=float(np.mean(d)), t_diff=K.tstat(d), n_diff=int((np.abs(d) > 1e-9).sum()),
                worse=int((d < -1e-9).sum()), better=int((d > 1e-9).sum()))


def exit_rule_compare() -> pd.DataFrame:
    rows = []
    for inst, a in ((K.inst_spy(), "1993-01-29"), (K.inst_index(), "1990-01-01"), (K.inst_index(), "1928-10-01")):
        b = "2026-09-28" if a != "1928-10-01" else "1989-12-31"
        lo = int(np.searchsorted(inst.dnum, np.datetime64(a, "D").astype(np.int64)))
        hi = int(np.searchsorted(inst.dnum, np.datetime64(b, "D").astype(np.int64), side="right"))
        ev = np.flatnonzero(inst.sig[lo:hi]) + lo
        for cal, fx in (("CAL60", "F42"), ("CAL90", "F63"), ("CAL120", "F84")):
            A = K.trade_returns(inst, ev, cal)
            Bb = K.trade_returns(inst, ev, fx)
            ok = A["ok"] & Bb["ok"]
            p = paired(A["net"][ok], Bb["net"][ok])
            rows.append(dict(sample=f"{inst.name} {a[:4]}-{b[:4]}", calendar=cal, fixed=fx, n=int(ok.sum()),
                             mean_cal=A["net"][ok].mean(), mean_fixed=Bb["net"][ok].mean(),
                             days_cal_max=A["days"][ok].max(), days_fixed_max=Bb["days"][ok].max(), **p))
            K.register("W10 exit rule", f"{cal} vs {fx}", f"{inst.name} {a[:4]}-{b[:4]}", "decision", int(ok.sum()),
                       mean_diff=p["mean_diff"])
    R = pd.DataFrame(rows)
    K.save(R, "rules_calendar_vs_fixed")
    return R


# ============================================================================ (b)(c) path-dependent exits
def path_exit(I, ev, rule, kind: str, vix_level=45.0):
    """Returns net returns with an early exit: kind 'ath' (first ^GSPC close >= the pre-crash all-time high)
    or 'vix' (first fear-gauge close > vix_level).  Exit at the next open (SPY) / next close (index)."""
    base = K.trade_returns(I, ev, rule)
    out = base["net"].copy()
    early = np.zeros(len(ev), bool)
    for k, i in enumerate(ev):
        if not base["ok"][k]:
            continue
        e, X = int(base["e"][k]), int(base["X"][k])
        if I.entry_at_open:
            s_range = np.arange(e, X - 1)         # close s, exit at the open of s+1 < X
        else:
            s_range = np.arange(e + 1, X)         # close s after entry, exit at the close of s+1 <= X
        if kind == "ath":
            hit = s_range[I.close_ref[s_range] >= I.ath_prior[i]]
        else:
            hit = s_range[np.nan_to_num(I.gauge[s_range]) > vix_level]
        if len(hit) == 0:
            continue
        s = int(hit[0])
        x = s + 1
        c = (2.0 if np.nan_to_num(I.gauge[i]) > 30 else 1.0) / 1e4
        px_x = I.ex_open[x] if I.entry_at_open else I.mark[x]
        g = px_x / I.ent_px[e] - 1
        out[k] = (1 + g) * (1 - c) / (1 + c) - 1
        early[k] = True
    return base, out, early


def void_and_ath() -> pd.DataFrame:
    rows = []
    specs = [(K.inst_spy(), "1993-01-29", "2026-09-28"), (K.inst_index(), "1990-01-01", "2026-09-28"),
             (K.inst_index(), "1928-10-01", "1989-12-31")]
    for I, a, b in specs:
        lo = int(np.searchsorted(I.dnum, np.datetime64(a, "D").astype(np.int64)))
        hi = int(np.searchsorted(I.dnum, np.datetime64(b, "D").astype(np.int64), side="right"))
        ev = np.flatnonzero(I.sig[lo:hi]) + lo
        lab = f"{I.name} {a[:4]}-{b[:4]}"
        for rule in ("CAL60", "CAL90", "CAL120", "F63"):
            for kind in ("ath", "vix"):
                if kind == "vix" and a < "1986":
                    continue
                base, alt, early = path_exit(I, ev, rule, kind)
                ok = base["ok"]
                p = paired(alt[ok], base["net"][ok])
                rows.append(dict(sample=lab, rule=rule, variant="new-ATH exit" if kind == "ath" else "exit if VIX > 45",
                                 n=int(ok.sum()), early_exits=int(early[ok].sum()), mean_base=base["net"][ok].mean(),
                                 mean_variant=alt[ok].mean(), median_variant=np.median(alt[ok]),
                                 worst_variant=alt[ok].min(), win_variant=(alt[ok] > 0).mean(), **p))
                K.register("W10 exit variant", f"{rule} {kind}", lab, "decision", int(ok.sum()), mean_diff=p["mean_diff"])
        # entry filter: gauge > 45 on the signal day
        g = I.gauge[ev]
        rows.append(dict(sample=lab, rule="entry", variant="skip if VIX > 45 at the signal",
                         n=len(ev), early_exits=int(np.sum(np.nan_to_num(g) > 45)),
                         mean_base=np.nan, mean_variant=np.nan, max_gauge_at_signal=np.nanmax(g) if np.isfinite(g).any() else np.nan))
    # pre-1986 indication with the realised-vol proxy
    w = K.w10_frame()
    ev_old = w.index[w["sig"] & (w.index < "1986-01-01")]
    gp = w.loc[ev_old, "gauge_proxy"]
    rows.append(dict(sample="Index 1928-1985 (RV21+4 proxy)", rule="entry", variant="skip if proxy > 45",
                     n=len(ev_old), early_exits=int((gp > 45).sum()), max_gauge_at_signal=float(gp.max())))
    R = pd.DataFrame(rows)
    K.save(R, "rules_vix_void_and_ath_exit")
    return R


# ============================================================================ (d) size and stress
def worst_loss(series: pd.Series, h: int) -> float:
    s = series.dropna().values
    r = s[h:] / s[:-h] - 1
    return float(r.min())


def sizing() -> pd.DataFrame:
    tr = K.spx_tr()
    s = K.spy()
    rows = []
    for lab, ser in (("S&P 500 TR 1928-2026", tr), ("SPY 1993-2026", s["aC"])):
        for h in (10, 42, 60, 63, 84):
            rows.append(dict(series=lab, horizon_sessions=h, worst_loss=worst_loss(ser, h)))
    W = pd.DataFrame(rows)
    I = K.inst_spy()
    e = np.arange(1, I.n)
    X = K.exit_positions(I, e, "CAL90")
    ok = X > 0
    worst_cal90_spy = float(np.min(I.ex_open[X[ok]] / I.ent_px[e[ok]] - 1))
    Ii = K.inst_index()
    e2 = np.arange(1, Ii.n)
    X2 = K.exit_positions(Ii, e2, "CAL90")
    ok2 = X2 > 0
    worst_cal90_idx = float(np.min(Ii.mark[X2[ok2]] / Ii.ent_px[e2[ok2]] - 1))
    s10 = abs(W[(W.series.str.startswith("S&P")) & (W.horizon_sessions == 10)].worst_loss.iloc[0])
    s63 = abs(W[(W.series.str.startswith("S&P")) & (W.horizon_sessions == 63)].worst_loss.iloc[0])
    s10_spy = abs(W[(W.series.str.startswith("SPY")) & (W.horizon_sessions == 10)].worst_loss.iloc[0])
    # worst W10 outcomes (CAL90), from the replication output
    T = pd.read_csv(K.RESULTS / "w10_events_all.csv")
    t90 = T[T.rule == "CAL90"]
    worst_trade = t90.groupby("sample").net.min()
    worst_mae = t90.groupby("sample").mae.min()
    defs = {"10-session, S&P 1928-2026 (design rule)": s10, "10-session, SPY only": s10_spy,
            "63-session, S&P 1928-2026 (horizon-matched)": s63,
            "any 90-day window, S&P TR 1928-2026": abs(worst_cal90_idx),
            "any 90-day window, SPY 1993-2026": abs(worst_cal90_spy),
            "worst W10 interim drawdown, 1928-2026": abs(float(worst_mae.min())),
            "worst W10 trade (CAL90), 1928-2026": abs(float(worst_trade.min()))}
    rows = []
    for k, v in defs.items():
        rows.append(dict(stress_definition=k, loss=v, notional_for_2pct=0.02 / v, stress_at_6pct=0.06 * v,
                         stress_at_6_7pct=0.067 * v))
    S = pd.DataFrame(rows)
    K.save(W, "rules_worst_losses")
    K.save(S, "rules_sizing")
    for k in defs:
        K.register("W10 size", k, "S&P/SPY", "diagnostic")
    return W, S, s10


# ============================================================================ (e) cluster simulation
def cluster_sim(rule="CAL90", w10_notional=0.06, phase="A", m4_dte=90, m4_policy="fcfs", with_m2=True,
                spy_stress=None, btc_stress=None, reserved=0.04, total_cap=0.10, m2_stress=0.045, m1_notional=0.06):
    """Day-by-day stress accounting at each session's open (1993-2026, SPY calendar).
    US-equity room reserved for M1 + W10 + M4 = `reserved`; total open stress <= `total_cap` with M2 (4.5%,
    counted once, from 2007-06 when ETF8 has a 252-session history) and M3 (3% x BTC worst 10-day loss) when on.
    M1 is admitted first and never blocked: if the room is short, the open W10 is trimmed.
    Phase B M4 policies: 'fcfs' (M4 takes what room is left; skipped below 90% of one 2% spread),
    'm4_first' (M4 admitted in full, W10 trimmed), 'one_slot' (W10 and M4 share ONE crash-rebound slot:
    whichever is open blocks the other)."""
    I = K.inst_spy()
    idx = I.dates
    n = I.n
    m1 = M.m1_trades()
    w10 = M.w10_trades(rule)
    m1s = m1_notional * spy_stress
    w10s = w10_notional * spy_stress
    m4s = 0.02
    _, on3 = M.m3_on_sessions(idx)
    m3s = 0.03 * btc_stress
    m2_active = (idx >= pd.Timestamp("2007-06-01")) & with_m2
    m4 = M.o2_windows(m4_dte) if phase == "B" else pd.DataFrame(columns=["signal", "entry", "exit"])
    if len(m4):
        m4 = m4[(m4["entry"] > idx[0]) & (m4["exit"] <= idx[-1])]
    m4_e = {idx.get_loc(d): (idx.get_loc(x), sg) for d, x, sg in zip(m4["entry"], m4["exit"], m4["signal"])} if len(m4) else {}
    m1_e = {int(r.e): int(r.X) for r in m1.itertuples()}
    w_e = {int(r.e): (int(r.X), r) for r in w10.itertuples()}
    st = dict(m1=None, w=None, m4=None)
    rows, m4rows = [], []
    for d in range(n):
        if st["m1"] and st["m1"][0] == d:
            st["m1"] = None
        if st["w"] and st["w"]["X"] == d:
            rows.append(st["w"])
            st["w"] = None
        if st["m4"] and st["m4"][0] < d:
            st["m4"] = None
        fixed = (m2_stress if m2_active[d] else 0.0) + (m3s if on3.iloc[d] > 0 else 0.0)

        def used(excl_w=False):
            u = (st["m1"][1] if st["m1"] else 0.0) + (st["m4"][1] if st["m4"] else 0.0)
            if not excl_w and st["w"]:
                u += st["w"]["cur"] * w10s
            return u

        def trim_w(need, why):
            w = st["w"]
            if not w:
                return
            allow = min(reserved - (used(True) + need), total_cap - fixed - (used(True) + need))
            new = max(min(w["cur"], allow / w10s), 0.0)
            if new < w["cur"] - 1e-9:
                w["trims"] += 1
                w["trim_log"].append(f"{idx[d].date()} {why}: {w['cur']:.2f}->{new:.2f}")
                w["cur"] = new
                w["min_scale"] = min(w["min_scale"], new)

        if d in m1_e:                                   # M1: admitted first, never blocked
            trim_w(m1s, "M1")
            st["m1"] = (m1_e[d], m1s)
        if d in w_e:                                    # W10
            X, r = w_e[d]
            allow = min(reserved - used(True), total_cap - fixed - used(True))
            sc = float(np.clip(allow / w10s, 0.0, 1.0))
            if m4_policy == "one_slot" and st["m4"]:
                sc = 0.0
            st["w"] = dict(signal=r.signal.date(), entry=idx[d].date(), exit=idx[X].date(), X=X, net=r.net,
                           scale_entry=sc, cur=sc, min_scale=sc, trims=0, trim_log=[], sess_scale_sum=0.0, sess=0,
                           m1_open_at_entry=bool(st["m1"]), m4_open_at_entry=bool(st["m4"]),
                           m3_on_at_entry=bool(on3.iloc[d] > 0), m2_on=bool(m2_active[d]))
        if d in m4_e:                                   # M4 at 10:00 ET
            x4, sg = m4_e[d]
            w_open = bool(st["w"] and st["w"]["cur"] > 0)
            if m4_policy == "m4_first":
                trim_w(m4s, "M4")
                got = m4s
            elif m4_policy == "one_slot" and w_open:
                got = 0.0
            else:
                allow = min(reserved - used(), total_cap - fixed - used())
                got = min(m4s, allow) if allow >= 0.9 * m4s else 0.0
            if got > 0:
                st["m4"] = (x4, got)
            m4rows.append(dict(signal=sg.date(), entry=idx[d].date(), got=got / m4s, w10_open=w_open,
                               m1_open=bool(st["m1"])))
        if st["w"]:
            st["w"]["sess_scale_sum"] += st["w"]["cur"]
            st["w"]["sess"] += 1
    R = pd.DataFrame(rows)
    if len(R):
        R["avg_scale"] = R["sess_scale_sum"] / R["sess"].clip(lower=1)
        R["trim_log"] = R["trim_log"].apply(lambda z: "; ".join(z))
        R = R.drop(columns=["cur", "sess_scale_sum", "sess", "X"])
    return R, pd.DataFrame(m4rows)


def cluster_scenarios(spy_stress, btc_stress) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    scen = []
    for phase in ("A", "B"):
        for wn in (0.06, 0.067):
            for with_m2 in (False, True):
                pols = ("fcfs", "m4_first", "one_slot") if phase == "B" else ("-",)
                for pol in pols:
                    for rule in ("CAL90", "CAL120", "CAL60"):
                        scen.append((phase, wn, with_m2, pol, rule, 0.04))
    # the design's literal 6% cluster cap with M2's US legs at their 3% maximum -> 3% left for M1/W10/M4
    for wn in (0.06, 0.067):
        scen.append(("A", wn, True, "-", "CAL90", 0.03))
    rows, detail, m4d = [], [], []
    for phase, wn, with_m2, pol, rule, res in scen:
        R, R4 = cluster_sim(rule=rule, w10_notional=wn, phase=phase, m4_dte=FIXED_DTE(rule), m4_policy=pol,
                            with_m2=with_m2, spy_stress=spy_stress, btc_stress=btc_stress, reserved=res)
        lab = dict(phase=phase, w10_notional=wn, with_m2=with_m2, m4_policy=pol, rule=rule, reserved_room=res)
        if len(R) == 0:
            continue
        scaled = R.scale_entry < 0.999
        trimmed = R.trims > 0
        eff = (R.net * R.avg_scale).sum() / R.net.sum() if R.net.sum() != 0 else np.nan
        row = dict(**lab, w10_trades=len(R), scaled_at_entry=int(scaled.sum()),
                   mean_scale_when_scaled=float(R.scale_entry[scaled].mean()) if scaled.any() else np.nan,
                   min_scale_entry=float(R.scale_entry.min()), trimmed_later=int(trimmed.sum()),
                   extra_trim_orders=int(R.trims.sum()),
                   mean_min_scale_when_trimmed=float(R.min_scale[trimmed].mean()) if trimmed.any() else np.nan,
                   avg_exposure_scale=float(R.avg_scale.mean()), w10_pnl_kept=float(eff),
                   m1_open_at_w10_entry=int(R.m1_open_at_entry.sum()), m4_open_at_w10_entry=int(R.m4_open_at_entry.sum()))
        if len(R4):
            row.update(m4_signals=len(R4), m4_cut=int((R4.got < 0.999).sum()), m4_skipped=int((R4.got <= 0).sum()),
                       m4_with_w10_open=int(R4.w10_open.sum()),
                       m4_cut_dates="; ".join(str(x) for x in R4[R4.got < 0.999].signal))
        rows.append(row)
        R2 = R.copy()
        for k, v in lab.items():
            R2[k] = v
        detail.append(R2)
        if len(R4):
            R4 = R4.copy()
            for k, v in lab.items():
                R4[k] = v
            m4d.append(R4)
        K.register("W10 cluster", f"{phase} {wn} m2={with_m2} {pol} {rule} room={res}", "SPY 1993-2026", "diagnostic", len(R))
    S = pd.DataFrame(rows)
    D = pd.concat(detail, ignore_index=True)
    D4 = pd.concat(m4d, ignore_index=True) if m4d else pd.DataFrame()
    K.save(S, "rules_cluster_summary")
    K.save(D[(D.rule == "CAL90")], "rules_cluster_trades_cal90")
    if len(D4):
        K.save(D4[D4.rule == "CAL90"], "rules_cluster_m4_cal90")
    return S, D, D4


def FIXED_DTE(rule):
    return {"CAL60": 60, "CAL90": 90, "CAL120": 120}.get(rule, 90)


# ============================================================================ (f) kill switches
def kill_switch(n_sims=5000, years=(10, 20), rate=0.5) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(K.SEED + 5)
    T = pd.read_csv(K.RESULTS / "w10_trades_one_at_a_time.csv")
    hist = {}
    for lab, samp in (("1990-2026 (SPY/Index)", "Index 1990-2026"), ("1928-2026", "Index 1928-2026")):
        t = T[(T["sample"] == samp) & (T.rule == "CAL90")]
        hist[lab] = t
    # "edge gone" world: CAL90 returns of random uptrend days (index TR, next close), 1928-2026, net of the
    # era pool mean so the drift matches the edge-world draws
    I = K.inst_index()
    allpos = np.arange(I.n - 1)
    tv = K.trade_returns(I, allpos, "CAL90")
    ok = tv["ok"] & I.up[allpos] & (I.dates[np.minimum(allpos, I.n - 1)] >= "1928-10-01")
    null_ret = tv["net"][ok]
    null_edge = null_ret - np.nanmean(null_ret)
    worlds = {"edge gone (random uptrend entries)": (null_ret, null_edge),
              "edge as 1928-2026": (hist["1928-2026"].net.values, hist["1928-2026"].edge_vs_pool.values),
              "edge as 1990-2026": (hist["1990-2026 (SPY/Index)"].net.values,
                                    hist["1990-2026 (SPY/Index)"].edge_vs_pool.values)}
    base_edges = hist["1990-2026 (SPY/Index)"].edge_vs_pool.values
    rows = []
    for yrs in years:
        for wname, (rets, edges) in worlds.items():
            fire = {k: 0 for k in ("K1: 5 losers in a row", "K2: 3 losers in a row",
                                   "K3: cumulative W10 P&L <= -1.5% of NAV (6% size)",
                                   "K4: 1990+ edge p > 0.10 with the new trades",
                                   "K5: any trade <= -15%")}
            for _ in range(n_sims):
                m = rng.poisson(rate * yrs)
                if m == 0:
                    continue
                j = rng.integers(0, len(rets), size=m)
                r = rets[j]
                ed = edges[j]
                loss = r <= 0
                run, best = 0, 0
                for x in loss:
                    run = run + 1 if x else 0
                    best = max(best, run)
                if best >= 5:
                    fire["K1: 5 losers in a row"] += 1
                if best >= 3:
                    fire["K2: 3 losers in a row"] += 1
                if np.min(np.cumsum(0.06 * r)) <= -0.015:
                    fire["K3: cumulative W10 P&L <= -1.5% of NAV (6% size)"] += 1
                if (r <= -0.15).any():
                    fire["K5: any trade <= -15%"] += 1
                # K4: after each new trade, t-test of the pooled edges (historical 1990+ edges + new)
                fired = False
                allv = list(base_edges)
                for k in range(m):
                    allv.append(ed[k])
                    if k >= 1:
                        tt = K.tstat(np.array(allv))
                        p = 2 * (1 - sps.t.cdf(abs(tt), len(allv) - 1))
                        if p > 0.10:
                            fired = True
                            break
                if fired:
                    fire["K4: 1990+ edge p > 0.10 with the new trades"] += 1
            for k, v in fire.items():
                rows.append(dict(years=yrs, world=wname, rule=k, p_fire=v / n_sims))
    P = pd.DataFrame(rows).pivot_table(index=["rule", "years"], columns="world", values="p_fire").reset_index()
    # historical: longest losing streaks, worst cumulative drawdown of the module (at 6%), per sample
    hrows = []
    for samp in ("SPY 1993-2026", "Index 1990-2026", "Index 1928-1989", "Index 1928-2026"):
        t = T[(T["sample"] == samp) & (T.rule == "CAL90")].sort_values("signal")
        loss = (t.net <= 0).values
        run, best = 0, 0
        for x in loss:
            run = run + 1 if x else 0
            best = max(best, run)
        path = np.r_[0.0, np.cumsum(0.06 * t.net.values)]
        dd = float(np.min(path - np.maximum.accumulate(path)))
        hrows.append(dict(sample=samp, trades=len(t), losers=int(loss.sum()), longest_losing_streak=best,
                          worst_trade=float(t.net.min()), worst_cum_drawdown_nav_at_6pct=dd,
                          trades_below_minus15=int((t.net <= -0.15).sum())))
    H = pd.DataFrame(hrows)
    K.save(P, "rules_kill_switch_power")
    K.save(H, "rules_kill_switch_history")
    return P, H


def main():
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    print(calendar_spans().round(3).to_string(index=False))
    print(exit_rule_compare().round(4).to_string(index=False))
    print(void_and_ath().round(4).to_string(index=False))
    W, S, s10 = sizing()
    print(W.round(4).to_string(index=False))
    print(S.round(4).to_string(index=False))
    btc = K.btc_daily().asfreq("D").ffill()
    btc10 = abs(float((btc.shift(-10) / btc - 1).min()))
    print("BTC worst 10-day loss", round(btc10, 4))
    Sc, D, D4 = cluster_scenarios(s10, btc10)
    print(Sc.drop(columns=["m4_cut_dates"], errors="ignore").round(3).to_string(index=False))
    print(Sc[["phase", "w10_notional", "with_m2", "m4_policy", "rule", "m4_cut_dates"]].dropna().to_string(index=False))
    print(D[(D.rule == "CAL90") & (D.phase == "B") & (D.w10_notional == 0.06) & (D.with_m2)][
        ["m4_policy", "signal", "scale_entry", "min_scale", "avg_scale", "trims", "trim_log", "net"]].to_string(index=False))
    P, H = kill_switch()
    print(P.round(4).to_string(index=False))
    print(H.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
