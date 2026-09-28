"""Paper-trading protocol: conservative fill simulator, immutable records, optimism checks and the
pass/fail rule's operating characteristics (track 18, section 5).

Parts
-----
1. FillModel      - deterministic, versioned fill rules per instrument (stocks/ETFs, options, futures,
                    crypto).  Conservative by construction: next-open fills plus slippage, limit orders
                    only on a trade-THROUGH, stop-first when stop and target are touched the same day,
                    options at mid +/- phi x half-spread and never beyond the displayed size.
2. ledger_demo    - paper recommendations, forecasts, fills and resolutions written to track 10's
                    hash-chained ledger; tamper test.
3. limit_adverse_selection - empirical: buy-limit orders placed below the close fill mostly when the
                    price keeps falling; "touch = fill" paper rules overstate results.
4. oc_simulation  - probability that the pre-registered pass rule says "go live" by month 3/6/9/12,
                    as a function of the true edge and the trade rate.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd
from scipy import stats

import trade_model as tm
from util18 import SCRATCH, SEED, import_track10, load_daily, save_table

FILL_MODEL_VERSION = "fill-v1.0"


# ----------------------------------------------------------------------------------------------
# 1. Fill model
# ----------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class FillModel:
    version: str = FILL_MODEL_VERSION
    # stocks / ETFs (bps of price)
    open_slip_bps: dict = None            # by liquidity tier, applied to market/MOO fills at the open
    stop_slip_bps: float = 10.0           # extra adverse slippage on stop-market fills
    limit_through_ticks: int = 1          # a limit fills only if the price trades through it
    tick: float = 0.01
    max_participation: float = 0.01       # at most 1% of the day's volume
    # options
    option_phi: float = 0.6               # fraction of the half-spread paid (M&P 2020: 0.58 all traders)
    option_max_spread_frac: float = 0.10  # refuse to fill if (ask-bid)/mid > 10%
    option_commission: float = 0.65       # $ per contract, [unverified] typical retail
    # futures
    fut_ticks_market: int = 1
    fut_ticks_stop: int = 2
    fut_commission: float = 1.25          # $ per micro contract per side incl. exchange fees [unverified]
    # crypto (direct, taker)
    crypto_fee_bps: float = 38.0          # Kraken Pro $10k+ tier taker 0.38% (fee schedule, 2026-09-28)
    crypto_half_spread_bps: float = 2.0
    crypto_slip_bps: float = 5.0

    def slip(self, tier):
        table = self.open_slip_bps or {"etf": 3.0, "large_cap": 5.0, "mid_cap": 12.0, "small_cap": 25.0}
        return table[tier] / 1e4


FM = FillModel()


def fill_equity_entry(side, qty, bar, order_type="limit", limit=None, band=None, tier="etf", fm=FM):
    """Next-session entry for a stock/ETF.  side +1 buy / -1 sell-short.  bar: dict O,H,L,C,V.
    Returns (filled_qty, price, note)."""
    o, h, l, v = bar["O"], bar["H"], bar["L"], bar.get("V", np.inf)
    if band is not None and not (band[0] <= o <= band[1]):
        return 0, None, "skipped: open outside entry band"
    q = int(min(qty, np.floor(fm.max_participation * v))) if np.isfinite(v) else qty
    if q <= 0:
        return 0, None, "no fill: size above participation cap"
    s = fm.slip(tier)
    if order_type == "market_open":
        return q, o * (1 + side * s), "filled at open + slippage"
    if order_type == "limit":
        if side > 0:
            if o <= limit:
                return q, min(o * (1 + s), limit), "filled at open (below limit)"
            if l <= limit - fm.limit_through_ticks * fm.tick:
                return q, limit, "filled at limit (traded through)"
        else:
            if o >= limit:
                return q, max(o * (1 - s), limit), "filled at open (above limit)"
            if h >= limit + fm.limit_through_ticks * fm.tick:
                return q, limit, "filled at limit (traded through)"
        return 0, None, "no fill: limit not traded through"
    raise ValueError(order_type)


def fill_equity_exit(side, stop, target, bar, fm=FM):
    """Exit check for an open position with a protective stop and a take-profit limit (OCO).
    side +1 long / -1 short.  Stop is checked FIRST when both are touched in the same bar."""
    o, h, l = bar["O"], bar["H"], bar["L"]
    sst = fm.stop_slip_bps / 1e4
    if side > 0:
        if o <= stop:
            return o * (1 - sst), "stop: gapped through at the open"
        if l <= stop:
            return stop * (1 - sst), "stop: hit intraday"
        if target is not None and o >= target:
            return o, "target: gapped above (limit fills at the better open)"
        if target is not None and h >= target + fm.limit_through_ticks * fm.tick:
            return target, "target: traded through"
    else:
        if o >= stop:
            return o * (1 + sst), "stop: gapped through at the open"
        if h >= stop:
            return stop * (1 + sst), "stop: hit intraday"
        if target is not None and o <= target:
            return o, "target: gapped below"
        if target is not None and l <= target - fm.limit_through_ticks * fm.tick:
            return target, "target: traded through"
    return None, "open"


def fill_option(side, qty, quote, limit=None, fm=FM):
    """quote: dict bid, ask, bid_size, ask_size (contracts), from a delayed snapshot taken >= 30 min
    after the open.  Buys fill at mid + phi*half-spread, never above `limit`, never more than the
    displayed size; the remainder is unfilled (re-tried at the next snapshot)."""
    bid, ask = quote["bid"], quote["ask"]
    if bid <= 0 or ask <= bid:
        return 0, None, 0.0, "no fill: no two-sided market"
    mid = 0.5 * (bid + ask); half = 0.5 * (ask - bid)
    if (ask - bid) / mid > fm.option_max_spread_frac:
        return 0, None, 0.0, "no fill: spread too wide"
    px = mid + side * fm.option_phi * half
    if limit is not None and ((side > 0 and px > limit) or (side < 0 and px < limit)):
        return 0, None, 0.0, "no fill: model price beyond limit"
    size = quote["ask_size"] if side > 0 else quote["bid_size"]
    q = int(min(qty, size))
    return q, round(px, 2), q * fm.option_commission, ("filled" if q == qty else f"partial: {q}/{qty}")


def fill_future(side, bar, tick, order="market_open", stop=None, fm=FM):
    """Futures: market at the session open +/- ticks; stops fill at the worse of stop and open,
    +/- stop ticks."""
    if order == "market_open":
        return bar["O"] + side * fm.fut_ticks_market * tick, fm.fut_commission
    if order == "stop":  # protective stop for a position with direction `side` (exit is -side)
        trig = (bar["L"] <= stop) if side > 0 else (bar["H"] >= stop)
        if not trig:
            return None, 0.0
        base = min(stop, bar["O"]) if side > 0 else max(stop, bar["O"])
        return base - side * fm.fut_ticks_stop * tick, fm.fut_commission
    raise ValueError(order)


def fill_crypto(side, notional, price, fm=FM):
    px = price * (1 + side * (fm.crypto_half_spread_bps + fm.crypto_slip_bps) / 1e4)
    fee = abs(notional) * fm.crypto_fee_bps / 1e4
    return px, fee


def fill_selftest():
    rows = []
    bar = dict(O=100.0, H=101.0, L=98.9, C=99.5, V=1e6)
    rows.append(("Buy limit 99.00, low 98.90 (traded through)", fill_equity_entry(+1, 100, bar, "limit", 99.0)))
    rows.append(("Buy limit 98.90, low 98.90 (touch only)", fill_equity_entry(+1, 100, bar, "limit", 98.90)))
    rows.append(("Buy, open outside band", fill_equity_entry(+1, 100, bar, "limit", 101, band=(95, 99.5))))
    rows.append(("Long stop 99.5 / target 101, both touched", fill_equity_exit(+1, 99.5, 101.0, bar)))
    rows.append(("Long stop 101.5, gap below", fill_equity_exit(+1, 101.5, 110.0, bar)))
    q = dict(bid=2.00, ask=2.10, bid_size=12, ask_size=7)
    rows.append(("Buy 10 options, ask size 7", fill_option(+1, 10, q)))
    rows.append(("Buy options, wide spread", fill_option(+1, 5, dict(bid=0.50, ask=0.70, bid_size=50, ask_size=50))))
    rows.append(("MES stop 4990, open 4980", fill_future(+1, dict(O=4980, H=4995, L=4970, C=4985), 0.25, "stop", 4990)))
    rows.append(("Crypto buy $5,000 at 65,000", fill_crypto(+1, 5000, 65000.0)))
    return pd.DataFrame([{"Case": c, "Result": str(r)} for c, r in rows])


# ----------------------------------------------------------------------------------------------
# 2. Immutable records (track 10 ledger)
# ----------------------------------------------------------------------------------------------
def ledger_demo():
    t10 = import_track10()
    L = t10["ledger"]
    path = os.path.join(SCRATCH, "paper_ledger_demo.jsonl")
    if os.path.exists(path):
        os.remove(path)
    led = L.Ledger(path)
    v = "short-v0.1"
    led.append("constitution", {"version": v, "content_sha256": "c" * 64, "invariants": {"paper": True},
                                "parameters": {"k": 0.25, "kappa_rule": 0.5, "hurdle_bp": 6,
                                               "fill_model": FILL_MODEL_VERSION},
                                "changelog": "paper-trading start"},
               as_of="2026-10-01T02:00:00Z", created_at="2026-10-01T02:20:00.000Z", strategy_version=v,
               record_id="demo-0001")
    rec = {"rec_id": "P-2026-001", "candidate_id": "c-2026-09-30-03", "archetype": "etf_pullback",
           "instrument": {"type": "etf", "ticker": "SPY"}, "legs": [{"action": "BUY", "qty": 18}],
           "direction": "long", "thesis": "3-day pullback in an uptrend (rule)",
           "base_rate": {"reference_class": "SPY 3d < -2 sigma above 200d, 2005-2025", "rate": 0.58, "n": 212},
           "market_implied": {"p_target": None}, "edge_estimate": {"s_claim": 0.2, "s_used": 0.1},
           "sizing": {"risk_frac": 0.0072, "binding": "per-trade stress cap"},
           "entry_plan": {"order": "LIMIT DAY placed the evening before", "limit": 670.0, "band": [660, 672]},
           "exit_plan": {"stop": 651.0, "target": 708.0, "time_stop": "2026-10-14"},
           "invalidation": ["SPY close < 200-day average"], "premortem": [{"failure_mode": "macro gap", "probability": 0.1}],
           "forecast_ids": ["F1", "F2", "F3"], "benchmark": "T-bills", "paper": True}
    led.append("recommendation", rec, as_of="2026-10-01T02:00:00Z", created_at="2026-10-01T02:21:00.000Z",
               strategy_version=v, record_id="demo-0002")
    for fid, q, p in (("F1", "SPY close 2026-10-14 > entry fill", 0.56),
                      ("F2", "SPY touches 708.00 before 651.00 by 2026-10-14", 0.36),
                      ("F3", "SPY low <= 651.00 by 2026-10-14", 0.30)):
        led.append("forecast", {"forecast_id": fid, "parent_id": "P-2026-001", "family": "short_" + fid,
                                "question": q, "resolution_rule": "at_date" if fid == "F1" else "first_touch_by_date",
                                "resolution_criteria": {"source": "vendor:OHLC", "field": "close/high/low"},
                                "resolution_date": "2026-10-14T20:00:00Z", "p_raw": p, "p_final": p,
                                "calibration_map": "identity", "baseline": {"p_base_rate": p}},
                   as_of="2026-10-01T02:00:00Z", created_at="2026-10-01T02:22:00.000Z", strategy_version=v,
                   record_id=f"demo-{fid}")
    led.append("execution", {"rec_id": "P-2026-001", "executed": True, "paper": True,
                             "fill_model": FILL_MODEL_VERSION,
                             "fills": [{"qty": 18, "price": 668.43, "source": "open 2026-10-01 + 3 bp"}]},
               as_of="2026-10-01T20:00:00Z", created_at="2026-10-01T20:30:00.000Z", strategy_version=v,
               record_id="demo-0006")
    ok, msg = led.verify()
    # tamper: edit a forecast probability in place
    lines = open(path).read().splitlines()
    rec3 = json.loads(lines[2]); rec3["payload"]["p_final"] = 0.95
    lines[2] = json.dumps(rec3, sort_keys=True, separators=(",", ":"))
    tampered = path.replace(".jsonl", "_tampered.jsonl")
    open(tampered, "w").write("\n".join(lines) + "\n")
    t_led = object.__new__(L.Ledger); t_led.path = tampered
    ok2, msg2 = L.Ledger.verify(t_led)
    return pd.DataFrame([{"Check": "clean ledger", "Result": f"{ok}: {msg[:40]}"},
                         {"Check": "forecast p edited 0.56 -> 0.95", "Result": f"{ok2}: {msg2}"}])


# ----------------------------------------------------------------------------------------------
# 3. Limit-order adverse selection (why "touch = fill" paper rules are optimistic)
# ----------------------------------------------------------------------------------------------
def limit_adverse_selection():
    """Buy-limit at x% below the prior close, working for one day, vs a market-on-open buy.
    Compares the 5-day return from the fill price under a 'touch' rule and a 'trade-through' rule."""
    names = {"ETFs": ["SPY", "QQQ", "IWM", "XLE", "XLF", "XLK", "TLT", "GLD"],
             "Large caps": ["AAPL", "MSFT", "AMZN", "NVDA", "JPM", "XOM", "PFE", "INTC", "BA", "DIS"]}
    data = load_daily(sorted({t for v in names.values() for t in v}))
    rows = []
    for grp, tick in names.items():
        for x in (0.005, 0.01):
            moo, touch, thru, impr, n_days, n_touch, n_thru = [], [], [], [], 0, 0, 0
            for t in tick:
                d = data[t].loc["2010":]
                c = d["Close"].values; o = d["Open"].values; l = d["Low"].values
                lim = c[:-6] * (1 - x)
                o1, l1, c6 = o[1:-5], l[1:-5], c[6:]
                moo.append(np.log(c6 / o1))
                ft = l1 <= lim; fth = l1 <= lim - 0.01
                px = np.minimum(o1, lim)
                touch.append(np.log(c6[ft] / px[ft])); thru.append(np.log(c6[fth] / px[fth]))
                impr.append(np.log(o1[ft] / px[ft]))
                n_days += len(o1); n_touch += ft.sum(); n_thru += fth.sum()
            m = np.concatenate(moo); a = np.concatenate(touch); b = np.concatenate(thru)
            rows.append({"Universe": grp, "Limit below prior close": f"-{100*x:.1f}%",
                         "Fill rate (touch)": n_touch / n_days, "Fill rate (trade-through)": n_thru / n_days,
                         "5-day return, market-on-open (bp)": 1e4 * m.mean(),
                         "5-day return from limit fill, touch rule (bp)": 1e4 * a.mean(),
                         "5-day return, trade-through rule (bp)": 1e4 * b.mean(),
                         "Price improvement vs open when filled (bp)": 1e4 * np.concatenate(impr).mean()})
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------------------------
# 4. Operating characteristics of the pass/fail rule
# ----------------------------------------------------------------------------------------------
def _trade_pool(s, n=400_000, seed=SEED + 41):
    """Pool of R-multiples for a 20-day stop-based trade with true net Sharpe s (s may be < 0)."""
    rng = np.random.default_rng(seed)
    if s >= 0:
        mu = float(np.interp(s, [0, .05, .1, .2, .3, .4], [0.0099, 0.0249, 0.0398, 0.0696, 0.0992, 0.129]))
    else:  # negative edges: extrapolate the drift linearly (checked below by the realised Sharpe)
        mu = 0.0099 + s / 0.05 * (0.0249 - 0.0099)
    return tm.simulate_trades(mu, 20, "stop", n, rng)


def oc_simulation(n_hist=4000, seed=SEED + 42, prior_sd=0.10, thresholds=(0.5, 0.7, 0.9),
                  trade_rates=(25, 50, 100, 200), optimism=0.15, cal_tol=0.20, max_dd=0.15, risk=0.007):
    """Go-live rule evaluated at pre-registered looks (months 3, 6, 9, 12; first pass wins):
        (a) >= 30 resolved paper trades;
        (b) posterior P(s > 0) >= threshold under a skeptical N(0, prior_sd^2) prior on per-trade Sharpe;
        (c) no GROSS calibration bias: the 90% CI of (hit rate - mean stated P(profit)) must contain a
            value inside +/- cal_tol (3 sub-forecasts per trade, design effect 1.8 -> n_eff = 1.67 n);
        (d) paper max drawdown (at `risk` per trade) below max_dd.
    The forecaster states P(profit) = true P(profit) + optimism.  trade_rates=200 stands for a 'wide'
    paper book that paper-trades every candidate above a low hurdle."""
    rng = np.random.default_rng(seed)
    rows = []
    looks = (3, 6, 9, 12)
    for s in (-0.10, -0.05, 0.0, 0.05, 0.10, 0.20, 0.30):
        pool = _trade_pool(s)
        p_true = float(np.mean(pool > 0))
        for N in trade_rates:
            n_max = int(N * 1.3) + 40
            counts = rng.poisson(N / 12, (n_hist, 12)).cumsum(1)
            X = rng.choice(pool, (n_hist, n_max))
            passed = {th: np.full(n_hist, np.nan) for th in thresholds}
            for M in looks:
                n = np.minimum(counts[:, M - 1], n_max)
                idx = np.arange(n_max)[None, :] < n[:, None]
                mean = np.where(idx, X, 0.0).sum(1) / np.maximum(n, 1)
                var = (np.where(idx, X ** 2, 0).sum(1) / np.maximum(n, 1) - mean ** 2) * n / np.maximum(n - 1, 1)
                shat = mean / np.sqrt(np.maximum(var, 1e-12))
                prec = n + 1 / prior_sd ** 2
                p_pos = stats.norm.cdf(n * shat / prec * np.sqrt(prec))
                hit = np.where(idx, X > 0, False).sum(1) / np.maximum(n, 1)
                fc = min(p_true + optimism, 0.99)
                n_eff = 1.67 * np.maximum(n, 1)
                se = np.sqrt(np.clip(hit * (1 - hit), 0.02, None) / n_eff)
                lo, hi = hit - fc - 1.645 * se, hit - fc + 1.645 * se
                cal_ok = (hi >= -cal_tol) & (lo <= cal_tol)
                wealth = 1 + np.cumsum(np.where(idx, X * risk, 0), axis=1)
                dd = 1 - wealth / np.maximum.accumulate(np.maximum(wealth, 1), axis=1)
                base_ok = (n >= 30) & cal_ok & (dd.max(1) < max_dd)
                for th in thresholds:
                    ok = base_ok & (p_pos >= th) & np.isnan(passed[th])
                    passed[th][ok] = M
            for th in thresholds:
                rows.append({"True s": s, "Paper trades/yr": N, "Go-live threshold P(s>0)": th,
                             **{f"P(go live by m{M})": float(np.mean(passed[th] <= M)) for M in looks}})
    return pd.DataFrame(rows)


def calibration_gate_power(n_hist=20000, seed=SEED + 43, cal_tol=0.20):
    """How often does the gross-bias gate fire (fail) for a given optimism, after m months?"""
    rng = np.random.default_rng(seed)
    rows = []
    for opt in (0.0, 0.10, 0.15, 0.25, 0.35):
        for N in (25, 50, 100, 200):
            for M in (3, 6, 12):
                n = rng.poisson(N * M / 12, n_hist)
                n_eff = np.maximum((1.67 * n).astype(int), 1)
                p = 0.50
                hit = rng.binomial(n_eff, p) / n_eff
                se = np.sqrt(np.clip(hit * (1 - hit), 0.02, None) / n_eff)
                fc = p + opt
                lo, hi = hit - fc - 1.645 * se, hit - fc + 1.645 * se
                fail = ~((hi >= -cal_tol) & (lo <= cal_tol))
                # a softer "warning" when the 90% CI excludes zero bias
                warn = (hi < 0) | (lo > 0)
                rows.append({"Stated minus true P(profit)": opt, "Paper trades/yr": N, "Month": M,
                             "P(gate fails: bias beyond 20pp)": float(fail.mean()),
                             "P(warning: CI excludes 0)": float(warn.mean())})
    return pd.DataFrame(rows)


def expected_value_of_pilot(oc: pd.DataFrame, pilot_r=0.002):
    """Value of the go-live decision for the first live year at pilot size (0.2% risk per trade),
    under a sceptical prior over the true edge: 20% s=-0.05, 20% s=0, 30% s=0.05, 20% s=0.10, 10% s=0.20."""
    prior = {-0.05: 0.2, 0.0: 0.2, 0.05: 0.3, 0.10: 0.2, 0.20: 0.1}
    g = {}
    for s in prior:
        pool = _trade_pool(s, n=100_000)
        g[s] = (pool.mean(), np.mean(pool ** 2))
    out = []
    for N in (25, 50, 100, 200):
        for th in sorted(oc["Go-live threshold P(s>0)"].unique()):
            ev = 0.0; p_bad = 0.0; p_live = 0.0
            for s, w in prior.items():
                pp = oc[(oc["True s"] == s) & (oc["Paper trades/yr"] == N) &
                        (oc["Go-live threshold P(s>0)"] == th)]["P(go live by m12)"].iloc[0]
                n_live = min(N, 100)
                gy = n_live * (pilot_r * g[s][0] - 0.5 * pilot_r ** 2 * g[s][1])
                ev += w * pp * gy; p_live += w * pp
                if s <= 0:
                    p_bad += w * pp
            out.append({"Paper trades/yr": N, "Threshold": th, "P(go live by m12)": p_live,
                        "P(go live AND edge <= 0)": p_bad,
                        "P(edge <= 0 | went live)": p_bad / p_live if p_live > 0 else np.nan,
                        "EV of pilot year (bp of log growth)": 1e4 * ev})
    return pd.DataFrame(out)


if __name__ == "__main__":
    pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
    st = fill_selftest(); save_table(st, "fill_model_selftest"); print(st.to_string())
    ld = ledger_demo(); save_table(ld, "paper_ledger_demo"); print(ld.to_string())
    la = limit_adverse_selection(); save_table(la, "limit_adverse_selection"); print(la.round(4).to_string())
    oc = oc_simulation(); save_table(oc, "paper_pass_rule_oc"); print(oc.round(3).to_string())
    cg = calibration_gate_power(); save_table(cg, "paper_calibration_gate_power"); print(cg.round(3).to_string())
    ev = expected_value_of_pilot(oc); save_table(ev, "paper_pilot_value"); print(ev.round(4).to_string())
