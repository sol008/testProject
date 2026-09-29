"""Family 3: sector / industry momentum with 3-month holds (top-k rotation re-decided every 42 / 63 / 84 sessions)
versus the monthly (21-session) rotation track 13 rejected.

Universes
  * KF12  - Ken French 12 industry portfolios, value-weighted, daily 1926-2026 (not tradable; long history).
  * KF49  - Ken French 49 industries, daily (breadth check; top 3 / 5, as in Moskowitz & Grinblatt 1999).
  * SPDR9 - the nine 1998 Select Sector SPDRs (XLB XLE XLF XLI XLK XLP XLU XLV XLY), dividend-adjusted, traded
            at the next OPEN (dollar market orders), 1999-2026.  XLRE / XLC are excluded (too short).
Rule: at a rebalance close t rank the universe by trailing total return over L sessions (L = 63, 126, or 252 with the
last 21 skipped, i.e. 12-1); hold the top k equally weighted for H sessions (H = 21 monthly, 42, 63, 84); optional
absolute-momentum filter (a slot whose trailing return is below T-bills sits in T-bills).  Every phase offset of
the H-session schedule is run and averaged (the min-max across offsets is kept), as track 22 did for trend.
Benchmarks: the value-weighted market (Ken French Mkt) for KF; SPY for SPDR9.  Active return = strategy minus
benchmark over the same holding period.  Costs: SPDR 2-4 bp per side (track 13) on the replaced fraction; KF 5 bp.
Design = before 2008, test = 2008-2026.
Orders: k = 1 needs <= 2 orders per rebalance; k = 2 up to 4 and k = 3 up to 6, above the design's 3 per email.
Outputs: results/f3_*.csv
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import common24 as C  # noqa: E402

SPDR = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"]
LOOKS = {"L63": (63, 0), "L126": (126, 0), "L252s21": (252, 21)}
HS = (21, 42, 63, 84)


def kf_universe(name: str) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    r = C.kf_table(name, which=0, daily=True)
    f = C.kf_table("F-F_Research_Data_Factors_daily", which=0, daily=True)
    mkt = (f["Mkt-RF"] + f["RF"]).reindex(r.index)
    rf = f["RF"].reindex(r.index).fillna(0)
    r = r.dropna(how="all")
    return r, mkt.reindex(r.index), rf.reindex(r.index).fillna(0)


def run(rets: pd.DataFrame, bench: pd.Series, rf: pd.Series, L: int, skip: int, k: int, H: int, absf: bool,
        cost_bp: np.ndarray, start: str, end: str, open_px: pd.DataFrame | None = None,
        bench_open: pd.Series | None = None) -> list[pd.DataFrame]:
    """Per-offset holding-period tables for one variant.  Close-to-close with a 1-session lag (KF) or
    open-to-open (ETFs, open_px given): signal at close t, trade at t+1."""
    idx = rets.index
    tr = (1 + rets.fillna(0)).cumprod()
    avail = rets.notna().cumsum()
    lvl = tr.values
    ok_hist = avail.values
    bl = (1 + bench.fillna(0)).cumprod().values
    rfl = (1 + rf).cumprod().values
    if open_px is not None:
        op = open_px.values
        bo = bench_open.values
    lo, hi = idx.searchsorted(pd.Timestamp(start)), idx.searchsorted(pd.Timestamp(end), side="right")
    out = []
    for off in range(H):
        rows = []
        prev = set()
        t = max(lo, L + 5) + off
        while t + 1 + H < min(hi, len(idx)):
            a, b = t - L, t - skip
            trail = lvl[b] / lvl[a] - 1
            eligible = (ok_hist[t] - ok_hist[a] >= L - 5)
            trail = np.where(eligible, trail, np.nan)
            order = np.argsort(-np.nan_to_num(trail, nan=-9e9))
            picks = [j for j in order[:k] if np.isfinite(trail[j])]
            rf_L = rfl[b] / rfl[a] - 1
            if absf:
                picks_live = [j for j in picks if trail[j] > rf_L]
            else:
                picks_live = picks
            e, x = t + 1, t + 1 + H
            if open_px is not None:
                pr = [op[x, j] / op[e, j] - 1 for j in picks_live]
                br = bo[x] / bo[e] - 1
            else:
                pr = [lvl[x, j] / lvl[e, j] - 1 for j in picks_live]
                br = bl[x] / bl[e] - 1
            rfh = rfl[x] / rfl[e] - 1
            n_bills = k - len(picks_live)
            port = (np.nansum(pr) + n_bills * rfh) / k if k else rfh
            now = set(picks_live)
            replaced = len(now - prev) + len(prev - now)
            cost = replaced / k * float(np.mean(cost_bp)) / 1e4
            prev = now
            rows.append(dict(t=idx[t], port=port - cost, bench=br, rf=rfh, active=port - cost - br,
                             excess=port - cost - rfh, n_in=len(picks_live), replaced=replaced))
            t += H
        out.append(pd.DataFrame(rows))
    return out


def summarize(tabs: list[pd.DataFrame], H: int) -> dict:
    means, ts, cagr_s, cagr_b, ex = [], [], [], [], []
    for d in tabs:
        if len(d) < 8:
            continue
        a = d["active"].values
        means.append(a.mean() * 252 / H)
        ts.append(a.mean() / a.std(ddof=1) * np.sqrt(len(a)) if a.std(ddof=1) > 0 else np.nan)
        yrs = len(d) * H / 252
        cagr_s.append(np.prod(1 + d["port"].values) ** (1 / yrs) - 1)
        cagr_b.append(np.prod(1 + d["bench"].values) ** (1 / yrs) - 1)
        ex.append(d["excess"].mean() * 252 / H)
    if not means:
        return {}
    d0 = tabs[0]
    return dict(active_yr=float(np.mean(means)), active_min=float(np.min(means)), active_max=float(np.max(means)),
                t_med=float(np.nanmedian(ts)), cagr=float(np.mean(cagr_s)), cagr_bench=float(np.mean(cagr_b)),
                excess_yr=float(np.mean(ex)), n_periods=int(np.mean([len(t) for t in tabs])),
                buys_yr=float(d0["replaced"].sum() / 2 / max(len(d0) * H / 252, 1e-9)),
                sd_active=float(np.mean([t["active"].std(ddof=1) for t in tabs if len(t) > 2])))


def main():
    rows = []
    universes = {}
    r12, m12, rf12 = kf_universe("12_Industry_Portfolios_daily")
    universes["KF12"] = (r12, m12, rf12, None, None, np.full(12, 5.0), [("design", "1927-01-01", "2007-12-31"),
                                                                        ("test", "2008-01-01", "2026-12-31")], (1, 2, 3))
    r49, m49, rf49 = kf_universe("49_Industry_Portfolios_daily")
    universes["KF49"] = (r49, m49, rf49, None, None, np.full(49, 5.0), [("design", "1927-01-01", "2007-12-31"),
                                                                        ("test", "2008-01-01", "2026-12-31")], (3, 5))
    fr = {t: C.yf_frame(t) for t in SPDR + ["SPY"]}
    idx = fr["XLK"].index
    for t in fr:
        idx = idx.intersection(fr[t].index)
    close = pd.DataFrame({t: fr[t]["aC"].reindex(idx) for t in SPDR})
    opn = pd.DataFrame({t: fr[t]["aO"].reindex(idx) for t in SPDR})
    rets = close.pct_change()
    spy = fr["SPY"].reindex(idx)
    rfs = fr["SPY"]["rf"].reindex(idx).fillna(0)
    costs = np.array([C.C13.base_cost(t) for t in SPDR])
    universes["SPDR9"] = (rets.iloc[1:], spy["aC"].pct_change().iloc[1:], rfs.iloc[1:], opn.iloc[1:], spy["aO"].iloc[1:],
                          costs, [("design", "1999-01-01", "2007-12-31"), ("test", "2008-01-01", "2026-12-31")], (1, 2, 3))
    for uname, (rets_u, bench, rf, op, bo, cbp, pers, ks) in universes.items():
        for lname, (L, skip) in LOOKS.items():
            for k in ks:
                for H in HS:
                    for absf in (False, True):
                        for role, a, b in pers:
                            tabs = run(rets_u, bench, rf, L, skip, k, H, absf, cbp, a, b, op, bo)
                            st = summarize(tabs, H)
                            if not st:
                                continue
                            st.update(universe=uname, look=lname, k=k, H=H, absmom=absf, role=role,
                                      period=f"{a[:4]}-{b[:4]}")
                            rows.append(st)
                            C.Ledger.add("f3_sector_momentum", f"{uname} {lname} k{k} H{H} abs{int(absf)}", role,
                                         st["n_periods"], st["t_med"], active_yr=st["active_yr"])
        print(uname, "done", len(rows), flush=True)
    res = pd.DataFrame(rows)
    C.save(res, "f3_rotation_variants")
    # design-selected variant per universe and hold -> its test result
    sel = []
    for (u, H), g in res.groupby(["universe", "H"]):
        d = g[g.role == "design"].sort_values("t_med", ascending=False)
        if not len(d):
            continue
        best = d.iloc[0]
        t = g[(g.role == "test") & (g.look == best.look) & (g.k == best.k) & (g.absmom == best.absmom)]
        sel.append(dict(universe=u, H=H, look=best.look, k=best.k, absmom=best.absmom, design_active=best.active_yr,
                        design_t=best.t_med, test_active=t.active_yr.iloc[0] if len(t) else np.nan,
                        test_t=t.t_med.iloc[0] if len(t) else np.nan,
                        test_share_pos=(g[g.role == "test"].active_yr > 0).mean()))
    sel = pd.DataFrame(sel)
    C.save(sel, "f3_selection")
    # hold-length profile: average over all variants of each universe/role
    prof = res.groupby(["universe", "role", "H"]).agg(active_mean=("active_yr", "mean"), active_median=("active_yr", "median"),
                                                       share_pos=("active_yr", lambda x: (x > 0).mean()),
                                                       t_mean=("t_med", "mean"), n=("active_yr", "size")).reset_index()
    C.save(prof, "f3_hold_profile")
    C.Ledger.save("f3_sector_momentum")
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        print(prof.round(4).to_string(index=False))
        print(sel.round(4).to_string(index=False))
        v = res[(res.universe == "SPDR9") & (res.k == 1) & (~res.absmom)]
        print(v[["look", "H", "role", "active_yr", "t_med", "active_min", "active_max", "cagr", "cagr_bench", "buys_yr"]].round(4).to_string(index=False))


if __name__ == "__main__":
    main()
