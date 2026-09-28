"""Oil-shock unwinds: when a supply-disruption premium collapsed, how fast and how far did oil and oil-sensitive
assets move within 60 trading days, and how much of it was left for someone acting after the day-0 close?

Two anchor types (event_lists17.OIL_UNWINDS):
  'event' = a de-escalation/relief day knowable in real time (tradable),
  'peak'  = the ex-post price peak (look-ahead; descriptive only - how fast premia deflate).
Also: oil-shock onsets split into 'lasting physical disruption' vs 'fear / quickly restored' (momentum vs fade),
and 2026-specific re-escalation risk after de-escalations (maximum adverse excursion for a short).
Outputs: printed tables + SCRATCH/unwind_*.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from event_lists17 import OIL_SHOCKS, OIL_UNWINDS
from lib17 import SCRATCH, YIELD_LIKE, asset_panel, day0_index, event_table, fmt, summarize

pd.set_option("display.width", 260)
pd.set_option("display.max_rows", 400)
pd.set_option("display.max_columns", 40)
P = asset_panel()


def oil_proxy(d: pd.Timestamp) -> str:
    return "WTI"


def path_stats(s: pd.Series, date, same_ok: bool, horizon=60) -> dict:
    s = s.dropna()
    p0 = day0_index(s.index, date, same_ok)
    if p0 is None or p0 == 0 or p0 + 5 >= len(s):
        return {}
    pre, d0 = s.iloc[p0 - 1], s.iloc[p0]
    w = s.iloc[p0: p0 + horizon + 1]
    out = {"pre": pre, "d0_px": d0, "d0%": (d0 / pre - 1) * 100}
    for h in [1, 5, 20, 60]:
        if p0 + h < len(s):
            out[f"cum{h}%"] = (s.iloc[p0 + h] / pre - 1) * 100   # from pre-event close
            out[f"f{h}%"] = (s.iloc[p0 + h] / d0 - 1) * 100      # from day-0 close (tradable)
    # short-side excursions from the day-0 close
    for H in [20, 60]:
        ww = s.iloc[p0: p0 + H + 1]
        out[f"MAE_short_{H}%"] = (ww.max() / d0 - 1) * 100   # worst adverse for a short
        out[f"MFE_short_{H}%"] = (ww.min() / d0 - 1) * 100   # best favourable for a short
    tot = out.get("cum60%", np.nan)
    out["share_of_60d_move_by_d0"] = out["d0%"] / tot if tot and not np.isnan(tot) and abs(tot) > 1 else np.nan
    # days until -10% / -20% from pre-close
    for thr in [10, 20]:
        hit = np.where(w.values <= pre * (1 - thr / 100))[0]
        out[f"days_to_-{thr}%"] = int(hit[0]) if len(hit) else np.nan
    return out


def unwind_table():
    rows = []
    for lbl, date, same_ok, tags in OIL_UNWINDS:
        typ = "event" if "event" in tags else "peak"
        base = {"episode": lbl, "date": date, "type": typ, "approx": "approx" in tags}
        for a in ["WTI", "BRENT", "USO", "BNO"]:
            ps = path_stats(P[a], date, same_ok)
            for k, v in ps.items():
                if k in ("pre", "d0_px"):
                    continue
                base[f"{a}_{k}"] = v
        rows.append(base)
    t = pd.DataFrame(rows)
    t.to_csv(SCRATCH / "unwind_oil_paths.csv", index=False)
    cols = ["episode", "date", "type", "WTI_d0%", "WTI_cum5%", "WTI_cum20%", "WTI_cum60%", "WTI_f5%", "WTI_f20%",
            "WTI_f60%", "WTI_share_of_60d_move_by_d0", "WTI_days_to_-10%", "WTI_days_to_-20%", "WTI_MAE_short_20%",
            "WTI_MAE_short_60%", "WTI_MFE_short_60%"]
    print("\n=== Oil-premium unwinds: WTI spot (%). cum = from pre-event close; f = from day-0 close; MAE/MFE for a short from day-0 close")
    print(t[cols].round(1).to_string(index=False))
    cols2 = ["episode", "USO_d0%", "USO_f5%", "USO_f20%", "USO_f60%", "USO_MAE_short_20%", "BRENT_d0%", "BRENT_f20%", "BRENT_f60%", "BNO_f20%", "BNO_f60%"]
    print(t[[c for c in cols2 if c in t]].round(1).to_string(index=False))
    for typ in ["event", "peak"]:
        sub = t[t.type == typ]
        print(f"\n{typ} anchors (n={len(sub)}): WTI d0 mean {sub['WTI_d0%'].mean():.1f} | cum20 mean {sub['WTI_cum20%'].mean():.1f} med {sub['WTI_cum20%'].median():.1f} "
              f"| cum60 mean {sub['WTI_cum60%'].mean():.1f} med {sub['WTI_cum60%'].median():.1f} | tradable f20 mean {sub['WTI_f20%'].mean():.1f} med {sub['WTI_f20%'].median():.1f} "
              f"hit(<0) {100*(sub['WTI_f20%']<0).mean():.0f}% | f60 mean {sub['WTI_f60%'].mean():.1f} med {sub['WTI_f60%'].median():.1f} hit(<0) {100*(sub['WTI_f60%']<0).mean():.0f}% "
              f"| MAE_short_20 median {sub['WTI_MAE_short_20%'].median():.1f} max {sub['WTI_MAE_short_20%'].max():.1f}")
    return t


def oil_sensitive_assets():
    """Cross-asset moves after tradable 'event' anchors (from the day-0 close) and from the pre-close."""
    ev = [(l, d, s, t) for (l, d, s, t) in OIL_UNWINDS if "event" in t]
    rows = []
    per = {}
    for a in ["WTI", "USO", "BNO", "XLE", "XOI", "JETS", "LUV", "DAL", "UAL", "INDA", "EIDO", "SPX", "TLT", "UST10Y", "UST2Y", "DXY", "GOLD", "EEM"]:
        s = P[a]
        t = event_table(s, ev, is_yield=a in YIELD_LIKE)
        if len(t) < 3:
            continue
        per[a] = t
        sm = summarize(t, s, is_yield=a in YIELD_LIKE, label=f"unwind_event|{a}")
        rows.append(sm)
    out = pd.concat(rows)
    print("\n=== Oil-sensitive assets after tradable de-escalation 'event' anchors (from day-0 close; yields bp)")
    print(fmt(out[["set", "window", "n", "mean", "median", "sd", "hit%", "min", "max", "base_mean", "excess", "p_placebo"]]))
    out.to_csv(SCRATCH / "unwind_event_assets.csv", index=False)
    # per-episode matrix for the report
    m = per["WTI"][["event", "day0", "d0", "f20", "f60"]].rename(columns={"d0": "WTI_d0", "f20": "WTI_f20", "f60": "WTI_f60"})
    for a in ["XLE", "JETS", "LUV", "INDA", "EIDO", "SPX", "UST10Y", "UST2Y"]:
        if a in per:
            e = per[a].set_index("event")
            m[f"{a}_d0"] = m.event.map(e["d0"])
            m[f"{a}_f20"] = m.event.map(e["f20"])
    print(m.round(1).to_string(index=False))
    m.to_csv(SCRATCH / "unwind_event_matrix.csv", index=False)


def onset_split():
    """Oil after supply-shock onsets: lasting disruption vs fear/quickly-restored."""
    lasting = {"Iraq invades Kuwait", "Libya civil war shut-ins", "Russia invades Ukraine", "US/EU discuss Russian oil ban",
               "US/Israel-Iran war begins"}
    rows = []
    for lbl, date, same_ok, tags in OIL_SHOCKS:
        ps = path_stats(P["WTI"], date, same_ok)
        rows.append({"event": lbl, "date": date, "class": "lasting" if lbl in lasting else "fear/restored",
                     **{k: ps.get(k) for k in ["d0%", "f5%", "f20%", "f60%", "MAE_short_20%", "MFE_short_20%"]}})
    t = pd.DataFrame(rows)
    print("\n=== Oil (WTI spot) after supply-shock onsets, by class (f = from day-0 close)")
    print(t.round(1).to_string(index=False))
    print(t.groupby("class")[["d0%", "f5%", "f20%", "f60%"]].agg(["mean", "median", "count"]).round(1).to_string())
    t.to_csv(SCRATCH / "unwind_onset_split.csv", index=False)


def big_oil_days_in_war_regimes(thr=5.0):
    """Headline-day momentum vs reversal: WTI daily moves >= thr% (abs) in war regimes (1990-91, 2022, 2026) vs all
    other years since 1986; forward 5/20-day WTI from that close. Declustered (5 trading days)."""
    w = P["WTI"]
    r = w.pct_change() * 100
    regimes = [("1990-08-01", "1991-03-31"), ("2022-02-20", "2022-12-31"), ("2026-02-27", "2026-09-30")]
    inreg = pd.Series(False, index=w.index)
    for a, b in regimes:
        inreg |= (w.index >= a) & (w.index <= b)
    rows = []
    last = None
    for i in np.where(r.abs().values >= thr)[0]:
        d = w.index[i]
        if last is not None and i - last <= 5:
            continue
        last = i
        f5 = (w.iloc[i + 5] / w.iloc[i] - 1) * 100 if i + 5 < len(w) else np.nan
        f20 = (w.iloc[i + 20] / w.iloc[i] - 1) * 100 if i + 20 < len(w) else np.nan
        rows.append({"date": d.date(), "move": r.iloc[i], "war_regime": bool(inreg.iloc[i]), "f5": f5, "f20": f20})
    t = pd.DataFrame(rows)
    t["sign"] = np.sign(t.move)
    t["f5_signed"] = t.f5 * t.sign   # >0 = continuation, <0 = reversal
    t["f20_signed"] = t.f20 * t.sign
    print(f"\n=== WTI days with |move| >= {thr}% (declustered 5d): continuation (+) vs reversal (-) of the headline move")
    print(t.groupby(["war_regime", "sign"])[["f5_signed", "f20_signed"]].agg(["mean", "median", "count"]).round(2).to_string())
    print("2026 war-regime days:\n", t[t.war_regime & (pd.to_datetime(t.date) >= "2026-01-01")].round(1).to_string(index=False))
    t.to_csv(SCRATCH / "unwind_big_oil_days.csv", index=False)


def main():
    unwind_table()
    oil_sensitive_assets()
    onset_split()
    big_oil_days_in_war_regimes(5.0)


if __name__ == "__main__":
    main()
