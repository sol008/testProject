"""Track 22 checks:
  1. How many calendar days do 42 / 60 / 61 / 62 / 63 / 84 sessions span (entry open -> exit close)?
     Which holding periods fit a 60 / 90 / 120-calendar-day cap in every year?
  2. The uptrend-shock module (first S&P -3% day or first VIX >= 30 close, prior close above the 200-day):
     share of days open at each hold, and overlap with M1 (ST-1 dip-buy) -- the US-equity stress collision.
  3. Deflated Sharpe of the international panel computed on crisis-month clusters (not trades).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common22 as K
import fa_index_fear as FA


def spans():
    spy = K.load("SPY")
    idx = spy.index[spy.index >= "2000-01-01"]
    rows = []
    for H in (42, 60, 61, 62, 63, 84, 85, 86):
        d = [(idx[i + H - 1] - idx[i]).days for i in range(len(idx) - H)]   # entry at session i open, exit at close of session i+H-1
        d = np.array(d)
        rows.append(dict(sessions=H, median_days=float(np.median(d)), max_days=int(d.max()),
                         share_over_60=float((d > 60).mean()), share_over_90=float((d > 90).mean()),
                         share_over_120=float((d > 120).mean())))
    return pd.DataFrame(rows)


def st1_trades(spy: pd.DataFrame, vix: pd.Series) -> pd.DataFrame:
    c = spy["C"]
    rsi = K.C13.rsi_wilder(c, 2)
    entry = (c > K.sma(c, 200)) & (rsi < 10) & (vix.reindex(spy.index).ffill() >= 20)
    exit_sig = c > K.sma(c, 5)
    return K.run_rule(spy, entry, mode="open", hold=20, exit_sig=exit_sig, cost_bps=1.0)


def overlap():
    spx = K.load("^GSPC")
    spy = K.load("SPY")
    gauge = K.vix_gauge(spx)
    sigs = FA.build_signals(spx, gauge)
    up200 = (spx["C"].shift(1) > K.sma(spx["C"], 200).shift(1))
    union = ((sigs["DAY-3"] | sigs["VIX>=30"]) & up200).fillna(False).reindex(spy.index).fillna(False)
    st1 = st1_trades(spy, gauge)
    on1 = pd.Series(False, index=spy.index)
    for t in st1.itertuples():
        on1.loc[t.entry:t.exit] = True
    rows = []
    for H in (42, 63, 84):
        tr = K.run_rule(spy, union, mode="open", hold=H, cost_bps=1.0)
        on = pd.Series(False, index=spy.index)
        for t in tr.itertuples():
            on.loc[t.entry:t.exit] = True
        both = on & on1
        rows.append(dict(H=H, trades=len(tr), share_days_open=float(on.mean()),
                         st1_share_days_open=float(on1.mean()),
                         days_both_open=int(both.sum()),
                         trades_with_st1_overlap=int(sum(on1.loc[t.entry:t.exit].any() for t in tr.itertuples()))))
    return pd.DataFrame(rows)


def intl_dsr():
    P = pd.read_csv(K.RESULTS / "pooled_d_intl.csv")
    N_tot = 260
    rows = []
    for _, r in P[P["role"].isin(["test", "test_exec"])].iterrows():
        k = int(r["clusters"])
        sr = r["t_cluster"] / np.sqrt(k) if k > 0 else np.nan
        rows.append(dict(variant=r["variant"], role=r["role"], clusters=k, t_cluster=r["t_cluster"],
                         dsr_N12=K.deflated_sr(sr, k, 0.0, 3.0, 12), dsr_N260=K.deflated_sr(sr, k, 0.0, 3.0, N_tot)))
    return pd.DataFrame(rows)


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    s = spans()
    s.to_csv(K.RESULTS / "check_calendar_spans.csv", index=False, float_format="%.4g")
    print(s.to_string())
    o = overlap()
    o.to_csv(K.RESULTS / "check_overlap_st1.csv", index=False, float_format="%.4g")
    print(o.to_string())
    d = intl_dsr()
    d.to_csv(K.RESULTS / "check_intl_dsr.csv", index=False, float_format="%.4g")
    print(d.round(3).to_string())
