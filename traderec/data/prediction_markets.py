"""Prediction markets for W8/W9: Polymarket's gamma API and Kalshi's public trade API (design v3.3 §3 M5, §10).

The design's data table asks for "a rolling map of Polymarket / Kalshi market names, failing closed" (red team M9:
dated markets expire and names change). A *family* is a ladder of dated yes/no markets named by one rule, e.g.
"US announces end of Iranian blockade by <date>?". The map is rule-based and rolling: each run lists the family
again, reads each market's date from its name and picks the market a rule names: "the first listed date on or after
the trade's time stop" (W8's invalidation market, `pick_on_or_after`) or "the listed date nearest a target, on or
after a floor" (W8's trigger markets, `pick_nearest`).

It fails closed. A pick is:

* "ok": exactly one listed market carries the picked date, and its name, end date and price are consistent;
* "missing": no listed market qualifies (the family was renamed, delisted or has no date late enough);
* "ambiguous": two listed markets claim the picked date, a market's name and end date disagree, or the listing is
  incomplete (search pagination ran out);
* "resolved": reported by `refresh` for a mapped market that has settled, with its outcome.

Nothing here guesses what a status means: the runner decides (W8's invalidation market is re-mapped by rule when it
resolves). "Listed" means open for trading: active, not closed, accepting orders, in an event that is not closed.

Network: `PredictionMarkets` (requests, the providers' timeout and retry policy). Parsing and picking are pure
functions tested on small recorded fixtures. Kalshi also serves the scheduled-release calendar (FOMC decisions, CPI,
payrolls) used by the never-list's "entered <= 5 sessions before a scheduled release" ban (design §5).
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from collections.abc import Callable, Iterable, Mapping
from typing import Any

import pandas as pd
import requests

from traderec.data.providers import BACKOFF_SECONDS, TIMEOUT_SECONDS, USER_AGENT, DataError

__all__ = [
    "Http", "KALSHI_URL", "POLYMARKET_URL", "PredictionMarkets", "family_quotes", "market_date",
    "normalise_kalshi_market", "normalise_polymarket_market", "pick_nearest", "pick_on_or_after",
    "release_dates_from_markets",
]

POLYMARKET_URL = "https://gamma-api.polymarket.com"
KALSHI_URL = "https://api.elections.kalshi.com/trade-api/v2"
NY_TZ = "America/New_York"

MAX_END_GAP_DAYS = 3        # a market's name date and its end date (in New York) may differ by this much
SEARCH_PAGES = 5            # Polymarket public-search pages per family before the listing counts as incomplete
KALSHI_PAGES = 10           # Kalshi cursor pages per request
RESOLVED_HI, RESOLVED_LO = 0.99, 0.01    # a closed market priced at these extremes has settled Yes / No

_MONTHS = {m: i for i, m in enumerate(("january", "february", "march", "april", "may", "june", "july", "august",
                                       "september", "october", "november", "december"), start=1)}
_MONTHS.update({m[:3]: i for m, i in list(_MONTHS.items())})
_MONTHS["sept"] = 9
_DATE = re.compile(r"^\s*(?P<month>[A-Za-z]+)\.?\s+(?P<day>\d{1,2})(?:,?\s+(?P<year>\d{4}))?\s*$")


# --------------------------------------------------------------------------------------------------------
# HTTP (the providers' policy: 20 s timeout, 3 retries 1/2/4 s apart on connection errors, 429 and 5xx)
# --------------------------------------------------------------------------------------------------------

class Http:
    """GET JSON under the data layer's retry policy. `session` and `sleep` are test seams.

    `payload_sha256` records the SHA-256 of every raw payload fetched, so a signal can cite the exact bytes it used.
    """

    def __init__(self, session: Any = None, sleep: Callable[[float], None] = time.sleep,
                 user_agent: str = USER_AGENT) -> None:
        self._session = session if session is not None else requests.Session()
        self._sleep = sleep
        self.user_agent = user_agent
        self.payload_sha256: list[str] = []

    def get_json(self, url: str, params: Any = None, headers: Mapping[str, str] | None = None) -> Any:
        merged = {"User-Agent": self.user_agent, "Accept": "application/json", **(headers or {})}
        problem = "no attempt made"
        for attempt in range(len(BACKOFF_SECONDS) + 1):
            if attempt:
                self._sleep(BACKOFF_SECONDS[attempt - 1])
            try:
                resp = self._session.get(url, params=params, headers=merged, timeout=TIMEOUT_SECONDS)
            except requests.RequestException as exc:
                problem = f"{type(exc).__name__}: {exc}"
                continue
            status = int(resp.status_code)
            if status < 400:
                text = resp.text
                self.payload_sha256.append(hashlib.sha256(text.encode("utf-8")).hexdigest())
                try:
                    return json.loads(text)
                except ValueError as exc:
                    raise DataError(f"GET {url} returned invalid JSON: {exc}") from exc
            problem = f"HTTP {status}"
            if status != 429 and status < 500:
                break                      # a permanent client error: retrying will not help
        raise DataError(f"GET {url} failed ({problem})")


# --------------------------------------------------------------------------------------------------------
# Pure parsing
# --------------------------------------------------------------------------------------------------------

def _num(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v and abs(v) != float("inf") else None


def _ny_date(stamp: Any) -> str | None:
    """An ISO timestamp (UTC when it has no zone; gamma writes "+00") as the New York calendar date, or None."""
    text = str(stamp or "").strip()
    if not text:
        return None
    if re.search(r"[+-]\d{2}$", text):
        text += ":00"
    try:
        ts = pd.Timestamp(text)
    except (TypeError, ValueError):
        return None
    if ts is pd.NaT:
        return None
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    return ts.tz_convert(NY_TZ).strftime("%Y-%m-%d")


def market_date(text: str, end: str | None) -> tuple[str | None, str | None]:
    """The date in a market's name ("December 31, 2026", "October 31", "Dec 1, 2026") as (ISO date, problem).

    A name without a year takes the year that puts the date on or just before the market's end date. The name date
    must lie within MAX_END_GAP_DAYS of the end date (New York), else the market is flagged: a ladder whose names
    and end dates disagree cannot be mapped safely.
    """
    m = _DATE.match(text or "")
    if not m:
        return None, f"no date in {text!r}"
    month = _MONTHS.get(m["month"].lower())
    if month is None:
        return None, f"unknown month in {text!r}"
    day = int(m["day"])
    end_ts = pd.Timestamp(end) if end else None
    if m["year"]:
        year = int(m["year"])
    elif end_ts is not None:
        year = end_ts.year
        try:
            if pd.Timestamp(year=year, month=month, day=day) > end_ts + pd.Timedelta(days=MAX_END_GAP_DAYS):
                year -= 1
        except ValueError:
            return None, f"invalid date in {text!r}"
    else:
        return None, f"no year in {text!r} and no end date"
    try:
        when = pd.Timestamp(year=year, month=month, day=day)
    except ValueError:
        return None, f"invalid date in {text!r}"
    iso = when.strftime("%Y-%m-%d")
    if end_ts is not None and abs((when - end_ts).days) > MAX_END_GAP_DAYS:
        return iso, f"name date {iso} and end date {end} disagree"
    return iso, None


def _json_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    try:
        out = json.loads(value) if isinstance(value, str) else []
    except ValueError:
        return []
    return out if isinstance(out, list) else []


def normalise_polymarket_market(m: Mapping, event: Mapping | None = None) -> dict[str, Any]:
    """One gamma market (and its event, when known) as a quote dict.

    {"venue", "id", "question", "yes", "bid", "ask", "one_day_change", "end", "listed", "resolved", "outcome",
     "closed_time", "event_id", "event_closed", "problem"}; "yes" is the Yes outcome price (Polymarket's displayed
    probability), "end" the New York date of `endDate`. "date" is added by `family_quotes`.
    """
    outcomes = [str(o).strip().lower() for o in _json_list(m.get("outcomes"))]
    prices = [_num(p) for p in _json_list(m.get("outcomePrices"))]
    problem = None
    yes = None
    if "yes" in outcomes and len(prices) == len(outcomes):
        yes = prices[outcomes.index("yes")]
    else:
        problem = "no Yes outcome price"
    if yes is not None and not 0.0 <= yes <= 1.0:
        yes, problem = None, "Yes price outside [0, 1]"
    event_closed = bool(event.get("closed")) if event else False
    closed = bool(m.get("closed"))
    listed = (bool(m.get("active", True)) and not closed and not bool(m.get("archived"))
              and m.get("acceptingOrders", True) is not False and not event_closed)
    resolved, outcome = False, None
    if closed:
        status = str(m.get("umaResolutionStatus") or "").lower()
        if yes is not None and yes >= RESOLVED_HI:
            resolved, outcome = True, "yes"
        elif yes is not None and yes <= RESOLVED_LO:
            resolved, outcome = True, "no"
        elif status == "resolved":
            problem = problem or "resolved without a clear Yes/No price"
        else:
            problem = problem or "closed but not resolved"
    return {
        "venue": "polymarket", "id": str(m.get("id")), "question": str(m.get("question") or "").strip(),
        "yes": yes, "bid": _num(m.get("bestBid")), "ask": _num(m.get("bestAsk")),
        "one_day_change": _num(m.get("oneDayPriceChange")), "end": _ny_date(m.get("endDate")),
        "listed": listed, "resolved": resolved, "outcome": outcome,
        "closed_time": str(m.get("closedTime")) if m.get("closedTime") else None,
        "event_id": str(event.get("id")) if event else None, "event_closed": event_closed, "problem": problem,
    }


def normalise_kalshi_market(m: Mapping) -> dict[str, Any]:
    """One Kalshi market as a quote dict (same keys as Polymarket's). "yes" is the bid/ask mid when both quote,
    else the last price; "question" is the market title; "end" is the New York date of `close_time`."""
    bid, ask, last = _num(m.get("yes_bid_dollars")), _num(m.get("yes_ask_dollars")), _num(m.get("last_price_dollars"))
    prev = _num(m.get("previous_price_dollars"))
    yes = (bid + ask) / 2.0 if (bid is not None and ask is not None and 0.0 < bid <= ask < 1.0) else last
    status = str(m.get("status") or "").lower()
    result = str(m.get("result") or "").lower()
    resolved = status in ("settled", "finalized", "determined") and result in ("yes", "no")
    problem = None if yes is not None and 0.0 <= yes <= 1.0 else "no price"
    return {
        "venue": "kalshi", "id": str(m.get("ticker")), "question": str(m.get("title") or "").strip(),
        "yes": yes if problem is None else None, "bid": bid, "ask": ask,
        "one_day_change": (last - prev) if (last is not None and prev is not None) else None,
        "end": _ny_date(m.get("close_time")), "listed": status in ("active", "open"),
        "resolved": resolved, "outcome": result if resolved else None,
        "closed_time": str(m.get("settlement_ts") or m.get("close_time") or "") or None,
        "event_id": str(m.get("event_ticker") or "") or None, "event_closed": False, "problem": problem,
    }


def family_quotes(quotes: Iterable[Mapping], pattern: str) -> list[dict[str, Any]]:
    """The quotes whose name matches the family's `pattern` (a regex with a named group "date", anchored by the
    caller), each with "date" parsed from its name. A date that disagrees with the end date sets "problem"."""
    rx = re.compile(pattern)
    out = []
    for q in quotes:
        m = rx.match(str(q.get("question") or ""))
        if not m or "date" not in m.groupdict():
            continue
        date, problem = market_date(m["date"], q.get("end"))
        out.append({**q, "date": date, "problem": q.get("problem") or problem})
    return out


def pick_on_or_after(quotes: Iterable[Mapping], target: str, *, incomplete: bool = False) -> dict[str, Any]:
    """The rule "the first listed date on or after `target`" over one family's quotes (from `family_quotes`).

    Returns {"status": "ok" | "missing" | "ambiguous", "market": quote | None, "date", "reason", "listed"}. Fails
    closed: two listed markets on the picked date, a flawed market that could be the pick (its date unreadable or
    between `target` and the picked date), a picked market without a price, or an `incomplete` listing all make
    the pick ambiguous.
    """
    listed = [dict(q) for q in quotes if q.get("listed")]
    out: dict[str, Any] = {"status": "missing", "market": None, "date": None, "reason": "", "listed": len(listed)}
    if incomplete:
        return {**out, "status": "ambiguous", "reason": "the market listing was incomplete"}
    dated = [q for q in listed if q.get("date") and q["date"] >= target and not q.get("problem")]
    flawed = [q for q in listed if q.get("problem")]
    if not dated:
        blocking = [q for q in flawed if not q.get("date") or q["date"] >= target]
        if blocking:
            return {**out, "status": "ambiguous", "reason": f"flawed market: {blocking[0]['problem']}"}
        return {**out, "reason": f"no listed market dated on or after {target}"}
    first = min(q["date"] for q in dated)
    blocking = [q for q in flawed if not q.get("date") or target <= q["date"] <= first]
    if blocking:
        return {**out, "status": "ambiguous", "date": first, "reason": f"flawed market: {blocking[0]['problem']}"}
    at = [q for q in dated if q["date"] == first]
    if len(at) != 1:
        return {**out, "status": "ambiguous", "date": first,
                "reason": f"{len(at)} listed markets dated {first}: " + "; ".join(q["question"] for q in at)}
    if at[0].get("yes") is None:
        return {**out, "status": "ambiguous", "date": first, "reason": f"no price for {at[0]['question']!r}"}
    return {**out, "status": "ok", "market": at[0], "date": first, "reason": f"first listed date >= {target}"}


def pick_nearest(quotes: Iterable[Mapping], target: str, not_before: str, *, incomplete: bool = False) -> dict:
    """The rule "the listed date nearest `target`, among dates on or after `not_before`" (ties: the earlier date).

    Same result shape and fail-closed checks as `pick_on_or_after`: duplicates on the picked date, a flawed market
    at least as near the target (or with an unreadable date), a picked market without a price, or an incomplete
    listing make the pick ambiguous.
    """
    listed = [dict(q) for q in quotes if q.get("listed")]
    out: dict[str, Any] = {"status": "missing", "market": None, "date": None, "reason": "", "listed": len(listed)}
    if incomplete:
        return {**out, "status": "ambiguous", "reason": "the market listing was incomplete"}
    t = pd.Timestamp(target)
    gap = lambda d: abs((pd.Timestamp(d) - t).days)  # noqa: E731
    dated = [q for q in listed if q.get("date") and q["date"] >= not_before and not q.get("problem")]
    flawed = [q for q in listed if q.get("problem") and (not q.get("date") or q["date"] >= not_before)]
    if not dated:
        if flawed:
            return {**out, "status": "ambiguous", "reason": f"flawed market: {flawed[0]['problem']}"}
        return {**out, "reason": f"no listed market dated on or after {not_before}"}
    best = min((q["date"] for q in dated), key=lambda d: (gap(d), d))
    blocking = [q for q in flawed if not q.get("date") or gap(q["date"]) <= gap(best)]
    if blocking:
        return {**out, "status": "ambiguous", "date": best, "reason": f"flawed market: {blocking[0]['problem']}"}
    at = [q for q in dated if q["date"] == best]
    if len(at) != 1:
        return {**out, "status": "ambiguous", "date": best,
                "reason": f"{len(at)} listed markets dated {best}: " + "; ".join(q["question"] for q in at)}
    if at[0].get("yes") is None:
        return {**out, "status": "ambiguous", "date": best, "reason": f"no price for {at[0]['question']!r}"}
    return {**out, "status": "ok", "market": at[0], "date": best,
            "reason": f"listed date nearest {target} on or after {not_before}"}


def release_dates_from_markets(markets: Iterable[Mapping]) -> list[str]:
    """Release dates from one Kalshi release series (FOMC decision, CPI, payrolls): per event, the New York date of
    its markets' earliest close time (the markets close minutes before the release). Sorted, unique."""
    by_event: dict[str, str] = {}
    for m in markets:
        event, day = str(m.get("event_ticker") or ""), _ny_date(m.get("close_time"))
        if event and day and (event not in by_event or day < by_event[event]):
            by_event[event] = day
    return sorted(set(by_event.values()))


# --------------------------------------------------------------------------------------------------------
# Live adapter
# --------------------------------------------------------------------------------------------------------

class PredictionMarkets:
    """Network adapter: family listings, refresh by id, and Kalshi's release calendar.

    Every method raises DataError when a source fails; callers treat that as missing data (fail closed).
    """

    def __init__(self, http: Http | None = None) -> None:
        self.http = http or Http()

    @property
    def payload_sha256(self) -> list[str]:
        return self.http.payload_sha256

    def family(self, spec: Mapping[str, Any]) -> dict[str, Any]:
        """{"quotes": [...family quotes...], "incomplete": bool} for a family spec {"venue", "query" | "series",
        "pattern"} (constitution W8 `markets`)."""
        venue = str(spec.get("venue") or "polymarket")
        if venue == "polymarket":
            raw, incomplete = self._polymarket_search(str(spec["query"]))
        elif venue == "kalshi":
            raw, incomplete = [normalise_kalshi_market(m) for m in self._kalshi_markets(str(spec["series"]))], False
        else:
            raise DataError(f"unknown prediction-market venue {venue!r}")
        return {"quotes": family_quotes(raw, str(spec["pattern"])), "incomplete": incomplete}

    def refresh(self, ids: Iterable[str], venue: str = "polymarket") -> dict[str, dict[str, Any]]:
        """Current quotes for mapped market ids (resolved markets included). Missing ids are absent."""
        ids = [str(i) for i in ids if i]
        if not ids:
            return {}
        if venue == "kalshi":
            out = {}
            for ticker in ids:
                payload = self.http.get_json(f"{KALSHI_URL}/markets/{ticker}")
                market = (payload or {}).get("market") if isinstance(payload, Mapping) else None
                if isinstance(market, Mapping):
                    out[ticker] = normalise_kalshi_market(market)
            return out
        out = {}
        for closed in ("false", "true"):      # gamma's /markets returns open markets unless closed=true (checked 2026-09-29)
            payload = self.http.get_json(f"{POLYMARKET_URL}/markets",
                                         params=[("id", i) for i in ids] + [("closed", closed)])
            for m in payload if isinstance(payload, list) else []:
                if isinstance(m, Mapping) and str(m.get("id")) in ids:
                    out[str(m.get("id"))] = normalise_polymarket_market(m)
        return out

    def release_dates(self, series_by_kind: Mapping[str, str]) -> dict[str, list[str]]:
        """{kind: [release dates]} for the open Kalshi release events of each series. A series with no open event
        raises DataError: an empty calendar cannot be told apart from a broken source."""
        out = {}
        for kind, series in series_by_kind.items():
            dates = release_dates_from_markets(self._kalshi_markets(str(series)))
            if not dates:
                raise DataError(f"Kalshi lists no open {kind} release ({series})")
            out[str(kind)] = dates
        return out

    # --- sources -----------------------------------------------------------------------------------------

    def _polymarket_search(self, query: str) -> tuple[list[dict[str, Any]], bool]:
        quotes: list[dict[str, Any]] = []
        for page in range(1, SEARCH_PAGES + 1):
            payload = self.http.get_json(f"{POLYMARKET_URL}/public-search",
                                         params={"q": query, "limit_per_type": 50, "page": page})
            if not isinstance(payload, Mapping):
                raise DataError("Polymarket search returned no object")
            for event in payload.get("events") or []:
                for m in (event.get("markets") or []) if isinstance(event, Mapping) else []:
                    if isinstance(m, Mapping):
                        quotes.append(normalise_polymarket_market(m, event))
            if not (payload.get("pagination") or {}).get("hasMore"):
                return quotes, False
        return quotes, True

    def _kalshi_markets(self, series: str) -> list[Mapping]:
        rows: list[Mapping] = []
        cursor = None
        for _ in range(KALSHI_PAGES):
            params = {"series_ticker": series, "status": "open", "limit": 1000}
            if cursor:
                params["cursor"] = cursor
            payload = self.http.get_json(f"{KALSHI_URL}/markets", params=params)
            if not isinstance(payload, Mapping):
                raise DataError(f"Kalshi {series}: no object")
            rows += [m for m in payload.get("markets") or [] if isinstance(m, Mapping)]
            cursor = payload.get("cursor")
            if not cursor:
                return rows
        raise DataError(f"Kalshi {series}: more than {KALSHI_PAGES} pages")
