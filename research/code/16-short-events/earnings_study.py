"""Earnings-related setups with 1-60 day holds, 2011-2026: post-earnings drift (return- and
SUE-based), gap continuation vs fade, and the pre-earnings run-up.

Events: 8-K filings with Item 2.02 ("Results of Operations and Financial Condition") found by
EDGAR full-text search (edgar_collect.py earn).  D = EDGAR filing date.  Without acceptance
times, the market reaction happens on D (pre-market / intraday release) or D+1 (after-close
release filed before 17:30).  So:
  EAR (announcement return)  = close(D-1) -> close(D+1), minus benchmark
  entry for drift trades     = close(D+2)  (a manual trader acting the day after the reaction)
  drift windows              = close(D+2) -> close(D+7 / D+22 / D+62)   (h = 5 / 20 / 60)
  pre-earnings run-up        = close(D-11) -> close(D-1)  (needs the date known >= 10 sessions
                               ahead; most firms pre-announce dates, cf. Nasdaq calendar)
  gap on reaction day R      = open(R)/close(R-1)-1 for R in {D, D+1}, whichever |gap| is larger
Benchmark: IWM if market cap < $2bn else SPY.  Costs: COST_RT by size bucket; shorts pay an
extra 0.5% per 20 sessions borrow/locate haircut (conservative for small caps, generous for large).
Signals are ranked point in time: decile breakpoints come from the previous 12 months' events.
SUE (secondary): seasonal random walk on XBRL diluted EPS frames (latest reported values - a
mild look-ahead via restatements), (EPS_q - EPS_q-4) / sd of the prior 8 such differences.
Universe: tickers listed today (survivorship: delisted firms are missing), price >= $5,
20-day median dollar volume >= $1m.
In-sample 2011-2015, out-of-sample 2016-2026.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import (COST_RT, SCRATCH, cap_bucket, clustered_t, kelly_growth, save_csv, save_json,
                    sec_cached_json, trade_stats)
from fastev import anchor_windows
from shares_out import SharesLookup

WIN = {"ear": (-1, 1), "d0": (-1, 0), "d1": (0, 1), "pre10": (-11, -1), "pre5": (-6, -1),
       "thru": (-6, 1), "post5": (2, 7), "post20": (2, 22), "post60": (2, 62), "post20_e1": (1, 21),
       "rev5": (1, 6)}


def cik_ticker_map() -> dict:
    d = json.loads((SCRATCH / "company_tickers_exchange.json").read_text())
    cte = pd.DataFrame(d["data"], columns=d["fields"])
    cte = cte[cte["exchange"].isin(["Nasdaq", "NYSE", "CBOE"])]
    cte["yf"] = cte["ticker"].str.replace(".", "-", regex=False).str.upper()
    return cte.drop_duplicates("cik").set_index("cik")["yf"].to_dict()


def load_events() -> pd.DataFrame:
    e = pd.read_pickle(SCRATCH / "edgar_earn.pkl")
    e = e[e["items"].str.contains("2.02", regex=False)].copy()
    e["cik"] = e["ciks"].apply(lambda x: int(x[0]) if len(x) else -1)
    m = cik_ticker_map()
    e["ticker"] = e["cik"].map(m)
    e = e.dropna(subset=["ticker"]).sort_values(["cik", "file_date"])
    # one event per company per 30 days (drop follow-up / amended releases)
    keep, last = [], {}
    for i, c, d in zip(e.index, e["cik"], e["file_date"]):
        if c in last and (d - last[c]).days < 30:
            continue
        last[c] = d
        keep.append(i)
    e = e.loc[keep, ["cik", "ticker", "file_date", "items", "adsh"]].rename(columns={"file_date": "anchor"})
    return e.reset_index(drop=True)


def sue_table() -> pd.DataFrame:
    rows = []
    for y in range(2008, 2027):
        for q in range(1, 5):
            if (y, q) > (2026, 2):
                continue
            d = sec_cached_json(f"https://data.sec.gov/api/xbrl/frames/us-gaap/EarningsPerShareDiluted/USD-per-shares/CY{y}Q{q}.json",
                                f"frame_epsd_{y}Q{q}.json.gz")
            for x in (d or {}).get("data", []):
                rows.append((x["cik"], y, q, pd.Timestamp(x["end"]), x["val"]))
    s = pd.DataFrame(rows, columns=["cik", "y", "q", "end", "eps"]).sort_values(["cik", "y", "q"])
    s["t"] = s["y"] * 4 + s["q"]
    out = []
    for c, g in s.groupby("cik"):
        g = g.set_index("t")
        for t, r in g.iterrows():
            if t - 4 not in g.index:
                continue
            diffs = [g.loc[t - k, "eps"] - g.loc[t - k - 4, "eps"] for k in range(1, 9)
                     if (t - k) in g.index and (t - k - 4) in g.index]
            if len(diffs) < 4:
                continue
            sd = np.std(diffs, ddof=1)
            if not np.isfinite(sd) or sd <= 0:
                continue
            out.append((c, r["end"], (r["eps"] - g.loc[t - 4, "eps"]) / sd))
    return pd.DataFrame(out, columns=["cik", "q_end", "sue"])


def pit_deciles(df: pd.DataFrame, col: str, date_col: str = "anchor", lookback_days: int = 365) -> pd.Series:
    """Decile (1..10) of df[col] using breakpoints from events in the prior 12 months."""
    df = df.sort_values(date_col)
    months = df[date_col].dt.to_period("M")
    dec = pd.Series(np.nan, index=df.index)
    for m in months.unique():
        start = (m - 12).to_timestamp()
        end = m.to_timestamp()
        hist = df.loc[(df[date_col] >= start) & (df[date_col] < end), col].dropna()
        if len(hist) < 500:
            continue
        qs = np.quantile(hist, np.linspace(0.1, 0.9, 9))
        idx = df.index[months == m]
        dec.loc[idx] = 1 + np.searchsorted(qs, df.loc[idx, col].values, side="right")
    return dec


def main():
    f = SCRATCH / "earn_windows.pkl"
    if f.exists():
        ev = pd.read_pickle(f)
    else:
        ev = load_events()
        print("events with current ticker:", len(ev), flush=True)
        ev = anchor_windows(ev, WIN, bench=["SPY", "IWM"], gap_offsets=(0, 1))
        ev.to_pickle(f)
    sl = SharesLookup()
    ev["mcap"] = [sl.asof(c, d) * p if np.isfinite(p) else np.nan for c, d, p in zip(ev["cik"], ev["anchor"], ev["raw_px"])]
    ev["bucket"] = ev["mcap"].apply(cap_bucket)
    ev["cost_rt"] = ev["bucket"].map(COST_RT)
    big = ev["mcap"] >= 2e9
    for w in WIN:
        ev[f"x_{w}"] = ev[w] - np.where(big, ev[f"{w}_SPY"], ev[f"{w}_IWM"])
    ev["year"] = ev["anchor"].dt.year
    ev["period"] = np.where(ev["anchor"] < "2016-01-01", "2011-15 (IS)", "2016-26 (OOS)")
    uni = ev[(ev["raw_px"] >= 5) & (ev["dvol20"] >= 1e6) & (ev["hist"] >= 60) & ev["x_ear"].notna()].copy()
    uni = uni[uni["anchor"] >= "2011-01-01"]
    print("universe events:", len(uni), uni.groupby("year").size().to_dict(), flush=True)
    uni["ear_dec"] = pit_deciles(uni, "x_ear")
    # reaction-day gap
    g0, g1 = uni["gap0"], uni["gap1"]
    use1 = g1.abs() > g0.abs()
    uni["gapR"] = np.where(use1, g1, g0)
    uni["ocR"] = np.where(use1, uni["oc1"], uni["oc0"])
    # SUE
    sue = sue_table()
    uni = uni.sort_values("anchor")
    sue = sue.sort_values("q_end")
    m = pd.merge_asof(uni[["cik", "anchor"]].reset_index(), sue.rename(columns={"q_end": "qe"}), left_on="anchor", right_on="qe",
                      by="cik", direction="backward", tolerance=pd.Timedelta(days=100))
    uni["sue"] = m.set_index("index")["sue"]
    uni["sue_dec"] = pit_deciles(uni, "sue")

    borrow20 = 0.005
    rows = []

    def add(label, s, col, side=1, extra_cost=0.0, per=None):
        r = side * s[col] - s["cost_rt"] - extra_cost
        yrs = 5.0 if per == "2011-15 (IS)" else (10.7 if per == "2016-26 (OOS)" else 15.7)
        st = trade_stats(r, per_year=len(r.dropna()) / yrs)
        st["t_clustered"] = round(clustered_t(r, s["anchor"]), 2) if len(r.dropna()) > 30 else None
        st["gross_mean_%"] = round(100 * (side * s[col]).mean(), 2)
        rows.append({"setup": label, "period": per, "window": col, **st})

    for per in ["2011-15 (IS)", "2016-26 (OOS)"]:
        u = uni[uni["period"] == per]
        for size_lbl, us in [("ALL", u), ("large+mid (>=$2bn)", u[u["mcap"] >= 2e9]), ("small ($0.3-2bn)", u[(u["mcap"] >= 3e8) & (u["mcap"] < 2e9)]),
                             ("micro (<$300m)", u[u["mcap"] < 3e8])]:
            top, bot = us[us["ear_dec"] == 10], us[us["ear_dec"] == 1]
            for w in ["x_post5", "x_post20", "x_post60"]:
                add(f"PEAD-EAR long top decile [{size_lbl}]", top, w, per=per)
                add(f"PEAD-EAR short bottom decile [{size_lbl}]", bot, w, side=-1, extra_cost=borrow20 * (3 if w.endswith("60") else (0.25 if w.endswith("5") else 1)), per=per)
            stop, sbot = us[us["sue_dec"] == 10], us[us["sue_dec"] == 1]
            for w in ["x_post20", "x_post60"]:
                add(f"PEAD-SUE long top decile [{size_lbl}]", stop, w, per=per)
                add(f"PEAD-SUE short bottom decile [{size_lbl}]", sbot, w, side=-1, extra_cost=borrow20 * (3 if w.endswith("60") else 1), per=per)
            both = us[(us["sue_dec"] == 10) & (us["ear_dec"] >= 9)]
            add(f"PEAD-SUE top & EAR top-2 deciles long [{size_lbl}]", both, "x_post20", per=per)
            add(f"PEAD-SUE top & EAR top-2 deciles long [{size_lbl}]", both, "x_post60", per=per)
            # gap continuation / fade
            gu = us[us["gapR"] > 0.05]
            gd = us[us["gapR"] < -0.05]
            add(f"Gap-up >5%, held gains (close>open), long [{size_lbl}]", gu[gu["ocR"] > 0], "x_post20", per=per)
            add(f"Gap-up >5%, faded (close<open), long [{size_lbl}]", gu[gu["ocR"] < 0], "x_post20", per=per)
            add(f"Gap-down >5%, buy the fade 5d [{size_lbl}]", gd, "x_post5", per=per)
            add(f"Gap-down >5%, short continuation 20d [{size_lbl}]", gd, "x_post20", side=-1, extra_cost=borrow20, per=per)
            add(f"Gap-up >5%, short the fade 5d [{size_lbl}]", gu, "x_post5", side=-1, extra_cost=borrow20 * 0.25, per=per)
            # pre-earnings run-up
            add(f"Pre-earnings run-up long D-11->D-1 [{size_lbl}]", us, "x_pre10", per=per)
            add(f"Pre-earnings run-up long D-6->D-1 [{size_lbl}]", us, "x_pre5", per=per)
            add(f"Hold through announcement D-6->D+1 [{size_lbl}]", us, "x_thru", per=per)
    tab = pd.DataFrame(rows)
    save_csv(tab, "earnings_setups.csv")

    # decay by year: long-short EAR decile spread (gross) and SUE spread, 20d and 60d
    dec_rows = []
    for y, u in uni.groupby("year"):
        for sig in ["ear_dec", "sue_dec"]:
            for w in ["x_post20", "x_post60"]:
                t_, b_ = u.loc[u[sig] == 10, w].mean(), u.loc[u[sig] == 1, w].mean()
                dec_rows.append({"year": y, "signal": sig, "window": w, "top_%": round(100 * t_, 2), "bottom_%": round(100 * b_, 2),
                                 "spread_%": round(100 * (t_ - b_), 2), "n_top": int((u[sig] == 10).sum())})
        dec_rows.append({"year": y, "signal": "pre10_all", "window": "x_pre10", "top_%": round(100 * u["x_pre10"].mean(), 3),
                         "bottom_%": None, "spread_%": None, "n_top": int(len(u))})
    decay = pd.DataFrame(dec_rows)
    save_csv(decay, "earnings_decay_by_year.csv")

    # sizing for the best OOS long setup (information only)
    oos = uni[uni["period"] == "2016-26 (OOS)"]
    top = oos[oos["ear_dec"] == 10]
    kg = kelly_growth((top["x_post20"] - top["cost_rt"]).dropna(), kappa=0.5, k=0.25, cap=0.05)
    save_json({"n_universe": int(len(uni)), "kelly_pead_ear_long_oos_h20": kg,
               "note": "survivor universe (current tickers); see module docstring"}, "earnings_summary.json")
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 500)
    print(tab[["setup", "period", "window", "n", "per_yr", "gross_mean_%", "mean_%", "median_%", "t_clustered", "win_%", "p5_%"]].to_string())
    piv = decay[decay["signal"] != "pre10_all"].pivot_table(index="year", columns=["signal", "window"], values="spread_%")
    print(piv.round(2).to_string())
    print(decay[decay["signal"] == "pre10_all"][["year", "top_%", "n_top"]].to_string())


if __name__ == "__main__":
    main()
