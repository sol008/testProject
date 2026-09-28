"""Shared helpers: performance stats, leveraged-return simulation, Black-Scholes, vol proxies."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.stats import norm

import data

# --------------------------------------------------------------------------- cost assumptions
# Leverage: borrowed notional (L-1) pays the T-bill rate + FIN_SPREAD; leveraged funds also pay LEV_FEE.
# Calibrated against SSO/UPRO in calibrate_leverage() (see run output).  Round-trip trading costs are
# charged once per trade on the capital deployed.
FIN_SPREAD = 0.0075      # 0.75%/yr over T-bills on borrowed notional (brief: T-bill + 0.5-1%)
LEV_FEE = 0.0090         # ~0.9%/yr expense ratio for 2x/3x ETF implementation
RT_COST_1X = 0.0010      # 0.10% round trip (ETF spread + slippage)
RT_COST_LEV = 0.0020     # 0.20% round trip for leveraged ETFs
RT_COST_OPT = 0.03       # 3% of premium round trip for LEAPS (wide spreads in crises)


def lev_returns(r: pd.Series, rf_d: pd.Series, L: float, spread: float = FIN_SPREAD, fee: float = LEV_FEE) -> pd.Series:
    """Daily-rebalanced L-times leveraged daily returns (decimal) from unlevered total returns r.

    rf_d is the daily risk-free return (decimal per day).  Borrowing cost = (L-1)*(rf + spread/252),
    plus an annual fee for L>1.  Returns are floored at -100% (wipe-out)."""
    rf_d = rf_d.reindex(r.index).ffill().fillna(0.0)
    if L == 1:
        return r.copy()
    out = L * r - (L - 1) * (rf_d + spread / 252.0) - fee / 252.0
    return out.clip(lower=-1.0)


def max_drawdown(eq: pd.Series) -> float:
    eq = eq.dropna()
    if len(eq) == 0:
        return np.nan
    return float((eq / eq.cummax() - 1).min())


def cagr(eq: pd.Series) -> float:
    eq = eq.dropna()
    if len(eq) < 2 or eq.iloc[0] <= 0:
        return np.nan
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    if yrs <= 0:
        return np.nan
    if eq.iloc[-1] <= 0:
        return -1.0
    return float((eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1)


def perf_stats(eq: pd.Series, invested: pd.Series | None = None, n_trades: int | None = None) -> dict:
    eq = eq.dropna()
    r = eq.pct_change().dropna()
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    ppy = len(r) / yrs if yrs > 0 else 252
    d = {
        "start": eq.index[0].date(),
        "end": eq.index[-1].date(),
        "years": round(yrs, 1),
        "total_return": eq.iloc[-1] / eq.iloc[0] - 1,
        "CAGR": cagr(eq),
        "vol": float(r.std() * np.sqrt(ppy)),
        "maxDD": max_drawdown(eq),
    }
    d["MAR"] = d["CAGR"] / abs(d["maxDD"]) if d["maxDD"] < 0 else np.nan
    if invested is not None:
        d["time_in_mkt"] = float(invested.reindex(eq.index).fillna(0).astype(float).mean())
    if n_trades is not None:
        d["trades"] = n_trades
        d["trades_per_yr"] = n_trades / yrs if yrs > 0 else np.nan
    return d


# --------------------------------------------------------------------------- Black-Scholes
def bs_call(S, K, T, r, q, sigma):
    """European call, continuous rates r (risk-free) and q (dividend yield)."""
    if T <= 0:
        return max(S - K, 0.0)
    sigma = max(sigma, 1e-4)
    d1 = (math.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return S * math.exp(-q * T) * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)


def long_dated_iv(vix_pct: float) -> float:
    """Approximate 2-year ATM implied vol (in %) from 30-day VIX (in %).  APPROXIMATION.

    Long-dated implied vol moves far less than VIX; in stress the term structure inverts.  Regressing
    VIX6M on VIX when VIX>30 (2008-2026) gives VIX6M ~ 15.8 + 0.53*VIX; extending that with a
    mean-reverting variance model (long-run 20%, kappa~3.2 fitted to the 6-month point) gives a 2-year
    vol of ~24% at VIX 40, ~30% at VIX 60 and ~37% at VIX 80.  We use 12 + 0.35*VIX, floored at 15%
    and capped at 45% (e.g. 26% at VIX 40, 33% at VIX 60, 40% at VIX 80)."""
    return float(min(45.0, max(15.0, 12.0 + 0.35 * vix_pct)))


# --------------------------------------------------------------------------- volatility proxy
_VOLPROXY = None


def vol_proxy() -> pd.Series:
    """Daily 'VIX-equivalent' in % : VIX (1990+), VXO (1986-1989, FRED VXOCLS), before 1986
    21-day realised volatility of the S&P 500 + 4 points (VIX has averaged a few points above
    subsequently realised vol).  Labelled an approximation in the report."""
    global _VOLPROXY
    if _VOLPROXY is not None:
        return _VOLPROXY
    px = data.yf_close("^GSPC")
    rv = data.realized_vol(px, 21) * 100 + 4.0
    vxo = data.fred("VXOCLS")
    vix = data.yf_close("^VIX")
    s = rv.copy()
    vxo_part = vxo[vxo.index < "1990-01-02"]
    common = s.index.intersection(vxo_part.index)
    s.loc[common] = vxo_part.loc[common].values
    post = s.index[s.index >= "1990-01-02"]
    s.loc[post] = vix.reindex(post).ffill().values
    _VOLPROXY = s.ffill()
    return _VOLPROXY


# --------------------------------------------------------------------------- misc
def years_between(a: pd.Timestamp, b: pd.Timestamp) -> float:
    return (b - a).days / 365.25


def first_on_or_after(idx: pd.DatetimeIndex, t: pd.Timestamp):
    pos = idx.searchsorted(t)
    if pos >= len(idx):
        return None
    return idx[pos]


def fmt_pct(x, nd=0):
    if x is None or (isinstance(x, float) and (np.isnan(x))):
        return "n/a"
    return f"{x*100:+.{nd}f}%"


def df_to_md(df: pd.DataFrame, floatfmt: dict | None = None, index: bool = False) -> str:
    """Minimal markdown table writer (no tabulate dependency)."""
    d = df.copy()
    if index:
        d = d.reset_index()
    cols = list(d.columns)
    lines = ["| " + " | ".join(str(c) for c in cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for _, row in d.iterrows():
        vals = []
        for c in cols:
            v = row[c]
            if floatfmt and c in floatfmt and isinstance(v, (int, float, np.floating)) and not pd.isna(v):
                vals.append(floatfmt[c](v))
            elif isinstance(v, (float, np.floating)):
                vals.append("" if pd.isna(v) else f"{v:.3g}")
            else:
                vals.append("" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v))
        lines.append("| " + " | ".join(vals) + " |")
    return "\n".join(lines)


def calibrate_leverage():
    """Compare simulated 2x/3x daily-rebalanced S&P TR against actual SSO / UPRO (adj close)."""
    spx = data.sp500_daily_tr()
    r = spx["tr"].pct_change()
    rf = data.daily_rf()
    rows = []
    for tk, L in [("SSO", 2), ("UPRO", 3)]:
        a = data.yf_close(tk, adj=True)
        start = a.index[0] + pd.Timedelta(days=5)
        a = a[a.index >= start]
        ra = a.pct_change().dropna()
        idx = ra.index.intersection(r.index)
        for spread, fee in [(0.0, 0.0), (0.005, 0.009), (0.0075, 0.009), (0.01, 0.009)]:
            sim = lev_returns(r.loc[idx], rf, L, spread, fee)
            yrs = (idx[-1] - idx[0]).days / 365.25
            cs = (1 + sim).prod() ** (1 / yrs) - 1
            ca = (1 + ra.loc[idx]).prod() ** (1 / yrs) - 1
            rows.append({"etf": tk, "L": L, "spread": spread, "fee": fee, "start": idx[0].date(),
                         "sim_CAGR": cs, "actual_CAGR": ca, "gap_pp": (cs - ca) * 100})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    print(calibrate_leverage().round(4).to_string())
