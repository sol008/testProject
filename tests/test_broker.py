"""Tests for the paper broker and fill model v1.0 (traderec/broker.py)."""
from __future__ import annotations

import copy
import dataclasses
import json

import pytest

from traderec.broker import PaperBroker
from traderec.config import load_config
from traderec.types import Fill, OrderIntent

D0, D1, D2, D3 = "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"


@pytest.fixture(scope="module")
def cfg():
    return load_config()


@pytest.fixture
def broker(cfg):
    return PaperBroker.new(cfg)


def intent(n: int = 1, **kw) -> OrderIntent:
    """An M1 SPY buy of $6,000 in the IRA, created on D0's close (overridable)."""
    base = dict(intent_id=f"O-{n}", trade_id="T-2026-09-28-M1", module="M1", account="ira", ticker="SPY",
                side="buy", created_date=D0, reason="entry", dollars=6000.0)
    base.update(kw)
    return OrderIntent(**base)


def buy(broker: PaperBroker, ticker: str = "SPY", dollars: float = 6000.0, open_: float = 500.0,
        date: str = D1, module: str = "M1", n: int = 1, account: str = "ira") -> Fill:
    """Queue a buy created the session before `date` and fill it at `open_`."""
    created = "2026-09-25" if date == "2026-09-28" else D0
    broker.queue(intent(n, ticker=ticker, dollars=dollars, module=module, account=account, created_date=created))
    (fill,) = broker.fill_pending(date, {ticker: open_})
    return fill


# ---------------------------------------------------------------------- accounts and queue


def test_new_broker_uses_enabled_accounts(broker):
    assert broker.cash("ira") == 70000.0 and broker.cash("taxable") == 30000.0
    with pytest.raises(KeyError):
        broker.cash("coinbase")  # enabled: false in account.yaml
    assert broker.positions() == [] and broker.pending() == [] and broker.cancelled == []
    assert broker.peak == 100000.0


def test_new_broker_includes_accounts_without_enabled_false(cfg):
    account = copy.deepcopy(cfg.account)
    account["accounts"]["coinbase"]["enabled"] = True
    account["accounts"]["coinbase"]["start_cash"] = 5000
    del account["accounts"]["taxable"]["start_cash"]
    b = PaperBroker.new(dataclasses.replace(cfg, account=account))
    assert b.cash("coinbase") == 5000.0 and b.cash("taxable") == 0.0 and b.cash("ira") == 70000.0


@pytest.mark.parametrize("change, match", [
    ({"account": "coinbase"}, "account"),
    ({"account": "roth"}, "account"),
    ({"side": "short"}, "side"),
    ({"ticker": "AAPL"}, "whitelist"),
    ({"module": "SHADOW:ST1B"}, "shadow"),
    ({"dollars": None}, "dollars"),
    ({"dollars": 0.0}, "dollars"),
    ({"dollars": float("nan")}, "dollars"),
    ({"side": "sell", "dollars": -5.0}, "dollars"),
    ({"close_all": True}, "close_all"),
])
def test_queue_rejects_invalid_orders(broker, change, match):
    with pytest.raises(ValueError, match=match):
        broker.queue(intent(**change))
    assert broker.pending() == []


def test_queue_accepts_whitelisted_orders_and_rejects_duplicate_ids(broker):
    broker.queue(intent(1))
    broker.queue(intent(2, side="sell", dollars=None, close_all=True, reason="exit_rule"))
    broker.queue(intent(3, ticker="BTC-USD", dollars=100.0))  # coinbase whitelist counts too
    with pytest.raises(ValueError, match="already pending"):
        broker.queue(intent(1))
    assert [o.intent_id for o in broker.pending()] == ["O-1", "O-2", "O-3"]


def test_queue_stores_a_copy(broker):
    order = intent(1)
    broker.queue(order)
    order.dollars = 1.0
    order.meta["x"] = 1
    listed = broker.pending()[0]
    assert listed.dollars == 6000.0 and listed.meta == {}
    listed.meta["y"] = 2  # pending() returns copies too
    assert broker.pending()[0].meta == {}


# ---------------------------------------------------------------------- fills


def test_buy_fills_at_open_plus_slippage(broker):
    fill = buy(broker, dollars=6000.0, open_=500.0)
    price = 500.0 * (1 + 1 / 1e4)  # SPY: 1 bp
    assert fill.side == "buy" and fill.price == pytest.approx(price) and fill.ref_price == 500.0
    assert fill.qty == pytest.approx(6000.0 / price) and fill.dollars == pytest.approx(6000.0)
    assert fill.slippage_bps == 1.0 and fill.model_version == "1.0" and fill.fill_date == D1
    assert (fill.intent_id, fill.trade_id, fill.module, fill.account, fill.ticker) == (
        "O-1", "T-2026-09-28-M1", "M1", "ira", "SPY")
    assert broker.cash("ira") == pytest.approx(64000.0)
    lot = broker.position("ira", "SPY", "M1")
    assert lot == {"account": "ira", "ticker": "SPY", "module": "M1", "qty": pytest.approx(fill.qty),
                   "cost": pytest.approx(6000.0), "opened": D1, "trade_id": "T-2026-09-28-M1", "dividends": 0.0}
    assert broker.last_fill_meta["O-1"] == {"realized_pnl": 0.0, "partial": False, "requested_dollars": 6000.0}
    assert broker.pending() == []


def test_default_slippage_applies_to_unlisted_tickers(broker):
    fill = buy(broker, ticker="TLT", dollars=1000.0, open_=90.0)
    assert fill.slippage_bps == 3.0 and fill.price == pytest.approx(90.0 * 1.0003)


def test_adding_to_a_lot_keeps_first_open_date_and_trade_id(broker):
    first = buy(broker, dollars=6000.0, open_=500.0, date=D1)
    broker.queue(intent(2, trade_id="T-2026-09-29-M1", created_date=D1, dollars=3000.0))
    (second,) = broker.fill_pending(D2, {"SPY": 510.0})
    lot = broker.position("ira", "SPY", "M1")
    assert lot["qty"] == pytest.approx(first.qty + second.qty) and lot["cost"] == pytest.approx(9000.0)
    assert lot["opened"] == D1 and lot["trade_id"] == "T-2026-09-28-M1"


def test_partial_sell_in_dollars(broker):
    bought = buy(broker, dollars=6000.0, open_=500.0)
    broker.queue(intent(2, side="sell", dollars=3000.0, created_date=D1, reason="rebalance"))
    (fill,) = broker.fill_pending(D2, {"SPY": 520.0})
    price = 520.0 * (1 - 1 / 1e4)
    qty = 3000.0 / price
    assert fill.side == "sell" and fill.price == pytest.approx(price) and fill.qty == pytest.approx(qty)
    assert fill.dollars == pytest.approx(3000.0)
    cost_out = 6000.0 * qty / bought.qty
    meta = broker.last_fill_meta["O-2"]
    assert meta["realized_pnl"] == pytest.approx(3000.0 - cost_out)
    assert meta["partial"] is False and meta["requested_dollars"] == 3000.0
    lot = broker.position("ira", "SPY", "M1")
    assert lot["qty"] == pytest.approx(bought.qty - qty) and lot["cost"] == pytest.approx(6000.0 - cost_out)
    assert broker.cash("ira") == pytest.approx(64000.0 + 3000.0)


def test_close_all_sells_the_whole_lot(broker):
    bought = buy(broker, dollars=6000.0, open_=500.0)
    broker.queue(intent(2, side="sell", dollars=None, close_all=True, created_date=D1, reason="exit_rule"))
    (fill,) = broker.fill_pending(D2, {"SPY": 510.0})
    proceeds = bought.qty * 510.0 * (1 - 1 / 1e4)
    assert fill.qty == pytest.approx(bought.qty) and fill.dollars == pytest.approx(proceeds)
    assert broker.position("ira", "SPY", "M1") is None and broker.positions() == []
    assert broker.cash("ira") == pytest.approx(64000.0 + proceeds)
    meta = broker.last_fill_meta["O-2"]
    assert meta["realized_pnl"] == pytest.approx(proceeds - 6000.0)
    assert meta["partial"] is False and meta["requested_dollars"] is None


def test_sell_dollars_above_the_lot_sell_the_lot_and_flag_partial(broker):
    bought = buy(broker, dollars=6000.0, open_=500.0)
    broker.queue(intent(2, side="sell", dollars=1e6, created_date=D1, reason="rebalance"))
    (fill,) = broker.fill_pending(D2, {"SPY": 500.0})
    assert fill.qty == pytest.approx(bought.qty)
    assert broker.position("ira", "SPY", "M1") is None
    assert broker.last_fill_meta["O-2"]["partial"] is True


def test_lots_are_separate_per_module(broker):
    buy(broker, dollars=6000.0, module="M1", n=1)
    buy(broker, dollars=10000.0, module="M2", n=2)
    assert len(broker.positions()) == 2
    assert [p["module"] for p in broker.positions(module="M2")] == ["M2"]
    assert len(broker.positions(account="ira")) == 2 and broker.positions(account="taxable") == []
    broker.queue(intent(3, side="sell", dollars=None, close_all=True, created_date=D1, module="M1"))
    broker.fill_pending(D2, {"SPY": 500.0})
    assert broker.position("ira", "SPY", "M1") is None
    assert broker.position("ira", "SPY", "M2")["cost"] == pytest.approx(10000.0)


def test_buy_is_capped_at_cash_and_flagged_partial(broker):
    broker.queue(intent(1, dollars=80000.0))
    (fill,) = broker.fill_pending(D1, {"SPY": 500.0})
    assert fill.dollars == pytest.approx(70000.0) and fill.qty == pytest.approx(70000.0 / 500.05)
    assert broker.cash("ira") == 0.0
    assert broker.last_fill_meta["O-1"] == {"realized_pnl": 0.0, "partial": True, "requested_dollars": 80000.0}
    assert broker.cash("taxable") == 30000.0  # other accounts are untouched


def test_buy_with_no_cash_is_cancelled(broker):
    buy(broker, dollars=70000.0)
    broker.queue(intent(2, ticker="QQQ", dollars=1000.0, created_date=D1))
    assert broker.fill_pending(D2, {"QQQ": 400.0}) == []
    assert broker.pending() == [] and broker.cancelled[-1].intent_id == "O-2"
    assert "cash" in broker.cancelled[-1].meta["cancel_reason"]


def test_sells_fill_before_buys(broker):
    buy(broker, dollars=70000.0, open_=500.0)  # all IRA cash in SPY
    broker.queue(intent(2, ticker="QQQ", dollars=20000.0, created_date=D1, module="M2"))
    broker.queue(intent(3, side="sell", dollars=25000.0, created_date=D1, module="M1", reason="rebalance"))
    fills = broker.fill_pending(D2, {"SPY": 500.0, "QQQ": 400.0})
    assert [f.side for f in fills] == ["sell", "buy"]
    assert fills[1].dollars == pytest.approx(20000.0)
    assert broker.last_fill_meta["O-2"]["partial"] is False
    assert broker.cash("ira") == pytest.approx(5000.0)


def test_sell_without_a_lot_is_cancelled(broker):
    broker.queue(intent(1, side="sell", dollars=None, close_all=True, reason="exit_rule"))
    assert broker.fill_pending(D1, {"SPY": 500.0}) == []
    (cancelled,) = broker.cancelled
    assert cancelled.intent_id == "O-1" and cancelled.meta["cancel_reason"] == "no position to sell"
    assert cancelled.meta["cancel_date"] == D1 and broker.pending() == []


def test_missing_open_keeps_the_order_once_then_cancels_it(broker):
    broker.queue(intent(1))
    assert broker.fill_pending(D1, {}) == []  # ticker absent
    (waiting,) = broker.pending()
    assert waiting.meta["missed_opens"] == 1 and broker.cancelled == []
    assert broker.fill_pending(D2, {"SPY": float("nan")}) == []  # NaN counts as missing
    assert broker.pending() == []
    (cancelled,) = broker.cancelled
    assert cancelled.meta["missed_opens"] == 2 and cancelled.meta["cancel_date"] == D2
    assert "no opening price" in cancelled.meta["cancel_reason"]
    state = broker.to_state()
    assert state["cancelled"][0]["intent_id"] == "O-1" and state["pending"] == []
    assert broker.cash("ira") == 70000.0


def test_order_fills_after_one_missing_open(broker):
    broker.queue(intent(1))
    assert broker.fill_pending(D1, {"QQQ": 400.0}) == []
    (fill,) = broker.fill_pending(D2, {"SPY": 500.0})
    assert fill.fill_date == D2 and broker.pending() == [] and broker.cancelled == []


def test_orders_fill_only_after_their_created_date(broker):
    """Integrator rule: fill only intents with created_date strictly before `date`; later ones stay untouched."""
    broker.queue(intent(1, created_date=D0))
    broker.queue(intent(2, created_date=D1, ticker="QQQ", dollars=4000.0))
    broker.queue(intent(3, created_date=D2, ticker="GLD", dollars=2000.0))

    # Session D1 (catching up after a missed run): only O-1 is eligible. The QQQ and GLD opens are absent,
    # yet O-2 and O-3 are not eligible, so they must not count a missed open.
    fills = broker.fill_pending(D1, {"SPY": 500.0})
    assert [f.intent_id for f in fills] == ["O-1"]
    assert [(o.intent_id, o.meta) for o in broker.pending()] == [("O-2", {}), ("O-3", {})]

    # Session D2: O-2 becomes eligible; O-3 (created on D2's close) still waits, untouched.
    fills = broker.fill_pending(D2, {"SPY": 505.0, "QQQ": 400.0, "GLD": 240.0})
    assert [(f.intent_id, f.fill_date) for f in fills] == [("O-2", D2)]
    assert [(o.intent_id, o.meta) for o in broker.pending()] == [("O-3", {})]

    # Session D3: O-3 fills; nothing was ever cancelled.
    fills = broker.fill_pending(D3, {"GLD": 241.0})
    assert [(f.intent_id, f.fill_date) for f in fills] == [("O-3", D3)]
    assert broker.pending() == [] and broker.cancelled == []


def test_ineligible_sell_without_lot_is_not_cancelled_early(broker):
    broker.queue(intent(1, side="sell", dollars=None, close_all=True, created_date=D1))
    assert broker.fill_pending(D1, {"SPY": 500.0}) == []
    assert [o.meta for o in broker.pending()] == [{}] and broker.cancelled == []


def test_last_fill_meta_is_reset_each_call(broker):
    buy(broker)
    assert "O-1" in broker.last_fill_meta
    broker.fill_pending(D2, {"SPY": 500.0})
    assert broker.last_fill_meta == {}


# ---------------------------------------------------------------------- interest


def test_accrue_interest_on_positive_cash(broker):
    total = broker.accrue_interest("2026-09-25", "2026-09-28", 0.0365)  # Fri -> Mon: 3 calendar days
    assert total == pytest.approx(70000 * 0.0365 * 3 / 365 + 30000 * 0.0365 * 3 / 365)
    assert total == pytest.approx(30.0)
    assert broker.cash("ira") == pytest.approx(70021.0) and broker.cash("taxable") == pytest.approx(30009.0)


def test_accrue_interest_skips_empty_accounts_and_clamps_dates(broker):
    buy(broker, dollars=70000.0)
    assert broker.accrue_interest(D1, D2, 0.0365) == pytest.approx(30000 * 0.0365 / 365)
    assert broker.cash("ira") == 0.0
    before = broker.to_state()["cash"]
    assert broker.accrue_interest(D2, D2, 0.05) == 0.0
    assert broker.accrue_interest(D2, D1, 0.05) == 0.0
    assert broker.to_state()["cash"] == before


# ---------------------------------------------------------------------- dividends


def test_apply_dividend_credits_every_entitled_lot(cfg, broker):
    spy_m1 = buy(broker, dollars=6000.0, open_=500.0, module="M1", n=1, date=D1)
    spy_tax = buy(broker, dollars=5000.0, open_=500.0, module="M2", n=2, date=D1, account="taxable")
    ief = buy(broker, ticker="IEF", dollars=4000.0, open_=95.0, module="M2", n=3, date=D1)
    broker.queue(intent(4, created_date=D1, dollars=3000.0, module="M2"))  # bought at the ex-date open
    broker.fill_pending(D2, {"SPY": 498.0})
    cash_before = {a: broker.cash(a) for a in ("ira", "taxable")}

    total = broker.apply_dividend(D2, "SPY", 1.5)  # ex-date D2

    assert total == pytest.approx((spy_m1.qty + spy_tax.qty) * 1.5)
    assert broker.cash("ira") == pytest.approx(cash_before["ira"] + spy_m1.qty * 1.5)
    assert broker.cash("taxable") == pytest.approx(cash_before["taxable"] + spy_tax.qty * 1.5)
    assert broker.position("ira", "SPY", "M1")["dividends"] == pytest.approx(spy_m1.qty * 1.5)
    assert broker.position("taxable", "SPY", "M2")["dividends"] == pytest.approx(spy_tax.qty * 1.5)
    assert broker.position("ira", "SPY", "M2")["dividends"] == 0.0  # opened on the ex-date: not entitled
    assert broker.position("ira", "IEF", "M2")["dividends"] == 0.0 and ief.qty > 0

    # Non-positive or NaN amounts are no-ops.
    state = broker.to_state()
    for per_share in (0.0, -1.0, float("nan")):
        assert broker.apply_dividend(D3, "SPY", per_share) == 0.0
    assert broker.to_state() == state

    # Income survives a state round trip and is released pro rata on a sell (price P&L stays separate).
    restored = PaperBroker.from_state(json.loads(json.dumps(state)), cfg)
    assert restored.position("ira", "SPY", "M1")["dividends"] == pytest.approx(spy_m1.qty * 1.5)
    restored.queue(intent(5, side="sell", dollars=None, close_all=True, created_date=D2, module="M1"))
    (sell,) = restored.fill_pending(D3, {"SPY": 500.0})
    meta = restored.last_fill_meta["O-5"]
    assert meta["dividends"] == pytest.approx(spy_m1.qty * 1.5)
    assert meta["realized_pnl"] == pytest.approx(sell.dollars - 6000.0)


def test_lots_from_old_state_default_to_zero_dividends(cfg, broker):
    buy(broker)
    state = broker.to_state()
    del state["lots"]["ira|SPY|M1"]["dividends"]
    restored = PaperBroker.from_state(state, cfg)
    assert restored.position("ira", "SPY", "M1")["dividends"] == 0.0


# ---------------------------------------------------------------------- marks


def test_mark_values_accounts_at_the_close(broker):
    fill = buy(broker, dollars=6000.0, open_=500.0)
    m = broker.mark(D1, {"SPY": 510.0, "QQQ": 400.0})
    value = fill.qty * 510.0
    assert m["date"] == D1
    assert m["by_account"]["ira"] == {"cash": pytest.approx(64000.0), "positions_value": pytest.approx(value),
                                      "equity": pytest.approx(64000.0 + value)}
    assert m["by_account"]["taxable"] == {"cash": 30000.0, "positions_value": 0.0, "equity": 30000.0}
    assert isinstance(m["by_account"]["taxable"]["positions_value"], float)
    assert m["nav"] == pytest.approx(94000.0 + value)
    assert broker.market_value("ira", "SPY", "M1", 510.0) == pytest.approx(value)
    assert broker.market_value("ira", "QQQ", "M1", 510.0) == 0.0


def test_mark_falls_back_to_last_close_then_cost(broker):
    fill = buy(broker, dollars=6000.0, open_=500.0)
    broker.mark(D1, {"SPY": 510.0})
    m = broker.mark(D2, {})  # no SPY close today -> the last marked close
    assert m["by_account"]["ira"]["positions_value"] == pytest.approx(fill.qty * 510.0)
    m = broker.mark(D3, {"SPY": float("nan")})
    assert m["by_account"]["ira"]["positions_value"] == pytest.approx(fill.qty * 510.0)
    # A new lot that has never had a close is valued at its cost basis.
    broker.queue(intent(2, ticker="GLD", dollars=2000.0, created_date=D2, module="M2"))
    broker.fill_pending(D3, {"GLD": 240.0})
    m = broker.mark(D3, {"SPY": 520.0})
    assert m["by_account"]["ira"]["positions_value"] == pytest.approx(fill.qty * 520.0 + 2000.0)


def test_last_close_is_dropped_when_the_position_closes(broker):
    buy(broker)
    broker.mark(D1, {"SPY": 510.0})
    broker.queue(intent(2, side="sell", dollars=None, close_all=True, created_date=D1))
    broker.fill_pending(D2, {"SPY": 505.0})
    broker.mark(D2, {"SPY": 506.0})
    assert broker.to_state()["last_close"] == {}


def test_mark_tracks_peak_drawdown_and_history(broker):
    fill = buy(broker, dollars=50000.0, open_=500.0)
    cash = 20000.0 + 30000.0
    up = broker.mark(D1, {"SPY": 600.0})
    nav_up = cash + fill.qty * 600.0
    assert up["nav"] == pytest.approx(nav_up) and up["peak"] == pytest.approx(nav_up) and up["drawdown"] == 0.0
    down = broker.mark(D2, {"SPY": 450.0})
    nav_down = cash + fill.qty * 450.0
    assert down["peak"] == pytest.approx(nav_up)
    assert down["drawdown"] == pytest.approx(1 - nav_down / nav_up)
    assert broker.history == [{"date": D1, "nav": pytest.approx(nav_up)}, {"date": D2, "nav": pytest.approx(nav_down)}]
    again = broker.mark(D2, {"SPY": 460.0})  # re-marking a date replaces its history entry
    assert len(broker.history) == 2 and broker.history[-1]["nav"] == pytest.approx(again["nav"])


def test_first_mark_below_start_shows_drawdown_from_starting_cash(broker):
    buy(broker, dollars=10000.0, open_=500.0)
    m = broker.mark(D1, {"SPY": 500.0})  # only the 1 bp slippage is lost
    assert m["peak"] == 100000.0
    assert m["drawdown"] == pytest.approx(1 - m["nav"] / 100000.0) and m["drawdown"] > 0


# ---------------------------------------------------------------------- state


def test_state_round_trip(cfg, broker):
    buy(broker, dollars=6000.0, open_=500.0)
    broker.queue(intent(2, ticker="QQQ", dollars=3000.0, created_date=D1, module="M2"))
    broker.queue(intent(3, ticker="GLD", dollars=2000.0, created_date=D1, module="M2"))
    broker.fill_pending(D2, {"QQQ": 400.0})  # GLD misses its open once
    broker.queue(intent(4, side="sell", dollars=None, close_all=True, created_date=D2, ticker="IEF"))
    broker.fill_pending(D3, {})  # O-4 cancelled (no lot); O-3 cancelled (second missed open)
    broker.queue(intent(5, ticker="IEF", dollars=1000.0, created_date=D3, module="M2"))
    broker.accrue_interest(D2, D3, 0.04)
    broker.mark(D3, {"SPY": 505.0, "QQQ": 401.0})

    state = broker.to_state()
    restored = PaperBroker.from_state(json.loads(json.dumps(state)), cfg)
    assert restored.to_state() == state
    assert restored.pending()[0].intent_id == "O-5"
    assert [o.intent_id for o in restored.cancelled] == ["O-4", "O-3"]
    assert restored.peak == broker.peak and restored.history == broker.history

    # Both brokers keep behaving identically.
    opens, closes = {"IEF": 95.0}, {"SPY": 507.0, "QQQ": 399.0}
    assert broker.fill_pending("2026-10-02", opens) == restored.fill_pending("2026-10-02", opens)
    assert broker.mark("2026-10-02", closes) == restored.mark("2026-10-02", closes)


def test_state_is_a_copy(broker):
    buy(broker)
    state = broker.to_state()
    state["lots"]["ira|SPY|M1"]["qty"] = 0.0
    state["cash"]["ira"] = 0.0
    assert broker.position("ira", "SPY", "M1")["qty"] > 0 and broker.cash("ira") > 0
