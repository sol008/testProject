"""Quarterly and annual reviews and the go-live gates (design v3.3 §7, §8; docs/PHASE_B_CONTRACTS.md §11).

The reviews report and recommend; they never change a rule or a size. Go-live and ramp decisions come from the
quarterly review and are the owner's to take. Rule changes are decided with the owner at the annual review, at most
one per parameter per quarter and only after a forward comparison of three months or more (design §8).

Quarterly (after the March, June, September and December monthly reviews):
- costs and slippage: the fill model's cost on every paper fill, and practice-account fills against the model
  (track 18 §6.1: the cost model moves only toward conservatism unless 60 fills support a cut);
- κ̂, realised over claimed edge per module: a normal-normal update with prior N(0.35, 0.15²), clipped to
  [0.1, 0.6] (track 18 §6.2). Sizing keeps κ = 0.5 frozen through the pilot (design §4);
- calibration warnings: the 90% interval of (hit rate − mean stated probability) per forecast family, with a
  design effect for several forecasts per trade (track 18 §5.4 item 5);
- base-rate drift: each rule's resolved win rate and average against its base rate, actionable from 150 signals;
- gated recalibration maps: identity below 150 scored forecasts per family, then a Platt map recommended only when
  a likelihood-ratio test rejects the identity map (p < 0.05) and the map scores better out of sample (track 10
  §4.8);
- go-live and ramp: the operations gate (§7.2); the edge evidence P(edge > 0) under a N(0, 0.1²) prior on the wide
  book of the same rules (§7.3: ST-1b signals for M1, every M3 switch, M2 position-months, plus W10's shadow record
  since v3.3 made W10 a module), advisory until the selected book has 30 trades; the ramp (§7.4).

Annual (with the owner, after December's reviews): the calibration slope, retirements (track 10 §6(e)), the
hurdle and the trade budget, W10's re-decision against its shadow record at 60 and 90 days, and M2's review (20%
sleeve drawdown) and pause (36-month Sharpe below −0.5) triggers (design §3).

The pure functions (`edge_posterior`, `edge_evidence`, `kappa_posterior`, `calibration_in_the_large`,
`calibration_slope`, `miscalibration_lr_test`, `fit_platt`, `recalibration_review`, `base_rate_drift`,
`sleeve_review`) take plain numbers. The collectors read the run's state and ledger and never change them; unknown
shapes (the Phase B books are defined by their own builds) are skipped, never fatal.
"""
from __future__ import annotations

import math
import re
from bisect import bisect_right
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Iterable

import numpy as np
import pandas as pd

from . import emails as email_mod
from . import feedback, validator
from .ledger import RECORD_TYPES, LedgerError
from .market_calendar import is_trading_day, today_et

if TYPE_CHECKING:  # pragma: no cover
    from traderec.config import Config
    from traderec.pipeline import Run, RunResult, Services

Z80 = 1.2815515655446004          # standard normal quantiles for central 80% and 90% intervals
Z90 = 1.6448536269514722
EPS = 1e-4                        # probabilities are clipped to [EPS, 1 - EPS] before taking logits

# Gate and review thresholds (design v3.3 §3, §4, §7, §8; tracks 10 and 18). An optional `reports:` block in
# config/constitution.yaml may override any key; none is required.
GATES: dict[str, float] = {
    "gate_months": 3,                  # §7.2: at least 3 months of paper
    "gate_on_time": 0.95,              # §7.2: at least 95% of runs on time
    "gate_validator_failures": 0,      # §7.2: no validator failures
    "gate_emails_handled": 0.90,       # §7.2: at least 90% of trade emails handled
    "gate_trades": 30,                 # §7.3: the edge evidence is advisory until the selected book has 30 trades
    "edge_prior_sd": 0.10,             # §7.3: N(0, 0.1²) prior on the per-trade Sharpe
    "edge_go_live": 0.70,              # §7.3: P(edge > 0) >= 0.7
    "edge_min_units": 5,               # a wide-book family joins the pooled edge once it has 5 resolved units
    "pilot_size": 0.25,                # §7.2: going live at 25% of the target size
    "half_size": 0.50,                 # §7.4
    "ramp_half_live_months": 6,        # §7.4: 50% after >= 6 months ...
    "ramp_half_live_trades": 30,       # ... and >= 30 live trades ...
    "ramp_half_edge": 0.80,            # ... with P >= 0.8 ...
    "ramp_half_kappa": 0.20,           # ... κ̂ >= 0.2 ...
    "ramp_half_shortfall": 0.20,       # ... and implementation shortfall <= 20% of the paper edge
    "ramp_full_resolved": 100,         # §7.4: 100% after >= 100 resolved trades ...
    "ramp_full_paper_weight": 0.5,     # ... paper at half weight ...
    "ramp_full_edge": 0.90,            # ... with P >= 0.9 and calibration verified
    "calibration_citl": 0.05,          # track 18 §5.5: calibration-in-the-large within ±5 points
    "calibration_gross": 0.20,         # track 18 §5.4 item 5: a gross bias lies wholly beyond ±20 points
    "calibration_min_forecasts": 20,   # warnings need 20 scored forecasts in a family (track 18 looked from 30 trades)
    "calibration_min_slope_forecasts": 30,   # the pooled calibration slope is shown from 30 scored forecasts
    "forecast_icc": 0.40,              # track 18 §6.2: forecasts of one trade are correlated (ICC ≈ 0.4)
    "kappa_prior_mean": 0.35,          # track 18 §6.1: κ̂ prior N(0.35, 0.15²), clipped to [0.1, 0.6]
    "kappa_prior_sd": 0.15,
    "kappa_min": 0.10,
    "kappa_max": 0.60,
    "kappa_sizing": 0.50,              # design §4: κ = 0.5 for rule-based modules, frozen through the pilot
    "kappa_min_trades": 5,             # a module's closed trades update κ̂ from this many
    "map_min_forecasts": 150,          # track 10 §4.8: identity map below 150 scored forecasts per family
    "map_isotonic_forecasts": 1000,    # isotonic maps only from 1000, and only if better out of sample
    "map_alpha": 0.05,                 # the gate: likelihood-ratio p < 0.05
    "drift_min_signals": 150,          # track 18 §6.1: base-rate drift is actionable from 150 resolved signals
    "drift_min_report": 5,             # below this, a family is "too few" to compare
    "cost_tolerance_bps": feedback.FILL_TOLERANCE_BPS,   # practice fills within 10 bp of the model (design §7.2)
    "cost_cut_min_fills": 60,          # track 18 §6.1: a cheaper cost model needs 60 practice fills
    "m2_review_drawdown": 0.20,        # design §3 M2: review at a 20% sleeve drawdown
    "m2_pause_sharpe": -0.5,           # design §3 M2: pause to shadow if the 36-month Sharpe falls below -0.5
    "m2_sharpe_months": 36,
    "retire_min_trades": 20,           # track 10 §6(e): P(edge > 0) < 0.2 after >= 20 trades ...
    "retire_min_months": 12,           # ... and never within the first 12 months
    "retire_edge": 0.20,
    "change_forward_months": 3,        # design §8: a >= 3-month forward comparison per change
    "hurdle_bp": 6,                    # design §4: Δg >= 6 bp per trade (discretionary trades)
    "trades_target_low": 25,           # track 18 §2.6: "few trades" means about 25-50 a year
    "trades_target_high": 50,
    "rules_hold_since": 2008,          # design §8: a change must hold before and after 2008
}

# The wide book of the same rules (design §7.3). W10's shadow record is W10's wide book (v3.3 made W10 a module).
WIDE_BOOK_LABELS = {
    "ST1B": "ST-1b signals (M1's rule without the VIX gate)",
    "M3": "Every M3 Bitcoin switch",
    "M2": "M2 position-months",
    "W10": "W10 record: every uptrend crash day, 90-day score",
}
# The wide-book family that is each module's shadow evidence (retirement test (c), track 10 §6(e)).
SHADOW_EVIDENCE = {"M1": "ST1B", "M2": "M2", "M3": "M3", "W10": "W10"}
SHADOW_LABELS = {
    "ST1B": "ST-1b (M1 without the VIX gate)",
    "W10": "W10 record (every uptrend crash day)",
    "M4_TWIN": "M4 twin (60-day expiry)",
    "O1": "O1 put credit spread (M7)",
    "O1H": "O1 held to expiry",
    "I1": "Put-spread variant I1",
    "I2": "Put-spread variant I2",
    "ST2": "ST-2 (VIX above VIX3M in an uptrend)",
    "ETH": "ETH weekly trend switch",
    "M6": "M6 crypto (depeg buy, cash-and-carry)",
    "EDGAR": "EDGAR screens (insiders, 13D, mergers, tenders)",
    "MACRO": "Macro events (W3, W4, gold fade, releases)",
}
# ST-1b's own base rates (track 13 §8.1: SPY 2008-26, next-open fills, net), the shadow book's drift reference.
SHADOW_BASE_RATES = {"ST1B": {"since": 2008, "trades_per_year": 8.0, "win_rate": 0.73, "mean_pct": 0.43}}
# W10's shadow record: every uptrend -3% day entered at the next open (track 23 §1.2, SPY 1993-2026, all 20 events).
W10_RECORD_REFERENCE = {
    "since": 1993,
    "60": {"win_rate": 0.75, "mean_pct": 3.72, "placebo_mean_pct": 1.78},
    "90": {"win_rate": 0.90, "mean_pct": 7.26, "placebo_mean_pct": 2.67},
}
EVENT_LABELS = {"profit": "closes with a profit", "time_stop": "exits on the time stop",
                "leg_up_next_month": "leg up over the next month"}
ENTRY_KINDS = ("NEW_TRADE", "SWITCH_ON", "REBALANCE")
REVIEW_KINDS = ("MONTHLY", "QUARTERLY", "ANNUAL")
PROBLEM_ALERTS = ("email", "fill", "drawdown", "budget", "positions", "kill_switch", "shadow", "cluster")
RUN_KINDS = ("daily", "options")      # scheduled runs counted for "runs on time" (the options job from its first run)
DATE_KEYS = ("signal_date", "date", "event_date", "detected", "filed", "asof")
RETURN_KEYS = ("return", "ret")
PNL_KEYS = ("pnl", "pnl_usd", "realized_pnl")

_QUARTER = re.compile(r"^(\d{4})-Q([1-4])$")
_YEAR = re.compile(r"^\d{4}$")
_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def gates(cfg: "Config | None" = None) -> dict[str, float]:
    """GATES, updated with the constitution's optional `reports:` block."""
    out = dict(GATES)
    extra = ((cfg.constitution if cfg is not None else {}) or {}).get("reports") or {}
    out.update({k: v for k, v in extra.items() if k in GATES})
    return out


# ----------------------------------------------------------------------------------------------------
# small numeric helpers
# ----------------------------------------------------------------------------------------------------

def norm_cdf(x: float) -> float:
    """Standard normal CDF."""
    return 0.5 * math.erfc(-float(x) / math.sqrt(2.0))


def chi2_sf(x: float, df: int) -> float:
    """Survival function of the chi-square distribution with 1 or 2 degrees of freedom."""
    x = max(0.0, float(x))
    if df == 1:
        return math.erfc(math.sqrt(x / 2.0))
    if df == 2:
        return math.exp(-x / 2.0)
    raise ValueError("chi2_sf supports 1 or 2 degrees of freedom")


def _num(x: Any) -> float | None:
    """A finite float, or None (bools, strings and NaN are not numbers here)."""
    if isinstance(x, bool) or x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _first_num(d: dict, keys: Iterable[str]) -> float | None:
    for k in keys:
        v = _num(d.get(k))
        if v is not None:
            return v
    return None


def _mean(xs: list[float]) -> float | None:
    return sum(xs) / len(xs) if xs else None


def _sd(xs: list[float]) -> float | None:
    if len(xs) < 2:
        return None
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _median(xs: list[float]) -> float | None:
    s = sorted(xs)
    if not s:
        return None
    mid = len(s) // 2
    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2.0


def _day(x: Any) -> str | None:
    """YYYY-MM-DD from a date-like value, or None."""
    if x is None or isinstance(x, bool):
        return None
    s = str(x).strip()[:10]
    try:
        return date.fromisoformat(s).isoformat()
    except ValueError:
        return None


def _days_between(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def _logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=float), EPS, 1.0 - EPS)
    return np.log(p / (1.0 - p))


def _expit(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.asarray(z, dtype=float)))


def _loglik(p: np.ndarray, y: np.ndarray) -> float:
    p = np.clip(p, EPS, 1.0 - EPS)
    return float(np.sum(y * np.log(p) + (1.0 - y) * np.log(1.0 - p)))


# ----------------------------------------------------------------------------------------------------
# pure computations: edge, κ̂, calibration, drift, M2's sleeve
# ----------------------------------------------------------------------------------------------------

def edge_posterior(n: float, sharpe: float | None, *, prior_sd: float = GATES["edge_prior_sd"]) -> float | None:
    """P(s > 0) for a per-unit Sharpe s under a N(0, prior_sd²) prior, given the estimate `sharpe` from n units.

    The estimate is ŝ ~ N(s, 1/n), so the posterior is N(n·ŝ / (n + 1/prior_sd²), 1 / (n + 1/prior_sd²)) and
    P(s > 0) = Φ(n·ŝ / √(n + 1/prior_sd²)) (track 18 §5.4; research/code/18-short-exec/paper_protocol.py).
    """
    if sharpe is None or n <= 0:
        return None
    return norm_cdf(n * float(sharpe) / math.sqrt(n + 1.0 / prior_sd ** 2))


def edge_evidence(families: dict[str, list], *, prior_sd: float = GATES["edge_prior_sd"],
                  min_units: int = int(GATES["edge_min_units"])) -> dict[str, Any]:
    """P(edge > 0) per wide-book family and pooled (design §7.3).

    `families` maps a name to its units: excess returns, or (excess return, weight) pairs (the ramp weighs paper
    units at half). Each family is standardised by its own standard deviation, so every unit counts in Sharpe
    units; the pooled Sharpe is the weighted mean of those z-scores over the usable families (at least `min_units`
    units with some variation). Returns {"families": [...], "units", "weight", "sharpe", "p_positive"}.
    """
    rows, zs = [], []
    for name, units in families.items():
        pairs = [(float(u[0]), float(u[1])) if isinstance(u, (tuple, list)) else (float(u), 1.0) for u in units]
        pairs = [(x, w) for x, w in pairs if math.isfinite(x) and w > 0]
        xs = [x for x, _ in pairs]
        weight = sum(w for _, w in pairs)
        sd = _sd(xs)
        mean_w = sum(x * w for x, w in pairs) / weight if weight else None
        sharpe = mean_w / sd if (mean_w is not None and sd) else None
        usable = len(xs) >= min_units and bool(sd)
        rows.append({"family": name, "units": len(xs), "weight": weight, "mean_excess": _mean(xs), "sd": sd,
                     "sharpe": sharpe, "usable": usable,
                     "p_positive": edge_posterior(weight, sharpe, prior_sd=prior_sd) if usable else None})
        if usable:
            zs += [(x / sd, w) for x, w in pairs]
    weight = sum(w for _, w in zs)
    sharpe = sum(z * w for z, w in zs) / weight if weight else None
    return {"families": rows, "units": sum(r["units"] for r in rows if r["usable"]), "weight": weight,
            "sharpe": sharpe, "p_positive": edge_posterior(weight, sharpe, prior_sd=prior_sd) if weight else None}


def kappa_observation(returns: list[float], claimed_mean: float) -> tuple[float, float] | None:
    """(κ observed, its standard error): the realised mean return over the claimed mean, and sd / (√n · claimed)."""
    xs = [float(x) for x in returns if _num(x) is not None]
    sd = _sd(xs)
    if not sd or not claimed_mean or claimed_mean <= 0:
        return None
    return _mean(xs) / claimed_mean, sd / (math.sqrt(len(xs)) * claimed_mean)


def kappa_posterior(observations: list[tuple[float, float]], *, prior_mean: float = GATES["kappa_prior_mean"],
                    prior_sd: float = GATES["kappa_prior_sd"], lo: float = GATES["kappa_min"],
                    hi: float = GATES["kappa_max"]) -> dict[str, Any]:
    """Normal-normal update of κ from (κ observed, standard error) pairs (track 18 §6.1-6.2).

    Returns {"mean", "sd", "kappa" (the mean clipped to [lo, hi]), "lo80", "hi80", "n_obs", "prior_only"}.
    """
    prec = 1.0 / prior_sd ** 2
    num = prior_mean * prec
    used = 0
    for k, se in observations:
        if se and se > 0 and math.isfinite(k):
            prec += 1.0 / se ** 2
            num += k / se ** 2
            used += 1
    mean, sd = num / prec, 1.0 / math.sqrt(prec)
    return {"mean": mean, "sd": sd, "kappa": min(max(mean, lo), hi), "lo80": mean - Z80 * sd,
            "hi80": mean + Z80 * sd, "n_obs": used, "prior_only": used == 0}


def _scored(forecasts: Iterable[dict]) -> list[dict]:
    out = []
    for f in forecasts:
        if not isinstance(f, dict):
            continue
        p, y = _num(f.get("p")), f.get("outcome")
        if p is not None and 0.0 <= p <= 1.0 and y in (0, 1) and not isinstance(y, bool):
            out.append(f)
    return out


def calibration_in_the_large(forecasts: list[dict], *, icc: float = GATES["forecast_icc"],
                             tol: float = GATES["calibration_gross"],
                             min_n: int = int(GATES["calibration_min_forecasts"])) -> dict[str, Any]:
    """Hit rate minus mean stated probability, with a 90% interval (track 18 §5.4 item 5).

    The forecasts of one trade share its outcome, so the effective sample is Σ m / (1 + (m − 1)·icc) over trades
    with m forecasts each (the design effect). The variance p(1 − p) is floored at 0.02, as in track 18's code.
    "warning": the interval excludes 0; "gross_bias": it lies wholly beyond ±tol (it fails the go-live rule). Both
    need at least `min_n` scored forecasts: with fewer, the floored variance makes any miss look significant.
    """
    done = _scored(forecasts)
    n = len(done)
    if n == 0:
        return {"n": 0, "n_eff": 0.0, "mean_p": None, "hit_rate": None, "diff": None, "lo90": None, "hi90": None,
                "warning": False, "gross_bias": False, "enough": False}
    per_trade = Counter(str(f.get("trade_id") or f.get("forecast_id") or i) for i, f in enumerate(done))
    n_eff = sum(m / (1.0 + (m - 1) * icc) for m in per_trade.values())
    hit = sum(int(f["outcome"]) for f in done) / n
    mean_p = sum(float(f["p"]) for f in done) / n
    diff = hit - mean_p
    se = math.sqrt(max(hit * (1.0 - hit), 0.02) / n_eff)
    lo, hi = diff - Z90 * se, diff + Z90 * se
    enough = n >= min_n
    return {"n": n, "n_eff": n_eff, "mean_p": mean_p, "hit_rate": hit, "diff": diff, "lo90": lo, "hi90": hi,
            "warning": enough and (lo > 0 or hi < 0), "gross_bias": enough and (hi < -tol or lo > tol),
            "enough": enough}


def _fit_logistic(x: np.ndarray, y: np.ndarray, *, prior_mean: tuple[float, float] = (0.0, 1.0),
                  prior_sd: tuple[float, float] | None = None, max_iter: int = 100) -> tuple[np.ndarray, np.ndarray]:
    """Newton-Raphson for logit P(y = 1) = a + b·x. With `prior_sd`, a Gaussian prior around `prior_mean` (the MAP
    fit); without, a negligible ridge that only keeps the steps finite. Returns (beta, the Hessian at beta)."""
    X = np.column_stack([np.ones_like(x), x])
    m0 = np.asarray(prior_mean, dtype=float)
    P = np.diag([1.0 / s ** 2 for s in prior_sd]) if prior_sd else np.eye(2) * 1e-8
    beta = m0.copy()
    H = X.T @ X * 0.25 + P
    for _ in range(max_iter):
        mu = _expit(X @ beta)
        H = X.T @ (X * (mu * (1.0 - mu))[:, None]) + P
        g = X.T @ (y - mu) - P @ (beta - m0)
        step = np.linalg.solve(H, g)
        beta = beta + np.clip(step, -5.0, 5.0)
        if np.max(np.abs(step)) < 1e-10:
            break
    return beta, H


def _arrays(forecasts: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    done = _scored(forecasts)
    return (np.array([float(f["p"]) for f in done], dtype=float),
            np.array([float(f["outcome"]) for f in done], dtype=float))


def calibration_slope(p: Iterable[float], y: Iterable[int]) -> dict[str, Any] | None:
    """The calibration intercept and slope: logit P(y) = a + b·logit p (Cox 1958; track 10 §6(c)).

    b < 1 means over-confident, b > 1 timid. Returns {"n", "a", "b", "b_lo90", "b_hi90"} (a Wald interval), or None
    when the slope is not identifiable (fewer than two distinct stated probabilities).
    """
    p, y = np.asarray(list(p), dtype=float), np.asarray(list(y), dtype=float)
    x = _logit(p)
    if len(x) < 3 or len(np.unique(np.round(x, 9))) < 2:
        return None
    beta, H = _fit_logistic(x, y)
    try:
        se_b = math.sqrt(float(np.linalg.inv(H)[1, 1]))
    except (np.linalg.LinAlgError, ValueError):
        return None
    b = float(beta[1])
    return {"n": int(len(x)), "a": float(beta[0]), "b": b, "b_lo90": b - Z90 * se_b, "b_hi90": b + Z90 * se_b}


def miscalibration_lr_test(p: Iterable[float], y: Iterable[int]) -> float | None:
    """p-value of "the stated probabilities are right" (a = 0, b = 1) against the logistic recalibration.

    The gate for a recalibration map (track 10 §4.8; research/code/10-calibration/simulate.py). With a single
    distinct stated probability the map has one free parameter (1 degree of freedom), otherwise two.
    """
    p, y = np.asarray(list(p), dtype=float), np.asarray(list(y), dtype=float)
    if len(p) == 0:
        return None
    x = _logit(p)
    ll0 = _loglik(np.clip(p, EPS, 1.0 - EPS), y)
    if len(np.unique(np.round(x, 9))) < 2:
        p1, df = np.full_like(p, float(np.clip(y.mean(), EPS, 1.0 - EPS))), 1
    else:
        beta, _ = _fit_logistic(x, y)
        p1, df = _expit(beta[0] + beta[1] * x), 2
    return chi2_sf(2.0 * max(0.0, _loglik(p1, y) - ll0), df)


def fit_platt(p: Iterable[float], y: Iterable[int], *, prior_sd_a: float = 0.5,
              prior_sd_b: float = 0.5) -> tuple[float, float]:
    """MAP Platt map logit p' = a + b·logit p, shrunk toward the identity (0, 1) (track 10 §4.8;
    research/code/10-calibration/recalibration.py)."""
    p, y = np.asarray(list(p), dtype=float), np.asarray(list(y), dtype=float)
    beta, _ = _fit_logistic(_logit(p), y, prior_sd=(prior_sd_a, prior_sd_b))
    return float(beta[0]), float(beta[1])


def apply_platt(a: float, b: float, p: float) -> float:
    return float(_expit(a + b * _logit(np.array([p], dtype=float)))[0])


def recalibration_review(forecasts: list[dict], *, min_n: int = int(GATES["map_min_forecasts"]),
                         isotonic_n: int = int(GATES["map_isotonic_forecasts"]),
                         alpha: float = GATES["map_alpha"]) -> dict[str, Any]:
    """The gated recalibration map of one forecast family (track 10 §4.8; design §8).

    Below `min_n` scored forecasts: the identity map. From `min_n`: a MAP Platt map, recommended only if the
    likelihood-ratio test rejects the identity map (p < alpha) AND a map fitted on the older half scores better on
    the newer half (out-of-sample log-score gain > 0). Nothing is applied here: the review recommends.
    """
    done = sorted(_scored(forecasts), key=lambda f: (str(f.get("resolved_date") or ""), str(f.get("forecast_id"))))
    n = len(done)
    out: dict[str, Any] = {"n": n, "needed": min_n, "status": "identity", "lr_p": None, "a": None, "b": None,
                           "oos_gain": None, "mapped": [], "isotonic_eligible": n >= isotonic_n}
    if n < min_n:
        return out
    p, y = _arrays(done)
    lr_p = miscalibration_lr_test(p, y)
    a, b = fit_platt(p, y)
    half = n // 2
    a1, b1 = fit_platt(p[:half], y[:half])
    test_p, test_y = p[half:], y[half:]
    mapped = _expit(a1 + b1 * _logit(test_p))
    gain = (_loglik(mapped, test_y) - _loglik(np.clip(test_p, EPS, 1.0 - EPS), test_y)) / max(len(test_y), 1)
    adopt = lr_p is not None and lr_p < alpha and gain > 0
    out.update(status="recommend map" if adopt else "keep identity", lr_p=lr_p, a=a, b=b, oos_gain=gain,
               mapped=[{"stated": float(s), "recalibrated": apply_platt(a, b, float(s))} for s in sorted(set(p))])
    return out


def base_rate_drift(returns: list[float], base: dict | None, *, min_n: int = int(GATES["drift_min_signals"]),
                    min_report: int = int(GATES["drift_min_report"])) -> dict[str, Any]:
    """A rule's resolved win rate and average return against its pre-registered base rate (track 18 §6.1).

    Two one-sample tests at the 90% level: the win rate against base["win_rate"] (fraction) and the mean against
    base["mean_pct"] (percent units). status: "too few" (< min_report), "in line", "early sign" (outside, but
    fewer than min_n), "drift" (outside, min_n or more: actionable).
    """
    xs = [float(x) for x in returns if _num(x) is not None]
    n = len(xs)
    base = base or {}
    b, mu = _num(base.get("win_rate")), _num(base.get("mean_pct"))
    out: dict[str, Any] = {"n": n, "win_rate": sum(1 for x in xs if x > 0) / n if n else None,
                           "mean_pct": 100.0 * _mean(xs) if n else None, "base_win_rate": b, "base_mean_pct": mu,
                           "flags": [], "status": "too few"}
    if n < min_report:
        return out
    if b is not None and 0.0 < b < 1.0 and abs(out["win_rate"] - b) > Z90 * math.sqrt(b * (1.0 - b) / n):
        out["flags"].append("win_rate")
    sd = _sd(xs)
    if mu is not None and sd and abs(out["mean_pct"] - mu) > Z90 * 100.0 * sd / math.sqrt(n):
        out["flags"].append("mean")
    out["status"] = ("drift" if n >= min_n else "early sign") if out["flags"] else "in line"
    return out


def sleeve_review(months: list[dict], *, review_drawdown: float = GATES["m2_review_drawdown"],
                  pause_sharpe: float = GATES["m2_pause_sharpe"],
                  window: int = int(GATES["m2_sharpe_months"])) -> dict[str, Any]:
    """M2's review and pause triggers (design §3 M2) from its monthly sleeve returns (fractions of NAV).

    Drawdown of the compounded sleeve path; Sharpe = mean/sd × √12 of the last `window` monthly excess returns.
    status: "pause" (a full window with Sharpe below `pause_sharpe`), "review" (current drawdown at or beyond
    `review_drawdown`), else "ok".
    """
    idx = peak = 1.0
    max_dd = 0.0
    for m in months:
        idx *= 1.0 + float(m.get("return") or 0.0)
        peak = max(peak, idx)
        max_dd = max(max_dd, 1.0 - idx / peak)
    drawdown = 1.0 - idx / peak
    ex = [float(m.get("excess") or 0.0) for m in months[-window:]]
    sd = _sd(ex)
    sharpe = _mean(ex) / sd * math.sqrt(12.0) if sd else None
    pause = len(months) >= window and sharpe is not None and sharpe < pause_sharpe
    review = drawdown >= review_drawdown
    return {"months": len(months), "window": window, "cum_return": idx - 1.0, "drawdown": drawdown,
            "max_drawdown": max_dd, "sharpe": sharpe, "review_drawdown": review_drawdown,
            "pause_sharpe": pause_sharpe, "status": "pause" if pause else "review" if review else "ok"}


# ----------------------------------------------------------------------------------------------------
# periods
# ----------------------------------------------------------------------------------------------------

def quarter_bounds(quarter: str) -> tuple[date, date]:
    """("2026-Q3") -> (2026-07-01, 2026-09-30). Raises ValueError for anything but YYYY-Qn."""
    m = _QUARTER.match(str(quarter).strip())
    if not m:
        raise ValueError(f"quarter must look like YYYY-Qn (got {quarter!r})")
    y, q = int(m.group(1)), int(m.group(2))
    start = date(y, 3 * q - 2, 1)
    end = date(y + 1, 1, 1) if q == 4 else date(y, 3 * q + 1, 1)
    return start, end - timedelta(days=1)


def year_bounds(year: str) -> tuple[date, date]:
    if not _YEAR.match(str(year).strip()):
        raise ValueError(f"year must look like YYYY (got {year!r})")
    y = int(year)
    return date(y, 1, 1), date(y, 12, 31)


def last_quarter(today: date) -> str:
    """The quarter that ended most recently before `today`."""
    q = (today.month - 1) // 3 + 1
    return f"{today.year}-Q{q - 1}" if q > 1 else f"{today.year - 1}-Q4"


def quarter_of(day: str) -> str:
    """The quarter containing a date or a YYYY-MM month."""
    y, m = int(str(day)[:4]), int(str(day)[5:7])
    return f"{y}-Q{(m - 1) // 3 + 1}"


def period_end(key: Any) -> str:
    """The last day a date or period key covers: a date, "YYYY-MM", "YYYY-Qn" or "YYYY" ("" if none)."""
    s = str(key or "").strip()
    d = _day(s)
    if d:
        return d
    if _QUARTER.match(s):
        return quarter_bounds(s)[1].isoformat()
    if _YEAR.match(s):
        return f"{s}-12-31"
    if _MONTH.match(s):
        y, m = int(s[:4]), int(s[5:7])
        return (date(y + m // 12, m % 12 + 1, 1) - timedelta(days=1)).isoformat()
    return ""


def months_between(start: str, end: str) -> int:
    """Whole months from `start` to `end` (the monthly report's convention)."""
    a, b = pd.Timestamp(str(start)[:10]), pd.Timestamp(str(end)[:10])
    return max((b.year - a.year) * 12 + (b.month - a.month) + int(b.day >= a.day) - 1, 0)


def _days(start: str, end: str) -> list[str]:
    d, e = date.fromisoformat(start), date.fromisoformat(end)
    out = []
    while d <= e:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def in_period(start: Any, end: Any) -> Callable[[Any], bool]:
    """A predicate: the date-like value falls in [start, end]."""
    a, b = str(start)[:10], str(end)[:10]

    def inside(d: Any) -> bool:
        day = _day(d)
        return day is not None and a <= day <= b

    return inside


# ----------------------------------------------------------------------------------------------------
# collectors: read the state (generic over every module and shadow book)
# ----------------------------------------------------------------------------------------------------

def _entry_day(h: dict) -> str | None:
    """A history entry's entry date; a rebalance-style entry (no exit) counts on its "date"."""
    return _day(h.get("entry_date") or h.get("fill_date") or (h.get("date") if not h.get("exit_date") else None))


def module_activity(state: dict, inside: Callable[[Any], bool]) -> tuple[list[dict], int, int]:
    """Trades opened and closed per module in a period: ([{"module", "opened", "closed", "pnl_usd"}], opened,
    closed). Generic over every module in the state: closed trades are history entries with an exit date; entries
    without one (M2's rebalances) count as opened on their date; an open trade counts from its fill date."""
    rows, n_open, n_close = [], 0, 0
    for name, ms in (state.get("modules") or {}).items():
        if not isinstance(ms, dict):
            continue
        hist = [h for h in (ms.get("history") or []) if isinstance(h, dict)]
        opened = sum(1 for h in hist if inside(_entry_day(h)))
        ot = ms.get("open_trade")
        if isinstance(ot, dict) and inside(ot.get("fill_date") or ot.get("entry_date")):
            opened += 1
        done = [h for h in hist if inside(h.get("exit_date"))]
        pnls = [p for p in (_first_num(h, PNL_KEYS) for h in done) if p is not None]
        pnl = sum(pnls) if done and pnls else (0.0 if done else None)
        n_open += opened
        n_close += len(done)
        if opened or done:
            rows.append({"module": name, "opened": opened, "closed": len(done), "pnl_usd": pnl})
    return rows, n_open, n_close


def open_trades(state: dict) -> list[dict]:
    """[{"module", "trade_id", "status"}] for every module with an open trade."""
    out = []
    for name, ms in (state.get("modules") or {}).items():
        ot = ms.get("open_trade") if isinstance(ms, dict) else None
        if isinstance(ot, dict):
            out.append({"module": name, "trade_id": str(ot.get("trade_id") or ""), "status": str(ot.get("status") or "")})
    return out


def paused_modules(state: dict, asof: str | None = None) -> list[dict]:
    """Modules sent back to the shadow ledger by a kill switch: [{"module", "date", "reason"}]."""
    out = []
    for name, ms in (state.get("modules") or {}).items():
        dis = ms.get("disabled") if isinstance(ms, dict) else None
        if not dis:
            continue
        info = dis if isinstance(dis, dict) else {"reason": str(dis)}
        day = _day(info.get("date"))
        if asof is None or day is None or day <= asof:
            out.append({"module": name, "date": day, "reason": str(info.get("reason") or "kill switch")})
    return out


def _shadow_block(name: str, cfg: "Config | None") -> dict:
    return ((((cfg.constitution if cfg is not None else {}) or {}).get("shadow") or {}).get(name)) or {}


def _shadow_label(name: str, cfg: "Config | None") -> str:
    return str(_shadow_block(name, cfg).get("name") or SHADOW_LABELS.get(name, name))


def _event_day(e: dict) -> str | None:
    for k in DATE_KEYS:
        d = _day(e.get(k))
        if d:
            return d
    return None


def _score_horizon(events: list[dict], block: dict) -> str | None:
    """The horizon a scored record reports: the longest configured one (W10: score_calendar_days [60, 90] -> "90"),
    else the longest seen in the events' "scores"; None for events that are not scored."""
    keys = {str(k) for e in events if isinstance(e.get("scores"), dict) for k in e["scores"]}
    configured = [int(h) for h in (block.get("score_calendar_days") or []) if _num(h) is not None]
    if configured:
        return str(max(configured))
    nums = sorted((int(k), k) for k in keys if k.isdigit())
    return nums[-1][1] if nums else None


def shadow_activity(state: dict, cfg: "Config | None", inside: Callable[[Any], bool]) -> list[dict]:
    """[{"book", "name", "enabled", "signals", "closed", "mean_ret"}] per shadow book in a period, whatever its shape.

    Books with "events" count events dated in the period; scored events (W10's record) are closed at the longest
    score horizon, other events when they carry an exit date and a return. Books with "trades" count signals by
    signal date and closed trades by exit date. Entries of unknown shape are skipped. "enabled" is the book's
    config flag (a book without a config block counts as enabled).
    """
    rows = []
    for name, book in (state.get("shadow") or {}).items():
        if not isinstance(book, dict):
            continue
        label = _shadow_label(name, cfg)
        enabled = _shadow_block(name, cfg).get("enabled", True) is not False
        if isinstance(book.get("events"), list):
            evs = [e for e in book["events"] if isinstance(e, dict)]
            signals = sum(1 for e in evs if inside(_event_day(e)))
            block = _shadow_block(name, cfg)
            scored = any(isinstance(e.get("scores"), dict) for e in evs) or bool(block.get("score_calendar_days"))
            h = _score_horizon(evs, block) if scored else None
            if h is not None:
                scores = [e["scores"][h] for e in evs if isinstance(e.get("scores"), dict)
                          and isinstance(e["scores"].get(h), dict)]
                closed = [s for s in scores if inside(s.get("exit_date"))]
                label = f"{label}, {h}-day score"
            else:
                closed = [e for e in evs if inside(e.get("exit_date"))]
            rets = [r for r in (_first_num(c, RETURN_KEYS) for c in closed) if r is not None]
            rows.append({"book": name, "name": label, "enabled": enabled, "signals": signals, "closed": len(closed),
                         "mean_ret": _mean(rets)})
            continue
        trades = [t for t in (book.get("trades") or []) if isinstance(t, dict)]
        ot = book.get("open_trade")
        signals = sum(1 for t in trades if inside(t.get("signal_date") or t.get("date")))
        if isinstance(ot, dict) and inside(ot.get("signal_date") or ot.get("date")):
            signals += 1
        closed = [t for t in trades if inside(t.get("exit_date"))]
        rets = [r for r in (_first_num(t, RETURN_KEYS) for t in closed) if r is not None]
        rows.append({"book": name, "name": label, "enabled": enabled, "signals": signals, "closed": len(closed),
                     "mean_ret": _mean(rets)})
    return rows


def run_punctuality(state: dict, start: str, end: str, today: str, *,
                    kinds: tuple[str, ...] = RUN_KINDS) -> tuple[int, int]:
    """(scheduled runs, runs completed "ok") over the NYSE sessions from max(start, launch) to min(end, today).

    Counts the daily run and, from its first run, the 10:17 ET options job (off until the options build is
    enabled). The hourly crypto job is not counted.
    """
    runs = state.get("runs") or {}
    created = str(state.get("created") or start)[:10]
    expected = on_time = 0
    for kind in kinds:
        by_day = {k.split(":", 1)[1][:10]: v for k, v in runs.items() if k.startswith(kind + ":")}
        if kind != "daily" and not by_day:
            continue
        first = created if kind == "daily" else max(created, min(by_day))
        lo, hi = max(str(start)[:10], first), min(str(end)[:10], str(today)[:10])
        if lo > hi:
            continue
        sessions = [d for d in _days(lo, hi) if is_trading_day(d)]
        expected += len(sessions)
        on_time += sum(1 for d in sessions if (by_day.get(d) or {}).get("status") == "ok")
    return expected, on_time


def alerts_between(state: dict, start: str, end: str) -> list[dict]:
    """Alerts whose run date (or period key) ends within [start, end]."""
    return [a for a in (state.get("alerts") or []) if isinstance(a, dict)
            and str(start)[:10] <= period_end(a.get("date", "")) <= str(end)[:10]]


def memo_fetch(fetch: Callable[[str], list[str] | None]) -> Callable[[str], list[str] | None]:
    """One GitHub comments call per issue per report, however often the review asks."""
    cache: dict[str, list[str] | None] = {}

    def get(url: str) -> list[str] | None:
        if url not in cache:
            cache[url] = fetch(url)
        return cache[url]

    return get


def selected_trades(state: dict, asof: str) -> int:
    """Trades of the selected book to date: the budget counter (one M2 rebalance = one trade, design §3 M2)."""
    counters = (state.get("counters") or {}).get("trades") or {}
    return int(sum(int(v) for y, v in counters.items() if str(y) <= str(asof)[:4] and _num(v) is not None))


def closed_trades(state: dict, asof: str) -> dict[str, list[dict]]:
    """Closed trades per module to date: {module: [{"trade_id", "entry", "exit", "return", "pnl"}]}; entries without
    an exit date or a numeric return are skipped (M2's rebalances resolve as position-months instead)."""
    out: dict[str, list[dict]] = {}
    for name, ms in (state.get("modules") or {}).items():
        if not isinstance(ms, dict):
            continue
        rows = []
        for h in ms.get("history") or []:
            if not isinstance(h, dict):
                continue
            exit_day, ret = _day(h.get("exit_date")), _first_num(h, RETURN_KEYS)
            if exit_day is None or ret is None or exit_day > asof:
                continue
            rows.append({"trade_id": str(h.get("trade_id") or ""), "entry": _entry_day(h) or exit_day,
                         "exit": exit_day, "return": ret, "pnl": _first_num(h, PNL_KEYS)})
        out[name] = rows
    return out


def live_record(state: dict, asof: str) -> dict[str, Any]:
    """When live trading started and which trades were live: {"since", "trade_ids"}, from the [LIVE] entry emails
    the runs sent (the account mode is global, so the email labels are the record)."""
    since, ids = None, set()
    for key, run in (state.get("runs") or {}).items():
        day = _day(key.split(":", 1)[-1])
        if day is None or day > asof or not isinstance(run, dict):
            continue
        for e in run.get("emails") or []:
            if isinstance(e, dict) and str(e.get("subject", "")).startswith("[LIVE]") and e.get("kind") in ENTRY_KINDS:
                ids.add(str(e.get("trade_id")))
                since = day if since is None or day < since else since
    return {"since": since, "trade_ids": ids}


# ----------------------------------------------------------------------------------------------------
# evidence: one pass over the ledger, then the wide book and M2's months
# ----------------------------------------------------------------------------------------------------

@dataclass
class Evidence:
    """Everything the reviews read, gathered once per report."""

    asof: str
    default_rate: float
    rates: list[tuple[str, float]] = field(default_factory=list)          # (date, T-bill rate) from snapshots
    m2_decisions: list[tuple[str, dict]] = field(default_factory=list)   # (date, {leg: target dollars})
    fills: list[dict] = field(default_factory=list)                      # ledger fill records (no dividends)
    wide: dict[str, list[dict]] = field(default_factory=dict)            # wide-book units per family
    m2_sleeve: list[dict] = field(default_factory=list)                  # M2's monthly sleeve returns
    closed: dict[str, list[dict]] = field(default_factory=dict)          # closed trades per module
    notes: list[str] = field(default_factory=list)

    def rate_at(self, day: str) -> float:
        """The T-bill rate of the last snapshot on or before `day` (the run's rate before any snapshot)."""
        i = bisect_right(self.rates, (str(day)[:10], math.inf))
        return self.rates[i - 1][1] if i else self.default_rate

    def excess(self, ret: float, start: str, end: str) -> float:
        """A return over [start, end] net of T-bills for the same calendar days."""
        return ret - self.rate_at(start) * max(_days_between(start, end), 0) / 365.0


def collect(run: "Run", asof: str) -> Evidence:
    """Scan the ledger once (M2's monthly decisions, T-bill rates, fills) and build the wide book to `asof`."""
    try:
        default_rate = float(run.get_tbill())
    except Exception:  # noqa: BLE001 - a report never fails for want of the T-bill rate
        default_rate = float(run.cfg.data.get("fallback_tbill_rate", 0.0))
    ev = Evidence(asof=asof, default_rate=default_rate)
    m2: dict[str, dict] = {}
    try:
        for rec in run.ledger.records():
            kind, p, day = rec.get("record_type"), rec.get("payload") or {}, _day(rec.get("as_of"))
            if day is None or day > asof:
                continue
            if kind == "signal" and p.get("module") == "M2" and p.get("check") == "monthly":
                m2[day] = {str(k): v for k, v in (p.get("targets") or {}).items()}   # a forced re-run supersedes
            elif kind == "snapshot" and _num(p.get("tbill_rate")) is not None:
                ev.rates.append((day, float(p["tbill_rate"])))
            elif kind == "fill" and p.get("type") != "dividend":
                ev.fills.append(p)
    except (LedgerError, OSError) as exc:
        ev.notes.append(f"ledger unreadable for the review: {exc}")
    ev.rates.sort()
    ev.m2_decisions = sorted(m2.items())
    ev.closed = closed_trades(run.state, asof)
    units, ev.m2_sleeve = m2_months(run, ev)
    ev.wide = {"ST1B": _shadow_trade_units(run.state, "ST1B", ev), "M3": _module_units(ev, "M3"), "M2": units,
               "W10": _record_units(run.state, "W10", "90", ev)}
    return ev


def _unit(ev: Evidence, start: str | None, end: str, ret: float, **extra: Any) -> dict:
    start = start or end
    return {"start": start, "end": end, "return": ret, "excess": ev.excess(ret, start, end), **extra}


def _shadow_trade_units(state: dict, book: str, ev: Evidence) -> list[dict]:
    out = []
    for t in ((state.get("shadow") or {}).get(book) or {}).get("trades") or []:
        if not isinstance(t, dict):
            continue
        end, ret = _day(t.get("exit_date")), _first_num(t, RETURN_KEYS)
        if end and ret is not None and end <= ev.asof:
            out.append(_unit(ev, _day(t.get("fill_date") or t.get("entry_date") or t.get("signal_date")), end, ret))
    return out


def _module_units(ev: Evidence, module: str) -> list[dict]:
    return [_unit(ev, t["entry"], t["exit"], t["return"], trade_id=t["trade_id"]) for t in ev.closed.get(module, [])]


def _record_units(state: dict, book: str, horizon: str, ev: Evidence) -> list[dict]:
    """Scored events of a shadow record (W10: every uptrend -3% day) at one horizon."""
    out = []
    for e in ((state.get("shadow") or {}).get(book) or {}).get("events") or []:
        s = (e.get("scores") or {}).get(horizon) if isinstance(e, dict) and isinstance(e.get("scores"), dict) else None
        if not isinstance(s, dict):
            continue
        end, ret = _day(s.get("exit_date")), _num(s.get("return"))
        if end and ret is not None and end <= ev.asof:
            out.append(_unit(ev, _day(e.get("entry_date") or e.get("signal_date")), end, ret))
    return out


def _total_return(run: "Run", ticker: str, start: str, end: str) -> float | None:
    """Total return (adjusted closes) from the close of `start` to the close of `end`, or None without data."""
    try:
        px = run.bars(ticker)["adj_close"].dropna()
    except Exception:  # noqa: BLE001 - missing data leaves the position-month out
        return None
    a, b = px.loc[: pd.Timestamp(start)], px.loc[: pd.Timestamp(end)]
    if not len(a) or not len(b) or (pd.Timestamp(start) - a.index[-1]).days > 7:
        return None
    return float(b.iloc[-1] / a.iloc[-1] - 1.0)


def _nav_on(state: dict, day: str) -> float | None:
    navs = [(m.get("date"), _num(m.get("nav"))) for m in state.get("marks") or [] if isinstance(m, dict)]
    before = [n for d, n in navs if d and str(d) <= day and n]
    return before[-1] if before else None


def m2_months(run: "Run", ev: Evidence) -> tuple[list[dict], list[dict]]:
    """M2's position-months and monthly sleeve returns from its monthly decisions in the ledger.

    A position-month is one leg with a positive target, held from one monthly decision to the next (or to its
    month's end once that has passed); its return is the leg's total return, and its excess return is net of
    T-bills. The sleeve's month is the sum of the legs' returns weighted by target / NAV, so it is M2's result
    in NAV terms (design §3 M2: "max drawdown ≈ −12% at s = 0.5"). Targets stand in for the holdings, which the
    no-trade band keeps within 25% of them.
    """
    units, sleeve = [], []
    decisions = ev.m2_decisions
    for i, (start, targets) in enumerate(decisions):
        if i + 1 < len(decisions):
            end = decisions[i + 1][0]
        else:
            end = (pd.Timestamp(start) + pd.offsets.MonthEnd(0)).date().isoformat()
            if ev.asof < end:
                continue                        # the month is not over: unresolved
        nav = _nav_on(run.state, start) or sum(v for v in (_num(x) for x in targets.values()) if v) or 1.0
        rf = ev.rate_at(start) * max(_days_between(start, end), 0) / 365.0
        month_ret = month_ex = 0.0
        legs = 0
        for leg, dollars in sorted(targets.items()):
            usd = _num(dollars)
            if not usd or usd <= 0:
                continue
            ret = _total_return(run, leg, start, end)
            if ret is None:
                ev.notes.append(f"M2 {leg} {start[:7]}: no prices for the position-month")
                continue
            w = usd / nav
            units.append({"leg": leg, "start": start, "end": end, "return": ret, "excess": ret - rf, "weight": w})
            month_ret += w * ret
            month_ex += w * (ret - rf)
            legs += 1
        sleeve.append({"month": start[:7], "start": start, "end": end, "legs": legs, "return": month_ret,
                       "excess": month_ex})
    return units, sleeve


def edge_review(ev: Evidence, g: dict, *, weight: Callable[[dict], float] | None = None) -> dict[str, Any]:
    """P(edge > 0) on the wide book (design §7.3), with the family labels; `weight` weighs each unit (the ramp)."""
    fams = {name: [(u["excess"], weight(u) if weight else 1.0) for u in units] for name, units in ev.wide.items()}
    out = edge_evidence(fams, prior_sd=g["edge_prior_sd"], min_units=int(g["edge_min_units"]))
    for row in out["families"]:
        row["label"] = WIDE_BOOK_LABELS.get(row["family"], row["family"])
    return out


# ----------------------------------------------------------------------------------------------------
# reviews built from the evidence
# ----------------------------------------------------------------------------------------------------

def _modules_cfg(cfg: "Config") -> dict:
    return (cfg.constitution or {}).get("modules") or {}


def kappa_review(cfg: "Config", ev: Evidence, g: dict) -> dict[str, Any]:
    """κ̂ per module with a claimed per-trade edge (base_rates.mean_pct) and pooled (track 18 §6.1-6.2)."""
    rows, obs = [], []
    for name, mod in _modules_cfg(cfg).items():
        claimed = _num(((mod or {}).get("base_rates") or {}).get("mean_pct"))
        if claimed is None or claimed <= 0:
            continue
        rets = [t["return"] for t in ev.closed.get(name, [])]
        ob = kappa_observation(rets, claimed / 100.0) if len(rets) >= int(g["kappa_min_trades"]) else None
        rows.append({"module": name, "trades": len(rets), "claimed_mean_pct": claimed,
                     "realized_mean_pct": 100.0 * _mean(rets) if rets else None,
                     "kappa_obs": ob[0] if ob else None, "se": ob[1] if ob else None, "used": ob is not None})
        if ob:
            obs.append(ob)
    post = kappa_posterior(obs, prior_mean=g["kappa_prior_mean"], prior_sd=g["kappa_prior_sd"], lo=g["kappa_min"],
                           hi=g["kappa_max"])
    return {**post, "modules": rows, "prior_mean": g["kappa_prior_mean"], "prior_sd": g["kappa_prior_sd"],
            "clip_lo": g["kappa_min"], "clip_hi": g["kappa_max"], "sizing_kappa": g["kappa_sizing"],
            "min_trades": int(g["kappa_min_trades"])}


def _resolved_forecasts(state: dict, asof: str) -> list[dict]:
    out = []
    for f in _scored((state.get("forecasts") or {}).get("resolved") or []):
        day = _day(f.get("resolved_date"))
        if day is None or day <= asof:
            out.append(f)
    return out


def _family(f: dict) -> str:
    return f"{f.get('module') or '?'} {f.get('event') or 'forecast'}"


def _family_label(key: str) -> str:
    module, _, event = key.partition(" ")
    return f"{module} {EVENT_LABELS.get(event, event.replace('_', ' '))}"


def calibration_review(state: dict, asof: str, g: dict) -> dict[str, Any]:
    """Calibration-in-the-large per forecast family and pooled, and each family's recalibration map (design §8)."""
    done = _resolved_forecasts(state, asof)
    fams: dict[str, list[dict]] = {}
    for f in done:
        fams.setdefault(_family(f), []).append(f)
    rows, maps = [], []
    kw = {"icc": g["forecast_icc"], "tol": g["calibration_gross"], "min_n": int(g["calibration_min_forecasts"])}
    for key in sorted(fams):
        cal = calibration_in_the_large(fams[key], **kw)
        rows.append({"family": key, "label": _family_label(key), **cal})
        rec = recalibration_review(fams[key], min_n=int(g["map_min_forecasts"]),
                                   isotonic_n=int(g["map_isotonic_forecasts"]), alpha=g["map_alpha"])
        maps.append({"family": key, "label": _family_label(key), **rec})
    pooled = calibration_in_the_large(done, **kw)
    p, y = _arrays(done)
    slope = calibration_slope(p, y) if len(done) >= int(g["calibration_min_slope_forecasts"]) else None
    verified = bool(slope and pooled["diff"] is not None and abs(pooled["diff"]) <= g["calibration_citl"]
                    and slope["b_lo90"] <= 1.0 <= slope["b_hi90"])
    return {"pooled": pooled, "families": rows, "maps": maps, "slope": slope, "verified": verified,
            "citl_tolerance": g["calibration_citl"], "gross_tolerance": g["calibration_gross"],
            "min_forecasts": int(g["calibration_min_forecasts"]), "map_min_forecasts": int(g["map_min_forecasts"]),
            "min_slope_forecasts": int(g["calibration_min_slope_forecasts"])}


def drift_review(run: "Run", ev: Evidence, g: dict) -> list[dict]:
    """Base-rate drift for every rule with a base rate: modules (constitution base_rates), ST-1b (track 13) and
    W10's record at 60 and 90 days (track 23), and Phase B shadow books whose config carries base_rates."""
    rows = []
    kw = {"min_n": int(g["drift_min_signals"]), "min_report": int(g["drift_min_report"])}
    for name, mod in _modules_cfg(run.cfg).items():
        base = (mod or {}).get("base_rates") or {}
        if base.get("win_rate") is None and base.get("mean_pct") is None:
            continue
        rets = [t["return"] for t in ev.closed.get(name, [])]
        rows.append({"family": name, "label": f"{name} trades", "kind": "module", "since": base.get("since"),
                     **base_rate_drift(rets, base, **kw)})
    shadow_cfg = ((run.cfg.constitution or {}).get("shadow") or {})
    for name, book in (run.state.get("shadow") or {}).items():
        if name == "W10" or not isinstance(book, dict):
            continue
        base = ((shadow_cfg.get(name) or {}).get("base_rates")) or SHADOW_BASE_RATES.get(name)
        if not base:
            continue
        rets = [u["return"] for u in _shadow_trade_units(run.state, name, ev)]
        rows.append({"family": name, "label": _shadow_label(name, run.cfg), "kind": "shadow",
                     "since": base.get("since"), **base_rate_drift(rets, base, **kw)})
    for h in ("60", "90"):
        rets = [u["return"] for u in _record_units(run.state, "W10", h, ev)]
        rows.append({"family": f"W10@{h}", "label": f"W10 record, {h}-day score", "kind": "record",
                     "since": W10_RECORD_REFERENCE["since"], **base_rate_drift(rets, W10_RECORD_REFERENCE[h], **kw)})
    return rows


def cost_review(run: "Run", ev: Evidence, start: str, end: str, fb: dict, g: dict) -> dict[str, Any]:
    """Costs and slippage in a period: the fill model's cost on each paper fill (|price − reference| × quantity ×
    multiplier), and practice-account fills against the model (the owner's issue comments)."""
    by: dict[str, dict] = {}
    for f in ev.fills:
        day = _day(f.get("fill_date"))
        if day is None or not (start <= day <= end):
            continue
        price, ref, qty = _num(f.get("price")), _num(f.get("ref_price")), _num(f.get("qty"))
        dollars = abs(_num(f.get("dollars")) or 0.0)
        mult = _num(f.get("multiplier")) or 1.0
        cost = abs(price - ref) * abs(qty) * mult if None not in (price, ref, qty) else 0.0
        row = by.setdefault(str(f.get("ticker") or "?"), {"ticker": str(f.get("ticker") or "?"), "fills": 0,
                                                          "dollars": 0.0, "cost_usd": 0.0})
        row["fills"] += 1
        row["dollars"] += dollars
        row["cost_usd"] += cost
    rows = sorted(by.values(), key=lambda r: -r["dollars"])
    for r in rows:
        r["cost_bps"] = 1e4 * r["cost_usd"] / r["dollars"] if r["dollars"] else None
    dollars = sum(r["dollars"] for r in rows)
    cost = sum(r["cost_usd"] for r in rows)
    gaps = [float(x["gap_bps"]) for x in fb.get("fills") or [] if _num(x.get("gap_bps")) is not None]
    mean_gap = _mean(gaps)
    tol = float(g["cost_tolerance_bps"])
    if not gaps:
        advice = "no_practice_fills"
    elif mean_gap > tol:
        advice = "more_conservative"
    elif mean_gap < -tol and len(gaps) >= int(g["cost_cut_min_fills"]):
        advice = "cut_supported"
    else:
        advice = "keep"
    practice: dict[str, dict] = {}
    for x in fb.get("fills") or []:
        p = practice.setdefault(str(x.get("ticker")), {"ticker": str(x.get("ticker")), "fills": 0, "gaps": []})
        p["fills"] += 1
        p["gaps"].append(float(x.get("gap_bps") or 0.0))
    prac_rows = [{"ticker": t, "fills": p["fills"], "median_gap_bps": _median([abs(v) for v in p["gaps"]]),
                  "mean_gap_bps": _mean(p["gaps"])} for t, p in sorted(practice.items())]
    return {"fills": sum(r["fills"] for r in rows), "dollars": dollars, "cost_usd": cost,
            "cost_bps": 1e4 * cost / dollars if dollars else None, "by_ticker": rows,
            "practice_fills": len(gaps), "median_gap_bps": fb.get("median_gap_bps"), "mean_gap_bps": mean_gap,
            "practice_by_ticker": prac_rows, "tolerance_bps": tol, "cut_min_fills": int(g["cost_cut_min_fills"]),
            "advice": advice, "model_version": str((run.cfg.fills or {}).get("model_version", ""))}


def w10_status(run: "Run", ev: Evidence) -> dict[str, Any]:
    """W10's kill switch (design §3 W10): its worst trade and cumulative realized P&L against the limits."""
    cfg_w = _modules_cfg(run.cfg).get("W10") or {}
    ks = cfg_w.get("kill_switch") or {}
    trades = ev.closed.get("W10", [])
    nav = _nav_on(run.state, ev.asof)
    dis = next((p for p in paused_modules(run.state, ev.asof) if p["module"] == "W10"), None)
    pnl = sum(t["pnl"] or 0.0 for t in trades)
    limit_pct = _num(ks.get("cumulative_pnl_pct_nav"))
    return {"trades": len(trades), "worst_return": min((t["return"] for t in trades), default=None),
            "single_trade_limit": _num(ks.get("single_trade_loss")), "cum_pnl": pnl,
            "cum_limit_pct_nav": limit_pct, "cum_limit_usd": limit_pct * nav if (limit_pct is not None and nav) else None,
            "disabled": dis, "status": "shadow" if dis else "active"}


def module_reviews(run: "Run", ev: Evidence, g: dict) -> dict[str, Any]:
    """Design §3 kill switches and reviews: W10's kill switch, M2's review and pause triggers, paused modules."""
    m2 = sleeve_review(ev.m2_sleeve, review_drawdown=g["m2_review_drawdown"], pause_sharpe=g["m2_pause_sharpe"],
                       window=int(g["m2_sharpe_months"]))
    return {"w10": w10_status(run, ev), "m2": m2, "paused": paused_modules(run.state, ev.asof)}


def gate_status(run: "Run", ev: Evidence, g: dict, *, fetch: Callable[[str], list[str] | None],
                ledger_ok: bool | None = None) -> dict[str, Any]:
    """The go-live gate to date (design §7.2-7.3): the operations checks and the edge evidence.

    Keys match `emails.render_monthly` (gate_* thresholds, *_to_date values) so the monthly and quarterly
    reviews show the same table. "ops_ok" is None while any check is unmeasured (fail closed).
    """
    st = run.state
    asof = ev.asof
    created = str(st.get("created") or asof)[:10]
    today = today_et().isoformat()
    expected, on_time = run_punctuality(st, created, asof, today)
    vf = sum(1 for a in alerts_between(st, "0000-01-01", asof) if a.get("kind") == "validator")
    issues = [i for i in st.get("issues") or [] if isinstance(i, dict) and (_day(i.get("date")) or "") <= asof]
    fb = feedback.review(issues, st.get("fills") or [], fetch=fetch) if issues else {}
    handled_rate = (fb["handled"] / fb["measured"]) if fb.get("measured") and fb.get("handled") is not None else None
    if ledger_ok is None:
        ledger_ok = run.ledger.verify()[0]
    months = months_between(created, asof)
    trades = selected_trades(st, asof)
    edge = edge_review(ev, g)
    on_time_rate = on_time / expected if expected else None
    checks = {
        "months": months >= g["gate_months"],
        "on_time": None if on_time_rate is None else on_time_rate >= g["gate_on_time"],
        "validator": vf <= g["gate_validator_failures"],
        "emails_handled": None if handled_rate is None else handled_rate >= g["gate_emails_handled"],
        "fills": fb.get("fills_ok"),
        "ledger": bool(ledger_ok),
    }
    binding = trades >= g["gate_trades"]
    edge_ok = None if edge["p_positive"] is None else edge["p_positive"] >= g["edge_go_live"]
    ops_ok = None if any(v is None for v in checks.values()) else all(checks.values())
    ready = bool(ops_ok) and (edge_ok is True if binding else True)
    return {
        "stage": "live" if str(run.cfg.mode).lower() == "live" else "paper",
        "gate_months": g["gate_months"], "gate_trades": g["gate_trades"], "gate_on_time": g["gate_on_time"],
        "gate_emails_handled": g["gate_emails_handled"], "gate_validator_failures": g["gate_validator_failures"],
        "months_elapsed": months, "runs_expected_to_date": expected, "runs_on_time_to_date": on_time,
        "on_time_rate_to_date": on_time_rate, "validator_failures_to_date": vf,
        "emails_measured_to_date": fb.get("measured"), "emails_handled_to_date": fb.get("handled"),
        "emails_handled_rate_to_date": handled_rate, "fills_ok_to_date": fb.get("fills_ok"),
        "median_fill_gap_bps_to_date": fb.get("median_gap_bps"), "fill_gaps_to_date": fb.get("fills") or [],
        "ledger_ok": bool(ledger_ok), "trades_to_date": trades,
        "edge_p": edge["p_positive"], "edge_units": edge["units"], "edge_threshold": g["edge_go_live"],
        "edge_binding": binding, "edge_ok": edge_ok, "edge_families": edge["families"],
        "edge_min_units": int(g["edge_min_units"]),
        "gate_checks": checks, "ops_ok": ops_ok, "go_live_ready": ready,
        "pilot_size": g["pilot_size"],
    }


def ramp_review(run: "Run", ev: Evidence, g: dict, gate: dict, kappa: dict, calibration: dict) -> dict[str, Any]:
    """The ramp after go-live (design §7.4): 50% and 100% of the target size. Paper-era evidence counts at half
    weight; live trades are the ones whose entry email was labelled LIVE."""
    live = live_record(run.state, ev.asof)
    since = live["since"]
    w = float(g["ramp_full_paper_weight"])

    def weight(u: dict) -> float:
        return 1.0 if since and str(u.get("start") or "") >= since else w

    edge_w = edge_review(ev, g, weight=weight)
    live_months = months_between(since, ev.asof) if since else 0
    resolved = [(t["trade_id"], t["return"]) for rows in ev.closed.values() for t in rows]
    resolved += [(m.get("trade_id") or "", None) for m in _m2_resolved(run.state, ev.asof)]
    resolved_w = sum(1.0 if tid in live["trade_ids"] else w for tid, _ in resolved)
    rets = [r for _, r in resolved if r is not None]
    paper_edge_bps = 1e4 * _mean(rets) if rets else None
    gaps = [float(x["gap_bps"]) for x in gate.get("fill_gaps_to_date") or [] if _num(x.get("gap_bps")) is not None]
    shortfall = (2.0 * _mean(gaps) / paper_edge_bps) if (gaps and paper_edge_bps and paper_edge_bps > 0) else None
    p = edge_w["p_positive"]
    half = {
        "live_months": live_months >= g["ramp_half_live_months"],
        "live_trades": len(live["trade_ids"]) >= g["ramp_half_live_trades"],
        "edge": None if p is None else p >= g["ramp_half_edge"],
        "kappa": kappa["kappa"] >= g["ramp_half_kappa"],
        "shortfall": None if shortfall is None else shortfall <= g["ramp_half_shortfall"],
    }
    full = {
        "resolved": resolved_w >= g["ramp_full_resolved"],
        "edge": None if p is None else p >= g["ramp_full_edge"],
        "calibration": bool(calibration.get("verified")),
    }
    return {"live_since": since, "live_months": live_months, "live_trades": len(live["trade_ids"]),
            "edge_p_weighted": p, "kappa": kappa["kappa"], "shortfall": shortfall, "paper_edge_bps": paper_edge_bps,
            "resolved_weighted": resolved_w, "half": half, "full": full,
            "half_ok": all(v is True for v in half.values()), "full_ok": all(v is True for v in full.values()),
            "thresholds": {k: g[k] for k in ("ramp_half_live_months", "ramp_half_live_trades", "ramp_half_edge",
                                             "ramp_half_kappa", "ramp_half_shortfall", "ramp_full_resolved",
                                             "ramp_full_paper_weight", "ramp_full_edge", "half_size")}}


def retirement_review(run: "Run", ev: Evidence, g: dict, edge: dict, paused: list[dict]) -> list[dict]:
    """Retirement tests per module (design §8 annual; track 10 §6(e)).

    A module is a retirement candidate when its posterior P(edge > 0) on its own resolved trades (excess returns,
    the §7.3 prior) is below `retire_edge` after `retire_min_trades` trades and `retire_min_months` months, AND its
    shadow evidence (its wide-book family) is negative too. Modules without shadow evidence can only be retired on
    a kill switch or thesis invalidation, which is the owner's call. M2 counts its months (one rebalance = one
    trade). Nothing is retired here: the annual review recommends.
    """
    fam_p = {r["family"]: r["p_positive"] for r in edge["families"]}
    created = str(run.state.get("created") or ev.asof)[:10]
    units: dict[str, list[tuple[float, str]]] = {
        name: [(ev.excess(t["return"], t["entry"], t["exit"]), t["entry"]) for t in trades]
        for name, trades in ev.closed.items()}
    units["M2"] = [(m["excess"], m["start"]) for m in ev.m2_sleeve if m["legs"]]
    rows = []
    for name, mod in _modules_cfg(run.cfg).items():
        xs = [x for x, _ in units.get(name, [])]
        if not xs and not (mod or {}).get("enabled", False):
            continue
        sd = _sd(xs)
        p = edge_posterior(len(xs), _mean(xs) / sd, prior_sd=g["edge_prior_sd"]) if sd else None
        months = months_between(min((d for _, d in units.get(name, [])), default=created), ev.asof)
        shadow_p = fam_p.get(SHADOW_EVIDENCE.get(name, ""))
        if any(x["module"] == name for x in paused):
            status = "killed"
        elif len(xs) < g["retire_min_trades"] or months < g["retire_min_months"]:
            status = "too early"
        elif p is not None and p < g["retire_edge"] and shadow_p is not None and shadow_p < 0.5:
            status = "candidate"
        else:
            status = "keep"
        rows.append({"module": name, "trades": len(xs), "months": months, "p_positive": p,
                     "shadow_p_positive": shadow_p, "status": status})
    return rows


def _m2_resolved(state: dict, asof: str) -> list[dict]:
    """M2 rebalances (one trade each) whose month has ended by `asof`."""
    hist = ((state.get("modules") or {}).get("M2") or {}).get("history") or []
    return [h for h in hist if isinstance(h, dict) and _day(h.get("date")) and period_end(h["date"][:7]) <= asof]


def period_results(run: "Run", start: str, end: str) -> dict[str, Any]:
    """NAV and returns over a period against SPY and T-bills (the monthly report's conventions)."""
    st = run.state
    marks = [m for m in st.get("marks") or [] if isinstance(m, dict) and _day(m.get("date"))]
    inside = [m for m in marks if start <= m["date"][:10] <= end]
    before = [m for m in marks if m["date"][:10] < start]
    initial = float(sum(float(v.get("start_cash", 0) or 0) for v in run.cfg.account["accounts"].values()
                        if v.get("enabled", True) is not False))
    prev = before[-1] if before else None
    last = inside[-1] if inside else prev
    first = marks[0] if marks else None
    nav = float(last["nav"]) if last else initial
    nav_prev = float(prev["nav"]) if prev else initial

    def spy_ret(a: dict | None, b: dict | None) -> float | None:
        if a and b and _num(a.get("spy_adj")) and _num(b.get("spy_adj")):
            return float(b["spy_adj"]) / float(a["spy_adj"]) - 1.0
        return None

    try:
        rf = float(run.get_tbill())
    except Exception:  # noqa: BLE001
        rf = float(run.cfg.data.get("fallback_tbill_rate", 0.0))
    created = str(st.get("created") or start)[:10]
    asof = last["date"][:10] if last else end
    days_in = _days_between(max(start, created), asof) + 1 if asof >= start else 0
    return {
        "asof": last["date"][:10] if last else None, "nav": nav, "nav_prev": nav_prev, "nav_start": initial,
        "ret_period": nav / nav_prev - 1.0 if nav_prev else None,
        "ret_since_start": nav / initial - 1.0 if initial else None,
        "spy_ret_period": spy_ret(prev or first, last), "spy_ret_since_start": spy_ret(first, last),
        "tbill_ret_period": rf * max(days_in, 0) / 365.0,
        "tbill_ret_since_start": rf * max(_days_between(created, asof), 0) / 365.0,
        "drawdown": float(last["drawdown"]) if last and _num(last.get("drawdown")) is not None else 0.0,
        "max_drawdown_period": max((float(m["drawdown"]) for m in inside if _num(m.get("drawdown")) is not None),
                                   default=None),
    }


def _alert_problems(alerts: list[dict]) -> tuple[list[dict], list[str]]:
    """Structured problems (validator and data counts) and verbatim alert messages, from a period's alerts."""
    counts = Counter(str(a.get("kind")) for a in alerts)
    probs = []
    if counts.get("validator"):
        probs.append({"kind": "validator", "n": counts["validator"]})
    if counts.get("data"):
        probs.append({"kind": "data", "n": counts["data"],
                      "notes": [str(a.get("message")) for a in alerts if a.get("kind") == "data"][:5]})
    messages = [str(a.get("message")) for a in alerts if a.get("kind") in PROBLEM_ALERTS][:8]
    return probs, messages


def monthly_gate(run: "Run", asof: str, *, fetch: Callable[[str], list[str] | None],
                 ledger_ok: bool | None = None) -> dict[str, Any]:
    """The monthly report's gate status and evidence meter (design §8 "evidence meters"; track 18 §6.3)."""
    g = gates(run.cfg)
    ev = collect(run, asof)
    gate = gate_status(run, ev, g, fetch=fetch, ledger_ok=ledger_ok)
    gate.pop("fill_gaps_to_date", None)
    month = asof[:7]
    quarter = quarter_of(month)
    return {**gate, "open_trades": open_trades(run.state), "paused_modules": paused_modules(run.state, asof),
            "next_quarterly": quarter, "quarterly_this_month": period_end(quarter) == period_end(month),
            "review_notes": ev.notes[:5]}


def quarterly_report(run: "Run", quarter: str) -> dict[str, Any]:
    """The quarterly review's facts, in `emails.render_quarterly`'s keys (design §7, §8)."""
    start_d, end_d = quarter_bounds(quarter)
    start, end = start_d.isoformat(), end_d.isoformat()
    asof = min(end, today_et().isoformat())
    g = gates(run.cfg)
    st = run.state
    inside = in_period(start, end)
    fetch = memo_fetch(run.services.fetch_comments)
    ev = collect(run, asof)
    ledger_ok, ledger_msg = run.ledger.verify()
    gate = gate_status(run, ev, g, fetch=fetch, ledger_ok=ledger_ok)
    kappa = kappa_review(run.cfg, ev, g)
    calibration = calibration_review(st, asof, g)
    drift = drift_review(run, ev, g)
    issues_q = [i for i in st.get("issues") or [] if isinstance(i, dict) and inside(i.get("date"))]
    fb_q = feedback.review(issues_q, st.get("fills") or [], fetch=fetch) if issues_q else {}
    costs = cost_review(run, ev, start, end, fb_q, g)
    reviews = module_reviews(run, ev, g)
    ramp = ramp_review(run, ev, g, gate, kappa, calibration) if gate["stage"] == "live" else None
    rows, n_open, n_close = module_activity(st, inside)
    alerts = alerts_between(st, start, end)
    problems, messages = _alert_problems(alerts)
    expected, on_time = run_punctuality(st, start, end, today_et().isoformat())
    if on_time < expected:
        problems.append({"kind": "late_runs", "late": expected - on_time, "expected": expected})
    if not ledger_ok:
        problems.append({"kind": "ledger"})
    if gate["fills_ok_to_date"] is False:
        problems.append({"kind": "fills", "median_gap_bps": gate["median_fill_gap_bps_to_date"],
                         "tolerance_bps": g["cost_tolerance_bps"]})
    for row in calibration["families"]:
        if row["gross_bias"] or row["warning"]:
            problems.append({"kind": "calibration_gross" if row["gross_bias"] else "calibration_warning",
                             "family": row["label"], "mean_p": row["mean_p"], "hit_rate": row["hit_rate"],
                             "n": row["n"]})
    for row in drift:
        if row["status"] == "drift":
            problems.append({"kind": "drift", "family": row["label"], "win_rate": row["win_rate"],
                             "base_win_rate": row["base_win_rate"], "mean_pct": row["mean_pct"],
                             "base_mean_pct": row["base_mean_pct"], "n": row["n"]})
    for p in reviews["paused"]:
        if p["date"] and start <= p["date"] <= end:
            problems.append({"kind": "kill_switch", **p})
    if reviews["m2"]["status"] in ("review", "pause"):
        problems.append({"kind": f"m2_{reviews['m2']['status']}", **{k: reviews["m2"][k] for k in (
            "drawdown", "review_drawdown", "sharpe", "pause_sharpe", "window")}})
    return {
        "review": "quarterly", "quarter": quarter, "label": f"Q{quarter[-1]} {quarter[:4]}", "start": start,
        "end": end, **period_results(run, start, end),
        "trades": rows, "trades_opened": n_open, "trades_closed": n_close,
        "shadow": shadow_activity(st, run.cfg, inside),
        "runs_expected": expected, "runs_on_time": on_time,
        **gate, "ledger_message": ledger_msg,
        "kappa": kappa, "calibration": calibration, "drift": drift, "costs": costs, "module_reviews": reviews,
        "ramp": ramp, "problems": problems, "failures": messages, "changes": [],
        "change_forward_months": g["change_forward_months"], "drift_min_signals": int(g["drift_min_signals"]),
        "ramp_half_kappa": g["ramp_half_kappa"], "notes": ev.notes[:10],
    }


def annual_report(run: "Run", year: str) -> dict[str, Any]:
    """The annual review's facts, in `emails.render_annual`'s keys (design §3 W10 and M2, §4, §8)."""
    start_d, end_d = year_bounds(year)
    start, end = start_d.isoformat(), end_d.isoformat()
    asof = min(end, today_et().isoformat())
    g = gates(run.cfg)
    st = run.state
    inside = in_period(start, end)
    fetch = memo_fetch(run.services.fetch_comments)
    ev = collect(run, asof)
    ledger_ok, ledger_msg = run.ledger.verify()
    gate = gate_status(run, ev, g, fetch=fetch, ledger_ok=ledger_ok)
    calibration = calibration_review(st, asof, g)
    reviews = module_reviews(run, ev, g)
    edge = edge_review(ev, g)
    retire = retirement_review(run, ev, g, edge, reviews["paused"])
    rows, n_open, n_close = module_activity(st, inside)
    trades_year = int(_num(((st.get("counters") or {}).get("trades") or {}).get(str(year))) or 0)
    alerts = alerts_between(st, start, end)
    cap_hits = Counter(str(a.get("kind")) for a in alerts if a.get("kind") in ("budget", "positions"))
    w10 = reviews["w10"]
    record = {}
    for h in ("60", "90"):
        units = _record_units(st, "W10", h, ev)
        rets = [u["return"] for u in units]
        record[h] = {"scored": len(rets), "mean_ret": _mean(rets),
                     "win_rate": sum(1 for r in rets if r > 0) / len(rets) if rets else None,
                     "reference": W10_RECORD_REFERENCE[h]}
    events = [e for e in ((st.get("shadow") or {}).get("W10") or {}).get("events") or [] if isinstance(e, dict)]
    ref90 = W10_RECORD_REFERENCE["90"]
    below = (record["90"]["scored"] >= int(g["drift_min_report"]) and record["90"]["mean_ret"] is not None
             and 100.0 * record["90"]["mean_ret"] < ref90["placebo_mean_pct"])
    w10_rec = "back_to_shadow" if w10["disabled"] else ("consider_shadow" if below else "keep")
    budget = int(run.cfg.risk.get("trade_budget_per_year", 0) or 0)
    problems, messages = _alert_problems(alerts)
    if not ledger_ok:
        problems.append({"kind": "ledger"})
    for p in reviews["paused"]:
        if p["date"] and start <= p["date"] <= end:
            problems.append({"kind": "kill_switch", **p})
    if reviews["m2"]["status"] in ("review", "pause"):
        problems.append({"kind": f"m2_{reviews['m2']['status']}", **{k: reviews["m2"][k] for k in (
            "drawdown", "review_drawdown", "sharpe", "pause_sharpe", "window")}})
    return {
        "review": "annual", "year": str(year), "label": str(year), "start": start, "end": end,
        **period_results(run, start, end),
        "trades": rows, "trades_opened": n_open, "trades_closed": n_close, "trades_year": trades_year,
        "budget": budget, "max_open_positions": int(run.cfg.risk.get("max_open_positions", 0) or 0),
        "budget_hits": cap_hits.get("budget", 0), "positions_hits": cap_hits.get("positions", 0),
        "hurdle_bp": g["hurdle_bp"], "trades_target_low": g["trades_target_low"],
        "trades_target_high": g["trades_target_high"], "rules_hold_since": g["rules_hold_since"],
        "change_forward_months": g["change_forward_months"],
        "calibration": calibration, "retirement": retire, "retire_min_trades": g["retire_min_trades"],
        "retire_min_months": g["retire_min_months"], "retire_edge": g["retire_edge"],
        "w10": {**w10, "events": len(events), "events_year": sum(1 for e in events if inside(e.get("signal_date"))),
                "record": record, "reference_since": W10_RECORD_REFERENCE["since"], "recommendation": w10_rec},
        "m2": reviews["m2"], "paused": reviews["paused"],
        "stage": gate["stage"], "go_live_ready": gate["go_live_ready"], "edge_p": edge["p_positive"],
        "edge_units": edge["units"], "edge_threshold": g["edge_go_live"],
        "ledger_ok": bool(ledger_ok), "ledger_message": ledger_msg,
        "problems": problems, "failures": messages, "changes": [], "notes": ev.notes[:10],
    }


# ----------------------------------------------------------------------------------------------------
# the runs
# ----------------------------------------------------------------------------------------------------

def _record_type(kind: str) -> str:
    """"quarterly_report" / "annual_report" once the ledger knows them; until then "monthly_report" (the payload's
    "review" key says which review it is)."""
    name = f"{kind}_report"
    return name if name in RECORD_TYPES else "monthly_report"


def run_quarterly(cfg: "Config", provider: Any, state_dir: Path | None = None, *, quarter: str | None = None,
                  dry_run: bool = False, force: bool = False, services: "Services | None" = None) -> "RunResult":
    """The quarterly review (default: the quarter that just ended, "YYYY-Qn")."""
    quarter = (quarter or last_quarter(today_et())).strip()
    try:
        _, end = quarter_bounds(quarter)
    except ValueError as exc:
        from .pipeline import RunError
        raise RunError(str(exc)) from None
    return _run_review(cfg, provider, state_dir, "quarterly", quarter, end, quarterly_report,
                       email_mod.render_quarterly, dry_run=dry_run, force=force, services=services)


def run_annual(cfg: "Config", provider: Any, state_dir: Path | None = None, *, year: str | None = None,
               dry_run: bool = False, force: bool = False, services: "Services | None" = None) -> "RunResult":
    """The annual review with the owner (default: the year that just ended)."""
    year = str(year or today_et().year - 1).strip()
    try:
        _, end = year_bounds(year)
    except ValueError as exc:
        from .pipeline import RunError
        raise RunError(str(exc)) from None
    return _run_review(cfg, provider, state_dir, "annual", year, end, annual_report, email_mod.render_annual,
                       dry_run=dry_run, force=force, services=services)


def _run_review(cfg: "Config", provider: Any, state_dir: Path | None, kind: str, period: str, end: date,
                build: Callable[["Run", str], dict], render: Callable[[dict, dict], Any], *, dry_run: bool,
                force: bool, services: "Services | None") -> "RunResult":
    """One review run: idempotent per (kind, period), recorded in the ledger, validated, then emailed."""
    from .pipeline import Run, RunResult

    asof = min(end, today_et()).isoformat()
    run = Run(cfg, provider, state_dir, kind, asof, dry_run=dry_run, force=force, services=services)
    run.date, run.key = period, f"{kind}:{period}"          # keyed by the period, like the monthly run
    run.result = RunResult(kind, period, "running", dry_run=dry_run)
    try:
        if not run.begin():
            return run.result
        if not dry_run:
            run.services.healthcheck("start")
        report = build(run, period)
        rec = run.log(_record_type(kind), report)
        ctx = {"mode": cfg.mode, "nav": report.get("nav"), "ledger_head": rec["hash"],
               "data_asof": report.get("asof") or asof, "sources": run.all_sources(),
               "constitution_version": cfg.version}
        email = render(report, ctx)
        errors = validator.validate(email)
        if errors:
            run.alert("validator", f"{kind} review blocked: {errors[:3]}")
            run.blocked = True
        else:
            run.outgoing.append((email, {"trade_id": f"R-{period}", "kind": kind.upper(), "expires": "9999-12-31"}))
        result = run.finish("ok", {kind: period})
        if not dry_run:
            failed = any(e.get("outcome") == "failed" for e in result.emails)
            run.services.healthcheck("fail" if run.blocked or failed else "success")
        return result
    except Exception:
        if not dry_run:
            run.services.healthcheck("fail")
        raise
    finally:
        run.close()
