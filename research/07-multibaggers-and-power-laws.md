# 07: What 10x–100x winners look like, and how power laws shape returns (stocks, crypto, private markets)

*Research track 07. Data pulled 2026-09-28. Code: `research/code/07-multibaggers/`. Raw data is cached in the session scratchpad, not in the repo.*

---

## TL;DR

- **Stock returns follow a power law.** Bessembinder (2018) covers 25,967 US stocks from 1926 to 2016. Over their lifetimes, 57% did worse than 1-month T-bills, and the most common lifetime outcome was about −100%. The best 4% of stocks created all of the market's net wealth. Across 64,000 global stocks from 1990 to 2020, just 2.4% of firms created all of it (Bessembinder et al. 2023). The index makes money because it owns the few big winners. A typical single stock does not.
- **10-baggers are rare, and our estimate is still flattering.** We tested US-domiciled stocks that are still listed today, in 17 cohorts formed each June from 2005 to 2021. Only **0.59%** rose 10x or more within 5 years (0.38% among liquid names).
  - Dividing by *all* stocks listed at the time gives a lower bound of **≈0.27%**. The true 5-year rate is probably about 0.3–0.4%.
  - Over 10 years the rate is 4.0% among survivors (lower bound 1.6%).
  - Even among survivors, 33% lost money over 5 years and 63% trailed SPY.
  - Half of all 10-baggers came from just 3 of the 17 cohorts: those formed right after the 2009, 2016 and 2020 lows. Those cohorts had a 1.55% rate versus 0.37% for the rest.
- **What makes a 10x more likely is mostly what makes a lottery ticket.** Higher 10x odds go with a low share price, small market cap, a price far below the 52-week high, high volatility, losses or negative free cash flow, very fast revenue growth, and heavy dilution. A model using only price data does predict 10x outcomes out-of-sample: AUC 0.75, and its top decile is 2.8x the base rate. **But that top decile was a poor portfolio.** Its median 5-year outcome was 0.45x, 37% of names lost at least 80%, and its mean (1.54x) was *below* the universe mean (1.66x). Predicting jackpots is not the same as making money, which matches Conrad-Kapadia-Xing (2014) and Bali-Cakici-Whitelaw (2011).
- **One trait improved both the 10x odds and the average outcome: a cheap price-to-sales ratio.** The cheapest P/S quintile had a 1.39% 10x rate (versus 0.62%), a mean of 2.16x (versus 1.77x) and a low wipe-out rate. Among liquid names above $300M it beat the universe in 11 of 12 cohorts.
  - "Quality compounders" (ROE >15%, growth >10%) were the most *consistent*: their mean beat the universe in 11 of 12 cohorts. But their 10x rate was about the base rate.
  - These are in-sample results on survivor data. Treat them as modest tilts, not as a 10x detector.
- **The famous multibagger studies cannot give hit rates.** Phelps (1972), Mayer (2015), O'Neil and Lynch all study only the winners, with no control group. Yartseva (2025) does study 464 "enduring" 10-baggers on US exchanges from 2009 to 2024, as described. But it runs its regressions *only inside that winner sample* and starts at the 2009 market bottom. Its "FCF yield / value / buy near the 12-month low" findings describe *when* winners' returns arrived. They do not show how to pick winners ahead of time.
- **Holding winners is brutal.** The typical 10-bagger in our sample fell a median **−56%** from a peak during its own 5-year run. 59% fell at least 50%, 96% fell at least 30%, and the median stock had three separate falls of 30% or more.
  - AMZN fell 94% and took 9.9 years to recover. NVDA fell 90% in 2002 and 85% in 2008. AAPL, NFLX, AXON, APP and PLTR each fell 82–92%. TSLA fell 74%.
  - BTC fell 93% in 2011 and had 7 more drawdowns of 50% or worse. ETH fell 94%.
  - A 30% trailing stop would have removed **73%** of the 10x outcomes and cut the average multiple by 24%.
- **Crypto: holding only the majors was the rational choice.** We took each year's CoinMarketCap top-100 (excluding stablecoins).
  - Only 1–14% of those coins beat BTC through Sept 2026. 10–73% lost at least 90%, and 21–69% of the 2014–2020 cohorts are no longer tracked.
  - Over any 5-year window, the median top-100 coin returned 0.70x and only 10% beat BTC.
  - An annually rebalanced equal-weight top-10 basket turned $1 into **$8**. BTC turned $1 into **$109** (2014 to Sept 2026).
  - CoinGecko (2026) reports that 53% of all tokens listed since 2021 are already dead.
- **Venture capital is an even steeper power law.** About 6% of deals return 10x or more and produce about 60% of all returns (Horsley Bridge). About 65% of financings return less than the money invested (Correlation Ventures). AngelList data shows that simply owning every deal beats most stock-pickers.
  - What diversification does: the chance of holding at least one 10x is 1−(1−p)^N. At p = 1% you need about 70 names for even odds.
  - What it does not do: raise the *expected* return. It only pulls the realized return toward the average of the pool you pick from. So the pool itself must have an edge.
- **Playbook.** Keep the "multibagger sleeve" to at most 10–20% of capital and hold 20–30 names in equal weight, drawn from a cheap-and-growing small/mid-cap pool, not a lottery pool.
  - Hold 3–5 years with no tight stops. Trim only when a position hits a size cap. Exit on measurable signs the thesis is broken.
  - Realistic outcome, based on in-sample tests that flatter the result: a 10–25% chance of at least one 10-bagger per sleeve over 5 years, and roughly even odds of beating the S&P 500.
  - Because of the user's "few trades" goal, the default way to get multibagger exposure should be a cheap broad index, which automatically owns every future 10-bagger. Add optional value/profitability tilt ETFs and, in crypto, BTC (plus ETH).

---

## 1. Scope, data and bias warnings

| Source | What we used it for | Main bias |
|---|---|---|
| SEC `company_tickers_exchange.json` (10,428 tickers, Sept 2026) | Universe of 6,045 companies (one per CIK) listed on NYSE, Nasdaq or Cboe. 4,219 are US-domiciled, identified from the XBRL `loc` field. | **Survivorship.** Only companies still registered today are included. Everything that went bankrupt, was acquired or delisted between 2005 and 2026 is missing. Our cohorts contain only **28% (2005) to 62% (2021)** of the listed-company counts for those years (WFE/World Bank, via FRED `DDOM01USA644NWDB`). |
| Yahoo Finance via yfinance (daily prices from 2003, splits, dividends) | Total-return prices, actual traded prices, 52-week high/low, volatility, dollar volume | Occasional bad prints and reverse-split errors. We dropped windows containing a single-day move above +300% (32 windows, 8 of them apparent 10x). We also require a starting price of at least $1. |
| SEC XBRL "frames" API (FY2008–FY2025) | Shares outstanding (cover page), revenue, net income, operating cash flow, capex, gross profit, equity, assets | Frames give the *latest filed* value, so restatements leak in slightly. Fiscal years are aligned to calendar years only approximately. Coverage is thin before FY2010. At each June-F formation date we use only FY F−1 data, so there is no timing look-ahead. |
| CoinMarketCap historical listings (1 Jan each year 2014–2026, plus 27 Sept 2026) | Crypto cohorts (full ranked lists, up to 10,000 coins) | Very thin prices for small coins in 2014–2017 (some "3,000x" prints). Dead coins are "untracked" and valued at their last seen price, which is an upper bound. 8 known token migrations are mapped to their successors. |
| Coin Metrics community API | Daily BTC prices from 2010 and ETH from 2015 | None material |
| Published studies | Everything else | Noted study by study |

**Design of our own test.** For each June 30 from 2005 to 2021:

- Take every US-domiciled survivor with a price of at least $1 and at least 12 months of history.
- Measure the total return over the next 60 months, using month-end prices from Yahoo adjusted for splits and dividends.
- "10-bagger" means a 5-year multiple of at least 10.
- That gives 34,217 stock-cohort observations and 203 10-baggers, from 134 distinct tickers.
- Price-based features are available for all cohorts. Fundamentals are available for 2010–2021.
- "Liquid" means a price of at least $3 and at least $1M of average daily dollar volume.

**Which way survivorship pushes each result:**

- Base rates are overstated, because the missing names are mostly failures.
- Returns of distressed buckets are overstated most: low price, near 52-week lows, high volatility, loss-makers. Those are where the dead companies were.
- Stop-loss rules look worse than they really are, because the zeros they would have avoided are missing.
- Findings that *survive* the bias are more credible: for example, "lottery-like buckets have worse medians and no better means".

---

## 2. The power law in public equities

| Study | Sample | Key facts |
|---|---|---|
| Bessembinder (2018), *Do stocks outperform Treasury bills?*, JFE 129(3) | 25,967 CRSP common stocks, 1926–2016 | Only **42.6%** of stocks beat 1-month T-bills over their lifetime, and more than half had negative lifetime returns. **The single most common lifetime outcome was −100%.** The median stock was listed for 7.5 years. The top **4.3% (1,092 firms)** created *all* of the $35T in net wealth. The top 90 firms (about 0.36%) created more than half. Over 10-year horizons the average buy-and-hold return was 106.8% but the median was 16.1%. Buying one randomly chosen stock each month did worse than the value-weighted market in 96% of simulations and worse than T-bills in 73%. |
| Bessembinder, Chen, Choi & Wei (2023, FAJ 79(3); earlier titled *Do Global Stocks Outperform US Treasury Bills?*, 2019) | More than 64,000 stocks in 42 countries, 1990–2020 | **55.2%** of US and **57.4%** of non-US stocks trailed T-bills. The top **2.39% (1,526 firms)** created all $75.7T of net wealth, and 159 firms (0.25%) created half. The most common 10-year return was −95% to −100%. The median full-period return was −6.8%, and only 29.3% of stocks beat the value-weighted market. Holding more stocks sharply raises the chance of beating T-bills: at 5 years outside the US, 42% for 1 stock versus 66% for 100 stocks. |
| Bessembinder (2024), *Which U.S. stocks generated the highest long-term returns?*, SSRN 4897069 | 29,078 stocks, 1925–2023 | 51.6% had negative cumulative returns. 17 stocks returned more than 5,000,000%, led by Altria at about 265 million percent. Among stocks with more than 20 years of history, the best annualized returns were NVDA 33.3% (about 25 years), NFLX about 32%, AMZN 31.7% and AXON 31.1%. **The top 17 compounded at only 13.5% a year on average: their huge totals came from time, not speed.** |
| Bessembinder (2020), *Extreme Stock Market Performers, Part I: Expect Some Drawdowns*, SSRN 3657604 | Top 100 wealth creators in each decade since 1950 | Even during its best decade, the average top stock fell 32.5% at some point, and it fell 51.6% on average in the decade before. NFLX fell 79.9% during the 2010s. |
| J.P. Morgan (Cembalest), *The Agony & the Ecstasy* (2021 edition; 2024 update) | Russell 3000 constituents, 1980–2020 | **44%** suffered a "catastrophic loss" (a fall of 70% or more from peak that never recovered). 42% had negative absolute returns and about two-thirds trailed the index. About 10% were "megawinners" that beat the index by at least 500 percentage points. The 2024 update: 54% of catastrophic decliners were *profitable* at their peak and 63% had net debt/EBITDA of 2x or less. Quality metrics gave little warning. |
| Mauboussin & Callahan (2025), *Drawdowns and Recoveries*, Morgan Stanley Counterpoint Global | About 6,500 US stocks, 1985–2024 | The **median maximum drawdown was 85%**, and the fall from peak to trough took 2.5 years. **About 54% never regained their prior peak.** |

**Our 5-year windows (survivors).** The top 4% of stocks produced a median 39% of each cohort's total equal-weighted gain. The 10-baggers (0.6% of observations) produced 13% of all gains. 32% of stocks had negative 5-year returns and 63% trailed SPY. Over 5 years the pattern is less extreme than over whole lifetimes, but it has the same shape.

**Why it happens (the mechanism).** Compounding volatile returns produces right skew even when short-term returns are symmetric (Bessembinder 2018, Farago & Hjalmarsson 2022). With 0.5%/month mean returns and 20%/month volatility, the *median* 10-year buy-and-hold return is **−85%**. With 10% volatility it is roughly 0% (Bessembinder 2018, Table 1). This is why the most volatile stocks are both the likeliest 10-baggers and the likeliest disasters.

---

## 3. What the multibagger literature actually shows

| Work | Sample and method | What it claims | How good is the evidence |
|---|---|---|---|
| **Phelps (1972)**, *100 to 1 in the Stock Market* | Around 365 US stocks that turned $1 into $100 or more between 1932 and 1971 | Every year from 1932 there was at least one future 100-bagger to buy. "Buy right and hold on"; don't sell while earnings keep growing. Holding periods were decades (100x in 25 years needs about 20%/yr). | Winners only, no control group. The 1932 starting point was the bottom of the Depression. Anecdotal. |
| **Mayer (2015)**, *100 Baggers* | 365 US stocks that rose 100x between 1962 and 2014 | They took about 25–26 years on average, compounding at about 21% a year. Median starting sales were about $170M and median market cap about $500M (P/S about 3). Common traits: high ROE/ROIC with room to reinvest, owner-operators, growth *plus* rising valuation multiples ("twin engines"), and holding for decades ("coffee can"). | Selected on the outcome, with no base rate. Traits like "high ROIC and a long runway" are clear only in hindsight. |
| **O'Neil**, *How to Make Money in Stocks* / *Model Book of Greatest Stock Market Winners* | 500 (1953–93), 600 (1953–2001), then 1,000+ (1880–2009) of the biggest winners | CAN SLIM: strong, accelerating quarterly EPS growth (rule: at least 18–25%, often far more), annual EPS growth of at least 25%, new products and new highs, leadership (average Relative Strength of about **87** before the big move), institutional sponsorship, and a rising market. | Winners only. AAII's paper-traded CAN SLIM screen reports 19.2%/yr since 1998 versus 5.7% for the S&P 500 price index. That excludes costs and turnover, and O'Neil's own mutual funds did not reproduce it. Academic tests are few and weak (e.g. Lutey et al. 2013–2014 in minor journals). The related academic facts that *are* robust apply over 6–12 months: momentum (Jegadeesh & Titman 1993), the 52-week-high effect (George & Hwang 2004) and post-earnings drift. They are **not** 5-year 10x predictors (see §4). |
| **Lynch (1989)**, *One Up on Wall Street* | Case studies from Magellan (about 29%/yr, 1977–1990) | Coined "tenbagger". Fast growers at reasonable prices (PEG), boring or neglected businesses, turnarounds. | Anecdotal, and we remember Lynch *because* he succeeded. The GARP idea is somewhat supported by our P/S result (§4). |
| **Oswal (2014)**, Motilal Oswal *Wealth Creation Study* (India) | 47 Indian stocks that rose 100x in 20 years | "QGLP": quality, growth, longevity, at a reasonable price. Average time to 100x about 12 years. | Descriptive, and in a very different market. |
| **Yartseva (2025)**, *The Alchemy of Multibagger Stocks*, CAFÉ Working Paper 33, Birmingham City Univ. (checked from the PDF) | **464 "enduring" 10-baggers**: stocks on major US exchanges up 10x or more *from 2009 to 2024* that were still at least 10x at the end. "Transitory" multibaggers and firms with missing data were dropped. Panel of 2000–2024 (about 11,600 firm-years) using Fama-French sorts, static and dynamic panel models (GMM), with 2023–24 held out. | FCF yield is the strongest predictor. Size, value (B/M) and profitability matter; the P/E ratio does not. A −8 to −12 percentage point hit to next-year returns when the Fed is raising rates. Growing assets faster than EBITDA hurts returns. Negative 3–6-month momentum, so buy "near the 12-month low". EPS growth is not needed. Median in 2009: market cap $348M, P/S 0.6, P/B 1.1, forward P/E 11.3. | **Selected on the outcome.** Every regression is run *within* eventual winners, with no non-winner control group, so it **cannot give hit rates or show that a screen works ahead of time.** Starting at the March-2009 trough explains the very low starting multiples. "Enduring" means the winners are chosen using the price in 2024. Around 150 variables were tried, so there is a real risk of finding patterns by chance. Its useful finding is about timing *within* winners (mean reversion), not about selection. |

**Our read of the evidence, trait by trait.** "Our data" means US survivor cohorts, 5-year horizon. Quintile tables are in `results/equity_results.md`.

| Trait | Literature | Our data: 10x rate (Q1 → Q5) | Our data: average/median outcome | Verdict |
|---|---|---|---|---|
| Small size | Consistent in books; size premium weak after 1980 | <$100M: 1.77%; $1–2B: 0.52%; >$10B: 0.27% | Means flat (1.69–1.85x). Losing 80%+: 19% for <$100M vs 1.3% for >$10B | **Robust for 10x odds, not for expected value** |
| Low share price | Lottery literature | $1–3: 2.64% vs >$50: 0.24% | $1–3 median 0.84x; 25.5% lose 80%+ | Jackpot marker; **negative for median outcome** |
| Far below the 52-week high / near the low | Yartseva (within winners); George-Hwang say the *opposite* at 6–12 months | Farthest from high 1.53% vs nearest 0.16% | Means similar (1.77 vs 1.67); 17.7% vs 2.3% lose 80%+ | Increases volatility, not value. **Survivorship inflates this result** |
| 12-month momentum / relative strength | O'Neil (RS about 87), JT93 | U-shaped: losers 1.31%, winners 0.60%, middle 0.28% | Top-decile momentum: mean 1.65x vs 1.77x; 12% lose 80%+ | **No 5-year 10x edge**; at most a 6–12-month effect |
| High volatility / big recent daily jump (MAX) | Bali-Cakici-Whitelaw 2011: negative expected return | Top vs bottom quintile of volatility: 1.61% vs 0.04% | Top quintile median 0.89x; 21% lose 80%+ | **Jackpot marker with negative expected-return evidence** |
| FCF yield | Yartseva: "most important" | U-shaped: FCF-negative 1.47%, highest FCF yield 0.62% | Highest-yield quintile has the best mean (1.91x) and median (1.56x); 3.3% lose 80%+ | **Improves average and downside, not 10x odds** |
| Cheap price-to-sales | Fisher (1984) *Super Stocks*; value premium | **Cheapest quintile 1.39%** vs 0.43–0.72% | **Mean 2.16x, median 1.58x, 4.4% lose 80%+.** Liquid names above $300M beat the universe in 11/12 cohorts | **Best single trait we found.** In-sample, survivor data, 2010–21 only |
| Revenue growth (O'Neil's quarterly EPS *acceleration* can't be tested with annual XBRL data) | Mayer, Oswal, O'Neil | Top quintile 1.20% vs about 0.45% | Mean 1.73x (no better); 12.7% lose 80%+ | Raises 10x odds. **Pair it with valuation** (small cap, P/S < 2, growth > 25%: 1.98%, mean 2.00x; found after the fact) |
| High ROE / quality / compounding | Mayer ("reinvestment at high ROIC") | Highest-ROE quintile 0.32% (lowest ROE 1.39%) | Highest ROE: mean 1.89x, median 1.59x, 3% lose 80%+; quality screen beat the universe mean in 11/12 cohorts | **Consistency trait, not a jackpot trait** |
| Share dilution | Rarely discussed | Heavy diluters (>20% a year): 0.71% | Median 0.89x, **25.8% lose 80%+**, 20% beat SPY | **Avoid** |
| Founder-led / owner-operator | Mayer; Fahlenbrach (2009, JFQA) found positive abnormal returns for founder-CEO firms in 1993–2002 | Not tested | — | Plausible, but small-sample and period-specific |
| Industry tailwind | Everywhere, anecdotally; industry momentum works at 6–12 months (Moskowitz & Grinblatt 1999) | Not tested | — | Anecdotal at multi-year horizons |
| Starting after a bear market | Implied by Phelps (1932) and Yartseva (2009) | **Post-crash cohorts 1.55% vs 0.37%** | Mean 2.33x vs 1.60x | Strong but only **3 episodes**. A regime effect, not stock selection |

---

## 4. Our test: 5-year 10-baggers, US survivors, 2005–2021

### 4.1 Base rates

| June cohort | N | SPY 5y multiple | Median stock | % 10x | % 5x | % lost ≥80% | % beat SPY |
|---|---|---|---|---|---|---|---|
| 2005 | 1,465 | 0.96 | 1.01 | 0.07 | 1.2 | 4.8 | 52.9 |
| 2007 | 1,607 | 1.01 | 0.97 | **0.00** | 0.3 | 6.2 | 47.7 |
| 2009 | 1,682 | 2.36 | 2.39 | **1.96** | 9.5 | 2.0 | 51.0 |
| 2012 | 1,834 | 1.97 | 1.91 | 0.44 | 3.7 | 3.5 | 47.9 |
| 2015 | 2,102 | 1.65 | 1.13 | 0.24 | 2.0 | 7.3 | 27.4 |
| 2016 | 2,192 | 2.24 | 1.73 | **1.78** | 7.3 | 3.1 | 32.7 |
| 2019 | 2,520 | 2.01 | 1.21 | 0.56 | 2.8 | 8.0 | 21.9 |
| 2020 | 2,629 | 2.15 | 1.49 | **1.10** | 5.1 | 9.6 | 29.4 |
| 2021 | 2,840 | 1.87 | 1.11 | 0.74 | 3.9 | 14.8 | 24.4 |
| **Pooled (17 cohorts)** | **34,217** | — | **1.39** | **0.59** (liquid names 0.38) | **3.3** | **6.2** | **36.6** |

All 17 cohorts are in `results/equity_results.md`.

- **Survivorship-corrected lower bound:** 203 10-baggers divided by all listed US companies = **0.27%**. Some real 10-baggers were later acquired and are also missing, so the true 5-year base rate is plausibly **0.3–0.4%, or about 1 in 250–350 stocks.**
- **10-year horizon** (2005–2016 cohorts): 3.98% of survivors rose 10x (lower bound 1.58%), and the median survivor returned 2.17x.
- **Any 5-year window** (start months 2005-01 to 2021-09): 347 of 2,870 survivors (12%) had at least one 60-month window of 10x or more. Averaged over all start months, 0.67% of stock-windows were 10x.
- **Timing matters a lot.** 101 of the 203 10-baggers (50%) came from the Jun-2009, Jun-2016 and Jun-2020 cohorts, each formed within about 4 months of a bear-market low. Cohorts formed just before crashes (2005–2007) had almost none.

### 4.2 What the 10-baggers looked like at the start (medians)

| At formation | 10-baggers (N=203) | Everyone else |
|---|---|---|
| Market cap (2010+) | **$251M** | $1.36B |
| Share price | **$5.52** | $24.91 |
| 12-1-month momentum | **−17%** | +9% |
| Price / 52-week high | **0.60** | 0.85 |
| 1-year volatility | **68%** | 36% |
| Profitable (NI > 0) | **34%** | 74% |
| FCF > 0 | 49% | — |
| Market cap under $2B / under $300M | 82% / 54% | 57% / — |

So the typical 10-bagger was, at the start, a small, beaten-down, volatile and often unprofitable company. That is exactly what most of the thousands of stocks that went nowhere, or died, also looked like.

### 4.3 Prediction is possible; profiting from it is not (the "jackpot paradox")

**Logit model** (cohort fixed effects, standard errors clustered by stock). Significant: lower share price (odds ratio 0.56 per SD, z = −3.8) and a price farther below the 52-week high (odds ratio 0.64, z = −3.8). With fundamentals added (2010–21), a lower P/S is significant (odds ratio 0.57, z = −3.6). Momentum, MAX, revenue growth, profitability, B/M and dilution are not significant once the other features are included.

**Out-of-sample test.** Train on early cohorts, test on later ones, and sort stocks into deciles of predicted 10x probability within each cohort:

| Model | Test cohorts | AUC | 10x rate: top decile vs all | Share of all 10x in top decile | Top decile: mean / median multiple | All: mean / median | Top decile: % lost ≥80% |
|---|---|---|---|---|---|---|---|
| Price-only (trained ≤2013) | 2014–2021 | **0.75** | 1.89% vs 0.67% (**2.8x lift**) | 28% | **1.54x / 0.45x** | 1.66x / 1.30x | **36.9%** (vs 8.1%) |
| Fundamentals + price (trained ≤2015) | 2016–2021 | 0.58 | 1.11% vs 0.83% (1.35x) | 14% | 1.56x / 0.68x | 1.76x / 1.32x | 28.9% |

**Interpretation.** A model can find the neighbourhood where 10-baggers live, but that neighbourhood is expensive per unit of expected return. It holds far more near-zeros, and the lottery-like premium has already been priced in (Barberis & Huang 2008; Conrad, Kapadia & Xing 2014; Bali, Cakici & Whitelaw 2011). **The system should never maximise "probability of 10x" as its objective. It should maximise expected log-growth or expected excess return, subject to sizing.**

### 4.4 Screens (2010–2021, 12 cohorts; lift is the 10x rate relative to the 0.62% base)

| Screen | Names per cohort | % 10x | Lift | Median | Mean (EW) | % lost ≥80% | % beat SPY | Mean > universe (cohorts) |
|---|---|---|---|---|---|---|---|---|
| Everything (base) | 2,188 | 0.62 | 1.0 | 1.43 | 1.77 | 6.8 | 32 | — |
| Small cap $50M–2B | 996 | 0.72 | 1.2 | 1.36 | 1.75 | 8.4 | 31 | 4/12 |
| Micro cap $50–300M | 373 | 0.98 | 1.6 | 1.22 | 1.71 | 12.9 | 28 | 6/12 |
| Small + momentum > 0 + FCF > 0 | 393 | 0.38 | 0.6 | 1.48 | 1.79 | 3.0 | 35 | 8/12 |
| Yartseva-like: small, FCF yield > 5%, B/M > 0.5, bottom 30% of 52-week range | 61 | 0.82 | 1.3 | 1.46 | 1.90 | 3.6 | 32 | 6/12 |
| Growth: small, revenue growth > 25%, gross margin > 40% | 28 | **2.72** | **4.4** | **0.93** | 1.87 | 16.0 | 30 | 6/12 |
| … + within 10% of 52-week high (simple CAN SLIM) | 6 | 1.32 | 2.1 | 1.27 | 1.88 | 9.2 | 37 | 7/11 |
| Quality compounder: ROE > 15%, growth > 10%, cap < $5B | 79 | 0.74 | 1.2 | 1.51 | 1.96 | 4.1 | 39 | **11/12** |
| Fisher: P/S < 0.75, growth > 15%, small | 37 | 1.14 | 1.8 | 1.55 | **2.06** | 5.0 | 38 | 7/12 |
| Top-decile 12-month momentum | 219 | 0.84 | 1.4 | 1.20 | 1.65 | 12.1 | 29 | 5/12 |
| **Lottery: top-quintile volatility and price < $5** | 207 | **2.33** | **3.8** | **0.65** | 1.79 | **30.2** | 25 | 5/12 |
| **Story stocks: unprofitable, growth > 50%** | 56 | 2.07 | 3.3 | **0.55** | 1.45 | **31.3** | 23 | 5/12 |
| Heavy dilution (shares up > 20% a year) | 164 | 0.71 | 1.1 | 0.89 | 1.29 | 25.8 | 20 | 3/12 |

Checked afterwards, and split into halves (2010–15 and 2016–21):

- **The cheapest P/S quintile beat the base in both halves**, on 10x rate (0.70% vs 0.38%, and 1.82% vs 0.81%) and on mean (1.99x vs 1.85x, and 2.27x vs 1.71x).
- The quality screen beat on mean in both halves.
- The lottery screen always had 3–7x the 10x rate but never a better mean.
- The growth screen looked excellent in 2010–15 (mean 2.02x) but in 2016–21 had a median of 0.67x and 21% wipe-outs.

We tested more than 20 screen variants. Treat any single lift of about 1.5x or less as noise.

### 4.5 Round trips and holding rules

- **Round trips are common.** 438 stocks touched 10x (at a month-end) at some point within their 5-year window. Only **46%** were still at least 10x at the end of the window, 24% ended below 5x, and 10% ended below 2x.
- **Tight stops remove the winners.** We tested each rule on the monthly price paths of all 34,217 windows; after an exit the money sits in cash at 0% return.

| Rule | Mean multiple | Median | % ending ≥10x | % ending ≤0.5x |
|---|---|---|---|---|
| Buy and hold 5 years | **1.74** | 1.39 | **0.59** | 14.2 |
| Stop at −50% from cost | 1.63 | 1.28 | 0.54 | 31.3* |
| Trailing stop −30% | 1.33 | 0.95 | **0.16** | 2.2 |
| Trailing stop −50% | 1.53 | 1.15 | 0.42 | 17.3 |
| Sell half at 3x | 1.69 | 1.44 | 0.24 | 13.6 |
| Sell half at 10x | **1.75** | 1.40 | **0.70** | 14.1 |
| Sell everything at 3x | 1.63 | 1.44 | 0.01 | 13.6 |

\*Survivorship makes stops look worse than they are: the zeros they would have saved you from are missing from the data. The *right-tail* damage done by trailing stops is robust.

---

## 5. How brutal was holding the famous multibaggers?

Daily total-return closes from the first available date to 2026-09-28. BTC is from 2010 and ETH from 2015 (Coin Metrics). The full list of every 50%+ drawdown is in `results/drawdown_episodes.md`.

| Asset (start) | Multiple to now | CAGR | Worst drawdown (peak → trough) | Peak → back to that peak | Number of ≥50% drawdowns | % of days ≥20% below all-time high | Drawdown now |
|---|---|---|---|---|---|---|---|
| AMZN (1997 IPO) | 2,514x | 30.5% | **−94.4%** (Dec-99 → Sep-01) | **9.9 yrs** (Oct-09) | 4 | 46% | −13% |
| AAPL (1980 IPO) | 3,449x | 19.5% | −81.8% (Mar-00 → Apr-03); also −81.2% (1991–97) | 4.8 yrs; 8.4 yrs for the 1991 peak | 6 | 54% | −1% |
| NFLX (2002 IPO) | 579x | 29.9% | −82.0% (Jul-11 → Sep-12); −76.7% (2004–05); −75.9% (2021–22) | 2.2 yrs | 5 | 49% | −48% |
| NVDA (1999 IPO) | 6,100x | 37.0% | **−89.7%** (Jan-02 → Oct-02); −85.1% (2007–08, **8.5 yrs** to recover); −66% (2022) | 4.9 yrs | 7 | 60% | −3% |
| TSLA (2010 IPO) | 224x | 39.5% | −73.6% (Nov-21 → Jan-23) | 3.1 yrs | 4 | 52% | −27% |
| MNST (Dec-1985; a sub-$1 penny stock, split-adjusted, until about 2003) | 1,257x | 19.1% | **−95.6%** (1986 → 1995, penny-stock era); since 1995: −69% (1995), −56% (1998–2001, 5.2 yrs), −69% (2007–08, 3.6 yrs) | **18 yrs** for the 1986 peak | 3 over the full history (5 counting from 1995) | 58% | −16% |
| AXON (2001) | 923x | 31.0% | **−91.8%** (Dec-04 → Nov-08) | **10.3 yrs** | 6 | 69% | −51% (live) |
| PLTR (Sep-2020 listing) | 20x | 64.5% | −84.6% (Jan-21 → Dec-22) | 3.7 yrs | 1 | 71% | −10% |
| APP (Apr-2021 IPO) | 5x | 33.0% | **−91.9%** (Nov-21 → Dec-22) | 2.8 yrs | 3 | 75% | −58% (live) |
| BTC (Jul-2010) | ~983,000x | 134% | **−92.7%** (2011); −84.5% (2013–15); −83.8% (2017–18); −76.7% (2021–22); −53% (Oct-25 → Jun-26, live) | 1.7–3.2 yrs each | **8** | 77% | −32% |
| ETH (Aug-2015) | 2,238x | 100% | **−94.0%** (2018); −79.4% (2021–22, 3.8 yrs); −67.6% (Aug-25 → Jun-26, live) | 3.0 yrs | 7 | **85%** | −44% |

**The typical 10-bagger in our sample** (N = 203; daily data inside its own 5-year winning window):

- Median maximum drawdown was **−56%**. The interquartile range was −47% to −68%, and the 10th percentile was −81%.
- **59%** fell at least 50%, **85%** at least 40%, and **96%** at least 30%.
- The median stock had **3** separate declines of 30% or more.
- It spent 33% of trading days at least 20% below its running peak.
- 28% fell at least 30% *below the purchase price* at some point.
- Median time to first reach 2x was 0.9 years. Median time to first reach 10x was **3.95 years**. 22% were below cost after the first year.

**Implication.** Anyone who cannot sit through a 50–60% fall, several 30% falls, and years underwater cannot collect a 10x. Every famous winner in the table above had at least one fall of 74% or more.

---

## 6. Crypto: cohorts, death rates and whether "only the majors" makes sense

**Method.** Take the CoinMarketCap top-100 on 1 January of each year, excluding stablecoins and wrapped or staked duplicates. Follow each coin to 2026-09-27, and also over fixed 1, 3 and 5-year horizons. Coins that stopped being tracked are valued at their last seen price, which is an upper bound. Known migrations are mapped with their official swap ratios (FTM→S, MATIC→POL, VEN→VET ×100, MCO→CRO ×27.6, LEND→AAVE ÷100, and others).

| Cohort (1 Jan) | BTC multiple to Sept 2026 | Median coin | % beat BTC | % up ≥10x | % down ≥90% | % no longer tracked | % still in top 100 | Best coin |
|---|---|---|---|---|---|---|---|---|
| 2014 (69 coins) | 109x | 0.03x | 1.4 | 4.3 | 65 | 65 | 6 | DOGE 221x |
| 2015 | 269x | 0.97x | 2 | 18 | 18 | 69 | 7 | XMR 1,176x |
| 2016 | 194x | 1.18x | 7 | 23 | 16 | 57 | 8 | ETH 2,834x |
| 2017 | 85x | 0.85x | 6 | 17 | 17 | 52 | 10 | (illiquid prints) |
| 2018 | 6.2x | **0.02x** | 4 | 3 | **73** | 21 | 17 | BNB 93x |
| 2019 | 22x | 0.28x | 5 | 11 | 34 | 21 | 21 | BNB 128x |
| 2020 | 11.7x | 0.48x | 10 | 12 | 31 | 24 | 27 | QNT 75x |
| 2021 | 2.9x | 0.34x | 14 | 6 | 28 | 3 | 35 | ZEC 28x |
| 2022 | 1.8x | **0.06x** | 6 | 1 | **59** | 0 | 43 | ZEC 11x |
| 2023 | 5.1x | 0.58x | 3 | 2 | 10 | 0 | 49 | ZEC 43x |
| 2024 | 1.9x | 0.21x | 9 | 0 | 29 | 0 | 57 | BGB 3x |
| 2025 | 0.89x | 0.27x | 10 | 1 | 16 | 0 | 69 | ZEC 27x |

**Pooled fixed-horizon results (coin level, all cohorts):**

| Horizon | Coins | Median multiple | % ≥10x | % ≤0.1x | % beat BTC over the same window |
|---|---|---|---|---|---|
| 1 year | 1,169 | 0.83 | 8.5 | 15.9 | 22.8 |
| 3 years | 969 | 0.74 | 12.3 | 19.9 | 16.0 |
| 5 years | 769 | **0.70** | 15.0 | **26.7** | **10.0** |

**Findings:**

- Crypto 10x outcomes clustered in the 2015–2017 cohorts. In those cohorts **BTC itself rose 20–270x**, so what looked like picking skill was really exposure to crypto as a whole.
- **Top-10 churn is severe.** Of the 2018 top-10 (BTC, XRP, ETH, BCH, ADA, LTC, MIOTA, XEM, XLM, DASH), only BTC, ETH and XRP are still top-10, and **none of the nine non-BTC coins beat BTC** from 2018 to now. The same was true for the 2019 cohort (0 of 9).
- **Annually rebalanced baskets (1 Jan 2014 → 27 Sept 2026):**

  | Portfolio | Growth of $1 |
  |---|---|
  | BTC | **$109** |
  | Cap-weighted top-10 | $75 |
  | Equal-weight top-20 | $15 |
  | Equal-weight top-10 | **$8** |
  | Equal-weight top-100 | $3.4 (single-coin yearly gains capped at 100x) |
  | ETH (from 2016) | $2,834, but choosing ETH in 2016 is hindsight |

- **Death rates.** CoinGecko Research (updated April 2026) reports that **53.2%** of all tokens listed on GeckoTerminal since mid-2021 have failed, including 11.6 million in 2025 alone (86% of all 2021–25 failures).
- **Conclusion.** For a system without a proven edge in picking coins, the rational crypto sleeve is **BTC (plus ETH at most), sized to survive −75% to −94% drawdowns.** Holding "a basket of alts to catch the next 100x" has not worked. In every cohort from 2018 on, the median coin is down 42–98% as of Sept 2026. Over 5-year windows the median coin returned 0.70x, and 90% of coins lost to BTC.

---

## 7. Venture and private markets: power laws, and how many bets to make

| Dataset | Evidence |
|---|---|
| Horsley Bridge: about 7,000 VC investments, 1985–2014 (Evans 2016, *In praise of failure*) | About half returned **less than 1x**. **6% returned at least 10x and produced about 60% of all returns.** The *best* funds had *more* sub-1x deals and more very large hits (winning deals averaged 64.3x in funds returning more than 5x). |
| Correlation Ventures (tens of thousands of US financings) | About **65%** of financings return less than 1x, and **fewer than 4%** return 10x or more. The pattern was stable across 2004–13 and the following decade. |
| Wiltbank & Boeker (2007), Kauffman angel study | 3,097 investments with 1,137 exits. **52%** of exits returned less than capital, about 7% returned more than 10x, and a top ~5% of investments produced about 57% of the cash returned. |
| AngelList (Othman), 1,808 early-stage deals | Very heavy power-law tail (AngelList's blog estimates α ≈ 2.3; Othman's *Startup Growth and Venture Returns* argues α < 2 at seed). An equal-weight "index" of every deal beat 74% of simulated 10-deal portfolios, and after fees it beat about 82% of managers. Indexing every credible seed deal *raises* expected return. |
| Retail access (equity crowdfunding) | Signori & Vismara (2018): of 212 Crowdcube offerings (2011–15), 18% had failed within a few years and only 3 had been acquired. Retail deal flow is **adversely selected**: the top VC funds that produce the power law are closed to retail. Listed "private tech" vehicles have at times traded at large premiums to their net asset value. |

**How many bets?** The chance of at least one 10x is P = 1 − (1 − p)^N:

| Per-name chance of 10x in 5 years (p) | N = 5 | 10 | 20 | 30 | 50 | 100 |
|---|---|---|---|---|---|---|
| 0.5% (roughly a random liquid stock) | 2% | 5% | 10% | 14% | 22% | 39% |
| 1% (a good screen) | 5% | 10% | 18% | 26% | 40% | 63% |
| 2% (lottery or growth pool) | 10% | 18% | 33% | 46% | 64% | 87% |
| 5% (roughly VC-like odds) | 23% | 40% | 64% | 79% | 92% | 99% |

**What our basket simulations show** (random equal-weight baskets drawn within each cohort, 5-year hold, cohorts equally weighted):

| Pool | N | P(at least one 10x) | Median basket multiple | P(beat SPY) | P(lose money) |
|---|---|---|---|---|---|
| Liquid universe | 1 / 20 / 50 | 0% / 7% / 15% | 1.49 / 1.70 / 1.72 | 40% / 49% / 51% | 29% / 4% / 1% |
| Lottery pool (volatile, price < $5) | 1 / 20 / 50 | 2% / **35%** / **61%** | **0.73** / 1.64 / 1.76 | 26% / 35% / 36% | **59%** / 21% / 12% |
| Cheapest P/S quintile (after the fact) | 1 / 20 / 30 | 1% / 15% / 21% | 1.67 / **2.04** / 2.07 | 42% / **59%** / 62% | 26% / 1% / 1% |
| Quality compounder (after the fact) | 1 / 20 / 30 | 1% / 10% / 14% | 1.54 / 1.96 / 1.98 | 39% / 54% / 57% | 27% / 1% / 1% |
| GARP-small (P/S < 2, growth > 15%, dilution < 10%, after the fact) | 1 / 20 / 30 | 1% / 17% / 21% | 1.32 / 1.82 / 1.84 | 34% / 41% / 42% | 37% / 7% / 6% |

**The key point for design.** Adding names does **not** change the basket's expected multiple. The mean stays fixed at the pool's mean, about 1.74x for the liquid universe. More names only narrow the spread, so the realized result moves toward that mean. A lottery pool with 50 names finds a 10x 61% of the time *and still loses to SPY 64% of the time*. One 10x in a 20-stock equal-weight sleeve adds only about +0.45x to the sleeve multiple (9/20). The things that matter are, in order: **(1) the pool's expected excess return, (2) enough names that its tail shows up, (3) holding through the drawdowns.**

---

## 8. A practical, evidence-based "multibagger sleeve" playbook

1. **First, try to get the power law cheaply.** A cap-weighted total-market index owns every future 10-bagger automatically and keeps compounding it, and it takes one trade. Adding a single small/mid-cap *value + profitability* tilt fund gets the "cheap P/S + quality" pool average with one more trade. Only build a stock-picking sleeve if the system can show out-of-sample skill (§9, rule 10).
2. **Sleeve size.** 10% of investable capital by default. Raise it to at most 20% only in a post-crash regime (rule 7 below). The expected outcome is similar to the index, with far higher variance.
3. **Pool (eligibility filters).** US-listed common stock; price at least $3; average daily dollar volume at least $1M; market cap $100M–$5B; revenue growth at least 15% (latest fiscal year or trailing 12 months); **P/S at most 2, or in the cheapest 40% of the universe**; positive gross profit; share count growth at most 10% a year; at least 2 years since IPO or SPAC merger. **Exclude:** price under $3 *and* top-quintile volatility; unprofitable companies growing over 50% while diluting over 10%; OTC stocks; SPACs; shell companies; going-concern warnings.
4. **Ranking inside the pool** (tie-breakers, low weight): higher FCF yield, higher ROE or gross profitability, lower asset growth relative to EBITDA growth. **Do not** rank on "near 52-week high" or 12-month momentum for a 5-year 10x goal. Neither added value at that horizon.
5. **Number of positions and sizing.** 20–30 names at equal weight: 0.3–0.5% of total capital each at cost, 1% maximum. Buy them within one cohort window; tranches over 1–3 months are fine.
6. **Holding and trimming.** Default holding period 3–5 years; review fundamentals each quarter.
   - **No price stops tighter than −50% from peak.** A −30% trailing stop removed 73% of the 10x outcomes.
   - Trim **only** when one position exceeds 3x its target weight or 5% of total capital, and then only back to the cap. Or trim half when it reaches 10x. Never sell everything at 2–3x.
   - Rebalance additions go to the smallest weights, not to the losers automatically.
7. **Regime overlay.** When US small caps (e.g. the Russell 2000) are down at least 30% from their peak, move the sleeve toward 20%. Post-crash cohorts had 4x the 10x rate and a mean of 2.33x versus 1.60x, but that rests on 3 episodes, so keep the adjustment modest.
8. **Thesis-break exits.** These are judgment rules and were *not* backtested here. Exit if:
   - revenue falls year on year for 2 consecutive reports, or trailing-12-month revenue is down more than 15%; or
   - share count rises more than 15% in 12 months without a matching acquisition; or
   - there is a restatement, an auditor resignation or going-concern language; or
   - cash runway is under 12 months while free cash flow is negative.
   A stock becoming expensive is **not** by itself a reason to sell a winner.
9. **Drawdowns to tolerate.** Per name: expect −50% to −60% on the way even for the eventual big winners. Per sleeve: expect −30% to −60% in a bear market. That estimate comes from small-cap index drawdowns: the Russell 2000 fell 60% in 2007–09, 43% in 2020 and 33% in 2021–23, and the small-cap value ETF IWN fell 62% in 2007–09. A 20–30 name sleeve will swing more than the index. Crypto: expect −75% or worse.
10. **Realistic success base rate.** Over 5 years, a 20–30 name sleeve drawn from the pool above has **about a 10–25% chance of holding at least one 10-bagger** (in-sample, survivor data: 10–21%). Its median multiple is **about 1.8–2.1x** against about 1.9x for SPY in 2010–2021. It has **about a 40–60% chance of beating the S&P 500** (in-sample: 41–62%). Take off something for survivorship; in real life, expect the low end of each range. A *single* moonshot pick has **about a 0.5–1.5% chance** of rising 10x in 5 years and roughly a 30–60% chance of losing money.

---

## 9. Implications for the system design

Concrete rules and parameters for the recommendation engine:

1. **Objective function.** Do not score trades by P(10x) or by "upside multiple". Score them by expected excess log-return after costs. The OOS test (§4.3) shows that maximising P(10x) picks portfolios with a 0.45x median, 37% wipe-outs and a *lower* mean. Hard-code a penalty (or exclusion) for jackpot markers: price < $3, top-quintile 1-year volatility, top-quintile MAX (largest daily return in the past month), share count up more than 20% a year, and unprofitable companies with revenue growth over 50%.
2. **Default route to "multibagger" exposure (few trades).** One broad-market index trade plus an optional small-cap value/profitability tilt ETF. Only recommend single-stock "moonshots" as part of a **sleeve** (rule 3), never as a standalone high-conviction trade.
3. **Sleeve parameters.**
   - Size: `sleeve_weight = 10%`, or `20%` if `R2K_drawdown_from_peak ≥ 30%`.
   - Names: `N = 20–30`, with `max_weight_at_cost = 1%` of capital and `target = sleeve_weight/N`.
   - Holding: `holding_horizon = 36–60 months`.
   - Trims: `trim_trigger = position > 3× target or > 5% of capital`, and `trim_to = cap`.
   - Stops: `no trailing stop tighter than −50%`.
   - Send one email per sleeve formation, listing all N names, instead of N separate emails.
4. **Screen defaults for the sleeve pool.**
   - `price ≥ $3`, `ADV ≥ $1M`, `$100M ≤ mcap ≤ $5B`
   - `revenue_growth ≥ 15%`, `P/S ≤ 2 (or bottom 40% of the universe)`
   - `gross_profit > 0`, `share_count_growth ≤ 10%/yr`, `years_listed ≥ 2`
   - Exclude SPACs, OTC and going-concern names.
   - Tie-breakers: FCF yield, ROE, and asset growth relative to EBITDA growth.
5. **Features to ignore for 5-year 10x selection.** Proximity to the 52-week high, 12-month relative strength, "story" growth without valuation discipline, and "near the 12-month low" as a *buy signal*. The last one describes *surviving* winners and is inflated by survivorship.
6. **Priors for calibration** (use these to start monthly Bayesian updating; do not re-fit on fewer than about 100 closed positions):
   - Per-name 5-year 10x probability: 0.3% (random), 0.6–1.3% (sleeve pool), about 2.5% (lottery pool, but negative expected value).
   - Per-name 5-year probability of losing ≥80%: 3–5% (pool) versus 25–31% (lottery, story-stock and heavy-dilution buckets).
   - 10-year 10x probability: about 1.6–4%.
   - Expected worst drawdown of an eventual 10-bagger: −56% (median), −81% (10th percentile).
   - The monthly self-review should compare realized hit rates at 12, 36 and 60 months with these priors, and report survivorship-free outcomes (delisted names count at their final price, or −100%).
7. **Hold discipline in emails.** Every sleeve email must state:
   - the base rate ("about 1 in 100 names becomes a 10x in 5 years; about 1 in 3 loses money");
   - the expected drawdown ("the eventual winners typically fall 50–60% along the way");
   - the exit conditions (only the thesis-break rules in §8.8).
   No price-based panic exits.
8. **Crypto rules.**
   - `crypto_universe = {BTC, ETH}`, with ETH at most 50% of the crypto sleeve.
   - `crypto_sleeve ≤ 5–10%` of capital, and size it so that a −80% move costs at most 8% of total capital.
   - Alt-coin "moonshots" are off by default. Allow them only as at most 1% lottery tickets with explicit negative-EV disclosure. No alt baskets: annually rebalanced equal-weight top-10/top-20 baskets returned only 7–14% of BTC's multiple.
9. **Private markets.** Default **excluded** for this retail user: adverse selection, illiquidity, fees, and far fewer names than the power law needs (N of 50 or more). Allow only listed vehicles bought at or below net asset value, never at large premiums.
10. **Edge gate.** The engine may only move the sleeve's pool away from these defaults (e.g. adding its own AI-derived signals) after an out-of-sample test covering at least 5 annual cohorts that shows: (a) a pool mean multiple above the universe in at least 70% of cohorts; (b) a median at or above the universe median; (c) no worse ≥80%-loss rate. A higher 10x rate alone is **not** evidence of edge.
11. **Timing lever.** Keep a "post-crash" flag (small-cap index down ≥30% from peak, or the VIX averaging above 35 for a month). While it is on, allow the sleeve to scale to 20% and relax the P/S cap to ≤3. Before this counts as validated, check it against pre-2005 data, because only 3 episodes support it here.
12. **Data hygiene for any future backtest the engine runs.** Use a survivorship-free universe (keep delisted names with their delisting returns). Build fundamentals point-in-time from filing dates. Winsorise single-day moves above +300%. Report medians and loss rates alongside means.

---

## Appendix A. Reproducibility

Run these in order from `research/code/07-multibaggers/`. Raw caches are written to the session scratchpad `…/scratchpad/07-multibaggers/`.

| Script | Purpose |
|---|---|
| `01_download_prices.py` | SEC ticker/exchange universe and daily Yahoo prices (2003 onward) |
| `02_download_xbrl_frames.py` | SEC XBRL frames: 15 concepts × fiscal years 2008–2025 |
| `03_build_panels.py` | Month-end panels: adjusted and actual price, 52-week high/low, volatility, dollar volume, MAX |
| `04_build_fundamentals.py` | Point-in-time fundamentals for June formation dates |
| `05_equity_analysis.py` | Cohort panel (outcomes, features, data-quality filters) |
| `06_results.py` | Base rates, quintiles, logit and OOS test, screens, basket simulations → `results/equity_results.md` |
| `07_more_results.py` | Size/price buckets, regime, any-window census, 10-bagger paths, holding rules → `results/equity_results_extra.md` |
| `10_crypto_download.py`, `11_crypto_cohorts.py` | CMC snapshots and Coin Metrics prices → `results/crypto_cohorts.md`, `results/crypto_cohort_coins.csv` |
| `20_famous_drawdowns.py`, `21_drawdown_episodes.py` | Path statistics for AMZN … ETH → `results/famous_drawdowns.md`, `results/drawdown_episodes.md` |

## Appendix B. References

- Bessembinder, H. (2018). Do stocks outperform Treasury bills? *Journal of Financial Economics* 129(3), 440–457. SSRN 2900447.
- Bessembinder, H., Chen, T.-F., Choi, G., Wei, K.C.J. (2023). Long-term shareholder returns: Evidence from 64,000 global stocks. *Financial Analysts Journal* 79(3), 33–63 (earlier: "Do Global Stocks Outperform US Treasury Bills?", SSRN 3710251).
- Bessembinder, H. (2020). Extreme Stock Market Performers, Part I: Expect Some Drawdowns. SSRN 3657604.
- Bessembinder, H. (2024). Which U.S. Stocks Generated the Highest Long-Term Returns? SSRN 4897069.
- Mauboussin, M., Callahan, D. (2025). Drawdowns and Recoveries: Base Rates for Bottoms and Bounces. Morgan Stanley Counterpoint Global.
- Cembalest, M. / J.P. Morgan (2021, 2024). The Agony & the Ecstasy: The risks and rewards of a concentrated stock position. https://www.jpmorgan.com/content/dam/jpmorgan/documents/wealth-management/the-agony-and-the-ecstasy-2024.pdf
- Yartseva, A. (2025). The Alchemy of Multibagger Stocks: An empirical investigation of factors that drive outperformance in the stock market. CAFÉ Working Paper 33, Birmingham City University. https://www.open-access.bcu.ac.uk/16180/
- Phelps, T. W. (1972). *100 to 1 in the Stock Market*. McGraw-Hill.
- Mayer, C. (2015). *100 Baggers: Stocks That Return 100-to-1 and How to Find Them*. Laissez Faire Books.
- O'Neil, W. J. *How to Make Money in Stocks* (2nd–4th eds.); AAII (2023), "A Tribute to William O'Neil: Revisiting the CAN SLIM Strategy".
- Lynch, P. (1989). *One Up on Wall Street*. Simon & Schuster.
- Oswal, M. (2014). 19th Annual Wealth Creation Study, "100x: The power of growth in wealth creation". Motilal Oswal.
- Fisher, K. (1984). *Super Stocks*. Dow Jones-Irwin.
- Conrad, J., Kapadia, N., Xing, Y. (2014). Death and jackpot: Why do individual investors hold overpriced stocks? *JFE* 113(3), 455–475.
- Bali, T., Cakici, N., Whitelaw, R. (2011). Maxing out: Stocks as lotteries and the cross-section of expected returns. *JFE* 99(2), 427–446.
- Barberis, N., Huang, M. (2008). Stocks as lotteries: The implications of probability weighting for security prices. *AER* 98(5).
- George, T., Hwang, C.-Y. (2004). The 52-week high and momentum investing. *Journal of Finance* 59(5).
- Jegadeesh, N., Titman, S. (1993). Returns to buying winners and selling losers. *Journal of Finance* 48(1).
- De Bondt, W., Thaler, R. (1985). Does the stock market overreact? *Journal of Finance* 40(3).
- Moskowitz, T., Grinblatt, M. (1999). Do industries explain momentum? *Journal of Finance* 54(4).
- Fahlenbrach, R. (2009). Founder-CEOs, investment policy, and stock market performance. *JFQA* 44(2).
- Farago, A., Hjalmarsson, E. (2022/2023). Compound returns are positively skewed. *Review of Finance* (as cited in Bessembinder et al. 2023).
- Evans, B. (2016). In praise of failure (Horsley Bridge data). https://www.ben-evans.com/benedictevans/2016/4/28/winning-and-losing
- Correlation Ventures, "Venture Capital — No, We're Not Normal" and "…We're Still Not Normal" (Medium); Levine, S. (2014, 2019) VC Adventure blog summaries.
- Wiltbank, R., Boeker, W. (2007). Returns to Angel Investors in Groups. Kauffman Foundation / Angel Capital Education Foundation. SSRN 1028592.
- Othman, A. / AngelList (2019–2020). Startup Growth and Venture Returns; "What AngelList data says about power-law returns in venture capital".
- Signori, A., Vismara, S. (2018). Does success bring success? The post-offering lives of equity-crowdfunded firms. *Journal of Corporate Finance* 50, 575–591.
- CoinGecko Research (updated 2026-04-17). How many cryptocurrencies have failed? https://www.coingecko.com/research/publications/how-many-cryptocurrencies-failed
- Data: SEC EDGAR (company_tickers_exchange.json; XBRL frames API), Yahoo Finance via yfinance, CoinMarketCap historical listings (data-api v3), Coin Metrics community API, FRED `DDOM01USA644NWDB` (World Bank/WFE listed domestic companies).
