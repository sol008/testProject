# 23 — Verification of tracks 21 and 22: is loosening the 60-day cap to 90 (or 120) days worth it?

*29 September 2026. An independent red-team check of `21-duration-cap-existing-modules.md` and `22-duration-cap-new-strategies.md`, done before the owner changes the holding cap. Every number here comes from fresh code in `research/code/23-duration-verify/` (`python3 run_all.py`, about 25 seconds). That code imports nothing from tracks 13, 15, 21 or 22. It reads the same cached raw prices, and it reads tracks 21 and 22's output files only to reconcile against them. All figures are pre-tax. Nothing here is individualized advice.*

*Labels:*
- *"CAL90" means selling at the open of the last session dated within 90 calendar days of entry (CAL60 and CAL120 likewise).*
- *"F63" means a fixed 63 sessions: sell at the open of session 64. "C63" means selling at the close of session 63, which is the convention tracks 21 and 22 used.*
- *"p_era" is a two-sided placebo p against random entries within ±3 years, inside the same sample (20,000 draws). "p_up" is the same against random days whose prior close was above the 200-day average.*
- *κ shrinks an edge toward zero. "Points" means percentage points a year on the whole portfolio, over T-bills.*

---

## Correction (replay, Phase B)

*Found by the Phase B historical replay (`docs/phase-b/replay.md`, finding 3); details in `docs/phase-b/track23-fix.md`. Every number in this document now carries the fix.*

- **The bug.** `common23.py` picked the close-exit rules (C42, C63, …) with `rule.startswith("C")`, and "CAL90" starts with "C" too.
  - Every SPY CAL60/90/120 exit was therefore priced at the adjusted **close** of the exit session, with one more session of T-bills and interim marks. The labels above, the module docstring and design §3 W10 all say the **open**.
  - The same test counted every calendar-exact hold one session too long (`rules_calendar_spans.csv`).
  - A new `close_exit()` matches only C<H>. `run_all.py` was re-run.
- **Unaffected:**
  - the index samples, which enter and exit at the close by design;
  - every F<H> and C<H> cell, and the reconciliation with tracks 17–22;
  - sizing and stress, and the kill-switch power table;
  - the daily streams and every drawdown, which already sold W10 at the open;
  - M4.

| SPY 1993–2026, CAL90 | Published | Corrected |
|---|---|---|
| One at a time (17 trades): win rate | 88% | 88% |
| Mean / median | +7.19% / +7.66% | **+7.56% / +8.70%** |
| Worst trade | −8.3% | **−8.6%** |
| Edge vs era placebo (p_era) | +4.54 (0.020) | +4.91 (0.012) |
| Edge vs uptrend placebo (p_up) | +4.03 (0.005) | +4.41 (0.002) |
| All 20 events: mean vs placebo | +6.86% vs +2.67% | +7.26% vs +2.67% |
| All 20 events: p_era / p_up / cluster-preserving p | 0.019 / 0.005 / 0.008 | 0.011 / 0.002 / 0.001 |
| Deflated-Sharpe probability at N 24 / 120 | 0.62 / 0.42 | 0.64 / 0.45 |
| CAL90 minus F63, per trade | −0.05 (t −0.2) | +0.34 (t 1.0) |
| Sessions held at CAL60 / CAL90 / CAL120 | 38–45 / 59–64 / 79–86 | 37–44 / 58–63 / 78–85 |
| CAL60, all events: mean (p_era) | +3.81% (0.17) | +3.72% (0.19) |
| CAL120, one at a time: mean, worst (p_era) | +7.81%, −5.2% (0.086) | +8.06%, −3.4% (0.068) |
| W10 contribution at 90 days, central (range) | +0.042 (−0.008 to +0.101) | +0.042 (−0.008 to +0.107) |
| Phase A + M2 book at 60 / 90 / 120 days | 4.98 / 5.02 / 5.03% | unchanged |

**Decision 12 still holds.**
- The fix makes W10 at 90 days slightly stronger.
- The planning central does not move: it rests on the 1928–2026 index edge.
- 120 days still adds nothing over 90: +0.046 vs +0.042 central, and the SPY-based figures favour 90 by more than before.
- W10 at 60 days is slightly weaker (p 0.41 one at a time), so its shadow status stands.

---

## TL;DR

1. **Verdict: loosen to 90 days only as a module-level exception for W10 (and, in Phase B, M4 at 90 DTE).** Do not loosen the global cap, and do not go to 120 days. The exception is worth doing because it is cheap and positive in every convention but one. The gain is small: **about half of what tracks 21 and 22 reported.**
   - **Phase A** (M1, M2, M3 plus W10): **+0.04 points a year** (range −0.01 to +0.11), about $40 a year per $100k.
   - **Phase B** adds M4 at 90 DTE: +0.05 to +0.08 more. The total is **≈ +0.1 points, not +0.18.**
   - **120 days** is worth nothing over 90. W10 fires less often, M4 is no better, and the 2000–02 drawdown is deeper.
   - A **global cap** adds only beta. No other module gains (tracks 21 and 22, confirmed).
2. **W10 replicates exactly.** The 60 signal dates are the same, the per-event returns match track 21 to four decimals, and track 17's p = 0.005 headline reproduces (0.0054).
   - SPY, 1993–2026, calendar-exact 90 days: **+7.3% per trade vs +2.7% for random entries in the same years**. 90% of trades won; p_era 0.011, p_up 0.002.
   - With one position at a time (17 trades) the result holds: p_era 0.012.
   - At 60 days: +3.7% vs +1.8%, p 0.19. **The cap is the whole story.**
3. **The effect belongs to the post-1990 era, and even there it is not proven.**
   - 1928–89 (next close): +1.8 points per trade over the placebo, p 0.44. Measured per independent episode it is −1.0 point.
   - 2008–26 alone: +3.2 points, p 0.21 (10 trades).
   - Deflated-Sharpe probability: 0.64 at N = 24 cells and 0.45 at N ≈ 120 W10 cells. It is robust to the −3% threshold (−2.5% to −3.5%), which argues against a fluke of that one number.
4. **Rule corrections the design needs** (track 21's recommendation got these wrong or left them open):
   - **Exit.** Use the calendar-exact exit only. "63 sessions" sold at the next open (the only exit order Robinhood offers) runs past 90 calendar days 75% of the time, and in 18 of 20 W10 events (up to 95 days). Returns are no worse: +0.34 points per trade (t 1.0).
   - **Size.** Use **6% of NAV, not 6.7%**. At 6.7%, the S&P's −32.5% worst 10-session loss gives a stress of 2.18%, above the 2% cap. It would force W10 to be cut in 10 of 17 trades, with 4 extra trim orders. At 6%, M1 and W10 fit the 4% reserve exactly, and W10 was never cut in Phase A.
   - **Drop the VIX > 45 void.** It never fired at entry (the highest VIX was 40.8). Read as an exit, it would have sold 1998, 2010 and 2020 near the lows: −1.1 points per trade.
   - **Drop the all-time-high exit.** It is neutral (−0.1 points).
   - **Fix §4.** "Cluster ≤6%" contradicts M2's 3% plus the 4% reserve (7%). Under a literal 6% cap, W10 would be cut to about 54% in 10 of 17 trades.
   - **Replace the kill switch.** "5 losers in a row" fires in <1% of 20-year paths even with no edge. "1990+ p > 0.10" fires in 27–29% of 10-year paths whether the edge is gone or as in 1928–2026. No rule can test an edge that trades 0.5 times a year.
5. **Errors in track 21's arithmetic.**
   - **W10.** Its +0.10 combines three things: 6.7% sizing; κ 0.5 on the post-1990 edge (n = 18; track 17's R9 rule gives κ 0.25 below n = 20); and a "design convention" that keeps all of history's drift. Corrected: **+0.04 (−0.01 to +0.11)**.
   - **M4.** Its +0.13 at 90 DTE uses κ 0.5 on 12 crisis episodes. At κ 0.25 it is **+0.04**.
   - **Portfolio history.** Its 90- and 120-DTE O2 streams used a 60-day cool-down, so up to two spreads (4% premium) were open at once. That contradicts its own one-spread rule and inflates its historical "90-day" book.
   - Track 22's figures are close to this track's: +0.06 for W10.
6. **Risk added by W10 at 90 days.**
   - Average extra SPY exposure is 0.7% of NAV.
   - Drawdowns inside crash windows get up to 1.7 points deeper. In 2020: Lean −1.0% → −2.7%; with M2 −7.3% → −8.9%.
   - The full-period maximum drawdown with M2 goes from −11.3% to −11.9%.
   - Worst trade since 1993: −8.6% (−0.5% of NAV). Since 1928: −27% (August 1929, −1.6% of NAV).
7. **For the owner, in one paragraph.**
   - Loosening from 60 to 90 days is worth doing only for the crash-day buy (W10), and only just. It adds about **+0.04 points a year now** (range −0.01 to +0.11), and about +0.1 once the crash call spread (M4) moves to 90 days in Phase B.
   - The book being built (M1, M2, M3, plus W10) should earn about **4.98% a year at 60 days, 5.02% at 90 and 5.03% at 120**, before tax: T-bills at 4.2% plus about 0.8 points. With Phase B it is **≈5.0–5.2% under every cap**. Without M2 it is ≈4.4–4.6%.
   - **SPY returned 10.3% a year over 1928–2026, 10.8% over 1993–2026 and 11.3% over 2008–2026** (total return, compounded). About **3–6% a year** is a fair forward range at CAPE ≈41.
   - So under any cap the system trails SPY's history by 5–6 points a year. It sits inside SPY's forward range, with a historical worst drawdown near 12% instead of 52–55%. In its own 2008–26 backtest it earned 5.3% (60 days) or 5.5% (90 days), against SPY's 11.3%.
   - The cap decision moves the answer by a tenth of a point. The decision that matters is still a long-horizon core outside this system.

---

## 0. What was checked, and how

| Item | This track |
|---|---|
| Signal | First ^GSPC close ≤ −3.00%. The prior close must be above its 200-day SMA (computed through the prior close), with no other ≤ −3.00% close in the prior 20 sessions |
| Entry | SPY at the next open, total-return adjusted (open × AdjClose/Close). 1 bp a side, 2 bp when VIX > 30 on the signal day |
| Exits | F42/F63/F84 (sell at the open after H sessions); CAL60/90/120 (calendar-exact). The C-variants (close exit) are used only to reconcile |
| Samples | SPY 1993–2026 (and its 2008–26 block). S&P total return 1990–2026 and 1928–1989, entered at the **next close** (no usable opens before ~1990). Pooled 1928–2026 |
| Data | ^GSPC and ^SP500TR (1988 on); before 1988, price plus Shiller D/P accrued by calendar day. Yahoo SPY and ^VIX; FRED VXO (1986–89). Ken French 1-month bills (FRED DTB3 for September 2026). Coin Metrics BTC. Track 15's cached ETF8 prices |
| Placebos | Era-matched (±756 sessions, inside the sample); uptrend-only; uptrend + era; a cluster-preserving common shift (all events move by the same offset). The one-position-at-a-time list is re-tested separately |
| Checks | Episode clustering; sub-periods; −3% threshold sensitivity; first-night and day-1 timing; deflated Sharpe at several N; per-event match with track 21 |

**Look-ahead: none found in either track's signal.** The 200-day test uses the prior close. In the SPY era both tracks measure total return from SPY's dividend-adjusted next open; before 1993 both use the S&P total return from the next close. Tracks 17 and 19 used the crash-day close and price only, which is disclosed.

---

## 1. W10 replicated

### 1.1 Events and reconciliation

- **Same events.** There are 39 events in 1928–1989 and 21 in 1990–2026 (20 in the SPY era), on the same dates as track 21 (`w10_events_all.csv`).
- **Per-event SPY returns** (next open → close of session 42, 63 or 84, gross) match track 21's `w10_events_1990.csv` to four decimals for all 21 events (`w10_vs_track21_events.csv`).

| Claim (track) | Theirs | This track, same convention | Verdict |
|---|---|---|---|
| Price from the crash-day close, 60 sessions, 1990–2026 (17, 19) | +6.9%, p 0.005–0.006 | +6.89%, p_era 0.0054 | ✓ |
| Same at 42 sessions (19) | +3.52%, p 0.175 | +3.52%, p 0.16 | ✓ |
| SPY next open → close of session 63 (21) | +6.93% vs +2.72%, p_era 0.017, p_up 0.003 | +6.94% vs +2.71%, p 0.018 / 0.005 | ✓ |
| Same, 42 / 84 sessions (21) | p 0.131 / 0.007 | p 0.18 / 0.009 | ✓ (their n includes one 1991 next-close event) |
| 1928–89, S&P TR next close, 63 sessions (21) | +3.66%, edge +1.0, p 0.66 | +3.68%, edge +1.5, p 0.54 | ✓ (both insignificant; their placebo pool runs outside the sample) |
| SPY next open → close of session 60, one at a time, 1993–2026 (22) | n 17, +7.50%, p 0.009 | n 17, +7.50%, p 0.011 | ✓ |
| S&P TR next close, 60 sessions, one at a time, 1990–2026 / 1928–89 (22) | p 0.035 / 0.46 | p 0.033 / 0.39 | ✓ |
| Calendar-exact exit returns the same as the session count (21) | yes | yes (+0.34 points at 90 days, t 1.0) | ✓ |
| Share of 63-session holds over 90 days (22) | 34% | 32% with a close exit; **75% with the executable open exit** | ✗ understated |

### 1.2 SPY 1993–2026: every event (n = 20) and one position at a time

**All 20 events** (SPY from the next open, total return, net of costs):

| Exit | Longest hold | Mean | Median | Win | Worst | Worst interim | t | Edge vs era placebo (p_era) | Edge vs uptrend placebo (p_up) | Cluster-preserving p |
|---|---|---|---|---|---|---|---|---|---|---|
| F42 | 63 days | +4.04% | +5.45% | 75% | −12.9% | −30.8% | 2.4 | +2.25 (0.13) | +1.92 (0.08) | 0.15 |
| **CAL60** | 60 days | +3.72% | +5.12% | 75% | −12.9% | −30.8% | 2.1 | **+1.94 (0.19)** | +1.63 (0.13) | 0.22 |
| F63 | 95 days | +6.92% | +6.84% | 85% | −6.8% | −30.8% | 4.6 | +4.20 (0.019) | +3.72 (0.006) | 0.007 |
| **CAL90** | 90 days | **+7.26%** | +8.33% | **90%** | −8.6% | −30.8% | 4.7 | **+4.59 (0.011)** | **+4.11 (0.002)** | 0.001 |
| F84 | 125 days | +8.85% | +8.48% | 80% | −3.4% | −30.8% | 5.1 | +5.21 (0.011) | +4.52 (0.002) | 0.008 |
| **CAL120** | 120 days | +8.58% | +8.61% | 85% | −3.4% | −30.8% | 5.2 | **+5.01 (0.015)** | +4.30 (0.005) | 0.012 |

**One position at a time** (the trades a live module would have taken):

| Exit | Trades (a year) | Mean | Median | Win | Worst | t | Edge (p_era) | Edge vs uptrend (p_up) | Skipped because W10 was open |
|---|---|---|---|---|---|---|---|---|---|
| CAL60 | 17 (0.51) | +3.04% | +3.80% | 71% | −12.9% | 1.6 | +1.30 (0.41) | +0.95 (0.41) | 2000-02-18, 2018-12-04, 2020-10-28 |
| **CAL90** | **17 (0.51)** | **+7.56%** | +8.70% | **88%** | **−8.6%** | 4.1 | **+4.91 (0.012)** | **+4.41 (0.002)** | 2000-02-18, 2018-12-04, 2020-09-03 |
| CAL120 | 14 (0.42) | +8.06% | +7.50% | 86% | −3.4% | 3.8 | +4.28 (0.068) | +3.76 (0.033) | six events |
| F63 | 16 (0.48) | +7.71% | +7.76% | 88% | −6.8% | 4.3 | +4.91 (0.013) | +4.51 (0.003) | four events |

- The worst interim drawdown is February–March 2020 in every version: −30.8% on the position, or −1.8% of NAV at 6%.
- **The cluster-preserving placebo gives a p no larger than independent draws** (0.001 vs 0.011 at CAL90). Overlapping events do not inflate W10's significance. The honest sample size is still 17 trades in 13 independent episodes (§1.4), not 21.

### 1.3 The index samples: 1990–2026 and the out-of-sample check 1928–1989

S&P 500 total return, entered at the next close. Each cell shows all events, then one at a time in brackets.

| Sample | Exit | Events (trades) | Mean | Win | Worst | Worst interim | Edge vs era (p_era) | Edge vs uptrend (p_up) |
|---|---|---|---|---|---|---|---|---|
| 1990–2026 | CAL60 | 21 (18) | +3.39% (+2.80%) | 71% | −9.0% | −28.4% | +1.61 (0.26) / +1.05 (0.49) | +1.38 (0.18) / +0.77 (0.49) |
| 1990–2026 | **CAL90** | 21 (18) | **+6.23% (+6.46%)** | 86% | −5.0% | −28.4% | **+3.54 (0.039) / +3.80 (0.041)** | +3.19 (0.013) / +3.42 (0.014) |
| 1990–2026 | CAL120 | 21 (15) | +7.67% (+7.08%) | 90% | −1.8% | −28.4% | +4.05 (0.036) / +3.28 (0.14) | +3.50 (0.016) / +2.94 (0.084) |
| **1928–1989** | CAL60 | 39 (33) | +1.99% (+2.23%) | 62% | −23.9% | −38.1% | +0.64 (0.74) / +0.69 (0.72) | −0.15 (0.88) / +0.08 (0.95) |
| **1928–1989** | **CAL90** | 39 (29) | **+3.85% (+4.59%)** | 62% | **−27.1%** | −38.1% | **+1.81 (0.44) / +2.15 (0.39)** | +0.70 (0.59) / +1.46 (0.33) |
| **1928–1989** | CAL120 | 39 (27) | +5.47% (+6.60%) | 64% | −22.0% | −39.1% | +2.80 (0.28) / +3.43 (0.24) | +1.25 (0.42) / +2.36 (0.20) |
| 1928–2026 | CAL90 | 60 (47) | +4.68% (+5.30%) | 70% | −27.1% | −38.1% | +2.41 (0.14) / +2.79 (0.097) | +1.59 (0.088) / +2.20 (0.038) |
| 1928–2026 | CAL120 | 60 (42) | +6.24% (+6.77%) | 73% | −22.0% | −39.1% | +3.27 (0.073) / +3.39 (0.098) | +2.04 (0.064) / +2.59 (0.051) |

- **The pre-1990 check fails at every length.**
  - Against uptrend days, the 1928–89 edge is under a point at 90 days (+0.70, p 0.59).
  - The two worst trades are both in 1929: 9 Aug (−27.1%) and 3 Oct (−25.3%, with an interim −38.1%).
- The fixed-session versions (F42/F63/F84) are in `w10_stats.csv`. They look the same, except that 63 sessions from the next close runs to 103 days.

### 1.4 Clustering, sub-periods and threshold robustness

**Independent episodes** (a new episode starts when a trade comes more than 180 days after the previous one). CAL90, one at a time:

| Sample | Trades | Episodes | Edge per trade (t) | **Edge per episode (t)** |
|---|---|---|---|---|
| SPY 1993–2026 | 17 | 13 | +4.9 (2.5) | **+4.9 (2.5)** |
| Index 1990–2026 | 18 | 14 | +3.8 (2.4) | +3.8 (2.1) |
| Index 1928–1989 | 29 | 18 | +2.2 (1.0) | **−1.0 (−0.5)** |
| Index 1928–2026 | 47 | 32 | +2.8 (1.9) | +1.1 (0.7) |

Before 1990 the positive per-trade edge comes from the long 1935–36 cluster, where one episode holds five trades. Counted per episode, it disappears.

**Sub-periods** (CAL90, one at a time):

| Period | Trades | Mean | Win | Worst | Edge vs era pool (t) |
|---|---|---|---|---|---|
| SPY 1993–2007 | 7 | +9.6% | 100% | +3.7% | +7.2 (3.5) |
| SPY 2008–2026 | 10 | +6.1% | 80% | −8.6% | +3.3 (1.1) |
| Index 1928–1949 | 21 | +4.9% | 71% | −27.1% | +3.1 (1.1) |
| Index 1950–1989 | 8 | +3.8% | 50% | −2.0% | −0.3 (−0.1) |
| Index 1990–2007 | 8 | +7.1% | 100% | +3.1% | +4.6 (2.8) |
| Index 2008–2026 | 10 | +6.0% | 70% | −5.0% | +3.1 (1.2) |

**Threshold** (a diagnostic, not a selection step; CAL90, one at a time):

| Crash threshold | SPY 1993–2026: trades, edge (p_era) | Index 1928–2026: trades, edge (p_era) |
|---|---|---|
| −2.50% | 30, +3.6 (0.011) | 68, +1.9 (0.12) |
| −2.75% | 21, +4.2 (0.021) | 55, +1.5 (0.33) |
| **−3.00%** | **17, +4.9 (0.010)** | **47, +2.8 (0.099)** |
| −3.25% | 14, +4.3 (0.041) | 40, +3.1 (0.10) |
| −3.50% | 12, +6.6 (0.005) | 36, +3.5 (0.10) |

- The −3% threshold is not a knife-edge. The effect sits in a neighbourhood of thresholds.
- **But a few events do sit within basis points of the line.** On 5 Aug 2024 the S&P closed −2.997% in an uptrend (0.3 bp short, and SPY then rose ≈10% over 90 days). 23 Jul 1946 cleared by 1.2 bp. Rounding the day's change to −3.00% would have created a 2024 signal, so the rule must use unrounded closes (§4.2).

### 1.5 Entry timing, price vs total return

- **Next-open entry costs nothing after 1990.** SPY's first night after the crash averaged −0.11%, and the first day's session +0.62%.
- **Before 1990, the next-close entry understates what a next-open buyer would get.** Day 1 averaged +1.11% (close to close) in 1928–89, against +0.47% after 1990.
  - The executable pre-1990 edge therefore lies between the next-close figure (+1.8 points at 90 days) and the signal-close price figure (about +3.0 points at 63 sessions).
  - Neither is significant (p 0.20–0.44).
  - Track 21 calls the next-close series the "tradable proxy". It is a lower bound.
- **Total return vs price.** Dividends add about 0.5 points per 90-day trade since 1993 (about 1.1 before 1990) but cancel against the placebo, so edges are unaffected. Tracks 21 and 22 use total return. Tracks 17 and 19 used price from the signal close, which is disclosed and harmless.

### 1.6 The trade list (SPY, CAL90, one position at a time)

| Signal | Entry | Exit | Days | VIX | Net | Interim low | Edge vs era pool |
|---|---|---|---|---|---|---|---|
| 1996-03-08 | 03-11 | 06-07 | 88 | 20.7 | +5.1% | −0.1% | −0.1 |
| 1997-10-27 | 10-28 | 1998-01-26 | 90 | 31.1 | +14.6% | 0.0% | +9.6 |
| 1998-08-04 | 08-05 | 11-03 | 90 | 31.1 | +3.7% | −11.1% | +0.4 |
| 2000-01-04 | 01-05 | 04-04 | 90 | 27.0 | +8.7% | −4.7% | +7.6 |
| 2000-04-14 | 04-17 | 07-14 | 88 | 33.5 | +11.5% | 0.0% | +10.3 |
| 2003-03-24 | 03-25 | 06-23 | 90 | 30.4 | +15.0% | −2.3% | +14.9 |
| 2007-02-27 | 02-28 | 05-29 | 90 | 18.3 | +8.6% | −2.2% | +7.6 |
| 2009-06-22 | 06-23 | 09-21 | 90 | 31.2 | +18.9% | −1.7% | +17.5 |
| 2010-02-04 | 02-05 | 05-06 | 90 | 26.1 | +9.5% | −0.6% | +8.2 |
| 2010-05-06 | 05-07 | 08-05 | 90 | 32.8 | +0.1% | −8.8% | −1.3 |
| 2011-11-09 | 11-10 | 2012-02-08 | 90 | 36.2 | +8.7% | −6.8% | +4.4 |
| 2016-06-24 | 06-27 | 09-23 | 88 | 25.8 | +8.0% | −1.0% | +5.1 |
| 2018-02-05 | 02-06 | 05-07 | 90 | 37.3 | +3.0% | −0.9% | −0.4 |
| 2018-10-10 | 10-11 | 2019-01-09 | 90 | 23.0 | **−6.5%** | −14.9% | −10.6 |
| 2020-02-24 | 02-25 | 05-22 | 87 | 25.0 | **−8.6%** | **−30.8%** | −11.5 |
| 2020-06-11 | 06-12 | 09-10 | 90 | 40.8 | +11.3% | −2.2% | +8.1 |
| 2020-10-28 | 10-29 | 2021-01-27 | 90 | 40.3 | +16.8% | −0.1% | +13.7 |

- Holds are 60–63 sessions.
- There has been no signal since 2020: 2022 and April 2025 were below the 200-day average.
- The 1928–2026 index list (47 trades) is in `w10_trades_one_at_a_time.csv`.

### 1.7 Discrepancies and errors in tracks 21 and 22

| # | Where | Finding | Consequence |
|---|---|---|---|
| E1 | T21 §1, §8.3 (T22 §7.2 partly) | T21's return tables sell at the **close** of session 63, but Robinhood has no market-on-close order (§3a). T21's rule text, "hold 63 sessions (or to the open of the last session within 90 days)", leaves the session count as an option. With the executable open exit, 63 sessions run to 88–97 days: 75% of all start days, and 18 of 20 W10 events, break the 90-day cap. T22 flagged 34%, but on the close-exit convention | The rule must be calendar-exact only. Returns are no worse (+0.34 points, t 1.0) |
| E2 | T21 §1.5, §6; design §3 M5 | W10 is sized at **6.7%** of NAV. Under §4's own stress rule (S&P worst 10-session loss −32.5%) that is 2.18% stress, above the 2% per-trade cap. The 6.7% came from track 17's "−30% path" | 6.0% (1.95% stress). At 6.7% the 4% reserve forces 10 of 17 trades to be cut to ≈94%, with 4 extra trim orders, for no gain |
| E3 | T21 §1.5, `summary21.py` | The W10 contribution uses κ 0.5 on the **post-1990** edge (n = 18). Track 17's R9, and track 22, use κ 0.25 below n = 20, or κ 0.5 on the full-history edge. Its "design convention" is era placebo + κ·edge, which keeps the full 1990–2026 drift (≈11% a year); it is not κ × the historical mean as its §0 states. Bills at 4.2% are then subtracted from historical returns | +0.10 → **+0.04** (range −0.01 to +0.11) at 6%. Details in §3.1 |
| E4 | T21 §2.4 | M4 uses κ 0.5 on 26 trades in **12 episodes**, with an edge over a random-day spread of p 0.21 | At κ 0.25: +0.13 → +0.04 at 90 DTE, and the 60 → 90 gain is +0.08 → +0.05 (§3.2) |
| E5 | T21 `portfolio_duration.py` | The 90- and 120-DTE O2 streams use a **60-day cool-down**, so two spreads (4% premium) can be open at once. That contradicts T21's own one-spread rule (the 3% factor budget) | T21's historical "Lean 90 days +2.37% vs +1.45%" gap is mostly O2 (+0.91% vs +0.19% a year), run at 0.80 spreads a year with up to 4% premium open, against 0.60 under its own rule. Its 60-vs-90 path comparison is not like-for-like |
| E6 | T21 §8.3 | "Kill switch: 5 consecutive losers, or 1990+ p_era > 0.10 with new data" | Neither can tell an edge from no edge (§2.5) |
| E7 | T21 §8.3; design §4 | "Keep the VIX > 45 void." Read as an exit, it is harmful. The design text ("Void if VIX > 45") does not say which reading it means | Drop it (§2.2) |
| E8 | Design §4 | "Cluster ≤6%" vs "M2 ≤3% + 4% reserved for M1, W10, M4" = 7% | Under a literal 6%, W10 is cut to ≈54% in 10 of 17 trades. State 7% |
| E9 | T21 §1.2 | "Edge positive but small before 1990" | Per episode it is −1.0 point (t −0.5). The failure is starker than stated |
| E10 | T21 §1.2 | Its pre-1990 placebo pool runs into the neighbouring era, and its "tradable proxy" (next close) is a lower bound (§1.5) | Minor. Both directions leave 1928–89 insignificant |

**No errors of look-ahead, data alignment or event selection were found.**

---

## 2. Rule details for a live W10 under a 90-day cap

### 2.1 Calendar-exact exit vs a fixed session count

Figures are calendar spans for every SPY start day, 1993–2026 (`rules_calendar_spans.csv`).

| Exit rule | Median days | Longest | Over 60 / 90 / 120 days | Sessions held |
|---|---|---|---|---|
| 42 sessions, sell at the next open | 61 | 67 | **67%** / 0 / 0 | 42 |
| 42 sessions, sell at the close (T21/T22; not placeable) | 60 | 66 | 27% | 42 |
| **63 sessions, sell at the next open** | 91 | 97 | – / **75%** / 0 | 63 |
| 63 sessions, sell at the close | 90 | 96 | – / 32% / 0 | 63 |
| 84 sessions, sell at the next open | 121 | 130 | – / – / **69%** | 84 |
| **CAL60 / CAL90 / CAL120** | 60 / 90 / 120 | 60 / 90 / 120 | **0** | 37–44 / 58–63 / 78–85 |

- **The largest fixed count that always fits, with an open exit, is 37 sessions for 60 days, 58 for 90 and 78 for 120.** Track 22's 38/59/79 assume a close exit.
- **Paired difference, CAL90 minus F63, per trade:**
  - SPY: +0.34 points (t 1.0); better in 11 of the 20 events, worse in 7.
  - Index 1990–2026: −0.13.
  - 1928–89: +0.19.
- **Adopt the calendar-exact rule.** It costs nothing and is the only version that honours the cap.

### 2.2 The VIX > 45 void and the new-all-time-high exit

Figures are paired against the plain exit, per trade (`rules_vix_void_and_ath_exit.csv`).

| Variant | Sample | Trades changed | Mean: plain → variant | Difference (t) |
|---|---|---|---|---|
| Skip entry if VIX > 45 at the signal | 1990–2026 | 0 (highest VIX 40.8, June 2020); VXO 1986–89 highest 28.2 | – | 0 |
| Skip entry if VIX > 45 | 1928–85 | 3 of 36 by a realised-volatility proxy (not VIX) | – | not testable |
| **Exit if VIX closes > 45 during the hold**, CAL90 | SPY 1993–2026 | 3 (1998, 2010, 2020) | +7.26% → +6.14% | **−1.12 (−1.6)**: sells at the panic lows (1998 +3.7% → −9.1%; 2010 +0.1% → −6.0%; 2020 −8.6% → −12.2%) |
| Exit if VIX > 45, CAL120 | SPY 1993–2026 | 4 | +8.58% → +6.89% | −1.70 (−1.7) |
| **New-all-time-high exit**, CAL90 | SPY 1993–2026 | 8 | +7.26% → +7.13% | −0.13 (−0.3) |
| New-ATH exit, CAL90 | Index 1990–2026 / 1928–89 | 9 / 9 | +6.23% → +6.28% / +3.85% → +4.32% | +0.05 / +0.47 (+0.5) |
| New-ATH exit, CAL120 | SPY 1993–2026 | 10 | +8.58% → +8.14% | −0.44 (−0.7) |

- **Drop both.**
  - As an entry filter, the VIX void has never fired. As an exit it hurts.
  - The all-time-high exit is noise in every sample. It was meant to hand the position to a long-horizon core the system does not have. Keeping it adds an extra monitored condition and extra emails.

### 2.3 Size and stress

`rules_sizing.csv`:

| Stress definition | Loss used | Notional for 2% stress | Stress at 6% | Stress at 6.7% |
|---|---|---|---|---|
| **10-session worst loss, S&P 1928–2026 (design §4)** | −32.5% | **6.16%** | **1.95%** | 2.18% ✗ |
| 10-session worst loss, SPY only | −26.8% | 7.47% | 1.61% | 1.79% |
| **Horizon-matched: worst 63 sessions / worst 90-day window, S&P** | −48.1% | 4.16% | 2.88% | 3.22% |
| Worst 90-day window, SPY 1993–2026 | −39.5% | 5.06% | 2.37% | 2.65% |
| Worst W10 interim drawdown, 1928–2026 (Oct 1929) | −38.1% | 5.25% | 2.29% | 2.55% |
| Worst W10 trade at 90 days, 1928–2026 (Aug 1929) | −27.1% | 7.39% | 1.62% | 1.81% |

- **Recommendation: 6% of NAV × G(D), stress booked under §4's 10-session rule (1.95%).** The horizon-matched stress (2.9%) goes in the ledger and the email's stress line as the planning worst case.
- Sizing on the horizon-matched loss (4.2%) would be the purist choice. It cuts every contribution below by 31% (to ≈+0.03 at 90 days), and M1 and W10 would no longer be sized the same way.
- **6.7% should not be used.** It breaches the 2% per-trade cap, and it is what forces cuts inside the cluster (§2.4).
- **G(D) matters in practice with M2.** The book's drawdown from M2 was above 5% at 5 of 17 W10 entries: June 2009 (G 0.71), February 2010 (0.89), May 2010 (0.99), February 2018 (0.99) and October 2018 (0.89).

### 2.4 Overlap with M1, and the US-equity cluster cap

**Set-up.** Day by day, 1993–2026, M1 is simulated exactly as ST-1 (125 trades, identical to track 13's list), and W10 at CAL90 one at a time.
- **Phase A:** M2 counts 4.5% of total stress from mid-2007, and M3 counts 3% × BTC's −52% worst 10-day loss (1.57%) when it is on.
- **Phase B** adds M4 windows (O2 signals, 90 DTE, one spread; 2% premium).
- **The reserve:** 4% of stress for M1 + W10 + M4, and a 10% total-open cap.
- **Priority:** M1 is admitted first and never blocked; if its entry would breach the reserve, the open W10 is cut.

Results are in `rules_cluster_summary.csv`:

| Case | W10 trades | Cut at entry | Cut later (extra orders) | Average W10 exposure | W10 P&L kept | M4 signals cut |
|---|---|---|---|---|---|---|
| **Phase A, 6%** (with or without M2) | 17 | **0** | **0** | 100% | 100% | – |
| Phase A, 6.7% | 17 | 10 (to 0.94) | 4 (4) | 96% | 97% | – |
| Phase A, 6%, **literal 6% cluster cap** (3% left beside M2) | 17 | 10 (to 0.54) | 4 | 70% | 74% | – |
| **Phase B, 6%, first come first served** | 17 | 1 (June 2009, to ≈0) | 0 | 94% | 86% | 0 of 20 |
| Phase B, 6%, M4 before W10 | 17 | 1 | 0 | 94% | 86% | 0 |
| Phase B, 6%, W10 and M4 share one slot | 17 | 2 (2003, 2009) | 0 | 88% | 74% | **5 of 20** skipped (1998, 2010, 2011, 2018, 2020) |
| Phase B, 6.7%, first come first served | 17 | 11 | 3 | 90% | 82–83% | 4–5 |

- **M1 was open at 10 of the 17 W10 entries**, and 9 of 20 SPY-era W10 events had an M1 signal on days 0–3. The two modules fire together, but at 6% each they fit: 3.90% of stress against the 4% reserve.
- **In Phase A the reserve never binds.** Total stress with M2 and M3 on is 4.5 + 1.57 + 1.95 + 1.95 = 9.97%, just inside the 10% total cap.
- **In Phase B it bound once in 33 years** (23 June 2009: M1 and the M4 spread bought on 16 June 2009 were open). W10 was skipped, and that was its best trade (+18.9%), which is why the "P&L kept" share is 86%. "One crash slot" is clearly worse.
- M4 signals arrive in deep drawdowns, when M1's 200-day condition is off, so M1 + W10 + M4 together is rare.

### 2.5 Kill switch

**Detection power.** `rules_kill_switch_power.csv` gives the chance each rule fires, from 5,000 simulated paths at 0.5 trades a year.

| Rule | Edge gone, 10 / 20 years | Edge as 1928–2026, 10 / 20 years | Edge as 1990–2026, 10 / 20 years |
|---|---|---|---|
| K1: 5 losers in a row (track 17 and T21) | 0.2% / 0.6% | 0.3% / 0.9% | 0.0% / 0.1% |
| K2: 3 losers in a row | 5% / 12% | 6% / 13% | 1% / 3% |
| K3: cumulative W10 P&L ≤ −1.5% of NAV | 2% / 4% | 5% / 6% | 0% / 0% |
| K4: 1990+ edge p > 0.10 once new trades are added (T21) | 29% / 50% | 27% / 40% | 6% / 8% |
| K5: any single trade ≤ −15% | 10% / 18% | 11% / 20% | 0% / 0% |

"Edge gone" means random uptrend days.

- **Historically:**
  - The longest losing streak is 2 on SPY and 3 on the index 1990–2026 (Feb 2018, Oct 2018, Feb 2020). On the index version, K2 would have killed W10 in May 2020, just before two winners of +10% and +14%.
  - One pre-1990 trade was worse than −15% (1929).
  - The worst cumulative W10 drawdown at 6% was −0.9% of NAV since 1993, and −1.6% since 1928 (`rules_kill_switch_history.csv`).
- **Conclusion.** No rule separates "edge gone" from "edge as in 1928–2026" within 20 years, because W10's return is mostly market beta plus a small timing premium. The kill switch can only cap damage.
- **Recommended:**
  - K5 (one trade ≤ −15%, twice the worst trade since 1993), or
  - K3 (cumulative W10 P&L ≤ −1.5% of NAV since go-live)
  - sends W10 to shadow.
  - Otherwise W10 is re-decided only at the annual review, on the shadow record of every uptrend −3% day at 60 and 90 days.
  - Drop K1 (it cannot fire), K2 (it would have fired at the worst moment) and K4 (a coin flip).

---

## 3. Portfolio impact at 60, 90 and 120 days

### 3.1 W10's expected contribution

The figures are % of NAV a year over T-bills, at 6% of NAV and one position at a time. The forward drift is S&P total return of 3 / 4.5 / 6% at CAPE ≈41 against bills at 4.2%. The design convention is κ × the historical mean excess over the era's bills. The full grid is in `portfolio_w10_expectation_detail.csv`.

| Cap | Trades a year | Design convention (κ 0.5 × SPY 1993–2026 mean) | Forward, κ 0.5 × SPY 1993–2026 edge (T21's basis) | **Forward, κ 0.5 × 1928–2026 edge (central)** | Forward, κ 0.25 × 1990–2026 edge | Edge gone, 3% S&P (low) | Track 21 (at 6.7%) |
|---|---|---|---|---|---|---|---|
| 60 (if W10 were run) | 0.51 | +0.040 | +0.021 | **+0.014** | +0.009 | −0.006 | 0 (shadow) |
| **90** | 0.51 | **+0.107** | +0.077 | **+0.042** | +0.030 | **−0.008** | +0.10 (+0.03 to +0.13) |
| 120 | 0.42 | +0.091 | +0.056 | **+0.046** | +0.022 | −0.010 | +0.10 (+0.03 to +0.13) |

**Why this central.**
- The forward convention is the forward-looking one. At CAPE ≈41 the design convention keeps half of 1993–2026's ≈8-point equity premium over bills.
- κ 0.5 on the full-history edge (+2.8 points) and κ 0.25 on the post-1990 edge (+3.8 points) are the two shrinkage choices the dossier's own rules allow. They land within about 0.01 of each other (+0.042 and +0.030).
- On the per-episode edge (+1.1 points) the value would be ≈+0.02.
- Averaging the design and forward conventions, as track 21 did, gives +0.07 at 90 days.

**Other sizes:**
- At 6.7% every figure is ×1.12; for example the central at 90 days is +0.047.
- At the horizon-matched 4.2% every figure is ×0.69 (+0.029).

**Conclusion.** 90 vs 120 days is a wash, +0.042 vs +0.046, and the SPY-based and design figures favour 90. **The 60-day figure is why W10 stays in shadow at 60 days.**

### 3.2 M4 at 90 DTE (Phase B): sanity review of track 21

Track 21's contributions were recomputed from its own output file (`o2_forward_raw.csv`). At κ 0.5 they reproduce: +0.05 / +0.13 / +0.11 at 60 / 90 / 120 DTE (`portfolio_m4_from_track21.csv`).

| DTE | κ | Design convention | Forward, 4.5% S&P | Track 21's central (average) |
|---|---|---|---|---|
| 60 | 0.5 / 0.25 | +0.139 / +0.064 | −0.035 / −0.089 | **+0.052 / −0.013** |
| **90** | 0.5 / 0.25 | +0.207 / +0.097 | +0.057 / −0.017 | **+0.132 / +0.040** |
| 120 | 0.5 / 0.25 | +0.168 / +0.077 | +0.046 / −0.011 | +0.107 / +0.033 |

**What looks right.**
- The arithmetic, the next-day entry proxies, the frozen fill model, and the one-spread frequency (0.60 a year at 90 DTE) are all sound.
- **The 60 → 90 DTE gain holds in every convention: +0.03 to +0.09 (central +0.05 to +0.08).**

**What looks wrong or fragile:**
1. κ 0.5 on 12 independent episodes. Track 17's R9 says κ 0.25 for 10–19, and the edge over a plain random-day call spread is p 0.21.
2. The gain rests on the post-2008 V-shaped recoveries: 90-DTE spreads earned +0.07 of debit per trade in 1990–2007 and +0.58 in 2008–26.
3. The option prices come from a synthetic surface, with the 90–120-DTE smile extrapolated from 21–70 DTE and VIX6M proxied before 2008.
4. The historical portfolio stream allowed two overlapping spreads (E5).
5. At the forward convention and κ 0.25, M4 is slightly negative even at 90 DTE.

Planning figures: **+0.04 to +0.13 at 90 DTE (central +0.04 at κ 0.25), against −0.01 to +0.05 at 60 DTE.**

### 3.3 Whole-book expected return

The figures are central (low to high), points over bills. The nominal return is 4.2% plus the central. The cap-insensitive modules keep track 21's re-estimates: M1 +0.08, M3 +0.10, W8 +0.02, M2 +0.6. W10 is 0 at 60 days, where it stays in shadow. Source: `portfolio_book_expectation.csv`.

| Book | 60 days | 90 days | 120 days |
|---|---|---|---|
| **Phase A: M1 + M3 + W10** | +0.18 (−0.25 to +0.60) → **4.38%** | +0.22 (−0.26 to +0.71) → **4.42%** | +0.23 (−0.26 to +0.69) → 4.43% |
| **Phase A + M2** (what is being built) | +0.78 (−0.25 to +1.80) → **4.98%** | +0.82 (−0.26 to +1.91) → **5.02%** | +0.83 (−0.26 to +1.89) → 5.03% |
| Design Lean (M1, M3, M4, W8, W10), M4 at κ 0.25 | +0.19 → 4.39% | +0.28 → 4.48% | +0.28 → 4.48% |
| Design Lean + M2, M4 at κ 0.25 | +0.79 (−0.50 to +2.06) → 4.99% | +0.88 (−0.44 to +2.20) → **5.08%** | +0.88 → 5.08% |
| Design Lean + M2, M4 as track 21 | +0.85 (−0.49 to +2.14) → 5.05% | +0.97 (−0.43 to +2.32) → **5.17%** | +0.96 → 5.16% |
| *Track 21: Lean / Lean + M2* | *4.45% / 5.05%* | *4.63% / 5.23%* | *4.60% / 5.20%* |

**Value of the 90-day exception:**
- **Phase A: +0.04** (−0.01 to +0.11).
- **Phase B: +0.09 to +0.12** (W10 +0.04; M4 +0.05 to +0.08).
- Years to 11× at Lean + M2 barely move: about 48–49 years before tax under every cap.

### 3.4 Historical paths from simple daily streams

The streams are built as follows (`portfolio_history_paths.csv`, `portfolio_crisis_windows.csv`):
- **M1:** ST-1 at 6% × G(D).
- **W10:** 6% × G(D), calendar-exact.
- **M3:** BTC 10-week switch at 3%, from 2015, with spot BTC as the IBIT proxy.
- **M2:** long-only ETF8 at s = 0.5, rebuilt from track 15's cached prices. It gives Sharpe 0.52 and a −11.6% maximum drawdown for 2008–26 (track 15 had 0.45).
- Bills on the rest. The figures are unshrunk history.

| Book | 1993–2026: CAGR / max drawdown / worst year | 2008–2026: CAGR / max drawdown / worst year |
|---|---|---|
| Lean A at 60 days (M1 + M3; W10 in shadow) | 3.30% / −1.6% / −0.3% (2011) | 2.61% / −1.6% / −0.3% |
| + W10 at CAL60 (reference) | 3.39% / −2.7% / −0.3% | 2.68% / −2.7% / −0.3% |
| **Lean A at 90 days** | **3.53% / −2.7% / −0.5% (2018)** | **2.82% / −2.7% / −0.5%** |
| Lean A at 120 days | 3.50% / −2.7% / −0.3% | 2.79% / −2.7% / −0.3% |
| Lean A + M2 at 60 days | 5.19% / −11.3% / −5.0% (2018) | 5.30% / −11.3% / −5.0% |
| **Lean A + M2 at 90 days** | **5.40% / −11.9% / −5.4% (2018)** | **5.49% / −11.9% / −5.4%** |
| Lean A + M2 at 120 days | 5.37% / −11.8% / −5.2% | 5.46% / −11.8% / −5.2% |
| SPY | 10.83% / −55.2% / −36.8% (2008) | 11.25% / −51.9% / −36.8% |
| T-bills | 2.48% | 1.37% |

- **W10 at 6% earned +0.22 points a year unshrunk in 1993–2026**, with a −2.6% worst drawdown and a −0.4% worst year as a stand-alone stream.
- M2 exists only from 2007 and M3 from 2015, so the 1993–2026 rows are partly M1 and bills.

**Maximum drawdown inside crash windows:**

| Book | 2000–02 | 2008–09 | 2018 Q4 | 2020 | 2022 |
|---|---|---|---|---|---|
| Lean A, 60 days | −0.4% | −0.2% | −0.1% | −1.0% | −0.8% |
| Lean A, 90 days | −0.5% | −0.3% | −0.9% | **−2.7%** | −0.8% |
| Lean A, 120 days | −1.0% | −0.3% | −0.9% | −2.7% | −0.8% |
| Lean A + M2, 60 days | −0.4% | −11.0% | −6.8% | −7.3% | −3.6% |
| Lean A + M2, 90 days | −0.5% | −11.0% | −7.6% | **−8.9%** | −3.6% |
| SPY | −47.5% | −51.9% | −19.2% | −33.7% | −24.5% |

### 3.5 Trades a year

| Module | Trades a year | Note |
|---|---|---|
| M1 | 3.7 | 1993–2026 (the first signal came in 1996) |
| W10 | 0.51 (CAL60, CAL90), 0.42 (CAL120) | SPY 1993–2026, one at a time; none in 2021–26 |
| M3 | ≈4.0 round trips (8 switches) | 2015–2026, Sunday-close rule; the design says 5.3 |
| M2 | 12 decisions, ≈9 with an order | 25% no-trade band |
| M4 (Phase B) | 0.71 (60 DTE), 0.60 (90), 0.52 (120) | 1990–2026, one spread at a time |
| W8 (Phase B) | ≈0.4 | Design |

**The 90-day exception adds ≈0.5 round trips a year**: two emails in a year with a signal, and none in most years.

---

## 4. Verdict and the rule text to adopt

### 4.1 Verdict

| Question | Answer | Central (range) | Why |
|---|---|---|---|
| **Loosen to 90 days?** | **Yes, but only as a module-level exception for W10 now (and M4 at 90 DTE in Phase B)** | +0.04 (−0.01 to +0.11) in Phase A; +0.09 to +0.12 with M4 | Positive in every convention except "edge gone". Cheap: one SPY buy and one sell, ≈0.5 times a year. It fits the existing M1 template and the 4% reserve at 6% sizing |
| Worth anything at 120 over 90? | **No** | W10 +0.046 vs +0.042; M4 +0.03 vs +0.04 (κ 0.25) | Fewer W10 trades (0.42 vs 0.51 a year); edge per trade the same or lower; deeper 2000–02 drawdown; longer exposure in crashes |
| Global cap or module exception? | **Module exception** | Global adds ≈0 | M1's exit fires in ≈3 sessions; W8 is best at 20; M2 and M3 already continue; 260 new 3–4-month variants found nothing (track 22). A global cap only invites beta trades |
| Keep 60 days instead? | **Defensible** | Costs ≈0.04 points now, ≈0.1 with M4 | The evidence is post-1990 only and fails a strict multiple-testing bar |

**Risks and complexity it adds:**
1. **Evidence.** The edge is post-1990 only: zero per episode in 1928–89. Deflated-Sharpe probability is 0.45–0.64, and paper trading can never confirm it (≈5 trades a decade). Treat it as a policy bet that costs little, not as a proven edge.
2. **Market risk.**
   - It adds 0.7% of NAV average SPY exposure.
   - It deepens crash-window drawdowns by up to ≈1.7 points: 2020 −7.3% → −8.9% with M2, and the full-period maximum −11.3% → −11.9%.
   - The worst trade since 1993 cost 0.5% of NAV. A 1929 repeat would cost ≈1.6% of NAV, with −2.3% interim.
3. **Complexity.**
   - One more exit clock (calendar-exact).
   - In Phase B, a cluster priority rule (§4.2 D). It bound once in 33 years.
   - A damage-limit kill switch.
   - The paper broker must handle a hold longer than the 60-day invariant, with its validator exception.

### 4.2 Exact rule text

**A. W10 — uptrend crash day. Policy module under a 90-day exception.** This replaces §3 M5's W10 bullet, the §12.1 note and DECISIONS #5's "W10 stays in the shadow ledger".

- **Signal**, after the close, on two-source-checked, unrounded official closes. All three must hold:
  - the S&P 500 index (^GSPC) closes 3.00% or more below the prior close;
  - the prior close was above its 200-day simple average, computed through the prior close;
  - no other S&P close in the prior 20 sessions fell 3.00% or more.
  - If the two sources disagree on any condition, there is no signal; log it in the shadow ledger.
- **Entry.** SPY dollar market order in the Robinhood IRA, queued for the next 9:30 ET open (order kind (a)).
  - One W10 position at a time. A signal while W10 is open goes to the shadow ledger only.
- **Size.** Notional = 6% of NAV × G(D).
  - Stress = notional × the S&P's worst 10-session loss (−32.5%) ≈ 1.95% of NAV.
  - The ledger and the email also show the horizon-matched stress: 6% × 48% ≈ 2.9% of NAV.
  - Exempt from circuit breakers (as §4); not exempt from G(D).
- **Exit.** "Sell all" SPY market order, queued the evening before, for the open of the **last NYSE session dated on or before the entry date plus 90 calendar days**. That is 58–63 sessions in practice. No stop, no bracket, no profit target, no VIX void, no all-time-high exit.
- **Cluster.** As D below.
- **Expected.**
  - About 0.5 trades a year (0–3; none in most years).
  - 1993–2026: 88% winners, mean +7.6%, worst −8.6%, worst interim −31% (−1.8% of NAV).
  - 1928–2026: 72% winners, worst −27% (1929).
  - Planning contribution: **+0.04% of NAV a year (−0.01 to +0.11).**
- **Kill switch.** Back to the shadow ledger if one W10 trade loses 15% or more, or if W10's cumulative realized P&L since go-live reaches −1.5% of NAV. Otherwise W10 is re-decided only at the annual review, against the shadow record of every uptrend −3% day at 60 and 90 days. These are damage limits; no rule can test W10's edge at 0.5 trades a year.
- **Why a policy module.** Its forward Δg is ≈4–9 bp per trade, around the 6 bp hurdle, and its evidence is post-1990 only.

**B. Calendar-exact time stops** (new §4 row, "Time stops"):

> "A time stop of N calendar days means: sell at the open of the last NYSE session dated on or before the entry date plus N calendar days, with the market order queued the evening before. A session count may be used only where it always fits with an open exit: at most 37 sessions for 60 days, 58 for 90 days and 78 for 120 days."

| Module | Time stop as written | Longest calendar hold | Change |
|---|---|---|---|
| M1 | Open of session 21 (20 sessions) | 35 days | None; always inside 60 |
| M2, M3 | Continuing positions, re-decided monthly and weekly (DECISIONS #5, #11) | n/a | None |
| M4, Phase B at 60 DTE | XSP expiry on or before entry + 60 days; sell ≥1 trading day before expiry | ≤59 days | None |
| M4 under the 90-day exception | Same, with + 90 days; 90-day cool-down | ≤89 days | See C |
| W8 | 80% of maximum value or 20 trading days; options 56–75 DTE | 35 days | None |
| W9 (paper) | 20-day time stop | 35 days | None |
| **W10** | **Last session within 90 calendar days** (was "day 42 or 60") | 90 days | **Changed** (A) |
| M7 | Close at 21 DTE from a 40–50 DTE entry | ≤29 days | None |
| M6 (shadow) | CME contract ≤60 days to expiry | ≤60 days | None |
| Everything else | Every trade closes within 60 calendar days | 60 days | Unchanged: no global loosening |

**C. M4 note for Phase B:**

> "Under the 90-day exception, M4 buys the XSP at-the-money / 105% call spread on the listed expiry nearest to, but not beyond, the entry date plus 90 calendar days. It sells to close at least one trading day before that expiry, with a 90-day cool-down (one spread at a time, which keeps the 3% factor premium budget). Everything else is as §3 M4.
> Planning value: +0.04% of NAV a year at κ 0.25 (+0.13% at κ 0.5), against −0.01% / +0.05% at 60 DTE. This rests on 12 crisis episodes, mostly the post-2008 V-shaped recoveries (1990–2007: +0.07 of debit per trade), priced on a model surface.
> Before shipping, re-price it on real XSP quotes from the 10:17 ET snapshots and keep a 60-DTE paper twin."

**D. Cluster priority** (§4, "Clusters" and "Caps"):

> "US-equity cluster = M2's equity legs, at most 3% of NAV stress, plus a 4% reserve for M1, W10 and M4: **7% in all.** This replaces 'cluster ≤ 6%' for this cluster.
> Inside the 4% reserve, M1 is admitted first and is never blocked. W10 and M4 are first come, first served. A later signal takes the room that is left, and is skipped if that is under half its size (for M4, under one contract). If M1's admission would breach the reserve, the open W10 is cut at the same open.
> The 10% total-open cap still applies."

At 6% sizing this never bound in Phase A (1993–2026). In Phase B it bound once (June 2009), and no M4 signal was cut.

**E. DECISIONS.md #5, suggested wording** (for the owner to confirm; this file is not edited here):

> "Calendar days; a monthly re-decided trend position may continue; **W10 (and, in Phase B, M4) may hold to the last session within 90 calendar days**; everything else closes within 60."

---

## 5. Multiple-testing ledger

- **Cells run in this track: 188** (`variant_registry.csv`, `variant_counts.csv`):
  - 60 replication cells: 6 exits × 5 samples × 2 versions.
  - 9 calendar-vs-fixed comparisons.
  - 20 exit variants (VIX void, all-time-high exit).
  - Diagnostics: 23 reconciliation, 7 size, 50 cluster, 9 contribution, 10 threshold.
- **Distinct decisions actually on the table: about 25.** They are:
  - 3 caps × 2 exit conventions;
  - 2 VIX readings;
  - the all-time-high exit;
  - 2 sizes × 2 stress rules;
  - 3 cluster policies;
  - 5 kill switches.
- **W10 cells across the dossier: roughly 120–170**, but far fewer distinct rules (≈25–30 hold, exit and filter variants).
  - Track 17 has 8 cells, and track 19 a few re-tests.
  - Track 21 has ≈40, including a 20-length horizon profile; track 22 ≈20.
  - This track has 60 replication cells plus ≈30 diagnostics on the edge itself.
  - The dossier as a whole has ≈3,300 variants. The table uses N = 8, 24, 120 and 3,300 to bracket this.

| Cell (one at a time) | n | Edge t | Bonferroni t at N 8 / 24 / 120 / 3,300 | Deflated-Sharpe probability at N 8 / 24 / 120 / 3,300 |
|---|---|---|---|---|
| SPY 1993–2026, CAL90 | 17 | 2.51 | 2.73 / 3.08 / 3.53 / 4.33 | **0.79 / 0.64 / 0.45 / 0.18** |
| SPY 1993–2026, F63 | 16 | 2.54 | same | 0.80 / 0.65 / 0.46 / 0.18 |
| Index 1990–2026, CAL90 | 18 | 2.35 | same | 0.78 / 0.61 / 0.39 / 0.12 |
| Index 1928–2026, CAL90 | 47 | 1.91 | same | 0.66 / 0.47 / 0.25 / 0.05 |
| SPY 1993–2026, CAL60 | 17 | 0.64 | same | 0.21 / 0.10 / 0.03 / 0.00 |

- The Šidák-adjusted placebo p is 0.011 → 0.09 over track 17's 8 cells, and 0.24 over 24.
- **W10 at 90 days fails even the smallest Bonferroni bar.**
- The case for it is consistency and mechanism, as in tracks 17, 21 and 22:
  - positive in 1993–2007 and 2008–26;
  - robust to the −3% threshold;
  - positive against uptrend-only placebos;
  - volatility-shock liquidity provision (Nagel 2012).
- It is not the statistics. That is why it is sized small and run as a policy bet.

---

## 6. Reproducibility and caveats

Code is in `research/code/23-duration-verify/`. `python3 run_all.py` takes about 25 seconds and writes small CSVs to `results/`.

| File | Purpose | Main outputs |
|---|---|---|
| `common23.py` | Independent loaders (^GSPC, S&P TR with Shiller D/P, SPY, VIX/VXO, Ken French bills, BTC, ETF8). The W10 signal, exits, vectorised returns, placebo engine (era, uptrend, common shift), t, deflated Sharpe, Bonferroni, G(D), registry | – |
| `modules23.py` | M1 (matches track 13's 125 trades exactly), W10 one at a time, O2 windows, M3 switch, M2 long-only ETF8 | – |
| `s1_w10_replication.py` | Task 1: the samples × exits table, the one-at-a-time trade lists, reconciliation cells, the per-event match with track 21 | `w10_stats.csv`, `w10_trades_one_at_a_time.csv`, `w10_events_all.csv`, `w10_reconciliation_cells.csv`, `w10_vs_track21_events.csv` |
| `s2_w10_rules.py` | Task 2: calendar spans, calendar vs fixed, VIX void and all-time-high exit, size and stress, cluster simulation, kill switches | `rules_*.csv` |
| `s3_portfolio.py` | Task 3: W10 contribution grid, M4 from track 21's file, book expectation, daily streams, crisis windows, trades a year, SPY history | `portfolio_*.csv` |
| `s4_reconcile_mt.py` | Episodes, entry timing, deflated Sharpe, claims table, sub-periods, threshold robustness, borderline days, registry | `check_*.csv`, `variant_*.csv` |

**Caveats:**
- **Exit prices (corrected in Phase B).** SPY exits under F<H> and CAL<N> are at the open, and only the C<H> reconciliation cells sell at the close (`common23.close_exit`). Before the fix, CAL<N> exits were priced at the close; see "Correction (replay, Phase B)".
- **Data before 1952.** Yahoo's ^GSPC has no Saturday sessions before 1952, so "20 sessions" and "200 days" are weekday counts there.
- **Entries before 1990** are at the next close (a lower bound, §1.5).
- **Costs** are 1–2 bp a side, with no taxes (the IRA).
- **M4** is track 21's model-priced result, re-weighted here, not re-priced.
- **Streams.** M2 has no contango veto and no 3% US-cluster scaling. M3 is spot BTC from 2015. G(D) scales M1 and W10 only.
- **Assumptions.** Forward drift (3–6% S&P total return, bills 4.2%) is an assumption, not an estimate.
- **Tiny samples.** 17 SPY trades in 13 episodes, 47 trades since 1928.
