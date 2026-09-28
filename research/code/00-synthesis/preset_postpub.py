"""Post-publication check for 00-SYNTHESIS.md §10: each preset's CAGR and max drawdown from 2007-01
(Faber's 10-month SMA paper) to the end of the data, historical returns only."""
import numpy as np
import pandas as pd
import preset_backtest as pb

mkt, px = pb.scenario(False)
avg10 = pd.Series(px, index=pb.dates).rolling("3652D", min_periods=1500).mean().values
inv = pb.trend_signal(px)
s = int(np.searchsorted(pb.dates, pd.Timestamp("2007-01-02")))
presets = {
    "index": lambda: np.cumprod(np.r_[1.0, 1.0 + mkt[s + 1:]]),
    "growth_15": lambda: pb.run_tranche(s, pb.N, mkt, px, avg10, 0.85),
    "growth_30": lambda: pb.run_tranche(s, pb.N, mkt, px, avg10, 0.70),
    "conservative": lambda: pb.run_trend(s, pb.N, mkt, inv, 1.0, 0.0),
    "growth_plus": lambda: pb.run_trend(s, pb.N, mkt, inv, 1.3, 0.005),
}
yrs = pb.T_YEARS[-1] - pb.T_YEARS[s]
rows = []
for k, f in presets.items():
    W = f()
    peak = np.maximum.accumulate(W)
    rows.append({"preset": k, "start": str(pb.dates[s].date()), "end": str(pb.dates[-1].date()),
                 "cagr_pct": round((W[-1] ** (1 / yrs) - 1) * 100, 2),
                 "max_drawdown_pct": round((W / peak - 1).min() * 100, 1),
                 "multiple": round(float(W[-1]), 2)})
out = pd.DataFrame(rows)
out.to_csv("preset_postpub.csv", index=False)
print(out.to_string(index=False))
