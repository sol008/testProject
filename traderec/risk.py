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

Phase B premium trades (docs/PHASE_B_CONTRACTS.md §7; design v3.3 §4): a defined-risk option spread's stress is
its premium. `admit_premium` applies the per-trade premium cap (3%), the option premium total (10%), the
macro-factor budget (3% premium per factor), the trade's cluster (7% US equity; 6% for the others) and the total
open stress (10%). `open_stress(..., spreads=..., pending=...)` counts open spreads at max(cost, current value) and
pending buys as if filled. The premium caps are read from `risk.caps` when present (per_trade_premium,
option_premium, factor_premium, other_cluster), else PREMIUM_CAPS below, the design's values.

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
CLUSTER_PRIORITY = frozenset({"M1"})             # admitted first, never blocked by the US-equity reserve (v3.3 §4)
MIN_TRADE_DOLLARS = 50.0
MISSING_STRESS = 1.0                             # a ticker with no stress figure may lose 100% (fail closed)
NAV_KEY = "__nav__"
# Premium caps (design v3.3 §4 "Caps"), used when `risk.caps` does not set them.
PREMIUM_CAPS = {"per_trade_premium": 0.03, "option_premium": 0.10, "factor_premium": 0.03, "other_cluster": 0.06}
OPTION_MULTIPLIER = 100
INDEX_OPTION_ROOTS = frozenset({"XSP", "SPX", "SPXW"})           # S&P 500 index options: the US-equity cluster
# The cluster of a module's spreads (contract §7): M4 -> US equity; W8's and W9's spreads are one "peace/oil-down"
# factor in 2026 (design §4), DAL and SPY legs included. Other spreads take their root's cluster.
SPREAD_CLUSTERS = {"M4": "us_equity", "W8": "oil", "W9": "oil"}


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


def ticker_cluster(ticker: str, cfg: Config) -> str:
    """The cluster of a ticker or option root (design §4 "Clusters"): "us_equity" for SPY/QQQ/VOO, S&P 500 index
    options and M2's US-equity legs; "crypto" for crypto; M2's leg map for its other legs; else "other"."""
    t = str(ticker).upper()
    if t in us_equity_tickers(cfg) or t in INDEX_OPTION_ROOTS:
        return "us_equity"
    if is_crypto(t, cfg):
        return "crypto"
    legs = ((cfg.constitution.get("modules") or {}).get("M2") or {}).get("legs") or {}
    return str(legs.get(t) or "other")


def spread_cluster(module: str, root: str, cfg: Config) -> str:
    """The cluster (and macro factor) of an option spread: the module's (M4 -> us_equity, W8/W9 -> oil), else the
    root's."""
    return SPREAD_CLUSTERS.get(str(module)) or ticker_cluster(str(root or ""), cfg)


def premium_caps(cfg: Config) -> dict[str, float]:
    """The premium caps as fractions of NAV: `risk.caps` overrides PREMIUM_CAPS key by key."""
    caps = cfg.risk.get("caps") or {}
    return {k: float(caps.get(k, v)) for k, v in PREMIUM_CAPS.items()}


def _multiplier(cfg: Config) -> int:
    return int(((cfg.constitution.get("fills") or {}).get("options") or {}).get("multiplier", OPTION_MULTIPLIER))


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


def open_stress(positions: list[dict], values: dict, stress: dict, cfg: Config, *,
                spreads: list[dict] | None = None, pending: list[Any] | None = None) -> dict:
    """Stress of the open book, in USD (design §4 "Stress", "Clusters"; §3 M2 "Stress and caps").

    `values` maps "account|ticker|module" to market value, and holds the NAV under "__nav__". Each
    position contributes |value| x `unit_stress`. Every open position needs a value, else KeyError.

    * M2 counts once, as its sleeve: min(sum of its legs' stress, sleeve_stress_pct_nav x nav).
    * us_equity is the stress of every US-equity position (see `us_equity_tickers`). That is M1's SPY plus
      M2's US-equity legs, uncapped.
    * Shadow positions (module "SHADOW:...") are hypothetical and are ignored.

    Returns {"total", "us_equity", "by_module": {module: stress}, "nav"}. `nav` is included because
    `admit` needs it to turn caps into dollars.

    Phase B (docs/PHASE_B_CONTRACTS.md §7), when `spreads` or `pending` is given (an empty list counts):

    * each open spread (`PaperBroker.spreads()` rows: "module", "root", "contracts", "cost" in USD, "mark" per
      share, or "entry_price") counts at max(cost, current value), with value = mark x contracts x multiplier,
      in its module, its cluster (`spread_cluster`) and the option premium; a spread with neither raises
      ValueError;
    * each pending buy (an OrderIntent or its dict) counts as if it filled tonight: a spread order at its stated
      maximum debit (max_price x contracts x multiplier), an ETF order at dollars x `unit_stress`. Sells, M2's
      rebalance orders (sized by M2's own caps) and shadow orders are left out;
    * the result also has "by_cluster" {cluster: stress} (lots, spreads and pending buys; M2's legs uncapped, as
      in us_equity), "premium" (open and pending option premium), "premium_by_cluster" and "pending" (the
      pending buys' stress, already inside the totals).
    """
    nav = _nav(values)
    m2_cfg = (cfg.constitution.get("modules") or {}).get("M2") or {}
    sleeve_cap = float(m2_cfg.get("sleeve_stress_pct_nav", math.inf)) * nav
    us_set = us_equity_tickers(cfg)

    by_module: dict[str, float] = {}
    lots: list[tuple[str, float]] = []                     # (ticker, stress) for the Phase B clusters
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
        lots.append((ticker, amount))
    if has_m2:
        by_module["M2"] = min(m2_raw, sleeve_cap)
    if spreads is None and pending is None:
        return {"total": sum(by_module.values()), "us_equity": us_equity, "by_module": by_module, "nav": nav}

    by_cluster: dict[str, float] = {}
    for ticker, amount in lots:
        cluster = ticker_cluster(ticker, cfg)
        by_cluster[cluster] = by_cluster.get(cluster, 0.0) + amount
    mult = _multiplier(cfg)
    premium, premium_by_cluster, pending_total = 0.0, {}, 0.0
    extra: list[tuple[str, str, float, bool]] = []          # (module, cluster, stress, is option premium)
    for s in spreads or []:
        module = str(s.get("module") or "")
        if module.upper().startswith("SHADOW"):
            continue
        extra.append((module, spread_cluster(module, str(s.get("root") or ""), cfg), _spread_stress(s, mult), True))
    for o in pending or []:
        d = o.to_dict() if hasattr(o, "to_dict") else dict(o)
        module = str(d.get("module") or "")
        if d.get("side") != "buy" or module == "M2" or module.upper().startswith("SHADOW"):
            continue
        ticker = str(d.get("ticker") or "")
        if d.get("order_type") == "spread_limit":
            price = _finite(d.get("max_price"))
            price = price if price is not None else _finite(d.get("limit_price"))
            amount = abs(price or 0.0) * int(d.get("contracts") or 0) * mult
            extra.append((module, spread_cluster(module, ticker, cfg), amount, True))
        else:
            amount = abs(_finite(d.get("dollars")) or 0.0) * unit_stress(module, ticker, stress, cfg)
            extra.append((module, ticker_cluster(ticker, cfg), amount, False))
        pending_total += amount
    for module, cluster, amount, is_premium in extra:
        by_module[module] = by_module.get(module, 0.0) + amount
        by_cluster[cluster] = by_cluster.get(cluster, 0.0) + amount
        if cluster == "us_equity":
            us_equity += amount
        if is_premium:
            premium += amount
            premium_by_cluster[cluster] = premium_by_cluster.get(cluster, 0.0) + amount
    return {"total": sum(by_module.values()), "us_equity": us_equity, "by_module": by_module, "nav": nav,
            "by_cluster": by_cluster, "premium": premium, "premium_by_cluster": premium_by_cluster,
            "pending": pending_total}


def _spread_stress(spread: dict, multiplier: int) -> float:
    """An open spread's stress: max(cost, current value) in USD (a long premium position can lose all of it)."""
    contracts = _finite(spread.get("contracts"))
    cost = _finite(spread.get("cost"))
    entry = _finite(spread.get("entry_price"))
    if cost is None and entry is not None and contracts is not None:
        cost = abs(entry) * contracts * multiplier
    mark = _finite(spread.get("mark"))
    value = _finite(spread.get("value"))
    if value is None and mark is not None and contracts is not None:
        value = abs(mark) * contracts * multiplier
    known = [abs(v) for v in (cost, value) if v is not None]
    if not known:
        raise ValueError(f"open_stress: spread {spread.get('key') or spread.get('trade_id')!r} has no cost or value")
    return max(known)


def admit(module: str, ticker: str, dollars: float, positions_stress: dict, stress: dict, cfg: Config,
          drawdown: float) -> dict:
    """Size a new entry through the governor and the stress caps (design §4 "Sizing", "Caps").

    The requested notional is scaled down, in order, by:
    1. "governor": x G(drawdown), unless the module is exempt (M4);
    2. "per_trade_stress": notional x unit stress <= per_trade_stress x nav;
    3. "us_equity_cluster" (US-equity tickers only): the trade's stress must fit in
       us_equity_cluster x nav - positions_stress["us_equity"]. M1 has priority (design v3.3 §4): it is never cut
       by this step; any excess is reported as "cluster_overflow" (stress USD) so the pipeline can act on the open
       W10. A module with `cluster_min_fraction` in its config (W10) is skipped when this step leaves less than
       that fraction of its governed size;
    4. "total_open_stress": the trade's stress must fit in total_open_stress x nav - positions_stress["total"].

    `positions_stress` is `open_stress`'s output and must include "nav". `binding` names the last step that
    reduced the size, which is the tightest one; it is None when nothing did. ok is False when the final
    size is below $50. `dollars` is still reported then, so check `ok` before trading.

    Returns {"ok", "dollars", "binding", "notes", "cluster_overflow"}.
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

    governed = amount
    overflow = 0.0
    limits: list[tuple[str, float]] = [("per_trade_stress", float(caps["per_trade_stress"]) * nav)]
    if ticker in us_equity_tickers(cfg):
        room = float(caps["us_equity_cluster"]) * nav - float(positions_stress.get("us_equity", 0.0))
        if module in CLUSTER_PRIORITY:
            overflow = max(min(governed, float(caps["per_trade_stress"]) * nav / s if s > 0 else governed) * s
                           - max(room, 0.0), 0.0)
            if overflow > 0.0:
                notes.append(f"us_equity_cluster: {module} has priority and is not cut; the reserve is exceeded "
                             f"by ${overflow:,.2f} of stress")
        else:
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
    min_frac = _finite(((cfg.constitution.get("modules") or {}).get(module) or {}).get("cluster_min_fraction"))
    if ok and min_frac and binding == "us_equity_cluster" and governed > 0 and amount < min_frac * governed:
        ok = False
        notes.append(f"us_equity_cluster: the reserve leaves {amount / governed:.0%} of the size, under "
                     f"{min_frac:.0%}: skipped")
    return {"ok": ok, "dollars": amount, "binding": binding, "notes": notes, "cluster_overflow": overflow}


def admit_premium(module: str, root: str, premium_usd: float, cluster: str, positions_stress: dict, cfg: Config,
                  drawdown: float, *, exempt_governor: bool = False, min_premium_usd: float = 0.0) -> dict:
    """Admission for a defined-risk option trade whose stress is its premium (docs/PHASE_B_CONTRACTS.md §7).

    Design v3.3 §4: stress = premium. The requested premium is scaled down, in order, by:
    1. "governor": x G(drawdown), unless `exempt_governor` or the module is exempt (M4);
    2. "per_trade_premium": premium <= 3% of NAV;
    3. "option_premium": open option premium + premium <= 10% of NAV;
    4. "factor_premium": the macro-factor budget, option premium in `cluster` + premium <= 3% of NAV;
    5. the cluster: "us_equity_cluster" (7% of NAV, M2's legs <= 3% plus the 4% reserve of M1, W10 and M4, where W10
       and M4 are first come, first served: a later signal takes the room left) or "<cluster>_cluster" (6%);
    6. "total_open_stress": total open stress + premium <= 10% of NAV.

    `positions_stress` must come from `open_stress(..., spreads=..., pending=...)`: it needs "nav" and "premium",
    else ValueError (open option premium unknown: fail closed). An empty `cluster` means `spread_cluster(module,
    root)`. `binding` names the last step that cut the size. ok is False when the allowed premium is 0 or below
    `min_premium_usd` (one contract): the trade is skipped, never rounded up. Returns {"ok", "premium_usd"
    (allowed), "binding", "notes", "cluster_overflow"} (no premium trade has cluster priority, so the overflow is
    always 0.0).
    """
    cluster = cluster or spread_cluster(module, root, cfg)
    nav = _finite(positions_stress.get("nav"))
    if nav is None or nav <= 0.0:
        raise ValueError("admit_premium: positions_stress must include a positive 'nav' (use open_stress)")
    if _finite(positions_stress.get("premium")) is None:
        raise ValueError("admit_premium: positions_stress must count open spreads (open_stress(..., spreads=...))")
    caps = cfg.risk["caps"]
    pcaps = premium_caps(cfg)
    notes: list[str] = []
    binding: str | None = None
    amount = max(_finite(premium_usd) or 0.0, 0.0)
    if module not in GOVERNOR_EXEMPT and not exempt_governor:
        g = governor(drawdown, cfg.risk)
        if g < 1.0 and amount > 0.0:
            amount *= g
            binding = "governor"
            d = _finite(drawdown)
            shown = f"{abs(d):.1%}" if d is not None else "unknown"
            notes.append(f"drawdown {shown}: governor G = {g:.3f}, premium ${amount:,.2f}")

    by_cluster = positions_stress.get("by_cluster") or {}
    premium_by_cluster = positions_stress.get("premium_by_cluster") or {}
    if cluster == "us_equity":
        cluster_room = ("us_equity_cluster",
                        float(caps["us_equity_cluster"]) * nav - float(positions_stress.get("us_equity", 0.0)))
    else:
        cluster_room = (f"{cluster}_cluster", pcaps["other_cluster"] * nav - float(by_cluster.get(cluster, 0.0)))
    limits = [
        ("per_trade_premium", pcaps["per_trade_premium"] * nav),
        ("option_premium", pcaps["option_premium"] * nav - float(positions_stress["premium"])),
        ("factor_premium", pcaps["factor_premium"] * nav - float(premium_by_cluster.get(cluster, 0.0))),
        cluster_room,
        ("total_open_stress", float(caps["total_open_stress"]) * nav - float(positions_stress.get("total", 0.0))),
    ]
    for name, room in limits:
        room = max(room, 0.0)
        if amount > room:
            amount = room
            binding = name
            notes.append(f"{name}: room ${room:,.2f} caps the premium at ${amount:,.2f}")

    floor = max(_finite(min_premium_usd) or 0.0, 0.0)
    ok = amount > 0.0 and amount + 1e-9 >= floor
    if not ok:
        where = f" ({binding})" if binding else ""
        notes.append(f"premium ${amount:,.2f}{where} is under one contract (${floor:,.2f}): skipped" if floor > 0
                     else f"no premium room{where}: skipped")
    return {"ok": ok, "premium_usd": amount, "binding": binding, "notes": notes, "cluster_overflow": 0.0}

