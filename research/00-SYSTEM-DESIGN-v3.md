# System design v3.3 — the 1–60 day trade system, with a 90-day exception for the crash-day buy (what will be built)

*29 September 2026. **Revision 3.3** applies your rule "loosen the duration if it's worth it" (decision 12). Tracks 21–24 found that only the crash-day buy (W10) gains from holds of up to 90 days, plus the crash call spread (M4) in Phase B. Loosening the cap for everything, or to 120 days, adds only market exposure. So W10 becomes a policy module with a 90-day exception and every other rule keeps 60 days. The Phase A build was reverted so this could be settled first, and is rebuilt on v3.3. Revision 3.2 made every trade placeable by a typical retail trader in the Robinhood or Coinbase app (§3a, from `20-executability-check.md`) and records your decisions (§12). Revision 3.1 fixed the red-team findings in `19-red-team-v3.md`; Appendix A maps each fix.*

*It follows your decisions in `DECISIONS.md`: trades realized within 1–60 days (up to 90 for W10 and, in Phase B, M4); paper trading first; US stocks and ETFs, listed options, futures, a Bitcoin ETF and crypto; GitHub Actions with the Gmail API.*

*The research behind it is tracks `13`–`18`, with tracks `21`–`24` on the holding cap. The long-horizon synthesis (`00-SYNTHESIS.md`, rev. 2) is background. §12 lists your decisions.*

---

## 0. The short version

1. **Short horizons give up most of the stock market's return.** Most of what stocks pay comes from holding them for years; a book that must be flat within 60 days forfeits nearly all of it.
   - The best short-horizon rule, run alone on 2008–2026, earned about 4.7% a year (T-bills + 3.3 points), with a −14% worst drawdown.
   - Holding SPY earned 11.3%, with a −52% worst drawdown (track 13).
2. **About 2,900 rule variants and test cells were tried in tracks 13–17. A handful survived, and all are small.**
   - Each track designed its rules on an earlier period and tested them on a later one: 2008 for most, 2016 for events, 2021 for crypto. Track 17 used placebo tests.
   - **None of the survivors clears a strict multiple-testing bar on post-2008 data alone.** They are kept because they also have pre-2008 or century-long evidence and a plausible mechanism, and, for the trend book, confirmation from live funds.
3. **Realistic expectation: T-bills (about 4.2%) plus roughly 0–2 points a year before tax.**
   - Central estimate for the Phase A book (M1, M2, M3 and W10): about +0.8 points, so **about 5.0% a year** (4.98% with a 60-day cap, 5.02% with W10's 90-day exception; track 23). Without the trend book, about 4.4%. v3.2 said +0.4 (Lean) and +1.0 (with the trend book), before the crash call spread's next-day re-run.
   - Drawdowns should stay around 10–15%.
   - The paper phase exists to measure the true number.
4. **"1000%" is not reachable with 1–60 day trades without risking ruin.**
   - At about 5% a year, 11× takes about 48–49 years before tax, and 55–80 years in a taxable account.
   - The biggest lever for large long-run gains is a long-horizon core held *outside* this system (rev. 2 §10).
   - With this system's central excess of about +0.2 to +0.8 points a year, that decision matters more than any other in this document.
   - **The holding cap is not a lever** (decision 12, tracks 21–24):
     - 90 days is worth it only for W10: +0.04 points a year now, and ≈+0.1 with M4 in Phase B.
     - 120 days, or loosening every rule, adds nothing but market exposure.
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

**"60 days" (decisions 1, 5 and 12).**
- It means calendar days.
- Every trade closes within 60 calendar days, with two exceptions:
  - trend positions re-decided monthly or weekly (M2, M3) may continue;
  - W10, and M4 in Phase B, may hold to the last session within **90** calendar days.
- A time stop of N days means **the last NYSE session dated on or before entry + N calendar days** (§4, "Time stops").
  - A fixed session count may be used only where it always fits: at most 37 sessions for 60 days, 58 for 90 and 78 for 120, with an open exit (track 23 §2.1).

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
- **Holding.** Continues while the switch stays on, re-decided every week, like M2's monthly re-decisions (decisions 5 and 11). There is no forced 60-day close and re-entry.
- **Exemptions.** From the 5-day minimum hold and from the "lookbacks under 6 months" ban (pre-registered exception).
- **Expected.** **−0.3 to +0.5% a year.** It is mostly Bitcoin beta: 2022 alone would have cost ≈1.6% of NAV.

### W10 — uptrend crash-day buy (policy module; 90-day exception; Phase A) — tracks 17, 21–23

- **Signal**, after the close, on two-source-checked, **unrounded** official closes. All three must hold:
  - the S&P 500 index (^GSPC) closes 3.00% or more below the prior close (5 Aug 2024's −2.997% did not qualify);
  - the prior close was above its 200-day simple average, computed through the prior close;
  - no other S&P close in the prior 20 sessions fell 3.00% or more.
  - If the sources disagree on any condition, there is no signal; the event is logged in the shadow ledger.
- **Entry.** SPY dollar market order in the Robinhood IRA, queued for the next 9:30 ET open (order kind (a)).
  - One W10 position at a time. A signal while W10 is open goes to the shadow ledger only.
- **Size.**
  - Notional = **6% of NAV × G(D)**. Stress = notional × the S&P's worst 10-session loss (−32.5%) ≈ 1.95% of NAV.
  - The ledger and the email also show the horizon-matched planning loss: 6% × 48% ≈ 2.9% of NAV.
  - 6.7% would breach the 2% per-trade cap, so it is not used.
- **Exit.** "Sell all" SPY market order, queued the evening before, for the open of the **last NYSE session dated on or before entry + 90 calendar days**. That is 58–63 sessions in practice.
  - No stop, no bracket, no profit target.
  - The VIX > 45 void and the all-time-high exit are dropped. The void never fired at entry and hurt as an exit; the all-time-high exit is noise (track 23 §2.2).
- **Cluster.** Shares the 4% US-equity reserve. M1 goes first (§4, "Clusters").
- **Expected.**
  - About 0.5 trades a year (0–3; none in most years).
  - 1993–2026: 88% winners, mean +7.6%, worst −8.6%, worst interim −31% (−1.8% of NAV).
  - 1928–2026: 72% winners, worst −27% (1929).
  - **Planning contribution: +0.04% of NAV a year (−0.01 to +0.11).** The edge exists only after 1990 (deflated-Sharpe probability 0.45–0.64), so this is a cheap policy bet, not a proven edge.
- **Kill switch.** W10 goes back to the shadow ledger if one trade loses ≥15%, or if its cumulative realized P&L since go-live reaches −1.5% of NAV. Otherwise it is re-decided only at the annual review, against the shadow record of every uptrend −3% day at 60 and 90 days. At 0.5 trades a year no rule can test the edge itself (track 23 §2.5).
- **Why a policy module.** Its forward Δg is ≈4–9 bp per trade, around the 6 bp hurdle, on post-1990 evidence only (your approval: decision 12).

### M4 — O2: crash call debit spread (policy module; Phase B)

- **Signal.** SPX ≥15% below its 252-day high **and** VIX ≥30. First day only; 60-day cool-down.
- **Trade.** Buy the at-the-money call and sell the 105% call, on the XSP expiry nearest to, but not beyond, 60 calendar days, in the **Robinhood taxable account** (Robinhood IRAs don't allow spreads). **Sell to close ≥1 trading day before expiration.** SPY is the fallback only if XSP fails liquidity.
- **Order.** One net-debit limit order placed after 10:00 ET at mid + 0.3 × the natural width, the same as the fill model. If it isn't filled by 11:00 ET, re-enter once at the stated maximum; otherwise skip.
- **Size.** Debit ≤2% of NAV, rounded to the nearest contract within the 3% cap. **Exempt from G(D)**: the premium is its maximum loss.
- **Before shipping.** Re-run on a next-day 10:00 entry, and add the 10:17 ET options job (§7).
- **Expected.** At 60 DTE with a next-day entry: **−0.01% a year at κ 0.25, +0.05% at κ 0.5.** v3.2's +0.1 to +0.3% assumed a same-close entry (tracks 21 and 23). It must beat T-bills, not the index.
- **90-day exception (decision 12).**
  - Buy the spread on the listed XSP expiry nearest to, but not beyond, entry + 90 calendar days.
  - Sell to close ≥1 trading day before that expiry.
  - 90-day cool-down: one spread at a time, which keeps the 3% factor premium budget.
  - Planning value: +0.04% a year at κ 0.25 (+0.13% at κ 0.5). It rests on 12 crisis episodes, mostly the post-2008 V-shaped recoveries (1990–2007: +0.07 of debit per trade), priced on a model surface.
  - Before shipping, re-price it on real XSP quotes from the 10:17 ET snapshots and keep a 60-DTE paper twin.

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
- **W10 — uptrend crash day:** now a policy module with a 90-day exception (see "W10" above; decision 12).
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
- every uptrend −3% day, scored at 60 and 90 calendar days (W10's record for the annual review, including signals that arrive while W10 is open);
- I1 and I2 (put-spread variants), and O1-h (O1 held to expiry);
- the ETH switch;
- insider clusters (≥$300m cap), special dividends (≥$1m daily volume), activist 13D filings and near-completion cash mergers;
- CEF tender capture;
- *proposed, pending your approval (track 24; independent of the cap):*
  - CEF wide-discount buys: a fund's discount ≤ −2 standard deviations from its own 3 years;
  - spin-offs bought at session 61, just after the never-list's 60-session ban;
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
| Admission, discretionary trades | Δg ≥ **6 bp** per trade on the whole book (shrunk edge, after costs and T-bill drag), **and** it beats buy-and-hold over its horizon. Rev. 2 gates 1 (≥10 analogs) and 5 (defined maximum loss) apply. A longer hold passes the per-trade hurdle more easily at the same daily edge, so **judge any hold-length change by its contribution a year inside the risk budget** (track 24 §6) |
| **Policy modules** | M1, M3, M4, W8 and W10 are owner-approved exemptions from the per-trade hurdle and the buy-and-hold test. M4 must beat T-bills. Each keeps its caps, stress rules and kill switches, and reports its rule-level Δg |
| Sizing | G(D) · min(0.25 × joint Kelly(κ·s), Kelly(s − 0.05), stress cap, cluster room, total room). κ = 0.5 for rule-based modules, frozen through the pilot. Realized κ after selection may be only 0.05–0.36, so it is re-estimated quarterly |
| Stress | With a stop: R × the gap multiple (ETF/index 1.7×; large cap 2.1×; volatile 2.6×; Bitcoin ETF 3.1×; spot crypto 1.5×). **Without a stop: notional × the worst 10-session loss in the instrument's history.** Options: premium. M2: worst historical book month, counted once |
| Caps | Per-trade stress ≤2% (≤3% for premium); US-equity cluster ≤7% (M2's legs ≤3% + a 4% reserve); other clusters ≤6%; total open ≤10%; option premium ≤10%; **macro-factor budget** 3% premium / 2% stop-risk per factor, inside the cluster cap |
| Clusters | US equity, duration, USD, oil ("peace/oil-down" is one factor in 2026), gold, crypto. **US equity** = M2's equity legs (≤3% of NAV stress) plus a 4% reserve for M1, W10 and M4, so 7% in all. Inside the reserve:<br>• M1 is admitted first and is never blocked;<br>• W10 and M4 are first come, first served;<br>• a later signal takes the room that is left, and is skipped if that is under half its size (for M4, under one contract).<br>If M1's admission would breach the reserve, the open W10 is cut at the same open. *Phase A build: this raises an alert instead of sending an automatic trim. It never bound in 1993–2026 at 6% sizing; only drift in M2's equity legs between rebalances can cause it.* |
| Drawdown governor | G = 1 up to a 5% drawdown, falling linearly to 0.25 at 15%. Review at 15%; pause discretionary entries at 20%. **M4 is exempt.** M2 re-decisions continue during a pause but may not raise gross |
| Circuit breakers | A daily loss ≥2% or weekly loss ≥4% pauses **discretionary** entries for 1 or 5 days. M1, M4 and W10 proceed once the nightly data/fill check passes |
| Trade units and budget | See M2 (units); M3's forced re-entries are not trades. Budget: hard cap **100 a year** (an invariant change from rev. 2's 24 — §12.4); ≤8 open positions |
| **Time stops** | A time stop of N calendar days means selling at the open of the **last NYSE session dated on or before entry + N calendar days**, with the market order queued the evening before. A session count may be used only where it always fits with an open exit: at most 37 sessions for 60 days, 58 for 90 and 78 for 120. Holding caps:<br>• **60 days** for every trade;<br>• **90 days** for W10, and for M4 in Phase B (decision 12);<br>• M2 and M3 are continuing positions, re-decided monthly and weekly. |
| Minimum hold | 5 **trading** days *planned*. Rule exits, take-profits and invalidations are exempt; so are M1 and M3 |
| Option expiry (debit structures) | Entry DTE ≥ max(2 × planned hold in calendar days, 45). Close ≥10 trading days before expiry. O2 is the held-to-expiry exception. No option with <40 DTE at entry |
| Option liquidity | Track 17 R8, measured from the market-hours snapshot: each leg's bid-ask ≤10% of mid with open interest ≥500, and the whole structure's round trip ≤10% of the debit (≤20% if the expected gain is ≥2× costs). This replaces the email spec's 2%/5% gate |
| Contango veto (R3) | No long position in USO/MCL (M2's crude leg, W9) when the front roll yield is below −20% a year, from explicit contract months |
| Accounts | `account.yaml` defines the paper accounts:<br>• **Robinhood IRA $80k:** ETFs and IBIT (M2's 60% + M1 6% + W10 6% + M3 3% = 75% of NAV, plus a buffer; v3.3 moved it from $70k);<br>• **Robinhood taxable margin $20k:** option spreads (Level 3, index options; premium ≤10% of NAV);<br>• **Coinbase:** optional, off by default.<br>The paper broker enforces their constraints: no spreads, shorts or futures in the IRA; T+1 settled cash. Each underlying lives in exactly one account family. Cross-account wash-sale guard (±30 days) |

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
| M4 O2 (2% debit; Phase B) | ≈0.6 at 90 DTE, one spread at a time (idle ≈60% of years) | **+0.04% at κ 0.25** (+0.13% at κ 0.5) at 90 DTE; −0.01% / +0.05% at 60 DTE | 12 episodes, mostly post-2008. Next-day entry keeps +0.21 of debit at 60 DTE; edge vs a plain call spread p 0.21–0.64 (tracks 21, 23) |
| **W10 crash-day buy (6%, 90-day exception)** | **≈0.5** (0–3; none in most years) | **+0.04% (−0.01 to +0.11)** | Post-1990 only: +7.3% vs +2.7% random, p 0.011; 1928–89 p 0.44; deflated Sharpe 0.45–0.64 (track 23) |
| M5 W8 (and W9 on paper) | ≈0.4–2 | −0.1 to +0.2% (central +0.02%) | n = 5–17 |
| M6 | ≈0.3 | 0 (shadow only since v3.2) | n ≈ 3 |
| M7 O1 (paper; ≥$162k) | ≤9 | −0.2 to +0.3%; 0 at $100k | Real-price alpha ≈0 |
| **Phase A book: M1, M2, M3, W10** (what is being built) | **≈20–25** | **≈ −0.3 to +1.9%, central ≈ +0.8%** → **about 5.0% nominal** (track 23) | |
| Phase A without M2 (M1, M3, W10) | ≈9–10 | ≈ −0.3 to +0.7%, central ≈ +0.2% → about 4.4% nominal | |
| **Lean** (M1, M3, M4, W8, W10; M4 at κ 0.25) | **≈10–17** (calm years 5–11) | central ≈ +0.3% → about 4.5% nominal (v3.2 said +0.4%) | |
| **Lean + M2 at $100k** | **≈22–29** | **≈ −0.4 to +2.2%, central ≈ +0.9%** → about 5.1% nominal (v3.2 said +1.0%) | |

**Years to 11×** at those central rates: about 48–49 years before tax.

**Holding cap (decision 12; tracks 21–24).** Expected return of the Phase A book (M1, M2, M3, W10), before tax:

| Cap | Expected a year | 2008–2026 backtest (unshrunk) | Worst drawdown 1993–2026 |
|---|---|---|---|
| 60 days | 4.98% | 5.30% | −11.3% |
| **90 days, W10 only (adopted)** | **5.02%** | **5.49%** | **−11.9%** |
| 120 days | 5.03% | 5.46% | −11.8% |

- Loosening every rule adds nothing but market exposure.
- 120 days adds nothing over 90: W10 fires less often, and the 2000–02 drawdown is deeper.
- SPY returned 10.3% a year (1928–2026), 10.8% (1993–2026) and 11.3% (2008–2026), with −52% to −55% drawdowns. Its forward range at CAPE ≈41 is ≈3–6%.

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
   08:47 ET Mon–Fri  pre-market re-price; EXIT/ADJUST emails only if needed (not built: Appendix C)
   hourly, 24/7      crypto prices (Phase B, for M6)
   1st of month      monthly review; quarterly and annual jobs on their dates
```

**Phase A (≈3–4 weeks):**
- data adapters, snapshots and ledger;
- M1 plus the ST-1b shadow;
- M2 in the vehicle you choose;
- M3;
- W10, the crash-day buy with the 90-day exception, plus its 60/90-day shadow record;
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

**As built (Phases A and B, 29 Sep 2026):** the emails come from deterministic templates filled with structured facts, with no LLM call at run time. The validator still checks every number against the facts. The only LLM call is W8/W9's frozen veto, made only for a candidate that passed every mechanical gate (about 0.4–2 a year), so the Claude API costs under about $5 a year rather than the $5–15 a month above. GitHub Actions uses about 850–950 minutes a month, 80% of it the hourly crypto job. Phase B added the 10:17 ET options job (paper spread fills and marks from one market-hours snapshot, with filtered snapshots kept in `state/options/`), M4 with its 60-DTE twin, W8 and W9, the option, crypto and macro shadow books, the hourly crypto job (it commits only when a depeg event starts, changes or ends), and the quarterly and annual reviews. The 08:47 ET pre-market re-price was not built: a spread close that doesn't fill is re-issued as a new EXIT email the next evening. The EDGAR/FINRA shadow screens are still to come. Everything runs on paper. Appendix C lists every rule interpretation and deviation of the Phase B builds. Package: `traderec/`; operations: `docs/OPERATIONS.md`; contracts: `docs/INTERFACES.md` (as built) and `docs/PHASE_B_CONTRACTS.md` (the Phase B build contracts).

---

## 11. State on 29 Sep 2026 (from the 28 Sep close)

| Module | State | Notes |
|---|---|---|
| M1 ST-1 | Not firing | Needs SPY RSI(2) < 10 (close ≤ ≈$757.6) **and** VIX ≥ 20 (now 16.1) |
| M2 trend (252-day sign) | Long SPY, QQQ, FXA; small GLD and USO; short IEF, FXE, FXY | Long-only (a): the longs only. The crude leg passes the contango veto (WTI backwardated). Monthly decision: first trading day of October |
| M3 BTC switch | On | BTC $83,169; weekly 10-week rule long. A paper position would open at launch and continue while the switch is on |
| W10 crash-day buy | Armed, not firing | The S&P is +6.6% above its 200-day average. A −3% close (≈7,453 from 7,683.69) would trigger it. Last −3% day: 2025-04-10 (track 22) |
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

1. **"60 days" = calendar days.** Every trade closes within 60 calendar days, but a monthly re-decided trend position may continue. (W10's shadow status under this reading is superseded by item 6.)
2. **M2 = long-only ETF8 in the Robinhood IRA,** with a no-trade band.
3. **Accounts:**
   - an IRA and a taxable margin account with options (spreads) at Robinhood;
   - Coinbase for crypto.
   - Paper split: $80k IRA / $20k taxable (default $100k notional; v3.3 moved it from $70k / $30k so the IRA can fund every ETF module at once).
4. **Approved:**
   - the policy-module exemptions (M1, M3, M4, W8);
   - a trade cap of 100 a year;
   - ST-1 at 6%.
   - No gross above 1.0× (M2 is long-only).
5. **Go-ahead for Phase A:** given, subject to the executability check (done, track 20). The first build was reverted on 29 Sep so the holding-cap research could come first, and is rebuilt on v3.3.
6. **Holding cap (decision 12, 29 Sep):** "loosen the duration if it's worth it".
   - Tracks 21–24 found it worth it only for W10 (now) and M4 (Phase B): they may hold to the last session within 90 calendar days.
   - Everything else keeps 60 days.
   - 120 days was rejected: it adds nothing over 90.
7. **Still open, not blocking:**
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

---

## Appendix B — v3.3: the holding-cap decision and track 23's fixes

**Correction (replay, Phase B).** Track 23 priced W10's calendar-exact exits at the close, not the open, because a `rule.startswith("C")` test also matched "CAL" (`docs/phase-b/replay.md` finding 3; `docs/phase-b/track23-fix.md`). Re-run at the open, SPY 1993–2026, CAL90:

| | Before | After |
|---|---|---|
| Win rate, one at a time (17 trades) | 88% | 88% |
| Mean / worst trade | +7.2% / −8.3% | +7.6% / −8.6% |
| All 20 events vs random entries | +6.9% vs +2.7%, p 0.019 | +7.3% vs +2.7%, p 0.011 |
| One at a time: p_era | 0.020 | 0.012 |
| Deflated-Sharpe probability | 0.42–0.62 | 0.45–0.64 |
| Sessions held | 59–64 | 58–63 |
| Planning contribution | +0.04% (−0.01 to +0.10) | +0.04% (−0.01 to +0.11) |
| Phase A book at 60 / 90 / 120 days | 4.98 / 5.02 / 5.03% | unchanged |

- Unchanged: the 1928–2026 figures, the 2008–2026 backtests and drawdowns, and M4.
- Decision 12's conclusion holds: 90 days for W10 (and M4 in Phase B), 120 days rejected.

**The v3.3 changes:**

| Change | Where | Source |
|---|---|---|
| W10 goes from shadow to a policy module with a 90-day exception: calendar-exact exit, 6% × G(D), no VIX void, no all-time-high exit, damage-limit kill switch | §3 "W10", §6, §10, §11 | Tracks 21–23; decision 12 |
| M4 may use 90-DTE spreads with a 90-day cool-down (Phase B). Its value is cut to +0.04% at κ 0.25 (12 episodes) | §3 M4, §6 | Tracks 21, 23 |
| Time stops are calendar-exact: "the last session within N calendar days". A 63-session hold sold at the next open overruns 90 days 75% of the time | §1, §4 "Time stops" | Tracks 22, 23 |
| US-equity cluster = 7% (M2 ≤3% + a 4% reserve). v3.2's "cluster ≤6%" contradicted its own reserve. M1 is admitted first; W10 and M4 are first come, first served | §4 "Caps", "Clusters" | Track 23 §2.4 |
| No global loosening and no 120 days: only market exposure. 260 + 380 new variants found nothing that gains from longer holds (expected change 0) | §0, §6 | Tracks 22–24 |
| Proposed shadow entries, independent of the cap and pending your approval: CEF wide-discount buys and spin-offs from session 61 | Shadow ledger | Track 24 |
| Paper split $80k IRA / $20k taxable (was $70k / $30k), so the IRA can fund M2 + M1 + W10 + M3 at once | §4 "Accounts", §12 | Found in the v3.3 build |
| Expected returns re-based: Phase A book ≈5.0% (4.98 / 5.02 / 5.03% at 60 / 90 / 120 days); Lean ≈4.5%; Lean + M2 ≈5.1% | §0, §6 | Track 23 §3.3 |

---

## Appendix C — Phase B as built

The Phase B builds (29 Sep 2026) implemented §3's M4, M5 (W8, W9, scheduled releases), M6 and M7, the shadow ledger, §7's option fills and §8's reviews. Each row below is one place where a builder had to interpret the text above, or departed from it, and it says what the code does today. The rule text above is unchanged; changing a row is a rule change under §8. The notes are in `docs/phase-b/`, the build contracts in `docs/PHASE_B_CONTRACTS.md`.

| Change | Where | Reason | Source note |
|---|---|---|---|
| Paper spread fills use quotes stamped 10:15–16:00 ET on the run date, not exactly 10:17 | §7.1, §10 | CBOE's delayed quotes lag about 15 minutes, so 10:15 means quotes from 10:00 or later; a late GitHub cron still counts | options.md §8.3 |
| One 10:17 ET decision stands in for "limit after 10:00, then one re-price at 11:00": the model price P = combo mid + 0.3 × natural width fills at the limit, else at the stated maximum (minimum for a close), else not at all | §3a (b), §7.1 | One market-hours snapshot a day; §7.1's "only if ≤ the order's limit" is read together with §3a's one re-price | options.md §7; PHASE_B_CONTRACTS §3 |
| Order prices (the limit and the stated maximum or minimum) come from the evening chain, the closing quotes at the 22:17 ET run; the fill is decided on the next session's 10:17 snapshot | §3 M4 "Order", §3a (b), §9 | The email goes out in the evening | PHASE_B_CONTRACTS §2; m4.md §2 |
| An order without a usable same-day market-hours chain stays pending: the run ends `data_missing` (retryable), and an order whose session has passed is cancelled as missed the next day | §7.1 | A CBOE outage must not be booked as a market no-fill | options.md §8.2 |
| Not modelled: the displayed size, rounding to the $0.05 tick, commissions, and track 14's staleness guard (SPX moved > 0.5% or VIX > 2 points) | §7.1 | §7 names none of them | options.md §7 |
| Stricter than the contract, failing closed: the broker opens only two-leg debit verticals; a crossed quote has no mid; a non-positive model debit never fills | §3a.4, §7.1 | Order kind (b) is a debit vertical; bad quotes are not prices | options.md §8.5 |
| Safety net: a spread still open on or after its expiry settles at intrinsic value from the underlying's official close (XSP = S&P 500 / 10), with an alert. SPX's AM settlement on the opening quotation is approximated by the close | §3a.4 | The rules should keep it from ever running; no free opening-quotation feed; the modules avoid root SPX | options.md §3, §7 |
| A spread whose leg has no two-sided quote can't be marked or closed that day; it keeps its last mark and, if never priced, is settled by the safety net | §7.1 | Fill model v1.0 needs both legs' bids and asks | options.md §7; option-shadows.md §8 |
| Yahoo's option quotes are a fallback only 09:30–16:00 ET on trading days; outside those hours a CBOE failure fails closed | §10 "Option chains in market hours" | Track 14 §6.7: never use Yahoo's after-hours quotes | options.md §5 |
| The liquidity round trip is the natural width Σ(ask − bid) over the combo mid; the 20% allowance needs an expected gain (per share) of at least twice that width | §4 "Option liquidity" | Track 17's definition | options.md §2 |
| The ≥ 500 open-interest rule applies to index options too, with no market-maker exemption. It fails most XSP strikes, which sends M4 to its SPY fallback | §4 "Option liquidity", §3 M4 | The design grants no exemption (track 14 would) | options.md §7 |
| Snapshots are stored filtered, at most about 100 KB a day: every leg the book holds or has ordered, plus a coarsened surface sample for the roots a runner asks for; the raw payload's SHA-256 is logged | §7.1, §10 | A raw CBOE file is 6–13 MB per root | options.md §4 |
| Practice spread fills pass at a median gap ≤ 200 bp of the net price, measured apart from ETF fills (10 bp); the fills gate needs every measured group within its tolerance | §7.2 "practice-vs-model fills within tolerance" | The fill model leaves 0.2 × the natural width between the limit and the stated maximum, at most 2% of the debit under the liquidity rule; the design gives no spread tolerance | spread-emails.md "The fill gap for spreads", "Known limits" |
| An owner's spread price typed per contract (50–200 × the model's) is read as per share | §7.2 | Robinhood quotes per share | spread-emails.md "The fill gap for spreads" |
| Only debit verticals are emailed. There is no ADJUST email and no 08:47 ET pre-market re-price: a close that doesn't fill is re-issued as a fresh EXIT email the next evening | §9, §10 schedule | PHASE_B_CONTRACTS §3; credit spreads (M7/O1) are shadow-only | spread-emails.md "Known limits" |
| M4's 252-session high includes today's close, on unrounded closes; both thresholds are inclusive | §3 M4 "Signal" | The research code's `rolling(252).max()` | m4.md §2 |
| M4's "first day only" is the research's signal chain, rebuilt from the whole history each evening: every signal on the primary data starts the 90-day cool-down, whether or not it is confirmed, admitted or filled; a skipped signal is skipped, not deferred | §3 M4 "Signal", "90-day exception" | A missed run can't turn a later day of the same crash into a first day | m4.md §2, §8.3 |
| M4's structure: the quoted call nearest the verified close (XSP: the confirmed S&P close / 10) and the quoted call nearest 105% of it, each within 1% of its target; the chain's spot within 1% of the verified close; the latest listed expiry ≤ entry + 90 days with ≥ 40 DTE; SPY only when XSP fails the liquidity check, never on bad data | §3 M4 "Trade", "90-day exception" | Fail closed on missing or disagreeing data | m4.md §2 |
| M4's liquidity is measured on the 10:17 ET snapshot when M4 is "armed" (last close ≥ 10% below its high): that probe decides XSP or SPY; otherwise tonight's chain decides | §4 "Option liquidity" | §4 says the market-hours snapshot; XSP's after-hours quotes are stale and 3–10× wider (track 14 §6) | m4.md §8.1 |
| M4 is sized at the stated maximum: contracts = the nearest whole number (halves up) to 2% of NAV at the stated maximum, cut to the 3% cap; skipped under one contract | §3 M4 "Size", §4 "Caps" | The caps then hold even if the re-price fills | m4.md §8.2 |
| M4's close is planned two trading days before expiry (reason `expiry_rule`), leaving the last session before expiry for one retry. No stop, no time stop and no profit target: track 14's optional 80%-of-width take-profit is not adopted | §3 M4 "Sell to close ≥1 trading day before expiration", §3a.4 | One retry session inside the §3a.4 limit; the design lists no other exit | m4.md §2, §8.7 |
| The 60-DTE twin needs a confirmed signal but ignores M4's own admission and fill. It enters at the next session's 10:17 snapshot at the model price on the expiry nearest to, but not beyond, entry + 60 days (≥ 40 DTE), exits at the snapshot two sessions before expiry, and is dropped if no usable snapshot comes within two sessions | §3 M4 "keep a 60-DTE paper twin" | A like-for-like comparison of 60 and 90 days on real quotes | m4.md §3, §8.6 |
| M4's forecast: one "profit" forecast, p = 0.60 = 0.572 + 0.25 × (0.692 − 0.572) | §8 | O2's win rate shrunk toward the any-day win rate at κ 0.25 (12 episodes) | m4.md §6 |
| `admit_premium` applies, in order: G(D) unless exempt (M4), 3% per-trade premium, 10% option premium, 3% factor premium per cluster, the cluster (US equity 7%, others 6%), 10% total open stress; at least one whole contract or skip. The premium caps default in code | §4 "Caps", "Clusters", "Drawdown governor" | The design's caps; the constitution's `risk` block was not extended | m4.md §4, §8.5 |
| Open spreads count at max(cost, current value) in their module's cluster (M4 → US equity; W8 and W9 → oil, DAL and SPY legs included), and every admission counts tonight's pending buys as if filled, spreads at the stated maximum. A W10 order queued the same evening therefore takes the US-equity reserve first | §4 "Clusters", "Stress" | "A later signal takes the room that is left"; "peace/oil-down" is one factor in 2026 | m4.md §4, §8.4; PHASE_B_CONTRACTS §7 |
| W8's condition (i), the official announcement, is evidenced only by the veto's ≥ 2 allow-listed citations that its own search returned; an announcement market resolving Yes is not a gate | §3 M5 W8 | Every trade needs a valid PROCEED anyway; market resolution lags the headline | w8w9.md §6.1 |
| W8's trigger markets (blockade end, Hormuz normal) map to the listed date nearest signal + 90 days, on or after the time stop of a trade entered the next session; the map rolls every evening | §3 M5 W8, §10 "rolling map" | A literal "first date ≥ signal + 90 days" goes blind from early October; the latest-dated market is rejected too | w8w9.md §6.2 |
| W8's invalidation market is "US x Iran ceasefire continues through" the first listed date on or after the time stop, re-mapped by rule when it resolves or disappears; a market already below 40% at entry blocks the entry. Track 17's Brent-retrace invalidation is not built | §3 M5 W8 "Invalidation" | The design names this market only; such an entry would exit the next evening | w8w9.md §2, §6.7, §6.17 |
| W8's "up ≥ 15 points on the day" is measured since the previous session's 22:17 ET snapshot of the same market; no previous-session snapshot, no trigger; a market that resolved Yes counts as 100% | §3 M5 W8 (iii) | The same window as Brent's close-to-close move; the venue's rolling 24-hour change is not used | w8w9.md §6.3 |
| Explicit crude months: Brent month + 2 on days 1–15 and + 3 after; WTI + 1 / + 2. One instrument crossing while the other moves the other way fails closed; BNO firing alone must pass the two-source check | §3 M5, §4 R3, §11 "Data traps" | Never read a continuous future across a roll | w8w9.md §2, §6.4 |
| W9's "≥ 1 mb/d physically offline" is an owner-maintained file (`state/inputs/w9_supply_loss.json`), checked mechanically: ≥ 1.0 mb/d, no restoration for ≥ 14 days, ≥ 2 https sources on an allow-list, dated the run date or the session before; one veto call and at most one trade per record | §3 M5 W9 | Track 17 R2 defines it "per IEA/EIA/company statements", and no free machine-readable feed exists; the one-session grace follows R2's "classify within 24 hours" | w8w9.md §6.5 |
| W9's exits beyond the design: take profit at +100% of the premium; invalidation when WTI closes below its pre-event close on the same explicit month, or the record gets `restored_on`; time stops in trading days | §3 M5 W9 | Track 17 §5.2 W9 and R6; the design is silent | w8w9.md §6.6 |
| The release ban covers FOMC, CPI and payrolls from Kalshi's calendars, from the entry session through the five sessions after it. For entries from 30 Sep to 31 Dec 2026 it blocks 34 of 65 sessions (52%) | §5 "options bought to play a scheduled release … entered ≤ 5 sessions before it" | Track 14 §7.5 veto 1 and the red team's M5 wording; narrowing the kinds is a rule change | w8w9.md §6.8 |
| W8 and W9 are not exempt from G(D), the 20% drawdown pause or the −2% day and −4% week breakers | §4 "Drawdown governor", "Circuit breakers" | Only M1, M4 and W10 are named exemptions | w8w9.md §6.9 |
| W8/W9 structure: strikes by moneyness from track 17's examples (XSP and SPY 1.015 / 1.04 × spot; DAL 1.01 / 1.13; USO 1.10 / 1.33); the latest expiry in the 56–75 DTE window first; roots XSP → SPY → DAL; a root or expiry failing a rule falls through to the next | §3 M5, §3a.4 "XSP preferred" | Section 1256 tax and track 17's worked examples | w8w9.md §6.10 |
| W8/W9 liquidity is checked on the evening (closing) chain at decision time, with no expected gain (a strict 10% round trip). USO and DAL usually fail, so W9 is mostly shadow-logged | §4 "Option liquidity" | No hook runs before the 10:17 ET fill | w8w9.md §6.11 |
| W8/W9 prices are rounded to the cent, buys up and sells down (M4 rounds to the nearest cent) | §3a (b) | The model price then stays inside the limit | w8w9.md §6.12 |
| W8/W9's time stop: the EXIT order goes out on the evening of trading day 20 (the entry session is day 1) and fills in session 21. The expiry rule closes at least 10 trading days before expiry | §3 M5 "after 20 trading days", §4 "Option expiry" | As M1's session-21 exit | w8w9.md §2 |
| The veto: the model comes from `TRADEREC_VETO_MODEL` and is logged only by its SHA-256 (a change alerts and re-pins, it doesn't block); the prompt is pinned by SHA-256 in the constitution (a mismatch blocks); web search is limited to the allow-list with no dynamic filtering; no structured outputs, the answer is parsed strictly; it is logged as a `signal` record before any email | §3 M5 "LLM role" | No identifier may enter the committed ledger; structured outputs are documented as incompatible with citations | w8w9.md §6.13–§6.15 |
| An unfilled W8/W9 entry voids its forecasts (a `correction`) but still counts against the year's trade budget | §4 "Trade units and budget", §8 | Phase A counts a trade when it is emailed | w8w9.md §6.16 |
| DAL's next earnings date comes from Nasdaq; Yahoo can only move it earlier, by ≤ 7 days; a larger gap or no Nasdaq date fails closed for DAL | §3 M5 W8 "DAL legs must expire before DAL's next earnings" | A named source, cross-checked | w8w9.md §6.18 |
| W9 in live mode sends its candidates to the shadow ledger instead of an email | §3 M5 W9 "paper" | n = 5 | w8w9.md §2 |
| W8/W9 forecasts: W8 "profit" 0.50 and "time stop" 0.60; W9 0.40 and 0.45 | §8 | Track 17 §5.2 after shrinkage | w8w9.md §3 |
| O1's entries: one per monthly (third-Friday) cycle, at the 10:17 ET snapshot of a session 45 down to 40 days before the monthly expiry; a listed 40–50 DTE expiry stands in when the monthly isn't listed | §3 M7 "40–50 DTE" | Track 14 tested one entry per monthly cycle about 45 days out (≤ 9 a year); entering whenever flat would give 15–20 | option-shadows.md §1 |
| O1-h sells the 0.10-delta put, held to expiry, with up to 2 spreads open | §3 "Shadow ledger" ("O1 held to expiry") | Track 14 §7.1's definition and §7.4 | option-shadows.md §2 |
| I2's "DVOL not in backwardation" is IBIT's ~30-day over ~90-day at-the-money implied volatility below 1.0 at 10:17 ET; its trend filter is BTC-USD above its 200-day average; there is no VIX < 30 analogue | §3 "Shadow ledger" (I2) | No provider serves Deribit's DVOL | option-shadows.md §3 |
| Credit-spread liquidity: natural width ≤ 10% of the mid credit, and open interest ≥ 500 only for ETF options (I2); §4's per-leg rule is not applied | §4 "Option liquidity" | Track 14 §7.2; §4's per-leg rule is written for debit structures and rejects most 5%-wide long legs | option-shadows.md §4 |
| Option shadow fills come from the same snapshot that picks the strikes: sell at V − 0.3 × natural width, buy back at V + 0.3 × natural width, no commissions; the 50% take-profit is checked only at 10:17 ET snapshots, not as a resting GTC order | §3 M7 "Exits", §7.1 | The shadow has no evening chain or limit; conservative against an intraday fill | option-shadows.md §5 |
| Option shadow results are R = P&L / max loss per contract; O1 also records the contracts M7's 2% rule would trade at the paper NAV (0 at $100k) and the NAV one contract needs | §3 M7 "Size", §6 | R doesn't depend on the account size | option-shadows.md "Fill model for credit spreads" |
| ST-2 buys SPY at the next open and sells at the close of session 20 (entry = session 1); its excess return is net of T-bills × 20/252 | §3 "Shadow ledger" (ST-2) | The research's exact definition; a promotion would need M1's open-of-session-21 exit | option-shadows.md §6 |
| Not applied to the option shadows: track 14's "don't open on an FOMC or CPI day", and the drawdown governor in their size information | §3 M7 | The first is "convenience only" and not among M7's filters | option-shadows.md §7 |
| I1's 30-day cool-down counts from the signal date, even when the entry is then skipped | §3 "Shadow ledger" (I1) | The research's signal dates don't depend on trades | option-shadows.md §9 |
| The hourly job writes only on events: a quiet hour leaves no ledger record, run entry or commit; an hour in which a depeg starts, updates or ends is one run keyed `hourly:<YYYY-MM-DDTHHZ>` | §10 "hourly, 24/7" | PHASE_B_CONTRACTS §12: commit only when a shadow event changes the state | crypto.md §8.1 |
| Hourly data problems are raised on transitions: an unconfirmed print alerts once when it starts and is logged when it ends; a total outage exits with code 3, writes nothing and shows as missed healthchecks pings | §10; PHASE_B_CONTRACTS §0.6 | Otherwise every hour of an outage would commit an alert | crypto.md §8.2 |
| A depeg venue counts only with a two-sided book at most 2% wide, priced at its mid; an empty book is "no quote"; below $0.97 on fewer than 2 venues opens nothing and is logged "unconfirmed" | §3 M6 "≤ $0.97 on ≥ 2 venues" | Fail closed; an empty book's stray bid is not a price | crypto.md §2.1 |
| "Reserves attested" and "redemptions not suspended > 72 h" are recorded as "unverified" on every event, not checked; "regulated, fiat-backed" is the configured coin list | §3 M6 "Depeg buy" | No mechanical source; shadow books use no LLM | crypto.md §2.1 |
| The depeg exit, which the design doesn't state: the median mid back at $0.995 or better, or 30 calendar days; a 0.25% fee a side; entry at the worst confirming ask, exit at the median bid | §3 M6 "Depeg buy" | Track 05 §11 and track 15 §1.2 | crypto.md §8.3 |
| USDT is watch-only: its depegs are scored like the others but never counted (`eligible: false`) | §3 M6 "regulated, fiat-backed" | Tether is not a US-regulated issuer, and its reserves are not only T-bills and cash (track 05 §7.3) | crypto.md §3, §8.6 |
| USDC's Coinbase price is implied from the USDT-USD and USDT-USDC books | §3 M6 "≥ 2 venues" | Coinbase has no USDC-USD book | crypto.md §3, §8.6 |
| Cash-and-carry: the CME Bitcoin month with the most days to expiry (≤ 60), explicit months only; Coinbase BTC-USD at the future's last-trade minute; quotes stamped from 00:00 ET on the run date to 06:00 ET the next day; realised return = the locked basis less a 0.15% round trip and IBIT's fee | §3 M6 "Cash-and-carry" | Nearest to track 05's 2–3-month basis within the 60-day cap; synchronous prices; no look-ahead | crypto.md §2.2, §8.4 |
| The ETH switch fills at the next UTC daily close after the signal week (0.25% a side), not at a US open, and replays up to 12 missed weeks | §3 M3 "ETH moves to the shadow ledger" | Track 15's convention: signal at the close, trade at the next close | crypto.md §2.3, §8.5 |
| W3 is scored on TLT shares (total return with ETF slippage), not track 17's TLT call spread | §3 "Shadow ledger" (W3) | No historical option chains; the macro runner is not an options-job runner | macro-shadows.md §1 |
| W4's stop and target are checked on FXY closes: stop at entry / 1.015 (USDJPY +1.5%), target at entry / 0.96 (USDJPY −4%) | §3 "Shadow ledger" (W4) | FXY is the instrument; JPY=X's daily bars aren't aligned with NYSE sessions | macro-shadows.md §2 |
| W4's "the Fed holds" is read at the FOMC decision nearest the BoJ's, within 10 days; W4 is evaluated once both lagged official series confirm the decisions, so a trade can appear up to about 4 business days after its hypothetical entry | §3 "Shadow ledger" (W4) | The track names only the Oct 2026 cluster; FRED's DFEDTARU and the BoJ's rate file lag the decisions | macro-shadows.md §3, "Data sources and timing" |
| The gold fade's war onsets are listed by the owner in `config/econ_calendar.yaml`; an onset first seen after its day-0 evening is recorded but not counted; a GLD day of +2% or more with no onset listed is logged as a near miss | §3 "Shadow ledger" (gold spike fade) | Classifying an onset is a judgment, and shadow books use no LLM | macro-shadows.md §4 |
| The release surprise proxy is the 2-year's day-0 move: FOMC +5 / −7 bp, CPI +4 / −6, payrolls +8 / −6; GDP, PCE, BoJ and ECB releases get no bucket | §3 M5 "Scheduled releases" | Track 17 §2.1–2.2; no free consensus feed | macro-shadows.md "The books, as implemented" |
| R1's market-implied probability, options-implied SPY/TLT moves and consensus are recorded as unavailable | §3 M5 "Scheduled releases … logged for calibration" | No free, reliable source | macro-shadows.md §5 |
| Core CPI has one source, FRED's CPILFESL as BLS rounds it; a Treasury-vs-FRED yield gap above 2 bp on a W3 input fails closed | §3 "Shadow ledger" (W3) | BLS's public API rejected requests at its shared daily limit | macro-shadows.md §6, "Data sources and timing" |
| Macro shadow scoring: excess return against a random-day baseline over the 3 years before entry; "ready" uses two-sided p-values with BH-FDR 10% across W3 and W4; the gold fade's bar is n ≥ 10 only | §3 "Shadow ledger" ("each has a pre-registered promotion test") | Track 17 R1 and R2 | macro-shadows.md "Promotion tests", §8 |
| The wide book for the edge evidence also includes W10's shadow record at 90 days | §7.3 | v3.3 made W10 a module; the record is the wide book of the same rule | reports.md "Known limits" |
| A wide-book family joins the pooled edge evidence from 5 units with some variation, each family standardised by its own standard deviation; excess returns are net of T-bills | §7.3 | The families' returns are on different scales | reports.md "How each number is computed" |
| "Runs on time" counts runs completed `ok`, including the 10:17 ET options job from its first run; start times aren't measured and the hourly job isn't counted | §7.2 | Completion is what the state records | reports.md "The monthly report", "Known limits" |
| The selected book's trade count is the budget counter (one M2 rebalance = one trade), summed over the years up to the period's year | §7.3 | The budget counter is the trade count the state keeps | reports.md "Known limits" |
| Calibration warnings need 20 scored forecasts in a family (the 90% interval excludes zero); a gross bias lies wholly beyond ± 20 points; several forecasts on one trade count with a design effect (ICC 0.4) | §8 "calibration warnings" | Track 18 §5.4, which looked from 30 trades | reports.md "How each number is computed" |
| "Calibration verified" (the full-size ramp) means the pooled gap within ± 5 points and the calibration slope's 90% interval containing 1 | §7.4 | Track 18 §5.5 | reports.md "How each number is computed" |
| Recalibration maps: identity below 150 forecasts per family; from 150 a MAP Platt map only if a likelihood-ratio test gives p < 0.05 and a map fitted on the older half scores better on the newer half; isotonic maps are only flagged, from 1,000 | §8 "gated recalibration maps" | Track 10 §4.8 | reports.md "How each number is computed" |
| Base-rate drift: two one-sample tests at 90% (win rate and mean); "early sign" below 150 resolved signals, "drift" (a problem) from 150 | §8 "base-rate drift" | Track 18 §6.1 | reports.md "How each number is computed" |
| κ̂: per module, the realised mean over the claimed mean from 5 closed trades, updating an N(0.35, 0.15²) prior clipped to [0.1, 0.6]; sizing keeps κ = 0.5 through the pilot | §4 "Sizing", §7.4 | Track 18 §6.2 | reports.md "How each number is computed" |
| Implementation shortfall = 2 × the mean signed practice-vs-model gap over the mean paper return per resolved trade; none (fail closed) without practice fills or with a paper edge ≤ 0 | §7.4 | Track 18 §6.1 | reports.md "How each number is computed" |
| Live trades are those whose entry email was labelled LIVE | §7.4 | The account mode is global; the labels are the only per-trade record | reports.md "How each number is computed" |
| Costs: a cheaper cost model is advised only with ≥ 60 practice fills; a more conservative one when fills are worse than tolerance on average | §8 "costs and slippage" | Track 18 §6.1 | reports.md "How each number is computed" |
| M2's position-months use its targets for holdings and leave out rebalance slippage; its pause trigger (36-month Sharpe < −0.5) applies only once 36 months exist | §3 M2 "Kill / review", §7.3 | The no-trade band keeps holdings within 25% of target | reports.md "The annual review", "Known limits" |
| Retirement candidate: P(edge > 0) < 0.2 after ≥ 20 trades and ≥ 12 months, and negative shadow evidence; a kill switch shows as "paused"; thesis invalidation is the owner's call | §8 "retirements" | Track 10 test (c) | reports.md "The annual review" |
| W10's annual re-decision: "keep" by default; "consider the shadow ledger" when ≥ 5 scored events average below random entry days; "back to shadow" if its kill switch fired | §3 W10 "Kill switch" | Track 23's references | reports.md "The annual review" |
| *Placeholder: the EDGAR/FINRA shadow screens' interpretations, from `docs/phase-b/edgar.md` (build pending)* | §3 "Shadow ledger" | — | edgar.md (pending) |
| *Placeholder: the replay build's interpretations, from `docs/phase-b/replay.md` (build pending)* | — | — | replay.md (pending) |
