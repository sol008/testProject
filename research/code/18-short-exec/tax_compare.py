"""Taxes for 1-60 day trades (track 18, §4).  US federal only; illustrative marginal-rate profiles.

1. Effective rates: every 1-60 day gain is short-term (ordinary rates) unless the instrument is a
   Section 1256 contract (regulated futures, broad-based index options such as SPX/XSP/NDX/RUT):
   60% long-term / 40% short-term regardless of holding period, marked to market at year-end
   (26 U.S.C. 1256(a)).
2. After-tax compounding of a trading sleeve by account/instrument (10 years, Monte Carlo):
   taxable short-term, taxable §1256, 475(f) mark-to-market trader, traditional IRA, Roth IRA.
   Capital losses offset gains; net losses deduct up to $3,000 a year against ordinary income and
   carry forward (26 U.S.C. 1211(b), 1212(b)).  §1256 loss carry-back (1212(c)) is ignored
   (slightly conservative for §1256).
3. Wash sales (26 U.S.C. 1091): how often a losing short-horizon exit is followed or preceded within
   30 days by a purchase of the same underlying, as a function of trades per year and the number of
   distinct underlyings traded; and how often an IRA purchase would make the loss permanent
   (Rev. Rul. 2008-5).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import trade_model as tm
from util18 import SEED, save_table

PROFILES = {
    # name: (ordinary marginal incl. NIIT, long-term marginal incl. NIIT)
    "24% bracket (LT 15%)": (0.24, 0.15),
    "35% bracket + NIIT (LT 18.8%)": (0.388, 0.188),
    "37% bracket + NIIT (LT 23.8%)": (0.408, 0.238),
}


def rate_table():
    rows = []
    for name, (st, lt) in PROFILES.items():
        b = 0.6 * lt + 0.4 * st
        rows.append({"Profile": name, "Short-term rate (stocks, ETFs, equity options, crypto, BTC ETF)": st,
                     "Section 1256 blended (futures, SPX/XSP options)": b,
                     "Tax saved per $100 of gain": 100 * (st - b),
                     "Pre-tax return needed to match 10% after tax: short-term": 0.10 / (1 - st),
                     "...: Section 1256": 0.10 / (1 - b)})
    return pd.DataFrame(rows)


def after_tax_growth(n_sims=20000, years=10, seed=SEED + 61):
    rng = np.random.default_rng(seed)
    rows = []
    for g in (0.02, 0.05, 0.10):
        for acct_size in (100_000, 1_000_000):
            R = np.exp(rng.normal(g, 0.06, (n_sims, years))) - 1   # annual sleeve returns
            for pname, (st, lt) in PROFILES.items():
                blended = 0.6 * lt + 0.4 * st
                res = {}
                for regime in ("Taxable, short-term", "Taxable, Section 1256", "Taxable, 475(f) MTM",
                               "IRA (Roth; or traditional at equal tax rates in and out)"):
                    W = np.full(n_sims, 1.0); cf = np.zeros(n_sims)
                    for y in range(years):
                        gain = W * R[:, y]
                        if regime.startswith("Taxable"):
                            rate = blended if "1256" in regime else st
                            if "475" in regime:
                                tax = gain * st           # losses fully deductible at ordinary rates
                            else:
                                net = gain - cf
                                cf = np.where(net < 0, -net, 0.0)
                                ded = np.minimum(cf, 3000 / acct_size)       # $3k vs ordinary income
                                cf = cf - ded
                                tax = np.where(net > 0, net * rate, 0.0) - ded * st
                            W = W + gain - tax
                        else:
                            W = W + gain
                    res[regime] = np.median(W) ** (1 / years) - 1
                rows.append({"Pre-tax log growth": g, "Account": f"${acct_size:,}", "Profile": pname,
                             **{k: v for k, v in res.items()}})
    return pd.DataFrame(rows)


def wash_sales(n_blocks=50, block_years=20, seed=SEED + 62):
    """Fraction of losing taxable exits that are wash sales (a purchase of the same underlying within
    30 calendar days before or after the loss sale, other than the lot sold), by trades/yr and number
    of distinct underlyings; share made permanent by an IRA purchase; share deferred past Dec 31."""
    rng = np.random.default_rng(seed)
    rows = []
    for N in (25, 50, 100):
        for K in (5, 10, 25, 50):
            for ira_share in (0.0, 0.3):
                ws = perm = yearend = losses = 0
                for _ in range(n_blocks):
                    n = rng.poisson(N * block_years)
                    buy = np.sort(rng.uniform(0, 365 * block_years, n))
                    H = rng.choice(tm.HOLD_DAYS, n, p=tm.HOLD_P) * 365 / 252
                    sell = buy + H * rng.uniform(0.3, 1.0, n)   # stops/targets end many trades early
                    und = rng.integers(0, K, n)
                    loss = rng.random(n) < 0.5
                    ira = rng.random(n) < ira_share
                    for k in range(K):
                        m = und == k
                        b, s_, l, i_ = buy[m], sell[m], loss[m], ira[m]
                        sel = np.nonzero(l & ~i_)[0]
                        if len(sel) == 0:
                            continue
                        W = (b[None, :] >= s_[sel, None] - 30) & (b[None, :] <= s_[sel, None] + 30)
                        W[np.arange(len(sel)), sel] = False
                        hit = W.any(1)
                        ws += hit.sum(); losses += len(sel)
                        perm += (W & i_[None, :]).any(1).sum()
                        yr_end = np.ceil(s_[sel] / 365) * 365
                        held_over = W & (s_[None, :] > yr_end[:, None])
                        yearend += (hit & (s_[sel] > yr_end - 31) & held_over.any(1)).sum()
                rows.append({"Trades/yr": N, "Distinct underlyings": K, "Share of trades in an IRA": ira_share,
                             "Losing exits that are wash sales": ws / max(losses, 1),
                             "... made permanent by an IRA purchase": perm / max(losses, 1),
                             "... deferred past Dec 31": yearend / max(losses, 1)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    pd.set_option("display.width", 260); pd.set_option("display.max_columns", 30)
    rt = rate_table(); save_table(rt, "tax_rates"); print(rt.round(3).to_string())
    at = after_tax_growth(); save_table(at, "tax_after_tax_growth"); print(at.round(4).to_string())
    ws = wash_sales(); save_table(ws, "tax_wash_sales"); print(ws.round(3).to_string())
