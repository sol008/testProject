"""Run orchestration: the daily (22:17 ET), weekly (Sunday night ET) and monthly jobs.

A run is one transaction over `state/`:

1. load the state and the ledger; refuse to repeat a completed run (idempotent per kind and date);
2. daily only: credit dividends, fill yesterday's orders at today's open (fill model v1.0), accrue
   T-bill interest on cash, mark the book at today's close;
3. evaluate the modules on verified data and size any new trade through the risk engine;
4. for each decision: record it in the ledger *before* anything is sent (pre-registration), render the
   email, validate every number, open a GitHub issue for recording the fill, queue the paper orders;
5. save the state, then send the emails (Gmail, or `.eml` files in `state/outbox/` in dry-run mode).

Dry runs work on a temporary copy of the state and ledger, so they never change `state/`.
Design: research/00-SYSTEM-DESIGN-v3.md (§3 rules, §3a execution, §4 portfolio rules, §10 schedule).
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import pandas as pd

from . import __version__
from . import emails as email_mod
from . import facts as facts_mod
from . import feedback
from . import forecasts as fc
from . import notify, risk, runners, validator
from .broker import PaperBroker
from .config import STATE_DIR, Config
from .data import verify_close
from .ledger import Ledger
from .market_calendar import is_trading_day, iso, latest_session, latest_sunday, next_trading_day, today_et
from .modules.m1_dipbuy import m1_entry_check, m1_exit_check
from .modules.m2_trend import m2_orders, m2_signals, m2_targets
from .modules.m3_btc import btc_weekly_switch
from .modules.shadow import st1b_entry_check
from .modules.w10_crashbuy import w10_exit_check, w10_exit_date, w10_kill_check, w10_signal
from .options import job as options_job
from .state import RETRYABLE, Paths, copy_tree, jsonable, load_state, new_state, save_state
from .types import Fill, OrderIntent, Recommendation, RenderedEmail

CRUDE_MONTH_CODES = "FGHJKMNQUVXZ"


class RunError(RuntimeError):
    """A run could not proceed (bad arguments or inconsistent state)."""


class DataMissing(RuntimeError):
    """Today's session data is not available yet; the run is retryable."""


@dataclass
class Services:
    """Side-effecting services, injectable for tests."""

    send: Callable[..., dict] = notify.send
    create_issue: Callable[..., str | None] = notify.create_issue
    healthcheck: Callable[[str], None] = notify.healthcheck
    fetch_comments: Callable[[str], list[str] | None] = feedback.fetch_comments


@dataclass
class RunResult:
    kind: str
    date: str
    status: str
    dry_run: bool = False
    notes: list[str] = field(default_factory=list)
    emails: list[dict] = field(default_factory=list)
    fills: list[dict] = field(default_factory=list)
    nav: float | None = None

    def summary(self) -> str:
        lines = [f"{self.kind} {self.date}: {self.status}" + (" (dry run)" if self.dry_run else "")]
        if self.nav is not None:
            lines.append(f"  NAV ${self.nav:,.2f}")
        for f in self.fills:
            lines.append(f"  fill: {f['side']} {f['qty']:.4f} {f['ticker']} @ {f['price']:.4f} ({f['module']})")
        for e in self.emails:
            lines.append(f"  email: {e['subject']} -> {e.get('outcome')}")
        for n in self.notes:
            lines.append(f"  note: {n}")
        return "\n".join(lines)


# ----------------------------------------------------------------------------------------------------
# init
# ----------------------------------------------------------------------------------------------------

def run_init(cfg: Config, state_dir: Path | None = None, *, nav: float | None = None,
             created: str | None = None, if_missing: bool = False) -> RunResult:
    """Create `state/state.json` and an empty ledger. M2 makes its first decision next month (§11)."""
    paths = Paths(Path(state_dir or STATE_DIR))
    created = created or iso(today_et())
    if paths.state.exists():
        if if_missing:
            return RunResult("init", created, "exists")
        raise RunError(f"{paths.state} already exists; delete it to start over")
    if nav is not None:
        cfg = _scaled_accounts(cfg, nav)
    broker = PaperBroker.new(cfg)
    # M2 decides at the first close of each month; the launch month counts as decided (design §11).
    state = new_state(created=created, mode=cfg.mode, constitution_version=cfg.version,
                      broker_state=broker.to_state(), m2_first_month=created[:7])
    ledger = Ledger(paths.ledger)
    rec = ledger.append("run_manifest", jsonable({
        "kind": "init", "created": created, "code_version": __version__,
        "constitution_version": cfg.version, "constitution_sha256": cfg.constitution_sha256,
        "accounts": {a: v.get("start_cash") for a, v in cfg.account["accounts"].items()},
        "mode": cfg.mode, "git_sha": _git_sha(),
    }), as_of=created, constitution_version=cfg.version)
    state["counters"]["ledger_seq"] = rec["seq"]
    state["counters"]["ledger_head"] = rec["hash"]
    state["runs"][f"init:{created}"] = {"status": "ok", "at": _utc_now(), "run_seq": 0}
    save_state(paths.state, state)
    return RunResult("init", created, "ok", notes=[f"state created at {paths.root}"])


def _scaled_accounts(cfg: Config, nav: float) -> Config:
    """Scale every account's start_cash so that they sum to `nav`."""
    accounts = {k: dict(v) for k, v in cfg.account["accounts"].items()}
    total = sum(float(v.get("start_cash", 0) or 0) for v in accounts.values()) or 1.0
    for v in accounts.values():
        v["start_cash"] = round(float(v.get("start_cash", 0) or 0) * nav / total, 2)
    account = dict(cfg.account, accounts=accounts, paper_notional=nav)
    return Config(account=account, constitution=cfg.constitution, whitelist=cfg.whitelist,
                  constitution_sha256=cfg.constitution_sha256)


# ----------------------------------------------------------------------------------------------------
# The run transaction
# ----------------------------------------------------------------------------------------------------

class Run:
    """One daily/weekly/monthly run over the state directory."""

    def __init__(self, cfg: Config, provider: Any, state_dir: Path | None, kind: str, date: str, *,
                 dry_run: bool = False, force: bool = False, services: Services | None = None) -> None:
        self.cfg = cfg
        self.provider = provider
        self.kind = kind
        self.date = date
        self.dry_run = dry_run
        self.force = force
        self.services = services or Services()
        self.real = Paths(Path(state_dir or STATE_DIR))
        if not self.real.state.exists():
            raise RunError(f"no state at {self.real.state}; run `python -m traderec init` first")
        self._tmp: tempfile.TemporaryDirectory | None = None
        if dry_run:
            self._tmp = tempfile.TemporaryDirectory(prefix="traderec-dry-")
            copy_tree(self.real.root, Path(self._tmp.name))
            self.paths = Paths(Path(self._tmp.name))
        else:
            self.paths = self.real
        self.state = load_state(self.paths.state)
        self.ledger = Ledger(self.paths.ledger)
        self.broker = PaperBroker.from_state(self.state["broker"], cfg)
        self.key = f"{kind}:{date}"
        self.asof = date if len(date) == 10 else _month_asof(date)   # last date whose data may be used
        self.result = RunResult(kind, date, "running", dry_run=dry_run)
        self.outgoing: list[tuple[RenderedEmail, dict]] = []
        self.first_seq: int | None = None
        self.sources: set[str] = set()
        self.tbill: float | None = None
        self._bars: dict[str, pd.DataFrame] = {}
        self.blocked = False

    # --- bookkeeping ------------------------------------------------------------------------------

    def note(self, msg: str) -> None:
        self.result.notes.append(msg)

    def alert(self, kind: str, msg: str) -> None:
        self.note(f"ALERT {kind}: {msg}")
        self.state.setdefault("alerts", []).append({"date": self.date, "run": self.key, "kind": kind,
                                                    "message": msg})

    def log(self, record_type: str, payload: dict) -> dict:
        rec = self.ledger.append(record_type, jsonable(payload), as_of=self.date,
                                 constitution_version=self.cfg.version)
        if self.first_seq is None:
            self.first_seq = rec["seq"]
        return rec

    def _last_ledger_seq(self) -> int:
        last = 0
        for r in self.ledger.records():
            last = int(r["seq"])
        return last

    def _check_ledger(self, committed: int) -> int:
        """Verify the hash chain and that the record the state last committed is still there, unchanged.

        The chain alone cannot detect lines deleted from the end, so the state keeps the committed head.
        Returns the ledger's last seq.
        """
        ok, why = self.ledger.verify()
        if not ok:
            raise RunError(f"ledger verification failed: {why}")
        want = self.state["counters"].get("ledger_head")
        last, found = 0, None
        for r in self.ledger.records():
            last = int(r["seq"])
            if last == committed:
                found = r["hash"]
        if committed and found is None:
            raise RunError(f"ledger is shorter than the state expects (seq {committed} missing)")
        if want and found != want:
            raise RunError("ledger head does not match the state: the ledger was edited or truncated")
        return last

    def begin(self) -> bool:
        """Reconcile the ledger, apply idempotency and snapshot the pre-run state. False = skip the run."""
        committed = int(self.state["counters"].get("ledger_seq", 0))
        last = self._check_ledger(committed)
        if last > committed:
            self.log("correction", {"reason": "records from a run that did not complete (state not saved)",
                                    "orphaned_seq": [committed + 1, last]})
        prev = self.state["runs"].get(self.key)
        if prev is not None and prev.get("status") not in RETRYABLE:
            if not self.force:
                self.result.status = "already_done"
                self.note(f"{self.key} already ran ({prev.get('status')}); use --force to re-run it")
                if last > committed and not self.dry_run:
                    self.state["counters"]["ledger_seq"] = self._last_ledger_seq()
                    self.state["counters"]["ledger_head"] = self.ledger.head()
                    save_state(self.paths.state, self.state)
                return False
            self._restore_for_force(prev)
        if not self.dry_run:
            save_state(self.paths.pre_run, {"key": self.key, "state": self.state})
        self.state["counters"]["run_seq"] = int(self.state["counters"].get("run_seq", 0)) + 1
        return True

    def _restore_for_force(self, prev: dict) -> None:
        latest = max(self.state["runs"].items(), key=lambda kv: kv[1].get("run_seq", 0))[0]
        if latest != self.key:
            raise RunError(f"--force can only re-run the most recent run ({latest}), not {self.key}")
        pre = self.paths.pre_run
        snap = json.loads(pre.read_text(encoding="utf-8")) if pre.exists() else {}
        if snap.get("key") != self.key:
            raise RunError(f"no pre-run snapshot of {self.key} to restore for a forced re-run")
        self.state = snap["state"]
        self.broker = PaperBroker.from_state(self.state["broker"], self.cfg)
        self.log("correction", {"reason": "forced re-run; the earlier run's records are superseded",
                                "run": self.key, "superseded_seq": prev.get("ledger_seq")})

    def finish(self, status: str, extra: dict | None = None) -> RunResult:
        """Write the run manifest, save the state, then send the queued emails."""
        self.result.status = status
        self.state["broker"] = self.broker.to_state()
        manifest = {
            "kind": self.kind, "date": self.date, "status": status, "dry_run": self.dry_run,
            "code_version": __version__, "git_sha": _git_sha(),
            "constitution_version": self.cfg.version, "constitution_sha256": self.cfg.constitution_sha256,
            "fill_model": self.cfg.fills["model_version"], "tbill_rate": self.tbill,
            "sources": self.all_sources(), "notes": self.result.notes,
            "emails": [e.subject for e, _ in self.outgoing], **(extra or {}),
        }
        rec = self.log("run_manifest", manifest)
        self.state["counters"]["ledger_seq"] = rec["seq"]
        self.state["counters"]["ledger_head"] = rec["hash"]
        self.state["runs"][self.key] = {
            "status": status, "at": _utc_now(), "run_seq": self.state["counters"]["run_seq"],
            "ledger_seq": [self.first_seq, rec["seq"]], "notes": self.result.notes[-20:],
        }
        if not self.dry_run:
            save_state(self.paths.state, self.state)
        self._send_all()
        if not self.dry_run:
            save_state(self.paths.state, self.state)
        return self.result

    def close(self) -> None:
        if self._tmp is not None:
            self._tmp.cleanup()

    # --- data -------------------------------------------------------------------------------------

    def bars(self, ticker: str) -> pd.DataFrame:
        """Daily bars up to and including the run date (never later: no look-ahead)."""
        if ticker not in self._bars:
            df = self.provider.daily_bars(ticker)
            self._bars[ticker] = df.loc[: pd.Timestamp(self.asof)]
        return self._bars[ticker]

    def all_sources(self) -> list[str]:
        provider_sources = getattr(self.provider, "sources", None) or {}
        return sorted(self.sources | {str(v).split(":")[0] for v in provider_sources.values()})

    def close_on(self, ticker: str, day: str) -> float | None:
        df = self.bars(ticker)
        ts = pd.Timestamp(day)
        if ts in df.index and not pd.isna(df.at[ts, "close"]):
            return float(df.at[ts, "close"])
        return None

    def get_tbill(self) -> float:
        if self.tbill is None:
            try:
                self.tbill = float(self.provider.tbill_rate())
            except Exception as exc:  # noqa: BLE001 - fall back per design §10 data rules
                self.tbill = float(self.cfg.data["fallback_tbill_rate"])
                self.note(f"T-bill rate unavailable ({type(exc).__name__}); using {self.tbill:.4f}")
        return self.tbill

    # --- emitting a decision ----------------------------------------------------------------------

    def next_intent_id(self, module: str) -> str:
        self.state["counters"]["intent_seq"] = int(self.state["counters"].get("intent_seq", 0)) + 1
        return f"O-{self.date}-{module}-{self.state['counters']['intent_seq']:04d}"

    def trades_this_year(self) -> int:
        return int(self.state["counters"]["trades"].get(self.date[:4], 0))

    def count_trade(self) -> None:
        yr = self.date[:4]
        self.state["counters"]["trades"][yr] = self.trades_this_year() + 1

    def budget_ok(self) -> bool:
        cap = int(self.cfg.risk["trade_budget_per_year"])
        if self.trades_this_year() >= cap:
            self.alert("budget", f"trade budget of {cap} a year reached; new entries blocked")
            return False
        if self.open_position_count() >= int(self.cfg.risk["max_open_positions"]):
            self.alert("positions", "maximum open positions reached; new entries blocked")
            return False
        return True

    def open_position_count(self) -> int:
        mods = self.state["modules"]
        n = sum(1 for m in ("M1", "M3", "W10", "M4", "W8", "W9") if (mods.get(m) or {}).get("open_trade"))
        if self.broker.positions(module="M2") or any(o.module == "M2" for o in self.broker.pending()):
            n += 1
        return n

    def emit(self, rec: Recommendation, *, ctx_extra: dict | None = None, forecasts: bool = True) -> bool:
        """Pre-register, render, validate, open an issue and queue the orders. False = blocked."""
        rec.forecasts = fc.make_forecasts(rec, self.cfg) if forecasts else []
        rec_record = self.log("recommendation", rec.to_dict())
        ctx = self.email_ctx(rec, rec_record["hash"], ctx_extra)
        email = email_mod.render(rec, ctx)
        errors = validator.validate(email)
        if errors:
            self.log("correction", {"blocked_trade": rec.trade_id, "reason": "validator", "errors": errors})
            self.alert("validator", f"{rec.trade_id} {rec.kind} blocked: {errors[:3]}")
            self.blocked = True
            return False
        if not self.dry_run and self.cfg.account.get("github_issues", False):
            spread = any(o.order_type == "spread_limit" for o in rec.orders)
            url = self.services.create_issue(_issue_title(email.subject), _issue_body(email.text, spread=spread),
                                             labels=["traderec", self.cfg.mode, rec.module])
            if url:
                ctx["issue_url"] = url
                with_url = email_mod.render(rec, ctx)
                if not validator.validate(with_url):
                    email = with_url
                self.state.setdefault("issues", []).append({
                    "url": url, "trade_id": rec.trade_id, "kind": rec.kind, "module": rec.module,
                    "date": self.date, "tickers": sorted({o.ticker for o in rec.orders}),
                    "intents": [o.intent_id for o in rec.orders]})
        for order in rec.orders:
            self.broker.queue(order)
            self.log("order", order.to_dict())
        for f in rec.forecasts:
            self.log("forecast", f)
            self.state["forecasts"]["open"].append(dict(f, created=self.date))
        email.meta.setdefault("trade_id", rec.trade_id)
        email.meta.setdefault("kind", rec.kind)
        self.outgoing.append((email, {"trade_id": rec.trade_id, "kind": rec.kind,
                                      "expires": self.order_deadline()}))
        return True

    def order_deadline(self) -> str:
        """Orders in tonight's email are for the next session's 9:30 ET open."""
        return iso(next_trading_day(self.date))

    def email_ctx(self, rec: Recommendation, ledger_head: str, extra: dict | None) -> dict:
        nav = self.current_nav()
        ctx = {
            "mode": self.cfg.mode, "nav": nav,
            "portfolio_after": facts_mod.portfolio_after(self, rec.orders),
            "ledger_head": ledger_head, "issue_url": None, "data_asof": self.date,
            "sources": self.all_sources(), "constitution_version": self.cfg.version,
            "next_session": self.order_deadline(),
        }
        ctx.update(extra or {})
        return ctx

    def _send_all(self) -> None:
        for email, meta in self.outgoing:
            try:
                res = self.services.send(email, dry_run=self.dry_run, outbox=self.real.outbox)
            except Exception as exc:  # noqa: BLE001 - a send failure must not lose the run
                res = {"sent": False, "reason": f"{type(exc).__name__}"}
            reason = str(res.get("reason") or "")
            if res.get("sent"):
                outcome = "sent"
            elif reason.startswith(("dry_run", "dry run", "missing credentials")):
                outcome = "outbox"       # dry run, or Gmail not set up yet: the .eml is in state/outbox/
            else:
                outcome = "failed"       # a real send that failed (an outbox copy may still exist)
            entry = {"subject": email.subject, "outcome": outcome, "reason": res.get("reason"),
                     "path": res.get("path"), **meta}
            self.result.emails.append(entry)
            if outcome == "failed":
                self.alert("email", f"send failed for {meta.get('trade_id')}: {res.get('reason')}")
                self.state["outbox"].append({"email": jsonable(email.__dict__), **meta})
        self.state["runs"][self.key]["emails"] = [
            {k: e.get(k) for k in ("subject", "outcome", "trade_id", "kind")} for e in self.result.emails]

    def retry_unsent(self) -> None:
        """Retry emails that failed earlier, while their orders are still actionable."""
        keep = []
        for item in self.state.get("outbox", []):
            if item.get("expires", "") <= self.date:
                self.alert("email", f"unsent email expired: {item.get('trade_id')}")
                continue
            keep.append(item)
        self.state["outbox"] = []
        for item in keep:
            email = RenderedEmail(**item["email"])
            self.outgoing.append((email, {k: v for k, v in item.items() if k != "email"}))

    # --- book helpers -----------------------------------------------------------------------------

    def current_nav(self) -> float:
        marks = self.state.get("marks") or []
        if marks:
            return float(marks[-1]["nav"])
        return float(sum(self.broker.cash(a) for a in self._accounts()))

    def current_drawdown(self) -> float:
        marks = self.state.get("marks") or []
        return float(marks[-1]["drawdown"]) if marks else 0.0

    def _accounts(self) -> list[str]:
        return [a for a, v in self.cfg.account["accounts"].items() if v.get("enabled", True) is not False]

    def last_close(self, ticker: str) -> float | None:
        df = self.bars(ticker)
        return float(df["close"].iloc[-1]) if len(df) else None

    def position_values(self) -> dict[str, float]:
        values: dict[str, float] = {}
        for p in self.broker.positions():
            px = self.last_close(p["ticker"])
            key = f"{p['account']}|{p['ticker']}|{p['module']}"
            values[key] = (self.broker.market_value(p["account"], p["ticker"], p["module"], px)
                           if px else float(p["cost"]))
        values["__nav__"] = self.current_nav()
        return values

    def stress(self, extra: tuple[str, ...] = ()) -> dict[str, float]:
        """The stress table for the held tickers, the pending buys' tickers and `extra`.

        `open_stress` counts each pending ETF buy (M2's aside) at its ticker's stress, as if it filled tonight; a
        ticker missing from the table would count at risk.MISSING_STRESS (100%), e.g. W10's SPY buy while no lot
        holds SPY. Spread orders count at their stated maximum debit instead, and option roots have no bars.
        """
        pending = {o.ticker for o in self.broker.pending()
                   if o.side == "buy" and o.order_type != "spread_limit" and o.module != "M2"}
        tickers = {p["ticker"] for p in self.broker.positions()} | pending | set(extra)
        return risk.stress_table({t: self.bars(t)["close"] for t in sorted(tickers)}, self.cfg)

    def open_stress(self, stress: dict[str, float]) -> dict:
        """Open stress including open spreads and tonight's pending buys (design §4 "Clusters": a later signal
        takes the room that is left in the US-equity reserve)."""
        return risk.open_stress(self.broker.positions(), self.position_values(), stress, self.cfg,
                                spreads=self.broker.spreads(), pending=self.broker.pending())

    def admit(self, module: str, ticker: str, dollars: float) -> dict:
        stress = self.stress((ticker,))
        adm = risk.admit(module, ticker, dollars, self.open_stress(stress), stress, self.cfg,
                         self.current_drawdown())
        adm["stress"] = stress.get(ticker)
        return adm


# ----------------------------------------------------------------------------------------------------
# daily
# ----------------------------------------------------------------------------------------------------

def run_daily(cfg: Config, provider: Any, state_dir: Path | None = None, *, date: str | None = None,
              dry_run: bool = False, force: bool = False, services: Services | None = None) -> RunResult:
    day = date or iso(latest_session())
    run = Run(cfg, provider, state_dir, "daily", day, dry_run=dry_run, force=force, services=services)
    try:
        if not run.begin():
            return run.result
        if not dry_run:
            run.services.healthcheck("start")
        try:
            status = _daily(run)
        except DataMissing as exc:
            run.alert("data", str(exc))
            result = run.finish("data_missing")
            if not dry_run:
                run.services.healthcheck("fail")
            return result
        result = run.finish(status)
        if not dry_run:
            run.services.healthcheck("fail" if run.blocked or _email_failed(result) else "success")
        return result
    except Exception:
        if not dry_run:
            run.services.healthcheck("fail")
        raise
    finally:
        run.close()


def _daily(run: Run) -> str:
    d = run.date
    ts = pd.Timestamp(d)
    spy = run.bars("SPY")
    if ts not in spy.index:
        if not is_trading_day(d):
            run.note("no session today (weekend or NYSE holiday)")
            return "no_session"
        raise DataMissing(f"no SPY bar for {d} yet")
    run.retry_unsent()
    sessions = spy.index

    _credit_dividends(run, sessions)
    _fill_pending(run, sessions)
    rate = run.get_tbill()
    interest = run.broker.accrue_interest(run.state.get("last_accrual") or d, d, rate)
    run.state["last_accrual"] = d
    options_job.mark_spreads(run)              # Phase B: open spreads at tonight's closing quotes
    mark = _mark(run)
    run.result.nav = mark["nav"]

    checks = _snapshot(run)
    _m1(run, checks)
    _w10(run, checks)
    runners.m4.daily(run, checks)              # Phase B: M4 crash call spread (after M1 and W10 in the reserve)
    _m2(run)
    _m3(run, asof_utc=iso(pd.Timestamp(d) + timedelta(days=1)))
    runners.macro.daily(run, checks)           # Phase B: W8 / W9 macro-event spreads
    _shadow(run, checks.get("vix_series"))
    for name in runners.SHADOW_RUNNERS:        # Phase B shadow books: guarded, never stop the run
        _shadow_guard(run, name, getattr(runners, name).daily, checks)
    _resolve_dated_forecasts(run)
    _drawdown_alerts(run, mark)
    run.state["last_daily"] = d
    run.note(f"interest credited ${interest:,.2f} at {rate:.4f}")
    return "ok"


def _shadow_guard(run: Run, name: str, fn: Callable[..., None], *args: Any) -> None:
    """Run a shadow book; an exception becomes an alert and a ledger record instead of a failed run."""
    try:
        fn(run, *args)
    except Exception as exc:  # noqa: BLE001 - a shadow book (no emails, no orders) must never stop the run
        run.alert("shadow", f"{name} failed: {type(exc).__name__}: {exc}")
        run.log("shadow", {"book": name, "event": "error", "error": f"{type(exc).__name__}: {exc}"})


def _email_failed(result: RunResult) -> bool:
    return any(e.get("outcome") == "failed" for e in result.emails)


def _credit_dividends(run: Run, sessions: pd.DatetimeIndex) -> None:
    """Credit cash dividends on ex-dates since the last daily run, on holdings before today's fills.

    The per-share amount is inferred from the adj_close/close ratio: yfinance scales history before an
    ex-date t by (1 - d / close[t-1]), so d = close[t-1] * (1 - f[t-1] / f[t]) with f = adj_close / close.
    """
    last = run.state.get("last_daily")
    held = sorted({p["ticker"] for p in run.broker.positions()})
    if not held or last is None:
        return
    for t in held:
        df = run.bars(t)
        if len(df) < 2:
            continue
        f = df["adj_close"] / df["close"]
        window = df.index[(df.index > pd.Timestamp(last)) & (df.index <= pd.Timestamp(run.date))]
        for day in window:
            i = df.index.get_loc(day)
            if i == 0:
                continue
            prev_close = float(df["close"].iloc[i - 1])
            per_share = prev_close * (1.0 - float(f.iloc[i - 1]) / float(f.iloc[i]))
            if per_share / prev_close <= 1e-4:
                continue
            amount = run.broker.apply_dividend(iso(day), t, per_share)
            if amount > 0:
                run.state["dividends"].append({"date": iso(day), "ticker": t, "per_share": per_share,
                                               "amount": amount})
                run.log("fill", {"type": "dividend", "ticker": t, "ex_date": iso(day),
                                 "per_share": per_share, "amount": amount})
                run.note(f"dividend {t} ${per_share:.4f}/share = ${amount:,.2f}")


def _fill_pending(run: Run, sessions: pd.DatetimeIndex) -> None:
    """Fill queued orders at the first session after their creation date (catching up missed runs)."""
    # Spread orders fill in the 10:17 ET options job, never at an open: no bars are fetched for option roots.
    pending = [o for o in run.broker.pending() if o.order_type != "spread_limit"]
    if not pending:
        return
    by_session: dict[str, set[str]] = {}
    for o in pending:
        after = sessions[sessions > pd.Timestamp(o.created_date)]
        if len(after):
            by_session.setdefault(iso(after[0]), set()).add(o.ticker)
    for session in sorted(by_session):
        opens = {}
        for t in by_session[session]:
            df = run.bars(t)
            ts = pd.Timestamp(session)
            if ts in df.index and not pd.isna(df.at[ts, "open"]):
                opens[t] = float(df.at[ts, "open"])
        before = {o.intent_id: o for o in run.broker.pending()}
        fills = run.broker.fill_pending(session, opens)
        still = {o.intent_id for o in run.broker.pending()}
        for fill in fills:
            _on_fill(run, fill, before.get(fill.intent_id))
        for iid, intent in before.items():
            if iid not in still and iid not in {f.intent_id for f in fills}:
                _on_cancel(run, intent)


def _on_fill(run: Run, fill: Fill, intent: OrderIntent | None) -> None:
    meta = dict(getattr(run.broker, "last_fill_meta", {}).get(fill.intent_id, {}))
    run.log("fill", {**fill.to_dict(), **meta})
    run.state.setdefault("fills", []).append({k: getattr(fill, k) for k in (
        "intent_id", "trade_id", "module", "ticker", "side", "price", "dollars", "fill_date")})
    run.result.fills.append(fill.to_dict())
    if meta.get("partial"):
        run.alert("fill", f"{fill.intent_id} partly filled: ${fill.dollars:,.2f} of "
                          f"${meta.get('requested_dollars', 0):,.2f} (cash)")
    mod = run.state["modules"].get(fill.module)
    if fill.module in ("M1", "M3", "W10") and mod is not None:
        ot = mod.get("open_trade")
        if ot is None or ot.get("trade_id") != fill.trade_id:
            return
        if fill.side == "buy":
            ot.update(status="open", fill_date=fill.fill_date, entry_price=fill.price,
                      qty=fill.qty, dollars=fill.dollars)
            if fill.module == "W10":
                ot["exit_date"] = w10_exit_date(fill.fill_date, run.cfg.module("W10")["max_calendar_days"])
        else:
            _close_trade(run, fill.module, ot, fill, meta)
            if fill.module == "W10":
                _w10_kill_switch(run)


def _close_trade(run: Run, module: str, ot: dict, fill: Fill, meta: dict) -> None:
    entry = float(ot.get("entry_price") or 0.0)
    ret = fill.price / entry - 1.0 if entry else None
    result = {
        "trade_id": ot["trade_id"], "module": module, "entry_date": ot.get("fill_date"),
        "entry_price": entry, "exit_date": fill.fill_date, "exit_price": fill.price,
        "return": ret, "pnl": meta.get("realized_pnl"), "exit_reason": ot.get("exit_reason"),
        "profit": bool(ret is not None and ret > 0),
    }
    _resolve_trade(run, ot["trade_id"], result)
    run.state["modules"][module]["history"].append(result)
    run.state["modules"][module]["open_trade"] = None
    run.log("resolution", {"trade": result})


def _resolve_trade(run: Run, trade_id: str, result: dict) -> None:
    open_fc = run.state["forecasts"]["open"]
    mine = [f for f in open_fc if f.get("trade_id") == trade_id and f.get("resolves") == "on_exit"]
    if not mine:
        return
    resolved = fc.resolve_trade_forecasts(mine, result)
    ids = {f["forecast_id"] for f in mine}
    run.state["forecasts"]["open"] = [f for f in open_fc if f["forecast_id"] not in ids]
    for f in resolved:
        f["resolved_date"] = run.date
        run.state["forecasts"]["resolved"].append(f)
        run.log("resolution", {"forecast": f})


def _on_cancel(run: Run, intent: OrderIntent) -> None:
    run.alert("fill", f"{intent.intent_id} {intent.side} {intent.ticker} cancelled (no open price)")
    run.log("correction", {"cancelled_order": intent.to_dict()})
    mod = run.state["modules"].get(intent.module)
    if mod and mod.get("open_trade") and mod["open_trade"].get("trade_id") == intent.trade_id:
        if intent.side == "buy":
            mod["open_trade"] = None
        else:
            mod["open_trade"]["status"] = "open"   # the exit will be re-signalled tonight


def _mark(run: Run) -> dict:
    closes = {}
    for p in run.broker.positions():
        px = run.close_on(p["ticker"], run.date)
        if px is not None:
            closes[p["ticker"]] = px
    mark = run.broker.mark(run.date, closes)
    spy_close = run.close_on("SPY", run.date)
    prev = (run.state.get("marks") or [None])[-1]
    run.state["marks"].append({"date": run.date, "nav": mark["nav"], "drawdown": mark["drawdown"],
                               "peak": mark["peak"], "spy_close": spy_close,
                               "spy_adj": float(run.bars("SPY")["adj_close"].iloc[-1])})
    run.log("mark", mark)
    if prev and prev.get("nav"):
        day_ret = mark["nav"] / float(prev["nav"]) - 1.0
        if day_ret <= -0.02:
            run.alert("circuit", f"daily loss {day_ret:.2%} (circuit breaker applies to discretionary "
                                 "entries only; none exist in Phase A)")
    return mark


def _drawdown_alerts(run: Run, mark: dict) -> None:
    gov = run.cfg.risk["governor"]
    dd = float(mark["drawdown"])
    if dd >= float(gov["pause_discretionary_at"]):
        run.alert("drawdown", f"drawdown {dd:.1%}: discretionary entries paused; M2 may not raise gross")
    elif dd >= float(gov["review_at"]):
        run.alert("drawdown", f"drawdown {dd:.1%}: human review due (design §4)")


def _snapshot(run: Run) -> dict:
    """Hash the inputs and run the two-source checks (fail closed for new entries)."""
    d = run.date
    tol = float(run.cfg.data["two_source_tolerance"])
    spy = run.bars("SPY")
    spy_check = verify_close(run.provider, spy, "SPY", d, tol)
    if spy_check.get("source"):
        run.sources.add(f"{spy_check['source']} (second source)")
    vix_value, vix_info = _vix_close(run, d)
    snap = {
        "date": d, "SPY": _row(spy, d), "VIX": vix_value,
        "vix_check": {k: v for k, v in vix_info.items() if k != "series"},
        "spy_check": spy_check, "tbill_rate": run.tbill,
        "inputs_sha256": {"SPY": _frame_hash(spy.tail(260))},
    }
    run.log("snapshot", snap)
    if not spy_check.get("ok"):
        run.note(f"SPY two-source check failed: {spy_check.get('reason')} (new M1 entries blocked)")
    return {"spy_ok": bool(spy_check.get("ok")), "vix": vix_value, "vix_ok": vix_info["ok"],
            "vix_series": vix_info.get("series")}


def _vix_close(run: Run, d: str) -> tuple[float | None, dict]:
    """CBOE official VIX close, cross-checked against Yahoo's ^VIX (1% tolerance)."""
    ts = pd.Timestamp(d)
    cboe = None
    series = None
    try:
        series = run.provider.vix("VIX")
        series = series.loc[:ts]
        if ts in series.index:
            cboe = float(series.loc[ts])
    except Exception as exc:  # noqa: BLE001
        run.note(f"CBOE VIX unavailable: {type(exc).__name__}")
    yahoo = None
    try:
        vb = run.bars("^VIX")
        if ts in vb.index:
            yahoo = float(vb.at[ts, "close"])
    except Exception as exc:  # noqa: BLE001
        run.note(f"Yahoo ^VIX unavailable: {type(exc).__name__}")
    value = cboe if cboe is not None else yahoo
    ok = value is not None and (cboe is None or yahoo is None or abs(cboe / yahoo - 1.0) <= 0.01)
    if series is None or ts not in series.index:
        if value is not None:
            base = series if series is not None else pd.Series(dtype=float)
            series = pd.concat([base, pd.Series([value], index=[ts])])
            series = series[~series.index.duplicated(keep="last")].sort_index()
    return value, {"cboe": cboe, "yahoo": yahoo, "ok": ok, "series": series}


def _row(df: pd.DataFrame, d: str) -> dict:
    ts = pd.Timestamp(d)
    if ts not in df.index:
        return {}
    r = df.loc[ts]
    return {k: float(r[k]) for k in ("open", "high", "low", "close", "adj_close") if k in r}


def _frame_hash(df: pd.DataFrame) -> str:
    import hashlib
    return hashlib.sha256(df.round(6).to_csv().encode()).hexdigest()


# --- M1 ------------------------------------------------------------------------------------------------

def _m1(run: Run, checks: dict) -> None:
    cfg_m1 = run.cfg.module("M1")
    if not cfg_m1.get("enabled", True):
        return
    st = run.state["modules"]["M1"]
    spy = run.bars("SPY")
    ot = st.get("open_trade")
    if ot and ot.get("status") == "open":
        ex = m1_exit_check(spy, run.date, ot, cfg_m1)
        run.log("signal", {"module": "M1", "check": "exit", "trade_id": ot["trade_id"], **ex})
        if ex.get("exit"):
            intent = OrderIntent(intent_id=run.next_intent_id("M1"), trade_id=ot["trade_id"], module="M1",
                                 account=cfg_m1["account"], ticker=cfg_m1["ticker"], side="sell",
                                 created_date=run.date, reason=str(ex["reason"]), close_all=True)
            rec = Recommendation("EXIT", "M1", ot["trade_id"], run.date, [intent],
                                 facts_mod.m1_exit(run, ot, ex, cfg_m1))
            if run.emit(rec):
                ot.update(status="pending_exit", exit_reason=ex["reason"], exit_signal_date=run.date)
        return
    if ot:
        return   # an entry or exit order is waiting for the next open
    vix = checks.get("vix_series")
    if vix is None or not len(vix):
        run.note("M1 not evaluated: no VIX data")
        return
    chk = m1_entry_check(spy, vix, run.date, cfg_m1)
    run.log("signal", {"module": "M1", "check": "entry", **chk})
    if not chk.get("signal"):
        return
    if not (checks.get("spy_ok") and checks.get("vix_ok")):
        run.alert("data", "M1 signal blocked: two-source check failed (design §3 M1: verified data only)")
        return
    if not run.budget_ok():
        return
    nav = run.current_nav()
    adm = run.admit("M1", cfg_m1["ticker"], float(cfg_m1["notional_pct_nav"]) * nav)
    run.log("signal", {"module": "M1", "check": "admit", **adm})
    if adm.get("ok") and float(adm.get("cluster_overflow") or 0.0) > 0.0:
        run.alert("cluster", f"M1 admitted with priority; the US-equity reserve is exceeded by "
                             f"${float(adm['cluster_overflow']):,.0f} of stress. Design §4 says trim the open W10 "
                             "at the same open (not automated in Phase A)")
    if not adm.get("ok"):
        run.note(f"M1 signal not admitted: {adm.get('binding')} {adm.get('notes')}")
        return
    trade_id = f"T-{run.date}-M1"
    intent = OrderIntent(intent_id=run.next_intent_id("M1"), trade_id=trade_id, module="M1",
                         account=cfg_m1["account"], ticker=cfg_m1["ticker"], side="buy",
                         created_date=run.date, reason="entry", dollars=round(float(adm["dollars"]), 2))
    rec = Recommendation("NEW_TRADE", "M1", trade_id, run.date, [intent],
                         facts_mod.m1_entry(run, chk, adm, cfg_m1))
    if run.emit(rec):
        st["open_trade"] = {"trade_id": trade_id, "status": "pending_entry", "signal_date": run.date,
                            "dollars": intent.dollars, "intent_id": intent.intent_id}
        run.count_trade()


# --- W10: uptrend crash-day buy (policy module, 90-day exception; design v3.3 §3) ------------------------

def _w10_state(run: Run) -> dict:
    return run.state["modules"].setdefault("W10", {"open_trade": None, "history": [], "disabled": None})


def _w10(run: Run, checks: dict) -> None:
    cfg_w = run.cfg.constitution["modules"].get("W10") or {}
    if not cfg_w.get("enabled", False):
        return
    st = _w10_state(run)
    spy = run.bars(cfg_w["ticker"])
    ot = st.get("open_trade")
    if ot and ot.get("status") == "open":
        ex = w10_exit_check(run.date, ot, cfg_w, spy.index)
        if ex["exit"]:
            run.log("signal", {"module": "W10", "check": "exit", "trade_id": ot["trade_id"], **ex})
            intent = OrderIntent(intent_id=run.next_intent_id("W10"), trade_id=ot["trade_id"], module="W10",
                                 account=cfg_w["account"], ticker=cfg_w["ticker"], side="sell",
                                 created_date=run.date, reason="time_stop", close_all=True)
            rec = Recommendation("EXIT", "W10", ot["trade_id"], run.date, [intent],
                                 facts_mod.w10_exit(run, ot, ex, cfg_w))
            if run.emit(rec):
                ot.update(status="pending_exit", exit_reason="calendar_stop", exit_signal_date=run.date)
        return
    if ot:
        return      # the entry or exit order is waiting for tomorrow's open
    try:
        spx = run.bars(cfg_w["index"])
    except Exception as exc:  # noqa: BLE001 - no index data: no signal tonight
        run.note(f"W10 not evaluated: {cfg_w['index']} unavailable ({type(exc).__name__})")
        return
    sig = w10_signal(spx, run.date, cfg_w)
    if sig.get("ret") is not None and sig["ret"] <= float(cfg_w["drop_pct"]) / 2:
        run.log("signal", {"module": "W10", "check": "entry", **sig})     # log the big down days only
    if not sig.get("signal"):
        return
    # Two-source rule: the index close must match a second source, and the rule must hold on both.
    chk = verify_close(run.provider, spx, cfg_w["index"], run.date, float(run.cfg.data["two_source_tolerance"]))
    second = w10_signal(spx, run.date, cfg_w, close_override=chk["secondary"]) if chk.get("secondary") else {}
    if not (chk.get("ok") and second.get("signal")):
        run.alert("data", f"W10 signal not confirmed by a second source ({chk.get('reason')}); logged in the "
                          "shadow ledger only")
        run.log("shadow", {"book": "W10", "event": "unconfirmed_signal", "check": chk, **sig})
        return
    if st.get("disabled"):
        run.note(f"W10 signal logged only: the module is in the shadow ledger ({st['disabled']['reason']})")
        return
    if not run.budget_ok():
        return
    adm = run.admit("W10", cfg_w["ticker"], float(cfg_w["notional_pct_nav"]) * run.current_nav())
    run.log("signal", {"module": "W10", "check": "admit", **adm})
    if not adm.get("ok"):
        run.note(f"W10 signal not admitted: {adm.get('binding')} {adm.get('notes')}")
        return
    trade_id = f"T-{run.date}-W10"
    intent = OrderIntent(intent_id=run.next_intent_id("W10"), trade_id=trade_id, module="W10",
                         account=cfg_w["account"], ticker=cfg_w["ticker"], side="buy", created_date=run.date,
                         reason="entry", dollars=round(float(adm["dollars"]), 2))
    rec = Recommendation("NEW_TRADE", "W10", trade_id, run.date, [intent],
                         facts_mod.w10_entry(run, sig, adm, cfg_w))
    if run.emit(rec):
        st["open_trade"] = {"trade_id": trade_id, "status": "pending_entry", "signal_date": run.date,
                            "dollars": intent.dollars, "intent_id": intent.intent_id}
        run.count_trade()


def _w10_kill_switch(run: Run) -> None:
    st = _w10_state(run)
    if st.get("disabled"):
        return
    reason = w10_kill_check(st.get("history", []), run.current_nav(), run.cfg.module("W10"))
    if reason:
        st["disabled"] = {"date": run.date, "reason": reason}
        run.alert("kill_switch", f"W10 goes back to the shadow ledger: {reason} (design v3.3 §3 W10)")


# --- M2 ------------------------------------------------------------------------------------------------

def _m2(run: Run) -> None:
    cfg_m2 = run.cfg.module("M2")
    if not cfg_m2.get("enabled", True):
        return
    st = run.state["modules"]["M2"]
    month = run.date[:7]
    if any(o.module == "M2" for o in run.broker.pending()):
        return   # a batch is waiting for tomorrow's open
    if (st.get("last_decision_month") or "") < month:
        _m2_decide(run, st, cfg_m2, month)
    elif st.get("month") == month and st.get("deferred"):
        _m2_continue(run, st, cfg_m2)


def _m2_current(run: Run, cfg_m2: dict) -> dict[str, float]:
    cur = {}
    for t in cfg_m2["legs"]:
        pos = run.broker.position(cfg_m2["account"], t, "M2")
        px = run.last_close(t) if pos else None
        cur[t] = run.broker.market_value(cfg_m2["account"], t, "M2", px) if (pos and px) else 0.0
    return cur


def _m2_decide(run: Run, st: dict, cfg_m2: dict, month: str) -> None:
    legs = list(cfg_m2["legs"])
    adj = {t: run.bars(t)["adj_close"] for t in legs}
    sig = m2_signals(adj, run.date, run.get_tbill(), cfg_m2)
    stress = risk.stress_table({t: run.bars(t)["close"] for t in legs}, run.cfg)
    nav = run.current_nav()
    tg = m2_targets(sig, nav, stress, cfg_m2)
    targets = dict(tg["targets"])
    notes = list(tg.get("notes", []))
    veto = _contango_veto(run, cfg_m2)
    if veto.get("veto") and targets.get("USO", 0) > 0:
        targets["USO"] = 0.0
        notes.append(f"USO leg vetoed: crude roll yield {veto['roll_yield']:.1%} a year (R3)")
    elif veto.get("roll_yield") is None:
        notes.append("contango veto not checked: explicit crude months unavailable")
    current = _m2_current(run, cfg_m2)
    if run.current_drawdown() >= float(run.cfg.risk["governor"]["pause_discretionary_at"]):
        gross_now, gross_new = sum(current.values()), sum(targets.values())
        if gross_new > gross_now > 0:
            k = gross_now / gross_new
            targets = {t: v * k for t, v in targets.items()}
            notes.append(f"drawdown pause: targets scaled by {k:.2f} so gross does not rise")
    od = m2_orders(current, targets, cfg_m2)
    trade_id = f"T-{run.date}-M2"
    st.update(last_decision_month=month, month=month, trade_id=trade_id, decided=run.date,
              targets=targets, deferred=[o["ticker"] for o in od.get("deferred", [])], batch=1)
    run.log("signal", {"module": "M2", "check": "monthly", "signals": sig, "targets": targets,
                       "scalers": tg.get("scalers"), "notes": notes, "orders": od, "veto": veto})
    if not od["orders"]:
        run.note("M2 monthly decision: no orders outside the no-trade band")
        return
    if not run.budget_ok():
        return
    rec = _m2_rec(run, st, cfg_m2, od, sig, targets, current, notes)
    if run.emit(rec):
        run.count_trade()
        st["history"].append({"trade_id": trade_id, "date": run.date, "targets": targets,
                              "orders": od["orders"], "deferred": st["deferred"]})


def _m2_continue(run: Run, st: dict, cfg_m2: dict) -> None:
    """Next batch of a month's rebalance: only the legs deferred by the ≤3-orders rule."""
    deferred = list(st.get("deferred") or [])
    current = {t: v for t, v in _m2_current(run, cfg_m2).items() if t in deferred}
    targets = {t: float(st["targets"].get(t, 0.0)) for t in deferred}
    od = m2_orders(current, targets, cfg_m2)
    st["deferred"] = [o["ticker"] for o in od.get("deferred", [])]
    st["batch"] = int(st.get("batch", 1)) + 1
    run.log("signal", {"module": "M2", "check": "continuation", "orders": od, "batch": st["batch"]})
    if od["orders"]:
        rec = _m2_rec(run, st, cfg_m2, od, None, targets, current, [f"batch {st['batch']} of this month"])
        run.emit(rec, forecasts=False)


def _m2_rec(run: Run, st: dict, cfg_m2: dict, od: dict, sig: dict | None, targets: dict,
            current: dict, notes: list[str]) -> Recommendation:
    orders = []
    for o in od["orders"]:
        dollars = None if o.get("close_all") else round(abs(float(o["dollars"])), 2)
        orders.append(OrderIntent(intent_id=run.next_intent_id("M2"), trade_id=st["trade_id"], module="M2",
                                  account=cfg_m2["account"], ticker=o["ticker"], side=o["side"],
                                  created_date=run.date, reason="rebalance", dollars=dollars,
                                  close_all=bool(o.get("close_all")),
                                  meta=facts_mod.m2_order_meta(run, cfg_m2, o)))
    facts = facts_mod.m2_rebalance(run, st, cfg_m2, od, sig, targets, current, notes)
    return Recommendation("REBALANCE", "M2", st["trade_id"], run.date, orders, facts)


def _contango_veto(run: Run, cfg_m2: dict) -> dict:
    """R3: annualised front-to-second WTI roll yield from explicit contract months (CLX26.NYM style)."""
    d = pd.Timestamp(run.date)
    lead = 1 if d.day <= 15 else 2                  # CL expires around the 20th of the prior month
    front = d.to_period("M") + lead
    names = [f"CL{CRUDE_MONTH_CODES[p.month - 1]}{p.year % 100:02d}.NYM" for p in (front, front + 1)]
    try:
        prices = []
        for n in names:
            closes = run.bars(n)["close"].dropna()
            if not len(closes) or (d - closes.index[-1]).days > 5:
                raise ValueError(f"stale or missing {n}")
            prices.append(float(closes.iloc[-1]))
        p1, p2 = prices
    except Exception as exc:  # noqa: BLE001 - optional data; the veto then stays unchecked
        return {"veto": False, "roll_yield": None, "contracts": names, "error": type(exc).__name__}
    ry = math.log(p1 / p2) * 12.0
    return {"veto": ry < float(cfg_m2["contango_veto_roll_yield"]), "roll_yield": ry,
            "contracts": names, "prices": [p1, p2]}


# --- M3 ------------------------------------------------------------------------------------------------

def _m3(run: Run, asof_utc: str) -> None:
    cfg_m3 = run.cfg.module("M3")
    if not cfg_m3.get("enabled", True):
        return
    st = run.state["modules"]["M3"]
    try:
        btc = run.provider.btc_daily_utc()
    except Exception as exc:  # noqa: BLE001
        run.alert("data", f"Bitcoin prices unavailable ({type(exc).__name__}); M3 not evaluated")
        return
    sw = btc_weekly_switch(btc, asof_utc, weeks=int(cfg_m3["weeks"]))
    if not sw.get("complete"):
        run.note("M3: no complete week to evaluate")
        return
    week_end = str(sw["week_end"])[:10]
    if st.get("last_week_end") == week_end:
        return
    run.log("signal", {"module": "M3", "check": "weekly", **sw})
    st.update(last_week_end=week_end, on=bool(sw["on"]))
    ot = st.get("open_trade")
    if sw["on"] and ot is None:
        if not run.budget_ok():
            return
        adm = run.admit("M3", cfg_m3["ticker"], float(cfg_m3["sleeve_pct_nav"]) * run.current_nav())
        run.log("signal", {"module": "M3", "check": "admit", **adm})
        if not adm.get("ok"):
            run.note(f"M3 switch-on not admitted: {adm.get('binding')}")
            return
        trade_id = f"T-{run.date}-M3"
        intent = OrderIntent(intent_id=run.next_intent_id("M3"), trade_id=trade_id, module="M3",
                             account=cfg_m3["account"], ticker=cfg_m3["ticker"], side="buy",
                             created_date=run.date, reason="switch_on",
                             dollars=round(float(adm["dollars"]), 2))
        rec = Recommendation("SWITCH_ON", "M3", trade_id, run.date, [intent],
                             facts_mod.m3_switch(run, sw, cfg_m3, adm=adm))
        if run.emit(rec):
            st["open_trade"] = {"trade_id": trade_id, "status": "pending_entry", "signal_date": run.date,
                                "dollars": intent.dollars, "intent_id": intent.intent_id}
            run.count_trade()
    elif not sw["on"] and ot and ot.get("status") == "open":
        intent = OrderIntent(intent_id=run.next_intent_id("M3"), trade_id=ot["trade_id"], module="M3",
                             account=cfg_m3["account"], ticker=cfg_m3["ticker"], side="sell",
                             created_date=run.date, reason="switch_off", close_all=True)
        rec = Recommendation("SWITCH_OFF", "M3", ot["trade_id"], run.date, [intent],
                             facts_mod.m3_switch(run, sw, cfg_m3, open_trade=ot))
        if run.emit(rec):
            ot.update(status="pending_exit", exit_reason="switch_off", exit_signal_date=run.date)


# --- shadow book (no emails) ---------------------------------------------------------------------------

def _shadow(run: Run, vix: pd.Series | None) -> None:
    spy = run.bars("SPY")
    cfg_m1 = run.cfg.module("M1")
    slip = run.cfg.slippage_bps("SPY") / 1e4
    if run.cfg.shadow("ST1B").get("enabled", True):
        book = run.state["shadow"]["ST1B"]
        _shadow_fills(run, book, spy, slip, "ST1B")
        ot = book.get("open_trade")
        if ot and ot["status"] == "open":
            ex = m1_exit_check(spy, run.date, ot, cfg_m1)
            if ex.get("exit"):
                ot.update(status="pending_exit", exit_reason=ex["reason"], exit_signal_date=run.date)
        elif ot is None:
            chk = st1b_entry_check(spy, vix, run.date, cfg_m1)
            if chk.get("signal"):
                book["open_trade"] = {"trade_id": f"S-{run.date}-ST1B", "status": "pending_entry",
                                      "signal_date": run.date, "rsi2": chk.get("rsi2")}
                run.log("shadow", {"book": "ST1B", "event": "signal", **chk})
    if run.cfg.shadow("W10").get("enabled", True):
        _shadow_w10(run, spy, slip, vix)


def _shadow_fills(run: Run, book: dict, spy: pd.DataFrame, slip: float, name: str) -> None:
    ot = book.get("open_trade")
    if not ot or ot["status"] not in ("pending_entry", "pending_exit"):
        return
    since = ot["signal_date"] if ot["status"] == "pending_entry" else (ot.get("exit_signal_date") or run.date)
    after = spy.index[spy.index > pd.Timestamp(since)]
    if not len(after):
        return
    day = after[0]
    px = float(spy.at[day, "open"])
    if ot["status"] == "pending_entry":
        ot.update(status="open", fill_date=iso(day), entry_price=px * (1 + slip))
        ot["exit_signal_date"] = None
        run.log("shadow", {"book": name, "event": "entry", **ot})
    else:
        exit_px = px * (1 - slip)
        trade = {**ot, "status": "closed", "exit_date": iso(day), "exit_price": exit_px,
                 "return": exit_px / float(ot["entry_price"]) - 1.0}
        book["trades"].append(trade)
        book["open_trade"] = None
        run.log("shadow", {"book": name, "event": "exit", **trade})


def _shadow_w10(run: Run, spy: pd.DataFrame, slip: float, vix: pd.Series | None) -> None:
    """Every uptrend -3% day, entered at the next open and scored at 60 and 90 calendar days (no emails).

    This is W10's record for the annual review (design v3.3 §3 W10): it includes signals that arrive while the
    W10 module is open, is disabled or is unconfirmed by a second source.
    """
    cfg_w = run.cfg.constitution["modules"].get("W10") or {}
    horizons = [int(h) for h in run.cfg.shadow("W10").get("score_calendar_days", [60, 90])]
    book = run.state["shadow"].setdefault("W10", {})
    events = book.setdefault("events", [])
    for ev in events:
        if ev.get("entry_date") is None:
            after = spy.index[spy.index > pd.Timestamp(ev["signal_date"])]
            if not len(after):
                continue
            day = after[0]
            ev.update(entry_date=iso(day), entry_price=float(spy.at[day, "open"]) * (1 + slip))
        for h in horizons:
            key = str(h)
            if key in ev.setdefault("scores", {}):
                continue
            exit_day = pd.Timestamp(w10_exit_date(ev["entry_date"], h))
            if exit_day in spy.index and exit_day <= pd.Timestamp(run.date):
                px = float(spy.at[exit_day, "open"]) * (1 - slip)
                ev["scores"][key] = {"exit_date": iso(exit_day), "exit_price": px,
                                     "return": px / float(ev["entry_price"]) - 1.0}
                run.log("shadow", {"book": "W10", "event": f"scored_{h}d", "signal_date": ev["signal_date"],
                                   **ev["scores"][key]})
    if not cfg_w:
        return
    try:
        spx = run.bars(cfg_w["index"])
    except Exception as exc:  # noqa: BLE001
        run.note(f"W10 shadow skipped: {type(exc).__name__}")
        return
    sig = w10_signal(spx, run.date, cfg_w)
    if sig.get("signal") and not any(ev["signal_date"] == run.date for ev in events):
        events.append({"signal_date": run.date, "ret": sig.get("ret"), "entry_date": None, "scores": {}})
        run.log("shadow", {"book": "W10", "event": "signal", **sig})


# --- dated forecasts (M2 legs) -------------------------------------------------------------------------

def _resolve_dated_forecasts(run: Run) -> None:
    open_fc = run.state["forecasts"]["open"]
    due = [f for f in open_fc if f.get("resolves") == "date" and f.get("due") and f["due"] <= run.date]
    if not due:
        return
    done = set()
    for f in due:
        ticker = f.get("ticker") or _ticker_from_question(f.get("question", ""))
        if not ticker:
            continue
        adj = run.bars(ticker)["adj_close"]
        start = adj.loc[: pd.Timestamp(f.get("created_date") or f["created"])]
        end = adj.loc[: pd.Timestamp(f["due"])]
        if not len(start) or not len(end):
            continue
        ret = float(end.iloc[-1] / start.iloc[-1] - 1.0)
        r = dict(fc.resolve_forecast(f, int(ret > 0)), resolved_date=run.date,
                 evidence={"ticker": ticker, "return": ret})
        run.state["forecasts"]["resolved"].append(r)
        run.log("resolution", {"forecast": r})
        done.add(f["forecast_id"])
    run.state["forecasts"]["open"] = [f for f in open_fc if f["forecast_id"] not in done]


def _ticker_from_question(q: str) -> str | None:
    head = q.split(" ", 1)[0].strip()
    return head if head.isupper() and 2 <= len(head) <= 5 else None


# ----------------------------------------------------------------------------------------------------
# weekly (Sunday night ET): the Bitcoin switch
# ----------------------------------------------------------------------------------------------------

def run_weekly(cfg: Config, provider: Any, state_dir: Path | None = None, *, date: str | None = None,
               dry_run: bool = False, force: bool = False, services: Services | None = None) -> RunResult:
    day = date or iso(latest_sunday())
    run = Run(cfg, provider, state_dir, "weekly", day, dry_run=dry_run, force=force, services=services)
    try:
        if not run.begin():
            return run.result
        if not dry_run:
            run.services.healthcheck("start")
        run.retry_unsent()
        _m3(run, asof_utc=iso(pd.Timestamp(day) + timedelta(days=1)))
        result = run.finish("ok")
        if not dry_run:
            run.services.healthcheck("fail" if run.blocked or _email_failed(result) else "success")
        return result
    except Exception:
        if not dry_run:
            run.services.healthcheck("fail")
        raise
    finally:
        run.close()


# ----------------------------------------------------------------------------------------------------
# monthly: the review email (design §8: operations, execution, evidence; no rule changes)
# ----------------------------------------------------------------------------------------------------

def run_monthly(cfg: Config, provider: Any, state_dir: Path | None = None, *, month: str | None = None,
                dry_run: bool = False, force: bool = False, services: Services | None = None) -> RunResult:
    if month is None:
        first = today_et().replace(day=1)
        month = (first - timedelta(days=1)).strftime("%Y-%m")
    run = Run(cfg, provider, state_dir, "monthly", month, dry_run=dry_run, force=force, services=services)
    try:
        if not run.begin():
            return run.result
        if not dry_run:
            run.services.healthcheck("start")
        report = facts_mod.monthly_report(run, month)
        rec = run.log("monthly_report", report)
        ctx = {"mode": cfg.mode, "nav": report.get("nav_end"), "ledger_head": rec["hash"],
               "data_asof": report.get("asof"), "sources": run.all_sources(),
               "constitution_version": cfg.version}
        email = email_mod.render_monthly(report, ctx)
        errors = validator.validate(email)
        if errors:
            run.alert("validator", f"monthly report blocked: {errors[:3]}")
            run.blocked = True
        else:
            run.outgoing.append((email, {"trade_id": f"R-{month}", "kind": "MONTHLY",
                                         "expires": "9999-12-31"}))
        result = run.finish("ok", {"month": month})
        if not dry_run:
            run.services.healthcheck("fail" if run.blocked or _email_failed(result) else "success")
        return result
    except Exception:
        if not dry_run:
            run.services.healthcheck("fail")
        raise
    finally:
        run.close()


def verify_ledger(state_dir: Path | None = None) -> tuple[bool, str]:
    paths = Paths(Path(state_dir or STATE_DIR))
    if not paths.ledger.exists():
        return False, f"no ledger at {paths.ledger}"
    return Ledger(paths.ledger).verify()


# ----------------------------------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------------------------------

def _month_asof(month: str) -> str:
    """The last day of `month` (YYYY-MM), or today in New York if the month is not over yet."""
    end = (pd.Timestamp(month + "-01") + pd.offsets.MonthEnd(0)).date()
    return min(end, today_et()).isoformat()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _git_sha() -> str | None:
    sha = os.environ.get("GITHUB_SHA")
    if sha:
        return sha
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=5,
                             cwd=Path(__file__).resolve().parent)
        return out.stdout.strip() or None
    except Exception:  # noqa: BLE001
        return None


def _issue_title(subject: str) -> str:
    return subject[:240]


def _issue_body(text: str, *, spread: bool = False) -> str:
    how = ("`filled <contracts> @ <net price>` (for example `filled 2 @ 7.45`)" if spread
           else "`filled <dollars> @ <price>`")
    return (text + f"\n\n---\nRecord your fill as a comment: {how} or `skipped`.")[:60000]


def status_text(cfg: Config, state_dir: Path | None = None) -> str:
    """A plain-text view of the paper book: NAV, cash, lots, pending orders, open trades and recent runs."""
    paths = Paths(Path(state_dir or STATE_DIR))
    if not paths.state.exists():
        return f"no state at {paths.state}; run `python -m traderec init`"
    state = load_state(paths.state)
    broker = PaperBroker.from_state(state["broker"], cfg)
    lines = [f"mode {state.get('mode')} | constitution {state.get('constitution_version')} | "
             f"created {state.get('created')}"]
    marks = state.get("marks") or []
    if marks:
        m = marks[-1]
        lines.append(f"last mark {m['date']}: NAV ${m['nav']:,.2f} | peak ${m['peak']:,.2f} | "
                     f"drawdown {m['drawdown']:.2%}")
    for acct in state["broker"]["cash"]:
        lines.append(f"cash {acct}: ${broker.cash(acct):,.2f}")
    for p in broker.positions():
        lines.append(f"lot {p['account']} {p['ticker']} [{p['module']}]: {p['qty']:.4f} sh, cost "
                     f"${p['cost']:,.2f}, opened {p['opened']}, trade {p['trade_id']}")
    for o in broker.pending():
        if o.order_type == "spread_limit":
            continue                             # listed by options_job.status_lines below
        amount = "all" if o.close_all else f"${float(o.dollars or 0):,.2f}"
        lines.append(f"pending {o.side} {o.ticker} {amount} [{o.module}] from {o.created_date} ({o.intent_id})")
    lines += options_job.status_lines(broker)   # Phase B: open spreads and pending spread orders
    for name, mod in state["modules"].items():
        ot = mod.get("open_trade")
        extra = f" on={mod.get('on')} week={mod.get('last_week_end')}" if name == "M3" else ""
        extra += f" last decision={mod.get('last_decision_month')}" if name == "M2" else ""
        lines.append(f"{name}: {'open trade ' + ot['trade_id'] + ' (' + ot['status'] + ')' if ot else 'flat'}"
                     f"{extra}")
    yr = (marks[-1]["date"] if marks else str(state.get("created")))[:4]
    lines.append(f"trades this year: {state['counters']['trades'].get(yr, 0)} of "
                 f"{cfg.risk['trade_budget_per_year']}")
    lines.append(f"open forecasts: {len(state['forecasts']['open'])}, resolved: "
                 f"{len(state['forecasts']['resolved'])}")
    recent = sorted(state["runs"].items(), key=lambda kv: kv[1].get("run_seq", 0))[-5:]
    for key, r in recent:
        lines.append(f"run {key}: {r.get('status')} at {r.get('at')}")
    return "\n".join(lines)
