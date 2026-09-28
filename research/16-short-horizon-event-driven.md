# 16 — Event-driven and single-stock catalysts with 1–60 day holds

*Track 16, short-horizon phase, 28 September 2026. Every number labelled "our data" can be reproduced with the scripts in `research/code/16-short-events/` (Appendix). No web search was used in this track; literature numbers that I could not re-verify are marked **[unverified]**.*

**Question.** Which event-driven setups that resolve within 60 days earn a return that survives costs, and can be detected from free data (SEC EDGAR, Yahoo, FINRA, calendars)? The trader is one person who gets an email in the evening and executes by hand the next session.

**Conventions.**
- "Session" means a trading day. 20 sessions ≈ 28 calendar days. 42 sessions ≈ 60 calendar days, the user's cap.
- The 60-session horizon (≈ 84 calendar days) is reported because the brief asked for it. It is slightly beyond the cap.
- "Net" means after the round-trip cost model in §1.3.
- "Excess" means minus the size-matched ETF: IWM below $2bn market cap, SPY at $2bn or more.

---

## TL;DR

1. **Nothing qualifies for inclusion.** I tested 17 event setups on 2011–2026 data: 14 with our own event studies and 3 with proxies or literature.
   - None earns a statistically robust positive return after costs for a follower who acts the session after the news.
   - Verdicts: **0 include, 2 incubate** (shadow ledger only, no capital: special dividends, and near-completion merger arb as a cash substitute), **15 reject**.
   - Two of the rejected setups (insider clusters, activist 13Ds) stay in the shadow ledger as monitors in case the drift returns.
2. **Why: the market now prices public event filings within about one session, mostly in the overnight gap.** Insider clusters show it most clearly:
   - **The filing-day reaction grew:** close(D−1) → close(D+1) excess return went from +1.2% (2006–15) to +1.6% (2016–21) to **+2.3% (2022–26, t = 23)**.
   - **The follower's drift disappeared:** the 20-session excess return after the D+1 close fell from **+2.1% (2006–08)** to +0.8% (2009–15) to **+0.1% (2016–26)**.
   - **Most of the reaction is overnight:** 72% of the day-after move is the gap to the next open (+1.28% of +1.78% in 2022–26).
   - **Detection speed is not the problem.** EDGAR's live feed showed a new Form 4 within about 20 seconds, and full-text search had indexed 10 of the 10 newest. The problem is that the trader is manual and trades once a day.
3. **Insider cluster buys, the flagship test.**
   - Data: SEC's complete Form 3/4/5 datasets, 2006Q1–2026Q2, giving 35,260 two-insider clusters.
   - Protocol: a grid of 36 variants, selected on 2009–15 and tested once on 2016–26.
   - **0 of 36 variants have t > 2 in either period.** The in-sample winner (≥3 insiders, ≥$500k bought) returned **−1.0% net per 20 sessions out of sample** (t −1.0). The deflated-Sharpe probability is ≈0.
   - Every subgroup that looked strong in-sample reversed: large clusters, buying after a price fall, buying when the VIX was ≥30.
   - Single-insider purchases fare no better: +0.05% gross per 20 sessions in 2016–26.
   - The Cohen-Malloy-Pomorski (2012) edge does not survive as a 1–60 day retail follower trade after 2016, in either its cluster or its opportunistic-filter form. Track 02's "satellite candidate" fails its own test (see §3.6).
4. **Earnings setups are dead in 2011–26** (108,796 liquid-universe announcements).
   - Top-minus-bottom decile drift, whether ranked by announcement return or by SUE, averages −0.08% to −0.02% at 20 and 60 sessions. The spread was positive in only 6–8 of 16 years.
   - Long top-decile trades lose about 0.5% net per 20 sessions. Gap continuation and gap fades are ≈0 gross.
   - The pre-earnings run-up is **+0.29% gross, +0.06% net** in ≥$2bn names. This agrees with Martineau (2022) **[unverified]**.
5. **Other filings show the same pattern: a jump at the filing, then no drift.**

   | Filing type | Return around the filing | Follower's 20-session return, net |
   |---|---|---|
   | Activist 13D | +2.6% to +4.4% (2-day window) | −1.1% |
   | Buyback 8-K | +0.6% to +2.4% | −0.8% |
   | Dutch-auction self-tender | +5.9% | −0.9% |

6. **Index and calendar events are too small or negative.**
   - **S&P 500 additions** (buy 5 sessions before the effective date E, sell at E−1): mean +0.6%, median −0.5%, t 1.5.
   - **Russell reconstitution** (index proxy, 19 years): ±0.5–0.7%, one trade a year.
   - **IPO lock-up shorts:** −2.5% net, and the worst trade lost **−417%** (uncapped).
   - **Spin-offs:** −2.7% in the first 20 sessions, not significant.
7. **Binary and crowded setups are negative.**
   - **FDA decisions:** holding through breaks even at ≈69% approval odds, and the pre-decision run-up is ≈0.
   - **Short squeezes** (short interest ≥20% of shares plus a catalyst day): **−6.0% net over 20 sessions**, median −9%, 34% winners, in both 2018–21 and 2022–26.
8. **Deal-driven structures pay about the T-bill rate, with crash exposure.**
   - Merger-arb funds earned **+0.1–0.2% over bills per 20 sessions**, with 0.5–0.7 correlation to SPY.
   - Live near-completion spreads (median 1.4%) mostly price the break risk.
   - Odd-lot tenders: about 2–5 qualify a year, with a median of about **$15 net per trade** after a $25 broker fee.
9. **The only positive result out of sample is weak: special dividends.**
   - Trade: buy the session after the announcement, sell on the last day before the ex-date. Result: **+1.4% net mean** (t 3.2, 2016–26).
   - But the median is only +0.2%. The mean comes from micro caps, which can absorb about $2k per trade.
   - In liquid names (≥$1M a day) it is **+0.4% (t 1.0)**, and it was +0.5% (t 0.9) in 2011–15. Verdict: incubate only.
10. **Data-mining ledger: 951 result cells tested.**
    - The Bonferroni threshold is z = 4.0 across all cells, or 3.3 per 50-cell family.
    - No positive follower result clears 3.3. The closest is the special-dividend full sample at t = 3.2, whose in-sample t was 1.1.
11. **Implications for the system:**
    - no event-driven single-stock sleeve at launch;
    - a free, automated shadow ledger for 4 setups, with explicit promotion rules;
    - hard "never" rules (§10);
    - the short-horizon return engine has to come from other tracks (14, 15). In single-stock events, a next-day manual follower is structurally late.

### Verdicts at a glance

| Setup | Verdict | One-line reason (our data, 2016–26 unless stated) |
|---|---|---|
| Insider cluster buys (Form 4) | **Reject** (shadow-monitor) | Priced by the next open. Follower +0.1% gross, −1.1% net per 20 sessions |
| Merger arb near completion | **Incubate** as a cash substitute only | T-bills + ~1–2%/yr with crash beta. Spreads price the break risk |
| Cash tender / odd-lot tender | Reject (the odd-lot micro-trade in §3.6 is unchanged) | ~$15 median per trade. Irrelevant to the portfolio |
| Dutch auction (round lot) | Reject | +5.9% announcement jump is not capturable. Follower −0.9% net |
| Special dividend (buy after announcement, sell before ex-date) | **Incubate** (shadow only) | +1.4% net but median +0.2%. Liquid names +0.4% (t 1.0) |
| Spin-offs (first 60 sessions) | Reject | −2.7% net over the first 20 sessions. Waiting then buying gives ≈0 within 60 sessions |
| Post-earnings drift (announcement return or SUE) | Reject | Decile spreads ≈0, 2011–26 |
| Earnings gap continuation / fade | Reject | ≈0 gross, negative net |
| Pre-earnings run-up | Reject | +0.29% gross, +0.06% net (≥$2bn) |
| Analyst-revision momentum | Reject (cannot be tested with free data) | No free point-in-time estimate history |
| S&P 500 additions | Reject | Mean +0.6%, median −0.5%, t 1.5 |
| Russell reconstitution | Reject | Index proxy ±0.5–0.7%. Stock lists not free point-in-time |
| IPO lock-up expiry (short / puts) | Reject | −2.5% net short. Uncapped loss |
| Buyback authorizations | Reject | Follower −0.8% net per 20 sessions |
| Activist 13D | **Reject** (shadow-monitor) | Jump at filing. Follower −1.1% net |
| FDA PDUFA dates | Reject | Binary. Break-even ≈69% approval. Run-up ≈0 |
| Short-squeeze setups | Reject | −6.0% net per 20 sessions, 34% winners |

The shadow ledger (§10.2) tracks four setups:
- the two incubates (special dividends; near-completion merger arb, still under the §3.6 cash-substitute cap);
- two rejected setups kept as monitors (insider clusters, activist 13Ds).

Section 10 gives the rules.

---

## 1. Data and method

### 1.1 Data (all free)

| Data | Source | Coverage | Point-in-time? |
|---|---|---|---|
| Insider trades | SEC "Insider Transactions Data Sets" (flattened Form 3/4/5 XML), 82 quarterly zips | 2006Q1–2026Q2. 3.5M open-market purchase/sale lines, 862k purchases | Yes. Filing date; delisted issuers included |
| 8-K earnings releases (Item 2.02) | EDGAR full-text search (EFTS), weekly windows | 2011–2026. 277k 8-Ks | Yes. Filing date (no acceptance time) |
| Schedule 13D (originals) | EFTS, form `SC 13D` to 2024 and `SCHEDULE 13D` from Dec-2024 | 21,190 originals, 2011–2026 | Yes |
| Buyback 8-Ks | EFTS phrase search (repurchase/buyback program) | 55,448 8-Ks | Yes |
| Special-dividend 8-Ks | EFTS "special (cash) dividend" | 8,747 8-Ks | Yes |
| IPO prospectuses | EFTS Form 424B4 "initial public offering" | 6,418 | Yes |
| Spin-off registrations | EFTS Form 10-12B | 384 originals | Yes |
| Shares outstanding | XBRL frames API (`dei:EntityCommonStockSharesOutstanding`, fallback `us-gaap`) | 2009–2026, 607k facts | Yes (period-end dated) |
| Quarterly diluted EPS | XBRL frames (`EarningsPerShareDiluted`) | 2008–2026 | Frames carry the *latest* value, so restatements are a mild look-ahead |
| Short interest | FINRA consolidated short interest API | 2018-01 to 2026-09 (the API has no earlier data). 209 dates, 2.17M rows | Used from settlement + 12 days (publication lag) |
| S&P 500 membership | fja05680/sp500 daily membership (1996–2019) + changes file (2019–2026-08) | Includes later-delisted names | Yes |
| Prices | Yahoo via yfinance: split-adjusted OHLC, total-return close, dividends, splits | 7,200 current tickers, plus about 6,200 historical Form 4 symbols that Yahoo still carries (validated per event) | **No.** Delisted tickers are missing (§1.5) |
| Reused inputs | Track 05: `merger_scan.csv`, `odd_lot_tenders.csv`, `biotech_events.csv` | — | — |

### 1.2 Event timing and entry

- **D** is the EDGAR filing date: the day the information became public. Form 4s are accepted until 22:00 ET and 8-Ks until 17:30 ET, and EFTS carries no acceptance time.
- The **primary entry is the close of the first session after D**. This fits the system as designed in track 09: a 22:17 ET run, an email before the next open, and manual execution during that session.
- A **next-open** entry is reported as a sensitivity check for the headline setup.
- For earnings, the reaction can fall on D or on D+1. So:
  - the announcement return is close(D−1) → close(D+1);
  - the follower enters at close(D+2).
- Exits are at the close a fixed number of sessions later. There are no stops: short-horizon event studies measure the whole distribution, and stops do not create expected value.

### 1.3 Costs (round trip, fraction of notional)

| Market cap at the event | Cost | Rationale |
|---|---|---|
| > $10bn | 0.15% | Quoted spread of a few bp plus impact and slippage for a market order |
| $2–10bn | 0.30% | |
| $0.3–2bn | 0.80% | Effective spreads of 0.2–0.5% plus impact (Abdi & Ranaldo 2017-type estimates) |
| $50–300m | 2.0% | |
| < $50m | 4.0% | |

- Commissions are $0.
- Shorts pay an extra 0.5% per 20 sessions for borrow. IPO lock-up shorts pay 1% for the 7-session window.
- The Abdi-Ranaldo estimate computed per stock gives similar or higher costs for the insider sample (`n20_ar` column).
- **The conclusions do not depend on the cost model.** Every rejected follower trade is already ≈0 or negative gross.
- Short-term gains would also be taxed at ordinary-income rates. That is moot when the pre-tax edge is zero.

### 1.4 Out-of-sample protocol and multiple testing

- **Design and test periods:**
  - design (in-sample, IS) 2009–2015 for insiders and 2011–2015 elsewhere;
  - test (out-of-sample, OOS) 2016–2026;
  - a pre-publication window (2006–08) for insiders.
- **Pre-registration:**
  - variant grids and selection rules were fixed in the script docstrings before the first run;
  - the insider selection rule was: the highest month-clustered t of net 20-session excess return in 2009–15, with at least 100 events;
  - the selected variant was then evaluated once on 2016–26.
- **t-statistics** are month-clustered (events are averaged within a month first), because events overlap in time.
- **Ledger:** 951 result cells across all families (`output/variant_ledger.csv`).
  - Bonferroni thresholds at 5% two-sided: z = 4.04 for all cells, 3.29 per 50-cell family.
  - Harvey, Liu & Zhu's (2016) rule of thumb is t ≥ 3.
  - The deflated Sharpe ratio (Bailey & López de Prado 2014) is applied to the selected insider variant.

### 1.5 Survivorship and other biases

- **Yahoo drops delisted tickers entirely, and some old tickers now belong to other companies** (e.g. BBBY and EMC).
- For insiders, every event was validated. A ticker was accepted only if its actual (split-unadjusted) close on the insider trade date was within ±25% of the insiders' own purchase price, with ≥60 sessions of history.
- **Validated coverage of cluster events:**

  | Years | Coverage |
  |---|---|
  | 2006–10 | 26–36% |
  | 2011–15 | 40–46% |
  | 2016–21 | 50–61% |
  | 2022–26 | 73–86% |

- The missing events are mostly companies later delisted, or never exchange-listed.
- **The high-coverage 2022–26 subsample gives the same answer** (follower +0.10% gross per 20 sessions), so survivorship does not drive the insider conclusion.
- The bias probably points upward, because missing failures would lower returns. So the true follower returns are, if anything, lower still.
- The other EDGAR studies map CIKs to today's tickers (survivors only). Coverage was 72% for buyback 8-Ks. The direction of bias is noted where it matters.
- For PEAD, survivorship makes the bottom decile look *better* than it was: firms that later failed are missing. That biases *against* finding short-side drift. Even so, the long side is also ≈0.

---

## 2. Scorecard (follower trades, recent or out-of-sample period, net of costs)

All returns are per trade, net, and excess of the benchmark unless stated otherwise.

| # | Setup (follower trade) | Period | Events/yr | Hold (sessions) | Win % | Avg win / avg loss % | Mean % | Median % | t | Worst % |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Insider cluster buys (≥2 insiders/30d), follow 20d | 2016-26 | 700 | 20 | 42 | 8.9 / -8.4 | -1.06 | -1.40 | -7.0 | -83 |
| 2 | Insider cluster buys, follow 60d | 2016-26 | 700 | 60 | 44 | 17.3 / -15.1 | -0.94 | -2.26 | -3.2 | -101 |
| 3 | Insider cluster buys, follow 20d | 2009-15 | 463 | 20 | 43 | 7.3 / -6.3 | -0.51 | -1.08 | -2.8 | -78 |
| 4 | Insider cluster buys, follow 60d | 2009-15 | 463 | 60 | 46 | 15.1 / -10.8 | 1.06 | -1.15 | 2.9 | -76 |
| 5 | Activist 13D (known activists), follow 20d | 2016-26 | 35 | 20 | 42 | 6.9 / -6.9 | -1.07 | -1.04 | -2.1 | -64 |
| 6 | Activist 13D (known activists), follow 20d | 2011-15 | 26 | 20 | 38 | 8.0 / -7.0 | -1.22 | -1.59 | -0.9 | -26 |
| 7 | Buyback 8-K (standalone), follow 20d | 2016-26 | 628 | 20 | 45 | 6.8 / -7.1 | -0.84 | -1.05 | -6.9 | -84 |
| 8 | S&P 500 addition, buy E-5 sell E-1 | 2016-26 | 19 | 4 | 44 | 5.6 / -3.3 | 0.63 | -0.47 | 1.5 | -13 |
| 9 | Special dividend, buy D+1 sell ex-1 | 2016-26 | 52 | 9 | 54 | 6.9 / -4.8 | 1.44 | 0.24 | 3.2 | -41 |
| 10 | Special dividend, buy D+1 sell ex-1 | 2011-15 | 47 | 9 | 51 | 4.8 / -3.9 | 0.53 | 0.02 | 1.1 | -38 |
| 11 | Special dividend (ADV ≥ $1m), buy D+1 sell ex-1 | 2016-26 | 38 | 9 | 52 | 5.0 / -4.6 | 0.38 | 0.11 | 1.0 | -41 |
| 12 | Special dividend (ADV ≥ $1m), buy D+1 sell ex-1 | 2011-15 | 33 | 9 | 53 | 4.8 / -4.2 | 0.53 | 0.09 | 0.9 | -38 |
| 13 | Spin-off: buy day 1, hold 20 | 2016-26 | 10 | 20 | 44 | 18.5 / -19.0 | -2.72 | -2.72 | -1.1 | -78 |
| 14 | Spin-off: buy day 20, hold 40 | 2016-26 | 10 | 40 | 49 | 17.1 / -16.7 | -0.27 | -1.14 | -0.1 | -109 |
| 15 | IPO lock-up: short L-6 to L+1 | 2016-26 | 107 | 7 | 43 | 9.4 / -11.4 | -2.50 | -1.55 | -4.1 | -417 |
| 16 | Issuer tender (Dutch/fixed), follow 20d | 2012-26 | 10 | 20 | 45 | 5.8 / -6.8 | -1.14 | -0.54 | -1.6 | -35 |
| 17 | FDA decision: run-up t-30 to t-1 | 2020-26 | 20 | 29 | 52 | 13.4 / -14.7 | -0.16 | 0.20 | -0.1 | -70 |
| 18 | FDA decision: hold through (t-1 to t+2) | 2020-26 | 20 | 3 | 42 | 6.8 / -16.9 | -6.88 | -1.12 | -3.6 | -77 |
| 19 | PEAD (announcement-return top decile), long 20d | 2016-26 | 666 | 20 | 46 | 9.2 / -8.6 | -0.47 | -0.88 | -3.1 | -89 |
| 20 | PEAD (SUE top decile), long 20d | 2016-26 | 2383 | 20 | 46 | 8.1 / -7.8 | -0.52 | -0.77 | -7.0 | -92 |
| 21 | Earnings gap-down >5%, buy the fade 5d | 2016-26 | 879 | 5 | 44 | 4.8 / -4.6 | -0.48 | -0.70 | -6.5 | -50 |
| 22 | Pre-earnings run-up (≥ $2bn), D-11 to D-1 | 2016-26 | 4374 | 10 | 49 | 4.3 / -4.1 | 0.06 | -0.10 | 2.0 | -63 |
| 23 | Short squeeze: SI ≥20% + catalyst day, long 20d | 2018-26 | 95 | 20 | 34 | 25.7 / -22.4 | -6.04 | -8.99 | -4.8 | -105 |
| 24 | Control: same catalyst, SI < 5%, long 20d | 2018-26 | 737 | 20 | 41 | 16.5 / -15.9 | -2.57 | -2.86 | -7.0 | -108 |
| 25 | Merger-arb proxy (MNA ETF), 20-session blocks, excess of bills | 2009-26 | 12 | 20 | 54 | 0.9 / -1.0 | 0.06 | 0.11 | 0.5 | -14 |

**Notes on the table.**
- t here is a plain per-trade t-statistic. Month-clustered t-statistics are in the sections below and are smaller for the heavily overlapping sets (for example, pre-earnings run-up clustered t = 1.0).
- "Worst %" below −100% means a trade that lost more than its stake: net-of-cost losses on a stock that went to zero, or a short that ran up.
- Events per year count only events with validated prices. For insider clusters, all EDGAR clusters number about 1,100–2,100 a year (2009–25).
- Special-dividend and PEAD rows are survivor universes (§1.5).

**Risk, capacity and sizing:**

| # | Setup | Capacity at 1% of ADV ($k) | Corr. with benchmark | n windows benchmark < −10% | Excess return in those windows % | Quarter-Kelly size % (mechanical) | Δg % a year at min(events, 12) |
|---|---|---|---|---|---|---|---|
| 1 | Insider clusters, 20d (2016-26) | 39 | 0.49 | 275 | -4.8 | 0.0 | 0.00 |
| 2 | Insider clusters, 60d (2016-26) | 39 | 0.40 | 452 | -0.9 | 0.0 | 0.00 |
| 3 | Insider clusters, 20d (2009-15) | 27 | 0.59 | 97 | -0.3 | 0.0 | 0.00 |
| 4 | Insider clusters, 60d (2009-15) | 27 | 0.52 | 174 | 3.4 | 3.2 | 0.18 |
| 5 | Activist 13D, 20d (2016-26) | 36 | 0.52 | 13 | -4.3 | 0.0 | 0.00 |
| 6 | Activist 13D, 20d (2011-15) | 77 | 0.43 | 4 | -7.0 | 0.0 | 0.00 |
| 7 | Buyback 8-K, 20d (2016-26) | 245 | 0.50 | 137 | -2.7 | 0.0 | 0.00 |
| 8 | S&P 500 addition (2016-26) | large | — | — | — | 5.0 | 0.18 |
| 9 | Special dividend, all (2016-26) | ~2 (micro caps) to 300 | 0.37 | 9 | 8.5 | 5.0 | 0.41 |
| 10 | Special dividend, all (2011-15) | — | 0.29 | 1 | 41.5 | 5.0 | 0.15 |
| 11 | Special dividend, ADV ≥ $1m (2016-26) | 117 | 0.45 | 6 | 3.5 | 5.0 | 0.10 |
| 12 | Special dividend, ADV ≥ $1m (2011-15) | 82 | 0.39 | 0 | — | 5.0 | 0.15 |
| 13 | Spin-off day 1–20 (2016-26) | — | 0.18 | 4 | 15.9 | 0.0 | 0.00 |
| 14 | Spin-off day 20–60 (2016-26) | — | 0.24 | 4 | -0.1 | 0.0 | 0.00 |
| 15 | IPO lock-up short (2016-26) | 20 | 0.19 | 2 | 0.1 | 0.0 | 0.00 |
| 16 | Issuer tender follower (2012-26) | 73 | 0.47 | 1 | -29.0 | 0.0 | 0.00 |
| 17–18 | FDA decision trades (2020-26) | — | — | — | — | 0.0 | 0.00 |
| 19 | PEAD announcement-return decile (2016-26) | 174 | 0.47 | 150 | -5.7 | 0.0 | 0.00 |
| 20 | PEAD SUE decile (2016-26) | 225 | 0.47 | 561 | -4.6 | 0.0 | 0.00 |
| 21 | Gap-down fade (2016-26) | 258 | 0.43 | 62 | 1.1 | 0.0 | 0.00 |
| 22 | Pre-earnings run-up ≥$2bn (2016-26) | 620 | 0.42 | 64 | -2.0 | 1.8 | 0.01 |
| 23 | Short squeeze (2018-26) | 173 | 0.25 | 26 | -7.5 | 0.0 | 0.00 |
| 25 | Merger-arb proxy (2009-26) | fund | 0.60 | 1 | +15.1 vs SPY (it fell less) | 5.0 | 0.02 |

**How to read the sizing columns.**
- Quarter-Kelly is computed mechanically on the empirical per-trade distribution after shrinking the mean by κ = 0.5. It is capped at the 5% single-stock limit, and costs are included.
- It is **not** an endorsement. The constitution's gates come first: ≥10 analogs, a t that survives the multiple-testing haircut (≥3 here), and Δg ≥ 0.2% a year on the whole portfolio.
- Every row fails at least one gate. Rows 8–12 fail on significance: t ≤ 1.5 except row 9, where t 3.2 < 3.3 and the in-sample t was 1.1. Row 22 fails on Δg.
- **So every row gets size 0 in the live system.**

**Crash behaviour.**
- Every long single-stock event trade has a 0.4–0.6 correlation with its benchmark.
- In the windows where the benchmark fell more than 10%, insider, 13D, buyback and PEAD trades lost a further 2.7–5.7% *relative to the benchmark*. In a sell-off they behave like high-beta small caps, not like diversifiers.

---

## 3. Insider cluster buys

### 3.1 Sample and definitions

- **Purchase:** an original Form 4 (amendments excluded), non-derivative line, code P, acquired. Common or ordinary stock, price > 0, filed ≤14 days after the trade.
- **Insider:** a director or officer. Pure 10% holders (funds) are excluded, and a joint filing counts once.
- **Cluster (W, K):** the first filing date on which ≥K distinct insiders of the same issuer have filed purchases within W calendar days. The issuer is then locked out for 90 days.
- **Routine vs opportunistic** follows Cohen, Malloy & Pomorski (2012). An insider who traded in each of the three prior years is:
  - "routine" if one calendar month has a trade in all three years;
  - otherwise "opportunistic".

  128k owner-years were classified: 88k opportunistic and 40k routine. A second flag marks a "routine buyer": someone who bought in the same month in both prior years.
- **Tradability:** actual price ≥ $2 at the filing, and a 20-day median dollar volume ≥ $100k.

| Clusters (all EDGAR) | 2006–08 | 2009–15 | 2016–26H1 |
|---|---|---|---|
| ≥2 insiders / 30 days (W30K2) | 7,865 | 12,232 | 15,163 |
| …with a validated price series and tradable | 1,574 | 3,242 | 7,353 |
| ≥3 insiders / 30 days | 4,285 | 6,569 | 8,013 |
| Single-insider purchase events (W30K1), all | ~5,700/yr | ~4,100/yr | ~3,400/yr |

### 3.2 Baseline: the follower's return by period and size

W30K2 baseline. Entry at the close of the session after the filing. Excess over IWM (or SPY for ≥$2bn).

| Period | Size | n | Gross excess 20d % | Net 20d % (median) | Clustered t (net) | Gross excess 60d % | Net 60d % (median) |
|---|---|---|---|---|---|---|---|
| 2006–08 (pre-publication) | all | 1,574 | **+2.08** | +0.08 (−0.97) | −1.0 | +1.68 | −0.32 (−0.82) |
| 2009–15 (IS) | all | 3,242 | +0.84 | −0.51 (−1.08) | −3.3 | +2.41 | +1.06 (−1.15) |
| 2016–26 (OOS) | all | 7,353 | **+0.12** | **−1.06 (−1.40)** | −3.5 | +0.24 | −0.94 (−2.26) |
| 2016–26 | >$10bn | 625 | −0.08 | −0.23 (−0.09) | −0.0 | +0.05 | −0.10 |
| 2016–26 | $2–10bn | 1,268 | −0.73 | −1.03 (−0.92) | −2.4 | −0.72 | −1.02 |
| 2016–26 | $0.3–2bn | 2,566 | +0.35 | −0.45 (−0.93) | −0.1 | +0.60 | −0.20 |
| 2016–26 | $50–300m | 1,916 | +0.62 | −1.38 (−2.41) | −2.6 | +0.67 | −1.33 |
| 2016–26 | <$50m | 197 | −1.50 | −5.50 (−7.80) | −3.4 | −6.42 | −10.42 |
| *Single-insider purchases (W30K1), for comparison: 2009–15* | all | 8,423 | +0.65 | −0.59 (−0.98) | −4.2 | +1.58 | +0.34 (−1.01) |
| *Single-insider purchases (W30K1): 2016–26* | all | 18,641 | +0.05 | −1.05 (−1.47) | −5.9 | +0.23 | −0.87 (−2.10) |

**Small vs large caps:** the gross effect that remains after 2016 is only in the $50m–$2bn band (+0.35% to +0.62% per 20 sessions), and it is smaller than those names' round-trip costs (0.8–2.0%). Large and mid caps show nothing even gross.

### 3.3 Pre-registered variant grid (36 variants) and the out-of-sample test

The grid was:
- (W,K) ∈ {(10,2), (30,2), (30,3)};
- × opportunistic filter {all, no routine participant};
- × total bought {any, ≥$100k, ≥$500k};
- × top officer {any, CEO/CFO/President/Chair among the buyers}.

The table shows net 20-session excess return, in-sample vs out-of-sample (full table: `output/insider_variant_grid.csv`).

| Variant | IS n | IS mean % | IS t | OOS n | OOS mean % | OOS median % | OOS t | OOS 60d mean % |
|---|---|---|---|---|---|---|---|---|
| **W30K3, ≥$500k (selected: best IS t)** | 354 | +0.61 | 1.91 | 1,182 | **−1.02** | −1.24 | −1.02 | −0.73 |
| W10K2, ≥$500k, top officer | 300 | +0.06 | 1.39 | 1,022 | −0.32 | −0.55 | 0.72 | −0.58 |
| W30K3, ≥$500k, top officer | 268 | +0.48 | 1.29 | 862 | −0.79 | −1.06 | −0.64 | −1.17 |
| W10K2, opportunistic, ≥$500k, top officer | 243 | +0.08 | 0.69 | 880 | +0.05 | −0.55 | 1.21 | −0.29 |
| W30K2 (baseline) | 3,242 | −0.51 | −3.31 | 7,353 | −1.06 | −1.40 | −3.52 | −0.94 |

| Grid statistic | Value |
|---|---|
| Variants with t > 2, IS | **0 / 36** |
| Variants with t > 2, OOS | **0 / 36** |
| Variants with OOS net mean > 0 | 1 / 36 (+0.05%) |
| Selected variant, OOS per-trade Sharpe | −0.07 |
| Deflated-Sharpe probability (36 trials) | **0.00** |
| Selected variant with next-open entry, OOS | −0.47% net per 20 sessions |
| Bonferroni t threshold (108 tests) | 3.50 |

**Subgroups that looked strong in-sample and reversed out of sample** (net 20-session mean):

| Subgroup | 2009–15 | 2016–26 |
|---|---|---|
| Exactly 4 insiders in the cluster | +1.20% | −0.72% |
| Stock fell ≥20% in the 20 sessions before the filing (contrarian insiders) | +1.65% | −2.15% |
| VIX ≥ 30 on the filing date (2006–15 vs 2016–26), 60 sessions | +5.03% (t 4.8) | −0.33% |
| VIX ≥ 30, 20 sessions | +1.50% (t 3.0) | −3.49% |

The VIX-conditional test was one extra, theory-motivated variant (limits to arbitrage in 2008–09). The 2008–09 bonanza did not repeat in the 2020, 2022 or 2025 stress episodes.

### 3.4 Where the return went (W30K2, excess over the benchmark, gross)

| Period | Insiders' own gain: close before first trade → filing-day close (median 3 sessions; overlaps the next column) | Filing day (D−1→D) | Day after (D→D+1) | **Filing reaction (D−1→D+1)** | **Follower 20d (from D+1 close)** | Follower 60d | Follower 250d mean (median) |
|---|---|---|---|---|---|---|---|
| 2006–08 | +0.22% | +0.44% | +0.75% | +1.21% (t 8.8) | **+2.08% (t 6.8)** | +1.68% | +6.9% (+0.8%) |
| 2009–15 | +0.21% | +0.42% | +0.75% | +1.17% (t 16.0) | +0.83% (t 4.6) | +2.38% | +4.6% (+0.2%) |
| 2016–21 | +0.42% | +0.47% | +1.17% | +1.64% (t 15.1) | +0.23% (t 1.1) | +0.94% | +6.4% (−3.0%) |
| 2022–26 | +0.88% | +0.56% | +1.78% | **+2.34% (t 22.7)** | **+0.10% (t 0.5)** | −0.25% | −1.6% (−7.0%) |

The day after the filing (D → D+1), split into its two parts:

| Period | Overnight gap (close D → open D+1) | Intraday D+1 (open → close) | Next-open follower, 20d gross | …net |
|---|---|---|---|---|
| 2009–15 | +0.35% (t 17) | +0.40% | +1.25% | −0.10% |
| 2016–21 | +0.78% (t 21) | +0.39% | +0.63% | −0.57% |
| 2022–26 | **+1.28% (t 30)** | +0.49% | +0.59% | −0.59% |

**Interpretation.**
- The informational content of insider clusters did not disappear. It is priced faster: the 2-day filing reaction doubled while the post-filing drift went to zero.
- This is consistent with machine-read EDGAR feeds. Rogers, Skinner & Zechman (2017) document price reactions to Form 4s within seconds of EDGAR dissemination **[unverified details]**.
- A manual trader cannot capture the overnight gap. Buying at the next open still nets about −0.6% after costs. Any remaining edge would require intraday, automated execution in illiquid small caps, which the constitution forbids (§3.9, "day trading").

### 3.5 Robustness

| Check | Result |
|---|---|
| Survivorship | Coverage rose from 26% (2006) to 86% (2026). The best-covered years (2022–26) show the weakest drift, so the failure is not a survivorship artifact |
| Costs | Gross OOS drift is +0.12% per 20 sessions. The trade fails at zero cost |
| Per-stock Abdi-Ranaldo spread instead of buckets | Worse (−2.3% net per 20 sessions for the selected variant, OOS) |
| Horizon | 5, 20 and 60 sessions all ≤ +0.24% gross OOS |
| Longer horizons (context only; beyond the mandate) | The 250-session mean is +6.4% in 2016–21 but the median is −3.0%. In 2022–26: −1.6% mean, −7.0% median. Right-skewed and not robust. The track 02 6–12-month "satellite" should not be built on it either |

### 3.6 Verdict and consequences

- **Reject** insider clusters as a 1–60 day trade. Keep them as a shadow-ledger monitor (§10.2): if the filing reaction shrinks or the drift reappears (for example, a 2009-type episode), the ledger will show it.
- Consequence for `00-SYNTHESIS.md` §3.8: the promotion test named there, "our own 2012–2026 EDGAR Form 4 test with t ≥ 2 net of costs", has now been run for 1–60 day holds, and **it fails**.
- For the 6–12-month version in track 02, our 250-session numbers are right-skewed with negative medians in 2016–26. Treat it as unproven, and don't build it without a proper calendar-time test.

---

## 4. Deal-driven situations

### 4.1 Merger arbitrage near completion

Historical single-deal target prices are not in free data: targets are delisted at completion and Yahoo drops them. A single-deal backtest would therefore see mainly the *failed* deals. So I used three pieces of evidence.

**(a) Investable proxies, 20- and 60-session windows** (`merger_arb_proxies_short_windows.csv`):

| Fund | Window | Mean % | Median % | Excess over bills % | Win vs bills % | 5th pct % | Worst % | Corr. with SPY | Mean in worst 5% SPY windows % (SPY) |
|---|---|---|---|---|---|---|---|---|---|
| MNA (2009–26) | 20 | 0.23 | 0.29 | **0.11** | 56 | −1.8 | −16.1 | 0.53 | −2.2 (−9.5) |
| MNA | 60 | 0.65 | 0.86 | 0.31 | 58 | −3.2 | −15.7 | 0.50 | −3.3 (−12.9) |
| MERFX (2009–26) | 20 | 0.28 | 0.35 | 0.17 | 65 | −1.2 | −9.3 | 0.55 | −1.2 (−9.9) |
| ARBIX (2017–26) | 20 | 0.41 | 0.45 | 0.21 | 69 | −0.5 | −4.1 | 0.68 | −0.9 (−10.7) |

**(b) Near-completion economics.**
- A cash deal with all approvals in hand has a spread s, a remaining break probability p, and a downside d (the fall to the undisturbed price, typically 15–30%).
- Per-trade expected value: EV = (1−p)·s − p·d − costs.
- **Break-even p = (s − cost)/(s + d).**

| Spread | Days to close | p(break) | EV per trade (d = 30%) | Annualized | Break-even p |
|---|---|---|---|---|---|
| 0.50% | 30 | 1% | +0.10% | 1.2% | 1.3% |
| 1.00% | 30 | 1% | +0.59% | 7.2% | 2.9% |
| 1.00% | 30 | 2% | +0.28% | 3.4% | 2.9% |
| 2.00% | 30 | 2% | +1.26% | 15.3% | 5.9% |
| 4.00% | 60 | 2% | +3.22% | 19.6% | 11.5% |

**(c) Live cross-section (28 Sep 2026).**
- There are 19 pending cash deals with positive spreads (track 05 scan). Median spread 1.38%, interquartile range 0.48–2.38%.
- Near completion, spreads of 0.2–0.5% imply break probabilities of about 1–1.5%. The trade then earns roughly T-bills unless your break estimate is better than the market's.
- Merger-arb funds lost 1–2% in the worst 5% of SPY months while SPY fell 9–10%. Break risk rises exactly when equity falls (Mitchell & Pulvino 2001: a short-put-like payoff).

**Estimates.**

| Measure | Value |
|---|---|
| Events per year | ~45–55 cash tender offers plus ~230 definitive merger proxies (track 05) |
| Win rate | ~95% of near-close deals **[unverified base rate]** |
| Per trade | Typical +0.3–1.0% before a break. A break costs −15% to −40% |
| Holding | 10–60 days |
| Capacity | Large |
| Crash correlation | Positive |
| Quarter-Kelly | On the proxy distribution, capped at 5% (the §3.1 short-put-like cap is 10%). Δg ≈ 0.02% a year |

**Verdict: incubate as a cash substitute only.** Keep the existing §3.6 rule (annualized net spread ≥ 15% on a strategic, financing-certain, no-antitrust-overlap deal), and add the near-completion variant in §10.2. It is not a return engine.

### 4.2 Tender offers: odd-lot priority, Dutch auctions, fixed-price self-tenders

Sample: track 05's parsed SC TO-I filings by listed operating companies (funds and BDCs excluded), 2012–2026 (`issuer_tender_summary.json`, `issuer_tender_follower.csv`).

| Trade | n (per yr) | Mean % | Median % | t | Win % | Worst % |
|---|---|---|---|---|---|---|
| Dutch auction: announcement window (not capturable) | 106 (7.3) | +5.90 | +4.49 | 9.3 | 88 | −6 |
| Dutch: follower 5d, net | 105 | −0.60 | −0.74 | −2.0 | 35 | −10 |
| Dutch: follower 20d, net | 105 | −0.91 | −0.05 | −1.1 | 49 | −35 |
| Dutch: follower 60d, net | 105 | −1.49 | −1.17 | −1.0 | 45 | −56 |
| Fixed price: follower 20d, net | 32 (2.2) | −1.67 | −2.05 | −1.1 | 38 | −17 |
| Expiry → 60 sessions after filing (post-offer drift), all | 150 | −1.21 | −0.70 | −1.1 | 46 | −48 |

**Odd-lot variant** (buy ≤99 shares near expiry when the minimum price exceeds the market):
- 119 operating-company offers had parseable prices over 14.6 years.
- 21% qualified (edge > 0.5%): **1.7 a year** in the parsed third of filings, so perhaps 3–5 a year in total.
- Median edge 4.6%. Median capital $1,068.
- **Median profit $15 net after a $25 broker fee** (mean $243). 32% are negative after the fee.
- Holding is about 5–10 sessions. Risk: the offer is withdrawn or a condition fails.

**Verdicts.**
- Round-lot Dutch and fixed-price followers: reject.
- Odd-lot: unchanged from track 05. An optional micro-trade, not worth a slot in a ≤24-trade budget.

### 4.3 Special dividends

- Events: 793 special dividends, 2011–2026, from 8-Ks matched to Yahoo dividend histories.
- A dividend counts as special if it is ≥1.5× the median regular dividend and ≥1% of the price.
- Median yield 3.6%. Median 9 sessions from announcement to the ex-date. About 50 events a year.

| Trade (net, excess) | 2011–15 mean (median), t | 2016–26 mean (median), t |
|---|---|---|
| Buy D+1, sell on the last cum day (ex−1) | +0.53% (+0.02%), 1.1 | **+1.44% (+0.24%), 3.2** |
| Buy D+1, hold through the ex-date (dividend included) | +1.07% | +0.98% |
| One-day dividend capture (ex−1 → ex) | −0.45% | −1.37% |
| Post-ex drift, 20 sessions (gross ≈ −1.0%) | −1.18% | −2.48% |
| Ex-day price drop as a share of the dividend (median) | 91% | 94% |

By market cap and liquidity, buy D+1, sell ex−1, net:

| Group | 2011–15 | 2016–26 | Capacity at 1% of ADV |
|---|---|---|---|
| < $300m | +0.17% (t 0.2) | +4.68% (median +1.51%, t 2.5) | **~$2k** |
| $0.3–2bn | −0.91% | +1.16% (t 2.2) | ~$28–32k |
| ≥ $2bn | +1.89% (t 2.2) | +0.41% (t 0.9) | ~$300k |
| ADV ≥ $1m | +0.53% (t 0.9) | **+0.38% (median +0.11%, t 1.0)** | ~$117k |

**Reading it.**
- There is a pre-ex-date demand effect, consistent with the "dividend month premium" of Hartzmark & Solomon (2013) **[unverified]**.
- But it is not stable across periods or sizes. It is concentrated in illiquid micro caps, and in liquid names it is below 0.5% per trade with t ≈ 1.
- Capture trades lose: the price drops about 90–94% of the dividend and keeps drifting down. They are also tax-inefficient: a holding of under 61 days makes the dividend non-qualified.
- **Verdict: incubate (shadow only).** The rules are in §10.2.

### 4.4 Spin-offs (the first 1–60 sessions of the spinco)

- Of 384 original Form 10-12B filings, 181 spincos have a current ticker. 156 were validated: first Yahoo session 0–450 days after the Form 10.
- When-issued prices are not in free data. The test starts at the first regular-way close.

| Window (sessions from first trade) | 2011–15 net mean (median) | 2016–26 net mean (median), t |
|---|---|---|
| Day 1 → 20 | −0.69% (+0.05%) | **−2.72% (−2.72%)**, −1.1 |
| Day 1 → 60 | +1.85% | −2.24% (−4.67%) |
| Day 20 → 60 | +2.24% (+3.29%) | −0.27% (−1.14%), −0.1 |
| Day 20 → 120 (beyond the mandate) | +5.11% | +4.36% (+0.29%), 1.3 |
| Day 60 → 120 (beyond the mandate) | +1.51% | +3.36% (+2.87%), 1.6 |

- Early forced selling shows up as a negative first month. Any rebound comes after 60 sessions and is not significant.
- Survivorship: spincos later acquired are missing, which biases toward failures. Spincos later delisted are also missing, which biases toward winners.
- **Verdict: reject** for 1–60 days. This agrees with track 05's ETF evidence (CSD 9.6%/yr vs SPY 10.9%).

---

## 5. Earnings-related setups

- Universe: current exchange tickers with an 8-K Item 2.02 in 2011–2026, price ≥ $5, 20-day median dollar volume ≥ $1M. That leaves **108,796 announcements** (4.4k–9.3k a year).
- Deciles use point-in-time breakpoints from the prior 12 months.
- SUE uses the seasonal random walk on XBRL diluted EPS.

### 5.1 Post-earnings announcement drift

| Signal | Window | 2011–15 top−bottom spread | 2016–26 spread | Years positive (of 16) | SD across years |
|---|---|---|---|---|---|
| Announcement return decile | 20 sessions | −0.32% | +0.02% | 6 | 0.88% |
| Announcement return decile | 60 sessions | +0.20% | −0.17% | 7 | 2.02% |
| SUE decile | 20 sessions | +0.10% | −0.11% | 7 | 0.67% |
| SUE decile | 60 sessions | +0.52% | −0.27% | 8 | 1.68% |

Long top decile, 2016–26, gross (net) per 20 sessions, by size:

| Signal | ≥ $2bn | $0.3–2bn | < $300m |
|---|---|---|---|
| Announcement return | −0.13% (−0.39%) | +0.24% (−0.56%) | +2.10% (+0.04%, median −3.19%) |
| SUE | −0.28% (−0.52%) | +0.27% (−0.53%) | −0.32% (−2.53%) |

The short sides (bottom deciles) are also ≈0 or slightly positive gross. The losers did not keep losing, although survivorship biases that result against the short side.

**Verdict: reject.** This matches track 02 (PEAD "non-existent in large caps since 2006") and Martineau (2022) **[unverified]**. Chordia et al. (2009) found that the residual drift sits in illiquid stocks, where costs absorb it **[unverified]**.

### 5.2 Earnings-gap continuation vs fade (2016–26, reaction-day gap > 5%)

| Trade | n | Gross % | Net % (median) | Clustered t (net) |
|---|---|---|---|---|
| Gap up, closed above the open ("held"), long 20d | 6,101 | +0.29 | −0.46 (−1.03) | −2.4 |
| Gap up, closed below the open ("faded"), long 20d | 6,425 | +0.21 | −0.54 (−1.21) | −2.5 |
| Gap down, buy the fade 5d | 11,367 | −0.04 | −0.78 (−0.94) | −6.1 |
| Gap down, short continuation 20d | 11,324 | +0.20 | −1.04 (−0.20) | −4.7 |
| Gap up, short the fade 5d | 12,609 | +0.05 | −0.83 (−0.62) | −8.7 |

The only large gross number is micro-cap "gap-up and held": +4.3% mean but −2.8% median, with capacity of a few thousand dollars. It is a lottery. **Verdict: reject** both continuation and fade.

### 5.3 Pre-earnings run-up (the earnings-announcement premium)

- Trade: buy 11 sessions before the 8-K date, sell the day before. This assumes the date is known 2 weeks ahead, which holds for most firms (Nasdaq calendar).

| Size | 2011–15 gross | 2016–26 gross | 2016–26 net (clustered t) |
|---|---|---|---|
| ≥ $2bn | +0.12% | +0.29% | **+0.06% (1.0)** |
| $0.3–2bn | +0.08% | +0.30% | −0.50% |
| < $300m | −0.79% | −0.76% | −2.91% |

- There is a small premium in large caps (cf. Barber et al. 2013 **[unverified]**), but it is below 0.3% gross per 10 sessions.
- Holding through the announcement (D−6 → D+1) adds variance and +0.17% gross in large caps.
- As a system trade: 12 trades a year → Δg ≈ 0.01% a year. **Verdict: reject.** Also, track 02 already forbids "options into earnings".

### 5.4 Analyst-revision momentum

- There is no free point-in-time history of consensus estimates. Yahoo shows only current revisions.
- The literature (Chan, Jegadeesh & Lakonishok 1996) reports 6–12-month effects that decayed with the rest of the anomaly complex (McLean & Pontiff 2016) **[unverified magnitude]**.
- Our PEAD and SUE results, which are the nearest free proxies, are ≈0.
- **Verdict: reject** (untestable for free; also not a 1–60 day effect in the literature).

---

## 6. Other catalysts

### 6.1 S&P 500 additions and deletions (2010–2026)

- Data: point-in-time membership, including later-delisted names. Price coverage: 62% (2010–15), 82% (2016–26).
- E is the first day in the index. Index funds trade at the close of E−1.

| Window (excess of SPY; follower windows net of 0.10%) | Adds 2010–15 (n=68) | Adds 2016–26 (n=199) |
|---|---|---|
| E−11 → E−6 (contains most announcement jumps) | +0.28% | +1.14% (t 2.5) |
| **Buy E−5, sell E−1** (a follower after most ad hoc announcements) | +0.56% (median 0.00%) | **+0.63% (median −0.47%), t 1.5, 44% wins** |
| Buy E−3, sell E−1 | +0.04% | +0.17% |
| E−1 → E+4 | −0.64% | +0.09% |
| E−1 → E+19 (post-inclusion reversal) | −1.25% | −0.73% |
| E−1 → E+59 | −2.46% | +0.69% |

- The E−5 window still contains some announcement jumps a follower cannot get, so the true follower number is lower.
- Greenwood & Sammon (2022) put the addition effect at +0.8% in the 2010s, down from +7.6% in the 1990s.
- Deletions (n = 17 and 95 with prices) show no reliable rebound: +0.9% mean and −0.4% median over 5 sessions.
- **Verdict: reject.** Expected value ≤ +0.5%, 19 events a year, and each event is crowded by index desks.

### 6.2 Russell reconstitution

- Stock-level preliminary add/delete lists are not available point-in-time for free, and rebuilding membership from XBRL ranks on a survivor universe would be unreliable.
- Index-level proxy (19 years, 2007–2025; recon day R = last Friday of June):

| Spread | Rank day → R−1 | R−5 → R | R → R+10 | R → R+20 |
|---|---|---|---|---|
| IWM − IWB | +0.64% (t 1.1) | +0.35% (t 1.7) | −0.55% (t −1.1) | −0.48% (t −0.6) |
| IWC − IWM | +0.79% (t 1.7) | +0.04% | −0.29% | **−0.72% (t −2.4, 21% positive)** |

- Literature: Madhavan (2003) and Chang, Hong & Liskovich (2015) document index-demand effects around the R1000/R2000 cutoff **[unverified magnitudes]**. The trade is among the most crowded in US equities.
- FTSE Russell moves to semi-annual reconstitution from 2026 **[verify]**.
- **Verdict: reject.** One trade a year worth ~0.5–0.7% (t < 2.5) cannot clear the Δg hurdle.

### 6.3 IPO lock-up expiries

- Sample: 1,351 validated IPOs, 2012–2025 (424B4 prospectus within [−5, +10] days of the first Yahoo session). SPACs excluded.
- L = first session ≥180 days after the IPO.

| Window (excess of IWM) | All (n = 1,351) | ≥ $300m (n = 696) | < $300m (n = 389) |
|---|---|---|---|
| L−11 → L−1 (pre-expiry), gross | −0.53% (median −1.90%) | **−1.05% (t −2.1)** | +0.17% |
| L−6 → L+1 (classic short window), gross | −0.08% (median −0.77%) | −0.79% (t −1.6) | +0.75% |
| **Short L−6 → L+1, net** (spread + 1% borrow) | **−2.37%** | −0.82% | −4.33% |
| L+1 → L+21 (post-expiry), gross | −2.24% (t −3.6) | −1.18% | −5.42% (t −4.0) |

- The pre-expiry and post-expiry weakness is real in the data, as Field & Hanka (2001) found (−1.9% over 3 days) **[unverified]**. But it is smaller than the cost of shorting recent IPOs.
- The worst 7-session short lost **417%**.
- Puts are no better. Recent IPOs carry 60–100% implied volatility **[typical range, not measured here]**. At those levels a 2-week at-the-money put costs about 5–8% of the stock price (≈0.4·σ·√(10/252)), against an expected drift of about 1%.
- Survivorship biases this sample toward winners, which works against finding the negative drift.
- **Verdict: reject** both the short and the puts.

### 6.4 Share-buyback authorizations (8-K)

| Group | Announcement (−1,+1) | Follower 5d net | 20d net | 60d net |
|---|---|---|---|---|
| Standalone 8-K, 2011–15 (n=2,018) | +0.63% (t 7.8) | −0.54% | −0.39% | +0.24% |
| Standalone 8-K, 2016–26 (n=6,782) | +1.06% (t 11.4) | −0.74% | **−0.84%** | −0.94% |
| Standalone, ≥ $2bn, 2016–26 | +0.70% | −0.35% | −0.45% | −0.85% |
| Bundled with earnings, 2016–26 (n=16,290) | +0.57% | −0.57% | −0.32% | −0.73% |

- The 1990s long-run drift (Ikenberry, Lakonishok & Vermaelen 1995: +12% over 4 years) is not visible over 60 sessions after 2011.
- Caveat: text-matching precision is imperfect; some matches are updates rather than new authorizations.
- **Verdict: reject.**

### 6.5 Activist Schedule 13D

- Filer classes:
  - "known activists": a name list of about 80 funds. It includes some post-2015 entrants, so there is mild hindsight.
  - "fund-like" filers.
  - others.
- One event per subject per 90 days.

| Class / period | n | Run-up (−21,−1) | **Announcement (−1,+1)** | Follower 5d net | Follower 20d net | Follower 60d net |
|---|---|---|---|---|---|---|
| Known activists 2011–15 | 130 | +1.97% | **+3.17% (t 5.4)** | −1.21% | −1.22% | −0.56% |
| Known activists 2016–26 | 371 | +0.86% | **+2.60% (t 6.4)** | −1.58% | **−1.07% (t −2.4)** | −1.96% |
| Known activists ≥ $300m, 2016–26 | 176 | +0.54% | +4.39% (t 8.3) | −1.04% | +0.06% | −1.67% |
| Fund-like filers 2016–26 | 1,034 | — | +1.43% | −1.49% | −1.45% | −4.08% |

- Brav, Jiang, Partnoy & Thomas (2008) report about +7% abnormal in (−20,+20) around hedge-fund 13Ds **[unverified]**. In our data that return sits in the run-up and the 2-day filing window.
- There is no post-filing drift for a follower.
- **Verdict: reject** (shadow-monitor, §10.2).

### 6.6 FDA PDUFA dates (track 05 events, 2020–26, XBI-adjusted)

| Trade (net) | Small/volatile (n=41) | Large/calm (n=94) |
|---|---|---|
| Run-up, buy t−30 and sell t−1 (no binary exposure) | −4.1% (median −4.8%) | +1.6% (t 1.4) |
| Hold through the decision (t−1 → t+2) | −17.3% pooled; approvals +9.6%, CRLs −28.5% | −2.3% |
| Post-decision drift, long (t+2 → t+30) | −3.2% | −1.1% |

- The break-even approval probability for small caps is **69%**, the same as track 05 found.
- The sample is selective and CRL-heavy (openFDA letters), so the pooled means are not the real-world mix. But no window offers a positive expectation without an outcome forecast.
- **Verdict: reject** (already on the §3.9 never list without an explicit probability model).

### 6.7 Short-squeeze setups (high short interest plus a catalyst)

- Catalyst day: excess return ≥ +10% on ≥3× normal volume.
- Short interest (SI) was the latest *published* FINRA figure (settlement + 12 days), as a share of XBRL shares outstanding. 12,679 catalyst events, 2018–2026.

| Setup (net of costs, excess of IWM) | n (per yr) | 5d | **20d (median)** | 60d (median) | Win % (20d) |
|---|---|---|---|---|---|
| **SI ≥ 20% + catalyst** | 827 (95) | −2.33% | **−6.04% (−8.99%)** | −9.26% (−16.65%) | 34 |
| …2018–21 only | 299 | −2.19% | −4.73% | −8.74% | 33 |
| …2022–26 only | 528 | −2.41% | −6.79% | −9.57% | 35 |
| SI 10–20% + catalyst | 2,268 | −0.77% | −0.55% (−3.18%) | +0.41% (−7.32%) | 43 |
| SI < 5% + catalyst (control) | 6,442 | −1.57% | −2.57% | −5.41% | 41 |
| SI ≥ 20%, no catalyst (monthly baseline) | 4,578 | — | −2.44% | −4.80% | 41 |

- The squeeze tail is real: the 95th percentile of 20-session returns is +44%. But the average buyer loses badly, consistent with Asquith, Pathak & Ritter (2005) and Boehmer, Jones & Zhang (2008) **[unverified magnitudes]**.
- The mirror trade (short after the catalyst) looks profitable on paper. But it is on the §3.9 never list (shorting names with SI > 20%): borrow on these names is expensive and can be recalled, and the right tail means an uncapped loss.
- **Verdict: reject** both directions.

---

## 7. Detection pipeline feasibility (free sources, daily screen)

| Setup | Free source | Measured / documented latency | Daily screen feasible? | Note |
|---|---|---|---|---|
| Insider clusters | EDGAR Atom "current filings" (Form 4); SEC bulk quarterly for history | **Newest Form 4 0.3 min old** at 19:06 ET; 40 filings spanned 69 min; EFTS indexed **10/10** of the newest (our probe, 28-Sep-2026) | Yes (22:17 ET run sees the day's filings) | Latency is fine; the price reaction happens first |
| Activist 13D | Atom (`SCHEDULE 13D`); EFTS | Newest 11 min old | Yes | Since Feb-2024, 13D is due within 5 business days of crossing 5% **[verify]** |
| Buyback / special dividend / earnings 8-K | Atom (8-K), EFTS with item codes | Newest 8-K 94 min old at 19:06 ET (few are filed after hours) | Yes | Item 2.02 flags earnings; text search flags buyback / special-dividend language |
| Earnings dates (pre-announced) | Nasdaq calendar API (track 09), yfinance | Daily | Yes | Needed only for run-up trades (rejected) |
| Merger arb / tenders | EFTS (`SC TO-T`, `SC TO-I`, `DEFM14A`, 8-K), Yahoo | Minutes | Yes (track 05 scanner) | Regex parsing needs a human spot-check |
| Spin-offs | EFTS Form 10-12B; Yahoo first trade | Minutes | Yes | When-issued prices not free |
| IPO lock-ups | EFTS 424B4 + 180 days; prospectus lock-up text | Days ahead | Yes | Staggered or early releases blur the date |
| S&P 500 changes | S&P DJI press releases (after 17:15 ET); community membership files | Same evening **[not tested]** | Partly | No free official historical file |
| Russell recon | FTSE Russell preliminary lists (May–June) | Weekly in season | Partly | No free point-in-time history |
| Short interest | FINRA API (twice monthly) | ~7–8 business days after settlement | Yes (bi-monthly) | 2018+ only |
| FDA PDUFA | EFTS "PDUFA" in 8-Ks; openFDA (post-decision) | Days | Partly | Goal dates are company-disclosed, not an FDA calendar |

**Conclusion on detection.**
- Every setup can be detected daily from free sources, and fast enough for an evening email.
- Speed of detection is not what failed. **The market reprices the information before the next session's open, and a manual follower cannot beat that.**

---

## 8. Post-publication decay: literature vs our follower numbers

| Setup | Original finding | Ours (follower, recent, net unless stated) |
|---|---|---|
| Opportunistic insider buys | +82 bp/month long-short, 1986–2007 (Cohen, Malloy & Pomorski 2012) | Gross 20-session: +2.1% (2006–08) → +0.8% (2009–15) → +0.1% (2016–26); net −1.1% |
| PEAD | Large decile spreads over 60 days, 1974–86 (Bernard & Thomas 1989) **[unverified magnitude]** | Decile spread ≈ −0.1% to +0.0% (2016–26) |
| Buyback authorizations | +3.5% announcement, +12% over 4 years (Ikenberry, Lakonishok & Vermaelen 1995) | +0.6–1.1% announcement; follower −0.8% per 20 sessions |
| Activist 13D | ≈+7% in (−20,+20) (Brav et al. 2008) **[unverified]** | +2.6–4.4% in (−1,+1); follower −1.1% |
| S&P 500 additions | +7.6% (1990s) → +0.8% (2010s) (Greenwood & Sammon 2022) | Follower +0.6% mean, −0.5% median |
| IPO lock-ups | −1.9% over 3 days (Field & Hanka 2001) **[unverified]** | −0.8% gross for ≥$300m; short net −0.8% to −2.4% |
| Spin-offs | Multi-year excess returns 1965–88 (Cusatis, Miles & Woolridge 1993) | −2.7% over the first 20 sessions; no rebound within 60 |
| Dutch auctions | Positive signalling returns (Comment & Jarrell 1991) | +5.9% at announcement; follower −0.9% |
| High short interest | Negative subsequent returns (Asquith, Pathak & Ritter 2005) | Confirmed: −2.4% per 20 sessions (no catalyst), −6.0% with a "squeeze" catalyst |

**Pattern.** The *announcement* effects are intact or larger. The *post-announcement drifts* that a slow follower could harvest have decayed to zero or turned negative after costs. That is what McLean & Pontiff (2016) predict for published anomalies, amplified here by machine readership of EDGAR.

---

## 9. Caveats

1. **Survivorship.**
   - Yahoo lacks delisted tickers. The insider study validates tickers and shows its coverage by year.
   - The other studies use today's CIK-to-ticker map. The direction of each bias is stated in its section.
   - None of the rejections relies on a bias that flatters the rejected side.
2. **No acceptance times.**
   - The bulk Form 4 data and EFTS give filing *dates* only, so the "filing day" return mixes intraday and after-hours filings.
   - This does not affect the follower result, which starts the next session.
3. **Text matching.**
   - The buyback and special-dividend 8-K sets and the 13D filer classes are regex-based.
   - Precision is imperfect, which dilutes effects toward zero. The 13D known-activist list carries mild hindsight, which biases toward finding an effect. None was found.
4. **XBRL EPS frames** hold restated values, a mild look-ahead that favours SUE. SUE still shows nothing.
5. **Costs are assumptions**, not measured fills. Every conclusion survives zero costs except where noted (special dividends, S&P additions, pre-earnings run-up). Those fail on significance or size, not only on costs.
6. **Horizon units.** Sessions are used throughout. 60 sessions ≈ 84 calendar days, which exceeds the user's cap; 42 sessions ≈ 60 calendar days. No conclusion changes between 20, 40 and 60 sessions.

---

## 10. Implications for the system design

### 10.1 Launch configuration

- **R0. No event-driven single-stock sleeve at launch.**
  - The trade budget (≤24 a year, target ≤12) gets no allocation from EDGAR event followers.
  - Expected contribution of every tested setup at quarter-Kelly: Δg = 0.00% a year, because the shrunk expectancy is ≤0 or the result fails the t ≥ 3 haircut.
- **R1. The 1–60 day return engine must come from elsewhere** (tracks 14 and 15: options, futures, crypto). This track's contribution is mainly negative knowledge, turned into guard rails below.

### 10.2 Shadow ledger: automated, paper only, no emails, logged nightly

Run these deterministic screens from the 22:17 ET job. Log the hypothetical trade and score it at the exit. They cost nothing and give the monthly calibration real outcomes.

| ID | Setup | Entry (paper) | Exit | Universe filter | Promotion rule (all must hold) |
|---|---|---|---|---|---|
| SH-1 | Insider cluster: ≥2 directors/officers with open-market purchases within 30 calendar days; 90-day issuer lockout | Next session's **open** after the cluster-completing Form 4 | Close of session 20 | Price ≥ $5; market cap ≥ $300m; 20-day median $ volume ≥ $1m | ≥60 shadow trades; mean net excess ≥ +1.0% per trade; month-clustered t ≥ 2.5; filing-reaction (D−1→D+1) median below +1.0% over the same period (evidence the market has slowed) |
| SH-2 | Special dividend (the tested definition): 8-K announcing a dividend ≥1.5× the median regular dividend of the prior 2 years (or the first dividend) and ≥1% of price, ex-date 3–75 calendar days after the 8-K | Close of the session after the 8-K | Close of the last session before the ex-date (never hold through ex) | Price ≥ $5; 20-day median $ volume ≥ $1m | ≥30 shadow trades; mean net ≥ +0.5%; t ≥ 2.0; median > 0 |
| SH-3 | Activist 13D by a listed activist fund | Close of the session after the filing | Close of session 20 | Market cap ≥ $300m | Same as SH-1 |
| SH-4 | Merger arb, near completion: cash deal; shareholder vote passed; all required antitrust/regulatory approvals disclosed as received; expected close ≤30 days; no financing condition | Close after the last approval 8-K | Deal close (cash receipt) | Target market cap ≥ $300m | ≥30 shadow deals; realized annualized return ≥ T-bill + 3% net; no break loss above 2% of the shadow book. Even then, cash-substitute only, inside the 10% short-put-like cap (§3.1) |

Sizing if anything is ever promoted:
- Quarter-Kelly on the shadow distribution after κ = 0.5 shrinkage, under the §3.1 caps: single stock ≤5%, stress loss ≤2%.
- The Δg ≥ 0.2% a year test on the whole portfolio still applies.
- At the magnitudes promoted by SH-1 to SH-3 (≤1% per trade, 20–50 trades a year, but the budget allows ≤12), expect Δg ≈ 0.1–0.3% a year at most. Promotion should be rare.

### 10.3 Never trade (event-specific additions to §3.9)

- **N1. Never chase a public filing after its first session.** This covers Form 4 purchases, 13D, buyback 8-Ks, special-dividend 8-Ks and self-tender announcements. Our follower expectancy is ≤0 after costs in 2016–26.
- **N2. No event trade in names below $300m market cap or $1m median daily dollar volume.** Round-trip costs (2–4%) exceed every measured edge, and capacity at 1% of ADV is under $10–40k.
- **N3. No post-earnings drift, earnings-gap continuation/fade or pre-earnings run-up trades.** All ≈0 gross after 2011.
- **N4. No S&P 500 addition front-running**, no Russell-recon trades, no IPO lock-up shorts or puts.
- **N5. No short-squeeze chasing.** No buying high-SI (≥20%) names on catalyst days (−6% per 20 sessions), and no shorting them (§3.9).
- **N6. No dividend-capture trades** across the ex-date. The price drops 90–94% of the dividend, drifts lower afterward, and the dividend is taxed as non-qualified.
- **N7. No FDA binary holds** without an explicit probability model. Break-even is ≈69% approval for small caps.
- **N8. No spin-off trades in the first 60 sessions.**

### 10.4 Pipeline and calibration

- **P1.** Implement the shadow screens SH-1 to SH-4 as deterministic code. Sources: EDGAR Atom and EFTS every night after 22:00 ET, FINRA short interest twice monthly, Yahoo prices. **No LLM calls** in the screen (track 12 M6/m9 cost and integrity rules). An LLM may only summarize the monthly shadow table.
- **P2.** Monthly review reports, per shadow setup:
  - n, mean, median and win rate of shadow trades;
  - the rolling 24-month filing-reaction vs follower-drift split (the §3.4 table);
  - whether any promotion rule is met.

  Promotion needs the owner's approval (constitution §5.5). Demotion is automatic when the rolling mean turns negative over ≥30 trades.
- **P3.** Keep the historical harness (these scripts) runnable so every rule change is back-tested on the same point-in-time data before it takes effect. Record the number of variants tried in the ledger (currently 951 cells).

---

## References

- Abdi, F., Ranaldo, A. (2017). A simple estimation of bid-ask spreads from daily close, high, and low prices. *Review of Financial Studies* 30(12).
- Asquith, P., Pathak, P., Ritter, J. (2005). Short interest, institutional ownership, and stock returns. *Journal of Financial Economics* 78(2). **[unverified details]**
- Bailey, D., López de Prado, M. (2014). The deflated Sharpe ratio. *Journal of Portfolio Management* 40(5).
- Barber, B., De George, E., Lehavy, R., Trueman, B. (2013). The earnings announcement premium around the globe. *Journal of Financial Economics* 108(1). **[unverified details]**
- Bernard, V., Thomas, J. (1989). Post-earnings-announcement drift. *Journal of Accounting Research* 27.
- Boehmer, E., Jones, C., Zhang, X. (2008). Which shorts are informed? *Journal of Finance* 63(2). **[unverified details]**
- Brav, A., Jiang, W., Partnoy, F., Thomas, R. (2008). Hedge fund activism, corporate governance, and firm performance. *Journal of Finance* 63(4). **[unverified magnitudes]**
- Chan, L., Jegadeesh, N., Lakonishok, J. (1996). Momentum strategies. *Journal of Finance* 51(5).
- Chang, Y.-C., Hong, H., Liskovich, I. (2015). Regression discontinuity and the price effects of stock market indexing. *Review of Financial Studies* 28(1). **[unverified details]**
- Chordia, T., Goyal, A., Sadka, G., Sadka, R., Shivakumar, L. (2009). Liquidity and the post-earnings-announcement drift. *Financial Analysts Journal* 65(4). **[unverified details]**
- Cohen, L., Malloy, C., Pomorski, L. (2012). Decoding inside information. *Journal of Finance* 67(3).
- Comment, R., Jarrell, G. (1991). The relative signalling power of Dutch-auction and fixed-price self-tender offers and open-market share repurchases. *Journal of Finance* 46(4).
- Corwin, S., Schultz, P. (2012). A simple way to estimate bid-ask spreads from daily high and low prices. *Journal of Finance* 67(2).
- Cusatis, P., Miles, J., Woolridge, J. R. (1993). Restructuring through spinoffs. *Journal of Financial Economics* 33(3).
- Field, L., Hanka, G. (2001). The expiration of IPO share lockups. *Journal of Finance* 56(2). **[unverified magnitude]**
- Greenwood, R., Sammon, M. (2022). The disappearing index effect. NBER Working Paper (cited via track 05).
- Hartzmark, S., Solomon, D. (2013). The dividend month premium. *Journal of Financial Economics* 109(3). **[unverified details]**
- Harvey, C., Liu, Y., Zhu, H. (2016). …and the cross-section of expected returns. *Review of Financial Studies* 29(1).
- Ikenberry, D., Lakonishok, J., Vermaelen, T. (1995). Market underreaction to open market share repurchases. *Journal of Financial Economics* 39(2–3).
- Lakonishok, J., Lee, I. (2001). Are insider trades informative? *Review of Financial Studies* 14(1).
- Madhavan, A. (2003). The Russell reconstitution effect. *Financial Analysts Journal* 59(4). **[unverified details]**
- Martineau, C. (2022). Rest in peace post-earnings announcement drift. *Critical Finance Review* 11. **[unverified]**
- McLean, R. D., Pontiff, J. (2016). Does academic research destroy stock return predictability? *Journal of Finance* 71(1).
- Mitchell, M., Pulvino, T. (2001). Characteristics of risk and return in risk arbitrage. *Journal of Finance* 56(6).
- Rogers, J., Skinner, D., Zechman, S. (2017). Run EDGAR run: SEC dissemination in a high-frequency world. *Journal of Accounting Research* 55(2). **[unverified details]**

---

## Appendix: reproducibility

The code is in `research/code/16-short-events/` and the small outputs in `output/`. Raw downloads are cached in the session scratchpad (`…/scratchpad/16-short-events/`), never in the repository. Python 3.11 with pandas, numpy, scipy and yfinance.

| Order | Script | What it does | Main outputs |
|---|---|---|---|
| 1 | `insider_download.py` | Downloads 82 SEC Form 3/4/5 quarterly datasets and extracts P/S lines | scratch `insider_PS.pkl.gz` |
| 2 | `insider_events.py` | Cleaning, CMP routine/opportunistic classification, cluster events (W,K) | scratch `insider_events.pkl` |
| 3 | `shares_out.py` | XBRL frames: point-in-time shares outstanding | scratch `shares_out.pkl` |
| 4 | `prices_universe.py` | Yahoo prices for 7,700 current tickers + benchmarks | scratch `prices/` |
| 5 | `insider_map.py` | CIK/symbol → ticker, validated against insider prices | scratch `insider_events_mapped.pkl` |
| 6 | `insider_backtest.py` | Returns, costs, 36-variant grid, IS/OOS, deflated Sharpe, sizing | `insider_*.csv/json` |
| 7 | `insider_diagnostics.py`, `insider_open_entry.py`, `insider_vix.py` | Timing decomposition, next-open entry, VIX regime | `insider_diagnostics.csv`, `insider_by_year.csv`, `insider_open_entry.csv`, `insider_by_vix.csv` |
| 8 | `edgar_collect.py` | EFTS collection: 13D, buyback, special dividend, earnings, 424B4, Form 10 | scratch `edgar_*.pkl` |
| 9 | `earnings_study.py` | PEAD (announcement return, SUE), gaps, run-up, decay by year | `earnings_setups.csv`, `earnings_decay_by_year.csv` |
| 10 | `activist_13d.py`, `buyback_8k.py`, `special_div.py`, `spinoff_study.py`, `lockup.py`, `tenders_study.py` | Filing-based event studies | `*_summary.csv` |
| 11 | `sp500_index.py`, `russell_proxy.py` | Index events | `sp500_changes_*.csv`, `russell_proxy.csv` |
| 12 | `finra_si.py`, `short_squeeze.py` | FINRA short interest; squeeze setups | `short_squeeze_summary.csv` |
| 13 | `merger_arb_short.py`, `pdufa_runup.py` | Merger-arb proxies and model; FDA run-up | `merger_arb_*.csv`, `pdufa_runup.csv` |
| 14 | `latency_probe.py` | Live EDGAR/EFTS latency | `latency_probe.json` |
| 15 | `scorecard.py`, `variant_ledger.py` | Uniform scorecard; data-mining ledger | `scorecard.csv`, `variant_ledger.csv/json` |

Shared modules: `common.py` (paths, SEC/EFTS helpers, price cache, costs, statistics, Kelly), `evstudy.py` (row-wise event engine) and `fastev.py` (vectorized event windows).
