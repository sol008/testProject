"""Track 33 (strategy zoo): weekly-decision backtest engine, instruments, signals and families.

Timing (no look-ahead): a decision is taken with data up to the last close of each week (usually
Friday, crypto at the Friday UTC close) and executed at the NEXT trading day's close (usually
Monday).  Period k runs from exec[k] close to exec[k+1] close.  So there is at most one decision a
week by construction, and every signal is lagged one trading day behind its data.

Instruments
  * 1x equity/ETF  : gross index return - fund fee (SPY 0.09%, QQQ 0.20%, SPDRs 0.09%, SMH 0.35% ...)
  * Lx equity/ETF  : L*r - (L-1)*(T-bill + 0.40%) - 0.90%/yr, daily reset (track 04, s03_letf_analysis.py)
  * 1x crypto      : Coinbase spot, no fee (trading cost 0.50% a side)
  * 2x crypto      : 2*r - (T-bill + 3.0%) - 1.85%/yr, daily reset on the 7-day calendar (BITX-like;
                     the extra spread stands in for the CME basis a futures-based fund pays)
  * cash           : T-bill
Trading cost per unit of turnover (one side): index 1x 0.03%, index LETF 0.05%, other ETF 0.05%,
other LETF 0.10%, crypto spot 0.50%, crypto 2x ETF 0.20%.
"""
from __future__ import annotations

import itertools
import math

import numpy as np
import pandas as pd

from zoo_data import CRYPTO, ETF_FEE, SECTORS

SPREAD, ER = 0.004, 0.009
MIN_HS = 0.00003            # minimum option half-spread, as a fraction of the index level
CRYPTO_SPREAD, CRYPTO_ER2 = 0.03, 0.0185
FEE1 = dict(ETF_FEE, SPX=0.0009, NDX=0.0020)
INDEX = {"SPX", "NDX"}


# =========================================================================== grid & instruments
class Zoo:
    def __init__(self, panel: dict):
        self.p = panel
        base = panel["base"]
        self.cal = cal = base.index
        self.acc = np.concatenate([[1.0], np.diff(cal.values).astype("timedelta64[D]").astype(float)]) / 365.0
        self.tb = panel["tb"].values
        wk = cal.to_period("W-FRI")
        last = pd.Series(cal, index=cal).groupby(wk).max()
        dec = pd.DatetimeIndex(last.values)
        pos = cal.get_indexer(dec)
        ok = pos + 1 < len(cal)
        self.dec_all = dec[ok]
        self.dpos = pos[ok]
        self.epos = pos[ok] + 1
        self.exe_all = cal[self.epos]
        self.K = len(self.dec_all) - 1                   # number of holding periods
        self.dec = self.dec_all[:-1]                     # decision date of period k
        self.start = self.exe_all[:-1]                   # period k starts at this close
        self.end = self.exe_all[1:]                      # ... and ends at this close
        self.years = self.end.year.values
        # daily levels of each underlying (gross TR), NaN before start
        self.lvl = {}
        for u in base.columns:
            r = base[u].values
            v = np.where(np.isnan(r), np.nan, np.cumprod(np.where(np.isnan(r), 0.0, r) + 1.0))
            self.lvl[u] = v
        # cash
        rc = np.concatenate([[0.0], self.tb[:-1]]) * self.acc
        self.cash_lvl = np.cumprod(1 + rc)
        self.Rcash = self.cash_lvl[self.epos[1:]] / self.cash_lvl[self.epos[:-1]] - 1
        self._R, self._cost = {}, {}
        self._sig = {}

    # ----------------------------------------------------------------- instruments
    def inst_daily(self, u: str, L: int) -> np.ndarray:
        base = self.p["base"][u].values
        tb_prev = np.concatenate([[self.tb[0]], self.tb[:-1]])
        if u in CRYPTO:
            if L == 1:
                return base
            s = self.p["crypto_native"][u]
            rn = s.pct_change().values
            tbn = self.p["tb"].reindex(s.index).ffill().bfill().values
            fund = L * rn - (L - 1) * (tbn + CRYPTO_SPREAD) / 365.0 - CRYPTO_ER2 / 365.0
            fund = np.clip(fund, -1.0, None)
            lv = pd.Series(np.cumprod(1 + np.nan_to_num(fund)), index=s.index)
            r = lv.reindex(self.cal).pct_change().values.copy()
            r[np.isnan(base)] = np.nan
            return r
        if L == 1:
            return base - FEE1.get(u, 0.0) * self.acc
        fund = L * base - (L - 1) * (tb_prev + SPREAD) * self.acc - ER * self.acc
        return np.clip(fund, -1.0, None)

    def R(self, u: str, L: int) -> np.ndarray:
        key = (u, L)
        if key not in self._R:
            r = self.inst_daily(u, L)
            v = np.where(np.isnan(r), np.nan, np.cumprod(np.where(np.isnan(r), 0.0, r) + 1.0))
            a, b = v[self.epos[:-1]], v[self.epos[1:]]
            self._R[key] = b / a - 1
            if u in CRYPTO:
                c = 0.005 if L == 1 else 0.002
            elif u in INDEX:
                c = 0.0003 if L == 1 else 0.0005
            else:
                c = 0.0005 if L == 1 else 0.0010
            self._cost[key] = c
        return self._R[key]

    def cost(self, u, L):
        self.R(u, L)
        return self._cost[(u, L)]

    # ----------------------------------------------------------------- daily series helpers
    def level(self, u):
        return self.lvl[u]

    def at_dec(self, arr: np.ndarray) -> np.ndarray:
        return arr[self.dpos[:-1]]

    # ----------------------------------------------------------------- portfolio evaluation
    def run(self, W: dict, live_from: int | None = None) -> np.ndarray:
        """W: {(u, L): weight array (K,) with NaN = not live}. Returns weekly net returns (NaN before start)."""
        K = self.K
        tot = np.zeros(K)
        invested = np.zeros(K)
        turn = np.zeros(K)
        live = np.ones(K, bool)
        for key, w in W.items():
            Rk = self.R(*key)
            w = np.asarray(w, float)
            live &= ~np.isnan(w)
            wz = np.nan_to_num(w)
            bad = (wz != 0) & np.isnan(Rk)
            live &= ~bad
            tot += wz * np.nan_to_num(Rk)
            invested += wz
            prev = np.concatenate([[0.0], wz[:-1]])
            turn += np.abs(wz - prev) * self.cost(*key)
        # a variant is live from the first period after which all its inputs are valid
        first = np.argmax(live) if live.any() else K
        if live_from is not None:
            first = max(first, live_from)
        # before `first`, and any later non-live period, count as not live
        out = tot + (1 - invested) * self.Rcash - turn
        # first period's turnover counts the initial purchase from cash
        out[:first] = np.nan
        if first < K:
            # recompute first-period cost as buying from cash (prev weights may have been pre-live)
            c0 = 0.0
            for key, w in W.items():
                c0 += abs(np.nan_to_num(np.asarray(w, float))[first]) * self.cost(*key)
            out[first] = tot[first] + (1 - invested[first]) * self.Rcash[first] - c0
            later_bad = ~live[first:]
            if later_bad.any():
                o = out[first:]
                o[later_bad] = np.nan
        return out


# =========================================================================== signals
def sma(x: np.ndarray, n: int) -> np.ndarray:
    s = pd.Series(x)
    return s.rolling(n, min_periods=n).mean().values


def rolling_max_prev(x, n):
    return pd.Series(x).shift(1).rolling(n, min_periods=n).max().values


def rolling_min_prev(x, n):
    return pd.Series(x).shift(1).rolling(n, min_periods=n).min().values


def rsi(x, n=2):
    s = pd.Series(x)
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    dn = (-d).clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    return (100 - 100 / (1 + up / dn.replace(0, np.nan))).fillna(100).where(s.notna()).values


def realized_vol(x, n):
    lr = np.log(pd.Series(x)).diff()
    return (lr.rolling(n, min_periods=n).std() * np.sqrt(252)).values


def hysteresis(on_cond: np.ndarray, off_cond: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """State machine sampled at decisions: turn on when on_cond, off when off_cond, else hold."""
    out = np.full(len(on_cond), np.nan)
    state = 0.0
    for i in range(len(on_cond)):
        if not valid[i]:
            continue
        if on_cond[i]:
            state = 1.0
        elif off_cond[i]:
            state = 0.0
        out[i] = state
    return out


class Signals:
    """Signals evaluated at decision dates; 1 = risk on, 0 = off, NaN = not yet warm."""

    def __init__(self, z: Zoo):
        self.z = z
        self.cache = {}

    def get(self, u: str, spec: tuple) -> np.ndarray:
        key = (u, spec)
        if key in self.cache:
            return self.cache[key]
        z = self.z
        x = z.level(u)
        kind = spec[0]
        if kind == "sma":                        # ("sma", n, band)
            n, b = spec[1], spec[2]
            m = z.at_dec(sma(x, n))
            p = z.at_dec(x)
            valid = ~np.isnan(m) & ~np.isnan(p)
            if b == 0:
                sig = np.where(valid, (p > m).astype(float), np.nan)
            else:
                sig = hysteresis(p > m * (1 + b), p < m * (1 - b), valid)
        elif kind == "sma10m":                   # monthly 10-month SMA, checked once a month
            s = pd.Series(x, index=z.cal).dropna()
            me = s.groupby(s.index.to_period("M")).tail(1)
            mm = me.rolling(10, min_periods=10).mean()
            msig = (me > mm).astype(float).where(mm.notna())
            # a month-end signal becomes usable at the first decision on/after that month-end
            sig = msig.reindex(z.dec, method="ffill").values.copy()
            sig[z.dec < s.index[0]] = np.nan
        elif kind == "dual":                     # ("dual", fast, slow)
            f, sl = z.at_dec(sma(x, spec[1])), z.at_dec(sma(x, spec[2]))
            valid = ~np.isnan(sl) & ~np.isnan(f)
            sig = np.where(valid, (f > sl).astype(float), np.nan)
        elif kind == "donch":                    # ("donch", n_entry, n_exit)
            hi, lo = z.at_dec(rolling_max_prev(x, spec[1])), z.at_dec(rolling_min_prev(x, spec[2]))
            p = z.at_dec(x)
            valid = ~np.isnan(hi) & ~np.isnan(lo) & ~np.isnan(p)
            sig = hysteresis(p >= hi, p <= lo, valid)
        elif kind == "tsmom":                    # ("tsmom", days)
            p = z.at_dec(x)
            lag = z.at_dec(pd.Series(x).shift(spec[1]).values)
            valid = ~np.isnan(lag) & ~np.isnan(p)
            sig = np.where(valid, (p > lag).astype(float), np.nan)
        elif kind == "vix":                      # ("vix", threshold)
            v = z.at_dec(z.p["vix"].values)
            sig = np.where(np.isnan(v), np.nan, (v < spec[1]).astype(float))
        elif kind == "vixts":                    # ("vixts", ratio)
            v, v3 = z.at_dec(z.p["vix"].values), z.at_dec(z.p["vix3m"].values)
            valid = ~np.isnan(v) & ~np.isnan(v3)
            sig = np.where(valid, (v / v3 < spec[1]).astype(float), np.nan)
        elif kind == "rvol":                     # ("rvol", n, threshold)
            v = z.at_dec(realized_vol(x, spec[1]))
            sig = np.where(np.isnan(v), np.nan, (v < spec[2]).astype(float))
        else:
            raise ValueError(spec)
        self.cache[key] = sig
        return sig


# =========================================================================== variant registry
class Registry:
    def __init__(self, z: Zoo):
        self.z = z
        self.rows = []          # metadata dicts
        self.rets = []          # weekly return arrays

    def add(self, family: str, name: str, params: dict, ret: np.ndarray, assets: str):
        if np.all(np.isnan(ret)):
            return
        self.rows.append(dict(id=len(self.rows), family=family, name=name, assets=assets,
                              params=";".join(f"{k}={v}" for k, v in params.items())))
        self.rets.append(ret.astype(np.float32))


def lev_set(u):
    return (1, 2) if u in CRYPTO else (1, 2, 3)


# ---------------------------------------------------------------- F1 buy and hold
def fam_buyhold(z: Zoo, reg: Registry):
    unds = ["SPX", "NDX"] + SECTORS + ["SMH", "IWM", "EFA", "EEM", "TLT", "GLD"] + CRYPTO
    for u in unds:
        for L in lev_set(u):
            w = np.where(np.isnan(z.R(u, L)), np.nan, 1.0)
            reg.add("1 buy-and-hold", f"{u} {L}x buy-and-hold", dict(u=u, L=L), z.run({(u, L): w}), u)


# ---------------------------------------------------------------- F2 trend filters
TREND_SIGNALS = ([("sma", n, 0.0) for n in (20, 50, 100, 150, 200)] + [("sma", n, 0.02) for n in (50, 100, 200)]
                 + [("sma10m",)] + [("dual", 10, 50), ("dual", 20, 100), ("dual", 50, 150), ("dual", 50, 200)]
                 + [("donch", 20, 10), ("donch", 50, 25), ("donch", 100, 50), ("donch", 250, 125)]
                 + [("tsmom", d) for d in (21, 63, 126, 252)])


def spec_name(spec):
    k = spec[0]
    if k == "sma":
        return f"SMA{spec[1]}" + (f" band{int(spec[2] * 100)}%" if spec[2] else "")
    if k == "sma10m":
        return "10-month SMA"
    if k == "dual":
        return f"SMA{spec[1]}>SMA{spec[2]}"
    if k == "donch":
        return f"Donchian {spec[1]}/{spec[2]}"
    if k == "tsmom":
        return f"{spec[1] // 21}m momentum>0"
    if k == "vix":
        return f"VIX<{spec[1]}"
    if k == "vixts":
        return f"VIX/VIX3M<{spec[1]}"
    if k == "rvol":
        return f"{spec[1]}d vol<{int(spec[2] * 100)}%"
    return str(spec)


def on_off(z, u, L, sig, off="cash"):
    """Weights for 'L x when on, else cash (or 1x)'."""
    W = {(u, L): np.where(np.isnan(sig), np.nan, sig)}
    if off == "1x" and L > 1:
        W[(u, 1)] = np.where(np.isnan(sig), np.nan, 1 - sig)
    return W


def fam_trend(z: Zoo, S: Signals, reg: Registry):
    unds = ["SPX", "NDX", "SMH", "XLK", "XLE", "XLF", "IWM", "BTC", "ETH", "SOL"]
    for u in unds:
        for spec in TREND_SIGNALS:
            sig = S.get(u, spec)
            for L in lev_set(u):
                for off in (("cash",) if L == 1 else ("cash", "1x")):
                    ret = z.run(on_off(z, u, L, sig, off))
                    reg.add("2 trend filter", f"{u} {L}x {spec_name(spec)} (off={off})",
                            dict(u=u, L=L, sig=spec_name(spec), off=off), ret, u)


# ---------------------------------------------------------------- F3 momentum rotation
UNIVERSES = {
    "sectors": SECTORS,
    "broad": ["SPX", "NDX", "IWM", "EFA", "EEM", "TLT", "GLD"],
    "crypto": CRYPTO,
    "risk-mix": ["NDX", "SMH", "BTC", "ETH", "TLT", "GLD"],
    "growth": ["NDX", "SMH", "XLK", "BTC"],
}


def mom_score(z: Zoo, u: str, lb: str) -> np.ndarray:
    x = z.level(u)
    p = z.at_dec(x)
    if lb == "blend":
        parts = [p / z.at_dec(pd.Series(x).shift(d).values) - 1 for d in (21, 63, 126)]
        return np.mean(parts, axis=0)
    d = {"1m": 21, "3m": 63, "6m": 126, "12m": 252}[lb]
    return p / z.at_dec(pd.Series(x).shift(d).values) - 1


def rotation_weights(z: Zoo, univ, lb, topk, reb, absf, L):
    K = z.K
    scores = np.vstack([mom_score(z, u, lb) for u in univ])          # (n, K)
    keys = [(u, min(L, 2) if u in CRYPTO else L) for u in univ]
    Rm = np.vstack([z.R(*k) for k in keys])
    elig = ~np.isnan(scores) & ~np.isnan(Rm)
    W = np.zeros((len(univ), K))
    started = False
    live = np.zeros(K, bool)
    prev = np.zeros(len(univ))
    for k in range(K):
        n_el = elig[:, k].sum()
        if not started and n_el >= 2:          # a rotation needs at least two eligible assets
            started = True
        if not started:
            continue
        live[k] = True
        if k % reb == 0 or not prev.any() and k == np.argmax(live):
            sc = np.where(elig[:, k], scores[:, k], -np.inf)
            order = np.argsort(-sc)[:topk]
            w = np.zeros(len(univ))
            for i in order:
                if not np.isfinite(sc[i]):
                    continue
                if absf and sc[i] <= 0:
                    continue
                w[i] = 1.0 / topk
            prev = w
        # drop any holding whose instrument stops existing
        W[:, k] = np.where(elig[:, k] | (prev == 0), prev, 0.0)
    Wd = {}
    for i, key in enumerate(keys):
        arr = np.where(live, W[i], np.nan)
        Wd[key] = arr
    return Wd


def fam_rotation(z: Zoo, reg: Registry):
    for uname, univ in UNIVERSES.items():
        for lb in ("1m", "3m", "6m", "12m", "blend"):
            for topk in ((1, 2) if len(univ) <= 4 else (1, 2, 3)):
                for reb in (1, 4):
                    for absf in (False, True):
                        for L in ((1, 2) if uname == "crypto" else (1, 2, 3)):
                            W = rotation_weights(z, univ, lb, topk, reb, absf, L)
                            ret = z.run(W)
                            reg.add("3 momentum rotation",
                                    f"{uname} top{topk} {lb} mom, every {reb}w{' +abs filter' if absf else ''}, {L}x",
                                    dict(univ=uname, lb=lb, topk=topk, reb=reb, absf=absf, L=L), ret,
                                    "+".join(univ))
    # Antonacci-style dual momentum (GEM): US vs international, 12m, else bonds
    for L in (1, 2, 3):
        s_us, s_int = mom_score(z, "SPX", "12m"), mom_score(z, "EFA", "12m")
        cash12 = z.at_dec(z.cash_lvl) / z.at_dec(pd.Series(z.cash_lvl).shift(252).values) - 1
        valid = ~np.isnan(s_us) & ~np.isnan(s_int) & ~np.isnan(z.R("IEF", 1))
        best_us = s_us >= s_int
        risk_on = np.maximum(s_us, s_int) > cash12
        w_us = np.where(valid, (risk_on & best_us).astype(float), np.nan)
        w_int = np.where(valid, (risk_on & ~best_us).astype(float), np.nan)
        w_b = np.where(valid, (~risk_on).astype(float), np.nan)
        ret = z.run({("SPX", L): w_us, ("EFA", L): w_int, ("IEF", 1): w_b})
        reg.add("3 momentum rotation", f"dual momentum GEM (SPY/EFA/IEF), {L}x equities",
                dict(univ="GEM", L=L), ret, "SPX+EFA+IEF")


# ---------------------------------------------------------------- F4 mean reversion / dip buying
def fam_dip(z: Zoo, reg: Registry):
    for u in ("SPX", "NDX", "BTC"):
        x = z.level(u)
        p = z.at_dec(x)
        r2 = z.at_dec(rsi(x, 2))
        wk_ret = p / np.concatenate([[np.nan], p[:-1]]) - 1
        s200 = z.at_dec(sma(x, 200))
        drops = (0.10, 0.15, 0.20) if u == "BTC" else (0.03, 0.05, 0.08)
        triggers = {f"RSI2<{t}": (r2 < t) for t in (5, 10, 20)}
        for n in (5, 10, 20):
            lo = z.at_dec(pd.Series(x).rolling(n, min_periods=n).min().values)
            triggers[f"{n}-day low"] = p <= lo
        for d in drops:
            triggers[f"week<-{int(d * 100)}%"] = wk_ret < -d
        valid = ~np.isnan(s200) & ~np.isnan(r2)
        for tname, trig in triggers.items():
            for filt in (False, True):
                t = trig & (p > s200) if filt else trig
                for H in (1, 2, 4):
                    active = np.zeros(z.K)
                    for k in np.flatnonzero(t & valid):
                        active[k:k + H] = 1.0
                    active = np.where(valid, active, np.nan)
                    for base_exp in ("cash", "1x"):
                        for L in lev_set(u):
                            if base_exp == "1x" and L == 1:
                                continue
                            W = {(u, L): active}
                            if base_exp == "1x":
                                W[(u, 1)] = np.where(np.isnan(active), np.nan, 1 - active)
                            reg.add("4 mean reversion / dip", f"{u} buy {L}x on {tname}{' in uptrend' if filt else ''}, "
                                    f"hold {H}w, else {base_exp}", dict(u=u, trig=tname, filt=filt, H=H, base=base_exp, L=L),
                                    z.run(W), u)


# ---------------------------------------------------------------- F5 volatility regimes
def fam_vol(z: Zoo, S: Signals, reg: Registry):
    specs = {"SPX": [("vix", t) for t in (15, 20, 25, 30)] + [("vixts", 1.0), ("vixts", 0.9)]
             + [("rvol", 21, t) for t in (0.12, 0.16, 0.20, 0.25)],
             "NDX": [("vix", t) for t in (15, 20, 25, 30)] + [("vixts", 1.0), ("vixts", 0.9)]
             + [("rvol", 21, t) for t in (0.16, 0.20, 0.25, 0.30)],
             "BTC": [("rvol", 21, t) for t in (0.4, 0.6, 0.8)] + [("vix", 20), ("vix", 25)]}
    for u, sp in specs.items():
        for spec in sp:
            sig = S.get(u if spec[0] == "rvol" else u, spec)
            for L in lev_set(u):
                for off in (("cash",) if L == 1 else ("cash", "1x")):
                    reg.add("5 volatility regime", f"{u} {L}x when {spec_name(spec)} (off={off})",
                            dict(u=u, L=L, sig=spec_name(spec), off=off), z.run(on_off(z, u, L, sig, off)), u)
    # volatility targeting
    for u in ("SPX", "NDX", "BTC"):
        targets = (0.4, 0.6, 0.8, 1.0) if u == "BTC" else (0.10, 0.15, 0.20, 0.30, 0.40, 0.60)
        for n in (21, 63):
            vol = z.at_dec(realized_vol(z.level(u), n))
            for tgt in targets:
                for Lmax in lev_set(u):
                    for trend in (False, True):
                        e = np.minimum(tgt / vol, Lmax)
                        if trend:
                            e = e * S.get(u, ("sma", 200, 0.0))
                        w = e / Lmax
                        # 5-point no-trade band to avoid churning
                        out = np.full(z.K, np.nan)
                        cur = None
                        for k in range(z.K):
                            if np.isnan(w[k]):
                                continue
                            if cur is None or abs(w[k] - cur) > 0.05 or (w[k] == 0) != (cur == 0):
                                cur = w[k]
                            out[k] = cur
                        reg.add("5 volatility regime", f"{u} vol target {int(tgt * 100)}% ({n}d), max {Lmax}x"
                                f"{' + SMA200' if trend else ''}", dict(u=u, tgt=tgt, n=n, Lmax=Lmax, trend=trend),
                                z.run({(u, Lmax): out}), u)


# ---------------------------------------------------------------- F6 seasonality (curiosities)
def fam_season(z: Zoo, S: Signals, reg: Registry):
    start, end = z.start, z.end
    # month-end falls inside the period (turn of the month)
    tom = (start.month.values != end.month.values).astype(float)
    # period contains a weekday market holiday (pre-holiday effect)
    bdays = np.array([np.busday_count(a.date(), b.date()) for a, b in zip(start, end)])
    tdays = np.diff(z.epos)
    hol = (bdays > tdays).astype(float)
    winter = np.isin(start.month.values, [11, 12, 1, 2, 3, 4]).astype(float)
    santa = (((start.month.values == 12) & (start.day.values >= 15)) | ((start.month.values == 1) & (start.day.values <= 7))).astype(float)
    pres = np.isin(start.year.values % 4, [3, 0]).astype(float)     # pre-election and election years
    q4 = np.isin(start.month.values, [10, 11, 12]).astype(float)
    rules = {"turn-of-month weeks": tom, "holiday weeks": hol, "Nov-Apr only (sell in May)": winter,
             "Santa (15 Dec-7 Jan)": santa, "presidential years 3-4": pres, "Q4 only": q4}
    for u in ("SPX", "NDX", "BTC"):
        sig200 = S.get(u, ("sma", 200, 0.0))
        rr = dict(rules)
        rr["Nov-Apr + SMA200"] = np.where(np.isnan(sig200), np.nan, winter * np.nan_to_num(sig200))
        if u == "BTC":
            halv = pd.to_datetime(["2016-07-09", "2020-05-11", "2024-04-19", "2028-04-15"])
            h = np.zeros(z.K)
            for d in halv:
                h[(z.dec >= d - pd.Timedelta(days=365)) & (z.dec <= d + pd.Timedelta(days=545))] = 1
            rr["halving cycle (-12m/+18m)"] = h
        for rname, sig in rr.items():
            for L in lev_set(u):
                sg = np.where(np.isnan(z.R(u, L)), np.nan, sig)
                reg.add("6 seasonality", f"{u} {L}x {rname}", dict(u=u, L=L, rule=rname), z.run({(u, L): sg}), u)


# ---------------------------------------------------------------- F8 options overlay
def _ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def bs_call(S, K, T, r, q, v):
    if T <= 1e-6:
        return max(S - K, 0.0)
    sd = v * math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + 0.5 * v * v) * T) / sd
    return S * math.exp(-q * T) * _ncdf(d1) - K * math.exp(-r * T) * _ncdf(d1 - sd)


def iv_model(idx, mny, T, lr):
    """ATM IV = 0.88 x a mean-reverting term structure of VIX (SPX) or VXN (NDX), as in track 04's base
    case (ATM30d/VIX = 0.88); an SPX-like smile in standardised moneyness z = ln(K/S)/(atm*sqrt(T)):
    iv/atm = 1 - 0.10 z + 0.02 z^2, z clipped to [-4, 4] (calls 2 sd out-of-the-money at ~0.88 x ATM)."""
    kap = 3.0
    T = max(T, 1 / 365)
    term = lr + (idx - lr) * (1 - math.exp(-kap * T)) / (kap * T)
    atm = 0.88 * term / 100.0
    zz = min(max(math.log(mny) / (atm * math.sqrt(T)), -4.0), 4.0)
    return atm * (1 - 0.10 * zz + 0.02 * zz * zz)


def option_overlay(z: Zoo, u: str, sig: np.ndarray, frac: float, mny: float, tenor_d: int, hold_w: int,
                   h: float = 0.03):
    """Each week: if no position and signal on, spend `frac` of equity on calls (strike = mny x spot,
    `tenor_d` calendar days); sell after `hold_w` weeks, when the signal turns off, or at expiry.
    Premium paid at model + half-spread, sold at model - half-spread, half-spread = max(h x model,
    0.3 bp of spot); cash-settled at expiry; cash earns T-bills."""
    K = z.K
    px = z.p["price"][u].values
    ivx = (z.p["vix"] if u == "SPX" else z.p["vxn"]).values
    lr = 19.5 if u == "SPX" else 24.0
    q = 0.018 if u == "SPX" else 0.008
    S_e = px[z.epos]
    iv_e = ivx[z.epos]
    tb_e = z.tb[z.epos]
    t_e = z.exe_all.values.astype("datetime64[D]").astype(np.int64)
    ret = np.full(K, np.nan)
    cash, n, strike, expiry, held = 1.0, 0.0, 0.0, 0, 0
    started = False

    def mark(S, v, r, t):
        T = (expiry - t) / 365.0
        if T <= 0:
            return max(S - strike, 0.0)
        return bs_call(S, strike, T, r, q, iv_model(v, strike / S, T, lr))

    for k in range(K):
        S0, v0, r0 = S_e[k], iv_e[k], tb_e[k]
        if not started:
            if np.isnan(sig[k]) or np.isnan(v0) or np.isnan(S0):
                continue
            started = True
        if np.isnan(v0):
            v0 = iv_e[k - 1]
        # equity at the start of period k at model mid (= end value of period k-1)
        m0 = mark(S0, v0, r0, t_e[k]) if n > 0 else 0.0
        eq_start = cash + n * m0
        # exits: after `hold_w` weeks, signal off, or within a week of expiry
        if n > 0:
            T = (expiry - t_e[k]) / 365.0
            if T <= 7 / 365 or held >= hold_w or sig[k] == 0:
                cash += n * (max(m0 - max(h * m0, MIN_HS * S0), 0.0) if T > 0 else m0)
                n, held = 0.0, 0
        if n == 0 and sig[k] == 1 and eq_start > 0:
            T = tenor_d / 365.0
            strike = mny * S0
            expiry = t_e[k] + tenor_d
            mid = bs_call(S0, strike, T, r0, q, iv_model(v0, mny, T, lr))
            prem = mid + max(h * mid, MIN_HS * S0)
            spend = frac * (cash + 0.0)
            n, held = spend / prem, 0
            cash -= spend
        # end of period k
        S1, v1, r1 = S_e[k + 1], iv_e[k + 1], tb_e[k + 1]
        if np.isnan(v1):
            v1 = v0
        cash *= 1 + r0 * (t_e[k + 1] - t_e[k]) / 365.0
        val = mark(S1, v1, r1, t_e[k + 1]) if n > 0 else 0.0
        if n > 0:
            held += 1
        eq1 = cash + n * val
        ret[k] = eq1 / eq_start - 1 if eq_start > 0 else 0.0
        if eq1 <= 1e-9:
            ret[k + 1:] = 0.0
            break
    return ret


def fam_options(z: Zoo, S: Signals, reg: Registry, h: float = 0.03):
    for u in ("SPX", "NDX"):
        sigs = {"always": np.where(np.isnan(S.get(u, ("sma", 200, 0.0))), np.nan, 1.0),
                "SMA200 uptrend": S.get(u, ("sma", 200, 0.0)), "SMA100 uptrend": S.get(u, ("sma", 100, 0.0))}
        for sname, sig in sigs.items():
            for mny in (0.9, 1.0, 1.05, 1.10):
                for tenor, hold in ((30, 4), (91, 6), (182, 13)):
                    for frac in (0.1, 0.25, 0.5, 1.0):
                        ret = option_overlay(z, u, sig, frac, mny, tenor, hold, h)
                        reg.add("8 option overlay", f"{u} calls K={mny:.2f}S {tenor}d, {int(frac * 100)}% of equity, "
                                f"{sname}, roll {hold}w", dict(u=u, sig=sname, mny=mny, tenor=tenor, frac=frac, hold=hold),
                                ret, u)


# ---------------------------------------------------------------- F7 combinations (sleeve level)
def combine(sleeves: list[np.ndarray], weights, reb: int, cost=None) -> np.ndarray:
    """Sleeve-level portfolio: weights drift between rebalances every `reb` weeks; `cost` is the
    one-side cost per unit traded for each sleeve (default 0.05%)."""
    M = np.vstack(sleeves)                               # (m, K)
    K = M.shape[1]
    live = ~np.isnan(M).any(axis=0)
    out = np.full(K, np.nan)
    if not live.any():
        return out
    first = int(np.argmax(live))
    w = np.asarray(weights, float)
    cst = np.full(len(w), 0.0005) if cost is None else np.asarray(cost, float)
    vals = w.copy()
    for i, k in enumerate(range(first, K)):
        if not live[k]:
            break
        tot0 = vals.sum()
        vals = vals * (1 + M[:, k])
        tot1 = vals.sum()
        r = tot1 / tot0 - 1
        if (i + 1) % reb == 0 and tot1 > 0:
            tgt = w * tot1
            c = (np.abs(tgt - vals) * cst).sum()
            vals = tgt * (1 - c / tot1)
            r = vals.sum() / tot0 - 1
        out[k] = r
    return out


def _sc(name):
    return 0.005 if any(c in name for c in ("BTC", "ETH", "crypto")) else 0.0005


def fam_combos(z: Zoo, S: Signals, reg: Registry, sleeves: dict):
    names = list(sleeves)
    for a, b in itertools.combinations(names, 2):
        for wa in (0.25, 0.5, 0.75):
            for reb in (4, 13):
                ret = combine([sleeves[a], sleeves[b]], [wa, 1 - wa], reb, [_sc(a), _sc(b)])
                reg.add("7 combination", f"{int(wa * 100)}% {a} + {int((1 - wa) * 100)}% {b}, rebalance {reb}w",
                        dict(a=a, b=b, wa=wa, reb=reb), ret, f"{a}|{b}")
    core = ["NDX 3x SMA200", "SPX 3x SMA200", "SMH 3x SMA200", "BTC 1x SMA200", "BTC 2x SMA200", "ETH 1x SMA200",
            "TLT 3x hold", "GLD 1x hold"]
    for trio in itertools.combinations(core, 3):
        for reb in (4, 13):
            ret = combine([sleeves[t] for t in trio], [1 / 3] * 3, reb, [_sc(t) for t in trio])
            reg.add("7 combination", f"1/3 each {' + '.join(trio)}, rebalance {reb}w", dict(trio="|".join(trio), reb=reb),
                    ret, "|".join(trio))


def canonical_sleeves(z: Zoo, S: Signals) -> dict:
    def trend(u, L):
        return z.run(on_off(z, u, L, S.get(u, ("sma", 200, 0.0))))

    def hold(u, L):
        return z.run({(u, L): np.where(np.isnan(z.R(u, L)), np.nan, 1.0)})
    return {"NDX 3x SMA200": trend("NDX", 3), "SPX 3x SMA200": trend("SPX", 3), "SMH 3x SMA200": trend("SMH", 3),
            "NDX 3x hold": hold("NDX", 3), "SPX 3x hold": hold("SPX", 3), "BTC 1x hold": hold("BTC", 1),
            "BTC 1x SMA200": trend("BTC", 1), "BTC 2x SMA200": trend("BTC", 2), "ETH 1x SMA200": trend("ETH", 1),
            "TLT 3x hold": hold("TLT", 3), "GLD 1x hold": hold("GLD", 1),
            "crypto top1 1m": z.run(rotation_weights(z, CRYPTO, "1m", 1, 1, True, 1)),
            "sectors top1 3m 3x": z.run(rotation_weights(z, SECTORS, "3m", 1, 1, False, 3))}


def build_all(z: Zoo, with_options=True, log=print) -> Registry:
    S = Signals(z)
    reg = Registry(z)
    steps = [("buy-and-hold", lambda: fam_buyhold(z, reg)), ("trend", lambda: fam_trend(z, S, reg)),
             ("rotation", lambda: fam_rotation(z, reg)), ("dip", lambda: fam_dip(z, reg)),
             ("vol", lambda: fam_vol(z, S, reg)), ("season", lambda: fam_season(z, S, reg)),
             ("combos", lambda: fam_combos(z, S, reg, canonical_sleeves(z, S)))]
    if with_options:
        steps.append(("options", lambda: fam_options(z, S, reg)))
    for name, fn in steps:
        n0 = len(reg.rows)
        fn()
        log(f"  family {name}: {len(reg.rows) - n0} variants")
    return reg
