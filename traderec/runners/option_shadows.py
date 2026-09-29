"""Option shadow books: M7 (O1) put credit spread, O1-h, I1/I2, and ST-2 (design v3.3 §3 "M7" and "Shadow ledger").

Shadow only: no emails, no orders, no LLM. Each book keeps `state.shadow.<BOOK>` = {"open_trade", "trades", ...} and
logs every event as a `shadow` ledger record {"book", "event", ...}. The rules are in
`traderec.modules.option_shadows`; the parameters in `config/constitution.yaml` (shadow.O1, O1H, I1, I2, ST2).

* `daily` (22:17 ET): signals at the close (the S&P 500 against its 200-day average, VIX, VIX3M from
  provider.vix("VIX3M"), BTC-USD for I2), spreads held to expiry settled at intrinsic value from the official close,
  and the ST-2 ETF book (bought at the next open, sold at the close of session 20).
* `options_job` (10:17 ET): spread entries (strikes chosen and filled on the snapshot with fill model v1.0), marks,
  the 50%-of-credit take-profit and the 21-DTE close. `roots_needed` names the chains it needs.

M7 needs ≈$162k for one XSP spread at its 2% max-loss target (design §3 M7), so at the $100k paper size it is a
shadow book. Every spread is recorded per contract, with its result R = P&L / max loss, which does not depend on the
account size; O1-h, I1, I2 and ST-2 are evidence books.

Book state, beyond the contract's {"open_trade", "trades"} (docs/PHASE_B_CONTRACTS.md §6):
* `open_trade`: the pending entry, or the newest open trade;
* `held`: older trades still open, in the books that hold to expiry and may overlap (O1-h, I1; `max_open` 2);
* `last_cycle`: the monthly expiry of the last spread opened (one entry per monthly cycle);
* `last_signal`: the date of the last signal (I1's 30-day cool-down).
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any, Callable

import pandas as pd

from traderec.data import verify_close
from traderec.market_calendar import is_trading_day, iso, next_trading_day, prev_trading_day
from traderec.modules import option_shadows as rules
from traderec.modules.m1_dipbuy import value_on

if TYPE_CHECKING:  # pragma: no cover
    from traderec.options.chain import OptionChain
    from traderec.pipeline import Run

OPTION_BOOKS = ("O1", "O1H", "I1", "I2")
ETF_BOOKS = ("ST2",)


# ------------------------------------------------------------------------------------------------- hooks

def daily(run: "Run", checks: dict) -> None:
    """22:17 ET: settle spreads due at expiry, drop entries the 10:17 ET job never took, signal at the close, and run
    the ST-2 book. Data problems block new entries (fail closed) and raise one `data` alert."""
    inputs = _Inputs(run, checks)
    for name in OPTION_BOOKS:
        cfg = _cfg(run, name)
        if cfg.get("enabled"):
            _guarded(run, name, _book_daily, run, name, cfg, inputs)
    for name in ETF_BOOKS:
        cfg = _cfg(run, name)
        if cfg.get("enabled"):
            _guarded(run, name, _st2_daily, run, name, cfg, inputs)
    _alert_problems(run, inputs.problems)


def roots_needed(run: "Run") -> set[str]:
    """Option roots the 10:17 ET job must snapshot: those of books with a pending entry or an open spread."""
    roots: set[str] = set()
    for name in OPTION_BOOKS:
        cfg = _cfg(run, name)
        book = (run.state.get("shadow") or {}).get(name) or {}
        ot = book.get("open_trade")
        if cfg.get("enabled") and (book.get("held") or (ot and ot.get("status") in ("pending_entry", "open"))):
            roots.add(str(cfg["root"]))
    return roots


def options_job(run: "Run", chains: dict[str, Any]) -> None:
    """10:17 ET: mark the open spreads and apply the take-profit and 21-DTE close, then fill yesterday's entries."""
    problems: list[str] = []
    for name in OPTION_BOOKS:
        cfg = _cfg(run, name)
        if cfg.get("enabled"):
            _guarded(run, name, _book_options, run, name, cfg, chains or {}, problems)
    _alert_problems(run, problems)


# ------------------------------------------------------------------------------------------------ plumbing

def _cfg(run: "Run", name: str) -> dict:
    return (run.cfg.constitution.get("shadow") or {}).get(name) or {}


def _book(run: "Run", name: str) -> dict:
    """The book's state, created for states older than Phase B."""
    book = run.state.setdefault("shadow", {}).setdefault(name, {})
    book.setdefault("open_trade", None)
    book.setdefault("trades", [])
    return book


def _log(run: "Run", name: str, event: str, payload: dict) -> None:
    run.log("shadow", {"book": name, "event": event, **payload})


def _guarded(run: "Run", name: str, fn: Callable[..., None], *args: Any) -> None:
    """One book's failure becomes an alert and a ledger record; the other books still run."""
    try:
        fn(*args)
    except Exception as exc:  # noqa: BLE001 - a shadow book (no orders, no emails) must never stop the run
        run.alert("shadow", f"{name} failed: {type(exc).__name__}: {exc}")
        run.log("shadow", {"book": name, "event": "error", "error": f"{type(exc).__name__}: {exc}"})


def _alert_problems(run: "Run", problems: list[str]) -> None:
    if problems:
        run.alert("data", "option shadow books fail closed: " + "; ".join(problems))


def _open_trades(book: dict) -> list[dict]:
    """Open spreads: the held ones, then the newest (`open_trade` when it is open)."""
    ot = book.get("open_trade")
    return list(book.get("held") or []) + ([ot] if ot and ot.get("status") == "open" else [])


def _remove_open(book: dict, trade_id: str) -> None:
    ot = book.get("open_trade")
    if ot and ot.get("trade_id") == trade_id:
        book["open_trade"] = None
    if book.get("held"):
        book["held"] = [t for t in book["held"] if t.get("trade_id") != trade_id]


def _hhmm(asof: Any) -> str | None:
    text = str(asof or "")
    return text[11:16] if len(text) >= 16 else None


def _days_between(start: str, end: str) -> int:
    return (date.fromisoformat(str(end)[:10]) - date.fromisoformat(str(start)[:10])).days


class _Inputs:
    """The daily run's market inputs, each fetched once and only when a book needs it, plus the data problems."""

    def __init__(self, run: "Run", checks: dict | None) -> None:
        self.run = run
        self.checks = checks or {}
        self.problems: list[str] = []
        self._memo: dict[str, Any] = {}

    def _once(self, key: str, fetch: Callable[[], Any]) -> Any:
        if key not in self._memo:
            self._memo[key] = fetch()
        return self._memo[key]

    def bars(self, ticker: str) -> pd.DataFrame | None:
        """Daily bars up to the run date (`run.bars`), or None when the provider has none."""
        def fetch() -> pd.DataFrame | None:
            try:
                return self.run.bars(ticker)
            except Exception:  # noqa: BLE001 - missing data fails closed in the rules
                return None
        return self._once(f"bars:{ticker}", fetch)

    def vix3m(self) -> pd.Series | None:
        """CBOE's VIX3M closes up to the run date (provider.vix("VIX3M")). When CBOE has no close for the run date
        yet (its file can lag by a session in the evening), Yahoo's ^VIX3M close stands in, as `_vix_close` does for
        VIX in the pipeline."""
        return self._once("vix3m", self._fetch_vix3m)

    def _fetch_vix3m(self) -> pd.Series | None:
        ts = pd.Timestamp(self.run.date)
        try:
            series = self.run.provider.vix("VIX3M")
            series = series[series.index <= ts]
        except Exception:  # noqa: BLE001 - fall back to Yahoo below
            series = None
        if value_on(series, ts) is None:
            yahoo = self.bars("^VIX3M")
            close = value_on(yahoo["close"], ts) if yahoo is not None and "close" in yahoo else None
            if close is not None:
                base = series if series is not None else pd.Series(dtype=float)
                series = pd.concat([base, pd.Series([close], index=[ts])])
                series = series[~series.index.duplicated(keep="last")].sort_index()
        return series

    def btc(self) -> pd.Series | None:
        """BTC-USD closes per UTC day up to the run date. The UTC day of the run date ends at 20:00 ET (19:00 in
        winter), before the 22:17 ET run, so its close is final."""
        def fetch() -> pd.Series | None:
            try:
                series = self.run.provider.btc_daily_utc()
                return series[series.index <= pd.Timestamp(self.run.date)]
            except Exception:  # noqa: BLE001
                return None
        return self._once("btc", fetch)

    def verified(self, ticker: str) -> dict:
        """The two-source check of `ticker`'s close on the run date (design §10: M7 uses two-source S&P closes)."""
        tol = float(self.run.cfg.data["two_source_tolerance"])
        return self._once(f"verify:{ticker}", lambda: verify_close(
            self.run.provider, self.bars(ticker), ticker, self.run.date, tol))


# ------------------------------------------------------------------------------- spreads: the daily run

def _book_daily(run: "Run", name: str, cfg: dict, inputs: _Inputs) -> None:
    book = _book(run, name)
    _settle_expired(run, name, cfg, book, inputs)
    ot = book.get("open_trade")
    if ot and ot.get("status") == "pending_entry" and str(ot.get("signal_date")) < run.date:
        _drop_pending(run, name, book, "expired", "no 10:17 ET options job took it")
    if not _may_signal(book, cfg):
        return
    entry_day = iso(next_trading_day(run.date))
    sig = _SIGNALS[str(cfg["signal"])](run, cfg, book, inputs, entry_day)
    if not sig.pop("due", False):
        return
    record = {"signal_date": run.date, **{k: v for k, v in sig.items() if k not in ("pass", "data_ok")}}
    if not sig.get("data_ok"):
        _log(run, name, "blocked", record)
        inputs.problems.append(f"{name}: " + "; ".join(sig.get("reasons") or ["data missing"]))
        return
    if not sig.get("pass"):
        _log(run, name, "filters_failed", record)
        return
    ot = book.get("open_trade")
    if ot and ot.get("status") == "open":         # a spread held to expiry stays open next to the new one
        book.setdefault("held", []).append(ot)
    pending = {"trade_id": f"S-{run.date}-{name}", "status": "pending_entry", "signal_date": run.date,
               "entry_due": entry_day, "target_expiry": sig.get("target_expiry"),
               **{k: sig[k] for k in ("filters", "trigger") if k in sig}}
    book["open_trade"] = pending
    book["last_signal"] = run.date
    _log(run, name, "signal", pending)


def _may_signal(book: dict, cfg: dict) -> bool:
    ot = book.get("open_trade")
    if ot and ot.get("status") != "open":
        return False                               # an entry is pending
    return len(_open_trades(book)) < int(cfg.get("max_open", 1))


def _open_cycle(cfg: dict, book: dict, entry_day: str) -> str | None:
    """The monthly expiry an entry at `entry_day` would trade, unless the book already traded that cycle."""
    target = rules.cycle_expiry(entry_day, cfg["entry_window_dte"])
    if target is None or target <= str(book.get("last_cycle") or ""):
        return None
    return target


def _signal_o1(run: "Run", cfg: dict, book: dict, inputs: _Inputs, entry_day: str) -> dict:
    """O1 / O1-h: the S&P 500 above its 200-day average, VIX < 30 and VIX/VIX3M < 1.0, on two-source closes."""
    target = _open_cycle(cfg, book, entry_day)
    if target is None:
        return {"due": False}
    ts = pd.Timestamp(run.date)
    res = rules.o1_filters(inputs.bars(cfg["index"]), inputs.checks.get("vix"), value_on(inputs.vix3m(), ts),
                           run.date, cfg["filters"])
    out = {"due": True, "target_expiry": target, "data_ok": res["data_ok"], "pass": res["pass"],
           "reasons": res["reasons"], "filters": res}
    if res["pass"]:
        unconfirmed = []
        if not inputs.checks.get("vix_ok"):
            unconfirmed.append("the VIX close is not confirmed by a second source")
        chk = inputs.verified(str(cfg["index"]))
        if not chk.get("ok"):
            unconfirmed.append(f"{cfg['index']} two-source check failed ({chk.get('reason')})")
        if unconfirmed:
            out.update(data_ok=False, reasons=unconfirmed)
    return out


def _signal_fade(run: "Run", cfg: dict, book: dict, inputs: _Inputs, entry_day: str) -> dict:
    """I1: a fading VIX spike; no trend, VIX or term-structure filter (track 14 §7.2, §7.5.9)."""
    res = rules.vix_fade_signal(inputs.checks.get("vix_series"), run.date, book.get("last_signal"), cfg["trigger"])
    if res["data_ok"] and not res["signal"]:
        return {"due": False}
    out = {"due": True, "target_expiry": None, "data_ok": res["data_ok"], "pass": res["signal"],
           "reasons": res["reasons"], "trigger": res}
    if res["signal"] and not inputs.checks.get("vix_ok"):
        out.update(data_ok=False, reasons=["the VIX close is not confirmed by a second source"])
    return out


def _signal_btc(run: "Run", cfg: dict, book: dict, inputs: _Inputs, entry_day: str) -> dict:
    """I2: BTC-USD above its 200-day average (the implied-volatility term structure is checked at 10:17 ET)."""
    target = _open_cycle(cfg, book, entry_day)
    if target is None:
        return {"due": False}
    res = rules.btc_trend(inputs.btc(), run.date, int(cfg["filters"]["btc_sma_days"]))
    return {"due": True, "target_expiry": target, "data_ok": res["data_ok"], "pass": res["pass"],
            "reasons": res["reasons"], "filters": res}


_SIGNALS: dict[str, Callable[..., dict]] = {"o1_filters": _signal_o1, "vix_fade": _signal_fade,
                                             "btc_trend": _signal_btc}


def _drop_pending(run: "Run", name: str, book: dict, event: str, reason: str) -> None:
    ot = book.get("open_trade") or {}
    book["open_trade"] = None
    _log(run, name, event, {"trade_id": ot.get("trade_id"), "signal_date": ot.get("signal_date"), "reason": reason})
    run.note(f"{name}: the shadow entry signalled {ot.get('signal_date')} was dropped ({reason})")


def _settle_expired(run: "Run", name: str, cfg: dict, book: dict, inputs: _Inputs) -> None:
    """Spreads at or past expiry settle at intrinsic value from the official close on the expiry date (XSP: the
    S&P 500 close / 10). Books held to expiry close here by rule ("expiry"); for the managed books it is the
    safety net ("expiry_settlement", with an alert), as for the modules' spreads (contract §3)."""
    for trade in _open_trades(book):
        expiry = str(trade["expiry"])
        if expiry > run.date:
            continue
        bars = inputs.bars(str(cfg["index"]))
        close = value_on(bars["close"], pd.Timestamp(expiry)) if bars is not None else None
        if close is None:
            inputs.problems.append(f"{name}: no {cfg['index']} close on {expiry} to settle {trade['trade_id']}")
            continue
        spot = close * float(cfg.get("settle_scale", 1.0))
        by_rule = bool(cfg.get("hold_to_expiry"))
        _close_trade(run, name, book, trade, rules.spread_intrinsic(trade["legs"], spot), expiry,
                     "expiry" if by_rule else "expiry_settlement", {"settle_close": close, "settle_price": spot})
        if not by_rule:
            run.alert("shadow", f"{name} {trade['trade_id']} was still open at expiry: settled at intrinsic value")


def _close_trade(run: "Run", name: str, book: dict, trade: dict, cost: float, exit_date: str, reason: str,
                 extra: dict | None = None) -> None:
    res = rules.result_on_max_loss(float(trade["credit"]), float(trade["width"]), float(cost))
    closed = {k: v for k, v in trade.items() if k != "mark"}
    closed.update(status="closed", exit_date=exit_date, exit_reason=reason, exit_price=float(cost),
                  pnl=res["pnl"], pnl_usd=res["pnl"] * rules.MULTIPLIER, return_basis="max_loss",
                  days_held=_days_between(str(trade["fill_date"]), exit_date), **(extra or {}))
    closed["return"] = res["return"]
    book["trades"].append(closed)
    _remove_open(book, str(trade["trade_id"]))
    _log(run, name, "exit", closed)


# ------------------------------------------------------------------------------ spreads: the 10:17 ET job

def _book_options(run: "Run", name: str, cfg: dict, chains: dict[str, Any], problems: list[str]) -> None:
    book = _book(run, name)
    chain, why = _usable_chain(run, chains.get(str(cfg["root"])))
    concession = float(run.cfg.fills["options"]["concession"])
    for trade in _open_trades(book):
        _manage(run, name, cfg, book, trade, chain, why, concession)
    ot = book.get("open_trade")
    if ot and ot.get("status") == "pending_entry":
        _enter(run, name, cfg, book, ot, chain, why, concession, problems)


def _usable_chain(run: "Run", chain: "OptionChain | None") -> tuple["OptionChain | None", str | None]:
    if chain is None:
        return None, "no option chain in the snapshot"
    if str(chain.asof)[:10] != run.date:
        return None, f"the option chain is stale (quotes of {chain.asof})"
    return chain, None


def _manage(run: "Run", name: str, cfg: dict, book: dict, trade: dict, chain: "OptionChain | None",
            why: str | None, concession: float) -> None:
    """Mark an open spread at the snapshot; close it on the take-profit or the 21-DTE rule (managed books only)."""
    if str(trade["expiry"]) < run.date:
        return                                     # past expiry: tonight's daily run settles it
    quote = rules.credit_quote(chain, trade["legs"]) if chain is not None else None
    if quote is None:
        _log(run, name, "no_quote", {"trade_id": trade["trade_id"],
                                     "reason": why or "a leg has no two-sided quote"})
        return
    credit, cost = float(trade["credit"]), rules.buy_to_close_price(quote, concession)
    res = rules.result_on_max_loss(credit, float(trade["width"]), cost)
    mark = {"date": run.date, "time": _hhmm(chain.asof), "value": quote["value"],
            "natural_width": quote["natural_width"], "cost_to_close": cost, "return": res["return"]}
    trade["mark"] = mark
    trade["min_return"] = min(float(trade.get("min_return", res["return"])), res["return"])
    _log(run, name, "mark", {"trade_id": trade["trade_id"], **mark})
    if cfg.get("hold_to_expiry"):
        return
    reason = rules.managed_exit(credit, cost, rules.days_to_expiry(str(trade["expiry"]), run.date), cfg)
    if reason:
        _close_trade(run, name, book, trade, cost, run.date, reason,
                     {"exit_time": mark["time"], "exit_quote": quote["legs"], "exit_value": quote["value"],
                      "exit_natural_width": quote["natural_width"]})


def _enter(run: "Run", name: str, cfg: dict, book: dict, ot: dict, chain: "OptionChain | None", why: str | None,
           concession: float, problems: list[str]) -> None:
    """Open the spread signalled at the previous close: expiry, strikes and fill all come from this snapshot."""
    signal_date = str(ot["signal_date"])
    if signal_date >= run.date:
        return                                     # signalled tonight or later: the next job's entry
    if signal_date < iso(prev_trading_day(run.date)):
        _drop_pending(run, name, book, "expired", "stale: signalled before the previous session")
        return

    def skip(reason: str, detail: dict | None = None) -> None:
        book["open_trade"] = None
        _log(run, name, "skip", {"trade_id": ot["trade_id"], "signal_date": signal_date, "reason": reason,
                                 **(detail or {})})

    if chain is None:
        return skip(str(why))
    lo, hi = cfg["expiry_dte"]
    expiry = rules.pick_expiry(chain.expiries(), run.date, target=ot.get("target_expiry"),
                               target_dte=int(cfg["target_dte"]), dte_range=cfg["expiry_dte"])
    if expiry is None:
        return skip(f"no listed expiry {lo}-{hi} days out")
    detail: dict[str, Any] = {"expiry": expiry}
    flt = cfg.get("filters") or {}
    if flt.get("iv_ratio_below") is not None:      # I2: "DVOL not in backwardation", read from the chain
        term = rules.iv_term_ratio(chain, run.date, int(flt["iv_near_dte"]), int(flt["iv_far_dte"]))
        detail["term_structure"] = term
        if not term["data_ok"]:
            book["open_trade"] = None
            _log(run, name, "blocked", {"trade_id": ot["trade_id"], "signal_date": signal_date,
                                        "reasons": term["reasons"], **detail})
            problems.append(f"{name}: " + "; ".join(term["reasons"]))
            return
        if term["ratio"] >= float(flt["iv_ratio_below"]):
            return skip(f"implied-volatility term structure in backwardation ({term['ratio']:.3f})", detail)
    sel = rules.pick_put_spread(chain, expiry, run.date, cfg, rate=float(run.get_tbill()))
    detail["selection"] = sel
    if not sel["ok"]:
        return skip("; ".join(sel["reasons"]), detail)
    quote = rules.credit_quote(chain, sel["legs"])
    if quote is None:
        return skip("a leg has no two-sided quote", detail)
    credit = rules.sell_to_open_price(quote, concession)
    liq = rules.credit_liquidity(chain, quote, sel["legs"], cfg.get("liquidity") or {})
    width = float(sel["width"])
    detail.update(quote=quote["legs"], mid_credit=quote["value"], natural_width=quote["natural_width"],
                  credit=credit, liquidity=liq)
    if credit <= 0:
        return skip("no credit left after the fill model's concession", detail)
    if not liq["ok"]:
        return skip("liquidity: " + "; ".join(liq["reasons"]), detail)
    if width - credit <= 0:
        return skip("the credit is not below the width", detail)
    first = rules.result_on_max_loss(credit, width, rules.buy_to_close_price(quote, concession))
    trade = dict(ot)
    trade.update(status="open", fill_date=run.date, fill_time=_hhmm(chain.asof), expiry=expiry,
                 dte=rules.days_to_expiry(expiry, run.date), legs=sel["legs"], contracts=1,
                 short_strike=sel["short_strike"], long_strike=sel["long_strike"], short_delta=sel["short_delta"],
                 short_iv=sel["short_iv"], delta_source=sel["delta_source"], spot=float(chain.spot),
                 credit=credit, entry_price=credit, mid_credit=quote["value"], natural_width=quote["natural_width"],
                 slippage=quote["value"] - credit, width=width, width_pct=sel["width_pct"], max_loss=width - credit,
                 max_loss_usd=(width - credit) * rules.MULTIPLIER, credit_over_max_loss=credit / (width - credit),
                 quote=quote["legs"], liquidity=liq, planned_exit=_planned_exit(cfg, expiry),
                 min_return=first["return"], chain_source=chain.source, chain_asof=chain.asof)
    if "term_structure" in detail:
        trade["term_structure"] = detail["term_structure"]
    if cfg.get("size"):
        trade.update(_size_at_nav(run, cfg["size"], width - credit))
    book["open_trade"] = trade
    if ot.get("target_expiry"):
        book["last_cycle"] = ot["target_expiry"]
    _log(run, name, "entry", trade)


def _planned_exit(cfg: dict, expiry: str) -> str:
    """The expiry for books held to expiry; else the first session with <= `exit_dte` days to expiry."""
    if cfg.get("hold_to_expiry") or cfg.get("exit_dte") is None:
        return expiry
    day = date.fromisoformat(expiry) - timedelta(days=int(cfg["exit_dte"]))
    return iso(day) if is_trading_day(day) else iso(next_trading_day(day))


def _size_at_nav(run: "Run", cfg_size: dict, max_loss: float) -> dict:
    """What M7's rule would trade at today's paper NAV: 2% of NAV at max loss, in whole contracts (design §3 M7).
    At $100k this is 0, which is why M7 is a shadow book until the NAV reaches `nav_for_one_contract`."""
    pct = float(cfg_size["max_loss_pct_nav"])
    nav = float(run.current_nav())
    per_contract = max_loss * rules.MULTIPLIER
    return {"nav": nav, "contracts_at_nav": int(math.floor(pct * nav / per_contract + 1e-9)),
            "nav_for_one_contract": per_contract / pct}


# ------------------------------------------------------------------------------------------ ST-2 (ETF)

def _st2_daily(run: "Run", name: str, cfg: dict, inputs: _Inputs) -> None:
    """ST-2 (track 13 §11.3): signal at the close, SPY bought at the next open, sold at the close of session 20
    (research/code/13-short-index `run_rule(mode="open", hold=20)`), with fill model v1.0's ETF slippage."""
    book = _book(run, name)
    ticker = str(cfg["ticker"])
    spy = inputs.bars(ticker)
    if spy is None or spy.empty:
        inputs.problems.append(f"{name}: no {ticker} bars")
        return
    slip = run.cfg.slippage_bps(ticker) / 1e4
    ot = book.get("open_trade")
    if ot and ot.get("status") == "pending_entry":
        after = spy.index[spy.index > pd.Timestamp(ot["signal_date"])]
        if len(after):
            day = after[0]
            px = value_on(spy["open"], day)
            if px is None or px <= 0:
                book["open_trade"] = None
                _log(run, name, "no_fill", {"trade_id": ot["trade_id"], "reason": f"no {ticker} open on {iso(day)}"})
                inputs.problems.append(f"{name}: no {ticker} open on {iso(day)} for the entry")
            else:
                ot.update(status="open", fill_date=iso(day), entry_price=px * (1 + slip),
                          tbill_rate=float(run.get_tbill()))
                _log(run, name, "entry", ot)
    ot = book.get("open_trade")
    if ot and ot.get("status") == "open":
        hold = int(cfg["hold_sessions"])
        last = rules.nth_session(spy.index, str(ot["fill_date"]), hold)
        px = value_on(spy["close"], last) if last is not None else None
        if last is not None and px is None:
            inputs.problems.append(f"{name}: no {ticker} close on {iso(last)} for the exit")
        if px is not None:
            exit_px = px * (1 - slip)
            ret = exit_px / float(ot["entry_price"]) - 1.0
            trade = {**ot, "status": "closed", "exit_date": iso(last), "exit_price": exit_px,
                     "exit_reason": "time_stop", "sessions": hold, "return": ret, "return_basis": "notional",
                     "excess_return": ret - float(ot.get("tbill_rate") or 0.0) * hold / 252.0}
            book["trades"].append(trade)
            book["open_trade"] = None
            _log(run, name, "exit", trade)
    if book.get("open_trade") is not None:
        return
    res = rules.st2_signal(spy, inputs.checks.get("vix_series"), inputs.vix3m(), run.date, cfg)
    if res["data_ok"] and res["signal"]:
        unconfirmed = [f"the {what} close is not confirmed by a second source"
                       for what, key in (("SPY", "spy_ok"), ("VIX", "vix_ok")) if not inputs.checks.get(key)]
        if unconfirmed:
            res.update(data_ok=False, reasons=unconfirmed)
    if not res["data_ok"]:
        _log(run, name, "blocked", {"signal_date": run.date,
                                    **{k: v for k, v in res.items() if k not in ("signal", "data_ok")}})
        inputs.problems.append(f"{name}: " + "; ".join(res["reasons"]))
        return
    if not res["signal"]:
        return
    book["open_trade"] = {"trade_id": f"S-{run.date}-{name}", "status": "pending_entry", "signal_date": run.date,
                          "ratio": res["ratio"], "close": res["close"], "sma": res["sma"],
                          "reasons": res["reasons"]}
    book["last_signal"] = run.date
    _log(run, name, "signal", book["open_trade"])
