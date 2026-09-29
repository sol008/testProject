# 24 — Loosening the holding cap to 90 or 120 days: does it unlock families the earlier tracks did not test?

*29 September 2026, data to the 28 September 2026 close. Tracks 21 and 22 answered the cap question for the existing modules and for crash, credit, trend, international, Bitcoin, seasonal, Treasury, gold and Fed trades, and track 23 re-verified them. This track searches the gaps they left: merger arbitrage, longer-dated option premium, sector momentum, post-earnings drift and other single-stock anomalies, closed-end-fund (CEF) discounts and index effects, and three other 3–4-month mechanisms. Code and outputs: `research/code/24-duration-gaps/` (`python3 run_all.py`: about 7 minutes on a warm cache, about an hour on a cold one; §8). Literature DOIs were checked against Crossref (34 of 34). Nothing here is individualized advice. Decision 12 already settles the cap; the only optional change here is two shadow-ledger rules (§5).*

*Labels:*
- *H42 / H63 / H84 = holds of 42 / 63 / 84 trading sessions, the brief's reading of 60 / 90 / 120 calendar days. Strictly, with an exit at the open, only 37 / 58 / 78 sessions always fit (track 23 §2.1; design v3.3 "Time stops"). That shaves a few sessions off each hold and changes no conclusion here.*
- *"Edge" = excess return over T-bills minus what an era-matched random entry into the same instrument earned over the same hold (track 22's placebo; it removes drift). For single stocks, "excess" means minus the size-matched ETF (IWM below $2bn, SPY above).*
- *κ = shrinkage of an edge toward zero (0.5 halves it; 0.25 with only 10–19 independent episodes; paper-only below 10).*
- *"One position" = at most one open position per family, which is what the design's risk caps allow (§1.3).*
- *All returns are pre-tax; every hold here is under a year, so all gains are short-term either way.*

---

## TL;DR

1. **No. A 90- or 120-day cap unlocks no new family worth adding.**
   - I tested six families the earlier tracks had not (380 variants; up to a century of data; costs included; before-2008 and after-2008 halves).
   - None earns more per year at 90 or 120 days than at 60, once the design's risk caps are applied.
   - **Expected change in the system's annual return from these families: 0 at 90 days and 0 at 120 days.** None reaches live or policy status at any cap.
   - Suppose the three new shadow candidates below were promoted anyway: CEF discount buys, spin-offs after day 60, and the merger-arb ETF after blow-outs.
     - The change would be **−0.22 points at 90 days and −0.13 at 120**.
     - Across four scenarios (§4.1) the range is −0.24 to −0.02 at 90 days, and −0.13 to +0.16 at 120. The top end needs the 47-event 2011–15 spin-off sample.
     - Longer holds push fewer trades through the same one or two slots, and the edges arrive early.
   - **Decision 12 stands.** It gives a 90-day exception to W10 now and to M4 in Phase B, keeps everything else at 60 and rejects 120.
     - That exception is worth about +0.04 points a year now and ≈+0.1 with M4 (track 23's re-estimate of track 21's +0.18).
     - This track finds nothing to add to it, and nothing that argues for 120 days or a global cap.

2. **Why longer holds don't help:**
   - **Where an edge exists, most of it arrives within 42 sessions.**
     - CEF discounts narrow by about 2 points of NAV by session 42, and by only 0.3–0.6 points more by session 84.
     - The S&P 500 deletion rebound is complete by session 42.
     - Merger-arb funds and spin-offs earn at a roughly constant rate per day held.
   - **The design's caps allow one or two positions per family**: 2% stress per trade, 10% in total shared with M1–M4 and the M2 sleeve, ≤8 positions, ≤3 orders per email. A longer hold then means fewer trades, not more edge.
   - **What a longer hold does add is market drift**, which is about zero over bills at CAPE ≈41.
   - Longer caps help only a rule whose signal is rare, so its slot sits idle anyway. Here that is only the merger-arb ETF bought after spread blow-outs: +0.02 points, and it failed its pre-2008 design test.

3. **Verdicts.** Contributions are κ-shrunk, % of the portfolio a year over bills, at forward-looking drift; they are hypothetical, i.e. what the rule would add if run.

   | Family | What was tested | 60 d | 90 d | 120 d | Pre-2008 / post-2008 | Order kind | **Verdict** |
   |---|---|---|---|---|---|---|---|
   | 1. Merger arbitrage | Single cash deals held to completion; arb funds and ETFs; buying MNA after spread blow-outs; EDGAR deal durations | +0.10 | +0.10 | +0.10 | Fund excess +2.4% / +1.9% a year | (a) target stock; MNA ETF | **Shadow** (unchanged). Fails the 6 bp per-trade hurdle at every cap (0.9 / 1.5 / 2.0 bp) |
   | 2. Option premium at longer DTE | M7's put spread at 45 / 60 / 90 / 120 DTE; the variance premium's term structure (real prices) | +0.22 | +0.22 | +0.22 | Best rule under 60 days wins in both halves | (b) spread, taxable account | **Never** at longer DTE. Keep M7 at 40–50 DTE |
   | 3. Sector momentum, quarterly | Top-k of 9 SPDRs, 12 and 49 Ken French industries, re-decided every 21 / 42 / 63 / 84 sessions | −0.09 | −0.05 | −0.03 | KF12 +2.3% / +1.5% a year vs market; SPDRs +4.0% / **−1.8%** vs SPY | (a); k ≥ 2 exceeds 3 orders | **Never** (stays on the never-list) |
   | 4. PEAD and single stocks | Earnings drift (SUE and reaction deciles), insider clusters, spin-offs after day 60 | PEAD −0.19; spin-offs +0.53 | −0.17; +0.36 | −0.16; +0.49 | PEAD −0.5% → −2.2% per trade as the hold grows (2016–26) | (a) longs only | **PEAD never; insiders shadow (unchanged); spin-offs from session 61: shadow** (no consistent gain from longer holds) |
   | 5. CEF discounts and index effects | Wide-discount CEF buys (139 funds); S&P 500 additions and deletions; Russell reconstitution | CEF +0.21; deletions +0.83 | +0.14; +0.38 | +0.11; +0.41 | CEF edge +1.9% / +2.5% (H42, signal-month means) | (a) | **CEF: shadow (new; best at ≤60 days). Deletions: never-list unchanged. Russell: never** |
   | 6. Other 3–4-month mechanisms | Turn-of-year small caps; VIX-term-structure short-vol carry; dividend effects | TOY +0.05; VIX +0.01 | +0.05; +0.02 | +0.04; +0.04 | Small-cap January edge +5.5% (1983–2007) → +2.4% (2008–26), 60-day window | (a) | **Never** (calendar; short-VIX product; dividend capture) |

4. **Two things this search turned up that do not depend on the cap.** Both are worth logging, not trading.
   - **CEF wide-discount buys.** Buy a CEF whose discount is unusually wide for that fund (z ≤ −2 against its own 3 years).
     - Edge vs a random entry at H42, averaged by signal month: +1.9% before 2008 and +2.5% after (Newey-West t 1.7 and 2.8).
     - The discount itself narrows by 1.8–2.2 points, with t 2.9–6.3.
     - Worth ≈ +0.2 points a year at one position.
     - Recommend it for the shadow ledger, with the survivorship and crisis-clustering caveats in §2.5.
   - **Spin-offs bought at session 61**, just after the never-list's 60-session ban: +3.4% vs IWM per trade at H42 (2016–26, t 1.5), with survivorship bias. Shadow.
   - The S&P 500 deletion rebound (+5.5% vs IWM at H42, t 2.6, 2008–26) looks larger. But only 46% of deleted names still have prices, and the never-list already bans index trades. Leave it there.

5. **Multiple testing.**
   - This track: 380 variants. Bonferroni bar t ≥ 3.82; noise alone gives a best t of about 2.97. Cumulatively, across tracks 13–24: about 3,580 variants and a bar of t ≥ 4.34.
   - **No test-period timing edge clears 3.82.** The best is a CEF cell with Newey-West t 3.7.
   - The only test cell above the bar is the modelled put spreads' per-trade t of 6.4, which measures a premium against zero, not an edge over random entry.
   - Deflated-Sharpe probabilities at the track's N: CEF 0.44–0.69; S&P deletions 0.03–0.30; spin-offs 0.08–0.24; the rest ≤0.17.

6. **A trap to avoid.** The design's 6 bp per-trade hurdle rewards longer holds mechanically: a longer hold at the same daily edge makes a bigger per-trade gain.
   - Merger-arb deals go from 0.9 bp at 60 days to 2.0 bp at 120 (still failing).
   - The MNA blow-out rule goes from 1.1 to 5.2 bp.
   - **Judge a cap change by what it adds per year inside the risk budget, not by whether it pushes a trade over the per-trade hurdle.**

---

## 1. Question, data and method

### 1.1 What a longer cap can change

A cap binds a family only if the family's edge keeps accruing after about 42 sessions *and* the risk budget has room to hold the position longer. Three things can happen when the cap moves from 60 to 90 or 120 days:

| Effect | When it helps | Families where it applies |
|---|---|---|
| More instances become admissible | When the instance's natural life is 60–120 days (a merger's time to close; a 90-DTE option) | Merger arb, longer-dated options |
| The same trade is held longer | When the edge is still accruing after 42 sessions | Momentum, drift anomalies, discount narrowing |
| A calendar window becomes reachable | When a 3–4-month seasonal starts early (e.g. from 1 November) | Turn of the year |

Tracks 21–22 found that, for the modules and families they tested, the cap mainly buys drift. This track asks the same of the families they left out.

### 1.2 Data (all free; downloads cached in the scratchpad)

| Series | Source, coverage | Family |
|---|---|---|
| Merger-arb funds and ETFs: MERFX (1989–), ARBFX (2002–; 2000–01 has one-day ±10–20% data errors), MNA (2009–), MRGR (2012–), ARB (2020–). ARBFX is the retail class of the Arbitrage Fund; its institutional class ARBIX has Yahoo history only from 2017 (track 05: +2.4% a year over bills, 2017–26), so ARBFX gives the longer record | Yahoo, total return | 1 |
| 1,878 US cash deals, 2014–2025 | SEC EDGAR: target SC 14D9 (tender offers) and DEFM14A with "in cash, without interest" (mergers). Each target's full filing index gives the announcement (first DEFA14A / SC14D9C / SC TO-C / PREM14A of the chain) and completion (Form 25-NSE / 15) | 1 |
| Live pending cash deals (19 with positive spreads) | Track 05's EDGAR scan | 1 |
| CBOE VIX, VIX3M, VIX6M; S&P 500 | CBOE, Yahoo | 2 |
| Synthetic SPX option surface, calibrated to CBOE PUT/PUTY/CNDR/BFLY (an approximation) | Track 14 (`optmodel`, `spreadsim`) | 2 |
| Ken French 12 and 49 industry portfolios (daily, 1926–), size portfolios (daily), factors | Ken French library | 3, 6 |
| 9 Select Sector SPDRs (1998–), SPY, IWM, IWB, IWC | Yahoo, dividend-adjusted opens and closes | 3, 5, 6 |
| 108,796 earnings releases (8-K Item 2.02, 2011–26), 155 spin-offs, 35,000 insider clusters, S&P 500 point-in-time membership (1996–) | Track 16's EDGAR event sets and Yahoo price cache | 4, 5 |
| 139 CEFs with daily NAV | Yahoo price and "X‹ticker›X" NAV symbols (1999/2004–2026) | 5 |
| CBOE VPD (short front-month VIX futures, 2007–), SVXY | CBOE, Yahoo | 6 |

### 1.3 Method

- **Fills and costs.**
  - ETFs and stocks enter at the next open (a dollar market order after the evening email); funds and indices at the next close.
  - Single stocks pay track 16's round trip by size (0.15% for large caps up to 2% for micro caps). ETFs pay 1–5 bp a side; CEFs 10 bp a side (and +0.3% round trip as a check); option spreads pay the design's fill model (mid ± 0.3 × the quoted spreads, plus fees; an "XSP stress" case doubles spreads).
- **Placebo.** Each trade's excess over bills minus the mean excess of every entry day within ±3 years in the same instrument, at the same hold. For single stocks: minus the size-matched ETF.
- **Halves.** Design before 2008 and test after, where data allow. The event sets start in 2011, so single stocks split 2011–15 / 2016–26.
- **Inference.**
  - Month-clustered t for events.
  - Newey-West t with lags equal to the holding months, wherever holds overlap across signal months.
  - Every decision variant goes into the ledger (§3).
- **Capacity.** This is what a longer cap actually runs into.
  - Design §4: per-trade stress ≤2% of NAV, where stress = notional × the instrument's worst 10-session loss. Total open stress ≤10%. ≤8 positions. §3a: ≤3 orders per email.
  - M2's sleeve (≈4.5% stress) and M3 (≈1.6%) are usually open. That leaves room for about one or two more 2%-stress positions.
  - So the contributions below assume **one position per family at a time** (two as the high case). Trades a year = min(signals a year, 252 / H).
- **Contribution** = trades a year × notional × (forward drift per trade + κ × edge per trade), whole portfolio, pre-tax, over bills.
  - Forward drift: equities and small caps +0.3% a year over bills (S&P 3–6% vs bills 4.2%); CEF assets +0.5%; merger arb uses the arb rate itself.
  - Low = edge gone and low drift. High = the unshrunk edge (and two positions where the family allows).

---

## 2. Results by family

### 2.1 Merger arbitrage in cash deals

**Mechanism.** After a cash bid is announced, the target trades below the offer price. The spread pays arbitrageurs for bearing the break risk, a payoff shaped like a short index put, and for supplying liquidity to holders who sell early (Mitchell & Pulvino 2001; Baker & Savasoglu 2002). Spreads shrank after 2002 (Jetley & Ji 2010).

**(a) Which deals a longer cap admits** (EDGAR, anchors 2014 to Q1 2025, `f1_deal_duration_summary.csv`):

| Deal type | Deals a year | Completed | Median days, announcement → close (IQR) | Fit the cap from the day after announcement: 60 / 90 / 120 d | Share of all deal-days inside the last 60 / 90 / 120 d |
|---|---|---|---|---|---|
| Tender offers (SC 14D9) | 56 | 80%* | **53** (43–113) | 47% / 55% / 62% | 44% / 53% / 60% |
| One-step cash mergers (DEFM14A) | 111 | 94% | **118.5** (78–198) | 13% / 33% / 48% | 37% / 52% / 63% |
| **All** | **167** | 89% | 101 | **24% / 40% / 53%** | **39% / 52% / 62%** |

\* SC 14D9s include responses to mini-tenders and tenders for non-listed REITs, which never file a Form 25, so the true completion rate is higher. Offenberg & Pirinsky (2015) report the same pattern for 2007–10: mean 58 days for tenders vs 134 for mergers, with a government review adding about 102 days.

- **A longer cap does admit more deals.** From the day after announcement: 24% fit under 60 days, 40% under 90 and 53% under 120.
- **But supply is not the constraint.** Even at 60 days, about 23 eligible deals are open on an average day (31 at 90 days, 36 at 120). That counts the last 60 days of every completed deal, including the tender offers. The design has room for one or two 2%-stress positions.
- So the cap changes which deals the system picks, not how much capital it deploys.

**(b) How much the diversified book earns, and when** (`f1_fund_buyhold.csv`, `f1_fund_windows.csv`):

| Proxy | Period | Excess over bills a year | CAPM alpha (t) | Beta / down-market beta | Max drawdown | Worst 10 sessions | Excess per year held at H42 / H63 / H84 |
|---|---|---|---|---|---|---|---|
| MERFX | 1990–2007 | +2.4% | +1.8% (1.3) | 0.14 / 0.28 | −15.1% | −7.8% | 2.5% / 2.5% / 2.6% |
| MERFX | 2008–2026 | +1.9% | +1.0% (1.7) | 0.09 / 0.10 | −9.4% | −8.9% | 2.0% / 2.0% / 2.0% |
| ARBFX | 2002–2007 / 2008–2026 | +2.4% / +1.5% | +1.3% (0.7) / +0.5% (0.8) | 0.21 / 0.13; 0.09 / 0.12 | −17% / −15% | −13% / −11% | 2.3–2.0% / 1.5% |
| MNA (ETF) | 2009–2026 | +1.2% | −0.5% (−0.4) | 0.14 / 0.26 | −16.7% | −15.5% | 0.54% / 0.75% / 0.85% |
| MRGR (ETF) | 2012–2026 | +0.3% | −0.4% | 0.05 / 0.12 | −13.2% | −13.0% | ≈0 |
| ARB (ETF) | 2020–2026 | +1.2% | +0.7% (0.7) | 0.06 / 0.05 | −5.6% | −3.0% | 1.0% |

- **The rate per day held is flat across holds.** A 120-day position earns twice a 60-day one per trade, not more per year.
- **The crash signature is there.**
  - In the worst 5% of S&P months (S&P −8% to −10%), the funds lost 0.3–1.8%.
  - Monthly skew is −0.4 to −1.9 for every proxy except the young ARB (+0.7 over 2020–26).
- **Costs.** Fund returns are net of their fees, roughly 0.75–2% a year. A single-deal follower saves the fee but pays target spreads and carries undiversified break risk.

**(c) A 3–4-month timing mechanism: buy the arb book after a spread blow-out** (the fund 3–5% below its 1-year high, or down 2–3% in 21 sessions; `f1_timing_tests.csv`):

| Sample | Rows (4 signals × 3 holds) | Mean edge vs random entry | Share of rows > 0 | Range |
|---|---|---|---|---|
| MERFX design, 1990–2007 | 12 | −0.1% | 33% | −1.2% to +1.0% |
| ARBFX design, 2002–2007 | 12 | +0.5% | 75% | −2.8% to +2.1% (n 2–9) |
| MERFX test, 2008–2026 | 12 | +1.0% | 100% | +0.5% to +1.8% |
| MNA test, 2010–2026 | 12 | +0.3% | 67% | −0.4% to +0.9% |

- The design-period pick on MERFX (a −5% drawdown, H84: +1.0%, p 0.39) earned in MNA +0.1% / +0.9% / +0.5% at H42 / H63 / H84 (p 0.92 / 0.21 / 0.57).
- The effect exists only after 2008, and in 2008–09 and 2020 in particular.
- There are 8–10 test trades per cell: fewer than 10 independent episodes, so it is **paper-only** by the design's rule.

**(d) Sizing a single cash deal under the design's rules** (`f1_single_deal_sizing.csv`):
- **Notional.**
  - A break costs 20–45%, 30% central; that is the stress, since there is no stop.
  - So notional = 2% / 30% = 6.7% per deal. With 1.5 deals open on average, about 10% of NAV is in deals.
- **Rate.**
  - Central: MERFX's post-2008 2.0% a year over bills, net of its fee; κ 0.5.
  - Low: MNA's 0.5–0.8% with κ 0.3. High: MERFX's pre-2008 2.5%, unshrunk.

| Cap (typical deal held) | Growth per trade on the book (κ 0.5) | Clears the 6 bp hurdle? | Contribution a year (1.5 deals open) |
|---|---|---|---|
| 60 d (55 days) | 0.9 bp | No | **+0.10%** (low +0.02, high +0.25) |
| 90 d (85 days) | 1.5 bp | No | **+0.10%** |
| 120 d (115 days) | 2.0 bp | No | **+0.10%** |

Even at a 4% rate a deal adds only 1.9 / 3.0 / 4.1 bp. A deal needs an arb premium of about 12% a year (at 55 days) or 6% (at 115 days) to clear 6 bp at 6.7% notional.

**Executability.**
- Cash targets: one dollar market order in the IRA ✓. The cash-out at closing needs no order.
- Stock-for-stock deals need a short in the acquirer ✗ (no shorts in v1).
- MNA / MRGR / ARB: ETFs ✓, but none is on the §3a whitelist yet.
- MERFX / ARBFX: mutual funds, which Robinhood does not sell ✗.

**Verdict: shadow, unchanged.** The design already shadows near-completion cash mergers. A longer cap admits more deals but adds nothing per year, because the stress budget, not the cap, limits the book. As a policy module it would be worth about +0.10 points a year at any cap, with a short-put tail that loses in the same crises as M1 and W10.

### 2.2 Option premium at 60–120 DTE vs M7's 40–50 DTE

**Mechanism.** Index options are priced above expected realised volatility (Carr & Wu 2009). How that premium is spread across maturities matters here:
- Dew-Becker, Giglio, Le & Rodriguez (2017) find investors pay mainly for protection against short-horizon realised variance, and little for longer-horizon variance news.
- Egloff, Leippold & Wu (2010) model the variance-swap term structure.
- For an out-of-the-money put spread, time decay is also concentrated in the last weeks before expiry.

**(a) Real prices: the variance premium per year by tenor** (implied variance minus realised S&P variance over the tenor, in variance points; `f2_vrp_term_structure.csv`):

| Tenor | 1990–2007: mean (NW t) | 2008–2026: mean (NW t) | 2008–26 median | Share of months > 0 (2008–26) | Worst month |
|---|---|---|---|---|---|
| VIX (30 d) | **145 (8.9)** | 63 (1.2) | 116 | 83% | −7,329 (end-Feb 2020) |
| VIX3M (93 d) | – | 123 (1.9) | 178 | 86% | −4,225 |
| VIX6M (183 d) | – | 169 (2.2) | 231 | 85% | −2,733 |

- Hold-to-maturity variance premiums per year are **not smaller** at 3–6 months. If anything they are larger, because the VIX curve slopes up in calm markets.
- But a put spread earns its premium through time decay near expiry. In the model it earns much less per day held at longer DTE (table b).

**(b) Modelled put spreads** (M7's structure: sell 0.20 delta, buy 5% lower; M7's filters; one spread at a time; SPX surface; `f2_putspread_stats.csv`). Per trade = % of max loss. Per year = at 2% of NAV max loss per trade (the design's size). Fit = the caps under which the longest possible hold fits.

| DTE, exit | Fits | Days held | Trades a year | Per trade, 2008–26: history / forward drift / XSP costs | Per 30 days held, 2008–26 | **Per year, forward drift: 1990–2007 / 2008–26** |
|---|---|---|---|---|---|---|
| 45, 50% or 21 DTE (**M7 today**) | 60 | 15–18 | 8.6 | +2.0 / +1.6 / +1.0% | 4.1% | +0.16 / +0.27% |
| 45, hold to T−1 | 60 | 44 | 4.6 | +5.5 / +4.8 / +4.6% | 3.7% | **+0.62 / +0.44%** |
| 60, hold to T−1 | 60 | 59 | 3.7 | +7.5 / +6.6 / +6.6% | 3.8% | **+0.40 / +0.49%** |
| 90, 50% or 21 DTE | 90 | 38–48 | 4.7–5.7 | +2.2 / +1.1 / +1.8% | 1.7% | +0.12 / +0.12% |
| 90, 50% or the 90-day cap | 90 | 40–50 | 4.7–5.7 | +3.8 / +2.8 / +3.2% | 2.9% | −0.04 / +0.32% |
| 90, hold to T−1 | 90 | 90 | 3.0–3.2 | +8.1 / +6.5 / +7.1% | 2.7% | +0.24 / +0.39% |
| 120, 50% or 21 DTE | 120 | 47–63 | 3.7–4.7 | +3.9 / +2.3 / +3.2% | 2.5% | +0.12 / +0.20% |
| 120, 50% or the 120-day cap | 120 | 48–64 | 3.7–4.7 | +5.6 / +4.5 / +5.3% | 3.5% | +0.16 / +0.39% |
| 120, hold to T−1 | 120 | 119 | 2.1–2.2 | +5.9 / +4.9 / +4.7% | 1.5% | −0.04 / +0.21% |

- **The best rule that fits under 60 days beats every 90- or 120-day rule**, in both halves and under both drift conventions. That rule is a 45- or 60-DTE spread held to the day before expiry.
- **Held to the day before expiry, a 120-DTE spread earns two-fifths as much per 30 days as a 45–60-DTE spread** (1.5% vs 3.7–3.8% of max loss).
  - The best 120-DTE rule (take profit, or close at the cap) comes close per day (3.5%). But it trades less often and earned only +0.16 a year before 2008, against +0.62 for the 45-DTE spread.
  - With one spread at a time (the 2% max-loss cap and the 3% factor premium budget), a longer DTE means fewer, slower trades.
- After track 14's model bias (about −0.6% of max loss per cycle after 2008), κ 0.5 and forward drift, the best rule is worth **+0.22 points a year under any cap**: the change from 60 to 90 or 120 is 0.
- **M7's filter adds value up to 90 DTE, not at 120** (the edge over unfiltered entries, per trade, 2008–26):
  - 45 DTE: +0.7%;
  - 60 DTE: +3.1%;
  - 90 DTE: +2.8%;
  - 120 DTE: −1.6%.
- Real-price check (track 14): CBOE's monthly put-write earned +4.0% a year alpha before 2008 and −0.2% after, and the monthly buy-write (BXM) +1.6% and −1.4%. There is no free real-price index of 3–4-month put-writes or buy-writes, so the DTE comparison rests on the model.

**Executability.**
- A two-leg vertical at one net limit, in the taxable account ✓.
- Closed at least one trading day before expiry ✓. The T−1 rules comply.
- Every version needs ≈$162k to stay within the 2% max-loss size (one 5%-wide XSP spread risks about $3.3k), so it is off at $100k whatever the DTE.
- Naked put-writes and buy-writes (covered calls) are not two-leg verticals, so they are not among the three order kinds; naked short options are also on the never-list ✗.

**Verdict: never at longer DTE.** A longer DTE adds nothing. Keep M7 as specified: paper, at ≥$162k.
- Side note, not a cap question: in the model, holding a 45–60-DTE spread to the day before expiry earns about twice as much a year as M7's 50% / 21-DTE management. The cost is more full-loss trades: the worst single trades were −100% and −104% of max loss, against −68% for M7.
- Track 14 chose the 21-DTE exit for tail reasons. Revisiting that is a separate, pre-registered question for the paper phase.

### 2.3 Sector and industry momentum with 3-month holds

**Mechanism.** Industries that did well over the past 6–12 months keep outperforming for months; industry momentum carries much of stock momentum (Moskowitz & Grinblatt 1999; the 3–12-month holding periods of Jegadeesh & Titman 1993). Track 13 rejected 1–3-month rotation with *monthly* holds. The question here is whether 3-month holds change that.

**Rule.**
- Rank by the trailing 3, 6 or 12-minus-1 month return.
- Hold the top k equally weighted for 21 / 42 / 63 / 84 sessions, with or without an absolute-momentum filter.
- Average over every phase offset. Results are the active return vs the market (Ken French) or vs SPY (SPDRs), net of costs. 192 variants (`f3_rotation_variants.csv`).

| Universe | Sample | Active return a year, mean of all variants: H21 / H42 / H63 / H84 | Share of variants > 0 at H63 | Mean t |
|---|---|---|---|---|
| KF 12 industries | 1927–2007 | +2.8 / +2.4 / +2.3 / +2.4% | 100% | 2.0–2.5 |
| KF 12 industries | 2008–2026 | +0.4 / +0.9 / +1.5 / +1.3% | 78% | 0.1–0.4 |
| KF 49 industries (top 3 / 5) | 1927–2007 | +4.8 / +5.1 / +5.3 / +5.4% | 100% | 3.1–3.2 |
| KF 49 industries | 2008–2026 | +0.9 / +0.5 / +0.4 / +0.2% | 58% | 0.0–0.2 |
| **9 sector SPDRs (next open)** | 1999–2007 | +2.9 / +3.3 / +4.0 / +4.5% | 100% | 0.6–1.2 |
| **9 sector SPDRs** | **2008–2026** | **−2.6 / −2.3 / −1.8 / −1.8%** | **11%** | −0.9 to −0.7 |

**Design-selected variant → test** (`f3_selection.csv`):
- KF12 (12-1 month, top 2) at H63: +3.9% a year (t 4.0) → **+3.7% (t 1.3)** after 2008.
- SPDRs (12-1 month, top 3) at H63: +4.6% (t 1.9) → **−0.8% (t −0.5)**.

**Reading.**
- Longer holds cut turnover and whipsaw, so they lose a little less than monthly rotation (SPDRs: −1.8% vs −2.6% a year).
- **But the investable version still loses to SPY after 2008 at every hold.** The long-history evidence (industries before 2008) is exactly what track 13 found at monthly holds, and it did not survive.
- **Contribution.** Top-1 sector ETF at 2% stress: notional 7%, from the median sector's worst 10-session loss of −28%. That gives **−0.09 / −0.05 / −0.03 points a year** at 60 / 90 / 120 days.

**Executability.**
- k = 1 needs ≤2 dollar orders per rebalance ✓.
- k = 2 needs up to 4, and k = 3 up to 6: over the 3-per-email limit ✗.

**Verdict: never.** Sector rotation stays on the never-list at any cap.

### 2.4 Post-earnings drift and other 60–120-day single-stock anomalies

**Mechanism.** Prices underreact to earnings news. Much of the drift used to arrive within about 60 trading days, part of it at the *next* announcements (Bernard & Thomas 1989, 1990). A 63–84-session hold spans the next release, which a 42-session hold does not, so this is the one place a longer cap could plausibly matter. Later work finds the drift concentrated in illiquid stocks (Chordia et al. 2009) and gone in large caps (Martineau 2022).

**Earnings drift, follower buys at the close of D+2** (108,796 releases; net of costs; excess vs the size-matched ETF; month-clustered t; `f4_pead.csv`):

| Long leg | Sample | H20 | H42 (60 d) | H63 (90 d) | H84 (120 d) |
|---|---|---|---|---|---|
| Top SUE decile, ≥$2bn | 2011–15 | −0.2% (−1.4) | −0.4% (−0.9) | −0.3% (−0.7) | −0.2% (−0.8) |
| Top SUE decile, ≥$2bn | **2016–26** | −0.5% (−1.2) | −1.3% (−1.1) | −1.8% (−1.4) | **−2.2% (−1.4)** |
| Top reaction decile, ≥$2bn | 2016–26 | −0.4% (−1.2) | −0.7% (−1.5) | −1.0% (−1.2) | −1.5% (−1.1) |
| Top SUE decile, $0.3–2bn | 2011–15 | −0.2% (0.5) | +0.3% (0.8) | +0.5% (2.2) | **+0.9% (2.6)** |
| Top SUE decile, $0.3–2bn | 2016–26 | −0.5% (−1.1) | −0.8% (−0.7) | −0.7% (−0.2) | **−0.4% (−0.2)** |

- Longer holds make large-cap PEAD *worse*.
- The one in-sample winner (small caps, H84, t 2.6 in 2011–15) is negative out of sample.
- Gross top-minus-bottom decile spreads lie between −2.1% and +1.4% at every hold. The large-cap SUE spread turns more negative as the hold grows: −0.3% at H20, −2.1% at H84 in 2016–26.

**Insider clusters** (≥2 insiders buying within 30 days; liquid names; buy at D+1; `f4_insiders.csv`):
- 2016–26, ≥$300m: −0.7% / −1.1% / −0.5% / −1.3% at H20 / H42 / H63 / H84 (t −1.7 to −2.3).
- The 2009–15 numbers are also ≤0.
- Opportunistic insider trades predicted returns in 1986–2007 (Cohen, Malloy & Pomorski 2012). A longer hold does not bring that back for a next-day follower.

**Spin-offs**, now that the design bans them only in their first 60 sessions (155 spincos; excess vs IWM, net; `f4_spinoffs.csv`):

| Entry | Sample (n) | H20 | H42 | H63 | H84 | Per slot-year: H42 / H63 / H84 |
|---|---|---|---|---|---|---|
| Session 61 | 2011–15 (47) | +1.2% | +1.3% (t 1.3) | +2.0% (1.3) | +5.0% (1.4) | 7.5% / 8.2% / 14.9% |
| Session 61 | **2016–26 (≈100)** | +1.6% | **+3.4% (1.5)** | +3.3% (1.0) | +6.1% (1.5) | **20% / 13% / 18%** |
| Session 20 (banned today) | 2016–26 | −3.1% | −0.2% | +2.8% | +4.3% | – |

- **Positive in both halves at every hold, but t ≤ 1.5.** Medians are near zero in 2011–15.
- About half of all spincos are missing from Yahoo, having been acquired (Cusatis, Miles & Woolridge 1993 put the long-run gains there) or failed. The direction of the bias is unknown.
- Per slot-year, the 42-session hold is as good as the longer ones in 2016–26, and worse in 2011–15. **There is no consistent benefit from a longer cap.**
- **Contribution.** One position; notional 5.1% (the median spinco's worst 10-session loss is −39%); 6 / 4 / 3 trades a year. That gives **+0.53 / +0.36 / +0.49 points a year**. Deflated-Sharpe probability 0.25–0.49 at the family's N, and 0.08–0.24 at the track's.

**Pre-2008.** The event sets start in 2011, so the pre-2008 evidence is the literature above. It shows strong drift before 1990, and decay since (McLean & Pontiff 2016).

**Executability.** Single-name longs are dollar market orders in the IRA ✓, one name per trade. The short legs of PEAD are not allowed ✗.

**Verdicts.**
- **PEAD: never** (it stays on the never-list; longer holds are worse).
- **Insider clusters: shadow** (unchanged; negative at every hold).
- **Spin-offs from session 61: shadow** (new). It is a ≤60-day idea, not a reason to loosen the cap.

### 2.5 Closed-end fund discounts and index effects

**CEF discounts. Mechanism.**
- CEF discounts swing with retail sentiment and mean-revert, so wide discounts predict higher fund returns (Lee, Shleifer & Thaler 1991; Pontiff 1995).
- Activists who push funds to open-end or tender narrow them (Bradley, Brav, Goldstein & Jiang 2010).

**Test.**
- 139 US CEFs with daily NAV (1999/2004–2026). Signal: the first close at which a fund's discount is ≥2 standard deviations wider than its own trailing 3 years; variants use 1.5 sd, or 1 year.
- Buy at the next open. Hold H42 / H63 / H84 (and H21).
- Pooled over funds. The table weights each signal month equally (crashes produce dozens of signals in one month) and uses Newey-West t on those monthly means (`f5b_cef_robustness.csv`). Trade-weighted means, in `f5_cef_tests.csv`, are higher after 2008 (+3.9% at H42), because the crash months carry more trades.

| Sample | Trades (funds) | Edge vs random entry: H21 / H42 / H63 / H84 | NW t at H42 / H63 / H84 | Discount narrowing, points of NAV: H42 / H63 / H84 (NW t) |
|---|---|---|---|---|
| **Design 1999–2007** | 136–178 (75) | +1.3 / **+1.9** / +2.8 / +3.0% | 1.7 / 2.7 / 1.9 | +1.8 (2.9) / +2.9 (3.8) / +2.4 (2.5) |
| **Test 2008–2026** | 931–1,169 (134) | +1.8 / **+2.5** / +2.7 / +3.1% | 2.8 / 1.9 / 1.9 | +2.2 (6.3) / +2.1 (4.7) / +2.5 (5.4) |
| Test without Sep 2008–Jun 2009 and Feb–Jun 2020 | 686–858 | +1.4 / +1.7 / +1.8 / +2.0% | 2.7 / 1.6 / 1.5 | +1.8 / +1.8 / +2.1 |
| Test, bond-like funds (NAV volatility < 12%) | 438–552 | +1.3 / +2.0 / +1.3 / +1.7% | 1.8 / 0.7 / 1.0 | +2.5 / +2.0 / +2.9 |

- **The effect is real in both halves**: the discount narrows by about 2 points of NAV, with t 2.5–6.6. It survives dropping the two crises and an extra 0.3% round-trip cost (edge +2.2% at H42 after 2008).
- **Most of it has arrived by session 42.** Ex-crisis, the edge is +1.7% at H42 and +2.0% at H84.
- The larger post-2008 edges at H63–H84 come from buying into the 2008–09 and 2020 crashes. Those trades include the worst ones:
  - TYG −76% (Feb 2020);
  - NRO −69% (Sep 2008).

**What it is worth under the design's caps** (`f5b_cef_capacity.csv`).
- Signals are plentiful: about 50–120 a year across the panel. The design has room for one or two CEF positions.
- The simulation takes signals as a slot frees, widest discount first. Notional is 2% ÷ each fund's own worst 10-session loss, about 5%.

| Positions | Sample | Contribution a year, κ 0.5: H42 (60 d) / H63 (90 d) / H84 (120 d), mean of the 3 variants | Growth per trade (bp) |
|---|---|---|---|
| One | 1999–2007 | +0.21 / +0.15 / +0.14% | 3–9 |
| One | 2008–2026 | **+0.21 / +0.14 / +0.11%** | 2–8 |
| Two | 2008–2026 | +0.39 / +0.26 / +0.22% | 1–7 |

**The 60-day version is worth the most in every configuration.** A longer cap cuts the value by 0.06–0.17 points, because each slot turns over less often.

**Caveats.**
- **Survivorship.** The panel is today's funds. Funds that were open-ended or liquidated at NAV are missing, which biases against the effect; funds that failed are also missing, which biases for it.
- **Crisis clustering.** 6–8% of the capacity-constrained trades fall in the two crises, where the worst losses are.
- **Leverage.** Many CEFs are leveraged; their worst 10-session losses reach −40% to −80%, so notionals are small.
- **Liquidity.** Spreads of 10–50 bp.
- **Timing.** For most funds the day's NAV is published in the evening, before the 22:17 ET job. Funds that publish later (or only weekly) would signal a day late.
- **Data.** Yahoo's NAV "Adj Close" is only partly adjusted for distributions, so the narrowing is measured on the unadjusted discount. The traded edge uses price only.
- **CEF tender capture itself was not tested here.** There are no free point-in-time data on tender terms and proration. The design already shadows it. A longer cap would admit entries between a tender's announcement and its commencement, but track 16's Dutch-auction evidence says such gains are priced at announcement (+5.9% jump, −0.9% for the follower).

**S&P 500 additions and deletions**, held from the first executable price, the open of the effective day E (point-in-time membership, 1997–2026; `f5_sp500_adds_deletes.csv`):

| Event | Sample | n priced / all | H20 | H42 | H63 | H84 |
|---|---|---|---|---|---|---|
| Additions (vs SPY) | 1997–2007 | 41 / 183 | −1.8% | −2.7% | −3.3% | −3.3% |
| Additions | 2008–2026 | 332 / 406 | −1.5% | −0.9% | −0.6% | −0.9% |
| **Deletions (vs IWM)** | **2008–2026** | **130 / 282** | +1.4% | **+5.5% (t 2.6)** | +3.6% (1.7) | +5.2% (1.8) |

- **Additions drift down after inclusion.** A long-only follower cannot use that; the inclusion effect itself has largely disappeared (Greenwood & Sammon 2025).
- **Deletions rebound.** This matches the asymmetry Chen, Noronha & Singal (2004) documented.
  - The rebound is complete by H42: 33% per slot-year at H42 vs 15–16% at H63–H84. **A longer cap adds nothing.**
  - Only 46% of deleted names still have Yahoo prices. The missing ones are disproportionately later failures, so the true rebound is lower.
  - There are too few priced deletions before 2008 to test.
  - Deflated-Sharpe probability 0.77 at the family's N, and 0.30 at the track's.
- Hypothetically, at one position that would be +0.83 / +0.38 / +0.41 points a year.

**Russell reconstitution** (long IWM or IWC from the day after the June recon; `f5_russell_recon.csv`):
- Edge vs random entry, 2008–25: +0.3% / −1.0% / −2.6% (IWM) at H42 / H63 / H84; 2001–07 is −4.6% to −7.1%.
- IWM minus IWB over the same windows: −0.7% to −1.4%.
- Small caps tend to lag *after* reconstitution. A long-only follower has nothing to buy. (Madhavan 2003 and Petajisto 2011 describe the demand effects around the event itself.)

**Executability.** CEFs, deleted stocks and IWM are all dollar market orders ✓. CEFs and single stocks must pass `check_venues.py`. Tendering shares into a CEF offer is a corporate-action instruction, not one of the three order kinds ✗.

**Verdicts.**
- **CEF wide-discount buys: shadow** (new, at ≤60 days; §5).
- **S&P deletions: the never-list stands.** The data look good but are survivor-biased; log the rebound in the shadow ledger if you want evidence.
- **Russell reconstitution: never.**

### 2.6 Other documented 3–4-month mechanisms

**(a) Turn-of-the-year small-cap window.**
- **Mechanism.** Tax-loss selling depresses small losers into December; they rebound in January (Keim 1983; Reinganum 1983; persistence: Haug & Hirschey 2006).
- **Test.** Long small caps from 1 Nov, 1 Dec or 15 Dec to the last session within 60 / 90 / 120 days; edge vs random entries of the same length (`f6_turn_of_year.csv`).

| Series, entry | Cap | 1927–1982 | 1983–2007 | 2008–2026 |
|---|---|---|---|---|
| KF smallest quintile, 15 Dec | **60 d** | **+6.6% (t 4.6)** | **+5.5% (3.2)** | +2.4% (1.0) |
| same | 90 d | +7.3% (3.2) | +6.4% (2.3) | +0.4% (0.1) |
| same | 120 d | +6.5% (2.6) | +5.4% (2.3) | −0.0% (0.0) |
| KF smallest quintile, 1 Nov | 60 d | −1.8% | −0.9% | +2.4% |
| same | 90 d | +3.7% (2.1) | +3.8% (1.9) | +4.1% (1.0) |
| same | 120 d | +5.0% (2.0) | +5.4% (2.1) | +5.4% (1.1) |
| **IWM, 1 Nov** (investable) | 60 / 90 / 120 d | – | +3.7 / +2.1 / +1.0% (2000–07, n 8) | **+2.9 / +3.0 / +2.3%** (t 1.2 / 1.0 / 0.7) |
| IWM, 1 Dec / 15 Dec | 60 d | – | +0.4% / −0.0% | +0.4% / +1.1% |

- **The January effect needs no more than 60 days.** A 15-December entry captures it inside today's cap.
- **It decayed after 2008**: the small-minus-large spread fell from +6.6% (t 7.0) to +4.2% (3.2) to +1.6% (0.9).
- A longer cap only lets the trade start earlier (1 November). The investable IWM version of that earns the same +2–3% at every cap, and its November gain is already reachable within 60 days.
- Deflated-Sharpe probability ≤0.07. Calendar trades stay on the never-list.

**(b) VIX-term-structure-filtered volatility carry.**
- **Mechanism.** VIX futures in contango roll down toward spot, so short positions earn a premium. The futures basis predicts futures returns (Simon & Campasano 2014), and the premium varies over time (Cheng 2019).
- **Test.** Short front-month VIX futures (CBOE VPD) or SVXY from the first close with VIX/VIX3M < 0.90; variants 0.85 / 0.95, and VIX < 20 (`f6_vol_carry.csv`, `f6_vol_carry_tails.csv`).
  - VPD, VIX/VIX3M < 0.90, edge vs random entry: design 2008–16 +4.0 / +4.3 / +2.0 / +1.6% at H21 / H42 / H63 / H84. **Test 2017–26: +1.1 / +0.9 / +1.7 / +3.1%**, placebo p 0.33–0.67.
  - The tail: VPD's worst day −31%, worst 10 sessions **−52%**, maximum drawdown −62%. SVXY: worst day −83%, maximum drawdown −95%. XIV, a −1× inverse ETN on the same futures, was terminated after the same February 2018 collapse.
  - At 2% stress the notional is 3.8% (VPD) or 2.2% (SVXY). That is worth +0.01 / +0.02 / +0.04 points a year even if the edge is real.
- **Verdict: never.** It is a short-VIX product with ruin risk (never-list). No defined-risk VIX-options version is on the whitelist or testable with free data.

**(c) Dividend and ex-date effects.**
- Stocks earn more in months when a dividend is expected (Hartzmark & Solomon 2013), but that is a within-one-month effect.
- Track 16 tested special dividends (+0.4% per trade in liquid names, t 1.0). Dividend capture is on the never-list; the price drops 90–94% of the dividend.
- **Nothing here depends on the cap. Not tested further.**

---

## 3. Multiple testing

`summary_ledger.csv`. "Design" rows are before-2008 or in-sample cells; "test" rows are after-2008 or out-of-sample.

| Family | Variants | Best design t | Best test t (what it is) | Bonferroni t, family / track | Noise max t (family) | Test cells > 0 |
|---|---|---|---|---|---|---|
| 1 Merger arb | 12 | 2.8 (ARBFX, n 5) | 3.0 (ARBFX after a 21-session loss ≤ −2%, H42; placebo p 0.03) | 2.87 / 3.82 | 1.67 | 89% |
| 2 Option premium | 30 | – | 6.4 (per-trade R vs zero on the model; a premium, not a timing edge) | 3.14 / 3.82 | 2.07 | 100% |
| 3 Sector momentum | 192 | 5.8 (KF49, 1927–2007) | 1.6 (KF12, 12-1 month, top 1, H63) | 3.65 / 3.82 | 2.75 | 44% |
| 4 Single stocks | 52 | 2.6 (small-cap SUE, H84, 2011–15) | 1.5 (spin-offs from session 61, H84) | 3.30 / 3.82 | 2.29 | 23% |
| 5 CEF and index | 26 | 3.6 (CEF 1.5 sd, 3 years, H21; NW) | 3.7 (CEF 2 sd, 1 year, H21; NW) | 3.10 / 3.82 | 2.01 | 65% |
| 6 Other | 68 | 4.8 (VPD, H21, 2008–16) | 2.2 (SVXY 0.95, H84, n 4) | 3.38 / 3.82 | 2.39 | 82% |
| **This track** | **380** | | | **3.82** | **2.97** | |
| **Tracks 13–17, 21, 22 and 24** | **≈3,580** | | | **4.34** | 3.60 | |

**Deflated-Sharpe probabilities of the candidates** (`summary_dsr.csv`; trials = the family's variants / the track's 380):

| Candidate | n | Per-trade Sharpe | DSR at family N / track N |
|---|---|---|---|
| CEF z ≤ −2 (3 years), H42, 2008–26 (signal-month means) | 146 | 0.29 | 0.92 / 0.69 |
| same, H63 / H84 | 139 / 135 | 0.24 / 0.26 | 0.77 / 0.44; 0.82 / 0.51 |
| S&P 500 deletion, open of E, H42 / H63 / H84 | 126–130 | 0.23 / 0.13 / 0.16 | 0.77 / 0.30; 0.25 / 0.03; 0.42 / 0.10 |
| Spin-off from session 61, H42 / H63 / H84 | 99–102 | 0.17 / 0.16 / 0.23 | 0.25 / 0.08; 0.26 / 0.09; 0.49 / 0.24 |
| MNA after a 21-session loss ≤ −2%, H63 | 20 | 0.35 | 0.45 / 0.08 |
| VIX carry, VPD, VIX/VIX3M < 0.90, H84, 2017–26 | 12 | 0.56 | 0.32 / 0.17 |
| Turn of year: IWM from 1 Nov, 90-day cap, 2008–26 | 18 | 0.23 | 0.07 / 0.02 |
| Turn of year: KF small quintile from 15 Dec, 60-day cap, 2008–26 | 18 | 0.24 | 0.05 / 0.01 |

**Reading.**
- Nothing clears the track's Bonferroni bar on a test-sample *edge*.
  - The only test cell above 3.82 is the modelled put spreads' per-trade t, which measures a premium against zero.
  - The best CEF test cell has an overlap-robust (Newey-West) t of 3.7 (2 sd, 1 year, H21).
  - Month-clustered t's that ignore overlapping holds look better: 4.0 for 1.5 sd, 3 years, H42. With Newey-West that falls to 3.1.
- Several design-period cells are high (KF49 industries 5.8, VPD 4.8). **None of them carried over to its test period.**
- The CEF effect is the only candidate that holds up across both halves, without the crises and against costs. Even so, its deflated-Sharpe probability is 0.44–0.69 at the track's N.
- In every family, **the cap dimension itself (H42 vs H63 vs H84) shows no systematic advantage for the longer holds** once capacity is counted (§4).

---

## 4. What 90 or 120 days would add

### 4.1 Contributions by family and cap

`summary_contributions.csv`, `summary_delta_vs_60.csv`. Figures are % of the portfolio a year over bills, κ-shrunk, at forward-looking drift, one position per family.

| Candidate | Status | 60 d | 90 d | 120 d | Change, 90 vs 60 | Change, 120 vs 60 |
|---|---|---|---|---|---|---|
| Merger arb: single cash deals (1.5 open) | shadow | +0.10 | +0.10 | +0.10 | 0 | 0 |
| Merger arb: MNA after a blow-out | shadow (paper-only, n < 10) | +0.01 | +0.03 | +0.03 | +0.02 | +0.02 |
| Best put spread under the cap (60 DTE held to T−1 at every cap) | paper (M7 off at $100k) | +0.22 | +0.22 | +0.22 | 0 | 0 |
| Top-1 sector SPDR | never | −0.09 | −0.05 | −0.03 | +0.04 | +0.05 |
| PEAD, top SUE decile ≥$2bn | never | −0.19 | −0.17 | −0.16 | +0.02 | +0.03 |
| Insider clusters ≥$300m | shadow (unchanged) | −0.16 | −0.04 | −0.08 | +0.12 | +0.07 |
| Spin-offs from session 61 | shadow (new) | +0.53 | +0.36 | +0.49 | −0.18 | −0.05 |
| CEF wide-discount buys | shadow (new) | +0.21 | +0.14 | +0.11 | −0.07 | −0.10 |
| S&P 500 deletions | never-list | +0.83 | +0.38 | +0.41 | −0.46 | −0.43 |
| Russell reconstitution (IWM) | never | +0.01 | −0.01 | −0.03 | −0.02 | −0.04 |
| Turn of year, IWM from 1 Nov | never (calendar) | +0.05 | +0.05 | +0.04 | 0 | −0.01 |
| VIX carry (VPD) | never (short-VIX) | +0.01 | +0.02 | +0.04 | +0.01 | +0.02 |
| **Live change (live and policy modules)** | | | | | **0** | **0** |

- The negative rows for PEAD, insiders and sector momentum are "less negative at longer holds" only because there are fewer trades. They are not candidates.
- Single cash deals and the best put spread change by exactly 0 with the cap.

**If the three new candidates (CEF-Z, spin-offs from session 61, MNA after blow-outs) were promoted anyway** (`summary_sensitivity.csv`):

| Scenario | Level at 60 / 90 / 120 d | Change, 90 vs 60 | Change, 120 vs 60 |
|---|---|---|---|
| **Central**: one position each, κ 0.5, post-2008 / 2016–26 edges | +0.75 / +0.53 / +0.62 | **−0.22** | **−0.13** |
| Two positions each | +1.25 / +1.01 / +1.22 | −0.24 | −0.03 |
| The other half's edges (CEF 1999–2007; spin-offs 2011–15; MERFX 1990–2007) | +0.41 / +0.39 / +0.57 | −0.02 | **+0.16** |
| κ = 0.5 × each rule's deflated-Sharpe probability at the track's N | +0.21 / +0.14 / +0.21 | −0.08 | 0.00 |

- **90 days loses in every scenario.**
- 120 days gains only if the 2011–15 spin-off sample is the right one: 47 events, t 1.4, negative medians, where the 84-session hold happened to do best.
- Weighted by the probability that each edge is real, the change at 120 days is zero.

### 4.2 Effect on the "loosen to 90" decision (decision 12)

| Source | 90 days vs 60 | 120 days vs 60 |
|---|---|---|
| Existing modules (track 23's re-estimate of track 21): W10 now; M4 at 90 DTE in Phase B | **+0.04 now** (−0.01 to +0.11; +0.10 before track 23's Phase B exit-price fix); ≈ +0.1 with M4 | ≈ the same as 90 (W10 fires less often; M4 no better) |
| New families of track 22 (live) | 0 (W10 counted once) | 0 |
| **New families of this track (live)** | **0** | **0** |
| Same, if this track's three new shadow candidates were promoted | −0.22 (range −0.24 to −0.02) | −0.13 (range −0.13 to +0.16) |
| **Phase A book (M1, M2, M3, W10), nominal, track 23** | **4.98% → 5.02%** | **5.03%** |

**The decision is unchanged.**
- Decision 12 (29 Sep) loosens the cap to 90 days for W10 now and M4 in Phase B only, keeps every other rule at 60 days, and rejects 120. This track supports all three parts: no untested family gains from 90 or 120 days.
- A global 90- or 120-day cap is still not needed. No family in tracks 22 or 24 wants one, and a global cap would mainly admit drift-harvesting trades.

### 4.3 The per-trade hurdle favours longer holds for the wrong reason

The design admits a discretionary trade only if it adds ≥6 bp of growth to the book. For a rule that earns a constant edge per day held, per-trade growth is proportional to the hold, so a longer cap can push a trade over the hurdle without adding anything per year:

| Rule | Growth per trade, 60 / 90 / 120 d | Contribution a year, 60 / 90 / 120 d |
|---|---|---|
| Merger arb, single cash deal | 0.9 / 1.5 / 2.0 bp | +0.10 / +0.10 / +0.10% |
| MNA after a blow-out | 1.1 / 5.2 / 4.7 bp | +0.01 / +0.03 / +0.03% |
| CEF wide-discount buy (one position) | 4.2 / 4.1 / 4.2 bp | +0.21 / +0.14 / +0.11% |
| Spin-off from session 61 | 8.9 / 8.9 / 16.2 bp | +0.53 / +0.36 / +0.49% |

**Recommendation for the annual review.** Where a rule's signals are frequent enough to keep its slot busy, judge it by contribution a year within the risk budget, not by the per-trade hurdle alone. Otherwise the hurdle quietly biases the system toward longer holds and more beta.

---

## 5. Side findings that do not depend on the cap

This search was about the cap, but it turned up two ≤60-day ideas that no earlier track tested. Neither is ready for money. Both cost nothing to log.

| Candidate | Rule (as it would be pre-registered) | Evidence | Caveats | Proposed status |
|---|---|---|---|---|
| **CEF-Z** | Buy a US-listed CEF at the next open when its discount is ≥2 sd wider than its own trailing 3-year average. Hold 42 sessions (≤60 days). One position. Notional = 2% ÷ the fund's worst 10-session loss (median ≈5%) | Edge vs random entry +1.9% / +2.5% (signal-month means; 1999–2007 / 2008–26; NW t 1.7 / 2.8). Discount narrows 1.8–2.2 points (t 2.9 / 6.3). Holds without the crises. DSR 0.69 at the track's N | Survivor panel; crisis clustering (TYG −76% in 2020); CEF leverage; 10–50 bp spreads; overlaps W10/M1 in crashes (US-equity cluster); a fund's own-history z-score misreads a lasting regime change (below) | **Shadow ledger.** Promote only after ≥30 shadow trades with mean edge ≥ +1% and t ≥ 2 |
| **SPIN-61** | Buy a spinco once it has traded 61 sessions (the test enters at that close). Hold 42 sessions. One position. The design's event floor ($300m, $1m a day) would also apply; the test used all 155 validated spincos | +3.4% vs IWM per trade (2016–26, t 1.5); +1.3% (2011–15, t 1.3) | Half the spincos are missing (survivorship, either direction); n ≈ 10 a year; DSR 0.08 at the track's N | **Shadow ledger**, same promotion rule |

The S&P deletion rebound stays on the never-list. If you want evidence, a shadow entry (buy at the open of the effective day, hold 42 sessions) would show within a few years whether the survivor-biased +5.5% is real.

**Today (28 Sep 2026).**
- **CEF-Z would be firing broadly.** 31 of the 138 funds with a current NAV are at z ≤ −2 (`f5_cef_panel.csv`, `z_now_w756`).
  - They include PIMCO's income funds (PHK, PFN, PDI, PTY, PCN), Eaton Vance's option-income funds (ETV, ETY, EOS) and several loan and high-yield funds.
  - For the PIMCO funds this is the end of a long-standing *premium*, not an ordinary widening. A z-score against the fund's own history reads that as "cheap". A shadow ledger started now would test exactly this weakness.
- SPIN-61 is idle until a spinco reaches its 61st session.
- None of the verdicts above is time-sensitive.

---

## 6. Limitations

- **Models and proxies.**
  - The option results are priced on track 14's synthetic surface. For 90–120 DTE it reuses the 21–70-DTE smile shape (an approximation), and after 2008 it is about 0.6% of max loss per cycle too generous.
  - Merger-arb returns come from funds and ETFs, because Yahoo drops completed targets.
- **Survivorship.** The CEF panel, the spin-off, earnings and insider event sets, and the S&P deletions all use today's tickers. The direction of the bias is stated in each section: against CEF discount capture, for the deletion rebound, and unclear for spin-offs.
- **Short event histories.** Single-stock events start in 2011, so their "pre-2008" evidence is the literature.
- **Small samples where the cap matters most.** Merger-arb timing has 8–10 test trades; VIX carry 12; the turn of the year 18 years.
- **Deal durations.**
  - The announcement date comes from filing chains and can be late if no soliciting material was filed on day 0.
  - "Completed" means a Form 25 or 15 within 730 days.
  - The DEFM14A text filter also catches mixed cash-and-stock deals.
- **Capacity.** "One position per family" is a simplification of the design's shared stress, cluster and position caps. Two positions double some contributions but do not change which cap is best.
- **Forward drift** (S&P 3–6% at CAPE ≈41; bills 4.2%) is an assumption, as in tracks 21–22.
- **Data after the training cutoff.** 2025–26 prices come from live feeds (Yahoo, CBOE, EDGAR) and could not be independently verified.

---

## 7. Implications for the design (concrete, testable)

1. **Keep decision 12 as it is.**
   - 60 days for everything except W10 now and M4 in Phase B, which get 90.
   - 120 days rejected.
   - No family searched here earns more at 90 or 120 days.
2. **Keep on the never-list, at any cap:**
   - sector and country rotation;
   - post-earnings drift;
   - index-inclusion and reconstitution trades;
   - calendar windows, including the turn of the year;
   - short-VIX products;
   - dividend capture.
   Add "put spreads opened beyond ~60 DTE" as a note under M7: no gain, slower turnover.
3. **Merger arbitrage stays in the shadow ledger** (near-completion cash deals, as today). A longer cap would admit more deals but not more capital, because the stress budget binds first. If you ever want it as a cash substitute, it needs a policy exemption from the 6 bp hurdle and a place in the short-put budget.
4. **Add two ≤60-day shadow rules: CEF-Z and SPIN-61** (§5). Each has a pre-registered promotion test. Neither needs a cap change.
5. **At the annual review, add a capacity check to the admission test:** contribution a year inside the risk budget, next to the 6 bp per-trade hurdle (§4.3). That keeps the hurdle from rewarding longer holds that only buy drift.
6. **§6 of the design needs no change for this track.** It adds 0 to the expected return under any cap. Only the shadow-ledger list would gain CEF-Z and SPIN-61.

**Decision needed from the owner:** none. Decision 12 already reflects this track's answer. Optionally, approve adding CEF-Z and SPIN-61 to the shadow ledger (no emails, no capital).

---

## 8. Reproducibility

Code is in `research/code/24-duration-gaps/`. `python3 run_all.py` runs everything. It takes about 7 minutes on a warm cache; the first EDGAR pull alone takes about 45 minutes at SEC's rate limit. Earlier tracks' caches (13, 14, 16, 22) are read-only, and new downloads go to the scratchpad. Results are small CSVs in `results/`.

| Script | Purpose | Main outputs |
|---|---|---|
| `common24.py` | Paths, caps, forward assumptions, guarded placebo engine (track 22 `evaluate`), Ken French parser, spike cleaner, Newey-West, sizing, ledger | – |
| `refs24.py` | Crossref DOI check of all 34 citations | `references_checked.csv` |
| `f1b_deal_durations.py` | EDGAR SC 14D9 / DEFM14A → announcement and completion dates for 1,878 cash deals | `f1_deal_durations.csv`, `f1_deal_duration_summary.csv` |
| `f1_merger_arb.py` | Arb funds and ETFs: buy-and-hold, CAPM, holding windows, blow-out timing, single-deal sizing | `f1_fund_buyhold.csv`, `f1_fund_windows.csv`, `f1_timing_tests.csv`, `f1_single_deal_sizing.csv` |
| `f2_option_premium.py` | Real-price variance premium by tenor; put spreads at 45/60/90/120 DTE on track 14's surface | `f2_vrp_term_structure.csv`, `f2_putspread_stats.csv`, `f2_putspread_trades.csv.gz` |
| `f3_sector_momentum.py` | 192 rotation variants on KF12, KF49 and the sector SPDRs | `f3_rotation_variants.csv`, `f3_selection.csv`, `f3_hold_profile.csv` |
| `f4_single_stock.py` | PEAD, spin-offs and insider clusters at H20/42/63/84 (track 16 events and prices) | `f4_pead.csv`, `f4_pead_spread_by_year.csv`, `f4_spinoffs.csv`, `f4_spinoff_events.csv`, `f4_spinoff_stress.csv`, `f4_insiders.csv` |
| `f5_cef_index.py` | CEF panel and discount tests; S&P 500 additions and deletions; Russell reconstitution | `f5_cef_panel.csv`, `f5_cef_tests.csv`, `f5_cef_trades.csv.gz`, `f5_sp500_events.csv`, `f5_sp500_adds_deletes.csv`, `f5_russell_recon.csv` |
| `f5b_cef_robustness.py` | Newey-West, ex-crisis, bond vs equity funds, costs, capacity simulation | `f5b_cef_robustness.csv`, `f5b_cef_capacity.csv` |
| `f6_other.py` | Turn of year (KF size, IWM, IWC); VIX carry (VPD, SVXY) | `f6_turn_of_year.csv`, `f6_turn_of_year_smb.csv`, `f6_vol_carry.csv`, `f6_vol_carry_tails.csv` |
| `summary24.py` | Ledger, deflated Sharpe, contributions, changes vs 60 days, sensitivity of the new candidates | `summary_ledger.csv`, `summary_dsr.csv`, `summary_contributions.csv`, `summary_delta_vs_60.csv`, `summary_sensitivity.csv`, `summary_sensitivity_detail.csv` |
| `run_all.py` | Runs everything in order; logs to the scratchpad | – |

Per-family ledgers are in `ledger_f*.csv`.

---

## References

All DOIs were checked against Crossref (`results/references_checked.csv`, 34 of 34). Years are the journal issue years.

- Bailey, D. & López de Prado, M. (2014). The deflated Sharpe ratio. *Journal of Portfolio Management*. 10.3905/jpm.2014.40.5.094
- Baker, M. & Savasoglu, S. (2002). Limited arbitrage in mergers and acquisitions. *Journal of Financial Economics*. 10.1016/S0304-405X(02)00072-7
- Bernard, V. & Thomas, J. (1989). Post-earnings-announcement drift: delayed price response or risk premium? *Journal of Accounting Research*. 10.2307/2491062
- Bernard, V. & Thomas, J. (1990). Evidence that stock prices do not fully reflect the implications of current earnings for future earnings. *Journal of Accounting and Economics*. 10.1016/0165-4101(90)90008-R
- Bradley, M., Brav, A., Goldstein, I. & Jiang, W. (2010). Activist arbitrage: a study of open-ending attempts of closed-end funds. *Journal of Financial Economics*. 10.1016/j.jfineco.2009.01.005
- Carr, P. & Wu, L. (2009). Variance risk premiums. *Review of Financial Studies*. 10.1093/rfs/hhn038
- Chen, H., Noronha, G. & Singal, V. (2004). The price response to S&P 500 index additions and deletions: evidence of asymmetry and a new explanation. *Journal of Finance*. 10.1111/j.1540-6261.2004.00683.x
- Cheng, I.-H. (2019). The VIX premium. *Review of Financial Studies*. 10.1093/rfs/hhy062
- Chordia, T., Goyal, A., Sadka, G., Sadka, R. & Shivakumar, L. (2009). Liquidity and the post-earnings-announcement drift. *Financial Analysts Journal*. 10.2469/faj.v65.n4.3
- Cohen, L., Malloy, C. & Pomorski, L. (2012). Decoding inside information. *Journal of Finance*. 10.1111/j.1540-6261.2012.01740.x
- Cusatis, P., Miles, J. & Woolridge, J. R. (1993). Restructuring through spinoffs. *Journal of Financial Economics*. 10.1016/0304-405X(93)90009-Z
- Dew-Becker, I., Giglio, S., Le, A. & Rodriguez, M. (2017). The price of variance risk. *Journal of Financial Economics*. 10.1016/j.jfineco.2016.04.003
- Egloff, D., Leippold, M. & Wu, L. (2010). The term structure of variance swap rates and optimal variance swap investments. *Journal of Financial and Quantitative Analysis*. 10.1017/S0022109010000463
- Giglio, S. & Shue, K. (2014). No news is news: do markets underreact to nothing? *Review of Financial Studies*. 10.1093/rfs/hhu052
- Greenwood, R. & Sammon, M. (2025). The disappearing index effect. *Journal of Finance*. 10.1111/jofi.13410
- Harvey, C., Liu, Y. & Zhu, H. (2016). … and the cross-section of expected returns. *Review of Financial Studies*. 10.1093/rfs/hhv059
- Hartzmark, S. & Solomon, D. (2013). The dividend month premium. *Journal of Financial Economics*. 10.1016/j.jfineco.2013.02.015
- Haug, M. & Hirschey, M. (2006). The January effect. *Financial Analysts Journal*. 10.2469/faj.v62.n5.4284
- Israelov, R. & Nielsen, L. (2015). Covered calls uncovered. *Financial Analysts Journal*. 10.2469/faj.v71.n6.1
- Jegadeesh, N. & Titman, S. (1993). Returns to buying winners and selling losers. *Journal of Finance*. 10.1111/j.1540-6261.1993.tb04702.x
- Jetley, G. & Ji, X. (2010). The shrinking merger arbitrage spread: reasons and implications. *Financial Analysts Journal*. 10.2469/faj.v66.n2.3
- Keim, D. (1983). Size-related anomalies and stock return seasonality: further empirical evidence. *Journal of Financial Economics*. 10.1016/0304-405X(83)90025-9
- Lee, C., Shleifer, A. & Thaler, R. (1991). Investor sentiment and the closed-end fund puzzle. *Journal of Finance*. 10.2307/2328690
- Madhavan, A. (2003). The Russell reconstitution effect. *Financial Analysts Journal*. 10.2469/faj.v59.n4.2545
- Martineau, C. (2022). Rest in peace post-earnings announcement drift. *Critical Finance Review*. 10.1561/104.00000122
- McLean, R. D. & Pontiff, J. (2016). Does academic research destroy stock return predictability? *Journal of Finance*. 10.1111/jofi.12365
- Mitchell, M. & Pulvino, T. (2001). Characteristics of risk and return in risk arbitrage. *Journal of Finance*. 10.1111/0022-1082.00401
- Moskowitz, T. & Grinblatt, M. (1999). Do industries explain momentum? *Journal of Finance*. 10.1111/0022-1082.00146
- Offenberg, D. & Pirinsky, C. (2015). How do acquirers choose between mergers and tender offers? *Journal of Financial Economics*. 10.1016/j.jfineco.2015.02.006 (duration figures quoted from the working-paper version)
- Petajisto, A. (2011). The index premium and its hidden cost for index funds. *Journal of Empirical Finance*. 10.1016/j.jempfin.2010.10.002
- Pontiff, J. (1995). Closed-end fund premia and returns: implications for financial market equilibrium. *Journal of Financial Economics*. 10.1016/0304-405X(94)00800-G
- Reinganum, M. (1983). The anomalous stock market behavior of small firms in January: empirical tests for tax-loss selling effects. *Journal of Financial Economics*. 10.1016/0304-405X(83)90029-6
- Simon, D. & Campasano, J. (2014). The VIX futures basis: evidence and trading strategies. *Journal of Derivatives*. 10.3905/jod.2014.2014.1.034
- Ungar, J. & Moran, M. (2009). The cash-secured PutWrite strategy and performance of related benchmark indexes. *Journal of Alternative Investments*. 10.3905/jai.2009.11.4.043
