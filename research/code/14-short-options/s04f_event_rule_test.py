"""s04f - Conditional event-straddle rule (track 04 checklist item 9): buy a 1-day ATM SPX straddle into
FOMC / CPI / NFP only when the implied move is below the trailing median realised move of that event type.
Implied: VIX1D/sqrt(252) at the prior close (2022-05-13 onward), straddle = k*sqrt(2/pi)*sd (k=1 base,
0.9/1.1), 2% round-trip cost.  Trailing median over the previous N events of the same type (N=8, 12)
using realised moves back to 2005 (NFP) / 1994 (FOMC, CPI).  Also: recent realised event moves."""
from __future__ import annotations

import numpy as np
import pandas as pd

import optmodel as om
from common14 import OUT, save


def main():
    mk = om.market()
    r = np.log(mk.spx).diff()
    rows = []
    for ev in ["fomc_day", "cpi_day", "nfp_day"]:
        days = mk.index[mk[ev]]
        moves = r.reindex(days).abs()
        for N in (8, 12):
            trail = moves.rolling(N).median().shift(1)
            for d in days[days >= "2022-05-16"]:
                i = mk.index.get_loc(d)
                prev = mk.index[i - 1]
                sd = mk.loc[prev, "vix1d"] / 100 / np.sqrt(252)
                if not np.isfinite(sd):
                    continue
                for k in (0.9, 1.0, 1.1):
                    prem = k * np.sqrt(2 / np.pi) * sd
                    rows.append(dict(event=ev.replace("_day", "").upper(), N=N, k=k, date=d, implied_move=prem,
                                     trailing_median=trail.loc[d], move=abs(r.loc[d]),
                                     signal=prem < trail.loc[d], pnl=abs(r.loc[d]) / prem - 1 - 0.02))
    t = pd.DataFrame(rows)
    t.to_csv(OUT / "s04f_event_rule_trades.csv", index=False, float_format="%.5f")
    s = t.groupby(["event", "N", "k", "signal"]).agg(n=("pnl", "size"), mean=("pnl", "mean"), median=("pnl", "median"),
                                                      win=("pnl", lambda x: (x > 0).mean()),
                                                      t=("pnl", lambda x: x.mean() / (x.std() / np.sqrt(len(x))) if len(x) > 2 else np.nan)).reset_index()
    pooled = t.groupby(["N", "k", "signal"]).agg(n=("pnl", "size"), mean=("pnl", "mean"), median=("pnl", "median"),
                                                  win=("pnl", lambda x: (x > 0).mean()),
                                                  t=("pnl", lambda x: x.mean() / (x.std() / np.sqrt(len(x))))).reset_index()
    save(s, "s04f_event_rule_by_type", index=False)
    save(pooled, "s04f_event_rule_pooled", index=False)
    rec = []
    for ev in ["fomc_day", "cpi_day", "nfp_day"]:
        days = mk.index[mk[ev]]
        m = r.reindex(days).abs()
        for per, a in [("last 24 months", "2024-09-26"), ("2022-2026", "2022-01-01")]:
            x = m.loc[a:]
            rec.append(dict(event=ev.replace("_day", "").upper(), period=per, n=len(x), mean_abs=x.mean(), median_abs=x.median()))
    rec = pd.DataFrame(rec)
    save(rec, "s04f_recent_event_moves", index=False)
    with pd.option_context("display.width", 200):
        print(pooled.round(4).to_string(index=False))
        print(s[s.k == 1.0].round(4).to_string(index=False))
        print(rec.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
