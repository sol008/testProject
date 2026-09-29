# 33 — The strategy zoo: 3,651 systems ranked by annual return

Research date: 29 Sep 2026. Prices to Fri 25 Sep 2026; the last complete weekly holding period ends Mon 21 Sep 2026.
Code: `code/33-zoo/` (`python run_all.py` reproduces every number here; outputs in `code/33-zoo/output/`, the full ranking in `ranking_full.csv.gz`).

## TL;DR

1. **3,651 systems** in 8 families, at most one decision a week, realistic costs; data from 1928 (S&P 500), 1985 (Nasdaq-100), 1998 (sectors) and 2014 (bitcoin).
2. **Only crypto ever averaged +100% a year for a decade**: 14 systems did, 13 of them with a 2× crypto fund that did not exist before 2023. Without crypto, the best 20-year-plus system made **+33% a year**.
3. **Out of sample the 100% club collapses**: the top 10 of Jan 2016–May 2021 (+328% to +405% a year) averaged **−4.7% a year** from May 2021 to Sep 2026. White's reality check finds no system that beats +100% a year beyond luck (p = 0.47).
4. **Verdict:** 100% a year is not a credible baseline. The leaders have a 3–29% chance of it over the next five years, and most have a 30–85% chance of an 80% drawdown. 1,000% has no precedent: the best 5-year run was +735% a year, with hindsight and a synthetic 2× Ether fund.
5. **The highest credible expected return is about 20–30% a year**, from **3× Nasdaq-100 held only while its 21-day volatility is below 25%**: +33% a year since 1985 and +46% a year out of sample in 2013–26. A 50/50 mix with a bitcoin trend sleeve is the diversified alternative.

† in the tables below marks a system that holds a synthetic 2× crypto fund at some point. No such fund existed before June 2023.

## 1. What the target means

Doubling every year means ×32 in 5 years and ×1,024 in 10. 1,000% a year means ×11 a year, which is ×161,051 in 5 years. For comparison:
- the S&P 500 made 10.2% a year from 1928 to 2026;
- the median system in the zoo made 11.0% a year over its own history, and 16.6% a year in 2016–26, a window when SPY made 15.3%;
- half the zoo (47%) beat SPY over 2016–26, and 31% beat it by 10 points or more.

"Beat SPY by a large margin" is achievable on paper. "Double every year" is a different order of magnitude.

## 2. The ranking (deliverable 1)

3,651 variants: 65 buy-and-hold, 924 trend-filter, 743 momentum-rotation, 702 dip-buying, 291 volatility-regime, 58 seasonality, 580 combinations and 288 option overlays. The full table is in `code/33-zoo/output/ranking_full.csv.gz`, one row per variant. It has these statistics for the longest window, 2010–26 and 2016–26:
- CAGR and median calendar-year return;
- best and worst year, and max drawdown;
- share of years ≥ +100% and share of years ≤ −50%;
- the best and worst 5-year CAGR;
- the in-sample and out-of-sample CAGR of each design.

**By family.**

| Family | Variants | Median CAGR (own history) | Median CAGR 2016–26 | Best with ≥ 10 years of history | Best 2016–26 |
|---|---:|---:|---:|---|---|
| Buy-and-hold | 65 | +8.0% | +12.7% | ETH 1×: +67% (2016–), max DD −92% | SMH 3×: +68% |
| Trend filter | 924 | +9.7% | +16.9% | ETH 2× SMA20 †: +172% (2016–), max DD −94% | BTC 2× Donchian 20/10 †: +141% |
| Momentum rotation | 743 | +14.9% | +18.9% | Crypto top-1, 3-month momentum, 1×: +92% (2016–), max DD −90% | Risk mix top-2, 1-month, 3× †: +121% |
| Mean reversion / dip | 702 | +6.6% | +9.6% | BTC 2× after a 5-day low in an uptrend †: +75% (2015–) | same: +74% |
| Volatility regime | 291 | +13.5% | +19.8% | BTC vol target 100%, max 2×, + SMA200 †: +83% (2015–) | BTC vol target 80% †: +78% |
| Seasonality | 58 | +10.4% | +9.4% | BTC 2× halving cycle †: +132% (2014–), max DD −95% | same: +143% |
| Combination | 580 | +45.7% | +45.5% | 50% SMH 3× SMA200 + 50% BTC 2× SMA200 †: +115% (2015–) | same: +116% |
| Option overlay | 288 | −16.3% | +5.2% | NDX 5%-OTM 6-month calls, 25% of equity, above SMA100: +14% (2001–) | same with 50%: +55% |

**Top 15 over each system's longest history, with at least 10 years of it.** All are crypto.

| System | Family | From | CAGR | Median yr | Best yr | Worst yr | Max DD | Yrs ≥ +100% | Yrs ≤ −50% |
|:--|:--|:--|--:|--:|--:|--:|--:|--:|--:|
| ETH 2x SMA20 (off=cash) † | trend | 2016-06 | +172.4% | +61% | +102,324% | −84% | −94% | 44% | 22% |
| BTC 2x halving cycle (−12m/+18m) † | seasonality | 2014-09 | +131.8% | +105% | +11,844% | −51% | −95% | 55% | 9% |
| BTC 2x Donchian 20/10 (off=cash) † | trend | 2014-10 | +129.6% | +136% | +3,624% | −54% | −77% | 55% | 9% |
| ETH 2x SMA50 (off=cash) † | trend | 2016-08 | +116.4% | +27% | +29,051% | −54% | −96% | 22% | 11% |
| 50% SMH 3x SMA200 + 50% BTC 2x SMA200, rebalance 13w † | combination | 2015-07 | +115.5% | +125% | +2,980% | −60% | −84% | 60% | 10% |
| BTC 2x SMA200 band 2% (off=cash) † | trend | 2015-07 | +111.0% | +63% | +11,844% | −86% | −92% | 50% | 10% |
| 25% SMH 3x SMA200 + 75% BTC 2x SMA200, rebalance 13w † | combination | 2015-07 | +108.0% | +67% | +6,405% | −72% | −93% | 30% | 10% |
| BTC 2x Donchian 20/10 (off=1x) † | trend | 2014-10 | +105.3% | +165% | +7,023% | −79% | −88% | 64% | 18% |
| ETH 2x SMA10>SMA50 (off=cash) † | trend | 2016-08 | +102.8% | +49% | +68,316% | −89% | −97% | 33% | 22% |
| **ETH 1x SMA20 (off=cash)** | trend | 2016-06 | +102.4% | +33% | +5,705% | −49% | −70% | 44% | 0% |
| ETH 2x SMA20 (off=1x) † | trend | 2016-06 | +102.2% | +28% | +167,857% | −95% | −99% | 33% | 22% |
| 1/3 each SMH 3x SMA200 + BTC 1x SMA200 + BTC 2x SMA200 † | combination | 2015-07 | +101.2% | +91% | +2,470% | −58% | −79% | 30% | 10% |
| 50% NDX 3x hold + 50% BTC 2x SMA200, rebalance 13w † | combination | 2015-07 | +100.8% | +135% | +2,914% | −62% | −81% | 70% | 20% |
| ETH 2x SMA50 band 2% (off=cash) † | trend | 2016-08 | +100.4% | +7% | +33,503% | −67% | −97% | 22% | 22% |
| 25% NDX 3x hold + 75% BTC 2x SMA200, rebalance 13w † | combination | 2015-07 | +99.9% | +87% | +6,349% | −71% | −92% | 50% | 20% |

**Top 10 over the common window 2010–26.** No system reached +100% a year. The best is +81.6%, and all top 10 use synthetic 2× crypto.

| System | CAGR | Median yr | Best yr | Worst yr | Max DD | Yrs ≥ +100% | Yrs ≤ −50% |
|:--|--:|--:|--:|--:|--:|--:|--:|
| Risk mix (NDX, SMH, BTC, ETH, TLT, GLD) top-2, blend momentum, weekly, abs filter, 3x † | +81.6% | +42% | +66,240% | −87% | −95% | 33% | 13% |
| Risk mix top-2, 1-month momentum, weekly, 3x † | +77.0% | +40% | +27,830% | −90% | −94% | 33% | 13% |
| Risk mix top-2, 3-month momentum, weekly, abs filter, 3x † | +76.5% | +49% | +45,577% | −84% | −93% | 27% | 13% |
| Growth mix (NDX, SMH, XLK, BTC) top-1, 1-month, weekly, 3x † | +76.0% | +128% | +3,551% | −94% | −97% | 53% | 13% |
| Risk mix top-2, blend, weekly, abs filter, 2x † | +75.2% | +27% | +64,539% | −86% | −95% | 27% | 13% |
| Risk mix top-3, blend, weekly, 3x † | +73.8% | +61% | +13,536% | −87% | −92% | 33% | 13% |
| Risk mix top-3, 6-month, 4-weekly, abs filter, 3x † | +73.8% | +56% | +11,319% | −64% | −95% | 33% | 13% |
| Risk mix top-2, 3-month, weekly, 3x † | +73.4% | +56% | +45,577% | −91% | −96% | 27% | 13% |
| Risk mix top-3, blend, weekly, abs filter, 3x † | +73.2% | +53% | +13,536% | −72% | −83% | 27% | 13% |
| Risk mix top-3, 6-month, weekly, 3x † | +72.7% | +47% | +14,820% | −79% | −94% | 27% | 13% |

Without crypto, the 2010–26 leaders are SMH 3× buy-and-hold (+49.1%, max DD −89%), SMH 3× SMA200 with a 2% band (+47.3%) and NDX 3× when 21-day volatility < 25% (+45.5%, max DD −45%).

**Top 10 over the common window 2016–26.** 39 systems exceeded +100% a year, and every one of them uses synthetic 2× crypto. With instruments that existed at the time, the best is **+89.0%**, the bitcoin halving-cycle curiosity at 1×. Next comes 50% SMH 3× above its 200-day SMA + 50% bitcoin, at +87.2%.

| System | CAGR | Median yr | Best yr | Worst yr | Max DD | Yrs ≥ +100% | Yrs ≤ −50% |
|:--|--:|--:|--:|--:|--:|--:|--:|
| BTC 2x halving cycle (−12m/+18m) † | +142.6% | +105% | +11,844% | −51% | −95% | 56% | 11% |
| BTC 2x Donchian 20/10 (off=cash) † | +141.3% | +136% | +3,624% | −54% | −77% | 56% | 11% |
| Risk mix top-2, 1-month, weekly, 3x † | +121.1% | +131% | +27,830% | −90% | −94% | 56% | 22% |
| BTC 2x Donchian 20/10 (off=1x) † | +118.5% | +165% | +7,023% | −79% | −88% | 67% | 22% |
| Risk mix top-2, blend, weekly, abs filter, 3x † | +116.4% | +22% | +66,240% | −87% | −95% | 44% | 22% |
| 50% SMH 3x SMA200 + 50% BTC 2x SMA200, rebalance 13w † | +115.9% | +125% | +2,980% | −60% | −84% | 56% | 11% |
| Risk mix top-2, 1-month, weekly, 2x † | +115.7% | +114% | +25,589% | −88% | −94% | 56% | 22% |
| Risk mix top-2, 3-month, weekly, abs filter, 3x † | +114.6% | +65% | +45,577% | −84% | −93% | 44% | 22% |
| Risk mix top-2, 3-month, weekly, abs filter, 2x † | +113.1% | +63% | +43,960% | −80% | −94% | 44% | 22% |
| Risk mix top-2, blend, weekly, abs filter, 2x † | +113.0% | +23% | +64,539% | −86% | −95% | 33% | 22% |

**The best with no crypto at all, and at least 20 years of history.**

| System | From | CAGR | Median yr | Best yr | Worst yr | Max DD | Yrs ≥ +100% | Yrs ≤ −50% |
|:--|:--|--:|--:|--:|--:|--:|--:|--:|
| NDX 3x when 21d vol < 25% (off=cash) | 1985-11 | +33.3% | +20% | +230% | −50% | −72% | 20% | 2% |
| NDX 3x when 21d vol < 25% (off=1x) | 1985-11 | +32.7% | +27% | +225% | −66% | −85% | 20% | 2% |
| NDX 3x when VIX/VIX3M < 1.0 (off=1x) | 2006-07 | +32.0% | +49% | +213% | −76% | −82% | 32% | 11% |
| NDX 3x when 21d vol < 30% (off=cash) | 1985-11 | +30.3% | +20% | +241% | −66% | −87% | 22% | 5% |
| 75% NDX 3x + 25% TLT 3x, rebalance 4w | 2002-08 | +29.9% | +39% | +133% | −77% | −84% | 22% | 9% |
| NDX 3x when VIX/VIX3M < 0.9 (off=1x) | 2006-07 | +27.1% | +38% | +147% | −60% | −61% | 21% | 5% |

**Reference systems across windows.** The arrows show the first half (in-sample) against the second half (out-of-sample) of each design.

| System | From | CAGR (own history) | Max DD | 2010–26 | 2016–26 | A: 2016–21 → 2021–26 | B: 2000–13 → 2013–26 | C: 1929–77 → 1977–2026 |
|:--|:--|--:|--:|--:|--:|:--|:--|:--|
| S&P 500 1x (SPY) | 1928 | +10.2% | −83% | +14.2% | +15.3% | +17% → +14% | +3% → +14% | +7% → +12% |
| Nasdaq-100 1x (QQQ) | 1985 | +15.3% | −83% | +19.1% | +20.4% | +23% → +17% | −1% → +20% | |
| Nasdaq-100 3x hold (TQQQ-like) | 1985 | +16.9% | −100% | +42.3% | +41.8% | +57% → +28% | −32% → +43% | |
| S&P 3x above SMA200 | 1928 | +16.5% | −94% | +17.8% | +26.5% | +30% → +23% | +5% → +22% | +16% → +16% |
| Nasdaq-100 3x above SMA200 | 1986 | +19.3% | −91% | +27.5% | +38.6% | +35% → +42% | −6% → +38% | |
| **Nasdaq-100 3x when 21d vol < 25%** | 1985 | **+33.3%** | −72% | +45.5% | +43.7% | +23% → **+67%** | +22% → **+46%** | |
| S&P 3x turn-of-month weeks | 1928 | +18.7% | −83% | +4.0% | +4.5% | +11% → −2% | +14% → +4% | +20% → +16% |
| SMH 3x above SMA200 | 2001 | +16.5% | −90% | +36.6% | +61.2% | +43% → +82% | | |
| BTC 1x hold | 2014 | +56.4% | −82% | | +63.9% | +136% → +14% | | |
| BTC 1x above SMA200 | 2015 | +60.2% | −73% | | +58.5% | +114% → +17% | | |
| BTC 2x hold † | 2014 | +41.2% | −99% | | +54.4% | +171% → −12% | | |
| **50% NDX 3x SMA200 + 50% BTC 1x SMA200, rebalance 13w** | 2015 | **+57.0%** | −58% | | +59.4% | +90% → **+34%** | | |
| NDX ATM 3-month calls, 25% of equity, above SMA200 | 2001 | +8.7% | −86% | +20.6% | +31.0% | +38% → +24% | | |

What the tables say:
- **Leverage on a trending index is the engine; crypto is the fuel.** Every system with ≥ +100% a year over a decade is a crypto system born in 2014–16, and all but one used a 2× crypto fund that did not exist until 2023. The one exception, Ether with a 20-day trend filter, starts in mid-2016, when ETH traded at about $14.
- **Trend and volatility filters are what make leverage survivable.**
  - Nasdaq 3× buy-and-hold lost 99.98% in 2000–02, and it made 16.9% a year over 41 years.
  - The same fund held only in calm markets made 33.3%, with a −72% worst drawdown.
- **Buying calls lost money as a family** (median −16% a year). The call-overlay results rank below simply holding a 3× ETF. The track-04 finding that premium buyers pay for convexity shows up again here.
- **Dip-buying and seasonality are weak on a weekly clock.** RSI(2) and N-day-low rules are daily-frequency effects. A one-week holding period dilutes them.
  - The turn-of-the-month 3× rule was the best S&P-only system of 1929–77 (+20% a year) and was still +16% in 1977–2026. It made only +4% in 2010–26.

## 3. Selection bias (deliverable 2)

The maximum of 3,651 backtests is an inflated number. We checked three ways.

**(a) Holdout re-ranking: choose on the first half, test on the second.**

Design A: in-sample Jan 2016–May 2021, out-of-sample May 2021–Sep 2026, 3,256 variants (crypto included).

| IS rank | System | IS CAGR | IS max DD | OOS CAGR | OOS max DD | OOS rank | DSR (N) | DSR (N_eff) |
|--:|:--|--:|--:|--:|--:|:--|--:|--:|
| 1 | Risk mix top-2, blend momentum, weekly, abs filter, 3x † | +405% | −95% | **−7.6%** | −87% | 3,065 / 3,256 | 0.00 | 0.79 |
| 2 | Risk mix top-2, blend, weekly, 3x † | +399% | −96% | −28.3% | −97% | 3,247 / 3,256 | 0.00 | 0.79 |
| 3 | Risk mix top-2, blend, weekly, abs filter, 2x † | +399% | −95% | −9.4% | −84% | 3,102 / 3,256 | 0.00 | 0.79 |
| 4 | Risk mix top-2, blend, weekly, 2x † | +395% | −96% | −25.6% | −94% | 3,240 / 3,256 | 0.00 | 0.78 |
| 5 | BTC 2x Donchian 20/10 (off=cash) † | +387% | −71% | +19.2% | −77% | 926 / 3,256 | 0.00 | 0.85 |
| 6 | Risk mix top-2, 3-month, weekly, abs filter, 3x † | +344% | −93% | +3.4% | −89% | 2,428 / 3,256 | 0.00 | 0.76 |
| 7 | Risk mix top-2, 3-month, weekly, 3x † | +340% | −93% | −5.4% | −93% | 3,009 / 3,256 | 0.00 | 0.75 |
| 8 | Risk mix top-2, blend, 4-weekly, abs filter, 3x † | +335% | −96% | −0.8% | −88% | 2,824 / 3,256 | 0.00 | 0.71 |
| 9 | BTC 2x Donchian 20/10 (off=1x) † | +329% | −86% | +11.1% | −88% | 1,671 / 3,256 | 0.00 | 0.71 |
| 10 | Risk mix top-2, blend, 4-weekly, abs filter, 2x † | +328% | −96% | −3.1% | −85% | 2,929 / 3,256 | 0.00 | 0.70 |

- The in-sample top 10 averaged −4.7% a year out of sample; the median of all systems made +11.5%, and SPY made +13.9%.
- 488 systems made ≥ +100% a year in sample, and 1 did out of sample. That one, growth mix top-1 with 1-month momentum, 4-weekly, abs filter, 3× † (+119%), had ranked 605th in sample.
- The Spearman rank correlation between in-sample and out-of-sample CAGR is 0.40. Families and asset classes persist: crypto systems stay volatile, and leveraged Nasdaq stays strong. The in-sample winners do not.

Design B: 2000–May 2013 against May 2013–Sep 2026, 2,052 variants, no crypto.

| IS rank | System | IS CAGR | OOS CAGR | OOS rank | DSR (N) | DSR (N_eff) |
|--:|:--|--:|--:|:--|--:|--:|
| 1 | NDX 3x after RSI(2) < 20 in an uptrend, hold 2 weeks, else cash | +23% | +2.8% | 1,732 / 2,052 | 0.00 | 0.37 |
| 2 | **NDX 3x when 21d vol < 25% (off=cash)** | +22% | **+46.3%** | 96 / 2,052 | 0.00 | 0.18 |
| 3 | XLE 3x when 12-month momentum > 0 | +21% | −8.4% | 2,017 / 2,052 | 0.00 | 0.15 |
| 4 | XLE 2x when 12-month momentum > 0 | +20% | −2.1% | 1,965 / 2,052 | 0.00 | 0.16 |
| 5 | XLE 3x 12-month momentum (off=1x) | +18% | −4.2% | 1,994 / 2,052 | 0.00 | 0.12 |
| 6 | NDX 3x when 21d vol < 30% (off=cash) | +18% | +37.9% | 148 / 2,052 | 0.00 | 0.11 |
| 7 | NDX 2x when 21d vol < 25% (off=cash) | +17% | +32.5% | 208 / 2,052 | 0.00 | 0.18 |
| 8 | Broad ETFs top-3, 12-month, weekly, abs filter, 3x | +17% | +19.7% | 551 / 2,052 | 0.00 | 0.11 |
| 9 | Broad ETFs top-2, 3-month, 4-weekly, 3x | +17% | +11.1% | 1,085 / 2,052 | 0.00 | 0.10 |
| 10 | XLE 2x 12-month momentum (off=1x) | +17% | +2.3% | 1,753 / 2,052 | 0.00 | 0.10 |

- The top 10 averaged +13.8% out of sample against a median of +11.9%. The rank correlation is −0.20: what won in 2000–13 tended to lose in 2013–26.
- The energy-momentum systems that rode the 2000s commodity boom fell to the bottom.
- The low-volatility Nasdaq rules held up out of sample at the 25% and 30% thresholds and at both 2× and 3×. That is the one robust pattern in this design.

Design C, the S&P 500 only: 1929–77 against 1977–2026, 491 variants. The top 10 in sample averaged +14.4% out of sample, against a median of +10.9%, and the rank correlation was 0.67.
- The in-sample #1 was 3× in turn-of-month weeks: +20% then +16.5%.
- Leveraged S&P with a trend or volatility filter made 15–17% a year in both halves.
- With one asset and 50-year halves, selection bias is small. With many assets and 5-year halves, it dominates.

**(b) The deflated Sharpe ratio**, as the probability that the true Sharpe ratio is above zero after deflating for the number of trials:
- **Design A:** the in-sample leaders have annualized Sharpe ratios of about 1.8.
  - Deflated for all 3,256 tries (N), they need 4.5 to count, so their DSR is 0.00.
  - The returns are highly correlated: their effective number of independent bets (the participation ratio of the correlation matrix's eigenvalues) is only about 5. Deflated for that effective number (N_eff), they need 1.47, and DSR is about 0.7–0.85. That is suggestive, and short of the usual 0.95.
- **Design B:** DSR is 0.00 with N and 0.10–0.37 with N_eff.
- **Design C:** DSR is 0.57–0.94 with N and 0.99–1.00 with N_eff. It is the only design whose winners pass. They are modest, +15–20% a year, leveraged S&P systems.

**(c) White's reality check** (1,000 stationary-bootstrap resamples; p is the chance that luck across all variants produces a winner this good):

| Design, sample | Question | Best system | Best excess per year (mean vs S&P; log growth vs the hurdle) | p |
|:--|:--|:--|--:|--:|
| A, 2016–21 | Beats S&P 500 buy-and-hold? | Risk mix top-1, 3-month, weekly, abs filter, 2x † | +2.89 | 0.04 |
| A, 2016–21 | Beats +100% a year? | Risk mix top-2, blend, weekly, abs filter, 3x † | +0.93 | **0.47** |
| A, 2021–26 | Beats S&P 500 buy-and-hold? | NDX ATM+5% 6-month calls, 100% of equity, above SMA200 | +1.15 | 0.07 |
| A, 2021–26 | Beats +100% a year? | Growth mix top-1, 1-month, 4-weekly, abs filter, 3x † | +0.09 | 1.00 |
| B, 2000–13 | Beats S&P 500 buy-and-hold? | XLE 3x, 12-month momentum | +0.34 | 0.54 |
| B, 2013–26 | Beats S&P 500 buy-and-hold? | Growth mix top-1, 1-month, weekly, 3x † | +1.13 | 0.02 |
| B, both halves | Beats +100% a year? | none gets there | < 0 | 1.00 |

- In the crypto era, the best of the zoo does beat the S&P 500 beyond luck (p = 0.02–0.04).
- **Beating +100% a year is never significant**, even in the 2016–21 half, where 488 systems appeared to do it.

## 4. The 100% question (deliverable 3)

**(a) Which systems ever averaged ≥ +100% a year over some 5-year window?** 988 of the 3,651 did (78% involve crypto, 51% synthetic 2× crypto). Every one of those windows sits inside a bubble or a rebound:

| 5-year window starting in | Episode | Systems | Best 5-year CAGR |
|:--|:--|--:|:--|
| 2016–17 | Crypto boom 2016–21 | 680 | +735%: ETH 2× SMA20 †, Nov 2016–Nov 2021 |
| 1994–96 | Nasdaq bubble 1995–2000 | 149 | +198%: S&P ATM 6-month calls with 100% of equity (the variant's full-history CAGR is −43%); NDX 3× 10-month SMA +181% |
| 2012–13 | Rotations that caught bitcoin's arrival, 2013–18 | 122 | +508%: risk-mix rotation 3× † |
| 2019–20 | Crypto and chips, 2019/20–2024/25 | 27 | +254%: BTC 2× presidential-cycle curiosity † |
| 2021 | AI-chip boom 2021–26 | 6 | +118%: SMH 3× above SMA200 with a 2% band |
| 1932 | 1932–37 rebound | 2 | +112%: S&P 3× after a 10-day low |
| 2009 | Post-2009 rebound | 2 | +143%: NDX 10%-ITM 6-month calls, 100% of equity |

**Ex ante or in hindsight? In hindsight.**
- For each of those 988 systems we checked where it ranked, among all live systems, on its trailing 3-year CAGR on the day its best window began.
- 526 were too new to rank at all; for example, 2× Ether had 6 months of history in Nov 2016.
- Of the 462 that could be ranked, **none was in the top 10 beforehand**, only 4 were in the top 1%, and the median sat at the 48th percentile.
- The 2019–24 growth-rotation winner (+235% a year) ranked 3,227th of 3,256 on the day its run began. The 2021–26 SMH 3× winners ranked 472nd to 1,562nd.

The mechanical ex-ante version of the owner's plan is "every January, switch to whichever system had the best trailing 3-year CAGR":

| Leader-follower | 2001–26 CAGR | 2016–26 CAGR | May 2021–26 CAGR | Max DD | Best 5-yr CAGR |
|:--|--:|--:|--:|--:|--:|
| Top-1, all systems | +11.9% | +62.0% | +35.1% | −99.3% | +212% (2013–17) |
| Top-10, all systems | +15.6% | +37.1% | +9.8% | −99.5% | +255% (2013–17) |
| Top-1, no synthetic 2× crypto | +1.3% | +27.6% | −2.3% | −99.3% | +109% (2016–21) |
| Top-10, no synthetic 2× crypto | +10.7% | +28.5% | +18.0% | −90.1% | +76% |
| Top-1, no crypto at all | −9.9% | −3.8% | | −99.7% | +120% |

- Its picks lost 96% in 2008 (EEM 3×), 78% in 2011 (S&P calls), 88% in 2018 (a crypto rotation that had made +1,217% a year for three years), and 57% in 2022.
- It did compound above +100% a year for five years once, in 2013–17. That run needed synthetic 2× bitcoin in 2017, which nobody could buy, and it gave most of it back in 2018.
- Over 25 years, following the leader returned about what the Nasdaq-100 did (+11.9% against +11.5% for QQQ, and +9.2% for SPY), with a 99% drawdown. Without crypto it lost money.

**(b) The highest CAGR any system sustained over 10+ years out of sample:**
- **+46.3% a year for 13.3 years (May 2013–Sep 2026)**, from NDX 3× when 21-day volatility < 25%. It was #2 of 2,052 on 2000–13 data, and it is the only in-sample top-10 system that held up. The in-sample #1 of the same design made +2.8%, and the top 10 averaged +13.8%.
- In design C, the 1929–77 winners made +16.5–17.4% a year over the next 48.8 years.
- The top-1 leader-follower above made +62% a year over the 10.7 years 2016–26, but only through the synthetic 2× crypto of 2017 and with a −99% drawdown. With holdable instruments it made +27.6%.
- **No system sustained +100% a year over any 10-year out-of-sample period.** The best hindsight 10-year result, not out of sample, is +172% a year for synthetic 2× Ether since 2016.

**(c) Block bootstrap odds for the leaders** (10,000 five-year paths of 26-week blocks; each cell gives all history / last 5 years only):

| System | Why chosen | History CAGR | Median 5-yr CAGR | P(≥ +100%/yr for 5 yrs) | P(drawdown ≥ 80%) | P(end ≤ −80%) |
|:--|:--|--:|:--|:--|:--|:--|
| ETH 2x SMA20 † | #1 longest | +172% | +147% / +8% | 60.8% / 6.5% | 75.6% / 66.8% | 3.2% / 14.3% |
| BTC 2x halving cycle † | #2 longest | +132% | +126% / +72% | 59.2% / 28.8% | 52.8% / 0.7% | 0.6% / 0.0% |
| BTC 2x Donchian 20/10 † | #3 longest | +130% | +124% / +14% | 59.3% / 5.1% | 17.9% / 30.4% | 0.4% / 6.3% |
| Risk mix top-2, blend, weekly, abs filter, 3x † | #1 in sample (A) | +46% | +36% / +15% | 24.5% / 5.6% | 48.2% / 58.9% | 5.4% / 10.0% |
| Risk mix top-2, blend, weekly, 3x † | #2 in sample (A) | +22% | +18% / −12% | 18.4% / 2.9% | 76.5% / 84.5% | 17.2% / 33.0% |
| Risk mix top-2, 1-month, weekly, 3x † | #3 of 2016–26 | +13% | +11% / +28% | 13.9% / 7.9% | 67.3% / 42.0% | 18.7% / 5.2% |
| Crypto top-1 blend, 4-weekly, abs filter, 1x | best holdable crypto rotation | +96% | +89% / +34% | 46.2% / 15.3% | 33.2% / 19.1% | 1.7% / 2.3% |
| BTC 1x hold | reference | +56% | +56% / +16% | 24.1% / 1.4% | 19.1% / 24.2% | 1.3% / 4.3% |
| BTC 1x SMA200 | reference | +60% | +58% / +21% | 24.4% / 0.6% | 6.5% / 0.7% | 0.3% / 0.1% |
| NDX 3x hold | reference | +17% | +22% / +23% | 5.8% / 2.3% | 53.6% / 30.6% | 10.8% / 3.6% |
| NDX 3x SMA200 | reference | +19% | +20% / +36% | 1.5% / 0.2% | 17.2% / 0.1% | 2.1% / 0.0% |
| **NDX 3x when 21d vol < 25%** | best 10-yr OOS | +33% | +34% / +61% | 2.0% / 13.7% | **2.6% / 0.0%** | 0.1% / 0.0% |
| **50% NDX 3x SMA200 + 50% BTC SMA200** | owner's example | +57% | +56% / +32% | 14.4% / 0.2% | **0.6% / 0.0%** | 0.0% / 0.0% |
| 1/3 NDX 3x + BTC + ETH, all SMA200 | combination | +68% | +64% / +20% | 29.0% / 0.1% | 3.1% / 0.5% | 0.2% / 0.0% |
| Leader-follower, top-1 | ex-ante selection | +12% | +15% / +31% | 10.4% / 5.7% | 61.8% / 10.1% | 16.7% / 0.6% |
| S&P 500 1x | benchmark | +10% | +11% / +14% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% |

- The top systems double every year in the bootstrap only if 2016–21 comes back: about 60% odds on the whole history, 5–29% on the last five years.
- Most of the same systems carry an 18–85% chance of an 80% drawdown along the way. The bitcoin halving-cycle rule is the exception on the last five years.
- A bootstrap cannot manufacture a new adoption boom. The whole-history column assumes one arrives about as often as it did in 2014–2021.
- The credible systems are the Nasdaq 3× volatility filter and the two Nasdaq-plus-crypto trend mixes. They have a 3% or smaller chance of an 80% drawdown. Their chance of +100% a year is 0–14%, or 29% for the three-way mix if 2016–21 repeats.

## 5. Verdict (deliverable 4)

**100% a year as a baseline: no.**
- Across 98 years of S&P history, 41 of Nasdaq and 27 of sectors, no system without crypto averaged more than +33% a year over 20+ years.
- The 14 systems that averaged ≥ +100% over 10 years all ride crypto's 2014–2021 adoption phase, and 13 need a fund that did not exist.
- Out of sample, the average in-sample leader lost money, and one system in 3,256 cleared 100%, unidentifiably.
- The reality check says no in-sample "+100%" was distinguishable from luck (p = 0.47).
- A reasonable prior for "a system that doubles every year" is a 0–15% chance per 5-year stretch. That is the bootstrap range for the credible systems, or up to 29% if crypto's 2016–21 repeats. Doubling needs a new bubble, and it cannot be picked in advance. The systems aggressive enough to try carry an 18–85% chance of an 80% drawdown.

**1,000% a year as a target: no precedent.**
- Even with hindsight, synthetic leverage and the best 5-year window in the whole zoo, the maximum was +735% a year. Over 10 years it was +172% a year.
- Sustaining ×11 a year for five years (×161,051) is outside anything in the data.

**The highest credible expected return is about 20–30% a year before tax.** Use 20–25% for planning.
- **The system behind it: Nasdaq-100 3× (TQQQ) held only while the Nasdaq-100's 21-day realized volatility is below 25%, T-bills otherwise.**
  - It checks once a week and switches about 3 times a year; it was invested 73% of the time.
  - Its record: +32.7% a year in 1985–99; **+19.2% in 2000–12, while the index lost 2.0% a year**; +48.8% in 2013–26.
  - Out of sample it made +46.3% a year for 13.3 years. It also works at the neighbouring 30% threshold and at 2×. Its worst drawdown was −72%.
  - The mechanism is published: volatility-managed exposure (Moreira and Muir 2017), and leverage only when the volatility drag is small (Gayed and Bilello 2016).
- **Why 20–30% and not 33–46%:**
  - The Nasdaq-100 returned 15.3% a year since 1985 and 20% since 2013, which is far above a normal forward equity return. At 3× and 73% time in the market, every point of index return is worth about 2 points to the system.
  - The synthetic 3× fund runs about 1 point a year ahead of the real TQQQ.
  - The rule was picked from a zoo; in design B its deflated Sharpe ratio is 0.18.
- **Diversified alternative with the same expected return:** 50% Nasdaq 3× above its 200-day SMA plus 50% bitcoin above its 200-day SMA, rebalanced quarterly. This is the owner's own example, tested as specified. Pairing bitcoin with the volatility-filter sleeve was deliberately not added after the fact.
  - It made +57% a year since 2015, with a −58% worst drawdown.
  - Out of sample in 2021–26 it made +34%, ranking 291st of 3,256.
  - The bootstrap median is +32% a year on the last five years.
  - The bitcoin half is the part most likely to disappoint. Bitcoin's own trend rule made +114% a year in 2016–21 and then +17% in 2021–26.
- Both systems are one decision a week at most, long-only, and holdable in the Robinhood IRA: TQQQ, plus IBIT for bitcoin exposure or Coinbase in the taxable account.
- They meet "exceed SPY by a large margin" on the evidence. They do not meet "100% a year", and nothing tested here does except by luck or hindsight.

Tracks 26 (leveraged index trend), 28 (aggressive crypto) and 31 (Monte Carlo) go deeper on these two sleeves. This track's job was breadth. Its finding is that breadth does not uncover a 100%-a-year system; it uncovers selection bias.

## 6. Method

**Timing, and one decision a week.** Every system decides once a week, using closes up to the last trading day of the week (usually Friday; crypto uses the Friday UTC close, about 8 pm New York). It trades at the **next** trading day's close (usually Monday), so each signal lags its data by one session and there is no look-ahead. A "decision" can be a switch (sell A, buy B), a rebalance, or doing nothing; no system can act more than once a week. Returns are marked weekly (Monday close to Monday close).

**Instruments the owner can hold, long only.**
- 1× equity: an index total return minus the ETF fee (S&P 500 as SPY, 0.09%; Nasdaq-100 as QQQ, 0.20%; SPDR sectors, 0.09%; SMH, 0.35%; IWM, EFA, EEM, TLT, IEF and GLD at their own fees).
- 2× and 3× equity: the track-04 leveraged-ETF formula applied daily to the index return: L × r − (L − 1) × (T-bill + 0.40%) − 0.90% a year (`code/04-derivatives/s03_letf_analysis.py`). It overstates the real funds slightly: TQQQ since 2010 simulates at 44.4% a year against 43.1% actual, UPRO since 2009 at 33.7% against 32.9%.
- Crypto: Coinbase spot (BTC, ETH, LTC, SOL). "2× crypto" is a synthetic daily-reset fund: 2 × r − (T-bill + 3.0%) − 1.85% a year, the extra spread standing in for the futures basis that BITX-type funds pay. **No such fund existed before BITX (June 2023) and ETHU (June 2024)**, so every 2× crypto result before then is hypothetical; the report flags them.
- Cash earns the 1-month T-bill (Kenneth French RF), then the 3-month bill (FRED DTB3) after the French series ends.
- Listed calls on the S&P 500 and Nasdaq-100, priced by Black-Scholes (next section).

**Costs.** One-way trading cost per unit of turnover: 0.03% for S&P/Nasdaq 1× ETFs, 0.05% for their leveraged funds and for other 1× ETFs, 0.10% for other leveraged funds, 0.50% for Coinbase spot crypto, 0.20% for 2× crypto funds. Combinations pay these costs again when they rebalance between sleeves. Taxes are ignored (the IRA holds most of this).

**Data.** S&P 500 total return from 1928: ^GSPC plus Shiller's monthly dividend yield before 1988, ^SP500TR after. Nasdaq-100 from Oct 1985: ^NDX plus 0.5% a year of dividends until QQQ (Mar 1999), then QQQ with its fee added back. Sector SPDRs from Dec 1998 (XLRE 2015, XLC 2018), SMH from 2000, IWM 2000, EFA 2001, TLT/IEF 2002, EEM 2003, GLD 2004 (Yahoo adjusted closes). Crypto: Coinbase Exchange daily candles (BTC from Jul 2015, back-filled with Yahoo BTC-USD from Sep 2014; ETH from May 2016; LTC from Aug 2016; SOL from Jun 2021). VIX from 1990, VIX3M from 2006, VXN from 2001.

**The eight families (3,651 variants).**

| # | Family | Variants | What was varied |
|---|---|---:|---|
| 1 | Buy-and-hold | 65 | S&P, Nasdaq-100, 11 sectors, SMH, IWM, EFA, EEM, TLT, GLD at 1×, 2×, 3×; BTC, ETH, LTC, SOL at 1×, 2× |
| 2 | Trend filters | 924 | 10 assets × 21 rules (SMA 20/50/100/150/200, with and without a 2% band; 10-month SMA checked monthly; dual SMAs 10/50, 20/100, 50/150, 50/200; Donchian 20/10, 50/25, 100/50, 250/125 breakouts; 1/3/6/12-month time-series momentum) × leverage × off-state (cash, or 1× instead of L×) |
| 3 | Momentum rotation | 743 | 5 universes (11 sectors; broad ETFs; crypto; a risk mix of Nasdaq, SMH, BTC, ETH, TLT, GLD; a growth mix of Nasdaq, SMH, XLK, BTC) × look-back (1, 3, 6, 12 months, blend) × top 1/2/3 × weekly or 4-weekly rebalance × absolute-momentum filter × leverage; plus dual momentum (GEM) at 1–3× |
| 4 | Mean reversion / dip buying | 702 | S&P, Nasdaq, BTC × 9 triggers (RSI(2) < 5/10/20, 5/10/20-day low, weekly drop of 3/5/8%, or 10/15/20% for BTC) × with or without a 200-day uptrend filter × hold 1/2/4 weeks × leverage × idle state (cash, or 1× with leverage only after the dip) |
| 5 | Volatility regimes | 291 | VIX below 15/20/25/30; VIX/VIX3M below 1.0/0.9; 21-day realized volatility below a threshold; volatility targeting (10–60% for equities, 40–100% for BTC, 21- or 63-day estimates, maximum 1–3×, with or without a 200-day trend filter) |
| 6 | Seasonality (curiosities) | 58 | Turn-of-month weeks, weeks containing a market holiday, November–April only, "Santa" (15 Dec–7 Jan), years 3–4 of the presidential cycle, fourth quarter only, November–April plus 200-day filter; and for BTC the halving cycle (−12 to +18 months) |
| 7 | Combinations | 580 | 13 canonical sleeves (e.g. Nasdaq 3× + 200-day SMA, S&P 3× + SMA, SMH 3× + SMA, BTC 1×/2× + SMA, ETH 1× + SMA, TMF-like 3× bonds, gold, crypto and sector rotations): every pair at 25/75, 50/50, 75/25, and every equal-weight trio of 8 core sleeves; rebalanced every 4 or 13 weeks |
| 8 | Option overlays | 288 | S&P or Nasdaq-100 calls, strike 0.90/1.00/1.05/1.10 × spot, 30/91/182 days, bought with 10/25/50/100% of equity when "always", above the 200-day or above the 100-day SMA; sold after 4/6/13 weeks, at expiry or when the trend turns; the rest in T-bills |

**Option pricing (as in track 04's synthetic engine).** At-the-money implied volatility = 0.88 × a mean-reverting term structure of the VIX (S&P) or VXN (Nasdaq-100), track 04's base calibration (ATM 30-day IV / VIX = 0.88). The smile follows the S&P shape: IV / ATM = 1 − 0.10z + 0.02z², where z is log-moneyness in standard deviations (calls two standard deviations out of the money price at about 0.88 × ATM). Purchases pay the model price plus a half-spread of max(3% of the premium, 0.3 basis points of the index); sales receive the model price minus the same. Index options are cash-settled at expiry. S&P calls start in 1990 (VIX) and Nasdaq calls in 2001 (VXN). Treat these results as directional: an early version with a steeper call skew priced deep out-of-the-money calls 10 times too cheaply and produced fictitious 1,000-fold years, which is exactly the failure mode model-priced option backtests have.

**Windows.**
- Longest: each variant from the first week when all of its inputs exist and its signal is warm (for example, a 200-day SMA needs 200 sessions) to Sep 2026.
- Common windows: 2010–2026 and 2016–2026. A variant enters a window only if it is live on the window's first week.
  - A rotation starts once two of its assets have enough history, and later assets join when they do (XLRE, XLC, BTC, ETH, SOL).
  - So ETH-only rules (ETH data begin May 2016) and the pure crypto rotations are missing from the 2016 window. The mixed rotations that add bitcoin to equities are included.
- Out of sample, choosing on the first half and testing on the second: design A, 2016–May 2021 against May 2021–Sep 2026 (3,362 variants, crypto included); design B, 2000–May 2013 against May 2013–Sep 2026 (2,112 variants, no crypto); design C, Feb 1929–Nov 1977 against Nov 1977–Sep 2026 (491 S&P-only variants).

**Statistics.**
- CAGR is the geometric average return. Calendar-year statistics use full calendar years only; 2026 is excluded as a partial year.
- Max drawdown uses weekly marks.
- The rolling 5-year CAGR uses 261 consecutive weeks.

**Selection-bias tools.**
1. Holdout re-ranking: rank on the first half and read the second half.
2. The deflated Sharpe ratio (Bailey and López de Prado 2014). It is computed with N = every variant tried, and with an effective N equal to the participation ratio of the eigenvalues of the variants' return correlations.
3. White's (2000) reality check, with a stationary bootstrap (mean block of 13 weeks, 1,000 resamples). It asks whether the best of all the variants beats (a) S&P 500 buy-and-hold, or (b) a +100%-a-year hurdle, measured in log growth, by more than luck across that many tries would give.

**The ex-ante test.** A walk-forward "leader-follower": each January, buy the variant, or the top 10, with the best trailing 3-year CAGR among all variants live for those 3 years, and hold it for the calendar year. It is the mechanical version of "simulate everything and pick the one with the highest yearly return".

**Bootstrap.** For the leaders, a circular block bootstrap uses 26-week blocks and 10,000 five-year paths. Paths are drawn from each system's whole history, and separately from its last five years only (Sep 2021–Sep 2026).

## 7. Caveats

- **Hypothetical instruments.** No 2× crypto fund existed before June 2023. The 3× equity funds began in 2008–2010: SPXL/UPRO 2008–09, TQQQ and SOXL 2010, TECL 2008. Earlier leveraged results are simulations, as in Gayed and Bilello. Every 10-year system at ≥ +100% a year except one relies on the synthetic 2× crypto.
- **Crypto survivorship and data.** The crypto universe is BTC, ETH, LTC and SOL. It was chosen in 2026, and ETH and SOL are survivors. Early Coinbase ETH and LTC markets (2016–17) were thin. Crypto's 2016–2021 returns came from an adoption phase (a $10 billion to $3 trillion market) that cannot repeat at the same scale.
- **Leveraged-fund model.** It is ~1 point a year too generous against TQQQ and UPRO. It ignores fund closures, swap-counterparty terms and the possibility of a fund being liquidated after a one-day fall of 33% or more. A 3× fund loses everything if its index falls 33.3% in one day.
- **Weekly marks** understate intra-week drawdowns.
- **Execution at Monday's close.** Taking Monday's open instead changes single systems but not the conclusions.
- **Option prices are modelled, not observed** (see Method). The option family is the least reliable part of the zoo.
- **Multiple testing is only partly corrected.** The zoo's rules are standard published rules with round parameters. But the families, universes and even the crypto assets were chosen in 2026 with knowledge of what worked. The true number of trials behind the leaders is larger than 3,651.
- **No taxes, no margin interest beyond the funds' financing, and no behavioural slippage.** The leaders all went through 80–99% drawdowns. People abandon a system in a drawdown like that, and the backtest assumes they don't.
- **Not advice.** This is research for the owner's personal use. Every system here can lose most or all of the money committed to it.

## 8. Sources

- Track 04 (`04-derivatives-leverage-convexity.md`): the leveraged-ETF financing formula and the synthetic option engine calibration.
- Gayed, M. and Bilello, C. (2016). *Leverage for the Long Run*. SSRN 2741701. (200-day trend filter on leveraged equity.)
- Faber, M. (2007). *A Quantitative Approach to Tactical Asset Allocation*. Journal of Wealth Management. (10-month SMA.)
- Antonacci, G. (2014). *Dual Momentum Investing*. McGraw-Hill. (GEM.)
- Moskowitz, T., Ooi, Y. H. and Pedersen, L. H. (2012). Time series momentum. *Journal of Financial Economics* 104(2).
- Moreira, A. and Muir, T. (2017). Volatility-managed portfolios. *Journal of Finance* 72(4).
- Ariel, R. (1987). A monthly effect in stock returns. *JFE* 18(1). Lakonishok, J. and Smidt, S. (1988). Are seasonal anomalies real? *RFS* 1(4). (Turn of the month, holidays.)
- Bouman, S. and Jacobsen, B. (2002). The Halloween indicator, "Sell in May and go away". *American Economic Review* 92(5).
- Connors, L. and Alvarez, C. (2008). *Short Term Trading Strategies That Work*. (RSI(2).)
- Bailey, D. and López de Prado, M. (2014). The deflated Sharpe ratio. *Journal of Portfolio Management* 40(5).
- White, H. (2000). A reality check for data snooping. *Econometrica* 68(5). Politis, D. and Romano, J. (1994). The stationary bootstrap. *JASA* 89(428).
- Harvey, C., Liu, Y. and Zhu, H. (2016). ... and the cross-section of expected returns. *RFS* 29(1). (Multiple-testing hurdles.)
- Data: Kenneth R. French Data Library; Robert Shiller, *ie_data.xls*; Yahoo Finance via yfinance; Coinbase Exchange public candles; FRED (DTB3).
