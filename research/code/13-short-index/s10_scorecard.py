"""Track 13: full statistics block for each family's in-sample-selected variant (selected by
the pre-2008 timing-edge t-stat in s08), in-sample and out-of-sample, on the primary
instrument, with strategy-level max drawdown and quarter-Kelly log-growth."""
from __future__ import annotations

import numpy as np
import pandas as pd

from common13 import (SPLIT, TODAY, RESULTS, load, read_result, rsi_wilder, run_rule, save, sma,
                      stream_stats, strategy_daily, trade_stats)
from s01_panic import build_signals, vix_series
from s04_calendar import window_signals, calendar_entries

END = TODAY + pd.Timedelta(days=1)


def u_daily(df, lo, hi):
    x = (df["aC"].pct_change() - df["rf"]).loc[pd.Timestamp(lo):pd.Timestamp(hi)]
    return float(x.mean())


def block(name, df, tr, periods):
    rows = []
    for pname, (lo, hi) in periods.items():
        lo2, hi2 = max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1])
        sub = tr[(tr["signal"] >= lo2) & (tr["signal"] < hi2)] if len(tr) else tr
        if len(sub) < 2:
            rows.append(dict(rule=name, period=pname, n=len(sub)))
            continue
        st = trade_stats(sub, lo2, hi2)
        ss = stream_stats(strategy_daily(df, sub, lo2, hi2), df["rf"])
        u = u_daily(df, lo2, hi2)
        e = sub["excess"].values - u * sub["sessions"].values
        rows.append(dict(rule=name, period=pname, **st, edge=e.mean(), t_edge=e.mean() / e.std(ddof=1) * np.sqrt(len(e)),
                         strat_mdd=ss.get("mdd"), strat_sharpe=ss.get("sharpe"),
                         exposure=float(sub["sessions"].sum() / max(len(df.loc[lo2:hi2]), 1))))
    return rows


def main():
    sel = read_result("is_selected_oos.csv")
    rows = []
    spx = load("^GSPC")
    gauge, _ = vix_series(spx)
    sigs = build_signals(spx, gauge)
    spy = load("SPY")
    for _, r in sel[(sel.family.str.startswith("panic")) & (sel.criterion == "t_edge")].iterrows():
        sig, filt, H = [s.strip() for s in r.selected.split("|")[:-2]] + [None], None, None
        parts = [s.strip() for s in r.selected.split(" | ")]
        sig, filt, H = parts[0], parts[1], int(parts[2][1:])
        for inst, df, mode, periods in (("^GSPC", spx, "close", {"IS 1986-2007": ("1986-01-01", SPLIT),
                                                                 "OOS 2008-2026": (SPLIT, END)}),
                                        ("SPY", spy, "open", {"OOS 2008-2026": (SPLIT, END)})):
            s = sigs[sig].reindex(df.index).fillna(False)
            tr200 = df["C"] > sma(df["C"], 200)
            e = s if filt == "all" else (s & tr200 if filt == "above200" else s & ~tr200)
            tr = run_rule(df, e, mode=mode, hold=H, vix=gauge)
            rows += block(f"{r.family} :: {r.selected} [{inst} next {mode}]", df, tr, periods)
    # mean reversion (IS-selected): SPY next open
    c = spy["C"]
    r2 = rsi_wilder(c, 2)
    tr = run_rule(spy, (r2 < 10) & (c > sma(c, 200)), mode="open", hold=20, exit_sig=r2 > 70)
    rows += block("meanrev :: RSI2<10 & >SMA200, exit RSI2>70 (cap 20) [SPY next open]", spy,
                  tr, {"IS 1993-2007": ("1993-01-01", SPLIT), "OOS 2008-2026": (SPLIT, END)})
    # Donchian (IS-selected DC20|T60): SPY next open
    tr = run_rule(spy, c > c.shift(1).rolling(20).max(), mode="open", hold=60)
    rows += block("donchian :: close > prior 20-day high, hold 60 [SPY next open]", spy, tr,
                  {"IS 1993-2007": ("1993-01-01", SPLIT), "OOS 2008-2026": (SPLIT, END)})
    # calendar rules on SPY (MOC to MOC)
    S = window_signals(spy.index)
    for rule in ("TOM", "PREHOL", "FOMC", "CPI", "OPEX"):
        ent, ext, cap = S[rule]
        tr = run_rule(spy, ent, mode="ideal", hold=cap, exit_sig=ext, scheduled_exit=True)
        rows += block(f"calendar :: {rule} [SPY MOC->MOC]", spy, tr,
                      {"IS 1993-2007": ("1993-01-01", SPLIT), "OOS 2008-2026": (SPLIT, END)})
    out = pd.DataFrame(rows)
    save(out, "scorecard.csv")
    cols = ["rule", "period", "n", "per_yr", "win", "avg_win", "avg_loss", "mean_net", "median_net", "sr_trade", "t",
            "edge", "t_edge", "worst", "strat_mdd", "exposure", "f_qk", "dg_yr"]
    x = out[cols].copy()
    for cc in ["win", "avg_win", "avg_loss", "mean_net", "median_net", "edge", "worst", "strat_mdd", "exposure", "dg_yr"]:
        x[cc] = (100 * x[cc]).round(2)
    for cc in ["per_yr", "sr_trade", "t", "t_edge", "f_qk"]:
        x[cc] = x[cc].round(2)
    pd.set_option("display.width", 300)
    pd.set_option("display.max_colwidth", 80)
    print(x.to_string(index=False))


if __name__ == "__main__":
    main()
