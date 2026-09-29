# 19 — Red-team review of 00-SYSTEM-DESIGN-v3.md (the 1–60 day trade system)

*Reviewer: adversarial red-team agent, 28–29 Sep 2026.*

**Version reviewed.** `00-SYSTEM-DESIGN-v3.md` as of 23:35:55 UTC on 28 Sep: 395 lines, md5 `c97d6bd3…`. Line numbers ("l.") refer to that version.

**Method.**
- I read the design end to end and checked it against tracks 13–18, the synthesis rev. 2 (§3.1–3.9), `11-trade-email-spec.md`, `DECISIONS.md` and track 05 §7.
- I spot-checked 35 numbers against the reports and their code outputs (Appendix).
- I recomputed several results from the tracks' own output files and the cached price data. Scripts and outputs are in the scratchpad (`…/scratchpad/19-redteam-v3/`):
  - `st1_hurdle.py`: ST-1's per-trade Δg against the 6 bp hurdle, and ST-1 by 5-year block (track 13's out-of-sample trade file);
  - `w10_retest.py`, `w10_placebo.py`: W10 re-tested at 42 and 60 sessions, from the crash-day close and from the next open, with an era-matched placebo. This replicates track 17 exactly (n = 21, +6.89%);
  - `w8_nextopen.py`: how much of the de-escalation drift happens on the first night;
  - `o2_episodes.py`: O2's dispersion, crisis clustering and shrunk contribution (track 14's `s05_trades.csv`);
  - `arithmetic.py`: the §6 sums, years to 11×, contract-size feasibility, ETF8 margin and the cost of unpaid short proceeds.
- I read the code for entry conventions: track 14 `s05_crash_and_spike_trades.py` (l.8), track 15 `assets.py` (l.267–271) and `p1_trend.run_portfolio`.

**Labels.**
- **VERIFIED** means I checked the finding against a report, code, data or arithmetic.
- **JUDGMENT** means it is my opinion.

**Severity.**
- **Critical** means it breaks the design or misleads a §12 decision.
- **Major** means it must be fixed before the build.
- **Minor** means clean-up.

---

## TL;DR — the ten issues that matter most

1. **The paper phase cannot end the way §7 says.** (C1)
   - The go-live rule needs ≥30 resolved trades within a paper window of at most 12 (+6) months. At ≈12 trades a year the Lean book fails by construction at month 18.
   - Phase A's modules (M1, M3, M4, M6) would produce only about 2–5 paper trades by the first look at month 3.
   - Track 18's own table gives a 25-trade-a-year book only a **5–14%** chance of passing by month 12 with a real edge (s = 0.1–0.3), and 3% with none. §6's "passable in 3–12 months by a real edge" is false at this cadence.
2. **The design's admission rules reject its own core modules.** (C2)
   - At the 6% cap, ST-1 adds **2.6 bp per trade**, against the §4 hurdle of 6 bp. At 13% it adds 5.6 bp, which still fails.
   - Clearing the hurdle needs 14% notional, a 4.6% stress, which breaks the 2% per-trade cap. §12 item 4 is wrong.
   - "Every trade must beat buy-and-hold" rejects M4 (it ties with the index), M3 (no significant alpha) and W8 (mostly equity drift). None of these exemptions is written down.
3. **M2, the largest contributor, can't run as backtested at the $100k default.** (C3)
   - ETF8 needs shorts (about 0.68× NAV today), but §4 puts ETFs in the IRA, which cannot short.
   - The ETF8 backtest credits short proceeds with T-bill interest. At a broker that pays nothing on them, that costs up to **≈2.9% of NAV a year** at today's weights, more than M2's whole +0.6–1.4%.
   - Gross exposure up to 3× NAV overrides rev. 2's ≤1.0× invariant without saying so.
   - M7 is infeasible at $100k, so "Full" at $100k is Lean + M2: about 22–24 trades and +1.3–2.9% a year by the design's own numbers.
4. **Module sizes and portfolio caps don't fit together.** (M1)
   - Stress is defined only for positions with stops, and M1, M2, M3 and W10 have none.
   - Using the design's own 33% gap for SPY, M2's equity legs alone use 6.3% of stress, more than the 6% US-equity cluster cap. With M1, W10 and W8 the cluster reaches 11.5%.
   - M2's 8 legs alone fill the "≤8 open positions" cap.
5. **W10 does not survive the design's default 60-calendar-day reading.** (M3)
   - Re-tested at 42 sessions: +3.5% against a +1.6% placebo, **p = 0.18**.
   - At 60 sessions: +6.9%, p = 0.006 (replicated).
   - So the §12.1 choice between calendar and trading days decides whether W10 exists at all.
6. **"Every backtest assumed next-open entries" (l.49) is false.** (M2)
   - O2 was priced at the signal-day close. W8, W9 and W10 were measured from the day-0 close. R1 and R2 trade at the next close.
   - W10 loses nothing from next-open entry (first night −0.1%). W8 gives up about 11% of its 20-day drift. O2's loss is unmeasured and needs a re-run.
7. **The expectations are still too rosy.** (M4)
   - O2's +0.3–0.6% is unshrunk: κ = 0.5 gives +0.25%, and the evidence is 12 crisis episodes, not 26 independent trades.
   - M7's +0.2–0.3% is after tax but labelled pre-tax.
   - M3's +0.3–0.5% is Bitcoin beta.
   - The live-fund Sharpe range is cherry-picked: it is −0.01 to 0.60 across 8 funds, not 0.32–0.60.
   - My planning range is **Lean ≈ −0.3 to +1.2 points over bills (central ≈ +0.4), and Full at $100k ≈ −0.3 to +2.4 (central ≈ +1.0)**. On those numbers, 11× takes about 45–55 years before tax, not 35–40.
8. **The execution rules contradict the modules.** (M5–M7)
   - §9's stop-loss bracket applies to modules that have no stops (M1, M2, M3, W10), and their backtests showed stops hurt.
   - The option-expiry rule forbids W8/W9's 45-DTE entries: 2 × 20 trading days is about 56 calendar days.
   - The option limit (mid + ¼ of the natural width) sits below the frozen paper-fill price (mid + 0.3 × width), so paper option orders never fill.
   - The schedule has no market-hours job to take option quotes.
9. **W8/W9 hand the trigger to an LLM.** (M9)
   - Track 17's mechanical triggers are gone, and the constitution forbids the LLM from creating candidates.
   - W8's invalidation market is unnamed. One plausible reading ("US × Iran ceasefire continues through 30 Nov", 39.0%) is already below the 40% trigger today.
   - W9 rests on n = 5.
10. **§12 asks the wrong questions.** (M13)
    - Phase A is blocked by account types, balances and permissions: SPY vs MES, IBIT vs MBT, XSP in a taxable account vs SPY options in the IRA, and a crypto-exchange account.
    - It also needs a broker with a practice account, Gmail production OAuth, and your approval of the policy exemptions and of two invariant changes (gross exposure and trade budget).
    - "Lean or Full", as framed, compares a Full book that doesn't exist at $100k with a Lean book that can't go live.

---

## Findings table

| # | Severity | Section | Issue | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|---|
| C1 | critical | §0 items 6–7 (l.30–33); §4 budget (l.193); §6 (l.259); §7 (l.266, 274–285); §10 Phase A (l.341–346) | **The go-live gate cannot be met at the design's cadence, and "trade" is undefined.**<br>(1) Go-live needs ≥30 resolved trades, and the paper window is ≤12 (+6) months. Lean ≈12/yr gives ≤18 trades at month 18: it fails by rule.<br>(2) Phase A (M1, M3, M4, M6) yields about 2–5 paper trades by month 3. M1 isn't firing (VIX 16.1); M3 is one position plus its 60-day re-entry; M4 fires about 0.7/yr; M6 is off.<br>(3) At 25/yr, track 18 gives P(go-live by month 12) = 3% (s = 0) to 14% (s = 0.3).<br>(4) Full size needs ≥100 resolved trades, with paper at half weight: about 9 years at 12/yr.<br>(5) The trade unit is undefined. M2 is 12 rebalances (budget) vs 8 legs (≤8 open-position cap) vs about 96 position-months (track 15's unit). Track 18 counts the *selected* book; the design doesn't say which book counts. | Track 18 l.591 ("≥30 resolved trades in the selected paper book"), l.608 (OC table), l.647 ("At 25 trades a year the 30-trade minimum is not even reached within 12 months"), l.34–35 and l.308 ("Below 20 a year … run as" a long-horizon system); track 15 l.158 (99 trades/yr for MICRO8). | (a) §4: "One M2 rebalance = one trade for the budget and the emails; M2 counts as one position for the ≤8-open cap; its legs count individually for stress and cluster caps; M3's forced 60-day re-entries are not new trades."<br>(b) §7: "For the Lean book, go-live is an operations gate: ≥3 months, ≥95% on-time runs, 0 validator failures, fills within tolerance, ≥90% of emails handled. P(s > 0) ≥ 0.7 is computed on the wide book of the *same rules* (ST-1b for M1, every M3 switch, M2 position-months) and stays advisory until the selected book has ≥30 trades."<br>(c) Replace l.259 with: "At 12–30 trades a year the edge gate is unlikely to pass within 12 months even for a real edge (track 18: ≤14% at 25/yr). Expect about 4–5 years (Full) to 9 years (Lean) before full size."<br>(d) Move M2 and the ST-1b shadow into Phase A (M12). | VERIFIED (rules, OC table, arithmetic); JUDGMENT (the Phase A trade count) |
| C2 | critical | §4 (l.185–186); M1 (l.82–91); M3 (l.119); M4 (l.127); W8 (l.131–135); §12.4 (l.389) | **The §4 admission tests reject the rule book's core modules.**<br>(1) M1 at 6% adds 2.6 bp per trade against the 6 bp hurdle, and 5.6 bp at 13%. It needs **14.0%** notional, a 4.6% stress, against the 2% per-trade cap. §12.4's "13% would clear the growth hurdle" was true only under track 13's retired 0.2%-a-year hurdle.<br>(2) "Every trade must beat … buy-and-hold" fails:<br>&nbsp;&nbsp;• M4: track 14 says it "ties with the index";<br>&nbsp;&nbsp;• M3: alpha t ≤ 1.34, "risk control, not alpha";<br>&nbsp;&nbsp;• W8: "much of this is ordinary equity drift".<br>(3) M3 at a 3% sleeve adds about 4–6 bp per switch: fails or borderline.<br>M1's listed exemptions (l.88–91) omit all of these. | `st1_hurdle.py` on track 13's 71 out-of-sample trades (mean excess 0.862%, halved): f = 0.06 → 2.58 bp; 0.13 → 5.57 bp; 0.14 → 6.00 bp. Per year at 6%: 0.098% (matches +0.1%). Track 14 l.56; track 15 l.334, 356, 663; track 17 l.723. | §4, new row: "**Policy modules** (owner-approved exemptions from the per-trade hurdle and the buy-and-hold test): M1 (6% stress-capped; rule-level Δg +0.10%/yr); M3 (risk switch on an opted-in BTC sleeve); M4 (loss-capped index exposure; must beat T-bills, not the index); W8 (equity drift with defined risk). Every other candidate must pass both tests."<br>§12.4: "ST-1 cannot clear the 6 bp hurdle inside the 2% per-trade stress cap (6% → 2.6 bp; 6 bp needs 14%, stress 4.6%). Choose (a) 6% as an exempt policy module [default], or (b) 14% with a per-trade stress exception of 4.6%." | VERIFIED |
| C3 | critical | M2 (l.95–108); §4 accounts (l.195); §6 (l.252–254); §12.2–3 | **At $100k, M2 cannot be run as backtested, and "Full" is mis-stated.**<br>(1) ETF8 is short IEF, FXE and FXY (0.68× NAV at s = 0.5 today), but §4 puts ETFs in the IRA, where shorting is impossible.<br>(2) The ETF8 backtest uses R = r − r_f, so shorts earn r_f − r: short proceeds are credited with T-bill interest. At a broker paying nothing on them the cost is up to 4.2% × 0.68 ≈ **2.9% of NAV a year**, more than M2's +0.6–1.4%.<br>(3) Reg T short margin is 50% × 0.68 = 34% of NAV, above "margin ≤25% of NAV" if that cap applies to ETF shorts.<br>(4) Shorts have uncapped losses: against email spec §1.4 and rev. 2 gate 5, with no stated exemption.<br>(5) Gross ≤3× NAV silently replaces rev. 2's invariant (gross ≤1.0×, "only you can change these").<br>(6) M7 is infeasible at $100k (one XSP spread = 3.24% max loss > the 3% cap). Full at $100k = Lean + M2: ≈22–24 trades and +1.3–2.9% (design's numbers), not ≈30 and +1.5–3.2%. | Track 15 `assets.etf_universe` (R = r.sub(rf)); `run_portfolio` (gross = W·R; borrow deducted, no rebate haircut); track 15 §7 weights (halved); rev. 2 l.118; email spec l.20; track 14 l.544; `arithmetic.py`. | M2, add: "Below ≈$800k choose one vehicle before Phase B:<br>(a) long-only ETF8 in the IRA (test Sharpe 0.45; keeps equity/bond beta; max drawdown ≈−12% at s = 0.5);<br>(b) ETF8 long/short in a taxable margin account, **only** at a broker that pays interest on short proceeds, with that rate modelled in the paper fills;<br>(c) one managed-futures ETF (e.g., DBMF or KMLM; live Sharpe 0.32–0.60) sized to ≈5% volatility, if you accept continuing positions."<br>Add to §12: "Approve gross exposure above 1.0× for M2."<br>§6: replace the Full row with "at $100k: Lean + M2 ≈ 22–24 trades; +1.3% to +2.9% (before M4's revisions)". | VERIFIED (code, arithmetic); JUDGMENT (the size of broker rebates: **[verify]** with the broker) |
| M1 | major | §4 caps (l.188–193); M1, M2, M3, W10 | **Stress is undefined for positions without stops, and the modules overflow the caps.**<br>Stress = R × gap multiple needs a stop, but M1, M2, M3 and W10 have none. With the design's own SPY convention (33% gap):<br>&nbsp;&nbsp;• M2's equity legs (0.19 NAV) → 6.3%;<br>&nbsp;&nbsp;• plus M1 2.0%, W10 2.2% and W8 1% → **11.5%**, against a 6% cluster cap and a 10% total cap.<br>Summing M2's 8 legs at the worst single-market month (≤1.5% each at s = 0.5) gives up to ≈12% > 10%.<br>M2's 8 legs fill the ≤8-open cap; its ≈96 position-months approach the 100-trade cap.<br>With no priority rule, the always-on M2 takes the room that M1, W10 and O2 need exactly when they fire. | `arithmetic.py`; design l.82 (33% gap); track 17 l.748 (W10 −30% path); track 15 l.639 (worst single-market month −1.5% at s = 0.5). | §4, add:<br>• "Stress for a position without a stop = notional × the instrument's worst 10-session loss in its full data history, computed by the build (S&P: −32.6%, track 13 §3.4), or the premium paid."<br>• "M2 is one sleeve: stress = its worst historical book month at the current s (≈4.5%), counted once. At most 3% of it may sit in the US-equity cluster; scale M2's equity legs down if needed."<br>• "Reserve 4% of US-equity cluster room for M1, W10 and M4; M2 may not use it."<br>• Unit definitions as in C1. | VERIFIED (arithmetic); JUDGMENT (the reserve sizes) |
| M2 | major | §1 (l.49); M2–M5 | **"Every backtest here assumed [next-open entries]" is false.**<br>• O2: "entry at the signal-day close" (track 14 code).<br>• W8/W9/W10: returns from the day-0 close, which track 17 calls "the earliest realistic entry". It is not realistic for a 22:17 ET email.<br>• R1/R2: "trades at the close one day after its signal".<br>• O1: entered at the close.<br>My checks:<br>• W10 is unaffected: first night −0.11%, 42-session +3.77% from the next open vs +3.64% close-to-close.<br>• W8 keeps ≈89%: first night +0.28% of a +2.49% 20-day drift, 9 SPY-era events.<br>• O2 is unmeasured, and crash-day f1 is +2.29% (track 17 §3.5). | Track 14 `s05_crash_and_spike_trades.py` l.8; track 17 l.74; track 15 l.3; track 14 l.236; `w10_retest.py`; `w8_nextopen.py`. | §1: "Entries are at the next open (options: the 10:00–10:30 ET snapshot). Modules whose backtests used the signal close (O2, O1, W8–W10) or the next close (M2, M3) must be re-run on that basis before promotion. **O2 must be re-run with next-day 10:00 entry before M4 ships.**" | VERIFIED |
| M3 | major | §1 (l.46); W10 (l.139–142); §2 (l.61); §12.1 | **W10 has no significant edge at 42 sessions, the version the default forces.**<br>Replicated: n = 21, f60 +6.89% vs placebo 2.18%, p 0.006 (track 17: 0.005).<br>At 42 sessions: **+3.52% vs 1.55% placebo, p = 0.175**. With an uptrend-only placebo, p = 0.09. t falls from 4.2 to 2.2.<br>The headline p is also the best of 8 cells (−3%/−4% × above/below the 200-day × pre/post-1990). The same rule on 1928–89 has p = 0.28. | `w10_retest.py`, `w10_placebo.py`; track 17 scratch output `out_robust.txt`. | §12.1, add: "Calendar days → W10 moves to the shadow ledger (42-session edge +2.0 points over placebo, p ≈ 0.18). Trading days → W10 runs on paper at 60 sessions (p 0.006, uncorrected for 8 cells)."<br>§2: "(best of 8 cells; 1928–89 p 0.28)". | VERIFIED |
| M4 | major | §0 items 2–4 (l.13–24); §2 (l.57–61); §6 (l.244–256) | **Expectations are not shrunk enough, mix units, and cherry-pick.**<br>(a) "then corrected for how many variants were tried": no survivor clears a strict correction post-2008. ST-1 DSR 0.64 at N = 533; R1 fails Bonferroni in all universes; R2 t ≤ 1.34 vs 2.84; O1 DSR ≤ 0.10; W10 uncorrected.<br>(b) M4: 0.71/yr × 2% × 34.8% = 0.49% unshrunk; κ = 0.5 gives **0.25%**. The 26 trades are 12 crisis episodes; 2002 and 2008–09 lost on average. SD 89% of debit, SE ±17 points.<br>(c) M7's "+0.2–0.3%" is **after** §1256 tax; pre-tax bias-adjusted it is +0.25–0.39%, with real-price alpha ≈0.<br>(d) M3's +0.3–0.5% is 3% × BTC's drift while the switch is on. The 50-day rule lost 53% in 2022, ≈−1.6% of NAV.<br>(e) M2: live funds span −0.01 to 0.60 (8 funds), not "0.32–0.60". At SR 0.15–0.3, P(5-year result < 0) = 25–37%.<br>(f) Track 18: realised κ after selection is 0.05–0.36 (typical ≈0.3); the design uses 0.5.<br>(g) §0's "0.5–3 points" ≠ §6's "0.7–3.2". "6–7% → 35–40 years" covers only the top of the §6 range: Lean at ≈5% needs 49 years; after 24–40.8% tax, 64–82 years. | `o2_episodes.py`; track 14 l.43, l.349–354; track 15 l.177–184, l.362; track 13 l.509; track 18 l.38–39; `arithmetic.py`. | Replace the §6 contribution column with the revised ranges in §A.4 (Lean ≈ −0.3 to +1.2; Full at $100k ≈ −0.3 to +2.4).<br>§0 item 2: "None of the survivors clears a strict multiple-testing bar on post-2008 data alone. They are kept because they also have pre-2008 or century-long evidence, a mechanism and, for R1, live-fund confirmation."<br>§0 item 3: "T-bills plus roughly 0–2 points (Lean ≈ +0.4, Full ≈ +1)."<br>§0 item 4: "At 5–6% a year, 11× takes ≈40–50 years before tax (55–80 in a taxable account)."<br>M7: "+0.25–0.39% pre-tax, bias-adjusted; −0.2 to +0.3% after the real-price evidence."<br>§2: "live funds −0.01 to 0.60, median ≈0.3". | VERIFIED (numbers); JUDGMENT (revised ranges) |
| M5 | major | §4 option expiry (l.194); §5 (l.209–210, 214); M4 (l.124–126); W8/W9 (l.132–137); email spec §6 | **The option-expiry, liquidity and event rules contradict W8, W9 and O2.**<br>(a) W8/W9 hold 20 trading days (≈28 calendar days), so 2× needs ≥56 DTE, but both allow 45.<br>(b) "unless … (O2)" seems to exempt only the close-before-expiry clause; a 60-day hold would otherwise need 120 DTE.<br>(c) The email spec says "time stop … before the final 60 days" and ≤5% bid-ask for options under 6 months. That blocks every 45–75 DTE trade, plus XSP (15.6% median), USO (14–19% round trip) and DAL (15%). Four different liquidity gates exist (tracks 04, 14, 17, 18).<br>(d) The never-list's "options bought into scheduled events (FOMC, CPI, payrolls, earnings)" covers every 45–75 DTE spread (≥1 CPI and ≥1 payrolls) and W8's DAL leg (earnings).<br>(e) The "weeklies" ban conflicts with using SPXW/XSP weekly-series expiries to hit ≤60 days.<br>(f) O2's SPY fallback held to expiry breaks track 14's "never hold American-style short options into expiry day". | Email spec l.128; track 14 l.547, l.566, l.679; track 17 l.599–604, l.782, l.844–851; track 18 l.531. | §4: "Option expiry (debit structures): DTE at entry ≥ max(2 × planned hold in **calendar** days, 45); close ≥10 trading days before expiry. Exception: O2 is held to expiry on the XSP/SPXW expiry nearest to, but not beyond, 60 calendar days. W8/W9: 56–75 DTE. SPY fallback: close by 15:00 ET on the business day before expiry."<br>"Liquidity: track 17 R8 applies to every option entry, measured from the market-hours snapshot; it replaces the email spec's 2%/5% gate."<br>Never-list: "options bought to play a scheduled release or earnings (entered ≤5 sessions before it, or with a thesis that depends on it); single-stock legs must expire before that stock's next earnings date"; "weeklies" → "any option with <40 DTE at entry". | VERIFIED |
| M6 | major | §9 (l.311–312); email spec §6 (futures row) | **The OTOCO stop bracket contradicts every stock, ETF and futures module.**<br>• M1: "No stop-loss". Track 13 found stops don't help; on QQQ a 3% stop cut the mean from +0.45% to +0.24%.<br>• W10: "Invalidation: none on price". Its edge includes riding −10% drawdowns.<br>• M2: "no discretionary stops".<br>• M3: exits on the switch.<br>The email spec's "defined stop always attached" (futures) conflicts too. A default bracket would change the tested rules. | Design l.80, 141; track 13 l.301–310; track 17 l.750; track 15 l.639. | §9: "Rule-exit modules (M1, M2, M3, W10) get **no** bracket. Entries: MOO (M1, W10) or a DAY limit at the band edge (M2, M3). Exits: EXIT email → MOO or MOC. OTOCO brackets apply only to future stop-based modules." Delete "defined stop always attached" from the email spec's futures playbook. | VERIFIED |
| M7 | major | §7 fill model (l.268–272); M4 (l.124); §10 schedule (l.323–350) | **Paper fills for options are unimplementable as written.**<br>(1) No market-hours job. The only runs are 22:17 and 08:47, which see after-hours quotes; track 14: "never use Yahoo after-hours quotes", XSP natural fills 22% worse than mid. Track 18 schedules a 10:17 ET option-fill job; the design dropped it.<br>(2) The limit (mid + ¼ natural width = mid + 0.5 half-spread) is **below** the frozen fill price (mid + 0.6 half-spread). A paper option buy never fills, or the model ignores the limit.<br>(3) Phase A ships M4, but option-chain snapshots arrive only in Phase B. | Track 18 l.329, 531; track 14 l.597–604, l.717; design l.124, 270, 341–347. | §10: "Add a 10:17 ET Mon–Fri job: snapshot the NBBO for every leg of pending option orders (delayed quotes are fine). Fill at mid + 0.6 × half-spread only if that is ≤ the order's limit; otherwise record 'no fill'."<br>M4/M7 and the email spec: "Cap every option limit ladder at mid + 0.3 × the natural width (= the fill model)."<br>Build the snapshot job in Phase A or move M4 to Phase B. | VERIFIED |
| M8 | major | §1 (l.48); M1 (l.79); M2 (l.96); M3 (l.116); M4; M7 (l.157); never-list (l.234) | **Several feasibility thresholds are wrong.**<br>• MES for M1 at the 6% cap needs NAV ≥ **$645k** ($298k at 13%), not "a sleeve ≳$80k". W10 via MES needs $578k.<br>• MBT for M3 at the 3% sleeve needs ≥ **$277k**; at "$50k" one MBT is 16.6% of NAV.<br>• MICRO8 at s = 0.5 with today's weights needs ≈**$755–815k** for one MNQ or MGC. Track 15's $250k is at s = 1.<br>• O2 at $100k is exactly one XSP spread ($1,844). It rounds to 0 whenever G(D) < 0.92, i.e. at a drawdown ≥6.1%, the state in which O2 fires.<br>• O1 needs $162k at its 2% target; $108k is at the 3% hard cap. | `arithmetic.py` from track 15 §5.1–5.2 and §7 weights, and track 14 §6.1. | l.48 and the modules:<br>• "MES for M1 only when 6% of NAV ≥ one contract (≈$650k); W10 ≈$580k."<br>• "MBT only when 3% of NAV ≥ one contract (≈$280k)."<br>• "Micro-futures trend book only above ≈$800k at s = 0.5."<br>• "XSP O1 ≥ $162k."<br>• O2: "round to the nearest contract within the 3% cap and exempt O2 from G(D)", or say that O2 is off at ≥6% drawdown. | VERIFIED |
| M9 | major | W8/W9 (l.131–138); §10 (l.335–336); §11 (l.362) | **W8/W9 triggers moved from rules to an LLM; the invalidation is ambiguous; W9's sample is too small.**<br>(a) Track 17's mechanical conditions are dropped:<br>&nbsp;&nbsp;• W8: an official announcement **and** Brent Dec/BNO ≤ −6% on the day **and** Polymarket blockade-end or Hormuz-normal +15 points, or through 75%;<br>&nbsp;&nbsp;• W9: ≥1 mb/d offline **and** front Brent/WTI ≥ +5%.<br>An LLM with web search now decides, against rev. 2 gate 11 ("may not add candidates").<br>(b) The paper phase has no "one-click confirmation", so paper W8/W9 would test an unconfirmed, unfrozen model.<br>(c) "Polymarket ceasefire odds < 40%" is unnamed:<br>&nbsp;&nbsp;• US × Iran through Nov 30 = **39.0%** and through Dec 31 = 35.5% (already below 40%);<br>&nbsp;&nbsp;• the Oct 31 market (55.5%) expires inside a 20-day hold;<br>&nbsp;&nbsp;• Israel × Iran through Nov 30 = 75%.<br>(d) W9 is n = 5 (track 17 R10(c): n < 10 → paper only; gate 1 needs ≥10), yet it is labelled live-eligible. DAL has n = 6. | Track 17 l.708–738, l.860, l.878; rev. 2 l.174, l.189; `polymarket17.csv` snapshot (track 17 scratch). | W8/W9: "Fire only when track 17's mechanical conditions all hold at the close. The LLM (pinned model version, hashed prompt) may **veto** only, returning an enum with ≥2 allow-listed citations, logged before the next open."<br>W8 invalidation: "'US × Iran ceasefire continues through <first listed date ≥ the trade's time stop>' < 40%; re-map by rule when that market resolves."<br>W9: "paper only (n = 5) unless you opt in to it as a hedge exception to gate 1." | VERIFIED |
| M10 | major | §4 governor and circuit breakers (l.191–192); M4 (l.123); W10 | **The brakes switch off the crisis modules exactly when they fire.**<br>O2 is "first day only, then a 60-day cool-down". A −2% day or −4% week pauses entries for 1–5 days, so one breaker trip erases O2's only entry in that crash. In the week of 24–28 Feb 2020 the book (M2 equity legs, M1, W10, BTC) would have lost ≈3.5% by my rough sizing, right at the threshold.<br>G(D) applies to everything through the §4 formula, and no exemptions are listed (rev. 2 exempted its crisis modules).<br>Are M2's monthly re-decisions "new trades" during the 20% pause? Unspecified. | Design l.191–192; rev. 2 l.132–133; track 17 l.466 (crash-day f1 +2.29%). | §4: "Circuit breakers pause discretionary entries only. M1, M4 and W10 entries proceed once the nightly data/fill check passes. M4 is exempt from G(D) (its 2% premium is its maximum loss). M2 re-decisions continue during a pause but may not raise gross exposure." | JUDGMENT (interaction size); VERIFIED (rule text) |
| M11 | major | M3 (l.110–119); §11 (l.360); never-list (l.205) | **M3's specification contradicts itself.**<br>• "About 5 switches a year" is the weekly 10-week rule (5.3/yr), but §11 runs the 50-day rule (11.4/yr).<br>• The ETH rule (28-day momentum, 15.6/yr) has no instrument (IBIT and MBT are BTC-only) and no share of the 3% sleeve.<br>• The "or" between the BTC rules is undefined.<br>• The never-list bans "trend lookbacks under 6 months", which covers all three rules.<br>• The 5-day minimum hold would block the whipsaw exits the backtest took. | Track 15 l.317–325, l.650–651; design l.119, 205, 360. | M3: "BTC only. Weekly close vs the 10-week average (5.3 trades/yr; max drawdown −48%; alpha t 0.24, so a risk switch, not alpha). Alternative: the 50-day average (11.4/yr; t 1.34). ETH goes to the shadow ledger. M3 is exempt from the minimum hold."<br>Never-list: "trend lookbacks under 6 months, **except M3's pre-registered crypto switch**". | VERIFIED |
| M12 | major | §10 build plan (l.339–350); §0 item 8 (l.38) | **The build plan is out of order and under-lists its data dependencies.**<br>• Phase A (M1, M3, M4, M6) generates almost no paper trades. M2, the only steady trade source, is in Phase B, although §0 says M2 opens the first paper positions.<br>• Missing dependencies: explicit futures months (the R3 contango veto on M2's USO leg and W9; M6's **CME** basis, whereas §11 quotes Deribit); a rolling map of Polymarket and Kalshi market names; VIX3M (M7, ST-2); option chains in market hours (M4, M7, W8, W9); EDGAR and FINRA feeds (shadow ledger).<br>• M6's depeg buy needs 24/7 monitoring. Its one US-regulated precedent, USDC, bottomed on **Saturday** 11 Mar 2023 and was at par within 2 days, so a Mon–Fri 22:17 ET run would likely have missed it.<br>• "≈1–2 weeks" for Phase A, including the shadow ledger, is unrealistic. | Track 05 l.529; track 15 l.669; track 17 l.881; design l.38, 341–347, 363. | §10:<br>• "**Phase A (≈3–4 weeks)**: data, snapshots and ledger; M1 + ST-1b shadow; M2 (the chosen vehicle, C3); M3; sizing, caps and governor; the ETF paper broker; emails; GitHub Actions + healthchecks; tests."<br>• "**Phase B**: the 10:17 ET option snapshot + M4/M7; W8/W9 with a frozen LLM veto; M6 with an hourly 24/7 crypto job (or drop the depeg leg); the EDGAR shadow screens."<br>• Add a data-dependency table per module (§C). | VERIFIED (dependencies); JUDGMENT (timeline) |
| M13 | major | §12 (l.381–395) | **The §12 decisions are mis-framed and incomplete.**<br>(1) §12.2 compares a Full book that isn't available at $100k (M7) with a Lean book that can't go live (C1).<br>(2) §12.4 is wrong (C2).<br>(3) §12.1 omits its consequences: W10 has p 0.18 at 42 sessions, and forced 60-day round trips on ETF8 cost ≈0.2–1.4% a year and create wash sales.<br>(4) Account types, balances and permissions are listed as "still open" but block Phase A: SPY vs MES, IBIT vs MBT, XSP in taxable vs SPY options in the IRA, a crypto-exchange account for M6, and a margin account for shorts.<br>(5) Missing: a broker with a practice account (needed for the fills gate); Gmail OAuth "In production" (DECISIONS #4); approval of the policy exemptions (C2) and of the gross-exposure (C3) and trade-budget (≤24 → 100) invariant changes; how the paper $100k is split between IRA and taxable. | Design l.381–395; DECISIONS.md l.10, 12–17; rev. 2 l.117–118; track 15 cost table (2–10 bp per side). | Rewrite §12 as:<br>1. 60 days = calendar or trading days, with the W10 and M2 consequences.<br>2. M2 on or off, and its vehicle at your size (C3).<br>3. Accounts: types, paper split, margin/options/futures permissions, and a broker with a paper account.<br>4. Approve the policy-module exemptions and the two invariant changes.<br>5. Gmail production OAuth and GitHub access.<br>6. Go-ahead.<br>Drop "Lean vs Full" as framed. | JUDGMENT |
| m1 | minor | §0 item 8 (l.35–38); M2 signal (l.99); §11 (l.359) | "Optionally averaged with the 126-day sign" is an unregistered free parameter, and it changes today's book: with averaging, gold and JPY go flat (126-day gold −12.8%, JPY +0.4%). §0 also omits the gold and crude longs. | Track 15 `p1_current_signals.json` (L126 GOLD −, JPY +). | "Signal: sign of the 252-day excess return (pre-registered; the 6-month blend is a Tier-2 annual change only)." | VERIFIED |
| m2 | minor | M1 (l.84) | "Range 0–8" trades a year: 2021 had 11; 2008 and 2017 had 0. | Track 13 ST-1 trade file. | "range 0–11". | VERIFIED |
| m3 | minor | §2 (l.60) | "+0.1% for a follower" is **gross**; net is −1.06% per 20 sessions. | Track 16 l.290. | "+0.1% gross, −1.1% after costs". | VERIFIED |
| m4 | minor | §0 item 2 (l.13) | "Each test used data before 2008 to design a rule and data after 2008 to test it" is false for tracks 15 (crypto 2013–20 / 2021–26), 16 (2009–15 / 2016–26) and 17 (placebo p-values, no design/test split). | Track 15 l.3; track 16 l.148–151; track 17 §0.1. | "Each test designed rules on an earlier period and tested them on a later one (2008 for most; 2016 for events; 2021 for crypto); track 17 used placebos." | VERIFIED |
| m5 | minor | §11 (l.360, 365, 367–377) | • BTC $83.5k → **$83,169**.<br>• M3's forced 60-day close (≈17 Oct) is not mentioned.<br>• "WTI does the same" is −3.8%, not −7%.<br>• The catalyst list omits 29 Oct GDP/PCE, 6 Nov payrolls and 10 Nov CPI, and includes 11 Dec, which is beyond 60 days (27 Nov). | Track 15 l.586; track 17 l.97, l.99. | Correct the numbers; add the three dates; move 11 Dec to "beyond the window". | VERIFIED |
| m6 | minor | M6 cash-and-carry (l.150) | • The size is missing (rev. 2: ≤15% notional, 2× margin buffer).<br>• The trigger was defined on the 2–3-month basis, which a ≤60-day hold cannot use.<br>• §4 splits the legs across accounts (IBIT in the IRA, MBT in taxable).<br>• Today's reading is Deribit, not CME. | Rev. 2 l.220; track 05 l.510, 512. | "≤15% notional; long IBIT and short MBT in the **same** taxable account (exception to the placement rule); CME contracts with ≤60 days to expiry; basis from CME prices." | VERIFIED |
| m7 | minor | M6 depeg (l.147–149) | A 5% position with no stop. Fiat-backed coins have gone to ≈0 (HUSD $0.02), so stress can reach ≈4.9%, above the 3% cap. | Track 05 l.536. | "≤3%, stress = 100% of the position". | VERIFIED |
| m8 | minor | W10 (l.142) | "Shares ST-1's slot": 9 of 20 SPY-era W10 events had an ST-1 signal within 3 sessions, so a 42-session W10 blocks M1's highest-VIX trades. The track 17 exits (all-time-high exit; void if VIX > 45) are missing. | `w10_placebo.py`; track 17 l.749–750. | "W10 runs in its own paper slot and never blocks M1; exit at day 42/60 or at a new all-time high; void if VIX > 45." | VERIFIED |
| m9 | minor | §4 minimum hold (l.193); M1 (l.89) | "5 days" has no unit (track 18: trading days) and no scope. Track 18's TL;DR bans 1–5-day mean-reversion archetypes; M1's exemption is justified only because its edge was measured on next-open fills, and should say so. | Track 18 l.43, l.367–369. | "Minimum *planned* hold 5 trading days; take-profit, invalidation and rule exits are exempt. M1 is exempt because its edge was measured on next-open fills." | VERIFIED |
| m10 | minor | M1 (l.88–91); §4 | The status of rev. 2's gates is unstated:<br>• gate 5 (defined maximum loss) is exempted only for M1, but M2, M3 and W10 also lack a defined maximum loss;<br>• gate 1 (≥10 analogs) fails for W9 (5) and M6 (≈3);<br>• the "VIX > 30 freeze" M1 is exempted from applies in rev. 2 only to short-put-like modules. | Rev. 2 l.129, l.174–178. | "Rev. 2 gates 1 and 5 apply to discretionary candidates only; the pre-registered modules M1–M7 carry the exemptions listed in their sections." Delete M1's VIX > 30 exemption or restate the rule. | VERIFIED |
| m11 | minor | §3, §5 | **Missing or dropped without comment:**<br>• O1-h (0.10Δ held to expiry: the fewest-trades O1 variant);<br>• CEF tender capture (track 05: ≤5%, +2–6% per event, fits 1–60 days);<br>• track 17's W4 BoJ paper setup and W6;<br>• the macro-factor budget (3% premium / 2% stop-risk per factor; rev. 2 and track 17 R10(d));<br>• the R3 contango veto, which is not wired to M2's USO leg or to W9. | Track 14 l.622; track 05 l.661; track 17 l.687–704, l.879; rev. 2 l.124. | Add O1-h, CEF tender and W4 to the shadow ledger. Restore the factor budget in §4. "R3 overrides any long USO/MCL leg (M2) and W9 entries." | VERIFIED |
| m12 | minor | §7 (l.274–284) | Dropped conditions: ≥90% of emails handled in the practice account and "the ledger verifies" (go-live); κ̂ ≥ 0.2 and implementation shortfall ≤20% (50% stage). | Track 18 l.592–597, l.656. | Restore them. | VERIFIED |
| m13 | minor | §10 (l.325) | GitHub Actions cron is UTC (**[verify]** whether a time-zone field is supported). 22:17 ET Mon–Fri becomes `17 2 * * 2-6` UTC in summer, which lands at 21:17 ET in winter. Scheduled runs can be delayed or dropped at load. | Track 09 (runtime). | "Schedule in UTC with a DST table; healthchecks.io alerts if no run by 23:30 ET." | JUDGMENT |
| m14 | minor | M1 (l.82) | "0.5 × the sleeve" is undefined: the whole system is the short-horizon sleeve. | Track 13 l.646. | "Notional = 6% × NAV × G(D)". | VERIFIED |
| m15 | minor | §5 (l.216, 220–224) | • "S&P or Russell index trades" should read "index-inclusion or reconstitution trades".<br>• "Spin-offs in their first 60 days" should be 60 **sessions** (track 16 N8).<br>• "≈$100k for XSP" conflicts with l.48's $110k (actual $108k at the 3% cap). | Track 16 l.769; track 14 l.544. | Reword. | VERIFIED |
| m16 | minor | §4 accounts; §7 | The paper broker needs the IRA/taxable split, T+1 settled cash, and the IRA's no-short and no-futures constraints, none of which is specified. | Track 18 l.453, l.515–517. | "account.yaml defines the paper accounts (e.g., $60k IRA / $40k taxable margin) and the paper broker enforces their constraints." | JUDGMENT |

---

## §A — Recomputations

### A.1 ST-1 against the §4 hurdle

Data: track 13's 71 out-of-sample trades (2008–26), excess over T-bills, mean halved (κ = 0.5); `st1_hurdle.py`.

| Notional (% of NAV) | Δg per trade | Δg per year (3.79 trades) | Stress at a 33% gap | Passes 6 bp? | Inside the 2% stress cap? |
|---|---|---|---|---|---|
| 6% (design default) | 2.58 bp | 0.098% | 1.98% | No | Yes |
| 10% | 4.29 bp | 0.16% | 3.3% | No | No |
| 13% (§12.4) | 5.57 bp | 0.21% | 4.3% | **No** | No |
| **14.0%** | **6.00 bp** | 0.23% | **4.6%** | Yes | **No** |

ST-1 by 5-year block (gated rule; the design's claim "it held in every 5-year block" is true):

| Block | n | Mean excess | t |
|---|---|---|---|
| 2008–12 | 19 | +0.51% | 0.76 |
| 2013–17 | 8 | +1.73% | — |
| 2018–22 | 25 | +0.92% | 2.5 |
| 2023–26 | 19 | +0.77% | 2.7 |

### A.2 W10 at 42 vs 60 sessions (`w10_retest.py`, `w10_placebo.py`)

- The rule is the first S&P close ≤ −3% with the prior close above its 200-day average, declustered over 20 sessions, 1990–2026. It gives n = 21, matching track 17.
- The placebo draws each event's date at random within ±3 years, 5,000 times.

| Horizon | Mean (median) | Era placebo | Two-sided p | Uptrend-only placebo p | t vs 0 |
|---|---|---|---|---|---|
| 42 sessions (≈60 calendar days) | **+3.52% (+6.05%)** | +1.55% | **0.175** | 0.092 | 2.20 |
| 60 sessions (≈84 calendar days) | +6.89% (+8.81%) | +2.18% | 0.006 | 0.001 | 4.15 |

- **From the next open** (SPY, n = 20): 42 sessions +3.77% (vs +3.64% close-to-close); 60 sessions +7.37% (vs +7.24%). The mean first night is −0.11%. Next-open entry is not W10's problem; the 42-session cap is.
- **Overlap:** 9 of 20 SPY-era events had an ST-1 signal on day 0–3.

### A.3 O2 (`o2_episodes.py`, on track 14's `s05_trades.csv`)

- **Sample.** n = 26 trades in **12 crisis episodes**. 15 of 37 years had any trade, so O2 is idle in about 60% of years.
- **Returns.** Mean +34.8% of debit, SD 88.7%, SE 17.4 points; 6 trades lost 100%.
- **Losing episodes.** 2002 (4 trades, mean −30%) and 2008–09 (5 trades, mean −13%).
- **Contribution at a 2% debit.** Unshrunk 0.49% a year; **κ = 0.5: 0.25%** (log growth 0.24%).
- **Entry.** The code enters "at the signal-day close". The system can only enter the next day after 10:00 ET, so the result must be re-run on that basis.

### A.4 The §6 arithmetic, and planning ranges I would use

- **The design's sums are correct as arithmetic.**
  - Lean: 0.1 + 0.3 + 0.3 + 0 + 0 = 0.7, up to 0.1 + 0.5 + 0.6 + 0.2 + 0.1 = 1.5.
  - Full: 1.5 to 3.2. Without M7 (infeasible at $100k): 1.3 to 2.9.
  - With T-bills: 4.9–7.4% nominal.
- **Years to 11×:** 5% → 49.1; 6% → 41.2; 7% → 35.4; 7.5% → 33.2. After tax on everything (24% / 40.8%): 5% → 64 / 82 years; 7.5% → 43 / 55 years.

| Module | Design (% a year over bills) | Evidence strength | My planning range (pre-tax) | Why |
|---|---|---|---|---|
| M1 ST-1 (6%) | +0.1 | DSR 0.64 (N = 533), 0.82 (N = 36); every 5-year block > 0 | +0.05 to +0.10 | Tiny at the cap either way |
| M2 trend (s = 0.5) | +0.6 to +1.4 | Fails Bonferroni in all universes; DSR 0.38–0.81; live funds −0.01 to 0.60 | **0 to +1.2** (futures or a managed-futures ETF); **negative** for ETF8 long/short unless short proceeds earn about bills | Decade-long droughts happen (26-market Sharpe 0.14 in the 2010s); P(5-year result < 0) 25–37% |
| M3 BTC switch (3%) | +0.3 to +0.5 | Alpha t ≤ 1.34 vs a 2.84 bar | −0.3 to +0.5 | It is BTC beta; 2022 alone −1.6% of NAV |
| M4 O2 (2%) | +0.3 to +0.6 | One pre-specified test; 12 episodes; ties with the index | +0.1 to +0.3 | κ = 0.5 → 0.25; next-day entry untested |
| M5 W8/W9 | 0 to +0.2 | n = 5–17, no FDR | −0.1 to +0.2 | W9 is a hedge; DAL/USO costs 14–19% |
| M6 | 0 to +0.1 | n ≈ 3 | 0 to +0.05 | Weekend depegs are missed (M12) |
| M7 O1 | +0.2 to +0.3 (after tax) | DSR ≤ 0.10; real-price alpha ≈0 | −0.2 to +0.3; **0 at $100k** | Mislabelled pre-tax |
| **Lean** | **+0.7 to +1.5** | | **≈ −0.3 to +1.2 (central ≈ +0.4)** | 4.6% nominal → ≈53 years to 11× |
| **Full at $100k** | **+1.5 to +3.2** | | **≈ −0.3 to +2.4 (central ≈ +1.0)** | 5.2% nominal → ≈47 years to 11× |

**Understated items.**
- Under a *trading-day* reading, W10 at 60 sessions is the strongest event rule in the dossier (p 0.006, replicated). The design treats it only as a "paper comparison".
- M2's crisis convexity (+16.6% in 2008 and +18% in 2022 at 10% volatility) offsets M1, M3 and W10 in exactly the episodes that hurt them. That is worth more to the book than its stand-alone Sharpe suggests (JUDGMENT).

### A.5 Feasibility and trade count at the $100k default

| Module | Vehicle at $100k | Size | Feasible? | Note |
|---|---|---|---|---|
| M1 | SPY (IRA) | 7 shares ≈ $5.4k | Yes | MES needs ≥ $645k |
| M2 | ETF8 | 0.47× long / 0.68× short | **Only** in a taxable margin account | IRA can't short; the short-proceeds rebate decides the sign (C3) |
| M3 | IBIT (IRA) | ≈ $3k | Yes (BTC only) | MBT needs ≥ $277k; ETH has no vehicle |
| M4 | 1 XSP spread | $1,844 (1.84%) | Yes, 1 contract | 0 contracts if G < 0.92; XSP may fail the liquidity gate after a crash |
| W8 / W9 | SPY or XSP 1 spread / DAL 2 / USO 1 | ≤1% / ≤0.75% | Yes | DAL earnings; USO round trip 14–19% |
| W10 | SPY | 6.7% | Yes (paper) | MES needs ≥ $578k |
| M6 depeg / carry | USDC (taxable) / IBIT + 1 MBT | ≤5% / $8.3k each | Yes / awkward | Needs an exchange account; the carry legs sit in two accounts |
| M7 | 1 XSP spread | 3.24% max loss | **No** | Above the 3% cap |

**Trade count.** The Lean book averages about 10–17 trades a year:
- M1: 3.8 (range 0–11);
- M3: 5.3 (10-week rule) or 11.4 (50-day rule), plus 6–16 more if ETH is kept;
- M4: 0.7, idle 60% of years;
- W8/W9: ≈0.4 a year over the long run (17 de-escalations in 73 years; 5 lasting supply losses in 36), more during the current war;
- M6: 0.3.

**In a calm year (like 2017, when M1 made 0 trades) the Lean book is 5–11 trades, mostly BTC switches on a 3% sleeve.** Its paper record will mostly test IBIT.

---

## §B — Consistency matrix (module × rule)

✗ = conflicts with the design's own rule as written; ✓ = consistent; — = not applicable.

| Module | 60 calendar days | Minimum hold 5 days | Next-open backtest | Option expiry rule | §9 bracket | 6 bp hurdle | Beats buy-and-hold | Never-list |
|---|---|---|---|---|---|---|---|---|
| M1 ST-1 | ✓ (≤20 sessions) | Exempt (stated) | ✓ | — | ✗ (no stop) | ✗ (2.6 bp) | ✓ (timing edge) | ✓ |
| M2 R1 | ✗ unless you allow continuing positions | ✓ | ✗ (next close) | — | ✗ (no stop) | ? (unit undefined) | — (shorts) | ✗ ("uncapped shorts", email spec) |
| M3 R2 | ✓ (forced close) | ✗ (whipsaws) | ✗ (next close) | — | ✗ (no stop) | ✗ / borderline | ✗ (t ≤ 1.34) | ✗ ("lookbacks < 6 months") |
| M4 O2 | ✓ only if expiry ≤ 60 days | ✓ | ✗ (signal close) | ✗ (2× = 120 DTE unless exempt) | — | ✓ (≈33 bp) | ✗ (ties) | ✗ ("bought into scheduled events") |
| W8 | ✓ | TP may exit early | ✗ (day-0 close) | ✗ (45 < 56 DTE) | — | ✓ | ✗ (equity drift) | ✗ (DAL earnings; releases) |
| W9 | ✓ | ✓ | ✗ (day-0 close) | ✗ (45 < 56 DTE) | — | ? | ? | ✗ (steep-contango veto not wired) |
| W10 | ✓ at 42 sessions, but then p = 0.18 | ✓ | ✗ (day-0 close; harmless) | — | ✗ (no stop) | ✓ | ✓ at 60, weak at 42 | ✓ |
| M6 | ✗ carry uses a 2–3-month basis | ✗ (depeg exits in days) | ✗ (intraday lows) | — | — | ✓ | — | ✗ ("crash-rebound buys" wording) |
| M7 O1 | ✓ (≤29 days) | ✓ | ✗ (entry at close) | — (credit spread) | — | ✓ | — | ✓ |

---

## §C — Build-plan risks and data dependencies

| Dependency | Needed by | Risk | Mitigation |
|---|---|---|---|
| Two-source SPY / VIX / ^GSPC closes | M1, W10, M4, M7 | Yahoo breaks periodically; a second free source is needed | Stooq + CBOE CSVs; a paid feed before live (design §10) |
| VIX3M | M7, ST-2 shadow | Short history; CBOE CSV timing | CBOE CSV plus Yahoo ^VIX3M, cross-checked |
| Explicit futures months (CLZ26, BZZ26, CME BTC months) | R3 veto (M2 crude leg, W9), W8/W9 triggers, M6 basis, MICRO8 rolls | Yahoo coverage of explicit months is patchy; continuous series are banned | A contract-calendar table; refuse the signal if a month is missing |
| Polymarket and Kalshi | W8/W9 triggers and invalidation; calibration | Dated markets expire; names change; possible geo or bot blocking from cloud IPs | Rule-based market mapping; store raw snapshots; fail closed |
| Option chains in market hours | M4, M7, W8, W9, I1/I2 shadow | 22:17 ET sees stale after-hours quotes | A 10:17 ET job (M7) |
| LLM + web search | W8/W9 classification, M6 attestation check | Non-determinism, prompt injection, model drift, no pre-launch backtest possible | Mechanical trigger first; LLM veto only; pinned model; hashed prompt; logged before the open (M9) |
| 24/7 crypto prices on ≥2 venues | M6 depeg, M3 | Weekend events | Hourly cron with push alerts, or drop the depeg leg |
| EDGAR (Form 4, 13D, 8-K), FINRA | Shadow ledger | SEC fair-access limits; regex precision | Track 16's code, rate-limited; its own phase |
| Gmail OAuth "In production"; GitHub App access | Everything | 7-day token expiry; blocked pushes | Owner actions in §12 |

---

## §D — The §12 decisions

| Decision in the design | Verdict | What it should say |
|---|---|---|
| 1. What "60 days" means | **Right question, missing consequences** | "Calendar days → W10 moves to shadow (p 0.18 at 42 sessions); M2 must be re-decided monthly with continuing positions allowed, or force-closed every 60 days (≈0.2–1.4% a year in ETF costs, plus wash sales). Trading days → W10 at 60 sessions (paper); O2 and W8/W9 unchanged." |
| 2. Lean or Full | **Mis-framed** | At $100k, Full = Lean + M2 (C3), and Lean cannot pass go-live (C1). Replace with "M2 on or off, and its vehicle at your size". |
| 3. Paper notional | **Right, but incomplete** | Add the account types, the paper split between IRA and taxable, margin/options/futures permissions, and a broker with a paper account. These decide Phase A's instruments (SPY vs MES, IBIT vs MBT, XSP vs SPY options). |
| 4. ST-1 size | **Wrong premise** | Fix as in C2: 6% as an exempt policy module (default), or 14% with a 4.6% per-trade stress exception. |
| 5. Go-ahead for Phase A | Fine | Only after 3 and 4 are answered, with Phase A re-scoped (M12). |
| 6. Still open | Partly blocking | "Account types" is blocking. Add: Gmail production OAuth; approval of the policy exemptions (M1, M3, M4, W8); approval of gross > 1.0× and a trade budget above 24 (rev. 2 invariants). The long-horizon core outside the system is, as the design says, the biggest lever: with the system's central excess of +0.4 to +1.0 points a year, that decision matters more than any in this list. |

---

## Appendix — spot-check log

✓ means it matches the source; ✗ means it does not.

| # | Claim (design) | Check | Result |
|---|---|---|---|
| 1 | ST-1: 3.8 trades a year, 82% winners, +0.88% per trade (l.57) | `finalists.csv` OOS: 3.79 a year, 81.7%, mean net 0.881% | ✓ |
| 2 | +0.43% planning value after halving | Mean excess 0.862% / 2 = 0.431% | ✓ (0.88 is net, 0.86 is excess; trivial) |
| 3 | M1 contributes +0.1% a year at 6% (l.86) | 2.58 bp × 3.79 = 0.098% | ✓ |
| 4 | A 33% gap costs 2% of the portfolio (l.82) | 6% × 33% = 1.98% | ✓ |
| 5 | 13% notional clears the growth hurdle (l.389) | 5.57 bp < 6 bp; needs 14.0% | ✗ (C2) |
| 6 | "Held in every 5-year block since 2008" (l.246) | Gated ST-1: +0.51 / +1.73 / +0.92 / +0.77% | ✓ (2008–12 t 0.76) |
| 7 | M1 range 0–8 trades a year (l.84) | 2021: 11 | ✗ (m2) |
| 8 | 4.7% a year, −14% drawdown vs SPY 11.3% / −52% (l.12) | Track 13 §8.1 | ✓ |
| 9 | ≈2,900 variants (l.13) | 533 + 840 + ~300 + 951 + 288 = 2,912 | ✓ |
| 10 | R1 test Sharpe 0.42–0.58 (l.59) | ETF8 0.42; MICRO8 0.58 | ✓ |
| 11 | Live managed-futures funds 0.32–0.60 (l.59) | 8 funds: −0.01, 0.06, 0.27, 0.29, 0.32, 0.36, 0.36, 0.60 | ✗ (M4) |
| 12 | +17% in 2008, +18% in 2022 (l.59) | MICRO8 +16.6 / +18.0 at 10% volatility | ✓ (twice the planned volatility) |
| 13 | M2 +0.6% to +1.4% log growth (l.103) | SR 0.15 / 0.3 at 5% volatility: 0.62% / 1.37% | ✓ |
| 14 | M2 worst month −4.5%, max drawdown −11% (l.104) | Track 15 R1 | ✓ |
| 15 | O2 +28% / +40% of debit; 1 in 4 lose all; ≈0.7 a year (l.127) | `s05_trades.csv`: 0.283 / 0.396; 6 of 26; 26 / 36.7 = 0.71 | ✓ (but 12 episodes) |
| 16 | O2 contributes +0.3% to +0.6%, "shrunk" (l.127, 242) | Unshrunk 0.49%; κ = 0.5 → 0.25% | ✗ (M4) |
| 17 | W10 +6.9% over 60 sessions, n = 21, p = 0.005 (l.61) | Replicated: n = 21, +6.89%, p 0.006 | ✓ (42 sessions: p 0.175) |
| 18 | M3 "about 5 switches a year" (l.119) | 10-week rule 5.3; the 50-day rule used in §11 is 11.4 | ✗ (M11) |
| 19 | BTC ≈$83.5k; long since 18 Aug at $64.7k (l.360) | $83,169; $64,696 | ✗ / ✓ |
| 20 | M1 trigger close ≤ ≈$757.6 (−1.05%), VIX 16.1 (l.358) | Track 13: $757.57, 16.07 | ✓ |
| 21 | Ceasefire to 31 Oct 55.5%; Fed hike 69–70% (l.362) | Polymarket US × Iran Oct 31: 0.555; Kalshi 69–70% | ✓ |
| 22 | Basis 4.9–5.3% vs ≈10% trigger (l.363) | Deribit Oct/Nov/Dec 4.9 / 5.3 / 5.3 | ✓ (but the rule says CME; m6) |
| 23 | Brent Nov expires 30 Sep, −7%; "WTI does the same" (l.365) | 105.98 → 98.60 = −6.96%; WTI −3.8% | ✓ / ✗ |
| 24 | XSP needs ≳$110k at the 3% cap (l.48) | $3,239 / 3% = $108k | ✓ ($162k at the 2% target) |
| 25 | Micro-futures book needs ≳$250k (l.48) | True at s = 1; at s = 0.5 ≈ $755–815k | ✗ (M8) |
| 26 | MES for the dip-buy needs a sleeve ≳$80k (l.48, 79) | 6% cap → $645k | ✗ (M8) |
| 27 | MBT for M3 at ≥$50k (l.116) | 3% sleeve → $277k | ✗ (M8) |
| 28 | Lean +0.7 to +1.5; Full +1.5 to +3.2 (l.253–254) | Sums check | ✓ (arithmetic) |
| 29 | 5–7.5% nominal (l.256) | 4.2 + 0.7 = 4.9; 4.2 + 3.2 = 7.4 | ✓ |
| 30 | 11× in ≈35–40 years at 6–7% (l.23) | 41.2 / 35.4 years; at 5%: 49 | ✓ for 6–7%, ✗ as the design's range |
| 31 | M7 +0.2 to +0.3% "pre-tax" (l.159, 242) | Track 14: after §1256 tax | ✗ (M4) |
| 32 | Go-live "passable in 3–12 months by a real edge" (l.259) | Track 18 OC at 25 a year: ≤14% by month 12 | ✗ (C1) |
| 33 | About 21% of go-lives have no edge (l.285) | Track 18 l.625 | ✓ |
| 34 | Insider follower +0.1% (l.60) | +0.12% gross, −1.06% net | ✓ gross (m3) |
| 35 | ST-1 down 30–50% from pre-publication (l.57) | 1.28% → 0.88% = −31% | ✓ |
