"""Data layer for track 36 (the century view). All sources are free and public.

Raw downloads are cached in CACHE_DIR (scratchpad by default; override with $CENTURY_CACHE) so
nothing large is written into the repository. Delete the cache to refresh.

Sources
  * Jordà–Schularick–Taylor Macrohistory Database, release 6 (2022), macrohistory.net/database.
    18 countries, 1870–2020, annual: eq_tr, bond_tr, bill_rate, housing_tr (nominal, local currency,
    decimals), xrusd (local currency per USD), cpi. Canada and Ireland carry no return series in R6.
    NOTE: on the site the two download ids are labelled the wrong way round (the ".xlsx" id serves the
    Stata file and vice versa); we try both ids and sniff the zip signature.
  * Gold, monthly USD/oz since 1833: github.com/datasets/gold-prices (monthly averages; LBMA after 1968).
  * FRED: WTI spot (MCOILWTICO, 1986-), Nikkei 225 daily (NIKKEI225, 1949-), Nasdaq Composite daily
    (NASDAQCOM, 1971-), FX (DEXJPUS, DEXCHUS), 3-month bills (TB3MS 1934-), 10-year yield (GS10).
  * Coin Metrics community API: BTC PriceUSD daily since 2010-07-18.
  * Yahoo Finance via yfinance: ETFs (country ETFs 1996-, GLD, DBC, TLT, SPY, IBIT, SOXX...), 000001.SS.
  * Robert Shiller, ie_data.xls (cached copy under ../02-academic/data), monthly S&P since 1871.
"""
from __future__ import annotations

import io
import json
import os
import time

import numpy as np
import pandas as pd
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
os.makedirs(RESULTS, exist_ok=True)
CACHE_DIR = os.environ.get(
    "CENTURY_CACHE",
    "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/36-century/cache",
)
os.makedirs(CACHE_DIR, exist_ok=True)
ASOF = pd.Timestamp("2026-09-28")
HDR = {"User-Agent": "Mozilla/5.0 research-bot"}

JST_IDS = ["9834512569", "9834512469"]  # xlsx and dta ids; labels on the site are swapped, so sniff
JST_URL = "https://www.macrohistory.net/app/download/{id}/JSTdatasetR6.xlsx"
GOLD_URL = "https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv"
CM_URL = ("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD"
          "&frequency=1d&page_size=10000&start_time=2009-01-01")
SHILLER_LOCAL = os.path.join(HERE, "..", "02-academic", "data", "ie_data.xls")
SHILLER_URL = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"


def _cache(name: str) -> str:
    return os.path.join(CACHE_DIR, name)


def _get(url: str, timeout: int = 120, retries: int = 3) -> bytes:
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, timeout=timeout, headers=HDR)
            r.raise_for_status()
            return r.content
        except Exception as e:  # pragma: no cover
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"download failed {url}: {last}")


# ------------------------------------------------------------------ JST
def jst_raw(refresh: bool = False) -> pd.DataFrame:
    """The raw JST R6 panel (one row per country-year)."""
    pk = _cache("jst_r6.pkl")
    if os.path.exists(pk) and not refresh:
        return pd.read_pickle(pk)
    fn = _cache("JSTdatasetR6.xlsx")
    if not os.path.exists(fn) or refresh:
        content = None
        for i in JST_IDS:
            raw = _get(JST_URL.format(id=i))
            if raw[:2] == b"PK":  # zip signature == xlsx
                content = raw
                break
        if content is None:
            raise RuntimeError("JST xlsx not found at either download id")
        with open(fn, "wb") as f:
            f.write(content)
    df = pd.read_excel(fn, sheet_name=0)
    df = df.sort_values(["country", "year"]).reset_index(drop=True)
    df.to_pickle(pk)
    return df


ASSET_COLS = {"eq": "eq_tr", "bond": "bond_tr", "bill": "bill_rate", "housing": "housing_tr"}


def jst_usd_panel(refresh: bool = False) -> pd.DataFrame:
    """Annual nominal USD total returns by country and asset class, 1870–2020.

    USD return = (1 + local return) * xrusd[t-1] / xrusd[t] - 1  (xrusd = local currency per USD).
    Country-years with a currency redenomination that JST does not splice (Germany 1923–24 and 1948)
    are set to NaN: the exchange-rate series jumps by the redenomination factor. Returns a long
    DataFrame: year, country, asset, r_usd, r_loc, fx, infl (US CPI inflation appended as 'us_infl').
    """
    df = jst_raw(refresh)
    rows = []
    for c, g in df.groupby("country"):
        g = g.set_index("year").sort_index()
        fx = g["xrusd"].astype(float)
        fxg = fx.shift(1) / fx  # growth of USD value of one unit of local currency
        for asset, col in ASSET_COLS.items():
            if col not in g or g[col].notna().sum() == 0:
                continue
            r_loc = g[col].astype(float)
            r_usd = (1 + r_loc) * fxg - 1
            for y in g.index:
                if pd.isna(r_loc.get(y)) or pd.isna(r_usd.get(y)):
                    continue
                rows.append((int(y), c, asset, float(r_usd[y]), float(r_loc[y]), float(fxg[y])))
    p = pd.DataFrame(rows, columns=["year", "country", "asset", "r_usd", "r_loc", "fx_growth"])
    # Country-years dropped (all asset classes), see q1 diagnostics and the report's caveats:
    #  * Germany 1922–1924: hyperinflation; JST's xrusd is an annual average in trillion-mark units, so
    #    Dec-to-Dec local returns mixed with average exchange rates give USD returns of +830% / −87%.
    #  * Germany 1945–1949: exchanges shut, then the 10:1 Reichsmark→DM conversion shows up as −88%
    #    (1948) and +702% (1949, the xrusd unit change). Germany re-enters in 1950.
    bad = [("Germany", y) for y in (1922, 1923, 1924, 1945, 1946, 1947, 1948, 1949)]
    for c, y in bad:
        p = p[~((p.country == c) & (p.year == y))]
    us = df[df.country == "USA"].set_index("year")["cpi"].astype(float)
    p["us_infl"] = p["year"].map((us / us.shift(1) - 1).to_dict())
    return p.reset_index(drop=True)


def usd_wide(asset: str = "eq", refresh: bool = False) -> pd.DataFrame:
    """Year x country matrix of USD returns for one asset class."""
    p = jst_usd_panel(refresh)
    return p[p.asset == asset].pivot(index="year", columns="country", values="r_usd").sort_index()


# ------------------------------------------------------------------ gold / oil / btc
def gold_monthly(refresh: bool = False) -> pd.Series:
    fn = _cache("gold_monthly.csv")
    if not os.path.exists(fn) or refresh:
        with open(fn, "wb") as f:
            f.write(_get(GOLD_URL))
    g = pd.read_csv(fn)
    g["Date"] = pd.to_datetime(g["Date"]) + pd.offsets.MonthEnd(0)
    s = g.set_index("Date")["Price"].astype(float).sort_index()
    s.name = "gold"
    return s


def gold_annual() -> pd.Series:
    """Calendar-year gold return from December monthly-average prices (fixed price before 1968)."""
    g = gold_monthly()
    dec = g[g.index.month == 12]
    dec.index = dec.index.year
    return (dec / dec.shift(1) - 1).dropna()


def fred(series_id: str, refresh: bool = False) -> pd.Series:
    fn = _cache(f"fred_{series_id}.csv")
    if not os.path.exists(fn) or refresh:
        with open(fn, "wb") as f:
            f.write(_get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"))
    d = pd.read_csv(fn)
    d.columns = ["date", "v"]
    d["date"] = pd.to_datetime(d["date"])
    s = pd.to_numeric(d["v"], errors="coerce")
    s.index = d["date"]
    s.name = series_id
    return s.dropna()


def btc_daily(refresh: bool = False) -> pd.Series:
    fn = _cache("cm_btc.json")
    if not os.path.exists(fn) or refresh:
        url, rows = CM_URL, []
        while url:
            j = json.loads(_get(url))
            rows += j.get("data", [])
            url = j.get("next_page_url")
        with open(fn, "w") as f:
            json.dump({"data": rows}, f)
    j = json.load(open(fn))
    s = pd.Series({pd.Timestamp(r["time"][:10]): float(r["PriceUSD"]) for r in j["data"] if r.get("PriceUSD")})
    s = s.sort_index()
    s.name = "BTC"
    return s[s > 0]


# ------------------------------------------------------------------ yfinance
def yf_hist(ticker: str, refresh: bool = False) -> pd.DataFrame:
    fn = _cache(f"yf_{ticker.replace('^', 'IDX_').replace('=', '_').replace('/', '_')}.csv")
    if os.path.exists(fn) and not refresh:
        return pd.read_csv(fn, index_col=0, parse_dates=True)
    import yfinance as yf

    df = yf.download(ticker, start="1900-01-01", progress=False, auto_adjust=False, threads=False)
    if df is None or len(df) == 0:
        raise RuntimeError(f"no data for {ticker}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df[df.index <= ASOF]
    df.to_csv(fn)
    return df


def yf_close(ticker: str, adj: bool = True, **kw) -> pd.Series:
    df = yf_hist(ticker, **kw)
    col = "Adj Close" if adj and "Adj Close" in df.columns else "Close"
    s = df[col].astype(float).dropna()
    s = s[s > 0]
    s.name = ticker
    return s


def month_end(s: pd.Series) -> pd.Series:
    m = s.resample("ME").last().dropna()
    return m


# ------------------------------------------------------------------ Shiller
def shiller() -> pd.DataFrame:
    """Monthly S&P composite (P, D, E, CPI) since 1871 with nominal total-return index TRN."""
    fn = SHILLER_LOCAL if os.path.exists(SHILLER_LOCAL) else _cache("ie_data.xls")
    if not os.path.exists(fn):
        with open(fn, "wb") as f:
            f.write(_get(SHILLER_URL))
    x = pd.read_excel(fn, sheet_name="Data", header=None, engine="xlrd")
    hdr = next(i for i in range(20) if {"Date", "P"} <= set(str(v).strip() for v in x.iloc[i].tolist()))
    cols = [str(v).strip() for v in x.iloc[hdr].tolist()]
    body = x.iloc[hdr + 1:].copy()
    body.columns = cols
    body = body[pd.to_numeric(body["Date"], errors="coerce").notna()].copy()
    d = pd.to_numeric(body["Date"]).astype(float)
    year = np.floor(d).astype(int)
    month = np.round((d - year) * 100).astype(int).where(lambda m: m > 0, 1)
    idx = pd.to_datetime(dict(year=year, month=month, day=1)) + pd.offsets.MonthEnd(0)
    out = pd.DataFrame(index=idx)
    for c in ["P", "D", "E", "CPI"]:
        out[c] = pd.to_numeric(body[c], errors="coerce").values
    out = out[~out.index.duplicated(keep="first")].sort_index().dropna(subset=["P"])
    ret = (out["P"] + out["D"].ffill() / 12.0) / out["P"].shift(1)
    out["TRN"] = ret.fillna(1.0).cumprod()
    return out


# ------------------------------------------------------------------ helpers
def cagr(total_growth: float, years: float) -> float:
    return total_growth ** (1.0 / years) - 1.0 if years > 0 and total_growth > 0 else np.nan


def max_drawdown(wealth: pd.Series) -> float:
    w = wealth.dropna()
    return float((w / w.cummax() - 1).min()) if len(w) else np.nan


def series_stats(r: pd.Series, ppy: int) -> dict:
    """CAGR, vol, max drawdown for a return series with ppy periods per year."""
    r = r.dropna()
    w = (1 + r).cumprod()
    n = len(r)
    return {
        "start": str(r.index[0]), "end": str(r.index[-1]), "years": n / ppy,
        "cagr": cagr(float(w.iloc[-1]), n / ppy), "vol": float(r.std(ddof=1) * np.sqrt(ppy)),
        "max_dd": max_drawdown(w), "worst_period": float(r.min()),
    }


def rolling_10y_share(r_strat: pd.Series, r_bench: pd.Series, ppy: int, margin: float = 0.05) -> dict:
    """Share of rolling 10-year windows in which the strategy's CAGR beats the benchmark's by >= margin,
    and the share in which it beats it at all."""
    a = pd.concat([r_strat, r_bench], axis=1).dropna()
    n = 10 * ppy
    if len(a) <= n:
        return {"windows": 0}
    la = np.log1p(a)
    ws = la.iloc[:, 0].rolling(n).sum()
    wb = la.iloc[:, 1].rolling(n).sum()
    cs = np.exp(ws / 10) - 1
    cb = np.exp(wb / 10) - 1
    d = (cs - cb).dropna()
    return {"windows": int(len(d)), "share_beat": float((d > 0).mean()), f"share_beat_{int(margin*100)}pt": float((d >= margin).mean()),
            "median_excess": float(d.median()), "worst_excess": float(d.min()), "best_excess": float(d.max())}


def decade_of(year: int) -> str:
    return f"{(year // 10) * 10}s"
