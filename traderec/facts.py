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
    """Market value per (account, ticker) at the latest close, all modules combined."""
    out: dict[tuple[str, str], float] = {}
    for p in run.broker.positions():
        px = run.last_close(p["ticker"])
        value = p["qty"] * px if px else float(p["cost"])
        out[(p["account"], p["ticker"])] = out.get((p["account"], p["ticker"]), 0.0) + value
    return out


def portfolio_after(run: "Run", orders: list[OrderIntent]) -> list[dict[str, Any]]:
    """[{"name", "value", "pct"}] after the orders fill at today's close prices (cash last).

    Pending orders from earlier emails are included, so the table shows where the book is heading.
    """
    vals = holdings(run)
    cash = {a: run.broker.cash(a) for a in run._accounts()}
    queue = list(run.broker.pending()) + list(orders)
    for o in [o for o in queue if o.side == "sell"] + [o for o in queue if o.side == "buy"]:   # as the broker fills
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

    Operations come first in the email; this dict is also written to the ledger as the month's record.
    """
    st = run.state
    start = pd.Timestamp(month + "-01")
    end = start + pd.offsets.MonthEnd(0)
    today = today_et().isoformat()

    def in_month(d: Any) -> bool:
        return bool(d) and start <= pd.Timestamp(str(d)[:10]) <= end

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

    # operations: every NYSE session from the later of the month start and launch, up to today
    sessions = [d for d in _days(start, end) if is_trading_day(d) and str(st["created"]) <= d <= today]
    daily = {k.split(":", 1)[1]: v for k, v in st.get("runs", {}).items() if k.startswith("daily:")}
    on_time = [d for d in sessions if daily.get(d, {}).get("status") == "ok"]
    alerts = [a for a in st.get("alerts", []) if str(a.get("date", ""))[:7] == month]
    counts: dict[str, int] = {}
    for a in alerts:
        counts[a["kind"]] = counts.get(a["kind"], 0) + 1
    emails_sent = sum(1 for k, v in st.get("runs", {}).items() if k.split(":", 1)[1][:7] == month
                      for e in v.get("emails", []) if e.get("kind") not in (None, "MONTHLY"))

    # trades per module
    rows, n_opened, n_closed = [], 0, 0
    for mod in ("M1", "M2", "M3", "W10"):
        ms = st["modules"].get(mod)
        if ms is None:
            continue
        hist = ms.get("history", [])
        if mod == "M2":
            opened = sum(1 for h in hist if in_month(h.get("date")))
            closed, pnl = 0, None
        else:
            opened = sum(1 for h in hist if in_month(h.get("entry_date")))
            ot = ms.get("open_trade")
            opened += 1 if (ot and in_month(ot.get("fill_date"))) else 0
            done = [h for h in hist if in_month(h.get("exit_date"))]
            closed = len(done)
            pnl = sum(float(h.get("pnl") or 0.0) for h in done) if done else None
        n_opened += opened
        n_closed += closed
        if opened or closed:
            rows.append({"module": mod, "opened": opened, "closed": closed, "pnl_usd": pnl})

    resolved = [f for f in st["forecasts"]["resolved"] if in_month(f.get("resolved_date"))]
    fsum = fc.summarize(resolved)

    shadow = []
    for name, book in st.get("shadow", {}).items():
        if "events" in book:          # W10's record: every uptrend -3% day, scored at 60 and 90 days
            evs = book["events"]
            scored = [e for e in evs if "90" in (e.get("scores") or {}) and in_month(e["scores"]["90"]["exit_date"])]
            rets = [float(e["scores"]["90"]["return"]) for e in scored]
            shadow.append({"name": f"{name} (90-day score)", "signals": sum(1 for e in evs if in_month(e["signal_date"])),
                           "closed": len(scored), "mean_ret": sum(rets) / len(rets) if rets else None})
            continue
        trades = book.get("trades", [])
        ot = book.get("open_trade")
        signals = sum(1 for t in trades if in_month(t.get("signal_date"))) + (1 if ot and in_month(ot.get("signal_date")) else 0)
        closed = [t for t in trades if in_month(t.get("exit_date"))]
        rets = [float(t["return"]) for t in closed if t.get("return") is not None]
        shadow.append({"name": name, "signals": signals, "closed": len(closed),
                       "mean_ret": sum(rets) / len(rets) if rets else None})

    ok_ledger, why = run.ledger.verify()
    issues = [i for i in st.get("issues", []) if in_month(i.get("date"))]
    fb = feedback.review(issues, st.get("fills", []), fetch=run.services.fetch_comments) if issues else {}
    horizon = min(end, pd.Timestamp(today))
    all_sessions = [d for d in _days(created, horizon) if is_trading_day(d)]
    all_on_time = [d for d in all_sessions if daily.get(d, {}).get("status") == "ok"]
    vf_to_date = sum(1 for a in st.get("alerts", []) if a["kind"] == "validator")
    months_elapsed = (asof.year - created.year) * 12 + (asof.month - created.month) + (asof.day >= created.day) - 1
    return {
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
        "runs_expected": len(sessions), "runs_on_time": len(on_time),
        "validator_failures": counts.get("validator", 0), "data_problems": counts.get("data", 0),
        "data_notes": [a["message"] for a in alerts if a["kind"] == "data"][:5],
        "emails_sent": fb.get("measured") if fb.get("handled") is not None else emails_sent,
        "emails_handled": fb.get("handled"),
        "ledger_ok": ok_ledger, "fills_ok": fb.get("fills_ok"),
        "fill_gaps": fb.get("fills", []), "median_fill_gap_bps": fb.get("median_gap_bps"),
        "months_elapsed": max(months_elapsed, 0),
        "trades_to_date": sum(int(v) for v in st["counters"]["trades"].values()),
        "on_time_rate_to_date": len(all_on_time) / len(all_sessions) if all_sessions else None,
        "validator_failures_to_date": vf_to_date,
        "changes": [],
        "failures": [a["message"] for a in alerts if a["kind"] in ("email", "fill", "drawdown", "budget")][:5],
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
