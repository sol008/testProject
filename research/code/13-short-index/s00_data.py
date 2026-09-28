"""Warm the track-13 cache: Yahoo daily OHLC for US/intl indices and ETFs, FRED series,
Ken French 12-industry daily returns, and CPI release dates reconstructed from ALFRED
vintages.  Run once; every other script reads the cache.

    python3 s00_data.py            # download what is missing
    python3 s00_data.py --refresh  # re-download everything
"""
from __future__ import annotations

import io
import sys
import zipfile

import numpy as np
import pandas as pd

from common13 import CACHE, TODAY, _get, fred, yf_raw

US_INDEX = ["^GSPC", "^SP500TR", "^VIX", "^VIX3M", "^VIX9D", "^VXN", "^NDX", "^RUT", "^DJI", "^IXIC"]
US_ETF = ["SPY", "QQQ", "IWM", "DIA", "MDY", "EFA", "EEM"]
SECTORS = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY", "XLRE", "XLC"]
COUNTRIES = ["EWA", "EWC", "EWD", "EWG", "EWH", "EWI", "EWJ", "EWK", "EWL", "EWM", "EWN", "EWO",
             "EWP", "EWQ", "EWS", "EWU", "EWW", "EWT", "EWY", "EWZ", "EZA", "FXI"]
INTL_INDEX = ["^N225", "^FTSE", "^GDAXI", "^FCHI", "^HSI", "^STOXX50E", "^AXJO", "^GSPTSE",
              "^SSMI", "^AEX", "^IBEX", "^KS11", "^TWII", "^BVSP", "^MXX", "^BSESN"]
LEVERED = ["SSO", "UPRO", "QLD", "TQQQ"]
FRED_IDS = ["DTB3", "VIXCLS", "VXOCLS"]


def ken_french_industry_daily(refresh: bool = False) -> pd.DataFrame:
    """Value-weighted 12-industry daily returns (decimal), 1926-."""
    fn = CACHE / "12_Industry_Portfolios_daily_CSV.zip"
    if not fn.exists() or refresh:
        fn.write_bytes(_get("https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
                            "12_Industry_Portfolios_daily_CSV.zip"))
    z = zipfile.ZipFile(fn)
    txt = z.read(z.namelist()[0]).decode("latin-1").splitlines()
    rows, header, started = [], None, False
    for ln in txt:
        p = [q.strip() for q in ln.split(",")]
        if not started and len(p) > 5 and p[0] == "" and "NoDur" in ln:
            header = p[1:]
            started = True
            continue
        if started:
            if len(p) > 5 and p[0].isdigit() and len(p[0]) == 8:
                rows.append(p)
            elif rows:
                break   # end of the first (value-weighted) block
    df = pd.DataFrame(rows).set_index(0)
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df.columns = header
    df = df.astype(float) / 100.0
    df = df.where(df > -0.99)
    return df


def cpi_release_dates(refresh: bool = False) -> pd.Series:
    """First-release date of each monthly CPI-U (CPIAUCSL) observation, reconstructed from
    ALFRED: for every month we ask for many vintage dates in one request and take the first
    vintage in which the new observation appears."""
    fn = CACHE / "cpi_release_dates.csv"
    if fn.exists() and not refresh:
        s = pd.read_csv(fn, parse_dates=["release", "ref_month"])
        return s.set_index("ref_month")["release"]

    def probe(vds, cosd):
        """ALFRED allows at most 12 series per graph request."""
        vds = vds[:12]
        ids = ",".join(["CPIAUCSL"] * len(vds))
        vd = ",".join(v.strftime("%Y-%m-%d") for v in vds)
        cs = ",".join([cosd.strftime("%Y-%m-%d")] * len(vds))
        raw = _get(f"https://alfred.stlouisfed.org/graph/alfredgraph.csv?id={ids}"
                   f"&vintage_date={vd}&cosd={cs}", timeout=120)
        df = pd.read_csv(io.BytesIO(raw))
        df = df.set_index(df.columns[0])
        df.index = pd.to_datetime(df.index)
        return df

    out = {}
    for month_start in pd.date_range("1995-01-01", TODAY, freq="MS"):
        ref = month_start - pd.DateOffset(months=1)        # the month normally released now
        if ref in out:
            continue
        cosd = month_start - pd.DateOffset(months=3)
        windows = [
            [d for d in pd.bdate_range(month_start + pd.Timedelta(days=7), month_start + pd.Timedelta(days=24))],
            [d for d in pd.bdate_range(month_start, month_start + pd.Timedelta(days=6))] +
            [d for d in pd.bdate_range(month_start + pd.Timedelta(days=25), month_start + pd.offsets.MonthEnd(0))],
        ]
        for win in windows:
            win = [d for d in win if d <= TODAY][:12]
            if not win:
                continue
            try:
                df = probe(win, cosd)
            except Exception as e:  # pragma: no cover
                print("ALFRED failed", month_start.date(), e)
                continue
            cols = sorted(df.columns, key=lambda c: c.split("_")[-1])
            for r in df.index:
                if r in out:
                    continue
                seen = [c for c in cols if pd.notna(df.loc[r, c])]
                if seen and seen[0] != cols[0]:
                    out[r] = pd.Timestamp(seen[0].split("_")[-1])
            if ref in out:
                break
    s = pd.Series(out).sort_index()
    pd.DataFrame({"ref_month": s.index, "release": s.values}).to_csv(fn, index=False)
    return s


def main(refresh: bool = False):
    for t in US_INDEX + US_ETF + SECTORS + COUNTRIES + INTL_INDEX + LEVERED:
        try:
            df = yf_raw(t, refresh=refresh)
            print(f"{t:10s} {df.index[0].date()} -> {df.index[-1].date()} n={len(df)} last={df['Close'].iloc[-1]:.2f}")
        except Exception as e:
            print(t, "FAILED", e)
    for sid in FRED_IDS:
        s = fred(sid, refresh=refresh)
        print(f"FRED {sid} {s.index[0].date()} -> {s.index[-1].date()} last={s.iloc[-1]}")
    ind = ken_french_industry_daily(refresh=refresh)
    print("KF 12 industries", ind.index[0].date(), ind.index[-1].date(), list(ind.columns))
    cpi = cpi_release_dates(refresh=refresh)
    print("CPI releases", len(cpi), cpi.index[0].date(), cpi.iloc[0].date(), "...", cpi.index[-1].date(), cpi.iloc[-1].date())


if __name__ == "__main__":
    main(refresh="--refresh" in sys.argv)
