# 21 — Loosening the holding cap from 60 to 90 or 120 calendar days: what it does to the existing modules

*29 September 2026. This track answers one question: how do expected returns change if trades may be held 90 or 120 calendar days instead of 60? It re-runs the cap-sensitive modules of `00-SYSTEM-DESIGN-v3.md` (v3.2) with next-open fills, costs, placebos, out-of-sample checks and κ-shrinkage. Code and outputs: `research/code/21-duration/` (§9). Nothing here changes the design until you decide.*

*Labels: "p_era" = two-sided placebo p against 5,000 era-matched random dates (±3 years); "p_up" = against random dates on which the S&P was above its 200-day average; κ = shrinkage of an edge toward zero (0.5 = halve it). All returns are pre-tax.*

---

## TL;DR

1. **Loosening to 90 days adds about +0.2 points a year to the Lean book. Loosening to 120 days adds nothing more.**
   - Lean central (over T-bills): **+0.25 at 60 days → +0.43 at 90 → +0.40 at 120.** This assumes W10 runs live as a policy module; if it stays on paper, the figures are +0.33 and +0.30.
   - In nominal terms that is 4.45% → 4.63% → 4.60% a year. Lean + M2: 5.05% → 5.23% → 5.20%.
   - Ranges barely move (Lean −0.5 to +0.9 at 60; −0.4 to +1.1 at 90 and 120), because M3 and W8 dominate the spread and neither depends on the cap.
   - 11× still takes ≈53 years instead of ≈55 (Lean), or ≈47 instead of ≈49 (Lean + M2).
2. **Only two modules gain: W10 (crash-day buy) and M4/O2 (crash call spread).** M1, W8, W9, M2 and M3 are unchanged or worse with longer holds.
3. **W10 becomes a real rule at 63 sessions (90 days).**
   - 1990–2026, SPY from the next open: +6.9% vs a +2.7% placebo, 19 of 21 up.
     - Placebo tests: p_era 0.017, p_up 0.003.
     - One position at a time (18 trades): p_era 0.013.
   - At 42 sessions (60 days) it is +4.0% vs +1.8%, p_era 0.13: shadow, as decided.
   - **But 1928–1989 does not confirm it at any length.** The edge there is +1 to +3 points with p 0.21–0.66.
   - After deflating for track 17's 8 test cells, the 63-session p is 0.13 (p_up 0.02).
   - Expected contribution at 6.7% of NAV: **≈+0.10% a year** (range +0.03 to +0.13) at 90 or 120 days.
4. **O2 had to be re-run with a next-day entry before M4 ships (design §1). Done here.**
   - At 60 DTE the next-day entry keeps **+0.21 of debit per trade** (+0.27 at the next open, +0.15 at the next close). Track 14's signal-close result was +0.35.
   - An ordinary call spread bought on random days in the same years earned +0.06. The crash edge is not significant (p 0.64).
   - At the equity drift implied by CAPE ≈41, 60-DTE O2 is worth about **zero over T-bills**: −0.04% a year forward, with a planning range of −0.14 to +0.14%.
   - At 90/120 DTE it earns +0.36/+0.35 per trade, and the edge over a random-day spread is +0.23/+0.21 (p 0.21/0.25). Expected **+0.13% (90) and +0.11% (120) a year**.
   - The whole improvement comes from 2008–2026. In 1990–2007, 90/120-DTE spreads earned only +0.07/+0.00 per trade.
5. **W8 is best at its current 20-session hold.**
   - Its edge over a plain call spread falls from +0.26 of debit (p 0.23) at 20 sessions to +0.13/+0.15 at 40/60 sessions (+0.05/+0.02 with fixed strikes).
   - The underlying's edge over drift is ≈0 at 40–60 sessions.
   - DAL legs become impossible at those lengths: the DTE they would need always spans an earnings date.
   - **W9 stays paper** (n = 5). Its 40-session oil move looks strongest (+23% WTI, p 0.02), but two events carry it.
6. **M1: the cap never binds** (its exit fires after 3.3 sessions on average).
   - 14 slower-exit or longer-cap variants were tried. None beats the current exit on the timing edge in both halves, except RSI(2) > 70, by a negligible 0.001–0.004 points a year.
   - Long time exits add only market beta, and double the drawdown at 1× (−14% → −31%).
7. **M2 and M3: no change.**
   - Both are re-decided positions that continue while on (M2 monthly; M3 weekly, per `DECISIONS.md` #11).
   - Even under the old forced 60-day close for M3, a 90/120-day cap would only have saved ≤0.005% of NAV a year on IBIT and ≤0.03% on Coinbase.
8. **Risk barely changes.** The 2008–2026 history (unshrunk) gives maximum drawdowns of:
   - Lean: −8.8% (60), −6.2% (90), −6.5% (120);
   - Lean + M2: −13.9% / −14.2% / −14.0%.

   The longer caps add ≈2 points to the drawdown inside crash windows (2020: −2.3% → −4.2%). They also stack W10 + M1 + M4 above the 4% US-equity reservation: 6 of the 26 O2 signals arrived while a 63-session W10 hold was open.
9. **Most of what longer holds add is equity drift, and it rests on the V-shaped recoveries after 1990/2008.** At CAPE ≈41 the forward drift over bills is ≈0, which is why the shrunk gains are small. **Taxes don't change:** every hold is still under a year, so gains are short-term; XSP stays Section 1256 and the IRA stays untaxed.
10. **Recommendation.**
    - If you want the extra ≈0.2 points, **loosen to 90 days, not 120**, and only for W10 (63 sessions, own slot, one position; paper, or policy on your approval) and M4 (90 DTE, one spread at a time).
    - Keep everything else as it is.
    - If you prefer the simpler 60-day system, that is a defensible choice: it costs ≈0.2 points a year. In that case cut M4's §6 expectation to ≈0 (−0.14 to +0.14).

---

## 0. Question, data and method

**Question.** For caps of 60 (baseline), 90 and 120 calendar days, taken as 42, 63 and 84 trading sessions, how do the existing modules' expected contributions change?

**Data.** All data come from earlier tracks' caches:
- ^GSPC 1927–2026, with total return from Shiller D/P before 1988 and ^SP500TR after;
- SPY with dividend-adjusted opens (1993+);
- CBOE VIX, VIX9D, VIX3M and VIX6M, with opens from 1992;
- FRED T-bills and WTI;
- track 17's event lists;
- track 14's calibrated synthetic SPX option surface;
- track 15's ETF data.

**Fills and costs.**
- W10 and M1: SPY at the next open, 1 bp a side (doubled when VIX > 30 for M1).
- Options, per the design's frozen fill model: mid ± 0.3 × the quoted spread per leg, plus fees. Spreads come from track 14's SPX model, which scales with VIX and is wider before 2013.
- An "XSP stress" case doubles the spreads and charges $0.75 a leg.

**Two conventions for expected returns**, both reported:

| Convention | Expected return per trade | Use |
|---|---|---|
| **Design convention** | κ × the historical mean (history's equity drift kept) | Comparable to the design's §6 |
| **Forward convention** | Forward S&P drift over the hold (total return 3 / 4.5 / 6% a year at CAPE ≈41, T-bills 4.2%) + κ × the event's edge over its placebo | Removes the 1990–2026 drift (8.4% a year in price) that the history embeds |

Planning figures:
- **central** = the average of the two conventions at κ = 0.5;
- **low** = κ = 0.3 with a 3% forward return;
- **high** = the design convention.

**Tests.**
- Era-matched and uptrend-only placebos.
- Pre-1990 (W10) and pre-2008 (O2, M1) halves as out-of-sample checks.
- Episode clustering (O2).
- Deflated Sharpe probabilities; Šidák adjustments for the number of cells tried.
- A family-wise p across the three caps, from joint placebo draws.

**Variants tried here** (full ledger in §7): 38 decision-relevant variants (W10 3, O2 12, W8 6, W9 3, M1 14), plus about 110 robustness cells. These come on top of the ≈2,900 variants of tracks 13–17.

---

## 1. W10 — first uptrend crash day (shadow today)

**Rule (unchanged).** Buy on the first S&P close ≤ −3% whose prior close was above the 200-day average, with no other ≤ −3% close in the prior 20 sessions. Buy SPY at the next open and hold H sessions.

### 1.1 Results by cap (1990–2026, n = 21; SPY total return from the next open, one 1991 event at the next close)

| Cap → H | Mean (median) | Up | Era placebo, p_era | Uptrend placebo, p_up | Edge vs era placebo | Worst / median interim drawdown | t vs 0 |
|---|---|---|---|---|---|---|---|
| 60 d → 42 | **+3.99% (+6.14%)** | 71% | +1.81%, **0.131** | +2.01%, 0.058 | +2.19 pts | −30.8% / −2.2% | 2.5 |
| 90 d → 63 | **+6.93% (+7.39%)** | 90% | +2.72%, **0.017** | +3.04%, **0.003** | +4.21 pts | −30.8% / −2.2% | 4.9 |
| 120 d → 84 | **+8.87% (+8.17%)** | 81% | +3.64%, **0.007** | +4.13%, **0.001** | +5.23 pts | −30.8% / −2.2% | 5.4 |

- **Best of the three caps, family-wise:** p = 0.019 (era) and 0.004 (uptrend).
- **Replication.** On the S&P price from the signal close, 42 and 60 sessions give p_era 0.17 and 0.005–0.007 (red team: 0.175 and 0.006).
  - **60 sessions is a local peak:** 63 sessions gives p_era 0.023 (price).
  - The horizon profile (`w10_horizon_profile.csv`) shows a steady 1990+ edge of +4 to +5 points, with p 0.006–0.02, for any hold of 55–100 sessions. At 40–42 sessions the edge is +1.6 to +2.2 points (p 0.11–0.27).
- The worst interim drawdown in every case is February–March 2020: −30.8%, or −2.1% of NAV at 6.7%.

### 1.2 Out-of-sample check (1928–1989, n = 39) and pooled (1928–2026, n = 60)

| H | 1928–89 from the signal close (price) | 1928–89 from the next close (TR) | Pooled, price: p_era / p_up | Pooled, tradable proxy: p_era / p_up |
|---|---|---|---|---|
| 42 | +3.21% vs +0.86%, p 0.22 | +2.62% vs +1.73%, p 0.64 | 0.098 / 0.028 | 0.32 / 0.21 |
| 63 | +3.88% vs +1.33%, p 0.29 | +3.66% vs +2.63%, p 0.66 | 0.059 / 0.013 | 0.20 / 0.084 |
| 84 | +4.86% vs +1.62%, p 0.21 | +4.70% vs +3.38%, p 0.61 | 0.031 / 0.011 | 0.145 / 0.088 |

- Before 1990 the edge is positive but small (+1.0 to +3.2 points) and never significant. The worst interim drawdown is −38% to −39%.
- After the first day it is only +1.0 to +1.3 points: much of the pre-1990 rebound came on day 1, which a next-day buyer misses.
- A κ of 0.5 on the 1990+ edge (+2.1 points at 63 sessions) lands where the 1928–89 evidence sits.

### 1.3 How the rule would actually trade, and design details

| Cap | Trades, one position at a time (1990–2026) | Mean | p_era / p_up | Events skipped because a W10 trade was open |
|---|---|---|---|---|
| 60 d (42) | 18 (0.49 a year) | +3.36% | 0.32 / 0.22 | 2000-02-18, 2018-12-04, 2020-10-28 |
| **90 d (63)** | **18 (0.49 a year)** | **+7.26%** | **0.013 / 0.003** | 2000-02-18, 2018-12-04, 2020-09-03 |
| 120 d (84) | 15 (0.41 a year) | +8.33% | 0.048 / 0.014 | six events |

- **Calendar-exact exit.** Selling at the open of the last session within 60/90/120 days of entry gives +3.75% / +7.29% / +8.62%, the same as the session count.
- **The design's all-time-high exit is neutral:** +4.0% / +7.0% / +8.3% vs +3.8% / +6.9% / +9.0%, with 4, 8 and 10 early exits. It was meant to hand the position to a long-horizon core the system doesn't have. **Drop it.**
- **The VIX > 45 void never triggered:** the highest VIX at an uptrend crash was 40.8.
- **Next-open entry costs nothing:** tradable +3.99% vs +3.52% from the close at 42 sessions.

### 1.4 Overlap with M1

- 9 of 20 SPY-era events had an M1 (ST-1) signal on day 0–3.
- An M1 trade was open during 15% / 12% / 12% of W10 holding sessions (42 / 63 / 84).
- 26 / 31 / 37 of M1's 125 trades (21–30%) were entered inside a W10 window.

So W10 roughly doubles US-equity exposure in the weeks after a crash, when M1 also fires.

### 1.5 Deflated significance, status and contribution

- **Deflation.**
  - The 63-session p_era of 0.017 becomes 0.13 after Šidák over track 17's 8 cells (−3%/−4% × above/below the 200-day × two eras), and 0.34 over 24 (8 cells × 3 caps).
  - p_up of 0.003 becomes 0.02 and 0.06.
  - At 84 sessions: p_era 0.056 / 0.16 and p_up 0.010 / 0.03 over 8 / 24 cells.
- **Paper evidence can't settle it.** W10 fires about 0.5 times a year, so a paper record adds about 5 trades per decade.

| Cap | Status | Contribution a year at 6.7% of NAV, κ = 0.5 (non-overlapping trades) | Range (κ 0.3 at forward-low drift → design convention) |
|---|---|---|---|
| 60 d | **Shadow** (unchanged) | 0 live; +0.03 to +0.06 if it were run | +0.01 to +0.06 |
| 90 d | **Paper in its own slot at 63 sessions; policy only by your approval** | **+0.10** (forward +0.08; design +0.13) | +0.04 to +0.13 |
| 120 d | Same; 84 sessions is not better (fewer trades, p_era 0.05 once overlaps are removed) | **+0.10** (forward +0.06; design +0.13) | +0.03 to +0.13 |

---

## 2. M4 / O2 — crash call spread, re-priced with a next-day entry

**Signal (unchanged).** SPX ≥15% below its 252-day high and VIX ≥30; first day only; 60-day cool-down. That gives 26 signals in 12 crisis episodes, 1990–2026.

**Trade.** Long the ATM call and short the 105% call. Expiry is the last session within 60/90/120 days of entry. Sell to close at the close of the session before expiry, per the design rule.

**Entry proxies for the 10:00–10:30 ET order:**
- **next open:** SPX = the signal close × SPY's overnight return, VIX at its CBOE open, the term structure scaled to it;
- **next close.**

The "mid" is the average of the two.

### 2.1 Per-trade return on debit

| DTE | Signal close (replication, same costs) | Next open | Next close | **Mid** | Median (mid) | Win | Lost 100% | 1990–2007 / 2008–2026 (mid) | t | DSR (N 12 / N 840) |
|---|---|---|---|---|---|---|---|---|---|---|
| 60 | +0.24 | +0.27 | +0.15 | **+0.21** | +0.54 | 58% | 4 | +0.23 / +0.19 | 1.2 | 0.33 / 0.03 |
| 90 | +0.45 | +0.38 | +0.35 | **+0.36** | +0.78 | 69% | 4 | **+0.07** / +0.58 | 2.2 | 0.67 / 0.19 |
| 120 | +0.40 | +0.36 | +0.35 | **+0.35** | +0.85 | 69% | 4 | **+0.00** / +0.61 | 2.1 | 0.62 / 0.15 |

- **Replication.** Track 14 reported +0.35 at 60 DTE, from the signal close with lighter costs (0.25 of the spread) held to expiry. With the design's fill model the same entry gives +0.24 (held to expiry: +0.33).
- The gap between selling a day before expiry and holding to expiry is last-day noise (±0.6 on single trades, mean −0.1), not a systematic cost.
- **The debit is ≈2.4–2.5% of spot at every DTE**; the maximum payout is ≈2.0× the debit.
- **One-day entry timing swings single trades a lot** in V-shaped crashes. For 9 Mar 2020 at 60 DTE: +0.83 from the signal close, −0.46 from the next open, −0.77 from the next close.

**Cost and structure checks:**

| Check | 60 DTE | 90 DTE | 120 DTE |
|---|---|---|---|
| XSP stress costs (next open / next close) | +0.15 / +0.04 | +0.24 / +0.22 | +0.21 / +0.20 |
| Short strike 100 + 5·√(DTE/60)% | n/a | +0.42 / +0.38 | +0.48 / +0.42 |
| Cool-down = DTE, one spread at a time | same | +0.49 (n 22) | +0.41 (n 19) |

### 2.2 Episode clustering (mean return on debit per episode, mid entry)

| Episode | First signal | Trades | 60 DTE | 90 DTE | 120 DTE |
|---|---|---|---|---|---|
| Gulf War | 1990-08-23 | 3 | +0.34 | +0.30 | +0.57 |
| LTCM | 1998-08-31 | 1 | +0.87 | +0.77 | +0.72 |
| Dot-com I | 2000-12-20 | 3 | +0.61 | +0.24 | −0.36 |
| Dot-com II | 2002-07-09 | 4 | −0.29 | −0.41 | −0.33 |
| 2008 Q1 | 2008-01-22 | 1 | −0.57 | +0.82 | +0.83 |
| GFC | 2008-09-15 | 5 | −0.13 | −0.10 | +0.17 |
| 2010 | 2010-06-30 | 1 | +0.40 | +1.05 | +1.02 |
| 2011 | 2011-08-08 | 2 | +0.37 | +1.04 | +1.04 |
| 2018 | 2018-12-21 | 1 | +1.23 | +1.16 | +1.12 |
| Covid | 2020-03-09 | 2 | +0.29 | +1.12 | +1.10 |
| 2022 | 2022-05-09 | 2 | +0.08 | +0.45 | +0.02 |
| 2025 tariffs | 2025-04-04 | 1 | +1.00 | +0.96 | +0.94 |
| **Episode mean (t, 12 episodes)** | | | **+0.35 (2.3)** | **+0.62 (4.1)** | **+0.57 (3.6)** |

The longer expiries win in the V-shaped post-2008 episodes and lose in the 2000–2003 grind. **O2 is idle in about 60% of years.**

### 2.3 Edge vs a plain call spread

The placebo is the same spread bought at the next close after a random session within ±3 years (next-close convention).

| DTE | Event mean | Placebo mean | **Edge**, p_era | 1990–2007 edge (p) | 2008–2026 edge (p) | Any-day mean, 1990–2007 / 2008–2026 |
|---|---|---|---|---|---|---|
| 60 | +0.15 | +0.06 | **+0.09, p 0.64** | +0.34 (0.20) | −0.09 (0.72) | −0.01 / +0.28 |
| 90 | +0.35 | +0.12 | **+0.23, p 0.21** | +0.16 (0.56) | +0.29 (0.27) | +0.04 / +0.38 |
| 120 | +0.35 | +0.13 | **+0.21, p 0.25** | +0.09 (0.74) | +0.30 (0.23) | +0.07 / +0.42 |

**Most of O2's return is the equity drift that any SPX call spread earned after 2008.** The crash-specific edge is positive in both halves only at 90/120 DTE, and is significant nowhere.

### 2.4 Contribution a year at a 2% debit (pre-tax, over T-bills)

| Cap / DTE | Frequency | Design convention (κ 0.5) | Forward convention (κ 0.5, 4.5% S&P) | Forward range (3–6%; κ 0.3–0.5) | **Planning central (range)** |
|---|---|---|---|---|---|
| 60 | 0.71 a year | +0.14% | −0.04% | −0.14 to +0.02% | **+0.05% (−0.14 to +0.14)** |
| 90, one spread at a time | 0.60 a year | +0.21% | +0.06% | −0.07 to +0.12% | **+0.13% (−0.07 to +0.21)** |
| 120, one spread at a time | 0.52 a year | +0.17% | +0.05% | −0.06 to +0.10% | **+0.11% (−0.06 to +0.17)** |

- Under 90/120 days the per-trade value is taken from all 26 signals. The one-spread-at-a-time rule is needed so that two overlapping spreads (4% of premium) do not breach the 3% macro-factor premium budget.
- No credit is taken for its higher sample mean (+0.49 at 90 DTE), which depends on which signals it happened to skip.
- **Status.** M4 stays a policy module under 90/120 days with 90 DTE. **Under the 60-day cap, M4's expectation is ≈0.** Either keep it for its capped crash-rebound exposure, knowing that, or run it on paper.

---

## 3. W8 and W9 — holds of 20, 40 and 60 trading days

### 3.1 W8: the underlying's edge vs drift (16 declustered de-escalations, 1953–2026)

Entry at the next session (SPY open from 1993, otherwise S&P next close):

| Hold | All 16: mean vs placebo (p) | Oil era 1986+, n 11 (p) | SPY era 1993+, n 8 (p) | Track 17 basis, from the day-0 close, all 16 (p) |
|---|---|---|---|---|
| 20 | +1.52% vs +1.10% (0.67) | +2.08% vs +1.11% (0.44) | +1.68% vs +1.10% (0.70) | +1.79% vs +0.92% (0.39) |
| 40 | +1.97% vs +2.23% (0.86) | +2.92% vs +2.24% (0.69) | +2.16% vs +2.26% (0.96) | +2.06% vs +1.85% (0.88) |
| 60 | +2.62% vs +3.31% (0.67) | +3.32% vs +3.36% (0.98) | +1.50% vs +3.43% (0.41) | +2.36% vs +2.74% (0.81) |

### 3.2 W8 call spreads with matching DTE (SPX surface, 1990+ events)

DTE follows the design's rule (≥ 2 × the hold in calendar days). Strikes are +2% / +5% of spot, scaled by √(DTE/60). Exit at 80% of the maximum value or at the time stop.

| Hold → DTE | n | Mean return on debit (median) | Plain call spread on random days | **Edge** (p_era) | Fixed 102/105 strikes: edge (p) | Forward drift: event / placebo | Debit (% of spot) |
|---|---|---|---|---|---|---|---|
| **20 → 60** | 10 | +0.29 (+0.50) | +0.03 | **+0.26 (0.23)** | same | +0.20 / −0.07 | 1.0% |
| 40 → 120 | 9 | +0.20 (+0.37) | +0.07 | +0.13 (0.55) | +0.05 (0.78) | +0.11 / −0.05 | 1.5% |
| 60 → 180 | 8 | +0.23 (+0.50) | +0.09 | +0.15 (0.49) | +0.02 (0.89) | +0.14 / −0.06 | 1.8% |

**Verdict.**
- Longer W8 holds add drift but no event edge, and need bigger debits per spread.
- The DAL variant is ruled out at 40/60 sessions: its 116–174 DTE would always span an earnings date, which the design forbids.
- **Keep W8 at 20 sessions under every cap.** Expected ≈+0.02% a year at the long-run 0.4 events a year (design range −0.1 to +0.2).

### 3.3 W9 (paper): the five lasting-disruption oil shocks

Entry at the next session's close:

| Hold | WTI spot, mean (median) vs placebo | p_era | USO (n 4), p | Per event (WTI) |
|---|---|---|---|---|
| 20 | +14.5% (+15.4%) vs +0.8% | 0.024 | +14.3%, 0.030 | Kuwait +15%, Libya +10%, Ukraine +27%, oil-ban scare −18%, Hormuz +38% |
| 40 | +23.0% (+15.2%) vs +1.9% | 0.024 | +21.4%, 0.026 | Kuwait +56%, Libya +15%, Ukraine +9%, oil-ban scare −13%, Hormuz +48% |
| 60 | +17.8% (+20.3%) vs +2.6% | 0.12 | +17.5%, 0.13 | Kuwait +48%, Libya +1%, Ukraine +20%, oil-ban scare −6%, Hormuz +24% |

**n = 5, and Kuwait and Hormuz carry the means. W9 stays paper under every cap.** If it is ever promoted, a 40-session hold (with ≥116 DTE, and the contango veto) is worth a pre-registered paper comparison against 20 sessions. USO options cost 14–19% of the debit per round trip.

---

## 4. M1 (ST-1) — longer maximum holds and slower exits

The entry is unchanged. 14 variants were run on SPY from the next open, split 1993–2007 / 2008–2026, and checked on the S&P with the VXO/VIX gate (1986–2026) and without it (1928–2026). Contributions are a year at 6% of NAV, κ = 0.5:
- "hist" = on the mean excess over bills;
- "edge" = on the timing edge (excess minus the drift of a random entry of the same length), which is what survives at CAPE ≈41.

| Variant (SPY) | Trades a year pre / post | Mean excess per trade pre / post | Timing edge (t) post | Contribution hist, pre / post | Contribution edge, pre / post | DSR post (N 547) | Max drawdown at 1×, post |
|---|---|---|---|---|---|---|---|
| **SMA5 exit, cap 20 (M1 today)** | 3.6 / 3.8 | +1.23% / +0.86% | +0.71% (2.9) | 0.13 / 0.10% | 0.12 / 0.08% | 0.64 | −14% |
| SMA5 exit, cap 40 or 60 | identical: the cap never binds | | | | | | |
| SMA10 exit, cap 40 | 3.2 / 3.6 | +1.56% / +0.66% | +0.42% (0.9) | 0.15 / 0.07% | 0.14 / 0.05% | 0.14 | −31% |
| SMA20 exit, cap 60 | 3.3 / 3.7 | +1.43% / +0.99% | +0.67% (1.8) | 0.14 / 0.11% | 0.13 / 0.07% | 0.43 | −31% |
| RSI2 > 70 exit, cap 20 | 3.4 / 3.7 | +1.39% / +0.93% | +0.74% (2.8) | 0.14 / 0.10% | 0.13 / 0.08% | 0.65 | −14% |
| RSI2 > 90 exit, cap 40 | 2.3 / 3.1 | +1.57% / +1.34% | +0.82% (1.5) | 0.11 / 0.13% | 0.08 / 0.08% | 0.37 | −31% |
| Time exit 20 | 2.1 / 2.8 | +1.49% / +1.55% | +0.66% (0.8) | 0.09 / 0.13% | 0.06 / 0.06% | 0.22 | −34% |
| Time exit 40 | 1.5 / 2.2 | +2.61% / +3.22% | +1.44% (1.5) | 0.12 / 0.21% | 0.06 / 0.09% | 0.57 | −31% |
| Time exit 60 | 1.2 / 1.9 | +3.32% / +4.33% | +1.65% (1.5) | 0.12 / 0.24% | 0.06 / 0.09% | 0.75 | −31% |

**Variants tried (14).**
- Exits: close > SMA5 with caps 20/40/60; close > SMA10 with caps 20/40/60; close > SMA20 with caps 40/60; RSI(2) > 70 cap 20; RSI(2) > 90 cap 40.
- Time exits: 10, 20, 40 and 60 sessions.

**Robust in both halves on the timing edge:**
- SPY: only RSI(2) > 70, by +0.004 / +0.001 points a year, which is noise. It is track 13's already-registered alternative.
- The S&P samples, gated or not: none.

Long time exits beat M1 on "hist" after 2008 because they hold SPY 35–45% of the time: that is beta, which the forward view prices at ≈0 over bills. **Keep M1 as it is under every cap.**

---

## 5. M2, M3 and the modules the cap cannot affect

- **M2 (long-only ETF8).** Monthly re-decided positions already continue under your decision, so the cap changes nothing.
  - Had continuation not been allowed, forced round trips would have cost ≈0.2–1.4% a year at 60 days, falling roughly in proportion to 1/cap.
  - The rebuilt stream (track 15 code, s = 0.5) earns +2.5% a year over bills in 2008–2026, with a −12.7% maximum drawdown, matching the design.
- **M3 (BTC 10-week switch).** Under `DECISIONS.md` #11 (29 Sep) M3 continues while on, with no forced 60-day close, so **the cap changes nothing**. If #11 were reverted, the forced re-entries would be:

  | Cap | Forced re-entries a year | Saving vs 60 days, IBIT (0.1% round trip) | Saving vs 60 days, Coinbase (0.8% round trip) |
  |---|---|---|---|
  | 60 | 1.6 | — | — |
  | 90 | 0.9 | ≈0.002% of NAV a year | ≈0.02% |
  | 120 | 0.4 | ≈0.004% | ≈0.03% |

  Immaterial either way.
- **M6.**
  - Shadow only since v3.2.
  - A 90/120-day cap would let cash-and-carry use the 2–3-month CME basis its trigger was defined on, but it still needs ≈$280k for MBT.
- **M7 (O1).** Its holds are already under 29 days, and it is off at $100k.

---

## 6. Portfolio: expected returns, drawdowns and trades under 60 / 90 / 120 days

### 6.1 Expected contribution a year (pre-tax, over T-bills, % of NAV): central (range)

| Module | Design §6 (v3.2, 60 d) | **60 days (re-estimated)** | **90 days** | **120 days** |
|---|---|---|---|---|
| M1 ST-1 (6%) | +0.05 to +0.10 | +0.08 (+0.05 to +0.10) | same | same |
| M3 BTC switch (3%) | −0.3 to +0.5 | +0.10 (−0.3 to +0.5) | same | same |
| M4 O2 (2% debit) | +0.1 to +0.3 | **+0.05 (−0.14 to +0.14)** | **+0.13 (−0.07 to +0.21)** | **+0.11 (−0.06 to +0.17)** |
| W8 (≤1%, 20 sessions) | M5: −0.1 to +0.2 | +0.02 (−0.1 to +0.2) | same | same |
| W10 (6.7%) | shadow | 0 (shadow) | **+0.10 (+0.04 to +0.13)**, if you approve it as policy | **+0.10 (+0.03 to +0.13)**, same condition |
| W9, M6 | paper / shadow | 0 | 0 | 0 |
| **Lean** | **+0.4 (−0.3 to +1.2)** | **+0.25 (−0.5 to +0.9)** | **+0.43 (−0.4 to +1.1)**; +0.33 if W10 stays on paper | **+0.40 (−0.4 to +1.1)**; +0.30 on paper |
| M2 trend (s = 0.5) | 0 to +1.2 | +0.6 (0 to +1.2) | same | same |
| **Lean + M2** | **+1.0 (−0.3 to +2.4)** | **+0.85 (−0.5 to +2.1)** | **+1.03 (−0.4 to +2.3)** | **+1.00 (−0.4 to +2.3)** |

The 60-day column is below the design's §6 for two reasons that have nothing to do with the cap:
- M4's next-day re-run (§2);
- M6 is shadow-only since v3.2, so it is counted at 0.

### 6.2 Totals, drawdowns, trades and time to 11×

| Book | Cap | Over T-bills, central (range) | **Total nominal, central (range)** | Max drawdown, history 2008–26 (1993–2026) | Planning max drawdown | Trades a year | Years to 11× |
|---|---|---|---|---|---|---|---|
| Lean | 60 | +0.25 (−0.5 to +0.9) | **4.45%** (3.7–5.1%) | −8.8% (−10.3%) | ≈10–12% | ≈10–17 | 55 |
| Lean | 90 | +0.43 (−0.4 to +1.1) | **4.63%** (3.8–5.3%) | −6.2% (−6.8%) | ≈10–12% | ≈10.5–17.5 (+W10 0.5; M4 0.6) | 53 |
| Lean | 120 | +0.40 (−0.4 to +1.1) | **4.60%** (3.8–5.3%) | −6.5% (−8.1%) | ≈10–12% | ≈10.5–17.5 | 53 |
| Lean + M2 | 60 | +0.85 (−0.5 to +2.1) | **5.05%** (3.7–6.3%) | −13.9% | ≈15–18% | ≈22–29 | 49 |
| Lean + M2 | 90 | +1.03 (−0.4 to +2.3) | **5.23%** (3.8–6.5%) | −14.2% | ≈15–18% | ≈22.5–29.5 | 47 |
| Lean + M2 | 120 | +1.00 (−0.4 to +2.3) | **5.20%** (3.8–6.5%) | −14.0% | ≈15–18% | ≈22.5–29.5 | 47 |
| **SPY, buy and hold** | none | — | **History: ≈10% (1928–2026), 11.3% (2008–26); forward ≈3–6% at CAPE ≈41** | −52% (2008–26), −55% (1993–2026), −86% (1929–32) | — | 0 | — |

**Historical path statistics** (`portfolio_history.csv`: daily streams, unshrunk, no governor):

| Book | Excess over bills, 2008–2026 | Sharpe | Worst year |
|---|---|---|---|
| Lean, 60 days | +1.45% a year | 0.64 | −3.4% (2008, M4's three losing spreads) |
| Lean, 90 days | +2.37% | 0.89 | −1.0% |
| Lean, 120 days | +2.41% | 0.91 | −2.6% |
| Lean + M2, 60 / 90 / 120 | +4.0 / +4.9 / +4.9% | 0.63–0.75 | about −6 to −7% (2018) |

The historical gap between 60 and 90 days (+0.9 points) is roughly five times the shrunk gap (+0.18): most of it is the post-2008 bull market.

**Inside crash windows** (Lean, maximum drawdown):

| Window | 60 days | 90 days | 120 days |
|---|---|---|---|
| 2000–02 | −5.4% | −4.2% | −6.4% |
| 2008–09 | −8.8% | −6.2% | −6.5% |
| 2020 | −2.3% | −4.2% | −4.1% |
| 2022 | −3.7% | −2.3% | −4.6% |

The 120-day configuration was the worst in the 2000–2002 bear market (−5.2% cumulative).

**Stacking.**
- In 6 of 26 O2 signals (1998, 2010, 2011, 2018, 2020 twice), M4 fired while a 63-session W10 hold was open.
- M1 (2% stress) + W10 (2.2%) + M4 (2%) ≈ 6.2% of NAV, above the 4% US-equity reservation.
- The cluster rule would have to cut one of them. Without an explicit priority, it would be decided by whichever fired first.

**Taxes.** Every hold under 60, 90 or 120 days is short-term: ordinary rates in taxable accounts, nothing in the IRA, and 60/40 on XSP regardless of holding period. Loosening the cap changes no tax line. Only holds over a year would, and those are outside this system.

---

## 7. Multiple-testing ledger (this track)

| Family | Decision variants | Best raw result | After deflation / out of sample |
|---|---|---|---|
| W10 | 3 caps (plus 3 exit variants, the non-overlapping version and 3 samples, as checks) | 84 sessions: p_era 0.007, p_up 0.001; 63: 0.017 / 0.003 | Family-wise over the caps: 0.019 / 0.004.<br>Šidák over 8 cells: 0.13 / 0.02 (63), 0.06 / 0.01 (84); over 24: 0.34 / 0.06 (63).<br>1928–89: p 0.21–0.66 at every cap |
| O2 | 12 (3 DTE × 2 strike widths × 2 cool-downs); entry proxies and costs as checks | 90 DTE: t 2.2; episode t 4.1 | DSR 0.67 (N 12), 0.19 (N 840).<br>Edge vs a random-day spread: p 0.21–0.64.<br>Pre-2008 mean ≈0 at 90/120 DTE |
| W8 | 6 (3 holds × 2 strike rules) | 20 sessions: edge +0.26 of debit, p 0.23 | Not significant; 40/60 worse |
| W9 | 3 holds | 40 sessions: p 0.024 (n 5) | n < 10: paper only |
| M1 | 14 exits and caps × 3 samples | RSI2 > 70: +0.001–0.004 points a year in both halves | DSR 0.64 (N 547), unchanged |

That is 38 decision variants and about 150 cells in total. **No new result clears a strict multiple-testing bar on its own.** W10 at 63 sessions is the strongest: it passes within its 1990+ sample and fails the pre-1990 check.

---

## 8. Implications

1. **The answer to your question.**
   - A 90-day cap raises the expected return of the Lean book from ≈4.45% to ≈4.63% a year before tax, and of Lean + M2 from ≈5.05% to ≈5.23%.
   - A 120-day cap gives the same or slightly less.
   - Drawdowns and trade counts barely change.
   - It is a ≈+0.2-point lever, worth about 2 years off the ≈50 it takes to reach 11×. The long-horizon core outside the system remains the lever that matters.
2. **If you loosen, choose 90 days, not 120.** Every gain appears by 63 sessions or 90 DTE. At 120:
   - W10 loses trades to overlap (15 vs 18; p_era 0.05);
   - O2 at 120 DTE is no better than at 90;
   - the 120-day configuration did worst in 2000–2002.
3. **Changes that a 90-day cap would require** (all Tier-1 rule changes needing your approval):
   - **W10** moves from shadow to its own paper slot:
     - buy SPY at the next open, hold 63 sessions (or to the open of the last session within 90 days), one position at a time, ≤6.7% of NAV;
     - drop the all-time-high exit; keep the VIX > 45 void;
     - kill switch: 5 consecutive losers, or 1990+ p_era > 0.10 with new data;
     - paper cannot validate it (≈0.5 trades a year), so policy status is your call on the historical evidence (§1.5). On paper it adds nothing to real returns.
   - **M4**: XSP expiry nearest to but not beyond **90 days**; the cool-down lengthened to 90 days (one spread at a time, which keeps the 3% factor premium budget); the §4 option-expiry rule's O2 exception restated for 90 DTE.
   - **US-equity reservation**: either raise it from 4% to ≈6.5% of stress, or set a priority (M4 → M1 → W10) for when all three fire together, which happened for 6 of the 26 O2 signals.
   - **Unchanged**: M1 (cap 20, SMA5 exit), W8 (20 sessions, 56–75 DTE), W9 (paper), M2, M3, M6, M7.
4. **If you keep 60 days**, the design still needs two corrections from this track:
   - **M4's §6 row** becomes ≈+0.05% (−0.14 to +0.14). The next-day re-run keeps +0.21 of debit, the crash edge vs a plain call spread is +0.09 (p 0.64), and at CAPE ≈41 drift it is about break-even over bills. Keep it only as a capped crash-rebound position, or move it to paper.
   - **The Lean central** becomes ≈+0.25 over bills (≈4.45% nominal), and Lean + M2 ≈+0.85 (≈5.05%).
5. **Why the gains are small.**
   - Longer holds mostly buy more equity drift, which the post-1990 history rewarded and which is ≈0 over bills at CAPE ≈41.
   - The event-specific edges that survive shrinkage are +2 to +2.6 points per W10 trade and +0.05 to +0.12 of debit per O2 trade, on 0.5–0.7 trades a year.
   - Neither W10's longer-hold advantage nor O2's is confirmed before 1990 or 2008 respectively.
6. **Versus SPY.**
   - The system's ≈4.5–5.3% nominal is comparable to SPY's forward-looking 3–6% at CAPE ≈41, with drawdowns of ≈6–18% instead of ≈50%.
   - It is about half of SPY's historical 10–11% a year.
   - Loosening the cap does not change that comparison.
7. **Taxes are unchanged.** All trades remain short-term.
8. **The paper phase should record** W10 at 42 and 63 sessions side by side (shadow and paper), and O2 at 60 and 90 DTE (paper). Then the choice made now is re-checked on live fills, not only on history.

---

## 9. Reproducibility

Code is in `research/code/21-duration/`. `python3 run_all.py` runs everything in about 20 seconds on one core, from the earlier tracks' caches; nothing is downloaded. Outputs go to `results/*.csv`. Logs are in the session scratchpad (`21-duration/`).

| Script | Purpose | Main outputs |
|---|---|---|
| `common21.py` | Paths, caps (60/90/120 → 42/63/84), forward assumptions, placebo p | — |
| `w10_duration.py` | W10 at 42/63/84: three samples, era and uptrend placebos, family-wise p across caps, calendar-exact and all-time-high exits, VIX void, M1 overlap, contributions | `w10_stats.csv`, `w10_events_1990.csv`, `w10_variants.csv`, `w10_m1_overlap.csv`, `w10_contribution.csv` |
| `w10_horizon_profile.py` | Diagnostic: edge and p for holds of 20–100 sessions | `w10_horizon_profile.csv` |
| `w10_nonoverlap.py` | One position at a time | `w10_nonoverlap.csv` |
| `o2_duration.py` | O2 at 60/90/120 DTE: signal close vs next open vs next close, XSP costs, √-width, cool-down = DTE, episodes, random-day placebo; `--forward` re-prices with forward drift | `o2_trades.csv`, `o2_summary.csv`, `o2_placebo.csv`, `o2_forward_*.csv` |
| `w8_w9_duration.py` | W8 underlying vs drift; W8 call spreads with matching DTE vs a plain spread; W9 oil moves | `w8_underlying.csv`, `w8_spreads.csv`, `w9_underlying.csv` |
| `m1_duration.py` | 14 exit and cap variants × SPY halves, gated S&P, ungated S&P 1928–2026 | `m1_variants.csv`, `m1_robustness.csv` |
| `portfolio_duration.py` | Daily excess streams (M1, W10, O2 marked to model daily, M3 via BTC, M2 via track 15's code), book statistics, crisis windows, M3 forced re-entries | `portfolio_history.csv`, `portfolio_crisis_windows.csv`, `portfolio_daily_streams.csv` |
| `summary21.py` | O2 mid-entry and episode tables, DSR, W10 non-overlap contributions, O2-inside-W10 counts, the §6 expectation table | `o2_mid_summary.csv`, `o2_episodes_mid.csv`, `w10_contribution_nonoverlap.csv`, `o2_inside_w10.csv`, `portfolio_expected.csv` |

**Caveats.**
- **Options are model-priced**, on track 14's synthetic surface calibrated to 1-month CBOE indices; they are not traded prices.
  - For 90–120 DTE it re-uses the 21–70 DTE smile shape and interpolates VIX3M–VIX6M (VIX6M is proxied before 2008).
  - The next-open proxy uses SPY's overnight return and the VIX open (1992+); the three 1990–91 O2 signals use the signal close for the overnight step.
- **Samples are tiny:** W10 has 18–21 trades after 1990, O2 has 26 trades in 12 episodes, W8 has 8–10 priced events, and W9 has 5.
- **The forward-drift figures are assumptions**, not estimates: 3–6% S&P total return at CAPE ≈41, T-bills 4.2%.
- **The portfolio simulation ignores** the drawdown governor, the caps, M2's cluster limits and W8. Its drawdowns are one historical path; the planning figures add a margin.
