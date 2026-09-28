# 00 — Synthesis: strategy constitution v0 and system blueprint

*Research phase completed 28 September 2026. It draws on ten parallel research tracks (`01`–`10`) and the email specification (`11`). The tool has **not** been built yet; §10 lists the decisions needed before building starts.*

This document turns the evidence into the rules the tool will enforce. Every number names the track that produced it, so it can be traced to code and data. Items marked **[verify]** rest on secondary sources, and the tool must re-check them against a primary source before quoting them in an email.

---

## 0. The short version

1. **"Fewest trades, maximum % return" cannot be optimized literally.**
   - Taken literally, it means betting everything on long shots, and that ruins almost everyone who tries. In a coin-flip game that pays +50% or −40% (+5% expected per round), 86.5% of players who bet everything each round are poorer after 100 rounds; the median player keeps 0.5% of their money (track 03).
   - The system therefore maximizes **long-run compounded growth**, using fractional Kelly sizing under hard no-ruin limits and a small trade budget.
   - It reports "1000%" as **a probability by a date**, never as a promise.
2. **What +1000% (11×) takes.**
   - Required annual return: **61.5% for 5 years, 27.1% for 10, 12.7% for 20**.
   - The S&P 500 has returned 10.3% a year nominal since 1928. As a plain index it reached 11× in 0% of 10-year windows and 28% of 20-year windows (track 02).
3. **History's biggest few-decision winners had their downside capped by structure.** Examples: a small option premium, a currency-peg band, an unlevered index bought after a crash.
   - Almost all 35 famous blowups had an **uncapped** loss: leverage, sold options, short squeezes, or custody failure (track 01).
   - Headline multiples are not portfolio returns. Ackman's famous 96× hedge added about 40% to his fund.
4. **The evidence is sobering.**
   - The equity risk premium is the only large, robust, cheap source of return.
   - Published anomalies lose roughly half their return after publication, and net close to zero for a retail trader after costs (track 02).
   - Index options were overpriced on 86% of days since 1990 (track 04).
   - Models that successfully predict 10-baggers end up picking lottery tickets whose average return trails the index (track 07).
   - The most active 20% of retail households trailed the market by about 6.5 points a year (track 02).
5. **What does work and fits "few trades":**
   - stay invested in the equity premium;
   - add to it by rule after deep crashes, never with 3× leverage;
   - take a handful of structurally justified, defined-risk opportunities a year;
   - keep speculative bets small;
   - say "no trade" most months (tracks 01, 03, 06).
6. **Realistic odds of 11× in 20 years** (track 03 bootstrap of 1926–2026 US data; "historical" returns / a "muted" scenario 3.3 points a year lower):

   | Strategy | P(11×) | Median outcome | Condition / drawdowns |
   |---|---|---|---|
   | Plain index | 30% / 9% | 7.3× / 3.8× | |
   | Drawdown-governed index, up to 1.5× | 39% / 14% | | never fell 50% |
   | Barbell, 90% index / 10% option bets | 62% / 40% | | only if the option bets carry a real +65% edge; with fairly priced options it does *worse* than the index |

   Within 5 years, 11× is essentially unreachable without a large risk of near-total loss.
7. **The AI's real edges are discipline and coverage, not secret alpha.**
   - Discipline: pre-committed exits, no panic selling, no FOMO.
   - Coverage: about 30 market gauges and thousands of filings watched every day, with honest bookkeeping.
   - Calibration: its probabilities are scored against outcomes.
   - Its forecasting skill is unproven, so it is measured before it is trusted with size (track 10).
8. **Expected cadence: about 1–6 trade emails a year**, plus a monthly review. Months of silence mean the system is working.
9. **Today (28 Sep 2026) no setup clears the bar** (tracks 06, 08).
   - The regime is late-cycle: a war-driven oil shock (Brent about $106), the Fed hiking again (3.75–4.00%), and a 10-year Treasury yield of 5.24%.
   - The S&P 500 is 1.5% below its high, at a CAPE of about 41 (99th percentile).
   - Armed triggers:
     - Bitcoin at 1.27× its 200-week average; the entry trigger is ≤1.2× (about $79k);
     - S&P 500 crash tranches, the first at −30% = 5,459;
     - peak-yield bond call spread;
     - uranium-trust discount to its holdings (NAV);
     - yen near its intervention ceiling;
     - a Jakarta crash-buy signal that passes the valuation filter.
10. **Build plan** (track 09). Python on GitHub Actions for the daily scan and monthly calibration; the Claude API for judgment and plain-English writing, with numbers only from the data layer; the Resend email API. About **$5–35 a month**. It waits on your decisions in §10.

---

## 1. The objective, stated precisely

### 1.1 Why not "maximize % return per trade"

- **Expected (arithmetic) return is dominated by rare lucky paths; the typical (median) investor experiences the compounded (geometric) return.**
  - The bet sizes that make the most famous "1000%" stories possible are the same ones that ruin most people who use them.
  - In track 01's simulation of a good bet (35% chance of 4×), risking 25% per bet reached 10× on 22% of paths, but the **median** path lost money and 12% of paths lost 90% or more.
- **Overconfidence makes this worse.**
  - If the true hit rate is 25% but the system believes 35%, full-Kelly sizing ends with a median of 0.39× (track 01).
  - Overstating a win probability by 5 points turns even half-Kelly option betting negative (track 03).

### 1.2 What the tool optimizes

- **Objective.** Maximize expected log growth of total wealth per year, net of costs and estimated taxes (track 03 §6A).
- **Sizing.** Fractional Kelly with **k = 0.25** at launch, applied to probabilities shrunk halfway toward "no edge" (κ = 0.5) until the track record proves otherwise.
- **"Fewest trades"** is enforced as **a budget plus a hurdle, never as bigger bets**:
  - at most 24 new trades a year (target ≤12, expected 1–6);
  - each trade must add at least **0.2% to expected long-run growth** after costs (Δg ≥ 0.2%).
- **Tax preference.** Prefer holding periods over one year and tax-advantaged accounts. Deferral turns 5.5× into 12.7× over 20 years at 15% a year pre-tax (track 03).

### 1.3 How "1000%" is reported

Every monthly review states:

- **P(portfolio ≥ 11× its starting value by your target date)**, with an uncertainty range;
- the median and 5th-percentile projected outcome;
- P(a 40%+ drawdown along the way);
- **the theoretical ceiling at the system's measured Sharpe ratio.** No strategy can beat Φ(Φ⁻¹(e^{rT}/11) + θ√T), and the strategy that achieves that ceiling ends near zero in the remaining outcomes (Browne 1999; track 03 §3f).

That one sentence protects you from any system, or person, that promises more.

| To have a 50% chance of 11× at half Kelly, the portfolio Sharpe must be… | 5 years | 10 years | 20 years |
|---|---|---|---|
| Required Sharpe (track 03) | 1.09 | 0.74 | 0.48 |
| For reference: US market long-run Sharpe | 0.44 | 0.44 | 0.44 |

---

## 2. Ten laws the evidence agrees on

1. **Cap the downside with structure, then size by maximum loss.** Winners went big only where the structure bounded the loss (track 01 §6).
2. **Survive the path.**
   - Leverage and negative carry have ruined correct theses: Keynes in 1920, Tiger in 2000, 1929 margin buyers.
   - 3× leveraged ETFs held for years lost 99.9% in 1929–32. On 36 non-US indices, the median 3× crash-buy lost 36% (tracks 04, 06).
3. **The equity premium is the engine.**
   - It is the only large premium that survives out of sample.
   - Momentum fell from 7.4% a year to 2.2% after 2000; value returned −0.6% a year over 2010–26 (track 02).
4. **Buying after crashes pays per trade, but only as an add-on.**
   - Waiting in cash for crashes earned 3–8% a year against 10.2% for staying invested (track 06).
   - Shallow triggers (−20%, −30%) show little edge over buying at an ordinary time. The −40% trigger does: 1.64× real over 5 years against 1.42× for any month, though n = 5 (track 01).
5. **Buy time, not strikes, and never buy insurance to make money.**
   - Long-dated index calls made money, but only from equity drift. Hedged of their market exposure, they lost 12–27% of premium.
   - Every tested put or volatility strategy lost money (track 04).
6. **Predicting a 10-bagger is not the same as profiting from one.**
   - The traits that predict 10× moves are lottery traits.
   - The top-decile picks had a median outcome of 0.45×, and 37% of them lost 80% or more (track 07).
7. **Great setups are rare.**
   - US drawdowns of 40% or more come about 0.4 times per decade. VIX closes of 50 or more happened 4 times since 1990 (track 01).
   - Expect 0–2 top-tier setups a year.
8. **Overconfidence is the silent killer.** Shrink every probability toward the base rate and use quarter-Kelly until calibration is proven (tracks 01, 03, 10).
9. **With few trades, P&L cannot teach.**
   - At 12 trades a year, proving a real per-trade Sharpe of 0.3 takes about 6 years (track 03). An annual Sharpe of 0.5 takes about 25 years (track 10).
   - So the system learns from thousands of scored forecasts instead (track 10).
10. **Costs and taxes reward few, long-held trades.** At 15% a year for 20 years, $1 becomes 16.4× untaxed, 5.5× if taxed yearly at short-term rates, and 12.7× if taxed once at the end (track 03).

---

## 3. Strategy constitution v0 (the rules the tool enforces)

### 3.1 Invariants — only you can change these

- **The objective** in §1.2, and the trade budget (≤24 a year).
- **Gross exposure ≤ 1.0×** (no margin) at launch. See §10 for the leverage presets.
- **Hard caps (track 03 §6C; archetype caps from track 01 R11):**

  | Item | Cap |
  |---|---|
  | Satellite stress loss per trade, stop-based | ≤ 2% of portfolio (gap-adjusted) |
  | Satellite stress loss per trade, defined premium (options, event contracts) | ≤ 3% |
  | Lottery-type trades | 0.5–1% |
  | Correlated cluster | ≤ 8% |
  | All satellites combined (stress loss) | ≤ 15% |
  | Total outstanding option/event premium | ≤ 10% |
  | Crash-correlated "short-put-like" modules combined (merger arb, SPAC, prediction-market favourites, carry, non-crisis credit; track 05) | ≤ 30% of portfolio; ≤ 15% when VIX > 30 |
  | Single stock | ≤ 15% |
  | Portfolio expected volatility | ≤ 20% a year |

- **Drawdown governor.** New active risk is multiplied by G(D). G = 1 up to a 10% portfolio drawdown, falls linearly to 0 at 40%, and a human review is triggered there (track 03 §6D).
- **Evaluator code and ledger history are read-only to the LLM**, pinned by hash (track 10).
- **Conflict-of-interest rule.** No recommendation whose thesis centers on Anthropic, which makes the model that runs this system (track 08 applied this to the Anthropic IPO market).

### 3.2 The sleeves

| Sleeve | Purpose | Default size (range) | Instruments | Entry | Exit | Emails a year |
|---|---|---|---|---|---|---|
| **S0 Reserve** | Dry powder, earning the T-bill rate (4.06% on 28 Sep) | 30% (20–40%) | T-bill ETF or Treasury bills | n/a | n/a | 0 |
| **S1 Core** | Harvest the equity premium | 70% (60–80%) | Broad, low-cost **global** index. The US is history's survivor market (Jorion & Goetzmann), so don't bet the core on one country | Initial build in 3 monthly tranches; valuations are extreme but CAPE timing fails out of sample (tracks 02, 06) | None by default. Optional trend switch (10-month SMA) is a preset, required if leverage is ever used | 0–1 |
| **S2 Crash tranches** | Buy more when the market is on sale | Drawn from S0 | Same broad index, 1×. Calls only if they beat the index on Δg (§7) | See below | New all-time high or 5 years, whichever is first; **no stop-loss** | ≈0.5 on average; clustered in crises |
| **S3 Opportunity** | Rare, rule-based asymmetric trades with a measurable structural edge | ≤3 concurrent; stress-loss caps in §3.1 | Liquid ETFs, trusts at a discount to NAV, long-dated calls or call spreads on liquid underlyings, event-driven situations (§3.6) | Every gate in §3.3 | Pre-registered: target, invalidation, time stop | 1–6 |
| **S4 Speculative (Bitcoin)** | Crypto-cycle exposure | ≤5% of net worth | BTC via a spot ETF or a regulated exchange; **no leverage**; ETH at most ⅓ of the sleeve | Staged in halves. Trigger: price ≤1.2× the 200-week average, or a drawdown ≥75% from the all-time high (track 06). The halving calendar is **context only**: 4 cycles with shrinking amplitude, and this cycle peaked at just 1.9× the halving-day price (track 05) | Weekly close below the 20-week average after a ≥2× gain (track 02 trend filter), a pre-set multiple, or a weekly close below the prior cycle low (invalidation). Assume the next cycle returns at most ⅓ of the last one | ≈0.5 |
| **S5 Incubator** | Test unproven edges without money | 0% (shadow only) | See §3.7 | Logged and scored monthly | n/a | 0 (monthly review only) |

**S2 crash-tranche schedule** (track 06 §9; tested on 36 markets).

- **Normal regime.** At S&P 500 (or MSCI ACWI) drawdowns of **−20 / −30 / −40 / −50%** from the all-time high, add **10 / 15 / 25 / 50%** of core notional from S0.
- **Expensive regime** — index price above 1.3× its 10-year average, *or* US CAPE above 30. **Today's regime is expensive.**
  - Skip the −20% tranche.
  - Start at −30%.
  - Unlevered only.
- **VIX add-on.** On the first VIX close ≥45 after 60 quiet days, add about 10% of the portfolio for 12 months. Warn that n = 8 and the pre-1986 analogue failed.
- **International signals** (e.g., Jakarta, KOSPI) must pass the valuation filter and are sized at half a broad-index tranche.
- **What does not work.** VIX, credit-spread, Fed-easing and stop-loss rules were tested as entry filters and failed out of sample. They are shown as context only.

### 3.3 Admission gates for every S3 or S4 trade (all must pass)

1. **Reference class.** An archetype with **at least 10 historical analogs, including the failures**, and base rates computed from them (track 01 R3). Brand-new archetypes go to the incubator first.
2. **Positive expected value after shrinkage.** Model probabilities are shrunk halfway toward break-even (κ = 0.5). Expected value is computed after costs and estimated taxes, with fills at the ask for long legs and the bid for short legs (tracks 03, 08).
3. **Robustness.** The trade still adds to growth if the win probability is lowered by 5 points, or by a third for long shots (track 03).
4. **Growth hurdle.** Δg ≥ 0.2% at the proposed size, and the trade beats the T-bill hurdle over its horizon (tracks 03, 08).
5. **Defined maximum loss at entry.** Stops don't count as defining it, because prices gap (track 01 R5).
6. **Catalyst or valuation anchor**, and option expiry ≥ max(2 × thesis horizon, 9 months) (tracks 01, 04).
7. **Liquidity** (track 04):
   - options: open interest ≥500 and spread ≤10% of mid (≤2% for LEAPS preferred);
   - size ≤1% of average daily volume.
8. **Options only when they beat the equivalent stock or futures on Δg**, and only after the 13-point checklist in track 04 §9.4 (including implied vol vs forecast vol) passes.
9. **Factor budget.** Trades loading on the same macro factor share one budget (track 08 §7.2). Today, for example, bonds, yen, gold, India and short-oil trades are all one "peace / peak-yields" bet.
10. **Venue and legality.** US-regulated venue with segregated client assets, no MNPI, and prediction markets only where legal for your state (tracks 01, 09).

### 3.4 Sizing (reference implementation: `code/03-math/sizing_rule.py`)

```
p_be     = a / (a + b)                          # break-even win probability
p_shrunk = p_be + κ · (p_model − p_be)          # κ = 0.5 at launch, learned monthly
f = G(D) · min( 0.25 · Kelly(p_shrunk),         # quarter Kelly on the shrunk probability
                Kelly(p_model − δ),             # robust to a 5pp (or p/3) overestimate
                archetype cap, cluster budget, portfolio budget )
```

- **k (the Kelly fraction) rises slowly.** It can go toward 0.5 only after ≥100 resolved trades with verified calibration, by at most +0.05 a quarter. It is halved immediately if κ collapses or the drawdown reaches 25% (track 03 §6E).
- **Correlated positions** are sized jointly, never each at its own Kelly. Assume correlation ρ ≥ 0.3 even for "unrelated" trades (track 03).

### 3.5 Exits (pre-registered in every NEW TRADE email)

- **Profit rule.** A partial take-profit ladder where the evidence supports one. A full take-profit at 3× *lowered* growth on long-dated calls (track 04), so ladders are partial.
- **Invalidation.** An observable condition that means the thesis is wrong.
- **Time stop.** About 1.5× the catalyst window (track 01 R21). For options, roll or close 60–90 days before expiry.
- **Gaps.** What to do if the price gaps through a level.
- **Crash tranches (S2)** exit only at a new high or after 5 years. The historical failure mode was selling in the second leg down, not the entry.

### 3.6 Special situations and alternative markets (track 05)

**Headline.** Almost none of these can drive a "1000%" goal. Most are small-edge, negatively skewed trades that lose *together* in liquidity crises. In March 2020, the merger-arb ETF (MNA) fell 12.8%, high yield fell 20%, and crypto funding rates turned negative. They enter the constitution as **modules that are off unless their trigger fires**. No trigger is active today.

**Module roster.**

| Module | Trigger (all must hold) | Instrument | Size | Exit | Evidence |
|---|---|---|---|---|---|
| **Credit-crisis buy** (highest priority; shares the S0 reserve with S2) | Moody's Baa minus 10-year Treasury spread (FRED `BAA10Y`) ≥ 3.5% at a **month-end**, or ICE HY OAS ≥ 700bp. Stage in thirds: at the trigger; at ≥4.5% or after 1 month; once the spread is ≥50bp off its peak | High-yield or fallen-angel bond ETFs | 15–30% of the portfolio in total | 12–24 months, or when the spread falls below 2.5% | +14% to +47% over 12 months at the 4 month-end triggers since 1990. A daily trigger in March 2008 lost 17%, and GFC paths drew down 20–26%. Scale in; n ≈ 4–6 |
| **Stablecoin depeg buy** | A regulated, fiat-backed coin (USDC/USDT/PYUSD class) ≤ $0.97 on ≥2 venues, reserves attested, redemptions not suspended >72h, no algorithmic design | The coin, on a regulated US venue | ≤5% | ≥ $0.995, or a 30-day time stop | USDC at $0.877 (Mar 2023) and FDUSD at $0.881 (Apr 2025) were back at par in about 2 days (+13–14%); n ≈ 3. Algorithmic "dollars" went to zero |
| **Crypto cash-and-carry** | CME 2–3-month annualized basis ≥ 3-month T-bill + 6 points | Long spot BTC ETF + short CME micro futures to expiry | ≤15% notional, 2× margin buffer | At expiry | Worth doing on 31% of days in 2019–26 (86% of days in 2021, 0% in 2026 so far); about 5.3% now vs 4.1% T-bills, so **off** |
| **Selective merger arbitrage** | Cash deal, strategic buyer, committed financing, no second request or foreign-regulator overlap, **annualized net spread ≥15%** | The target's shares | ≤5% per deal, ≤20% in total | Close or break | Merger funds returned 4.9% a year (1990–2026) vs 2.8% for T-bills. The median pending spread is 0.6% today, so this is a cash substitute at best |
| **Odd-lot tender** (small accounts only) | Company self-tender with odd-lot priority; minimum price ≥3% above market; no financing condition | Buy ≤99 shares and tender | ≤ $10k per trade | Settlement | Median gain about $40 per trade; only worth it for small accounts |
| **SPAC trust parking / CEF tender capture** | Price ≤ trust value − 1%, with a vote or redemption ≤6 months away; or a fund self-tender ≥98% of NAV at a discount ≥8% | SPAC common (redeem) / closed-end fund | Part of the cash reserve, ≤10% / ≤5% | Redeem / tender | About T-bills + 1–3% / +2–6% per event |
| **Prediction-market favourites** (low priority, incubator first) | Only markets that resolve on objective data releases (CPI, payrolls, FOMC); price 0.90–0.97 (≥0.98 is negative after costs); ≤60 days; legal in your state | Favourite side, limit (maker) orders | ≤1% per market, ≤5% in total | Resolution | Weak evidence: Polymarket macro favourites won 89 of 89 (small n). Most other categories lose after fees |

**Aggregate cap.** All "short-put-like" modules together (merger arb, SPAC, prediction-market favourites, carry, non-crisis credit) are capped at **30% of the portfolio, and 15% when VIX > 30**. No single special-situation position may exceed 5%, except the diversified credit-crisis ETFs.

**Monitor only, not traded:**

- **Currency pegs.** The median 12-month fall after 15 breaks since 1992 was about −40% (Bolivia devalued 40% on 29 Jun 2026). But the currencies that break are usually untradable for a US retail account, and well-backed pegs last decades.
- **Biotech FDA decisions.** Small caps rose about 12% on approval and fell about 27% on rejection, a break-even at roughly 70% approval odds. No free lunch without a probability model.
- **Spin-offs.** The spin-off ETF returned 9.6% a year vs 10.9% for SPY.
- **Index inclusion.** The S&P 500 effect has shrunk to about +0.8%.
- **Thrift conversions.** Only depositors get the $10 offering price; buyers at the first trade earned a median +2% over a year.

**Additional hard exclusions** (added to §3.8):

- prediction-market long shots (<20¢ loses more than 60% on Kalshi);
- old equity of companies in Chapter 11;
- share-class pairs;
- shorting untradable pegs;
- airdrop farming and token-unlock shorts;
- 144A distressed bonds;
- chasing commodity squeezes in contango.

**Backtest hygiene lesson.** Filtering prediction markets on lifetime volume roughly **tripled** the apparent mispricing — a look-ahead trap. The engine's own tests must use point-in-time universes only.

### 3.7 Switched off at launch (incubator only) and why

| Idea | Why not yet | What would promote it |
|---|---|---|
| Single-stock "multibagger" sleeve | It needs 20–30 names to work, which conflicts with "few trades". The edge is unproven out of sample (track 07) | A shadow-book test of the cheap-price-to-sales + growth screen beating the index after costs over ≥3 years |
| Insider-cluster buying | Strong 1986–2007 evidence (82 bp a month), but not re-tested after 2012 (track 02) | Our own 2012–2026 EDGAR Form 4 test with t ≥ 2 net of costs |
| Tail hedges, puts and VIX calls | Negative EV in every test. Complacency-timed puts lost about 97% (track 04) | Only as an explicitly budgeted hedge (≤1–2% a year) if you ask for one |
| Prediction-market edges | Edges of 5 points or less don't survive fees and estimation error (track 03). Legality varies by state (track 09) | Markets remain a *data source* for implied probabilities. Trades only with a named structural edge |
| Leverage above 1.0× | Ruin risk in the worst 20–40% of histories (tracks 02, 03, 06) | Your explicit opt-in to the "Growth+" preset (§10) |
| Momentum/quality factor satellites | Grade-B evidence and turnover. Momentum ETFs are the only factor ETFs that beat SPY live (track 02) | Optional satellite if you want one. It adds trades |

### 3.8 Never recommend

Each item traces to evidence in tracks 01, 02 and 04:

- day trading or intraday strategies;
- weekly or 0DTE options, or options bought into earnings;
- naked short options, or short-volatility products;
- 3× leveraged ETFs held longer than about 3 months;
- margin loans at launch;
- lottery or "high-MAX" stocks;
- IPOs in their first year;
- betting on long shots;
- small-coin crypto, algorithmic stablecoins, or yield with no visible source;
- offshore custody;
- shorting names with more than 20% short interest;
- averaging down on a levered loser;
- more than 25% of the portfolio in one issuer (including your employer);
- anything relying on MNPI or coordinated trading;
- from track 05:
  - prediction-market contracts under 20¢;
  - old equity of companies in Chapter 11;
  - share-class pairs;
  - shorting untradable currency pegs;
  - airdrop farming and token-unlock shorts;
  - 144A distressed bonds;
  - commodity squeezes in contango;
  - biotech binary bets without an explicit probability model;
- any recommendation centred on Anthropic (conflict of interest, §3.1).

---

## 4. Today's watch list (28 September 2026)

**Regime** (track 08): late-cycle expansion under a stagflationary supply shock and global monetary re-tightening. Rough scenario weights for the next 3–6 months are 45 / 25 / 15 / 15:

| Weight | Scenario |
|---|---|
| 45% | Grinding war |
| 25% | De-escalation |
| 15% | Escalation |
| 15% | Non-oil accident |

| Gauge | Now | What would change the picture |
|---|---|---|
| S&P 500 | 7,683.69; −1.5% from its 7,798.99 all-time high (13 Aug); above its 10-month and 200-day averages | Crash tranches (expensive regime, so the first is at −30%): **5,459 / 4,679 / 3,899** |
| Valuation | CAPE 40.7–41.5 (99th percentile); forward P/E 19.2 on a +32% EPS year | CAPE ≥35 historically led to about −6% to +1% a year real over 10 years (track 06) |
| VIX | 16.1; VIX/VIX3M 0.88 | ≥45 → VIX add-on |
| Rates | Fed funds 3.75–4.00% after the 16 Sep hike; 10-year 5.24%; 30-year 5.56%; 10-year real 2.85% | 10-year ≥5.50% with MOVE ≥110 → yield-capitulation setup |
| Credit | HY OAS 2.93%; IG 0.81%; CCC 11.28%; private-credit stress **[verify]** | HY ≥4.00% → stress mode |
| Oil | Brent about $106; Hormuz traffic about 15% of normal; war since 28 Feb 2026 **[verify details]** | Hormuz reopening odds ≥50% → the "peace" factor |
| Bitcoin | $83.5k; −33% from its $124.8k high; 1.27× its 200-week average (about $65.8k, rising) | **≤1.2× the 200-week average (about $79k) → S4 tranche 1.** Context only: the halving "−18 months" date (about 8 Oct) and a cycle-trough window of about 4 Oct–16 Nov (tracks 06, 08). A weekly close below $57.7k invalidates |
| Yen | USDJPY 157.4 | ≥160 → yen setup window; ≥165 → invalidated |
| International | Jakarta −32% from its peak, passes the valuation filter; KOSPI −38.6% (July) but blocked (2.5× its 10-year average) | Half-size tranche candidate: Jakarta |

**What the system would do today if it were live** (tracks 06 and 08 agree):

- **Core.** Hold it if you already have one. Build it in 3 monthly tranches if you don't.
- **Reserve.** Keep it in T-bills at about 4.06%.
- **Opportunity sleeve.** No trade. Conditional triggers are armed for:
  - **A.** Peak-yields call spread on TLT: 10-year ≥5.50% with MOVE ≥110, or 2-year minus fed funds ≤ +50bp.
  - **B.** Bitcoin cycle: staged, on its triggers, within the S4 cap.
  - **C.** Uranium trust (SPUT): discount to NAV ≥12% *and* URNM above its 200-day average.
  - **D.** Yen: USDJPY ≥160.
  - **E.** Equity hedge: only if two or more stress triggers fire.
- **Recheck dates:** after the 2 Oct jobs report, the 14 Oct CPI, and the 27–28 Oct FOMC.

**Catalyst calendar**

| Date | Event |
|---|---|
| 2 Oct | Jobs report |
| 14 Oct | CPI |
| 27–28 Oct | FOMC |
| 29–30 Oct | BoJ and ECB |
| 3 Nov | US midterms (Democrats 92.5% to win the House) |
| about 19 Nov | Nvidia results |
| 8–9 Dec | FOMC |
| 11 Dec | Government funding (CR) expires |
| 10 Jan 2027 | US–China truce expires |

---

## 5. Monthly calibration and self-improvement

### 5.1 Why P&L cannot be the teacher

At 6–24 trades a year, the time needed to prove an edge from P&L alone:

| Edge | Time to prove from P&L |
|---|---|
| Annual Sharpe 1.0 | about 6 years |
| Annual Sharpe 0.5 | about 25 years |
| Hit rate 55% vs 50% | about 57 years |

Sources: tracks 03 and 10. Reacting to last month's P&L fits noise: the standard error of a one-month hit rate is ±50 points. In simulation, "switch to the best recent rule" loops ended on a rule worse than the original 30–46% of the time (track 10).

### 5.2 Where the evidence comes from instead (track 10)

1. **Six or more pre-registered sub-forecasts per recommendation**: relative return at two horizons, target hit, stop-before-target, catalyst outcome, and return quantiles. Each resolves mechanically.
2. **A shadow book.** Every scan logs the selected trades, the top 30 rejects and 10 random controls, all with the same forecasts and paper plans.
3. **A calibration gym.** About 200 cheap, standardized questions a month.

Together these give about 4,400 scored forecasts a year instead of about 72. In simulation, a genuinely skilled forecaster was confirmed with 82% probability after 12 months, versus 11% from P&L alone, and unskilled forecasters were falsely flagged in at most 3% of runs.

### 5.3 What may change, and when

| Tier | What changes | How often | Who decides |
|---|---|---|---|
| 1 | State estimates (drawdowns, moving averages, CAPE, IVs), cost/slippage estimates, and probability recalibration maps (gated Platt scaling from 150 resolved questions per family) | Monthly, automatic, bounded step | Deterministic rule engine |
| 2 | Parameters inside pre-approved ranges (thresholds, κ, attention weights) | ≤2 proposals a month; ≤1 change per parameter per quarter; needs a forward shadow A/B test (≥3–6 months, P(better) ≥0.95 under a skeptical prior) and 3 months' probation with auto-rollback | Rule engine |
| 3 | Structural changes: new archetype, new instrument, prompt or model change | ≤1 a quarter; incubation, then probation | Rule engine plus your PR approval |
| 4 | Risk limits, objective, evaluator, change policy | Never automatically | **You only** |

**Guardrails** (tracks 03, 10):

- no risk increase for 2 months after an unusually good month;
- no strategy change while the drawdown is inside its 95% band;
- retirement only on thesis invalidation or a pre-registered sequential test, never on a drawdown alone;
- more than 5 parameters changed in 12 months triggers your review of the whole constitution;
- any LLM model upgrade is treated as a new, uncalibrated forecaster.

### 5.4 The monthly run (condensed from track 10 §6b)

1. Freeze the evaluator and verify the ledger's hash chain.
2. Refresh data.
3. Mark positions to market using your *actual* fills, plus paper fills for the shadow book.
4. Resolve every forecast that is due.
5. Compute the metrics:
   - log-score difference against **real-world** market probabilities, clustered by month;
   - reliability tables;
   - κ (realized vs predicted edge);
   - P&L with PSR and DSR.
6. Write post-mortems for each closed trade: grade the decision blind first, then reveal the outcome.
7. Allow at most 2 change proposals, red-team them with a separate reviewer model, and let the rule engine decide.
8. Email the report: failures first, P(11× by your date), and the ledger head hash.

### 5.5 Phasing

- **v1 (build now):**
  - hash-chained ledger;
  - sub-forecasts and shadow book;
  - Brier and log scores with reliability tables;
  - κ update;
  - Tier 1 recalibration;
  - the monthly report email.
- **v2 (months 3–6):**
  - calibration gym;
  - separate reviewer model;
  - e-process evidence meters;
  - forward shadow A/B tests for Tier 2 changes;
  - Thompson-sampling attention weights.
- **v3 (once there is enough data):** gated Platt maps per question family (from 150 questions) and isotonic maps (from 1,000).

---

## 6. Architecture v1 (track 09)

```
 GitHub Actions (private repo), America/New_York
   ├─ 22:17 Mon–Fri  daily scan
   │     ingest (yfinance, CBOE, SEC EDGAR, FRED, FINRA, Kraken/Coinbase, Kalshi/Polymarket, calendars)
   │       → point-in-time snapshot (hashed)
   │       → deterministic screens (the constitution's rules)
   │       → LLM triage (Sonnet 5.5, web search for news)
   │       → LLM judge + writer (Opus 5.5; numbers only via {{placeholders}})
   │       → risk gate + sizing + number validator (deterministic; the LLM cannot override)
   │       → email via Resend (+ one GitHub issue per trade for logging your fills)
   │       → ledger append (hash chain) → healthchecks.io ping
   ├─ 08:47 Mon–Fri  pre-market check: re-price open recommendations; email only on invalidation
   └─ 07:13 on the 1st  monthly calibration → report email → PR for anything beyond Tier 1
 Optional: a monthly Claude Code routine acting as "engineer", opening improvement PRs that you merge.
```

**Key properties**

- **The data layer computes every number.** A validator rejects any email containing a number that isn't in the snapshot. In track 09's self-test it caught a changed close price and an invented "18%".
- **Trading access.** No broker write access; you execute every trade.
- **Your fills.** You record them by commenting `filled 98 @ 224.10` or `skipped` on the trade's GitHub issue.
- **Email.** Resend's free tier can send from `onboarding@resend.dev` to your own sign-up address with no domain setup. An idempotency key prevents duplicate alerts. SMTP is not used: it is blocked in cloud sessions.
- **Cost.** About $5–15 a month in the base case, at most about $35 (Claude API). A paid data upgrade is +$30–100 a month and is recommended before trading real size.
- **Known fragilities.**
  - yfinance breaks often, so no order-ticket price may rely on a single unofficial source.
  - FRED now serves only about 3 years of the ICE credit-spread history, so the tool archives daily copies.
  - The Yale Shiller file stopped updating in 2023.
  - Continuous futures tickers roll silently (tracks 08, 09).

---

## 7. Worked example: the email the system would have sent on 20 March 2020

This replays a real moment using only information available at the time; the base rates use pre-2020 data only (`code/00-synthesis/example_base_rates.py`). **It is an illustration of the format, not a recommendation.** Assumptions:

- An illustrative $250,000 portfolio after the crash: core index 60%, tranche 1 (bought 13 Mar) 6%, T-bill reserve 34%.
- March 2020 was a normal-valuation regime (CAPE 24.8), so the −20% tranche had already fired on 12 March.

```
Subject: [TRADE #002] BUY 98 SPY — crash tranche 2 of 4 — stress loss 5.9% — act Mon 23 Mar

┌──────────────────────────────────────────────────────────────────────────┐
│ ACTION     BUY 98 shares of SPY (S&P 500 index fund) — tranche 2 of 4    │
│ SIZE       9.0% of portfolio ≈ $22,400 (15% of your core holding)        │
│ STRESS     If this becomes 1929 (−66% within 3 years): −$14,800 (−5.9%)  │
│ WINDOW     Place Mon 23 Mar. Skip if SPY is outside $205–$245.           │
│ ODDS       6 earlier times since 1928 the S&P first closed 30% below its │
│            high: 3 years later it was higher in 5 of 6 (median +15%);    │
│            worst −66% (1929). A new high came in 1.8–24.9 years.         │
│ CONFIDENCE Medium (rule-based; only 6 analogs)                           │
└──────────────────────────────────────────────────────────────────────────┘

IN ONE SENTENCE
US stocks are 32% below their February high. This adds a pre-planned amount
from your cash reserve and holds it until they regain that high or for five
years; it has worked in 5 of 6 comparable cases, but it can get worse first.

DO THIS
1. Any brokerage account. No options or margin needed.
2. SPDR S&P 500 ETF (SPY). Your usual S&P 500 or total-market fund is fine too.
3. BUY 98 shares, LIMIT order, day only. Limit = last price + $0.50.
   Do not chase above $245.
4. VIX is 66, so prices swing a lot: avoid the first 30 minutes after the
   open. Splitting the order in two (morning and afternoon) is fine.
5. Reply "filled 98 @ <price>" or "skipped" so the ledger is right.

HOW YOU GET OUT (DECIDED NOW)
- Hold until the S&P 500 closes above its old high of 3,386.15, or until
  20 March 2025, whichever comes first. You will get an EXIT email.
- No stop-loss. Crash buys failed historically when people sold in the
  second leg down; this tranche is sized so you can hold through a 1929.
- At −40% (S&P ≤ 2,031.69) and −50% (≤ 1,693.08) you will get ADJUST emails
  for tranches 3 and 4 (25% and 50% of your core holding, from the reserve).

WHY
The S&P 500 fell 31.9% in 22 trading days, the fastest bear market on record,
as COVID-19 shut down economies. The Fed cut rates to zero on 15 March and
launched emergency lending. Honest caveat: at −30%, history shows only a small
edge over buying at an ordinary time; the clearer edge appears at −40% and
deeper. The case for this tranche is that the reserve was set aside for exactly
this, prices are 32% lower than a month ago, and a pre-committed plan beats
deciding in a panic.

THE ODDS (reference class: first close ≥30% below the high, 1928–2019)
  Entry      21 months later   3 years later   Years to new high
  Oct 1929        −33%             −66%             24.9
  May 1970        +39%             +40%              1.8
  Jul 1974        +24%             +20%              6.0
  Oct 1987        +49%             +39%              1.8
  Sep 2001         −3%              +9%              5.7
  Oct 2008         −3%             +10%              4.5
Our forecasts (illustrative; shrunk toward base rates, logged for scoring):
  S&P higher on 20 Mar 2021: 62% · higher on 20 Mar 2023: 78%
  new all-time high by 20 Mar 2025: 55% · touches −40% first: 35% · −50%: 15%

WHY NOT OPTIONS?
A 21-month at-the-money SPY call paid about 1.6–3.3× in 3 of these 6 episodes
and expired worthless in the other 3 (1929, 2001, 2008). At launch confidence
(edges shrunk by half, quarter-Kelly), it adds less to long-run growth than
buying the index outright, so the system uses the index.

WHAT WOULD PROVE US WRONG
- A financial-system collapse on the 1929–33 pattern (bank failures, credit
  seizing up): high-yield spreads > 15% and still widening after the Fed acts.
- The shutdowns lasting years rather than months.
(Neither is a reason to sell this tranche; both are reasons not to add
leverage, which the rules forbid anyway.)

RISKS
Total stock exposure after this trade: 75% of the portfolio (target 70–80%
during crash deployment). Tax: gains become long-term after 12 months.

YOUR PORTFOLIO AFTER THIS TRADE
Core index 60% · Tranche 1 6% · Tranche 2 9% · T-bill reserve 25%

Automated research generated for your personal use by an AI system; not
individualized advice from a licensed professional. You decide.
Trade T-2020-002 · archetype crash_tranche · constitution v0.1 ·
data as of 2020-03-20 21:00 UTC (^GSPC, SPY, ^VIX) · ledger head 9f2c…
```

**What actually happened.**
- SPY closed at **$222.95 on 23 March 2020, the exact bear-market low**. That was luck, not skill.
- The S&P 500 made a new all-time high on **18 August 2020**, which triggered the EXIT email at SPY $338.64:
  - tranche 2: **+51.9%**, adding about **+4.7%** to the whole portfolio;
  - tranche 1: +25.7%.
- A 21-month call would have returned about 6.5× (approximate pricing).
- This was the best branch of the reference class. The same email in October 1929 would have been followed by a further −66% within three years.
- The system is designed to survive that branch, not to predict which branch comes.

---

## 8. Limitations and risks (read before trusting any of this)

- **Samples are small and flattering.**
  - The US market is history's survivor.
  - Crash rules rest on 5–12 US episodes. Bitcoin rules rest on 3–4 cycles, with multiples decaying about 10× per cycle.
  - The multibagger data covers only stocks that survived.
- **Many option results are modelled.** Black-Scholes from VIX and skew was used where no historical quotes were available. The signs are robust; the levels are not (track 04).
- **Current-environment facts** come partly from web summaries during a shared search budget that ran out. The tool must verify them from primary sources before any email cites them (track 08 §7.5).
- **LLM risks** include look-ahead leakage, rationalization, reward hacking, sycophancy and drift. They are handled by separation of powers, a frozen evaluator, blind post-mortems and a change budget (track 10 §5.6). None of these controls is perfect.
- **Nothing here is individualized financial advice.** The system is research for your personal use, and you remain the decision-maker. Sending its recommendations to other people could make it regulated investment advice (track 09).
- **Every sleeve can lose money.** The index core has had 55–84% drawdowns historically.

---

## 9. Verified in this session vs to re-check at build time

- **Verified from data in this container:** market levels and drawdowns, the backtests, VIX/VRP statistics, Fama-French factor decay, the bootstrap simulations, option chains on 28 Sep, data-source reachability, and the email-validator self-test.
- **To re-check against primary sources:**
  - details of the Iran war and Hormuz traffic;
  - Oracle's rating and CDS; private-credit default rates; BofA Fund Manager Survey details;
  - Polymarket US status by state;
  - the broker-by-broker rollout of the FINRA PDT rule change (the SEC approved its replacement on 14 Apr 2026, effective 4 Jun 2026, with phase-in to Oct 2027);
  - a few paper magnitudes cited from memory (flagged in tracks 01, 02 and 10).

---

## 10. Decisions needed before building

1. **Scope of capital.** Should the system manage (a) your whole investable portfolio (core + reserve + sleeves), or (b) only a separate risk-capital pot, with no core? And how much, roughly? Sizes in emails are computed from this.
2. **Risk preset.** P(11×) and drawdown figures are 20-year, historical / muted, from track 03.

   | Preset | Leverage | Trend switch | P(11×) | Drawdowns | Status |
   |---|---|---|---|---|---|
   | Conservative | 1.0× | On | Lower | Lower (max about −48% historically) | |
   | **Growth** | 1.0× | Off | ≈30% / 9% for the index core | Accepts −50%+ | Recommended default |
   | Growth+ | Governed core up to 1.5× | n/a | ≈39% / 14% | Never −50%; cash-locked after deep falls | |
   | Aggressive / goal-seeking | Higher | n/a | Higher | Matching probability of near-total loss | Not recommended |

3. **Instruments and accounts you can use.**
   - US stocks and ETFs;
   - listed options (level needed: long calls/puts and debit spreads);
   - crypto (spot ETF or exchange);
   - futures;
   - prediction markets (depends on your state);
   - account type: taxable, IRA/401k, or both.
4. **Jurisdiction.** Country and US state, if any. Tax rules, product access (e.g., EU investors can't buy US ETFs) and prediction-market legality all depend on it.
5. **Runtime and email.**
   - GitHub Actions + Resend (recommended). This needs the Claude GitHub App to have access to `sol008/testProject`; pushes are currently refused.
   - Or Gmail API instead of Resend.
   - Optionally, a monthly Claude Code routine for improvement PRs.
6. **Accounts and keys you would create** (track 09 §9.5):
   - an Anthropic API key with a spend limit;
   - a Resend key (sign up with the inbox that should receive alerts);
   - free FRED, CoinGecko Demo and Alpha Vantage keys;
   - a healthchecks.io account;
   - the repo made private.

---

## Appendix A — How conflicts between tracks were resolved

| Topic | Positions | Resolution in v0 |
|---|---|---|
| Leverage | Track 01: veto above 1.0×. Track 02: ≤2× with a trend filter, opt-in. Track 03: 1.0× at launch, ≤1.3–1.5× only governed. Track 04: ≤2× vol-scaled. Track 06: up to 2× during crash tranches, only after the index recovers above its 200-day average | **1.0× at launch.** Leverage is a user-chosen preset (§10) with the drawdown governor. Crash tranches use reserve cash, not margin |
| Crash thresholds | Track 01: −30/−40/−50 or VIX ≥45, in thirds. Track 02: −20/−30/−40. Track 06: −20/−30/−40/−50 at 10/15/25/50%, with the valuation filter tested out of sample | **Track 06's schedule** (the only one tested on 36 markets), with its expensive-regime branch. VIX ≥45 as a small add-on |
| Convexity sleeve | Track 01 R14: buy puts or VIX calls when the VIX is low and a catalyst is visible. Track 04: every put and volatility rule lost money, complacency-timed puts about −97% | **Off at launch** (track 04 has the direct test). A hedge only on explicit request, ≤1–2% a year, logged as negative-EV insurance |
| Trend switch on the core | Track 02: needed only when levered. Track 06: recommended as a risk switch; it lags in bull markets (−2 points a year after 2007) | **A preset.** Off at 1.0× (fewer trades, higher expected return); required with leverage |
| Concurrent positions / trades a year | Track 08: ≤3 concurrent. Track 01: 3–8. Track 02: ≤12 a year. Track 03: ≤2 a month, ≤24 a year | **≤3 concurrent S3 positions, target ≤12 a year, hard cap 24** |
| Per-trade loss caps | Track 08: 1.5% of premium per options trade. Track 04: 3%. Track 03: 2% stop-based / 3% defined premium. Track 01: 0.5–5% by archetype | **Track 03's global caps**, with track 01's archetype caps inside them; lottery-type 0.5–1% |
| Crypto | Track 02: ≤5–10% with a 20-week MA. Track 06: ≤5% with cycle rules. Track 07: BTC (+ETH) only | **≤5%, BTC-first, cycle and drawdown entries, no leverage** |
| Single stocks | Track 07: a 20–30-name sleeve only if proven. Track 02: insider buys only after our own test | **Incubator only at launch** (conflicts with "few trades"; unproven) |
| Bitcoin halving timing | Track 06: halving-window entries won all 4 cycles, but gains fell about 10× per cycle. Track 08: a cycle-trough window of about 4 Oct–16 Nov. Track 05: 4 cycles with shrinking amplitude (1.9× peak this cycle); do not encode as a rule | **Context only.** Entries on valuation-like signals (200-week average, deep drawdown); exits on trend break or a pre-set multiple |
| Crisis deployment budget | Track 06: equity crash tranches draw 10–50% of core notional. Track 05: credit-crisis buy 15–30% of the portfolio | **Both draw from the S0 reserve.** When both fire, the rule engine splits the reserve in proportion to each module's remaining allocation, subject to the drawdown governor |

## Appendix B — One-line summaries of the tracks

- **01** — 67 great trades and 35 blowups. The biggest wins had capped downside; the blowups didn't. Crisis buying is the most reliable few-decision edge, and a modest one.
- **02** — Only the equity premium is large and robust; anomalies halve after publication. Retail over-trading destroys returns. Unlevered +1000% is a 20-year outcome.
- **03** — Kelly and ergodicity math. The objective is log growth under a trade budget and hurdle, with quarter-Kelly on shrunk probabilities and a drawdown governor. Report P(11×) honestly.
- **04** — Options are overpriced 86% of days. Long-dated calls work only through drift. Puts and volatility lose. Buy time, not strikes; no 3× for years.
- **05** — Special situations are mostly small-edge, crash-correlated trades. Useful only as trigger-gated modules: credit-crisis buy, stablecoin depeg, crypto basis, selective merger arb. Prediction markets are well calibrated after fees; long shots lose more than 60%.
- **06** — Crash-buying works as an add-on at 1×; 3× is ruinous. The valuation filter works out of sample. The trend switch controls drawdowns, not returns. Bitcoin cycles are decaying.
- **07** — 10-baggers are about 1 in 250–350 stocks over 5 years. Predicting them means picking lottery tickets. Winners fell 56% (median) along the way.
- **08** — The 28 Sep 2026 regime, a 30-gauge dashboard, armed triggers, the catalyst calendar, and data-hygiene traps.
- **09** — GitHub Actions + Claude API + Resend, about $5–35 a month; the validator pattern; the regulatory and tax constraints; the accounts to create.
- **10** — Why P&L can't teach a few-trade system; the forecast and shadow-book evidence engine; the guarded change process; the LLM-specific controls; the ledger schema.
- **11** — The per-trade email format.
