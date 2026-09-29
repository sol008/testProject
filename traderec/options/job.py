"""The 10:17 ET options job and the daily run's spread marks (docs/PHASE_B_CONTRACTS.md §3-§5; design v3.3 §7, §10).

`run_options` is one transaction per ET date (run kind "options"), on the pipeline's `Run` class:

1. Begin. It is idempotent per date; `--force` re-runs the latest run from its pre-run snapshot; a dry run
   works on a copy of the state.
2. Cancel spread orders whose session has passed. A day order cannot fill a day late.
3. Snapshot every root needed: pending spread orders, open spreads, and each runner's `roots_needed`. Use
   only market-hours quotes of the run date. Store a filtered copy under state/options/<date>/ and log a
   `snapshot` record with the raw payload's SHA-256.
4. Fill pending spread orders with fill model v1.0 (`PaperBroker.fill_spreads`). Log every decision, and call
   the owning runner's `on_spread_fill` or `on_spread_cancel`.
5. Mark the open spreads at the snapshot's combo mid.
6. Call each runner's `options_job(run, chains)`. Shadow runners are guarded, so an exception becomes an
   alert.
7. Finish: the run manifest, then the state. There are no emails; alerts go in the run result and the
   state.

A root with orders due today but no usable market-hours chain leaves those orders pending. The run then ends
as `data_missing`, which is retryable: the workflow's second slot or a manual dispatch retries. Such a run
skips step 6. Scheduled runs (no --date) check the clock first. Before the snapshot window they return
"too_early" and after it "too_late", both without touching the state. The window opens at 10:15 ET, so that
CBOE's 15-minute-delayed quotes are from 10:00 ET or later.

`mark_spreads(run)` is the daily run's hook, called before the book is marked. First it settles any spread
still open on or after its expiry at intrinsic value, from the underlying's official close. That is the
safety net: the rules close spreads at least one trading day before expiry. Then it marks the rest at
tonight's closing chains, and keeps the last marks when a chain is missing.
"""
from __future__ import annotations

import copy
import math
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

import pandas as pd

from traderec import market_calendar
from traderec.options import snapshots
from traderec.options.chain import OptionChain, chain_root, parse_occ
from traderec.types import Fill, OrderIntent

if TYPE_CHECKING:  # pragma: no cover
    from traderec.broker import PaperBroker
    from traderec.config import Config
    from traderec.pipeline import Run, RunResult, Services

OPTIONS_DEFAULTS: dict[str, Any] = {"enabled": False, "snapshot_window_et": ["10:15", "16:00"],
                                    "close_after_et": "16:00"}
# The official close that settles a root's options at expiry, and its scale: XSP is 1/10 of the S&P 500.
# Third-Friday SPX options are AM-settled on the opening quotation; the safety net uses the close for all.
SETTLEMENT_SOURCES: dict[str, tuple[str, float]] = {"XSP": ("^GSPC", 0.1), "SPX": ("^GSPC", 1.0),
                                                    "SPXW": ("^GSPC", 1.0)}


def options_config(cfg: "Config") -> dict[str, Any]:
    """The constitution's top-level `options` block, with OPTIONS_DEFAULTS for missing keys."""
    return {**OPTIONS_DEFAULTS, **(cfg.constitution.get("options") or {})}


# ----------------------------------------------------------------------------------------------------------
# The 10:17 ET job
# ----------------------------------------------------------------------------------------------------------

def run_options(cfg: "Config", provider: Any, state_dir: Path | None = None, *, date: str | None = None,
                dry_run: bool = False, force: bool = False, services: "Services | None" = None) -> "RunResult":
    """The 10:17 ET Mon-Fri run: snapshot chains, fill pending spread orders (fill model v1.0), option shadows.

    With `date` None (the scheduled run), the date is today in New York. The run returns "too_early" or
    "too_late", touching nothing, outside `options.snapshot_window_et`. It returns "disabled" while
    `options.enabled` is false. Healthcheck pings: "start", then "success", or "fail" on data_missing or an
    error (never in dry runs).
    """
    from traderec import pipeline

    ocfg = options_config(cfg)
    now = market_calendar.now_et() if date is None else None
    day = market_calendar.iso(date if date is not None else now)
    if not ocfg.get("enabled", False):
        return pipeline.RunResult("options", day, "disabled", dry_run=dry_run,
                                  notes=["options.enabled is false in constitution.yaml; nothing done"])
    if now is not None and market_calendar.is_trading_day(day):
        start, end = _window(ocfg)
        hhmm = now.strftime("%H:%M")
        if not start <= hhmm <= end:
            status = "too_early" if hhmm < start else "too_late"
            return pipeline.RunResult("options", day, status, dry_run=dry_run, notes=[
                f"{hhmm} ET is outside the {start}-{end} ET snapshot window: fills use market-hours quotes only "
                "(design §7); nothing done"])
    run = pipeline.Run(cfg, provider, state_dir, "options", day, dry_run=dry_run, force=force, services=services)
    try:
        if not run.begin():
            return run.result
        if not dry_run:
            run.services.healthcheck("start")
        try:
            status = _options(run, ocfg)
        except pipeline.DataMissing as exc:
            run.alert("data", str(exc))
            result = run.finish("data_missing")
            if not dry_run:
                run.services.healthcheck("fail")
            return result
        result = run.finish(status)
        if not dry_run:
            run.services.healthcheck("fail" if run.blocked else "success")
        return result
    except Exception:
        if not dry_run:
            run.services.healthcheck("fail")
        raise
    finally:
        run.close()


def _options(run: "Run", ocfg: dict[str, Any]) -> str:
    from traderec import pipeline, runners

    if not market_calendar.is_trading_day(run.date):
        run.note("no session today (weekend or NYSE holiday)")
        return "no_session"
    _cancel_missed(run)
    needs = _roots_needed(run)
    due = {r for r, why in needs.items() if "orders" in why}
    surface_roots = {r for r, why in needs.items() if any(w.startswith("runner:") for w in why)}
    keep = book_legs(run)
    start, end = _window(ocfg)
    cfg_snap = snapshots.snapshot_config(ocfg.get("snapshots"))
    chains: dict[str, OptionChain] = {}
    problems: dict[str, str] = {}
    surface_left = len(surface_roots)
    for root in sorted(needs):
        chain, problem = _fetch(run, root, lambda c: _market_problem(c, run.date, start, end))
        if chain is None:
            problems[root] = str(problem)
            run.log("signal", {"check": "option_chain", "root": root, "ok": False, "reason": problem,
                               "needed_for": needs[root]})
            run.note(f"{root} option chain not usable ({problem}); needed for {', '.join(needs[root])}")
            continue
        surface = root in surface_roots
        _store_snapshot(run, chain, keep, cfg_snap, surface=surface, needed_for=needs[root],
                        share=surface_left if surface else 0)
        surface_left -= int(surface)
        chains[root] = chain
    for root in sorted(chains):
        _fill_root(run, root, chains[root])
    marks = run.broker.mark_spreads(run.date, chains)
    if marks:
        run.log("mark", {"kind": "spreads", "date": run.date, "marks": marks,
                         "asof": {r: c.asof for r, c in chains.items()}})
    missing = sorted(due - set(chains))
    if missing:
        detail = "; ".join(f"{r}: {problems.get(r)}" for r in missing)
        raise pipeline.DataMissing(f"no usable market-hours option quotes ({detail}); their spread orders stay "
                                   "pending until the options job is retried today")
    for name in runners.OPTIONS_JOB_RUNNERS:
        hook = getattr(getattr(runners, name, None), "options_job", None)
        if hook is None:
            continue
        if name in runners.SHADOW_RUNNERS:
            pipeline._shadow_guard(run, name, hook, chains)
        else:
            hook(run, chains)
    return "ok"


def _window(ocfg: dict[str, Any]) -> tuple[str, str]:
    start, end = ocfg.get("snapshot_window_et") or OPTIONS_DEFAULTS["snapshot_window_et"]
    return str(start), str(end)


def _cancel_missed(run: "Run") -> None:
    """Cancel spread orders whose session (the first trading day after their creation) is before today."""
    for o in run.broker.pending():
        if o.order_type != "spread_limit" or o.created_date >= run.date:
            continue
        session = market_calendar.iso(market_calendar.next_trading_day(o.created_date))
        if session >= run.date:
            continue
        reason = (f"its session {session} passed without a fill decision (no options run with usable quotes that "
                  "day); a day order cannot fill later")
        run.broker.cancel_pending(o.intent_id, run.date, reason)
        run.log("fill", {"type": "no_fill", "filled": False, "cancelled": True, "reason": reason,
                         **_intent_fields(o), "fill_date": run.date})
        run.alert("fill", f"{o.intent_id} {o.module} {o.ticker} spread order cancelled: {reason}")
        _hook(run, o.module, "on_spread_cancel", o, reason)


def _roots_needed(run: "Run") -> dict[str, list[str]]:
    """{root: purposes}: "orders" (spread orders due today), "open spreads", "runner:<name>"."""
    from traderec import runners

    needs: dict[str, set[str]] = {}
    for o in run.broker.pending():
        if o.order_type == "spread_limit" and o.created_date < run.date:
            needs.setdefault(chain_root(o.ticker), set()).add("orders")
    for s in run.broker.spreads():
        needs.setdefault(chain_root(s["root"]), set()).add("open spreads")
    for name in runners.OPTIONS_JOB_RUNNERS:
        ask = getattr(getattr(runners, name, None), "roots_needed", None)
        if ask is None:
            continue
        try:
            roots = set(ask(run) or ())
        except Exception as exc:  # noqa: BLE001 - one runner's request must not stop the fills
            run.alert("runner", f"{name}.roots_needed failed: {type(exc).__name__}: {exc}")
            run.log("signal", {"check": "roots_needed", "runner": name, "ok": False,
                               "error": f"{type(exc).__name__}: {exc}"})
            continue
        for r in roots:
            needs.setdefault(chain_root(r), set()).add(f"runner:{name}")
    return {r: sorted(v) for r, v in needs.items()}


def book_legs(run: "Run") -> set[str]:
    """OCC symbols the book depends on: legs of pending and open spreads, and of every module's and shadow
    book's open trade (contract §6 "open_trade" with "legs"). A snapshot always keeps these rows."""
    occ: set[Any] = set()
    for o in run.broker.pending():
        if o.order_type == "spread_limit":
            occ |= {leg.get("occ") for leg in o.legs or []}
    for s in run.broker.spreads():
        occ |= {leg.get("occ") for leg in s["legs"] or []}
    for group in ("modules", "shadow"):
        for book in (run.state.get(group) or {}).values():
            ot = book.get("open_trade") if isinstance(book, dict) else None
            if isinstance(ot, dict):
                occ |= {leg.get("occ") for leg in ot.get("legs") or [] if isinstance(leg, dict)}
    return {str(o) for o in occ if o}


def _fetch(run: "Run", root: str, check: Callable[[OptionChain], str | None]) -> tuple[OptionChain | None, str | None]:
    """(chain, None), or (None, why) when the provider fails or `check` finds a problem."""
    try:
        chain = run.provider.option_chain(root)
    except Exception as exc:  # noqa: BLE001 - every source failed: fail closed, the caller decides
        return None, f"{type(exc).__name__}: {exc}"
    problem = check(chain)
    return (None, problem) if problem else (chain, None)


def _quote_time(chain: OptionChain) -> pd.Timestamp | None:
    try:
        ts = pd.Timestamp(chain.asof)
    except (TypeError, ValueError):
        return None
    return None if ts is pd.NaT else ts


def _chain_problem(chain: OptionChain) -> str | None:
    spot = chain.spot if isinstance(chain.spot, (int, float)) else float("nan")
    if not math.isfinite(spot) or spot <= 0:
        return f"no underlying price ({chain.spot!r})"
    if chain.frame is None or chain.frame.empty:
        return "the chain lists no contracts"
    return None


def _market_problem(chain: OptionChain, date: str, start: str, end: str) -> str | None:
    """Why `chain` cannot be used for fills on `date`: quotes from another day or outside the window."""
    ts = _quote_time(chain)
    if ts is None:
        return f"unreadable quote time {chain.asof!r}"
    if ts.strftime("%Y-%m-%d") != date:
        return f"quotes are from {ts:%Y-%m-%d}, not {date}"
    if not start <= ts.strftime("%H:%M") <= end:
        return f"quotes stamped {ts:%H:%M} ET, outside the {start}-{end} ET window (market hours only)"
    return _chain_problem(chain)


def _closing_problem(chain: OptionChain, date: str, close_after: str) -> str | None:
    """Why `chain` cannot mark spreads at the close of `date`: quotes from another day or before the close."""
    ts = _quote_time(chain)
    if ts is None:
        return f"unreadable quote time {chain.asof!r}"
    if ts.strftime("%Y-%m-%d") != date:
        return f"quotes are from {ts:%Y-%m-%d}, not {date}"
    if ts.strftime("%H:%M") < close_after:
        return f"quotes stamped {ts:%H:%M} ET, before the {close_after} ET close"
    return _chain_problem(chain)


def _store_snapshot(run: "Run", chain: OptionChain, keep: set[str], cfg_snap: dict[str, Any], *, surface: bool,
                    needed_for: list[str], share: int) -> dict[str, Any]:
    """Store the filtered snapshot within the day's byte budget and log its `snapshot` record.

    A root with a surface sample gets an equal share of what is left of the day's budget (`share` = surface
    roots not yet stored, this one included); a legs-only snapshot may use all of it.
    """
    total = int(cfg_snap["max_bytes_per_day"])
    used = snapshots.day_bytes(run.paths.root, run.date, exclude=(snapshots.snapshot_name(chain),))
    left = max(total - used, 0)
    budget = left // share if share > 0 else left
    rec = snapshots.store(run.paths.root, run.date, chain, keep, cfg_snap, surface=surface, budget=budget)
    run.log("snapshot", {"kind": "option_chain", "root": chain.underlying, "source": chain.source,
                         "asof": chain.asof, "spot": chain.spot, "raw_sha256": chain.raw_sha256,
                         "needed_for": needed_for, "budget": budget, **rec})
    run.note(f"{chain.underlying} {chain.source} quotes {chain.asof[11:16]} ET: stored {rec['rows']} of "
             f"{rec['rows_total']} contracts ({rec['bytes'] / 1000:.1f} KB) at {rec['path']}")
    if rec["legs_missing"]:
        run.note(f"{chain.underlying} chain does not list {', '.join(rec['legs_missing'])}")
    return rec


def _intent_fields(intent: OrderIntent) -> dict[str, Any]:
    return {"intent_id": intent.intent_id, "trade_id": intent.trade_id, "module": intent.module,
            "account": intent.account, "ticker": intent.ticker, "side": intent.side,
            "contracts": intent.contracts, "limit_price": intent.limit_price, "max_price": intent.max_price}


def _fill_root(run: "Run", root: str, chain: OptionChain) -> None:
    """Run the fill model for the orders on `root`, record every decision, and call the runners' hooks."""
    before = {o.intent_id: o for o in run.broker.pending()}
    time_et = pd.Timestamp(chain.asof).strftime("%H:%M")
    fills = run.broker.fill_spreads(run.date, time_et, {root: chain})
    decisions = copy.deepcopy(run.broker.last_fill_meta)
    for fill in fills:
        _record_fill(run, fill, decisions.get(fill.intent_id, {}))
        run.note(f"{fill.intent_id} {fill.module} {fill.side} {fill.qty:g} {fill.ticker} spread filled at "
                 f"{fill.price:.2f} ({decisions.get(fill.intent_id, {}).get('attempt')}) at {time_et} ET")
        _hook(run, fill.module, "on_spread_fill", fill, before[fill.intent_id])
    for iid, meta in decisions.items():
        if not meta.get("cancelled"):
            continue
        intent = before[iid]
        run.log("fill", {"type": "no_fill", "filled": False, **_intent_fields(intent), "fill_date": run.date,
                         "fill_time": time_et, "model_version": str(run.cfg.fills["model_version"]), **meta})
        message = f"{iid} {intent.module} {intent.ticker} spread not filled at {time_et} ET: {meta.get('reason')}"
        if intent.side == "sell":
            run.alert("fill", f"{message}; the exit is re-issued tonight with new prices")
        else:
            run.note(f"{message}; entry skipped")
        _hook(run, intent.module, "on_spread_cancel", intent, str(meta.get("reason")))


def _record_fill(run: "Run", fill: Fill, meta: dict[str, Any]) -> None:
    """Ledger `fill` record, the state's fills list (for the practice-vs-model comparison) and the result."""
    run.log("fill", {**fill.to_dict(), **meta, "order_type": "spread_limit"})
    quote = meta.get("quote") or {}
    run.state.setdefault("fills", []).append({
        "intent_id": fill.intent_id, "trade_id": fill.trade_id, "module": fill.module, "ticker": fill.ticker,
        "side": fill.side, "price": fill.price, "dollars": fill.dollars, "fill_date": fill.fill_date,
        "qty": fill.qty, "order_type": "spread_limit", "ref_price": fill.ref_price, "multiplier": fill.multiplier,
        "natural_width": quote.get("natural_width"), "fill_time": fill.fill_time,
        "attempt": meta.get("attempt"), "reason": meta.get("reason")})
    run.result.fills.append(fill.to_dict())


def _hook(run: "Run", module: str, name: str, *args: Any) -> None:
    """Call runners.SPREAD_MODULES[module].<name>(run, *args); alert when no runner owns the module."""
    from traderec import runners

    owner = runners.SPREAD_MODULES.get(module)
    fn = getattr(owner, name, None) if owner is not None else None
    if fn is None:
        run.alert("fill", f"no runner handles {name} for module {module}")
        return
    fn(run, *args)


# ----------------------------------------------------------------------------------------------------------
# The daily run's hook: expiry safety net, then marks at tonight's closing chains
# ----------------------------------------------------------------------------------------------------------

def mark_spreads(run: "Run") -> None:
    """Daily-run hook, called before the book is marked: value open spreads at tonight's closing quotes.

    1. Settle any spread still open on or after its expiry date at intrinsic value, from the underlying's
       official close on that date (SETTLEMENT_SOURCES). The fill carries reason "expiry_settlement", an
       "expiry" alert is raised, and the module's `on_spread_fill` gets a closing intent with that reason.
    2. Mark the other spreads at the combo mid of chains stamped on the run date at or after
       `options.close_after_et`. A missing or stale chain keeps the last mark, with a note. A legs-only
       snapshot of each chain used is stored and logged.
    """
    if not run.broker.spreads():
        return
    _settle_expired(run)
    spreads = run.broker.spreads()
    if not spreads:
        return
    ocfg = options_config(run.cfg)
    close_after = str(ocfg.get("close_after_et") or OPTIONS_DEFAULTS["close_after_et"])
    cfg_snap = snapshots.snapshot_config(ocfg.get("snapshots"))
    keep = book_legs(run)
    chains: dict[str, OptionChain] = {}
    for root in sorted({chain_root(s["root"]) for s in spreads}):
        chain, problem = _fetch(run, root, lambda c: _closing_problem(c, run.date, close_after))
        if chain is None:
            run.note(f"{root} spreads keep their last marks: no closing option chain ({problem})")
            run.log("signal", {"check": "option_chain", "root": root, "ok": False, "reason": problem,
                               "needed_for": ["marks"]})
            continue
        _store_snapshot(run, chain, keep, cfg_snap, surface=False, needed_for=["marks"], share=0)
        chains[root] = chain
    marks = run.broker.mark_spreads(run.date, chains)
    kept = {s["key"]: {"mark": s["mark"], "mark_date": s["mark_date"]} for s in spreads if s["key"] not in marks}
    run.log("mark", {"kind": "spreads", "date": run.date, "marks": marks, "kept": kept})
    if kept:
        run.note(f"spread marks kept from earlier: {', '.join(sorted(kept))}")


def intrinsic_value(legs: list[dict], underlying: float) -> float:
    """Per-share value at expiry of the position `legs` with the underlying at `underlying` (floored at 0)."""
    total = 0.0
    for leg in legs:
        p = parse_occ(leg["occ"])
        payoff = max(underlying - p["strike"], 0.0) if p["right"] == "C" else max(p["strike"] - underlying, 0.0)
        total += payoff if leg.get("position") == "long" else -payoff
    return max(total, 0.0)


def _settle_expired(run: "Run") -> None:
    """The safety net (contract §3): settle spreads still open on or after their expiry at intrinsic value."""
    for s in run.broker.spreads():
        if s["expiry"] > run.date:
            continue
        ticker, scale = SETTLEMENT_SOURCES.get(str(s["root"]).upper(), (str(s["root"]), 1.0))
        try:
            close = run.close_on(ticker, s["expiry"])
        except Exception as exc:  # noqa: BLE001 - no settlement price: retry at the next daily run
            close, why = None, f"{type(exc).__name__}: {exc}"
        else:
            why = "no bar for that date"
        if close is None:
            run.alert("data", f"spread {s['key']} expired on {s['expiry']} but the {ticker} close is missing "
                              f"({why}); not settled yet")
            continue
        value = intrinsic_value(s["legs"], close * scale)
        fill = run.broker.settle_spread(s["key"], s["expiry"], value, "expiry_settlement")
        meta = dict(run.broker.last_fill_meta.get(fill.intent_id, {}))
        meta.update(settlement_ticker=ticker, underlying_close=close, underlying_value=close * scale)
        _record_fill(run, fill, meta)
        for iid in meta.get("cancelled_orders", []):
            run.log("correction", {"cancelled_order": iid, "reason": "the spread was settled at expiry"})
        run.alert("expiry", f"{s['module']} spread {s['trade_id']} was still open at its {s['expiry']} expiry: "
                            f"settled at intrinsic value {value:.2f} a share ({ticker} close {close:,.2f}). "
                            "The rules close spreads at least one trading day before expiry (design §3a.4)")
        intent = OrderIntent(intent_id=fill.intent_id, trade_id=s["trade_id"], module=s["module"],
                             account=s["account"], ticker=s["root"], side="sell", created_date=run.date,
                             reason="expiry_settlement", close_all=True, order_type="spread_limit",
                             legs=copy.deepcopy(s["legs"]), contracts=s["contracts"],
                             meta={"settlement": True, "settlement_ticker": ticker, "underlying_close": close})
        _hook(run, s["module"], "on_spread_fill", fill, intent)


# ----------------------------------------------------------------------------------------------------------
# status
# ----------------------------------------------------------------------------------------------------------

def _legs_text(legs: list[dict] | None) -> str:
    """"+770C/-805C 2026-11-20" for a long 770 / short 805 call vertical."""
    parts, expiry = [], ""
    for leg in legs or []:
        try:
            p = parse_occ(leg["occ"])
        except (KeyError, TypeError, ValueError):
            parts.append(str(leg.get("occ")))
            continue
        parts.append(f"{'+' if leg.get('position') == 'long' else '-'}{p['strike']:g}{p['right']}")
        expiry = p["expiry"]
    return f"{'/'.join(parts)} {expiry}".strip()


def _price(x: Any) -> str:
    return f"{float(x):.2f}" if isinstance(x, (int, float)) and math.isfinite(float(x)) else "n/a"


def status_lines(broker: "PaperBroker") -> list[str]:
    """`python -m traderec status` lines for open spreads and pending spread orders."""
    lines = []
    for s in broker.spreads():
        mark = f"{s['mark']:.2f} on {s['mark_date']}" if s.get("mark") is not None else "not marked yet"
        lines.append(f"spread {s['account']} {s['root']} [{s['module']}]: {s['contracts']} x {_legs_text(s['legs'])}, "
                     f"paid {s['entry_price']:.2f} (${s['cost']:,.2f}), mark {mark}, opened {s['opened']}, "
                     f"trade {s['trade_id']}")
    for o in broker.pending():
        if o.order_type != "spread_limit":
            continue
        what, stated = ("open", "max") if o.side == "buy" else ("close", "min")
        size = o.contracts if o.contracts else "all"
        lines.append(f"pending spread {what} {o.ticker} {size} x {_legs_text(o.legs)} limit {_price(o.limit_price)}, "
                     f"stated {stated} {_price(o.max_price)} [{o.module}] from {o.created_date} ({o.intent_id})")
    return lines
