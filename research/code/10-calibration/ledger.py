"""Append-only, hash-chained JSONL ledger (the system's decision journal).

Every recommendation, shadow candidate, forecast, execution, mark, resolution,
post-mortem, change proposal/decision and constitution version is ONE line.
Each line carries sha256(prev line) so any later edit, deletion or re-ordering
breaks the chain.  The head hash is printed in every monthly e-mail, which
gives the user an external, timestamped witness of what was pre-registered.

Rules enforced here (the evaluator refuses a ledger that violates them):
  * records are never edited; corrections are new records that point back;
  * a forecast must be written before its question can resolve;
  * a resolution must reference an existing forecast and cannot pre-date it;
  * created_at is monotone non-decreasing.
"""
from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone

GENESIS = "0" * 64

RECORD_TYPES = {
    "constitution", "recommendation", "shadow_candidate", "forecast", "execution",
    "mark", "resolution", "postmortem", "change_proposal", "change_decision",
    "trial", "monthly_report", "correction", "annulment",
}

REQUIRED = {
    "recommendation": ["rec_id", "candidate_id", "archetype", "instrument", "legs",
                       "direction", "thesis", "base_rate", "market_implied",
                       "edge_estimate", "sizing", "entry_plan", "exit_plan",
                       "invalidation", "premortem", "forecast_ids", "benchmark"],
    "shadow_candidate": ["candidate_id", "scan_id", "archetype", "instrument",
                         "score_raw", "rank", "selection_status", "sampling_weight",
                         "hypothetical_plan", "forecast_ids"],
    "forecast": ["forecast_id", "parent_id", "family", "question", "resolution_rule",
                 "resolution_criteria", "resolution_date", "p_raw", "p_final",
                 "calibration_map", "baseline"],
    "resolution": ["forecast_id", "outcome", "resolved_at", "source", "status"],
    "execution": ["rec_id", "executed", "fills"],
    "mark": ["position_id", "date", "price", "value"],
    "postmortem": ["rec_id", "blind_grade", "outcome_grade", "classification",
                   "return_decomposition", "pit", "lessons"],
    "change_proposal": ["change_id", "tier", "target", "old_value", "new_value",
                        "hypothesis", "primary_metric", "success_criterion",
                        "min_sample", "shadow_window", "trial_count"],
    "change_decision": ["change_id", "decision", "evidence", "decided_by",
                        "constitution_version"],
    "constitution": ["version", "content_sha256", "invariants", "parameters", "changelog"],
    "trial": ["trial_id", "description", "variant_spec", "data_window"],
    "monthly_report": ["period", "metrics", "email_sha256"],
    "correction": ["corrects_record_hash", "reason", "replacement"],
    "annulment": ["forecast_id", "reason"],
}


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


class LedgerError(Exception):
    pass


class Ledger:
    def __init__(self, path: str):
        self.path = path
        self._forecasts: dict[str, dict] = {}
        self._last_hash = GENESIS
        self._last_created = None
        if os.path.exists(path):
            ok, msg = self.verify()
            if not ok:
                raise LedgerError(f"existing ledger failed verification: {msg}")

    # ------------------------------------------------------------------
    def append(self, record_type: str, payload: dict, *, as_of: str,
               author: str = "system", strategy_version: str = "unversioned",
               model: dict | None = None, created_at: str | None = None) -> dict:
        if record_type not in RECORD_TYPES:
            raise LedgerError(f"unknown record_type {record_type}")
        missing = [f for f in REQUIRED.get(record_type, []) if f not in payload]
        if missing:
            raise LedgerError(f"{record_type} missing fields: {missing}")
        created_at = created_at or utcnow_iso()
        if self._last_created and _parse(created_at) < _parse(self._last_created):
            raise LedgerError("created_at must be non-decreasing")
        self._check_semantics(record_type, payload, created_at)
        rec = {
            "record_id": str(uuid.uuid4()),
            "record_type": record_type,
            "created_at": created_at,
            "as_of": as_of,
            "author": author,
            "strategy_version": strategy_version,
            "model": model or {},
            "payload": payload,
            "prev_hash": self._last_hash,
        }
        rec["hash"] = sha256_hex(canonical_json(rec))
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(canonical_json(rec) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        self._absorb(rec)
        return rec

    # ------------------------------------------------------------------
    def _check_semantics(self, rtype, payload, created_at):
        if rtype == "forecast":
            if _parse(payload["resolution_date"]) <= _parse(created_at):
                raise LedgerError("forecast must be registered before its resolution date")
            for key in ("p_raw", "p_final"):
                v = payload[key]
                if v is not None and not (0.0 <= v <= 1.0):
                    raise LedgerError(f"{key} out of [0,1]")
        if rtype == "resolution":
            f = self._forecasts.get(payload["forecast_id"])
            if f is None:
                raise LedgerError("resolution references unknown forecast")
            if _parse(payload["resolved_at"]) < _parse(f["created_at"]):
                raise LedgerError("resolution pre-dates the forecast")
            rule = f["payload"]["resolution_rule"]
            before_date = _parse(payload["resolved_at"]) < _parse(f["payload"]["resolution_date"])
            if rule == "at_date" and before_date and payload["status"] == "resolved":
                raise LedgerError("at_date question resolved before its date")
            if rule in ("first_touch_by_date", "event_by_date") and before_date \
                    and payload["outcome"] == 0 and payload["status"] == "resolved":
                raise LedgerError("a NO on a by-date question can only resolve at the date")

    def _absorb(self, rec):
        if rec["record_type"] == "forecast":
            self._forecasts[rec["payload"]["forecast_id"]] = rec
        self._last_hash = rec["hash"]
        self._last_created = rec["created_at"]

    # ------------------------------------------------------------------
    def verify(self):
        """Recompute every hash and the chain.  Returns (ok, message)."""
        self._forecasts, self._last_hash, self._last_created = {}, GENESIS, None
        with open(self.path, encoding="utf-8") as fh:
            for i, line in enumerate(fh):
                rec = json.loads(line)
                h = rec.pop("hash")
                if rec["prev_hash"] != self._last_hash:
                    return False, f"line {i}: broken chain"
                if sha256_hex(canonical_json(rec)) != h:
                    return False, f"line {i}: content hash mismatch (record edited?)"
                rec["hash"] = h
                self._absorb(rec)
        return True, f"ok; head={self._last_hash}"

    @property
    def head(self) -> str:
        return self._last_hash

    def records(self, record_type: str | None = None):
        with open(self.path, encoding="utf-8") as fh:
            for line in fh:
                rec = json.loads(line)
                if record_type is None or rec["record_type"] == record_type:
                    yield rec
