"""Track 33 (strategy zoo): data loading.

Every series is downloaded once and cached under CACHE (env ZOO_CACHE), so a rerun is
offline and reproducible.  Sources (all public):
  * Yahoo Finance via yfinance: ^GSPC, ^SP500TR, ^NDX, QQQ, sector SPDRs, SMH, IWM, EFA, EEM,
    TLT, IEF, GLD, ^VIX, ^VIX3M, ^VXN, BTC-USD (only to back-fill BTC before Coinbase's first candle).
  * Coinbase Exchange public daily candles (BTC-USD, ETH-USD, LTC-USD, SOL-USD), parsed with
    traderec.data.providers.parse_coinbase_candles.
  * Kenneth French data library (daily RF = 1-month T-bill), via research/code/02-academic/kf_utils.py.
  * FRED DTB3 (3-month T-bill) after the last Kenneth French observation.
  * Robert Shiller's ie_data.xls (monthly S&P dividend yield) for S&P total return before 1988.

Conventions
  * The master calendar is the NYSE trading days of ^GSPC (1927-12-30 onward).
  * `base[u]` is a gross total-return level for each underlying (fund fee added back for ETFs), so
    that a 1x holding = base - fee and a leveraged fund = the track-04 formula applied to base.
  * Crypto closes are UTC-day closes (about 8 pm New York); weekend moves fold into Monday.
"""
from __future__ import annotations

import json
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
REPO = HERE.parents[2]
CACHE = Path(os.environ.get(
    "ZOO_CACHE", "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/33-zoo/cache"))
CACHE.mkdir(parents=True, exist_ok=True)
END = os.environ.get("ZOO_END", "2026-09-25")          # last settled Friday close used by the study

sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "research" / "code" / "02-academic"))
os.environ.setdefault("KF_DATA_DIR", str(CACHE / "kf"))

# Annual fund fees added back to ETF adjusted closes to get the gross index return.
ETF_FEE = {"QQQ": 0.0020, "XLB": 0.0009, "XLE": 0.0009, "XLF": 0.0009, "XLI": 0.0009, "XLK": 0.0009,
           "XLP": 0.0009, "XLU": 0.0009, "XLV": 0.0009, "XLY": 0.0009, "XLRE": 0.0009, "XLC": 0.0009,
           "SMH": 0.0035, "IWM": 0.0019, "EFA": 0.0033, "EEM": 0.0070, "TLT": 0.0015, "IEF": 0.0015,
           "GLD": 0.0040}
SECTORS = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY", "XLRE", "XLC"]
CRYPTO = ["BTC", "ETH", "LTC", "SOL"]


# --------------------------------------------------------------------------- raw loaders
def yf_frame(ticker: str) -> pd.DataFrame:
    safe = ticker.replace("^", "IDX_").replace("=", "_")
    p = CACHE / f"yf_{safe}.csv"
    if not p.exists():
        import yfinance as yf
        df = None
        for _ in range(4):
            try:
                df = yf.download(ticker, start="1920-01-01", end="2026-09-30", progress=False,
                                 auto_adjust=False, threads=False)
                if df is not None and len(df):
                    break
            except Exception:  # noqa: BLE001 - network flakiness
                time.sleep(3)
        if df is None or not len(df):
            raise RuntimeError(f"no Yahoo data for {ticker}")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.to_csv(p)
    df = pd.read_csv(p, index_col=0, parse_dates=True)
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    df = df[~df.index.duplicated()].sort_index()
    return df.loc[:END]


def yf_close(ticker: str, field: str = "Adj Close") -> pd.Series:
    df = yf_frame(ticker)
    col = field if field in df.columns else "Close"
    return pd.to_numeric(df[col], errors="coerce").dropna().rename(ticker)


def coinbase_daily(product: str) -> pd.Series:
    """Daily UTC closes for a Coinbase Exchange product, paging back 300 candles at a time."""
    from traderec.data.providers import parse_coinbase_candles
    p = CACHE / f"coinbase_{product}.json"
    if not p.exists():
        rows, end = [], pd.Timestamp("2026-09-29")
        url = f"https://api.exchange.coinbase.com/products/{product}/candles"
        for _ in range(60):
            start = end - pd.Timedelta(days=299)
            page = None
            for _try in range(5):
                try:
                    r = requests.get(url, params={"granularity": 86400, "start": start.strftime("%Y-%m-%dT00:00:00Z"),
                                                  "end": end.strftime("%Y-%m-%dT00:00:00Z")}, timeout=30)
                    if r.status_code == 429:
                        time.sleep(2)
                        continue
                    r.raise_for_status()
                    page = r.json()
                    break
                except Exception:  # noqa: BLE001
                    time.sleep(2)
            if not page:
                break
            rows.extend(page)
            end = start - pd.Timedelta(days=1)
            time.sleep(0.25)
        p.write_text(json.dumps(rows))
    s = parse_coinbase_candles(json.loads(p.read_text()))
    s.index = pd.to_datetime(s.index).normalize()
    s = s[~s.index.duplicated()].sort_index()
    return s.loc[:END].rename(product)


def fred(series_id: str) -> pd.Series:
    p = CACHE / f"fred_{series_id}.csv"
    if not p.exists():
        r = requests.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}", timeout=60)
        r.raise_for_status()
        p.write_text(r.text)
    df = pd.read_csv(p)
    s = pd.to_numeric(df.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(df.iloc[:, 0])
    return s.dropna().loc[:END]


def shiller_div_yield() -> pd.Series:
    p = CACHE / "shiller_ie_data.xls"
    if not p.exists():
        r = requests.get("http://www.econ.yale.edu/~shiller/data/ie_data.xls", timeout=120)
        r.raise_for_status()
        p.write_bytes(r.content)
    x = pd.read_excel(p, sheet_name="Data", header=7)
    x = x[["Date", "P", "D"]].dropna()
    x = x[pd.to_numeric(x.Date, errors="coerce").notna()]
    yr = x.Date.astype(float).astype(int)
    mo = ((x.Date.astype(float) - yr) * 100).round().astype(int)
    idx = pd.to_datetime(dict(year=yr, month=mo, day=1))
    return pd.Series((x.D.astype(float) / x.P.astype(float)).values, index=idx).sort_index()


def kf_rf_daily() -> pd.Series:
    import kf_utils
    df = kf_utils.daily_returns("F-F_Research_Data_Factors_daily")
    return df["RF"].astype(float)


# --------------------------------------------------------------------------- panel
def _accrual(dates: pd.DatetimeIndex) -> np.ndarray:
    """Calendar days between consecutive dates / 365 (first entry: 1/365)."""
    d = np.diff(dates.values).astype("timedelta64[D]").astype(float)
    return np.concatenate([[1.0], d]) / 365.0


def build_panel() -> dict:
    """All inputs on the NYSE calendar.  Returns a dict of DataFrames / Series."""
    p = CACHE / "panel.pkl"
    if p.exists():
        return pd.read_pickle(p)

    gspc = yf_close("^GSPC", "Close")
    cal = gspc.index
    acc = pd.Series(_accrual(cal), index=cal)

    # T-bill: Kenneth French daily RF (1-month bill) x 252, then FRED DTB3 after its last date.
    rf = kf_rf_daily() * 252.0
    dtb3 = fred("DTB3") / 100.0
    tb = pd.concat([rf, dtb3.loc[rf.index[-1] + pd.Timedelta(days=1):]]).sort_index()
    tb = tb[~tb.index.duplicated()]
    tb = tb.reindex(cal.union(tb.index)).ffill().reindex(cal).bfill()

    # S&P 500 total return: price + Shiller dividend yield before 1988, ^SP500TR after.
    dy = shiller_div_yield()
    dy = dy.reindex(cal.union(dy.index)).ffill().reindex(cal)
    r_spx = gspc.pct_change() + dy.shift(1) * acc
    sptr = yf_close("^SP500TR", "Close")
    rm = sptr.pct_change().dropna()
    r_spx.loc[rm.index[0]:] = rm.reindex(r_spx.loc[rm.index[0]:].index)
    r_spx.iloc[0] = 0.0

    base = {"SPX": r_spx}
    # Nasdaq-100: ^NDX price + 0.5%/yr dividends before QQQ, QQQ adj. close (+ fee added back) after.
    ndx = yf_close("^NDX", "Close")
    r_ndx = ndx.pct_change().reindex(cal) + 0.005 * acc
    qqq = yf_close("QQQ").pct_change().dropna()
    cut = qqq.index[0]
    r_ndx.loc[cut:] = (qqq + ETF_FEE["QQQ"] / 252.0).reindex(r_ndx.loc[cut:].index)
    r_ndx.loc[:ndx.index[0]] = np.nan
    base["NDX"] = r_ndx
    for t in SECTORS + ["SMH", "IWM", "EFA", "EEM", "TLT", "IEF", "GLD"]:
        s = yf_close(t)
        r = s.pct_change().reindex(cal)
        r = r + ETF_FEE[t] * acc.where(r.notna())
        r.loc[:s.index[0]] = np.nan
        base[t] = r

    # Crypto (native 7-day UTC calendar, then sampled on NYSE dates).
    crypto_native = {}
    btc_cb = coinbase_daily("BTC-USD")
    btc_yf = yf_close("BTC-USD", "Close")
    btc_yf.index = btc_yf.index.normalize()
    btc = btc_cb.copy()
    early = btc_yf.loc[:btc_cb.index[0] - pd.Timedelta(days=1)]
    if len(early):
        btc = pd.concat([early * (btc_cb.iloc[0] / btc_yf.reindex([btc_cb.index[0]]).iloc[0]), btc_cb])
    crypto_native["BTC"] = btc
    for c in ["ETH", "LTC", "SOL"]:
        crypto_native[c] = coinbase_daily(f"{c}-USD")
    for c, s in crypto_native.items():
        s = s[s > 0]
        s = s.asfreq("D").ffill()
        crypto_native[c] = s
        lvl = s.reindex(cal)
        r = lvl.pct_change()
        r.loc[:s.index[0]] = np.nan
        base[c] = r

    base = pd.DataFrame(base).loc[:END]
    tb = tb.loc[:END]
    vix = yf_close("^VIX", "Close").reindex(cal).ffill().loc[:END]
    vix.loc[:yf_close("^VIX", "Close").index[0] - pd.Timedelta(days=1)] = np.nan
    vix3m = yf_close("^VIX3M", "Close").reindex(cal).loc[:END]
    vix3m = vix3m.where(vix3m.index >= vix3m.first_valid_index()).ffill()
    vxn = yf_close("^VXN", "Close").reindex(cal).loc[:END]
    vxn = vxn.where(vxn.index >= vxn.first_valid_index()).ffill()
    price = pd.DataFrame({"SPX": gspc, "NDX": ndx.reindex(cal)}).loc[:END]
    panel = dict(base=base, tb=tb, vix=vix, vix3m=vix3m, vxn=vxn, price=price,
                 crypto_native={k: v.loc[:END] for k, v in crypto_native.items()})
    pd.to_pickle(panel, p)
    return panel


if __name__ == "__main__":
    pnl = build_panel()
    b = pnl["base"]
    for c in b.columns:
        s = b[c].dropna()
        print(f"{c:5s} {s.index[0].date()} {s.index[-1].date()} n={len(s)} "
              f"cagr={(1 + s).prod() ** (365.25 / (s.index[-1] - s.index[0]).days) - 1:.3f}")
    print("tb", pnl["tb"].iloc[[0, -1]].round(4).to_dict())
