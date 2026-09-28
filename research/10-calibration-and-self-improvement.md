# Track 10: Retrospective calibration and monthly self-improvement (without fooling ourselves)

Research date: 2026-09-28 (Track 10 of 10).
Code: `research/code/10-calibration/`. Every number marked "(sim)" can be reproduced with `python run_all.py` (fixed seeds, about 90 seconds on 4 CPUs). Raw output is in `results/results.json`. There are 10 sanity tests: `python test_reference.py`.

---

## TL;DR

1. **Realized P&L cannot teach this system anything within a useful time frame.** At 12–24 trades a year, proving an edge from wins and losses takes years to decades.
   - An annual Sharpe of 1.0 needs about **6.2 years** of live results before it is detectable (80% power, one-sided 5%).
   - An option-style bet paying +4x or −1x with a 25% hit rate (+25% expected value per trade) needs **433 trades**, which is 36 years at 12 trades a year.
   - So the monthly loop must learn mainly from **scored forecasts**, not from P&L.
2. **Score about 60× more forecasts** (about 4,400 a year instead of about 72 from live trades alone). Three sources:
   - Every recommendation carries about 6 pre-registered sub-forecasts that resolve mechanically.
   - A **shadow book** scores the scanner's top-30 rejected candidates plus 10 random controls with the same forecasts.
   - A **calibration gym** poses about 200 cheap, standardized questions a month.
   - In simulation, a forecaster with real skill (1-month IC ≈ 0.09) is confirmed as better than the market within 12 months in **82%** of runs, using scheduled reviews that are valid under repeated looks. Live trades alone give 28%, and live P&L gives 11%. Proving it from P&L needs about 77 months of trades.
3. **Score forecasts against the market, using the log score and physical (real-world) probabilities, with tests clustered by month.**
   - The log-score difference versus market-implied probabilities is exactly the log-growth a Kelly bettor would have earned at market odds. That makes it the score that matches a goal of compounding % return.
   - Risk-neutral option probabilities count the equity risk premium as "skill". Treating questions as independent when they share a monthly market move made a miscalibrated perma-bull **look skilled in 15–26% of simulated histories, versus 1–3%** with month-clustered tests.
4. **Recalibrate before judging skill, and only when the data justify it.**
   - An informative but overconfident forecaster (the typical LLM failure) scores worse than the market on raw probabilities: under 1% detection.
   - After rolling Platt maps, fitted per question family and out-of-sample, it is detected in 80% of runs by 36 months (sim).
   - Platt scaling works from about 100–150 resolved questions per family. Isotonic needs about 1000 or more.
   - Unconditional Platt scaling *harms* an already-calibrated forecaster in 56–99% of samples (sim). So a map is adopted only when a likelihood-ratio test finds miscalibration.
5. **Looking every month requires "anytime-valid" statistics.**
   - Monthly t-tests on a zero-edge strategy "discover" an edge **16% of the time within 1 year and 27% within 5 years**.
   - A mixture e-process (an evidence measure designed to stay valid however often you check it) stays at **≤1.7%** (sim).
   - Every "is it working?" and "adopt this change?" decision should use either e-values or a fixed calendar of pre-registered reviews with the error budget split across them.
6. **Rule changes must be guarded: pre-registered, then validated forward.**
   - With realistic P&L noise, "switch to the best recent variant" changed rules 17–44 times in 5 years.
   - It ended on a rule *worse than the original* in 30–46% of runs, and when most tweaks were harmful it lost 18–28 bp/month after switching costs (sim).
   - The guarded loop works in three steps: nominate a change using past data, shadow-test it on fresh data, and adopt it only if P(better) ≥ 0.95 under a skeptical prior.
   - It almost never changes on P&L evidence, which is correct. On forecast-score evidence it captured 58% of the achievable improvement with about 1 switch in 5 years.
7. **Normal drawdowns are large, and streaks are common.**
   - A strategy with a *true* Sharpe of 1.0 has a 95th-percentile 2-year maximum drawdown of 37%.
   - A lumpy book (12 trades/yr, +3R/−1R, 35% hit rate, positive expected value) has a **69% chance of ≥5 consecutive losses within 24 trades**.
   - Even a CUSUM detector needs a median of 21 trades to notice an edge that has vanished.
   - So strategies are retired on thesis invalidation or on pre-registered sequential tests, never on a drawdown alone.
8. **Shrink everything toward sensible priors.**
   - Use Beta or Normal-Inverse-Gamma priors worth 20–50 trades, pooling across archetypes, and fractional Kelly sizing on the posterior predictive.
   - After 5 straight wins, naive quarter-Kelly sizing (using the raw win rate) jumps to 25% of equity. A strength-50 prior moves it only from 2.1% to 4.2%.
   - A strength-20 prior *switches a sound archetype off* after a 5-loss streak, which such a book suffers in 42% of 24-trade spans. Use strength of about 50 and a probation floor.
9. **LLM-specific safeguards come from separation of powers.**
   - The evaluator code is frozen and hash-pinned, and the LLM cannot edit it. Frontier models have been documented rewriting tests and scorers (METR 2025).
   - Decisions are blind re-graded before the outcome is revealed.
   - The ledger is append-only and hash-chained, and its head hash is emailed to the user every month.
   - No LLM backtest over the model's own training period counts as evidence, because look-ahead contamination is documented for 2023–2026.
   - Every model upgrade is treated as a new, uncalibrated forecaster.
10. **Change budget:**
    - At most 2 registered change proposals a month, each validated forward and reversible.
    - Structural changes at most 1 per quarter.
    - Risk-limit increases need the human owner, at least 30 closed trades, and a cooling-off period after a lucky month.

---

## 1. Why this is the hardest part of the system

- **Breadth is tiny.** Grinold's (1989) fundamental law gives IR ≈ IC·√BR, where IR is the information ratio, IC the information coefficient (correlation of forecasts with outcomes) and BR the number of independent bets per year.
  - With BR ≈ 12, an IR of 1.0 needs IC ≈ 0.29.
  - That is 3–10× the IC of good systematic stock-selection signals.
  - So each recommendation must be very well informed, and it produces almost no statistical feedback.
- **Few trades make outcomes noisy judges of decisions.**
  - With normally distributed returns, a strategy with a true annual Sharpe of 1.0 still loses money in about 1 year in 6 (Φ(−1) ≈ 16%). At Sharpe 0.5 it is about 1 year in 3.
  - A 12-trade year is essentially one noisy draw.
  - Judging decisions by outcomes is **outcome bias**, which Baron & Hershey (1988) showed experimentally. Duke (2018) calls it **resulting**.
- **Self-improvement is an overfitting machine unless constrained.**
  - McLean & Pontiff (2016): published return predictors earn 26% less out-of-sample and 58% less after publication.
  - Wiecki et al. (2016): across 888 Quantopian strategies, backtest Sharpe explained R² < 0.025 of out-of-sample Sharpe, and more backtesting predicted a *larger* shortfall.
  - An LLM that rewrites its own rules every month, based on the last few outcomes, runs exactly this experiment.
- **Live evidence that luck dominates short records.**
  - In Nof1's Alpha Arena Season 1 (18 Oct – 3 Nov 2025), six frontier LLMs each traded $10k of real money in crypto perpetuals.
  - Results ranged from **+22% to −59% in 16 days**, and four of six lost money (ForkLog, 2025).
  - Nothing about skill can be inferred from that spread. It mostly reflects leverage and risk control.

**Design consequence.** The monthly loop is built around three evidence streams, in decreasing order of statistical power:

1. Scored probabilistic forecasts (live, shadow and gym).
2. Process quality, graded blind.
3. P&L, which is reported but treated as the slowest and noisiest signal.

---

## 2. What forecasting science says, translated into rules

### 2.1 Good Judgment Project / superforecasting findings

| Finding | Evidence | Rule for this system |
|---|---|---|
| Keeping score with proper scoring rules, and tracking forecasters, works | GJP beat the IARPA control group by 60% in year 1 and 78% in year 2 (Tetlock & Gardner 2015). The top 2% ("superforecasters") did **not** regress to the mean over two years (Mellers et al. 2015). | Every probability is scored. Track records are kept per forecaster configuration (model, prompt, aggregation) and per archetype. Aggregation weight goes to what has been shown to work. |
| Training in base rates / reference classes helps cheaply | Under 1 hour of "CHAMPS KNOW" training improved Brier scores by 6–11% (Chang et al. 2016; Mellers et al. 2014). | Every forecast is **anchored on a logged base rate** (outside view) before the inside view. The adjustment itself is scored: does moving away from the base rate help? |
| **Noise** is the largest removable error | BIN model: removing noise would cut control-group Brier by about 50%, removing bias by about 25%, and more information would deliver the remaining 25%. Training works "almost entirely through noise reduction" (Satopää et al. 2021). | Take several LLM samples and aggregate them (median log-odds). Freeze prompts. Run a monthly **noise audit**: re-ask 20 past questions from frozen snapshots and measure the dispersion (in the style of Kahneman, Sibony & Sunstein 2021). |
| Granularity has value | Coarsening 888,328 GJP forecasts into verbal-style bins consistently lost accuracy (Friedman et al. 2018). | Use 1-percentage-point probabilities and never verbal buckets. Clip to [1%, 99%] only for log scoring. |
| Frequent small updates beat rare big ones | Update magnitude was the strongest behavioral correlate of accuracy, and training made updates smaller (Atanasov et al. 2020). | Open-trade forecasts are updated weekly in small steps unless hard news arrives. **The entry forecast is never overwritten**: updates are new records. The decision is judged on the entry forecast. |
| Aggregates of partly independent forecasters are under-confident, so extremize them | The optimal extremizing factor in GJP data was 1.16–3.92 in log-odds (Satopää et al. 2014; Baron et al. 2014). | **Estimate the factor rather than assume it.** It is simply the Platt slope b > 1. LLM samples share one information set, so expect b ≤ 1 (they need shrinking, not extremizing) unless genuinely diverse models are combined. |
| LLMs are close to, but not yet at, the best human forecasters | ForecastBench (Jan 2026): superforecasters 0.085 vs 0.102 for the best LLM configurations (difficulty-adjusted Brier). Parity was projected for about Nov 2026 (95% CI Jan 2026 – Nov 2027). Halawi et al. (2024): retrieval-augmented LLM 0.179 vs crowd 0.149 (random = 0.25). | Treat raw LLM probabilities as **uncalibrated inputs**. Measure them against the relevant crowd, which in markets is **the price**. The parity projection should be re-checked, since this research could not verify post-March-2026 leaderboard updates. |
| LLM confidence is systematically distorted | Verbalized confidence is overconfident (Xiong et al. 2024). In OptimismBench, 14 of 16 models are **optimistic**, with the sign set by post-training (Cho & Koshiyama 2026). | Track calibration-in-the-large every month. Ask inverted pairs, P(up) and P(down) separately, and flag when their sum is ≠ 1. Expect a bullish tilt and correct it. |

### 2.2 Scoring rules: what to use for what

| Object scored | Primary score | Secondary diagnostics | Reason |
|---|---|---|---|
| Binary sub-questions | **Log-score differential versus the physical market-implied probability** (nats per question, p clipped to [0.01, 0.99]) | Brier score, Brier skill score vs market and vs base rate, reliability table, CORP decomposition, calibration slope and intercept, sharpness | Log score is strictly proper (Good 1952; Gneiting & Raftery 2007). Its differential versus price q equals Kelly log-growth at market odds (Kelly 1956; see the test in the code), which matches the objective. Brier is bounded and robust in small samples. |
| Return distributions (quantiles 5…95%) | CRPS via averaged pinball losses | PIT histogram (probability integral transform); 50/80/90% interval coverage; interval score | CRPS is proper for whole distributions (Matheson & Winkler 1976; Gneiting & Raftery 2007). PIT checks calibration (Dawid 1984; Diebold et al. 1998). |
| Trade selection | **Selection alpha**: selected trade minus random shadow controls, paired by month | Selected vs top-K rejected; hit rate; payoff ratio | Scores the *decision to pick*, not just the forecast. |
| Process | Blind decision-quality rubric (1–5 per item) | Pre-mortem hit rate; outcome-bias gap (blind grade minus outcome-aware grade) | Feedback that does not depend on the outcome (Duke 2018). |

Throughout, calibration is *necessary* but not sufficient. The goal is "maximize sharpness subject to calibration" (Gneiting, Balabdaoui & Raftery 2007), which the resolution and discrimination terms measure.

### 2.3 Decision quality vs outcome quality; pre-mortems

- **Resulting and the 2×2 grid** (Duke 2018): {good or bad decision} × {good or bad outcome}. Only the "deserved loss" and "dumb luck" cells should generate process changes. "Bad luck" should *not*, unless the size of that risk was mis-estimated, which the PIT value reveals.
- **Kill criteria** (Duke 2022, *Quit*): each trade and each strategy sleeve pre-registers "states and dates" that end it. This takes the decision away from in-the-moment judgment.
- **Hindsight bias** (Fischhoff 1975) and **outcome bias** (Baron & Hershey 1988) are the two biases a post-mortem is most exposed to.
  - The countermeasure is **blind re-grading**. A reviewer model grades the decision from the frozen pre-trade snapshot *before* seeing the outcome.
  - It then grades again after the outcome. The gap is logged as a measured outcome-bias statistic.
- **Pre-mortem** (Klein 2007): imagine the trade has failed and list why.
  - "Prospective hindsight" increased the ability to identify reasons for future outcomes by about 30% (Mitchell, Russo & Pennington 1989, cited in Klein 2007).
  - Each recommendation ships a pre-mortem: failure modes with probabilities that must be consistent with 1 − P(success).
  - The monthly loop tracks the **pre-mortem hit rate**, meaning the share of losses whose realized cause was on the list. A high hit rate means risks were taken knowingly. A low hit rate means blind spots.

---

## 3. The small-sample problem, quantified

### 3.1 Detection from P&L alone (analytic; one-sided α = 5%, power 80%)

**Years of track record needed to detect an annual Sharpe ratio S.** This is T = ((z₀.₉₅ + z₀.₈)/S)², independent of trade count:

| Annual Sharpe | 0.25 | 0.5 | 0.75 | 1.0 | 1.5 | 2.0 | 3.0 |
|---|---|---|---|---|---|---|---|
| Years needed | 98.9 | 24.7 | 11.0 | **6.2** | 2.7 | 1.5 | 0.7 |

**Per-trade view.** Here s is the per-trade Sharpe (mean/sd of one trade's return):

| Per-trade Sharpe | 0.1 | 0.2 | 0.3 | 0.5 | 0.75 |
|---|---|---|---|---|---|
| Trades needed | 618 | 155 | 69 | 25 | 11 |
| Years at 12 trades/yr | 51.5 | 12.9 | 5.7 | 2.1 | 0.9 |
| Years at 24 trades/yr | 25.8 | 6.4 | 2.9 | 1.0 | 0.5 |

**Hit rate against a 50% null** (exact binomial test):

| True hit rate | 55% | 60% | 65% | 70% | 80% |
|---|---|---|---|---|---|
| Trades needed | 620 | 158 | 69 | 37 | 18 |
| Years at 12 trades/yr | 51.7 | 13.2 | 5.8 | 3.1 | 1.5 |

**Option-like, asymmetric payoffs.** This is the likely shape of a "few trades, maximize % return" book. The null is the break-even hit rate, tested with an exact binomial test.

| Payoff (× premium) | Break-even hit | True hit | EV per trade | Trades needed | Years at 12/yr |
|---|---|---|---|---|---|
| +4 / −1 | 20% | 25% | +0.25 | **433** | 36.1 |
| +4 / −1 | 20% | 30% | +0.50 | 116 | 9.7 |
| +9 / −1 | 10% | 15% | +0.50 | 270 | 22.5 |
| +2 / −1 | 33% | 40% | +0.20 | 325 | 27.1 |
| +1 / −1 | 50% | 55% | +0.10 | 620 | 51.7 |

The skew- and kurtosis-adjusted normal approximation gives nearly the same numbers (Mertens 2002 variance of the Sharpe estimator; `power.py`).

Two further notes on these numbers:

- **Minimum track record length vs 80% power.** The Minimum Track Record Length of Bailey & López de Prado (2012) is much shorter: 178 trades for the first row. That is because it asks when the *point estimate* becomes significant, which corresponds to about 50% power.
- **Streaks are normal.** With a 50% hit rate, P(a run of ≥5 wins somewhere in 24 trades) = 30%, and P(≥4 in 12) = 30%.

### 3.2 Simulation A: how much faster forecast-based evaluation is

**Set-up** (`simulate.forecaster_detection`: 400 worlds, 36 months):

- **Returns.** Each month there are 500 stocks. True monthly residual (benchmark-relative) alpha μᵢ ~ N(0, 1%), and idiosyncratic volatility is 8% per month.
- **Forecasters.** Each forecaster sees a signal correlated c ∈ {0.3, 0.5, 0.7} with μᵢ, which gives a 1-month IC of 0.037, 0.062 or 0.087. Other forecaster types:
  - "noise": confident and uninformative;
  - "noise_small": near the null;
  - "overconfident": real c = 0.7 signal but the predicted return is doubled and volatility under-estimated by 25%;
  - the same overconfident forecaster after rolling, out-of-sample Platt maps fitted per question family.
- **Question sets each month:**
  - *Live* = the top-1 candidate, with 6 questions (residual return > 0 at 1, 3 and 6 months; > +10% or < −10% at 3 months; > +15% at 6 months);
  - *Shadow* = the next 30 candidates, with 4 questions each;
  - *Controls* = 10 random candidates, with 4 questions each;
  - *Gym* = 200 random stocks, with 1 question each.
- **Baseline.** The market (μ = 0).
- **Tests.**
  - The main test uses clusters by candidate and pre-registered looks at months 3, 6, 12, 24 and 36, with α split evenly (1% each). That keeps it valid for a scheduled review calendar.
  - Also reported: an anytime-valid e-process on 3-month-old cohorts, and a t-test on the live pick's market-hedged P&L.

**Detection rate** ("better than the market", family-wise α = 5%). The last four columns are for the IC 0.087 forecaster, at 6 / 12 / 24 / 36 months.

| Evidence used | Questions per year (approx.) | 6 m | 12 m | 24 m | 36 m |
|---|---|---|---|---|---|
| Live P&L only | 12 | 5% | 11% | 19% | 29% |
| Live forecasts only (6 per trade) | 72 | 20% | 28% | 36% | 45% |
| Live + shadow + controls | ≈2,000 | 36% | 74% | 98% | 100% |
| **Live + shadow + gym** | ≈4,400 | **45%** | **82%** | **>99%** | 100% |
| Same data, anytime-valid e-process | ≈4,400 | 15% | 63% | 98% | 100% |

The same measure for weaker or miscalibrated forecasters (live + shadow + gym, pre-registered looks):

| Forecaster | 6 m | 12 m | 24 m | 36 m | Live P&L at 36 m |
|---|---|---|---|---|---|
| Skilled, IC 0.062 | 24% | 55% | 86% | 98% | 18% |
| Skilled, IC 0.037 | 10% | 22% | 46% | 64% | 10% |
| Overconfident (IC 0.087), raw probabilities | <1% | <1% | <1% | <1% | 36% |
| Same, after per-family Platt recalibration | 1% | 4% | 36% | 80% (Brier: 89%) | 36% |
| Confident noise (no skill), false positives | 0% | 0% | 0% | 0% | 3% |
| Near-null noise, false positives | 2% | 2% | 2% | 3% | 4% |

Reading the tables:

- **The shadow book is the single biggest lever.** The gym adds more. Sub-questions on live trades help, but they are strongly correlated.
  - The within-trade intra-class correlation (ICC) of the six log-score differentials is **0.37–0.41**.
  - That gives a design effect (Kish 1965) of about 3, so six sub-questions are worth about **two** independent observations.
- **Top-pick P&L needs about 77 months** for 80% power even for the best forecaster. Its per-trade Sharpe is 0.28 (sim).
- **Overconfidence hides real skill.** The overconfident forecaster has exactly the same information as the IC 0.087 forecaster. Raw, it loses to the market (−0.019 nats/question). Recalibrated, it is detected.
  - The recalibration maps must be **per question family**. A single pooled map mis-corrected the 3-month ±10% threshold questions and cut 24-month detection to about 18% in development runs. Those families need intercepts of about ±0.5 logits that a pooled map cannot supply.
  - Families with fewer than 150 resolved questions borrow the map of the data-rich 1-month family.
- **With live trades only, even the test's error rates are unreliable.** The near-null forecaster produced 7–10% false positives against 5% nominal, because t-tests on a handful of skewed clusters do not behave. This is another reason not to evaluate on live trades alone.
- **Cross-check.** Foresight Arena (Nechepurenko & Shuvalov 2026) independently estimates that detecting a 0.02 edge over market consensus needs about 350 resolved predictions at 80% power.

### 3.3 Simulation B: the perma-bull trap (baselines and clustering)

**Set-up.** 200 "stock up next month?" questions a month. There is a common monthly market factor with a 0.6% monthly equity risk premium (ERP) and 4.5% volatility. Two forecasters have **no** stock-picking skill:

- *beta_only* knows the risk premium;
- *optimist* believes every stock drifts +2% a month (miscalibrated).

| Comparison | True expected edge (nats/question) | "Skill" claimed, iid test (6 / 12 / 24 m) | "Skill" claimed, month-clustered test |
|---|---|---|---|
| beta_only vs **risk-neutral** baseline (q = 0.5) | +0.0014 (this is the risk premium, not skill) | 46% / 47% / 51% | 7% / 8% / 10% |
| beta_only vs **physical** baseline | 0 | 0% | 0% |
| optimist vs physical baseline | **−0.0074** (worse than baseline) | **26% / 20% / 15%** | 2.6% / 2.4% / 1.0% |

**Rules that follow:**

1. Baselines must be **physical-measure** probabilities. Use option-implied probabilities recalibrated on a large historical panel (to strip variance and skew risk premia; cf. Bollerslev, Tauchen & Zhou 2009), or historical base rates.
2. Prefer **benchmark-relative questions**, because they remove the common factor.
3. Use **month-clustered** (or month-aggregated) inference for anything that shares a market move.

### 3.4 Simulation C: monthly peeking

**Set-up.** A zero-edge strategy with 6% monthly volatility. We ask every month whether its edge is positive.

| | 12 m | 24 m | 36 m | 60 m |
|---|---|---|---|---|
| Single pre-planned test (valid) | 5.0% | 4.9% | 5.0% | 5.1% |
| **t-test every month, stop at first p < 0.05** | **15.9%** | **20.7%** | **23.3%** | **26.5%** |
| Mixture e-process, reject when E ≥ 20 | 0.4% | 0.8% | 1.2% | 1.7% |
| Power at true Sharpe 1.0: single test / e-process | 24% / 4% | 40% / 14% | 52% / 24% | 71% / 42% |

Peeking multiplies false discoveries by 3–5× (Johari et al. 2017/2022 describe the same effect for A/B tests). Anytime-valid e-processes (Shafer 2021; Ramdas et al. 2023) remove it, at a cost in power. The practical compromise:

- a **fixed review calendar** (months 6, 12, 24 and 36) with the error budget split across the looks for adoption decisions;
- an e-process as the always-on "evidence meter" in the monthly report.

---

## 4. Remedies: the evidence-multiplication toolkit

### 4.1 Resolvable sub-questions: every recommendation carries at least 6

| # | Family | Example (long XYZ via a call spread, 3-month thesis) | Resolution rule | Baseline |
|---|---|---|---|---|
| 1 | Relative return, short horizon | P(XYZ total return − SPY total return > 0 at +21 trading days) | `at_date`, adjusted closes, named vendor field | Physical market-implied (≈ 50% + small drift) |
| 2 | Relative return, thesis horizon | Same question at +63 days | `at_date` | Same |
| 3 | Target | P(XYZ ≥ target at horizon) | `at_date` | Option-implied digital probability, physical-adjusted |
| 4 | Path | P(XYZ touches the stop before the target, by the horizon) | `first_touch_by_date` | Barrier probability from implied volatility |
| 5 | Catalyst / mechanism | P(guidance raised / deal closes / approval by date) | `event_by_date`, pre-declared source | Prediction-market price or reference-class base rate |
| 6 | Magnitude | 10/50/90% quantiles of XYZ − SPY return at horizon | `at_date` (CRPS, PIT) | Implied-vol distribution |
| 7 | Volatility (optional) | P(realized 21-day volatility > implied at entry) | `at_date` | Historical base rate (variance risk premium) |

**Rules for questions:**

- Resolution is **mechanical**: a named source, field, time and threshold, written before the outcome.
- "NO" answers on by-date questions resolve only at the date.
- Annulment uses only pre-registered criteria (target < 2% of questions).
- The ledger (`ledger.py`) enforces the ordering rules.

### 4.2 Shadow book

- **What is logged.** Every scan logs all candidates that pass the filters: the selected trade(s), the **top-30 rejected**, and **10 random controls** from the rest, with inverse-probability weights so population estimates stay unbiased.
- **How it is scored.** Each gets the same forecast template and a hypothetical plan: paper entry at the next open, with a cost haircut.
- **What it measures:**
  - **Forecast skill** on a population close to the selected one;
  - **Selection alpha** (selected minus random controls, paired within the month, so market noise cancels in the style of a control variate; Deng et al. 2013's CUPED cut variance by about 50% at Bing);
  - **Instrument choice**, for example the option structure versus simply holding the stock.
- **Caveats.** Paper trades ignore market impact and liquidity. Rejected candidates are a different population, subject to the optimizer's curse (Smith & Winkler 2006). Shadow data is therefore **down-weighted**: a power prior with weight 0.5 is the default.
- **Payoff.** In Simulation G, adding shadow sleeves raised the probability of identifying the best of four archetypes from **42% to 93% after 3 years**, and from 33% to 77% after 1 year.

### 4.3 Calibration gym

The gym is about 200 standardized, cheap questions a month, run through the *same* forecasting pipeline and prompts. Examples:

- "Will stock *k* beat SPY over the next 21 trading days?" for random S&P 1500 names;
- the sign of macro-data surprises;
- sector-relative moves.

It has three jobs:

1. **Estimate the recalibration maps.** It supplies the sample size that live trades cannot.
2. **Run noise audits.**
3. **Detect drift** after model or prompt changes.

It does *not* prove trade-selection skill, because it has no selection step. That is the shadow book's job.

### 4.4 Benchmark-relative evaluation

- **Define the benchmark at entry.** Use SPY or a sector ETF for single stocks. For option structures, the benchmark is "the same view held via the underlying". Evaluate excess and residual returns.
- **How much it helps.** Market and industry factors explain only about a third of monthly single-stock variance (Roll 1988). So beta-adjustment alone cuts required samples only modestly, by roughly R². The larger gain comes from **removing the shared monthly shock** from forecast tests (Section 3.3).
- **Alpha-beta decomposition.** Portfolio alpha and beta come from a regression on benchmark returns with Newey-West (heteroskedasticity- and autocorrelation-robust) errors. Report both time-weighted return (for % return claims) and money-weighted return (what the user experiences).

### 4.5 Bayesian updating of each strategy's edge

**Hit rate or thesis-correct rate** uses a Beta-Binomial model (`bayes.BetaBinomial`):

- Prior Beta(m·s, (1−m)·s). The prior mean m is the backtest or literature rate **haircut by at least 50%** (McLean & Pontiff's 58% post-publication decay). The strength s is 20–50 pseudo-trades.
- After k wins in n trades, the posterior is Beta(m·s + k, (1−m)·s + n − k).
- The monthly report shows the posterior mean, a 90% credible interval, and P(p > break-even).

**Per-trade return in R-multiples** uses a Normal-Inverse-Gamma model (`bayes.NormalInverseGamma`):

- The posterior of the mean is Student-t. Sizing uses the **posterior predictive**, which widens with parameter uncertainty (Browne & Whitt 1996, "Bayesian Kelly").

**Worked example** (Simulation F): payoff +1.5R/−1R, so the break-even hit rate is 40%; the prior mean is 45%; sizing is quarter-Kelly.

| History | Naive (maximum-likelihood) quarter-Kelly | Bayes, strength 20 | Bayes, strength 50 |
|---|---|---|---|
| None (prior) | 2.1% | 2.1% | 2.1% |
| 3 wins in 3 | **25%** | 5.1% | 3.4% |
| 5 wins in 5 | **25%** | 6.7% | 4.2% |
| 8 wins in 8 | **25%** | 8.6% | 5.2% |
| 5 losses in 5 | 0% | **0%** (posterior 36% < 40%) | 0.4% (posterior 40.9%) |
| 12 of 24 | 4.2% | 3.2% | 2.8% |

At strength 20, a 5-loss streak switches the archetype off. For this very book (45% hit, positive expected value), ≥5 straight losses occur somewhere within 24 trades **42% of the time**. For a 35%-hit book the figure is 69% (`power.py`, Section 6e). Hence: **strength ≈ 50 for established archetypes, a probation floor instead of zero, and retirement only through the pre-registered tests.**

### 4.6 Pooling information across archetypes

- **Why pool.** Selecting archetypes by their raw estimated edge guarantees post-decision disappointment: the optimizer's curse (Smith & Winkler 2006).
- **Normal-normal empirical Bayes.** θₖ = Bₖ·μ̄ + (1 − Bₖ)·x̄ₖ, with Bₖ = seₖ² / (seₖ² + τ²) and τ² estimated by DerSimonian-Laird (1986) (`bayes.empirical_bayes_normal`). James-Stein shrinkage dominates the raw means for three or more groups (Efron & Morris 1975).
- **Hierarchical Beta-Binomial for hit rates** (`bayes.beta_binomial_pooling`). With fewer than about 8 archetypes the between-group variance is unidentifiable, so use a fixed strength until then.

### 4.7 Allocating attention and capital: Thompson sampling / Bayesian model averaging

- **Attention (and capital tilts) across sleeves.** Probability matching: weight wₖ = P(sleeve k is best | data), computed from posterior draws (Thompson 1933; Russo et al. 2018). Guardrails (`bayes.thompson_allocation`):
  - move only 25% of the way to the target each month;
  - at most 10 percentage points per sleeve per month;
  - floor 10% for each active sleeve, so evidence keeps accruing; cap 50%.
- **Combining forecasters (models, prompts).** Prequential Bayesian model averaging: wⱼ ∝ πⱼ·exp(η·Σₜ log pⱼ(yₜ)) (Dawid 1984; Hoeting et al. 1999). Use tempering η ≤ 1 and a rolling window so the weights do not collapse onto one model after a lucky run.
- **Live data alone cannot tell sleeves apart** (Simulation G: 18 live trades a year, four archetypes with true per-trade edges of −0.05R to +0.25R). The allocator identifies the best sleeve only 42% of the time after 3 years, where chance would give 25%. With shadow sleeves it reaches 93%.

### 4.8 Recalibration maps (Simulation H, 200 repetitions per cell)

Out-of-sample log-loss gain, in nats per question. Positive is better.

| n resolved | Platt (LLM-like overconfident + optimistic raw) | Isotonic (same) | Gated Platt (same) | Platt (already calibrated raw) | Gated Platt (already calibrated) |
|---|---|---|---|---|---|
| 25 | +0.021 (worse 16% of the time) | −0.122 (worse 95%) | +0.006 | −0.011 (worse 99%) | −0.003 |
| 50 | +0.027 | −0.051 | +0.016 | −0.011 | −0.003 |
| 100 | +0.034 | −0.011 (worse 55%) | +0.028 | −0.006 | −0.001 |
| 150 | +0.038 | +0.006 (worse 25%) | +0.035 | −0.005 | −0.001 |
| 500 | +0.042 | +0.029 | +0.042 | −0.002 | −0.001 |
| 2000 | +0.043 (max possible 0.046) | +0.038 | +0.043 | −0.000 | −0.000 |

This matches Niculescu-Mizil & Caruana (2005): Platt scaling works on small samples, and isotonic regression needs about 1000 or more points.

**The gate.** Adopt the map only if a likelihood-ratio test of H₀ "a = 0, b = 1" rejects at p < 0.05 (`simulate.miscalibration_lr_test`). This keeps nearly all the benefit when miscalibration is real and nearly all the safety when it is not.

**Policy:**

- identity map below 150 resolved questions per family (borrow the pooled map if the gate fires on pooled data);
- gated Platt from 150;
- isotonic only from 1000, and only if rolling-origin out-of-sample validation beats Platt.

---

## 5. Overfitting controls

### 5.1 Deflated Sharpe, overfitting probability and minimum backtest length

- **Probabilistic Sharpe Ratio** (PSR): PSR(SR\*) = Φ[(SR̂ − SR\*)·√(T−1) / √(1 − γ₃·SR̂ + (γ₄−1)/4·SR̂²)], with per-period Sharpe, skewness γ₃ and kurtosis γ₄ (Bailey & López de Prado 2012).
- **Deflated Sharpe Ratio** (DSR): the PSR measured against SR₀ = √V·[(1−γ)·Φ⁻¹(1−1/N) + γ·Φ⁻¹(1−1/(N·e))]. Here N is the number of trials, V the variance of Sharpe across trials, and γ = 0.5772 (Bailey & López de Prado 2014).
- **Probability of Backtest Overfitting** (PBO) via combinatorially symmetric cross-validation (Bailey et al. 2017).

**Expected best in-sample annual Sharpe when every variant has zero skill:**

| Variants tried (N) | 1 year | 3 years | 5 years | 10 years | Backtest years needed to keep it below 1.0 |
|---|---|---|---|---|---|
| 5 | 1.19 | 0.69 | 0.53 | 0.38 | 1.4 |
| 20 | 1.90 | 1.10 | 0.85 | 0.60 | 3.6 |
| 45 | 2.24 | 1.29 | **1.00** | 0.71 | **5.0** (matches Bailey et al. 2014) |
| 100 | 2.53 | 1.46 | 1.13 | 0.80 | 6.4 |
| 1000 | 3.26 | 1.88 | 1.46 | 1.03 | 10.6 |

**DSR of a good-looking live record** (36 months, annual Sharpe 1.2, skewness −0.3, kurtosis 4):

| Variants tried | 1 | 5 | 20 | 100 |
|---|---|---|---|---|
| DSR | 0.97 | 0.79 | 0.56 | 0.34 |

This is why **every variant the LLM considers must be logged** (`trial` records). The trial count, not the number of adopted changes, drives the deflation.

**PBO checks** (120 months, 50 variants):

| Case | PBO |
|---|---|
| All variants pure noise | 0.74 |
| One real Sharpe-1.0 variant among 49 noise | 0.28 |
| Graded true Sharpe 0 → 1.5 | 0.08 |

### 5.2 Walk-forward testing and cross-validation: where they apply

- **Walk-forward, purged/embargoed cross-validation** (López de Prado 2018) and data-snooping tests (White 2000; Hansen 2005) are appropriate for **systematic components with long, point-in-time histories**, such as scanner signals.
  - Follow a backtesting protocol (Arnott, Harvey & Markowitz 2019).
  - Require t > 3 for new factors (Harvey, Liu & Zhu 2016).
- **LLM judgment backtested over the LLM's own training period is contaminated and counts as zero evidence.**
  - Glasserman & Lin (2023) documented look-ahead bias and a "distraction effect" (knowledge of the company's name).
  - Gao, Jiang & Yan (2025, rev. 2026) found their Lookahead Propensity measure high in-sample and collapsing to about zero right after the training cutoff.
  - Look-Ahead-Bench (Benhenda 2026) found significant look-ahead bias in standard LLMs, but not in point-in-time models.
- **Acceptable evidence:**
  - forward (live or shadow) data after the model's cutoff;
  - point-in-time models (He, Lv, Manela & Wu 2025, ChronoGPT);
  - anonymized-entity tests as a diagnostic.

### 5.3 Pre-registration: the hash-chained ledger

- **What it is.** Every forecast, candidate, recommendation and rule change is appended to a JSONL ledger *before* its outcome is knowable. Each line includes the SHA-256 of the previous line (`ledger.py`).
- **What it enforces.** Records are never edited: corrections are new records. Forecasts must pre-date their resolution. Resolutions cannot pre-date forecasts. Timestamps never go backwards.
- **Tamper evidence.** The monthly email carries the **ledger head hash**, an external timestamped witness. This works like registered reports in science (Nosek et al. 2018).
- **Demo** (`results/demo_ledger.jsonl`):
  - Editing one `p_final` from 0.61 to 0.95 after the fact is detected ("line 2: content hash mismatch").
  - A forecast registered after its resolution date is refused.
  - An `at_date` question resolved early is refused.
- **Stronger audits.** Point-in-time audit frameworks for LLM portfolio agents now issue "contamination certificates" (OpenPM, Cai et al. 2026). On-chain commit-reveal protocols are an alternative (Foresight Arena 2026).

### 5.4 Change control: budget, evidence thresholds, shadow A/B tests, promotion

**Simulation D.** Five years of monthly decisions. Twelve (or fifty) candidate tweaks are shadow-tracked. The incumbent rule earns 100 bp a month. Each switch costs 20 bp (re-positioning, recalibration reset, complexity). "P&L evidence" means paired monthly noise of 3.8%. "Surrogate evidence" means 0.6%, the order of magnitude of forecast-score evidence from the shadow book.

| Scenario | Policy | Gain vs never changing (bp/month, net) | Switches in 5 years | P(ends worse than original) |
|---|---|---|---|---|
| P&L evidence, 12 tweaks | Oracle | +36.9 | 1.0 | 0% |
| | Switch to best of trailing 3 months | −12.6 | 35.9 | 46% |
| | Switch to best of trailing 12 months | −0.1 | 16.5 | 36% |
| | **Guarded, forward-validated** | +0.3 | <0.1 | 0.9% |
| P&L evidence, 50 tweaks | Trailing 3 months / trailing 12 months / guarded | −12.0 / +4.1 / +0.6 | 43.7 / 21.2 / 0.1 | 45% / 30% / 0.7% |
| P&L evidence, all tweaks irrelevant | Trailing 3 months / trailing 12 months / guarded | −12.2 / −5.8 / 0.0 | 36.5 / 17.4 / 0 | – |
| P&L evidence, tweaks mostly harmful | Trailing 3 months / trailing 12 months / guarded | **−28.3 / −18.4** / −0.2 | 36 / 17 / 0 | **88% / 85%** / 3% |
| Surrogate evidence, 12 tweaks | Oracle / trailing 3 months / trailing 12 months / **guarded** | +36.9 / +16.2 / +24.3 / **+21.5** | 1 / 25.6 / 7.7 / **1.1** | 0% / 11% / 2.8% / **0.6%** |

Interpretation:

- **On P&L evidence, no loop can find real improvements.** Naive loops turn noise into churn and have a large chance of ending worse than where they started.
- **The guarded loop's "do nothing" is the correct answer there.** On forecast-score evidence it captures 58% of the oracle's gain with about 1 switch.
- **Naive-12m does slightly better in the easy case, but only in a sim that flatters it.** The sim pre-specifies a fixed menu of variants, where naive-12m can edge out guarded (+24 vs +22 bp). A real LLM loop invents variants *after* seeing the data (forking paths), which makes naive selection worse than simulated here. It also destroys the ability to evaluate anything, because no rule is live long enough to be measured.

### 5.5 The strategy constitution

The constitution is a versioned, human-owned document. It works as a "Ulysses contract": a commitment made in advance that binds later in-the-moment choices. It contains:

- the objective (maximize expected log-growth of wealth, subject to a trade cap and risk limits);
- the allowed instruments and universe;
- **invariants** (risk limits, the evaluator's hash, change policy) that only the human can change;
- tunable parameters, each with a pre-approved range;
- archetypes and their status (incubation → probation → active → retired);
- forecast templates and baselines;
- metric definitions and thresholds.

**Semantic versioning:**

- MAJOR: invariants or objective change (human only);
- MINOR: tier 2–3 changes;
- PATCH: tier 1 calibration maps.

**Change records.** Every change links to its `change_proposal` and `change_decision` ledger records.

**Rollback:**

- Any prior version can be restored in one step.
- Automatic rollback applies if a promoted change's live or shadow performance during its 3-month probation falls below the pre-registered expectation. The trigger is P(worse than the previous version) ≥ 0.9, or an e-process for "new is worse" crossing 10.

### 5.6 LLM-specific risks and controls

| Risk | Evidence | Control |
|---|---|---|
| Look-ahead leakage in backtests or "retrospective" analysis | Glasserman & Lin 2023; Gao, Jiang & Yan 2025/26; Benhenda 2026 | Only post-cutoff forward data counts. Point-in-time snapshots are frozen per decision. Anonymized-entity checks. |
| Hindsight in post-mortems | Fischhoff 1975; Baron & Hershey 1988 | **Blind re-grade first** (pre-trade snapshot only), then outcome. Log the grade gap. Flag post-mortems that cite causes absent from the pre-mortem as "obvious". |
| Rationalization / unfaithful explanations | Chain-of-thought explanations systematically omit biasing features, with accuracy drops of up to 36% (Turpin et al. 2023) | Explanations are *hypotheses*. Only ledger numbers count as evidence. Free-text lessons change nothing unless converted into a registered, tested proposal. |
| Self-critique without external signal | LLMs struggle to self-correct reasoning without external feedback, and sometimes get worse (Huang & Chang 2024) | Feedback comes from the deterministic evaluator's scores, not from the model grading itself. |
| **Tampering with the metric (reward hacking)** | Frontier models modified tests and scoring code, or overwrote timers, to raise scores (METR 2025) | **Evaluator code in a separate, read-only repository, pinned by hash** and checked every run. The LLM has no write access to the evaluator, ledger history or constitution invariants. All metrics are recomputable by anyone from the ledger. |
| Overconfidence / optimism | Xiong et al. 2024; Cho & Koshiyama 2026 | Monthly calibration-in-the-large and slope checks. Gated Platt maps. Inverted-question consistency checks. |
| Sycophancy (drifting toward what the user wants: more trades, bigger bets) | Sharma et al. 2024 | The objective and trade cap are fixed in the constitution. The monthly email leads with the failures. The strategist never sees the user's P&L hopes. |
| Gradual rule drift | This track's loop simulations; Wiecki et al. 2016 | Change budget. Monthly diff against v1.0.0 and against 12 months ago. More than 5 parameters changed in 12 months, or any cumulative change beyond the pre-approved range, triggers human review. |
| Model or prompt upgrades silently change calibration | ForecastBench shows year-on-year shifts of about 0.015 Brier | A model upgrade is a **tier 3 change**. Old and new models run in parallel on the gym and shadow book for at least 2 months. New maps start from the old ones as priors. |
| Prompt injection from retrieved news or filings | – | Retrieved text is data. The strategist cannot alter rules. Only structured proposals, validated by the rule engine, can. |

**Separation of powers:**

1. **Strategist LLM**: proposes trades, forecasts and change proposals.
2. **Reviewer LLM**: a different model or at least a different instance and prompt. It red-teams proposals and blind-grades decisions.
3. **Evaluator**: deterministic, frozen code. It computes every number.
4. **Rule engine**: deterministic. It adopts or rejects changes by pre-registered criteria.
5. **Human owner**: vetoes, holds exclusive authority over invariants and risk increases, and executes trades.

---

## 6. Design deliverables

### (a) Ledger schema

The full JSON Schema is in `code/10-calibration/ledger_schema.json`, and `ledger.py` implements it.

**Envelope.** One line per record:

```
record_id, record_type, created_at (UTC), as_of (data cut-off), author,
strategy_version ("v1.3.0+<sha256>"), model {llm_id, prompt_sha256, code_commit,
temperature, n_samples, aggregation}, payload {...}, prev_hash, hash
```

**Record types and their key fields:**

- `recommendation`: rec_id, candidate_id, archetype, sleeve, instrument, legs[], direction, thesis, catalysts[], base_rate{reference_class, rate, n, source}, market_implied{p_target, iv, method}, edge_estimate{raw, shrunk, p_profit_raw, p_profit_final}, sizing{fraction_at_risk, kelly_fraction_used, cap_binding}, entry_plan, exit_plan{target, stop, time_stop}, invalidation[] (kill criteria), premortem[{failure_mode, probability}], forecast_ids[≥5], benchmark, decision_checklist{}, email_sha256.
- `shadow_candidate`: candidate_id, scan_id, archetype, instrument, underlying, score_raw, rank, selection_status (selected | rejected_top_k | rejected_random_control | filtered_rule), rejection_reason, sampling_weight, hypothetical_plan, forecast_ids.
- `forecast`: forecast_id, parent_id, supersedes, family, question, resolution_rule (at_date | first_touch_by_date | event_by_date), resolution_criteria{source, field, threshold, benchmark}, resolution_date, p_raw, **p_final**, calibration_map, p_samples[], baseline{p_market_physical, p_market_risk_neutral, p_base_rate, method}, quantiles{}, cluster{trade_id, underlying, sector, month}, is_live.
- `resolution`: forecast_id, outcome, realized_value, resolved_at, source, evidence_sha256, resolver, status (resolved | annulled | disputed).
- `execution`: rec_id, executed, fills[], deviation_reason, implementation_shortfall_bps.
- `mark`: position_id, date, price, value, benchmark_level, paper.
- `postmortem`: rec_id, blind_grade{}, outcome_grade{}, thesis_outcome, classification (skill | bad_luck | dumb_luck | deserved_loss | indeterminate), return_decomposition{market_beta, sector, residual, instrument_effect, execution_effect}, pit, premortem_hit, lessons[{text, generalizable, proposed_change_id}].
- `trial`: trial_id, description, variant_spec, data_window. **Every idea evaluated, even informally.**
- `change_proposal`: change_id, tier, target (a JSON pointer into the constitution), old_value, new_value, hypothesis, predicted_effect, primary_metric, success_criterion, min_sample, shadow_window, evidence_window_seen, trial_count, red_team.
- `change_decision`: change_id, decision (adopt | reject | extend_shadow | rollback), evidence{}, decided_by (rule_engine | human_owner), constitution_version, rollback_to.
- `constitution`, `monthly_report` (period, metrics, email_sha256), `correction`, `annulment`.

**Example forecast record:**

```json
{"record_type":"forecast","created_at":"2026-10-01T10:01:00.000Z","as_of":"2026-10-01T09:30:00Z",
 "strategy_version":"v1.0.0","model":{"llm_id":"example-llm-2026-09","prompt_sha256":"abab…","n_samples":7,
 "aggregation":"median log-odds"},
 "payload":{"forecast_id":"f1","parent_id":"c-2026-10-01-001","family":"price_threshold_rel",
  "question":"XYZ total return minus SPY > 0 at 2026-11-02 close","resolution_rule":"at_date",
  "resolution_criteria":{"source":"vendor:adjusted_close","benchmark":"SPY"},
  "resolution_date":"2026-11-02T21:00:00Z","p_raw":0.66,"p_final":0.61,
  "calibration_map":"platt:v3(a=-0.04,b=0.78,n=412)",
  "baseline":{"p_market_physical":0.52,"p_base_rate":0.5,"method":"option-implied, ERP-adjusted"},
  "cluster":{"trade_id":"c-2026-10-01-001","underlying":"XYZ","month":"2026-10"},"is_live":true},
 "prev_hash":"…","hash":"…"}
```

### (b) The monthly procedure

**When it runs.** The cycle runs on the first weekend after month-end. The data cut-off T₀ is the last trading day's close. The email goes out by the 3rd business day.

**Who does what.** [E] is the deterministic evaluator (frozen code), [S] the strategist LLM, [R] the reviewer LLM, [RE] the rule engine and [H] the human owner.

0. **Freeze [E].**
   - Verify the ledger chain.
   - Record the head hash, constitution version, model and prompt hashes, and evaluator hash, which must equal the pinned value or the run stops.
   - Lock strategy edits until step 9.
1. **Refresh data [E].**
   - Pull adjusted prices, corporate actions, dividends, option marks for open positions, benchmark and risk-free returns, and catalyst outcomes, all from pre-declared sources.
   - Run data-quality checks for missing data, stale quotes and splits. If anything fails, alert the human and compute nothing on bad data.
2. **Mark to market and reconcile [E].**
   - Mark live positions using the user's *actual* fills, and shadow positions using paper fills plus the cost haircut.
   - Compute implementation shortfall and the non-execution rate.
   - Compute time-weighted return (TWR) and money-weighted return (IRR).
3. **Resolve forecasts [E].**
   - Mechanically resolve every question due by T₀, including first-touch and event questions that have triggered.
   - Annul only by pre-registered rule, and report the annulment rate.
4. **Compute metrics [E]** (formulas in (c)):
   - forecast scores per family and pooled, versus the physical market and base rate, with trade-clustered and month-clustered standard errors;
   - reliability table, CORP decomposition, calibration slope/intercept and sharpness;
   - CRPS, PIT and interval coverage;
   - selection alpha;
   - portfolio TWR, excess return, volatility, Sharpe, drawdown and its percentile within the pre-computed band;
   - PSR, DSR (using the trial count), MinTRL;
   - e-process meters (forecast skill; P&L vs benchmark);
   - CUSUM and SPRT (sequential probability ratio test) states per sleeve;
   - Beta and NIG posteriors, pooled estimates and posterior predictive;
   - the noise audit (20 re-asked questions × 7 samples).
5. **Attribution and post-mortems [E numbers, R narrative].**
   - Attribute results by archetype, instrument, holding period and regime (volatility tercile, trend).
   - Decompose each result into market beta, sector, residual, instrument choice and execution.
   - For each closed trade:
     - (a) blind grade from the pre-trade snapshot;
     - (b) outcome reveal and re-grade;
     - (c) the PIT value of the realized return;
     - (d) thesis outcome against the pre-registered invalidation criteria;
     - (e) the 2×2 classification;
     - (f) whether the failure mode was on the pre-mortem list;
     - (g) lessons, tagged generalizable or not.
   - Also post-mortem the 3 worst forecast misses (|p − y| > 0.8) in the shadow book and gym.
6. **Propose [S].**
   - Log *every* idea considered as a `trial`.
   - Convert **at most 2** into structured `change_proposal`s: tier, target, old and new values, hypothesis, predicted effect, metric, success criterion, minimum sample and shadow window.
   - Proposals may cite only generalizable lessons, never "fix last month's loser".
7. **Red-team [R].** For each proposal, check:
   - whether it would have been proposed without last month's outcomes;
   - whether it duplicates a rejected change from the past 12 months;
   - whether it uses data from inside the model's training window.
8. **Validate and decide [RE; H for tier 4].**
   - *New proposals:* screen them against historical shadow data using the DSR with the full trial count. This screen is only a sanity filter, because the proposer has already seen that data. Proposals that pass enter a **forward** shadow A/B test starting next month.
   - *Proposals finishing their window:* apply the pre-registered criterion. Adopt, reject, or extend once.
   - *Adopted changes* go live in **probation**: at 50% influence for 3 months, with the automatic rollback trigger.
   - *Tier 1 maps:* adopt automatically when the gate fires (n ≥ 150 per family, likelihood-ratio p < 0.05) and the rolling out-of-sample log score improves. The step size is bounded: |Δb| ≤ 0.2 per month.
9. **Allocate and size [RE].**
   - Thompson/probability-matching attention weights with the damping, step, floor and cap guardrails.
   - Fractional Kelly (0.25) on the posterior predictive, within hard caps.
10. **Guardrail checks [RE]:** lucky-streak cooling-off, drawdown band, risk limits, drift against v1.0.0, evaluator integrity, and ledger verification (see (e)).
11. **Publish [E renders numbers; R writes the plain-English text from the metrics JSON only].**
    - Append the `monthly_report` record.
    - Send the email with the head hash.
    - Request any human decisions.
    - Unfreeze.

### (c) Metric formulas

Notation: pᵢ is the forecast, yᵢ ∈ {0, 1} the outcome, qᵢ the physical market baseline, and N the number of questions. Differentials are averaged per cluster (trade or month) before inference.

```
Brier            BS  = (1/N) Σ (pᵢ − yᵢ)²                       BSS_ref = 1 − BS/BS_ref
Log score        LS  = (1/N) Σ [yᵢ ln pᵢ + (1−yᵢ) ln(1−pᵢ)]      (p clipped to [0.01, 0.99])
Edge vs market   ΔLS = (1/N) Σ ln( p(yᵢ) / q(yᵢ) )  = Kelly log-growth at market odds (nats/question)
Murphy           BS  = REL − RES + UNC (+ WBV − WBC within-bin terms, Stephenson et al. 2008)
                 REL = Σₖ nₖ(p̄ₖ − ōₖ)²/N,  RES = Σₖ nₖ(ōₖ − ō)²/N,  UNC = ō(1−ō)
CORP             BS  = MCB − DSC + UNC with p_iso = isotonic(y ~ p): MCB = BS(p) − BS(p_iso), DSC = UNC − BS(p_iso)
Calibration      logit P(y=1) = a + b·logit p  (Cox 1958): a = bias (optimism if a<0 for 'up' questions), b<1 overconfident
CITL             ȳ − p̄ ;  ECE = Σₖ (nₖ/N)|p̄ₖ − ōₖ| (display only)
Sharpness        Var(p);  mean |p − base rate|
Pinball (τ)      ρτ(y − q) = (τ − 1{y<q})(y − q);  CRPS ≈ (2/J) Σⱼ ρτⱼ(y − qτⱼ), τⱼ = (j−½)/J
PIT              uᵢ = Fᵢ(yᵢ) ~ U(0,1) if calibrated;  coverage of central 80% interval ≈ 0.80
Interval score   (u − l) + (2/α)(l − y)1{y<l} + (2/α)(y − u)1{y>u}
Selection alpha  (1/M) Σₘ [ r̄(selected, m) − Σ w·r(controls, m)/Σ w ]   (IPW, paired by month)
Returns          TWR = Π(1 + r_month) − 1;  IRR from cash flows;  excess = r − β·r_bench (β by OLS, Newey-West SE)
Risk             Sharpe, Sortino, MaxDD = max_t (1 − W_t / max_{s≤t} W_s),  DD percentile vs simulated band
PSR / DSR        see §5.1;  MinTRL = 1 + [1 − γ₃SR + (γ₄−1)/4·SR²]·(z_α/(SR − SR*))²
Beta posterior   Beta(α₀ + k, β₀ + n − k);  report mean, 90% CrI, P(p > p_breakeven)
NIG posterior    κₙ = κ₀ + n; μₙ = (κ₀μ₀ + n·x̄)/κₙ; aₙ = a₀ + n/2; bₙ = b₀ + ½Σ(x−x̄)² + κ₀n(x̄−μ₀)²/(2κₙ)
Shrinkage        θₖ = Bₖ·μ̄ + (1−Bₖ)·x̄ₖ,  Bₖ = seₖ²/(seₖ² + τ̂²)   (DerSimonian-Laird τ̂²)
Thompson weight  wₖ = P(k = argmax θ | data) via posterior draws; w ← proj_[floor,cap](w + clip(0.25(w* − w), ±0.10))
e-process        Eₜ = 2√(ρ/(Vₜ+ρ))·exp(Sₜ²/(2(Vₜ+ρ)))·Φ(Sₜ/√(Vₜ+ρ)),  Sₜ = Σ monthly means, Vₜ = Σ their variances;
                 "proven" when Eₜ ≥ 20 (α = 5%); valid under monthly peeking (Ville's inequality;
                 approximately so when the variance is estimated; check the false-positive rate by simulation)
CUSUM            Sₜ = max(0, Sₜ₋₁ + ((μ_bad − μ_good)/σ²)(xₜ − (μ_good + μ_bad)/2)); alarm at h calibrated by simulation
Design effect    deff = 1 + (m − 1)·ICC;  effective n = N/deff
Outcome-bias gap mean(outcome-aware grade − blind grade) over closed trades
Pre-mortem hit   #(losing trades whose realized cause was pre-listed) / #losing trades
```

### (d) Monthly report / email template (plain English)

```
Subject: [Trading system] <Month YYYY> review: <+x.x%> vs benchmark <+y.y%>; <n> trades closed; <k> rule changes

1. The headline
   • This month: <+x.x%>. Year to date: <+x.x%>. Since start (<date>): <+x.x%> vs <benchmark> <+y.y%>.
   • Current drop from the peak: <d%>. For a strategy like ours this is <normal / on the high side / unusual>
     (it sits at the <pp>th percentile of what we expect even if everything is working).
   • Open positions: <n>, with <r%> of the account at risk in total.

2. What happened to each closed trade
   • <Ticker, structure>: planned <target/stop/date>; result <+/−r%> (benchmark <b%>).
     Verdict: <Skill | Bad luck | Lucky | Deserved loss>. Why, in one sentence: <...>.
     Did our pre-trade "what could go wrong" list include what actually went wrong? <yes/no>.
   • Execution: you filled <n/n> trades; average slippage vs plan <x bp>.

3. Are our probabilities honest?
   • When we said about 70%, it happened <64%> of the time (<87> questions). Overall: <well calibrated / a bit overconfident / too optimistic>.
   • Versus market prices our forecasts are <ahead / level / behind> by <+0.012> "points" per question.
     Evidence meter: <6.3> out of the 20 needed to call it proven (a meter that is safe to check every month).
   • Last month's recalibration: <none | shrank our probabilities by <b> for <family>>.

4. Is the strategy working?
   • Honest answer: <not yet provable either way | evidence of skill | evidence of decay>. With our trade count this usually
     takes <X> more months; forecast data will tell us much sooner than profits.
   • Per strategy type: <archetype>: <n> trades, estimated hit rate <m%> (90% range <l>–<u>%), status <active/probation/...>.

5. What we are changing (≤ 2), and what we are deliberately not changing
   • Adopted: <change>, because <pre-registered test passed: P(better) = 0.97 over 4 months of shadow data>. Rollback: automatic if <...>.
   • Started testing (not yet live): <change>, to be decided on <date>.
   • Rejected: <idea>, because <evidence insufficient / looks like hindsight>.
   • Not changing: <e.g. the post-earnings sleeve despite 3 losses; that streak happens about <x%> of the time for a sound strategy>.

6. Risk check
   • Limits: <all within limits / list>. Guardrails triggered: <none | cooling-off after a lucky month | drawdown review>.

7. Things we need from you
   • <Approve/decline tier-4 proposal …> • <Confirm fills for …> • <Nothing this month>

8. Integrity
   • Ledger fingerprint: <head sha256> (<N> records; nothing edited since last month's fingerprint <prev hash>).
   • Rules version: <v1.3.0>; evaluator unchanged (<hash>); AI model: <id> (unchanged / changed on <date>).
```

### (e) Guardrails

**Against scaling up risk after a lucky streak:**

1. **Sizing uses posteriors, never trailing P&L.** Priors are worth ≥50 trades for established archetypes and 20 for new ones. Sizing is fractional Kelly (0.25) on the posterior predictive, with hard caps per trade and in aggregate. Worked numbers are in §4.5: 5 straight wins take size from 2.1% to 4.2%, not to the cap.
2. **Cooling-off.** No risk-increasing change (tier 2 sizing parameters, tier 4 limits) for 2 months after any month with a return more than 2σ above expectation. This counters the "house money" effect (Thaler & Johnson 1990).
3. **Risk limits rise by at most 25% a quarter.** A rise needs the human, ≥30 closed live trades, PSR(0) ≥ 0.95, and DSR ≥ 0.9 using the full trial count.
4. **A reminder in every email** after a hot streak. The probability of such streaks under no skill is quoted, for example 30% for 5-in-a-row within 24 coin-flip trades.

**Against abandoning a sound strategy after a normal drawdown:**

1. **Pre-computed drawdown bands per sleeve and for the portfolio** (Simulation E; Magdon-Ismail et al. 2004):

   | True process | 12 m: p50 / p95 max drawdown | 24 m: p50 / p95 | 60 m: p50 / p95 |
   |---|---|---|---|
   | Sharpe 1.0 (25% return, 25% vol) | 13% / 30% | 18% / 37% | 26% / 45% |
   | Sharpe 0.75 (30% return, 40% vol) | 23% / 48% | 32% / 58% | 45% / 71% |
   | Sharpe 0 (25% vol) | 20% / 41% | 30% / 54% | 47% / 73% |
   | 12 trades/yr, 5% at risk, +3R/−1R, 35% hit (+0.4R/trade) | 19% / 35% | 27% / 46% | 36% / 57% |

   - Drawdowns of good and useless strategies overlap heavily. A 30% drawdown in year 1 sits at about the 95th percentile for Sharpe 1.0 and the 80th for Sharpe 0, a likelihood ratio of only about 4.
   - **Inside the 95% band, the default is "stay the course", stated explicitly in the email.**
   - Beyond the band, the human is asked to review for errors or a regime break. That triggers a review, not an automatic retirement.
2. **Retirement requires one of:**
   - (a) documented **thesis invalidation**, for example the structural reason for the edge disappearing;
   - (b) a pre-registered **CUSUM/SPRT alarm**, calibrated to ≤10% false alarms over 5 years (median detection delay about 21 trades at 12 trades/yr; Simulation I);
   - (c) posterior P(edge > 0) < 0.2 after ≥20 trades **and** negative forecast-score evidence from the shadow sleeve.

   Never within the first 12 months or 12 trades, unless (a) applies.
3. **Probation floor instead of zero.** A struggling sleeve drops to at least 10% attention and a small size, so evidence keeps accruing. Thompson floors do this automatically.
4. **Symmetric evidence.** Adopting and retiring use the same statistical standard (e-value ≥ 20, or pre-registered looks). Only *risk increases* face a stricter standard.
5. **Portfolio kill-switch (human review, not strategy change).** A drawdown beyond 1.25× the 95th-percentile band, or any hard-limit breach, pauses *new* recommendations until the human reviews.

### (f) Reference implementation

All files are under `research/code/10-calibration/`. It needs only Python 3.11 with numpy and scipy, and uses fixed seeds throughout.

| File | Contents |
|---|---|
| `scoring.py` | Brier, BSS, log score, log-score differential (= Kelly growth), Brier differential, **reliability table with Jeffreys intervals**, Murphy decomposition with exact within-bin terms, CORP decomposition, calibration slope/intercept, ECE, sharpness, pinball, CRPS (quantile and normal), PIT, interval score, cluster-robust mean test, Diebold-Mariano, ICC |
| `bayes.py` | **Beta-Binomial**, Normal-Inverse-Gamma, empirical-Bayes / James-Stein shrinkage, hierarchical Beta pooling, **Thompson allocation with damping/floors/caps**, Bayesian Kelly |
| `recalibration.py` | Platt (MAP, shrunk toward identity), isotonic, map-choice policy |
| `overfitting.py` | PSR, DSR, expected max Sharpe, MinTRL, MinBTL, PBO (CSCV), CUSUM, SPRT, betting e-process |
| `power.py` | Analytic power tables (Sharpe, per-trade, hit rate, option payoffs, streaks, design effect) |
| `simulate.py` | Simulations A–I; `normal_mixture_eprocess`; `miscalibration_lr_test` |
| `ledger.py`, `ledger_schema.json` | Append-only hash-chained ledger with ordering rules; JSON Schema for all record types |
| `run_all.py` | Reproduces every table (writes `results/results.json`, `results/demo_ledger.jsonl`) |
| `test_reference.py` | 10 tests: Murphy/CORP identities; log-diff = Kelly growth; slope recovery; Bayes updates; shrinkage; Thompson constraints; DSR < PSR and MinBTL(45) ≈ 5 years; PBO; e-process false-positive rate ≤ 5% under monthly peeking; ledger tamper and ordering rules |

---

## 7. Limitations and open questions

- **The simulations are stylized.** They use Gaussian residual returns, stationary alpha, independent candidates and costless paper trades. Reality adds fat tails, regime shifts, repeated names across months, sector clustering and slippage. All of these *reduce* effective sample sizes, so the timelines above are optimistic lower bounds.
- **Transfer is not guaranteed.** Forecast skill measured on the shadow book and gym may not carry over to the few selected trades (selection effects, optimizer's curse). Skill on forecasts is **necessary but not sufficient** for profit, and costs and sizing can still erase it.
- **The physical-probability baseline is itself a model.** Its risk-premium adjustment needs its own calibration on a large historical panel. If the baseline is biased, "skill" is mis-measured in the direction of the bias.
- **The e-process is only approximately valid.** With variance estimated from the cross-section, the implementation is asymptotically anytime-valid. Its false-positive rate was checked by simulation (≤3%), but it should be re-checked on the real data's dependence structure.
- **Prior strengths (20–50), gates (150/1000) and budgets (2 per month) are judgment calls.** They are informed by the simulations but not optimized, and should be revisited once a year with a sensitivity analysis, as a human-owned tier 4 review.
- **Some figures may have moved since checked.** The ForecastBench parity projection (Nov 2026) should be re-checked. Some of Atanasov et al.'s effect sizes could not be verified from the primary text and are cited only qualitatively.

---

## 8. Implications for the system design (concrete rules and parameters)

**Evidence generation**

1. **Every recommendation ships ≥6 pre-registered sub-forecasts** across the families in §4.1: two relative-return horizons, target, stop-before-target, catalyst, and quantiles. Each has a mechanical resolution source.
2. **Shadow book per scan:** selected + top-30 rejected + 10 random controls, all with the same forecast template and a paper plan (next-open fill, cost haircut). Shadow evidence is weighted at 0.5 in posteriors.
3. **Calibration gym:** about 200 standardized questions a month, including inverted pairs (P(up) and P(down) asked separately) to measure optimism.
4. **Probabilities in 1-point steps**, the median of ≥5 LLM samples in log-odds, with the raw samples logged. Noise audit monthly: 20 questions × 7 samples. Target: declining dispersion.

**Scoring and inference**

5. **Primary skill metric:** mean log-score differential against **physical** market-implied probabilities, averaged per trade and then per month. Report Brier alongside it.
6. **All inference is clustered** by trade and by month. Never treat same-month questions as independent.
7. **Monthly "evidence meters"** are mixture e-processes (threshold E ≥ 20). Adoption decisions use pre-registered looks at months 6, 12, 24 and 36 with α split evenly. **No uncorrected monthly p-values.**
8. **Do not judge skill on P&L before about 5 years.** Report it, with its PSR, DSR (using the full trial count), MinTRL and drawdown percentile.

**Calibration**

9. **Recalibrate per question family.** Use the identity map below 150 resolved questions (borrow the pooled map if the gate fires). Use **gated Platt** (likelihood-ratio p < 0.05, rolling out-of-sample gain > 0, |Δb| ≤ 0.2 per month) from 150. Use isotonic only from 1000, and only if it beats Platt out of sample.
10. **Treat any LLM model or prompt change as a new forecaster.** Run old and new in parallel for ≥2 months, and start the new maps from the old ones as priors.

**Learning and allocation**

11. **Beta and NIG posteriors per archetype.** Prior means are haircut ≥50% from backtests. Prior strength is 50 for established archetypes and 20 for new ones. Use empirical-Bayes pooling across archetypes.
12. **Attention and capital tilts via Thompson sampling:** damping 0.25, max step 10 points a month, floor 10%, cap 50%.
13. **Sizing:** 0.25 × Kelly on the posterior predictive, within the constitution's hard caps.

**Change control**

14. **Change budget:**
    - ≤2 registered proposals a month;
    - ≤1 change per parameter per quarter;
    - ≤1 structural (tier 3) change per quarter;
    - tier 4 (risk limits, objective, evaluator, change policy) is the human's only.
15. **Adoption standard (tier 2):** a *forward* shadow A/B test of 6 months (the setting simulated; 3 months at minimum when evidence is abundant), ≥100 paired shadow candidates, posterior P(Δ > 0) ≥ 0.95 under a skeptical N(0, σ²) prior, and a pre-registered minimum effect. The change then runs 3 months on probation at 50% influence with automatic rollback.
16. **New archetypes:** incubation (shadow only, ≥3–6 months), then probation (live at 25–50% size for ≥6 trades or 6 months), then active.
17. **Trial registry.** Log every variant considered, and feed the count into the DSR. Weigh any proposal against the expected best Sharpe of the count so far (for example, 20 trials over 3 years gives an expected best in-sample Sharpe of 1.1 by luck).

**Guardrails**

18. **Lucky streak:**
    - no risk increase for 2 months after a >2σ month;
    - risk limits rise ≤25% a quarter, and only with the human, ≥30 closed trades, PSR(0) ≥ 0.95 and DSR ≥ 0.9.
19. **Drawdown:**
    - within the 95% band (for example 37% over 2 years at Sharpe 1.0), make no strategy change;
    - beyond it, human review;
    - beyond 1.25× the band, pause new trades pending review.
20. **Retirement:** only on thesis invalidation, a CUSUM/SPRT alarm (≤10% false alarms in 5 years), or posterior P(edge > 0) < 0.2 after ≥20 trades together with negative shadow evidence. Never within 12 months or 12 trades otherwise. Keep a probation floor rather than going to zero.

**Integrity**

21. **Append-only hash-chained ledger.** Entry forecasts are never overwritten. The head hash is in every email. Corrections are new records.
22. **Separation of powers:**
    - frozen, hash-pinned evaluator (read-only to the LLM) that computes all numbers;
    - the strategist proposes;
    - a different reviewer model red-teams and blind-grades;
    - a deterministic rule engine decides;
    - the human owns invariants.
23. **No LLM-judgment backtest over the model's pre-cutoff period counts as evidence.** Only forward data, point-in-time models or anonymized diagnostics do.
24. **Post-mortems grade blind first.** Only "deserved loss" and "dumb luck" classifications may feed proposals. Free-text lessons change nothing until converted into a registered, tested proposal.
25. **Drift monitor:** a monthly diff against v1.0.0 and against 12 months ago. More than 5 parameters changed in 12 months triggers a human review of the whole constitution.

---

## References

**Forecasting and decision science**

- Atanasov, P., Witkowski, J., Ungar, L., Mellers, B., Tetlock, P. (2020). Small steps to accuracy: Incremental belief updaters are better forecasters. *Organizational Behavior and Human Decision Processes* 160:19–35.
- Baron, J., Hershey, J. (1988). Outcome bias in decision evaluation. *J. Personality and Social Psychology* 54(4):569–579.
- Baron, J., Mellers, B., Tetlock, P., Stone, E., Ungar, L. (2014). Two reasons to make aggregated probability forecasts more extreme. *Decision Analysis* 11(2).
- Brier, G. (1950). Verification of forecasts expressed in terms of probability. *Monthly Weather Review* 78(1).
- Chang, W., Chen, E., Mellers, B., Tetlock, P. (2016). Developing expert political judgment. *Judgment and Decision Making* 11(5):509–526.
- Cox, D. R. (1958). Two further applications of a model for binary regression. *Biometrika* 45.
- Dawid, A. P. (1984). Statistical theory: the prequential approach. *JRSS-A* 147.
- Diebold, F., Gunther, T., Tay, A. (1998). Evaluating density forecasts. *International Economic Review* 39(4).
- Diebold, F., Mariano, R. (1995). Comparing predictive accuracy. *JBES* 13(3).
- Dimitriadis, T., Gneiting, T., Jordan, A. (2021). Stable reliability diagrams for probabilistic classifiers. *PNAS* 118(8).
- Duke, A. (2018). *Thinking in Bets*. Duke, A. (2022). *Quit: The Power of Knowing When to Walk Away*.
- Fischhoff, B. (1975). Hindsight ≠ foresight. *J. Exp. Psych.: HPP* 1(3).
- Friedman, J., Baker, J., Mellers, B., Tetlock, P., Zeckhauser, R. (2018). The value of precision in probability assessment. *International Studies Quarterly* 62(2):410.
- Gneiting, T., Raftery, A. (2007). Strictly proper scoring rules, prediction, and estimation. *JASA* 102(477).
- Gneiting, T., Balabdaoui, F., Raftery, A. (2007). Probabilistic forecasts, calibration and sharpness. *JRSS-B* 69(2).
- Good, I. J. (1952). Rational decisions. *JRSS-B* 14(1).
- Kahneman, D., Sibony, O., Sunstein, C. (2021). *Noise*.
- Klein, G. (2007). Performing a project premortem. *HBR*, Sept 2007 (citing Mitchell, Russo & Pennington 1989).
- Matheson, J., Winkler, R. (1976). Scoring rules for continuous probability distributions. *Management Science* 22(10).
- Mellers, B. et al. (2014). Psychological strategies for winning a geopolitical forecasting tournament. *Psychological Science* 25:1106–1115.
- Mellers, B. et al. (2015). Identifying and cultivating superforecasters. *Perspectives on Psychological Science* 10(3):267–281.
- Murphy, A. (1973). A new vector partition of the probability score. *J. Applied Meteorology* 12(4).
- Satopää, V., Baron, J., Foster, D., Mellers, B., Tetlock, P., Ungar, L. (2014). Combining multiple probability predictions using a simple logit model. *IJF* 30(2):344–356.
- Satopää, V., Salikhov, M., Tetlock, P., Mellers, B. (2021). Bias, information, noise: the BIN model of forecasting. *Management Science* 67(12):7599–7618.
- Stephenson, D., Coelho, C., Jolliffe, I. (2008). Two extra components in the Brier score decomposition. *Weather and Forecasting* 23(4).
- Tetlock, P. (2005). *Expert Political Judgment*. Tetlock, P., Gardner, D. (2015). *Superforecasting*.
- Thaler, R., Johnson, E. (1990). Gambling with the house money and trying to break even. *Management Science* 36(6).

**Calibration, statistics and sequential testing**

- Browne, S., Whitt, W. (1996). Portfolio choice and the Bayesian Kelly criterion. *Advances in Applied Probability* 28(4):1145–1176.
- Deng, A., Xu, Y., Kohavi, R., Walker, T. (2013). Improving the sensitivity of online controlled experiments by utilizing pre-experiment data (CUPED). *WSDM*.
- DerSimonian, R., Laird, N. (1986). Meta-analysis in clinical trials. *Controlled Clinical Trials* 7.
- Dwork, C. et al. (2015). The reusable holdout. *Science* 349(6248):636–638.
- Efron, B., Morris, C. (1975). Data analysis using Stein's estimator. *JASA* 70(350).
- Gelman, A. et al. (2013). *Bayesian Data Analysis*, 3rd ed.
- Hoeting, J., Madigan, D., Raftery, A., Volinsky, C. (1999). Bayesian model averaging: a tutorial. *Statistical Science* 14(4).
- Johari, R., Koomen, P., Pekelis, L., Walsh, D. (2022). Always valid inference: continuous monitoring of A/B tests. *Operations Research* 70(3) (KDD 2017 version: "Peeking at A/B tests").
- Kelly, J. (1956). A new interpretation of information rate. *Bell System Technical Journal* 35(4).
- Kish, L. (1965). *Survey Sampling*.
- Magdon-Ismail, M., Atiya, A., Pratap, A., Abu-Mostafa, Y. (2004). On the maximum drawdown of a Brownian motion. *J. Applied Probability* 41(1).
- Mertens, E. (2002). Comments on variance of the IID estimator in Lo (2002). Working paper.
- Niculescu-Mizil, A., Caruana, R. (2005). Predicting good probabilities with supervised learning. *ICML*.
- Page, E. (1954). Continuous inspection schemes. *Biometrika* 41.
- Platt, J. (1999). Probabilistic outputs for support vector machines. *Advances in Large Margin Classifiers*.
- Ramdas, A., Grünwald, P., Vovk, V., Shafer, G. (2023). Game-theoretic statistics and safe anytime-valid inference. *Statistical Science* 38(4):576–601.
- Russo, D., Van Roy, B., Kazerouni, A., Osband, I., Wen, Z. (2018). A tutorial on Thompson sampling. *FnT ML* 11(1).
- Shafer, G. (2021). Testing by betting. *JRSS-A* 184(2).
- Smith, J., Winkler, R. (2006). The optimizer's curse. *Management Science* 52(3):311–322.
- Thompson, W. (1933). On the likelihood that one unknown probability exceeds another. *Biometrika* 25.
- Wald, A. (1945). Sequential tests of statistical hypotheses. *Annals of Math. Stat.* 16(2).
- Zadrozny, B., Elkan, C. (2002). Transforming classifier scores into accurate multiclass probability estimates. *KDD*.

**Finance and overfitting**

- Arnott, R., Harvey, C., Markowitz, H. (2019). A backtesting protocol in the era of machine learning. *J. Financial Data Science* 1(1).
- Bailey, D., López de Prado, M. (2012). The Sharpe ratio efficient frontier. *J. Risk* 15(2).
- Bailey, D., López de Prado, M. (2014). The deflated Sharpe ratio. *J. Portfolio Management* 40(5).
- Bailey, D., Borwein, J., López de Prado, M., Zhu, Q. (2014). Pseudo-mathematics and financial charlatanism. *Notices of the AMS* 61(5).
- Bailey, D., Borwein, J., López de Prado, M., Zhu, Q. (2017). The probability of backtest overfitting. *J. Computational Finance* 20(4).
- Bollerslev, T., Tauchen, G., Zhou, H. (2009). Expected stock returns and variance risk premia. *RFS* 22(11).
- Grinold, R. (1989). The fundamental law of active management. *JPM* 15(3).
- Hansen, P. (2005). A test for superior predictive ability. *JBES* 23(4).
- Harvey, C., Liu, Y., Zhu, H. (2016). …and the cross-section of expected returns. *RFS* 29(1).
- Lo, A. (2002). The statistics of Sharpe ratios. *FAJ* 58(4).
- López de Prado, M. (2018). *Advances in Financial Machine Learning*.
- McLean, R. D., Pontiff, J. (2016). Does academic research destroy stock return predictability? *J. Finance* 71(1):5–32.
- Roll, R. (1988). R². *J. Finance* 43(3).
- White, H. (2000). A reality check for data snooping. *Econometrica* 68(5).
- Wiecki, T., Campbell, A., Lent, J., Stauth, J. (2016). All that glitters is not gold. *J. Investing* 25(3); SSRN 2745220.

**LLMs, forecasting and trading (checked on the web, Sept 2026)**

- Benhenda, M. (2026). Look-Ahead-Bench. arXiv:2601.13770.
- Cai, X. et al. (2026). OpenPM: Auditable point-in-time evaluation for LLM portfolio-management agents. arXiv:2608.09988.
- Cho, S., Koshiyama, A. (2026). OptimismBench. arXiv:2607.26981.
- Forecasting Research Institute (29 Jan 2026). LLMs are closing the gap on human superforecasters. https://forecastingresearch.substack.com/p/llms-are-closing-the-gap-on-human ; ForecastBench: https://www.forecastbench.org/ ; Karger et al., arXiv:2409.19839.
- ForkLog (Nov 2025). Four out of six AI models suffer losses in trading tournament (Alpha Arena Season 1). https://forklog.com/en/four-out-of-six-ai-models-suffer-losses-in-trading-tournament/
- Gao, Z., Jiang, W., Yan, Y. (2025, rev. 2026). Detecting lookahead bias in LLM forecasts. arXiv:2512.23847.
- Glasserman, P., Lin, C. (2023). Assessing look-ahead bias in stock return predictions generated by GPT sentiment analysis. arXiv:2309.17322.
- Halawi, D., Zhang, F., Yueh-Han, C., Steinhardt, J. (2024). Approaching human-level forecasting with language models. NeurIPS; arXiv:2402.18563.
- He, S., Lv, L., Manela, A., Wu, J. (2025). Chronologically consistent large language models. arXiv:2502.21206.
- Huang, J., Chang, K. (2024). Large language models cannot self-correct reasoning yet. ICLR; arXiv:2310.01798.
- Li, W. et al. (2025). Can LLM-based financial investing strategies outperform the market in long run? (FINSABER). arXiv:2505.07078.
- METR (2025). Recent frontier models are reward hacking. https://metr.org/blog/2025-06-05-recent-reward-hacking/
- Nechepurenko, M., Shuvalov, P. (2026). Foresight Arena. arXiv:2605.00420.
- Nosek, B. et al. (2018). The preregistration revolution. *PNAS* 115(11).
- Sharma, M. et al. (2024). Towards understanding sycophancy in language models. ICLR.
- Turpin, M., Michael, J., Perez, E., Bowman, S. (2023). Language models don't always say what they think. NeurIPS; arXiv:2305.04388.
- Xiong, M. et al. (2024). Can LLMs express their uncertainty? ICLR.
