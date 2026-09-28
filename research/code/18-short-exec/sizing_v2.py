"""Sizing rule v2 for 1-60 day trades: whole-portfolio, T-bill-aware growth hurdle (track 18, §2.1).

What changes versus research/code/03-math/sizing_rule.py (track 03; flagged by track 12 M1 and
00-SYNTHESIS §1.2):

1. WHOLE PORTFOLIO.  dg = E ln W_T(with trade) - E ln W_T(without), where W_T includes every open
   position (and an optional unstopped core) simulated JOINTLY with a common factor, gaps, stops and
   targets (trade_model.py).  Correlated open positions therefore lower both the Kelly size and dg.
2. CASH EARNS T-BILLS.  Idle cash grows at r_f.  A long position forgoes r_f on its notional
   (cash-funded stock/ETF/crypto, or implicitly through the basis for futures); an option forgoes r_f
   on its premium.  The claimed edge must therefore be an edge in EXCESS of T-bills.
3. PER YEAR.  dg_yr = dg_trade / max(T_years, 1).  For T <= 1 year (all trades here) dg_yr is simply
   the trade's contribution to this year's log growth.  Dividing by T < 1 would "annualise" a 1-day
   trade into a huge rate although the scarce resource is the trade budget, not time.
4. HURDLE PER TRADE (budget logic).  A trade is sent only if dg_trade(shrunk edge) >= H_TRADE
   (6 bp at launch, from sim_selection.py), it beats T-bills, and its gross edge >= 2 x round-trip cost.

Sizing:  r = G(D) * min( k * r*_joint(s_used),  r*_joint(s_claim - delta),  stress cap,
                         cluster room, total-stress room ),  s_used = kappa * s_claim
with k = 0.25, kappa = 0.5 (rule-based) or 0.25 (LLM-subjective), delta = 0.05 in Sharpe units,
stress = r * P99 gap multiple (gap_risk.py) for stop-based trades and r * 1 for defined-risk ones.
r is the loss at the stop (or the premium) as a fraction of equity.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
import pandas as pd

import trade_model as tm
from util18 import RF_ANNUAL, SEED, TRADING_DAYS, import_track03, save_table

H_TRADE = 0.0006           # per-trade hurdle: 6 bp of expected log growth (sim_selection knee)
K_FRACTION = 0.25
KAPPA = {"rule": 0.5, "llm": 0.25}
DELTA_S = 0.05
STRESS_CAP = {"stop": 0.02, "defined": 0.03}
CLUSTER_CAP = 0.06
TOTAL_CAP = 0.10
# P99 realised loss per 1R at a 2 x ATR stop (gap_risk.py, stop_gap_through.csv, longs):
GAP_MULT = {"etf": 1.7, "rates_commodity_etf": 1.7, "large_cap": 2.1, "high_vol": 2.6,
            "btc_etf": 3.1, "future": 1.7, "crypto_spot": 1.5}


def governor_short(dd):
    return float(np.clip(1.0 - (dd - 0.05) / 0.10 * 0.75, 0.25, 1.0))


@dataclass
class TradeSpec:
    name: str
    kind: str                 # "stop" | "defined"
    H: int                    # holding period / time stop, trading days
    daily_vol: float          # underlying daily vol as a fraction of price
    load: float               # signed loading on the common factor (sqrt of pairwise corr)
    cluster: str              # e.g. "long_equity_risk", "rates", "crypto"
    s_claim: float            # model's claimed NET per-trade Sharpe (price move, net of costs)
    source: str = "rule"      # "rule" | "llm"
    instrument: str = "etf"   # key into GAP_MULT
    financed_by_cash: bool = True   # stock/ETF/crypto; futures: False (basis carries r_f instead)
    div_yield: float = 0.0
    cost_R: float = 0.03
    edge_basis: str = "price"       # "price": claimed edge is a raw price/total-return edge -> subtract
                                    # the T-bill carry; "excess": already in excess of T-bills (futures)

    @property
    def notional_per_R(self):
        if self.kind == "defined":
            return 1.0                                    # 1R = premium
        return 1.0 / (tm.D_STOP * self.daily_vol)         # stop = 3 daily sigmas

    @property
    def stress_mult(self):
        return 1.0 if self.kind == "defined" else GAP_MULT[self.instrument]

    def tbill_drag_R(self):
        """T-bill opportunity cost per 1R over the holding period (R units).  Zero when the claimed
        edge is already measured in excess of T-bills (futures prices embed the carry)."""
        if self.edge_basis == "excess":
            return 0.0
        T = self.H / TRADING_DAYS
        if self.kind == "defined":
            return RF_ANNUAL * T                           # the premium forgoes interest
        return self.notional_per_R * RF_ANNUAL * T         # cash-funded notional forgoes interest

    def baseline_drift_R(self, erp_annual=0.035, market_daily_vol=0.011):
        """What buy-and-hold would earn over H in R units: T-bills + beta x ERP (long trades)."""
        if self.kind == "defined":
            return np.nan
        beta = self.load * self.daily_vol / market_daily_vol
        T = self.H / TRADING_DAYS
        rf = 0.0 if self.edge_basis == "excess" else RF_ANNUAL
        return self.notional_per_R * (rf + beta * erp_annual) * T


@dataclass
class OpenPosition:
    spec: TradeSpec
    r: float                  # risk fraction of equity at entry
    age: int = 0
    level: float = 0.0        # current move in daily sigmas


@dataclass
class Portfolio:
    positions: list = field(default_factory=list)
    core_weight: float = 0.0          # unstopped broad-index exposure (fraction of equity)
    core_daily_vol: float = 0.011
    erp_annual: float = 0.035         # core's expected excess return (muted, 00-SYNTHESIS §0)
    drawdown: float = 0.0
    paused: bool = False              # daily/weekly loss limit hit


@lru_cache(maxsize=None)
def mu_for(kind: str, H: int, s: float, load: float = 0.0, n: int = 60_000, seed: int = 5):
    """Daily drift (sigma units) giving net per-trade Sharpe s for this kind/horizon, including the
    market crash term at this loading (common random numbers across the grid)."""
    grid = np.linspace(-0.08, 0.9, 50) if H < 5 else np.linspace(-0.05, 0.5, 34)
    srs = []
    for m in grid:
        rng = np.random.default_rng(seed)
        x = tm.simulate_trades(m, H, kind, n, rng, crash_load=max(load, 0.0))
        srs.append(x.mean() / x.std())
    srs = np.maximum.accumulate(np.array(srs))
    return float(np.interp(s, srs, grid))


def _simulate_joint(specs, mus, rems, lvl0, horizon, n, seed):
    """Joint daily simulation of K trades over `horizon` days (common factor + gaps + barriers).
    kind "linear" = unstopped exposure (the core), marked in daily-sigma units at the horizon.
    Returns R-multiple outcomes at exit, or marks at the horizon, shape (n, K)."""
    rng = np.random.default_rng(seed)
    K = len(specs)
    g = tm.GAMMA
    load = np.array([s.load for s in specs])[None, :]
    idl = np.sqrt(np.maximum(1 - load ** 2, 0.0))
    kinds = np.array([s.kind == "defined" for s in specs])[None, :]
    lin = np.array([s.kind == "linear" for s in specs])[None, :]
    mu = np.array(mus)[None, :]
    rem = np.array(rems)[None, :]
    lvl = np.tile(np.array(lvl0, float), (n, 1))
    out = np.full((n, K), np.nan)
    alive = np.ones((n, K), bool)
    D, TG = tm.D_STOP, tm.TARGET_R * tm.D_STOP
    Hs = np.array([s.H for s in specs])[None, :]
    k2 = tm.K2_MULT * np.sqrt(np.maximum(Hs, 1))
    for day in range(horizon):
        gM = np.sqrt(g) * tm.t_unit(rng, n) + (rng.random(n) < 1 / 500) * -6.0
        iM = rng.normal(0, np.sqrt(1 - g), n)
        ge = tm.gap_draw(rng, (n, K)); ie = rng.normal(0, np.sqrt(1 - g), (n, K))
        running = alive & (day < rem)
        lo = lvl + g * mu + load * gM[:, None] + idl * ge
        lc = lo + (1 - g) * mu + load * iM[:, None] + idl * ie
        st = running & ~kinds & ~lin
        sg = st & (lo <= -D); tg = st & ~sg & (lo >= TG)
        out[sg] = lo[sg] / D - tm.STOP_SLIP_R; out[tg] = lo[tg] / D
        still = st & ~(sg | tg)
        u1, u2 = rng.random((n, K)), rng.random((n, K))
        hs = still & ((lc <= -D) | tm.bridge_cross(lo + D, lc + D, 1 - g, u1))
        ht = still & ~hs & ((lc >= TG) | tm.bridge_cross(TG - lo, TG - lc, 1 - g, u2))
        out[hs] = -1 - tm.STOP_SLIP_R; out[ht] = tm.TARGET_R
        done = sg | tg | hs | ht
        lvl = np.where(running & ~done, lc, lvl)
        alive &= ~done
        ts = alive & (day + 1 >= rem)
        xt = np.where(lin, lvl, np.where(kinds, (1 + tm.B_OPT) * np.clip(lvl / k2, 0, 1) - 1, lvl / D))
        out[ts] = xt[ts]
        alive &= ~ts
    remaining = np.maximum(rem - horizon, 0) * np.ones((n, 1))
    mark_def = (1 + tm.B_OPT) * tm.bachelier_spread_value(lvl, remaining, k2) / k2 - 1
    mark = np.where(lin, lvl, np.where(kinds, mark_def, lvl / D))
    out = np.where(np.isnan(out), mark, out)
    return out


def book_and_candidate(pf: Portfolio, cand: TradeSpec, s_cand: float, n=20_000, seed=SEED + 31):
    """Scenario P&L (fraction of equity) of the existing book (+ core) over the candidate's horizon,
    and the candidate's R-multiple (net of costs, before the T-bill drag), from ONE joint simulation."""
    specs = [p.spec for p in pf.positions]
    mus, rems, lvl0 = [], [], []
    for p in pf.positions:
        s_used = KAPPA[p.spec.source] * p.spec.s_claim
        mus.append(mu_for(p.spec.kind, p.spec.H, round(s_used, 3), round(p.spec.load, 3)))
        rems.append(max(p.spec.H - p.age, 0)); lvl0.append(p.level)
    if pf.core_weight > 0:
        specs.append(TradeSpec("core index", "linear", cand.H, pf.core_daily_vol, 1.0, "core", 0.0))
        mus.append(pf.erp_annual / TRADING_DAYS / pf.core_daily_vol); rems.append(cand.H); lvl0.append(0.0)
    specs.append(cand)
    mus.append(mu_for(cand.kind, cand.H, round(s_cand, 3), round(cand.load, 3)))
    rems.append(cand.H); lvl0.append(0.0)
    X = _simulate_joint(specs, mus, rems, lvl0, cand.H, n, seed)
    X[:, -1] -= cand.cost_R
    T = cand.H / TRADING_DAYS
    book = np.full(n, RF_ANNUAL * T)
    for j, p in enumerate(pf.positions):
        book += p.r * (X[:, j] - p.level / tm.D_STOP)
    if pf.core_weight > 0:
        book += pf.core_weight * pf.core_daily_vol * X[:, len(pf.positions)]
    return book, X[:, -1]


def kelly_r(book, x, drag, r_max=0.25, grid=400):
    rs = np.linspace(0.0, r_max, grid)
    W = 1.0 + book[:, None] + rs[None, :] * (x[:, None] - drag)
    with np.errstate(invalid="ignore", divide="ignore"):
        g = np.where(W > 0, np.log(np.maximum(W, 1e-300)), -np.inf).mean(0)
    return float(rs[int(np.argmax(g))])


def delta_g(book, x, drag, r):
    base = np.log(1.0 + book).mean()
    W = 1.0 + book + r * (x - drag)
    return float(np.log(np.maximum(W, 1e-12)).mean() - base)


def size_v2(pf: Portfolio, cand: TradeSpec, n=20_000):
    kappa = KAPPA[cand.source]
    s_used = kappa * cand.s_claim
    s_rob = max(cand.s_claim - DELTA_S, 0.0)
    drag = cand.tbill_drag_R()
    book, x_used = book_and_candidate(pf, cand, s_used, n)
    _, x_rob = book_and_candidate(pf, cand, s_rob, n)
    r_full = kelly_r(book, x_used, drag)
    terms = {
        "quarter Kelly (joint, shrunk)": K_FRACTION * r_full,
        "robust Kelly (s - 0.05)": kelly_r(book, x_rob, drag),
        "per-trade stress cap": STRESS_CAP[cand.kind] / cand.stress_mult,
    }
    open_stress = sum(p.r * p.spec.stress_mult for p in pf.positions)
    clus_stress = sum(p.r * p.spec.stress_mult for p in pf.positions if p.spec.cluster == cand.cluster)
    terms["cluster room"] = max(CLUSTER_CAP - clus_stress, 0) / cand.stress_mult
    terms["total-stress room"] = max(TOTAL_CAP - open_stress, 0) / cand.stress_mult
    binding = min(terms, key=terms.get)
    G = 0.0 if pf.paused else governor_short(pf.drawdown)
    r = G * terms[binding]
    if G < 1:
        binding += f" x governor {G:.2f}"
    dg_trade = delta_g(book, x_used, drag, r)
    T = cand.H / TRADING_DAYS
    gross_edge_R = s_used * x_used.std() + cand.cost_R
    send = (dg_trade >= H_TRADE) and (x_used.mean() - drag > 0) and (gross_edge_R >= 2 * cand.cost_R)
    raw_edge_R = float(x_used.mean())
    base = cand.baseline_drift_R()
    return dict(raw_edge_R=raw_edge_R, drag_R=drag, baseline_R=base,
                r=r, binding=binding, s_used=s_used, r_full_kelly=r_full,
                notional=r * cand.notional_per_R, max_loss_planned=r,
                stress_loss=r * cand.stress_mult, tbill_drag_bp=1e4 * r * drag,
                dg_trade=dg_trade, dg_yr=dg_trade / max(T, 1.0), dg_annualised_by_T=dg_trade / T,
                edge_R_used=float(x_used.mean()), send=send)


def old_rule_dg(cand: TradeSpec, n=200_000):
    """Track 03's rule on a binary equivalent of the same trade (isolated, cash at 0%)."""
    sr03 = import_track03()
    rng = np.random.default_rng(SEED)
    x = tm.simulate_trades(mu_for(cand.kind, cand.H, round(cand.s_claim, 3), round(cand.load, 3)),
                           cand.H, cand.kind, n, rng, crash_load=max(cand.load, 0.0))
    x = x - cand.cost_R + (tm.COST_STOP_R if cand.kind == "stop" else tm.COST_DEF_R)
    p = float(np.mean(x > 0)); b = float(x[x > 0].mean()); a = float(-x[x <= 0].mean())
    res = sr03.size_binary(p, b, a * cand.stress_mult, STRESS_CAP[cand.kind] / cand.stress_mult,
                           sr03.Policy(kappa=KAPPA[cand.source]))
    res.update(p_win=p, b_win=b, a_mean_loss=a, a_used=a * cand.stress_mult,
               p_breakeven_old=a * cand.stress_mult / (a * cand.stress_mult + b),
               p_breakeven_mean_loss=a / (a + b))
    return res


def examples():
    vol = {"etf": 0.011, "large_cap": 0.022, "future": 0.011, "btc_etf": 0.032}
    ex = [
        TradeSpec("SPY pullback, 10 days", "stop", 10, vol["etf"], np.sqrt(0.6), "long_equity_risk", 0.20,
                  "rule", "etf", True, 0.012, 0.03),
        TradeSpec("Single stock post-earnings drift, 20 days", "stop", 20, vol["large_cap"], np.sqrt(0.3),
                  "long_equity_risk", 0.25, "llm", "large_cap", True, 0.0, 0.03),
        TradeSpec("MES trend, 40 days (futures)", "stop", 40, vol["future"], np.sqrt(0.6), "long_equity_risk",
                  0.15, "rule", "future", False, 0.012, 0.02, "excess"),
        TradeSpec("QQQ call debit spread, 20 days", "defined", 20, 0.013, np.sqrt(0.6), "long_equity_risk",
                  0.20, "rule", "etf", True, 0.0, 0.08),
        TradeSpec("IBIT breakout, 20 days", "stop", 20, vol["btc_etf"], np.sqrt(0.2), "crypto", 0.15,
                  "rule", "btc_etf", True, 0.0, 0.03),
        TradeSpec("1-day event trade (ETF)", "stop", 1, vol["etf"], np.sqrt(0.6), "long_equity_risk", 0.20,
                  "rule", "etf", True, 0.012, 0.03),
    ]
    contexts = {
        "empty book": Portfolio(),
        "2 open long-equity trades": Portfolio(positions=[
            OpenPosition(TradeSpec("open QQQ swing", "stop", 20, 0.013, np.sqrt(0.6), "long_equity_risk", 0.2,
                                   "rule", "etf"), r=0.012, age=5),
            OpenPosition(TradeSpec("open NVDA drift", "stop", 20, 0.03, np.sqrt(0.3), "long_equity_risk", 0.2,
                                   "llm", "high_vol"), r=0.0077, age=8)]),
        "2 open + 12% drawdown": None,
    }
    pf3 = Portfolio(positions=contexts["2 open long-equity trades"].positions, drawdown=0.12)
    contexts["2 open + 12% drawdown"] = pf3
    contexts["60% index core + 2 open"] = Portfolio(positions=contexts["2 open long-equity trades"].positions,
                                                    core_weight=0.60)
    rows = []
    for cname, pf in contexts.items():
        for c in ex:
            if cname != "empty book" and c.name.startswith("1-day"):
                continue
            res = size_v2(pf, c)
            row = {"Context": cname, "Trade": c.name, "Source": c.source, "Claimed s": c.s_claim,
                   "s used": res["s_used"], "Edge used (R, raw)": res["raw_edge_R"],
                   "T-bill drag (R)": res["drag_R"],
                   "Buy-and-hold drift over H (R)": res["baseline_R"],
                   "Full Kelly r (joint)": res["r_full_kelly"],
                   "Final r (risk % equity)": res["r"], "Binding": res["binding"],
                   "Notional % equity": res["notional"], "Gap-adj. stress %": res["stress_loss"],
                   "T-bill drag (bp)": res["tbill_drag_bp"],
                   "dg per trade (bp)": 1e4 * res["dg_trade"],
                   "dg_yr v2 (bp/yr)": 1e4 * res["dg_yr"],
                   "dg / T (bp/yr, wrong for short trades)": 1e4 * res["dg_annualised_by_T"],
                   "Send? (hurdle 6 bp)": "yes" if res["send"] else "no"}
            if cname == "empty book":
                old = old_rule_dg(c)
                row["Old rule: stake"] = old["f"]; row["Old rule dg (bp, per trade)"] = 1e4 * old["dg"]
                row["Old rule send (0.2%)"] = "yes" if old["send"] else "no"
            rows.append(row)
    df = pd.DataFrame(rows)
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 300); pd.set_option("display.max_columns", 30)
    df = examples()
    save_table(df, "sizing_v2_examples")
    print(df.round(5).to_string())
