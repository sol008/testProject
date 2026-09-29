# 28 — Aggressive crypto sleeve, decided at most once a week

*Track 28, research round of 29 Sep 2026, prompted by the owner's new objective: beat SPY by a large margin, at most one recommendation a week, a "make-rich-quick engine". Code: `research/code/28-crypto/` (`python run_all.py` reproduces every number here; generated tables in `results/tables.md`, CSVs alongside, 0.35 MB in all). Returns are after trading costs and fund fees, before tax unless stated. "Excess" means portfolio CAGR minus SPY's CAGR over the same weeks, in percentage points.*

## TL;DR

1. **The history is spectacular, but the source is fading.** A 30% sleeve in a weekly Bitcoin switch (10-week and 200-day averages, via IBIT) with 70% in SPY beat SPY by **+13.0 points a year in 2014–26, +5.8 in 2018–26 and +2.9 in 2021–26**, with max drawdowns of −25%, −25% and −19%. Bitcoin's own growth has fallen cycle by cycle: peak to peak it went **103% → 37% → 17% a year**.
2. **Looking forward, +5 points a year is not a credible median at sane risk.** I assume Bitcoin compounds at 11.4% a year (the decay trend, shrunk halfway to stocks) with 50% volatility.
   - The same 30% sleeve then has a median excess of **+1.6 points** with no timing skill, or +4.0 if 2018–26's trend persistence continues.
   - The chance of beating SPY by ≥5 points over 10 years is 20–41%. The chance of a −50% portfolio drawdown is 3–7%.
   - A +5 median needs about 50% in buy-and-hold Bitcoin, where a −50% drawdown has a **51% chance**.
3. **Out of sample (choose on 2014–19, test on 2020–26, 21 variants), selection decays and no rule shows timing skill.**
   - The growth winner (ETH 20-week) fell to rank 9 of 21.
   - The median 20%-sleeve excess shrank from +21 to +8 points, a 62% haircut.
   - The best out-of-sample timing-alpha t-statistic is 1.68, against a Bonferroni bar of 3.04. Trend switches cut drawdowns; they do not add return.
4. **2× Bitcoin ETFs are a trap.** BITX, BITU and BTCL lagged a frictionless 2× Bitcoin by **13–19% a year beyond T-bills**: the futures basis is paid on 2× notional, plus fees. At that cost, 2× beats 1× only if Bitcoin compounds above about 50% a year. Hold more IBIT instead.
5. **Recommendation:** Bitcoin **10-week + 200-day switch, IBIT in the Robinhood IRA, 30% of NAV**. That is half-Kelly in the central case; full Kelly is about 60% and is the hard ceiling.
   - It is decided on the Sunday close and makes about 7 trades a year.
   - Expect **+1.5 to +4 points a year over SPY, not +5.** The switch is on today.

---

## 1. The question and the short answer

The v3 design runs Bitcoin as M3: the weekly 10-week switch at 3% of NAV, expected to add −0.3 to +0.5% a year (design §6). The owner now wants to beat SPY by at least 5 points a year over 5–10 years. Can a crypto sleeve decided once a week do that, and what does it cost in risk?

- **Backward-looking:** yes, easily. Any 20–30% Bitcoin sleeve beat SPY by 5–14 points a year over 2014–26. That period includes three halving cycles in which Bitcoin compounded at 42% a year.
- **Forward-looking:** the premium has fallen by roughly half every cycle, and the trend rules' edge over simply holding is not statistically real. On the best honest forward estimate, a 30% trend-switched sleeve adds about +1.5 to +4 points a year. It does so with a small chance of a −50% portfolio drawdown (3–7%, below SPY's own 13% in the same simulation, because 70% SPY plus a switched sleeve holds less equity).
- **Getting to +5 needs one of three things,** each with a real downside:
  - much more crypto (50% buy-and-hold: a coin flip on a −50% drawdown);
  - Bitcoin's decay stopping (bull case, 17% a year);
  - trend persistence continuing as it did in 2018–26.

## 2. What was tested

### 2.1 Data

| Series | Source | Span | Check |
|---|---|---|---|
| BTC-USD, ETH-USD daily (UTC) | Coinbase Exchange candles (`api.exchange.coinbase.com`, row format as parsed by `traderec/data/providers.py`) from 20 Jul 2015 (BTC) and 18 May 2016 (ETH); Coin Metrics reference rate before that | BTC 2010–, ETH Aug 2015– to 28 Sep 2026 | Coin Metrics vs Coinbase on 4,088 overlapping days: median gap 0.10%, 99th percentile 1.3%. yfinance BTC-USD vs ours: median 0.11% |
| BTC, ETH hourly | Coinbase candles (98,060 and 90,651 hours) | 2015/16 – 2026 | Hourly price at Monday 00:00 UTC vs the Sunday daily close: median gap 0.000% |
| SPY (dividend-adjusted OHLC), IBIT, FBTC, ETHA, BITX, BITU, BTCL, ETHU, ETHT, SSO | yfinance | to 28 Sep 2026 | IBIT Monday-open returns vs our BTC price at 09:30 ET: correlation 0.995, IBIT − proxy −0.8%/yr (fee 0.25%) |
| Risk-free | Kenneth French daily RF, extended with the 13-week T-bill yield (^IRX; FRED is blocked from this sandbox) | | |

### 2.2 Timing (no look-ahead)

- **Signal:** the weekly signal uses daily UTC closes up to and including Sunday's. The Sunday candle closes at 00:00 UTC Monday (8 pm New York in summer, 7 pm in winter).
- **Fills, by route:**
  - **IRA/ETF (the main case):** IBIT at 09:30 New York on the first NYSE session after the Sunday. That is about 13.5 hours after the signal, or Tuesday after a Monday holiday. Before 2024 the ETF is proxied by the Coinbase price at that minute (hourly candles, linear inside the hour).
  - **Coinbase:** Monday 02:00 UTC (Sunday 9–10 pm New York).
  - **24-hour IBIT:** Monday 01:00 UTC, in Robinhood's 24 Hour Market.
  - **Ideal:** at the Sunday close itself, as a reference only.
- **Returns and marks:** SPY is measured open to open on the same sessions; T-bills accrue daily. Everything is marked weekly, so drawdowns are slightly understated: Bitcoin buy-and-hold's 2021–26 drawdown is −75% on weekly marks against −77% on daily closes (track 15).

### 2.3 Costs

| Route | Per side | Fund costs |
|---|---|---|
| IRA ETF at the open (IBIT/FBTC/ETHA) | 0.05% | 0.25% a year |
| IRA 2× ETF (BITX-type) | 0.10% | T-bills on the borrowed unit, plus **12.85% a year** (1.85% fee + 11% basis/financing), calibrated in §7 |
| IBIT in the 24 Hour Market | 0.15% (assumed overnight half-spread; not measured) | 0.25% a year |
| Coinbase Advanced | 0.60% (entry taker per [datawallet, Aug 2026](https://www.datawallet.com/crypto/coinbase-fees)); 0.90% sensitivity (US entry taker reported from 16 Sep 2026 by [PrimeXBT](https://primexbt.com/news/coinbase-cuts-advanced-platform-trading-fees-and-lowers-volume-threshold/)) | none |

### 2.4 Rules

Twenty-one candidates, plus one curiosity. All are long or cash, decided weekly.

- **BTC, one-times:**
  - buy-and-hold (BH);
  - weekly close > 10-week average (**10W**, today's M3);
  - > 20-week average (**20W**);
  - Sunday close > 50-day average (**50D**);
  - > 200-day average (**200D**);
  - **10W and 200D both on (10W_200D)**;
  - BH and 10W with vol targeting to 50% (60-day realized vol, capped at 1×).
- **ETH:** BH, 10W, 20W, 50D, 200D.
- **Rotation:**
  - hold whichever of BTC/ETH has the higher 10-week return, among those whose 10W switch is on (ROT_MOM);
  - ETH if the ETH/BTC ratio is above its 10-week average, otherwise BTC, each only while its own 10W switch is on (ROT_ETHBTC);
  - 50/50 BTC 10W + ETH 10W (HALF_10W).
- **2×:**
  - BH, 10W, 20W and 10W_200D in a 2× daily-reset BTC fund;
  - a 10W rule vol-targeted to 80% that uses up to 2× (VT80_L2).
- **Curiosity:** long for 18 months after each halving (HALVING_18M). It is never a candidate.

### 2.5 Portfolio construction

- The sleeve is 3, 10, 20, 30 or 50% of NAV. It holds crypto when the rule is on and T-bills (SGOV) when off.
- The rest is in SPY, in T-bills, or in **LEVSPY**. LEVSPY is my stand-in for the leveraged-SPY-trend track: SSO when SPY's Friday close is above its 200-day average, otherwise T-bills.
- A trade (a whole-portfolio rebalance) happens only when a switch flips, or when a held crypto weight drifts more than 25% from its target. That keeps the sleeve to about 6–10 trades a year.

## 3. Performance by rule and size (question 1)

### 3.1 The sleeve on its own (100% crypto rule, cash when off; IRA/ETF route)

| Rule | 2014–26 CAGR / Sharpe / max DD | 2018–26 CAGR / max DD | 2021–26 CAGR / max DD | Worst year (2021–26) | Time in / trades a year |
|---|---|---|---|---|---|
| BTC buy-and-hold | 42.3% / 0.83 / −82% | 22.5% / −77% | 18.1% / −75% | −67% (2022) | 100% / 0 |
| BTC 10W (M3 today) | 46.2% / 0.97 / −72% | 24.5% / −64% | 14.3% / −50% | −42% (2022) | 54% / 7.9 |
| BTC 20W | 44.5% / 0.92 / −74% | 21.9% / −67% | 16.3% / −48% | −30% (2022) | 58% / 3.9 |
| BTC 50D | 49.9% / 1.04 / −73% | 29.4% / −66% | 20.8% / −41% | −24% (2022) | 55% / 8.6 |
| BTC 200D | 42.0% / 0.89 / −71% | 21.3% / −57% | 16.0% / −49% | −8% (2022) | 57% / 3.5 |
| **BTC 10W_200D** | **48.4% / 1.04 / −52%** | **26.7% / −45%** | **19.6% / −45%** | **−10% (2025)** | 45% / 6.0 |
| BTC 10W, vol-targeted 50% | 41.7% / 1.03 / −50% | 25.2% / −43% | 11.5% / −42% | −36% (2022) | 54% / 9.3 |
| ETH 10W | 80.7% / 1.07 / −71% | 27.6% / −71% | 28.4% / −57% | −40% (2022) | 48% / 6.4 |
| Rotation by momentum | 79.3% / 1.06 / −82% | 15.0% / −82% | 17.9% / −64% | −44% (2022) | 62% / 10.3 |
| 50/50 BTC + ETH 10W | 77.0% / 1.26 / −60% | 31.3% / −60% | 24.6% / −50% | −41% (2022) | 62% / 13.0 |
| 2× BTC 10W_200D | 67.3% / 0.95 / −82% | 25.7% / −75% | 13.7% / −75% | −31% (2025) | 45% / 6.0 |
| Halving +18 months (curiosity) | 50.2% / 1.09 / −52% | 32.5% / −49% | 27.2% / −49% | +1% (2022) | 39% / 0.6 |

SPY over the same weeks returned 13.8%, 14.6% and 14.8% a year, with max drawdowns of −32%, −32% and −23%. What the table shows:

- **The 200-day filter is what controls drawdowns.** It kept the 10-week switch out of most of 2018 and all of 2022: 10W_200D made +1% in 2022 while 10W lost 42%.
- **Rules of 20 days or faster decayed** after 2021, confirming track 15; they were not retested here.
- **ETH's history is driven by its 2016–17 launch mania.** Since the spot ETFs listed, ETHA has lost 10.7% a year (from July 2024) while IBIT made 24.1% a year (from January 2024).

### 3.2 Portfolio = sleeve + rest in SPY (the owner's case)

Each cell is CAGR / excess vs SPY in points / max drawdown. IRA/ETF route.

| Rule | Sleeve | 2014–26 | 2018–26 | 2021–26 | Worst year 2014–26 |
|---|---|---|---|---|---|
| BTC buy-and-hold | 10% | 19.0% / +5.2 / −31% | 17.8% / +3.3 / −31% | 16.7% / +1.9 / −28% | −24% (2022) |
| | 20% | 23.7% / +9.8 / −34% | 20.1% / +5.6 / −34% | 18.3% / +3.4 / −34% | −29% (2022) |
| | 30% | 28.0% / +14.2 / −41% | 22.5% / +7.9 / −41% | 18.9% / +4.0 / −40% | −35% (2022) |
| | 50% | 35.1% / +21.3 / −56% | 24.6% / +10.1 / −53% | 20.9% / +6.0 / −53% | −49% (2018) |
| BTC 10W | 10% | 18.2% / +4.4 / −30% | 16.7% / +2.2 / −30% | 15.7% / +0.8 / −24% | −20% (2022) |
| | 30% | 26.9% / +13.1 / −34% | 20.5% / +6.0 / −30% | 16.7% / +1.9 / −28% | −28% (2018) |
| | 50% | 35.5% / +21.7 / −47% | 23.7% / +9.2 / −41% | 17.6% / +2.7 / −35% | −40% (2018) |
| **BTC 10W_200D** | 3% | 15.2% / +1.4 / −31% | 15.2% / +0.6 / −31% | 15.2% / +0.4 / −23% | −17% (2022) |
| | 10% | 18.2% / +4.4 / −30% | 16.6% / +2.1 / −30% | 16.0% / +1.1 / −21% | −16% (2022) |
| | 20% | 22.5% / +8.7 / −27% | 18.7% / +4.1 / −27% | 17.2% / +2.3 / −20% | −14% (2022) |
| | **30%** | **26.8% / +13.0 / −25%** | **20.4% / +5.8 / −25%** | **17.8% / +2.9 / −19%** | **−16% (2018)** |
| | 50% | 35.8% / +22.0 / −31% | 23.8% / +9.3 / −29% | 19.7% / +4.9 / −23% | −22% (2018) |
| 2× BTC 10W | 20% | 31.3% / +17.5 / −44% | 21.9% / +7.4 / −38% | 16.8% / +1.9 / −34% | −36% (2018) |
| | 50% | 50.8% / +36.9 / −73% | 27.6% / +13.0 / −65% | 15.0% / +0.1 / −56% | −66% (2018) |
| ETH 10W | 30% | 40.5% / +26.7 / −40% | 23.5% / +9.0 / −40% | 22.5% / +7.7 / −28% | |

All 3/10/20/30/50% cells for every rule are in `results/perf_etf.csv` and `results/tables.md`.

- **Rest in T-bills** isolates the sleeve's standalone contribution. For 10W_200D in 2014–26 the portfolio made 7.2 / 12.4 / 17.4 / 28.5% at 10/20/30/50%. In 2021–26 it made 5.7 / 8.0 / 9.8 / 13.6%, which never beat SPY.
- **Rest in LEVSPY** (the stand-in) made 14.5% alone in 2014–26 (+0.7 over SPY) and 19.7% in 2021–26 (+4.9). Adding 10W_200D at 30% gave +14.3 and +7.0 points, with max drawdowns of −26% and −23%. Crypto and levered SPY stack roughly additively; their weekly correlation is 0.25.

### 3.3 The halving-cycle rule (a documented curiosity)

"Hold BTC for 18 months after each halving, otherwise cash" made 50% a year in 2014–26 with only 0.6 trades a year. It exited in October 2025, two weeks after the cycle top.

**Do not use it.** It rests on three observations (the 2016, 2020 and 2024 halvings), and its 18-month window was drawn from hindsight about where peaks fell. Under the rule it would be out until the next halving, around April 2028.

## 4. Bitcoin's decaying growth, and a forward estimate

| Measure | Cycle 1 | Cycle 2 | Cycle 3 | Current (partial) |
|---|---|---|---|---|
| Halving to halving | 201% (2012–16) | 95% (2016–20) | 67% (2020–24) | 11% (Apr 2024 → today, $64,969 → $83,457) |
| Peak to peak | 103% ($1,135 Dec 2013 → $19,650 Dec 2017) | 37% (→ $67,555 Nov 2021) | 17% (→ $124,720 6 Oct 2025) | — |
| Trough to trough | 110% ($176 Jan 2015 → $3,183 Dec 2018) | 50% (→ $15,760 Nov 2022) | 44% so far (→ $58,524 on 30 Jun 2026, provisional) | — |

- **Rolling four-year CAGR** (one full cycle, so the cycle phase matches at both ends), at year ends: 472% (2014), 209%, 191%, 109%, 84%, 102%, 134% (2020), 35%, 46%, 56%, 34%, 17% (2025); 44% today.
- **Realized volatility** fell from 65–93% in most years of 2014–22 (50% in 2016) to 42–53% in 2023–26.
- **From 2025 to date** Bitcoin fell 53% from the October 2025 peak to the June 2026 low and is now $84,462.

**Forward estimate.** Each method extrapolates the decay one cycle ahead:

| Method | Decay per cycle | Next-cycle CAGR |
|---|---|---|
| Halving epochs, exponential fit | ×0.68 | 40% |
| Peak to peak, exponential fit | ×0.47 | 7.5% |
| Trough to trough (2 complete cycles) | ×0.55 | 25% |
| Rolling 4-year trend, 2026–31 midpoint | ×0.54 | 17% |
| Latest full peak-to-peak cycle, unshrunk | — | 17% |

- **Unshrunk:** the median is **17% a year**, the "bull" case below.
- **Shrunk:** halfway towards SPY's assumed 6% gives **11.4% a year**, the "central" case.
- **Bear:** 0%, i.e. Bitcoin stops compounding. It is a real possibility and is not a floor.

The spread across methods (7.5–40%) is itself the main message: the forward premium is barely estimable.

## 5. Out of sample: choose on 2014–19, test on 2020–26 (question 2)

| Rule | In-sample CAGR / Sharpe | Out-of-sample CAGR / Sharpe | OOS max DD | 20% sleeve excess vs SPY, IS → OOS | Timing alpha vs own coin, IS (t) → OOS (t) |
|---|---|---|---|---|---|
| BTC buy-and-hold | 41% / 0.81 | 43% / 0.85 | −75% | +11.6 → +8.1 | — |
| BTC 10W | 60% / 1.10 | 35% / 0.85 | −50% | +11.9 → +5.6 | +28% (1.86) → +11% (0.89) |
| BTC 20W | 55% / 1.00 | 36% / 0.85 | −48% | +12.0 → +5.6 | +21% (1.29) → +10% (0.90) |
| BTC 50D | 55% / 1.05 | 46% / 1.03 | −41% | +11.4 → +7.5 | +26% (1.75) → +19% (1.58) |
| BTC 200D | 49% / 0.93 | 36% / 0.87 | −49% | +10.8 → +5.7 | +17% (1.10) → +11% (0.93) |
| **BTC 10W_200D** | 65% / 1.20 | 35% / 0.88 | −45% | +12.4 → +5.4 | +33% (2.23) → +13% (1.09) |
| BTC BH, vol-targeted | 43% / 0.93 | 32% / 0.75 | −67% | +8.7 → +5.3 | +8% (1.19) → −4% (−0.88) |
| BTC 10W, vol-targeted | 57% / 1.28 | 29% / 0.80 | −42% | +10.6 → +4.0 | +29% (2.55) → +8% (0.70) |
| ETH buy-and-hold | 119% / 1.17 | 55% / 0.91 | −77% | +29.8 → +12.6 | — |
| ETH 10W | 127% / 1.24 | 48% / 0.89 | −60% | +26.2 → +9.6 | +38% (1.18) → +12% (0.75) |
| ETH 20W | 198% / 1.51 | 41% / 0.81 | −68% | +34.2 → +8.1 | +72% (2.49) → +8% (0.46) |
| ETH 50D | 141% / 1.30 | 68% / 1.09 | −53% | +28.1 → +12.3 | +47% (1.52) → +25% (1.68) |
| ETH 200D | 102% / 1.15 | 39% / 0.79 | −60% | +21.0 → +8.2 | +30% (1.04) → +6% (0.35) |
| Rotation, momentum | 143% / 1.31 | 37% / 0.78 | −64% | +29.5 → +7.9 | +92% (1.94) → +12% (0.63) |
| Rotation, ETH/BTC ratio | 130% / 1.25 | 34% / 0.75 | −68% | +28.2 → +7.0 | +89% (1.83) → +11% (0.56) |
| 50/50 BTC + ETH 10W | 118% / 1.51 | 47% / 0.99 | −49% | +19.5 → +7.6 | +69% (2.41) → +18% (1.41) |
| 2× BTC BH | 1% / 0.73 | 15% / 0.73 | −98% | +23.8 → +14.5 | −13% (−3.23) → −14% (−5.40) |
| 2× BTC 10W | 79% / 1.01 | 39% / 0.76 | −81% | +25.9 → +10.4 | +48% (1.55) → +14% (0.58) |
| 2× BTC 20W | 62% / 0.95 | 38% / 0.75 | −79% | +26.8 → +10.5 | +37% (1.12) → +13% (0.55) |
| 2× BTC 10W_200D | 99% / 1.11 | 43% / 0.79 | −75% | +26.8 → +9.7 | +60% (1.93) → +19% (0.81) |
| BTC 10W vol-targeted 80%, up to 2× | 101% / 1.29 | 32% / 0.70 | −67% | +20.5 → +6.9 | +53% (2.62) → +8% (0.39) |

**Variants counted: 21** (plus the halving curiosity, which was excluded). ETH rules hold cash until ETH has enough history (2015–16).

**Results:**

- **Choosing by in-sample growth** (20% sleeve + 80% SPY) picks ETH 20W. Out of sample it ranked **9th of 21**, and its excess fell from +34.2 to +8.1 points. Across all rules the in-sample to out-of-sample rank correlation is 0.69, but that mostly reflects which *asset* went up.
- **Choosing by in-sample Sharpe** picks the 50/50 BTC + ETH switch. It ranked **3rd** out of sample, with a rank correlation of only 0.23.
- **Among the eight BTC one-times rules** (the instrument the IRA can hold), the in-sample growth winner was **10W_200D**. It went from 65% to 35% out of sample, ranking 6th of 8 by out-of-sample CAGR but best on drawdown (−45%) with the second-best Sharpe.

**Haircut:**

- **Harvey–Liu Bonferroni haircut of the in-sample Sharpe:** 23% for the winners (t ≈ 3.7 against N = 21).
- **The realized haircut is larger.** The median out-of-sample/in-sample Sharpe ratio is 0.75, and the **median 20%-sleeve excess shrank 62% (+21.0 → +7.9 points)**.
- **Timing alpha vs holding the coin:**
  - no rule's out-of-sample t-statistic reaches the Bonferroni bar of 3.04 (the best is ETH 50D at 1.68);
  - five rules clear 2 in sample, but none clears 3.04 even there.

**The honest reading** matches track 15:

- slow trend switches are **drawdown control, not alpha**;
- the forward expectation should credit them with **no timing skill**, so the central case below uses 7-day bootstrap blocks;
- trend persistence like 2018–26 is the optimistic case (60-day blocks).
- The 2020–26 test window also started at a bull-market launch (BTC $7k → $69k in 2020–21), which flatters every long-only rule.

## 6. Sizing for growth (question 3)

### 6.1 Analytic Kelly

Weekly-rebalanced BTC + SPY; log-normal; SPY at 6% CAGR and 17% vol; T-bills 4%; BTC–SPY weekly correlation 0.25.

| BTC CAGR assumed | Kelly BTC weight (vol 50%) | Half | Kelly BTC weight (vol 65%) |
|---|---|---|---|
| 0% (bear) | 25% | 13% | 35% |
| 5% | 47% | 23% | 48% |
| **11.4% (central)** | **71%** | **35%** | 62% |
| 17% (bull) | 92% | 46% | 75% |

**Why the weights are so large:** a volatile asset that compounds even at T-bill rates earns a rebalancing premium when held beside cash. The arithmetic mean is the compound rate plus σ²/2, about 12.5 points at 50% vol. Kelly is therefore generous even in the bear case.

**Why it should still be discounted:** it depends on returns being roughly independent from week to week. More importantly, the answer swings from 25% to 92% across forward returns nobody can estimate. That uncertainty about the drift is the standard argument for sizing at half-Kelly or below.

### 6.2 Monte Carlo

**Setup:**

- 2,000 ten-year paths.
- A stationary block bootstrap of 2018–26 daily BTC and SPY returns, re-drifted to each scenario (SPY 6%, T-bills 4%).
- BTC vol scaled to 50%; the historical 65% is a sensitivity.
- Rules are recomputed on every path; decisions are weekly and filled a day later.

**Growth-optimal (full-Kelly) sleeve, rest in SPY:**

| Rule | Bear (0%), no skill / persistence | **Central (11.4%), no skill** / persistence | Bull (17%), no skill / persistence |
|---|---|---|---|
| BTC buy-and-hold | 20% / 25% | **60%** / 60% | 80% / 100% |
| BTC 10W | 25% / 80% | **60%** / 100% | 80% / 100% |
| BTC 10W_200D | 20% / 100% | **60%** / 100% | 80% / 100% |
| 2× BTC 10W | 0% / 40% | **25%** / 50% | 30% / 60% |

"No skill" means 7-day blocks, which remove multi-week trend persistence; "persistence" means 60-day blocks. 100% is the cap, since an IRA cannot borrow. With the rest in T-bills or LEVSPY the weights are similar or higher (`results/mc_kelly.csv`). At the historical 65% vol the central weights are also 60%.

**Central case (BTC 11.4% a year, vol 50%), 10 years, rest in SPY.** SPY alone: median CAGR 6.2%, P(−50% drawdown) 13%.

| Rule | Sleeve | Median CAGR | 10th–90th pct | Median excess vs SPY | P(excess > 0) | P(excess ≥ +5) | P(portfolio DD ≤ −50%) | With persistence: median excess / P(DD ≤ −50%) |
|---|---|---|---|---|---|---|---|---|
| BTC BH | 10% | 7.8% | −0.1% – 15.4% | +1.4 | 82% | 2% | 13% | +1.6 / 11% |
| | 20% | 8.8% | 0.5% – 17.8% | +2.7 | 80% | 25% | 16% | +2.9 / 18% |
| | 30% | 9.9% | 0.5% – 20.2% | +3.6 | 78% | 39% | 25% | +4.1 / 27% |
| | 50% | 11.0% | −1.1% – 25.7% | +5.0 | 74% | 50% | **51%** | +5.6 / 59% |
| BTC 10W | 30% | 8.2% | 0.5% – 17.0% | +2.1 | 71% | 27% | 10% | +4.6 / 6% |
| | 50% | 8.8% | −0.3% – 20.1% | +2.7 | 67% | 38% | 21% | +7.0 / 14% |
| **BTC 10W_200D** | 3% | 6.4% | −0.7% – 13.6% | +0.2 | 72% | 0% | 12% | +0.4 / 8% |
| | 10% | 6.9% | −0.2% – 14.1% | +0.7 | 71% | 0% | 10% | +1.5 / 5% |
| | 20% | 7.4% | 0.4% – 14.9% | +1.2 | 70% | 9% | 8% | +2.8 / 3% |
| | **30%** | **7.8%** | 0.5% – 16.0% | **+1.6** | 67% | **20%** | **7%** | **+4.0 / 3%** |
| | 50% | 8.1% | −0.4% – 18.6% | +2.1 | 63% | 34% | 12% | +6.2 / 4% |
| 2× BTC 10W | 20% | 7.4% | −2.0% – 18.0% | +1.2 | 59% | 25% | 30% | +4.5 / 21% |
| | 50% | 4.9% | −10.1% – 25.3% | −1.3 | 46% | 32% | **91%** | +7.3 / 84% |

**Bear and bull cases for 10W_200D at 30%:**

- **Bear (BTC 0%):** median excess +0.1 (no skill) or +2.6 (persistence); P(−50% drawdown) 9% or 2%.
- **Bull (BTC 17%):** +2.5 or +4.7; P(−50% drawdown) 6% or 3%.

**Hindsight check.** The size that would actually have maximized CAGR (rest in SPY) fell from 90–100% (2014–26) to 75–85% (2018–26) to 45–55% (2021–26). This is an upper bound; it has the same decay as Bitcoin itself.

**Answer to question 3:**

- **Growth-optimal weight:** about 60% for any 1× rule in the central case.
- **Half-Kelly:** about 30%.
- **P(−50% portfolio drawdown)** at 3 / 10 / 20 / 30 / 50%:
  - 12 / 10 / 8 / 7 / 12% for 10W_200D;
  - 13 / 13 / 16 / 25 / 51% for buy-and-hold.
- **Rule vs size:** without timing skill, the trend switch gives up about 2 points of median excess against buy-and-hold at the same size (it is in the market only 45% of the time). In exchange it cuts the −50% risk by a factor of 3–4. Buy-and-hold beyond 30% or 2× beyond 10% is a coin flip on a halving of the account.

## 7. 2× Bitcoin ETFs (question 4)

**Measured, not modelled.** Each listed fund was compared with a frictionless replica over identical Monday-open to Monday-open weeks: the spot price for 1×, and a 2× daily reset for 2×.

| ETF | Exposure | Since | Fund growth a year | Spot | Frictionless replica | Gap a year | Gap beyond T-bills on the borrowed unit | Beta |
|---|---|---|---|---|---|---|---|---|
| IBIT | 1× BTC | Jan 2024 | 24.1% | 24.9% | 24.9% | −0.8% | — | 1.03 |
| ETHA | 1× ETH | Jul 2024 | −10.7% | −10.3% | −10.3% | −0.4% | — | 1.03 |
| BITX | 2× BTC | Jul 2023 | 16.5% | 31.0% | 40.6% | −24.0% | **−19.4%** | 2.08 |
| BITU | 2× BTC | Apr 2024 | −27.2% | 6.0% | −9.3% | −17.9% | **−13.3%** | 2.09 |
| BTCL | 2× BTC | Jul 2024 | −14.8% | 13.0% | 4.7% | −19.5% | **−15.0%** | 2.09 |
| ETHU / ETHT | 2× ETH | Jun 2024 | −96% | −13.5% | −75% | −21.5% | −17% | 2.1 |

Why the funds cost so much:

- A futures-based 2× fund pays the futures premium over spot on **two** units of notional. CME Bitcoin basis has run near 10–15% a year in bull phases.
- On top of that come fees of 0.95–1.85%; BITX's FY2026 annual report shows costs of 2.73% ([SEC N-CSR](https://www.sec.gov/Archives/edgar/data/0001884021/000113322826008134/vs-efp23432_ncsr.htm)).
- The model therefore charges the cheapest realized carry (BITU): T-bills plus 12.85% a year.

**When does 2× out-grow 1×?** In continuous time, 2× daily reset grows at 2μ − r − extra − 2σ², against μ − σ²/2 for 1×. Setting them equal:

| BTC vol | 2× beats 1× only if BTC CAGR > (realized carry, 16.6% a year on the second unit) | … (cheap hypothetical, 7.6%) |
|---|---|---|
| 40% | 39% | 27% |
| 50% | 52% | 39% |
| 60% | 69% | 55% |
| 80% | 124% | 105% |

**In the backtest (sleeve alone, realized carry):**

- 2× buy-and-hold made 8.8% a year in 2014–26 against 42.3% for 1×, and lost 14.4% a year in 2021–26 against +18.1%.
- 2× 10W_200D beat 1× only in 2014–26 (67% vs 48%), thanks to the 2015–17 and 2020 manias. It lost from 2018 (25.7% vs 26.7%) and 2021 (13.7% vs 19.6%), with drawdowns of −75% to −82% against −45% to −52% for 1×.

**When 2× helps:**

- only in a year like 2016–17, 2020 or 2023, when Bitcoin runs 100%+ in a smooth trend, and nobody can identify that in advance;
- or when you want more Bitcoin exposure than the whole account can hold without borrowing.

At a growth-optimal weight of about 60% or less, that second case never arises: hold twice as much IBIT instead. Within a portfolio, w in a 2× fund equals 2w in IBIT, minus about 13% a year of carry on w.

**Verdict:** do not use BITX/BITU/BTCL/ETHU/ETHT. The Monte Carlo agrees: 2× 10W at 50% has a 91% chance of a −50% drawdown and a negative median excess.

## 8. Executability (question 5)

| | IBIT or FBTC in the Robinhood IRA | Coinbase in the taxable account |
|---|---|---|
| Tradable | Yes: dollar orders; Robinhood's instruments API lists IBIT, FBTC, ETHA and every 2× fund as tradable, fractional and 24-hour eligible (29 Sep 2026) | BTC-USD and ETH-USD live (track 20) |
| When | Queue a market order Sunday night; it fills at 09:30 ET Monday. Optional: a limit order in the 24 Hour Market from Sunday 8 pm ET **[verify that IRA orders are accepted]** | 24/7: act right after the Sunday close |
| Cost per side | ≈0.05% assumed (IBIT trades at $47; a 1–2 cent spread plus opening slippage) + 0.25% a year fee | 0.60% (Advanced, entry taker; 0.90% reported for US from 16 Sep 2026; about 0.5% maker via limit orders) |
| Tax | None on switching (IRA) | Every exit realizes short-term gains at income rates |
| Weekend gaps | Friday close → Monday open: σ 3.6%, 1st/99th percentile −8.3% / +8.1%, worst −22.8% (5 Aug 2024). Irrelevant to a weekly rule (the position is held through it either way), but it rules out stops | None |

**The delay is a real cost.** After a weekly signal Bitcoin has tended to keep moving the signal's way for a few hours. Entries filled on average 0.2–0.7% above the Sunday close, while exits filled between −0.1% and +0.2% of it.

| Route (delay after the Sunday close) | Cost a year of sleeve, 10W | 10W_200D |
|---|---|---|
| IBIT 24 Hour Market (+1 h) | 0.4% | 0.4% |
| Coinbase (+2 h) | 1.3% | 0.8% |
| IBIT at Monday's open (+13.5 h) | 2.4% | 1.5% |

The evidence is thin (about 45 entries and 45 exits, each mean ±0.4%), but consistent across rules. Sleeve CAGR for 10W_200D by route:

| Period | Sunday close, free | IBIT 24 Hour Market | IBIT Monday open | Coinbase 0.6% | Coinbase 0.6%, 24% tax | Coinbase 0.6%, 37% tax |
|---|---|---|---|---|---|---|
| 2014–26 | 51.5% | 49.5% | 48.4% | 44.9% | 38.0% | 34.0% |
| 2021–26 | 23.5% | 22.1% | 19.6% | 17.5% | 14.2% | 12.4% |

At 0.90% per side, Coinbase gives 42.3% and 15.3% before tax.

**Conclusions:**

1. **Use the IRA.** Against IBIT at Monday's open, Coinbase in a taxable account loses 2–4 points a year of sleeve CAGR to fees before tax, and 5–14 points once short-term tax at 24–37% is counted. At a 30% sleeve that is 1.5–4 points of portfolio return, as much as or more than the sleeve is expected to add.
2. **Monday's open is acceptable but not free.** Queueing the order for Monday's open cost 2–4 points a year of sleeve CAGR against the free Sunday-close ideal. About half of that is the delay itself; the rest is the fee and costs. At a 30% sleeve that is 0.6–1.2 points of portfolio. If Robinhood's 24 Hour Market takes IRA orders for IBIT, a limit order about 0.3% through the last price on Sunday evening recovered 1–2.5 of those points. The v3 standard currently bans overnight-session orders, so this needs the owner's sign-off.
3. **Email budget.** 10W_200D at 30% makes 7.3 trades a year (2014–26) and 6.8 (2021–26), counting switches and 25%-band rebalances, and each is one order. That uses about one weekly email in seven, and the email can be shared with the other sleeves. The quiet weeks need no message.

## 9. Recommendation

**Rule:** BTC is on when **the Sunday UTC weekly close is above its 10-week average AND above its 200-day average**; otherwise it is off. This is M3 plus one condition, and it needs only the daily closes that `btc_daily_utc()` already provides.

**Instrument and venue:** IBIT (FBTC as a backup) in the Robinhood IRA. There is no Coinbase leg and no 2× fund.

**Size: 30% of NAV** when on, T-bills (SGOV) when off, with the rest in SPY or the leveraged-SPY sleeve.

- That is half the central-case Kelly weight.
- Because the switch is on only about 45% of the time, the average Bitcoin exposure is about 14% of NAV.
- **50% is the ceiling.** Above about 60% you pass full Kelly even in the central case, and 2× funds or buy-and-hold at that size carry a 50–90% chance of a −50% drawdown.
- Rebalance only when the switch flips or the IBIT weight drifts more than 25% from target.

**What to expect, honestly:**

| | Excess vs SPY a year | Max drawdown |
|---|---|---|
| History 2014–26 / 2018–26 / 2021–26 | +13.0 / +5.8 / +2.9 | −25% / −25% / −19% |
| Forward, central, no timing skill | **+1.6** (P ≥ +5 over 10 years: 20%) | P(−50% drawdown) 7% |
| Forward, central, trend persistence as 2018–26 | +4.0 (P ≥ +5: 41%) | 3% |
| Forward, bear (BTC stops compounding) / bull (17% a year) | +0.1 / +2.5 (no skill) | 9% / 6% |

**The owner's "+5 points a year" is not a credible median for a crypto sleeve at acceptable risk.** Holding 50% buy-and-hold reaches it (+5.0 median) but with a 51% chance of halving the account. The sleeve should be sold to the owner as **+1.5 to +4 points a year with drawdown control**, to be stacked with the other tracks (levered SPY trend, momentum) rather than carrying the target alone.

**Weekly email (Sunday 8:05 pm ET, only in weeks with a trade):**

> "BTC switch **ON**: weekly close $X > 10-week avg $Y and 200-day avg $Z. Robinhood IRA → IBIT → Buy → Dollars $N (30% of NAV) → Market → queue for Monday 9:30."

The exit email is the same with "Sell all IBIT; the cash stays in SGOV".

**Review and kill criteria:**

- Re-estimate the forward drift at each annual review from the rolling four-year CAGR. If it falls below 10%, the half-Kelly weight falls to about 20%.
- If Bitcoin realized vol rises back above 70% for a quarter, cut the size by a third.
- The sleeve stays a "risk switch" for scoring: judge it against buy-and-hold IBIT at 14% of NAV, not against T-bills.

## 10. Caveats

- **One asset, three cycles.** Every result is conditional on Bitcoin's past, and the forward central case (11.4%) comes from fitting three or four points per method, with methods ranging from 7.5% to 40%. A permanent impairment (regulation, a protocol failure, quantum risk to keys) is not in the bootstrap sample. The bear case assumes 0%, not −100%.
- **Weekly marks** understate intraweek drawdowns by 1–3 points for crypto-heavy portfolios.
- **Pre-2024 ETF prices are proxies:** Coinbase at the NYSE open, with IBIT's 0.25% fee. IBIT's premium or discount at the open is not modelled; its measured tracking error is 5.4% a year with −0.8% a year of drift, within noise.
- **The 24 Hour Market's IRA eligibility and overnight spreads are unverified.** The route is modelled with an assumed 0.15% per side.
- **The 2× carry is calibrated on 2023–26,** a mostly bullish, high-basis period. The carry could be lower in bear markets, but those are when 2× hurts most.
- **LEVSPY is a crude stand-in** (SSO above the 200-day average) for the other track's rule. In the Monte Carlo, with SPY at 6% and T-bills at 4%, it has a poor forward case; use the other track's numbers for that sleeve.
- **Taxes are stylized:** one short-term rate on net annual gains, no state tax, and no $3k loss offset.
- **Coinbase fee tiers changed in September 2026,** and reports conflict (0.60% vs 0.90% entry taker). Check the app.

## 11. State on 29 Sep 2026

- **BTC:** $84,462 at the 27 Sep Sunday close.
- **Averages:** 10-week $73,468; 20-week $70,318; 50-day $76,103; 200-day $71,073.
- **Vol:** 60-day realized 43%.
- **Switches:** every switch tested is **ON** (10W, 20W, 50D, 200D, 10W_200D, ETH 10W).
- **Action:** a new paper position in the recommended sleeve would buy IBIT at the next Monday open. It would sell on the first Sunday close below either $73.5k (the 10-week average, rising) or $71.1k (the 200-day average).

## Appendix A. Reproduce

```
cd research/code/28-crypto
python run_all.py            # first run downloads ~700 Coinbase pages (3–5 min); then ~10 min, mostly the Monte Carlo
TRACK28_PATHS=400 python run_all.py   # faster Monte Carlo
```

| File | Content |
|---|---|
| `data.py` | Downloads and caches Coinbase (daily and hourly), Coin Metrics, yfinance and French RF. The cache is at `$TRACK28_CACHE` (default: system temp) |
| `engine.py` | Weekly schedule and fill times per route, prices at any instant, rules, band-rebalanced portfolio simulator, metrics, Newey–West alpha, stationary-bootstrap Monte Carlo |
| `run_all.py` | Every table in this report → `results/tables.md` and CSVs (`perf_etf.csv` has all rule × size × base × period cells) |

## Appendix B. Sources

- Coinbase Exchange API, product candles: https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles
- Coin Metrics Community API (PriceUSD): https://docs.coinmetrics.io/api/v4
- Kenneth R. French Data Library, daily factors: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
- Coinbase fees: [datawallet, updated 20 Aug 2026](https://www.datawallet.com/crypto/coinbase-fees); [PrimeXBT, 16 Sep 2026](https://primexbt.com/news/coinbase-cuts-advanced-platform-trading-fees-and-lowers-volume-threshold/)
- BITX annual report (N-CSR, FY to 28 Feb 2026): https://www.sec.gov/Archives/edgar/data/0001884021/000113322826008134/vs-efp23432_ncsr.htm
- Robinhood: [Retirement investing](https://robinhood.com/us/en/support/articles/retirement-investing/) (stocks, ETFs, options, no crypto in IRAs); public instruments API (tradability snapshot, 29 Sep 2026)
- Harvey, C. & Liu, Y. (2015). Backtesting. *Journal of Portfolio Management* 42(1) (Sharpe haircuts).
- Bailey, D. & López de Prado, M. (2014). The deflated Sharpe ratio. *Journal of Portfolio Management* 40(5).
- Politis, D. & Romano, J. (1994). The stationary bootstrap. *JASA* 89(428).
- Kelly, J. (1956). A new interpretation of information rate. *Bell System Technical Journal* 35(4); MacLean, Thorp & Ziemba (2010), *The Kelly Capital Growth Investment Criterion*.
- Liu, Y. & Tsyvinski, A. (2021). Risks and returns of cryptocurrency. *Review of Financial Studies* 34(6).
- Prior tracks: `15-short-horizon-futures-crypto.md` (R2; alpha t 0.24 for the 10-week rule, "mostly Bitcoin beta", −48% max drawdown 2021–26, which this track reproduces at 14.3% CAGR / −50%); `20-executability-check.md`; `traderec/modules/m3_btc.py`.
