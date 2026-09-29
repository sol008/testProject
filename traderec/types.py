"""Shared data types. Every component (modules, broker, ledger, emails, pipeline) speaks these."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class OrderIntent:
    """An order the owner is asked to place (or the paper broker fills).

    Execution standard (design §3a): stock/ETF orders are dollar market orders placed any time after the
    evening email; Robinhood queues them for the next 9:30 ET open (`order_type` "market_on_open").

    Phase B adds order kind (b), a two-leg vertical spread at one net limit price placed after 10:00 ET with one
    re-price (`order_type` "spread_limit"; docs/PHASE_B_CONTRACTS.md §2). For those, `ticker` is the option
    root (e.g. "XSP"), `side` "buy" opens the spread (net debit) and "sell" closes it (net credit), `legs` holds
    the position legs, and the prices are per share of the combo (x100 per contract).
    """

    intent_id: str                 # unique, e.g. "O-2026-09-29-M1-001"
    trade_id: str                  # groups the entry and exit of one trade, e.g. "T-2026-09-29-M1"
    module: str                    # "M1" | "M2" | "M3" | "W10" | "M4" | "W8" | "W9"
    account: str                   # "ira" | "taxable" | "coinbase"
    ticker: str                    # ETF ticker, or the option root for a spread
    side: str                      # "buy" | "sell"
    created_date: str              # ET date (YYYY-MM-DD) of the close the signal was computed on
    reason: str                    # "entry" | "exit_rule" | "time_stop" | "rebalance" | "switch_on" | "switch_off"
    dollars: float | None = None   # dollar amount (buys and partial sells)
    close_all: bool = False        # sell the whole module position in this ticker
    order_type: str = "market_on_open"   # "market_on_open" | "spread_limit"
    meta: dict[str, Any] = field(default_factory=dict)
    # --- spread orders only (order_type "spread_limit") ---
    legs: list[dict[str, Any]] | None = None   # position legs: {"occ", "root", "right", "strike", "expiry",
                                               # "position": "long" | "short", "ratio": 1}
    contracts: int | None = None               # whole contracts of the combo
    limit_price: float | None = None           # first net limit per share (debit to open, credit to close)
    max_price: float | None = None             # the stated maximum debit (open) / minimum credit (close)
                                               # for the one allowed re-price

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OrderIntent":
        return cls(**d)


@dataclass
class Fill:
    intent_id: str
    trade_id: str
    module: str
    account: str
    ticker: str
    side: str
    qty: float
    price: float                   # fill price incl. slippage
    ref_price: float               # official open the fill model started from
    dollars: float                 # qty * price
    fill_date: str                 # ET date of the open it filled at
    slippage_bps: float
    model_version: str
    # --- spread fills only (docs/PHASE_B_CONTRACTS.md §3): qty = contracts, price = net per share of the combo,
    # ref_price = the combo mid, dollars = qty * price * multiplier ---
    multiplier: int = 1
    legs: list[dict[str, Any]] | None = None   # the legs with the quotes the fill used
    fill_time: str | None = None               # "HH:MM" ET of the snapshot (10:17 job)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Recommendation:
    """One email = one decision. Every number the email shows must come from `facts` or `orders`."""

    kind: str                      # "NEW_TRADE" | "EXIT" | "REBALANCE" | "SWITCH_ON" | "SWITCH_OFF"
    module: str
    trade_id: str
    created_date: str
    orders: list[OrderIntent]
    facts: dict[str, Any]          # structured numbers and labels for the email
    forecasts: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["orders"] = [o.to_dict() for o in self.orders]
        return d


@dataclass
class RenderedEmail:
    subject: str
    text: str
    html: str
    numbers_registered: list[str] = field(default_factory=list)   # every number string the renderer inserted
    meta: dict[str, Any] = field(default_factory=dict)
