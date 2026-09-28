"""Split the day-after-filing move into overnight gap (close D -> open D+1) and intraday
(open D+1 -> close D+1), and measure a next-OPEN entry follower (open D+1 -> close D+21),
for the pre-registered W30/K2 cluster baseline.  Excess vs IWM (<$2bn) / SPY."""
import numpy as np
import pandas as pd
from common import COST_RT, SCRATCH, cap_bucket, save_csv, trade_stats
from fastev import anchor_windows

ev = pd.read_pickle(SCRATCH / "insider_events_mapped.pkl")
ev = ev[(ev["map_status"] == "ok") & (ev["W"] == 30) & (ev["K"] == 2) & (ev["event_date"] <= "2026-06-26")].copy()
ev = ev.rename(columns={"event_date": "anchor"}).reset_index(drop=True)
ev = anchor_windows(ev, {"f20": (1, 21), "d1": (0, 1)}, bench=["SPY", "IWM"], gap_offsets=(1,))
spy = anchor_windows(ev[["anchor"]].assign(ticker="SPY"), {"z": (0, 1)}, bench=None, features=False, gap_offsets=(1,))
iwm = anchor_windows(ev[["anchor"]].assign(ticker="IWM"), {"z": (0, 1)}, bench=None, features=False, gap_offsets=(1,))
big = (ev["mcap"] >= 2e9).values
bg = np.where(big, spy["gap1"], iwm["gap1"]); boc = np.where(big, spy["oc1"], iwm["oc1"])
ev["x_gap"] = ev["gap1"] - bg
ev["x_intraday"] = ev["oc1"] - boc
bf = np.where(big, ev["f20_SPY"], ev["f20_IWM"])
ev["x_open_follow20"] = (1 + ev["f20"]) * (1 + ev["oc1"]) - (1 + bf) * (1 + boc)
ev["cost_rt"] = ev["mcap"].apply(cap_bucket).map(COST_RT)
ev = ev[(ev["raw_px"] >= 2) & (ev["dvol20"] >= 1e5)]
rows = []
for per, g in [("2009-15", ev[(ev.anchor.dt.year >= 2009) & (ev.anchor.dt.year <= 2015)]), ("2016-21", ev[(ev.anchor.dt.year >= 2016) & (ev.anchor.dt.year <= 2021)]),
               ("2022-26", ev[ev.anchor.dt.year >= 2022])]:
    for col in ["x_gap", "x_intraday", "x_open_follow20"]:
        rows.append({"period": per, "measure": col, **trade_stats(g[col])})
    rows.append({"period": per, "measure": "x_open_follow20 net", **trade_stats(g["x_open_follow20"] - g["cost_rt"])})
t = pd.DataFrame(rows)
save_csv(t, "insider_open_entry.csv")
print(t[["period", "measure", "n", "mean_%", "median_%", "t", "win_%"]].to_string())
