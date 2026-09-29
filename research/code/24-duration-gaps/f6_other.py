"""Family 6: other documented 3-4-month mechanisms that the earlier tracks did not test.

(a) Turn-of-year small-cap window (tax-loss selling; Keim 1983, Reinganum 1983; Haug & Hirschey 2006).
    Long small caps from a fixed autumn/winter entry (first session on or after 1 Nov, 1 Dec or 15 Dec) to the
    last session within 60 / 90 / 120 calendar days (the three caps).  Series: Ken French bottom size quintile and
    decile (value-weighted, daily, 1926-2026; next-close fills) and IWM / IWC (next-open fills, 2000/2005-2026).
    Edge = excess over bills minus the era-matched random entry of the same length (track 22 placebo), so the
    small-cap drift is removed.  Eras: 1927-1982 (before publication), 1983-2007, 2008-2026.  The small-minus-big
    spread (bottom minus top quintile) is reported as context (not executable long-only).  Calendar trades are on
    the design's never-list; this checks whether a longer cap would change that.
(b) VIX-term-structure-filtered volatility carry.  CBOE VPD (short front-month VIX futures, 2007-) and SVXY
    (-1x short-term VIX futures until Feb 2018, -0.5x after).  Enter on the first close with VIX/VIX3M below 0.90
    (variants 0.85 / 0.95; with or without VIX < 20), hold 21 / 42 / 63 / 84 sessions.  Edge vs an era-matched random
    entry; worst trade; design 2008-2016, test 2017-2026 (no pre-2008 VIX-futures history).  Short-VIX products
    are on the never-list (SVXY's worst day in our data is -83%, in February 2018, when XIV was terminated); reported
    so the ruin tail is on record.
(c) Dividend / ex-date effects: literature only (Hartzmark & Solomon 2013: a one-month effect; dividend capture is
    already on the never-list and track 16 tested special dividends), so nothing here depends on the cap.
Outputs: results/f6_*.csv
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import common24 as C  # noqa: E402
import optmodel as om  # noqa: E402  (CBOE index loader, track 14)

ENTRIES = {"Nov1": (11, 1), "Dec1": (12, 1), "Dec15": (12, 15)}
CAPS = (60, 90, 120)


def kf_size_frames() -> dict:
    t = C.kf_table("Portfolios_Formed_on_ME_daily", which=0, daily=True)
    out = {}
    for col, name in (("Lo 20", "KF small quintile"), ("Lo 10", "KF small decile"), ("Hi 20", "KF large quintile")):
        r = t[col].dropna()
        out[name] = C.C22.synthetic_frame((1 + r).cumprod(), name)
    return out


def calendar_signal(idx: pd.DatetimeIndex, month: int, day: int) -> pd.Series:
    """True on the session BEFORE the entry session (the engine enters at the next open/close)."""
    sig = pd.Series(False, index=idx)
    for y in range(idx[0].year, idx[-1].year + 1):
        d = pd.Timestamp(year=y, month=month, day=day)
        k = idx.searchsorted(d)                   # first session on/after the entry date
        if 0 < k < len(idx):
            sig.iloc[k - 1] = True
    return sig


def hold_for_cap(idx: pd.DatetimeIndex, sig: pd.Series, cap_days: int) -> int:
    """Sessions that fit the calendar cap for these entries (the minimum across years, so every trade fits)."""
    hs = []
    for k in np.flatnonzero(sig.values):
        e = k + 1
        if e >= len(idx):
            continue
        last = idx.searchsorted(idx[e] + pd.Timedelta(days=cap_days), side="right") - 1
        hs.append(last - e + 1)
    return int(np.min(hs)) if hs else 0


def turn_of_year() -> pd.DataFrame:
    rows = []
    frames = kf_size_frames()
    frames["IWM"] = C.yf_frame("IWM")
    frames["IWC"] = C.yf_frame("IWC")
    eras = {"KF": [("1927-1982", "1927-01-01", "1982-12-31"), ("1983-2007", "1983-01-01", "2007-12-31"),
                   ("2008-2026", "2008-01-01", "2026-12-31")],
            "ETF": [("2000-2007", "2000-01-01", "2007-12-31"), ("2008-2026", "2008-01-01", "2026-12-31")]}
    for name, df in frames.items():
        mode = "close" if name.startswith("KF") else "open"
        cost = 0.0 if name.startswith("KF") else 2.0
        for ename, (mo, dy) in ENTRIES.items():
            sig = calendar_signal(df.index, mo, dy)
            for cap in CAPS:
                H = hold_for_cap(df.index, sig, cap) - (1 if mode == "close" else 0)
                for era, a, b in eras["KF" if name.startswith("KF") else "ETF"]:
                    tr, st = C.evaluate(df, sig, H, mode, a, b, cost_bps=cost, B=2000)
                    st.update(series=name, entry=ename, cap=cap, era=era)
                    rows.append(st)
                    if name != "KF large quintile":
                        C.Ledger.add("f6_other", f"TOY {name} {ename} cap{cap}", era, st.get("n", 0), st.get("t_edge", np.nan),
                                     edge=st.get("edge"))
    res = pd.DataFrame(rows)
    # small-minus-big (context): bottom quintile minus top quintile over the same windows
    smb = []
    s, l = frames["KF small quintile"]["aC"], frames["KF large quintile"]["aC"]
    for ename, (mo, dy) in ENTRIES.items():
        sig = calendar_signal(s.index, mo, dy)
        for cap in CAPS:
            H = hold_for_cap(s.index, sig, cap) - 1
            for era, a, b in eras["KF"]:
                v = []
                for k in np.flatnonzero(sig.values):
                    if not (pd.Timestamp(a) <= s.index[k] <= pd.Timestamp(b)) or k + 1 + H >= len(s):
                        continue
                    v.append(s.iloc[k + 1 + H] / s.iloc[k + 1] - l.iloc[k + 1 + H] / l.iloc[k + 1])
                v = np.array(v)
                smb.append(dict(entry=ename, cap=cap, era=era, n=len(v), smb_mean=v.mean(),
                                t=v.mean() / v.std(ddof=1) * np.sqrt(len(v)), share_pos=(v > 0).mean()))
    return res, pd.DataFrame(smb)


def vol_carry() -> pd.DataFrame:
    rows = []
    vix = om.cboe("VIX")
    v3 = om.cboe("VIX3M")
    ratio = (vix / v3).dropna()
    vpd = om.cboe("VPD")
    frames = {"VPD": C.C22.synthetic_frame(vpd, "VPD"), "SVXY": C.yf_frame("SVXY")}
    variants = {"ts<0.90": (0.90, None), "ts<0.85": (0.85, None), "ts<0.95": (0.95, None), "ts<0.90 & VIX<20": (0.90, 20.0)}
    for name, df in frames.items():
        mode = "close" if name == "VPD" else "open"
        cost = 0.0 if name == "VPD" else 5.0
        r = ratio.reindex(df.index).ffill()
        vx = vix.reindex(df.index).ffill()
        for vname, (lvl, vcap) in variants.items():
            cond = r < lvl
            if vcap is not None:
                cond = cond & (vx < vcap)
            sig = C.first_cross(cond, quiet=20)
            for H in (21,) + C.HOLDS:
                for role, a, b in (("design", "2008-01-01", "2016-12-31"), ("test", "2017-01-01", "2026-12-31")):
                    tr, st = C.evaluate(df, sig, H, mode, a, b, cost_bps=cost, B=2000)
                    st.update(series=name, variant=vname, role=role)
                    rows.append(st)
                    C.Ledger.add("f6_other", f"volcarry {name} {vname} H{H}", role, st.get("n", 0), st.get("t_edge", np.nan),
                                 edge=st.get("edge"))
    res = pd.DataFrame(rows)
    # the ruin tail: worst 1-, 10- and 63-session losses of each vehicle
    tails = []
    for name, df in frames.items():
        c = df["aC"].dropna()
        tails.append(dict(series=name, worst1=float((c / c.shift(1) - 1).min()), worst10=C.C22.worst_window_loss(c, 10),
                          worst63=C.C22.worst_window_loss(c, 63), max_dd=float((c / c.cummax() - 1).min()),
                          start=c.index[0].date()))
    return res, pd.DataFrame(tails)


def main():
    toy, smb = turn_of_year()
    C.save(toy, "f6_turn_of_year")
    C.save(smb, "f6_turn_of_year_smb")
    cols = ["series", "entry", "cap", "era", "H", "n", "mean_ex", "base", "edge", "t_edge", "p_placebo", "worst"]
    with pd.option_context("display.width", 250, "display.max_rows", 400):
        print(toy[[c for c in cols if c in toy.columns]].round(4).to_string(index=False), flush=True)
        print(smb.round(4).to_string(index=False), flush=True)
    vc, tails = vol_carry()
    C.save(vc, "f6_vol_carry")
    C.save(tails, "f6_vol_carry_tails")
    cols = ["series", "variant", "role", "H", "n", "per_yr", "mean_ex", "base", "edge", "t_edge", "p_placebo", "worst", "mae_worst"]
    with pd.option_context("display.width", 250, "display.max_rows", 400):
        print(vc[[c for c in cols if c in vc.columns]].round(4).to_string(index=False), flush=True)
        print(tails.round(4).to_string(index=False))
    C.Ledger.save("f6_other")


if __name__ == "__main__":
    main()
