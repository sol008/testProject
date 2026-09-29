"""Track 38 (growth-book synthesis): the numbers behind research/38-growth-book-synthesis.md.

    python3 run38.py                 # everything, about 3-6 minutes on 4 cores, fixed seeds
    python3 run38.py --paths 500     # quicker, noisier

Objective (track 34 s5.1): maximise expected log growth subject to P(max drawdown over 10 years > D) <= 10%,
for D = 30%, 40% and 50%, under three belief sets:
    forward-central     track 31's forward sleeves (equities 4.5%/yr at CAPE ~41, T-bills 4.2%, Bitcoin 7.5%/yr
                        buy-and-hold before the switch's shrunk timing edge), window 2008-2026
    historical-repeat   the same sleeves as they happened, 2008-2026 (Bitcoin from Nov 2014)
    blend               a 50/50 mixture of the two worlds' paths (common random numbers: same block draws)

Inputs: the daily sleeve returns track 31 built and cached (TRACK31_DATA/inputs/{hist,fwd_2008-2026}; rebuilt by
research/code/31-growth-portfolio/run_all.py) and track 04's cached BTC-USD closes (TRACK04_DATA/yf_BTC_USD.csv).
Nothing here touches the network. Outputs: results/*.csv and results/summary.txt.

Extensions to track 31 (kept minimal):
  * the Bitcoin switch with track 28's extra 200-day condition (BTC10w200), and a Bitcoin-flat variant;
  * a gems satellite stream (track 35's distribution), an explicit estimate;
  * D = 30/40/50% constraints, two more governors, and the sensitivities the synthesis asks for.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "31-growth-portfolio"))
import engine31 as E  # noqa: E402  track 31's bootstrap engine and governors

RES = HERE / "results"
RES.mkdir(exist_ok=True)
SCRATCH = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad"
T31 = Path(os.environ.get("TRACK31_DATA", f"{SCRATCH}/31-growth")) / "inputs"
T04 = Path(os.environ.get("TRACK04_DATA", f"{SCRATCH}/04-derivatives/data"))
TD = 252
A, B = "2008-01-01", "2026-09-28"
SEED = 38
BILLS_FWD, ER_IBIT, SWITCH_COST, MONDAY_OLD_SHARE = 0.042, 0.0025, 0.0005, 13.5 / 24
GEMS_W = 0.15              # the gems satellite's reference size (track 35's G1 5% + G2 2 x 5%)
DS = (0.30, 0.40, 0.50)    # the drawdown limits
TOL = 0.10                 # P(max drawdown over 10 years > D) <= TOL


def save(df: pd.DataFrame, name: str):
    df.to_csv(RES / f"{name}.csv", index=False, float_format="%.4f")
    print(f"  wrote results/{name}.csv ({len(df)} rows)")


# ============================================================================ Bitcoin sleeves
def load_btc() -> pd.Series:
    df = pd.read_csv(T04 / "yf_BTC_USD.csv", index_col=0, parse_dates=True)
    s = df["Close"].astype(float)
    s.index = pd.to_datetime(s.index).tz_localize(None)
    return s[~s.index.duplicated()].sort_index().loc[:B].dropna().rename("btc")


def btc_switch(btc: pd.Series, nyse: pd.DatetimeIndex, rf_ann_nyse: pd.Series, weeks=10, sma_days=None,
               er=ER_IBIT, cost=SWITCH_COST):
    """Adapted from track 31's sleeves31.btc_sleeves: Sunday close > its 10-week average (and, with sma_days,
    > its 200-day average: track 28's 10W_200D rule). Sunday's decision applies from Monday; IBIT's Monday open is
    13.5 h after the signal, so that share of Monday belongs to the old position. Compounded onto NYSE dates."""
    cal = btc.asfreq("D").ffill()
    lr = np.log(cal).diff()
    rf_cal = rf_ann_nyse.reindex(cal.index).ffill().bfill() / 365.0
    sun = cal[cal.index.dayofweek == 6]
    ma = sun.rolling(weeks).mean()
    on_w = (sun > ma).astype(float).where(ma.notna())
    if sma_days:
        ma_d = cal.rolling(sma_days).mean()
        on_d = (cal > ma_d).astype(float).where(ma_d.notna()).reindex(sun.index)
        on_w = (on_w * on_d).where(on_w.notna() & on_d.notna())
    pos = on_w.reindex(cal.index).ffill().shift(1)
    old = pos.shift(1)
    a = np.where(cal.index.dayofweek == 0, MONDAY_OLD_SHARE, 0.0)
    g_old = old * np.expm1(a * lr) + (1 - old) * a * rf_cal
    g_new = pos * (np.expm1((1 - a) * lr) - er / 365.0) + (1 - pos) * (1 - a) * rf_cal
    r_sw = (1 + g_old) * (1 + g_new) - 1
    r_sw[(old != pos) & old.notna()] -= cost
    r_hold = np.expm1(lr) - er / 365.0

    def to_nyse(r):
        r = r.dropna()
        k = np.searchsorted(nyse.values, r.index.values, side="left")
        ok = k < len(nyse)
        g = np.log1p(r[ok]).groupby(nyse[k[ok]]).sum()
        return np.expm1(g)

    sw = to_nyse(r_sw)
    hold = to_nyse(r_hold.loc[sw.index[0]:])
    return sw, hold, pos.dropna()


def jensen_alpha(r_sleeve, r_asset, rf, start=None, end=None):
    x = pd.concat([r_sleeve - rf, r_asset - rf], axis=1).loc[start:end].dropna().values
    y, z = x[:, 0], x[:, 1]
    Z = np.c_[np.ones(len(z)), z]
    b, *_ = np.linalg.lstsq(Z, y, rcond=None)
    e = y - Z @ b
    cov = np.linalg.inv(Z.T @ Z) * (e @ e) / (len(y) - 2)
    return b[0], b[0] / np.sqrt(cov[0, 0]), b[1]


def build_btc(mode: str, nyse, rf_hist_d: pd.Series, btc_fwd=0.075, sma_days=200, kappa_override=None,
              oos_start="2021-01-01"):
    """Returns (switch, hold, info). fwd mode follows track 31: tilt the price path so the IBIT-cost buy-and-hold
    earns btc_fwd a year over 2008-2026 (i.e. Nov 2014 on), rebuild the rule on the tilted path, then keep only
    kappa = min(0.5, t^2/(1+t^2)) of the rule's Jensen alpha, t from the 2021-2026 out-of-sample alpha on real history."""
    raw = load_btc()
    rf_ann_hist = (rf_hist_d * TD).reindex(nyse).ffill()
    sw_h, hold_h, pos_h = btc_switch(raw, nyse, rf_ann_hist, sma_days=sma_days)
    info = {}
    al, t, _ = jensen_alpha(sw_h, hold_h, rf_hist_d.reindex(sw_h.index), oos_start, B)
    info["oos_alpha_pa"], info["oos_alpha_t"] = al * TD, t
    kap = min(0.5, t * t / (1 + t * t)) if kappa_override is None else kappa_override
    info["kappa"] = kap
    if mode == "hist":
        return sw_h, hold_h, pos_h, info
    rf_ann_f = pd.Series(BILLS_FWD, index=nyse)
    rf_f = pd.Series((1 + BILLS_FWD) ** (1 / TD) - 1, index=nyse)
    lr = np.log(raw).diff()
    dl = 0.0
    sw, hold, pos = sw_h, hold_h, pos_h
    btc = raw
    for _ in range(3):
        g = np.log1p(hold.loc[A:B]).mean() * TD
        dl += (np.log1p(btc_fwd) - g) / 365.25
        btc = pd.Series(np.exp(np.log(raw.iloc[0]) + np.r_[0, np.cumsum(lr.iloc[1:].values + dl)]), index=raw.index)
        sw, hold, pos = btc_switch(btc, nyse, rf_ann_f, sma_days=sma_days)
    info["tilt_pa"] = dl * 365.25
    base, _, _ = jensen_alpha(sw, hold, rf_f.reindex(sw.index), A, B)
    info["fwd_alpha_pa_before_shrink"] = base * TD
    sw = sw - (1 - kap) * base
    return sw, hold, pos, info


# ============================================================================ gems stream (an estimate)
GEMS = {  # book-level excess over T-bills a year at track 35's sizes (s7 of track 35), as fractions of NAV
    "hist": dict(lo=-0.035, c=0.027, hi=0.095, crash=0.11),         # track 35's own numbers
    "fwd": dict(lo=-0.035, c=0.0085, hi=0.0475, crash=0.055),       # after G1's retirement (+1.7%) and kappa 0.5
}
TROUGHS = ("2008-11-20", "2020-03-23")   # the CEF-discount troughs (track 35 s3.3); the bonus lands in the 60 sessions after


def gems_series(nyse: pd.DatetimeIndex, rf_d: pd.Series, p: dict, seed: int) -> pd.Series:
    """A synthetic daily return series for a satellite that holds T-bills between episodes. Each calendar year
    draws a book-level excess from a triangular(lo, c, hi) distribution, spread evenly over the year; the crash
    bonus is added over the 60 sessions after each trough. Returns are per unit of the GEMS_W sleeve."""
    rng = np.random.default_rng(seed)
    idx = nyse[(nyse >= A) & (nyse <= B)]
    e = pd.Series(0.0, index=idx)
    yrs = idx.year
    for y in sorted(set(yrs)):
        m = yrs == y
        e[m] = rng.triangular(p["lo"], p["c"], p["hi"]) / m.sum()
    for t in TROUGHS:
        i = idx.searchsorted(pd.Timestamp(t))
        e.iloc[i:i + 60] += p["crash"] / 60
    return (rf_d.reindex(idx) + e / GEMS_W).rename("GEMS")


# ============================================================================ books
VEHICLES = {
    "SPY": {"SPY": 1.0},
    "1x": {"SPX1_200d_w": 0.5, "NDX1_200d_w": 0.5},
    "2xS": {"SPX2_200d_w": 1.0},
    "2x": {"SPX2_200d_w": 0.5, "NDX2_200d_w": 0.5},
    "3xS": {"SPX3_200d_w": 1.0},
    "3x": {"SPX3_200d_w": 0.5, "NDX3_200d_w": 0.5},
}
LEV = {"SPY": 1, "1x": 1, "2xS": 2, "2x": 2, "3xS": 3, "3x": 3}
EQ_W = (0.0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0)
BTC_W = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5)


def make_book(veh: str, we: float, wb: float, wg: float, btc_col="BTC10w200") -> dict:
    w = {}
    if we > 0:
        for k, v in VEHICLES[veh].items():
            w[k] = w.get(k, 0.0) + v * we
    if wb > 0:
        w[btc_col] = wb
    if wg > 0:
        w["GEMS"] = wg
    return w


def book_name(veh, we, wb, wg):
    parts = []
    if we > 0:
        parts.append(f"{veh} {we:.0%}")
    if wb > 0:
        parts.append(f"BTC {wb:.0%}")
    if wg > 0:
        parts.append(f"gems {wg:.0%}")
    return " + ".join(parts) if parts else "T-bills"


def grid_books() -> dict:
    books = {}
    for wb in BTC_W:                                   # no equity: Bitcoin and/or gems over T-bills
        for wg in (0.0, GEMS_W):
            if wb + wg > 0:
                books[book_name("-", 0.0, wb, wg)] = dict(w=make_book("-", 0.0, wb, wg), veh="-", we=0.0, wb=wb, wg=wg)
    for veh in VEHICLES:
        for we in EQ_W:
            if we == 0:
                continue
            for wb in BTC_W:
                for wg in (0.0, GEMS_W):
                    if we + wb + wg > 1.0 + 1e-9:
                        continue
                    books[book_name(veh, we, wb, wg)] = dict(w=make_book(veh, we, wb, wg), veh=veh, we=we, wb=wb, wg=wg)
    books["T-bills"] = dict(w={}, veh="-", we=0, wb=0, wg=0)
    return books


# ============================================================================ governors
def g_none(dd):
    return np.ones_like(dd)


def g_wide(dd):        # track 31: 1 until -20%, linear to 0.25 at -50%
    return E.g_wide(dd)


def g_d40(dd):         # scaled for D = 40%: 1 until -15%, linear to 0.25 at -35%, 0.25 beyond
    return np.clip(1 - 0.75 * (dd - 0.15) / 0.20, 0.25, 1.0)


def g_d30(dd):         # scaled for D = 30%: 1 until -10%, linear to 0.25 at -25%
    return np.clip(1 - 0.75 * (dd - 0.10) / 0.15, 0.25, 1.0)


def g_floor60(dd):     # Grossman-Zhou: exposure proportional to the cushion above 60% of the peak
    return E.g_floor(dd, floor=0.6)


GOVS = {"none": g_none, "wide 20-50": g_wide, "D40 15-35": g_d40, "D30 10-25": g_d30, "floor 60%": g_floor60}


# ============================================================================ Monte Carlo
class World:
    """One belief set: a returns frame on NYSE dates over the window, with its own draws (common seed)."""

    def __init__(self, name: str, R: pd.DataFrame):
        self.name, self.R = name, R.loc[A:B]


def evaluate(world: World, books: dict, years: int, n_paths: int, governors: dict, chunk=250, seed=SEED):
    """Run every book (x governor) on the same block draws. Returns {(book, gov): {stat: array}}."""
    bs = E.Bootstrap(world.R, A, B, n_paths=n_paths, years=years, seed=seed, chunk=chunk)
    rng = np.random.default_rng(seed)
    out = {}
    firsts = sorted({bs.first[k] for b in books.values() for k in b["w"]} | {0})
    H10, H20 = 10 * TD, 20 * TD
    for c0 in range(0, n_paths, chunk):
        npth = min(chunk, n_paths - c0)
        L, S = bs._blocks(rng, npth)
        IDX = {f: bs._index(L, S, f) for f in firsts}
        rf = bs.X["rf"][IDX[0]]
        bench_lw = np.cumsum(np.log1p(bs.X["SPY"][IDX[0]]), axis=1)
        for bname, bk in books.items():
            w = bk["w"]
            r = rf * (1 - sum(w.values()))
            for k, v in w.items():
                r = r + v * bs.X[k][IDX[bs.first[k]]]
            for gname, gfun in governors.items():
                if gname == "none":
                    lw = np.cumsum(np.log1p(np.maximum(r, -0.999999)), axis=1)
                else:
                    lw = E.governed(r, rf, gfun)
                st = out.setdefault((bname, gname), {})
                runmax = np.maximum.accumulate(np.maximum(lw, 0.0), axis=1)
                dd = -np.expm1(-(runmax - lw))
                for H, D in (("10", H10), ("20", H20)):
                    if D > lw.shape[1]:
                        continue
                    st.setdefault(f"g{H}", []).append(lw[:, D - 1] / (D / TD))
                    st.setdefault(f"gb{H}", []).append(bench_lw[:, D - 1] / (D / TD))
                    st.setdefault(f"dd{H}", []).append(dd[:, :D].max(axis=1))
                if lw.shape[1] >= 5 * TD:
                    st.setdefault("g5", []).append(lw[:, 5 * TD - 1] / 5)
                    st.setdefault("dd5", []).append(dd[:, :5 * TD].max(axis=1))
                for m in (2, 10):
                    hit = lw >= np.log(m)
                    t = np.where(hit.any(axis=1), hit.argmax(axis=1) + 1, np.inf) / TD
                    st.setdefault(f"t{m}x", []).append(t)
    return {k: {kk: np.concatenate(v) for kk, v in st.items()} for k, st in out.items()}


def pool(*results):
    """Pool per-path arrays from several worlds (the blend belief: 50/50 mixture of paths)."""
    keys = set.intersection(*[set(r) for r in results])
    return {k: {kk: np.concatenate([r[k][kk] for r in results]) for kk in results[0][k]} for k in keys}


def summarize(res: dict, label: str, meta: dict | None = None) -> pd.DataFrame:
    rows = []
    for (bname, gname), a in res.items():
        g, gb, dd = a["g10"], a["gb10"], a["dd10"]
        row = dict(belief=label, book=bname, governor=gname,
                   exp_log_growth_10y=float(np.mean(g)), median_cagr_10y=float(np.expm1(np.median(g))),
                   p10_cagr_10y=float(np.expm1(np.percentile(g, 10))), p90_cagr_10y=float(np.expm1(np.percentile(g, 90))),
                   spy_median_cagr_10y=float(np.expm1(np.median(gb))),
                   p_beat_spy=float(np.mean(g > gb)), p_beat_spy_5pts=float(np.mean(np.expm1(g) - np.expm1(gb) >= 0.05)),
                   p_dd_gt_30=float(np.mean(dd > 0.30)), p_dd_gt_40=float(np.mean(dd > 0.40)),
                   p_dd_gt_50=float(np.mean(dd > 0.50)), median_maxdd_10y=float(np.median(dd)),
                   p_below_start_10y=float(np.mean(g < 0)))
        if "dd20" in a:
            row["p_dd_gt_40_20y"], row["p_dd_gt_50_20y"] = float(np.mean(a["dd20"] > 0.4)), float(np.mean(a["dd20"] > 0.5))
            row["median_cagr_20y"] = float(np.expm1(np.median(a["g20"])))
        for m in (2, 10):
            t = a[f"t{m}x"]
            row[f"t{m}x_median"] = float(np.median(t)) if np.isfinite(np.median(t)) else np.nan
            row[f"t{m}x_p10"] = float(np.percentile(t, 10)) if np.isfinite(np.percentile(t, 10)) else np.nan
            row[f"t{m}x_share"] = float(np.mean(np.isfinite(t)))
        if meta and bname in meta:
            row.update({k: meta[bname][k] for k in ("veh", "we", "wb", "wg")})
            row["equity_exposure_when_in"] = meta[bname]["we"] * LEV.get(meta[bname]["veh"], 0)
        rows.append(row)
    return pd.DataFrame(rows)


def frontier(T: pd.DataFrame, top=5) -> pd.DataFrame:
    """For each belief and D: the feasible books (P(dd10 > D) <= TOL) with the highest expected log growth."""
    rows = []
    for belief in T.belief.unique():
        for D in DS:
            col = f"p_dd_gt_{int(D * 100)}"
            sub = T[(T.belief == belief) & (T[col] <= TOL)].sort_values("exp_log_growth_10y", ascending=False)
            for rank, (_, r) in enumerate(sub.head(top).iterrows(), 1):
                rows.append(dict(belief=belief, D=D, rank=rank, **r.drop("belief").to_dict()))
    return pd.DataFrame(rows)


# ============================================================================ real-path checks
def real_path(R: pd.DataFrame, w: dict, a: str, b: str) -> dict:
    r = E.book_daily(R.loc[a:b], w).dropna()
    lw = np.log1p(r).cumsum()
    dd = (lw - np.maximum.accumulate(np.maximum(lw, 0))).min()
    return dict(start=str(r.index[0].date()), end=str(r.index[-1].date()), cagr=float(np.expm1(lw.iloc[-1] / (len(r) / TD))),
                vol=float(r.std() * np.sqrt(TD)), maxdd=float(np.expm1(dd)), worst_day=float(r.min()),
                worst_day_date=str(r.idxmin().date()))


def calendar_years(R: pd.DataFrame, cols: dict, a: str, b: str) -> pd.DataFrame:
    out = {}
    for name, w in cols.items():
        r = E.book_daily(R.loc[a:b], w).dropna()
        out[name] = r.groupby(r.index.year).apply(lambda x: float(np.expm1(np.log1p(x).sum())))
    return pd.DataFrame(out).rename_axis("year").reset_index()


def episode(R: pd.DataFrame, w: dict, a: str, b: str) -> float:
    r = E.book_daily(R.loc[a:b], w).dropna()
    return float(np.expm1(np.log1p(r).sum()))


# ============================================================================ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paths", type=int, default=2000)
    args = ap.parse_args()
    t0 = time.time()
    print("loading track 31's cached sleeves ...")
    Rh = E.read_inputs(T31 / "hist")
    Rf = E.read_inputs(T31 / "fwd_2008-2026")
    nyse = Rh.index
    rf_h = Rh["rf"]

    # ---------------------------------------------------------------- Bitcoin sleeves (10-week; 10-week + 200-day)
    print("Bitcoin sleeves ...")
    binfo = []
    for sma in (None, 200):
        col = "BTC10w200" if sma else "BTC10w"
        sw_h, hold_h, pos_h, ih = build_btc("hist", nyse, rf_h, sma_days=sma)
        Rh[col] = sw_h
        sw_f, hold_f, pos_f, inf = build_btc("fwd", nyse, rf_h, btc_fwd=0.075, sma_days=sma)
        Rf[col] = sw_f
        binfo.append(dict(rule=col, world="hist", cagr_2014_2026=E.growth_of(Rh, {col: 1.0}, "2014-11-25", B)[1],
                          maxdd=real_path(Rh, {col: 1.0}, "2014-11-25", B)["maxdd"], time_in=float(pos_h.loc["2014-11-24":].mean()),
                          switches_pa=float((pos_h.loc["2014-11-24":].diff().abs() > 0).sum() / (len(pos_h.loc["2014-11-24":]) / 365.25)), **ih))
        binfo.append(dict(rule=col, world="fwd 7.5%", cagr_2014_2026=E.growth_of(Rf, {col: 1.0}, "2014-11-25", B)[1],
                          maxdd=real_path(Rf, {col: 1.0}, "2014-11-25", B)["maxdd"], time_in=float(pos_f.loc["2014-11-24":].mean()), **inf))
    Rh["BTC_hold_chk"], Rf["BTC_hold_chk"] = hold_h, hold_f
    # flat-Bitcoin and no-edge variants (forward sensitivities)
    Rflat = Rf.copy()
    sw0, hold0, _, i0 = build_btc("fwd", nyse, rf_h, btc_fwd=0.0, sma_days=200)
    Rflat["BTC10w200"] = sw0
    binfo.append(dict(rule="BTC10w200", world="fwd 0% (flat)", cagr_2014_2026=E.growth_of(Rflat, {"BTC10w200": 1.0}, "2014-11-25", B)[1],
                      maxdd=real_path(Rflat, {"BTC10w200": 1.0}, "2014-11-25", B)["maxdd"], **i0))
    Rflat0 = Rf.copy()
    sw00, _, _, i00 = build_btc("fwd", nyse, rf_h, btc_fwd=0.0, sma_days=200, kappa_override=0.0)
    Rflat0["BTC10w200"] = sw00
    binfo.append(dict(rule="BTC10w200", world="fwd 0%, no timing edge", cagr_2014_2026=E.growth_of(Rflat0, {"BTC10w200": 1.0}, "2014-11-25", B)[1],
                      maxdd=real_path(Rflat0, {"BTC10w200": 1.0}, "2014-11-25", B)["maxdd"], **i00))
    Rbull = Rf.copy()
    swb, _, _, ib = build_btc("fwd", nyse, rf_h, btc_fwd=0.15, sma_days=200)
    Rbull["BTC10w200"] = swb
    binfo.append(dict(rule="BTC10w200", world="fwd 15% (bull)", cagr_2014_2026=E.growth_of(Rbull, {"BTC10w200": 1.0}, "2014-11-25", B)[1],
                      maxdd=real_path(Rbull, {"BTC10w200": 1.0}, "2014-11-25", B)["maxdd"], **ib))
    save(pd.DataFrame(binfo), "btc_sleeves")

    # ---------------------------------------------------------------- gems stream
    Rh["GEMS"] = gems_series(nyse, rf_h, GEMS["hist"], seed=SEED)
    Rf["GEMS"] = gems_series(nyse, Rf["rf"], GEMS["fwd"], seed=SEED)
    for R_ in (Rflat, Rflat0, Rbull):
        R_["GEMS"] = Rf["GEMS"]
    gi = []
    for lab, R_ in (("hist", Rh), ("fwd", Rf)):
        x = (R_["GEMS"] - R_["rf"]).loc[A:B].dropna()
        yr = x.groupby(x.index.year).sum() * GEMS_W
        gi.append(dict(world=lab, mean_book_excess_pa=float(yr.mean()), min_year=float(yr.min()), max_year=float(yr.max()),
                       sleeve_cagr=E.growth_of(R_, {"GEMS": 1.0}, A, B)[1], sleeve_maxdd=real_path(R_, {"GEMS": 1.0}, A, B)["maxdd"]))
    save(pd.DataFrame(gi), "gems_stream")

    worlds = {"forward-central": World("forward-central", Rf), "historical-repeat": World("historical-repeat", Rh)}

    # ---------------------------------------------------------------- stage 1: ungoverned grid, 10-year paths
    print("stage 1: the grid ...")
    books = grid_books()
    print(f"  {len(books)} books")
    res = {}
    for name, w_ in worlds.items():
        t1 = time.time()
        res[name] = evaluate(w_, books, years=10, n_paths=args.paths, governors={"none": g_none}, chunk=500)
        print(f"  {name}: {time.time() - t1:.0f}s")
    res["blend"] = pool(res["forward-central"], res["historical-repeat"])
    T = pd.concat([summarize(res[k], k, books) for k in res])
    save(T, "grid_10y")
    F = frontier(T)
    save(F, "frontier")

    # ---------------------------------------------------------------- stage 2: governors on the shortlist (10 and 20 years)
    print("stage 2: governors ...")
    short = {}
    for veh, we_list in (("2x", (0.4, 0.5, 0.6, 0.7, 0.8)), ("2xS", (0.6, 0.8, 1.0)), ("3x", (0.4, 0.5, 0.6)), ("3xS", (0.5, 0.6)),
                         ("SPY", (0.8, 1.0)), ("1x", (0.8,))):
        for we in we_list:
            for wb in (0.1, 0.2, 0.3):
                for wg in (0.0, GEMS_W):
                    if we + wb + wg <= 1.0 + 1e-9:
                        n = book_name(veh, we, wb, wg)
                        short[n] = dict(w=make_book(veh, we, wb, wg), veh=veh, we=we, wb=wb, wg=wg)
    print(f"  {len(short)} books x {len(GOVS)} governors")
    res2 = {}
    for name, w_ in worlds.items():
        t1 = time.time()
        res2[name] = evaluate(w_, short, years=20, n_paths=args.paths // 2, governors=GOVS, chunk=500)
        print(f"  {name}: {time.time() - t1:.0f}s")
    res2["blend"] = pool(res2["forward-central"], res2["historical-repeat"])
    T2 = pd.concat([summarize(res2[k], k, short) for k in res2])
    save(T2, "governed_20y")
    F2 = frontier(T2)
    save(F2, "frontier_governed")

    # ---------------------------------------------------------------- stage 3: final candidates, 50-year paths
    print("stage 3: finalists ...")
    finals = {
        "SPY": dict(w={"SPY": 1.0}, veh="SPY", we=1.0, wb=0.0, wg=0.0),
        "Phase A (design v3.3)": dict(w={"PhaseA": 1.0}, veh="-", we=0, wb=0, wg=0),
        "SPY 80% + BTC 20%": dict(w=make_book("SPY", 0.8, 0.2, 0.0), veh="SPY", we=0.8, wb=0.2, wg=0.0),
        "track 31 C: 2x 80% + BTC 20% (10w rule)": dict(w=make_book("2x", 0.8, 0.2, 0.0, btc_col="BTC10w"), veh="2x", we=0.8, wb=0.2, wg=0.0),
        "2x 80% + BTC 20%": dict(w=make_book("2x", 0.8, 0.2, 0.0), veh="2x", we=0.8, wb=0.2, wg=0.0),
        "BTC 30% + gems 15%": dict(w=make_book("-", 0.0, 0.3, GEMS_W), veh="-", we=0.0, wb=0.3, wg=GEMS_W),
        "BTC 40% + gems 15%": dict(w=make_book("-", 0.0, 0.4, GEMS_W), veh="-", we=0.0, wb=0.4, wg=GEMS_W),
        "SPY 40% + BTC 30% + gems 15%": dict(w=make_book("SPY", 0.4, 0.3, GEMS_W), veh="SPY", we=0.4, wb=0.3, wg=GEMS_W),
        "2x 40% + BTC 30% + gems 15%": dict(w=make_book("2x", 0.4, 0.3, GEMS_W), veh="2x", we=0.4, wb=0.3, wg=GEMS_W),
        "2x 50% + BTC 30% + gems 15%": dict(w=make_book("2x", 0.5, 0.3, GEMS_W), veh="2x", we=0.5, wb=0.3, wg=GEMS_W),
        "2x 60% + BTC 20% + gems 15%": dict(w=make_book("2x", 0.6, 0.2, GEMS_W), veh="2x", we=0.6, wb=0.2, wg=GEMS_W),
        "2x 50% + BTC 20% + gems 15%": dict(w=make_book("2x", 0.5, 0.2, GEMS_W), veh="2x", we=0.5, wb=0.2, wg=GEMS_W),
        "2xS 60% + BTC 20% + gems 15%": dict(w=make_book("2xS", 0.6, 0.2, GEMS_W), veh="2xS", we=0.6, wb=0.2, wg=GEMS_W),
        "2x 40% + BTC 20% + gems 15%": dict(w=make_book("2x", 0.4, 0.2, GEMS_W), veh="2x", we=0.4, wb=0.2, wg=GEMS_W),
        "2x 60% + BTC 30%": dict(w=make_book("2x", 0.6, 0.3, 0.0), veh="2x", we=0.6, wb=0.3, wg=0.0),
        "3x 50% + BTC 20% + gems 15%": dict(w=make_book("3x", 0.5, 0.2, GEMS_W), veh="3x", we=0.5, wb=0.2, wg=GEMS_W),
        "1x 80% + BTC 20%": dict(w=make_book("1x", 0.8, 0.2, 0.0), veh="1x", we=0.8, wb=0.2, wg=0.0),
    }
    res3 = {}
    for name, w_ in worlds.items():
        t1 = time.time()
        res3[name] = evaluate(w_, finals, years=50, n_paths=args.paths // 2, governors={"none": g_none, "wide 20-50": g_wide, "D40 15-35": g_d40},
                              chunk=500)
        print(f"  {name}: {time.time() - t1:.0f}s")
    res3["blend"] = pool(res3["forward-central"], res3["historical-repeat"])
    T3 = pd.concat([summarize(res3[k], k, finals) for k in res3])
    save(T3, "finalists_50y")

    # ---------------------------------------------------------------- sensitivities on the recommended book (forward)
    print("sensitivities ...")
    rec = "2x 50% + BTC 30% + gems 15%"
    rec_w = finals[rec]["w"]
    sens = {}
    sens["base, same draws (10y paths)"] = evaluate(World("base", Rf), {rec: finals[rec]}, years=10, n_paths=args.paths // 2,
                                                    governors={"none": g_none, "D40 15-35": g_d40}, chunk=500)
    for lab, R_ in (("Bitcoin flat (0%), switch edge kept", Rflat), ("Bitcoin flat, no switch edge", Rflat0), ("Bitcoin 15% (bull)", Rbull)):
        r_ = evaluate(World(lab, R_), {rec: finals[rec]}, years=10, n_paths=args.paths // 2, governors={"none": g_none, "D40 15-35": g_d40}, chunk=500)
        sens[lab] = r_
    # financing +1 point on the borrowed unit while invested (time in ~0.7 -> a uniform 0.7 x (L-1) x 1%/yr haircut)
    Rfin = Rf.copy()
    for col, L in (("SPX2_200d_w", 2), ("NDX2_200d_w", 2), ("SPX3_200d_w", 3), ("NDX3_200d_w", 3)):
        Rfin[col] = Rf[col] - 0.7 * (L - 1) * 0.01 / TD
    sens["financing +1 pt on the borrowed unit"] = evaluate(World("fin", Rfin), {rec: finals[rec]}, years=10, n_paths=args.paths // 2,
                                                            governors={"none": g_none, "D40 15-35": g_d40}, chunk=500)
    # no gems (the estimate removed), same weights otherwise
    nog = dict(finals[rec]); nog["w"] = {k: v for k, v in rec_w.items() if k != "GEMS"}
    sens["gems removed (cash instead)"] = evaluate(World("nog", Rf), {rec: nog}, years=10, n_paths=args.paths // 2,
                                                   governors={"none": g_none, "D40 15-35": g_d40}, chunk=500)
    # the 10-week rule instead of 10-week + 200-day
    b10 = dict(finals[rec]); b10["w"] = make_book("2x", 0.5, 0.3, GEMS_W, btc_col="BTC10w")
    sens["Bitcoin 10-week rule (no 200-day)"] = evaluate(World("b10", Rf), {rec: b10}, years=10, n_paths=args.paths // 2,
                                                         governors={"none": g_none, "D40 15-35": g_d40}, chunk=500)
    base = {k: v for k, v in res3["forward-central"].items() if k[0] == rec and k[1] in ("none", "D40 15-35")}
    S = [summarize(base, "forward-central (base, 50y paths)")] + [summarize(v, k) for k, v in sens.items()]
    S = pd.concat(S)
    save(S[["belief", "book", "governor", "exp_log_growth_10y", "median_cagr_10y", "p10_cagr_10y", "p90_cagr_10y", "p_beat_spy_5pts",
            "p_dd_gt_30", "p_dd_gt_40", "p_dd_gt_50", "median_maxdd_10y", "p_below_start_10y"]], "sensitivity_forward")

    # ---------------------------------------------------------------- real-path checks (history as it happened)
    print("real-path checks ...")
    eq2x = {"SPX2_200d_w": 0.5, "NDX2_200d_w": 0.5}
    rp = []
    for lab, w, a, b in (("2x blend, equity part only", eq2x, "1985-10-01", B), ("SPX 2x 200d weekly, real opens", {"SPX2_200d_w": 1.0}, "1962-01-02", B),
                         ("SPX 2x 200d weekly", {"SPX2_200d_w": 1.0}, "1928-10-01", B), ("SPY", {"SPY": 1.0}, "1985-10-01", B),
                         (rec + " (hist)", rec_w, "2014-11-25", B), (rec + " (fwd sleeves on the real calendar)", rec_w, "2014-11-25", B),
                         ("SPY", {"SPY": 1.0}, "2014-11-25", B), ("2x 80% + BTC 20% (hist)", finals["2x 80% + BTC 20%"]["w"], "2014-11-25", B)):
        R_ = Rf if "fwd" in lab else Rh
        rp.append(dict(book=lab, **real_path(R_, w, a, b)))
    save(pd.DataFrame(rp), "real_path")
    eps = []
    for lab, a, b in (("Aug 25 - Dec 31 1987", "1987-08-25", "1987-12-31"), ("Mar 2000 - Oct 2002", "2000-03-24", "2002-10-09"),
                      ("Oct 2007 - Mar 2009", "2007-10-09", "2009-03-09"), ("Feb 19 - Mar 23 2020", "2020-02-19", "2020-03-23"),
                      ("Jan - Oct 2022", "2022-01-03", "2022-10-12"), ("Feb 19 - Apr 8 2025", "2025-02-19", "2025-04-08")):
        row = dict(episode=lab, SPY=episode(Rh, {"SPY": 1.0}, a, b), spx2x_w=episode(Rh, {"SPX2_200d_w": 1.0}, a, b),
                   ndx2x_w=episode(Rh, {"NDX2_200d_w": 1.0}, a, b) if a >= "1985-10-01" else np.nan,
                   blend_2x_50pct=episode(Rh, {"SPX2_200d_w": 0.25, "NDX2_200d_w": 0.25}, a, b) if a >= "1985-10-01" else episode(Rh, {"SPX2_200d_w": 0.5}, a, b),
                   rec_book=episode(Rh, rec_w, a, b) if a >= "2014-11-25" else np.nan)
        eps.append(row)
    save(pd.DataFrame(eps), "episodes")
    cy = calendar_years(Rh, {"SPY": {"SPY": 1.0}, "2x blend equity 100%": eq2x, "2x blend equity 50% (rest T-bills)": {"SPX2_200d_w": 0.25, "NDX2_200d_w": 0.25},
                             "SPX 2x 100%": {"SPX2_200d_w": 1.0}}, "1986-01-01", B)
    cy2 = calendar_years(Rh, {rec + " (hist)": rec_w, "2x 80% + BTC 20% (hist)": finals["2x 80% + BTC 20%"]["w"]}, "2015-01-01", B)
    save(cy.merge(cy2, on="year", how="left"), "calendar_years")

    # 1987-style day, analytic: both filters in, weekly sell not yet fired
    shock = []
    for lab, w in ((rec, rec_w), ("2x 80% + BTC 20%", finals["2x 80% + BTC 20%"]["w"]),
                   ("3x 50% + BTC 20% + gems 15%", finals["3x 50% + BTC 20% + gems 15%"]["w"]), ("SPY", {"SPY": 1.0})):
        loss = 0.0
        for k, v in w.items():
            if k.startswith("SPX") or k.startswith("NDX"):
                L = int(k[3])
                loss += v * min(L * 0.205, 1.0)
            elif k == "SPY":
                loss += v * 0.205
            elif k.startswith("BTC"):
                loss += v * 0.25          # assumed Bitcoin co-crash (Mar 2020: -37% in a day, -50% in a week)
            elif k == "GEMS":
                loss += v * 0.10
        shock.append(dict(book=lab, one_day_loss_1987_style=-loss, governor_after=float(g_d40(np.array([loss]))[0]),
                          exposure_after_governor_pct_of_pre=float(g_d40(np.array([loss]))[0])))
    save(pd.DataFrame(shock), "shock_1987")

    # ---------------------------------------------------------------- summary
    lines = [f"track 38 run: paths {args.paths}, seed {SEED}, {time.time() - t0:.0f}s\n"]
    for belief in ("forward-central", "blend", "historical-repeat"):
        lines.append(f"== {belief}: best feasible book by D (ungoverned grid, 10y) ==")
        for D in DS:
            f = F[(F.belief == belief) & (F.D == D) & (F["rank"] == 1)]
            if f.empty:
                lines.append(f"  D={D:.0%}: nothing feasible")
            else:
                r = f.iloc[0]
                lines.append(f"  D={D:.0%}: {r.book}: E[g] {r.exp_log_growth_10y:.3f}, median {r.median_cagr_10y:.1%}, P(+5) {r.p_beat_spy_5pts:.0%}, "
                             f"P(dd>30/40/50) {r.p_dd_gt_30:.0%}/{r.p_dd_gt_40:.0%}/{r.p_dd_gt_50:.0%}")
        lines.append(f"== {belief}: best feasible governed book by D (shortlist, 20y paths) ==")
        for D in DS:
            f = F2[(F2.belief == belief) & (F2.D == D) & (F2["rank"] == 1)]
            if f.empty:
                lines.append(f"  D={D:.0%}: nothing feasible")
            else:
                r = f.iloc[0]
                lines.append(f"  D={D:.0%}: {r.book} | {r.governor}: E[g] {r.exp_log_growth_10y:.3f}, median {r.median_cagr_10y:.1%}, "
                             f"P(+5) {r.p_beat_spy_5pts:.0%}, P(dd>30/40/50) {r.p_dd_gt_30:.0%}/{r.p_dd_gt_40:.0%}/{r.p_dd_gt_50:.0%}")
    lines.append("\n== finalists (50y paths) ==")
    for _, r in T3.iterrows():
        lines.append(f"  {r.belief:18s} {r.book:45s} {r.governor:10s} med {r.median_cagr_10y:6.1%} p10 {r.p10_cagr_10y:6.1%} "
                     f"P(+5) {r.p_beat_spy_5pts:4.0%} dd>30/40/50 {r.p_dd_gt_30:4.0%}/{r.p_dd_gt_40:4.0%}/{r.p_dd_gt_50:4.0%} "
                     f"t2x {r.t2x_median:5.1f} t10x {r.t10x_median:5.1f} below {r.p_below_start_10y:4.0%}")
    (RES / "summary.txt").write_text("\n".join(lines))
    print("\n".join(lines))
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
