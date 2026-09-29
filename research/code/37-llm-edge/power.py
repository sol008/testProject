"""Track 37: the pre-registered promotion test's power, its deflated-Sharpe bar, the weeks it needs, and the cost of
the shadow book per week.

Deflated Sharpe: Bailey & Lopez de Prado (2014), in the form used by track 23 (`common23.deflated_sr`): the null
Sharpe is the expected maximum of N trials, sqrt(1/(T-1)) * E[max z_N]; the probability that the observed per-trade
Sharpe beats it is Phi((SR - SR0) sqrt(T-1) / den). With den = 1 (no skew, kurtosis 3) a DSR of 0.95 needs an
observed t of about 1.645 + E[max z_N]. The design's clustered t >= 2.5 (EDGAR book) is applied as well.

Run: python3 power.py  -> prints the tables and writes results/power_mde.csv, results/power_weeks.csv,
results/cost_per_week.csv.
"""
from __future__ import annotations

import math
import os

import pandas as pd
from scipy import stats

# ---- per-trade dispersion by cell (assumed; the review measures the real ones from the book) ----------------------
SIGMA = {  # standard deviation of the excess return per event, vs the size-matched ETF
    ("large", "day1"): 0.020, ("small", "day1"): 0.040,   # an 8-K day moves a small cap about 4%, a large cap 2%
    ("large", "week"): 0.030, ("small", "week"): 0.060,   # five sessions
}
TRIALS = 8                 # {large, small} x {day1, week} x {long-only, long-short}: all pre-registered cells
DSR_MIN = 0.95
T_MIN = 2.5                # the EDGAR book's clustered-t bar (docs/phase-b/edgar.md)
EFFECTS = [0.005, 0.010, 0.015]
NS = [50, 100, 150, 200, 300, 400, 600, 900]

# ---- event flow (assumed; the book counts the real one) -----------------------------------------------------------
NAMES = {"large": 100, "small": 200}
EIGHT_KS_PER_NAME_PER_YEAR = 9.0        # a typical listed company files about 8-10 8-Ks a year
GOOD_SHARE, BAD_SHARE = 0.35, 0.25      # Lopez-Lira & Tang: the median score is 0, about half the headlines are non-zero
WEEKS_PER_YEAR = 52

# ---- cost (per million tokens, input / output; platform.claude.com/docs pricing page, cached 2026-09-25) ------------
PRICE_TIERS = {"$1 / $5": (1, 5), "$2 / $10": (2, 10), "$4 / $20": (4, 20), "$10 / $50": (10, 50)}
TOKENS_IN = 2400            # about 400 for the prompt and 2,000 for 1,500 words of filing text
TOKENS_OUT = 60             # one JSON object
FILINGS_PER_WEEK_CAP = 60
PLACEBO_FILINGS = 500       # the one-off memorization check


def expected_max_z(N: int) -> float:
    if N <= 1:
        return 0.0
    g = 0.5772156649
    return float((1 - g) * stats.norm.ppf(1 - 1 / N) + g * stats.norm.ppf(1 - 1 / (N * math.e)))


def t_bar(N: int, dsr: float = DSR_MIN, t_min: float = T_MIN) -> float:
    """The observed t that gives a deflated-Sharpe probability of `dsr` with N trials (den = 1), floored at t_min."""
    return max(t_min, stats.norm.ppf(dsr) + expected_max_z(N))


def mde_table() -> pd.DataFrame:
    rows = []
    for (bucket, horizon), sigma in SIGMA.items():
        for N in (1, TRIALS):
            tb = t_bar(N)
            for n in NS:
                rows.append({"bucket": bucket, "horizon": horizon, "sigma": sigma, "trials": N, "t_bar": round(tb, 2),
                             "n": n, "min_detectable_mean_pct": round(100 * tb * sigma / math.sqrt(n), 2)})
    return pd.DataFrame(rows)


def weeks_table() -> pd.DataFrame:
    filings_per_week = {b: NAMES[b] * EIGHT_KS_PER_NAME_PER_YEAR / WEEKS_PER_YEAR for b in NAMES}
    total = sum(filings_per_week.values())
    scale = min(1.0, FILINGS_PER_WEEK_CAP / total)
    rows = []
    for (bucket, horizon), sigma in SIGMA.items():
        good_per_week = filings_per_week[bucket] * scale * GOOD_SHARE
        for eff in EFFECTS:
            for N in (1, TRIALS):
                n_needed = math.ceil((t_bar(N) * sigma / eff) ** 2)
                rows.append({"bucket": bucket, "horizon": horizon, "effect_pct": 100 * eff, "trials": N,
                             "t_bar": round(t_bar(N), 2), "n_needed": n_needed,
                             "good_events_per_week": round(good_per_week, 1),
                             "weeks_needed": math.ceil(n_needed / good_per_week),
                             "years_needed": round(n_needed / good_per_week / WEEKS_PER_YEAR, 1)})
    return pd.DataFrame(rows), filings_per_week, scale


def hit_rate_n(p: float, z: float = T_MIN) -> int:
    """Scored filings needed so that a hit rate p is z standard errors above 0.5 (binomial at 0.5)."""
    return math.ceil((z * 0.5 / (p - 0.5)) ** 2)


def cost_table(filings_per_week: float) -> pd.DataFrame:
    rows = []
    for tier, (pin, pout) in PRICE_TIERS.items():
        per_call = TOKENS_IN * pin / 1e6 + TOKENS_OUT * pout / 1e6
        rows.append({"price_tier_in/out_per_Mtok": tier, "per_filing_usd": round(per_call, 4),
                     "per_week_usd": round(per_call * filings_per_week, 2),
                     "per_week_batch_api_usd": round(per_call * filings_per_week / 2, 2),
                     "per_year_usd": round(per_call * filings_per_week * WEEKS_PER_YEAR, 0),
                     "placebo_once_usd": round(per_call * PLACEBO_FILINGS, 2)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, "results"), exist_ok=True)
    pd.set_option("display.width", 220)
    print(f"E[max z] at N={TRIALS}: {expected_max_z(TRIALS):.3f}; t bar for DSR >= {DSR_MIN}: N=1 -> "
          f"{t_bar(1):.2f} (floored at {T_MIN}), N={TRIALS} -> {t_bar(TRIALS):.2f}\n")
    mde = mde_table()
    print("Minimum detectable mean net excess per event (%), by cell, trials and n:")
    print(mde[mde.n.isin([100, 150, 300, 600])].to_string(index=False))
    mde.to_csv(os.path.join(here, "results", "power_mde.csv"), index=False)
    wk, fpw, scale = weeks_table()
    print(f"\nEvent flow: 8-Ks per week large {fpw['large']:.1f}, small {fpw['small']:.1f}; cap {FILINGS_PER_WEEK_CAP} "
          f"-> scale {scale:.2f}; GOOD share {GOOD_SHARE:.0%}")
    print("\nWeeks of shadow needed to detect an effect at the bar:")
    print(wk.to_string(index=False))
    wk.to_csv(os.path.join(here, "results", "power_weeks.csv"), index=False)
    print(f"\nHit-rate check (all scored filings, sign of score vs sign of day-1 excess), z >= {T_MIN}: "
          f"55% needs n={hit_rate_n(0.55)}, 56% needs n={hit_rate_n(0.56)}, 58% needs n={hit_rate_n(0.58)}, "
          f"60% needs n={hit_rate_n(0.60)}")
    cost = cost_table(min(sum(fpw.values()), FILINGS_PER_WEEK_CAP))
    print(f"\nCost per week at {min(sum(fpw.values()), FILINGS_PER_WEEK_CAP):.0f} filings a week, "
          f"{TOKENS_IN} in / {TOKENS_OUT} out tokens each:")
    print(cost.to_string(index=False))
    cost.to_csv(os.path.join(here, "results", "cost_per_week.csv"), index=False)
