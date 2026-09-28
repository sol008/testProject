# 08 — The world as of 28 September 2026: regime, valuations, stress points, and candidate asymmetric setups

*Research date: Monday 2026-09-28, written after the US cash close. Market data are 2026-09-28 closes from Yahoo Finance via yfinance unless a different date is given. FRED series carry their own latest observation dates. Prediction-market odds are snapshots taken around 20:30 UTC on 2026-09-28. Every web-sourced claim is dated and linked. Code is in `research/code/08-current/` (`python run_all.py` re-pulls everything).*

*Labels used below: **[F]** = a fact from data or a cited source. **[I]** = my inference. **[S]** = my subjective probability or speculation. Subjective probabilities are rough and meant as calibration inputs, not forecasts to act on blindly.*

*Disclosure: this report was written by Claude, which is made by Anthropic. Polymarket odds for an Anthropic IPO are quoted only as a froth and supply indicator. No Anthropic-related trade is proposed, and the system should flag or exclude any such trade that an AI generates.*

---

## TL;DR

1. **Regime: a late-cycle "no-landing" boom hit by a stagflationary supply shock, with central banks tightening again.** [F]
   - **The shock.** The US/Israel–Iran war began on 2026-02-28, and traffic through the Strait of Hormuz is still only about 15% of normal: 132 transits in the week of 21–27 September, against roughly 130 per day before the war.
   - **The policy response.** The Fed hiked 25bp to 3.75–4.00% on 2026-09-16 (its first hike since 2023). The ECB deposit rate is 2.50% after two hikes, and the BoJ is at 1.25%.
   - **The result is a global bond bear market.** The US 10-year is at 5.24% (highest since mid-2007), the 30-year at 5.56% (highest since 2002–04), the 10-year real yield at 2.85% (99.6th percentile since 2003), and the JGB 10-year at 3.07%.
   - **It is not a crisis.** The Chicago Fed NFCI is −0.56, the St. Louis stress index is at its 4th percentile, the HY spread is 2.93%, and jobless claims average 202k.
2. **Equities sit near all-time highs on a real but narrow earnings boom.** [F]
   - S&P 500 at 7,684, 1.5% below its high. FactSet (25 Sept) has 2026 EPS up 32% and a forward P/E of 19.2.
   - The boom is concentrated in AI semiconductors and memory: SOXX +109% and MU +570% over one year.
   - Breadth is at a record extreme. The equal-weight-to-cap-weight ratio (RSP/SPY) is at its lowest since 2003, and the top 10 stocks are 37.8% of SPY.
   - The CAPE is 41.5, second only to 1999. The forward earnings yield (5.21%) roughly equals the 10-year Treasury yield, so stocks offer no yield premium over bonds.
   - Earnings growth peaks now: consensus for Q2-2027 year-over-year EPS growth is +1.7%.
3. **Stress is sectoral, not systemic.** [F]
   - **Private credit:** Fitch's private-credit default rate is about 6.1% (July). Redemptions are gated at 5%. OWL is 66% below its peak and the BDC ETF (BIZD) is −14% over one year.
   - **AI-infrastructure debt:** Oracle is rated BBB− and its stock is 60% below its high. CoreWeave is 54% below.
   - **Long-duration assets:** TLT is −12% over one year, homebuilders are −31% from their high, and utilities are at a record low relative to SPY.
   - **Oil-importing emerging-market currencies:** USDINR is about 96, USDIDR 17,960 (up 2.3% today), and USDPHP is near its record.
   - **Precious metals after their blow-off top:** silver is −50% and gold −26% from their 29 January 2026 peaks. Gold fell 3.9% today.
4. **Sentiment is split.** [F]
   - Retail investors are fearful: AAII bears are at 48.1% and CNN Fear & Greed is around 34–37.
   - Institutions are long equities and short bonds. The BofA Fund Manager Survey has cash at 3.9%, bonds at a net 48% underweight, and the Bull & Bear indicator at 9.5 (a "sell" signal). The most crowded trade is long semiconductors (53%).
   - Margin debt is $1.45T, up 37% year over year.
5. **Market-implied odds, from Polymarket and Kalshi on 28 September.** [F]

   | Event | Odds |
   |---|---|
   | Fed hike on 28 Oct | ~69% |
   | Fed hike on 9 Dec | ~77% |
   | No Fed cut in 2026 | 97% |
   | NBER recession starting in 2026 | 5–8.5% |
   | US announces end of its Iran blockade by 31 Dec | 59% |
   | Hormuz traffic "normal" by 31 Dec | 22.5% |
   | Democrats win the House | 92.5% |
   | Democrats win the Senate | 62.5% |
   | 10-year Treasury yield hits 5.5% before 2027 | 51% |

6. **The calendar is dense.**

   | Date | Event |
   |---|---|
   | 2 Oct | September jobs report |
   | 14 Oct | September CPI |
   | 27–28 Oct | FOMC |
   | 29–30 Oct | BoJ meeting |
   | Late Oct | Mega-cap 2027 capex guidance |
   | 3 Nov | Midterm elections |
   | ~18–19 Nov | Nvidia results |
   | 8–9 Dec | FOMC, with projections |
   | 11 Dec | Stopgap government funding (CR) expires |
   | 10 Jan 2027 | US–China truce expires |

   The Bitcoin halving-cycle "trough window" runs from about 4 October to 16 November 2026.
7. **The base rates argue against drama.** [F]
   - Months when the 10-year yield rose at least 45bp in 21 trading days (today's rise is 57bp) have not preceded worse S&P 500 returns. Across 59 episodes, the 3-month mean was +2.6%, against +2.4% unconditionally.
   - In midterm years, Q4 averaged +5.5% (8 of 9 years were up).
   - Equity crash puts are insurance, not alpha, unless specific triggers fire.
8. **The best candidate setups are all "decent, not great."** [I]
   - **(a) A peak-yields/peace bet:** TLT March-2027 81/88 call spread, about $1.40 for a maximum of 5×. Liquid, and roughly fairly priced against the options market.
   - **(b) The Bitcoin halving-cycle trough:** IBIT Dec-2027 50/70 call spread at about $5.25 (maximum ~3.8×), or staged spot purchases.
     - The cycle peak came 534 days after the halving; the previous two came after 526 and 548 days.
     - Prior bear-market troughs came 363–406 days after the peak.
     - The options market implies an 18% chance of BTC above ~$124k by December 2027. My cycle-based estimate is 25–30%.
   - **(c) Uranium via the Sprott Physical Uranium Trust (SPUT):** it trades at an 11.7% discount to net asset value. That is about $80/lb effective against a $96.50 term price.
   - **(d) Yen upside:** USDJPY looks capped by official intervention, but options on the yen ETF (FXY) are too illiquid, so hold it outright and unlevered.
9. **Most of these ideas are the same bet.** Long duration, the yen, gold, homebuilders, India, and short oil all pay off in a peace or peak-yields scenario. The recommendation engine must cap exposure to that single factor.
10. **Bottom line for today: no setup clears the bar without its trigger.**
    - Default to T-bills (the 3-month bill yields 4.06%).
    - Arm conditional orders instead of forcing trades.
    - "Wait for a better pitch" is the right answer for the watch list until the triggers in §5 and §7 fire.
    - If one starter position is wanted, SPUT's NAV discount is the least-bad because the edge is measurable and there is no decay.

---

## 1. Live snapshot (values, 1-year context, percentiles)

Percentiles are measured against each series' full available history unless stated. "vs 200d" is the distance from the 200-day moving average. Sources: yfinance, FRED, multpl.com, FactSet, and CoinGecko.

### 1.1 US equities, breadth, concentration

| Gauge | Level | 1d | YTD | 1y | From ATH (ATH date) | vs 200d |
|---|---|---|---|---|---|---|
| S&P 500 | 7,683.69 | −0.77% | +12.2% | +15.7% | −1.5% (2026-08-13, 7,798.99) | +6.6% |
| Nasdaq Composite | 26,820 | −0.92% | +15.4% | +19.3% | −1.6% (2026-09-22) | +8.8% |
| Nasdaq 100 | 30,277 | −1.08% | +19.9% | +23.6% | −1.5% (2026-09-22) | +10.6% |
| Russell 2000 | 2,818.75 | −0.66% | +13.6% | +15.8% | −8.1% (2026-08-14) | +1.5% |
| Dow Jones | 51,482 | −0.67% | +7.1% | +11.3% | −5.3% (2026-08-05) | +2.5% |
| Equal-weight S&P (RSP) | 209.74 | −0.65% | +9.5% | +11.2% | −5.9% | +2.1% |

| Breadth / concentration gauge | Level | Context |
|---|---|---|
| RSP/SPY ratio (equal vs cap weight) | 0.274 | **0.1st percentile since 2003 (record narrowness)**; −3.8% over 1y |
| Top-10 holdings weight of SPY | **37.8%** | NVDA 8.1%, AAPL 7.0%, MSFT 5.7%, AMZN 3.8%, GOOGL+GOOG 5.4%, AVGO 2.6%, META 1.9%, MU 1.6%, TSLA 1.6% (yfinance fund holdings, latest available) |
| Semis/SPY (SMH/SPY) | — | 99.5th percentile; +61% over 1y |
| High-beta/low-vol (SPHB/SPLV) | 2.12 | **99.8th percentile since 2011** (maximum risk appetite) |
| Utilities/SPY | — | 0.03rd percentile (utilities crushed by yields) |
| Russell 2000 / S&P 500 | 0.367 | 8th percentile since 1990 |
| Software/SPY (IGV/SPY) | — | −21% over 1y ("AI eats SaaS") |

**Sector and theme dispersion over 1 year** [F]:

- **Winners:** SOXX +109%, SMH +86%, XLK +40%, XLE +35%, XLV +26%.
- **Losers:** XLY −9%, XLU −10%, IGV −8%, ITB −17%, XLRE −1%.

**The AI complex splits into two groups** [F]:

- **The "picks and shovels" chip names are near their highs:**
  - MU $1,054: +570% over 1y, 13% below its 2026-06-25 high.
  - AMD $608: +281%.
  - TSM $453: +66%.
  - NVDA $228.86: +28%, 3% below its high.
- **The debt-funded infrastructure names have collapsed:**
  - ORCL $132.60: −60% from its 2025-09-10 high.
  - CRWV $85.07: −54%.
  - OKLO: −79%.
  - CEG: −36%.
  - VST: −37%.
  - VRT: −35%.

### 1.2 Valuation

| Gauge | Level | Context / source |
|---|---|---|
| Forward 12m P/E | **19.2** | 5-year average 19.8, 10-year 19.0; it was 20.4 on June 30 because forward EPS rose 8.9% since then ([FactSet Earnings Insight, 2026-09-25](https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_092526.pdf)) |
| Trailing 12m P/E | 25.8 | 5-year average 24.4 (FactSet, 2026-09-25) |
| Shiller CAPE | **41.48** | Record 44.19 (Dec 1999); mean 17.4 ([multpl, close 2026-09-25](https://www.multpl.com/shiller-pe)). The Yale ie_data.xls file is stale after 2023-09, so don't use it for live CAPE |
| CY2026 / CY2027 EPS growth | +32.0% / +15.4% | Q3-26 +29.1%, Q4-26 +26.8%, Q1-27 +18.4%, **Q2-27 +1.7%** (FactSet). Earnings growth peaks now |
| Net profit margin | Q2-26 **17.0% (record since 2009)**; Q3-26 estimate 15.0% | FactSet |
| Semis' contribution | Semis EPS +126% y/y in Q3 | Excluding semis, IT sector growth falls from 63.5% to 24.2% (FactSet) |
| Forward earnings yield vs 10y UST | 5.21% vs 5.24%, a gap of **≈0.0pp** | Equities offer no earnings-yield premium over Treasuries (the 2009–21 norm was +3 to +5pp) [I] |
| Forward earnings yield vs 10y TIPS | +2.36pp | — |
| Analyst sentiment | Buy ratings 59.9%, **highest month-end reading since at least 2010**; bottom-up target 9,275 (+20.4%) | FactSet 2026-09-25. This is a complacency tell [I] |

### 1.3 Volatility

| Gauge | Level | Percentile (full / 10y) | Note |
|---|---|---|---|
| VIX | 16.10 | 40 / 43 | 1-month change +11.6% |
| VIX9D / VIX3M / VIX6M / VIX1Y | 14.44 / 18.24 / 20.25 / 21.66 | — | Contango. VIX/VIX3M 0.88 (normal; stress shows when this is >1) |
| VVIX | 91.3 | 50 / 34 | — |
| CBOE SKEW | 144.9 | **94** / 76 | Heavy demand for tail protection |
| MOVE (Treasury vol) | 96.0 | 67 / 70 | Spiked to 104.6 on 2026-09-24; +35% over 1 month |
| OVX (oil vol) | 56.1 | **91** / 91 | War premium |
| GVZ (gold vol) | 24.8 | 86 / 91 | After the crash |
| SPY ATM implied vol, 1m/3m/6m/1y | 13.4 / 14.4 / 15.9 / 18.4% | — | Realized vol: 20-day 11.1%, 60-day 11.3%. **Implied/realized 1.2–1.6**, so index options are not cheap relative to realized |

### 1.4 Rates and monetary policy

FRED latest observation is 2026-09-24 unless noted. Live CBOE yields from yfinance on 9/28 are in brackets.

| Gauge | Level | 1y change | Percentile since 2000 | Note |
|---|---|---|---|---|
| Fed funds target | 3.75–4.00% (effective 3.88%, IORB 3.90%) | −0.21 | 75 | +25bp on 2026-09-16 |
| 3m T-bill | 4.24% [13-week bill 4.06%] | — | — | — |
| 2y UST | 4.87% | **+1.30** | 92 | **2y minus effective fed funds = +99bp, i.e. ~3–4 hikes priced over 2 years** |
| 5y UST | 5.03% [5.07%] | — | — | — |
| 10y UST | 5.18% [**5.24%**] | +1.02 | 94 | **Highest close since June/July 2007**. 21-day change +57bp |
| 20y / 30y UST | 5.53% / 5.47% [**5.56%**] | +0.71 (30y) | 92 | 30y highest since 2002 (^TYX) or 2004 (FRED); [Bloomberg 2026-09-24](https://www.bloomberg.com/news/articles/2026-09-24/us-30-year-yield-hits-highest-since-2004-as-bond-selloff-deepens) |
| 10y–2y / 10y–3m | +0.36 / +0.93pp | — | — | Positively sloped |
| 10y TIPS real yield | **2.85%** | +1.07 | **99.6 (since 2003)** | — |
| 10y breakeven / 5y5y forward inflation | 2.34% / 2.34% | −0.04 / 0.00 | 71 / 59 | **Long-run inflation expectations remain anchored** |
| Kim–Wright 10y term premium | 0.96% (2026-09-18) | +0.50 | 82 | Highest since 2010 |
| 30y mortgage | 7.03% | +0.77 | 93 | — |
| Fed balance sheet | $6.75T | +$139bn | — | QT is over; assets up ~$200bn from the Nov-2025 trough. Reserves $2.93T, TGA $977bn, ON RRP ≈ $0.9bn (the buffer is exhausted) |

**What policymakers and markets expect** [F]:

- **Fed projections (September 2026 SEP):**
  - Median fed funds rate: 4.1% at end-2026 (one more hike), 4.1% for 2027, 3.9% for 2028, 3.2% longer run.
  - 16 of 18 officials expect at least one more hike in 2026.
  - Chair Warsh said the Fed's "predominant focus is on the price stability side" ([Fed & Markets summary](https://www.fedandmarkets.com/p/fomc-september-2026-report)).
- **Prediction markets:**
  - Kalshi: October hike 69–70%, December hike 75–78%, January 2027 hike 46–50%.
  - Polymarket: end-2026 upper bound ≥4.5% at 47.9%, exactly 4.25% at 37.2%, and no 2026 cut at 97%.

### 1.5 Inflation, labor, activity

| Gauge | Latest | Context |
|---|---|---|
| Headline CPI y/y | 3.71% (Aug) | Peak 4.27% in May. 3-month annualized: **0.2%** (Aug), after 8.2% in May, as the energy shock rolled through |
| Core CPI y/y | 2.76% (Aug) | 3-month annualized ~2.0%. **The core has not caught fire** [F] |
| Core PCE y/y | 3.34% (Jul) | 3-month annualized 3.05% |
| PPI final demand y/y | 5.41% (Aug) | — |
| Inflation expectations | UMich 1y 4.0% (Aug); Cleveland Fed 1y 2.64% (Sep) | — |
| Unemployment rate | 4.1% (Aug) | Sahm rule −0.07. Kalshi puts September above 4.0% at ~70% |
| Initial claims, 4-week average | **202k** | **0.7th percentile since 2000** |
| Payrolls, 3-month average | +71k/month | Kalshi: September above 90k ≈ 52% |
| Real GDP | Q2 +1.5% (saar) | **Kalshi: Q3 above 3.0% ≈ 70%** (advance release ~29–30 Oct) |
| UMich sentiment | 51.7 (Aug) | **1st percentile**. Households are miserable despite full employment [F] |

### 1.6 Credit, financial conditions, fiscal

| Gauge | Level | 1y change | Note |
|---|---|---|---|
| HY OAS | 2.93% | +0.17 | Historically tight (long-run average ~5%). FRED now serves only ~3y of ICE history, so percentiles are not meaningful |
| IG OAS / BBB OAS | 0.81% / 0.99% | +0.05 | Near the tightest levels since the late 1990s [I] |
| **CCC OAS** | **11.28%** | **+3.25** | CCC minus BB ≈ 9.5pp. **Stress is concentrated in the weakest borrowers** (software LBOs, private-credit-type credits) |
| EM corporate OAS / Euro HY OAS | 1.40% / 2.79% | — | Calm |
| Chicago Fed NFCI / adjusted NFCI | −0.555 / −0.573 | — | Loose conditions |
| St. Louis Fed Financial Stress Index | −0.91 | — | **4th percentile**: very low stress |
| Economic Policy Uncertainty, 30-day average | 296 | — | **93rd–95th percentile** |
| Federal debt / GDP | 122.6% (Q1-26) | — | Federal interest outlays **$1.247T saar, a record** |
| FY2026 deficit | $2.0T for the first 11 months | — | Per [CBO via CRFB](https://www.crfb.org/press-releases/cbo-estimates-20-trillion-deficit-first-11-months-fy-2026); CBO projects ~$1.9T for the full year |
| M2 | +5.7% y/y (Aug) | — | — |

### 1.7 Currencies

| Pair | Level | YTD | 1y | Note |
|---|---|---|---|---|
| DXY | 101.20 | +3.0% | +3.1% | Broad trade-weighted dollar 119.5 (9/18), 82nd percentile since 2006 |
| EURUSD | 1.1374 | −3.2% | −2.5% | — |
| **USDJPY** | **157.40** | +0.6% | +5.0% | **2026 high close 163.86 (7/29)**; defended by record intervention (§2.6) |
| USDCNY / USDCNH | 6.710 / 6.712 | −4.1% | −5.9% | **The yuan is strong, not under pressure** |
| GBPUSD / USDCHF / AUDUSD | 1.325 / 0.832 / 0.702 | — | — | — |
| **USDINR** | **95.97** | +6.9% | +8.1% | Record close 96.88 (7/24) |
| **USDIDR** | **17,960** | +7.5% | +7.2% | **+2.3% today**; record 18,190 (6/9) |
| USDPHP | 62.45 | +6.1% | +7.6% | Record close 62.88 on 9/21 |
| USDKRW / USDTWD | 1,360 / 31.78 | −5.4% / +1.7% | — | Won strong on the memory boom |
| USDTRY / USDARS / USDEGP | 48.98 / 1,524.5 / 52.05 | +14% / +5% / +9% | — | Crawling depreciations |
| USDHKD | 7.8441 | — | — | Near the 7.85 weak-side limit of the peg band (§2.13) |
| USDSAR | 3.754 | — | — | Peg intact. **yfinance Gulf-peg quotes are corrupt on many days (e.g. SAR shown at 3.64), so do not use them** |

### 1.8 Commodities

| Market | Level | 1y | From peak | Note |
|---|---|---|---|---|
| WTI front (Nov-26) | $93.05–93.29 | +41% | — | **Curve:** Dec-26 $89.39, Dec-27 $74.63, Jun-28 $71.75. Front-month minus the contract 12 months out ≈ **$18 (24%)** |
| **Brent front (Nov-26)** | **$105.7–106.0** | +40% | — | Dec-26 $98.35. **Front-month minus second-month ≈ $7.4 (extreme backwardation).** Brent's 2026 peak was ~$126 intraday (4/30) and $118.35 at the March close |
| EIA Europe Brent spot (FRED) | $114.89 (9/22) | — | — | About $15 over the same-day Nov futures ($99.25), a **physical-market squeeze** |
| Heating oil / diesel | $4.54 | +87% | — | US retail diesel set a record $6.06/gal on 2026-09-11 ([oil chronology](https://en.wikipedia.org/wiki/2026%E2%80%932028_world_oil_market_chronology)) |
| Henry Hub gas (Nov) | $3.15 | +11% | — | Jan-27 contract $3.85 |
| **Gold** | **$4,154.9** | +9% | **−25.6%** from $5,586 intraday (2026-01-29) | **−3.9% today**; 8.8% below its 200-day MA |
| **Silver** | $61.19 | +32% | **−49.6%** from $121.3 (2026-01-29) | On 2026-01-31, gold −12% and silver −31% in one day ([Bloomberg](https://www.bloomberg.com/news/articles/2026-01-31/cme-raises-gold-silver-margins-after-historic-price-plunge)) |
| Copper | $6.61/lb | +40% | −2.8% from $6.80 (2026-09-09) | Contango |
| Uranium (U3O8) | Spot $89.68, term $96.50 (Aug 31); UX front $90.45 | Spot +8.5%, term +16% | — | [Cameco (UxC/TradeTech)](https://www.cameco.com/invest/markets/uranium-price) |
| Grains | Corn 522, wheat 688, soy 1,288 | +24%, +32%, +27% | — | Fertilizer/war pass-through |

### 1.9 Crypto (CoinGecko and yfinance, 9/28)

| Gauge | Level | Note |
|---|---|---|
| **BTC** | **$83,525** | **−33.8% from $126,198 ATH (2025-10-06)**; +44.6% off the 2026-07-01 low of $57,748; +17% above its 200-day MA; 1.26× its 200-week MA ($66.2k); −25.5% over 1y |
| ETH | $2,684 | −45.8% from $4,954 (2025-08-24); ETH/BTC 0.032 (34th percentile) |
| Total crypto market cap / BTC dominance | $2.88T / 58.3% | Stablecoins ≈ $292bn (USDT $184bn, USDC $75bn) |
| **Halving-cycle clock** | 891 days since the 2024-04-20 halving; **357 days since the peak** | See §5-B for the analogs |
| Proxies | IBIT $47.21; MSTR $157 (−67% from ATH); COIN $192 (−54%) | — |

### 1.10 Global markets and other stress gauges

| Gauge | Level | Note |
|---|---|---|
| Nikkei / KOSPI / Taiex | 66,364 / 7,081 / 48,025 | +45% / **+103%** / +83% over 1y. The memory/semis boom; KOSPI is 22% below its 6/22 high |
| Hang Seng / Shanghai / Sensex | 24,510 / 3,888 / 73,896 | −7.5% / +0.9% / −9% over 1y. India is the oil-importer loser |
| DAX / Euro Stoxx 50 / FTSE / CAC | 25,374 / 6,301 / 10,685 / 8,078 | 4%, 4%, 2% and 7% below their highs |
| **JGB 10y / 30y** | **3.07% / 4.11%** (MOF, 2026-09-25) | The 10y touched 3% for the first time since 1996 ([CNBC 2026-09-18](https://www.cnbc.com/2026/09/18/japan-raises-rates-30-year-high-yen-jgb.html)) |
| China 10y government bond (CGB) | **1.69%** (9/28), −21bp over 1y | 1-year loan prime rate 3.0%, 5-year 3.5% ([Trading Economics](https://tradingeconomics.com/china/government-bond-yield)) |
| Bund / OAT / BTP / Gilt 10y | 3.18% / 4.00% / 3.99% / 4.99% | FRED monthly, Aug 2026. **France now yields the same as Italy** |
| Regional banks (KRE) | $70.55 | −5% over 1 month; KRE/SPY at the 1.7th percentile |
| BDC ETF (BIZD) / OWL / BX / KKR / ARES | — | −14% / **−48%** / −35% / −30% / −27% over 1y |
| FSK / OBDC / ARCC | — | −26% / −19% / −6.5% over 1y |
| FINRA margin debt | **$1.45T** (Aug; record $1.50T in June) | **+37% y/y**. Year-over-year surges this fast clustered before the 2000, 2007 and 2021 peaks ([thetrading.tools](https://www.thetrading.tools/margin-debt), [Advisor Perspectives](https://www.advisorperspectives.com/dshort/updates/2026/09/17/margin-debt-finra-august-2026)) |

---

## 2. What is going on (dated and sourced)

### 2.1 The Iran war and the oil supply shock (the dominant macro driver)

**How the war unfolded** [F]:

- **28 Feb 2026:** US/Israeli strikes ("Operation Epic Fury") killed Supreme Leader Ali Khamenei.
- **Early March:** Iran closed the Strait of Hormuz.
- **By 12 March:** Gulf output losses reached at least 10 mb/d.
- **18 March:** Iran struck Qatar's Ras Laffan LNG complex (capacity −17%).
- **Late March:** Brent closed at a $118.35 peak.
- **8 April:** a two-week ceasefire began, then collapsed. The US has blockaded Iranian ports since about 12 April.
- **17–28 June:** a memorandum lifted the "dual blockade," and oil fell to about $70.
- **8 July:** the ceasefire collapsed.
- **September:** a Houthi campaign in Bab al-Mandab, and US–Iran strikes. Brent was back above $100 by 9 September.

Sources: [Wikipedia: 2026 Iran war](https://en.wikipedia.org/wiki/2026_Iran_war), [Economic impact](https://en.wikipedia.org/wiki/Economic_impact_of_the_2026_Iran_war), [oil market chronology](https://en.wikipedia.org/wiki/2026%E2%80%932028_world_oil_market_chronology).

**Today, 28 Sep** [F]: Trump rejected Iran's plan over the weekend. Iran offered to reopen Hormuz and resume nuclear talks within 7 days if the US lifted the blockade and sanctions and unfroze Iranian assets. Brent November traded near $108 in Asian hours ([Al Jazeera, 2026-09-28](https://www.aljazeera.com/economy/2026/9/28/oil-prices-surge-after-trump-rejects-irans-plan-to-reopen-strait-of-hormuz)). Hormuz transits were 132 for the whole week of 21–27 September, against roughly 130 per day before the war.

**How the market is pricing it** [F]:

- The WTI curve slopes from $93 to $75 over 13 months and the Brent curve from $106 to $81.
- Put together with the prediction-market odds below, this means **the market expects the disruption to fade over 2027, but not by year-end.**
- Polymarket odds:
  - Hormuz traffic normal by 31 Oct: 4.5%; by 31 Dec: 22.5%.
  - US announces end of blockade by 31 Oct: 31.5%; by 31 Dec: 58.75%.
  - US–Iran ceasefire holds through 31 Oct: 56.5%.
  - US–Iran final nuclear deal by 31 Dec: 14.5%.
  - Saudi East–West pipeline restarts by 31 Oct: 75%.
  - Crude sets a new all-time high by 31 Dec: 9.5%.
  - US invades Iran before 2027: 14.5%.

**What it means for earnings** [I]: the oil shock is also an earnings tailwind for energy. FactSet has Q3 energy EPS at +111% year over year and refiners at +427%.

### 2.2 Central banks

**The Fed** [F]:

- Kevin Warsh was confirmed 54–45 and sworn in as Chair on 2026-05-22 ([Al Jazeera](https://www.aljazeera.com/economy/2026/5/22/kevin-warsh-sworn-in-as-new-us-fed-chair)).
- On 16 September the FOMC voted 12–0 for +25bp to 3.75–4.00%, the first hike since July 2023. The statement: "Inflation remains elevated."
- Projections: fed funds median 4.1% at end-2026 and 2027, 3.9% for 2028, 3.2% longer run. 16 of 18 officials see at least one more hike ([Fed & Markets](https://www.fedandmarkets.com/p/fomc-september-2026-report)).
- Remaining meetings: 27–28 Oct, 8–9 Dec (with projections), 26–27 Jan 2027, 16–17 Mar 2027 ([federalreserve.gov](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)).

**What that implies** [I]: the Fed is hiking into a *supply* shock while core CPI's 3-month annualized rate is about 2%. It is a credibility-driven policy choice (a new chair, and a president who wants cuts). This raises the odds of an eventual "one-and-done plus a pause" if oil fades. It also raises the odds of an overtightening growth scare in 2027.

**The ECB** [F]: +25bp to a 2.50% deposit rate on 10 September (effective 16 September), the second hike in three months. August eurozone HICP was 3.3%, with energy inflation at 14.3% ([Euronews](https://www.euronews.com/2026/09/10/ecb-hikes-rates-to-25-as-energy-shock-pushes-eurozone-inflation-higher)). On 28 September Lagarde said "measured" hikes remain appropriate ([US News/Reuters](https://money.usnews.com/investing/news/articles/2026-09-28/measured-ecb-hikes-to-quell-inflation-remain-appropriate-lagarde-says)). Polymarket puts an October ECB hold at 75%.

**The BoJ** [F]: +25bp to 1.25% on 18 September (7–2 vote), the highest rate since 1995, three months after the June hike ([CNBC](https://www.cnbc.com/2026/09/18/japan-raises-rates-30-year-high-yen-jgb.html)). The next meeting is 29–30 October ([BoJ](https://www.boj.or.jp/en/about/calendar/index.htm)). Polymarket puts an October hike at 27.5%.

### 2.3 The bond rout, fiscal policy, and Treasury issuance

**The rout itself** [F]:

- The 10-year rose from 4.76% (31 Aug) to 5.24% (28 Sep), and the 30-year from 5.25% to 5.56%.
- On 28 September the move was driven by oil and "global pressure on government bonds." CNBC noted that 5.25% on the 10-year is the July-2007 level and that some strategists now discuss 6% ([CNBC, 2026-09-28](https://www.cnbc.com/2026/09/28/treasury-yields-bonds-selloff.html)).
- The BofA Fund Manager Survey's #1 tail risk is a "disorderly rise in bond yields" (33%).

**Treasury financing** [F]:

- The August refunding kept coupon sizes unchanged "for at least the next several quarters," funding the increase with bills.
- Treasury doubled its long-end liquidity-support buybacks to at least $4bn per operation ([Treasury](https://home.treasury.gov/news/press-releases/sb0607)).
- The next refunding announcement is expected around 4 November (typical first-Wednesday timing; unverified).

**The fiscal picture** [F]: debt/GDP is 122.6%, interest outlays are $1.25T annualized (a record), and the FY26 deficit is about $1.9–2.0T (roughly 6% of GDP).

**The funding deadline** [F]: a shutdown was averted. The CR signed on 2 September (Senate 90–6, House 370–48) funds the government to **11 December 2026** ([govtschemes summary](https://govtschemes.org/government-shutdown-october-2026/), secondary source).

**Assessment** [I]: the yield rise has an oil/inflation component, a policy-path component (2y +130bp over 1y), and a term-premium/fiscal/global component (term premium +50bp over 1y; JGBs at multi-decade highs). Only the first two unwind cleanly on peace.

### 2.4 The AI capex cycle: accelerating, but increasingly debt-funded

**Demand is still accelerating** [F]:

- **Nvidia, Q2 FY27** (quarter to 2026-07-26, reported 2026-08-26):
  - Revenue $96.2bn, +106% y/y. Data center $89.0bn, +117%. Gross margin 75.0%.
  - Q3 guide **$108bn ±2%**, with China compute excluded ([SEC 8-K](https://www.sec.gov/Archives/edgar/data/0001045810/000104581026000073/q2fy27pr.htm)).
- **Hyperscaler 2026 capex guidance after Q2 calls totals about $720–745bn (+77% y/y):**
  - Amazon ~$220bn, Alphabet $195–205bn, Meta $130–145bn, Microsoft ~$175bn.
  - Evercore/BofA model 2027 above $1T ([TMT Finance](https://www.tmtfinance.com/intel/2026-hyperscaler-capex-tops-us700bn-analysis); search summaries of company reports).

**The strains are showing** [F]:

- **Cash flow:** Alphabet posted its first negative free cash flow since its IPO (−$5.9bn in Q2), and Meta's FCF was about $0.8bn (search summary; verify against 10-Qs).
- **Bond issuance:** AMZN/GOOGL/META/ORCL issued about $194bn of bonds in 2026 through 7 July (+79% versus all of 2025). Goldman sees about $250bn in 2026 and $400bn in 2027. AI-tagged debt is about 15% of US IG, and hyperscaler spreads have widened about 10bp ([Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/hyperscaler-debt-binge-pushes-yields-134825104.html)).
- **Oracle:**
  - About $130bn of debt. S&P downgraded it to BBB−, and its CDS was at the highest since 2008 (search summary).
  - At least $300bn of its $523bn remaining performance obligations is tied to OpenAI.
  - It had its worst week since 2001 in late June ([CNBC, 2026-06-26](https://www.cnbc.com/2026/06/26/oracle-stock-ends-worst-week-since-2001-as-investors-dwell-on-finances.html)).
- **OpenAI:** raised $122bn at an $852bn post-money valuation. Cash burn is projected at about $27bn in 2026 and $63bn in 2027 ([OpenAI](https://openai.com/index/accelerating-the-next-phase-ai/); secondary reports).

**Memory** [F]: DRAM pricing is on track for +275–300% over 2025–27 ([Motley Fool, 2026-09-02](https://www.fool.com/investing/2026/09/02/is-the-memory-supercycle-peak-near-for-micron-and/), secondary). MU is now a top-10 SPY holding (1.6%) with a market cap of about $1.19T.

**Assessment** [I]: the cycle is still *accelerating* at the chip level. The strain sits in the *financing layer* (Oracle, CoreWeave, OpenAI's dependents, private credit's software books) and in the stocks' extreme crowding. The next hard data are Q3 hyperscaler calls (late October) with first 2027 capex guides, and Nvidia's report (around 18–19 November, typical timing, unverified).

### 2.5 Private credit

**Redemptions and gates (Q1 2026)** [F]: requests to redeem ran at 40.7% of shares in Blue Owl's OTIC fund, 21.9% in OCIC, about 16.8% in Apollo ADS, 11.6% in Ares ASIF, and 9.3% in BlackRock HLEND. **All were gated at 5%**, leaving about $4.2bn unfulfilled. Blackstone put up $400m of its own and executives' money so BCRED could meet all $3.8bn of requests.

**Pricing and credit quality** [F]:

- FSK traded at about 55–58% of NAV (July). A KKR tender was priced at $11 against an $18.83 NAV.
- OBDC cut its dividend 16% after its fifth straight NAV decline.
- Software is 20–26% of BDC assets. A record $25bn of software leveraged loans traded below 80 cents (Feb 2026).
- Payment-in-kind interest is above 7% of BDC income (sources: [A.L. Capital Advisory](https://alcapitaladvisory.com/research/intelligence/private-credit.html) (secondary); [CNBC 2026-04-02](https://www.cnbc.com/2026/04/02/blue-owl-private-credit-funds-redemptions-requests.html)).
- Fitch's private-credit default rate has been at or above 6.0% every month since April, and 6.1% for the period to July 2026 (search summary, unverified primary).

**Assessment** [I]: this is a *structural packaging* problem (semi-liquid wrappers holding illiquid loans) plus *sector* losses (software disrupted by AI). There is no bank-run dynamic yet: KRE is only −5% over one month and HY spreads are near 2.9%. The "second phase," write-downs, is expected in Q3 marks (late October to early November).

### 2.6 Japan: the currency floor and JGBs

**Intervention** [F]:

- The MoF bought yen after USDJPY broke 160: **¥11.73tn in April–May**, then **¥15.4tn between 30 July and 26 August**.
- The 31 July operation was a **joint US–Japan intervention** (Japan about ¥8.45tn; US Treasury up to about $26bn). USDJPY went from about 164 to 155.20 ([Wikipedia](https://en.wikipedia.org/wiki/2026_U.S.%E2%80%93Japan_yen_intervention); [CNBC 2026-08-03](https://www.cnbc.com/2026/08/03/yen-intervention-us-japan-trump-bessent-katayama.html)).
- Finance Minister Katayama "will not hesitate to conduct further coordinated interventions."

**JGBs** [F]: the 10-year is at 3.07% and the 30-year at 4.11% (MOF, 25 September).

**Assessment** [I]: the yen carry trade is alive (US 2y 4.87% vs JGB 2y 1.95%), but official policy now puts a *de facto ceiling* around 160–164. Rising JGB yields also raise the risk that Japanese investors repatriate money, which feeds US term premium.

### 2.7 China

- **Trade** [F]: the Trump–Xi summit (23–25 September) extended the trade truce by two months to **10 January 2027**, cut tariffs on $30bn of imports, and set up an agriculture working group. Deliverables on rare earths, AI and Taiwan were "limited and tentative" ([CNBC 2026-09-25](https://www.cnbc.com/2026/09/25/trump-xi-summit-takeaways.html); [Al Jazeera](https://www.aljazeera.com/economy/2026/9/24/hostile-but-hooked-whats-behind-the-us-china-trade-truce-extension)).
- **Markets** [F]: the CGB 10-year is 1.69%, the yuan is strong (6.71), and China equities are weak (KWEB −40% over 1y).
- **Security risks (Polymarket)** [F]: China invades Taiwan by end-2026 3.5%; China–Philippines military clash before 2027 26.5%.

### 2.8 Europe

- **Inflation and rates** [F]: eurozone inflation is 3.3% (August) and the ECB has hiked twice. France's 10-year yield equals Italy's (about 4.0%, August).
- **Markets** [F]: European equities are 2–7% below their highs, and the FTSE 100 is +15% over one year.
- **Assessment** [I]: an energy-importer stagflation mix, with French fiscal risk priced at parity with Italy's.

### 2.9 US politics, tariffs, trade

**Midterms (3 November)** [F]:

- Generic ballot about D+8 (a cycle high). Emerson (21–22 September) has D+11 ([Emerson](https://emersoncollegepolling.com/september-2026-national-poll-democrats/)).
- Polymarket: Democratic House 92.5%, Democratic Senate 62.5%. Balance-of-power odds: D/D 61.5%, R Senate/D House 30.5%, R/R 7.5%.
- Implication [I]: a divided government from January 2027 means fiscal gridlock and probably less new stimulus. The next funding fight is on 11 December.

**Tariffs** [F]:

- The Supreme Court struck down the IEEPA tariffs on 2026-02-20 (*Learning Resources v. Trump*). About $166bn of refunds are being processed ([Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/20f2de87/potential-refunds-us-supreme-court-overturns-ieepa-tariffs); [Greenberg Traurig](https://www.gtlaw.com/en/insights/2026/5/us-tariff-update-section-122-duties-found-unauthorized-by-law-ieepa-refunds-under-way)).
- The replacement 10% global Section 122 tariff was ruled unlawful by the Court of International Trade on 2026-05-07. The Federal Circuit stayed that ruling on 12 May, so collection continues pending appeal ([Skadden](https://www.skadden.com/insights/publications/2026/05/us-trade-court-strikes-down-section-122-tariffs)).
- Implications [I]: the refunds are a quiet corporate cash tailwind. The appeal outcome is an unscheduled catalyst.

### 2.10 Crypto

**2026 so far** [F]:

- BTC fell below $58k in late June (a 20-month low). Spot ETFs lost about $4.5bn of net flows in June; IBIT accounted for about 75% of that, and there was a 10-day outflow streak.
- Strategy (MSTR) made a small, symbolic BTC sale (32 BTC in late May) ([bitcoin.com](https://news.bitcoin.com/bitcoin-falls-below-58000-q2-2026/); secondary).
- BTC has since recovered 45% off the low.

**Regulation and flows (Polymarket)** [F]: CLARITY Act signed in 2026: 5.3%. Strategy margin-called in 2026: 5.1%. Current ETF flow data could not be verified: Farside returned 403, so this is a data gap.

### 2.11 Precious metals

**The blow-off and crash** [F]: silver ran from about $30 at the start of 2025 to $121 on 29 January 2026. On 31 January gold fell 12% and silver 31% in a single day, the largest drop since 1980. CME then raised margins ([Bloomberg](https://www.bloomberg.com/news/articles/2026-01-31/cme-raises-gold-silver-margins-after-historic-price-plunge)). Gold fell another 3.9% today.

**Assessment** [I]: a 2.85% real yield (the highest since 2007–08) and a firm dollar are headwinds. After blow-off tops, metals typically base for months to years (1980, 2011).

### 2.12 Froth and sentiment

**Individual investors** [F]:

- **AAII** (week ending 23 Sep): bullish 32.7%, neutral 19.2%, **bearish 48.1%**, against historical averages of 37.5/31.0/31.5 ([AAII](https://www.aaii.com/sentimentsurvey)).
- **CNN Fear & Greed:** about 34–37, "Fear" ([Benzinga, late Sept](https://www.benzinga.com/markets/market-summary/26/09/62013727/dow-rises-sharply-as-oil-retreats-investor-sentiment-improves-but-greed-index-remains-in-fear-zone); cnn.com blocked, HTTP 451).

**Institutions: BofA Fund Manager Survey, 15 September** [F]:

- Cash 3.9%, up from 3.5%.
- Net overweight equities 49%. **Net underweight bonds −48%, the most since May 2022.**
- 55% expect "no landing."
- **Bull & Bear indicator 9.5, a "sell" signal.**
- Most crowded trade: long semis (53%). #1 tail risk: disorderly bond yields (33%).

Sources: [Finvaulta](https://finvaulta.com/research/bank-of-america/global-fund-manager-survey-racing-the-frontier-2026-09-15); [Investing.com](https://www.investing.com/news/stock-market-news/bofa-survey-shows-investor-cash-levels-rise-amid-policy-concerns-93CH-4901056).

**Leverage and speculation** [F]:

- Margin debt: $1.45T, +37% y/y.
- Leveraged ETFs over 1y: SOXL +318%, TQQQ +52%.
- High-beta/low-vol at its 99.8th percentile.

**IPOs** [F]:

- SpaceX (SPCX) IPO'd on 2026-06-12 at $135, raising about $75bn at a $1.75T valuation (the largest IPO ever). It closed its first day at $161, peaked at $225.64, bottomed at $104.83, and is now $145.47.
- The 2025 IPO class has been crushed. Measured from first-day closes: FIG −82%, GEMI −84%, KLAR −71%, BLSH −47%. CBRS is −37% since its May 2026 debut.
- Polymarket: Anthropic IPO by 31 December 2026: 74.5%.

**Data gap:** retail options volume and leveraged-ETF flow data could not be pulled (the OCC site and other sources returned 403).

**Assessment** [I]: froth is **institutional and concentrated** (semis, memory, Korea/Taiwan, margin debt, record analyst Buy ratings, the IPO supply wave), not broad retail euphoria. Retail sentiment surveys are *fearful*, which has historically been mildly contrarian-bullish.

### 2.13 Currency pegs and central-bank floors under pressure

| Peg or floor | Status (2026-09-28) | Assessment |
|---|---|---|
| **USDJPY ceiling ~160–164 (MoF/UST)** | 157.40; two record interventions in 2026 | **Most important "floor" in markets.** Credible to about 164 so far [I] |
| HKD peg band 7.75–7.85 | 7.844, near the weak side | The Fed hiking widens the SOFR–HIBOR gap. At 7.85 the HKMA must drain HKD, which tightens HK liquidity (property and banks). Low probability of a break [I] |
| India (RBI) and Indonesia (BI) managed floats | INR 95.97 (record 96.88); IDR 17,960 (record 18,190) | Oil-import squeeze and reserve spending. Watch IDR 18,190 and INR 97 [I] |
| Gulf pegs (SAR, AED, QAR) | Spot at pegs (SAR 3.754) | War damage (Gulf real estate −30% since March, per Wikipedia) versus high oil revenue. **Forward points not available; unverified**, so the risk cannot be quantified |
| EURDKK | 7.4757 | No pressure |
| Turkey/Argentina/Egypt | Crawling or managed depreciation | Not "breaks" |

---

## 3. Regime classification

| Dimension | Reading | Signal |
|---|---|---|
| Growth | Claims at the 0.7th percentile; Q3 GDP likely above 3% (Kalshi 70%); EPS +29% y/y | **Overheating expansion** ("no landing") |
| Inflation | Headline 3.7%, core PCE 3.3%, but core CPI 3m ~2% and 5y5y 2.34% | **Supply-shock inflation**; core not de-anchored |
| Policy | Fed, ECB and BoJ hiking; Fed real rate ≈ +0.5% | **Re-tightening** from low real rates |
| Long rates | 10y at a 19-year high; term premium at a 16-year high; real 10y at 99.6th percentile | **Global bond bear market** |
| Equities | Near highs; record narrowness; CAPE 41.5; forward P/E 19.2 on a 32% EPS boom | **Late-cycle, selectively euphoric** (semis/memory/Asia tech) |
| Credit | IG/HY near tights; CCC 11.3%; private-credit defaults ~6%; gates | **Bifurcated**: stress confined to the weak tail |
| Financial conditions | NFCI −0.56; STLFSI at 4th percentile | **Loose** |
| Sentiment/positioning | Retail fearful; institutions long equities, short bonds, low cash | **Mixed**: fragile to a bond shock |
| Geopolitics/event risk | Active war; Hormuz ~15% of normal; midterms; truce deadlines | **Extreme two-way event risk** |

**Label** [I]: "**Late-cycle expansion under a stagflationary supply shock and global monetary re-tightening**." It is not index-level euphoria (the forward P/E is moderate) and not crisis (financial conditions are loose). But the market combines euphoric pockets, sectoral stress, and a bond market in a disorderly phase.

On the requested scale (late-cycle / euphoria / stress / crisis), it sits between **late-cycle and stress**, and it tilts toward stress in rates and private credit.

**Scenario weights for the next 3–6 months** [S]. They overlap and are rough.

| Scenario | Prob. | What it looks like | Winners | Losers |
|---|---|---|---|---|
| 1. Grinding war plus Fed "one or two more" | **45%** | Brent $85–110; 10y 5.0–5.6%; S&P ±8% with rotation | Energy, value, T-bills | Duration, homebuilders, EM importers |
| 2. De-escalation / Hormuz reopening path | **25%** | Front-month Brent to $70–85; 2y −40–60bp; 10y −25–50bp; yen and EM importers rally | Duration, yen, India, small caps, homebuilders, airlines | Energy, oil vol, USD |
| 3. Escalation / stagflation | **15%** | Brent above $120; CPI above 4.5%; 10y above 5.75%; S&P −15–25% | Oil (calls), USD, vol | Equities, credit, EM Asia FX |
| 4. Non-oil accident: bond auction/Japan/fiscal, private-credit contagion, AI-financing wobble | **15%** | 10y near 6% or credit gapping; S&P −10–20%, followed by a policy response (buybacks, end to hikes, yield-curve-control talk) | Vol, T-bills, eventually duration | Crowded AI, alt managers, BDCs |

---

## 4. Scheduled catalysts, next 3–6 months

The dates are confirmed except those marked "~", which are typical schedules and unverified.

| Date | Event | Market-implied or consensus (9/28) |
|---|---|---|
| Oct 2 (Fri) | September jobs report ([BLS](https://www.bls.gov/schedule/news_release/empsit.htm)) | Kalshi: payrolls above 90k ≈ 52%; unemployment above 4.0% ≈ 70% |
| ~Oct 4 → Nov 16 | **BTC cycle-trough window** (cycle peak + 363–406 days) | §5-B |
| Oct 14 (Wed) | September CPI ([BLS](https://www.bls.gov/schedule/news_release/cpi.htm)) | Kalshi: y/y above 3.5% ≈ 84%, above 3.6% ≈ 37% |
| Oct 15 / Oct 31 | Polymarket deadlines: Saudi East–West pipeline restart (51% / 75%); US ends blockade (18% / 31.5%) | — |
| ~Oct 13–30 | Q3 earnings (banks first; MSFT/GOOGL/META/AMZN/AAPL in the last week): **first 2027 capex guides** | FactSet Q3 EPS +29.1% |
| Oct 27–28 | FOMC (no projections) | Hike ≈ 69% |
| ~Oct 29 | ECB | Hold 75%, hike 24% |
| Oct 29–30 | BoJ, with Outlook Report | Hike 27.5% |
| ~Oct 29–30 | Q3 GDP advance estimate | Kalshi: above 3.0% ≈ 70% |
| **Nov 3** | **US midterms** | D House 92.5%, D Senate 62.5% |
| ~Nov 4 | Treasury quarterly refunding | Coupons unchanged "for several quarters"; watch bill share and buybacks |
| Nov 6 / Nov 10 | October jobs / October CPI | — |
| ~Nov 18–19 | Nvidia Q3 FY27 | Guide $108bn ±2% |
| ~Q4 | Private-credit Q3 NAV marks; possible Anthropic IPO (Polymarket 74.5% by 31 Dec) | Watch BDC discounts and IPO supply |
| Dec 4 | November jobs | — |
| **Dec 8–9** | FOMC with projections | Hike ≈ 77% |
| Dec 10 | November CPI | — |
| **Dec 11** | **CR expires** (shutdown risk) | — |
| Dec 31 | Polymarket deadlines: Hormuz normal (22.5%), blockade ends (58.75%), nuclear deal (14.5%), BTC ATH (7.5%) | — |
| **Jan 10, 2027** | **US–China truce expiry** | — |
| Jan 26–27, 2027 | FOMC | Hike ≈ 46–50% |
| Mar 16–17, 2027 | FOMC with projections | — |
| Unscheduled | Iran talks and strikes; Houthi/Bab al-Mandab; Section 122 appeal; MoF intervention; OPEC+ meetings; hurricane season (to 30 Nov) | — |

---

## 5. Candidate asymmetric setups visible now

**Pricing basis.** All prices are yfinance chain quotes at the 9/28 close. "Fill" is the realistic retail price: pay the ask on long legs and receive the bid on short legs. "RN" is the risk-neutral probability N(d2) from the strike's implied vol (`implied_probs.py`). RN overstates real-world downside odds because of risk premia.

**Payoff multiples** are the value at expiry divided by the debit at mid.

**My probabilities are [S].**

### Summary table

| # | Setup | Direction / expression | Debit (% of spot) | Max × | Key catalyst window | Strength | Status |
|---|---|---|---|---|---|---|---|
| A | **Peak US yields / peace convexity** | TLT Mar-19-27 81/88 call spread (or 2y/front-end exposure for the peace leg) | $1.40 (1.8%) | 5.0× | Oct–Dec (FOMC, Iran, midterms) | Moderate | **Watch; enter on triggers (fairly priced today)** |
| B | **BTC halving-cycle trough** | IBIT Dec-17-27 50/70 call spread, or staged spot | $5.25 (11.1%) | 3.8× | Oct 4–Nov 16 trough window → 2027 | Moderate/speculative | **Watch; enter on trigger** |
| C | **Uranium at an NAV discount** | SPUT (U-UN.TO / SRUUF) outright; CCJ Mar-27 90/120 call spread | SPUT −11.7% vs NAV; CCJ $7.28 (8.4%) | CCJ 4.1× | 6–12 months | Moderate (SPUT) | **Watch; enter on trigger** |
| D | **Yen upside vs the intervention ceiling** | FXY outright (options illiquid) | — | ~+12% / −5% | BoJ Oct 30; Fed pause; risk-off | Moderate (low payoff) | Watch; best near USDJPY 160+ |
| E | Equity tail hedge | SPY Mar-19-27 705/610 put spread | $7.91 (1.0%) | 12× | Any | Hedge (negative EV alone) | **Conditional only** |
| F | Memory/semis cycle top | MU Mar-27 950/690 or SMH 540/420 put spreads | 7.5% / 4.0% | 3.3× / 5.0× | Late-Oct capex guides; NVDA ~Nov 19 | Speculative | Watch (no trigger yet) |
| G | Oil binary (hedge) | USO Dec-18-26 135/105 puts (peace) / 165/210 calls (escalation) | 3.8% / 4.2% | 5.3× / 7.1× | Iran deadlines | Hedge; fairly priced | Use only to offset A–D or E exposures |
| H | Private credit, two-sided | Long: BX Mar-27 120/155 calls. Short: HYG/KRE puts (illiquid chains) | 6.5% | 4.7× | Q3 NAV marks (late Oct–Nov) | Speculative | Watch |
| I | Gold after the crash | GLD Mar-27 390/445 call spread | 3.8% | 3.8× | Real-yield peak | Speculative | Watch |
| J | Midterm seasonality | Bias: don't initiate index shorts into Nov–Dec without E's triggers | — | — | Nov 3 → Q4 | Weak (n=9) | Tilt only |

**Correlation warning** [I]: A, D, I, G-puts, and to a degree C and India/homebuilders all win in scenario 2 and lose in scenario 3. **Treat them as one "US-yields/oil peak" factor with a single risk budget.** E and G-calls are the natural hedges for that factor.

### A. Peak US yields / peace convexity (long duration via TLT call spread)

**Thesis.** The long end prices a decade of high short rates:

- The 10-year (5.18%) minus Kim–Wright term premium (0.96%) leaves about **4.2% as the expected average short rate over 10 years**. The Fed's longer-run dot is 3.2%.
- The term premium is at a 16-year high.
- Positioning is extremely short bonds (FMS −48%, the most since May 2022).

Meanwhile, the inflation impulse is mostly energy:

- Core CPI's 3-month annualized rate is about 2%.
- The 5y5y forward is 2.34%.
- The 2y prices about 100bp of hikes.

If the oil shock fades, or the economy cracks, the hiking path gets priced out.

**Why it may be mispriced** [I]: extrapolation of a supply shock into a permanent policy path; forced de-risking (MOVE spiked to 104.6); and the JGB spillover.

**Counterpoint** [F]: from 26 May to 30 June 2026, Brent fell about 27% (from ~$99.6 to ~$72.9). The 10-year barely moved: 4.49% to 4.42%, with a low of 4.37% on 26 June. The long end has its own fiscal, term-premium and global drivers. **Peace may help the front end far more than TLT**, so I keep this setup at "moderate."

**Catalyst and timeframe:** 2 Oct and 14 Oct data; FOMC on 28 Oct and 9 Dec; refunding ~4 Nov; midterms (divided government → gridlock); Iran (Polymarket: blockade ends by 31 Dec, 58.75%). Horizon: to March 2027.

**Probabilities and payoff (by 2027-03-19)** [S]:

| Case | 20–30y yield move | Probability | TLT call spread |
|---|---|---|---|
| Bull | −85bp or more (TLT ≥ 88) | 10% | 5.0× |
| Base-bull | −35 to −85bp | 20% | ~1–4× |
| Base | ±35bp | 40% | ~0 |
| Bear | +35bp or more | 30% | 0 |

RN: P(TLT > 81) = 34%, P(TLT > 88) = 10.7%. My odds are at or slightly below the risk-neutral ones, and June showed how weakly the long end reacts to oil relief. **Today the structure is fairly priced at best, with no edge.** It becomes attractive only after a capitulation (much higher yields at the same premium) or a clear de-escalation signal. Those are the upgrade triggers below.

**Cheapest sensible expression:**

- **TLT Mar-19-2027 81/88 call spread.** Buy the 81 call (bid/ask 1.80/1.84, IV 13%, open interest 3,167) and sell the 88 call (0.41/0.43, IV 14%, open interest 6,383).
- Debit about **$1.40** (fill $1.43), **1.8% of spot**, maximum 5.0×.
- TLT 3–6 month ATM IV is about 14%, against 60-day realized vol of 10.1%, so the options are not cheap.
- **Alternative:** stage into TLT or ZROZ outright (about 4.8–5.5% yield while you wait).

**What proves it wrong:** 10y above 5.60% with 5y5y above 2.6% or core CPI 3-month annualized above 3.5%; Fed dots adding two or more hikes; 10y/30y auctions tailing more than 2bp repeatedly; JGB 30y above 4.5%; Brent above $120.

**Monitor:** 10y/30y, 5y5y, Kim–Wright term premium, MOVE, 2y minus effective fed funds, auction tails, JGB 30y, Brent front-month minus second-month, Hormuz transits, Polymarket blockade odds.

**Upgrade to a full recommendation if any of these fire:**

1. **Capitulation:** 10y ≥ 5.50% **and** MOVE ≥ 110 **and** FMS bond underweight at or beyond −45% (a "washout").
2. **De-escalation:** Polymarket "Hormuz normal by 31 Dec" above 50%, or a signed US–Iran framework.
3. **Hikes being priced out:** 2y minus effective fed funds below +50bp while the 10y is still above 5.0%.

### B. BTC halving-cycle trough accumulation

**Thesis** [F]: the four-year cycle has tracked history closely in *timing*:

| Halving | Peak (days after halving) | Peak → trough | Trough date |
|---|---|---|---|
| 2012 | 2013-12-04 (371d) | −85% in 406d | 2015-01 |
| 2016 | 2017-12-17 (526d) | −84% in 363d | 2018-12-15 |
| 2020 | 2021-11-10 (548d) | −77% in 376d | 2022-11-21 |
| **2024** | **2025-10-06 (534d)** | **−54% so far** (low $57,748 on 2026-07-01, day 268) | — |

On timing, the final trough would fall around **4 Oct – 16 Nov 2026**. The subsequent 12–24 months into and after the next halving (about April 2028) have historically been the best risk/reward window. The drawdown is shallower this cycle, which is consistent with ETF institutionalization. Price is +45% off the low, 17% above its 200-day MA, and 1.26× its 200-week MA.

**Why it may be mispriced** [I]: IBIT options imply only 18% RN probability of BTC above ~$124k (IBIT 70) by December 2027, and 38.5% of IBIT above 50 (about $88k). The cycle analogs suggest ~25–30% for the former. But n = 3, and the cycle may be breaking because of ETFs and macro dominance. **This is a weak statistical base.**

**Catalysts:** the trough window; a Fed pause (liquidity); ETF flows turning positive after June's −$4.5bn; Strategy/MSTR stability. Regulation is not a 2026 catalyst (CLARITY Act 5.3%).

**Probabilities (to 2027-12-17)** [S]:

| BTC level | Probability | IBIT call spread |
|---|---|---|
| Above $124k | 25–30% | 3.8× |
| $88–124k | ~25% | ~0.5–3× |
| $70–88k | 20% | 0 |
| Below $70k | 25–30% | 0 |

Polymarket (by 31 Dec 2026): $100k 35.5%, dip to $70k 33%, dip to $60k 14%.

**Cheapest expression:**

- **IBIT Dec-17-2027 50/70 call spread.** Buy the 50 call (9.10/9.30, IV 50%, open interest 6,672) and sell the 70 call (3.85/4.05, IV 48%, open interest 19,867).
- Debit about **$5.25** (fill $5.45), 11% of spot, maximum 3.8×. BTC at $110k gives about 2.3×.
- **Or** buy spot BTC/IBIT in three tranches through the window, with a **weekly-close stop below $55k** (under the July low). This has no decay, but full downside to the stop (about −35%).

**What proves it wrong:** a weekly close below $57.7k, which means the bear market isn't over and the cycle analog failed; monthly ETF outflows above $5bn; stablecoin supply shrinking; MSTR forced selling.

**Monitor:** BTC vs its 200-day and 200-week MAs; spot-ETF 4-week net flows; stablecoin market cap ($292bn); MSTR mNAV; perpetual funding; days since peak.

**Upgrade triggers.** After 4 October, **either**:

1. BTC holds above $70k with 4 consecutive weeks of positive ETF net flows, **or**
2. A capitulation retest of $58–65k is followed by a weekly close back above $70k.

### C. Uranium via the SPUT NAV discount (plus optional CCJ upside)

**Thesis** [F]: physical uranium is firm while the equity wrapper sits at a discount.

- Spot U3O8 is $89.68 and the term price $96.50 (31 August, UxC/TradeTech via Cameco). The term price is +16% over one year and still rising.
- The equities have de-rated with the "AI-power" unwind and higher real yields: URNM −21% over 1y, CCJ −35% from its January 2026 high.
- **SPUT trades at −11.7% to NAV** (US$19.00 vs NAV US$21.52 on 25 September; 81.7m lb held; [Sprott](https://sprott.com/investment-strategies/physical-commodity-funds/uranium/)). That is uranium at about **$80/lb effective, 17% below the term price.**
- The war-driven Asian/European energy-security push and the US ban on Russian enriched-uranium imports (waivers through end-2027) are structural supports [I].

**Why it may be mispriced** [I]: flow and sentiment spillover from the AI-power and long-duration selloff, not the physical market. A closed-end discount of this size tends to close when sentiment turns, or through buybacks.

**Catalyst:** a halt to SPUT's at-the-market issuance or a buyback; term-contracting announcements; Kazatomprom guidance; US strategic-reserve action. Horizon 6–12 months.

**Probabilities (12 months)** [S]:

| Case | Probability | SPUT |
|---|---|---|
| Bull: spot $105–115, discount closes | 25% | +35–50% |
| Base | 35% | +10–20% |
| Flat | 15% | ~0 |
| Bear: spot $70, discount −15% | 25% | −25–30% |

**Cheapest expression:**

- SPUT outright (TSX U-UN or OTC SRUUF): no option decay, and **the discount is the "cheapness."**
- For leverage: CCJ Mar-2027 90/120 call spread at $7.28 (8.4% of spot; maximum 4.1×; RN P(CCJ > 120) = 14%).
- **Do not** use URA/URNM options: implied vol is 46–53% and they add no advantage.

**What proves it wrong:** spot below $80 with the term price falling; the discount widening beyond −15% with no buyback; hyperscaler nuclear PPAs cancelled.

**Upgrade triggers:** discount at least 12% **and** term price at least $95 **and** URNM reclaims its 200-day MA (now −21% below it); or SPUT announces a buyback.

### D. Yen upside against an intervention-capped USDJPY

**Thesis** [F]: Japan, with US participation on 31 July, spent ¥27tn in 2026 defending about 160–164. The BoJ is hiking faster (June and September; October odds 27.5%). The JGB 10-year is 3.07%.

**Base rate** [F]: after past intervention episodes (1998, 2011×3, 2022×2, 2024×2), USDJPY was 3–14% lower within 6 months in 6 of 8 cases (`analyze_event_studies.py`). The exceptions were during 2011's zero-rate era. **Success needed a turn in US rates**, the same factor as Setup A.

**Payoff (FXY outright)** [I]:

| USDJPY | FXY |
|---|---|
| 165 (cap fails) | −4.6% |
| 148 | +6.4% |
| 140 | +12.4% |

The negative carry against T-bills is about −1.5 to −2% over 6 months.

**Probabilities (6 months)** [S]:

| USDJPY | Probability |
|---|---|
| Below 145 | 25% |
| 145–155 | 30% |
| 155–162 | 35% |
| Above 162 | 10% |

The expected excess return is only about +2% unlevered, so the **payoff is small for a "% return" objective.** It is useful as a diversifier or hedge for A.

**Expression:** FXY outright. **FXY options are too illiquid:** the Mar-27 60 call is 1.00/1.40 with open interest 579, and the 64 call has 0 bid and open interest 4. Sophisticated users can use CME yen futures options.

**What proves it wrong:** USDJPY above 165; the BoJ pausing; the US 2-year above 5.25%.

**Upgrade trigger:** USDJPY **at 160 or above again**, where the downside to the cap is about 3% and the upside to 145 about 10%, **and** Setup A's triggers are firing.

### E. Equity tail hedge (conditional)

**Case for it** [F]: CAPE 41.5; equity–bond yield gap about 0; record narrowness; margin debt +37% y/y; B&B "sell" at 9.5; the most crowded trade is semis; real yields at 2.85%; a Fed hiking into a supply shock; EPS growth decelerating to about 2% by Q2-27.

**Case against it** [F]:

- **"Calm near highs"** (VIX below 17 and S&P within 2% of its high; n = 62): the chance of a drawdown of 10% or more within 3 months was 8%, against a 14% base rate.
- **Bond-shock months:** not bearish on average (n = 59).
- **Midterm Q4 seasonality:** positive.
- The EPS boom is real.

**Pricing** [F]: SPY Mar-19-2027 705/610 put spread. Buy the 705 put (12.76/12.81, IV 17%) and sell the 610 put (4.86/4.89, IV 25%) for **$7.91 = 1.03% of spot**. Maximum 12×; S&P −15% gives 6.9×. RN P(SPY < 705) = 22%, against my real-world estimate of about 15% [S]. **Negative EV on its own; buy it as insurance.**

**Turn it on when two or more of these fire:**

- HY OAS above 3.50%, or CCC above 13%.
- RSP/SPY makes a new low while SPX closes below its 50-day MA.
- 10y at 5.50% or above with MOVE at 110 or above.
- VIX/VIX3M above 1.0 for 3 or more days.
- A hyperscaler cuts or flattens its 2027 capex guide.
- Nvidia guides below consensus.
- Brent above $120.

Prefer buying **after** events, when implied vol has collapsed, unless the event itself is the thesis.

### F. Memory/semis cycle top (watch list, short)

**Case for it** [F]: SOXX +109%, MU +570%, EWY +133% over one year. Semis EPS is +126% y/y. DRAM prices are tripling over 2025–27, which invites a supply response. Semis are the FMS's most crowded trade. Memory stocks historically peak *before* earnings do [I].

**Why not now** [F]: Nvidia guided +12% quarter over quarter, and hyperscaler capex is still rising toward $1T.

**Pricing** [F]: MU implied vol (54–60%) is below its 60-day realized vol (76%). Even so, the MU Mar-27 950/690 put spread costs 7.5% of spot (maximum 3.3×; RN P(MU < 690) = 17%). The SMH 540/420 put spread costs 4.0% (maximum 5.0×; RN P(SMH < 420) = 13%) and has a wide 29.1/33.5 market.

**Triggers:**

- DRAM contract prices fall for two consecutive months.
- MU or SK Hynix guides below consensus.
- Any hyperscaler guides 2027 capex flat or down (late October).
- Nvidia's revenue guide misses (around 19 November).
- SMH closes below its 200-day MA (it is now 21% above).

**Strength:** speculative. Timing memory tops is notoriously hard.

### G. The oil binary (hedge, not alpha)

**Pricing** [F]:

- Backwardation is extreme (Brent front minus second month about $7.4; WTI front minus the 12-month-out contract about $18).
- OVX is 56.
- The USO Dec-18-2026 135/105 put spread costs $5.68 (3.8% of spot, maximum 5.3×; RN P(USO < 135) = 35%).
- The 165/210 call spread costs $6.35 (4.2%, maximum 7.1×; RN P(USO > 165) = 32%).

**Assessment** [I]:

- The prediction markets (blockade ends by 31 December 59%; Hormuz normal 22.5%; crude all-time high 9.5%) and the options look **mutually consistent, so there is no clear edge.**
- **Steep backwardation gives long-futures holders a large positive roll yield if spot holds**, a structural headwind for puts.
- Use the call spread only to hedge scenario 3 against positions A/C/D, or the put spread to hedge an energy-heavy book.

### H. Private credit and alternative managers (two-sided watch list)

**Stress readings** [F]: private-credit defaults about 6%; redemption gates; FSK at about 55–58% of NAV; OWL −66% from its peak; BX −42%; KKR −44%; ARES −40%. BIZD/SPY is at its 1st percentile, and CCC spreads are 11.3%.

**Long (recovery) side:**

- Trigger: Q3 marks (late October to November) show NAV declines slowing, redemption requests drop below 10%, HY OAS stays below 3.5%, and the Fed signals a pause.
- Expression: BX Mar-27 120/155 call spread at $7.45 (6.5% of spot, maximum 4.7×; RN P(BX > 155) = 11%). ARCC (near NAV, 1.5% non-accruals) is the higher-quality lender.

**Short (contagion) side:**

- Trigger: HY OAS above 4.0% with CCC above 13%; a bank discloses material losses on lending to non-bank financials; a semi-liquid fund fully suspends redemptions; KRE breaks its 1-year low.
- Expression: reduce equity beta or use SPY puts (E). KRE and HYG option chains are too illiquid for clean fills (the KRE Dec 65/53 puts showed 0 bids).

**Strength:** speculative either way today.

### I. Gold after the crash (watch list, long)

**Readings** [F]: gold is −26% from $5,586 and 8.8% below its 200-day MA. The 10-year real yield of 2.85% is the headwind. Polymarket: gold $5,000 by 31 December, 30.5%.

**Trigger:** 10y TIPS below 2.5%, or a Fed pause signal, **and** GLD reclaims its 200-day MA.

**Expression:** GLD Mar-27 390/445 call spread at $14.35 (3.8% of spot; maximum 3.8×; RN P(GLD > 445) = 17.7%).

**Strength:** speculative, and it is part of Setup A's factor.

### J. Midterm and Q4 seasonality (bias only)

**Base rate** [F]: S&P 500 midterm years 1990–2022 (n = 9):

- Q4 averaged **+5.5%**, and 8 of 9 were positive (2018: −14%).
- The 12 months after election day averaged **+14.5%**, and 9 of 9 were positive.

**Use** [I]: as a tilt, not a trade. Don't initiate index shorts into November–December unless Setup E's triggers fire. n = 9 is small, and 2026's seasonal "midterm low" already happened (30 March, 6,317, during the war).

---

## 6. Base rates computed for this report (`analyze_event_studies.py`)

| Condition (S&P 500 since 1990, declustered) | n | Fwd 1m | Fwd 3m | Fwd 6m | P(≥10% drawdown within 3m) |
|---|---|---|---|---|---|
| Unconditional | all days | +0.8% | +2.4% | +4.9% | 13.9% |
| 10y yield +45bp or more in 21 trading days (**now +57bp**) | 59 | +0.8% | +2.6% | +5.9% | 13.6% |
| …and S&P within 3% of its high | 21 | +1.5% | +2.1% | +7.1% | 4.8% |
| VIX below 17 and S&P within 2% of its high | 62 | +0.3% | +1.5% | +4.4% | 8.1% |

**Takeaway** [I]: neither "bond rout" nor "calm near highs" is a reliable standalone timing signal for index downside. Dangerous episodes (2022, early 2025, 2018) came from **combinations**: a tightening Fed plus widening credit spreads plus breaking breadth. That is why Setup E is gated on multiple triggers.

**USDJPY after the start of an intervention episode:**

| Start | USDJPY | 1m | 3m | 6m |
|---|---|---|---|---|
| 1998-06-17 | 136.9 | +2.4% | −2.7% | **−14.3%** |
| 2011-03-18 | 79.5 | +3.6% | +1.7% | −2.9% |
| 2011-08-04 | 77.1 | −0.3% | +1.6% | +0.5% |
| 2011-10-31 | 75.7 | +3.1% | +2.7% | +7.1% |
| 2022-09-22 | 144.3 | +4.1% | −5.1% | −7.6% |
| 2022-10-21 | 150.2 | −6.6% | −14.6% | −10.8% |
| 2024-04-29 | 158.2 | −0.9% | −2.7% | −4.8% |
| 2024-07-11 | 161.6 | −8.6% | −8.3% | −2.6% |
| 2026-04-15 (approximate start) | 158.8 | −0.6% | +1.9% | n/a |
| 2026-07-31 | 160.2 | 0.0% | n/a | n/a |

---

## 7. Implications for the system design

These are concrete rules and parameters the recommendation engine should adopt, derived from today's environment and from the pitfalls hit while building this snapshot.

### 7.1 Default posture and hurdle

1. **"No trade" is a position that earns the T-bill rate.**
   - The hurdle today is the 3-month bill at **4.06%** (it moves with the Fed).
   - A trade qualifies only if its estimated EV beats the hurdle over its horizon *after* realistic fills (the ask on long legs, the bid on short legs). It must also have a stated maximum loss.
2. **Keep at most 3 concurrent positions** (the user wants few trades). **Premium at risk per options trade is capped at 1.5% of portfolio NAV**, and **3% per macro factor** (7.2).
   - Outright, no-decay positions such as SPUT, FXY or spot BTC are sized so that the stop-loss distance times position size is at most 2% of NAV.
   - Use fractional Kelly (at most ¼ Kelly) on subjective probabilities, because they are uncertain.
3. **Require liquidity on every recommended options leg:**
   - Open interest ≥ 500 **and** bid/ask ≤ 10% of mid, **or** the trade is re-expressed.
   - Today this rules out FXY, XHB, KRE, HYG, LQD and BIZD options.
   - It admits TLT, SPY, QQQ, IBIT, USO, GLD, MU, NVDA and BX.

### 7.2 Factor map (so the engine never stacks the same bet)

| Factor | Instruments that load on it | Budget |
|---|---|---|
| **US-yields/oil peak** ("peace") | TLT/ZROZ calls, FXY, GLD calls, INDA, homebuilders, USO puts, small caps | 3% premium or 2% stop-risk, combined |
| **AI capex** | NVDA/MU/SMH/TSM/EWY/EWT longs (shorts load negatively), power and uranium partially | 3% |
| **Crypto liquidity** | BTC, IBIT, ETH, MSTR, COIN | 3% |
| **Credit** | BDCs, alt managers, HYG, KRE | 3% |
| **Equity beta hedges** | SPY/QQQ puts, USO calls | Offsets only; do not count against the budgets above |

### 7.3 Dashboard: gauges, current values, thresholds

| Gauge (source) | Now (9/28) | Warning | Action threshold → consequence |
|---|---|---|---|
| 10y UST (^TNX / DGS10) | 5.24% | ≥ 5.40% | ≥ 5.50% and MOVE ≥ 110 → A upgrade (capitulation) **and** E check |
| 21-day change in 10y | +57bp | ≥ +50bp | Informational only (weak base rate) |
| 2y minus effective fed funds (DGS2 − DFF) | +99bp | ≤ +60bp | ≤ +50bp → hikes being priced out: A, D, I triggers |
| 10y TIPS real yield (DFII10) | 2.85% | ≥ 3.0% | ≤ 2.5% → I trigger |
| 5y5y forward inflation (T5YIFR) | 2.34% | ≥ 2.50% | ≥ 2.60% → A invalidation |
| Kim–Wright term premium | 0.96% | ≥ 1.2% | — |
| MOVE (^MOVE) | 96 | ≥ 110 | ≥ 130 → stress regime; cut risk |
| HY OAS (BAMLH0A0HYM2) | 2.93% | ≥ 3.50% | ≥ 4.00% → H short side, E on |
| CCC OAS (BAMLH0A3HYC) | 11.28% | ≥ 12.5% | ≥ 13% → H short side |
| IG OAS (BAMLC0A0CM) | 0.81% | ≥ 1.05% | ≥ 1.30% → systemic |
| St. Louis FSI / NFCI | −0.91 / −0.56 | > 0 / > −0.3 | > 1 / > 0 → crisis mode |
| VIX / (VIX/VIX3M) | 16.1 / 0.88 | ≥ 22 / ≥ 0.95 | ≥ 1.0 for 3 days → E on (if another trigger also fires) |
| RSP/SPY ratio | 0.274 (record low) | New low with SPX below its 50-day MA | Combined with others → E |
| SMH vs 200-day MA | +21% | < +5% | Below the 200-day MA → F |
| BofA FMS cash / B&B indicator | 3.9% / 9.5 | ≤ 4.0% / ≥ 8 | Informational (contrarian) |
| AAII bears | 48.1% | ≥ 50% (contrarian bullish) | — |
| Margin debt y/y (FINRA) | +37% | ≥ +30% | A turn to negative y/y after a peak is historically the more dangerous signal |
| Brent front minus second month (explicit contracts) | $7.4 | ≥ $3 = acute tightness | Collapse below $1 → physical easing → A/D/G |
| Hormuz weekly transits (press) / Polymarket "normal by 31 Dec" | 132 / 22.5% | — | ≥ 50% odds or ≥ 500 transits/week → A, D upgrade; G puts |
| OVX | 56 | — | < 35 → war premium gone |
| Core CPI 3m annualized (CPILFESL) | ~2.0% | ≥ 3.0% | ≥ 3.5% → A invalidation |
| Initial claims, 4-week average (ICSA) | 202k | ≥ 240k | ≥ 260k plus Sahm ≥ 0.3 → growth scare (bullish for A, bearish for equities) |
| USDJPY | 157.4 | ≥ 160 | ≥ 160 → D upgrade window; ≥ 165 → D invalidated |
| USDIDR / USDINR | 17,960 / 95.97 | 18,190 / 96.9 records | Breaks → EM-importer stress; cut EM risk |
| USDHKD | 7.844 | 7.85 | HKMA intervention → HK liquidity squeeze |
| BTC days since peak / price vs $57.7k low | 357 / +45% | — | Days 363–406 plus B's triggers → B entry; weekly close < $57.7k → B invalid |
| Spot BTC ETF 4-week net flows | n/a (data gap) | < −$3bn | > 0 for 4 weeks → B trigger |
| SPUT discount to NAV | −11.7% | ≤ −12% | ≤ −12% plus term ≥ $95 plus URNM > 200-day MA → C |
| Hyperscaler capex guides (late Oct), Nvidia guide (~Nov 19) | — | Flat or cut | Any cut → F on, E check |
| Prediction markets: Fed path, Iran, midterms, recession | See §1.4, §2.1 | ≥ 15-point odds swing in a week | Re-run scenario weights |

### 7.4 Calendar rules

- Maintain a **catalyst calendar** (§4) and attach each open position's thesis to specific dates.
- **Don't buy short-dated options into scheduled events unless the event is the thesis.** For long options on structural theses, enter **after** FOMC, CPI or earnings, once implied vol has fallen.
- **Hard event dates** for the next 6 months: Oct 2, Oct 14, Oct 27–28, Oct 29–30, Nov 3, ~Nov 19, Dec 8–9, Dec 11, Jan 10.

### 7.5 Data hygiene (lessons from building this snapshot)

1. **Continuous futures roll silently.** On 9/28, BZ=F printed −5.8% purely from the November-to-December Brent roll. Use explicit contract months (`futures_and_jgb.py`) for anything roll-sensitive, and verify big moves against ETFs (USO, GLD).
2. **yfinance Gulf-peg FX quotes are corrupt** on many days (SAR shown at 3.64; QAR at 3.51). Cross-check pegs against a second source before any alert.
3. **FRED's ICE BofA spread series** now return only about 3 years of history, so spread percentiles are meaningless. **Start archiving daily copies now** and compare against long-run levels (HY OAS long-run average about 5%).
4. **The Yale Shiller file is frozen at 2023-09.** Take CAPE from multpl.com or shillerdata.com.
5. **Vendor option IVs are noisy** for illiquid chains (HYG, LQD, BIZD, FXY, ITB, UUP produced nonsense). Only use IVs from legs passing the 7.1 liquidity filter.
6. **Web-search quotas get exhausted when many agents share them.** The production system should rely on API or data feeds (FRED, yfinance, Polymarket gamma, Kalshi, CoinGecko, SEC EDGAR, MOF JGB CSV, BLS schedules) and use web search only for narrative.
7. Several narrative facts here come from secondary summaries, and the email pipeline should confirm them against a primary source before citing them. They include Oracle's rating and CDS, Alphabet's FCF, Fitch's private-credit default rate, OpenAI burn, the FMS details, and the Section 122 status.

### 7.6 Calibration inputs for the monthly self-improvement loop

- **Log every subjective probability in §5** alongside the contemporaneous **market-implied** probability: option risk-neutral values from `implied_probs.py`, plus Polymarket and Kalshi odds.
- **Score both each month** (Brier or log score) as outcomes resolve. If the market consistently beats the engine, the engine should defer to market odds and only act on structural edges (discounts to NAV, intervention caps, carry).
- **Track trigger efficacy:** for each trigger in 7.3, record whether firing it improved forward risk/reward relative to entering at an untriggered time.
- **Re-weight the §3 scenarios monthly** from the dashboard and prediction markets. Today's weights are 45/25/15/15 [S].

### 7.7 What the engine would do today, 2026-09-28

- **No setup clears the bar without its trigger today. Hold T-bills.**
- **Arm conditional orders:**
  - A: 10y ≥ 5.50% with MOVE ≥ 110, a de-escalation signal, or 2y minus fed funds ≤ +50bp.
  - B: BTC, from 4 October, on its triggers.
  - C: SPUT discount ≥ 12% plus URNM above its 200-day MA.
  - D: USDJPY ≥ 160.
  - E: the multi-trigger hedge.
- **If the user insists on one starter position now,** the least-bad options are:
  - **SPUT** at its −11.7% NAV discount: no decay, and the discount is a measurable edge. Size so a −30% move is at most 1% of NAV.
  - **Or** a quarter-size Setup A (≤ 0.4% NAV premium).
- **Keep F, H and I on watch.**
- **Re-evaluate** after the 2 October jobs report, the 14 October CPI and the 28 October FOMC.

---

## 8. Reproducibility, sources, caveats

**Code** (`research/code/08-current/`):

| Script | Purpose |
|---|---|
| `fetch_market.py` | ~230 tickers from yfinance |
| `fetch_fred.py` | 80 series |
| `fetch_valuation.py` | Shiller data |
| `fetch_prediction_markets.py` | Polymarket and Kalshi |
| `futures_and_jgb.py` | Contract-month curves and the MOF JGB CSV |
| `analyze_snapshot.py`, `analyze_macro.py` | Level, percentile and derived-gauge tables |
| `analyze_btc_cycle.py` | Halving-cycle analog |
| `analyze_event_studies.py` | Base rates |
| `fetch_options.py` | Implied-vol surface snapshot |
| `price_structures.py` | Concrete spreads, fills and scenario multiples |
| `implied_probs.py` | Risk-neutral probabilities |
| `run_all.py` | Runs everything in order |

The raw cache goes to the session scratchpad (`TRACK08_SCRATCH`).

**Primary data:** Yahoo Finance via yfinance (closes 2026-09-28); FRED (series IDs in tables); Japan MOF JGB CSV (9/25); CoinGecko (9/28); Polymarket gamma API and Kalshi public API (9/28 ~20:30 UTC); SEC EDGAR (Nvidia 8-K, 2026-08-26); FactSet Earnings Insight PDF (2026-09-25); Cameco uranium page (8/31 data); Sprott SPUT page (9/25); BLS release schedules; federalreserve.gov FOMC calendar; BoJ calendar.

**Secondary sources** (linked inline): CNBC, Al Jazeera, Bloomberg headline, Euronews, Wikipedia (Iran war, oil chronology, yen intervention), law-firm tariff notes, Emerson/uspollingdata, AAII, thetrading.tools and Advisor Perspectives (margin debt), Finvaulta and Investing.com (FMS), A.L. Capital Advisory and CAIA (private credit), multpl.com (CAPE), Trading Economics (CGB).

**Caveats:**

- Several sites blocked automated access (CNBC and CNN article bodies, Farside, OCC, Advisor Perspectives). Where only a search-result summary was available, the claim is marked "search summary" and should be verified before being relied on.
- All subjective probabilities are rough judgments for calibration and are *not* forecasts to act on blindly.
- **Nothing here is individualized financial advice**, and every setup can lose the full premium or more.
