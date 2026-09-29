"""Data layer (docs/INTERFACES.md §1): market-data providers and the two-source close check.

``LiveProvider`` is the only network client in traderec. ``FakeProvider`` serves in-memory data to every
offline test. ``verify_close`` cross-checks a close against a second source and fails closed.
"""
from traderec.data.providers import BAR_COLUMNS, DataError, DataProvider, FakeProvider, LiveProvider
from traderec.data.verify import verify_close

__all__ = ["BAR_COLUMNS", "DataError", "DataProvider", "FakeProvider", "LiveProvider", "verify_close"]
