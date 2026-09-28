"""Currency peg / policy-break episodes: size and speed of the move after the break, versus
the (usually small) cost of betting on a break that never came.

Data: FRED daily noon buying rates (H.10) and monthly IFS rates.
Outputs (./output): peg_breaks.csv, peg_holds.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DIR, fred


def cross(a: str, b: str, how: str) -> pd.Series:
    x, y = fred(a), fred(b)
    df = pd.concat([x, y], axis=1).dropna()
    if how == "mul":
        return df.iloc[:, 0] * df.iloc[:, 1]
    return df.iloc[:, 0] / df.iloc[:, 1]


def series_foreign_value(name: str) -> pd.Series:
    """Return the value of the *pegged/defended* currency in units of the anchor currency,
    so a devaluation shows up as a fall."""
    if name == "GBP vs DEM (ERM exit, 16-Sep-1992) [monthly avg]":
        # FRED has no daily DEM series; EXUSUK = USD per GBP (monthly avg), EXGEUS = DEM per USD
        return cross("EXUSUK", "EXGEUS", "mul")
    if name == "THB vs USD (float, 2-Jul-1997)":
        return 1 / fred("DEXTHUS")
    if name == "KRW vs USD (Nov/Dec-1997)":
        return 1 / fred("DEXKOUS")
    if name == "MXN vs USD (Tequila, 20-Dec-1994)":
        return 1 / fred("DEXMXUS")
    if name == "EUR vs CHF (SNB floor removed, 15-Jan-2015)":
        # the *defended* rate was EUR/CHF >= 1.20; value of EUR in CHF = CHF/USD * USD/EUR
        return cross("DEXSZUS", "DEXUSEU", "mul")
    if name == "CNY vs USD (Aug-2015 devaluation)":
        return 1 / fred("DEXCHUS")
    if name == "BRL vs USD (Real float, 15-Jan-1999)":
        return 1 / fred("DEXBZUS")
    if name == "GBP vs USD (Brexit vote, 23-Jun-2016)":
        return fred("DEXUSUK")
    if name == "HKD vs USD (peg since 1983)":
        return 1 / fred("DEXHKUS")
    if name == "DKK vs EUR (ERM-II peg)":
        return 1 / cross("DEXDNUS", "DEXUSEU", "mul")
    raise KeyError(name)


BREAKS = {
    "GBP vs DEM (ERM exit, 16-Sep-1992) [monthly avg]": "1992-08-01",
    "MXN vs USD (Tequila, 20-Dec-1994)": "1994-12-19",
    "THB vs USD (float, 2-Jul-1997)": "1997-07-01",
    "KRW vs USD (Nov/Dec-1997)": "1997-10-31",
    "BRL vs USD (Real float, 15-Jan-1999)": "1999-01-12",
    "EUR vs CHF (SNB floor removed, 15-Jan-2015)": "2015-01-14",
    "CNY vs USD (Aug-2015 devaluation)": "2015-08-10",
    "GBP vs USD (Brexit vote, 23-Jun-2016)": "2016-06-23",
}

MONTHLY_BREAKS = {  # IFS monthly national currency per USD (period average)
    "RUB (Aug-1998 default/devaluation)": ("CCUSMA02RUM618N", "1998-07-01"),
    "IDR (1997-98)": ("CCUSMA02IDM618N", "1997-06-01"),
}


def after(s: pd.Series, t0: pd.Timestamp, days: int) -> float:
    return float(s.asof(t0 + pd.Timedelta(days=days)))


def main():
    rows = []
    for name, d0 in BREAKS.items():
        s = series_foreign_value(name).dropna()
        t0 = pd.Timestamp(d0)
        v0 = float(s.asof(t0))
        r = dict(episode=name, last_day_before=d0, level_before=round(v0, 4))
        for lab, days in (("1d", 1), ("1w", 7), ("1m", 30), ("3m", 91), ("12m", 365)):
            r[f"move_{lab}"] = round(after(s, t0, days) / v0 - 1, 3)
        window = s.loc[t0:t0 + pd.Timedelta(days=730)]
        r["max_move_within_2y"] = round(float(window.min() / v0 - 1), 3)
        r["date_of_max_move"] = window.idxmin().date()
        rows.append(r)
    for name, (sid, d0) in MONTHLY_BREAKS.items():
        s = 1 / fred(sid)
        t0 = pd.Timestamp(d0)
        v0 = float(s.asof(t0))
        r = dict(episode=name + " [monthly avg]", last_day_before=d0, level_before=round(v0, 6))
        for lab, days in (("1m", 31), ("3m", 92), ("12m", 366)):
            r[f"move_{lab}"] = round(after(s, t0, days) / v0 - 1, 3)
        window = s.loc[t0:t0 + pd.Timedelta(days=730)]
        r["max_move_within_2y"] = round(float(window.min() / v0 - 1), 3)
        r["date_of_max_move"] = window.idxmin().date()
        rows.append(r)
    br = pd.DataFrame(rows)
    br.to_csv(OUT_DIR / "peg_breaks.csv", index=False)

    # Pegs that were attacked but held: how far did spot move (the bettor's mark-to-market pain
    # is mostly carry/forward points, not spot)?
    holds = []
    for name, (a, b) in {"HKD vs USD (peg since 1983)": ("1998-01-01", "2026-09-30"),
                         "DKK vs EUR (ERM-II peg)": ("1999-01-04", "2026-09-30")}.items():
        s = series_foreign_value(name).loc[a:b].dropna()
        # FRED cross rates contain a handful of mismatched-timestamp prints (e.g. DKK 2000-11-28),
        # so report the 0.1%-99.9% range as the robust band
        lo, hi = float(s.quantile(0.001)), float(s.quantile(0.999))
        holds.append(dict(peg=name, start=a, end=s.index[-1].date(), p001=round(lo, 5),
                          p999=round(hi, 5), robust_range_pct=round(hi / lo - 1, 4),
                          raw_min=round(float(s.min()), 5), raw_max=round(float(s.max()), 5)))
    ho = pd.DataFrame(holds)
    ho.to_csv(OUT_DIR / "peg_holds.csv", index=False)

    # Famous discretionary macro FX trades (monthly averages, FRED): size of the underlying move
    macro = []
    for name, sid, invert, t0, horizons in [
        ("Soros 1985 long JPY (Plaza, 22-Sep-1985)", "EXJPUS", True, "1985-09-01", (3, 11)),
        ("Druckenmiller long DEM after Berlin Wall (Nov-1989)", "EXGEUS", True, "1989-10-01", (3, 13)),
        ("Krieger short NZD after Oct-1987 crash", "EXUSNZ", False, "1987-10-01", (1, 6)),
    ]:
        s = fred(sid)
        v = (1 / s) if invert else s  # value of the foreign currency in USD
        base = float(v.loc[t0])
        r = dict(trade=name, base_month=t0, base_value_usd=round(base, 5))
        for h in horizons:
            t = pd.Timestamp(t0) + pd.DateOffset(months=h)
            r[f"move_after_{h}m"] = round(float(v.asof(t)) / base - 1, 3)
        macro.append(r)
    mc = pd.DataFrame(macro)
    mc.to_csv(OUT_DIR / "macro_fx_trades.csv", index=False)

    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    print(br.to_string(index=False))
    print()
    print(ho.to_string(index=False))
    print()
    print(mc.to_string(index=False))


if __name__ == "__main__":
    main()
