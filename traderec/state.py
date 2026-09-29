"""Persistent state: `state/state.json` (the book and module memory) next to `state/ledger.jsonl`.

The state is small, human-readable JSON that the workflows commit after every run. The ledger is the
append-only, hash-chained record of every decision; the state only says where the system is now.
"""
from __future__ import annotations

import json
import math
import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

STATE_VERSION = 1

# Run statuses. A run whose status is in DONE is not repeated unless forced.
DONE = {"ok", "no_session"}
RETRYABLE = {"data_missing", "error"}


@dataclass(frozen=True)
class Paths:
    root: Path

    @property
    def state(self) -> Path:
        return self.root / "state.json"

    @property
    def ledger(self) -> Path:
        return self.root / "ledger.jsonl"

    @property
    def outbox(self) -> Path:
        return self.root / "outbox"

    @property
    def pre_run(self) -> Path:
        """The state as it was before the most recent run (what `--force` restores)."""
        return self.root / "pre_run.json"


def new_state(*, created: str, mode: str, constitution_version: str, broker_state: dict,
              m2_first_month: str) -> dict[str, Any]:
    """A fresh state. M2's first decision is the first trading day of the month after `created`."""
    return {
        "version": STATE_VERSION,
        "created": created,
        "mode": mode,
        "constitution_version": constitution_version,
        "broker": broker_state,
        "modules": {
            "M1": {"open_trade": None, "history": []},
            "M2": {"last_decision_month": m2_first_month, "month": None, "trade_id": None,
                   "targets": {}, "history": []},
            "M3": {"last_week_end": None, "on": None, "open_trade": None, "history": []},
            "W10": {"open_trade": None, "history": [], "disabled": None},
        },
        "shadow": {
            "ST1B": {"open_trade": None, "trades": []},
            "W10": {"events": []},        # every uptrend -3% day, scored at 60 and 90 calendar days
        },
        "forecasts": {"open": [], "resolved": []},
        "runs": {},
        "counters": {"trades": {}, "intent_seq": 0, "ledger_seq": 0},
        "last_accrual": created,
        "last_daily": None,
        "marks": [],          # [{"date", "nav", "drawdown", "spy_close"}], one per daily run
        "dividends": [],      # [{"date", "ticker", "per_share", "amount"}]
        "issues": [],         # [{"url", "trade_id", "kind", "date", "tickers", "intents"}]: where fills are recorded
        "fills": [],          # paper fills, for the practice-vs-model comparison
        "outbox": [],         # emails that failed to send and may be retried before they expire
        "alerts": [],         # [{"date", "kind", "message"}] for the monthly report
    }


def load_state(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        state = json.load(fh)
    if state.get("version") != STATE_VERSION:
        raise ValueError(f"state version {state.get('version')} != {STATE_VERSION}")
    return state


def save_state(path: Path, state: dict[str, Any]) -> None:
    """Atomic write: a temp file in the same directory, then os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(jsonable(state), indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".state-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def copy_tree(src: Path, dst: Path) -> None:
    """Copy the state and ledger (not the outbox) into `dst` for a dry run."""
    dst.mkdir(parents=True, exist_ok=True)
    for name in ("state.json", "ledger.jsonl", "pre_run.json"):
        if (src / name).exists():
            shutil.copy2(src / name, dst / name)


def jsonable(obj: Any) -> Any:
    """Convert numpy/pandas scalars, dates and NaN into plain JSON values (NaN/inf -> None)."""
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(obj, (pd.Timestamp, datetime, date)):
        return obj.isoformat()[:10] if isinstance(obj, (pd.Timestamp,)) or type(obj) is date else obj.isoformat()
    if obj is None or isinstance(obj, str):
        return obj
    if hasattr(obj, "to_dict"):
        return jsonable(obj.to_dict())
    return str(obj)
