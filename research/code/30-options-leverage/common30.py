"""Shared helpers for track 30 (options as the leverage vehicle for a trend-filtered equity core).

Builds on track 04 (`../04-derivatives`): its cached data loaders (Yahoo, CBOE, FRED), its Black-Scholes
model surface (`Surface`, `IVModel`, fitted to the real 2026-09-28 SPX smile) and its VIX1Y back-fill.

Data cache: the track-04 cache (env TRACK04_DATA). Live chains: env TRACK30_CHAINS (default: the session
scratchpad folder that `s01_chain_check.py --fetch` writes to). Data end date: track 04's END_DATE (2026-09-25).
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
T04 = HERE.parent / "04-derivatives"
if str(T04) not in sys.path:
    sys.path.insert(0, str(T04))

from common import DATA_DIR, END_DATE, cagr, cboe, fred, max_drawdown, yf_close  # noqa: E402,F401  (track 04)
from s02_synthetic_options_backtest import (IVModel, SNAP_FILE, SNAP_VIX, SNAP_VIX1Y,  # noqa: E402,F401
                                            Surface, load_market)

OUT = HERE / "output"
OUT.mkdir(exist_ok=True)
SCRATCH = DATA_DIR.parent.parent
CACHE = SCRATCH / "30-options"
CACHE.mkdir(parents=True, exist_ok=True)
CHAIN_DIR = Path(os.environ.get("TRACK30_CHAINS", str(CACHE / "chains")))
QUOTE_DATE = pd.Timestamp("2026-09-28")        # CBOE delayed quotes stamped 2026-09-28 ~19:45 ET = that day's close

# ---------------------------------------------------------------------------------------------------------
# Cost assumptions (sources in the report, section 2)
# ---------------------------------------------------------------------------------------------------------
LETF_SPREAD, LETF_ER = 0.004, 0.009            # swap financing T-bill + 0.40% on borrowed notional; 0.90% fee
RH_MARGIN_SPREAD = {"<50k": 0.0125, "50k-100k": 0.0105, "100k-1m": 0.0075}   # over Fed funds upper bound
# Robinhood Financial fee schedule / margin-rates page, rates as of 2026-09-16/17: 5.25% / 5.05% / 4.75% with
# the Fed funds target upper bound at 4.00%.
MAINT = 0.30                                    # house maintenance assumed for SPY/QQQ (FINRA minimum 25%)
ETF_COST = 0.0002                               # one-way cost for SPY/QQQ/SSO/UPRO trades (half-spread + slippage)
BOX_SPREAD_OVER_TSY = 0.0035                    # option-implied financing above the Treasury curve (base)
IDX_FEE_PER_CONTRACT = 0.60                     # Robinhood index-option contract fee (0.35-0.50) + exchange fees


# ---------------------------------------------------------------------------------------------------------
# Fast scalar Black-Scholes (European, continuous dividend yield)
# ---------------------------------------------------------------------------------------------------------
_SQ2 = math.sqrt(2.0)


def ncdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / _SQ2))


def bs_call(S: float, K: float, T: float, r: float, q: float, sig: float) -> float:
    if T <= 1e-6:
        return max(S - K, 0.0)
    st = sig * math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + 0.5 * sig * sig) * T) / st
    return S * math.exp(-q * T) * ncdf(d1) - K * math.exp(-r * T) * ncdf(d1 - st)


def bs_call_delta(S: float, K: float, T: float, r: float, q: float, sig: float) -> float:
    if T <= 1e-6:
        return 1.0 if S > K else 0.0
    st = sig * math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + 0.5 * sig * sig) * T) / st
    return math.exp(-q * T) * ncdf(d1)


def ninv(p: float) -> float:
    from scipy.stats import norm
    return float(norm.ppf(p))


def bs_iv_vec(price, S, K, T, r, q, kind="call", n_iter=80):
    """Vectorised implied vol by bisection (nan when price is outside no-arbitrage bounds)."""
    from scipy.stats import norm
    price, S, K, T, r, q = (np.asarray(x, float) for x in (price, S, K, T, r, q))
    lo, hi = np.full(price.shape, 1e-4), np.full(price.shape, 4.0)

    def px(sig):
        st = sig * np.sqrt(T)
        d1 = (np.log(S / K) + (r - q + 0.5 * sig ** 2) * T) / st
        d2 = d1 - st
        if kind == "call":
            return S * np.exp(-q * T) * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
        return K * np.exp(-r * T) * norm.cdf(-d2) - S * np.exp(-q * T) * norm.cdf(-d1)

    for _ in range(n_iter):
        mid = 0.5 * (lo + hi)
        above = px(mid) > price
        hi = np.where(above, mid, hi)
        lo = np.where(above, lo, mid)
    iv = 0.5 * (lo + hi)
    bad = (px(np.full(price.shape, 1e-4)) > price) | (px(np.full(price.shape, 4.0)) < price)
    return np.where(bad, np.nan, iv)


# ---------------------------------------------------------------------------------------------------------
# Market panel
# ---------------------------------------------------------------------------------------------------------
def fed_upper() -> pd.Series:
    """Fed funds target (single target to 2008-12-15, upper bound after), percent -> decimal."""
    s = pd.concat([fred("DFEDTAR").loc[:"2008-12-15"], fred("DFEDTARU")]).sort_index()
    return (s[~s.index.duplicated()] / 100.0)


def load_panel(refresh: bool = False) -> pd.DataFrame:
    """Daily panel 1985-2026: S&P 500 (price, TR), NDX (price), VIX, VIX1Y (filled), VXN (proxied pre-2001),
    rates (3m bill, 1y Treasury, Fed upper bound), dividend yields, 200-day averages."""
    p = CACHE / "panel30.pkl"
    if p.exists() and not refresh:
        return pd.read_pickle(p)
    m = load_market()                                   # track 04: spx, vix, q, r1y, r3m, vix1y_filled, spxtr
    df = m[["spx", "vix", "q", "r1y", "r3m", "vix1y_filled", "spxtr"]].copy()
    df = df.loc["1985-01-01":END_DATE]
    ndx = yf_close("^NDX", start="1985-01-01")
    df["ndx"] = ndx.reindex(df.index).ffill()
    spx_full = yf_close("^GSPC")
    vxn = yf_close("^VXN", start="2001-01-01")
    df["vxn_obs"] = vxn.reindex(df.index)
    df["fed_upper"] = fed_upper().reindex(df.index.union(fed_upper().index)).ffill().reindex(df.index)
    for c in ("r1y", "r3m", "fed_upper"):
        df[c] = df[c].ffill().bfill()
    df["rtr_spx"] = df.spxtr.pct_change()
    # S&P TR before 1988-01: price return + Shiller-free approximation of 3.5%/yr dividends (only used pre-1990)
    pre = df.rtr_spx.isna()
    df.loc[pre, "rtr_spx"] = df.spx.pct_change()[pre] + 0.035 / 252
    df["q_ndx"] = 0.006                                 # NDX dividend yield assumption (QQQ ~0.5-0.8%)
    df["rtr_ndx"] = df.ndx.pct_change() + df.q_ndx / 252
    # VXN proxy before 2001-01-23: log VXN ~ a + b log VIX + c log RV21(NDX), fitted 2001-2026
    rv = (np.sqrt(252 * (np.log(ndx).diff() ** 2).rolling(21).mean()) * 100).reindex(df.index).ffill()
    fit = pd.DataFrame({"y": np.log(df.vxn_obs), "a": np.log(df.vix), "b": np.log(rv)}).dropna()
    X = np.column_stack([np.ones(len(fit)), fit.a, fit.b])
    beta, *_ = np.linalg.lstsq(X, fit.y.values, rcond=None)
    pred = np.exp(beta[0] + beta[1] * np.log(df.vix) + beta[2] * np.log(rv))
    resid = fit.y.values - X @ beta
    df["vxn"] = df.vxn_obs.fillna(pred).ffill()
    df.attrs["vxn_proxy"] = dict(coef=beta.round(3).tolist(), r2=float(1 - resid.var() / fit.y.var()),
                                 resid_sd=float(resid.std()))
    df["ma200_spx"] = spx_full.rolling(200).mean().reindex(df.index).ffill()
    df["ma200_ndx"] = ndx.rolling(200).mean().reindex(df.index).ffill()
    df.to_pickle(p)
    return df


def surface_and_models():
    """Track-04 SPX surface (real 2026-09-28 smile) and the three pricing variants."""
    raw = pd.read_csv(SNAP_FILE)
    surf = Surface(raw)
    variants = {                                         # a1m = ATM30d/VIX, a1y = ATM1y/VIX1Y (track 04)
        "base": dict(a1m=0.88, a1y=0.80, skew_mode="avg"),
        "cheap": dict(a1m=0.80, a1y=0.74, skew_mode="ratio"),
        "dear": dict(a1m=0.95, a1y=0.85, skew_mode="abs"),
        # "real": cheap ATM level with the smile flattened to 70% of the SPX shape. It reproduces the real CBOE
        # PPUT CAGR 1990-2026 (7.7% vs 7.6%) and today's XSP 6-month deep-ITM call prices (s01) without pushing
        # ATM implied vol below realised. The most option-friendly setting; used with XSP half-spreads (0.2%).
        # (A uniform -1.35 vol-point shift also matches PPUT, but it makes ATM options cheaper than realised vol
        # on average, contradicting the index variance premium, so it is not used.)
        "real": dict(a1m=0.80, a1y=0.74, skew_mode="ratio", skew_scale=0.70),
    }
    return surf, variants


# ---------------------------------------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------------------------------------
def perf(eq: pd.Series) -> dict:
    eq = eq.dropna()
    r = eq.pct_change().dropna()
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    c = (eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1
    dd = eq / eq.cummax() - 1
    return dict(cagr=c, vol=float(r.std() * np.sqrt(252)), maxdd=float(dd.min()),
                worst_day=float(r.min()), final_multiple=float(eq.iloc[-1] / eq.iloc[0]),
                ulcer=float(np.sqrt((dd ** 2).mean())))
