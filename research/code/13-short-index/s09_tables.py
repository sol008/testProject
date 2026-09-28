"""Track 13: compact markdown tables for the report (printed to stdout; nothing written to
the repo except results/*.csv already produced by s01-s08)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from common13 import RESULTS, read_result

pd.set_option("display.width", 250)


def pct(x, d=2):
    return "" if pd.isna(x) else f"{100 * x:+.{d}f}%"


def num(x, d=1):
    return "" if pd.isna(x) else f"{x:.{d}f}"


def panic_table():
    p = read_result("panic_all_variants.csv")
    p["t_edge"] = p["edge_vs_uncond"] / p["sd_ex"] * np.sqrt(p["n"])
    sigs = ["VIX>=30|first", "VIX>=40|first", "VIX>=45|first", "VIX/VIX3M>=1.0|first", "VIX/VIX3M>=1.1|first",
            "VIXjump>=30%", "VIXjump>=50%", "SPX1d<=-3%", "SPX1d<=-4%", "SPX1d<=-5%",
            "DD<=-10%|first", "DD<=-15%|first", "DD<=-20%|first"]
    out = []
    for s in sigs:
        for filt in ("all", "above200"):
            for H in (5, 20, 60):
                g = p[(p.signal == s) & (p.filt == filt) & (p.H == H)]
                def cell(inst, mode, per):
                    r = g[(g.inst == inst) & (g["mode"] == mode) & (g.period == per)]
                    if not len(r) or not r.n.iloc[0]:
                        return "n=0"
                    r = r.iloc[0]
                    return f"{int(r.n)}: {pct(r.mean_ex, 1)} / {pct(r.edge_vs_uncond, 1)} ({num(r.t_edge)})"
                etf = g[(g.inst.isin(["QQQ", "IWM", "EFA"])) & (g["mode"] == "open") & (g.period == "OOS (2008-)") & (g.n > 0)]
                etf_s = f"{pct(np.average(etf.edge_vs_uncond, weights=etf.n), 1)}" if len(etf) else ""
                out.append(dict(signal=s, filt=filt, H=H,
                                proxy_1928_85=cell("^GSPC", "close", "1928-1985 (proxy VIX)"),
                                IS_1986_2007=cell("^GSPC", "close", "1986-2007 (IS)"),
                                OOS_2008_2026=cell("^GSPC", "close", "2008-2026 (OOS)"),
                                SPY_open_OOS=cell("SPY", "open", "OOS (2008-)"),
                                QQQ_IWM_EFA_OOS_edge=etf_s))
    return pd.DataFrame(out)


def meanrev_table():
    m = read_result("meanrev_all.csv")
    rows = []
    for (e, x) in [("RSI2<5", "RSI2>70"), ("RSI2<5", "C>SMA5"), ("RSI2<10", "RSI2>70"), ("RSI2<10", "C>SMA5"),
                   ("RSI2<10", "T5"), ("RSI2<10", "T10"), ("down3", "C>SMA5"), ("down4", "C>SMA5"), ("down5", "C>SMA5"),
                   ("belowBB", "C>SMA5"), ("belowBB", "RSI2>70")]:
        d = dict(entry=e, exit=x)
        for inst, mode, per, lab in (("^GSPC", "close", "1928-1959", "S&P 28-59"), ("^GSPC", "close", "1960-1989", "S&P 60-89"),
                                     ("^GSPC", "close", "1990-2007", "S&P 90-07"), ("^GSPC", "close", "2008-2026", "S&P 08-26"),
                                     ("SPY", "open", "IS (<2008)", "SPY IS"), ("SPY", "open", "OOS (2008-)", "SPY OOS"),
                                     ("QQQ", "open", "OOS (2008-)", "QQQ OOS"), ("IWM", "open", "OOS (2008-)", "IWM OOS")):
            r = m[(m.inst == inst) & (m["mode"] == mode) & (m.period == per) & (m.entry == e) & (m.exit == x) & (m.filt == "trend")]
            if len(r):
                r = r.iloc[0]
                d[lab] = f"{pct(r.mean_ex)} ({num(r.t)})"
        rows.append(d)
    return pd.DataFrame(rows)


if __name__ == "__main__":
    t = panic_table()
    print(t.to_markdown(index=False))
    print()
    print(meanrev_table().to_markdown(index=False))
