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

Value AND slot (design §10)
---------------------------
A registered number is not enough for an order: "Limit price: $8.20" passes the value check when $8.20 is the stated
maximum. Option-spread emails therefore carry the order itself (`meta["order"]`: side, right, strikes, expiry,
contracts, limit and stated price, multiplier, OCC symbols) and the phrases that show its numbers (`meta["slots"]`,
e.g. "Limit price: {limit_price}"). `check_slots` recomputes every order value here, from the order alone (the totals
at the limit and at the stated price, the max loss, the max value, the breakeven, the width and the max multiple),
formats it the way the renderer does, and requires the number in each slot to be exactly that value, wherever the
phrase occurs in the subject, the text or the HTML. Fields that are facts rather than order values (the base rates)
come with their renderings in `meta["slot_values"]`. `meta["slots_required"]` lists phrases the text and HTML must
show (the order in the steps), so a slot cannot be dodged by rewording it. `meta["order_problems"]` lists facts that
disagree with the order (the renderer found them): any of them blocks the email.

The growth book's emails (design v4 §9; kinds GROWTH and RULE_E) carry their facts record in `meta["facts"]`. Their
slots are the numbered phrases of `traderec.growth.email.slot_specs` / `rule_e_slot_specs`, rebuilt here from the
facts alone (`growth_slots`): every phrase's fields are formatted by this module's own formatter (`_fmt_spec`) and
every phrase is required, so a target, an order amount, a "why" number or a risk-box figure in the wrong slot fails,
and the risk box cannot be left out when SSO, QLD or IBIT is bought or held (`growth_problems`).
"""
from __future__ import annotations

import html as _html
import math
import re
from datetime import date
from typing import Any

from .types import RenderedEmail

__all__ = ["ALLOWED_LITERALS", "check_slots", "growth_problems", "growth_slots", "html_to_text", "numeric_tokens",
           "order_values", "validate"]

# The only numbers a template may contain without registering them. Keep this set small and documented.
ALLOWED_LITERALS: frozenset[str] = frozenset({
    "9:30",      # the NYSE open, when Robinhood fills market orders queued after hours
    "9:20",      # the Sunday email's Step 1 deadline: the sells go in before 9:20 ET Monday (design v4 §3a.4)
    "9:35",      # the Sunday email's Step 2 time: the buys from about 9:35 ET, once the sells show Filled (v4 §3a.4)
    "10:00",     # earliest time for option-spread orders (design §3a, Phase B)
    "11:00",     # an option-spread order not filled by then is re-entered once at its stated price (design §3 M4)
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


# ------------------------------------------------------------------------------------------ value AND slot
MINUS = "−"
# What a slot's number may look like, by field kind. The lookarounds keep a slot from reading part of a number.
_KINDS = {
    "int": r"(?<![\w.,])\d+(?:,\d{3})*(?!,?\d|\.\d)",
    "num": r"(?<![\w.,$])[-+−]?\d+(?:,\d{3})*(?:\.\d+)?(?!,?\d|\.\d|%)",
    "money": r"(?<![\w.,])[-+−]?\$?\d+(?:,\d{3})*(?:\.\d+)?(?!,?\d|\.\d|%)",
    "pct": r"(?<![\w.,])[-+−]?\d+(?:,\d{3})*(?:\.\d+)?%",
    "pair": r"(?<![\w.,/])\d+(?:\.\d+)?/\d+(?:\.\d+)?(?!,?\d|\.\d)",
    "date": rf"(?<![\w.,])(?:(?:{_DAYS}) )?\d{{1,2}} (?:{_MON})\b(?: \d{{4}}\b)?",
    "occ": r"(?<!\w)[A-Z]{1,6}\d{6}[CP]\d{8}(?!\w)",
    "number": r"(?<![\w.,])[-+−]?\$?\d+(?:,\d{3})*(?:\.\d+)?%?(?!,?\d|\.\d)",
}
# The order values a slot can hold (see order_values) and fact fields; any other field reads as a "number".
FIELD_KINDS = {
    "contracts": "int", "multiplier": "int",
    "limit_price": "money", "max_price": "money", "per_spread_usd": "money", "total_usd": "money",
    "stated_total_usd": "money", "max_loss_usd": "money", "max_value_usd": "money", "max_per_spread_usd": "money",
    "width_money": "money",
    "long_strike": "num", "short_strike": "num", "width": "num", "breakeven": "num", "max_multiple": "num",
    "limit_plain": "num",
    "strikes": "pair", "expiry": "date", "long_occ": "occ", "short_occ": "occ",
    "win_rate": "pct", "mean_pct": "pct", "worst_pct": "pct",
}


def _sign(v: float, body: str, signed: bool) -> str:
    """As emails._sign: a minus for a negative non-zero body, a plus only when asked for."""
    nonzero = any(c in "123456789" for c in body)
    if v < 0 and nonzero:
        return MINUS
    return "+" if signed and v > 0 and nonzero else ""


def _fmt_money(v: float, *, cents: bool = False, signed: bool = False) -> str:
    """As emails.NumberRegistry.fmt_money: "$1,490", "$7.45", "−$1,640", signed "+$120"."""
    body = format(abs(v), ",.2f" if cents else ",.0f")
    return _sign(v, body, signed) + "$" + body


def _fmt_num(v: float, decimals: int | None = None, *, signed: bool = False, grouping: bool = True) -> str:
    """As emails.NumberRegistry.fmt_num: whole numbers as integers, others with up to 2 decimals (trailing zeros
    dropped); a fixed number of decimals keeps its zeros ("754.80")."""
    sep = "," if grouping else ""
    if decimals is None:
        body = format(abs(v), f"{sep}.0f" if float(v).is_integer() else f"{sep}.2f")
        body = body.rstrip("0").rstrip(".") if "." in body else body
    else:
        body = format(abs(v), f"{sep}.{decimals}f")
    return _sign(v, body, signed) + body


def _fmt_pct(v: float, decimals: int = 1, *, signed: bool = False, points: bool = False) -> str:
    """As emails.NumberRegistry.fmt_pct: a fraction (0.06 -> "6%") or percent units (points=True: 7.46 -> "7.5%"),
    trailing zeros dropped."""
    x = float(v) if points else float(v) * 100.0
    body = format(abs(x), f",.{decimals}f")
    body = body.rstrip("0").rstrip(".") if "." in body else body
    return _sign(x, body, signed) + body + "%"


_SPEC = re.compile(r"^(?P<mod>[sna]?)(?P<kind>money|ppct|pct|num|int|year)?(?P<dec>\d)?$")


def _fmt_spec(value: Any, spec: str) -> str:
    """This module's own rendering of a facts value under a template spec (the subset of emails.NumberRegistry.fmt
    the growth emails use): `money`/`money2`, `pct0..2` (a fraction), `ppct0..2` (percent units), `num0..2`, `int`,
    `year`; prefix `s` signed, `n` as a loss, `a` the magnitude."""
    m = _SPEC.match(spec or "")
    if not m:
        raise ValueError(f"unknown format spec {spec!r}")
    mod, kind, dec = m.group("mod"), m.group("kind") or "num", m.group("dec")
    places = int(dec) if dec is not None else None
    v = float(value)
    if mod == "n":
        v = -abs(v)
    elif mod == "a":
        v = abs(v)
    signed = mod == "s"
    if kind == "money":
        return _fmt_money(v, cents=bool(places), signed=signed)
    if kind in ("pct", "ppct"):
        return _fmt_pct(v, 1 if places is None else places, signed=signed, points=kind == "ppct")
    if kind == "int":
        return _fmt_num(float(round(v)), 0, signed=signed)
    if kind == "year":
        return _fmt_num(v, 0, grouping=False)
    return _fmt_num(v, places, signed=signed)


def _dates(iso: Any) -> list[str]:
    d = date.fromisoformat(str(iso).strip()[:10])
    return [f"{d:%a} {d.day} {d:%b} {d.year}", f"{d:%a} {d.day} {d:%b}", f"{d.day} {d:%b} {d.year}", f"{d.day} {d:%b}"]


def order_values(order: dict[str, Any]) -> dict[str, list[str]]:
    """Every value a slot may show, computed here from the order's own numbers (never from the renderer's text):
    the prices, contracts and strikes, the totals at the limit and at the stated price, the max loss (the total at the
    stated maximum, shown as a loss), the max value, the breakeven (long strike ± the limit), the width, the max
    multiple and the expiry (in every date style the emails use)."""
    def num(key: str) -> float | None:
        v = (order or {}).get(key)
        return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None

    n, lim, mx, lo, sh = (num(k) for k in ("contracts", "limit_price", "max_price", "long_strike", "short_strike"))
    m = num("multiplier") or 100.0
    call = str((order or {}).get("right") or "call").lower() != "put"
    out: dict[str, list[str]] = {"multiplier": [_fmt_num(m)]}
    if n is not None:
        out["contracts"] = [_fmt_num(n)]
    if lim is not None:
        out.update(limit_price=[_fmt_money(lim, cents=True)], limit_plain=[_fmt_num(lim, 2)],
                   per_spread_usd=[_fmt_money(lim * m)])
        if n is not None:
            out["total_usd"] = [_fmt_money(n * lim * m)]
    if mx is not None:
        out["max_price"] = [_fmt_money(mx, cents=True)]
        if n is not None:
            out.update(stated_total_usd=[_fmt_money(n * mx * m)], max_loss_usd=[_fmt_money(-(n * mx * m))])
    if lo is not None and sh is not None:
        width = abs(sh - lo)
        out.update(long_strike=[_fmt_num(lo)], short_strike=[_fmt_num(sh)], strikes=[f"{_fmt_num(lo)}/{_fmt_num(sh)}"],
                   width=[_fmt_num(width)], width_money=[_fmt_money(width, cents=not width.is_integer())],
                   max_per_spread_usd=[_fmt_money(width * m)])
        if n is not None:
            out["max_value_usd"] = [_fmt_money(n * width * m)]
        if lim:
            out["max_multiple"] = [_fmt_num(width / lim, 1)]
    if lo is not None and lim is not None:
        out["breakeven"] = [_fmt_num(lo + lim if call else lo - lim, 2)]
    if (order or {}).get("expiry"):
        try:
            out["expiry"] = _dates(order["expiry"])
        except ValueError:
            pass
    for key in ("long_occ", "short_occ"):
        if (order or {}).get(key):
            out[key] = [str(order[key])]
    return out


_SLOT_CACHE: dict[str, tuple[re.Pattern, list[str]]] = {}


def _slot_regex(template: str) -> tuple[re.Pattern, list[str]]:
    """"Limit price: {limit_price}" -> a regex whose groups read the numbers in the placeholders, and their fields."""
    if template not in _SLOT_CACHE:
        parts = re.split(r"\{(\w+)\}", template)
        pattern, fields = "", []
        for i, part in enumerate(parts):
            if i % 2:
                fields.append(part)
                pattern += f"({_KINDS[FIELD_KINDS.get(part, 'number')]})"
            else:
                pattern += re.escape(_WS.sub(" ", part))
        _SLOT_CACHE[template] = (re.compile(pattern), fields)
    return _SLOT_CACHE[template]


GROWTH_KINDS = ("GROWTH", "RULE_E")
_GROWTH_REQUIRED_FOR = ("SSO", "QLD", "IBIT")     # design v4 §9: the risk box is mandatory for these, bought or held


def growth_slots(kind: str, facts: dict[str, Any]) -> tuple[list[str], dict[str, list[str]]]:
    """The growth emails' slots from the facts record alone: (templates, {field: [its rendering]}). Every phrase of
    `growth.email.slot_specs` (GROWTH) or `rule_e_slot_specs` (RULE_E) is a slot, and every one is required."""
    from .growth.email import rule_e_slot_specs, slot_specs     # lazy: the growth package imports this module

    specs = slot_specs(facts) if kind == "GROWTH" else rule_e_slot_specs(facts)
    values: dict[str, list[str]] = {}
    for spec in specs:
        for field, (value, fmt) in spec["fields"].items():
            values[field] = [_fmt_spec(value, fmt)]
    return [s["template"] for s in specs], values


def growth_problems(kind: str, facts: dict[str, Any]) -> list[str]:
    """What the facts record itself rules out (design v4 §3a.8, §4, §9): more orders than an email may carry, a sell
    listed after a buy, a leveraged fund bought or held without its risk-box numbers in the facts, and more gems
    single names (or a larger one) than the caps in the facts' `g3` block allow."""
    problems: list[str] = []
    if kind != "GROWTH":
        return problems
    orders = facts.get("orders") or {}
    step1, step2 = list(orders.get("step1") or []), list(orders.get("step2") or [])
    max_orders = int(orders.get("max_orders") or 3)
    if len(step1) + len(step2) > max_orders:
        problems.append(f"{len(step1) + len(step2)} orders exceed the {max_orders} an email may carry")
    ranks1 = [int(o.get("rank") or 0) for o in step1]
    ranks2 = [int(o.get("rank") or 0) for o in step2]
    if ranks1 and ranks2 and max(ranks1) > min(ranks2):
        problems.append("a Step 1 sell is ranked after a Step 2 buy")
    risk = facts.get("risk") or {}
    required = list(risk.get("required_for") or _GROWTH_REQUIRED_FOR)
    bought = {o.get("ticker") for o in step2}
    held = {s.get("ticker") for s in (facts.get("sleeves") or []) if float(s.get("held_usd") or 0.0) > 0}
    funds = risk.get("funds") or {}
    for t in required:
        if (t in bought or t in held) and t not in funds:
            problems.append(f"risk box: {t} is bought or held but the facts carry no risk-box numbers for it")
    g3 = facts.get("g3") or {}                            # design v4 §4 "Single names": <= 5% each, <= 2 open (Phase C4a)
    if isinstance(g3, dict):
        slots = [s for s in (g3.get("slots") or []) if isinstance(s, dict)]
        g3_buys = [o for o in step2 if o.get("sleeve") == "G3"]
        n_open = sum(1 for s in slots if s.get("status") in ("open", "pending_exit")) + len(g3_buys)
        max_open = int(g3.get("single_names_max") or 0)
        if max_open and n_open > max_open:
            problems.append(f"gems: {n_open} single names open or bought, more than the {max_open} the caps allow")
        cap = g3.get("single_name_cap_usd")
        for o in g3_buys:
            if cap and float(o.get("usd") or 0.0) > float(cap) + 0.01:
                problems.append(f"gems: the {o.get('ticker')} buy of ${float(o.get('usd') or 0.0):,.0f} is above the "
                                f"single-name cap of ${float(cap):,.0f}")
    return problems


def check_slots(email: RenderedEmail) -> list[str]:
    """Value AND slot (design §10): the order problems the renderer found, then every declared slot checked against
    the order's own values in the subject, the text and the HTML (see the module docstring). [] when the email
    carries no order. For the growth emails the slots and their values come from the facts record (`growth_slots`)."""
    meta = email.meta or {}
    problems = [f"order: {p}" for p in meta.get("order_problems") or []]
    slots, required = list(meta.get("slots") or []), list(meta.get("slots_required") or [])
    kind = str(meta.get("kind") or "")
    values: dict[str, list[str]] | None = None
    if kind in GROWTH_KINDS:
        facts = meta.get("facts")
        if not isinstance(facts, dict):
            return problems + [f"{kind}: the email carries no facts record to check its numbers against"]
        problems += [f"facts: {p}" for p in growth_problems(kind, facts)]
        templates, values = growth_slots(kind, facts)
        slots = list(dict.fromkeys(slots + templates))
        required = list(dict.fromkeys(required + templates))
    if not (slots or required):
        return problems
    if values is None:
        values = order_values(meta.get("order") or {})
    for field, given in (meta.get("slot_values") or {}).items():
        values[field] = [str(x) for x in (given if isinstance(given, (list, tuple)) else [given])]
    parts = (("subject", email.subject or ""), ("text", email.text or ""), ("html", html_to_text(email.html or "")))
    for part, raw in parts:
        norm = _normalise(raw, steps=True)
        for template in dict.fromkeys(slots + required):
            rx, fields = _slot_regex(template)
            if any(f not in values for f in fields):
                continue                            # the order has no such value: nothing to hold the slot to
            hits = 0
            for m in rx.finditer(norm):
                hits += 1
                for field, got in zip(fields, m.groups()):
                    if got not in values[field]:
                        around = norm[max(0, m.start() - 30): m.end() + 30]
                        source = "the facts say" if kind in GROWTH_KINDS else "the order says"
                        problems.append(f'{part}: the {field} slot reads "{got}" but {source} '
                                        f'"{values[field][0]}" (…{around}…)')
            if part != "subject" and template in required and not hits:
                problems.append(f'{part}: the order\'s "{template}" is missing (reworded or changed)')
    return problems


def validate(email: RenderedEmail) -> list[str]:
    """Return readable problems; an empty list means every number in the email is accounted for, and every order
    number sits in its slot (`check_slots`)."""
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
    return problems + check_slots(email)
