# 30: Options as the leverage vehicle for a trend-filtered equity core

*Track 30, research round of 29 September 2026. It answers one part of the owner's new objective: beat SPY by a large margin (+5 points a year or more, median over 5–10 years, after costs), with at most one recommendation a week. Market data runs to the 25 Sep 2026 close; the live CBOE option chains are from the 28 Sep 2026 close. All code is in `research/code/30-options-leverage/` (`python run_all.py`), and every number below is in a CSV in its `output/` folder. Returns are in USD, after the modelled trading costs, and before tax unless a table says otherwise.*

---

## TL;DR

1. **Options are not a cheaper way to lever an index.** Rolled deep in-the-money calls cost **1.3–2.8% a year per unit of extra exposure** on prices calibrated to real quotes, and 3.9–5.1% on track 04's conservative surface. **Robinhood margin or a 2× LETF cost 1.3%, and a 3× LETF 0.9%.**
2. **LETFs give the highest CAGR for a trend-filtered core; the best option setup at most ties them.** With the S&P 500 above its 200-day average (checked weekly), a **3× LETF made 15.1% a year in 1990–2026 (+4.3 points over SPY; max drawdown −67%) and 20.8% in 2008–2026 (+9.5)**. The best calls (delta 0.90, 12 months, rolled every 8 weeks) made 14.7% and 20.8% on calibrated prices, and 9.4% and 14.3% on conservative ones.
3. **No option setup's expected excess is large and robust.** Options only pass on the trend core's return. In 1990–2007 every call version trailed SPY, by 1.7 to 4.3 points a year even on calibrated prices. The 90/10 barbell trailed SPY by 3–4 points a year over 1990–2026; the 80/20 barbell without a filter roughly matched SPY, with a −72% drawdown. Call spreads and PMCCs were worse or unreliable.
4. **Only 3× gets to +5 points, and even then it is a coin flip with deep losses.** Trend 3× LETF over 10 years: median excess +5.5 points, P(≥ +5) 52%, P(< 0) 26%, P(drawdown worse than −50%) 41%. A weekly filter takes the whole of a 1987-style day: −62% for a 3× LETF, −34% to −43% for 3× calls. That floor is the options' one real advantage.
5. **Recommended vehicle: a 2× or 3× index LETF (SSO/UPRO or QLD/TQQQ) in the IRA, switched to T-bills by the weekly 200-day filter** (3–4 one-order emails a year). The alternative is delta-0.90, ~12-month XSP calls in the taxable account, for books of $100k or more: about the same cost on calibrated prices, a partial floor in gaps, 60/40 tax, but 2 orders per roll. Use margin only at 2×.

### Key table: trend-filtered S&P 500 core, by vehicle and leverage

Rule for every row except buy and hold: at each Friday close, if the S&P 500 is above its 200-day average, hold the stated exposure from the next session's close; otherwise hold T-bills. "Cost of leverage" is the return given up each year while invested, compared with a frictionless position that has the same day-by-day exposure and is financed at the T-bill rate. It includes fees, financing above T-bills, spreads, and for options the embedded put's price above its realised payoff.

| Vehicle | Leverage | CAGR 1990–2026 | vs SPY (points) | CAGR 2008–2026 | vs SPY | Max drawdown 1990–2026 | Worst day | Cost of leverage, % of book a year | …per unit of extra exposure |
|---|---|---|---|---|---|---|---|---|---|
| SPY, buy and hold | 1× | 10.8% | — | 11.4% | — | −55% | −12.0% | 0.1% (fee) | — |
| SPY or T-bills (trend 1×) | 1× | 8.6% | −2.3 | 9.4% | −2.0 | −21% | −6.9% | 0.1% | — |
| Robinhood margin, $100k tier | 2× | 12.0% | +1.2 | 15.1% | +3.7 | −45% | −15.8% | 1.2% | 1.3% |
| 2× LETF (SSO) | 2× | 12.2% | +1.4 | 15.4% | +4.0 | −46% | −13.8% | 1.3% | 1.3% |
| 3× LETF (UPRO) | 3× | **15.1%** | **+4.3** | **20.8%** | **+9.5** | −67% | −20.7% | 1.7% | 0.9% |
| Deep ITM calls, delta 0.80, 6-month, rolled every 6 weeks (conservative / real-price surface) | 2× | 8.6% / 10.8% | −2.2 / 0.0 | 12.6% / 14.8% | +1.2 / +3.4 | −57% / −51% | −13.5% | 5.2% / 2.9% | 5.1% / 2.8% |
| Same | 3× | 9.4% / 13.0% | −1.4 / +2.2 | 16.4% / 20.1% | +5.1 / +8.7 | −82% / −72% | −22.8% | 7.9% / 4.4% | 3.9% / 2.2% |
| **Deep ITM calls, delta 0.90, 12-month, rolled every 8 weeks** (conservative / real-price) | 2× | 9.7% / 12.0% | −1.2 / +1.2 | 13.6% / 15.9% | +2.2 / +4.6 | −51% / −47% | −14.8% | 4.1% / 1.7% | 4.1% / 1.7% |
| Same (2.7–2.9× achieved: premium capped at 98% of the book) | 3× | 9.4% / **14.7%** | −1.4 / **+3.9** | 14.3% / **20.8%** | +2.9 / **+9.4** | −76% / −62% | −20.1% | 7.7% / 2.5% | 4.5% / 1.3% |
| Call debit spread, delta 0.80 / 0.25, 6-month (conservative / real-price) | 2× | 6.0% / 9.9% | −4.8 / −0.9 | 11.0% / 14.4% | −0.4 / +3.0 | −75% / −57% | −17.6% | 7.7% / 3.6% | 7.8% / 3.6% |
| ATM-call barbell 90/10 (6-month calls, trend-filtered; conservative / real-price) | ≈1.2–1.3× | 6.6% / 7.4% | −4.2 / −3.4 | 8.1% / 9.0% | −3.2 / −2.4 | −28% / −26% | −6.2% | 2.4% / 2.0% | — |
| *3× margin (not allowed under Reg T; reference only)* | 3× | 14.9% | +4.1 | 20.8% | +9.4 | −65% | −22.3% | 2.3% | 1.2% |

Sources: `output/vehicles_main.csv` (all rows, all pricing variants, and 1990–2007 as a third period).

---

## Contents

1. [Setup: the core, the vehicles and the costs](#1-setup-the-core-the-vehicles-and-the-costs)
2. [What leverage costs today (real chains, 28 Sep 2026)](#2-what-leverage-costs-today-real-chains-28-sep-2026)
3. [Is the option model right? Two real-price checks](#3-is-the-option-model-right-two-real-price-checks)
4. [Question 1: which vehicle gives the highest CAGR?](#4-question-1-which-vehicle-gives-the-highest-cagr)
5. [Drawdowns and gap risk](#5-drawdowns-and-gap-risk)
6. [Question 2: is any option setup large and robust?](#6-question-2-is-any-option-setup-large-and-robust)
7. [Question 3: executability with at most one email a week](#7-question-3-executability-with-at-most-one-email-a-week)
8. [Recommendation](#8-recommendation)
9. [Caveats](#9-caveats)
10. [Sources](#10-sources)
11. [Reproducing](#11-reproducing)

---

## 1. Setup: the core, the vehicles and the costs

**The core is the same for every vehicle.** Only the leverage vehicle changes.
- **Signal.** At each Friday close, is the index above its 200-day simple average? The signal is not optimised; it is the rule tracks 04 and 13 already use.
- **Execution.** Trade at the next session's close, so there is at most one email a week, acted on the next day.
- **When the signal is down:** hold T-bills.
- **Indices.** The S&P 500 (SPY/XSP/SPX) is the main case, run 1990–2026, with 2008–2026 and 1990–2007 run separately from scratch. The Nasdaq-100 (QQQ) is run 2001–2026 on the real VXN, and 1990–2026 with a VXN proxy before 2001.
- **Benchmark.** "SPY" is the S&P 500 total return less SPY's 0.0945% fee.

**Vehicles tested** (`engine.py`):

| Vehicle | How it is held | Rebalancing | Costs modelled |
|---|---|---|---|
| **Margin** (taxable only) | Index ETF worth L × equity; the loan costs the Fed funds upper bound plus Robinhood's tier spread | Weekly, only if exposure drifts more than 10% from target | 2 bp per trade. Forced sale if equity falls below 30% of the position (house maintenance) |
| **LETF** | A daily-reset fund returning L × index − (L−1) × (T-bill + 0.40%) − 0.90% fee | None (the fund resets daily) | 2 bp per switch |
| **(a) Deep ITM calls** | Calls at delta 0.70–0.90, 3–12 months, sized so that delta × notional = L × equity; the rest in T-bills | Roll after 4–8 weeks, if exposure drifts ±25% from target, or with < 21 days left | Half-spread 0.4% of premium each way (base) or 0.2% (the real XSP quote); option-implied financing = Treasury + 0.35% |
| **(b) Call debit spread** | Long delta 0.80, short delta 0.25, same 6-month expiry, sized on net delta | As (a) | 0.4% / 1.5% half-spreads (long / short leg) |
| **(c) Barbell** | ATM calls costing 10% or 20% of equity at each roll; the rest in T-bills | Every 6–8 weeks | As (a) |
| **(d) Poor man's covered call (PMCC)** | (a) plus a short 30-day, delta-0.25 call on each long contract, re-sold monthly | Long leg as (a), short leg monthly | As (b) |
| **(e) Account** | IRA: LETFs and long calls only. Taxable: all of them | — | Section 1256 in §7.4 |

**Option prices are modelled, because no free history of option chains exists.** The model is Black–Scholes on track 04's surface:
- the at-the-money level comes from VIX (1 month) and VIX1Y (1 year; regression-filled before 2007), interpolated in total variance;
- the skew is the real SPX smile of 28 Sep 2026;
- for the Nasdaq-100, the smile is shrunk to 48% of the SPX skew and the level is taken from VXN, because the 28 Sep chains show QQQ/NDX skew about half as steep (the 85%-strike, 6-month IV is 1.25× ATM against 1.52× for SPX; `chain_skew_shape_6m.csv`).

Four pricing variants bracket the uncertainty:

| Variant | 1-month ATM / VIX | 1-year ATM / VIX1Y | Skew | Where it comes from |
|---|---|---|---|---|
| base (called **conservative** in the tables) | 0.88 | 0.80 | average of ratio and vol-point shapes | Track 04's main case |
| cheap | 0.80 | 0.74 | ratio | Fitted to the 28 Sep 2026 SPX surface |
| dear | 0.95 | 0.85 | vol points | Track 04's stress case |
| **real-price** | 0.80 | 0.74 | ratio, **flattened to 70%** | Chosen so the model reproduces the real CBOE PPUT index 1990–2026 (7.7% vs 7.6% a year). It also matches today's XSP deep ITM prices (§3). Used with the 0.2% XSP half-spread. The most option-friendly setting |

---

## 2. What leverage costs today (real chains, 28 Sep 2026)

**Financing rates**, per year on the borrowed amount:

| Source of leverage | Rate today | Over the 3-month T-bill (4.08%) | Notes |
|---|---|---|---|
| Robinhood margin, balance under $50k | 5.25% | +1.17 | Fed funds upper bound (4.00%) + 1.25%. Rates "as of 16–17 Sep 2026"; Gold includes the first $1,000 free |
| Robinhood margin, $50k–$100k | 5.05% | +0.97 | Upper bound + 1.05% |
| Robinhood margin, $100k–$1M | 4.75% | +0.67 | Upper bound + 0.75%. A $100k book at 2× borrows $100k and falls here |
| LETF swap financing | T-bill + 0.40%, plus a 0.90% fee on the whole fund | +1.30 per 1× borrowed at 2×; +0.85 at 3× | Track 04's model, validated here against real SSO/UPRO/QLD/TQQQ (§3) |
| Option-implied rate (XSP put-call parity) | 4.7% (3 months), 4.9% (6 months), 5.1% (12 months) | +0.6 over the Treasury curve | `chain_parity_rates.csv`. Paid inside the call's price on the strike you "borrow" |
| **Embedded put in a deep ITM call** | see below | | The part of the call's price above intrinsic value |

**The price of the embedded put** (XSP, 28 Sep 2026 close, `chain_spreads_carry_validation.csv`). By put-call parity, a deep ITM call is the index, plus a loan of the strike, plus a put at the strike. The put is the premium you pay for the floor.

| Call delta | Tenor | Exposure per $ of premium | Time value per year, % of exposure (held to expiry) | Quoted spread, % of premium | Quoted spread, bp of exposure |
|---|---|---|---|---|---|
| 0.60–0.75 | 4–8 months | 9.5× | 7.6% | 0.36% | 4 |
| **0.75–0.85** | **4–8 months** | **6.7×** | **4.0%** | **0.35%** | **5** |
| 0.75–0.85 | 8–15 months | 5.1× | 3.5% | 0.46% | 10 |
| 0.85–0.95 | 4–8 months | 4.7× | 2.1% | 0.30% | 6 |
| 0.85–0.95 | 8–15 months | 3.0× | 1.1% | 0.34% | 11 |
| ATM (0.40–0.60) | 4–8 months | 13.5× | 14.7% | 0.50% | 4 |

- **The embedded put is not all lost.** It pays out in sell-offs. The backtest (§4) measures what was actually lost net of those payouts, including spreads and financing:
  - delta-0.80, 6-month roll: about 2.6% of exposure a year on the conservative surface and 1.4% on the real-price surface;
  - delta-0.90, 12-month roll: 2.0% and 0.8%.
- **XSP quotes are tight:** 0.3–0.5% of premium on deep ITM strikes. But open interest on those strikes is often zero; market makers quote them off SPX.
- **SPY's closing quotes were much wider** on deep ITM strikes: 3–6% of premium, 50–70 bp of exposure. These were after-the-close quotes; intraday quotes are usually tighter. QQQ's were 1–2%.

---

## 3. Is the option model right? Two real-price checks

**Check 1: today's real prices** (`chain_spreads_carry_validation.csv`). For each real XSP/SPY call, the model's implied vol at the same strike and expiry, using the 28 Sep VIX (16.05) and VIX1Y (21.64), minus the market's implied vol:

| Delta bucket | Tenor | base surface: vol points (price) | cheap surface: vol points (price) |
|---|---|---|---|
| 0.75–0.85 (XSP) | 45–120 days | +2.7 (+4.3%) | +1.4 (+2.1%) |
| 0.75–0.85 (XSP) | 121–240 days | +2.7 (+4.2%) | +1.3 (+2.1%) |
| 0.75–0.85 (XSP) | 241–460 days | +1.5 (+2.5%) | 0.0 (0.0%) |
| 0.85–0.95 (XSP) | 121–240 days | +3.3 (+2.3%) | +2.0 (+1.3%) |
| 0.75–0.85 (SPY) | 121–240 days | +2.9 (+2.5%) | +1.6 (+0.5%) |

- The base surface **overprices** today's deep ITM calls by about 1.5–3 vol points. It is conservative.
- The real-price surface keeps the cheap surface's at-the-money level and flattens its smile to 70%. That lowers the 10–15%-out-of-the-money wing (the embedded put) by about 1.3–2 vol points, which about cancels the cheap surface's error on deep ITM calls (`chain_spreads_carry_validation.csv`, column `err_iv_real`).
- Applied to QQQ without shrinking the skew, the SPX smile overprices deep ITM calls by 6–7 vol points. That is why the backtest scales it to 48%.

**Check 2: 36 years of real prices, CBOE PPUT** (`pput_validation.csv`). PPUT holds the S&P 500 plus a monthly 5% OTM put. By put-call parity that is the same as a monthly 95%-strike call plus T-bills, which is exactly the kind of position this track rolls. The engine rebuilt it on each surface:

| Series, 1990–2026 | CAGR | Max drawdown | Monthly correlation with real PPUT |
|---|---|---|---|
| **CBOE PPUT (real prices)** | **7.6%** | −42% | 1 |
| Model replica, base surface, no spread | 5.2% | −57% | 0.95 |
| Model replica, cheap surface, no spread | 6.5% | −53% | 0.95 |
| Model replica, real-price surface (70% smile), no spread | 7.7% | −47% | 0.95 |
| Model replica, real-price surface, 0.4% half-spread | 7.1% | −49% | 0.95 |
| S&P 500 total return | 10.9% | −55% | n/a |

- **The model is too pessimistic about bought puts.** The base surface makes the monthly put overlay cost 5.7 points a year; the real index cost 3.3.
- That is why the report shows the **real-price** surface next to base. It is fitted to this check, so it is the most favourable plausible case for options, not an independent test.
- The two checks agree: the model's put wing was about 1.3 vol points too expensive, both on average since 1990 and on 28 Sep 2026.
- **A uniform 1.35-point cut would also reproduce PPUT, but it is wrong at the money.** It would put 1-month ATM implied vol below realised vol on average (14.2% against 15.3%). That contradicts 36 years of evidence that index options are overpriced at the money (track 04 §3). It would also flatter the ATM barbells: in a trial run it turned their cost of leverage negative. Flattening the smile fixes the wing and leaves the ATM level alone.
- The model also shows deeper drawdowns than real PPUT (−53% to −57% against −42%). Its puts paid less in crashes than real puts did. That also biases the model against options, so the real-price row is the fairer one for drawdowns too.

**Check 3: the LETF model** (`letf_actual_check.csv`). The same weekly filter, applied to the real funds' adjusted prices, against the simulated fund over the same dates:

| Fund | From | Simulated CAGR | Real CAGR | Simulated / real max drawdown | Daily correlation |
|---|---|---|---|---|---|
| SSO (2× S&P) | Jul 2006 | 14.0% | 13.8% | −40% / −40% | 0.997 |
| UPRO (3× S&P) | Jul 2009 | 23.7% | 23.4% | −56% / −56% | 0.997 |
| QLD (2× Nasdaq-100) | Jul 2006 | 19.6% | 19.9% | −54% / −54% | 0.997 |
| TQQQ (3× Nasdaq-100) | Mar 2010 | 24.8% | 25.6% | −70% / −70% | 0.999 |

---

## 4. Question 1: which vehicle gives the highest CAGR?

**Answer: LETFs, which the best option setup can at most tie.**
- **On the conservative surface** the ranking is LETF, then margin (2× only), then every option vehicle, in all three periods and on both indices.
- **On the real-price surface** the delta-0.90, 12-month calls land within about a point of the LETF: from 1.0 point behind to 0.5 ahead on the S&P 500, and 0.2–1.9 points ahead on the Nasdaq-100. The Nasdaq-100 option prices are the least validated here: their smile is the SPX calibration scaled by one day's chain. Every other option version still trails.
- **No vehicle beats the LETF by a margin that would survive the pricing uncertainty.**

### 4.1 S&P 500 core

The key table above has the main rows. The full picture, including the third period:

| Vehicle | Leverage | 1990–2026 | 2008–2026 | 1990–2007 | Max drawdown 1990–2026 |
|---|---|---|---|---|---|
| SPY, buy and hold | 1× | 10.8% | 11.4% | 10.3% | −55% |
| Trend 1× | 1× | 8.6% | 9.4% | 7.7% | −21% |
| Trend, Robinhood margin ($100k tier / under $50k) | 2× | 12.0% / 11.6% | 15.1% / 14.7% | 8.8% / 8.5% | −45% |
| Trend, LETF | 2× | 12.2% | 15.4% | 9.0% | −46% |
| Trend, LETF | 3× | 15.1% | 20.8% | 9.5% | −67% |
| 3× LETF, buy and hold (no filter) | 3× | 15.3% | 17.8% | 13.5% | **−98%** |
| Trend, deep ITM calls δ0.80 6m (conservative / real-price) | 2× | 8.6% / 10.8% | 12.6% / 14.8% | 4.6% / 6.8% | −57% / −51% |
| Same | 3× | 9.4% / 13.0% | 16.4% / 20.1% | 2.6% / 6.1% | −82% / −72% |
| Trend, deep ITM calls δ0.90 12m (conservative / real-price) | 2× | 9.7% / 12.0% | 13.6% / 15.9% | 5.8% / 8.0% | −51% / −47% |
| Same (2.7–2.9× achieved: the premium is capped at 98% of the book) | 3× | 9.4% / 14.7% | 14.3% / 20.8% | 4.6% / 8.7% | −76% / −62% |

**Why options do not win.**
- **The embedded put is the most overpriced part of the index surface.** A deep ITM call contains a put 10–25% out of the money. Its implied vol is 20–27% when realised vol is usually 12–16% (track 04 §3: implied beat realised on 86% of days). Holding the call means paying that premium continuously.
- **Rolling pays the spread again and again.** At 2× the book holds 30–65% of equity in premium, rolled 7–9 times a year.
- **The measured cost applies to all the exposure.**
  - Delta-0.80 6-month roll: about 2.6% of exposure a year (conservative) or 1.4% (real-price).
  - Delta-0.90 12-month roll: 2.0% or 0.8%.
  - Margin and LETF costs apply only to the borrowed part: about 1.3% a year per 1× borrowed, 0.9% at 3×.
- **Buy time and depth.** The deeper and longer the call, the smaller the embedded put per unit of exposure and the fewer the rolls. That is why the delta-0.90, 12-month version is the only one that ties the LETF, and only on calibrated prices.
- **The floor does not pay for itself.** Its benefit (§5) is real in a gap, but the trend filter already cuts most of the exposure in slow bear markets. So the floor mostly insures against what the filter already handles.

**The calls grid** (`calls_grid.csv`: delta 0.70/0.80/0.90 × 3/6/12 months × rolls at 4 or 8 weeks × 2×/3×, on the conservative and real-price surfaces, both periods):
- **Longer and deeper is always better.** In every period and on both surfaces, the 12-month calls held 8 weeks were the best configurations, and the 3-month calls the worst. This is "buy time" again (track 04 §3.4).
- **Best of the 18 configurations, chosen with hindsight**, against the 3× LETF (15.1% for 1990–2026, 20.8% for 2008–2026):

  | | Conservative, 2× | Conservative, 3× | Real-price, 2× | Real-price, 3× |
  |---|---|---|---|---|
  | 1990–2026 | 9.7% (δ0.80, 12m) | 11.4% (δ0.80, 12m) | 12.0% (δ0.90, 12m) | 14.7% (δ0.90, 12m) |
  | 2008–2026 | 14.3% (δ0.70, 12m) | 19.0% (δ0.70, 12m) | 15.9% (δ0.90, 12m) | 21.7% (δ0.80, 12m) |
  | Worst of 18, 1990–2026 | 4.7% (δ0.70, 3m) | 3.8% (δ0.70, 3m) | 7.8% (δ0.70, 3m) | 8.4% (δ0.70, 3m) |

- **Even picked with hindsight, the best option configuration only ties the LETF.**

### 4.2 Nasdaq-100 core (QQQ)

The filter is the Nasdaq-100's own 200-day average. "vs SPY" is the gap to S&P buy and hold over the same years.

| Vehicle | Leverage | 2001–2026 | vs SPY | 2008–2026 | vs SPY | 1990–2026 (VXN proxy before 2001) | vs SPY | Max drawdown 2001–2026 / 1990–2026 | Worst day |
|---|---|---|---|---|---|---|---|---|---|
| QQQ, buy and hold | 1× | 10.6% | +1.8 | 16.1% | +4.8 | 14.8% | +4.0 | −69% / −83% | −12.2% |
| Trend 1× | 1× | 10.2% | +1.3 | 12.0% | +0.6 | 13.4% | +2.5 | −32% / −43% | −12.2% |
| Trend, margin ($100k tier) | 2× | 15.2% | +6.4 | 18.8% | +7.5 | 19.4% | +8.6 | −55% / −73% | −26.5% |
| Trend, LETF (QLD) | 2× | 15.4% | +6.5 | 19.4% | +8.1 | 19.7% | +8.8 | −54% / −75% | −24.4% |
| **Trend, LETF (TQQQ)** | 3× | **18.5%** | **+9.6** | **24.6%** | **+13.3** | **22.5%** | **+11.7** | **−70% / −90%** | **−36.6%** |
| TQQQ-style, buy and hold | 3× | 7.6% | −1.3 | 29.1% | +17.7 | 14.9% | +4.1 | −99.6% / −100% | −36.6% |
| Trend, deep ITM calls δ0.80 6m (conservative / real-price) | 2× | 12.5% / 15.1% | +3.6 / +6.2 | 17.8% / 20.6% | +6.4 / +9.3 | 16.6% / 19.6% | +5.8 / +8.8 | −54% / −79% | −11.3% |
| Same | 3× | 14.6% / 18.6% | +5.8 / +9.7 | 22.4% / 26.9% | +11.0 / +15.6 | 18.0% / 22.7% | +7.2 / +11.9 | −73% / −94% | −16.9% |
| Trend, deep ITM calls δ0.90 12m (conservative / real-price) | 2× | 13.5% / 15.8% | +4.6 / +6.9 | 18.1% / 20.6% | +6.7 / +9.2 | 17.4% / 19.9% | +6.6 / +9.1 | −54% / −75% | −14.8% |
| Same | ≈2.9× | 14.5% / **19.1%** | +5.6 / **+10.2** | 22.0% / **26.5%** | +10.6 / **+15.2** | 17.0% / **23.0%** | +6.2 / **+12.2** | −69% / −88% | −26.1% |

- The same ranking holds: LETF ≈ margin at 2×, LETF best at 3×, calls last.
- The Nasdaq-100 results are much larger because the index itself beat the S&P by 1.8–4.8 points a year in these samples. That was the tech era; it is not a property of the vehicle.
- The 1990–2026 run includes 2000–2003: the trend-filtered 3× book fell **90%** from March 2000 to March 2003, whipsawed by the filter.

---

## 5. Drawdowns and gap risk

**What the weekly filter did in October 1987** (`gap_1987_signal.csv`):

| Friday close | S&P 500 | 200-day average | Signal | What happens |
|---|---|---|---|---|
| 9 Oct 1987 | 311.07 | 297.35 | **Up** (+4.6%) | Stay invested |
| 16 Oct 1987 | 282.70 | 298.78 | **Down** (−5.4%) | Sell at the next session's close… |
| 19 Oct 1987 (Black Monday) | 224.84 (−20.5%) | | | …which is after the crash |

- **A weekly-decided book takes the whole of a 1987-style day.** The signal turned only at the Friday close, and the sale lands at Monday's close.
- A daily check would have exited on Friday 16 October: the index was already 0.2% below its average at Thursday's close.
- **The same pattern recurred in March 2020.** The Nasdaq-100 trend 3× book's three worst days were 9, 12 and 16 March 2020 (−21%, −28% and −37%). 16 March 2020 was the execution day of the "down" signal from Friday 13 March.

**One-day index gaps applied to today's positions** (`gap_shock.csv`; model prices, 25 Sep 2026 surface; change in the whole book):

| Shock | Margin 2× | LETF 2× | Calls δ0.80 6m, 2× | LETF 3× | Calls δ0.80 6m, 3× | Calls δ0.90 12m, 3× | Calls δ0.70 6m, 3× | Barbell 90/10 |
|---|---|---|---|---|---|---|---|---|
| −20.5% day (1987); VIX to 80, VIX1Y to 45 | −41% (no margin call) | −41% | −23% | **−62%** | **−34%** | −43% | −25% | −4% |
| −20.5% day, implied vols unchanged | −41% | −41% | −33% | −62% | −49% | −62% | −39% | −10% |
| −30% day; VIX to 100, VIX1Y to 50 | −60% (margin call) | −60% | −27% | −90% | −40% | −65% | −29% | −7% |
| −12% day (16 Mar 2020); VIX to 80, VIX1Y to 40 | −24% | −24% | −12% | −36% | −18% | −22% | −14% | −2% |

- **This is the options' one real advantage, and it depends on the strike.**
  - At 3×, a 1987 day costs about 34% of the book with delta-0.80 calls, against 62% with a 3× LETF: the calls' delta collapses and their vega rises in the crash.
  - The delta-0.90 12-month calls have their strike at 74% of spot, so their protection comes mostly from the jump in implied vol: −43% if vol spikes, −62% (the same as the LETF) if it does not, and −65% against −90% on a −30% day.
- **What the advantage costs** is the gap between the LETF and call CAGRs at 3× (key table):
  - 5–6 points a year on the conservative surface;
  - 0.4 points (delta-0.90, 12-month) to 2 points (delta-0.80, 6-month) on the real-price surface.
- **Over whole bear markets the floor helped little.** On the conservative surface the S&P 3× call book fell 82% (July 1998 to November 2011), against 67% for the 3× LETF (July 1998 to March 2003): the steady cost compounds through years of whipsaws. On the real-price surface the delta-0.90 calls fell 62%, a little less than the LETF.
- **Margin at 2× survives a −20.5% day at Robinhood's likely maintenance levels:** equity falls to 37% of the position, against a 25–30% requirement. At −30% it triggers a call. 3× margin is not available under Reg T in any case.

---

## 6. Question 2: is any option setup large and robust?

**No option-specific edge exists.** The only option setups that come near +5 points a year are 3× trend books, and they only pass on the trend core's return:
- The best one, delta-0.90 12-month calls on calibrated prices, has a 10-year bootstrap median excess of +4.8 points, against +5.5 for the 3× LETF.
- On conservative prices it drops to −0.8.
- Neither is robust: both trailed SPY in 1990–2007.

The distributions below compare each setup's CAGR with SPY's over the same window.

**Rolling windows, S&P 500 core, 1990–2026** (`dist_rolling.csv`; monthly steps, overlapping windows; "≥ +5" is the share of windows beating SPY by at least 5 points a year):

| Strategy | 5 years: p5 / median / p95 | ≥ +5 | < 0 | 10 years: p5 / median / p95 | ≥ +5 | < 0 |
|---|---|---|---|---|---|---|
| Trend 2×, margin | −4.8 / +2.0 / +9.8 | 29% | 35% | −3.0 / +1.4 / +5.5 | 7% | 35% |
| Trend 2×, LETF | −4.6 / +1.8 / +10.4 | 29% | 34% | −2.8 / +1.5 / +5.7 | 11% | 33% |
| **Trend 3×, LETF** | −7.5 / **+4.8** / +24.5 | **49%** | 34% | −3.9 / **+3.8** / +13.9 | **43%** | 26% |
| 3× LETF, buy and hold | −22.5 / +10.2 / +35.5 | 59% | 35% | −20.2 / 0.0 / +21.5 | 40% | 50% |
| Trend 2×, calls δ0.80 6m (conservative) | −8.5 / −1.5 / +8.1 | 15% | 62% | −6.5 / −2.1 / +2.8 | 0% | 68% |
| Trend 3×, calls δ0.80 6m (conservative) | −13.3 / −0.9 / +20.0 | 32% | 52% | −9.5 / −1.8 / +9.4 | 16% | 62% |
| Trend 3×, calls δ0.80 6m (real-price) | −9.5 / +2.6 / +23.9 | 42% | 40% | −6.7 / +1.9 / +13.2 | 31% | 35% |
| Trend 3×, calls δ0.90 12m (conservative) | −11.2 / −1.8 / +15.4 | 28% | 57% | −9.7 / −1.6 / +6.5 | 9% | 61% |
| **Trend 3×, calls δ0.90 12m (real-price)** | −6.8 / +3.5 / +24.3 | 46% | 35% | −4.5 / +3.4 / +13.9 | 42% | 28% |
| Trend 2×, call debit spread | −14.9 / −3.4 / +5.9 | 8% | 68% | −9.7 / −5.0 / +2.3 | 0% | 86% |
| Barbell 90/10, trend-filtered | −9.6 / −3.4 / +1.1 | 0% | 83% | −7.1 / −3.8 / +0.4 | 0% | 91% |
| Barbell 80/20, 12-month ATM calls, no filter | −9.6 / +1.5 / +12.7 | 29% | 44% | −6.6 / −0.3 / +6.9 | 21% | 60% |
| *Nasdaq-100: trend 3× LETF (windows from 2006)* | −7.0 / +6.3 / +29.9 | 55% | 28% | −2.9 / +6.8 / +19.7 | 61% | 18% |

**Block bootstrap, 10-year paths** (`dist_bootstrap.csv`). This draws 10,000 ten-year histories from 12-month blocks of the 1990–2026 monthly returns. The blocks are drawn jointly for all strategies, so every strategy sees the same resampled market.

| Strategy | Median CAGR | Excess vs SPY: p5 / median / p95 | P(excess ≥ +5) | P(excess < 0) | P(10-year loss) | Median max drawdown | P(drawdown worse than −50%) |
|---|---|---|---|---|---|---|---|
| SPY, buy and hold | 11.4% | — | — | — | 2.5% | −26% | 6% |
| Trend 2×, margin | 12.8% | −6.4 / +1.7 / +11.0 | 27% | 37% | 2.7% | −33% | 6% |
| Trend 2×, LETF | 13.0% | −6.3 / +1.9 / +11.5 | 29% | 36% | 2.9% | −33% | 6% |
| **Trend 3×, LETF** | **16.4%** | −7.8 / **+5.5** / +21.6 | **52%** | **26%** | 5.9% | −47% | **41%** |
| 3× LETF, buy and hold | 17.6% | −16.0 / +6.1 / +28.6 | 53% | 33% | 18.3% | −69% | 84% |
| Trend 2×, calls δ0.80 6m (conservative) | 9.4% | −10.0 / −1.7 / +8.1 | 13% | 61% | 8.5% | −36% | 12% |
| Trend 3×, calls δ0.80 6m (conservative) | 10.8% | −13.2 / −0.2 / +15.8 | 28% | 51% | 14.5% | −52% | 57% |
| Trend 3×, calls δ0.90 12m (conservative) | 10.2% | −12.2 / −0.8 / +13.1 | 23% | 54% | 12.7% | −45% | 36% |
| Trend 3×, calls δ0.80 6m (real-price) | 14.4% | −9.3 / +3.4 / +19.3 | 42% | 34% | 8.0% | −47% | 42% |
| Trend 2×, calls δ0.90 12m (real-price) | 12.8% | −6.2 / +1.7 / +10.9 | 27% | 37% | 2.7% | −31% | 5% |
| **Trend 3×, calls δ0.90 12m (real-price)** | **15.8%** | −7.4 / **+4.8** / +19.8 | **49%** | **27%** | 5.3% | −44% | **31%** |
| Trend 2×, call debit spread | 7.1% | −13.5 / −4.0 / +6.6 | 8% | 73% | 16.8% | −44% | 32% |
| Barbell 90/10, trend-filtered | 6.8% | −10.2 / −4.4 / +3.2 | 2% | 84% | 3.4% | −18% | 0% |
| Barbell 80/20, 12-month ATM, no filter | 11.5% | −5.4 / +0.1 / +6.8 | 11% | 48% | 7.8% | −39% | 22% |

**What the distributions say.**
- **On conservative prices, option setups are lottery-like.** 3× calls have a right tail (p95 +13 to +16 points), but their median excess is about zero or negative. They have a 51–62% chance of trailing SPY over 10 years and a 36–57% chance of a drawdown worse than −50%.
- **On calibrated prices, delta-0.90 12-month calls behave like the 3× LETF.** Bootstrap median excess +4.8 against +5.5; P(≥ +5) 49% against 52%; P(< 0) 27% against 26%. The chance of a drawdown worse than −50% is lower, 31% against 41%: that is the floor at work. Shorter, shallower calls stay 1–2 points behind.
- **Their good years are the trend core's good years.**
  - 2008–2026: 3× calls beat SPY by 5.1 points a year on the conservative surface and 8.7–9.4 on the real-price surface.
  - 1990–2007: they trailed it by 7.8 points, and by 1.7–4.3 points on the real-price surface.
  - The 3× LETF did the same, at +9.5 and −0.8. That is a regime bet on the trend core, not an option edge.
- **The 90/10 barbell is safe and slow.** It never lost more than 28%, but it trailed SPY in 91% of 10-year windows: 10% of the book in ATM calls buys only about 1.2× exposure while invested, and the call premium eats the rest.
- **Call debit spreads** give up the right tail that the whole strategy depends on and still pay the put skew. They were the worst option variant.
- **PMCC results depend entirely on the assumed price of 1-month calls.** They range from −6.4 to +1.0 points across the pricing variants (`vehicles_main.csv`). Real-price evidence says selling short-dated index calls has not paid: the BXM buy-write trailed the S&P by 3.9 points a year (track 04 §5), and track 14 found no premium in index option selling after 2008. It also needs about 24 emails a year. Rejected.
- **Nothing in the option family beats the trend 3× LETF**, and the LETF itself reaches +5 points only half the time. The PMCC's apparent strength on the real-price surface (+1.0 points over 1990–2026) comes from short calls priced off a call wing that no real-price check covers; the flattened smile makes OTM calls dearer, which flatters the seller.

---

## 7. Question 3: executability with at most one email a week

### 7.1 Orders and emails

| Vehicle | Emails a year (weeks with an action) | Orders a year | Orders per action |
|---|---|---|---|
| Trend LETF (2× or 3×) | 3.4 | 3.4 | 1 (buy or sell the fund) |
| Trend margin 2× | 4.2 | 4.2 | 1 (buy, sell or top up) |
| Deep ITM calls, 6-week roll | 9.1 | 14.7 | **2 per roll**: sell to close, buy to open. 1 on entry and exit |
| Deep ITM calls δ0.90 12m, 8-week roll | 7.5 | 11.6 | 2 per roll |
| Call debit spread | 9.3 | 30 | 2 two-leg spread orders per roll |
| PMCC | 24 | 53 | Up to 3 per email |

- **Robinhood's "roll" button makes a roll one two-leg order, but not in a cash account.** Robinhood says "You cannot roll options if you have a cash account." The IRA's status is not stated, so in the IRA a roll is two separate orders: sell first, then buy **[verify in app]**. In the taxable margin account a roll is one two-leg limit order.
- Every vehicle fits "at most one recommendation a week": the engine acts at most once a week by construction.

### 7.2 The IRA's Level 2 limits

- **Robinhood Retirement allows Level 2 only:** long calls and puts, covered calls, cash-secured puts. **No spreads, and no PMCC** (the short call is covered by a long call, which is a spread), **and no margin.**
- **In the IRA, leverage can only come from LETFs or long calls.** LETFs are the cheaper of the two by 1–4 points a year (§4).
- **XSP in the IRA is not confirmed.** Robinhood lists SPX, XSP, NDX, RUT and VIX options, but its retirement page does not say whether index options are enabled there **[verify in app]**. SPY and QQQ calls work at Level 2.
- **Robinhood auto-closes at-risk expiring equity and ETF options from 3:30 PM ET on expiry day** (track 20). The roll rules here never hold a call into its last 21 days.

### 7.3 Whole-contract sizing

Contracts from the 28 Sep chains (`sizing_contracts.csv`). "Step" is how much exposure one contract adds, as a multiple of the book.

| Contract (one contract) | Exposure | Premium | $20k book | $50k | $100k | $250k |
|---|---|---|---|---|---|---|
| XSP Apr-2027 697 call (δ0.80, 6 months) | $61.5k | $9.8k | 1 contract = **3.1×** (step 3.1×) | 2 = 2.5× (step 1.2×) | 3 = 1.8× or 5 = 3.1× (step 0.6×) | 8 = 2.0×, 12 = 2.95× (step 0.25×) |
| SPY Mar-2027 700 call (δ0.80) | $61.0k | $9.2k | 1 = 3.1× | 2 = 2.4× | 3 = 1.8×, 5 = 3.1× | 8 = 1.95×, 12 = 2.9× |
| QQQ Mar-2027 655 call (δ0.80) | $59.2k | $11.1k | 1 = 3.0× | 2 = 2.4×, 3 = 3.6× | 3 = 1.8×, 5 = 3.0× | 8 = 1.9×, 13 = 3.1× |
| XSP Sep-2027 585 call (δ0.90, 12 months) | $69.2k | $21.3k | **Unaffordable** (the premium exceeds the book) | 1 = 1.4×, 2 = 2.8× (85% of the book in premium) | 3 = 2.1×, 4 = 2.8× | 7 = 1.9×, 11 = 3.0× |
| XSP Mar-2027 785 call (ATM, 6 months) | $38.4k | $2.9k | 1 = 1.9×, 2 = 3.8× | 3 = 2.3×, 4 = 3.1× | 5 = 1.9×, 8 = 3.1× | 13 = 2.0×, 20 = 3.1× |

- **Below about $100k, whole contracts make leverage lumpy.** At $20k the only choices are about 0×, 1.9× (one ATM call) or 3.1× (one deep ITM call). At $100k the step is 0.6× of the book.
- **LETFs have no such problem:** SSO trades near $71 and UPRO near $152, and Robinhood sells fractional shares (fractional orders in the IRA: **[verify in app]**, as in track 20).
- **SPX is far too large** for these books: one contract is $770k of notional. NDX is worse, at $3M.

### 7.4 Taxes: Section 1256 for XSP in the taxable account

- **XSP options are Section 1256 contracts.** Gains are taxed 60% long-term and 40% short-term regardless of holding period, marked to market at 31 December, reported on Form 6781.
- At the top federal bracket that is **26.8%** (+3.8% NIIT = 30.6%), against **37%** (+3.8% = 40.8%) for SPY or QQQ options held under a year. The wash-sale rule does not apply, and net 1256 losses can be carried back 3 years against 1256 gains (IRC §1212(c)).
- In the IRA none of this matters.

**After-tax CAGR in the taxable account** (`tax_after.csv`; 1990–2026, top federal bracket, each year's net gain taxed with losses carried forward):
- ETF trend books use a 33.6% blend: 42% of trend-spell gains came in spells longer than a year.
- Buy-and-hold SPY is taxed once, at the end.

| Strategy, taxable account | Tax treatment | Pre-tax CAGR | After-tax CAGR |
|---|---|---|---|
| Trend 2×, calls δ0.80 on XSP | Section 1256 (30.6%) | 8.5% | 6.1% |
| Same on SPY options | Short-term (40.8%) | 8.5% | 5.2% |
| Trend 3×, calls δ0.80 on XSP | Section 1256 | 9.4% | 6.8% |
| Trend 2×, calls δ0.90 12m on XSP (real-price) | Section 1256 | 11.9% | 8.5% |
| Trend 3×, calls δ0.90 12m on XSP (real-price) | Section 1256 | 14.6% | **10.6%** |
| Same on SPY options | Short-term (40.8%) | 14.6% | 9.1% |
| Trend 2×, margin | ETF spells (33.6%) | 11.9% | 8.1% |
| Trend 2×, LETF | ETF spells | 12.1% | 8.3% |
| Trend 3×, LETF | ETF spells | 15.0% | **10.4%** |
| SPY, buy and hold | Long-term, deferred to the end (23.8%) | 10.8% | **10.0%** |

- **XSP's Section 1256 status is worth 0.8–1.4 points a year** over SPY options for the same strategy. It lets the delta-0.90 XSP book finish level with the 3× LETF after tax (10.6% against 10.4%).
- **The bigger point is where the core lives.** In a taxable account, switching in and out of the market gives back most of the edge: after tax, the 3× LETF book beats buy-and-hold SPY by only 0.4 points a year. **The leveraged trend core belongs in the IRA.**

---

## 8. Recommendation

**Vehicle: index LETFs in the IRA.** Hold SSO or UPRO (S&P 500), or QLD or TQQQ (Nasdaq-100), while the index is above its 200-day average at the Friday close, and T-bills (or a T-bill ETF) otherwise.
- It is the cheapest leverage the IRA can hold: 1.3% a year per unit of extra exposure at 2× and 0.9% at 3×.
- It needs one order per signal change, about 3–4 emails a year.
- It sizes to the dollar at any book size.
- Its simulation matches the real funds (§3).

**Leverage level is the owner's call, and this is the honest price list** (S&P 500 core; the Nasdaq-100 figures are larger but ride one era):

| Choice | Median 10-year excess vs SPY (bootstrap) | Chance of beating SPY by ≥ 5 points | Chance of trailing SPY | Typical worst drawdown | 1987-style day |
|---|---|---|---|---|---|
| 2× LETF | +1.9 | 29% | 36% | −33% median; −46% seen | −41% |
| 3× LETF | +5.5 | 52% | 26% | −47% median; −67% seen (−90% on the Nasdaq-100, 2000–03) | −62% |

**The option alternative, if the owner wants the gap floor.**
- **What:** delta-0.90 XSP calls about 12 months out, rolled every 8 weeks while the filter is up. Put them in the **taxable** account, where Section 1256 applies, and only for books of **$100k or more**. At $100k the contract step is 0.7× of the book; below that, sizing is too lumpy.
- **Cost:** about the same as the LETF on calibrated prices (1.3% a year per unit of extra exposure at 3×), and up to 5 points a year worse on conservative prices. **That model uncertainty is the main reason the LETF stays first.**
- **What it buys:** a 1987-style day costs about 43% of the book at 3× instead of 62%, if implied vol jumps as it did in past crashes. On a −30% day the loss is 65% instead of 90%. The floor is weaker than the delta-0.80 version's.
- **What it costs in effort:** 2 orders per roll (one two-leg "roll" order in the taxable margin account) and about 8 emails a year.
- **What to check first:** during paper trading, log each fill against the model price, as track 04's checklist asks. If fills track the real-price surface, the vehicle is a genuine alternative; if they track the conservative one, drop it.

**What not to do.**
- Do not use shorter or shallower calls (for example delta 0.80, 6 months), call spreads, PMCCs or ATM barbells as the leverage engine. They cost 1–5 points a year more than LETFs at the same exposure, need 2–3 times the emails, and are lumpy below $100k. The PMCC's result depends on a call-wing price the model cannot validate.
- Use margin only in the taxable account and only at 2× (Reg T allows no more). The taxable account forfeits most of the trend edge to tax (§7.4).
- XSP calls remain the right tool for defined-risk tactical trades in the taxable account (Section 1256, European, cash-settled), such as the existing M4 crash call spread.

**A cheaper fix for the gap problem is worth testing next:** a standing good-till-cancelled sell-stop on the LETF, placed in each weekly email at the price where the index would cross its 200-day average. It turns the weekly filter into a daily one without extra emails. Not tested here.

---

## 9. Caveats

- **Option prices are modelled.** The surface is Black–Scholes on VIX/VIX1Y with today's SPX smile.
  - It is validated against one day of real chains and one real-price index (PPUT, 1-month puts). Both showed it too pessimistic, by about 1.3 vol points. The real-price variant corrects that by construction, so it is not an independent test.
  - VIX1Y before 2007 is regression-filled.
  - The real-price surface keeps the cheap surface's ATM level, 0.80 × VIX. That is about equal to realised vol on average (15.5% against 15.3%), which is generous to option buyers: the literature puts the ATM premium at 2–3 vol points.
  - Its flattened smile is checked only on the put wing. It probably makes OTM *calls* too dear, which flatters the short legs of spreads and PMCCs.
  - Today's steep skew is applied to all history. Skew was flatter before about 1998, which penalises options in the early 1990s.
- **The Nasdaq-100 option runs** shrink the SPX smile to 48% (from one day's chains) and use a VXN proxy before 2001.
- **The samples are not independent.**
  - 2008–2026 was one of the best periods on record for leveraged US equity. 1990–2007 shows the other side: trend 3× LETF −0.8 points a year against SPY.
  - The bootstrap resamples 12-month blocks of one 36-year history. It cannot create regimes that history does not contain, such as a 1929–32 or a Japanese-style lost decade. Track 04's 1928–2026 simulation found 3× buy and hold lost 99.9% in 1929–32; the 200-day rule still lost 92%.
- **The trend rule is fixed** (200-day, weekly, next-session execution) and not optimised. Other signals are other tracks' work. A daily check would have avoided Black Monday but not every gap.
- **Robinhood's margin formula** (Fed upper bound + tier spread) is back-cast to 1990 as a hypothetical broker. Maintenance calls are checked only on closes. House requirements rise in stress and are not modelled.
- **Financing assumptions.** LETF financing (T-bill + 0.40%) and fees (0.90%) are the funds' long-run averages; swap spreads widen in stress. The option-implied rate (Treasury + 0.35% in the model) was about +0.6% on 28 Sep.
- **Taxes** are a stylised top-bracket federal calculation. State tax and the actual lot structure are ignored.
- **Fees.** Commissions and per-contract fees (index options: $0.35 Gold or $0.50 non-Gold per contract, plus exchange fees) are ignored. They are below 0.01% of a deep ITM XSP premium.

---

## 10. Sources

**Broker terms (retrieved 29 Sep 2026)**
- Robinhood, "Margin rates", support article (rates as of 17 Sep 2026): https://robinhood.com/us/en/support/articles/margin-rates/
- Robinhood Financial fee schedule, PDF (rates as of 16 Sep 2026; index-option contract fees): https://cdn.robinhood.com/assets/robinhood/legal/RHF+Fee+Schedule.pdf
- Robinhood, "Options in Robinhood Retirement" (Level 2 only; no spreads): https://robinhood.com/us/en/support/articles/options-in-retirement/
- Robinhood, "Options rolling" (single roll order; not in cash accounts): https://robinhood.com/us/en/support/articles/options-rolling
- Robinhood, "Index options" and "What are XSP options?": https://robinhood.com/us/en/support/articles/index-options/, https://robinhood.com/us/en/learn/articles/what-are-xsp-options/

**Market data**
- CBOE delayed option quotes for XSP, SPY, QQQ, SPX and NDX at the 28 Sep 2026 close, fetched with `traderec.data.providers.LiveProvider(cfg).option_chain(...)`.
- CBOE VIX, VIX1Y and PPUT histories.
- FRED: DTB3, DGS1, DFEDTAR, DFEDTARU.
- Yahoo Finance: ^GSPC, ^SP500TR, ^NDX, ^VXN, SSO, UPRO, QLD, TQQQ.

**Tax and research**
- Tax: IRC §1256 (60/40, mark-to-market), §1212(c) (loss carryback), IRS Form 6781.
- Research: track 04 (surface, VRP, LETF model, PPUT/BXM), track 14 (option selling after 2008), track 20 (Robinhood executability). Frazzini & Pedersen (2012), "Embedded Leverage", NBER w18558: buyers overpay for embedded leverage in options and LETFs. Cheng & Madhavan (2009) on LETF path dependence.

## 11. Reproducing

`cd research/code/30-options-leverage && python run_all.py`. Add `--fetch` to re-pull live chains; a new day's chains change the §2–3 tables.

| Script | What it does |
|---|---|
| `common30.py` | Panel (S&P, NDX, VIX, VIX1Y, VXN, rates, Fed upper bound), cost constants, fast Black–Scholes, pricing variants |
| `engine.py` | The weekly-decided daily simulation for every vehicle, and the cost-of-leverage measure |
| `s01_chain_check.py` | Real chains: parity rates, spreads, carry, model validation, skew shape |
| `s02_vehicles.py` | Question 1 tables, the calls grid, the PPUT check |
| `s03_distribution_gap_sizing.py` | Question 2 distributions, gap shocks, 1987 signal, sizing, tax, LETF check |

Data comes from the track-04 cache (`TRACK04_DATA`) and the chains from `TRACK30_CHAINS`. Both default to the session scratchpad. Runtime is about 10 minutes on 4 cores.
