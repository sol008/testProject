"""Exploratory (one extra variant, theory-motivated by limits to arbitrage): do insider-cluster
follower returns depend on the VIX level on the filing date?  W30/K2 baseline, gross and net."""
import numpy as np
import pandas as pd
from common import COST_RT, SCRATCH, cap_bucket, load_prices, save_csv, trade_stats

res = pd.read_pickle(SCRATCH / "insider_returns.pkl")
res = res[(res["W"] == 30) & (res["K"] == 2) & (res["raw_px"] >= 2) & (res["dvol20"] >= 1e5)].copy()
res["cost_rt"] = res["mcap"].apply(cap_bucket).map(COST_RT)
vix = load_prices(["^VIX"], verbose=False, download=False)["^VIX"]["Close"]
res["vix"] = vix.reindex(res["event_date"], method="ffill").values
res["vbin"] = pd.cut(res["vix"], [0, 15, 20, 30, 200], labels=["<15", "15-20", "20-30", ">=30"])
rows = []
for per, g in [("2006-15", res[res["event_date"] < "2016-01-01"]), ("2016-26", res[res["event_date"] >= "2016-01-01"])]:
    for vb, gg in g.groupby("vbin", observed=True):
        for h in (20, 60):
            rows.append({"period": per, "vix": vb, "h": h, "gross": True, **trade_stats(gg[f"x{h}"])})
            rows.append({"period": per, "vix": vb, "h": h, "gross": False, **trade_stats(gg[f"x{h}"] - gg["cost_rt"])})
t = pd.DataFrame(rows)
save_csv(t, "insider_by_vix.csv")
print(t[["period", "vix", "h", "gross", "n", "mean_%", "median_%", "t", "win_%"]].to_string())
