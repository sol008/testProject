#!/usr/bin/env python3
"""Historical replay harness: run the real traderec pipeline day by day over past years, then reconcile its
trades with the research backtests (method and results: docs/phase-b/replay.md).

    python scripts/replay.py fetch     [--cache DIR]                        # download every series once
    python scripts/replay.py run       [--start D] [--end D] [--cache DIR] [--work DIR] [--resume]
    python scripts/replay.py reconcile [--work DIR ...] [--out research/code/25-replay]
    python scripts/replay.py all       [...]                                # fetch (if needed), run, reconcile
    python scripts/replay.py run --book g1-only --fund-proxies [--no-governor] --start 1986-07-01 ...   # Phase C4b
    python scripts/replay.py reconcile-g1 --work DIR --work-governor DIR [--out research/code/39-growth-replay/g1-1986]

What it does:

* **Data, as of each replay date.** `fetch` composes `traderec.data.LiveProvider` for every download
  (yfinance bars, CBOE VIX, FRED DTB3, Coinbase BTC candles) and caches the full histories under --cache
  (default /tmp/traderec-replay-cache, outside the repo). `AsOfProvider` then serves them "as of" each run:
  bars, VIX, ^GSPC and BTC cut at the run date, the T-bill rate from the last DTB3 print before it.
* **Second sources.** By default `second_source_close` echoes the primary close with source "replay-echo"
  (the live fallbacks, Robinhood's and CBOE's quotes, only know today). Every echo is counted and flagged:
  the two-source checks then pass by construction. `--second-source history` serves instead the live
  system's first choices, Nasdaq's SPY history and FRED's SP500, which do reach back to 2019 (cached by
  `fetch`); `reconcile` also re-checks every signal day against them.
* **IBIT before 2024-01-11.** IBIT did not exist, so M3's sleeve trades a flagged proxy: Coinbase hourly
  BTC-USD at 9:30 ET (open) and 16:00 ET (close), scaled to IBIT's first close.
* **SSO and QLD before June 2006, SPY before 1993** (`--fund-proxies`, Phase C4b: the 1986-2026 G1-only replay of
  design v4 A.5). The 2x funds did not exist, so the G1 legs trade flagged proxy bars: track 26's leveraged-fund
  model on ^GSPC and ^NDX (2 x the index's total return less financing at T-bills + 0.70% and the 0.89% fee),
  spliced to the real bars by ratio at the first real close; SPY is ^GSPC scaled, for the daily run's session
  calendar and marks only. `--book g1-only` is the config override for that replay (G2 and W10 at weight 0, the
  v3.3 modules and the shadow books off, `--no-governor` for the run without the governor); `reconcile-g1`
  compares the two runs with track 38's real path, its episodes and reference books rebuilt from the same bars.
* **The real pipeline.** `run_init` at the start date, then per calendar day: `run_monthly` for the month
  that just ended (08:13 ET on the 1st), `run_daily` Monday to Friday (22:17 ET), `run_weekly` on Sundays.
  `dry_run=False` on a work state directory, so the book evolves. Services are stubs: emails are captured
  and re-validated, no GitHub issues, no pings, no comments.
* **Reconciliation** against the research trade lists: M1 vs track 13 ST-1, W10 vs track 23 (CAL90, one at
  a time), the shadow books vs tracks 13 (ST-1b) and 23 (every uptrend -3% day), M2's monthly targets vs
  track 15 R1 long-only ETF8 and M3's switches vs track 15 R2 (both recomputed with the research code).

Network use is confined to `fetch` (and to the track-15 research code when its cache is missing).
"""
from __future__ import annotations

import argparse
import contextlib
import copy
import importlib.util
import json
import math
import os
import pickle
import sys
import time
import traceback
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from traderec import pipeline, validator  # noqa: E402
from traderec.config import Config, load_config  # noqa: E402
from traderec.data.providers import DataError  # noqa: E402
from traderec.market_calendar import iso  # noqa: E402

DEFAULT_CACHE = Path(os.environ.get("TRADEREC_REPLAY_CACHE", "/tmp/traderec-replay-cache"))
DEFAULT_WORK = Path(os.environ.get("TRADEREC_REPLAY_WORK", "/tmp/traderec-replay-work"))
DEFAULT_OUT = REPO / "research" / "code" / "25-replay"
DEFAULT_GROWTH_OUT = REPO / "research" / "code" / "39-growth-replay"
RESEARCH = REPO / "research" / "code"
ECHO_SOURCE = "replay-echo"
NY = "America/New_York"
LOG: Callable[[str], None] = print


# ======================================================================================================
# 1. Full histories (network only in `fetch_history`)
# ======================================================================================================

@dataclass
class History:
    """Full daily histories the replay serves as of each date.

    bars: contract price frames per ticker; vix: CBOE official closes per name; btc: BTC-USD close per UTC
    day; tbill: FRED DTB3 as a decimal per observation date; flags: data caveats per series (a proxy, a gap
    fill, ...), shown in the outputs.
    """

    bars: dict[str, pd.DataFrame]
    vix: dict[str, pd.Series]
    btc: pd.Series
    tbill: pd.Series
    flags: dict[str, str] = field(default_factory=dict)
    sources: dict[str, str] = field(default_factory=dict)
    proxy_before: dict[str, str] = field(default_factory=dict)   # ticker -> first real session (proxy before)
    second: dict[str, tuple[str, pd.Series]] = field(default_factory=dict)   # ticker -> (source, closes)


def replay_tickers(cfg: Config) -> list[str]:
    """Every ticker the pipeline reads: M1/W10's SPY, the S&P index, Yahoo's ^VIX, M2's legs, M3's ETF, and (design
    v4, Phase C) the growth book's SSO, QLD, their indices, IBIT, the cash vehicle and Yahoo's BTC-USD (G2's second
    source for the Sunday close, as live)."""
    mods = cfg.constitution["modules"]
    out = ["SPY", "^VIX", str(mods["W10"]["index"]), str(mods["M1"]["ticker"]), str(mods["W10"]["ticker"]),
           str(mods["M3"]["ticker"]), *list(mods["M2"]["legs"])]
    out += growth_tickers(cfg)
    return list(dict.fromkeys(out))


def growth_tickers(cfg: Config) -> list[str]:
    """The growth book's tickers from the `growth` block: the G1 legs and their indices, G2's instrument, the cash
    vehicle and BTC-USD; [] when the constitution has no growth block."""
    sl = (cfg.constitution.get("growth") or {}).get("sleeves") or {}
    out: list[str] = []
    for leg, spec in ((sl.get("G1") or {}).get("legs") or {}).items():
        out += [str(leg), str(spec["index"])]
    if (sl.get("G2") or {}).get("instrument"):
        out.append(str(sl["G2"]["instrument"]))
    if (sl.get("cash") or {}).get("vehicle"):
        out.append(str(sl["cash"]["vehicle"]))
    out.append(BTC_TICKER)
    return list(dict.fromkeys(out))


BTC_TICKER = "BTC-USD"
COINBASE_EARLY_START = "2015-01-01"     # Coinbase Exchange candles begin in 2015; Yahoo covers the days before


def _safe(name: str) -> str:
    return name.replace("^", "IDX_").replace("/", "_").replace("=", "_")


def _utc_iso(ts: pd.Timestamp) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_candles_ohlc(rows: Any) -> pd.DataFrame:
    """Coinbase Exchange candles ``[[time, low, high, open, close, volume], ...]`` -> OHLCV on UTC start times."""
    if not isinstance(rows, list):
        raise ValueError(f"Coinbase candles payload is not a list: {str(rows)[:120]}")
    cols = ["open", "high", "low", "close", "volume"]
    if not rows:
        return pd.DataFrame(columns=cols, dtype=float, index=pd.DatetimeIndex([], name="utc"))
    df = pd.DataFrame(rows, columns=["time", "low", "high", "open", "close", "volume"])
    df.index = pd.DatetimeIndex(pd.to_datetime(df["time"].astype("int64"), unit="s"), name="utc")
    df = df[cols].astype(float)
    return df[~df.index.duplicated(keep="last")].sort_index()


def coinbase_candles(lp: Any, start: pd.Timestamp, end: pd.Timestamp, granularity: int,
                     pause: float = 0.12) -> pd.DataFrame:
    """BTC-USD candles between two UTC times, paged 300 at a time through LiveProvider's HTTP plumbing."""
    from traderec.data.providers import COINBASE_CANDLES_URL

    step = pd.Timedelta(seconds=granularity)
    pages, s = [], pd.Timestamp(start)
    while s <= end:
        e = min(s + 299 * step, pd.Timestamp(end))
        rows = lp._get_json(COINBASE_CANDLES_URL, params={"granularity": granularity, "start": _utc_iso(s),
                                                           "end": _utc_iso(e)})
        pages.append(parse_candles_ohlc(rows))
        s = e + step
        time.sleep(pause)
    out = pd.concat([p for p in pages if len(p)]) if any(len(p) for p in pages) else parse_candles_ohlc([])
    return out[~out.index.duplicated(keep="last")].sort_index()


def parse_nasdaq_rows(payload: Any) -> pd.Series:
    """Every close in Nasdaq's ``/api/quote/{T}/historical`` JSON (rows of "MM/DD/YYYY" and "771.35")."""
    rows = ((payload or {}).get("data") or {}).get("tradesTable", {}).get("rows") or []
    out = {}
    for row in rows:
        try:
            day = pd.Timestamp(pd.to_datetime(str(row["date"]).strip(), format="%m/%d/%Y"))
            out[day] = float(str(row["close"]).replace("$", "").replace(",", ""))
        except (KeyError, TypeError, ValueError):
            continue
    s = pd.Series(out, dtype=float).sort_index()
    s.index = pd.DatetimeIndex(s.index, name="date")
    return s


def fetch_history(cfg: Config, cache: Path, *, btc_start: str = "2017-01-01", proxy_start: str = "2018-06-01",
                  history_start: str = "2019-01-01", refresh: bool = False) -> dict:
    """Download every series the replay needs with LiveProvider and cache it under `cache` (pickles).

    Series already in the cache are kept unless `refresh`. Besides the pipeline's inputs it caches the two
    historical second sources the live system would query (Nasdaq's SPY history and FRED's SP500), used by
    `--second-source history` and by the signal-day check in `reconcile`.
    """
    from traderec.data import LiveProvider
    from traderec.data.providers import (BROWSER_HEADERS, FRED_CSV_URL, INDEX_SECOND_SOURCES, NASDAQ_HISTORICAL_URL,
                                         parse_fred_csv)

    cache.mkdir(parents=True, exist_ok=True)
    lp = LiveProvider(cfg)
    mpath = cache / "manifest.json"
    manifest: dict[str, Any] = json.loads(mpath.read_text()) if (mpath.exists() and not refresh) else {"series": {}}
    manifest["fetched_utc"] = pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds")

    def keep(name: str, source: str, get: Callable[[], Any]) -> None:
        if not refresh and (cache / f"{name}.pkl").exists() and name in manifest["series"]:
            return
        obj = get()
        with open(cache / f"{name}.pkl", "wb") as fh:
            pickle.dump(obj, fh)
        idx = obj.index
        manifest["series"][name] = {"source": source, "rows": int(len(obj)),
                                    "first": str(idx[0])[:19] if len(idx) else None,
                                    "last": str(idx[-1])[:19] if len(idx) else None}
        LOG(f"  cached {name}: {len(obj)} rows {manifest['series'][name]['first']} -> "
            f"{manifest['series'][name]['last']} ({source})")
        mpath.write_text(json.dumps(manifest, indent=1) + "\n")

    for t in replay_tickers(cfg):
        keep(f"bars_{_safe(t)}", "yfinance", lambda t=t: lp.daily_bars(t))
    keep("vix_VIX", "cboe", lambda: lp.vix("VIX"))
    keep("tbill_DTB3", "fred:DTB3",
         lambda: parse_fred_csv(lp._get(FRED_CSV_URL, params={"id": "DTB3"}).text, "DTB3") / 100.0)
    today = pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()

    def btc_daily() -> pd.Series:
        daily = coinbase_candles(lp, pd.Timestamp(btc_start), today - pd.Timedelta(days=1), 86_400)
        daily.index = daily.index.normalize()
        return daily[daily.index < today]

    keep("btc_coinbase_daily", "coinbase", btc_daily)
    keep("bars_BTC-USD", "yfinance", lambda: lp.daily_bars("BTC-USD"))       # G2's second source; gap fill before 2017
    first_ibit = lp.daily_bars(str(cfg.module("M3")["ticker"])).index[0]
    keep("btc_coinbase_hourly", "coinbase (hourly, for the IBIT proxy)",
         lambda: coinbase_candles(lp, pd.Timestamp(proxy_start), first_ibit + pd.Timedelta(days=3), 3_600))
    # Phase C: the growth-book replay starts in 2014, so the proxy needs the hourly candles from Coinbase's first
    # year too (a separate series, so a Phase A cache is extended, not refetched).
    keep("btc_coinbase_hourly_early", "coinbase (hourly, 2015 to proxy_start, for the IBIT proxy)",
         lambda: coinbase_candles(lp, pd.Timestamp(COINBASE_EARLY_START),
                                  pd.Timestamp(proxy_start) - pd.Timedelta(hours=1), 3_600))
    fred_id = INDEX_SECOND_SOURCES["^GSPC"]["fred"]
    keep("second_fred_SP500", f"fred:{fred_id}",
         lambda: parse_fred_csv(lp._get(FRED_CSV_URL, params={"id": fred_id}).text, fred_id))
    keep("second_nasdaq_SPY", "nasdaq", lambda: parse_nasdaq_rows(lp._get_json(
        NASDAQ_HISTORICAL_URL.format(ticker="SPY"), headers=BROWSER_HEADERS,
        params={"assetclass": "etf", "fromdate": history_start, "todate": today.strftime("%Y-%m-%d"),
                "limit": 9999})))
    return manifest


def _load(cache: Path, name: str) -> Any:
    with open(cache / f"{name}.pkl", "rb") as fh:
        return pickle.load(fh)


def ibit_proxy(hourly: pd.DataFrame, sessions: pd.DatetimeIndex, ratio: float) -> pd.DataFrame:
    """IBIT-like bars from hourly BTC-USD: open = the 9:00-10:00 ET candle's (open + close) / 2 (about 9:30),
    close = the price at 16:00 ET, high/low over 9:00-16:00 ET; times `ratio` (IBIT close / BTC at 16:00 ET)."""
    h = hourly.copy()
    et = h.index.tz_localize("UTC").tz_convert(NY)
    h["day"] = et.tz_localize(None).normalize()
    h["hour"] = et.hour
    rows = {}
    for day, g in h[h["day"].isin(sessions)].groupby("day"):
        g = g.set_index("hour")
        o = next((float((g.at[hr, "open"] + g.at[hr, "close"]) / 2) for hr in (9, 10, 8) if hr in g.index), None)
        if 16 in g.index:
            c = float(g.at[16, "open"])
        elif 15 in g.index:
            c = float(g.at[15, "close"])
        else:
            c = None
        if o is None or c is None:
            continue
        day_rows = g.loc[[hr for hr in range(9, 16) if hr in g.index]]
        hi = float(day_rows["high"].max()) if len(day_rows) else max(o, c)
        lo = float(day_rows["low"].min()) if len(day_rows) else min(o, c)
        rows[day] = {"open": o, "high": max(hi, o, c), "low": min(lo, o, c), "close": c, "adj_close": c,
                     "volume": float(g["volume"].sum())}
    out = pd.DataFrame.from_dict(rows, orient="index")[["open", "high", "low", "close", "adj_close", "volume"]]
    for col in ("open", "high", "low", "close", "adj_close"):
        out[col] = out[col] * ratio
    out.index = pd.DatetimeIndex(out.index, name="date")
    return out.sort_index()


def ibit_proxy_daily(yahoo: pd.DataFrame, sessions: pd.DatetimeIndex, ratio: float) -> pd.DataFrame:
    """IBIT-like bars for sessions before the hourly candles exist, from Yahoo's BTC-USD UTC daily bars: the session's
    UTC day (open 00:00 UTC = the evening before in New York, close 23:59 UTC) times `ratio`. Coarser than the
    hourly proxy (the open is ~14 hours before 9:30 ET); flagged in every output."""
    cols = ["open", "high", "low", "close", "adj_close", "volume"]
    out = yahoo.reindex(sessions).dropna(subset=["open", "close"])
    out = out.reindex(columns=cols)
    for col in ("open", "high", "low", "close"):
        out[col] = out[col].astype(float) * ratio
    out["adj_close"] = out["close"]
    out["volume"] = out["volume"].fillna(0.0)
    out.index = pd.DatetimeIndex(out.index, name="date")
    return out.sort_index()


def _load_optional(cache: Path, name: str) -> Any:
    return _load(cache, name) if (cache / f"{name}.pkl").exists() else None


def load_history(cfg: Config, cache: Path, *, fund_proxies: bool = False) -> History:
    """Read the cache written by `fetch_history`, splice the IBIT proxy and fill BTC gaps (flagged).

    `fund_proxies` (Phase C4b) also splices proxy bars for the G1 funds before their first real session and for SPY
    before 1993 (`splice_fund_proxies`), so the replay can start in 1986.
    """
    if not (cache / "manifest.json").exists():
        raise SystemExit(f"no replay cache at {cache}; run `python scripts/replay.py fetch --cache {cache}`")
    manifest = json.loads((cache / "manifest.json").read_text())
    bars = {t: _load(cache, f"bars_{_safe(t)}") for t in replay_tickers(cfg)}
    flags: dict[str, str] = {}
    sources = {f"daily_bars:{t}": manifest["series"].get(f"bars_{_safe(t)}", {}).get("source", "yfinance")
               for t in bars}
    # IBIT: flagged BTC proxy before the first real session, spliced to the real bars.
    m3 = str(cfg.module("M3")["ticker"])
    real = bars[m3]
    first = real.index[0]
    hourly = _load(cache, "btc_coinbase_hourly")
    early = _load_optional(cache, "btc_coinbase_hourly_early")
    if early is not None and len(early):
        hourly = pd.concat([early, hourly])
        hourly = hourly[~hourly.index.duplicated(keep="last")].sort_index()
    et = hourly.index.tz_localize("UTC").tz_convert(NY)
    at_close = hourly[(et.tz_localize(None).normalize() == first) & (et.hour == 16)]
    ratio = float(real["close"].iloc[0]) / float(at_close["open"].iloc[0])
    before = bars["SPY"].index[bars["SPY"].index < first]
    proxy = ibit_proxy(hourly, before, ratio)
    flags[m3] = (f"before {first.date()}: proxy = Coinbase hourly BTC-USD (open ~9:30 ET, close 16:00 ET) x "
                 f"{ratio:.8f}, IBIT's first close / BTC at 16:00 ET that day; no premium, discount or fee drag")
    yahoo_bars = _load_optional(cache, "bars_BTC-USD")
    if len(proxy) and yahoo_bars is not None:
        earlier = before[before < proxy.index[0]]
        coarse = ibit_proxy_daily(yahoo_bars, earlier, ratio)
        if len(coarse):
            proxy = pd.concat([coarse, proxy])
            flags[m3] += (f"; before {proxy.index[len(coarse)].date()} (no hourly candles): the same proxy from "
                          f"Yahoo's BTC-USD UTC daily bars (open 00:00 UTC, close 23:59 UTC), {len(coarse)} sessions")
    bars[m3] = pd.concat([proxy, real])
    bars[m3].index.name = "date"
    sources[f"daily_bars:{m3}"] = "yfinance+btc-proxy"
    # BTC per UTC day: Coinbase, the days before its first candle and any gaps filled from Yahoo BTC-USD (flagged).
    daily = _load(cache, "btc_coinbase_daily")["close"]
    yahoo = _load(cache, "bars_BTC-USD")["close"]
    full = pd.date_range(min(daily.index[0], yahoo.index[0]), daily.index[-1], freq="D")
    missing = full.difference(daily.index)
    fill = yahoo.reindex(missing).dropna()
    btc = pd.concat([daily, fill]).sort_index()
    if len(fill):
        head = fill[fill.index < daily.index[0]]
        gaps = fill[fill.index >= daily.index[0]]
        flags["btc_daily_utc"] = (f"{len(head)} UTC days before Coinbase's first candle ({daily.index[0].date()}) and "
                                  f"{len(gaps)} gaps filled from Yahoo BTC-USD"
                                  + (f" ({', '.join(d.strftime('%Y-%m-%d') for d in gaps.index[:5])}"
                                     f"{', ...' if len(gaps) > 5 else ''})" if len(gaps) else ""))
    sources["btc_daily_utc"] = "coinbase"
    sources["vix:VIX"] = manifest["series"]["vix_VIX"]["source"]
    sources["tbill_rate"] = "fred:DTB3"
    second = {}
    for ticker, name in (("SPY", "second_nasdaq_SPY"), ("^GSPC", "second_fred_SP500")):
        if name in manifest["series"]:
            second[ticker] = (manifest["series"][name]["source"], _load(cache, name))
    history = History(bars=bars, vix={"VIX": _load(cache, "vix_VIX")}, btc=btc.rename("BTC-USD"),
                      tbill=_load(cache, "tbill_DTB3"), flags=flags, sources=sources,
                      proxy_before={m3: str(first.date())}, second=second)
    if fund_proxies:
        splice_fund_proxies(history, cfg)
    return history


# ======================================================================================================
# 1b. Proxy fund bars before the real funds (Phase C4b: the 1986-2026 G1-only replay, design v4 A.5)
# ======================================================================================================

# Track 26's leveraged-fund model (research/26-leveraged-trend-core.md §1, research/code/26-leveraged-trend/common.py):
# an L x fund earns L x the index's total return - (L - 1) x (T-bill + SPREAD) - fee(L) a year, the 0.70% spread calibrated
# to the real SSO/UPRO record and fee(2x) = SPY's 0.0945% + 0.80% for the second unit = 0.89% (SSO's own fee).
FUND_PROXY = {"L": 2.0, "fee": 0.008945, "spread": 0.0070, "days": 252}
FUND_PROXY_START = "1985-10-01"      # ^NDX's first Yahoo session; ^GSPC and DTB3 reach further back
# A constant dividend yield a year when track 26's cached inputs are missing: the S&P's 1986-2006 Shiller mean (2.3%) and
# track 26's Nasdaq-100 yield before QQQ (0.6%).
FALLBACK_YIELD = {"^GSPC": 0.023, "^NDX": 0.006}
TRACK26_SPX_INPUTS = ("shiller_ie_data.xls", "yf_IDX_SP500TR.csv", "yf_IDX_GSPC.csv")
SPY_PROXY_INDEX = "^GSPC"


def _track26() -> Any:
    """Track 26's `common` module, imported under its own name (track 15's is also called `common`). Importing it uses no
    network; a loader would download a series whose cache file is missing, so `index_dividends` checks `_find_cached`
    first and never lets it."""
    name = "track26_common"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, RESEARCH / "26-leveraged-trend" / "common.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def index_dividends(index: str, closes: pd.Series, qqq_bars: pd.DataFrame | None = None,
                    days: int = 252) -> tuple[pd.Series, str]:
    """The daily dividend part of an index's total return on `closes`' sessions, and a note saying where it came from.

    ^GSPC, as track 26's `spx_panel`: Shiller's monthly dividend yield over `days` before ^SP500TR's first return (1988),
    then the total-return index's daily return less the price index's, both from track 26's cached Yahoo files (its
    loaders, when `_find_cached` finds every input). ^NDX, as `ndx_panel`: QQQ's implied yield (its adjusted less its raw
    close return, a 252-session rolling mean with 60 sessions minimum) from `qqq_bars`, and 0.6% a year before it. Without
    the cached inputs the index gets FALLBACK_YIELD as a constant and the note says so; nothing is downloaded.
    """
    sessions = pd.DatetimeIndex(closes.index)
    if index == "^NDX":
        d = pd.Series(np.nan, index=sessions)
        if qqq_bars is not None and len(qqq_bars):
            implied = (qqq_bars["adj_close"].pct_change() - qqq_bars["close"].pct_change()).rolling(252, min_periods=60).mean()
            d = implied.reindex(sessions).ffill()
        first = d.first_valid_index()
        d = d.fillna(FALLBACK_YIELD["^NDX"] / days).clip(lower=0.0)
        if first is None:
            return d, f"a constant {100 * FALLBACK_YIELD['^NDX']:.1f}% a year (track 26's Nasdaq-100 yield; no QQQ bars)"
        return d, (f"QQQ's implied yield (adjusted less raw close return, 252-session mean) from {first.date()}, "
                   f"{100 * FALLBACK_YIELD['^NDX']:.1f}% a year before it (track 26's ndx_panel)")
    if index == "^GSPC":
        try:
            c = _track26()
            cached = all(c._find_cached([f]) is not None for f in TRACK26_SPX_INPUTS)
        except Exception:  # noqa: BLE001 - track 26's module or its dependencies unavailable: the constant below
            cached = False
        if cached:
            dy = c.shiller_divyield()
            d = dy.reindex(dy.index.union(sessions)).ffill().reindex(sessions) / days
            tr = c.yf_df("^SP500TR", start="1988-01-01")["Close"].dropna()
            px = c.yf_df("^GSPC")["Close"].dropna()
            extra = (tr.pct_change() - px.pct_change().reindex(tr.index)).dropna()
            after = sessions[sessions >= extra.index[0]]
            d.loc[after] = extra.reindex(after).fillna(d.loc[after])
            return d.fillna(0.0), (f"Shiller's monthly dividend yield before {extra.index[0].date()}, then ^SP500TR's "
                                   f"daily return less ^GSPC's (track 26's loaders on its cached inputs)")
    y = FALLBACK_YIELD.get(index, 0.0)
    return pd.Series(y / days, index=sessions), (f"a constant {100 * y:.1f}% a year (track 26's cached inputs "
                                                 f"{', '.join(TRACK26_SPX_INPUTS)} not found)")


def fund_proxy_returns(index_bars: pd.DataFrame, dividends: pd.Series, tbill: pd.Series, *, L: float = 2.0,
                       fee: float = FUND_PROXY["fee"], spread: float = FUND_PROXY["spread"],
                       days: int = FUND_PROXY["days"]) -> pd.Series:
    """Track 26's leveraged-fund model per session: L x (the index's price return + `dividends`) - (L - 1) x (rf + spread)
    / days - fee / days, with rf the last T-bill print dated before the session (the prior DTB3 print, as the pipeline
    serves it). NaN on the first session (no prior close)."""
    closes = index_bars["close"].astype(float)
    sessions = closes.index
    r_px = closes.pct_change()
    rf = tbill.reindex(tbill.index.union(sessions)).ffill().shift(1).reindex(sessions).fillna(0.0)
    return L * (r_px + dividends.reindex(sessions).fillna(0.0)) - (L - 1.0) * (rf + spread) / days - fee / days


def leveraged_fund_proxy(index_bars: pd.DataFrame, fund_returns: pd.Series, real_bars: pd.DataFrame, *,
                         L: float = 2.0) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Proxy bars for a leveraged fund before its first real session, from its index's bars and the modelled daily returns.

    The close compounds `fund_returns` and is spliced by ratio to the real fund's first close (as `ibit_proxy` is to
    IBIT's); the open is the prior close moved by L x the index's overnight return where Yahoo's index open differs from
    the prior close (a real open), else the prior close; high and low likewise from the index's high and low; adj_close =
    close (the model's total return is in the price, so the pipeline infers no distribution); volume 0. Returns the bars
    before the first real session and {"first_real", "ratio", "sessions", "real_open_share", "real_opens_from"}.
    """
    first = pd.Timestamp(real_bars.index[0])
    f = fund_returns.dropna().loc[:first]
    if first not in f.index:
        raise ValueError(f"no modelled return on the fund's first real session {first.date()}")
    level = (1.0 + f).cumprod()
    ratio = float(real_bars["close"].iloc[0]) / float(level.loc[first])
    close = level * ratio
    idx = index_bars.reindex(close.index).astype(float)
    prev_idx = idx["close"].shift(1)
    prev_close = close.shift(1)
    has_open = idx["open"].notna() & (idx["open"] > 0) & (idx["open"] != prev_idx)
    open_ = (prev_close * (1.0 + L * (idx["open"] / prev_idx - 1.0))).where(has_open, prev_close)
    high = prev_close * (1.0 + L * (idx["high"] / prev_idx - 1.0))
    low = prev_close * (1.0 + L * (idx["low"] / prev_idx - 1.0))
    out = pd.DataFrame({"open": open_, "high": pd.concat([high, open_, close], axis=1).max(axis=1),
                        "low": pd.concat([low, open_, close], axis=1).min(axis=1), "close": close, "adj_close": close,
                        "volume": 0.0})
    out = out[out.index < first].dropna(subset=["open", "close"])
    out.index = pd.DatetimeIndex(out.index, name="date")
    real = has_open.reindex(out.index).fillna(False).astype(float)
    by_year = real.groupby(real.index.year).mean() if len(real) else pd.Series(dtype=float)
    # the first year from which every year up to the splice has a real open on at least 90% of its sessions
    rule_from = None
    for year in by_year.index:
        if (by_year.loc[year:] >= 0.9).all():
            rule_from = int(year)
            break
    meta = {"first_real": iso(first), "ratio": ratio, "sessions": int(len(out)),
            "real_open_share": float(real.mean()) if len(real) else 0.0,
            "real_opens_from": rule_from, "real_open_share_by_year": {int(y): round(float(v), 2) for y, v in by_year.items()}}
    return out.sort_index(), meta


def splice_fund_proxies(history: History, cfg: Config, *, start: str = FUND_PROXY_START) -> dict[str, dict]:
    """Phase C4b: proxy bars for the G1 funds before their first real session (track 26's 2x model on each leg's index) and
    for SPY before its first real bar (^GSPC scaled: the daily run's session calendar and its SPY marks), spliced into
    `history.bars`, flagged in `history.flags` and recorded in `history.proxy_before`. Returns the splice metadata."""
    g = cfg.constitution.get("growth") or {}
    legs = ((g.get("sleeves") or {}).get("G1") or {}).get("legs") or {}
    out: dict[str, dict] = {}
    p = FUND_PROXY
    for fund, spec in legs.items():
        index = str(spec["index"])
        if fund not in history.bars or index not in history.bars:
            continue
        idx_bars = history.bars[index].loc[pd.Timestamp(start):]
        div, note = index_dividends(index, idx_bars["close"], history.bars.get("QQQ"))
        f = fund_proxy_returns(idx_bars, div, history.tbill, L=p["L"], fee=p["fee"], spread=p["spread"], days=p["days"])
        proxy, meta = leveraged_fund_proxy(idx_bars, f, history.bars[fund], L=p["L"])
        real = history.bars[fund]
        history.bars[fund] = pd.concat([proxy, real[real.index >= pd.Timestamp(meta["first_real"])]])
        history.bars[fund].index.name = "date"
        history.flags[fund] = (
            f"before {meta['first_real']}: proxy = track 26's 2x model on {index} (daily return {p['L']:.0f} x the index's "
            f"total return - {p['L'] - 1:.0f} x (T-bill + {100 * p['spread']:.2f}%)/{p['days']} - {100 * p['fee']:.2f}%/{p['days']}, "
            f"the T-bill the prior DTB3 print; dividends: {note}), {meta['sessions']} sessions from {iso(proxy.index[0])}, "
            f"spliced to the real bars by ratio at the first real close (x {meta['ratio']:.6f}); opens: the prior close "
            f"moved by {p['L']:.0f} x the index's overnight move where Yahoo's index open differs from the prior close "
            f"({100 * meta['real_open_share']:.0f}% of the proxy sessions; "
            + (f"90% of every year's sessions from {meta['real_opens_from']}" if meta["real_opens_from"]
               else "in no year before the splice do 90% of the sessions have one")
            + "), else the prior close; adj_close = close (no distributions)")
        history.sources[f"daily_bars:{fund}"] = "yfinance+track26-proxy"
        history.proxy_before[fund] = meta["first_real"]
        out[fund] = dict(meta, index=index, dividends=note)
    spy = history.bars.get("SPY")
    src = history.bars.get(SPY_PROXY_INDEX)
    if spy is not None and src is not None and pd.Timestamp(start) < spy.index[0]:
        first = pd.Timestamp(spy.index[0])
        g_bars = src.loc[pd.Timestamp(start):]
        div, note = index_dividends(SPY_PROXY_INDEX, g_bars["close"])
        tr_level = (1.0 + g_bars["close"].pct_change().fillna(0.0) + div.reindex(g_bars.index).fillna(0.0)).cumprod()
        ratio = float(spy["close"].iloc[0]) / float(g_bars.at[first, "close"])
        before = g_bars.index[g_bars.index < first]
        proxy = g_bars.loc[before, ["open", "high", "low", "close"]].astype(float) * ratio
        proxy["adj_close"] = float(spy["adj_close"].iloc[0]) * tr_level.loc[before] / float(tr_level.loc[first])
        proxy["volume"] = 0.0
        proxy.index = pd.DatetimeIndex(proxy.index, name="date")
        history.bars["SPY"] = pd.concat([proxy, spy])
        history.bars["SPY"].index.name = "date"
        history.flags["SPY"] = (
            f"before {iso(first)}: proxy = {SPY_PROXY_INDEX} x {ratio:.6f} (open, high, low, close; {len(proxy)} sessions from "
            f"{iso(proxy.index[0])}), adj_close from the index's total return ({note}); read for the daily run's session "
            f"calendar, the marks' SPY column and the SPY two-source check (an echo) only: no module trades SPY here")
        history.sources["daily_bars:SPY"] = "yfinance+index-proxy"
        history.proxy_before["SPY"] = iso(first)
        out["SPY"] = {"first_real": iso(first), "ratio": ratio, "sessions": int(len(proxy)), "index": SPY_PROXY_INDEX}
    return out


# ------------------------------------------------------------------------------------------------------
# The `--book g1-only` override: the G1 legs alone through the real pipeline (design v4 A.5, second item)
# ------------------------------------------------------------------------------------------------------

V33_MODULES = ("M1", "M2", "M3", "M4", "W8", "W9", "W10")


def g1_only_config(cfg: Config, *, governor: bool = True) -> Config:
    """A copy of `cfg` for the G1-only replay: G2's weight 0 (its instrument stays, so the Sunday records keep their
    shape; its leg is skipped by `g2_off`), W10's weight 0, the v3.3 modules and every shadow book off (SPY starts in
    1993 and ^VIX in 1990: they would alert daily), the options job off; with `governor=False` the governor is forced to
    G = 1 and the hard stop off (thresholds at a 100% drawdown). Rule E and the rest of the growth block are production's.
    """
    c = copy.deepcopy(cfg.constitution)
    g = c["growth"]
    sl = g.setdefault("sleeves", {})
    sl.setdefault("G2", {})["weight"] = 0.0
    sl["W10"] = {**(sl.get("W10") or {}), "weight": 0.0}
    for name in V33_MODULES:
        if name in (c.get("modules") or {}):
            c["modules"][name]["enabled"] = False
    shadow = c.setdefault("shadow", {})
    for name, block in list(shadow.items()):
        if isinstance(block, dict):
            block["enabled"] = False
    shadow["ST1"] = {**(shadow.get("ST1") or {}), "enabled": False}
    if isinstance(c.get("options"), dict):
        c["options"]["enabled"] = False
    if not governor:
        g["governor"] = {**(g.get("governor") or {}), "full_until": 1.0, "floor_at": 1.0, "floor": 1.0}
        g["hard_stop"] = {**(g.get("hard_stop") or {}), "at": 1.0}
    return replace(cfg, constitution=c)


def g2_off(run: Any, cfg: dict, st: dict, sources: list) -> dict[str, Any]:
    """`growth.weekly._g2` under `--book g1-only`: the Bitcoin leg is skipped (no signal, no data alert; the sleeve keeps
    its state, off, at weight 0). The Sunday job has no switch for a sleeve without data, and Bitcoin has none before 2014."""
    prev_on = st["sleeves"]["G2"].get("on")
    return {"on": prev_on, "complete": False, "signal": False, "prev_on": prev_on, "changed": False, "week_end": None,
            "weekly_close": None, "ma10w": None, "sma200": None, "vol60": None, "check": None, "agree": None,
            "reason": "G2 is off in the g1-only replay (no Bitcoin sleeve; the harness skips the leg)"}


@contextlib.contextmanager
def book_patches(book: str | None):
    """While a `g1-only` replay runs, the Sunday job's G2 leg is `g2_off`; restored afterwards."""
    if book != "g1-only":
        yield
        return
    from traderec.growth import weekly as growth_weekly

    original = growth_weekly._g2
    growth_weekly._g2 = g2_off
    try:
        yield
    finally:
        growth_weekly._g2 = original


# ======================================================================================================
# 2. The as-of provider (no look-ahead) and the capturing services
# ======================================================================================================

class AsOfProvider:
    """A DataProvider over full histories that serves every series as of `set_asof(date)`.

    * daily_bars / vix: rows dated on or before the as-of date (the 22:17 ET run sees that day's close);
    * btc_daily_utc: UTC days on or before the as-of date (the UTC day ends at 19:00/20:00 ET);
    * tbill_rate: the last DTB3 print dated before the as-of date (H.15 publishes a day late);
    * second_source_close, `second_source="echo"` (default): the primary close echoed with source
      "replay-echo" (flagged, counted in `echoes`), so every two-source check passes;
      `second_source="history"`: the historical second source the live system would query (Nasdaq for SPY,
      FRED SP500 for ^GSPC, from `History.second`), None when it has no close that day (fail closed).

    `cut=False` serves full histories (the T-bill rate stays as-of: that call carries no date). It is a
    look-ahead diagnostic: decisions must not change, because the pipeline must cut at the run date itself.
    `served_after_asof` counts calls that returned data dated after the as-of date.
    """

    def __init__(self, history: History, *, cut: bool = True, second_source: str = "echo") -> None:
        if second_source not in ("echo", "history"):
            raise ValueError(f"second_source must be 'echo' or 'history', not {second_source!r}")
        self.h = history
        self.cut = cut
        self.second_source = second_source
        self.asof: pd.Timestamp | None = None
        self.sources: dict[str, str] = {}
        self.echoes: list[tuple[str, str]] = []
        self.second_calls: list[tuple[str, str, str | None]] = []   # (ticker, date, source or None)
        self.served_after_asof = 0
        self.calls = 0

    def set_asof(self, date: str) -> None:
        self.asof = pd.Timestamp(date).normalize()

    def _asof(self) -> pd.Timestamp:
        if self.asof is None:
            raise RuntimeError("AsOfProvider: call set_asof(date) before serving data")
        return self.asof

    def _serve(self, obj: Any) -> Any:
        self.calls += 1
        asof = self._asof()
        out = obj.loc[:asof] if self.cut else obj
        if len(out) and out.index[-1] > asof:
            self.served_after_asof += 1
        return out.copy()

    def daily_bars(self, ticker: str) -> pd.DataFrame:
        if ticker not in self.h.bars:
            raise DataError(f"replay: no cached bars for {ticker}")
        self.sources[f"daily_bars:{ticker}"] = self.h.sources.get(f"daily_bars:{ticker}", "yfinance")
        return self._serve(self.h.bars[ticker])

    def vix(self, name: str = "VIX") -> pd.Series:
        key = name.strip().upper().lstrip("^")
        if key not in self.h.vix:
            raise DataError(f"replay: no cached {key} series")
        self.sources[f"vix:{key}"] = self.h.sources.get(f"vix:{key}", "cboe")
        return self._serve(self.h.vix[key]).rename(key)

    def btc_daily_utc(self) -> pd.Series:
        self.sources["btc_daily_utc"] = self.h.sources.get("btc_daily_utc", "coinbase")
        out = self._serve(self.h.btc)
        if out.empty:
            raise DataError("replay: no BTC closes as of this date")
        return out

    def tbill_rate(self) -> float:
        before = self.h.tbill.loc[: self._asof() - pd.Timedelta(days=1)].dropna()
        if before.empty:
            raise DataError("replay: no DTB3 print before this date")
        self.sources["tbill_rate"] = self.h.sources.get("tbill_rate", "fred:DTB3")
        return float(before.iloc[-1])

    def second_source_close(self, ticker: str, date: str) -> dict | None:
        day = pd.Timestamp(date).normalize()
        if ticker == BTC_TICKER:
            # G2's Sunday close comes from Coinbase (`btc_daily_utc`); the live fallbacks know today only, so the
            # pipeline then reads Yahoo's BTC-USD bar for that UTC day (`daily_bars`), a real second source. No echo.
            found = None
        else:
            found = None if day > self._asof() else (
                self._echo(ticker, day) if self.second_source == "echo" else self._historical(ticker, day))
        self.second_calls.append((ticker, day.strftime("%Y-%m-%d"), found["source"] if found else None))
        return found

    def _echo(self, ticker: str, day: pd.Timestamp) -> dict | None:
        frame = self.h.bars.get(ticker)
        if frame is None or day not in frame.index:
            return None
        close = frame.at[day, "close"]
        if isinstance(close, pd.Series):
            close = close.iloc[-1]
        if not (isinstance(close, (int, float, np.floating)) and math.isfinite(float(close))):
            return None
        self.echoes.append((ticker, day.strftime("%Y-%m-%d")))
        return {"close": float(close), "source": ECHO_SOURCE}

    def _historical(self, ticker: str, day: pd.Timestamp) -> dict | None:
        source, closes = self.h.second.get(ticker, (None, None))
        if closes is None or day not in closes.index or not math.isfinite(float(closes.loc[day])):
            return None
        return {"close": float(closes.loc[day]), "source": source}


class CaptureServices:
    """pipeline.Services stubs: capture every email (and re-validate it), open no issues, send no pings."""

    def __init__(self, email_dir: Path | None = None, *, first_n: int = 1) -> None:
        self.emails: list[dict] = []
        self.issue_calls = 0
        self.pings: list[tuple[str, str]] = []
        self.run_key = ""
        self.email_dir = email_dir
        self.first_n = first_n            # numbering continues across a resumed replay
        if email_dir is not None:
            email_dir.mkdir(parents=True, exist_ok=True)

    def services(self) -> pipeline.Services:
        return pipeline.Services(send=self._send, create_issue=self._issue, healthcheck=self._ping,
                                 fetch_comments=lambda url: None)

    def _send(self, email: Any, *, dry_run: bool, outbox: Path) -> dict:
        errors = validator.validate(email)
        n = self.first_n + len(self.emails)
        meta = dict(email.meta or {})
        entry = {"n": n, "run": self.run_key, "kind": meta.get("kind"), "trade_id": meta.get("trade_id"),
                 "subject": email.subject, "validator_errors": len(errors), "errors": errors[:3],
                 "chars": len(email.text or "")}
        if self.email_dir is not None:
            name = f"{n:04d}_{self.run_key.replace(':', '_')}_{meta.get('kind') or 'EMAIL'}.txt"
            (self.email_dir / name).write_text(f"Subject: {email.subject}\n\n{email.text}\n", encoding="utf-8")
            entry["file"] = name
        self.emails.append(entry)
        return {"sent": True, "id": f"replay-{n}"}

    def _issue(self, title: str, body: str, labels: list[str] | None = None) -> str | None:
        self.issue_calls += 1
        return None

    def _ping(self, status: str) -> None:
        self.pings.append((self.run_key, status))


# ======================================================================================================
# 3. The replay loop
# ======================================================================================================

def schedule(start: str, end: str) -> list[tuple[str, str, str]]:
    """(kind, run date or month, as-of date) in production order: monthly on the 1st (08:13 ET) for the month
    that just ended, daily Monday to Friday (22:17 ET), weekly on Sunday night."""
    out = []
    first = pd.Timestamp(start)
    for day in pd.date_range(start, end, freq="D"):
        d = day.strftime("%Y-%m-%d")
        if day.day == 1 and day > first:
            prev = day - pd.Timedelta(days=1)
            out.append(("monthly", prev.strftime("%Y-%m"), prev.strftime("%Y-%m-%d")))
        if day.weekday() < 5:
            out.append(("daily", d, d))
        elif day.weekday() == 6:
            out.append(("weekly", d, d))
    return out


def _last_done(state_dir: Path) -> str | None:
    """The as-of date of the latest completed run in an existing state (for --resume)."""
    path = state_dir / "state.json"
    if not path.exists():
        return None
    runs = json.loads(path.read_text()).get("runs", {})
    best = None
    for key in runs:
        kind, _, when = key.partition(":")
        if kind == "init":
            continue
        if kind == "monthly":
            when = (pd.Timestamp(when + "-01") + pd.offsets.MonthEnd(0)).strftime("%Y-%m-%d")
        best = max(best or when, when)
    return best


def replay(cfg: Config, provider: AsOfProvider, state_dir: Path, start: str, end: str,
           capture: CaptureServices, *, resume: bool = False, progress_every: int = 21) -> list[dict]:
    """Run init, then every scheduled run from `start` to `end` through the real pipeline.

    Returns one row per run: {"kind", "date", "asof", "status", "seconds", "notes", "emails", "fills",
    "alerts", "error"}. A run that raises is recorded with its error and the replay goes on (the next run's
    ledger check marks the orphaned records with a correction).
    """
    state_dir = Path(state_dir)
    rows: list[dict] = []
    begin, done = start, None
    if resume and (state_dir / "state.json").exists():
        done = _last_done(state_dir)
        if done:
            begin = (pd.Timestamp(done) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
            LOG(f"resuming after {done}")
    else:
        pipeline.run_init(cfg, state_dir, created=start)
    services = capture.services()
    runners = {
        "daily": lambda d: pipeline.run_daily(cfg, provider, state_dir, date=d, services=services),
        "weekly": lambda d: pipeline.run_weekly(cfg, provider, state_dir, date=d, services=services),
        "monthly": lambda m: pipeline.run_monthly(cfg, provider, state_dir, month=m, services=services),
    }
    # A month's review runs on the 1st with the month's last day as its as-of date: when the earlier segment ended on
    # that last day, the review is still due (the Phase C4b chunks skipped five of them before this was added).
    plan = [p for p in schedule(start, end) if p[2] >= begin or (p[0] == "monthly" and p[2] == done)]
    t_start = time.perf_counter()
    for i, (kind, when, asof) in enumerate(plan, start=1):
        provider.set_asof(asof)
        capture.run_key = f"{kind}:{when}"
        emails_before = len(capture.emails)
        t0 = time.perf_counter()
        row = {"kind": kind, "date": when, "asof": asof, "status": None, "seconds": None, "notes": 0,
               "emails": 0, "fills": 0, "alerts": 0, "nav": None, "error": None}
        try:
            res = runners[kind](when)
            row.update(status=res.status, notes=len(res.notes), fills=len(res.fills), nav=res.nav,
                       alerts=sum(1 for n in res.notes if str(n).startswith("ALERT ")))
        except Exception as exc:  # noqa: BLE001 - record, then go on: every failure is a finding
            row.update(status="exception", error=f"{type(exc).__name__}: {exc}",
                       traceback="".join(traceback.format_exception(exc))[-2000:])
        row["seconds"] = round(time.perf_counter() - t0, 4)
        row["emails"] = len(capture.emails) - emails_before
        rows.append(row)
        if row["status"] == "exception":
            LOG(f"  EXCEPTION {kind} {when}: {row['error']}")
        if progress_every and kind == "daily" and i % progress_every == 0:
            el = time.perf_counter() - t_start
            LOG(f"  {asof} runs {i}/{len(plan)} NAV {row['nav'] or float('nan'):,.0f} "
                f"{el / 60:.1f} min ({el / i:.3f} s/run, last {row['seconds']:.3f} s)")
    return rows


# ======================================================================================================
# 4. What the pipeline did (state and ledger -> frames)
# ======================================================================================================

def ledger_records(state_dir: Path) -> list[dict]:
    with open(Path(state_dir) / "ledger.jsonl", encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def _signal_date(trade_id: str) -> str | None:
    parts = str(trade_id).split("-")
    return "-".join(parts[1:4]) if len(parts) >= 5 else None


def pipeline_trades(state: dict, records: list[dict]) -> pd.DataFrame:
    """One row per M1 / M3 / W10 trade (closed, open or pending at the end), with fills and dividends."""
    fills: dict[str, dict] = {}
    for r in records:
        if r["record_type"] != "fill":
            continue
        p = r["payload"]
        if p.get("type") == "dividend" or not p.get("trade_id"):
            continue
        f = fills.setdefault(p["trade_id"], {"cost": 0.0, "proceeds": 0.0, "dividends": 0.0, "qty": 0.0})
        if p["side"] == "buy":
            f["cost"] += float(p["dollars"])
            f["qty"] += float(p["qty"])
        else:
            f["proceeds"] += float(p["dollars"])
            f["dividends"] += float(p.get("dividends") or 0.0)
    rows = []
    for mod in ("M1", "M3", "W10"):
        ms = state["modules"].get(mod) or {}
        items = [dict(h, status="closed") for h in ms.get("history", [])]
        ot = ms.get("open_trade")
        if ot:
            items.append({"trade_id": ot["trade_id"], "module": mod, "entry_date": ot.get("fill_date"),
                          "entry_price": ot.get("entry_price"), "exit_date": None, "exit_price": None,
                          "return": None, "pnl": None, "exit_reason": ot.get("exit_reason"),
                          "status": ot.get("status")})
        for h in items:
            f = fills.get(h["trade_id"], {})
            cost = f.get("cost") or None
            total = ((f["proceeds"] + f["dividends"]) / cost - 1.0) if cost and f.get("proceeds") else None
            rows.append({"module": mod, "trade_id": h["trade_id"], "signal": _signal_date(h["trade_id"]),
                         "entry": h.get("entry_date"), "exit": h.get("exit_date"),
                         "entry_px": h.get("entry_price"), "exit_px": h.get("exit_price"),
                         "ret_price": h.get("return"), "ret_total": total, "cost": cost,
                         "pnl": h.get("pnl"), "dividends": f.get("dividends"), "reason": h.get("exit_reason"),
                         "status": h.get("status")})
    return pd.DataFrame(rows)


def m2_decisions(records: list[dict], marks: pd.DataFrame) -> pd.DataFrame:
    """M2 monthly decisions per leg: signal, raw fraction, final target (fraction of NAV) and scalers."""
    nav = marks.set_index("date")["nav"] if len(marks) else pd.Series(dtype=float)
    rows = []
    for r in records:
        p = r["payload"]
        if r["record_type"] != "signal" or p.get("module") != "M2" or p.get("check") != "monthly":
            continue
        d = r["as_of"]
        n = float(nav.get(d, np.nan))
        sc = p.get("scalers") or {}
        for leg, s in (p.get("signals") or {}).items():
            tgt = (p.get("targets") or {}).get(leg)
            rows.append({"date": d, "leg": leg, "ret_252": s.get("ret_252"), "excess": s.get("excess"),
                         "sign": s.get("sign"), "vol": s.get("vol"), "raw_frac": s.get("raw_target_frac"),
                         "target_usd": tgt, "nav": n, "target_frac": (tgt / n) if (tgt is not None and n) else None,
                         "gross_scaler": sc.get("gross_cap"), "us_eq_scaler": sc.get("us_equity_stress"),
                         "leg_cap": (sc.get("single_leg_cap") or {}).get(leg),
                         "veto_checked": (p.get("veto") or {}).get("roll_yield") is not None})
    return pd.DataFrame(rows)


def m3_weeks(records: list[dict]) -> pd.DataFrame:
    rows = []
    for r in records:
        p = r["payload"]
        if r["record_type"] == "signal" and p.get("module") == "M3" and p.get("check") == "weekly":
            rows.append({"run": r["as_of"], "week_end": p.get("week_end"), "on": bool(p.get("on")),
                         "weekly_close": p.get("weekly_close"), "sma": p.get("sma")})
    return pd.DataFrame(rows)


def m1_checks(records: list[dict]) -> dict[str, dict]:
    """The M1 entry check logged on each date (why a research signal did or did not fire here)."""
    out = {}
    for r in records:
        p = r["payload"]
        if r["record_type"] == "signal" and p.get("module") == "M1" and p.get("check") == "entry":
            out[r["as_of"]] = p
    return out


def fills_frame(records: list[dict]) -> pd.DataFrame:
    rows = []
    for r in records:
        p = r["payload"]
        if r["record_type"] == "fill" and p.get("type") != "dividend" and p.get("intent_id"):
            rows.append({k: p.get(k) for k in ("fill_date", "module", "trade_id", "ticker", "side", "qty",
                                                "price", "ref_price", "dollars")})
        elif r["record_type"] == "fill" and p.get("type") == "dividend":
            rows.append({"fill_date": p.get("ex_date"), "module": None, "trade_id": None, "ticker": p.get("ticker"),
                         "side": "dividend", "qty": None, "price": p.get("per_share"), "ref_price": None,
                         "dollars": p.get("amount")})
    return pd.DataFrame(rows)


# ======================================================================================================
# 5. Research lists (tracks 13, 23 on disk; track 15 recomputed with its own code)
# ======================================================================================================

ST1_FILE = "finalist_trades_ST_1_dip_buy_SPY_RSI2_10_SMA200_VIX_20_exit_close_SMA5_cap_20_ne.csv"
ST1B_FILE = "finalist_trades_ST_1b_dip_buy_SPY_without_VIX_gate_exit_close_SMA5.csv"


def research_st1(which: str = "ST1") -> pd.DataFrame:
    """Track 13's trade list for ST-1 (M1) or ST-1b (the shadow book): signal, entry, exit, net, ..."""
    name = ST1_FILE if which == "ST1" else ST1B_FILE
    return pd.read_csv(RESEARCH / "13-short-index" / "results" / name)


def research_w10(rule: str = "CAL90", version: str = "one at a time", sample: str = "SPY 1993-2026") -> pd.DataFrame:
    name = "w10_trades_one_at_a_time.csv" if version == "one at a time" else "w10_events_all.csv"
    df = pd.read_csv(RESEARCH / "23-duration-verify" / "results" / name)
    return df[(df["sample"] == sample) & (df["rule"] == rule) & (df["version"] == version)].reset_index(drop=True)


def _track15():
    """Import track 15's research modules (they read, or build, their own cache)."""
    here = str(RESEARCH / "15-short-futures-crypto")
    if here not in sys.path:
        sys.path.insert(0, here)
    import assets  # noqa: PLC0415
    import common  # noqa: PLC0415
    import p1_trend  # noqa: PLC0415
    import p3_crypto  # noqa: PLC0415
    return assets, common, p1_trend, p3_crypto


ETF8 = ["SPY", "QQQ", "IEF", "GLD", "USO", "FXE", "FXY", "FXA"]


def research_r1(scale: float = 0.5) -> dict[str, Any]:
    """Track 15 R1 long-only ETF8 (p1b_robust.py): daily re-decided weights (H=1, to sample at M2's decision
    dates), the H=21 book as tested, its daily net excess stream, and its sign and EWMA vol inputs."""
    A, C, P, _ = _track15()
    RE, _cls = A.etf_universe(start="2004-01-01")
    R8 = RE[ETF8]
    cls8 = {t: _cls[t] for t in ETF8}
    daily_w, sig = P.tsmom_weights(R8, [252], 1, long_only=True)
    book_w, _ = P.tsmom_weights(R8, [252], 21, long_only=True)
    costs, borrow, roll = P.cost_vectors(R8.columns, cls8, "etf")
    out = P.run_portfolio(R8, book_w, costs, borrow, roll)
    vol = P.ewma_vol(R8)
    return {"w_daily": daily_w * scale, "sig": sig, "vol": vol, "book": out, "scale": scale, "R": R8}


def research_r2() -> dict[str, Any]:
    """Track 15 R2 (p3_crypto.py): the BTC weekly close vs its 10-week average, per week (W-SUN), on the
    research's own BTC series (Coin Metrics reference rate spliced with Yahoo)."""
    _, _, _, P3 = _track15()
    px = P3.load("btc")
    wk = px.resample("W-SUN").last()
    ma = wk.rolling(10).mean()
    on = (wk > ma).where(ma.notna())
    return {"px": px, "weekly": pd.DataFrame({"weekly_close": wk, "sma": ma, "on": on})}


# ======================================================================================================
# 6. Reconciliation (pure functions on frames; used by the tests too)
# ======================================================================================================

def match_trades(pipe: pd.DataFrame, research: pd.DataFrame, start: str, end: str, *,
                 key: str = "signal") -> pd.DataFrame:
    """Match pipeline and research trades on their signal date within [start, end].

    `pipe` needs signal, entry, exit, ret (the pipeline's return); `research` needs signal, entry, exit, net.
    Returns one row per trade with status "matched", "missed" (research only) or "extra" (pipeline only),
    and for matched trades whether the entry/exit dates agree and the return difference (pipeline - research).
    """
    r = research[(research[key] >= start) & (research[key] <= end)].copy()
    p = pipe[(pipe[key] >= start) & (pipe[key] <= end)].copy()
    rows = []
    rk = {row[key]: row for _, row in r.iterrows()}
    pk = {row[key]: row for _, row in p.iterrows()}
    for k in sorted(set(rk) | set(pk)):
        a, b = pk.get(k), rk.get(k)
        row = {"signal": k, "status": "matched" if (a is not None and b is not None) else
               ("extra" if a is not None else "missed")}
        if b is not None:
            row.update(res_entry=b["entry"], res_exit=b["exit"], res_ret=float(b["net"]))
        if a is not None:
            row.update(pipe_entry=a["entry"], pipe_exit=a["exit"],
                       pipe_ret=None if pd.isna(a.get("ret")) else float(a["ret"]))
        if a is not None and b is not None:
            row["same_entry"] = str(a["entry"]) == str(b["entry"])
            row["same_exit"] = str(a["exit"]) == str(b["exit"])
            if row.get("pipe_ret") is not None:
                row["ret_diff"] = row["pipe_ret"] - row["res_ret"]
        rows.append(row)
    cols = ["signal", "status", "pipe_entry", "res_entry", "pipe_exit", "res_exit", "same_entry", "same_exit",
            "pipe_ret", "res_ret", "ret_diff"]
    out = pd.DataFrame(rows)
    for c in cols:
        if c not in out.columns:
            out[c] = None
    return out[cols]


def match_switches(pipe_weeks: pd.DataFrame, research_weeks: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    """Per week_end: the pipeline's switch state vs the research's, and the switch events (on/off changes)."""
    p = pipe_weeks.drop_duplicates("week_end", keep="last").set_index("week_end")["on"]
    r = research_weeks["on"].copy()
    r.index = r.index.strftime("%Y-%m-%d")
    weeks = sorted(w for w in set(p.index) | set(r.index) if start <= w <= end)
    rows, prev_p, prev_r = [], None, None
    for w in weeks:
        a = None if w not in p.index else bool(p[w])
        b = None if (w not in r.index or pd.isna(r[w])) else bool(r[w])
        ev_p = None if (a is None or prev_p is None or a == prev_p) else ("on" if a else "off")
        ev_r = None if (b is None or prev_r is None or b == prev_r) else ("on" if b else "off")
        agree = (a == b) if (a is not None and b is not None) else None
        rows.append({"week_end": w, "pipe_on": a, "res_on": b, "agree": agree, "pipe_event": ev_p, "res_event": ev_r})
        prev_p = a if a is not None else prev_p
        prev_r = b if b is not None else prev_r
    return pd.DataFrame(rows)


def event_summary(df: pd.DataFrame) -> dict[str, int]:
    """Switch events: matched (same week and direction), missed (research only), extra (pipeline only)."""
    m = x = e = 0
    for _, row in df.iterrows():
        a = row["pipe_event"] if isinstance(row["pipe_event"], str) else None
        b = row["res_event"] if isinstance(row["res_event"], str) else None
        if a and b and a == b:
            m += 1
        else:
            if b:
                x += 1
            if a:
                e += 1
    return {"matched": m, "missed": x, "extra": e}


def max_drawdown(nav: pd.Series) -> tuple[float, str | None, str | None]:
    """(max drawdown as a positive fraction, peak date, trough date)."""
    if nav.empty:
        return 0.0, None, None
    peak = nav.cummax()
    dd = 1.0 - nav / peak
    trough = dd.idxmax()
    peak_date = nav.loc[:trough].idxmax()
    return float(dd.max()), str(peak_date)[:10], str(trough)[:10]


# ======================================================================================================
# 7. Outputs: one replay segment -> frames on disk; all segments -> the reconciliation CSVs
# ======================================================================================================

EMAIL_COLS = ["n", "run", "kind", "trade_id", "subject", "validator_errors", "chars", "file"]
_ADDITIVE = ("wall_seconds", "second_source_calls", "second_source_missing", "echoes", "served_after_asof",
             "provider_calls", "issue_calls", "validator_errors_in_sent_emails")


def save_segment(work: Path, rows: list[dict], capture: CaptureServices, provider: AsOfProvider,
                 history: History, start: str, end: str, wall: float, *, prior: dict | None = None,
                 prior_emails: pd.DataFrame | None = None, extra: dict | None = None) -> None:
    """Write what the replay did next to its state: runs, emails, echoes, flags and timings.

    On a resumed replay, `prior` (the earlier segment.json) and `prior_emails` are carried forward, so the
    files describe the whole window. `extra` (the book override, the governor flag) is added to segment.json.
    """
    work.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(work / "runs.csv", index=False)
    em = pd.DataFrame(capture.emails, columns=EMAIL_COLS + ["errors"]).drop(columns=["errors"])
    if prior_emails is not None and len(prior_emails):
        em = pd.concat([prior_emails, em], ignore_index=True)
    em.to_csv(work / "emails.csv", index=False)
    calls = pd.DataFrame(provider.second_calls, columns=["ticker", "date", "source"])
    meta = {"start": start, "end": end, "wall_seconds": round(wall, 1), "runs": len(rows),
            "second_source_mode": provider.second_source, "second_source_calls": len(calls),
            "second_source_missing": int(calls["source"].isna().sum()),
            "echoes": len(provider.echoes), "echo_tickers": sorted({t for t, _ in provider.echoes}),
            "served_after_asof": provider.served_after_asof, "provider_calls": provider.calls,
            "issue_calls": capture.issue_calls,
            "pings": pd.Series([s for _, s in capture.pings]).value_counts().to_dict() if capture.pings else {},
            "flags": history.flags, "cut": provider.cut,
            "validator_errors_in_sent_emails": sum(e["validator_errors"] for e in capture.emails)}
    for key in _ADDITIVE if prior else ():
        meta[key] = round(meta[key] + (prior.get(key) or 0), 1)
    if prior:
        meta["echo_tickers"] = sorted(set(meta["echo_tickers"]) | set(prior.get("echo_tickers") or []))
        meta["pings"] = {k: meta["pings"].get(k, 0) + (prior.get("pings") or {}).get(k, 0)
                         for k in set(meta["pings"]) | set(prior.get("pings") or {})}
    meta.update(extra or {})
    (work / "segment.json").write_text(json.dumps(meta, indent=1, default=str) + "\n")


def run_segment(cfg: Config, history: History, work: Path, start: str, end: str, *, resume: bool = False,
                cut: bool = True, second_source: str = "echo", book: str | None = None,
                extra: dict | None = None) -> None:
    """One replay segment into `work`. `book` is the config override's name (`g1-only`: `cfg` must already be
    `g1_only_config`'s, and the Sunday job's G2 leg is skipped while it runs); `extra` goes into segment.json."""
    state_dir = work / "state"
    if not resume and state_dir.exists() and any(state_dir.iterdir()):
        raise SystemExit(f"{state_dir} is not empty; use --resume or a fresh --work directory")
    prior = prior_emails = prior_rows = None
    if resume and (work / "segment.json").exists():
        prior = json.loads((work / "segment.json").read_text())
        prior_rows = pd.read_csv(work / "runs.csv").to_dict("records")
        prior_emails = pd.read_csv(work / "emails.csv")
    provider = AsOfProvider(history, cut=cut, second_source=second_source)
    capture = CaptureServices(work / "emails", first_n=len(prior_emails) + 1 if prior_emails is not None else 1)
    LOG(f"replay {start} -> {end} into {work}" + (f" (book {book})" if book else ""))
    t0 = time.perf_counter()
    with book_patches(book):
        rows = replay(cfg, provider, state_dir, start, end, capture, resume=resume)
    wall = time.perf_counter() - t0
    save_segment(work, (prior_rows or []) + rows, capture, provider, history, start, end, wall, prior=prior,
                 prior_emails=prior_emails, extra={"book": book, **(extra or {})})
    LOG(f"done in {wall / 60:.1f} min")


def _fmt(x: Any, nd: int = 4) -> Any:
    if isinstance(x, (float, np.floating)):
        return None if not math.isfinite(float(x)) else round(float(x), nd)
    return x


def _round(df: pd.DataFrame, nd: int = 5) -> pd.DataFrame:
    out = df.copy()
    for c in out.columns:
        if pd.api.types.is_float_dtype(out[c]):
            out[c] = out[c].round(nd)
    return out


def reconcile(cfg: Config, works: list[Path], out: Path, *, history: History | None = None,
              compare: Path | None = None) -> dict:
    """Compare the replay segments in `works` with the research lists and write the CSV summaries to `out`.

    `history` (the replay's data) is needed for the M2 sleeve's returns and the IBIT-proxy flag on M3 trades.
    `compare`: another replay of the same window (e.g. with --second-source history) whose decisions are
    compared with the first segment's.
    """
    out.mkdir(parents=True, exist_ok=True)
    summary: list[dict] = []

    def put(section: str, name: str, value: Any, note: str = "") -> None:
        summary.append({"section": section, "metric": name, "value": _fmt(value), "note": note})

    if compare is not None:
        other = json.loads((Path(compare) / "segment.json").read_text())
        cmp_ = compare_runs(works[0], compare)
        sect = "cross-check replay"
        put(sect, "second-source mode of the cross-check", None, str(other.get("second_source_mode")))
        put(sect, "same decisions as the main replay", int(cmp_["identical"]),
            f"{cmp_['records_a']} vs {cmp_['records_b']} decision records; "
            f"first difference: {cmp_['first_difference']}")
        put(sect, "second-source calls without a close (fail closed)", other.get("second_source_missing"))
        put(sect, "days the SPY two-source check failed", len(cmp_["spy_check_failures"]),
            ", ".join(cmp_["spy_check_failures"][:10]))
        put(sect, "W10 signals unconfirmed by the second source", len(cmp_["w10_unconfirmed"]),
            ", ".join(cmp_["w10_unconfirmed"][:10]))

    all_trades, all_m2, all_m3, all_alerts, all_marks, all_runs, all_emails = [], [], [], [], [], [], []
    shadow_st1b, shadow_w10, m1chk, fills, adm = [], [], {}, [], []
    segs = []
    for w in works:
        seg = json.loads((w / "segment.json").read_text())
        state = json.loads((w / "state" / "state.json").read_text())
        recs = ledger_records(w / "state")
        marks = pd.DataFrame(state.get("marks", []))
        tr = pipeline_trades(state, recs)
        tr["segment"] = f"{seg['start']}..{seg['end']}"
        all_trades.append(tr)
        adm.append(admissions(recs))
        all_m2.append(m2_decisions(recs, marks).assign(segment=tr["segment"].iloc[0] if len(tr) else ""))
        all_m3.append(m3_weeks(recs))
        al = pd.DataFrame(state.get("alerts", []))
        all_alerts.append(al)
        marks["segment"] = f"{seg['start']}..{seg['end']}"
        all_marks.append(marks)
        runs = pd.read_csv(w / "runs.csv")
        runs["segment"] = f"{seg['start']}..{seg['end']}"
        all_runs.append(runs)
        em = pd.read_csv(w / "emails.csv") if (w / "emails.csv").stat().st_size > 1 else pd.DataFrame()
        all_emails.append(em)
        st1b = pd.DataFrame(state["shadow"]["ST1B"].get("trades", []))
        shadow_st1b.append(st1b)
        shadow_w10.append(pd.DataFrame(state["shadow"]["W10"].get("events", [])))
        m1chk.update(m1_checks(recs))
        fills.append(fills_frame(recs))
        ok, why = pipeline.verify_ledger(w / "state")
        seg.update(ledger_ok=ok, ledger=why, records=len(recs))
        segs.append(seg)

    trades = pd.concat(all_trades, ignore_index=True)
    runs = pd.concat(all_runs, ignore_index=True)
    marks = pd.concat(all_marks, ignore_index=True)
    alerts = pd.concat(all_alerts, ignore_index=True) if any(len(a) for a in all_alerts) else pd.DataFrame(
        columns=["date", "run", "kind", "message"])
    emails = pd.concat(all_emails, ignore_index=True) if any(len(e) for e in all_emails) else pd.DataFrame()
    windows = [(s["start"], s["end"]) for s in segs]

    # ---- operations -------------------------------------------------------------------------------
    for s in segs:
        tag = f"{s['start']}..{s['end']}"
        r = runs[runs["segment"] == tag]
        daily = r[r["kind"] == "daily"]
        days = (pd.Timestamp(s["end"]) - pd.Timestamp(s["start"])).days + 1
        put("runtime", f"wall minutes [{tag}]", s["wall_seconds"] / 60.0)
        put("runtime", f"runs [{tag}]", len(r))
        put("runtime", f"seconds per calendar day replayed [{tag}]", s["wall_seconds"] / days, f"{days} days")
        put("runtime", f"seconds per daily run, mean [{tag}]", daily["seconds"].mean())
        put("runtime", f"seconds per daily run, last 20 [{tag}]", daily["seconds"].tail(20).mean(),
            "grows with the ledger: every run re-verifies the whole hash chain")
        if s.get("second_source_mode", "echo") == "echo":
            put("data", f"second-source echoes [{tag}]", s["echoes"],
                "second source = the primary close echoed as 'replay-echo' (flagged): every two-source check "
                "passed by construction")
        else:
            put("data", f"second-source calls, historical Nasdaq/FRED [{tag}]", s["second_source_calls"],
                f"{s['second_source_missing']} without a close (fail closed)")
        put("data", f"data served after the as-of date [{tag}]", s["served_after_asof"], "0 = no look-ahead")
        put("ledger", f"ledger verifies [{tag}]", int(bool(s["ledger_ok"])), s["ledger"])
        for k, v in (s.get("flags") or {}).items():
            put("data", f"flag {k} [{tag}]", None, v)
    for status, n in runs["status"].value_counts().items():
        put("runs", f"status {status}", int(n))
    exc = runs[runs["status"] == "exception"]
    if len(exc):
        exc[["segment", "kind", "date", "error"]].to_csv(out / "run_errors.csv", index=False)

    # ---- alerts, validator ------------------------------------------------------------------------
    if len(alerts):
        g = alerts.groupby("kind").agg(count=("message", "size"), first=("date", "min"), last=("date", "max"),
                                       example=("message", "first")).reset_index()
        g["example"] = g["example"].str.slice(0, 160)
        g.to_csv(out / "alerts_by_kind.csv", index=False)
        for _, row in g.iterrows():
            put("alerts", f"alerts: {row['kind']}", int(row["count"]))
    put("validator", "validator alerts (blocked emails)",
        int((alerts["kind"] == "validator").sum()) if len(alerts) else 0)
    put("validator", "validator errors in sent emails (re-validated)",
        int(emails["validator_errors"].sum()) if len(emails) else 0)
    put("emails", "emails captured", len(emails))
    if len(emails):
        for k, n in emails["kind"].value_counts().items():
            put("emails", f"emails {k}", int(n))
        em = emails.assign(year=emails["run"].str.split(":").str[1].str.slice(0, 4))
        em.pivot_table(index="year", columns="kind", values="n", aggfunc="count", fill_value=0).to_csv(
            out / "emails_by_year.csv")

    # ---- admissions: signals the risk engine cut or refused ---------------------------------------
    adm_all = pd.concat(adm, ignore_index=True)
    if len(adm_all):
        for mod, g in adm_all.groupby("module"):
            put("admission", f"{mod} admissions logged", len(g))
            put("admission", f"{mod} not admitted", int((~g["ok"]).sum()),
                ", ".join(f"{b}: {n}" for b, n in g[~g["ok"]]["binding"].value_counts().items()))
            put("admission", f"{mod} admitted but cut", int((g["ok"] & g["binding"].notna()).sum()),
                ", ".join(f"{b}: {n}" for b, n in g[g["ok"]]["binding"].value_counts().items()))
        adm_all[adm_all["binding"].notna() | ~adm_all["ok"]].to_csv(out / "admissions_cut_or_refused.csv",
                                                                     index=False)

    # ---- NAV vs SPY -------------------------------------------------------------------------------
    nav_rows = []
    for tag, m in marks.groupby("segment", sort=False):
        m = m.sort_values("date")
        nav = m.set_index("date")["nav"].astype(float)
        spy = m.set_index("date")["spy_adj"].astype(float)
        yrs = (pd.Timestamp(nav.index[-1]) - pd.Timestamp(nav.index[0])).days / 365.25
        start_nav = float(sum(float(v.get("start_cash", 0) or 0) for v in cfg.account["accounts"].values()
                              if v.get("enabled", True) is not False))
        dd, pk, tr_ = max_drawdown(nav)
        spy_dd, spk, str_ = max_drawdown(spy)
        tot = nav.iloc[-1] / start_nav - 1.0
        spy_tot = spy.iloc[-1] / spy.iloc[0] - 1.0
        put("book", f"NAV start [{tag}]", start_nav)
        put("book", f"NAV end [{tag}]", nav.iloc[-1], f"on {nav.index[-1]}")
        put("book", f"total return [{tag}]", tot)
        put("book", f"CAGR [{tag}]", (1 + tot) ** (1 / yrs) - 1 if yrs > 0 else None)
        put("book", f"SPY total return [{tag}]", spy_tot, "SPY adj_close, same dates")
        put("book", f"SPY CAGR [{tag}]", (1 + spy_tot) ** (1 / yrs) - 1 if yrs > 0 else None)
        put("book", f"max drawdown [{tag}]", dd, f"peak {pk}, trough {tr_}")
        put("book", f"SPY max drawdown [{tag}]", spy_dd, f"peak {spk}, trough {str_}")
        mm = m.assign(month=m["date"].str.slice(0, 7)).groupby("month").last()
        for month, row in mm.iterrows():
            nav_rows.append({"segment": tag, "month": month, "nav": row["nav"], "drawdown": row["drawdown"],
                             "spy_tr_index": float(row["spy_adj"]) / float(spy.iloc[0])})
    _round(pd.DataFrame(nav_rows), 4).to_csv(out / "nav_monthly.csv", index=False)

    # ---- M1 vs track 13 ST-1 ----------------------------------------------------------------------
    st1 = research_st1("ST1")
    m1 = trades[trades["module"] == "M1"].assign(ret=lambda d: d["ret_total"].fillna(d["ret_price"]))
    parts = [match_trades(m1, st1, a, b) for a, b in windows]
    m1r = pd.concat(parts, ignore_index=True)
    m1_adm = adm_all[adm_all["module"] == "M1"].set_index("date") if len(adm_all) else pd.DataFrame()
    m1r["note"] = [_m1_note(row, m1chk, m1_adm) for _, row in m1r.iterrows()]
    _round(m1r).to_csv(out / "m1_vs_track13_st1.csv", index=False)
    _put_match(put, "M1 vs track 13 ST-1", m1r)

    # ---- W10 vs track 23 (CAL90, one at a time) ---------------------------------------------------
    w10r_ = research_w10("CAL90", "one at a time", "SPY 1993-2026")
    w10 = trades[trades["module"] == "W10"].assign(ret=lambda d: d["ret_total"].fillna(d["ret_price"]))
    w10r = pd.concat([match_trades(w10, w10r_, a, b) for a, b in windows], ignore_index=True)
    if history is not None:
        # track 23 prices CAL<N> exits at the close (common23.py `rule.startswith("C")` also matches "CAL");
        # re-price its trades at the open, as its docstring and the design say, to separate that from the pipeline
        w10r_ = w10r_.assign(net_open_exit=w10_reprice_open(w10r_, history.bars["SPY"]))
        w10r["res_ret_open_exit"] = w10r["signal"].map(w10r_.set_index("signal")["net_open_exit"])
        w10r["ret_diff_vs_open_exit"] = pd.to_numeric(w10r["pipe_ret"], errors="coerce") - w10r["res_ret_open_exit"]
        full = w10r_.dropna(subset=["net_open_exit"])
        sect = "W10 research base rates (SPY 1993-2026, CAL90, one at a time)"
        put(sect, "trades", len(full))
        put(sect, "win rate, exit at the close (published)", float((full["net"] > 0).mean()))
        put(sect, "win rate, exit at the open (design)", float((full["net_open_exit"] > 0).mean()))
        put(sect, "mean return, exit at the close (published)", float(full["net"].mean()))
        put(sect, "mean return, exit at the open (design)", float(full["net_open_exit"].mean()))
        put(sect, "worst return, exit at the close (published)", float(full["net"].min()))
        put(sect, "worst return, exit at the open (design)", float(full["net_open_exit"].min()))
        _round(full[["signal", "entry", "exit", "gauge_at_signal", "net", "net_open_exit"]]).to_csv(
            out / "w10_track23_cal90_repriced_open.csv", index=False)
    _round(w10r).to_csv(out / "w10_vs_track23_cal90.csv", index=False)
    _put_match(put, "W10 vs track 23 CAL90", w10r)
    if "ret_diff_vs_open_exit" in w10r:
        d = w10r["ret_diff_vs_open_exit"].dropna()
        put("W10 vs track 23 CAL90", "mean return difference vs research re-priced at the open",
            d.mean() if len(d) else None, "what is left: dividends vs adjusted prices, costs")

    # ---- shadow books -----------------------------------------------------------------------------
    sb = pd.concat(shadow_st1b, ignore_index=True) if any(len(s) for s in shadow_st1b) else pd.DataFrame()
    if len(sb):
        sb = sb.rename(columns={"signal_date": "signal", "fill_date": "entry", "exit_date": "exit", "return": "ret"})
        st1b = research_st1("ST1B")
        sbr = pd.concat([match_trades(sb, st1b, a, b) for a, b in windows], ignore_index=True)
        _round(sbr).to_csv(out / "shadow_st1b_vs_track13.csv", index=False)
        _put_match(put, "shadow ST-1b vs track 13 ST-1b", sbr)
    ev = pd.concat(shadow_w10, ignore_index=True) if any(len(s) for s in shadow_w10) else pd.DataFrame()
    wres = {r: research_w10(r, "all events", "SPY 1993-2026") for r in ("CAL60", "CAL90")}
    rows = []
    sig_dates = set(ev["signal_date"]) if len(ev) else set()
    for df in wres.values():
        sig_dates |= set(df[df["signal"].apply(lambda s: any(a <= s <= b for a, b in windows))]["signal"])
    for sdate in sorted(sig_dates):
        e = ev[ev["signal_date"] == sdate].iloc[0].to_dict() if len(ev) and sdate in set(ev["signal_date"]) else None
        row = {"signal": sdate, "in_pipeline": e is not None,
               "in_research": any(sdate in set(d["signal"]) for d in wres.values())}
        for h, rule in (("60", "CAL60"), ("90", "CAL90")):
            rr = wres[rule][wres[rule]["signal"] == sdate]
            sc = ((e or {}).get("scores") or {}).get(h) or {}
            row[f"pipe_exit_{h}"] = sc.get("exit_date")
            row[f"res_exit_{h}"] = rr["exit"].iloc[0] if len(rr) else None
            row[f"pipe_ret_{h}"] = sc.get("return")
            row[f"res_ret_{h}"] = float(rr["net"].iloc[0]) if len(rr) else None
        rows.append(row)
    w10s = pd.DataFrame(rows)
    if len(w10s):
        _round(w10s).to_csv(out / "shadow_w10_vs_track23.csv", index=False)
        put("shadow W10 vs track 23 events", "events in both", int((w10s["in_pipeline"] & w10s["in_research"]).sum()))
        put("shadow W10 vs track 23 events", "research only", int((~w10s["in_pipeline"] & w10s["in_research"]).sum()))
        put("shadow W10 vs track 23 events", "pipeline only", int((w10s["in_pipeline"] & ~w10s["in_research"]).sum()))

    # ---- the live two-source rules on every signal day, with the real historical second sources ----------
    if history is not None and history.second:
        m1_days = [d for d, c in m1chk.items() if c.get("signal") and any(a <= d <= b for a, b in windows)]
        chk = second_source_check(history, cfg, m1_days, list(ev["signal_date"]) if len(ev) else [])
        if len(chk):
            _round(chk, 6).to_csv(out / "second_source_signal_days.csv", index=False)
            sect = "two-source rule on signal days (Nasdaq SPY, FRED SP500)"
            for mod, g in chk.groupby("module"):
                bad = g[~g["ok"]]
                put(sect, f"{mod} signal days checked", len(g))
                put(sect, f"{mod} signal days the live check would block", len(bad), ", ".join(bad["date"]))
                put(sect, f"{mod} largest close difference",
                    float(g["diff"].max()) if g["diff"].notna().any() else None)

    # ---- M2 vs track 15 R1 long-only --------------------------------------------------------------
    m2 = pd.concat(all_m2, ignore_index=True)
    try:
        r1 = research_r1()
    except Exception as exc:  # noqa: BLE001 - research code or its cache unavailable
        r1 = None
        put("M2 vs track 15 R1", "research recompute", None, f"failed: {type(exc).__name__}: {exc}")
    if r1 is not None and len(m2):
        _reconcile_m2(m2, r1, pd.concat(fills, ignore_index=True), marks, out, put, history)

    # ---- M3 vs track 15 R2 ------------------------------------------------------------------------
    m3w = pd.concat(all_m3, ignore_index=True)
    try:
        r2 = research_r2()
    except Exception as exc:  # noqa: BLE001
        r2 = None
        put("M3 vs track 15 R2", "research recompute", None, f"failed: {type(exc).__name__}: {exc}")
    if r2 is not None and len(m3w):
        sw = pd.concat([match_switches(m3w, r2["weekly"], a, b) for a, b in windows], ignore_index=True)
        _round(sw).to_csv(out / "m3_weeks_vs_track15_r2.csv", index=False)
        agree = sw["agree"].dropna()
        put("M3 vs track 15 R2", "weeks compared", int(len(agree)))
        put("M3 vs track 15 R2", "weeks with the same switch state", int(agree.sum()))
        for k, v in event_summary(sw).items():
            put("M3 vs track 15 R2", f"switch events {k}", v)
        m3t = trades[trades["module"] == "M3"].copy()
        if len(m3t):
            m3t["res_style_ret"] = [_btc_hold_return(r2["px"], row) for _, row in m3t.iterrows()]
            m3t["ret"] = m3t["ret_total"].fillna(m3t["ret_price"])
            m3t["ret_diff"] = m3t["ret"] - m3t["res_style_ret"]
            first_real = history.proxy_before.get(str(cfg.module("M3")["ticker"])) if history else None
            m3t["proxy"] = m3t["entry"].astype(str) < (first_real or "0000")
            _round(m3t[["trade_id", "signal", "entry", "exit", "status", "proxy", "entry_px", "exit_px", "ret",
                        "res_style_ret", "ret_diff", "reason"]]).to_csv(out / "m3_trades.csv", index=False)
            closed = m3t[m3t["status"] == "closed"]
            put("M3 vs track 15 R2", "pipeline M3 trades (closed)", len(closed))
            put("M3 vs track 15 R2", "mean return, pipeline", closed["ret"].mean())
            put("M3 vs track 15 R2", "mean return, research style (BTC, next UTC close)",
                closed["res_style_ret"].mean())
            put("M3 vs track 15 R2", "mean return difference", closed["ret_diff"].mean())
    if history is not None:
        _m3_sleeve(pd.concat(fills, ignore_index=True), marks, history, cfg, out, put)

    # ---- trade tables, for the record ---------------------------------------------------------------
    _round(trades.drop(columns=["segment"])).to_csv(out / "pipeline_trades.csv", index=False)
    s = pd.DataFrame(summary)
    s.to_csv(out / "summary.csv", index=False)
    return {"summary": s, "segments": segs}


def second_source_check(history: History, cfg: Config, m1_days: list[str], w10_days: list[str]) -> pd.DataFrame:
    """What the live two-source rules would have said on each signal day, with the real historical second sources.

    M1 days: SPY's close vs Nasdaq's within the tolerance. W10 days: ^GSPC's close vs FRED's SP500 within the
    tolerance, and the W10 rule re-run on FRED's close (both must fire). Missing data fails closed, as live.
    """
    from traderec.modules.w10_crashbuy import w10_signal

    tol = float(cfg.data["two_source_tolerance"])
    cfg_w = cfg.constitution["modules"]["W10"]
    rows = []
    for module, ticker, days in (("M1", "SPY", m1_days), ("W10", str(cfg_w["index"]), w10_days)):
        source, second = history.second.get(ticker, (None, None))
        for d in sorted(set(days)):
            ts = pd.Timestamp(d)
            prim = history.bars[ticker]["close"].get(ts)
            sec = None if second is None else second.get(ts)
            diff = None if (prim is None or sec is None) else abs(float(sec) / float(prim) - 1.0)
            row = {"date": d, "module": module, "ticker": ticker, "primary": prim, "second": sec, "source": source,
                   "diff": diff, "ok": bool(diff is not None and diff <= tol + 1e-12)}
            if module == "W10":
                bars = history.bars[ticker].loc[:ts]
                row["rule_on_second"] = (bool(w10_signal(bars, d, cfg_w, close_override=float(sec)).get("signal"))
                                         if sec is not None else False)
                row["ok"] = row["ok"] and row["rule_on_second"]
            rows.append(row)
    return pd.DataFrame(rows)


def _m3_sleeve(fills: pd.DataFrame, marks: pd.DataFrame, history: History, cfg: Config, out: Path,
               put: Callable) -> None:
    """How big the M3 sleeve got (the pipeline sizes it at switch-on only) vs the research's constant 3%.

    Track 23's book streams (modules23.m3_on_sessions) and the design ("Sleeve <= 3% of NAV") hold a constant
    3% of NAV; the pipeline buys 3% at switch-on and never trims, so the weight drifts with Bitcoin.
    """
    ticker = str(cfg.module("M3")["ticker"])
    sleeve = float(cfg.module("M3")["sleeve_pct_nav"])
    crypto = float(cfg.risk["crypto_stress"])
    cap = float(cfg.risk["caps"]["per_trade_stress"])
    sect = "M3 sleeve size (pipeline vs research's constant 3%)"
    rows = []
    for tag, m in marks.groupby("segment", sort=False):
        m = m.sort_values("date")
        dates = pd.DatetimeIndex(pd.to_datetime(m["date"]))
        nav = pd.Series(m["nav"].astype(float).values, index=dates)
        lo, hi = m["date"].iloc[0], m["date"].iloc[-1]
        ff = fills[(fills["fill_date"].astype(str) >= lo) & (fills["fill_date"].astype(str) <= hi)]
        closes = history.bars[ticker][["close"]].rename(columns={"close": ticker}).reindex(dates).ffill()
        sl = sleeve_pnl(ff, closes, history.tbill, nav, "M3")
        held = sl["value"].shift(1).fillna(0.0) > 0
        r = closes[ticker].pct_change().fillna(0.0)
        const = (sleeve * r).where(held, 0.0)            # the same days in the market at a constant 3% of NAV
        w = sl["weight"]
        yrs = len(dates) / 252.0
        put(sect, f"max weight, % of NAV [{tag}]", float(w.max()), f"on {w.idxmax().date()}")
        put(sect, f"max stress (weight x {crypto:.0%}), % of NAV [{tag}]", float(w.max() * crypto),
            f"per-trade stress cap {cap:.0%}")
        put(sect, f"days held above 1.25 x the 3% sleeve [{tag}]", int((w > 1.25 * sleeve).sum()),
            f"of {int((w > 0).sum())} days held")
        put(sect, f"days with M3 stress above the {cap:.0%} per-trade cap [{tag}]", int((w * crypto > cap).sum()))
        put(sect, f"M3 P&L, % of NAV a year, as built [{tag}]", float(sl["pnl"].div(nav.shift(1).bfill()).sum() / yrs))
        put(sect, f"M3 P&L, % of NAV a year, at a constant 3% [{tag}]", float(const.sum() / yrs))
        month_end = w.groupby(dates.to_period("M")).last()
        for per, val in month_end.items():
            rows.append({"segment": tag, "month": str(per), "m3_weight": val})
    _round(pd.DataFrame(rows), 4).to_csv(out / "m3_sleeve_weight_monthly.csv", index=False)


DECISION_RECORDS = ("recommendation", "order", "fill", "signal", "mark", "shadow", "forecast", "resolution",
                    "growth_decision", "governor", "order_set")


_HASH_KEYS = ("record", "trigger_record")


def _is_hash(v: Any) -> bool:
    return isinstance(v, str) and len(v) == 64 and all(c in "0123456789abcdef" for c in v)


def _decision_payload(payload):
    """A decision record's payload without the ledger record ids it cites (`ids`, `facts.ids`, and the Rule E scores'
    `record` / `trigger_record` hashes, anywhere in it): those are hashes of records that carry timestamps, so two
    replays of the same decisions never share them."""
    if isinstance(payload, dict):
        return {k: _decision_payload(v) for k, v in payload.items()
                if k != "ids" and not (k in _HASH_KEYS and _is_hash(v))}
    if isinstance(payload, list):
        return [_decision_payload(v) for v in payload]
    return payload


def compare_runs(work_a: Path, work_b: Path, until: str | None = None) -> dict:
    """Whether two replays made the same decisions (ledger payloads, run manifests and record ids aside), up to
    `until`."""
    def decisions(w: Path) -> list:
        return [(r["record_type"], r["as_of"], _decision_payload(r["payload"]))
                for r in ledger_records(Path(w) / "state")
                if r["record_type"] in DECISION_RECORDS and (until is None or r["as_of"] <= until)]

    a, b = decisions(work_a), decisions(work_b)
    first = next((i for i, (x, y) in enumerate(zip(a, b, strict=False)) if x != y), None)
    if first is None and len(a) != len(b):
        first = min(len(a), len(b))
    recs_b = ledger_records(Path(work_b) / "state")
    spy_fail = [r["as_of"] for r in recs_b if r["record_type"] == "snapshot" and not r["payload"]["spy_check"]["ok"]]
    w10_unconfirmed = [r["as_of"] for r in recs_b if r["record_type"] == "shadow"
                       and r["payload"].get("event") == "unconfirmed_signal"]
    return {"records_a": len(a), "records_b": len(b), "identical": a == b,
            "first_difference": None if first is None else (a[first][:2] if first < len(a) else b[first][:2]),
            "spy_check_failures": spy_fail, "w10_unconfirmed": w10_unconfirmed}


def _put_match(put: Callable, section: str, df: pd.DataFrame) -> None:
    for status in ("matched", "missed", "extra"):
        put(section, f"trades {status}", int((df["status"] == status).sum()))
    m = df[df["status"] == "matched"]
    if len(m):
        put(section, "matched with the same entry and exit dates", int((m["same_entry"] & m["same_exit"]).sum()))
        d = pd.to_numeric(m["ret_diff"], errors="coerce").dropna()
        put(section, "mean return difference (pipeline - research)", d.mean() if len(d) else None)
        put(section, "max |return difference|", d.abs().max() if len(d) else None)
        put(section, "sum of returns, pipeline", pd.to_numeric(m["pipe_ret"], errors="coerce").sum())
        put(section, "sum of returns, research", pd.to_numeric(m["res_ret"], errors="coerce").sum())


def _m1_note(row: pd.Series, checks: dict[str, dict], adm: pd.DataFrame | None = None) -> str:
    if row["status"] == "matched":
        if not (row["same_entry"] and row["same_exit"]):
            return "dates differ"
        return ""
    c = checks.get(row["signal"])
    if c is None:
        return "no M1 entry check that day (a trade was open or pending)"
    if c.get("signal") and adm is not None and len(adm) and row["signal"] in adm.index:
        a = adm.loc[[row["signal"]]].iloc[-1]
        if not a["ok"]:
            return f"signal fired but not admitted: {a['binding']} ({a['notes'][:120]})"
    return (f"signal={c.get('signal')} close={_fmt(c.get('close'), 2)} sma200={_fmt(c.get('sma200'), 2)} "
            f"rsi2={_fmt(c.get('rsi2'), 2)} vix={_fmt(c.get('vix'), 2)}: " + "; ".join(c.get("reasons") or [])[:160])


def _btc_hold_return(px: pd.Series, row: pd.Series) -> float | None:
    """The research's execution: BTC bought at the UTC close after the signal week and sold likewise."""
    if pd.isna(row.get("signal")) or pd.isna(row.get("exit")):
        return None
    try:
        sig = pd.Timestamp(row["signal"])
        buy_week_end = sig if sig.weekday() == 6 else sig - pd.Timedelta(days=(sig.weekday() + 1) % 7)
        ent = px.loc[buy_week_end + pd.Timedelta(days=1)]
        ex_day = pd.Timestamp(row["exit"])
        sell_week_end = ex_day - pd.Timedelta(days=(ex_day.weekday() + 1) % 7)
        ex = px.loc[sell_week_end + pd.Timedelta(days=1)]
        return float(ex / ent - 1.0)
    except KeyError:
        return None


def sleeve_pnl(fills: pd.DataFrame, closes: pd.DataFrame, rf_annual: pd.Series, nav: pd.Series,
               module: str = "M2") -> pd.DataFrame:
    """One module's sleeve day by day, rebuilt from its fills and the daily closes.

    `fills` is `fills_frame` output (the module's buys and sells, plus dividend rows whose `price` is the amount
    per share); `closes` has one raw-close column per ticker on the NAV dates; `rf_annual` is DTB3 as a decimal
    (the prior print applies each day); `nav` is the book's NAV per date. Returns per date: value, flow (sells
    minus buys), dividends (the module's shares held before the ex-date x the amount), pnl, excess (pnl minus
    T-bills on the value held), contrib (excess / the previous NAV) and weight (value / NAV).
    """
    dates = nav.index
    legs = list(closes.columns)
    qty = pd.DataFrame(0.0, index=dates, columns=legs)
    flow = pd.Series(0.0, index=dates)
    div = pd.Series(0.0, index=dates)
    for _, x in fills[fills["module"] == module].iterrows():
        d = pd.Timestamp(x["fill_date"])
        sgn = 1.0 if x["side"] == "buy" else -1.0
        qty.loc[qty.index >= d, x["ticker"]] += sgn * float(x["qty"])
        if d in flow.index:
            flow.loc[d] -= sgn * float(x["dollars"])
    qty = qty.clip(lower=0.0)                   # float dust after a sell-all
    held_before = qty.shift(1).fillna(0.0)
    for _, x in fills[fills["side"] == "dividend"].iterrows():
        d = pd.Timestamp(x["fill_date"])
        if d in div.index and x["ticker"] in legs:
            div.loc[d] += float(held_before.at[d, x["ticker"]]) * float(x["price"])
    value = (qty * closes.reindex(dates).ffill()).sum(axis=1)
    pnl = value - value.shift(1).fillna(0.0) + flow + div
    rf = rf_annual.reindex(rf_annual.index.union(dates)).ffill().shift(1).reindex(dates).fillna(0.0) / 252.0
    excess = pnl - rf * value.shift(1).fillna(0.0)
    contrib = excess / nav.shift(1).fillna(nav.iloc[0])
    return pd.DataFrame({"value": value, "flow": flow, "dividends": div, "pnl": pnl, "excess": excess,
                         "contrib": contrib, "weight": value / nav})


def admissions(records: list[dict]) -> pd.DataFrame:
    """Every admission decision the pipeline logged (M1, W10, M3): ok, dollars and the binding cap."""
    rows = []
    for r in records:
        p = r["payload"]
        if r["record_type"] == "signal" and p.get("check") == "admit":
            rows.append({"date": r["as_of"], "module": p.get("module"), "ok": bool(p.get("ok")),
                         "dollars": p.get("dollars"), "binding": p.get("binding"),
                         "cluster_overflow": p.get("cluster_overflow"),
                         "notes": "; ".join(p.get("notes") or [])[:200]})
    return pd.DataFrame(rows, columns=["date", "module", "ok", "dollars", "binding", "cluster_overflow", "notes"])


def w10_reprice_open(research: pd.DataFrame, bars: pd.DataFrame, cost_bp: float = 1.0) -> pd.Series:
    """Track 23's W10 trades re-priced with the exit at the open, as its docstring and the design say.

    Same entries and exit sessions; price = open x adj_close / close (track 23's `spy()`), cost 1 bp per
    side, doubled when the signal-day VIX (gauge_at_signal) is above 30 (track 23's `trade_returns`).
    """
    a_open = bars["open"] * (bars["adj_close"] / bars["close"])
    out = []
    for _, row in research.iterrows():
        e, x = pd.Timestamp(row["entry"]), pd.Timestamp(row["exit"])
        if e not in a_open.index or x not in a_open.index:
            out.append(np.nan)
            continue
        c = (2 * cost_bp if float(row.get("gauge_at_signal") or 0) > 30 else cost_bp) / 1e4
        gross = float(a_open[x] / a_open[e] - 1.0)
        out.append((1 + gross) * (1 - c) / (1 + c) - 1)
    return pd.Series(out, index=research.index, name="net_open_exit")


def _reconcile_m2(m2: pd.DataFrame, r1: dict, fills: pd.DataFrame, marks: pd.DataFrame, out: Path,
                  put: Callable, history: History | None) -> None:
    """M2's monthly decisions vs R1 long-only recomputed on the same dates, then the sleeve's returns."""
    w, sig, vol = r1["w_daily"], r1["sig"], r1["vol"]
    rows = []
    for _, row in m2.iterrows():
        d = pd.Timestamp(row["date"])
        if d not in w.index:
            continue
        leg = row["leg"]
        res_frac = float(w.at[d, leg])
        res_sign = sig.at[d, leg]
        tf = row["target_frac"]
        rows.append({"date": row["date"], "leg": leg,
                     "pipe_sign": None if pd.isna(row["sign"]) else int(row["sign"]),
                     "res_sign": None if pd.isna(res_sign) else int(res_sign),
                     "pipe_excess": row["excess"], "pipe_vol": row["vol"], "res_vol": float(vol.at[d, leg]),
                     "pipe_raw_frac": None if pd.isna(row["raw_frac"]) else max(float(row["raw_frac"]), 0.0),
                     "res_frac": res_frac, "pipe_target_frac": None if pd.isna(tf) else float(tf)})
    df = pd.DataFrame(rows)
    if df.empty:
        return
    df["pipe_long"] = df["pipe_target_frac"].fillna(0.0) > 1e-9
    df["res_long"] = df["res_frac"] > 1e-9
    df["sign_agree"] = (df["pipe_sign"].fillna(-1) > 0) == (df["res_sign"].fillna(-1) > 0)
    cols = ["date", "leg", "pipe_sign", "res_sign", "sign_agree", "pipe_excess", "pipe_vol", "res_vol",
            "pipe_raw_frac", "res_frac", "pipe_target_frac"]
    _round(df[cols], 4).to_csv(out / "m2_targets_vs_track15_r1.csv", index=False)
    sect = "M2 vs track 15 R1"
    put(sect, "decision months", int(df["date"].nunique()))
    put(sect, "leg-months compared", len(df))
    put(sect, "leg-months long in both", int((df["pipe_long"] & df["res_long"]).sum()))
    put(sect, "leg-months flat in both", int((~df["pipe_long"] & ~df["res_long"]).sum()))
    put(sect, "leg-months long in the pipeline only", int((df["pipe_long"] & ~df["res_long"]).sum()))
    put(sect, "leg-months long in the research only", int((~df["pipe_long"] & df["res_long"]).sum()))
    put(sect, "trend-sign disagreements", int((~df["sign_agree"]).sum()),
        "pipeline: 252-session return minus today's T-bill rate; research: compounded excess over daily T-bills")
    both = df[(df["pipe_raw_frac"].fillna(0) > 0) & (df["res_frac"] > 0)]
    if len(both):
        put(sect, "median pipeline/research leg size before caps (long in both)",
            float((both["pipe_raw_frac"] / both["res_frac"]).median()), "1.0 = the same size")
        put(sect, "median pipeline/research volatility estimate", float((both["pipe_vol"] / both["res_vol"]).median()),
            "pipeline EWMA span 60 on log returns; research EWMA com 60 on excess returns")
    gross = df.groupby("date")[["pipe_target_frac", "res_frac"]].sum()
    put(sect, "mean gross target, pipeline (after its caps)", float(gross["pipe_target_frac"].mean()))
    put(sect, "mean gross target, research at s = 0.5 (no caps)", float(gross["res_frac"].mean()))
    if history is None:
        return
    rows = []
    for tag, m in marks.groupby("segment", sort=False):
        m = m.sort_values("date")
        dates = pd.DatetimeIndex(pd.to_datetime(m["date"]))
        nav = pd.Series(m["nav"].astype(float).values, index=dates)
        lo, hi = m["date"].iloc[0], m["date"].iloc[-1]
        ff = fills[(fills["fill_date"].astype(str) >= lo) & (fills["fill_date"].astype(str) <= hi)]
        closes = pd.DataFrame({t: history.bars[t]["close"] for t in ETF8}).reindex(dates).ffill()
        sl = sleeve_pnl(ff, closes, history.tbill, nav, "M2")
        res = (r1["book"]["net"] * r1["scale"]).reindex(dates).fillna(0.0)
        yrs = len(dates) / 252.0
        yr = pd.DataFrame({"pipe": sl["contrib"], "res": res}).groupby(dates.year).sum()
        for y, row in yr.iterrows():
            rows.append({"segment": tag, "year": int(y), "pipe_m2_excess": row["pipe"],
                         "res_r1_excess_s05": row["res"], "diff": row["pipe"] - row["res"]})
        put(sect, f"M2 sleeve excess return, % of NAV a year [{tag}]", float(sl["contrib"].sum() / yrs))
        put(sect, f"R1 long-only excess at s = 0.5, a year [{tag}]", float(res.sum() / yrs))
        put(sect, f"M2 sleeve P&L (prices and distributions), USD [{tag}]", float(sl["pnl"].sum()),
            f"of which distributions {float(sl['dividends'].sum()):,.0f}")
    _round(pd.DataFrame(rows), 5).to_csv(out / "m2_returns_by_year.csv", index=False)


# ======================================================================================================
# 7b. The growth book (design v4, Phase C3): the replay vs track 38 and the reference books
# ======================================================================================================

TRACK38 = RESEARCH / "38-growth-book" / "results"
TRACK38_BOOK = "2x 50% + BTC 30% + gems 15% (hist)"
BOOK_START = "2015-04-07"          # track 38: the first date with all three sleeves
TRADING_DAYS = 252


def growth_decisions(records: list[dict]) -> pd.DataFrame:
    """One row per Sunday from the `growth_decision`, `governor` and `order_set` records."""
    gov = {r["as_of"]: r["payload"] for r in records if r["record_type"] == "governor"}
    oset = {r["as_of"]: r["payload"] for r in records if r["record_type"] == "order_set"}
    rows = []
    for r in records:
        if r["record_type"] != "growth_decision":
            continue
        p, d = r["payload"], r["as_of"]
        g, o = gov.get(d, {}), oset.get(d, {})
        row = {"sunday": d, "friday": p.get("friday"), "nav_ira": (p.get("nav") or {}).get("ira"),
               "nav_total": (p.get("nav") or {}).get("total"), "peak": g.get("peak"), "drawdown": g.get("drawdown"),
               "G": g.get("G"), "G_step": g.get("step"), "hard_stop": g.get("hard_stop"), "paused": g.get("paused"),
               "g2_on": (p.get("state_after") or {}).get("G2"), "g2_signal": (p.get("G2") or {}).get("signal"),
               "g2_agree": (p.get("G2") or {}).get("agree"), "g2_complete": (p.get("G2") or {}).get("complete"),
               "g2_weekly_close": (p.get("G2") or {}).get("weekly_close"), "g2_ma10w": (p.get("G2") or {}).get("ma10w"),
               "g2_sma200": (p.get("G2") or {}).get("sma200"), "vol_cut_factor": ((p.get("vol_cut") or {}).get("factor")),
               "orders_sent": len(o.get("sent") or []), "orders_deferred": len(o.get("deferred") or []),
               "w10_dropped": len(o.get("dropped") or []),
               "sent": ";".join(f"{x['action']}:{x['ticker']}:{x['usd']:.0f}" for x in (o.get("sent") or [])),
               "reasons": ";".join(sorted({x["reason"] for x in (o.get("sent") or [])})),
               "sgov_sell_usd": (o.get("netting") or {}).get("sgov_sell_usd"),
               "sgov_buy_usd": (o.get("netting") or {}).get("sgov_buy_usd")}
        for leg, res in (p.get("G1") or {}).items():
            row[f"{leg}_in"] = (p.get("state_after") or {}).get("G1", {}).get(leg)
            row[f"{leg}_signal"] = res.get("signal")
            row[f"{leg}_agree"] = res.get("agree")
            row[f"{leg}_pct_vs_sma"] = res.get("pct_vs_sma")
            row[f"{leg}_changed"] = res.get("changed")
        rows.append(row)
    return pd.DataFrame(rows)


def ira_path(records: list[dict]) -> pd.Series:
    """The IRA's equity per daily mark (the book is the whole IRA), from the `mark` records."""
    out = {}
    for r in records:
        if r["record_type"] == "mark":
            acct = (r["payload"].get("by_account") or {}).get("ira") or {}
            if acct.get("equity") is not None:
                out[pd.Timestamp(r["payload"]["date"])] = float(acct["equity"])
    return pd.Series(out, dtype=float).sort_index()


def path_stats(nav: pd.Series, start: str | None = None, end: str | None = None) -> dict:
    """CAGR (track 38's convention: 252 sessions a year), volatility, worst drawdown, worst day, of a NAV path."""
    s = nav.dropna()
    if start:
        s = s.loc[pd.Timestamp(start):]
    if end:
        s = s.loc[:pd.Timestamp(end)]
    if len(s) < 2:
        return {"start": None, "end": None, "cagr": None, "cagr_calendar": None, "vol": None, "maxdd": None,
                "worst_day": None, "worst_day_date": None, "sessions": int(len(s))}
    r = s.pct_change().dropna()
    lw = float(np.log(s.iloc[-1] / s.iloc[0]))
    yrs_cal = (s.index[-1] - s.index[0]).days / 365.25
    dd, pk, tr = max_drawdown(s)
    return {"start": str(s.index[0].date()), "end": str(s.index[-1].date()),
            "cagr": float(np.expm1(lw / (len(r) / TRADING_DAYS))), "cagr_calendar": float(np.expm1(lw / yrs_cal)),
            "vol": float(r.std() * np.sqrt(TRADING_DAYS)), "maxdd": -dd, "maxdd_peak": pk, "maxdd_trough": tr,
            "worst_day": float(r.min()), "worst_day_date": str(r.idxmin().date()), "sessions": int(len(s))}


def calendar_year_returns(nav: pd.Series) -> pd.Series:
    """Calendar-year returns of a NAV path (the first year from its first mark)."""
    s = nav.dropna()
    ye = s.groupby(s.index.year).last()
    prev = ye.shift(1)
    prev.iloc[0] = s.iloc[0]
    return (ye / prev - 1.0).rename("ret")


def _weekly_index_states(closes: pd.Series, sundays: pd.DatetimeIndex, sma_days: int, band: float | None) -> pd.Series:
    """The G1 rule per Sunday on an index's closes: band-free (band None) or with the 2% band and hysteresis."""
    from traderec.modules.g1_lev_trend import g1_signal

    cfg = {"sma_days": sma_days, "band": 0.0 if band is None else band}
    state, out = None, {}
    for s in sundays:
        res = g1_signal(closes, iso(s), state, cfg)
        if res["signal"]:
            state = bool(res["in"])
        out[s] = state
    return pd.Series(out)


def _weekly_btc_states(btc: pd.Series, sundays: pd.DatetimeIndex, cfg_sig: dict) -> pd.Series:
    """G2's rule per Sunday (band-free, no two-source check) on the replay's BTC series."""
    from traderec.modules.g2_btc_switch import g2_signal

    out = {}
    for s in sundays:
        res = g2_signal(btc, iso(s + pd.Timedelta(days=1)), cfg_sig)
        out[s] = bool(res["on"]) if res.get("complete") else None
    return pd.Series(out)


def reference_books(history: History, cfg: Config, start: str, end: str) -> dict[str, Any]:
    """Track-38-style books rebuilt from the replay's own bars, so the differences are the rules, not the data.

    Sleeves on the real SSO / QLD bars and the IBIT (proxy) bars the pipeline used, switched at Monday's open after
    the Sunday decision (the fund's open-to-close return on a switch-in day, close-to-open on a switch-out day), the
    residual at the T-bill rate (the prior DTB3 print, per calendar day), weights re-set every session (daily
    rebalancing, no governor, no band rebalancing, no costs). Variants: `bandfree` (track 38's simulation note: the
    weekly rule without the 2% band), `band` (the pre-registered 2% band with hysteresis) and `band_governor` (the
    band plus the D40 governor on the book's own Friday drawdown, weekly).
    """
    g = cfg.constitution["growth"]
    sl = g["sleeves"]
    sessions, sundays = _reference_calendar(history, start, end)
    r_cash = _cash_returns(history, sessions)

    legs = (sl.get("G1") or {}).get("legs") or {}
    sig = (sl.get("G1") or {}).get("signal") or {}
    g2 = sl.get("G2") or {}
    btc_states = _weekly_btc_states(history.btc, sundays, g2.get("signal") or {})
    ibit = history.bars[str(g2["instrument"])]
    # G2's vol cut (design v4 §3 G2 "Kill / review"; not in track 38's simulation): the factor per Sunday
    from traderec.modules.g2_btc_switch import realized_vol, vol_cut

    vc_state: dict[str, Any] = {"vol_cut_factor": 1.0, "vol_high_since": None}
    vol_factor = pd.Series({s: vol_cut(realized_vol(history.btc, iso(s)), vc_state, iso(s), g2.get("vol_cut") or {})["factor"]
                            for s in sundays})
    factor_daily = vol_factor.reindex(sessions, method="ffill").shift(1).fillna(1.0)
    out: dict[str, Any] = {"states": {"G2": btc_states}, "books": {}, "vol_factor": vol_factor}
    for variant, band, cut in (("bandfree", None, False), ("band", float(sig.get("band", 0.02)), False),
                               ("band_volcut", float(sig.get("band", 0.02)), True)):
        book = pd.Series(0.0, index=sessions)
        w_risk = pd.Series(0.0, index=sessions)
        for leg, spec in legs.items():
            st = _weekly_index_states(history.bars[str(spec["index"])]["close"], sundays, int(sig.get("sma_days", 200)), band)
            out["states"][f"G1_{leg}_{variant}"] = st
            w = float(spec["weight"])
            book += w * _sleeve_returns(history.bars[str(leg)], st, sessions, r_cash)
            w_risk += w
        wb = float(g2.get("weight", 0.30)) * (factor_daily if cut else 1.0)
        book += wb * _sleeve_returns(ibit, btc_states, sessions, r_cash)
        w_risk += wb
        book += (1.0 - w_risk) * r_cash
        out["books"][variant] = book

    out["books"]["band_governor"], out["G_reference"] = _governed(out["books"]["band"], r_cash, sessions, g)
    out["books"]["band_volcut_governor"], _ = _governed(out["books"]["band_volcut"], r_cash, sessions, g)
    return out


def _reference_calendar(history: History, start: str, end: str) -> tuple[pd.DatetimeIndex, pd.DatetimeIndex]:
    """The sessions (SPY's bars) in [start, end] and the Sundays from the one on or before `start`."""
    sessions = history.bars["SPY"].index
    sessions = sessions[(sessions >= pd.Timestamp(start)) & (sessions <= pd.Timestamp(end))]
    sundays = pd.date_range(pd.Timestamp(start) - pd.Timedelta(days=(pd.Timestamp(start).weekday() + 1) % 7),
                            end, freq="7D")
    return sessions, sundays


def _cash_returns(history: History, sessions: pd.DatetimeIndex) -> pd.Series:
    """T-bills per session: the prior DTB3 print for the calendar days since the last session, over 365."""
    rf = history.tbill.reindex(history.tbill.index.union(sessions)).ffill().shift(1).reindex(sessions).fillna(0.0)
    days = pd.Series(sessions, index=sessions).diff().dt.days.fillna(1.0)
    return rf * days / 365.0


def _sleeve_returns(bars: pd.DataFrame, states: pd.Series, sessions: pd.DatetimeIndex, r_cash: pd.Series) -> pd.Series:
    """A sleeve's daily return: in the fund while `in` (switched at the open on the Monday after a Sunday decision:
    the fund's open-to-close return on a switch-in day, close-to-open on a switch-out day), else T-bills."""
    b = bars.reindex(sessions)
    prev_close = b["close"].shift(1)
    # `states` is indexed by the Sunday of the decision, so the forward fill alone puts it on Monday's session. (Phase
    # C3's version shifted it one more session, so its reference books switched at Tuesday's open; Phase C4b fixed it.)
    pos = states.reindex(sessions, method="ffill")
    pos_prev = pos.shift(1)
    r_full = b["close"] / prev_close - 1.0
    r_in_day = b["close"] / b["open"] - 1.0                          # switch in at the open
    r_out_day = b["open"] / prev_close - 1.0                         # switch out at the open
    out = pd.Series(0.0, index=sessions)
    both = (pos == True) & (pos_prev == True)                        # noqa: E712 - pandas boolean compare
    enter = (pos == True) & (pos_prev != True)                       # noqa: E712
    leave = (pos != True) & (pos_prev == True)                       # noqa: E712
    out[both] = r_full[both]
    out[enter] = r_in_day[enter]
    out[leave] = r_out_day[leave]
    flat = ~(both | enter | leave)
    out[flat] = r_cash[flat]
    return out.fillna(r_cash)


def _governed(book: pd.Series, r_cash: pd.Series, sessions: pd.DatetimeIndex, cfg_growth: dict) -> tuple[pd.Series, pd.Series]:
    """The book with the governor: G from its own drawdown at Friday's close (weekly), applied from Monday to the
    part above T-bills. Returns (the governed daily returns, G per Sunday)."""
    from traderec.growth import governor as gov_mod

    nav = (1.0 + book).cumprod()
    fridays = nav.groupby(nav.index.to_period("W-SUN")).last()
    fridays.index = fridays.index.to_timestamp(how="end").normalize()   # the Sunday ending each week
    peak, G_by_sunday = None, {}
    for s, v in fridays.items():
        peak = v if peak is None else max(peak, v)
        G_by_sunday[s] = gov_mod.G(gov_mod.drawdown(v, peak), cfg_growth)
    Gs = pd.Series(G_by_sunday).reindex(sessions, method="ffill").fillna(1.0)   # Sunday's G applies from Monday
    return Gs * (book - r_cash) + r_cash, pd.Series(G_by_sunday)


REFERENCE_LABELS = {
    "bandfree": "reference: daily-rebalanced, band-free weekly rules (track 38's simulation), no gems",
    "band": "reference: daily-rebalanced, the 2% band, no gems",
    "band_volcut": "reference: the 2% band and G2's vol cut, no gems",
    "band_governor": "reference: the 2% band and the D40 governor, no gems",
    "band_volcut_governor": "reference: the 2% band, the vol cut and the D40 governor (the pipeline's rules), no gems",
}


def _spans(sundays: pd.DatetimeIndex) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """Runs of consecutive Sundays as (first, last)."""
    out: list[tuple[pd.Timestamp, pd.Timestamp]] = []
    for s in sundays:
        if out and (s - out[-1][1]).days <= 7:
            out[-1] = (out[-1][0], s)
        else:
            out.append((s, s))
    return out


def _events(states: pd.Series) -> list[tuple[str, str]]:
    """(date, "on" | "off") whenever a weekly state series changes (None = unknown, carried)."""
    out, prev = [], None
    for d, v in states.items():
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        v = bool(v)
        if prev is not None and v != prev:
            out.append((iso(d), "on" if v else "off"))
        prev = v
    return out


def match_events(a: list[tuple[str, str]], b: list[tuple[str, str]], days: int = 7) -> dict:
    """Events in `a` (the pipeline) matched to events in `b` (the reference) of the same direction within `days`."""
    used, matched, lags = set(), 0, []
    for d, kind in a:
        for j, (d2, kind2) in enumerate(b):
            if j in used or kind2 != kind:
                continue
            lag = abs((pd.Timestamp(d) - pd.Timestamp(d2)).days)
            if lag <= days:
                used.add(j)
                matched += 1
                lags.append(lag)
                break
    return {"matched": matched, "extra": len(a) - matched, "missed": len(b) - matched,
            "max_lag_days": max(lags) if lags else 0, "mean_lag_days": float(np.mean(lags)) if lags else 0.0}


def reconcile_growth(cfg: Config, work: Path, out: Path, *, history: History | None = None,
                     lookahead: tuple[Path, Path] | None = None) -> pd.DataFrame:
    """The growth-book replay vs track 38 (design v4 Appendix A.5) and the reference books; CSVs into `out`."""
    out.mkdir(parents=True, exist_ok=True)
    summary: list[dict] = []

    def put(section: str, name: str, value: Any, note: str = "") -> None:
        summary.append({"section": section, "metric": name, "value": _fmt(value), "note": note})

    seg = json.loads((work / "segment.json").read_text())
    state = json.loads((work / "state" / "state.json").read_text())
    recs = ledger_records(work / "state")
    runs = pd.read_csv(work / "runs.csv")
    marks = pd.DataFrame(state.get("marks", []))
    dec = growth_decisions(recs)
    start, end = seg["start"], seg["end"]

    # ---- operations ---------------------------------------------------------------------------------
    daily = runs[runs["kind"] == "daily"]
    put("runtime", "wall minutes", seg["wall_seconds"] / 60.0)
    put("runtime", "runs", len(runs), ", ".join(f"{k}: {int(v)}" for k, v in runs["kind"].value_counts().items()))
    put("runtime", "seconds per daily run, mean", daily["seconds"].mean())
    put("runtime", "seconds per daily run, last 20", daily["seconds"].tail(20).mean())
    for status, n in runs["status"].value_counts().items():
        put("runs", f"status {status}", int(n))
    exc = runs[runs["status"] == "exception"]
    if len(exc):
        exc[["kind", "date", "error"]].to_csv(out / "run_errors.csv", index=False)
    put("data", "data served after the as-of date", seg["served_after_asof"], "0 = no look-ahead")
    put("data", "second-source echoes (SPY, ^GSPC, ^NDX)", seg["echoes"], ", ".join(seg.get("echo_tickers") or []))
    for k, v in (seg.get("flags") or {}).items():
        put("data", f"flag {k}", None, v)
    ok, why = pipeline.verify_ledger(work / "state")
    put("ledger", "ledger verifies", int(bool(ok)), f"{why} ({len(recs)} records)")
    alerts = pd.DataFrame(state.get("alerts", []))
    if len(alerts):
        g = alerts.groupby("kind").agg(count=("message", "size"), first=("date", "min"), last=("date", "max"),
                                       example=("message", "first")).reset_index()
        g["example"] = g["example"].str.slice(0, 160)
        g.to_csv(out / "alerts_by_kind.csv", index=False)
        for _, row in g.iterrows():
            put("alerts", f"alerts: {row['kind']}", int(row["count"]), f"first {row['first']}, last {row['last']}")
    emails = pd.read_csv(work / "emails.csv") if (work / "emails.csv").stat().st_size > 1 else pd.DataFrame()
    put("emails", "daily/monthly emails captured", len(emails),
        "the Sunday GROWTH email is builder C2's renderer; the replay records its facts only")
    if len(emails):
        for k, n in emails["kind"].value_counts().items():
            put("emails", f"emails {k}", int(n))
        put("emails", "validator errors in sent emails", int(emails["validator_errors"].sum()))
    shadow_books = state.get("shadow") or {}
    for name in ("ST1", "ST1B"):
        put("shadow", f"{name} shadow trades", len((shadow_books.get(name) or {}).get("trades") or []))
    put("shadow", "M2 monthly shadow records", sum(1 for r in recs if r["record_type"] == "shadow"
                                                   and r["payload"].get("book") == "M2"))
    put("shadow", "recommendations blocked by a module status",
        sum(1 for r in recs if r["record_type"] == "shadow" and r["payload"].get("event") == "blocked_by_status"))
    for mod in ("M1", "M2", "M3", "M4", "W8", "W9"):
        put("shadow", f"{mod} orders queued", sum(1 for r in recs if r["record_type"] == "order"
                                                  and r["payload"].get("module") == mod))
    cancelled = state["broker"].get("cancelled") or []
    put("fills", "orders cancelled", len(cancelled),
        "; ".join(f"{o['intent_id']}: {str(o['meta'].get('cancel_reason'))[:60]}" for o in cancelled[:5]))
    put("fills", "fills", sum(1 for r in recs if r["record_type"] == "fill" and r["payload"].get("type") != "dividend"))

    # ---- the book path vs track 38 --------------------------------------------------------------------
    ira = ira_path(recs)
    total = marks.set_index(pd.DatetimeIndex(pd.to_datetime(marks["date"])))["nav"].astype(float)
    spy = marks.set_index(pd.DatetimeIndex(pd.to_datetime(marks["date"])))["spy_adj"].astype(float)
    t38 = pd.read_csv(TRACK38 / "real_path.csv") if (TRACK38 / "real_path.csv").exists() else pd.DataFrame()
    rows = []
    for label, s, a in (("pipeline: the IRA (the book), from track 38's start", ira, BOOK_START),
                        ("pipeline: the IRA (the book), whole window", ira, None),
                        ("pipeline: IRA + taxable (what the governor sees)", total, BOOK_START),
                        ("SPY total return (replay marks)", spy, BOOK_START)):
        rows.append({"book": label, **path_stats(s, a, end)})
    refs = None
    if history is not None:
        refs = reference_books(history, cfg, start, end)
        for variant, label in REFERENCE_LABELS.items():
            nav = (1.0 + refs["books"][variant]).cumprod()
            rows.append({"book": label, **path_stats(nav, BOOK_START, end)})
    for _, r in t38.iterrows():
        if r["book"] in (TRACK38_BOOK, "SPY") and str(r["start"]) >= "2014":
            rows.append({"book": f"track 38: {r['book']}", "start": r["start"], "end": r["end"], "cagr": r["cagr"],
                         "cagr_calendar": None, "vol": r["vol"], "maxdd": r["maxdd"], "worst_day": r["worst_day"],
                         "worst_day_date": r["worst_day_date"]})
    books = pd.DataFrame(rows)
    _round(books).to_csv(out / "book_vs_track38.csv", index=False)
    by = books.set_index("book")
    mine = by.loc["pipeline: the IRA (the book), from track 38's start"]
    put("book vs track 38", "pipeline book CAGR (IRA, from 2015-04-07)", mine["cagr"], f"{mine['start']} -> {mine['end']}")
    put("book vs track 38", "pipeline book worst drawdown", mine["maxdd"], f"{mine['maxdd_peak']} -> {mine['maxdd_trough']}")
    put("book vs track 38", "pipeline book worst day", mine["worst_day"], str(mine["worst_day_date"]))
    key = f"track 38: {TRACK38_BOOK}"
    if key in by.index:
        t = by.loc[key]
        put("book vs track 38", "track 38 book CAGR", t["cagr"], "includes the 15% gems stream, an estimate (+3.7 points a year in history)")
        put("book vs track 38", "track 38 book worst drawdown", t["maxdd"])
        put("book vs track 38", "track 38 book worst day", t["worst_day"], str(t["worst_day_date"]))
        put("book vs track 38", "CAGR difference, pipeline - track 38 (points)", 100.0 * (mine["cagr"] - t["cagr"]),
            "tolerance 1 point after the expected differences (gems, band, weekly rebalancing)")
        put("book vs track 38", "worst drawdown difference (points)", 100.0 * (mine["maxdd"] - t["maxdd"]), "tolerance 3 points")
    if refs is not None:
        for variant, label in REFERENCE_LABELS.items():
            put("book vs reference", f"reference {variant} CAGR", by.loc[label, "cagr"])
            put("book vs reference", f"reference {variant} worst drawdown", by.loc[label, "maxdd"])
            put("book vs reference", f"CAGR difference, pipeline - reference {variant} (points)",
                100.0 * (mine["cagr"] - by.loc[label, "cagr"]))
        vf = refs["vol_factor"]
        put("G2 vol cut", "Sundays the rule's vol cut is in force on the same data", int((vf < 1.0).sum()),
            ", ".join(f"{iso(a)}..{iso(b)}" for a, b in _spans(vf[vf < 1.0].index)[:6]))

    # ---- calendar years -----------------------------------------------------------------------------
    cy = pd.DataFrame({"pipeline_ira": calendar_year_returns(ira), "pipeline_total": calendar_year_returns(total),
                       "spy_replay": calendar_year_returns(spy)})
    if refs is not None:
        for variant in REFERENCE_LABELS:
            r = refs["books"][variant]
            cy[f"ref_{variant}"] = r.groupby(r.index.year).apply(lambda x: float(np.expm1(np.log1p(x).sum())))
    t38y = pd.read_csv(TRACK38 / "calendar_years.csv") if (TRACK38 / "calendar_years.csv").exists() else pd.DataFrame()
    if len(t38y):
        t38y = t38y.set_index("year")
        cy["track38_book"] = t38y[TRACK38_BOOK].reindex(cy.index)
        cy["track38_spy"] = t38y["SPY"].reindex(cy.index)
    cy.index.name = "year"
    _round(cy).to_csv(out / "calendar_years.csv")
    if "track38_book" in cy:
        d = (cy["pipeline_ira"] - cy["track38_book"]).dropna()
        put("calendar years", "years compared with track 38", len(d))
        put("calendar years", "mean difference, pipeline - track 38 (points)", 100.0 * d.mean())
        put("calendar years", "largest |difference| (points)", 100.0 * d.abs().max(), str(d.abs().idxmax()))
        put("calendar years", "years with the same sign", int(((cy["pipeline_ira"] > 0) == (cy["track38_book"] > 0))[d.index].sum()))

    # ---- G2's switches -------------------------------------------------------------------------------
    if len(dec):
        d2 = dec.set_index(pd.DatetimeIndex(pd.to_datetime(dec["sunday"])))
        pipe_states = d2["g2_on"]
        pipe_ev = _events(pipe_states)
        sundays = d2.index
        ref_states = _weekly_btc_states(history.btc, sundays, cfg.constitution["growth"]["sleeves"]["G2"]["signal"]) \
            if history is not None else pd.Series(dtype=object)
        sw = pd.DataFrame({"sunday": [iso(s) for s in sundays], "pipe_on": pipe_states.values,
                           "pipe_signal": d2["g2_signal"].values, "pipe_agree": d2["g2_agree"].values,
                           "ref_on": ref_states.reindex(sundays).values if len(ref_states) else None})
        sw["agree"] = [(None if (a is None or b is None or (isinstance(b, float) and math.isnan(b))) else bool(a) == bool(b))
                       for a, b in zip(sw["pipe_on"], sw["ref_on"], strict=False)]
        sw.to_csv(out / "g2_switches.csv", index=False)
        ref_ev = _events(ref_states) if len(ref_states) else []
        yrs = (sundays[-1] - sundays[0]).days / 365.25
        known = pipe_states.dropna()
        put("G2 vs the rule", "Sundays decided", int(len(known)))
        put("G2 vs the rule", "weeks on (fraction)", float(known.astype(bool).mean()), "track 38: 48%")
        put("G2 vs the rule", "switches a year, pipeline", len(pipe_ev) / yrs, "track 38: 6.2")
        put("G2 vs the rule", "switches a year, the rule on the same data (band-free, no two-source check)", len(ref_ev) / yrs)
        m = match_events(pipe_ev, ref_ev)
        for k, v in m.items():
            put("G2 vs the rule", f"switch events {k}", v, "within one week" if k == "matched" else "")
        agree = sw["agree"].dropna()
        put("G2 vs the rule", "weeks in the same state", int(agree.sum()), f"of {len(agree)}")
        put("G2 vs the rule", "Sundays with no G2 signal (data or two-source)", int((d2["g2_signal"] != True).sum()),  # noqa: E712
            ", ".join(iso(s) for s in d2.index[(d2["g2_signal"] != True) & (d2["g2_complete"] == True)][:8]))   # noqa: E712
        put("G2 vs the rule", "Sundays the Bitcoin two-source check failed", int((d2["g2_agree"] == False).sum()),  # noqa: E712
            ", ".join(iso(s) for s in d2.index[d2["g2_agree"] == False][:10]))   # noqa: E712
        # G1 per leg
        for leg in [c[:-3] for c in d2.columns if c.endswith("_in")]:
            st = d2[f"{leg}_in"]
            ev = _events(st)
            put("G1", f"{leg} switches a year (2% band)", len(ev) / yrs, "track 26: about 1.1 a year per leg")
            put("G1", f"{leg} weeks in (fraction)", float(st.dropna().astype(bool).mean()))
            put("G1", f"{leg} Sundays with no signal", int((d2[f"{leg}_signal"] != True).sum()))   # noqa: E712
            if refs is not None:
                ref_st = refs["states"].get(f"G1_{leg}_bandfree")
                if ref_st is not None:
                    put("G1", f"{leg} switches a year, band-free rule", len(_events(ref_st)) / yrs, "track 31/38's simulation: about 3")
        # orders per email
        put("orders", "Sundays with orders", int((dec["orders_sent"] > 0).sum()), f"of {len(dec)} Sundays")
        put("orders", "Sundays with orders a year", float((dec["orders_sent"] > 0).sum() / yrs), "design A.5: about 13")
        put("orders", "max orders in one email", int(dec["orders_sent"].max()), "must be <= 3")
        put("orders", "orders sent in all", int(dec["orders_sent"].sum()))
        put("orders", "Sundays with a deferred order", int((dec["orders_deferred"] > 0).sum()))
        put("orders", "W10 buys dropped for the week", int(dec["w10_dropped"].sum()))
        per_year = dec.assign(year=dec["sunday"].str.slice(0, 4)).groupby("year").agg(
            sundays=("sunday", "size"), with_orders=("orders_sent", lambda s: int((s > 0).sum())), orders=("orders_sent", "sum"),
            deferred=("orders_deferred", "sum"), min_G=("G", "min"), max_drawdown=("drawdown", "max"))
        per_year.to_csv(out / "orders_and_governor_by_year.csv")
        dec.to_csv(out / "sundays.csv", index=False)
        # the governor
        put("governor", "hard stop fired", int(bool(dec["hard_stop"].fillna(False).astype(bool).any())), "must be 0")
        put("governor", "Sundays with G < 1", int((dec["G"] < 1.0 - 1e-9).sum()))
        put("governor", "lowest G", float(dec["G"].min()), str(dec.loc[dec["G"].idxmin(), "sunday"]))
        put("governor", "deepest drawdown seen (IRA + taxable at Friday's close)", float(dec["drawdown"].max()),
            str(dec.loc[dec["drawdown"].idxmax(), "sunday"]))
        cuts = dec[dec["reasons"].str.contains("governor_cut", na=False)]
        put("governor", "Sundays with a governor cut", len(cuts), ", ".join(cuts["sunday"].head(10)))
        restores = dec[dec["reasons"].str.contains("governor_restore", na=False)]
        put("governor", "Sundays with a governor restore", len(restores), ", ".join(restores["sunday"].head(10)))
        for year in ("2018", "2020", "2022", "2025"):
            y = dec[dec["sunday"].str.startswith(year)]
            if len(y):
                put("governor", f"{year}: lowest G / deepest drawdown", float(y["G"].min()),
                    f"drawdown {float(y['drawdown'].max()):.1%} on {y.loc[y['drawdown'].idxmax(), 'sunday']}; "
                    f"cuts on {', '.join(y[y['reasons'].str.contains('governor_cut', na=False)]['sunday'])}")
        vc = dec["vol_cut_factor"].dropna()
        put("G2 vol cut", "Sundays with the vol cut in force", int((vc < 1.0).sum()) if len(vc) else 0)

    # ---- the look-ahead check --------------------------------------------------------------------------
    if lookahead is not None:
        a, b = lookahead
        cmp_ = compare_runs(a, b)
        seg_b = json.loads((Path(b) / "segment.json").read_text())
        seg_a = json.loads((Path(a) / "segment.json").read_text())
        put("look-ahead", "window", None, f"{seg_a['start']} -> {seg_a['end']}")
        put("look-ahead", "identical decisions with and without the as-of cut", int(cmp_["identical"]),
            f"{cmp_['records_a']} vs {cmp_['records_b']} decision records; first difference {cmp_['first_difference']}")
        put("look-ahead", "provider calls that returned future rows without the cut", seg_b["served_after_asof"])
        put("look-ahead", "Sundays in the window", sum(1 for r in ledger_records(Path(a) / "state") if r["record_type"] == "growth_decision"))

    # ---- monthly NAV, for the record ------------------------------------------------------------------
    mm = pd.DataFrame({"ira": ira, "total": total, "spy_adj": spy})
    mm = mm.groupby(mm.index.to_period("M")).last()
    mm.index = mm.index.astype(str)
    _round(mm, 2).to_csv(out / "nav_monthly.csv", index_label="month")
    s = pd.DataFrame(summary)
    s.to_csv(out / "summary.csv", index=False)
    return s


# ======================================================================================================
# 7c. The 1986-2026 G1-only replay (Phase C4b, design v4 A.5 second item): both runs vs track 38 and the references
# ======================================================================================================

DEFAULT_G1_OUT = DEFAULT_GROWTH_OUT / "g1-1986"
TRACK38_G1_BOOK = "2x blend, equity part only"
G1_BOOK_START = "1986-07-22"          # track 38's first day with both legs decided (^NDX's 200th close)
# track 38's crash episodes (research/code/38-growth-book/run38.py): the return from the close before the first date
EPISODES = (("Aug 25 - Dec 31 1987", "1987-08-25", "1987-12-31"), ("Mar 2000 - Oct 2002", "2000-03-24", "2002-10-09"),
            ("Oct 2007 - Mar 2009", "2007-10-09", "2009-03-09"), ("Feb 19 - Mar 23 2020", "2020-02-19", "2020-03-23"),
            ("Jan - Oct 2022", "2022-01-03", "2022-10-12"), ("Feb 19 - Apr 8 2025", "2025-02-19", "2025-04-08"))
BEARS = (("1987", "1987-08-25", "1987-12-31"), ("2000-02", "2000-03-24", "2002-10-09"), ("2007-09", "2007-10-09", "2009-03-09"))
G1_REFERENCE_LABELS = {
    "equity100": "reference: the two legs band-free at 100% equity (track 38's '2x blend, equity part only')",
    "blend50": "reference: the two legs band-free at the book's 50%, the rest T-bills (track 38's blend_2x_50pct)",
    "band50": "reference: the 2% band at 50%, the rest T-bills",
    "band_gov50": "reference: the 2% band and the D40 governor at 50%, the rest T-bills",
}
CRASH_DAY = "1987-10-19"


def reference_g1(history: History, cfg: Config, start: str, end: str) -> dict[str, Any]:
    """Track-38-style G1 books rebuilt from the replay's own fund bars (the proxies before 2006, the real funds after):
    each leg in its fund while its index is above the 200-day average at the Friday close, switched at Monday's open,
    else T-bills; daily-rebalanced, no costs. `equity100`: band-free, the two legs 50/50 (track 38's "2x blend, equity
    part only"); `blend50`: band-free at the book's weights (25/25) with the rest at T-bills (track 38's
    `blend_2x_50pct`); `band50`: the pre-registered 2% band with hysteresis; `band_gov50`: the band and the D40
    governor on the book's own Friday drawdown, weekly (the pipeline's rules, Rule E aside)."""
    g = cfg.constitution["growth"]
    g1 = (g.get("sleeves") or {}).get("G1") or {}
    legs, sig = g1.get("legs") or {}, g1.get("signal") or {}
    sessions, sundays = _reference_calendar(history, start, end)
    r_cash = _cash_returns(history, sessions)
    states: dict[str, pd.Series] = {}
    rets: dict[str, pd.Series] = {}
    for variant, band in (("bandfree", None), ("band", float(sig.get("band", 0.02)))):
        for leg, spec in legs.items():
            st = _weekly_index_states(history.bars[str(spec["index"])]["close"], sundays, int(sig.get("sma_days", 200)), band)
            states[f"{leg}_{variant}"] = st
            rets[f"{leg}_{variant}"] = _sleeve_returns(history.bars[str(leg)], st, sessions, r_cash)
    n = max(len(legs), 1)
    weights = {leg: float(spec.get("weight", 0.0)) for leg, spec in legs.items()}
    w_sum = sum(weights.values())
    books: dict[str, pd.Series] = {
        "equity100": sum((rets[f"{leg}_bandfree"] for leg in legs), pd.Series(0.0, index=sessions)) / n,
        "blend50": sum((weights[leg] * rets[f"{leg}_bandfree"] for leg in legs), pd.Series(0.0, index=sessions)) + (1.0 - w_sum) * r_cash,
        "band50": sum((weights[leg] * rets[f"{leg}_band"] for leg in legs), pd.Series(0.0, index=sessions)) + (1.0 - w_sum) * r_cash,
    }
    books["band_gov50"], g_ref = _governed(books["band50"], r_cash, sessions, g)
    return {"books": books, "states": states, "G_reference": g_ref, "sessions": sessions, "sundays": sundays,
            "weights": weights, "r_cash": r_cash}


def episode_returns(nav: pd.Series, episodes: tuple = EPISODES) -> pd.Series:
    """A NAV path's return over each episode, track 38's way: from the close before the first date to the last date."""
    s = nav.dropna()
    out = {}
    for label, a, b in episodes:
        before = s[s.index < pd.Timestamp(a)]
        upto = s.loc[: pd.Timestamp(b)]
        if before.empty or upto.empty or upto.index[-1] < pd.Timestamp(a):
            out[label] = np.nan
            continue
        out[label] = float(upto.iloc[-1] / before.iloc[-1] - 1.0)
    return pd.Series(out, name="ret")


def _load_work(work: Path) -> dict[str, Any]:
    """Everything `reconcile_g1` reads from one replay's work directory."""
    work = Path(work)
    seg = json.loads((work / "segment.json").read_text())
    state = json.loads((work / "state" / "state.json").read_text())
    recs = ledger_records(work / "state")
    marks = pd.DataFrame(state.get("marks", []))
    idx = pd.DatetimeIndex(pd.to_datetime(marks["date"]))
    emails = pd.read_csv(work / "emails.csv") if (work / "emails.csv").stat().st_size > 1 else pd.DataFrame()
    return {"work": work, "seg": seg, "state": state, "recs": recs, "runs": pd.read_csv(work / "runs.csv"),
            "marks": marks, "ira": ira_path(recs), "total": pd.Series(marks["nav"].astype(float).values, index=idx),
            "spy": pd.Series(marks["spy_adj"].astype(float).values, index=idx), "dec": growth_decisions(recs),
            "fills": fills_frame(recs), "emails": emails,
            "rule_e": [r for r in recs if r["record_type"] == "rule_e"],
            "alerts": pd.DataFrame(state.get("alerts", []))}


def _ops_summary(put: Callable, tag: str, w: dict) -> None:
    """The operations lines of one run (statuses, timing, data, ledger, alerts, emails, fills) into the summary."""
    seg, runs, recs = w["seg"], w["runs"], w["recs"]
    sect = f"runtime [{tag}]"
    put(sect, "window", None, f"{seg['start']} -> {seg['end']}; book {seg.get('book')}, governor {seg.get('governor')}")
    put(sect, "wall minutes", seg["wall_seconds"] / 60.0)
    put(sect, "runs", len(runs), ", ".join(f"{k}: {int(v)}" for k, v in runs["kind"].value_counts().items()))
    daily = runs[runs["kind"] == "daily"]
    put(sect, "seconds per daily run, mean", daily["seconds"].mean())
    put(sect, "seconds per daily run, last 20", daily["seconds"].tail(20).mean(),
        "grows with the ledger: every run re-verifies the whole hash chain")
    for status, n in runs["status"].value_counts().items():
        put(f"runs [{tag}]", f"status {status}", int(n))
    exc = runs[runs["status"] == "exception"]
    put(f"runs [{tag}]", "exceptions", len(exc), "; ".join(f"{r['kind']} {r['date']}: {str(r['error'])[:80]}" for _, r in exc.head(5).iterrows()))
    put(f"data [{tag}]", "data served after the as-of date", seg["served_after_asof"], "0 = no look-ahead")
    put(f"data [{tag}]", "second-source echoes", seg["echoes"], ", ".join(seg.get("echo_tickers") or []))
    ok, why = pipeline.verify_ledger(w["work"] / "state")
    put(f"ledger [{tag}]", "ledger verifies", int(bool(ok)), f"{why} ({len(recs)} records)")
    kinds = pd.Series([r["record_type"] for r in recs]).value_counts()
    put(f"ledger [{tag}]", "records by type", len(recs), ", ".join(f"{k}: {int(v)}" for k, v in kinds.items()))
    alerts = w["alerts"]
    if len(alerts):
        for kind, n in alerts["kind"].value_counts().items():
            first = alerts[alerts["kind"] == kind].iloc[0]
            put(f"alerts [{tag}]", f"alerts: {kind} (the state keeps the last 400 days)", int(n), str(first["message"])[:160])
    emails = w["emails"]
    put(f"emails [{tag}]", "emails captured", len(emails))
    if len(emails):
        for k, n in emails["kind"].value_counts().items():
            put(f"emails [{tag}]", f"emails {k}", int(n))
        put(f"emails [{tag}]", "validator errors in sent emails", int(emails["validator_errors"].sum()))
    cancelled = w["state"]["broker"].get("cancelled") or []
    put(f"fills [{tag}]", "orders cancelled", len(cancelled),
        "; ".join(f"{o['intent_id']}: {str(o['meta'].get('cancel_reason'))[:60]}" for o in cancelled[:5]))
    put(f"fills [{tag}]", "fills", int((w["fills"]["side"] != "dividend").sum()) if len(w["fills"]) else 0)
    put(f"fills [{tag}]", "dividends credited", int((w["fills"]["side"] == "dividend").sum()) if len(w["fills"]) else 0)


def _rule_e_summary(put: Callable, tag: str, w: dict) -> pd.DataFrame:
    """Rule E's exits, capped triggers and scores of one run; returns the exits as a frame."""
    rows = []
    for r in w["rule_e"]:
        p = r["payload"]
        for leg in p.get("legs") or []:
            rows.append({"date": r["as_of"], "event": p.get("event"), "ticker": leg.get("ticker"),
                         "pct_vs_sma": leg.get("pct_vs_sma"), "reason": p.get("reason")})
    df = pd.DataFrame(rows, columns=["date", "event", "ticker", "pct_vs_sma", "reason"])
    exits = df[df["event"] == "exit"]
    yrs = max((pd.Timestamp(w["seg"]["end"]) - pd.Timestamp(w["seg"]["start"])).days / 365.25, 1e-9)
    sect = f"Rule E [{tag}]"
    put(sect, "exits (legs sold mid-week)", len(exits), f"{len(exits) / yrs:.2f} a year")
    put(sect, "triggers capped (weekly or annual cap: Sunday decided)", int((df["event"] == "capped").sum()))
    scores = [r["payload"] for r in w["rule_e"] if r["payload"].get("event") == "score" and r["payload"].get("resolved", True)]
    vals = pd.to_numeric(pd.Series([s.get("edge_pct") for s in scores], dtype=float), errors="coerce").dropna()
    if len(vals):
        put(sect, "exits scored against 'waiting for Sunday' (edge, % of the leg)", int(len(vals)),
            f"mean {vals.mean():+.2f}%, median {vals.median():+.2f}%, positive {int((vals > 0).sum())} (Rule E sold higher), "
            f"worst {vals.min():+.2f}%, best {vals.max():+.2f}%")
    for leg, n in exits["ticker"].value_counts().items():
        put(sect, f"exits of {leg}", int(n))
    return df


def _sunday_events(dec: pd.DataFrame, leg: str) -> list[tuple[str, str]]:
    d2 = dec.set_index(pd.DatetimeIndex(pd.to_datetime(dec["sunday"])))
    return _events(d2[f"{leg}_in"]) if f"{leg}_in" in d2 else []


def reconcile_g1(cfg: Config, work: Path, work_gov: Path, out: Path, *, history: History,
                 lookahead: tuple[Path, Path] | None = None) -> pd.DataFrame:
    """The 1986-2026 G1-only replays (`work`: no governor; `work_gov`: the production governor and hard stop) vs
    track 38's real path and episodes and the reference books rebuilt from the same bars; the CSVs into `out`."""
    from traderec.growth import governor as gov_mod

    out.mkdir(parents=True, exist_ok=True)
    summary: list[dict] = []

    def put(section: str, name: str, value: Any, note: str = "") -> None:
        summary.append({"section": section, "metric": name, "value": _fmt(value), "note": note})

    a, b = _load_work(work), _load_work(work_gov)
    start, end = a["seg"]["start"], a["seg"]["end"]
    g = cfg.constitution["growth"]
    legs = list(((g.get("sleeves") or {}).get("G1") or {}).get("legs") or {})
    for tag, w in (("no governor", a), ("governor", b)):
        _ops_summary(put, tag, w)
    for k, v in (a["seg"].get("flags") or {}).items():
        put("data", f"flag {k}", None, v)
    put("data", "windows agree", int(a["seg"]["start"] == b["seg"]["start"] and a["seg"]["end"] == b["seg"]["end"]),
        f"{b['seg']['start']} -> {b['seg']['end']} with the governor")

    # ---- the paths, the references, track 38 --------------------------------------------------------
    refs = reference_g1(history, cfg, start, end)
    ref_nav = {k: (1.0 + r).cumprod() for k, r in refs["books"].items()}
    t38 = pd.read_csv(TRACK38 / "real_path.csv") if (TRACK38 / "real_path.csv").exists() else pd.DataFrame()
    rows = []
    for label, s, st in (("pipeline: G1 only, no governor (the IRA), whole window", a["ira"], None),
                         ("pipeline: G1 only, no governor (the IRA), from track 38's start", a["ira"], G1_BOOK_START),
                         ("pipeline: G1 only, with the governor (the IRA), whole window", b["ira"], None),
                         ("pipeline: G1 only, with the governor (the IRA), from track 38's start", b["ira"], G1_BOOK_START),
                         ("pipeline: IRA + taxable with the governor (what the governor sees)", b["total"], G1_BOOK_START),
                         ("SPY total return (replay marks; ^GSPC proxy before 1993)", a["spy"], G1_BOOK_START)):
        rows.append({"book": label, **path_stats(s, st, end)})
    for variant, label in G1_REFERENCE_LABELS.items():
        rows.append({"book": label, **path_stats(ref_nav[variant], G1_BOOK_START, end)})
    for _, r in t38.iterrows():
        if r["book"] == TRACK38_G1_BOOK or (r["book"] == "SPY" and str(r["start"]) < "1990"):
            rows.append({"book": f"track 38: {r['book']}", "start": r["start"], "end": r["end"], "cagr": r["cagr"],
                         "cagr_calendar": None, "vol": r["vol"], "maxdd": r["maxdd"], "worst_day": r["worst_day"],
                         "worst_day_date": r["worst_day_date"]})
    books = pd.DataFrame(rows)
    _round(books).to_csv(out / "book_vs_track38.csv", index=False)
    by = books.set_index("book")
    key38 = f"track 38: {TRACK38_G1_BOOK}"
    ref100 = by.loc[G1_REFERENCE_LABELS["equity100"]]
    sect = "reference vs track 38 (100% equity, band-free, 1986-07-22 on)"
    put(sect, "reference CAGR", ref100["cagr"], f"{ref100['start']} -> {ref100['end']}")
    put(sect, "reference worst drawdown", ref100["maxdd"], f"{ref100['maxdd_peak']} -> {ref100['maxdd_trough']}")
    put(sect, "reference worst day", ref100["worst_day"], str(ref100["worst_day_date"]))
    if key38 in by.index:
        t = by.loc[key38]
        put(sect, "track 38 CAGR", t["cagr"], f"{t['start']} -> {t['end']}: its sleeves use a 0.4% spread, a 0.9% fee, a flat "
                                             "0.8% Nasdaq-100 yield, 0.05% a switch and the model after 2006 too")
        put(sect, "track 38 worst drawdown", t["maxdd"])
        put(sect, "track 38 worst day", t["worst_day"], str(t["worst_day_date"]))
        put(sect, "CAGR difference, reference - track 38 (points)", 100.0 * (ref100["cagr"] - t["cagr"]), "tolerance 1 point")
        put(sect, "worst drawdown difference (points)", 100.0 * (ref100["maxdd"] - t["maxdd"]), "tolerance 3 points")
        put(sect, "same worst day", int(str(ref100["worst_day_date"]) == str(t["worst_day_date"])))
    for tag, w in (("no governor", a), ("governor", b)):
        mine = by.loc[f"pipeline: G1 only, {'no governor' if tag == 'no governor' else 'with the governor'} (the IRA), from track 38's start"]
        sect = f"pipeline vs reference [{tag}]"
        put(sect, "pipeline CAGR (IRA, from 1986-07-22)", mine["cagr"], f"{mine['start']} -> {mine['end']}")
        put(sect, "pipeline worst drawdown", mine["maxdd"], f"{mine['maxdd_peak']} -> {mine['maxdd_trough']}")
        put(sect, "pipeline worst day", mine["worst_day"], str(mine["worst_day_date"]))
        for variant in ("blend50", "band50", "band_gov50"):
            r = by.loc[G1_REFERENCE_LABELS[variant]]
            put(sect, f"reference {variant} CAGR / worst drawdown", r["cagr"], f"worst drawdown {r['maxdd']:.4f} ({r['maxdd_peak']} -> {r['maxdd_trough']}), worst day {r['worst_day']:.4f} on {r['worst_day_date']}")
            put(sect, f"CAGR difference, pipeline - reference {variant} (points)", 100.0 * (mine["cagr"] - r["cagr"]),
                "tolerance 1 point at the same weight" if variant == "blend50" else "")
            put(sect, f"worst drawdown difference, pipeline - reference {variant} (points)", 100.0 * (mine["maxdd"] - r["maxdd"]),
                "tolerance 3 points" if variant == "blend50" else "")
    put("pipeline vs pipeline", "CAGR difference, governor - no governor (points)",
        100.0 * (by.loc["pipeline: G1 only, with the governor (the IRA), from track 38's start", "cagr"]
                 - by.loc["pipeline: G1 only, no governor (the IRA), from track 38's start", "cagr"]))
    put("pipeline vs pipeline", "NAV at the end, no governor (IRA)", float(a["ira"].iloc[-1]), str(a["ira"].index[-1].date()))
    put("pipeline vs pipeline", "NAV at the end, with the governor (IRA)", float(b["ira"].iloc[-1]), str(b["ira"].index[-1].date()))

    # ---- calendar years -----------------------------------------------------------------------------
    cy = pd.DataFrame({"pipeline_nogov": calendar_year_returns(a["ira"]), "pipeline_gov": calendar_year_returns(b["ira"]),
                       "spy_replay": calendar_year_returns(a["spy"])})
    for variant in G1_REFERENCE_LABELS:
        r = refs["books"][variant]
        cy[f"ref_{variant}"] = r.groupby(r.index.year).apply(lambda x: float(np.expm1(np.log1p(x).sum())))
    t38y = pd.read_csv(TRACK38 / "calendar_years.csv") if (TRACK38 / "calendar_years.csv").exists() else pd.DataFrame()
    if len(t38y):
        t38y = t38y.set_index("year")
        for col, name in (("2x blend equity 100%", "track38_equity100"), ("2x blend equity 50% (rest T-bills)", "track38_blend50"),
                          ("SPY", "track38_spy")):
            if col in t38y:
                cy[name] = t38y[col].reindex(cy.index)
    cy.index.name = "year"
    _round(cy).to_csv(out / "calendar_years.csv")
    d = (cy["pipeline_nogov"] - cy["track38_blend50"]).dropna() if "track38_blend50" in cy else pd.Series(dtype=float)
    put("calendar years", "years compared with track 38 (50% blend)", len(d))
    if len(d):
        put("calendar years", "mean difference, pipeline (no governor) - track 38 (points)", 100.0 * d.mean())
        put("calendar years", "largest |difference| (points)", 100.0 * d.abs().max(), str(d.abs().idxmax()))
        put("calendar years", "years with the same sign", int(((cy["pipeline_nogov"] > 0) == (cy["track38_blend50"] > 0))[d.index].sum()))
        dr = (cy["ref_blend50"] - cy["track38_blend50"]).dropna()
        put("calendar years", "mean difference, reference blend50 - track 38 (points)", 100.0 * dr.mean(),
            f"largest {100.0 * dr.abs().max():.1f} in {dr.abs().idxmax()}")
        dg = (cy["pipeline_gov"] - cy["pipeline_nogov"]).dropna()
        put("calendar years", "years the governor changed the return by 1 point or more", int((dg.abs() >= 0.01).sum()),
            ", ".join(f"{y}: {100.0 * v:+.1f}" for y, v in dg[dg.abs() >= 0.01].items()))

    # ---- the episodes --------------------------------------------------------------------------------
    ep = pd.DataFrame({"pipeline_nogov": episode_returns(a["ira"]), "pipeline_gov": episode_returns(b["ira"]),
                       "spy_replay": episode_returns(a["spy"])})
    for variant in G1_REFERENCE_LABELS:
        ep[f"ref_{variant}"] = episode_returns(ref_nav[variant])
    t38e = pd.read_csv(TRACK38 / "episodes.csv") if (TRACK38 / "episodes.csv").exists() else pd.DataFrame()
    if len(t38e):
        t38e = t38e.set_index("episode")
        for col in ("blend_2x_50pct", "spx2x_w", "ndx2x_w", "SPY"):
            ep[f"track38_{col}"] = t38e[col].reindex(ep.index)
        ep["diff_nogov_vs_track38"] = ep["pipeline_nogov"] - ep["track38_blend_2x_50pct"]
        ep["diff_ref_blend50_vs_track38"] = ep["ref_blend50"] - ep["track38_blend_2x_50pct"]
    ep.index.name = "episode"
    _round(ep).to_csv(out / "episodes.csv")
    def pct(x: Any) -> str:
        return "n/a" if x is None or pd.isna(x) else f"{float(x):+.1%}"

    for label, row in ep.iterrows():
        note = (f"track 38 {pct(row.get('track38_blend_2x_50pct'))}; reference blend50 {pct(row['ref_blend50'])}, band50 "
                f"{pct(row['ref_band50'])}, band + governor {pct(row['ref_band_gov50'])}; with the governor {pct(row['pipeline_gov'])}; "
                f"SPY {pct(row['spy_replay'])}")
        put("episodes (no governor vs track 38, tolerance 3 points)", label, row["pipeline_nogov"], note)
        if "diff_nogov_vs_track38" in row and pd.notna(row["diff_nogov_vs_track38"]):
            put("episodes (no governor vs track 38, tolerance 3 points)", f"{label}: difference (points)", 100.0 * row["diff_nogov_vs_track38"])

    # ---- the Sundays, the switches, the orders ---------------------------------------------------------
    da, db = a["dec"].copy(), b["dec"].copy()
    keep = ["sunday", "friday", "nav_ira", "peak", "drawdown", "G", "G_step", "hard_stop", "paused", "orders_sent",
            "orders_deferred", "sent", "reasons"] + [c for leg in legs for c in (f"{leg}_in", f"{leg}_pct_vs_sma", f"{leg}_signal")]
    sun = da[[c for c in keep if c in da.columns]].rename(columns={"nav_ira": "nav_ira_nogov", "orders_sent": "orders_nogov",
                                                                    "orders_deferred": "deferred_nogov", "sent": "sent_nogov",
                                                                    "reasons": "reasons_nogov"})
    sun = sun.drop(columns=[c for c in ("peak", "drawdown", "G", "G_step", "hard_stop", "paused") if c in sun.columns])
    gcols = ["sunday", "nav_ira", "nav_total", "peak", "drawdown", "G", "G_step", "hard_stop", "paused", "orders_sent",
             "orders_deferred", "sent", "reasons"] + [f"{leg}_in" for leg in legs]
    sg = db[[c for c in gcols if c in db.columns]].rename(columns={"nav_ira": "nav_ira_gov", "nav_total": "nav_total_gov",
                                                                    "orders_sent": "orders_gov", "orders_deferred": "deferred_gov",
                                                                    "sent": "sent_gov", "reasons": "reasons_gov",
                                                                    **{f"{leg}_in": f"{leg}_in_gov" for leg in legs}})
    sun = sun.merge(sg, on="sunday", how="outer").sort_values("sunday")
    _round(sun, 5).to_csv(out / "sundays.csv", index=False)
    yrs = (pd.Timestamp(end) - pd.Timestamp(start)).days / 365.25
    for tag, dec in (("no governor", da), ("governor", db)):
        sect = f"orders [{tag}]"
        put(sect, "Sundays", len(dec))
        put(sect, "Sundays with orders", int((dec["orders_sent"] > 0).sum()), f"{(dec['orders_sent'] > 0).sum() / yrs:.1f} a year")
        put(sect, "max orders in one email", int(dec["orders_sent"].max()), "must be <= 3")
        put(sect, "orders sent in all", int(dec["orders_sent"].sum()))
        put(sect, "Sundays with a deferred order", int((dec["orders_deferred"] > 0).sum()))
        per_year = dec.assign(year=dec["sunday"].str.slice(0, 4)).groupby("year").agg(
            sundays=("sunday", "size"), with_orders=("orders_sent", lambda s: int((s > 0).sum())), orders=("orders_sent", "sum"),
            deferred=("orders_deferred", "sum"), min_G=("G", "min"), max_drawdown=("drawdown", "max"))
        per_year.to_csv(out / f"orders_and_governor_by_year_{'gov' if tag == 'governor' else 'nogov'}.csv")
    switch_rows = []
    for leg in legs:
        pipe_ev = _sunday_events(da, leg)
        pipe_ev_gov = _sunday_events(db, leg)
        ref_band = _events(refs["states"][f"{leg}_band"])
        ref_free = _events(refs["states"][f"{leg}_bandfree"])
        sect = f"G1 switches: {leg}"
        put(sect, "switches a year, pipeline (no governor; Rule E exits included)", len(pipe_ev) / yrs, "track 26: about 1.1 a year per leg with the band")
        put(sect, "switches a year, pipeline (governor)", len(pipe_ev_gov) / yrs)
        put(sect, "switches a year, the 2% band rule on the same data", len(ref_band) / yrs)
        put(sect, "switches a year, the band-free rule on the same data", len(ref_free) / yrs, "track 31/38's simulation: about 3")
        m = match_events(pipe_ev, ref_band)
        put(sect, "events matched to the band rule within a week / extra / missed", m["matched"], f"extra {m['extra']}, missed {m['missed']}")
        m2 = match_events(pipe_ev, ref_free)
        put(sect, "events matched to the band-free rule within a week / extra / missed", m2["matched"], f"extra {m2['extra']}, missed {m2['missed']}")
        st = da.set_index("sunday")[f"{leg}_in"].dropna() if f"{leg}_in" in da else pd.Series(dtype=object)
        put(sect, "weeks in (fraction)", float(st.astype(bool).mean()) if len(st) else None)
        put(sect, "Sundays with no signal", int((da[f"{leg}_signal"] != True).sum()) if f"{leg}_signal" in da else 0)   # noqa: E712
        for src, ev in (("pipeline", pipe_ev), ("pipeline_gov", pipe_ev_gov), ("rule_band", ref_band), ("rule_bandfree", ref_free)):
            switch_rows += [{"date": d, "leg": leg, "source": src, "event": kind} for d, kind in ev]
    re_a = _rule_e_summary(put, "no governor", a)
    re_b = _rule_e_summary(put, "governor", b)
    for src, df in (("rule_e_exit", re_a), ("rule_e_exit_gov", re_b)):
        ex = df[df["event"] == "exit"]
        switch_rows += [{"date": r["date"], "leg": r["ticker"], "source": src, "event": "off", "pct_vs_sma": r["pct_vs_sma"]}
                        for _, r in ex.iterrows()]
    pd.DataFrame(switch_rows, columns=["date", "leg", "source", "event", "pct_vs_sma"]).sort_values(
        ["leg", "date", "source"]).to_csv(out / "g1_switches.csv", index=False)

    # ---- the governor: its path through the bears, the floors, the hard stop ---------------------------
    gsec = "governor"
    put(gsec, "hard stop fired", int(bool(db["hard_stop"].fillna(False).astype(bool).any())),
        ", ".join(db[db["hard_stop"].fillna(False).astype(bool)]["sunday"].head(5)))
    put(gsec, "Sundays paused after the hard stop", int(db["paused"].fillna(False).astype(bool).sum()),
        "a restart needs the owner's review: governor.restart(state.growth, nav, date) starts the peak again at that NAV")
    put(gsec, "Sundays with G < 1", int((db["G"] < 1.0 - 1e-9).sum()), f"of {len(db)}")
    floor = float((g.get("governor") or {}).get("floor", 0.25))
    at_floor = db[db["G"] <= floor + 1e-9]
    put(gsec, f"Sundays at the floor (G = {floor:.2f})", len(at_floor),
        ", ".join(f"{s}..{e}" for s, e in _spans(pd.DatetimeIndex(pd.to_datetime(at_floor["sunday"])))[:8]))
    put(gsec, "lowest G", float(db["G"].min()), str(db.loc[db["G"].idxmin(), "sunday"]))
    put(gsec, "deepest drawdown seen (IRA + taxable at Friday's close)", float(db["drawdown"].max()), str(db.loc[db["drawdown"].idxmax(), "sunday"]))
    cuts = db[db["reasons"].str.contains("governor_cut", na=False)]
    restores = db[db["reasons"].str.contains("governor_restore", na=False)]
    put(gsec, "Sundays with a governor cut", len(cuts), ", ".join(cuts["sunday"].head(12)))
    put(gsec, "Sundays with a governor restore", len(restores), ", ".join(restores["sunday"].head(12)))
    ira_a, ira_b = a["ira"], b["ira"]
    path_rows = []
    for name, lo, hi in BEARS:
        y = db[(db["sunday"] >= lo) & (db["sunday"] <= hi)]
        if not len(y):
            continue
        first_cut = y[y["G"] < 1.0 - 1e-9]["sunday"].head(1)
        nav_a_end, nav_b_end = float(ira_a.loc[:hi].iloc[-1]), float(ira_b.loc[:hi].iloc[-1])
        nav_a_0, nav_b_0 = float(ira_a[ira_a.index < pd.Timestamp(lo)].iloc[-1]), float(ira_b[ira_b.index < pd.Timestamp(lo)].iloc[-1])
        put(f"governor through {name} ({lo} -> {hi})", "lowest G", float(y["G"].min()), f"on {y.loc[y['G'].idxmin(), 'sunday']}")
        put(f"governor through {name} ({lo} -> {hi})", "deepest Friday drawdown (IRA + taxable)", float(y["drawdown"].max()), f"on {y.loc[y['drawdown'].idxmax(), 'sunday']}")
        put(f"governor through {name} ({lo} -> {hi})", "Sundays with G < 1", int((y["G"] < 1.0 - 1e-9).sum()),
            f"first {first_cut.iloc[0] if len(first_cut) else 'none'}; at the floor {int((y['G'] <= floor + 1e-9).sum())}")
        put(f"governor through {name} ({lo} -> {hi})", "governor cuts / restores (Sundays with such orders)",
            int(y["reasons"].str.contains("governor_cut", na=False).sum()),
            f"restores {int(y['reasons'].str.contains('governor_restore', na=False).sum())}; cuts on "
            f"{', '.join(y[y['reasons'].str.contains('governor_cut', na=False)]['sunday'].head(8))}")
        put(f"governor through {name} ({lo} -> {hi})", "hard stop fired", int(y["hard_stop"].fillna(False).astype(bool).any()))
        put(f"governor through {name} ({lo} -> {hi})", "IRA return over the window, no governor", nav_a_end / nav_a_0 - 1.0)
        put(f"governor through {name} ({lo} -> {hi})", "IRA return over the window, with the governor", nav_b_end / nav_b_0 - 1.0)
        put(f"governor through {name} ({lo} -> {hi})", "IRA with vs without the governor at the window's end", nav_b_end / nav_a_end - 1.0)
        for _, r in y.iterrows():
            path_rows.append({"bear": name, "sunday": r["sunday"], "friday": r["friday"], "nav_total_gov": r.get("nav_total"),
                              "nav_ira_gov": r["nav_ira"], "nav_ira_nogov": float(ira_a.loc[:r["friday"]].iloc[-1]) if len(ira_a.loc[:r["friday"]]) else None,
                              "peak": r["peak"], "drawdown": r["drawdown"], "G": r["G"], "G_step": r["G_step"],
                              "hard_stop": r["hard_stop"], "paused": r["paused"], "orders": r["orders_sent"], "sent": r["sent"],
                              "reasons": r["reasons"], **{f"{leg}_in": r.get(f"{leg}_in") for leg in legs}})
    _round(pd.DataFrame(path_rows), 5).to_csv(out / "governor_path.csv", index=False)

    # ---- the 1987 record -----------------------------------------------------------------------------
    crash = pd.Timestamp(CRASH_DAY)
    sunday_before = iso(crash - pd.Timedelta(days=1))
    sect = "1987 (the Sunday 1987-10-18 email, Black Monday, the next Sunday's G)"
    for tag, w in (("no governor", a), ("governor", b)):
        dec = w["dec"]
        row = dec[dec["sunday"] == sunday_before]
        if not len(row):
            continue
        row = row.iloc[0]
        for leg in legs:
            put(sect, f"[{tag}] {sunday_before}: {leg} Friday close vs its 200-day average", row.get(f"{leg}_pct_vs_sma"),
                f"state after the decision: {'in' if row.get(f'{leg}_in') else 'out'}; signal {row.get(f'{leg}_signal')}")
        put(sect, f"[{tag}] {sunday_before}: orders in the email", int(row["orders_sent"]), str(row["sent"]))
        em = w["emails"]
        hit = em[em["run"] == f"weekly:{sunday_before}"] if len(em) else pd.DataFrame()
        if len(hit):
            put(sect, f"[{tag}] {sunday_before}: the email", None, f"{hit.iloc[0]['subject']} (emails/{hit.iloc[0]['file']})")
        week_re = [r for r in w["rule_e"] if "1987-10-12" <= r["as_of"] <= "1987-10-16"]
        put(sect, f"[{tag}] Rule E in the week of 12-16 October 1987", len(week_re),
            "; ".join(f"{r['as_of']} {r['payload'].get('event')} " + ", ".join(f"{lg['ticker']} ({lg.get('pct_vs_sma')}% vs the average)" for lg in r["payload"].get("legs") or [])
                      + (f" [{r['payload'].get('reason')}]" if r["payload"].get("reason") else "") for r in week_re))
        ira = w["ira"]
        before = float(ira[ira.index < crash].iloc[-1])
        on = float(ira.loc[crash]) if crash in ira.index else None
        put(sect, f"[{tag}] the IRA on Black Monday (1987-10-19 close vs 1987-10-16 close)", None if on is None else on / before - 1.0,
            f"${before:,.0f} -> ${on:,.0f}" if on is not None else "no mark")
        fl = w["fills"]
        day = fl[(fl["fill_date"] == CRASH_DAY) & (fl["side"] != "dividend")] if len(fl) else pd.DataFrame()
        put(sect, f"[{tag}] fills at Monday 1987-10-19's open", len(day),
            "; ".join(f"{r['side']} {r['ticker']} ${float(r['dollars']):,.0f} at {float(r['price']):.4f} (open {float(r['ref_price']):.4f})" for _, r in day.iterrows()))
        nxt = dec[dec["sunday"] > sunday_before].head(1)
        if len(nxt):
            n = nxt.iloc[0]
            put(sect, f"[{tag}] the next Sunday ({n['sunday']}): G / drawdown", float(n["G"]), f"drawdown {float(n['drawdown']):.4f}, peak ${float(n['peak']):,.0f}, orders {n['sent']}")
    # what a 1987 day costs the G1-only book if both legs are in at their target weights and nothing is sold before the close
    moves = {leg: float(history.bars[str(spec["index"])]["close"].pct_change().loc[crash])
             for leg, spec in (((g.get("sleeves") or {}).get("G1") or {}).get("legs") or {}).items()
             if crash in history.bars[str(spec["index"])].index}
    L = FUND_PROXY["L"]
    loss = sum(refs["weights"][leg] * L * mv for leg, mv in moves.items())
    put(sect, "index moves on 1987-10-19", None, ", ".join(f"{leg}'s index {mv:+.2%}" for leg, mv in moves.items()))
    put(sect, "hypothetical: both legs in at 25% each and filled at Monday's close (no exit before it): IRA loss", loss,
        f"{L:.0f} x the index moves at the target weights; track 38's shock_1987.csv: -29.5% for the full book (2x 50% + BTC 30% + gems 15%), G 0.456 after")
    dec_b = b["dec"]
    fri = dec_b[dec_b["sunday"] == sunday_before]
    if len(fri):
        r = fri.iloc[0]
        nav_total, nav_ira, peak = float(r["nav_total"]), float(r["nav_ira"]), float(r["peak"])
        dd_h = gov_mod.drawdown(nav_total + nav_ira * loss, peak)
        put(sect, "hypothetical: the governor's drawdown after such a Monday (IRA + taxable, on the 1987-10-16 peak)", dd_h,
            f"G would be {gov_mod.G(dd_h, g):.3f}; the drawdown on Friday 16 October was {float(r['drawdown']):.4f} (G {float(r['G']):.2f})")
    shock = pd.read_csv(TRACK38 / "shock_1987.csv") if (TRACK38 / "shock_1987.csv").exists() else pd.DataFrame()
    for _, r in shock.iterrows():
        put(sect, f"track 38 shock_1987: {r['book']}", r["one_day_loss_1987_style"], f"G after {r['governor_after']:.3f}")

    # ---- the look-ahead check --------------------------------------------------------------------------
    if lookahead is not None:
        la, lb = lookahead
        cmp_ = compare_runs(la, lb)
        seg_a = json.loads((Path(la) / "segment.json").read_text())
        seg_b = json.loads((Path(lb) / "segment.json").read_text())
        put("look-ahead", "window", None, f"{seg_a['start']} -> {seg_a['end']} (book {seg_a.get('book')}, governor {seg_a.get('governor')})")
        put("look-ahead", "identical decisions with and without the as-of cut", int(cmp_["identical"]),
            f"{cmp_['records_a']} vs {cmp_['records_b']} decision records; first difference {cmp_['first_difference']}")
        put("look-ahead", "provider calls that returned future rows without the cut", seg_b["served_after_asof"])
        put("look-ahead", "Sundays in the window", sum(1 for r in ledger_records(Path(la) / "state") if r["record_type"] == "growth_decision"))

    # ---- monthly NAV, for the record ------------------------------------------------------------------
    mm = pd.DataFrame({"nogov_ira": a["ira"], "gov_ira": b["ira"], "gov_total": b["total"], "spy_adj": a["spy"]})
    for variant in G1_REFERENCE_LABELS:
        mm[f"ref_{variant}"] = ref_nav[variant] * float(a["ira"].iloc[0])
    mm = mm.groupby(mm.index.to_period("M")).last()
    g_by_month = db.assign(month=pd.to_datetime(db["sunday"]).dt.to_period("M")).groupby("month")["G"].last()
    mm["G_gov"] = g_by_month.reindex(mm.index)
    mm.index = mm.index.astype(str)
    _round(mm, 2).to_csv(out / "nav_monthly.csv", index_label="month")
    s = pd.DataFrame(summary)
    s.to_csv(out / "summary.csv", index=False)
    return s


# ======================================================================================================
# 8. CLI
# ======================================================================================================

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help="data cache directory (outside the repo)")
        p.add_argument("--config-dir", type=Path, default=None)

    p = sub.add_parser("fetch", help="download and cache every series")
    common(p)
    p.add_argument("--refresh", action="store_true", help="download again what is already cached")
    for name in ("run", "all"):
        p = sub.add_parser(name, help="replay the pipeline" if name == "run" else "fetch if needed, run, reconcile")
        common(p)
        p.add_argument("--start", default="2019-01-02")
        p.add_argument("--end", default="2026-09-28")
        p.add_argument("--work", type=Path, default=DEFAULT_WORK, help="state, ledger and captured emails")
        p.add_argument("--resume", action="store_true", help="continue a replay whose state exists in --work")
        p.add_argument("--no-cut", action="store_true", help="look-ahead diagnostic: serve full histories")
        p.add_argument("--second-source", choices=("echo", "history"), default="echo",
                       help="echo the primary close (default, flagged) or serve Nasdaq/FRED history")
        p.add_argument("--book", choices=("g1-only",), default=None,
                       help="Phase C4b: the G1 legs alone (G2 and W10 at weight 0, the v3.3 modules and shadow books off)")
        p.add_argument("--no-governor", action="store_true",
                       help="with --book g1-only: the governor forced to G = 1 and the hard stop off")
        p.add_argument("--fund-proxies", action="store_true",
                       help="proxy SSO/QLD bars before June 2006 (track 26's 2x model) and SPY before 1993, flagged")
        if name == "all":
            p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p = sub.add_parser("reconcile", help="compare replay segments with the research lists")
    common(p)
    p.add_argument("--work", type=Path, nargs="+", default=[DEFAULT_WORK])
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--compare", type=Path, default=None,
                   help="another replay of the first segment's window (e.g. --second-source history)")
    p = sub.add_parser("reconcile-growth", help="the growth book (design v4) vs track 38 and the reference books")
    common(p)
    p.add_argument("--work", type=Path, default=DEFAULT_WORK)
    p.add_argument("--out", type=Path, default=DEFAULT_GROWTH_OUT)
    p.add_argument("--lookahead", type=Path, nargs=2, default=None, metavar=("CUT", "NOCUT"),
                   help="two replays of one window, with and without the as-of cut, to compare")
    p = sub.add_parser("reconcile-g1", help="Phase C4b: the 1986-2026 G1-only replays vs track 38 and the reference books")
    common(p)
    p.add_argument("--work", type=Path, required=True, help="the replay without the governor (--book g1-only --no-governor)")
    p.add_argument("--work-governor", type=Path, required=True, help="the replay with the production governor")
    p.add_argument("--out", type=Path, default=DEFAULT_G1_OUT)
    p.add_argument("--lookahead", type=Path, nargs=2, default=None, metavar=("CUT", "NOCUT"),
                   help="two replays of one window, with and without the as-of cut, to compare")
    args = ap.parse_args(argv)
    cfg = load_config(args.config_dir)

    if args.cmd == "reconcile-g1":
        history = load_history(cfg, args.cache, fund_proxies=True)
        s = reconcile_g1(cfg, args.work, args.work_governor, args.out, history=history,
                         lookahead=tuple(args.lookahead) if args.lookahead else None)
        with pd.option_context("display.max_rows", 500, "display.width", 220, "display.max_colwidth", 120):
            print(s.to_string(index=False))
        return 0

    if args.cmd == "reconcile-growth":
        history = load_history(cfg, args.cache)
        s = reconcile_growth(cfg, args.work, args.out, history=history,
                             lookahead=tuple(args.lookahead) if args.lookahead else None)
        with pd.option_context("display.max_rows", 400, "display.width", 200, "display.max_colwidth", 110):
            print(s.to_string(index=False))
        return 0

    if args.cmd == "fetch" or (args.cmd == "all" and not (args.cache / "manifest.json").exists()):
        LOG(f"fetching into {args.cache}")
        fetch_history(cfg, args.cache, refresh=getattr(args, "refresh", False))
        if args.cmd == "fetch":
            return 0
    if args.cmd in ("run", "all"):
        history = load_history(cfg, args.cache, fund_proxies=args.fund_proxies)
        legs = ((cfg.constitution.get("growth") or {}).get("sleeves") or {}).get("G1", {}).get("legs") or {}
        first_fund = max((iso(history.bars[t].index[0]) for t in legs if t in history.bars), default="0000")
        if not args.fund_proxies and args.start < first_fund:
            raise SystemExit(f"--start {args.start} is before the first real fund bar ({first_fund}); add --fund-proxies")
        if args.no_governor and args.book != "g1-only":
            raise SystemExit("--no-governor needs --book g1-only")
        run_cfg = g1_only_config(cfg, governor=not args.no_governor) if args.book == "g1-only" else cfg
        run_segment(run_cfg, history, args.work, args.start, args.end, resume=args.resume, cut=not args.no_cut,
                    second_source=args.second_source, book=args.book,
                    extra={"governor": not args.no_governor, "fund_proxies": bool(args.fund_proxies)})
        if args.cmd == "run":
            return 0
    history = load_history(cfg, args.cache)
    works = args.work if isinstance(args.work, list) else [args.work]
    res = reconcile(cfg, works, args.out, history=history, compare=getattr(args, "compare", None))
    with pd.option_context("display.max_rows", 400, "display.width", 200, "display.max_colwidth", 90):
        print(res["summary"].to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
