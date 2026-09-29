"""Family 2: option premium at longer DTE -- put spreads at 60-120 DTE vs M7's 40-50 DTE.

Two kinds of evidence (labelled everywhere):
  A. REAL PRICES: is the variance risk premium (implied minus subsequently realised S&P variance, per year) smaller
     at 3- and 6-month tenors than at 1 month?  CBOE VIX (30 d, 1990-), VIX3M (93 d, real from 2006-07), VIX6M
     (183 d, 2008-) against realised variance of S&P 500 daily log returns over the next 21 / 63 / 126 sessions.
     Monthly observations, Newey-West t.  (Mechanism: selling longer-dated premium earns less per unit of time.)
  B. MODELLED PRICES (an approximation): track 14's calibrated synthetic SPX surface (optmodel; 'blend', -5% IV).
     M7's structure -- sell the 0.20-delta put, buy the put 5% of spot lower -- entered on a monthly schedule
     (last session <= monthly expiry - DTE) at DTE 45 (= M7), 60, 90, 120.
       exits : tp21  = GTC buy-back at 50% of credit, else close at 21 DTE (M7's rule)
               hold  = close at the close of the session before expiry (design section 3a)
               capX  = 50% take-profit, else close at the last session within X calendar days of entry
       filters: M7 (SPX > 200-day average, VIX < 30, VIX/VIX3M < 1.0; VIX3M proxied before 2006-07) | none
       costs : design fill model, mid -/+ 0.30 x the summed quoted leg spreads + 0.013 SPX pts per leg per side;
               'xsp' stress = 2x spreads and $0.75 per leg.
       drift : history, or the S&P path re-drifted to a CAPE-41 forward total return of 3 / 4.5 / 6% a year
               (track 21's convention: dmu = ln(1+TR) - ln(1+1.2% dividend) - the 1990-2026 price drift).
     One spread at a time (the 2% max-loss cap, the 3% factor premium budget and M7's own rule), so a longer DTE
     means fewer trades a year.  R = P&L / max loss.  Track 14 found the surface ~+0.6% of max loss per put-spread
     cycle too generous after 2008; that bias is subtracted in the contribution table.
Hold lengths: 45 DTE tp21 <= 24 days; 60 tp21 <= 39; 90 tp21 <= 69 (needs the 90-day cap); 120 tp21 <= 99 (needs
120); hold-to-expiry needs a cap >= DTE.  Every variant is also run with a cap-bound exit so each cap's best
feasible rule can be compared.
Outputs: results/f2_*.csv
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import common24 as C  # noqa: E402
import optmodel as om  # noqa: E402
from spreadsim import build_legs, max_loss, third_fridays  # noqa: E402

FILL = 0.30
COMM = 0.013
COMM_XSP = 0.075
DTES = (45, 60, 90, 120)
DIV = 0.012
MODEL_BIAS = 0.006        # track 14: surface ~+0.6% of max loss per put-spread cycle too generous after 2008


# ============================================================================ A. real-price VRP term structure
def vrp_term_structure(mk: pd.DataFrame) -> pd.DataFrame:
    r = np.log(mk.spx).diff()
    rows = []
    me = mk.index.to_series().groupby(mk.index.to_period("M")).last().values
    tenors = {"VIX (30d)": ("vix", 21), "VIX3M (93d)": ("vix3m_act", 63), "VIX6M (183d)": ("vix6m_real", 126)}
    mk = mk.copy()
    v6 = om.cboe("VIX6M")
    mk["vix6m_real"] = v6.reindex(mk.index)
    pos = {d: i for i, d in enumerate(mk.index)}
    rr = r.values
    obs = []
    for d in me:
        i = pos[pd.Timestamp(d)]
        rec = dict(date=pd.Timestamp(d))
        for lab, (col, h) in tenors.items():
            iv = mk[col].iloc[i]
            if not np.isfinite(iv) or i + h >= len(rr):
                rec[lab] = np.nan
                continue
            rv = np.nansum(rr[i + 1:i + 1 + h] ** 2) * 252.0 / h
            rec[lab] = (iv / 100.0) ** 2 - rv
            rec[lab + "_iv2"] = (iv / 100.0) ** 2
            rec[lab + "_rv2"] = rv
        obs.append(rec)
    ob = pd.DataFrame(obs).set_index("date")
    for pname, a, b in (("1990-2007", "1990-01-01", "2007-12-31"), ("2008-2026", "2008-01-01", "2026-12-31"),
                        ("common 2008-2026 (all three)", "2008-01-01", "2026-12-31")):
        sub = ob.loc[a:b]
        if pname.startswith("common"):
            sub = sub.dropna(subset=list(tenors))
        for lab, (col, h) in tenors.items():
            x = sub[lab].dropna()
            if len(x) < 24:
                continue
            lags = max(1, h // 21)
            rows.append(dict(period=pname, tenor=lab, n_months=len(x), vrp_var_pts=1e4 * x.mean(),
                             vrp_median=1e4 * x.median(), nw_t=C.nw_t(x.values, lags),
                             share_pos=(x > 0).mean(), iv2=1e4 * sub[lab + "_iv2"].dropna().mean(),
                             rv2=1e4 * sub[lab + "_rv2"].dropna().mean(), worst=1e4 * x.min()))
    return pd.DataFrame(rows)


# ============================================================================ B. modelled put spreads
def path(mk, d0, E, legs, mode, markup, dmu=0.0):
    days = mk.loc[d0:E]
    tau = (E - days.index).days.values.astype(float)
    shift = np.exp(dmu * (days.index - d0).days.values / 365.0)
    S = days.spx.values * shift
    r, q = days.rf.values, days.q.values
    vl = days[["vix9d", "vix", "vix3m", "vix6m"]].values
    m = om.m_from_mode(days.m_skew.values, mode)
    V = np.zeros(len(days))
    spr = np.zeros(len(days))
    live = tau > 0
    for kind, sign, K in legs:
        p = np.zeros(len(days))
        if live.any():
            p[live], _ = om.price(S[live], np.full(live.sum(), K), tau[live], r[live], q[live], vl[live], m[live], kind,
                                  iv_markup=markup)
        intrinsic = np.maximum(K - S, 0) if kind == "put" else np.maximum(S - K, 0)
        p[~live] = intrinsic[~live]
        V += sign * p
        spr += np.where(live, om.quoted_spread(p, days.vix.values, days.index.year.values), 0.0)
    return dict(dates=days.index, tau=tau, S=S, V=V, spr=spr)


def manage(pth, legs, rule: str, cost: str):
    sm, comm = (1.0, COMM) if cost == "base" else (2.0, COMM_XSP)
    V, spr, tau, dates = pth["V"], pth["spr"] * sm, pth["tau"], pth["dates"]
    nleg = len(legs)
    credit = V[0] - FILL * spr[0] - nleg * comm
    ml = max_loss(legs, credit)
    if credit <= 0 or ml <= 0:
        return None
    close_cost = np.where(tau > 0, V + FILL * spr + nleg * comm, V)
    pnl = credit - close_cost
    last = len(V) - 2 if len(V) >= 2 else len(V) - 1          # the session before expiry (design section 3a)
    cap_days = None
    if rule.startswith("cap"):
        cap_days = int(rule[3:])
    exit_i, reason = last, "t-1"
    held = (dates - dates[0]).days.values
    for i in range(1, last + 1):
        if rule in ("tp21",) or rule.startswith("cap"):
            if close_cost[i] <= 0.5 * credit:
                exit_i, reason = i, "take_profit"
                break
        if rule == "tp21" and tau[i] <= 21:
            exit_i, reason = i, "dte21"
            break
        if cap_days is not None and (i + 1 <= last) and held[i + 1] > cap_days:
            exit_i, reason = i, "cap"
            break
    return dict(R=float(pnl[exit_i] / ml), exit=dates[exit_i], days=int(held[exit_i]), reason=reason,
                min_R=float((pnl[:exit_i + 1] / ml).min()), credit_ml=float(credit / ml))


def flags(row) -> dict:
    ts = row.vix / row.vix3m_act if np.isfinite(row.vix3m_act) else row.vix / row.vix3m
    m7 = bool(np.isfinite(row.ma200) and row.spx > row.ma200 and row.vix < 30 and ts < 1.0)
    return dict(F0=True, M7=m7)


def simulate(mk: pd.DataFrame, dmus: dict) -> pd.DataFrame:
    mode, markup = om.settings()
    exps = third_fridays(mk.index)
    exps = exps[(exps >= "1990-06-01") & (exps <= mk.index[-1])]
    rules = {45: ["tp21", "hold", "cap60"], 60: ["tp21", "hold", "cap60"],
             90: ["tp21", "hold", "cap60", "cap90"], 120: ["tp21", "hold", "cap60", "cap90", "cap120"]}
    rows = []
    for dte in DTES:
        for E in exps:
            cand = mk.index[mk.index <= E - pd.Timedelta(days=dte)]
            if len(cand) == 0 or cand[-1] < pd.Timestamp("1990-06-01"):
                continue
            d0 = cand[-1]
            row = mk.loc[d0]
            if not np.isfinite(row.ma200):
                continue
            tau0 = float((E - d0).days)
            legs = build_legs(row, tau0, "PCS", 0.20, 0.05, mode, markup)
            fl = flags(row)
            for dlab, dmu in dmus.items():
                pth = path(mk, d0, E, legs, mode, markup, dmu)
                for rule in rules[dte]:
                    for cost in (("base", "xsp") if dlab == "history" else ("base",)):
                        res = manage(pth, legs, rule, cost)
                        if res is None:
                            continue
                        rows.append(dict(dte=dte, rule=rule, cost=cost, drift=dlab, entry=d0, expiry=E, **fl, **res))
        print("dte", dte, "done", len(rows), flush=True)
    return pd.DataFrame(rows)


def one_at_a_time(tr: pd.DataFrame) -> pd.DataFrame:
    """Sequence monthly entries so that a new spread opens only after the previous one closed."""
    out = []
    tr = tr.sort_values("entry")
    last_exit = pd.Timestamp("1900-01-01")
    for r in tr.itertuples(index=False):
        if r.entry <= last_exit:
            continue
        out.append(r._asdict())
        last_exit = r.exit
    return pd.DataFrame(out)


def feasible_caps(dte: int, rule: str) -> list[int]:
    """Caps (calendar days) under which the rule's longest possible hold fits."""
    if rule.startswith("cap"):
        c = int(rule[3:])
        return [x for x in (60, 90, 120) if x >= c]
    longest = dte - 21 if rule == "tp21" else dte - 1
    return [x for x in (60, 90, 120) if longest <= x]


def stats_table(tr: pd.DataFrame) -> pd.DataFrame:
    rows = []
    periods = {"1990-2007": ("1990-01-01", "2007-12-31"), "2008-2026": ("2008-01-01", "2026-12-31"),
               "1990-2026": ("1990-01-01", "2026-12-31")}
    for (dte, rule, cost, drift), g in tr.groupby(["dte", "rule", "cost", "drift"]):
        for filt in ("M7", "F0"):
            gf = g[g[filt]]
            for pname, (a, b) in periods.items():
                gp = gf[(gf.entry >= a) & (gf.entry <= b)]
                if len(gp) < 5:
                    continue
                seq = one_at_a_time(gp)
                yrs = C.years(max(pd.Timestamp(a), pd.Timestamp("1990-06-01")), min(pd.Timestamp(b), pd.Timestamp("2026-09-25")))
                st_all = C.window_stats(gp.R.values)
                st_seq = C.window_stats(seq.R.values)
                rows.append(dict(dte=dte, rule=rule, cost=cost, drift=drift, filter=filt, period=pname,
                                 caps=",".join(str(x) for x in feasible_caps(dte, rule)),
                                 n_all=st_all.get("n"), mean_all=st_all.get("mean"), t_all=st_all.get("t"),
                                 n_seq=st_seq.get("n"), per_yr=st_seq.get("n", 0) / yrs, mean_R=st_seq.get("mean"),
                                 median_R=st_seq.get("median"), win=st_seq.get("win"), worst=st_seq.get("worst"),
                                 t=st_seq.get("t"), sr=st_seq.get("sr"), skew=st_seq.get("skew"), kurt=st_seq.get("kurt"),
                                 days_held=seq.days.mean(), R_per_30d=(seq.R.sum() / max(seq.days.sum(), 1)) * 30,
                                 contrib_2pct=0.02 * st_seq.get("n", 0) / yrs * (st_seq.get("mean") or 0)))
    return pd.DataFrame(rows)


def main():
    mk = om.market()
    s = mk.spx.loc["1990-01-02":]
    mu_hist = np.log(s.iloc[-1] / s.iloc[0]) / ((s.index[-1] - s.index[0]).days / 365.25)
    dmus = {"history": 0.0}
    for lab, eq in (("fwd_lo", C.EQ_FWD[0]), ("fwd_mid", C.EQ_FWD[1]), ("fwd_hi", C.EQ_FWD[2])):
        dmus[lab] = (np.log(1 + eq) - np.log(1 + DIV)) - mu_hist
    vrp = vrp_term_structure(mk)
    C.save(vrp, "f2_vrp_term_structure")
    print(vrp.round(3).to_string(index=False), flush=True)
    tr = simulate(mk, dmus)
    # the full trade list (every drift and cost case) goes to the scratchpad; results/ keeps the headline subset:
    # M7-filtered entries, base costs, historical drift
    tr.to_csv(C.SCRATCH / "f2_putspread_trades_all.csv.gz", index=False, float_format="%.6g", compression="gzip")
    C.save(tr[(tr.cost == "base") & (tr.drift == "history") & tr["M7"]].drop(columns=["cost", "drift"]), "f2_putspread_trades")
    st = stats_table(tr)
    C.save(st, "f2_putspread_stats")
    # ledger: every (dte, rule, filter) at base cost, history, 2008-2026, one-at-a-time
    b = st[(st.cost == "base") & (st.drift == "history") & (st.period == "2008-2026")]
    for r in b.itertuples(index=False):
        C.Ledger.add("f2_option_premium", f"PCS20d5% DTE{r.dte} {r.rule} {r.filter}", "2008-2026 model", r.n_seq, r.t,
                     mean_R=r.mean_R, contrib=r.contrib_2pct)
    C.Ledger.save("f2_option_premium")
    with pd.option_context("display.width", 250, "display.max_columns", 40):
        cols = ["dte", "rule", "filter", "period", "caps", "n_seq", "per_yr", "mean_R", "median_R", "win", "worst", "t",
                "days_held", "R_per_30d", "contrib_2pct"]
        for drift in ("history", "fwd_mid"):
            v = st[(st.cost == "base") & (st.drift == drift) & (st["filter"] == "M7")]
            print("==", drift)
            print(v[cols].round(4).to_string(index=False))


if __name__ == "__main__":
    main()
