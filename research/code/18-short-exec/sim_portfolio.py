"""Portfolio Monte Carlo for many short (1-60 day), possibly correlated trades (track 18, section 2).

What it answers
---------------
For N = 12 / 25 / 50 / 100 trades a year and a true NET per-trade Sharpe s = 0 ... 0.3:
  * expected and median log growth, 1-year return quantiles, drawdowns;
  * the power of a t-test on the trades' R-multiples after 1, 2 and 3 years (time to detect the edge);
  * how sizing policy, correlation clustering, caps, the drawdown governor and loss limits change them.

Engine (vectorised over paths and position slots, daily steps, 3 years)
------------------------------------------------------------------------
* New trade candidates that have already passed the hurdle arrive as a Poisson process (N a year).
* Each trade: holding period H in {5,10,20,40,60} days (mean 20.5), 70% are "long-risk" trades that
  load on one common factor with pairwise correlation RHO; the rest load weakly (0.1) with a random sign.
* Underlying moves use trade_model.py: Student-t overnight gaps, news jumps, Gaussian intraday moves,
  Brownian-bridge stop/target crossings, gap-through fills, costs.  Market-wide crash gaps are added to
  the factor (1 in 500 days, -6 factor sigmas).
* Sizing policies (risk per trade r = loss at the stop, or the premium, as a fraction of equity):
    fixed_0.5 / fixed_1.0     fixed fractional risk
    v2                        quarter-Kelly on the SHRUNK claimed edge (kappa 0.5), robust (s - 0.05) term,
                              stress caps (2% stop-based at the gap-adjusted multiple, 3% premium),
                              correlation divisor 1 + n_open_in_cluster * 0.5, cluster stress <= 6%,
                              total open stress <= 10%, short-horizon drawdown governor, loss limits
    v2_nocorr                 v2 without the correlation divisor / cluster cap / governor / loss limits
    kelly_full                full Kelly on the CLAIMED edge, only a 25% per-trade stress cap
  The model's claimed per-trade Sharpe is s_claim = s_true + 0.10 (LLM-style optimism; track 10 §2.1).
* Growth is reported in excess of T-bills (idle cash and margin are assumed to earn the bill rate).
"""
from __future__ import annotations

import itertools
import os
from multiprocessing import Pool

import numpy as np
import pandas as pd
from scipy import stats

import trade_model as tm
from util18 import SEED, TRADING_DAYS, save_table, SCRATCH

YEARS = 3
SLOTS = 16
CRASH_P = 1 / 500
CRASH_SIZE = -6.0
OPTIMISM = 0.10
STRESS_MULT = {"stop": 2.4, "defined": 1.0}     # P99 loss per 1R (trade_model check; gap_risk.py 1.7-2.6)
_TABLE = None


def table():
    global _TABLE
    if _TABLE is None:
        path = os.path.join(SCRATCH, "trade_table.pkl")
        if os.path.exists(path):
            _TABLE = pd.read_pickle(path)
        else:
            _TABLE = tm.calibrate(targets=(0.0, 0.05, 0.1, 0.2, 0.3, 0.4))
            pd.to_pickle(_TABLE, path)
    return _TABLE


def lookup(kind, H, s, field):
    """Vectorised lookup; s must be one of the calibrated targets."""
    tab = table()
    out = np.empty(len(H))
    for h in np.unique(H):
        m = H == h
        out[m] = tab[(kind, int(h), round(float(s), 2))][field]
    return out


def governor_short(dd):
    """Short-horizon governor: 1 up to a 5% drawdown, linear to 0.25 at 15%, floor 0.25 (review at 20%)."""
    return np.clip(1.0 - (dd - 0.05) / 0.10 * 0.75, 0.25, 1.0)


def simulate(cfg: dict) -> dict:
    N, s, rho = cfg["N"], cfg["s"], cfg["rho"]
    policy, book = cfg["policy"], cfg.get("book", "stop")
    regime = cfg.get("regime", "iid")
    P = cfg.get("paths", 3000)
    rng = np.random.default_rng(cfg.get("seed", SEED))
    T = YEARS * TRADING_DAYS
    S = SLOTS
    g = tm.GAMMA

    active = np.zeros((P, S), bool)
    lvl = np.zeros((P, S)); mu = np.zeros((P, S)); load = np.zeros((P, S))
    H = np.zeros((P, S), np.int16); age = np.zeros((P, S), np.int16)
    risk = np.zeros((P, S)); stress = np.zeros((P, S)); clus = np.zeros((P, S), bool)
    isdef = np.zeros((P, S), bool)
    realized = np.ones(P); hwm = np.ones(P); maxdd = np.zeros(P); review = np.zeros(P, bool)
    eq_hist = np.ones((P, 6)); pause_until = np.full(P, -1)
    n_tr = np.zeros(P); sx = np.zeros(P); sx2 = np.zeros(P)
    snap = {}
    opened = np.zeros(P); blocked = np.zeros(P); r_sum = np.zeros(P)
    eq_1y = None
    in_stress = np.zeros(P, bool)
    s_claim = s + OPTIMISM
    tgt_s = round(s, 2)

    for t in range(T):
        # --- regime (stylised: the edge flips sign and vol doubles in a persistent stress state)
        if regime == "switch":
            u = rng.random(P)
            in_stress = np.where(in_stress, u < 0.95, u < 0.01)
        volm = np.where(in_stress, 2.0, 1.0)[:, None]
        mu_eff = np.where(in_stress[:, None], -mu, mu)

        # --- factor and idiosyncratic shocks
        gM = np.sqrt(g) * tm.t_unit(rng, P) + (rng.random(P) < CRASH_P) * CRASH_SIZE
        iM = rng.normal(0, np.sqrt(1 - g), P)
        ge = tm.gap_draw(rng, (P, S))
        ie = rng.normal(0, np.sqrt(1 - g), (P, S))
        idl = np.sqrt(1 - load ** 2)
        lo = lvl + g * mu_eff + volm * (load * gM[:, None] + idl * ge)
        lc = lo + (1 - g) * mu_eff + volm * (load * iM[:, None] + idl * ie)

        X = np.zeros((P, S)); ex = np.zeros((P, S), bool)
        st = active & ~isdef
        D = tm.D_STOP; TG = tm.TARGET_R * D
        sg = st & (lo <= -D); tgg = st & ~sg & (lo >= TG)
        X[sg] = lo[sg] / D - tm.STOP_SLIP_R; X[tgg] = lo[tgg] / D
        ex |= sg | tgg
        alive = st & ~ex
        v = (1 - g) * volm[:, :1] ** 2 * np.ones((1, S))
        u1 = rng.random((P, S)); u2 = rng.random((P, S))
        hs = alive & ((lc <= -D) | tm.bridge_cross(lo + D, lc + D, v, u1))
        ht = alive & ~hs & ((lc >= TG) | tm.bridge_cross(TG - lo, TG - lc, v, u2))
        X[hs] = -1.0 - tm.STOP_SLIP_R; X[ht] = tm.TARGET_R
        ex |= hs | ht
        age = age + active
        tstop = active & ~ex & (age >= H)
        k2 = tm.K2_MULT * np.sqrt(np.maximum(H, 1))
        Xt = np.where(isdef, (1 + tm.B_OPT) * np.clip(lc / k2, 0, 1) - 1, lc / D)
        X[tstop] = Xt[tstop]; ex |= tstop
        X = X - np.where(isdef, tm.COST_DEF_R, tm.COST_STOP_R)
        # book exits
        pnl = (risk * X * ex).sum(1)
        realized += pnl
        n_tr += ex.sum(1); sx += (X * ex).sum(1); sx2 += (X ** 2 * ex).sum(1)
        active &= ~ex
        lvl = np.where(active, lc, 0.0)

        # --- mark to market
        rem = np.maximum(H - age, 0).astype(float)
        mark_def = (1 + tm.B_OPT) * tm.bachelier_spread_value(lvl, rem * volm ** 2, k2) / k2 - 1
        mark = np.where(isdef, mark_def, lvl / D)
        eq = realized + (risk * mark * active).sum(1)
        eq = np.maximum(eq, 1e-9)
        hwm = np.maximum(hwm, eq); dd = 1 - eq / hwm
        maxdd = np.maximum(maxdd, dd); review |= dd >= 0.20
        eq_prev1 = eq_hist[:, -1].copy(); eq_prev5 = eq_hist[:, 1].copy()
        eq_hist = np.roll(eq_hist, -1, axis=1); eq_hist[:, -1] = eq
        if t == TRADING_DAYS - 1:
            eq_1y = eq.copy()
        if (t + 1) % TRADING_DAYS == 0:
            snap[(t + 1) // TRADING_DAYS] = (n_tr.copy(), sx.copy(), sx2.copy())

        use_limits = policy in ("v2",) and cfg.get("loss_limits", True)
        if use_limits:
            pause_until = np.where(eq / eq_prev1 - 1 <= -0.02, t + 1, pause_until)
            pause_until = np.where(eq / eq_prev5 - 1 <= -0.04, t + 5, pause_until)

        # --- new trades
        k_new = np.minimum(rng.poisson(N / TRADING_DAYS, P), 2)
        for j in range(2):
            want = k_new > j
            if not want.any():
                break
            free = ~active
            has = free.any(1)
            m = want & has & ~(pause_until >= t + 1)
            blocked += want & ~m
            if not m.any():
                continue
            rows = np.nonzero(m)[0]
            slot = np.argmax(free[rows], axis=1)
            n = len(rows)
            Hn = rng.choice(tm.HOLD_DAYS, size=n, p=tm.HOLD_P)
            if book == "stop":
                dn = np.zeros(n, bool)
            elif book == "defined":
                dn = np.ones(n, bool)
            else:
                dn = rng.random(n) < 0.5
            cl = rng.random(n) < 0.7
            ld = np.where(cl, np.sqrt(rho), np.sqrt(0.1) * rng.choice([-1.0, 1.0], n))
            mun = np.where(dn, lookup("defined", Hn, tgt_s, "mu"), lookup("stop", Hn, tgt_s, "mu"))
            sd_claim = np.where(dn, lookup("defined", Hn, 0.1, "sd"), lookup("stop", Hn, 0.1, "sd"))
            smult = np.where(dn, STRESS_MULT["defined"], STRESS_MULT["stop"])
            eqr = eq[rows]
            open_stress = (stress[rows] * active[rows]).sum(1) / eqr
            clus_stress = (stress[rows] * active[rows] * clus[rows]).sum(1) / eqr
            n_cl = (active[rows] & clus[rows]).sum(1)
            if policy.startswith("fixed"):
                r = np.full(n, float(policy.split("_")[1]) / 100)
            elif policy in ("v2", "v2_nocorr"):
                s_used = 0.5 * s_claim
                m_used = s_used * sd_claim
                r_k = 0.25 * m_used / (sd_claim ** 2 + m_used ** 2)
                m_rob = max(s_claim - 0.05, 0.0) * sd_claim
                r_rob = m_rob / (sd_claim ** 2 + m_rob ** 2)
                cap = np.where(dn, cfg.get("def_cap", 0.03), 0.02) / smult
                r = np.minimum(np.minimum(r_k, r_rob), cap)
                if policy == "v2":
                    r = r / (1 + 0.5 * n_cl * cl)
                    if cfg.get("governor", True):
                        r = r * governor_short(dd[rows])
                    room_c = np.where(cl, np.maximum(0.06 - clus_stress, 0), np.inf)
                    room_t = np.maximum(0.10 - open_stress, 0)
                    r = np.minimum(r, np.minimum(room_c, room_t) / smult)
            elif policy == "kelly_full":
                m_c = s_claim * sd_claim
                r = m_c / (sd_claim ** 2 + m_c ** 2)
                r = np.minimum(r, 0.25 / smult)
            else:
                raise ValueError(policy)
            ok = r >= 0.001
            blocked[rows[~ok]] += 1
            rows, slot, r = rows[ok], slot[ok], r[ok]
            if len(rows) == 0:
                continue
            sel = ok
            active[rows, slot] = True; lvl[rows, slot] = 0.0; age[rows, slot] = 0
            H[rows, slot] = Hn[sel]; mu[rows, slot] = mun[sel]; load[rows, slot] = ld[sel]
            clus[rows, slot] = cl[sel]; isdef[rows, slot] = dn[sel]
            risk[rows, slot] = r * eq[rows]; stress[rows, slot] = r * eq[rows] * smult[sel]
            opened[rows] += 1; r_sum[rows] += r

    # --- summaries
    lnW = np.log(np.maximum(eq, 1e-9))
    out = dict(cfg)
    out.update({
        "trades/yr opened": opened.mean() / YEARS,
        "blocked share": blocked.sum() / max(blocked.sum() + opened.sum(), 1),
        "mean risk/trade": r_sum.sum() / max(opened.sum(), 1),
        "E[log growth]/yr": lnW.mean() / YEARS,
        "median CAGR": np.exp(np.median(lnW) / YEARS) - 1,
        "P5 1y return": np.quantile(eq_1y, 0.05) - 1,
        "P(1y loss)": np.mean(eq_1y < 1),
        "median maxDD 3y": np.median(maxdd),
        "P(maxDD>10%)": np.mean(maxdd > 0.10),
        "P(maxDD>20%)": np.mean(maxdd > 0.20),
        "P(maxDD>35%)": np.mean(maxdd > 0.35),
        "P(ruin <10%)": np.mean(eq < 0.10),
    })
    allx = sx.sum() / n_tr.sum()
    allv = sx2.sum() / n_tr.sum() - allx ** 2
    out["realised s"] = allx / np.sqrt(allv)
    for y, (n_, s_, s2_) in snap.items():
        mean = s_ / np.maximum(n_, 1)
        var = np.maximum(s2_ / np.maximum(n_, 1) - mean ** 2, 1e-12) * n_ / np.maximum(n_ - 1, 1)
        tstat = mean / np.sqrt(var / np.maximum(n_, 1))
        crit = stats.t.ppf(0.95, np.maximum(n_ - 1, 1))
        out[f"power {y}y"] = float(np.mean((tstat > crit) & (n_ >= 3)))
    return out


def grid_main():
    cfgs = []
    for N, s, pol in itertools.product((12, 25, 50, 100), (0.0, 0.05, 0.1, 0.2, 0.3),
                                       ("fixed_0.5", "fixed_1.0", "v2")):
        cfgs.append(dict(N=N, s=s, rho=0.3, policy=pol, book="stop", seed=SEED + 7))
    return cfgs


def grid_sensitivity():
    cfgs = []
    for N, s in itertools.product((25, 50, 100), (0.0, 0.1, 0.2)):
        for label, pol, rho, book, reg, ll, gov, dcap in (
                ("v2, rho 0.6", "v2", 0.6, "stop", "iid", True, True, 0.03),
                ("no corr/cluster caps, no governor, rho 0.3", "v2_nocorr", 0.3, "stop", "iid", False, False, 0.03),
                ("no corr/cluster caps, no governor, rho 0.6", "v2_nocorr", 0.6, "stop", "iid", False, False, 0.03),
                ("full Kelly on claimed edge", "kelly_full", 0.3, "stop", "iid", False, False, 0.03),
                ("defined-risk book, 3% premium cap", "v2", 0.3, "defined", "iid", True, True, 0.03),
                ("defined-risk book, 2% premium cap", "v2", 0.3, "defined", "iid", True, True, 0.02),
                ("iid: no loss limits", "v2", 0.3, "stop", "iid", False, True, 0.03),
                ("iid: no loss limits, no governor", "v2", 0.3, "stop", "iid", False, False, 0.03),
                ("regime: v2 (governor + loss limits)", "v2", 0.3, "stop", "switch", True, True, 0.03),
                ("regime: no loss limits", "v2", 0.3, "stop", "switch", False, True, 0.03),
                ("regime: no loss limits, no governor", "v2", 0.3, "stop", "switch", False, False, 0.03)):
            cfgs.append(dict(label=label, N=N, s=s, rho=rho, policy=pol, book=book, regime=reg,
                             loss_limits=ll, governor=gov, def_cap=dcap, seed=SEED + 8))
    return cfgs


def run(cfgs, stem, procs=4):
    table()  # build/cached before forking
    with Pool(procs) as pool:
        res = pool.map(simulate, cfgs)
    df = pd.DataFrame(res)
    save_table(df, stem)
    return df


if __name__ == "__main__":
    import sys
    pd.set_option("display.width", 250); pd.set_option("display.max_columns", 40)
    which = sys.argv[1] if len(sys.argv) > 1 else "main"
    if which == "main":
        df = run(grid_main(), "portfolio_main")
    else:
        df = run(grid_sensitivity(), "portfolio_sensitivity")
    print(df.round(4).to_string())
