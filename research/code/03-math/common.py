"""Shared math for research track 03 (Kelly sizing, growth, ruin).

Everything here is deterministic or seeded. Conventions:
  * A binary trade stakes a fraction f of current wealth. With probability p the
    stake gains b (net, per $1 staked); otherwise it loses a (per $1 staked).
  * Wealth multiplies by (1 + f*b) on a win and (1 - f*a) on a loss.
  * "11x" = +1000 % (the user's stated ambition); ln(11) = 2.398.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
DATA = os.path.join(HERE, "data")
os.makedirs(RESULTS, exist_ok=True)

SEED = 20260928
GOAL = 11.0                # +1000 %
LN_GOAL = float(np.log(GOAL))


@dataclass(frozen=True)
class BinaryTrade:
    name: str
    p: float   # true win probability
    b: float   # net gain per $1 staked when the trade wins
    a: float   # loss per $1 staked when the trade loses (1.0 = whole stake)
    unit: str = "position"  # what the staked fraction refers to

    @property
    def q(self) -> float:
        return 1.0 - self.p

    @property
    def ev(self) -> float:
        """Expected net return per $1 staked."""
        return self.p * self.b - self.q * self.a

    @property
    def sd(self) -> float:
        return (self.a + self.b) * np.sqrt(self.p * self.q)

    @property
    def sharpe(self) -> float:
        """Per-trade Sharpe ratio (mean / sd of return per $1 staked)."""
        return self.ev / self.sd

    @property
    def kelly(self) -> float:
        """Growth-optimal stake: f* = p/a - q/b (0 if no edge)."""
        return max(0.0, self.p / self.a - self.q / self.b)

    @property
    def f_ruin(self) -> float:
        """Stake at which a single loss wipes out all wealth."""
        return 1.0 / self.a

    def growth(self, f):
        """Expected log growth per trade, E[ln(1 + f R)]."""
        f = np.asarray(f, dtype=float)
        with np.errstate(divide="ignore", invalid="ignore"):
            return self.p * np.log1p(f * self.b) + self.q * np.log1p(-f * self.a)

    def log_steps(self, f):
        with np.errstate(divide="ignore"):
            return float(np.log1p(f * self.b)), float(np.log1p(-f * self.a))

    def with_p(self, p: float, name: str | None = None) -> "BinaryTrade":
        return BinaryTrade(name or self.name, p, self.b, self.a, self.unit)


def kelly_binary(p, b, a=1.0):
    """Kelly fraction for a binary bet (vectorised); negative edge -> 0."""
    p = np.asarray(p, dtype=float)
    return np.maximum(0.0, p / a - (1 - p) / b)


# The four representative trade types from the brief ---------------------------------
CRISIS = BinaryTrade("Crisis buy (p=.80, +100%/-40%)", 0.80, 1.0, 0.40, "index exposure")
TREND = BinaryTrade("Trend trade (p=.40, +3R/-1R)", 0.40, 3.0, 1.0, "R (capital at risk to the stop)")
OPTION = BinaryTrade("Convex option (p=.15, +10x/-100%)", 0.15, 10.0, 1.0, "option premium")
EVENT5 = BinaryTrade("Binary event 55c true vs 50c price", 0.55, 1.0, 1.0, "contract cost")
EVENT10 = BinaryTrade("Binary event 60c true vs 50c price", 0.60, 1.0, 1.0, "contract cost")
# Longshot contracts: same +5/+10pp edge but at a 20c market price (odds 4:1)
LONG5 = BinaryTrade("Longshot event 25c true vs 20c price", 0.25, 4.0, 1.0, "contract cost")
LONG10 = BinaryTrade("Longshot event 30c true vs 20c price", 0.30, 4.0, 1.0, "contract cost")

MAIN_TRADES = [CRISIS, TREND, OPTION, EVENT5, EVENT10]
ALL_TRADES = MAIN_TRADES + [LONG5, LONG10]
FRACTIONS = {"full Kelly": 1.0, "half Kelly": 0.5, "quarter Kelly": 0.25}


# Exact finite-horizon calculations for repeated independent binary trades ------------
def terminal_reach_prob(trade: BinaryTrade, f: float, n_max: int, goal: float = GOAL):
    """P(W_n >= goal) for n = 0..n_max, exact (binomial count of wins)."""
    lu, ld = trade.log_steps(f)
    n = np.arange(n_max + 1)
    kmin = np.ceil((np.log(goal) - n * ld) / (lu - ld) - 1e-12)
    kmin = np.maximum(kmin, 0)
    return stats.binom.sf(kmin - 1, n, trade.p)


def hitting_reach_prob(trade: BinaryTrade, f: float, n_max: int, goal: float = GOAL):
    """P(max_{m<=n} W_m >= goal) for n = 0..n_max, exact lattice DP with absorption."""
    lu, ld = trade.log_steps(f)
    lg = np.log(goal)
    probs = np.zeros(n_max + 2)
    probs[0] = 1.0
    hit = np.zeros(n_max + 1)
    cum = 0.0
    k = np.arange(n_max + 2)
    for n in range(1, n_max + 1):
        new = probs * trade.q
        new[1:] += probs[:-1] * trade.p
        logw = k * lu + (n - k) * ld
        absorbed = (logw >= lg - 1e-12) & (k <= n)
        cum += new[absorbed].sum()
        new[absorbed] = 0.0
        probs = new
        hit[n] = cum
    return hit


def first_n_reaching(curve: np.ndarray, target: float):
    idx = np.nonzero(curve >= target)[0]
    return int(idx[0]) if idx.size else None


def terminal_quantiles(trade: BinaryTrade, f: float, n: int, qs=(0.05, 0.5, 0.95)):
    lu, ld = trade.log_steps(f)
    out = []
    for qq in qs:
        k = stats.binom.ppf(qq, n, trade.p)
        out.append(float(np.exp(n * ld + k * (lu - ld))))
    return out


def prob_terminal_below(trade: BinaryTrade, f: float, n: int, level: float):
    lu, ld = trade.log_steps(f)
    # W_n < level  <=>  k < (ln level - n ld)/(lu - ld)
    kcrit = (np.log(level) - n * ld) / (lu - ld)
    kmax = np.ceil(kcrit - 1e-12) - 1   # largest k with W < level
    return float(stats.binom.cdf(kmax, n, trade.p)) if kmax >= 0 else 0.0


def simulate_max_drawdown(trade: BinaryTrade, f: float, n: int, n_paths: int, rng):
    """Monte Carlo max drawdown (fraction of running peak) after n trades."""
    lu, ld = trade.log_steps(f)
    wins = rng.random((n_paths, n), dtype=np.float32) < trade.p
    steps = np.where(wins, np.float32(lu), np.float32(ld))
    logw = np.cumsum(steps, axis=1, dtype=np.float64)
    peak = np.maximum.accumulate(np.maximum(logw, 0.0), axis=1)
    dd = 1.0 - np.exp(logw - peak)
    return dd.max(axis=1), logw[:, -1]


# Data -------------------------------------------------------------------------------
def load_ff_daily():
    """Fama-French daily market (CRSP VW incl. dividends) and 1m T-bill, decimals."""
    path = os.path.join(DATA, "F-F_Research_Data_Factors_daily.csv")
    raw = pd.read_csv(path, skiprows=4, index_col=0)
    raw = raw[pd.to_numeric(raw.index, errors="coerce").notna()]
    raw.index = pd.to_datetime(raw.index.astype(str).str.strip(), format="%Y%m%d")
    raw = raw.apply(pd.to_numeric, errors="coerce").dropna() / 100.0
    df = pd.DataFrame({"mkt": raw["Mkt-RF"] + raw["RF"], "rf": raw["RF"]})
    return df


# Formatting helpers -----------------------------------------------------------------
def fmt_x(v, digits=2):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "n/a"
    if v >= 1e5:
        return f"{v:.1e}x".replace("e+0", "e").replace("e+", "e")
    if v >= 1000:
        return f"{v:,.0f}x"
    if v >= 100:
        return f"{v:.0f}x"
    if v >= 10:
        return f"{v:.1f}x"
    return f"{v:.{digits}f}x"


def fmt_pct(v, digits=0):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "n/a"
    return f"{100 * v:.{digits}f}%"


def to_markdown(df: pd.DataFrame, index=False) -> str:
    """Minimal GitHub-flavoured Markdown table writer (no tabulate dependency)."""
    d = df.reset_index() if index else df
    cols = [str(c) for c in d.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for row in d.itertuples(index=False):
        lines.append("| " + " | ".join(str(v) for v in row) + " |")
    return "\n".join(lines)


def save_table(df: pd.DataFrame, stem: str, index=False):
    df.to_csv(os.path.join(RESULTS, f"{stem}.csv"), index=index)
    with open(os.path.join(RESULTS, f"{stem}.md"), "w") as fh:
        fh.write(to_markdown(df, index=index))
        fh.write("\n")
    return df
