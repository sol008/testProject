# 02 — What the academic evidence says actually works (and what destroys retail traders)

*Track 02 of the trade-recommender research programme. Prepared 2026-09-28.*
*Own data checks: Ken French Data Library (CRSP vintage 2026-08), Shiller data (legacy file to 2023-09, new file to 2024-09), federalreserve.gov FOMC calendars (1994-2026), Yahoo Finance (ETFs, ^GSPC, ^VIX, BTC-USD to 2026-09-25). Code and outputs: `research/code/02-academic/`.*

---

## TL;DR

1. **Most published anomalies are "real" in-sample but only about half survive out of sample, and very little survives realistic retail costs.** Post-publication returns are 58% lower (McLean & Pontiff 2016). Data-mined and peer-reviewed signals both keep about 50% of their in-sample return (Chen, Lopez-Lira & Zimmermann 2025). After spreads and post-publication decay, the average anomaly nets about **4 bp/month**, and the best about 10 bp (Chen & Velikov 2023). Rule of thumb: **halve any published premium, then subtract costs and taxes.**
2. **My Ken French checks (data to Aug 2026) confirm heavy decay since 2000:**

   | Factor | Earlier sample | Recent / post-publication | Other notes |
   |---|---|---|---|
   | UMD momentum | 7.4%/yr, 1927-2026 | 2.2%/yr, 2000-2026 (t = 0.7) | Still 58% below its Nov-2008 peak |
   | HML value | 4.2%/yr full sample | −0.6%/yr, 2010-2026 | 58% drawdown 2006-2020; still 32% under water |
   | SMB size | 3.4%/yr before Banz (1981) | 0.3%/yr after | Never regained its 1983 peak |
   | Short-term reversal | 10.9%/yr before publication | 0.1%/yr, 2010-2026 (gross) | |
   | Turn-of-month | Up to 100% of the equity premium before 1987 | 23%, 2009-2026 (t = 0.35) | |
   | Pre-FOMC day | 0.36% per meeting day, 1994-2011 | 0.09% after 2011 (t = 0.3) | |

   Quality/profitability (RMW) held up best: CAPM alpha 6.0%/yr post-2000, t = 3.3.
3. **Live, net-of-fee factor ETFs mostly lagged SPY after launch.** Value −0.9pp/yr, size −3.0pp, min-vol −3.6pp, spin-offs −1.2pp, buybacks −0.4pp, IPOs −5.9pp, concentrated value −5.0pp and concentrated momentum −3.8pp. Only momentum ETFs beat it (MTUM +1.3pp, SPMO +4.4pp), largely through their mega-cap tech tilt. Managed futures (AQMIX) returned 4.6%/yr since 2010 with zero beta: a diversifier, not a return engine.
4. **The equity premium is the only large, robust, cheap premium:** about 8%/yr excess, Sharpe about 0.45 since 1926. It is the only premium that can compound to big multiples. Factor tilts add at most about 0–2%/yr net, with decade-long droughts.
5. **Trend filters and vol-scaling mainly cut drawdowns, not raise returns.** A 10-month moving-average filter on the US market (about 1.5 switches/yr) halved the maximum drawdown (−84% to −44%, 1927-2026) for about 0.5–1pp/yr lower CAGR. In the V-shaped 2010-2026 market it cost about 4–5pp/yr. It is most useful as the risk-control layer if the user wants leverage. Vol-managed market timing (Moreira-Muir) does not survive real-time implementation (Cederburg et al. 2020; my replication gives α = 1.1%, t = 1.1).
6. **Timing signals that fail:** CAPE predicts 10-year returns in-sample (R² about 0.29) but not usefully out of sample (OOS R² +0.05; −0.25 since 1990). A CAPE switching rule lost 2.5pp/yr real against buy-and-hold over 1891-2023. "Buy after a crash" has helped: median 1-year return +26% after the first −20% close, against +14% unconditionally. But there are only 16 episodes, and in 1929 a further −78% followed.
7. **Retail behaviour is the biggest, most reliable "anti-edge".** The most active 20% of US households earned 11.4%/yr against the market's 17.9% (Barber & Odean 2000). Fewer than 1% of day traders are predictably profitable (Barber et al. 2014). 97% of persistent Brazilian day traders lost money (Chague et al. 2019). Robinhood herding stocks returned −4.7% over 20 days (Barber et al. 2022). Retail favourites among options (weeklies) carry about 12.6% spreads and lose on average (Bryzgalova et al. 2023). Lottery-like stocks underperform by more than 1%/month (Bali et al. 2011). The objective "few trades" is therefore strongly evidence-aligned.
8. **Skewness decides the "high % return" part (Bessembinder 2018, 2023).** Most stocks (55–57%) underperform T-bills over their lives, and 2.4–4% of firms create all net wealth. Concentration raises the chance of a huge winner but lowers the median outcome. The same logic applies to leverage and options.
9. **Base rates for "+1000%" (11×):**

   | Strategy (US, 1927-2026) | 5 years | 10 years | 20 years |
   |---|---|---|---|
   | Unlevered market | Never | Never | 28% of windows |
   | 3× levered, buy-and-hold | | 28% of windows, with a 19% chance of a 10-year loss | |
   | 3× levered with trend filter | | 18%, with a 5% chance of loss | |

   Any honest system must frame the target with a horizon and a probability, not as an expectation.
10. **Design consequence.** The core is low-cost equity beta. The key choices are sized leverage plus a slow trend and drawdown risk overlay. A few slow satellites are allowed (vol-aware momentum, quality, a managed-futures fund, and possibly opportunistic insider buying after our own OOS test). There is a hard "never recommend" list (Section 8). Monthly self-calibration must use Bayesian shrinkage and long evaluation windows, because a Sharpe-0.4 strategy needs about 25 years of data to reach t = 2.

---

## 1. How to read this report

**Objective fit.** The user wants the highest percentage return with as few trades as possible, executed manually. An edge fits if it:
- has a large absolute premium, not just a high Sharpe ratio;
- needs little turnover;
- survives retail costs and US taxes;
- can be bought as a long-only or ETF implementation;
- does not carry ruin-level tail risk unless that risk is explicitly sized.

**Evidence grades** used below:

| Grade | Meaning |
|---|---|
| A | Replicated across periods, markets or asset classes, and positive after publication |
| B | Replicated, but decayed ≥50% or contested |
| C | Single-study, in-sample or practitioner backtest |
| X | Negative expected value for a retail investor (an "anti-edge") |

**Verdicts:**

| Verdict | Meaning |
|---|---|
| Core | Default building block |
| Satellite | Small, optional allocation or a risk-control feature, with an explicit size cap |
| Avoid | Never recommend, or use only as a negative screen |

**Biases flagged throughout:**
- Survivorship: the US is the "winner" market; ETF lists omit closed funds.
- Look-ahead: full-sample scaling constants and full-sample breakpoints.
- Data-mining: many rules tried; I report only canonical, pre-published rule parameters.
- Small samples: bear-market episodes, crypto.
- Overlapping windows: CAPE regressions and rolling base rates overstate the number of independent observations.

All long-short factor numbers in Section 3 are **gross** of costs unless labelled otherwise.

---

## 2. The replication and decay literature

### 2.1 What the meta-studies say

| Study | Sample | Headline finding | What it means for us |
|---|---|---|---|
| McLean & Pontiff (2016, JF) | 97 US predictors | Returns **26% lower out-of-sample** (pre-publication) and **58% lower post-publication**; about 32% is attributable to publication-informed trading. Decay is larger for high in-sample returns; residual returns sit in illiquid, high-idiosyncratic-risk stocks | Treat published premia as roughly 2× the future premium |
| Harvey, Liu & Zhu (2016, RFS) | 316 factors | Multiple testing means a new factor needs **t > 3.0**, not 2.0 | Our own discovered signals must clear t ≥ 3 |
| Hou, Xue & Zhang (2020, RFS) | 452 anomalies | With NYSE breakpoints and value weights, **65% fail t > 1.96**, **82% fail t > 2.78**; 96% of "trading frictions" anomalies fail; survivors are much smaller than originally reported | Microcap and equal-weight results do not transfer to implementable portfolios |
| Jensen, Kelly & Pedersen (2023, JF) | 153 factors, 93 countries | Replication rate 55.6% on raw returns (OLS); **82.4% on CAPM alpha** with Bayesian shrinkage (75.6% after a Benjamini-Yekutieli multiple-testing correction); 13 themes; works internationally; **83% of factors positive after the original sample, but attenuated**, "somewhat stronger than predicted". A 2.78-t investor would wait about 31 years before investing | Factors are not fake, but post-sample alphas are smaller. Use shrinkage, not naive backtests |
| Chen & Zimmermann (2022, CFR) | 319 characteristics | Reproduced **98% of the 161 clearly significant predictors** (t > 1.96); slope of reproduced on original t = 0.88 | Reproducibility is fine; the issue is decay and costs, not coding errors |
| Chen, Lopez-Lira & Zimmermann (arXiv 2212.10317, v7 Dec 2025) | 29,000 mined accounting ratios versus published predictors | Mining for t > 2 gives predictability similar to peer review; **for both, about 50% remains post-sample**; theory-based papers do not do better | An economic story does not protect against decay. Haircut everything by about 50% |
| Chen & Velikov (2023, JFQA) | 204 anomalies | After effective spreads, post-publication decay and the post-2005 trading era, the average anomaly nets **about 4 bp/month**; the best about 10 bp/month. Anomaly legs turn over about 40%/month in wide-spread stocks | Net anomaly alpha for a retail trader is about 0.5–1.2%/yr before taxes |
| Novy-Marx & Velikov (2016, RFS) | 23 anomalies | Strategies with **<50% monthly one-sided turnover** mostly keep significant net spreads; high-turnover ones mostly do not; a buy/hold band is the best cost mitigation | Prefer slow signals; add hold bands |
| Patton & Weller (2020, JFE) | US mutual funds | After implementation costs, typical funds earn **low returns to value and none to momentum** | Paper momentum does not equal realised momentum |
| Chordia, Subrahmanyam & Tong (2014, JAE) | Prominent anomalies | Anomaly returns **roughly halved after decimalization** (2001), linked to hedge-fund AUM and liquidity | Decay is structural and not reversing |
| Green, Hand & Zhang (2017, RFS) | 94 characteristics | 12 independent predictors in 1980-2014 overall, but **only 2 since 2003**; hedge returns outside microcaps insignificant since 2003 | The cross-section got much more efficient after about 2003 |

**Synthesis.** The "replication crisis" debate is mostly semantic. Factors replicate in-sample and mostly keep a positive sign out of sample (JKP), but the investable premium after publication, costs and competition is about one-third to one-half of the paper number. For high-turnover anomalies it is about zero after costs. For one retail person, **the expected net value of a typical published cross-sectional anomaly is roughly 0–1%/yr before taxes**.

### 2.2 Statistical power: why "monthly self-improvement" cannot pick strategies

The years of data needed for a strategy's mean return to reach a given t-statistic are (t / Sharpe)²:

| Sharpe | Years for t = 2 | Years for t = 3 |
|---|---|---|
| 0.2 | 100 | 225 |
| 0.3 | 44 | 100 |
| 0.4 | 25 | 56 |
| 0.5 | 16 | 36 |
| 0.8 | 6 | 14 |
| 1.0 | 4 | 9 |

The standard error of a Sharpe ratio estimated from 36 months of data is about 0.58. One month, or even three years, of live results cannot tell a working factor from a dead one. Monthly calibration should update costs, risk and volatility estimates, and error checks, not which strategies are in or out (see Section 8).

---

## 3. My own verification (Ken French and public data, through Aug–Sep 2026)

Scripts are in `research/code/02-academic/` and outputs in `.../results/`.

### 3.1 Factor premia before and after publication (long-short, gross, monthly rebalanced)

| Factor | Full sample: mean / Sharpe / t | Pre-publication mean (t) | Post-publication mean (t) | 2000–2026 mean (t) | 2010–2026 mean | Max drawdown (compounded) |
|---|---|---|---|---|---|---|
| Mkt-RF (1926-2026) | 8.3% / 0.45 / 4.6 | n/a | n/a | 7.6% (2.5) | 13.1% | −85% (1929-32) |
| SMB size (Banz 1981) | 2.0% / 0.18 / 1.8 | 3.4% (2.2) | **0.3% (0.2)** | 1.3% (0.6) | −0.9% | −55% from 1983-07, **never recovered** |
| HML value (FF 1992) | 4.2% / 0.34 / 3.4 | 5.3% (3.4) | **2.1% (1.1)** | 2.6% (1.1) | −0.6% | −58% (2006-12 to 2020-09); still −32% at 2026-08 |
| UMD momentum (Jegadeesh-Titman 1993) | 7.4% / 0.45 / 4.5 | 8.8% (4.4) | **4.6% (1.6)** | 2.2% (0.7) | 3.0% | −78% (1932-39); −58% (2008-09), **not recovered** |
| RMW profitability (Novy-Marx 2013; data from 1963) | 3.0% / 0.38 / 3.0 | 3.3% (3.0) | 2.0% (0.9) | **4.3% (2.2)** | 1.9% | −42% (1998-2000) |
| CMA investment (Titman-Wei-Xie 2004; data from 1963) | 2.9% / 0.41 / 3.2 | 4.4% (3.8) | **0.2% (0.1)** | 2.7% (1.8) | 0.3% | −28% (2022-25) |
| STREV 1-month reversal (1990) | 7.5% / 0.63 / 6.3 | 10.9% (7.4) | **1.6% (0.8)** | 1.6% (0.6) | 0.1% | −40% (2020-26) |
| LTREV long-term reversal (1985) | 3.4% / 0.28 / 2.8 | 4.9% (2.7) | **1.3% (0.9)** | 0.7% (0.4) | −1.4% | −54% (2004-20) |

CAPM alphas since 2000:
- UMD: 5.2%/yr (t 1.95), helped by its negative market beta.
- RMW: 6.0% (t 3.3), the strongest survivor.
- HML: 2.9% (t 0.9).
- SMB: 0.0%.
- STREV: −0.5%.

Share of rolling 10-year windows in which the factor averaged below zero:
- HML 13%, UMD 9%, SMB 32%, LTREV 34%.
- The market itself: 7.5%.

**Caveat.** With factor volatility of about 12%, the standard error of a 26-year mean is about 2.3pp/yr. Post-2000 numbers are consistent with both "halved" and "gone". The live and literature evidence together favour "about halved, and not reliably positive after costs".

### 3.2 Momentum: crashes, conditionality, vol-scaling, long-only

- **Crashes.** The worst UMD months were Aug 1932 (−52.6%, market +37%), Jul 1932 (−45.6%), Apr 2009 (−34.4%) and Jan 2023 (−16.2%). All occurred during sharp market rebounds.
- **Daniel & Moskowitz (2016) replicated.** Define a "bear state" as a negative past-24-month market return. In bear states UMD averages −9.3%/yr, against +10.5%/yr otherwise. In bear-state months when the market rises, UMD averages **−4.05% per month**.
- **Vol-scaling (Barroso & Santa-Clara 2015; 12% target, 126-day realised vol).** Sharpe rises from 0.45 to 0.87 (1927-2026) and from 0.13 to 0.40 (2000-2026). Max drawdown falls from −78% to −43%. The improvement survives post-2000, but the base premium is now small (scaled UMD returned about 5%/yr in 2000-2026).
- **Long-only top decile (VW, gross).**

  | Period | Top-decile CAGR | Market CAGR | Alpha (t) | Top-decile Sharpe | Market Sharpe |
  |---|---|---|---|---|---|
  | 1927-2026 | 16.8% | 10.3% | 6.5% (5.3) | | |
  | 2000-2026 | 10.6% | 8.5% | 2.3% (0.95) | 0.48 | 0.48 |
  | 2010-2026 | 17.4% | 14.3% | 1.3% (0.5) | 0.77 | 0.88 |

  Turnover costs (monthly rebalancing) are not deducted. The post-2000 edge is statistically indistinguishable from zero.
- **Value + momentum (50/50).** Correlation −0.41 over the full sample (−0.18 post-2000). The combination's Sharpe was 0.73 over the full sample, 1.15 in 1963-99, 0.25 in 2000-26 and 0.16 in 2010-26. The diversification survived; the level did not.

### 3.3 Value's drawdown

HML compounded fell −58% from Dec 2006 to Sep 2020, averaging −5.3%/yr over 2007-2020. It rebounded +61% in 2021-22, was flat from 2023 to Aug 2026, and is still −32% below its 2006 peak.

Fama & French (2021, *The Value Premium*) find the premium lower in 1991-2019 than in 1963-1991. They cannot statistically reject either a zero premium or an unchanged one, because monthly volatility is too high. Arnott et al. (2021) and Israel, Laursen & Richardson (2021) attribute much of the slump to spread widening and intangibles, not to value being "dead".

For our purpose: **a 14-year, −58% relative drawdown is inside the historical distribution**. Any value satellite must be sized so that the user can live through that.

### 3.4 Low beta / BAB

VW beta quintiles, 1963-2026:

| | Low-beta quintile | Market |
|---|---|---|
| Sharpe | 0.53 | 0.47 |
| CAPM α | 1.7%/yr (t 1.95) | |
| CAGR | 10.5% | 10.9% |
| Max drawdown | −43% | −50% |

A value-weighted, beta-scaled BAB-like spread earned 4.9%/yr (Sharpe 0.31), and only 2.8% (t 0.3) after Frazzini-Pedersen's publication.

This is consistent with Novy-Marx & Velikov (2022). BAB's reported Sharpe of about 0.78 (Frazzini & Pedersen 2014, US 1926-2012) comes from construction that is effectively equal-weighted: about $1.05 per $1 of BAB goes to the bottom 1% of stocks by market cap.

Live ETFs: USMV returned −3.6pp/yr and SPLV −4.5pp/yr versus SPY since 2011, with lower volatility. **Low-risk investing lowers return unless levered, which makes it a poor fit for a "max %" objective.**

### 3.5 Trend on the US equity index, and leverage (1927-2026; 10 bp per switch)

| Strategy | CAGR 1927-2026 | Max drawdown | CAGR 2000-26 | Max DD 2000-26 | CAGR 2010-26 | Switches / yr |
|---|---|---|---|---|---|---|
| Buy & hold market (1×) | 10.3% | −84% | 8.5% | −50% | 14.3% | 0 |
| 12-month TSMOM filter (market or T-bills) | 9.8% | −44% | 8.2% | −24% | 10.2% | 0.9 |
| 10-month SMA filter (Faber) | 9.6% | −43% | 8.6% | −18% | 9.3% | 1.5 |
| 2× daily-rebalanced, buy & hold | 12.6% | −98% | 9.7% | −88% | 23.1% | 0 |
| 2× plus 10-month SMA | 13.5% | −76% | 12.9% | −41% | 14.6% | 1.5 |
| 3× daily-rebalanced, buy & hold | 12.4% | −99.9% | 7.6% | −98% | 29.4% | 0 |
| 3× plus 10-month SMA | 16.4% | −93% | 16.1% | −57% | 19.0% | 1.5 |

Leverage assumptions: financing at T-bill + 0.5% on the borrowed part, plus a 0.9% fee (leveraged-ETF-like). Taxes are ignored.

Interpretation:
- The single-asset trend filter is a **drawdown-control device**. Sharpe rises from 0.45 to 0.55 and the worst 12 months improve from −66% to −29%. It is not a return booster, and it underperforms badly in fast V-shaped recoveries (2020) and long bull markets (2010-2026).
- Its real value for our objective is that it makes **moderate leverage survivable**. Buy-and-hold 3× suffered a −99.9% drawdown.

Multi-asset trend (managed futures) is a different, diversified strategy; see Section 4.

### 3.6 Volatility-managed market (Moreira & Muir 2017)

| Version | Alpha | Sharpe (vs unmanaged) |
|---|---|---|
| Full-sample scaling constant (look-ahead), 1926-2026 | 4.3%/yr (t 2.7) | 0.52 vs 0.45 |
| Real-time constant, leverage capped at 1.5×, 1936-2026 | 1.1% (t 1.1) | 0.51 vs 0.52 |
| Same, 2010-2026 | | 0.84 vs 0.88, with CAGR well below the market |
| Uncapped real-time | | Needs up to 17× leverage, with a −93% drawdown |

This matches Cederburg, O'Doherty, Wang & Yan (2020, JFE): across 103 strategies, real-time versions "do not systematically outperform" unmanaged portfolios. **Use volatility for sizing and risk limits, not as an alpha source.**

### 3.7 Calendar effects

- **Turn-of-month** (last trading day plus first 3), share of the total market excess return earned on those days (about 19% of days):

  | Period | Share of excess return | t (difference) |
  |---|---|---|
  | 1926-1987 | about 100% | 7.5 |
  | 1988-2008 | 88% | 2.7 |
  | **2009-2026** | **23%** | **0.35** |
  | 2015-2026 | | 0.05 |

  The effect disappeared after McConnell & Xu (2008) popularised it.
- **Pre-FOMC / FOMC day** (262 scheduled announcement dates scraped from federalreserve.gov; close-to-close on the announcement day, so it includes the pre-2pm drift and the reaction):

  | Period | Mean excess on FOMC days | Other days | t | Share of equity premium |
  |---|---|---|---|---|
  | 1994-09 to 2011-03 (Lucca-Moench sample) | 0.36% | 0.02% | 3.4 | **41%** |
  | 2011-04 to 2026-08 | 0.09% | | 0.3 | 5% |
  | 2016-2026 | −0.02% | | | |

  This is consistent with Kurov, Wolfe & Gilbert (2021) on the disappearing drift. **Both calendar effects are dead.**

### 3.8 Long-horizon valuation (CAPE)

- **In-sample.** Regressing 10-year forward real total return on log CAPE (1881-2013 start dates) gives slope −0.071 and R² 0.29 (Newey-West t −5.9). This is overlapping data with about 13 independent decades. By bucket: CAPE below 10 was followed by a median 11.0%/yr; CAPE above 30 by a median −1.1%/yr, but that bucket rests on essentially two episodes (1929 and 1997-2000).
- **Out of sample** (expanding window, using only outcomes known at forecast time). R² against the historical mean is +0.05 over 1911-2013 and −0.25 over 1990-2013. After 1990 the model under-forecast returns by 4.8pp/yr.
- **Naive switching** (stocks if CAPE is below its expanding median, else 10-year Treasuries):

  | Period | Switching, real CAGR | Buy-and-hold, real CAGR | Time in stocks |
  |---|---|---|---|
  | 1891-2023 | 4.2% | 6.7% | |
  | 1990-2023 | 2.4% | 7.2% | 1% |

  This matches Goyal & Welch (2008): the predictors "would not have helped an investor... profitably time the market".
- **Current level.** CAPE was 35.2 in Sep 2024 (Shiller). A rough roll-forward using the S&P 500 at about 7,740 on 2026-09-25 implies CAPE around 40 (±3), near the 1999-2000 record. **Unverified: check with live data.** Use this to set expected returns conservatively, not to time exits.

### 3.9 Buying after bear markets (US total market, first daily close below each threshold, 1926-2026)

| Threshold | Episodes | Median 1-year forward | % of 1-year periods positive | Median 5-year forward | Worst further drawdown after entry |
|---|---|---|---|---|---|
| −10% | 31 | +16.1% | 74% | +71% | −82% (1929) |
| −20% | 16 | **+26.1%** | 75% | +70% | **−78%** (1929-32) |
| −30% | 7 | +20.3% | 86% | +72% | −75% |
| −40% | 4 | +17.2% | 75% | +100% | −73% |
| −50% | 2 | +12.8% | 50% | +92% | −68% |
| Unconditional | all days | +13.9% | 75% | +72% | — |

Buying drawdowns has historically paid off in the US, but:
- the samples are tiny;
- a Great-Depression-style path wipes out most of a levered buyer;
- survivorship matters. Japan's Nikkei took about 34 years (1989 to 2024) to regain its peak. Across 39 developed markets, Anarkulova, Cederburg & O'Doherty (2022) estimate a **12% chance of losing to inflation over 30 years**.

### 3.10 Variance risk premium (Carr & Wu 2009)

Over 440 monthly observations (1990-2026), the VIX exceeded subsequent 21-day realised S&P 500 volatility in **84% of months**, by 4.1 volatility points on average. The premium is real.

The tail is ruinous:
- The worst month (Mar 2020: VIX 33 against realised vol of 95) cost **73 times the average monthly gain** of a variance seller.
- Oct 2008 and Apr 2025 are also in the top 5 losses.
- The SVXY ETF fell **−88% in two days** (2–6 Feb 2018), with a −95% maximum drawdown.

### 3.11 Crypto time-series momentum: out-of-sample check (BTC, weekly, 0.25% per switch)

Liu & Tsyvinski (2021, RFS) document strong crypto TSMOM in data through about 2018. For 2019-2026 (post-publication):

| Rule | CAGR | Sharpe | Max DD | Switches / yr |
|---|---|---|---|---|
| Buy & hold BTC | 49% | 0.97 | −75% | 0 |
| 1-week TSMOM | **26%** | 0.75 | −56% | 28 |
| 4-week TSMOM | 61% | 1.29 | −45% | 12 |
| 20-week TSMOM | 33% | 0.85 | −62% | 4 |
| Price above 20-week moving average | 46% | 1.04 | −48% | 4 |

Slow trend filters kept most of the return and cut drawdowns by about a third. The fast (1-week) effect decayed. There are many parameter choices here, so treat this as "a trend filter reduces crash exposure", not as proven alpha.

### 3.12 Live, net-of-fee implementations (Yahoo adjusted prices, inception to 2026-09-25, versus SPY over the same window)

| ETF / fund | Exposure | Since | CAGR | SPY CAGR | Difference | Max DD (SPY) |
|---|---|---|---|---|---|---|
| MTUM | Momentum | 2013 | 16.0% | 14.7% | **+1.3pp** | −34% (−34%) |
| SPMO | S&P 500 momentum | 2015 | 19.3% | 14.9% | **+4.4pp** | −31% (−34%) |
| QMOM | Concentrated momentum (about 50 stocks) | 2015 | 11.0% | 14.7% | −3.8pp | −39% |
| VLUE | Value | 2013 | 13.7% | 14.7% | −0.9pp | −39% |
| QVAL | Concentrated value | 2014 | 9.2% | 14.2% | −5.0pp | −51% |
| IWD vs IWF | Large value vs large growth | 2000 | 8.3% vs 8.5% | 8.7% | −0.4 / −0.2pp | −60% / −64% |
| VBR | Small value | 2004 | 9.4% | 10.8% | −1.4pp | −62% |
| QUAL | Quality | 2013 | 13.6% | 14.1% | −0.5pp | −34% |
| USMV / SPLV | Min-vol / low-vol | 2011 | 11.6% / 9.6% | 15.2% / 14.1% | −3.6 / −4.5pp | about −35% |
| SIZE | Size | 2013 | 11.7% | 14.7% | −3.0pp | −39% |
| CSD | Spin-offs | 2006 | 9.7% | 10.9% | −1.2pp | **−70%** |
| PKW | Buybacks | 2006 | 10.5% | 10.9% | −0.4pp | −55% |
| IPO | IPOs | 2013 | 8.3% | 14.2% | **−5.9pp** | **−69%** |
| AQMIX | Managed futures (trend) | 2010 | 4.6% | 14.1% | −9.5pp (β ≈ 0, vol 10%) | −27% |
| DBMF | Managed-futures replication | 2019 | 9.7% | 16.0% | −6.3pp (β ≈ 0.1) | −20% |
| SVXY | Short VIX futures | 2011 | 12.8% | 15.7% | −2.9pp | **−95%** |

Caveats:
- One decade dominated by US mega-cap growth is a small, style-biased sample.
- The list has survivorship bias: closed funds are absent.

Still, this is the clearest real-money evidence that **factor tilts did not add return for a retail buyer in the post-publication era**, apart from momentum.

---

## 4. Evidence map: one row per edge

"Premium" is the annual long-short or excess premium, gross, followed by a realistic retail net figure. "Worst drawdown" is compounded, peak to trough. Capacity is institutional; for one retail person it only binds in microcaps.

### A. Market beta and market timing

| Edge (key sources) | Premium gross → retail net | Sharpe | Post-publication persistence | Capacity | Trades needed | Holding period | Worst drawdown | Retail difficulty | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Equity premium, broad index** (KF data; Anarkulova et al. 2022) | 8.3% excess (about 6.5% geometric), 1926-2026 → same minus 0.03–0.1% fee | 0.45 (0.88 in 2010-26) | A risk premium, not an anomaly; persisted. US is a lucky survivor; 12% chance of a 30-year real loss internationally | Unlimited | 1, plus annual rebalance | Years to decades | −84% (1929-32); −55% (2007-09) | Very low | **CORE (A)** |
| **Buy after bear markets**, staged at −20/−30/−40% (own data) | Median 1-year forward +26% versus +14% unconditional | n/a | Holds in US data, but n = 16 / 7 / 4 | Unlimited | About 1 per 6 years | 1–5 years | A further −78% after the signal (1929) | Low (psychologically hard) | **SATELLITE rule (B/C)** |
| **CAPE / valuation timing** (Campbell-Shiller; Goyal-Welch 2008) | In-sample R² 0.29 → OOS about 0; switching lost 2.5pp/yr real | n/a | Fails OOS | — | Rare | Years | Missed 1990-2023 | Low | **AVOID as a signal**; use for expectations only (X) |

### B. Time-series, volatility and options premia

| Edge (key sources) | Premium gross → retail net | Sharpe | Post-publication persistence | Capacity | Trades needed | Holding period | Worst drawdown | Retail difficulty | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Multi-asset trend / TSMOM** (Moskowitz-Ooi-Pedersen 2012; Hurst-Ooi-Pedersen 2017) | 1880-2016: 18.0% gross excess → 11.0% after costs → **7.3% after 2/20 fees**. Live AQMIX 4.6% CAGR 2010-26; SG Trend +2.4% in 2024, +2.4% in 2025, +9.7% 2026 YTD (to 28 Aug) | 1.32 gross (12-month signal); **0.76 net**; 2010-16 net 0.41 | Decayed but positive. Positive in 8 of 10 of the largest 60/40 drawdowns. Huang et al. (2020) contest the statistics | High (futures) | 1 via a fund; monthly if DIY | Signals: months | About −27% (AQMIX live) | Low via fund/ETF; high DIY | **SATELLITE (A/B)**, as a crisis diversifier, 10–20% |
| **Trend filter on the equity index** (Faber 2007; own data) | CAGR −0.5 to −1pp versus buy-and-hold long-run; −4pp/yr in 2010-26 | 0.55 vs 0.45 | Drawdown reduction robust post-2000; no return gain | Unlimited | **0.9–1.5 switches/yr** | Months to years | −44% vs −84% (1×) | Low | **CORE risk overlay if leverage is used (B)** |
| **Volatility-managed exposure** (Moreira-Muir 2017; Cederburg et al. 2020) | Look-ahead α 4.3% → real-time α 1.1% (t 1.1) | About equal to the market | Fails OOS in 103 strategies | High | Monthly | Monthly | Similar to the market | Medium (needs leverage) | **AVOID as alpha**; use volatility only for sizing |
| **Vol-scaled momentum** (Barroso-Santa-Clara 2015) | UMD Sharpe 0.45 → 0.87; post-2000 0.13 → 0.40 | 0.87 | Improvement persists | Medium | Monthly | Months | −43% vs −78% | Medium–High | **Feature of any momentum sleeve** |
| **Variance risk premium / short volatility** (Carr-Wu 2009; Koijen et al. 2018) | VIX exceeds realised vol in 84% of months (+4.1 pts); put carry Sharpe 1.8 gross (Koijen et al.). Net: margin, spreads, jumps | High, but a misleading measure with negative skew | Persists (it is insurance) | Medium | Monthly roll | Weeks | **−88% in 2 days (SVXY, 2018)**; worst month = 73× the mean gain | High | **AVOID (X)**: ruin risk incompatible with a manual monthly system |

### C. Cross-sectional equity factors

| Edge (key sources) | Premium gross → retail net | Sharpe | Post-publication persistence | Capacity | Trades needed | Holding period | Worst drawdown | Retail difficulty | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Momentum, 12-2 months** (Jegadeesh-Titman 1993; Daniel-Moskowitz 2016) | 7.4% L/S (1927-2026) → post-publication 4.6%; 2000-26 2.2%. Long-only top-decile α 2.3% (t 1.0) post-2000. ETFs: +1.3 to +4.4pp versus SPY; mutual funds about 0 net (Patton-Weller) | 0.45 (0.13 post-2000) | About halved; crash-prone | Medium | Monthly/quarterly rebalance inside an ETF | 3–12 months | −78% (1932-39); −58% (2008-09); worst month −53% | Low via ETF | **SATELLITE (B)** |
| **Value, B/M** (Fama-French 1992; FF 2021) | 4.2% → post-publication 2.1%; 2010-26 −0.6%. ETFs −0.4 to −1.4pp; concentrated −5.0pp | 0.34 (0.18 post-publication) | Weak since 1991 (a zero premium cannot be rejected) | High | Annual | 1–5 years | −58% (2006-2020); still −32% | Low via ETF | **SATELLITE only when paired (B)** |
| **Value + momentum** (Asness-Moskowitz-Pedersen 2013) | 5.8%, Sharpe 0.73 full; 2.4%, Sharpe 0.25 post-2000 | 0.73 | Correlation benefit persists; level decayed | Medium | Monthly/annual | Months to years | −41% | Medium | **SATELLITE (B)** |
| **Quality / profitability** (Novy-Marx 2013; Asness-Frazzini-Pedersen 2019; FF 2015) | 3.0% (1963-2026); **4.3% post-2000 (α 6.0%, t 3.3)**; post-2013 2.0% (t 0.9). QUAL −0.5pp versus SPY | 0.38 | Best equity survivor post-2000; weak since 2013 | High | Annual | Years | −42% (1998-2000) | Low via ETF | **SATELLITE (B)**, as a screen or tilt ("avoid junk") |
| **Investment / asset growth** (Cooper-Gulen-Schill 2008; FF 2015) | 2.9% → post-publication 0.2% | 0.41 → 0.03 | Gone | High | Annual | Years | −28% | Low | **AVOID standalone (B)** |
| **Low beta / BAB / low volatility** (Frazzini-Pedersen 2014; Novy-Marx-Velikov 2022) | Frazzini-Pedersen BAB Sharpe about 0.78 (microcap-heavy); VW version 4.9% → 2.8% post-2014; low-vol ETFs −3.6 to −4.5pp | 0.31 (VW) | Weak post-publication; needs leverage | Medium | Annual | Years | −55% (BAB-like) | Medium | **AVOID for a max-% objective (B)** |
| **Size** (Banz 1981; Alquist-Israel-Moskowitz 2018) | 3.4% → **0.3%** post-1981; SIZE ETF −3.0pp | 0.03 post-publication | Gone | Low (microcaps) | Annual | Years | −55%; not recovered since 1983 | Low | **AVOID (B/X)** |
| **Short-term reversal, 1 month** (Jegadeesh 1990; Lehmann 1990) | 10.9% → 1.6% gross; 0.1% in 2010-26; **net negative** | 0.13 post-publication | Gone after costs | Low | About 100% monthly turnover | 1 month | −40% (2020-26) | High | **AVOID (X)** |
| **Long-term reversal** (De Bondt-Thaler 1985) | 4.9% → 1.3%; 2010-26 −1.4% | 0.14 | Weak | Medium | Annual | 3–5 years | −54% | Low | **AVOID (B)** |
| **52-week high** (George-Hwang 2004) | Momentum-like; beat Jegadeesh-Titman momentum in 1963-2001; little independent post-2004 evidence | About momentum's | Assume momentum-like decay | Medium | Monthly | 6–12 months | Momentum-like | Medium | **Fold into momentum (C)** |

### D. Multi-asset carry and commodities

| Edge (key sources) | Premium gross → retail net | Sharpe | Post-publication persistence | Capacity | Trades needed | Holding period | Worst drawdown | Retail difficulty | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Carry: FX, bonds, equity indices, commodities, options** (Koijen-Moskowitz-Pedersen-Vrugt 2018; Brunnermeier-Nagel-Pedersen 2008) | Average Sharpe 0.74 per asset class; diversified **1.1** (gross backtest); FX carry 4.3% at 7.7% vol, skew −0.96 | 1.1 diversified | Crashes cluster in global recessions (1972-75, 1980-82, 2008-09) | High | Monthly | Months | FX carry crashed in 2008 | **High** (futures/FX across many markets) | **AVOID DIY; at most via a multi-strategy fund (B)** |
| **Commodity term structure / basis-momentum** (Gorton-Rouwenhorst 2006; Erb-Harvey 2006; Szymanowska et al. 2014; Boons-Prado 2019) | Commodity carry 12.7% at 19.4% vol, Sharpe 0.65 (Koijen et al., gross); basis-momentum stronger in-sample | About 0.65 | Limited OOS | Medium | Monthly roll | Months | Large | High | **AVOID DIY (B/C)**; also avoid long-only commodity ETFs in steep contango |

### E. Event-driven

| Edge (key sources) | Premium gross → retail net | Sharpe | Post-publication persistence | Capacity | Trades needed | Holding period | Worst drawdown | Retail difficulty | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Post-earnings drift (PEAD)** (Bernard-Thomas 1989; Martineau 2022) | Large historically → **non-existent in large caps since 2006; recently gone in microcaps** | — | Gone | — | 4 per stock per year | About 60 days | — | Medium | **AVOID (X)** |
| **Earnings-announcement premium** (Frazzini-Lamont 2007; Savor-Wilson 2016) | Positive announcement-month returns, attention/small-investor driven; small per event | Small | Mixed | Medium | At least 4 per stock per year | Days to weeks | — | Medium | **AVOID**: too many trades for too little edge (B) |
| **Analyst revisions / earnings momentum** (Chan-Jegadeesh-Lakonishok 1996) | Decayed with the anomaly complex (McLean-Pontiff; Green-Hand-Zhang) | — | Decayed | Medium | Monthly | 3–6 months | — | Medium (data costs) | **AVOID standalone (B)** |
| **Opportunistic insider purchases** (Cohen-Malloy-Pomorski 2012; Lakonishok-Lee 2001) | **82 bp/month VW abnormal** (long-short; 1986-2007); routine trades about 0 | Not reported | **Unknown post-2012: needs our own EDGAR test** | **Low (small caps), which is fine for one person** | About 5–20 per year | 6–12 months | Small-cap risk | Medium (free SEC Form 4 data, filed within 2 business days) | **SATELLITE candidate, conditional on OOS validation (B/C)** |
| **Buybacks** (Ikenberry-Lakonishok-Vermaelen 1995; Fu-Huang 2016) | +12.1% 4-year abnormal (value firms +45%) → **disappeared for 2003-2012 events**; PKW −0.4pp/yr | — | Gone | High | Annual | Years | −55% (PKW) | Low | **AVOID (B)** |
| **New issues (IPO/SEO)**, as avoid/short (Loughran-Ritter 1995) | Issuers earned 5%/yr (IPO) and 7%/yr (SEO) over 5 years, far below non-issuers; IPO ETF −5.9pp/yr, −69% drawdown | — | IPO underperformance persisted in ETF form (SEO effect faded 2003-12) | — | — | — | −69% | — | **AVOID buying IPOs (X)**; use net issuance as a negative screen |
| **Spin-offs** (Cusatis-Miles-Woolridge 1993) | Positive 3-year abnormal returns in 1965-88 → CSD ETF −1.2pp/yr since 2006 | — | Weak or gone | Medium | A few per year | 1–3 years | **−70%** | Low–Medium | **AVOID systematic (B/C)**; idea source only |
| **Index additions / deletions** (Greenwood-Sammon 2022) | S&P addition abnormal return 3.4% (1980s), 7.6% (1990s) → **0.8% (2010s)**; deletions −0.6% | — | Gone | — | Event | Days | — | — | **AVOID (X)** |

### F. Calendar effects

| Edge (key sources) | Premium gross → retail net | Sharpe | Post-publication persistence | Capacity | Trades needed | Holding period | Worst drawdown | Retail difficulty | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Turn-of-month** (Ariel 1987; McConnell-Xu 2008) | About 100% of the equity premium on TOM days before 1987 → 23% (t 0.35) in 2009-26 | — | Gone | — | 24 per year | 4 days | — | Low | **AVOID (X)** |
| **Pre-FOMC drift** (Lucca-Moench 2015; Kurov et al. 2021) | 0.36% per FOMC day (t 3.4), 1994-2011 → 0.09% (t 0.3); −0.02% in 2016-26 | — | Gone | — | 8 per year | 1 day | — | Low | **AVOID (X)** |

### G. Crypto factors

| Edge (key sources) | Premium gross → retail net | Sharpe | Post-publication persistence | Capacity | Trades needed | Holding period | Worst drawdown | Retail difficulty | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Crypto time-series momentum** on BTC/ETH (Liu-Tsyvinski 2021) | OOS 2019-26: 4-week TSMOM 61% vs 49% buy-and-hold; 20-week MA 46% vs 49%, with drawdown −48% vs −75%. 1-week decayed (26%) | 1.0–1.3 vs 0.97 | Slow filters' drawdown reduction persisted; fast signals decayed | Medium | 4–12 switches/yr | Weeks to months | −45% to −62% | Low (spot or ETF) | **SATELLITE risk overlay on a crypto sleeve (C)** |
| **Crypto cross-section: size, momentum** (Liu-Tsyvinski-Wu 2022) | Large in-sample spreads, concentrated in small coins | — | Little OOS; survivorship and exchange risk | Very low | Weekly | Weeks | Extreme | High | **AVOID (C/X)** |

### H. Behavioural anti-edges (things the system must never push the user into)

| Anti-edge | Evidence | Verdict |
|---|---|---|
| Lottery-like and high-MAX stocks | Highest-MAX decile underperforms the lowest by **more than 1%/month** (Bali-Cakici-Whitelaw 2011). Lottery-type stocks underperform, worst for low-income investors (Kumar 2009). High expected-skewness stocks earn low returns (Boyer-Mitton-Vorkink 2010). Gorman et al. (2022) attribute it to overreaction | **AVOID; use as a negative screen (X)** |
| Retail option buying (weeklies, 0DTE, pre-earnings) | Retail favourites are cheap weeklies with **12.6% average bid-ask spreads**; retail loses on average (Bryzgalova-Pavlova-Sikorskaya 2023). Retail concentrates option buying before high-volatility earnings announcements and loses (de Silva-Smith-So, WP). 0DTE retail loses, mainly through costs (Beckmeyer-Branger-Gayda, WP 2023) | **AVOID (X)** |
| Day trading and high turnover | See Section 5 | **AVOID (X)** |
| Longshot bets (betting and prediction markets) | The favourite-longshot bias is driven by probability misperception (Snowberg-Wolfers 2010), and a similar pattern is reported for prediction-market contracts (Page-Clemen 2013; Bürgi-Deng-Whelan 2025 on Kalshi; details in the prediction-markets track) | **AVOID buying longshots (X)** |

---

## 5. Retail-trader evidence: what destroys returns

| Study | Sample | Finding |
|---|---|---|
| Barber & Odean (2000, JF), "Trading is hazardous to your wealth" | 66,465 US households, 1991-96 | Most active 20% earned **11.4%/yr against the market's 17.9%**. The average household earned 16.4%, turned over 75%/yr, and tilted to high-beta small stocks |
| Barber & Odean (2001, QJE), "Boys will be boys" | Same | Men traded 45% more than women; trading cut men's net returns by 2.65pp/yr versus 1.72pp for women (overconfidence) |
| Odean (1998, JF; 1999, AER) | US discount broker | Disposition effect: investors sell winners and hold losers. The stocks they buy subsequently underperform the stocks they sell |
| Barber, Lee, Liu & Odean (2009, RFS) | All Taiwan trades | Individuals' aggregate portfolio lost **3.8pp/yr**, equal to 2.2% of GDP; almost all of it traced to aggressive orders. Institutions gained 1.5pp/yr |
| Barber, Lee, Liu & Odean (2014, JFM) | Taiwan day traders, 1992-2006 | **Fewer than 1%** predictably earn positive abnormal returns net of fees |
| Chague, De-Losso & Giovannetti (2019, WP) | Brazilian index-futures day traders | **97%** of those who persisted more than 300 days lost money; 1.1% earned more than the minimum wage |
| Barber, Huang, Odean & Schwarz (2022, JF) | Robinhood, 2018-20 | Attention-induced herding; the top stocks bought each day returned **−4.7% abnormal over 20 days** |
| Welch (2022, JF), counterpoint | Robinhood crowd, 2018-20 | The aggregate crowd portfolio (mostly large, high-volume stocks) held through Mar 2020 and had good timing and alpha. **Diversified, patient retail behaviour is fine; frenzied herding is not** |
| Bryzgalova, Pavlova & Sikorskaya (2023, JF) | US retail options | Retail reached more than 60% of market volume; favourites are weeklies with 12.6% spreads; retail loses on average |
| Heimer & Simsek (2019, JFE) | US retail forex after the 2010 leverage cap | Capping leverage reduced trading and improved retail outcomes |
| ESMA (2018) product intervention | EU CFD providers | **74–89% of retail CFD accounts lose money**, which led to EU leverage caps |
| BIS Bulletin 69 (Auer et al. 2023) | Crypto-app users across many economies, Aug 2015 to Dec 2022 | "A majority of crypto app users in nearly all economies made losses on their bitcoin holdings" |
| Morningstar, *Mind the Gap* (2024) | US funds and ETFs, 10 years to 2023 | Dollar-weighted investor returns were about 1.1pp/yr below the funds' own returns (performance chasing and bad timing) |
| SPIVA scorecards (S&P DJI, ongoing) | US active funds | Roughly 85–90%+ of large-cap active funds trail the S&P 500 over 15–20 years. Even professionals mostly fail after fees |

**Mechanisms to design against:**
- overtrading from overconfidence;
- spreads and fees, especially in options, small caps and CFDs;
- lottery and skewness preference;
- attention-driven buying of recent winners and news stocks;
- leverage without risk control;
- the disposition effect;
- performance chasing and timing gaps.

A system that emails **few, slow, pre-committed trades with written exit rules** directly counters the main documented failure modes.

---

## 6. Bessembinder: skewness and concentration (summary; the multibagger track covers detail)

- **US, 1926-2016 (Bessembinder 2018, JFE).** The majority of CRSP common stocks (about 4 in 7) had lifetime buy-and-hold returns **below one-month T-bills**. The **best-performing 4%** of listed companies explain the entire net gain of the US market. The rest collectively matched T-bills.
- **Global, 1990-2020 (Bessembinder, Chen, Choi & Wei 2023, FAJ; 64,000 stocks).** 55.2% of US and 57.4% of non-US stocks underperformed T-bills. **2.4% of firms account for all $75.7 trillion** of net global wealth creation. Outside the US, 1.41% of firms account for $30.7 trillion.
- **Implications for "max % return":**
  1. A randomly chosen stock most likely loses to cash.
  2. A concentrated portfolio has the same expected return as a diversified one but a **lower median** and a much wider spread. Its chance of a 10×+ outcome rises, and so does its chance of long-run failure.
  3. Stock-picking only pays if the system has real ex-ante skill at finding right-tail firms. The replication literature says slow, diversified tilts (momentum, profitability) are the evidence-based way to lean toward future winners.
  4. Any single-stock recommendation should come with a stated probability of loss and a position cap.

---

## 7. Base rates for a "+1000%" objective (US, rolling monthly windows, 1927-2026, gross of taxes)

A +1000% (11×) result needs a CAGR of **61.5% over 5 years, 27.1% over 10 years, or 12.7% over 20 years**.

| Strategy | Horizon | Median multiple | P(at least 11×) | P(loss) |
|---|---|---|---|---|
| US market, 1× | 5y / 10y / 20y | 1.73× / 2.91× / 7.88× | **0% / 0% / 28%** | 11% / 5% / 0% |
| Top-decile momentum (VW, before its high turnover costs) | 10y / 20y | 5.1× / 29× | 2% / 79% | 1.4% / 0% |
| Small value (VW, gross) | 10y / 20y | 4.4× / 21× | 5.5% / 79% | 2.1% / 0% |
| 2× market, buy & hold | 10y | 4.2× | 12% | **14%** |
| 2× market plus 10-month SMA | 10y / 20y | 3.7× / 13.7× | 2.5% / 61% | 3.6% / 0% |
| 3× market, buy & hold | 10y | 5.1× | 28% | **19%** |
| 3× market plus 10-month SMA | 10y / 20y | 4.9× / 22.5× | 18% / 75% | 5.1% / 1% |

Windows overlap, so there are only about 10 independent 10-year periods. The US sample is survivor-biased, and the factor portfolios are pre-cost, pre-tax and pre-decay.

**Reading.** Without leverage or concentration, +1000% is a 20-year outcome, not a 5- or 10-year one. Getting there in about 10 years needs roughly 2–3× leverage (or equivalent concentration), which brings a double-digit probability of losing money over the decade unless it is controlled by a trend or drawdown overlay. Even then, drawdowns of −57% to −93% occurred.

---

## 8. Implications for the system design

### 8.1 Evidence gate (applied before any trade is emailed)

1. **Admissible evidence.**
   - Core ideas need grade A: replicated, positive after publication, and in more than one market or asset class.
   - Satellites need grade B or better **plus** a live or out-of-sample record, such as a live fund or ETF, or our own post-publication test.
   - Grade C ideas enter only as "watch-list" research. Grade X is never recommended.
2. **Return haircut.**
   - Expected gross premium = **0.5 × the published in-sample premium** (McLean-Pontiff; Chen-Lopez-Lira-Zimmermann).
   - If the edge was found by us, use 0.5 × the backtest **and** require t ≥ 3 in-sample plus a positive holdout.
   - Then subtract modelled costs: half-spread, commission and slippage; at least 25 bp round trip for small caps and the quoted spread for options.
   - Then subtract taxes at the user's marginal rate for the expected holding period. US: short-term gains are taxed as ordinary income, up to 37% plus 3.8% NIIT, against a 20% plus 3.8% maximum for long-term gains.
3. **Minimum edge.** Recommend only if the expected net after-tax edge is at least **2× the round-trip cost** and at least **1%/yr at the portfolio level**. Otherwise default to "hold the core".
4. **Turnover cap.**
   - Strategy one-sided turnover must be **below 50%/month** (Novy-Marx-Velikov).
   - System-level target: **at most 12 recommended trades per year** in steady state (hard cap 24), excluding annual rebalancing.
   - Use hold bands: do not trade unless a weight drifts more than ±5pp or more than 25% relative.
5. **Holding-period preference.** When the model's expected edge difference is under 1pp, prefer trades held for **more than 12 months** (US long-term capital-gains treatment). Put higher-turnover sleeves (trend filters, momentum rotation) in tax-advantaged accounts where the user has them. Futures held directly get Section 1256 60/40 treatment.

### 8.2 Portfolio architecture (default parameters)

| Sleeve | Default | Evidence basis | Parameters |
|---|---|---|---|
| **Core beta** | 60–100% of capital | Equity premium about 8% excess, Sharpe 0.45, the only large robust premium | Broad, low-cost total-market or global index ETF with expense ratio ≤ 0.10%; rebalance annually or at ±5pp drift |
| **Risk overlay** | On whenever leverage is above 1× (optional at 1×) | Trend filter cut the maximum drawdown from −84% to −44% at 1×, and from −98% to −76% at 2×, at 1–1.5 switches/yr | Month-end check: hold the core if the index total-return level is above its 10-month SMA; otherwise move to T-bills or a short-term Treasury ETF. Alternative: 12-month excess-return sign. Execute on the first trading day of the month. **Warn the user it lags in V-shaped rebounds** (2010-26 cost about 4–5pp/yr) |
| **Leverage** (only if the user explicitly opts in after seeing Section 7's table) | Default 1×; cap **2×** notional; 3× is never the default | 2× plus SMA: 13.5% CAGR against 10.2% (1927-2026), but −76% max DD. 3× buy-and-hold: 19% chance of a 10-year loss | Use leverage only together with the trend overlay; size so that a −50% index drawdown cannot wipe out more than a user-stated maximum loss |
| **Crash-rebalancing rule** | Event-driven | Median 1-year forward +26% after the first −20% close (n = 16); further −78% is possible | If the core index is ≥ 20%, ≥ 30% or ≥ 40% below its peak, recommend adding one-third of the pre-set "dry powder" at each level (unlevered). Never pre-commit leverage to this rule |
| **Satellites** (total ≤ 30%, each ≤ 10–15%) | Optional | Grade B survivors | (a) Momentum ETF, reviewed with a vol-aware rule: cut to half weight when trailing 6-month momentum-factor volatility is more than 1.5× its long-run median, or in a Daniel-Moskowitz bear state (negative past 24-month market return). (b) Quality/profitability tilt. (c) Managed-futures fund, 10–20%, as the crisis diversifier. (d) Value only alongside momentum or quality |
| **Single-stock ideas** | 0% until validated | Opportunistic insider purchases (82 bp/month, 1986-2007) are the only event signal with strong original evidence and low institutional capacity | Build our own 2012-2026 EDGAR Form-4 test first: non-routine insider **buys**, clusters of 2 or more insiders, small/mid caps, hold 6–12 months. Promote only if the out-of-sample net alpha has t ≥ 2 after costs. Cap at 5% per name and 15% for the sleeve |
| **Crypto sleeve** (if the user wants crypto; the crypto track sets its size) | ≤ 5–10% | BTC/ETH; slow trend filter halved drawdowns out of sample | Hold BTC/ETH only while price is above its 20-week moving average (about 4 switches/yr); no small-coin factor bets |

### 8.3 Hard "never recommend" list (negative expected value for retail, per Sections 4–5)

- Day trading.
- Short-term reversal and intraday strategies.
- Earnings-drift or earnings-announcement trades.
- Calendar trades: turn-of-month, pre-FOMC, January.
- Index-inclusion front-running.
- IPO purchases in the first year after listing.
- **Buying weekly or 0DTE options, or options into earnings.**
- Short-volatility ETPs or naked option selling.
- Unhedged 3× leveraged ETFs held long-term.
- High-MAX or "lottery" stocks: screen out the top decile of prior-month maximum daily return.
- CAPE-based full market exits.
- Low-volatility/BAB strategies presented as return enhancers.
- Small-coin crypto factor portfolios.
- Prediction-market or betting longshots.

### 8.4 Monthly self-calibration protocol (what "self-improve" should mean)

1. **Do not add or remove strategies based on 1–12 months of P&L.** Power is too low: a Sharpe-0.4 edge needs about 25 years of data to reach t = 2. Monthly updates may change only:
   - cost and slippage estimates, using realised fills against the recommended price;
   - volatility and risk estimates, and therefore position sizes;
   - data and implementation errors;
   - drawdown-rule states.
2. **Bayesian shrinkage for each sleeve's expected return** (in the spirit of Jensen, Kelly & Pedersen):
   - posterior = w × live estimate + (1 − w) × prior;
   - prior = the haircut literature premium;
   - w = T / (T + 120), where T is months of live data. After 3 years, live data carry only about 23% weight.
3. **Demotion rule.** Cut a satellite to half weight if its live return is more than 2 standard errors below its prior expectation over at least 36 months, **or** if its measured implementation cost exceeds 50% of its expected gross edge, **or** if its structural rationale disappears (as with the index effect or PEAD). Remove it only if the condition persists for 60 months.
4. **Decay monitor.** Keep a public ledger comparing each signal's pre-inclusion backtest mean with its live mean. Expect about a 50% ratio; below 25% after 5 years triggers a review.
5. **Forecast calibration.** Every emailed trade must state:
   - expected return and volatility;
   - probability of loss over the holding period;
   - historical worst case.

   Score these monthly (Brier or log score for P(loss); coverage of stated ranges). The system improves by getting its **probabilities** right, not by chasing last month's winner.

### 8.5 What every trade email must disclose (evidence-driven content rules)

- The evidence grade and post-publication status in one line, for example "momentum premium roughly halved since 1993; live ETFs +1–4pp/yr over the last decade".
- Expected net return range and the base rate of the user's target. For example: "historically, 1× equity reached +1000% in 0% of 10-year windows."
- Worst historical drawdown for the position, its sleeve and the whole portfolio, plus how long recovery took (for example, value −58% over 14 years; momentum −58% in 2008-09).
- Costs (spread, commission, fund fee), expected tax character (short or long term) and the exit rule, pre-committed to counter the disposition effect.
- An explicit reminder when the trade raises concentration or leverage (Bessembinder: higher variance, lower median).

**Jurisdiction note.** Everything above assumes a US retail investor.
- EU/EEA retail investors generally cannot buy US-domiciled ETFs (PRIIPs KID rules). ESMA caps CFD leverage.
- UK rules are similar.
- Tax rules (holding periods, Section 1256) differ outside the US.

---

## Appendix A: Reproducibility

All scripts are in `/home/user/testProject/research/code/02-academic/` (Python 3.11). Downloads are cached in `data/` and outputs written to `results/`.

| Script | What it does | Output |
|---|---|---|
| `kf_utils.py` | Downloads and parses Ken French CSVs; statistics helpers | — |
| `kf_factor_analysis.py` | Factor stats by period and pre/post publication; CAPM alphas; momentum crash conditioning; HML drawdown; rolling 10-year windows; value+momentum combination | `results/factor_analysis.txt`, `factor_period_stats.csv`, `factors_monthly.csv` |
| `kf_portfolio_analysis.py` | Long-only momentum deciles; beta quintiles; BAB-like spread (Vasicek-shrunk betas) | `results/portfolio_analysis.txt` |
| `market_timing_checks.py` | Equity trend filters; Moreira-Muir (look-ahead vs real-time); vol-scaled momentum; post-drawdown forward returns (calendar horizons); turn-of-month; leveraged ± trend | `results/market_timing_checks.txt` |
| `cape_predictability.py` | CAPE in-sample, out-of-sample and switching rule (Shiller legacy file) | `results/cape_predictability.txt` |
| `fomc_drift.py` | Scrapes scheduled FOMC dates 1994-2026; FOMC-day returns | `results/fomc_drift.txt`, `data/fomc_dates.csv` |
| `etf_live_check.py` | Factor, event and alternative ETFs versus SPY since inception | `results/etf_live_check.txt/.csv` |
| `base_rates.py` | Rolling 5/10/20-year multiples; P(≥11×), P(loss) | `results/base_rates.txt` |
| `crypto_tsmom_check.py` | BTC TSMOM in-sample vs post-publication | `results/crypto_tsmom_check.txt` |
| `vrp_check.py` | VIX versus next-21-day realised vol; tail losses | `results/vrp_check.txt` |

Run any script with `cd research/code/02-academic && python <script>.py`.

Known limitations:
- Ken French factors are gross and long-short.
- Daily market data before 1952 include Saturday sessions; the scripts use calendar-time horizons to handle this.
- The Shiller legacy file ends in 2023-09, which is sufficient for 10-year forward returns to 2013.
- ETF samples are survivor-biased and short.
- The FOMC measure is close-to-close, not Lucca-Moench's 2pm-to-2pm window.

## Appendix B: References

(Items marked ✔ had their abstract or key numbers re-verified for this report from RePEc, NBER, the publisher, the author or the full text.)

- Alquist, R., Israel, R., Moskowitz, T. (2018). Fact, Fiction, and the Size Effect. *Journal of Portfolio Management* 45(1).
- Anarkulova, A., Cederburg, S., O'Doherty, M. (2022). Stocks for the long run? Evidence from a broad sample of developed markets. *JFE* 143(1). ✔
- Arnott, R., Harvey, C., Kalesnik, V., Linnainmaa, J. (2021). Reports of Value's Death May Be Greatly Exaggerated. *FAJ* 77(1).
- Asness, C., Frazzini, A., Pedersen, L. (2019). Quality minus junk. *Review of Accounting Studies* 24.
- Asness, C., Moskowitz, T., Pedersen, L. (2013). Value and Momentum Everywhere. *JF* 68(3).
- Bali, T., Cakici, N., Whitelaw, R. (2011). Maxing out: Stocks as lotteries and the cross-section of expected returns. *JFE* 99(2). ✔
- Banz, R. (1981). The relationship between return and market value of common stocks. *JFE* 9(1).
- Barber, B., Odean, T. (2000). Trading Is Hazardous to Your Wealth. *JF* 55(2). ✔ — (2001) Boys will be boys. *QJE* 116(1).
- Barber, B., Lee, Y.-T., Liu, Y.-J., Odean, T. (2009). Just How Much Do Individual Investors Lose by Trading? *RFS* 22(2). ✔ — (2014) The cross-section of speculator skill: Evidence from day trading. *J. Financial Markets* 18. ✔
- Barber, B., Huang, X., Odean, T., Schwarz, C. (2022). Attention-Induced Trading and Returns: Evidence from Robinhood Users. *JF* 77(6). ✔
- Barroso, P., Santa-Clara, P. (2015). Momentum has its moments. *JFE* 116(1). ✔
- Beckmeyer, H., Branger, N., Gayda, L. (2023). Retail Traders Love 0DTE Options... But Should They? Working paper (SSRN).
- Bernard, V., Thomas, J. (1989). Post-earnings-announcement drift. *J. Accounting Research* 27.
- Bessembinder, H. (2018). Do stocks outperform Treasury bills? *JFE* 129(3). ✔
- Bessembinder, H., Chen, T.-F., Choi, G., Wei, K.C.J. (2023). Long-Term Shareholder Returns: Evidence from 64,000 Global Stocks. *FAJ* 79(3). ✔
- BIS (Auer, Cornelli, Doerr, Frost, Gambacorta) (2023). Crypto shocks and retail losses. *BIS Bulletin* 69. ✔ (qualitative)
- Boons, M., Prado, M. (2019). Basis-Momentum. *JF* 74(1). ✔
- Boyer, B., Mitton, T., Vorkink, K. (2010). Expected idiosyncratic skewness. *RFS* 23(1).
- Brunnermeier, M., Nagel, S., Pedersen, L. (2008). Carry Trades and Currency Crashes. *NBER Macroeconomics Annual* 23.
- Bryzgalova, S., Pavlova, A., Sikorskaya, T. (2023). Retail Trading in Options and the Rise of the Big Three Wholesalers. *JF* 78(6). ✔
- Bürgi, C., Deng, W., Whelan, K. (2025). Makers and Takers: The Economics of the Kalshi Prediction Market. Working paper.
- Campbell, J., Shiller, R. (1988). Stock prices, earnings, and expected dividends. *JF* 43(3); (1998) Valuation ratios and the long-run stock market outlook. *JPM* 24(2).
- Campbell, J., Thompson, S. (2008). Predicting excess stock returns out of sample. *RFS* 21(4).
- Carr, P., Wu, L. (2009). Variance Risk Premiums. *RFS* 22(3). ✔
- Cederburg, S., O'Doherty, M., Wang, F., Yan, X. (2020). On the performance of volatility-managed portfolios. *JFE* 138(1). ✔
- Chague, F., De-Losso, R., Giovannetti, B. (2019). Day Trading for a Living? Working paper (SSRN 3423101).
- Chan, L., Jegadeesh, N., Lakonishok, J. (1996). Momentum strategies. *JF* 51(5).
- Chen, A., Zimmermann, T. (2022). Open Source Cross-Sectional Asset Pricing. *Critical Finance Review* 11(2). ✔
- Chen, A., Velikov, M. (2023). Zeroing In on the Expected Returns of Anomalies. *JFQA* 58(3). ✔
- Chen, A., Lopez-Lira, A., Zimmermann, T. (2025). Does Peer-Reviewed Research Help Predict Stock Returns? arXiv:2212.10317 v7. ✔
- Chordia, T., Subrahmanyam, A., Tong, Q. (2014). Have capital market anomalies attenuated in the recent era of high liquidity and trading activity? *JAE* 58(1). ✔
- Cohen, L., Malloy, C., Pomorski, L. (2012). Decoding Inside Information. *JF* 67(3) (NBER w16454). ✔
- Cusatis, P., Miles, J., Woolridge, J. (1993). Restructuring through spinoffs. *JFE* 33(3).
- Daniel, K., Moskowitz, T. (2016). Momentum crashes. *JFE* 122(2). ✔
- de Silva, T., Smith, K., So, E. (2023). Losing is Optional: Retail Option Trading and Expected Announcement Volatility. Working paper.
- ESMA (2018). Product intervention measures on CFDs and binary options (74–89% of retail CFD accounts lose money).
- Faber, M. (2007). A Quantitative Approach to Tactical Asset Allocation. *Journal of Wealth Management* 9(4).
- Fama, E., French, K. (1992). The Cross-Section of Expected Stock Returns. *JF* 47(2); (2015) A five-factor asset pricing model. *JFE* 116(1); (2021) The Value Premium. *RAPS* 11(1). ✔ (2021, via abstract)
- Frazzini, A., Lamont, O. (2007). The Earnings Announcement Premium and Trading Volume. NBER w13090. ✔
- Frazzini, A., Pedersen, L. (2014). Betting against beta. *JFE* 111(1). ✔
- Fu, F., Huang, S. (2016). The disappearance of long-run abnormal returns following repurchases and SEOs ("Giving Up the Ghost?"). *Management Science* 62(4). ✔
- George, T., Hwang, C.-Y. (2004). The 52-Week High and Momentum Investing. *JF* 59(5).
- Gorman, J., Akhtar, F., Durand, R., Gould, J. (2022). It Could Be Overreaction, Not Lottery Seeking, That Is Behind Bali, Cakici and Whitelaw's Max Effect. *CFR* 11(3-4). ✔
- Gorton, G., Rouwenhorst, K.G. (2006). Facts and Fantasies about Commodity Futures. *FAJ* 62(2).
- Goyal, A., Welch, I. (2008). A Comprehensive Look at the Empirical Performance of Equity Premium Prediction. *RFS* 21(4). ✔
- Green, J., Hand, J., Zhang, X.F. (2017). The Characteristics that Provide Independent Information about Average U.S. Monthly Stock Returns. *RFS* 30(12). ✔
- Greenwood, R., Sammon, M. (2022). The Disappearing Index Effect. NBER Working Paper w30748. ✔
- Harvey, C., Liu, Y., Zhu, H. (2016). ...and the Cross-Section of Expected Returns. *RFS* 29(1). ✔
- Heimer, R., Simsek, A. (2019). Should retail investors' leverage be limited? *JFE* 132(3).
- Hou, K., Xue, C., Zhang, L. (2020). Replicating Anomalies. *RFS* 33(5). ✔
- Huang, D., Li, J., Wang, L., Zhou, G. (2020). Time series momentum: Is it there? *JFE* 135(3). ✔
- Hurst, B., Ooi, Y.H., Pedersen, L. (2017). A Century of Evidence on Trend-Following Investing. *JPM* 44(1) (SSRN 2993026). ✔
- Ikenberry, D., Lakonishok, J., Vermaelen, T. (1995). Market underreaction to open market share repurchases. *JFE* 39. ✔
- Israel, R., Laursen, K., Richardson, S. (2021). Is (Systematic) Value Investing Dead? *JPM* 47(2).
- Jegadeesh, N. (1990). Evidence of Predictable Behavior of Security Returns. *JF* 45(3). — Lehmann, B. (1990). Fads, Martingales, and Market Efficiency. *QJE* 105(1).
- Jegadeesh, N., Titman, S. (1993). Returns to Buying Winners and Selling Losers. *JF* 48(1). ✔
- Jensen, T.I., Kelly, B., Pedersen, L. (2023). Is There a Replication Crisis in Finance? *JF* 78(5). ✔
- Koijen, R., Moskowitz, T., Pedersen, L., Vrugt, E. (2018). Carry. *JFE* 127(2) (NBER w19325). ✔
- Kumar, A. (2009). Who Gambles in the Stock Market? *JF* 64(4). ✔
- Kurov, A., Wolfe, M., Gilbert, T. (2021). The disappearing pre-FOMC announcement drift. *Finance Research Letters* 40.
- Liu, Y., Tsyvinski, A. (2021). Risks and Returns of Cryptocurrency. *RFS* 34(6). ✔
- Liu, Y., Tsyvinski, A., Wu, X. (2022). Common Risk Factors in Cryptocurrency. *JF* 77(2). ✔
- Loughran, T., Ritter, J. (1995). The New Issues Puzzle. *JF* 50(1). ✔
- Lucca, D., Moench, E. (2015). The Pre-FOMC Announcement Drift. *JF* 70(1). ✔
- Martineau, C. (2022). Rest in Peace Post-Earnings Announcement Drift. *Critical Finance Review* 11(3-4). ✔
- McConnell, J., Xu, W. (2008). Equity Returns at the Turn of the Month. *FAJ* 64(2).
- McLean, R.D., Pontiff, J. (2016). Does Academic Research Destroy Stock Return Predictability? *JF* 71(1). ✔
- Moreira, A., Muir, T. (2017). Volatility-Managed Portfolios. *JF* 72(4).
- Morningstar (2024). *Mind the Gap* (annual study of investor versus fund returns).
- Moskowitz, T., Ooi, Y.H., Pedersen, L. (2012). Time series momentum. *JFE* 104(2). ✔
- Novy-Marx, R. (2013). The other side of value: The gross profitability premium. *JFE* 108(1). ✔
- Novy-Marx, R., Velikov, M. (2016). A Taxonomy of Anomalies and Their Trading Costs. *RFS* 29(1). ✔ — (2022) Betting against betting against beta. *JFE* 143(1). ✔
- Odean, T. (1998). Are Investors Reluctant to Realize Their Losses? *JF* 53(5); (1999) Do Investors Trade Too Much? *AER* 89(5).
- Page, L., Clemen, R. (2013). Do Prediction Markets Produce Well-Calibrated Probability Forecasts? *Economic Journal* 123(568).
- Patton, A., Weller, B. (2020). What you see is not what you get: The costs of trading market anomalies. *JFE* 137(2). ✔
- Savor, P., Wilson, M. (2016). Earnings Announcements and Systematic Risk. *JF* 71(1).
- Snowberg, E., Wolfers, J. (2010). Explaining the Favorite-Long Shot Bias. *JPE* 118(4). ✔
- Szymanowska, M., de Roon, F., Nijman, T., van den Goorbergh, R. (2014). An Anatomy of Commodity Futures Risk Premia. *JF* 69(1).
- Welch, I. (2022). The Wisdom of the Robinhood Crowd. *JF* 77(3). ✔
- Practitioner and index data: SG Trend Index (Société Générale Prime Services; 2025 about +2.4%; 2026 YTD about +9.7% to 28 Aug, via Top Traders Unplugged and Aussie Turtles reports); Kenneth French Data Library (https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html); Shiller data (http://www.econ.yale.edu/~shiller/data/ie_data.xls and the shillerdata.com mirror); FOMC calendars (https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm).
