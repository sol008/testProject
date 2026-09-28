"""Synthetic SPX option pricer used by the short-horizon back-tests (APPROXIMATION - modelled, not traded prices).

Implied vol surface on day t for strike K and tenor tau (calendar days):
    IV(K, tau) = ATM(tau) * g_m(z, tau),   z = ln(K/F) / (ATM(tau) * sqrt(tau/365))
  * VIX_tau: variance-swap vol for tenor tau from the CBOE term structure (VIX9D 9d, VIX 30d, VIX3M 93d,
    VIX6M 183d), interpolated in total variance.  Where VIX9D/VIX3M are missing (VIX9D < 2011,
    VIX3M < 2006-07) the ratio to VIX is filled with a regression fitted on 2006/2011-2026 data
    (a mild look-ahead that only affects term-structure interpolation; flagged in the report).
  * g(z, tau): the SHAPE of the smile in standardized moneyness, taken from the real SPX chain on
    2026-09-28 (bucketed by DTE: <=5, 6-12, 13-20, 21-70 days).
  * m_t scales the skew: g_m = 1 + m (g - 1).  'skew' mode: m = (SKEW_t - 100)/(SKEW_snapshot - 100),
    clipped to [0.3, 1.5]; 'fixed' mode: m = 1.
  * ATM(tau) = ratio(m) * VIX_tau * (1 + iv_markup), where ratio(m) is solved so that the model's own
    VIX-formula variance swap equals the observed VIX_tau (so the level is consistent with the skew).
Quoted spread model (SPX, fitted to the 2026-09-28 snapshot, scaled up in high VIX):
    spread = max(tick, a + b * mid) * (VIX/16)^0.5 ; tick = 0.05 below $3, 0.10 above.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
from scipy.stats import norm

from common14 import DATA_DIR, END_DATE, bs_price, cboe, fomc_dates, yf_close, yf_df

SNAP = DATA_DIR / "chain_short_enriched_20260928.csv"
SKEW_SNAP = 146.25          # CBOE SKEW index at the 2026-09-28 close
DTE_BUCKETS = [(0, 5), (6, 12), (13, 20), (21, 70)]
Z_GRID = np.arange(-6.0, 3.01, 0.25)


# --------------------------------------------------------------------------------------------
# Smile shape from the live snapshot
# --------------------------------------------------------------------------------------------
@lru_cache(maxsize=1)
def smile_shapes() -> dict:
    ch = pd.read_csv(SNAP)
    s = ch[(ch.ticker == "^SPX") & (ch.bid > 0) & (ch.ask > 0) & ch.iv_mid.notna() & (ch.dte >= 1)].copy()
    s = s[((s.kind == "put") & (s.strike <= s.F)) | ((s.kind == "call") & (s.strike > s.F))]
    pts = []
    for (ex, dte), g in s.groupby(["expiry", "dte"]):
        g = g.sort_values("strike")
        lk = np.log(g.strike / g.F).values
        atm = np.interp(0.0, lk, g.iv_mid.values)
        z = lk / (atm * np.sqrt(g["T"].values))
        pts.append(pd.DataFrame({"dte": dte, "z": z, "rel": g.iv_mid.values / atm}))
    pts = pd.concat(pts)
    shapes = {}
    for lo, hi in DTE_BUCKETS:
        p = pts[(pts.dte >= lo) & (pts.dte <= hi)]
        zb = np.round(p.z / 0.25) * 0.25
        med = p.groupby(zb).rel.median()
        cnt = p.groupby(zb).rel.size()
        med = med[cnt >= 2]
        med.loc[0.0] = 1.0
        med = med.sort_index()
        # monotone clean-up on the put wing: rel must not decrease as z goes more negative
        zz = Z_GRID
        vals = np.interp(zz, med.index.values, med.values, left=med.values[0], right=med.values[-1])
        neg = zz < 0
        v = vals.copy()
        for i in range(int(neg.sum()) - 2, -1, -1):
            v[i] = max(v[i], v[i + 1])
        shapes[(lo, hi)] = v
    return shapes


def g_shape(z: np.ndarray, tau_days: np.ndarray | float, m: np.ndarray | float) -> np.ndarray:
    z = np.asarray(z, float)
    tau = np.broadcast_to(np.asarray(tau_days, float), z.shape)
    shapes = smile_shapes()
    out = np.empty_like(z)
    for lo, hi in DTE_BUCKETS:
        sel = (tau >= lo - 0.5) & (tau <= hi + 0.5) if hi < 70 else (tau >= lo - 0.5)
        if sel.any():
            out[sel] = np.interp(z[sel], Z_GRID, shapes[(lo, hi)])
    m = np.broadcast_to(np.asarray(m, float), z.shape)
    return 1.0 + m * (out - 1.0)


# --------------------------------------------------------------------------------------------
# ATM / VIX ratio implied by a skew shape (variance-swap consistency)
# --------------------------------------------------------------------------------------------
def _model_vix(atm: float, tau_days: float, m: float, r: float = 0.03) -> float:
    T = tau_days / 365.0
    F = 100.0
    K = np.linspace(F * np.exp(-9 * atm * np.sqrt(T)), F * np.exp(5 * atm * np.sqrt(T)), 4001)
    z = np.log(K / F) / (atm * np.sqrt(T))
    iv = atm * g_shape(z, np.full_like(z, tau_days), m)
    put = K < F
    S0 = F * np.exp(-r * T)
    q = np.where(put, bs_price(S0, K, T, r, 0.0, iv, "put"), bs_price(S0, K, T, r, 0.0, iv, "call"))
    dK = np.gradient(K)
    var = 2.0 / T * np.exp(r * T) * np.sum(dK / K ** 2 * q)
    return float(np.sqrt(var))


@lru_cache(maxsize=None)
def _ratio_table(tau_bucket: int) -> tuple:
    ms = np.round(np.arange(0.0, 1.61, 0.1), 2)
    rat = [0.16 / _model_vix(0.16, float(tau_bucket), m) for m in ms]
    return tuple(ms), tuple(rat)


def atm_over_vix(m, tau_days) -> np.ndarray:
    """ATM IV / variance-swap vol for skew scale m (vectorised over m; tau picks the shape bucket)."""
    m = np.asarray(m, float)
    tau = np.broadcast_to(np.asarray(tau_days, float), m.shape)
    out = np.empty_like(m)
    for lo, hi in DTE_BUCKETS:
        rep = int(np.clip((lo + hi) // 2, 3, 45))
        ms, rat = _ratio_table(rep)
        sel = (tau >= lo - 0.5) & (tau <= hi + 0.5) if hi < 70 else (tau >= lo - 0.5)
        if sel.any():
            out[sel] = np.interp(m[sel], ms, rat)
    return out


# --------------------------------------------------------------------------------------------
# Market panel
# --------------------------------------------------------------------------------------------
def _release_dates(name: str) -> pd.DatetimeIndex:
    from common14 import HERE
    d = pd.read_csv(HERE / "event_data" / f"{name}.csv", parse_dates=["date"])["date"]
    return pd.DatetimeIndex(sorted(d))


def cpi_dates() -> pd.DatetimeIndex:
    return _release_dates("cpi_release_dates")


def nfp_dates() -> pd.DatetimeIndex:
    return _release_dates("nfp_release_dates")


@lru_cache(maxsize=1)
def market() -> pd.DataFrame:
    spx = yf_close("^GSPC")
    tr = yf_close("^SP500TR")
    df = pd.DataFrame({"spx": spx}).loc["1989-01-01":END_DATE]
    df["vix"] = cboe("VIX")
    v3 = pd.concat([yf_close("^VIX3M").loc[:"2009-09-17"], cboe("VIX3M")])
    v3 = v3[~v3.index.duplicated(keep="last")]
    df["vix3m_act"] = v3
    df["vix9d_act"] = cboe("VIX9D")
    df["vix6m"] = cboe("VIX6M")
    df["skew_idx"] = cboe("SKEW")
    df["vix1d"] = cboe("VIX1D")
    df = df.dropna(subset=["spx"])
    df[["vix", "skew_idx"]] = df[["vix", "skew_idx"]].ffill()
    df["r"] = np.log(df.spx).diff()
    df["rv10"] = df.r.rolling(10).std() * np.sqrt(252) * 100
    df["rv21"] = df.r.rolling(21).std() * np.sqrt(252) * 100
    df["vix_ma252"] = df.vix.rolling(252, min_periods=20).mean()
    # dividend yield from TR vs price (trailing 1y), T-bill
    trr = np.log(tr).diff().reindex(df.index)
    q = (trr - df.r).rolling(252, min_periods=60).sum().clip(0.0, 0.05)
    df["q"] = q.bfill().fillna(0.02)
    from common14 import tbill_daily
    df["rf"] = tbill_daily().reindex(df.index).ffill().bfill()
    # --- proxies for missing term-structure points (fitted on the post-2006/2011 data) ---
    import statsmodels.api as sm
    lv = np.log(df.vix)
    x3 = pd.DataFrame({"c": 1.0, "lv": lv, "lrel": np.log(df.vix / df.vix_ma252)})
    y3 = np.log(df.vix3m_act / df.vix)
    ok = y3.notna() & x3.notna().all(axis=1)
    b3 = sm.OLS(y3[ok], x3[ok]).fit().params
    x9 = pd.DataFrame({"c": 1.0, "lv": lv, "lrv": np.log(df.rv10.clip(lower=3) / df.vix)})
    y9 = np.log(df.vix9d_act / df.vix)
    ok9 = y9.notna() & x9.notna().all(axis=1)
    b9 = sm.OLS(y9[ok9], x9[ok9]).fit().params
    df["vix3m"] = df.vix3m_act.fillna(df.vix * np.exp(x3 @ b3))
    df["vix9d"] = df.vix9d_act.fillna(df.vix * np.exp(x9 @ b9))
    df["vix6m"] = df.vix6m.fillna(df.vix3m * (df.vix3m / df.vix) ** 0.5)
    df.attrs["proxy_coef_vix3m"] = b3.to_dict()
    df.attrs["proxy_coef_vix9d"] = b9.to_dict()
    df["ts3m"] = df.vix3m_act / df.vix          # real ratio only (NaN before 2006-07)
    df["ts3m_proxy"] = df.vix / df.vix3m        # VIX/VIX3M incl. proxy
    df["ts_ratio"] = df.vix / df.vix3m_act       # VIX/VIX3M actual
    df["ma200"] = df.spx.rolling(200).mean()
    df["above200"] = df.spx > df.ma200
    df["m_skew"] = ((df.skew_idx - 100) / (SKEW_SNAP - 100)).clip(0.3, 1.5)
    # event weeks (ISO week containing a scheduled FOMC announcement or CPI release)
    wk = df.index.to_period("W-FRI")
    fomc = fomc_dates()
    cpi = cpi_dates()
    df["fomc_week"] = wk.isin(pd.DatetimeIndex(fomc).to_period("W-FRI"))
    df["cpi_week"] = wk.isin(pd.DatetimeIndex(cpi).to_period("W-FRI"))
    df["fomc_day"] = df.index.isin(fomc)
    df["cpi_day"] = df.index.isin(cpi)
    df["nfp_day"] = df.index.isin(nfp_dates())
    return df


def m_from_mode(m_skew, mode: str):
    """Skew scale: 'skew' = SKEW-index scaled; 'fixed' = today's shape; 'blend' = halfway."""
    if mode == "skew":
        return m_skew
    if mode == "blend":
        return 0.5 + 0.5 * np.asarray(m_skew, float)
    return np.ones_like(np.asarray(m_skew, float)) if np.ndim(m_skew) else 1.0


def vix_tau(row_or_df, tau_days):
    """Variance-swap vol (in decimals) for tenor tau (days) by total-variance interpolation."""
    ten = np.array([9.0, 30.0, 93.0, 183.0])
    if isinstance(row_or_df, pd.Series):
        lv = np.array([row_or_df.vix9d, row_or_df.vix, row_or_df.vix3m, row_or_df.vix6m], float) / 100
        tv = lv ** 2 * ten
        tau = np.asarray(tau_days, float)
        t = np.clip(tau, 1.0, 183.0)
        w = np.interp(t, ten, tv, left=np.nan)
        # below 9 days: keep the 9-day vol level (flat vol)
        w = np.where(t < 9, lv[0] ** 2 * t, w)
        return np.sqrt(w / t)
    raise TypeError


def iv_surface(S, K, tau_days, r, q, vix_levels, m, kind=None, iv_markup=0.0):
    """Vectorised IV for arrays of strikes/tenors on possibly different days.
    vix_levels: array (..., 4) of [vix9d, vix, vix3m, vix6m] in index points."""
    ten = np.array([9.0, 30.0, 93.0, 183.0])
    lv = np.asarray(vix_levels, float) / 100.0
    tau = np.clip(np.asarray(tau_days, float), 0.25, 183.0)
    tv = lv ** 2 * ten
    # piecewise-linear interpolation of total variance, per row
    t = np.clip(tau, 9.0, 183.0)
    idx = np.clip(np.searchsorted(ten, t) - 1, 0, 2)
    t0 = ten[idx]
    t1 = ten[idx + 1]
    w0 = np.take_along_axis(tv, idx[..., None], -1)[..., 0]
    w1 = np.take_along_axis(tv, (idx + 1)[..., None], -1)[..., 0]
    w = w0 + (w1 - w0) * (t - t0) / (t1 - t0)
    vs = np.sqrt(w / t)
    vs = np.where(tau < 9.0, lv[..., 0], vs)
    atm = atm_over_vix(m, tau) * vs * (1.0 + iv_markup)
    T = tau / 365.0
    F = S * np.exp((r - q) * T)
    z = np.log(K / F) / (atm * np.sqrt(T))
    return atm * g_shape(z, tau, m)


def price(S, K, tau_days, r, q, vix_levels, m, kind, iv_markup=0.0):
    iv = iv_surface(S, K, tau_days, r, q, vix_levels, m, iv_markup=iv_markup)
    return bs_price(S, K, np.asarray(tau_days, float) / 365.0, r, q, iv, kind), iv


def strike_for_delta(S, tau_days, r, q, vix_levels, m, delta, kind, iv_markup=0.0, n_iter=6):
    """Strike whose model delta (using the smile IV at that strike) equals |delta|."""
    T = np.asarray(tau_days, float) / 365.0
    iv = iv_surface(S, S, tau_days, r, q, vix_levels, m, iv_markup=iv_markup)
    K = S
    for _ in range(n_iter):
        if kind == "put":
            d1 = norm.ppf(1 - abs(delta) * np.exp(q * T))
        else:
            d1 = norm.ppf(abs(delta) * np.exp(q * T))
        K = S * np.exp(-d1 * iv * np.sqrt(T) + (r - q + 0.5 * iv ** 2) * T)
        iv = iv_surface(S, K, tau_days, r, q, vix_levels, m, iv_markup=iv_markup)
    return K


# --------------------------------------------------------------------------------------------
# Spread model: median quoted SPX spread by premium bucket (2026-09-28 snapshot, 14-63 DTE OTM),
# interpolated in log-premium, scaled by sqrt(VIX/16) and by an era multiplier (wider markets before
# electronic/penny-era quoting: x2 before 2008, x1.5 2008-2012 -- an assumption, not measured).
# --------------------------------------------------------------------------------------------
_SPR_MID = np.array([0.10, 0.725, 1.575, 2.5, 4.0, 6.4, 10.05, 15.4, 26.8, 46.3, 75.2, 118.55, 300.0])
_SPR_ABS = np.array([0.05, 0.30, 0.30, 0.35, 0.40, 0.60, 0.70, 0.80, 0.90, 1.10, 1.30, 1.50, 3.00])


def quoted_spread(mid, vix, year=2026):
    mid = np.maximum(np.asarray(mid, float), 0.0)
    base = np.interp(np.log(np.maximum(mid, 0.05)), np.log(_SPR_MID), _SPR_ABS)
    era = np.where(np.asarray(year) < 2008, 2.0, np.where(np.asarray(year) < 2013, 1.5, 1.0))
    return base * np.sqrt(np.clip(np.asarray(vix, float), 10, 90) / 16.0) * era


def settings() -> tuple[str, float]:
    from common14 import OUT
    p = OUT / "model_settings.csv"
    if p.exists():
        s = pd.read_csv(p, index_col=0).iloc[:, 0]
        return str(s["best_mode"]), float(s["best_markup"])
    return "blend", -0.05
