"""Option shadow books: M7 (O1) put credit spread, O1-h, I1/I2, and ST-2 (design v3.3 §3 "Shadow ledger").

Skeleton (docs/PHASE_B_CONTRACTS.md §7): its build fills this in. Until then every hook is a no-op.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run


def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook."""
    return None


def roots_needed(run: "Run") -> set[str]:
    """Option roots the 10:17 ET job must snapshot for this runner."""
    return set()


def options_job(run: "Run", chains: dict[str, Any]) -> None:
    """10:17 ET hook, after the fills: work that needs market-hours quotes."""
    return None
