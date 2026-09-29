"""(b) Empirical return distributions of the most aggressive feasible systems.

Systems (daily simple returns; costs included; cash earns T-bills):
  NDX1    Nasdaq-100 1x (QQQ-like; ^NDX price + 0.7%/yr dividends - 0.20%/yr fee)
  NDX3    3x daily-rebalanced Nasdaq-100 (TQQQ-like), buy and hold
  NDX3F   3x Nasdaq-100 only while the NDX is above its 200-day average, else T-bills
  BTC     Bitcoin buy and hold
  BTCT    Bitcoin at 100% weight while the weekly close is above its 10-week average (M3's rule), else T-bills
  BTC2    2x daily-rebalanced Bitcoin (BITX/BITU-like), buy and hold
  BTC2T   2x Bitcoin with the same 10-week trend switch
  MOM     top momentum decile (Ken French, value-weighted, prior 12-2 months), -2%/yr trading costs
  MOM5    5-stock concentrated momentum: MOM plus simulated idiosyncratic risk (50%/yr per stock, t(4) tails)
  MOM5L   MOM5 at 2x on margin (T-bills + 1.5%)
  CALL100 100% of capital in 3-month at-the-money Nasdaq-100 calls, rolled every quarter
  CALL20  20% in the same calls, 80% T-bills, rebalanced every quarter
Execution: a signal seen at a close is traded at the next close (one-day lag). Switch cost 0.10%
(ETFs) or 0.25% (BTC) per side. 3x ETF: 0.9%/yr fee + (L-1) x (T-bill + 0.5%) financing (track 03,
reproduces UPRO/SSO); 2x BTC: 1.85%/yr fee + T-bill + 5%/yr funding (perpetual/futures basis).
Calls: Black-Scholes at VXN (2001-) or 1.15 x 63-day realised vol (before), 3% of premium paid on
entry and 1% on exit.

Calibrations:
  History  each underlying as it was: NDX Oct 1985-Sep 2026; BTC Jan 2015-Sep 2026 (the 2010-14
           venture phase, +134%/yr, is excluded); momentum decile Nov 1926-Aug 2026.
  Muted    the same days with the underlying's drift lowered so that it compounds at NDX 8%,
           BTC 20%, momentum decile 10% a year (strategy rules and signals unchanged).
Bootstrap: stationary block bootstrap (mean block about 6 months), 10,000 paths of 10 years.
Outputs: results/b1_historical.csv|md, results/b2_bootstrap.csv|md, results/b0_letf_validation.csv|md,
         results/b3_calendar_years.csv.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd
from scipy import stats

import common34 as C

N_PATHS = 10_000
CHUNK = 1_000
YEARS = 10
LETF_ER, LETF_SPREAD = 0.009, 0.005
BTC2_ER, BTC2_SPREAD = 0.0185, 0.05
MARGIN_SPREAD = 0.015
ETF_SWITCH, BTC_SWITCH = 0.001, 0.0025
NDX_DIV = 0.007
MUTED = {"ndx": 0.08, "btc": 0.20, "mom": 0.10}
BTC_START = "2015-01-01"


# ----------------------------------------------------------------------------- building blocks
def ndx_panel():
    px = C.yahoo_close("^NDX")
    r_u = px.pct_change().dropna() + NDX_DIV / 252
    rf = C.rf_annual_on(r_u.index)
    rf_d = (1 + rf) ** (1 / 252) - 1
    sma = px.rolling(200).mean()
    sig = (px > sma).astype(float).where(sma.notna())
    pos = sig.shift(2).reindex(r_u.index).fillna(0.0)          # seen at close t-2, traded at close t-1
    return pd.DataFrame({"r_u": r_u, "rf": rf_d, "pos": pos, "dpos": pos.diff().abs().fillna(0.0)}), px


def btc_panel(start=BTC_START):
    px = C.btc_daily()
    r_u = px.pct_change().dropna()
    rf = C.rf_annual_on(r_u.index)
    rf_d = (1 + rf) ** (1 / 365) - 1
    wk = px.resample("W-SUN").last()
    ma = wk.rolling(10).mean()
    sig = (wk > ma).astype(float).where(ma.notna())
    pos = sig.reindex(px.index, method="ffill").shift(2).reindex(r_u.index).fillna(0.0)
    df = pd.DataFrame({"r_u": r_u, "rf": rf_d, "pos": pos, "dpos": pos.diff().abs().fillna(0.0)})
    return df.loc[start:] if start else df


def mom_panel():
    d = C.french_momentum_daily()
    r_u = d["D10"] - 0.02 / 252
    rf = C.rf_daily().reindex(r_u.index).fillna(0.0)
    return pd.DataFrame({"r_u": r_u, "rf": rf, "pos": 1.0, "dpos": 0.0})


def strat_returns(name, r_u, rf, pos, dpos, ppy, rng=None):
    """Vectorised strategy returns from underlying returns (works on 1-D or 2-D arrays)."""
    if name == "NDX1":
        return r_u - 0.002 / ppy
    if name in ("NDX3", "NDX3F"):
        r3 = 3 * r_u - 2 * (rf + LETF_SPREAD / ppy) - LETF_ER / ppy
        if name == "NDX3":
            return r3
        return pos * r3 + (1 - pos) * rf - ETF_SWITCH * dpos
    if name == "BTC":
        return r_u
    if name == "BTCT":
        return pos * r_u + (1 - pos) * rf - BTC_SWITCH * dpos
    if name in ("BTC2", "BTC2T"):
        r2 = 2 * r_u - (rf + BTC2_SPREAD / ppy) - BTC2_ER / ppy
        if name == "BTC2":
            return r2
        return pos * r2 + (1 - pos) * rf - BTC_SWITCH * dpos
    if name == "MOM":
        return r_u
    if name in ("MOM5", "MOM5L"):
        rng = rng or np.random.default_rng(C.SEED)
        idio = 0.50 / np.sqrt(5)                         # 5 names, 50%/yr idiosyncratic vol each
        e = rng.standard_t(4, size=np.shape(r_u)) / np.sqrt(2.0) * idio / np.sqrt(ppy)
        r5 = r_u + e
        if name == "MOM5":
            return r5
        return 2 * r5 - (rf + MARGIN_SPREAD / ppy)
    raise ValueError(name)


def shift_drift(r_u, delta_log_per_period):
    return (1 + r_u) * np.exp(-delta_log_per_period) - 1


def cagr(r, ppy):
    r = np.asarray(r)
    return float(np.exp(np.log1p(np.maximum(r, -1)).sum() * ppy / len(r)) - 1)


# ----------------------------------------------------------------------------- calls
def bs_call(S, K, T, r, q, vol):
    d1 = (np.log(S / K) + (r - q + vol ** 2 / 2) * T) / (vol * np.sqrt(T))
    d2 = d1 - vol * np.sqrt(T)
    return S * np.exp(-q * T) * stats.norm.cdf(d1) - K * np.exp(-r * T) * stats.norm.cdf(d2)


def call_quarters(px, delta_log_per_year=0.0):
    """Return-on-premium for 63-session ATM calls started on every session, plus T-bill returns."""
    vxn = C.yahoo_close("^VXN", start="2001-01-01") / 100
    rv = px.pct_change().rolling(63).std() * np.sqrt(252)
    iv = vxn.reindex(px.index)
    iv = iv.where(iv.notna(), 1.15 * rv).clip(lower=0.12)
    rf = C.rf_annual_on(px.index)
    H = 63
    T = H / 252
    S0 = px.values[:-H]
    ST = px.values[H:] * np.exp(-delta_log_per_year * T)
    r_c = np.log1p(rf.values[:-H])
    vol = iv.values[:-H]
    prem = bs_call(S0, S0, T, r_c, NDX_DIV, vol)
    payoff = np.maximum(ST - S0, 0.0)
    r_opt = payoff * 0.99 / (prem * 1.03) - 1
    r_bill = (1 + rf.values[:-H]) ** T - 1
    ok = ~np.isnan(r_opt)
    idx = px.index[:-H][ok]
    return pd.DataFrame({"r_opt": r_opt[ok], "r_bill": r_bill[ok]}, index=idx)


def call_offsets(cq, w):
    """Matrix [offset, quarter] of non-overlapping quarterly strategy returns."""
    r = w * cq["r_opt"].values + (1 - w) * cq["r_bill"].values
    H = 63
    n_q = len(r) // H
    return np.array([[r[o + k * H] for k in range(n_q - 1)] for o in range(H)])


def boot_quarters(mat, n_paths, n_q, mean_block, rng):
    n_off, L = mat.shape
    off = rng.integers(0, n_off, size=n_paths)
    idx = C.stationary_bootstrap_idx(L, n_paths, n_q, mean_block, rng)
    return mat[off[:, None], idx]


# ----------------------------------------------------------------------------- main pieces
def validate_letf():
    px = C.yahoo_close("^NDX")
    tq = C.yahoo_close("TQQQ")
    r_u = px.pct_change() + NDX_DIV / 252
    rf = (1 + C.rf_annual_on(px.index)) ** (1 / 252) - 1
    sim = strat_returns("NDX3", r_u, rf, 1.0, 0.0, 252).loc[tq.index[1]:]
    act = tq.pct_change().loc[tq.index[1]:]
    both = pd.concat([sim, act], axis=1, keys=["sim", "act"]).dropna()
    yrs = len(both) / 252
    out = pd.DataFrame([{"period": f"{both.index[0].date()} to {both.index[-1].date()}",
                         "TQQQ actual CAGR": C.fmt(cagr(both.act, 252), digits=1),
                         "simulated 3x CAGR": C.fmt(cagr(both.sim, 252), digits=1),
                         "correlation of daily returns": round(float(both.corr().iloc[0, 1]), 4),
                         "years": round(yrs, 1)}])
    return C.save_table(out, "b0_letf_validation")


def build_all():
    ndx, ndx_px = ndx_panel()
    btc_full = btc_panel(start=None)
    btc = btc_full.loc[BTC_START:]
    mom = mom_panel()
    fam = {"NDX1": ("ndx", ndx, 252), "NDX3": ("ndx", ndx, 252), "NDX3F": ("ndx", ndx, 252),
           "BTC": ("btc", btc, 365), "BTCT": ("btc", btc, 365), "BTC2": ("btc", btc, 365),
           "BTC2T": ("btc", btc, 365), "MOM": ("mom", mom, 252), "MOM5": ("mom", mom, 252),
           "MOM5L": ("mom", mom, 252)}
    return fam, ndx_px, btc_full


LABELS = {"NDX1": "Nasdaq-100 1x (reference)", "NDX3": "3x Nasdaq-100, buy and hold",
          "NDX3F": "3x Nasdaq-100 with 200-day filter", "BTC": "Bitcoin, buy and hold (reference)",
          "BTCT": "Bitcoin trend (10-week), 100% weight", "BTC2": "2x Bitcoin, buy and hold",
          "BTC2T": "2x Bitcoin with trend switch", "MOM": "Top momentum decile (reference)",
          "MOM5": "Concentrated momentum, 5 stocks", "MOM5L": "Concentrated momentum, 5 stocks, 2x margin",
          "CALL100": "Rolling 3-month ATM calls, 100% of capital", "CALL20": "Rolling calls, 20% of capital + 80% T-bills"}


def historical_table(fam, ndx_px, btc_full):
    rows, cal_rows = [], []
    rng = np.random.default_rng(C.SEED)
    for name, (f, df, ppy) in fam.items():
        r = pd.Series(strat_returns(name, df.r_u.values, df.rf.values, df.pos.values, df.dpos.values, ppy, rng),
                      index=df.index)
        rf = pd.Series(df.rf.values, index=df.index)
        h = C.hist_stats(r, rf, ppy)
        rows.append({"system": LABELS[name], **h})
        cal = (1 + r).groupby(r.index.year).prod() - 1
        for y, v in cal.items():
            cal_rows.append({"system": name, "year": y, "return": v})
        if name in ("BTC", "BTCT", "BTC2", "BTC2T"):     # full-history variant incl. 2010-14
            r2 = pd.Series(strat_returns(name, btc_full.r_u.values, btc_full.rf.values, btc_full.pos.values,
                                         btc_full.dpos.values, 365), index=btc_full.index)
            h2 = C.hist_stats(r2, pd.Series(btc_full.rf.values, index=btc_full.index), 365)
            rows.append({"system": LABELS[name] + " [2010-2026]", **h2})
            cal2 = (1 + r2).groupby(r2.index.year).prod() - 1
            for y, v in cal2.items():
                if y < 2015:
                    cal_rows.append({"system": name, "year": y, "return": v})
    # calls: historical quarterly paths averaged over the 63 possible start offsets
    cq = call_quarters(ndx_px)
    for name, w in (("CALL100", 1.0), ("CALL20", 0.2)):
        mat = call_offsets(cq, w)
        r0 = pd.Series(mat[0], index=cq.index[::63][:mat.shape[1]])
        rf0 = pd.Series(cq["r_bill"].values[::63][:mat.shape[1]], index=r0.index)
        h = C.hist_stats(r0, rf0, 4)
        lw = np.log1p(np.maximum(mat, -1)).sum(axis=1)
        h["CAGR"] = float(np.median(np.exp(lw * 4 / mat.shape[1]) - 1))
        h["note"] = "quarterly marks; CAGR = median over 63 start dates"
        rows.append({"system": LABELS[name], **h})
    out = pd.DataFrame(rows)
    disp = out.copy()
    for c in ("CAGR", "vol", "max drawdown", "share of rolling 12m >= +100%", "share of rolling 3y CAGR>=100%",
              "share of rolling 5y CAGR>=100%", "share of rolling 10y CAGR>=100%"):
        disp[c] = disp[c].map(lambda v: C.fmt(v, digits=1) if v is not None and not pd.isna(v) else "n/a")
    disp["Sharpe"] = disp["Sharpe"].map(lambda v: round(v, 2))
    C.save_table(disp, "b1_historical")
    pd.DataFrame(cal_rows).to_csv(f"{C.RESULTS}/b3_calendar_years.csv", index=False)
    return out, cq


def bootstrap_table(fam, ndx_px, cq):
    rng = np.random.default_rng(C.SEED)
    rows = []
    hist_cagr = {}
    for fname, df, ppy in (("ndx", fam["NDX1"][1], 252), ("btc", fam["BTC"][1], 365), ("mom", fam["MOM"][1], 252)):
        hist_cagr[fname] = cagr(df.r_u.values, ppy)
    for calib in ("History", "Muted"):
        for name, (f, df, ppy) in fam.items():
            t0 = time.time()
            delta = 0.0
            if calib == "Muted":
                delta = (np.log1p(hist_cagr[f]) - np.log1p(MUTED[f])) / ppy
            ru = shift_drift(df.r_u.values, delta)
            T = YEARS * ppy
            mean_block = 126 if ppy == 252 else 182
            acc = []
            for _ in range(N_PATHS // CHUNK):
                ix = C.stationary_bootstrap_idx(len(ru), CHUNK, T, mean_block, rng)
                r = strat_returns(name, ru[ix], df.rf.values[ix], df.pos.values[ix], df.dpos.values[ix], ppy, rng)
                st = C.path_stats(r, ppy)
                if f == "btc":
                    # capacity check: 1024x for the strategy while Bitcoin itself rises at most 10x
                    # (a ~$17tn market cap, about 3% of world wealth, from $1.7tn in Sep 2026)
                    w_u = np.exp(np.log1p(ru[ix]).sum(axis=1))
                    w_s = np.exp(np.log1p(np.maximum(r, -1)).sum(axis=1))
                    st["P(CAGR>=100% over 10y with BTC <= 10x)"] = float(np.mean((w_s >= 1024) & (w_u <= 10)))
                    st["P(BTC itself > 10x in 10y)"] = float(np.mean(w_u > 10))
                acc.append(st)
            st = pd.DataFrame(acc).mean().to_dict()
            rows.append({"calibration": calib, "system": LABELS[name], **st})
            print(f"{calib:8s} {name:6s} {time.time() - t0:5.1f}s  P(yr>=100%)={st['P(year >= +100%)']:.3f} "
                  f"P(10y CAGR>=100%)={st['P(CAGR>=100% over 10y)']:.4f} P(DD>=80%)={st['P(drawdown >= 80% within 10y)']:.3f}")
        delta_y = 0.0 if calib == "History" else (np.log1p(hist_cagr["ndx"]) - np.log1p(MUTED["ndx"]))
        cqc = call_quarters(ndx_px, delta_log_per_year=delta_y)
        for name, w in (("CALL100", 1.0), ("CALL20", 0.2)):
            mat = call_offsets(cqc, w)
            r = boot_quarters(mat, N_PATHS, YEARS * 4, 2, rng)
            st = C.path_stats(r, 4)
            rows.append({"calibration": calib, "system": LABELS[name], **st})
            print(f"{calib:8s} {name:7s} P(yr>=100%)={st['P(year >= +100%)']:.3f} "
                  f"P(10y CAGR>=100%)={st['P(CAGR>=100% over 10y)']:.4f}")
    out = pd.DataFrame(rows)
    disp = out.copy()
    for c in disp.columns:
        if c.startswith("P(") or c in ("median 10y CAGR", "median max drawdown 10y"):
            disp[c] = disp[c].map(lambda v: C.fmt(v, digits=1) if v < 0.995 else C.fmt(v))
        elif c == "median 10y multiple":
            disp[c] = disp[c].map(lambda v: C.fmt(v, "x"))
    C.save_table(disp, "b2_bootstrap")
    pd.DataFrame([{"underlying": k, "historical CAGR in sample": C.fmt(v, digits=1),
                   "muted CAGR": C.fmt(MUTED[k])} for k, v in hist_cagr.items()]).pipe(
        C.save_table, "b2b_calibration")
    return out


def main():
    print(validate_letf().to_string())
    fam, ndx_px, btc_full = build_all()
    hist, cq = historical_table(fam, ndx_px, btc_full)
    print(hist.to_string())
    bootstrap_table(fam, ndx_px, cq)


if __name__ == "__main__":
    main()
