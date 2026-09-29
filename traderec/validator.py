"""Number validator for rendered emails (design §10; research/11-trade-email-spec.md §7, gate 1).

`validate(email)` finds every numeric token in the subject, the plain-text part and the visible text of the
HTML part. Each token must be one the renderer registered (`RenderedEmail.numbers_registered`, produced by the
`fmt_*` helpers in `traderec.emails`) or one of `ALLOWED_LITERALS`. Anything else is a number that did not come
from the data layer, so the email is blocked.

Numeric tokens are money (`$6,000`, `−$1,956`), percents (`82%`, `+0.88%`), decimals (`3.8`), integers
(`20`, `100,000`), multiples (`2.5x`), dates (`2026-10-03`, `Fri 3 Oct`, `3 Oct 2026`, `October 2026`),
times (`22:17`, `4pm`), fractions (`24/7`) and section references (`§8`). A leading sign is part of the token,
so a flipped sign fails.

Not checked:
- identifiers: digits glued to letters (`M1`, `IBIT`, `v3.2.0`), trade/order/forecast ids (`T-2026-10-02-M1`),
  hex hashes of 8+ characters (the ledger head) and URLs;
- list step numbers: `  1. ` at the start of a line (the renderer's ordered-list format).

Registered strings are tokenised the same way, so registering `"Fri 3 Oct"` allows exactly the token
`Fri 3 Oct`, and registering a sentence from the data layer allows the numbers inside it.
"""
from __future__ import annotations

import html as _html
import re

from .types import RenderedEmail

__all__ = ["ALLOWED_LITERALS", "html_to_text", "numeric_tokens", "validate"]

# The only numbers a template may contain without registering them. Keep this set small and documented.
ALLOWED_LITERALS: frozenset[str] = frozenset({
    "9:30",      # the NYSE open, when Robinhood fills market orders queued after hours
    "10:00",     # earliest time for option-spread orders (design §3a, Phase B)
    "24/7",      # Coinbase trading hours
    "S&P 500",   # index name
    "§8",        # design section on rule changes (the monthly email's "no rule changes" line)
})

_DAYS = "Mon|Tue|Wed|Thu|Fri|Sat|Sun"
_MON = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
_MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"

_TOKEN = re.compile(
    r"(?P<phrase>S&P 500\b)"
    r"|(?P<date>"
    r"\b\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?(?![\w:])"
    rf"|\b(?:(?:{_DAYS}) )?\d{{1,2}} (?:{_MON})\b(?: \d{{4}}\b)?"
    rf"|\b(?:{_MONTHS}|{_MON}) \d{{4}}\b"
    r")"
    r"|(?P<time>\b\d{1,2}(?::\d{2})? ?(?:am|pm|AM|PM)\b|\b\d{1,2}:\d{2}\b)"
    r"|(?P<frac>\b\d+/\d+\b)"
    r"|(?P<section>§ ?\d+[a-z]?\b)"
    # Numbers: optional sign and $, digits with optional thousands groups and decimals, optional unit suffix.
    # Atomic so "12abc" is skipped as an identifier instead of yielding "12".
    r"|(?P<num>(?<![\w.])(?>[-+−]?\$?\d+(?:,\d{3})*(?:\.\d+)?(?:%|×|x|k|K|bn|bp|st|nd|rd|th)?)(?!\w))"
)
_STEP = re.compile(r"(?m)^  (?:[1-9]|1\d|20)\. (?=\S)")
_URL = re.compile(r"https?://\S+")
_ID = re.compile(r"\b[A-Z]{1,3}-\d{4}-\d{2}-\d{2}(?:-[A-Za-z0-9]+)*")
_HEX = re.compile(r"\b(?=[0-9a-fA-F]*[a-fA-F])(?=[0-9a-fA-F]*\d)[0-9a-fA-F]{8,}\b")
_BOX = re.compile(r"[─-╿]")
_WS = re.compile(r"\s+")
_PLACEHOLDER = re.compile(r"\{[A-Za-z_][\w.]*(?::[\w]*)?\}")


def _normalise(s: str, *, steps: bool) -> str:
    """Drop what is not checked (step numbers, URLs, ids, hashes, box lines), then collapse whitespace so a
    token wrapped across two lines ("Fri\\n3 Oct") reads the same as the registered string."""
    if steps:
        s = _STEP.sub("  ", s)
    s = _URL.sub(" ", s)
    s = _ID.sub(" ", s)
    s = _HEX.sub(" ", s)
    s = _BOX.sub(" ", s)
    return _WS.sub(" ", s).strip()


def _scan(s: str) -> list[tuple[str, int, int]]:
    return [(m.group(0), m.start(), m.end()) for m in _TOKEN.finditer(s)]


def numeric_tokens(text: str) -> list[str]:
    """The numeric tokens `validate` would check in `text` (after skipping ids, hashes, URLs and steps)."""
    return [t for t, _, _ in _scan(_normalise(text, steps=True))]


def html_to_text(html: str) -> str:
    """Visible text of an HTML part: head/style/script and comments removed, tags replaced by spaces."""
    s = re.sub(r"(?is)<(head|style|script)\b.*?</\1\s*>", " ", html or "")
    s = re.sub(r"(?s)<!--.*?-->", " ", s)
    s = re.sub(r"<[^>]*>", " ", s)
    return _html.unescape(s)


def validate(email: RenderedEmail) -> list[str]:
    """Return readable problems; an empty list means every number in the email is accounted for."""
    allowed = set(ALLOWED_LITERALS)
    for reg in email.numbers_registered or []:
        norm = _normalise(str(reg), steps=False)
        allowed.add(norm)
        allowed.update(t for t, _, _ in _scan(norm))

    problems: list[str] = []
    parts = (("subject", email.subject or ""), ("text", email.text or ""), ("html", html_to_text(email.html or "")))
    for part, raw in parts:
        norm = _normalise(raw, steps=True)
        for tok, start, end in _scan(norm):
            if tok not in allowed:
                around = norm[max(0, start - 40): end + 40]
                problems.append(f'{part}: number "{tok}" is not registered or an allowed literal (…{around}…)')
        if part != "html":
            for m in _PLACEHOLDER.finditer(raw):
                problems.append(f'{part}: unrendered placeholder "{m.group(0)}"')
    return problems
