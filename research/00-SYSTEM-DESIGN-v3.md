# System design v3 — the 1–60 day trade system (what will be built)

*28 September 2026. This design follows your decisions in `DECISIONS.md`: trades are realized within 1–60 days, the system paper-trades first, it may use US stocks and ETFs, listed options, futures, a Bitcoin ETF and crypto, and it runs on GitHub Actions with the Gmail API.*

*It draws on the second research round (tracks `13`–`18`) and keeps the long-horizon findings in `00-SYNTHESIS.md` (rev. 2) as background. Nothing is built yet; §12 lists what I need from you first.*

---

## 0. The short version

1. **Short horizons give up most of the stock market's return.** Most of what stocks pay comes from holding them for years; a book that must be flat within 60 days forfeits nearly all of it.
   - Example: the best short-horizon rule, run alone on 2008–2026, earned about **4.7% a year** (T-bills + 3.3 points) with a −14% worst drawdown. Buying and holding SPY earned 11.3% with −52% (track 13).
2. **Across tracks 13–17, about 2,900 rule variants and test cells were tried. A handful survived, and every survivor is small.** Each test used data before 2008 to design a rule and data after 2008 to test it, then corrected for how many variants were tried.
   - **Uptrend dip-buy.** Buy the S&P 500 after a short, sharp dip while it is still above its 200-day average and the VIX is at least 20. About 4 trades a year.
   - **Slow multi-asset trend.** Hold 8 markets in the direction of their 12-month trend, re-decided monthly. Sharpe about 0.3–0.6 since 2008.
   - **Crash call spread.** An options bet on a rebound after a crash; it only ties with buying the index but caps the loss.
   - **A few macro-event rules**, and a slow Bitcoin trend switch that controls losses rather than adding return.
   - **Everything else failed** after publication or out of sample: fast trend, calendar effects, overnight trades, sector rotation, crypto timing rules, and every event-driven single-stock setup. The market now prices public filings within about one trading session (track 16).
3. **Realistic expectation: T-bills (about 4.2%) plus roughly 0.5–3 points a year, before tax, with drawdowns around 10–15%.**
   - The lower end is the lean book, the upper end the full book (§6).
   - The paper phase exists to measure the real number. None of these edges is proven beyond doubt.
4. **"1000%" is not reachable with 1–60 day trades without risking ruin.**
   - At about 6–7% a year, 11× takes about 35–40 years.
   - Faster means leverage or concentration of a kind every track showed ends in wipe-outs.
   - If large long-run gains are the goal, the biggest lever is a long-horizon core held *outside* this system (rev. 2, §10). I'd recommend keeping one.
5. **What makes the system worth having** at these horizons:
   - it takes the few trades with measured edges, pre-committed and correctly sized;
   - it refuses the many trades that lose money (the never-list, §5);
   - it keeps an honest, scored ledger, which tells you within a year or two whether any of it works.
6. **Paper first, then live in stages** (track 18): at least 3 months and 30 paper trades; then live at 25% size, 50%, and full size, each stage gated by evidence.
7. **Cadence.**
   - Lean book: about 12 trades a year (about 24 emails).
   - Full book: about 30 trades a year.
   - Plus a monthly review email.
8. **Today (28 Sep 2026)** the dip-buy and event rules are armed but not firing.
   - The Bitcoin trend switch is on.
   - The multi-asset trend book is long S&P 500, Nasdaq-100 and the Australian dollar, and short 10-year Treasuries, the euro and the yen.
   - If paper trading started tomorrow, those two would open the first paper positions.

---

## 1. Your constraints and what they imply

| Decision | Implication |
|---|---|
| Realized within 1–60 days | This document reads "60 days" as **60 calendar days (≈42 trading days)** unless you say otherwise (§12). That shortens track 17's 60-trading-day crash rule and rules out rev. 2's multi-year tranches and the 12–24-month credit-crisis module. |
| Paper trading first | Every module runs on paper until it passes the go-live gates (§7). No real money until then. |
| Instruments: stocks/ETFs, options, futures, Bitcoin ETF, crypto | Account size decides what is feasible: <br>• put credit spreads on XSP (mini-SPX options) need ≳$110k per contract at the 3% loss cap; <br>• a diversified micro-futures book needs ≳$250k; <br>• MES (micro S&P futures) for the dip-buy needs a sleeve ≳$80k. <br>Below those sizes the system uses the ETF versions. |
| GitHub Actions + Gmail API | The daily run lands after 22:00 ET. **Entries are at the next open**, and every backtest here assumed that. Rules that need same-day action are excluded. |

---

## 2. What the second research round found

| Family (track) | Variants tested | Survivor | Verdict |
|---|---|---|---|
| Index/ETF short-term rules (13) | 533 | **ST-1** VIX-gated uptrend dip-buy. Since 2008: 3.8 trades a year, 82% winners, +0.88% per trade (+0.43% planning value after halving). Down 30–50% from pre-publication | **Include** (paper first) |
| Options and volatility (14) | 840 | **O2** crash call debit spread (+28% / +40% of debit before / after 2008; ties with the index). **O1** trend-filtered SPX put spread: thin, and the real-price CBOE indices show about zero alpha after 2008 | O2 **include**; O1 **paper only** |
| Futures and crypto (15) | ~300 | **R1** slow multi-asset trend: test-period Sharpe 0.42–0.58; live managed-futures funds 0.32–0.60; +17% in 2008 and +18% in 2022. **R2** slow crypto trend: cuts drawdowns, no significant alpha | R1 **include** (needs your §12 answer); R2 **include as a risk switch** |
| Event-driven single stocks (16) | 951 cells | None. Even insider clusters now earn +0.1% for a follower after the filing day | **Shadow ledger only** |
| Macro and geopolitical events (17) | 288 release tests + shock studies | **W10** uptrend crash day (+6.9% over 60 sessions, n = 21, p = 0.005). **W8** de-escalation equity call spreads. **W9** barrel-loss oil call spreads (as a hedge). "Buy the invasion", "sell the ceasefire" and release drifts failed | W8 and W9 **include (small)**; W10 **paper** (overlaps ST-1) |
| Execution, sizing and tax (18) | Simulations | Caps, gap multiples, the drawdown governor, next-open fills, account placement, the paper protocol | **Adopted as the portfolio rules** (§4, §7) |

---

## 3. The rule book v3

**Status labels:**
- **Live-eligible:** may go live after passing the paper gates.
- **Paper:** runs on paper until its own promotion test passes.
- **Shadow:** logged automatically, with no email and no LLM.

### M1 — ST-1: VIX-gated uptrend dip-buy (live-eligible). Source: track 13, §11.1.

- **Signal** (after the close, on two-source-checked data):
  - SPY closes above its 200-day average;
  - RSI(2) (Wilder smoothing) is below 10;
  - VIX closes at 20.00 or higher.
- **Entry.** Market-on-open (MOO) buy of SPY. In a taxable account with a sleeve of ≳$80k, use MES.
- **Exit.** A MOO sell the morning after the first close above SPY's 5-day average. Time stop at the close of session 20. No stop-loss.
- **One position at a time.** Never hold the same dip in SPY and QQQ/IWM together.
- **Size.** Notional = min(0.5 × the sleeve, **6% of the portfolio**) × G(D). A 33% gap would then cost 2% of the portfolio.
- **Planning expectation.**
  - 3–4 trades a year (range 0–8), about 80% winners;
  - +0.43% per trade, held about 3 sessions;
  - contribution about **+0.1% a year** on the whole portfolio at 6%.
  - It is small because the cap binds. §12 asks whether you want the larger size its edge would support.
- **Exceptions, with reasons.**
  - It is exempt from the 5-day minimum hold: it was backtested on next-open fills.
  - It is exempt from the "no new crash-correlated positions when VIX > 30" freeze: its best trades come at VIX > 25.
  - It is sized by gap stress rather than a defined maximum loss, because the option version lost money.

### M2 — R1: slow multi-asset trend book (live-eligible; depends on your §12 answer). Source: track 15, R1.

- **Markets.**
  - Portfolio ≥$250k (micro futures): MES, MNQ, micro 10-year yield, MGC, MCL, M6E, JPY, M6A.
  - Below $250k (ETF8): SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA.
  - Long-only if shorting isn't possible (test Sharpe 0.45).
- **Signal.** Sign of the 252-day excess return, optionally averaged with the 126-day sign. Evaluated at the first close of each month; executed the next session. Never use lookbacks under 6 months.
- **Size.** Per market, (3.5% ÷ 60-day EWMA volatility) × NAV × **0.5**, giving about 5% book volatility. Gross ≤3× NAV, one market ≤1× NAV, margin ≤25% of NAV.
- **Planning expectation.**
  - Sharpe about 0.3 forward;
  - **+0.6% to +1.4% a year** of log growth;
  - worst month about −4.5%, max drawdown about −11%;
  - it tends to gain in crises;
  - 12 rebalance emails a year.
- **The 60-day question.** Each position is re-decided every month, but a continuing position is *not* closed, so a trend can be held for many months. With futures, P&L settles in cash daily; with ETFs it stays unrealized. §12 asks whether that meets your rule.
- **Review / pause.** Review at a 20% book drawdown. Pause to shadow if the rolling 36-month Sharpe falls below −0.5.

### M3 — R2: crypto trend switch for a ≤3% Bitcoin sleeve (live-eligible; risk control, not alpha). Source: track 15, R2.

- **Signal.**
  - BTC: close above its 50-day average, or weekly close above its 10-week average.
  - ETH: 28-day momentum above 0.
  - Never use 7–20-day rules, which lost 3–16% a year after 2021.
- **Instrument.** IBIT (in an IRA) or CME micro Bitcoin futures (taxable, ≥$50k). Spot only on a US-regulated venue with fees ≤0.25% per side.
- **Size.** The sleeve is ≤3% of the portfolio. Held only while the switch is on; T-bills otherwise.
- **Holding.** Closed at 60 days and re-entered if still on. On futures, the monthly roll does this.
- **Planning expectation.** About 5 switches a year; +0.3–0.5% a year; Bitcoin's worst month roughly halved.

### M4 — O2: crash call debit spread (live-eligible). Source: track 14, §7.

- **Signal.** SPX is ≥15% below its 252-day high **and** VIX ≥30. First day only, then a 60-day cool-down.
- **Trade.** Buy the at-the-money call and sell the 105% call, 60 DTE, on XSP/SPX (SPY if necessary). Limit at mid + ¼ of the natural width.
- **Size.** Debit ≤2% of the portfolio (3% cap).
- **Exit.** Hold to expiry. Optional take-profit when the spread is worth ≥80% of its width.
- **Planning expectation.** About 0.7 a year, clustered in crises. +28–40% of the debit per trade on average; 1 in 4 lose the whole debit. Contribution about +0.3–0.6% a year (n = 26, wide).

### M5 — Macro-event rules. Source: track 17, §7.

- **W8 — De-escalation, confirmed** (live-eligible, small).
  - Trade: the next morning, SPY/XSP or DAL call spreads, 45–75 DTE, premium ≤1% of NAV.
  - Exit: at 80% of maximum value, or after 20 trading days.
  - Invalidation: Polymarket ceasefire odds below 40%, or oil retracing more than half its day-0 fall.
  - **Never an oil short after the fact.**
- **W9 — Escalation that removes barrels** (live-eligible, as a hedge).
  - Trade: USO call spread ≥45 DTE, premium ≤0.75% of NAV, 20-day time stop.
  - Only when ≥1 mb/d is physically lost with no quick fix, per IEA/EIA/company statements. A fear-only spike means no trade.
- **W10 — Uptrend crash day** (paper).
  - Signal: the first S&P close of −3% or worse (declustered over 20 sessions) with the prior close above its 200-day average.
  - Trade: buy SPY/MES at the next open, ≤6.7% of NAV. Hold **≤42 sessions** to fit your 60-day limit; the 42-session version must be re-tested before promotion.
  - It overlaps ST-1, so it shares ST-1's slot and runs on paper as the longer-hold comparison.
- **Scheduled releases (FOMC, CPI, payrolls).** Never trade into or after them for real money. They are logged for calibration only.

### M6 — Crypto structural modules (live-eligible, rare). Source: track 05.

- **Stablecoin depeg buy.**
  - Trigger: a regulated, fiat-backed coin trades ≤$0.97 on ≥2 venues, with attested reserves and redemptions not suspended for more than 72 hours.
  - Size ≤5%. Exit at ≥$0.995, or a 30-day time stop.
- **Cash-and-carry.** Only when the CME basis is ≥ T-bills + 6 points. Hold to expiry, ≤60 days. Currently off.

### M7 — O1: trend-filtered put credit spread (paper only). Source: track 14, §7.

- **Filters.** SPX above its 200-day average; VIX < 30; VIX/VIX3M < 1.0.
- **Trade.** Sell the 0.20-delta put and buy the put 5% lower, 40–50 DTE, on XSP/SPXW.
- **Exits.** A GTC buy-back at 50% of the credit; otherwise close at 21 DTE. No stop, and never roll a loser.
- **Size.** 2% of the portfolio at max loss (3% cap). Needs ≳$110k per XSP contract.
- **Promotion.** ≥24 paper trades passing track 14's §7.6 test.
- **Expected.** +0.2–0.3% a year after haircuts. It's a small harvest with rare −70% to −100% trades.

### Shadow ledger (automatic, no emails, no LLM)

- **Index and options variants:**
  - ST-1b (ST-1 without the VIX gate);
  - ST-2 (VIX/VIX3M inversion in an uptrend);
  - I1 (put spread after a volatility spike fades);
  - I2 (IBIT put spreads).
- **Event-driven single stocks:**
  - insider clusters (≥$300m market cap, 20-day hold);
  - special dividends (≥$1m daily volume);
  - activist 13D filings;
  - near-completion cash mergers.
- **Macro:**
  - W3 (cool-CPI TLT);
  - the gold spike fade;
  - every scheduled-release reaction.
- **Promotion.** Each has a pre-registered test in its track, e.g. insider clusters need ≥60 trades averaging ≥+1.0% with t ≥ 2.5.

---

## 4. Portfolio rules (track 18 §8, adopted)

| Rule | Setting |
|---|---|
| Idle cash | T-bills / a T-bill ETF (earning about 4.2%). Every trade must beat holding bills **and** buy-and-hold over its horizon |
| Growth hurdle | Δg per trade ≥ **6 bp** of expected log growth on the whole book, using the shrunk edge, after costs and T-bill drag. Rule-level Δg (trades per year × E ln(1 + f·r)) is reported for each module |
| Sizing | G(D) · min(0.25 × joint Kelly(κ·s), Kelly(s − 0.05), stress cap, cluster room, total room). κ = 0.5 for rule-based modules, frozen through the pilot, then updated quarterly |
| Stress (gap) multiples | ETFs and index futures 1.7×; large caps 2.1×; volatile stocks 2.6×; Bitcoin ETF 3.1×; spot crypto with 24/7 stops 1.5× |
| Caps | Per-trade stress ≤2% (stop-based) or ≤3% (premium); **cluster** stress ≤6%; **total open stress ≤10%**; option premium ≤10% |
| Clusters | US equity beta, duration, USD, oil ("peace/oil-down" is one factor in 2026), gold, crypto. ρ ≥0.5 within a cluster, ≥0.3 across long-risk clusters |
| Drawdown governor | G = 1 up to a 5% drawdown, falling linearly to 0.25 at 15%. Human review at 15%; pause new trades at 20% |
| Circuit breakers | A daily loss ≥2% or weekly loss ≥4% pauses new entries for 1 or 5 days pending a data/fill check |
| Trade budget | **Lean ≈ 12 a year, Full ≈ 30** (§12). Hard cap 100; ≤8 open positions; minimum hold 5 days, except for modules backtested on next-open fills |
| Option expiry (bought) | ≥ max(2 × planned hold, 45 DTE); close ≥10 trading days before expiry, unless it's a debit spread designed to be held to expiry (O2). Weeklies and 0DTE are banned |
| Accounts and taxes | Each underlying lives in exactly one account family. IRA: stocks, ETFs, equity-option spreads, IBIT. Taxable: Section 1256 instruments (MES, MNQ, XSP/SPX, CME Bitcoin futures) and direct crypto. Cross-account wash-sale guard (±30 days). No §475(f) election |

---

## 5. Never recommend (merged list)

Phase-1 vetoes (rev. 2 §3.9) remain, plus the short-horizon additions from tracks 13–18:

- **Timing and fast rules:**
  - overnight buy-close/sell-open programmes;
  - Donchian breakouts under 100 days, and trend lookbacks under 6 months;
  - sector or country rotation;
  - calendar trades (turn of month, pre-holiday, FOMC day, CPI day, OpEx, midterm Q4).
- **Options:**
  - options bought into scheduled events (FOMC, CPI, payrolls, earnings);
  - 0DTE, 1DTE and weeklies;
  - naked short options and short-VIX products;
  - short premium on single stocks or leveraged ETFs;
  - rolling a losing spread;
  - stops on defined-risk spreads;
  - iron butterflies and short straddles;
  - any spread whose max loss is >3% of the portfolio (i.e., accounts below ≈$100k for XSP).
- **Event and single-stock trades:**
  - chasing a filing after its first session;
  - post-earnings drift, earnings-gap or pre-earnings trades;
  - S&P or Russell index trades, and IPO lock-up shorts;
  - short-squeeze trades in either direction;
  - dividend capture;
  - FDA binary bets;
  - spin-offs in their first 60 days;
  - event trades under a $300m market cap or $1m daily volume.
- **Crypto:**
  - crypto calendar rules, crash-rebound buys, funding-rate and ETF-flow rules;
  - altcoin momentum and alt baskets;
  - stops tighter than the weekend-gap distribution.
- **Futures, FX and commodities:**
  - FX carry books;
  - standalone commodity carry;
  - long energy futures/ETFs in steep contango (front roll yield < −20% a year);
  - a diversified micro-futures book below ≈$250k;
  - reading triggers off continuous futures across a roll.
- **Macro:** oil shorts after a ceasefire headline; directional bets on scheduled releases when the system is within ±10 points of the prediction-market price.

---

## 6. Expected results, honestly

All figures are pre-tax planning values on the whole portfolio, over T-bills. They are shrunk from backtests, and the paper phase will measure them.

| Module | Trades a year | Contribution a year | Confidence |
|---|---|---|---|
| M1 ST-1 (6% cap) | 3–4 | +0.1% | Medium (it held in every 5-year block since 2008; post-publication decay) |
| M2 R1 trend (s = 0.5) | 12 rebalances | +0.6% to +1.4% | Medium (live funds confirm the order of magnitude) |
| M3 BTC switch (3% sleeve) | ~5 | +0.3% to +0.5% | Low-medium (a drawdown control; alpha not significant) |
| M4 O2 crash spread (2% debit) | ~0.7 | +0.3% to +0.6% | Low (n = 26) |
| M5 W8/W9 (small) | ~1–2 | ≈0 to +0.2% | Low (n = 5–17) |
| M6 depeg / basis | ~0.3 | ≈0 to +0.1% | Low (n ≈ 3) |
| M7 O1 (paper; ≥$110k) | ≤9 | +0.2% to +0.3% | Low (real-price alpha ≈0 after 2008) |
| **Lean book** (M1, M3, M4, M5, M6) | **≈12** | **≈ +0.7% to +1.5%** | |
| **Full book** (Lean + M2 + M7) | **≈30** | **≈ +1.5% to +3.2%** | |

- **With T-bills at about 4.2%,** that is roughly **5–7.5% a year nominal**, before tax. The worst drawdown should stay around 10–15% under the caps and governor.
- **Short-term gains are taxed as ordinary income.** Hence the account-placement rules.
- **Larger positions scale the edge and the risk together.** The ramp in §7 is the only sanctioned way to size up.
- **P&L alone can't confirm these edges quickly.** At about 30 trades a year, a real edge of this size takes years to show up in profits. Track 18's go-live test (P(edge > 0) ≥ 0.7 under a sceptical prior) is designed to be passable in 3–12 months by a real edge, while failing most false ones.

---

## 7. Paper trading and go-live (track 18 §8E)

1. **Paper phase.**
   - Minimum 3 months and 30 resolved trades; maximum 12 months (+6 by rule).
   - The "wide" paper book includes every trigger with Δg ≥ 0.
   - Fill model v1.0 is frozen and hashed:
     - stocks/ETFs at the next open plus slippage, with limits filling only when price trades through;
     - options at mid + 0.6 × half-spread, never beyond displayed size;
     - futures with tick slippage;
     - crypto with fees plus spread.
   - You may mirror trades in a broker practice account; its fills are compared with the model's.
2. **Go-live test** at months 3, 6, 9 and 12:
   - ≥95% of runs on time and 0 validator failures;
   - practice-vs-model fills within 10 bp (options: 20% of the half-spread);
   - **P(edge > 0) ≥ 0.7** under a N(0, 0.1²) prior;
   - no gross calibration bias (±20 points);
   - paper max drawdown < 15%.
3. **Ramp.**
   - Live at **25%** size.
   - **50%** after ≥6 months and ≥30 live trades with P ≥ 0.8.
   - **100%** after ≥100 resolved trades (paper at half weight) with P ≥ 0.9 and calibration verified.
   - Demote on the kill switches in each module.
4. **Honest limit.** Paper trading proves the machine works: data, signals, fills and emails. It cannot prove a small edge within a year. About 21% of go-lives will still have no edge, which is why the first live stage is small.

---

## 8. Calibration and self-improvement at short horizons (track 18 §8F)

- **Evidence.**
  - Three pre-registered, mechanically resolved forecasts per trade.
  - A deterministic daily shadow book of every trigger and near-miss, with base-rate forecasts and paper fills. No LLM calls.
  - Each module's realized results against its pre-registered range.
- **Monthly:** operations, execution quality, evidence meters, and the review email (failures first). No rule changes.
- **Quarterly:**
  - costs and slippage;
  - κ̂ (realized vs claimed edge);
  - calibration warnings and base-rate drift;
  - gated recalibration maps (≥150 forecasts per family);
  - go-live and ramp decisions.
  - At most one change per parameter per quarter, via a ≥3-month forward comparison.
- **Annually, with you:** calibration slope, retiring rules, and the hurdle and budget.
  - A rule's parameters change only if the change holds in **both** the pre-2008 and post-2008 samples, and clears the multiple-testing bar for the number of variants tried.
  - Nothing is ever "improved" from a good or bad month.

---

## 9. Emails at short horizons (changes to `11-trade-email-spec.md`)

- **Timing.** Evening emails (about 22:17 ET) carry orders for the next session: MOO entries for ST-1 and W10, and DAY limits at the ±1.5σ band edge for others.
  - Stocks, ETFs and futures use an **OTOCO bracket**: a stop-market order (GTC, never stop-limit) plus a GTC take-profit.
  - Options are entered after 10:00 ET with a limit ladder, and never with stop orders.
- **Every email is labelled PAPER or LIVE** and shows the module's status and stage (25% / 50% / 100%).
- **Exits.** Time-stop and invalidation exits arrive as EXIT emails the evening before; a gap never cancels a stop.
- **Stress line.** The dollar downside uses the gap multiple (§4), not only the stop distance.
- **Tax line.** It names the account the trade belongs in and whether it is a Section 1256 instrument.

---

## 10. Architecture and build plan

```
 GitHub Actions (private repo; America/New_York)
   22:17 Mon–Fri  daily run
      ingest → snapshot (hashed; two-source checks; explicit futures months)
      → deterministic modules M1–M7 + shadow book  (no LLM needed to decide)
      → sizing + caps + governor + wash-sale/account checks
      → paper broker (fill model v1.0) + ledger (hash chain)
      → Claude API writes the plain-English email from structured data only
         (numbers via {{placeholders}}; validator checks value AND slot)
      → Gmail API send (+ one GitHub issue per trade for your fills) → healthchecks.io ping
   08:47 Mon–Fri  pre-market: re-price open orders; EXIT/ADJUST email only if needed
   1st of month   monthly review; quarterly and annual jobs on their dates
 Event classification for W8/W9 (barrel loss vs fear; ceasefire confirmed): Claude with
 web search, citations required, and your one-click confirmation before any live trade.
```

**Build phases:**

- **A (≈1–2 weeks):**
  - repo scaffold; data adapters; snapshot and ledger;
  - modules M1, M3, M4 and M6, plus the shadow book;
  - sizing and caps; the paper broker;
  - the email renderer and number validator; Gmail sender;
  - GitHub Actions and healthchecks; tests.
- **B:** M2 (trend book, ETF8 first); M5 event rules with LLM classification; M7 (O1) on option-chain snapshots; the monthly and quarterly reports.
- **C (after ≥3 months of paper):** the go-live review with you.

**Cost.** About $5–15 a month for the Claude API (few emails; deterministic modules need no LLM), plus the free data stack. A paid data source (+$30–100 a month) is recommended before real money.

---

## 11. State of the rules on 28 Sep 2026 (tracks 13–17)

| Module | State | Distance to trigger / notes |
|---|---|---|
| M1 ST-1 | Not firing | Needs SPY RSI(2) < 10 (a close ≤ ≈$757.6, −1.05%) **and** VIX ≥ 20 (now 16.1) |
| M2 R1 trend | Positions on | Long S&P 500, Nasdaq-100, AUD; small longs in gold and crude; short 10-year Treasuries, EUR, JPY (a monthly re-decision on the first trading day of October) |
| M3 BTC switch | On | 50-day rule long since 18 Aug at $64.7k; BTC at about $83.5k |
| M4 O2 | Armed | Needs SPX −15% from its 252-day high and VIX ≥ 30 |
| M5 W8/W9/W10 | Armed | Ceasefire holds to 31 Oct: 55.5% (Polymarket); Fed hike 28 Oct: 69–70% (Kalshi); W10 armed while SPX is above its 200-day average |
| M6 depeg / basis | Off | Basis 4.9–5.3% vs a ≈10% trigger |
| M7 O1 (paper) | Filters pass | Would be a paper trade only (XSP needs ≳$110k) |
| **Data trap** | n/a | Brent's November contract expires **30 Sep**: "front-month Brent" drops about 7% mechanically. WTI does the same around 20 Oct. Triggers use explicit contract months |

**Catalysts in the next 60 days:**

| Date | Event |
|---|---|
| 2 Oct | Payrolls |
| 14 Oct | CPI |
| 27–28 Oct | FOMC |
| 29–30 Oct | BoJ and ECB |
| 3 Nov | Midterms |
| About 17–19 Nov | Nvidia results |
| 11 Dec | Government funding expires |

---

## 12. Decisions needed before building

1. **What "realized within 60 days" means.**
   - Calendar days (default) or trading days?
   - May a trend position that is re-decided monthly stay open longer (M2, and M3 on futures)? Or must every position be closed within 60 days?
2. **Lean or Full book.** About 12 trades a year for +0.7–1.5 points over T-bills, or about 30 trades a year for +1.5–3.2 points.
3. **Paper notional.** Use the size you'd actually trade; it decides which instruments are feasible (§1).
   - Default: **$100,000**. That excludes O1 and the micro-futures book, and uses ETFs.
4. **ST-1 size.** The default 6% cap limits a 33% gap to −2% of the portfolio, but uses only a fraction of its edge. Up to about 13% notional would clear the growth hurdle, at a −4% stress.
5. **Go-ahead to build Phase A.**
6. **Still open from before:**
   - country / US state;
   - account types (taxable, IRA);
   - Claude GitHub App access to `sol008/testProject`, needed for GitHub Actions and for pushing from cloud sessions;
   - a long-horizon core outside this system.
