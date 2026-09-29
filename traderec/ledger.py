"""Append-only, hash-chained JSONL ledger: the system's tamper-evident decision journal.

Every decision, order, fill, mark, forecast and resolution is one line of canonical JSON (sorted keys, no
whitespace, UTF-8). Each record carries the hash of the record before it (``prev_hash``; "GENESIS" for the
first), and its own ``hash`` is ``sha256(canonical_json(record without "hash"))``. Editing, deleting,
reordering or truncating a line therefore breaks the chain, and ``verify()`` says where.

Deleting whole lines from the *end* of the file leaves a shorter chain that is still valid. Catching that
needs an external witness of ``head()``: the pipeline stores the head in its state and prints it in every
email, so compare ``head()`` with the last witnessed value.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from collections.abc import Callable, Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

GENESIS = "GENESIS"

RECORD_TYPES = frozenset({
    "run_manifest", "snapshot", "signal", "recommendation", "order", "fill", "mark",
    "forecast", "resolution", "shadow", "monthly_report", "correction",
})

ENVELOPE_KEYS = (
    "seq", "record_type", "created_at", "as_of", "constitution_version", "payload", "prev_hash", "hash",
)


class LedgerError(ValueError):
    """The ledger file is corrupt, or a line cannot be read as a ledger record."""


def canonical_json(obj: Any) -> str:
    """Canonical JSON: sorted keys, no whitespace, raw UTF-8 (no \\u escapes), no NaN or Infinity."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def record_hash(record: dict[str, Any]) -> str:
    """SHA-256 hex digest of the canonical JSON of `record` without its "hash" key."""
    body = {k: v for k, v in record.items() if k != "hash"}
    return hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest()


def utc_now() -> str:
    """Default clock: the current UTC time, e.g. "2026-09-29T22:17:05+00:00"."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def to_plain_json(obj: Any) -> Any:
    """Convert a payload to plain JSON types so that what is hashed is exactly what is read back.

    numpy scalars and arrays become Python numbers and lists, dates and timestamps become ISO strings,
    tuples become lists, objects with ``to_dict()`` (OrderIntent, Fill, Recommendation) become dicts,
    dict keys become strings, and non-finite floats (NaN, +/-inf) become None. Anything else raises TypeError.
    """
    if obj is None or isinstance(obj, (str, bool)):
        return obj
    if isinstance(obj, int):
        return int(obj)
    if isinstance(obj, float):
        return float(obj) if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {str(k): to_plain_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_plain_json(v) for v in obj]
    if hasattr(obj, "to_dict"):
        return to_plain_json(obj.to_dict())
    if hasattr(obj, "tolist"):
        return to_plain_json(obj.tolist())
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    raise TypeError(f"ledger payloads must be JSON-serialisable; got {type(obj).__name__}")


def _reject_constant(name: str) -> None:
    raise ValueError(f"non-standard JSON constant {name}")


def _parse_record(raw: bytes) -> dict[str, Any]:
    """Parse one ledger line (bytes, with or without its newline). Raises LedgerError if it is not a record."""
    try:
        rec = json.loads(raw.decode("utf-8"), parse_constant=_reject_constant)
    except ValueError as exc:  # JSONDecodeError and UnicodeDecodeError are ValueErrors
        raise LedgerError(f"not a valid JSON record ({exc})") from None
    if not isinstance(rec, dict) or any(k not in rec for k in ENVELOPE_KEYS):
        raise LedgerError("not a ledger record (envelope fields missing)")
    if not isinstance(rec["seq"], int) or not isinstance(rec["hash"], str):
        raise LedgerError("not a ledger record (bad seq or hash)")
    return rec


def _checked_record(raw: bytes, lineno: int, prev_hash: str) -> dict[str, Any]:
    """Parse line `lineno` and check it against the chain; raises LedgerError naming the problem."""
    rec = _parse_record(raw)
    if not raw.endswith(b"\n"):
        raise LedgerError("unterminated line (interrupted write?)")
    if record_hash(rec) != rec["hash"]:
        raise LedgerError("hash mismatch (record edited)")
    if rec["seq"] != lineno:
        raise LedgerError(f"seq {rec['seq']} where {lineno} was expected (line deleted or reordered)")
    if rec["prev_hash"] != prev_hash:
        raise LedgerError("prev_hash does not match the previous record (line deleted or reordered)")
    return rec


def _read_last_line(path: Path, block: int = 4096) -> bytes | None:
    """The file's last line, including its newline if it has one; None for an empty file."""
    with path.open("rb") as fh:
        pos = fh.seek(0, os.SEEK_END)
        data = b""
        while pos > 0:
            step = min(block, pos)
            pos -= step
            fh.seek(pos)
            data = fh.read(step) + data
            cut = data.rfind(b"\n", 0, len(data) - 1)  # the newline before the last line
            if cut != -1:
                return data[cut + 1:]
        return data or None


class Ledger:
    """Append-only JSONL ledger at `path`.

    `clock` returns the `created_at` string for new records; tests pass a fixed clock for determinism.
    The parent directories and the file are created if missing.
    """

    def __init__(self, path: Path, clock: Callable[[], str] | None = None) -> None:
        self.path = Path(path)
        self._clock = clock or utc_now
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)

    def append(self, record_type: str, payload: dict, *, as_of: str, constitution_version: str) -> dict:
        """Append one record and return it, including "hash".

        The payload is normalised with `to_plain_json` first. Raises ValueError for an unknown record type or
        a blank `as_of` / `constitution_version`, and LedgerError if the last line of the file is corrupt
        (nothing is written on top of a broken tail; run `verify()`).
        """
        if record_type not in RECORD_TYPES:
            raise ValueError(f"unknown record_type {record_type!r}; expected one of {sorted(RECORD_TYPES)}")
        if not isinstance(payload, dict):
            raise TypeError("payload must be a dict")
        for name, value in (("as_of", as_of), ("constitution_version", constitution_version)):
            if not isinstance(value, str) or not value:
                raise ValueError(f"{name} must be a non-empty string")
        last = self._last_record()
        record: dict[str, Any] = {
            "seq": last["seq"] + 1 if last else 1,
            "record_type": record_type,
            "created_at": self._clock(),
            "as_of": as_of,
            "constitution_version": constitution_version,
            "payload": to_plain_json(payload),
            "prev_hash": last["hash"] if last else GENESIS,
        }
        record["hash"] = record_hash(record)
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(canonical_json(record) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        return record

    def head(self) -> str:
        """Hash of the last record, or "GENESIS" for an empty ledger. Raises LedgerError on a corrupt tail."""
        last = self._last_record()
        return last["hash"] if last else GENESIS

    def verify(self) -> tuple[bool, str]:
        """Recompute the whole chain.

        Returns (True, "ok: N records, head=<hash>") or (False, "line N: <problem>"). Detects edited records
        (hash mismatch), deleted or reordered lines (seq or prev_hash mismatch), and truncated, unterminated,
        blank or garbage lines. See the module docstring for deletions at the end of the file.
        """
        if not self.path.is_file():
            return False, f"ledger file {self.path} is missing"
        prev_hash, count = GENESIS, 0
        with self.path.open("rb") as fh:
            for lineno, raw in enumerate(fh, start=1):
                try:
                    prev_hash = _checked_record(raw, lineno, prev_hash)["hash"]
                except LedgerError as exc:
                    return False, f"line {lineno}: {exc}"
                count = lineno
        return True, f"ok: {count} records, head={prev_hash}"

    def records(self, record_type: str | None = None) -> Iterator[dict]:
        """Yield records in file order, optionally only those of one type. Raises LedgerError on a bad line."""
        with self.path.open("rb") as fh:
            for lineno, raw in enumerate(fh, start=1):
                try:
                    rec = _parse_record(raw)
                except LedgerError as exc:
                    raise LedgerError(f"line {lineno}: {exc}") from None
                if record_type is None or rec["record_type"] == record_type:
                    yield rec

    def _last_record(self) -> dict[str, Any] | None:
        """The last record, or None for an empty ledger. Raises LedgerError if the last line is damaged."""
        raw = _read_last_line(self.path)
        if raw is None:
            return None
        if not raw.endswith(b"\n"):
            raise LedgerError("the last ledger line is unterminated (interrupted write?); run verify()")
        try:
            return _parse_record(raw)
        except LedgerError as exc:
            raise LedgerError(f"the last ledger line is damaged: {exc}; run verify()") from None
