"""Rule E, the one mid-week email, exit-only (design v4 §3a.7, §9; track 32 §4.3-§4.4; owner decision 5).

`daily(run)` is the daily run's hook (`pipeline._daily`, after the modules): while the growth book is enabled and not
paused, for every G1 leg that is in and held, the leg's index close on the run date is checked against its 200-day
average with no band (`g1_lev_trend.below_sma_today`), confirmed on the second source's close (fail closed, as the
daily run's other signals). A leg below its average is sold: "Sell all <leg>" queued with the paper broker for the
next open, one short exit-only email (rendered by `growth.email.render_rule_e`, validated, one issue per leg), a
`rule_e` ledger record and `state.growth.rule_e.{count_week, count_year, last, pending, scores}`; the leg's state
becomes "out", so the Sunday rule asks for the band to re-enter. At most `rule_e.max_per_week` (1) events a week and
`max_per_year` (6) a year: beyond that the trigger is logged (`event: capped`), not sent, and Sunday decides. The
Bitcoin sleeve has no mid-week exit. Under the hard stop (paused) Rule E is moot.

`score_pending(run, st, closes, g1, friday)` runs on the Sunday job: each Rule E exit whose paper fill is known is
scored against "waiting for Sunday" (the fill price against the leg's Friday close, the price the Sunday decision
would have exited at), recorded as a `rule_e` record (`event: score`) and kept in `state.growth.rule_e.scores` for
the reviews; the Sunday email shows the week's scores.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pandas as pd

from traderec import growth
from traderec.data.verify import verify_close
from traderec.growth import email as growth_email
from traderec.growth import send as growth_send
from traderec.market_calendar import iso, next_trading_day
from traderec.modules.g1_lev_trend import below_sma_today, sma_snapshot
from traderec.state import jsonable
from traderec.types import OrderIntent

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run

__all__ = ["daily", "rule_e_state", "score_pending", "week_key"]

UNRESOLVED_AFTER_DAYS = 14      # a Rule E exit without a paper fill for two weeks is logged as unresolved


def week_key(date: str) -> str:
    """The ISO week of a date, "2026-W40" (Monday to Sunday: the Sunday run closes the week Rule E counts in)."""
    y, w, _ = pd.Timestamp(date).isocalendar()
    return f"{int(y)}-W{int(w):02d}"


def rule_e_state(st: dict[str, Any], date: str) -> dict[str, Any]:
    """`state.growth.rule_e` with every key present; the weekly and annual counts reset when their period changes."""
    re_st = st.setdefault("rule_e", {})
    for key, value in (("count_week", 0), ("count_year", 0), ("last", None), ("week", None), ("year", None),
                       ("pending", []), ("scores", []), ("capped", []), ("running_pct", 0.0)):
        re_st.setdefault(key, value)
    week, year = week_key(date), str(date)[:4]
    if re_st["week"] != week:
        re_st["week"], re_st["count_week"] = week, 0
    if re_st["year"] != year:
        re_st["year"], re_st["count_year"] = year, 0
    return re_st


def _triggers(run: "Run", cfg: dict, st: dict, acct: str) -> list[dict[str, Any]]:
    """The G1 legs that are in, held, and closed below their average today on both sources."""
    g1 = (cfg.get("sleeves") or {}).get("G1") or {}
    sig = g1.get("signal") or {}
    n = int(sig.get("sma_days", 200))
    tol = float(run.cfg.data["two_source_tolerance"])
    pending_sells = {o.ticker for o in run.broker.pending() if o.side == "sell"}
    out: list[dict[str, Any]] = []
    for leg, spec in (g1.get("legs") or {}).items():
        leg_st = st["sleeves"]["G1"].get(leg) or {}
        if not leg_st.get("in") or leg in pending_sells:
            continue
        try:
            price = run.close_on(leg, run.date)
        except Exception:  # noqa: BLE001 - the broker falls back to its last mark, then cost
            price = None
        held = float(run.broker.holdings_value(acct, leg, price, module="G1"))
        if held <= 0.0:
            continue
        index = str(spec.get("index") or "")
        try:
            bars = run.bars(index)
            chk = below_sma_today(bars, run.date, sig)
        except Exception as exc:  # noqa: BLE001 - no index data tonight: no exit (Sunday decides)
            run.note(f"Rule E {leg} ({index}): not checked ({type(exc).__name__}: {exc})")
            continue
        if not chk["below"]:
            continue
        try:
            ver = verify_close(run.provider, bars, index, run.date, tol)
        except Exception as exc:  # noqa: BLE001
            ver = {"ok": False, "primary": chk["close"], "secondary": None, "source": None,
                   "reason": f"{type(exc).__name__}: {exc}"}
        second_below = False
        if ver.get("ok") and ver.get("secondary") is not None:
            snap = sma_snapshot(bars, run.date, n, float(ver["secondary"]))
            second_below = snap["sma"] is not None and float(snap["close"]) < float(snap["sma"])
        if not second_below:
            run.alert("data", f"Rule E {leg} ({index}): close {chk['close']:,.2f} is below its {n}-day average "
                              f"{chk['sma200']:,.2f} but the second source does not confirm it "
                              f"({ver.get('reason') or 'disagrees'}): no exit tonight, Sunday decides")
            continue
        out.append({"ticker": leg, "index": index, "close": float(chk["close"]), "sma200": float(chk["sma200"]),
                    "pct_vs_sma": round(100.0 * float(chk["pct_vs_sma"]), 2), "sma_days": n,
                    "band_pct": round(100.0 * float(sig.get("band", 0.02)), 2), "held_usd": round(held, 2),
                    "check": {"primary": ver.get("primary"), "secondary": ver.get("secondary"),
                              "source": ver.get("source"), "ok": bool(ver.get("ok"))}})
    return out


def _facts(run: "Run", cfg: dict, re_st: dict, legs: list[dict], acct: str) -> dict[str, Any]:
    re_cfg = cfg.get("rule_e") or {}
    tickers = [leg["ticker"] for leg in legs]
    trade_id = f"G-{run.date}-{tickers[0]}" if len(tickers) == 1 else f"G-{run.date}-RULE-E"
    return jsonable({
        "kind": "RULE_E", "label": "LIVE" if run.cfg.mode == "live" else "PAPER", "date": run.date,
        "week": int(pd.Timestamp(run.date).isocalendar()[1]), "execute_date": iso(next_trading_day(run.date)),
        "trade_id": trade_id, "legs": legs, "count_week": int(re_st["count_week"]) + 1,
        "count_year": int(re_st["count_year"]) + 1, "max_per_week": int(re_cfg.get("max_per_week", 1)),
        "max_per_year": int(re_cfg.get("max_per_year", 6)),
        "vehicle": str(((cfg.get("sleeves") or {}).get("cash") or {}).get("vehicle") or "SGOV"), "account": acct,
        "constitution_version": run.cfg.version, "ids": {},
    })


def daily(run: "Run") -> dict[str, Any] | None:
    """The daily Rule E check (see the module docstring). Returns the send result, a capped event, or None."""
    if not growth.enabled(run.cfg):
        return None
    cfg = growth.cfg_growth(run.cfg)
    re_cfg = cfg.get("rule_e") or {}
    if not re_cfg.get("enabled", True):
        return None
    st = growth.state_growth(run.state)
    if st.get("first_run") is None or st.get("paused"):
        return None                                   # the book has not started, or the hard stop: Rule E is moot
    re_st = rule_e_state(st, run.date)
    acct = str((cfg.get("accounts") or {}).get("switching") or "ira")
    legs = _triggers(run, cfg, st, acct)
    if not legs:
        return None
    facts = _facts(run, cfg, re_st, legs, acct)
    max_week, max_year = facts["max_per_week"], facts["max_per_year"]
    cap = ("the weekly cap" if re_st["count_week"] >= max_week else
           "the annual cap" if re_st["count_year"] >= max_year else None)
    names = ", ".join(leg["ticker"] for leg in legs)
    if cap:
        rec = run.log("rule_e", {"event": "capped", "reason": cap, **facts})
        re_st["capped"].append({"date": run.date, "tickers": [leg["ticker"] for leg in legs], "reason": cap,
                                "record": rec["hash"]})
        run.note(f"Rule E: {names} closed below the average, but {cap} is reached ({re_st['count_week']} this week, "
                 f"{re_st['count_year']} this year): logged, not sent; Sunday decides")
        return {"blocked": False, "capped": cap, "record": rec["hash"]}
    intents: list[OrderIntent] = []
    for leg in facts["legs"]:                          # the facts' own leg records carry the order ids
        intent = OrderIntent(intent_id=run.next_intent_id("G1"), trade_id=f"G-{run.date}-{leg['ticker']}", module="G1",
                             account=acct, ticker=leg["ticker"], side="sell", created_date=run.date, reason="rule_e",
                             close_all=True, meta={"sleeve": "G1", "growth": True, "rule_e": True})
        leg["intent_id"], leg["trade_id"] = intent.intent_id, intent.trade_id
        intents.append(intent)
    legs = facts["legs"]
    rec = run.log("rule_e", {"event": "exit", **facts, "orders": [i.to_dict() for i in intents]})
    facts["ids"] = {"rule_e": rec["hash"]}
    ctx = {"mode": run.cfg.mode, "ledger_head": rec["hash"], "data_asof": run.date, "sources": run.all_sources(),
           "constitution_version": run.cfg.version}
    result = growth_send.dispatch(run, growth_email.render_rule_e, facts, intents, kind="RULE_E",
                                  trade_id=facts["trade_id"], module="G1", expires=facts["execute_date"], ctx=ctx)
    if result["blocked"]:
        return result                                 # fail closed: nothing queued, the state kept, Sunday decides
    queued: list[OrderIntent] = []
    for intent in intents:
        try:
            run.broker.queue(intent)
        except ValueError as exc:
            run.alert("order", f"Rule E order not queued: {exc}")
            continue
        run.log("order", intent.to_dict())
        queued.append(intent)
    for intent in queued:
        prev = st["sleeves"]["G1"].get(intent.ticker) or {}
        st["sleeves"]["G1"][intent.ticker] = {**prev, "in": False, "since": run.date, "band_state": "below",
                                              "last_signal": run.date, "rule_e_exit": run.date}
        leg = next(lg for lg in legs if lg["ticker"] == intent.ticker)
        re_st["pending"].append({"date": run.date, "ticker": intent.ticker, "intent_id": intent.intent_id,
                                 "trade_id": intent.trade_id, "record": rec["hash"], "close": leg["close"],
                                 "sma200": leg["sma200"], "held_usd": leg["held_usd"]})
    re_st["count_week"] += 1
    re_st["count_year"] += 1
    re_st["last"] = {"date": run.date, "week": re_st["week"], "tickers": [i.ticker for i in queued],
                     "record": rec["hash"], "intents": [i.intent_id for i in queued], "subject": result["subject"],
                     "score": None}
    run.note(f"Rule E: Sell all {names} queued for {facts['execute_date']} ({re_st['count_year']} of {max_year} "
             f"this year)")
    return result


def score_pending(run: "Run", st: dict[str, Any], closes: dict[str, float], g1: dict[str, dict],
                  friday: str) -> dict[str, Any]:
    """On the Sunday run: score every Rule E exit whose paper fill is known against "waiting for Sunday".

    The alternative's price is the leg's Friday close (`closes`, else the bars), the price the Sunday decision would
    exit at; `alt_action` says whether that decision would have exited ("exit": the close is beyond the band) or
    held. `edge_pct` = exit price / alternative price - 1: positive when Rule E sold higher. Returns the facts for
    the Sunday email: {"scored", "count_week", "count_year", "max_per_year", "running_pct"}.
    """
    re_st = rule_e_state(st, run.date)
    re_cfg = growth.cfg_growth(run.cfg).get("rule_e") or {}
    fills = {f.get("intent_id"): f for f in (run.state.get("fills") or []) if isinstance(f, dict)}
    scored: list[dict[str, Any]] = []
    keep: list[dict[str, Any]] = []
    for p in re_st.get("pending") or []:
        fill = fills.get(p.get("intent_id"))
        if fill is None or fill.get("price") in (None, 0):
            if (pd.Timestamp(run.date) - pd.Timestamp(p["date"])).days > UNRESOLVED_AFTER_DAYS:
                run.log("rule_e", {"event": "unresolved", "reason": "no paper fill within two weeks", **p})
                run.alert("fill", f"Rule E exit of {p['ticker']} ({p['date']}) has no paper fill after two weeks")
            else:
                keep.append(p)
            continue
        leg = str(p["ticker"])
        alt = closes.get(leg)
        if alt is None:
            try:
                alt = run.close_on(leg, friday)
            except Exception:  # noqa: BLE001
                alt = None
        res = g1.get(leg) or {}
        pct, band = res.get("pct_vs_sma"), res.get("band")
        alt_action = None
        if res.get("signal") and pct is not None and band is not None:
            alt_action = "exit" if float(pct) <= -float(band) else "hold"
        exit_price = float(fill["price"])
        edge = None if not alt else round(100.0 * (exit_price / float(alt) - 1.0), 2)
        score = {"ticker": leg, "trigger_date": p["date"], "exit_date": fill.get("fill_date"),
                 "exit_price": round(exit_price, 4), "alt_price": None if alt is None else round(float(alt), 4),
                 "alt_date": friday, "alt_action": alt_action, "edge_pct": edge, "resolved": run.date,
                 "trigger_record": p.get("record"), "intent_id": p.get("intent_id")}
        rec = run.log("rule_e", {"event": "score", **score})
        score["record"] = rec["hash"]
        scored.append(score)
    re_st["pending"] = keep
    if scored:
        re_st["scores"] = list(re_st.get("scores") or []) + scored
        last = re_st.get("last") or {}
        if last.get("date") in {s["trigger_date"] for s in scored}:
            last["score"] = [s for s in scored if s["trigger_date"] == last.get("date")]
        re_st["running_pct"] = round(sum(float(s["edge_pct"]) for s in re_st["scores"] if s.get("edge_pct") is not None), 2)
    return {"scored": scored, "count_week": int(re_st["count_week"]), "count_year": int(re_st["count_year"]),
            "max_per_year": int(re_cfg.get("max_per_year", 6)), "max_per_week": int(re_cfg.get("max_per_week", 1)),
            "running_pct": float(re_st.get("running_pct") or 0.0), "pending": len(keep)}
