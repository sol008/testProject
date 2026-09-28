"""Data acquisition + caching for track 06 (few-trade backtests).

All raw downloads are cached in the scratchpad (CACHE_DIR) so the analysis is
reproducible without re-downloading.  Nothing large is written into the repo.

Sources (all public):
  * Yahoo Finance via yfinance (indices, ETFs, futures, BTC-USD)
  * FRED CSV endpoint (rates, credit spreads, VIX/VXO, Nikkei 225 daily since 1949)
  * Robert Shiller, ie_data.xls (monthly S&P composite price, dividend, earnings, CPI, CAPE, since 1871)
  * Ken French data library (daily/monthly risk-free rate since 1926, developed ex-US market returns)
  * Coin Metrics community API (BTC PriceUSD daily since 2010-07-18)
"""
from __future__ import annotations

import io
import json
import os
import time
import zipfile

import numpy as np
import pandas as pd
import requests

CACHE_DIR = os.environ.get(
    "BT06_CACHE",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/06-backtests/cache",
)
os.makedirs(CACHE_DIR, exist_ok=True)

TODAY = pd.Timestamp("2026-09-28")


def _cache(name: str) -> str:
    return os.path.join(CACHE_DIR, name)


def _get(url: str, timeout: int = 90, retries: int = 3) -> bytes:
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0 research-bot"})
            r.raise_for_status()
            return r.content
        except Exception as e:  # pragma: no cover - network
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"download failed {url}: {last}")


# ----------------------------------------------------------------------------- yfinance
def yf_hist(ticker: str, start: str = "1900-01-01", refresh: bool = False) -> pd.DataFrame:
    """Daily OHLC + Adj Close for a ticker, cached. Index is tz-naive dates."""
    fn = _cache(f"yf_{ticker.replace('^', 'IDX_').replace('=', '_').replace('/', '_')}.csv")
    if os.path.exists(fn) and not refresh:
        df = pd.read_csv(fn, index_col=0, parse_dates=True)
        return df
    import yfinance as yf

    df = yf.download(ticker, start=start, progress=False, auto_adjust=False, threads=False)
    if df is None or len(df) == 0:
        raise RuntimeError(f"no data for {ticker}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df.to_csv(fn)
    return df


def yf_close(ticker: str, adj: bool = False, **kw) -> pd.Series:
    df = yf_hist(ticker, **kw)
    col = "Adj Close" if adj and "Adj Close" in df.columns else "Close"
    s = df[col].astype(float).dropna()
    s = s[s > 0]
    s.name = ticker
    return s


# ----------------------------------------------------------------------------- FRED
def fred(series_id: str, refresh: bool = False) -> pd.Series:
    fn = _cache(f"fred_{series_id}.csv")
    if not os.path.exists(fn) or refresh:
        raw = _get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}")
        with open(fn, "wb") as f:
            f.write(raw)
    df = pd.read_csv(fn)
    df.columns = ["date", series_id]
    df["date"] = pd.to_datetime(df["date"])
    s = pd.to_numeric(df[series_id], errors="coerce")
    s.index = df["date"]
    return s.dropna()


# ----------------------------------------------------------------------------- Shiller
def shiller(refresh: bool = False) -> pd.DataFrame:
    """Monthly Shiller data. Columns: P, D, E, CPI, GS10, CAPE, TR_CAPE (if present), plus
    derived real total return index. Index = month-start timestamp."""
    fn = _cache("shiller_ie_data.xls")
    if not os.path.exists(fn) or refresh:
        raw = _get("http://www.econ.yale.edu/~shiller/data/ie_data.xls")
        with open(fn, "wb") as f:
            f.write(raw)
    x = pd.read_excel(fn, sheet_name="Data", header=None, engine="xlrd")
    # find header row (contains 'Date')
    hdr_row = None
    for i in range(20):
        row = [str(v).strip() for v in x.iloc[i].tolist()]
        if "Date" in row and "P" in row:
            hdr_row = i
            break
    if hdr_row is None:
        raise RuntimeError("Shiller header not found")
    cols = [str(v).strip() for v in x.iloc[hdr_row].tolist()]
    body = x.iloc[hdr_row + 1 :].copy()
    body.columns = cols
    body = body[pd.to_numeric(body["Date"], errors="coerce").notna()].copy()
    d = pd.to_numeric(body["Date"]).astype(float)
    year = np.floor(d).astype(int)
    # Shiller encodes months as .01 ... .12 (so 1871.1 == October)
    month = np.round((d - year) * 100).astype(int)
    month = month.where(month > 0, 1)
    idx = pd.to_datetime(dict(year=year, month=month, day=1))
    out = pd.DataFrame(index=idx)
    out["P"] = pd.to_numeric(body["P"], errors="coerce").values
    out["D"] = pd.to_numeric(body["D"], errors="coerce").values
    out["E"] = pd.to_numeric(body["E"], errors="coerce").values
    out["CPI"] = pd.to_numeric(body["CPI"], errors="coerce").values
    gs = [c for c in cols if c.startswith("Rate GS10") or c == "GS10"]
    out["GS10"] = pd.to_numeric(body[gs[0]], errors="coerce").values if gs else np.nan
    cape_cols = [c for c in cols if c.upper().startswith("CAPE")]
    if cape_cols:
        out["CAPE"] = pd.to_numeric(body[cape_cols[0]], errors="coerce").values
    # TR CAPE column is labelled 'TR CAPE' in recent files
    trc = [c for c in cols if c.replace(" ", "").upper() == "TRCAPE"]
    if trc:
        out["TR_CAPE"] = pd.to_numeric(body[trc[0]], errors="coerce").values
    out = out[~out.index.duplicated(keep="first")].sort_index()
    return out


# ----------------------------------------------------------------------------- Ken French
def ff_factors(freq: str = "daily", refresh: bool = False) -> pd.DataFrame:
    """US Fama-French 3 factors (Mkt-RF, SMB, HML, RF) in decimal returns."""
    name = "F-F_Research_Data_Factors_daily_CSV.zip" if freq == "daily" else "F-F_Research_Data_Factors_CSV.zip"
    fn = _cache(name)
    if not os.path.exists(fn) or refresh:
        raw = _get("https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/" + name)
        with open(fn, "wb") as f:
            f.write(raw)
    z = zipfile.ZipFile(fn)
    txt = z.read(z.namelist()[0]).decode("latin-1")
    lines = txt.splitlines()
    rows = []
    for ln in lines:
        parts = [p.strip() for p in ln.split(",")]
        if len(parts) >= 5 and parts[0].isdigit() and len(parts[0]) in (6, 8):
            rows.append(parts[:5])
        elif rows and (len(parts) < 5 or not parts[0].isdigit()):
            # monthly file has an annual block after the monthly block; stop at first break
            if freq != "daily":
                break
    df = pd.DataFrame(rows, columns=["date", "MktRF", "SMB", "HML", "RF"])
    if freq == "daily":
        df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")
    else:
        df["date"] = pd.to_datetime(df["date"], format="%Y%m") + pd.offsets.MonthEnd(0)
    df = df.set_index("date").astype(float) / 100.0
    return df


def ff_developed_ex_us_monthly(refresh: bool = False) -> pd.DataFrame:
    name = "Developed_ex_US_3_Factors_CSV.zip"
    fn = _cache(name)
    if not os.path.exists(fn) or refresh:
        raw = _get("https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/" + name)
        with open(fn, "wb") as f:
            f.write(raw)
    z = zipfile.ZipFile(fn)
    txt = z.read(z.namelist()[0]).decode("latin-1")
    rows = []
    for ln in txt.splitlines():
        parts = [p.strip() for p in ln.split(",")]
        if len(parts) >= 5 and parts[0].isdigit() and len(parts[0]) == 6:
            rows.append(parts[:5])
        elif rows and (len(parts) < 5 or not parts[0].isdigit()):
            break
    df = pd.DataFrame(rows, columns=["date", "MktRF", "SMB", "HML", "RF"])
    df["date"] = pd.to_datetime(df["date"], format="%Y%m") + pd.offsets.MonthEnd(0)
    return df.set_index("date").astype(float) / 100.0


# ----------------------------------------------------------------------------- Bitcoin
def btc_daily(refresh: bool = False) -> pd.Series:
    """Longest free daily BTC-USD series: Coin Metrics community PriceUSD (2010-07-18 onward),
    spliced with yfinance BTC-USD for the most recent days if Coin Metrics lags."""
    fn = _cache("cm_btc.json")
    if not os.path.exists(fn) or refresh:
        url = (
            "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD"
            "&frequency=1d&page_size=10000&start_time=2009-01-01"
        )
        allrows = []
        while url:
            j = json.loads(_get(url))
            allrows += j.get("data", [])
            url = j.get("next_page_url")
        with open(fn, "w") as f:
            json.dump({"data": allrows}, f)
    j = json.load(open(fn))
    s = pd.Series(
        {pd.Timestamp(r["time"][:10]): float(r["PriceUSD"]) for r in j["data"] if r.get("PriceUSD")}
    ).sort_index()
    try:
        y = yf_close("BTC-USD")
        newer = y[y.index > s.index[-1]]
        s = pd.concat([s, newer])
    except Exception:
        pass
    s.name = "BTC"
    return s[s > 0]


# ----------------------------------------------------------------------------- helpers
def daily_rf(refresh: bool = False) -> pd.Series:
    """Daily risk-free *return* (decimal per trading day): Ken French RF (1926-07 onward),
    extended with FRED DTB3 (annualised %, converted to /252) after the French file ends."""
    ff = ff_factors("daily", refresh=refresh)["RF"]
    try:
        dtb3 = fred("DTB3") / 100.0 / 252.0
        ext = dtb3[dtb3.index > ff.index[-1]]
        rf = pd.concat([ff, ext])
    except Exception:
        rf = ff
    rf.name = "rf"
    return rf.sort_index()


def annual_rf_on(dates: pd.DatetimeIndex) -> pd.Series:
    """Annualised risk-free yield (decimal) aligned to arbitrary dates (ffill)."""
    rf = daily_rf() * 252.0
    return rf.reindex(rf.index.union(dates)).ffill().reindex(dates).fillna(0.0)


def sp500_daily_tr() -> pd.DataFrame:
    """Daily S&P 500 (S&P 90 composite before 1957) price and total-return index 1927-12-30 onward.

    Total return before 1988-01-04 = price return + Shiller dividend yield (D/P, trailing 12m dividends)
    accrued evenly across trading days.  From 1988 the official ^SP500TR series is spliced in.
    """
    px = yf_close("^GSPC")
    sh = shiller()
    dy = (sh["D"] / sh["P"]).dropna()
    # month-start stamp -> use the month's yield for every trading day in that month
    dy_d = dy.reindex(dy.index.union(px.index)).ffill().reindex(px.index)
    dy_d = dy_d.ffill().bfill()
    # accrue per trading day based on actual count of trading days per year (~250 older, 252 now)
    ndays = px.groupby(px.index.year).transform("count").astype(float)
    ndays = ndays.clip(lower=240)
    r_px = px.pct_change().fillna(0.0)
    r_tr = r_px + dy_d / ndays
    tr = (1 + r_tr).cumprod() * px.iloc[0]
    # splice official TR from 1988
    try:
        off = yf_close("^SP500TR")
        off = off[off.index >= "1988-01-04"]
        r_off = off.pct_change()
        r_tr2 = r_tr.copy()
        common = r_off.index.intersection(r_tr2.index)
        r_tr2.loc[common[1:]] = r_off.loc[common[1:]].values
        tr = (1 + r_tr2).cumprod() * px.iloc[0]
    except Exception:
        pass
    out = pd.DataFrame({"px": px, "tr": tr})
    return out


def realized_vol(px: pd.Series, window: int = 21) -> pd.Series:
    r = np.log(px).diff()
    return r.rolling(window).std() * np.sqrt(252)


if __name__ == "__main__":
    # warm the cache
    tickers = [
        "^GSPC", "^SP500TR", "^VIX", "^N225", "^IXIC", "^NDX", "^DJI", "^RUT",
        "^FTSE", "^GDAXI", "^FCHI", "^HSI", "^STOXX50E", "^AXJO", "^GSPTSE", "^BVSP", "^MXX",
        "^KS11", "^TWII", "^BSESN", "^STI", "000001.SS", "^AEX", "^SSMI", "^IBEX",
        "SPY", "QQQ", "EFA", "EEM", "TLT", "IEF", "SHY", "AGG", "VEU", "GLD", "DBC", "GSG",
        "EWJ", "EWG", "EWU", "EWZ", "EWH", "EWS", "EWT", "EWY", "EWA", "EWC", "EWW", "EWI", "EWP",
        "EWQ", "EWL", "EWD", "EWN", "EWK", "EWO", "EWM", "FXI", "EZA", "TUR", "THD", "ECH",
        "SSO", "UPRO", "SPXL", "QLD", "TQQQ", "GC=F", "CL=F", "BTC-USD", "ETH-USD",
    ]
    for t in tickers:
        try:
            s = yf_close(t)
            print(f"{t:10s} {s.index[0].date()} -> {s.index[-1].date()} n={len(s)} last={s.iloc[-1]:.2f}")
        except Exception as e:
            print(t, "FAILED", e)
    for sid in ["TB3MS", "DTB3", "DGS3MO", "DGS10", "DGS2", "GS10", "BAMLH0A0HYM2", "T10Y2Y", "T10Y3M",
                "FEDFUNDS", "DFF", "BAA", "AAA", "BAA10Y", "USREC", "CPIAUCSL", "VIXCLS", "VXOCLS",
                "NIKKEI225", "NASDAQCOM", "INTDSRJPM193N", "IRSTCI01JPM156N"]:
        try:
            s = fred(sid)
            print(f"FRED {sid:16s} {s.index[0].date()} -> {s.index[-1].date()} n={len(s)} last={s.iloc[-1]}")
        except Exception as e:
            print("FRED", sid, "FAILED", e)
    sh = shiller()
    print("Shiller", sh.index[0].date(), sh.index[-1].date())
    print(sh.dropna(subset=["P"]).tail(3))
    print(sh.dropna(subset=["CAPE"]).tail(3))
    ff = ff_factors("daily")
    print("FF daily", ff.index[0].date(), ff.index[-1].date())
    ffm = ff_factors("monthly")
    print("FF monthly", ffm.index[0].date(), ffm.index[-1].date())
    dx = ff_developed_ex_us_monthly()
    print("FF devexUS", dx.index[0].date(), dx.index[-1].date())
    b = btc_daily()
    print("BTC", b.index[0].date(), b.index[-1].date(), b.iloc[-1])
    spx = sp500_daily_tr()
    print(spx.tail())
