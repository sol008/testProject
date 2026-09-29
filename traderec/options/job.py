"""The 10:17 ET options job and the daily run's spread marks (docs/PHASE_B_CONTRACTS.md §5).

Skeleton: the options build fills this in. Until then `mark_spreads` is a no-op and `run_options` refuses to run.
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from traderec.config import Config
    from traderec.pipeline import Run, RunResult, Services


def mark_spreads(run: "Run") -> None:
    """Daily-run hook, called before the book is marked: value open spreads at tonight's closing quotes."""
    return None


def run_options(cfg: "Config", provider: Any, state_dir: Path | None = None, *, date: str | None = None,
                dry_run: bool = False, force: bool = False, services: "Services | None" = None) -> "RunResult":
    """The 10:17 ET Mon-Fri run: snapshot chains, fill pending spread orders (fill model v1.0), option shadows."""
    raise NotImplementedError("the options job is not built yet (Phase B)")
