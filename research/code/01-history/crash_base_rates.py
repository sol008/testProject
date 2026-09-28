"""Base rates for the 'crash convexity' archetype (Tudor/Taleb 1987, Universa/Ackman 2020):
how often does the S&P 500 fall fast enough for cheap out-of-the-money protection to pay
50-100x, and how long do you wait (and pay premium) between such events?

Outputs (./output): fast_crashes.csv, fast_crash_summary.csv, vix_spikes.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DIR, yf_daily


def fast_crashes(px: pd.Series, drop: float, window: int) -> pd.DataFrame:
    """Non-overlapping episodes in which the close fell by >= drop from the highest close of
    the preceding `window` trading days. Episode start = that prior high; a new episode can
    only begin after the index has recovered to within drop/2 of its prior high (or 250 days)."""
    vals = px.values
    idx = px.index
    out = []
    i = window
    n = len(vals)
    last_end = -1
    while i < n:
        lo = max(0, i - window)
        j_hi = lo + int(np.argmax(vals[lo:i + 1]))
        hi = vals[j_hi]
        if vals[i] <= hi * (1 - drop) and j_hi > last_end:
            # extend to local trough within next `window` days
            k_end = min(n, i + window)
            k_tr = i + int(np.argmin(vals[i:k_end]))
            out.append(dict(start=idx[j_hi].date(), trigger=idx[i].date(), trough=idx[k_tr].date(),
                            peak_close=round(float(hi), 2), trough_close=round(float(vals[k_tr]), 2),
                            decline=round(float(vals[k_tr] / hi - 1), 3),
                            trading_days_peak_to_trigger=i - j_hi))
            last_end = k_tr
            i = k_tr + 1
            continue
        i += 1
    return pd.DataFrame(out)


def main():
    px = yf_daily("^GSPC")["Close"].loc["1928-01-01":]
    years = (px.index[-1] - px.index[0]).days / 365.25
    summ = []
    allev = []
    for drop, window, label in [(0.10, 10, ">=10% within 2 weeks"), (0.15, 21, ">=15% within 1 month"),
                                (0.20, 21, ">=20% within 1 month"), (0.20, 63, ">=20% within 3 months"),
                                (0.30, 63, ">=30% within 3 months")]:
        ev = fast_crashes(px, drop, window)
        ev["definition"] = label
        allev.append(ev)
        post45 = ev[pd.to_datetime(ev["start"]) >= "1945-01-01"]
        yrs45 = (px.index[-1] - pd.Timestamp("1945-01-01")).days / 365.25
        gaps = pd.to_datetime(ev["start"]).diff().dt.days.dropna() / 365.25
        summ.append(dict(definition=label, n_events_since_1928=len(ev),
                         per_decade_since_1928=round(len(ev) / years * 10, 2),
                         n_events_since_1945=len(post45), per_decade_since_1945=round(len(post45) / yrs45 * 10, 2),
                         median_gap_years=round(float(gaps.median()), 1) if len(gaps) else np.nan,
                         max_gap_years=round(float(gaps.max()), 1) if len(gaps) else np.nan,
                         events=", ".join(str(pd.Timestamp(s).year) for s in ev["start"])))
    ev_all = pd.concat(allev)
    ev_all.to_csv(OUT_DIR / "fast_crashes.csv", index=False)
    sm = pd.DataFrame(summ)
    sm.to_csv(OUT_DIR / "fast_crash_summary.csv", index=False)

    vix = yf_daily("^VIX")["Close"]
    vrows = []
    for lvl in (30, 40, 50, 60, 80):
        above = vix >= lvl
        starts = above & ~above.shift(1, fill_value=False)
        # merge episodes separated by < 60 trading days
        dates = list(vix.index[starts])
        merged = []
        for d in dates:
            if not merged or (vix.index.get_loc(d) - vix.index.get_loc(merged[-1])) > 60:
                merged.append(d)
        vrows.append(dict(vix_close_at_least=lvl, episodes_since_1990=len(merged),
                          pct_of_days=round(float(above.mean()), 4),
                          episode_years=", ".join(str(d.year) for d in merged)))
    vr = pd.DataFrame(vrows)
    vr.to_csv(OUT_DIR / "vix_spikes.csv", index=False)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_colwidth", 200)
    print(sm.to_string(index=False))
    print()
    print(vr.to_string(index=False))
    print()
    print(ev_all[ev_all.definition == ">=20% within 3 months"].to_string(index=False))


if __name__ == "__main__":
    main()
