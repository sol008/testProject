"""Track 31: build the candidate sleeves as daily return series (CSV: date,ret).

Sleeves (all after fund costs, pre-tax, in USD):
  SPY, QQQ                      buy-and-hold total return less the ETF expense ratio
  SPX{L}_200d_{w|d}, NDX{L}_...  L x daily-reset fund (track 04's validated formula
                                  L*r_TR - (L-1)*(rf + 0.4%) - 0.9%), held while the price index closes
                                  above its 200-day average, T-bills otherwise. Decision weekly (last
                                  session of the week) or daily; executed at the NEXT OPEN (1962+ for the
                                  S&P, 1985+ for the Nasdaq-100; at the next close before 1962). 0.05% a switch.
  BTC_10wk, BTC_hold            Bitcoin weekly-close > 10-week average switch (design M3), IBIT costs
  PhaseA                        the current design's Phase A book (M1, M2, M3, W10), track 23's
                                  1993-2026 monthly history spread evenly over each month's sessions
  rf                            T-bills

Two modes:
  hist     history as it happened
  fwd      forward-shrunk: T-bills a flat 4.2%; the S&P and Nasdaq-100 total-return paths are tilted
           by a constant daily log drift so that buy-and-hold earns EQ_FWD (4.5%) a year over the
           chosen window (CAPE ~41, design s0/s6: 3-6%); the 200-day filter is RE-COMPUTED on the
           tilted path, so the trend rule faces the whipsaws a lower drift brings. Bitcoin is tilted to
           BTC_FWD (its cycle-decay extrapolation, `btc_decay()`); Phase A to T-bills + 0.8%.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
os.environ.setdefault("TRACK04_END", "2026-09-28")
sys.path.insert(0, str(HERE.parent / "04-derivatives"))
import common as C04  # noqa: E402  track 04 loaders and data cache
import s03_letf_analysis as S03  # noqa: E402  validated LETF simulation

TD = 252
BILLS_FWD = 0.042
EQ_FWD = 0.045          # S&P 500 and Nasdaq-100 forward CAGR (central of 3-6%)
PHASEA_EXCESS = 0.008   # design s6 central excess of the Phase A book over T-bills
SPREAD, ER_LETF = 0.004, 0.009
ER_SPY, ER_QQQ, ER_IBIT = 0.000945, 0.0020, 0.0025
SWITCH_COST = 0.0005
MONDAY_OLD_SHARE = 13.5 / 24   # Sunday 24:00 UTC -> IBIT's Monday open (13:30 UTC): old position
T23_MONTHLY = HERE.parent / "23-duration-verify" / "results" / "portfolio_monthly_book_returns.csv"
PHASEA_COL = "Lean A + M2, 90-day W10"
BTC_OOS_START = "2021-01-01"   # track 15's test period for the crypto switch


# ----------------------------------------------------------------------------- raw data
def load_index(name: str) -> pd.DataFrame:
    """Close price, total return (close to close), overnight price return (NaN when no real open), rf."""
    if name == "SPX":
        px, rtr = S03.index_tr_daily()
        ohlc = C04.yf_ohlc("^GSPC")
        first_open = pd.Timestamp("1962-01-02")
    elif name == "NDX":
        px = C04.yf_close("^NDX")
        rtr = (px.pct_change() + 0.008 / TD).dropna()      # track 04: price + 0.8% dividends
        ohlc = C04.yf_ohlc("^NDX")
        first_open = px.index[0]
    else:
        raise ValueError(name)
    df = pd.DataFrame({"px": px.reindex(rtr.index), "r_tr": rtr})
    op = ohlc["Open"].reindex(df.index)
    prev = px.shift(1).reindex(df.index)
    r_on = op / prev - 1
    r_on[(df.index < first_open) | ~(op > 0) | r_on.abs().gt(0.25)] = np.nan
    df["r_on"] = r_on
    df["rf_ann"] = S03.short_rate_daily(df.index)
    return df


def load_btc() -> pd.Series:
    return C04.yf_close("BTC-USD").rename("btc")


def load_phasea(nyse_dates: pd.DatetimeIndex) -> pd.Series:
    m = pd.read_csv(T23_MONTHLY, parse_dates=["month"]).set_index("month")[PHASEA_COL]
    d = pd.Series(index=nyse_dates[(nyse_dates >= "1993-02-01")], dtype=float)
    per = d.index.to_period("M")
    for p, grp in d.groupby(per):
        key = [k for k in m.index if k.to_period("M") == p]
        if not key:
            continue
        R = m.loc[key[0]]
        d.loc[grp.index] = (1 + R) ** (1 / len(grp)) - 1
    return d.dropna().rename("PhaseA")


# ----------------------------------------------------------------------------- helpers
def tilt(r: pd.Series, delta: float) -> pd.Series:
    """Add a constant daily log drift."""
    return np.expm1(np.log1p(r) + delta)


def delta_to_cagr(r: pd.Series, target: float, start: str, end: str) -> float:
    x = np.log1p(r.loc[start:end].dropna())
    return np.log1p(target) / TD - x.mean()


def week_end_flags(idx: pd.DatetimeIndex) -> pd.Series:
    s = pd.Series(idx, index=idx)
    last = s.groupby(idx.to_period("W-SUN")).transform("max")
    return pd.Series(idx == last.values, index=idx)


# ----------------------------------------------------------------------------- sleeves
def trend_sleeve(df: pd.DataFrame, rf_d: pd.Series, L: int, cadence: str, er: float,
                 n: int = 200, cost: float = SWITCH_COST):
    """Daily returns and positions of 'L x fund while the index is above its n-day average'.

    Decision at the close (every session, or the last session of each week), executed at the next
    open: the overnight gap belongs to the old position and the rest of the day to the new one.
    Without a real open (S&P before 1962) the switch happens at the next close.
    """
    px, r_tr, r_on = df.px, df.r_tr, df.r_on
    ma = px.rolling(n).mean()
    above = (px > ma).astype(float).where(ma.notna())
    if cadence == "weekly":
        wk = week_end_flags(df.index)
        sig = above.where(wk).ffill()
    else:
        sig = above
    new = sig.shift(1)          # decided at the previous close, held from today's open
    old = new.shift(1)
    full = L * r_tr - (L - 1) * (rf_d + SPREAD / TD) - er / TD
    on = L * r_on
    has_open = r_on.notna()
    r = pd.Series(np.nan, index=df.index)
    both = (old == 1) & (new == 1)
    none = (old == 0) & (new == 0)
    out_ = (old == 1) & (new == 0)
    in_ = (old == 0) & (new == 1)
    r[both] = full[both]
    r[none] = rf_d[none]
    r[out_ & has_open] = on[out_ & has_open]
    r[out_ & ~has_open] = full[out_ & ~has_open]
    ok = in_ & has_open
    r[ok] = (1 + full[ok]) / (1 + on[ok]) - 1
    r[in_ & ~has_open] = rf_d[in_ & ~has_open]
    sw = (old != new) & old.notna() & new.notna()
    r[sw] -= cost
    return r.dropna(), new.reindex(r.dropna().index)


def btc_sleeves(btc: pd.Series, nyse: pd.DatetimeIndex, rf_ann_nyse: pd.Series, weeks: int = 10,
                er: float = ER_IBIT, cost: float = SWITCH_COST):
    """Weekly Sunday-close > 10-week-average switch on calendar days, compounded onto NYSE dates."""
    cal = btc.asfreq("D").ffill()
    lr = np.log(cal).diff()
    rf_cal = rf_ann_nyse.reindex(cal.index).ffill().bfill() / 365.0
    sun = cal[cal.index.dayofweek == 6]
    ma = sun.rolling(weeks).mean()
    on_w = (sun > ma).astype(float).where(ma.notna())
    pos = on_w.reindex(cal.index).ffill().shift(1)        # Sunday's decision applies from Monday
    old = pos.shift(1)
    a = np.where(cal.index.dayofweek == 0, MONDAY_OLD_SHARE, 0.0)   # share of Monday before IBIT opens
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
    posn = pos.dropna()
    return sw.rename("BTC_10wk"), hold.rename("BTC_hold"), posn


def btc_decay(btc: pd.Series) -> pd.DataFrame:
    """Cycle multiples (peak to peak, trough to trough) and their geometric decay -> forward CAGR."""
    peaks = {"2013-12-04": 1151.0}   # CoinDesk BPI close; outside the Yahoo series (starts 2014-09)
    rows = []
    for y in (2017, 2021, 2025):
        x = btc[btc.index.year == y]
        peaks[str(x.idxmax().date())] = float(x.max())
    troughs = {}
    for y in (2015, 2018, 2022, 2026):
        x = btc[btc.index.year == y]
        troughs[str(x.idxmin().date())] = float(x.min())
    for kind, pts in (("peak to peak", peaks), ("trough to trough", troughs)):
        d = sorted(pts)
        lm = []
        for a, b in zip(d[:-1], d[1:]):
            yrs = (pd.Timestamp(b) - pd.Timestamp(a)).days / 365.25
            m = pts[b] / pts[a]
            lm.append(np.log(m))
            rows.append(dict(kind=kind, start=a, end=b, start_price=pts[a], end_price=pts[b], multiple=m,
                             years=yrs, cagr=m ** (1 / yrs) - 1))
        ratio = np.exp(np.mean(np.log(np.array(lm[1:]) / np.array(lm[:-1]))))
        nxt = lm[-1] * ratio
        rows.append(dict(kind=kind, start="next cycle (extrapolated)", end="", multiple=np.exp(nxt),
                         years=4.0, cagr=np.exp(nxt / 4.0) - 1, decay_ratio=ratio))
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------- builders
_MEMO: dict = {}


def jensen_alpha(r_sleeve: pd.Series, r_asset: pd.Series, rf: pd.Series, start=None, end=None):
    """Daily Jensen alpha of a timing sleeve on its asset (both over T-bills) and its t-statistic."""
    x = pd.concat([r_sleeve - rf, r_asset - rf], axis=1).loc[start:end].dropna().values
    y, z = x[:, 0], x[:, 1]
    Z = np.c_[np.ones(len(z)), z]
    b, *_ = np.linalg.lstsq(Z, y, rcond=None)
    e = y - Z @ b
    cov = np.linalg.inv(Z.T @ Z) * (e @ e) / (len(y) - 2)
    return b[0], b[0] / np.sqrt(cov[0, 0]), b[1]


def build_all(mode: str, window: tuple[str, str] | None = None, eq_fwd: float = EQ_FWD,
              btc_fwd: float = 0.075, bills_fwd: float = BILLS_FWD, cadences=("weekly", "daily"),
              kappa_cap: float = 0.5, kappa_override: dict | None = None):
    """Return (returns DataFrame on NYSE dates, positions dict, info dict).

    fwd mode: tilt the underlying paths (see module docstring), rebuild every rule on the tilted
    path, then shrink each timing rule's Jensen alpha on its asset by (1 - kappa), with
    kappa = min(kappa_cap, t^2 / (1 + t^2)) and t the alpha's t-statistic on the real history of the
    same window (track 03 s2.5; design s4 uses kappa = 0.5 for rule-based modules). An L x sleeve
    loses L x the 1 x sleeve's shrunk alpha. Without this, a constant tilt hands a rule that is out of
    the market part of the time an artificial edge over buy-and-hold.
    """
    spx, ndx = load_index("SPX"), load_index("NDX")
    nyse = spx.index
    info = {}
    kap = {}
    if mode == "fwd":
        a, b = window
        key = ("hist", tuple(cadences))
        if key not in _MEMO:
            _MEMO[key] = build_all("hist", cadences=cadences)
        H = _MEMO[key][0]
        for nm, asset in (("SPX", "SPY"), ("NDX", "QQQ")):
            for cad in cadences:
                al, t, _ = jensen_alpha(H[f"{nm}1_200d_{cad[0]}"], H[asset], H["rf"], a, b)
                kap[f"{nm}_{cad[0]}"] = min(kappa_cap, t * t / (1 + t * t))
                info[f"hist_alpha_{nm}_{cad[0]}_pa"], info[f"hist_alpha_t_{nm}_{cad[0]}"] = al * TD, t
        al, t, _ = jensen_alpha(H["BTC_10wk"], H["BTC_hold"], H["rf"], a, b)
        info["hist_alpha_BTC_pa"], info["hist_alpha_t_BTC"] = al * TD, t
        # Bitcoin: kappa from track 15's out-of-sample period (2021 on), not the 2014-20 bubble years
        al, t, _ = jensen_alpha(H["BTC_10wk"], H["BTC_hold"], H["rf"], BTC_OOS_START, b)
        kap["BTC"] = min(kappa_cap, t * t / (1 + t * t))
        info["oos_alpha_BTC_pa"], info["oos_alpha_t_BTC"] = al * TD, t
        for k, v in (kappa_override or {}).items():      # e.g. {"BTC": 0.0}: no timing edge at all
            for kk in list(kap):
                if kk.startswith(k):
                    kap[kk] = v
        rf_d = pd.Series((1 + bills_fwd) ** (1 / TD) - 1, index=nyse)
        rf_ann = pd.Series(bills_fwd, index=nyse)
        for nm, df in (("SPX", spx), ("NDX", ndx)):
            s0 = max(pd.Timestamp(a), df.index[0])
            dl = delta_to_cagr(df.r_tr, eq_fwd, str(s0.date()), b)
            info[f"tilt_{nm}_pa"] = dl * TD
            df["r_tr"] = tilt(df.r_tr, dl)
            df["px"] = df.px * np.exp(dl * np.arange(len(df)))
    else:
        rf_d = spx.rf_ann / TD
        rf_ann = spx.rf_ann
    out = {"rf": rf_d, "SPY": spx.r_tr - ER_SPY / TD}
    ndx_rf = rf_d.reindex(ndx.index).ffill()
    out["QQQ"] = ndx.r_tr - ER_QQQ / TD
    pos = {}
    for nm, df, rfd in (("SPX", spx, rf_d), ("NDX", ndx, ndx_rf)):
        for cad in cadences:
            base = None
            for L in (1, 2, 3):
                er = (ER_SPY if nm == "SPX" else ER_QQQ) if L == 1 else ER_LETF
                r, p = trend_sleeve(df, rfd, L, cad, er)
                key = f"{nm}{L}_200d_{cad[0]}"
                if mode == "fwd":
                    if L == 1:
                        a, b = window
                        asset = out["SPY"] if nm == "SPX" else out["QQQ"]
                        base, _, _ = jensen_alpha(r, asset, rfd, a, b)
                        info[f"fwd_alpha_{nm}_{cad[0]}_pa_before_shrink"] = base * TD
                        info[f"kappa_{nm}_{cad[0]}"] = kap[f"{nm}_{cad[0]}"]
                    r = r - (1 - kap[f"{nm}_{cad[0]}"]) * L * base
                out[key], pos[key] = r, p
        for L in (2, 3):   # the same funds held without the filter
            out[f"{nm}{L}_hold"] = L * df.r_tr - (L - 1) * (rfd + SPREAD / TD) - ER_LETF / TD
    btc = load_btc()
    sw, hold, bpos = btc_sleeves(btc, nyse, rf_ann)
    if mode == "fwd":
        a, b = window
        lr = np.log(btc).diff()
        raw = btc
        dl = 0.0
        for _ in range(3):   # calibrate so the IBIT-cost buy-and-hold sleeve earns btc_fwd on the window
            g = np.log1p(hold.loc[a:b]).mean() * TD
            dl += (np.log1p(btc_fwd) - g) / 365.25
            btc = pd.Series(np.exp(np.log(raw.iloc[0]) + np.r_[0, np.cumsum(lr.iloc[1:].values + dl)]),
                            index=raw.index)
            sw, hold, bpos = btc_sleeves(btc, nyse, rf_ann)
        info["tilt_BTC_pa"] = dl * 365.25
    if mode == "fwd":
        a, b = window
        base, _, _ = jensen_alpha(sw, hold, rf_d.reindex(sw.index), a, b)
        info["fwd_alpha_BTC_pa_before_shrink"], info["kappa_BTC"] = base * TD, kap["BTC"]
        sw = sw - (1 - kap["BTC"]) * base
    out["BTC_10wk"], out["BTC_hold"], pos["BTC_10wk"] = sw, hold, bpos
    pa = load_phasea(nyse)
    if mode == "fwd":
        a, b = window
        s0 = max(pd.Timestamp(a), pa.index[0])
        dl = delta_to_cagr(pa, bills_fwd + PHASEA_EXCESS, str(s0.date()), b)
        pa = tilt(pa, dl)
    out["PhaseA"] = pa
    R = pd.DataFrame(out).reindex(nyse)
    R = R.loc[: "2026-09-28"]
    return R, pos, info


def save_inputs(R: pd.DataFrame, folder: Path):
    folder.mkdir(parents=True, exist_ok=True)
    for c in R.columns:
        s = R[c].dropna()
        s.rename("ret").to_frame().to_csv(folder / f"{c}.csv", index_label="date", float_format="%.8g")
