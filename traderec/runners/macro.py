"""W8 / W9 — macro-event call spreads with the frozen LLM veto (design v3.3 §3 M5).

Skeleton (docs/PHASE_B_CONTRACTS.md §7): its build fills this in. Until then every hook is a no-op.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run
    from traderec.types import Fill, OrderIntent


def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook."""
    return None


def on_spread_fill(run: "Run", fill: "Fill", intent: "OrderIntent") -> None:
    """The options job filled one of this module's spread orders."""
    return None


def on_spread_cancel(run: "Run", intent: "OrderIntent", reason: str) -> None:
    """The options job cancelled one of this module's spread orders (no fill within the stated maximum)."""
    return None


def roots_needed(run: "Run") -> set[str]:
    """Option roots the 10:17 ET job must snapshot for this runner."""
    return set()


def options_job(run: "Run", chains: dict[str, Any]) -> None:
    """10:17 ET hook, after the fills: work that needs market-hours quotes."""
    return None
