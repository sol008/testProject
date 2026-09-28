"""Sanity tests for track 18 code.  Run:  python3 test_18.py   (about 1-2 minutes)."""
from __future__ import annotations

import numpy as np

import paper_protocol as pp
import trade_model as tm
from sizing_v2 import OpenPosition, Portfolio, TradeSpec, book_and_candidate, delta_g, kelly_r


def test_trade_model_bounds():
    rng = np.random.default_rng(1)
    x = tm.simulate_trades(0.0, 20, "defined", 50_000, rng)
    assert x.min() >= -1.0 - tm.COST_DEF_R - 1e-12, "defined-risk loss must be capped at the premium"
    rng = np.random.default_rng(2)
    y = tm.simulate_trades(0.0, 20, "stop", 50_000, rng)
    assert y.mean() < 0.0, "zero drift + costs + gap slippage should lose money on average"
    assert np.quantile(-y, 0.99) > 1.5, "gap-through losses should push the P99 loss well past 1R"


def test_fill_model_is_conservative():
    bar = dict(O=100.0, H=101.0, L=98.9, C=99.5, V=1e6)
    q, px, _ = pp.fill_equity_entry(+1, 100, bar, "limit", 98.90)
    assert q == 0, "a limit that is only touched must not fill"
    px, note = pp.fill_equity_exit(+1, 99.5, 101.0, bar)
    assert note.startswith("stop"), "stop is assumed first when stop and target are both touched"
    q, px, fee, note = pp.fill_option(+1, 10, dict(bid=2.0, ask=2.1, bid_size=12, ask_size=7))
    assert q == 7 and abs(px - 2.08) < 1e-9, "no fills beyond the displayed size; mid + 0.6 x half-spread"
    q, *_ = pp.fill_option(+1, 5, dict(bid=0.5, ask=0.7, bid_size=50, ask_size=50))
    assert q == 0, "spreads wider than 10% of mid are refused"


def test_whole_portfolio_dg():
    cand = TradeSpec("t", "stop", 10, 0.011, np.sqrt(0.6), "long_equity_risk", 0.2, "rule", "etf",
                     True, 0.0, 0.03, "excess")
    book0, x0 = book_and_candidate(Portfolio(), cand, 0.1, n=20_000)
    assert abs(delta_g(book0, x0, 0.0, 0.0)) < 1e-15
    r0 = kelly_r(book0, x0, 0.0)
    busy = Portfolio(positions=[OpenPosition(TradeSpec("o", "stop", 20, 0.011, np.sqrt(0.6), "long_equity_risk",
                                                       0.2, "rule", "etf"), r=0.03, age=2)] * 3)
    book1, x1 = book_and_candidate(busy, cand, 0.1, n=20_000)
    r1 = kelly_r(book1, x1, 0.0)
    assert r1 <= r0 + 1e-9, "correlated open positions must not raise the joint Kelly size"
    assert delta_g(book1, x1, 0.0, r0) <= delta_g(book0, x0, 0.0, r0) + 1e-9


def test_ledger_detects_tampering():
    df = pp.ledger_demo()
    assert df.iloc[0]["Result"].startswith("True")
    assert df.iloc[1]["Result"].startswith("False")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
