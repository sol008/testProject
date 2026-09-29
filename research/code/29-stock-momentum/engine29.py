"""Track 29, part B: a weekly single-stock momentum book with at most ONE new pick a week.

Timing (no look-ahead): every Friday (the last session of each week) the signal uses closes up to and including
that Friday; orders are market orders filled at the NEXT session's open (Robinhood queues them for 9:30 ET).

Book rules (the parameters of `run`):
  * K slots (4-12 names).  Each week: at most 1 buy and at most 3 orders in all (the email limit, design 3a.3).
  * A new buy takes the top-ranked eligible stock not already held, sized min(cash, equity / K).
  * 60-day cap: a position is re-decided at the last weekly email before entry + 60 calendar days would pass.
    It CONTINUES (clock restarts) if it still ranks in the top `keep` fraction of the universe (and the trend
    filter, if used, is on); otherwise it is sold.
  * Trend filter (optional): SPY close vs its 200-session average at the Friday close.  'entry' = no new buys and
    no continuations while SPY is below; 'exit' = also sell up to 3 names a week (weakest first) until flat.
  * Idle cash earns the 1-month T-bill rate (Ken French daily RF, last value carried forward after Aug 2026).
  * Costs: `cost` per side (default 0.10%) on every fill.
Universe: 'pit' = S&P 500 members on that Friday (point-in-time list) with Yahoo data; 'survivor' = today's members,
back-filled (the classic biased backtest); 'mega' = the 50 PIT members with the largest 63-session dollar volume.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field

sys.dont_write_bytecode = True

import numpy as np
import pandas as pd

import data29 as D


@dataclass
class Panel:
    dates: pd.DatetimeIndex
    tickers: list
    C: np.ndarray            # adjusted close, forward-filled for valuation
    O: np.ndarray            # adjusted open (NaN -> previous close)
    valid: np.ndarray        # True where a real close exists
    spy: np.ndarray
    rf: np.ndarray           # daily T-bill return
    dec: np.ndarray          # indices of weekly decision days (last session of each week), each with a next day
    masks: dict = field(default_factory=dict)
    sig: dict = field(default_factory=dict)


def clean(C: pd.DataFrame) -> pd.DataFrame:
    """Remove one-day Yahoo spikes (a >+80% or <-45% day fully reversed the next day) and non-positive prices."""
    C = C.where(C > 0)
    r = C.pct_change(fill_method=None)
    spike = ((r > 0.8) & (r.shift(-1) < -0.4)) | ((r < -0.45) & (r.shift(-1) > 0.8))
    return C.mask(spike)


def load_panel(start: str = "1998-01-01") -> Panel:
    p = D.prices()
    C = clean(p["Close"])
    O = p["Open"].reindex_like(C).where(lambda x: x > 0)
    V = p["Volume"].reindex_like(C)
    C = C.loc[start:]
    O, V = O.loc[C.index], V.loc[C.index]
    spy = C["SPY"].ffill().values
    tk = [t for t in C.columns if t not in D.ETFS]
    Cs = C[tk]
    valid = Cs.notna().values
    Cf = Cs.ffill()
    Of = O[tk].where(O[tk].notna(), Cf.shift(1)).where(lambda x: x.notna(), Cf)
    rfd = D.KF.daily_returns("F-F_Research_Data_Factors_daily")["RF"].reindex(C.index).ffill().fillna(0.0).values
    wk = pd.Series(np.arange(len(C)), index=C.index)
    iso = C.index.isocalendar()
    last_of_week = wk.groupby([iso.year.values, iso.week.values]).max().sort_values().values
    dec = last_of_week[last_of_week < len(C) - 1]
    P = Panel(C.index, tk, Cf.values, Of.values, valid, spy, rfd, dec)
    # universes -------------------------------------------------------------
    mem = D.member_mask(C.index, tk).values.copy()
    reused = D.reused_ticker_windows()
    for t, since in reused.items():
        if t in tk:
            j = tk.index(t)
            mem[C.index < since, j] = False
    last = D.pit_membership().iloc[-1]["tickers"].split(",")
    cur = np.array([t in {D.yahoo_symbol(x) for x in last} for t in tk])
    P.masks["pit"] = mem & valid
    P.masks["survivor"] = cur[None, :] & valid
    dv = (Cs * V[tk]).rolling(63, min_periods=40).mean().values
    P.sig["dv63"] = dv
    return P


def _window_sum(cs: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Sum over rows (a, b] from a cumulative-sum array (rows indexed by day)."""
    return cs[b] - cs[a]


def compute_signals(P: Panel) -> None:
    """Signals at every decision day d (rows of P.dec), using data up to the close of d only."""
    C, valid, d = P.C, P.valid, P.dec
    T = len(P.dates)
    ok = lambda idx: (idx >= 0)  # noqa: E731
    d252, d126, d21 = d - 252, d - 126, d - 21
    good = (d252 >= 0)
    with np.errstate(divide="ignore", invalid="ignore"):
        cnt = np.cumsum(valid, axis=0)
        nvalid = cnt[d] - cnt[np.maximum(d252, 0)]
        base = good[:, None] & (nvalid >= 230) & valid[d]
        m12 = C[d21] / C[np.maximum(d252, 0)] - 1
        m6 = C[d21] / C[np.maximum(d126, 0)] - 1
        P.sig["mom12_1"] = np.where(base, m12, np.nan)
        P.sig["mom6_1"] = np.where(base, m6, np.nan)
        # 52-week-high proximity
        hi = pd.DataFrame(C).rolling(252, min_periods=230).max().values
        P.sig["hi52"] = np.where(base, C[d] / hi[d], np.nan)
        # daily returns for FIP and vol
        r = np.full_like(C, np.nan)
        r[1:] = C[1:] / C[:-1] - 1
        r[~valid] = np.nan
        pos = np.cumsum(np.nan_to_num(r) > 0, axis=0)
        neg = np.cumsum(np.nan_to_num(r) < 0, axis=0)
        a, b = np.maximum(d252, 0), d21
        npos, nneg = pos[b] - pos[a], neg[b] - neg[a]
        n = np.maximum(npos + nneg, 1)
        ID = np.sign(m12) * (nneg - npos) / n            # Da-Gurun-Warachka information discreteness
        P.sig["fip_id"] = np.where(base, ID, np.nan)
        r0 = np.nan_to_num(r)
        c1, c2 = np.cumsum(r0, axis=0), np.cumsum(r0 ** 2, axis=0)
        s1, s2 = c1[d] - c1[a], c2[d] - c2[a]
        var = s2 / 251 - (s1 / 251) ** 2
        vol = np.sqrt(np.maximum(var, 1e-12)) * np.sqrt(252)
        P.sig["vol252"] = np.where(base, vol, np.nan)
        P.sig["riskadj"] = P.sig["mom12_1"] / P.sig["vol252"]
        # residual (market-adjusted) momentum on weekly returns: beta over 156 weeks, residuals weeks t-51..t-4
        W = C[d]
        rw = np.full_like(W, np.nan)
        rw[1:] = W[1:] / W[:-1] - 1
        spyw = P.spy[d]
        rm = np.r_[np.nan, spyw[1:] / spyw[:-1] - 1]
        rw0, rm0 = np.nan_to_num(rw), np.nan_to_num(rm)
        vw = (~np.isnan(rw)).astype(float)
        cum = lambda x: np.vstack([np.zeros((1,) + x.shape[1:]), np.cumsum(x, axis=0)])  # noqa: E731
        Sxy, Sx, Sy, Sxx, Nn = cum(rw0 * rm0[:, None]), cum(vw * rm0[:, None]), cum(rw0), cum(vw * (rm0 ** 2)[:, None]), cum(vw)
        Syy = cum(rw0 ** 2)
        k = np.arange(len(d))
        L = 156
        lo = np.maximum(k + 1 - L, 0)
        hi_ = k + 1
        nn = Nn[hi_] - Nn[lo]
        mx, my = (Sx[hi_] - Sx[lo]) / np.maximum(nn, 1), (Sy[hi_] - Sy[lo]) / np.maximum(nn, 1)
        cov = (Sxy[hi_] - Sxy[lo]) / np.maximum(nn, 1) - mx * my
        vx = (Sxx[hi_] - Sxx[lo]) / np.maximum(nn, 1) - mx ** 2
        beta = np.where(nn >= 104, cov / np.maximum(vx, 1e-12), np.nan)
        lo2, hi2 = np.maximum(k + 1 - 52, 0), np.maximum(k + 1 - 4, 0)
        sy = Sy[hi2] - Sy[lo2]
        sx = Sx[hi2] - Sx[lo2]
        syy = Syy[hi2] - Syy[lo2]
        sxy = Sxy[hi2] - Sxy[lo2]
        sxx = Sxx[hi2] - Sxx[lo2]
        n2 = Nn[hi2] - Nn[lo2]
        se = sy - beta * sx
        see = syy - 2 * beta * sxy + beta ** 2 * sxx
        sd = np.sqrt(np.maximum(see / np.maximum(n2, 1) - (se / np.maximum(n2, 1)) ** 2, 1e-12))
        P.sig["resid"] = np.where(base & (n2 >= 44), se / (sd * np.sqrt(np.maximum(n2, 1))), np.nan)
    # SPY trend at decision days
    sma = pd.Series(P.spy).rolling(200).mean().values
    P.sig["trend_up"] = (P.spy[d] > sma[d]) | np.isnan(sma[d])
    P.sig["dv63_dec"] = P.sig["dv63"][d]


def score(P: Panel, name: str) -> np.ndarray:
    """(decision x ticker) score, higher = better.  'fip' = the smoothest names inside the top 20% by 12-1."""
    s = P.sig
    if name == "fip":
        m = s["mom12_1"]
        q80 = np.nanquantile(m, 0.8, axis=1, keepdims=True)
        return np.where(m >= q80, -s["fip_id"] + 10.0, -s["fip_id"] - 10.0) + 1e-3 * np.nan_to_num(m)
    if name == "combo":   # equal-weight z-score of 12-1, 52-week-high and residual momentum
        z = []
        for k in ("mom12_1", "hi52", "resid"):
            x = s[k]
            mu, sd = np.nanmean(x, axis=1, keepdims=True), np.nanstd(x, axis=1, keepdims=True)
            z.append((x - mu) / sd)
        return np.nanmean(np.stack(z), axis=0) + np.where(np.isnan(s["mom12_1"]), np.nan, 0)
    return s[name]


@dataclass
class Params:
    signal: str = "mom12_1"
    K: int = 8
    universe: str = "pit"          # pit | survivor | mega
    keep: float = 0.10             # continue at re-decision if in the top 10% of the universe
    trend: str = "none"            # none | entry | exit
    cost: float = 0.0010
    cap_days: int = 60
    max_buys: int = 1
    max_orders: int = 3
    pick_among: int = 1            # >1: pick at random among the top-n (luck study)
    seed: int = 0
    start: str = "2000-01-01"
    abs_mom: bool = True           # require positive 12-1 momentum to buy
    letf: float = 1.0              # 2.0 = each pick held through a synthetic daily-reset 2x ETF
    letf_cost: float = 0.02        # a year: fund fee (~1%) + financing spread (~1%) on the borrowed leg


def run(P: Panel, prm: Params) -> dict:
    rng = np.random.default_rng(prm.seed)
    dates, dec = P.dates, P.dec
    S = score(P, prm.signal)
    mask = P.masks["pit" if prm.universe == "mega" else prm.universe][dec]
    if prm.universe == "mega":
        dv = np.where(mask, P.sig["dv63_dec"], np.nan)
        thr = -np.sort(-np.nan_to_num(dv, nan=-1), axis=1)[:, 49:50]
        mask = mask & (dv >= thr)
    S = np.where(mask & ~np.isnan(S), S, np.nan)
    buy_ok = ~np.isnan(S)
    if prm.abs_mom:
        buy_ok &= P.sig["mom12_1"] > 0
    C, O = P.C, P.O
    if prm.letf != 1.0:   # synthetic daily-reset leveraged series built from each stock's own daily returns
        L = prm.letf
        rc = np.ones_like(C)
        with np.errstate(divide="ignore", invalid="ignore"):
            rc[1:] = C[1:] / C[:-1]
            ro = O / np.vstack([C[:1], C[:-1]])
        rc = np.where(np.isfinite(rc), rc, 1.0)          # before listing / after delisting: no return
        ro = np.where(np.isfinite(ro), ro, 1.0)
        daily_cost = (L - 1) * P.rf + prm.letf_cost / 252
        g = np.maximum(1 + L * (rc - 1) - daily_cost[:, None], 1e-9)
        g[0] = 1.0
        Cl = np.cumprod(g, axis=0)
        Ol = np.vstack([Cl[:1], Cl[:-1]]) * np.maximum(1 + L * (ro - 1), 1e-9)
        C, O = Cl, Ol
    trend = P.sig["trend_up"]
    rfi = np.cumprod(1 + P.rf)
    k0 = int(np.searchsorted(dates[dec], pd.Timestamp(prm.start)))
    cash_units = 1.0 / rfi[dec[k0] + 1]          # $1 start, in T-bill index units
    pos: dict[int, list] = {}                     # ticker idx -> [shares, clock_start_day, entry_day, entry_px]
    eq_days, eq_vals = [], []
    trades, orders_per_week, redecisions = [], [], [0, 0]
    breaches = 0
    for k in range(k0, len(dec)):
        d = dec[k]
        e = d + 1
        nxt_exec = dec[k + 1] + 1 if k + 1 < len(dec) else len(dates)
        nxt_date = dates[nxt_exec] if nxt_exec < len(dates) else dates[e] + pd.Timedelta(days=7)
        s = S[k]
        valid_rank = ~np.isnan(s)
        n_univ = int(valid_rank.sum())
        order = np.argsort(-np.where(valid_rank, s, -np.inf))
        rank = np.empty(len(s), dtype=float)
        rank[order] = np.arange(len(s))
        pct = np.where(valid_rank, rank / max(n_univ, 1), 1.0)
        up = bool(trend[k]) or prm.trend == "none"
        # ---- sells -------------------------------------------------------------------------------------
        must, optional = [], []
        for j, (sh, clk, ed, epx) in pos.items():
            if (nxt_date - dates[clk]).days > prm.cap_days:
                redecisions[0] += 1
                if pct[j] < prm.keep and up:
                    redecisions[1] += 1
                    pos[j][1] = e              # continue: the clock restarts at this week's open
                else:
                    must.append(j)
            elif prm.trend == "exit" and not up:
                optional.append(j)
        optional.sort(key=lambda j: -pct[j])     # weakest first
        sells = must + optional
        n_sell = min(len(sells), prm.max_orders)
        if len(must) > prm.max_orders:
            breaches += len(must) - prm.max_orders
        cash = cash_units * rfi[e - 1]
        for j in sells[:n_sell]:
            sh, clk, ed, epx = pos.pop(j)
            px = O[e, j]
            cash += sh * px * (1 - prm.cost)
            trades.append((ed, e, P.tickers[j], epx, px))
        # ---- buy ---------------------------------------------------------------------------------------
        n_orders = n_sell
        equity = cash + sum(sh * C[d, j] for j, (sh, *_ ) in pos.items())
        if up and len(pos) < prm.K and n_orders < prm.max_orders and n_univ > 0:
            cands = [j for j in order[: max(prm.pick_among, 1) + len(pos) + 5] if buy_ok[k, j] and j not in pos
                     ][: max(prm.pick_among, 1)]
            if cands:
                j = cands[0] if prm.pick_among <= 1 else cands[rng.integers(len(cands))]
                amt = min(cash, equity / prm.K)
                if amt > 0.25 * equity / prm.K:
                    px = O[e, j]
                    sh = amt * (1 - prm.cost) / px
                    cash -= amt
                    pos[j] = [sh, e, e, px]
                    n_orders += 1
        orders_per_week.append(n_orders)
        cash_units = cash / rfi[e - 1]
        # ---- mark to market, day by day until the next execution day -------------------------------------
        end = nxt_exec
        span = np.arange(e, end)
        v = cash_units * rfi[span]
        for j, (sh, *_ ) in pos.items():
            v = v + sh * C[span, j]
        eq_days.append(span)
        eq_vals.append(v)
    idx = np.concatenate(eq_days)
    eq = pd.Series(np.concatenate(eq_vals), index=dates[idx])
    return dict(equity=eq, trades=pd.DataFrame(trades, columns=["entry", "exit", "ticker", "px_in", "px_out"]),
                orders=np.array(orders_per_week), redecisions=redecisions, breaches=breaches,
                open_positions=[P.tickers[j] for j in pos])


def spy_equity(P: Panel, eq: pd.Series) -> pd.Series:
    s = pd.Series(P.spy, index=P.dates).loc[eq.index]
    return s / s.iloc[0] * eq.iloc[0]


def summarize(P: Panel, res: dict, label: str = "") -> dict:
    eq = res["equity"]
    spy = spy_equity(P, eq)
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    cg = (eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1
    cs = (spy.iloc[-1] / spy.iloc[0]) ** (1 / yrs) - 1
    w = eq.resample("W-FRI").last()
    ws = spy.resample("W-FRI").last()
    r, rs = w.pct_change().dropna(), ws.pct_change().dropna()
    tr = res["trades"]
    hold = (P.dates[tr["exit"].values] - P.dates[tr["entry"].values]).days if len(tr) else np.array([0])
    rets = tr["px_out"] / tr["px_in"] - 1 if len(tr) else pd.Series(dtype=float)
    return dict(label=label, start=str(eq.index[0].date()), years=round(yrs, 1), cagr=cg, spy_cagr=cs,
                excess=cg - cs, vol=r.std() * np.sqrt(52), beta=np.cov(r, rs)[0, 1] / rs.var(),
                maxdd=float((eq / eq.cummax() - 1).min()), spy_maxdd=float((spy / spy.cummax() - 1).min()),
                entries_per_year=len(tr) / yrs, median_hold_days=float(np.median(hold)),
                win_rate=float((rets > 0).mean()) if len(rets) else np.nan,
                continued_share=res["redecisions"][1] / max(res["redecisions"][0], 1),
                max_orders_week=int(res["orders"].max()), cap_breaches=res["breaches"])
