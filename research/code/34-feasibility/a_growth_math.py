"""(a) Growth math: what compounding at 100% (or 1000%) a year requires.

Continuous-time Kelly (Merton 1969; Thorp 2006): a strategy with excess return mu, volatility
sigma and Sharpe S = mu/sigma, run at c x Kelly leverage (c = 1 is full Kelly), has
    median log growth  g = r + S^2 (c - c^2/2)   and log-wealth volatility c*S.
So g = ln 2 (+100%/yr) needs S = sqrt((ln 2 - r)/(c - c^2/2)).
Binary bets: a bet paying +b per $ staked with probability p (else -1) has full-Kelly growth
KL(p || 1/(1+b)) per bet (Kelly 1956); N sequential bets a year add N times that.
Outputs: results/a*_*.csv|md.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import optimize, stats

from common34 import SEED, fmt, save_table, rf_daily

R_ANN = 0.04                      # T-bill yield assumed (Sep 2026 ~4.0-4.2%)
R = np.log1p(R_ANN)
TARGETS = {"+30%/yr": np.log(1.3), "+50%/yr": np.log(1.5), "+100%/yr": np.log(2.0), "+1000%/yr": np.log(11.0)}
KELLY_MULTS = {"full Kelly": 1.0, "half Kelly": 0.5, "quarter Kelly": 0.25}
WORLD_WEALTH_2024 = 471e12        # UBS Global Wealth Report 2025 (end-2024, 56 markets, >92% of world wealth)
WORLD_WEALTH_2025 = 471e12 * 1.108  # +10.8% in 2025 (UBS Global Wealth Report 2026)


def growth_c(S, c, r=R):
    return r + S ** 2 * (c - c ** 2 / 2)


def dd_prob_mc(S, c, years=10, n=20_000, steps_per_year=252, levels=(0.5, 0.8), seed=SEED):
    """P(max drawdown >= level within `years`) for a c-Kelly GBM strategy, Monte Carlo."""
    rng = np.random.default_rng(seed)
    g = growth_c(S, c)
    vol = c * S
    dt = 1 / steps_per_year
    out = {lv: 0 for lv in levels}
    losing5 = 0
    chunk = 2_000
    for _ in range(n // chunk):
        z = rng.standard_normal((chunk, years * steps_per_year), dtype=np.float32)
        lw = np.cumsum(g * dt + vol * np.sqrt(dt) * z, axis=1)
        peak = np.maximum.accumulate(np.maximum(lw, 0), axis=1)
        mdd = 1 - np.exp((lw - peak).min(axis=1))
        for lv in levels:
            out[lv] += int((mdd >= lv).sum())
        losing5 += int((lw[:, 5 * steps_per_year - 1] < 0).sum())
    res = {lv: out[lv] / n for lv in levels}
    res["P(behind after 5y)"] = losing5 / n
    return res


def required_sharpe_table():
    rows = []
    for tname, g in TARGETS.items():
        for kname, c in KELLY_MULTS.items():
            S = np.sqrt((g - R) / (c - c ** 2 / 2))
            vol = c * S
            dd = dd_prob_mc(S, c)
            rows.append({
                "target": tname, "sizing": kname, "Sharpe needed": round(S, 2),
                "portfolio volatility": fmt(vol), "leverage vs. a 20%-vol asset": f"{vol / 0.20:.1f}x",
                "P(losing year)": fmt(stats.norm.cdf(-g / vol)),
                "P(behind after 5 years)": fmt(dd["P(behind after 5y)"], digits=1),
                "P(ever -50%)": fmt(0.5 ** (2 / c - 1), digits=1),
                "P(ever -80%)": fmt(0.2 ** (2 / c - 1), digits=1),
                "P(drawdown >=50% within 10y)": fmt(dd[0.5]),
                "P(drawdown >=80% within 10y)": fmt(dd[0.8]),
            })
    return save_table(pd.DataFrame(rows), "a1_required_sharpe")


def sharpe_vs_vol_table():
    rows = []
    g = np.log(2)
    for vol in (0.15, 0.20, 0.30, 0.50, 0.80, 1.14, 1.50, 2.00):
        mu_arith = g + vol ** 2 / 2          # arithmetic (instantaneous) return needed
        S = (mu_arith - R) / vol
        rows.append({"strategy volatility": fmt(vol), "arithmetic return needed": fmt(mu_arith),
                     "Sharpe needed": round(S, 2), "that is x Kelly": round(vol / S, 2)})
    return save_table(pd.DataFrame(rows), "a2_sharpe_needed_by_volatility")


def medallion():
    """Cornell (2020), Table 1 (from Zuckerman 2019): Medallion gross and net annual returns."""
    yrs = list(range(1988, 2019))
    gross = [16.3, 1.0, 77.8, 54.3, 47.0, 53.9, 93.4, 52.9, 44.4, 31.5, 57.1, 35.6, 128.1, 56.6, 51.1,
             44.1, 49.5, 57.7, 84.1, 136.1, 152.1, 74.6, 57.5, 71.1, 56.8, 88.8, 75.0, 69.3, 68.6, 85.4, 76.4]
    net = [9.04, -3.20, 58.24, 39.44, 33.60, 39.12, 70.72, 38.32, 31.52, 21.20, 41.68, 24.48, 98.48,
           33.02, 25.82, 21.90, 24.92, 29.51, 44.30, 73.42, 82.38, 38.98, 29.40, 37.02, 29.01, 46.93,
           39.20, 36.01, 35.62, 45.02, 39.98]
    df = pd.DataFrame({"year": yrs, "gross": np.array(gross) / 100, "net": np.array(net) / 100})
    rf = rf_daily()
    rf_y = (1 + rf).groupby(rf.index.year).prod() - 1
    df["rf"] = rf_y.reindex(df["year"]).values
    out = []
    for col in ("gross", "net"):
        x = df[col]
        cagr = np.prod(1 + x) ** (1 / len(x)) - 1
        S = (x - df["rf"]).mean() / x.std(ddof=1)
        out.append({"series": f"Medallion {col}", "arithmetic mean": fmt(x.mean(), digits=1),
                    "st. dev.": fmt(x.std(ddof=1), digits=1), "compound (CAGR)": fmt(cagr, digits=1),
                    "log growth": round(float(np.log1p(cagr)), 3),
                    "annual Sharpe (excess of T-bills)": round(float(S), 2),
                    "best year": f"{int(df.loc[x.idxmax(), 'year'])} {x.max():+.1%}",
                    "worst year": f"{int(df.loc[x.idxmin(), 'year'])} {x.min():+.1%}",
                    "years >= +100%": int((x >= 1.0).sum()), "years": len(x)})
    save_table(df.assign(gross=df.gross.map(lambda v: f"{v:.1%}"), net=df.net.map(lambda v: f"{v:.1%}"),
                         rf=df.rf.map(lambda v: f"{v:.2%}")), "a3b_medallion_annual")
    return save_table(pd.DataFrame(out), "a3_medallion_summary")


def kelly_growth_binary(p, b, c):
    pi = 1 / (1 + b)
    f = max(0.0, p - (1 - p) / b) * c
    return p * np.log1p(f * b) + (1 - p) * np.log1p(-f), f, pi


def per_bet_table():
    rows = []
    for tname, g_year in (("+100%/yr", np.log(2)), ("+1000%/yr", np.log(11))):
        for N in (52, 26, 12, 4, 1):
            for b in (1, 2, 3, 5, 10):
                for kname, c in (("full Kelly", 1.0), ("half Kelly", 0.5)):
                    need = g_year / N
                    pi = 1 / (1 + b)
                    fn = lambda p: kelly_growth_binary(p, b, c)[0] - need
                    hi = 1 - 1e-12
                    if fn(hi) < 0:
                        p = np.nan
                    else:
                        p = optimize.brentq(fn, pi + 1e-12, hi)
                    if np.isnan(p):
                        rows.append({"target": tname, "bets per year": N, "payoff (win +b, lose -1)": f"+{b}:1",
                                     "sizing": kname, "breakeven win rate": fmt(pi, digits=1),
                                     "win rate needed": "impossible", "edge (pp)": "n/a", "stake": "n/a",
                                     "EV per $ staked": "n/a", "per-bet Sharpe": "n/a"})
                        continue
                    _, f, _ = kelly_growth_binary(p, b, c)
                    ev = p * b - (1 - p)
                    sd = (1 + b) * np.sqrt(p * (1 - p))
                    rows.append({"target": tname, "bets per year": N, "payoff (win +b, lose -1)": f"+{b}:1",
                                 "sizing": kname, "breakeven win rate": fmt(pi, digits=1),
                                 "win rate needed": fmt(p, digits=1), "edge (pp)": round(100 * (p - pi), 1),
                                 "stake": fmt(min(f, 1.0), digits=0), "EV per $ staked": fmt(ev, digits=0),
                                 "per-bet Sharpe": round(ev / sd, 2)})
    df = pd.DataFrame(rows)
    save_table(df, "a4_per_bet_requirements_full")
    # compact view: half Kelly, +100%/yr
    comp = df[(df.target == "+100%/yr") & (df.sizing == "half Kelly") & (df["bets per year"].isin([52, 12, 4]))]
    save_table(comp[["bets per year", "payoff (win +b, lose -1)", "breakeven win rate", "win rate needed",
                     "edge (pp)", "stake", "EV per $ staked", "per-bet Sharpe"]], "a4_per_bet_requirements_compact")
    # Medallion-like edge: 50.75% at even money (Mercer, per Zuckerman 2019)
    p = 0.5075
    g_bet = kelly_growth_binary(p, 1, 1.0)[0]
    med = pd.DataFrame([{
        "edge": "50.75% win rate at even money (Medallion, per Zuckerman 2019)",
        "full-Kelly growth per bet": f"{g_bet:.6f}",
        "independent bets a year for +100%/yr at full Kelly": f"{np.log(2) / g_bet:,.0f}",
        "at half Kelly": f"{np.log(2) / (0.75 * g_bet):,.0f}",
        "annual growth from 52 such bets (full Kelly)": fmt(np.expm1(52 * g_bet), digits=2)}])
    save_table(med, "a4b_medallion_edge_per_bet")
    return df


def compounding_table():
    rows = []
    start = 100_000
    for rate in (0.05, 0.10, 0.30, 0.50, 1.00, 10.0):
        row = {"annual return": f"+{rate:.0%}"}
        for y in (5, 10, 20, 30):
            v = start * (1 + rate) ** y
            if v >= WORLD_WEALTH_2025:
                row[f"$100k after {y}y"] = f"${v:.1e} ({v / WORLD_WEALTH_2025:,.1e}x world wealth)"
            elif v >= 1e12:
                row[f"$100k after {y}y"] = f"${v / 1e12:,.1f} trillion ({v / WORLD_WEALTH_2025:.1%} of world wealth)"
            elif v >= 1e9:
                row[f"$100k after {y}y"] = f"${v / 1e9:,.1f} billion"
            elif v >= 1e6:
                row[f"$100k after {y}y"] = f"${v / 1e6:,.1f} million"
            else:
                row[f"$100k after {y}y"] = f"${v:,.0f}"
        rows.append(row)
    return save_table(pd.DataFrame(rows), "a5_compounding_vs_world_wealth")


def one_big_year():
    """Chance of ending a single year at >= 11x (+1000%)."""
    rows = []
    goal = 11.0
    for theta in (0.0, 0.4, 0.5, 1.0, 1.5, 2.0):
        # Browne (1999): the maximum possible probability, attained only by an all-or-nothing policy
        pstar = stats.norm.cdf(stats.norm.ppf(min(np.exp(R) / goal, 1 - 1e-12)) + theta)
        row = {"Sharpe of the best available strategy": theta,
               "max P(+1000% in one year), all-or-nothing": fmt(pstar, digits=1),
               "max P(two such years in a row)": fmt(pstar ** 2, digits=1),
               "max P(five in a row)": fmt(pstar ** 5, digits=2)}
        for kname, c in (("full Kelly", 1.0), ("half Kelly", 0.5)):
            g = growth_c(theta, c)
            vol = c * theta
            p = float(stats.norm.sf((np.log(goal) - g) / vol)) if vol > 0 else 0.0
            row[f"P(+1000% in one year) at {kname}"] = fmt(p, digits=2)
        rows.append(row)
    df = save_table(pd.DataFrame(rows), "a6_one_1000pct_year")
    # bet sequences that produce one 11x year
    seq = pd.DataFrame([
        {"sequence": "4 all-in double-or-nothing bets, fair coin (p = 50%)", "P(>= 11x)": fmt(0.5 ** 4, digits=1),
         "what happens otherwise": "lose everything (93.8%)"},
        {"sequence": "4 all-in double-or-nothing bets with a real edge (p = 60%)", "P(>= 11x)": fmt(0.6 ** 4, digits=1),
         "what happens otherwise": "lose everything (87.0%)"},
        {"sequence": "52 weekly bets, each must return +4.72% with no losing week", "P(>= 11x)": "needs a 52-week winning streak",
         "what happens otherwise": "at a 60% weekly hit rate, P(52 straight wins) = 3e-12"},
        {"sequence": "1 all-in bet on a fairly priced option that pays 11x", "P(>= 11x)": "about 9% (1/11) or less",
         "what happens otherwise": "lose everything"},
        {"sequence": "All-in on BTC in a mania year (2011, 2013, 2017)", "P(>= 11x)": "3 of 15 full calendar years, none since 2017",
         "what happens otherwise": "-58% to -74% in the following year (2014, 2018, 2022)"},
    ])
    save_table(seq, "a6b_bet_sequences_for_one_11x_year")
    return df


def drawdown_constrained_growth():
    """Risk-constrained Kelly (Busseti, Ryu & Boyd 2016): P(wealth ever falls to alpha of start) <= beta
    holds for a lognormal strategy when the Kelly multiple c <= 2/(1 + lambda), lambda = ln(beta)/ln(alpha)."""
    rows = []
    beta = 0.10
    for dd in (0.20, 0.30, 0.50, 0.80):
        lam = np.log(beta) / np.log(1 - dd)
        c = min(1.0, 2 / (1 + lam))
        row = {"owner's loss tolerance (fall from start, at most 10% chance ever)": f"-{dd:.0%}",
               "max Kelly multiple": round(c, 2)}
        for S in (0.4, 0.5, 0.75, 1.0, 2.0):
            g = growth_c(S, c)
            row[f"median CAGR at Sharpe {S}"] = f"{np.expm1(g):.0%} ({np.log(10) / g:.0f}y to 10x)"
        rows.append(row)
    return save_table(pd.DataFrame(rows), "a7_drawdown_constrained_growth")


def main():
    print(drawdown_constrained_growth().to_string())
    print(required_sharpe_table().to_string())
    print(sharpe_vs_vol_table().to_string())
    print(medallion().to_string())
    per_bet_table()
    print(pd.read_csv("results/a4_per_bet_requirements_compact.csv").to_string())
    print(pd.read_csv("results/a4b_medallion_edge_per_bet.csv").to_string())
    print(compounding_table().to_string())
    print(one_big_year().to_string())


if __name__ == "__main__":
    main()
