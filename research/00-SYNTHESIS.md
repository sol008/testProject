# 00 — Synthesis: strategy constitution v0 and system blueprint

*Research phase completed 28 September 2026 (revision 2, after the red-team review in `12-red-team-review.md`). It draws on ten research tracks (`01`–`10`), the email specification (`11`) and the red-team critique (`12`). The tool has **not** been built yet; §10 lists the decisions needed before building starts.*

This document turns the evidence into the rules the tool will enforce. Every number names the track or script that produced it. Items marked **[verify]** rest on secondary sources, and the tool must re-check them before quoting them in an email.

---

## 0. The short version

1. **"Fewest trades, maximum % return" cannot be optimized literally.**
   - Taken literally, it means betting everything on long shots, which ruins almost everyone who tries. In a coin-flip game that pays +50% or −40% (+5% expected per round), 86.5% of players who bet everything each round are poorer after 100 rounds (track 03).
   - The system therefore maximizes **long-run compounded growth**, under hard no-ruin limits and a small trade budget.
   - It reports "1000%" as **a probability by a date**, never as a promise.
2. **The single biggest lever is how much market exposure you hold and whether you can keep holding it.** Clever trades are not the lever.
   - On 1928–2026 US data, the choice of preset moved long-run returns by up to about 3 points a year (9.0% to 11.7%, §10).
   - Crash-buying tranches added 0 to +0.1 points a year, and each other trade sleeve plausibly adds only a few tenths (track 12).
   - The system's job is therefore:
     - keep you at the right exposure;
     - stop the errors that destroy retail returns;
     - deploy dry powder by rule in crises;
     - take the rare structural opportunity;
     - be honest about the odds.
3. **What +1000% (11×) takes.**
   - Required annual return: 61.5% for 5 years, 27.1% for 10, 12.7% for 20. The S&P 500 did 10.3% a year nominal from 1928.
   - A 100% US index reached 11× in **0%** of 10-year windows and **28%** of 20-year windows historically. It falls to **about 2.5%** in a "muted" scenario with 3.3 points a year less equity return, which is closer to today's forecasts (`code/00-synthesis/preset_backtest.py`).
   - The best-evidenced preset, a 1.3× trend-switched core, reached 11× in 39% of 20-year windows historically but **0.3%** in the muted case.
   - At today's valuations, expect roughly **3–6% a year nominal** from a sensible default over the next decade. Wishing won't change that.
4. **History's biggest few-decision winners had their downside capped by structure:** a small option premium, a peg band, or an unlevered index bought after a crash.
   - Almost all 35 famous blowups had an **uncapped** loss (track 01).
   - Headline multiples are not portfolio returns: Ackman's famous 96× hedge added about 40% to his fund.
5. **The evidence is sobering.**
   - The equity risk premium is the only large, robust, cheap source of return. Published anomalies lose about half their return after publication and net close to zero for a retail trader (track 02).
   - The VIX exceeded subsequent realized volatility on 86% of days, so option buyers usually overpay (track 04).
   - Models that predict 10-baggers pick lottery tickets whose average return trails the index (track 07).
   - The most active 20% of retail households trailed the market by about 6.5 points a year (track 02).
6. **The AI's real edges are discipline, coverage, bookkeeping and honesty about uncertainty.** It holds pre-committed rules through panics, watches about 30 gauges and thousands of filings daily, and keeps an honest ledger. It has no secret alpha: its forecasting skill is unproven, and in year 1 "self-improvement" means **measuring, fixing and recalibrating, not making bigger bets** (tracks 10, 12).
7. **Expected cadence: about 1–6 trade emails a year**, plus a monthly review that also confirms the data feeds are alive. Months without a trade are normal.
8. **Today (28 Sep 2026) no setup clears the bar.**
   - The regime is late-cycle, with an oil shock from the US/Israel–Iran war and Brent at about $106 **[verify details]**. The Fed has hiked to 3.75–4.00%, the 10-year Treasury yields 5.24%, and the S&P 500 is 1.5% below its high at a CAPE of about 41.
   - The nearest trigger is **Bitcoin: about 5% away** from the entry level (≤1.2× its 200-week average, about $79k). That is an opt-in speculative sleeve of ≤3% (§3.2).
9. **Build plan** (track 09). Python on GitHub Actions; the Claude API for judgment and plain-English writing, with every number coming from the data layer; Resend email. About $5–35 a month. It waits on your decisions in §10, and on fixing Claude's GitHub access to `sol008/testProject`: pushes are currently refused.

---

## 1. The objective, stated precisely

### 1.1 Why not "maximize % return per trade"

Expected (arithmetic) return is dominated by rare lucky paths; the typical investor experiences the compounded (geometric) return.

- In track 01's simulation of a good bet (35% chance of 4×), risking 25% per bet reached 10× on 22% of paths. But the **median** path lost money, and 12% of paths lost 90% or more.
- Overconfidence makes this worse:
  - if the true hit rate is 25% but the system believes 35%, full-Kelly sizing ends at a median of 0.39× (track 01);
  - overstating a win probability by 5 points turns even half-Kelly option betting negative (track 03).

### 1.2 What the tool optimizes

- **Objective.** Maximize expected log growth of **total** wealth per year, net of costs and estimated taxes (track 03 §6A).
- **Sizing.** Fractional Kelly with **k = 0.25** at launch, applied to shrunk probabilities.
  - Rule-based archetypes shrink toward their historical base rate.
  - LLM-subjective judgments shrink toward the market price or break-even.
- **"Fewest trades"** is enforced as **a budget plus a hurdle, never as bigger bets:**
  - at most 24 new trades a year (target ≤12, expected 1–6);
  - each discretionary trade must add at least **0.2% a year** to expected log growth.
- **Δg definition** (corrected per track 12 M1):
  - Δg_yr = (E ln W_T with the trade − E ln W_T without it) ÷ T;
  - computed on the **whole portfolio**, including the core and open positions, with idle cash earning T-bills;
  - the reference code in `code/03-math/sizing_rule.py` uses a per-trade, cash-at-0% version and must be fixed at build time.
- **Exempt from the Δg test:** pre-committed policy rules evaluated at the portfolio level (the crash tranches in S2 and the credit-crisis module), and cash-substitute modules, which have their own rules.
- **Minimum edge** (reconciling track 02). A discretionary trade must also clear ≥2× its round-trip costs.
- **Tax.** Prefer holding periods over one year and tax-advantaged accounts. At 15% a year for 20 years, long-term rates plus deferral turn 5.5× (taxed yearly at short-term rates) into 12.7×; deferral alone is worth about +46% (track 03).

### 1.3 How "1000%" is reported

Every monthly review states:

- **P(portfolio ≥ 11× by your target date)**, with a range, and labelled "US history, likely optimistic";
- the median and 5th-percentile outcome;
- P(a 40%+ drawdown);
- the theoretical ceiling at the system's measured Sharpe ratio. No strategy can beat Φ(Φ⁻¹(e^{rT}/11) + θ√T), and the strategy that achieves it ends near zero otherwise (Browne 1999; track 03 §3f).

Portfolio Sharpe needed for a 50% chance of 11× at half Kelly (track 03):

| Horizon | Required Sharpe | US market long-run Sharpe |
|---|---|---|
| 5 years | 1.09 | 0.44 |
| 10 years | 0.74 | 0.44 |
| 20 years | 0.48 | 0.44 |

---

## 2. Ten laws the evidence agrees on

1. **Cap the downside with structure, then size by maximum loss.** Winners went big only where the structure bounded the loss (track 01 §6).
2. **Survive the path.**
   - Leverage and negative carry ruin correct theses.
   - 3× leveraged ETFs held for years lost 99.9% in 1929–32. On 36 non-US indices, the median 3× crash-buy lost 36% (tracks 04, 06).
3. **The equity premium is the engine.** It is the only large premium that survives out of sample. Momentum fell from 7.4% a year to 2.2% after 2000, and value returned −0.6% a year over 2010–26 (track 02).
4. **Crash-buying pays per trade, but only as an add-on, and it adds little overall.**
   - Waiting in cash for crashes earned 3–8% a year vs 10.2% for staying invested (track 06).
   - Shallow triggers (−20/−30%) show little edge over buying at an ordinary time. The −40% trigger does: 1.64× real over 5 years vs 1.42×, n = 5 (track 01).
   - As a rule on top of a reserve, tranches added 0 to +0.1 points a year (§10).
5. **Buy time, not strikes, and never buy insurance to make money.** Long-dated index calls made money only through equity drift; hedged of their market exposure, they lost 12–27% of premium. Every tested put rule lost money (track 04).
6. **Predicting a 10-bagger is not the same as profiting from one.** The top-decile picks had a median outcome of 0.45×, and 37% of them lost 80% or more (track 07).
7. **Great setups are rare.** US drawdowns of 40% or more come about 0.4 times per decade, and the VIX closed at 50 or above 4 times since 1990. Expect 0–2 top-tier setups a year (track 01).
8. **Overconfidence is the silent killer.** Shrink every probability and use quarter-Kelly until calibration is proven (tracks 01, 03, 10).
9. **With few trades, P&L cannot teach.** At 12 trades a year, confirming a per-trade Sharpe of 0.3 takes about 6 years; an annual Sharpe of 0.5 takes about 25 (tracks 03, 10).
10. **Costs and taxes reward few, long-held trades** (track 03).

---

## 3. Strategy constitution v0 (the rules the tool enforces)

### 3.1 Invariants — only you can change these

- **The objective** in §1.2 and the trade budget (≤24 a year).
- **Gross exposure.** ≤1.0× (no margin) in the Growth and Conservative presets; ≤1.3× in Growth+ (§10).
- **Hard caps.** Track 03 §6C, with track 01's archetype caps inside them, as adjusted by track 12:

  | Item | Cap |
  |---|---|
  | Satellite stress loss per trade | ≤2% of portfolio (stop-based, gap-adjusted); ≤3% (defined premium) |
  | Correlated cluster | Stress loss ≤8%, with track 08's **macro-factor budget of 3% premium or 2% stop-risk per factor** inside it |
  | All satellites combined | Stress loss ≤15% |
  | Outstanding option/event premium | ≤10% |
  | Single stock | ≤5% while single stocks are incubator-only |
  | "Lottery-type" positions (long-dated OTM options only) | 0.5–1% |
  | Crash-correlated "short-put-like" modules (merger arb, SPAC, prediction-market favourites, carry, non-crisis credit) | ≤10% combined, never funded from the S2 earmark. **When VIX > 30: no new positions; existing ones are not force-sold** |
  | Portfolio volatility | Target-weight 10-year realized volatility ≤20% (≤25% in Growth+). S2 tranches are exempt, so a crash never forces selling |

- **Drawdown governor.** New *discretionary* risk (S3, S4, the §3.6 modules) is multiplied by G(D). G = 1 up to a 10% portfolio drawdown, falls linearly to 0 at 40%, and a human review is triggered there (track 03 §6D).
  - S2 tranches and the credit-crisis module are **exempt**: they are unlevered, pre-committed and bounded by the gross limit.
  - The k-halving at a 25% drawdown is **temporary**: k is restored once the drawdown has been under 10% for 3 months (track 12 M7).
- **Integrity.** Evaluator code, the constitution and ledger history sit in protected paths (CODEOWNERS plus a CI check that fails any bot-authored change to them) or in a separate repository. The LLM's credentials cannot write there (track 12 M11).
- **Conflict-of-interest rule.** No recommendation whose thesis centers on Anthropic, which makes the model that runs this system.

### 3.2 The sleeves

| Sleeve | Purpose | Size | Instruments | Entry | Exit | Emails a year |
|---|---|---|---|---|---|---|
| **S1 Core** | Harvest the equity premium; the dominant decision | 85% by default (Growth); see the §10 presets | Broad, low-cost **global** index fund (expense ratio ≤0.06%). The US is history's survivor market, so the core doesn't bet on one country | Initial build in up to 3 monthly tranches (a regret-limiting compromise; CAPE timing fails out of sample) | None in Growth. Trend switch (10-month SMA) in Conservative and Growth+ | 0–2 |
| **S0 Reserve** | Dry powder for S2 and the credit-crisis module; funds S3/S4 | 15% by default (0/15/30% is your choice) | Treasury bills or a 0–2-year Treasury ladder (about 4.2–4.8% today; bills are state-tax-free) | n/a | n/a | 0 |
| **S2 Crash tranches** | Deploy the reserve by rule when the market is on sale | Shares of **the reserve balance when the episode's first trigger fires**. Normal regime: 10 / 20 / 30 / 40% at −20 / −30 / −40 / −50%. Expensive regime (price >1.3× its 10-year average, or CAPE >30): 25 / 35 / 40% at −30 / −40 / −50% | The same index as the core, 1×. Calls only if they beat the index on Δg (§7 shows why they usually don't) | Drawdown of **the index actually held** from its all-time high. Placed as **standing good-till-cancelled limit orders** at each level, so your only job is not to cancel them | The index regains its pre-crash high → back to S0. At 5 years the tranche **merges into the core (no sale)**. No stop-loss | ≈0.5 on average, clustered in crises |
| **S3 Opportunity** | Rare, rule-based asymmetric trades with a measurable structural edge | ≤3 concurrent; caps in §3.1; funded from S0 above the S2 earmark | Liquid ETFs, trusts at a discount to NAV, long-dated calls or call spreads on liquid underlyings, the §3.6 modules | Every gate in §3.3 | Pre-registered target, invalidation and time stop | 1–6 |
| **S4 Speculative (Bitcoin)** | Crypto-cycle exposure; an **explicit exception you opt into** (only 3–4 cycles, so it fails the ≥10-analog gate) | **≤3% of the managed portfolio**, staged 1.5% + 1.5% | BTC via a spot ETF; **no leverage** | ≤1.2× the 200-week average, or a drawdown ≥75% from the all-time high (track 06). The halving calendar is context only: multiples decayed about 2–5× per cycle (tracks 05, 12) | Weekly close below the 20-week average after a ≥2× gain, a pre-set multiple, or a **weekly close below $57.7k** (invalidation) | ≈0.5 |
| **S5 Incubator** | Test unproven edges without money | 0% (shadow only) | §3.7 | Logged and scored monthly | n/a | 0 |

**Reserve waterfall** (one priority rule, track 12 M9):

1. **S2 crash tranches.** At least **two-thirds of S0** is earmarked for S2 and cannot be used by S3, S4 or §3.6.
2. **Credit-crisis module.**
3. **VIX add-on.**
4. **Everything else.**

**Reserve rebuild.**
- S0 is refilled only from tranche exits and new contributions.
- It is rebalanced once a year, and only if it has drifted outside half to 1.5× its target share.

**What the reserve costs.** Measured against 100% equity (`preset_backtest.csv`):
- **About 0.5 points a year** with a 15% reserve, and about 1.1 points with 30%, on US history 1928–2026.
- In the muted scenario: about 0.3 / 0.5 points.
- If today's valuations imply an equity premium near zero, as the CAPE regression suggests, the reserve roughly pays for itself (track 12 §3.2).
- It buys dry powder, not return. Choose its size in §10.

**VIX add-on.** On the first VIX close ≥45 after 60 quiet days, add up to 10% of the portfolio from S0 (after S2's earmark) for 12 months. n = 8, and the pre-1986 analogue failed (track 06).

**International crash signals.**
- They must pass the valuation filter, trade at half a broad-index tranche, and count toward any macro-factor budget they load on.
- Triggers that fired **before launch are not traded**. They re-arm after a new all-time high (track 12 M5).

### 3.3 Admission gates for every S3 trade (all must pass)

1. **Reference class.** At least 10 historical analogs, including the failures, with base rates computed from them (track 01 R3). New archetypes go to the incubator.
2. **Positive expected value after shrinkage** (§1.2). Expected value is computed after costs and estimated taxes, with fills at the ask for long legs and the bid for short legs.
3. **Robustness.** The trade still adds to growth with the win probability lowered by 5 points, or by a third for long shots (track 03).
4. **Growth hurdle.** Δg_yr ≥ 0.2% on the whole portfolio, and the trade beats the T-bill hurdle over its horizon.
5. **Defined maximum loss at entry.** Stops don't count as defining it.
6. **Catalyst or valuation anchor.** Option expiry ≥ max(2 × thesis horizon, 9 months).
7. **Liquidity.**
   - Options: spread ≤2% of mid for expiries of 6 months or more, ≤5% otherwise, with open interest ≥500 (track 04; ≤10% only for hedges).
   - Every position: ≤1% of average daily volume.
8. **Options only when they beat the equivalent stock or futures position on Δg**, after track 04's 13-point checklist (§9.4), which includes implied vs forecast volatility. In taxable accounts, prefer Section 1256 index options (SPX/XSP) for 60/40 tax treatment.
9. **Factor budget.** Trades that load on the same macro factor share one budget. Today, bonds, yen, gold, India, Indonesia and short-oil are all one "peace / peak-yields" bet (track 08 §7.2).
10. **Venue and legality.** A US-regulated venue with segregated assets, no MNPI, and prediction markets only where legal for your state.
11. **Order-ticket integrity.**
    - Action, ticker, quantity, limit prices and dates are rendered only from structured data, never from LLM prose, and the ticker must be on a whitelist.
    - Every factual claim in the email carries a citation from an allow-listed source.
    - The LLM may annotate candidates that the deterministic screens produced. It may not add candidates (track 12 M11).

### 3.4 Sizing (reference: `code/03-math/sizing_rule.py`, to be corrected per §1.2)

```
p_be     = a / (a + b)                          # break-even win probability
p_shrunk = p_be + κ · (p_model − p_be)          # κ = 0.5 rule-based, 0.25 LLM-subjective, frozen in year 1
f = G(D) · min( 0.25 · Kelly(p_shrunk),         # quarter Kelly on the shrunk probability
                Kelly(p_model − δ),             # robust to a 5pp (or p/3) overestimate
                archetype cap, cluster/factor budget, portfolio budget )
```

- **k rises only slowly.** It can move toward 0.5 only after ≥100 resolved trades, with shadow and paper trades counting at half weight, **and** verified calibration, by at most +0.05 a quarter (track 03 §6E; track 12 M7).
- **Correlated positions** are sized jointly, assuming correlation ρ ≥ 0.3 even for "unrelated" trades.

### 3.5 Exits (pre-registered in every NEW TRADE email)

- **Profit rule.** A partial take-profit ladder where the evidence supports one. A full take-profit at 3× lowered growth on long-dated calls (track 04).
- **Invalidation.** An observable condition that means the thesis is wrong.
- **Time stop.** About 1.5× the catalyst window. For options, roll or close 60–90 days before expiry.
- **Gaps.** What to do if the price gaps through a level.
- **S2 tranches.** Exit at the pre-crash high, or merge into the core at 5 years. Selling at the 5-year mark would have locked in −33% to −50% on the 1929 tranches, which then recovered (track 12 m10).

### 3.6 Special situations and alternative markets (track 05)

**Headline.** Almost none of these can drive a "1000%" goal. Most are small-edge, negatively skewed trades that lose *together* in crises. In March 2020, the merger-arb ETF fell 12.8%, high yield fell 20%, and crypto funding rates turned negative. They are **modules that are off unless their trigger fires**. No trigger is active today.

| Module | Trigger (all must hold) | Instrument | Size | Exit | Evidence |
|---|---|---|---|---|---|
| **Credit-crisis buy** (second in the reserve waterfall; exempt from the governor) | Moody's Baa minus 10-year Treasury spread (FRED `BAA10Y`) ≥3.5% at a **month-end**, or ICE HY OAS ≥700bp. Stage in thirds: at the trigger; at ≥4.5% or after 1 month; once the spread is ≥50bp off its peak | High-yield or fallen-angel bond ETFs | Up to the reserve left after S2's earmark | 12–24 months, or when the spread falls below 2.5% | +14% to +35% over 12 months at the 4 month-end triggers since 1990 (track 05 table). A daily trigger in March 2008 lost 17%; GFC paths drew down 20–26%. n ≈ 4–6 |
| **Stablecoin depeg buy** | A regulated, fiat-backed coin ≤$0.97 on ≥2 venues, reserves attested, redemptions not suspended >72h, no algorithmic design | The coin, on a regulated US venue | ≤5% | ≥$0.995, or a 30-day time stop | USDC at $0.877 (Mar 2023) and FDUSD at $0.881 (Apr 2025) were back at par in about 2 days; n ≈ 3. Algorithmic "dollars" went to zero |
| **Crypto cash-and-carry** | CME 2–3-month annualized basis ≥ T-bill + 6 points | Long spot BTC ETF + short CME micro futures | ≤15% notional, 2× margin buffer | At expiry | Worth doing on 31% of days in 2019–26; 0% in 2026 so far, so **off** |
| **Selective merger arbitrage** | Cash deal, strategic buyer, committed financing, no second request; **annualized net spread ≥15%** | The target's shares | ≤5% per deal (inside the 10% short-put-like cap) | Close or break | Merger funds returned 4.9% a year (1990–2026) vs 2.8% for bills. The median spread is 0.6% today |
| **Odd-lot tender** (small accounts only; cash-substitute rule) | Company self-tender with odd-lot priority; minimum price ≥3% above market; no financing condition | Buy ≤99 shares and tender | ≤$10k per trade | Settlement | Median gain about $40 per trade |
| **SPAC trust / CEF tender capture** (cash-substitute rule) | Price ≤ trust value − 1%, redemption ≤6 months away; or a fund self-tender ≥98% of NAV at a discount ≥8% | SPAC common (redeem) / closed-end fund | Inside the 10% short-put-like cap, **never** inside the S2 earmark | Redeem / tender | About T-bills + 1–3% / +2–6% per event |
| **Prediction-market favourites** (incubator first) | Objective data-release markets only; price 0.90–0.97; ≤60 days; legal in your state | Favourite side, limit (maker) orders | ≤1% per market | Resolution | Weak evidence: macro favourites won 89 of 89 (small n); most other categories lose after fees |

**Monitor only.**
- **Currency pegs.** The median 12-month fall after 15 breaks since 1992 was about −40%, but the currencies that break are usually untradable for a US retail account.
- **Biotech FDA decisions.** They break even at about 70% approval odds.
- **Spin-offs.** The spin-off ETF returned 9.6% a year vs 10.9% for SPY.
- **Index inclusion.** The S&P 500 effect has shrunk to about +0.8%.
- **Thrift conversions.** Only depositors get the offering price.

**Backtest hygiene.** Filtering prediction markets on lifetime volume roughly tripled the apparent mispricing. Only point-in-time universes are allowed.

### 3.7 Tools that add return without predicting anything (v0)

These come from track 12 §5. None needs a forecast, and together they plausibly add more than the S3 sleeve.

- **Tax-loss harvesting.** The monthly review flags taxable lots down >10% (with a loss above a set dollar threshold) and proposes a swap to a similar but not substantially identical fund. The wash-sale window is ±30 days, including IRA purchases (track 09).
- **Asset location.** Put S2 tranches, S3 options, trend-switch sleeves and high-yield ETFs in IRA/401k accounts, and the long-hold core in taxable accounts.
- **Section 1256** index options for any S3 option in a taxable account.
- **Reserve yield.** Treasury bills or a 0–2-year ladder, bought directly: bills are state-tax-free, and the 2-year yields about 4.8%.
- **Fee minimization.** Core funds at ≤0.03–0.06% expense ratio.
- **Standing good-till-cancelled orders** for S2 tranches, refreshed before the broker expires them.

### 3.8 Switched off at launch (incubator only) and why

| Idea | Why not yet | What would promote it |
|---|---|---|
| Single-stock "multibagger" sleeve | Needs 20–30 names, which conflicts with "few trades"; the edge is unproven out of sample (track 07) | A shadow test of the cheap-price-to-sales + growth screen beating the index after costs over ≥3 years |
| Insider-cluster buying | Strong 1986–2007 evidence (82 bp a month), but not re-tested after 2012 (track 02) | Our own 2012–2026 EDGAR Form 4 test with t ≥ 2 net of costs |
| Tail hedges, puts and VIX calls | Every tested put rule lost money; complacency-timed puts lost about 97% (track 04) | Only as a budgeted hedge (≤1–2% a year) if you ask for one |
| Prediction-market edges | Edges of 5 points or less don't survive fees and estimation error; legality varies by state | Markets stay a *data source* for implied probabilities |
| Managed-futures / trend fund inside S0 | A real crisis diversifier (2008, 2022), but not a return engine: about bills + 1 since 2010 (track 02) | Optional part of the reserve in v1.1 if you want it |
| Bonds as a crash hedge | Attractive carry at 5%+ yields, but they fell with stocks in 2022, and today's shock is inflationary | Up to ⅓ of S0 in intermediate Treasuries in v1.1 (judgment) |
| LEAPS "stock replacement" for deep tranches | Track 06's best leveraged variant (worst −20% over 2 years), but it must beat 1× on the corrected Δg | Enable once the Δg code exists and says it wins |

### 3.9 Never recommend

Evidence in tracks 01, 02, 04 and 05.

- Day trading or intraday strategies.
- Options:
  - weekly or 0DTE options, or options bought into earnings;
  - naked short options, or short-volatility products.
- Leverage:
  - 3× leveraged ETFs held longer than about 3 months;
  - margin loans outside Growth+;
  - averaging down on a levered loser.
- Lottery-type bets:
  - lottery or "high-MAX" stocks;
  - IPOs in their first year;
  - long shots, including prediction-market contracts under 20¢.
- Crypto:
  - small-coin crypto, algorithmic stablecoins, or yield with no visible source;
  - offshore custody or offshore perpetual-futures venues;
  - airdrop farming and token-unlock shorts.
- Shorts:
  - shorting names with more than 20% short interest;
  - shorting untradable currency pegs.
- Special situations:
  - old equity of companies in Chapter 11;
  - share-class pairs;
  - 144A distressed bonds;
  - commodity squeezes in contango;
  - biotech binary bets without an explicit probability model.
- Concentration: more than 25% of the portfolio in one issuer, including your employer.
- Anything relying on MNPI or coordinated trading.
- Anything centred on Anthropic.

---

## 4. Today's watch list (28 September 2026)

**Regime** (track 08): late-cycle expansion under a stagflationary supply shock and global monetary re-tightening. Rough 3–6-month scenario weights:

| Scenario | Weight |
|---|---|
| Grinding war | 45% |
| De-escalation | 25% |
| Escalation | 15% |
| Non-oil accident | 15% |

| Gauge | Now | What would change the picture |
|---|---|---|
| S&P 500 | 7,683.69; −1.5% from its 7,798.99 high (13 Aug); above its 10-month and 200-day averages | S2 (expensive regime, first tranche at −30%): **5,459 / 4,679 / 3,899**. If your core is global, the triggers use your global index instead |
| Valuation | CAPE 40.7–41.5 (99th percentile); forward P/E 19.2 on a +32% EPS year | The only US months at CAPE ≥35 (one episode, 1998–2001) returned −6% to +1% a year real over the next 10 years (track 06) |
| VIX | 16.1; VIX/VIX3M 0.88 | ≥45 → VIX add-on |
| Rates | Fed funds 3.75–4.00% after the 16 Sep hike; 10-year 5.24%; 30-year 5.56%; 10-year real 2.85%; 3-month bills about 4.2% | See setup A |
| Credit | HY OAS 2.93%; IG 0.81%; CCC 11.28%; private-credit stress **[verify]**; Baa−10-year 1.39% | Baa−10-year ≥3.5% at a month-end → credit-crisis module |
| Oil | Brent about $106; Hormuz traffic about 15% of normal; war since 28 Feb 2026 **[verify]** | Hormuz reopening odds ≥50% → "peace" factor |
| Bitcoin | $83.5k; −33% from its $124.8k high; 1.27× its 200-week average (about $66k, rising) | **≤1.2× the average (about $79k, 5% away) → S4 tranche 1 if you opted in.** A weekly close below $57.7k invalidates |
| Yen | USDJPY 157.4 | See setup D |
| International | Jakarta is −32% from its peak and passes the valuation filter, but it triggered before launch, so it is **not traded** until it re-arms. **[verify]** whether the fall is partly structural (index-provider review). KOSPI is blocked by the filter (2.5× its 10-year average) | n/a |

**Armed setups** (full trigger definitions from track 08 §5):

- **A. Peak US yields: TLT call spread.** Upgrade to a recommendation if any of:
  1. 10-year ≥5.50% **and** MOVE ≥110 **and** a Fund Manager Survey bond underweight at or beyond −45%;
  2. Polymarket "Hormuz normal by 31 Dec" above 50%, or a signed US–Iran framework;
  3. 2-year minus effective fed funds below +50bp while the 10-year is still above 5.0%.

  Invalidated by: the 10-year above 5.60% with 5y5y above 2.6% or core CPI (3-month annualized) above 3.5%, or Brent above $120.
- **C. Uranium trust (SPUT).** Discount to NAV ≥12% **and** term price ≥$95 **and** URNM back above its 200-day average; or SPUT announces a buyback.
- **D. Yen.** USDJPY ≥160 again **and** setup A's triggers firing. Invalidated at ≥165.
- **B. Bitcoin.** Superseded by the S4 rules above. Track 08's own upgrade triggers are 4 weeks of positive ETF flows with price above $70k, or a retest of $58–65k followed by a weekly close back above $70k. They are logged as secondary confirmation.
- **E. Equity hedge.** Off, because hedges are off at launch (§3.8). It arms only if you ask for a hedge budget.

**What the system would do today if it were live:**
- **Core.** Hold it if you already have one; build it in up to 3 monthly tranches if you don't.
- **Reserve.** Keep it in Treasury bills.
- **S2 orders.** Place standing limit orders at the tranche levels.
- **Opportunity sleeve.** No trade.
- **Recheck** after the 2 Oct jobs report, the 14 Oct CPI and the 27–28 Oct FOMC.

**Catalyst calendar**

| Date | Event |
|---|---|
| 2 Oct | Jobs report |
| 14 Oct | CPI |
| 27–28 Oct | FOMC |
| 29–30 Oct | BoJ and ECB |
| 3 Nov | US midterms |
| About 19 Nov | Nvidia results |
| 8–9 Dec | FOMC |
| 11 Dec | Government funding (CR) expires |
| 10 Jan 2027 | US–China truce expires |

---

## 5. Monthly calibration and self-improvement

### 5.1 Why P&L cannot be the teacher

At 6–24 trades a year (tracks 03, 10):

| To confirm… | P&L alone needs |
|---|---|
| An annual Sharpe of 1.0 | about 6 years |
| An annual Sharpe of 0.5 | about 25 years |
| A 55% vs 50% hit rate | about 57 years |

Chasing the best recent rule ended on a worse rule than the original 30–46% of the time in simulation (track 10).

### 5.2 Where the evidence comes from, honestly

- **Track 10's evidence-multiplication design.** Sub-forecasts, a shadow book of rejected candidates, and a "calibration gym" of standardized questions. In a stylized **single-stock** simulation it confirmed a skilled forecaster with 82% probability after 12 months. That falls to **22% with weaker skill**.
- **Why it transfers poorly here.**
  - v0 switches single stocks off.
  - The decisions that drive this portfolio (crash continuation, 5-year recovery, Bitcoin milestones) resolve over years.
  - The six sub-forecasts on one trade count as roughly two independent observations.
  - Expect far less power than the simulation (track 12 M6).

### 5.3 v1 — the minimum viable loop (build now)

1. **Hash-chained, append-only ledger** in the private repo, with the head hash in every email.
2. **Three pre-registered forecasts per trade**, each shown next to its reference-class base rate: P(profit at the time stop), P(invalidation before target), P(target by the date). Scored as they resolve, with reliability tables and Jeffreys intervals.
3. **A deterministic monthly shadow book with no LLM calls.** It logs every rule trigger and near-miss (within 5% of a trigger) with a paper plan and a base-rate forecast. This checks whether the **rules** still work on fresh data, which is what S1, S2 and S4 depend on.
4. **Frozen sizing in year 1.** k = 0.25; κ = 0.5 for rule-based archetypes and 0.25 for LLM-subjective ones. Only state estimates (drawdowns, moving averages, CAPE, IVs) and cost/slippage estimates update automatically.
5. **Operations checks in every monthly email:**
   - a data-freshness attestation ("last good snapshot: …");
   - a holdings reconciliation (a CSV export from your broker, or a read-only API);
   - the skip rate (recommended trades you didn't take) and its cost.
6. **An annual review, by you.** Change a rule parameter only if the change improves the 36-market panel in two disjoint periods (track 06). Never change one on live P&L.

### 5.4 Later (once a decision-relevant question family has ≥150 resolved questions)

These parts of track 10's design stay valid; they are deferred until there is data to feed them:

- a calibration gym whose questions mirror the real decisions (index drawdown continuation over 1–3 months, CEF discount mean-reversion, Bitcoin 200-week-average revisits, credit-spread thresholds);
- a separate reviewer model with blind post-mortems;
- e-process evidence meters;
- forward shadow A/B tests for parameter changes (≤2 proposals a month, P(better) ≥0.95 under a skeptical prior, 3 months' probation);
- gated Platt maps, then isotonic maps.

### 5.5 What may change, and who decides

| Tier | What changes | How often | Who decides |
|---|---|---|---|
| 1 | State estimates, costs; later, recalibration maps | Monthly, automatic, bounded | Rule engine |
| 2 | Parameters within pre-approved ranges | ≤1 per parameter per quarter, after a forward shadow test | Rule engine (from v2) |
| 3 | New archetype, instrument, prompt or model | ≤1 a quarter; incubation, then probation | Your PR approval |
| 4 | Risk limits, objective, evaluator, change policy | Never automatically | You only |

**Guardrails:**
- no risk increase for 2 months after an unusually good month;
- no strategy change while the drawdown is within its 95% band;
- retirement only on thesis invalidation or a pre-registered sequential test;
- more than 5 parameter changes in 12 months triggers your review;
- a model upgrade is treated as a new, uncalibrated forecaster.

---

## 6. Architecture v1 (track 09, hardened per track 12)

```
 GitHub Actions (private repo), America/New_York
   ├─ 22:17 Mon–Fri  daily scan
   │     ingest (yfinance, CBOE, SEC EDGAR, FRED, FINRA, Kraken/Coinbase, Kalshi/Polymarket, calendars)
   │       → point-in-time snapshot (hashed; two-source check for any order-ticket price)
   │       → deterministic screens (the constitution's rules) → candidates
   │       → LLM triage (Sonnet 5.5, web search; may annotate, not add, candidates)
   │       → LLM judge + writer (Opus 5.5; numbers only via {{placeholders}}; citations required)
   │       → risk gate + sizing + number/slot validator + ticket-from-JSON (deterministic)
   │       → email via Resend (+ one GitHub issue per trade; the email carries the issue link and hash)
   │       → ledger append (hash chain) → healthchecks.io ping
   ├─ 08:47 Mon–Fri  pre-market check: re-price open recommendations; email only on invalidation
   └─ 07:13 on the 1st  monthly run: reconcile, resolve, score, report, propose (PR only)
 Protected: evaluator/, constitution/, ledger history (CODEOWNERS + CI; the LLM token can't write)
 Optional: a monthly Claude Code "engineer" routine opening improvement PRs that you merge
```

- **Numbers.** Every number comes from the data layer. The validator checks both that a number exists in the snapshot **and** that it sits in the right slot (so swapped levels, BUY/SELL flips and wrong tickers fail). In its self-test it caught a changed close price and an invented "18%" (track 09).
- **Trading access and fills.** No broker write access. You record fills by commenting `filled 39 @ 224.10` or `skipped` on the trade's GitHub issue.
- **Email authenticity.** Act only on emails whose issue link and hash match.
- **Cost.**
  - About $5–15 a month in the base case, at most about $35. This includes no LLM shadow book, because v1's shadow book is deterministic.
  - Adding track 10's LLM shadow book at full scale could cost about $250 a month.
  - A paid data upgrade (+$30–100 a month) is recommended before trading real size.
- **Known fragilities** (tracks 08, 09):
  - yfinance breaks often;
  - FRED now serves only about 3 years of ICE spread history, so the tool archives daily copies;
  - the Yale Shiller file stopped updating in 2023;
  - continuous futures tickers roll silently;
  - GitHub cron can be delayed, so healthchecks.io acts as a dead-man's switch.

---

## 7. Worked example: the email the system would have sent on 20 March 2020

This replays a real moment using only information available at the time. The base rates use pre-2020 data only (`code/00-synthesis/example_base_rates.py`, `example_email_numbers.py`). **It illustrates the format and is not a recommendation.**

The illustrative portfolio uses the Growth preset: $300,000 at the 19 Feb peak, split 85% core and 15% reserve.
- In March 2020, CAPE was 24.8 and the price was below 1.3× its 10-year average, so the regime was normal.
- Tranche 1 (10% of the $45,000 reserve at the episode start) fired at −20% on 12 March and filled on 13 March at $269.32.

```
Subject: [TRADE #002] BUY 39 SPY — crash tranche 2 of 4 — act Mon 23 Mar

┌──────────────────────────────────────────────────────────────────────────────┐
│ ACTION     BUY 39 shares of SPY (S&P 500 index fund) — crash tranche 2 of 4  │
│ SIZE       $8,923 = 4.1% of portfolio = 20% of the reserve you started with  │
│ MAX LOSS   Not capped (index fund). Planning stress (−50%): −$4,462 (2.1%).  │
│            Worst reference path (1929, −78.5%): −$7,005 (3.2%); your whole   │
│            portfolio would be about −76% from February in that path.        │
│ WINDOW     Your standing limit order should already have filled; if not,    │
│            place it Mon 23 Mar. Skip if SPY is outside $205–$245.           │
│ ODDS       6 earlier times since 1928 the S&P first closed 30% below its    │
│            high. Under this tranche's exit rules: 5 of 6 made money         │
│            (+22% to +50%); 1929 lost 57%. Average +22%, median +35%.        │
│ CONFIDENCE Medium: rule-based, but only 6 analogs                           │
└──────────────────────────────────────────────────────────────────────────────┘

IN ONE SENTENCE
US stocks are 32% below their February high; this spends the next pre-planned
slice of your cash reserve on the index and holds it until the old high returns
(or merges it into your core after 5 years).

DO THIS
1. Any brokerage account. No options or margin needed. Your usual low-cost
   S&P 500 or total-market fund (e.g. VOO or VTI) is fine instead of SPY.
2. BUY 39 shares, LIMIT order, day only. Limit = last price + $0.50.
   Don't chase above $245.
3. VIX is 66, so prices swing a lot: avoid the first 30 minutes. Splitting the
   order into two is fine.
4. Record the fill: comment "filled 39 @ <price>" or "skipped" on GitHub
   issue #2 (link below). Act only on emails whose issue link and hash match.

HOW YOU GET OUT (DECIDED NOW)
- Sell when the S&P 500 closes above its old high of 3,386.15 (EXIT email).
- If that hasn't happened by 20 March 2025, the tranche simply becomes part
  of your core. No sale.
- No stop-loss. Historically, crash buys failed when people sold in the
  second leg down.
- Tranches 3 and 4 are standing orders at −40% (S&P ≤ 2,031.69; $13,500)
  and −50% (≤ 1,693.08; $18,000).

WHY
The S&P 500 fell 31.9% in 22 trading days, the fastest bear market on
record, as COVID-19 shut economies down. The Fed cut rates to zero on 15
March and launched emergency lending. Honest caveat: at −30%, history
shows only a small edge over buying at an ordinary time, and the clearer
edge is at −40% and deeper. This tranche exists because the reserve was set
aside for exactly this, and a pre-committed plan beats deciding in a panic.

THE ODDS (first close ≥30% below the high, 1928–2019; price only)
  Entry      Result under the exit rules            Lowest point while held
  Oct 1929   −57% (valued at 5 years)               −78.5%
  May 1970   +44% (old high regained in 1.8 years)   −8%
  Jul 1974   +22% (valued at 5 years)               −26%
  Oct 1987   +50% (old high regained in 1.8 years)   −0.4%
  Sep 2001   +27% (valued at 5 years)               −25%
  Oct 2008   +48% (old high regained in 4.5 years)  −36%

  Scenario                     Raw count  Our probability  Tranche  Portfolio
  Old high within 2 years        2 of 6        30%          +47%      +1.9%
  Old high in 2–5 years          1 of 6        20%          +48%      +2.0%
  Up, but no high in 5 years     2 of 6        30%          +25%      +1.0%
  Depression-type (1929)         1 of 6        20%          −57%      −2.3%
  (Probabilities are Laplace-smoothed raw counts, so the 1-in-6 disaster is
   deliberately given more weight than its raw frequency.)
  Expected tranche result: about +20% over the holding period.
  Other forecasts logged for scoring (smoothed from the same 6 cases):
  higher in 1 year 50% · higher in 3 years 75% · touches −40% while held
  62% · touches −50% while held 38%.

WHY THIS SIZE
Set by the crash-tranche schedule: 20% of the reserve at the episode start.
Tranches are a pre-committed portfolio rule, backtested as a whole (they add
about +0.1 points a year on 1928–2026 data), so the per-trade growth hurdle
and the drawdown governor don't apply.

WHY NOT OPTIONS?
A 21-month at-the-money SPY call returned 1.6–3.3× in 3 of these 6 episodes
and expired worthless in the other 3 (1929, 2001, 2008). On the whole-portfolio
growth test it adds less than buying the index, so the system uses the index.

RISKS AND TAX
Stock exposure after this trade: 86% of the portfolio (target 85%). If the
old high comes back within 12 months, the gain is short-term (taxed as
income): hold tranches in an IRA where you can.

YOUR PORTFOLIO AFTER THIS TRADE
Core index $172,442 · Tranche 1 $4,118 · Tranche 2 $8,923 · Reserve $31,229

Automated research generated for your personal use by an AI system; not
individualized advice from a licensed professional. You decide.
Trade T-2020-002 · issue #2 · archetype crash_tranche · constitution v0.2 ·
data as of 2020-03-20 21:00 UTC (^GSPC, SPY, ^VIX) · ledger head 9f2c…
```

**What actually happened.**
- SPY closed at **$222.95 on 23 March 2020, the exact bear-market low**. That was luck.
- The S&P 500 made a new high on **18 August 2020**, triggering the EXIT email at SPY $338.64:
  - tranche 2: +51.9% (+$4,630, about **+2.1% on the whole portfolio**);
  - tranche 1: +25.7%.
- That is the honest scale of a crash tranche: a small, positive, pre-committed add-on. It is not a 1000% trade.
- A 21-month call would have returned about 6.5× (approximate pricing). The system would not have bought it, and in 3 of the 6 prior cases that restraint would have been right.

---

## 8. Limitations and risks (read before trusting any of this)

- **Small, flattering samples.**
  - The US market is history's survivor.
  - Crash rules rest on 5–12 US episodes, and the reserve's value depends on an equity premium no one can forecast well.
  - Bitcoin rules rest on 3–4 cycles.
  - The multibagger data covers only stocks that survived.
- **Modelled option prices.** Where historical quotes were unavailable, option prices come from Black-Scholes using VIX and skew. The signs are robust; the levels are not (track 04).
- **Trend-switch evidence is weaker after publication.** Over 2007–2026:
  - the 1.0× switch lagged the index by about 2 points a year (9.3% vs 11.2%);
  - the 1.3× Growth+ preset matched the index (11.2%) with a −33% worst drawdown instead of −55% (`preset_postpub.csv`).
- **Current-environment facts** come partly from web summaries after a shared search budget ran out. The tool must verify them from primary sources before any email cites them.
- **LLM risks** include look-ahead leakage, rationalization, reward hacking, sycophancy, drift and prompt injection. They are handled by separation of powers, protected evaluator paths, tickets built from structured data, required citations and a change budget (tracks 10, 12). None of these controls is perfect.
- **The human is a single point of failure.** If crash tranches are skipped, the reserve is pure drag. Standing orders and the skip-rate report are there to address that.
- **Nothing here is individualized financial advice.** The system is research for your personal use, and you remain the decision-maker. Sending its recommendations to others could make it regulated investment advice (track 09).
- **Every sleeve can lose money.** The index core has had 55–85% drawdowns historically.

---

## 9. Verified in this session vs to re-check at build time

- **Verified from data in this container:**
  - market levels and drawdowns;
  - backtests, including the §10 preset table and the 2007–2026 check;
  - VIX/VRP statistics and Fama-French factor decay;
  - the bootstrap simulations;
  - option chains on 28 Sep;
  - data-source reachability;
  - the email-validator self-test;
  - the worked-example arithmetic, after the red-team corrections.
- **To re-check against primary sources:**
  - details of the Iran war and Hormuz traffic;
  - Oracle's rating and CDS; private-credit default rates; Fund Manager Survey details;
  - Polymarket US status by state;
  - the broker-by-broker rollout of the PDT rule change (the SEC approved its replacement on 14 Apr 2026, effective 4 Jun 2026, with phase-in to Oct 2027);
  - whether Jakarta's 2026 fall is partly structural;
  - a few paper magnitudes cited from memory (flagged in tracks 01, 02 and 10).

---

## 10. Decisions needed before building

### 10.1 Risk preset: the decision that matters most

Source: `code/00-synthesis/preset_backtest.py`. US total market, 1928–2026, pre-tax and pre-cost, with windows starting every quarter. Each cell reads **history / muted** (muted = 3.3 points a year less equity return).

| Preset | What it is | Trades a year | CAGR | Worst drawdown | Median 20-year multiple | P(11× in 20 years) | P(losing money over 10 years) |
|---|---|---|---|---|---|---|---|
| 100% index | Buy once, hold | 0 | 10.0% / 6.5% | −84% / −86% | 7.8× / 4.0× | **28% / 2.5%** | 5% / 10% |
| **Growth** (default) | 85% core, 15% reserve, S2 tranches | ≈0.5 + S3/S4 | 9.5% / 6.2% | −83% / −84% | 7.1× / 3.9× | **21% / 1.3%** | 4% / 7% |
| Growth, 30% reserve | 70/30 + S2 | ≈0.5 + S3/S4 | 9.0% / 6.0% | −81% / −83% | 6.4× / 3.8× | 12% / 0% | 3% / 7% |
| Conservative | 100% core + 10-month-average switch to T-bills | ≈1.5 | 10.0% / 7.5% | **−47% / −48%** | 7.4× / 4.4× | 5% / 0% | **0% / 0%** |
| **Growth+** | 1.3× core (futures or box-spread financing) + the same trend switch; 25% volatility cap | ≈1.5 | **11.7% / 8.5%** | −58% / −59% | **10.0× / 5.3×** | **39% / 0.3%** | 0% / 0% |
| Aggressive / goal-seeking | 2–3× or concentrated bets | varies | n/a | −90%+ | n/a | higher, with a matching chance of near-total loss | high |

Aggressive / goal-seeking is **not recommended**. Track 03 shows that maximizing P(11×) is achieved by strategies that otherwise end near zero.

**Reading the table:**
- **Growth+ is the best-evidenced preset for your stated objective.** It has the highest compounding in both scenarios, a smaller worst drawdown than the plain index, and no 10-year losses. Caveats:
  - after publication (2007–2026) it only *matched* the index return, with smaller drawdowns;
  - it needs futures or box-spread financing and permission for them;
  - it trades about 1.5 times a year, preferably in a tax-advantaged account;
  - a one-day gap like 1987 would cost about 1.3× the index move.
- **Growth** is the simple default, and the reserve funds crash tranches and opportunities. It costs about 0.5 points a year against 100% equity on history.
- **100% index** is the purest "fewest trades" answer. On US history it beats every unlevered preset.
- In the muted scenario, which is closer to today's forecasts, **no disciplined preset reaches 11× in 20 years with meaningful probability**. The realistic 20-year outcome is roughly a 4–5× multiple.

### 10.2 Other decisions

1. **Capital scope.** Should the system manage (a) your whole investable portfolio, or (b) only a separate risk-capital pot? Roughly how much, and do you add new savings monthly? Contributions are the cheapest way to rebuild the reserve.
2. **Reserve size.** 0, 15% (default) or 30%.
3. **Instruments and accounts you can use.**
   - US stocks and ETFs;
   - listed options (long calls and debit spreads);
   - crypto via ETF (needed for S4);
   - futures (needed for Growth+);
   - prediction markets (depends on your state);
   - account types: taxable, IRA/401k, or both (asset location).
4. **Opt-ins.** The S4 Bitcoin sleeve (≤3%); a hedge budget (default off).
5. **Jurisdiction.** Country and US state, if any. Tax rules, product access (EU investors can't buy US ETFs) and prediction-market legality depend on it.
6. **Runtime and email.**
   - GitHub Actions + Resend is recommended. It needs the Claude GitHub App to have access to `sol008/testProject`; pushes are currently refused.
   - The Gmail API is an alternative to Resend.
   - Optionally, a monthly Claude Code routine for improvement PRs.
7. **Accounts and keys** (track 09 §9.5):
   - an Anthropic API key with a spend limit;
   - a Resend key, created with the inbox that should receive alerts;
   - free FRED, CoinGecko Demo and Alpha Vantage keys;
   - a healthchecks.io account;
   - the repository made private.

---

## Appendix A — How conflicts between tracks were resolved

| Topic | Positions | Resolution |
|---|---|---|
| Leverage | Track 01: veto above 1.0×. Track 02: ≤2× with a trend filter. Track 03: 1.0× at launch, ≤1.3× governed. Track 04: ≤2× vol-scaled. Track 06: up to 2× in crash tranches | 1.0× in Growth and Conservative. **Growth+ ≤1.3× with a trend switch**, via futures or box financing, by your opt-in (track 12 M4) |
| Crash tranches | Track 01: thirds at −30/−40/−50. Track 06: 10/15/25/50% of *core* (i.e., leverage up to 2×). Track 02: −20/−30/−40 | **Shares of the reserve at episode start** (fundable at 1.0×), with track 06's expensive-regime branch; exempt from the governor; merge into the core at 5 years (track 12 C1, m10) |
| Convexity sleeve | Track 01 R14: buy puts or VIX calls when the VIX is low. Track 04: every put rule lost money | **Off**; a hedge only on request |
| Trend switch | Track 02: needed only with leverage. Track 06: a risk switch that lags after publication | Part of the Conservative and Growth+ presets; not in Growth |
| Positions / trades | Tracks 01, 02, 03, 08 | ≤3 concurrent S3; target ≤12 a year; cap 24 |
| Loss caps | Track 01: 0.5–5%. Track 03: 2/3%. Track 04: 3%. Track 08: 1.5% of premium | Track 03's global caps, archetype caps inside them, **track 08's 3% factor budget inside the 8% cluster cap** |
| Growth hurdle vs minimum edge | Track 03: Δg ≥0.2% per trade. Track 02: ≥2× costs and ≥1% a year at portfolio level | **Δg_yr ≥0.2% on the whole portfolio and ≥2× round-trip costs.** Policy rules and cash substitutes are exempt |
| Shrinkage target | Some sections said "toward the base rate", others "toward break-even" | **Base rate** for rule-based archetypes; **market / break-even** for LLM-subjective ones |
| Crypto | Track 02: ≤5–10% with a 20-week MA. Track 06: ≤5% with cycle rules. Track 05: halving timing unreliable | **≤3%, opt-in, staged; 200-week-average / drawdown entries; the halving is context only** |
| Special-situation budget | Track 05: short-put-like modules ≤30% (15% when VIX > 30) | **≤10%, outside the S2 earmark; no new positions when VIX > 30** (track 12 M9) |
| Single stocks | Track 07: a 20–30-name sleeve only if proven. Track 02: insider buys after our own test | Incubator only; ≤5% cap |
| Calibration machinery | Track 10: full evidence engine (gym, shadow book, reviewer, e-processes, Thompson sampling) | **A minimum viable v1** (§5.3); the rest deferred until data justify it (track 12 §6) |

## Appendix B — One-line summaries of the tracks

- **01** — 67 great trades and 35 blowups. The biggest wins had capped downside; the blowups didn't. Crisis buying is the most reliable few-decision edge, and a modest one.
- **02** — Only the equity premium is large and robust; anomalies halve after publication. Retail over-trading destroys returns. Unlevered +1000% is a 20-year outcome.
- **03** — Kelly and ergodicity. The objective is log growth under a trade budget and hurdle, with quarter-Kelly on shrunk probabilities and a drawdown governor. Report P(11×) honestly.
- **04** — The VIX exceeded realized volatility on 86% of days. Long-dated calls work only through drift. Puts and volatility lose. Buy time, not strikes; no 3× held for years.
- **05** — Special situations are mostly small-edge, crash-correlated trades, useful only as trigger-gated modules. Prediction markets are well calibrated after fees; long shots lose more than 60%.
- **06** — Crash-buying works per trade at 1×, and 3× is ruinous. The valuation filter works out of sample. The trend switch controls drawdowns, not returns. Bitcoin cycles are decaying.
- **07** — 10-baggers are about 1 in 250–350 stocks over 5 years. Predicting them means picking lottery tickets. Winners fell 56% (median) along the way.
- **08** — The 28 Sep 2026 regime, a 30-gauge dashboard, armed triggers, the catalyst calendar and data-hygiene traps.
- **09** — GitHub Actions + Claude API + Resend for about $5–35 a month; the validator pattern; regulatory and tax constraints; the accounts to create.
- **10** — Why P&L can't teach a few-trade system; forecast and shadow-book evidence; the guarded change process; LLM controls; the ledger schema.
- **11** — The per-trade email format.
- **12** — The red-team review. It found the unfundable crash tranches, the mislabelled default odds, the mis-specified growth hurdle, and example errors. It priced the reserve's cost and added the tax and operations tools. All critical and major findings are addressed in this revision (Appendix C).

## Appendix C — Red-team findings and how revision 2 addresses them

| Finding | Fix in this revision |
|---|---|
| C1 crash tranches unfundable and blocked by the governor | §3.2: reserve-share sizing, governor exemption, waterfall and earmark, standing orders |
| C2 the default labelled with the index's odds | §10.1: new preset table computed for each preset, historical and muted, plus a 2007–2026 check |
| M1 Δg mis-specified | §1.2: whole-portfolio, per-year Δg with T-bills; policy-rule and cash-substitute exemptions; code fix flagged |
| M2 worked-example errors | §7 rebuilt: corrected sizes, smoothed probabilities with raw counts, path-low stress, all required fields, tax line, fills via issue |
| M3 Bitcoin fails the gates | §3.2 S4: ≤3%, staged, explicit opt-in exception; $57.7k invalidation; trigger distance stated |
| M4 Growth+ breaks the invariants | ≤1.3× with a trend switch, futures/box financing, 25% volatility cap on 10-year realized volatility, S2 exempt |
| M5 Jakarta contradiction | Pre-launch triggers are not traded; re-arm after a new high; structural cause **[verify]** |
| M6 the 82% claim doesn't transfer | §5.2 restated with the 22% figure and transfer caveats; v1 shadow book deterministic and monthly |
| M7 k ratchet | Temporary halving; shadow trades count at half weight |
| M8 reserve cost unstated | §3.2 states the cost; 0/15/30% offered; rebuild rule |
| M9 special situations undermine the reserve | ≤10% cap outside the S2 earmark; no forced sales above VIX 30; one priority rule |
| M10 behavioural and operational failure points | Standing orders, reconciliation, skip-rate report, data-freshness attestation, email authenticity |
| M11 LLM guardrail gaps | Protected paths, tickets from JSON with a ticker whitelist, required citations, annotate-not-add |
| M12 incomplete expectations | §0 items 2, 3 and 6 |
| Minor m1–m15 | Liquidity rule, full trigger definitions, hedge off, tax wording, Bitcoin decay, caps, trigger index, T-bill yield, cost note, merge at time stop, one-episode CAPE, reconciliation rows, shrinkage target, VRP wording |
