"""EDGAR and FINRA adapters for the EDGAR/FINRA shadow screens (design v3.3 §3 "Shadow ledger", §10 data table;
track 16 §7 and §10.4 P1; track 05 §11 D). With `providers.py`, the only traderec code that touches the network.

The runner (`traderec.runners.edgar`) takes these clients from the data provider (`provider.edgar`, `provider.finra`),
so tests inject clients whose ``session`` serves recorded payloads. Payload parsing lives in pure functions
(``parse_*``, ``html_to_text``, ``group_filings``), tested on small recorded fixtures.

Sources (all checked from the build sandbox on 29 Sep 2026):

* EDGAR full-text search (EFTS), ``efts.sec.gov/LATEST/search-index``. It gives one hit per document, 100 per page,
  with the accession number, form, filing date, filer CIKs and display names (tickers for listed filers) and, for
  8-Ks, the item numbers. It answers a generic User-Agent, and now and then HTTP 500 (retried). Filings are indexed
  within minutes (track 16 §7: 10 of the 10 newest Form 4s).
* ``data.sec.gov``: submissions (``/submissions/CIK##########.json``: tickers, exchanges) and XBRL company concepts
  (shares outstanding, each fact with the date it was filed, so the value is point-in-time). Generic UA is fine.
* ``www.sec.gov/Archives``: the filing documents (Form 4 XML, 8-K exhibits, proxies, tender offers). www.sec.gov
  answers HTTP 403 ("Undeclared Automated Tool") unless the User-Agent declares who is asking, as the SEC's
  fair-access policy requires (a name and a contact e-mail). ``www.sec.gov/cgi-bin/browse-edgar`` (the Atom feed)
  and the daily index are refused the same way. The owner therefore sets SEC_USER_AGENT; the default below is a
  generic product string that reaches EFTS and data.sec.gov only.
* FINRA consolidated short interest (twice a month): ``api.finra.org`` per symbol, then the file
  ``cdn.finra.org/equity/otcmarket/biweekly/shrtYYYYMMDD.csv``.

Fair access: at most 10 requests a second to *.sec.gov. One limiter paces every SEC host together (8 a second by
default), across the document worker threads. Every request has a 20 s timeout. HTTP 429 and 5xx are retried 1, 2
and 4 s apart. HTTP 403 fails at once (`EdgarAccessDenied`). `EdgarClient.start` sets a run's work budget (a
wall-clock deadline and a document allowance); past it, calls raise `BudgetExhausted` and the runner carries the
rest over to its next run.

Purchase pre-filter: an EFTS search of Form 4s for the token "P" (the transaction code of an open-market purchase)
returned every Form 4 that carries a purchase code, on the two days checked (45 of 45 among 372 Form 4s on
2026-09-28; 36 of 36 among 349 on 2026-09-25), plus 6 and 20 others. The SH-1 screen fetches only those, and checks
each night that the pre-filter still returns hits on a busy day.
"""
from __future__ import annotations

import html as html_lib
import io
import logging
import math
import os
import re
import threading
import time
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any

import pandas as pd
import requests

from traderec import __version__
from traderec.data.providers import DataError

__all__ = [
    "BudgetExhausted",
    "DEFAULT_USER_AGENT",
    "EdgarAccessDenied",
    "EdgarClient",
    "FinraClient",
    "RateLimiter",
    "SEC_USER_AGENT_ENV",
    "display_name",
    "group_filings",
    "html_to_text",
    "parse_cef_tender",
    "parse_cef_tender_result",
    "parse_concept_value",
    "parse_efts",
    "parse_finra_si_file",
    "parse_finra_si_rows",
    "parse_form4",
    "parse_long_date",
    "parse_merger_terms",
    "parse_merger_update",
    "parse_shares_outstanding",
    "parse_special_dividend",
    "parse_submissions",
    "sec_user_agent",
    "yahoo_symbol",
]

log = logging.getLogger(__name__)

SEC_USER_AGENT_ENV = "SEC_USER_AGENT"
# Generic on purpose (docs/PHASE_B_CONTRACTS.md §0.5): no name, no contact. It reaches EFTS and data.sec.gov;
# www.sec.gov needs the owner's SEC_USER_AGENT (see the module docstring and docs/phase-b/edgar.md).
DEFAULT_USER_AGENT = f"traderec/{__version__} (paper-trading shadow screens)"

EFTS_URL = "https://efts.sec.gov/LATEST/search-index"           # 100 hits a page, "from" pages on
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
CONCEPT_URL = "https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/{taxonomy}/{tag}.json"
ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{folder}/{filename}"
FINRA_SI_API = "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest"
FINRA_SI_FILE = "https://cdn.finra.org/equity/otcmarket/biweekly/shrt{ymd}.csv"
FINRA_SI_FIELDS = ("settlementDate", "symbolCode", "currentShortPositionQuantity", "averageDailyVolumeQuantity",
                   "daysToCoverQuantity", "marketClassCode")
SHARES_CONCEPTS = (("dei", "EntityCommonStockSharesOutstanding"), ("us-gaap", "CommonStockSharesOutstanding"))
PUBLIC_FLOAT_CONCEPT = ("dei", "EntityPublicFloat")    # USD, once a year on the 10-K cover
PUBLIC_FLOAT_MAX_AGE_DAYS = 550

DEFAULT_RATE = 8.0              # requests a second to *.sec.gov (the SEC's limit is 10)
MAX_RATE = 10.0
TIMEOUT_SECONDS = 20.0
BACKOFF_SECONDS: tuple[float, ...] = (1.0, 2.0, 4.0)
MAX_DOCUMENT_BYTES = 8_000_000  # merger proxies run to a few MB; nothing we read is larger
SHARES_MAX_AGE_DAYS = 400       # track 16 shares_out.py: an older cover-page count is not used


class EdgarAccessDenied(DataError):
    """www.sec.gov refused the request (HTTP 403): an undeclared User-Agent, or the SEC's rate threshold."""


class BudgetExhausted(DataError):
    """The run's EDGAR work budget (seconds or documents) is used up; the rest waits for the next run."""


class _NotFound(DataError):
    """HTTP 404."""


def sec_user_agent() -> str:
    """The User-Agent for SEC requests: SEC_USER_AGENT when set (name and contact), else the generic default."""
    return (os.environ.get(SEC_USER_AGENT_ENV) or "").strip() or DEFAULT_USER_AGENT


# --------------------------------------------------------------------------------------------------------
# Pure helpers and payload parsers (no network, no clock)
# --------------------------------------------------------------------------------------------------------

_TICKER = r"[A-Z0-9][A-Z0-9.\-]{0,9}"
_DISPLAY = re.compile(rf"^(?P<name>.*?)\s*(?:\((?P<tickers>{_TICKER}(?:,\s*{_TICKER})*)\))?"
                      r"\s*\(CIK\s*(?P<cik>\d+)\)\s*$")


def display_name(text: str) -> dict:
    """An EFTS display name -> {"name", "tickers", "cik"}.

    "Colliers International Group Inc.  (CIGI)  (CIK 0000913353)" -> ("Colliers International Group Inc.",
    ["CIGI"], 913353). Filers without a listed security have no tickers.
    """
    m = _DISPLAY.match(str(text or "").strip())
    if not m:
        return {"name": str(text or "").strip(), "tickers": [], "cik": None}
    tickers = [t.strip() for t in (m["tickers"] or "").split(",") if t.strip()]
    return {"name": m["name"].strip(), "tickers": tickers, "cik": int(m["cik"])}


def parse_efts(payload: Any) -> tuple[list[dict], int]:
    """EFTS JSON -> (hits, total). A hit is one document of a filing:

    {"adsh", "filename", "form", "file_type", "file_date", "period", "ciks", "entities", "items", "sics"}, where
    `entities` are the parsed display names, in EFTS order (for a Schedule 13D the subject company comes first; for
    a Form 4 the reporting owners, then the issuer). Raises DataError for a payload without hits.
    """
    try:
        hits = payload["hits"]["hits"]
        total = int(payload["hits"]["total"]["value"])
    except (KeyError, TypeError, ValueError) as exc:
        raise DataError(f"EFTS payload has no hits: {str(payload)[:160]}") from exc
    out = []
    for h in hits:
        src = h.get("_source") or {}
        adsh, _, filename = str(h.get("_id", "")).partition(":")
        out.append({
            "adsh": src.get("adsh") or adsh,
            "filename": filename,
            "form": src.get("form"),
            "file_type": src.get("file_type"),
            "file_date": src.get("file_date"),
            "period": src.get("period_ending"),
            "ciks": [int(c) for c in (src.get("ciks") or []) if str(c).isdigit()],
            "entities": [display_name(n) for n in (src.get("display_names") or [])],
            "items": [str(i) for i in (src.get("items") or [])],
            "sics": list(src.get("sics") or []),
        })
    return out, total


def group_filings(hits: Iterable[dict], forms: Sequence[str] | None = None) -> list[dict]:
    """EFTS hits -> one record per filing (accession), in first-seen order, keeping every matching document.

    {"adsh", "form", "file_date", "period", "ciks", "entities", "items", "docs": [{"filename", "file_type"}]}.
    `forms` keeps only those exact form types (e.g. "4" drops "4/A"; "SCHEDULE 13D" drops amendments).
    """
    by: dict[str, dict] = {}
    for h in hits:
        if forms is not None and h.get("form") not in forms:
            continue
        f = by.get(h["adsh"])
        if f is None:
            f = by[h["adsh"]] = {k: h.get(k) for k in ("adsh", "form", "file_date", "period", "ciks", "entities",
                                                       "items")}
            f["docs"] = []
        if h.get("filename") and all(d["filename"] != h["filename"] for d in f["docs"]):
            f["docs"].append({"filename": h["filename"], "file_type": h.get("file_type")})
    return list(by.values())


def yahoo_symbol(ticker: Any) -> str | None:
    """An EDGAR ticker -> the Yahoo symbol (BRK.B -> BRK-B; "NASDAQ: XYZ" -> XYZ); None for "NONE", "N/A" or blank."""
    t = str(ticker or "").strip().upper()
    t = re.sub(r"^(?:NYSE|NASDAQ|NYSEMKT|NYSE AMERICAN|AMEX|NYSEARCA|OTC|OTCBB|OTCQX|OTCQB)\s*[:\-]\s*", "", t)
    t = t.replace(".", "-").replace("/", "-").replace(" ", "")
    if not t or t in ("NONE", "N-A", "NA", "NULL", "-") or not re.fullmatch(r"[A-Z0-9][A-Z0-9\-]{0,9}", t):
        return None
    return t


_BLOCK_TAGS = (r"(?:p|div|br|tr|td|th|li|ul|ol|table|thead|tbody|h[1-6]|hr|title|section|article|center|dd|dt|dl|"
               r"blockquote|pre|body|html|document|type|sequence|filename|description|text)")


def html_to_text(raw: str | bytes) -> str:
    """HTML (or SGML-wrapped EDGAR text) -> one line of plain text.

    Block tags become spaces and inline tags vanish, so a word split by formatting ("J<span>anuary</span>") stays
    whole. Entities are unescaped; non-breaking and zero-width spaces are normalised; whitespace is collapsed.
    """
    if isinstance(raw, bytes):
        raw = _decode(raw)
    s = re.sub(r"(?is)<(script|style|head|ix:header)\b[^>]*>.*?</\1\s*>", " ", raw)
    s = re.sub(r"(?is)<!--.*?-->", " ", s)
    s = re.sub(rf"(?is)</?{_BLOCK_TAGS}\b[^>]*>", " ", s)
    s = re.sub(r"(?s)<[^>]*>", "", s)
    s = html_lib.unescape(s)
    s = s.replace("\xa0", " ").replace("​", "").replace(" ", " ").replace("’", "'")
    return re.sub(r"\s+", " ", s).strip()


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1")


# Abbreviations whose periods would end a sentence-level regex window ("5:00 p.m., New York City time, on ...").
_ABBREV = [(re.compile(r"\b([ApAP])\.\s?([Mm])\."), r"\1\2"), (re.compile(r"\bU\.S\."), "US"),
           (re.compile(r"\b(No|Nos|Inc|Corp|Co|Ltd|Mfg|Jr|Sr|St|Mr|Ms|Mrs|Dr|Bros|Assn|Cos|Ave|Hldgs)\.(?=\s)", re.I),
            r"\1"),
           (re.compile(r"\bL\.L\.C\."), "LLC"), (re.compile(r"\bL\.P\."), "LP"), (re.compile(r"\bN\.A\."), "NA")]


def _normalise(text: str) -> str:
    for rx, rep in _ABBREV:
        text = rx.sub(rep, text)
    return text


_MONTHS = {m: i + 1 for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov",
                                           "dec"))}
DATE_RX = (r"(?:January|February|March|April|May|June|July|August|September|October|November|December|"
           r"Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?)"
           r"\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}")
_MONEY = r"\$\s?(?P<amt>\d{1,4}(?:,\d{3})*(?:\.\d{1,6})?)"


def parse_long_date(text: Any) -> str | None:
    """"October 15, 2026" / "Oct. 15 2026" -> "2026-10-15"; None when it is not a valid date."""
    m = re.match(r"\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", str(text or ""))
    if not m or m.group(1).lower() not in _MONTHS:
        return None
    try:
        return date(int(m.group(3)), _MONTHS[m.group(1).lower()], int(m.group(2))).isoformat()
    except ValueError:
        return None


def _money(s: str) -> float | None:
    try:
        v = float(s.replace(",", ""))
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) and v > 0 else None


def _sentence(text: str, start: int, end: int) -> str:
    """The sentence around text[start:end] (a period followed by a space and a capital, quote or bracket ends one)."""
    a = 0
    for m in re.finditer(r"[.!?]\s+(?=[A-Z\"“(•])", text[:start]):
        a = m.end()
    m = re.search(r"[.!?](?=\s+[A-Z\"“(•]|\s*$)", text[end:])
    b = end + m.end() if m else len(text)
    return text[a:b]


# --- Form 4 ------------------------------------------------------------------------------------------------

def _xml_text(node: ET.Element | None, path: str) -> str | None:
    if node is None:
        return None
    el = node.find(path)
    if el is None:
        return None
    v = el.find("value")
    txt = (v.text if v is not None else el.text) or ""
    txt = txt.strip()
    return txt or None


def _xml_float(node: ET.Element | None, path: str) -> float | None:
    txt = _xml_text(node, path)
    if txt is None:
        return None
    try:
        v = float(txt.replace(",", "").replace("$", ""))
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def _xml_flag(node: ET.Element | None, path: str) -> bool:
    return (_xml_text(node, path) or "").strip().lower() in ("1", "true", "yes", "y")


def parse_form4(xml: str | bytes) -> dict:
    """A Form 3/4/5 ownership XML -> {"document_type", "period", "issuer", "owners", "transactions"}.

    * issuer: {"cik", "name", "symbol"};
    * owners, in filing order (a joint filing lists several): {"cik", "name", "director", "officer", "ten_pct",
      "other", "title"};
    * transactions, the non-derivative table only: {"title", "date", "form_type", "code", "shares", "price",
      "acq_disp", "direct"}. A missing number is None.

    Raises DataError when the XML does not parse or is not an ownership document.
    """
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise DataError(f"Form 4 XML does not parse: {exc}") from exc
    if root.tag != "ownershipDocument":
        raise DataError(f"not an ownership document: <{root.tag}>")
    issuer = root.find("issuer")
    out: dict[str, Any] = {
        "document_type": (_xml_text(root, "documentType") or "").strip(),
        "period": _xml_text(root, "periodOfReport"),
        "issuer": {"cik": int(_xml_text(issuer, "issuerCik") or 0) or None,
                   "name": _xml_text(issuer, "issuerName"),
                   "symbol": _xml_text(issuer, "issuerTradingSymbol")},
        "owners": [],
        "transactions": [],
    }
    for ro in root.findall("reportingOwner"):
        rel = ro.find("reportingOwnerRelationship")
        out["owners"].append({
            "cik": int(_xml_text(ro, "reportingOwnerId/rptOwnerCik") or 0) or None,
            "name": _xml_text(ro, "reportingOwnerId/rptOwnerName"),
            "director": _xml_flag(rel, "isDirector"),
            "officer": _xml_flag(rel, "isOfficer"),
            "ten_pct": _xml_flag(rel, "isTenPercentOwner"),
            "other": _xml_flag(rel, "isOther"),
            "title": _xml_text(rel, "officerTitle") or "",
        })
    table = root.find("nonDerivativeTable")
    for tx in (table.findall("nonDerivativeTransaction") if table is not None else []):
        out["transactions"].append({
            "title": _xml_text(tx, "securityTitle") or "",
            "date": (_xml_text(tx, "transactionDate") or "")[:10] or None,
            "form_type": (_xml_text(tx, "transactionCoding/transactionFormType") or "").strip(),
            "code": (_xml_text(tx, "transactionCoding/transactionCode") or "").strip().upper(),
            "shares": _xml_float(tx, "transactionAmounts/transactionShares"),
            "price": _xml_float(tx, "transactionAmounts/transactionPricePerShare"),
            "acq_disp": (_xml_text(tx, "transactionAmounts/transactionAcquiredDisposedCode") or "").strip().upper(),
            "direct": (_xml_text(tx, "ownershipNature/directOrIndirectOwnership") or "").strip().upper(),
        })
    return out


# --- data.sec.gov -------------------------------------------------------------------------------------------

def parse_submissions(payload: Any) -> dict:
    """data.sec.gov submissions JSON -> {"cik", "name", "tickers", "exchanges", "sic", "entity_type"}."""
    if not isinstance(payload, Mapping) or "cik" not in payload:
        raise DataError(f"not a submissions payload: {str(payload)[:120]}")
    return {"cik": int(payload["cik"]), "name": payload.get("name"),
            "tickers": [str(t) for t in payload.get("tickers") or []],
            "exchanges": [str(e) for e in payload.get("exchanges") or [] if e],
            "sic": payload.get("sic"), "entity_type": payload.get("entityType")}


def parse_concept_value(payload: Any, asof: str, unit: str = "shares",
                        max_age_days: int = SHARES_MAX_AGE_DAYS) -> dict | None:
    """The latest value of an XBRL company concept a company had reported by `asof`, or None.

    Point in time: only facts filed on or before `asof`, with a period end on or before it and at most
    `max_age_days` old. The latest period end wins, then the latest filing. Returns {"value", "end", "filed",
    "form"}.
    """
    try:
        facts = payload["units"][unit]
    except (KeyError, TypeError):
        return None
    day = str(asof)[:10]
    oldest = (pd.Timestamp(day) - pd.Timedelta(days=max_age_days)).strftime("%Y-%m-%d")
    best = None
    for f in facts:
        end, filed, val = str(f.get("end", "")), str(f.get("filed", "")), f.get("val")
        if not end or not filed or filed > day or end > day or end < oldest:
            continue
        try:
            value = float(val)
        except (TypeError, ValueError):
            continue
        if value <= 0 or not math.isfinite(value):
            continue
        key = (end, filed)
        if best is None or key > best[0]:
            best = (key, {"value": value, "end": end, "filed": filed, "form": f.get("form")})
    return best[1] if best else None


def parse_shares_outstanding(payload: Any, asof: str, max_age_days: int = SHARES_MAX_AGE_DAYS) -> dict | None:
    """Shares outstanding reported by `asof` (see `parse_concept_value`): {"shares", "end", "filed", "form"} or None."""
    found = parse_concept_value(payload, asof, "shares", max_age_days)
    if found is None:
        return None
    return {"shares": found.pop("value"), **found}


# --- FINRA ---------------------------------------------------------------------------------------------------

def parse_finra_si_rows(rows: Any, asof: str, lag_days: int = 12) -> dict | None:
    """The latest short-interest record published by `asof`, from FINRA rows ({"settlementDate", ...}).

    FINRA publishes about seven business days after each settlement date, so a record counts from settlement +
    `lag_days` calendar days (track 16 finra_si.py). Returns {"settlement_date", "short_qty", "avg_daily_volume",
    "days_to_cover"} or None.
    """
    if not isinstance(rows, list):
        return None
    limit = (pd.Timestamp(str(asof)[:10]) - pd.Timedelta(days=lag_days)).strftime("%Y-%m-%d")
    ok = [r for r in rows if isinstance(r, Mapping) and str(r.get("settlementDate", ""))[:10] <= limit
          and r.get("currentShortPositionQuantity") is not None]
    if not ok:
        return None
    r = max(ok, key=lambda x: str(x["settlementDate"]))

    def num(v: Any) -> float | None:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return f if math.isfinite(f) else None

    return {"settlement_date": str(r["settlementDate"])[:10], "short_qty": num(r.get("currentShortPositionQuantity")),
            "avg_daily_volume": num(r.get("averageDailyVolumeQuantity")),
            "days_to_cover": num(r.get("daysToCoverQuantity"))}


def parse_finra_si_file(text: str, symbol: str) -> list[dict]:
    """One symbol's rows from FINRA's twice-monthly short-interest file (pipe-delimited, quoted)."""
    frame = pd.read_csv(io.StringIO(text), sep="|", dtype=str, keep_default_na=False)
    frame.columns = [str(c).strip().strip('"') for c in frame.columns]
    if "symbolCode" not in frame.columns:
        raise DataError("FINRA short-interest file has no symbolCode column")
    rows = frame[frame["symbolCode"].str.strip().str.upper() == str(symbol).strip().upper()]
    return [{k: (v if v != "" else None) for k, v in row.items()} for row in rows.to_dict(orient="records")]


# --- 8-K special dividends (SH-2) ----------------------------------------------------------------------------

_SPECIAL_AMOUNT = [
    re.compile(r"special\s+(?:one[- ]time\s+)?(?:cash\s+)?dividend\b[^$.;]{0,120}?" + _MONEY +
               r"\s*(?:per|a|for\s+each)\s+(?:common\s+|ordinary\s+)?share", re.I),
    re.compile(_MONEY + r"\s*(?:per\s+(?:common\s+)?share\s+)?special\s+(?:one[- ]time\s+)?(?:cash\s+)?dividend", re.I),
]
_DECLARED = re.compile(r"\b(?:declar\w*|approv\w*|announc\w*|authoriz\w*|will\s+(?:be\s+)?pa(?:y|id)|payable)\b", re.I)
_RECORD = [
    re.compile(r"of\s+record\b[^.]{0,160}?(?:as\s+of|on|at\s+the\s+close\s+of\s+business(?:\s+on)?)\s+"
               r"(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday),?\s+)?(" + DATE_RX + ")", re.I),
    re.compile(r"record\s+date\s+(?:of|is|will\s+be|for\s+[^.]{0,60}?\s+(?:is|will\s+be))\s+(" + DATE_RX + ")", re.I),
]
_PAYABLE = re.compile(r"(?:payable|(?:will\s+be\s+)?paid|payment\s+date\s+of)\s+(?:on\s+)?(?:or\s+about\s+)?"
                      r"(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday),?\s+)?(" + DATE_RX + ")", re.I)
_EX_DATE = re.compile(r"ex-?(?:dividend\s+)?date\s+(?:of|is|will\s+be|for\s+[^.]{0,60}?\s+(?:is|will\s+be))?\s*(" +
                      DATE_RX + ")", re.I)
_CONTINGENT = re.compile(r"contingent\s+(?:up)?on|conditioned\s+(?:up)?on\s+(?:the\s+)?(?:closing|completion|"
                         r"consummation)|subject\s+to\s+(?:and\s+contingent\s+upon\s+)?the\s+(?:closing|completion|"
                         r"consummation)", re.I)


def parse_special_dividend(text: str) -> dict | None:
    """The special cash dividend a release declares, or None.

    {"amount", "record_date", "payable_date", "ex_date", "contingent", "sentence"}. The amount must sit next to
    "special (cash) dividend" in a sentence that declares it (declared, approved, announced, payable ...), so a
    past special dividend mentioned in an earnings release does not count. Dates are ISO strings or None; they
    are read from the declaring sentence and the 700 characters after it.
    """
    t = _normalise(text)
    for rx in _SPECIAL_AMOUNT:
        for m in rx.finditer(t):
            sentence = _sentence(t, m.start(), m.end())
            if not _DECLARED.search(sentence):
                continue
            amount = _money(m["amt"])
            if amount is None:
                continue
            window = t[max(0, m.start() - 200): m.end() + 700]
            after = t[m.start(): m.end() + 700]
            record = next((parse_long_date(r.group(1)) for rx2 in _RECORD for r in [rx2.search(after)] if r), None)
            payable = _PAYABLE.search(after)
            ex = _EX_DATE.search(after)
            return {"amount": amount, "record_date": record,
                    "payable_date": parse_long_date(payable.group(1)) if payable else None,
                    "ex_date": parse_long_date(ex.group(1)) if ex else None,
                    "contingent": bool(_CONTINGENT.search(t[m.start(): m.end() + 1500]) or
                                       _CONTINGENT.search(window)),
                    "sentence": sentence.strip()[:400]}
    return None


# --- mergers (SH-4) ------------------------------------------------------------------------------------------

_CONSIDERATION = [
    re.compile(r"right\s+to\s+receive\s+(?:an\s+amount\s+(?:in\s+cash\s+)?equal\s+to\s+)?(?:the\s+sum\s+of\s+)?"
               r"(?:\(i\)\s*)?(?:the\s+Merger\s+Consideration\s+of\s+)?" + _MONEY, re.I),
    re.compile(_MONEY + r"\s+per\s+share\s+in\s+cash", re.I),
    re.compile(_MONEY + r"\s+in\s+cash,?\s+(?:without\s+interest,?\s+)?(?:per|for\s+each)\s+(?:outstanding\s+)?share",
               re.I),
]
_SENTENCE_END = re.compile(r"\.(?=\s+[A-Z\"“(•]|\s*$)")
_NO_FINANCING = re.compile(r"not\s+(?:be\s+)?(?:subject\s+to|conditioned\s+(?:up)?on)\s+(?:any\s+|a\s+|the\s+)?"
                           r"(?:receipt\s+of\s+(?:any\s+)?|obtaining\s+(?:any\s+)?)?financing|no\s+financing\s+"
                           r"condition|without\s+(?:any\s+|a\s+)?financing\s+condition", re.I)
_FINANCING = re.compile(r"(?:subject\s+to|conditioned\s+(?:up)?on)\s+(?:a\s+|the\s+)?(?:financing\s+condition|"
                        r"receipt\s+of\s+(?:the\s+)?(?:debt\s+)?financing|obtaining\s+(?:the\s+)?financing)", re.I)


def parse_merger_terms(text: str) -> dict:
    """A merger proxy's per-share consideration: {"cash", "stock", "cvr", "financing_condition", "sentence"}.

    `cash` is the first per-share cash amount in a consideration sentence ("converted into the right to receive
    $25.00 in cash"); `stock` / `cvr` say whether that sentence also pays shares (an exchange ratio) or a contingent
    value right. `financing_condition` is False when the text says the deal is not subject to a financing condition,
    True when it says it is, None when it says neither.
    """
    t = _normalise(text)
    best = None
    for rx in _CONSIDERATION:
        m = rx.search(t)
        if m and (best is None or m.start() < best.start()):
            best = m
    cash = stock = cvr = None
    sentence = None
    if best is not None:
        rest = t[best.end(): best.end() + 300]            # the rest of the consideration sentence (decimals allowed)
        end = _SENTENCE_END.search(rest)
        tail = rest[: end.start()] if end else rest
        head = t[best.start(): best.end()] + tail[:60]
        in_cash = re.search(r"\bcash\b", head, re.I)
        cash = _money(best["amt"]) if in_cash else None
        stock = bool(re.search(r"\bexchange\s+ratio\b|\bshares?\s+of\s+(?!(?:the\s+)?Company\b)[^.,;]{0,60}?"
                               r"(?:common|ordinary|class)\b", tail, re.I))
        cvr = bool(re.search(r"contingent\s+value\s+right", tail, re.I))
        sentence = _sentence(t, best.start(), best.end()).strip()[:400]
    if _NO_FINANCING.search(t):
        financing = False
    elif _FINANCING.search(t):
        financing = True
    else:
        financing = None
    return {"cash": cash, "stock": bool(stock), "cvr": bool(cvr), "financing_condition": financing,
            "sentence": sentence}


_VOTE_APPROVED = [
    re.compile(r"(?:stockholders|shareholders)\s+(?:have\s+)?voted\s+(?:to\s+approve|to\s+adopt|in\s+favor\s+of)"
               r"[^.]{0,200}?\b(?:merger|acquisition|transaction|proposal|agreement)", re.I),
    re.compile(r"(?:stockholders|shareholders)[^.]{0,80}?\b(?:approved|adopted)\b[^.]{0,160}?\b(?:merger|acquisition|"
               r"transaction|proposal|agreement)", re.I),
    re.compile(r"(?:merger|acquisition)\s+proposal[^.]{0,80}?\bwas\s+(?:approved|adopted)", re.I),
    re.compile(r"proposal\s+was\s+approved\s+by\s+the\s+(?:requisite\s+)?(?:vote\s+of\s+)?[^.]{0,60}?"
               r"(?:stockholders|shareholders)", re.I),
]
_VOTE_REJECTED = re.compile(r"(?:stockholders|shareholders)\s+(?:did\s+not|failed\s+to)\s+(?:approve|adopt)|"
                            r"(?:merger|acquisition)\s+proposal\s+(?:was|were)\s+not\s+(?:approved|adopted)", re.I)
_REG_KIND = r"(?:regulatory|antitrust|governmental|competition)"
_REG_WORDS = r"(?:approvals?|clearances?|consents?|authorizations?)"
_REG_QUAL = r"(?:(?:required|necessary|remaining|applicable|requisite|outstanding)\s+)*"
_REG_RECEIVED = [
    re.compile(r"\ball\s+(?:of\s+the\s+)?" + _REG_QUAL + _REG_KIND + r"\s+(?:and\s+\w+\s+)?" + _REG_WORDS +
               r"[^.]{0,100}?\b(?:have|has)\s+(?:now\s+)?(?:all\s+)?been\s+(?:received|obtained|satisfied|granted)",
               re.I),
    re.compile(r"(?:received|obtained|receipt\s+of)\s+all\s+(?:of\s+the\s+)?" + _REG_QUAL + _REG_KIND +
               r"\s+(?:and\s+\w+\s+)?" + _REG_WORDS, re.I),
]
_REG_PENDING = re.compile(r"(?:subject\s+to|remains?\s+subject\s+to|conditioned\s+(?:up)?on|pending)\b[^.]{0,140}?" +
                          _REG_KIND + r"\s+" + _REG_WORDS, re.I)
_CLOSE_DATE = [
    re.compile(r"(?:expected|anticipated|scheduled)\s+to\s+(?:close|be\s+completed|be\s+consummated|occur|become\s+"
               r"effective)[^.]{0,60}?\b(?:on\s+or\s+about|on\s+or\s+before|no\s+later\s+than|on|by)\s+"
               r"(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(" + DATE_RX + ")", re.I),
    re.compile(r"(?:closing|completion|consummation)\s+(?:of\s+the\s+(?:merger|transaction|acquisition)s?\s+)?"
               r"(?:is|are)\s+(?:currently\s+)?(?:expected|anticipated|scheduled)\s+(?:to\s+occur\s+)?"
               r"(?:on\s+or\s+about|on\s+or\s+before|no\s+later\s+than|on|by)\s+(" + DATE_RX + ")", re.I),
]
_CLOSE_QUARTER = re.compile(r"(?:expected|anticipated)\s+to\s+(?:close|be\s+completed|be\s+consummated)[^.]{0,40}?"
                            r"(?:in|during|by\s+the\s+end\s+of|before\s+the\s+end\s+of)\s+the\s+(first|second|third|"
                            r"fourth)\s+(?:calendar\s+)?quarter\s+(?:of\s+)?(\d{4})", re.I)
_AGREEMENT = r"(?:merger\s+agreement|agreement\s+and\s+plan\s+of\s+merger)"
_TERMINATED = re.compile(r"terminat\w*\s+(?:of\s+)?(?:the\s+)?" + _AGREEMENT + "|" + _AGREEMENT +
                         r"[^.]{0,40}?\b(?:was|has\s+been|had\s+been)\s+terminated", re.I)
_COMPLETED = re.compile(r"(?:completed|consummated|closed)\s+(?:the|its)\s+(?:previously\s+announced\s+)?(?:merger|"
                        r"acquisition|transaction)", re.I)


def parse_merger_update(text: str, items: Iterable[str] = ()) -> dict:
    """What an 8-K or proxy supplement says about a pending merger.

    {"vote": "approved" | "rejected" | None, "regulatory": "received" | "pending" | None, "expected_close": ISO date
    or None, "close_basis": "date" | "quarter_end" | None, "completed": bool, "terminated": bool}.

    * vote: stockholders approved (or voted to approve) the merger or its proposal; "rejected" when they did not;
    * regulatory: "received" when all required regulatory approvals are said to be received or obtained;
      "pending" when closing is said to be subject to them;
    * expected_close: an explicit date ("expected to close no later than July 27, 2026"), else the end of a named
      quarter ("in the third quarter of 2026");
    * completed: Item 2.01 (completion of an acquisition), or the text says the merger was completed;
    * terminated: Item 1.02 without Item 2.01, and the text says the merger agreement was terminated (a completion
      8-K also carries Item 1.02, for the target's credit agreement).
    """
    t = _normalise(text)
    items = {str(i) for i in items}
    vote = None
    if _VOTE_REJECTED.search(t):
        vote = "rejected"
    elif any(rx.search(t) for rx in _VOTE_APPROVED):
        vote = "approved"
    if any(rx.search(t) for rx in _REG_RECEIVED):
        regulatory = "received"
    elif _REG_PENDING.search(t):
        regulatory = "pending"
    else:
        regulatory = None
    expected, basis = None, None
    for rx in _CLOSE_DATE:
        m = rx.search(t)
        if m:
            expected, basis = parse_long_date(m.group(1)), "date"
            break
    if expected is None:
        m = _CLOSE_QUARTER.search(t)
        if m:
            q = ("first", "second", "third", "fourth").index(m.group(1).lower()) + 1
            expected = (pd.Timestamp(year=int(m.group(2)), month=3 * q, day=1) + pd.offsets.MonthEnd(0)).strftime(
                "%Y-%m-%d")
            basis = "quarter_end"
    completed = "2.01" in items or bool(_COMPLETED.search(t))
    terminated = "2.01" not in items and not completed and bool(_TERMINATED.search(t)) and (
        "1.02" in items or not items)
    return {"vote": vote, "regulatory": regulatory, "expected_close": expected, "close_basis": basis,
            "completed": completed, "terminated": terminated}


# --- CEF tender offers ---------------------------------------------------------------------------------------

_PCT_NAV = re.compile(r"(\d{2,3}(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(?:the\s+|its\s+|each\s+)?(?:Fund's\s+)?"
                      r"(?:then[- ]current\s+)?(?:net\s+asset\s+value|NAV)\b", re.I)
_SIZE = re.compile(r"up\s+to\s+(?:(?P<shares>\d{1,3}(?:,\d{3}){1,4})\s+(?:(?:shares|Shares)\b[^()]{0,60}?)?"
                   r"\((?:approximately\s+)?(?P<pct1>\d{1,3}(?:\.\d+)?)\s*%\)|(?P<pct2>\d{1,3}(?:\.\d+)?)\s*"
                   r"(?:%|percent))\s+of\s+(?:the\s+|its\s+)?(?:Fund's\s+)?(?:then\s+)?(?:issued\s+and\s+)?"
                   r"(?:outstanding|Outstanding)", re.I)
_SIZE_SHARES = re.compile(r"up\s+to\s+(\d{1,3}(?:,\d{3}){1,4})\s+(?:shares|Shares)\b", re.I)
_OUTSTANDING = re.compile(r"(\d{1,3}(?:,\d{3}){2,4})\s+(?:shares|Shares)\s+(?:of\s+[^.]{0,40}?)?(?:were\s+)?"
                          r"(?:issued\s+and\s+)?outstanding", re.I)
_EXPIRY = re.compile(r"expir\w*[^.]{0,140}?\b(?:on\s+or\s+about|on)\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|"
                     r"Friday),?\s+)?(" + DATE_RX + ")", re.I)
_EXPIRY2 = re.compile(r"[“\"]?Expiration\s+Date[”\"]?,?\s*(?:which\s+is|of)\s+(" + DATE_RX + ")", re.I)
_COMMENCE = re.compile(r"(?:commenc\w*|beginning|begin)\s+(?:on\s+or\s+about|on|by|not\s+later\s+than|no\s+later\s+"
                       r"than)\s+(" + DATE_RX + ")", re.I)
_PRICING_NEXT = re.compile(r"business\s+day\s+(?:immediately\s+)?(?:following|after)\s+(?:the\s+(?:day|date)\s+)?"
                           r"(?:on\s+which\s+)?the\s+(?:offer|tender\s+offer)\s+expire|day\s+following\s+the\s+"
                           r"[“\"]?Expiration\s+Date", re.I)
_CONDITIONAL = re.compile(r"conditional\s+tender\s+offer|would\s+conduct\s+(?:such\s+)?a\s+tender\s+offer\s+only\s+"
                          r"if|performance[- ]related\s+(?:conditional\s+)?tender", re.I)


def parse_cef_tender(text: str) -> dict:
    """A closed-end fund's self-tender terms, from an offer, a letter to holders or a press release.

    {"pct_nav" (fraction, 0.98), "size_pct" (fraction of the shares outstanding), "size_shares", "shares_outstanding",
    "expiry", "commence", "pricing_next_day", "conditional"}. Missing items are None (False for the flags).
    `shares_outstanding` is stated in the text, or implied by "up to N shares (approximately P%)".
    """
    t = _normalise(text)
    pct = None
    for m in _PCT_NAV.finditer(t):
        v = float(m.group(1))
        if 50.0 <= v <= 100.0:
            pct = v / 100.0
            break
    size_pct = size_shares = None
    m = _SIZE.search(t)
    if m:
        p = m["pct1"] or m["pct2"]
        size_pct = float(p) / 100.0 if p and 0 < float(p) <= 100 else None
        size_shares = float(m["shares"].replace(",", "")) if m["shares"] else None
    if size_shares is None:
        m2 = _SIZE_SHARES.search(t)
        size_shares = float(m2.group(1).replace(",", "")) if m2 else None
    outstanding = None
    m3 = _OUTSTANDING.search(t)
    if m3:
        outstanding = float(m3.group(1).replace(",", ""))
    elif size_shares and size_pct:
        outstanding = size_shares / size_pct
    exp = _EXPIRY.search(t) or _EXPIRY2.search(t)
    com = _COMMENCE.search(t)
    return {"pct_nav": pct, "size_pct": size_pct, "size_shares": size_shares, "shares_outstanding": outstanding,
            "expiry": parse_long_date(exp.group(1)) if exp else None,
            "commence": parse_long_date(com.group(1)) if com else None,
            "pricing_next_day": bool(_PRICING_NEXT.search(t)), "conditional": bool(_CONDITIONAL.search(t))}


_ACCEPTED_PCT = [
    re.compile(r"accepted\s+for\s+purchase\s+(?:approximately\s+)?(\d{1,3}(?:\.\d+)?)\s*%", re.I),
    re.compile(r"approximately\s+(\d{1,3}(?:\.\d+)?)\s*%\s+of\s+the\s+shares\s+(?:validly\s+|properly\s+)?tendered",
               re.I),
]
_PRORATION = re.compile(r"pro(?:ration|[- ]rata)\s+factor\s+(?:of|was|is|equal\s+to)\s+(?:approximately\s+)?"
                        r"(\d{0,3}\.\d+|\d{1,3})\s*(%)?", re.I)
_TENDER_PRICE = re.compile(r"(?:repurchased|purchased|purchase\s+price)\s+(?:at\s+a\s+price\s+)?(?:of|was|equal\s+to|"
                           r"is)\s+" + _MONEY + r"\s+per\s+share", re.I)


def parse_cef_tender_result(text: str) -> dict:
    """A tender's final amendment: {"accepted" (fraction of the shares tendered that the fund bought), "price"}.

    "The fund accepted for purchase 33.23% of the Shares ... tendered" -> 0.3323; "a proration factor of 0.2789"
    -> 0.2789; "repurchased at a price of $6.81 per Share" -> 6.81. Missing items are None.
    """
    t = _normalise(text)
    accepted = None
    m = next((m for rx in _ACCEPTED_PCT for m in [rx.search(t)] if m), None)
    if m:
        accepted = float(m.group(1)) / 100.0
    else:
        m = _PRORATION.search(t)
        if m:
            v = float(m.group(1))
            accepted = v / 100.0 if (m.group(2) or v > 1.0) else v
    if accepted is not None and not 0.0 < accepted <= 1.0:
        accepted = None
    p = _TENDER_PRICE.search(t)
    return {"accepted": accepted, "price": _money(p["amt"]) if p else None}


# --------------------------------------------------------------------------------------------------------
# HTTP clients
# --------------------------------------------------------------------------------------------------------

class RateLimiter:
    """At most `per_second` calls to `wait` a second, across threads (SEC fair access: <= 10 a second)."""

    def __init__(self, per_second: float = DEFAULT_RATE, *, clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] = time.sleep) -> None:
        self.interval = 1.0 / min(max(float(per_second), 0.1), MAX_RATE)
        self._clock = clock
        self._sleep = sleep
        self._next = -math.inf
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            now = self._clock()
            start = max(now, self._next)
            self._next = start + self.interval
        if start > now:
            self._sleep(start - now)


class EdgarClient:
    """EDGAR full-text search, data.sec.gov and the Archives, under the SEC's fair-access rules.

    `session` (anything with a requests-style ``get``), `sleep` and `clock` are test seams; `workers` threads
    fetch documents concurrently under the shared rate limit. Results of data.sec.gov calls are memoised per
    client. ``stats`` counts requests, documents and bytes.
    """

    def __init__(self, *, user_agent: str | None = None, session: Any = None,
                 sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.monotonic,
                 max_rate: float = DEFAULT_RATE, workers: int = 4, timeout: float = TIMEOUT_SECONDS,
                 max_document_bytes: int = MAX_DOCUMENT_BYTES) -> None:
        self.user_agent = user_agent or sec_user_agent()
        self._session = session if session is not None else requests.Session()
        self._sleep = sleep
        self._clock = clock
        self._limiter = RateLimiter(max_rate, clock=clock, sleep=sleep)
        self.workers = max(1, int(workers))
        self.timeout = float(timeout)
        self.max_document_bytes = int(max_document_bytes)
        self.stats: dict[str, int] = {"requests": 0, "documents": 0, "bytes": 0, "retries": 0}
        self._memo: dict[tuple, Any] = {}
        self._lock = threading.Lock()
        self._deadline: float | None = None
        self._documents_left: int | None = None

    # --- budget -------------------------------------------------------------------------------------------

    def start(self, *, seconds: float | None = None, documents: int | None = None) -> None:
        """Start a run's work budget: stop after `seconds` of wall clock and `documents` document fetches."""
        self._deadline = None if seconds is None else self._clock() + float(seconds)
        self._documents_left = None if documents is None else int(documents)

    def seconds_left(self) -> float | None:
        return None if self._deadline is None else self._deadline - self._clock()

    def _check_deadline(self) -> None:
        if self._deadline is not None and self._clock() >= self._deadline:
            raise BudgetExhausted("EDGAR time budget used up")

    def _take_document(self) -> None:
        with self._lock:
            if self._documents_left is not None:
                if self._documents_left <= 0:
                    raise BudgetExhausted("EDGAR document budget used up")
                self._documents_left -= 1

    # --- EFTS ---------------------------------------------------------------------------------------------

    def search(self, forms: str, start: str, end: str, *, q: str = "", ciks: Iterable[Any] | None = None,
               max_hits: int = 2000) -> list[dict]:
        """Every EFTS hit (one per document) for `forms` filed from `start` to `end`, paging 100 at a time.

        `forms` may list several ("8-K,DEFA14A"); `q` is EFTS query syntax ('"special dividend"'); `ciks` limits
        the search to those filers. Stops after `max_hits`.
        """
        params: dict[str, Any] = {"q": q, "forms": forms, "dateRange": "custom", "startdt": start, "enddt": end}
        if ciks:
            params["ciks"] = ",".join(f"{int(c):010d}" for c in ciks)
        out: list[dict] = []
        seen: set[tuple[str, str]] = set()
        frm = 0
        while True:
            if frm:
                params["from"] = frm
            hits, total = parse_efts(self._get_json(EFTS_URL, params=params))
            for h in hits:
                key = (h["adsh"], h["filename"])
                if key not in seen:
                    seen.add(key)
                    out.append(h)
            frm += len(hits)
            if not hits or frm >= total or frm >= max_hits:
                return out

    def search_total(self, forms: str, start: str, end: str, *, q: str = "") -> int:
        """How many documents EFTS has for the query (one request)."""
        _, total = parse_efts(self._get_json(EFTS_URL, params={"q": q, "forms": forms, "dateRange": "custom",
                                                               "startdt": start, "enddt": end}))
        return total

    # --- Archives -----------------------------------------------------------------------------------------

    def document(self, ciks: Iterable[Any], adsh: str, filename: str) -> str:
        """A filing document's text as served (HTML or XML), tried under each of the filing's CIKs in turn.

        Counts against the document budget. Raises EdgarAccessDenied on HTTP 403, DataError when no CIK serves it.
        """
        self._take_document()
        folder = str(adsh).replace("-", "")
        tried = []
        for cik in dict.fromkeys(int(c) for c in ciks):
            url = ARCHIVES_URL.format(cik=cik, folder=folder, filename=filename)
            try:
                resp = self._get(url)
            except _NotFound:
                tried.append(cik)
                continue
            data = resp.content[: self.max_document_bytes]
            with self._lock:
                self.stats["documents"] += 1
                self.stats["bytes"] += len(data)
            return _decode(data)
        raise DataError(f"document {adsh}/{filename} not found under CIKs {tried}")

    def documents(self, wanted: Sequence[tuple[Iterable[Any], str, str]]) -> dict[tuple[str, str], str | Exception]:
        """Fetch several documents concurrently: {(adsh, filename): text or the exception raised}."""
        def one(item: tuple[Iterable[Any], str, str]) -> str | Exception:
            try:
                return self.document(*item)
            except Exception as exc:  # noqa: BLE001 - returned to the caller, per document
                return exc

        if not wanted:
            return {}
        if self.workers == 1 or len(wanted) == 1:
            results = [one(w) for w in wanted]
        else:
            with ThreadPoolExecutor(max_workers=min(self.workers, len(wanted))) as pool:
                results = list(pool.map(one, wanted))
        return {(w[1], w[2]): r for w, r in zip(wanted, results)}

    # --- data.sec.gov -------------------------------------------------------------------------------------

    def company(self, cik: Any) -> dict | None:
        """A CIK's submissions header ({"cik", "name", "tickers", "exchanges", "sic", "entity_type"}), or None."""
        key = ("company", int(cik))
        if key not in self._memo:
            try:
                self._memo[key] = parse_submissions(self._get_json(SUBMISSIONS_URL.format(cik=int(cik))))
            except _NotFound:
                self._memo[key] = None
        return self._memo[key]

    def shares_outstanding(self, cik: Any, asof: str) -> dict | None:
        """Shares outstanding reported by `asof` (dei cover page, else us-gaap balance sheet), or None.

        Returns {"shares", "end", "filed", "form", "source"}.
        """
        for taxonomy, tag in SHARES_CONCEPTS:
            payload = self._concept(cik, taxonomy, tag)
            found = parse_shares_outstanding(payload, asof) if payload else None
            if found:
                return {**found, "source": f"{taxonomy}:{tag}"}
        return None

    def public_float(self, cik: Any, asof: str) -> dict | None:
        """The public float (USD, 10-K cover) reported by `asof`, at most 550 days old, or None.

        A lower bound on the market cap, for companies whose share count is only reported per class.
        Returns {"value", "end", "filed", "form", "source"}.
        """
        payload = self._concept(cik, *PUBLIC_FLOAT_CONCEPT)
        found = parse_concept_value(payload, asof, "USD", PUBLIC_FLOAT_MAX_AGE_DAYS) if payload else None
        return {**found, "source": "dei:EntityPublicFloat"} if found else None

    def _concept(self, cik: Any, taxonomy: str, tag: str) -> Any:
        key = ("concept", int(cik), taxonomy, tag)
        if key not in self._memo:
            try:
                self._memo[key] = self._get_json(CONCEPT_URL.format(cik=int(cik), taxonomy=taxonomy, tag=tag))
            except _NotFound:
                self._memo[key] = None
        return self._memo[key]

    # --- plumbing -----------------------------------------------------------------------------------------

    def _get(self, url: str, *, params: Mapping[str, Any] | None = None) -> Any:
        headers = {"User-Agent": self.user_agent, "Accept-Encoding": "gzip, deflate"}
        problem = "no attempt made"
        for attempt in range(len(BACKOFF_SECONDS) + 1):
            if attempt:
                with self._lock:
                    self.stats["retries"] += 1
                self._sleep(BACKOFF_SECONDS[attempt - 1])
            self._check_deadline()
            self._limiter.wait()
            with self._lock:
                self.stats["requests"] += 1
            try:
                resp = self._session.get(url, params=params, headers=headers, timeout=self.timeout)
            except requests.RequestException as exc:
                problem = f"{type(exc).__name__}: {exc}"
                continue
            status = int(resp.status_code)
            if status == 200:
                return resp
            if status == 404:
                raise _NotFound(f"GET {url}: HTTP 404")
            if status == 403:
                raise EdgarAccessDenied(f"GET {url}: HTTP 403 ({_html_title(resp)})")
            problem = f"HTTP {status}"
            if status != 429 and status < 500:
                break
        raise DataError(f"GET {url} failed ({problem})")

    def _get_json(self, url: str, *, params: Mapping[str, Any] | None = None) -> Any:
        resp = self._get(url, params=params)
        try:
            return resp.json()
        except ValueError as exc:
            raise DataError(f"GET {url} returned invalid JSON: {exc}") from exc


def _html_title(resp: Any) -> str:
    try:
        text = resp.text
    except Exception:  # noqa: BLE001
        return "no body"
    m = re.search(r"<title>(.*?)</title>", str(text or ""), re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip()[:120] if m else "no title"


class FinraClient:
    """FINRA consolidated short interest: the per-symbol API, then the twice-monthly file (track 16 P1)."""

    def __init__(self, *, session: Any = None, sleep: Callable[[float], None] = time.sleep,
                 timeout: float = TIMEOUT_SECONDS, user_agent: str = DEFAULT_USER_AGENT) -> None:
        self._session = session if session is not None else requests.Session()
        self._sleep = sleep
        self.timeout = float(timeout)
        self.user_agent = user_agent
        self._rows: dict[str, list[dict] | None] = {}
        self.stats: dict[str, int] = {"requests": 0}

    def short_interest(self, symbol: str, asof: str, *, lag_days: int = 12) -> dict | None:
        """The latest short-interest record published by `asof` (see `parse_finra_si_rows`), or None."""
        sym = str(symbol).strip().upper()
        if sym not in self._rows:
            rows = None
            try:
                rows = self._api_rows(sym)
            except DataError as exc:
                log.warning("FINRA API short interest for %s failed (%s); trying the file", sym, exc)
            if not rows:
                rows = self._file_rows(sym, asof, lag_days)
            self._rows[sym] = rows
        return parse_finra_si_rows(self._rows[sym] or [], asof, lag_days)

    def _api_rows(self, sym: str) -> list[dict]:
        body = {"limit": 1000, "fields": list(FINRA_SI_FIELDS),
                "compareFilters": [{"compareType": "EQUAL", "fieldName": "symbolCode", "fieldValue": sym}]}
        resp = self._request("post", FINRA_SI_API, json=body, headers={"Accept": "application/json"})
        if int(resp.status_code) == 204 or not (resp.text or "").strip():
            return []
        try:
            rows = resp.json()
        except ValueError as exc:
            raise DataError(f"FINRA API returned invalid JSON: {exc}") from exc
        return rows if isinstance(rows, list) else []

    def _file_rows(self, sym: str, asof: str, lag_days: int) -> list[dict] | None:
        for day in _finra_settlement_candidates(asof, lag_days):
            try:
                resp = self._request("get", FINRA_SI_FILE.format(ymd=day.replace("-", "")))
                return parse_finra_si_file(resp.text, sym)
            except DataError:
                continue
        return None

    def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        headers = {"User-Agent": self.user_agent, **kwargs.pop("headers", {})}
        problem = "no attempt made"
        for attempt in range(len(BACKOFF_SECONDS) + 1):
            if attempt:
                self._sleep(BACKOFF_SECONDS[attempt - 1])
            self.stats["requests"] += 1
            try:
                resp = getattr(self._session, method)(url, headers=headers, timeout=self.timeout, **kwargs)
            except requests.RequestException as exc:
                problem = f"{type(exc).__name__}: {exc}"
                continue
            status = int(resp.status_code)
            if status in (200, 204):
                return resp
            problem = f"HTTP {status}"
            if status != 429 and status < 500:
                break
        raise DataError(f"{method.upper()} {url} failed ({problem})")


def _finra_settlement_candidates(asof: str, lag_days: int, count: int = 4) -> list[str]:
    """Likely settlement dates published by `asof` (the 15th and the month end, moved back to a weekday), newest
    first."""
    limit = pd.Timestamp(str(asof)[:10]) - pd.Timedelta(days=lag_days)
    out: list[str] = []
    month = limit.replace(day=1)
    while len(out) < count:
        for d in (month + pd.offsets.MonthEnd(0), month + pd.Timedelta(days=14)):
            while d.weekday() >= 5:
                d -= timedelta(days=1)
            if d <= limit and d.strftime("%Y-%m-%d") not in out:
                out.append(d.strftime("%Y-%m-%d"))
        month = (month - pd.Timedelta(days=1)).replace(day=1)
    return sorted(out, reverse=True)[:count]
