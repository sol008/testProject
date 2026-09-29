"""Quarterly and annual reviews and the go-live gates (design v3.3 §7, §8; docs/PHASE_B_CONTRACTS.md §11).

Skeleton: the reports build fills this in.
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from traderec.config import Config
    from traderec.pipeline import RunResult, Services


def run_quarterly(cfg: "Config", provider: Any, state_dir: Path | None = None, *, quarter: str | None = None,
                  dry_run: bool = False, force: bool = False, services: "Services | None" = None) -> "RunResult":
    """The quarterly review (default: the quarter that just ended, "YYYY-Qn")."""
    raise NotImplementedError("the quarterly review is not built yet (Phase B)")


def run_annual(cfg: "Config", provider: Any, state_dir: Path | None = None, *, year: str | None = None,
               dry_run: bool = False, force: bool = False, services: "Services | None" = None) -> "RunResult":
    """The annual review with the owner (default: the year that just ended)."""
    raise NotImplementedError("the annual review is not built yet (Phase B)")
