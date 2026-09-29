"""Reproduce every number in research/29-single-stock-momentum.md.

    python run_all.py            # ~5 minutes after the one-off price download (~4 minutes, ~1,200 tickers)

Order matters: the bias audit measures turnover and stock-specific volatility on the S&P 500 panel, and the
Ken French long-run module uses them (results/turnover_measured.json).  All outputs go to ./results (<1 MB).
"""
from __future__ import annotations

import sys
import time

sys.dont_write_bytecode = True

import pandas as pd

import data29 as D
import engine29 as E
import etf29
import kf_long_run
import studies29 as S

FMT = lambda v: f"{v:.3f}"  # noqa: E731


def main() -> None:
    t0 = time.time()
    D.prices()
    P = S.get_panel()
    lines = [f"price panel through {P.dates[-1].date()}, {len(P.tickers)} tickers; decisions {len(P.dec)} weeks"]
    b = S.bias(P)
    lines += ["== BIAS: coverage", b["coverage"].to_string(index=False),
              "== BIAS: equal weight vs RSP (2003-06..2026-08)", b["eqw"].to_string(index=False, float_format=FMT),
              "== BIAS: monthly momentum portfolios vs Ken French (2000-01..2026-08)",
              b["mom_vs_kf"].to_string(index=False, float_format=FMT), f"turnover/idio: {b['turnover']}"]
    kf_long_run.main()
    etf = etf29.main()
    lines += ["== LIVE ETFs", etf.to_string(index=False, float_format=FMT)]
    g = S.grid(P)
    cols = ["label", "cagr", "spy_cagr", "excess", "vol", "beta", "maxdd", "entries_per_year", "median_hold_days",
            "continued_share", "max_orders_week", "cap_breaches"]
    lines += ["== GRID (2000-01..2026-09, 0.10%/side unless noted)", g[cols].to_string(index=False, float_format=FMT)]
    rules = {
        "base: 12-1, K=8, PIT": S.BASE,
        "12-1, K=4, PIT": E.Params(K=4),
        "12-1, K=12, PIT": E.Params(K=12),
        "12-1, K=8, PIT, trend exit": E.Params(trend="exit"),
        "12-1, K=8, mega-cap top 50": E.Params(universe="mega"),
        "12-1, K=8, SURVIVOR (biased)": E.Params(universe="survivor"),
    }
    dist = S.distribution(P, rules)
    lines += ["== DISTRIBUTION of 5/10-year excess vs SPY", dist.to_string(index=False, float_format=FMT)]
    lv = S.leverage(P)
    lines += ["== LEVERAGE", lv.to_string(index=False, float_format=FMT)]
    tx = S.taxes(P)
    lines += ["== TAXES (taxable account, illustrative rates)", tx.to_string(index=False, float_format=FMT)]
    # the book as of the latest close (what the first email would say), base rule
    res = E.run(P, S.BASE)
    eq = res["equity"]
    yr = pd.DataFrame({"base": eq, "SPY": E.spy_equity(P, eq)}).resample("YE").last()
    yr = pd.concat([pd.DataFrame({"base": [eq.iloc[0]], "SPY": [eq.iloc[0]]}, index=[eq.index[0]]), yr]).pct_change().dropna()
    yr["excess"] = yr["base"] - yr["SPY"]
    yr.index = yr.index.year
    yr.to_csv(D.RESULTS / "base_calendar_years.csv", float_format="%.4f")
    w10 = (eq / eq.shift(10) - 1).min()
    s10 = (E.spy_equity(P, eq) / E.spy_equity(P, eq).shift(10) - 1).min()
    lines += [f"== BASE RULE worst 10-session loss: book {w10:.3f}, SPY {s10:.3f}"]
    lines += ["== BASE RULE calendar-year returns", yr.to_string(float_format=FMT),
              f"years ahead of SPY: {(yr.excess > 0).sum()} of {len(yr)}"]
    lines += [f"== BASE RULE BOOK at {P.dates[-1].date()}: {res['open_positions']}",
              f"last 8 trades:\n{res['trades'].tail(8).assign(entry=lambda x: P.dates[x.entry].date, exit=lambda x: P.dates[x.exit].date).to_string(index=False)}"]
    lines.append(f"runtime {time.time() - t0:.0f}s")
    (D.RESULTS / "summary.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    main()
