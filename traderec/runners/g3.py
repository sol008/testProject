"""G3, the gems runner (design v4 §3 G3, §10 "the G3a/G3b screens", Appendix A.2-A.3; Phase C4a).

`daily(run)` is the daily run's hook (`pipeline._daily`, right after Rule E, while `growth.enabled`). For each rule
of `growth.sleeves.G3.rules` whose status is `shadow` or `live` (the country-ETF rule is an owner decision and
gets only a state note) it:

1. settles yesterday's pending entries and exits: the shadow book fills at the next session's open with the fill
   model's slippage (as the pipeline's `_shadow_fills` does); a live slot takes its paper fill from the Sunday job's
   order (`state.fills` by intent id), or is voided when the order was cancelled;
2. checks every open slot's exit (the 60-calendar-day stop or the discount back at its mean for the CEF rule; the
   -3% closes, the conversion or a withdrawn filing for a trust) and marks it `pending_exit`: the shadow book sells
   at the next open, a live slot is sold by the next Sunday email ("Sell all <ticker>" in Step 1);
3. screens the universe through `run.bars()` (the fund's price bars and its NAV series `X<ticker>X`; for a trust
   the coin's bars, or a sponsor NAV series) with the pure checks of `traderec.modules.g3_gems`, fails closed per
   fund with one `data` alert per missing series per run, counts the week's triggers for crash mode, and opens the
   widest discounts first up to the free slots: `pending_entry` (the shadow book buys at the next open; a live
   entry is bought by the next Sunday email at Monday's open);
4. scores each closed event (the total-return basis; the random-entry baseline for a fund, the coin's return for a
   trust), keeps `state.growth.sleeves.G3.rules.<name>.{status, open_slots, events, shadow_stats, promotion,
   crash_mode, last_screen, catalysts}` and writes `g3_shadow` ledger records for the signals, entries, exits and,
   at the first run of each quarter, the promotion snapshot.

The crypto-trust catalyst is one `EdgarClient.search` per trust per week (forms S-1, S-1/A, S-3, S-3/A and RW, the
trust's own CIK, the last 365 days), cached in the state with its date; any EDGAR error (`EdgarAccessDenied`,
`BudgetExhausted`, a network failure) fails closed with a `data` alert and no trigger until a later search works.

`sunday_book(...)` is the Sunday job's view of the live rules: the slots held, the pending entries to buy from the
reserve (5% of the IRA x G each, within the single-name caps) and the pending exits to sell; `record_orders(...)`
ties the orders the Sunday job sent to their slots. One book per rule: a live slot is never shadow-filled.
"""
from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

import pandas as pd

from traderec import growth
from traderec.data.edgar import group_filings
from traderec.market_calendar import iso, next_trading_day
from traderec.modules import g3_gems as G
from traderec.runners import edgar as edgar_runner
from traderec.state import jsonable

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run

__all__ = ["CEF_RULE", "LABELS", "OWNER_DECISION_RULES", "TRUST_RULE", "daily", "new_rule_state", "record_orders",
           "rule_label", "rule_state", "rules_of", "sunday_book"]

CEF_RULE = "cef_crash_discount"
TRUST_RULE = "crypto_trust_discount"
LABELS = {CEF_RULE: "CEF crash-discount rule", TRUST_RULE: "crypto-trust discount rule",
          "country_devaluation": "post-devaluation country ETF"}
OWNER_DECISION_RULES = {"country_devaluation": "shadow by owner decision (design v4 §3 G3c, decision 8): nothing is "
                                               "screened until the owner takes it up"}
MODULE = "G3"                          # the lot / order module of a live slot
CATALYST_FORMS = "S-1,S-1/A,S-3,S-3/A,RW"   # RW (a registration withdrawal) rides the same search, so one call a week
CATALYST_LOOKBACK_DAYS = 365
CATALYST_REFRESH_DAYS = 7
VOID_AFTER_DAYS = 10                   # a shadow entry or exit with no price data this long after its signal is void
PENDING_MAX_DAYS = 14                  # a live entry not bought within two weeks (the book paused, no slot) is void
WEEKS_KEPT = 8                         # weeks of trigger and entry counts kept in the state


# --------------------------------------------------------------------------------------------------------
# State
# --------------------------------------------------------------------------------------------------------

def rule_label(name: str, cfg_rule: dict | None = None) -> str:
    return str((cfg_rule or {}).get("label") or LABELS.get(name) or name.replace("_", " "))


def new_rule_state(status: str) -> dict[str, Any]:
    """A fresh `state.growth.sleeves.G3.rules.<name>` block (design v4 A.3, plus the runner's keys)."""
    return {"status": str(status), "open_slots": [], "events": [], "shadow_stats": G.shadow_stats([]), "promotion": None,
            "crash_mode": None, "triggers_by_week": {}, "entries_by_week": {}, "last_screen": None,
            "promotion_quarter": None, "catalysts": {}, "note": None}


def rule_state(g3_state: dict, name: str, status: str) -> dict[str, Any]:
    """The rule's state block, created when missing; `status` follows the constitution (the owner's edit)."""
    rules = g3_state.setdefault("rules", {})
    rs = rules.get(name)
    if not isinstance(rs, dict):
        rs = rules[name] = new_rule_state(status)
    for key, value in new_rule_state(status).items():
        rs.setdefault(key, value)
    if rs.get("status") != status:
        rs["status_changed"] = {"from": rs.get("status"), "to": status}
    rs["status"] = str(status)
    return rs


def rules_of(cfg_growth: dict) -> dict[str, dict]:
    """`growth.sleeves.G3.rules` ({} when absent)."""
    return dict((((cfg_growth.get("sleeves") or {}).get("G3") or {}).get("rules")) or {})


def _quarter(date: str) -> str:
    y, m = int(str(date)[:4]), int(str(date)[5:7])
    return f"{y}-Q{(m - 1) // 3 + 1}"


def _slot_count(rs: dict) -> int:
    return sum(1 for s in rs["open_slots"] if s.get("status") in ("pending_entry", "open", "pending_exit"))


# --------------------------------------------------------------------------------------------------------
# Run context: bars, alerts, records
# --------------------------------------------------------------------------------------------------------

class _Ctx:
    """One rule's work in one run: the bars it read, the alerts it raised (once each) and the records it wrote."""

    def __init__(self, run: "Run", name: str, cfg_rule: dict, rs: dict) -> None:
        self.run, self.name, self.cfg, self.rs = run, name, cfg_rule, rs
        self.live = str(cfg_rule.get("status") or "shadow") == "live"
        self.label = rule_label(name, cfg_rule)
        self._bars: dict[str, pd.DataFrame | None] = {}
        self._alerted: set[str] = set()
        self.fills = {str(f.get("intent_id")): f for f in (run.state.get("fills") or []) if isinstance(f, dict)}
        self.pending_ids = {o.intent_id for o in run.broker.pending()}
        self.counts = {"signals": 0, "filtered": 0, "entries": 0, "exits": 0, "void": 0}

    def bars(self, ticker: str | None, what: str = "price bars") -> pd.DataFrame | None:
        """Daily bars cut at the run date, or None (one `data` alert per missing series per run: fail closed)."""
        if not ticker:
            return None
        if ticker not in self._bars:
            why = "an empty series"
            try:
                df = self.run.bars(ticker)
                df = df if df is not None and len(df) else None
            except Exception as exc:  # noqa: BLE001 - a missing series is a data alert, never a failed run
                df = None
                why = f"{type(exc).__name__}: {str(exc)[:120]}"
            if df is None:
                self.alert(f"G3 {self.name}: no {what} for {ticker} ({why}): not screened")
            self._bars[ticker] = df
        return self._bars[ticker]

    def alert(self, msg: str) -> None:
        if msg not in self._alerted:
            self._alerted.add(msg)
            self.run.alert("data", msg)

    def log(self, event: str, payload: dict) -> dict:
        return self.run.log("g3_shadow", jsonable({"rule": self.name, "event": event, "date": self.run.date, **payload}))

    def slip(self, ticker: str) -> float:
        return float(self.run.cfg.slippage_bps(ticker)) / 1e4


# --------------------------------------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------------------------------------

def daily(run: "Run") -> None:
    """The daily G3 hook (see the module docstring). Never raises: a rule's failure is a `data` alert."""
    if not growth.enabled(run.cfg):
        return
    cfg = growth.cfg_growth(run.cfg)
    st = growth.state_growth(run.state)
    g3 = st["sleeves"].setdefault("G3", {"reserve": None, "rules": {}})
    for name, cfg_rule in rules_of(cfg).items():
        cfg_rule = dict(cfg_rule or {})
        status = str(cfg_rule.get("status") or "shadow")
        if name in OWNER_DECISION_RULES:
            rs = rule_state(g3, name, status)
            rs["note"] = OWNER_DECISION_RULES[name]
            continue
        if status not in ("shadow", "live"):
            rs = rule_state(g3, name, status)
            rs["note"] = f"status {status!r}: not screened"
            continue
        rs = rule_state(g3, name, status)
        ctx = _Ctx(run, name, cfg_rule, rs)
        try:
            if name == CEF_RULE:
                _cef_daily(ctx)
            elif name == TRUST_RULE:
                _trust_daily(ctx)
            else:
                rs["note"] = "no runner for this rule: not screened"
                continue
        except Exception as exc:  # noqa: BLE001 - fail closed: the rule is not screened tonight, and the run goes on
            ctx.alert(f"G3 {name}: not screened tonight ({type(exc).__name__}: {str(exc)[:160]})")
            ctx.log("error", {"error": f"{type(exc).__name__}: {exc}"})
            continue
        _refresh_stats(ctx)
        _promotion_snapshot(ctx)
        parts = [f"{k} {v}" for k, v in ctx.counts.items() if v]
        screen = rs.get("last_screen") or {}
        run.note(f"G3 {name} ({status}): screened {screen.get('screened', 0)}"
                 + (f", missing {len(screen.get('missing') or [])}" if screen.get("missing") else "")
                 + (f"; {', '.join(parts)}" if parts else "")
                 + ("; crash mode" if rs.get("crash_mode") else ""))


# --------------------------------------------------------------------------------------------------------
# Settling entries and exits
# --------------------------------------------------------------------------------------------------------

def _settle(ctx: _Ctx) -> None:
    """Yesterday's pending entries and exits: the shadow book at the next open with slippage, a live slot from its
    paper fill; closed and void slots move from `open_slots` to `events`."""
    for slot in list(ctx.rs["open_slots"]):
        status = slot.get("status")
        if status == "pending_entry":
            _settle_live_entry(ctx, slot) if slot.get("book") == "live" else _settle_shadow_entry(ctx, slot)
        elif status == "pending_exit":
            _settle_live_exit(ctx, slot) if slot.get("book") == "live" else _settle_shadow_exit(ctx, slot)
    done = [s for s in ctx.rs["open_slots"] if s.get("status") in ("closed", "void")]
    if done:
        ctx.rs["events"].extend(done)
        ctx.rs["open_slots"] = [s for s in ctx.rs["open_slots"] if s.get("status") not in ("closed", "void")]


def _next_open(bars: pd.DataFrame | None, after: str) -> tuple[pd.Timestamp | None, float | None]:
    if bars is None or not len(bars):
        return None, None
    idx = bars.index[bars.index > pd.Timestamp(after)]
    if not len(idx):
        return None, None
    day = idx[0]
    px = G.fnum(bars.at[day, "open"]) if "open" in bars else None
    return day, px


def _late(ctx: _Ctx, since: str) -> bool:
    return (pd.Timestamp(ctx.run.date) - pd.Timestamp(since)).days > VOID_AFTER_DAYS


def _void(ctx: _Ctx, slot: dict, reason: str) -> None:
    slot.update(status="void", void_reason=reason, exit_date=ctx.run.date)
    ctx.counts["void"] += 1
    ctx.log("void", {"id": slot["id"], "ticker": slot["ticker"], "book": slot["book"], "reason": reason})


def _open_slot(ctx: _Ctx, slot: dict, day: str, price: float, bars: pd.DataFrame | None, *, usd: float | None = None) -> None:
    slot.update(status="open", entry_date=day, entry_price=float(price), entry_tr=G.total_return_price(bars, day, price),
                usd=usd if usd is not None else slot.get("usd"))
    if slot.get("kind") == "cef":
        slot["exit_due"] = G.cef_exit_due(day, int(ctx.cfg.get("hold_days", 60)))
    if slot.get("kind") == "trust":
        slot["entry_discount"] = slot.get("discount")
        slot["min_discount"] = slot.get("discount")
        coin = ctx.bars(slot.get("coin"), what="coin bars") if slot.get("coin") else None
        slot["coin_entry"] = G.fnum(coin["close"].loc[:pd.Timestamp(day)].iloc[-1]) if coin is not None and len(coin["close"].loc[:pd.Timestamp(day)]) else None
    ctx.counts["entries"] += 1
    ctx.log("entry", {k: slot.get(k) for k in ("id", "ticker", "book", "signal_date", "entry_date", "entry_price", "exit_due",
                                                 "usd", "z", "discount", "intent_id", "trade_id", "crash_mode")})


def _settle_shadow_entry(ctx: _Ctx, slot: dict) -> None:
    bars = ctx.bars(slot["ticker"])
    day, px = _next_open(bars, slot["signal_date"])
    if day is None or px is None or px <= 0:
        if _late(ctx, slot["signal_date"]):
            _void(ctx, slot, "no price data after the signal")
        return
    _open_slot(ctx, slot, iso(day), px * (1.0 + ctx.slip(slot["ticker"])), bars)


def _settle_live_entry(ctx: _Ctx, slot: dict) -> None:
    intent_id = slot.get("intent_id")
    if not intent_id:
        if (pd.Timestamp(ctx.run.date) - pd.Timestamp(slot["signal_date"])).days > PENDING_MAX_DAYS:
            _void(ctx, slot, "not bought within two weeks of the signal (no free slot, or the book was paused)")
        return
    fill = ctx.fills.get(str(intent_id))
    if fill is not None and G.fnum(fill.get("price")):
        _open_slot(ctx, slot, str(fill.get("fill_date") or ctx.run.date), float(fill["price"]), ctx.bars(slot["ticker"]),
                   usd=G.fnum(fill.get("dollars")))
        return
    if intent_id in ctx.pending_ids:
        return                                                     # queued for the next open
    reason = _cancel_reason(ctx.run, str(intent_id)) or "the order is neither pending nor filled"
    _void(ctx, slot, f"order {intent_id} cancelled: {reason}")


def _close_slot(ctx: _Ctx, slot: dict, day: str, price: float, bars: pd.DataFrame | None) -> None:
    """Close a slot at `price` on `day` and score it: the total-return basis; the random-entry baseline (a fund)
    or the coin's return (a trust) gives the excess."""
    entry_tr = G.fnum(slot.get("entry_tr")) or float(slot["entry_price"])
    exit_tr = G.total_return_price(bars, day, price)
    ret = exit_tr / entry_tr - 1.0 if entry_tr else None
    slot.update(status="closed", exit_date=day, exit_price=float(price), exit_tr=exit_tr, **{"return": ret})
    if slot.get("kind") == "cef":
        base = G.random_entry_baseline(bars["adj_close"], slot["entry_date"], int(ctx.cfg.get("horizon_sessions", G.DEFAULT_HORIZON)),
                                       int(ctx.cfg.get("lookback", G.DEFAULT_LOOKBACK)),
                                       int(ctx.cfg.get("baseline_min_windows", G.DEFAULT_MIN_WINDOWS))) \
            if bars is not None and "adj_close" in bars else None
        slot["baseline"] = base
        slot["excess"] = None if (base is None or ret is None) else ret - base
    elif slot.get("kind") == "trust":
        coin = ctx.bars(slot.get("coin"), what="coin bars") if slot.get("coin") else None
        c0, c1 = G.fnum(slot.get("coin_entry")), None
        if coin is not None:
            upto = coin["close"].loc[:pd.Timestamp(day)].dropna()
            c1 = G.fnum(upto.iloc[-1]) if len(upto) else None
        slot["coin_exit"] = c1
        slot["coin_return"] = (c1 / c0 - 1.0) if (c0 and c1) else None
        slot["excess"] = None if (slot["coin_return"] is None or ret is None) else ret - slot["coin_return"]
        slot["widened"] = G.widened(slot.get("entry_discount"), slot.get("min_discount"),
                                    float((ctx.cfg.get("promotion") or {}).get("max_widening", G.WIDENING_POINTS)))
    ctx.counts["exits"] += 1
    ctx.log("exit", {k: slot.get(k) for k in ("id", "ticker", "book", "signal_date", "entry_date", "entry_price", "exit_date",
                                                "exit_price", "exit_reason", "return", "baseline", "coin_return", "excess",
                                                "widened", "usd", "exit_intent_id", "trade_id")})


def _settle_shadow_exit(ctx: _Ctx, slot: dict) -> None:
    bars = ctx.bars(slot["ticker"])
    since = str(slot.get("exit_signal_date") or ctx.run.date)
    day, px = _next_open(bars, since)
    if day is None or px is None or px <= 0:
        if _late(ctx, since):
            _void(ctx, slot, "no price data at the exit")
        return
    _close_slot(ctx, slot, iso(day), px * (1.0 - ctx.slip(slot["ticker"])), bars)


def _settle_live_exit(ctx: _Ctx, slot: dict) -> None:
    intent_id = slot.get("exit_intent_id")
    if not intent_id:
        return                                                     # the next Sunday email sells it
    fill = ctx.fills.get(str(intent_id))
    if fill is not None and G.fnum(fill.get("price")):
        _close_slot(ctx, slot, str(fill.get("fill_date") or ctx.run.date), float(fill["price"]), ctx.bars(slot["ticker"]))
        return
    if intent_id in ctx.pending_ids:
        return
    reason = _cancel_reason(ctx.run, str(intent_id)) or "the order is neither pending nor filled"
    ctx.alert(f"G3 {ctx.name}: the exit order {intent_id} for {slot['ticker']} was cancelled ({reason}); the next "
              "Sunday email sells it again")
    slot["exit_intent_id"] = None


def _cancel_reason(run: "Run", intent_id: str) -> str | None:
    for o in reversed(getattr(run.broker, "cancelled", None) or []):
        if o.intent_id == intent_id:
            return str(o.meta.get("cancel_reason") or "") or None
    return None


# --------------------------------------------------------------------------------------------------------
# G3a: the CEF crash-discount rule
# --------------------------------------------------------------------------------------------------------

def _live_next_chance(date: str) -> str:
    """For a live slot: the Monday after the next Sunday email's Monday (the opportunity after the next one)."""
    d = pd.Timestamp(date)
    sunday = d + pd.Timedelta(days=(6 - d.weekday()) % 7)
    return iso(next_trading_day((sunday + pd.Timedelta(days=7)).strftime("%Y-%m-%d")))


def _cef_daily(ctx: _Ctx) -> None:
    _settle(ctx)
    _cef_exits(ctx)
    _cef_screen(ctx)


def _cef_exits(ctx: _Ctx) -> None:
    for slot in ctx.rs["open_slots"]:
        if slot.get("status") != "open":
            continue
        bars = ctx.bars(slot["ticker"])
        nav = ctx.bars(slot.get("nav_symbol"), what="NAV series")
        if bars is None:
            continue
        chance = _live_next_chance(ctx.run.date) if slot.get("book") == "live" else None
        chk = G.cef_exit_check(bars, nav, ctx.run.date, slot, ctx.cfg, next_chance=chance)
        slot["last_check"] = {"date": ctx.run.date, "discount": chk["discount"], "mean252": chk["mean252"],
                              "days_held": chk["days_held"]}
        if chk["exit"]:
            slot.update(status="pending_exit", exit_reason=chk["reason"], exit_signal_date=ctx.run.date)
            ctx.log("exit_signal", {"id": slot["id"], "ticker": slot["ticker"], "book": slot["book"], "reason": chk["reason"],
                                    "reasons": chk["reasons"], "discount": chk["discount"], "mean252": chk["mean252"],
                                    "exit_due": chk["exit_due"]})


def _cef_screen(ctx: _Ctx) -> None:
    rs, cfg, date = ctx.rs, ctx.cfg, ctx.run.date
    universe = [str(t).upper() for t in (cfg.get("universe") or [])]
    funds = cfg.get("funds") or {}
    pattern = str(cfg.get("nav_symbol") or "X{ticker}X")
    week = G.iso_week(date)
    held = {s["ticker"] for s in rs["open_slots"]}
    triggers: list[dict] = []
    screened: list[str] = []
    missing: list[str] = []
    for t in universe:
        bars = ctx.bars(t)
        nav = ctx.bars(G.nav_symbol(t, pattern), what="NAV series")
        if bars is None or nav is None:
            missing.append(t)
            continue
        chk = G.cef_crash_check(bars, nav, date, cfg, funds.get(t) or {})
        screened.append(t)
        if chk["trigger"]:
            triggers.append({**chk, "ticker": t})
        elif chk["z"] is not None and chk["z"] <= -abs(float(cfg.get("z", 2.5))):
            ctx.counts["filtered"] += 1                        # a near-miss: the z condition held, a filter failed
            ctx.log("filtered", {"ticker": t, "z": chk["z"], "discount": chk["discount"], "reasons": chk["reasons"]})
    tw = rs.setdefault("triggers_by_week", {})
    this_week = list(tw.get(week) or [])
    for tr in triggers:
        if tr["ticker"] not in this_week:
            this_week.append(tr["ticker"])
    tw[week] = this_week
    rs["triggers_by_week"] = dict(sorted(tw.items())[-WEEKS_KEPT:])
    rs["crash_mode"] = G.crash_mode_update(rs.get("crash_mode"), date, len(this_week), cfg)
    ew = rs.setdefault("entries_by_week", {})
    capacity = G.entry_capacity(_slot_count(rs), int(cfg.get("slots", 2)), rs["crash_mode"], int(ew.get(week) or 0))
    entered: list[str] = []
    for tr in G.rank_triggers(triggers):
        t = tr["ticker"]
        if t in held:
            ctx.log("filtered", {"ticker": t, "z": tr["z"], "discount": tr["discount"], "reasons": ["already in a slot"]})
            continue
        ctx.counts["signals"] += 1
        if capacity <= 0:
            free = int(cfg.get("slots", 2)) - _slot_count(rs)
            why = "no free slot" if free <= 0 else "crash mode: this week's entries are used"
            ctx.log("filtered", {"ticker": t, "z": tr["z"], "discount": tr["discount"], "reasons": [why]})
            continue
        slot = {"id": f"G3-{CEF_RULE}-{date}-{t}", "rule": CEF_RULE, "kind": "cef", "ticker": t,
                "nav_symbol": G.nav_symbol(t, pattern), "book": "live" if ctx.live else "shadow", "status": "pending_entry",
                "signal_date": date, "week": week, "z": tr["z"], "discount": tr["discount"], "mean252": tr["mean252"],
                "sd252": tr["sd252"], "price": tr["price"], "adv_usd": tr["adv_usd"], "leverage": tr["leverage"],
                "crash_mode": bool(rs["crash_mode"]), "entry_date": None, "entry_price": None, "exit_due": None,
                "exit_signal_date": None, "exit_reason": None, "exit_date": None, "exit_price": None, "return": None,
                "baseline": None, "excess": None, "usd": None, "intent_id": None, "trade_id": None, "exit_intent_id": None}
        rs["open_slots"].append(slot)
        held.add(t)
        entered.append(t)
        capacity -= 1
        ew[week] = int(ew.get(week) or 0) + 1
        ctx.log("signal", {k: slot[k] for k in ("id", "ticker", "book", "signal_date", "z", "discount", "mean252", "sd252",
                                                  "price", "adv_usd", "leverage", "crash_mode")} | {"reasons": tr["reasons"]})
    rs["entries_by_week"] = dict(sorted(ew.items())[-WEEKS_KEPT:])
    rs["last_screen"] = {"date": date, "screened": len(screened), "missing": missing, "triggers": [t["ticker"] for t in triggers],
                         "entered": entered, "crash_mode": bool(rs["crash_mode"]), "week_triggers": len(this_week)}


# --------------------------------------------------------------------------------------------------------
# G3b: the crypto-trust discount with a filed catalyst
# --------------------------------------------------------------------------------------------------------

def _trust_daily(ctx: _Ctx) -> None:
    _settle(ctx)
    universe = [dict(t) for t in (ctx.cfg.get("universe") or []) if isinstance(t, dict) and t.get("ticker")]
    by_ticker = {str(t["ticker"]).upper(): t for t in universe}
    _trust_exits(ctx, by_ticker)
    _trust_screen(ctx, universe)


def _trust_series(ctx: _Ctx, trust: dict) -> tuple[pd.Series | None, pd.Series | None, str | None]:
    """(price closes, NAV series, problem): a sponsor NAV series when the provider has one, else the NAV rebuilt
    from the coin's closes; None with a problem string when an input is missing (fail closed)."""
    ticker = str(trust["ticker"]).upper()
    bars = ctx.bars(ticker)
    if bars is None:
        return None, None, f"no price bars for {ticker}"
    price = pd.to_numeric(bars["close"], errors="coerce")
    if trust.get("nav_symbol"):
        nav_bars = ctx.bars(str(trust["nav_symbol"]), what="NAV series")
        if nav_bars is None:
            return price, None, f"no NAV series {trust['nav_symbol']} for {ticker}"
        return price, pd.to_numeric(nav_bars["close"], errors="coerce"), None
    missing = [k for k in ("coin", "coins_per_share", "as_of", "fee_annual") if trust.get(k) in (None, "")]
    if missing:
        return price, None, f"{ticker}: trust NAV inputs missing ({', '.join(missing)})"
    coin = ctx.bars(str(trust["coin"]), what="coin bars")
    if coin is None:
        return price, None, f"no coin bars {trust['coin']} for {ticker}"
    nav = G.trust_nav_series(coin["close"], trust.get("coins_per_share"), trust.get("as_of"), trust.get("fee_annual"))
    if nav.empty:
        return price, None, f"{ticker}: the NAV could not be rebuilt from {trust['coin']}"
    return price, nav, None


def _trust_exits(ctx: _Ctx, by_ticker: dict[str, dict]) -> None:
    for slot in ctx.rs["open_slots"]:
        if slot.get("status") != "open":
            continue
        trust = by_ticker.get(slot["ticker"]) or {"ticker": slot["ticker"], "coin": slot.get("coin")}
        price, nav, problem = _trust_series(ctx, trust)
        if problem:
            ctx.alert(f"G3 {ctx.name}: {problem}: the open slot is not checked tonight")
            continue
        catalyst = _catalyst(ctx, trust) if trust.get("cik") else None
        chk = G.crypto_trust_exit_check(price, nav, ctx.run.date, slot, ctx.cfg, catalyst, trust)
        if chk["discount"] is not None:
            slot["min_discount"] = min(float(slot.get("min_discount") if slot.get("min_discount") is not None else chk["discount"]),
                                       float(chk["discount"]))
            slot["widened"] = G.widened(slot.get("entry_discount"), slot["min_discount"],
                                        float((ctx.cfg.get("promotion") or {}).get("max_widening", G.WIDENING_POINTS)))
        slot["last_check"] = {"date": ctx.run.date, "discount": chk["discount"], "min_discount": slot.get("min_discount")}
        if chk["exit"]:
            slot.update(status="pending_exit", exit_reason=chk["reason"], exit_signal_date=ctx.run.date)
            ctx.log("exit_signal", {"id": slot["id"], "ticker": slot["ticker"], "book": slot["book"], "reason": chk["reason"],
                                    "reasons": chk["reasons"], "discount": chk["discount"], "widened": slot.get("widened")})


def _trust_screen(ctx: _Ctx, universe: list[dict]) -> None:
    rs, cfg, date = ctx.rs, ctx.cfg, ctx.run.date
    held = {s["ticker"] for s in rs["open_slots"]}
    screened: list[str] = []
    missing: list[str] = []
    entered: list[str] = []
    triggers: list[str] = []
    for trust in universe:
        ticker = str(trust["ticker"]).upper()
        price, nav, problem = _trust_series(ctx, trust)
        if problem:
            ctx.alert(f"G3 {ctx.name}: {problem}: not screened")
            missing.append(ticker)
            continue
        if not trust.get("cik"):
            ctx.alert(f"G3 {ctx.name}: {ticker} has no CIK in the constitution: the catalyst cannot be checked")
            missing.append(ticker)
            continue
        catalyst = _catalyst(ctx, trust)
        chk = G.crypto_trust_check(price, nav, date, cfg, catalyst, cik=trust.get("cik"))
        screened.append(ticker)
        if not chk["trigger"]:
            if chk["discount"] is not None and chk["discount"] <= float(cfg.get("discount_le", -0.25)):
                ctx.counts["filtered"] += 1
                ctx.log("filtered", {"ticker": ticker, "discount": chk["discount"], "reasons": chk["reasons"]})
            continue
        triggers.append(ticker)
        if ticker in held:
            continue
        ctx.counts["signals"] += 1
        slot = {"id": f"G3-{TRUST_RULE}-{date}-{ticker}", "rule": TRUST_RULE, "kind": "trust", "ticker": ticker,
                "coin": trust.get("coin"), "book": "live" if ctx.live else "shadow", "status": "pending_entry",
                "signal_date": date, "week": G.iso_week(date), "discount": chk["discount"], "price": chk["price"],
                "nav": chk["nav"], "catalyst": (chk.get("catalyst") or {}).get("kind"),
                "catalyst_detail": (catalyst or {}).get("filing") or {"decision_date": (catalyst or {}).get("decision_date")},
                "entry_date": None, "entry_price": None, "entry_discount": None, "min_discount": None, "widened": False,
                "exit_signal_date": None, "exit_reason": None, "exit_date": None, "exit_price": None, "return": None,
                "coin_entry": None, "coin_exit": None, "coin_return": None, "excess": None, "usd": None, "intent_id": None,
                "trade_id": None, "exit_intent_id": None, "z": None}
        rs["open_slots"].append(slot)
        held.add(ticker)
        entered.append(ticker)
        ctx.log("signal", {k: slot[k] for k in ("id", "ticker", "book", "signal_date", "discount", "price", "nav", "catalyst",
                                                  "catalyst_detail")} | {"reasons": chk["reasons"]})
    rs["last_screen"] = {"date": date, "screened": len(screened), "missing": missing, "triggers": triggers, "entered": entered,
                         "crash_mode": False}


def _catalyst(ctx: _Ctx, trust: dict) -> dict | None:
    """The trust's catalyst ({"filing", "decision_date"}), from the state's weekly cache or one EDGAR search;
    None (no trigger) when the search failed or no EDGAR source exists."""
    ticker = str(trust["ticker"]).upper()
    cache = ctx.rs.setdefault("catalysts", {}).setdefault(ticker, {})
    decision = trust.get("decision_date")
    run_date = ctx.run.date
    checked = cache.get("checked")
    fresh = checked and (pd.Timestamp(run_date) - pd.Timestamp(checked)).days < CATALYST_REFRESH_DAYS
    if fresh and not cache.get("error"):
        return {"filing": cache.get("filing"), "decision_date": decision}
    if cache.get("attempted") == run_date:                      # one attempt a day
        return None if cache.get("error") else {"filing": cache.get("filing"), "decision_date": decision}
    cache["attempted"] = run_date
    edgar_src, _ = edgar_runner.sources(ctx.run, edgar_runner.config(ctx.run))
    if edgar_src is None:
        cache["error"] = "no EDGAR source"
        ctx.alert(f"G3 {ctx.name}: the data provider has no EDGAR source, so {ticker}'s catalyst cannot be checked")
        return None
    start = (pd.Timestamp(run_date) - pd.Timedelta(days=CATALYST_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    try:
        hits = edgar_src.search(CATALYST_FORMS, start, run_date, ciks=[int(trust["cik"])])
    except Exception as exc:  # noqa: BLE001 - EdgarAccessDenied, BudgetExhausted, a network failure: fail closed
        cache["error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
        ctx.alert(f"G3 {ctx.name}: EDGAR search for {ticker}'s conversion filing failed ({cache['error']}): no catalyst "
                  "tonight")
        ctx.log("catalyst_error", {"ticker": ticker, "error": cache["error"]})
        return None
    filings = sorted(group_filings(hits, forms=G.CONVERSION_FORMS), key=lambda f: str(f.get("file_date") or ""))
    withdrawals = [f for f in group_filings(hits, forms=("RW",))]
    filing = None
    if filings:
        latest = filings[-1]
        filed = str(latest.get("file_date") or "")
        withdrawn = any(str(w.get("file_date") or "") >= filed for w in withdrawals)
        adsh = str(latest.get("adsh") or "")
        filing = {"form": latest.get("form"), "filed": filed, "adsh": adsh, "cik": int(trust["cik"]),
                  "url": f"https://www.sec.gov/Archives/edgar/data/{int(trust['cik'])}/{adsh.replace('-', '')}/",
                  "withdrawn": withdrawn}
    cache.update(checked=run_date, error=None, filing=filing, searched={"forms": CATALYST_FORMS, "from": start, "to": run_date,
                                                                        "hits": len(hits)})
    ctx.log("catalyst", {"ticker": ticker, "filing": filing, "decision_date": decision, "hits": len(hits)})
    return {"filing": filing, "decision_date": decision}


# --------------------------------------------------------------------------------------------------------
# Statistics, the promotion test and its quarterly snapshot
# --------------------------------------------------------------------------------------------------------

def promotion_test(name: str, events: list[dict], cfg_rule: dict | None) -> dict:
    """The rule's pre-registered promotion test on its closed events (`traderec.modules.g3_gems`)."""
    closed = [e for e in events if isinstance(e, dict) and e.get("status") == "closed"]
    rule = (cfg_rule or {}).get("promotion") or {}
    if name == TRUST_RULE:
        return G.trust_promotion_test(closed, rule)
    return G.cef_promotion_test(closed, rule=rule)


def _refresh_stats(ctx: _Ctx) -> None:
    closed = [e for e in ctx.rs["events"] if isinstance(e, dict) and e.get("status") == "closed"]
    stats = G.shadow_stats(closed)
    stats["basis"] = "the coin" if ctx.name == TRUST_RULE else "random entry"
    stats["open"] = _slot_count(ctx.rs)
    ctx.rs["shadow_stats"] = stats
    ctx.rs["promotion"] = promotion_test(ctx.name, closed, ctx.cfg)


def _promotion_snapshot(ctx: _Ctx) -> None:
    """One `g3_shadow` "promotion_test" record at the first run of each quarter (design §8 "Quarterly: G3
    promotion tests"), with the test as it stands then."""
    q = _quarter(ctx.run.date)
    if ctx.rs.get("promotion_quarter") == q:
        return
    ctx.rs["promotion_quarter"] = q
    ctx.log("promotion_test", {"quarter": q, "status": ctx.rs["status"], "shadow_stats": ctx.rs["shadow_stats"],
                               "promotion": ctx.rs["promotion"]})


# --------------------------------------------------------------------------------------------------------
# The Sunday job's view of the live rules
# --------------------------------------------------------------------------------------------------------

def sunday_book(run: "Run", st: dict, cfg_growth: dict, nav_ira: float, G_factor: float, closes: dict[str, float],
                acct: str, *, paused: bool = False) -> dict[str, Any]:
    """The live rules' slots for the Sunday job (design v4 §3 G3, §4 "Single names").

    Returns {"held": {ticker: usd at Friday's close}, "buys": [...], "sells": [...], "waiting": [...],
    "reserve_usd" (the reserve, 15% x G x the IRA), "sgov_usd" (its part still in SGOV), "slots_usd", "promoted",
    "facts" (the facts record's `g3` block, without the orders' outcome)}. A pending entry is bought with
    `slot_weight` (or `weight`) x G x the IRA's NAV, at most `caps.single_name` x NAV and what is left of the
    reserve, while fewer than `caps.single_names_open` single names are open across the rules; the widest discount
    (lowest z) first. A pending exit, and every held slot under the hard stop, is a "Sell all". A ticker off the
    whitelist waits with an `order` alert (run `check_venues.py` and list it before promoting the rule).
    """
    sl = cfg_growth.get("sleeves") or {}
    g3_cfg = sl.get("G3") or {}
    rules_cfg = rules_of(cfg_growth)
    g3 = st["sleeves"].setdefault("G3", {"reserve": None, "rules": {}})
    rules = g3.setdefault("rules", {})
    caps = cfg_growth.get("caps") or {}
    min_usd = float((cfg_growth.get("rebalance") or {}).get("min_order_usd", 300))
    single_cap = float(caps.get("single_name", 0.05)) * float(nav_ira)
    max_open = int(caps.get("single_names_open", 2))
    reserve = float(g3_cfg.get("reserve_weight", 0.0)) * float(G_factor) * float(nav_ira)
    promoted = [n for n, c in rules_cfg.items() if str((c or {}).get("status")) == "live"]
    held: dict[str, float] = {}
    sells: list[dict] = []
    buys: list[dict] = []
    waiting: list[dict] = []
    candidates: list[tuple[dict, dict, str]] = []
    slots_facts: list[dict] = []
    for name, cfg_rule in rules_cfg.items():
        rs = rules.get(name)
        if not isinstance(rs, dict):
            continue
        label = rule_label(name, cfg_rule)
        for slot in rs.get("open_slots") or []:
            if slot.get("book") != "live":
                continue
            ticker = str(slot["ticker"])
            status = str(slot.get("status"))
            if status in ("open", "pending_exit"):
                value = float(run.broker.holdings_value(acct, ticker, closes.get(ticker), module=MODULE))
                held[ticker] = held.get(ticker, 0.0) + value
                if (status == "pending_exit" or paused) and not slot.get("exit_intent_id"):
                    sells.append({"rule": name, "ticker": ticker, "held_usd": value, "slot_id": slot["id"],
                                  "reason": "hard_stop" if paused and status != "pending_exit" else "g3_exit"})
            elif status == "pending_entry" and not slot.get("intent_id"):
                candidates.append((cfg_rule or {}, slot, name))
            slots_facts.append({"rule": name, "label": label, "ticker": ticker, "status": status,
                                "usd": round(held.get(ticker, 0.0) if status != "pending_entry" else 0.0, 2),
                                "entry": slot.get("entry_date"), "exit_due": slot.get("exit_due"),
                                "discount": slot.get("discount"), "z": slot.get("z"), "signal_date": slot.get("signal_date"),
                                "book": "live"})
    n_open = len(held)
    reserve_left = max(reserve - sum(held.values()), 0.0)
    ranked = sorted(candidates, key=lambda c: (float(c[1].get("z") if c[1].get("z") is not None else 0.0),
                                               str(c[1].get("signal_date") or ""), str(c[1]["ticker"])))
    for cfg_rule, slot, name in ranked:
        ticker = str(slot["ticker"])
        weight = float(cfg_rule.get("slot_weight", cfg_rule.get("weight", 0.05)))
        usd = min(weight * float(G_factor) * float(nav_ira), single_cap, reserve_left)
        row = {"rule": name, "ticker": ticker, "slot_id": slot["id"], "z": slot.get("z"), "discount": slot.get("discount")}
        if paused:
            waiting.append({**row, "why": "paused: buys blocked after the hard stop"})
            continue
        if n_open >= max_open:
            waiting.append({**row, "why": f"no free single-name slot ({n_open} of {max_open} open)"})
            continue
        if usd < min_usd:
            waiting.append({**row, "why": "the gems reserve is used"})
            continue
        if not run.cfg.is_whitelisted(ticker):
            run.alert("order", f"G3 {name}: {ticker} is not on the whitelist; its entry waits (run check_venues.py and "
                               "list it in config/whitelist.yaml before trading the rule)")
            waiting.append({**row, "why": "not on the whitelist"})
            continue
        usd = math.floor(usd * 100.0) / 100.0
        buys.append({**row, "usd": usd})
        n_open += 1
        reserve_left -= usd
        for f in slots_facts:
            if f["ticker"] == ticker and f["status"] == "pending_entry":
                f["usd"] = usd
    slots_usd = sum(held.values()) + sum(b["usd"] for b in buys)
    shadow = {}
    for name, cfg_rule in rules_cfg.items():
        rs = rules.get(name)
        if not isinstance(rs, dict) or name in OWNER_DECISION_RULES:
            continue
        stats = dict(rs.get("shadow_stats") or {})
        prom = rs.get("promotion") or promotion_test(name, rs.get("events") or [], cfg_rule)
        shadow[name] = {"label": rule_label(name, cfg_rule), "status": rs.get("status"), "n": int(stats.get("n") or 0),
                        "mean_excess": stats.get("mean_excess"), "median_excess": stats.get("median_excess"),
                        "win_rate": stats.get("win_rate"), "open": int(stats.get("open") or _slot_count(rs)),
                        "basis": stats.get("basis") or ("the coin" if name == TRUST_RULE else "random entry"),
                        "promotion": {"passed": bool(prom.get("passed")), "n": int(prom.get("n") or 0),
                                      "checks": list(prom.get("checks") or []), "reason": prom.get("reason"),
                                      "checks_ok": int(prom.get("checks_ok") or 0), "checks_total": int(prom.get("checks_total") or 0)}}
    facts = {"reserve_usd": round(reserve, 2), "sgov_usd": round(max(reserve - slots_usd, 0.0), 2), "slots_usd": round(slots_usd, 2),
             "promoted_rules": promoted, "slots": slots_facts, "shadow": shadow, "waiting": waiting,
             "single_names_open": n_open, "single_names_max": max_open, "single_name_cap_usd": round(single_cap, 2),
             "slots_max": {n: int((c or {}).get("slots", 1)) for n, c in rules_cfg.items() if n in promoted}}
    return {"held": held, "buys": buys, "sells": sells, "waiting": waiting, "reserve_usd": reserve,
            "sgov_usd": max(reserve - slots_usd, 0.0), "slots_usd": slots_usd, "promoted": promoted, "facts": facts}


def record_orders(st: dict, sent: list[dict], date: str) -> None:
    """Tie the G3 orders the Sunday job sent to their slots (the intent ids the daily runner settles on)."""
    rules = ((st.get("sleeves") or {}).get("G3") or {}).get("rules") or {}
    for o in sent:
        if o.get("sleeve") != MODULE or not o.get("intent_id"):
            continue
        for rs in rules.values():
            for slot in (rs.get("open_slots") or []) if isinstance(rs, dict) else []:
                if slot.get("id") != o.get("slot_id"):
                    continue
                if o["action"] == "buy":
                    slot.update(intent_id=o["intent_id"], trade_id=o.get("trade_id"), usd=o.get("usd"), queued=date)
                else:
                    slot.update(exit_intent_id=o["intent_id"], exit_queued=date)
