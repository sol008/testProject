"""Track 27: momentum and relative-strength rotation among ETFs, decided at most weekly.

Shared data loaders, the rotation engine, statistics and multiple-testing tools.

Conventions
-----------
* Signals use CLOSES up to and including the decision session t (a Friday for weekly
  rules, the last session of the month for monthly rules). Nothing later is used.
* Trades execute on the NEXT session t+1: at the adjusted OPEN (base case, 'open') or at
  the adjusted CLOSE ('close'). Spliced Bitcoin has no NYSE open, so it always trades at the
  next session's close.
* Prices are Yahoo dividend-adjusted (total return); ETF expense ratios are already inside
  the adjusted price. Synthetic series carry their own fees:
    - BTC: Coin Metrics PriceUSD (2010-07) spliced with Yahoo BTC-USD and, from its launch
      on 2024-01-11, IBIT itself; minus IBIT's 0.25 %/yr fee before the splice;
    - leveraged funds: L x underlying index return - (L-1) x (T-bill + 0.40 %) - 0.95 %/yr,
      the track-04 model (`research/code/04-derivatives/s03_letf_analysis.py`);
    - CASH: 3-month T-bill (FRED DTB3) minus 0.10 %/yr (an SGOV/BIL-like fund or sweep).
* Costs: a per-side cost in basis points of the traded value (half spread + slippage).
* Position logic ("swap only", the fewest orders): at a decision, sell the holdings that
  dropped out of the target list, buy the new entries with the proceeds (each new entry
  capped at 1/k of equity when the target also holds cash), leave continuing holdings
  untouched (they drift). Orders = sells + buys; cash needs no order.

Everything downloaded is cached in the scratchpad (CACHE). Only small tables go to results/.
"""
from __future__ import annotations

import io
import json
import math
import os
import time
import warnings
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import requests

warnings.filterwarnings("ignore")

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
RESULTS.mkdir(exist_ok=True)
SCRATCH = Path(os.environ.get(
    "TRACK27_SCRATCH",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/27-rotation"))
CACHE = SCRATCH / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

ASOF = pd.Timestamp("2026-09-28")
IS_END = pd.Timestamp("2012-12-31")     # design period ends here
OOS_START = pd.Timestamp("2013-01-01")  # test period 2013-01-01 .. ASOF

# Per-side trading cost, basis points (track-13 values; wider for thin ETFs).
COST_BPS = {
    "SPY": 1.0, "QQQ": 1.0, "IWM": 1.5, "MDY": 3.0, "DIA": 1.5,
    "XLB": 3.0, "XLE": 2.0, "XLF": 2.0, "XLI": 2.5, "XLK": 2.0, "XLP": 2.5, "XLU": 2.5,
    "XLV": 2.5, "XLY": 2.5, "SMH": 3.0, "SOXX": 4.0,
    "EFA": 2.5, "EEM": 2.5, "VEU": 3.0, "SCZ": 5.0,
    "TLT": 1.5, "IEF": 1.5, "GLD": 2.0, "DBC": 6.0, "AGG": 1.5,
    "BTC": 10.0, "CASH": 0.0,
}
DEFAULT_COST = 6.0          # single-country iShares
LETF_COST = 3.0             # QLD/TQQQ/SSO/UPRO/SOXL-like
LETF_SPREAD, LETF_ER = 0.004, 0.0095
UNDERLYING_ER = {"SPY": 0.0009, "QQQ": 0.0020, "SMH": 0.0035, "SOXX": 0.0035, "XLK": 0.0009,
                 "IWM": 0.0019, "MDY": 0.0024, "EFA": 0.0033, "EEM": 0.0070}
CASH_FEE = 0.0010
BTC_FEE = 0.0025

SECTORS9 = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"]
COUNTRIES = ["EWA", "EWC", "EWD", "EWG", "EWH", "EWI", "EWJ", "EWK", "EWL", "EWN", "EWO", "EWP",
             "EWQ", "EWS", "EWT", "EWU", "EWW", "EWY", "EWZ", "EZA", "FXI", "EWM"]


def cost_of(t: str) -> float:
    if t in COST_BPS:
        return COST_BPS[t]
    if t.startswith("L2_") or t.startswith("L3_") or t in ("QLD", "TQQQ", "SSO", "UPRO", "SOXL", "USD", "ROM"):
        return LETF_COST
    return DEFAULT_COST


# ============================================================================ downloads
def _get(url: str, timeout: int = 90, retries: int = 3) -> bytes:
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0 research-bot"})
            r.raise_for_status()
            return r.content
        except Exception as e:  # pragma: no cover
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"download failed {url}: {last}")


def yf_raw(ticker: str, refresh: bool = False) -> pd.DataFrame:
    """Daily OHLC, Adj Close, Volume from Yahoo (cached)."""
    fn = CACHE / f"yf_{ticker.replace('^', 'IDX_')}.csv"
    if fn.exists() and not refresh:
        return pd.read_csv(fn, index_col=0, parse_dates=True)
    import yfinance as yf
    df = None
    for _ in range(4):
        try:
            df = yf.download(ticker, start="1985-01-01", end="2026-09-29", progress=False,
                             auto_adjust=False, threads=False, actions=False)
            if df is not None and len(df):
                break
        except Exception:
            time.sleep(3)
    if df is None or len(df) == 0:
        raise RuntimeError(f"no data for {ticker}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df = df[["Open", "High", "Low", "Close", "Adj Close", "Volume"]]
    df.to_csv(fn)
    return df


def adjusted(ticker: str) -> pd.DataFrame:
    """Frame with adjusted open (aO) and close (aC); ASOF-truncated."""
    raw = yf_raw(ticker)
    raw = raw[(raw["Close"] > 0) & raw["Close"].notna()]
    f = (raw["Adj Close"] / raw["Close"]).ffill().bfill()
    o = raw["Open"].where(raw["Open"] > 0, raw["Close"])
    df = pd.DataFrame({"aO": o * f, "aC": raw["Adj Close"]}, index=raw.index)
    return df.loc[:ASOF]


def fred(series_id: str) -> pd.Series:
    fn = CACHE / f"fred_{series_id}.csv"
    if not fn.exists():
        fn.write_bytes(_get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"))
    df = pd.read_csv(fn)
    df.columns = ["date", series_id]
    s = pd.to_numeric(df[series_id], errors="coerce")
    s.index = pd.to_datetime(df["date"])
    return s.dropna()


def rf_daily(index: pd.DatetimeIndex) -> pd.Series:
    """Per-session T-bill return (DTB3/252), forward-filled onto the index."""
    d = fred("DTB3") / 100.0 / 252.0
    return d.reindex(d.index.union(index)).ffill().reindex(index).fillna(0.0)


def kf_zip_text(name: str) -> str:
    fn = CACHE / f"{name}_CSV.zip"
    if not fn.exists():
        fn.write_bytes(_get(f"https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/{name}_CSV.zip"))
    z = zipfile.ZipFile(fn)
    return z.read(z.namelist()[0]).decode("latin-1")


def kf_daily_table(name: str, which: int = 0) -> pd.DataFrame:
    """First (value-weighted) block of a Ken French daily CSV, in decimals; -99.99 -> NaN."""
    lines = kf_zip_text(name).splitlines()
    blocks, cur, hdr = [], [], None
    for ln in lines:
        p = [q.strip() for q in ln.split(",")]
        if p and p[0].isdigit() and len(p[0]) == 8:
            cur.append(p)
        else:
            if cur:
                blocks.append((hdr, cur))
                cur = []
            if len(p) > 1 and p[0] == "" and any(x for x in p[1:]):
                hdr = [x for x in p[1:]]
    if cur:
        blocks.append((hdr, cur))
    hdr, rows = blocks[which]
    idx = pd.to_datetime([r[0] for r in rows], format="%Y%m%d")
    vals = np.array([[float(x) for x in r[1:1 + len(hdr)]] for r in rows]) / 100.0
    df = pd.DataFrame(vals, index=idx, columns=hdr)
    return df.where(df > -0.99)


def btc_series() -> pd.Series:
    """Daily BTC close: Coin Metrics PriceUSD (2010-07-18 on), then Yahoo BTC-USD."""
    fn = CACHE / "cm_btc.json"
    if not fn.exists():
        url = ("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc"
               "&metrics=PriceUSD&frequency=1d&page_size=10000&start_time=2009-01-01")
        rows = []
        while url:
            j = json.loads(_get(url, timeout=120))
            rows += j.get("data", [])
            url = j.get("next_page_url")
        fn.write_text(json.dumps({"data": rows}))
    j = json.loads(fn.read_text())
    s = pd.Series({pd.Timestamp(r["time"][:10]): float(r["PriceUSD"]) for r in j["data"]
                   if r.get("PriceUSD")}).sort_index()
    y = yf_raw("BTC-USD")["Close"].dropna()
    s = pd.concat([s[s.index < y.index[0]], y]).sort_index()
    s = s[~s.index.duplicated(keep="last")]
    return s[s > 0].loc[:ASOF]


# ============================================================================ panels
class Panel:
    """Aligned arrays on the NYSE session calendar: C (adjusted close), E_open, E_close."""

    def __init__(self, closes: pd.DataFrame, opens: pd.DataFrame, rf: pd.Series, bench: str = "SPY"):
        self.idx = closes.index
        self.names = list(closes.columns)
        self.C = closes.values.astype(float)
        self.O = opens.reindex(columns=closes.columns).values.astype(float)
        self.rf = rf.reindex(self.idx).fillna(0.0).values
        self.bench = bench
        self.col = {n: i for i, n in enumerate(self.names)}

    def sub(self, names):
        return [self.col[n] for n in names]


def build_etf_panel(tickers, extra_synthetic=None, start="1993-01-29") -> Panel:
    """Adjusted closes/opens on the SPY calendar (1993-01-29 on), plus CASH and optional synthetic
    series (dict name -> close Series; they trade at the close)."""
    spy = adjusted("SPY")
    idx = spy.loc[start:].index
    C, O = {}, {}
    for t in tickers:
        if t == "CASH":
            continue
        df = adjusted(t).reindex(idx)
        # a missing session inside an ETF's life: carry the last close, open = close
        first = df["aC"].first_valid_index()
        if first is not None:
            df.loc[first:, "aC"] = df.loc[first:, "aC"].ffill()
            df.loc[first:, "aO"] = df.loc[first:, "aO"].fillna(df.loc[first:, "aC"])
        C[t], O[t] = df["aC"], df["aO"]
    rf = rf_daily(idx)
    cash = (1 + rf - CASH_FEE / 252.0).cumprod()
    C["CASH"], O["CASH"] = cash, cash
    for name, s in (extra_synthetic or {}).items():
        s = s.reindex(s.index.union(idx)).ffill().reindex(idx)
        s = s.where(s.index >= s.first_valid_index()) if s.first_valid_index() is not None else s
        C[name], O[name] = s, s    # synthetic: executes at the close (open := close)
    return Panel(pd.DataFrame(C), pd.DataFrame(O), rf)


def btc_ibit_series(idx: pd.DatetimeIndex) -> pd.Series:
    """BTC on NYSE sessions, minus IBIT's fee; switches to IBIT's own returns after its launch."""
    b = btc_series()
    b = b.reindex(b.index.union(idx)).ffill().reindex(idx)
    r = b.pct_change()
    try:
        ib = adjusted("IBIT")["aC"].reindex(idx)
        rib = ib.pct_change()
        live = rib.notna() & (idx > pd.Timestamp("2024-01-11"))
        r[live] = rib[live]
    except Exception:
        pass
    r = r - BTC_FEE / 252.0
    first = b.first_valid_index()
    out = (1 + r.loc[first:].fillna(0.0)).cumprod()
    return out.reindex(idx)


def letf_series(under: pd.Series, rf: pd.Series, L: float, und_er: float = 0.0) -> pd.Series:
    """Daily-reset L-times fund on an adjusted ETF close series (the underlying's own ER is added
    back first, so the fund's index return is gross), with swap financing and the fund's fee."""
    r = under.pct_change() + und_er / 252.0
    rfa = rf.reindex(under.index).fillna(0.0)
    f = L * r - (L - 1) * (rfa + LETF_SPREAD / 252.0) - LETF_ER / 252.0
    f = f.clip(lower=-0.999)
    first = under.first_valid_index()
    return (1 + f.loc[first:].fillna(0.0)).cumprod().reindex(under.index)


# ============================================================================ signals
LOOKBACKS = {"1m": 21, "3m": 63, "6m": 126, "12m": 252}


def momentum_scores(C: np.ndarray, kind: str) -> np.ndarray:
    """Raw momentum score per session and asset (NaN where history is short).
    r(L, skip)_t = C[t-skip] / C[t-L] - 1, using closes up to t only."""
    T = C.shape[0]

    def r(L, skip=0):
        out = np.full_like(C, np.nan)
        if T > L:
            out[L:] = C[L - skip:T - skip] / C[:T - L] - 1.0
        return out

    if kind in LOOKBACKS:
        return r(LOOKBACKS[kind])
    if kind == "12-1":
        return r(252, 21)
    if kind == "blend":
        return (r(21) + r(63) + r(126) + r(252)) / 4.0
    if kind == "adm":      # accelerating dual momentum: 1 + 3 + 6 month returns
        return r(21) + r(63) + r(126)
    raise ValueError(kind)


def realized_vol(C: np.ndarray, n: int = 63) -> np.ndarray:
    lr = np.full_like(C, np.nan)
    lr[1:] = np.log(C[1:] / C[:-1])
    df = pd.DataFrame(lr)
    return (df.rolling(n, min_periods=int(n * 0.8)).std() * math.sqrt(252)).values


def sma(C: np.ndarray, n: int = 200) -> np.ndarray:
    return pd.DataFrame(C).rolling(n, min_periods=n).mean().values


def decision_rows(idx: pd.DatetimeIndex, cadence: str) -> np.ndarray:
    """Positions of decision sessions: last session of each week (W) or month (M)."""
    s = pd.Series(np.arange(len(idx)), index=idx)
    if cadence == "W":
        key = idx.to_period("W-FRI")
    elif cadence == "M":
        key = idx.to_period("M")
    else:
        raise ValueError(cadence)
    return s.groupby(key).max().values


# ============================================================================ engine
def targets_for(panel: Panel, universe, lookback: str, k: int, filt: str, voladj: bool,
                cadence: str, safe: str = "CASH", eligible_from: dict | None = None,
                cache: dict | None = None):
    """Target lists at each decision row. Returns (rows, list-of-tuples)."""
    cols = panel.sub(universe)
    key = ("sc", tuple(universe), lookback)
    if cache is not None and key in cache:
        S = cache[key]
    else:
        S = momentum_scores(panel.C[:, cols], lookback)
        if cache is not None:
            cache[key] = S
    cash_i = panel.col["CASH"]
    cash_score = momentum_scores(panel.C[:, [cash_i]], lookback)[:, 0]
    if voladj:
        vkey = ("vol", tuple(universe))
        if cache is not None and vkey in cache:
            V = cache[vkey]
        else:
            V = realized_vol(panel.C[:, cols])
            if cache is not None:
                cache[vkey] = V
        R = S / V
    else:
        R = S
    rows = decision_rows(panel.idx, cadence)
    if filt in ("sma",):
        skey = ("sma", tuple(universe))
        if cache is not None and skey in cache:
            M = cache[skey]
        else:
            M = sma(panel.C[:, cols])
            if cache is not None:
                cache[skey] = M
    if filt in ("mkt", "mkt_abs"):
        b = panel.col[panel.bench]
        bm = sma(panel.C[:, [b]])[:, 0]
        bs = momentum_scores(panel.C[:, [b]], lookback)[:, 0]
    elig_mask = np.ones((len(panel.idx), len(cols)), bool)
    if eligible_from:
        for j, n in enumerate(universe):
            if n in eligible_from:
                elig_mask[:, j] = panel.idx >= pd.Timestamp(eligible_from[n])
    out_rows, out_t = [], []
    for t in rows:
        sc = R[t].copy()
        ok = np.isfinite(sc) & elig_mask[t] & np.isfinite(panel.C[t, cols])
        if ok.sum() < min(2, len(cols)):
            continue
        sc[~ok] = -np.inf
        order = np.argsort(-sc)[:k]
        chosen = [universe[j] for j in order if np.isfinite(sc[j])]
        if filt == "none":
            tgt = chosen
        elif filt == "abs":        # own raw score must beat T-bills over the same window
            tgt = [c if S[t, universe.index(c)] > cash_score[t] else safe for c in chosen]
        elif filt == "abs0":       # own raw score > 0 (accelerating dual momentum)
            tgt = [c if S[t, universe.index(c)] > 0 else safe for c in chosen]
        elif filt == "sma":        # own close above its 200-session average
            tgt = [c if panel.C[t, cols[universe.index(c)]] > M[t, universe.index(c)] else safe
                   for c in chosen]
        elif filt == "mkt":        # benchmark (SPY) above its 200-session average, else all safe
            tgt = chosen if panel.C[t, panel.col[panel.bench]] > bm[t] else [safe] * len(chosen)
        elif filt == "mkt_abs":    # GEM: benchmark's own momentum beats T-bills, else all safe
            tgt = chosen if bs[t] > cash_score[t] else [safe] * len(chosen)
        else:
            raise ValueError(filt)
        out_rows.append(t)
        out_t.append(tuple(tgt))
    return np.array(out_rows, int), out_t


def run_engine(panel: Panel, rows, tlists, k: int, mode: str = "open", start_row: int | None = None,
               record_values: bool = False, tax: dict | None = None):
    """Simulate the swap-only book. Returns dict with daily equity (Series), trade log stats."""
    T, N = panel.C.shape
    C = panel.C
    E = panel.O if mode == "open" else panel.C
    cash_i = panel.col["CASH"]
    costs = np.array([cost_of(n) / 1e4 for n in panel.names])
    # execution rows: t+1 for each decision where the target differs from the current holdings
    eq = np.full(T, np.nan)
    vals = {}                   # asset index -> value at last mark
    mark = {}                   # asset index -> price at last mark
    basis, entry_day = {}, {}
    last_row = None
    orders_log, exec_rows, turnover = [], [], []
    realized = {}               # year -> [st, lt]
    carry = 0.0
    cur_set = None
    vals_hist = [] if record_values else None
    if start_row is None:
        start_row = rows[0] + 1 if len(rows) else T

    def mark_to(day, use_E):
        # revalue every position to price at `day` (E if use_E else C)
        P = E if use_E else C
        tot = 0.0
        for i in list(vals):
            p = P[day, i]
            if not np.isfinite(p):
                p = C[day - 1, i] if np.isfinite(C[day - 1, i]) else mark[i]
            vals[i] = vals[i] * p / mark[i]
            mark[i] = p
            tot += vals[i]
        return tot

    # map decision rows to execution rows
    ex_map = {}
    for r, tl in zip(rows, tlists):
        if r + 1 < T:
            ex_map[r + 1] = tl
    ex_days = sorted(d for d in ex_map if d >= start_row)
    if not ex_days:
        return None
    first = ex_days[0]
    # start fully in cash at the close of the day before the first execution
    vals[cash_i] = 1.0
    mark[cash_i] = C[first - 1, cash_i]
    eq[first - 1] = 1.0
    ex_set = set(ex_days)
    tax_year = panel.idx[first].year
    for day in range(first, T):
        yr = panel.idx[day].year
        if tax is not None and yr != tax_year:
            # pay last year's tax from the book (proportional withdrawal, no orders)
            st, lt = realized.get(tax_year, [0.0, 0.0])
            net = st + lt + carry
            due = 0.0
            if net > 0:
                # losses offset gains; tax ST part at ST rate, rest at LT rate
                st_net = max(min(st + carry, net), 0.0)
                lt_net = max(net - st_net, 0.0)
                due = st_net * tax["st"] + lt_net * tax["lt"]
                carry = 0.0
            else:
                carry = net
            if due > 0:
                tot = sum(vals.values())
                f = max(1 - due / tot, 0.0)
                for i in vals:
                    vals[i] *= f
                    if i in basis:
                        basis[i] *= f
            tax_year = yr
        if day in ex_set:
            tl = ex_map[day]
            new_assets = [panel.col[n] for n in tl]
            ncash_slots = sum(1 for a in new_assets if a == cash_i)
            new_set = set(a for a in new_assets if a != cash_i)
            old_set = set(a for a in vals if a != cash_i and vals[a] > 0)
            if new_set != old_set or cur_set is None:
                tot = mark_to(day, True)
                sells = old_set - new_set
                buys = new_set - old_set
                traded = 0.0
                n_orders = 0
                for i in sells:
                    v = vals.pop(i)
                    proceeds = v * (1 - costs[i])
                    traded += v
                    n_orders += 1
                    if tax is not None and i in basis:
                        g = proceeds - basis.pop(i)
                        held = (panel.idx[day] - entry_day.pop(i)).days
                        rec = realized.setdefault(yr, [0.0, 0.0])
                        rec[0 if held < 365 else 1] += g
                    mark.pop(i, None)
                    vals[cash_i] = vals.get(cash_i, 0.0) + proceeds
                    if cash_i not in mark:
                        mark[cash_i] = E[day, cash_i]
                if buys:
                    cash_av = vals.get(cash_i, 0.0)
                    if ncash_slots > 0:
                        each = min(tot / k, cash_av / len(buys))
                    else:
                        each = cash_av / len(buys)
                    for i in buys:
                        p = E[day, i]
                        if not np.isfinite(p):
                            p = C[day - 1, i]
                        vals[i] = each * (1 - costs[i])
                        mark[i] = p
                        traded += each
                        n_orders += 1
                        if tax is not None:
                            basis[i] = each
                            entry_day[i] = panel.idx[day]
                    vals[cash_i] = cash_av - each * len(buys)
                    if vals[cash_i] < 1e-12:
                        vals.pop(cash_i, None)
                        mark.pop(cash_i, None)
                if n_orders:
                    orders_log.append(n_orders)
                    exec_rows.append(day)
                    turnover.append(traded / max(tot, 1e-12))
                cur_set = new_set
        # close of day
        tot = mark_to(day, False)
        eq[day] = tot
        if record_values:
            vals_hist.append((day, {panel.names[i]: v for i, v in vals.items()}))
    s = pd.Series(eq, index=panel.idx).dropna()
    out = dict(equity=s, exec_rows=np.array(exec_rows, int), orders=np.array(orders_log, int),
               turnover=np.array(turnover, float))
    if record_values:
        out["values"] = vals_hist
    if tax is not None:
        out["realized"] = realized
    return out


# ============================================================================ statistics
def cagr_of(eq: pd.Series) -> float:
    if len(eq) < 2 or eq.iloc[0] <= 0:
        return float("nan")
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    return float((eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1) if eq.iloc[-1] > 0 else -1.0


def maxdd(eq: pd.Series) -> float:
    return float((eq / eq.cummax() - 1).min())


def slice_eq(eq: pd.Series, a, b) -> pd.Series:
    """Equity from the close before `a` to the last close <= b (so the first day's return counts)."""
    a, b = pd.Timestamp(a), pd.Timestamp(b)
    before = eq.loc[:a - pd.Timedelta(days=1)]
    x = eq.loc[a:b]
    if len(before):
        x = pd.concat([before.iloc[[-1]], x])
    return x


def calendar_years(eq: pd.Series) -> pd.Series:
    ye = eq.groupby(eq.index.year).last()
    first_year = eq.index[0].year
    r = ye.pct_change()
    r.loc[first_year] = ye.loc[first_year] / eq.iloc[0] - 1
    return r


def rolling_win_share(eq: pd.Series, bench: pd.Series, years: int = 5) -> tuple[float, float, int]:
    """Share of rolling `years` windows (month-end starts) in which the strategy's CAGR beat the
    benchmark's; also the median CAGR gap. Windows lie wholly inside the given series."""
    m = eq.resample("ME").last()
    bm = bench.reindex(eq.index).ffill().resample("ME").last()
    n = years * 12
    if len(m) <= n:
        return float("nan"), float("nan"), 0
    a = (m.shift(-n) / m) ** (1 / years) - 1
    b = (bm.shift(-n) / bm) ** (1 / years) - 1
    d = (a - b).dropna()
    return float((d > 0).mean()), float(d.median()), int(len(d))


def period_stats(eq: pd.Series, bench: pd.Series, rf: pd.Series, a, b, prefix: str) -> dict:
    x = slice_eq(eq, a, b)
    bx = slice_eq(bench.reindex(eq.index).ffill(), a, b)
    if len(x) < 60:
        return {}
    r = x.pct_change().dropna()
    rfx = rf.reindex(r.index).fillna(0.0)
    ex = r - rfx
    sr = ex.mean() / ex.std() * math.sqrt(252) if ex.std() > 0 else float("nan")
    rb = bx.pct_change().dropna()
    act = (r - rb.reindex(r.index).fillna(0.0))
    ir = act.mean() / act.std() * math.sqrt(252) if act.std() > 0 else float("nan")
    cy = calendar_years(x)
    full = cy[[y for y in cy.index if y > x.index[0].year or x.index[0].month == 1 and x.index[0].day <= 5]]
    cyb = calendar_years(bx)
    c, cb = cagr_of(x), cagr_of(bx)
    win5, med5, n5 = rolling_win_share(x, bx, 5)
    return {f"{prefix}_cagr": c, f"{prefix}_spy_cagr": cb, f"{prefix}_excess": c - cb,
            f"{prefix}_vol": float(r.std() * math.sqrt(252)), f"{prefix}_sharpe": sr, f"{prefix}_ir": ir,
            f"{prefix}_maxdd": maxdd(x), f"{prefix}_spy_maxdd": maxdd(bx),
            f"{prefix}_worst_year": float(full.min()) if len(full) else float("nan"),
            f"{prefix}_years_beat_spy": float((cy - cyb.reindex(cy.index)).gt(0).mean()),
            f"{prefix}_win5y": win5, f"{prefix}_med5y_gap": med5, f"{prefix}_n5y": n5}


def activity_stats(res: dict, a, b, idx: pd.DatetimeIndex, prefix: str) -> dict:
    a, b = pd.Timestamp(a), pd.Timestamp(b)
    er = res["exec_rows"]
    if len(er) == 0:
        return {f"{prefix}_recs_yr": 0.0, f"{prefix}_orders_yr": 0.0, f"{prefix}_turnover_yr": 0.0,
                f"{prefix}_max_orders": 0, f"{prefix}_share_gt3": 0.0}
    d = idx[er]
    m = (d >= a) & (d <= b)
    yrs = max((min(b, idx[-1]) - a).days / 365.25, 1e-9)
    o = res["orders"][m]
    return {f"{prefix}_recs_yr": float(m.sum() / yrs), f"{prefix}_orders_yr": float(o.sum() / yrs),
            f"{prefix}_turnover_yr": float(res["turnover"][m].sum() / 2 / yrs),
            f"{prefix}_max_orders": int(o.max()) if len(o) else 0,
            f"{prefix}_share_gt3": float((o > 3).mean()) if len(o) else 0.0}


# ============================================================================ multiple testing
EULER_GAMMA = 0.5772156649015329


def expected_max_z(N: int) -> float:
    from scipy.stats import norm
    if N <= 1:
        return 0.0
    return (1 - EULER_GAMMA) * norm.ppf(1 - 1.0 / N) + EULER_GAMMA * norm.ppf(1 - 1.0 / (N * math.e))


def deflated_sharpe(sr_per: float, n: int, skew: float, kurt: float, N: int, var_sr_per: float | None = None) -> float:
    """Bailey & Lopez de Prado (2014). sr_per is the per-period Sharpe of the chosen strategy,
    n the number of periods, N the number of trials, var_sr_per the cross-trial variance of the
    per-period Sharpe (None -> the null dispersion 1/(n-1))."""
    from scipy.stats import norm
    if n < 3 or not np.isfinite(sr_per):
        return float("nan")
    sd0 = math.sqrt(var_sr_per) if var_sr_per is not None else 1 / math.sqrt(n - 1)
    sr0 = sd0 * expected_max_z(N)
    den = 1 - skew * sr_per + (kurt - 1) / 4.0 * sr_per ** 2
    return float(norm.cdf((sr_per - sr0) * math.sqrt(n - 1) / math.sqrt(max(den, 1e-9))))


def stationary_bootstrap_idx(n: int, mean_block: float, rng: np.random.Generator) -> np.ndarray:
    p = 1.0 / mean_block
    idx = np.empty(n, int)
    idx[0] = rng.integers(n)
    starts = rng.random(n) < p
    rnd = rng.integers(0, n, n)
    for t in range(1, n):
        idx[t] = rnd[t] if starts[t] else (idx[t - 1] + 1) % n
    return idx


def whites_reality_check(D: np.ndarray, B: int = 2000, mean_block: float = 8.0, hurdle: float = 0.0,
                         seed: int = 27) -> dict:
    """White (2000) reality check and Hansen (2005) studentized SPA (consistent version).
    D: (n periods x K strategies) per-period active returns; `hurdle` is subtracted per period.
    H0: every strategy's expected active return <= hurdle. Stationary bootstrap (Politis-Romano)."""
    rng = np.random.default_rng(seed)
    D = np.asarray(D, float) - hurdle
    n, K = D.shape
    mu = D.mean(0)
    sd = D.std(0, ddof=1)
    sd = np.where(sd > 0, sd, np.nan)
    V = math.sqrt(n) * mu.max()
    t = math.sqrt(n) * mu / sd
    T_spa = max(np.nanmax(t), 0.0)
    A = sd * math.sqrt(2 * math.log(math.log(n)) / n)
    g = np.where(mu >= -A, mu, 0.0)
    c_rc = c_spa = 0
    for _ in range(B):
        ii = stationary_bootstrap_idx(n, mean_block, rng)
        mb = D[ii].mean(0)
        c_rc += math.sqrt(n) * (mb - mu).max() >= V
        z = math.sqrt(n) * (mb - g) / sd
        c_spa += max(np.nanmax(z), 0.0) >= T_spa
    return dict(n=n, K=K, best_mean=float(mu.max()), best_k=int(mu.argmax()),
                p_rc=c_rc / B, p_spa=c_spa / B)


def select_is(reg: pd.DataFrame, universe: str, by: str = "is_sharpe") -> pd.Series:
    """Pre-registered design-period choice: the grid variant with the highest design-period Sharpe
    (ties: higher design CAGR). Uses no test-period column."""
    d = reg[(reg["universe"] == universe) & (reg["rule"] == "grid")].dropna(subset=[by])
    return d.sort_values([by, "is_cagr"], ascending=False).iloc[0]


def save(df: pd.DataFrame, name: str, index: bool = False):
    """Small CSV into results/; tables over 200 kB are gzipped (results/ must stay under 1 MB)."""
    p = RESULTS / name
    df.to_csv(p, index=index, float_format="%.5g")
    if p.stat().st_size > 200_000:
        pz = RESULTS / (name + ".gz")
        df.to_csv(pz, index=index, float_format="%.5g", compression="gzip")
        p.unlink()
        return pz
    return p
