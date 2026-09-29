"""Tests for the hash-chained JSONL ledger (traderec/ledger.py)."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from traderec.ledger import GENESIS, Ledger, LedgerError

CLOCK = "2026-09-29T22:17:00+00:00"


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def make_ledger(tmp_path: Path, n: int = 4) -> Ledger:
    """A ledger with `n` records written by a fixed clock."""
    led = Ledger(tmp_path / "state" / "ledger.jsonl", clock=lambda: CLOCK)
    for i in range(n):
        led.append("fill", {"i": i, "ticker": "SPY", "qty": 10.5 + i}, as_of="2026-09-29", constitution_version="3.2.0")
    return led


def lines(led: Ledger) -> list[str]:
    return led.path.read_text(encoding="utf-8").splitlines(keepends=True)


def write_lines(led: Ledger, new_lines: list[str]) -> None:
    led.path.write_text("".join(new_lines), encoding="utf-8")


# ---------------------------------------------------------------------- chain


def test_new_ledger_creates_parent_dirs_and_empty_file(tmp_path):
    led = Ledger(tmp_path / "a" / "b" / "ledger.jsonl")
    assert led.path.exists() and led.path.read_text() == ""
    assert led.head() == GENESIS
    assert led.verify() == (True, "ok: 0 records, head=GENESIS")
    assert list(led.records()) == []


def test_append_builds_the_chain(tmp_path):
    led = make_ledger(tmp_path, n=3)
    recs = list(led.records())
    assert [r["seq"] for r in recs] == [1, 2, 3]
    assert recs[0]["prev_hash"] == "GENESIS"
    assert recs[1]["prev_hash"] == recs[0]["hash"]
    assert recs[2]["prev_hash"] == recs[1]["hash"]
    assert led.head() == recs[-1]["hash"]
    first = recs[0]
    assert set(first) == {"seq", "record_type", "created_at", "as_of", "constitution_version", "payload",
                          "prev_hash", "hash"}
    assert first["created_at"] == CLOCK and first["as_of"] == "2026-09-29"
    assert first["constitution_version"] == "3.2.0" and first["payload"] == {"i": 0, "ticker": "SPY", "qty": 10.5}
    ok, msg = led.verify()
    assert ok and msg == f"ok: 3 records, head={recs[-1]['hash']}"


def test_hash_is_sha256_of_canonical_record_without_hash(tmp_path):
    led = make_ledger(tmp_path, n=2)
    for line, rec in zip(lines(led), led.records()):
        body = {k: v for k, v in rec.items() if k != "hash"}
        assert rec["hash"] == hashlib.sha256(canonical(body).encode("utf-8")).hexdigest()
        assert line == canonical(rec) + "\n"  # each line is the canonical JSON of the full record


def test_append_returns_the_stored_record(tmp_path):
    led = make_ledger(tmp_path, n=1)
    rec = led.append("mark", {"nav": 100000.0}, as_of="2026-09-30", constitution_version="3.2.0")
    assert rec == list(led.records())[-1]
    assert rec["seq"] == 2 and rec["hash"] == led.head()


def test_reopening_continues_the_chain(tmp_path):
    led = make_ledger(tmp_path, n=2)
    old_head = led.head()
    again = Ledger(led.path, clock=lambda: CLOCK)
    rec = again.append("mark", {"nav": 1.0}, as_of="2026-09-30", constitution_version="3.2.0")
    assert rec["seq"] == 3 and rec["prev_hash"] == old_head
    assert led.head() == again.head() == rec["hash"]  # head() always reads the file
    assert again.verify()[0]


def test_records_filters_by_type(tmp_path):
    led = make_ledger(tmp_path, n=2)
    led.append("forecast", {"forecast_id": "F-T-1"}, as_of="2026-09-29", constitution_version="3.2.0")
    assert [r["seq"] for r in led.records("fill")] == [1, 2]
    assert [r["payload"]["forecast_id"] for r in led.records("forecast")] == ["F-T-1"]
    assert list(led.records("resolution")) == []
    assert len(list(led.records())) == 3


def test_unicode_is_stored_raw(tmp_path):
    led = make_ledger(tmp_path, n=0)
    led.append("signal", {"note": "café ≥ 20 ✓"}, as_of="2026-09-29", constitution_version="3.2.0")
    assert "café ≥ 20 ✓" in led.path.read_text(encoding="utf-8")
    assert next(led.records())["payload"]["note"] == "café ≥ 20 ✓"
    assert led.verify()[0]


def test_payload_is_normalised_to_plain_json(tmp_path):
    led = make_ledger(tmp_path, n=0)
    payload = {"n": np.int64(3), "x": np.float64(0.5), "missing": float("nan"), "flag": np.bool_(True),
               "pair": (1, 2), "arr": np.array([1.5, 2.5]), "day": pd.Timestamp("2026-09-29"), 7: "int key"}
    rec = led.append("snapshot", payload, as_of="2026-09-29", constitution_version="3.2.0")
    expected = {"n": 3, "x": 0.5, "missing": None, "flag": True, "pair": [1, 2], "arr": [1.5, 2.5],
                "day": "2026-09-29T00:00:00", "7": "int key"}
    assert rec["payload"] == expected
    assert next(led.records())["payload"] == expected
    assert led.verify()[0]


def test_default_clock_is_utc_iso_seconds(tmp_path):
    led = Ledger(tmp_path / "ledger.jsonl")
    rec = led.append("run_manifest", {}, as_of="2026-09-29", constitution_version="3.2.0")
    created = datetime.fromisoformat(rec["created_at"])
    assert rec["created_at"].endswith("+00:00") and created.microsecond == 0


@pytest.mark.parametrize("kwargs, error", [
    ({"record_type": "trade"}, ValueError),
    ({"payload": ["not", "a", "dict"]}, TypeError),
    ({"as_of": ""}, ValueError),
    ({"constitution_version": None}, ValueError),
    ({"payload": {"obj": object()}}, TypeError),
])
def test_append_rejects_bad_input(tmp_path, kwargs, error):
    led = make_ledger(tmp_path, n=0)
    args = {"record_type": "fill", "payload": {}, "as_of": "2026-09-29", "constitution_version": "3.2.0", **kwargs}
    with pytest.raises(error):
        led.append(args.pop("record_type"), args.pop("payload"), **args)
    assert led.path.read_text() == ""


# ---------------------------------------------------------------------- tampering


def test_edited_payload_is_detected(tmp_path):
    led = make_ledger(tmp_path)
    ls = lines(led)
    assert '"qty":11.5' in ls[1]
    ls[1] = ls[1].replace('"qty":11.5', '"qty":99.5')
    write_lines(led, ls)
    ok, msg = led.verify()
    assert not ok and msg.startswith("line 2:") and "hash mismatch" in msg


def test_edited_record_with_recomputed_hash_breaks_the_next_link(tmp_path):
    led = make_ledger(tmp_path)
    ls = lines(led)
    rec = json.loads(ls[1])
    rec["payload"]["qty"] = 99.5
    rec["hash"] = hashlib.sha256(canonical({k: v for k, v in rec.items() if k != "hash"}).encode()).hexdigest()
    ls[1] = canonical(rec) + "\n"
    write_lines(led, ls)
    ok, msg = led.verify()
    assert not ok and msg.startswith("line 3:") and "prev_hash" in msg


@pytest.mark.parametrize("index", [0, 1, 2])
def test_deleted_line_is_detected(tmp_path, index):
    led = make_ledger(tmp_path)
    ls = lines(led)
    del ls[index]
    write_lines(led, ls)
    ok, msg = led.verify()
    assert not ok and msg.startswith(f"line {index + 1}:") and "deleted or reordered" in msg


def test_deleting_the_last_line_needs_the_head_witness(tmp_path):
    """Documented limit: dropping the tail leaves a valid chain; the stored head is the witness."""
    led = make_ledger(tmp_path)
    witnessed_head = led.head()
    write_lines(led, lines(led)[:-1])
    assert led.verify()[0]
    assert led.head() != witnessed_head


def test_swapped_lines_are_detected(tmp_path):
    led = make_ledger(tmp_path)
    ls = lines(led)
    ls[1], ls[2] = ls[2], ls[1]
    write_lines(led, ls)
    ok, msg = led.verify()
    assert not ok and msg.startswith("line 2:") and "deleted or reordered" in msg


def test_truncated_last_line_is_detected(tmp_path):
    led = make_ledger(tmp_path)
    text = led.path.read_text(encoding="utf-8")
    led.path.write_text(text[:-40], encoding="utf-8")  # an interrupted write
    ok, msg = led.verify()
    assert not ok and msg.startswith("line 4:") and "not a valid JSON record" in msg


def test_truncated_middle_line_is_detected(tmp_path):
    led = make_ledger(tmp_path)
    ls = lines(led)
    ls[1] = ls[1][: len(ls[1]) // 2] + "\n"
    write_lines(led, ls)
    ok, msg = led.verify()
    assert not ok and msg.startswith("line 2:")


def test_unterminated_last_line_is_detected(tmp_path):
    led = make_ledger(tmp_path)
    led.path.write_text(led.path.read_text(encoding="utf-8").rstrip("\n"), encoding="utf-8")
    ok, msg = led.verify()
    assert not ok and msg.startswith("line 4:") and "unterminated" in msg


@pytest.mark.parametrize("junk", ["garbage\n", "\n", "[1, 2, 3]\n", '{"seq": 2}\n', "\xff\n"])
def test_garbage_line_is_detected(tmp_path, junk):
    led = make_ledger(tmp_path)
    ls = lines(led)
    ls.insert(2, junk)
    write_lines(led, ls)
    ok, msg = led.verify()
    assert not ok and msg.startswith("line 3:")


def test_invalid_utf8_is_detected(tmp_path):
    led = make_ledger(tmp_path)
    led.path.write_bytes(led.path.read_bytes() + b"\xff\xfe\n")
    ok, msg = led.verify()
    assert not ok and msg.startswith("line 5:")


def test_missing_file_fails_verification(tmp_path):
    led = make_ledger(tmp_path)
    led.path.unlink()
    ok, msg = led.verify()
    assert not ok and "missing" in msg


def test_append_refuses_to_write_over_a_damaged_tail(tmp_path):
    led = make_ledger(tmp_path)
    with led.path.open("a", encoding="utf-8") as fh:
        fh.write('{"seq": 5, "trunc')
    before = led.path.read_bytes()
    with pytest.raises(LedgerError):
        led.append("mark", {}, as_of="2026-09-29", constitution_version="3.2.0")
    with pytest.raises(LedgerError):
        led.head()
    assert led.path.read_bytes() == before


def test_records_raises_on_a_bad_line(tmp_path):
    led = make_ledger(tmp_path)
    ls = lines(led)
    ls[1] = "not json\n"
    write_lines(led, ls)
    with pytest.raises(LedgerError, match="line 2"):
        list(led.records())


def test_head_reads_long_last_line(tmp_path):
    """The tail reader works across its 4 KiB read blocks."""
    led = make_ledger(tmp_path, n=2)
    rec = led.append("snapshot", {"blob": "x" * 20000}, as_of="2026-09-29", constitution_version="3.2.0")
    assert led.head() == rec["hash"]
    nxt = led.append("mark", {}, as_of="2026-09-29", constitution_version="3.2.0")
    assert nxt["prev_hash"] == rec["hash"] and led.verify()[0]
