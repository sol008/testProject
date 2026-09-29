# 27 — Momentum and relative-strength rotation among ETFs, decided at most once a week

*29 September 2026, data to the 28 September 2026 close (Ken French industries to 31 August 2026). This track answers the owner's new objective of 29 September: beat SPY by a large margin, with at most one recommendation a week. Code and outputs are in `research/code/27-rotation/`; `python3 run_all.py` reproduces every number (15–30 minutes on 4 cores with a warm cache). Nothing here is individualized financial advice.*

---

## TL;DR

1. **Unlevered, crypto-free rotation does not beat SPY.** The rule chosen on 1999–2012 data lost to SPY in 2013–2026 in all seven such universes, by 3.5 to 11.5 points a year. GEM lost 6.5 and accelerating dual momentum 4.0. Only 23 of 2,352 variants cleared +5 (21 of them hold SMH, chosen with hindsight), and the best fails the reality check against +5 (White p 0.47).
2. **Everything that cleared +5 did so through the asset list or leverage, not the rule.** All 672 Bitcoin variants cleared it (median +34; Bitcoin was 86–96% of the return; drawdowns −59% to −88%). 3x leverage turned the design-selected US-index rotation's −3.5 into +8.9, and a 3x QQQ trend switch made +26. Both ride 2013–2026: Bitcoin +89% a year, SPY +15%, T-bills 1.8%.
3. **Leverage flips sign outside that decade.** The 3x QQQ switch lost 9% a year (−90%) in 2000–2012. Replayed at SPY 5–8% and T-bills 4% (CAPE 41.5), every leveraged SPY rule and leveraged rotation lands at −12.7 to +0.2 points against SPY, with −45% to −85% drawdowns.
4. **The shrunk forward edge of the best rules that don't rely on hindsight is about −1 to +1 point a year** (leveraged versions about −3), with equal or deeper drawdowns. Nothing credibly reaches +5.
5. **Recommendation: none beats SPY credibly.** Keep rotation on the never-list, add leveraged rotation, and at most shadow-ledger one rule (§10). Beating SPY by 5+ points needs a levered bet on the next decade's winner, and no rule here picks it in advance.

**Key table.** 2013-01-01 → 2026-09-28, net of costs, trades at the next open. SPY made 15.0% a year (max drawdown −34%).

| Rule (how it was chosen) | CAGR | Excess vs SPY | Max DD | Design period (excess) | Shrunk forward excess |
|---|---|---|---|---|---|
| US indexes, top-1 by 3-month vol-adjusted momentum, SPY-200-day filter, monthly (**design-selected**, 1x) | 11.5% | **−3.5** | −28% | 2000–12: 11.9% vs 1.4% (+10.5) | −1 to 0 |
| Same rule at 3x (simulated UPRO/TQQQ-style funds) | 23.8% | +8.9 | **−67%** | 2000–12: 26.6% (+25) | **−4 to −1** |
| Top-1 of 14 US ETFs **including SMH**, 12-month momentum, no filter, monthly (simple family) | 23.7% | +8.7 | −34% | 2000–12: −0.2% (−1.8), −55% DD | 0 to +2 (the SMH run cannot be assumed) |
| Same with 12-1 momentum, weekly (**best crypto-free variant in the test period, hindsight**) | 30.4% | **+15.5** | −34% | 2000–12: +1.8, −53% DD | 0 to +2; reality-check p 0.47 against +5 |
| Top-1 of the 9 sector SPDRs, 12-month, no filter, monthly / weekly | 14.8% / 20.3% | −0.1 / +5.4 | −31% | −0.9 to +0.9 | 0 to +1.5 |
| GEM (SPY/EFA, 12-month, else IEF), monthly | 8.4% | −6.5 | −34% | 2002–12: +3.1 | −2 to 0 |
| Cross-asset (9 ETFs) **+ Bitcoin** from 2013, design-selected | 37.0% | +22.1 | −60% | (no Bitcoin in design) | unknowable; about −7 if Bitcoin earns an equity-like return |
| 3x QQQ while QQQ is above its 200-day average, weekly | 41.3% | +26.3 | −66% | 2000–12: −9.2% a year, **−90%** | −4 to 0 |

---

## 1. What was tested

**The owner's bar.**
- Beat SPY's total return by at least 5 points a year, as a median over 5–10 years, after costs.
- At most one recommendation a week.

**Universes (ETFs, Yahoo dividend-adjusted, 1993–2026).**

| Name | Members | First design signal |
|---|---|---|
| `sectors9` | the 9 original Select Sector SPDRs (XLB, XLE, XLF, XLI, XLK, XLP, XLU, XLV, XLY) | Dec 1999 |
| `us4` | SPY, QQQ, IWM, MDY | Mar 2000 |
| `us13` | `us4` + 9 sectors | Dec 1999 |
| `us14_smh` | `us13` + SMH (semiconductors; **chosen with hindsight**) | Dec 1999 |
| `global4` | SPY, QQQ, EFA, EEM | Sep 2002 |
| `countries` | SPY, EFA, EEM + 22 iShares country ETFs | Mar 1997 |
| `cross9` | SPY, QQQ, IWM, EFA, EEM, TLT, IEF, GLD, DBC | Jun 2001 |
| `cross9_btc` | `cross9` + Bitcoin, **eligible from 1 Jan 2013 only**, so the design period never saw it | — |
| `kitchen_sink` | everything above except the country ETFs, + Bitcoin from 2013 | Dec 1999 |
| Ken French 10, 12 and 49 value-weighted industries | daily, 1926–2026; benchmark: the CRSP value-weighted market | Jul 1927 |

**Rules: 336 per universe.**
- Rank by trailing return over 1, 3, 6 or 12 months, 12-minus-1 month, a 1-3-6-12 blend, or the "accelerating" 1+3+6 sum.
- Raw or volatility-adjusted (divided by 63-day volatility).
- Hold the top 1, 2 or 3.
- Filter:
  - none;
  - "abs": the pick must beat T-bills over the same window (dual momentum);
  - "sma": the pick must be above its own 200-day average;
  - "mkt": SPY must be above its 200-day average, otherwise everything goes to T-bills.
- Decide weekly (Friday close) or monthly (last close of the month).

**Named rules.**
- GEM: SPY vs EFA on 12 months; otherwise IEF.
- Accelerating dual momentum: SPY vs EFA or SCZ on 1+3+6 months; otherwise TLT.

**Leverage.** 2x and 3x versions of the winners, plus 1986–2026 index histories (§6).

**Totals.** 3,030 ETF variants (including the 6 named-rule runs), 1,008 industry variants, and about 165 leverage and forward-replay runs.

**Mechanics (no look-ahead).**
- Signals use closes up to the decision day; trades execute at the **next session's open**. Spliced Bitcoin and the Ken French industries trade at the next close.
- Positions change by **swapping**: sell what dropped out, buy what came in, leave the rest alone. So a top-1 rule needs at most 2 dollar market orders per email.
- Every position is re-decided at least monthly. That fits decision 5 ("a monthly re-decided trend position may continue").

**Costs.**
- Per side: SPY/QQQ 1 bp; sector, style and bond ETFs 1.5–3 bp; SMH 3; DBC and country ETFs 6; Bitcoin 10.
- ETF fees are inside the adjusted prices. Bitcoin is charged IBIT's 0.25% a year.
- Leveraged funds follow track 04's model: L × index − (L−1) × (T-bill + 0.40%) − 0.95% a year, daily reset.
- T-bills: 3-month bill minus 0.10% a year.

**Periods and selection.**
- **Design** runs to 31 Dec 2012; **test** runs from 1 Jan 2013 to 28 Sep 2026 (13.7 years).
- The pre-registered choice in each universe is the variant with the highest design-period Sharpe ratio. Every variant is reported (`results/etf_grid_registry.csv.gz`, `results/kf_grid_registry.csv`).

**Sanity checks.**
- Holding SPY through the engine reproduces SPY exactly (15.0%).
- GEM reproduces track 06: 8.4% vs 15.0% here; 8.9% vs 15.2% there.

---

## 2. Question 1 — which rotation rules beat SPY by ≥5 points out of sample?

### 2.1 Every universe (`results/universe_summary.csv`)

Test period 2013–2026, excess CAGR over SPY in points a year; industries are measured against the market.

| Universe | Median variant | Share > SPY | Share ≥ +5 | Best variant | Design-selected rule | Its design excess | **Its test excess** | Its test max DD |
|---|---|---|---|---|---|---|---|---|
| `sectors9` | −5.3 | 2% | 0.3% | +5.4 | 12-1m, top 2, mkt filter, monthly | +8.8 | **−7.3** | −25% |
| `us4` | −3.7 | 16% | 0% | +3.9 | 3m vol-adj, top 1, mkt, monthly | +10.5 | **−3.5** | −28% |
| `us13` | −5.1 | 5% | 0.3% | +5.0 | 3m vol-adj, top 2, mkt, monthly | +8.2 | **−7.3** | −22% |
| `us14_smh` | −2.5 | 32% | 6% | +15.5 | 6m, top 3, mkt, monthly | +9.2 | **−3.9** | −25% |
| `global4` | −4.1 | 7% | 0% | +2.0 | 3m vol-adj, top 2, abs, monthly | +8.5 | **−3.5** | −22% |
| `countries` | −8.9 | 0.3% | 0% | +0.5 | 3m vol-adj, top 3, mkt, monthly | +9.3 | **−11.5** | −35% |
| `cross9` | −6.2 | 0% | 0% | −0.1 | 1m vol-adj, top 3, mkt, monthly | +8.1 | **−7.5** | −29% |
| `cross9_btc` | **+34.5** | 100% | **100%** | +78.3 | (same as `cross9`) | +8.1 | **+22.1** | −60% |
| `kitchen_sink` | **+34.4** | 100% | **100%** | +76.1 | 6m, top 3, mkt, monthly | +11.3 | **+23.8** | −71% |
| KF 10 industries | −3.9 | 14% | 0.9% | +5.9 | 1m vol-adj, top 2, sma, weekly | +3.7 | −5.5 | −34% |
| KF 12 industries | −4.1 | 11% | 0.9% | +8.8 | 12m vol-adj, top 3, sma, weekly | +3.8 | −2.0 | −21% |
| KF 49 industries | −2.2 | 35% | 4.5% | +7.9 | 12-1m vol-adj, top 3, sma, monthly | +6.1 | +0.3 | −26% |

**Named rules** (`results/named_rules.csv`):

| Rule | Cadence | Design (2002–12) CAGR vs SPY | Test CAGR | Test excess | Test max DD | Share of 5-year windows beating SPY |
|---|---|---|---|---|---|---|
| GEM (SPY/EFA, 12m, else IEF) | monthly | 10.8% vs 7.7% | 8.4% | −6.5 | −34% | 0% |
| GEM | weekly | 9.4% vs 6.7% | 8.1% | −6.8 | −31% | 0% |
| Accelerating dual momentum (SPY/EFA, else TLT) | monthly | 17.2% vs 7.7% | 11.0% | −4.0 | −36% | 2% |
| Accelerating dual momentum | weekly | 13.0% vs 6.7% | 8.6% | −6.4 | −40% | 0% |
| Accelerating dual momentum (SPY/SCZ, 2008+) | monthly | — | 10.4% | −4.5 | −36% | 2% |

**Reading.**
- The design period (2000–2012) was SPY's lost decade: 1.4–1.6% a year from 2000, 7.7% from late 2002. Almost any rule with a trend filter beat SPY then by 8–11 points, simply by stepping aside in 2000–02 and 2008.
- In 2013–2026, SPY compounded at 15% with short, V-shaped sell-offs. The same filters cost 4–7 points a year.
- **What the design period rewarded (filters) is what the test period punished.** The rank correlation between design and test excess is −0.26 to +0.26 across ETF universes (`is_oos_rank_corr`).

### 2.2 What each rule ingredient did (`results/dimension_effects.csv`; 2,352 crypto-free ETF variants)

Median excess, in points a year:

| Ingredient | Design median | Test median | Test max DD median | Recommendations a year (median) |
|---|---|---|---|---|
| No filter | +1.9 | **−1.9** | −32% | 9.5 |
| Dual-momentum ("abs") filter | +2.6 | −5.0 | −31% | 10.3 |
| Own 200-day filter | +1.5 | −4.7 | −29% | 10.2 |
| SPY-200-day filter | **+4.4** | **−6.2** | −26% | 9.6 |
| 12-month / 12-1 lookback | +2.5 / +3.0 | −4.0 / −3.4 | −30% | 7.4–7.5 |
| 1-month / 3-month lookback | +1.0 / +2.0 | −6.1 / −6.1 | −31% | 10.5–14.5 |
| Weekly vs monthly | +0.9 vs +4.0 | −5.4 vs −4.6 | −30% | 17 vs 7 |
| Volatility-adjusted: yes vs no | +2.4 vs +2.2 | −5.2 vs −4.7 | −30% | 10 |

**Weekly re-decisions do not help.** They double the recommendations and lose 0.8 points more. Short lookbacks (1–3 months) are the worst in both periods, as track 13 found.

### 2.3 The simplest family: hold the single strongest by 12-month return, no filter (`results/family_top1_12m.csv`)

This is the family that looks best in the test period, so it gets its own look.

| Universe | Design excess (12m / 12-1, monthly) | Test excess, monthly | Test excess, weekly | Test max DD |
|---|---|---|---|---|
| 9 sector SPDRs | +0.9 / +0.4 | −0.1 / −2.3 | **+5.4** / +3.3 | −31% |
| 13 US ETFs | −0.8 / 0.0 | −1.0 / −2.4 | +5.0 / +4.2 | −31% |
| 14 US ETFs incl. SMH | −1.8 / −1.6 | +8.7 / +12.7 | +13.6 / **+15.5** | −34% |
| SPY, QQQ, IWM, MDY | +1.7 / +1.6 | +0.7 / +1.8 | +0.8 / −0.5 | −29% to −33% |
| SPY, QQQ, EFA, EEM | +5.7 / +4.7 | +0.5 / +1.5 | +0.1 / +1.5 | −29% |
| 22 countries + SPY, EFA, EEM | +0.2 / +1.3 | −4.7 / −3.6 | −5.1 / −2.6 | −36% to −40% |
| KF 10 industries (design 1927–2012) | +5.0 / +4.4 | +5.9 / +5.0 | +1.0 / +5.6 | −34% to −47% |
| KF 12 industries | +4.3 / +3.8 | **+8.8** / +2.9 | +3.4 / +5.1 | −34% to −46% |
| KF 49 industries | +6.7 / +7.3 | −3.8 / +1.5 | −2.7 / +0.8 | −40% to −61% |

**Why it is not a credible winner.**

- **The result depends on which day you rebalance.** The same idea on the same sector ETFs gives −0.1 (monthly) or +5.4 (weekly), and KF 12 gives +8.8 or +3.4. A real edge should not move 5 points with the calendar.
- **In 2013–2026 it amounts to "hold big tech, then energy in 2022".**
  - In the sector version, XLK supplied 47% of the test-period return and XLE 25%; 2022's +64% (XLE) is a single year doing heavy lifting.
  - In the SMH version, SMH supplied 62–72% (`results/finalists_concentration.csv`).
  - Ken French's "business equipment" industry holds Apple, Microsoft, Nvidia, Alphabet and Meta together, which is why KF 10/12 look better than the investable sector ETFs. The nearest tradable version is the sector SPDRs, and there the monthly rule was flat.
- **The design period says nothing in its favour for ETFs.** The rule matched SPY within ±2 points in 2000–2012, with −53% to −55% drawdowns.
- **The one universe where it shines was built with hindsight.** SMH is on the list because semiconductors won the decade. Remove the three best months and the SMH version's +15.5 falls to +9.3; for the plain sector version, −0.1 falls to −4.7.

---

## 3. Multiple-testing haircut (`results/multiple_testing.csv`)

**Methods.**
- Weekly active returns against SPY, 718 weeks, 2013–2026.
- Deflated Sharpe ratio (Bailey & López de Prado 2014) for the best information ratio among N trials, with the cross-trial variance measured ("empirical") or taken from the null.
- White's (2000) reality check and Hansen's (2005) studentized SPA, with a stationary bootstrap (mean block 8 weeks, 1,000 draws). The null is that no variant beats SPY (hurdle 0), or that no variant beats SPY by 5 points a year (hurdle 5).

| Set of variants | N | Best (test IR, excess) | Deflated Sharpe (empirical / null) | White p, hurdle 0 / 5 | Hansen SPA p, hurdle 0 / 5 |
|---|---|---|---|---|---|
| All ETF variants | 3,030 | Bitcoin cross-asset, 1+3+6m, top 1, weekly (IR 1.02, +78) | 0.00 / 0.61 | **0.010** / **0.016** | 0.047 / 0.055 |
| Crypto-free ETF variants | 2,352 | 14 US ETFs incl. SMH, 12-1m, top 1, weekly (IR 0.79, +15.5) | 0.45 / 0.29 | 0.095 / **0.47** | 0.17 / **0.51** |
| `us14_smh` alone | 336 | same | 0.42 / 0.50 | 0.030 / 0.22 | 0.055 / 0.24 |
| `us13` alone (no SMH) | 336 | 12m, top 1, weekly (IR 0.32, +5.0) | 0.16 / 0.04 | 0.64 / 0.99 | 0.69 / 0.94 |
| `cross9` (no Bitcoin) | 336 | 12-1m, top 1, sma, monthly (≈0) | 0.06 / 0.00 | 0.96 / 1.00 | 0.94 / 1.00 |
| Ken French industries | 1,008 | KF12, 12m, top 1, monthly (IR 0.45, +8.8) | 0.11 / 0.05 | 0.56 / 0.90 | 0.66 / 0.94 |

**Reading.**
- **Only Bitcoin survives the reality check.** Its 2013–2026 excess was real in the sense that it was not luck of the draw: Bitcoin did compound about 90% a year.
- **The test cannot say it will happen again.** That is a question about Bitcoin's next decade (§7), not about rotation.
- **Without crypto, nothing passes.**
  - We can't reject that the best of 2,352 variants beat SPY by luck (p 0.10–0.17).
  - We can't come close to showing it beats SPY by 5 points (p 0.47–0.51).
  - The expected best information ratio from noise alone, among 2,352 trials, is 0.82 a year. The winner's 0.79 is at that level.
- **Without SMH or Bitcoin in the list, the best variant is indistinguishable from noise**: `us13` p 0.64, industries p 0.56.

---

## 4. Question 2 — full statistics of the finalists (`results/finalists_stats.csv`, `finalists_years.csv`, `finalists_concentration.csv`)

Test period 2013–2026. SPY: 15.0% a year, −34% max drawdown, worst full year −18% (2022).

| Rule | CAGR | Excess | Excess without best 3 months | Max DD | Worst year | 5-year windows beating SPY | Recs/yr | Orders/yr | Turnover/yr | Largest source of return |
|---|---|---|---|---|---|---|---|---|---|---|
| Design-selected `us4` (1x) | 11.5% | −3.5 | −6.4 | −28% | −19% (2022) | 29% | 6.0 | 10.3 | 5.2× | QQQ 50% |
| Design-selected `sectors9` | 7.7% | −7.3 | −9.5 | −25% | −9% | 0% | 6.0 | 12.5 | 3.1× | XLK 34% |
| Design-selected `us14_smh` | 11.0% | −3.9 | −6.5 | −25% | −9% | 3% | 8.6 | 23.7 | 3.9× | SMH 53% |
| Design-selected `global4` | 11.5% | −3.5 | −5.4 | −22% | −10% | 14% | 5.8 | 11.8 | 2.9× | EEM/QQQ 28% each |
| Design-selected `countries` | 3.4% | −11.5 | −14.3 | −35% | −19% | 0% | 10.8 | 36.7 | 6.1× | EWT 27% |
| Design-selected `cross9` | 7.4% | −7.5 | −9.2 | −29% | −20% | 0% | 10.6 | 40.6 | 6.7× | QQQ 24% |
| Design-selected `cross9_btc` | 37.0% | +22.1 | +5.2 | −60% | −38% | 95% | 10.6 | 42.1 | 6.9× | **Bitcoin 86%** |
| Design-selected `kitchen_sink` | 38.7% | +23.8 | +6.8 | −71% | −50% | 76% | 8.4 | 23.0 | 3.5× | **Bitcoin 90%** |
| Simple top-1 12m, sector SPDRs, monthly | 14.8% | −0.1 | −4.7 | −31% | −7% | 54% | 3.6 | 7.1 | 3.6× | XLK 47%, XLE 25% |
| Simple top-1 12m, 14 US ETFs incl. SMH, monthly | 23.7% | +8.7 | +2.8 | −34% | −20% | 73% | 3.3 | 6.6 | 3.3× | **SMH 72%** |
| Best crypto-free variant (12-1m, weekly; hindsight) | 30.4% | +15.5 | +9.3 | −34% | −8% | 100% | 7.6 | 15.1 | 7.6× | **SMH 62%** |
| Best variant overall (Bitcoin, 1+3+6m, weekly; hindsight) | 93.2% | +78.3 | +37.8 | −71% | −57% | 98% | 9.6 | 18.5 | 9.2× | **Bitcoin 96%** |
| GEM, monthly | 8.4% | −6.5 | −8.5 | −34% | −17% | 0% | 1.8 | 3.6 | 1.8× | SPY 85% |

**Notes.**
- "Recs/yr" counts emails that contain at least one order; all are well under the 52 limit. Turnover counts one side.
- **Execution at the next close instead of the next open** changes the excess by −2.0 to +0.9 points. **Doubling costs** lowers it by 0–0.6 points (1.4 for the weekly Bitcoin rule). Costs are not what sinks these rules; the market regime is.
- **The Bitcoin rows are not reachable in an IRA before January 2024.** Before spot ETFs, the only US-listed vehicle was GBTC: over-the-counter from 2015, a 2% fee, and premiums and discounts of roughly +100% to −50%. Coinbase is a taxable account.

---

## 5. Why the only "winners" won: the asset list, not the rule

- **SMH.**
  - Semiconductors compounded about 31% a year in 2013–2026 (SMH buy-and-hold: +16.5 points over SPY, −45% drawdown).
  - In 2001–2012 the same ETF lost 3.7% a year, with a −71% drawdown.
  - Any rule that could hold SMH looks brilliant in the test period; the rotation mostly just held it: 62–72% of the return in the top-1 versions.
  - Nobody building a rotation list in 2012 had a reason to add semiconductors and not, say, homebuilders or biotech. That choice is the hindsight.
- **Bitcoin.**
  - From $13.3 on 1 January 2013 to about $84,500 on 27 September 2026: 6,300-fold, or 89% a year.
  - A rotation that could hold it at all beat SPY by 12 to 78 points, whatever the rule. The worst of 672 variants beat SPY by +11.8 points.
- **QQQ.** It beat SPY by 5.3 points a year in 2013–2026 but lagged it by 5.6 points in 2000–2012 (QQQ −3.6% a year vs SPY +2.0%).

**Current holdings (28 Sep 2026 close).** The momentum rules that won in the test period hold, today:
- SMH (every top-1 US rule that includes it);
- XLK (the sector rules);
- SMH + XLK + QQQ (the design-selected `us14_smh` and `kitchen_sink` rules);
- DBC + QQQ + Bitcoin (the Bitcoin cross-asset rule).

Track 08 shows what that means now: semiconductors are +109% over one year and the most crowded trade in the BofA survey (53%), with market breadth at a 23-year low. **Momentum rotation would put the owner's money into the most crowded trade in the market at a CAPE of 41.5.** That can keep working, but it is the opposite of a margin of safety.

---

## 6. Question 3 — leverage (`results/lev_*.csv`)

### 6.1 Does the leveraged-fund model match real funds?

| Fund | Model vs actual CAGR (life of fund) | Daily correlation | Tracking error |
|---|---|---|---|
| QLD (2x QQQ, 2006) | 26.1% vs 25.3% | 0.996 | 3.9% |
| TQQQ (3x QQQ, 2010) | 44.0% vs 42.8% | 0.999 | 2.9% |
| SSO (2x SPY, 2006) | 16.1% vs 15.7% | 0.996 | 3.7% |
| UPRO (3x SPY, 2009) | 33.5% vs 32.7% | 0.998 | 3.0% |
| SOXL (3x SOXX, 2010) | 41.6% vs 39.2% | 0.997 | 7.0% |

The model is **0.4–2.5 points a year too generous**. Every leveraged number below is an upper bound.

### 6.2 Single-asset trend switches (weekly; T-bills when below the 200-day average)

| | Design-period CAGR (max DD) | Test CAGR | Test excess | Test max DD | Test worst year |
|---|---|---|---|---|---|
| SPY 1x, buy and hold | 7.9% (−55%), 1994–2012 | 15.0% | 0 | −34% | −18% |
| SPY 3x, buy and hold | 3.2% (**−98%**) | 32.6% | +17.6 | −76% | −57% |
| SPY 3x, 200-day switch | 8.0% (−76%) | 24.6% | +9.7 | −50% | −40% |
| QQQ 3x, buy and hold | −36.5% a year (**−100%**), 2000–12 | 45.5% | +30.5 | −81% | −79% |
| QQQ 3x, 200-day switch | **−9.2% (−90%)** | 41.3% | +26.3 | −66% | −34% |
| QQQ 2x, 200-day switch | −3.0% (−75%) | 30.1% | +15.1 | −49% | −23% |
| SMH 3x, 200-day switch | −19.8% (−93%), 2001–12 | 59.1% | +44.1 | −77% | −50% |

### 6.3 Leveraged versions of the design-selected rotations

| Rotation | 1x test excess (max DD) | 2x | 3x | 3x design period |
|---|---|---|---|---|
| `us4` (3m, top 1, SPY filter, monthly) | −3.5 (−28%) | +3.4 (−51%) | **+8.9 (−67%)** | 26.6% vs 1.4%, −49% DD |
| `global4` (3m, top 2, abs, monthly) | −3.5 (−22%) | +3.6 (−45%) | +9.0 (−63%) | 39.2% vs 7.7%, −54% DD |
| `us14_smh` (6m, top 3, SPY filter) | −3.9 (−25%) | +2.0 (−46%) | +5.4 (−63%) | 19.9%, −62% DD |
| `us13` / `sectors9` | −7.3 | −4.3 / −4.4 | −2.9 / −3.2 | 18–20%, −54% to −55% DD |

### 6.4 Forty years of index history, and the gaps

Price indexes, no dividends; the same weekly 200-day switch; `results/lev_long_history.csv`.

| | 1986–99 | 2000–12 | 2013–26 | 1986–2026 | Max DD |
|---|---|---|---|---|---|
| Nasdaq-100, 1x | 27.1% | −2.5% | 19.4% | 14.2% | −83% |
| 3x Nasdaq-100, 200-day switch | 38.7% | **−6.5%** | 36.5% | 21.4% | **−89%** |
| S&P 500, 1x | 14.9% | −0.2% | 13.0% | 9.2% | −57% |
| 3x S&P 500, 200-day switch | 21.7% | −7.1% | 21.3% | 11.5% | −78% |

**The gaps a weekly filter cannot dodge** (`results/lev_gap_weeks.csv`):

| 3x Nasdaq-100 switch | Loss |
|---|---|
| Week to 14 Apr 2000 | −61% |
| Week to 28 Feb 2020 | −29% |
| Week to 16 Oct 1987 | −27% |
| Single days (31 Aug 1998, 14 Apr 2000, 12 Mar 2020) | −28% to −30% |

- The 3x S&P switch lost 32% in the week to 28 Feb 2020 and 26% in the week to 16 Oct 1987.
- On Monday 19 Oct 1987 the S&P 500 fell 20.5% (−60% at 3x). The weekly switch escaped only because Friday's close had just crossed below the 200-day average. The simulation exits at Yahoo's 1987 index "open", which is optimistic; the real exit would have been worse.
- 24 Aug 2015 shows another risk. The switch's exit at that Monday's open sold 3x Nasdaq at a −25% gap, while the index closed only −3.8% and ended the week +3.1%. **Market orders at the open are a real risk with leveraged funds.**

**Answer to question 3.**
- Leverage added growth in 2013–2026 only because returns were high and financing was nearly free.
- A daily-reset fund's log growth is about **L × μ − (L−1) × (T-bill + 0.4%) − fee − L²σ²/2**, where μ is the underlying's arithmetic return and σ its volatility.
- 2013–2026: QQQ's μ was 20.5% with σ 20.8%, and T-bills averaged 1.8%. 3x: 61.4 − 4.4 − 0.95 − 19.5 ≈ 37% log growth, about +44% a year (the simulation gives 45.5%).
- At 6% expected for QQQ (μ ≈ 8.3% at σ 22%) and 4% T-bills, the same formula gives 24.9 − 8.8 − 0.95 − 21.8 ≈ **−6.6% a year**.
- The trend filter trims σ exposure but also the time invested. It turned 3x from ruin (−98% to −100%) into survivable-but-crushing (−76% to −93%) in 2000–2012. It never made leverage safe.

---

## 7. Question 4 — the forward view at CAPE 41.5

**Replay** (`results/forward_replay.csv`).
- Every equity ETF's daily log return is cut by the same constant, so that SPY compounds at 5% (or 8%) instead of its realized 15%.
- T-bills and leveraged-fund financing are set to 4.0%; the 13-week bill yielded 4.06% on 28 Sep 2026 (track 08).
- Which ETF led and when is untouched. So the replay keeps the rules' structure but removes the bull market.

| Rule | 2013–26 realized | Forward, SPY 5% | Forward, SPY 8% | Max DD (forward) |
|---|---|---|---|---|
| Design-selected `us4`, 1x / 2x / 3x | −3.5 / +3.4 / +8.9 | 0.0 / −1.6 / −4.4 | −0.4 / +0.2 / −0.6 | −25% / −49% / −67% |
| Design-selected `global4`, 1x / 3x | −3.5 / +9.0 | −2.2 / −10.1 | −2.5 / −5.3 | −20% / −79% |
| Design-selected `us14_smh`, 1x / 3x | −3.9 / +5.4 | −0.7 / −8.0 | −1.6 / −5.9 | −27% / −71% |
| SPY 3x, buy and hold | +17.6 | −8.3 | −2.8 | −85% |
| SPY 3x, 200-day switch | +9.7 | −7.1 | −6.2 | −72% |
| QQQ 3x, 200-day switch | +26.3 | −3.7 | −0.1 | −80% |
| SMH 1x, buy and hold | +16.5 | +15.1 | +15.5 | −49% |

**The SMH row shows how the replay works, not a forecast.** It keeps SMH's 2013–2026 lead over SPY intact, which is exactly the hindsight that cannot be assumed.

**Rolling windows, 1986–2026** (`results/forward_rolling_index_switches.csv`): 10-year windows, monthly starts, excess vs the index.

| | Median 10-year excess (realized) | Windows ≥ +5 (realized) | Median 10-year excess (forward: index at 5%, bills 4%) | Windows ≥ +5 (forward) |
|---|---|---|---|---|
| 3x Nasdaq-100 switch | +8.7 | 68% | **−8.8** | 1% |
| 2x Nasdaq-100 switch | +7.3 | 57% | −4.2 | 19% |
| 3x S&P 500 switch | +1.8 | 26% | −5.7 | 0% |
| 1x S&P 500 switch | −1.5 | 1% | +0.3 | 11% |

**Shrinking the evidence into a forward number.**

| Rule family | Start (2013–26 excess) | Minus selection luck | Minus the hindsight asset | Minus the bull market and cheap financing | **Forward central (range)** |
|---|---|---|---|---|---|
| Unlevered rotation, design-selected | −3.5 to −11.5 | — | — | Trend filters help in a bear decade (+8 to +11 in 2000–12) and hurt in a bull decade | **−1 (−3 to +3)** |
| Top-1 12-month momentum, simple | −0.1 to +8.7 (no SMH: −0.1 to +5.4) | the weekly/monthly spread alone is 5 points | SMH supplied 62–72% | industry momentum faded after 2008 (tracks 13, 24; KF49 −2.2 median) | **+0.5 (−2 to +2)** |
| Leveraged rotation or switch (2–3x) | +3 to +26 | — | QQQ and SMH chosen with hindsight | financing ≈ 9 points a year at 3x, plus volatility drag | **−3 (−9 to +1)**, drawdowns −65% to −90% |
| Bitcoin in the rotation | +12 to +78 | — | Bitcoin supplied 86–96% | market cap about $2 trillion; a repeat of 90% a year is not possible | **not estimable**; −7 if Bitcoin earns equity-like returns |

**The one regime where rotation would beat SPY by a lot:** a repeat of 2000–2012, the decade after the only other CAPE above 40.
- There, the design-selected rules beat SPY by 8–11 points a year, because SPY made 1–2% (7.7% from late 2002).
- That is a bet on a bad decade, not a way to get rich: those rules made 10–16% a year in that decade.
- The 3x versions made 18–39%, but with 49–62% drawdowns. The same leverage gave −3 to +9 points in 2013–2026, and in a flat, rate-heavy decade it loses (the forward replay).

---

## 8. Question 5 — executability and taxes

**Cadence.**
- One weekly email is enough for every rule here.
  - Monthly rules produce 2–12 emails with orders a year (median 7; top-1 finalists 2–6).
  - Weekly rules produce 4–46 (median 18). All are under the limit of 52.
- A top-1 rule needs at most **2 dollar market orders** (sell the old, buy the new): within the 3-order limit.
- Top-2 and top-3 rules need 4–6 orders in 5–66% of their trade emails, so they break the limit.

**IRA.** Switching is tax-free.
- Leveraged ETFs (TQQQ, UPRO, SOXL) are ordinary ETFs, but Robinhood may ask for an in-app leveraged-product acknowledgement. Check in the app; this was not verified.
- **Avoid market orders in the first minutes.** 24 Aug 2015 opened far below fair value in many ETFs. Use a marketable limit order after about 9:45 ET, or trade near the close, which changed results by at most 2 points.

**Taxable account.** Nearly every sale is a short-term gain, taxed at the ordinary rate.

| Rule | Pre-tax CAGR | After tax, 24% / 15% bracket | After tax, 40.8% / 23.8% | SPY held, dividends taxed |
|---|---|---|---|---|
| Design-selected `us4` | 11.5% | 8.9% | 7.1% | 14.7% / 14.5% |
| Top-1 12m sectors, monthly | 14.8% | 12.3% | 10.9% | 14.7% / 14.5% |
| Top-1 12m with SMH, monthly | 23.7% | 20.3% | 18.2% | 14.7% / 14.5% |
| Best crypto-free variant (hindsight) | 30.4% | 25.5% | 22.0% | 14.8% / 14.7% |
| GEM, monthly | 8.4% | 7.1% | 6.3% | 14.7% / 14.5% |

Rotation in a taxable account costs 1.3–4.9 points a year at the 24% bracket, and 2.1–8.4 at the top bracket, against about 0.3 for holding SPY. That is before SPY's deferred gain is taxed on sale. **If anything from this track is ever run, it belongs in the IRA.**

---

## 9. Why the earlier tracks said "never", and whether this track disagrees

It doesn't disagree. The differences are in universe, leverage and benchmark, not in the evidence.

| Earlier result | This track | Reconciliation |
|---|---|---|
| Track 06: GEM 8.9% vs 15.2% (2013–26) | GEM 8.4% vs 15.0% | Same finding; ETF proxies instead of index data |
| Track 13: 1–3-month rotation dead since 2008 (sectors −0.17%/month, countries −0.56%) | 1m/3m lookbacks are the worst in both periods (test median −6.1); countries −8.9 | Same finding. Track 13 measured against the universe's equal weight; this track measures against SPY, which is harder in 2013–26 |
| Track 24: sector momentum with 21–84-day holds, −1.8%/yr vs SPY; KF12 +3.7 (t 1.3) after 2008 | Sector SPDRs median −5.3; KF12 median −4.1; KF12 top-1 12m monthly +8.8 (p 0.56 after 1,008 trials) | Same picture: industry portfolios look better than tradable sector ETFs, and neither survives the multiple-testing haircut |
| Design §5: "sector or country rotation" on the never-list | Confirmed for every unlevered, crypto-free universe | The rules that pass +5 points depend on **universe** (SMH, Bitcoin: hindsight), **leverage** (2013–26 financing near zero) or a **benchmark** that happened to be weak (2000–12). No **cadence** effect: weekly is worse than monthly |

---

## 10. Recommendation

**None beats SPY credibly.** Specifically:

1. **Do not add momentum rotation**, weekly or monthly, on any universe, to the recommendation list. Keep "sector or country rotation" on the never-list, and add **"leveraged rotation or leveraged trend switches (2x/3x ETFs)"**. Forward, they are expected to lag SPY by about 3 points with 65–90% drawdowns.
2. **Do not buy Bitcoin through a rotation rule on the strength of 2013–2026.** Every variant with Bitcoin "won" because Bitcoin went up about 6,300-fold. Bitcoin exposure is a separate decision, already covered by module M3's pre-registered switch at a small size.
3. **What would honestly raise expected return above the current design's ≈5%** is more plain equity exposure held for years (the long-horizon core, `00-SYNTHESIS.md` rev. 2 §10), not rotation.
   - At CAPE 41.5 that core's forward range is about 3–6% (design §6). The system cannot promise to beat SPY by 5 points a year without taking bets that can lose 65–90%.
   - "Make rich quick" and "credible" do not coexist in this evidence.
4. **Optional, zero-risk: a shadow-ledger entry** (no emails), so the question is re-tested live rather than argued. Pre-registered rule: `us4`, 3-month volatility-adjusted top 1, SPY 200-day filter, monthly, scored at 1x and 3x against SPY.
   - Kill it if after 3 years the 3x version trails SPY or has a drawdown worse than −50%.
   - Promote nothing without a fresh design/test split.

---

## 11. Caveats

- **Universe choice is itself a test.** Nine ETF universes and three industry sets were tried; the reality checks cover the rules within them but not how the universes were chosen. That choice favours the SMH and Bitcoin universes further.
- **SMH before December 2011** was the Semiconductor HOLDRS trust, a fixed basket that Yahoo splices into the VanEck ETF's history. Semiconductor results in the design period are approximate.
- **Sector SPDRs** are the 9 originals. XLC (2018) and XLRE (2015) are too short for the design period, and Alphabet and Meta left XLK for XLC in 2018.
- **Bitcoin** combines the Coin Metrics reference rate (00:00 UTC) with Yahoo's BTC-USD and, from its January 2024 launch, IBIT. Before 2024 there was no low-cost IRA vehicle.
- **Leveraged funds are simulated** before their launch and are 0.4–2.5 points a year too generous afterwards. The 1986–2026 index runs exclude dividends: conservative by about 1–2 points unlevered, more levered.
- **The forward replay** cuts every equity ETF's return by the same amount. It cannot show a regime where the winners change, which is the main risk to momentum at a crowded top (Daniel & Moskowitz 2016).
- **Taxes are federal only**, with the brackets shown. The SPY comparison taxes its dividends but not its unrealized gain.
- **2026 is a partial year** (to 28 Sep). Worst-year statistics use full calendar years only.

---

## 12. Sources

- Jegadeesh, N. & Titman, S. (1993). Returns to buying winners and selling losers. *Journal of Finance* 48(1), 65–91.
- Asness, C., Liew, J. & Stevens, R. (1997). Parallels between the cross-sectional predictability of stock and country returns. *Journal of Portfolio Management* 23(3), 79–87.
- Moskowitz, T. & Grinblatt, M. (1999). Do industries explain momentum? *Journal of Finance* 54(4), 1249–1290.
- Faber, M. (2007). A quantitative approach to tactical asset allocation. *Journal of Wealth Management* 9(4), 69–79.
- Antonacci, G. (2012). Risk premia harvesting through dual momentum. SSRN 2042750; *Dual Momentum Investing* (2014).
- Moskowitz, T., Ooi, Y. H. & Pedersen, L. H. (2012). Time series momentum. *Journal of Financial Economics* 104(2), 228–250.
- Daniel, K. & Moskowitz, T. (2016). Momentum crashes. *Journal of Financial Economics* 122(2), 221–247.
- McLean, R. D. & Pontiff, J. (2016). Does academic research destroy stock return predictability? *Journal of Finance* 71(1), 5–32.
- Cheng, M. & Madhavan, A. (2009). The dynamics of leveraged and inverse exchange-traded funds. *Journal of Investment Management* 7(4), 43–62.
- Gayed, M. & Bilello, C. (2016). Leverage for the long run. SSRN 2741701.
- Bailey, D. & López de Prado, M. (2014). The deflated Sharpe ratio. *Journal of Portfolio Management* 40(5), 94–107.
- White, H. (2000). A reality check for data snooping. *Econometrica* 68(5), 1097–1126.
- Hansen, P. R. (2005). A test for superior predictive ability. *Journal of Business & Economic Statistics* 23(4), 365–380.
- Politis, D. & Romano, J. (1994). The stationary bootstrap. *Journal of the American Statistical Association* 89(428), 1303–1313.
- "Accelerating Dual Momentum", EngineeredPortfolio.com (2018): the 1+3+6-month rule, tested here as specified.

**Data.**
- Yahoo Finance via yfinance: ETFs, leveraged ETFs, ^NDX, ^GSPC, BTC-USD, IBIT.
- Coin Metrics community API (BTC PriceUSD).
- FRED DTB3.
- Kenneth French Data Library: 10/12/49 industry portfolios (daily) and F-F factors (daily).
- Track 08 for CAPE (41.5) and T-bills (4.06%).

---

## 13. Files (`research/code/27-rotation/`)

| Script | What it does | Outputs (`results/`) |
|---|---|---|
| `common27.py` | Data, the swap-only engine (next-open execution, costs, optional tax bookkeeping), statistics, deflated Sharpe, White/Hansen reality checks | — |
| `s00_data.py` | Downloads and coverage | `data_coverage.csv` |
| `s01_etf_grid.py` | 3,030 ETF variants, including GEM and accelerating dual momentum | `etf_grid_registry.csv.gz` (full copy and weekly active returns in the scratchpad) |
| `s02_kf_grid.py` | 1,008 Ken French industry variants | `kf_grid_registry.csv` |
| `s03_leverage.py` | Leveraged-fund model check, 1x/2x/3x switches, levered design-selected rotations, 1986–2026 index history, gaps | `lev_*.csv` |
| `s04_select_test.py` | Design selection → test, ingredient effects, simple family, multiple testing, finalists (concentration, years, execution, costs, taxes, current holdings) | `universe_summary.csv`, `dimension_effects.csv`, `family_top1_12m.csv`, `named_rules.csv`, `multiple_testing.csv`, `finalists_*.csv` |
| `s05_forward.py` | Forward replay (SPY 5% / 8%, T-bills 4%) and rolling 5/10-year index-switch windows | `forward_replay.csv`, `forward_rolling_index_switches.csv` |
| `run_all.py` | Runs everything in order | — |
