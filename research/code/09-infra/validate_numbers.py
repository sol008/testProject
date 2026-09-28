#!/usr/bin/env python3
"""Anti-hallucination guard for trade emails (track 09 feasibility prototype).

Pattern: the data layer produces a JSON *snapshot* of every fact the email may cite. The LLM
writes prose that references numbers ONLY via {{placeholders}} naming snapshot keys. The
renderer substitutes formatted values; then this validator re-extracts every number from the
final text and checks it against the snapshot (tolerance = the rounding implied by the digits
shown). Any unmatched number, unknown placeholder or leftover literal blocks the send.

Run `python3 validate_numbers.py` for a self-test (no network, no LLM).
"""
import re
import sys
from datetime import date, datetime

PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([a-z0-9_]+))?\s*\}\}")
# numbers such as -3.2%, $1,234.56, 12.5x, 0.45 ; not glued to letters (tickers/ids)
NUM = re.compile(r"(?<![A-Za-z0-9_])([-+]?\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[-+]?\$?\d+(?:\.\d+)?)(%|x\b)?(?![A-Za-z0-9_])")
ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
TIME = re.compile(r"\b\d{1,2}:\d{2}\b")
ALLOWED_SMALL_INTS = set(range(0, 11))   # list numbering "1." / "Step 2" etc.


def fmt(value, style):
    if style == "usd":
        return f"${value:,.2f}"
    if style == "pct":          # snapshot stores fractions (0.052 -> 5.2%)
        return f"{value * 100:.1f}%"
    if style == "int":
        return f"{int(round(value)):,}"
    if style == "x":
        return f"{value:.1f}x"
    return str(value)


def render(template: str, snapshot: dict) -> str:
    def sub(m):
        key, style = m.group(1), m.group(2) or "raw"
        if key not in snapshot:
            raise KeyError(f"unknown placeholder {{{{{key}}}}} (not in data snapshot)")
        return fmt(snapshot[key], style)
    return PLACEHOLDER.sub(sub, template)


def _numeric_candidates(snapshot: dict):
    for k, v in snapshot.items():
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            continue
        yield k, float(v)
        yield k + "*100", float(v) * 100.0   # fraction shown as percent


def validate(text: str, snapshot: dict):
    """Return list of problems (empty list == pass)."""
    problems = []
    if PLACEHOLDER.search(text):
        problems.append("unrendered placeholder left in text")
    # Trusted string values from the snapshot (ids, timestamps, human-formatted dates) are
    # removed first, so only free-standing numbers remain to be checked.
    for sv in sorted((v for v in snapshot.values() if isinstance(v, str)), key=len, reverse=True):
        text = text.replace(sv, " ")
    allowed_dates = {str(v)[:10] for v in snapshot.values() if isinstance(v, str) and ISO_DATE.match(str(v)[:10])}
    allowed_times = {t for v in snapshot.values() if isinstance(v, str) for t in TIME.findall(v)}
    for d in ISO_DATE.findall(text):
        if d not in allowed_dates:
            problems.append(f"date {d} not in snapshot")
    scrubbed = TIME.sub(lambda m: " " if m.group(0) in allowed_times else m.group(0), ISO_DATE.sub(" ", text))
    for t in TIME.findall(scrubbed):
        problems.append(f"time {t} not in snapshot")
    scrubbed = TIME.sub(" ", scrubbed)
    for m in NUM.finditer(scrubbed):
        raw, suffix = m.group(1), m.group(2) or ""
        s = raw.replace("$", "").replace(",", "").lstrip("+")
        try:
            x = float(s)
        except ValueError:
            continue
        decimals = len(s.split(".")[1]) if "." in s else 0
        tol = 0.5 * 10 ** (-decimals) + 1e-9
        if decimals == 0 and abs(x) in ALLOWED_SMALL_INTS and not suffix and "$" not in raw:
            continue
        if any(abs(abs(x) - abs(v)) <= tol for _, v in _numeric_candidates(snapshot)):
            continue
        ctx = scrubbed[max(0, m.start() - 40): m.end() + 20].replace("\n", " ")
        problems.append(f"number {raw}{suffix} not traceable to snapshot  …{ctx}…")
    return problems


def _self_test():
    # FICTIONAL example data - not a recommendation.
    snapshot = {
        "ticker": "EXMPL", "asof": "2026-09-28T20:00:00Z", "last_close": 12.45,
        "offer_price": 13.50, "gross_spread": 0.0843, "annualized_spread": 0.231,
        "expected_close": "2027-01-15", "limit_price": 12.40, "shares": 400,
        "position_usd": 4960.0, "position_pct_of_equity": 0.05, "max_loss_usd": 1240.0,
        "p_deal_closes": 0.88, "valid_until": "2026-09-30 16:00 ET",
    }
    template = (
        "BUY {{shares|int}} shares of EXMPL with a limit of {{limit_price|usd}} (last close "
        "{{last_close|usd}}). The buyer offered {{offer_price|usd}} cash, a gross spread of "
        "{{gross_spread|pct}} ({{annualized_spread|pct}} annualized if it closes by "
        "{{expected_close}}). Size: {{position_usd|usd}} = {{position_pct_of_equity|pct}} of equity; "
        "max loss if the deal breaks ≈ {{max_loss_usd|usd}}. Our estimate: {{p_deal_closes|pct}} "
        "chance it closes. Order valid until {{valid_until}}.\nSteps: 1. Open ticket. 2. Enter limit."
    )
    ok = render(template, snapshot)
    print("RENDERED:\n" + ok + "\n")
    p1 = validate(ok, snapshot)
    print("clean draft ->", "PASS" if not p1 else p1)
    bad = ok.replace("(last close $12.45)", "(last close $12.52)") + " Upside is about 18%."
    p2 = validate(bad, snapshot)
    print("tampered draft ->", "PASS" if not p2 else "BLOCKED:")
    for p in p2:
        print("   -", p)
    try:
        render("Target {{price_target|usd}}", snapshot)
    except KeyError as e:
        print("unknown placeholder ->", e)
    assert not p1 and len(p2) == 2
    print("\nself-test OK")


if __name__ == "__main__":
    sys.exit(_self_test())
