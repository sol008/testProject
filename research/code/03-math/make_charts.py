"""Static charts for the track-03 report (light surface, validated categorical palette)."""
from __future__ import annotations

import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from common import OPTION, RESULTS, TREND, hitting_reach_prob

SURFACE, INK, INK2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"   # validated: scripts/validate_palette.js (light)

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "font.family": "sans-serif", "font.size": 10, "text.color": INK, "axes.labelcolor": INK2,
    "xtick.color": MUTED, "ytick.color": MUTED, "axes.edgecolor": AXIS, "axes.linewidth": 1,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 1, "grid.linestyle": "-",
    "axes.spines.top": False, "axes.spines.right": False, "lines.linewidth": 2,
    "lines.solid_capstyle": "round", "lines.solid_joinstyle": "round",
})


def dot(ax, x, y, color, size=8):
    ax.plot([x], [y], "o", ms=size, color=color, mec=SURFACE, mew=2, zorder=5)


def fig1():
    c = np.linspace(0.01, 2.2, 500)
    growth = 100 * (2 * c - c ** 2)
    halve = np.where(c < 2, 100 * 0.5 ** (2 / c - 1), 100.0)
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8), sharex=True)
    ax = axes[0]
    ax.plot(c, growth, color=BLUE)
    ax.axhline(0, color=AXIS, lw=1)
    for cc, lab in ((0.25, "quarter Kelly: 44%"), (0.5, "half Kelly: 75%"), (1.0, "full Kelly: 100%"), (2.0, "2x Kelly: 0%")):
        y = 100 * (2 * cc - cc ** 2)
        dot(ax, cc, y, BLUE)
        ax.annotate(lab, (cc, y), textcoords="offset points", xytext=(6, -14 if cc != 2.0 else 6), color=INK2, fontsize=9)
    ax.set_title("Long-run growth rate, % of the maximum", loc="left", color=INK, fontsize=11)
    ax.set_ylabel("% of full-Kelly growth")
    ax.set_xlabel("Bet size as a multiple of the Kelly stake")
    ax.set_ylim(-50, 115)
    ax = axes[1]
    ax.plot(c, halve, color=BLUE)
    for cc in (0.25, 0.5, 1.0):
        y = 100 * 0.5 ** (2 / cc - 1)
        dot(ax, cc, y, BLUE)
        ax.annotate(f"{y:.1f}%" if y < 20 else f"{y:.0f}%", (cc, y), textcoords="offset points", xytext=(8, -2), color=INK2, fontsize=9)
    ax.set_title("Chance wealth ever halves (infinite horizon)", loc="left", color=INK, fontsize=11)
    ax.set_ylabel("Probability, %")
    ax.set_xlabel("Bet size as a multiple of the Kelly stake")
    ax.set_ylim(0, 105)
    fig.tight_layout()
    path = os.path.join(RESULTS, "fig1_growth_and_halving_vs_kelly_multiple.png")
    fig.savefig(path, dpi=160)
    plt.close(fig)
    return path


def fig2():
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.7))
    for ax, t, nmax in ((axes[0], TREND, 250), (axes[1], OPTION, 600)):
        n = np.arange(nmax + 1)
        for mult, col, lab in ((1.0, BLUE, "full Kelly"), (0.5, ORANGE, "half Kelly"), (0.25, AQUA, "quarter Kelly")):
            p = 100 * hitting_reach_prob(t, mult * t.kelly, nmax)
            i50 = int(np.nonzero(p >= 50)[0][0])
            i90 = int(np.nonzero(p >= 90)[0][0])
            ax.plot(n, p, color=col, label=f"{lab}: 50% by {n[i50]}, 90% by {n[i90]} trades")
            dot(ax, n[i50], p[i50], col)
        ax.axhline(50, color=AXIS, lw=1)
        ax.set_title(t.name, loc="left", color=INK, fontsize=11)
        ax.set_xlabel("Number of independent trades")
        ax.set_ylim(0, 100)
        ax.set_xlim(0, nmax)
        ax.legend(loc="upper left", bbox_to_anchor=(-0.02, -0.17), frameon=False, fontsize=8.5, labelcolor=INK2)
    axes[0].set_ylabel("P(wealth has touched 11x), %")
    fig.subplots_adjust(left=0.07, right=0.98, top=0.93, bottom=0.34, wspace=0.18)
    path = os.path.join(RESULTS, "fig2_prob_11x_vs_trades.png")
    fig.savefig(path, dpi=160)
    plt.close(fig)
    return path


def fig3():
    df = pd.read_csv(os.path.join(RESULTS, "d_barbell_vs_concentrated_vs_leverage.csv"))
    df = df[df["Years"] == 20]

    def num(s):
        s = str(s).replace("x", "").replace(",", "")
        return float(s)

    order = ["Cash (T-bills)", "Index 1x buy-and-hold", "Index 1.5x (margin, daily rebal.)", "Index 2x daily LETF",
             "Index 3x daily LETF", "Drawdown-governed index (<=1.5x, floor 50% of peak)",
             "Barbell 90/10: index + convex bets EV+65%", "Barbell 80/20: index + convex bets EV+65%",
             "Barbell 90/10: index + convex bets EV 0 (fair)", "Barbell 90/10: index + convex bets EV-30%",
             "Taleb barbell 90/10: T-bills + convex EV+65%", "All-in single stock, no skill",
             "All-in single stock, +5%/yr alpha"]
    scen = df["Scenario"].unique()
    fig = plt.figure(figsize=(10.5, 6.4))
    gs = fig.add_gridspec(1, 2, width_ratios=[5.2, 1.0], wspace=0.02)
    ax = fig.add_subplot(gs[0])
    tx = fig.add_subplot(gs[1], sharey=ax)
    tx.axis("off")
    for k, (s, col, off) in enumerate(((scen[0], BLUE, -0.17), (scen[1], ORANGE, 0.17))):
        sub = df[df["Scenario"] == s].set_index("Strategy").loc[order]
        y = np.arange(len(order))[::-1] + off
        lo = sub["5th pct W"].map(num).clip(lower=0.01)
        hi = sub["95th pct W"].map(num)
        med = sub["Median W"].map(num)
        ax.hlines(y, lo, hi, color=col, lw=2, label=s)
        ax.plot(med, y, "o", ms=8, color=col, mec=SURFACE, mew=2, zorder=5)
        for yy, p in zip(np.arange(len(order))[::-1], sub["P(>=11x)"]):
            tx.text(0.45 if k == 0 else 0.95, yy, p, va="center", ha="right", fontsize=9, color=INK2,
                    transform=tx.get_yaxis_transform())
    tx.text(0.45, len(order) - 0.45, "hist.", ha="right", va="bottom", fontsize=9, color=MUTED, transform=tx.get_yaxis_transform())
    tx.text(0.95, len(order) - 0.45, "muted", ha="right", va="bottom", fontsize=9, color=MUTED, transform=tx.get_yaxis_transform())
    tx.text(0.95, len(order) + 0.15, "P(>=11x)", ha="right", va="bottom", fontsize=9, color=INK2, transform=tx.get_yaxis_transform())
    ax.axvline(11, color=INK2, lw=1)
    ax.text(11, -0.9, " 11x goal", color=INK2, fontsize=9, va="bottom")
    ax.axvline(1, color=AXIS, lw=1)
    ax.set_xscale("log")
    ax.set_xlim(0.01, 1500)
    ax.set_ylim(-1.2, len(order) + 0.9)
    ax.set_xticks([0.01, 0.1, 1, 10, 100, 1000])
    ax.set_xticklabels(["0.01x", "0.1x", "1x", "10x", "100x", "1000x"])
    ax.set_yticks(np.arange(len(order))[::-1])
    short = {"Cash (T-bills)": "Cash (T-bills)", "Index 1x buy-and-hold": "Index 1x",
             "Index 1.5x (margin, daily rebal.)": "Index 1.5x (margin)", "Index 2x daily LETF": "Index 2x daily LETF",
             "Index 3x daily LETF": "Index 3x daily LETF",
             "Drawdown-governed index (<=1.5x, floor 50% of peak)": "Drawdown-governed index <=1.5x",
             "Barbell 90/10: index + convex bets EV+65%": "Barbell 90/10, convex EV +65%",
             "Barbell 80/20: index + convex bets EV+65%": "Barbell 80/20, convex EV +65%",
             "Barbell 90/10: index + convex bets EV 0 (fair)": "Barbell 90/10, convex EV 0",
             "Barbell 90/10: index + convex bets EV-30%": "Barbell 90/10, convex EV -30%",
             "Taleb barbell 90/10: T-bills + convex EV+65%": "T-bills 90 / convex 10, EV +65%",
             "All-in single stock, no skill": "Single stock, no skill",
             "All-in single stock, +5%/yr alpha": "Single stock, +5%/yr alpha"}
    ax.set_yticklabels([short[o] for o in order], color=INK2)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Wealth multiple after 20 years (log scale; 5th pct floored at 0.01x)")
    ax.set_title("20-year wealth multiple: median (dot) and 5th-95th percentile (line)", loc="left", color=INK, fontsize=11)
    ax.legend(loc="upper left", frameon=False, fontsize=8.5, labelcolor=INK2, bbox_to_anchor=(0, -0.09), ncol=1)
    fig.subplots_adjust(left=0.255, right=0.98, top=0.93, bottom=0.2)
    path = os.path.join(RESULTS, "fig3_20y_outcomes_by_strategy.png")
    fig.savefig(path, dpi=160)
    plt.close(fig)
    return path


if __name__ == "__main__":
    for f in (fig1, fig2, fig3):
        print(f())
