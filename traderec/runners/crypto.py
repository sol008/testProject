"""Crypto shadow books: M6 depeg buy and cash-and-carry, the ETH switch, and the hourly 24/7 crypto job (design v3.3 §3 M6).

Shadow only: no emails, no orders, no LLM. Design §3 "Shadow ledger"; track 20 moved M6 there because neither leg
can be placed on the owner's venues. Every decision is a `shadow` ledger record plus an entry in
state["shadow"]["M6"] or state["shadow"]["ETH"]. The rules are in `traderec.modules.crypto_shadows`, the network
adapters in `traderec.data.crypto_data`, and the owner's guide in docs/phase-b/crypto.md.

* `daily(run, checks)` is the 22:17 ET hook, a guarded shadow runner (docs/PHASE_B_CONTRACTS.md §7). It runs:
  - the ETH weekly switch: M3's 10-week rule on ETH. The first daily run after the Sunday UTC candle decides the
    week, and replays any missed weeks (catching up like `_m3`);
  - the cash-and-carry check, on the CME month with the most days to expiry, up to 60.
* `run_hourly(...)` is the hourly 24/7 job (`python -m traderec hourly`; .github/workflows/hourly.yml). It runs the
  stablecoin depeg monitor. A quiet hour writes nothing, so the workflow has nothing to commit. An hour in which an
  event starts, updates or ends is one Run transaction keyed "hourly:<YYYY-MM-DDTHHZ>", recorded once.
"""
from __future__ import annotations

import copy
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pandas as pd

from traderec.config import STATE_DIR
from traderec.data import crypto_data
from traderec.modules import crypto_shadows as rules
from traderec.state import RETRYABLE, Paths, load_state

if TYPE_CHECKING:  # pragma: no cover
    from traderec.config import Config
    from traderec.pipeline import Run, RunResult, Services

ETH_BOOK: dict[str, Any] = {"on": None, "last_week_end": None, "open_trade": None, "trades": [], "weeks": []}
M6_BOOK: dict[str, Any] = {"events": [], "watch": {}}


def _cfg(cfg: "Config", name: str) -> dict:
    return dict((cfg.constitution.get("shadow") or {}).get(name) or {})


def _book(state: dict, name: str, template: Mapping[str, Any]) -> dict:
    """state["shadow"][name] with every key of `template` present (older states lack the Phase B keys)."""
    book = state.setdefault("shadow", {}).setdefault(name, {})
    for key, default in template.items():
        book.setdefault(key, copy.deepcopy(default))
    return book


def _utc(when: Any) -> pd.Timestamp:
    ts = pd.Timestamp(when)
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")


def _guard(run: "Run", name: str, fn: Callable[..., None], *args: Any) -> None:
    """Run one sub-book. An exception becomes an alert and a ledger record, as in pipeline._shadow_guard."""
    try:
        fn(run, *args)
    except Exception as exc:  # noqa: BLE001 - a shadow book (no emails, no orders) must never stop the run
        run.alert("shadow", f"{name} failed: {type(exc).__name__}: {exc}")
        run.log("shadow", {"book": name, "event": "error", "error": f"{type(exc).__name__}: {exc}"})


def _add_sources(run: "Run", src: Any) -> None:
    run.sources.update(str(v).split(":")[0] for v in (getattr(src, "sources", None) or {}).values())


# ----------------------------------------------------------------------------------------------------
# 22:17 ET: the ETH switch shadow and the cash-and-carry check
# ----------------------------------------------------------------------------------------------------

def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook: the ETH switch shadow and the M6 cash-and-carry check. No emails, no orders."""
    cfg_eth, cfg_m6 = _cfg(run.cfg, "ETH"), _cfg(run.cfg, "M6")
    carry = dict(cfg_m6.get("carry") or {})
    eth_on = bool(cfg_eth.get("enabled", False))
    carry_on = bool(cfg_m6.get("enabled", False)) and bool(carry.get("enabled", False))
    if not (eth_on or carry_on):
        return
    src = crypto_data.crypto_source(run.provider)
    if src is None:
        run.note("crypto shadows skipped: the data provider has no crypto feeds")
        return
    if eth_on:
        _guard(run, "ETH", _eth, src, cfg_eth)
    if carry_on:
        _guard(run, "M6 carry", _carry, src, carry)
    _add_sources(run, src)


def _eth(run: "Run", src: Any, cfg: dict) -> None:
    """The ETH weekly switch (design §3 M3's rule on ETH; track 15 R2).

    The daily run for an ET evening starts after 00:00 UTC, so, as in `_m3`, it sees the UTC day before the next
    ET date as complete. The first run after a Sunday candle therefore decides that week.
    """
    book = _book(run.state, "ETH", ETH_BOOK)
    asof_utc = (pd.Timestamp(run.date) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        closes = src.eth_daily_utc()
    except Exception as exc:  # noqa: BLE001 - fail closed: no prices, no weekly decision
        msg = f"ETH-USD prices unavailable ({type(exc).__name__}); the week is not decided"
        run.alert("data", f"ETH switch shadow: {msg} (fail closed)")
        run.log("shadow", {"book": "ETH", "event": "data_missing", "reason": msg})
        return
    step = rules.eth_step(book, closes, asof_utc, cfg, tbill=run.get_tbill())
    for msg in step["problems"]:
        run.alert("data", f"ETH switch shadow: {msg} (fail closed)")
        run.log("shadow", {"book": "ETH", "event": "data_missing", "reason": msg})
    for msg in step["notes"]:
        run.note(f"ETH switch shadow: {msg}")
    for change in step["changes"]:
        run.log("shadow", {"book": "ETH", **change})
        if change["event"] == "entry":
            run.note(f"ETH switch shadow: bought at {change['entry_price']:,.2f} ({change['trade_id']})")
        elif change["event"] == "exit":
            run.note(f"ETH switch shadow: sold at {change['exit_price']:,.2f}, {change['return']:+.2%} "
                     f"({change['trade_id']})")
    if any(c["event"] == "weekly" for c in step["changes"]):
        run.note(f"ETH switch shadow: week ending {book['last_week_end']} is {'on' if book['on'] else 'off'}")


def _carry(run: "Run", src: Any, cfg: dict) -> None:
    """Cash-and-carry (design §3 M6; track 05 §7.1): close an event at its expiry, then test tonight's basis."""
    book = _book(run.state, "M6", M6_BOOK)
    for ev in book["events"]:
        if ev.get("kind") == "carry" and rules.carry_close(ev, run.date, cfg):
            run.log("shadow", {"book": "M6", "event": "carry_close", **ev})
            run.note(f"M6 carry {ev['contract']} closed at expiry: {ev['return']:+.2%}")
    limit = int(cfg.get("max_days_to_expiry", rules.CARRY_DEFAULTS["max_days_to_expiry"]))
    months = rules.carry_contracts(run.date, limit)
    if not months:              # never with monthly contracts and a 60-day limit
        run.note("M6 carry: no CME Bitcoin month within the expiry limit")
        return
    target = months[0]
    quote, spot, problem, is_data = _carry_quote(run, src, target)
    chk = rules.carry_check(target, quote, spot, run.get_tbill(), cfg)
    run.log("shadow", {"book": "M6", "event": "carry_check", "date": run.date, **chk, "problem": problem})
    book["carry_last"] = {"date": run.date, **{k: chk[k] for k in ("contract", "ticker", "basis_annual", "threshold",
                                                                    "on")}}
    if chk["basis_annual"] is None:
        if is_data:
            run.alert("data", f"M6 cash-and-carry not checked: {problem} (fail closed)")
        else:
            run.note(f"M6 cash-and-carry not checked: {problem}")
        return
    run.note(f"M6 carry {chk['label']}: basis {chk['basis_annual']:.2%} a year vs trigger {chk['threshold']:.2%} "
             f"({'on' if chk['on'] else 'off'})")
    if chk["on"] and not any(e.get("kind") == "carry" and e.get("status") == "open" for e in book["events"]):
        ev = rules.carry_open(chk, run.date, run.current_nav(), cfg)
        book["events"].append(ev)
        run.log("shadow", {"book": "M6", "event": "carry_open", **ev})


def _carry_quote(run: "Run", src: Any, target: dict) -> tuple[dict | None, float | None, str | None, bool]:
    """The target month's futures quote and BTC-USD at the quote's time.

    Returns (quote, spot, problem, is_data_problem). A quote stamped after the run's window is not a data problem:
    it means a catch-up run for an earlier date, which can't see that date's quotes.
    """
    name = f"{target['label']} ({target['code']})"
    try:
        quote = src.btc_future_quote(target["year"], target["month"])
    except Exception as exc:  # noqa: BLE001 - fail closed
        return None, None, f"no quote for {name}: {type(exc).__name__}", True
    if not quote or quote.get("time") is None:
        return None, None, f"no explicit-month quote for {name}", True
    when = _utc(quote["time"])
    start, end = rules.quote_window(run.date)
    if when < start:
        return None, None, f"the {quote.get('ticker')} quote from {quote['time']} is stale", True
    if when > end:
        return None, None, f"the {quote.get('ticker')} quote from {quote['time']} is after the run date", False
    try:
        spot = src.btc_spot_at(when)
    except Exception as exc:  # noqa: BLE001 - fail closed
        return quote, None, f"no BTC-USD price at {quote['time']}: {type(exc).__name__}", True
    if spot is None:
        return quote, None, f"no BTC-USD price at {quote['time']}", True
    return quote, float(spot), None, True


# ----------------------------------------------------------------------------------------------------
# hourly, 24/7: the stablecoin depeg monitor
# ----------------------------------------------------------------------------------------------------

def run_hourly(cfg: "Config", provider: Any, state_dir: Any = None, *, now: Any = None, dry_run: bool = False,
               services: "Services | None" = None) -> "RunResult":
    """The hourly 24/7 job: the M6 stablecoin depeg monitor (docs/PHASE_B_CONTRACTS.md §12; design §10).

    1. The hour's key is "hourly:<YYYY-MM-DDTHHZ>" (UTC). A recorded hour is not repeated ("already_done").
    2. Fetch each coin's books (Coinbase, Kraken, Gemini) and plan the monitor's step on a copy of the state.
    3. A quiet hour writes nothing and returns "no_change": no ledger record and no state change, so the workflow
       has nothing to commit.
    4. Otherwise the hour is one Run transaction, like the other runs: ledger check, pre-run snapshot, `shadow`
       records (plus a data alert for an unconfirmed depeg), run manifest and state.

    Statuses: ok, no_change, already_done, disabled, and data_missing (no venue answered; the CLI exits 3 and the
    next hour retries). Healthchecks (HC_PING_URL): "success" after a completed check, "fail" on an error. Nothing
    is pinged when no venue answered, so a lasting outage shows up as missed pings.
    """
    from traderec.pipeline import RunError, RunResult, Services

    services = services or Services()
    stamp = pd.Timestamp.now(tz="UTC") if now is None else _utc(now)
    label = rules.hour_label(stamp)
    key = f"hourly:{label}"
    result = RunResult("hourly", label, "running", dry_run=dry_run)
    paths = Paths(Path(state_dir or STATE_DIR))
    if not paths.state.exists():
        raise RunError(f"no state at {paths.state}; run `python -m traderec init` first")
    ping: Callable[[str], None] = (lambda status: None) if dry_run else services.healthcheck
    try:
        m6 = _cfg(cfg, "M6")
        dcfg = dict(m6.get("depeg") or {})
        if not (m6.get("enabled", False) and dcfg.get("enabled", False)):
            result.status = "disabled"
            result.notes.append("the depeg monitor is off in config (shadow.M6.enabled, shadow.M6.depeg.enabled)")
            ping("success")
            return result
        state = load_state(paths.state)
        prev = (state.get("runs") or {}).get(key)
        if prev is not None and prev.get("status") not in RETRYABLE:
            result.status = "already_done"
            result.notes.append(f"{key} already ran ({prev.get('status')})")
            ping("success")
            return result
        src = crypto_data.crypto_source(provider)
        if src is None:
            result.status = "data_missing"
            result.notes.append("the data provider has no crypto feeds")
            return result
        coins, markets = _depeg_markets(dcfg, state)
        snap = src.stablecoin_quotes(markets)
        quotes = snap.get("quotes") or {}
        result.notes.extend(_quote_notes(quotes, snap.get("errors") or {}, dcfg))
        if not any(rules.depeg_check(q or {}, dcfg)["usable"] for q in quotes.values()):
            result.status = "data_missing"
            result.notes.append("no venue returned a usable book this hour; nothing was decided")
            return result
        plan = rules.depeg_step(_book(copy.deepcopy(state), "M6", M6_BOOK), quotes, stamp, dcfg, None, coins,
                                markets=markets)
        if not plan:
            result.status = "no_change"
            ping("success")
            return result
        _record_hour(cfg, provider, state_dir, stamp, key, result, quotes, dcfg, coins, markets, src,
                     dry_run=dry_run, services=services)
        ping("success")
        return result
    except Exception:
        ping("fail")
        raise


def _record_hour(cfg: "Config", provider: Any, state_dir: Any, stamp: pd.Timestamp, key: str, result: "RunResult",
                 quotes: dict, dcfg: dict, coins: dict[str, bool], markets: dict[str, dict[str, str]], src: Any, *,
                 dry_run: bool, services: "Services") -> None:
    """One Run transaction for an hour with changes: the step is re-run on the state the transaction loaded."""
    from traderec.pipeline import Run

    label = rules.hour_label(stamp)
    run = Run(cfg, provider, state_dir, "hourly", stamp.strftime("%Y-%m-%d"), dry_run=dry_run, services=services)
    run.key, run.result = key, result
    try:
        if not run.begin():
            return
        book = _book(run.state, "M6", M6_BOOK)
        changes = rules.depeg_step(book, quotes, stamp, dcfg, run.current_nav(), coins, markets=markets)
        for change in changes:
            alert = change.pop("alert", None)
            run.log("shadow", {"book": "M6", "hour": label, **change})
            run.note(_describe(change))
            if alert:
                run.alert("data", alert)
        _add_sources(run, src)
        run.finish("ok", {"hour": label, "events": [c["event"] for c in changes]})
    finally:
        run.close()


def _depeg_markets(dcfg: dict, state: dict) -> tuple[dict[str, bool], dict[str, dict[str, str]]]:
    """{coin: eligible} and {coin: {venue: symbol}}: the configured coins, then watch-only coins, then the coins of
    open events (so an event still closes after its coin leaves the config)."""
    coins: dict[str, bool] = {}
    markets: dict[str, dict[str, str]] = {}
    for section, eligible in (("coins", True), ("watch_only", False)):
        for coin, venues in (dcfg.get(section) or {}).items():
            if str(coin) not in coins:
                coins[str(coin)] = eligible
                markets[str(coin)] = {str(v): str(s) for v, s in (venues or {}).items()}
    for ev in ((state.get("shadow") or {}).get("M6") or {}).get("events", []):
        if ev.get("kind") == "depeg" and ev.get("status") == "open" and ev.get("coin") not in markets:
            coins[ev["coin"]] = bool(ev.get("eligible"))
            markets[ev["coin"]] = dict(ev.get("markets") or {})
    return coins, markets


def _quote_notes(quotes: dict, errors: dict, dcfg: dict) -> list[str]:
    """One line per coin for the job log, e.g. "USDC: coinbase 0.9998, gemini 0.9999, kraken 0.9999"."""
    notes = []
    for coin in sorted(quotes):
        chk = rules.depeg_check(quotes[coin] or {}, dcfg)
        prices = ", ".join(f"{v} {p:.4f}" for v, p in sorted(chk["prices"].items()))
        notes.append(f"{coin}: {prices or 'no usable book'}")
    if errors:
        notes.append("unavailable: " + ", ".join(sorted(errors)))
    return notes


def _describe(change: dict) -> str:
    event, coin = change.get("event"), change.get("coin")
    if event == "depeg_open":
        return (f"M6 depeg {coin}: shadow buy at {change['entry_price']:.4f} "
                f"({', '.join(change['venues_below'])} at or below the trigger)")
    if event == "depeg_low":
        return f"M6 depeg {coin}: new low {change['low']:.4f}"
    if event == "depeg_close":
        return (f"M6 depeg {coin}: closed ({change['exit_reason']}) at {change['exit_price']:.4f}, "
                f"{change['return']:+.2%}")
    if event == "unconfirmed_start":
        return f"M6 {coin}: {change['reason']}"
    return f"M6 {coin}: no longer at or below the trigger"
