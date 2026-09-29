"""Pre-registered, mechanically resolvable forecasts for each recommendation, and their Brier scores (design §8).

The probabilities are the frozen `forecasts` constants of each module in constitution.yaml. Besides the
contract keys, every forecast carries:

- "event": what resolves it ("profit", "time_stop" or "leg_up_next_month");
- "ticker": the instrument;
- "created_date": the recommendation's date (the start of a date forecast's window).

`resolve_trade_forecasts` resolves the "on_exit" forecasts from a closed trade. The "date" forecasts (M2 legs)
are resolved by the caller when due: outcome = 1 if the leg's total return from `created_date` to `due` is
above 0, then `resolve_forecast(forecast, outcome)`.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from traderec.config import Config
from traderec.types import Recommendation

M2_HORIZON_DAYS = 31  # "next month": due = created_date + 31 calendar days

# Phase B modules register their builders here at import: EXTRA_SPECS[(module, kind)] = builder(rec, cfg) -> specs
# (docs/PHASE_B_CONTRACTS.md §9). A builder returns `_spec(...)` dicts; "on_exit" forecasts resolve from the
# trade result's "profit" / "exit_reason" (extend `_exit_outcome` for a new event).
EXTRA_SPECS: dict[tuple[str, str], Any] = {}


def make_forecasts(rec: Recommendation, cfg: Config) -> list[dict]:
    """1-3 pre-registered forecasts for `rec`; an empty list for kinds that register none.

    M1 NEW_TRADE: profit on exit, and exit on the time stop. M2 REBALANCE: one per leg with a target above
    $0 in `rec.facts["targets"]`, resolved by date. M3 SWITCH_ON and W10 NEW_TRADE: profit on exit.
    forecast_id = F-<trade_id>-<n>.
    """
    builders = {("M1", "NEW_TRADE"): _m1_specs, ("M2", "REBALANCE"): _m2_specs, ("M3", "SWITCH_ON"): _m3_specs,
                ("W10", "NEW_TRADE"): _w10_specs, **EXTRA_SPECS}
    builder = builders.get((rec.module, rec.kind))
    if builder is None:
        return []
    return [
        {"forecast_id": f"F-{rec.trade_id}-{n}", "trade_id": rec.trade_id, "module": rec.module,
         **spec, "created_date": rec.created_date}
        for n, spec in enumerate(builder(rec, cfg), start=1)
    ]


def resolve_forecast(forecast: dict, outcome: int) -> dict:
    """A copy of `forecast` with "outcome" (0/1) and its "brier" score."""
    return {**forecast, "outcome": int(outcome), "brier": brier(forecast["p"], outcome)}


def resolve_trade_forecasts(forecasts: list[dict], trade_result: dict) -> list[dict]:
    """Resolve the "on_exit" forecasts of a closed trade; "date" forecasts are skipped (not returned).

    `trade_result`: {"profit": bool, "exit_reason": str} ("exit_reason" is needed only for a time-stop
    forecast). Returns copies with "outcome" (0/1) and "brier" added; the inputs are not modified.
    """
    return [
        resolve_forecast(f, _exit_outcome(f, trade_result))
        for f in forecasts if f.get("resolves") == "on_exit"
    ]


def brier(p: float, outcome: int) -> float:
    """Brier score (p - outcome)^2 for a probability p in [0, 1] and an outcome of 0 or 1."""
    if outcome not in (0, 1):
        raise ValueError(f"outcome must be 0 or 1, not {outcome!r}")
    if not 0.0 <= float(p) <= 1.0:  # NaN fails too
        raise ValueError(f"p must be a probability in [0, 1], not {p!r}")
    return (float(p) - int(outcome)) ** 2


def summarize(resolved: list[dict]) -> dict:
    """Calibration summary: {"n", "hits", "mean_p", "hit_rate", "mean_brier", "n_unresolved", "by_module"}.

    Entries without an "outcome" are counted in "n_unresolved" and otherwise ignored. "by_module" holds the
    same statistics (without "n_unresolved") per module; means are None when there is nothing to average.
    """
    done = [f for f in resolved if f.get("outcome") is not None]
    by_module = {m: _stats([f for f in done if f["module"] == m]) for m in sorted({f["module"] for f in done})}
    return {**_stats(done), "n_unresolved": len(resolved) - len(done), "by_module": by_module}


# ---------------------------------------------------------------------- internals


def _spec(event: str, ticker: str, question: str, p: float, resolves: str = "on_exit",
          due: str | None = None) -> dict[str, Any]:
    return {"question": question, "p": float(p), "resolves": resolves, "due": due, "event": event, "ticker": ticker}


def _order_ticker(rec: Recommendation, default: str) -> str:
    """The ticker of the recommendation's first order, else the module's configured ticker."""
    return rec.orders[0].ticker if rec.orders else default


def _m1_specs(rec: Recommendation, cfg: Config) -> list[dict]:
    m1 = cfg.module("M1")
    p, ticker = m1["forecasts"], _order_ticker(rec, m1["ticker"])
    time_stop = (f"Trade exits on the {m1['max_sessions']}-session time stop rather than the "
                 f"{m1['exit_sma']}-day-average rule")
    return [
        _spec("profit", ticker, "Trade closes with a profit (exit price above entry price)", p["p_profit"]),
        _spec("time_stop", ticker, time_stop, p["p_time_stop"]),
    ]


def _m2_specs(rec: Recommendation, cfg: Config) -> list[dict]:
    p = cfg.module("M2")["forecasts"]["p_leg_up_next_month"]
    due = (pd.Timestamp(rec.created_date) + pd.Timedelta(days=M2_HORIZON_DAYS)).strftime("%Y-%m-%d")
    targets = rec.facts.get("targets") or {}
    return [
        _spec("leg_up_next_month", ticker, f"{ticker} total return over the next month is above 0", p,
              resolves="date", due=due)
        for ticker, dollars in targets.items()
        if _is_positive(dollars)
    ]


def _m3_specs(rec: Recommendation, cfg: Config) -> list[dict]:
    m3 = cfg.module("M3")
    return [_spec("profit", _order_ticker(rec, m3["ticker"]), "The Bitcoin position closes with a profit",
                  m3["forecasts"]["p_profit"])]


def _w10_specs(rec: Recommendation, cfg: Config) -> list[dict]:
    w10 = cfg.module("W10")
    return [_spec("profit", _order_ticker(rec, w10["ticker"]),
                  f"Trade closes with a profit at its {w10['max_calendar_days']}-day exit", w10["forecasts"]["p_profit"])]


def _is_positive(x: Any) -> bool:
    """True if `x` converts to a number above zero (None, NaN and non-numbers are not)."""
    try:
        return float(x) > 0
    except (TypeError, ValueError):
        return False


def _exit_outcome(forecast: dict, trade_result: dict) -> int:
    """1 if the closed trade makes the forecast's event true, else 0."""
    event = forecast.get("event")
    if event == "profit":
        return int(bool(trade_result["profit"]))
    if event == "time_stop":
        return int(trade_result["exit_reason"] == "time_stop")
    raise ValueError(f"forecast {forecast.get('forecast_id')}: event {event!r} does not resolve on a trade exit")


def _stats(items: list[dict]) -> dict[str, Any]:
    n = len(items)
    if n == 0:
        return {"n": 0, "hits": 0, "mean_p": None, "hit_rate": None, "mean_brier": None}
    hits = sum(int(f["outcome"]) for f in items)
    return {
        "n": n,
        "hits": hits,
        "mean_p": sum(float(f["p"]) for f in items) / n,
        "hit_rate": hits / n,
        "mean_brier": sum(brier(f["p"], int(f["outcome"])) for f in items) / n,
    }
