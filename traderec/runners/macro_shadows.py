"""Macro shadow books: W3 (cool-CPI TLT), W4 (BoJ), the gold spike fade, and every scheduled-release reaction (design v3.3 §3 M5; track 17).

Skeleton (docs/PHASE_B_CONTRACTS.md §7): its build fills this in. Until then every hook is a no-op.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run


def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook."""
    return None
