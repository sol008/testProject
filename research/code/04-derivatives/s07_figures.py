"""Static figures for the track-04 report (single-axis panels, reference palette).

Reads the CSV outputs of s01-s03 and writes PNGs into output/.
Palette: reference categorical slots 1-3 (validated all-pairs), light surface.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from common import OUT  # noqa: E402

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"


def style(ax):
    ax.set_facecolor(SURFACE)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    for sp in ("left", "bottom"):
        ax.spines[sp].set_color(GRID)
        ax.spines[sp].set_linewidth(1)
    ax.tick_params(colors=INK2, labelsize=9, length=0)
    ax.grid(True, color=GRID, linewidth=0.8, linestyle="-")
    ax.set_axisbelow(True)


def fig_vrp():
    d = pd.read_csv(OUT / "vrp_panel.csv.gz", index_col=0, parse_dates=True).dropna(subset=["vrp"])
    m = d[["vix", "rv_fwd21"]].resample("ME").mean()
    share = d.neg.rolling(252).mean()
    fig, ax = plt.subplots(2, 1, figsize=(10, 6.6), sharex=True, gridspec_kw={"height_ratios": [3, 2]},
                           facecolor=SURFACE)
    style(ax[0]); style(ax[1])
    ax[0].plot(m.index, m.vix, color=S1, lw=1.6, solid_capstyle="round", label="VIX (implied, measured at t)")
    ax[0].plot(m.index, m.rv_fwd21, color=S2, lw=1.6, solid_capstyle="round",
               label="Realised vol over the next 21 trading days")
    ax[0].set_ylabel("Volatility, annualised %", color=INK2, fontsize=9)
    ax[0].legend(loc="upper left", frameon=False, fontsize=9, labelcolor=INK)
    ax[0].set_title("S&P 500: implied volatility has exceeded subsequent realised volatility 86% of days (1990-2026)",
                    loc="left", fontsize=11, color=INK)
    ax[1].plot(share.index, share, color=S1, lw=1.6)
    ax[1].axhline(d.neg.mean(), color=INK2, lw=1)
    ax[1].text(share.index[300], d.neg.mean() + 0.02, f"full-sample average {d.neg.mean():.0%}", color=INK2, fontsize=9)
    ax[1].set_ylabel("Share of days with\nVIX < realised (trailing 1y)", color=INK2, fontsize=9)
    ax[1].set_ylim(0, max(0.6, share.max() + 0.05))
    ax[1].yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    fig.text(0.01, 0.005, "Monthly means of daily data. Sources: CBOE VIX, S&P 500 (^GSPC via Yahoo). Code: s01_vrp_analysis.py",
             fontsize=8, color=INK2)
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    fig.savefig(OUT / "fig_vrp.png", dpi=140, facecolor=SURFACE)
    plt.close(fig)


def fig_option_returns():
    res = pd.read_csv(OUT / "options_backtest_summary.csv")
    st = pd.read_csv(OUT / "straddle_1m_screens.csv")
    b = res[(res.variant == "base") & (res.cond == "always") & (res.exit == "hold")]
    items = [("call", 1.10, 730, "2y call, 10% OTM"), ("call", 1.00, 365, "1y call, at-the-money"),
             ("call", 1.05, 365, "1y call, 5% OTM"), ("call", 1.10, 365, "1y call, 10% OTM"),
             ("call", 1.05, 91, "3m call, 5% OTM"), ("call", 1.10, 91, "3m call, 10% OTM"),
             ("put", 0.95, 365, "1y put, 5% OTM"), ("put", 0.90, 365, "1y put, 10% OTM"),
             ("put", 0.90, 91, "3m put, 10% OTM"), ("put", 0.80, 91, "3m put, 20% OTM")]
    labels, is_, oos = [], [], []
    for k, m, t, lab in items:
        sub = b[(b.kind == k) & (np.isclose(b.mny, m)) & (b.tenor == t)]
        labels.append(lab)
        is_.append(float(sub[sub.period.str.startswith("IS")]["mean"].iloc[0]))
        oos.append(float(sub[sub.period.str.startswith("OOS")]["mean"].iloc[0]))
    s = st[(st.pricing == "ATM IV = 0.88 x VIX") & (st.screen == "all days")]
    labels.append("1m straddle, at-the-money")
    is_.append(float(s[s.period.str.startswith("IS")]["mean"].iloc[0]))
    oos.append(float(s[s.period.str.startswith("OOS")]["mean"].iloc[0]))
    y = np.arange(len(labels))[::-1]
    fig, ax = plt.subplots(figsize=(10, 6.4), facecolor=SURFACE)
    style(ax)
    ax.grid(axis="y", visible=False)
    h = 0.36
    ax.barh(y + h / 2 + 0.01, is_, height=h, color=S1, label="In-sample: entries 1990-2007")
    ax.barh(y - h / 2 - 0.01, oos, height=h, color=S2, label="Out-of-sample: entries 2008-2025")
    ax.axvline(0, color=INK2, lw=1)
    ax.set_yticks(y)
    ax.set_yticklabels(labels, color=INK, fontsize=9)
    ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    ax.set_xlabel("Mean return per trade on premium paid, held to expiry", color=INK2, fontsize=9)
    ax.legend(loc="lower right", frameon=False, fontsize=9, labelcolor=INK)
    ax.set_title("Buying S&P 500 options (modelled prices): only long-dated calls made money on average",
                 loc="left", fontsize=11, color=INK)
    fig.text(0.01, 0.005, "Black-Scholes prices from VIX / VIX1Y plus the 2026-09-28 SPX skew, 2% half-spread; monthly entries. "
             "Approximation - see report. Code: s02.", fontsize=8, color=INK2)
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    fig.savefig(OUT / "fig_option_returns.png", dpi=140, facecolor=SURFACE)
    plt.close(fig)


def fig_letf():
    from s03_letf_analysis import index_tr_daily, short_rate_daily, simulate
    spx, rtr = index_tr_daily()
    rf = short_rate_daily(rtr.index)
    series = [("1x S&P 500 total return", rtr, S1), ("2x daily-reset (sim.)", simulate(rtr, rf, 2), S2),
              ("3x daily-reset (sim.)", simulate(rtr, rf, 3), S3)]
    fig, ax = plt.subplots(figsize=(10, 5.6), facecolor=SURFACE)
    style(ax)
    for lab, r, c in series:
        eq = (1 + r).cumprod()
        dd = (eq / eq.cummax() - 1).min()
        ax.plot(eq.index, eq, color=c, lw=1.6, label=f"{lab}: \\$1 grew to \\${eq.iloc[-1]:,.0f}; max drawdown {dd:.1%}")
    ax.set_yscale("log")
    ax.set_ylabel("Growth of $1 (log scale)", color=INK2, fontsize=9)
    ax.legend(loc="upper left", frameon=False, fontsize=9, labelcolor=INK)
    ax.set_title("Daily-reset leverage on the S&P 500, 1928-2026: 3x fell 99.9% (1929-32) and 98% (2000-09)",
                 loc="left", fontsize=11, color=INK)
    ax.set_xlim(eq.index[0], eq.index[-1] + pd.Timedelta(days=200))
    fig.text(0.01, 0.005, "Simulated: L x daily TR - (L-1) x (T-bill + 0.4%) - 0.9% fee. Validated vs UPRO/SSO (corr 0.998). Code: s03.",
             fontsize=8, color=INK2)
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    fig.savefig(OUT / "fig_letf_longrun.png", dpi=140, facecolor=SURFACE)
    plt.close(fig)


if __name__ == "__main__":
    fig_vrp()
    fig_option_returns()
    fig_letf()
    print("figures written")
