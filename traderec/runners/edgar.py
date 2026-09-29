"""EDGAR/FINRA shadow screens in the daily run: insider clusters (SH1), special dividends (SH2), activist 13D filings
(SH3), near-completion cash mergers (SH4) and CEF tender capture (design v3.3 §3 "Shadow ledger", §5 never-list, §10
data table; track 16 §10.2 and §10.4 P1; track 05 §11 A). No emails, no orders, no LLM.

Each evening, inside the 22:17 ET daily run (docs/PHASE_B_CONTRACTS.md §7; guarded: an exception becomes an alert):

1. Screen. For each setup, the filing dates it has not screened yet, up to the run date and at most
   `max_catchup_days` back. A day counts as screened only once it was searched after 22:00 ET (+5 minutes), when
   EDGAR stops accepting filings for it (Form 4s are accepted until then). A run that starts earlier (in winter the
   daily workflow's first slot, 02:17 UTC, fires at 21:17 EST) also screens the run date provisionally, without
   marking it done, so most events are still recorded before their entry; `provisional_before_final: false` turns
   that off. The last screened date is searched again (`overlap_days`) for filings indexed late. New filings (not
   in `seen`) are fetched, parsed and screened with `traderec.modules.edgar_screens`.
   A hit becomes a shadow event, logged as a `shadow` record ("signal") before its entry is known; a near-miss (the
   setup's trigger held but a universe or data check failed) is logged as "filtered".
2. Enter and score. An event's entry session is filled once the stock's bars show it (its open and close are both
   kept: the system enters at the next open, most tracks at that session's close); it is scored at its exit.
3. Cap. Fetching stops after `max_seconds`, `max_documents` or `max_price_lookups`. The rest carries over: a date
   counts as screened only when all of it was, and `seen` keeps filings from being fetched twice.

Fail closed: when a source fails (EDGAR search, www.sec.gov refusing documents, a price or NAV series), nothing is
recorded for that setup and date, the run raises `run.alert("data", ...)` and logs a `shadow` "data_missing" record,
and the date is retried next run. A stock that has no usable price data is a near-miss, not an alert.

Sources come from the data provider (`provider.edgar`, `provider.finra`; see `sources`). A LiveProvider without them
gets live clients whose SEC User-Agent comes from SEC_USER_AGENT. A provider with neither (the offline fakes of other
tests) skips the screens with a note.

State (`state.shadow.EDGAR`, docs/PHASE_B_CONTRACTS.md §6): `events` and `seen` ("SETUP:accession" -> filing date,
pruned after `seen_keep_days`), plus `cursor` and `started` (per setup), `insiders` (SH1's purchases by issuer,
pruned to the window), `lockout` ("SETUP:cik" -> first date a new event may start), `deals` (SH4's watchlist) and
`last_run`.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any, Callable

import pandas as pd

from traderec.data.edgar import (BudgetExhausted, EdgarAccessDenied, EdgarClient, FinraClient, group_filings,
                                 html_to_text, parse_cef_tender, parse_cef_tender_result, parse_form4,
                                 parse_merger_terms, parse_merger_update, parse_special_dividend, yahoo_symbol)
from traderec.data.providers import DataError, LiveProvider
from traderec.market_calendar import ET, iso, now_et, prev_trading_day
from traderec.modules import edgar_screens as S

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run

BOOK = "EDGAR"
ORDER = ("SH3", "SH2", "CEF", "SH4", "SH1")     # cheap screens first; SH1 fetches the most documents
SH_ACCESS_HINT = ("www.sec.gov refused the filing documents: set the SEC_USER_AGENT secret to a name and contact "
                  "(docs/phase-b/edgar.md, owner setup)")

# Defaults for keys missing from config/constitution.yaml `shadow.EDGAR` (kept equal to it; a test checks that).
DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "filings_final_et": "22:00", "final_margin_minutes": 5, "provisional_before_final": True, "overlap_days": 1,
    "max_catchup_days": 7,
    "max_seconds": 90, "max_documents": 150, "max_price_lookups": 40, "max_requests_per_second": 8,
    "seen_keep_days": 7, "void_after_days": 10, "short_interest_lag_days": 12, "large_cap_min": 2.0e9,
    "costs": [[1.0e10, 0.0015, "large"], [2.0e9, 0.003, "mid"], [3.0e8, 0.008, "small"], [5.0e7, 0.020, "micro"],
              [0, 0.040, "nano"]],
    "SH1": {"enabled": True, "prefilter_query": "P", "prefilter_check_min_filings": 150, "window_days": 30,
            "min_insiders": 2, "lockout_days": 90, "max_filing_lag_days": 14, "warmup_days": 30,
            "ticker_tolerance": 0.25, "entry": "open", "hold_sessions": 20,
            "universe": {"min_price": 5.0, "min_mcap": 3.0e8, "min_dvol20": 1.0e6},
            "promotion": {"min_trades": 60, "min_mean": 0.01, "min_t": 2.5, "max_reaction_median": 0.01},
            "base_rate": {"win_rate": 0.42, "mean": -0.0106}},
    "SH2": {"enabled": True, "query": '"special dividend" OR "special cash dividend"', "min_multiple_of_regular": 1.5,
            "min_yield": 0.01, "ex_date_days": [3, 75], "regular_lookback_days": 730, "entry": "close",
            "universe": {"min_price": 5.0, "min_dvol20": 1.0e6},
            "promotion": {"min_trades": 30, "min_mean": 0.005, "min_t": 2.0},
            "base_rate": {"win_rate": 0.52, "mean": 0.0038}},
    "SH3": {"enabled": True, "forms": "SCHEDULE 13D,SC 13D", "lockout_days": 90, "entry": "close",
            "hold_sessions": 20, "universe": {"min_mcap": 3.0e8, "min_price": 2.0, "min_dvol20": 1.0e5,
                                               "min_history": 60},
            "promotion": {"min_trades": 60, "min_mean": 0.01, "min_t": 2.5, "max_reaction_median": 0.01},
            "base_rate": {"win_rate": 0.42, "mean": -0.0107}},
    "SH4": {"enabled": True, "query": '"merger"', "max_days_to_close": 30, "watch_days": 180, "lookup_days": 365,
            "max_hold_days": 60, "entry": "close", "universe": {"min_mcap": 3.0e8},
            "promotion": {"min_trades": 30, "min_excess_annualized": 0.03, "max_break_loss_book": 0.02,
                          "position_weight": 0.05},
            "base_rate": {"win_rate": 0.95}},
    "CEF": {"enabled": True, "query": '"net asset value"', "min_pct_nav": 0.98, "min_discount": 0.08,
            "lockout_days": 120, "nav_symbol": "X{ticker}X", "remainder_sell_sessions": 3,
            "max_hold_days": 60, "entry": "open", "universe": {"min_mcap": 3.0e8, "min_dvol20": 1.0e6},
            "promotion": None, "base_rate": None},
}


def _now_et() -> datetime:
    """Now in New York (a seam for tests)."""
    return now_et()


# --------------------------------------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------------------------------------

def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook: screen the day's filings, fill and score open shadow events, prune the state."""
    cfg = config(run)
    if not cfg.get("enabled"):
        return
    book = _book(run.state)
    edgar_src, finra_src = sources(run, cfg)
    if edgar_src is None:
        run.note("EDGAR shadow skipped: the data provider has no EDGAR source")
        return
    ctx = _Ctx(run, cfg, book, edgar_src, finra_src)
    now = _now_et()
    for setup in ORDER:
        if not cfg[setup].get("enabled", True):
            continue
        dates, dropped, final = _pending(book, setup, run.date, now, cfg)
        if dropped:
            ctx.alert(f"EDGAR {setup}: filings of {dropped[0]} to {dropped[-1]} were not screened (more than "
                      f"{cfg['max_catchup_days']} days behind)")
        for d in dates:
            if ctx.exhausted:
                break
            try:
                complete = SCREENS[setup](ctx, d)
            except BudgetExhausted:
                ctx.exhausted = True
                break
            except EdgarAccessDenied as exc:
                ctx.source_failed(setup, d, exc, hint=SH_ACCESS_HINT)
                break
            except DataError as exc:
                ctx.source_failed(setup, d, exc)
                break
            ctx.screened.setdefault(setup, []).append(d)
            if not complete:
                ctx.exhausted = True
            elif d <= final:                   # a provisional screen of today does not mark it done
                book["cursor"][setup] = max(book["cursor"].get(setup) or d, d)
    try:                                       # with what is left of the budget: a stop only delays a score
        _score_events(ctx)
    except BudgetExhausted:
        ctx.exhausted = True
    except EdgarAccessDenied as exc:
        ctx.source_failed("scoring", run.date, exc, hint=SH_ACCESS_HINT)
    except DataError as exc:
        ctx.source_failed("scoring", run.date, exc)
    _prune(book, run.date, cfg)
    ctx.finish()


SCREENS: dict[str, Callable[["_Ctx", str], bool]] = {}      # filled below the screen functions


def config(run: "Run") -> dict:
    """`shadow.EDGAR` from the constitution over DEFAULTS (setup blocks merged key by key)."""
    try:
        raw = dict(run.cfg.shadow(BOOK) or {})
    except KeyError:
        raw = {}
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULTS.items()}
    for k, v in raw.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = {**out[k], **v}
        else:
            out[k] = v
    return out


def sources(run: "Run", cfg: dict | None = None) -> tuple[Any, Any]:
    """(EDGAR client, FINRA client) from the provider: its `edgar` / `finra` attributes when present; a LiveProvider
    without them gets live clients (kept on it for the rest of the run); any other provider gets (None, None)."""
    provider = run.provider
    edgar_src, finra_src = getattr(provider, "edgar", None), getattr(provider, "finra", None)
    if edgar_src is None and isinstance(provider, LiveProvider):
        rate = float((cfg or {}).get("max_requests_per_second", DEFAULTS["max_requests_per_second"]))
        edgar_src = EdgarClient(max_rate=rate)
        finra_src = finra_src or FinraClient()
        provider.edgar, provider.finra = edgar_src, finra_src
    return edgar_src, finra_src


def _book(state: dict) -> dict:
    book = state.setdefault("shadow", {}).setdefault(BOOK, {})
    book.setdefault("events", [])
    book.setdefault("seen", {})
    for key in ("cursor", "started", "insiders", "lockout", "deals"):
        book.setdefault(key, {})
    return book


def _pending(book: dict, setup: str, run_date: str, now: datetime, cfg: dict) -> tuple[list[str], list[str], str]:
    """(filing dates to screen now, dates dropped as too old, the last date whose filings are final).

    Weekdays only (EDGAR is closed at weekends). The run date is final from 22:05 ET; before that it is screened
    provisionally when `provisional_before_final` is on.
    """
    hh, mm = (int(x) for x in str(cfg["filings_final_et"]).split(":"))
    cutoff = datetime(*date.fromisoformat(run_date).timetuple()[:3], hh, mm, tzinfo=ET) + timedelta(
        minutes=int(cfg["final_margin_minutes"]))
    final = date.fromisoformat(run_date) if now >= cutoff else date.fromisoformat(run_date) - timedelta(days=1)
    last = date.fromisoformat(run_date) if cfg.get("provisional_before_final") else final
    earliest = date.fromisoformat(run_date) - timedelta(days=int(cfg["max_catchup_days"]))
    cursor = book["cursor"].get(setup)
    first = date.fromisoformat(book["started"].setdefault(setup, final.isoformat()))
    if cursor is None:                 # nothing screened yet: from the first date this setup ran (a failed first run
        start = gap = first            # is retried)
    else:
        start = date.fromisoformat(cursor) - timedelta(days=int(cfg["overlap_days"])) + timedelta(days=1)
        gap = date.fromisoformat(cursor) + timedelta(days=1)
    dropped = []
    d = gap
    while d < earliest:
        if d.weekday() < 5:
            dropped.append(d.isoformat())
        d += timedelta(days=1)
    out, d = [], max(start, earliest)
    while d <= last:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    if dropped:
        book["cursor"][setup] = (earliest - timedelta(days=1)).isoformat()
    return out, dropped, final.isoformat()


# --------------------------------------------------------------------------------------------------------
# Run context: budget, prices, events, ledger records
# --------------------------------------------------------------------------------------------------------

class _Ctx:
    """One run's EDGAR work: sources, the budget, price lookups, and the records it writes."""

    def __init__(self, run: "Run", cfg: dict, book: dict, edgar_src: Any, finra_src: Any) -> None:
        self.run, self.cfg, self.book = run, cfg, book
        self.edgar, self.finra = edgar_src, finra_src
        self.t0 = time.monotonic()
        self.deadline = self.t0 + float(cfg["max_seconds"])
        self.prices_left = int(cfg["max_price_lookups"])
        self.exhausted = False
        self.screened: dict[str, list[str]] = {}
        self.counts = {"signals": 0, "filtered": 0, "entries": 0, "scored": 0, "void": 0}
        self._bars: dict[str, pd.DataFrame | None] = {}
        self._alerted: set[str] = set()
        self._stats0 = dict(getattr(edgar_src, "stats", {}) or {})
        if hasattr(edgar_src, "start"):
            edgar_src.start(seconds=float(cfg["max_seconds"]), documents=int(cfg["max_documents"]))

    # --- budget and data ----------------------------------------------------------------------------------

    def check_time(self) -> None:
        if time.monotonic() >= self.deadline:
            raise BudgetExhausted("EDGAR time budget used up")

    def bars(self, ticker: str | None) -> pd.DataFrame | None:
        """Daily bars cut at the run date (`run.bars`), or None when the provider has none. Counts against the
        price-lookup budget; raises BudgetExhausted past it."""
        if not ticker:
            return None
        if ticker not in self._bars:
            self.check_time()
            if self.prices_left <= 0:
                raise BudgetExhausted("EDGAR price-lookup budget used up")
            self.prices_left -= 1
            try:
                df = self.run.bars(ticker)
                self._bars[ticker] = df if df is not None and len(df) else None
            except Exception:  # noqa: BLE001 - a missing ticker is a near-miss for the screen, not a failed run
                self._bars[ticker] = None
        return self._bars[ticker]

    def seen(self, setup: str, adsh: str) -> bool:
        return f"{setup}:{adsh}" in self.book["seen"]

    def mark_seen(self, setup: str, adsh: str, d: str) -> None:
        self.book["seen"][f"{setup}:{adsh}"] = d

    def fetch(self, filing: dict, doc: dict) -> str | None:
        """A filing document's text; None when EDGAR does not have it (other failures raise)."""
        try:
            return self.edgar.document(filing["ciks"], filing["adsh"], doc["filename"])
        except (BudgetExhausted, EdgarAccessDenied):
            raise
        except DataError as exc:
            if "not found" in str(exc):
                return None
            raise

    def ticker_for(self, entity: dict) -> str | None:
        """A filer's Yahoo symbol: its EFTS display ticker, else its submissions record."""
        for t in entity.get("tickers") or []:
            sym = yahoo_symbol(t)
            if sym:
                return sym
        info = self.edgar.company(entity["cik"]) if entity.get("cik") else None
        for t in (info or {}).get("tickers") or []:
            sym = yahoo_symbol(t)
            if sym:
                return sym
        return None

    def market_value(self, cik: int | None, d: str, price: float | None, shares: float | None = None) -> dict:
        """{"mcap", "basis", "shares", "shares_filed"}: reported shares x price, else the public float."""
        info: dict[str, Any] = {"mcap": None, "basis": "", "shares": shares, "shares_filed": None}
        if shares is None and cik:
            so = self.edgar.shares_outstanding(cik, d)
            if so:
                info.update(shares=so["shares"], shares_filed=so["filed"])
        pf = None
        if info["shares"] is None and cik:
            found = self.edgar.public_float(cik, d)
            pf = found["value"] if found else None
        info["mcap"], info["basis"] = S.market_cap(info["shares"], price, pf)
        return info

    def short_interest(self, ticker: str, d: str, shares: float | None) -> dict | None:
        """FINRA's latest published short interest for the event (an annotation: failures are ignored)."""
        if self.finra is None or not ticker:
            return None
        try:
            si = self.finra.short_interest(ticker.replace("-", "."), d,
                                           lag_days=int(self.cfg["short_interest_lag_days"]))
        except Exception:  # noqa: BLE001 - an annotation must never block the screen
            return None
        if si and shares and si.get("short_qty") is not None:
            si = {**si, "si_pct": float(si["short_qty"]) / float(shares)}
        return si

    # --- records ------------------------------------------------------------------------------------------

    def alert(self, msg: str) -> None:
        if msg not in self._alerted:
            self._alerted.add(msg)
            self.run.alert("data", msg)

    def log(self, event: str, payload: dict) -> None:
        self.run.log("shadow", {"book": BOOK, "event": event, **payload})

    def source_failed(self, setup: str, d: str, exc: Exception, hint: str | None = None) -> None:
        msg = f"EDGAR {setup} {d}: {hint or 'source unavailable'} ({type(exc).__name__}: {exc})"
        self.log("data_missing", {"setup": setup, "filing_date": d, "error": f"{type(exc).__name__}: {exc}"})
        self.alert(msg if hint else f"EDGAR {setup} {d}: source unavailable ({type(exc).__name__}: {str(exc)[:160]})")

    def filtered(self, setup: str, d: str, subject: dict, reasons: list[str], details: dict | None = None) -> None:
        """A near-miss: the setup's trigger held but a universe or data check failed (design §8)."""
        self.counts["filtered"] += 1
        self.log("filtered", {"setup": setup, "signal_date": d, **subject, "reasons": reasons,
                              "details": details or {}})

    def new_event(self, setup: str, d: str, subject: dict, *, features: dict, mv: dict, details: dict,
                  exit_due: str | None, bench: str | None = None) -> dict:
        """Record a shadow event (state + ledger "signal"), before its entry is known."""
        cfg = self.cfg[setup]
        bucket, cost = S.cost_for(mv.get("mcap"), self.cfg["costs"])
        s1 = S.first_session_after(d)
        ev = {
            "id": f"{setup}-{d}-{subject.get('cik') or subject.get('ticker')}",
            "setup": setup, "signal_date": d, "detected": self.run.date, "late": self.run.date >= s1,
            "ticker": subject.get("ticker"), "cik": subject.get("cik"), "name": subject.get("name"),
            "adsh": subject.get("adsh"),
            "entry_due": s1, "entry_basis": cfg.get("entry", "close"), "exit_due": exit_due,
            "price": features.get("price"), "dvol20": features.get("dvol20"), "mcap": mv.get("mcap"),
            "mcap_basis": mv.get("basis"), "bucket": bucket, "cost": cost,
            "bench": bench or S.benchmark_for(mv.get("mcap"), float(self.cfg["large_cap_min"])),
            "details": details, "status": "pending_entry", "scores": {},
        }
        p = (cfg.get("base_rate") or {}).get("win_rate")
        # design §8: a base-rate forecast per shadow event, scored at the exit (none where the track gives no rate)
        ev["forecast"] = {"p": float(p), "question": "net return above zero at the exit"} if p is not None else None
        ev["short_interest"] = self.short_interest(ev["ticker"], d, mv.get("shares"))
        if setup == "SH4":
            ev["tbill"] = self.run.get_tbill()
        self.book["events"].append(ev)
        self.counts["signals"] += 1
        self.log("signal", {k: v for k, v in ev.items() if k not in ("scores", "status")})
        return ev

    def candidate(self, setup: str, d: str, entity: dict, *, adsh: str, ticker: str | None, details: dict,
                  rules: dict, exit_due: str | None = None, shares: float | None = None,
                  extra: Callable[[pd.DataFrame, dict], list[str]] | None = None) -> dict | None:
        """Universe and data checks for a triggered filing: an event, or a near-miss record. None for a near-miss."""
        subject = {"ticker": ticker, "cik": entity.get("cik"), "name": entity.get("name"), "adsh": adsh}
        if not ticker:
            self.filtered(setup, d, subject, ["no listed ticker"], details)
            return None
        bars = self.bars(ticker)
        if bars is None:
            self.filtered(setup, d, subject, [f"no price data for {ticker}"], details)
            return None
        features = S.market_features(bars, d)
        reasons = extra(bars, features) if extra else []
        mv = self.market_value(entity.get("cik"), d, features.get("price"), shares)
        reasons += S.universe_check(features, mv["mcap"], rules)
        details = {**details, "mcap_basis": mv["basis"]}
        if reasons:
            self.filtered(setup, d, {**subject, "price": features.get("price"), "mcap": mv["mcap"],
                                     "dvol20": features.get("dvol20")}, reasons, details)
            return None
        return self.new_event(setup, d, subject, features=features, mv=mv, details=details, exit_due=exit_due)

    def finish(self) -> None:
        stats = {k: v - self._stats0.get(k, 0) for k, v in (getattr(self.edgar, "stats", {}) or {}).items()}
        seconds = round(time.monotonic() - self.t0, 1)
        self.book["last_run"] = {"date": self.run.date, "screened": self.screened, **self.counts,
                                 "sec_requests": stats.get("requests"), "documents": stats.get("documents"),
                                 "seconds": seconds, "carried_over": self.exhausted}
        parts = [f"{k} {v}" for k, v in self.counts.items() if v]
        self.run.note(f"EDGAR shadow: screened {sum(len(v) for v in self.screened.values())} setup-days"
                      + (f"; {', '.join(parts)}" if parts else "")
                      + (f"; {stats.get('requests')} SEC requests" if stats.get("requests") else "")
                      + f"; {seconds}s" + ("; work cap reached, the rest carries over" if self.exhausted else ""))


def _docs(filing: dict, prefer: tuple[str, ...] = (), suffix: str | None = None, limit: int = 3) -> list[dict]:
    """A filing's documents in the order to try: `suffix` matches only, else `prefer` file types first."""
    docs = list(filing.get("docs") or [])
    if suffix:
        docs = [d for d in docs if d["filename"].lower().endswith(suffix)]

    def rank(d: dict) -> int:
        ft = str(d.get("file_type") or "").upper()
        return next((i for i, p in enumerate(prefer) if ft.startswith(p)), len(prefer))

    return sorted(docs, key=rank)[:limit]


def _lock_until(ctx: _Ctx, key: str) -> str | None:
    return ctx.book["lockout"].get(key)


def _lock(ctx: _Ctx, key: str, d: str, days: int) -> None:
    ctx.book["lockout"][key] = (pd.Timestamp(d) + pd.Timedelta(days=int(days))).strftime("%Y-%m-%d")


# --------------------------------------------------------------------------------------------------------
# SH1: insider clusters
# --------------------------------------------------------------------------------------------------------

def _screen_sh1(ctx: _Ctx, d: str) -> bool:
    cfg = ctx.cfg["SH1"]
    hits = ctx.edgar.search("4", d, d, q=str(cfg["prefilter_query"]))
    if not hits:
        total = ctx.edgar.search_total("4", d, d)
        if total >= int(cfg["prefilter_check_min_filings"]):
            ctx.alert(f"EDGAR SH1: the purchase pre-filter found no Form 4 among {total} filed {d}; check EFTS")
    filings = [f for f in group_filings(hits, forms=("4",)) if not ctx.seen("SH1", f["adsh"])]
    wanted = []
    for f in filings:
        docs = _docs(f, suffix=".xml", limit=1)
        if docs:
            wanted.append((f, docs[0]))
        else:
            ctx.mark_seen("SH1", f["adsh"], d)
    fetched = ctx.edgar.documents([(f["ciks"][::-1], f["adsh"], doc["filename"]) for f, doc in wanted])
    complete = True
    for f, doc in wanted:
        text = fetched.get((f["adsh"], doc["filename"]))
        if isinstance(text, BudgetExhausted):
            complete = False
            continue
        if isinstance(text, EdgarAccessDenied):
            raise text
        if isinstance(text, Exception):
            if "not found" in str(text):
                ctx.mark_seen("SH1", f["adsh"], d)
                continue
            raise text
        try:
            purchase = S.form4_purchase(parse_form4(text), d, f["adsh"], int(cfg["max_filing_lag_days"]))
        except DataError:
            purchase = None
        ctx.mark_seen("SH1", f["adsh"], d)
        if purchase and purchase.get("issuer_cik"):
            ctx.book["insiders"].setdefault(str(purchase["issuer_cik"]), []).append(
                {k: purchase[k] for k in ("owner_cik", "owner", "date", "adsh", "shares", "value", "first_trade",
                                          "last_trade", "top", "symbol", "issuer")})
    _sh1_clusters(ctx)
    return complete


def _sh1_clusters(ctx: _Ctx) -> None:
    """Resolve every issuer whose purchases now hold a cluster (an event, or a near-miss); set the 90-day lockout."""
    cfg = ctx.cfg["SH1"]
    started = ctx.book["started"].get("SH1")
    warm = (pd.Timestamp(started) + pd.Timedelta(days=int(cfg["warmup_days"]) - 1)).strftime("%Y-%m-%d") \
        if started else None
    for cik, purchases in sorted(ctx.book["insiders"].items()):
        not_before = max(x for x in (warm, _lock_until(ctx, f"SH1:{cik}"), "") if x is not None)
        cl = S.insider_cluster(purchases, int(cfg["window_days"]), int(cfg["min_insiders"]),
                               not_before=not_before or None)
        if cl is None:
            continue
        latest = max((p for p in purchases if p["date"] <= cl["date"]), key=lambda p: p["date"])
        entity = {"cik": int(cik), "name": latest.get("issuer"), "tickers": [latest.get("symbol")]}
        ticker = ctx.ticker_for(entity)
        details = {"insiders": cl["insiders"], "value": round(cl["value"], 2), "vwap": cl["vwap"],
                   "n_top": cl["n_top"], "first_trade": cl["first_trade"], "last_trade": cl["last_trade"],
                   "filings": cl["adsh"]}

        def ticker_ok(bars: pd.DataFrame, features: dict, cl: dict = cl) -> list[str]:
            chk = S.ticker_check(bars, cl["last_trade"], cl["vwap"], float(cfg["ticker_tolerance"]))
            if chk["ok"]:
                return []
            return [f"ticker check failed: close {chk['close']} vs insiders' price {cl['vwap']:.2f}"]

        exit_due = S.nth_session_after(S.first_session_after(cl["date"]), int(cfg["hold_sessions"]))
        ctx.candidate("SH1", cl["date"], entity, adsh=cl["completing"][0], ticker=ticker, details=details,
                      rules=cfg["universe"], exit_due=exit_due, extra=ticker_ok)
        _lock(ctx, f"SH1:{cik}", cl["date"], int(cfg["lockout_days"]))


# --------------------------------------------------------------------------------------------------------
# SH2: special dividends
# --------------------------------------------------------------------------------------------------------

def _screen_sh2(ctx: _Ctx, d: str) -> bool:
    cfg = ctx.cfg["SH2"]
    hits = ctx.edgar.search("8-K", d, d, q=str(cfg["query"]))
    for f in group_filings(hits, forms=("8-K",)):
        if ctx.seen("SH2", f["adsh"]):
            continue
        parsed = None
        for doc in _docs(f, prefer=("EX-99", "8-K"), limit=2):
            text = ctx.fetch(f, doc)
            parsed = parse_special_dividend(html_to_text(text)) if text else None
            if parsed:
                break
        if parsed is None:
            ctx.mark_seen("SH2", f["adsh"], d)
            continue
        entity = f["entities"][0] if f["entities"] else {"cik": f["ciks"][0] if f["ciks"] else None}
        ticker = ctx.ticker_for(entity)
        details = {k: parsed[k] for k in ("amount", "record_date", "payable_date", "contingent")}
        bars = ctx.bars(ticker)
        chk = None
        if bars is not None:
            chk = S.special_dividend_check(parsed, bars, d, S.market_features(bars, d).get("price"), cfg)
            details.update({k: chk[k] for k in ("yield", "regular_median", "prior_dividends", "ex_date", "ex_basis")})
        # scored once the ex-date is in the data: the exit is the close of the session before it
        ctx.candidate("SH2", d, entity, adsh=f["adsh"], ticker=ticker, details=details, rules=cfg["universe"],
                      exit_due=chk["ex_date"] if chk else None,
                      extra=(lambda b, feat: chk["reasons"]) if chk else None)
        ctx.mark_seen("SH2", f["adsh"], d)       # after the checks: a budget stop leaves it for the next run
    return True


# --------------------------------------------------------------------------------------------------------
# SH3: activist Schedule 13D
# --------------------------------------------------------------------------------------------------------

def _screen_sh3(ctx: _Ctx, d: str) -> bool:
    cfg = ctx.cfg["SH3"]
    hits = ctx.edgar.search(str(cfg["forms"]), d, d)
    for f in group_filings(hits, forms=("SCHEDULE 13D", "SC 13D")):
        if ctx.seen("SH3", f["adsh"]):
            continue
        subject, filers = (f["entities"][0], f["entities"][1:]) if f["entities"] else ({}, [])
        activist = S.activist_match([e["name"] for e in filers]) if filers else None
        key = f"SH3:{subject.get('cik')}"
        if not activist or not subject.get("cik") or (_lock_until(ctx, key) or "") > d:
            ctx.mark_seen("SH3", f["adsh"], d)   # not a listed activist, or one event per company per 90 days
            continue
        details = {"activist": activist.strip(), "filers": [e["name"] for e in filers][:4]}
        ctx.candidate("SH3", d, subject, adsh=f["adsh"], ticker=ctx.ticker_for(subject), details=details,
                      rules=cfg["universe"],
                      exit_due=S.nth_session_after(S.first_session_after(d), int(cfg["hold_sessions"])))
        _lock(ctx, key, d, int(cfg["lockout_days"]))   # track 16 §6.5: before the universe filters, as tested
        ctx.mark_seen("SH3", f["adsh"], d)
    return True


# --------------------------------------------------------------------------------------------------------
# SH4: near-completion cash mergers
# --------------------------------------------------------------------------------------------------------

def _screen_sh4(ctx: _Ctx, d: str) -> bool:
    cfg = ctx.cfg["SH4"]
    deals = ctx.book["deals"]
    for f in group_filings(ctx.edgar.search("DEFM14A", d, d), forms=("DEFM14A",)):
        if not ctx.seen("SH4", f["adsh"]):
            _watch(ctx, f, d)
            ctx.mark_seen("SH4", f["adsh"], d)
    hits = ctx.edgar.search("8-K,DEFA14A", d, d, q=str(cfg["query"]))
    watched = sorted(int(c) for c, deal in deals.items() if not deal.get("completed") and not deal.get("terminated"))
    for i in range(0, len(watched), 50):
        hits += ctx.edgar.search("8-K,DEFA14A", d, d, ciks=watched[i:i + 50])
    for f in group_filings(hits, forms=("8-K", "DEFA14A")):
        if ctx.seen("SH4", f["adsh"]) or not f["entities"] or not f["entities"][0].get("cik"):
            continue
        cik = str(f["entities"][0]["cik"])
        if cik not in deals and "5.07" not in f["items"]:
            ctx.mark_seen("SH4", f["adsh"], d)
            continue
        update: dict[str, Any] = {"vote": None, "regulatory": None, "expected_close": None, "close_basis": None,
                                  "completed": False, "terminated": False}
        for doc in _docs(f, prefer=("8-K", "DEFA14A", "EX-99"), limit=3):
            text = ctx.fetch(f, doc)
            if not text:
                continue
            u = parse_merger_update(html_to_text(text), f["items"])
            for k, v in u.items():
                if v and not update.get(k):
                    update[k] = v
        update["event_date"] = f.get("period") or d
        if cik not in deals:
            if update["vote"] != "approved" or not _watch_lookup(ctx, int(cik), d):
                ctx.mark_seen("SH4", f["adsh"], d)
                continue
        deals[cik] = S.merger_apply(deals[cik], update, d)
        if any(update.get(k) for k in ("vote", "regulatory", "expected_close", "completed", "terminated")):
            deals[cik]["last_adsh"] = f["adsh"]                 # the filing the rule is checked as of
        ctx.mark_seen("SH4", f["adsh"], d)
    _sh4_triggers(ctx)
    return True


def _watch(ctx: _Ctx, filing: dict, d: str) -> bool:
    """Add a definitive merger proxy's target to the watchlist when it pays cash with no stock component."""
    target = filing["entities"][0] if filing["entities"] else {}
    if not target.get("cik"):
        return False
    terms = None
    for doc in _docs(filing, prefer=("DEFM14A",), limit=1):
        text = ctx.fetch(filing, doc)
        terms = parse_merger_terms(html_to_text(text)) if text else None
    if not terms or not terms.get("cash") or terms.get("stock"):
        return False
    ctx.book["deals"][str(target["cik"])] = {
        "cik": int(target["cik"]), "name": target.get("name"), "ticker": ctx.ticker_for(target),
        "cash": terms["cash"], "stock": terms["stock"], "cvr": terms["cvr"],
        "financing_condition": terms["financing_condition"], "proxy_date": filing.get("file_date") or d,
        "proxy_adsh": filing["adsh"], "last_update": d}
    ctx.log("watch", {"setup": "SH4", "signal_date": d, **ctx.book["deals"][str(target["cik"])]})
    return True


def _watch_lookup(ctx: _Ctx, cik: int, d: str) -> bool:
    """A vote 8-K from a company not on the watchlist: find its definitive proxy of the last year and watch it."""
    start = (pd.Timestamp(d) - pd.Timedelta(days=int(ctx.cfg["SH4"]["lookup_days"]))).strftime("%Y-%m-%d")
    proxies = group_filings(ctx.edgar.search("DEFM14A", start, d, ciks=[cik]), forms=("DEFM14A",))
    proxies.sort(key=lambda f: str(f.get("file_date") or ""), reverse=True)
    return bool(proxies) and _watch(ctx, proxies[0], d)


def _sh4_triggers(ctx: _Ctx) -> None:
    """Check every watched deal as of its latest filing (the "last approval 8-K" is the one that completes the rule).

    A deal that triggers is resolved once (an event or a near-miss). A deal near completion (vote passed, approvals
    received) that fails the rule is logged as a near-miss once per filing date.
    """
    cfg = ctx.cfg["SH4"]
    for cik, deal in sorted(ctx.book["deals"].items()):
        d = deal.get("last_update")
        if not d or deal.get("triggered") or deal.get("completed") or deal.get("terminated"):
            continue
        chk = S.merger_trigger(deal, d, cfg)
        details = {k: deal.get(k) for k in ("cash", "cvr", "financing_condition", "vote_date", "regulatory_date",
                                            "expected_close", "close_basis", "proxy_date", "proxy_adsh")}
        details["days_to_close"] = chk["days_to_close"]
        subject = {"ticker": deal.get("ticker"), "cik": int(cik), "name": deal.get("name")}
        if not chk["ok"]:
            if deal.get("vote_date") and deal.get("regulatory_date") and deal.get("near_miss") != d:
                ctx.filtered("SH4", d, subject, chk["reasons"], details)
                deal["near_miss"] = d
            continue
        entity = {"cik": int(cik), "name": deal.get("name"),
                  "tickers": [deal["ticker"]] if deal.get("ticker") else []}
        ctx.candidate("SH4", d, entity, adsh=deal.get("last_adsh") or deal.get("proxy_adsh"),
                      ticker=deal.get("ticker"), details=details, rules=cfg["universe"],
                      exit_due=deal.get("expected_close"))
        deal["triggered"] = d


# --------------------------------------------------------------------------------------------------------
# CEF tender capture
# --------------------------------------------------------------------------------------------------------

_CEF_DOCS = ("EX-99.(A)(1)(IV)", "EX-99.(A)(1)(III)", "EX-99.(A)(5)", "EX-99.1", "SC TO-C", "EX-99.(A)(1)(I)",
             "SC TO-I")


def _screen_cef(ctx: _Ctx, d: str) -> bool:
    cfg = ctx.cfg["CEF"]
    hits = ctx.edgar.search("SC TO-I,SC TO-C", d, d, q=str(cfg["query"]))
    for f in group_filings(hits, forms=("SC TO-I", "SC TO-C")):
        if ctx.seen("CEF", f["adsh"]):
            continue
        fund = f["entities"][0] if f["entities"] else {}
        if not fund.get("tickers") or not fund.get("cik") or (_lock_until(ctx, f"CEF:{fund['cik']}") or "") > d:
            ctx.mark_seen("CEF", f["adsh"], d)
            continue
        terms: dict[str, Any] = {}
        for doc in _docs(f, prefer=_CEF_DOCS, limit=3):
            text = ctx.fetch(f, doc)
            if not text:
                continue
            for k, v in parse_cef_tender(html_to_text(text)).items():
                if v and not terms.get(k):
                    terms[k] = v
            if terms.get("pct_nav") and terms.get("expiry"):
                break
        info = (ctx.edgar.company(fund["cik"]) or {}) if terms.get("pct_nav") else {}
        if info.get("exchanges"):                              # else not NAV-priced, or not listed (interval fund)
            _cef_candidate(ctx, f, fund, terms, d)
        ctx.mark_seen("CEF", f["adsh"], d)
    return True


def _cef_candidate(ctx: _Ctx, filing: dict, fund: dict, terms: dict, d: str) -> None:
    cfg = ctx.cfg["CEF"]
    ticker = ctx.ticker_for(fund)
    nav_symbol = str(cfg["nav_symbol"]).format(ticker=ticker)
    s1 = S.first_session_after(d)
    details = {k: terms.get(k) for k in ("pct_nav", "size_pct", "size_shares", "shares_outstanding", "expiry",
                                         "commence", "pricing_next_day", "conditional")}
    details["nav_symbol"] = nav_symbol
    missing_nav: list[str] = []

    def tender_ok(bars: pd.DataFrame, features: dict) -> list[str]:
        nav_bars = ctx.bars(nav_symbol)
        nav_feat = S.market_features(nav_bars, d) if nav_bars is not None else {"price": None, "stale": True}
        nav = nav_feat.get("price") if not nav_feat.get("stale") else None
        if nav is None:
            missing_nav.append(nav_symbol)
        chk = S.cef_tender_check(terms, features.get("price"), nav, s1, cfg)
        details.update(nav=nav, discount=chk["discount"], days_to_expiry=chk["days_to_expiry"])
        return chk["reasons"]

    exit_due = None
    if terms.get("expiry"):
        exit_due = min(S.nth_session_after(terms["expiry"], int(cfg["remainder_sell_sessions"])), _time_stop(s1, cfg))
    ev = ctx.candidate("CEF", d, fund, adsh=filing["adsh"], ticker=ticker, details=details, rules=cfg["universe"],
                       exit_due=exit_due, shares=terms.get("shares_outstanding"), extra=tender_ok)
    if missing_nav:
        ctx.alert(f"EDGAR CEF {d}: no NAV series {missing_nav[0]} for {ticker}'s tender offer; not screened")
    if ev is not None:
        _lock(ctx, f"CEF:{fund['cik']}", d, int(cfg["lockout_days"]))


def _time_stop(entry_day: str, cfg: dict) -> str:
    """The last session within `max_hold_days` calendar days of the entry (design §4 "Time stops")."""
    return iso(prev_trading_day(pd.Timestamp(entry_day) + pd.Timedelta(days=int(cfg["max_hold_days"]) + 1)))


SCREENS.update({"SH1": _screen_sh1, "SH2": _screen_sh2, "SH3": _screen_sh3, "SH4": _screen_sh4, "CEF": _screen_cef})


# --------------------------------------------------------------------------------------------------------
# Entries, exits and scores
# --------------------------------------------------------------------------------------------------------

def _score_events(ctx: _Ctx) -> None:
    run_date = ctx.run.date
    for ev in ctx.book["events"]:
        if ev.get("status") not in ("pending_entry", "open"):
            continue
        if ev["status"] == "pending_entry" and run_date >= ev["entry_due"]:
            _enter(ctx, ev)
        if ev["status"] == "open" and _exit_ready(ctx, ev):
            _exit(ctx, ev)


def _enter(ctx: _Ctx, ev: dict) -> None:
    bars = ctx.bars(ev["ticker"])
    day = S.entry_day(bars, ev["signal_date"]) if bars is not None else None
    if day is None:
        _void_if_late(ctx, ev, ev["entry_due"], "no price data after the filing")
        return
    ev.update(status="open", entry_date=iso(day), entry_open=float(bars.at[day, "open"]),
              entry_close=float(bars.at[day, "close"]))
    if ev["setup"] in ("SH1", "SH3"):
        bench = ctx.bars(ev["bench"])
        if bench is not None:
            ev["filing_reaction"] = S.filing_reaction(bars, bench, ev["signal_date"])
    if ev["setup"] == "SH4":
        ev["time_stop"] = _time_stop(ev["entry_date"], ctx.cfg["SH4"])
    if ev["setup"] == "CEF":
        ev["time_stop"] = _time_stop(ev["entry_date"], ctx.cfg["CEF"])
    ctx.counts["entries"] += 1
    ctx.log("entry", {k: ev.get(k) for k in ("id", "setup", "ticker", "signal_date", "entry_date", "entry_open",
                                             "entry_close", "filing_reaction")})


def _exit_ready(ctx: _Ctx, ev: dict) -> bool:
    run_date = ctx.run.date
    if ev["setup"] == "SH4":
        deal = ctx.book["deals"].get(str(ev.get("cik"))) or {}
        return bool(deal.get("completed") or deal.get("terminated")) or run_date >= ev.get("time_stop", "9999")
    return bool(ev.get("exit_due")) and run_date >= ev["exit_due"]


def _exit(ctx: _Ctx, ev: dict) -> None:
    setup = ev["setup"]
    if setup == "SH4":
        _exit_merger(ctx, ev)
        return
    bars = ctx.bars(ev["ticker"])
    if bars is None:
        _void_if_late(ctx, ev, ev["exit_due"], "no price data at the exit")
        return
    start = pd.Timestamp(ev["entry_date"])
    if setup in ("SH1", "SH3"):
        end = S.follow_exit(bars, start, int(ctx.cfg[setup]["hold_sessions"]))
        if end is None:
            if bars.index[-1] < pd.Timestamp(ctx.run.date) - pd.Timedelta(days=int(ctx.cfg["void_after_days"])):
                end = bars.index[-1]                  # trading stopped (e.g. taken over): the last price stands
                ev["exit_note"] = "exit at the last available close"
            else:
                return
        _score_follow(ctx, ev, bars, start, end, label=str(ctx.cfg[setup]["hold_sessions"]))
    elif setup == "SH2":
        _exit_dividend(ctx, ev, bars, start)
    elif setup == "CEF":
        _exit_tender(ctx, ev, bars, start)


def _score_follow(ctx: _Ctx, ev: dict, bars: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp,
                  label: str) -> None:
    bench = ctx.bars(ev["bench"])
    rets = S.window_returns(bars, bench, start, end, float(ev["cost"])) if bench is not None else None
    if rets is None:
        _void_if_late(ctx, ev, ev["exit_due"], "missing price at the entry or exit")
        return
    basis = ev.get("entry_basis", "close")
    _close(ctx, ev, label, {"exit_date": iso(end), "return": rets[basis]["net"], "basis": basis,
                            "open": rets["open"], "close": rets["close"]})


def _exit_dividend(ctx: _Ctx, ev: dict, bars: pd.DataFrame, start: pd.Timestamp) -> None:
    det = ev["details"]
    expected = det.get("ex_date")
    observed = S.observed_ex_date(bars, expected, float(det["amount"])) if expected else None
    if observed is None and len(bars.index[bars.index >= pd.Timestamp(expected)]) < 5 and \
            ctx.run.date < (pd.Timestamp(expected) + pd.Timedelta(days=int(ctx.cfg["void_after_days"]))).strftime(
                "%Y-%m-%d"):
        return                                      # wait a few sessions for the dividend to show in the data
    ex_day = pd.Timestamp(observed or expected)
    before = bars.index[bars.index < ex_day]
    if not len(before) or before[-1] <= start:
        _void_if_late(ctx, ev, ev["exit_due"], "no session between the entry and the ex-date", force=True)
        return
    ev["details"]["ex_date_observed"] = observed
    _score_follow(ctx, ev, bars, start, before[-1], label="ex-1")


def _exit_merger(ctx: _Ctx, ev: dict) -> None:
    """SH4's exit: the deal's cash at its closing date; after a break, the close of the next session; at the
    60-day cap, that session's close."""
    deal = ctx.book["deals"].get(str(ev.get("cik"))) or {}
    if deal.get("completed"):
        outcome, exit_date, exit_px = "completed", pd.Timestamp(deal.get("completed_date")), float(deal["cash"])
    else:
        bars = ctx.bars(ev["ticker"])
        if bars is None:
            _void_if_late(ctx, ev, ev.get("time_stop"), "no price data at the exit")
            return
        if deal.get("terminated"):
            after = bars.index[bars.index > pd.Timestamp(deal.get("terminated_date"))]
            if not len(after):
                return
            outcome, exit_date = "terminated", after[0]
        else:
            upto = bars.index[bars.index <= pd.Timestamp(ev["time_stop"])]
            if not len(upto):
                return
            outcome, exit_date = "time_stop", upto[-1]
        exit_px = float(bars.at[exit_date, "close"])
    score = S.score_merger({"open": ev["entry_open"], "close": ev["entry_close"]}, pd.Timestamp(ev["entry_date"]),
                           exit_date, exit_px, float(ev["cost"]))
    basis = ev.get("entry_basis", "close")
    score.update(outcome=outcome, basis=basis)
    score["return"] = score[basis]["net"]
    ev["hold_days"] = score["days"]
    _close(ctx, ev, "deal", score)


def _exit_tender(ctx: _Ctx, ev: dict, bars: pd.DataFrame, start: pd.Timestamp) -> None:
    cfg, det = ctx.cfg["CEF"], ev["details"]
    expiry = pd.Timestamp(det["expiry"])
    stop = pd.Timestamp(ev.get("time_stop") or _time_stop(ev["entry_date"], cfg))
    after = bars.index[bars.index > expiry]
    k = int(cfg["remainder_sell_sessions"])
    if len(after) >= k and after[k - 1] <= stop:
        sell_day = after[k - 1]
    else:
        upto = bars.index[bars.index <= stop]
        if pd.Timestamp(ctx.run.date) < stop or not len(upto):
            return
        sell_day = upto[-1]
    result = _tender_result(ctx, ev, det)
    tender_price, basis_note = result.get("price"), "final amendment"
    if tender_price is None and det.get("pct_nav"):
        pricing = after[0] if det.get("pricing_next_day") and len(after) else expiry
        nav_bars = ctx.bars(det.get("nav_symbol"))
        nav = S.value_on(nav_bars["close"], pricing) if nav_bars is not None else None
        tender_price = float(det["pct_nav"]) * nav if nav else None
        basis_note = "pct of NAV at pricing"
    accepted = result.get("accepted")
    accepted_basis = "final amendment"
    if accepted is None:
        accepted, accepted_basis = float(det.get("size_pct") or 0.0), "offer size (every holder tenders)"
    if expiry > stop:
        accepted, accepted_basis = 0.0, "offer expired after the 60-day cap"
    spy = ctx.bars("SPY")
    rets = S.score_cef(bars, spy, start, sell_day, accepted, tender_price, float(ev["cost"])) if spy is not None \
        else None
    if rets is None:
        _void_if_late(ctx, ev, ev["exit_due"], "missing price at the entry or exit")
        return
    basis = ev.get("entry_basis", "open")
    _close(ctx, ev, "tender", {**rets, "return": rets[basis]["net"], "basis": basis, "price_basis": basis_note,
                               "accepted_basis": accepted_basis})


def _tender_result(ctx: _Ctx, ev: dict, det: dict) -> dict:
    """The fund's final amendment after expiry (accepted fraction, price); {} when not found."""
    try:
        hits = ctx.edgar.search("SC TO-I/A", det["expiry"], ctx.run.date, ciks=[ev["cik"]])
    except (BudgetExhausted, EdgarAccessDenied):
        raise
    except DataError:
        return {}
    filings = sorted(group_filings(hits, forms=("SC TO-I/A",)), key=lambda f: str(f.get("file_date")),
                     reverse=True)
    for f in filings[:2]:
        for doc in _docs(f, prefer=("SC TO-I/A", "EX-99"), limit=2):
            text = ctx.fetch(f, doc)
            res = parse_cef_tender_result(html_to_text(text)) if text else {}
            if res.get("accepted") or res.get("price"):
                return res
    return {}


def _close(ctx: _Ctx, ev: dict, label: str, score: dict) -> None:
    ev["scores"][label] = score
    ev.update(status="closed", exit_date=score["exit_date"])
    fc = ev.get("forecast")
    if fc and score.get("return") is not None:
        outcome = int(score["return"] > 0)
        fc.update(outcome=outcome, brier=(float(fc["p"]) - outcome) ** 2)
    ctx.counts["scored"] += 1
    ctx.log("scored", {k: ev.get(k) for k in ("id", "setup", "ticker", "signal_date", "entry_date", "exit_date",
                                             "cost", "filing_reaction", "forecast")} | {"score": score})


def _void_if_late(ctx: _Ctx, ev: dict, due: str | None, reason: str, *, force: bool = False) -> None:
    """Void an event whose prices have not appeared `void_after_days` after they were due (kept, not deleted)."""
    limit = (pd.Timestamp(due or ev["signal_date"]) + pd.Timedelta(days=int(ctx.cfg["void_after_days"])))
    if force or pd.Timestamp(ctx.run.date) > limit:
        ev.update(status="void", void_reason=reason, exit_date=ctx.run.date)
        ctx.counts["void"] += 1
        ctx.log("void", {k: ev.get(k) for k in ("id", "setup", "ticker", "signal_date")} | {"reason": reason})


# --------------------------------------------------------------------------------------------------------
# Pruning
# --------------------------------------------------------------------------------------------------------

def _prune(book: dict, run_date: str, cfg: dict) -> None:
    today = pd.Timestamp(run_date)
    keep_seen = (today - pd.Timedelta(days=int(cfg["seen_keep_days"]))).strftime("%Y-%m-%d")
    book["seen"] = {k: v for k, v in book["seen"].items() if v >= keep_seen}
    horizon = (today - pd.Timedelta(days=int(cfg["SH1"]["window_days"]) + int(cfg["max_catchup_days"]))).strftime(
        "%Y-%m-%d")
    insiders = {}
    for cik, ps in book["insiders"].items():
        kept = [p for p in ps if p["date"] >= horizon]
        if kept:
            insiders[cik] = kept
    book["insiders"] = insiders
    book["lockout"] = {k: v for k, v in book["lockout"].items() if v > run_date}
    open_ciks = {str(e.get("cik")) for e in book["events"] if e.get("setup") == "SH4"
                 and e.get("status") in ("pending_entry", "open")}
    stale = (today - pd.Timedelta(days=int(cfg["SH4"]["watch_days"]))).strftime("%Y-%m-%d")
    book["deals"] = {c: deal for c, deal in book["deals"].items()
                     if c in open_ciks or (not deal.get("triggered") and not deal.get("completed")
                                           and not deal.get("terminated") and deal.get("last_update", "") >= stale)}
