"""Paper broker: fills queued dollar market orders at the next open with fill model v1.0 (design §3a, §7).

Fill model v1.0 (frozen for the paper phase):

- price = open * (1 + s * slippage_bps / 1e4), with s = +1 for buys and -1 for sells and the bps per ticker
  from `fills.slippage_bps` in constitution.yaml;
- sells fill before buys, so sale proceeds can fund the same morning's buys;
- buys are capped at the account's cash (a partial fill is flagged in `last_fill_meta`);
- an order never fills at the open of its own signal date or earlier (no look-ahead);
- a missing open keeps the order pending once; the second miss cancels it.

Positions are lots keyed by "account|ticker|module", so the same ticker held by two modules stays in two lots.
`cost` is the lot's total cost basis including slippage; `dividends` is the cash income credited to the lot by
`apply_dividend`, kept apart so reports can split price P&L from income.
"""
from __future__ import annotations

import copy
import math
import numbers
from typing import Any

import pandas as pd

from traderec.config import Config
from traderec.types import Fill, OrderIntent

DUST_QTY = 1e-9            # lots below this many shares are removed
MAX_MISSED_OPENS = 2       # the second missing open cancels the order
STATE_SCHEMA = 1


def lot_key(account: str, ticker: str, module: str) -> str:
    """Key of the lot holding `ticker` for `module` in `account`."""
    return f"{account}|{ticker}|{module}"


def _is_positive_number(x: Any) -> bool:
    """True for a finite real number above zero, numpy scalars included (bools, None, NaN and pd.NA are not)."""
    return isinstance(x, numbers.Real) and not isinstance(x, bool) and math.isfinite(x) and x > 0


def _day(d: str) -> pd.Timestamp:
    """A YYYY-MM-DD date string as a normalised Timestamp, for date comparisons and day counts."""
    return pd.Timestamp(d).normalize()


class PaperBroker:
    """Cash, lots and the order queue of every paper account. Build with `new()` or `from_state()`."""

    def __init__(self, cfg: Config, cash: dict[str, float]) -> None:
        self.cfg = cfg
        self._cash: dict[str, float] = {a: float(c) for a, c in cash.items()}
        self._lots: dict[str, dict[str, Any]] = {}
        self._pending: list[OrderIntent] = []
        self._last_close: dict[str, float] = {}
        self.cancelled: list[OrderIntent] = []   # meta carries "cancel_reason" and "cancel_date"
        self.history: list[dict[str, Any]] = []  # [{"date", "nav"}], one entry per marked date
        self.peak: float = sum(self._cash.values())
        self.last_fill_meta: dict[str, dict[str, Any]] = {}  # per intent_id, from the last fill_pending()

    # ------------------------------------------------------------------ construction and state

    @classmethod
    def new(cls, cfg: Config) -> "PaperBroker":
        """Fresh broker: one cash balance per account in account.yaml whose `enabled` is not false.

        The NAV peak starts at the total starting cash.
        """
        cash = {
            name: float(acct.get("start_cash", 0))
            for name, acct in cfg.account["accounts"].items()
            if acct.get("enabled", True) is not False
        }
        return cls(cfg, cash)

    @classmethod
    def from_state(cls, state: dict, cfg: Config) -> "PaperBroker":
        """Rebuild a broker from `to_state()` output. The accounts are those in the state, not the config."""
        broker = cls(cfg, state["cash"])
        broker._lots = copy.deepcopy(state.get("lots", {}))
        for lot in broker._lots.values():
            lot.setdefault("dividends", 0.0)
        broker._pending = [OrderIntent.from_dict(copy.deepcopy(d)) for d in state.get("pending", [])]
        broker.cancelled = [OrderIntent.from_dict(copy.deepcopy(d)) for d in state.get("cancelled", [])]
        broker._last_close = {t: float(p) for t, p in state.get("last_close", {}).items()}
        broker.history = copy.deepcopy(state.get("history", []))
        broker.peak = float(state.get("peak", broker.peak))
        return broker

    def to_state(self) -> dict:
        """JSON-serialisable snapshot of the broker (a deep copy)."""
        return {
            "schema": STATE_SCHEMA,
            "cash": dict(self._cash),
            "lots": copy.deepcopy(self._lots),
            "pending": [o.to_dict() for o in self._pending],
            "cancelled": [o.to_dict() for o in self.cancelled],
            "last_close": dict(self._last_close),
            "history": copy.deepcopy(self.history),
            "peak": self.peak,
        }

    # ------------------------------------------------------------------ queries

    def cash(self, account: str) -> float:
        """Cash in `account`. Raises KeyError for an unknown or disabled account."""
        if account not in self._cash:
            raise KeyError(f"unknown account {account!r}")
        return self._cash[account]

    def positions(self, account: str | None = None, module: str | None = None) -> list[dict]:
        """Copies of the open lots, optionally filtered by account and/or module, sorted by lot key.

        Each lot: {"account", "ticker", "module", "qty", "cost", "opened", "trade_id", "dividends"}.
        """
        return [
            dict(lot) for _, lot in sorted(self._lots.items())
            if (account is None or lot["account"] == account) and (module is None or lot["module"] == module)
        ]

    def position(self, account: str, ticker: str, module: str) -> dict | None:
        """A copy of one lot, or None if the module holds nothing in that ticker and account."""
        lot = self._lots.get(lot_key(account, ticker, module))
        return dict(lot) if lot else None

    def market_value(self, account: str, ticker: str, module: str, price: float) -> float:
        """qty * price for one lot; 0.0 if there is no such lot."""
        lot = self._lots.get(lot_key(account, ticker, module))
        return lot["qty"] * price if lot else 0.0

    def pending(self) -> list[OrderIntent]:
        """Copies of the orders waiting for an open, in queue order."""
        return [OrderIntent.from_dict(o.to_dict()) for o in self._pending]

    # ------------------------------------------------------------------ orders and fills

    def queue(self, intent: OrderIntent) -> None:
        """Store a copy of `intent` until the next `fill_pending()`.

        Raises ValueError for a shadow module, an unknown or disabled account, a side other than buy/sell, a
        ticker off the whitelist, close_all on a buy, a missing or non-positive `dollars` (unless close_all),
        or an intent_id that is already pending.
        """
        problem = self._order_problem(intent)
        if problem:
            raise ValueError(f"order {intent.intent_id}: {problem}")
        self._pending.append(OrderIntent.from_dict(intent.to_dict()))

    def fill_pending(self, date: str, opens: dict[str, float]) -> list[Fill]:
        """Fill the pending orders at the opens of `date` (sells first, then buys; queue order within each).

        `opens` maps ticker -> official open; an absent, NaN or non-positive open counts as missing. Returns
        the fills; `last_fill_meta[intent_id]` gets {"realized_pnl", "partial", "requested_dollars"} for each
        (plus "dividends" for sells; realized_pnl is 0.0 for buys).
        Cancelled orders move to `cancelled` with `meta["cancel_reason"]` and `meta["cancel_date"]`: a sell
        with no lot, a buy with no cash, or a second missing open (`meta["missed_opens"]` counts the misses).

        Only orders with `created_date` strictly before `date` are eligible: an order is created after the
        close of its `created_date`, so its first possible fill is the next session's open. Orders that are
        not yet eligible stay pending untouched (no missed-open count, no cancellation). After a missed run,
        catch up by calling this once per session in date order.
        """
        self.last_fill_meta = {}
        fills: list[Fill] = []
        keep: set[str] = set()
        sells = [o for o in self._pending if o.side == "sell"]
        buys = [o for o in self._pending if o.side == "buy"]
        for intent in sells + buys:
            status, fill = self._process(intent, date, opens)
            if status == "pending":
                keep.add(intent.intent_id)
            elif fill is not None:
                fills.append(fill)
        self._pending = [o for o in self._pending if o.intent_id in keep]
        return fills

    def accrue_interest(self, from_date: str, to_date: str, annual_rate: float) -> float:
        """Add simple interest on positive cash for the calendar days in (from_date, to_date].

        Interest per account = cash * annual_rate * days / 365. Returns the total added; 0.0 when
        to_date <= from_date.
        """
        days = (_day(to_date) - _day(from_date)).days
        if days <= 0:
            return 0.0
        rate = float(annual_rate)
        total = 0.0
        for account, cash in self._cash.items():
            if cash > 0:
                interest = cash * rate * days / 365.0
                self._cash[account] = cash + interest
                total += interest
        return total

    def apply_dividend(self, date: str, ticker: str, per_share: float) -> float:
        """Credit a cash distribution with ex-date `date`: qty * per_share per lot of `ticker`, in any module.

        The amount goes to the lot's account cash and to the lot's `dividends`. Returns the total credited;
        a per_share that is not above 0 (or NaN) is a no-op returning 0.0. Entitlement follows the ex-date:
        lots opened on or after `date` (bought at the ex-date open or later) are skipped. Call it before
        `fill_pending(date, ...)` so shares sold at the ex-date open still collect it.
        """
        if not _is_positive_number(per_share):
            return 0.0
        total = 0.0
        for lot in self._lots.values():
            if lot["ticker"] != ticker or _day(lot["opened"]) >= _day(date):
                continue
            amount = lot["qty"] * float(per_share)
            lot["dividends"] = lot.get("dividends", 0.0) + amount
            self._cash[lot["account"]] += amount
            total += amount
        return total

    def mark(self, date: str, closes: dict[str, float]) -> dict:
        """Value every account at the closes of `date`, update the NAV peak and append {date, nav} to history.

        A missing close falls back to the last close marked for that ticker, else to the lot's cost basis.
        Returns {"date", "nav", "by_account": {acct: {"cash", "positions_value", "equity"}}, "peak",
        "drawdown"}, with drawdown = 1 - nav / peak. Marking the same date again replaces its history entry.
        """
        prices = self._update_last_closes(closes)
        by_account: dict[str, dict[str, float]] = {}
        for account, cash in self._cash.items():
            value = sum((self._lot_value(lot, prices) for lot in self._lots.values() if lot["account"] == account), 0.0)
            by_account[account] = {"cash": cash, "positions_value": value, "equity": cash + value}
        nav = sum(a["equity"] for a in by_account.values())
        self.peak = max(self.peak, nav)
        drawdown = 1.0 - nav / self.peak if self.peak > 0 else 0.0
        entry = {"date": date, "nav": nav}
        if self.history and self.history[-1]["date"] == date:
            self.history[-1] = entry
        else:
            self.history.append(entry)
        return {"date": date, "nav": nav, "by_account": by_account, "peak": self.peak, "drawdown": drawdown}

    # ------------------------------------------------------------------ internals

    def _order_problem(self, intent: OrderIntent) -> str | None:
        """Why `intent` cannot be queued, or None if it can."""
        if intent.module.startswith("SHADOW:"):
            return "shadow modules never reach the broker"
        if intent.account not in self._cash:
            return f"unknown or disabled account {intent.account!r}"
        if intent.side not in ("buy", "sell"):
            return f"side must be 'buy' or 'sell', not {intent.side!r}"
        if not self.cfg.is_whitelisted(intent.ticker):
            return f"ticker {intent.ticker!r} is not on the whitelist"
        if intent.side == "buy" and intent.close_all:
            return "close_all applies to sells only"
        if not intent.close_all and not _is_positive_number(intent.dollars):
            return "dollars must be a positive amount unless close_all is set"
        if any(o.intent_id == intent.intent_id for o in self._pending):
            return "an order with this intent_id is already pending"
        return None

    def _process(self, intent: OrderIntent, date: str, opens: dict[str, float]) -> tuple[str, Fill | None]:
        """Fill, defer or cancel one order. Returns ("filled", fill), ("pending", None) or ("cancelled", None)."""
        if _day(date) <= _day(intent.created_date):
            return "pending", None
        key = lot_key(intent.account, intent.ticker, intent.module)
        if intent.side == "sell" and key not in self._lots:
            return self._cancel(intent, date, "no position to sell")
        ref = opens.get(intent.ticker)
        if not _is_positive_number(ref):
            missed = int(intent.meta.get("missed_opens", 0)) + 1
            intent.meta["missed_opens"] = missed
            if missed >= MAX_MISSED_OPENS:
                return self._cancel(intent, date, f"no opening price on {missed} sessions")
            return "pending", None
        if intent.side == "sell":
            return "filled", self._fill_sell(intent, date, float(ref))
        if self._cash[intent.account] <= 0:
            return self._cancel(intent, date, "no cash in the account")
        return "filled", self._fill_buy(intent, date, float(ref))

    def _cancel(self, intent: OrderIntent, date: str, reason: str) -> tuple[str, None]:
        intent.meta["cancel_reason"] = reason
        intent.meta["cancel_date"] = date
        self.cancelled.append(intent)
        return "cancelled", None

    def _fill_price(self, ticker: str, side: str, ref: float) -> tuple[float, float]:
        """(fill price, slippage bps) under fill model v1.0."""
        bps = self.cfg.slippage_bps(ticker)
        sign = 1.0 if side == "buy" else -1.0
        return ref * (1.0 + sign * bps / 1e4), bps

    def _fill_buy(self, intent: OrderIntent, date: str, ref: float) -> Fill:
        """Buy up to the requested dollars, capped at the account's cash; adds to (or opens) the lot."""
        requested = float(intent.dollars)
        dollars = min(requested, self._cash[intent.account])
        price, bps = self._fill_price(intent.ticker, "buy", ref)
        qty = dollars / price
        self._cash[intent.account] -= dollars
        key = lot_key(intent.account, intent.ticker, intent.module)
        lot = self._lots.get(key)
        if lot is None:  # `opened` and `trade_id` stay those of the first fill when a lot is added to
            self._lots[key] = {"account": intent.account, "ticker": intent.ticker, "module": intent.module,
                               "qty": qty, "cost": dollars, "opened": date, "trade_id": intent.trade_id,
                               "dividends": 0.0}
        else:
            lot["qty"] += qty
            lot["cost"] += dollars
        self.last_fill_meta[intent.intent_id] = {
            "realized_pnl": 0.0, "partial": dollars < requested, "requested_dollars": requested,
        }
        return self._make_fill(intent, qty, price, ref, dollars, date, bps)

    def _fill_sell(self, intent: OrderIntent, date: str, ref: float) -> Fill:
        """Sell the whole lot (close_all) or dollars / price shares, capped at the lot (flagged partial).

        The sold share of the lot's cost basis and of its dividends leaves the lot; `last_fill_meta` reports
        realized_pnl = proceeds - that cost (price P&L only) and "dividends" = that share of the income.
        """
        key = lot_key(intent.account, intent.ticker, intent.module)
        lot = self._lots[key]
        price, bps = self._fill_price(intent.ticker, "sell", ref)
        held = lot["qty"]
        wanted = held if intent.close_all else float(intent.dollars) / price
        qty = min(wanted, held)
        proceeds = qty * price
        cost_out = lot["cost"] * qty / held
        dividends_out = lot.get("dividends", 0.0) * qty / held
        lot["qty"] = held - qty
        lot["cost"] -= cost_out
        lot["dividends"] = lot.get("dividends", 0.0) - dividends_out
        if lot["qty"] < DUST_QTY:
            del self._lots[key]
        self._cash[intent.account] += proceeds
        self.last_fill_meta[intent.intent_id] = {
            "realized_pnl": proceeds - cost_out, "partial": wanted > held, "requested_dollars": intent.dollars,
            "dividends": dividends_out,
        }
        return self._make_fill(intent, qty, price, ref, proceeds, date, bps)

    def _make_fill(self, intent: OrderIntent, qty: float, price: float, ref: float, dollars: float,
                   date: str, bps: float) -> Fill:
        return Fill(
            intent_id=intent.intent_id, trade_id=intent.trade_id, module=intent.module, account=intent.account,
            ticker=intent.ticker, side=intent.side, qty=qty, price=price, ref_price=ref, dollars=dollars,
            fill_date=date, slippage_bps=bps, model_version=str(self.cfg.fills["model_version"]),
        )

    def _update_last_closes(self, closes: dict[str, float]) -> dict[str, float]:
        """Mark price per held ticker (today's close, else the last marked close); stores them for next time.

        Tickers no longer held are dropped, so a stale close never outlives its holding period.
        """
        held = {lot["ticker"] for lot in self._lots.values()}
        prices: dict[str, float] = {}
        for ticker in held:
            close = closes.get(ticker)
            if _is_positive_number(close):
                prices[ticker] = float(close)
            elif ticker in self._last_close:
                prices[ticker] = self._last_close[ticker]
        self._last_close = prices
        return prices

    @staticmethod
    def _lot_value(lot: dict[str, Any], prices: dict[str, float]) -> float:
        """qty * mark price, or the cost basis when the ticker has never had a close."""
        price = prices.get(lot["ticker"])
        return lot["qty"] * price if price is not None else lot["cost"]
