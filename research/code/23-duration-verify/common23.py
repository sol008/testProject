"""Track 23: independent verification of tracks 21 and 22 (W10 under a 60 / 90 / 120-day holding cap).

This module is written from scratch.  It reads the raw price files cached by earlier tracks (Yahoo, FRED,
Ken French, Shiller, Coin Metrics) but imports NO code from tracks 13, 15, 21 or 22.

Conventions
  * A W10 signal is evaluated at the S&P 500 (^GSPC) close of day t.
  * SPY sample: buy at the OPEN of t+1 (dividend-adjusted: open x AdjClose/Close of the same day).
    Exits are market orders at an OPEN (Robinhood has no market-on-close order):
      F<H>   : fixed H sessions -> sell at the open of session H+1 (the entry day is session 1);
      CAL<N> : calendar-exact -> sell at the open of the last session dated <= entry date + N days;
      C<H>   : (reconciliation only) sell at the CLOSE of session H, the tracks 21/22 convention.
  * Index samples (no usable opens before ~1990): buy at the CLOSE of t+1 on the S&P 500 total-return
    index; F<H> exits at the close of session t+1+H, CAL<N> at the close of the last session dated
    <= entry date + N days.
  * Costs: 1 bp per side, doubled when the fear gauge (VIX; VXO 1986-89) closes above 30 on the signal day.
  * Excess = net return minus T-bills over the sessions held.
"""
from __future__ import annotations

import json
import math
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
RESULTS.mkdir(exist_ok=True)
SCR = Path("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad")
C13 = SCR / "13-short-index" / "cache"
C15 = SCR / "15-short-futures-crypto" / "cache"
C06 = SCR / "06-backtests" / "cache"
T21 = HERE.parent / "21-duration" / "results"          # track 21 OUTPUT files (read for reconciliation only)
T22 = HERE.parent / "22-duration-new" / "results"      # track 22 OUTPUT files (read for reconciliation only)

TODAY = pd.Timestamp("2026-09-28")
CAPS = (60, 90, 120)
FIXED = {60: 42, 90: 63, 120: 84}
WINDOW = 756            # +-3 years of sessions for the era-matched placebo
B = 20000               # placebo draws
SEED = 23
BILLS_FWD = 0.042
EQ_FWD = {"low": 0.03, "mid": 0.045, "high": 0.06}
COST_BP = 1.0

_cache: dict = {}


def save(df: pd.DataFrame, name: str, index: bool = False) -> Path:
    p = RESULTS / f"{name}.csv"
    df.to_csv(p, index=index, float_format="%.6g")
    return p


# ============================================================================ raw loaders
def _yf(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, index_col=0, parse_dates=True)
    df.index = pd.to_datetime(df.index).tz_localize(None) if getattr(df.index, "tz", None) else pd.to_datetime(df.index)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return df[df.index <= TODAY]


def gspc() -> pd.DataFrame:
    if "gspc" not in _cache:
        d = _yf(C13 / "yf_IDX_GSPC.csv")
        d = d[d["Close"] > 0]
        _cache["gspc"] = d
    return _cache["gspc"]


def shiller_dp() -> pd.Series:
    """Monthly S&P dividend yield D/P (Shiller ie_data.xls), month periods."""
    x = pd.read_excel(C13 / "shiller_ie_data.xls", sheet_name="Data", header=None, engine="xlrd")
    hdr = next(i for i in range(20) if "Date" in [str(v).strip() for v in x.iloc[i]])
    body = x.iloc[hdr + 1:, :3].copy()
    body.columns = ["Date", "P", "D"]
    body = body[pd.to_numeric(body["Date"], errors="coerce").notna()]
    d = pd.to_numeric(body["Date"]).astype(float).values
    yr = np.floor(d).astype(int)
    mo = np.clip(np.round((d - yr) * 100).astype(int), 1, 12)
    per = pd.PeriodIndex([pd.Period(f"{a}-{b:02d}", "M") for a, b in zip(yr, mo)])
    dp = pd.to_numeric(body["D"], errors="coerce").values / pd.to_numeric(body["P"], errors="coerce").values
    s = pd.Series(dp, index=per).dropna()
    return s[~s.index.duplicated()]


def spx_tr() -> pd.Series:
    """S&P 500 total-return index on the ^GSPC calendar: price + Shiller D/P accrued by calendar days
    before 1988-01-05, ^SP500TR daily returns from then on."""
    if "tr" in _cache:
        return _cache["tr"]
    c = gspc()["Close"]
    dp = shiller_dp()
    per = c.index.to_period("M")
    dy = pd.Series(dp.reindex(per).values, index=c.index).ffill().bfill()
    days = c.index.to_series().diff().dt.days.fillna(1.0)
    r = c.pct_change().fillna(0.0) + dy * days / 365.25
    off = _yf(C13 / "yf_IDX_SP500TR.csv")["Close"]
    ro = off.pct_change().dropna()
    ro = ro[ro.index >= "1988-01-05"]
    common = ro.index.intersection(r.index)
    r.loc[common] = ro.loc[common].values
    tr = (1 + r).cumprod()
    _cache["tr"] = tr
    return tr


def spy() -> pd.DataFrame:
    if "spy" not in _cache:
        d = _yf(C13 / "yf_SPY.csv")
        f = (d["Adj Close"] / d["Close"]).ffill()
        out = pd.DataFrame({"O": d["Open"], "C": d["Close"]})
        bad = (out["O"] <= 0) | out["O"].isna()
        out.loc[bad, "O"] = out.loc[bad, "C"]
        out["aO"] = out["O"] * f
        out["aC"] = d["Adj Close"]
        _cache["spy"] = out
    return _cache["spy"]


def fred_csv(path: Path) -> pd.Series:
    df = pd.read_csv(path)
    s = pd.to_numeric(df.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(df.iloc[:, 0])
    return s.dropna()


def fear_gauge(index: pd.DatetimeIndex, proxy_before_1986: bool = False) -> pd.Series:
    """VIX close (Yahoo ^VIX, 1990-), VXO (FRED, 1986-89); optionally a realised-vol proxy before 1986."""
    vix = _yf(C13 / "yf_IDX_VIX.csv")["Close"]
    vxo = fred_csv(C13 / "fred_VXOCLS.csv")
    g = pd.Series(np.nan, index=index)
    m1 = (index >= "1986-01-01") & (index < "1990-01-01")
    g[m1] = vxo.reindex(index[m1]).values
    m2 = index >= "1990-01-01"
    g[m2] = vix.reindex(index[m2]).values
    if proxy_before_1986:
        c = gspc()["Close"].reindex(index)
        rv = np.log(c).diff().rolling(21).std() * np.sqrt(252) * 100 + 4.0
        m0 = index < "1986-01-01"
        g[m0] = rv[m0].values
    return g.ffill(limit=3)


def kf_monthly_rf() -> pd.Series:
    z = zipfile.ZipFile(C06 / "F-F_Research_Data_Factors_CSV.zip")
    txt = z.read(z.namelist()[0]).decode("latin-1").splitlines()
    rows = []
    for ln in txt:
        p = [q.strip() for q in ln.split(",")]
        if len(p) >= 5 and p[0].isdigit() and len(p[0]) == 6:
            rows.append((p[0], float(p[4]) / 100))
        elif rows and p and p[0] and not p[0].isdigit():
            break
    return pd.Series([r[1] for r in rows], index=pd.PeriodIndex([f"{r[0][:4]}-{r[0][4:]}" for r in rows], freq="M"))


def rf_sessions() -> pd.Series:
    """Per-session T-bill return on the ^GSPC calendar: Ken French 1-month bill (monthly) spread evenly over
    the month's sessions; months after the Ken French file use FRED DTB3 / 252."""
    if "rf" in _cache:
        return _cache["rf"]
    idx = gspc().index
    per = idx.to_period("M")
    m = kf_monthly_rf()
    cnt = pd.Series(1, index=idx).groupby(per).transform("sum")
    rf = pd.Series(m.reindex(per).values, index=idx) / cnt.values
    dtb3 = fred_csv(C13 / "fred_DTB3.csv") / 100 / 252
    miss = rf.isna()
    rf[miss] = dtb3.reindex(dtb3.index.union(idx[miss])).ffill().reindex(idx[miss]).values
    rf = rf.fillna(0.0)
    _cache["rf"] = rf
    return rf


def btc_daily() -> pd.Series:
    """BTC-USD daily (Coin Metrics reference rate 2010-07-18-, Yahoo fills the last day)."""
    d = json.load(open(C15 / "cm_btc.json"))["data"]
    s = pd.Series({pd.Timestamp(x["time"][:10]): float(x["PriceUSD"]) for x in d}).sort_index()
    y = _yf(C06 / "yf_BTC-USD.csv")["Adj Close"]
    s = s.combine_first(y[y.index > s.index[-1]])
    return s[s > 0]


def etf_adj(tickers) -> pd.DataFrame:
    out = {}
    for t in tickers:
        d = _yf(C15 / f"yf_adj_{t}.csv")
        out[t] = d["Close"]
    return pd.DataFrame(out)


# ============================================================================ indicators
def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def rsi_wilder(close: pd.Series, n: int = 2) -> pd.Series:
    d = close.diff()
    up, dn = d.clip(lower=0), (-d).clip(lower=0)
    au = up.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    ad = dn.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = au / ad
    r = 100 - 100 / (1 + rs)
    r = r.where(ad > 0, 100.0)
    return r


# ============================================================================ W10 signal
def w10_frame() -> pd.DataFrame:
    """Signal inputs on the ^GSPC calendar (all computed through the close of the row's own day)."""
    if "w10" in _cache:
        return _cache["w10"]
    g = gspc()
    c = g["Close"]
    df = pd.DataFrame({"C": c})
    df["r"] = c.pct_change()
    df["sma200"] = sma(c, 200)
    df["up_prior"] = (c.shift(1) > df["sma200"].shift(1)) & df["sma200"].shift(1).notna()
    df["crash"] = df["r"] <= -0.03
    prior20 = df["crash"].shift(1).astype(float).rolling(20, min_periods=20).sum()
    df["quiet20"] = prior20 == 0
    df["sig"] = df["crash"] & df["up_prior"] & df["quiet20"]
    df["ath_prior"] = c.cummax().shift(1)            # all-time high through the prior close
    df["tr"] = spx_tr()
    df["rf"] = rf_sessions()
    df["gauge"] = fear_gauge(df.index)
    df["gauge_proxy"] = fear_gauge(df.index, proxy_before_1986=True)
    _cache["w10"] = df
    return df


# ============================================================================ instruments
class Inst:
    """Arrays on one calendar.  entry at `ent_px[e]`, exits at `ex_px[x]` (open or close), marks at `mark`."""

    def __init__(self, name, dates, ent_px, ex_px_open, mark, rf, up_prior, gauge, sig, ath_prior, close_ref,
                 entry_at_open: bool):
        self.name = name
        self.dates = pd.DatetimeIndex(dates)
        self.ent_px = np.asarray(ent_px, float)
        self.ex_open = np.asarray(ex_px_open, float)
        self.mark = np.asarray(mark, float)
        self.rf = np.asarray(rf, float)
        self.rfc = np.r_[0.0, np.cumsum(self.rf)]
        self.up = np.asarray(up_prior, bool)
        self.gauge = np.asarray(gauge, float)
        self.sig = np.asarray(sig, bool)
        self.ath_prior = np.asarray(ath_prior, float)
        self.close_ref = np.asarray(close_ref, float)     # ^GSPC close (for the all-time-high exit)
        self.entry_at_open = entry_at_open
        self.n = len(self.dates)
        self.dnum = self.dates.values.astype("datetime64[D]").astype(np.int64)


def inst_spy() -> Inst:
    w = w10_frame()
    s = spy()
    d = s.index[s.index >= s.index[0]]
    ww = w.reindex(d)
    return Inst("SPY", d, s["aO"].values, s["aO"].values, s["aC"].values, ww["rf"].values,
                ww["up_prior"].fillna(False).values, ww["gauge"].values, ww["sig"].fillna(False).values,
                ww["ath_prior"].values, ww["C"].values, entry_at_open=True)


def inst_index() -> Inst:
    w = w10_frame()
    tr = w["tr"].values
    return Inst("S&P TR", w.index, tr, tr, tr, w["rf"].values, w["up_prior"].values, w["gauge"].values,
                w["sig"].values, w["ath_prior"].values, w["C"].values, entry_at_open=False)


def exit_positions(I: Inst, e: np.ndarray, rule: str) -> np.ndarray:
    """Exit position X for entry positions e (-1 where it does not exist)."""
    e = np.asarray(e, int)
    if rule.startswith("CAL"):
        N = int(rule[3:])
        X = np.searchsorted(I.dnum, I.dnum[np.clip(e, 0, I.n - 1)] + N, side="right") - 1
        # need the exit to exist in the data (a later session must exist beyond the limit date)
        last_ok = I.dnum[np.clip(e, 0, I.n - 1)] + N < I.dnum[-1]
        X = np.where(last_ok & (X > e), X, -1)
    elif rule.startswith("F"):
        H = int(rule[1:])
        X = e + H
        X = np.where(X < I.n, X, -1)
    elif rule.startswith("C"):        # close of session H (entry day = session 1): SPY only
        H = int(rule[1:])
        X = e + H - 1
        X = np.where(X < I.n, X, -1)
    else:
        raise ValueError(rule)
    return X


def trade_returns(I: Inst, sig_pos: np.ndarray, rule: str, cost_bp: float = COST_BP):
    """Vectorised gross/net return, bills and calendar days for signals at positions sig_pos."""
    sig_pos = np.asarray(sig_pos, int)
    e = sig_pos + 1
    ok = e < I.n
    X = np.full(len(sig_pos), -1)
    X[ok] = exit_positions(I, e[ok], rule)
    ok = ok & (X > 0)
    gross = np.full(len(sig_pos), np.nan)
    bills = np.full(len(sig_pos), np.nan)
    days = np.full(len(sig_pos), np.nan)
    if I.entry_at_open:
        exit_px = I.mark if rule.startswith("C") else I.ex_open
        gross[ok] = exit_px[X[ok]] / I.ent_px[e[ok]] - 1
        # bills over sessions e .. X-1 (open exit) or e .. X (close exit)
        last = np.where(rule.startswith("C"), X, X - 1)
        bills[ok] = I.rfc[last[ok] + 1] - I.rfc[e[ok]]
    else:
        gross[ok] = I.mark[X[ok]] / I.ent_px[e[ok]] - 1
        bills[ok] = I.rfc[X[ok] + 1] - I.rfc[e[ok] + 1]
    days[ok] = (I.dnum[X[ok]] - I.dnum[e[ok]]).astype(float)
    g = I.gauge[np.clip(sig_pos, 0, I.n - 1)]
    c = np.where(np.nan_to_num(g) > 30, 2 * cost_bp, cost_bp) / 1e4
    net = (1 + gross) * (1 - c) / (1 + c) - 1
    return dict(e=e, X=X, gross=gross, net=net, bills=bills, excess=net - bills, days=days, ok=ok)


def mae(I: Inst, e: int, X: int, rule: str) -> float:
    """Worst mark (close) relative to the entry price while the trade is open (<= 0)."""
    if I.entry_at_open:
        last = X if rule.startswith("C") else X - 1
        path = I.mark[e:last + 1]
        if not rule.startswith("C"):
            path = np.r_[path, I.ex_open[X]]
        return float(min(path.min() / I.ent_px[e] - 1, 0.0))
    path = I.mark[e + 1:X + 1]
    return float(min(path.min() / I.ent_px[e] - 1, 0.0)) if len(path) else 0.0


# ============================================================================ placebo engine
def two_sided_p(obs: float, null: np.ndarray) -> float:
    m = null.mean()
    return float(np.mean(np.abs(null - m) >= abs(obs - m) - 1e-12))


def placebo(vec: np.ndarray, ev_pos: np.ndarray, lo: int, hi: int, up: np.ndarray | None = None,
            era: bool = True, rng=None, draws: int = B):
    """Null distribution of the mean of `vec` over len(ev_pos) random entries.
    era=True : for each event, a random session within +-WINDOW sessions (inside [lo, hi));
    up       : if given, only sessions whose prior close was above the 200-day SMA.
    Returns (per-event pool means, null means)."""
    rng = rng or np.random.default_rng(SEED)
    valid = np.isfinite(vec)
    valid[:lo] = False
    valid[hi:] = False
    if up is not None:
        valid &= up
    allpool = np.flatnonzero(valid)
    pm = np.full(len(ev_pos), np.nan)
    tot = np.zeros(draws)
    for k, i in enumerate(ev_pos):
        if era:
            a, b = max(lo, i - WINDOW), min(hi, i + WINDOW + 1)
            pool = allpool[(allpool >= a) & (allpool < b)]
        else:
            pool = allpool
        if len(pool) < 30:
            pool = allpool
        pm[k] = vec[pool].mean()
        tot += vec[pool[rng.integers(0, len(pool), size=draws)]]
    return pm, tot / len(ev_pos)


def shift_placebo(vec: np.ndarray, ev_pos: np.ndarray, lo: int, hi: int, rng=None, draws: int = B):
    """Cluster-preserving placebo: every event is moved by the SAME random offset d (21 <= |d| <= 756
    sessions), reflected at the sample edges, so overlapping events stay overlapping."""
    rng = rng or np.random.default_rng(SEED + 7)
    d = rng.integers(21, WINDOW + 1, size=draws) * rng.choice([-1, 1], size=draws)
    pos = ev_pos[None, :] + d[:, None]
    span_lo, span_hi = lo, hi - 1
    pos = np.where(pos < span_lo, 2 * span_lo - pos, pos)
    pos = np.where(pos > span_hi, 2 * span_hi - pos, pos)
    pos = np.clip(pos, span_lo, span_hi)
    v = vec[pos]
    # invalid (NaN) cells: replace with the nearest valid earlier session's value
    if np.isnan(v).any():
        fill = pd.Series(vec).ffill().bfill().values
        v = np.where(np.isnan(v), fill[pos], v)
    return v.mean(axis=1)


# ============================================================================ statistics
def tstat(x) -> float:
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    if len(x) < 2 or x.std(ddof=1) == 0:
        return float("nan")
    return float(x.mean() / (x.std(ddof=1) / math.sqrt(len(x))))


def expected_max_z(N: int) -> float:
    """Expected maximum of N independent standard normals (Bailey & Lopez de Prado approximation)."""
    if N <= 1:
        return 0.0
    g = 0.5772156649
    return float((1 - g) * stats.norm.ppf(1 - 1 / N) + g * stats.norm.ppf(1 - 1 / (N * math.e)))


def bonferroni_t(N: int, alpha: float = 0.05) -> float:
    return float(stats.norm.ppf(1 - alpha / (2 * N)))


def deflated_sr(x, N: int) -> float:
    """Deflated-Sharpe probability of a per-trade return series x being best of N trials
    (Bailey & Lopez de Prado 2014), with the null SR variance ~ 1/(T-1)."""
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    T = len(x)
    if T < 4 or x.std(ddof=1) == 0:
        return float("nan")
    sr = x.mean() / x.std(ddof=1)
    sk = stats.skew(x)
    ku = stats.kurtosis(x, fisher=False)
    sr0 = math.sqrt(1.0 / (T - 1)) * expected_max_z(N)
    den = math.sqrt(max(1 - sk * sr + (ku - 1) / 4 * sr ** 2, 1e-9))
    return float(stats.norm.cdf((sr - sr0) * math.sqrt(T - 1) / den))


def sidak(p: float, n: int) -> float:
    return float(1 - (1 - p) ** n)


# ============================================================================ variant registry
REG: list[dict] = []


def register(family: str, variant: str, sample: str, kind: str, n: int | None = None, **kw):
    """kind: 'decision' (a cell that could change the rule) or 'diagnostic' (a check that cannot)."""
    REG.append(dict(family=family, variant=variant, sample=sample, kind=kind, n=n, **kw))


def gov(dd: float) -> float:
    """Design drawdown governor G(D): 1 up to a 5% drawdown, linear to 0.25 at 15%, 0.25 beyond."""
    d = -dd
    if d <= 0.05:
        return 1.0
    if d >= 0.15:
        return 0.25
    return 1.0 - 0.75 * (d - 0.05) / 0.10
