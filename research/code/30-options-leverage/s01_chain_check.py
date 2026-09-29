"""Real option chains at the 2026-09-28 close (CBOE delayed quotes via traderec's LiveProvider):
  1. implied financing (box rate) and forward per expiry, from put-call parity (European XSP/SPX/NDX);
  2. quoted spreads of the calls this track would buy (delta 0.45-0.95, 60-400 days), per root;
  3. the carry of a deep in-the-money call today: time value per year per $ of delta exposure;
  4. validation of track 04's model surface (Black-Scholes on VIX/VIX1Y with the SPX smile) against
     the real XSP/SPY/QQQ call prices of the same day: error in vol points and in % of premium.

  python s01_chain_check.py --fetch   # re-pulls live chains into TRACK30_CHAINS first (needs network)
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from common30 import (CHAIN_DIR, OUT, QUOTE_DATE, SNAP_VIX, SNAP_VIX1Y, IVModel, bs_iv_vec, load_panel,
                      surface_and_models)

ROOTS = ["XSP", "SPY", "QQQ", "SPX", "NDX"]
Q_GUESS = {"XSP": 0.0118, "SPX": 0.0118, "SPY": 0.0118, "QQQ": 0.006, "NDX": 0.006}


def fetch():
    sys.path.insert(0, str(OUT.parents[3]))
    from traderec.config import load_config
    from traderec.data.providers import LiveProvider
    prov = LiveProvider(load_config())
    CHAIN_DIR.mkdir(parents=True, exist_ok=True)
    for root in ROOTS:
        ch = prov.option_chain(root)
        f = ch.frame.copy()
        f["spot"], f["asof"], f["source"] = ch.spot, ch.asof, ch.source
        f.to_csv(CHAIN_DIR / f"chain_{root}.csv", index=False)
        print(root, ch.asof, ch.spot, ch.source, len(f))


def load_chain(root: str) -> pd.DataFrame:
    f = pd.read_csv(CHAIN_DIR / f"chain_{root}.csv", parse_dates=["expiry"])
    f = f[(f.bid > 0) & (f.ask > 0) & (f.ask >= f.bid)].copy()
    f["dte"] = (f.expiry - QUOTE_DATE).dt.days
    f["T"] = f.dte / 365.0
    f["mid"] = 0.5 * (f.bid + f.ask)
    f["root_"] = root
    # SPX and SPXW (AM/PM settlement) share third-Friday dates: keep the tighter quote per contract
    f = (f.assign(_w=(f.ask - f.bid) / f.mid).sort_values("_w")
         .drop_duplicates(["expiry", "right", "strike"]).drop(columns="_w"))
    return f


def parity(f: pd.DataFrame, tbill: float, q_guess: float) -> pd.DataFrame:
    """Per expiry: regress C-P on K near the money -> discount factor D=e^{-rT} and forward F."""
    rows = []
    S = float(f.spot.iloc[0])
    for exp, g in f[(f.dte >= 20)].groupby("expiry"):
        c = g[g.right == "C"].set_index("strike").mid
        p = g[g.right == "P"].set_index("strike").mid
        k = c.index.intersection(p.index)
        k = k[(k > 0.9 * S) & (k < 1.1 * S)]
        T = float(g["T"].iloc[0])
        if len(k) >= 5:
            y = (c.loc[k] - p.loc[k]).values
            A = np.column_stack([np.ones(len(k)), -np.asarray(k, float)])
            (dF, D), *_ = np.linalg.lstsq(A, y, rcond=None)
            r_imp = -np.log(D) / T if D > 0 else np.nan
            F = dF / D
        else:
            r_imp, F = np.nan, np.nan
        rows.append(dict(expiry=exp.date(), dte=int(g.dte.iloc[0]), T=T, n_pairs=len(k), r_implied=r_imp,
                         F=F, q_implied=(r_imp - np.log(F / S) / T) if np.isfinite(F) else np.nan))
    out = pd.DataFrame(rows)
    return out


def main():
    if "--fetch" in sys.argv:
        fetch()
    panel = load_panel()
    tbill = float(panel.r3m.iloc[-1])
    r1y = float(panel.r1y.iloc[-1])
    surf, variants = surface_and_models()
    vxn_28 = float(panel.vxn.iloc[-1]) * SNAP_VIX / float(panel.vix.iloc[-1])   # VXN 25 Sep scaled to 28 Sep
    par_all, calls_all = [], []
    for root in ROOTS:
        f = load_chain(root)
        S = float(f.spot.iloc[0])
        par = parity(f, tbill, Q_GUESS[root])
        par["root"] = root
        par_all.append(par)
        european = root in ("XSP", "SPX", "NDX")
        # rate used to value each expiry: implied (European, sane) else Treasury + 0.35%
        par["r_use"] = np.where(european & par.r_implied.between(0.02, 0.08), par.r_implied,
                                tbill + (r1y - tbill) * np.clip((par["T"] - 0.25) / 0.75, 0, 1) + 0.0035)
        par["F_use"] = np.where(par.F.notna() & (par.n_pairs >= 5), par.F,
                                S * np.exp((par.r_use - Q_GUESS[root]) * par["T"]))
        c = f[(f.right == "C") & f.dte.between(45, 460)].merge(
            par[["expiry", "r_use", "F_use"]].assign(expiry=lambda d: pd.to_datetime(d.expiry)), on="expiry")
        c = c[(c.strike / S).between(0.55, 1.15)].copy()
        c["m"] = c.strike / c.F_use
        c["q_use"] = c.r_use - np.log(c.F_use / S) / c["T"]
        c["iv_mkt"] = bs_iv_vec(c.mid.values, S, c.strike.values, c["T"].values, c.r_use.values, c.q_use.values)
        # IV from the matching put (OTM for low strikes) is less noisy than a deep ITM call's
        p = f[f.right == "P"][["expiry", "strike", "mid"]].rename(columns={"mid": "put_mid"})
        c = c.merge(p, on=["expiry", "strike"], how="left")
        c["iv_put"] = bs_iv_vec(c.put_mid.values, S, c.strike.values, c["T"].values, c.r_use.values,
                                c.q_use.values, kind="put")
        from scipy.stats import norm
        iv = c.iv_put.where(c.m < 1.0, c.iv_mkt).fillna(c.iv_mkt)
        st = iv * np.sqrt(c["T"])
        d1 = (np.log(S / c.strike) + (c.r_use - c.q_use + 0.5 * iv ** 2) * c["T"]) / st
        c["delta_calc"] = np.exp(-c.q_use * c["T"]) * norm.cdf(d1)
        c["iv_used"] = iv
        c["spread_pct_mid"] = (c.ask - c.bid) / c.mid
        c["spread_bp_exposure"] = 1e4 * (c.ask - c.bid) / (c.delta_calc * S)
        intrinsic_fwd = np.maximum(S * np.exp(-c.q_use * c["T"]) - c.strike * np.exp(-c.r_use * c["T"]), 0)
        c["time_value"] = c.mid - intrinsic_fwd                       # = embedded put (European parity)
        c["tv_per_year_pct_exposure"] = c.time_value / c["T"] / (c.delta_calc * S)
        c["financing_over_tbill"] = c.r_use - tbill
        c["leverage_per_contract"] = c.delta_calc * S / c.mid
        # model surface (track 04) on the same day
        vol_idx = SNAP_VIX if root in ("XSP", "SPX", "SPY") else vxn_28
        v1y = SNAP_VIX1Y * (vol_idx / SNAP_VIX)
        for vn, v in variants.items():
            if "skew_scale" in v:                    # the flattened-smile "real" variant (engine's surface)
                from engine import FastSurface
                fs = FastSurface(surf, v["a1m"], v["a1y"], v["skew_mode"], skew_scale=v["skew_scale"])
                c[f"iv_model_{vn}"] = [fs.iv(vol_idx, v1y, m_, t_) for m_, t_ in zip(c.m.values, c["T"].values)]
            else:
                ivm = IVModel(panel, surf, v["a1m"], v["a1y"], v["skew_mode"], markup=v.get("markup", 0.0))
                c[f"iv_model_{vn}"] = ivm.iv_vec(np.full(len(c), vol_idx), np.full(len(c), v1y), c.m.values,
                                                 c["T"].values)
            from common30 import bs_call
            c[f"px_model_{vn}"] = [bs_call(S, k, t, r, q, s) for k, t, r, q, s in
                                   zip(c.strike, c["T"], c.r_use, c.q_use, c[f"iv_model_{vn}"])]
        calls_all.append(c)
    par = pd.concat(par_all)
    par.to_csv(OUT / "chain_parity_rates.csv", index=False, float_format="%.5f")
    calls = pd.concat(calls_all)
    calls["delta_bucket"] = pd.cut(calls.delta_calc, [0.40, 0.60, 0.75, 0.85, 0.95],
                                   labels=["0.40-0.60 (ATM)", "0.60-0.75", "0.75-0.85", "0.85-0.95"])
    calls["dte_bucket"] = pd.cut(calls.dte, [44, 120, 240, 460], labels=["45-120d", "121-240d", "241-460d"])
    keep = calls[calls.delta_bucket.notna()].copy()
    # compact extract: XSP/SPY/QQQ, third-Friday expiries 60-400 days, the strike nearest each target delta
    e = keep[keep.root_.isin(["XSP", "SPY", "QQQ"]) & keep.dte.between(60, 400)
             & (keep.expiry.dt.weekday == 4) & keep.expiry.dt.day.between(15, 21)]
    picks = []
    for (root, exp), g in e.groupby(["root_", "expiry"]):
        for d in (0.5, 0.6, 0.7, 0.8, 0.9):
            picks.append(g.iloc[(g.delta_calc - d).abs().argmin()])
    ext = pd.DataFrame(picks)[["root_", "expiry", "dte", "strike", "spot", "bid", "ask", "iv_used", "delta_calc",
                               "spread_pct_mid", "spread_bp_exposure", "tv_per_year_pct_exposure",
                               "leverage_per_contract", "iv_model_base", "px_model_base", "open_interest"]]
    ext.drop_duplicates().to_csv(OUT / "chain_calls_extract.csv", index=False, float_format="%.4f")
    g = keep.groupby(["root_", "delta_bucket", "dte_bucket"], observed=True)
    summ = g.agg(n=("mid", "size"), spread_pct_mid=("spread_pct_mid", "median"),
                 spread_bp_exposure=("spread_bp_exposure", "median"),
                 tv_per_yr_pct_exposure=("tv_per_year_pct_exposure", "median"),
                 leverage_per_contract=("leverage_per_contract", "median"),
                 iv_mkt=("iv_used", "median"), open_interest=("open_interest", "median")).reset_index()
    for vn in variants:
        keep[f"err_iv_{vn}"] = keep[f"iv_model_{vn}"] - keep.iv_used
        keep[f"err_px_{vn}"] = keep[f"px_model_{vn}"] / keep.mid - 1
        e = keep.groupby(["root_", "delta_bucket", "dte_bucket"], observed=True)[[f"err_iv_{vn}", f"err_px_{vn}"]]
        summ = summ.merge(e.median().reset_index(), on=["root_", "delta_bucket", "dte_bucket"])
    summ.to_csv(OUT / "chain_spreads_carry_validation.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 250, "display.max_rows", 200, "display.max_columns", 30):
        print(par[par.dte < 460].round(4).to_string(index=False))
        print(summ.round(4).to_string(index=False))
    # skew shape check: IV(0.85F)/ATM at ~6 months, SPX vs NDX (is the SPX shape usable for NDX?)
    rows = []
    for root in ("SPX", "NDX", "SPY", "QQQ", "XSP"):
        c = calls[(calls.root_ == root) & calls.dte.between(150, 220)]
        for exp, gg in c.groupby("expiry"):
            gg = gg.sort_values("m")
            atm = np.interp(1.0, gg.m, gg.iv_used)
            rows.append(dict(root=root, expiry=exp.date(), dte=int(gg.dte.iloc[0]), atm_iv=atm,
                             ratio_085=np.interp(0.85, gg.m, gg.iv_used) / atm,
                             ratio_090=np.interp(0.90, gg.m, gg.iv_used) / atm,
                             ratio_110=np.interp(1.10, gg.m, gg.iv_used) / atm))
    sk = pd.DataFrame(rows)
    sk.to_csv(OUT / "chain_skew_shape_6m.csv", index=False, float_format="%.4f")
    print(sk.round(3).to_string(index=False))
    print(f"T-bill {tbill:.4f}  1y {r1y:.4f}  VXN(28 Sep est) {vxn_28:.2f}")


if __name__ == "__main__":
    main()
