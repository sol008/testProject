"""Build daily *excess-return* series for futures-like markets.

Two universes:
  LONG  (design set, long history, synthetic futures excess returns)
        equity indices (price return), US Treasury 2/5/10/30y from constant-maturity yields,
        G10 FX vs USD (spot + 3m interest differential), NYMEX energy (roll-clean, EIA contracts 1-4),
        gold (COMEX front month, roll-adjusted by subtracting T-bill carry).
  ETF   (test set, tradable proxies 2008+): adjusted-close total return minus T-bill.

Each function returns a DataFrame of daily excess returns (decimal), NaN before inception.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common as C

EQ_IDX = {"SPX": "^GSPC", "NKY": "^N225", "CCMP": "^IXIC", "TSX": "^GSPTSE", "UKX": "^FTSE",
          "HSI": "^HSI", "DAX": "^GDAXI", "ASX": "^AXJO"}
BONDS = {"UST2": ("DGS2", 2), "UST5": ("DGS5", 5), "UST10": ("DGS10", 10), "UST30": ("DGS30", 30)}
# FRED spot: USD per FCY if 'US' first in code (DEXUSxx), else FCY per USD
FX = {"JPY": ("DEXJPUS", False, "IR3TIB01JPM156N"), "GBP": ("DEXUSUK", True, "IR3TIB01GBM156N"),
      "CHF": ("DEXSZUS", False, "IR3TIB01CHM156N"), "CAD": ("DEXCAUS", False, "IR3TIB01CAM156N"),
      "AUD": ("DEXUSAL", True, "IR3TIB01AUM156N"), "EUR": ("DEXUSEU", True, "IR3TIB01EZM156N"),
      "NZD": ("DEXUSNZ", True, "IR3TIB01NZM156N"), "SEK": ("DEXSDUS", False, "IR3TIB01SEM156N"),
      "NOK": ("DEXNOUS", False, "IR3TIB01NOM156N")}

ETF_UNIVERSE = {
    # ticker: (asset class, one-way cost in bp, annual short-borrow cost in %)
    "SPY": ("EQ", 2, 0.3), "QQQ": ("EQ", 2, 0.3), "IWM": ("EQ", 2, 0.3), "EFA": ("EQ", 3, 0.3), "EEM": ("EQ", 3, 0.5),
    "EWJ": ("EQ", 4, 0.5),
    "TLT": ("BD", 2, 0.3), "IEF": ("BD", 2, 0.3),
    "GLD": ("CM", 2, 0.3), "SLV": ("CM", 4, 0.5), "USO": ("CM", 4, 1.0), "DBC": ("CM", 5, 1.0), "UNG": ("CM", 6, 2.0),
    "DBA": ("CM", 8, 2.0),
    "FXE": ("FX", 6, 1.0), "FXY": ("FX", 6, 1.0), "FXB": ("FX", 8, 1.5), "FXA": ("FX", 8, 1.5), "FXC": ("FX", 8, 1.5),
    "FXF": ("FX", 10, 2.0), "UUP": ("FX", 4, 1.0),
}
# one-way cost (bp of notional) for micro/e-mini futures incl. commission, fees, 1/2-1 tick slippage
FUT_COST_BP = {"EQ": 2.0, "BD": 2.0, "FX": 2.0, "CM": 4.0}
ROLLS_PER_YEAR = {"EQ": 4, "BD": 4, "FX": 4, "CM": 12, "GOLD": 6}


def _bday_index(start="1960-01-01", end=C.ASOF):
    return pd.bdate_range(start, end)


def equity_excess() -> pd.DataFrame:
    px = C.yf_close(list(EQ_IDX.values()), adjusted=False)
    px.columns = list(EQ_IDX.keys())
    r = px.pct_change(fill_method=None)
    return r


def par_bond_duration(y: pd.Series, m: float) -> tuple[pd.Series, pd.Series]:
    """Modified duration and convexity of a par bond, semiannual coupons, yield y (decimal)."""
    y = y.clip(lower=1e-4)
    n = 2 * m
    h = y / 2
    D = (1 - (1 + h) ** (-n)) / y
    # convexity approx for par bond (numerical)
    dy = 1e-4
    def price(yy):
        hh = yy / 2
        return (y / 2) * (1 - (1 + hh) ** (-n)) / hh + (1 + hh) ** (-n)
    Cx = (price(y + dy) + price(y - dy) - 2 * price(y)) / (dy ** 2) / price(y)
    return D, Cx


def bond_excess() -> pd.DataFrame:
    rf = C.fred("DTB3") / 100
    out = {}
    for name, (sid, m) in BONDS.items():
        y = C.fred(sid) / 100
        y = y[~y.index.duplicated()]
        D, Cx = par_bond_duration(y, m)
        dy = y.diff()
        rfa = rf.reindex(y.index).ffill()
        # daily excess return: carry (y - rf) + price change from yield move (duration + convexity);
        # calendar-day accrual between observations
        days = y.index.to_series().diff().dt.days.fillna(1)
        carry = (y.shift(1) - rfa.shift(1)) * days / 365.0
        r = carry - D.shift(1) * dy + 0.5 * Cx.shift(1) * dy ** 2
        # DGS30 had a gap 2002-02 .. 2006-02: returns across the gap are dropped
        r[days > 10] = np.nan
        out[name] = r
    return pd.DataFrame(out)


FALLBACK_RATES = {"JPY": ["IRSTCI01JPM156N", "INTDSRJPM193N"], "CHF": ["IRSTCI01CHM156N"],
                  "EUR": ["IR3TIB01DEM156N"], "GBP": ["IRSTCI01GBM156N"]}


def short_rate(name: str, rate_id: str) -> pd.Series:
    """Monthly 3m rate (decimal) spliced backwards with call-money / discount rates where missing."""
    fr = C.fred(rate_id) / 100
    for alt in FALLBACK_RATES.get(name, []):
        try:
            a = C.fred(alt) / 100
            fr = pd.concat([a[a.index < fr.index[0]], fr])
        except Exception:  # noqa: BLE001
            pass
    return fr[~fr.index.duplicated()].sort_index()


def fx_excess(with_carry: bool = True) -> pd.DataFrame:
    """Long foreign currency vs USD: log spot change (USD per FCY) + (i_fcy - i_usd) accrual.
    EUR starts 1999 (FRED no longer serves daily DEM)."""
    us = C.fred("IR3TIB01USM156N") / 100 if with_carry else None
    out = {}
    for name, (sid, usd_first, rate_id) in FX.items():
        s = C.fred(sid)
        usd_per_fcy = s if usd_first else 1.0 / s
        usd_per_fcy = usd_per_fcy[~usd_per_fcy.index.duplicated()]
        lr = np.log(usd_per_fcy).diff()
        days = usd_per_fcy.index.to_series().diff().dt.days.fillna(1)
        if with_carry:
            try:
                fr = short_rate(name, rate_id)
                idx = usd_per_fcy.index
                fr_d = fr.reindex(fr.index.union(idx)).ffill().reindex(idx)
                us_d = us.reindex(us.index.union(idx)).ffill().reindex(idx)
                diff = (fr_d - us_d).shift(1) * days / 365.0
                lr = lr + diff.fillna(0)
            except Exception as e:  # noqa: BLE001
                print("fx carry unavailable for", name, e)
        out[name] = np.expm1(lr)
    return pd.DataFrame(out)


# --------------------------------------------------------------------------- energy (EIA)
def deglitch(df: pd.DataFrame, k: float = 4.0) -> pd.DataFrame:
    """EIA series contain occasional stale/copied values (a price from days earlier re-appears for one
    day and reverses next day). Replace a value by NaN (then ffill) when it produces a >k-sigma move that
    is >=75% reversed the next day. Also forward-fill single missing values."""
    out = df.copy()
    for c in out.columns:
        s = out[c].copy()
        for _ in range(2):
            lr = np.log(s.where(s > 0)).diff()
            sd = lr.rolling(60, min_periods=20).std().shift(1)
            nxt = lr.shift(-1)
            bad = (lr.abs() > k * sd) & (lr.abs() > 0.03) & (np.sign(nxt) == -np.sign(lr)) & ((lr + nxt).abs() < 0.25 * lr.abs())
            if not bad.any():
                break
            s[bad] = np.nan
            s = s.ffill(limit=1)
        out[c] = s.ffill(limit=3)
    return out


def roll_day_validation(sym: str) -> dict:
    """On calendar-rule switch days with a large C1-C2 spread, the switch hypothesis
    (today's C1 is yesterday's C2) should give a much smaller absolute move than the no-switch one.
    Also test the same on the business day before/after (should be the other way round)."""
    e = energy_rolled(sym)
    df = deglitch(C.eia_curve(sym)).reindex(e.index)
    c1, c2 = df["C1"], df["C2"]
    sw_h = np.log(c1 / c2.shift(1)).abs()
    no_h = np.log(c1 / c1.shift(1)).abs()
    spread = np.log(c2 / c1).abs().shift(1)
    idx = np.where(e["switch"].values)[0]
    out = {}
    for lag, name in [(0, "rule_day"), (-1, "day_before"), (1, "day_after")]:
        j = idx + lag
        j = j[(j > 0) & (j < len(e))]
        m = spread.iloc[j] > 0.02
        jj = j[m.values]
        if len(jj) == 0:
            continue
        better = (sw_h.iloc[jj].values < no_h.iloc[jj].values).mean()
        out[name] = {"n_large_spread_days": int(len(jj)), "share_switch_hypothesis_better": round(float(better), 3)}
    return out


def nymex_ltd(sym: str, delivery: pd.Period, hol) -> pd.Timestamp:
    """Last trading day of a NYMEX energy contract for a delivery month (approximate holiday calendar)."""
    bd = pd.offsets.CustomBusinessDay(holidays=hol)
    prev = (delivery - 1)
    if sym == "CL":
        d25 = pd.Timestamp(prev.year, prev.month, 25)
        if not bd.is_on_offset(d25):
            d25 = d25 - bd  # business day preceding the 25th
        return d25 - 3 * bd
    if sym == "NG":
        # empirically (roll-day continuity test) the switch was 6 business days before the delivery
        # month until end-1995, 3 business days afterwards
        first = pd.Timestamp(delivery.year, delivery.month, 1)
        return first - (6 if first < pd.Timestamp("1996-01-01") else 3) * bd
    # HO, RB: last business day of the month preceding delivery
    first = pd.Timestamp(delivery.year, delivery.month, 1)
    return first - 1 * bd


def energy_rolled(sym: str) -> pd.DataFrame:
    """Daily return of holding the *second* nearby contract, rolling when contract 1 expires
    (at that point the held contract becomes 'contract 1'). Also returns the annualised
    front slope ln(C1/C2)*12 (positive = backwardation) as a carry signal."""
    from pandas.tseries.holiday import USFederalHolidayCalendar
    df = deglitch(C.eia_curve(sym)).dropna(subset=["C1", "C2"])
    hol = USFederalHolidayCalendar().holidays("1980-01-01", "2026-12-31")
    # add Good Fridays (NYMEX closed) - approximate via Easter computation
    from dateutil.easter import easter
    gf = [pd.Timestamp(easter(y)) - pd.Timedelta(days=2) for y in range(1980, 2027)]
    hol = hol.union(pd.DatetimeIndex(gf))
    idx = df.index
    # expiry dates for each delivery month
    per = pd.period_range(idx[0].to_period("M") - 1, idx[-1].to_period("M") + 3, freq="M")
    ltds = pd.DatetimeIndex(sorted({nymex_ltd(sym, p, hol) for p in per}))
    # switch day = first trading day strictly after an LTD
    pos = np.searchsorted(idx.values, ltds.values, side="right")
    sw = set(int(p) for p in pos if 0 < p < len(idx))
    c1, c2 = df["C1"].values, df["C2"].values
    r = np.full(len(idx), np.nan)
    for t in range(1, len(idx)):
        if t in sw:
            r[t] = c1[t] / c2[t - 1] - 1  # yesterday's C2 is today's C1
        else:
            r[t] = c2[t] / c2[t - 1] - 1
    out = pd.DataFrame({"ret": r, "slope_ann": np.log(df["C1"] / df["C2"]) * 12,
                        "slope14_ann": np.log(df["C1"] / df["C4"]) * 4}, index=idx)
    out["switch"] = False
    out.iloc[sorted(sw), out.columns.get_loc("switch")] = True
    return out


def energy_check(sym: str) -> pd.DataFrame:
    """Validation: monthly return from daily rolled series vs clean monthly (C2 at first day -> C1 next first day)."""
    e = energy_rolled(sym)
    df = C.eia_curve(sym).dropna(subset=["C1", "C2"])
    first = df.groupby(df.index.to_period("M")).head(1)
    clean = (first["C1"].shift(-1) / first["C2"] - 1).dropna()
    clean.index = clean.index.to_period("M")
    daily = (1 + e["ret"]).groupby(e.index.to_period("M")).prod() - 1
    # daily compounding from first day of month (exclusive) to first day of next month (inclusive)
    fd = first.index
    acc = []
    for a, b in zip(fd[:-1], fd[1:]):
        seg = e["ret"].loc[a:b].iloc[1:]
        acc.append((a.to_period("M"), float((1 + seg).prod() - 1)))
    acc = pd.Series(dict(acc))
    comp = pd.DataFrame({"clean": clean, "daily_chain": acc}).dropna()
    comp["diff"] = comp["daily_chain"] - comp["clean"]
    return comp


def commodity_excess() -> pd.DataFrame:
    rf = C.fred("DTB3") / 100
    out = {}
    for sym in ["CL", "HO", "NG", "RB"]:
        e = energy_rolled(sym)
        days = e.index.to_series().diff().dt.days.fillna(1)
        # futures return is already an excess return (no cash needed)
        out[sym] = e["ret"]
    # gold: stitched COMEX front month; roll jumps (~carry) removed by subtracting rf accrual
    g = C.yf_close("GC=F", adjusted=False)["GC=F"]
    gr = g.pct_change(fill_method=None)
    rfa = rf.reindex(gr.index).ffill() / 252
    out["GOLD"] = gr - rfa
    return pd.DataFrame(out)


def long_universe() -> tuple[pd.DataFrame, dict]:
    parts = [equity_excess(), bond_excess(), fx_excess(), commodity_excess()]
    cls = {}
    for c in parts[0].columns:
        cls[c] = "EQ"
    for c in parts[1].columns:
        cls[c] = "BD"
    for c in parts[2].columns:
        cls[c] = "FX"
    for c in parts[3].columns:
        cls[c] = "CM"
    idx = _bday_index("1962-01-01")
    R = pd.concat(parts, axis=1)
    R = R[~R.index.duplicated()]
    R = R.reindex(idx)
    # after inception, missing days (holidays) = 0 return; before inception NaN
    for c in R.columns:
        first = R[c].first_valid_index()
        last = R[c].last_valid_index()
        R.loc[first:last, c] = R.loc[first:last, c].fillna(0.0)
    R = R.clip(-0.5, 0.5)
    return R, cls


def etf_universe(start="2000-01-01") -> tuple[pd.DataFrame, dict]:
    px = C.yf_close(list(ETF_UNIVERSE.keys()), adjusted=True)
    r = px.pct_change(fill_method=None)
    rf = C.rf_on(r.index, "trading")
    R = r.sub(rf, axis=0)
    R = R.loc[start:]
    cls = {k: v[0] for k, v in ETF_UNIVERSE.items()}
    return R, cls


if __name__ == "__main__":
    for s in ["CL", "HO", "NG", "RB"]:
        print(s, roll_day_validation(s))
    R, cls = long_universe()
    print(R.describe().T[["count", "mean", "std"]].assign(ann_vol=lambda d: d["std"] * np.sqrt(252)))
    for c in R.columns:
        print(c, R[c].first_valid_index().date(), R[c].last_valid_index().date())
