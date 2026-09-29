"""Module-specific email text, one file per module (docs/PHASE_B_CONTRACTS.md §8; design v4 §9 for `growth`).

Each file exports `TEXT = {table_name: entries}`, where table_name is one of TABLES in `traderec.emails`
(MODULE_NAMES, MODULE_STATUS, MODULE_CONFIDENCE, DEFAULT_TICKERS, TICKER_NAMES, PLAN_NAMES_EXIT_EMAIL,
ONE_SENTENCE, WHY, EXIT_PLAN, RISKS). `traderec.emails` merges them into its tables at import. Same rules as
emails.py: no digits in templates; numbers come from facts through the registry. `growth.py` also holds the Sunday
and Rule E emails' own phrase tables, read by `traderec.growth.email`.
"""
from __future__ import annotations

from typing import Any

TABLES = ("MODULE_NAMES", "MODULE_STATUS", "MODULE_CONFIDENCE", "DEFAULT_TICKERS", "TICKER_NAMES",
          "PLAN_NAMES_EXIT_EMAIL", "ONE_SENTENCE", "WHY", "EXIT_PLAN", "RISKS")


def merge_module_text(namespace: dict[str, Any]) -> None:
    """Merge every module file's TEXT into the tables found in `namespace` (emails.py's globals())."""
    from . import growth, m4, w8w9

    for mod in (m4, w8w9, growth):
        for table, entries in (getattr(mod, "TEXT", None) or {}).items():
            if table not in TABLES:
                raise KeyError(f"{mod.__name__}: unknown email table {table!r}")
            target = namespace[table]
            if isinstance(target, set):
                target.update(entries)
            else:
                for key, value in entries.items():
                    if key in target:
                        raise KeyError(f"{mod.__name__}: {table}[{key!r}] is already defined")
                    target[key] = value
