"""s09 - Figures for the track-14 report (static PNGs for a markdown report).
Palette: reference categorical slots 1-3 (validated all-pairs, light mode) + neutral ink for the benchmark.
Aqua (#1baf7a) is below 3:1 contrast, so every series is also direct-labelled (relief rule) and the
numbers are in the report tables."""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from common14 import OUT, cboe, dense, put_index, yf_close

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e1"
C1, C2, C3 = "#2a78d6", "#eb6834", "#1baf7a"


def style(ax):
    ax.set_facecolor(SURFACE)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.grid(True, color=GRID, lw=1, ls="-")
    ax.tick_params(colors=INK2, labelsize=9)


def fig_cboe():
    spx = yf_close("^SP500TR")
    ser = {"S&P 500 total return": spx, "PUT (monthly ATM put-write)": put_index(),
           "CNDR (monthly iron condor)": dense(cboe("CNDR")), "BFLY (monthly iron butterfly)": dense(cboe("BFLY"))}
    start = pd.Timestamp("1996-08-02")
    fig, ax = plt.subplots(figsize=(9, 5), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    style(ax)
    colors = [INK2, C1, C2, C3]
    for (name, s), c in zip(ser.items(), colors):
        x = s.loc[start:]
        x = x / x.iloc[0]
        ax.plot(x.index, x.values, color=c, lw=2 if c != INK2 else 1.6, solid_capstyle="round", label=name)
        ax.annotate(f"{name.split(' (')[0]}  {x.iloc[-1]:.1f}x", xy=(x.index[-1], x.iloc[-1]), xytext=(6, 0),
                    textcoords="offset points", va="center", fontsize=8.5, color=INK)
    ax.set_yscale("log")
    ax.set_yticks([0.5, 1, 2, 4, 8, 16])
    ax.set_yticklabels(["0.5", "1", "2", "4", "8", "16"])
    ax.axvline(pd.Timestamp("2008-01-01"), color=INK2, lw=1)
    ax.text(pd.Timestamp("2008-03-01"), 13, "out-of-sample from 2008", fontsize=8.5, color=INK2)
    ax.set_title("Growth of $1 from Aug 1996 (log scale): real-price CBOE option-selling indices vs the S&P 500",
                 fontsize=10.5, color=INK, loc="left")
    ax.set_xlim(start, pd.Timestamp("2030-06-01"))
    ax.legend(frameon=False, fontsize=8.5, loc="upper left", labelcolor=INK)
    fig.tight_layout()
    fig.savefig(OUT / "fig_cboe_indices.png", facecolor=SURFACE)
    plt.close(fig)


def fig_model_cum():
    tr = pd.read_csv(OUT / "s03_trades_all.csv.gz", parse_dates=["entry", "exit"])
    sel = {"Put credit spread, trend filter only (F3)": ("PCS", "F3", C1),
           "Put credit spread, all prescribed filters (F5)": ("PCS", "F5", C2),
           "Iron condor, all prescribed filters (F5)": ("IC", "F5", C3)}
    fig, ax = plt.subplots(figsize=(9, 4.6), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    style(ax)
    for name, (s, f, c) in sel.items():
        g = tr[(tr.struct == s) & np.isclose(tr.sdelta, 0.2) & np.isclose(tr.width, 0.05) & (tr.dte == 45) &
               (tr.rule == "tp21") & np.isclose(tr.fill, 0.25)]
        g = g[g[f]].sort_values("exit")
        cum = g.set_index("exit").R.cumsum()
        ax.step(cum.index, cum.values, where="post", color=c, lw=2, label=name)
        ax.annotate(f"{cum.iloc[-1]:+.1f}", xy=(cum.index[-1], cum.iloc[-1]), xytext=(6, 0), textcoords="offset points",
                    va="center", fontsize=8.5, color=INK)
    ax.axvline(pd.Timestamp("2008-01-01"), color=INK2, lw=1)
    ax.axhline(0, color=INK2, lw=1)
    ax.set_ylabel("cumulative P&L, multiples of max loss per trade", fontsize=9, color=INK2)
    ax.set_title("Modelled 45-DTE SPX 20-delta / 5%-wide spreads, 50% take-profit or 21 DTE, base costs (approximation)",
                 fontsize=10, color=INK, loc="left")
    ax.legend(frameon=False, fontsize=8.5, loc="upper left", labelcolor=INK)
    fig.tight_layout()
    fig.savefig(OUT / "fig_model_spreads_cum.png", facecolor=SURFACE)
    plt.close(fig)


if __name__ == "__main__":
    fig_cboe()
    fig_model_cum()
    print("figures written")
