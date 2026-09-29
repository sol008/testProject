"""Scheduled-release calendar and macro-data adapter for the macro shadow books (design v3.3 §3 M5; track 17).

* **Calendar** (pure, no network). ``config/econ_calendar.yaml`` lists every 2026-2027 release date from the
  official schedules: BLS CPI and the Employment Situation, FOMC decisions, BEA GDP and Personal Income and
  Outlays, BoJ and ECB policy decisions. It also holds the owner's list of war onsets for the gold spike fade.
  `load_calendar` reads and validates it. `EconCalendar` says which releases are listed and whether a date is
  covered at all, and `reaction_session` names the NYSE session in which the market reacts.
* **Macro data** (`MacroData`): the numbers the rules need beyond ETF bars.
  - The 2- and 10-year yields from Treasury's daily par yield curve, published the same evening. FRED's
    DGS2 and DGS10 are the same series about a day later: the fallback and the cross-check.
  - FRED series: CPILFESL and CPIAUCSL (core and headline CPI, for W3) and DFEDTARU (the Fed's target, for W4).
  - The BoJ's basic loan rate by effective date (the policy rate + 0.25 point since 2024), for W4.

  `LiveMacroData` is the network client; `FakeMacroData` serves offline tests. The runner reaches it through
  the provider (`macro_data_for`).

Consensus forecasts, prediction-market odds and option-implied event moves have no free and reliable source
here, so the release log records them as unavailable (docs/phase-b/macro-shadows.md).
"""
from __future__ import annotations

import hashlib
import io
import re
import time
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date as Date
from pathlib import Path
from typing import Any, Protocol, TypeVar, runtime_checkable

import pandas as pd
import requests
import yaml

from traderec.config import CONFIG_DIR
from traderec.data.providers import (
    BACKOFF_SECONDS,
    FRED_CSV_URL,
    TIMEOUT_SECONDS,
    USER_AGENT,
    DataError,
    LiveProvider,
    parse_fred_csv,
    session_index,
)

__all__ = [
    "BOJ_BASIC_LOAN_RATE_URL",
    "CALENDAR_FILE",
    "KINDS",
    "TREASURY_CSV_URL",
    "CalendarError",
    "EconCalendar",
    "FakeMacroData",
    "LiveMacroData",
    "MacroData",
    "Onset",
    "Release",
    "load_calendar",
    "macro_data_for",
    "parse_boj_rate_csv",
    "parse_calendar",
    "parse_treasury_csv",
    "reaction_session",
]

T = TypeVar("T")

KINDS: tuple[str, ...] = ("CPI", "NFP", "FOMC", "GDP", "PCE", "BOJ", "ECB")
STATUSES = ("scheduled", "tentative", "postponed")
CALENDAR_FILE = "econ_calendar.yaml"

TREASURY_CSV_URL = ("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
                    "daily-treasury-rates.csv/{year}/all")
TREASURY_TENORS = {"2Y": "2 Yr", "10Y": "10 Yr"}          # our names -> the CSV's column headers
BOJ_BASIC_LOAN_RATE_URL = "https://www.boj.or.jp/en/statistics/boj/other/discount/cdab0101.csv"


class CalendarError(ValueError):
    """The calendar file is missing, unreadable or inconsistent."""


# --------------------------------------------------------------------------------------------------------
# The calendar (pure)
# --------------------------------------------------------------------------------------------------------

def _iso(value: Any, what: str) -> str:
    """'YYYY-MM-DD' from a string or a date (YAML turns an unquoted 2026-10-14 into a date)."""
    if isinstance(value, Date):
        return value.isoformat()
    text = str(value).strip()
    try:
        return Date.fromisoformat(text).isoformat()
    except ValueError:
        raise CalendarError(f"{what}: {value!r} is not a YYYY-MM-DD date") from None


def reaction_session(sessions: pd.DatetimeIndex, day: str, *, during_session: bool = True) -> str | None:
    """The first session in `sessions` in which the market can react to news dated `day`.

    `during_session=True` means the news came before that day's 16:00 ET close (every listed release does): the
    session is `day` itself when it is one, else the next. False (news after the close or on a closed day)
    means the first session after `day`. None when `sessions` does not reach that far yet. Taking the sessions
    from the price data (not the holiday table) also handles unscheduled closures.
    """
    ts = pd.Timestamp(day)
    later = sessions[sessions >= ts] if during_session else sessions[sessions > ts]
    return later[0].strftime("%Y-%m-%d") if len(later) else None


@dataclass(frozen=True)
class Release:
    """One scheduled release. `date` is the day it is published (a policy decision: the day it is announced)."""

    kind: str
    date: str
    time: str
    reference: str | None = None     # the period measured ("2026-09", "2026Q3 advance") or the meeting days
    status: str = "scheduled"        # "scheduled" | "tentative" | "postponed"
    note: str | None = None

    @property
    def id(self) -> str:
        return f"{self.kind}:{self.date}"

    @property
    def active(self) -> bool:
        return self.status != "postponed"


@dataclass(frozen=True)
class Onset:
    """A war onset the owner listed for the gold spike fade (news date in New York time)."""

    date: str
    label: str
    during_session: bool = True
    source: str | None = None

    @property
    def id(self) -> str:
        return f"ONSET:{self.date}"


@dataclass(frozen=True)
class EconCalendar:
    releases: tuple[Release, ...]
    coverage: Mapping[str, tuple[str, str]]
    sources: Mapping[str, str] = field(default_factory=dict)
    onsets: tuple[Onset, ...] = ()
    verified: str | None = None
    sha256: str = ""

    def of_kind(self, kind: str) -> list[Release]:
        return [r for r in self.releases if r.kind == kind]

    def active(self, kinds: Iterable[str] | None = None) -> list[Release]:
        """Releases that are not postponed, by date then kind."""
        wanted = set(kinds) if kinds is not None else set(KINDS)
        return [r for r in self.releases if r.active and r.kind in wanted]

    def postponed(self) -> list[Release]:
        return [r for r in self.releases if not r.active]

    def covers(self, kind: str, day: str) -> bool:
        """True when every release of `kind` around `day` is listed (the day is inside the kind's span)."""
        span = self.coverage.get(kind)
        return bool(span) and span[0] <= day <= span[1]

    def coverage_gaps(self, day: str, kinds: Iterable[str]) -> dict[str, list[str]]:
        """{"before": kinds whose span starts after `day`, "after": kinds whose span ended before it}."""
        before, after = [], []
        for k in kinds:
            span = self.coverage.get(k)
            if not span or day > span[1]:
                after.append(k)
            elif day < span[0]:
                before.append(k)
        return {"before": before, "after": after}


def parse_calendar(text: str) -> EconCalendar:
    """Validate and parse the calendar YAML (see config/econ_calendar.yaml for the format)."""
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise CalendarError(f"calendar is not valid YAML: {exc}") from exc
    if not isinstance(doc, dict) or not isinstance(doc.get("kinds"), dict):
        raise CalendarError("calendar needs a top-level 'kinds' mapping")
    releases: list[Release] = []
    coverage: dict[str, tuple[str, str]] = {}
    sources: dict[str, str] = {}
    for kind, spec in doc["kinds"].items():
        if kind not in KINDS:
            raise CalendarError(f"unknown release kind {kind!r} (known: {', '.join(KINDS)})")
        if not isinstance(spec, dict):
            raise CalendarError(f"{kind}: expected a mapping")
        span = spec.get("covered")
        if not isinstance(span, (list, tuple)) or len(span) != 2:
            raise CalendarError(f"{kind}: 'covered' must be [first date, last date]")
        lo, hi = _iso(span[0], f"{kind} covered"), _iso(span[1], f"{kind} covered")
        if lo > hi:
            raise CalendarError(f"{kind}: 'covered' starts after it ends")
        coverage[kind] = (lo, hi)
        sources[kind] = str(spec.get("source") or "")
        seen: set[str] = set()
        for item in spec.get("releases") or []:
            if not isinstance(item, dict) or "date" not in item:
                raise CalendarError(f"{kind}: every release needs a 'date'")
            day = _iso(item["date"], f"{kind} release")
            if day in seen:
                raise CalendarError(f"{kind}: {day} is listed twice")
            if not lo <= day <= hi:
                raise CalendarError(f"{kind}: {day} is outside 'covered' {lo}..{hi}")
            status = str(item.get("status") or "scheduled")
            if status not in STATUSES:
                raise CalendarError(f"{kind} {day}: status {status!r} is not one of {', '.join(STATUSES)}")
            seen.add(day)
            ref = item.get("reference")
            releases.append(Release(kind=kind, date=day, time=str(item.get("time") or spec.get("time") or ""),
                                    reference=None if ref is None else str(ref), status=status,
                                    note=item.get("note")))
    onsets: list[Onset] = []
    for item in doc.get("geopolitical_onsets") or []:
        if not isinstance(item, dict) or "date" not in item:
            raise CalendarError("every geopolitical onset needs a 'date' and a 'label'")
        onset = Onset(date=_iso(item["date"], "onset"), label=str(item.get("label") or ""),
                      during_session=bool(item.get("during_session", True)), source=item.get("source"))
        if any(o.date == onset.date for o in onsets):
            raise CalendarError(f"onset {onset.date} is listed twice (one per date)")
        onsets.append(onset)
    verified = doc.get("verified")
    return EconCalendar(
        releases=tuple(sorted(releases, key=lambda r: (r.date, KINDS.index(r.kind)))),
        coverage=coverage, sources=sources, onsets=tuple(sorted(onsets, key=lambda o: o.date)),
        verified=None if verified is None else _iso(verified, "verified"),
        sha256=hashlib.sha256(text.encode()).hexdigest())


_CACHE: dict[tuple[str, int, int], EconCalendar] = {}


def load_calendar(path: str | Path | None = None) -> EconCalendar:
    """Read the calendar (default config/econ_calendar.yaml; a relative path is under config/).

    Cached while the file is unchanged. Raises CalendarError when the file is missing or invalid.
    """
    p = Path(path) if path else CONFIG_DIR / CALENDAR_FILE
    if not p.is_absolute():
        p = CONFIG_DIR / p
    try:
        st = p.stat()
    except OSError as exc:
        raise CalendarError(f"no calendar at {p}: {exc}") from exc
    key = (str(p.resolve()), st.st_mtime_ns, st.st_size)
    if key not in _CACHE:
        _CACHE[key] = parse_calendar(p.read_text(encoding="utf-8"))
    return _CACHE[key]


# --------------------------------------------------------------------------------------------------------
# Payload parsers (pure)
# --------------------------------------------------------------------------------------------------------

def _dated(obj: T) -> T:
    """A session-indexed copy, sorted, one row per date (last wins)."""
    out = obj.copy()
    out.index = session_index(out.index)
    out = out[~out.index.duplicated(keep="last")].sort_index()
    out.index.name = "date"
    return out


def parse_treasury_csv(text: str) -> pd.DataFrame:
    """Treasury's daily par yield curve CSV -> yields in percent, one row per date, oldest first.

    The header is ``Date,"1 Mo",...,"2 Yr",...,"10 Yr",...`` and dates are MM/DD/YYYY. Raises ValueError when
    the Date column or every row is missing.
    """
    frame = pd.read_csv(io.StringIO(text))
    frame.columns = [str(c).strip() for c in frame.columns]
    if "Date" not in frame.columns:
        raise ValueError(f"Treasury CSV lacks a Date column: {list(frame.columns)[:4]}")
    dates = pd.to_datetime(frame["Date"].astype(str).str.strip(), format="%m/%d/%Y")
    out = frame.drop(columns=["Date"]).apply(pd.to_numeric, errors="coerce").astype(float)
    out.index = pd.DatetimeIndex(dates)
    out = _dated(out)
    if out.empty:
        raise ValueError("Treasury CSV has no rows")
    return out


_BOJ_ROW = re.compile(r"^\s*(\d{4})\.(\d{1,2})\.(\d{1,2})\s*,\s*([-+]?\d+(?:\.\d+)?)\s*,?\s*$")


def parse_boj_rate_csv(raw: bytes | str) -> pd.Series:
    """The BoJ's basic loan rate file (cdab0101.csv) -> the rate in percent, indexed by effective date.

    The file starts with Shift-JIS and English header lines, then ``YYYY.MM.DD,rate`` rows, one per change.
    Raises ValueError when no row parses.
    """
    text = raw.decode("cp932", errors="replace") if isinstance(raw, bytes) else raw
    rows = [(pd.Timestamp(int(m[1]), int(m[2]), int(m[3])), float(m[4]))
            for m in (_BOJ_ROW.match(line) for line in text.splitlines()) if m]
    if not rows:
        raise ValueError("BoJ basic loan rate CSV has no rows")
    series = pd.Series([v for _, v in rows], index=pd.DatetimeIndex([d for d, _ in rows]),
                       name="basic_loan_rate", dtype=float)
    return _dated(series)


# --------------------------------------------------------------------------------------------------------
# The adapter
# --------------------------------------------------------------------------------------------------------

@runtime_checkable
class MacroData(Protocol):
    """The macro inputs of W3, W4 and the release log. Every method raises DataError when it has nothing."""

    def treasury_yields(self, tenor: str, years: Iterable[int] | None = None) -> pd.Series:
        """Treasury par yield ("2Y" or "10Y"), percent, per business day, covering at least `years`."""
        ...

    def fred_series(self, series_id: str) -> pd.Series:
        """A FRED series as published (DGS2, DGS10, CPILFESL, CPIAUCSL, DFEDTARU)."""
        ...

    def boj_basic_loan_rate(self) -> pd.Series:
        """The BoJ's basic loan rate, percent, indexed by effective date (one row per change)."""
        ...


class LiveMacroData:
    """Network-backed MacroData. Same policy as LiveProvider: 20 s timeouts, 3 retries 1/2/4 s apart on
    connection errors, 429 and 5xx; a memo cache per instance (one run sees one snapshot); ``sources`` records
    what served each call. ``session`` and ``sleep`` are test seams; ``clock`` names the current year."""

    def __init__(self, *, session: Any = None, sleep: Callable[[float], None] = time.sleep,
                 clock: Callable[[], pd.Timestamp] | None = None, user_agent: str = USER_AGENT) -> None:
        self._session = session if session is not None else requests.Session()
        self._sleep = sleep
        self._clock = clock or (lambda: pd.Timestamp.now(tz="America/New_York"))
        self.user_agent = user_agent
        self.sources: dict[str, str] = {}
        self._cache: dict[tuple[Any, ...], Any] = {}

    def treasury_yields(self, tenor: str, years: Iterable[int] | None = None) -> pd.Series:
        if tenor not in TREASURY_TENORS:
            raise ValueError(f"unknown tenor {tenor!r} (known: {', '.join(TREASURY_TENORS)})")
        wanted = sorted(set(years or [int(pd.Timestamp(self._clock()).year)]))
        column = TREASURY_TENORS[tenor]
        parts = []
        for year in wanted:
            frame = self._memo(("treasury", year), lambda y=year: self._treasury_year(y))
            if column not in frame.columns:
                raise DataError(f"Treasury {year} curve has no {column!r} column")
            parts.append(frame[column].dropna())
        self.sources[f"yield:{tenor}"] = "treasury"
        return _dated(pd.concat(parts)).rename(tenor)

    def fred_series(self, series_id: str) -> pd.Series:
        series = self._memo(("fred", series_id), lambda: parse_fred_csv(
            self._get(FRED_CSV_URL, params={"id": series_id}).text, series_id))
        self.sources[f"fred:{series_id}"] = "fred"
        return series.copy()

    def boj_basic_loan_rate(self) -> pd.Series:
        series = self._memo(("boj",), lambda: parse_boj_rate_csv(self._get(BOJ_BASIC_LOAN_RATE_URL).content))
        self.sources["boj:basic_loan_rate"] = "boj"
        return series.copy()

    # --- plumbing ------------------------------------------------------------------------------------------

    def _treasury_year(self, year: int) -> pd.DataFrame:
        params = {"type": "daily_treasury_yield_curve", "field_tdr_date_value": str(year), "page": "",
                  "_format": "csv"}
        text = self._get(TREASURY_CSV_URL.format(year=year), params=params).text
        try:
            return parse_treasury_csv(text)
        except ValueError as exc:
            raise DataError(f"Treasury par yield curve {year}: {exc}") from exc

    def _memo(self, key: tuple[Any, ...], fetch: Callable[[], T]) -> T:
        if key not in self._cache:
            try:
                self._cache[key] = fetch()
            except ValueError as exc:            # a payload that does not parse is a data failure
                raise DataError(f"{key[0]}: {exc}") from exc
        return self._cache[key]

    def _get(self, url: str, *, params: Mapping[str, Any] | None = None) -> requests.Response:
        """GET under the retry policy. Raises DataError when no 2xx/3xx answer arrives."""
        attempts = len(BACKOFF_SECONDS) + 1
        problem = "no attempt made"
        for attempt in range(attempts):
            if attempt:
                self._sleep(BACKOFF_SECONDS[attempt - 1])
            try:
                resp = self._session.get(url, params=params, headers={"User-Agent": self.user_agent},
                                         timeout=TIMEOUT_SECONDS, allow_redirects=True)
            except requests.RequestException as exc:
                problem = f"{type(exc).__name__}: {exc}"
                continue
            status = int(resp.status_code)
            if status < 400:
                return resp
            problem = f"HTTP {status}"
            if status != 429 and status < 500:
                break                           # a permanent client error: retrying will not help
        raise DataError(f"GET {url} failed ({problem})")


class FakeMacroData:
    """In-memory MacroData for offline tests. A missing series raises DataError, as LiveMacroData does when a
    source fails. ``yields`` maps "2Y"/"10Y" to percent series; ``fred`` maps series ids to series."""

    def __init__(self, yields: Mapping[str, pd.Series] | None = None, fred: Mapping[str, pd.Series] | None = None,
                 boj: pd.Series | None = None) -> None:
        self._yields = {k: _dated(v) for k, v in (yields or {}).items()}
        self._fred = {k: _dated(v) for k, v in (fred or {}).items()}
        self._boj = None if boj is None else _dated(boj)
        self.calls: list[str] = []

    def treasury_yields(self, tenor: str, years: Iterable[int] | None = None) -> pd.Series:
        self.calls.append(f"treasury:{tenor}")
        if tenor not in self._yields:
            raise DataError(f"FakeMacroData has no {tenor} yields")
        return self._yields[tenor].copy()

    def fred_series(self, series_id: str) -> pd.Series:
        self.calls.append(f"fred:{series_id}")
        if series_id not in self._fred:
            raise DataError(f"FakeMacroData has no FRED {series_id}")
        return self._fred[series_id].copy()

    def boj_basic_loan_rate(self) -> pd.Series:
        self.calls.append("boj")
        if self._boj is None:
            raise DataError("FakeMacroData has no BoJ rate")
        return self._boj.copy()


def macro_data_for(provider: Any) -> MacroData | None:
    """The macro-data adapter reached through the provider (docs/PHASE_B_CONTRACTS.md §0.3).

    * ``provider.macro_data`` when the provider carries one (tests inject a FakeMacroData this way);
    * for a LiveProvider without one, a new LiveMacroData, attached to it so that the whole run shares one
      client and its cache;
    * otherwise None: the inputs are unavailable and the rules that need them fail closed.
    """
    md = getattr(provider, "macro_data", None)
    if md is not None:
        return md
    if isinstance(provider, LiveProvider):
        md = LiveMacroData(user_agent=getattr(provider, "user_agent", USER_AGENT))
        provider.macro_data = md
        return md
    return None
