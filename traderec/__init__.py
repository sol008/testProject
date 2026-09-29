"""traderec: a few-trade, evidence-gated trade recommendation system.

Deterministic rules decide every trade (research/00-SYSTEM-DESIGN-v3.md). A paper broker fills them with a
frozen fill model, a hash-chained ledger records every decision before its outcome is known, and plain-English
emails tell the owner exactly what to do in the Robinhood or Coinbase app.
"""

__version__ = "0.1.0"
