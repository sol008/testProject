"""Family (g): long Treasuries after yield spikes, held 42 / 63 / 84 sessions.

10-year constant-maturity yield (FRED DGS10, 1962-).  Signals (declustered: first in 63 sessions);
because FRED publishes day t's yield the next afternoon, the signal is lagged one session
(entry at the close / open of t+2):
  UP50/21    10y up >= 50 bp over 21 sessions
  UP75/21    10y up >= 75 bp over 21 sessions
  UP100/63   10y up >= 100 bp over 63 sessions
  Z2/21      21-session change >= 2 sd of its trailing 3-year distribution (level-free)
Instruments: synthetic 10-year par bond (~IEF) and long bond (30-year; 20-year where 30 is missing,
~TLT) total return from yields (track 15 method), next-close entries, 2 bp/side; test also in IEF / TLT
ETFs at the next open.  Design: 1962-2007.  Test: 2008-2026.
"""
from __future__ import annotations

import pandas as pd

import common22 as K

FAMILY = "g_bonds"
HOLDS = (42, 63, 84)


def main():
    y = K.fred("DGS10")
    y = y[~y.index.duplicated()]
    b10 = K.synthetic_frame(K.bond_tr(10), "UST10syn")
    b30 = K.synthetic_frame(K.bond_tr(30), "ULONGsyn")
    ief, tlt = K.load("IEF"), K.load("TLT")
    yy = y.reindex(b10.index).ffill()
    d21 = yy - yy.shift(21)
    d63 = yy - yy.shift(63)
    sd21 = d21.rolling(756, min_periods=500).std()
    conds = {"UP50/21": d21 >= 0.50, "UP75/21": d21 >= 0.75, "UP100/63": d63 >= 1.00, "Z2/21": d21 >= 2 * sd21}
    sigs = {k: K.first_cross(c, 63).shift(1).fillna(False) for k, c in conds.items()}
    reg = K.Registry(FAMILY)
    ev = []
    for v, s in sigs.items():
        for d in s[s].index:
            ev.append(dict(signal=v, date=str(d.date()), y10=float(yy.loc[d]), d21=round(float(d21.loc[d]), 2)))
        for H in HOLDS:
            vH = f"{v}|H{H}"
            for inst, df, etf in (("10y", b10, ief), ("long", b30, tlt)):
                for role, dfx, mode, a, b, cost in (("design", df, "close", "1962-01-01", "2007-12-31", 2.0),
                                                    ("test", df, "close", "2008-01-01", None, 2.0),
                                                    ("test_exec", etf, "open", "2008-01-01", None, 2.0),
                                                    ("full", df, "close", "1962-01-01", None, 2.0)):
                    tr, st = K.evaluate(dfx, s.reindex(dfx.index).fillna(False), H, mode, a, b, cost_bps=cost)
                    reg.add(f"{vH}|{inst}", dfx.attrs["ticker"], role, st, tr, signal=v, asset=inst)
    pd.DataFrame(ev).to_csv(K.RESULTS / "g_bond_signals.csv", index=False)
    return reg.save()


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 300)
    df = main()
    cols = ["variant", "instrument", "role", "n", "win", "mean_net", "median_net", "worst", "base", "edge",
            "t_edge", "p_placebo", "mdd"]
    print(df[cols].round(3).to_string())
