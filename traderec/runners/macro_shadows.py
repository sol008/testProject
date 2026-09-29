"""Macro shadow books: W3 (cool-CPI TLT), W4 (BoJ), the gold spike fade, and every scheduled-release reaction.

Design v3.3 §3 M5 ("Scheduled releases. Never traded; logged for calibration only"), §3 "Shadow ledger" and §5
(no bets on scheduled releases); research/17-short-horizon-macro-events.md; docs/phase-b/macro-shadows.md.
The rules themselves are pure functions in `traderec.modules.macro_shadows`.

`daily(run, checks)` runs in the 22:17 ET job, inside the pipeline's shadow guard. It sends no email, queues
no order and calls no LLM. Each evening it:

1. checks the calendar (config/econ_calendar.yaml): whether it covers tonight, and when it was last verified;
2. logs each release whose reaction session has arrived: the day-0 moves of SPY, TLT, GLD, USO, UUP (else
   the dollar index) and BTC, the 2- and 10-year yield changes and the 2-year bucket. The forward moves over
   1, 5 and 20 sessions are filled in as they mature (track 17 R1);
3. evaluates W3 on CPI days and W4 at BoJ meetings once their inputs are published, and opens the gold fade
   for each listed war onset. A trigger becomes a hypothetical trade at the next open;
4. walks every open hypothetical trade forward. It exits by the track's rules at the next open, then scores
   the trade against the random-day baseline and resolves its base-rate forecast;
5. logs a near-miss when GLD jumps with no war onset listed.

State: ``state["shadow"]["MACRO"] = {"events": [...], "meta": {...}}``. Every event carries "rule" ("RELEASE",
"W3", "W4" or "GOLD_FADE"), "id", "signal_date" and "status". The ledger gets ``shadow`` records with book
"MACRO". Missing, stale or disagreeing inputs never open a trade. The evaluation waits `pending_sessions`
sessions for them, then is recorded as unavailable with a data alert (fail closed).
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

import pandas as pd

from traderec.data.econ_calendar import CalendarError, EconCalendar, load_calendar, macro_data_for, reaction_session
from traderec.forecasts import brier
from traderec.modules import macro_shadows as ms
from traderec.modules.m1_dipbuy import value_on

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run

BOOK = "MACRO"
RULES = ("W3", "W4", "GOLD_FADE")
FRED_YIELDS = {"2Y": "DGS2", "10Y": "DGS10"}
# What track 17 R1 asks the release log to record, and why this build cannot.
UNAVAILABLE = {
    "market_implied_probability": "no prediction-market adapter here (Kalshi and Polymarket belong to the W8/W9 "
                                  "data layer)",
    "options_implied_move": "the 10:17 ET job snapshots no SPY or TLT chains for this runner, and there are no "
                            "historical chains",
    "consensus": "no free machine-readable consensus; the 2-year yield's day-0 move is track 17's surprise proxy",
}


def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook: the macro shadow books (see the module docstring)."""
    cfg = (run.cfg.constitution.get("shadow") or {}).get(BOOK) or {}
    if not cfg.get("enabled", False):
        return
    book = run.state["shadow"].setdefault(BOOK, {"events": []})
    book.setdefault("events", [])
    meta = book.setdefault("meta", {})
    try:
        cal = load_calendar(cfg.get("calendar"))
    except CalendarError as exc:
        _Day.alert_meta(run, meta, "calendar_invalid", f"release calendar unusable ({exc}); nothing logged",
                        monthly=True)
        return
    day = _Day(run, cfg, book, cal)
    _check_calendar(day)
    _log_releases(day)
    _update_releases(day)
    if _enabled(cfg, "W3"):
        _w3(day)
    if _enabled(cfg, "W4"):
        _w4(day)
    if _enabled(cfg, "GOLD_FADE"):
        _gold(day)
    _advance_trades(day)
    meta["promotion"] = promotion(book["events"], cfg)
    _prune(day)
    meta.update(last_date=run.date, calendar_sha256=cal.sha256, calendar_verified=cal.verified,
                unavailable=dict(UNAVAILABLE))


def _enabled(cfg: dict, rule: str) -> bool:
    return bool((cfg.get(rule) or {}).get("enabled", False))


def _prune(day: "_Day") -> None:
    """Keep the state small: a release record leaves it `state_keep_days` after it completed (its ledger
    "complete" record keeps everything), and so do old alert keys. Hypothetical trades always stay."""
    cutoff = (day.asof - pd.Timedelta(days=day.keep_days)).strftime("%Y-%m-%d")
    day.events[:] = [e for e in day.events if not (
        e.get("rule") == "RELEASE" and e.get("status") in ("complete", "void")
        and str(e.get("completed") or e.get("voided") or "9999") < cutoff)]
    seen = day.meta.get("alerted") or {}
    for key in [k for k, v in seen.items() if str(v) < cutoff]:
        del seen[key]


def promotion(events: list[dict], cfg: dict) -> dict:
    """Each rule's promotion-test inputs (`ms.promotion_summary`), with BH-FDR applied across the rules that set
    an `fdr_q` (R1: "together with every rule tested alongside it")."""
    out = {rule: ms.promotion_summary([e for e in events if e.get("rule") == rule],
                                      (cfg.get(rule) or {}).get("promotion") or {}) for rule in RULES}
    family = {r: out[r]["p"] for r in RULES if ((cfg.get(r) or {}).get("promotion") or {}).get("fdr_q")}
    if family:
        q = min(float(cfg[r]["promotion"]["fdr_q"]) for r in family)
        passed = ms.bh_fdr(family, q)
        for r in family:
            out[r]["passes_fdr"] = passed[r]
    for r in RULES:
        out[r]["ready"] = bool(out[r]["meets_n"] and out[r]["meets_t"] and out[r].get("passes_fdr", True))
    return out


# --------------------------------------------------------------------------------------------------------
# One evening's data, fetched lazily and cut at the run date (no look-ahead)
# --------------------------------------------------------------------------------------------------------

class _Day:
    def __init__(self, run: "Run", cfg: dict, book: dict, cal: EconCalendar) -> None:
        self.run, self.cfg, self.book, self.cal = run, cfg, book, cal
        self.meta: dict = book["meta"]
        self.events: list[dict] = book["events"]
        self.asof = pd.Timestamp(run.date)
        self.sessions = run.bars("SPY").index           # the pipeline has already checked tonight's SPY bar
        self.pending = int(cfg.get("pending_sessions", 3))
        self.keep_days = int(cfg.get("state_keep_days", 400))
        # Nothing before launch is logged, nor anything older than the state keeps (so a pruned record never
        # comes back).
        self.floor = max(str(run.state.get("created") or run.date)[:10],
                         (self.asof - pd.Timedelta(days=self.keep_days)).strftime("%Y-%m-%d"))
        self.md = macro_data_for(run.provider)
        self._cache: dict[tuple, Any] = {}

    # --- bookkeeping ---------------------------------------------------------------------------------------

    @staticmethod
    def alert_meta(run: "Run", meta: dict, key: str, msg: str, *, monthly: bool = False,
                   alert: bool = True) -> None:
        """A data alert (or a note when alert=False) with a ledger record, at most once per key (once a month when
        `monthly`). The key keeps the date it last fired, so old keys can be pruned."""
        seen = meta.setdefault("alerted", {})
        last = str(seen.get(key) or "")
        if (monthly and last[:7] == run.date[:7]) or (not monthly and last):
            return
        seen[key] = run.date
        if alert:
            run.alert("data", f"MACRO: {msg}")
            run.log("shadow", {"book": BOOK, "event": "data_problem", "key": key, "message": msg})
        else:
            run.note(f"MACRO: {msg}")

    def alert(self, key: str, msg: str, *, monthly: bool = False) -> None:
        self.alert_meta(self.run, self.meta, key, msg, monthly=monthly)

    def note(self, key: str, msg: str, *, monthly: bool = False) -> None:
        self.alert_meta(self.run, self.meta, key, msg, monthly=monthly, alert=False)

    def log(self, rule: str, event: str, payload: dict) -> None:
        self.run.log("shadow", {"book": BOOK, "rule": rule, "event": event, **payload})

    def age(self, session: str) -> int:
        """Sessions since `session`, up to tonight."""
        return ms.sessions_between(self.sessions, session, self.run.date)

    def stale(self, session: str) -> bool:
        """True once a value for `session` is overdue: `pending_sessions` sessions have passed since."""
        return self.age(session) >= self.pending

    # --- data ----------------------------------------------------------------------------------------------

    def _memo(self, key: tuple, fetch: Callable[[], Any]) -> Any:
        if key not in self._cache:
            try:
                self._cache[key] = fetch()
            except Exception as exc:  # noqa: BLE001 - any source failure means "unavailable" (fail closed)
                self._cache[key] = None
                self._cache[("error",) + key] = f"{type(exc).__name__}: {exc}"
        return self._cache[key]

    def bars(self, ticker: str) -> pd.DataFrame | None:
        df = self._memo(("bars", ticker), lambda: self.run.bars(ticker))
        return df if df is not None and len(df) else None

    def price(self, asset: str) -> tuple[pd.Series | None, str | None]:
        """A total-return close series for a release-log asset: the first of its tickers with data."""
        for ticker in self.cfg["releases"]["assets"][asset]:
            series = self._memo(("px", ticker), lambda t=ticker: self._closes(t))
            if series is not None and len(series):
                return series, ticker
        return None, None

    def _closes(self, ticker: str) -> pd.Series | None:
        if ticker == "BTC-USD":                         # Bitcoin per UTC day, the M3 source
            try:
                return self.run.provider.btc_daily_utc().loc[:self.asof].astype(float)
            except Exception:  # noqa: BLE001 - fall back to the daily bars
                pass
        df = self.bars(ticker)
        return ms.total_return_closes(df) if df is not None else None

    def fred(self, series_id: str) -> pd.Series | None:
        if self.md is None:
            return None
        s = self._memo(("fred", series_id), lambda: self.md.fred_series(series_id))
        return None if s is None else s.loc[:self.asof]

    def boj_rate(self) -> pd.Series | None:
        if self.md is None:
            return None
        s = self._memo(("boj",), self.md.boj_basic_loan_rate)
        return None if s is None else s.loc[:self.asof]

    def treasury(self, tenor: str) -> pd.Series | None:
        if self.md is None:
            return None
        years = sorted({self.asof.year, (self.asof - pd.Timedelta(days=150)).year})
        s = self._memo(("treasury", tenor), lambda: self.md.treasury_yields(tenor, years))
        return None if s is None else s.loc[:self.asof]

    def yields(self, tenor: str) -> tuple[pd.Series | None, str | None]:
        """Treasury's par yield curve (same evening), else FRED's copy (about a day later)."""
        s = self.treasury(tenor)
        if s is not None and len(s):
            return s, "treasury"
        s = self.fred(FRED_YIELDS[tenor])
        return (s, "fred") if s is not None and len(s) else (None, None)

    def yield_conflicts(self, tenor: str, days: list[str | None]) -> list[str]:
        """Dates among `days` on which Treasury and FRED both print and differ by more than the tolerance."""
        a, b = self.treasury(tenor), self.fred(FRED_YIELDS[tenor])
        if a is None or b is None:
            return []
        tol = float((self.cfg.get("W3") or {}).get("yield_tolerance_bp", 2.0)) / 100.0
        bad = []
        for d in days:
            if d is None:
                continue
            ts = pd.Timestamp(d)
            va, vb = value_on(a, ts), value_on(b, ts)
            if va is not None and vb is not None and abs(va - vb) > tol + 1e-12:
                bad.append(d)
        return bad

    def data_error(self, *keys: tuple) -> str:
        errs = [self._cache.get(("error",) + k) for k in keys]
        errs = [e for e in errs if e]
        return "; ".join(errs) if errs else ("no macro-data adapter on the provider" if self.md is None else "no data")

    # --- events --------------------------------------------------------------------------------------------

    def releases(self, kind: str | None = None) -> list[dict]:
        return [e for e in self.events if e.get("rule") == "RELEASE" and (kind is None or e.get("kind") == kind)]

    def by_id(self) -> dict[str, dict]:
        return {e["id"]: e for e in self.events if "id" in e}


# --------------------------------------------------------------------------------------------------------
# 1. The calendar
# --------------------------------------------------------------------------------------------------------

def _check_calendar(day: _Day) -> None:
    kinds = list(day.cfg["releases"]["kinds"])
    gaps = day.cal.coverage_gaps(day.run.date, kinds)
    if gaps["after"]:
        day.alert("calendar_coverage", f"config/econ_calendar.yaml has no {', '.join(gaps['after'])} dates for "
                  f"{day.run.date}: add the official schedules (each kind's source) and move 'covered'",
                  monthly=True)
    if gaps["before"]:
        day.note("calendar_before", f"the release calendar starts after {day.run.date} for "
                 f"{', '.join(gaps['before'])}; nothing to log", monthly=True)
    limit = int(day.cfg.get("reverify_days", 60))
    verified = day.cal.verified
    if verified is None or (day.asof - pd.Timestamp(verified)).days > limit:
        day.alert("calendar_reverify", f"the release calendar was last verified {verified or 'never'}; re-check "
                  f"the dates against the official schedules and update 'verified'", monthly=True)


# --------------------------------------------------------------------------------------------------------
# 2. Release reactions (R1): logged for calibration, never traded
# --------------------------------------------------------------------------------------------------------

def _log_releases(day: _Day) -> None:
    kinds = list(day.cfg["releases"]["kinds"])
    known = day.by_id()
    sessions: dict[str, str] = {}
    for rel in day.cal.active(kinds):
        if rel.date <= day.run.date:
            s0 = reaction_session(day.sessions, rel.date)
            if s0 is not None:
                sessions[rel.id] = s0
    for rel in day.cal.active(kinds):
        s0 = sessions.get(rel.id)
        if s0 is None or rel.id in known or s0 < day.floor:
            continue
        rec = {"rule": "RELEASE", "id": rel.id, "kind": rel.kind, "release_date": rel.date, "time": rel.time,
               "reference": rel.reference, "signal_date": s0,
               "prev_session": ms.prior_session(day.sessions, s0), "status": "open", "logged": day.run.date,
               "day0": {}, "fwd": {}, "src": {}}
        if rel.status == "tentative":
            rec["tentative"] = True
        same = sorted(i for i, s in sessions.items() if s == s0 and i != rel.id)
        if same:
            rec["same_session"] = same
        day.events.append(rec)
        known[rel.id] = rec
        day.log("RELEASE", "release", {k: rec[k] for k in ("id", "kind", "release_date", "time", "reference",
                                                           "signal_date", "prev_session")}
                | {"same_session": same, "calendar_sha256": day.cal.sha256})
    for rel in day.cal.postponed():
        rec = known.get(rel.id)
        if rec is not None and rec.get("status") != "void":
            rec.update(status="void", void_reason="postponed in the calendar", voided=day.run.date)
            day.log("RELEASE", "void", {"id": rel.id, "reason": "postponed in the calendar"})


def _update_releases(day: _Day) -> None:
    rcfg = day.cfg["releases"]
    assets, tenors = list(rcfg["assets"]), list(rcfg.get("yields", []))
    horizons = [int(h) for h in rcfg.get("forward_sessions", [1, 5, 20])]
    for rec in day.releases():
        if rec.get("status") != "open":
            continue
        s0, prev = rec["signal_date"], rec["prev_session"]
        _fill_moves(day, rec["day0"], rec["src"], assets, tenors, prev, s0)
        if "bucket" not in rec and "UST2Y" in rec["day0"]:
            rec["bucket"] = ms.bucket(rec["kind"], rec["day0"]["UST2Y"], rcfg.get("buckets_bp") or {})
        for h in horizons:
            end = ms.session_after(day.sessions, s0, h)
            if end is not None:
                _fill_moves(day, rec["fwd"].setdefault(str(h), {}), rec["src"], assets, tenors, s0, end)
        wanted = assets + [f"UST{t}" for t in tenors]
        gone = [k for k in wanted if k not in rec["day0"]]
        if gone and day.stale(s0):
            day.alert(f"release_day0:{rec['id']}", f"{rec['id']}: day-0 {', '.join(gone)} unavailable after "
                      f"{day.pending} sessions ({day.data_error(*_keys(tenors))}); recorded as missing")
        last = ms.session_after(day.sessions, s0, max(horizons))
        if last is not None and day.age(last) >= day.pending:
            missing = {"day0": gone} if gone else {}
            for h in horizons:
                lost = [k for k in wanted if k not in rec["fwd"].get(str(h), {})]
                if lost:
                    missing[str(h)] = lost
            rec.update(status="complete", completed=day.run.date)
            if missing:
                rec["missing"] = missing
            day.log("RELEASE", "complete", {k: rec.get(k) for k in (
                "id", "kind", "signal_date", "bucket", "day0", "fwd", "src", "missing", "w3", "w4")})


def _keys(tenors: list[str]) -> list[tuple]:
    return [("treasury", t) for t in tenors] + [("fred", FRED_YIELDS[t]) for t in tenors if t in FRED_YIELDS]


def _fill_moves(day: _Day, into: dict, src: dict, assets: list[str], tenors: list[str], start: str | None,
                end: str) -> None:
    """Fill the moves from `start`'s close to `end`'s close that are still missing in `into`."""
    for asset in assets:
        if asset in into:
            continue
        series, ticker = day.price(asset)
        v = ms.window_move(series, start, end)
        if v is not None:
            into[asset] = round(v, 6)
            if ticker != day.cfg["releases"]["assets"][asset][0]:
                src[asset] = ticker                      # a fallback served it (e.g. the dollar index)
    for tenor in tenors:
        key = f"UST{tenor}"
        if key in into:
            continue
        series, source = day.yields(tenor)
        v = ms.window_move(series, start, end, is_yield=True)
        if v is not None:
            into[key] = round(v, 2)
            if source != "treasury":
                src[key] = source


# --------------------------------------------------------------------------------------------------------
# 3. Triggers: W3 on CPI days, W4 at BoJ meetings, the gold fade on listed onsets
# --------------------------------------------------------------------------------------------------------

def _pending_or_unavailable(day: _Day, rec: dict, rule: str, overdue: bool, chk: dict, detail: str) -> None:
    key = rule.lower()
    if not overdue:
        rec[key] = {"status": "pending", "reasons": chk["reasons"]}
        return
    rec[key] = {"status": "unavailable", "reasons": chk["reasons"], "evaluated": day.run.date}
    day.alert(f"{key}_data:{rec['id']}", f"{rule} for {rec['id']} not evaluated: {'; '.join(chk['reasons'])} "
              f"({detail}); no hypothetical trade")
    day.log(rule, "unavailable", {"release_id": rec["id"], "reasons": chk["reasons"]})


def _w3(day: _Day) -> None:
    """W3 (track 17 §5.2): on a CPI day, 2-year <= -6bp and core CPI m/m <= 0.1% -> long TLT at the next open."""
    c3 = day.cfg["W3"]
    for rec in day.releases("CPI"):
        state = rec.get("w3") or {}
        if rec.get("status") == "void" or state.get("status") not in (None, "pending"):
            continue
        s0, prev = rec["signal_date"], rec["prev_session"]
        d2y = rec["day0"].get("UST2Y")
        core = ms.cpi_mm(day.fred("CPILFESL"), rec.get("reference"))
        conflicts = day.yield_conflicts("2Y", [prev, s0]) if d2y is not None else []
        if conflicts:
            chk = {"trigger": False, "complete": True,
                   "reasons": [f"Treasury and FRED 2-year yields disagree on {', '.join(conflicts)}"]}
            day.alert(f"w3_conflict:{rec['id']}", f"W3 for {rec['id']}: {chk['reasons'][0]}; no hypothetical trade")
        else:
            chk = ms.w3_check(d2y, None if core is None else core["rounded"], c3)
        if not chk["complete"]:
            _pending_or_unavailable(day, rec, "W3", day.stale(s0), chk,
                                    day.data_error(("fred", "CPILFESL"), *_keys(["2Y"])))
            continue
        headline = ms.cpi_mm(day.fred("CPIAUCSL"), rec.get("reference"))
        result = {"status": "evaluated", "trigger": chk["trigger"], "reasons": chk["reasons"], "d2y_bp": d2y,
                  "core_cpi_mm": core, "headline_cpi_mm": None if headline is None else headline["rounded"],
                  "evaluated": day.run.date}
        rec["w3"] = result
        day.log("W3", "signal" if chk["trigger"] else "no_signal", {"release_id": rec["id"], **result})
        if not chk["trigger"]:
            continue
        ten, _ = day.yields("10Y")
        pre = ms.value_at_or_before(ten, prev)
        if pre is None:
            result["blocked"] = "the 10-year's pre-CPI close is unavailable, so the invalidation cannot be checked"
            day.alert(f"w3_blocked:{rec['id']}", f"W3 fired on {rec['id']} but {result['blocked']}; no trade")
            continue
        trade = ms.new_trade("W3", f"W3:{s0}", s0, c3["ticker"], "long", int(c3["hold_sessions"]),
                             release_id=rec["id"], pre_release_10y=pre, d2y_bp=d2y,
                             core_cpi_mm=core["rounded"], counted=True,
                             forecast={"question": f"{c3['ticker']} total return from entry to exit above 0",
                                       "p": float(c3["forecast_p_profit"])})
        day.events.append(trade)
        day.log("W3", "trade", dict(trade))


def _w4(day: _Day) -> None:
    """W4 (track 17 §5.2): the BoJ hikes and the Fed holds at its nearest meeting -> long FXY at the next open."""
    c4 = day.cfg["W4"]
    fomc = [r.date for r in day.cal.active(["FOMC"])]
    for rec in day.releases("BOJ"):
        state = rec.get("w4") or {}
        if rec.get("status") == "void" or state.get("status") not in (None, "pending"):
            continue
        pair = ms.nearest_fomc(rec["release_date"], fomc, int(c4["fed_pair_max_days"]))
        if pair is None:
            rec["w4"] = {"status": "no_fed_pair", "reasons": [f"no FOMC decision within "
                                                             f"{c4['fed_pair_max_days']} days"]}
            day.log("W4", "no_signal", {"release_id": rec["id"], **rec["w4"]})
            continue
        fomc_s0 = reaction_session(day.sessions, pair) if pair <= day.run.date else None
        if fomc_s0 is None:
            rec["w4"] = {"status": "pending", "fomc": pair, "reasons": [f"waiting for the FOMC decision of {pair}"]}
            continue
        at = max(rec["signal_date"], fomc_s0)            # the evening both decisions are public
        boj = ms.boj_decision(day.boj_rate(), rec["release_date"], day.run.date, int(c4["boj_window_days"]))
        fed = ms.fed_decision(day.fred("DFEDTARU"), pair)
        chk = ms.w4_check(None if boj is None else boj["change_bp"], None if fed is None else fed["change_bp"])
        if not chk["complete"]:
            overdue = (day.asof - pd.Timestamp(at)).days > int(c4["max_wait_days"])
            _pending_or_unavailable(day, rec, "W4", overdue, chk, day.data_error(("boj",), ("fred", "DFEDTARU")))
            if not overdue:
                rec["w4"]["fomc"] = pair
            continue
        result = {"status": "evaluated", "trigger": chk["trigger"], "reasons": chk["reasons"], "fomc": pair,
                  "boj": boj, "fed": fed, "signal_date": at, "evaluated": day.run.date}
        rec["w4"] = result
        day.log("W4", "signal" if chk["trigger"] else "no_signal", {"release_id": rec["id"], **result})
        if chk["trigger"]:
            trade = ms.new_trade("W4", f"W4:{rec['release_date']}", at, c4["ticker"], "long",
                                 int(c4["hold_sessions"]), release_id=rec["id"], fomc=pair, counted=True,
                                 boj_change_bp=boj["change_bp"], fed_change_bp=fed["change_bp"],
                                 forecast={"question": f"{c4['ticker']} total return from entry to exit above 0",
                                           "p": float(c4["forecast_p_profit"])})
            day.events.append(trade)
            day.log("W4", "trade", dict(trade))


def _gold(day: _Day) -> None:
    """The gold spike fade (track 17 §3.1, R2): short GLD at the open after a listed war onset's day 0, one
    session. An onset first seen after its day-0 evening is recorded but not counted (its outcome may have
    been known when it was listed)."""
    cg = day.cfg["GOLD_FADE"]
    seen = day.meta.setdefault("onsets_seen", {})
    known = day.by_id()
    gld = day.bars(cg["ticker"])
    closes = ms.total_return_closes(gld) if gld is not None else None
    for onset in day.cal.onsets:
        first = seen.setdefault(onset.id, day.run.date)
        if onset.id in known:
            continue
        s0 = reaction_session(day.sessions, onset.date, during_session=onset.during_session)
        if s0 is None:
            continue
        if s0 < day.floor:
            day.note(f"onset_before_launch:{onset.id}", f"{onset.id} ({onset.label}) is before launch; not logged")
            continue
        d0 = ms.window_move(closes, ms.prior_session(day.sessions, s0), s0)
        if d0 is None:
            if day.stale(s0):                             # fail closed, for good: no late entry either
                why = f"no {cg['ticker']} day-0 close ({day.data_error(('bars', cg['ticker']))})"
                day.alert(f"gold_data:{onset.id}", f"gold fade for {onset.id}: {why}; no hypothetical trade")
                rec = {"rule": "GOLD_FADE", "id": onset.id, "signal_date": s0, "label": onset.label,
                       "status": "unavailable", "reason": why, "first_seen": first}
                day.events.append(rec)
                known[onset.id] = rec
                day.log("GOLD_FADE", "unavailable", dict(rec))
            continue
        counted = first <= s0
        trade = ms.new_trade("GOLD_FADE", onset.id, s0, cg["ticker"], "short", int(cg["hold_sessions"]),
                             label=onset.label, first_seen=first, counted=counted, day0_move=round(d0, 6),
                             forecast={"question": f"a short {cg['ticker']} over one session earns above 0",
                                       "p": float(cg["forecast_p_profit"])})
        day.events.append(trade)
        known[onset.id] = trade
        day.log("GOLD_FADE", "trade", dict(trade))
        if not counted:
            day.note(f"onset_late:{onset.id}", f"{onset.id} was listed after its day-0 evening ({first}); "
                     "recorded, not counted toward the promotion test")
    # near-miss: a jump in gold with no listed onset around it, for the owner to review
    move = ms.window_move(closes, ms.prior_session(day.sessions, day.run.date), day.run.date)
    if move is None or move < float(cg.get("near_miss_move", 0.02)):
        return
    near = {ms.prior_session(day.sessions, day.run.date), day.run.date}
    listed = [o for o in day.cal.onsets
              if reaction_session(day.sessions, o.date, during_session=o.during_session) in near]
    if not listed:
        day.log("GOLD_FADE", "near_miss", {"session": day.run.date, "ticker": cg["ticker"], "move": round(move, 6)})
        day.run.note(f"MACRO: {cg['ticker']} {move:+.2%} today with no war onset listed (gold spike fade "
                     "near-miss; add the onset to config/econ_calendar.yaml if it was one)")


# --------------------------------------------------------------------------------------------------------
# 4. Hypothetical trades: entries, exits, scores
# --------------------------------------------------------------------------------------------------------

def _advance_trades(day: _Day) -> None:
    for trade in day.events:
        if trade.get("rule") not in RULES or trade.get("status") not in ("pending_entry", "open", "pending_exit"):
            continue
        bars = day.bars(trade["ticker"])
        if bars is None:
            if day.stale(trade["signal_date"]):
                day.alert(f"trade_data:{trade['id']}", f"{trade['id']}: no {trade['ticker']} bars "
                          f"({day.data_error(('bars', trade['ticker']))}); the trade waits")
            continue
        slip = day.run.cfg.slippage_bps(trade["ticker"]) / 1e4
        happened = ms.advance_trade(trade, bars, day.run.date, slip, _exit_check(day, trade, bars))
        for event in happened:
            if event == "exit":
                _score(day, trade, bars)
            day.log(trade["rule"], event, dict(trade))


def _exit_check(day: _Day, trade: dict, bars: pd.DataFrame) -> Callable[[str, int, dict], str | None]:
    rule, cfg = trade["rule"], day.cfg[trade["rule"]]
    if rule == "W3":
        ten, _ = day.yields("10Y")
        return ms.w3_exit_check(ten, float(trade["pre_release_10y"]), int(trade["max_sessions"]),
                                invalidation=bool(cfg.get("invalidation", True)), stale=day.stale)
    if rule == "W4":
        return ms.w4_exit_check(bars["close"].astype(float), float(cfg["stop_usdjpy"]), float(cfg["target_usdjpy"]),
                                int(trade["max_sessions"]))
    return ms.time_exit_check(int(trade["max_sessions"]))


def _score(day: _Day, trade: dict, bars: pd.DataFrame) -> None:
    ms.score_trade(trade, bars, years=float(day.cfg.get("baseline_years", 3.0)))
    for key in ("return", "price_return", "baseline", "excess"):
        if trade.get(key) is not None:
            trade[key] = round(float(trade[key]), 6)
    fc = trade.get("forecast")
    if fc is not None:
        outcome = int(float(trade["return"]) > 0)
        fc.update(outcome=outcome, brier=brier(float(fc["p"]), outcome))
    if trade["rule"] == "GOLD_FADE":                      # the track's measure: day-0 close to day-1 close
        closes = ms.total_return_closes(bars)
        f1 = ms.window_move(closes, trade["signal_date"], ms.session_after(day.sessions, trade["signal_date"], 1))
        trade["research_f1"] = None if f1 is None else round(f1, 6)
