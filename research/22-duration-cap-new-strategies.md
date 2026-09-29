# 22 — Loosening the holding cap from 60 to 90 or 120 days: which new strategies become worth adding?

*Research task RB. Prepared 29 September 2026 with data through the 28 September 2026 close. All numbers come from our own backtests in `research/code/22-duration-new/`: run `python3 run_all.py`, which takes about 40 seconds once the scratchpad cache is warm. Result tables are in `results/`. Literature citations were checked by DOI in OpenAlex. Nothing here is individualized advice.*

*Baseline: `00-SYSTEM-DESIGN-v3.md` (v3.2), §6. Its central estimates are Lean ≈ T-bills + 0.4 points and Lean + M2 ≈ T-bills + 1.0, which is about 5.2% nominal with T-bills at 4.2%.*

*Companion: `21-duration-cap-existing-modules.md` re-prices the existing modules under the same caps. W10 (the crash-day buy, in shadow today) falls under both tracks. Its value is counted once, in track 21. This track reports it as independent confirmation and adds only what is genuinely new.*

---

## TL;DR

1. **No genuinely new strategy earns a live slot at a 90- or 120-day cap.**
   - The only 3–4-month family that works is **"fear arriving in an uptrend"**. Its core is **W10**: the first S&P 500 close of −3% or worse while the prior close was above the 200-day average, bought in SPY at the next open. W10 is already in the design, in the shadow ledger. **Track 21 re-prices it for the longer caps** (≈ +0.10 points a year at 90 days); **count it once, there.**
   - This track confirms W10 independently, together with track 13's "first VIX ≥ 30 close in an uptrend" (the union is called the *uptrend shock* below). The timing edge over an era-matched random entry roughly **doubles when the hold goes from 42 to 60–63 sessions**:

     | Uptrend shock, sample | 42 sessions | 63 sessions | 84 sessions |
     |---|---|---|---|
     | S&P 1928–2026 | +1.4% | +2.4% | +3.0% |
     | SPY 1993–2026 | +2.0% (t 1.3) | +4.5% (t 3.0, placebo p 0.01) | +5.2% |
     | SPY 2008–26 | +1.2% | +2.6% | +3.7% |

     84 sessions add little beyond 63.
   - At 42 sessions it fails the constitution's 6 bp per-trade hurdle (≈4 bp). At 63–84 sessions it passes (≈8–10 bp). At ≈6% of NAV (2% stress) the family is worth ≈ +0.07 points a year (range −0.01 to +0.18), κ = 0.5. W10 alone is worth ≈ +0.06 (−0.01 to +0.14); track 21's post-1990 estimate is +0.10 (+0.03 to +0.13).
   - **The genuinely new piece is small.** The VIX ≥ 30 leg adds ≈0.05–0.15 signals a year beyond W10, worth ≈ +0.01–0.02 points a year. **Paper.**
2. **The other families, at either cap:**
   - **Unfiltered crash and fear buys stay drift plus noise at 3–4 months.** This covers −10/−15/−20% drawdowns, VIX ≥ 40/45, VIX/VIX3M backwardation and −3%/−4% days without the trend filter. The in-sample winner (VIX ≥ 40, 84 sessions: +9.0% edge before 2008) earned +1.8% after 2008 (p 0.61).
   - **HY credit crises and valuation-filtered international crashes look good after 2008, but rest on too few independent episodes.**
     - HY: 5 episodes; +5.0% edge per trade at 84 sessions in HYG, about 40% of the 12-month edge.
     - International: +8% per trade in USD country ETFs, but only 5 design-period trades and a crisis-clustered t of 1.1.
     - **Paper ledger only.**
   - **The midterm-year Q4 window is the strongest in-sample cell of the study, and does nothing out of sample.** At 84 sessions, 1930–2006: +7.6% edge, t 3.5. 2010–22: +0.5% (n = 4). **Context only.**
   - **No edge at 3–4 months:** Bitcoin crash and 200-week-average buys, Treasuries after yield spikes, gold after drawdowns, Fed-pause, first-cut and curve-re-steepening trades.
   - **Keep the trend book (M2) monthly.** Quarterly re-decision lowers the Sharpe in every universe and period, e.g. ETF8 long-only 0.45 → 0.39 and MICRO8 0.54 → 0.38 after 2008. That is about −0.1 points a year. A 3-month lookback re-decided quarterly is no better (0.43).
3. **Expected change in annual return vs the 60-day baseline** (pre-tax, over T-bills, κ-shrunk, forward-looking drift):
   - **From new strategies: ≈0 at either cap.** Adding the VIX ≥ 30 leg live would give ≈ +0.01–0.02.
   - The paper rules (international, credit) could add ≈ +0.13–0.16 if they are ever promoted, which would take about a decade of new evidence.
   - **Including W10's move to 90 days, counted once:**
     - the uptrend-shock family is worth ≈ +0.07 at 90 days (range −0.01 to +0.18) and ≈ +0.07 at 120 days (−0.01 to +0.20);
     - the extra 30 days add ≈0 at forward drift and ≈ +0.02 at historical drift.
   - **Whole system** (track 21, including M4 at 90 DTE): Lean + M2 goes from ≈5.05% nominal at 60 days to ≈5.23% at 90 and ≈5.20% at 120. This track adds ≈0 to that.
4. **Compared with SPY:**
   - **Historically** SPY returned ≈10% a year: 10.2% over 1928–2026, 10.8% over 1993–2026, 11.3% over 2008–26. The system at ≈5.2% stays ≈5 points behind, and the cap change closes ≈0.2 of that. Even alone at 1× notional, the uptrend-shock rule earned only 6.8% a year over 1993–2026.
   - **Forward-looking** (3–6% a year at CAPE ≈41), the system's ≈5.2% sits inside SPY's range, with ~10–15% planned drawdowns instead of ~50%.
5. **Why so little:**
   - The rules that work fire about 0.5 times a year.
   - The 2% per-trade stress cap limits SPY to ≈6% of NAV.
   - Most of a 3–4-month return is market drift, and at CAPE ≈41 that drift is expected to be near zero over T-bills.
   - **A longer cap buys more beta per trade, not more edge.**
6. **Recommendation: don't loosen the cap globally, and add no new live module.**
   - Make the one change track 21 also recommends: a **module-level 90-day exception for W10** (hold to the last session within 90 calendar days; ≤59 sessions for a fixed count). Paper first, then live as a policy module.
   - Put the VIX ≥ 30 leg, the international crash rule and the credit rule in the paper ledger.
   - A 120-day cap buys nothing extra for this system.
7. **Multiple testing.**
   - We tested **260 variants**. The Bonferroni 5% bar is t ≥ 3.73, and noise alone would produce a best t of ≈2.85. **Nothing clears it.**
   - In every family, the variant selected on design data fails or is inconclusive after 2008: deflated-Sharpe probability ≤ 0.38 at the family's N.
   - The uptrend-shock case rests on three things:
     - the same sign in all three eras;
     - two earlier tracks;
     - a documented mechanism. Liquidity provision pays more after volatility spikes (Nagel 2012), and the variance risk premium predicts returns best at about a quarter (Bollerslev, Tauchen & Zhou 2009).
8. **A calendar trap that also affects today's rules.**
   - A fixed 63-session hold exceeds 90 calendar days 34% of the time (up to 96 days).
   - A fixed 84-session hold exceeds 120 days 39% of the time.
   - Today's 42-session convention already exceeds 60 days 28% of the time.
   - Strict caps mean ≤38, ≤59 or ≤79 sessions, or an exit at the last session within the calendar limit.

---

## 1. Question, data and method

### 1.1 What "90 or 120 days" means in sessions

Entry at the open of session 1 and exit at the close of session H, measured on SPY's calendar 2000–2026 (`results/check_calendar_spans.csv`):

| Sessions held | Median calendar days | Maximum | Share over 60 d | over 90 d | over 120 d |
|---|---|---|---|---|---|
| 42 (today's "60 days") | 60 | 66 | 28% | 0% | 0% |
| 60 | 85 | 91 | 100% | 0.5% | 0% |
| 63 (the brief's "90 days") | 90 | 96 | 100% | 34% | 0% |
| 84 (the brief's "120 days") | 120 | 129 | 100% | 100% | 39% |

The largest fixed hold that always fits is **38 sessions for 60 days, 59 for 90 days and 79 for 120 days**. We report H42, H63 and H84 as the brief asks. H59/H60 and H79 give essentially the same results as H63 and H84 (§2.1: the W10 reconciliation and the standalone table).

### 1.2 Data

All data come from the caches of tracks 06, 13, 15 and 17, plus a few new downloads.

| Series | Source and coverage | Used for |
|---|---|---|
| S&P 500 total return | ^GSPC with Shiller dividends before 1988 and ^SP500TR after; 1928–2026 | (a), (b), (f), (i) |
| VIX | ^VIX 1990–; VXO 1986–89; realised-volatility proxy (RV21 + 4) before 1986 | (a) |
| VIX3M | 2006– | (a) |
| SPY, QQQ, IWM, EFA, EEM, HYG (2007–), JNK, ANGL, IEF, TLT, GLD, IBIT, country ETFs | Yahoo, dividend-adjusted | Executable tests |
| High-yield fund | Vanguard VWEHX, daily NAV 1980– | (b) |
| Credit spread | FRED BAA10Y (daily, 1986–); monthly BAA − GS10 (Shiller GS10 before 1953) back to 1919 | (b) |
| Treasury yields | FRED DGS10 (1962–); DGS30 plus DGS20 to fill 1962–76 and the 2002–06 DGS30 gap. Synthetic par-bond total return, track 15 method | (g), (i) |
| Fed policy rate | FEDFUNDS monthly (1954–82); target DFEDTAR/DFEDTARU daily (1982–) | (i) |
| 10y−3m | GS10 − TB3MS monthly; T10Y3M daily from 1982 | (i) |
| Gold | Monthly averages (datasets/gold-prices) 1968–; COMEX GC=F daily 2000–; GLD. No free daily price exists before 2000 | (h) |
| Bitcoin | Coin Metrics PriceUSD 2010– spliced with BTC-USD | (e) |
| 27 non-US indices | Local currency, price only (track 06/13 caches; Nikkei from FRED 1949–), mapped to 19 iShares USD country ETFs | (d) |
| Trend universes | Track 15's LONG26 (1971–), MICRO8 (1990–) and ETF8 | (c) |

### 1.3 Method

- **Signals and fills.**
  - Signals use the close of day t.
  - ETFs enter at the next open, the executable fill for an evening email. Indices, mutual funds and synthetic series enter at the next close.
  - Yield-based signals are lagged one more session, because FRED publishes day t's yield the next afternoon.
  - Time exit after exactly H sessions. Trades never overlap within a variant.
  - Costs per side: SPY 1 bp; HYG 5 bp; VWEHX 10 bp; country ETFs 6 bp; Bitcoin spot 25 bp. All are doubled when VIX > 30.
- **Timing edge.** Each trade's excess return over T-bills minus the mean excess of *every* entry day within ±3 years of its signal (same period only), at the same hold. This is the track-17 placebo. It removes drift, which grows with the hold and would otherwise flatter 3–4-month holds.
  - A permutation test, drawing one random date per trade 4,000 times, gives the two-sided placebo p.
  - For the international panel, trades are clustered by signal month, because crashes are global.
- **Design and test.**
  - Most families: design before 2008, test 2008–26.
  - VIX/VIX3M: 2006–15 / 2016–26. Bitcoin: before 2016 / 2016–26. Gold: monthly 1971–2007 / GLD 2008–26.
  - Within each family, the variant with the best design placebo z (n ≥ 8, or fewer where the family is small) is carried to the test period (§3).
- **Registry.** Every variant is logged: 260 in 9 families (§3).
- **Sizing (§4).**
  - Per the constitution, stress without a stop is notional × the instrument's worst 10-session loss, capped at 2% of NAV. That gives SPY ≈6.2%, HYG ≈9.9% and EEM ≈5.6%.
  - We also report the stricter horizon-matched stress (worst 63-session loss).
- **Contribution a year** = trades a year × notional × (drift + κ × edge).
  - κ = 0.5 if the number of *independent episodes* is ≥ 20, and 0.25 if it is 10–19. Below 10, the rule is paper only, per track 17 R9.
  - Drift is either the historical era-matched drift, or the forward-looking drift for the asset:
    - SPY: +0.3% a year over T-bills (range −1.2 to +1.8), from SPY at 3–6% a year versus T-bills at 4.2%;
    - international equity: +1.5%;
    - high yield: +1.0%;
    - Treasuries: +1.0%.
  - The range runs from "edge gone and low drift" to "historical drift".

---

## 2. Results by family

### 2.1 (a) Index crash and fear buys

Each cell is **n · timing edge per trade (t)**. Design is the S&P with next-close entries; test is SPY at the next open (`results/registry_a_index_fear.csv`).

| Signal | Filter | Design 1928–2007: H42 | H63 | H84 | Test (SPY, 2008–26): H42 | H63 | H84 |
|---|---|---|---|---|---|---|---|
| DD −10% (first since ATH) | none | 20 · −3.0% (−1.5) | 20 · −1.9% (−0.9) | 20 · −1.8% (−0.8) | 6 · −0.4% | 6 · +0.6% | 6 · −0.6% |
| DD −10% | up200 | 6 · −5.6% (−1.1) | 6 · −4.9% | 6 · −3.1% | 2 · −1.7% | 2 · +2.0% | 2 · +1.8% |
| DD −15% | none | 11 · −1.4% (−0.6) | 11 · +0.5% (+0.2) | 11 · +1.1% (+0.4) | 5 · +5.0% (+1.1) | 5 · +10.1% (+2.6) | 5 · +9.9% (+2.1) |
| DD −20% | none | 9 · +2.4% (+2.4) | 9 · +1.9% (+1.0) | 9 · +0.4% (+0.1) | 3 · +6.9% | 3 · −2.3% | 3 · −5.3% |
| VIX ≥ 30 (first close) | none | 47 · +0.1% (+0.1) | 44 · −0.3% (−0.2) | 43 · +0.3% (+0.2) | 17 · +0.6% (+0.3) | 17 · +2.2% (+1.0) | 17 · +2.7% (+1.1) |
| **VIX ≥ 30** | **up200** | 19 · +1.3% (+0.7) | **19 · +3.6% (+1.4)** | **18 · +3.9% (+1.6)** | 8 · +0.1% (+0.1) | **8 · +2.3% (+1.3)** | **8 · +3.5% (+1.8)** |
| VIX ≥ 40 | none | 21 · +2.5% (+0.7) | 20 · +6.1% (+1.1) | 20 · +9.0% (+1.3) | 8 · +1.1% (+0.2) | 8 · +3.0% (+0.6) | 7 · +1.8% (+0.3) |
| VIX ≥ 45 | none | 21 · +1.0% (+0.3) | 20 · +5.1% (+1.0) | 19 · +5.7% (+0.9) | 5 · −0.4% | 5 · +3.8% | 5 · +3.9% |
| VIX/VIX3M ≥ 1.0 (design 2006–15; test 2016–26) | none | 24 · −0.2% (−0.1) | 18 · +0.0% | 15 · −0.4% | 20 · −0.4% (−0.2) | 17 · −0.7% (−0.5) | 15 · −0.1% |
| VIX/VIX3M ≥ 1.0 | up200 | 19 · +1.6% (+1.4) | 15 · +0.0% | 12 · +0.6% | 18 · −0.3% | 15 · −0.4% | 13 · −0.1% |
| −3% day (first in 20) | none | 75 · −0.1% (−0.1) | 63 · +0.3% (+0.2) | 58 · +1.1% (+0.6) | 19 · −3.2% (−1.3) | 19 · −0.0% | 14 · +0.4% |
| **−3% day = W10** | **up200** | 41 · +0.8% (+0.7) | **37 · +2.0% (+1.0)** | **33 · +2.1% (+0.9)** | 10 · +0.1% | **10 · +2.6% (+0.9)** | **8 · +2.7% (+0.9)** |
| −4% day | none | 45 · −0.1% | 40 · −0.2% | 37 · +4.5% (+1.3) | 10 · −2.2% (−0.6) | 9 · +0.6% | 7 · −0.9% |
| −4% day | up200 | 20 · +2.4% (+1.3) | 20 · +4.2% (+1.3) | 19 · +6.1% (+1.4) | 3 · +0.6% | 3 · +2.7% | 2 · +1.7% |
| **Uptrend shock** (first of VIX ≥ 30 or −3% day; up200) | | 43 · +1.0% (+0.9) | **39 · +2.3% (+1.2)** | **35 · +2.6% (+1.2)** | 14 · +1.2% (+0.6) | **14 · +2.6% (+1.2)** | **12 · +3.7% (+1.6)** |

*"up200" means the prior S&P close was above its 200-day average. DD −15%/−20% with up200 had 0–1 trades per cell. VIX ≥ 40/45 with up200 had 1–5 per cell (edges −1% to +6%). VIX levels before 1986 are a realised-volatility proxy. VIX/VIX3M uses its own split.*

**Reading.**

1. **Without the trend filter, panic triggers held 3–4 months are drift plus noise.** Track 13 found the same at 1–60 sessions. Deep-drawdown and VIX ≥ 40/45 buys look good in one era and not the next. DD −20% has a +2.4% design edge at H42 and turns negative at H63/H84 after 2008. VIX/VIX3M backwardation is ≈0 everywhere.
2. **Only one pattern is consistent: a volatility shock that arrives while the index is still in an uptrend.**
   - For all three shock definitions (VIX ≥ 30, −3% day, −4% day), the edge is positive in all three eras at H63. At H84 it is positive everywhere except one 2-trade cell (the −4% day on the S&P after 2008). For the uptrend-shock union at H63 it is +1.8% (1928–85), +3.7% (1986–2007) and +2.6% (2008–26).
   - The edge rises from H42 to H63. At H42 a large part of the rebound has not yet arrived: Feb 2020 was −13.4% at H42, −8.3% at H63 and −2.7% at H84.
3. **The W10 test reconciles with track 17.** W10 held 60 sessions over 1990–2026 gives edge +4.0% (t 2.3, p 0.035) from the next close, +5.0% (p 0.008) from the crash-day close (track 17: p 0.005), and +5.0% (p 0.009) in SPY at the next open. Over 1928–89 the edge is +1.8–2.3% (p 0.34–0.46; track 17: p 0.28). **The effect is strong since 1990 and weak before**, which is what shrinkage is for.
4. **The design-selected winner fails.** The formal protocol picks VIX ≥ 40, unfiltered, H84: design edge +9.0% (z 2.1). After 2008 it earned +1.8% (p 0.61; deflated Sharpe 0.02). The uptrend-shock cells were *not* the in-sample winners. Their case is consistency, not selection.

**Uptrend-shock rule in full** (`results/registry_a_union.csv`):

| Hold · sample | n | Trades/yr | Mean | Median | Win | Worst trade | Max DD at 1× | Edge | t | Placebo p |
|---|---|---|---|---|---|---|---|---|---|---|
| H42 · S&P 1928–2026 | 57 | 0.58 | +3.2% | +4.4% | 68% | −16.7% | −36% | +1.4% | 1.4 | 0.29 |
| H42 · SPY 1993–2026 | 22 | 0.65 | +3.7% | +6.2% | 73% | −13.4% | −36% | +2.0% | 1.3 | 0.16 |
| H42 · SPY 2008–26 | 14 | 0.75 | +3.0% | +4.8% | 71% | −13.4% | −36% | +1.2% | 0.6 | 0.50 |
| **H63 · S&P 1928–2026** | 51 | 0.52 | +5.2% | +6.7% | 73% | −35.5% (Aug 1929) | −47% | **+2.4%** | 1.6 | 0.14 |
| **H63 · SPY 1993–2026** | 22 | 0.65 | +7.2% | +8.0% | 86% | −8.3% (Feb 2020) | −36% | **+4.5%** | **3.0** | **0.01** |
| **H63 · SPY 2008–26** | 14 | 0.75 | +5.4% | +7.1% | 79% | −8.3% | −36% | **+2.6%** | 1.2 | 0.25 |
| H84 · S&P 1928–2026 | 47 | 0.48 | +6.7% | +7.4% | 77% | −18.7% | −42% | +3.0% | 1.7 | 0.12 |
| H84 · SPY 1993–2026 | 19 | 0.56 | +8.9% | +8.1% | 84% | −2.7% | −31% | +5.2% | 2.9 | 0.01 |
| H84 · SPY 2008–26 | 12 | 0.64 | +7.6% | +7.6% | 75% | −2.7% | −31% | +3.7% | 1.6 | 0.16 |

**Post-2008 trades**, SPY at the next open, net return:

| Signal | H42 | H63 | H84 |
|---|---|---|---|
| 2009-06-22 | +12.8% | +19.5% | +22.6% |
| 2009-10-30 | +7.6% | +6.5% | +8.7% |
| 2010-02-04 | +11.5% | +6.4% | – |
| 2010-05-06 | −5.4% | +0.6% | −1.1% |
| 2011-11-09 | +4.1% | +8.3% | +12.9% |
| 2016-06-24 | +8.0% | +7.7% | +7.1% |
| 2018-02-05 | +0.3% | +3.1% | +7.1% |
| 2018-10-10 | −4.7% | −6.0% | −0.5% |
| 2020-02-24 | −13.4% | −8.3% | −2.7% |
| 2020-06-11 | +8.4% | +8.8% | – |
| 2020-09-03 | −2.6% | – | +8.1% |
| 2020-10-26 | – | +10.6% | – |
| 2021-01-27 | +5.5% | +11.2% | +11.7% |
| 2021-12-01 | +0.8% | −3.0% | +1.1% |
| 2024-08-05 | +9.7% | +10.3% | +16.6% |

*A dash means the signal fell inside the previous trade's window at that hold.*

**Run alone at 1× notional** (100% SPY when on, T-bills otherwise):

| Sample | H42 | H59 (strict 90-day) | H63 | H79 (strict 120-day) | H84 | SPY buy-and-hold |
|---|---|---|---|---|---|---|
| 1993–2026 | 4.6% a year (Sharpe 0.29) | 6.6% | 6.8% (Sharpe 0.49, max DD −36%) | 6.8% | 7.0% | 10.8% (max DD −55%) |
| 2008–26 | 3.4% | 5.0% | 5.2% | 5.1% | 6.0% | 11.3% |

**Verdict (a).** Move W10 to ≤90 days (§7; the same change track 21 recommends, counted once there). Keep the VIX ≥ 30 leg on paper. All other index-fear variants stay on the never-list at 3–4 months.

### 2.2 (b) Credit-crisis buys

- **ABS35.** BAA10Y ≥ 3.5% at a month end. First month-ends:

  | Era | Episodes |
  |---|---|
  | Pre-1950 | 1921, 1931, 1934, 1938 |
  | 1950–2007 | 1982-10, 2002-09 |
  | 2008– | 2008-09, 2016-02, 2020-03 |

- **"every".** Re-buy at each month end while the spread stays ≥ 3.5%. Trades are non-overlapping, so each position is realised at the cap and bought again.

| Variant · instrument · sample | n | Mean | Median | Win | Worst | Max DD at 1× | Edge | p |
|---|---|---|---|---|---|---|---|---|
| ABS35 every · H42 · VWEHX 1980–2026 | 9 | +2.7% | +4.6% | 78% | −20.5% | −22% | +1.9% | 0.19 |
| ABS35 every · H63 · VWEHX 1980–2026 | 7 | +4.0% | +5.2% | 86% | −13.6% | −22% | +2.9% | 0.13 |
| ABS35 every · H84 · VWEHX 1980–2026 | 7 | +7.6% | +9.8% | 86% | −8.6% | −22% | +5.9% (t 1.9) | 0.01 |
| ABS35 every · H63 · HYG 2008–26 | 5 | +3.1% | +5.7% | 60% | −5.9% | −25% | +1.8% | 0.48 |
| ABS35 every · H84 · HYG 2008–26 | 5 | +6.8% | +9.6% | 80% | −6.3% | −25% | +5.0% | 0.14 |
| *Reference: 12-month hold (track 05) · HYG 2008–26* | 3 | +17.7% | +16.0% | 100% | +16.0% | −25% | +12.5% | 0.05 |
| Same signal in the S&P · H84 · 1928–2026 | 17 | +6.8% | +5.4% | 65% | −43.9% | −67% | +4.8% | 0.30 |
| Level-free proxy (spread z ≥ 2, first) · H84 · S&P 1928–2007 | 13 | +6.8% | – | – | – | – | +4.4% (t 1.2) | 0.20 |

**Reading.**
- High yield after a spread blow-out does pay over 3–4 months, but a 3–4-month hold captures only ≈15–40% of the 12-month edge that track 05 measured. The rebound takes 6–12 months.
- The ABS35 threshold was chosen on 1990–2025 data, so the post-2008 "test" is not clean. The HY sample (VWEHX from 1980) holds only **5 independent episodes**, and the pre-2008 design period has 2–3 trades.
- The level-free proxy is ≈0 in HY before 2008.

**Verdict (b): paper ledger.** Under the constitution's rule, n < 10 means paper only. At κ = 0.25 it would add only +0.01–0.03 points a year, because it fires about once every 6–9 years. The honest home for this trade is track 05's 12–24-month hold, which is a long-horizon-core decision outside this system.

### 2.3 (c) Trend with quarterly re-decision vs the monthly R1

This uses track 15's engine and costs. Each re-decision interval is run at every phase offset and averaged; the min–max across offsets is in `results/registry_c_trend.csv`.

| Universe · period | Book | Lookback | Re-decided every 21 sessions (R1/M2) | 42 | 63 | 84 |
|---|---|---|---|---|---|---|
| LONG26 design 1971–2007 | long-only | 12 months | 1.19 | 1.10 | 1.01 | 0.97 |
| LONG26 test 2008–26 | long-only | 12 months | 0.23 | 0.18 | 0.15 | 0.14 |
| MICRO8 design 1990–2007 | long-only | 12 months | 1.23 | 1.19 | 1.14 | 1.12 |
| MICRO8 test 2008–26 | long-only | 12 months | 0.54 | 0.42 | 0.38 | 0.36 |
| MICRO8 test 2008–26 | long/short | 3 months | 0.19 | 0.19 | 0.24 | 0.22 |
| **ETF8 test 2008–26 (M2)** | long-only | 12 months | **0.45** | 0.41 | **0.39** (0.27–0.49) | 0.40 |
| ETF8 test 2008–26 | long-only | **3 months** | 0.47 | 0.45 | **0.43** (0.24–0.59) | 0.41 |
| ETF8 test 2008–26 | long-only | 6 months | 0.47 | 0.47 | 0.45 | 0.41 |

**Reading.**
- Slower re-decision costs Sharpe in every universe and both periods.
- The 3-month-lookback, quarterly book the brief asks about (ETF8 long-only L63 H63) scores 0.43, versus 0.45 for M2. In the futures universes it is clearly worse: LONG26 0.10 and MICRO8 0.32, against 0.23 and 0.54.
- Quarterly re-decision would cut M2's tickets from 12 to 4 a year and its cost from 0.18% to 0.12% a year (unscaled book, ≈11% volatility). But the Sharpe loss of ≈0.06 at M2's ≈5% volatility costs ≈0.3 points a year before shrinkage, **≈0.1–0.15 after**.
- Decision #5 already lets M2 continue positions, so the cap does not bind on M2.

**Verdict (c): no change.** Keep M2 monthly with the 12-month signal.

### 2.4 (d) International post-crash rebounds (track 06's valuation filter)

Setup: 27 local-currency indices. The signal is the first close at −20% or −30% from the market's all-time high; the filter is price < 1.3 × its own 10-year average. The executable version buys the matching iShares USD ETF at the next open.

| Variant · sample | Trades | Crisis-month clusters | Win | Mean | Median | Worst | Edge | t (naive) | t (clustered) |
|---|---|---|---|---|---|---|---|---|---|
| −20%, no filter · H63 · design (before 2008) | 95 | 60 | 67% | +8.7% | +4.5% | −36.8% | +3.6% | 1.1 | 0.8 |
| −20%, no filter · H63 · USD ETFs 2008–26 | 45 | 24 | 76% | +7.1% | +8.6% | −57.2% | +5.0% | 2.2 | −0.1 |
| **−20%, p10 < 1.3 · H63 · design** | **5** | 5 | 80% | +8.7% | +8.4% | −1.0% | +6.8% | 2.1 | 2.1 |
| **−20%, p10 < 1.3 · H63 · USD ETFs 2008–26** | 27 | 17 | 81% | +9.7% | +11.3% | −34.5% | **+8.1%** | 3.3 | **1.1** |
| −20%, p10 < 1.3 · H84 · USD ETFs 2008–26 | 27 | 17 | 78% | +10.2% | +11.6% | −34.8% | +8.0% | 2.9 | 0.9 |
| −20%, p10 < 1.3 · H42 · USD ETFs 2008–26 | 27 | 17 | 78% | +4.5% | +6.3% | −33.9% | +3.4% | 1.7 | 0.7 |
| −30%, no filter · H63 · USD ETFs 2008–26 | 25 | 9 | 44% | −5.7% | −4.7% | −50.2% | −6.8% | −1.3 | −2.0 |

**Reading.**
- Unfiltered, the rebound edge disappears once crashes are clustered: t 0.8 before 2008 and about 0 after. At −30% it turns negative after 2008.
- The valuation filter does all the work. Its design sample is **5 trades in 3 markets**: the 10-year average needs 10 years of history, so most markets qualify only from the 2000s.
- Track 06 chose the filter with post-2008 data in view, so the post-2008 "test" is not clean.
- Deflated Sharpe on clusters is 0.29 at the family's N = 12 and 0.04 at N = 260.

**Verdict (d): paper ledger.** Its expected contribution if promoted is +0.12 points a year at κ = 0.25 (range −0.01 to +0.24). It is equity beta in the same crises as the US modules (§4.3).

### 2.5 (e) Bitcoin after deep drawdowns or 200-week-average touches

Holds of 60, 90 and 120 calendar days (`results/registry_e_btc.csv`; signals in `e_btc_signals.csv`).

| Signal | Episodes | Mean 60 / 90 / 120 d | Edge vs BTC's own drift, 60 / 90 / 120 d |
|---|---|---|---|
| Close ≤ 200-week average (first after 90 days above: 2015 ×2, 2020, 2022, 2026) | 4–5 | +24% / +27% / +40% | +3% / −10% / −22% (p 0.75–0.92) |
| −75% from ATH (2011, 2015, 2018, 2022) | 4 | −16% / −13% / −18% | −60% / −86% / −126% |
| −50% and −65% from ATH | 5–8 | −9% to +39% | all negative |

**Verdict (e): never** (the never-list's "crypto crash-rebound" entry stands). The 200-week touches earn roughly Bitcoin's drift. They are beta, not timing. The drawdown rules lose to random entry because deep drawdowns kept deepening (2011, 2014–15, 2018, 2022). M3 already carries Bitcoin beta.

### 2.6 (f) Seasonal and midterm windows

| Window · hold | Design n · mean · edge (t) | Test (SPY) n · mean · edge |
|---|---|---|
| Midterm year, end-September entry · H42 | 20 · +4.7% · +2.9% (1.7) | 4 · +3.8% · +1.4% |
| Midterm · H63 | 20 · +7.5% · +4.7% (2.6) | 4 · +2.1% · −1.6% |
| **Midterm · H84** | **20 · +11.2% (90% up) · +7.6% (3.5, p 0.006)** | **4 · +5.4% · +0.5%** |
| Midterm and S&P > 5% below its 52-week high · H84 | 13 · +11.6% · +8.5% (2.8) | 2 · +13.4% · +9.0% |
| End-October, every year · H42 / H63 / H84 | 80 · +1.1% / +1.5% / +1.5% (t 1.5–1.7) | 18 · +1.4% / +1.2% / +0.3% |
| End-September, every year (control) · H63 | 80 · +0.9% (0.9) | 18 · +1.6% |

**Reading.**
- The midterm window gets stronger as the hold lengthens to ~120 days, but only in-sample. It is an almanac pattern popularised in the 1970s. The four post-2008 cases add nothing: 2018 was −7% at H84.
- The 2026 window opens at the 30 September close (tomorrow).
- Track 17's conditional version is off in 2026, because the S&P is only 1.5% below its high.

**Verdict (f): context only.** Log it in the shadow ledger; never trade it. Calendar trades stay on the never-list.

### 2.7 (g) Long Treasuries after yield spikes

| Signal → asset · hold | Design 1962–2007 n · edge (t) | Test 2008–26 (TLT/IEF) n · edge (t) |
|---|---|---|
| 10y +50 bp in 21 sessions → long bond · H42 / H63 / H84 | 36–41 · −0.1% / −0.0% / −0.5% (≤ 0.4) | 10–11 · −0.9% / −1.8% / −0.2% |
| 10y +50 bp in 21 → 10-year · H63 | 41 · −0.2% (−0.4) | 11 · −0.2% |
| 10y +75 bp in 21 → long bond · H63 | 19 · +0.7% (+0.4) | 4 · −3.9% |
| 10y +100 bp in 63 → 10-year · H63 / H84 | 14 · +1.0% / +0.5% (≤ 0.6) | 6 · +1.7% / +2.1% (t 1.2 / 2.2) |
| 21-day change ≥ 2 sd → long bond · H63 | 34 · +0.0% | 12 · −1.1% |

**Verdict (g): never.** A yield spike is followed by drift, carry and noise. The 1970s and 2022 kept going; 1980s–2000s spikes reversed. There is no timing edge in either period.

### 2.8 (h) Gold after sharp drawdowns

| Signal · hold | Design: monthly 1971–2007 n · edge (t) | Test: GLD 2008–26 n · edge (t) |
|---|---|---|
| −15% from the 52-week high · 2–3–4 months / H42–63–84 | 12 · +2.9% / +4.2% / +2.7% (≤ 0.9) | 13 · +1.9% / −1.1% / −2.0% |
| −20% · same | 6 · +7.6% / +7.1% / +6.6% | 3–4 · +2.1% / −4.3% / +1.4% |
| −10% · same | 12 · −3.6% / −0.9% / +0.3% | 11 · −0.9% / −1.6% / −2.7% |

**Verdict (h): never.** Gold "dip buys" have weak monthly-data support before 2008, and it fades or reverses at 3–4 months on GLD.

### 2.9 (i) Other 3–4-month families with literature support: the Fed cycle and the yield curve

The signals are real-time proxies:

| Signal | Definition | Dates (last hike not known in real time) |
|---|---|---|
| **Pause** | Exactly 3 months after the last hike of a ≥100 bp cycle, with no cut since | 1955–2007: 15; after: 2017-09, 2019-03, 2023-10 |
| **First cut** | First cut after such a cycle | 11 before 2008; 2019-08, 2024-09 |
| **Re-steepening** | 10y−3m back ≥ 0 after ≥ 2 inverted month-ends | 10 before 2008; 5 after |

| Signal → asset | Design n · edge H42 / H63 / H84 | Test n · edge H42 / H63 / H84 |
|---|---|---|
| Pause → long bond | 12 · −0.9% / −0.4% / −0.1% | 3 · +7.2% / +8.3% / +5.5% |
| Pause → S&P | 15 · +0.1% / +0.5% / +1.7% (t ≤ 0.7) | 3 · +2.8% / +5.2% / +8.9% |
| First cut → 10-year | 9 · −0.1% / −1.5% / −0.2% | 2 · −2.4% / −3.2% / −3.4% |
| First cut → S&P | 11 · −3.1% / −3.5% / −4.0% | 2 · +2.6% / +2.5% / +4.1% |
| Re-steepening → 10-year | 10 · +1.5% / −0.1% / −0.7% | 5 · +0.9% / +2.4% / +3.4% |
| Re-steepening → S&P | 10 · −4.6% / −2.8% / −5.1% | 5 · +6.5% / +4.3% / +6.3% |

**Verdict (i): shadow at most.**
- Design-period edges are ≈0 or negative. The post-2008 cases (n = 2–5, all in 2019–2025) look good because they coincide with the 2019 and 2023–24 bond and equity rallies.
- "Buy bonds at the pause" is folklore that the real-time rule does not support before 2008.

---

## 3. Multiple testing

**Variant counts** (`results/summary_variant_counts.csv`):

| Families | Variants | Bonferroni 5% t | Expected best t from noise |
|---|---|---|---|
| (a) 55 · (b) 16 · (c) 72 · (d) 12 · (e) 15 · (f) 12 · (g) 24 · (h) 27 · (i) 27 | **260** | **3.73** | **2.85** |
| (a) alone | 55 | 3.32 | 2.31 |

**Design-selected variant → test** (`results/summary_selection.csv`):

| Family | Variant selected on design data | Design n · edge (z) | Test n · edge (t) | Deflated Sharpe, test (family N / 260) |
|---|---|---|---|---|
| (a) index fear | VIX ≥ 40, no filter, H84 | 20 · +9.0% (2.1) | 7 · +1.8% (0.3) | 0.02 / 0.01 |
| (b) credit → S&P | ABS35 first, H63 | 5 · +11.7% (1.5) | 3 · +1.5% (0.1) | 0.06 / 0.00 |
| (b) credit → HY | ABS35 every, H42 | 3 · +3.1% (1.4) | 7 · +1.5% (0.3) | 0.10 / 0.01 |
| (c) trend | MICRO8 long-only 12-month, **H21** | Sharpe 1.23 | ETF8 0.45 | – |
| (d) international | −20% & p10 < 1.3, H42 | 5 · +4.2% (2.2) | 27 · +3.4% (clustered t 0.7) | 0.38 / 0.11 |
| (e) Bitcoin | −50% from ATH, 60 d | 4 · −25.9% | 4 · −10.3% | 0.02 / 0.00 |
| (f) seasonal | Midterm, H84 | 20 · +7.6% (3.0) | 4 · +0.5% (0.1) | 0.06 / 0.00 |
| (g) Treasuries | +75 bp/21 d → 10y, H42 | 19 · +0.8% (0.8) | 4 · −0.4% | 0.01 / 0.00 |
| (h) gold | −15% & uptrend, 3 months | 5 · +12.8% (1.8) | Monthly-only filter; the daily analogue (above the 200-day) had 3 · −4.6% on GLD at H63 | – |
| (i) Fed and curve | Re-steepening → 10y, H42 | 10 · +1.5% (1.4) | 5 · +0.9% (1.3) | 0.21 / 0.06 |

**Reading.**
- In no family does the design-selected variant survive to test.
- In the trend family, the design-selected re-decision interval is the monthly one M2 already uses.
- The best single statistics in the study are both below the 260-variant Bonferroni bar (3.73), and both depend on the sample:
  - the uptrend-shock rule on SPY 1993–2026 (t 3.0 at H63; placebo p 0.01);
  - the midterm window before 2007 (t 3.5 at H84).
- The uptrend-shock rule is kept because it is:
  - (i) positive in all three eras for three different shock definitions;
  - (ii) the same effect tracks 13 and 17 found at shorter holds;
  - (iii) economically motivated. Nagel (2012) shows liquidity-provision returns rise with the VIX. Bollerslev, Tauchen & Zhou (2009) show the variance risk premium's forecasting power for stock returns is strongest at about a one-quarter horizon, which is exactly the horizon the longer cap opens. The magnitudes are theirs, not re-estimated here.
- **The multiple-testing risk is real.** Its expected contribution is κ-shrunk, and it starts on paper.

---

## 4. Sizing under the constitution's caps, and contributions

### 4.1 Stress inputs

Worst loss over N sessions in each instrument's history (`results/summary_stress.csv`):

| Instrument | 10 sessions | 42 | 63 | 84 | Notional at 2% stress (10-session) | (63-session) |
|---|---|---|---|---|---|---|
| S&P 500 total return 1928– (for SPY) | −32% | −43% | −48% | −48% | **6.2%** | 4.2% |
| HYG | −20% | −27% | −29% | −30% | 9.9% | 6.8% |
| VWEHX | −17% | −24% | −27% | −26% | 11.9% | 7.4% |
| EFA | −29% | −40% | −44% | −46% | 6.9% | 4.6% |
| EEM | −36% | −52% | −56% | −57% | 5.6% | 3.6% |
| EWZ / EWY | −45% / −43% | −61% / −54% | −63% / −59% | −67% / −63% | 4.5% / 4.6% | 3.2% / 3.4% |
| TLT / IEF | −11% / −5% | −17% / −10% | −21% / −10% | −21% / −11% | 18.8% / 39.1% | 9.6% / 19.3% |
| GLD | −21% | −24% | −25% | −26% | 9.3% | 8.0% |
| Bitcoin | −52% | −69% | −80% | −84% | 3.8% | 2.5% |

The constitution measures stress over 10 sessions. For 60–84-session holds, the horizon-matched worst loss is 1.5× larger for SPY. Sizing on it cuts notional from 6.2% to 4.2%, and every contribution below by a third.

### 4.2 Candidates

Values are % of the portfolio a year, over T-bills (`results/summary_contributions.csv`). "Edge gone" means low forward drift, zero edge and horizon-matched size. "Forward" means drift at +0.3% a year for SPY (+1.5% international, +1.0% high yield) plus κ × edge. "Historical" means the era-matched historical drift plus κ × edge.

| Candidate | Hold | Episodes (κ) | Trades/yr | Edge/trade (full sample) | Test edge (t) | Notional | Δg per trade (forward) | Edge gone | Forward | Historical |
|---|---|---|---|---|---|---|---|---|---|---|
| W10 (−3% day, uptrend) | H42 | 51 (0.5) | 0.52 | +1.0% | +0.1% (0.0) | 6.2% | **3 bp** | −0.00 | +0.02 | +0.06 |
| W10 | H63 | 46 (0.5) | 0.47 | +2.3% | +2.6% (0.9) | 6.2% | 7 bp | −0.01 | +0.04 | +0.10 |
| W10 | H84 | 41 (0.5) | 0.42 | +2.3% | +2.7% (0.9) | 6.2% | 8 bp | −0.01 | +0.03 | +0.11 |
| **Uptrend shock (W10 ∪ VIX ≥ 30)** | H42 | 57 (0.5) | 0.58 | +1.4% | +1.2% (0.6) | 6.2% | **4 bp** | −0.01 | +0.03 | +0.08 |
| **Uptrend shock** | **H63** | 51 (0.5) | 0.52 | +2.4% | +2.6% (1.2) | 6.2% | **8 bp** | −0.01 | **+0.04** | **+0.11** |
| Uptrend shock, SPY 1993–2026 basis | H63 | 22 (0.5) | 0.65 | +4.5% | – | 6.2% | ≈15 bp | −0.01 | **+0.09** | **+0.18** |
| **Uptrend shock** | **H84** | 47 (0.5) | 0.48 | +3.0% | +3.7% (1.6) | 6.2% | **10 bp** | −0.01 | **+0.05** | **+0.13** |
| Uptrend shock, SPY 1993–2026 basis | H84 | 19 (0.5) | 0.56 | +5.2% | – | 6.2% | ≈16 bp | −0.01 | +0.09 | +0.20 |
| HY credit crisis (paper) | H63 / H84 | 5 (0.25; n < 10) | 0.15 | +2.9% / +5.9% | +1.8% / +5.0% | 9.9% | 9 / 17 bp | 0.00 | +0.01 / +0.03 | +0.02 / +0.04 |
| International −20% + valuation (paper) | H63 / H84 | 17 clusters (0.25) | 0.91 | +8.1% / +8.0% | same (clustered t 1.1 / 0.9) | 5.6% | 13 / 14 bp | −0.00 / −0.01 | +0.12 / +0.13 | +0.17 / +0.19 |
| Midterm Q4 (context) | H84 | 24 (0.5) | 0.24 | +6.7% | +0.5% (0.1) | 6.2% | 21 bp | −0.00 | +0.05 | +0.09 |

### 4.3 Cap collisions (`results/check_overlap_st1.csv`)

- **Time in the market.** The uptrend-shock position is open 11% of days at H42, 16% at H63 and 19% at H84 (SPY 1993–2026).
- **It fires with M1 almost every time.** 16–19 of its 19–22 trades overlap an ST-1 (M1) trade for a few sessions. Together that is ≈12% of NAV in SPY and ≈4% stress, which fills the 4% of US-equity room reserved for M1, W10 and M4.
- **Other stress caps are tight.**
  - US-equity cluster: with M2's US legs at ≤3%, the cluster sits at ≈7%.
  - Total open stress: M2 4.5% + M3 ≈1.6% + M1 2% + this module 2% ≈10%, i.e. at the cap.
- **Longer holds bind more often:** the position occupies its slot 1.5–1.7× longer than at H42.
- **The other paper candidates** (international, HY) fire in the same crises and would compete for the same room. International equity has no cluster of its own in §4; it should count as equity.

---

## 5. What each cap buys

| Family | 60-day cap (today) | 90-day cap | 120-day cap |
|---|---|---|---|
| (a) Uptrend shock (W10 ∪ first VIX ≥ 30, prior close > 200-day) | W10 in shadow (fails the 6 bp hurdle at 42 sessions) | **W10 to ≤90 days** (paper → live policy module; = track 21's change); VIX ≥ 30 leg on paper | Same; ≈0 to +0.02 more than at 90 |
| (a) Other crash/fear triggers | Never | Never | Never |
| (b) HY credit crisis | Not in the system (track 05: 12–24 months, outside) | Paper (n_eff 5) | Paper |
| (c) Quarterly / 3-month trend | M2 monthly | Keep monthly | Keep monthly |
| (d) International crash + valuation | – | Paper | Paper |
| (e) Bitcoin crash / 200-week | Never | Never | Never |
| (f) Midterm / seasonal | Context | Context | Context (strongest in-sample at 84; fails out of sample) |
| (g) Treasuries after spikes · (h) gold dips · (i) Fed / curve | – | Never / shadow | Never / shadow |

**Expected change in annual return vs the 60-day baseline** (pre-tax, over T-bills, whole portfolio, points a year; κ-shrunk; central at forward-looking drift):

| Source of change | 90-day cap | 120-day cap |
|---|---|---|
| **New strategies, live** (this track's recommendation) | **0** | **0** |
| New: VIX ≥ 30 leg, if added live to W10 | +0.01 | +0.02 |
| New: paper rules, if promoted after ~10 years of evidence | international +0.12 (−0.01 to +0.24); HY +0.01 | international +0.13; HY +0.03 |
| *Moving M2 to quarterly re-decision (not recommended)* | *≈ −0.1* | *≈ −0.1* |
| **W10 from shadow to live** (existing module; counted in track 21; do not add twice) | This track: +0.06 (−0.01 to +0.14). Track 21: +0.10 (+0.03 to +0.13) | This track: +0.05. Track 21: +0.10 |
| Whole system, per track 21 (W10 + M4 at 90/120 DTE) | Lean + M2 ≈5.05% → **≈5.23%** nominal | **≈5.20%** |

- Central values average the full-sample (1928–2026) and post-1993 bases. The range runs from "edge gone" to "historical drift".
- Track 21's W10 figure is higher because it uses the post-1990 sample alone.
- W10 alone is slightly worse at 120 days than at 90: the edge per trade is the same, but fewer trades fit.
- Relative to v3.2's §6 (Lean + M2 ≈5.2%), track 21 first cuts M4's 60-day expectation to ≈0 after the next-day O2 re-run, then adds W10 and 90-day M4 back.
- **The other existing modules barely change:**
  - M1 holds ~3 sessions.
  - M3's forced 60-day round trips would fall from ≈3 to ≈1.5–2 a year, which is worth < 0.01 points in IBIT.
  - M4's 60-day option expiries could be extended, but track 14 would have to re-test that. After an S&P fall of −15% with VIX ≥ 30, the underlying's 63–84-session edge is not significant before 2008: DD −15% edge +0.5% / +1.1%.

**Compared with SPY:**

| | Annual return | Worst drawdown |
|---|---|---|
| SPY, historical | 10.2% (1928–2026) · 10.8% (1993–2026) · 11.3% (2008–26) | −55% (since 1993), −84% (1929–32) |
| SPY, forward at CAPE ≈41 | ≈3–6% | – |
| System, 60-day cap (v3.2 central; track 21 re-estimate) | ≈5.2%; ≈5.05% | ~10–15% planned |
| System, 90/120-day cap (track 21 + this track) | **≈5.2%** (5.23% / 5.20%) | ~10–15% planned |
| Uptrend-shock rule alone at 1× (1993–2026, H63) | 6.8% | −36% |

The longer cap closes ≈0.2 of a ≈5-point gap to SPY's history, and this track's new families contribute none of that. Against SPY's forward range, the system is already competitive on return and far safer. Neither cap changes the "1000%" arithmetic in v3.2 §0.

---

## 6. Limitations

- **Tiny samples.**
  - The uptrend-shock rule has 51 trades since 1928, 22 since 1993 and 14 since 2008.
  - Credit has 5 episodes. The international panel's 27 trades are 17 crisis months.
  - Bitcoin, the Fed cycle and the curve have 2–18 events each.
- **Era dependence.** W10's edge is strong after 1990 and weak before (p 0.34–0.46 for 1928–89). The post-1993 figures probably benefit from the "central-bank put" era that track 06 flagged for VIX ≥ 45 buys. The central estimate averages the two bases, and the low end assumes the edge is gone.
- **Post-hoc composite.** The union of W10 and VIX ≥ 30 was formed after seeing both cells, although each was pre-specified by an earlier track. §7 therefore promotes W10 alone and keeps the VIX leg on paper.
- **Proxies.**
  - VIX before 1986 is realised-volatility based.
  - Gold before 2000 uses monthly averages.
  - Local-currency index signals are traded through USD ETFs.
  - Synthetic bonds ignore bid-ask spreads.
  - Cost doubling at VIX > 30 may still understate crisis spreads for HY and country ETFs.
- **Stress convention.** The constitution's 10-session stress understates a 60–84-session hold's worst path. Horizon-matched sizing cuts every contribution by ≈1/3.
- **Tax.** All figures are pre-tax. The modules run in the IRA, where holding period does not change the tax. In a taxable account, 90–120-day gains are still short-term.
- **Data after my training cutoff.** 2025–26 prices come from live feeds (as in tracks 06/13/17) and could not be independently verified.

---

## 7. Implications for the system design (concrete, testable)

1. **Do not change the global cap, and add no new live module.** A system-wide 90- or 120-day cap mainly admits drift-harvesting trades: more beta per trade and no more edge, at a forward equity premium of ≈0. Keep the 60-day rule (DECISIONS #1, #5). **Grant module-level exceptions only where track 21 finds them worth it: W10 (below) and M4 at 90 DTE.**
2. **W10 at ≤90 days (paper → policy module), replacing its shadow status.** This is the same change as track 21 §1; implement it once. This track's independent evidence is in §2.1.
   - **Signal**, after the close on two-source data:
     - the first S&P 500 close ≤ −3% in 20 sessions;
     - the prior close above its 200-day average.
   - **Entry.** SPY dollar market order at the next open, in the Robinhood IRA (order kind (a)).
   - **Exit.** Market order at the open of the last session ≤ 90 calendar days after entry (session 60–63, depending on holidays), queued the evening before. **No stop, no bracket.** Track 21 found this calendar-exact exit equal to the session count. It found W10's all-time-high exit neutral (drop it) and the "void if VIX > 45" clause never triggered (the highest VIX at an uptrend crash was 40.8).
   - **Size.** 6% of NAV × G(D) (stress 2% at the S&P's −32.5% worst 10-session loss). Record the horizon-matched stress (−48%, i.e. 2.9% of NAV) in the ledger. It shares the 4% reserved US-equity room with M1 and M4, and M1 still has priority.
   - **Admission.** With forward drift, Δg ≈ 7–8 bp per trade clears the 6 bp hurdle, so W10 could enter as an ordinary module. Treat it as a policy module like M1 anyway, because the pre-1990 evidence is weak.
   - **Expected.**
     - ≈0.5 trades a year (0–3; none in calm years).
     - ≈75–85% winners; mean ≈ +5–7% per trade.
     - Worst trade since 1993: −8.3% (Feb 2020); since 1928: −35.5% (1929).
     - **+0.04 to +0.08 points a year** at forward drift (central ≈ +0.06; track 21: +0.10, range +0.03 to +0.13).
   - **Kill switch.** Track 17's: demote after 5 consecutive losers, or if the post-1990 placebo p rises above 0.10 with new data.
   - **Today (28 Sep close): armed, not firing.** The S&P is +6.6% above its 200-day average (7,209). A −3% close (≈7,453 from 7,683.69) would trigger it. The last −3% day was 2025-04-10.
3. **Add to the shadow/paper ledger** (automatic, no email). Each has a pre-registered promotion test:
   - **W10-V:** the first VIX ≥ 30 close with the prior S&P close above its 200-day average, same trade and exit. It adds only ≈0.05–0.15 signals a year that W10 misses, so evidence cannot settle it in any useful time. Adding it to W10 is an owner decision at an annual review, informed by the paper ledger.
   - **INTL-VAL:** the first close at −20% from the all-time high in a non-US index priced below 1.3× its 10-year average, traded in the matching iShares USD ETF (or EFA/EEM), exit at ≤90 days, size 4–5.5% of NAV. It counts in an equity cluster with the US modules. Promote only after ≥10 new crisis clusters (≈10 years at the historical rate) with a mean edge ≥ +3% and clustered t ≥ 1.5. Country ETFs must first pass `check_venues.py`; none is on the §3a whitelist today.
   - **HY-CRISIS:** BAA10Y ≥ 3.5% at a month end → HYG, re-decided each month end while the spread stays above 3.5%, exit ≤90 days. At about one episode every 6–9 years it cannot be promoted on this system's evidence rules. Its real use is as a trigger for track 05's long-horizon credit buy, outside this system. HYG must pass `check_venues.py`.
   - **MIDTERM-Q4:** log only. The 2026 window opens at the 30 September close.
4. **Keep on the never-list at 3–4-month holds.**
   - Unfiltered drawdown, VIX-level and VIX/VIX3M buys.
   - Bitcoin crash and 200-week rebound buys.
   - Treasuries after yield spikes; gold after drawdowns.
   - Fed-pause, first-cut and curve-re-steepening trades.
   - Trend lookbacks under 6 months, including 3-month TSMOM re-decided quarterly.
5. **Keep M2 monthly.** Quarterly re-decision would save 8 tickets a year but cost ≈0.1 points a year.
6. **Fix the day-count convention everywhere.** "60 calendar days ≈ 42 sessions" is wrong 28% of the time (up to 66 days).
   - State every time stop as **"the last session ≤ N calendar days after entry"** (≤38 sessions for 60 days).
   - This affects W10 at 42 sessions, M3's 60-day re-entry and M4's expiry choice.
7. **Revise §6 of the system design from track 21's table** (W10 and M4 at 90 days). This track adds nothing live to it; list the three paper rules in the shadow-ledger section. Years to 11× barely move (≈47–49 for Lean + M2, per track 21).

**Decision needed from the owner:** approve the 90-day exceptions for W10 (and M4, per track 21), or a global 90- or 120-day cap. The global cap is not recommended. No new family earns a live slot under it, a 120-day cap adds ≈0 over 90 days, and a global cap invites beta trades.

---

### Files

All paths are under `research/code/22-duration-new/`:

| File | Purpose |
|---|---|
| `common22.py` | Loaders (re-uses track 13's `common13`), era-matched placebo, `evaluate()`, registry, synthetic bonds, VIX splice, sizing and contribution helpers |
| `fa_index_fear.py` | (a) drawdown, VIX, VIX/VIX3M and −3%/−4% signals, with and without the 200-day filter |
| `fb_credit.py` | (b) BAA10Y and z-score credit triggers; VWEHX, HYG, JNK, ANGL, S&P, SPY |
| `fc_trend.py` | (c) TSMOM with 21/42/63/84-session re-decision on LONG26, MICRO8 and ETF8 (track 15 engine), phase-averaged |
| `fd_intl.py` | (d) 27-market crash-rebound panel, valuation filter, USD-ETF execution, clustered t |
| `fe_btc.py` | (e) Bitcoin drawdown and 200-week-average rules |
| `ff_seasonal.py` | (f) midterm and seasonal windows |
| `fg_bonds.py` | (g) Treasuries after yield spikes |
| `fh_gold.py` | (h) gold after drawdowns (monthly design, daily test) |
| `fi_macro.py` | (i) Fed pause, first cut, curve re-steepening |
| `summary.py` | Variant counts, design → test selection, deflated Sharpe, stress table, W10 reconciliation, uptrend-shock union, contributions |
| `checks.py` | Calendar spans, overlap with M1, clustered deflated Sharpe for (d) |
| `report_tables.py` | Markdown tables for this report |
| `run_all.py` | Runs everything (~40 s with a warm cache) |
| `results/` | `registry_*.csv` (every variant), `trades_*.csv[.gz]`, `pooled_d_intl.csv`, `summary_*.csv`, `check_*.csv` |

**References** (checked by DOI in OpenAlex):
- Bollerslev, Tauchen & Zhou (2009), *RFS*, 10.1093/rfs/hhp008.
- Nagel (2012), *RFS*, 10.1093/rfs/hhs066.
- Moskowitz, Ooi & Pedersen (2012), *JFE*, 10.1016/j.jfineco.2011.11.003.
- Hurst, Ooi & Pedersen (2017), *JPM*, 10.3905/jpm.2017.44.1.015.
- Bailey & López de Prado (2014), *JPM*, 10.3905/jpm.2014.40.5.094.
- Harvey, Liu & Zhu (2016), *RFS*, 10.1093/rfs/hhv059.
- McLean & Pontiff (2016), *JF*, 10.1111/jofi.12365.
- Bekaert & Hoerova (2014), *J. Econometrics*, 10.1016/j.jeconom.2014.05.008.
