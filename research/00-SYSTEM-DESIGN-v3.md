# System design v3.2 — the 1–60 day trade system (what will be built)

*29 September 2026. Revision 3.2 makes every trade placeable by a typical retail trader in the Robinhood or Coinbase app (§3a, from `20-executability-check.md`) and records your decisions (§12). Revision 3.1 fixed the red-team findings in `19-red-team-v3.md`; Appendix A maps each fix.*

*It follows your decisions in `DECISIONS.md`: trades realized within 1–60 days; paper trading first; US stocks and ETFs, listed options, futures, a Bitcoin ETF and crypto; GitHub Actions with the Gmail API.*

*The research behind it is tracks `13`–`18`. The long-horizon synthesis (`00-SYNTHESIS.md`, rev. 2) is background. Nothing is built yet; §12 lists what I need from you.*

---

## 0. The short version

1. **Short horizons give up most of the stock market's return.** Most of what stocks pay comes from holding them for years; a book that must be flat within 60 days forfeits nearly all of it.
   - The best short-horizon rule, run alone on 2008–2026, earned about 4.7% a year (T-bills + 3.3 points), with a −14% worst drawdown.
   - Holding SPY earned 11.3%, with a −52% worst drawdown (track 13).
2. **About 2,900 rule variants and test cells were tried in tracks 13–17. A handful survived, and all are small.**
   - Each track designed its rules on an earlier period and tested them on a later one: 2008 for most, 2016 for events, 2021 for crypto. Track 17 used placebo tests.
   - **None of the survivors clears a strict multiple-testing bar on post-2008 data alone.** They are kept because they also have pre-2008 or century-long evidence and a plausible mechanism, and, for the trend book, confirmation from live funds.
3. **Realistic expectation: T-bills (about 4.2%) plus roughly 0–2 points a year before tax.**
   - Central estimates are about +0.25 points (Lean) and about +0.85 points (with the trend book), so about 4.45–5.05% a year in total (track 21's re-estimate, after the crash call spread's next-day re-run; v3.2 said +0.4 and +1).
   - Drawdowns should stay around 10–15%.
   - The paper phase exists to measure the true number.
4. **"1000%" is not reachable with 1–60 day trades without risking ruin.**
   - At 5–6% a year, 11× takes about 40–50 years before tax, and 55–80 years in a taxable account.
   - The biggest lever for large long-run gains is a long-horizon core held *outside* this system (rev. 2 §10).
   - With this system's central excess of +0.25 to +0.85 points a year, that decision matters more than any other in this document.
   - Loosening the 60-day cap to 90 days would add ≈+0.2 points; 120 days adds nothing more (track 21).
5. **What makes the system worth having:**
   - it takes the few trades with measured edges, pre-committed and correctly sized;
   - it refuses the many that lose money;
   - it keeps an honest, scored ledger, so you learn whether any of it works.
6. **Paper first, then live in stages.**
   - Going live at 25% size is gated on operations: the system runs, fills are realistic, emails are handled.
   - Growing to full size is gated on evidence. At 10–30 trades a year, that takes years: about 4–5 with the trend book, about 9 without.
   - This is a slow, honest system, not a fast one.
7. **Cadence.**
   - Lean book (M1, M3, M4, M5, M6): about 10–17 trades a year on average, and 5–11 in calm years, mostly Bitcoin switches.
   - Adding the trend book (M2) adds 12 monthly rebalances.
   - A monthly review email on top.
8. **Today (29 Sep 2026)** the dip-buy and event rules are armed but not firing. The Bitcoin switch is on. The trend book would open long SPY, QQQ and FXA, with small gold and crude longs, plus shorts in 10-year Treasuries, EUR and JPY where shorting is allowed (§11).

---

## 1. Your constraints and what they imply

**"60 days".** This document reads it as **60 calendar days (≈42 trading days)** until you decide (§12.1). The two readings differ in what they allow:

| Module | Calendar days | Trading days |
|---|---|---|
| W10 crash-day rule | Shadow only (p ≈ 0.18 at 42 sessions) | Paper at 60 sessions (p 0.006) |
| M2 trend book | Continuing positions need your approval; forced 60-day round trips cost ≈0.2–1.4% a year in ETFs, plus wash sales | Same question |

**Paper first.** Every module runs on paper until it passes the gates (§7).

**Instruments and account size.** Feasibility thresholds, corrected:

| Instrument | Needed for | Minimum portfolio |
|---|---|---|
| MES (micro S&P futures) | M1 | ≈$650k |
| MES | W10 | ≈$580k |
| MBT (micro Bitcoin futures) | M3 | ≈$280k |
| Micro-futures trend book | M2 (at s = 0.5) | ≈$800k |
| XSP put spread | O1 | ≈$162k (at its 2% target) |
| One XSP call spread | O2 | ≈$100k |

Below these sizes the system uses SPY, IBIT and ETFs.

**GitHub Actions + Gmail API.**
- Emails go out after about 22:17 ET, so **entries are at the next open**; options use the 10:00–10:30 ET market-hours snapshot.
- Several modules were backtested at the signal-day close (O2, O1, W8–W10) or the next close (M2, M3). **Each must be re-run on the next-open basis before promotion.**
- **O2 must be re-run with a next-day 10:00 entry before M4 ships.**
- Checks so far: W10 is unaffected (first night −0.11%), and W8 keeps about 89% of its edge.

---

## 2. What the second research round found

| Family (track) | Tested | Survivor, with honest evidence | Verdict |
|---|---|---|---|
| Index/ETF rules (13) | 533 variants | **ST-1** (VIX-gated uptrend dip-buy).<br>• Since 2008: 3.8 trades a year, 82% winners, +0.88% per trade.<br>• Positive in every 5-year block.<br>• Deflated Sharpe probability 0.64 (N = 533), 0.82 (N = 36 families).<br>• 30–50% weaker than before publication. | Include (paper first) |
| Options and volatility (14) | 840 variants | **O2** (crash call spread): +35% of debit per trade, but the 26 trades are only 12 crisis episodes. Ties with the index.<br>**O1** (put spread): deflated Sharpe probability ≤0.10; real-price alpha ≈0 after 2008. | O2 include, pending the next-day re-run; O1 paper only |
| Futures and crypto (15) | ≈300 | **R1** (slow multi-asset trend): test Sharpe 0.42–0.58. Live funds range −0.01 to 0.60 (median ≈0.3). Fails Bonferroni alone, but +17% in 2008 and +18% in 2022.<br>**R2** (Bitcoin switch): alpha t ≤ 1.34; a risk switch. | R1 include (vehicle choice, §12.2); R2 include as a risk switch |
| Event-driven single stocks (16) | 951 cells | None. An insider-cluster follower earns +0.1% gross, −1.1% after costs. | Shadow ledger only |
| Macro events (17) | 288 release tests + shocks | **W10** (crash day): p 0.006 at 60 sessions (best of 8 cells; 1928–89 p 0.28); p 0.18 at 42.<br>**W8** (de-escalation call spreads): κ 0.25, n = 17.<br>**W9** (barrel-loss oil): n = 5. | W8 include (small); W9 paper; W10 per §12.1 |
| Execution and sizing (18) | Simulations | Portfolio rules, the fill model, the gates | Adopted (§4, §7) |

---

## 3. The rule book

**Status labels:**
- **Policy module:** a pre-registered rule you approve. It is exempt from the per-trade growth hurdle and the "beat buy-and-hold" test (§4), but keeps its own caps and kill switches.
- **Paper:** runs on paper until it passes its own promotion test.
- **Shadow:** logged automatically, with no email and no LLM.

### M1 — ST-1: VIX-gated uptrend dip-buy (policy module)

- **Signal** (after the close, on two-source-checked data):
  - SPY closes above its 200-day average;
  - RSI(2) (Wilder smoothing) is below 10;
  - VIX closes at 20.00 or higher.
- **Entry.** Market-on-open (MOO) buy of SPY. Use MES only when 6% of NAV covers one contract (≈$650k).
- **Exit.** MOO sell the morning after the first close above the 5-day average. Time stop: sell at the **open of session 21**, a market order queued the evening before (Robinhood has no market-on-close order). **No stop and no bracket.**
- **Venue.** Robinhood IRA, as a market order in dollars.
- **Size.** Notional = **6% of NAV × G(D)**. Stress = notional × the S&P's worst 10-session loss (−32.6%) ≈ 2% of NAV.
- **Expected.**
  - 3.8 trades a year (range 0–11), about 80% winners;
  - +0.43% per trade (halved);
  - **+0.05–0.10% a year** on the portfolio.
- **Why exempt.** At 6% it adds 2.6 bp per trade, below the 6 bp hurdle. Clearing the hurdle needs 14% notional, a 4.6% stress, which breaks the 2% per-trade cap (§12.4).
- **Minimum hold.** Exempt from the 5-day minimum hold, because its edge was measured on next-open fills.
- **Shadow.** ST-1b (the same rule without the VIX gate, about 8 a year) runs in the shadow book as the wider evidence set for M1.

### M2 — R1: slow multi-asset trend book (vehicle per §12.2)

- **Signal.** Sign of the 252-day excess return only; the 6-month blend is a Tier-2 annual change. Decided at the first close of each month; executed at the next open.
- **Vehicles below ≈$800k — choose one:**
  - **(a) Long-only ETF8** (SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA) in the IRA. Test Sharpe 0.45; it keeps some stock and bond beta; max drawdown ≈−12% at s = 0.5.
  - **(b) Long/short ETF8** in a taxable margin account, **only** at a broker that pays interest on short-sale proceeds, with that rate modelled in the paper fills. Without it, shorts cost up to ≈2.9% of NAV a year, more than the edge.
  - **(c) One managed-futures ETF** (e.g., DBMF or KMLM; live Sharpe 0.32–0.60) sized to about 5% volatility. It is a continuing position, which needs your §12.1 approval.
- **Size (a/b).** Per market, (3.5% ÷ 60-day EWMA volatility) × NAV × 0.5, giving about 5% book volatility.
  - Gross above 1.0× is an invariant change that needs your approval (§12.4).
  - Shorts have uncapped losses. They are allowed only inside M2, which is sized as a sleeve (below).
- **Stress and caps.**
  - M2 is **one sleeve**: its stress is the worst historical book month at the current s (≈4.5%), counted once.
  - At most 3% of that stress may sit in the US-equity cluster.
  - 4% of US-equity cluster room is reserved for M1, W10 and M4.
- **Units.** One monthly rebalance = one trade for the budget and the emails. M2 counts as one position for the ≤8-open cap. Its legs count individually for stress and cluster caps.
- **Chosen vehicle: (a) long-only ETF8 in the Robinhood IRA** (owner decision, 29 Sep).
- **No-trade band.** Skip any adjustment smaller than 25% of the leg's target or $300. That keeps a rebalance to ≤3 dollar market orders, and the paper backtest uses the same band.
- **Expected.**
  - **0 to +1.2% a year** via (a) or (c); negative for (b) without the short rebate.
  - A 5-year result below zero has a 25–37% chance.
  - It tends to gain in crises, which offsets M1, M3 and W10 exactly when they hurt.
- **Kill / review.** Review at a 20% sleeve drawdown. Pause to shadow if the rolling 36-month Sharpe falls below −0.5.

### M3 — R2: Bitcoin trend switch (policy module; opt-in sleeve)

- **Rule.** BTC only: weekly close above its 10-week average. That is 5.3 trades a year; max drawdown −48%; alpha t 0.24, so a risk switch, not alpha.
  - Alternative: the 50-day average (11.4 trades a year, alpha t 1.34).
  - ETH moves to the shadow ledger.
- **Instrument.** IBIT in the Robinhood IRA by default. Evaluated on the weekly close (the Sunday UTC daily candle) by the Sunday-night job; traded at Monday's open with a dollar market order.
  - Optional route: BTC on Coinbase, as a dollar market order, 24/7. It is taxable, so short-term gains are taxed as income.
  - MBT only when 3% of NAV covers one contract (≈$280k).
- **Size.** Sleeve ≤3% of NAV. Stress = sleeve × the worst 10-session loss.
- **Holding.** Continues while the switch stays on, re-decided every week. Decision 1 (§12) lets a re-decided trend position continue past 60 days, so there is no forced close and re-entry (clarified at build time, 29 Sep).
- **Exemptions.** From the 5-day minimum hold and from the "lookbacks under 6 months" ban (pre-registered exception).
- **Expected.** **−0.3 to +0.5% a year.** It is mostly Bitcoin beta: 2022 alone would have cost ≈1.6% of NAV.

### M4 — O2: crash call debit spread (policy module; Phase B)

- **Signal.** SPX ≥15% below its 252-day high **and** VIX ≥30. First day only; 60-day cool-down.
- **Trade.** Buy the at-the-money call and sell the 105% call, on the XSP expiry nearest to, but not beyond, 60 calendar days, in the **Robinhood taxable account** (Robinhood IRAs don't allow spreads). **Sell to close ≥1 trading day before expiration.** SPY is the fallback only if XSP fails liquidity.
- **Order.** One net-debit limit order placed after 10:00 ET at mid + 0.3 × the natural width, the same as the fill model. If it isn't filled by 11:00 ET, re-enter once at the stated maximum; otherwise skip.
- **Size.** Debit ≤2% of NAV, rounded to the nearest contract within the 3% cap. **Exempt from G(D)**: the premium is its maximum loss.
- **Before shipping.** Re-run on a next-day 10:00 entry, and add the 10:17 ET options job (§7).
- **Expected.** **+0.1 to +0.3% a year** (κ = 0.5; 12 crisis episodes; idle in about 60% of years). It must beat T-bills, not the index.

### M5 — Macro-event rules (track 17)

- **W8 — de-escalation confirmed** (policy module, small).
  - **Trigger:** all of track 17's mechanical conditions hold at the close:
    - an official announcement;
    - Brent (explicit December contract) or BNO down ≥6% on the day;
    - the Polymarket blockade-end or Hormuz-normal market up ≥15 points, or through 75%.
  - **LLM role:** it may only **veto** — pinned model version, hashed prompt, an enum answer with ≥2 allow-listed citations, logged before the open.
  - **Trade:** SPY/XSP or DAL call spreads, **56–75 DTE**, premium ≤1% of NAV. DAL legs must expire before DAL's next earnings.
  - **Exit:** at 80% of maximum value, or after 20 trading days.
  - **Invalidation:** the Polymarket market "US × Iran ceasefire continues through <first listed date ≥ the time stop>" falls below 40%; re-mapped by rule when that market resolves.
  - **Never** an oil short.
- **W9 — escalation that removes barrels** (paper, n = 5, unless you opt in to it as a hedge exception).
  - **Trigger:** ≥1 mb/d physically offline **and** front Brent/WTI up ≥5%. The LLM may only veto.
  - **Trade:** USO call spread, 56–75 DTE, ≤0.75% of NAV; 20-day time stop. The contango veto (R3) applies.
- **W10 — uptrend crash day** (per §12.1; its own paper slot, never blocking M1).
  - **Signal:** the first S&P close of −3% or worse (declustered over 20 sessions) with the prior close above its 200-day average.
  - **Trade:** buy SPY at the next open, ≤6.7% of NAV.
  - **Exit:** at day 42 or 60, or at a new all-time high. Void if VIX > 45.
- **Scheduled releases.** Never traded; logged for calibration only.

### M6 — Crypto structural modules → **shadow ledger only** (track 20)

Not executable on your venues:
- Coinbase has no USDC-USD market, because USDC converts 1:1.
- Cash-and-carry needs MBT futures, which only make sense above about $280k.

The rules below stay as shadow definitions.

- **Depeg buy.**
  - Trigger: a regulated, fiat-backed coin ≤$0.97 on ≥2 venues, reserves attested, redemptions not suspended for more than 72 hours.
  - **≤3%** of NAV, stress = 100% of the position.
  - Needs an **hourly 24/7 crypto job**: the one US precedent bottomed on a Saturday. Otherwise, drop it.
- **Cash-and-carry.**
  - CME contracts with ≤60 days to expiry; basis from CME prices ≥ T-bills + 6 points.
  - ≤15% notional; long IBIT and short MBT in the **same** taxable account.
  - Awkward below about $280k. Off today.

### M7 — O1: trend-filtered put credit spread (shadow at the $100k paper size; paper from ≈$162k; Phase B)

- **Trade.** Sell the 0.20-delta put and buy the put 5% lower, 40–50 DTE, on XSP/SPXW.
- **Filters.** SPX above its 200-day average; VIX < 30; VIX/VIX3M < 1.0.
- **Exits.** A GTC buy-back at 50% of the credit; otherwise close at 21 DTE. No stop; never roll.
- **Size.** 2% of NAV at max loss (3% cap). **Needs ≈$162k**, so it is off at $100k.
- **Expected.** −0.2 to +0.3% a year pre-tax. Promotion needs ≥24 paper trades passing track 14's test.

### Shadow ledger (automatic, no emails, no LLM)

- ST-1b and ST-2;
- W10 (under the calendar reading);
- I1 and I2 (put-spread variants), and O1-h (O1 held to expiry);
- the ETH switch;
- insider clusters (≥$300m cap), special dividends (≥$1m daily volume), activist 13D filings and near-completion cash mergers;
- CEF tender capture;
- W3 (cool-CPI TLT), W4 (BoJ) and the gold spike fade;
- every scheduled-release reaction.

Each has a pre-registered promotion test in its track.

---

## 3a. Execution standard: every trade must be easy in the Robinhood or Coinbase app (track 20)

1. **Venues.**
   - ETF and Bitcoin-ETF trades go in the **Robinhood IRA**.
   - Option spreads go in the **Robinhood taxable account** (Level 3 plus index options). Robinhood IRAs allow Level 2 only, so no spreads.
   - Crypto on **Coinbase** is optional.
   - No futures and no short selling in v1.
2. **Three order kinds only:**
   - **(a) A market order in dollars,** placed any time after the email. Robinhood queues it for the 9:30 ET open; its overnight session takes limit orders only.
   - **(b) A two-leg vertical spread at one net limit price,** placed after 10:00 ET, with one re-price at the stated maximum, otherwise skipped.
   - **(c) A Coinbase market buy or sell in dollars.**
   - No stop, stop-limit, trailing-stop, bracket/OCO, market-on-close or overnight-session orders.
3. **At most 3 orders per email.** Monthly rebalances included, via M2's no-trade band.
4. **Options.**
   - Two-leg vertical spreads only.
   - At least 1 whole contract, or skip.
   - Closed **≥1 trading day before expiration.** That avoids Robinhood's 3:30 PM expiration-day closeouts and assignment.
   - XSP preferred.
5. **Every email carries:**
   - a **Robinhood steps** block: ≤7 taps with exact values;
   - a **what-if** block (outside the band → skip; not filled → the one allowed re-price, then skip);
   - plain-English explanations of every term.
6. **Instrument whitelist.**
   - Only tickers verified tradable on your venues may appear in an email.
   - `research/code/20-executability/check_venues.py` re-runs monthly, and a failed check blocks the email.
   - Verified 29 Sep: SPY, VOO, QQQ, IEF, GLD, USO, FXE, FXY, FXA, IBIT, FBTC, DAL, TLT, BNO, SGOV and BIL are tradable with dollar orders and listed options. BTC-USD and ETH-USD are live on Coinbase.

---

## 4. Portfolio rules

| Rule | Setting |
|---|---|
| Idle cash | Treasury bills or a T-bill ETF (about 4.2%) |
| Admission, discretionary trades | Δg ≥ **6 bp** per trade on the whole book (shrunk edge, after costs and T-bill drag), **and** it beats buy-and-hold over its horizon. Rev. 2 gates 1 (≥10 analogs) and 5 (defined maximum loss) apply |
| **Policy modules** | M1, M3, M4 and W8 are owner-approved exemptions from the per-trade hurdle and the buy-and-hold test. M4 must beat T-bills. Each keeps its caps, stress rules and kill switches, and reports its rule-level Δg |
| Sizing | G(D) · min(0.25 × joint Kelly(κ·s), Kelly(s − 0.05), stress cap, cluster room, total room). κ = 0.5 for rule-based modules, frozen through the pilot. Realized κ after selection may be only 0.05–0.36, so it is re-estimated quarterly |
| Stress | With a stop: R × the gap multiple (ETF/index 1.7×; large cap 2.1×; volatile 2.6×; Bitcoin ETF 3.1×; spot crypto 1.5×). **Without a stop: notional × the worst 10-session loss in the instrument's history.** Options: premium. M2: worst historical book month, counted once |
| Caps | Per-trade stress ≤2% (≤3% for premium); cluster ≤6%; total open ≤10%; option premium ≤10%; **macro-factor budget** 3% premium / 2% stop-risk per factor, inside the cluster cap |
| Clusters | US equity (4% of room reserved for M1, W10 and M4; M2 ≤3%), duration, USD, oil ("peace/oil-down" is one factor in 2026), gold, crypto |
| Drawdown governor | G = 1 up to a 5% drawdown, falling linearly to 0.25 at 15%. Review at 15%; pause discretionary entries at 20%. **M4 is exempt.** M2 re-decisions continue during a pause but may not raise gross |
| Circuit breakers | A daily loss ≥2% or weekly loss ≥4% pauses **discretionary** entries for 1 or 5 days. M1, M4 and W10 proceed once the nightly data/fill check passes |
| Trade units and budget | See M2 (units); M3's forced re-entries are not trades. Budget: hard cap **100 a year** (an invariant change from rev. 2's 24 — §12.4); ≤8 open positions |
| Minimum hold | 5 **trading** days *planned*. Rule exits, take-profits and invalidations are exempt; so are M1 and M3 |
| Option expiry (debit structures) | Entry DTE ≥ max(2 × planned hold in calendar days, 45). Close ≥10 trading days before expiry. O2 is the held-to-expiry exception. No option with <40 DTE at entry |
| Option liquidity | Track 17 R8, measured from the market-hours snapshot: each leg's bid-ask ≤10% of mid with open interest ≥500, and the whole structure's round trip ≤10% of the debit (≤20% if the expected gain is ≥2× costs). This replaces the email spec's 2%/5% gate |
| Contango veto (R3) | No long position in USO/MCL (M2's crude leg, W9) when the front roll yield is below −20% a year, from explicit contract months |
| Accounts | `account.yaml` defines the paper accounts:<br>• **Robinhood IRA $70k:** ETFs and IBIT;<br>• **Robinhood taxable margin $30k:** option spreads (Level 3, index options);<br>• **Coinbase:** optional, off by default.<br>The paper broker enforces their constraints: no spreads, shorts or futures in the IRA; T+1 settled cash. Each underlying lives in exactly one account family. Cross-account wash-sale guard (±30 days) |

---

## 5. Never recommend (merged list; rev. 2 §3.9 still applies)

- **Timing and fast rules:**
  - overnight buy-close/sell-open programmes;
  - Donchian breakouts under 100 days;
  - trend lookbacks under 6 months (**except M3's pre-registered crypto switch**);
  - sector or country rotation;
  - calendar trades.
- **Options:**
  - options bought to play a scheduled release or earnings, i.e. entered ≤5 sessions before it, or with a thesis that depends on it;
  - options with <40 DTE at entry, including 0DTE and 1DTE;
  - naked short options and short-VIX products;
  - short premium on single stocks or leveraged ETFs;
  - rolling a losing spread;
  - stops on defined-risk spreads;
  - iron butterflies and short straddles;
  - any spread whose max loss exceeds 3% of NAV (XSP needs ≳$108k).
- **Event and single-stock trades:**
  - chasing a filing after its first session;
  - post-earnings drift, earnings-gap or pre-earnings trades;
  - index-inclusion or reconstitution trades, and IPO lock-up shorts;
  - short-squeeze trades;
  - dividend capture;
  - FDA binary bets;
  - spin-offs in their first 60 sessions;
  - event trades under a $300m market cap or $1m daily volume.
- **Crypto:**
  - calendar, crash-rebound, funding-rate and ETF-flow rules;
  - altcoin momentum;
  - stops tighter than the weekend-gap distribution.
- **Futures, FX and commodities:**
  - FX carry books; standalone commodity carry;
  - long energy positions in steep contango;
  - a micro-futures book below ≈$800k;
  - triggers read off continuous futures across a roll.
- **Macro:**
  - oil shorts after a ceasefire headline;
  - bets on scheduled releases when the system is within ±10 points of the prediction-market price.

---

## 6. Expected results, honestly

Planning ranges, pre-tax, on the whole portfolio, over T-bills. They are shrunk, per track 19 §A.4.

| Module | Trades a year | Contribution a year | Evidence |
|---|---|---|---|
| M1 ST-1 (6%) | 3.8 (0–11) | +0.05 to +0.10% | Deflated Sharpe probability 0.64–0.82; every 5-year block > 0 |
| M2 trend (s = 0.5) | 12 rebalances | 0 to +1.2% ((a) or (c)); negative for (b) without a short rebate | Fails Bonferroni alone; live funds −0.01 to 0.60 |
| M3 BTC switch (3%) | ≈5 | −0.3 to +0.5% | Alpha t ≤ 1.34 |
| M4 O2 (2% debit) | ≈0.7 (idle 60% of years) | **+0.05% (−0.14 to +0.14)** after the next-day re-run (track 21 §2); +0.13% at 90 DTE if the cap is loosened | 12 episodes; next-day entry keeps +0.21 of debit; edge vs a plain call spread +0.09 (p 0.64) |
| M5 W8 (and W9/W10 on paper) | ≈0.4–2 | −0.1 to +0.2% | n = 5–17 |
| M6 | ≈0.3 | 0 (shadow only since v3.2) | n ≈ 3 |
| M7 O1 (paper; ≥$162k) | ≤9 | −0.2 to +0.3%; 0 at $100k | Real-price alpha ≈0 |
| **Lean** (M1, M3, M4, M5, M6) | **≈10–17** (calm years 5–11) | **≈ −0.5 to +0.9%, central ≈ +0.25%** → about 4.45% nominal (track 21 re-estimate; v3.2 said +0.4%) | |
| **Lean + M2 at $100k** | **≈22–29** | **≈ −0.5 to +2.1%, central ≈ +0.85%** → about 5.05% nominal (v3.2 said +1.0%) | |

**Years to 11×** at those central rates: about 49–55 years before tax.

**If the cap were loosened to 90 days** (track 21; owner decision pending): W10 at 63 sessions and M4 at 90 DTE add ≈+0.2 points (Lean ≈4.63%, Lean + M2 ≈5.23%); 120 days adds nothing more. New strategies that longer holds would allow are assessed in track 22.

---

## 7. Paper trading and go-live

1. **Paper phase.**
   - Minimum 3 months.
   - Fill model v1.0 is frozen and hashed:
     - ETFs at the next open plus slippage, with limits filling only when price trades through;
     - options at mid + 0.6 × half-spread, and **only if that is ≤ the order's limit**, from a **10:17 ET market-hours snapshot job**;
     - futures with tick slippage;
     - crypto with fees plus spread.
   - A broker practice account runs in parallel for the fills comparison.
2. **Going live at 25% is an operations gate:**
   - ≥3 months of paper;
   - ≥95% of runs on time;
   - 0 validator failures;
   - practice-vs-model fills within tolerance;
   - ≥90% of emails handled;
   - the ledger verifies.
3. **Edge evidence.**
   - P(edge > 0) ≥ 0.7 under a N(0, 0.1²) prior is computed on the **wide book of the same rules**: ST-1b signals for M1, every M3 switch, and M2 position-months.
   - It stays **advisory until the selected book has ≥30 trades**.
   - At 12–30 trades a year, the edge gate is unlikely to pass within 12 months even for a real edge (track 18: ≤14% at 25 a year).
4. **Ramp.**
   - **50%** after ≥6 months and ≥30 live trades with P ≥ 0.8, κ̂ ≥ 0.2 and implementation shortfall ≤20%.
   - **100%** after ≥100 resolved trades (paper at half weight) with P ≥ 0.9 and calibration verified.
   - **Expect about 4–5 years (with M2) to 9 years (Lean) before full size.**
   - Modules are demoted on their kill switches.

---

## 8. Calibration and self-improvement

- **Evidence.**
  - Three pre-registered, mechanically resolved forecasts per trade.
  - A deterministic daily shadow book of every trigger and near-miss, with base-rate forecasts and paper fills. No LLM calls.
  - Each module's results against its pre-registered range.
- **Monthly:** operations, execution quality, evidence meters, and the review email (failures first). No rule changes.
- **Quarterly:**
  - costs and slippage;
  - κ̂;
  - calibration warnings and base-rate drift;
  - gated recalibration maps (≥150 forecasts per family);
  - go-live and ramp decisions.
  - At most one change per parameter per quarter, via a ≥3-month forward comparison.
- **Annually, with you:** calibration slope, retirements, and the hurdle and budget.
  - A parameter changes only if the change holds before **and** after 2008 and clears the multiple-testing bar for the number of variants tried.
  - Nothing is changed because of one good or bad month.

---

## 9. Emails at short horizons (changes to `11-trade-email-spec.md`)

- **Timing.** Evening emails carry orders for the next session.
  - M1, M2, M3 and W10: dollar market orders, queued by Robinhood for the 9:30 ET open (§3a).
  - Options: entered after 10:00 ET at one net limit price, with one re-price at the stated maximum (§3a).
- **Brackets.** **Rule-exit modules (M1, M2, M3, W10) get no bracket.** Exits come as EXIT emails with a dollar market sell ("Sell all") queued for the next open; Robinhood has no market-on-close order (§3a). OTOCO brackets are only for stop-based modules added later; the email spec's "defined stop always attached" for futures is removed.
- **Labels.** Every email is labelled **PAPER** or **LIVE**, with the module, its status and its stage.
- **Stress line.** Uses §4's stress definition.
- **Tax line.** Names the account family and whether the instrument is Section 1256.

---

## 10. Architecture and build plan

```
 GitHub Actions (private repo). Cron runs in UTC with a DST table;
 healthchecks.io alerts if no run by 23:30 ET.
   22:17 ET Mon–Fri  daily run: ingest → snapshot (hashed; two-source checks; explicit futures months)
        → modules + shadow book (deterministic) → sizing/caps/governor/account rules
        → paper broker (fill model v1.0) + hash-chained ledger
        → Claude writes the email from structured data only (placeholders; validator checks value AND slot)
        → Gmail API → GitHub issue per trade → healthchecks ping
   10:17 ET Mon–Fri  options snapshot + paper option fills (Phase B)
   08:47 ET Mon–Fri  pre-market re-price; EXIT/ADJUST emails only if needed
   hourly, 24/7      crypto prices (Phase B, for M6)
   1st of month      monthly review; quarterly and annual jobs on their dates
```

**Phase A (≈3–4 weeks):**
- data adapters, snapshots and ledger;
- M1 plus the ST-1b shadow;
- M2 in the vehicle you choose;
- M3;
- sizing, caps and the governor;
- the ETF paper broker;
- the email renderer and validator;
- Gmail sender (a dry-run mode that writes `.eml` files until the OAuth credential exists);
- GitHub Actions, healthchecks and tests.

**Phase B:**
- the 10:17 ET options job, with M4 (after the O2 re-run) and M7;
- W8/W9 with the frozen LLM veto;
- M6 with the 24/7 crypto job;
- the EDGAR/FINRA shadow screens;
- the monthly, quarterly and annual reports.

**Phase C:** the go-live review with you.

**Data dependencies:**

| Data | Needed by |
|---|---|
| Two-source SPY / VIX / ^GSPC closes | M1, W10, M4, M7 |
| VIX3M | M7, ST-2 |
| Explicit futures months (CLZ26, BZZ26, CME BTC) | R3, W8/W9, M6 |
| A rolling map of Polymarket / Kalshi market names, failing closed | W8/W9 |
| Option chains in market hours | M4, M7, W8, W9 |
| EDGAR / FINRA | Shadow ledger |

**Cost:** about $5–15 a month for the Claude API, plus free data. A paid data source is recommended before real money.

**As built (Phase A, 29 Sep 2026):** the emails come from deterministic templates filled with structured facts, with no LLM call at run time, so the Phase A cost is $0 beyond GitHub Actions minutes. The validator still checks every number against the facts. An LLM enters only with Phase B's W8/W9 veto. Package: `traderec/`; operations: `docs/OPERATIONS.md`; contracts: `docs/INTERFACES.md`.

---

## 11. State on 29 Sep 2026 (from the 28 Sep close)

| Module | State | Notes |
|---|---|---|
| M1 ST-1 | Not firing | Needs SPY RSI(2) < 10 (close ≤ ≈$757.6) **and** VIX ≥ 20 (now 16.1) |
| M2 trend (252-day sign) | Long SPY, QQQ, FXA; small GLD and USO; short IEF, FXE, FXY | Long-only (a): the longs only. The crude leg passes the contango veto (WTI backwardated). Monthly decision: first trading day of October |
| M3 BTC switch | On | BTC $83,169; weekly 10-week rule long. A paper position would open at launch; its 60-day clock starts then |
| M4 O2 | Armed | SPX −15% from its 252-day high and VIX ≥ 30 |
| M5 | W8 armed | Ceasefire through 31 Oct: 55.5%; through 30 Nov: 39%. Fed hike 28 Oct: 69–70% |
| M6 | Off | Basis below the trigger |
| M7 O1 | Filters pass | Paper only; needs ≥$162k |
| **Data traps** | n/a | Brent's November contract expires **30 Sep**: "front month" drops about 7% mechanically. WTI's November expiry around 20 Oct: about −3.8%. Triggers use explicit months |

**Catalysts to 27 Nov:**

| Date | Event |
|---|---|
| 2 Oct | Payrolls |
| 14 Oct | CPI |
| 27–28 Oct | FOMC |
| 29 Oct | GDP |
| 29–30 Oct | BoJ and ECB |
| 3 Nov | Midterms |
| 6 Nov | Payrolls |
| 10 Nov | CPI |
| About 17–19 Nov | Nvidia results |

Beyond the window: 11 Dec (government funding) and 10 Jan (US–China truce).

---

## 12. Decisions (answered 29 Sep 2026; see `DECISIONS.md`)

1. **"60 days" = calendar days.** Every trade closes within 60 calendar days, but a monthly re-decided trend position may continue. W10 stays in the shadow ledger.
2. **M2 = long-only ETF8 in the Robinhood IRA,** with a no-trade band.
3. **Accounts:**
   - an IRA and a taxable margin account with options (spreads) at Robinhood;
   - Coinbase for crypto.
   - Paper split: $70k IRA / $30k taxable (default $100k notional).
4. **Approved:**
   - the policy-module exemptions (M1, M3, M4, W8);
   - a trade cap of 100 a year;
   - ST-1 at 6%.
   - No gross above 1.0× (M2 is long-only).
5. **Go-ahead for Phase A:** given, subject to the executability check (done, track 20).
6. **Still open, not blocking:**
   - Gmail OAuth "In production": Phase A runs in dry-run mode until the credential exists;
   - country / US state (the design assumes US);
   - a long-horizon core outside the system;
   - the three in-app confirmations in track 20 §5.

---

## Appendix A — Red-team v3 findings and fixes

| Finding | Fix in v3.1 |
|---|---|
| C1 go-live gate unreachable; trade unit undefined | §7 operations gate plus wide-book evidence; M2 unit definitions; honest time-to-full-size |
| C2 the admission tests rejected the core modules | §4 policy modules; M1 sizing facts; §12.4 |
| C3 M2 infeasible as backtested at $100k in an IRA | M2 vehicle choice (a/b/c); short rebate; gross approval; Full row restated |
| M1 stress undefined; cluster overflow | §4 stress without stops; M2 as one sleeve; US-equity reservation |
| M2 next-open claim false | §1 re-run requirement; the O2 re-run before shipping |
| M3 W10 weak at 42 sessions | §1 and §12.1 consequences; W10 to shadow under the calendar reading |
| M4 expectations not shrunk | §0 and §6 revised ranges; years to 11× |
| M5 option expiry and liquidity contradictions | §4 expiry and liquidity rules; never-list wording |
| M6 brackets contradicted rule exits | §9: no brackets for rule-exit modules |
| M7 paper option fills unimplementable | 10:17 ET job; limits capped at the fill model |
| M8 wrong account thresholds | §1 table; module vehicles |
| M9 W8/W9 moved to an LLM | Mechanical triggers; LLM veto only; named invalidation market; W9 paper |
| M10 brakes vs crisis modules | §4: breakers pause discretionary entries only; M4 exempt from G(D) |
| M11 M3 spec contradictions | M3: BTC 10-week rule; ETH to shadow; exemptions |
| M12 build plan | Phase A/B re-scoped; data-dependency table |
| M13 §12 decisions | §12 rewritten |
| Minor m1–m16 | Pre-registered 252-day signal; ranges; gross vs net; test-split wording; today's figures; M6 sizes; W10 slot and exits; minimum-hold scope; gate applicability; shadow additions; restored ramp conditions; UTC cron; units; never-list wording; paper accounts |
