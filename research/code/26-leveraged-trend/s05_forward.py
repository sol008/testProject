"""s05 - forward view: how much of the edge survives lower equity returns and 4.2% T-bills?

Block-bootstrap the index (s03's engine), shift the daily returns by a constant so the 1x index
(SPY-like, after its fee) compounds at a chosen forward rate, set T-bills to a constant, and re-run
the weekly 200-day rules on every path.  10-year horizon, 3,000 paths per cell.
Also: the historical in-market / out-of-market split, which drives the break-even arithmetic.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import boot
import common as c

N_PATHS, H = 3000, 10


def split_in_out():
    rows = []
    for name, df, a in [("S&P 1929-2026", c.spx_panel(), "1929-01-02"), ("NDX 1986-2026", c.ndx_panel(), "1986-10-01")]:
        st = pd.Series(c.trend_state(df, "sma200", "W", 0.02), index=df.index).shift(2).fillna(0)
        d = df.loc[a:]
        s = st.loc[a:]
        for lab, m in [("in market", s > 0), ("out of market", s == 0), ("all days", s >= 0)]:
            r = d.r[m]
            rows.append(dict(sample=name, regime=lab, share_of_days=float(m.mean()),
                             index_ret_ann_arith=float(r.mean() * c.TD), index_vol_ann=float(r.std() * np.sqrt(c.TD)),
                             tbill_ann=float(d.rf[m].mean() * c.TD)))
    t = pd.DataFrame(rows)
    t.to_csv(c.OUT / "s05_in_out_split.csv", index=False, float_format="%.4f")
    print(t.round(4).to_string(index=False))


def scenarios(seed=261):
    rng = np.random.default_rng(seed)
    spx = c.spx_panel().loc["1928-01-03":]
    ndx = c.ndx_panel()
    rows = []
    T = c.TD * (H + 1)
    # --- S&P pool
    r_tr, r_px, rf_h = spx.r.values, spx.px.pct_change().fillna(0).values, spx.rf.values
    idx = boot.make_paths(len(spx), N_PATHS, T, rng)
    for g, rf_rate in [(None, None), (0.10, 0.042), (0.08, 0.042), (0.06, 0.042), (0.045, 0.042), (0.03, 0.042),
                       (0.045, 0.03), (0.045, 0.05)]:
        if g is None:
            d = 0.0
            RF = rf_h[idx]
            tag = "historical drift & T-bills (pool avg)"
        else:
            d = boot.shift_for_target(r_tr, g, fee=c.SPY_ER)
            RF = np.full(idx.shape, rf_rate / c.TD)
            tag = f"SPY {g:.1%} / T-bills {rf_rate:.1%}"
        R, RP = r_tr[idx] - d, r_px[idx] - d
        B = R - c.SPY_ER / c.TD
        for lab, L, filt in [("S&P 1x 200d-W b2", 1, True), ("S&P 1.5x 200d-W b2", 1.5, True),
                             ("S&P 2x 200d-W b2 (SSO)", 2, True), ("S&P 3x 200d-W b2 (UPRO)", 3, True),
                             ("S&P 3x buy & hold", 3, False), ("SPY", 1, False)]:
            ret = boot.run_rule(R, RP, RF, L, filt=filt)
            st = boot.path_stats(ret, B, c.TD)
            rows.append(dict(scenario=tag, pool="S&P 1928-2026", rule=lab, **boot.summarize(st)))
    # --- NDX pool (joint with SPY on the same dates)
    n_tr, n_px, s_tr, rf_n = ndx.r.values, ndx.px.pct_change().fillna(0).values, ndx.spy.values + c.SPY_ER / c.TD, ndx.rf.values
    idx = boot.make_paths(len(ndx), N_PATHS, T, rng)
    for g, prem in [(None, None), (0.06, 0.0), (0.045, 0.0), (0.045, 0.02), (0.03, 0.0)]:
        if g is None:
            dn = ds = 0.0
            RF = rf_n[idx]
            tag = "historical drift & T-bills (pool avg)"
        else:
            ds = boot.shift_for_target(s_tr, g, fee=c.SPY_ER)
            dn = boot.shift_for_target(n_tr, g + prem, fee=0.002)
            RF = np.full(idx.shape, 0.042 / c.TD)
            tag = f"SPY {g:.1%}, NDX {g + prem:.1%} / T-bills 4.2%"
        R, RP = n_tr[idx] - dn, n_px[idx] - dn
        B = s_tr[idx] - ds - c.SPY_ER / c.TD
        for lab, L, filt in [("NDX 2x 200d-W b2 (QLD)", 2, True), ("NDX 3x 200d-W b2 (TQQQ)", 3, True),
                             ("NDX 3x buy & hold", 3, False)]:
            ret = boot.run_rule(R, RP, RF, L, filt=filt)
            st = boot.path_stats(ret, B, c.TD)
            rows.append(dict(scenario=tag, pool="NDX 1985-2026", rule=lab, **boot.summarize(st)))
    t = pd.DataFrame(rows)
    t.to_csv(c.OUT / "s05_forward_scenarios.csv", index=False, float_format="%.4f")
    with pd.option_context("display.width", 260, "display.max_columns", 30, "display.max_rows", 200):
        print(t.round(3).to_string(index=False))


if __name__ == "__main__":
    split_in_out()
    scenarios()
