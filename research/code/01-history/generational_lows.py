"""Crisis buying: returns from buying the US market at generational lows, what ex-ante
rules would have captured, and what happened to dip-buyers who were early
(1929-32 US, 1990 Japan, 2000 Nasdaq).

Outputs (in ./output):
  generational_lows.csv        forward total returns from each major low
  exante_rules.csv             forward returns of simple, ex-ante observable buy rules
  early_dip_buyers.csv         further losses / time to breakeven after buying at -20%..-80%
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DIR, drawdown, fred, shiller, yf_daily


def monthly_tr() -> pd.DataFrame:
    """Monthly S&P composite (Shiller) spliced with ^SP500TR (monthly average of daily closes)
    from 1988-01; CPI spliced with FRED CPIAUCSL after Shiller's file ends."""
    sh = shiller()
    sptr = yf_daily("^SP500TR")["Close"].resample("MS").mean()
    tr = sh["TR"].copy()
    splice = pd.Timestamp("1988-01-01")
    k = tr.loc[splice] / sptr.loc[splice]
    tr = pd.concat([tr.loc[:splice - pd.Timedelta(days=1)], sptr.loc[splice:] * k])
    cpi_sh = sh["CPI"]
    cpi_f = fred("CPIAUCSL")
    cpi_f.index = cpi_f.index.to_period("M").to_timestamp()
    last = cpi_sh.index[-1]
    k2 = cpi_sh.loc[last] / cpi_f.loc[last]
    cpi = pd.concat([cpi_sh, cpi_f.loc[last + pd.offsets.MonthBegin(1):] * k2])
    # price index (monthly avg): Shiller P, spliced with ^GSPC monthly avg
    gspc = yf_daily("^GSPC")["Close"].resample("MS").mean()
    p = sh["P"].copy()
    k3 = p.loc[last] / gspc.loc[last]
    p = pd.concat([p, gspc.loc[last + pd.offsets.MonthBegin(1):] * k3])
    df = pd.DataFrame({"TR": tr, "CPI": cpi, "P": p}).dropna()
    df["TR_real"] = df["TR"] / df["CPI"]
    df["P_real"] = df["P"] / df["CPI"]
    df["CAPE"] = sh["CAPE"].reindex(df.index)
    df["DD"] = drawdown(df["P"])
    return df


LOWS = {  # label: (month of monthly-average low, daily closing low date)
    "1932 Depression low": ("1932-06", "1932-06-01"),
    "1942 WWII low": ("1942-04", "1942-04-28"),
    "1949 postwar low": ("1949-06", "1949-06-13"),
    "1974 stagflation low": ("1974-12", "1974-10-03"),
    "1982 Volcker low": ("1982-07", "1982-08-12"),
    "1987 crash low": ("1987-12", "1987-12-04"),
    "2002 dot-com low": ("2002-10", "2002-10-09"),
    "2009 GFC low": ("2009-03", "2009-03-09"),
    "2020 Covid low": ("2020-03", "2020-03-23"),
    "2022 inflation low": ("2022-10", "2022-10-12"),
    "2025 tariff low": ("2025-04", "2025-04-08"),
}


def forward(df: pd.DataFrame, start: pd.Timestamp, years: int, col: str) -> float:
    end = start + pd.DateOffset(years=years)
    if end > df.index[-1]:
        return np.nan
    return float(df[col].asof(end) / df[col].loc[start])


def generational_lows(df: pd.DataFrame) -> pd.DataFrame:
    gspc = yf_daily("^GSPC")["Close"]
    rows = []
    for label, (m, d) in LOWS.items():
        start = pd.Timestamp(m + "-01")
        dd_daily = float(gspc.loc[:d].iloc[-1] / gspc.loc[:d].max() - 1)
        row = dict(event=label, low_close_date=d, sp_close_at_low=round(float(gspc.loc[:d].iloc[-1]), 2),
                   price_drawdown_from_ATH=round(dd_daily, 3),
                   CAPE_at_low=round(float(df["CAPE"].get(start, np.nan)), 1) if not np.isnan(df["CAPE"].get(start, np.nan)) else np.nan)
        for y in (1, 3, 5, 10, 20):
            row[f"nomTR_{y}y_x"] = round(forward(df, start, y, "TR"), 2)
            row[f"realTR_{y}y_x"] = round(forward(df, start, y, "TR_real"), 2)
        yrs = (df.index[-1] - start).days / 365.25
        row["years_to_date"] = round(yrs, 1)
        row["nomTR_to_date_x"] = round(float(df["TR"].iloc[-1] / df["TR"].loc[start]), 1)
        row["realTR_to_date_x"] = round(float(df["TR_real"].iloc[-1] / df["TR_real"].loc[start]), 1)
        row["real_CAGR_to_date"] = round(row["realTR_to_date_x"] ** (1 / yrs) - 1, 4) if yrs > 0.5 else np.nan
        # price-only multiple from the daily closing low to the latest close
        row["price_only_to_date_x"] = round(float(gspc.iloc[-1] / gspc.loc[:d].iloc[-1]), 1)
        rows.append(row)
    return pd.DataFrame(rows)


def exante_rules(df: pd.DataFrame) -> pd.DataFrame:
    """Forward real total returns for simple rules that could be followed in real time.
    Each rule triggers at most once per bear market episode (re-armed after a new all-time high),
    except the 'all months' baseline."""
    d = df.loc["1881-01":].copy()
    for y in (1, 5, 10):
        d[f"f{y}"] = [forward(df, t, y, "TR_real") for t in d.index]
    res = []

    def summarise(name, dates):
        sub = d.loc[dates]
        for y in (1, 5, 10):
            v = sub[f"f{y}"].dropna()
            res.append(dict(rule=name, horizon_years=y, n_signals=len(v),
                            mean_real_mult=round(v.mean(), 2) if len(v) else np.nan,
                            median_real_mult=round(v.median(), 2) if len(v) else np.nan,
                            worst_real_mult=round(v.min(), 2) if len(v) else np.nan,
                            pct_losing=round((v < 1).mean(), 2) if len(v) else np.nan,
                            median_real_CAGR=round(v.median() ** (1 / y) - 1, 4) if len(v) else np.nan))

    summarise("baseline: every month since 1881", d.index)

    def episodic(cond: pd.Series) -> list:
        out, armed = [], True
        for t in d.index:
            if d.loc[t, "DD"] == 0:
                armed = True
            if armed and cond.loc[t]:
                out.append(t)
                armed = False
        return out

    for thr in (0.2, 0.3, 0.4, 0.5):
        summarise(f"first month S&P drawdown <= -{int(thr*100)}% (once per bear market)", episodic(d["DD"] <= -thr))
    # CAPE rules (episodic: re-armed when CAPE goes back above 15)
    for thr in (10, 12):
        out, armed = [], True
        for t in d.index:
            c = d.loc[t, "CAPE"]
            if np.isnan(c):
                continue
            if c > 15:
                armed = True
            if armed and c < thr:
                out.append(t)
                armed = False
        summarise(f"first month CAPE < {thr} (re-armed above 15)", out)
    # the perfect-hindsight bottoms for comparison
    summarise("hindsight: exact monthly low of each bear (table above)",
              [pd.Timestamp(m + "-01") for m, _ in LOWS.values()])
    return pd.DataFrame(res)


def early_dip_buyers() -> pd.DataFrame:
    """Buy the first close at which the index is X% below its all-time high, in three
    famous busts; report the further decline and calendar time to get back to break-even
    on price (dividends ignored - noted in the report)."""
    cases = {
        "US S&P 500 (peak Sep-1929)": ("^GSPC", "1929-09-01", "1929-10-01"),
        "Japan Nikkei 225 (peak Dec-1989)": ("^N225", "1989-12-01", "1990-01-10"),
        "Nasdaq Composite (peak Mar-2000)": ("^IXIC", "2000-03-01", "2000-03-15"),
    }
    rows = []
    for name, (tk, peak_from, peak_to) in cases.items():
        s = yf_daily(tk)["Close"]
        s = s[s > 0]
        pk_date = s.loc[peak_from:peak_to].idxmax()
        pk = float(s.loc[pk_date])
        after = s.loc[pk_date:]
        for x in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
            hit = after[after <= pk * (1 - x)]
            if hit.empty:
                continue
            t0 = hit.index[0]
            px = float(hit.iloc[0])
            post = s.loc[t0:]
            # trough of the bear market that follows the purchase (not later, unrelated busts):
            # search until the market first regains the purchase price *after* its bear-market low
            # (for the 1929 and 1990 cases the lows are 1932-06 and 2003-04/2009-03 respectively)
            bear_end = {"^GSPC": "1932-12-31", "^N225": "2009-12-31", "^IXIC": "2002-12-31"}[tk]
            window = post.loc[:bear_end]
            trough = float(window.min())
            trough_date = window.idxmin()
            # breakeven on price relative to the purchase price, measured after the trough
            be = s.loc[trough_date:]
            be = be[be >= px]
            be_date = be.index[0] if not be.empty else pd.NaT
            rows.append(dict(market=name, peak_date=pk_date.date(), buy_at_drawdown=f"-{int(x*100)}%",
                             buy_date=t0.date(), buy_level=round(px, 2),
                             further_decline_to_trough=round(trough / px - 1, 3), trough_date=trough_date.date(),
                             years_to_price_breakeven=round((be_date - t0).days / 365.25, 1) if pd.notna(be_date) else np.nan,
                             years_until_peak_regained=round(((s.loc[pk_date:][s.loc[pk_date:] >= pk].index[1:2].min()) - pk_date).days / 365.25, 1)
                             if len(s.loc[pk_date:][s.loc[pk_date:] >= pk]) > 1 else np.nan))
    return pd.DataFrame(rows)


def main():
    df = monthly_tr()
    g = generational_lows(df)
    g.to_csv(OUT_DIR / "generational_lows.csv", index=False)
    e = exante_rules(df)
    e.to_csv(OUT_DIR / "exante_rules.csv", index=False)
    b = early_dip_buyers()
    b.to_csv(OUT_DIR / "early_dip_buyers.csv", index=False)
    # 1929 with dividends and deflation (monthly Shiller data): when did a buyer at the
    # first month of -20/-40/-60% (monthly-average) drawdown get back to break-even?
    rows = []
    d29 = df.loc["1929-09":"1960-12"]
    for x in (0.2, 0.4, 0.6, 0.8):
        t0 = d29.index[(d29["DD"] <= -x)][0]
        for col in ("P", "TR", "TR_real"):
            base = d29.loc[t0, col]
            after_trough = d29.loc["1932-07":]
            be = after_trough.index[after_trough[col] >= base]
            rows.append(dict(buy_month=t0.date(), buy_at=f"-{int(x*100)}%", measure=col,
                             breakeven_month=be[0].date() if len(be) else None,
                             years=round((be[0] - t0).days / 365.25, 1) if len(be) else np.nan))
    # and for a buyer at the Sep-1929 peak month itself
    t0 = pd.Timestamp("1929-09-01")
    for col in ("P", "TR", "TR_real"):
        after_trough = df.loc["1932-07":]
        be = after_trough.index[after_trough[col] >= df.loc[t0, col]]
        rows.append(dict(buy_month=t0.date(), buy_at="peak", measure=col, breakeven_month=be[0].date(),
                         years=round((be[0] - t0).days / 365.25, 1)))
    b29 = pd.DataFrame(rows)
    b29.to_csv(OUT_DIR / "early_dip_buyers_1929_total_return.csv", index=False)
    print(b29.to_string(index=False))
    a = df.loc["1928-01-01":]
    yrs = (a.index[-1] - a.index[0]).days / 365.25
    print(f"S&P real TR CAGR 1928-{a.index[-1].date()}: {(a.TR_real.iloc[-1] / a.TR_real.iloc[0]) ** (1 / yrs) - 1:.4f}; "
          f"nominal {(a.TR.iloc[-1] / a.TR.iloc[0]) ** (1 / yrs) - 1:.4f}")
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    print(g.to_string(index=False))
    print()
    print(e.to_string(index=False))
    print()
    print(b.to_string(index=False))
    print("\nlast month in spliced series:", df.index[-1].date())


if __name__ == "__main__":
    main()
