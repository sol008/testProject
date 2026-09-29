"""The Sunday growth job (design v4 §10 "Sunday 21:17 ET"; Appendix A.2 "Weekly job"): `run(run)`.

Ingest (Friday's index closes, the Sunday Bitcoin close; two sources each) -> G1/G2 signals -> NAV, peak, drawdown,
G -> Rule E's scores (`rule_e.score_pending`) -> targets -> the order set -> the <= 3 orders queued with the paper
broker for Monday's open -> the ledger records (`growth_decision`, `governor`, `order_set`, one `order` each) -> the
facts record, written to `state.growth.last_facts` and returned (docs/phase-c/growth.md documents it) -> the Sunday
email (`send.send_sunday`: the `recommendation` record, render, validate, one issue per order, the notifier).
Under `run.dry_run` nothing is saved and the email goes to the outbox, as for every run. Every data problem fails
closed: the leg keeps its state, a `data` alert is raised and the event is in the `growth_decision` record.
"""
from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

import pandas as pd

from traderec import growth
from traderec.growth import governor, rule_e
from traderec.growth import orders as orders_mod
from traderec.growth import send as growth_send
from traderec.market_calendar import iso, next_trading_day
from traderec.modules.g1_lev_trend import last_session_before, leg_check
from traderec.modules.g2_btc_switch import g2_signal, two_source_check, vol_cut
from traderec.runners import g3 as g3_runner
from traderec.state import jsonable
from traderec.types import OrderIntent

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run

BTC_TICKER = "BTC-USD"


def _leg_unavailable(prev_in: bool | None, reason: str) -> dict[str, Any]:
    return {"signal": False, "in": prev_in, "changed": False, "action": None, "date": None, "close": None,
            "sma200": None, "pct_vs_sma": None, "band": None, "session": None, "reason": reason, "check": None,
            "agree": None, "second": None}


def _g1(run: "Run", cfg: dict, st: dict, sources: list[dict]) -> dict[str, dict]:
    g1_cfg = (cfg.get("sleeves") or {}).get("G1") or {}
    tol = float(run.cfg.data["two_source_tolerance"])
    out: dict[str, dict] = {}
    for leg, spec in (g1_cfg.get("legs") or {}).items():
        prev = (st["sleeves"]["G1"].get(leg) or {}).get("in")
        index = spec["index"]
        try:
            res = leg_check(run.provider, run.bars(index), index, run.date, prev, g1_cfg.get("signal") or {}, tol)
        except Exception as exc:  # noqa: BLE001 - no index data: no signal for that leg (fail closed)
            res = _leg_unavailable(prev, f"{index} unavailable ({type(exc).__name__}: {exc})")
        if not res["signal"]:
            run.alert("data", f"G1 {leg} ({index}): {res['reason']}")
        chk = res.get("check") or {}
        sources.append({"ticker": index, "a": chk.get("primary"), "b": chk.get("secondary"),
                        "b_source": chk.get("source"), "agree": res.get("agree"), "date": res.get("date")})
        out[leg] = res
    return out


def _g2(run: "Run", cfg: dict, st: dict, sources: list[dict]) -> dict[str, Any]:
    g2_cfg = (cfg.get("sleeves") or {}).get("G2") or {}
    sig_cfg = g2_cfg.get("signal") or {}
    prev_on = st["sleeves"]["G2"].get("on")
    asof_utc = iso(pd.Timestamp(run.date) + pd.Timedelta(days=1))
    try:
        btc = run.provider.btc_daily_utc()
        sig = g2_signal(btc, asof_utc, sig_cfg)
    except Exception as exc:  # noqa: BLE001
        sig = {"on": prev_on, "complete": False, "week_end": None, "weekly_close": None, "ma10w": None,
               "sma200": None, "vol60": None, "reason": f"Bitcoin prices unavailable ({type(exc).__name__}: {exc})"}
    sig = dict(sig, signal=False, prev_on=prev_on, check=None, agree=None)
    if not sig["complete"]:
        run.alert("data", f"G2: {sig['reason']}")
        sources.append({"ticker": BTC_TICKER, "a": sig.get("weekly_close"), "b": None, "agree": None})
        return sig
    week_end = sig["week_end"]
    second, source = None, None
    try:
        found = run.provider.second_source_close(BTC_TICKER, week_end)
        if found and found.get("close") is not None:
            second, source = float(found["close"]), str(found.get("source") or "second source")
    except Exception:  # noqa: BLE001 - a missing second source fails closed below
        second = None
    if second is None:
        try:
            second, source = run.close_on(BTC_TICKER, week_end), "daily_bars:BTC-USD"
        except Exception:  # noqa: BLE001
            second = None
    tol = float(sig_cfg.get("two_source_tolerance", run.cfg.data["two_source_tolerance"]))
    chk = two_source_check(sig["weekly_close"], second, tol, source)
    sig["check"], sig["agree"] = chk, bool(chk["ok"])
    sources.append({"ticker": BTC_TICKER, "a": chk["primary"], "b": chk["secondary"], "b_source": source,
                    "agree": chk["ok"], "date": week_end})
    if not chk["ok"]:
        run.alert("data", f"G2: Bitcoin Sunday close not confirmed ({chk['reason']}): no signal, state kept")
        sig.update(on=prev_on)
        return sig
    sig["signal"] = True
    sig["changed"] = prev_on is None or bool(sig["on"]) != bool(prev_on)
    sig["vol_cut"] = vol_cut(sig.get("vol60"), st["sleeves"]["G2"], run.date, g2_cfg.get("vol_cut") or {})
    return sig


def _closes(run: "Run", tickers: set[str]) -> dict[str, float]:
    closes: dict[str, float] = {}
    for t in sorted(tickers):
        try:
            px = run.last_close(t)
        except Exception:  # noqa: BLE001 - the broker falls back to its last marked close, then cost
            px = None
        if px is not None and math.isfinite(float(px)) and float(px) > 0:
            closes[t] = float(px)
    return closes


def _w10(run: "Run", cfg: dict, st: dict, nav_ira: float, G: float, closes: dict[str, float],
         acct: str) -> tuple[dict[str, Any], dict | None]:
    """W10's state from the daily module (design v4 §3 W10): armed / fired / open / disabled, and the buy to fund.

    The daily run keeps the rule; it records a fired signal as `state.modules.W10.fired = {"signal_date", ...}` for
    the Sunday email (a buy at Monday's open, 6% x G, from SGOV). An open W10 trade is the daily module's (its
    90-day exit stays there).
    """
    w_cfg = (cfg.get("sleeves") or {}).get("W10") or {}
    mod = run.state.get("modules", {}).get("W10") or {}
    ticker = str((run.cfg.constitution.get("modules", {}).get("W10") or {}).get("ticker") or "SPY")
    ot = mod.get("open_trade")
    held = run.broker.holdings_value(acct, ticker, closes.get(ticker), module="W10")
    fired = mod.get("fired") if isinstance(mod.get("fired"), dict) else None
    week_start = iso(pd.Timestamp(run.date) - pd.Timedelta(days=6))
    info: dict[str, Any] = {"ticker": ticker, "held_usd": round(held, 2), "state": "armed", "signal_date": None,
                            "open_trade": None, "exit_due": None, "disabled": bool(mod.get("disabled")),
                            "weight": float(w_cfg.get("weight", 0.06)), "buy_usd": 0.0, "note": ""}
    if mod.get("disabled"):
        info.update(state="disabled", note=str((mod.get("disabled") or {}).get("reason") or ""))
        return info, None
    if ot:
        info.update(state="open" if ot.get("status") == "open" else str(ot.get("status")), open_trade=ot.get("trade_id"),
                    exit_due=ot.get("exit_date"), signal_date=ot.get("signal_date"))
        return info, None
    if fired and str(fired.get("signal_date") or "") >= week_start and not fired.get("handled"):
        usd = float(w_cfg.get("weight", 0.06)) * float(G) * float(nav_ira)
        info.update(state="fired", signal_date=fired.get("signal_date"), buy_usd=round(usd, 2))
        return info, {"buy_usd": usd, "ticker": ticker, "module": "W10", "trade_id": f"T-{fired['signal_date']}-W10",
                      "signal_date": fired["signal_date"]}
    return info, None


def run(run: "Run") -> dict[str, Any]:
    """The Sunday growth job on `run` (kind "weekly"). Returns the facts record (also `state.growth.last_facts`)."""
    cfg = growth.cfg_growth(run.cfg)
    st = growth.state_growth(run.state)
    date = run.date
    sl = cfg.get("sleeves") or {}
    acct = str((cfg.get("accounts") or {}).get("switching") or "ira")
    vehicle = str((sl.get("cash") or {}).get("vehicle") or "SGOV")
    g1_cfg, g2_cfg = sl.get("G1") or {}, sl.get("G2") or {}
    legs = list((g1_cfg.get("legs") or {}).keys())
    ibit = str(g2_cfg.get("instrument") or "IBIT")
    modules = {**{leg: "G1" for leg in legs}, ibit: "G2", vehicle: "GROWTH"}
    friday = last_session_before(date)
    sources: list[dict] = []

    # 1. signals
    g1 = _g1(run, cfg, st, sources)
    g2 = _g2(run, cfg, st, sources)
    g1_in = {leg: (g1[leg]["in"] if g1[leg]["signal"] else (st["sleeves"]["G1"].get(leg) or {}).get("in")) for leg in legs}
    g2_on = bool(g2["on"]) if g2.get("signal") else st["sleeves"]["G2"].get("on")
    vol_factor = float(st["sleeves"]["G2"].get("vol_cut_factor") or 1.0)

    # 2. NAV at Friday's close, the governor
    held_tickers = {p["ticker"] for p in run.broker.positions()} | set(legs) | {ibit}
    closes = _closes(run, held_tickers)
    val = run.broker.valuation(closes)
    nav_total = float(val["nav"])
    nav_ira = float(val["by_account"].get(acct, {}).get("equity", 0.0))
    nav_taxable = nav_total - nav_ira
    gov = governor.update(st, nav_total, date, cfg)
    G = float(st["G"])
    paused = bool(st.get("paused"))
    if gov["hard_stop"]:
        run.alert("hard_stop", f"book drawdown {gov['drawdown']:.1%} >= {gov['hard_stop_at']:.0%}: everything to "
                               f"{vehicle}, the book is paused until the owner's review (design v4 §3)")
    if paused:
        g1_in = {leg: False for leg in legs}
        g2_on = False
    rule_e_info = rule_e.score_pending(run, st, closes, g1, friday)      # Rule E exits scored against "waiting for Sunday"

    # 3. targets and holdings (the promoted gems rules' slots come out of the reserve: design v4 §3 G3, Phase C4a)
    w10_info, w10_buy = _w10(run, cfg, st, nav_ira, G, closes, acct)
    g3_book = g3_runner.sunday_book(run, st, cfg, nav_ira, G, closes, acct, paused=paused)
    for x in g3_book["buys"] + g3_book["sells"]:
        modules[x["ticker"]] = "G3"
    targets = orders_mod.sleeve_targets(g1_in, g2_on, nav_ira, G, cfg, vol_factor=vol_factor,
                                        w10_held_usd=float(w10_info["held_usd"]),
                                        w10_buy_usd=float(w10_buy["buy_usd"]) if w10_buy else 0.0,
                                        g3_held_usd=float(sum(g3_book["held"].values())),
                                        g3_buy_usd=float(sum(b["usd"] for b in g3_book["buys"])))
    held = {t: run.broker.holdings_value(acct, t, closes.get(t), module=modules[t]) for t in targets}
    held.update(g3_book["held"])
    cash = float(run.broker.cash(acct))
    os = orders_mod.build_order_set(targets, held, cash, G=G, G_last_order=st.get("G_at_last_order"), cfg_growth=cfg,
                                    paused=paused, w10=w10_buy, modules=modules,
                                    g3={"buys": g3_book["buys"], "sells": g3_book["sells"]})
    for d in os["dropped"]:
        run.note(f"W10 {d['ticker']} ${d['usd']:,.0f} dropped this week: {d.get('why')} (design v4 §3 W10)")

    # 4. the orders, queued for Monday's open (Tuesday after a holiday: the broker fills at the first session)
    intents: list[OrderIntent] = []
    for o in os["orders"]:
        side = "buy" if o["action"] == "buy" else "sell"
        trade_id = (w10_buy or {}).get("trade_id") if o["sleeve"] == "W10" else f"G-{date}-{o['ticker']}"
        intent = OrderIntent(intent_id=run.next_intent_id(o["module"]), trade_id=str(trade_id), module=o["module"],
                             account=acct, ticker=o["ticker"], side=side, created_date=date, reason=o["reason"],
                             dollars=None if o["action"] == "sell_all" else o["usd"], close_all=o["action"] == "sell_all",
                             meta={"sleeve": o["sleeve"], "rank": o["rank"], "growth": True,
                                   **({"max_cash_frac": os["queued_cash_frac"]}
                                      if side == "buy" and o["ticker"] != vehicle else {}),
                                   **({"rule": o.get("rule"), "slot_id": o.get("slot_id")} if o["sleeve"] == "G3" else {})})
        try:
            run.broker.queue(intent)
        except ValueError as exc:
            run.alert("order", f"growth order not queued: {exc}")
            o["queued"] = False
            continue
        o["queued"] = True
        o["intent_id"] = intent.intent_id
        o["trade_id"] = intent.trade_id
        intents.append(intent)
        run.log("order", intent.to_dict())
    sent = [o for o in os["orders"] if o.get("queued")]
    g3_runner.record_orders(st, sent, date)                 # the gems slots learn their order ids (the daily runner settles them)
    g3_orders = {o["ticker"]: ("buy" if o["action"] == "buy" else "sell") for o in sent if o["sleeve"] == "G3"}
    g3_deferred = {o["ticker"] for o in os["deferred"] if o.get("sleeve") == "G3"}
    for slot in g3_book["facts"]["slots"]:
        slot["order"] = g3_orders.get(slot["ticker"]) or ("deferred" if slot["ticker"] in g3_deferred else None)
    if w10_buy is not None:
        w_mod = run.state["modules"].setdefault("W10", {"open_trade": None, "history": [], "disabled": None})
        sent_w10 = next((o for o in sent if o["sleeve"] == "W10"), None)
        if sent_w10:
            w_mod["open_trade"] = {"trade_id": w10_buy["trade_id"], "status": "pending_entry",
                                   "signal_date": w10_buy["signal_date"], "dollars": sent_w10["usd"],
                                   "intent_id": sent_w10["intent_id"]}
        w_mod["fired"] = dict(w_mod.get("fired") or {}, handled=date, sent=bool(sent_w10))

    # 5. the ledger
    decision = run.log("growth_decision", {
        "date": date, "friday": friday, "G1": g1, "G2": {k: v for k, v in g2.items() if k != "vol_cut"},
        "vol_cut": g2.get("vol_cut"), "state_after": {"G1": g1_in, "G2": g2_on}, "sources": sources,
        "nav": {"ira": nav_ira, "taxable": nav_taxable, "total": nav_total}, "closes": closes,
    })
    gov_rec = run.log("governor", gov)
    order_rec = run.log("order_set", {"date": date, "targets": targets, "held": held, "cash": cash, "G": G,
                                      "G_at_last_order": st.get("G_at_last_order"), "netting": {
                                          "sgov_sell_usd": os["sgov_sell_usd"], "sgov_buy_usd": os["sgov_buy_usd"]},
                                      "sent": sent, "deferred": os["deferred"], "skipped": os["skipped"],
                                      "dropped": os["dropped"], "paused": paused})

    # 6. state
    for leg in legs:
        res, prev = g1[leg], st["sleeves"]["G1"].get(leg) or {}
        pct = res.get("pct_vs_sma")
        band = res.get("band") or float((g1_cfg.get("signal") or {}).get("band", 0.02))
        entry = dict(prev)
        entry.update({"in": g1_in[leg], "last_close": res.get("close") if res["signal"] else prev.get("last_close"),
                      "sma200": res.get("sma200") if res["signal"] else prev.get("sma200"),
                      "band_state": (None if pct is None else "above" if pct >= band else "below" if pct <= -band else "inside"),
                      "last_signal": res.get("date") if res["signal"] else prev.get("last_signal")})
        if g1_in[leg] != prev.get("in"):
            entry["since"] = date
        st["sleeves"]["G1"][leg] = entry
    g2_st = st["sleeves"]["G2"]
    if g2.get("signal"):
        if g2_on != g2_st.get("on"):
            g2_st["since"] = date
        g2_st.update({"on": g2_on, "weekly_close": g2.get("weekly_close"), "ma10w": g2.get("ma10w"),
                      "sma200": g2.get("sma200"), "week_end": g2.get("week_end")})
    st["sleeves"]["G3"]["reserve"] = targets[vehicle].get("g3_reserve_usd")        # the reserve's part still in SGOV
    st["sleeves"]["G3"]["slots_usd"] = targets[vehicle].get("g3_slots_usd")        # what the promoted rules' slots hold or buy
    st["W10"] = {"open": w10_info["state"] in ("open", "pending_entry", "pending_exit"), "entry": w10_info.get("signal_date"),
                 "exit_due": w10_info.get("exit_due"), "state": w10_info["state"]}
    st["targets"] = {t: {**tg, "held_usd": held.get(t, 0.0), "delta_usd": round(float(tg["target_usd"]) - held.get(t, 0.0), 2)}
                     for t, tg in targets.items()}
    st["order_set"] = sent
    st["deferred"] = os["deferred"]
    if sent:
        st["G_at_last_order"] = G
        year = date[:4]
        st["weeks_with_orders"][year] = int(st["weeks_with_orders"].get(year, 0)) + 1

    # 7. the facts record (docs/phase-c/growth.md), then the Sunday email (design v4 §9)
    facts = _facts(run, cfg, st, date, friday, g1, g2, g1_in, g2_on, targets, held, os, sent, w10_info,
                   {"ira": nav_ira, "taxable": nav_taxable, "total": nav_total}, gov, sources,
                   {"growth_decision": decision["hash"], "governor": gov_rec["hash"], "order_set": order_rec["hash"]},
                   vehicle, rule_e_info, g3_book)
    growth_send.send_sunday(run, facts, intents)
    st["last_facts"] = facts
    run.result.nav = nav_total
    run.note(f"growth: G {G:.2f}, drawdown {gov['drawdown']:.1%}, {len(sent)} orders, {len(os['deferred'])} deferred")
    return facts


def _sleeve_row(name: str, ticker: str, state: str, changed: bool, tg: dict, held_usd: float, why: dict) -> dict:
    return {"name": name, "ticker": ticker, "state": state, "changed": bool(changed),
            "target_pct": round(float(tg.get("target_pct") or 0.0), 2), "target_usd": round(float(tg.get("target_usd") or 0.0), 2),
            "held_usd": round(float(held_usd), 2), "delta_usd": round(float(tg.get("target_usd") or 0.0) - float(held_usd), 2),
            "why": why}


def _facts(run: "Run", cfg: dict, st: dict, date: str, friday: str, g1: dict, g2: dict, g1_in: dict, g2_on: Any,
           targets: dict, held: dict, os: dict, sent: list[dict], w10_info: dict, nav: dict, gov: dict,
           sources: list[dict], ids: dict, vehicle: str, rule_e_info: dict | None = None,
           g3_book: dict | None = None) -> dict[str, Any]:
    sl = cfg.get("sleeves") or {}
    sig1 = (sl.get("G1") or {}).get("signal") or {}
    sleeves: list[dict] = []
    for leg, spec in ((sl.get("G1") or {}).get("legs") or {}).items():
        res = g1[leg]
        pct = res.get("pct_vs_sma")
        why = {"index": spec.get("index"), "close": res.get("close"), "sma200": res.get("sma200"),
               "pct_vs_sma": None if pct is None else round(100.0 * float(pct), 2), "band_pct": 2.0 if res.get("band") is None else round(100.0 * float(res["band"]), 2),
               "sma_days": int(sig1.get("sma_days", 200)),
               "session": res.get("date"), "signal": bool(res["signal"]), "reason": res.get("reason")}
        sleeves.append(_sleeve_row(f"G1 {leg}", leg, "in" if g1_in.get(leg) else "out", res.get("changed"), targets[leg],
                                   held.get(leg, 0.0), why))
    g2_cfg = sl.get("G2") or {}
    sig2 = g2_cfg.get("signal") or {}
    ibit = str(g2_cfg.get("instrument") or "IBIT")
    vc = g2.get("vol_cut") or {}
    why2 = {"weekly_close": g2.get("weekly_close"), "ma10w": g2.get("ma10w"), "sma200": g2.get("sma200"),
            "ma_weeks": int(sig2.get("weekly_ma_weeks", 10)), "sma_days": int(sig2.get("sma_days", 200)),
            "week_end": g2.get("week_end"), "above_ma10w": g2.get("above_ma10w"), "above_sma200": g2.get("above_sma200"),
            "vol60_pct": None if vc.get("vol60") is None else round(100.0 * float(vc["vol60"]), 1),
            "vol_cut_factor": float(st["sleeves"]["G2"].get("vol_cut_factor") or 1.0), "signal": bool(g2.get("signal")),
            "reason": g2.get("reason")}
    sleeves.append(_sleeve_row("G2 Bitcoin", ibit, "on" if g2_on else "off", bool(g2.get("changed")), targets[ibit],
                               held.get(ibit, 0.0), why2))
    tg_v = targets[vehicle]
    g3_book = g3_book or {}
    g3_facts = dict(g3_book.get("facts") or {})
    promoted = list(g3_book.get("promoted") or [])
    sleeves.append(_sleeve_row("G3 reserve and cash", vehicle, "reserve", False, tg_v, held.get(vehicle, 0.0),
                               {"g3_reserve_usd": tg_v.get("g3_reserve_usd"), "cash_sleeve_usd": tg_v.get("cash_sleeve_usd"),
                                "g3_slots_usd": tg_v.get("g3_slots_usd", 0.0), "promoted_rules": promoted,
                                "reason": ("held in SGOV until a G3 rule is promoted" if not promoted else
                                           "the reserve's cash part; the promoted rules' slots hold the rest")}))
    nav_ira_slots = float(nav["ira"]) or 1.0
    for slot in g3_facts.get("slots") or []:                 # one row per live gems slot (design v4 §3 G3, §4 single names)
        t, status = str(slot["ticker"]), str(slot.get("status") or "")
        usd = float(slot.get("usd") or 0.0)
        target = usd if status in ("open", "pending_entry") else 0.0
        sleeves.append(_sleeve_row(f"G3 {slot.get('label') or slot.get('rule')}", t,
                                   {"open": "open", "pending_entry": "entry", "pending_exit": "exit"}.get(status, status),
                                   status in ("pending_entry", "pending_exit"),
                                   {"target_pct": 100.0 * target / nav_ira_slots, "target_usd": target}, held.get(t, 0.0),
                                   {"rule": slot.get("rule"), "signal_date": slot.get("signal_date"), "z": slot.get("z"),
                                    "discount": slot.get("discount"), "exit_due": slot.get("exit_due"), "status": status,
                                    "reason": "a promoted gems rule's slot"}))
    step1 = [{"action": "sell_all" if o["action"] == "sell_all" else "sell", "ticker": o["ticker"],
              "held_usd": o["held_usd"], "usd": None if o["action"] == "sell_all" else o["usd"], "rank": o["rank"],
              "reason": o["reason"], "sleeve": o["sleeve"], "intent_id": o.get("intent_id"), "trade_id": o.get("trade_id")}
             for o in sent if o["action"] != "buy"]
    step2 = [{"action": "buy", "ticker": o["ticker"], "usd": o["usd"], "cash_cap_usd": o.get("cash_cap_usd"),
              "rank": o["rank"], "reason": o["reason"], "sleeve": o["sleeve"], "intent_id": o.get("intent_id"),
              "trade_id": o.get("trade_id")} for o in sent if o["action"] == "buy"]
    deferred = [{"action": o["action"], "ticker": o["ticker"], "usd": o["usd"], "held_usd": o.get("held_usd"),
                 "sleeve": o["sleeve"], "why": o.get("why")} for o in os["deferred"]]
    changes = sum(1 for s in sleeves if s["changed"])
    email_cfg = cfg.get("email") or {}
    risk_box = email_cfg.get("risk_box") or {}
    required = list(risk_box.get("required_for") or [])
    bought = {o["ticker"] for o in step2}
    lev_held = [t for t in required if held.get(t, 0.0) > 0 or t in bought]
    fund_numbers = risk_box.get("funds") or {}
    crash_day = risk_box.get("crash_day") or {}
    acct = str((cfg.get("accounts") or {}).get("switching") or "ira")
    account_cfg = (run.cfg.account.get("accounts") or {}).get(acct) or {}
    nav_ira = float(nav["ira"]) or 1.0
    crash = 0.0
    for leg in ((sl.get("G1") or {}).get("legs") or {}):
        exposure = max(held.get(leg, 0.0), float(targets[leg]["target_usd"]) if leg in bought else 0.0)
        crash += exposure / nav_ira * orders_mod.CRASH_DAY_LOSS["index_2x"]
    crash += max(held.get(ibit, 0.0), float(targets[ibit]["target_usd"]) if ibit in bought else 0.0) / nav_ira * orders_mod.CRASH_DAY_LOSS["btc"]
    monday = iso(next_trading_day(date))
    holiday = orders_mod.holiday_shift(date)
    return jsonable({
        "kind": "GROWTH", "label": "LIVE" if run.cfg.mode == "live" else "PAPER", "date": date,
        "week": int(pd.Timestamp(date).isocalendar()[1]), "friday": friday, "execute_date": monday,
        "summary": {"changes": changes, "orders": len(sent), "recommendation": bool(sent)},
        "nav": {"ira": round(nav["ira"], 2), "taxable": round(nav["taxable"], 2), "total": round(nav["total"], 2),
                "peak": round(float(gov["peak"]), 2), "drawdown": float(gov["drawdown"])},
        "governor": {"G": float(gov["G"]), "step": gov.get("step"), "full_until": gov["full_until"], "floor_at": gov["floor_at"],
                     "floor": gov["floor"], "hard_stop": bool(gov["hard_stop"]), "hard_stop_at": gov["hard_stop_at"],
                     "paused": bool(st.get("paused")), "hard_stop_hit_on": st.get("hard_stop_hit_on")},
        "sleeves": sleeves,
        "orders": {"step1": step1, "step2": step2, "deferred": deferred, "dropped": os["dropped"], "skipped": os["skipped"],
                   "sgov_sell_usd": os["sgov_sell_usd"], "sgov_buy_usd": os["sgov_buy_usd"], "max_orders": os["max_orders"],
                   "queued_cash_frac": os["queued_cash_frac"],
                   "market_hours_cash_frac": float((cfg.get("rebalance") or {}).get("market_hours_cash_frac", 0.95))},
        "w10": w10_info,
        "holiday": holiday,
        "risk": {"leveraged_held": lev_held, "required_for": required, "crash_day_loss_pct": round(100.0 * crash, 1),
                 "hard_stop_pct": round(100.0 * float(gov["hard_stop_at"]), 1), "drawdown_limit_pct": round(100.0 * float(cfg.get("drawdown_limit", 0.40)), 1),
                 # the risk box's numbers (track 32 §6), copied from the constitution so the validator checks them here
                 "funds": {t: dict(fund_numbers[t]) for t in lev_held if t in fund_numbers},
                 "crash_day_year": crash_day.get("year"), "crash_day_index_pct": crash_day.get("index_pct"),
                 "ira": dict(email_cfg.get("ira_withdrawal") or {})},
        "rule_e": rule_e_info or {},
        "g3": g3_facts,
        "limited_margin": bool(account_cfg.get("limited_margin", True)),
        "vehicle": vehicle,
        "sources": sources, "ids": ids, "account": acct,
        "constitution_version": run.cfg.version,
    })
