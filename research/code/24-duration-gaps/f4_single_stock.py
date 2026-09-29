"""Family 4: post-earnings drift and other 60-120-day single-stock anomalies for a follower acting the next day.

Track 16 rejected every event-driven single-stock setup at 20 and 60 sessions (2011-2026 EDGAR events, next-day
follower).  This script asks whether a LONGER hold changes that, using track 16's point-in-time event sets and its
Yahoo price cache (read-only), with new windows of 42 / 63 / 84 sessions:
  * PEAD: 8-K Item 2.02 earnings releases 2011-2026 (108,796 liquid-universe events; price >= $5, 20-day median
    dollar volume >= $1m).  Signals: announcement-return decile (close D-1 -> D+1, size-matched ETF adjusted) and SUE
    decile (seasonal random walk on XBRL diluted EPS), both with point-in-time breakpoints (track 16).  The
    follower buys at the close of D+2 (the day after the email) and holds H sessions.  A 63-84-session hold spans
    the NEXT earnings release, where Bernard & Thomas found part of the drift is realised.
  * Spin-offs: the design forbids trading spincos in their first 60 sessions; a 90/120-day cap would allow buying at
    session 61 and holding 42 / 63 / 84 sessions.  (Also from session 20, for comparison with track 16.)
  * Insider clusters (>= 2 insiders buying within 30 days; track 16's W30K2 definition): entry at the close of D+1.
Excess = stock minus its size-matched ETF (IWM below $2bn, SPY at or above), net of track 16's round-trip cost by
size bucket.  t-statistics are clustered by calendar month (events are averaged within a month first).
Design (in-sample) 2011-2015 (insiders 2009-2015), test 2016-2026.  Survivor universe (current tickers): see track
16 section 1.5.  Outputs: results/f4_*.csv
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import common24 as C  # noqa: E402

sys.path.insert(0, str(C.CODE / "16-short-events"))
from fastev import anchor_windows  # noqa: E402  (track 16, read-only)

T16 = C.T16
H_LIST = (20, 42, 63, 84)


def clustered_t(x: pd.Series, dates: pd.Series) -> float:
    d = pd.DataFrame({"x": x.values, "m": pd.to_datetime(dates.values).to_period("M")}).dropna()
    mm = d.groupby("m")["x"].mean()
    if len(mm) < 6 or mm.std(ddof=1) == 0:
        return float("nan")
    return float(mm.mean() / mm.std(ddof=1) * np.sqrt(len(mm)))


def row_stats(label, per, H, x: pd.Series, dates: pd.Series, yrs: float) -> dict:
    x = x.dropna()
    d = dates.loc[x.index]
    if len(x) < 10:
        return dict(setup=label, period=per, H=H, n=len(x))
    return dict(setup=label, period=per, H=H, n=len(x), per_yr=len(x) / yrs, mean=x.mean(), median=x.median(),
                win=(x > 0).mean(), t_clustered=clustered_t(x, d), p05=x.quantile(0.05), sd=x.std(ddof=1))


def excess_windows(ev: pd.DataFrame, start_off: int, anchor_col: str, bench_rule) -> pd.DataFrame:
    wins = {f"h{H}": (start_off, start_off + H) for H in H_LIST}
    out = anchor_windows(ev, wins, anchor_col=anchor_col, bench=["SPY", "IWM"], features=False)
    for H in H_LIST:
        b = np.where(bench_rule(out), out[f"h{H}_SPY"], out[f"h{H}_IWM"])
        out[f"x{H}"] = out[f"h{H}"] - b
    return out


def pead() -> pd.DataFrame:
    u = pd.read_pickle(T16 / "earn_universe.pkl")
    u = u[["cik", "ticker", "anchor", "mcap", "cost_rt", "ear_dec", "sue_dec", "period", "year"]].copy()
    w = excess_windows(u.reset_index(drop=True), 2, "anchor", lambda o: o["mcap"] >= 2e9)
    rows = []
    yrs = {"2011-15 (IS)": 5.0, "2016-26 (OOS)": 10.7}
    for per, g in w.groupby("period"):
        for size, gs in (("all", g), (">=$2bn", g[g.mcap >= 2e9]), ("$0.3-2bn", g[(g.mcap >= 3e8) & (g.mcap < 2e9)])):
            for sig in ("ear_dec", "sue_dec"):
                top, bot = gs[gs[sig] == 10], gs[gs[sig] == 1]
                for H in H_LIST:
                    net = top[f"x{H}"] - top["cost_rt"]
                    r = row_stats(f"PEAD {sig[:3].upper()} top decile long [{size}]", per, H, net, top["anchor"], yrs[per])
                    r["gross"] = top[f"x{H}"].mean()
                    r["spread_top_bottom_gross"] = top[f"x{H}"].mean() - bot[f"x{H}"].mean()
                    rows.append(r)
                    C.Ledger.add("f4_single_stock", f"PEAD {sig} top {size} H{H}", per, r.get("n"), r.get("t_clustered", np.nan),
                                 mean=r.get("mean"))
            both = gs[(gs["sue_dec"] == 10) & (gs["ear_dec"] >= 9)]
            for H in H_LIST:
                net = both[f"x{H}"] - both["cost_rt"]
                r = row_stats(f"PEAD SUE top & EAR top-2 long [{size}]", per, H, net, both["anchor"], yrs[per])
                r["gross"] = both[f"x{H}"].mean()
                rows.append(r)
                C.Ledger.add("f4_single_stock", f"PEAD both {size} H{H}", per, r.get("n"), r.get("t_clustered", np.nan),
                             mean=r.get("mean"))
    # decile spread by year (gross), SUE and EAR, for the decay picture
    dec = []
    for y, g in w.groupby("year"):
        for sig in ("ear_dec", "sue_dec"):
            for H in (42, 63, 84):
                dec.append(dict(year=y, signal=sig, H=H, spread=g.loc[g[sig] == 10, f"x{H}"].mean() - g.loc[g[sig] == 1, f"x{H}"].mean(),
                                top=g.loc[g[sig] == 10, f"x{H}"].mean(), n_top=int((g[sig] == 10).sum())))
    C.save(pd.DataFrame(dec), "f4_pead_spread_by_year")
    return pd.DataFrame(rows)


def spinoffs() -> pd.DataFrame:
    s = pd.read_pickle(T16 / "spinoff_events.pkl")
    s = s[["cik", "ticker", "anchor", "mcap", "cost_rt", "period"]].reset_index(drop=True)
    rows, per_event = [], []
    for start_off, lab in ((20, "spinco from session 20"), (61, "spinco from session 61 (after the 60-session ban)")):
        w = excess_windows(s, start_off, "anchor", lambda o: np.zeros(len(o), bool))     # IWM benchmark (track 16)
        ev = w[["ticker", "anchor", "period", "mcap", "cost_rt"] + [f"x{H}" for H in H_LIST]].copy()
        ev["start_session"] = start_off
        per_event.append(ev)
        for per, g in w.groupby("period"):
            yrs = 5.0 if per.startswith("2011") else 10.7
            for H in H_LIST:
                net = g[f"x{H}"] - g["cost_rt"]
                r = row_stats(lab, per, H, net, g["anchor"], yrs)
                rows.append(r)
                C.Ledger.add("f4_single_stock", f"{lab} H{H}", per, r.get("n"), r.get("t_clustered", np.nan), mean=r.get("mean"))
    C.save(pd.concat(per_event, ignore_index=True), "f4_spinoff_events")
    return pd.DataFrame(rows)


def insiders() -> pd.DataFrame:
    e = pd.read_pickle(T16 / "insider_returns.pkl")
    e = e[(e["W"] == 30) & (e["K"] == 2) & (e["map_status"] == "ok")].copy()
    e = e[["ticker", "event_date", "mcap", "bench", "raw_px", "dvol20"]].reset_index(drop=True)
    e = e[(e["raw_px"] >= 5) & (e["dvol20"] >= 1e6)]
    e["cost_rt"] = np.where(e["mcap"] >= 1e10, 0.0015, np.where(e["mcap"] >= 2e9, 0.003,
                            np.where(e["mcap"] >= 3e8, 0.008, 0.02)))
    e = e.reset_index(drop=True)
    w = excess_windows(e, 1, "event_date", lambda o: (o["bench"] == "SPY").values)
    rows = []
    for per, a, b, yrs in (("2009-15 (IS)", "2009-01-01", "2015-12-31", 7.0), ("2016-26 (OOS)", "2016-01-01", "2026-12-31", 10.7)):
        g = w[(w["event_date"] >= a) & (w["event_date"] <= b)]
        for size, gs in (("all liquid", g), (">=$300m", g[g.mcap >= 3e8])):
            for H in H_LIST:
                net = gs[f"x{H}"] - gs["cost_rt"]
                r = row_stats(f"Insider cluster W30K2 [{size}]", per, H, net, gs["event_date"], yrs)
                r["gross"] = gs[f"x{H}"].mean()
                rows.append(r)
                C.Ledger.add("f4_single_stock", f"insider {size} H{H}", per, r.get("n"), r.get("t_clustered", np.nan),
                             mean=r.get("mean"))
    return pd.DataFrame(rows)


def spinoff_worst10() -> pd.DataFrame:
    """Design stress without a stop = notional x the instrument's worst 10-session loss: the spincos' own worst
    10-session total-return loss since listing (median / quartiles across the panel) sets the notional."""
    from evstudy import px  # track 16, read-only
    from common import tr_index
    s = pd.read_pickle(T16 / "spinoff_events.pkl")
    w = []
    for t in s["ticker"].dropna().unique():
        d = px(t)
        if d is None or len(d) < 60:
            continue
        tr = tr_index(d).dropna()
        w.append(float((tr.shift(-10) / tr - 1).min()))
    w = np.array(w)
    return pd.DataFrame([dict(n=len(w), median=np.median(w), q25=np.percentile(w, 25), q75=np.percentile(w, 75),
                              notional_at_2pct_median=0.02 / abs(np.median(w)))])


def main():
    sw = spinoff_worst10()
    C.save(sw, "f4_spinoff_stress")
    print(sw.round(4).to_string(index=False), flush=True)
    p = pead()
    C.save(p, "f4_pead")
    print(p.round(4).to_string(index=False), flush=True)
    s = spinoffs()
    C.save(s, "f4_spinoffs")
    print(s.round(4).to_string(index=False), flush=True)
    i = insiders()
    C.save(i, "f4_insiders")
    print(i.round(4).to_string(index=False), flush=True)
    C.Ledger.save("f4_single_stock")


if __name__ == "__main__":
    main()
