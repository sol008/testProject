# System design v4.0 — the growth book: the largest return at a reasonable risk, one Sunday email a week (what changes)

*29 September 2026. **Revision 4.0** applies your objective of tonight: "optimize for largest return with reasonable risk tolerance", "the best tool a wallstreetbets user ever used", at most one recommendation a week, "don't give me wrong". It replaces the 1–60 day trade system's objective (T-bills plus a measured edge, drawdowns of 10–15%) with a growth book: three sleeves held in uptrends, sized to a drawdown limit you choose, re-decided once a week. v3.3 (`00-SYSTEM-DESIGN-v3.md`) stays as the record of what is built and running on paper today; this document says what changes and is self-contained for the builders. The numbers come from `38-growth-book-synthesis.md` (track 38), which synthesises round 3 (tracks 26–37).*

*It follows your decisions in `DECISIONS.md` (paper first; Robinhood IRA and taxable, Coinbase optional; GitHub Actions with the Gmail API) and needs the new decisions in §12, each with a default that applies until you answer.*

---

## 0. The short version

1. **What you asked for, in numbers (track 34 §5.1, track 38 §0):** maximise the expected growth rate of the account subject to a 10-year drawdown worse than **D = 40%** happening on at most 1 path in 10, with a hard stop at −40%. That is "reasonable risk" for a WSB appetite that wants to keep the account: it is safer than holding SPY on every drawdown measure (SPY's forward chance of a > 40% drawdown within 10 years is 50%), and a −40% loss is recoverable in about 5–6 years at the book's central growth. D = 30% and D = 50% are one config value away (§4, §12).
2. **The book.** In the Robinhood IRA: **25% SSO and 25% QLD**, each held only while its index closes above its 200-day average at Friday's close (G1); **30% IBIT**, held only while Bitcoin's Sunday weekly close is above both its 10-week and its 200-day average (G2); **15% reserved for the gems satellite** (G3: CEF crash-discount and crypto-trust-discount rules from track 35, on paper until promoted; SGOV meanwhile); **5% SGOV**. "Out" always means SGOV. W10's crash-day buy rides along. Everything else moves to the shadow ledger.
3. **The governor.** Full size until the book is 15% below its peak, then linearly down to 25% size at −35%, weekly; **everything to SGOV at −40%** and a review with you before restarting.
4. **What to expect (track 38 §5, Table 4).** Forward central: **about 9–10% a year** (median 9.5%, one path in ten below 1.7%, one in ten above 18.3%), a 77% chance of beating SPY over 10 years and 47% of beating it by 5 points, a 38% chance of a 30% drawdown and 0% of a 40% one, 2× in a median 6.4 years, 10× in 24. If 2008–2026 repeats: 34.5% a year, 2× in 2.1 years, 10× in 7.6. **In the central case this is about 9–10% a year; it makes 30–35% only if the last decade repeats.**
5. **One Sunday email at 21:17 ET** with a target portfolio and at most 3 dollar market orders: sells queued for Monday's 9:30 open, buys placed on Monday once the sells fill (limited margin). Three weeks in four it says "no change". One mid-week exception: an exit-only email when an index closes below its 200-day average (track 32's Rule E), at most 6 a year.
6. **What is not in it:** no options as leverage, no single names outside the pre-registered gems, no margin loans, no 3× funds, no 2× Bitcoin funds, no rotation, no LLM picks. Each was tested in round 3 and rejected for the reason its track gives (track 38 §8).
7. **Paper first.** The book runs on paper for at least 3 months; going live at 25% is an operations gate; the growth book cannot be promoted on edge evidence (3 switches a year per sleeve would take decades), so promotion is on operations and risk-control evidence, with your explicit acceptance of D (§7).
8. **Today (Friday 25 / Sunday 27 September closes):** both index filters are in, the Bitcoin switch is on. The first email would buy SSO, QLD and IBIT (3 orders); the SGOV for the reserve follows a week later (§11).

---

## 1. Your constraints and what they imply

**"Largest return with reasonable risk tolerance."** Read as track 34's objective: maximise expected log growth subject to P(10-year drawdown > D) ≤ 10%, D = 40% by default. Track 38 §3 gives the frontier for D = 30/40/50% under three beliefs (the design's forward view, a repeat of 2008–2026, and a 50/50 blend); §5 justifies D = 40%.

**"At most one recommendation a week"** (track 32 decision D4, default reading): one email per Monday-to-Sunday week carrying one target portfolio and at most 3 orders; a "no change" note does not count; the monthly review is a report. The exit-only Rule E email (§3a) is the one exception, and it is your decision (§12).

**"Don't give me wrong."** Every number in this design carries its forward-central value next to its historical one; the central case is the one to plan on. The book is sized so that the world in which the forward view is right (equities barely beating T-bills) still beats SPY with no > 40% decade, and the world in which history repeats is fully participated in.

**Venues (track 32).** Every switching sleeve lives in the **Robinhood IRA with limited margin** (same-day switching, no borrowing, no tax on switches). The taxable account holds only what is never sold. Coinbase is not used for the switch. All orders are the three kinds of v3.3 §3a; nothing else.

**Instruments and account size.** SSO, QLD, IBIT and SGOV take dollar market orders at any size (track 32 §1.1). The paper IRA is $80k; the growth book uses 100% of it. Track 32 §3.6: a real $80k IRA needs existing IRA or 401(k) money moved in (decision D1); if the real IRA is smaller, the book scales down, it does not move to the taxable account.

---

## 2. What round 3 found

| Track | Question | Finding, honestly | Used in v4 as |
|---|---|---|---|
| 26 | 2×/3× index trend core | 3× S&P +6.5 points since 1929 with a −92% drawdown; forward below SPY; not distinguishable from luck after 2,616 variants. 2× on paper at most. | G1's rule (weekly 200-day filter, SGOV when out); 3× rejected |
| 27 | Momentum rotation | Lost to SPY out of sample in every unlevered universe; winners were the asset list or leverage | Never-list, extended to leveraged rotation |
| 28 | Aggressive crypto sleeve | 10-week + 200-day switch via IBIT at 30% (half Kelly, 50% ceiling): +13 points in 2014–26, +1.5 to +4 forward; 2× Bitcoin ETFs bleed 13–19% a year | G2's rule and size |
| 29 | Single-stock momentum | About +2 points after bias, one regime, −68% drawdowns | Rejected |
| 30 | Options as leverage | 1.3–5% a year per unit of exposure; at best ties the ETF | Rejected; LETFs are the vehicle |
| 31 | The growth portfolio | Kelly under model uncertainty; book C (2× 80% + BTC 20%) 7.6% forward / 29.6% history; the wide governor; IRA placement | The simulator; the cadence; the governor idea |
| 32 | Venues, taxes, cadence | Everything executable; IRA with limited margin; "out" = SGOV; the Sunday order set; Rule E | §3a, §9 |
| 34 | Is 100% a year feasible? | No (Sharpe > 1.1 sustained); the objective becomes growth subject to a drawdown limit | §0, §1 |
| 35 | The gems census | Five rules worth +2.7 points a year (+11 in a crash year), not a large margin | G3's reserve |
| 36 | The century view | Decade winners were never the momentum leader; no new module | — |
| 37 | An LLM reading the world | −2.0 to +0.8 points for a weekly pick; veto-only stays | — |
| **38** | **The synthesis** | **The frontier by D and belief; the book; the governor; the sensitivities** | **This design** |
| 33 | The strategy zoo | Still running; its rows go into track 38 §10 when it lands | — |

---

## 3. The rule book

**Status labels** are v3.3's: *policy module* (a pre-registered rule you approve, exempt from the per-trade growth hurdle and the buy-and-hold test), *paper*, *shadow*. The growth book is **one policy module with three sleeves**, one order budget (≤ 3 a week) and one governor. Its sleeves are continuing positions re-decided weekly (decisions 5 and 11); the 60/90-day holding caps of v3.3 do not apply to them.

### G1 — leveraged index trend (successor of M2; tracks 26, 31)

- **Legs.** SSO (2× S&P 500) at **25% of NAV** and QLD (2× Nasdaq-100) at **25% of NAV**, each decided on its own index.
- **Signal, after Friday's close, on two-source-checked closes** (^GSPC for SSO; ^NDX for QLD): the index close against its 200-day simple average of closes including that day.
  - **Enter** when out and the close is **≥ 2.0% above** the average; **exit** when in and the close is **≥ 2.0% below** it; otherwise hold the state (track 26 §2.2's 2% band: 1.1 orders a year per leg instead of 3.4, with no measurable return cost). *Simulation note:* tracks 31 and 38 simulate the band-free weekly rule (3 switches a year per leg); the replay (Appendix A) runs both, and the pre-registered rule is the banded one.
  - Data disagreement on any leg: no signal for that leg, event logged.
- **Execution.** Dollar market orders queued Sunday night for Monday's 9:30 ET open (kind (a)): to enter, "Sell SGOV $X, then Buy SSO $X" (or QLD); to exit, "Sell all SSO", then "Buy SGOV" with the proceeds. Monday holiday: Tuesday, said in the email.
- **Out** means SGOV (IRA cash earns nothing, track 32 §1.2).
- **Size.** 25% of NAV per leg × G (the governor, §4), re-sized only outside the 25% band (§4).
- **Expected (track 38 §2, §5):** the two legs alone made 17.7% a year in 1986–2026 on the real path with a −60% worst drawdown (2000–02) and a −15.6% worst day; at the book's 50% weight the crash episodes were 1987 −13%, 2000–02 −28%, 2007–09 −9%, 2020 −17%, 2022 −12%. Forward the legs earn 2.4% and 3.2% a year (volatility drag at a 0.3-point premium); they are in the book for the world in which history's premium returns (+11 points to the book if 2008–2026 repeats).
- **Kill / review.** A leg is sold to SGOV if its fund is closed, de-levered or halted by the issuer, or if its 20-session tracking against 2× the index exceeds 3 points; review at the annual meeting against the SPX1/NDX1 filtered shadows.

### G2 — Bitcoin switch (successor of M3; track 28 §9, track 31 §3.1)

- **Instrument.** IBIT in the IRA (FBTC as the backup). No Coinbase leg, no 2× fund.
- **Signal, after the Sunday 00:00 UTC weekly close** (the Sunday UTC daily candle, as M3 uses today, from `btc_daily_utc()`): **on** when the Sunday close is above its 10-week average of Sunday closes **and** above its 200-day average of daily UTC closes; **off** otherwise. No band. Two-source rule as for M3.
- **Execution.** "Buy IBIT $X" or "Sell all IBIT" queued for Monday's 9:30 ET open; "out" is SGOV.
- **Size.** **30% of NAV** × G. Hard ceiling 50% (owner decision 2); track 28's half-Kelly is 30%, its full Kelly about 60%.
- **Rebalance.** Only when the switch flips or IBIT's weight drifts more than 25% from target (track 28 §9).
- **Expected (track 38 §2):** 2014–2026, 61.9% a year with a −44% worst drawdown, in the market 48% of weeks, 6.2 switches a year; forward 11.6% a year with a −70% drawdown (κ 0.29). It is a risk switch plus Bitcoin beta, not alpha (alpha t 0.63 out of sample).
- **Kill / review.** If Bitcoin's 60-day realised volatility stays above 70% for a quarter, the size is cut by a third until it falls below 60% (track 28 §9). At each annual review the forward drift is re-estimated from the rolling four-year CAGR; below 10% the half-Kelly weight becomes 20%. A Bitcoin cycle top below about 1.3× the 2025 peak (about $165k) confirms the decay and argues for 20% (track 31 §10).

### G3 — the gems satellite (track 35 §6; shadow first)

- **Reserve.** **15% of NAV**, held in SGOV until a rule is promoted; then each promoted rule takes its slots from the reserve.
- **G3a, CEF crash-discount buy** (track 35 G2, extends track 24's shadow): a closed-end fund's discount ≥ 2.5 standard deviations below its 252-session mean at the close, NAV published the same evening, fund leverage ≤ 35%, price ≥ $5, ADV ≥ $1m; 2 slots of 5% of NAV, widest discount first; exit at the last session within 60 calendar days or when the discount is back at its mean; crash mode (≥ 10 triggers in a week): stagger entries over 3 weeks. Entry in the Sunday email (Monday open). Promotion: ≥ 30 shadow trades with mean excess over random entry ≥ +1.5% per 60 sessions and a positive median in both halves.
- **G3b, crypto-trust discount with a filed catalyst** (track 35 G1): a US-listed closed-end crypto trust without redemptions at a discount ≤ −25% for 5 closes with a conversion filing (S-1/S-3/19b-4) or a dated decision within 120 days; 5% of NAV; exit at discount ≥ −3% for 3 closes, at conversion, or on withdrawal. Never a premium. Promotion: 3 resolved episodes with mean excess over the coin ≥ +10%. Expected to retire by 2028.
- **G3c, post-devaluation country ETF** (track 35 G3): shadow only; it needs 12-month holds as a monthly re-decided trend slot and is an owner decision (§12).
- **Not in G3:** SPAC cash-plus (tender instructions are not one of the three order kinds) and prediction-market favourites (a data source by decision 3).
- **Expected (track 38 §1, an estimate):** about +1 point of NAV a year forward, +3.7 in history, most of it in the year after a crash; sleeve drawdown about −12%.

### W10 — uptrend crash-day buy (unchanged rule; folded into the Sunday email)

- Rule, size (6% of NAV × G), exit (the last session within 90 calendar days) and kill switch as v3.3 §3 W10, with one change: **entry at the open after the next Sunday email** (a −3% day on Tuesday is bought the following Monday). Track 31 Table 10: the weekly clock leaves W10's record unchanged (92% winners, +6.1% mean). It is funded from the SGOV cash (the reserve first, then the out-of-market sleeves' SGOV), takes the lowest order priority (§3a), and is skipped for that week (and logged) if the email already carries 3 orders.

### The book-level governor and the hard stop (track 38 §4)

- **Drawdown** = 1 − NAV ÷ peak NAV, both marked at Friday's close over the IRA and the taxable account together; the peak starts at go-live and at every restart.
- **G(drawdown) = 1** until 15%, **linear to 0.25 at 35%**, 0.25 beyond. Re-set every Sunday; it multiplies every sleeve's target (G1, G2, G3, W10). It only rises again as the NAV recovers. (For D = 30%: 1 until 10%, 0.25 at 25%; for D = 50%: track 31's wide governor, 1 until 20%, 0.25 at 50%.)
- **Hard stop at D (40%):** every position is sold to SGOV at the next open, the book goes to paper mode, and it restarts only after a review with you. Its cost in the simulation is nil (the governor keeps the 10-year probability of reaching it at 0% in every belief set); it exists because the model can be wrong (§13).
- **What it does to the numbers:** −0.4 points of forward growth and −0.4 historical, for P(drawdown > 40% within 10 years) 19% → 0% and within 20 years 37% → 0% (track 38 Table 3).

### Every v3.3 module, its new status

| Module | v4 status | Why (track 38 §7) |
|---|---|---|
| M1 dip-buy | **Shadow** (ST-1 and ST-1b keep logging) | Its 1–5 day trades need a daily clock; worth 0.05–0.10% |
| M2 monthly trend book (ETF8) | **Retired; shadow series kept** | Replaced by G1 at the size the objective needs |
| M3 Bitcoin switch (3%) | **Superseded by G2** (30%, 200-day condition added) | The sleeve carries the book |
| W10 crash-day buy | **Policy module, in the Sunday email** | Unchanged record on a Monday entry |
| M4 crash call spread | **Shadow** (the 60- and 90-DTE twins keep running in the options job) | Re-admission to the Sunday email is decision 6 |
| M5 W8 / W9 | **Shadow** | Event edges fade within days |
| M6, M7, EDGAR screens, the option, crypto and macro shadow books | **Shadow, unchanged** | Free evidence |
| The LLM veto (W8/W9) | Dormant while W8/W9 are shadow; the pinned model and hashed prompt stay in the constitution | — |

---

## 3a. Execution standard (v3.3 §3a plus track 32)

1. **Venues.** Growth-book sleeves and SGOV in the **Robinhood IRA with limited margin turned on** (decision 3). The taxable $20k holds VOO (or SGOV), never sold, never the IRA's switching families (wash-sale guard, track 32 §3.3). Coinbase unused.
2. **Three order kinds only,** unchanged: (a) a dollar market order queued for the 9:30 ET open; (b) a two-leg vertical at one net limit (shadow modules only now); (c) a Coinbase dollar market order (unused). No stops, brackets, market-on-close or overnight-session orders.
3. **The Sunday order set (track 32 §4.2):** each sleeve states its dollar target; orders are netted per ticker (two sleeves selling SGOV is one SGOV order); changes smaller than 25% of the target or $300 are skipped; the survivors are ranked **exits and governor cuts first, then the largest buys, then the SGOV buy, then W10**; the first 3 go in the email, the rest are deferred to the next week and the email says so. The SGOV buy of idle cash may always wait a week (a week of idle cash costs about 0.08% of the amount).
4. **Two steps:** Step 1, Sunday night or before 9:20 Monday: the sells. Step 2, Monday from about 9:35 ET when the sells show "Filled": the buys, each at most 95% of the cash it needs (Robinhood reserves 5–10% on queued market orders; a queued buy uses at most 90% of the cash shown). Without limited margin, Step 2 is Tuesday.
5. **"Sell all"** for exits, never a dollar-based sell (it covers at most 95% of a position).
6. **Monday holidays** fill on Tuesday, stated in the email.
7. **Rule E (track 32 §4.4), the only mid-week email, exit-only:** if an index closes below its 200-day average on any weekday (the G1 rule checked daily, no band), a short EXIT email after the close: "Sell all SSO (or QLD)", queued for the next open, "buy SGOV any time this week". At most one a week and 6 a year; scored in the ledger against "waiting for Sunday"; dropped at the annual review if its running value is negative. The Bitcoin sleeve has no mid-week exit (no tested trigger). *Your decision 5; default on.*
8. **At most 3 orders per email; the risk box** of track 32 §6 in every email that carries a leveraged fund.
9. **Whitelist.** SSO, QLD, IBIT, FBTC, SGOV, BIL, SPY, VOO; the G3 universes are whitelisted per rule. `check_venues.py` re-runs monthly; a failed check blocks the email.

---

## 4. Portfolio rules

| Rule | Setting |
|---|---|
| Idle cash | SGOV in the IRA (cash earns 0% there); T-bill ETF or cash in taxable |
| Sleeve weights | G1 25% + 25%; G2 30%; G3 reserve 15%; SGOV 5%; W10 6% from the SGOV cash. All × G |
| **Drawdown limit D** | **40%** (config `growth.drawdown_limit`); the governor and the hard stop derive from it (§3). D = 30% and 50% are the alternatives in §12 |
| **Governor** | G = 1 to a 15% book drawdown, linear to 0.25 at 35%, weekly. Replaces v3.3's G(D) (5% → 15%) for the growth book; v3.3's G(D) would halve a leveraged book's growth (track 31 §6) |
| **Hard stop** | Book drawdown ≥ D: everything to SGOV, paper mode, owner review |
| **Leverage cap** | Equity exposure ≤ 1.0× NAV (two 2× legs at 25% each); gross exposure when everything is in ≤ 1.5× NAV. **No margin loans, no 3× funds, no options as leverage.** An invariant change from v3.3's "no gross above 1.0×" (decision 4) |
| **Crypto cap** | 30% of NAV; ceiling 50% by owner decision; never a 2× fund |
| Single names | Only inside G3's promoted rules, ≤ 5% each, ≤ 2 open |
| Rebalance bands | A sleeve is re-sized only when its weight drifts more than 25% (relative) from its target, or when G changes by ≥ 0.10 since the last order, or on a switch. Orders under $300 are skipped |
| Order budget | ≤ 3 orders per Sunday email; ≤ 52 recommendation weeks a year plus ≤ 6 Rule E exits (replaces v3.3's 100 trades a year) |
| Stress and clusters | The growth book is one sleeve for v3.3's stress and cluster rules; its stress is the drawdown limit itself, controlled by the governor, the weekly cadence and IRA-only placement (track 31 §10, invariant 3). The per-trade 2% stress cap and the 7% US-equity cluster do not apply to it |
| Circuit breakers | v3.3's daily −2% / weekly −4% breakers do not pause the growth book's rule exits or governor cuts; they still pause any discretionary entry |
| Time stops | None for G1, G2 (continuing positions); 60 calendar days for G3a; 90 for W10 |
| Accounts | `account.yaml`: **IRA $80k, limited margin on**: the whole growth book; **taxable $20k**: VOO held (or SGOV); Coinbase off. Each fund family in exactly one account; the ±30-day wash guard extends to "same index, same multiple" (track 32 §3.3) |
| Taxes | Every switch is in the IRA; the email's tax line names the account; nothing in the IRA is withdrawable before 59½ without the 10% penalty (track 32 §3.2) |

---

## 5. Never recommend (v3.3 §5 plus round 3)

Added to the v3.3 list:
- 3× leveraged funds as a core position (track 26); leveraged rotation or leveraged trend switches beyond G1's two legs (track 27);
- 2× Bitcoin or Ether funds (track 28 §7);
- options as the leverage vehicle: rolled deep-in-the-money calls, call spreads, PMCCs, ATM barbells (track 30);
- concentrated single-stock momentum books and daily-reset single-stock ETFs (track 29);
- a "strongest asset on Earth" rotation at any leverage (track 36);
- any LLM-generated trade (track 37; the LLM stays a veto);
- margin loans in any account; Coinbase spot for the Bitcoin switch;
- buying a crypto trust at a premium (track 35 #40);
- Bitcoin above 50% of NAV.

The v3.3 list stands, including "trend lookbacks under 6 months (except the pre-registered crypto switch)" and "sector or country rotation".

---

## 6. Expected results, honestly (track 38 §5–§6)

Ten-year outcomes with the governor, before tax, in the IRA; SPY on the same simulated paths.

| | Forward-central (plan on this) | 50/50 blend | Historical-repeat (2008–2026) |
|---|---|---|---|
| Median 10-year CAGR (10th–90th percentile) | **9.5% (1.7–18.3%)** | 20.6% (3.8–42.9%) | **34.5% (22.5–47.7%)** |
| SPY, same paths | 5.0% (−2.2 to 11.0%) | 8.1% | 11.8% (4.2–18.2%) |
| P(beat SPY over 10 years) | 77% | 88% | 100% |
| P(beat SPY by ≥ 5 points a year) | **47%** | 73% | 99% |
| P(drawdown > 30% / > 40% / > 50% within 10 years) | 38 / 0 / 0% | 23 / 0 / 0% | 8 / 0 / 0% |
| Median maximum drawdown | 28% | 26% | 23% |
| P(ending below the start) | 5% | 3% | 0% |
| Median years to 2× (10th percentile of paths) | **6.4 (2.4)** | 3.3 (1.4) | **2.1 (1.1)** |
| Median years to 10× (10th percentile) | **24 (14)** | 12 (6) | **7.6 (5.2)** |

**Sensitivities (forward, track 38 Table 5; the base case on the same draws is 9.7%):** Bitcoin flat for the decade 9.0%; flat with no timing edge **7.0%**; Bitcoin at 15% a year 10.6%; financing a point dearer 9.2%; the gems reserve kept in SGOV 8.4%. In a taxable account the book would lose 1.4–2.2 forward points a year to short-term tax (3–5 in history), which is why it lives in the IRA.

**Worst historical years** (the equity part at its 50% weight, real path, no governor): 2000 −23%, 2011 −18%, 1990 −11%, 2022 −12%, 2015 −9%; a year in six is a whipsaw year in which the 2× legs lose 10–20% of NAV while the index goes nowhere. The whole book since April 2015: 35.9% a year, worst drawdown −22%, worst calendar year 2022 (−10%). **A 1987-style day** costs about 30% of NAV before any rule can act; the governor then cuts size to 46% at the next Sunday.

**The honest one-liner:** in the central case this is about 9–10% a year, with one path in ten below 2%; it makes 30–35% a year only if the last decade repeats. Its central edge over SPY is Bitcoin's decayed cycle plus rebalancing across three weakly correlated sleeves; the leveraged equity core is a bet on history's premium returning, sized so that losing that bet costs about half a point a year.

**Years to 10× at the central rate:** about 24 (against 44 for SPY and 48 for the v3.3 book).

---

## 7. Paper trading and go-live

1. **Paper phase.** Minimum 3 months of Sunday emails from the real pipeline, with the fill model v1.0 (ETFs at the next open plus slippage) and a Robinhood practice account in parallel. The replay of Appendix A must reconcile before the paper phase counts.
2. **Going live at 25% (operations gate, as v3.3 §7.2):** ≥ 3 months of paper; ≥ 95% of Sunday runs on time; 0 validator failures; practice-vs-model fills within tolerance (ETF median gap ≤ 10 bp); ≥ 90% of emails handled within the stated window; the ledger verifies; **and your written acceptance of D, the governor and the hard stop.**
3. **Promotion basis (a change from v3.3 §7.3; decision 9).** The growth book is a pre-registered allocation, not an edge claim; at 3–6 switches a year per sleeve, an edge gate would take decades. Its ramp is on **risk-control evidence**: every governor cut, every switch and every Rule E exit executed as specified, fills within tolerance, no kill-switch event, no unhandled email. **50%** after ≥ 6 months live with those conditions; **100%** after ≥ 12 months. The edge evidence (the tracks' records, the shadow series of the same rules) is reviewed annually and can only demote.
4. **Demotion.** The hard stop (§3) or two governor floors (G = 0.25) within 3 years sends the book back to paper for a review with you. G3 rules are promoted and demoted on their own track 35 tests.

---

## 8. Calibration and review

- **Weekly (the Sunday job):** the target portfolio, G, the order set, the "why" lines, the shadow books.
- **Monthly review email:** NAV, drawdown from peak, G, each sleeve's state and weeks in/out, orders sent and filled, fills vs model, the projection block (median wealth and P(drawdown > D) from the standing distribution, updated for the current drawdown), Rule E's running score, the shadow books' meters. No rule changes.
- **Quarterly:** costs and slippage; Bitcoin's realised volatility test (§3 G2); G3 promotion tests; κ̂ for the shadow modules.
- **Annually, with you:** D; Bitcoin's forward drift and weight; G1's legs against their 1× shadows; the 200-day band; Rule E; W10; the never-list. A parameter changes only with evidence before and after 2008 and a multiple-testing bar for the variants tried, as v3.3 §8.

---

## 9. The Sunday email (changes to `11-trade-email-spec.md`)

- **Timing.** Sunday about 21:17 ET (the existing `weekly` job; 20:17 in winter), after Bitcoin's 00:00 UTC weekly close and Friday's index closes. Orders queue for Monday's open.
- **Label:** PAPER or LIVE; the module (GROWTH), its stage, the week's number.
- **Body, in this order, plain English:**
  1. *One line:* "This week: no change" or "This week: 1 recommendation, N orders".
  2. *Target vs now:* SSO / QLD / IBIT / SGOV / gems / cash, as % of the IRA and in dollars; G and the drawdown from peak.
  3. *The why:* one sentence per sleeve that changed, with the numbers ("S&P 500 closed 7,743 on Friday, 7.5% above its 200-day average of 7,205: stays in"; "Bitcoin's weekly close $84,458 is above its 10-week average $73,468 and its 200-day average $71,073: switch on"; "Book is 17% below its peak: size 0.93").
  4. *Step 1 (tonight or before 9:20 Monday):* the sells, "Sell all X".
  5. *Step 2 (Monday after 9:35 ET, when Step 1 shows Filled):* the buys, "Buy $X of Y, market, in dollars", each at most 95% of its cash.
  6. *Deferred:* what waits until next week, if anything.
  7. *Risk lines:* the leveraged-fund risk box (track 32 §6, with the fund's own numbers); "a 1987-style day costs this book about 30% before any rule can act"; "the hard stop sells everything at −40%"; the IRA withdrawal line.
  8. *Robinhood steps* (≤ 7 taps with exact values), the what-if block, the Monday-holiday line, the tax line, the sources with their two-source checks.
- **Validator.** Every number in the email is checked against the facts record (value and slot), as v3.3 §10; the risk box is mandatory when SSO, QLD or IBIT is bought or held.
- **Rule E email:** ≤ 10 lines: the trigger with its numbers, "Sell all X, market, queued for the next open", "buy SGOV any time this week", the score line ("this exit is scored against waiting for Sunday").
- **No LLM at run time** (as built in v3.3): templates filled from structured facts.

---

## 10. Architecture and build plan

```
 GitHub Actions (private repo). Cron in UTC with a DST table; healthchecks.io alerts.
   Sunday 21:17 ET   the growth job: ingest (Friday closes, Sunday BTC close; two sources) → G1/G2 signals,
                     G3 candidates, W10 → NAV, peak, drawdown, G → targets → order set (netting, bands,
                     ranking, ≤ 3, deferral) → paper broker (fills at Monday's open on Monday's run) →
                     ledger → the Sunday email → Gmail → healthchecks ping
   22:17 ET Mon–Fri  the daily run keeps running: data, snapshots, the shadow books (M1/ST-1b, M2 series,
                     M4 twins, W8/W9, EDGAR, macro), paper fills for Monday's queued orders, the W10 signal,
                     the Rule E check (exit-only email if it fires), the G3a/G3b screens
   10:17 ET Mon–Fri  the options job keeps running for the option shadow books and M4's paper twins
   hourly, 24/7      the crypto job keeps running (depeg shadow; Bitcoin daily UTC closes for G2)
   1st of month      the monthly review; quarterly and annual jobs on their dates
```

**Phase C (the growth book; about 3 weeks for two builders):**
- C1: config block, G1/G2 signals and state, the governor and hard stop, the order-set builder, tests (Appendix A);
- C2: the Sunday email renderer and validator changes, the paper broker's limited-margin and SGOV rules, the account changes, Rule E;
- C3: the replay 2014–2026 through the real pipeline and its reconciliation with track 38; the 1986–2026 G1-only replay with proxy fund bars; the docs.
- Then the paper phase (§7).

**Cost:** unchanged (about $5 a year of API for the dormant veto; GitHub Actions minutes as today plus one Sunday job).

---

## 11. State on 29 September 2026 (from the 25/27 September closes)

| Sleeve | State | Numbers |
|---|---|---|
| G1 SSO | **In** | S&P 500 7,743 on 25 Sep vs its 200-day average 7,205 (+7.5%); exit trigger a Friday close ≥ 2% below the average, about 7,060 (track 26 TL;DR) |
| G1 QLD | **In** | Nasdaq-100 above its 200-day average (track 27 §5: QQQ and SMH lead; track 36 §5: SOXX +130% over 12 months) |
| G2 IBIT | **On** | Bitcoin $84,462 at the 27 Sep Sunday close vs its 10-week average $73,468 and 200-day average $71,073 (track 28 §11); it switches off on the first Sunday close below either |
| G3 | SGOV | No promoted rule; the CEF rule has fired 12 times in 2026 on paper (+4.9% mean, track 35 §3.3); the PIMCO funds sit at −2 to −8% discounts |
| W10 | Armed, not firing | S&P +6.6% above its 200-day average; a −3% close (about 7,453) triggers it |
| Governor | G = 1 | The peak starts at go-live |

**The first Sunday email (paper, $80k IRA):** Step 1: none (the IRA is in cash). Step 2 (Monday after 9:35 ET): **Buy SSO $20,000; Buy QLD $20,000; Buy IBIT $24,000** (3 orders, 80% of NAV). Deferred to the following Sunday: **Buy SGOV $16,000** (the reserve and the cash). Both index filters and the switch are in, so the book starts fully invested; the risk box says so.

---

## 12. Decisions for you (defaults apply until you answer)

| # | Decision | Options | **Default** | Why |
|---|---|---|---|---|
| 1 | **The drawdown limit D** | 30% / **40%** / 50% | **40%** | Track 38 §5: safer than SPY on every measure, recoverable, cheap against 30% (−0.4 forward points) and 50% (+0.4 points for a 1-in-5 chance of a −40% decade). The governor and hard stop scale with it |
| 2 | **Bitcoin weight** | 20% / **30%** / 40% (50% ceiling) | **30%** | Track 28's half Kelly; every step of 10% adds about 1.1 forward points and 4 historical, and drawdown |
| 3 | **Equity leverage** | none (SPY 40%) / **2× (SSO + QLD, 25% each)** / 3× | **2×** | The forward world prefers no leverage (9.9% vs 9.5%); history prefers 3× (41.5% vs 34.5%); 2× is the blend's choice among survivable vehicles; 3× is rejected for gap risk (track 26 §4, track 30 §5) |
| 4 | **Nasdaq-100 leg** | SSO only / **SSO + QLD 50/50** | **50/50** | Better in every belief set than SSO alone (track 38 grid: +0.8 forward points, +2.7 historical), at half the 2000–02 damage of QLD alone |
| 5 | **Rule E, the exit-only mid-week email** | outside the weekly cap / only when the week's slot is unused / none | **outside the cap, ≤ 6 a year** | Track 32 §4.3: never lowered return, halved 1987's worst week |
| 6 | **M4 (crash call spread) in the Sunday email** | shadow / re-admit as a Monday 10:00 order in the taxable account | **shadow** | +0.04% a year on 12 episodes; it needs Monday-morning attention |
| 7 | **The gems reserve** | 15% shadow-first / 0% / live now | **15%, shadow-first** | Track 35's promotion tests before real money; SGOV meanwhile |
| 8 | **G3c post-devaluation country ETF** (12-month holds) | shadow / monthly trend slot | **shadow** | n ≈ 7; needs the monthly-trend reading of decision 5 |
| 9 | **Promotion basis for the growth book** | risk-control evidence (§7) / the v3.3 edge gate | **risk-control evidence** | The edge gate cannot be met in decades at 3–6 switches a year |
| 10 | **IRA facts** (track 32 D1–D3, D11): size and type; limited margin; in-app checks (SSO, QLD, IBIT buyable in the IRA; one-off dollar orders) | — | **turn limited margin on; do the checks before the paper phase ends** | Without limited margin every switch takes Monday plus Tuesday |
| 11 | **The taxable $20k** | VOO held / SGOV / the M4 account | **VOO held, never sold** | Tax-efficient; a different multiple from the IRA's funds |
| 12 | **A "WSB mode" variant** (D = 50%: Bitcoin 40%, wide governor) | on / **off** | **off** | +0.4 forward points for a 24% chance of a −40% decade and 6% of −50% |
| 13 | **24-hour-market limit orders for IBIT on Sunday night** (track 28 §8) | allow / **keep the ban** | **keep the ban** | Recovers 1–2.5 sleeve points a year, but whole-share limit orders only, IRA eligibility unverified, and the design's overnight-order ban |
| 14 | **The LLM shadow test of track 37** | run / **do not run** | **do not run** | Not part of the growth book; $7–73 a year; needs its own decision on the "no LLM in shadow books" rule |

`DECISIONS.md` gets rows 13–26 when you answer; until then the defaults are the build.

---

## 13. Red team (what could make this wrong)

1. **The forward case is an assumption with Bitcoin at its centre.** 30% of NAV rides a three-cycle extrapolation. If Bitcoin is flat and the switch has no edge, the book makes 7.0% (still above SPY's 5%) with a 9% chance of ending a decade below the start (track 38 Table 5). If Bitcoin is impaired (regulation, a protocol failure), the sleeve's worst case is −100% of 30% of NAV over time; the switch and the governor cut most of a slow decline, none of a sudden one.
2. **Gaps.** No weekly rule can dodge a one-day crash: a 1987 day costs about 30%, a March-2020 week about 17% on the equity part. The governor acts a week later. The hard stop at −40% can itself be a bad exit (selling into the low); it is there because the model's 0% is a model's 0%.
3. **The bootstrap understates long bears.** The real 2000–02 path cost the equity part 28% of NAV at 50% weight and the Nasdaq leg −68%; the governor was not in that number. Appendix A's 1986–2026 replay runs the governor through 1987, 2000–02 and 2008 on proxy fund bars.
4. **Cash lock and whipsaw.** After a 35% drawdown the book runs at 25% size until the NAV recovers; in a whipsaw year (one in six) the 2× legs lose 10–20% of NAV while the index goes nowhere. Both are the price of the limit, and both are pre-committed so that no one has to decide them in the moment.
5. **Daily-reset drag and fund risk.** The legs return 2× the daily index, not 2× over years; an issuer can close or de-lever a fund in a crisis, and Robinhood's leveraged-product acknowledgement in the IRA is unverified (decision 10).
6. **The gems reserve is an estimate** with n = 2 crash episodes and 5 conversions; it is shadow-first for that reason, and the book's forward growth without it is 8.4%.
7. **Execution.** Limited margin must be on; queued buys need 10% headroom; a Monday holiday delays everything; Rule E sells into the next open, which can be a gap-down open (28 February 2020).
8. **Taxes and access.** The IRA is the only place this works (1.4–2.2 forward points otherwise), and IRA money is not spendable before 59½ without a 10% penalty: a "get rich" book whose proceeds cannot be spent quickly (decision D2 of track 32).
9. **Behaviour.** A median 28% drawdown and 38% odds of a 30% one within a decade will feel like failure at least once. The paper phase and the monthly projection block exist so that the drawdown, when it comes, is the one that was promised.
10. **Model risk in the governor's tuning.** The D40 governor (15 → 35) was chosen from five candidates on the same simulations; its edges (15%, 35%) are round numbers, not fitted ones, and the alternatives are listed in track 38 Table 3 with their costs.

---

## 14. For the WSB reader

> **What this tool does.** Once a week, on Sunday night, it tells you exactly what to hold in your Robinhood IRA: two 2× index funds (SSO, QLD) while their indexes are above their 200-day averages, a Bitcoin ETF (IBIT) while Bitcoin is above its 10-week and 200-day averages, and a T-bill ETF (SGOV) for everything that is out. At most 3 orders, all plain dollar market orders. It cuts the whole book's size when it is 15% below its peak and sells everything at −40%, so you keep the account. It keeps a scored record of every call.
>
> **What it does not do.** No options YOLOs, no single names (outside two small, pre-registered special-situation rules that are on paper until they prove themselves), no margin loans, no 3× funds, no 2× crypto funds, no rotation into whatever is hot, no AI stock picks, no promises of 100% a year.
>
> **Why the leverage is only through ETFs and only in uptrends.** Round 3 tested the alternatives: options cost 1–5% a year more than the ETFs for the same exposure (track 30); 3× funds lose 61% on a 1987 day and were below the index forward (track 26); rotation and stock momentum lost to SPY out of sample (tracks 27, 29); 2× Bitcoin funds bleed 13–19% a year (track 28). What actually compounded over the last century was being in the strong asset during its uptrend and out during its bear market, at a size you can survive (tracks 36, 34). That is the whole tool.
>
> **What to expect.** About 9–10% a year in the central case (SPY about 5% at today's prices), a 1-in-2 chance of beating SPY by 5 points over ten years, a 1-in-3 chance of a 30% drawdown along the way, and 30–35% a year only if the last decade repeats. Doubling money takes about 6 years in the central case and 2 if history repeats.

---

## Appendix A — Build spec for the builders

### A.1 Config: the `growth` block (`config/constitution.yaml`)

```yaml
growth:
  enabled: true                    # paper mode until the s7 gates pass; account.yaml sets paper/live
  drawdown_limit: 0.40             # D: 0.30 / 0.40 / 0.50 (decision 1)
  governor:                        # derived from D unless overridden: full_until = D - 0.25, floor_at = D - 0.05
    full_until: 0.15
    floor: 0.25
    floor_at: 0.35
    reset: weekly                  # re-set on the Sunday run only
    min_step: 0.10                 # re-size only when G moved >= 0.10 since the last order
  hard_stop:
    at: 0.40                       # = drawdown_limit
    action: all_to_sgov_and_pause  # paper mode + owner review before restart
  sleeves:
    G1:
      legs:
        SSO: {weight: 0.25, index: "^GSPC"}
        QLD: {weight: 0.25, index: "^NDX"}
      signal: {sma_days: 200, band: 0.02, decision: friday_close, execution: monday_open}
      out: SGOV
      kill: {tracking_20d_max_pts: 3.0}
    G2:
      instrument: IBIT
      backup: FBTC
      weight: 0.30
      max_weight: 0.50             # decision 2 ceiling
      signal: {weekly_ma_weeks: 10, sma_days: 200, decision: sunday_utc_close, execution: monday_open}
      out: SGOV
      vol_cut: {realized_60d_vol_gt: 0.70, quarters: 1, factor: 0.667, restore_below: 0.60}
    G3:
      reserve_weight: 0.15
      out: SGOV
      rules:
        cef_crash_discount: {status: shadow, slots: 2, slot_weight: 0.05, z: 2.5, lookback: 252, hold_days: 60,
                             leverage_max: 0.35, price_min: 5, adv_min_usd: 1000000, crash_mode_triggers: 10, crash_mode_weeks: 3}
        crypto_trust_discount: {status: shadow, weight: 0.05, discount_le: -0.25, closes: 5, catalyst_days: 120,
                                exit_discount_ge: -0.03, exit_closes: 3}
        country_devaluation: {status: shadow}                      # decision 8
    W10: {weight: 0.06, funded_from: sgov, entry: next_sunday_email, priority: last}
    cash: {weight: 0.05, vehicle: SGOV}
  caps: {equity_exposure: 1.0, gross_exposure: 1.5, crypto: 0.30, single_name: 0.05, single_names_open: 2}
  rebalance: {band_rel: 0.25, min_order_usd: 300, max_orders_per_email: 3, sgov_buy_may_wait: true}
  email: {day: sunday, time_et: "21:17", risk_box: required_for: [SSO, QLD, IBIT]}
  rule_e: {enabled: true, trigger: index_close_below_sma200, max_per_week: 1, max_per_year: 6, exit_only: true}  # decision 5
  accounts: {switching: ira, ira_limited_margin_required: true, taxable_holds: [VOO], taxable_never_holds: [SSO, QLD, IBIT, FBTC, UPRO, TQQQ, SPY]}
modules:                          # status changes (the rest of the v3.3 block is unchanged)
  M1: {status: shadow}
  M2: {status: retired, shadow_series: true}
  M3: {status: superseded_by: G2}
  M4: {status: shadow}            # decision 6
  W8: {status: shadow}
  W9: {status: shadow}
```

`config/account.yaml`: `ira.limited_margin: true` (the paper broker models the one-day wait when false); `ira.nav: 80000`; `taxable.holdings: {VOO: 20000}`.

### A.2 Modules (new or changed)

| Module | File (suggested) | Does |
|---|---|---|
| **G1** leveraged equity trend | `traderec/modules/g1_lev_trend.py` | Per leg: the 200-day SMA of the index (two-source closes, unrounded), the 2% band with hysteresis, the Friday-close decision, the target weight × G; emits `switch` (in/out) and `resize` intents. Also exposes `below_sma_today(leg)` for Rule E |
| **G2** Bitcoin switch | `traderec/modules/g2_btc_switch.py` (extends `m3_btc.py`) | The Sunday UTC weekly close vs its 10-week average and the 200-day average of daily UTC closes; the 25% band; the vol cut; the target × G; `switch` and `resize` intents. M3's data path (`btc_daily_utc()`) and two-source rule are reused |
| **G3** gems runner | `traderec/modules/g3_gems.py` | The CEF and crypto-trust screens (NAV from Yahoo's `X…X` series as the EDGAR CEF screen does; discounts, z-scores, catalysts from the constitution's filing list), shadow entries and scoring, promotion tests; when a rule is `live`, slot intents from the reserve |
| **Governor** | `traderec/growth/governor.py` | `peak_nav`, `drawdown`, `G(drawdown)`, the hard stop; pure functions plus a state update on the Sunday run |
| **Order set** | `traderec/growth/orders.py` | Targets → dollar deltas per ticker → netting → bands ($300, 25%, G step) → ranking (exits and cuts, buys, SGOV, W10) → the first 3 → deferred list; the 90%/95% cash rules; "Sell all" for exits; the Monday-holiday shift |
| **Sunday email** | `traderec/growth/email.py` + templates | §9's body from the facts record; the risk box; the validator's new slots |
| **Rule E** | in the daily run: `traderec/growth/rule_e.py` | The exit-only check and email; the per-week and per-year counters; the "vs waiting for Sunday" score at the next Sunday |
| **Weekly job** | `traderec/jobs/weekly.py` (existing `weekly` run) | Orchestrates: ingest → signals → governor → targets → order set → paper broker → ledger → email |
| **Paper broker** | `traderec/paper/broker.py` (changes) | Limited-margin IRA (buy with unsettled proceeds the same day); SGOV as the cash vehicle with its accrual; queued market orders filled at Monday's official open with slippage; the 5–10% reserve |
| **Replay** | `scripts/replay.py` (extend) | The Sunday run in the loop; proxy bars for SSO/QLD before 2006 (track 04's model on the index, flagged) and for IBIT before 2024 (as today); reconciliation against track 38's CSVs |

### A.3 State and ledger keys

- `state.growth.peak_nav`, `state.growth.drawdown`, `state.growth.G`, `state.growth.hard_stop_hit_on`, `state.growth.paused`.
- `state.growth.sleeves.G1.SSO.{in, since, last_close, sma200, band_state}`, the same for `QLD`; `state.growth.sleeves.G2.{on, since, weekly_close, ma10w, sma200, vol60, vol_cut_factor}`; `state.growth.sleeves.G3.{reserve, rules.<name>.{status, open_slots, shadow_stats}}`; `state.growth.W10.{open, entry, exit_due}`.
- `state.growth.targets` (per ticker: target %, target $, held $, delta $, band, reason), `state.growth.order_set` (the ≤ 3 sent, with ranks), `state.growth.deferred` (what waits), `state.growth.rule_e.{count_week, count_year, last}`.
- Ledger record kinds (hash-chained as today): `growth_decision` (all signals and their inputs, both sources), `governor` (peak, drawdown, G, step), `order_set` (targets, netting, ranking, sent, deferred), `rule_e` (trigger, order, score when resolved), `g3_shadow` (entries, exits, promotion tests). Every email's facts record carries the `growth_decision` and `order_set` ids it was rendered from.

### A.4 Tests to write (offline, synthetic data; no network)

1. **Signals.** G1: the 200-day SMA on a synthetic index; the band (an index oscillating ±1.9% around the average never switches; ±2.1% switches once per crossing); Friday-only decisions (a Wednesday crossing waits); a holiday-shortened week; two-source disagreement → no signal. G2: the Sunday UTC close and the 10-week average of Sunday closes; the 200-day condition (on only when both hold); the vol cut and its restore; the 25% band.
2. **Governor.** G is 1 below 15%, 0.25 at and beyond 35%, 0.625 at 25%; weekly reset only; the peak never falls; the hard stop fires at ≥ 40% and sends everything to SGOV; paused state blocks buys, allows sells.
3. **Order set.** Netting (two SGOV sells become one); the $300 and 25% bands; the G step rule; ranking; the ≤ 3 cut and the deferred list; "Sell all" wording; the 90% queued-buy and 95% market-hours rules; W10 dropped when 3 orders are already used; the Monday-holiday date.
4. **Email.** The validator rejects a rendered number that is not in the facts; the risk box is present whenever SSO/QLD/IBIT is bought or held; Step 1 / Step 2 ordering; the deferred line.
5. **Paper broker.** Limited margin on: a Monday sell funds a Monday buy; off: the buy waits until Tuesday; SGOV accrues; a queued buy above 90% of cash is cancelled and alerted.
6. **Rule E.** Fires on a weekday close below the SMA (no band), at most once a week and 6 a year, exit-only; scored against the Sunday alternative.
7. **A 1987 Monday.** A synthetic −20% index day while both legs are in: the book's loss equals 0.5 × 41% + the IBIT and gems moves given; the next Sunday's G is 0.46 and the email carries the cuts first.
8. **Whipsaw sequence.** A 2011-like path: the legs switch out and in twice; orders per email never exceed 3; the ledger's `growth_decision` chain verifies.
9. **Replay harness.** The Sunday run inside `tests/test_replay.py`'s synthetic market: identical decisions with and without the as-of cut; resume; reconciliation helpers for the new CSVs.

### A.5 Replay plan (before the paper phase counts)

- **2014-11-24 → 2026-09-28 through the real pipeline** (`scripts/replay.py`, as `docs/phase-b/replay.md` did for Phase A), with the IBIT proxy before 11 January 2024 and the real SSO/QLD bars. Reconcile against track 38's `real_path.csv` (the book from 7 April 2015: 35.9% a year, −22% worst drawdown, worst day −7.4% on 3 September 2020; SPY 13.6%, −34%), `calendar_years.csv` and the G2 switch dates (6.2 a year, 48% of weeks on). Tolerances: CAGR within 1 point (the band and weekly band-rebalancing are the expected differences), switch dates within one week, worst drawdown within 3 points. Count orders per email: none above 3, about 13 emails with orders a year.
- **1986-07-01 → 2026-09-28 for G1 alone** with proxy fund bars (track 04's model on ^GSPC and ^NDX, financing at T-bills + 0.4%, 0.9% fee), flagged in every output; reconcile against `real_path.csv` (17.7% a year, −60%) and `episodes.csv` (1987 −13%, 2000–02 −28%, 2007–09 −9% at the 50% weight); then the same path with the governor to record what it would have done in 1987, 2000–02 and 2008.
- **Look-ahead check:** identical decisions with and without the as-of cut, as the Phase A replay verified.
- Findings go into `docs/phase-c/replay.md` and, where a rule had to be interpreted, into Appendix B of this document (as v3.3's Appendix C does).

### A.6 Docs to update

`docs/OPERATIONS.md` (the Sunday job, limited margin, the two-step order routine, Rule E), `docs/INTERFACES.md` (the new records and state keys), `docs/phase-c/growth.md` (new: the build notes), `docs/phase-c/replay.md`, `research/11-trade-email-spec.md` (§9's changes), `research/DECISIONS.md` (rows 13–26 when answered), `config/whitelist.yaml` (SSO, QLD, IBIT, FBTC, SGOV, VOO with `venue_check_32.json` rows), `README.md` (the objective and the book).

---

## Appendix B — Changes from v3.3

| Change | Where | Source |
|---|---|---|
| The objective: expected log growth subject to P(10-year drawdown > D) ≤ 10%, D = 40% | §0, §1, §4 | Track 34 §5.1; track 38 §0, §5 |
| One growth-book policy module with three sleeves replaces the Phase A book as the live book; M1, M4, W8/W9 to shadow; M2 retired; M3 superseded by G2 | §3 | Tracks 31 §5.2, 32 §4.5, 38 §7 |
| G1: SSO 25% + QLD 25% on weekly 200-day filters with a 2% band, SGOV when out | §3 | Tracks 26 §2–§3, 31 §3, 38 §2–§5 |
| G2: IBIT 30% on the 10-week + 200-day switch (was M3 at 3% on the 10-week rule) | §3 | Track 28 §9; track 38 §2, Table 5 |
| G3: a 15% reserve for track 35's CEF and crypto-trust rules, shadow-first | §3 | Track 35 §6; track 38 §1 |
| W10 folded into the Sunday email with a Monday entry | §3 | Track 31 Table 10 |
| The governor: full size to −15%, 25% at −35%; hard stop at −40%; replaces G(D) 5 → 15% for this book | §3, §4 | Track 38 §4 (Table 3); track 31 §6 |
| Leverage cap 1.0× equity / 1.5× gross; crypto cap 30% (ceiling 50%); stress and cluster caps do not apply to the book | §4 | Track 31 §10 invariants 1–3; track 38 |
| One Sunday email, ≤ 3 orders, sells first, limited margin, SGOV as "out"; Rule E as the one mid-week exception | §3a, §9 | Track 32 §4 |
| Order budget: ≤ 52 recommendation weeks + ≤ 6 Rule E exits (was 100 trades a year) | §4 | Track 32 §4.5 |
| Promotion on risk-control evidence with the owner's acceptance of D | §7 | Track 38 §5; v3.3 §7.3's edge gate is unreachable at this cadence |
| Never-list additions (3× cores, leveraged rotation, 2× crypto funds, options as leverage, single-stock momentum, LLM trades, margin, crypto premiums, Bitcoin > 50%) | §5 | Tracks 26–30, 35–37 |
| Expected results restated three ways with drawdown probabilities and years to 2× and 10× | §6 | Track 38 Tables 4–5 |
| The WSB box and the red team for a leveraged book | §13, §14 | Track 38 §11 |
