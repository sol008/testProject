"""W8 / W9 — macro-event call spreads with the frozen LLM veto (design v3.3 §3 M5; contract §2, §6-§9).

22:17 ET `daily`, exits first, then entries:

* **Exits.** Each open spread is priced on tonight's chain. It is closed on the expiry rule, an invalidation, the
  take-profit or the 20-trading-day time stop (`modules.w8w9_macro.exit_check`) with a sell-to-close limit from
  `fillmodel.order_prices` (mid - 0.3 x natural width; the stated minimum mid - 0.5 x natural width).
* **W8.** Every night the prediction-market map is refreshed: condition (iii) compares tonight's price of the market
  mapped last session with last session's snapshot, then the map rolls forward by rule. Condition (ii) reads the
  explicit Brent month and BNO. When (ii) and (iii) hold, the candidate passes the gates in order: one W8 trade at
  a time, the discretionary pause (§4), the trade budget, the scheduled-release ban (§5), the invalidation market,
  the structure (XSP, then SPY, then DAL; DTE, earnings, liquidity), the premium budget (`risk.admit_premium`,
  cluster "oil") and last the LLM veto, whose citations are the logged evidence of condition (i). The veto's
  request hash, response and verdict go to the ledger before the email is rendered.
* **W9.** The owner's supply-loss record and the explicit Brent/WTI months form the trigger; the gates are the same
  plus the contango veto (R3), with USO only.

A blocked candidate is logged in the ledger as `shadow` (book W8 / W9) with its stage and reason, and data problems
raise `run.alert("data", ...)`. Shadow records never call the LLM: the veto is the last gate.

10:17 ET hooks (options job): `on_spread_fill` opens or closes the trade; `on_spread_cancel` skips an entry or
re-opens an exit so tonight's run re-issues it. Adapters come from the provider (`prediction_markets`, `macro_data`,
`option_chain`; tests inject fakes); a LiveProvider gets live ones. The veto comes from `run.services.veto` when set,
else `llm_veto.run_veto`.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

import pandas as pd

from traderec import forecasts as fc
from traderec import llm_veto, risk
from traderec.data import LiveProvider, verify_close
from traderec.data.macro_data import (MacroData, contango, day_move, front_contracts, front_month, load_supply_input,
                                      supply_loss_check)
from traderec.data.prediction_markets import PredictionMarkets, pick_nearest, pick_on_or_after
from traderec.market_calendar import next_trading_day, prev_trading_day
from traderec.modules import w8w9_macro as rules
from traderec.options import chain as chain_mod
from traderec.options import fillmodel
from traderec.types import OrderIntent, Recommendation

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run
    from traderec.types import Fill

MODULES = ("W8", "W9")
ACTIVE = ("pending_entry", "open", "pending_exit")
MAX_EVENTS = 60
UNDERLYING_NAMES = {"XSP": "Mini-S&P 500 index (XSP)", "SPX": "S&P 500 index", "SPY": "S&P 500 index fund",
                    "DAL": "Delta Air Lines stock", "USO": "US oil fund"}
INDEX_ROOTS = frozenset({"XSP", "SPX"})          # cash-settled, European-style, Section 1256


# ----------------------------------------------------------------------------------------------------
# plumbing
# ----------------------------------------------------------------------------------------------------

def _cfg(run: "Run", module: str) -> dict:
    return (run.cfg.constitution.get("modules") or {}).get(module) or {}


def _state(run: "Run", module: str) -> dict:
    """The module's state entry (contract §6), created for older states; extra keys are this module's own."""
    st = run.state["modules"].setdefault(module, {"open_trade": None, "history": []})
    st.setdefault("open_trade", None)
    st.setdefault("history", [])
    st.setdefault("events", [])
    return st


class _Ctx:
    """One run's adapters: prediction markets, macro data, option chains (memoised) and the veto."""

    def __init__(self, run: "Run") -> None:
        prov = run.provider
        self.pm = getattr(prov, "prediction_markets", None)
        self.md = getattr(prov, "macro_data", None)
        if isinstance(prov, LiveProvider):          # live runs build the network adapters next to the provider
            if self.pm is None:
                self.pm = PredictionMarkets()
                prov.prediction_markets = self.pm
            if self.md is None:
                self.md = MacroData()
                prov.macro_data = self.md
        self._chain_fn = getattr(prov, "option_chain", None)
        self._chains: dict[str, Any] = {}
        self.veto: Callable[..., dict] = getattr(run.services, "veto", None) or llm_veto.run_veto
        self.run = run

    def chain(self, root: str) -> Any:
        if root not in self._chains:
            try:
                self._chains[root] = self._chain_fn(root) if self._chain_fn else None
            except Exception as exc:  # noqa: BLE001 - no chain: that root is skipped (fail closed)
                self.run.note(f"option chain {root} unavailable ({type(exc).__name__})")
                self._chains[root] = None
        return self._chains[root]


def _bars(run: "Run", ticker: str) -> pd.DataFrame | None:
    try:
        return run.bars(ticker)
    except Exception:  # noqa: BLE001 - optional series; the caller fails closed on None
        return None


def _event(run: "Run", module: str, stage: str, outcome: str, reason: str, **extra: Any) -> None:
    st = _state(run, module)
    st["events"] = (st["events"] + [{"date": run.date, "stage": stage, "outcome": outcome, "reason": reason,
                                     **extra}])[-MAX_EVENTS:]


def _block(run: "Run", module: str, stage: str, reason: str, facts: dict | None = None, *,
           alert: str | None = None) -> None:
    """A candidate that does not trade: shadow ledger record, module event, and an alert for data problems."""
    run.log("shadow", {"book": module, "event": "blocked", "stage": stage, "reason": reason, "signal_date": run.date,
                       **(facts or {})})
    _event(run, module, stage, "blocked", reason)
    run.note(f"{module} candidate blocked at {stage}: {reason}")
    if alert:
        run.alert(alert, f"{module} candidate blocked at {stage}: {reason}")


def _flag(run: "Run", st: dict, key: str, ok: bool, msg: str) -> None:
    """Alert once when a nightly data feed goes bad (and note while it stays bad); clear the flag when it recovers."""
    flags = st.setdefault("data_flags", {})
    if ok:
        flags.pop(key, None)
    elif not flags.get(key):
        flags[key] = run.date
        run.alert("data", msg)
    else:
        run.note(msg)


# ----------------------------------------------------------------------------------------------------
# daily
# ----------------------------------------------------------------------------------------------------

def daily(run: "Run", checks: dict) -> None:
    """22:17 ET run hook: exits first, then entries (W8, then W9)."""
    enabled = [m for m in MODULES if _cfg(run, m).get("enabled")]
    if not enabled:
        return
    for m in enabled:
        _state(run, m)
    ctx = _Ctx(run)
    for m in enabled:
        _exit(run, m, ctx)
    if ctx.pm is None or ctx.md is None:
        run.note("W8/W9 entries not evaluated: no prediction-market or macro-data adapter on this provider")
        return
    if "W8" in enabled:
        _w8(run, ctx)
    if "W9" in enabled:
        _w9(run, ctx)


# --- exits ------------------------------------------------------------------------------------------

def _exit(run: "Run", module: str, ctx: _Ctx) -> None:
    cfg = _cfg(run, module)
    ot = _state(run, module).get("open_trade")
    if not ot or ot.get("status") != "open":
        return
    invalid = _w8_invalidation(run, ot, cfg, ctx) if module == "W8" else _w9_invalidation(run, ot, cfg)
    if invalid and not ot.get("invalidated_on"):
        ot.update(invalidated_on=run.date, invalidation_reason=invalid)
    chain = ctx.chain(ot["root"])
    quote = fillmodel.combo_quote(chain, ot["legs"], "sell") if chain is not None else None
    ex = rules.exit_check(module, run.date, ot, quote["mid"] if quote else None, cfg, invalid)
    if not ex["exit"]:
        return
    run.log("signal", {"module": module, "check": "exit", "trade_id": ot["trade_id"], **ex,
                       "quote": quote, "chain_asof": getattr(chain, "asof", None)})
    if quote is None:
        run.alert("data", f"{module} {ot['trade_id']}: exit due ({ex['reason']}) but tonight's chain has no two-sided "
                          "quote for its legs; retried tomorrow")
        return
    prices = fillmodel.order_prices(quote, "sell", run.cfg.fills["options"])
    limit, minimum = rules.round_price(prices["limit_price"], "sell"), rules.round_price(prices["max_price"], "sell")
    intent = OrderIntent(intent_id=run.next_intent_id(module), trade_id=ot["trade_id"], module=module,
                         account=ot.get("account") or cfg["account"], ticker=ot["root"], side="sell",
                         created_date=run.date, reason=str(ex["reason"]), close_all=True, order_type="spread_limit",
                         legs=[dict(leg) for leg in ot["legs"]], contracts=int(ot["contracts"]), limit_price=limit,
                         max_price=minimum, meta={"mid": quote["mid"], "natural_width": quote["natural_width"]})
    rec = Recommendation("EXIT", module, ot["trade_id"], run.date, [intent],
                         exit_facts(run, module, cfg, ot, ex, quote, limit, minimum))
    if run.emit(rec):
        ot.update(status="pending_exit", exit_reason=ex["reason"], exit_signal_date=run.date,
                  exit_intent_id=intent.intent_id)


def _w8_invalidation(run: "Run", ot: dict, cfg: dict, ctx: _Ctx) -> str | None:
    """The mapped ceasefire market below the threshold, re-mapped by rule when it resolves or disappears."""
    inv = ot.get("invalidation") or {}
    if ctx.pm is None or not inv.get("market_id"):
        run.note(f"W8 {ot['trade_id']}: invalidation market not checked (no adapter or mapping)")
        return None
    try:
        now = ctx.pm.refresh([inv["market_id"]]).get(str(inv["market_id"]))
    except Exception as exc:  # noqa: BLE001 - a feed failure: keep holding, the other exits still apply
        run.alert("data", f"W8 {ot['trade_id']}: ceasefire market unavailable ({type(exc).__name__})")
        return None
    if now and now.get("resolved") and now.get("outcome") == "no":
        return f"{inv.get('question')} resolved No"
    if not now or now.get("resolved") or now.get("problem") or not now.get("listed") \
            or str(inv.get("date") or "") < str(ot.get("exit_date") or ""):
        pick = _pick_family(ctx, cfg["markets"]["invalidation"], str(ot.get("exit_date") or run.date))
        if pick["status"] != "ok":
            run.alert("data", f"W8 {ot['trade_id']}: cannot re-map the ceasefire market ({pick['reason']}); the other "
                              "exits still apply")
            return None
        m = pick["market"]
        new = {"market_id": m["id"], "question": m["question"], "date": m["date"], "price": m["yes"]}
        run.log("signal", {"module": "W8", "check": "invalidation_remap", "trade_id": ot["trade_id"], "from": inv,
                           "to": new})
        ot["invalidation"] = inv = {**inv, **new}
        now = m
    price = float(now["yes"])
    inv.update(price=price, asof=run.date)
    if price < float(cfg["invalidation_below"]):
        return f"{inv.get('question')} at {price:.1%} (below {float(cfg['invalidation_below']):.0%})"
    return None


def _w9_invalidation(run: "Run", ot: dict, cfg: dict) -> str | None:
    """Track 17 W9: WTI closes below the pre-event close (same explicit month), or the supply loss is restored."""
    for sym, pre in (ot.get("pre_event_closes") or {}).items():
        mv = day_move(_bars(run, sym), run.date)
        if mv["ok"]:
            if mv["close"] < float(pre):
                return f"{sym} closed {mv['close']:.2f}, below the pre-event close {float(pre):.2f}"
            break
    doc = load_supply_input(run.real.root / cfg["supply_input"])
    for ev in doc["events"]:
        restored = str(ev.get("restored_on") or "")[:10]
        if str(ev.get("id")) == str(ot.get("supply_event_id")) and restored and restored <= run.date:
            return f"supply loss {ev.get('id')} restored on {restored}"
    return None


# --- W8 entry ---------------------------------------------------------------------------------------

def _pick_family(ctx: _Ctx, spec: dict, target: str, not_before: str | None = None) -> dict:
    """Map a family by rule: the first listed date on or after `target` or, with `not_before`, the listed date
    nearest `target` on or after `not_before`."""
    try:
        fam = ctx.pm.family(spec)
    except Exception as exc:  # noqa: BLE001 - an unreachable venue is missing data
        return {"status": "unavailable", "market": None, "date": None, "reason": f"{type(exc).__name__}: {exc}"}
    if not_before is not None:
        return pick_nearest(fam["quotes"], target, not_before, incomplete=fam["incomplete"])
    return pick_on_or_after(fam["quotes"], target, incomplete=fam["incomplete"])


def _pm_families(run: "Run", cfg: dict, st: dict, ctx: _Ctx, prev_session: str) -> dict[str, dict]:
    """Condition (iii) for each trigger family, then roll the map forward (tonight's snapshot for tomorrow).

    The map rule for trigger markets: the listed date nearest signal + `trigger_market_days` (90), on or after the
    time stop of a trade entered tomorrow. On 28 Sep 2026 that is "by Dec 31" for both families, track 17's choice.
    """
    snaps = st.setdefault("pm_map", {})
    fams = cfg["markets"]["trigger"]
    ids = [str(s["market_id"]) for s in snaps.values() if s.get("market_id")]
    try:
        refreshed = ctx.pm.refresh(ids) if ids else {}
        _flag(run, st, "pm_refresh", True, "")
    except Exception as exc:  # noqa: BLE001
        refreshed = {}
        _flag(run, st, "pm_refresh", False, f"W8: Polymarket refresh failed ({type(exc).__name__}); condition "
                                            "(iii) cannot be evaluated tonight")
    target = (pd.Timestamp(run.date) + pd.Timedelta(days=int(cfg["trigger_market_days"]))).strftime("%Y-%m-%d")
    floor = rules.time_stop_date(next_trading_day(run.date).isoformat(), int(cfg["time_stop_sessions"]))
    out = {}
    for name, spec in fams.items():
        prev = snaps.get(name)
        today = refreshed.get(str(prev["market_id"])) if prev else None
        leg = rules.pm_leg(prev, today, prev_session, float(cfg["pm_jump"]), float(cfg["pm_through"]))
        pick = _pick_family(ctx, spec, target, floor)
        if pick["status"] == "ok":
            m = pick["market"]
            new = {"market_id": m["id"], "question": m["question"], "date": m["date"], "price": m["yes"],
                   "asof": run.date}
            if prev and str(prev.get("market_id")) != str(m["id"]):
                run.log("signal", {"module": "W8", "check": "pm_remap", "family": name, "from": prev, "to": new})
            snaps[name] = new
        else:
            snaps.pop(name, None)
        _flag(run, st, f"pm_map:{name}", pick["status"] == "ok",
              f"W8: cannot map the {name} market ({pick['status']}: {pick['reason']}); condition (iii) is blind to it")
        out[name] = {**leg, "map": pick["status"], "map_reason": pick["reason"]}
    return out


def _w8_oil(run: "Run", cfg: dict) -> dict:
    """Condition (ii): the explicit front-safe Brent month or BNO down >= 6% on the day (BNO two-source checked
    when it alone fires); sign disagreement fails closed."""
    sym = front_contracts("BZ", run.date, 1)[0]
    etf = str(cfg["oil_etf"])
    moves = {sym: day_move(_bars(run, sym), run.date), etf: day_move(_bars(run, etf), run.date)}
    leg = rules.move_leg(moves, float(cfg["oil_drop"]))
    if leg["fired"] and leg["by"] == [etf]:
        chk = verify_close(run.provider, _bars(run, etf), etf, run.date, float(run.cfg.data["two_source_tolerance"]))
        if not chk.get("ok"):
            moves[etf] = {**moves[etf], "ok": False, "reason": f"second source: {chk.get('reason')}"}
            leg = {**rules.move_leg(moves, float(cfg["oil_drop"])), "second_source": chk}
    month = front_month("BZ", run.date).start_time.strftime("%Y-%m-%d")      # delivery month, as its first day
    return {**leg, "brent_contract": sym, "brent_month": month, "moves": moves, "etf": etf}


def _w8(run: "Run", ctx: _Ctx) -> None:
    cfg = _cfg(run, "W8")
    st = _state(run, "W8")
    prev_session = prev_trading_day(run.date).isoformat()
    pm = _pm_families(run, cfg, st, ctx, prev_session)
    oil = _w8_oil(run, cfg)
    pm_fired = [n for n, leg in pm.items() if leg["fired"]]
    if not (oil["fired"] or oil["disagree"] or pm_fired):
        return
    trig = {"module": "W8", "check": "trigger", "oil": oil, "markets": pm,
            "fired": bool(oil["fired"] and pm_fired), "payload_sha256": list(ctx.pm.payload_sha256)[-20:]
            if hasattr(ctx.pm, "payload_sha256") else None}
    run.log("signal", trig)
    if oil["disagree"]:
        _block(run, "W8", "oil_data", oil["reason"], alert="data")
        return
    if not trig["fired"]:
        _event(run, "W8", "trigger", "near_miss", f"oil {'fired' if oil['fired'] else 'no'}; "
                                                  f"markets {', '.join(pm_fired) or 'none'}")
        return
    fam = pm_fired[0]
    signal = {"brent_contract": oil["brent_contract"], "brent_month": oil["brent_month"],
              "brent_ret": oil["rets"].get(oil["brent_contract"]), "bno_ret": oil["rets"].get(oil["etf"]),
              "brent_close": oil["moves"][oil["brent_contract"]].get("close"),
              "brent_prev_close": oil["moves"][oil["brent_contract"]].get("prev_close"),
              "oil_fired_by": oil["by"], "pm_family": fam, "pm_question": pm[fam]["question"],
              "pm_prev": pm[fam]["prev"], "pm_price": pm[fam]["price"], "pm_up": pm[fam]["up"],
              "pm_through": pm[fam]["through"]}
    cand = _Candidate(run, "W8", cfg, ctx, signal)
    if not cand.common_gates():
        return
    if not cand.invalidation_market():
        return
    if not cand.structure() or not cand.size():
        return
    veto_facts = {"signal_date": run.date, "oil_facts": _oil_facts(signal), "market_facts": _market_facts(pm)}
    if not cand.veto(veto_facts):
        return
    cand.emit()


def _oil_facts(s: dict) -> str:
    lines = []
    if s.get("brent_ret") is not None:
        month = pd.Timestamp(s["brent_month"]).strftime("%B %Y")
        lines.append(f"- Brent crude futures {s['brent_contract'].split('.')[0]} (the {month} contract) "
                     f"closed at {s['brent_close']:.2f}, {s['brent_ret']:+.1%} on the day (prior close "
                     f"{s['brent_prev_close']:.2f}).")
    if s.get("bno_ret") is not None:
        lines.append(f"- BNO, the Brent oil fund, closed {s['bno_ret']:+.1%} on the day.")
    return "\n".join(lines) or "- (no oil move recorded)"


def _market_facts(pm: dict) -> str:
    lines = []
    for leg in pm.values():
        if leg.get("prev") is not None and leg.get("price") is not None:
            lines.append(f"- Polymarket \"{leg['question']}\" moved from {leg['prev']:.0%} to {leg['price']:.0%} "
                         "since the previous session's close.")
    return "\n".join(lines) or "- (no prediction-market move recorded)"


# --- the candidate: gates shared by W8 and W9 --------------------------------------------------------

class _Candidate:
    """One mechanically fired W8/W9 candidate on its way through the gates (each gate logs its own block)."""

    def __init__(self, run: "Run", module: str, cfg: dict, ctx: _Ctx, signal: dict) -> None:
        self.run, self.module, self.cfg, self.ctx, self.signal = run, module, cfg, ctx, signal
        self.trade_id = f"T-{run.date}-{module}"
        self.entry_session = next_trading_day(run.date).isoformat()
        self.exit_date = rules.time_stop_date(self.entry_session, int(cfg["time_stop_sessions"]))
        self.facts: dict[str, Any] = {"trade_id": self.trade_id, "signal": signal}
        self.struct: dict[str, Any] = {}
        self.invalidation: dict[str, Any] | None = None
        self.veto_result: dict[str, Any] = {}
        self.releases: dict[str, Any] = {}

    def block(self, stage: str, reason: str, alert: str | None = None) -> bool:
        _block(self.run, self.module, stage, reason, self.facts, alert=alert)
        return False

    def common_gates(self) -> bool:
        run, cfg, st = self.run, self.cfg, _state(self.run, self.module)
        if st.get("open_trade"):
            return self.block("one_at_a_time", f"{st['open_trade']['trade_id']} is still active")
        if run.cfg.mode == "live" and cfg.get("paper_only"):
            return self.block("paper_only", f"{self.module} is a paper module; the live book logs it in shadow")
        pause = rules.discretionary_pause(run.state.get("marks") or [], cfg["circuit_breakers"],
                                          float(run.cfg.risk["governor"]["pause_discretionary_at"]))
        if pause["paused"]:
            return self.block("pause", pause["reason"])
        if not run.budget_ok():
            return self.block("budget", "trade budget or open-position cap reached")
        ban = cfg["release_ban"]
        try:
            releases = self.ctx.pm.release_dates(ban["series"])
        except Exception as exc:  # noqa: BLE001 - no calendar: fail closed
            return self.block("release_calendar", f"release calendar unavailable ({type(exc).__name__}: {exc})",
                              alert="data")
        rb = rules.release_ban(self.entry_session, releases, int(ban["sessions"]))
        self.releases = rb
        self.facts["release_window"] = rb
        if rb["banned"]:
            return self.block("release_ban", "entry within the scheduled-release window: "
                              + ", ".join(f"{k} {d}" for k, d in rb["hits"]))
        return True

    def invalidation_market(self) -> bool:
        """W8: the ceasefire market for the first listed date on or after the time stop, and above 40% now."""
        pick = _pick_family(self.ctx, self.cfg["markets"]["invalidation"], self.exit_date)
        if pick["status"] != "ok":
            return self.block("invalidation_market", f"{pick['status']}: {pick['reason']}", alert="data")
        m = pick["market"]
        self.invalidation = {"market_id": m["id"], "question": m["question"], "date": m["date"], "price": m["yes"],
                             "asof": self.run.date}
        self.facts["invalidation"] = self.invalidation
        if float(m["yes"]) < float(self.cfg["invalidation_below"]):
            return self.block("invalidation_market", f"{m['question']} already at {float(m['yes']):.1%}")
        return True

    def structure(self) -> bool:
        """The first root that passes: DTE window (and earnings for single stocks), strikes, quotes, liquidity."""
        tried = {}
        for root in self.cfg["roots"]:
            res = self._structure_for(str(root))
            tried[root] = res.get("reason") or "ok"
            if res["ok"]:
                self.struct = {**res, "tried": tried}
                self.facts["structure"] = {k: v for k, v in self.struct.items() if k != "chain"}
                return True
        self.facts["structure_tried"] = tried
        return self.block("structure", "; ".join(f"{k}: {v}" for k, v in tried.items()))

    def _structure_for(self, root: str) -> dict:
        cfg, run = self.cfg, self.run
        before, earnings = None, None
        if root in (cfg.get("earnings_roots") or []):
            earnings = self.ctx.md.next_earnings(root, run.date)
            if not earnings.get("ok"):
                return {"ok": False, "reason": f"next earnings date unknown ({earnings.get('reason')})"}
            before = earnings["date"]
        chain = self.ctx.chain(root)
        if chain is None:
            return {"ok": False, "reason": "no option chain"}
        spot = float(chain.spot)
        expiries = rules.expiry_candidates(chain.expiries(), self.entry_session, int(cfg["dte_min"]),
                                           int(cfg["dte_max"]), before)
        if not expiries:
            return {"ok": False, "reason": f"no expiry {cfg['dte_min']}-{cfg['dte_max']} DTE"
                                           + (f" before earnings on {before}" if before else "")}
        check = getattr(chain_mod, "liquidity_check", None)
        if check is None:
            return {"ok": False, "reason": "the liquidity check is not available (options build)"}
        cfg_liq = (run.cfg.constitution.get("options") or {}).get("liquidity") or cfg.get("liquidity") or {}
        mult = int(run.cfg.fills["options"].get("multiplier", 100))
        budget = float(cfg["premium_pct_nav"]) * run.current_nav()
        moneyness = (cfg.get("moneyness") or {}).get(root)
        if not moneyness:
            return {"ok": False, "reason": "no strike rule (moneyness) for this root"}
        reasons = []
        for expiry in expiries:
            sp = rules.call_spread(chain, expiry, spot, moneyness)
            if not sp["ok"]:
                reasons.append(f"{expiry}: {sp['reason']}")
                continue
            try:
                rules.no_oil_short(self.module, root, sp["legs"])
            except ValueError as exc:                 # a misconfigured root: never trade it, tell the owner
                run.alert("config", f"{self.module}: {exc}")
                return {"ok": False, "reason": str(exc)}
            quote = fillmodel.combo_quote(chain, sp["legs"], "buy")
            if quote is None or quote["mid"] <= 0:
                reasons.append(f"{expiry}: no two-sided combo quote")
                continue
            prices = fillmodel.order_prices(quote, "buy", run.cfg.fills["options"])
            limit = rules.round_price(prices["limit_price"], "buy")
            maxp = rules.round_price(prices["max_price"], "buy")
            width = float(sp["short"]) - float(sp["long"])
            if maxp >= width:
                reasons.append(f"{expiry}: the stated maximum {maxp:.2f} is not below the width {width:g}")
                continue
            if maxp * mult > budget:                  # at least one whole contract inside the premium cap, or skip
                reasons.append(f"{expiry}: one spread costs up to ${maxp * mult:,.0f}, above the "
                               f"{float(cfg['premium_pct_nav']):.2%} premium cap (${budget:,.0f})")
                continue
            liq = check(chain, sp["legs"], cfg_liq)
            if not liq.get("ok"):
                reasons.append(f"{expiry}: liquidity ({'; '.join(map(str, liq.get('reasons') or []))})")
                continue
            return {"ok": True, "reason": "", "root": root, "chain": chain, "spot": spot, "expiry": expiry,
                    "dte": (pd.Timestamp(expiry) - pd.Timestamp(self.entry_session)).days,
                    "legs": sp["legs"], "long_strike": float(sp["long"]), "short_strike": float(sp["short"]),
                    "width": width, "quote": quote, "limit_price": limit, "max_price": maxp, "liquidity": liq,
                    "earnings": earnings, "chain_asof": chain.asof, "chain_source": chain.source,
                    "chain_sha256": getattr(chain, "raw_sha256", None)}
        return {"ok": False, "reason": "; ".join(reasons) or "no structure"}

    def size(self) -> bool:
        """Premium <= premium_pct_nav of NAV at the stated maximum, whole contracts, through risk.admit_premium."""
        run, s = self.run, self.struct
        mult = int(run.cfg.fills["options"].get("multiplier", 100))
        nav = run.current_nav()
        per = float(s["max_price"]) * mult
        n = rules.contracts_for(float(self.cfg["premium_pct_nav"]) * nav, s["max_price"], mult)
        if n < 1:
            return self.block("size", f"one spread at the stated maximum costs ${per:,.0f}, above "
                                      f"{float(self.cfg['premium_pct_nav']):.2%} of NAV (${nav:,.0f})")
        try:
            stress = run.stress()
            adm = risk.admit_premium(self.module, s["root"], n * per, str(self.cfg["cluster"]),
                                     run.open_stress(stress), run.cfg, run.current_drawdown(),
                                     exempt_governor=False, min_premium_usd=per)
        except Exception as exc:  # noqa: BLE001 - admission unavailable or broken: fail closed
            return self.block("admit", f"premium admission failed ({type(exc).__name__}: {exc})", alert="risk")
        self.facts["admit"] = adm
        n = rules.contracts_for(float(adm.get("premium_usd") or 0.0), s["max_price"], mult) if adm.get("ok") else 0
        if n < 1:
            return self.block("admit", f"not admitted: {adm.get('binding')} {adm.get('notes')}")
        s.update(contracts=n, multiplier=mult, admit=adm)
        return True

    def veto(self, veto_facts: dict) -> bool:
        """The LLM veto, last. Its request hash, response and verdict are logged before any email."""
        run, st = self.run, _state(self.run, self.module)
        try:
            res = dict(self.ctx.veto(self.module, veto_facts, self.cfg["veto"]) or {})
        except Exception as exc:  # noqa: BLE001 - llm_veto.run_veto never raises; an injected one might
            res = {"status": "unavailable", "problems": [f"{type(exc).__name__}: {exc}"]}
        res.setdefault("status", "invalid")
        self.veto_result = res
        if self.module == "W9" and self.signal.get("supply_event_id"):
            processed = st.setdefault("processed_events", [])     # one veto call per recorded supply loss
            if self.signal["supply_event_id"] not in processed:
                processed.append(self.signal["supply_event_id"])
        run.log("signal", {"module": self.module, "check": "veto", "trade_id": self.trade_id, "signal_date": run.date,
                           **{k: res.get(k) for k in ("status", "proceed", "verdict", "citations", "cited",
                                                       "retrieved", "reason", "problems", "prompt_sha256",
                                                       "request_sha256", "model_sha256", "response_sha256",
                                                       "response", "stop_reason", "usage", "requests")}})
        model = res.get("model_sha256")
        if model:
            pinned = st.get("veto_model_sha256")
            if pinned and pinned != model:
                run.alert("veto", f"{self.module}: the veto model changed (sha256 {pinned[:12]} -> {model[:12]}); "
                                  "the frozen veto is re-pinned from today")
            st["veto_model_sha256"] = model
        self.facts["veto"] = {k: res.get(k) for k in ("status", "verdict", "citations", "reason")}
        status = res.get("status")
        if status == "proceed" and res.get("proceed"):
            return True
        why = f"{status}: {res.get('verdict') or '; '.join(map(str, res.get('problems') or [])) or 'no answer'}"
        return self.block("veto", why, alert="veto" if status in ("unavailable", "invalid") else None)

    def emit(self) -> None:
        run, cfg, s, st = self.run, self.cfg, self.struct, _state(self.run, self.module)
        intent = OrderIntent(intent_id=run.next_intent_id(self.module), trade_id=self.trade_id, module=self.module,
                             account=str(cfg["account"]), ticker=s["root"], side="buy", created_date=run.date,
                             reason="entry", order_type="spread_limit", legs=[dict(leg) for leg in s["legs"]],
                             contracts=int(s["contracts"]), limit_price=s["limit_price"], max_price=s["max_price"],
                             meta={"expiry": s["expiry"], "width": s["width"], "spot": s["spot"],
                                   "mid": s["quote"]["mid"], "natural_width": s["quote"]["natural_width"]})
        rec = Recommendation("NEW_TRADE", self.module, self.trade_id, run.date, [intent], entry_facts(self))
        if not run.emit(rec):
            _event(run, self.module, "emit", "blocked", "validator")
            return
        st["open_trade"] = {
            "trade_id": self.trade_id, "status": "pending_entry", "signal_date": run.date,
            "intent_id": intent.intent_id, "account": intent.account, "root": s["root"],
            "legs": [dict(leg) for leg in s["legs"]], "contracts": int(s["contracts"]), "expiry": s["expiry"],
            "width": s["width"], "long_strike": s["long_strike"], "short_strike": s["short_strike"],
            "limit_price": s["limit_price"], "max_price": s["max_price"], "entry_session": self.entry_session,
            "exit_date": self.exit_date, "invalidation": self.invalidation,
            "veto": {k: self.veto_result.get(k) for k in ("verdict", "citations", "request_sha256")},
            **{k: v for k, v in self.signal.items() if k in ("pre_event_closes", "supply_event_id")},
        }
        _event(run, self.module, "emit", "emitted", "", trade_id=self.trade_id)
        run.count_trade()


# --- W9 entry ---------------------------------------------------------------------------------------

def _w9(run: "Run", ctx: _Ctx) -> None:
    cfg = _cfg(run, "W9")
    st = _state(run, "W9")
    prev_session = prev_trading_day(run.date).isoformat()
    doc = load_supply_input(run.real.root / cfg["supply_input"])
    _flag(run, st, "supply_input", doc["ok"], f"W9: {doc['reason']}")
    sup = supply_loss_check(doc["events"], run.date, prev_session, cfg["supply"]) if doc["ok"] else \
        {"ok": False, "event": None, "reasons": [doc["reason"]]}
    event_date = sup["event"]["event_date"] if sup["ok"] else run.date
    syms = {"BZ": front_contracts("BZ", event_date, 1)[0], "CL": front_contracts("CL", event_date, 1)[0]}
    moves = {sym: day_move(_bars(run, sym), event_date) for sym in syms.values()}
    leg = rules.move_leg(moves, float(cfg["oil_jump"]))
    if not (leg["fired"] or leg["disagree"] or sup["ok"]):
        return
    fired = bool(leg["fired"] and sup["ok"])
    run.log("signal", {"module": "W9", "check": "trigger", "event_date": event_date, "price": leg, "moves": moves,
                       "supply": sup, "fired": fired})
    if leg["disagree"]:
        _block(run, "W9", "oil_data", leg["reason"], alert="data")
        return
    if not fired:
        _event(run, "W9", "trigger", "near_miss", f"price {'fired' if leg['fired'] else 'no'}; supply record "
                                                  f"{'ok' if sup['ok'] else 'none'}")
        return
    ev = sup["event"]
    if ev["id"] in (st.get("processed_events") or []):
        return                                  # one trade per recorded supply loss
    wti = front_contracts("CL", event_date, 2)
    pre = {}
    for sym in wti:
        mv = day_move(_bars(run, sym), event_date)
        if mv["ok"]:
            pre[sym] = mv["prev_close"]
    signal = {"supply_event_id": ev["id"], "supply_what": ev.get("what"), "mbd_offline": ev.get("mbd_offline"),
              "no_restoration_days": ev.get("no_restoration_days"), "supply_sources": ev.get("sources"),
              "event_date": event_date, "price_fired_by": leg["by"], "rets": leg["rets"], "pre_event_closes": pre,
              "wti_contract": syms["CL"], "brent_contract": syms["BZ"]}
    cand = _Candidate(run, "W9", cfg, ctx, signal)
    if not cand.common_gates():
        return
    now = front_contracts("CL", run.date, 2)
    cg = contango(_bars(run, now[0]), _bars(run, now[1]), run.date, float(cfg["contango_veto_roll_yield"]))
    cand.facts["contango"] = {**cg, "contracts": now}
    if not cg["ok"]:
        _block(run, "W9", "contango", cg["reason"], cand.facts, alert="data")
        return
    if cg["veto"]:
        _block(run, "W9", "contango", f"WTI roll yield {cg['roll_yield']:.1%} a year is below "
                                      f"{float(cfg['contango_veto_roll_yield']):.0%} (R3)", cand.facts)
        return
    if not cand.structure() or not cand.size():
        return
    veto_facts = {"signal_date": run.date, "price_facts": _price_facts(moves, event_date),
                  "supply_facts": _supply_facts(ev)}
    if not cand.veto(veto_facts):
        return
    cand.emit()


def _price_facts(moves: dict, event_date: str) -> str:
    lines = [f"- {sym.split('.')[0]} crude futures closed at {mv['close']:.2f}, {mv['ret']:+.1%} on {event_date} "
             f"(prior close {mv['prev_close']:.2f})." for sym, mv in moves.items() if mv.get("ok")]
    return "\n".join(lines) or "- (no price move recorded)"


def _supply_facts(ev: dict) -> str:
    return (f"- Supply loss recorded from official statements: {ev.get('what') or 'unspecified'}; about "
            f"{float(ev['mbd_offline']):.1f} million barrels a day of exports offline, no restoration or bypass "
            f"expected for {int(ev['no_restoration_days'])} days. Sources: {', '.join(ev.get('sources') or [])}.")


# ----------------------------------------------------------------------------------------------------
# facts builders (contract §8 keys, plus this module's own for its email text)
# ----------------------------------------------------------------------------------------------------

def _common(run: "Run", module: str, cfg: dict, account: str) -> dict:
    return {"module_name": cfg.get("name", module), "account": account, "execute_date": run.order_deadline(),
            "nav": run.current_nav(), "drawdown": run.current_drawdown(),
            "governor": risk.governor(run.current_drawdown(), run.cfg.risk)}


def _settlement(root: str) -> dict:
    index = root in INDEX_ROOTS
    return {"section_1256": index,
            "settlement": "cash-settled, European-style" if index else "shares, American-style"}


def entry_facts(cand: _Candidate) -> dict[str, Any]:
    """NEW_TRADE facts (contract §8) for a W8/W9 call debit spread."""
    run, cfg, s, sig = cand.run, cand.cfg, cand.struct, cand.signal
    mult, n = int(s["multiplier"]), int(s["contracts"])
    nav = run.current_nav()
    max_debit = n * float(s["max_price"]) * mult
    out: dict[str, Any] = {
        **_common(run, cand.module, cfg, str(cfg["account"])), "status": cfg.get("status"),
        "root": s["root"], "ticker": s["root"], "underlying_name": UNDERLYING_NAMES.get(s["root"], s["root"]),
        "ticker_name": UNDERLYING_NAMES.get(s["root"], s["root"]), "strategy_label": "call debit spread",
        "legs": [dict(leg) for leg in s["legs"]], "expiry": s["expiry"], "dte": s["dte"], "contracts": n,
        "spread_word": "call spread" if n == 1 else "call spreads",
        "long_strike": s["long_strike"], "short_strike": s["short_strike"], "width": s["width"],
        "limit_price": s["limit_price"], "max_price": s["max_price"],
        "debit_usd": n * float(s["limit_price"]) * mult, "max_debit_usd": max_debit,
        "max_value_usd": s["width"] * n * mult, "breakeven": s["long_strike"] + float(s["limit_price"]),
        "spot": s["spot"], "exit_date": cand.exit_date, "entry_date": cand.entry_session,
        "stress_usd": max_debit, "stress_pct": 100.0 * max_debit / nav if nav else None,
        "premium_cap_pct_nav": float(cfg["premium_pct_nav"]), "time_stop_sessions": int(cfg["time_stop_sessions"]),
        **_settlement(s["root"]), "base_rates": dict(cfg.get("base_rates") or {}),
        "history": dict(cfg.get("history") or {}), "cluster": cfg.get("cluster"),
        "veto_verdict": cand.veto_result.get("verdict"),
        "veto_sources": ", ".join(sorted({c.split("/")[2] for c in cand.veto_result.get("citations") or []
                                          if c.count("/") >= 2})),
        "veto_citations": list(cand.veto_result.get("citations") or []),
        "n_citations": len(cand.veto_result.get("citations") or []),
        "release_window": cand.releases.get("window"), "admit_binding": (s.get("admit") or {}).get("binding"),
        "chain_asof": s.get("chain_asof"),
    }
    if cand.module == "W8":
        out.update(take_profit_frac=float(cfg["take_profit_frac_of_max"]),
                   tp_value_usd=float(cfg["take_profit_frac_of_max"]) * s["width"] * n * mult,
                   invalidation_below=float(cfg["invalidation_below"]),
                   invalidation_question=(cand.invalidation or {}).get("question"),
                   invalidation_price=(cand.invalidation or {}).get("price"),
                   invalidation_date=(cand.invalidation or {}).get("date"),
                   oil_drop=float(cfg["oil_drop"]), pm_jump=float(cfg["pm_jump"]), pm_through=float(cfg["pm_through"]),
                   pm_jump_points=int(round(100 * float(cfg["pm_jump"]))),
                   brent_contract=sig.get("brent_contract", "").split(".")[0], brent_month=sig.get("brent_month"),
                   brent_ret=sig.get("brent_ret"), bno_ret=sig.get("bno_ret"), pm_question=sig.get("pm_question"),
                   pm_prev=sig.get("pm_prev"), pm_price=sig.get("pm_price"))
        if s["root"] in (cfg.get("earnings_roots") or []) and s.get("earnings"):
            out["earnings_date"] = s["earnings"].get("date")
    else:
        rets = {k.split(".")[0]: v for k, v in (sig.get("rets") or {}).items() if v is not None}
        best = max(rets, key=lambda k: rets[k]) if rets else None
        out.update(take_profit_multiple=float(cfg["take_profit_multiple"]),
                   tp_value_usd=float(cfg["take_profit_multiple"]) * float(s["limit_price"]) * n * mult,
                   oil_jump=float(cfg["oil_jump"]), oil_contract=best, oil_ret=rets.get(best) if best else None,
                   mbd_offline=sig.get("mbd_offline"), no_restoration_days=sig.get("no_restoration_days"),
                   supply_what=sig.get("supply_what"),
                   supply_sources=", ".join(sorted({u.split("/")[2] for u in sig.get("supply_sources") or []
                                                    if u.count("/") >= 2})),
                   contango_roll_yield=(cand.facts.get("contango") or {}).get("roll_yield"),
                   contango_veto_roll_yield=float(cfg["contango_veto_roll_yield"]))
    return out


def exit_facts(run: "Run", module: str, cfg: dict, ot: dict, ex: dict, quote: dict, limit: float,
               minimum: float) -> dict[str, Any]:
    """EXIT facts (contract §8): the closing prices, the result at tonight's mid and the reason."""
    mult = int(run.cfg.fills["options"].get("multiplier", 100))
    n = int(ot["contracts"])
    entry = float(ot.get("entry_price") or 0.0)
    mid = float(quote["mid"])
    out = {
        **_common(run, module, cfg, ot.get("account") or str(cfg["account"])), "status": cfg.get("status"),
        "root": ot["root"], "ticker": ot["root"], "underlying_name": UNDERLYING_NAMES.get(ot["root"], ot["root"]),
        "ticker_name": UNDERLYING_NAMES.get(ot["root"], ot["root"]), "strategy_label": "call debit spread",
        "legs": [dict(leg) for leg in ot["legs"]], "expiry": ot.get("expiry"), "contracts": n,
        "spread_word": "call spread" if n == 1 else "call spreads",
        "long_strike": ot.get("long_strike"), "short_strike": ot.get("short_strike"), "width": ot.get("width"),
        "limit_price": limit, "max_price": minimum, "credit_usd": n * limit * mult, "min_credit_usd": n * minimum * mult,
        "entry_price": entry or None, "entry_date": ot.get("fill_date"), "value_mid": mid,
        "pnl_usd": (mid - entry) * n * mult if entry else None, "pnl_pct": 100.0 * (mid / entry - 1.0) if entry else None,
        "reason": ex["reason"], "sessions_held": ex.get("sessions_held"), "exit_date": ot.get("exit_date"),
        "time_stop_sessions": int(cfg["time_stop_sessions"]), **_settlement(ot["root"]),
        "base_rates": dict(cfg.get("base_rates") or {}),
    }
    if module == "W8":
        inv = ot.get("invalidation") or {}
        out.update(take_profit_frac=float(cfg["take_profit_frac_of_max"]),
                   invalidation_below=float(cfg["invalidation_below"]), invalidation_question=inv.get("question"),
                   invalidation_price=inv.get("price"))
    else:
        out.update(take_profit_multiple=float(cfg["take_profit_multiple"]))
    if ex["reason"] == "invalidation":
        out["invalidation_reason"] = ot.get("invalidation_reason")
    return out


# ----------------------------------------------------------------------------------------------------
# options job hooks (10:17 ET)
# ----------------------------------------------------------------------------------------------------

def on_spread_fill(run: "Run", fill: "Fill", intent: "OrderIntent") -> None:
    """The options job filled one of this module's spread orders: open the trade, or close and score it."""
    module = fill.module
    if module not in MODULES:
        return
    st = _state(run, module)
    ot = st.get("open_trade")
    if not ot or ot.get("trade_id") != fill.trade_id:
        run.alert("fill", f"{module}: fill {fill.intent_id} matches no open {module} trade")
        return
    cfg = _cfg(run, module)
    if fill.side == "buy":
        ot.update(status="open", fill_date=fill.fill_date, entry_price=float(fill.price), contracts=int(fill.qty),
                  cost=float(fill.dollars), exit_date=rules.time_stop_date(fill.fill_date,
                                                                          int(cfg["time_stop_sessions"])))
        _event(run, module, "fill", "opened", "", trade_id=fill.trade_id)
        return
    meta = dict((getattr(run.broker, "last_fill_meta", None) or {}).get(fill.intent_id) or {})
    mult = int(fill.multiplier) if int(fill.multiplier or 1) > 1 else int(run.cfg.fills["options"].get("multiplier", 100))
    entry = float(ot.get("entry_price") or 0.0)
    ret = float(fill.price) / entry - 1.0 if entry else None
    pnl = meta.get("realized_pnl")
    if pnl is None and entry:
        pnl = (float(fill.price) - entry) * int(fill.qty) * mult
    result = {"trade_id": ot["trade_id"], "module": module, "root": ot.get("root"), "entry_date": ot.get("fill_date"),
              "entry_price": entry, "exit_date": fill.fill_date, "exit_price": float(fill.price),
              "contracts": int(fill.qty), "return": ret, "pnl": pnl, "exit_reason": ot.get("exit_reason"),
              "profit": bool(ret is not None and ret > 0), "cost": ot.get("cost"), "expiry": ot.get("expiry")}
    _resolve_forecasts(run, ot["trade_id"], result)
    st["history"].append(result)
    st["open_trade"] = None
    run.log("resolution", {"trade": result})
    _event(run, module, "fill", "closed", str(result["exit_reason"]), trade_id=result["trade_id"])


def on_spread_cancel(run: "Run", intent: "OrderIntent", reason: str) -> None:
    """No fill within the stated maximum (minimum): an entry is skipped; an exit is re-issued tonight if still due."""
    module = intent.module
    if module not in MODULES:
        return
    st = _state(run, module)
    ot = st.get("open_trade")
    if not ot or ot.get("trade_id") != intent.trade_id:
        return
    if intent.side == "buy":
        dropped = [f for f in run.state["forecasts"]["open"] if f.get("trade_id") == intent.trade_id]
        if dropped:
            run.state["forecasts"]["open"] = [f for f in run.state["forecasts"]["open"]
                                              if f.get("trade_id") != intent.trade_id]
            run.log("correction", {"voided_forecasts": [f["forecast_id"] for f in dropped],
                                   "reason": f"{intent.trade_id} entry not filled ({reason})"})
        run.log("shadow", {"book": module, "event": "entry_not_filled", "trade_id": intent.trade_id,
                           "reason": reason})
        _event(run, module, "fill", "entry_not_filled", reason, trade_id=intent.trade_id)
        st["open_trade"] = None
        run.note(f"{module} {intent.trade_id}: entry not filled ({reason}); skipped")
        return
    ot.update(status="open", exit_retry=int(ot.get("exit_retry") or 0) + 1)
    run.alert("fill", f"{module} {intent.trade_id}: exit not filled ({reason}); tonight's run re-issues it if due")


def _resolve_forecasts(run: "Run", trade_id: str, result: dict) -> None:
    """Resolve the trade's "on_exit" forecasts (as pipeline._resolve_trade does for Phase A trades)."""
    open_fc = run.state["forecasts"]["open"]
    mine = [f for f in open_fc if f.get("trade_id") == trade_id and f.get("resolves") == "on_exit"]
    if not mine:
        return
    ids = {f["forecast_id"] for f in mine}
    run.state["forecasts"]["open"] = [f for f in open_fc if f["forecast_id"] not in ids]
    for f in fc.resolve_trade_forecasts(mine, result):
        f["resolved_date"] = run.date
        run.state["forecasts"]["resolved"].append(f)
        run.log("resolution", {"forecast": f})


def roots_needed(run: "Run") -> set[str]:
    """Option roots of W8/W9 trades that are waiting for a fill or open (the options job snapshots them)."""
    roots = set()
    for m in MODULES:
        ot = (run.state["modules"].get(m) or {}).get("open_trade")
        if ot and ot.get("status") in ACTIVE and ot.get("root"):
            roots.add(str(ot["root"]))
    return roots


def options_job(run: "Run", chains: dict[str, Any]) -> None:
    """10:17 ET hook: W8/W9 need no market-hours work beyond the fills (contract §7)."""
    return None


# ----------------------------------------------------------------------------------------------------
# forecasts (contract §9): pre-registered at the entry, resolved at the exit
# ----------------------------------------------------------------------------------------------------

def _specs(module: str) -> Callable[[Recommendation, Any], list[dict]]:
    def build(rec: Recommendation, cfg: Any) -> list[dict]:
        m = cfg.module(module)
        p, n = m["forecasts"], int(m["time_stop_sessions"])
        ticker = rec.orders[0].ticker if rec.orders else str(m["roots"][0])
        others = "the take-profit or the ceasefire exit" if module == "W8" else "the take-profit or an invalidation"
        return [fc._spec("profit", ticker, "The spread is sold for more than it cost", p["p_profit"]),
                fc._spec("time_stop", ticker, f"The trade exits on the {n}-trading-day time stop rather than {others}",
                         p["p_time_stop"])]
    return build


for _m in MODULES:
    fc.EXTRA_SPECS[(_m, "NEW_TRADE")] = _specs(_m)
