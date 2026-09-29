"""Portfolio risk rules: drawdown governor, stress table, open stress and trade admission.

Design v3.2 §4 ("Stress", "Caps", "Clusters", "Drawdown governor") and track 18 (sizing_v2.py):

* Stress without a stop is notional x the instrument's worst 10-session loss. It is floored at
  `stress_floor` for any ETF; crypto uses `crypto_stress`.
* Caps: per-trade stress <= 2% of NAV; US-equity cluster <= 7% (3% for M2's legs and 4% reserved for
  M1, W10 and M4); total open stress <= 10%.
* M2 counts once, as its sleeve: its stress is capped at the worst historical book month
  (sleeve_stress_pct_nav, 4.5% of NAV at s = 0.5). Its US-equity legs still count in the cluster.
* The governor G(D) scales new entries by drawdown. It is 1 up to a 5% drawdown, falls linearly to 0.25
  at 15%, and stays at 0.25 beyond. M4 is exempt.

All stress amounts are USD. Caps are fractions of NAV.
"""
from __future__ import annotations

import math
from typing import Any

import pandas as pd

from traderec import indicators
from traderec.config import Config

STRESS_SESSIONS = 10                             # "worst 10-session loss" (design §4)
US_EQUITY_TICKERS = frozenset({"SPY", "QQQ", "VOO"})
CRYPTO_TICKERS = frozenset({"IBIT", "FBTC", "BTC-USD", "ETH-USD"})
GOVERNOR_EXEMPT = frozenset({"M4"})              # "M4 is exempt" from G(D) (design §4)
MIN_TRADE_DOLLARS = 50.0
MISSING_STRESS = 1.0                             # a ticker with no stress figure may lose 100% (fail closed)
NAV_KEY = "__nav__"


def _finite(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def governor(drawdown: float, cfg_risk: dict) -> float:
    """Drawdown governor G(D) (design §4; track 18 governor_short).

    G = 1 for D <= full_until. It falls linearly to `floor` at D = floor_at, and equals `floor` beyond.
    With the constitution's values: G(5%) = 1, G(10%) = 0.625, G(15%) = G(30%) = 0.25.

    `cfg_risk` may be the governor block (cfg.risk["governor"]) or the whole risk block (cfg.risk).
    `drawdown` is the fraction below the NAV peak. Its sign is ignored, so -0.07 and 0.07 both mean 7%.
    A NaN or None drawdown returns the floor (fail closed).
    """
    g = cfg_risk.get("governor", cfg_risk)
    full, floor_at, floor = float(g["full_until"]), float(g["floor_at"]), float(g["floor"])
    d = _finite(drawdown)
    if d is None:
        return floor
    d = abs(d)
    if d <= full:
        return 1.0
    if d >= floor_at:
        return floor
    return 1.0 - (d - full) / (floor_at - full) * (1.0 - floor)


def is_crypto(ticker: str, cfg: Config) -> bool:
    """IBIT, FBTC, "-USD" pairs, Coinbase whitelist entries and M3's ticker all count as crypto."""
    t = ticker.upper()
    if t in CRYPTO_TICKERS or t.endswith("-USD"):
        return True
    if t in {k.upper() for k in (cfg.whitelist.get("coinbase") or {})}:
        return True
    m3 = (cfg.constitution.get("modules") or {}).get("M3") or {}
    return t == str(m3.get("ticker", "")).upper()


def us_equity_tickers(cfg: Config) -> frozenset[str]:
    """SPY, QQQ and VOO, plus any M2 leg whose cluster is "us_equity"."""
    legs = ((cfg.constitution.get("modules") or {}).get("M2") or {}).get("legs") or {}
    return US_EQUITY_TICKERS | {t for t, cluster in legs.items() if cluster == "us_equity"}


def stress_table(closes: dict[str, pd.Series], cfg: Config) -> dict[str, float]:
    """Stress per unit of notional, per ticker (design §4 "Stress").

    stress = max(stress_floor, |worst 10-session return|) over the whole series. A series whose worst
    10-session return is not negative, or that is too short to have one, gets the floor. Crypto tickers
    (see `is_crypto`) get cfg.risk["crypto_stress"] whatever their history.
    """
    floor = float(cfg.risk["stress_floor"])
    crypto = float(cfg.risk["crypto_stress"])
    table: dict[str, float] = {}
    for ticker, series in closes.items():
        if is_crypto(ticker, cfg):
            table[ticker] = crypto
            continue
        worst = None if series is None else _finite(
            indicators.worst_n_session_loss(series.dropna().astype(float), STRESS_SESSIONS))
        loss = max(0.0, -worst) if worst is not None else 0.0
        table[ticker] = max(floor, loss)
    return table


def unit_stress(module: str, ticker: str, stress: dict[str, float], cfg: Config) -> float:
    """Stress per dollar of `ticker` held by `module`.

    The value comes from the stress table. A ticker missing from the table gets crypto_stress if it is
    crypto, else MISSING_STRESS (100%). A module's own `stress_loss` in the constitution is a floor: M1
    uses the S&P 500's worst 10-session loss of 32.6% (track 13 §3.4) even if SPY's own history is milder.
    """
    s = _finite(stress.get(ticker))
    if s is None:
        s = float(cfg.risk["crypto_stress"]) if is_crypto(ticker, cfg) else MISSING_STRESS
    module_floor = _finite(((cfg.constitution.get("modules") or {}).get(module) or {}).get("stress_loss"))
    if module_floor is not None:
        s = max(s, module_floor)
    return s


def _nav(values: dict) -> float:
    nav = _finite(values.get(NAV_KEY))
    if nav is None or nav <= 0.0:
        raise ValueError(f"open_stress: values must carry a positive NAV under {NAV_KEY!r}")
    return nav


def open_stress(positions: list[dict], values: dict, stress: dict, cfg: Config) -> dict:
    """Stress of the open book, in USD (design §4 "Stress", "Clusters"; §3 M2 "Stress and caps").

    `values` maps "account|ticker|module" to market value, and holds the NAV under "__nav__". Each
    position contributes |value| x `unit_stress`. Every open position needs a value, else KeyError.

    * M2 counts once, as its sleeve: min(sum of its legs' stress, sleeve_stress_pct_nav x nav).
    * us_equity is the stress of every US-equity position (see `us_equity_tickers`). That is M1's SPY plus
      M2's US-equity legs, uncapped.
    * Shadow positions (module "SHADOW:...") are hypothetical and are ignored.

    Returns {"total", "us_equity", "by_module": {module: stress}, "nav"}. `nav` is included because
    `admit` needs it to turn caps into dollars.
    """
    nav = _nav(values)
    m2_cfg = (cfg.constitution.get("modules") or {}).get("M2") or {}
    sleeve_cap = float(m2_cfg.get("sleeve_stress_pct_nav", math.inf)) * nav
    us_set = us_equity_tickers(cfg)

    by_module: dict[str, float] = {}
    m2_raw, has_m2, us_equity = 0.0, False, 0.0
    for p in positions:
        module, ticker = str(p["module"]), str(p["ticker"])
        if module.upper().startswith("SHADOW"):
            continue
        key = f"{p['account']}|{ticker}|{module}"
        if key not in values:
            raise KeyError(f"open_stress: no market value for position {key!r}")
        amount = abs(float(values[key])) * unit_stress(module, ticker, stress, cfg)
        if module == "M2":
            m2_raw += amount
            has_m2 = True
        else:
            by_module[module] = by_module.get(module, 0.0) + amount
        if ticker in us_set:
            us_equity += amount
    if has_m2:
        by_module["M2"] = min(m2_raw, sleeve_cap)
    return {"total": sum(by_module.values()), "us_equity": us_equity, "by_module": by_module, "nav": nav}


def admit(module: str, ticker: str, dollars: float, positions_stress: dict, stress: dict, cfg: Config,
          drawdown: float) -> dict:
    """Size a new entry through the governor and the stress caps (design §4 "Sizing", "Caps").

    The requested notional is scaled down, in order, by:
    1. "governor": x G(drawdown), unless the module is exempt (M4);
    2. "per_trade_stress": notional x unit stress <= per_trade_stress x nav;
    3. "us_equity_cluster" (US-equity tickers only): the trade's stress must fit in
       us_equity_cluster x nav - positions_stress["us_equity"];
    4. "total_open_stress": the trade's stress must fit in total_open_stress x nav - positions_stress["total"].

    `positions_stress` is `open_stress`'s output and must include "nav". `binding` names the last step that
    reduced the size, which is the tightest one; it is None when nothing did. ok is False when the final
    size is below $50. `dollars` is still reported then, so check `ok` before trading.

    Returns {"ok", "dollars", "binding", "notes"}.
    """
    nav = _finite(positions_stress.get("nav"))
    if nav is None or nav <= 0.0:
        raise ValueError("admit: positions_stress must include a positive 'nav' (use open_stress)")
    caps = cfg.risk["caps"]
    notes: list[str] = []
    binding: str | None = None
    amount = max(float(dollars), 0.0)

    s = unit_stress(module, ticker, stress, cfg)
    if _finite(stress.get(ticker)) is None:
        notes.append(f"no stress figure for {ticker}; assumed {s:.0%}")

    if module not in GOVERNOR_EXEMPT:
        g = governor(drawdown, cfg.risk)
        if g < 1.0 and amount > 0.0:
            amount *= g
            binding = "governor"
            d = _finite(drawdown)
            shown = f"{abs(d):.1%}" if d is not None else "unknown"
            notes.append(f"drawdown {shown}: governor G = {g:.3f}, size ${amount:,.2f}")

    limits: list[tuple[str, float]] = [("per_trade_stress", float(caps["per_trade_stress"]) * nav)]
    if ticker in us_equity_tickers(cfg):
        room = float(caps["us_equity_cluster"]) * nav - float(positions_stress.get("us_equity", 0.0))
        limits.append(("us_equity_cluster", max(room, 0.0)))
    room = float(caps["total_open_stress"]) * nav - float(positions_stress.get("total", 0.0))
    limits.append(("total_open_stress", max(room, 0.0)))

    for name, stress_room in limits:
        max_dollars = stress_room / s if s > 0.0 else math.inf
        if amount > max_dollars:
            amount = max_dollars
            binding = name
            notes.append(f"{name}: stress room ${stress_room:,.2f} at {s:.1%} stress caps the size at "
                         f"${amount:,.2f}")

    ok = amount >= MIN_TRADE_DOLLARS
    if not ok:
        notes.append(f"size ${amount:,.2f} is below the ${MIN_TRADE_DOLLARS:,.0f} minimum: no trade")
    return {"ok": ok, "dollars": amount, "binding": binding, "notes": notes}
