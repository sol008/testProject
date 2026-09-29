"""W8 (de-escalation call spreads) and W9 (barrel-loss oil) at holds of 20 / 40 / 60 trading days.

Events: track 17's curated lists (event_lists17.DEESC, 17 events 1953-2026; OIL_SHOCKS tagged 'disruption',
n = 5).  Day 0 = the first session that could react (track 17 lib17.day0_index).  Entry = the NEXT session
(the system emails after the close): SPY open (1993+) or S&P next close before that.

Part A - edge vs plain drift in the underlying: mean / median forward return over H = 20 / 40 / 60 sessions
         from the entry, against an era-matched placebo (+-3 years, 5,000 draws, two-sided).
Part B - W8 call spreads on the SPX surface (track 14 optmodel; SPY/XSP are 1/10 of SPX), 1990+ events:
         DTE matched to the hold by the design's rule (DTE >= 2 x planned hold in calendar days):
         20 sessions -> 60 DTE, 40 -> 120 DTE, 60 -> 180 DTE.  Strikes +2% / +5% of spot scaled by
         sqrt(DTE/60) (the track 17 example 780/800 at ~80 DTE); sensitivity: fixed +2% / +5%.
         Exit: first close at which the spread is worth >= 80% of its width after costs, else the close of
         session H.  Costs: mid +/- 0.3 x quoted spread per leg + 0.013 SPX points per leg.
         Placebo: the same spread and exits on random sessions within +-3 years.
         Forward drift: the path is re-priced with the S&P drift moved to a CAPE-41 level (4.5% total return).
Part C - W9: WTI spot (FRED) and USO from the next session's close over 20 / 40 / 60 sessions, placebo p.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common21 import BILLS_FWD, KAPPA, RNG_SEED, placebo_p, save
import optmodel as om
from event_lists17 import DEESC, OIL_SHOCKS
from lib17 import day0_index, fred
from w10_duration import panel

HS = [20, 40, 60]
# track 17 report section 3.3: "lasting physical disruption" (n = 5); Abqaiq is classed as fear there
LASTING = {"Iraq invades Kuwait", "Libya civil war shut-ins", "Russia invades Ukraine", "US/EU discuss Russian oil ban",
           "US/Israel-Iran war begins"}
DTE_FOR_H = {20: 60, 40: 120, 60: 180}
NDRAW = 5000
FILL, COMM = 0.30, 0.013


def trad_vectors(df: pd.DataFrame, H: int) -> tuple[np.ndarray, np.ndarray]:
    """(from day-0 close, tradable from the next session) forward returns for every day j."""
    n = len(df)
    C, aC, so, sc = df["C"].values, df["aC"].values, df["spy_aO"].values, df["spy_aC"].values
    j = np.arange(n)
    d0 = np.full(n, np.nan)
    ok = j + H < n
    d0[ok] = C[j[ok] + H] / C[j[ok]] - 1
    tr = np.full(n, np.nan)
    ok2 = j + 1 + H < n
    tr[ok2] = aC[j[ok2] + 1 + H] / aC[j[ok2] + 1] - 1
    spy_ok = ok & np.r_[np.isfinite(so[1:]), False]
    spy_ok &= np.isfinite(sc[np.minimum(j + H, n - 1)])
    tr[spy_ok] = sc[j[spy_ok] + H] / so[j[spy_ok] + 1] - 1
    return d0, tr


def part_a(df, rng):
    idx = df.index
    ev = []
    for lab, date, same_ok, tags in DEESC:
        p = day0_index(idx, date, same_ok)
        ev.append((lab, idx[p], p, "oil" in tags or pd.Timestamp(date) >= pd.Timestamp("1986-01-01")))
    # decluster 30 calendar days (track 17): keep the first
    keep, last = [], None
    for e in ev:
        if last is None or (e[1] - last).days > 30:
            keep.append(e)
            last = e[1]
    rows, per = [], []
    n = len(df)
    for H in HS:
        d0v, trv = trad_vectors(df, H)
        for sub, sel in (("all 16", keep), ("1986+ (oil era)", [e for e in keep if e[1] >= pd.Timestamp("1986-01-01")]),
                         ("SPY era 1993+", [e for e in keep if e[1] >= pd.Timestamp("1993-02-01")])):
            pos = [e[2] for e in sel if e[2] + 1 + H < n]
            for key, v in (("from day-0 close", d0v), ("tradable next session", trv)):
                x = v[pos]
                draws = np.zeros(NDRAW)
                for p0 in pos:
                    a, b = max(0, p0 - 756), min(n - 2 - H, p0 + 756)
                    draws += v[rng.integers(a, b + 1, size=NDRAW)]
                draws /= len(pos)
                rows.append(dict(set=sub, H=H, series=key, n=len(x), mean=np.nanmean(x), median=np.nanmedian(x),
                                 hit=np.mean(x > 0), placebo=draws.mean(), edge=np.nanmean(x) - draws.mean(),
                                 p_era=placebo_p(np.nanmean(x), draws)))
        for e in keep:
            if e[2] + 1 + H < n:
                per.append(dict(event=e[0], day0=e[1].date(), H=H, trad=trv[e[2]], from_d0=d0v[e[2]]))
    A = pd.DataFrame(rows)
    save(A, "w8_underlying")
    Pe = pd.DataFrame(per).pivot_table(index=["event", "day0"], columns="H", values="trad").reset_index()
    save(Pe, "w8_events")
    return A, Pe, keep


# ---------------------------------------------------------------- call spreads on the SPX surface
def spread_paths(mk, e_pos: np.ndarray, H: int, dte: int, k1: float, k2: float, dmu: float = 0.0):
    """Vectorised over entry sessions e (entry at the close of e).  Returns R per entry (TP at 80% of the
    width after costs, else the close of session e+H)."""
    idx = mk.index
    mode_, markup = om.settings()
    S = mk.spx.values
    vl = mk[["vix9d", "vix", "vix3m", "vix6m"]].values
    m = om.m_from_mode(mk.m_skew.values, mode_)
    r, q, vix = mk.rf.values, mk.q.values, mk.vix.values
    yr = idx.year.values
    e = e_pos
    E_dates = idx[e] + pd.Timedelta(days=dte)
    S0 = S[e]
    K1, K2 = S0 * (1 + k1), S0 * (1 + k2)
    tau0 = (E_dates - idx[e]).days.values.astype(float)
    c1, _ = om.price(S0, K1, tau0, r[e], q[e], vl[e], m[e], "call", iv_markup=markup)
    c2, _ = om.price(S0, K2, tau0, r[e], q[e], vl[e], m[e], "call", iv_markup=markup)
    s1, s2 = om.quoted_spread(c1, vix[e], yr[e]), om.quoted_spread(c2, vix[e], yr[e])
    debit = (c1 + FILL * s1 + COMM) - (c2 - FILL * s2 - COMM)
    width = K2 - K1
    done = np.zeros(len(e), bool)
    val_exit = np.full(len(e), np.nan)
    for k in range(1, H + 1):
        x = e + k
        tau = (E_dates - idx[x]).days.values.astype(float)
        Sx = S[x] * np.exp(dmu * (idx[x] - idx[e]).days.values / 365.0)
        v1, _ = om.price(Sx, K1, tau, r[x], q[x], vl[x], m[x], "call", iv_markup=markup)
        v2, _ = om.price(Sx, K2, tau, r[x], q[x], vl[x], m[x], "call", iv_markup=markup)
        t1, t2 = om.quoted_spread(v1, vix[x], yr[x]), om.quoted_spread(v2, vix[x], yr[x])
        net = np.maximum((v1 - FILL * t1 - COMM) - (v2 + FILL * t2 + COMM), 0.0)
        hit = (~done) & (net >= 0.8 * width)
        last = (~done) & (k == H)
        val_exit[hit | last] = net[hit | last]
        done |= hit
    return val_exit / debit - 1, debit / S0, width / debit


def part_b(df, keep, rng):
    mk = om.market()
    idx = mk.index
    s = mk.spx.loc["1990-01-02":]
    mu_hist = np.log(s.iloc[-1] / s.iloc[0]) / ((s.index[-1] - s.index[0]).days / 365.25)
    dmu_fwd = (np.log(1.045) - np.log(1.012)) - mu_hist
    ev = [(lab, d) for (lab, d, p, _) in keep if d >= pd.Timestamp("1990-02-01")]
    ev_entry = np.array([idx.get_loc(idx[idx.searchsorted(d)]) + 1 for _, d in ev])
    rows = []
    n = len(idx)
    for H in HS:
        dte = DTE_FOR_H[H]
        for sname, (k1, k2) in (("sqrt-scaled", (0.02 * np.sqrt(dte / 60), 0.05 * np.sqrt(dte / 60))),
                                ("fixed 102/105", (0.02, 0.05))):
            for dname, dmu in (("history", 0.0), ("fwd 4.5%", dmu_fwd)):
                valid = np.arange(260, n - H - 1)
                valid = valid[(idx[valid] + pd.Timedelta(days=dte)) <= idx[-1]]
                valid = valid[np.isfinite(mk.vix.values[valid])]
                R_all, dpct, mult = spread_paths(mk, valid, H, dte, k1, k2, dmu)
                fin = np.isfinite(R_all)
                valid, R_all, dpct, mult = valid[fin], R_all[fin], dpct[fin], mult[fin]
                Rs = pd.Series(R_all, index=valid)
                evR = Rs.reindex(ev_entry).values
                okm = np.isfinite(evR)
                draws = np.zeros(NDRAW)
                vpos = np.searchsorted(valid, ev_entry[okm])
                for p0 in vpos:
                    a, b = max(0, p0 - 756), min(len(valid) - 1, p0 + 756)
                    draws += R_all[rng.integers(a, b + 1, size=NDRAW)]
                draws /= okm.sum()
                obs = np.nanmean(evR)
                rows.append(dict(H=H, dte=dte, strikes=sname, drift=dname, n=int(okm.sum()), mean_R=obs,
                                 median_R=np.nanmedian(evR), win=np.nanmean(evR > 0), placebo_R=draws.mean(),
                                 edge=obs - draws.mean(), p_era=placebo_p(obs, draws),
                                 debit_pct_spot=np.nanmean(dpct), max_mult=np.nanmean(mult),
                                 all_days_mean_R=np.nanmean(R_all)))
                if sname == "sqrt-scaled" and dname == "history":
                    for (lab, d), r_ in zip(ev, evR):
                        rows[-1].setdefault("events", []).append((lab, str(d.date()), round(float(r_), 3) if np.isfinite(r_) else None))
    B = pd.DataFrame(rows)
    ev_detail = B.pop("events") if "events" in B else None
    save(B, "w8_spreads")
    return B, ev_detail, mu_hist


def part_c(rng):
    wti = fred("DCOILWTICO")
    wti = wti[wti > 0]
    px = pd.read_csv("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/17-short-macro/prices_adj.csv",
                     index_col=0, parse_dates=True)
    uso = px["USO"].dropna()
    rows = []
    for name, s in (("WTI spot", wti), ("USO", uso)):
        idx = s.index
        v = s.values
        n = len(v)
        pos = []
        for lab, date, same_ok, tags in OIL_SHOCKS:
            if lab not in LASTING:
                continue
            p = day0_index(idx, date, same_ok)
            if p is None or (idx[p] - pd.Timestamp(date)).days > 7:
                continue
            pos.append((lab, p))
        for H in HS:
            f = np.full(n, np.nan)
            f[: n - 1 - H] = v[1 + H:] / v[1: n - H] - 1           # from the next session's close
            x = np.array([f[p] for _, p in pos])
            okm = np.isfinite(x)
            draws = np.zeros(NDRAW)
            for _, p0 in [pp for pp, o in zip(pos, okm) if o]:
                a, b = max(0, p0 - 756), min(n - 2 - H, p0 + 756)
                draws += f[rng.integers(a, b + 1, size=NDRAW)]
            draws /= max(okm.sum(), 1)
            rows.append(dict(series=name, H=H, n=int(okm.sum()), mean=np.nanmean(x), median=np.nanmedian(x),
                             placebo=np.nanmean(draws), p_era=placebo_p(np.nanmean(x), draws),
                             events="; ".join(f"{lab}: {100 * xx:+.1f}%" for (lab, _), xx in zip(pos, x) if np.isfinite(xx))))
    C = pd.DataFrame(rows)
    save(C, "w9_underlying")
    return C


def main():
    rng = np.random.default_rng(RNG_SEED + 8)
    df = panel()
    A, Pe, keep = part_a(df, rng)
    pd.set_option("display.width", 250)
    print("W8 events kept (declustered):", len(keep))
    print(A.round(4).to_string(index=False))
    print(Pe.round(4).to_string(index=False))
    B, evd, mu = part_b(df, keep, rng)
    print("\nmu_hist %.4f" % mu)
    print(B.round(4).to_string(index=False))
    if evd is not None:
        for v in evd.dropna():
            print(v)
    C = part_c(rng)
    print(C.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
