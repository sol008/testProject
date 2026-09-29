# 34: Is 100% a year feasible? What it requires, and whether anyone has done it

*Research track 34. Written 29 Sep 2026 in answer to the owner's target of the same day: "a make-rich quick engine", "target 100% per year as the base line and shoot for 1000%", and at most one recommendation a week. Code: `research/code/34-feasibility/` (`python3 run_all.py`, about 4 minutes, fixed seeds). Every table has a CSV/Markdown twin in `research/code/34-feasibility/results/`. Growth is always after the costs stated, before tax.*

---

## TL;DR

1. **Requirement.** Doubling every year needs a Sharpe ratio of at least 1.14, sustained, at full Kelly leverage (1.32 at half Kelly, 1.73 at quarter Kelly), and even then carries a 91% chance of an 80% drawdown within 10 years. The S&P 500 is about 0.4, the Nasdaq-100 0.56, and Medallion, the best record ever published, 2.0 gross and 1.8 net.
2. **Nobody has sustained it.** Medallion compounded 63% gross and 38% net (1988–2018) and never had a +100% year after fees. Not one of about 2,700 US stocks did 100% a year over any 10-year window since 2003, even with perfect hindsight (best: Nvidia, 81%). Contest winners make a median +252% in one year, but only 17% of US Investing Championship entrants were profitable in the first half of 2026.
3. **The most aggressive systems you could run** (3× Nasdaq with a 200-day filter, Bitcoin trend at full weight, 2× Bitcoin, concentrated momentum, rolling calls) give a 2–43% chance of +100% next year, but 0.0–0.1% of 100% a year for 10 years. The only exception is Bitcoin, which gets there only on paths where Bitcoin itself rises more than 10× (a market cap above $17 trillion). The leveraged versions carry a 31–100% chance of an 80% drawdown.
4. **1000% a year turns $100k into $2.6 quadrillion in 10 years,** five times the world's wealth. Single 1000% years do happen (Bitcoin in 2011, 2013 and 2017; 3 of 42 contest winners), but only from all-in bets whose alternative is ruin, and even an elite Sharpe of 1 caps the chance of two in a row at 14%.
5. **Recommendation.** Replace "100% a year" with "maximise long-run growth subject to a drawdown limit the owner chooses". At a realistic Sharpe of 0.4–0.75 and a 30–50% drawdown tolerance, that is about 8–27% a year, or 10× in roughly 10–30 years. The owner picks the drawdown tolerance, leverage and crypto weight. The system reports P(10× by a date) and never promises a rate.

---

## 1. The growth math

### 1.1 What "100% a year" means mathematically

- **Doubling every year means log growth of ln 2 = 0.693 a year.** Wealth compounds at the *median* (geometric) rate, not the average return. For a strategy with volatility σ and arithmetic return μ, the geometric rate is about μ − σ²/2 (track 03, §1.1).
- **The best any strategy can do, for a given Sharpe ratio S, is to run at the Kelly leverage.**
  - A strategy run at c × Kelly (c = 1 is full Kelly, c = ½ half Kelly) grows at the median rate **g = r + S²(c − c²/2)**, where r is the T-bill rate.
  - Its log wealth swings by **c·S** a year (Merton 1969; Thorp 2006; track 03 §2.2).
  - At full Kelly, **g = r + S²/2**.
- **Setting g = ln 2 and r = 4% (T-bills now) gives the Sharpe ratio needed:**

| Target | Sizing | Sharpe needed | Portfolio volatility | P(losing year) | P(ever −50%) | P(ever −80%) | P(drawdown ≥50% within 10y) | P(drawdown ≥80% within 10y) |
|---|---|---|---|---|---|---|---|---|
| +30%/yr | full Kelly | 0.67 | 67% | 35% | 50% | 20% | 100% | 52% |
| +30%/yr | half Kelly | 0.77 | 39% | 25% | 12.5% | 0.8% | 64% | 2% |
| +50%/yr | half Kelly | 0.99 | 49% | 21% | 12.5% | 0.8% | 83% | 5% |
| **+100%/yr** | **full Kelly** | **1.14** | 114% | 27% | 50% | 20% | 100% | **91%** |
| **+100%/yr** | **half Kelly** | **1.32** | 66% | 15% | 12.5% | 0.8% | 96% | 10% |
| +100%/yr | quarter Kelly | 1.73 | 43% | 5% | 0.8% | ~0% | 21% | <0.1% |
| **+1000%/yr** | **full Kelly** | **2.17** | 217% | 13% | 50% | 20% | 100% | 100% |
| +1000%/yr | half Kelly | 2.51 | 125% | 3% | 12.5% | 0.8% | 100% | 34% |

*`results/a1_required_sharpe.csv`. The "ever" columns are the exact first-passage law x^(2/c − 1) (track 03 §2.6). The 10-year drawdown columns come from 20,000 simulated daily paths.*

- **1.14 is a floor, not a target.** It is only reached at full Kelly, where the portfolio's volatility equals its Sharpe ratio: 114% a year.
  - At any other volatility the requirement is higher (`results/a2_*`).
  - At 30% volatility, roughly a concentrated stock portfolio, doubling every year needs a Sharpe of **2.33**. At 20% volatility, roughly the stock market, it needs **3.37**.

| Strategy volatility | 15% | 20% | 30% | 50% | 80% | 114% | 150% |
|---|---|---|---|---|---|---|---|
| Sharpe needed for +100%/yr | 4.43 | 3.37 | 2.33 | 1.56 | 1.22 | **1.14** (full Kelly) | 1.19 (over-betting) |

### 1.2 What Sharpe ratios actually exist

| Record | Period | Annual Sharpe | Best possible median growth if levered to full Kelly: r + S²/2 |
|---|---|---|---|
| US stock market (CRSP) | 1927–2025 | 0.44 (track 03) | 14.6% a year, at about 2.3× leverage (hindsight) |
| Nasdaq-100 | Oct 1985–Sep 2026 | 0.56 (this track) | 21% |
| Top momentum decile, after 2%/yr costs | 1926–2026 | 0.50 | 18% |
| 3× Nasdaq-100 with a 200-day filter | 1985–2026 | 0.56 | (already leveraged) |
| Managed-futures (CTA) funds, net | 2007–2026 | about 0.2–0.4 (track 15) | 6–13% |
| Bitcoin, buy and hold | 2015–2026 | 1.02 (a one-time adoption boom) | 75% |
| Medallion, net of its 5% + 44% fees | 1988–2018 | **1.78** | (capacity-capped at about $10bn) |
| Medallion, gross | 1988–2018 | **1.99** | (capacity-capped) |

*Medallion Sharpe computed from the annual returns in Cornell (2020), Table 1 (taken from Zuckerman 2019), against French T-bill returns (`results/a3_*`). The Nasdaq, momentum and Bitcoin figures are from `results/b1_historical.csv`.*

**What the table shows:**

- **Only Medallion clears the bar, and it did not use its Sharpe to double every year.** At a Sharpe of about 2, full Kelly would have implied growth of several hundred percent a year. Medallion actually ran at roughly a sixth (gross) to a ninth (net) of the leverage its annual Sharpe would have justified, capped the fund at about $10bn, and returned outside money.
  - Its realized record: **63.3% compounded gross, 37.8% net.**
  - Its best year was +152% gross (2008). Its best year net of fees was **+98.5% (2000). It never had a +100% year after fees in 31 years.**
- **Every investable strategy in the table sits at a Sharpe of 0.4–0.6.** At that level, even perfect full-Kelly leverage tops out at a median of 15–21% a year, and comes with Kelly-sized drawdowns (50% chance of ever halving).
- **Bitcoin's 1.02 is a single historical adoption curve:** $315 → $84,000 in 2015–2026. §3 shows that it cannot repeat from a $1.7 trillion base.

### 1.3 What one bet a week would need

Expected log wealth adds up bet by bet: N bets a year, each adding g_bet, give N·g_bet. For a binary bet that pays +b per $1 staked with probability p (and loses the stake otherwise), full-Kelly growth per bet is the Kelly/KL formula D(p ‖ 1/(1+b)) (track 03 §2.1). With **N ≤ 52 sequential bets a year, each bet must add 0.693/52 = 1.33% of log growth.** That requires:

| Bets a year | Payoff if right | Breakeven win rate | **Win rate needed** (half Kelly) | Edge over breakeven | Stake | Expected value per $1 staked |
|---|---|---|---|---|---|---|
| 52 | +1:1 (even money) | 50.0% | **59.4%** (58.1% at full Kelly) | +9.4 points | 9% | +19% |
| 52 | +3:1 | 25.0% | 33.3% | +8.3 | 6% | +33% |
| 52 | +10:1 (option-like) | 9.1% | 14.8% | +5.7 | 3% | +63% |
| 12 | +1:1 | 50.0% | **69.5%** | +19.5 | 20% | +39% |
| 12 | +3:1 | 25.0% | 42.7% | +17.7 | 12% | +71% |
| 4 | +1:1 | 50.0% | **83.4%** | +33.4 | 33% | +67% |

*`results/a4_per_bet_requirements_*.csv`. For +1000%/yr at 52 bets and half Kelly, the even-money win rate needed is 67.5%.*

Why these numbers are out of reach:

- **The edge per bet has to be enormous because the number of bets is small.** Growth is roughly N × edge².
  - Medallion reportedly won only **50.75%** of its trades (Robert Mercer, in Zuckerman 2019, via Cornell 2020), across millions of trades.
  - At that edge, doubling every year at full Kelly takes about **6,200 independent bets a year** (`results/a4b_*`).
  - At 52 bets a year, Medallion's edge would compound at **0.6% a year**.
- **A 59% weekly hit rate at even money is a per-bet Sharpe of 0.19, or 1.3–1.4 a year.** That is a Medallion-class result from 52 decisions a year. Nothing in this repository's 24 research tracks came close.
  - The whole evidence-gated book is worth about **+0.8 points a year over T-bills** (README, track 23).
- **The bets must be independent and sequential.**
  - Trades that overlap in time (the book's 5–90 day holds) are simultaneous bets. They share one Kelly budget (track 03 §2.4), so the effective N is smaller still.
  - Proving a 59–60% vs 50% hit rate takes about 180 trades, 3½ years at 52 a year, at 90% power (track 03 §3e).

---

## 2. Base rates: has anyone done it?

### 2.1 The best long-run records

| Record | Period | Compounded return | Worst year / drawdown | Notes | Source |
|---|---|---|---|---|---|
| **Renaissance Medallion** | 1988–2018 (31 years) | **63.3% gross, 37.8% net** (arithmetic 66.1% / 39.2%) | Net −3.2% (1989); never a negative year gross | Closed to outsiders; capped at about $10bn; fees 5% + 20% (later 44%). Gross ≥ +100% in 3 of 31 years (2000, 2007, 2008); **net ≥ +100% in 0 of 31** | Cornell (2020), Table 1, from Zuckerman (2019) |
| Buffett Partnership | 1957–1969 | 29.5% gross, **23.8% net** to partners (Dow 7.4%) | No losing year | Buffett later said he could make "50% a year on $1 million… I guarantee that" (BusinessWeek, 1999). That is the greatest investor's own ceiling for *small* money: 50%, not 100% | Buffett Partnership letters; Novel Investor; GuruFocus |
| Druckenmiller, Duquesne | 1986–2010 | about 30% a year on average | No losing year | Closed in 2010, citing the strain of keeping the record on large capital | Wikipedia; Yahoo Finance |
| Tiger Management (Robertson) | 1980–1998 | 31.7% a year net | −4% (1998), −19% (1999); closed in 2000 | | Wikipedia; track 01 |
| Seykota (one account, in *Market Wizards*) | 16 years, to about 1988 | 250,000%, about **63% a year** | Not audited | Self-reported, single account | Schwager (1989) |
| Richard Dennis's Turtles | 1984–1988 (4 years) | about 80% a year | Dennis's own funds lost heavily in 1987–88 | Four years, small group, a great trend decade | Faith (2007); Ticker Tape |
| Mulvaney Capital (a top CTA) | 2008 | **+108.9% in one year** | Maximum drawdown 45%, volatility 33% | One of the few 100%+ CTA years (also +124% in early 2024). No 100%-a-year decade | trendfollowing.com; Institutional Investor |
| Chesapeake Capital (an original Turtle's CTA) | 1988–2026 | **12.35% a year** (2,200% cumulative) | | A top trend follower over a full career | Autumn Gold and Octa Finance CTA profiles |

**What the table shows.** The best documented multi-decade records top out at about **30–40% a year net and about 60–65% gross or in a single account.** Everything at 80–100% a year lasted a few years at most (the Turtles, contest winners, Bitcoin), or was a single year (Mulvaney, Tudor's +126% in 1987, track 01).

### 2.2 Contest winners, and what happened after

The **World Cup Championship of Futures Trading** (Robbins; real-money accounts, 1984–2025; `results/c2_*`):

- **The winning return ranged from +53% to +11,376%, with a median of +252%.** It was +100% or more in 37 of 42 years and +1000% or more in 3: Casazzone in 1985 (+1,283%), Larry Williams in 1987 (turning $10,000 into $1,137,600, +11,376%) and Michelle Williams in 1997 (+1,001%).
- **Some winners repeat.** Andrea Unger won in 2008, 2009 and 2010; Mike Lundgren in 1989, 1990 and 1992; Sakaeda, Hughes, Cook, Casazzone and Seibert twice each. Real skill exists at small scale.
- **But a contest selects the maximum of hundreds of deliberately volatile accounts.**
  - In the **US Investing Championship's first half of 2026, only 17% of entrants reported a profit** (BusinessWire headline, 28 Jul 2026).
  - The same year's winners are therefore an order statistic, not a base rate.
  - We found **no audited, investable, decade-long record from any of these winners at anything like their contest rates.** Mark Minervini, for example, won the USIC in 1997 (+155%) and set a division record in 2021. These are single-year numbers on personal accounts.
- **What a winner's return means for this system:** if a contest's best account doubles or triples in a year, the typical account in the same contest loses money.

### 2.3 Perfect hindsight: single US stocks, 2003–2026

We took every US-listed stock still listed in Sept 2026 (track 07's panel, about 5,000 names), at a price of $3 or more and at least $1M of daily dollar volume, and looked at every start month (`results/c1_hindsight_stocks.csv`):

| Horizon | Share of stock-windows compounding ≥30%/yr | Share compounding **≥100%/yr** | Stocks that *ever* did ≥100%/yr over the horizon | Best window |
|---|---|---|---|---|
| 1 year | 24.7% | 3.8% | 2,429 (49%) | SNDK from Jun 2025: 50× |
| 3 years | 10.7% | 0.26% | 252 (5.7%) | Carvana from Dec 2022: 89× (347%/yr) |
| 5 years | 5.8% | 0.02% | 17 (0.4%) | Enphase from Feb 2018: 63× (129%/yr) |
| **10 years** | 1.4% | **0.00%** | **0 of 2,671** | **Nvidia from Jul 2015: 368× (81%/yr)** |

- **With perfect foresight and every dollar in the single best stock, no 10-year window reached 100% a year.**
- This sample *overstates* the odds, because it is survivors only: the stocks that went bankrupt are missing.
- It agrees with Bessembinder (2024), cited in track 07. Among US stocks with more than 20 years of history, the best annualized return ever was **Nvidia's 33.3%**.

### 2.4 How many professionals sustain even 30% a year?

- **Persistence is close to zero.** Of the US domestic equity funds in the top quartile in 2021, **0.46% stayed in the top quartile through 2025** (S&P SPIVA U.S. Persistence Scorecard, year-end 2025). The records in §2.1 are the far right tail of tens of thousands of managers.
- **30% a year for 10 years is a 13.8× decade.** Only 1.4% of single-stock 10-year windows did it even with hindsight (§2.3). The documented managers who did it for longer (Buffett's partnership, Tiger, Duquesne, Medallion net) can be listed on one hand.
- **The very best CTAs compound at 10–20% over a career.** Chesapeake made 12.35% a year (§2.1), and managed-futures funds 2007–2026 had Sharpe ratios of 0.2–0.4 (track 15).

### 2.5 Retail traders who try it

| Study | Sample | Finding |
|---|---|---|
| Barber & Odean (2000) | 66,465 US households, 1991–96 | The most active 20% earned 11.4% a year against the market's 17.9% (track 02) |
| Barber, Lee, Liu & Odean (2014) | Taiwan day traders, 1992–2006 | **Fewer than 1%** predictably earn positive returns net of fees (track 02) |
| Chague, De-Losso & Giovannetti (2020) | 19,646 Brazilian futures day traders | **97% of the 1,551 who persisted more than 300 days lost money.** Only 1.1% earned more than the minimum wage, and there was no evidence of learning |
| Barber, Huang, Odean & Schwarz (2022, *JF*) | Robinhood users, 2018–20 | Herding into attention stocks: the top stocks bought each day returned **−4.7% abnormal over 20 days** (track 02) |
| Bryzgalova, Pavlova & Sikorskaya (2023, *JF*) | US retail option trades | The aggregate retail options portfolio **lost $2.1bn from Nov 2019 to Jun 2021**, mostly to bid-ask spreads and overpaying for volatility |
| de Silva, Smith & So (2026, *Review of Finance*) | Retail options around earnings | Retail option buyers lose **5–9%** around earnings announcements on average, and **10–14%** when expected volatility is high |
| Ptak (2025), from Direxion's annual report | About 75 leveraged ETFs, year to Oct 2024 | Investors earned about $16.5bn against about $36.3bn for simply holding: **a $19.8bn gap from bad timing**. One semiconductor 3× fund saw $6.3bn of outflows during a 274% run, then $4.2bn of inflows before a 46% loss |
| BIS Bulletin 69 (2023) | Crypto-app users, 2015–2022 | **A majority of users in nearly all economies lost money on their bitcoin** |

**Evidence quality.** The Medallion, Buffett partnership, SPIVA and peer-reviewed rows are high quality. Seykota, the Turtles and contest results are self-reported or promotional (grade C in track 01's scheme). The single-stock hindsight table is survivor-biased upward.

---

## 3. The most aggressive feasible systems: what their distributions say

### 3.1 Method

Every system was rebuilt from daily data, with costs (`research/code/34-feasibility/b_aggressive_systems.py`):

- **3× Nasdaq-100 (TQQQ-like).**
  - Daily 3× the index, less a 0.9%/yr fee and 2 × (T-bill + 0.5%) financing.
  - **Validation:** the model gives **42.4% a year against TQQQ's actual 42.9%** (Feb 2010–Sep 2026), with a daily correlation of 0.9986 (`results/b0_*`).
  - "With 200-day filter": held only while the Nasdaq-100 closes above its 200-day average, otherwise T-bills. The signal is traded one day late, with 0.10% cost per switch.
- **Bitcoin trend at 100% weight.**
  - The M3 rule: weekly close above the 10-week average. It holds all capital in Bitcoin while on, and T-bills while off.
  - 0.25% cost per side.
- **2× Bitcoin (BITX/BITU-like).**
  - Daily 2×, less a 1.85%/yr fee and T-bill + 5%/yr funding (perpetual/futures basis).
  - Buy-and-hold, and with the same trend switch.
- **Concentrated momentum.**
  - The Fama-French top momentum decile (value-weighted, 1926–2026), less 2%/yr costs.
  - Plus simulated risk of holding only 5 names (50% a year of idiosyncratic volatility per stock, fat tails).
  - Unlevered, and at 2× margin (T-bill + 1.5%).
- **Rolling calls.**
  - 3-month at-the-money Nasdaq-100 calls, priced by Black-Scholes at the VXN (1.15 × realized volatility before 2001).
  - 3% of premium paid to enter, 1% to exit.
  - Either **100% of capital** every quarter, or **20% in calls and 80% in T-bills**.
- **Resampling.** A stationary block bootstrap (mean block about 6 months), 10,000 paths of 10 years, in two calibrations:
  - **History:** each underlying as it was: the Nasdaq-100 at 15.4% a year (1985–2026); Bitcoin at 60.7% a year (2015–2026; the 2010–14 phase at +134% a year is excluded); the momentum decile at 12.8% a year (1926–2026).
  - **Muted:** the same days with the underlying's drift lowered to Nasdaq-100 8%, Bitcoin 20% and momentum decile 10% a year. The strategies' signals are unchanged.

### 3.2 What actually happened (full history, no resampling)

| System | Period | CAGR | Volatility | Sharpe | Max drawdown | Calendar years ≥ +100% | Best / worst year |
|---|---|---|---|---|---|---|---|
| Nasdaq-100, 1× (reference) | 1985–2026 | 15.2% | 26% | 0.56 | −83% | 1 of 40 | 1999 +103% / 2008 −42% |
| 3× Nasdaq-100, buy and hold | 1985–2026 | 15.9% | 78% | 0.54 | **−99.98%** | 12 of 40 | 1999 +433% / 2000 −91% |
| **3× Nasdaq-100 + 200-day filter** | 1985–2026 | **20.0%** | 54% | 0.56 | **−88%** | 8 of 40 | 1999 +433% / 2000 −66% |
| Bitcoin, buy and hold | 2015–2026 | 60.7% | 67% | 1.02 | −84% | 5 of 11 | 2017 +1,337% / 2018 −74% |
| **Bitcoin trend, 100% weight** | 2015–2026 | **55.9%** | 49% | 1.11 | −71% | 3 of 11 | 2017 +822% / 2018 −58% |
| **2× Bitcoin, buy and hold** | 2015–2026 | 47.2% | 133% | 0.97 | **−99.2%** | 6 of 11 | 2017 +8,031% / 2018 −97% |
| 2× Bitcoin + trend switch | 2015–2026 | 84.2% | 98% | 1.09 | −94% | 5 of 11 | 2017 +3,628% / 2018 −86% |
| Top momentum decile | 1926–2026 | 12.8% | 23% | 0.50 | −86% | 0 of 98 | 1928 +88% / 2008 −40% |
| **Rolling calls, 100% of capital** | 1986–2025 | **wiped out** | | | **−100%** | 4 of 39 | 2009 +1,202% / first down quarter −100% |
| Rolling calls, 20% + T-bills | 1986–2025 | 12.5% | 58% | 0.46 | −91% | 4 of 39 | 1986 +184% / 2000 −56% |

*`results/b1_historical.csv`. Calls: quarterly marks, CAGR is the median over the 63 possible start days. Bitcoin including 2010–14: +134% a year buy-and-hold, and 8 of 15 years at +100% or more.*

Two things stand out:

- **Big years and big losses come in pairs.** 3× Nasdaq made +433% in 1999, then −91% in 2000. 2× Bitcoin made +8,031% in 2017, then −97% in 2018. Bitcoin made +1,337% in 2017, then −74% in 2018.
  - The 3× Nasdaq filter's +100% years (1991, 1995, 1998, 1999, 2003, 2009, 2013, 2017) came with a **20% a year** long-run result, because the losses in between were deep.
- **Even in hindsight, only Bitcoin strategies compounded at 100% a year over 3–10 years.**
  - 3× Nasdaq with the filter did it in 1.7% of rolling 3-year windows, 1.0% of 5-year windows and none of the 10-year windows.
  - The Bitcoin strategies did it only from starts in 2015–16, when Bitcoin cost $200–400.

### 3.3 Probabilities from 10,000 resampled decades

History / Muted calibration (`results/b2_bootstrap.csv`):

| System | P(≥ +100% in the next 12 months) | P(≥100%/yr over 3 years) | over 5 years | **over 10 years** | P(drawdown ≥50% within 10y) | P(drawdown ≥80%) | P(drawdown ≥95%) | Median 10-year CAGR |
|---|---|---|---|---|---|---|---|---|
| Nasdaq-100 1× (reference) | 0.7% / 0.2% | 0% / 0% | 0% / 0% | 0% / 0% | 41% / 51% | 2% / 5% | 0% / 0.1% | 15.6% / 8.5% |
| 3× Nasdaq-100, buy and hold | 24% / 13% | 9.6% / 3.2% | 4.9% / 0.8% | 0.8% / 0.0% | 100% / 100% | 79% / 85% | 37% / 49% | 18.9% / −2.2% |
| **3× Nasdaq-100 + 200-day** | **15% / 8%** | 3.3% / 1.0% | 1.2% / 0.2% | **0.1% / 0.0%** | 97% / 99.5% | **31% / 51%** | 1.8% / 6.9% | **20.1% / 3.6%** |
| Bitcoin, buy and hold (reference) | 38% / 23% | 31% / 13% | 27% / 7.7% | 19% / 2.2% | 100% / 100% | 49% / 80% | 2.7% / 20% | 59.8% / 19.1% |
| **Bitcoin trend, 100% weight** | **32% / 23%** | 24% / 12% | 19% / 7.0% | **11% / 2.0%** | 87% / 98% | **7.7% / 21%** | 0% / 0.4% | **54.8% / 31.2%** |
| **2× Bitcoin, buy and hold** | **43% / 28%** | 36% / 16% | 33% / 10% | **26% / 3.7%** | 100% / 100% | **100% / 100%** | **87% / 98%** | **46.9% / −18.8%** |
| 2× Bitcoin + trend switch | 43% / 33% | 43% / 25% | 42% / 20% | 41% / 12% | 100% / 100% | 87% / 97% | 24% / 49% | 83.1% / 31.1% |
| Top momentum decile (reference) | 0.5% / 0.4% | 0% / 0% | 0% / 0% | 0% / 0% | 38% / 44% | 0.7% / 1.4% | 0% / 0% | 13.0% / 10.1% |
| **Concentrated momentum, 5 stocks** | **3.1% / 2.3%** | 0.1% / 0% | 0% / 0% | **0% / 0%** | 74% / 79% | 7.5% / 11% | 0.1% / 0.2% | 10.1% / 7.3% |
| Concentrated momentum, 5 stocks, 2× margin | 16% / 14% | 4.0% / 3.0% | 1.0% / 0.8% | 0% / 0.1% | 100% / 100% | 78% / 82% | 26% / 33% | 4.3% / −0.9% |
| **Rolling calls, 100% of capital** | **15% / 6.9%** | 0.9% / 0.1% | 0% / 0% | **0% / 0%** | 100% / 100% | 100% / 100% | **100% / 100%** | −100% / −100% |
| Rolling calls, 20% + 80% T-bills | 11% / 4.7% | 1.9% / 0.2% | 0.5% / 0% | 0% / 0% | 80% / 96% | 15% / 48% | 0.5% / 6.3% | 12.8% / −5.7% |

"≥100%/yr over N years" means the path ends at 2^N times its start (8× over 3 years, 32× over 5, 1,024× over 10). The CSV also gives the probability of ever falling to 50%, 20% or 5% of the starting stake, the median maximum drawdown, and the chance of reaching 10× within 10 years.

**The Bitcoin rows need a capacity check.** For any Bitcoin strategy to compound at 100% a year for 10 years, Bitcoin itself must rise enormously:

| Bitcoin strategy | P(100%/yr for 10 years), History / Muted | **Same, on paths where Bitcoin itself rises at most 10× (to about a $17tn market cap, about 3% of world wealth)** |
|---|---|---|
| Buy and hold | 19% / 2.2% | **0.0% / 0.0%** |
| Trend, 100% weight | 11% / 2.0% | **0.0% / 0.0%** |
| 2× buy and hold | 26% / 3.7% | **0.0% / 0.0%** |
| 2× + trend switch | 41% / 12% | **0.0% / 0.1%** |

- Bitcoin was $84,392 on 27 Sep 2026, a market capitalization of about $1.7 trillion.
- Repeating its 2015–2026 multiple (268×) would put it at about **$450 trillion, roughly all the wealth in the world** (UBS: $471tn at end-2024).
- **The "History" column for Bitcoin describes the past. It is not a forecast.** Every 10-year 100%-a-year path requires Bitcoin to become a double-digit share of world wealth.

**Reading the table:**

1. **A single +100% year is common for leveraged or crypto systems**: 8–43% a year. That is why the target *feels* reachable. It is the same fact as a coin landing heads.
2. **Sustaining it is not.**
   - Over 10 years, every non-crypto system is at 0.0–0.8% (History) and 0.0–0.1% (Muted).
   - The crypto systems get there only by extrapolating Bitcoin's adoption boom.
3. **The price of trying is written in the drawdown columns.**
   - 3× Nasdaq with the filter still has a 31–51% chance of an 80% drawdown within 10 years.
   - 2× Bitcoin has a 100% chance of an 80% drawdown and an 87–98% chance of a 95% drawdown.
   - All-in rolling calls lose everything, with certainty, at the first quarter that ends below the strike.
4. **The trend switches' good numbers assume their 2015–2026 timing repeats.**
   - The Bitcoin 10-week switch has an alpha t-statistic of 0.24 (design §3 M3), so its timing value is not statistically established.
   - The Muted rows for the trend versions are therefore still optimistic.

---

## 4. 1000% a year

### 4.1 What it compounds to

$100,000 compounded (`results/a5_compounding_vs_world_wealth.csv`). World wealth: $471 trillion at end-2024 (UBS Global Wealth Report 2025), about $520 trillion at end-2025 after +10.8% (UBS Global Wealth Report 2026).

| Annual return | 5 years | 10 years | 20 years | 30 years |
|---|---|---|---|---|
| +10% | $161k | $259k | $673k | $1.7M |
| +30% | $371k | $1.4M | $19M | $262M |
| +50% | $759k | $5.8M | $333M | $19bn |
| **+100%** | $3.2M | **$102M** | **$105bn** | **$107 trillion (21% of world wealth)** |
| **+1000%** | **$16bn** | **$2.6 quadrillion (5× world wealth)** | $6.7 × 10²⁵ (130 billion × world wealth) | 3 × 10²¹ × world wealth |

- **1000% a year cannot be sustained for even 10 years by anyone, at any skill level:** the money does not exist.
- **100% a year hits the same wall in about 25–30 years.** Capacity is also why Medallion stopped at about $10bn and why Druckenmiller closed his fund.

### 4.2 What produces even one 1000% year

**Where it happened:**

- **Bitcoin, all-in:** 2011 (+1,471%), 2013 (+5,286%) and 2017 (+1,337%). There has been none since 2017. Each was followed by a crash: −93% peak to trough inside 2011 itself (track 07), −56% in 2014 and −74% in 2018.
- **2× Bitcoin:** +4,395% in 2013 and +8,031% in 2017, followed by −90% and −97%.
- **All-in rolling calls:** +1,202% in 2009. The same strategy is wiped out by its first losing quarter.
- **The futures contest:** 3 of 42 winners (§2.2).
- **The resampled systems:** 2× Bitcoin shows +1000% in 10% (History) or 6% (Muted) of years. No Nasdaq, momentum or 20%-call system produced one.

**The theoretical ceiling (Browne 1999; track 03 §3f).** The most probability any strategy with Sharpe θ can put on "11× in one year" is Φ(Φ⁻¹(e^r/11) + θ). It gets there only by replicating an all-or-nothing digital option, so the other outcomes end near zero:

| Sharpe of the best available strategy | Max P(+1000% in a year) | Max P(two in a row) | Max P(five in a row) | P(+1000% in a year) at full Kelly | at half Kelly |
|---|---|---|---|---|---|
| 0 (a fair game) | 9.5% | 0.9% | 0.00% | 0% | 0% |
| 0.5 (a good strategy) | 20.8% | 4.3% | 0.04% | 0.0% | 0.0% |
| 1.0 (elite) | 37.7% | 14.2% | 0.76% | 3.2% | 0.0% |
| 2.0 (Medallion gross) | 75.4% | 56.8% | 24% | 43% | 20% |

**Bet sequences that produce one 11× year** (`results/a6b_*`):

| Sequence | P(≥ 11×) | Otherwise |
|---|---|---|
| 4 all-in double-or-nothing bets on a fair coin | 6.3% | lose everything |
| 4 all-in double-or-nothing bets with a real 60% edge | 13.0% | lose everything (87%) |
| 52 weekly bets, each needing +4.72%, with no losing week | a 52-week winning streak | at a 60% weekly hit rate, the chance is 3 × 10⁻¹² |
| 1 all-in bet on a fairly priced option that pays 11× | about 9% or less | lose everything |

**Conclusion.** A 1000% year is a lottery outcome, reached by concentrating everything on one or a few bets. It is survivable only with money the owner can lose completely, and it cannot be repeated.

---

## 5. The honest recommendation

### 5.1 The objective the system should use instead

**Maximise the expected long-run (log) growth rate of total wealth, after costs and estimated taxes, subject to a drawdown limit the owner chooses: P(wealth ever falls more than D from its start or peak) ≤ 10%.** Report "P(10× by year T)" and the median outcome. Never target or promise a rate of return.

- **This is track 03's objective, made explicit.** It is the only objective that:
  - maximizes the *median* outcome (Ethier 2004);
  - minimizes the expected time to any large goal, such as 10× (Breiman 1961);
  - and keeps the owner out of the ruin states that "maximize return" leads to (track 03 §1).
- **The drawdown limit converts directly into a leverage cap.** Risk-constrained Kelly (Busseti, Ryu & Boyd 2016; track 03 §2.7): to keep P(ever falling to 1 − D of the start) ≤ 10%, size at no more than c = 2/(1 + λ) of Kelly, where λ = ln 0.10 / ln(1 − D).
- **Resulting median growth and years to 10×** (`results/a7_drawdown_constrained_growth.csv`):

| Owner's loss tolerance | Max Kelly multiple | Sharpe 0.4 (stock market) | Sharpe 0.5 (a good diversified system) | Sharpe 0.75 (excellent, rare) | Sharpe 1.0 (elite) | Sharpe 2.0 (Medallion gross) |
|---|---|---|---|---|---|---|
| −20% | 0.18 | 7% (35 years to 10×) | 8% (29y) | 14% (18y) | 22% (11y) | 98% (3y) |
| −30% | 0.27 | 8% (30y) | 10% (24y) | 19% (14y) | 31% (8y) | 163% (2y) |
| −50% | 0.46 | 10% (24y) | 14% (18y) | 27% (10y) | 48% (6y) | 331% (2y) |
| −80% | 0.82 | 12% (20y) | 17% (14y) | 37% (7y) | 69% (4y) | 622% (1y) |

**The table in one sentence:** 100% a year sits in the Medallion column, whatever drawdown the owner accepts. At the Sharpe ratios this system can credibly reach (0.4–0.75), the answer is 7–37% a year, and 10× in 7–35 years.

### 5.2 The realistic "get rich" path

Median outcomes from the resampled distributions (§3.3). Years to 10× = ln 10 / ln(1 + median CAGR):

| Path | Median CAGR, History / Muted | Median years to 10× | P(10× within 10 years) | P(drawdown ≥ 50% / ≥ 80% within 10y), Muted |
|---|---|---|---|---|
| The book as designed (M1–M3, W10) | about 5% (README) | about 47 | about 0% | about 0% / 0% (drawdowns of about 10–15% expected, README) |
| Nasdaq-100 1× held | 15.6% / 8.5% | 16 / 28 | 16% / 3% | 51% / 5% |
| Top momentum decile (a factor ETF) | 13.0% / 10.1% | 19 / 24 | 9% / 4% | 44% / 1% |
| **3× Nasdaq-100 + 200-day filter** | 20.1% / 3.6% | 13 / 65 | 52% / 18.5% | 99.5% / 51% |
| **Bitcoin trend, 100% weight** | 54.8% / 31.2% | 5 / 8.5 | 91% / 72% | 98% / 21% |

**How to read it:**

- **The highest credible CAGR for a whole portfolio is roughly 10–20% a year before tax.** That means 10× in about 12–24 years, and it already requires accepting 50% drawdowns.
- **The Bitcoin line is the only one that looks "quick".**
  - It assumes Bitcoin compounds at 20% a year *and* that the trend switch keeps its in-sample timing.
  - Even then it has a 98% chance of a 50% drawdown and a 21% chance of an 80% drawdown within 10 years.
  - It is a single, correlated bet on one asset, not an engine.
- **The biggest levers are outside the trading rules:**
  - time;
  - savings added to the account;
  - tax deferral (track 03 §3g: 5.5× vs 12.7× over 20 years at 15% pre-tax);
  - a long-horizon core held outside this system (README).

### 5.3 Decisions for the owner

1. **The objective.** Accept "maximum growth subject to a drawdown limit" in place of "100% a year baseline, 1000% stretch". The system will report P(2×), P(10×) and the median outcome by date in every monthly review.
2. **Drawdown tolerance D:** choose −20%, −30%, −50% or −80%. This sets the maximum Kelly multiple (0.18 / 0.27 / 0.46 / 0.82) and, through the drawdown governor, the total stress budget.
   - Default suggestion: **−30%**. It keeps sizing near quarter Kelly (0.27) and fits the design's existing drawdown governor, which cuts new risk from a −10% drawdown and stops it at −40% (track 03 §6D).
3. **Leverage.**
   - (a) None, as now (design: gross ≤ 1.0×).
   - (b) Up to 1.3–1.5× only with the drawdown governor (track 03 §6C).
   - (c) A **3× Nasdaq + 200-day sleeve capped at a stated share of NAV.** Sized so that a −88% sleeve loss, its historical worst, costs at most D; for example, 10% of NAV costs at most 9%.
   - Full-portfolio 3× is incompatible with any D below −80%.
4. **Crypto weight.**
   - Now: M3 at ≤3% of NAV.
   - Options: 10% or 25%, sized so that a −75% to −84% Bitcoin drawdown (its record) fits inside D. With D = −30%, the Bitcoin sleeve can be at most about 35% even with nothing else at risk.
   - A 100% Bitcoin-trend portfolio is a D ≈ −70% to −80% choice.
5. **One recommendation a week** can stay as a cap. It does not bind: the evidence-gated book sends about 20 trades a year. The binding limit is edge, not the number of emails (§1.3).

### 5.4 What the system should say, in plain English

- **In the monthly review:**
  - "At our measured Sharpe of S, the most any strategy could give is P = Φ(Φ⁻¹(e^{rT}/10) + S√T) of reaching 10× in T years, and the strategy that achieves that ends near zero otherwise."
  - The median projected wealth, the 5th percentile, and P(drawdown ≥ D).
- **When the owner asks for 100% a year:** "No documented investor has compounded 100% a year after fees for a decade. Medallion's best net year was +98.5%. Here is what your drawdown tolerance buys instead."
- **Never** send a trade because it could make +100% or +1000%. Rank and size by expected log growth (track 03 §6A), with the hard caps in design §4.

---

## 6. Limitations

| Claim | Confidence | Main caveat |
|---|---|---|
| Growth math (§1.1, §1.3, §4, §5.1) | High (theorems) | Assumes lognormal returns, known parameters and continuous rebalancing. Fat tails and estimation error make every requirement *harder*, not easier (track 03 §3c) |
| Medallion, SPIVA, peer-reviewed retail studies | High | Medallion's figures are reported, not audited, and the annual Sharpe mixes risk with year-to-year changes in edge |
| Manager and contest records | Medium to low | Self-reported (Seykota, the Turtles), promotional (contests), survivorship among famous names |
| Hindsight stock table | Medium | Survivors only (upward bias); Yahoo adjusted prices, with windows containing a +300% month dropped as likely data errors (removes TDS and CHRD artifacts, and possibly a few genuine spikes) |
| Aggressive-system distributions | Medium | In-sample signals; block bootstrap loses some regime structure; the History calibration embeds 1985–2026 Nasdaq and 2015–2026 Bitcoin booms; Muted drift levels are judgments; the 5-stock momentum noise is simulated, not a real 5-stock backtest; calls use modeled implied volatility before 2001 and quarterly marks (intra-quarter drawdowns understated) |

---

## Sources

**Records and base rates**
- Cornell, B. (2020). *Medallion Fund: The Ultimate Counterexample?* SSRN 3504766 (Table 1: Medallion gross/net annual returns 1988–2018, from Zuckerman 2019). https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3504766 ; text used: https://community.portfolio123.com/uploads/short-url/wZJco8G9Xd3diZqEN2YNc3RdaH.pdf
- Zuckerman, G. (2019). *The Man Who Solved the Market.* Portfolio/Penguin (Medallion returns; Mercer's 50.75% hit rate).
- Buffett Partnership results (29.5% gross, 23.8% net, Dow 7.4%, 1957–1969): https://novelinvestor.com/notes/buffett-partnership-letters-by-warren-buffett/ ; Buffett's 1999 BusinessWeek "50% a year on $1 million" remark: https://www.gurufocus.com/news/403899/warren-buffetts-secret-to-making-50-a-year
- Druckenmiller / Duquesne (about 30% a year, no losing year, 1986–2010): https://en.wikipedia.org/wiki/Stanley_Druckenmiller ; https://finance.yahoo.com/news/hedge-fund-legend-made-30-210108147.html
- Tiger Management (31.7% a year net, 1980–1998): https://en.wikipedia.org/wiki/Tiger_Management
- Schwager, J. (1989). *Market Wizards* (Seykota, 250,000% over 16 years): https://en.wikipedia.org/wiki/Ed_Seykota
- Turtles, about 80% a year over four years: Faith, C. (2007), *Way of the Turtle*; https://tickertape.tdameritrade.com/trading/turtle-traders-richard-dennis-15855
- Mulvaney Capital (+108.87% in 2008; maximum drawdown 45.2%): https://www.trendfollowing.com/pdfs/mulvaney.pdf ; 2024: https://www.institutionalinvestor.com/article/2d36as2c091fx1ebovxmo/premium/this-fund-is-up-124-percent-this-year
- Chesapeake Capital (12.35% a year since 1988): https://www.autumngold.com/Advisor/cta_profile.php?id=388 ; https://www.octafinance.com/commodity-trading-advisors/chesapeake-capital-corporation/
- World Cup Championship of Futures Trading historical standings (fetched 29 Sep 2026): https://www.worldcupchampionships.com/world-cup-trading-championship-historical-standings ; Larry Williams: https://en.wikipedia.org/wiki/Larry_R._Williams
- United States Investing Championship, "First Half Results – 17% Report Profits" (BusinessWire, 28 Jul 2026): https://www.businesswire.com/news/home/20260728048545/en/United-States-Investing-Championship-First-Half-Results-17-Report-Profits ; Minervini's 2021 record: https://www.businesswire.com/news/home/20220124005241/en/2021-United-States-Investing-Championship-Winners-%E2%80%94-Minervini-Smashes-Record
- S&P Dow Jones Indices, *U.S. Persistence Scorecard Year-End 2025*: https://www.spglobal.com/spdji/en/documents/spiva/persistence-scorecard-year-end-2025.pdf
- UBS Global Wealth Report 2025 ($471tn, 56 markets): https://www.ubs.com/global/en/media/display-page-ndp/en-20250618-gwr-2025.html ; 2026 (+10.8% in 2025): https://www.ubs.com/global/en/media/display-page-ndp/en-20260630-gwr-2026.html

**Retail outcomes**
- Chague, F., De-Losso, R., Giovannetti, B. (2020). Day Trading for a Living? SSRN 3423101. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101
- Bryzgalova, S., Pavlova, A., Sikorskaya, T. (2023). Retail Trading in Options and the Rise of the Big Three Wholesalers. *Journal of Finance* 78(6): 3465–3514. https://onlinelibrary.wiley.com/doi/full/10.1111/jofi.13285
- de Silva, T., Smith, K., So, E. (2026). Losing is Optional: Retail Option Trading and Expected Announcement Volatility. *Review of Finance* 30(2). https://academic.oup.com/rof/article/30/2/489/8301159
- Ptak, J. (2025). Leveraged-ETF investors' dollar-weighted results, from Direxion's annual report: https://jeffreyptak.substack.com/p/leveraged-etf-investors-scored-gains
- Cornelli, G., Doerr, S., Frost, J., Gambacorta, L. (2023). Crypto shocks and retail losses. BIS Bulletin 69. https://www.bis.org/publ/bisbull69.htm
- Barber & Odean (2000); Barber, Lee, Liu & Odean (2014); Barber, Huang, Odean & Schwarz (2022): see track 02's reference list.

**Math**
- Kelly (1956); Breiman (1961); Merton (1969); Thorp (2006); Ethier (2004); Browne (1999); Busseti, Ryu & Boyd (2016); Cover & Thomas (2006): full references in track 03.
- Bessembinder, H. (2024). Which U.S. Stocks Generated the Highest Long-Term Returns? SSRN 4897069 (via track 07).

**Data**
- Kenneth R. French Data Library: daily T-bill, and "10 Portfolios Formed on Prior (12-2) Return", daily (CRSP through Aug 2026). https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
- Yahoo Finance via yfinance: ^NDX, TQQQ, ^VXN. Coin Metrics community API: BTC PriceUSD from Jul 2010.
- Track 07's US-survivor month-end panel (Yahoo, 2003–2026).

## Appendix: reproducibility map

| Section | Script (`research/code/34-feasibility/`) | Outputs (`results/`) |
|---|---|---|
| 1.1–1.3, 4, 5.1 | `a_growth_math.py` | `a1`–`a7` |
| 1.2 (Medallion), 2.1 | `a_growth_math.py` | `a3_medallion_summary`, `a3b_medallion_annual` |
| 3, 5.2 | `b_aggressive_systems.py` | `b0_letf_validation`, `b1_historical`, `b2_bootstrap`, `b2b_calibration`, `b3_calendar_years` |
| 2.2, 2.3 | `c_base_rates.py` | `c1_hindsight_stocks`, `c2_world_cup_winners`, `c2b_world_cup_summary` |

Shared helpers are in `common34.py` (seed 20260929; data caches in the session scratchpad). `run_all.py` runs everything.
