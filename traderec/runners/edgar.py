"""EDGAR / FINRA shadow screens: insider clusters, special dividends, activist 13D filings, near-completion cash mergers, CEF tender capture (design v3.3 §3 "Shadow ledger"; track 16).

Skeleton (docs/PHASE_B_CONTRACTS.md §7): its build fills this in. Until then every hook is a no-op.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run


def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook."""
    return None
