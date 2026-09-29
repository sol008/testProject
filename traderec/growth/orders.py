"""The Sunday order set (design v4 §3a.3-§3a.6, §4 "Rebalance bands"; track 32 §4.2). Pure functions.

Targets (per sleeve, dollars, x G) -> dollar deltas per ticker (SGOV is the "out" vehicle and the cash sleeve, so
it is the residual) -> netting per ticker (one SGOV order) -> bands ($300 minimum, the 25% relative band, a G step
>= 0.10 since the last order; a switch always) -> ranking (exits and governor cuts first, then the largest buys,
then the SGOV buy, then W10) -> the first `max_orders_per_email` (3) and the deferred list. Exits are "Sell all X"
(never a dollar sell); buys are queued for the open and may use at most `queued_cash_frac` (90%) of the cash they
will have, so an SGOV sell is added (netted, one order) when the buys need more cash than the sells raise. The SGOV
buy of idle cash may always wait a week. W10's buy is funded from SGOV, ranked last, and dropped for the week (and
logged) when the three orders are already used.
"""
from __future__ import annotations

import math
from typing import Any

import pandas as pd

from traderec.market_calendar import iso, next_trading_day

__all__ = ["build_order_set", "holiday_shift", "sleeve_targets", "CRASH_DAY_LOSS"]

# Design v4 §6 and §9: "a 1987-style day costs this book about 30% before any rule can act": the 2x legs lose 41%
# (2 x the S&P 500's -20.5%) and the Bitcoin sleeve is assumed to lose 30% on such a day (0.5 x 41% + 0.3 x 30% = 29.5%).
CRASH_DAY_LOSS = {"index_2x": 0.41, "btc": 0.30}
# The sells fill at Monday's open, not at Friday's close: the SGOV buy that sweeps their proceeds leaves this much of
# them (50 bp, slippage and a normal gap) so it is never a buy for more than the cash; the rest waits a week.
SELL_PROCEEDS_ALLOWANCE = 0.005


def _r2(x: float) -> float:
    return float(round(float(x) + 0.0, 2))


def holiday_shift(sunday: str) -> str | None:
    """The date the orders fill when Monday is an NYSE holiday (design §3a.6), else None."""
    monday = iso(next_trading_day(sunday))
    expected = iso(pd.Timestamp(sunday) + pd.Timedelta(days=1))
    return monday if monday != expected else None


def sleeve_targets(g1_in: dict[str, bool | None], g2_on: bool | None, nav_ira: float, G: float, cfg_growth: dict,
                   *, vol_factor: float = 1.0, w10_held_usd: float = 0.0, w10_buy_usd: float = 0.0,
                   g3_held_usd: float = 0.0, g3_buy_usd: float = 0.0) -> dict[str, dict]:
    """Per-ticker dollar targets (design v4 §4 "Sleeve weights", all x G) on the IRA's NAV.

    Returns {ticker: {"sleeve", "state", "weight", "target_pct" (percent of the IRA), "target_usd"}} for the G1 legs,
    G2's instrument and the cash vehicle (the residual: the G3 reserve, the 5% cash sleeve and every sleeve that is
    out, less W10's holding or its buy, less what the promoted G3 rules' slots hold or buy: `g3_held_usd`,
    `g3_buy_usd`). G2's weight is `weight x vol_factor`, capped at `max_weight`. The vehicle's `g3_reserve_usd` is
    the reserve's part still in SGOV (the reserve less the slots) and `g3_slots_usd` the slots.
    """
    sl = cfg_growth.get("sleeves") or {}
    vehicle = ((sl.get("cash") or {}).get("vehicle")) or "SGOV"
    out: dict[str, dict] = {}
    risk_total = 0.0
    for leg, spec in ((sl.get("G1") or {}).get("legs") or {}).items():
        state = g1_in.get(leg)
        w = float(spec.get("weight", 0.0)) * float(G)
        usd = w * nav_ira if state else 0.0
        out[leg] = {"sleeve": "G1", "state": "in" if state else "out", "weight": w, "target_pct": 100.0 * w if state else 0.0,
                    "target_usd": _r2(usd), "index": spec.get("index")}
        risk_total += usd
    g2 = sl.get("G2") or {}
    if g2.get("instrument"):
        w = min(float(g2.get("weight", 0.0)) * float(vol_factor), float(g2.get("max_weight", 1.0))) * float(G)
        usd = w * nav_ira if g2_on else 0.0
        out[g2["instrument"]] = {"sleeve": "G2", "state": "on" if g2_on else "off", "weight": w,
                                 "target_pct": 100.0 * w if g2_on else 0.0, "target_usd": _r2(usd)}
        risk_total += usd
    slots = float(g3_held_usd) + float(g3_buy_usd)
    residual = max(nav_ira - risk_total - float(w10_held_usd) - float(w10_buy_usd) - slots, 0.0)
    reserve_w = float((sl.get("G3") or {}).get("reserve_weight", 0.0)) * float(G)
    out[vehicle] = {"sleeve": "SGOV", "state": "reserve", "weight": residual / nav_ira if nav_ira else 0.0,
                    "target_pct": 100.0 * residual / nav_ira if nav_ira else 0.0, "target_usd": _r2(residual),
                    "g3_reserve_usd": _r2(max(reserve_w * nav_ira - slots, 0.0)), "g3_slots_usd": _r2(slots),
                    "cash_sleeve_usd": _r2(float((sl.get("cash") or {}).get("weight", 0.0)) * float(G) * nav_ira)}
    return out


def _order(action: str, ticker: str, usd: float, *, sleeve: str, module: str, reason: str,
           held_usd: float = 0.0) -> dict[str, Any]:
    return {"action": action, "ticker": ticker, "usd": _r2(usd), "held_usd": _r2(held_usd), "sleeve": sleeve,
            "module": module, "reason": reason, "step": 1 if action != "buy" else 2, "rank": None,
            "cash_cap_usd": None}


def build_order_set(targets: dict[str, dict], held: dict[str, float], cash: float, *, G: float,
                    G_last_order: float | None, cfg_growth: dict, paused: bool = False,
                    w10: dict | None = None, modules: dict[str, str] | None = None,
                    g3: dict | None = None) -> dict[str, Any]:
    """Targets and holdings -> the ranked orders to send, the deferred list and what was skipped or dropped.

    `targets` is `sleeve_targets`' output; `held` maps ticker -> the book's holding at Friday's close (the cash
    vehicle included); `cash` is the IRA's settled cash. `w10` is {"buy_usd", "trade_id", ...} when the W10 signal
    fired this week (funded from SGOV, ranked last). `modules` maps ticker -> the lot/order module name. `g3` is
    the promoted gems rules' week ({"buys": [{"ticker", "usd", "rule", "slot_id"}], "sells": [{"ticker",
    "held_usd", "rule", "slot_id", "reason"}]}, design v4 §3 G3): an exit is a "Sell all" in Step 1 with the other
    sells, an entry a buy ranked after the G1/G2 buys and before the SGOV sweep and W10, from the reserve's cash.
    Returns {"orders", "deferred", "skipped", "dropped", "sgov_sell_usd", "sgov_buy_usd", "cash_after_usd",
    "g_step"}; each order is {"action": "sell_all" | "sell" | "buy", "ticker", "usd", "held_usd", "sleeve",
    "module", "reason", "step", "rank", "cash_cap_usd"} (a G3 order also carries "rule" and "slot_id").
    """
    reb = cfg_growth.get("rebalance") or {}
    min_usd = float(reb.get("min_order_usd", 300))
    band_rel = float(reb.get("band_rel", 0.25))
    max_orders = int(reb.get("max_orders_per_email", 3))
    queued = float(reb.get("queued_cash_frac", 0.90))
    min_step = float((cfg_growth.get("governor") or {}).get("min_step", 0.10))
    vehicle = (((cfg_growth.get("sleeves") or {}).get("cash") or {}).get("vehicle")) or "SGOV"
    modules = modules or {}
    g_step = abs(float(G) - float(G_last_order)) if G_last_order is not None else 0.0
    cut = G_last_order is not None and float(G) < float(G_last_order) - 1e-12

    sells: list[dict] = []
    buys: list[dict] = []
    skipped: list[dict] = []
    for ticker, tg in targets.items():
        if ticker == vehicle or tg.get("sleeve") == "W10":
            continue
        target, have = float(tg.get("target_usd") or 0.0), float(held.get(ticker) or 0.0)
        module = modules.get(ticker, tg.get("sleeve", "GROWTH"))
        if have <= 0.0 and target <= 0.0:
            continue
        if target <= 0.0:                                   # an exit: "Sell all", the band never applies
            sells.append(_order("sell_all", ticker, have, sleeve=tg["sleeve"], module=module, held_usd=have,
                                reason="hard_stop" if paused else "switch_off"))
            continue
        if have <= 0.0:                                     # an entry: a switch, the band never applies
            if paused:
                skipped.append({"ticker": ticker, "usd": target, "reason": "paused: buys blocked after the hard stop"})
            elif target < min_usd:
                skipped.append({"ticker": ticker, "usd": target, "reason": f"below the ${min_usd:,.0f} minimum"})
            else:
                buys.append(_order("buy", ticker, target, sleeve=tg["sleeve"], module=module, reason="switch_on"))
            continue
        delta = target - have
        rel = abs(delta) / target
        if abs(delta) < min_usd:
            skipped.append({"ticker": ticker, "usd": delta, "reason": f"below the ${min_usd:,.0f} minimum",
                            "band": band_rel * target})
        elif rel < band_rel and g_step < min_step:
            skipped.append({"ticker": ticker, "usd": delta, "band": band_rel * target,
                            "reason": f"inside the {band_rel:.0%} band and G moved {g_step:.2f} < {min_step:.2f}"})
        elif delta < 0:
            sells.append(_order("sell", ticker, -delta, sleeve=tg["sleeve"], module=module, held_usd=have,
                                reason="governor_cut" if (cut or paused) else "rebalance"))
        elif paused:
            skipped.append({"ticker": ticker, "usd": delta, "reason": "paused: buys blocked after the hard stop"})
        else:
            buys.append(_order("buy", ticker, delta, sleeve=tg["sleeve"], module=module, held_usd=have,
                               reason="governor_restore" if g_step >= min_step else "rebalance"))

    # the promoted gems rules (design v4 §3 G3): exits with the sells, entries after the G1/G2 buys
    g3 = g3 or {}
    g3_buys: list[dict] = []
    for s in g3.get("sells") or []:
        t = str(s["ticker"])
        o = _order("sell_all", t, float(s.get("held_usd") or 0.0), sleeve="G3", module=modules.get(t, "G3"),
                   held_usd=float(s.get("held_usd") or 0.0), reason=str(s.get("reason") or "g3_exit"))
        o.update(rule=s.get("rule"), slot_id=s.get("slot_id"))
        sells.append(o)
    for b in g3.get("buys") or []:
        t, usd = str(b["ticker"]), float(b.get("usd") or 0.0)
        if paused:
            skipped.append({"ticker": t, "usd": usd, "reason": "paused: buys blocked after the hard stop"})
        elif usd < min_usd:
            skipped.append({"ticker": t, "usd": usd, "reason": f"below the ${min_usd:,.0f} minimum"})
        else:
            o = _order("buy", t, usd, sleeve="G3", module=modules.get(t, "G3"), reason="g3_entry")
            o.update(rule=b.get("rule"), slot_id=b.get("slot_id"))
            g3_buys.append(o)

    # ranking: exits and cuts first (largest first), then the largest buys, then the gems entries (the widest
    # discount first, as given), then the SGOV buy, then W10
    sells.sort(key=lambda o: -o["usd"])
    buys.sort(key=lambda o: -o["usd"])
    buys += g3_buys
    w10_order = None
    if w10 and float(w10.get("buy_usd") or 0.0) >= min_usd and not paused:
        w10_order = _order("buy", w10.get("ticker", "SPY"), float(w10["buy_usd"]), sleeve="W10",
                           module=w10.get("module", "W10"), reason="w10_entry")

    step1: list[dict] = []
    chosen: list[dict] = []
    deferred: list[dict] = []
    dropped: list[dict] = []
    slots = max_orders
    cash_avail = float(cash)                                # the cash after Step 1 (the sells)
    committed = 0.0                                         # the cash the queued buys reserve: sum(usd / 0.90)
    spent = 0.0
    proceeds = 0.0
    sgov_avail = float(held.get(vehicle) or 0.0)
    sgov_sell = 0.0
    sgov_slot = False
    for s in sells:
        if slots > 0:
            step1.append(s)
            slots -= 1
            cash_avail += s["usd"]
            proceeds += s["usd"]
        else:
            deferred.append(dict(s, why="the 3 orders are used"))
    for b in buys + ([w10_order] if w10_order else []):
        need = b["usd"] / queued                            # the cash a queued buy must see (the 90% rule)
        is_w10 = b["sleeve"] == "W10"
        free = cash_avail - committed
        if free + 1e-9 >= need:
            if slots > 0:
                b["cash_cap_usd"] = _r2(free * queued)
                chosen.append(b)
                slots -= 1
                committed += need
                spent += b["usd"]
            else:
                (dropped if is_w10 else deferred).append(dict(b, why="the 3 orders are used"))
            continue
        shortfall = need - free
        left = sgov_avail - sgov_sell
        if left + 1e-9 >= shortfall:                        # the SGOV sale that funds it (netted into one order)
            extra = 0 if sgov_slot else 1
            if slots >= 1 + extra:
                sgov_sell += shortfall
                sgov_slot = True
                cash_avail += shortfall
                b["cash_cap_usd"] = _r2((cash_avail - committed) * queued)
                chosen.append(b)
                slots -= 1 + extra
                committed += need
                spent += b["usd"]
            else:
                (dropped if is_w10 else deferred).append(dict(b, why="the 3 orders are used (an SGOV sale is needed)"))
        else:
            (dropped if is_w10 else deferred).append(dict(b, why=f"insufficient cash: ${free + left:,.0f} "
                                                                f"available against ${need:,.0f} needed"))
    if sgov_sell > 0:
        sgov_sell = math.ceil(sgov_sell * 100.0) / 100.0
        step1.append(_order("sell", vehicle, sgov_sell, sleeve="SGOV", module=modules.get(vehicle, "GROWTH"),
                            held_usd=sgov_avail, reason="fund_buys"))
    # what is left once the buys fill: the sells' proceeds less the allowance for their fills at Monday's open
    cash_avail -= spent + proceeds * SELL_PROCEEDS_ALLOWANCE
    # the residual cash: the SGOV buy, lowest priority but W10; it may always wait a week
    sgov_buy = 0.0
    sgov_target = float((targets.get(vehicle) or {}).get("target_usd") or 0.0)
    sgov_after = sgov_avail - sgov_sell
    if cash_avail >= min_usd and (sgov_after <= 0.0 or cash_avail >= band_rel * max(sgov_target, 1.0)
                                  or g_step >= min_step):
        sgov_buy = math.floor(cash_avail * 100.0) / 100.0
        b = _order("buy", vehicle, sgov_buy, sleeve="SGOV", module=modules.get(vehicle, "GROWTH"),
                   held_usd=sgov_avail, reason="idle_cash_to_sgov")
        b["cash_cap_usd"] = _r2(cash_avail)
        if slots > 0:
            chosen.append(b)
            slots -= 1
            cash_avail -= sgov_buy
        else:
            deferred.append(dict(b, why="the 3 orders are used; the SGOV buy of idle cash may wait a week"))
    # the listing: Step 1 (exits and cuts, largest first, then the SGOV sale), Step 2 in sleeve order (the G1 legs,
    # G2, the gems entries, W10), then the SGOV buy of the idle cash last; the size ranking above decided the
    # three-order cut. The sweep goes last because it is sized at the cash left after every other buy: placed (and
    # queued) before W10 it took W10's cash and the 90% cap cancelled W10's buy at Monday's open (the Phase C3
    # replay, docs/phase-c/replay.md). A gems ticker is not in `targets`, so it lists after the sleeves' buys.
    listing = {t: k for k, t in enumerate(targets)}
    chosen.sort(key=lambda o: (o["reason"] == "idle_cash_to_sgov", o["sleeve"] == "W10",
                               listing.get(o["ticker"], len(listing))))
    orders = step1 + chosen
    for k, o in enumerate(orders, start=1):
        o["rank"] = k
    return {"orders": orders, "deferred": deferred, "skipped": skipped, "dropped": dropped,
            "sgov_sell_usd": _r2(sgov_sell), "sgov_buy_usd": _r2(sgov_buy), "cash_after_usd": _r2(cash_avail),
            "g_step": g_step, "max_orders": max_orders, "queued_cash_frac": queued}
