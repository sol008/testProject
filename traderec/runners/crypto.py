"""Crypto shadow books: M6 depeg buy and cash-and-carry, the ETH switch, and the hourly 24/7 crypto job (design v3.3 §3 M6).

Skeleton (docs/PHASE_B_CONTRACTS.md §7): its build fills this in. Until then every hook is a no-op.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run


def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook."""
    return None


def run_hourly(cfg: Any, provider: Any, state_dir: Any = None, *, now: Any = None, dry_run: bool = False,
               services: Any = None) -> Any:
    """The hourly 24/7 crypto job (docs/PHASE_B_CONTRACTS.md §12)."""
    raise NotImplementedError("the hourly crypto job is not built yet (Phase B)")
