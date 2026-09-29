"""The growth book (design v4.0, research/00-SYSTEM-DESIGN-v4.md §3, §3a, §4, Appendix A): Phase C1.

* `governor`  - peak, drawdown, G and the hard stop (pure functions plus the Sunday state update);
* `orders`    - sleeve targets -> per-ticker deltas -> netting -> bands -> ranking -> the <= 3 orders and the deferred list;
* `weekly`    - the Sunday job (`weekly.run(run)`), called from `pipeline.run_weekly`: ingest -> G1/G2 signals -> NAV,
                peak, drawdown, G -> targets -> order set -> paper broker -> ledger -> the facts record.

The signals live in `traderec.modules.g1_lev_trend` and `traderec.modules.g2_btc_switch`. This package touches no
network: every input comes through `run.bars()` / `run.provider`, and every function here is deterministic.
"""
from __future__ import annotations

import dataclasses
from typing import Any

from traderec.config import Config

GROWTH_MODULES = ("G1", "G2", "G3", "GROWTH")     # the lot / order `module` names the book uses ("GROWTH" = the SGOV sleeve)


def cfg_growth(cfg: Config) -> dict[str, Any]:
    """The constitution's `growth` block ({} when absent)."""
    return cfg.constitution.get("growth") or {}


def enabled(cfg: Config) -> bool:
    return bool(cfg_growth(cfg).get("enabled", False))


def module_status(cfg: Config, name: str) -> str:
    """A v3.3 module's v4 status (`modules.<name>.status`; "active" when the key is absent)."""
    return str((cfg.constitution.get("modules") or {}).get(name, {}).get("status") or "active")


def supersedes_m3(cfg: Config) -> bool:
    """True when the growth book is on and M3's status says G2 replaces it: the weekly job then skips `_m3`."""
    return enabled(cfg) and module_status(cfg, "M3").replace(" ", "").lower().startswith("superseded_by")


NON_TRADING_STATUSES = ("shadow", "retired")     # plus "superseded_by: <module>" (design v4 §3, the status table)


def status_blocks_trading(status: str) -> bool:
    """True for the v4 statuses under which a v3.3 module places no orders and sends no emails."""
    s = str(status or "").replace(" ", "").lower()
    return s in NON_TRADING_STATUSES or s.startswith("superseded")


def module_trades(cfg: Config, name: str) -> bool:
    """Whether module `name` may still place orders and send emails (Phase C3: the statuses are enforced).

    True while the growth book is disabled (v3.3 behaviour) or the module's status is active/paper/absent. False
    while `growth.enabled` and the status is `shadow`, `retired` or `superseded_by: ...`: the module's shadow books
    keep logging, `Run.emit` turns its would-be recommendation into a `shadow` ledger record (exits of a position
    it still holds are allowed, so nothing is stranded).
    """
    return not (enabled(cfg) and status_blocks_trading(module_status(cfg, name)))


def with_enabled(cfg: Config, flag: bool) -> Config:
    """A copy of `cfg` with `growth.enabled` set to `flag` (tests that pin the v3.3 weekly job use False)."""
    constitution = dict(cfg.constitution)
    constitution["growth"] = {**(constitution.get("growth") or {}), "enabled": bool(flag)}
    return dataclasses.replace(cfg, constitution=constitution)


def new_growth_state() -> dict[str, Any]:
    """A fresh `state.growth` block (design v4 Appendix A.3)."""
    return {
        "peak_nav": None, "drawdown": None, "G": None, "G_date": None, "G_at_last_order": None,
        "hard_stop_hit_on": None, "paused": False, "last_run": None, "first_run": None,
        "sleeves": {
            "G1": {},                                           # per leg: {in, since, last_close, sma200, band_state}
            "G2": {"on": None, "since": None, "weekly_close": None, "ma10w": None, "sma200": None, "vol60": None,
                   "vol_cut_factor": 1.0, "vol_high_since": None},
            "G3": {"reserve": None, "rules": {}},               # the reserve is held in SGOV until a rule is promoted
        },
        "W10": {"open": False, "entry": None, "exit_due": None},
        "targets": {}, "order_set": [], "deferred": [], "rule_e": {"count_week": 0, "count_year": 0, "last": None},
        "weeks_with_orders": {}, "last_facts": None,
    }


def state_growth(state: dict[str, Any]) -> dict[str, Any]:
    """`state["growth"]`, created for states saved before Phase C."""
    st = state.setdefault("growth", new_growth_state())
    for key, value in new_growth_state().items():
        st.setdefault(key, value)
    return st
