"""Track 29 data layer: point-in-time S&P 500 membership, Yahoo daily prices, Ken French files.

* Point-in-time (PIT) S&P 500 membership 1996-2026 from github.com/fja05680/sp500 (built from Andreas Clenow's
  list plus Wikipedia's "Selected changes"), pinned to commit a2430f2 (updated 2026-08-18).  Later changes are
  carried forward from the last row (the current list), which is what Wikipedia shows on 29 Sep 2026.
* Daily adjusted OHLC and volume from Yahoo (yfinance, auto_adjust=True: splits and dividends reinvested).
  Yahoo keeps only listed tickers, so most delisted members (bankrupt or acquired) have NO data.  That missing
  set is the survivorship bias this track measures (section 3 of the report).
* Ken French library files through `research/code/02-academic/kf_utils.py` (cached there).

The cache lives in ./cache (git-ignored) or $T29_CACHE.  Delete it to refresh.
"""
from __future__ import annotations

import io
import os
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
CACHE = Path(os.environ.get("T29_CACHE", HERE / "cache"))
CACHE.mkdir(parents=True, exist_ok=True)
RESULTS = HERE / "results"
RESULTS.mkdir(exist_ok=True)

os.environ.setdefault("KF_DATA_DIR", str(CACHE / "kf"))   # our own copy; track 02's folder is never written
sys.path.insert(0, str(HERE.parent / "02-academic"))
import kf_utils as KF  # noqa: E402  (read-only reuse of track 02's parser)

PIT_URL = ("https://raw.githubusercontent.com/fja05680/sp500/a2430f2af0c79ddf0748e91de11bdeb1616ab5a7/"
           "S%26P%20500%20Historical%20Components%20%26%20Changes%20(Updated).csv")
START = "1997-01-01"
END = "2026-09-29"          # exclusive in yfinance -> last bar 2026-09-28 (the latest close on 29 Sep)
ETFS = ["SPY", "QQQ", "MTUM", "SPMO", "QMOM", "XMMO", "PDP", "JMOM", "VFMO", "MMTM", "AMOMX", "PWJ",
        "SGOV", "BIL", "RSP", "IEF"]


def pit_membership() -> pd.DataFrame:
    """Rows: date, tickers (comma separated). Dates are change dates; membership holds until the next row."""
    fn = CACHE / "sp500_pit.csv"
    if not fn.exists():
        r = requests.get(PIT_URL, timeout=120)
        r.raise_for_status()
        fn.write_bytes(r.content)
    df = pd.read_csv(fn, parse_dates=["date"])
    return df.sort_values("date").reset_index(drop=True)


def yahoo_symbol(t: str) -> str:
    return t.replace(".", "-")


def member_mask(index: pd.DatetimeIndex, tickers: list[str]) -> pd.DataFrame:
    """Boolean frame (dates x tickers): True when the ticker was in the S&P 500 at that date's close."""
    pit = pit_membership()
    rows = []
    for _, r in pit.iterrows():
        rows.append((r["date"], set(r["tickers"].split(","))))
    col = {t: i for i, t in enumerate(tickers)}
    out = np.zeros((len(index), len(tickers)), dtype=bool)
    dates = [d for d, _ in rows]
    pos = np.searchsorted(np.array(dates, dtype="datetime64[ns]"), index.values, side="right") - 1
    cache: dict[int, np.ndarray] = {}
    for i, p in enumerate(pos):
        if p < 0:
            continue
        if p not in cache:
            v = np.zeros(len(tickers), dtype=bool)
            for t in rows[p][1]:
                j = col.get(yahoo_symbol(t))
                if j is not None:
                    v[j] = True
            cache[p] = v
        out[i] = cache[p]
    return pd.DataFrame(out, index=index, columns=tickers)


def reused_ticker_windows() -> dict[str, pd.Timestamp]:
    """Tickers that were S&P 500 members in more than one disjoint spell.  Yahoo holds the CURRENT company, so
    earlier spells may be a different firm: we only trust membership on/after the start of the LAST spell."""
    pit = pit_membership()
    spells: dict[str, list] = {}
    prev: set[str] = set()
    for _, r in pit.iterrows():
        cur = set(r["tickers"].split(","))
        for t in cur - prev:
            spells.setdefault(yahoo_symbol(t), []).append(r["date"])
        prev = cur
    return {t: max(v) for t, v in spells.items() if len(v) > 1}


def all_tickers() -> list[str]:
    pit = pit_membership()
    s: set[str] = set()
    for tk in pit.loc[pit.date >= START, "tickers"]:
        s |= set(tk.split(","))
    return sorted(yahoo_symbol(t) for t in s)


def _download_batch(tks: list[str]) -> dict[str, pd.DataFrame]:
    import yfinance as yf
    for attempt in range(4):
        try:
            d = yf.download(tks, start=START, end=END, auto_adjust=True, actions=False, progress=False,
                            threads=True, group_by="column")
            if d is None or d.empty:
                raise RuntimeError("empty")
            return {f: d[f] for f in ("Open", "Close", "Volume") if f in d}
        except Exception as e:  # noqa: BLE001
            print(f"  batch retry {attempt + 1}: {e}", flush=True)
            time.sleep(10 * (attempt + 1))
    return {}


def prices(refresh: bool = False) -> dict[str, pd.DataFrame]:
    """{'Open','Close','Volume'} daily frames for every PIT member since 1997 plus ETFs (cached pickles)."""
    fn = CACHE / "prices.pkl"
    if fn.exists() and not refresh:
        return pd.read_pickle(fn)
    tks = sorted(set(all_tickers()) | set(ETFS))
    parts: dict[str, list] = {"Open": [], "Close": [], "Volume": []}
    B = 60
    for i in range(0, len(tks), B):
        batch = tks[i:i + B]
        print(f"download {i}-{i + len(batch)} of {len(tks)}", flush=True)
        got = _download_batch(batch)
        for f, df in got.items():
            if isinstance(df, pd.Series):
                df = df.to_frame(batch[0])
            parts[f].append(df)
        time.sleep(2)
    out = {f: pd.concat(v, axis=1).sort_index() for f, v in parts.items() if v}
    for f in out:
        out[f] = out[f].loc[:, ~out[f].columns.duplicated()]
        out[f].index = pd.to_datetime(out[f].index).tz_localize(None)
    pd.to_pickle(out, fn)
    return out


# ------------------------------------------------------------------ Ken French

def kf_monthly(name: str, contains: str | None = None) -> pd.DataFrame:
    return KF.monthly_returns(name, contains)


def kf_factors() -> pd.DataFrame:
    return KF.monthly_returns("F-F_Research_Data_Factors")


if __name__ == "__main__":
    t0 = time.time()
    p = prices(refresh="--refresh" in sys.argv)
    c = p["Close"]
    print("close panel", c.shape, "non-empty columns", int(c.notna().any().sum()), f"{time.time() - t0:.0f}s")
