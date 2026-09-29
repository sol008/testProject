"""Sending the growth book's emails (design v4 §9): render -> validate -> one GitHub issue per order -> the run's
outgoing queue, which `Run.finish` delivers through the existing notifier (Gmail, or the outbox on a dry run or
without credentials), exactly as `Run.emit` does for the v3.3 decisions.

`send_sunday(run, facts, intents)` pre-registers the Sunday email as a `recommendation` ledger record (kind GROWTH,
carrying the facts record and the `growth_decision` / `order_set` ids), then `dispatch`es it. A failed validation is
a `validator` alert and a `correction` record, and no email goes out (fail closed). Each order in the order set gets
its own issue, titled with the order, so the owner records fills as today (`filled <dollars> @ <price>` or `skipped`)
and `feedback.review` matches them by the order's trade id.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

from traderec import validator
from traderec.growth import email as growth_email
from traderec.types import OrderIntent, RenderedEmail

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run

__all__ = ["dispatch", "order_line", "send_sunday"]

RECORD_HOW = "`filled <dollars> @ <price>` (what you spent or got, and the average price) or `skipped`"


def order_line(intent: OrderIntent) -> str:
    """"Sell all SSO" / "Sell $9,084 of IBIT" / "Buy $20,000 of SSO", from the order itself."""
    if intent.side == "sell" and intent.close_all:
        return f"Sell all {intent.ticker}"
    verb = "Buy" if intent.side == "buy" else "Sell"
    dollars = f"${float(intent.dollars or 0.0):,.0f}"
    return f"{verb} {dollars} of {intent.ticker}"


def _issue_title(email: RenderedEmail, k: int, n: int, intent: OrderIntent) -> str:
    label = str((email.meta or {}).get("mode") or "paper").upper()
    kind = str((email.meta or {}).get("kind") or "GROWTH")
    tag = "EXIT" if kind == "RULE_E" else "GROWTH"
    rest = email.subject.split("] ", 2)[-1]            # the subject after its own [MODE][KIND id] tags
    return f"[{label}][{tag} {intent.trade_id}] {order_line(intent)} ({k} of {n}) — {rest[:140]}"[:256]


def _issue_body(email: RenderedEmail, k: int, n: int, intent: OrderIntent, first_url: str | None) -> str:
    step = "Step 1 (tonight, or before 9:20 ET Monday)" if intent.side == "sell" else \
        "Step 2 (Monday from about 9:35 ET, once the sells show Filled)"
    if (email.meta or {}).get("kind") == "RULE_E":
        step = "Rule E exit: queued for the next open"
    head = f"Order {k} of {n}: **{order_line(intent)}**, market, in dollars — {step}.\n\n"
    if first_url:
        body = head + f"The full email is on the first order's issue: {first_url}\n"
    else:
        body = head + "---\n\n" + email.text
    return (body + f"\n\n---\nRecord your fill as a comment: {RECORD_HOW}.")[:60000]


def dispatch(run: "Run", render: Callable[[dict, dict], RenderedEmail], facts: dict, intents: list[OrderIntent], *,
             kind: str, trade_id: str, module: str, expires: str, ctx: dict) -> dict[str, Any]:
    """Render, validate, open one issue per order, and queue the email for `Run.finish` to send.

    Returns {"blocked": bool, "errors", "subject", "issue_urls": {intent_id: url}}. Blocked (a validator failure)
    means a `validator` alert, a `correction` record, `run.blocked` set, and nothing queued.
    """
    ctx = dict(ctx)
    ctx.setdefault("mode", run.cfg.mode)
    ctx.setdefault("issue_urls", {})
    email = render(facts, ctx)
    errors = validator.validate(email)
    if errors:
        run.log("correction", {"blocked_trade": trade_id, "reason": "validator", "errors": errors, "kind": kind})
        run.alert("validator", f"{trade_id} {kind} blocked: {errors[:3]}")
        run.blocked = True
        return {"blocked": True, "errors": errors, "subject": email.subject, "issue_urls": {}}
    urls: dict[str, str] = {}
    if intents and not run.dry_run and run.cfg.account.get("github_issues", False):
        first_url: str | None = None
        n = len(intents)
        for k, intent in enumerate(intents, start=1):
            url = run.services.create_issue(_issue_title(email, k, n, intent), _issue_body(email, k, n, intent, first_url),
                                            labels=["traderec", run.cfg.mode, module])
            if not url:
                continue
            first_url = first_url or url
            urls[intent.intent_id] = url
            run.state.setdefault("issues", []).append({
                "url": url, "trade_id": intent.trade_id, "kind": kind, "module": intent.module, "date": run.date,
                "tickers": [intent.ticker], "intents": [intent.intent_id], "email": trade_id})
        if urls:
            ctx["issue_urls"] = urls
            with_urls = render(facts, ctx)
            if not validator.validate(with_urls):
                email = with_urls
    email.meta.setdefault("trade_id", trade_id)
    email.meta.setdefault("kind", kind)
    run.outgoing.append((email, {"trade_id": trade_id, "kind": kind, "expires": expires}))
    return {"blocked": False, "errors": [], "subject": email.subject, "issue_urls": urls}


def send_sunday(run: "Run", facts: dict, intents: list[OrderIntent]) -> dict[str, Any]:
    """The Sunday email for this run's facts record: the `recommendation` record, then `dispatch`.

    `growth.email.send_no_change` (default on: design v4 §0 "three weeks in four it says no change") decides whether
    a week without orders still gets its short email; with it off the week is only in the ledger and the state.
    """
    from traderec import growth

    email_cfg = (growth.cfg_growth(run.cfg).get("email") or {})
    trade_id = f"G-{facts['date']}"
    if not intents and not email_cfg.get("send_no_change", True):
        run.note("growth: no change this week and growth.email.send_no_change is off: no email")
        return {"blocked": False, "errors": [], "subject": None, "issue_urls": {}, "skipped": "no change"}
    rec = run.log("recommendation", {
        "kind": "GROWTH", "module": "GROWTH", "trade_id": trade_id, "created_date": facts["date"],
        "orders": [i.to_dict() for i in intents], "facts": facts, "forecasts": [],
        "ids": dict(facts.get("ids") or {}),
    })
    ctx = {"mode": run.cfg.mode, "ledger_head": rec["hash"], "data_asof": facts["date"], "sources": run.all_sources(),
           "constitution_version": run.cfg.version, "limited_margin": facts.get("limited_margin", True)}
    result = dispatch(run, growth_email.render_growth, facts, intents, kind="GROWTH", trade_id=trade_id,
                      module="GROWTH", expires=str(facts.get("execute_date") or run.order_deadline()), ctx=ctx)
    # the send result, kept next to the facts in the state (facts["ids"] stays the Sunday job's three record ids)
    facts["email"] = {"record": rec["hash"], "subject": result.get("subject"), "blocked": result["blocked"],
                      "issue_urls": result["issue_urls"]}
    return result
