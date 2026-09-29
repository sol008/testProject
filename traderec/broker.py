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

Two-leg vertical spreads (Phase B, order kind (b); docs/PHASE_B_CONTRACTS.md §2-§4) never fill at the open.
`fill_spreads` fills them at the 10:17 ET market-hours snapshot with fill model v1.0 for options
(`traderec.options.fillmodel`):

- an opening order (a debit) fills at P = combo mid + 0.3 x natural width if P <= its limit, else if
  P <= its stated maximum (the one re-price), else it is cancelled;
- a closing order does the same with >=, against its stated minimum credit.

Open spreads are keyed by "account|trade_id". Their `cost` is the debit paid, contracts x price x 100. They are
valued at their last mark (the combo mid, per share) x contracts x 100, or at cost before their first mark.
"""
from __future__ import annotations

import copy
import math
import numbers
from typing import Any

import pandas as pd

from traderec.config import Config
from traderec.options.chain import OptionChain, chain_root, parse_occ
from traderec.options.fillmodel import combo_quote, decide_fill
from traderec.types import Fill, OrderIntent

DUST_QTY = 1e-9            # lots below this many shares are removed
SPREAD_ROOTS = frozenset({"XSP", "SPX", "SPXW"})   # index option roots (not ETF tickers on the whitelist)
MAX_MISSED_OPENS = 2       # the second missing open cancels the order
STATE_SCHEMA = 1
# fills.options in constitution.yaml; these apply only to keys the config leaves out.
OPTION_FILL_DEFAULTS = {"concession": 0.3, "max_concession": 0.5, "multiplier": 100}


def lot_key(account: str, ticker: str, module: str) -> str:
    """Key of the lot holding `ticker` for `module` in `account`."""
    return f"{account}|{ticker}|{module}"


def spread_key(account: str, trade_id: str) -> str:
    """Key of the open spread of trade `trade_id` in `account`."""
    return f"{account}|{trade_id}"


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
        self._spreads: dict[str, dict[str, Any]] = {}   # open spreads by spread_key(account, trade_id)
        self.cancelled: list[OrderIntent] = []   # meta carries "cancel_reason" and "cancel_date"
        self.history: list[dict[str, Any]] = []  # [{"date", "nav"}], one entry per marked date
        self.peak: float = sum(self._cash.values())
        # per intent_id, from the last fill_pending() or fill_spreads() (settle_spread adds its own entry)
        self.last_fill_meta: dict[str, dict[str, Any]] = {}

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
        """Rebuild a broker from `to_state()` output. The accounts are those in the state, not the config.

        A state saved before spreads existed (no "spreads" key) loads with no open spreads.
        """
        broker = cls(cfg, state["cash"])
        broker._lots = copy.deepcopy(state.get("lots", {}))
        for lot in broker._lots.values():
            lot.setdefault("dividends", 0.0)
        broker._pending = [OrderIntent.from_dict(copy.deepcopy(d)) for d in state.get("pending", [])]
        broker.cancelled = [OrderIntent.from_dict(copy.deepcopy(d)) for d in state.get("cancelled", [])]
        broker._last_close = {t: float(p) for t, p in state.get("last_close", {}).items()}
        broker._spreads = copy.deepcopy(state.get("spreads") or {})
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
            "spreads": copy.deepcopy(self._spreads),
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
        """Copies of the queued orders, in queue order: those waiting for an open, and spread orders
        (order_type "spread_limit") waiting for the 10:17 ET options job."""
        return [OrderIntent.from_dict(o.to_dict()) for o in self._pending]

    def spreads(self, account: str | None = None, module: str | None = None) -> list[dict]:
        """Copies of the open spreads, optionally filtered by account and/or module, sorted by key.

        Each: {"key", "account", "module", "trade_id", "root", "legs", "contracts", "entry_price", "cost",
        "opened", "expiry", "mark", "mark_date", "width", "multiplier", "intent_id", "fill_time"}.
        - `entry_price` and `mark` are per share of the combo.
        - `mark` is None until the first mark.
        - `width` is the strike distance, the most a debit vertical can be worth per share.
        """
        return [
            copy.deepcopy(s) for _, s in sorted(self._spreads.items())
            if (account is None or s["account"] == account) and (module is None or s["module"] == module)
        ]

    # ------------------------------------------------------------------ orders and fills

    def queue(self, intent: OrderIntent) -> None:
        """Store a copy of `intent` until the next `fill_pending()`, or `fill_spreads()` for a spread order.

        Raises ValueError for a shadow module, an unknown or disabled account, a side other than buy/sell, a
        ticker off the whitelist, close_all on a buy, a missing or non-positive `dollars` (unless close_all),
        or an intent_id that is already pending.

        Spread orders (order_type "spread_limit") are checked as in contract §2 instead: an account with
        options level 3; an allowed root; exactly one long and one short leg with valid OCC symbols on the same
        root, right and expiry, at different strikes, ratio 1; whole contracts >= 1. An opening order (buy)
        must be a debit vertical with a positive limit_price and max_price. A closing order (sell) must set
        close_all.
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

    def fill_spreads(self, date: str, time_et: str, chains: dict[str, OptionChain]) -> list[Fill]:
        """Fill or cancel the pending spread orders at one market-hours snapshot (contract §3-§4).

        Eligible: spread_limit orders with created_date strictly before `date`, whose root's chain is in `chains`
        and is dated `date`. SPXW orders use the "SPX" chain. Closing orders go first, then opening orders, in
        queue order. Orders without a usable chain stay pending untouched; the caller handles missing data.

        Each eligible order is decided by `decide_fill` on the combo quote of its legs; a close uses the legs
        of the open spread.
        - Filled open: cash is debited contracts x P x 100 and the spread opens.
        - Filled close: cash is credited and the spread is removed.
        - No fill: the order moves to `cancelled` with meta cancel_reason and cancel_date. So does a close
          with no open spread, an open whose trade already holds a spread, and an open the account's cash
          cannot pay.

        `last_fill_meta[intent_id]` = {"attempt", "reason", "quote", "cancelled", "model_price", "limit_price",
        "max_price", "time_et"}, plus "realized_pnl" (0.0 for opens), "entry_price" and "cost" for closes.

        Returns the fills: qty = contracts, price = P, ref_price = combo mid, multiplier 100,
        dollars = contracts x P x 100, slippage_bps 0.0, legs = the leg quotes used, fill_time = `time_et`.
        """
        self.last_fill_meta = {}
        cfg_fills = self._option_fills()
        fills: list[Fill] = []
        done: set[str] = set()
        mine = [o for o in self._pending
                if o.order_type == "spread_limit" and _day(date) > _day(o.created_date)]
        for intent in [o for o in mine if o.side == "sell"] + [o for o in mine if o.side == "buy"]:
            chain = self._chain_for(intent.ticker, chains, date)
            if chain is None:
                continue
            status, fill = self._process_spread(intent, date, time_et, chain, cfg_fills)
            if status != "pending":
                done.add(intent.intent_id)
            if fill is not None:
                fills.append(fill)
        self._pending = [o for o in self._pending if o.intent_id not in done]
        return fills

    def mark_spreads(self, date: str, chains: dict[str, OptionChain]) -> dict[str, float]:
        """Mark each open spread at its combo mid (per share) from `chains`: {key: mark} for those marked.

        Only chains dated `date` are used. The mark is clamped to [0, width], the value range of a debit
        vertical. A spread whose root has no chain, or whose legs lack a two-sided quote, keeps its last mark.
        """
        marks: dict[str, float] = {}
        for key, s in sorted(self._spreads.items()):
            chain = self._chain_for(s["root"], chains, date)
            quote = combo_quote(chain, s["legs"], "sell") if chain is not None else None
            if quote is None:
                continue
            value = max(float(quote["mid"]), 0.0)
            if s.get("width"):
                value = min(value, float(s["width"]))
            s["mark"], s["mark_date"] = value, date
            marks[key] = value
        return marks

    def settle_spread(self, key: str, date: str, value_per_share: float, reason: str) -> Fill:
        """Close the open spread `key` at `value_per_share` (e.g. intrinsic value at expiry) on `date`.

        Cash is credited contracts x value x 100 (value clamped to [0, width]). Pending spread orders of the
        same account and trade are cancelled, since there is nothing left to trade. `last_fill_meta` gets
        {"realized_pnl", "reason", "settled": True, "entry_price", "cost", "cancelled_orders", ...} under
        the fill's intent_id, "SETTLE-<date>-<trade_id>".

        Raises KeyError for an unknown key, and ValueError for a value that is not a finite number >= 0.
        """
        if key not in self._spreads:
            raise KeyError(f"no open spread {key!r}")
        value = float(value_per_share)
        if not math.isfinite(value) or value < 0:
            raise ValueError(f"settlement value must be a number >= 0, not {value_per_share!r}")
        s = self._spreads.pop(key)
        if s.get("width"):
            value = min(value, float(s["width"]))
        mult = int(s.get("multiplier") or OPTION_FILL_DEFAULTS["multiplier"])
        dollars = s["contracts"] * value * mult
        self._cash[s["account"]] += dollars
        cancelled = []
        for o in [o for o in self._pending if o.order_type == "spread_limit"
                  and o.account == s["account"] and o.trade_id == s["trade_id"]]:
            self._pending.remove(o)
            self._cancel(o, date, f"the spread was settled ({reason})")
            cancelled.append(o.intent_id)
        intent_id = f"SETTLE-{date}-{s['trade_id']}"
        self.last_fill_meta[intent_id] = {
            "realized_pnl": dollars - s["cost"], "reason": reason, "settled": True, "attempt": None,
            "quote": None, "cancelled": False, "entry_price": s["entry_price"], "cost": s["cost"],
            "cancelled_orders": cancelled,
        }
        return Fill(intent_id=intent_id, trade_id=s["trade_id"], module=s["module"], account=s["account"],
                    ticker=s["root"], side="sell", qty=s["contracts"], price=value, ref_price=value, dollars=dollars,
                    fill_date=date, slippage_bps=0.0, model_version=str(self.cfg.fills["model_version"]),
                    multiplier=mult, legs=copy.deepcopy(s["legs"]), fill_time=None)

    def cancel_pending(self, intent_id: str, date: str, reason: str) -> OrderIntent | None:
        """Cancel a queued order now: it moves to `cancelled` with meta cancel_reason and cancel_date.

        Returns a copy of the cancelled order, or None when no pending order has that intent_id.
        """
        for o in self._pending:
            if o.intent_id == intent_id:
                self._pending.remove(o)
                self._cancel(o, date, reason)
                return OrderIntent.from_dict(o.to_dict())
        return None

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
        Open spreads count at their last mark x contracts x 100 (see `mark_spreads`), or at cost before their
        first mark; their value is part of "positions_value".
        Returns {"date", "nav", "by_account": {acct: {"cash", "positions_value", "equity"}}, "peak",
        "drawdown"}, with drawdown = 1 - nav / peak. Marking the same date again replaces its history entry.
        """
        prices = self._update_last_closes(closes)
        by_account: dict[str, dict[str, float]] = {}
        for account, cash in self._cash.items():
            value = sum((self._lot_value(lot, prices) for lot in self._lots.values() if lot["account"] == account), 0.0)
            value += sum((self._spread_value(s) for s in self._spreads.values() if s["account"] == account), 0.0)
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
        if intent.order_type == "spread_limit":
            return self._spread_problem(intent)
        if not self.cfg.is_whitelisted(intent.ticker):
            return f"ticker {intent.ticker!r} is not on the whitelist"
        if intent.side == "buy" and intent.close_all:
            return "close_all applies to sells only"
        if not intent.close_all and not _is_positive_number(intent.dollars):
            return "dollars must be a positive amount unless close_all is set"
        if any(o.intent_id == intent.intent_id for o in self._pending):
            return "an order with this intent_id is already pending"
        return None

    def _spread_problem(self, intent: OrderIntent) -> str | None:
        """Why a spread order (order kind (b), docs/PHASE_B_CONTRACTS.md §2) cannot be queued, or None."""
        acct = (self.cfg.account.get("accounts") or {}).get(intent.account) or {}
        if int(acct.get("options_level", 0) or 0) < 3:
            return f"account {intent.account!r} does not allow spreads (options level below 3)"
        if not self.cfg.is_whitelisted(intent.ticker) and intent.ticker not in SPREAD_ROOTS:
            return f"option root {intent.ticker!r} is not allowed"
        legs = intent.legs or []
        if len(legs) != 2 or {leg.get("position") for leg in legs} != {"long", "short"}:
            return "a spread needs exactly one long and one short leg"
        if not isinstance(intent.contracts, int) or isinstance(intent.contracts, bool) or intent.contracts < 1:
            return "contracts must be a whole number of at least 1"
        if intent.side == "buy" and (intent.close_all or not _is_positive_number(intent.limit_price)
                                     or not _is_positive_number(intent.max_price)):
            return "an opening spread needs a positive limit_price and max_price (and no close_all)"
        if intent.side == "sell" and not intent.close_all:
            return "a closing spread order must set close_all"
        problem = self._vertical_problem(intent)
        if problem:
            return problem
        if any(o.intent_id == intent.intent_id for o in self._pending):
            return "an order with this intent_id is already pending"
        return None

    @staticmethod
    def _vertical_problem(intent: OrderIntent) -> str | None:
        """Design §3a.4: two-leg verticals only, and an opening order is a debit. None when the legs pass."""
        parsed: dict[str, dict[str, Any]] = {}
        for leg in intent.legs or []:
            try:
                parsed[leg["position"]] = parse_occ(leg["occ"])
            except (KeyError, TypeError, ValueError):
                return "each leg needs a valid OCC symbol under 'occ'"
            if leg.get("ratio", 1) != 1:
                return "every leg must have ratio 1"
        long, short = parsed["long"], parsed["short"]
        if long["root"] != short["root"] or chain_root(long["root"]) != chain_root(intent.ticker):
            return f"both legs must be {chain_root(intent.ticker)} options on one OCC root"
        if long["expiry"] != short["expiry"] or long["right"] != short["right"] or long["strike"] == short["strike"]:
            return "a spread must be a vertical: one right, one expiry, two strikes"
        debit = long["strike"] < short["strike"] if long["right"] == "C" else long["strike"] > short["strike"]
        if intent.side == "buy" and not debit:
            return "an opening spread must be a debit vertical (long the more valuable strike)"
        return None

    def _process(self, intent: OrderIntent, date: str, opens: dict[str, float]) -> tuple[str, Fill | None]:
        """Fill, defer or cancel one order. Returns ("filled", fill), ("pending", None) or ("cancelled", None)."""
        if intent.order_type == "spread_limit":
            return "pending", None      # spreads fill in the 10:17 ET options job, never at the open
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

    # ------------------------------------------------------------------ spreads (internals)

    def _option_fills(self) -> dict[str, float]:
        """fills.options from the constitution, with OPTION_FILL_DEFAULTS for missing keys."""
        return {**OPTION_FILL_DEFAULTS, **(self.cfg.fills.get("options") or {})}

    @staticmethod
    def _chain_for(root: str, chains: dict[str, OptionChain], date: str) -> OptionChain | None:
        """The chain listing `root`'s contracts ("SPXW" -> "SPX"), if it holds quotes of `date`; else None."""
        chain = chains.get(chain_root(root)) or chains.get(root)
        if chain is None or str(chain.asof)[:10] != date:
            return None
        return chain

    @staticmethod
    def _spread_value(s: dict[str, Any]) -> float:
        """Last mark x contracts x multiplier, or the cost before the first mark."""
        if s.get("mark") is None:
            return float(s["cost"])
        return float(s["mark"]) * s["contracts"] * int(s.get("multiplier") or OPTION_FILL_DEFAULTS["multiplier"])

    def _process_spread(self, intent: OrderIntent, date: str, time_et: str, chain: OptionChain,
                        cfg_fills: dict[str, float]) -> tuple[str, Fill | None]:
        """Fill or cancel one spread order at this snapshot. Returns ("filled", fill) or ("cancelled", None)."""
        key = spread_key(intent.account, intent.trade_id)
        spread = self._spreads.get(key)
        meta: dict[str, Any] = {"attempt": None, "reason": "", "quote": None, "cancelled": True,
                                "model_price": None, "limit_price": intent.limit_price,
                                "max_price": intent.max_price, "time_et": time_et}
        self.last_fill_meta[intent.intent_id] = meta
        if intent.side == "sell" and spread is None:
            meta["reason"] = "no open spread to close"
            return self._cancel(intent, date, meta["reason"])
        if intent.side == "buy" and spread is not None:
            meta["reason"] = "this trade already holds an open spread"
            return self._cancel(intent, date, meta["reason"])
        legs = spread["legs"] if intent.side == "sell" else intent.legs
        quote = combo_quote(chain, legs or [], intent.side)
        decision = decide_fill(intent, quote, cfg_fills)
        meta.update(attempt=decision["attempt"], reason=decision["reason"], quote=quote,
                    model_price=decision["price"])
        if not decision["filled"]:
            return self._cancel(intent, date, f"no fill at the {time_et} ET snapshot: {decision['reason']}")
        price, mult = float(decision["price"]), int(cfg_fills["multiplier"])
        if intent.side == "buy":
            contracts = int(intent.contracts)
            dollars = contracts * price * mult
            if dollars > self._cash[intent.account] + 1e-9:
                meta["reason"] = f"not enough cash for the ${dollars:,.2f} debit"
                return self._cancel(intent, date, meta["reason"])
            self._cash[intent.account] -= dollars
            parsed = [parse_occ(leg["occ"]) for leg in intent.legs or []]
            self._spreads[key] = {
                "key": key, "account": intent.account, "module": intent.module, "trade_id": intent.trade_id,
                "root": intent.ticker, "legs": copy.deepcopy(intent.legs), "contracts": contracts,
                "entry_price": price, "cost": dollars, "opened": date,
                "expiry": min(p["expiry"] for p in parsed), "mark": None, "mark_date": None,
                "width": abs(parsed[0]["strike"] - parsed[1]["strike"]), "multiplier": mult,
                "intent_id": intent.intent_id, "fill_time": time_et,
            }
            meta["realized_pnl"] = 0.0
        else:
            contracts = int(spread["contracts"])
            dollars = contracts * price * mult
            del self._spreads[key]
            self._cash[intent.account] += dollars
            meta.update(realized_pnl=dollars - spread["cost"], entry_price=spread["entry_price"],
                        cost=spread["cost"])
        meta["cancelled"] = False
        positions = {leg["occ"]: leg.get("position") for leg in legs or []}
        leg_quotes = [dict(q, position=positions.get(q["occ"])) for q in quote["legs"]]
        fill = Fill(intent_id=intent.intent_id, trade_id=intent.trade_id, module=intent.module,
                    account=intent.account, ticker=intent.ticker, side=intent.side, qty=contracts, price=price,
                    ref_price=float(quote["mid"]), dollars=dollars, fill_date=date, slippage_bps=0.0,
                    model_version=str(self.cfg.fills["model_version"]), multiplier=mult, legs=leg_quotes,
                    fill_time=time_et)
        return "filled", fill
