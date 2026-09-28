"""(g) Supporting calculations.

g1  Peters' ergodicity coin (+50 % / -40 %): ensemble average vs what happens to a person.
g2  Fractional Kelly in continuous time: growth kept, P(ever losing x), drawdown-constraint
    mapping c <= 2 / (1 + ln(beta)/ln(alpha)), with Monte Carlo checks.
g3  Grossman-Zhou drawdown control: growth cost check by simulation.
g4  Leverage and volatility drag: long-run growth of 1x/2x/3x index exposure.
g5  Tax drag: why fewer, longer-held trades compound faster after tax.
g6  Kelly sizing for real (lognormal) call options, fairly priced vs rich implied vol.
g7  Costs: Kelly growth is roughly proportional to edge^2, so small costs hurt a lot.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from common import SEED, fmt_pct, fmt_x, save_table


# ----------------------------------------------------------------------------- g1
def part_g1(n_players=100_000, rounds=100):
    rng = np.random.default_rng(SEED + 11)
    heads = rng.binomial(rounds, 0.5, size=n_players)
    rows = []
    for label, f in (("All-in on the gamble each round (f=100%)", 1.0), ("Kelly: stake 25% of wealth each round", 0.25)):
        up, dn = np.log1p(0.5 * f), np.log1p(-0.4 * f)
        lw = heads * up + (rounds - heads) * dn
        w = np.exp(lw)
        rows.append({"Policy": label,
                     "Expected (ensemble) wealth after 100 rounds": fmt_x((1 + 0.05 * f) ** rounds),
                     "Simulated mean": fmt_x(float(w.mean())),
                     "Median": fmt_x(float(np.median(w)), 3),
                     "Time-average growth/round": f"{100 * (0.5 * up + 0.5 * dn):+.2f}%",
                     "P(end below start)": fmt_pct(float(np.mean(w < 1)), 1),
                     "P(end below 1% of start)": fmt_pct(float(np.mean(w < 0.01)), 1),
                     "Share of total wealth held by top 1% of players": fmt_pct(float(np.sort(w)[-n_players // 100:].sum() / w.sum()), 0)})
    df = pd.DataFrame(rows)
    save_table(df, "g1_ergodicity_coin")
    return df


# ----------------------------------------------------------------------------- g2
def part_g2(theta=0.5, years=10, n_paths=20_000, steps_per_year=252):
    """Growth/risk of c x Kelly for a strategy with annual Sharpe theta (GBM, r = 0)."""
    rng = np.random.default_rng(SEED + 12)
    dt = 1 / steps_per_year
    n = years * steps_per_year
    z = rng.standard_normal((n_paths, n))
    rows = []
    for c in (2.0, 1.5, 1.0, 0.75, 0.5, 0.25):
        nu = theta ** 2 * (c - c ** 2 / 2)       # drift of log wealth
        s = c * theta                          # vol of log wealth
        lw = np.cumsum(nu * dt + s * np.sqrt(dt) * z, axis=1)
        lw = np.concatenate([np.zeros((n_paths, 1)), lw], axis=1)
        peak = np.maximum.accumulate(lw, axis=1)
        mdd = 1 - np.exp((lw - peak).min(axis=1))
        expo = 2 / c - 1
        rows.append({"Kelly multiple c": c,
                     "Growth kept (2c - c^2)": fmt_pct(2 * c - c * c),
                     "Vol of log-wealth vs Kelly": f"{c:.2f}x",
                     "P(ever fall to 50% of start) = 0.5^(2/c-1)": fmt_pct(0.5 ** expo) if c < 2 else "100%",
                     "P(ever fall to 20% of start)": fmt_pct(0.2 ** expo, 1) if c < 2 else "100%",
                     f"MC: P(ever <=50% of start within {years}y)": fmt_pct(float(np.mean(lw.min(axis=1) <= np.log(0.5))), 1),
                     f"MC: P(peak-to-trough DD >=50% within {years}y)": fmt_pct(float(np.mean(mdd >= 0.5)), 1),
                     f"MC: median max DD within {years}y": fmt_pct(float(np.median(mdd))),
                     f"Median wealth after {years}y": fmt_x(float(np.exp(nu * years))),
                     "Years to median 11x": (f"{np.log(11) / nu:.0f}" if nu > 0 else "never")})
    df = pd.DataFrame(rows)
    save_table(df, "g2_fractional_kelly_continuous")

    # mapping from a drawdown tolerance to the maximum Kelly multiple (GBM, exact; RCK bound)
    mrows = []
    for alpha in (0.5, 0.6, 0.7, 0.8):
        row = {"Never fall below (fraction of starting wealth) alpha": f"{alpha:.0%}"}
        for beta in (0.05, 0.10, 0.25):
            lam = np.log(beta) / np.log(alpha)
            row[f"with prob <= {beta:.0%}: max c"] = round(2 / (1 + lam), 2)
        mrows.append(row)
    dfm = pd.DataFrame(mrows)
    save_table(dfm, "g2_drawdown_tolerance_to_kelly_multiple")
    return df, dfm


# ----------------------------------------------------------------------------- g3
def part_g3(theta=0.5, sigma=0.2, years=50, n_paths=4000, steps_per_year=252):
    rng = np.random.default_rng(SEED + 13)
    dt = 1 / steps_per_year
    n = years * steps_per_year
    mu = theta * sigma                # excess drift of the risky asset (r = 0)
    fstar = mu / sigma ** 2
    rows = []
    policies = [("Full Kelly (no constraint)", None, 1.0), ("Half Kelly (no constraint)", None, 0.5),
                ("Grossman-Zhou floor 50% of peak", 0.5, 1.0), ("Grossman-Zhou floor 70% of peak", 0.7, 1.0),
                ("Grossman-Zhou floor 70% of peak, half Kelly on cushion", 0.7, 0.5)]
    z = rng.standard_normal((n, n_paths))
    for label, alpha, k in policies:
        W = np.ones(n_paths)
        M = np.ones(n_paths)
        mdd = np.zeros(n_paths)
        for t in range(n):
            if alpha is None:
                e = k * fstar
            else:
                e = k * fstar * np.maximum(W - alpha * M, 0) / W
            ret = np.exp((mu - 0.5 * sigma ** 2) * dt + sigma * np.sqrt(dt) * z[t]) - 1   # exact GBM step
            W = W * (1 + e * ret)
            M = np.maximum(M, W)
            mdd = np.maximum(mdd, 1 - W / M)
        g = np.log(W).mean() / years
        rows.append({"Policy": label, "Realised growth/yr": f"{100 * g:.2f}%",
                     "vs Kelly theory theta^2/2": f"{100 * g / (theta ** 2 / 2):.0f}%",
                     "Theory for GZ: (1-alpha) x Kelly growth": (f"{100 * (1 - alpha) * k * (2 - k):.0f}%" if alpha else "-"),
                     "Worst max-DD across paths": fmt_pct(float(mdd.max()), 1),
                     "Median max-DD": fmt_pct(float(np.median(mdd)))})
    df = pd.DataFrame(rows)
    save_table(df, "g3_grossman_zhou_growth_cost")
    return df


# ----------------------------------------------------------------------------- g4
def part_g4(r=0.035):
    rows = []
    for prem in (0.03, 0.05, 0.07):
        for sigma in (0.15, 0.18, 0.22):
            row = {"Equity premium (arith.)": fmt_pct(prem), "Index vol": fmt_pct(sigma)}
            for L in (1, 1.5, 2, 3):
                cost = 0.0003 if L == 1 else (0.015 * (L - 1) if L == 1.5 else 0.009 + 0.005 * (L - 1))
                g = r + L * prem - L ** 2 * sigma ** 2 / 2 - cost
                row[f"{L}x growth/yr"] = f"{100 * g:.1f}%"
            row["Kelly leverage (prem-0.5%)/vol^2"] = f"{(prem - 0.005) / sigma ** 2:.1f}x"
            rows.append(row)
    df = pd.DataFrame(rows)
    save_table(df, "g4_leverage_volatility_drag")
    return df


# ----------------------------------------------------------------------------- g5
def part_g5(years=20):
    rows = []
    for pre in (0.10, 0.15, 0.20):
        row = {"Pre-tax return": fmt_pct(pre), "No tax": fmt_x((1 + pre) ** years)}
        row["Realised yearly, short-term (40.8%)"] = fmt_x((1 + pre * (1 - 0.408)) ** years)
        row["Realised yearly, long-term (23.8%)"] = fmt_x((1 + pre * (1 - 0.238)) ** years)
        row["Deferred, taxed once at end (23.8%)"] = fmt_x(1 + ((1 + pre) ** years - 1) * (1 - 0.238))
        rows.append(row)
    # pre-tax CAGR needed for 11x after tax in 20 years
    need = {"Pre-tax return": "needed for 11x after tax", "No tax": f"{100 * (11 ** (1 / years) - 1):.1f}%"}
    need["Realised yearly, short-term (40.8%)"] = f"{100 * (11 ** (1 / years) - 1) / (1 - 0.408):.1f}%"
    need["Realised yearly, long-term (23.8%)"] = f"{100 * (11 ** (1 / years) - 1) / (1 - 0.238):.1f}%"
    need["Deferred, taxed once at end (23.8%)"] = f"{100 * ((1 + 10 / (1 - 0.238)) ** (1 / years) - 1):.1f}%"
    rows.append(need)
    df = pd.DataFrame(rows)
    save_table(df, "g5_tax_drag_20y")
    return df


# ----------------------------------------------------------------------------- g6
def bs_call(S, K, T, r, vol):
    d1 = (np.log(S / K) + (r + vol ** 2 / 2) * T) / (vol * np.sqrt(T))
    d2 = d1 - vol * np.sqrt(T)
    return S * stats.norm.cdf(d1) - K * np.exp(-r * T) * stats.norm.cdf(d2)


def part_g6(S=100.0, T=1.0, r=0.035, mu=0.08, sigma=0.20):
    z = np.linspace(-9, 9, 40001)
    w = stats.norm.pdf(z)
    w /= w.sum()
    ST = S * np.exp((mu - sigma ** 2 / 2) * T + sigma * np.sqrt(T) * z)
    rows = []
    fgrid = np.linspace(0, 1, 20001)
    for iv in (0.20, 0.23):
        for K in (100, 110, 120, 130):
            C = bs_call(S, K, T, r, iv)
            R = np.maximum(ST - K, 0) / C - 1
            ev = float(np.sum(w * R))
            # E[log(1 + f R)] on a grid of premium fractions (R >= -1 so f <= 1 keeps wealth >= 0)
            G = np.array([np.sum(w * np.log1p(f * R)) if f < 1 else -np.inf for f in fgrid[::50]])
            j = int(np.argmax(G))
            rows.append({"Implied vol (real vol 20%)": fmt_pct(iv), "Strike (% of spot)": f"{K}%",
                         "Premium": f"{C:.2f}", "Expected return on premium": f"{100 * ev:+.0f}%",
                         "P(profit)": fmt_pct(float(np.sum(w * (R > 0)))),
                         "P(>=10x premium)": fmt_pct(float(np.sum(w * (R >= 9))), 1),
                         "Kelly premium as % of wealth": f"{100 * fgrid[::50][j]:.1f}%",
                         "Kelly growth/yr": f"{100 * G[j]:.2f}%"})
    # for reference: the underlying itself
    df = pd.DataFrame(rows)
    save_table(df, "g6_kelly_for_call_options")
    stock_kelly = (mu - r) / sigma ** 2
    return df, stock_kelly, r + (mu - r) ** 2 / (2 * sigma ** 2)


# ----------------------------------------------------------------------------- g7
def part_g7():
    from common import BinaryTrade
    rows = []
    cases = []
    for cost in (0.0, 0.01, 0.02, 0.03):     # cents per $1 contract bought at 50c (fees+spread)
        price = 0.50 + cost
        cases.append(("Binary event, true p=.55, price 50c", f"{100 * cost:.0f}c per contract",
                      BinaryTrade("", 0.55, (1 - price) / price, 1.0)))
    for slip in (0.0, 0.1, 0.2, 0.3):         # slippage/commissions in R per trade
        cases.append(("Trend trade p=.40, +3R/-1R", f"{slip:.1f}R per trade",
                      BinaryTrade("", 0.40, 3.0 - slip, 1.0 + slip)))
    for spread in (0.0, 0.05, 0.10, 0.20):    # round-trip option spread as fraction of premium
        cases.append(("Convex option p=.15, +10x/-100%", f"{100 * spread:.0f}% of premium",
                      BinaryTrade("", 0.15, 10.0 * (1 - spread) - spread, 1.0)))
    base = {}
    for name, cost, t in cases:
        g = float(t.growth(t.kelly)) if t.kelly > 0 else 0.0
        base.setdefault(name, g)
        rows.append({"Trade": name, "Round-trip cost": cost, "EV per $ staked": f"{100 * t.ev:+.1f}%",
                     "Kelly stake": f"{100 * t.kelly:.1f}%", "Kelly growth/trade": f"{g:.4f}",
                     "Growth vs no-cost": fmt_pct(g / base[name]) if base[name] > 0 else "n/a",
                     "Trades for median 11x (full Kelly)": (f"{np.log(11) / g:.0f}" if g > 0 else "never")})
    df = pd.DataFrame(rows)
    save_table(df, "g7_costs_vs_growth")
    return df


if __name__ == "__main__":
    print(part_g7().to_string())
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    print(part_g1().to_string())
    a, b = part_g2()
    print(a.to_string())
    print(b.to_string())
    print(part_g3().to_string())
    print(part_g4().to_string())
    print(part_g5().to_string())
    d, sk, sg = part_g6()
    print(d.to_string())
    print(f"Stock Kelly leverage {sk:.2f}x, growth {100 * sg:.2f}%/yr")
