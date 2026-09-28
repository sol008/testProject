"""Track 13 / test 2: Connors-style short-term mean reversion in up-trends.

Filter  : close > 200-day SMA (of the traded instrument); an unfiltered version is also run.
Entries : RSI(2) < 5 ; RSI(2) < 10 ; 3 / 4 / 5 consecutive lower closes ;
          close below the lower Bollinger band (20-day, 2 sd).
Exits   : RSI(2) > 70 ; close > 5-day SMA (both capped at 20 sessions) ; time exits 5 / 10.
Execution: next open, next close, and the 'ideal' same-close fill (upper bound).
Periods : ^GSPC 1928-2026 by era; ETFs IS (<2008) vs OOS (2008-) ; publication of the
          Connors RSI(2) rules ~2004-2008 (we use 2008 as the split, per the brief).
Universe: ^GSPC, SPY, QQQ, IWM, DIA, EFA, EEM, 9 sector SPDRs, 17 country ETFs,
          16 foreign indices (close entries).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common13 import (SPLIT, TODAY, Registry, down_streak, load, rsi_wilder, run_rule, save,
                      sma, stream_stats, strategy_daily, trade_stats)

REG = Registry("s02_meanrev")
CAP = 20
END = TODAY + pd.Timedelta(days=1)


def signals(df: pd.DataFrame) -> tuple[dict, dict, pd.Series]:
    c = df["C"]
    r2 = rsi_wilder(c, 2)
    ds = down_streak(c)
    m20, s20 = sma(c, 20), c.rolling(20).std()
    ent = {
        "RSI2<5": r2 < 5,
        "RSI2<10": r2 < 10,
        "down3": ds >= 3,
        "down4": ds >= 4,
        "down5": ds >= 5,
        "belowBB": c < m20 - 2 * s20,
    }
    ex = {
        "RSI2>70": (r2 > 70, CAP),
        "C>SMA5": (c > sma(c, 5), CAP),
        "T5": (None, 5),
        "T10": (None, 10),
    }
    trend = c > sma(c, 200)
    return ent, ex, trend


def eval_inst(tk: str, modes, periods, rows, trades_keep=None, filters=("trend", "none")):
    df = load(tk)
    ent, ex, trend = signals(df)
    for en, e in ent.items():
        for filt in filters:
            ee = (e & trend) if filt == "trend" else e
            for xn, (xs, cap) in ex.items():
                for mode in modes:
                    tr = run_rule(df, ee, mode=mode, hold=cap, exit_sig=xs)
                    variant = f"{en}|{xn}|{filt}"
                    if trades_keep is not None and filt == "trend":
                        trades_keep[(tk, variant, mode)] = tr
                    for pname, (lo, hi) in periods.items():
                        lo2, hi2 = max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1])
                        sub = tr[(tr["signal"] >= lo2) & (tr["signal"] < hi2)] if len(tr) else tr
                        st = trade_stats(sub, lo2, hi2)
                        REG.add("meanrev:" + en.rstrip("0123456789<>.") + "|" + xn, variant, tk, mode, pname, st)
                        rows.append(dict(inst=tk, entry=en, exit=xn, filt=filt, mode=mode, period=pname, **st))


def main():
    rows = []
    keep = {}
    # ---------------- S&P 500 long history (close-based fills only)
    eras = {
        "1928-1959": ("1928-01-01", "1960-01-01"),
        "1960-1989": ("1960-01-01", "1990-01-01"),
        "1990-2007": ("1990-01-01", "2008-01-01"),
        "2008-2026": ("2008-01-01", END),
        "2016-2026": ("2016-01-01", END),
        "full": ("1928-01-01", END),
    }
    eval_inst("^GSPC", ["close", "ideal"], eras, rows, keep)
    # ---------------- US ETFs (IS/OOS)
    etf_periods = {"IS (<2008)": ("1990-01-01", SPLIT), "OOS (2008-)": (SPLIT, END),
                   "2016-2026": ("2016-01-01", END), "full": ("1990-01-01", END)}
    for tk in ["SPY", "QQQ", "IWM", "DIA", "EFA", "EEM"]:
        eval_inst(tk, ["open", "close", "ideal"], etf_periods, rows, keep)
    for tk in ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"]:
        eval_inst(tk, ["open", "close"], etf_periods, rows, keep, filters=("trend",))
    for tk in ["EWA", "EWC", "EWD", "EWG", "EWH", "EWI", "EWJ", "EWK", "EWL", "EWM", "EWN", "EWO",
               "EWP", "EWQ", "EWS", "EWU", "EWW"]:
        eval_inst(tk, ["open", "close"], etf_periods, rows, keep, filters=("trend",))
    for tk in ["^N225", "^FTSE", "^GDAXI", "^FCHI", "^HSI", "^STOXX50E", "^AXJO", "^GSPTSE", "^SSMI",
               "^AEX", "^IBEX", "^KS11", "^TWII", "^BVSP", "^MXX", "^BSESN"]:
        eval_inst(tk, ["close"], {"IS (<2008)": ("1960-01-01", SPLIT), "OOS (2008-)": (SPLIT, END)},
                  rows, keep, filters=("trend",))
    res = pd.DataFrame(rows)
    save(res, "meanrev_all.csv")
    # ---------------- strategy-level stats + cost sensitivity for the headline variants
    head = [("RSI2<5", "C>SMA5"), ("RSI2<10", "C>SMA5"), ("RSI2<10", "RSI2>70"), ("down3", "C>SMA5"),
            ("belowBB", "C>SMA5"), ("RSI2<10", "T5")]
    srows = []
    for tk in ["^GSPC", "SPY", "QQQ", "IWM", "DIA", "EFA"]:
        df = load(tk)
        ent, ex, trend = signals(df)
        for en, xn in head:
            xs, cap = ex[xn]
            for mode in (["close"] if tk == "^GSPC" else ["open", "close"]):
                for cost in (0.0, 1.0, 2.0, 5.0, 10.0):
                    tr = run_rule(df, ent[en] & trend, mode=mode, hold=cap, exit_sig=xs, cost_bps=cost)
                    for pname, (lo, hi) in {"IS": ("1990-01-01" if tk != "^GSPC" else "1990-01-01", SPLIT),
                                            "OOS": (SPLIT, END), "1928-1989": ("1928-01-01", "1990-01-01")}.items():
                        if tk != "^GSPC" and pname == "1928-1989":
                            continue
                        lo2, hi2 = max(pd.Timestamp(lo), df.index[0]), min(pd.Timestamp(hi), df.index[-1])
                        sub = tr[(tr["signal"] >= lo2) & (tr["signal"] < hi2)] if len(tr) else tr
                        st = trade_stats(sub, lo2, hi2)
                        r = strategy_daily(df, sub, lo2, hi2)
                        ss = stream_stats(r, df["rf"])
                        bh = stream_stats(df["aC"].pct_change().loc[lo2:hi2].fillna(0), df["rf"])
                        expo = float(sub["sessions"].sum() / max(len(df.loc[lo2:hi2]), 1)) if len(sub) else 0.0
                        srows.append(dict(inst=tk, entry=en, exit=xn, mode=mode, cost_bps=cost, period=pname,
                                          exposure=expo, **st, **{"s_" + k: v for k, v in ss.items()},
                                          **{"bh_" + k: v for k, v in bh.items()}))
    save(pd.DataFrame(srows), "meanrev_headline.csv")
    # keep the trade list of the main variant for the report
    for key in [("SPY", "RSI2<10|C>SMA5|trend", "open"), ("^GSPC", "RSI2<10|C>SMA5|trend", "close"),
                ("SPY", "RSI2<5|C>SMA5|trend", "open"), ("QQQ", "RSI2<10|C>SMA5|trend", "open")]:
        if key in keep:
            save(keep[key], f"meanrev_trades_{key[0].replace('^', '')}_{key[1].replace('|', '_').replace('<', 'lt').replace('>', 'gt')}_{key[2]}.csv")
    REG.save()
    print("done", len(res))


if __name__ == "__main__":
    main()
