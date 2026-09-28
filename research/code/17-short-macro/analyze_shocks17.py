"""Unscheduled shocks: geopolitical onsets/escalations, de-escalations (ceasefires), oil supply shocks, crashes.

For each event set and asset: day-0 reaction and forward 1/5/20/60 trading-day moves from the day-0 close, versus
(a) the unconditional same-length return on all days within +/-3y and (b) an era-matched random-date placebo
(5,000 draws) -> two-sided p-value. Yields are in bp. Aggregates are declustered (events within 30 calendar days:
keep the first) so overlapping windows do not double count; per-event tables show everything.

Outputs: printed tables + SCRATCH/shock_*.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from event_lists17 import CRASHES, DEESC, GEO_ONSETS, OIL_SHOCKS
from lib17 import SCRATCH, YIELD_LIKE, asset_panel, declutter_dates, event_table, fmt, summarize

pd.set_option("display.width", 250)
pd.set_option("display.max_rows", 500)
pd.set_option("display.max_columns", 40)

P = asset_panel()
ASSETS_MAIN = ["SPX", "UST10Y", "UST2Y", "GOLD", "WTI", "DXY", "TLT", "USO", "UUP", "BTC", "XOI", "LUV"]


def declustered(events, gap=30):
    keep = set(pd.Timestamp(d) for d in declutter_dates([e[1] for e in events], gap))
    return [e for e in events if pd.Timestamp(e[1]) in keep]


def run_set(name: str, events: list, assets=ASSETS_MAIN, gap=30, show_events=True) -> pd.DataFrame:
    ev = declustered(events, gap)
    rows = []
    per_event = {}
    for a in assets:
        s = P[a]
        is_y = a in YIELD_LIKE
        t_all = event_table(s, events, is_yield=is_y)
        per_event[a] = t_all
        t = event_table(s, ev, is_yield=is_y)
        if len(t) < 3:
            continue
        sm = summarize(t, s, is_yield=is_y, label=f"{name}|{a}")
        rows.append(sm)
    out = pd.concat(rows) if rows else pd.DataFrame()
    print(f"\n=== {name}: {len(events)} events ({len(ev)} after 30-day declustering). Units: % (yields/VIX: bp/pts)")
    if len(out):
        print(fmt(out[["set", "window", "n", "mean", "median", "sd", "hit%", "min", "max", "base_mean",
                       "base_hit%", "excess", "p_placebo"]]))
    if show_events:
        spx = per_event.get("SPX")
        if spx is not None and len(spx):
            cols = ["event", "day0", "d0", "f5", "f20", "f60", "mdd60_from_pre", "days_to_low"]
            m = spx[cols].copy()
            for a, c in [("WTI", "wti"), ("GOLD", "gold"), ("UST10Y", "10y_bp"), ("DXY", "dxy")]:
                e = per_event.get(a)
                if e is not None and len(e):
                    e2 = e.set_index("event")
                    m[f"{c}_d0"] = m["event"].map(e2["d0"])
                    m[f"{c}_f20"] = m["event"].map(e2["f20"])
                    m[f"{c}_f60"] = m["event"].map(e2["f60"])
            print(m.round(1).to_string(index=False))
            m.to_csv(SCRATCH / f"shock_events_{name}.csv", index=False)
    out.to_csv(SCRATCH / f"shock_summary_{name}.csv", index=False)
    return out


def subset(events, tag=None, exclude_tag=None):
    return [e for e in events if (tag is None or tag in e[3]) and (exclude_tag is None or exclude_tag not in e[3])]


def crash_systematic(threshold=-4.0, gap=20):
    """All S&P closes <= threshold% (1928+), first of each cluster (no other signal in `gap` trading days)."""
    s = P["SPX"]
    r = s.pct_change() * 100
    ma200 = s.rolling(200).mean()
    idx = np.where(r.values <= threshold)[0]
    keep, last = [], -10 ** 9
    for i in idx:
        if i - last > gap:
            keep.append(i)
        last = i
    rows = []
    for i in keep:
        d = s.index[i]
        rows.append((f"{d.date()} {r.iloc[i]:.1f}%", d, True, {"above200" if s.iloc[i - 1] > ma200.iloc[i - 1] else "below200"}))
    return rows


def main():
    res = []
    geo = GEO_ONSETS
    res.append(run_set("geo_all", geo))
    res.append(run_set("geo_war", subset(geo, "war"), show_events=False))
    res.append(run_set("geo_me", subset(geo, "me"), show_events=False))
    res.append(run_set("geo_post1985", [e for e in geo if e[1] >= "1985"], show_events=False))
    res.append(run_set("deesc_all", DEESC))
    res.append(run_set("deesc_oil_era", [e for e in DEESC if e[1] >= "1986"], show_events=False))
    res.append(run_set("oil_shocks", OIL_SHOCKS,
                       assets=["WTI", "BRENT", "USO", "BNO", "SPX", "GOLD", "UST10Y", "UST2Y", "XLE", "JETS", "LUV", "INDA", "EIDO", "TLT", "DXY"]))
    res.append(run_set("crash_named", CRASHES, assets=["SPX", "TLT", "GOLD", "UST10Y", "UST2Y", "DXY", "WTI", "BTC", "VIX"]))
    cs = crash_systematic(-4.0)
    print(f"\nSystematic S&P <= -4% days (declustered 20d): n={len(cs)}")
    res.append(run_set("crash_sys4_all", cs, assets=["SPX", "UST10Y", "GOLD", "TLT"], gap=0, show_events=False))
    res.append(run_set("crash_sys4_above200", [e for e in cs if "above200" in e[3]], assets=["SPX", "UST10Y", "TLT", "GOLD"], gap=0, show_events=False))
    res.append(run_set("crash_sys4_below200", [e for e in cs if "below200" in e[3]], assets=["SPX", "UST10Y", "TLT", "GOLD"], gap=0, show_events=False))
    res.append(run_set("crash_sys4_post1990", [e for e in cs if e[1] >= pd.Timestamp("1990-01-01")], assets=["SPX", "UST10Y", "TLT", "GOLD", "VIX"], gap=0, show_events=False))
    allres = pd.concat([r for r in res if len(r)])
    allres.to_csv(SCRATCH / "shock_all_summaries.csv", index=False)


if __name__ == "__main__":
    main()
