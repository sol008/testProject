# 06 — Empirical backtests of "few trades, high % return" rules (1928–2026)

*Research track 06. Data through the close of 2026-09-28. All numbers below come from code in
`research/code/06-backtests/` (run `python3 run_all.py`); result CSVs are in `research/code/06-backtests/results/`.*

---

## TL;DR

1. **Crash-buying works per trade, but it does not work as a strategy on its own.** Buying the S&P 500 after a -20% drawdown from its all-time high (ATH) and holding 3 years won 10 of 12 times since 1928 (83%). The median gain was +48% (total return, 1x). The worst was -58% (Oct-1929). Waiting in T-bills for these signals returned only **4–8% a year over 1928–2026, versus 10.2% for buy-and-hold**, because the index spends most of its time near highs. Use crash signals to **add** exposure to a portfolio that is already invested. Do not sit in cash waiting for them.
2. **"Hold until a new ATH" always wins eventually in the US, but it can take decades.** It took 25.0 years after 1929 (price), 7.5 years after 1973 and 7.2 years after 2000. Outside the US: 34 years for the Nikkei (1990–2024), 15 years for the Nasdaq (2000–2015), and 26+ years and counting for the Athens index.
3. **Leverage is what turns a good rule into ruin.**
   - The 3x daily-rebalanced model (calibrated to SSO/UPRO within 0.1 pp/yr) lost more than 90% on every 1929–31 entry and on the Jul-2008 entry.
   - **Out of sample (36 non-US indices, 199 trades), 3x crash-buys held 3 years lost more than 50% in 43% of trades.** The median trade was -36%.
   - At 1x the same trades won 69% of the time, with a median of +21%.
4. **Failure filters.** No filter would have avoided 1929 without hindsight: VIX>40, credit spread, Fed easing, CAPE<20, 50/200-day trend confirmation and stop-losses all fail on it. Out of sample, three things helped modestly:
   - deeper thresholds: 3-year geometric return per trade was +15% at -20%, +21% at -40% and +35% at -50%;
   - price below 1.3x its own 10-year average;
   - a 200-day trend confirmation.

   A 25% stop-loss rescued 1929 in-sample and **hurt out of sample** (textbook overfitting).
5. **Few-trade trend following mainly buys drawdown control, not return.**
   - The 10-month SMA (about 0.75 round trips a year) cut the US maximum drawdown from -83% to -48% at similar CAGR (9.8% vs 10.1%, 1928–2026).
   - It reduced max drawdown in **36 of 36** other markets (median -36% vs -64%).
   - Its real use is to gate leverage: 10-month-SMA 3x returned 16.2% vs 9.6% for 3x buy-and-hold.
   - After publication it lagged: 2007–2026 1x returned 9.1% vs 11.0%. The 200-day MA with 3x (Gayed-Bilello) returned 23.7% vs 29.4% for 3x buy-and-hold in 2016–2026. GEM dual momentum returned 8.9% vs 15.2% in 2013–2026.
6. **VIX ≥ 45 spike buys:** 8 signals since 1986, 7 wins, median 1-year gain +24%, worst -7% (Sep-2008). But the pre-VIX analogue (realised-volatility spikes, 1929–46) won only 4 of 11. The modern record is probably a regime-specific streak.
7. **Bitcoin rules show the largest per-trade % returns in the data (+200% to +7,600% per trade), and the evidence behind them is the weakest.** There are 3–4 cycles. Returns fell roughly an order of magnitude per cycle: buying 18 months before a halving and selling 18 months after returned +6,802%, +4,791%, +920% and +478%. Intra-trade drawdowns reached -93%, and survivorship bias is extreme.
8. **Valuation is a poor timer but a strong risk flag.** Today's CAPE is **40.7 (own computation) / 41.5 (multpl.com, 25-Sep-2026)**, the 99th percentile since 1881. The 34 months in history with CAPE ≥ 35 (all 1998–2001) returned between -5.9% and +1.1% a year real over the next 10 years. The log-CAPE regression implies roughly 0–1% real per year for the next decade.
9. **Status on 2026-09-28:**
   - **No US crash-buy trigger.** S&P 7,683.69 is 1.5% below its 13-Aug-2026 ATH of 7,798.99; the -20% line is 6,239. VIX is 16, HY OAS is 2.93%, and the S&P is above both its 10-month and 200-day moving averages.
   - **Near-triggered:** the Bitcoin halving-cycle "buy 18 months before" window opens around **2026-10-08**. BTC is at $83.5k, 33% below its ATH and 1.27x its 200-week MA.
   - **Triggered abroad:** KOSPI fell 38.6% peak-to-trough in July 2026, but it trades at 2.5x its 10-year average, so the valuation filter says **no**. Jakarta is down 32–42% at 0.97x its 10-year average, so the filter says a small 1x position is allowed.
   - Other signals: GEM picks **ex-US**, the gold 10-month-SMA rule says **out**, and the commodity rule says **in**.

---

## 0. Data, conventions and biases

| Item | Source / treatment |
|---|---|
| S&P 500 daily, 1927-12-30 → 2026-09-28 | Yahoo `^GSPC` (S&P 90 composite before 1957). **Total return:** before 1988, Shiller's monthly dividend yield (D/P) accrued daily. From 1988, official `^SP500TR`. Check on the 1988–2023 overlap: synthetic 10.68%/yr vs official 10.74%/yr. |
| Risk-free | Ken French daily RF (1926-07 → 2026-08) extended with FRED `DTB3`. Japan: BoJ discount rate / call rate (FRED `INTDSRJPM193N`, `IRSTCI01JPM156N`). |
| Volatility | VIX (1990+), VXO (FRED `VXOCLS`, 1986–89). Before 1986: 21-day realised vol + 4 points (labelled a proxy). |
| Credit stress | **FRED now serves only 3 years of ICE BofA HY OAS** (`BAMLH0A0HYM2` starts 2023-09-29), so a historical HY filter cannot be run from free data. **Proxy:** Moody's Baa minus 10-year Treasury (daily `BAA10Y` from 1986; monthly Baa minus Shiller GS10 from 1919). |
| Valuation | Shiller `ie_data.xls`. The Yale file stops at 2023-09, so it was extended with monthly-average `^GSPC`, multpl.com trailing earnings/dividend growth (chain-linked) and FRED `CPIAUCNS`. The recomputed CAPE matches Shiller's within 0.33 points over 1881–2023. |
| Other indices | 36 series: Nikkei (FRED `NIKKEI225`, 1949+), Nasdaq, European, Asian and emerging-market indices, plus iShares USD country ETFs. **Local indices are price-only**, which understates returns by the dividend yield. |
| Bitcoin | Coin Metrics community `PriceUSD` daily from 2010-07-18 (Mt.Gox era, thin markets), spliced with Yahoo `BTC-USD`. Block height from blockchain.info. |
| Gold | Monthly averages from 1833 (`datasets/gold-prices`), analysed from 1971 (post-Bretton Woods). `GC=F` for the latest month. |

**Conventions, applied everywhere unless stated:**

- **No look-ahead.** Signals use closes up to day *t*. Trades execute at the **next** close (t+1). CAPE is lagged 4 months to allow for earnings reporting.
- **Costs.** Round-trip trading costs are 0.10% (1x), 0.20% (leveraged ETFs), 3% of premium (options) and 0.5% (BTC).
- **Leverage model.** Daily-rebalanced L×: `L*r - (L-1)*(T-bill + 0.75%) - 0.9%/yr`. Against actual funds (CAGR, this model minus actual):

  | Fund | Period | Gap |
  |---|---|---|
  | SSO (2x) | 2006–2026 | -0.02 pp/yr |
  | UPRO (3x) | 2009–2026 | -0.11 pp/yr |

  So the volatility drag and financing costs are realistic.
- **"3x\*" = ruin-capped.** A leveraged position that falls to 10% of its entry value is treated as abandoned at about -90%. Nobody holds a -99.8% position for 22 years, and many such funds would be closed.
- **Drawdown definitions.** "ATH mode" measures the drawdown from the running all-time high, with one signal per threshold per ATH episode. "Bear mode" is the classic real-time definition: the reference peak resets after a 20% rally off the low. It adds the 1930s–40s bear markets that happened while the index was still below its 1929 peak.

**Biases to keep in mind:**

- **Survivorship.** The US was the 20th century's best-performing major market (Dimson, Marsh & Staunton 2002, *Triumph of the Optimists*; Brown, Goetzmann & Ross 1995, "Survival", *J. Finance*). The international panel has survivorship too: markets that were closed (Russia 1917, China 1949) and hyperinflation local-currency indices are excluded.
- **Small samples.** There are only 12 US ATH drawdowns ≥20% in 98 years. Cross-market trades cluster in about six global crises (1987, 1990, 1997–98, 2000–02, 2008, 2020, 2022).
- **Data-mining.** Every rule here is a popular idea selected partly because it looked good historically. Harvey, Liu & Zhu (2016, *RFS*) and Bailey & López de Prado (2014, "The Deflated Sharpe Ratio") argue for heavy haircuts on such rules.
- **2026 data.** The 2026 prices (for example KOSPI 8,476 in May 2026 and Nikkei 70,062 in June 2026) come from live feeds and post-date my training data. They are internally consistent but I could not independently verify them.

---

## 1. Crash-buying the S&P 500, 1928–2026

### 1.1 Every ATH drawdown of 20% or more (price index)

| Peak | Trough | Max DD | Recovery (new ATH) | Years peak→trough | Years underwater |
|---|---|---|---|---|---|
| 1929-09-16 | 1932-06-01 | -86% | 1954-09-22 | 2.7 | **25.0** |
| 1956-08-03 | 1957-10-22 | -21% | 1958-09-24 | 1.2 | 2.1 |
| 1961-12-12 | 1962-06-26 | -28% | 1963-09-03 | 0.5 | 1.7 |
| 1966-02-09 | 1966-10-07 | -22% | 1967-05-04 | 0.7 | 1.2 |
| 1968-11-29 | 1970-05-26 | -36% | 1972-03-06 | 1.5 | 3.3 |
| 1973-01-11 | 1974-10-03 | -48% | 1980-07-17 | 1.7 | 7.5 |
| 1980-11-28 | 1982-08-12 | -27% | 1982-11-03 | 1.7 | 1.9 |
| 1987-08-25 | 1987-12-04 | -34% | 1989-07-26 | 0.3 | 1.9 |
| 2000-03-24 | 2002-10-09 | -49% | 2007-05-30 | 2.5 | 7.2 |
| 2007-10-09 | 2009-03-09 | -57% | 2013-03-28 | 1.4 | 5.5 |
| 2020-02-19 | 2020-03-23 | -34% | 2020-08-18 | 0.1 | 0.5 |
| 2022-01-03 | 2022-10-12 | -25% | 2024-01-19 | 0.8 | 2.0 |

How often each threshold has been reached since 1928:

| Threshold | Episodes | Roughly once every |
|---|---|---|
| -20% | 12 | 8 years |
| -30% | 7 | 14 years |
| -40% | 4 | 25 years |
| -50% | 2 | 50 years |

With dividends reinvested, the 1929 peak was regained in **Jan-1945** (15.3 years), versus 25 years for the price index.

### 1.2 Every trade (ATH mode; entry = close after the first close beyond the threshold)

Column key:

- Returns are total return.
- **3x\*** = ruin-capped 3x.
- "to-ATH" = hold until the old peak is regained.
- **2y call** = synthetic 2-year ATM call bought at entry, held to expiry, return on premium. The first number uses the term-structure implied-vol mapping (IV in brackets); "@VIX" prices the option at spot VIX.
- A blank cell means the trade has not finished yet.

| Thr | Entry | DD at entry | CAPE | Vol | 1y 1x | 2y 1x | 3y 1x | 5y 1x | 3y 3x\* | 5y 3x\* | to-ATH yrs | to-ATH 1x | to-ATH CAGR | 2y call (IV) | 2y call @VIX |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| -20% | 1929-10-29 | -36% | 21.7 | 73.9 | -10% | -45% | -58% | -42% | -91% | -91% | 24.9 | +544% | +8% | -100% (38%) | -100% |
| -30% | 1929-10-30 | -28% | 24.4 | 88.4 | -21% | -50% | -63% | -48% | -91% | -91% | 24.9 | +472% | +7% | -100% (43%) | -100% |
| -40% | 1929-11-13 | -45% | 18.5 | 96.5 | -2% | -32% | -48% | -29% | -92% | -92% | 24.9 | +644% | +8% | -100% (45%) | -100% |
| -50% | 1930-11-11 | -50% | 16.1 | 39.5 | -25% | -43% | -23% | +11% | -91% | -91% | 23.9 | +696% | +9% | -100% (26%) | -100% |
| -20% | 1957-10-22 | -21% | 13.7 | 20.8 | +36% | +54% | +50% | +67% | +148% | +163% | 0.9 | +32% | +36% | +396% (19%) | +353% |
| -20% | 1962-05-29 | -20% | 17.8 | 37.2 | +25% | +47% | +68% | +82% | +241% | +227% | 1.3 | +30% | +23% | +194% (25%) | +95% |
| -20% | 1966-08-30 | -19% | 19.1 | 21.3 | +27% | +39% | +38% | +54% | +68% | +61% | 0.7 | +27% | +42% | +159% (19%) | +140% |
| -20% | 1970-01-30 | -22% | 16.5 | 14.2 | +18% | +31% | +50% | +6% | +110% | -57% | 2.1 | +37% | +16% | +74% (17%) | +95% |
| -30% | 1970-05-15 | -29% | 14.5 | 22.4 | +36% | +48% | +52% | +41% | +121% | +0% | 1.8 | +50% | +25% | +191% (20%) | +166% |
| -20% | 1973-11-28 | -19% | 14.6 | 25.9 | -25% | +2% | +19% | +21% | -18% | -38% | 6.6 | +68% | +8% | -100% (21%) | -100% |
| -30% | 1974-07-08 | -33% | 11.1 | 20.2 | +21% | +40% | +40% | +62% | +45% | +51% | 6.0 | +98% | +12% | +123% (19%) | +114% |
| -40% | 1974-08-26 | -40% | 9.8 | 24.0 | +22% | +53% | +51% | +90% | +88% | +148% | 5.9 | +121% | +14% | +210% (20%) | +172% |
| -20% | 1982-02-23 | -21% | 7.1 | 21.7 | +39% | +53% | +86% | +215% | +184% | +828% | 0.7 | +33% | +52% | +146% (20%) | +132% |
| -20/-30% | 1987-10-20 | -30% | 13.3 | 140 (VXO) | +24% | +57% | +48% | +108% | +43% | +186% | 1.8 | +52% | +27% | +71% (45%) | -30% |
| -20% | 2001-03-13 | -22% | 33.5 | 27.5 | -2% | -28% | -3% | +17% | -49% | -28% | 6.2 | +42% | +6% | -100% (22%) | -100% |
| -30% | 2001-09-18 | -32% | 27.6 | 38.9 | -15% | +4% | +14% | +39% | -9% | +28% | 5.7 | +64% | +9% | -96% (26%) | -97% |
| -40% | 2002-07-17 | -41% | 23.8 | 35.5 | +10% | +26% | +42% | +87% | +88% | +220% | 4.9 | +84% | +13% | +51% (24%) | +6% |
| -20% | 2008-07-10 | -20% | 21.5 | 25.6 | -28% | -10% | +12% | +47% | **-90%** | **-90%** | 4.7 | +39% | +7% | -100% (21%) | -100% |
| -30% | 2008-10-07 | -36% | 16.7 | 53.7 | +9% | +22% | +24% | +88% | -18% | +141% | 4.5 | +74% | +13% | +12% (31%) | -39% |
| -40% | 2008-10-10 | -43% | 15.0 | 69.9 | +23% | +36% | +42% | +110% | +26% | +245% | 4.5 | +93% | +16% | +69% (36%) | -16% |
| -50% | 2008-11-21 | -49% | 13.3 | 72.7 | +42% | +57% | +59% | +150% | +117% | +627% | 4.3 | +116% | +19% | +180% (37%) | +38% |
| -20% | 2020-03-13 | -20% | 25.9 | 57.8 | +49% | +59% | +49% | +120% | +80% | +308% | 0.4 | +26% | (0.4y) | +200% (32%) | +72% |
| -30% | 2020-03-23 | -34% | 21.3 | 61.6 | +78% | +105% | +85% | +178% | +275% | +801% | 0.4 | +53% | (0.4y) | +431% (34%) | +197% |
| -20% | 2022-06-14 | -22% | 29.5 | 32.7 | +19% | +50% | +69% | | +160% | | 1.6 | +33% | +19% | +287% (23%) | +168% |

*2x results are in `results/us_crash_trades.csv`. The 1987 crash crossed -20% and -30% on the same day. Options before 1990 (no LEAPS market) and the IV mappings are approximations: `common.long_dated_iv` maps spot VIX to a 2-year IV of 12 + 0.35×VIX, capped at 45%. This is calibrated to the observed VIX6M/VIX relation in stress (VIX6M ≈ 15.8 + 0.53×VIX when VIX>30, 2008–2026). Pricing at spot VIX (the last column) is the conservative bound.*

### 1.3 Per-trade summary by threshold, holding rule and leverage (closed trades; the ATH rule includes open trades at mark-to-market)

| Thr | Hold | L | n | Win | Mean | Median | Worst | Geo-mean/trade | Worst in-trade DD |
|---|---|---|---|---|---|---|---|---|---|
| -20% | 1y | 1x | 12 | 67% | +14% | +21% | -28% | +11% | -47% |
| -20% | 3y | 1x | 12 | 83% | +36% | +48% | -58% | +28% | -80% |
| -20% | 3y | 2x | 12 | 75% | +51% | +64% | -91% | +22% | -97% |
| -20% | 3y | 3x | 12 | 67% | +66% | +74% | -91% | +7% | -100% |
| -20% | 5y | 1x | 11 | 91% | +63% | +54% | -42% | +50% | -80% |
| -20% | 5y | 3x | 11 | 55% | +134% | +61% | -91% | +9% | -100% |
| -20% | to ATH | 1x | 12 | 100% | +80% | +35% | +26% | +57% | -80% |
| -30% | 3y | 1x | 7 | 86% | +29% | +40% | -63% | +17% | -80% |
| -30% | 5y | 1x | 7 | 86% | +67% | +62% | -48% | +51% | -80% |
| -30% | 5y | 3x | 7 | 86% | +160% | +51% | -91% | +41% | -100% |
| -30% | to ATH | 1x | 7 | 100% | +123% | +64% | +50% | +96% (6.4y avg) | -80% |
| -40% | 5y | 1x | 4 | 75% | +65% | +88% | -29% | +52% | -80% |
| -40% | to ATH | 1x | 4 | 100% | +236% | +107% | +84% | +177% (10y avg) | -80% |
| -50% | 5y | 1x | 2 | 100% | +80% | +80% | +11% | +66% | -73% |

Two things stand out. First, leverage raises the *average* trade but lowers the *geometric* (compounding) trade, because one 1929-type loss wipes out several wins. Second, the "to ATH" win rate is 100% by construction; its cost is time. The median CAGR while waiting was 13–21%, but the 1929 trades earned about 8% a year for 25 years.

### 1.4 Filters on the S&P (full sample 1928–2026)

| Filter (same-day unless "armed") | Thr | n | 3y 1x win | 3y 1x median | 3y 1x worst | 3y 3x\* win | 3y 3x\* worst | to-ATH avg yrs |
|---|---|---|---|---|---|---|---|---|
| none | -20% | 12 | 83% | +48% | -58% | 67% | -91% | 4.3 |
| VIX (proxy) ≥ 40 | -20% | 6 | 83% | +31% | -58% | 50% | -91% | 6.4 |
| Baa-10y ≥ 3% | -20% | 6 | 83% | +31% | -21% | 50% | -91% | 6.8 |
| Baa-10y ≥ 4% | -20% | 3 | 100% | +14% | +4% | 33% | -90% | 9.3 |
| price > 50-day SMA (armed) | -20% | 12 | 75% | +43% | -58% | 67% | -90% | 4.2 |
| price > 200-day SMA (armed) | -20% | 12 | 92% | +45% | -68% | 83% | -91% | 3.8 |
| CAPE < 20 | -20% | 9 | 89% | +48% | -48% | 67% | -92% | 4.8 |
| price < 1.3× 10y avg | -20% | 9 | 89% | +38% | -28% | 56% | -90% | 4.4 |
| T-bill ≥1pp lower than 12m ago ("easing") | -20% | 7 | 71% | +43% | -64% | 57% | -90% | 6.3 |

Every filter still let at least one 1929–31 entry through at 3x (worst -90% or below), because the 1929–32 decline contained many bear-market rallies, easing moves and volatility spikes. The filters mostly *delay* entries, and **a delayed entry into a 1929 is still a 1929**.

### 1.5 Bear-cycle definition (27 signals at -20%, including the 1930s–40s)

| Thr | Hold | n | 1x win | 1x median | 1x worst | 3x\* win | 3x\* geo |
|---|---|---|---|---|---|---|---|
| -20% | 1y | 27 | 59% | +8% | -59% | 52% | -25% |
| -20% | 3y | 27 | 74% | +39% | -58% | 63% | -9% |
| -20% | 5y | 26 | 88% | +72% | -42% | 54% | +7% |
| -30% | 3y | 17 | 76% | +40% | -63% | 53% | -17% |
| -40% | 3y | 8 | 75% | +28% | -48% | 38% | -46% |
| -50% | 3y | 3 | 100% | +59% | +35% | 100% | +59% |

Buying every new 20% bear market mechanically meant buying **eleven times between Oct-1929 and Jan-1932**. All eleven 3x entries were ruined, and the 1x entries lost up to 59% within a year. The three -50% bear-mode signals (May-1932, Mar-1938, Nov-2008) all came near major lows and all won. That is n = 3.

### 1.6 Strategy level: idle money in cash vs. an invested core that is levered up during crash trades

| Rule (ATH mode) | L | Idle money | CAGR 1928– | Max DD 1928– | CAGR 1950– | Max DD 1950– | Time in trade |
|---|---|---|---|---|---|---|---|
| **Buy & hold** | 1x | — | **10.2%** | -84% | **11.7%** | -55% | 100% |
| Buy & hold | 2x | — | 11.8% | -98% | 15.1% | -88% | 100% |
| Buy & hold | 3x | — | 10.2% | -99.9% | 16.6% | -98% | 100% |
| -20%, hold 3y | 1x | T-bills | 4.4% | -80% | 6.9% | -47% | 33% |
| -20%, to ATH | 1x | T-bills | 7.7% | -80% | 8.6% | -47% | 53% / 41% |
| staged 20/30/40/50, to ATH | 1x | T-bills | 7.1% | -78% | 7.8% | -35% | 42% |
| -20%, to ATH | 2x | 1x index | 11.2% | -97% | 14.4% | -80% | 53% |
| -30%, to ATH | 2x | 1x index | 11.2% | -98% | 14.6% | -73% | 46% |
| -30%, to ATH | 3x | 1x index | 10.1% | -99.8% | 16.7% | -86% | 46% |

Two conclusions follow.

1. **Sitting in cash waiting for crashes costs 3–6 percentage points a year.** Over 98 years that is the difference between roughly 12,000x and 50–1,500x final wealth.
2. **Switching an invested core from 1x to 2x during crash trades added about 1–3 pp a year.** It did so at a much deeper worst drawdown (-73% to -97%), and the full-sample result depends entirely on whether 1929 is in the sample. From 1950 onward the 2x overlay nearly matches permanent 2x (14.6% vs 15.1%) with a smaller drawdown (-73% vs -88%).

### 1.7 Synthetic 2-year calls

| Configuration | n | Win | Median | Worst | Mean |
|---|---|---|---|---|---|
| Calls at -20% (central IV, return on premium) | 12 | 67% | +110% | **-100% (4 of 12)** | +74% |
| **20% of capital in 2y ATM calls + 80% T-bills**, per 2-year trade | 12 | 67% | +33% | **-19.5%** | +21% |

The 4 total losses were Oct-1929, Nov-1973, Mar-2001 and Jul-2008, which were all early entries in long bear markets. Pricing the calls at spot VIX instead of the term-structure IV cuts the winners' returns sharply; for example 1987 goes from +71% to -30%.

The call portfolio had the best loss profile of any leveraged implementation: its worst 2-year result was about -20%, versus -90% for 3x ETFs. The caveats are real, though:

- the pricing is Black-Scholes, not market quotes;
- skew is ignored;
- crisis bid-ask spreads can exceed the 3% assumed;
- there was no LEAPS market before 1990.

### 1.8 Caveats specific to Part 1

- There are 12 independent US episodes; the 1929 episode alone decides every leveraged comparison.
- Results before 1957 use the S&P 90.
- The dividend reconstruction before 1988 is an approximation; it was validated to within 0.06%/yr afterwards.
- The US sample is a survivor (see Part 2).

---

## 2. How crash-buying fails: 1929, Nikkei 1990, Nasdaq 2000 and 36 other markets

### 2.1 Nikkei 225 (price-only, yen)

| Signal | Entry | Px / 10y avg | 1y 1x | 3y 1x | 5y 1x | 3y 3x\* | Back to old ATH |
|---|---|---|---|---|---|---|---|
| -20% | 1990-03-22 | 1.86 | -11% | -37% | -47% | -91% | 2024-02-22 (**33.9 years**, +31%) |
| -30% | 1990-08-14 | 1.57 | -12% | -22% | -37% | -90% | 33.5 years, +46% |
| -40% | 1990-09-27 | 1.27 | +10% | -8% | -16% | -70% | 33.4 years, +79% |
| -50% | 1992-04-01 | 0.95 | +3% | -17% | -4% | -73% | 31.9 years, +110% |
| BoJ easing ≥1pp + DD ≥20% | 1991-12-03 | — | -22% | -13% | -7% | -69% | 32.2 years |

In 1989 Japan's CAPE was around 90 (published estimates; local earnings data was not available here). Even the -50% tranche lost at 3 and 5 years, and **policy easing did not help**: the BoJ cut from 6% in 1991 to 0.5% by 1995. The Nikkei then fell another 81% peak-to-trough, reaching its low in 2009.

### 2.2 Nasdaq Composite and Nasdaq-100, 2000

| Index | Signal | Entry | Px / 10y avg | 1y 1x | 3y 1x | 5y 1x | 3y 3x\* | Years to old ATH |
|---|---|---|---|---|---|---|---|---|
| Nasdaq Comp | -20% | 2000-04-13 | 3.02 | -48% | -62% | -46% | -90% | 15.0 |
| Nasdaq Comp | -30% | 2000-04-17 | 2.90 | -46% | -60% | -46% | -90% | 15.0 |
| Nasdaq Comp | -40% | 2000-11-13 | 2.10 | -36% | -34% | -26% | -90% | 14.4 |
| Nasdaq Comp | -50% | 2000-12-20 | 1.62 | -18% | -16% | -5% | -90% | 14.3 |
| Nasdaq-100 | -20% | 2000-04-13 | 4.18 | -54% | -71% | -59% | -91% | 15.6 |
| Nasdaq-100 | -50% | 2000-12-21 | 2.07 | -29% | -36% | -25% | -90% | 14.9 |

The Nasdaq Composite fell 78% (the Nasdaq-100 83%). Every tranche was still negative after 5 years, and **every 3x tranche was ruined**. The same rule on the Nasdaq worked in 1973–74 (4 tranches), 1987, 1990, 2018, 2020, 2022 and 2025.

### 2.3 S&P 500, 1929–1932

See rows 1–4 of the §1.2 table. Every -20/-30/-40/-50% tranche lost 23–63% over 3 years, and every 3x version was ruined. The bear-cycle version (§1.5) kept re-buying until 1932.

### 2.4 Other failures (1x unless noted; "open" = still below the old peak)

| Market | Entry (-20% signal) | 3y 1x | 5y 1x | 3y 3x\* | Status of old peak |
|---|---|---|---|---|---|
| Athens General (1999 peak) | 1999-12-21 | -64% | -46% | -90% | **still -57% on 2026-09-28 (26.8 years, open)** |
| FTSE MIB, Italy (2000 peak) | 2001-02-26 | -31% | -5% | -91% | regained 2026-05-25 (25.2 years) |
| ISEQ, Ireland (2007 peak) | 2007-09-17 | -64% | -56% | -90% | regained 2024-04-03 (16.5 years) |
| Shanghai Comp (2007 peak) | 2007-11-28 | -40% | -59% | -91% | **open, -36% (18.8 years)** |
| Hang Seng (2007 peak) | 2008-01-17 | -4% | -7% | -90% | regained 2018-01-16 (10.0 years) |
| Hang Seng (2018 peak) | 2018-09-12 | -2% | -32% | -44% | **open (8 years)** |
| MSCI Brazil ETF, USD (2008 peak) | 2008-07-10 | -2% | -39% | -92% | **open (18.2 years)** |
| MSCI Greece ETF, USD (2014 peak) | 2014-05-19 | -50% | -57% | -91% | regained 2025-07-01 (11.1 years) |

Across **all 36 non-US series** (1949–2026; 199 closed 3-year trades at the -20% signal, in 38 distinct entry years):

| Threshold | 1x 3y win | 1x 3y median | 1x P(loss > 30%) | 1x 3y geo | 3x\* 3y median | 3x\* P(loss > 30%) |
|---|---|---|---|---|---|---|
| -20% | 69% | +21% | 12% | +15% | **-36%** | **52%** |
| -30% | 64% | +17% | 10% | +14% | -39% | 52% |
| -40% | 73% | +21% | 8% | +21% | -37% | 55% |
| -50% | 81% | +40% | 5% | +35% | -18% | 47% |

At 1x, holding 5 years pushed the win rate to 70–84%. **At 3x the rule loses money outside the US at every threshold.**

Staged entry (equal quarters at -20/-30/-40/-50%, with unused quarters left in cash):

| Approach | Mean 3y return per episode | Standard deviation | Worst |
|---|---|---|---|
| Staged quarters | +16% | 0.28 | -57% |
| Single -20% entry | +24% | 0.50 | -71% |

Staging lowers the average return and roughly halves the dispersion.

### 2.5 Could the failures have been filtered without hindsight? An honest in-sample / out-of-sample test

**Design.** Candidate filters were ranked on **in-sample** S&P signals with entry 1928–1985. They were then evaluated unchanged on **out-of-sample** data: S&P 1986–2026 and the 36 non-US series. Metrics are 3-year holds, ATH mode, geometric mean per trade and the share of trades losing more than 30%.

| Filter | L | IS US 1928–85: n / median / P(loss>30%) / geo | OOS US 1986–2026: n / median / P(loss>30%) / geo | OOS 36 intl: n / median / P(loss>30%) / geo |
|---|---|---|---|---|
| none | 1x | 13 / +40% / 23% / +7% | 12 / +45% / 0% / +39% | 463 / +22% / 10% / +18% |
| none | 3x\* | 13 / +68% / 31% / -24% | 12 / +43% / 17% / +17% | 463 / -34% / 52% / -41% |
| 25% stop-loss | 1x | 13 / +40% / 0% / **+18%** | 12 / +45% / 0% / +26% | 463 / +0% / 2% / **+5%** |
| VIX ≥ 40 | 1x | 5 / -48% / 60% / -37% | 11 / +48% / 0% / +39% | 371 / +19% / 11% / +15% |
| > 50-day SMA (armed) | 1x | 13 / +39% / 23% / +5% | 12 / +42% / 0% / +34% | 463 / +23% / 9% / +17% |
| **> 200-day SMA (armed)** | 1x | 13 / +33% / 23% / +4% | 12 / +45% / 0% / +43% | 460 / +22% / **6%** / **+20%** |
| **> 200-day SMA (armed)** | 3x\* | 13 / +41% / 23% / -8% | 12 / +98% / 0% / +81% | 460 / -13% / **42%** / **-26%** |
| **Px < 1.3× 10y avg** | 1x | 12 / +39% / 25% / +14% | 9 / +42% / 0% / +36% | 272 / +22% / 9% / +19% |
| **Px < 1.3× 10y avg** | 3x\* | 12 / +57% / 33% / -30% | 9 / +26% / 11% / +10% | 272 / -3% / 41% / -24% |
| Px < 1.1× 10y avg | 1x | 10 / +29% / 0% / +18% | 7 / +33% / 0% / +34% | 238 / +24% / 9% / +19% |
| CAPE < 20 | 1x | 13 / +40% / 23% / +11% | 6 / +45% / 0% / +37% | n/a |
| Baa-10y ≥ 3% | 1x | 8 / +15% / 0% / +13% | 9 / +42% / 0% / +34% | n/a |
| Easing ≥ 1pp | 1x | 9 / +43% / 33% / +1% | 9 / +42% / 0% / +34% | n/a |

*The international counts pool all four thresholds, so they are larger than the 199 in §2.4.*

**Verdicts:**

- **The stop-loss is the in-sample winner** (it "fixes" 1929). **Out of sample it destroys return**: the international 1x geometric return falls from +18% to +5%. Do not use it.
- **VIX ≥ 40** is the worst in-sample filter (it fires on 1929-type panics). Out of sample it is neutral to negative.
- **Valuation relative to the market's own history** (price < 1.1–1.3× its 10-year average) is mildly positive in all three samples. In the international data it raises the 1x geometric return from +18% to +19%, and at 3x it cuts the geometric loss from -41% to -21/-24% and the P(loss>30%) from 52% to 39–41%. It flags the classic bubble crashes: Nasdaq 2000 (3.0×), Nikkei 1990 (1.9×), Shanghai 2007 (2.8×) and KOSPI 2026 (2.7×). It does *not* flag 1929 (Shiller's 10-year average rose with the 1920s boom), Ireland 2007 (1.3×) or Greece.
- **A 200-day trend confirmation** is the best out-of-sample filter for leverage. It does not help 1x much.
- **Deeper thresholds** (-40% and -50%) help consistently out of sample, and they reduce trade count.
- **Nothing makes 3x safe.** Even the best filtered 3x variants lose more than 30% in about 40% of international trades.

**Proposed no-hindsight failure rules**, supported by out-of-sample tests on other markets rather than by 1929 alone:

1. Never lever a crash-buy in a market trading above 1.3× its 10-year average price. Treat this as a hard cap at 1x.
2. Add leverage only after a close above the 200-day SMA.
3. Size tranches up at -40% and -50%.
4. Use no stop-losses; control risk with position size instead.
5. Prefer diversified indices (world/US) over single countries. The single-country tails (Greece, Ireland, Shanghai) are much fatter.

---

## 3. Trend following with few trades

### 3.1 Faber (2007) 10-month SMA on the S&P 500 (monthly, 1928-10 → 2026-09, total return; T-bills when out)

| Strategy | CAGR | Vol | Max DD | Time invested | Round trips/yr | Growth of $1 |
|---|---|---|---|---|---|---|
| Buy & hold 1x | 10.1% | 19% | -83% | 100% | 0 | 12,007x |
| **10-month SMA 1x** | 9.8% | 12% | **-48%** | 68% | **0.75** | 9,491x |
| Buy & hold 2x | 11.4% | 38% | -98% | 100% | 0 | 39,068x |
| 10-month SMA 2x | 13.6% | 24% | -78% | 68% | 0.75 | 264,050x |
| Buy & hold 3x | 9.6% | 57% | -100% | 100% | 0 | 7,860x |
| 10-month SMA 3x | 16.2% | 36% | -93% | 68% | 0.75 | 2.46 million x |

**Post-publication (2007-01 → 2026-09):**

| Strategy | 10-month SMA | Buy & hold |
|---|---|---|
| 1x CAGR (max DD) | 9.1% (-22%) | 11.0% (-51%) |
| 2x CAGR (max DD) | 13.9% (-42%) | 14.8% (-81%) |
| 3x CAGR (max DD) | 17.9% (-57%) | 15.1% (-94%) |

**By decade (CAGR):**

| Decade | SMA 1x | B&H 1x | SMA 3x | B&H 3x |
|---|---|---|---|---|
| 1930s | +5.0% | +0.1% | -1.2% | -32.3% |
| 1940s | +6.5% | +9.0% | +15.7% | +17.5% |
| 1950s | +18.2% | +19.2% | +52.0% | +53.8% |
| 1960s | +6.3% | +7.7% | +8.1% | +9.7% |
| 1970s | +8.6% | +5.8% | +10.0% | -3.3% |
| 1980s | +15.3% | +17.5% | +17.7% | +20.6% |
| 1990s | +12.4% | +18.2% | +20.7% | +38.1% |
| 2000s | +7.9% | -0.9% | +13.4% | -22.6% |
| 2010s | +8.6% | +13.6% | +18.3% | +32.5% |
| 2020s (to Sep-26) | +9.2% | +14.8% | +15.3% | +23.9% |

**Per trade, 1x:** 73 in-market spells. 59% won, the median spell returned +4%, the worst -20% and the best +125% (1995–98). The rule wins in decades with deep bear markets (1930s, 1970s, 2000s) and lags in bull decades.

**Out-of-sample check on 36 non-US series (price-only):**

- The SMA rule cut max drawdown in **36 of 36** markets (median -36% vs -64%).
- It lifted CAGR in 26 of 36 (median +0.4 pp/yr). Timing earns T-bills when out while price-only buy-and-hold misses about 2–3% of dividends, so on a total-return basis the CAGR effect is roughly zero.
- **The robust effect is drawdown control:**
  - Nikkei max DD -40% vs -81%;
  - Athens -30% vs -91%;
  - Nasdaq-100 -30% vs -81%.
- It failed in Jakarta (both -62%) and Turkey (-67% vs -71%, and CAGR 0.6% vs 4.9%). Mexico's CAGR was 8.7% vs 12.1%.

Full table: `results/trend_sma10_intl.csv`. This matches the long-horizon evidence in Hurst, Ooi & Pedersen (2017, "A Century of Evidence on Trend-Following Investing", *JPM*).

### 3.2 200-day MA with daily-rebalanced leverage (Gayed & Bilello 2016, "Leverage for the Long Run", SSRN 2741701)

Signal: close above the 200-day SMA → hold L× from the next close; otherwise T-bills. Two variants to reduce trading: evaluate only at month-end, or use a 3% band.

| Strategy (1928-10 → 2026-09) | CAGR | Max DD | Round trips/yr | CAGR 2016–2026 (post-pub) | Max DD 2016–2026 |
|---|---|---|---|---|---|
| Buy & hold 1x | 10.1% | -84% | 0 | 15.2% | -34% |
| 200DMA daily 1x | 10.2% | -52% | 3.0 | 11.1% | -22% |
| 200DMA 3% band 1x | 10.2% | -49% | **0.59** | 12.3% | -21% |
| Buy & hold 2x | 11.4% | -98% | 0 | 23.6% | -59% |
| 200DMA daily 2x | 14.6% | -80% | 3.0 | 17.5% | -42% |
| Buy & hold 3x | 9.6% | -99.9% | 0 | **29.4%** | -77% |
| 200DMA daily 3x | **18.5%** | -93% | 3.0 | 23.7% | -56% |
| 200DMA month-end 3x | 17.2% | -94% | 0.74 | 20.5% | -65% |
| 200DMA 3% band 3x | 17.7% | -91% | 0.59 | 27.2% | -55% |

What it shows:

- The Gayed-Bilello finding replicates over 1928–2026: leverage is survivable only with a trend filter. 3x buy-and-hold went to -99.9% in 1929–32 and to -99% in 2000–09.
- **Post-publication, every timed version lagged leveraged buy-and-hold**, because 2016–2026 had short, V-shaped sell-offs (2018, 2020, 2025) that whipsawed the rule.
- The 3% band gives the best trade-off: 0.6 round trips a year and the smallest post-publication shortfall.
- Even with the filter, 3x suffered -91% to -94% drawdowns (1929–32), because the signal lags by construction.

### 3.3 Dual momentum GEM (Antonacci 2012, SSRN 2042750; 2014 book *Dual Momentum Investing*)

Monthly rule:

- If the S&P 500's 12-month total return beats T-bills, hold whichever of US or developed ex-US (Ken French) had the higher 12-month return.
- Otherwise hold bonds (a synthetic 5-year Treasury total-return series; correlation 0.994 with IEI).

Data allows 1991-07 → 2026-08.

| Strategy | CAGR | Vol | Max DD | Round trips/yr |
|---|---|---|---|---|
| **GEM** | 11.3% | 12% | **-23%** | 0.77 |
| S&P 500 | 11.0% | 15% | -51% | 0 |
| Developed ex-US | 6.9% | 16% | -56% | 0 |
| 60/40 | 8.5% | 9% | -30% | 0 |

| Period | GEM | S&P 500 |
|---|---|---|
| 1991–2000 | 15.1% | 16.4% |
| 2001–2012 | 11.2% | 2.6% |
| **2013–2026 (post-publication)** | **8.9%** | **15.2%** |

The whole edge came from 2001–2012, the in-sample decade of the original research. Per holding spell: 55 spells, 69% won, median +2.1%, worst -13%.

**Current GEM pick (ETF proxies, 12 months to 2026-09-28):** SPY +16.9%, VEU +21.5%, T-bills about 3.7%, so hold **ex-US**.

---

## 4. Bitcoin (2010-07 → 2026-09; Coin Metrics daily close)

### 4.1 Drawdowns of 50% or more

| Peak | Peak $ | Trough | Trough $ | Max DD | Old ATH regained |
|---|---|---|---|---|---|
| 2011-06-08 | 29.03 | 2011-11-18 | 2.11 | -93% | 2013-02-19 |
| 2013-04-09 | 230.68 | 2013-07-06 | 66.34 | -71% | 2013-11-05 |
| 2013-12-04 | 1,134.93 | 2015-01-14 | 175.64 | -85% | 2017-02-23 |
| 2017-12-16 | 19,640 | 2018-12-15 | 3,185 | -84% | 2020-11-30 |
| 2021-11-08 | 67,542 | 2022-11-09 | 15,758 | -77% | 2024-03-04 |
| **2025-10-06** | **124,824** | 2026-06-30 | 58,525 | -53% | **not yet** (now $83,456, -33%) |

### 4.2 Drawdown and 200-week MA rules (entry at the next close; 0.5% round-trip cost)

| Rule | Entry | Entry $ | Further fall after entry | 1y | 2y | 3y | To old ATH |
|---|---|---|---|---|---|---|---|
| DD ≥ 75% | 2011-08-07 | 8.50 | **-75%** | +28% | +1,036% | +6,759% | +244% in 1.5y |
| DD ≥ 75% | 2015-01-05 | 275 | -36% | +57% | +262% | +6,050% | +330% in 2.1y |
| DD ≥ 75% | 2018-11-20 | 4,318 | -26% | +86% | +330% | +1,277% | +353% in 2.0y |
| DD ≥ 75% | 2022-11-10 | 17,542 | -10% | +112% | +356% | +502% | +286% in 1.3y |
| DD ≥ 80% | 2011-09-10 | 4.74 | -56% | +133% | +2,464% | +9,923% | +517% in 1.4y |
| DD ≥ 80% | 2015-01-14 | 175.64 | 0% | +143% | +365% | +7,650% | +573% in 2.1y |
| DD ≥ 80% | 2018-11-25 | 3,947 | -19% | +80% | +373% | +1,388% | +396% in 2.0y |
| close ≤ 200-week MA | 2015-01-15 | 212 | -6% | +72% | +286% | +6,269% | +457% in 2.1y |
| close ≤ 200-week MA | 2020-03-13 | 5,628 | -11% | +984% | +568% | +327% | +248% in 0.7y |
| close ≤ 200-week MA | 2022-06-15 | 22,521 | **-30%** | +13% | +193% | +366% | +201% in 1.7y |
| close ≤ 200-week MA | **2026-06-06** | **60,772** | -4% | open | | | **+37% so far** |
| close ≤ 1.2× 200-week MA | **2026-02-06** | **70,648** | -17% | open | | | **+18% so far** |

The 200-week MA is approximated by a 1,400-day SMA of daily closes.

### 4.3 Halving-cycle timing

Halvings: 2012-11-28, 2016-07-09, 2020-05-11, 2024-04-20.

| Rule | 2012 cycle | 2016 cycle | 2020 cycle | 2024 cycle | Worst in-trade DD |
|---|---|---|---|---|---|
| Buy -18m / sell +18m | +6,802% | +4,791% | +920% | +478% | -93% (2011) |
| Buy -18m / sell +12m | +11,905% | +753% | +789% | +345% | -93% |
| Buy -12m / sell +12m | +39,343% | +825% | +669% | +200% | -71% |
| Buy -12m / sell +18m | +22,578% | +5,205% | +782% | +290% | -71% |

The "+18 months" sells landed near the cycle tops: May-2014, Jan-2018 (one month after the top), Nov-2021 (the top) and Oct-2025 (two weeks after the $124.8k top). As a strategy from 2011-05 (in BTC during the windows, T-bills otherwise):

| Strategy | CAGR | Max DD |
|---|---|---|
| Buy -12m / sell +18m | 134% | -71% |
| BTC buy-and-hold | 82% | -93% |

**Next halving:** block 1,050,000. The height was 969,048 on 2026-09-28, and blocks have averaged about 144.8 a day since April 2024, which points to about **2028-04-08**. That puts the **"-18 months" buy window at about 2026-10-08** and the -12 months window at about 2027-04-08.

**Caveats (read these before using any BTC rule):**

- There are 3–4 independent cycles.
- Every cycle took place within one secular adoption boom.
- Per-cycle returns fell by roughly 10x from the first to the last cycle, so extrapolating the next one is guesswork.
- 2010–2013 prices come from thin, now-defunct exchanges.
- BTC is the survivor among thousands of coins.
- The halving pattern is widely known and may be front-run. The 2025 top came about 17.5 months after the halving, close to the old pattern, but earlier cycles also peaked 12–18 months after.
- A -75% entry still fell another 75% (2011).

---

## 5. CAPE and forward 10-year real returns (starting months 1881-01 → 2016-09; total return, CPI-deflated)

| CAPE decile | CAPE range | n (months) | Mean | Median | Min | Max | % negative |
|---|---|---|---|---|---|---|---|
| 1 | 4.8–9.1 | 163 | +11.8% | +11.6% | +1.8% | +20.0% | 0% |
| 2 | 9.1–11.1 | 163 | +9.9% | +10.0% | +1.2% | +18.4% | 0% |
| 3 | 11.1–12.6 | 163 | +8.5% | +8.6% | -2.3% | +15.4% | 1% |
| 4 | 12.6–14.6 | 163 | +5.7% | +6.5% | -4.2% | +15.2% | 22% |
| 5 | 14.6–16.1 | 163 | +6.5% | +6.5% | -4.6% | +16.1% | 10% |
| 6 | 16.1–17.5 | 162 | +6.3% | +6.4% | -3.7% | +15.7% | 11% |
| 7 | 17.5–19.1 | 163 | +5.4% | +5.4% | -4.0% | +14.6% | 10% |
| 8 | 19.1–21.3 | 163 | +5.6% | +6.1% | -3.3% | +14.3% | 9% |
| 9 | 21.3–24.9 | 163 | +3.9% | +4.4% | -4.0% | +12.8% | 31% |
| 10 | 25.1–44.0 | 163 | +3.4% | +4.8% | -5.9% | +11.7% | 24% |

| CAPE bucket | n | Mean | Min | Max | % negative | Dates |
|---|---|---|---|---|---|---|
| 30–35 | 22 | +1.3% | -1.8% | +4.5% | 23% | 1929-08 … 2002-03 |
| **≥ 35** | 34 | **-2.6%** | -5.9% | +1.1% | **85%** | 1998-03 … 2001-02 only |

**Today's CAPE:**

- 40.72 on my computation (September-2026 average price, 10-year real earnings through June 2026, carried forward).
- 41.48 per multpl.com (2026-09-25).
- This is the **98.9th percentile of all months since 1881**. Only Dec-1998 to Sep-2000 were higher (peak 44.2).

**Implied next-10-year real return** from regressing forward returns on log(CAPE) (HAC t-stat -4.8):

| Regression sample | Implied real return per year |
|---|---|
| 1881–2016 | +0.3% |
| 1950–2016 | +0.9% |
| 1990–2016 | -1.8% |

**Caveats:**

- The ≥35 bucket is effectively **one episode**.
- Overlapping windows mean the 1,630 months contain only about 14 independent decades.
- The decile boundaries use the full sample (hindsight).
- CAPE has read "expensive" almost continuously since 1990, while returns stayed good. Siegel (2016, *FAJ*) attributes part of this to accounting changes in earnings.
- Asness, Ilmanen & Maloney (2017, "Market Timing: Sin a Little") find that valuation-based timing adds little.
- **Use CAPE to size risk and set leverage caps, not to time entries.**

---

## 6. Other candidate few-trade rules

### 6.1 VIX spike ≥ 45 (first close after at least 60 days below; buy the next close; S&P total return)

| Signal | VIX | DD from ATH | 6m | 1y | 2y | 1y 3x\* |
|---|---|---|---|---|---|---|
| 1987-10-19 | 150 (VXO) | -30% | +10% | +24% | +57% | +37% |
| 1998-09-10 | 45.3 | -15% | +29% | +35% | +51% | +95% |
| 2002-08-05 | 45.1 | -44% | -2% | +14% | +28% | +22% |
| 2008-09-29 | 46.7 | -25% | -32% | **-7%** | +2% | **-55%** |
| 2010-05-20 | 45.8 | -31% | +11% | +23% | +26% | +71% |
| 2011-08-08 | 48.0 | -25% | +17% | +22% | +51% | +56% |
| 2020-03-09 | 54.5 | -15% | +17% | +38% | +52% | +82% |
| 2025-04-04 | 45.3 | -18% | +33% | +32% | (+54%, open) | +91% |

At 1x, 1-year holds won **7 of 8** (median +24%, mean +23%). At 3x the median was +63%, with one -55% loss.

**The pre-1986 proxy tells a different story.** The same trigger on realised volatility + 4 fired 11 times in 1929–1946. It won only **4 of 11** at 1 year (median -9%, worst -59%), and 5 of those 11 lost more than 50% at 3x. The modern record probably reflects the post-1987 "central-bank put" regime, not a law of markets. A VIX ≥ 40 variant (23 signals since 1929) had 65% 1-year wins and a +19% median.

### 6.2 "Buy after three consecutive down calendar years" (hold 1/3/5 years)

| Market | 3rd down year | Next 1y | Next 3y | Next 5y |
|---|---|---|---|---|
| S&P total return | 1931 | -6% | +42% | +179% |
| S&P total return | 1941 | +21% | +83% | +129% |
| S&P total return | 2002 | +29% | +50% | +83% |
| Nikkei | 1964 / 1992 / 1998 / 2002 | +17% / +3% / +37% / +24% | +6% / +17% / **-24%** / +88% | +93% / **-10%** / **-23%** / +78% |
| Nasdaq, FTSE, DAX, CAC, HSI, STI, IBEX, Athens | 2002 | +14% … +50% | +43% … +110% | +64% … +198% |
| Hang Seng | 2022 | -14% | +30% | — |
| STI 1998; IBEX 2012 | | +78% ; +21% | +17% ; +17% | +27% ; +23% |

Across 18 cases, 3-year returns were positive in 17 (median +52%); the one loss was the Nikkei after 1998 (-24%). But **10 of the 18 are the same 2000–02 bear market**, leaving about 7 independent episodes. The rule is rare (the US has fired 3 times in 98 years), and in Japan it gave poor 5-year results. It is best used as an add-on "confirmation" signal, not a standalone rule.

### 6.3 Gold, 10-month SMA (monthly averages, 1972-06 → 2026-09; T-bills when out)

| Period | Timing CAGR | Timing max DD | Buy-and-hold CAGR | Buy-and-hold max DD |
|---|---|---|---|---|
| 1972–2026 | 11.4% | **-24%** | 8.1% | -62% |
| 1980–2000 | +3.6% | | -4.3% | |
| 2000–2026 | 10.0% | | 10.6% | |

The rule makes 0.68 round trips a year and is invested 60% of the time. Its value lies in avoiding the 1980–2000 gold bear market. Using monthly *average* prices smooths the signal slightly, and 1970s gold is a single regime.

**Current: OUT.** Gold is at $4,153, below its 10-month SMA of about $4,511, after peaking near $5,000–5,250 in Feb-2026.

### 6.4 Commodities, 10-month SMA

Setup: S&P GSCI spot index for signals. Returns use spot + T-bills for 1984–2006 (an approximation that ignores roll yield) and the DBC ETF for 2006–2026.

| Period | Timing CAGR | Timing max DD | Buy-and-hold CAGR | Buy-and-hold max DD |
|---|---|---|---|---|
| 1984–2026 | 5.2% | -51% | 5.5% | -75% |
| DBC only, 2006–2026 | 4.1% | | 2.4% | |

The rule makes 1.2 round trips a year. Commodities are low-return; the SMA rule is only a risk reducer. **Current: IN** (GSCI 732 vs SMA 672).

### 6.5 Yield-curve re-steepening as a sell signal

Definition: monthly 10-year Treasury minus 3-month T-bill; the signal is the first month back above 0 after at least 2 months of inversion (1953–2026).

| Re-steepened | Months inverted | S&P next 12m | S&P next 24m | Max DD next 24m | Recession within 24m |
|---|---|---|---|---|---|
| 1967-02 | 5 | +6% | +20% | -9% | no |
| 1969-09 | 2 | -6% | +13% | -28% | yes (4m) |
| 1970-02 | 3 | +12% | +28% | -23% | yes |
| 1974-07 | 13 | +17% | +42% | -24% | yes |
| 1974-10 | 2 | +26% | +51% | -14% | yes |
| 1980-05 | 17 | +25% | +11% | -19% | yes |
| 1981-09 | 10 | +10% | +59% | -16% | yes |
| 2001-01 | 5 | **-16%** | **-35%** | -42% | yes (3m) |
| 2007-05 | 9 | **-7%** | **-37%** | -55% | yes (8m) |
| 2019-10 | 4 | +10% | +57% | -34% | yes (5m) |
| **2024-12** | **25** | **+18%** | (open) | -19% | **not so far** |

A recession followed within 24 months in 9 of 11 cases. But the S&P's 12-month return after the signal averaged **+8.7%**, versus a +12.6% unconditional average. Selling on the signal avoided 2 major bear markets (2001, 2007) and missed large rallies in about 6 of the other 9 cases. **As a trade trigger it is roughly break-even and should not be used to go to cash.** At most, it can justify reducing leverage.

---

## 7. Leaderboard

**Metric.** The ranking uses the **adjusted geometric return per trade**:

`exp(mean ln(1+r) − 1·SE) − 1`

Taking logs makes a -90% trade cost as much as a +900% trade gains, and subtracting one standard error penalises small samples. Annualised figures use the average holding period.

"OOS" rates the out-of-sample evidence: other markets, other periods, or post-publication data.

| Rank | Rule | Trades | Win | Median | Worst | Adj. geo/trade | Years held | Geo p.a. | OOS evidence | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| — | *BTC -75%/-80% DD, hold 3y* | 3–4 | 100% | +3,663% / +7,650% | +502% / +1,388% | +1,245% / +2,579% | 3 | 190–265% | tiny n, decaying | Speculative sleeve only (≤5%) |
| — | *BTC halving -12m/+18m* | 4 | 100% | +2,994% | +290% | +919% | 2.5 | 264% | tiny n, widely known | Speculative sleeve only |
| — | *BTC touch of 200-week MA → old ATH* | 4 | 100% | +224% | +37% (open) | +123% | 1.2 | 146% | tiny n | Speculative sleeve only |
| 1 | S&P -40% → hold to ATH, 1x | 4 | 100% | +107% | +84% | +98% | 10.0 | 10.7% | mixed (Nikkei 33y, Nasdaq 14y) | Core crash rule (deep tranche) |
| 2 | S&P -30% → hold to ATH, 1x | 7 | 100% | +64% | +50% | +64% | 6.4 | 11.0% | mixed | Core crash rule |
| 3 | 3 down years → hold 3y | 18 | 94% | +52% | -24% | +37% | 3 | 13.3% | clustered (about 7 episodes) | Confirmation add-on |
| 4 | S&P -20% → hold to ATH, 1x | 12 | 100% | +35% | +26% | +37% | 4.3 | 10.9% | mixed | Core crash rule (first tranche) |
| 5 | S&P -20% → hold 5y, 1x | 11 | 91% | +54% | -42% | +31% | 5 | 8.5% | international 5y: 70% win | Core crash rule |
| 6 | VIX ≥ 45 → hold 1y, 1x | 8 | 88% | +24% | -7% | +17% | 1 | 21.9% | fails pre-1986 | Small add-on |
| 7 | VIX ≥ 45 → hold 1y, 3x | 8 | 88% | +63% | -55% | +17% | 1 | 38.5% | fails pre-1986 | Only with defined risk (calls) |
| 8 | S&P -20% AND px < 1.3× 10y avg, 3y, 1x | 9 | 89% | +38% | -37% | +15% | 3 | 8.6% | best international filter | Use the filter |
| 9 | S&P -20% → hold 3y, 1x | 12 | 83% | +48% | -58% | +14% | 3 | 8.6% | international: +12% | OK |
| 10 | Any index -20% AND px < 1.3× 10y avg, 3y, 1x (international out-of-sample) | 101 | 70% | +21% | -65% | +13% | 3 | 5.5% | this is the OOS test | Diversified indices only |
| 11 | 20% in 2y ATM calls + 80% T-bills at S&P -20% | 12 | 67% | +33% | -20% | +11% | 2 | 9.9% | model only | Best leveraged implementation |
| 12 | 10-month SMA, per spell, 1x | 73 | 59% | +4% | -20% | +9% | 0.9 | 13.1% | 36/36 markets (drawdown) | Core risk switch |
| 13 | 200-day MA, per spell, 3x | 295 | 41% | -1% | -40% | +4% | 0.2 | 27.5% | lagged post-2016 | Too many trades for this brief |
| 14 | S&P -20% AND VIX ≥ 40, 3y, 1x | 6 | 83% | +31% | -58% | -10% | 3 | 3.2% | weak | Reject as a filter |
| 15 | S&P -20% → 3y, **3x** | 12 | 67% | +74% | -91% | -26% | 3 | 2.2% | international: 43% of trades lost >50% | **Reject** |
| 16 | Any index -20% → 3y, **3x** (international) | 199 | 41% | -36% | -93% | -50% | 3 | -17.8% | this is the OOS test | **Reject** |
| 17 | 2y ATM calls at -20%, 100% of capital | 12 | 67% | +110% | -100% | -98% | 2 | -70% | model only | **Reject at full size** |
| 18 | Yield-curve re-steepening → cash | 11 | — | — | — | worse than B&H | — | — | — | **Reject** |

Full table: `results/leaderboard.csv`.

**Reading the table:**

- **Only Bitcoin produced "1,000%-type" trades.** Every high-conviction equity rule makes roughly **+30% to +110% per trade over 3–10 years (about 9–13% a year)**.
- Getting "1,000%" out of equities requires leverage or options. Leverage has a large probability of ruin in the unfavourable 20–40% of histories, and options have a large probability of total loss of the premium.

---

## 8. What is triggered now (as of the 2026-09-28 close)

| Rule | State | Distance to trigger |
|---|---|---|
| S&P 500 crash-buy (-20/-30/-40/-50%) | **Not triggered.** 7,683.69 vs ATH 7,798.99 (2026-08-13), DD -1.5% | -20% at **6,239**; -30% at 5,459; -40% at 4,679; -50% at 3,899 |
| VIX ≥ 45 | No (VIX 16.07) | would need roughly a 3x jump |
| HY credit / Baa-10y | Very tight: HY OAS 2.93% (2026-09-25); Baa-10y 1.39% | no stress |
| 10-month SMA (S&P) | **Invested.** Price above SMA of about 7,234 (provisional, September not closed) | about -6% |
| 200-day MA (S&P) | **Invested.** 200DMA 7,209; price +6.6% above | -6.2% (-9% for the 3% band exit) |
| CAPE | **40.7–41.5 (99th percentile).** "Expensive" regime | — |
| GEM dual momentum | **Hold ex-US** (VEU 12m +21.5% vs SPY +16.9% vs bills about 3.7%) | re-check at month-end |
| 3 consecutive down years (US) | No (2023–2025 were up years) | — |
| Yield curve | Re-steepened Dec-2024 (10y-3m now +0.93); no recession so far | used only as a leverage brake |
| Gold, 10-month SMA | **OUT** ($4,153 < SMA of about $4,511) | about +9% |
| Commodities, 10-month SMA | **IN** (GSCI 732 > 672) | — |
| BTC -75% / -80% from ATH | No: -33% (ATH $124,824) | -75% ≈ **$31.2k**; -80% ≈ $25.0k |
| BTC ≤ 200-week MA | Touched in June-2026 (entry $60.8k, **+37% open**); now **1.27×** the MA of about $65.8k | -21% to touch again |
| BTC halving window | **Near-triggered:** the "-18 months" buy window opens about **2026-10-08** (next halving about 2028-04-08); "-12 months" about 2027-04-08 | 10 days |
| Crash-buy on other indices | **Triggered in 2026:** KOSPI (-20% on 07-09 at 7,292; -30% on 07-29 at 5,663; now 7,081) but **price is 2.5–2.7× its 10-year average, so the valuation filter says no.** Jakarta (-20/-30/-40% between Mar and Jun 2026; now -32%) at **0.9–1.1×, so the filter passes** (1x, small, single-country risk). Older episodes still below their peaks: Athens (1999), Shanghai (2007), Brazil ETF (2008), Turkey ETF (2013), Hang Seng (2018), FXI (2021) | — |

Two 2026 signals have already played out:

- The Greece ETF -20% signal (2026-03-30) regained its peak by 2026-06-15, a +28% gain.
- The Nikkei's 2026 decline stopped at -15%, short of the -20% trigger.

---

## 9. Implications for the system design

**Architecture: an always-invested core plus rare event overlays.** Waiting in cash for crashes lost 3–6 percentage points a year of compounding versus holding. The engine should assume the user holds a diversified equity core and should email only these rare trades:

- (a) risk switches on the core;
- (b) crash-buy tranches that *add* exposure;
- (c) optional speculative-sleeve trades.

Expected volume is about 0.6–1 core switch a year, one US crash episode every 8 years (about 4 tranches), a few international signals a decade, and about one BTC cycle every 4 years. That means roughly 1–2 emails a year on average.

**Rules and parameters to adopt:**

1. **Core risk switch.**
   - Test the core index's month-end close against its 10-month SMA, or use the daily 200-day SMA with a ±3% band.
   - Execute at the next close.
   - Expect about 0.6–0.75 round trips a year and about 40% of trades to be whipsaws (median loss about -2% to -5%).
   - The purpose is drawdown control (US max DD -48% vs -83%; better in 36/36 international markets), **not** extra return. Expect to lag buy-and-hold in bull decades (post-2007 about -2 pp a year).
2. **Crash-buy overlay (broad indices only).** Use S&P 500 / MSCI World / ACWI, drawdown measured from the ATH on closes.
   - **Tranches:** at -20%, -30%, -40% and -50%, add 10%, 15%, 25% and 50% of core notional. Total exposure is capped at **2.0x**.
   - **Holding:** each tranche until the earlier of a new ATH or 5 years. No stop-loss.
   - **Expected per-tranche outcome at 1x (US history):** median +48–88% over 3–5 years. Worst: -58% at 3 years (1929). International out-of-sample median: +21% at 3 years.
3. **Hard filters (supported out of sample):**
   - If index price > **1.3× its 10-year average price** (or US CAPE > 30), all tranches are **1x only** and the first tranche starts at -30%.
   - Leverage above 1x only after the index **closes above its 200-day SMA** following the trigger.
   - Do **not** use VIX, credit-spread, Fed-easing or stop-loss filters as entry gates. They failed out of sample, or failed on 1929 and Japan. Report them as context only.
4. **Leverage caps.**
   - **Never recommend 3x daily LETFs for multi-year holds.** Out of sample, 52% of such trades lost more than 30%, and every 1929 and 2000 tranche was ruined.
   - 2x ETFs only for -40% and deeper tranches, and only with filters 3a and 3b satisfied.
   - The preferred leveraged implementation is **defined-risk calls**: 1–2-year ATM/ITM index calls with **≤10–20% of capital**. In the backtest the worst 2-year portfolio result was -20%, with a total loss of the premium in 4 of 12 trades.
   - Price every recommended option from live quotes, not from these approximations.
5. **VIX ≥ 45 add-on.** On the first close ≥45 after 60 quiet days, add about 10% of the portfolio (1x, or ≤5% in calls) for 12 months. Warn the user that n = 8 and that the 1929–46 analogue failed.
6. **International signals** (for example KOSPI and Jakarta in 2026) must pass filter 3a and be sized at half the tranche size of broad indices. Single-country tails (Greece, Ireland, Shanghai) are much fatter.
7. **Speculative sleeve (BTC).**
   - **≤5% of net worth.**
   - Entries: -75% from ATH, close at or below 1.0–1.2× the 200-week MA, or the halving "-18/-12 months" window.
   - Exits: halving +12–18 months, or at a pre-set profit multiple.
   - Assume next-cycle returns are **at most ⅓ of the previous cycle**, and show the user the -93% intra-trade drawdown history in every BTC email.
   - *The -18m window opens around 2026-10-08.*
8. **Metrics the engine should optimise and report.**
   - Use the adjusted geometric return per trade (mean log minus 1 SE), the probability of losing more than 50%, and years to recovery. Do not use the mean return or the win rate.
   - The win rate of "hold to ATH" rules is 100% by construction. Always report the holding time; the longest was 25–34 years.
9. **Monthly recalibration and self-improvement.**
   - With about 1 US signal per 8 years, trade outcomes can never re-estimate thresholds; monthly re-fitting would be pure noise-chasing.
   - Recalibrate only *state estimates* (drawdowns, moving averages, CAPE, VIX, BTC 200-week MA, halving date) and live option IVs.
   - Change a *rule parameter* only if the change improves results on the **36+ market panel**, measured by clustering trades by crisis year, and holds in at least two disjoint periods.
   - Log every email with its ex-ante expected return and worst case, and audit calibration yearly.
10. **Standing watch-list for the current regime (2026-09-28):**
    - S&P 500 at 6,239 / 5,459 / 4,679 / 3,899 for the four tranches.
    - Current CAPE of 41, so apply the "expensive" branch: 1x only, first tranche at -30%.
    - Core trend levels: 10-month SMA about 7,234 and 200DMA about 7,209.
    - VIX 45.
    - GEM monthly pick (currently ex-US).
    - BTC halving window (about 2026-10-08), the 200-week MA (about $65.8k) and -75% (about $31.2k).
    - Gold trend (currently out) and commodity trend (currently in).
    - Filtered international triggers: Jakarta passes; KOSPI is blocked.

---

### Files

- Report: `research/06-backtests-few-trade-strategies.md`
- Code: `research/code/06-backtests/`:
  - `data.py` — downloads and cache;
  - `common.py` — leverage model, Black-Scholes, statistics;
  - `crash_buy.py` — S&P crash-buy (Parts 1–2);
  - `intl.py` — 36 other markets and the in-sample / out-of-sample filter test;
  - `trend.py` and `trend_intl.py` — Part 3;
  - `btc.py` — Part 4;
  - `cape.py` — Part 5;
  - `other_rules.py` — Part 6;
  - `leaderboard.py`, `status.py`, `report_tables.py`;
  - `run_all.py` — reproduces everything.
- Results: `research/code/06-backtests/results/*.csv`. Raw data and large intermediates are cached in the session scratchpad (`$BT06_CACHE`).
