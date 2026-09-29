# 38 — The growth book: the largest return at a reasonable risk, one Sunday email a week

*Research track 38, 29 September 2026: the synthesis of round 3 (tracks 26–37) for the owner's objective of the same night, "optimize for largest return with reasonable risk tolerance", with at most one recommendation a week. It gives the numbers behind `00-SYSTEM-DESIGN-v4.md`. Code: `research/code/38-growth-book/run38.py` (about 5 minutes, fixed seed 38, no network; it reuses track 31's engine and cached sleeves). Every table has a CSV twin in `research/code/38-growth-book/results/`. Returns are nominal, after fund costs, before tax, in the IRA unless a table says otherwise. Nothing here is individualized financial advice; every book below can lose most of its money.*

---

## TL;DR

1. **The objective, made precise (track 34 §5.1):** maximise expected log growth subject to a 10-year maximum drawdown worse than D happening on at most 1 path in 10, for D = 30%, 40% and 50%, judged under three belief sets: the design's forward view (equities 4.5% a year at CAPE ≈ 41, T-bills 4.2%, Bitcoin 7.5% a year), a repeat of 2008–2026, and a 50/50 mixture of the two.
2. **What moves the frontier is the Bitcoin switch, then the drawdown limit; equity leverage matters only if history's premium returns.** In the forward world a book of 30% Bitcoin switch + 15% gems over T-bills earns almost the same growth (median 9.3% a year) as the same book with a 2× trend-filtered equity core added (9.5%); if 2008–2026 repeats, the core adds 11 points (34.5% vs 23.6%). The governor scaled to D = 40% is what makes holding that core affordable in the forward world: it takes P(10-year drawdown > 40%) from 19% to 0% at a cost of 0.4 points of forward growth.
3. **The book (§5): 25% SSO + 25% QLD on their weekly 200-day filters, 30% IBIT on the 10-week + 200-day switch, 15% reserved for the gems satellite (SGOV until its rules are promoted), 5% SGOV; a book-level governor at full size to −15%, 25% size at −35%; a hard stop at −40%.** Forward: median 9.5% a year (10th–90th percentile 1.7–18.3%), P(beat SPY) 77%, P(beat SPY by ≥ 5 points) 47%, P(drawdown > 30%) 38%, > 40% 0%, 2× in a median 6.4 years, 10× in 24. If the last decade repeats: median 34.5%, 2× in 2.1 years, 10× in 7.6. SPY forward: 5.0%, P(drawdown > 40%) 50%.
4. **D = 40% is "reasonable" for this owner because it is safer than buy-and-hold SPY on every drawdown measure while keeping most of the upside; D = 30% costs 0.4 forward points and 1.1 historical points for a governor that bites in a third of decades; D = 50% adds 0.4 forward points and admits a 1-in-5 chance of a −40% decade.** Each D is a switch in the config (§3, §4).
5. **Honest one-liner: in the central case this is about 9–10% a year (SPY about 5%); it makes 30–35% a year only if the last decade repeats.** No credible book reaches "SPY + 5" in the median forward case without 40–50% Bitcoin, and none reaches 100% a year (track 34). Rejected for this book: 3× funds, momentum rotation, single-stock momentum, options as leverage, 2× Bitcoin ETFs, the century meta-rule and LLM picks (§8), each for the reason its own track gave.

---

## 0. The objective as numbers

The owner's words on 29 September were, in order: "exceed SPY by a large margin" (tracks 26–33), "100% a year as the baseline" (answered by track 34: not feasible), then "optimize for largest return with reasonable risk tolerance", with at most one recommendation a week and "don't give me wrong". Track 34 §5.1 turned the last of these into an objective that can be optimised without promising a rate:

> **Maximise the expected log growth rate of wealth over 10 years, after costs, subject to P(the maximum peak-to-trough drawdown within the 10 years exceeds D) ≤ 10%.**

- Expected log growth is what compounds: it maximises the median outcome and minimises the expected time to any large multiple (Breiman 1961; track 03 §1). It is reported here as `exp_log_growth_10y` and, more readably, as the median 10-year CAGR.
- D is the owner's loss tolerance. Three values are worked through: **30%, 40% and 50%**. The 10% tolerance is a model number (§11): drawdowns in a block bootstrap are understated for long bear markets, so the design adds a hard stop at D on top of the probability.
- "Reasonable risk" is read against the benchmark the owner would otherwise hold: SPY, whose 10-year drawdown exceeds 40% on half of forward paths and 31% of historical ones (§5). A book that stays inside D = 40% at a 10% tolerance is therefore *less* likely to halve than the index.
- Three belief sets, because the tracks disagree with history by a factor of 4–10 in the size of the bet (track 31 §2):
  - **forward-central:** track 31's forward sleeves: the S&P 500 and Nasdaq-100 tilted to 4.5% a year over 2008–2026, T-bills 4.2%, each rule's timing alpha shrunk by 1 − κ (κ = 0.5 for the equity filters, 0.29 for the Bitcoin switch from its 2021–2026 out-of-sample t of 0.63), Bitcoin tilted to 7.5% a year buy-and-hold (its peak-to-peak cycle-decay extrapolation, track 31 §3.1; track 28's central 11.4% is a bull sensitivity here);
  - **historical-repeat:** the same sleeves as they happened, 2008–2026, with Bitcoin from November 2014 (the bootstrap fills earlier blocks from Bitcoin's own history, as track 31 did);
  - **blend:** a 50/50 mixture of the two worlds' paths, on the same block draws. Its expected log growth is the average of the two; its "median" is the middle of a bimodal mixture and is quoted only for completeness.

---

## 1. Method

- **Engine.** Track 31's `engine31.py`: a block bootstrap of daily returns (blocks of 21, 42 or 63 sessions drawn from the 2008–2026 window; 2,000 paths of 10 years for the grid, 1,000 of 20 years for the governors, 1,000 of 50 years for the finalists), common random numbers across books and worlds, books rebalanced daily to their weights (track 31 §5.3 showed weekly band rebalancing on the real path is no worse). Governors scale the book's excess over T-bills by G(drawdown), re-set every 5 sessions.
- **Sleeves** (§2): track 31's cached series for SPY, QQQ, the 1×/2×/3× filtered S&P 500 and Nasdaq-100 funds (weekly decisions, next-open fills, 0.05% a switch, track 04's validated fund model), and the Phase A book; new here, the Bitcoin switch with track 28's 200-day condition (IBIT costs, the Monday-open delay) and the gems stream.
- **The gems stream is an estimate, not a backtest.** Track 35 §7 gives the top five rules' contribution to a $100k book: +2.7% in a normal year (−3.5% to +9.5%), +11% in a 2008/2020-type year, +1.7% once the crypto trusts have converted (2028). The stream draws one normal-year figure per calendar year from that triangular distribution and adds the crash bonus over the 60 sessions after the 2008 and 2020 troughs; the forward version uses the post-2028 level and κ = 0.5 (+0.85% normal, +5.5% crash). Only G1 (crypto-trust discounts) and G2 (CEF crash discounts) are in the 15% reserve; G3 (post-devaluation country ETFs) needs 12-month holds and stays a shadow candidate; G4 and G5 are excluded (tender instructions; prediction markets are a data source by decision 3). What the stream contributes in the simulation: **+3.7% of NAV a year in the historical world, +1.1% forward** (`gems_stream.csv`), with a sleeve drawdown of −11 to −12%.
- **The grid.** 324 books: an equity vehicle (SPY held; the 1× filtered blend; SSO only; the SSO/QLD blend; UPRO only; the UPRO/TQQQ blend) at 0–100% of NAV, the Bitcoin switch at 0–50%, the gems reserve at 0 or 15%, the rest in T-bills (SGOV). Then five governors on a shortlist of 62 books, and 16 finalists on 50-year paths.
- **Runtime** 320 s on 4 cores (`results/summary.txt`); seed 38; nothing touches the network.

---

## 2. The sleeves and their pre-registered rules

| Sleeve | Rule (from its track) | Forward 2008–2026: CAGR / vol / worst drawdown | History 2008–2026 | Source |
|---|---|---|---|---|
| SSO (2× S&P 500), filtered | Hold while the S&P 500 index closes above its 200-day average at the week's last close; T-bills otherwise; decided Friday, filled Monday's open | 2.4% / 20.8% / −45% | 14.9% / 22.9% / −34% | track 26 §3 (2% band variant), track 31 §3.1 |
| QLD (2× Nasdaq-100), filtered | The same rule on the Nasdaq-100 | 3.2% / 28.6% / −50% | 21.6% / 32.4% / −50% | track 26 §3.2, track 31 |
| UPRO / TQQQ (3×), filtered | The same rule | 0.1% / −71%; −0.1% / −77% | 20.2% / −47%; 28.3% / −66% | track 26 §6 (rejected as a core) |
| SPY, held | — | 4.4% / 19.8% / −56% | 11.2% / −53% | — |
| **IBIT, 10-week + 200-day switch** | On while Bitcoin's Sunday 00:00 UTC weekly close is above its 10-week average of Sunday closes **and** above its 200-day average of daily closes; SGOV otherwise; decided Sunday, filled Monday's open (13.5 h later) | 2014–2026: 11.6% / −70% (κ 0.29) | 61.9% / −44%, in the market 48% of weeks, 6.2 switches a year | track 28 §9 (rule), track 31 §3.1 (forward recipe) |
| IBIT, 10-week switch (M3 today) | Sunday close above its 10-week average | 12.0% / −77% (κ 0.26) | 57.8% / −67%, 8.1 switches | design v3.3 §3 M3 |
| Gems reserve (15%) | Track 35 §6 G1 and G2 as pre-registered; SGOV until promoted | +1.1% of NAV a year (estimate) | +3.7% of NAV a year (estimate) | track 35 §6–§7 |
| Phase A book (v3.3) | M1, M2, M3, W10 | 5.0% / 1.2% / −10% | 5.5% / −10% | track 23, docs/phase-b/replay.md |
| T-bills (SGOV) | — | 4.2% | 1.4% (2008–2026 average) | — |

Two things to notice before any optimisation:
- **Forward, leverage on the filtered index earns less than the unlevered fund** (2.4% and 3.2% against SPY's 4.4%): with a 0.3-point premium over financing, volatility drag wins (track 31 §1, track 26 §6). Historically the same sleeves made 15–22%.
- **The 200-day condition on the Bitcoin switch buys drawdown, not return:** −44% instead of −67% in history at a slightly higher CAGR, with fewer switches (track 28 §3.1 found the same: it kept the rule out of most of 2018 and all of 2022).

---

## 3. The frontier

**Table 1. The best feasible book by belief set and drawdown limit, without a governor** (`frontier.csv`; 10-year paths; "feasible" = P(max drawdown > D) ≤ 10%; E[g] = expected log growth a year; SPY's forward median is 5.1%, historical 12.0%).

| Belief | D | Best feasible book | E[g] | Median 10-y CAGR (p10–p90) | P(beat SPY) | P(≥ SPY + 5) | P(dd > 30 / 40 / 50%) |
|---|---|---|---|---|---|---|---|
| forward-central | 30% | SPY 40% + BTC 20% + gems 15% | 0.089 | 9.3% (4.0–15.3%) | 84% | 47% | 7 / 1 / 0% |
| forward-central | 40% | SPY 40% + BTC 30% + gems 15% | 0.102 | 10.5% (3.4–19.0%) | 84% | 57% | 31 / 6 / 1% |
| forward-central | 50% | SPY 40% + BTC 40% + gems 15% | 0.113 | 11.6% (2.7–22.6%) | 84% | 61% | 67 / 24 / 6% |
| historical-repeat | 30% | 1× filtered 40% + BTC 40% + gems 15% | 0.307 | 35.5% (22.9–50.9%) | 99% | 97% | 10 / 1 / 0% |
| historical-repeat | 40% | 3× blend 40% + BTC 40% + gems 15% | 0.373 | 45.2% (28.8–63.6%) | 100% | 100% | 46 / 9 / 1% |
| historical-repeat | 50% | 3× blend 50% + BTC 50% | 0.405 | 49.8% (29.2–74.0%) | 100% | 100% | 87 / 39 / 10% |
| blend | 30% | 1× filtered 40% + BTC 30% + gems 15% | 0.178 | 18.8% (5.6–35.8%) | 89% | 74% | 10 / 1 / 0% |
| blend | 40% | 1× filtered 40% + BTC 40% + gems 15% | 0.208 | 22.4% (5.4–44.9%) | 89% | 78% | 33 / 9 / 2% |
| blend | 50% | 3× blend 40% + BTC 40% + gems 15% | 0.240 | 25.7% (4.3–57.0%) | 89% | 78% | 67 / 30 / 10% |

**Table 2. The same, with a governor allowed** (`frontier_governed.csv`; 62 shortlisted books × 5 governors; 20-year paths, 10-year statistics). Governors: *wide* = track 31's (full size to −20%, 25% at −50%); *D40* = full size to −15%, 25% at −35%; *D30* = full size to −10%, 25% at −25%; *floor 60* = exposure proportional to the cushion above 60% of the peak (Grossman–Zhou).

| Belief | D | Best feasible governed book | E[g] | Median (p10–p90) | P(≥ SPY + 5) | P(dd > 30 / 40 / 50%) |
|---|---|---|---|---|---|---|
| forward-central | 30% | 2× blend 40% + BTC 30% + gems 15%, D30 | 0.095 | 9.8% (2.8–17.9%) | 48% | 0 / 0 / 0% |
| forward-central | 40% | 2× blend 40% + BTC 30% + gems 15%, wide | 0.100 | 10.4% (3.2–18.8%) | 51% | 38 / 3 / 0% |
| forward-central | 50% | 2× blend 40% + BTC 30% + gems 15%, none | 0.101 | 10.6% (3.4–18.9%) | 51% | 41 / 11 / 2% |
| historical-repeat | 30% | 3× blend 50% + BTC 30% + gems 15%, D30 | 0.310 | 37.0% (20.8–52.6%) | 98% | 5 / 0 / 0% |
| historical-repeat | 40% | 3× blend 50% + BTC 30% + gems 15%, wide | 0.343 | 41.5% (26.1–56.4%) | 100% | 52 / 6 / 0% |
| historical-repeat | 50% | 3× blend 50% + BTC 30% + gems 15%, none | 0.348 | 41.9% (26.9–56.7%) | 100% | 55 / 13 / 1% |
| blend | 30% | 3× blend 50% + BTC 30% + gems 15%, D30 | 0.197 | 18.6% (3.2–46.9%) | 69% | 7 / 0 / 0% |
| blend | 40% | 3× blend 50% + BTC 30% + gems 15%, D40 | 0.211 | 20.7% (3.3–50.0%) | 72% | 57 / 0 / 0% |
| blend | 50% | 3× blend 50% + BTC 30% + gems 15%, none | 0.223 | 23.0% (4.1–51.5%) | 75% | 71 / 30 / 10% |

What the frontier says:
1. **Bitcoin sets the level.** Every winning book holds 30–50% in the switch. Moving from 20% to 30% Bitcoin adds about 1.3 forward points and 5 historical points; from 30% to 40% another 1.1 and 5. The books' forward P(≥ SPY + 5) rises from 47% to 61% along the same line. The price is drawdown: at 40% Bitcoin the ungoverned P(dd > 40%) is 6–9% in history and 14–24% forward; at 50% it is 39% and 42–48%.
2. **Equity leverage is a bet on the equity premium, and the frontier says so twice.** In the forward world, plain SPY at 40% beats every filtered 2× or 3× vehicle at every D (row 1–3 of Table 1; the 2× books cost 0.2–0.5 forward points and add drawdown). In the historical world, 3× wins at D ≥ 40% and 1× at D = 30%. The blend splits the difference.
3. **A governor lets a more levered book meet the same D at about the same growth.** With the D30 or D40 governor a 2× or 3× book meets the constraint that only unlevered books met without one; but the governed book's expected growth is no higher than the best ungoverned feasible book's (forward 0.095–0.101 against 0.089–0.113). The governor converts drawdown risk into a slightly lower mean, it does not manufacture return (track 31 §6 found the same).
4. **3× is on the historical frontier but it is rejected for the design** (track 26 §8, §4.1; track 34 §3): a 1987-style day costs a 3× fund 61% before any rule can act, a −33% index day wipes it out, and its forward median is below SPY's. Its historical edge over 2× (41.5% vs 34.5% a year at D = 40%) is the tech decade at triple weight.
5. **Gems at 15% are on every frontier row.** They add about 1 point forward and 3.7 historical (the estimate of §1) at almost no drawdown, because they pay after crashes, when the trend sleeves are already in T-bills.

---

## 4. The governor

**Table 3. The recommended book under each governor** (`governed_20y.csv`; 20-year paths; 10-year statistics; the 20-year P(dd > 40%) in the last column).

| Belief | Governor | E[g] | Median 10-y CAGR | P(≥ SPY + 5) | P(dd > 30 / 40 / 50%) | Median max dd | P(below start) | P(dd > 40%) over 20 y |
|---|---|---|---|---|---|---|---|---|
| forward | none | 0.101 | 10.6% | 52% | 55 / 18 / 4% | 31% | 4.4% | 37% |
| forward | wide (20 → 50) | 0.099 | 10.4% | 51% | 52 / 8 / 0% | 30% | 4.3% | 21% |
| forward | **D40 (15 → 35)** | **0.097** | **10.1%** | **49%** | **36 / 0 / 0%** | 28% | 3.6% | 0% |
| forward | D30 (10 → 25) | 0.092 | 9.4% | 45% | 0 / 0 / 0% | 24% | 2.6% | 0% |
| forward | floor 60% | 0.091 | 9.3% | 45% | 1 / 0 / 0% | 22% | 2.0% | 0% |
| history | none | 0.308 | 36.1% | 99% | 15 / 1 / 0% | 23% | 0% | 3% |
| history | D40 | 0.304 | 35.6% | 99% | 6 / 0 / 0% | 23% | 0% | 0% |
| history | D30 | 0.294 | 34.4% | 98% | 0 / 0 / 0% | 21% | 0% | 0% |
| blend | none | 0.204 | 21.1% | 75% | 35 / 10 / 2% | 27% | 2.2% | 20% |
| blend | D40 | 0.200 | 20.3% | 74% | 21 / 0 / 0% | 26% | 1.8% | 0% |

- **The D40 governor costs 0.4 forward points and 0.4 historical points and removes the > 40% decade** (18% → 0% forward over 10 years; 37% → 0% over 20). Track 31's wide governor is not enough for this book at D = 40% (8% over 10 years, 21% over 20).
- **The D30 governor is the D = 30% design's governor; the floor rule is safer still but costs 1 point more.** "Cash lock" (track 31 §6): a governor whose floor is reached early sits at 25% size for years. The D40 governor's floor is reached only at −35%, which the book has not seen on any real-path window since 1986 for its equity part at 50% weight (§5).
- **How it works operationally (v4 §4):** on Sunday the job computes the book's drawdown from its peak NAV at Friday's close; G is the piecewise-linear factor; every sleeve's target weight is multiplied by G; orders follow the usual bands. G never rises above 1, and after a drawdown it recovers only as the NAV recovers.

---

## 5. The chosen book, three ways

**The book:** 25% SSO + 25% QLD (each on its own weekly 200-day filter, SGOV when out), 30% IBIT on the 10-week + 200-day switch (SGOV when off), 15% gems reserve (SGOV until promoted), 5% SGOV; the D40 governor; a hard stop at −40%. Equity exposure 1.0× NAV when both filters are in; gross exposure 1.45× when everything is in (0.5 × 2 + 0.3 + 0.15).

**Table 4. Ten-year outcomes with the governor** (`finalists_50y.csv`; 1,000 paths of 50 years; SPY on the same paths).

| | Forward-central | Blend | Historical-repeat |
|---|---|---|---|
| Expected log growth a year | 0.091 | 0.194 | 0.297 |
| Median 10-year CAGR (10th–90th percentile) | **9.5% (1.7–18.3%)** | 20.6% (3.8–42.9%) | **34.5% (22.5–47.7%)** |
| SPY, same paths: median | 5.0% (−2.2 to 11.0%) | 8.1% | 11.8% (4.2–18.2%) |
| P(beat SPY over 10 years) | 77% | 88% | 100% |
| P(beat SPY by ≥ 5 points a year) | **47%** | 73% | 99% |
| P(drawdown > 30% / > 40% / > 50% within 10 years) | 38 / 0 / 0% | 23 / 0 / 0% | 8 / 0 / 0% |
| Median maximum drawdown | 28% | 26% | 23% |
| P(ending below the start after 10 years) | 5.1% | 2.6% | 0% |
| Median years to 2× (10th percentile) | **6.4 (2.4)** | 3.3 (1.4) | **2.1 (1.1)** |
| Median years to 10× (10th percentile) | **23.6 (13.7)** | 11.9 (6.0) | **7.6 (5.2)** |
| Without the governor: median / P(dd > 40%) / P(dd > 50%) | 10.1% / 19% / 5% | 21.3% / 11% / 2% | 34.9% / 2% / 0% |

For comparison on the same paths: SPY's forward P(dd > 40%) is 50% and P(dd > 50%) 22%, and its P(ending below the start) 18%; the Phase A book (design v3.3) makes 4.9% forward and 5.4% historical with no drawdown beyond 10% and reaches 10× in a median 48 years.

**The real path** (`real_path.csv`, `episodes.csv`, `calendar_years.csv`; history as it happened, daily rebalancing, no governor):
- The whole book from 7 April 2015 (the first date with all three sleeves): **35.9% a year, worst drawdown −22%, worst day −7.4%** (3 September 2020). SPY over the same years: 13.6%, −34%. The same book on the forward-shrunk sleeves over the same calendar: 10.0%, −28%.
- The equity part alone (the 2× blend at 100%) from July 1986: 17.7% a year, worst drawdown −60% (2000–2002, the Nasdaq leg), worst day −15.6% (14 April 2000); at the book's 50% weight the crash episodes were: **1987 −13%, 2000–02 −28%, 2007–09 −9%, Feb–Mar 2020 −17%, 2022 −12%, Feb–Apr 2025 −9%**, against SPY's −25%, −48%, −55%, −33%, −24%, −19%.
- **Whipsaw years** (the 2× blend at 100% / at the book's 50%; SPY): 1986 −14% / −8% (SPY +19%), 1990 −22% / −11% (−3%), 1994 −9% / −4% (+1%), 2000 −41% / −23% (−9%), 2005 −15% / −7% (+5%), 2011 −29% / −18% (+2%), 2015 −16% / −9% (+1%), 2022 −25% / −12% (−18%). Expect a year in six in which the equity part loses 10–20% of NAV while the index goes nowhere (track 26 §4.3). The whole book's worst calendar years since 2015: 2022 −10%, 2015 +1%.
- **A 1987-style day** (`shock_1987.csv`): with both filters in and the weekly sell not yet fired, a −20.5% index day costs the book about **−30%** (the 2× funds −41% each on half the book, Bitcoin assumed −25% on 30%, gems −10%). The governor then cuts size to 46% at the next Sunday; nothing can act intraday. Track 30 §5 prices the same day at −62% for a 3× core.

**Why D = 40% for this owner.** The owner has a WSB appetite ("largest return") and one constraint ("keep the account"). D = 40% is (a) safer than the index the owner would otherwise hold on every measure above; (b) recoverable: a −40% loss needs +67% to recover, which the book's central growth does in about 5–6 years, whereas −50% needs +100% (track 34 §1.1: at half Kelly the chance of ever halving is 12.5%, at full Kelly 50%); (c) cheap: D = 30% gives up 0.4 forward points and 1.1 historical points and puts the governor to work in a third of decades; D = 50% adds 0.4 forward points, but a 40% drawdown then happens in 1 decade in 5 forward and the book's Bitcoin weight would rise to 40%, where the forward return of the whole book rests on the least certain input in the study.

**The honest one-liner.** In the central case this is about 9–10% a year, with one path in ten below 2% and one in ten above 18%; it makes 30–35% a year only if the last decade repeats. Its edge over SPY in the central case (about 4–5 points) is Bitcoin's decayed cycle plus the diversification of three weakly correlated sleeves rebalanced to target, not an alpha claim; the equity core is there for the world in which history's premium returns.

---

## 6. Sensitivities

**Table 5. The recommended book, forward world, with the D40 governor** (`sensitivity_forward.csv`; 10-year paths, 1,000 draws, common random numbers within the table).

| Case | E[g] | Median 10-y CAGR (p10–p90) | P(≥ SPY + 5) | P(dd > 30 / 40 / 50%) | P(below start) |
|---|---|---|---|---|---|
| **Base case on the same draws** (forward-central, the book with the D40 governor) | **0.096** | **9.7% (2.0–19.5%)** | 50% | 38 / 0 / 0% | 3.9% |
| Bitcoin flat for the decade (0% a year buy-and-hold), switch keeps κ = 0.29 of its timing edge | 0.089 | 9.0% (1.7–18.6%) | 45% | 34 / 0 / 0% | 4.4% |
| Bitcoin flat **and** no timing edge (κ = 0): the switch is a 2.7%-a-year asset with a −79% drawdown | 0.072 | **7.0% (0.3–16.4%)** | 35% | 46 / 0 / 0% | 8.7% |
| Bitcoin 15% a year (track 28's bull case) | 0.102 | 10.6% (2.5–20.2%) | 53% | 38 / 0 / 0% | 4.0% |
| Leveraged-fund financing 1 point dearer on the borrowed unit (about 0.35 points of NAV a year) | 0.092 | 9.2% (1.8–19.1%) | 49% | 39 / 0 / 0% | 4.3% |
| Gems reserve held in SGOV instead (the estimate removed) | 0.085 | 8.4% (1.0–18.3%) | 44% | 44 / 0 / 0% | 5.9% |
| The 10-week Bitcoin rule instead of 10-week + 200-day | 0.098 | 10.1% (2.2–19.1%) | 51% | 48 / 0 / 0% | 3.9% |

(Every row is read against the base row on the same draws; the 50-year-path base in Table 4 (9.5%) differs from it only by sampling.)

- **Bitcoin is the single point of failure and it is survivable:** a flat Bitcoin decade costs 0.7 forward points if the switch keeps its shrunk timing edge and 2.7 if it has none; the book still beats SPY's 5% and keeps a 35–45% chance of SPY + 5 through the diversification of three weakly correlated sleeves (track 31 §8 found the same: a 20–40% sleeve of a volatile, weakly correlated asset rebalanced to target harvests volatility). The governor keeps P(dd > 40%) at zero in every case.
- **Financing at today's rates is already in the forward sleeves** (T-bills 4.2% + 0.4% on the borrowed unit, 0.9% fee); a further point on the borrowed unit costs 0.3–0.5 points of NAV a year.
- **The Monday-open execution delay is already in the sleeves** (next-open fills for the equity sleeves; 13.5 hours after the Sunday signal for IBIT). Track 28 §8 measured the delay's cost at 1.5 points a year of the 10W_200D sleeve against a Sunday-close fill, so about 0.45 points of NAV at 30%; a 24-hour-market limit order would recover 1–2.5 sleeve points but the design bans overnight orders (v4 §12, decision 13).
- **The 200-day condition on the Bitcoin switch costs 0.4 forward points and buys 10 points of P(dd > 30%)** (48% → 38%) and a 23-point-shallower Bitcoin drawdown in history; it is kept.
- **The gems reserve is worth about 1.3 forward points** (9.7% → 8.4% with the reserve left in SGOV); the book without it is still 3.4 points above SPY.
- **IRA vs taxable.** From track 31 Table 13 and track 32 §3.2: in a taxable account the 2× sleeves lose 0.2–0.3 forward points a year each (2.0–2.8 in history) and the Bitcoin switch 4.1–6.8 forward points (8.3–13.7 in history). At the book's weights that is **about 1.4–2.2 points of NAV a year forward and 3–5 in history, most of the book's forward edge over SPY.** Every switching sleeve goes in the IRA with limited margin; the taxable account holds only what is never sold.

---

## 7. Keep, move or retire each module (tracks 31 §5.2, 32 §4.5)

| Module (v3.3) | Worth a year | Under one Sunday email | Decision in v4 | Why |
|---|---|---|---|---|
| M1 dip-buy | +0.05–0.10% | Loses about 75% of its edge on a weekly clock (track 31 Table 10) | **Shadow** | Its 1–5 day trades need a daily clock; 6% of NAV next to a 1.0× core is noise |
| M2 monthly trend book (ETF8) | 0 to +1.2% | Replaced | **Retired; kept as a shadow series** | The 2× filtered core is the same idea at the size the objective needs; ETF8's bond, gold, currency and crude legs are not in the growth book (their forward edge is 0–1.2% at a 5%-volatility sizing) |
| M3 Bitcoin switch (3%) | −0.3 to +0.5% | Already weekly | **Promoted to G2 at 30% with the 200-day condition** | Track 28 §9; the sleeve carries the book |
| W10 crash-day buy | +0.04% (+0.14% unshrunk) | Unchanged with a Monday entry (92% winners, +6.1% mean; track 31 Table 10) | **Kept, folded into the Sunday email** at 6% of NAV × G from the SGOV cash, lowest order priority | A cheap policy bet that pays in the weeks the trend sleeves are out |
| M4 crash call spread | +0.04% at κ 0.25 | Needs a Monday 10:00–11:00 order; XSP in the taxable account | **Shadow (its Phase B twin keeps running)**; re-admission to the Sunday email is an owner decision | Fires when the core is in T-bills, so it is the only rebound exposure then, but it is 12 episodes on a model surface |
| W8 / W9 macro spreads | +0.02% | Event-day timing | **Shadow** | The event edge fades within days |
| M6, M7, the EDGAR screens, the option and macro shadow books | 0 | — | **Shadow (unchanged)** | Evidence keeps accruing at no cost |
| Rule E (track 32 §4.4): exit-only mid-week email when an index closes below its 200-day average | +0.1 to +2.2 points on 2–3× books; halved 1987's worst week | About 1.7 emails a year | **Kept as the one mid-week exception** (owner decision, default yes) | It never lowered return in six tests; it is the weekly rule checked daily, the least data-mined trigger |

---

## 8. Rejected for this book, one line each

- **3× funds as the core (UPRO/TQQQ):** forward median below SPY (track 26 §6: 2.6% a year, 81% chance of a −50% decade), −61% on a 1987 day before any rule can act, and its edge over SPY is not distinguishable from luck after 2,616 variants (reality-check p 0.40). Allowed only as an explicitly sized bet the owner opts into (v4 §12).
- **Nasdaq-100 leverage beyond the 50/50 blend:** its 2006–2026 result is the tech boom (track 26 §8.5); the blend keeps half of it at half the 2000–02 damage.
- **Momentum / relative-strength rotation (track 27):** unlevered, crypto-free rotation lost to SPY in every universe out of sample (−3.5 to −11.5 points); the winners were the asset list or leverage; stays on the never-list, and leveraged rotation joins it.
- **Single-stock momentum (track 29):** bias-free large-cap momentum is worth +1 to +3 points and fading; the weekly book's +3.9 raw is about +2 after survivorship bias and rides 2024–26; today's picks are one theme (AI hardware), which is sector rotation by another name.
- **Options as leverage (track 30):** rolled deep-in-the-money calls cost 1.3–5% a year per unit of exposure and at best tie the leveraged ETF; useful only as a gap floor at 3×, which the design does not run.
- **2× Bitcoin ETFs (track 28 §7):** BITX/BITU/BTCL lag a frictionless 2× by 13–19% a year; 2× beats 1× only if Bitcoin compounds above about 50% a year. Hold more IBIT instead, never more than 50%.
- **The century "strongest asset" meta-rule (track 36):** 7.7% vs 9.0% for US stocks over 150 years; every 2× variant ruined; ex-Bitcoin the ETF-era edge sits inside the luck band.
- **LLM-picked trades (track 37):** −2.0 to +0.8 points a year for a weekly long-only follower; every live "AI picks stocks" record trails SPY; the LLM stays a veto.
- **A 100%-a-year target (track 34):** needs a sustained Sharpe above 1.1 at full Kelly; the aggressive systems reach it in 0–0.1% of decades.
- **Bitcoin at 40–50% (tracks 28 §6, 31 §8):** on the frontier at D = 50% and in the historical world, but past track 28's half-Kelly (30%) and resting on the least certain input; 50% is the ceiling, 40% an owner decision.
- **Margin loans, daily-reset single-stock ETFs, spot crypto on Coinbase for the switch (track 32):** not available in the IRA, 5.25% cost, 60–100% maintenance on leveraged funds; Coinbase costs 3% a year of the sleeve in fees plus short-term tax.
- **Gems G4 (SPAC cash-plus) and G5 (prediction-market favourites):** tender instructions are not one of the three order kinds; prediction markets are a data source by decision 3.

---

## 9. Every alternative, ranked under the objective

Ranked by forward-central expected growth among books that meet D = 40% at a 10% tolerance (with the governor named); books that fail the constraint are listed below the line by their own tracks' numbers. "P(+5)" is P(beat SPY by ≥ 5 points a year over 10 years).

| Rank | Book (track) | Forward: median 10-y CAGR / P(+5) / P(dd > 40%) | History 2008–26: median / P(+5) | Feasible at D = 40%? | Verdict |
|---|---|---|---|---|---|
| 1 | SPY 40% + BTC switch 30% + gems 15%, D40 governor (38) | 9.9% / 52% / 0% | 28.8% / 96% | yes | The forward-believer's variant: no leverage; gives up 6 historical points |
| 2 | **2× blend 50% + BTC 30% + gems 15%, D40 governor (38; the design)** | **9.5% / 47% / 0%** | **34.5% / 99%** | yes | **Chosen: best blend growth among 2× books at ≤ 30% Bitcoin** |
| 3 | 2× blend 40% + BTC 30% + gems 15%, D40 (38) | 9.6% / 48% / 0% | 32.6% / 98% | yes | The D = 30% design, with the D30 governor |
| 4 | BTC switch 30% + gems 15% + 55% SGOV (38) | 9.3% / 49% / 0% | 23.6% / 80% | yes | No equity at all; the simplest book; 11 historical points behind |
| 5 | Track 31 A: BTC switch 40% + 10% 1× S&P + 50% T-bills (31 §4) | 10.4% / 52% / not reported (P(dd > 50%) 10%) | 26.8% / 83% | borderline ungoverned | A Bitcoin book on the 10-week rule; 40% rests on one extrapolation |
| 6 | 2× blend 60% + BTC 20% + gems 15%, D40 (38) | 8.1% / 37% / 0% | 29.7% / 98% | yes | Track 31's leverage with less Bitcoin: worse in every world than rank 2 |
| 7 | 1× filtered blend 80% + BTC 20%, D40 (38) | 7.7% / 33% / 0% | 21.7% / 81% | yes | Track 31 C without leverage |
| 8 | Track 31 B: SPY 80% + BTC switch 20% (31 §4), D40 | 7.4% / 25% / 0% | 21.6% / 88% | yes (governed) | Track 31's "most robust" book; the 10-week rule's −67% Bitcoin drawdowns at 20% |
| 9 | Track 31 C: 2× 80% + BTC 20% (10-week rule), D40 (31 §10) | 6.3% / 30% / 3% | 27.2% / 90% | yes (governed) | Track 31's paper recommendation: the D40 governor halves its forward growth |
| 10 | Phase A book, design v3.3 (23, replay) | 4.9% / 15% / 0% | 5.4% / 2% | yes | The current build: no drawdown, no growth |
| — | SPY (benchmark) | 5.0% / — / 50% | 11.8% / — | **no** | P(dd > 50%) 22% forward |
| — | 3× blend 50% + BTC 30% + gems 15%, D40 (38) | 9.3% / 46% / 1% | 40.1% / 99% | yes (governed) | Rejected: −37% on a 1987 day, −33% index day = ruin (track 26, 30) |
| — | 3× S&P trend, UPRO alone (26 §6) | 2.6% / 22% / 81% at −50% | 20.7% / 66% | no | Not robust; reality-check p 0.40 |
| — | 2× S&P trend, SSO alone (26 §8) | 4.6% / 19% / 40% at −50% | 15.3% / 39% | no | "Honest leverage, not +5" |
| — | Deep ITM calls, δ 0.90 12-month, 3× (30 §6) | ties the 3× LETF on calibrated prices, worse on conservative | 20.8% | no (P(dd > 50%) 31–41%) | At best ties the ETF |
| — | Bitcoin buy-and-hold 50% + SPY (28 §6) | +5 median excess / 50% / 51% at −50% | 35.1% | no | A coin flip on halving |
| — | Bitcoin switch 100% (31 Table 6) | 12.2% / 55% / 99% at −50% | 59% | no | One asset |
| — | ETF momentum rotation, design-selected (27) | SPY −1 to 0 / — / — | −3.5 vs SPY (2013–26) | — | Lost out of sample |
| — | 8-stock weekly momentum (29) | ≈ +0 to +2 / ≈ 25% / 51% at −50% | +3.9 raw, ≈ +2 corrected | no | Not credible |
| — | Century meta-rule, top-1 (36) | US + 0 to 2 / 20–25% / 50–60% drawdowns | 7.7% vs 9.0% (1871–2020) | no | No new module |
| — | LLM weekly pick (37) | −0.4 central / — / — | live records trail SPY | — | Mirage as an engine |
| — | Gems alone, five rules (35) | SPY + 2.7 central (−3.5 to +9.5) | +11 in a crash year | yes | A satellite, kept at 15% |

*Extrapolations:* the books marked (38) combine the tracks' sleeves in one simulation; the gems stream is an estimate (§1); the tracks' own rows use their own methods and windows (track 26's bootstrap uses 250-day blocks and 1928–2026; track 30's 12-month blocks and 1990–2026; track 28's 2018–2026 with Bitcoin at 11.4%), so they are comparable in direction, not to the decimal.

---

## 10. Track 33, the strategy zoo

Track 33 (`33-strategy-zoo.md`) simulated 3,651 systems in 8 families (buy-and-hold, trend filters, momentum rotation, dip-buying, volatility regimes, seasonality, combinations, option overlays), at most one decision a week, with costs, on data from 1928 (S&P 500), 1985 (Nasdaq-100), 1998 (sectors) and 2014 (Bitcoin). Its agent was stopped by the owner before the final polish; the report and its outputs were committed as left. What it found, against the two questions of §9:

| System (track 33 §5) | Record | Worst drawdown | Feasible at D = 40%? | Forward-central median |
|---|---|---|---|---|
| 3× Nasdaq-100 (TQQQ) held only while the index's 21-day realised volatility is below 25%, T-bills otherwise; about 3 switches a year, invested 73% of the time | +32.7% a year 1985–99, +19.2% 2000–12 (index −2.0%), +48.8% 2013–26; +46.3% a year out of sample over 13.3 years; deflated Sharpe 0.18 after the zoo's search | **−72%** | **No** (the drawdown alone breaches D; a −33% index day is ruin for a 3× fund, track 26 §4) | The zoo plans on 20–25% a year on a Nasdaq-100 that returned 15–20% a year; at this design's forward equity view (about 4.5% a year at CAPE ≈ 41) the 3× trend variants' forward median is below SPY's (track 26: −4.3% a year for TQQQ) |
| 50% 3× Nasdaq-100 above its 200-day average + 50% Bitcoin above its 200-day average, rebalanced quarterly (the owner's own example, tested as specified) | +57% a year since 2015; +34% out of sample 2021–26 (291st of 3,256); bootstrap median +32% on the last five years | **−58%** | **No** | Bitcoin's half carries it: its trend rule made +114% a year in 2016–21 and +17% in 2021–26 |
| The "+100% club": 14 systems averaging ≥ +100% a year over a decade, 13 of them with a synthetic 2× crypto fund that did not exist before June 2023 | The top 10 of Jan 2016–May 2021 (+328% to +405% a year) averaged **−4.7% a year** from May 2021 to Sep 2026; White's reality check p = 0.47 | −80% or worse for most | No | Luck and hindsight, by the zoo's own tests |

The zoo's verdict agrees with tracks 26, 28, 34 and 36: "100% a year is not a credible baseline"; without crypto, no system averaged more than +33% a year over 20+ years; the highest credible expected return it found is 20–30% a year before tax, and only with a 3× fund and drawdowns of 58–72%. Neither of its two credible systems fits D = 40%, so neither becomes a v4 sleeve; both are recorded here as the "WSB mode" alternatives for an owner who would accept D of 60% or more (design v4 §12 decision 12 covers D = 50%; anything beyond it is a new decision). The zoo's volatility-regime filter (leverage only while 21-day volatility is low) is the one mechanism v4 does not use; it is published (Moreira and Muir 2017) and worth a pre-registered shadow series on the 2× legs at the first annual review.

---

## 11. Caveats

1. **The forward world is an assumption, and everything rests on it.** Equities 4.5%, T-bills 4.2% and Bitcoin 7.5% are the design's CAPE-based view and a three-cycle extrapolation (track 31 §9). The blend is the honest way to hold it next to history; the frontier under each belief is reported so the owner can see what each world would have chosen.
2. **The 10% tolerance and the drawdown probabilities are bootstrap numbers.** One-to-three-month blocks keep momentum and volatility clustering but cut 1929–32 and 2000–02 into pieces; the real-path check (§5) is the corrective, and it shows the equity part at 50% weight losing 28% in 2000–02 with no governor. The hard stop at −40% exists because the model can be wrong.
3. **Books are rebalanced daily in the Monte Carlo; the design rebalances weekly with 25% bands.** Track 31 §5.3 found weekly band rebalancing no worse on the real path (30.6% vs 30.4%); the replay plan in v4 measures it through the real pipeline.
4. **The gems stream is a modelling estimate** (§1): it contributes about 1 forward point and 3.7 historical; without it (Table 5) the book still makes 8.4% forward. It is in the design as a *reserve* that sits in SGOV until track 35's promotion tests pass.
5. **The Bitcoin sleeve is Yahoo's BTC-USD with a Monday-open split, not IBIT's own history** (IBIT exists only from January 2024); the ETF's premium/discount at the open and its 0.25% fee are modelled, its tracking error is not. Track 28 measured IBIT's tracking at −0.8% a year, within noise.
6. **κ.** The equity filters keep half their alpha, the Bitcoin switch 29% (its out-of-sample t is 0.63). A believer in the timing rules would add 1–2 forward points; a sceptic (κ = 0 everywhere) would take away about the same and, for Bitcoin, the Table 5 "no edge" row is the answer: 7.0% a year.
7. **Behaviour.** A book with a median 28% drawdown and whipsaw years of −10 to −20% is hard to hold; abandoning it after such a year locks in the loss, which is why v4 pre-commits the governor and the hard stop instead of leaving the cut to the owner.
8. **Nothing here is a promise.** The median is the middle of simulated paths built from one historical record; the real future is one path.

---

## 12. Reproducing

```
python3 research/code/38-growth-book/run38.py            # about 5 minutes, seed 38
python3 research/code/38-growth-book/run38.py --paths 500
```

Inputs are track 31's cached sleeves (`TRACK31_DATA/inputs/hist` and `fwd_2008-2026`, built by `research/code/31-growth-portfolio/run_all.py`) and track 04's cached Bitcoin closes. Outputs and their meaning are listed in `research/code/38-growth-book/README.md`.

**Sources.** Tracks 26–37 as cited; design v3.3 §3–§8; track 03 (Kelly, governors), 04 (the leveraged-fund model), 23 (the Phase A history), 25 (the replay); Breiman (1961), Grossman & Zhou (1993), Busseti, Ryu & Boyd (2016), Gayed & Bilello (2016), Bailey & López de Prado (2014), Künsch (1989) and Politis & Romano (1994) for the block bootstrap.
