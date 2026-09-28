# 15 — Futures and crypto with 1–60 day holds: trend, carry and event rules

*Track 15 of the short-horizon research phase. Prepared 2026-09-28. Code: `research/code/15-short-futures-crypto/` (run order in Appendix A); raw data cached in the session scratchpad (`…/scratchpad/15-short-futures-crypto/cache`). Unless marked "gross", returns are net of the stated costs. Sharpe ratios are on excess returns over 3-month T-bills. "Design" means data before 2008 (crypto: before 2021); "test" means 2008 onwards (crypto: 2021-01-01 to 2026-09-28). Every rule trades at the close one day after its signal.*

---

## TL;DR

1. **Only one family survives out of sample with a usable edge: slow multi-asset time-series momentum.** That means 6–12-month lookbacks, re-decided monthly, run as a diversified book.

   | Universe (TSMOM, 12-month lookback, re-decided every 21 trading days) | Design Sharpe | Test Sharpe 2008–26 | Since 2013 (post-publication) |
   |---|---|---|---|
   | 26 synthetic futures markets (equity, bonds, FX, energy, gold) | 1.21 (1971–2007) | 0.28 | 0.31 |
   | MICRO8: the 8 markets that have CME micro contracts | 1.06 (1990–2007) | 0.58 | 0.67 |
   | ETF8: the same 8 exposures via ETFs (small-account version) | n/a | 0.42 | 0.49 |
   | 21 liquid ETFs | n/a | 0.09 (6-month lookback: 0.22) | 0.13 |
   | Live funds: AQMIX (2010–26) / DBMF (2019–26) / KMLM (2020–26) | | 0.36 / 0.60 / 0.32 | |

   - **Fast versions died.** Lookbacks of 1–3 months and 20- or 50-day breakouts had design Sharpe ratios of 0.5–1.2. Post-2008 they score −0.4 to +0.3 on the broad universes (median about 0).
   - **It is a portfolio edge, not a trade edge.** The average position-month earns +0.1% to +0.3% of notional, with a 51–54% win rate.
   - **Trade count.** Eight markets need about 12 monthly rebalance tickets and 10–15 direction changes a year.
   - **Size and payoff.** Quarter Kelly on a Sharpe shrunk by half (0.14–0.29) means running the book at about 3–7% annual volatility. That is worth +0.4% to +1.9% a year of expected log growth, with a beta to equities of about 0.
2. **Carry with 1-month holds is dead or tiny after 2008.**
   - **G10 FX carry:** Sharpe 0.69–0.81 (1976–2007) → 0.03 / −0.04 (2008–26). The ETF version returned −0.35. It partly revived in 2022–26 (0.3), but not significantly.
   - **Energy term structure:** a "long when backwardated" portfolio went from 0.50 to 0.12. The robust piece is a filter. Steep contango (front roll yield below −20% a year) preceded negative next-month returns in both periods: −1.6% per month (design) and −1.1% (test).
   - **10-year Treasury carry plus roll-down:** 0.37–0.41 → 0.25–0.31 (t ≈ 1.1–1.3), and it failed in 2022–26.
3. **Crypto: slow trend filters still control drawdowns but show no significant alpha. Everything faster decayed.**
   - **Bitcoin 2021–26.** Buy-and-hold made 14.6% a year (Sharpe 0.46, maximum drawdown −77%). That is after a forced round trip every 60 days; without that churn it was about 18%.
     - Slow filters (50/100-day average, 10-week average, 28-day momentum) made 14–30% a year, with Sharpe 0.45–0.78 and a worst month of −16% to −27% vs −39%.
     - Their alpha vs holding was +3% to +16% a year, but t ≤ 1.34. The multiple-testing bar is t = 2.84.
   - **Fast filters** (7–20-day, 20-day breakout) had Bitcoin alpha of −3% to −16% a year after 2021. Before 2021 their Sharpe was 1.6–2.1.
   - **Ether:** slow-rule alpha of +14% to +19% a year (t ≈ 1.1–1.2), also not significant.
   - **No other crypto signal survives the move from design to test.** That covers day-of-week, weekend, crash-rebound, funding-rate and ETF-flow rules.
   - **Altcoin momentum** (survivorship-free, 656 Binance pairs) failed badly after 2021.
     - Cross-sectional momentum returned −29% to −35% a year (top-20).
     - Equal-weight alts lost 20% a year while BTC made +21%.
4. **Micro-futures practicalities decide what a $10k–$250k account can do.**
   - **Diversified trend book.** An 8-market book at 10% volatility needs only 0.7–1.8 contracts each of MES, MNQ, MGC and MCL even at $250k. Notionals are large: MES $38.7k, MGC $41.5k, MNQ $61k. Below about $250k, integer rounding breaks it, so use ETF8.
   - **Single-market trades.** Risking 2% of the account on a gap-adjusted stop allows 1 MES at $50k, 2 at $100k and 5 at $250k.
   - **Weekend gaps** (99th percentile of Monday gaps): CME Bitcoin futures 12.7%, IBIT 9.7% (worst −22.8% on 5 Aug 2024), crude 7.8%, S&P futures 2.4%.
   - **Tax.** Section 1256 (60/40) caps the federal rate at 26.8% (+3.8% NIIT), against 37% (+3.8%) for short-term gains. That is worth +1.0 point a year per 10% of pre-tax return at the top bracket. CME Bitcoin futures qualify; spot Bitcoin and spot-Bitcoin ETFs do not.
5. **What is firing on 2026-09-28** (§7):
   - **Trend:** MICRO8 is long S&P 500, Nasdaq-100 and AUD, with small longs in gold and crude. It is short 10-year Treasuries, EUR and JPY.
   - **Crypto:** every slow BTC/ETH trend rule is long (entries 16 Aug–20 Sep).
   - **Energy:** WTI, heating oil and gasoline are in steep backwardation (WTI +47% a year), so the contango filter blocks nothing. Natural gas is in contango and is blocked.
   - **Carry:** the FX and bond carry rules are off. Funding is neutral (5–13%). The basis is 5.3%, so cash-and-carry is off.

**Bottom line.** For a "few trades, maximum % return" system held to 1–60 days, the evidence supports two things:
- a slow, monthly multi-asset trend sleeve at modest size, as a diversifier;
- slow trend switches as risk control on any crypto exposure.

Neither is an engine for "1000%". Faster and event-driven rules belong in the incubator or on the never-list.

---

## 1. Scope, data and method

### 1.1 Data

| Block | Source | Coverage | Notes |
|---|---|---|---|
| Equity indices | Yahoo (^GSPC, ^N225, ^IXIC, ^GSPTSE, ^FTSE, ^HSI, ^GDAXI, ^AXJO) | 1962–2026 | Price return used as a proxy for futures excess return, since dividend yield − T-bill ≈ 0 on average |
| US Treasuries 2/5/10/30y | FRED constant-maturity yields | 1962/1976–2026 | Daily excess return = (y − T-bill) carry − D·Δy + ½C·Δy² for a par bond |
| G10 FX (JPY, GBP, CHF, CAD, AUD, EUR, NZD, SEK, NOK) | FRED daily spot + OECD 3-month rates, spliced with call-money/discount rates before 2002 (JPY) and 1999 (CHF) | 1971–2026 (EUR 1999–) | Long foreign currency = spot change + rate differential. FRED no longer serves daily DEM |
| Energy futures (WTI, heating oil, RBOB, natural gas) | EIA NYMEX contracts 1–4, daily | 1985/1994/2005 → **2024-04-05**, when EIA stopped publishing | Roll-clean: hold contract 2 and roll when contract 1 expires. The roll calendar was validated with a continuity test: on large-spread days the switch hypothesis wins on 53–76% of rule days vs 18–32% of adjacent days. Stale-print glitches were removed |
| Gold | Yahoo GC=F minus T-bill accrual | 2000–2026 | Roll jumps are about the carry, so subtracting T-bills approximates excess return |
| ETF test set | Yahoo adjusted closes (SPY, QQQ, IWM, EFA, EEM, EWJ, TLT, IEF, GLD, SLV, USO, DBC, UNG, DBA, FXE, FXY, FXB, FXA, FXC, FXF, UUP) | 2004–2026 | Excess of T-bill. Costs 2–10 bp per side plus 0.3–2% a year borrow on shorts |
| Managed-futures funds | Yahoo (RYMFX, AQMIX, ASFYX, AMFAX, WTMF, PQTAX, DBMF, KMLM, CTA) | 2007–2026 | Live, net-of-fee evidence |
| BTC, ETH | Coin Metrics reference rate (BTC 2010–, ETH 2015–), spliced with Yahoo | to 2026-09-28 | Cash earns T-bills when flat |
| Altcoins | Binance public archive, 656 USDT pairs **including delisted ones** (LUNA, FTT, UST…) | 2017-08 → 2026-08 | Survivorship-free universe |
| Funding | BitMEX XBTUSD (2016-05 → 2026-09-16); Binance BTCUSDT/ETHUSDT (2020-01 → 2026-08) | | Live snapshot: Kraken, BitMEX, OKX, Deribit |
| Spot-Bitcoin-ETF flows | The Block daily flow series by fund (Farside returns 403 here) | 2024-01-11 → 2026-09-25 | Only about 2.7 years, all post-2021 |

### 1.2 Conventions

- **Execution.** Signal at the close; trade at the next close (lag 1). For crypto this is the UTC daily close.
- **The ≤60-day rule.**
  - Trend positions are re-decided at least every 21 trading days (TSMOM) or closed after 42 trading days (breakouts; about 60 calendar days).
  - Crypto trades are force-closed at 60 calendar days and re-opened if the signal is still on. The re-opening pays a full round trip.
- **Costs, one-way.**
  - Micro/E-mini futures: 2 bp (equity, bonds, FX) and 4 bp (energy), including commission, exchange fees and ½–1 tick of slippage, plus two one-way costs per roll.
  - ETFs: 2–10 bp.
  - Crypto: 0.25% base case, with 0.05% (ETF or CME) and 0.50% (retail app) sensitivities.
  - Altcoins: 0.35%.
- **Volatility targeting.** Each market is sized at 10%/√N of NAV in annual volatility, using a 60-day-centre-of-mass EWMA of volatility. The book is then scaled to 10% volatility with a constant calibrated on the design sample (the ETF sets are scaled ex post; Sharpe ratios are unaffected).
- **Shrinkage and Kelly (track 03 convention).**
  - The edge is shrunk by 50% (κ = 0.5, rule-based) before Kelly.
  - Quarter Kelly on a return stream gives g = SR²·(0.25 − 0.25²/2) = 0.219·SR².
  - Per-trade Kelly maximises E ln(1+fR) on the empirical trade distribution with its mean halved.

---

## 2. Part 1 — Multi-asset trend with 1–60 day holds

### 2.1 Every variant, design vs test (net, 10% vol)

Twenty variants were run on three universes; the full grid is in `results/p1_trend_summary.csv`. The table shows the main ones. H is the re-decision interval in trading days; H42 ≈ 60 calendar days.

| Variant | 26-market synthetic: design 1971–2007 | 26-market: test 2008–26 | since 2010 | MICRO8: design 1990–2007 | MICRO8: test | 21 ETFs: test |
|---|---|---|---|---|---|---|
| TSMOM 1-month lookback, weekly (L21 H5) | 1.12 | **−0.21** | −0.34 | 0.30 | −0.03 | −0.35 |
| TSMOM 1-month, monthly (L21 H21) | 0.64 | 0.01 | −0.08 | 0.34 | 0.31 | −0.36 |
| TSMOM 3-month, monthly (L63 H21) | 0.95 | −0.03 | −0.26 | 0.65 | 0.19 | 0.24 |
| TSMOM 6-month, monthly (L126 H21) | 0.96 | 0.30 | 0.21 | 0.50 | **0.63** | 0.22 |
| TSMOM 12-month, weekly (L252 H5) | 1.27 | 0.30 | 0.34 | 1.17 | 0.54 | 0.25 |
| **TSMOM 12-month, monthly (L252 H21)** | **1.21** | **0.28** | 0.24 | **1.06** | **0.58** | 0.09 |
| TSMOM 12-month, every 42 days (L252 H42) | 1.11 | 0.26 | 0.26 | 0.91 | 0.41 | 0.04 |
| Blend of 1/3/6/12-month signs, monthly | 1.06 | 0.21 | 0.08 | 0.82 | 0.56 | 0.10 |
| 20-day breakout (exit on 10-day low, 42-day time stop) | 1.21 | **−0.23** | −0.33 | 0.27 | −0.07 | −0.31 |
| 50-day breakout | 1.12 | 0.07 | −0.08 | 0.37 | 0.15 | 0.12 |
| 100-day breakout | 1.17 | 0.20 | 0.01 | 0.58 | 0.35 | 0.23 |
| Long-only TSMOM 12-month | 1.19 | 0.23 | 0.23 | 1.23 | 0.54 | 0.21 |

**Readings:**
1. **Before 2008 everything worked.** All 20 variants had Sharpe 0.46–1.36 on the 26-market set, matching Moskowitz, Ooi & Pedersen (2012) and Hurst, Ooi & Pedersen (2017).
2. **After 2008 only slow signals kept a positive Sharpe.** On the 26-market set, 6–12-month lookbacks scored 0.26–0.34. Signals of 3 months or less and 20–50-day breakouts scored −0.23 to +0.10 over 2008–26, and −0.34 to −0.08 since 2010. This matches track 02's "fast signals decayed", now shown across asset classes.
3. **Holding period matters less than lookback.** For the 12-month signal, H = 5, 21 and 42 all scored 0.26–0.30. The 60-day cap costs nothing for slow signals.
4. **The universe matters as much as the rule.**
   - The eight micro-contract markets did about twice as well after 2008 as the 26-market set.
   - The 26-market set carries 8 equity indices and 9 FX pairs, while post-2008 trend profits came mostly from bonds, commodities and JPY (§2.3).
   - A leave-one-market-out test keeps MICRO8 at Sharpe 0.47–0.68 (§2.6), so no single market drives the result.
   - It is still one draw. The median test Sharpe per universe is 0.15 (21 ETFs), 0.16 (26-market) and 0.37 (MICRO8).

### 2.2 By decade (12-month TSMOM, monthly, 10% vol)

| Decade | 26-market Sharpe | 26-market excess return | MICRO8 Sharpe | MICRO8 excess return |
|---|---|---|---|---|
| 1970s | 0.92 | 9.5% | 0.61 | 8.7% |
| 1980s | 1.43 | 14.8% | 0.87 | 9.3% |
| 1990s | 1.17 | 9.8% | 1.24 | 11.6% |
| 2000s | 1.06 | 12.2% | 0.76 | 8.7% |
| 2010s | **0.14** | 1.4% | 0.41 | 4.1% |
| 2020s (to Sep-26) | 0.38 | 3.9% | 0.90 | 9.2% |

- **Fast rules decayed decade by decade.** The 20-day breakout scored 1.82 (1970s), 1.81 (1980s), 0.58 (1990s), 0.23 (2000s), −0.62 (2010s) and 0.02 (2020s). The 1-month TSMOM went 0.82 → 0.69 → 0.58 → 0.47 → −0.21 → 0.10 (`p1_trend_decades.csv`).
- **The 2010s were the trend drought.** The live funds in §2.5 show the same pattern (AQMIX −8.4% in 2016 and −8.9% in 2018).

### 2.3 Where the post-2008 profits came from (26-market set, gross, by asset class)

| Class | TSMOM 12m: design Sharpe | TSMOM 12m: test Sharpe | Blend: test | 50-day breakout: test |
|---|---|---|---|---|
| Bonds | 0.67 | 0.36 | 0.21 | 0.32 |
| Commodities (energy + gold) | 0.50 | 0.32 | 0.57 | 0.47 |
| Equity indices | 0.80 | 0.13 | 0.05 | −0.12 |
| FX | 0.80 | 0.15 | 0.09 | 0.05 |

**Single markets (12-month TSMOM, test Sharpe):**
- Positive: JPY 0.59, S&P 500 0.49, Nasdaq 0.49, US 2-year 0.44, heating oil 0.34, US 5-year 0.29, NOK 0.26, Nikkei 0.24, US 10-year 0.21, AUD 0.19, gold 0.14, natural gas 0.14.
- Negative: ASX −0.42, FTSE −0.27, CHF −0.23, GBP −0.20, EUR −0.13.
- Median ≈ 0.1. **No single market is worth trading alone on this signal**; the edge comes from diversification (`p1_single_asset.csv`).

### 2.4 Trades, costs and per-trade statistics (test 2008–26)

A "trade" is one market held in one direction for one re-decision period, measured as unlevered return on notional. "New positions" counts direction changes, which is the minimum number of tickets if continuing positions are simply rolled.

| Book | Trades a year | New positions a year | Win rate | Average win | Average loss | Mean | Median | Worst | Turnover (× NAV a year) | Cost drag at 10% vol |
|---|---|---|---|---|---|---|---|---|---|---|
| MICRO8 TSMOM 12m monthly | 99 | 10 | 54.3% | +3.49% | −3.49% | **+0.30%** | +0.29% | −35.1% | 6.4× | 0.61% a year |
| MICRO8 TSMOM 6m monthly | 99 | 16 | 53.5% | +3.63% | −3.35% | +0.39% | +0.25% | −35.1% | 9.5× | 0.67% |
| 26-market TSMOM 12m monthly | 318 | 37 | 51.3% | +3.47% | −3.41% | +0.12% | +0.07% | −46.6% | 12.7× | 0.93% |
| 26-market 20-day breakout | 306 | 306 | 35.7% | +3.77% | −2.16% | −0.04% | −0.60% | −27.4% | 80× | 2.16% |
| 21-ETF TSMOM 12m monthly | 251 | 29 | 50.3% | +4.04% | −3.87% | +0.11% | +0.02% | −39.4% | 6.6× | 1.33% |

- **Average open positions:** 8 (MICRO8), about 26 (26-market) and 21 (21-ETF). Trend books are almost always fully invested, long or short.
- **Worst months at 10% volatility (MICRO8, 12-month signal).**
  - Worst single-market month: −2.9% of NAV (AUD, May 2013).
  - Worst portfolio month: −8.7% (May 2010); then −7.6% (Dec 2018) and −7.4% (Nov 2016).
  - Maximum drawdown −20.8%. Average gross leverage 1.96× notional (95th percentile 2.8×).
- **Cost sensitivity (MICRO8, 12-month).** Test Sharpe is 0.58 at base cost, 0.53 at twice the cost and 0.42 at four times.
  - Futures costs are not the binding constraint.
  - For ETFs they are: the 21-ETF set pays 1.3–1.5% a year, including borrow on shorts.

### 2.5 Live evidence: managed-futures funds (net of fees)

| Fund | Start | CAGR | Excess over bills | Volatility | Sharpe | Maximum drawdown | Beta to SPY |
|---|---|---|---|---|---|---|---|
| RYMFX (Rydex) | 2007-02 | 1.7% | 0.7% | 10.3% | 0.06 | −36.5% | 0.05 |
| **AQMIX** (AQR) | 2010-01 | 4.6% | 3.5% | 9.6% | 0.36 | −26.5% | −0.02 |
| ASFYX (AlphaSimplex) | 2010-08 | 4.4% | 3.5% | 12.1% | 0.29 | −36.4% | 0.09 |
| WTMF (WisdomTree) | 2011-01 | 1.2% | −0.1% | 7.7% | −0.01 | −30.8% | 0.06 |
| PQTAX (PIMCO) | 2014-01 | 4.1% | 2.6% | 9.5% | 0.27 | −28.4% | −0.10 |
| **DBMF** (replication ETF) | 2019-05 | 9.9% | 7.5% | 12.4% | 0.60 | −20.4% | 0.11 |
| KMLM | 2020-12 | 7.1% | 4.7% | 14.8% | 0.32 | −31.0% | −0.13 |
| CTA (Simplify) | 2022-03 | 9.2% | 6.3% | 17.6% | 0.36 | −20.8% | −0.15 |

**Calendar years**, in %. The MICRO8 columns are at 10% volatility plus T-bills.

| Year | MICRO8 TSMOM 12m | MICRO8 blend | 26-market TSMOM 12m | AQMIX | DBMF | KMLM |
|---|---|---|---|---|---|---|
| 2008 | +16.6 | +24.0 | +23.9 | | | |
| 2013 | +26.2 | +19.9 | +9.1 | +9.4 | | |
| 2016 | −15.5 | −6.0 | −11.4 | −8.4 | | |
| 2018 | −6.4 | −0.1 | −7.9 | −8.9 | | |
| 2022 | +18.0 | +15.9 | +25.2 | +35.5 | +21.6 | +24.2 |
| 2023 | +5.2 | +3.3 | −2.1 | +2.1 | −8.9 | −5.7 |
| 2024 | +16.8 | +11.8 | +8.3 | +8.1 | +7.2 | −1.7 |
| 2025 | +11.5 | +7.2 | +10.2 | +14.6 | +13.8 | −3.0 |
| 2026 YTD | +17.4 | +4.3 | +10.7 | +18.8 | +17.3 | +19.4 |

- **The backtest tracks the funds.** Monthly correlation of our 12-month TSMOM with AQMIX is 0.58–0.67 and with DBMF 0.63–0.74 (`p1_mf_corr.json`).
- **Retail can buy the same exposure in one ticket.** Six of the eight funds netted bills + 2.6–7.5% a year; RYMFX and WTMF netted about bills.
- **These results are not a return engine.** The live Sharpe of 0.3–0.6 is what to plan around.

### 2.6 Robustness and data-mining haircut

- **Leave one market out** (MICRO8, 12-month): test Sharpe 0.47 (without JPY) to 0.68 (without EUR). For the 6-month signal: 0.56–0.66.
- **ETF8 version** (SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA; ETF costs and borrow).
  - 12-month TSMOM: 0.42 (2008–26) and 0.49 (2013–26); cost drag 0.95% a year; gross leverage 1.8×.
  - Long-only 12-month: 0.45, 5.0% a year, maximum drawdown −24%, gross 1.4×. This version keeps some equity and bond beta.
- **Deflated Sharpe** (Bailey & López de Prado 2014), 20 variants per universe:

  | Universe | Best test variant | Its t | DSR probability | Design-selected variant → test Sharpe |
  |---|---|---|---|---|
  | 26-market | TSMOM 6m weekly, Sharpe 0.34 | 1.46 | 0.54 | long-only 50-day breakout → 0.08 |
  | 21 ETFs | TSMOM 6m every 42 days, 0.35 | 1.49 | 0.38 | n/a |
  | MICRO8 | TSMOM 6m weekly, 0.63 | 2.72 | **0.81** | long-only TSMOM 12m → **0.54** |

  The Bonferroni bar for 20 variants is t = 3.02.
  - **Nothing clears a strict haircut on post-2008 data alone.**
  - The case for the sleeve rests on four things together:
    - 100+ years of prior evidence (Hurst, Ooi & Pedersen 2017);
    - a positive design-selected out-of-sample result (MICRO8 long-only 12-month → 0.54);
    - positive results in all four universes for 6–12-month signals;
    - live fund returns.

### 2.7 Sizing the sleeve (quarter Kelly on a Sharpe shrunk by half)

| Book | Test Sharpe | Shrunk Sharpe | Quarter-Kelly scale of a 10%-volatility book | Expected log growth a year |
|---|---|---|---|---|
| MICRO8 TSMOM 12m | 0.58 | 0.29 | 0.69× (≈ 7% volatility) | **+1.9%** |
| MICRO8 TSMOM 6m | 0.63 | 0.32 | 0.73× | +2.2% |
| 26-market TSMOM 12m | 0.28 | 0.14 | 0.33× | +0.4% |
| 21-ETF TSMOM 6m | 0.22 | 0.11 | 0.28× | +0.3% |

**Recommendation:** plan on a forward Sharpe of about 0.3 and run at 5% volatility (half of the 10% book). That gives an expected log growth of about +0.6% to +1.4% a year for a forward Sharpe of 0.15–0.3, with near-zero equity beta and positive crisis convexity: +16.6% in 2008 and +18% in 2022 at 10% volatility.

---

## 3. Part 2 — Carry with 1-month holds

### 3.1 Commodity term structure (NYMEX energy; EIA contracts 1–4; design 1985–2007, test 2008 → Apr 2024)

Signal: front roll yield = ln(C1/C2)×12, positive in backwardation. Hold the second-month contract for 21 trading days. Costs are 4 bp one-way plus monthly rolls.

**Inverse-volatility portfolio of WTI, heating oil, natural gas and gasoline:**

| Rule | Design Sharpe | Test Sharpe | Test max drawdown |
|---|---|---|---|
| Always long | 0.46 | −0.09 | −94% |
| Long if backwardated | 0.50 | 0.12 | −54% |
| Long if backwardated, short if contango | 0.26 | 0.24 | −62% |
| Long unless contango is steeper than −10% a year | 0.72 | 0.01 | −82% |
| **Long if backwardated and the 12-month trend is up** | 0.46 | **0.24** | −37% |
| 12-month TSMOM (reference) | 0.29 | 0.16 | −74% |

**By market, "long if backwardated", test Sharpe:**
- heating oil 0.41 (design 0.68), gasoline 0.20;
- WTI −0.07 (design 0.41);
- natural gas −0.33 (design 0.47).

**Forward 21-day return by curve state** (all four markets, non-overlapping):

| Front roll yield | Design n | Design mean | Test n | Test mean | Test median |
|---|---|---|---|---|---|
| < −20% (steep contango) | 150 | **−1.62%** | 144 | **−1.08%** | −0.83% |
| −20% to −5% | 173 | +1.41% | 209 | −1.07% | −0.52% |
| −5% to 0% | 43 | +4.67% | 131 | +0.83% | +1.32% |
| 0% to +5% | 35 | +3.28% | 96 | +0.57% | +0.23% |
| +5% to +20% | 104 | +1.36% | 110 | +1.15% | +0.89% |
| > +20% (steep backwardation) | 127 | +2.89% | 85 | −0.79% | −1.36% |

**Verdict:**
- **Backwardation as a buy signal did not survive the post-2004 financialisation era.** Only heating oil held up, one market out of four.
- **Steep contango as a "do not be long" filter survived in both periods.** It confirms track 05 and Gorton, Hayashi & Rouwenhorst (2013) on the avoid side only.
- **Metals and grains.** Metals carry is just financing: gold's curve is −5% a year, meaning normal contango. There is no free historical curve data for grains, so they were not tested.

### 3.2 FX carry (G10 vs USD; monthly; spot + OECD 3-month rates; 2 bp per side plus quarterly rolls)

| Strategy | 1976–2007 | 2008–26 | Since 2010 | 2022–26 | Worst month (test) |
|---|---|---|---|---|---|
| Top-3 / bottom-3 yielders, USD included | **0.69** (5.3% a year, skew −0.84) | **0.03** | 0.11 | 0.33 | −10.6% |
| Each currency vs USD by the sign of its differential | 0.81 | −0.04 | 0.04 | 0.32 | −6.8% |
| Long currencies yielding >1 point above USD | 0.50 | 0.01 | −0.02 | (no position) | −11.9% |
| ETF version: long top-2 / short bottom-2 CurrencyShares | | **−0.35** (−2.9% a year) | | 0.19 | −14.6% |

**Is it accessible?**
- **Mechanically yes:** CME futures (6A/6B/6C/6E/6J/6S/6N/6M) and micros (M6E, M6A, M6B; micro JPY/CHF/CAD availability **[verify]**).
- **Economically, no longer.** The G10 carry premium has been about zero since 2008. The ETF route loses to the 0.40% fund fees and borrow costs.
- **Today's differentials vs USD, in points:** CHF −3.9, JPY −2.4, SEK −1.9, EUR −1.8, CAD −1.6, NZD −1.0, GBP −0.1, AUD +0.7, NOK +0.8. The dollar is itself a high yielder, so a carry book today is short CHF, JPY and EUR vs USD. That is a crash-prone trade with USDJPY at 157 near intervention levels. The yen carry unwind of July–August 2024 is the reference case.
- **Verdict: avoid** (matches track 02 §4D).

### 3.3 Bond carry and roll-down (US 10-year; expected carry + roll-down = (y10 − y3m) + D·(y10 − y7)/3, per year)

| Rule (21-day holds) | 1962–2007 | 2008–26 | 2022–26 | Share of time long (test) | Trades a year | Win rate | Mean per trade |
|---|---|---|---|---|---|---|---|
| Always long 10-year | 0.20 | 0.14 | −0.72 | 100% | 11.9 | 52.7% | +0.08% |
| Long if carry + roll > 0 | 0.37 | 0.25 | −0.54 | 87% | 10.4 | 54.1% | +0.16% |
| Long if carry + roll > 0, else short | 0.41 | **0.31** | 0.01 | 87% | 11.9 | 54.5% | +0.20% |
| Long if carry + roll > 0 **and** 12-month trend up | 0.42 | 0.30 | −0.53 | 56% | 6.6 | 54.8% | +0.26% |
| 12-month TSMOM on the 10-year (reference) | 0.31 | 0.26 | 0.18 | 57% | 11.9 | 51.8% | +0.17% |
| Best carry per unit duration across 2/5/10/30-year | 0.37 | −0.04 | | | | | |

**Verdict:** a small, consistently positive tilt (t ≈ 1.1–1.3 on the test sample) that failed in the 2022 inflation shock. It is useful only as a filter inside the trend sleeve's bond leg. **Today:** carry + roll-down is +1.37% a year on the 10-year (positive), but the 12-month trend is negative, so the combined rule is flat.

---

## 4. Part 3 — Crypto (BTC, ETH, alts): 1–60 day holds

### 4.1 Trend rules: design (BTC 2013–2020, ETH 2016-06–2020) vs test (2021-01 → 2026-09-28), 0.25% per side, lag 1, 60-day maximum hold

| Asset | Rule | Design CAGR / Sharpe | Test CAGR | Test Sharpe | Test max drawdown | Time in market | Trades a year | Win rate | Average win / loss | Mean / median per trade | Worst trade |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BTC | Buy-and-hold | 154% / 1.51 | 14.6% | 0.46 | −77% | 100% | — | — | — | — | — |
| BTC | Close > 20-day average | 176% / 1.92 | 3.3% | 0.19 | −73% | 51% | 22 | 36% | +9.0% / −4.1% | +0.5% / −1.5% | −24.6% |
| BTC | 7-day momentum | 125% / 1.58 | −5.9% | −0.05 | −79% | 52% | 34 | 39% | +6.3% / −3.8% | +0.1% / −0.7% | −26.3% |
| BTC | 20-day breakout | 183% / **2.08** | 3.8% | 0.19 | −74% | 41% | 8.8 | 32% | +17.1% / −6.4% | +1.2% / −2.5% | −22.7% |
| BTC | **Close > 50-day average** | 164% / 1.75 | **30.0%** | **0.78** | −60% | 53% | 11.4 | 35% | +17.7% / −4.7% | +3.2% / −1.8% | −24.6% |
| BTC | Close > 100-day average | 176% / 1.77 | 24.0% | 0.66 | −46% | 53% | 8.6 | 45% | +14.5% / −5.6% | +3.4% / −0.3% | −14.6% |
| BTC | 28-day momentum | 157% / 1.71 | 17.5% | 0.52 | −57% | 54% | 16.3 | 46% | +8.1% / −4.3% | +1.4% / −0.6% | −25.9% |
| BTC | **Weekly close > 10-week average** | 178% / 1.80 | 14.3% | 0.45 | **−48%** | 52% | **5.3** | 47% | +20.5% / −9.9% | +4.3% / −1.3% | −24.4% |
| ETH | Buy-and-hold | 131% / 1.30 | 20.4% | 0.58 | −80% | 100% | — | — | — | — | — |
| ETH | Close > 20-day average | 203% / 1.73 | 13.7% | 0.44 | −64% | 49% | 18.8 | 35% | +15.8% / −6.1% | +1.5% / −2.5% | −20.3% |
| ETH | Close > 50-day average | 222% / 1.80 | 31.7% | 0.71 | −61% | 52% | 10.2 | 36% | +22.5% / −6.2% | +4.2% / −1.7% | −30.8% |
| ETH | **20-day breakout** | 231% / 1.89 | 33.7% | **0.77** | −53% | 39% | 7.5 | 54% | +18.5% / −9.3% | +5.6% / +1.1% | −20.0% |
| ETH | **28-day momentum** | 161% / 1.52 | **39.9%** | **0.81** | −49% | 52% | 15.6 | 40% | +14.3% / −4.5% | +3.1% / −1.1% | −16.9% |
| ETH | Weekly close > 10-week average | 144% / 1.44 | 38.2% | 0.79 | −58% | 53% | 6.1 | 37% | +33.3% / −7.0% | +8.0% / −2.1% | −22.7% |

All 11 rules × 2 assets × 3 cost levels are in `results/p3_crypto_trend.csv`.

**Quarter Kelly per rule** (per-trade statistics with the mean halved; each trade treated as a bet against cash). Figures are stake as a share of NAV / expected log growth a year:
- BTC: 50-day average 20% / +3.1%; 100-day 21% / +2.6%; 28-day momentum 17% / +1.7%; 10-week average 13% / +1.3%.
- ETH: 28-day momentum 19% / +3.9%; 20-day breakout 18% / +3.2%; 10-week average 18% / +3.6%.
- These stakes are far above the constitution's caps, which bind (§9, R2).
- Relative to simply holding the coin, the gain is the timing alpha below, which is not significant.

Buy-and-hold is held to the same 60-day rule: one round trip every 60 days, about 3% a year at 0.25% per side. Without that churn, BTC compounded about 18% a year from 2 Jan 2021 and ETH about 24%. The alpha regressions below use the raw, cost-free asset return as the benchmark, which is conservative for the rules.

**Timing alpha vs buy-and-hold** (daily OLS, Newey-West; the right test for a long/flat filter):

| Rule | BTC alpha, test (t) | ETH alpha, test (t) | BTC worst month vs hold | ETH worst month vs hold |
|---|---|---|---|---|
| 10-day average | −2.8% (−0.24) | −4.5% (−0.29) | −21.5% vs −39.3% | −30.0% vs −46.5% |
| 20-day average | −6.9% (−0.59) | −0.2% (−0.01) | −23.1% | −30.6% |
| **50-day average** | **+15.8% (1.34)** | +14.3% (0.86) | −23.1% | −30.4% |
| 100-day average | +10.9% (0.96) | +6.2% (0.38) | −16.1% | −35.6% |
| 200-day average | +3.5% (0.30) | +17.7% (1.13) | −29.3% | −28.7% |
| 20-day breakout | −5.2% (−0.47) | +18.0% (1.14) | −23.1% | −30.4% |
| 7-day momentum | −16.2% (−1.29) | −7.5% (−0.48) | −23.7% | −26.6% |
| 14-day momentum | −5.8% (−0.52) | +11.1% (0.66) | −23.1% | −31.0% |
| 28-day momentum | +5.9% (0.50) | **+19.4% (1.24)** | −26.9% | −21.7% |
| 10-week average | +2.7% (0.24) | +18.2% (1.13) | −24.4% | −21.1% |
| 20-week average | −0.9% (−0.07) | +4.1% (0.26) | −25.2% | −29.8% |

**Readings:**
1. **Design-sample Sharpe ratios of 1.5–2.1 were a bubble-era artefact.** Picking the design winner (the 20-day breakout for both) gave BTC −5.2% a year of alpha and ETH +18%. A pre-committed choice would have been a coin flip.
2. **The effect depends on speed.** Every rule of 20 days or less has negative or zero BTC alpha after 2021. Rules of 28 days or more are positive for both assets, though none is significant: the maximum t is 1.34, against a Bonferroni bar of 2.84 for 11 rules and a deflated-Sharpe probability of 0.55–0.60.
3. **What survives is drawdown control.** Across rules the worst month roughly halves (BTC −16% to −29% vs −39%). This is track 02's conclusion at shorter holds.
4. **Costs and lag matter for the fast rules only.**
   - BTC 10-day average (test): Sharpe 0.63 at 0.05% per side, 0.29 at 0.25% and −0.14 at 0.50%.
   - The 50-day average barely moves: 0.90 / 0.78 / 0.64.
   - Executing a day earlier or later changes the fast rules' Sharpe by ±0.3 and the slow ones by ±0.1 (`p3_crypto_trend_lag.csv`).
5. **BTC by calendar year** (0.25% per side): in 2022, holding lost 65%, the 20-day filter 57%, the 50-day 53% and the 20-week 32%. Daily filters did not dodge a year of gap-down crashes (LUNA, 3AC, FTX); they entered on relief rallies and were stopped out.

### 4.2 Day-of-week and weekend effects

- **Bitcoin daily returns.** In the design sample Monday was +0.83% a day (t = 2.25 vs other days). In the test sample it fell to +0.30% (t = 1.05). Wednesday rose to +0.39% (t = 1.70) and Thursday −0.22% (t = −1.94).
- **Ether (test):** Wednesday +0.63% (t = 2.02), but its design-sample t was −0.13.
- **Significance.** None of the 28 day-by-period-by-asset cells clears the Bonferroni bar (2.99), and the sign pattern does not persist.
- **Weekend-only holding** (Friday close → Sunday close) has a gross Sharpe of 0.44–0.69 but loses 4–15% a year after one round trip a week. **Verdict: no edge.**

### 4.3 Rebounds after large drops (buy at the next close, hold 1–60 days, 0.5% round trip; events declustered by 10 days)

| Trigger | Asset | Horizon | Design mean (n) | Test mean (n) | Test bootstrap p (vs all days) |
|---|---|---|---|---|---|
| 1-day fall ≤ −10% | BTC | 1 day | +0.95% (36) | −2.11% (9) | 0.96 |
| 1-day fall ≤ −10% | BTC | 30 days | +9.5% | +6.8% | 0.20 |
| 3-day fall ≤ −15% | BTC | 3 days | +1.73% (33) | −5.31% (8) | 0.998 |
| 30-day drawdown ≤ −25% | BTC | 1 day | +2.07% (43, p = 0.001) | −0.47% (17) | 0.53 |
| 1-day fall ≤ −7% | BTC | 1 day | +0.97% (65) | +1.03% (21) | **0.01** |
| 1-day fall ≤ −10% | ETH | 1 day | **−2.41%** (34) | +1.61% (19) | 0.02 |

- **The design-period bounce did not persist.** In 2013–2020, buying a crash paid within 1–3 days. After 2021 most signs flip.
- **The two p ≤ 0.02 cells in the test sample are what chance predicts.** There are 48 cells per period, and the ETH cell had the opposite sign in the design sample.
- **Verdict: no rebound rule** (`p3_rebounds.csv`).

### 4.4 Funding-rate extremes (7-day average perpetual funding, annualised; BTC/ETH forward returns)

| Venue / horizon | Funding < 0 (shorts pay) | 5–10% | > 40% (euphoria) | Spearman correlation (funding, forward return) |
|---|---|---|---|---|
| BitMEX BTC, 7 days, design | +2.58% (87) | +4.07% | **+3.15%** (55) | −0.04 |
| BitMEX BTC, 7 days, test | +0.12% (82) | +0.97% | **−2.96%** (11) | +0.06 |
| BitMEX BTC, 30 days, design / test | +24.0% (21) / +6.3% (21) | | +5.0% / −0.5% | −0.32 / −0.12 |
| Binance BTC, 14 days, test | −1.34% (12) | +0.39% | −5.98% (8) | −0.05 |
| Binance ETH, 14 days, test | +0.45% | +1.77% | **+2.78%** (8) | +0.12 |

**Rules tested** (0.25% per side):

| Rule | Design Sharpe | Test Sharpe |
|---|---|---|
| Long BTC for 14 days after 7-day funding < 0 (BitMEX) | 1.21 | 0.20 (9.6 trades a year) |
| Same rule, Binance BTC | | 0.43 (4.2 trades a year) |
| Same rule, ETH | | 0.53 |
| 20-day trend filter with a "flat when funding > 30%" overlay | worse than the plain filter in design | mixed in test (−0.27 to +0.10 vs the plain filter) |

**Verdict: not robust.**
- "Euphoric funding precedes weakness" appears for BTC after 2021 (n = 8–16) but reverses before 2021 and for ETH.
- Negative funding preceded big rallies before 2021, largely March and late 2020, but not reliably after.
- This is consistent with Schmeling, Schrimpf & Todorov (2023), who find crypto carry forecasts *crash risk* rather than average returns **[unverified detail]**.
- Use funding only as a context gauge.

### 4.5 Spot-Bitcoin-ETF flows (The Block daily series, 2024-01-11 → 2026-09-25; $57.9bn cumulative)

| Flow window → forward horizon | Spearman (flow, forward return) | Spearman (flow, past return) | Top-quintile forward | Bottom-quintile forward |
|---|---|---|---|---|
| 1 day → 1 day (n = 653) | −0.01 | 0.42 | +0.08% | +0.02% |
| 5 days → 5 days (n = 130) | +0.05 | 0.52 | −0.08% | −0.92% |
| 5 days → 20 days (n = 32) | +0.24 (t ≈ 1.3) | 0.52 | +0.42% | −7.75% |
| 20 days → 20 days (n = 31) | +0.02 | 0.57 | +7.16% | +2.04% |

- **Flows chase price.** Correlation with *past* returns is 0.4–0.6, with no reliable link to future returns.
- **Track 08's trigger ("four straight weeks of positive flows") had no edge.** The 4-week forward return was +0.6% when on vs +3.3% when off.
- **Verdict: not a signal** (confirms track 05). With only 2.7 years of data it cannot be tested out of sample anyway.

### 4.6 Altcoin momentum (Binance, survivorship-free; weekly; 0.35% per side)

**Universe.** Each Sunday, take the top N alts by 30-day median USDT volume.
- Each alt needs at least 60 days of history.
- BTC and ETH are excluded. Delisted coins are included. Tokenized stocks listed from June 2026 are excluded.
- Trade at the Monday close and hold one week.
- The top-20 set starts in mid-2019, when 20 eligible pairs existed, so its design sample is only 91 weeks.

**Liquidity.** The 20th-ranked alt traded $2m a day on Binance in Dec 2019, $15m in 2020, $13m in 2022, $119m in Dec 2024 and $10m in Aug 2026. US venues list fewer coins and have thinner books.

| Strategy (top-20 universe) | Design CAGR / Sharpe | Test CAGR 2021–Aug 2026 | Test Sharpe | Test max drawdown |
|---|---|---|---|---|
| BTC buy-and-hold (reference) | +197% / 1.81 | **+20.7%** | 0.61 | −77% |
| Equal-weight top-20 alts | +18.5% / 0.63 | **−19.9%** | 0.17 | −96% |
| Cross-sectional momentum, 7-day (top quintile) | −31.7% / 0.07 | −35.0% | 0.04 | −99% |
| Cross-sectional momentum, 14-day | −11.8% / 0.39 | −29.4% | 0.13 | −98% |
| Cross-sectional momentum, 28-day | +2.4% / 0.54 | −28.9% | 0.12 | −96% |
| Momentum 28-day long/short (not accessible; information only) | −46.2% / −0.52 | −39.4% | −0.21 | −95% |
| Time-series momentum, 28-day (hold an alt only while its 28-day return > 0) | −31.4% / 0.10 | +3.1% | 0.47 | −90% |
| Reversal, 7-day (buy last week's losers) | +14.5% / 0.60 | −65.9% | −0.65 | −100% |

**Other universes, test CAGR for 7/14/28-day cross-sectional momentum:**
- top-10: −32% / −28% / −33%;
- top-40: −49% / −58% / −51%. The design Sharpe here was 0.9–1.3, and it became −0.2 to −0.4 in test;
- Coinbase-listed today (survivorship bias in the strategy's favour): −19% / −10% / −22%.

**Per coin-week** (top-20, net of a 0.7% round trip):
- 28-day momentum: mean +0.01%, median −2.0%, win rate 44%.
- Equal weight: mean −0.21%.
- Worst coin-week: −100% (collapses like LUNA/UST inside one week).

**Verdict: avoid.**
- **Decay.** The broad-universe momentum that looked strong in 2019–20 (Sharpe 1.2–1.3 for top-40) turned into large losses after 2021. This is the post-publication pattern (Liu, Tsyvinski & Wu 2022).
- **Class performance.** Alts as a class lost about 20% a year while BTC made about 21%.
- **Best case is still unusable.** The only non-negative rule, alt time-series momentum, compounded about 3% a year with a −90% drawdown.

### 4.7 Implementation: which Bitcoin instrument for 1–60 day holds

| Instrument | Round-trip cost | Hours | Tax | Other |
|---|---|---|---|---|
| Spot at a US exchange (Coinbase / Kraken) | 0.2–1.2% (fee tier) | 24/7 | Short-term gains as ordinary income. No wash-sale rule for crypto as of this writing **[verify for 2026]** | Custody and venue risk |
| Spot ETF (IBIT, FBTC) | ≈0.05% (spread) + 0.25% a year fee | US market hours | Short-term gains; wash-sale applies | Monday gap 99th percentile 9.7%; worst −22.8% |
| CME Micro Bitcoin (MBT, 0.1 BTC) | ≈0.05–0.1% | Nearly 23 hours a day on weekdays | **Section 1256 (60/40)** | Pays the basis: about 5.3% annualised today vs 4.08% T-bills, so ≈1.2% a year over spot + cash. Monday gap 99th percentile 12.7% |

A trend trade half the time in the market pays about 0.6% a year in excess basis on MBT. In exchange it saves about 2 points a year of federal tax per 20% of pre-tax return at the top bracket. **MBT is the best vehicle for taxable accounts at or above about $50k.** Below that, use IBIT/FBTC.

---

## 5. Part 4 — Micro-futures practicalities

### 5.1 Contracts at the 2026-09-28 close

The margin column is an estimate: 3.5 × the daily standard deviation × notional, roughly a SPAN maintenance level. **Broker margins differ; [verify] with the broker.**

| Contract | Specification | Price | Notional | Volatility (1 year) | $ volatility per contract a year | $ one-day standard deviation | Estimated margin |
|---|---|---|---|---|---|---|---|
| MES | $5 × S&P 500 | 7,742.5 | $38,712 | 13.0% | $5,032 | $317 | ≈$1,100 |
| MNQ | $2 × Nasdaq-100 | 30,550 | $61,100 | 19.9% | $12,138 | $765 | ≈$2,700 |
| M2K | $5 × Russell 2000 | 2,837.8 | $14,189 | 18.5% | $2,625 | $165 | ≈$580 |
| MGC | 10 oz gold | 4,153.7 | $41,537 | 29.3% | $12,178 | $767 | ≈$2,700 |
| SIL | 1,000 oz silver | 61.12 | $61,125 | 69.5% | $42,486 | $2,676 | ≈$9,400 |
| MCL | 100 bbl WTI | 93.39 | $9,339 | 55.7% | $5,200 | $328 | ≈$1,150 |
| M6E | €12,500 | 1.1409 | $14,262 | 5.2% | $743 | $47 | ≈$160 |
| 10Y (micro yield) | $10 per bp | 5.24% | ≈$13.0k 10-year-bond equivalent | 5.1% | $667 | $42 | ≈$150 |
| MBT | 0.1 BTC | 83,169 | $8,317 | 45.3% | $3,768 | $237 | ≈$830 (CME BTC margins run far higher in practice, 30–50% of notional **[verify]**) |
| MET | 0.1 ETH | 2,671 | $267 | 63.8% | $170 | $11 | small |

**Roll schedule:**
- **Quarterly:** equity index micros (Mar/Jun/Sep/Dec; roll about 8 days before the third-Friday expiry) and Treasury yield/note futures.
- **Gold (MGC):** Feb/Apr/Jun/Aug/Oct/Dec.
- **Crude (MCL):** monthly. It expires about one business day before CL; CL itself expires 3 business days before the 25th **[verify MCL]**.
- **MBT/MET:** monthly, last Friday; cash-settled.

**Calendar consequence for the ≤60-day rule.** Equity and bond positions can be held through at most one roll. Crude needs a roll every month; its 12 rolls a year cost about 1 bp per roll on micros.

### 5.2 How a $10k–$250k account can size them

**(a) An 8-market trend book at 10% volatility** (3.5% of NAV of annual volatility per market). The cells are the contracts required:

| Account | MES | MNQ | MGC | MCL | 10Y | M6E | MBT |
|---|---|---|---|---|---|---|---|
| $10k | 0.07 | 0.03 | 0.03 | 0.07 | 0.53 | 0.48 | 0.09 |
| $25k | 0.18 | 0.07 | 0.07 | 0.17 | 1.3 | 1.2 | 0.23 |
| $50k | 0.35 | 0.15 | 0.15 | 0.34 | 2.7 | 2.4 | 0.47 |
| $100k | 0.70 | 0.29 | 0.29 | 0.68 | 5.3 | 4.8 | 0.94 |
| $250k | 1.8 | 0.73 | 0.73 | 1.7 | 13 | 12 | 2.4 |

**Below about $250k, a micro-futures trend book cannot be built without 2–10× risk errors per market.** Use ETF8 (fractional ETF shares) instead: Sharpe 0.42 after 2008, cost about 1% a year at 10% volatility.

**(b) A single-market trade** risking 2% of NAV (track 03 cap) on a stop 2 daily standard deviations away, × 1.5 for gaps:

| Account | MES | MNQ | M2K | MGC | MCL | 10Y | M6E | MBT | MET |
|---|---|---|---|---|---|---|---|---|---|
| $10k | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 6 |
| $25k | 0 | 0 | 1 | 0 | 0 | 3 | 3 | 0 | 15 |
| $50k | 1 | 0 | 2 | 0 | 1 | 7 | 7 | 1 | 30 |
| $100k | 2 | 0 | 4 | 0 | 2 | 15 | 14 | 2 | 60 |
| $250k | 5 | 2 | 10 | 2 | 5 | 39 | 35 | 7 | 151 |

A 2-standard-deviation stop is tight: 2–6% on equities, about 8% on BTC. For trend trades with wider exits (the 50-day average is often 10–25% away on BTC), size from the actual exit distance.

### 5.3 Gap risk (daily bars 2018–2026: open vs previous close)

| Instrument | Daily standard deviation | Weekday gap, 99th percentile of absolute value | Monday gap, 99th percentile | Worst gap (date) | Share of gaps > 2 standard deviations |
|---|---|---|---|---|---|
| ES=F (S&P futures) | 1.21% | 0.77% | 2.43% | −9.4% (2020-03-23) | 0.32% |
| SPY | 1.20% | 2.58% | 3.75% | −11.0% (2020-03-16) | 1.46% |
| GC=F / GLD | 1.11% / 1.08% | 1.65% / 2.66% | 1.97% / 3.15% | −4.0% / −6.2% | 0.41% / 2.05% |
| CL=F / USO | 3.02% / 2.62% | 3.03% / 6.44% | 7.75% / 9.28% | −33.1% (2020-04-22) / −24.7% | 0.50% / 2.05% |
| ZN=F / TLT | 0.36% / 0.97% | 0.52% / 2.10% | 0.63% / 2.02% | −1.1% / −3.4% | 0.41% / 1.50% |
| BTC=F (CME) | 4.09% | 4.14% | **12.68%** | −12.9% (2020-05-11) | 0.73% |
| IBIT (spot ETF) | 3.09% | 5.64% | **9.70%** | **−22.8% (2024-08-05)** | 1.77% |
| 6E=F (EUR futures) | 0.46% | 0.45% | 0.50% | −0.9% | 0.05% |

**Rules that follow:**
- **Futures reduce weekday gap risk but not weekend risk.** Near-24-hour trading lets overnight stops work.
- **Crypto exposure through US-hours instruments (IBIT, MBT) carries weekend gaps.** The 99th percentile is 10–13%, and one stop-through was 23%. Size them on the gap, not the stop. CME has announced plans for round-the-clock crypto futures trading **[unverified; verify status]**.

### 5.4 Tax (federal; state taxes come on top)

| Bracket | Section 1256 blended rate | Short-term rate | After-tax, 10% pre-tax: 1256 | After-tax, 10% pre-tax: short-term | 1256 advantage |
|---|---|---|---|---|---|
| Top (37% / 20% + 3.8% NIIT) | 30.6% | 40.8% | 6.94% | 5.92% | +1.02 points |
| 32% + NIIT | 25.6% | 35.8% | 7.44% | 6.42% | +1.02 points |
| 24% (no NIIT) | 18.6% | 24.0% | 8.14% | 7.60% | +0.54 points |

- **Section 1256 applies to regulated futures,** including micros and CME BTC/ETH futures, and to broad-index options.
- **Mark-to-market.** Positions are marked at year-end, so there is no deferral, and 1256 losses can be carried back 3 years against 1256 gains (Form 6781).
- **Short holds lose nothing extra under 1256.** Holding 1–60 days costs nothing extra on futures, whereas ETFs and spot crypto are always taxed at short-term rates.
- **Practical upshot.** Any 1–60-day trade in a taxable account should use futures where a liquid micro exists.

---

## 6. Data-mining ledger

| Family | Variants tried | Bonferroni t (5%, two-sided) | Best test result | Passes? |
|---|---|---|---|---|
| Multi-asset trend, 3 universes | 20 each (60) | 3.02 | MICRO8 TSMOM 6m weekly: t 2.72, deflated-Sharpe probability 0.81 | No (strict); yes as a prior-backed sleeve |
| Crypto trend BTC / ETH | 11 each (22), × 3 costs, × 3 lags | 2.84 | BTC 50-day average alpha t 1.34; ETH 28-day momentum t 1.24 | No |
| Energy term structure | 30 | 3.14 | Heating oil, long if backwardated: t 1.67 | No (filter only) |
| FX carry | 4 (+ ETF) | 2.50 | 2022–26 sub-period Sharpe 0.3 | No |
| Bond carry | 7 | 2.69 | Long/short on carry sign, t 1.34 | No |
| Crypto day-of-week / weekend | 18 | 2.99 | ETH Wednesday t 2.02 (design t −0.13) | No |
| Crypto rebounds | 48 | 3.28 | BTC ≤ −7% day, 1-day hold, p 0.01 | No |
| Funding extremes | 63 | 3.35 | Binance ETH negative-funding rule, test Sharpe 0.53 | No |
| ETF flows | 10 | 2.81 | 5-day flow → 20-day return, t ≈ 1.3 | No |
| Altcoin momentum | 32 | 3.16 | Alt time-series momentum 28-day, top-20: test Sharpe 0.47 but CAGR +3%, max drawdown −90%. Every cross-sectional variant lost money | No |
| **Total** | **≈300** | | | |

Post-publication results are shown throughout:
- TSMOM after Moskowitz, Ooi & Pedersen (2012), i.e. 2013–26;
- carry after Koijen, Moskowitz, Pedersen & Vrugt (2018; NBER 2013);
- commodity term structure after Erb & Harvey (2006) and Gorton & Rouwenhorst (2006), i.e. 2008+;
- crypto momentum after Liu & Tsyvinski (2021), i.e. 2021+.

---

## 7. What is firing on 2026-09-28

| Module | State | Detail |
|---|---|---|
| Multi-asset trend (MICRO8, 12-month TSMOM, monthly) | **ON** | Long: S&P 500 (12-month excess +14.8%), Nasdaq-100 (+17.1%), AUD (+7.7%), gold (+0.9%, marginal; the 6-month signal is short after −12.8% in 6 months and today's −4% day), WTI (+99.7%; small because of volatility scaling). Short: 10-year Treasury (−7.3%), EUR (−3.0%), JPY (−5.0%). Notional weights at 10% book volatility (× NAV): S&P +0.23, Nasdaq +0.15, 10-year −0.50, gold +0.11, crude +0.05, EUR −0.56, JPY −0.30, AUD +0.40. Halve them at the recommended s = 0.5 |
| BTC slow trend | **ON (long)** | $83,169 vs 50-day average $76,459 (long since 18 Aug at $64,696, +28.6%), 100-day $69,889, 10-week $75,225. **The 60-day time stop falls on about 17 Oct**; re-decide then. 20-day high $86,505; 10-day low $80,944 |
| ETH slow trend | **ON (long)** | $2,671 vs 50-day $2,403 (long since 9 Sep), 100-day $2,102 (long since 16 Aug at $1,873), 28-day momentum +8.3% |
| Energy contango filter | Not blocking crude or products; **blocking natural gas** | WTI Nov-26 → Dec-26 roll yield +47% a year (X26 $93.26, Z26 $89.65); heating oil +69%; RBOB +60–73%; natural gas −55% to −122% (winter contango); gold −5% (normal) |
| Energy "long if backwardated" | Would be long, **not a trade** | Weak out-of-sample record (portfolio 0.12, WTI −0.07) |
| FX carry | Off (dead) | The dollar is a high yielder: CHF −3.9, JPY −2.4, EUR −1.8 points |
| Bond carry | Neutral | 10-year carry + roll +1.37% a year, but the 12-month trend is down |
| Funding | Neutral | 7-day annualised: BitMEX 10.4%, Binance 9.0% (BTC); live: Kraken 6.6%, BitMEX 11.0%, OKX 4.9% (BTC), Kraken ETH 13.0% |
| Cash-and-carry basis | Off | Deribit Oct/Nov/Dec/Mar: 4.9 / 5.3 / 5.3 / 5.2%, vs a trigger of T-bill + 6 ≈ 10% |
| ETF-flow trigger | Off (no edge anyway) | Last 4 weeks: +$0.99bn, −$0.46bn, +$0.01bn, +$2.39bn |
| Crypto rebound triggers | None | BTC 1-day −1.45%, 30-day drawdown −3.9% |

---

## 8. Limitations

- **Synthetic futures.**
  - Equity indices are price-only; bonds are constant-maturity approximations.
  - FX carry uses monthly OECD rates spliced with call-money rates.
  - Gold is roll-adjusted by subtracting T-bills.
  - EIA energy prices stop in April 2024.
  - Individual contracts were not rolled at exact exchange calendars except for energy, whose calendar was validated.
- **The ETF sets have no pre-2008 history.** Their volatility scaling is ex post; Sharpe ratios are unaffected.
- **Universe choice.** MICRO8 was chosen for micro-contract availability, not performance, but it remains one of many possible 8-market sets. The broad universes are the conservative reference.
- **Crypto sample.**
  - The crypto design period (2013–2020) sits inside one secular adoption boom.
  - The test period is 5.7 years with about two cycles, so the standard error of a Sharpe ratio is about 0.4.
  - Pre-2014 BTC prices come from thin exchanges and are not used.
- **Altcoins.** Binance prices and volumes stand in for global liquidity. US venues list fewer coins with thinner books.
- **Funding and flow data.**
  - The funding series come from two offshore venues; the constitution's never-list (§3.9) keeps US retail off those perpetuals.
  - ETF flows come from a third-party aggregation over 2.7 years.
- **Unverified items.** Margins, some micro-contract listings and expiries, crypto wash-sale status and CME round-the-clock trading are marked **[verify]**.

---

## 9. Implications for the system design

Concrete, testable rules. The numbers come from §2–§7. Each rule records its shadow and paper results in the ledger from day one, and the monthly retrospective re-estimates **only** volatility, costs and slippage — never lookbacks.

### R1. Multi-asset trend sleeve (the one surviving short-horizon edge)

- **Instruments.**
  - Account ≥ $250k: MICRO8 via micro futures — MES, MNQ, 10Y (micro 10-year yield), MGC, MCL, M6E, JPY (6J or micro **[verify]**), M6A.
  - Account < $250k: ETF8 — SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA.
  - Where shorting is impossible: the long-only ETF8 version (test Sharpe 0.45; it keeps some equity and bond beta).
- **Signal.** Sign of the 252-day excess return, optionally averaged with the 126-day sign.
  - Evaluate on the first trading day of each month, at the close. Execute the next session (evening Globex or next-day close).
  - **Do not use lookbacks under 6 months or breakouts under 100 days** (post-2008 Sharpe ≤ 0.2 and often negative).
- **Holding.** Each position is re-decided every 21 trading days (well inside 60 days). A continuing position is rolled, not re-traded. Rolls follow the exchange calendar.
- **Sizing.**
  - Per market, notional = sign × (3.5% ÷ EWMA-60 annual volatility) × NAV × s.
  - s = 0.5 at launch (about 5% book volatility, below quarter Kelly's 0.69 on a Sharpe of 0.29).
  - Caps: gross notional ≤ 3× NAV; any single market ≤ 1× NAV; futures margin ≤ 25% of NAV. On an integer-contract shortfall, round down.
- **Exits.** Only the monthly sign flip. No discretionary stops. The worst single-market month was −2.9% of NAV at 10% volatility (−1.5% at s = 0.5), inside the 2% satellite stress cap.
- **Expected.** Forward Sharpe of about 0.3; about 12 rebalance tickets and 10–15 direction changes a year. Cost 0.3–0.5% a year at s = 0.5. Worst month about −4.5%, maximum drawdown about −11% at s = 0.5. Expected log growth +0.6% to +1.4% a year. In crises (2008, 2022) it tends to gain.
- **Kill or review** (never retune lookbacks on live P&L):
  - drawdown > 20% at s = 0.5 → review;
  - rolling 36-month Sharpe < −0.5 → pause to shadow;
  - both checked monthly.
- **Trade-budget accounting.** Count one ticket per monthly rebalance (one email with up to 8 orders). That uses 12 of the 24-a-year budget. If that is too many, drop to quarterly re-decision with a 63-day hold. **This breaks the 60-day rule, so it needs the user's sign-off.**

### R2. Crypto trend switch (risk control, not alpha)

- **Signals (slow only).**
  - BTC: close > 50-day average, or weekly close > 10-week average (5.3 trades a year).
  - ETH: 28-day momentum > 0, or weekly close > 10-week average.
  - **Never** use 7–20-day averages or momentum, or 20-day breakouts on BTC. Their alpha after 2021 was −3% to −16% a year, with 22–34 trades a year at 0.25% per side.
- **Use.** Gate the S4 Bitcoin sleeve (≤3%, opt-in):
  - hold S4 only when the switch is on;
  - when it is off, hold T-bills or MBT short-dated cash.
  - Post-2021 this cut BTC's worst month from −39% to −16–27%, while matching or beating buy-and-hold CAGR (14–30% vs 14.6%).
- **Holding ≤ 60 days.** Close at 60 days and re-enter at the next evaluation if still on; on MBT, the roll does this naturally.
- **Instrument.** MBT/MET (Section 1256) for taxable accounts ≥ $50k. IBIT/FBTC below that. Spot only on a US-regulated venue with fees ≤0.25% per side.
- **Sizing.**
  - Stake = min(quarter Kelly, 2% NAV ÷ gap-adjusted exit distance, S4 cap).
  - Quarter Kelly on half-shrunk per-trade statistics gives 13–20% of NAV for the slow rules, so the S4 cap (3%) or the stress cap binds. With a 25% exit distance plus a 13% weekend gap, the stress cap is 2%/38% ≈ 5%.
  - At the 3% cap the expected log-growth contribution is small: about 0.3–0.5% a year.
- **Promotion.** Promote to an alpha source only if 24 months of shadow trades show timing alpha with t ≥ 2. Otherwise it stays a risk overlay.

### R3. Energy contango filter (a veto, not a trade)

- **Never** hold a long position in WTI, heating oil, gasoline or natural gas futures, or USO/UNG/BNO/DBC-type ETFs, when the front roll yield ln(C1/C2)×12 < −20% a year.
  - Next-month excess return in that state: −1.6% (1985–2007) and −1.1% (2008–24).
- **Data.** Compute the roll yield from Yahoo `CL{M}{YY}.NYM`-style contract tickers, since EIA stopped publishing in April 2024.
- **Backwardation alone is not a buy signal.** Test Sharpe was 0.12. It may be logged as context for the trend sleeve's crude leg.

### R4. What never to trade (short-horizon additions to constitution §3.9)

- Fast trend rules on any market: lookbacks under 3 months, breakouts of 20–50 days, 7–20-day crypto averages or momentum.
- G10 FX carry books, and ETF currency carry (test Sharpe 0.03 / −0.35). Short-JPY carry especially while USDJPY is at 155 or above (intervention zone).
- Standalone commodity carry (backwardation-long) books.
- Crypto calendar rules (weekday, weekend), crash-rebound buys with 1–60 day holds, funding-rate contrarian rules, and ETF-flow rules. None survived design → test, and all fail Bonferroni.
- Altcoin momentum rotation or any alt basket as a 1–60-day trade. After 2021 every tested alt strategy (32 variants) lagged BTC by ≥17 points a year, cross-sectional momentum lost 10–58% a year, and weekly coin-level losses reach −100%.
- A diversified micro-futures book below about $250k (integer rounding). Any futures position whose gap-adjusted stress loss exceeds 2% of NAV.
- Stops tighter than the weekend-gap distribution on crypto held through IBIT or MBT: the 99th percentile of Monday gaps is 10–13%.

### R5. Monthly retrospective (what may change)

- **Tier 1, automatic:** EWMA volatilities, cost and slippage estimates from actual fills, basis and funding context, the contango state, and account-size feasibility (whether integer contracts still hit the risk target within ±50%).
- **Tier 2, annual, with the user's approval:** switching the trend sleeve between 12-month and 12/6-month blends. Allowed only if the change improves **both** the 1971–2007 and 2008–present samples on at least two of the three universes.
- **Never:** adding fast variants back because of a good month.
- **Shadow book from day one:** R1 (all three universes), R2 (all slow and fast crypto rules, to keep measuring the decay), R3, plus the incubator rules (bond carry filter, funding rules, altcoin momentum). Score them monthly with the deflated-Sharpe and Bonferroni counts in §6.

---

## Appendix A — Reproducibility

Run in `research/code/15-short-futures-crypto/`, in this order. Each step caches raw data under `$TRACK15_SCRATCH`, which defaults to the session scratchpad.

| Step | Script | Purpose | Runtime |
|---|---|---|---|
| 1 | `python fetch_data.py all` | Yahoo, FRED, EIA, Coin Metrics, funding | ~5 minutes |
| 2 | `python fetch_alts.py` | Binance archive, 656 pairs | ~25 minutes |
| 3 | `python assets.py` | Builds the universes; energy roll validation | |
| 4 | `python p1_trend.py` | Trend grid, decades, trades, funds; `results/p1_*` | ~10 minutes |
| 5 | `python p1b_robust.py` | Leave-one-out, ETF8, worst months | |
| 6 | `python p2_carry.py` | Energy, FX and bond carry | |
| 7 | `python p3_crypto.py` | Trend, day-of-week, rebounds, funding, ETF flows, alpha vs buy-and-hold, current state | ~5 minutes |
| 8 | `python p3b_alts.py` | Altcoin momentum | |
| 9 | `python p4_micro.py` | Contracts, sizing, gaps, tax | |
| 10 | `python p5_current.py` | Live snapshot | |
| 11 | `python p6_summary.py` | Haircuts, Kelly, calendar years | |

## Appendix B — References

- Moskowitz, T., Ooi, Y.H. & Pedersen, L.H. (2012). Time series momentum. *Journal of Financial Economics* 104(2).
- Hurst, B., Ooi, Y.H. & Pedersen, L.H. (2017). A century of evidence on trend-following investing. *Journal of Portfolio Management* 44(1).
- Koijen, R., Moskowitz, T., Pedersen, L.H. & Vrugt, E. (2018). Carry. *Journal of Financial Economics* 127(2).
- Erb, C. & Harvey, C. (2006). The strategic and tactical value of commodity futures. *Financial Analysts Journal* 62(2).
- Gorton, G. & Rouwenhorst, K.G. (2006). Facts and fantasies about commodity futures. *Financial Analysts Journal* 62(2).
- Gorton, G., Hayashi, F. & Rouwenhorst, K.G. (2013). The fundamentals of commodity futures returns. *Review of Finance* 17(1).
- Brunnermeier, M., Nagel, S. & Pedersen, L.H. (2008). Carry trades and currency crashes. *NBER Macroeconomics Annual* 23.
- Liu, Y. & Tsyvinski, A. (2021). Risks and returns of cryptocurrency. *Review of Financial Studies* 34(6).
- Liu, Y., Tsyvinski, A. & Wu, X. (2022). Common risk factors in cryptocurrency. *Journal of Finance* 77(2).
- Schmeling, M., Schrimpf, A. & Todorov, K. (2023). Crypto carry. BIS Working Paper 1087 **[details unverified]**.
- Bailey, D. & López de Prado, M. (2014). The deflated Sharpe ratio. *Journal of Portfolio Management* 40(5).
- Harvey, C., Liu, Y. & Zhu, H. (2016). … and the cross-section of expected returns. *Review of Financial Studies* 29(1).
