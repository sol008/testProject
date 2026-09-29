"""Fill model v1.0 for two-leg spreads (design §7; docs/PHASE_B_CONTRACTS.md §2-§3).

Model price P = combo mid + concession x natural width for a buy, and minus it for a sell. The concession is
0.3, which is mid + 0.6 x each leg's half-spread (track 18 §5.1: retail pays about 58% of the half-spread,
Muravyev & Pearson 2020). The quotes come from the 10:17 ET market-hours snapshot.

A paper order fills at P when P is within its limit. Otherwise it fills at P when P is within its stated
maximum (a debit) or minimum (a credit): the one re-price. Otherwise it does not fill.

Known limits, deliberately kept (design §7 names neither):
- no check against the displayed size (bid_size / ask_size);
- no rounding to the $0.05 tick.
"""
from __future__ import annotations

import math
from typing import Any

from traderec.options.chain import OptionChain


def _num(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def combo_quote(chain: OptionChain, legs: list[dict], side: str = "buy") -> dict[str, Any] | None:
    """{"mid", "natural_width", "legs": [{"occ", "bid", "ask", "mid"}]} for the position legs, or None when a
    leg has no two-sided quote. The mid is long minus short, per share; `side` does not change it."""
    out, mid, width = [], 0.0, 0.0
    for leg in legs:
        q = chain.quote(leg["occ"])
        bid, ask = (_num(q.get("bid")), _num(q.get("ask"))) if q else (None, None)
        if bid is None or ask is None or bid <= 0 or ask <= 0 or ask < bid:
            return None
        leg_mid = (bid + ask) / 2.0
        sign = 1.0 if leg.get("position") == "long" else -1.0
        mid += sign * leg_mid
        width += ask - bid
        out.append({"occ": leg["occ"], "bid": bid, "ask": ask, "mid": leg_mid})
    return {"mid": mid, "natural_width": width, "legs": out}


def model_price(quote: dict[str, Any], side: str, concession: float) -> float:
    """Buy (open a debit spread): mid + c x natural width. Sell (close it): mid - c x natural width, floored at 0."""
    if side == "buy":
        return quote["mid"] + concession * quote["natural_width"]
    return max(0.0, quote["mid"] - concession * quote["natural_width"])


def order_prices(quote: dict[str, Any], side: str, cfg_options_fills: dict) -> dict[str, float]:
    """The email's prices from tonight's quote: {"limit_price", "max_price"} (contract §2)."""
    return {"limit_price": model_price(quote, side, float(cfg_options_fills["concession"])),
            "max_price": model_price(quote, side, float(cfg_options_fills["max_concession"]))}


def decide_fill(intent: Any, quote: dict[str, Any] | None, cfg_options_fills: dict) -> dict[str, Any]:
    """{"filled", "price", "attempt": "limit" | "reprice" | None, "reason"} at one snapshot (contract §3).

    Open (buy): filled at P if P <= limit_price ("limit"), else if P <= max_price ("reprice"), else no fill.
    Close (sell): the same with >=, against the stated minimum credit. A missing quote, or a model debit that
    is not positive (quotes out of line), is no fill: fail closed. `price` is P whenever it could be computed.
    """
    if quote is None:
        return {"filled": False, "price": None, "attempt": None, "reason": "no two-sided quote for every leg"}
    p = model_price(quote, intent.side, float(cfg_options_fills["concession"]))
    if intent.side == "buy" and p <= 0:
        return {"filled": False, "price": p, "attempt": None,
                "reason": "the model debit is not positive: the leg quotes are out of line"}
    limit, stated = _num(intent.limit_price), _num(intent.max_price)
    better = (lambda a, b: a <= b + 1e-9) if intent.side == "buy" else (lambda a, b: a >= b - 1e-9)
    if limit is not None and better(p, limit):
        return {"filled": True, "price": p, "attempt": "limit", "reason": "model price within the limit"}
    if stated is not None and better(p, stated):
        return {"filled": True, "price": p, "attempt": "reprice", "reason": "filled on the one re-price"}
    where = "above the stated maximum" if intent.side == "buy" else "below the stated minimum"
    return {"filled": False, "price": p, "attempt": None, "reason": f"model price {where}"}
