"""Track 26 - leveraged index trend core: data, simulation engine and statistics.

Data (all public, cached outside the repo in CACHE_DIR; set TRACK26_CACHE to move it):
  * Yahoo Finance (yfinance): ^GSPC (1927-), ^SP500TR (1988-), ^NDX (1985-), ^IXIC (1971-),
    ^VIX (1990-), ^IRX, SPY, QQQ, SSO, UPRO, QLD, TQQQ, SGOV, BIL, IEF, TLT, GLD
  * Kenneth French data library: daily 1-month T-bill return (RF) 1926-07 .. 2026-08
    (via research/code/02-academic/kf_utils.py, whose cache is in the repo)
  * FRED: DTB3 (3-month T-bill, for days after the last KF date), DGS10 (synthetic 10y bond),
    VXOCLS (VXO, 1986-1989)
  * Robert Shiller ie_data.xls: monthly S&P dividend yield before 1988 (total return)
  * gold monthly (datahub/github mirror of LBMA), for the pre-2004 gold exit test only

Conventions (stated in the report):
  * A signal computed on the close of decision day d is traded at the close of d+1
    ("next close", LAG = 2 in return-index terms).  The real-ETF check (s02) also runs the
    realistic Robinhood fill: a market order queued for the open of d+1.
  * Leveraged exposure E of the index earns
        E * r_TR - max(E-1,0) * (rf + SPREAD) - fee(E)
    with SPREAD calibrated to the realised SSO/UPRO record (s00_calibrate.py) and
    fee(E) = SPY's 0.0945% on the first unit plus 0.80% per extra unit up to 2x
    (so 2x = 0.89% like SSO, 3x = 0.91% like UPRO).
  * Uninvested capital earns the exit asset (T-bills by default).
  * Trading cost: 0.10% of the fund notional traded per side (plus 0.01% on the T-bill ETF leg);
    see trade_cost().  Real UPRO/SSO/TQQQ/QLD quoted spreads are about 0.01-0.03%.
"""
from __future__ import annotations

import os
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import requests

warnings.filterwarnings("ignore")

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
OUT.mkdir(exist_ok=True)
REPO_CODE = HERE.parent
CACHE_DIR = Path(os.environ.get(
    "TRACK26_CACHE",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/26-leveraged-trend/cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
# Older caches from tracks 04 and 06 (same session scratchpad) are reused when present.
OLD_CACHES = [
    Path("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/06-backtests/cache"),
    Path("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/04-derivatives/data"),
]
END = pd.Timestamp(os.environ.get("TRACK26_END", "2026-09-25"))   # last fully settled Friday close

sys.path.insert(0, str(REPO_CODE / "02-academic"))

SPY_ER = 0.000945
EXTRA_UNIT_FEE = 0.0080
TC = 0.0010          # cost per unit of LETF/ETF notional traded (half-spread + slippage), each side
LAG = 2              # signal at close d -> position from the return of d+2 (trade at close d+1)
TD = 252


# ----------------------------------------------------------------------------- download helpers
def _get(url: str, timeout: int = 90) -> bytes:
    last = None
    for i in range(3):
        try:
            r = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0 research"})
            r.raise_for_status()
            return r.content
        except Exception as e:  # pragma: no cover
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"download failed {url}: {last}")


def _find_cached(names: list[str]) -> Path | None:
    for d in [CACHE_DIR] + OLD_CACHES:
        for n in names:
            p = d / n
            if p.exists():
                return p
    return None


def yf_df(ticker: str, start: str = "1927-01-01") -> pd.DataFrame:
    safe = ticker.replace("^", "IDX_").replace("=", "_")
    p = _find_cached([f"yf_{safe}.csv", f"yf_{safe.replace('-', '_')}.csv"])
    if p is None:
        import yfinance as yf
        df = None
        for _ in range(3):
            try:
                df = yf.download(ticker, start=start, progress=False, auto_adjust=False, threads=False)
                if df is not None and len(df):
                    break
            except Exception:
                time.sleep(2)
        if df is None or len(df) == 0:
            raise RuntimeError(f"no data for {ticker}")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        p = CACHE_DIR / f"yf_{safe}.csv"
        df.to_csv(p)
    df = pd.read_csv(p, index_col=0, parse_dates=True)
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    for c in df.columns:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df.loc[:END]


def fred(series: str) -> pd.Series:
    p = _find_cached([f"fred_{series}.csv"])
    if p is None:
        p = CACHE_DIR / f"fred_{series}.csv"
        p.write_bytes(_get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"))
    df = pd.read_csv(p)
    df.columns = ["date", series]
    df["date"] = pd.to_datetime(df["date"])
    return pd.to_numeric(df.set_index("date")[series], errors="coerce").dropna().loc[:END]


def shiller_divyield() -> pd.Series:
    p = _find_cached(["shiller_ie_data.xls"])
    if p is None:
        p = CACHE_DIR / "shiller_ie_data.xls"
        p.write_bytes(_get("http://www.econ.yale.edu/~shiller/data/ie_data.xls"))
    x = pd.read_excel(p, sheet_name="Data", header=7)
    x = x[["Date", "P", "D"]].dropna()
    x = x[pd.to_numeric(x.Date, errors="coerce").notna()]
    yr = x.Date.astype(float).astype(int)
    mo = ((x.Date.astype(float) - yr) * 100).round().astype(int)
    idx = pd.to_datetime(dict(year=yr, month=mo, day=1))
    return pd.Series((x.D.astype(float) / x.P.astype(float)).values, index=idx).sort_index()


def kf_rf_daily() -> pd.Series:
    from kf_utils import daily_returns
    df = daily_returns("F-F_Research_Data_Factors_daily")     # decimals
    return df["RF"].astype(float)          # decimal per day


# ----------------------------------------------------------------------------- panels
_PANEL: dict = {}


def rf_daily(idx: pd.DatetimeIndex) -> pd.Series:
    """Daily T-bill return: Ken French RF to its last date, then DTB3/360 per calendar day."""
    kf = kf_rf_daily()
    dtb3 = fred("DTB3") / 100.0
    s = kf.reindex(idx)
    after = idx[idx > kf.index[-1]]
    if len(after):
        y = dtb3.reindex(idx.union(dtb3.index)).ffill().reindex(after)
        gap = pd.Series(after, index=after).diff().dt.days.fillna(1).values
        s.loc[after] = y.values * gap / 360.0
    return s.ffill().fillna(0.0)


def spx_panel() -> pd.DataFrame:
    """S&P 500: price (^GSPC close), daily total return, rf, SPY-like TR, 20d realised vol, VIX."""
    if "spx" in _PANEL:
        return _PANEL["spx"]
    g = yf_df("^GSPC")
    px = g["Close"].dropna()
    r = px.pct_change()
    dy = shiller_divyield()
    dyd = dy.reindex(px.index.union(dy.index)).ffill().reindex(px.index)
    rtr = r + dyd / TD
    tr = yf_df("^SP500TR", start="1988-01-01")["Close"].dropna()
    rmod = tr.pct_change().dropna()
    rtr.loc[rmod.index[0]:] = rmod.reindex(rtr.loc[rmod.index[0]:].index)
    df = pd.DataFrame({"px": px, "r": rtr}).dropna()
    df["rf"] = rf_daily(df.index)
    df["spy"] = df.r - SPY_ER / TD            # SPY-like benchmark (index TR less SPY's fee)
    df["rv20"] = df.r.rolling(20).std() * np.sqrt(TD)
    vix = yf_df("^VIX", start="1990-01-01")["Close"].dropna()
    vxo = fred("VXOCLS")
    v = pd.concat([vxo.loc[:"1989-12-31"], vix]).sort_index()
    v = v[~v.index.duplicated(keep="last")]
    df["vix"] = v.reindex(df.index)
    # pre-1986: VIX proxy = 0.70 x realised 20d vol (%) + 8.7 (OLS fit on 1990-2026, see s00)
    df["vix_or_proxy"] = df.vix.fillna(df.rv20 * 100 * 0.70 + 8.7)
    _PANEL["spx"] = df
    return df


def ndx_panel(splice_ixic: bool = False) -> pd.DataFrame:
    """Nasdaq-100: ^NDX price; TR = price + dividend yield (QQQ-implied after 1999, 0.6%/yr before).
    Optionally splice ^IXIC daily returns before 1985-10 (stale-price caveat)."""
    key = f"ndx{int(splice_ixic)}"
    if key in _PANEL:
        return _PANEL[key]
    n = yf_df("^NDX", start="1985-01-01")["Close"].dropna()
    rp = n.pct_change()
    if splice_ixic:
        ix = yf_df("^IXIC", start="1971-01-01")["Close"].dropna()
        ri = ix.pct_change().loc[:n.index[0]]
        rp = pd.concat([ri, rp.iloc[1:]]).sort_index()
        px = (1 + rp.fillna(0)).cumprod()
        px = px / px.loc[n.index[0]] * n.iloc[0]
    else:
        px = n
    q = yf_df("QQQ", start="1999-03-01")
    qtr = q["Adj Close"].pct_change()
    qpr = q["Close"].pct_change()
    div = (qtr - qpr).rolling(252, min_periods=60).mean().reindex(px.index).ffill()
    div = div.fillna(0.006 / TD).clip(lower=0)
    rtr = rp.reindex(px.index) + div
    df = pd.DataFrame({"px": px, "r": rtr}).dropna()
    df["rf"] = rf_daily(df.index)
    df["qqq"] = df.r - 0.0020 / TD
    df["rv20"] = df.r.rolling(20).std() * np.sqrt(TD)
    spx = spx_panel()
    df["spy"] = spx.spy.reindex(df.index)
    df["vix_or_proxy"] = spx.vix_or_proxy.reindex(df.index)
    _PANEL[key] = df
    return df


def bond10_daily(idx: pd.DatetimeIndex) -> pd.Series:
    """Synthetic 10-year constant-maturity Treasury total return from DGS10 (par bond repriced daily),
    minus IEF's 0.15% fee.  Validated against IEF in s00."""
    y = fred("DGS10") / 100.0
    y = y.reindex(idx.union(y.index)).ffill().reindex(idx)
    y0, y1 = y.shift(1), y
    n = 20  # semiannual periods
    c = y0 / 2
    price = c / (y1 / 2) * (1 - (1 + y1 / 2) ** -n) + (1 + y1 / 2) ** -n
    gap = pd.Series(idx, index=idx).diff().dt.days.fillna(1)
    r = price - 1 + y0 * gap / 365.0
    # + 0.68%/yr roll-down/term adjustment so the proxy matches IEF's 2002-2026 CAGR (s00)
    return (r - 0.0015 / TD + 0.0068 / TD).rename("bond10")


def gold_daily(idx: pd.DatetimeIndex) -> pd.Series:
    """GLD (2004-11 on); before that, monthly LBMA gold spread evenly over the month's trading days
    (smooth path: fine for CAGR of an exit asset, understates its daily vol)."""
    gld = yf_df("GLD", start="2004-11-01")["Adj Close"].pct_change()
    p = _find_cached(["gold_monthly_github.csv"])
    gm = pd.read_csv(p)
    gm.index = pd.to_datetime(gm.iloc[:, 0]) + pd.offsets.MonthEnd(0)
    gm = gm.iloc[:, 1].astype(float)
    mret = gm.pct_change()
    d = pd.Series(idx, index=idx)
    ym = d.dt.to_period("M")
    cnt = ym.map(ym.value_counts())
    mr = ym.map(lambda m: mret.get(m.to_timestamp(how="end").normalize() + pd.offsets.MonthEnd(0), np.nan))
    daily = (1 + mr.astype(float)) ** (1 / cnt.astype(float)) - 1
    out = daily.copy()
    g = gld.reindex(idx)
    out.loc[g.dropna().index] = g.dropna()
    return out.rename("gold")


# ----------------------------------------------------------------------------- calendars
def decision_days(idx: pd.DatetimeIndex, freq: str) -> np.ndarray:
    """Boolean mask of decision days: 'D' every day; 'W' last trading day of each week (Fri close);
    'M' last trading day of each month."""
    s = pd.Series(np.arange(len(idx)), index=idx)
    if freq == "D":
        return np.ones(len(idx), bool)
    if freq == "W":
        key = idx.to_period("W-FRI")
    elif freq == "M":
        key = idx.to_period("M")
    else:
        raise ValueError(freq)
    last = s.groupby(key).transform("max").values
    return (np.arange(len(idx)) == last)


# ----------------------------------------------------------------------------- signals
def sma(x: pd.Series, n: int) -> pd.Series:
    return x.rolling(n, min_periods=n).mean()


def hysteresis(up: np.ndarray, down: np.ndarray, mask: np.ndarray, init: float = 0.0) -> np.ndarray:
    """State in {0,1}: set to 1 when `up`, to 0 when `down`, else keep; evaluated only on mask days,
    held (forward-filled) in between."""
    st = np.full(len(up), np.nan)
    st[mask & up] = 1.0
    st[mask & down & ~up] = 0.0
    st = pd.Series(st).ffill().fillna(init).values
    return st


def monthly_sma_state(px: pd.Series, months: int = 10, band: float = 0.0) -> np.ndarray:
    """Faber rule: on the last day of each month, in if month-end price > (1+band) x average of the
    last `months` month-end prices; out if < (1-band) x; else keep."""
    idx = px.index
    me = decision_days(idx, "M")
    mp = px[me]
    ma = mp.rolling(months, min_periods=months).mean()
    up = pd.Series(False, index=idx)
    dn = pd.Series(False, index=idx)
    up.loc[mp.index] = (mp > ma * (1 + band)).values
    dn.loc[mp.index] = (mp < ma * (1 - band)).values
    return hysteresis(up.values, dn.values, me)


def trend_state(df: pd.DataFrame, filt: str, freq: str, band: float) -> np.ndarray:
    """0/1 'risk-on' state known at each close (before execution lag)."""
    px = df.px
    mask = decision_days(df.index, freq)
    if filt == "none":
        return np.ones(len(df))
    if filt == "sma10m":
        return monthly_sma_state(px, 10, band)
    if filt.startswith("sma"):
        n = int(filt[3:])
        m = sma(px, n)
        up = (px > m * (1 + band)).values
        dn = (px < m * (1 - band)).values
        return hysteresis(up, dn, mask & m.notna().values)
    if filt == "sma10m":
        return monthly_sma_state(px, 10, band)
    if filt == "x50_200":
        f, s_ = sma(px, 50), sma(px, 200)
        up = (f > s_ * (1 + band)).values
        dn = (f < s_ * (1 - band)).values
        return hysteresis(up, dn, mask & s_.notna().values)
    if filt == "dual":          # price > 200d SMA (with band) AND 12-month total return > T-bills
        m = sma(px, 200)
        tr = (1 + df.r).cumprod()
        rfc = (1 + df.rf).cumprod()
        mom = (tr / tr.shift(252)) - (rfc / rfc.shift(252))
        a_up, a_dn = (px > m * (1 + band)).values, (px < m * (1 - band)).values
        st_a = hysteresis(a_up, a_dn, mask & m.notna().values)
        st_b = hysteresis((mom > 0).values, (mom <= 0).values, mask & mom.notna().values)
        return st_a * st_b
    if filt == "either":        # price > 200d SMA OR 12m TR > T-bills (in more often)
        m = sma(px, 200)
        tr = (1 + df.r).cumprod()
        rfc = (1 + df.rf).cumprod()
        mom = (tr / tr.shift(252)) - (rfc / rfc.shift(252))
        st_a = hysteresis((px > m * (1 + band)).values, (px < m * (1 - band)).values, mask & m.notna().values)
        st_b = hysteresis((mom > 0).values, (mom <= 0).values, mask & mom.notna().values)
        return np.maximum(st_a, st_b)
    raise ValueError(filt)


def exposure_path(df: pd.DataFrame, L: float, filt: str, freq: str, band: float,
                  voltgt: float | None = None, vol_n: int = 20, brake: float | None = None,
                  brake_to: float = 0.0, min_step: float = 0.25) -> np.ndarray:
    """Target index exposure decided at each close (before the execution lag).
    * trend state (0/1) x L, or with vol targeting: min(L, voltgt / realised vol) while the trend
      is on (filt='none' = vol targeting alone).  Vol-target changes smaller than `min_step`
      are skipped (no-trade band), so the order count stays low.
    * brake: if VIX (or the pre-1986 proxy) closes above `brake` on a decision day, exposure is
      cut to brake_to x L (0 = T-bills)."""
    mask = decision_days(df.index, freq)
    st = trend_state(df, filt, freq, band)
    if voltgt is None:
        tgt = st * L
    else:
        rv = df.r.rolling(vol_n, min_periods=vol_n).std().values * np.sqrt(TD)
        raw = np.where(np.isfinite(rv) & (rv > 0), np.minimum(L, voltgt / rv), 0.0)
        raw = np.round(raw * 4) / 4        # quarter-unit steps
        tgt = np.full(len(df), np.nan)
        cur = 0.0
        for i in np.flatnonzero(mask):
            want = raw[i] * st[i]
            if abs(want - cur) >= min_step - 1e-9 or (want == 0 and cur != 0):
                cur = want
            tgt[i] = cur
        tgt = pd.Series(tgt).ffill().fillna(0.0).values
    if brake is not None:
        v = df["vix_or_proxy"].values
        hot = np.full(len(df), np.nan)
        hot[mask] = (v[mask] > brake).astype(float)
        hot = pd.Series(hot).ffill().fillna(0.0).values
        tgt = np.where(hot > 0, np.minimum(tgt, brake_to * L), tgt)
    return tgt


def fee(E: np.ndarray) -> np.ndarray:
    return SPY_ER * np.minimum(E, 1.0) + EXTRA_UNIT_FEE * np.clip(E - 1.0, 0.0, 1.0) \
        + 0.0002 * np.clip(E - 2.0, 0.0, 1.0)


def trade_cost(dE: np.ndarray, L: float) -> np.ndarray:
    """Cost of changing exposure by dE: the notional traded in the L-times fund is |dE|/L (one side),
    plus the T-bill ETF leg (1bp)."""
    Lf = max(L, 1.0)
    return TC * np.abs(dE) / Lf + 0.0001 * np.abs(dE) / Lf


SPREAD = 0.0070   # financing spread over T-bills on borrowed notional; calibrated in s00 to SSO/UPRO
                  # (0.70-0.75% matches them; QLD/TQQQ match at 0.50-0.55%, so NDX is slightly conservative)


def run(df: pd.DataFrame, target: np.ndarray, L: float, exit_ret: pd.Series | None = None,
        spread: float | None = None, lag: int = LAG) -> pd.DataFrame:
    """Daily strategy returns for a target-exposure path (decided at closes) with the execution lag."""
    sp = SPREAD if spread is None else spread
    E = pd.Series(target, index=df.index).shift(lag).fillna(0.0).values
    r, rf = df.r.values, df.rf.values
    x = rf if exit_ret is None else exit_ret.reindex(df.index).fillna(pd.Series(rf, index=df.index)).values
    dE = np.abs(np.diff(np.concatenate([[0.0], E])))
    ret = E * r - np.maximum(E - 1, 0) * (rf + sp / TD) - fee(E) / TD + np.maximum(1 - E, 0) * x \
        - trade_cost(dE, L)
    ret = np.maximum(ret, -1.0)
    return pd.DataFrame({"ret": ret, "E": E, "trade": dE > 1e-9}, index=df.index)


# ----------------------------------------------------------------------------- statistics
def years(ix: pd.DatetimeIndex) -> float:
    return (ix[-1] - ix[0]).days / 365.25


def cagr_from(ret: pd.Series) -> float:
    eq = float(np.prod(1 + ret.values))
    y = years(ret.index)
    return eq ** (1 / y) - 1 if eq > 0 else -1.0


def maxdd(ret: pd.Series) -> float:
    eq = np.cumprod(1 + ret.values)
    return float((eq / np.maximum.accumulate(eq) - 1).min())


def underwater(ret: pd.Series) -> tuple[float, float]:
    """(share of days more than 20% below the prior peak, longest spell below a prior peak in years)"""
    eq = pd.Series(np.cumprod(1 + ret.values), index=ret.index)
    peak = eq.cummax()
    uw = eq < peak * (1 - 1e-9)
    share = float((eq < peak * 0.8).mean())
    # longest spell below a prior peak (years)
    grp = (~uw).cumsum()
    longest = 0.0
    for _, g in uw[uw].groupby(grp[uw]):
        longest = max(longest, (g.index[-1] - g.index[0]).days / 365.25)
    return share, longest


def full_stats(s: pd.DataFrame, bench: pd.Series, rf: pd.Series, label: str) -> dict:
    ret = s["ret"]
    y = years(ret.index)
    c = cagr_from(ret)
    cb = cagr_from(bench.loc[ret.index])
    ex = ret - rf.loc[ret.index]
    sharpe = ex.mean() / ex.std() * np.sqrt(TD) if ex.std() > 0 else np.nan
    yr = (1 + ret).groupby(ret.index.year).prod() - 1
    uw_share, uw_long = underwater(ret)
    trades = s["trade"].sum() if "trade" in s else np.nan
    E = s["E"] if "E" in s else None
    return dict(rule=label, start=ret.index[0].date(), end=ret.index[-1].date(), cagr=c, spy_cagr=cb,
                excess=c - cb, vol=ret.std() * np.sqrt(TD), sharpe=sharpe, maxdd=maxdd(ret),
                worst_year=yr.min(), worst_year_when=int(yr.idxmin()), dd20_share=uw_share,
                longest_uw_yrs=uw_long, orders_per_yr=trades / y,
                time_in=float((E > 0).mean()) if E is not None else np.nan,
                avg_E=float(E.mean()) if E is not None else np.nan,
                multiple=float(np.prod(1 + ret.values)))


def rolling_beat(ret: pd.Series, bench: pd.Series, yrs: int) -> dict:
    """Share of rolling windows (month-end starts) in which the strategy's annualised return beats
    SPY, and beats it by >= 5 points a year; plus the median and 10th-percentile excess."""
    eq = (1 + ret).cumprod().resample("ME").last()
    eb = (1 + bench.loc[ret.index]).cumprod().resample("ME").last()
    n = yrs * 12
    a = (eq / eq.shift(n)) ** (1 / yrs) - 1
    b = (eb / eb.shift(n)) ** (1 / yrs) - 1
    d = (a - b).dropna()
    if len(d) == 0:
        return {f"beat{yrs}y": np.nan}
    return {f"n{yrs}y": len(d), f"beat{yrs}y": float((d > 0).mean()), f"beat5pt{yrs}y": float((d >= 0.05).mean()),
            f"med_ex{yrs}y": float(d.median()), f"p10_ex{yrs}y": float(d.quantile(0.1)),
            f"worst_ann{yrs}y": float(a.dropna().min())}


def fmt(x, nd=1, pct=True):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "n/a"
    return f"{100 * x:.{nd}f}%" if pct else f"{x:.{nd}f}"
