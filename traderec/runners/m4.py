"""M4 — O2 crash call debit spread (policy module; 90-day exception; design v3.3 §3 M4) and its 60-DTE paper twin.

Hooks (docs/PHASE_B_CONTRACTS.md §7):

* `daily(run, checks)`, 22:17 ET, after M1 and W10 (M1 goes first in the US-equity reserve; W10 and M4 are first
  come, first served):
  1. an open spread: the EXIT email goes out the evening before its planned close (two sessions before expiry); a
     close that did not fill is re-issued the next evening with fresh prices; once the last session before expiry
     has passed, an alert (the options job's safety net settles the spread at expiry);
  2. the entry test (`m4_crashspread.m4_signal`) on the primary data, which also starts the cool-down (first day
     only); then two-source confirmation (the S&P close with `verify_close` and the rule re-run on it, as W10's; the
     VIX with the pipeline's check), one spread at a time, the trade budget, the structure (XSP; SPY only when XSP
     fails the liquidity check), prices from tonight's chain (mid + 0.3 / 0.5 x natural width), the size (debit
     <= 2% of NAV, nearest whole contract within the 3% cap) and `risk.admit_premium` (exempt from G(D)); then
     the NEW_TRADE email and a spread order for the next 10:17 ET job.
* `on_spread_fill` / `on_spread_cancel`: the 10:17 ET job filled or cancelled an M4 order.
* `roots_needed` / `options_job`: at 10:17 ET, the liquidity probe (XSP and SPY measured in market hours while the
  S&P is near the trigger, design §4 "Option liquidity") and the 60-DTE twin (`shadow.M4_TWIN`, the same signal on
  the expiry nearest to, but not beyond, entry + 60), entered and exited at model prices.
* `entry_facts` / `exit_facts`: the email facts (contract §8). `forecast_specs` registers itself in
  `forecasts.EXTRA_SPECS` at import.

Fail closed: a missing, stale or disagreeing close, VIX or option chain means no new spread tonight, an alert and a
ledger record. The signal still counts for the cool-down (the research's first-day chain is data-driven).
"""
from __future__ import annotations

import math
import weakref
from typing import TYPE_CHECKING, Any, Callable

import pandas as pd

from traderec import forecasts as fc
from traderec import growth, risk
from traderec.data import verify_close
from traderec.market_calendar import iso, next_trading_day
from traderec.modules import m4_crashspread as m4
from traderec.options import chain as chain_mod
from traderec.options import job as job_mod
from traderec.options.fillmodel import at_price_floor, combo_quote, model_price, order_prices
from traderec.types import OrderIntent, Recommendation

if TYPE_CHECKING:  # pragma: no cover
    from traderec.pipeline import Run
    from traderec.types import Fill

MODULE = "M4"
TWIN = "M4_TWIN"
CLUSTER = "us_equity"
QUESTION = "The spread closes worth more than its debit"
SIGNAL_KEYS = ("high_sessions", "drop_from_high", "vix_min", "cooldown_days")
# Option root -> (the verified close that sets its at-the-money strike, scale): XSP is one-tenth of the S&P 500.
REFERENCE = {"XSP": ("^GSPC", 0.1), "SPX": ("^GSPC", 1.0), "SPXW": ("^GSPC", 1.0)}
UNDERLYING_NAMES = {"XSP": "Mini-S&P 500 index (one-tenth of the S&P 500)", "SPX": "S&P 500 index",
                    "SPXW": "S&P 500 index", "SPY": "SPDR S&P 500 ETF"}

# Tonight's option chains, fetched once per run (a provider may return a new snapshot on every call).
_CHAINS: "weakref.WeakKeyDictionary[Any, dict[str, tuple[Any, str | None]]]" = weakref.WeakKeyDictionary()


# --------------------------------------------------------------------------------------------- helpers

def _cfg(run: "Run") -> dict:
    return (run.cfg.constitution.get("modules") or {}).get(MODULE) or {}


def _twin_cfg(run: "Run") -> dict:
    return (run.cfg.constitution.get("shadow") or {}).get(TWIN) or {}


def _state(run: "Run") -> dict:
    """M4's state entry (contract §6), created for older states."""
    st = run.state["modules"].setdefault(MODULE, {})
    st.setdefault("open_trade", None)
    st.setdefault("history", [])
    st.setdefault("cooldown_until", None)
    return st


def _twin_state(run: "Run") -> dict:
    book = run.state.setdefault("shadow", {}).setdefault(TWIN, {})
    book.setdefault("open_trade", None)
    book.setdefault("trades", [])
    return book


def _opts(run: "Run") -> dict:
    return dict(run.cfg.fills.get("options") or {})


def _mult(run: "Run") -> int:
    return int(_opts(run).get("multiplier", risk.OPTION_MULTIPLIER))


def _f(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _contracts_label(n: int) -> str:
    return f"{int(n)} contract" + ("" if int(n) == 1 else "s")


def _guard(run: "Run", name: str, fn: Callable[..., None], *args: Any) -> None:
    """Shadow work (the twin, the liquidity probe): an exception becomes an alert, never a failed run."""
    try:
        fn(run, *args)
    except Exception as exc:  # noqa: BLE001 - a shadow book must never stop the run
        run.alert("shadow", f"{name} failed: {type(exc).__name__}: {exc}")
        run.log("shadow", {"book": name, "event": "error", "error": f"{type(exc).__name__}: {exc}"})


def _stale(run: "Run", chain: Any) -> str | None:
    """Why `chain` cannot price this run's orders, or None.

    The options job hands its hooks chains it has already checked against its market-hours window, so a chain of the
    run date will do there. Every other run (the 22:17 ET run) prices from tonight's closing quotes, so its chains
    must also pass the rule the spread marks use: stamped at or after `options.close_after_et`
    (`options.job._closing_problem`).
    """
    root = getattr(chain, "underlying", "?")
    asof = str(getattr(chain, "asof", "") or "")[:10]
    if asof != run.date:
        return f"the {root} chain is from {asof or 'an unknown date'}, not {run.date}"
    if run.kind == "options":
        return None
    close_after = job_mod.options_config(run.cfg).get("close_after_et") or job_mod.OPTIONS_DEFAULTS["close_after_et"]
    problem = job_mod._closing_problem(chain, run.date, str(close_after))
    return f"the {root} chain: {problem}" if problem else None


def _evening_chain(run: "Run", root: str) -> tuple[Any, str | None]:
    """Tonight's chain for `root` (the closing quotes of the 22:17 ET run), fetched once per run: (chain, None) or
    (None, why)."""
    shared = getattr(run, "chains", None)          # chains another hook already fetched for this run, if any
    if isinstance(shared, dict) and shared.get(root) is not None:
        return shared[root], None
    try:
        cache = _CHAINS.setdefault(run, {})
    except TypeError:                               # not weak-referenceable: no cache
        cache = {}
    if root not in cache:
        fetch = getattr(run.provider, "option_chain", None)
        if fetch is None:
            cache[root] = (None, "the data provider has no option chains")
        else:
            try:
                cache[root] = (fetch(root), None)
            except Exception as exc:  # noqa: BLE001 - no chain: no new spread tonight (fail closed)
                cache[root] = (None, f"{root} option chain unavailable ({type(exc).__name__}: {exc})")
    return cache[root]


def _liquidity(run: "Run", chain: Any, legs: list[dict]) -> dict:
    """`options.chain.liquidity_check` (options build) with the `options.liquidity` config; until it is built,
    `m4_crashspread.liquidity_fallback` (design §4 R8). A check that raises counts as failed (fail closed)."""
    cfg_liq = (run.cfg.constitution.get("options") or {}).get("liquidity") or {}
    check = getattr(chain_mod, "liquidity_check", None)
    if not callable(check):
        return dict(m4.liquidity_fallback(chain, legs, cfg_liq), checker="m4 fallback")
    try:
        return dict(check(chain, legs, cfg_liq), checker="options.chain.liquidity_check")
    except Exception as exc:  # noqa: BLE001 - a check that cannot run is a failed check
        return {"ok": False, "reasons": [f"liquidity check failed to run: {type(exc).__name__}: {exc}"],
                "per_leg": [], "round_trip_frac": None, "checker": "options.chain.liquidity_check"}


def _underlying_close(run: "Run", root: str, day: str) -> float | None:
    """The official close of `root`'s underlying on `day` (XSP: the S&P 500 close / 10)."""
    ticker, scale = REFERENCE.get(root, (root, 1.0))
    try:
        px = run.close_on(ticker, day)
    except Exception:  # noqa: BLE001 - no data: the caller retries or alerts
        return None
    return px * scale if px is not None else None


def _sessions_after(start: str, end: str) -> int:
    """NYSE sessions dated after `start`, up to and including `end`."""
    n, d = 0, next_trading_day(start)
    while d.isoformat() <= end:
        n += 1
        d = next_trading_day(d)
    return n


# ---------------------------------------------------------------------------------------- daily (22:17)

def daily(run: "Run", checks: dict) -> None:
    """22:17 ET: the open spread's close, then the entry test (and the twin's evening work)."""
    cfg_m4, cfg_twin = _cfg(run), _twin_cfg(run)
    on, twin_on = bool(cfg_m4.get("enabled")), bool(cfg_twin.get("enabled"))
    if not (on or twin_on):
        return
    if any(k not in cfg_m4 for k in SIGNAL_KEYS):
        run.note("M4 not evaluated: modules.M4 lacks its signal parameters")
        return
    st = _state(run)
    # design v4 §3: M4 is shadow under the growth book: no entries (the twin keeps running); an open spread is still
    # managed to its exit
    trades = growth.module_trades(run.cfg, MODULE)
    if twin_on:
        _guard(run, TWIN, _twin_evening)
    if on:
        _manage_open(run, st, cfg_m4)
    sig = _evaluate(run, checks, cfg_m4, st)
    if not (sig and sig.get("signal") and sig.get("confirmed")):
        return
    if twin_on:
        _guard(run, TWIN, _twin_signal, sig)
    if on and trades:
        _enter(run, st, sig, cfg_m4, checks)
    elif on:
        run.log("shadow", {"book": MODULE, "event": "signal_while_shadow", "signal_date": run.date,
                           "drawdown": sig.get("drawdown"), "vix": sig.get("vix"),
                           "status": growth.module_status(run.cfg, MODULE)})


def _evaluate(run: "Run", checks: dict, cfg_m4: dict, st: dict) -> dict | None:
    """The entry test and its two-source confirmation. A signal on the primary data starts the cool-down whether or
    not it is confirmed or traded (first day only). Returns the signal dict (with "confirmed"), or None."""
    index = str(cfg_m4.get("index", "^GSPC"))
    vix = checks.get("vix_series")
    if vix is None or not len(vix):
        run.note("M4 not evaluated: no VIX data")
        return None
    try:
        spx = run.bars(index)
    except Exception as exc:  # noqa: BLE001 - no index data: no signal tonight
        run.note(f"M4 not evaluated: {index} unavailable ({type(exc).__name__})")
        return None
    prev_cool = st.get("cooldown_until")
    today_vix = _f(checks.get("vix"))                   # the pipeline's VIX close (CBOE, else Yahoo)
    sig = m4.m4_signal(spx, vix, run.date, cfg_m4, cooldown_until=prev_cool, vix_override=today_vix)
    dd = sig.get("drawdown")
    st["armed"] = bool(dd is not None and dd <= float(cfg_m4.get("probe_drawdown", -0.10)))
    if sig.get("condition"):
        run.log("signal", {"module": MODULE, "check": "entry", **sig})
    if not sig.get("signal"):
        return sig
    st.update(last_signal=run.date, cooldown_until=m4.cooldown_end(run.date, int(cfg_m4["cooldown_days"])))
    chk = verify_close(run.provider, spx, index, run.date, float(run.cfg.data["two_source_tolerance"]))
    second = (m4.m4_signal(spx, vix, run.date, cfg_m4, cooldown_until=prev_cool, close_override=chk["secondary"],
                           vix_override=today_vix) if chk.get("secondary") is not None else {})
    if not chk.get("ok"):
        why = str(chk.get("reason"))
    elif not second.get("signal"):
        why = f"the second source's close {chk.get('secondary')} gives no signal: {second.get('reasons')}"
    elif not checks.get("vix_ok"):
        why = "the VIX sources disagree"
    else:
        why = None
    sig = dict(sig, confirmed=why is None, second_source=chk)
    if why is not None:
        run.alert("data", f"M4 signal not confirmed ({why}); logged in the shadow ledger only")
        run.log("shadow", {"book": MODULE, "event": "unconfirmed_signal", "reason": why, **sig})
    return sig


def _enter(run: "Run", st: dict, sig: dict, cfg_m4: dict, checks: dict) -> None:
    ot = st.get("open_trade")
    if ot:
        run.note(f"M4 signal while {ot.get('trade_id')} is open: shadow ledger only (one spread at a time)")
        run.log("shadow", {"book": MODULE, "event": "signal_while_open", "open_trade": ot.get("trade_id"),
                           "signal_date": run.date, "drawdown": sig.get("drawdown"), "vix": sig.get("vix")})
        return
    if not run.budget_ok():
        return
    choice = _choose_structure(run, sig, cfg_m4, checks)
    if choice is None:
        return
    mult = _mult(run)
    prices = {k: round(float(v), 2) for k, v in order_prices(choice["quote"], "buy", _opts(run)).items()}
    if not (prices["limit_price"] > 0 and prices["max_price"] >= prices["limit_price"]):
        run.alert("data", f"M4 signal not traded: unusable prices {prices} from tonight's {choice['root']} chain")
        return
    per_contract = prices["max_price"] * mult                    # the stated maximum: the most one contract costs
    nav = run.current_nav()
    size = m4.size_contracts(nav, per_contract, float(cfg_m4["debit_pct_nav"]),
                             risk.premium_caps(run.cfg)["per_trade_premium"])
    if size["contracts"] < 1:
        run.note(f"M4 signal skipped: {size['reason']}")
        run.log("signal", {"module": MODULE, "check": "size", "root": choice["root"], **size})
        return
    book = _book_stress(run)
    adm = risk.admit_premium(MODULE, choice["root"], size["contracts"] * per_contract, CLUSTER, book, run.cfg,
                             run.current_drawdown(), exempt_governor=True, min_premium_usd=per_contract)
    contracts = min(int(size["contracts"]), int(math.floor(float(adm["premium_usd"]) / per_contract + 1e-9)))
    run.log("signal", {"module": MODULE, "check": "admit", "root": choice["root"], "size": size, **adm,
                       "contracts": contracts,
                       "book": {k: book.get(k) for k in ("total", "us_equity", "premium", "pending", "nav")}})
    if not adm.get("ok") or contracts < 1:
        run.note(f"M4 signal not admitted: {adm.get('binding')} {adm.get('notes')}")
        return
    trade_id = f"T-{run.date}-{MODULE}"
    intent = OrderIntent(intent_id=run.next_intent_id(MODULE), trade_id=trade_id, module=MODULE,
                         account=str(cfg_m4["account"]), ticker=choice["root"], side="buy", created_date=run.date,
                         reason="entry", order_type="spread_limit", legs=[dict(leg) for leg in choice["legs"]],
                         contracts=contracts, limit_price=prices["limit_price"], max_price=prices["max_price"])
    facts = entry_facts(run, sig, choice, prices, contracts, adm, cfg_m4)
    rec = Recommendation("NEW_TRADE", MODULE, trade_id, run.date, [intent], facts)
    if run.emit(rec):
        st["open_trade"] = {
            "trade_id": trade_id, "status": "pending_entry", "signal_date": run.date, "intent_id": intent.intent_id,
            "root": choice["root"], "account": intent.account, "legs": intent.legs, "contracts": contracts,
            "expiry": choice["expiry"], "exit_date": facts["exit_date"], "last_close_date": facts["last_close_date"],
            "limit_price": prices["limit_price"], "max_price": prices["max_price"], "debit_usd": facts["debit_usd"],
            "max_debit_usd": facts["max_debit_usd"], "spot": choice["spot"], "fallback_from": choice.get("fallback_from"),
            "entry_price": None, "fill_date": None,
        }
        run.count_trade()


def _choose_structure(run: "Run", sig: dict, cfg_m4: dict, checks: dict) -> dict | None:
    """XSP; SPY only when XSP fails the liquidity check (design §3 M4). Missing, stale or disagreeing data, or no
    listed structure, fail closed without a fallback."""
    roots = [str(cfg_m4.get("root", "XSP"))] + ([str(cfg_m4["fallback_root"])] if cfg_m4.get("fallback_root") else [])
    entry = m4.entry_session(run.date)
    probe = _todays_probe(run)
    tried: list[dict] = []
    for root in roots:
        res = _structure(run, root, sig, cfg_m4, checks, entry, probe.get(root))
        run.log("signal", {"module": MODULE, "check": "structure",
                           **{k: v for k, v in res.items() if k not in ("quote", "chain")}})
        if res["ok"]:
            if tried:
                res.update(fallback_from=tried[0]["root"], fallback_reasons=tried[0]["reasons"])
            return res
        tried.append(res)
        if res["stage"] != "liquidity":
            break
    detail = "; ".join(f"{r['root']} {r['stage']}: {', '.join(r['reasons'][:3])}" for r in tried)
    run.alert("liquidity" if tried[-1]["stage"] == "liquidity" else "data",
              f"M4 signal not traded: no usable spread ({detail})")
    return None


def _reference_close(run: "Run", root: str, sig: dict, checks: dict) -> float | None:
    """The verified close that sets the at-the-money strike: the confirmed S&P close x 0.1 for XSP; SPY's close only
    when tonight's two-source check passed."""
    if root in REFERENCE:
        return float(sig["close"]) * REFERENCE[root][1]
    try:
        bars = run.bars(root)
    except Exception:  # noqa: BLE001
        return None
    if root == "SPY":
        ok = bool(checks.get("spy_ok"))
    else:
        ok = bool(verify_close(run.provider, bars, root, run.date, float(run.cfg.data["two_source_tolerance"]))
                  .get("ok"))
    return run.close_on(root, run.date) if ok else None


def _structure(run: "Run", root: str, sig: dict, cfg_m4: dict, checks: dict, entry: str,
               probe: dict | None) -> dict:
    """The spread on `root` from tonight's chain. "stage" says where it stopped: "data", "structure", "liquidity"
    or "ok"."""
    res: dict[str, Any] = {"ok": False, "root": root, "stage": "data", "reasons": []}
    ref = _reference_close(run, root, sig, checks)
    if ref is None or ref <= 0:
        res["reasons"] = [f"no verified close for {root} tonight"]
        return res
    chain, why = _evening_chain(run, root)
    problem = why or (_stale(run, chain) if chain is not None else "no chain")
    spot = _f(getattr(chain, "spot", None)) if chain is not None else None
    tol = float(cfg_m4.get("spot_tolerance", 0.01))
    if problem is None and (spot is None or spot <= 0 or abs(spot / ref - 1.0) > tol):
        problem = f"the chain's spot {spot} disagrees with the verified close {ref:,.2f} by more than {tol:.1%}"
    if problem:
        res["reasons"] = [problem]
        return res
    res.update(stage="structure", spot=ref, chain_spot=spot, chain_asof=chain.asof, source=chain.source,
               raw_sha256=chain.raw_sha256)
    expiry = m4.choose_expiry(chain.expiries(), entry, int(cfg_m4["max_calendar_days"]), int(cfg_m4["min_dte"]))
    if expiry is None:
        res["reasons"] = [f"no listed expiry {cfg_m4['min_dte']}-{cfg_m4['max_calendar_days']} days after {entry}"]
        return res
    pick = m4.choose_strikes(chain, expiry, ref, float(cfg_m4["short_strike_ratio"]),
                             float(cfg_m4["strike_tolerance"]))
    res["expiry"] = expiry
    if not pick["ok"]:
        res["reasons"] = list(pick["reasons"])
        return res
    res.update(stage="liquidity", legs=pick["legs"])
    quote = combo_quote(chain, pick["legs"], "buy")
    if quote is None:
        res["reasons"] = ["no two-sided quote for every leg tonight"]
        return res
    liq = (dict(probe, measured="10:17 ET snapshot") if probe is not None
           else dict(_liquidity(run, chain, pick["legs"]), measured="tonight's chain"))
    res.update(quote=quote, liquidity={k: liq.get(k) for k in ("ok", "reasons", "round_trip_frac", "measured",
                                                                 "checker", "expiry")})
    if not liq.get("ok"):
        res["reasons"] = list(liq.get("reasons") or ["failed the liquidity check"])
        return res
    res.update(ok=True, stage="ok")
    return res


def _todays_probe(run: "Run") -> dict:
    probe = _state(run).get("liquidity_probe") or {}
    return dict(probe.get("results") or {}) if probe.get("date") == run.date else {}


def _open_spreads(run: "Run") -> list[dict]:
    """Open spreads for the risk book: `PaperBroker.spreads()` (options build), else the spread modules' own open
    trades (cost = entry price x contracts x multiplier)."""
    spreads = getattr(run.broker, "spreads", None)
    if callable(spreads):
        return [dict(s) for s in spreads()]
    out = []
    for module in ("M4", "W8", "W9"):
        ot = (run.state["modules"].get(module) or {}).get("open_trade") or {}
        if ot.get("status") in ("open", "pending_exit") and ot.get("contracts") and ot.get("entry_price"):
            legs = ot.get("legs") or [{}]
            out.append({"module": module, "trade_id": ot.get("trade_id"), "root": ot.get("root") or legs[0].get("root"),
                        "contracts": ot["contracts"], "cost": ot.get("cost"), "entry_price": ot["entry_price"],
                        "mark": ot.get("mark")})
    return out


def _book_stress(run: "Run") -> dict:
    """The book as M4's admission sees it: lots, open spreads and every pending buy (so a W10 order queued tonight
    takes its room first: first come, first served)."""
    pending = [o.to_dict() for o in run.broker.pending()]
    extra = tuple(sorted({str(o["ticker"]) for o in pending if o.get("side") == "buy"
                          and o.get("order_type") != "spread_limit" and o.get("module") != "M2"}))
    stress = run.stress(extra)
    return risk.open_stress(run.broker.positions(), run.position_values(), stress, run.cfg,
                            spreads=_open_spreads(run), pending=pending)


# ------------------------------------------------------------------------------------------ the close

def _manage_open(run: "Run", st: dict, cfg_m4: dict) -> None:
    ot = st.get("open_trade")
    if not ot:
        return
    if ot.get("status") in ("pending_entry", "pending_exit") and _cancel_missed_order(run, ot):
        ot = st.get("open_trade")            # a missed entry is skipped; a missed close is open again
        if not ot:
            return
    if ot.get("status") != "open":
        return
    if _reconcile_expired(run, st, ot):
        return
    ex = m4.m4_exit_check(run.date, ot, int(cfg_m4.get("close_sessions_before_expiry", 2)))
    if ex["too_late"]:
        run.log("signal", {"module": MODULE, "check": "exit", "trade_id": ot["trade_id"], **ex})
        run.alert("fill", f"M4 {ot['trade_id']} was not closed by {ex['last_close_date']}, the last session before its "
                          f"expiry on {ex['expiry']}; the paper broker settles it at expiry (safety net)")
        return
    if ex["exit"]:
        run.log("signal", {"module": MODULE, "check": "exit", "trade_id": ot["trade_id"], **ex})
        _emit_exit(run, ot, ex, cfg_m4)


def _cancel_missed_order(run: "Run", ot: dict) -> bool:
    """Cancel the trade's pending order once its 10:17 ET session has passed with no fill decision (that day's
    options job failed, found no usable quotes or did not run): a day order cannot fill later. Waiting for the next
    job to cancel it would leave no EXIT for the last session before expiry (design §3a.4). `on_spread_cancel` then
    acts as for a no-fill: an entry is skipped; a close is open again, so tonight's exit check sends a fresh EXIT.
    True when an order was cancelled."""
    iid = ot.get("intent_id") if ot.get("status") == "pending_entry" else ot.get("exit_intent_id")
    order = next((o for o in run.broker.pending() if o.intent_id == iid), None)
    if order is None:
        return False
    session = iso(next_trading_day(order.created_date))
    if run.date < session:
        return False
    reason = (f"its session {session} passed without a fill decision (no options run with usable quotes that day); "
              "a day order cannot fill later")
    run.broker.cancel_pending(order.intent_id, run.date, reason)
    run.log("fill", {"type": "no_fill", "filled": False, "cancelled": True, "reason": reason,
                     **job_mod._intent_fields(order), "fill_date": run.date})
    on_spread_cancel(run, order, reason)
    return True


def _reconcile_expired(run: "Run", st: dict, ot: dict) -> bool:
    """After expiry, close the record once the broker no longer holds the spread (its safety net settled it and no
    fill reached `on_spread_fill`), at intrinsic value from the underlying's close on the expiry date."""
    expiry = str(ot.get("expiry") or "")
    spreads = getattr(run.broker, "spreads", None)
    if not expiry or run.date < expiry or not callable(spreads):
        return False
    if any(s.get("trade_id") == ot["trade_id"] for s in spreads()):
        return False
    under = _underlying_close(run, str(ot["root"]), expiry)
    if under is None:
        run.alert("data", f"M4 {ot['trade_id']}: settled at expiry, but no underlying close for {expiry}")
        return True
    value = m4.intrinsic_value(ot["legs"], under)
    _close_trade(run, st, ot, exit_date=expiry, exit_price=value,
                 proceeds=value * int(ot["contracts"]) * _mult(run), reason="expiry_settlement")
    return True


def _emit_exit(run: "Run", ot: dict, ex: dict, cfg_m4: dict) -> None:
    """The EXIT email with fresh prices from tonight's chain: limit mid - 0.3 x natural width, stated minimum
    max(0, mid - 0.5 x natural width)."""
    chain, why = _evening_chain(run, str(ot["root"]))
    problem = why or (_stale(run, chain) if chain is not None else "no chain")
    quote = combo_quote(chain, ot["legs"], "sell") if not problem else None
    if quote is None:
        run.alert("data", f"M4 close of {ot['trade_id']} cannot be priced tonight "
                          f"({problem or 'no two-sided quote for every leg'}); retried tomorrow evening while a "
                          f"session before expiry is left")
        return
    prices = {k: round(float(v), 2) for k, v in order_prices(quote, "sell", _opts(run)).items()}
    if not (prices["limit_price"] > 0 and 0 < prices["max_price"] <= prices["limit_price"]):   # never a $0.00 order
        run.alert("data", f"M4 close of {ot['trade_id']} not emailed: unusable prices {prices} from tonight's "
                          f"{ot['root']} chain; retried tomorrow evening while a session before expiry is left")
        return
    intent = OrderIntent(intent_id=run.next_intent_id(MODULE), trade_id=ot["trade_id"], module=MODULE,
                         account=str(ot["account"]), ticker=str(ot["root"]), side="sell", created_date=run.date,
                         reason="expiry_rule", close_all=True, order_type="spread_limit",
                         legs=[dict(leg) for leg in ot["legs"]], contracts=int(ot["contracts"]),
                         limit_price=prices["limit_price"], max_price=prices["max_price"])
    facts = exit_facts(run, ot, ex, chain, quote, prices, cfg_m4)
    rec = Recommendation("EXIT", MODULE, ot["trade_id"], run.date, [intent], facts)
    if run.emit(rec):
        ot.update(status="pending_exit", exit_reason="expiry_rule", exit_signal_date=run.date,
                  exit_intent_id=intent.intent_id, exit_attempts=int(ot.get("exit_attempts") or 0) + 1)


# ------------------------------------------------------------------------------- 10:17 ET fills (hooks)

def on_spread_fill(run: "Run", fill: "Fill", intent: "OrderIntent | None") -> None:
    """The options job filled an M4 order (or its safety net settled the spread at expiry)."""
    if fill.module != MODULE:
        return
    st = _state(run)
    ot = st.get("open_trade")
    if not ot or ot.get("trade_id") != fill.trade_id:
        run.alert("fill", f"M4 fill {fill.intent_id} for {fill.trade_id} matches no open M4 trade")
        return
    if fill.side == "buy":
        meta = dict(getattr(run.broker, "last_fill_meta", {}).get(fill.intent_id, {}))
        ot.update(status="open", fill_date=fill.fill_date, entry_price=float(fill.price),
                  contracts=int(round(float(fill.qty))), cost=float(fill.dollars), entry_mid=fill.ref_price,
                  entry_attempt=meta.get("attempt"))
        run.note(f"M4 {fill.trade_id} opened: {int(round(float(fill.qty)))} x {fill.ticker} at {fill.price:.2f}")
        return
    reason = getattr(intent, "reason", None) if intent is not None else None
    if reason not in ("expiry_rule", "time_stop", "take_profit", "invalidation"):
        reason = "expiry_settlement" if fill.fill_date >= str(ot.get("expiry") or "9999") else \
            (ot.get("exit_reason") or "expiry_rule")
    meta = dict(getattr(run.broker, "last_fill_meta", {}).get(fill.intent_id, {}))
    _close_trade(run, st, ot, exit_date=fill.fill_date, exit_price=float(fill.price), proceeds=float(fill.dollars),
                 reason=str(reason), pnl=_f(meta.get("realized_pnl")))


def on_spread_cancel(run: "Run", intent: "OrderIntent", reason: str) -> None:
    """The options job cancelled an M4 order: no fill within the stated maximum (entry) or minimum (close)."""
    if intent.module != MODULE:
        return
    st = _state(run)
    ot = st.get("open_trade")
    if not ot or ot.get("trade_id") != intent.trade_id:
        return
    if intent.side == "buy":
        run.alert("fill", f"M4 entry {intent.intent_id} not filled at the 10:17 ET snapshot ({reason}): skipped "
                          "(design §3a (b)); the cool-down stands")
        st.setdefault("skipped", []).append({
            "trade_id": ot["trade_id"], "signal_date": ot.get("signal_date"), "date": run.date, "reason": reason,
            "root": ot.get("root"), "contracts": ot.get("contracts"), "limit_price": intent.limit_price,
            "max_price": intent.max_price})
        _void_forecasts(run, ot["trade_id"], f"entry not filled: {reason}")
        st["open_trade"] = None
        run.log("signal", {"module": MODULE, "check": "entry_cancelled", "trade_id": intent.trade_id,
                           "intent_id": intent.intent_id, "reason": reason})
        return
    ot.update(status="open", last_close_miss=run.date)
    last = str(ot.get("last_close_date") or m4.last_close_date(str(ot["expiry"])))
    if run.date >= last:
        run.alert("fill", f"M4 close {intent.intent_id} not filled on {run.date}, the last session before expiry "
                          f"{ot.get('expiry')} ({reason}); the paper broker settles it at expiry (safety net)")
    else:
        run.alert("fill", f"M4 close {intent.intent_id} not filled ({reason}); a fresh EXIT goes out tonight for "
                          f"{iso(next_trading_day(run.date))}")


def _close_trade(run: "Run", st: dict, ot: dict, *, exit_date: str, exit_price: float, proceeds: float, reason: str,
                 pnl: float | None = None) -> None:
    mult = _mult(run)
    contracts = int(ot.get("contracts") or 0)
    entry = float(ot.get("entry_price") or 0.0)
    cost = float(ot.get("cost") or entry * contracts * mult)
    result = {
        "trade_id": ot["trade_id"], "module": MODULE, "root": ot.get("root"), "contracts": contracts,
        "signal_date": ot.get("signal_date"), "entry_date": ot.get("fill_date"), "entry_price": entry, "cost": cost,
        "exit_date": exit_date, "exit_price": float(exit_price), "proceeds": float(proceeds),
        "return": float(exit_price) / entry - 1.0 if entry > 0 else None,
        "pnl": float(pnl) if pnl is not None else float(proceeds) - cost,
        "exit_reason": reason, "profit": bool(float(exit_price) > entry), "expiry": ot.get("expiry"),
        "planned_exit_date": ot.get("exit_date"), "exit_attempts": int(ot.get("exit_attempts") or 0),
    }
    _resolve_forecasts(run, ot["trade_id"], result)
    st["history"].append(result)
    st["open_trade"] = None
    run.log("resolution", {"trade": result})


def _resolve_forecasts(run: "Run", trade_id: str, result: dict) -> None:
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


def _void_forecasts(run: "Run", trade_id: str, reason: str) -> None:
    """A trade that never opened resolves nothing: its forecasts leave the open list (recorded as a correction)."""
    open_fc = run.state["forecasts"]["open"]
    mine = [f["forecast_id"] for f in open_fc if f.get("trade_id") == trade_id]
    if mine:
        run.state["forecasts"]["open"] = [f for f in open_fc if f.get("trade_id") != trade_id]
        run.log("correction", {"voided_forecasts": mine, "trade_id": trade_id, "reason": reason})


# ------------------------------------------------------------------------------ 10:17 ET (options job)

def roots_needed(run: "Run") -> set[str]:
    """Roots to snapshot at 10:17 ET: M4's open spread; XSP and SPY for the liquidity probe while the S&P's last close
    was near the trigger (`probe_drawdown`); the twin's root while its entry or exit is due."""
    cfg_m4 = _cfg(run)
    roots: set[str] = set()
    if not cfg_m4:
        return roots
    st = _state(run)
    ot = st.get("open_trade")
    if cfg_m4.get("enabled"):
        if ot and ot.get("root"):
            roots.add(str(ot["root"]))
        elif st.get("armed"):
            roots.add(str(cfg_m4.get("root", "XSP")))
            if cfg_m4.get("fallback_root"):
                roots.add(str(cfg_m4["fallback_root"]))
    cfg_twin = _twin_cfg(run)
    tw = _twin_state(run).get("open_trade") if cfg_twin.get("enabled") else None
    if tw and (tw.get("status") == "pending_entry"
               or str(tw.get("exit_date") or "9999") <= run.date < str(tw.get("expiry") or "0")):
        roots.add(str(tw.get("root") or cfg_twin.get("root", "XSP")))
    return roots


def options_job(run: "Run", chains: dict[str, Any]) -> None:
    """10:17 ET, after the fills: the liquidity probe and the twin's entry or exit (both shadow work, guarded)."""
    cfg_m4 = _cfg(run)
    if cfg_m4.get("enabled") and _state(run).get("armed") and not _state(run).get("open_trade"):
        _guard(run, "M4 liquidity probe", _probe, chains or {}, cfg_m4)
    if _twin_cfg(run).get("enabled") and cfg_m4:
        _guard(run, TWIN, _twin_options, chains or {})


def _probe(run: "Run", chains: dict[str, Any], cfg_m4: dict) -> None:
    """Measure the liquidity check in market hours (design §4) on the spread a signal tonight would buy: the expiry
    for an entry next session, strikes from the 10:17 spot. Tonight's entry uses today's result per root; a root
    without a usable snapshot falls back to tonight's chain."""
    entry = m4.entry_session(run.date)
    results: dict[str, dict] = {}
    for root in [str(cfg_m4.get("root", "XSP"))] + ([str(cfg_m4["fallback_root"])] if cfg_m4.get("fallback_root")
                                                     else []):
        chain = chains.get(root)
        if chain is None or _stale(run, chain):
            continue
        expiry = m4.choose_expiry(chain.expiries(), entry, int(cfg_m4["max_calendar_days"]), int(cfg_m4["min_dte"]))
        pick = (m4.choose_strikes(chain, expiry, chain.spot, float(cfg_m4["short_strike_ratio"]),
                                  float(cfg_m4["strike_tolerance"])) if expiry else None)
        if not pick or not pick["ok"]:
            continue
        liq = _liquidity(run, chain, pick["legs"])
        results[root] = {"ok": bool(liq.get("ok")), "reasons": list(liq.get("reasons") or []),
                         "round_trip_frac": liq.get("round_trip_frac"), "checker": liq.get("checker"),
                         "expiry": expiry, "strikes": [leg["strike"] for leg in pick["legs"]],
                         "spot": chain.spot, "asof": chain.asof}
    _state(run)["liquidity_probe"] = {"date": run.date, "results": results}
    run.log("signal", {"module": MODULE, "check": "liquidity_probe", "results": results})


# ------------------------------------------------------------------------------------ the 60-DTE twin

def _twin_signal(run: "Run", sig: dict) -> None:
    """A confirmed M4 signal: the twin records a pending entry for the next 10:17 ET snapshot."""
    cfg = _twin_cfg(run)
    book = _twin_state(run)
    if book.get("open_trade"):
        run.log("shadow", {"book": TWIN, "event": "signal_while_open", "signal_date": run.date,
                           "open_trade": book["open_trade"].get("trade_id")})
        return
    root = str(cfg.get("root", "XSP"))
    ref = float(sig["close"]) * REFERENCE[root][1] if root in REFERENCE else _underlying_close(run, root, run.date)
    book["open_trade"] = {"trade_id": f"S-{run.date}-{TWIN}", "status": "pending_entry", "signal_date": run.date,
                          "entry_session": m4.entry_session(run.date), "root": root, "ref_spot": ref,
                          "max_calendar_days": int(cfg["max_calendar_days"])}
    run.log("shadow", {"book": TWIN, "event": "signal", **book["open_trade"], "drawdown": sig.get("drawdown"),
                       "vix": sig.get("vix")})


def _twin_options(run: "Run", chains: dict[str, Any]) -> None:
    cfg, cfg_m4 = _twin_cfg(run), _cfg(run)
    book = _twin_state(run)
    ot = book.get("open_trade")
    if not ot:
        return
    concession = float(_opts(run).get("concession", 0.3))
    chain = chains.get(str(ot["root"]))
    if chain is not None and _stale(run, chain):
        chain = None
    if ot.get("status") == "pending_entry":
        if run.date < str(ot["entry_session"]):
            return
        why = _twin_enter(run, ot, chain, cfg, cfg_m4, concession)
        if why is None:
            return
        late = _sessions_after(str(ot["entry_session"]), run.date)
        run.log("shadow", {"book": TWIN, "event": "entry_waiting", "trade_id": ot["trade_id"], "reason": why})
        if late >= int(cfg.get("max_entry_delay_sessions", 2)):
            run.log("shadow", {"book": TWIN, "event": "entry_missed", "trade_id": ot["trade_id"], "reason": why})
            book["open_trade"] = None
        return
    if ot.get("status") == "open" and run.date >= str(ot["exit_date"]) and run.date < str(ot["expiry"]):
        quote = combo_quote(chain, ot["legs"], "sell") if chain is not None else None
        if quote is None:
            run.log("shadow", {"book": TWIN, "event": "exit_unpriced", "trade_id": ot["trade_id"], "date": run.date})
            return
        _twin_close(run, book, ot, model_price(quote, "sell", concession), "expiry_rule", run.date,
                    exit_mid=quote["mid"], exit_width=quote["natural_width"])


def _twin_enter(run: "Run", ot: dict, chain: Any, cfg: dict, cfg_m4: dict, concession: float) -> str | None:
    """Enter at the 10:17 ET model price (mid + 0.3 x natural width): the expiry nearest to, but not beyond,
    entry + 60 days; the strikes from the same verified close as M4's. None when entered, else why not."""
    if chain is None:
        return "no fresh snapshot"
    expiry = m4.choose_expiry(chain.expiries(), run.date, int(cfg["max_calendar_days"]),
                              int(cfg.get("min_dte", cfg_m4.get("min_dte", 40))))
    if expiry is None:
        return "no listed expiry in range"
    pick = m4.choose_strikes(chain, expiry, ot.get("ref_spot") or chain.spot, float(cfg_m4["short_strike_ratio"]),
                             float(cfg_m4["strike_tolerance"]))
    if not pick["ok"]:
        return "; ".join(pick["reasons"])
    quote = combo_quote(chain, pick["legs"], "buy")
    if quote is None:
        return "no two-sided quote for every leg"
    n_before = int(cfg_m4.get("close_sessions_before_expiry", 2))
    ot.update(status="open", entry_date=run.date, expiry=expiry, legs=pick["legs"],
              entry_price=model_price(quote, "buy", concession), entry_mid=quote["mid"],
              entry_width=quote["natural_width"], chain_spot=chain.spot,
              exit_date=m4.planned_exit_date(expiry, n_before), last_close_date=m4.last_close_date(expiry))
    run.log("shadow", {"book": TWIN, "event": "entry", **ot})
    return None


def _twin_evening(run: "Run") -> None:
    """The safety net: a twin spread still open on its expiry settles at intrinsic value from the official close."""
    book = _twin_state(run)
    ot = book.get("open_trade")
    if not ot or ot.get("status") != "open" or run.date < str(ot["expiry"]):
        return
    under = _underlying_close(run, str(ot["root"]), str(ot["expiry"]))
    if under is None:
        run.note(f"{TWIN}: no underlying close for {ot['expiry']} yet; settlement retried tomorrow")
        return
    _twin_close(run, book, ot, m4.intrinsic_value(ot["legs"], under), "expiry_settlement", str(ot["expiry"]),
                underlying_close=under)


def _twin_close(run: "Run", book: dict, ot: dict, price: float, reason: str, exit_date: str, **extra: Any) -> None:
    entry = float(ot.get("entry_price") or 0.0)
    trade = {**ot, "status": "closed", "planned_exit_date": ot.get("exit_date"), "exit_date": exit_date,
             "exit_price": float(price), "return": float(price) / entry - 1.0 if entry > 0 else None,
             "exit_reason": reason, "profit": bool(float(price) > entry), **extra}
    book["trades"].append(trade)
    book["open_trade"] = None
    run.log("shadow", {"book": TWIN, "event": "exit", **trade})


# ---------------------------------------------------------------------------------------- email facts

def _common(run: "Run", cfg_m4: dict, execute_date: str) -> dict[str, Any]:
    return {"module_name": cfg_m4.get("name", MODULE), "account": cfg_m4.get("account", "taxable"),
            "execute_date": execute_date, "nav": run.current_nav(), "drawdown": run.current_drawdown(),
            "governor": 1.0, "governor_exempt": True}


def _root_facts(root: str) -> dict[str, Any]:
    index_root = root in risk.INDEX_OPTION_ROOTS
    name = UNDERLYING_NAMES.get(root, root)
    return {"ticker": root, "ticker_name": name, "root": root, "underlying_name": name,
            "strategy_label": "call debit spread", "section_1256": index_root,
            "settlement": "cash-settled, European-style" if index_root else "shares, American-style",
            "american_root": None if index_root else root}


def _legs_with_quotes(legs: list[dict], quote: dict) -> list[dict]:
    by_occ = {q["occ"]: q for q in quote.get("legs") or []}
    return [{**leg, **{k: by_occ.get(leg["occ"], {}).get(k) for k in ("bid", "ask", "mid")}} for leg in legs]


def entry_facts(run: "Run", sig: dict, choice: dict, prices: dict, contracts: int, adm: dict,
                cfg_m4: dict) -> dict[str, Any]:
    """Facts for M4's NEW_TRADE email (docs/PHASE_B_CONTRACTS.md §8; `_pct` keys in percent units)."""
    mult = _mult(run)
    nav = run.current_nav()
    execute = m4.entry_session(run.date)
    expiry = choice["expiry"]
    n_before = int(cfg_m4.get("close_sessions_before_expiry", 2))
    terms = m4.spread_terms(choice["legs"], prices["limit_price"], contracts, mult)
    max_debit = contracts * prices["max_price"] * mult
    liq = choice.get("liquidity") or {}
    return {
        **_common(run, cfg_m4, execute), **_root_facts(choice["root"]),
        "legs": _legs_with_quotes(choice["legs"], choice["quote"]), "expiry": expiry,
        "dte": (pd.Timestamp(expiry) - pd.Timestamp(execute)).days,
        "contracts": contracts, "contracts_label": _contracts_label(contracts),
        "limit_price": prices["limit_price"], "max_price": prices["max_price"],
        "mid_price": choice["quote"]["mid"], "natural_width": choice["quote"]["natural_width"],
        "debit_usd": contracts * prices["limit_price"] * mult, "max_debit_usd": max_debit,
        "max_value_usd": terms["max_value_usd"], "width_usd": terms["width_usd"], "max_multiple": terms["max_multiple"],
        "long_strike": terms["long_strike"], "short_strike": terms["short_strike"], "breakeven": terms["breakeven"],
        "spot": choice["spot"],
        "exit_date": m4.planned_exit_date(expiry, n_before), "last_close_date": m4.last_close_date(expiry),
        "close_sessions_before": n_before,
        "stress_usd": max_debit, "stress_pct": 100.0 * max_debit / nav if nav else None,
        "fallback_from": choice.get("fallback_from"), "fallback_reasons": choice.get("fallback_reasons"),
        "liquidity": {"round_trip_frac": liq.get("round_trip_frac"), "measured": liq.get("measured")},
        "spx_close": sig.get("close"), "spx_high": sig.get("high"), "spx_drawdown": sig.get("drawdown"),
        "vix": sig.get("vix"), "drop_from_high": float(cfg_m4["drop_from_high"]),
        "high_sessions": int(cfg_m4["high_sessions"]), "vix_min": float(cfg_m4["vix_min"]),
        "cooldown_days": int(cfg_m4["cooldown_days"]), "max_calendar_days": int(cfg_m4["max_calendar_days"]),
        "short_strike_ratio": float(cfg_m4["short_strike_ratio"]), "debit_target": float(cfg_m4["debit_pct_nav"]),
        "premium_cap": risk.premium_caps(run.cfg)["per_trade_premium"], "admit_binding": adm.get("binding"),
        "base_rates": dict(cfg_m4.get("base_rates") or {}),
    }


def exit_facts(run: "Run", ot: dict, ex: dict, chain: Any, quote: dict, prices: dict,
               cfg_m4: dict) -> dict[str, Any]:
    """Facts for M4's EXIT email (docs/PHASE_B_CONTRACTS.md §8): tonight's prices, the result so far at the mid."""
    mult = _mult(run)
    contracts = int(ot["contracts"])
    entry = float(ot.get("entry_price") or 0.0)
    cost = float(ot.get("cost") or entry * contracts * mult)
    mid = float(quote["mid"])
    value = mid * contracts * mult
    execute = ex["next_session"]
    attempt = int(ot.get("exit_attempts") or 0) + 1
    terms = m4.spread_terms(ot["legs"], entry or mid, contracts, mult)
    return {
        **_common(run, cfg_m4, execute), **_root_facts(str(ot["root"])),
        "legs": _legs_with_quotes(ot["legs"], quote), "expiry": ex["expiry"], "contracts": contracts,
        "contracts_label": _contracts_label(contracts),
        "limit_price": prices["limit_price"], "max_price": prices["max_price"],
        "credit_usd": contracts * prices["limit_price"] * mult, "min_credit_usd": contracts * prices["max_price"] * mult,
        "entry_price": entry, "entry_date": ot.get("fill_date"), "mid_price": mid,
        "natural_width": quote["natural_width"], "position_value": value,
        "pnl_usd": value - cost, "pnl_pct": 100.0 * (mid / entry - 1.0) if entry > 0 else None,
        "reason": "expiry_rule", "exit_date": execute, "planned_exit_date": ex["exit_date"],
        "last_close_date": ex["last_close_date"], "attempt": attempt,
        "retry_date": ex["last_close_date"] if attempt == 1 and ex["last_close_date"] > execute else None,
        "retry_of": ot.get("last_close_miss") if attempt > 1 else None,
        "long_strike": terms["long_strike"], "short_strike": terms["short_strike"],
        "days_held": ex.get("days_held"), "spot": _f(getattr(chain, "spot", None)),
        "price_floor": at_price_floor(quote, "sell", _opts(run)),       # the one-tick floor, when it binds
        "base_rates": dict(cfg_m4.get("base_rates") or {}),
    }


# ------------------------------------------------------------------------------------------- forecasts

def forecast_specs(rec: Recommendation, cfg: Any) -> list[dict]:
    """One pre-registered forecast per M4 trade, resolved on exit: the close is worth more than the entry debit
    (the "profit" event). p is modules.M4.forecasts.p_profit, shrunk from track 21's win rate (docs/phase-b/m4.md)."""
    m = (cfg.constitution.get("modules") or {}).get(MODULE) or {}
    root = rec.orders[0].ticker if rec.orders else str(m.get("root", "XSP"))
    return [fc._spec("profit", root, QUESTION, float(m["forecasts"]["p_profit"]))]


fc.EXTRA_SPECS[(MODULE, "NEW_TRADE")] = forecast_specs
