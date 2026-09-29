"""Macro data for W8/W9 (design v3.3 §3 M5, §4 R3, §10; track 17 §5.2 W8/W9, §7.4 R10(f)).

* **Explicit crude months.** Triggers never read a continuous future across a roll: Brent's November contract expired
  on 30 Sep 2026 and made "front-month Brent" drop 7% mechanically (design §11 "Data traps"). The front-safe month
  skips a contract in its last two weeks, as `pipeline._contango_veto` does for WTI:
  - WTI (CL, NYMEX) expires about three business days before the 25th of the month before delivery:
    front = month + 1 on days 1-15, month + 2 after (Sep 29 -> November, CLX26);
  - Brent (BZ, NYMEX's Brent contract) expires on the last business day of the second month before delivery:
    front = month + 2 on days 1-15, month + 3 after (Sep 29 -> December, BZZ26: the design's "explicit December
    contract").
  Yahoo symbols look like "BZZ26.NYM"; the bars come through the provider (`run.bars`), so this module stays pure.
* **Day moves** are close-to-close on one instrument's own bars, dated exactly on the run date (fail closed).
* **Contango veto (R3):** no long USO when the annualised front-to-second WTI roll yield is below -20%.
* **DAL's next earnings date:** Nasdaq's earnings-date API (named source, Zacks data), cross-checked with Yahoo's
  calendar when it answers. Missing or disagreeing dates fail closed: no DAL legs.
* **W9's "≥1 mb/d physically offline" input.** No free, real-time, machine-readable source reports barrels lost
  with "no restoration or bypass path inside ~2 weeks" (track 17 R2: "per IEA/EIA/company statements"). So it is
  an owner-maintained record in the state directory, validated mechanically and failing closed (see
  `supply_loss_check` and docs/phase-b/w8w9.md).
"""
from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

import pandas as pd

from traderec.data.prediction_markets import Http
from traderec.data.providers import BROWSER_HEADERS, DataError

__all__ = [
    "MONTH_CODES", "MacroData", "combine_earnings", "contango", "contract_symbol", "day_move", "domain_allowed",
    "front_contracts", "front_month", "load_supply_input", "parse_nasdaq_earnings", "parse_yahoo_calendar",
    "roll_yield", "supply_loss_check",
]

MONTH_CODES = "FGHJKMNQUVXZ"
YAHOO_SUFFIX = ".NYM"
# months ahead of the calendar month for the front-safe contract: (on days 1-15, after day 15)
FRONT_LEAD = {"CL": (1, 2), "BZ": (2, 3)}
NASDAQ_EARNINGS_URL = "https://api.nasdaq.com/api/analyst/{ticker}/earnings-date"
EARNINGS_MAX_GAP_DAYS = 7    # Nasdaq and Yahoo may disagree by this much (then the earlier date is used)


# --------------------------------------------------------------------------------------------------------
# Explicit futures months
# --------------------------------------------------------------------------------------------------------

def front_month(root: str, date: str) -> pd.Period:
    """The front-safe delivery month of `root` ("CL" or "BZ") on `date` (see the module docstring)."""
    d = pd.Timestamp(date)
    early, late = FRONT_LEAD[root]
    return d.to_period("M") + (early if d.day <= 15 else late)


def contract_symbol(root: str, month: pd.Period) -> str:
    """contract_symbol("BZ", Period("2026-12")) -> "BZZ26.NYM"."""
    return f"{root}{MONTH_CODES[month.month - 1]}{month.year % 100:02d}{YAHOO_SUFFIX}"


def front_contracts(root: str, date: str, n: int = 2) -> list[str]:
    """The front-safe contract on `date` and the n - 1 after it."""
    first = front_month(root, date)
    return [contract_symbol(root, first + i) for i in range(n)]


def day_move(bars: pd.DataFrame | None, date: str) -> dict[str, Any]:
    """Close-to-close return on `date` from one instrument's own bars (never across contracts).

    {"ok", "ret", "close", "prev_close", "prev_date", "reason"}. Fails closed (ok False) when `date` has no close,
    there is no earlier close, or a close is not a positive number.
    """
    out: dict[str, Any] = {"ok": False, "ret": None, "close": None, "prev_close": None, "prev_date": None,
                           "reason": ""}
    if bars is None or "close" not in getattr(bars, "columns", []):
        return {**out, "reason": "no bars"}
    closes = bars["close"].dropna().astype(float).sort_index()
    ts = pd.Timestamp(date)
    closes = closes.loc[:ts]
    if closes.empty or closes.index[-1] != ts:
        return {**out, "reason": f"no close on {date} (stale or missing)"}
    if len(closes) < 2:
        return {**out, "reason": "no prior close"}
    close, prev = float(closes.iloc[-1]), float(closes.iloc[-2])
    if not (close > 0 and prev > 0 and math.isfinite(close) and math.isfinite(prev)):
        return {**out, "reason": "non-positive close"}
    return {"ok": True, "ret": close / prev - 1.0, "close": close, "prev_close": prev,
            "prev_date": closes.index[-2].strftime("%Y-%m-%d"), "reason": ""}


def roll_yield(front_close: float, second_close: float) -> float:
    """Annualised front-to-second roll yield, log(front / second) x 12 (negative in contango)."""
    return math.log(float(front_close) / float(second_close)) * 12.0


def contango(front: pd.DataFrame | None, second: pd.DataFrame | None, date: str, threshold: float,
             max_stale_days: int = 5) -> dict[str, Any]:
    """R3: {"ok", "veto", "roll_yield", "prices", "reason"}. ok False (fail closed for new longs) when either
    explicit month has no close within `max_stale_days` of `date`."""
    d = pd.Timestamp(date)
    prices = []
    for bars in (front, second):
        closes = (bars["close"].dropna().astype(float).loc[:d] if bars is not None and "close" in bars.columns
                  else pd.Series(dtype=float))
        if closes.empty or (d - closes.index[-1]).days > max_stale_days or float(closes.iloc[-1]) <= 0:
            return {"ok": False, "veto": None, "roll_yield": None, "prices": prices,
                    "reason": "stale or missing explicit crude month"}
        prices.append(float(closes.iloc[-1]))
    ry = roll_yield(prices[0], prices[1])
    return {"ok": True, "veto": ry < float(threshold), "roll_yield": ry, "prices": prices, "reason": ""}


# --------------------------------------------------------------------------------------------------------
# DAL's next earnings date
# --------------------------------------------------------------------------------------------------------

def parse_nasdaq_earnings(payload: Any, asof: str) -> str | None:
    """The next earnings date on or after `asof` from Nasdaq's `/api/analyst/{T}/earnings-date` JSON, or None.

    Reads "Earnings announcement* for DAL: Oct 09, 2026" (the heading line), else the MM/DD/YYYY date in the
    report text ("expected* to report earnings on 10/09/2026 before market open").
    """
    try:
        data = payload["data"] or {}
    except (KeyError, TypeError):
        return None
    found = None
    m = re.search(r":\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4})", str(data.get("announcement") or ""))
    if m:
        try:
            found = datetime.strptime(" ".join(m.groups()), "%b %d %Y").date().isoformat()
        except ValueError:
            found = None
    if found is None:
        m = re.search(r"(\d{2})/(\d{2})/(\d{4})", str(data.get("reportText") or ""))
        if m:
            try:
                found = datetime.strptime("/".join(m.groups()), "%m/%d/%Y").date().isoformat()
            except ValueError:
                found = None
    return found if found and found >= str(asof)[:10] else None


def parse_yahoo_calendar(calendar: Any, asof: str) -> list[str]:
    """Earnings dates on or after `asof` from yfinance's `Ticker.calendar` ({"Earnings Date": [date, ...]}).
    Yahoo lists two dates while a date is unconfirmed (a window); both are returned, sorted."""
    raw = calendar.get("Earnings Date") if isinstance(calendar, Mapping) else None
    items = raw if isinstance(raw, (list, tuple)) else [raw] if raw is not None else []
    out = []
    for item in items:
        try:
            day = pd.Timestamp(item).strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            continue
        if day >= str(asof)[:10]:
            out.append(day)
    return sorted(set(out))


def combine_earnings(nasdaq: str | None, yahoo: list[str] | None, asof: str,
                     max_gap_days: int = EARNINGS_MAX_GAP_DAYS) -> dict[str, Any]:
    """The next earnings date to plan around: {"ok", "date", "sources", "reason"}.

    Nasdaq is the named source and must answer. Yahoo, when it answers, can only make the date earlier: within
    `max_gap_days` the earlier of the two is used; further apart, the sources disagree and the answer fails closed.
    """
    if not nasdaq:
        return {"ok": False, "date": None, "sources": {}, "reason": "no earnings date from Nasdaq"}
    sources: dict[str, Any] = {"nasdaq": nasdaq}
    if yahoo:
        sources["yahoo"] = yahoo
        gap = abs((pd.Timestamp(yahoo[0]) - pd.Timestamp(nasdaq)).days)
        if gap > max_gap_days:
            return {"ok": False, "date": None, "sources": sources,
                    "reason": f"Nasdaq ({nasdaq}) and Yahoo ({yahoo[0]}) disagree by {gap} days"}
        return {"ok": True, "date": min(nasdaq, yahoo[0]), "sources": sources, "reason": ""}
    return {"ok": True, "date": nasdaq, "sources": sources, "reason": "Yahoo unavailable; Nasdaq only"}


# --------------------------------------------------------------------------------------------------------
# W9: the "≥1 mb/d physically offline" input
# --------------------------------------------------------------------------------------------------------

def domain_allowed(url: str, allowed: list[str] | tuple[str, ...]) -> bool:
    """True for an https URL whose host is an allow-listed domain or one of its subdomains."""
    try:
        parsed = urlparse(str(url).strip())
    except ValueError:
        return False
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host:
        return False
    return any(host == d or host.endswith("." + d) for d in (str(a).lower().strip(".") for a in allowed) if d)


def load_supply_input(path: Path) -> dict[str, Any]:
    """The owner's supply-loss record file: {"ok", "events", "reason"}. A missing file is ok with no events; an
    unreadable one is not ok (the caller alerts)."""
    path = Path(path)
    if not path.exists():
        return {"ok": True, "events": [], "reason": "no supply-loss input file"}
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return {"ok": False, "events": [], "reason": f"unreadable supply-loss input: {type(exc).__name__}"}
    events = doc.get("events") if isinstance(doc, Mapping) else None
    if not isinstance(events, list):
        return {"ok": False, "events": [], "reason": "supply-loss input has no events list"}
    return {"ok": True, "events": [e for e in events if isinstance(e, Mapping)], "reason": ""}


def supply_loss_check(events: list[Mapping], date: str, prev_session: str, cfg: Mapping[str, Any]) -> dict[str, Any]:
    """The W9 barrel-loss condition from the owner's records (track 17 §5.2 W9 and R2), failing closed.

    A record qualifies when every field is present and valid:
    - "id" (unique) and "event_date" on `date` or the session before it (track 17 R2: classify within 24 hours);
    - "mbd_offline" >= cfg["min_mbd_offline"] (1.0): additional exports physically offline, million barrels a day;
    - "no_restoration_days" >= cfg["min_no_restoration_days"] (14): no restoration or bypass path inside ~2 weeks;
    - "sources": >= cfg["min_citations"] distinct https URLs on cfg["source_domains"] (IEA, EIA, company sites);
    - no "restored_on" on or before `date`.
    Returns {"ok", "event", "reasons": [...one per rejected record...]}; the latest qualifying record wins.
    """
    reasons: list[str] = []
    good: list[Mapping] = []
    for ev in events:
        rid = str(ev.get("id") or "").strip()
        why = []
        day = str(ev.get("event_date") or "")[:10]
        if not rid:
            why.append("no id")
        if day not in (date, prev_session):
            why.append(f"event_date {day or 'missing'} is not {prev_session} or {date}")
        mbd = ev.get("mbd_offline")
        if not isinstance(mbd, (int, float)) or isinstance(mbd, bool) or mbd < float(cfg["min_mbd_offline"]):
            why.append(f"mbd_offline {mbd!r} below {cfg['min_mbd_offline']}")
        days = ev.get("no_restoration_days")
        if (not isinstance(days, (int, float)) or isinstance(days, bool)
                or days < float(cfg["min_no_restoration_days"])):
            why.append(f"no_restoration_days {days!r} below {cfg['min_no_restoration_days']}")
        sources = ev.get("sources") if isinstance(ev.get("sources"), list) else []
        ok_sources = sorted({str(s).strip() for s in sources if domain_allowed(s, cfg["source_domains"])})
        if len(ok_sources) < int(cfg["min_citations"]):
            why.append(f"{len(ok_sources)} allow-listed sources (needs {cfg['min_citations']})")
        restored = str(ev.get("restored_on") or "")[:10]
        if restored and restored <= date:
            why.append(f"restored on {restored}")
        if why:
            reasons.append(f"{rid or '?'}: " + "; ".join(why))
        else:
            good.append({**ev, "id": rid, "event_date": day, "sources": ok_sources})
    if not good:
        return {"ok": False, "event": None, "reasons": reasons or ["no supply-loss record"]}
    best = max(good, key=lambda e: (e["event_date"], e["id"]))
    return {"ok": True, "event": dict(best), "reasons": reasons}


# --------------------------------------------------------------------------------------------------------
# Live adapter
# --------------------------------------------------------------------------------------------------------

class MacroData:
    """Network adapter for DAL-style earnings dates: Nasdaq (named source), cross-checked with Yahoo."""

    def __init__(self, http: Http | None = None, yahoo_calendar: Any = None) -> None:
        self.http = http or Http()
        self._yahoo_calendar = yahoo_calendar or _yf_calendar

    def next_earnings(self, ticker: str, asof: str) -> dict[str, Any]:
        """{"ok", "date", "sources", "reason"} (see `combine_earnings`); never raises."""
        try:
            payload = self.http.get_json(NASDAQ_EARNINGS_URL.format(ticker=quote(ticker, safe="")),
                                         headers=BROWSER_HEADERS)
            nasdaq = parse_nasdaq_earnings(payload, asof)
        except DataError as exc:
            return {"ok": False, "date": None, "sources": {}, "reason": f"Nasdaq earnings date: {exc}"}
        try:
            yahoo = parse_yahoo_calendar(self._yahoo_calendar(ticker), asof)
        except Exception:  # noqa: BLE001 - Yahoo is a cross-check only
            yahoo = []
        return combine_earnings(nasdaq, yahoo, asof)


def _yf_calendar(ticker: str) -> Any:
    import yfinance as yf  # lazy, as in providers: offline tests never import it

    return yf.Ticker(ticker).calendar
