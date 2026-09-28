"""Shared helpers for track 13: short-horizon (1-60 trading day) rules on US index,
sector and country ETFs.

Everything downloaded is cached in the scratchpad (CACHE); only small result tables are
written to ./results.  Re-running any script re-uses the cache; delete the cache folder
(or pass refresh=True) to re-download.

Conventions (used by every script):
  * A signal is evaluated on the CLOSE of day t (all inputs known at that close).
  * Execution modes:
      'open'  : enter at the OPEN of t+1; rule exits signalled at close s execute at the
                OPEN of s+1; time exits execute at the CLOSE of the H-th session
                (sessions t+1..t+H).
      'close' : enter at the CLOSE of t+1; rule exits execute at the CLOSE of s+1; time
                exits at the CLOSE of t+1+H.
      'ideal' : enter at the CLOSE of t (the signal close itself: needs a market-on-close
                order placed with a near-close estimate; reported as an upper bound only).
    In all three modes the time exit gives exactly H sessions of exposure.
  * Prices are dividend-adjusted (Yahoo 'Adj Close'/'Close' factor applied to the open
    too), so returns are total returns.  ^GSPC (a price index) gets a daily dividend
    accrual from Shiller's D/P before 1988 and ^SP500TR returns after 1988.
  * Costs are per side, in basis points of price (half-spread + slippage + commission).
  * 'excess' = net trade return minus the T-bill return over the same sessions (the
    trading capital would otherwise sit in T-bills).
"""
from __future__ import annotations

import io
import json
import math
import os
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from scipy import stats

warnings.filterwarnings("ignore")

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
RESULTS.mkdir(exist_ok=True)
SCRATCH = Path(os.environ.get(
    "TRACK13_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/13-short-index"))
CACHE = SCRATCH / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

TODAY = pd.Timestamp("2026-09-28")
SPLIT = pd.Timestamp("2008-01-01")      # design (in-sample) < SPLIT <= test (out-of-sample)

# Tax assumptions (federal; state ignored).  Short-term gains and T-bill interest are both
# ordinary income, so the drag on EXCESS return is (1 - t_ord).
TAX_ST_TOP = 0.408      # 37% + 3.8% NIIT (track 03)
TAX_ST_MID = 0.24       # a 24% bracket, no NIIT
TAX_1256_TOP = 0.6 * 0.238 + 0.4 * 0.408   # Section 1256 futures/index options 60/40 = 30.6%

# Base-case per-side costs (bp): quoted half-spread + slippage for a retail marketable
# order in a normal market; doubled when VIX > 30 (see cost_bps()).
BASE_COST_BPS = {
    "SPY": 1.0, "QQQ": 1.0, "IWM": 1.5, "DIA": 1.5, "EFA": 2.5, "EEM": 2.5, "MDY": 3.0,
    "^GSPC": 1.0, "^NDX": 1.0, "^RUT": 1.5,
    # Select Sector SPDRs
    "XLB": 3.0, "XLE": 2.0, "XLF": 2.0, "XLI": 2.5, "XLK": 2.0, "XLP": 2.5, "XLU": 2.5,
    "XLV": 2.5, "XLY": 2.5, "XLRE": 4.0, "XLC": 4.0,
}
DEFAULT_COUNTRY_COST = 6.0   # iShares single-country ETFs (wider; EWJ/EWZ ~2-4, small ones 10+)
DEFAULT_INDEX_COST = 5.0     # foreign cash indices (not directly tradable; proxy)


def base_cost(ticker: str) -> float:
    if ticker in BASE_COST_BPS:
        return BASE_COST_BPS[ticker]
    if ticker.startswith("^"):
        return DEFAULT_INDEX_COST
    return DEFAULT_COUNTRY_COST


# ============================================================================ downloads
def _get(url: str, timeout: int = 90, retries: int = 3, headers=None) -> bytes:
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, timeout=timeout,
                             headers=headers or {"User-Agent": "Mozilla/5.0 research-bot"})
            r.raise_for_status()
            return r.content
        except Exception as e:  # pragma: no cover
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"download failed {url}: {last}")


def _safe(t: str) -> str:
    return t.replace("^", "IDX_").replace("=", "_").replace("/", "_")


def yf_raw(ticker: str, refresh: bool = False) -> pd.DataFrame:
    """Unadjusted daily OHLC + Adj Close + Volume, cached."""
    fn = CACHE / f"yf_{_safe(ticker)}.csv"
    if fn.exists() and not refresh:
        return pd.read_csv(fn, index_col=0, parse_dates=True)
    import yfinance as yf
    df = None
    for attempt in range(3):
        try:
            df = yf.download(ticker, start="1900-01-01", progress=False, auto_adjust=False,
                             threads=False, actions=False)
            if df is not None and len(df):
                break
        except Exception:
            time.sleep(3)
    if df is None or len(df) == 0:
        raise RuntimeError(f"no data for {ticker}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df[df.index <= TODAY]
    df.to_csv(fn)
    return df


def fred(series_id: str, refresh: bool = False) -> pd.Series:
    fn = CACHE / f"fred_{series_id}.csv"
    if not fn.exists() or refresh:
        fn.write_bytes(_get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"))
    df = pd.read_csv(fn)
    df.columns = ["date", series_id]
    s = pd.to_numeric(df[series_id], errors="coerce")
    s.index = pd.to_datetime(df["date"])
    return s.dropna()


def shiller_dy() -> pd.Series:
    """Monthly S&P dividend yield D/P from Shiller's ie_data.xls (month-start stamps)."""
    fn = CACHE / "shiller_ie_data.xls"
    if not fn.exists():
        # re-use track 06's copy if present, else download
        alt = Path(str(SCRATCH).replace("13-short-index", "06-backtests")) / "cache" / "shiller_ie_data.xls"
        if alt.exists():
            fn.write_bytes(alt.read_bytes())
        else:
            fn.write_bytes(_get("http://www.econ.yale.edu/~shiller/data/ie_data.xls"))
    x = pd.read_excel(fn, sheet_name="Data", header=None, engine="xlrd")
    hdr = None
    for i in range(20):
        row = [str(v).strip() for v in x.iloc[i].tolist()]
        if "Date" in row and "P" in row:
            hdr = i
            break
    cols = [str(v).strip() for v in x.iloc[hdr].tolist()]
    body = x.iloc[hdr + 1:].copy()
    body.columns = cols
    body = body[pd.to_numeric(body["Date"], errors="coerce").notna()]
    d = pd.to_numeric(body["Date"]).astype(float)
    yr = np.floor(d).astype(int)
    mo = np.round((d - yr) * 100).astype(int).clip(lower=1)
    idx = pd.to_datetime(dict(year=yr, month=mo, day=1))
    dy = pd.to_numeric(body["D"], errors="coerce").values / pd.to_numeric(body["P"], errors="coerce").values
    s = pd.Series(dy, index=idx).dropna()
    return s[~s.index.duplicated()]


def ken_french_daily_rf() -> pd.Series:
    """Daily risk-free return (decimal) from the Ken French daily 3-factor file."""
    fn = CACHE / "F-F_Research_Data_Factors_daily_CSV.zip"
    if not fn.exists():
        alt = Path("/home/user/testProject/research/code/02-academic/data/F-F_Research_Data_Factors_daily.csv")
        if alt.exists():
            txt = alt.read_text(encoding="latin-1")
        else:
            fn.write_bytes(_get("https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
                                "F-F_Research_Data_Factors_daily_CSV.zip"))
            txt = None
    else:
        txt = None
    if txt is None:
        import zipfile
        z = zipfile.ZipFile(fn)
        txt = z.read(z.namelist()[0]).decode("latin-1")
    rows = []
    for ln in txt.splitlines():
        p = [q.strip() for q in ln.split(",")]
        if len(p) >= 5 and p[0].isdigit() and len(p[0]) == 8:
            rows.append((p[0], p[4]))
    df = pd.DataFrame(rows, columns=["d", "rf"])
    s = pd.Series(df["rf"].astype(float).values / 100.0, index=pd.to_datetime(df["d"], format="%Y%m%d"))
    return s


_RF_CACHE = {}


def ken_french_monthly_rf() -> pd.Series:
    """Monthly 1-month T-bill return (decimal) from the Ken French monthly factor file."""
    alt = Path("/home/user/testProject/research/code/02-academic/data/F-F_Research_Data_Factors.csv")
    fn = CACHE / "F-F_Research_Data_Factors.csv"
    if not fn.exists():
        if alt.exists():
            fn.write_bytes(alt.read_bytes())
        else:
            import zipfile
            z = zipfile.ZipFile(io.BytesIO(_get("https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
                                                "F-F_Research_Data_Factors_CSV.zip")))
            fn.write_bytes(z.read(z.namelist()[0]))
    rows = []
    for ln in fn.read_text(encoding="latin-1").splitlines():
        p = [q.strip() for q in ln.split(",")]
        if len(p) >= 5 and p[0].isdigit() and len(p[0]) == 6:
            rows.append((p[0], p[4]))
        elif rows and not (p and p[0].isdigit()):
            break
    s = pd.Series([float(r[1]) / 100 for r in rows],
                  index=pd.to_datetime([r[0] for r in rows], format="%Y%m"))
    return s


def daily_rf(index: pd.DatetimeIndex) -> pd.Series:
    """Per-session T-bill return aligned to a trading-day index: before 1954 the monthly
    Ken French 1-month bill return spread evenly over the month's sessions; from 1954 the
    FRED 3-month bill rate (DTB3) / 252.  (The French daily file rounds to 0.01%/day.)"""
    key = (index[0], index[-1], len(index))
    if key in _RF_CACHE:
        return _RF_CACHE[key]
    out = pd.Series(np.nan, index=index)
    m = ken_french_monthly_rf()
    early = index[index < pd.Timestamp("1954-01-04")]
    if len(early):
        per = pd.Series(early.to_period("M"), index=early)
        cnt = per.map(per.value_counts())
        mv = per.map(pd.Series(m.values, index=m.index.to_period("M")))
        out.loc[early] = (mv / cnt).values
    dtb3 = fred("DTB3") / 100.0 / 252.0
    late = index[index >= pd.Timestamp("1954-01-04")]
    if len(late):
        out.loc[late] = dtb3.reindex(dtb3.index.union(late)).ffill().reindex(late).values
    out = out.ffill().fillna(0.0)
    _RF_CACHE[key] = out
    return out


# ============================================================================ price panels
def load(ticker: str, refresh: bool = False) -> pd.DataFrame:
    """Daily frame with columns O,H,L,C (unadjusted), aO,aH,aL,aC (total-return adjusted),
    V, rf (T-bill per session).  ^GSPC gets a total-return series (see module doc)."""
    raw = yf_raw(ticker, refresh=refresh)
    df = pd.DataFrame(index=raw.index)
    df["O"], df["H"], df["L"], df["C"] = raw["Open"], raw["High"], raw["Low"], raw["Close"]
    df["V"] = raw.get("Volume", np.nan)
    df = df[df["C"] > 0].dropna(subset=["C"])
    # repair missing/zero opens, highs, lows
    for c in ["O", "H", "L"]:
        bad = (df[c] <= 0) | df[c].isna()
        df.loc[bad, c] = df.loc[bad, "C"]
    if ticker == "^GSPC":
        f = _gspc_tr_factor(df["C"])
    elif "Adj Close" in raw.columns and raw["Adj Close"].notna().sum() > 0.9 * len(raw):
        f = (raw["Adj Close"] / raw["Close"]).reindex(df.index).ffill().bfill()
    else:
        f = pd.Series(1.0, index=df.index)
    for c in ["O", "H", "L", "C"]:
        df["a" + c] = df[c] * f
    df["rf"] = daily_rf(df.index).values
    df.attrs["ticker"] = ticker
    return df


def _gspc_tr_factor(px: pd.Series) -> pd.Series:
    """Multiplicative factor turning the S&P price index into a total-return index."""
    dy = shiller_dy()
    dy_d = dy.reindex(dy.index.union(px.index)).ffill().reindex(px.index).ffill().bfill()
    r_px = px.pct_change().fillna(0.0)
    r_tr = r_px + dy_d / 252.0
    try:
        off = yf_raw("^SP500TR")["Close"]
        off = off[off.index >= "1988-01-04"].reindex(px.index).dropna()
        r_off = off.pct_change().dropna()
        r_tr.loc[r_off.index] = r_off.values
    except Exception:
        pass
    tr = (1 + r_tr).cumprod()
    return (tr / (px / px.iloc[0])).astype(float)


def real_open_start(df: pd.DataFrame, min_frac: float = 0.8) -> pd.Timestamp:
    """First year from which the open differs from both the prior close and the same-day
    close on most days (i.e. the open is a real print, not a filler)."""
    o, c = df["O"], df["C"]
    same = (o.round(4) == c.round(4)) | (o.round(4) == c.shift(1).round(4))
    frac_real = (~same).groupby(df.index.year).mean()
    good = frac_real[frac_real >= min_frac]
    # need all subsequent years good too
    yrs = list(frac_real.index)
    for y in yrs:
        if all(frac_real.loc[y2] >= min_frac for y2 in yrs if y2 >= y):
            return pd.Timestamp(f"{y}-01-01")
    return df.index[-1]


# ============================================================================ indicators
def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def rsi_wilder(close: pd.Series, n: int = 2) -> pd.Series:
    d = close.diff()
    up = d.clip(lower=0.0)
    dn = (-d).clip(lower=0.0)
    au = up.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()
    ad = dn.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()
    rs = au / ad.replace(0, np.nan)
    r = 100 - 100 / (1 + rs)
    r = r.where(ad > 0, 100.0)
    r = r.where(au > 0, r.where(ad == 0, 0.0))
    return r


def down_streak(close: pd.Series) -> pd.Series:
    """Number of consecutive lower closes ending today."""
    dn = (close.diff() < 0).astype(int).values
    out = np.zeros(len(dn), dtype=int)
    for i in range(1, len(dn)):
        out[i] = out[i - 1] + 1 if dn[i] else 0
    return pd.Series(out, index=close.index)


def drawdown(close: pd.Series) -> pd.Series:
    return close / close.cummax() - 1.0


# ============================================================================ trade engine
def run_rule(df: pd.DataFrame, entry: pd.Series, mode: str = "open", hold: int = 5,
             exit_sig: pd.Series | None = None, cost_bps: float | None = None,
             stop: float | None = None, start=None, end=None, high_vol_mult: float = 2.0,
             vix: pd.Series | None = None, scheduled_exit: bool = False) -> pd.DataFrame:
    """Non-overlapping long trades.

    entry    : bool Series (signal at close t).
    hold     : max sessions of exposure (time exit); if exit_sig given it's the cap.
    exit_sig : bool Series (exit condition at close s), executed per `mode`.
    stop     : optional stop-loss fraction on closes (e.g. 0.08) executed like a rule exit.
    cost_bps : per side; default base_cost(ticker); multiplied by high_vol_mult when the
               VIX close on the signal day is > 30 (if vix supplied).
    scheduled_exit : exit_sig marks a day known in advance (calendar rules): exit at that
               day's CLOSE (market-on-close) in every mode.
    Returns one row per trade.
    """
    tk = df.attrs.get("ticker", "?")
    if cost_bps is None:
        cost_bps = base_cost(tk)
    idx = df.index
    n = len(idx)
    ent = entry.reindex(idx).fillna(False).values.astype(bool)
    ex = exit_sig.reindex(idx).fillna(False).values.astype(bool) if exit_sig is not None else None
    aO, aC = df["aO"].values, df["aC"].values
    rfc = np.concatenate([[0.0], np.cumsum(df["rf"].values)])  # rfc[k] = sum rf[0..k-1]
    vx = vix.reindex(idx).ffill().values if vix is not None else None
    lo = 0 if start is None else idx.searchsorted(pd.Timestamp(start))
    hi = n if end is None else idx.searchsorted(pd.Timestamp(end))
    rows = []
    t = lo
    sig_idx = np.flatnonzero(ent)
    while True:
        k = sig_idx.searchsorted(t)
        if k >= len(sig_idx):
            break
        t = sig_idx[k]
        if t >= hi:
            break
        if mode == "ideal":
            e_i, e_px, first_exp = t, aC[t], t + 1          # exposure sessions t+1..
            t_exit_i = t + hold
        elif mode == "open":
            e_i = t + 1
            if e_i >= n:
                break
            e_px, first_exp = aO[e_i], t + 1
            t_exit_i = t + hold
        elif mode == "close":
            e_i = t + 1
            if e_i >= n:
                break
            e_px, first_exp = aC[e_i], t + 2
            t_exit_i = t + 1 + hold
        else:
            raise ValueError(mode)
        # rule / stop exit search: condition at close s, s from entry day onward
        x_i, x_px, how = None, None, "time"
        s_from = e_i if mode != "ideal" else t + 1
        s_to = min(t_exit_i, n - 1)
        cand = []
        if ex is not None and s_from <= s_to:
            seg = ex[s_from:s_to + 1]
            if seg.any():
                cand.append((s_from + int(np.argmax(seg)), "rule"))
        if stop is not None and s_from <= s_to:
            seg = aC[s_from:s_to + 1] / e_px - 1.0 <= -stop
            if seg.any():
                cand.append((s_from + int(np.argmax(seg)), "stop"))
        if cand:
            s, how = min(cand)
            if scheduled_exit and how == "rule":
                x_i, x_px, how = s, aC[s], "scheduled"
            elif s < s_to or (s == s_to and mode == "ideal"):
                if mode == "ideal":
                    x_i, x_px = s, aC[s]
                elif mode == "open":
                    if s + 1 < n:
                        x_i, x_px = s + 1, aO[s + 1]
                else:
                    if s + 1 < n:
                        x_i, x_px = s + 1, aC[s + 1]
            else:
                how = "time"
        if x_i is None:
            how = "time" if how != "open" else how
            if t_exit_i >= n:
                # trade still open at the end of data: mark to last close, flag it
                x_i, x_px, how = n - 1, aC[n - 1], "open_at_end"
            else:
                x_i, x_px = t_exit_i, aC[t_exit_i]
        c = cost_bps
        if vx is not None and not np.isnan(vx[t]) and vx[t] > 30:
            c = cost_bps * high_vol_mult
        gross = x_px / e_px - 1.0
        net = x_px * (1 - c / 1e4) / (e_px * (1 + c / 1e4)) - 1.0
        # T-bill over the exposure sessions first_exp..last_exp
        last_exp = x_i - 1 if (mode == "open" and how in ("rule", "stop")) else x_i
        rf_h = rfc[last_exp + 1] - rfc[first_exp] if last_exp >= first_exp else 0.0
        mae = float(np.min(aC[e_i:x_i + 1] / e_px - 1.0)) if x_i >= e_i else 0.0
        rows.append(dict(signal=idx[t], entry=idx[e_i], exit=idx[x_i],
                         sessions=int(max(last_exp - first_exp + 1, 1)),
                         entry_px=e_px, exit_px=x_px, gross=gross, net=net, rf=rf_h,
                         excess=net - rf_h, how=how, mae=min(mae, gross), cost_bps=c))
        # next admissible signal: the close of the exit day (entry the session after)
        t = max(x_i, t + 1)
    return pd.DataFrame(rows)


def strategy_daily(df: pd.DataFrame, trades: pd.DataFrame, start=None, end=None) -> pd.Series:
    """Daily return stream: in the ETF when a trade is on (close-to-close marks, entry at the
    trade's entry price, exit at its exit price, costs at entry/exit), else T-bills."""
    idx = df.index
    lo = idx[0] if start is None else pd.Timestamp(start)
    hi = idx[-1] if end is None else pd.Timestamp(end)
    rf = df["rf"].values
    aC = df["aC"].values
    g = np.ones(len(idx))
    touched = np.zeros(len(idx), dtype=bool)
    if len(trades):
        for tr in trades.itertuples(index=False):
            ei, xi = idx.get_loc(tr.entry), idx.get_loc(tr.exit)
            c = tr.cost_bps / 1e4
            ep, xp = tr.entry_px, tr.exit_px
            if xi == ei:                                   # in and out the same session
                g[ei] *= (1 + tr.net)
                touched[ei] = True
                continue
            bought_at_close = abs(aC[ei] - ep) <= 1e-9 * max(ep, 1)
            if bought_at_close:
                g[ei] *= (1.0 if touched[ei] else (1 + rf[ei])) / (1 + c)
            else:
                g[ei] *= aC[ei] / (ep * (1 + c))
            touched[ei] = True
            path = aC[ei:xi + 1]
            dr = path[1:] / path[:-1]
            dr[-1] = xp * (1 - c) / path[-2]               # last session ends at the exit price
            g[ei + 1:xi + 1] *= dr
            touched[ei + 1:xi + 1] = True
    g = np.where(touched, g, 1 + rf)
    r = pd.Series(g - 1.0, index=idx)
    return r[(r.index >= lo) & (r.index <= hi)]


# ============================================================================ statistics
def _years(start, end) -> float:
    return max((pd.Timestamp(end) - pd.Timestamp(start)).days / 365.25, 1e-9)


def kelly_empirical(r: np.ndarray, fmax: float = 20.0) -> float:
    """argmax_f mean(log(1+f r)) on an empirical sample (f>=0)."""
    from scipy.optimize import minimize_scalar
    r = np.asarray(r, float)
    r = r[~np.isnan(r)]
    if len(r) < 3 or r.mean() <= 0:
        return 0.0
    ub = fmax
    if r.min() < 0:
        ub = min(fmax, 0.999 / (-r.min()))
    res = minimize_scalar(lambda f: -np.mean(np.log1p(f * r)), bounds=(0.0, ub), method="bounded",
                          options={"xatol": 1e-4})
    return float(res.x)


def trade_stats(tr: pd.DataFrame, start, end, kappa: float = 0.5, k: float = 0.25,
                fcap: float = 1.0, col: str = "excess") -> dict:
    """Per-trade statistics + quarter-Kelly (on returns shrunk toward zero edge) and its
    expected log-growth contribution per year (vs T-bills)."""
    yrs = _years(start, end)
    if tr is None or len(tr) == 0:
        return dict(n=0, per_yr=0.0)
    x = tr[col].values
    net = tr["net"].values
    n = len(x)
    wins = net[net > 0]
    losses = net[net <= 0]
    mu, sd = float(np.mean(x)), float(np.std(x, ddof=1)) if n > 1 else float("nan")
    sr = mu / sd if sd and sd > 0 else float("nan")
    t = sr * math.sqrt(n) if n > 1 else float("nan")
    sk = float(stats.skew(x)) if n > 2 else float("nan")
    ku = float(stats.kurtosis(x, fisher=False)) if n > 3 else float("nan")
    # shrink the mean excess toward zero by (1-kappa), keep dispersion
    xs = x - (1 - kappa) * mu if mu > 0 else x - mu
    fK = kelly_empirical(xs)
    fq = k * fK
    fu = min(fq, fcap)
    dg_trade = float(np.mean(np.log1p(fu * xs))) if fu > 0 else 0.0
    return dict(
        n=n, per_yr=n / yrs, win=float(np.mean(net > 0)),
        avg_win=float(wins.mean()) if len(wins) else float("nan"),
        avg_loss=float(losses.mean()) if len(losses) else float("nan"),
        mean_net=float(np.mean(net)), median_net=float(np.median(net)),
        mean_ex=mu, sd_ex=sd, sr_trade=sr, t=t, skew=sk, kurt=ku,
        worst=float(np.min(net)), best=float(np.max(net)),
        sessions=float(tr["sessions"].mean()), kelly_full=fK, f_qk=fq, f_used=fu,
        dg_yr=dg_trade * n / yrs,
    )


def stream_stats(r: pd.Series, rf: pd.Series) -> dict:
    """Annualised stats of a daily strategy return stream."""
    r = r.dropna()
    if len(r) < 20:
        return {}
    ex = r - rf.reindex(r.index).fillna(0.0)
    eq = (1 + r).cumprod()
    yrs = len(r) / 252.0
    cagr = eq.iloc[-1] ** (1 / yrs) - 1
    vol = r.std() * math.sqrt(252)
    shp = ex.mean() / ex.std() * math.sqrt(252) if ex.std() > 0 else float("nan")
    mdd = float((eq / eq.cummax() - 1).min())
    return dict(cagr=cagr, vol=vol, sharpe=shp, mdd=mdd)


# ----------------------------------------------------------------------------- deflation
EULER_GAMMA = 0.5772156649


def expected_max_z(N: int) -> float:
    """E[max of N iid N(0,1)] (Bailey & Lopez de Prado 2014 approximation)."""
    if N <= 1:
        return 0.0
    from scipy.stats import norm
    return (1 - EULER_GAMMA) * norm.ppf(1 - 1.0 / N) + EULER_GAMMA * norm.ppf(1 - 1.0 / (N * math.e))


def deflated_sr(sr: float, n: int, skew: float, kurt: float, N_trials: int) -> float:
    """Deflated Sharpe ratio (probability the true per-trade SR > 0 after selecting the best
    of N_trials), using the null dispersion 1/sqrt(n-1) for the trial SRs."""
    from scipy.stats import norm
    if n < 3 or not np.isfinite(sr):
        return float("nan")
    sr0 = expected_max_z(N_trials) / math.sqrt(n - 1)
    sk = 0.0 if not np.isfinite(skew) else skew
    ku = 3.0 if not np.isfinite(kurt) else kurt
    den = 1 - sk * sr + (ku - 1) / 4.0 * sr * sr
    den = math.sqrt(max(den, 1e-6))
    return float(norm.cdf((sr - sr0) * math.sqrt(n - 1) / den))


def bonferroni_t(N: int, alpha: float = 0.05) -> float:
    from scipy.stats import norm
    return float(norm.ppf(1 - alpha / (2 * N)))


# ----------------------------------------------------------------------------- registry
REGISTRY_FILE = RESULTS / "variant_registry.csv"


class Registry:
    """Collects every variant tested so the deflation step knows N."""

    def __init__(self, script: str):
        self.script = script
        self.rows = []

    def add(self, family: str, variant: str, ticker: str, mode: str, period: str, st: dict, **extra):
        row = dict(script=self.script, family=family, variant=variant, ticker=ticker, mode=mode,
                   period=period)
        row.update({k: st.get(k) for k in ["n", "per_yr", "win", "mean_net", "median_net", "mean_ex",
                                           "sd_ex", "sr_trade", "t", "skew", "kurt", "worst",
                                           "sessions", "f_qk", "f_used", "dg_yr"]})
        row.update(extra)
        self.rows.append(row)

    def save(self):
        new = pd.DataFrame(self.rows)
        try:
            old = read_result(REGISTRY_FILE.name)
            old = old[old["script"] != self.script]
            new = pd.concat([old, new], ignore_index=True)
        except FileNotFoundError:
            pass
        save(new, REGISTRY_FILE.name)
        return new


def fmt_pct(x, d=2):
    return "" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{100 * x:.{d}f}%"


def save(df: pd.DataFrame, name: str, index=False):
    """Write a result table; tables over 400 kB are stored gzipped (name + '.gz')."""
    p = RESULTS / name
    pz = RESULTS / (name + ".gz")
    df.to_csv(p, index=index, float_format="%.6g")
    if p.stat().st_size > 400_000:
        df.to_csv(pz, index=index, float_format="%.6g", compression="gzip")
        p.unlink()
        return pz
    if pz.exists():
        pz.unlink()
    return p


def read_result(name: str) -> pd.DataFrame:
    p = RESULTS / name
    if p.exists():
        return pd.read_csv(p)
    return pd.read_csv(RESULTS / (name + ".gz"))
