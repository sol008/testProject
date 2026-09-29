"""Trading modules (design v3.2 §3): deterministic rules only, pure functions on in-memory data.

* M1 (`m1_dipbuy`)  - ST-1 VIX-gated uptrend dip-buy on SPY (track 13 §11.1).
* M2 (`m2_trend`)   - R1 slow multi-asset trend book, long-only ETF8 (track 15 R1).
* M3 (`m3_btc`)     - R2 Bitcoin weekly trend switch (track 15 R2).
* shadow (`shadow`) - ST-1b (M1 without the VIX gate) and W10 (uptrend crash day, track 17).

Sizing, caps and the drawdown governor live in `traderec.risk`.
"""
from traderec.modules.m1_dipbuy import dip_entry_check, m1_entry_check, m1_exit_check
from traderec.modules.m2_trend import m2_orders, m2_signals, m2_targets
from traderec.modules.m3_btc import btc_weekly_switch
from traderec.modules.shadow import st1b_entry_check, w10_check

__all__ = [
    "btc_weekly_switch",
    "dip_entry_check",
    "m1_entry_check",
    "m1_exit_check",
    "m2_orders",
    "m2_signals",
    "m2_targets",
    "st1b_entry_check",
    "w10_check",
]
