"""Structured facts for the emails and the monthly report.

Every number an email shows comes from here (or from the orders), never from free text, so the validator
can check each one. The builders read the run's state and data; they do not change anything.
"""
from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING, Any

import pandas as pd

from . import feedback
from . import forecasts as fc
from . import risk
from .market_calendar import is_trading_day, next_trading_day, today_et
from .types import OrderIntent

if TYPE_CHECKING:  # pragma: no cover
    from .pipeline import Run


# ----------------------------------------------------------------------------------------------------
# portfolio after the orders
# ----------------------------------------------------------------------------------------------------

def holdings(run: "Run") -> dict[tuple[str, str], float]:
    """Market value per (account, ticker) at the latest close, all modules combined.

    Open option spreads are one row per (account, root), valued at their last mark (docs/PHASE_B_CONTRACTS.md §4).
    """
    out: dict[tuple[str, str], float] = {}
    for p in run.broker.positions():
        px = run.last_close(p["ticker"])
        value = p["qty"] * px if px else float(p["cost"])
        out[(p["account"], p["ticker"])] = out.get((p["account"], p["ticker"]), 0.0) + value
    for sp in _spreads(run):
        key = (sp["account"], _spread_name(sp["root"]))
        out[key] = out.get(key, 0.0) + _spread_value(run, sp)
    return out


def _spreads(run: "Run") -> list[dict[str, Any]]:
    spreads = getattr(run.broker, "spreads", None)
    return list(spreads()) if callable(spreads) else []


def _spread_name(root: str) -> str:
    return f"{root} option spreads"


def _multiplier(run: "Run") -> float:
    return float((run.cfg.fills.get("options") or {}).get("multiplier", 100))


def _spread_value(run: "Run", sp: dict[str, Any]) -> float:
    """A spread at its last mark (combo mid x contracts x multiplier), else at its entry price, else its cost."""
    per_share = sp.get("mark") if sp.get("mark") is not None else sp.get("entry_price")
    if per_share is None:
        return float(sp.get("cost") or 0.0)
    return float(per_share) * int(sp.get("contracts") or 0) * _multiplier(run)


def portfolio_after(run: "Run", orders: list[OrderIntent]) -> list[dict[str, Any]]:
    """[{"name", "value", "pct"}] after the orders fill at today's close prices (cash last).

    Pending orders from earlier emails are included, so the table shows where the book is heading.
    """
    vals = holdings(run)
    cash = {a: run.broker.cash(a) for a in run._accounts()}
    queue = list(run.broker.pending()) + list(orders)
    for o in [o for o in queue if o.side == "sell"] + [o for o in queue if o.side == "buy"]:   # as the broker fills
        if o.order_type == "spread_limit":
            _spread_after(run, o, vals, cash)
            continue
        key = (o.account, o.ticker)
        cur = vals.get(key, 0.0)
        if o.side == "buy":
            amt = min(float(o.dollars or 0.0), max(cash.get(o.account, 0.0), 0.0))
            vals[key] = cur + amt
            cash[o.account] = cash.get(o.account, 0.0) - amt
        else:
            module_value = _module_value(run, o)
            amt = module_value if o.close_all else min(float(o.dollars or 0.0), module_value)
            vals[key] = max(cur - amt, 0.0)
            cash[o.account] = cash.get(o.account, 0.0) + amt
    total = sum(vals.values()) + sum(cash.values())
    rows = []
    for (acct, ticker), value in sorted(vals.items(), key=lambda kv: -kv[1]):
        if value > 0.005:
            rows.append({"name": f"{ticker} ({_acct_label(run, acct)})", "value": value,
                         "pct": value / total if total else 0.0})
    for acct, value in cash.items():
        rows.append({"name": f"Cash / T-bills ({_acct_label(run, acct)})", "value": value,
                     "pct": value / total if total else 0.0})
    return rows


def _spread_after(run: "Run", o: OrderIntent, vals: dict[tuple[str, str], float], cash: dict[str, float]) -> None:
    """A spread order in the portfolio-after table: an opening order at its first limit, a close at the mark."""
    key = (o.account, _spread_name(o.ticker))
    cur = vals.get(key, 0.0)
    if o.side == "buy":
        amt = min(float(o.limit_price or 0.0) * int(o.contracts or 0) * _multiplier(run),
                  max(cash.get(o.account, 0.0), 0.0))
        vals[key] = cur + amt
        cash[o.account] = cash.get(o.account, 0.0) - amt
        return
    held = [sp for sp in _spreads(run) if sp.get("trade_id") == o.trade_id and sp.get("account") == o.account]
    amt = sum(_spread_value(run, sp) for sp in held)
    vals[key] = max(cur - amt, 0.0)
    cash[o.account] = cash.get(o.account, 0.0) + amt


def _module_value(run: "Run", o: OrderIntent) -> float:
    pos = run.broker.position(o.account, o.ticker, o.module)
    if not pos:
        return 0.0
    px = run.last_close(o.ticker)
    return pos["qty"] * px if px else float(pos["cost"])


def _acct_label(run: "Run", acct: str) -> str:
    return str(run.cfg.account["accounts"].get(acct, {}).get("name", acct))


# ----------------------------------------------------------------------------------------------------
# monthly report
# ----------------------------------------------------------------------------------------------------

def monthly_report(run: "Run", month: str) -> dict[str, Any]:
    """The monthly review's facts, in `emails.render_monthly`'s keys (design §7 gate, §8 evidence).

    Operations come first in the email; this dict is also written to the ledger as the month's record. Trades and
    shadow books are summarised generically over every module and shadow book in the state (Phase B included);
    the gate status (to-date operations checks, the edge evidence on the wide book, the stage) comes from
    `traderec.reports`.
    """
    from . import reports    # generic summaries and the go-live gate (Phase B reports build)

    st = run.state
    start = pd.Timestamp(month + "-01")
    end = start + pd.offsets.MonthEnd(0)
    today = today_et().isoformat()
    in_month = reports.in_period(start.date(), end.date())

    all_marks = st.get("marks", [])
    marks = [m for m in all_marks if in_month(m["date"])]
    before = [m for m in all_marks if pd.Timestamp(m["date"]) < start]
    initial_nav = float(sum(float(v.get("start_cash", 0) or 0) for v in run.cfg.account["accounts"].values()
                            if v.get("enabled", True) is not False))
    prev_mark = before[-1] if before else None
    last = marks[-1] if marks else prev_mark
    first = all_marks[0] if all_marks else None
    nav = float(last["nav"]) if last else initial_nav
    nav_prev = float(prev_mark["nav"]) if prev_mark else initial_nav

    def spy_ret(a: dict | None, b: dict | None) -> float | None:
        if a and b and a.get("spy_adj") and b.get("spy_adj"):
            return float(b["spy_adj"]) / float(a["spy_adj"]) - 1.0
        return None

    rf = run.get_tbill()
    created = pd.Timestamp(st["created"])
    asof = pd.Timestamp(last["date"]) if last else end
    month_days = (asof - max(start, created)).days + 1 if asof >= start else 0

    # operations: every NYSE session from the later of the month start and launch, up to today (the daily run),
    # plus the 10:17 ET options job's sessions from its first run (Phase B)
    sessions = [d for d in _days(start, end) if is_trading_day(d) and str(st["created"]) <= d <= today]
    daily = {k.split(":", 1)[1]: v for k, v in st.get("runs", {}).items() if k.startswith("daily:")}
    on_time = [d for d in sessions if daily.get(d, {}).get("status") == "ok"]
    opt_expected, opt_on_time = reports.run_punctuality(st, start.date().isoformat(), end.date().isoformat(), today,
                                                        kinds=("options",))
    alerts = [a for a in st.get("alerts", []) if str(a.get("date", ""))[:7] == month]
    counts: dict[str, int] = {}
    for a in alerts:
        counts[a["kind"]] = counts.get(a["kind"], 0) + 1
    emails_sent = sum(1 for k, v in st.get("runs", {}).items() if k.split(":", 1)[1][:7] == month
                      for e in v.get("emails", []) if e.get("kind") not in (None, *reports.REVIEW_KINDS))

    # trades per module and the shadow books: every module and book in the state, whatever its shape
    rows, n_opened, n_closed = reports.module_activity(st, in_month)

    resolved = [f for f in st["forecasts"]["resolved"] if in_month(f.get("resolved_date"))]
    fsum = fc.summarize(resolved)

    shadow = reports.shadow_activity(st, run.cfg, in_month)

    ok_ledger, why = run.ledger.verify()
    fetch = reports.memo_fetch(run.services.fetch_comments)
    issues = [i for i in st.get("issues", []) if in_month(i.get("date"))]
    fb = feedback.review(issues, st.get("fills", []), fetch=fetch) if issues else {}
    horizon = min(end, pd.Timestamp(today))
    all_sessions = [d for d in _days(created, horizon) if is_trading_day(d)]
    all_on_time = [d for d in all_sessions if daily.get(d, {}).get("status") == "ok"]
    opt_all_expected, opt_all_on_time = reports.run_punctuality(st, created.date().isoformat(),
                                                                horizon.date().isoformat(), today, kinds=("options",))
    all_expected = len(all_sessions) + opt_all_expected
    vf_to_date = sum(1 for a in st.get("alerts", []) if a["kind"] == "validator")
    months_elapsed = (asof.year - created.year) * 12 + (asof.month - created.month) + (asof.day >= created.day) - 1
    # the go-live gate to date and the evidence meter (design §7; track 18 §6.3); a failure here must not cost
    # the month's review, so it degrades to a note
    try:
        gate = reports.monthly_gate(run, horizon.date().isoformat(), fetch=fetch, ledger_ok=ok_ledger)
    except Exception as exc:  # noqa: BLE001
        gate = {"review_notes": [f"gate status unavailable: {type(exc).__name__}: {exc}"]}
    return {
        **gate,                      # first, so this report's own figures below win on any shared key
        "review": "monthly",
        "month": month, "asof": last["date"] if last else None,
        "nav": nav, "nav_prev": nav_prev, "nav_start": initial_nav,
        "spy_ret_month": spy_ret(prev_mark or first, last), "spy_ret_since_start": spy_ret(first, last),
        "tbill_ret_month": rf * max(month_days, 0) / 365.0,
        "tbill_ret_since_start": rf * max((asof - created).days, 0) / 365.0,
        "drawdown": float(last["drawdown"]) if last else 0.0,
        "trades_opened": n_opened, "trades_closed": n_closed, "trades": rows,
        "forecasts_resolved": fsum["n"], "forecasts_open": len(st["forecasts"]["open"]),
        "forecast_mean_brier": fsum["mean_brier"], "forecast_hit_rate": fsum["hit_rate"],
        "forecast_mean_p": fsum["mean_p"],
        "shadow": shadow,
        "runs_expected": len(sessions) + opt_expected, "runs_on_time": len(on_time) + opt_on_time,
        "validator_failures": counts.get("validator", 0), "data_problems": counts.get("data", 0),
        "data_notes": [a["message"] for a in alerts if a["kind"] == "data"][:5],
        "emails_sent": fb.get("measured") if fb.get("handled") is not None else emails_sent,
        "emails_handled": fb.get("handled"),
        "ledger_ok": ok_ledger, "fills_ok": fb.get("fills_ok"),
        "fill_gaps": fb.get("fills", []), "median_fill_gap_bps": fb.get("median_gap_bps"),
        "months_elapsed": max(months_elapsed, 0),
        "trades_to_date": sum(int(v) for v in st["counters"]["trades"].values()),
        "on_time_rate_to_date": (len(all_on_time) + opt_all_on_time) / all_expected if all_expected else None,
        "validator_failures_to_date": vf_to_date,
        "changes": [],
        "failures": [a["message"] for a in alerts if a["kind"] in reports.PROBLEM_ALERTS][:5],
        "ledger_message": why,
    }


def _open_positions(run: "Run") -> list[dict[str, Any]]:
    rows = []
    for (acct, ticker), value in holdings(run).items():
        rows.append({"account": acct, "ticker": ticker, "value": value})
    return rows


def _days(start: pd.Timestamp, end: pd.Timestamp) -> list[str]:
    d = start.date()
    out = []
    while d <= end.date():
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


# ----------------------------------------------------------------------------------------------------
# per-recommendation facts (keys documented in traderec/emails.py; `_pct` keys are percent units)
# ----------------------------------------------------------------------------------------------------

BASE_RATES_SINCE = 2008     # the base rates in constitution.yaml are track 13's out-of-sample 2008-2026 results


def _common(run: "Run", module: str, cfg_mod: dict, account: str) -> dict[str, Any]:
    return {
        "module_name": cfg_mod.get("name", module), "account": account,
        "execute_date": run.order_deadline(), "nav": run.current_nav(),
        "drawdown": run.current_drawdown(), "governor": risk.governor(run.current_drawdown(), run.cfg.risk),
    }


def _stress(dollars: float, unit: float, nav: float) -> dict[str, float]:
    usd = dollars * unit
    return {"stress_loss": unit, "stress_usd": usd, "stress_pct": 100.0 * usd / nav if nav else None}


def _other_qty(run: "Run", account: str, ticker: str, module: str) -> float:
    """Shares of the same ticker in the same account held for other modules (Robinhood shows one position)."""
    return sum(float(p["qty"]) for p in run.broker.positions(account=account)
               if p["ticker"] == ticker and p["module"] != module)


def _sell_facts(run: "Run", account: str, ticker: str, module: str, entry_price: float | None) -> dict[str, Any]:
    pos = run.broker.position(account, ticker, module) or {}
    px = run.last_close(ticker)
    qty = float(pos.get("qty") or 0.0)
    value = qty * px if px else None
    cost = float(pos.get("cost") or 0.0)
    out: dict[str, Any] = {"close": px, "qty": qty, "keep_qty": _other_qty(run, account, ticker, module),
                           "position_value": value}
    if value is not None and cost:
        out["pnl_usd"] = value - cost
        out["pnl_pct"] = 100.0 * (value / cost - 1.0)
    return out


def _time_stop_date(execute_date: str, max_sessions: int) -> str:
    """The open of session max_sessions + 1, counting the fill session as session 1."""
    d = pd.Timestamp(execute_date).date()
    for _ in range(max_sessions):
        d = next_trading_day(d)
    return d.isoformat()


def m1_entry(run: "Run", chk: dict, adm: dict, cfg_m1: dict) -> dict[str, Any]:
    nav = run.current_nav()
    dollars = float(adm["dollars"])
    unit = risk.unit_stress("M1", cfg_m1["ticker"], {cfg_m1["ticker"]: adm.get("stress") or 0.0}, run.cfg)
    common = _common(run, "M1", cfg_m1, cfg_m1["account"])
    return {
        **common, "ticker": cfg_m1["ticker"], "dollars": dollars, **_stress(dollars, unit, nav),
        "close": chk.get("close"), "sma200": chk.get("sma200"), "rsi2": chk.get("rsi2"), "vix": chk.get("vix"),
        "sma_trend": int(cfg_m1["sma_trend"]), "rsi_period": int(cfg_m1["rsi_period"]),
        "rsi_below": float(cfg_m1["rsi_below"]), "vix_min": float(cfg_m1["vix_min"]),
        "exit_sma": int(cfg_m1["exit_sma"]), "max_sessions": int(cfg_m1["max_sessions"]),
        "time_stop_date": _time_stop_date(common["execute_date"], int(cfg_m1["max_sessions"])),
        "base_rates": {**dict(cfg_m1.get("base_rates") or {}), "since": BASE_RATES_SINCE},
        "admit_binding": adm.get("binding"),
    }


def m1_exit(run: "Run", ot: dict, ex: dict, cfg_m1: dict) -> dict[str, Any]:
    return {
        **_common(run, "M1", cfg_m1, cfg_m1["account"]), "ticker": cfg_m1["ticker"],
        **_sell_facts(run, cfg_m1["account"], cfg_m1["ticker"], "M1", ot.get("entry_price")),
        "reason": ex.get("reason"), "sma5": ex.get("sma5"), "sessions_held": ex.get("sessions_held"),
        "exit_sma": int(cfg_m1["exit_sma"]), "max_sessions": int(cfg_m1["max_sessions"]),
        "entry_date": ot.get("fill_date"), "entry_price": ot.get("entry_price"),
        "base_rates": {**dict(cfg_m1.get("base_rates") or {}), "since": BASE_RATES_SINCE},
    }


def w10_entry(run: "Run", sig: dict, adm: dict, cfg_w: dict) -> dict[str, Any]:
    """Facts for a W10 NEW_TRADE email (design v3.3 §3 W10)."""
    from .modules.w10_crashbuy import w10_exit_date
    nav = run.current_nav()
    dollars = float(adm["dollars"])
    unit = risk.unit_stress("W10", cfg_w["ticker"], {cfg_w["ticker"]: adm.get("stress") or 0.0}, run.cfg)
    horizon = float(cfg_w["horizon_stress_loss"])
    common = _common(run, "W10", cfg_w, cfg_w["account"])
    return {
        **common, "ticker": cfg_w["ticker"], "dollars": dollars, "close": run.last_close(cfg_w["ticker"]),
        **_stress(dollars, unit, nav),
        "horizon_stress_usd": dollars * horizon, "horizon_stress_pct": 100.0 * dollars * horizon / nav if nav else None,
        "spx_close": sig.get("close"), "spx_prev_close": sig.get("prev_close"), "spx_ret": sig.get("ret"),
        "sma200_prev": sig.get("sma_prev"), "sma_trend": int(cfg_w["sma_trend"]), "drop_pct": float(cfg_w["drop_pct"]),
        "decluster_sessions": int(cfg_w["decluster_sessions"]), "max_calendar_days": int(cfg_w["max_calendar_days"]),
        "exit_date": w10_exit_date(common["execute_date"], int(cfg_w["max_calendar_days"])),
        "base_rates": dict(cfg_w.get("base_rates") or {}), "admit_binding": adm.get("binding"),
    }


def w10_exit(run: "Run", ot: dict, ex: dict, cfg_w: dict) -> dict[str, Any]:
    """Facts for a W10 EXIT email: the calendar-exact time stop."""
    return {
        **_common(run, "W10", cfg_w, cfg_w["account"]), "ticker": cfg_w["ticker"],
        **_sell_facts(run, cfg_w["account"], cfg_w["ticker"], "W10", ot.get("entry_price")),
        "reason": ex.get("reason") or "calendar_stop", "exit_date": ex.get("exit_date"),
        "sessions_held": ex.get("sessions_held"), "days_held": ex.get("days_held"),
        "max_calendar_days": int(cfg_w["max_calendar_days"]),
        "entry_date": ot.get("fill_date"), "entry_price": ot.get("entry_price"),
        "base_rates": dict(cfg_w.get("base_rates") or {}),
    }


def m2_order_meta(run: "Run", cfg_m2: dict, order: dict) -> dict[str, Any]:
    """Per-order meta for a REBALANCE email: the last close, and shares for a sell-all next to other lots."""
    t = order["ticker"]
    meta: dict[str, Any] = {"ref_price": run.last_close(t)}
    if order.get("close_all"):
        pos = run.broker.position(cfg_m2["account"], t, "M2") or {}
        keep = _other_qty(run, cfg_m2["account"], t, "M2")
        if keep > 0:
            meta.update(qty=float(pos.get("qty") or 0.0), keep_qty=keep)
    return meta


def m2_rebalance(run: "Run", st: dict, cfg_m2: dict, od: dict, sig: dict | None, targets: dict,
                 current: dict, notes: list[str]) -> dict[str, Any]:
    nav = run.current_nav()
    legs = list(cfg_m2["legs"])
    stress = run.stress(tuple(legs))
    sleeve = min(sum(float(targets.get(t, 0.0) or 0.0) * stress.get(t, 0.0) for t in targets),
                 float(cfg_m2["sleeve_stress_pct_nav"]) * nav)
    out: dict[str, Any] = {
        **_common(run, "M2", cfg_m2, cfg_m2["account"]),
        "batch": int(st.get("batch", 1)),
        "targets": {t: float(v) for t, v in targets.items()},
        "current": {t: float(v) for t, v in current.items()},
        "prices": {t: run.last_close(t) for t in legs},
        "rf_annual": run.get_tbill(), "lookback_sessions": int(cfg_m2["lookback_sessions"]),
        "gross_cap_pct_nav": float(cfg_m2["gross_cap_pct_nav"]),
        "single_leg_cap_pct_nav": float(cfg_m2["single_leg_cap_pct_nav"]),
        "band_rel": float(cfg_m2["band_rel"]), "band_abs_usd": float(cfg_m2["band_abs_usd"]),
        "max_orders_per_email": int(cfg_m2["max_orders_per_email"]),
        "deferred": [d["ticker"] if isinstance(d, dict) else d for d in od.get("deferred", [])],
        "skipped_band": [d["ticker"] if isinstance(d, dict) else d for d in od.get("skipped_band", [])],
        "stress_usd": sleeve, "stress_pct": 100.0 * sleeve / nav if nav else None,
        "notes": list(notes),
    }
    if sig is not None:
        out["signals"] = {t: {k: v for k, v in (s or {}).items() if k in ("ret_252", "excess", "sign", "vol")}
                          for t, s in sig.items()}
    return out


def m3_switch(run: "Run", sw: dict, cfg_m3: dict, *, adm: dict | None = None,
              open_trade: dict | None = None) -> dict[str, Any]:
    nav = run.current_nav()
    out: dict[str, Any] = {
        **_common(run, "M3", cfg_m3, cfg_m3["account"]), "ticker": cfg_m3["ticker"],
        "week_end": sw.get("week_end"), "weekly_close": sw.get("weekly_close"), "sma": sw.get("sma"),
        "weeks": int(cfg_m3["weeks"]), "sleeve_pct_nav": float(cfg_m3["sleeve_pct_nav"]),
    }
    if adm is not None:
        dollars = float(adm["dollars"])
        unit = float(adm.get("stress") or run.cfg.risk["crypto_stress"])
        out.update(dollars=dollars, close=run.last_close(cfg_m3["ticker"]), **_stress(dollars, unit, nav))
    if open_trade is not None:
        out.update(_sell_facts(run, cfg_m3["account"], cfg_m3["ticker"], "M3", open_trade.get("entry_price")),
                   entry_date=open_trade.get("fill_date"), entry_price=open_trade.get("entry_price"))
    return out
