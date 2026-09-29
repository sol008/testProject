"""Q4: riding a mania with a trend entry and an exit ladder (archetype 7 of track 01, section 5).

For each recorded mania we take a window that starts before the run-up and ends after the bust, and
apply three mechanical rules, decided once a week (Friday closes, 40-week SMA) for daily series and
once a month (10-month SMA) for monthly series, all entered on the first close above the SMA:
  A  trend      : exit on the first close below the SMA; re-enter on the next close above it (so it
                  whipsaws); repeated until the window ends.
  B  ladder     : within each ride, sell 1/3 at +100% from that ride's entry and 1/3 at +200%; the
                  rest on the trend break; re-enter in full on the next close above the SMA.
  C  trail 25%  : exit when the close is 25% below its running peak since entry; re-enter on the
                  next close above the SMA.
Metrics: peak gain from the first entry, the gain each rule captured, the capture ratio, the giveback
from the peak, the number of round trips and the sum of the losing round trips (the whipsaw cost),
and buy-and-hold to the window's end. Costs: 0.1% per one-way trade (0.6% for bitcoin).

Outputs: q4_manias.csv, q4_trades.csv
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import data36 as D

OUT = D.RESULTS


def nikkei_usd() -> pd.Series:
    n = D.fred("NIKKEI225")
    fx = D.fred("DEXJPUS")
    fx = fx.reindex(n.index.union(fx.index)).ffill().reindex(n.index)
    return (n / fx).dropna()


def shanghai() -> pd.Series:
    return D.yf_close("000001.SS", adj=False)


def episodes() -> list[dict]:
    sh = D.shiller()["P"]
    return [
        dict(name="US stocks 1920s (S&P comp., monthly)", px=sh, start="1924-01-31", end="1935-12-31", freq="M"),
        dict(name="Gold 1970s (monthly London avg)", px=D.gold_monthly(), start="1970-01-31", end="1985-12-31", freq="M"),
        dict(name="Nikkei 225 1980s (JPY, daily)", px=D.fred("NIKKEI225"), start="1980-01-01", end="1995-12-31", freq="D"),
        dict(name="Nikkei 225 1980s (USD, daily)", px=nikkei_usd(), start="1980-01-01", end="1995-12-31", freq="D"),
        dict(name="Nasdaq Composite 1990s (daily)", px=D.fred("NASDAQCOM"), start="1990-01-01", end="2004-12-31", freq="D"),
        dict(name="Shanghai Composite 2005-08 (CNY, daily)", px=shanghai(), start="2005-01-01", end="2009-12-31", freq="D"),
        dict(name="Shanghai Composite 2014-16 (CNY, daily)", px=shanghai(), start="2013-06-01", end="2016-12-31", freq="D"),
        dict(name="Bitcoin 2011 cycle (daily)", px=D.btc_daily(), start="2010-08-01", end="2012-12-31", freq="D", btc=True),
        dict(name="Bitcoin 2013 cycle (daily)", px=D.btc_daily(), start="2012-06-01", end="2015-06-30", freq="D", btc=True),
        dict(name="Bitcoin 2016-18 cycle (daily)", px=D.btc_daily(), start="2015-06-01", end="2019-06-30", freq="D", btc=True),
        dict(name="Bitcoin 2020-22 cycle (daily)", px=D.btc_daily(), start="2019-06-01", end="2023-06-30", freq="D", btc=True),
        dict(name="Bitcoin 2023-26 (daily, to date)", px=D.btc_daily(), start="2022-12-01", end="2026-09-28", freq="D", btc=True),
        dict(name="Semiconductors 2023-26 (SOXX, daily, to date)", px=D.yf_close("SOXX"), start="2022-10-01", end="2026-09-28", freq="D"),
        dict(name="Nvidia 2023-26 (daily, to date)", px=D.yf_close("NVDA"), start="2022-10-01", end="2026-09-28", freq="D"),
    ]


def simulate(px: pd.Series, start: str, end: str, freq: str, cost: float) -> tuple[dict, list[dict]]:
    px = px.dropna()
    if freq == "D":  # one decision a week: Friday closes, 40-week SMA (about 200 trading days)
        px = px.resample("W-FRI").last().dropna()
    n_sma = 40 if freq == "D" else 10
    sma = px.rolling(n_sma).mean()
    w = px[(px.index >= start) & (px.index <= end)]
    s = sma.reindex(w.index)
    above = (w > s).values
    p = w.values
    dates = w.index
    # ---- first entry
    try:
        i0 = int(np.argmax(above & ~np.isnan(s.values)))
        if not above[i0]:
            raise ValueError
    except ValueError:
        return {"entry": None}, []
    entry = p[i0]
    peak_i = i0 + int(np.argmax(p[i0:]))
    peak = p[peak_i]
    trades = []

    # ---- trend with re-entry; optional trailing stop; optional profit-taking ladder inside each ride
    def run_trend(stop_pct: float | None, ladder: bool = False) -> tuple[float, list[dict], list]:
        pos, e_i, wealth, tr, run_peak, rem, real, lad = False, None, 1.0, [], None, 1.0, 0.0, []
        for i in range(i0, len(p)):
            if not pos:
                if above[i]:
                    pos, e_i, run_peak, rem, real = True, i, p[i], 1.0, 0.0
            else:
                run_peak = max(run_peak, p[i])
                g = p[i] / p[e_i]
                if ladder:
                    if rem > 0.66 and g >= 2.0:
                        real += (1 / 3) * g * (1 - cost); rem -= 1 / 3; lad.append(("1/3 at +100%", dates[i], g))
                    if rem > 0.33 and g >= 3.0:
                        real += (1 / 3) * g * (1 - cost); rem -= 1 / 3; lad.append(("1/3 at +200%", dates[i], g))
                stop_hit = stop_pct is not None and p[i] <= run_peak * (1 - stop_pct)
                if (stop_pct is None and not above[i]) or stop_hit or i == len(p) - 1:
                    real += rem * g * (1 - cost)
                    r = real * (1 - cost) - 1  # one entry cost, each sale already charged
                    wealth *= 1 + r
                    tr.append({"entry": dates[e_i], "exit": dates[i], "ret": r, "contains_peak": e_i <= peak_i <= i})
                    if ladder:
                        lad.append((f"rest {rem:.2f} on exit", dates[i], g))
                    pos = False
        return wealth - 1, tr, lad

    ra, ta, _ = run_trend(None)
    rc, tc, _ = run_trend(0.25)
    rb, tb, lad = run_trend(None, ladder=True)

    def summary(rr: float, tr: list[dict]) -> dict:
        main = [t for t in tr if t["contains_peak"]]
        mx = main[0] if main else None
        losers = [t["ret"] for t in tr if t["ret"] < 0]
        return {"ret": rr, "capture": rr / (peak / entry - 1) if peak > entry else np.nan,
                "main_ride_ret": mx["ret"] if mx else np.nan, "main_ride_exit": str(mx["exit"].date()) if mx else None,
                "giveback_from_peak": 1 - p[list(dates).index(mx["exit"])] / peak if mx else np.nan,
                "round_trips": len(tr), "losing_trips": len(losers), "whipsaw_cost": float(np.sum(losers)) if losers else 0.0}

    bh = p[-1] / entry - 1
    peak_gain = peak / entry - 1
    res = {"entry": str(dates[i0].date()), "entry_px": entry, "peak": str(dates[peak_i].date()), "peak_px": peak,
           "peak_gain": peak_gain, "bh_to_end": bh, "end_from_peak": p[-1] / peak - 1}
    for lab, rr, tr in (("A_trend", ra, ta), ("B_ladder", rb, tb), ("C_trail25", rc, tc)):
        for k2, v in summary(rr, tr).items():
            res[f"{lab}_{k2}"] = v
    res["B_ladder_steps"] = "; ".join(f"{a} {b.date()} x{c:.1f}" for a, b, c in lad[:8])
    for t in ta:
        trades.append({"rule": "A_trend", **{k2: (str(v.date()) if isinstance(v, pd.Timestamp) else v) for k2, v in t.items()}})
    return res, trades


def run() -> None:
    rows, trades = [], []
    for ep in episodes():
        cost = 0.006 if ep.get("btc") else 0.001
        res, tr = simulate(ep["px"], ep["start"], ep["end"], ep["freq"], cost)
        res = {"episode": ep["name"], "window": f"{ep['start'][:7]}..{ep['end'][:7]}", **res}
        rows.append(res)
        for t in tr:
            trades.append({"episode": ep["name"], **t})
    df = pd.DataFrame(rows).set_index("episode")
    df.to_csv(os.path.join(OUT, "q4_manias.csv"))
    pd.DataFrame(trades).to_csv(os.path.join(OUT, "q4_trades.csv"), index=False)
    cols = ["entry", "peak", "peak_gain", "bh_to_end", "A_trend_ret", "A_trend_capture", "A_trend_giveback_from_peak",
            "A_trend_round_trips", "A_trend_whipsaw_cost", "B_ladder_ret", "B_ladder_capture", "B_ladder_giveback_from_peak",
            "C_trail25_ret", "C_trail25_capture", "C_trail25_giveback_from_peak", "C_trail25_round_trips", "C_trail25_whipsaw_cost"]
    with pd.option_context("display.width", 320, "display.max_columns", 40):
        print(df[cols].round(3).to_string())
    done = df[~df.index.str.contains("to date")]
    for lab in ("A_trend", "B_ladder", "C_trail25"):
        print(f"\n{lab} across {len(done)} completed manias: median capture {done[lab + '_capture'].median():.2f} "
              f"(min {done[lab + '_capture'].min():.2f}, max {done[lab + '_capture'].max():.2f}); median giveback from peak "
              f"{done[lab + '_giveback_from_peak'].median():.2f}; median round trips {done[lab + '_round_trips'].median():.0f}; "
              f"median whipsaw cost {done[lab + '_whipsaw_cost'].median():.3f}; median return {done[lab + '_ret'].median():.2f} "
              f"vs buy-and-hold to window end {done['bh_to_end'].median():.2f}; peak gain {done['peak_gain'].median():.2f}")


if __name__ == "__main__":
    run()
