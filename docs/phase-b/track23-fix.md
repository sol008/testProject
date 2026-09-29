# Track 23 fix: W10's calendar-exact exits are priced at the open

The historical replay (`docs/phase-b/replay.md`, finding 3) found that track 23 priced W10's calendar-exact exits at
the **close**. The design (§3 W10), the track 23 labels and `common23.py`'s own docstring all say the **open**, and
the pipeline sells at the open. This note records the fix, the re-run, the corrected numbers and where they were
propagated.

## 1. The bug and the fix

- **Where.** `research/code/23-duration-verify/common23.py` picked the price field with `rule.startswith("C")`:
  - `trade_returns`: the exit price (line 311) and the T-bill span (line 314);
  - `mae`: the interim path (lines 329 and 331).
- **Why it was wrong.**
  - The test was meant for the `C<H>` reconciliation rules, which sell at the close of session H.
  - `"CAL90".startswith("C")` is true, so every SPY `CAL60/90/120` exit was priced at the adjusted close of the exit
    session, with one more session of T-bills and the interim path ending at that close.
  - The exit **dates** were right: `exit_positions` tests `"CAL"` first.
- **Same pattern, second place.** `s2_w10_rules.py:30` (`calendar_spans`) counted every calendar-exact hold one
  session too long, as if it were held to the close.
- **Fix.**
  - A new `common23.close_exit(rule)` is true only for `C<H>` (`rule[:1] == "C" and rule[1:].isdigit()`).
  - `exit_positions`, `trade_returns`, `mae` and `s2_w10_rules.calendar_spans` all use it.
- **Other research code.** Every prefix test and exit-price choice in `research/code/` was reviewed; there are no
  other instances.
  - Tracks 21 and 22 choose exit prices with exact tests (`mode == "open"` / `"close"`), and track 24 reuses them.
  - The remaining prefix tests cannot collide: track 15's `MA`/`TSMOM`/`WMA`, track 24's `cap`/`KF`, and track 16's
    `f` windows.
  - No track imports track 23's code or reads its outputs, so only track 23 was re-run (`run_all.py`, 25 s).
- **Check.**
  - The unmodified code first reproduced the committed results byte for byte, so every difference comes from the fix.
  - After the fix, the 17 CAL90 trades equal the replay's independent re-pricing at the open
    (`research/code/25-replay/w10_track23_cal90_repriced_open.csv`) to within 5×10⁻⁶.
  - The index samples (1928–2026, 1990–2026) are bit-identical. They enter and exit at the close by design.
  - Also identical: every `F<H>` and `C<H>` cell, the reconciliation with tracks 17–22, the sizing and stress
    tables, the kill-switch power table and the daily streams. The streams already sold W10 at the open, so no
    backtest or drawdown moves.

## 2. Before and after (SPY 1993–2026)

| | Published (close exit) | Corrected (open exit) |
|---|---|---|
| **CAL90, one at a time (17 trades): win rate** | 88% | 88% |
| Mean / median | +7.19% / +7.66% | **+7.56% / +8.70%** |
| Worst trade (Feb 2020 entry) | −8.28% | **−8.55%** |
| Worst interim loss | −30.8% | −30.8% |
| Edge vs era placebo (p_era) | +4.54 (0.020) | +4.91 (0.012) |
| Edge vs uptrend placebo (p_up) | +4.03 (0.005) | +4.41 (0.002) |
| Edge per episode (t) | +4.8 (2.4) | +4.9 (2.5) |
| 2008–2026 only: edge (p_era) | +2.6 (0.31) | +3.2 (0.21) |
| **CAL90, all 20 events: mean vs placebo** | +6.86% vs +2.67% | +7.26% vs +2.67% |
| p_era / p_up / cluster-preserving p | 0.019 / 0.005 / 0.008 | 0.011 / 0.002 / 0.001 |
| Deflated-Sharpe probability at N 8 / 24 / 120 / 3,300 | 0.77 / 0.62 / 0.42 / 0.16 | 0.79 / 0.64 / 0.45 / 0.18 |
| CAL90 minus F63, per trade | −0.05 (t −0.2) | +0.34 (t 1.0) |
| Sessions held, CAL60 / CAL90 / CAL120 | 38–45 / 59–64 / 79–86 | 37–44 / 58–63 / 78–85 |
| **CAL60**, all events: mean (p_era) | +3.81% (0.17) | +3.72% (0.19) |
| CAL60, one at a time: mean (p_era) | +3.09% (0.39) | +3.04% (0.41) |
| **CAL120**, one at a time: mean, worst (p_era) | +7.81%, −5.2% (0.086) | +8.06%, −3.4% (0.068) |
| **W10 contribution, % of NAV a year, central (low to high)** | | |
| 60 days (if run) | +0.014 (−0.006 to +0.041) | +0.014 (−0.006 to +0.040) |
| 90 days | +0.042 (−0.008 to +0.101) | +0.042 (−0.008 to +0.107) |
| 120 days | +0.046 (−0.010 to +0.088) | +0.046 (−0.010 to +0.091) |
| **Phase A book (M1, M2, M3, W10) at 60 / 90 / 120 days** | 4.98 / 5.02 / 5.03% | 4.98 / 5.02 / 5.03% |
| Phase A + M2 range at 90 days | −0.26 to +1.90 | −0.26 to +1.91 |
| W10 P&L kept, Phase B cluster (first come, first served) | 85% | 86% |

The central contribution and the book do not move. The central uses κ 0.5 on the 1928–2026 index edge, and the low
uses "edge gone" on the index. Only the high end uses the SPY mean.

## 3. Where the numbers were updated

| File | What changed |
|---|---|
| `research/code/23-duration-verify/common23.py`, `s2_w10_rules.py` | The fix |
| `research/code/23-duration-verify/results/*.csv` | Re-run: 22 of 40 files changed. The rest are identical, including every `portfolio_history_*`, `portfolio_crisis_*` and stream file |
| `research/23-duration-cap-verification.md` | A "Correction (replay, Phase B)" section; every SPY CAL cell in the TL;DR and §1.1–§5 |
| `research/00-SYSTEM-DESIGN-v3.md` | §3 "W10" (58–63 sessions; mean +7.6%, worst −8.6%; range to +0.11; deflated Sharpe 0.45–0.64), §6 (the W10 row) and a correction note in Appendix B. §0 and §11 carry no affected number |
| `research/24-duration-cap-gap-search.md` §4.2 | W10's range (−0.01 to +0.11) |
| `config/constitution.yaml` `modules.W10` | `base_rates`: `mean_pct` 7.2 → 7.6, `worst_pct` −8.3 → −8.6, `planning_mean_pct` 3.6 → 3.8 (half the mean). `win_rate` 0.88, `placebo_mean_pct` 2.7 and `worst_interim_pct` −31 are unchanged |
| `tests/test_emails.py` | The W10 fixture, which mirrors `base_rates`, and the three sentences it asserts |

**`forecasts.p_profit` stays 0.72.**
- The shrinkage, now written next to it: SPY 1993–2026's win rate (0.88, 15 of 17) is replaced by the full-history
  rate, CAL90 one at a time on the S&P 500 total return 1928–2026 (34 of 47 = 0.72). That history includes the
  pre-1990 era, where the edge is absent.
- Neither input moved. The index samples are unaffected, and SPY still wins 15 of 17.

## 4. Decision 12

**The conclusion holds: a 90-day exception for W10 (and, in Phase B, M4), and 120 days rejected.**
- **90 days, W10.** The correction makes the case slightly stronger: edge +4.9 points, p 0.012, one at a time. The
  planning central is unchanged at +0.04 points a year. It still fails every Bonferroni bar (t 2.51 against 2.73 at
  N = 8), so it stays a policy bet.
- **120 days.** It adds nothing over 90: +0.046 vs +0.042 central, as before. The SPY-based figures favour 90 by more
  than before (+0.077 vs +0.056 on the SPY edge). W10 still fires less often at 120 (0.42 vs 0.51 trades a year), and
  the 2000–02 drawdown is still deeper.
- **60 days.** W10 is slightly weaker (+3.0%, p 0.41 one at a time), so W10 stays in shadow under a 60-day cap.
- **M4** is unaffected (track 21's model prices).

## 5. Not changed here (other owners)

- **`traderec/reports.py:136–140`, `W10_RECORD_REFERENCE`** holds the close-exit SPY all-events figures, which feed
  the annual W10 review.
  - 60 days: `mean_pct` 3.81 → **3.72**, `placebo_mean_pct` 1.77 → **1.78**.
  - 90 days: `mean_pct` 6.86 → **7.26**, `placebo_mean_pct` 2.66 → **2.67**.
  - Win rates are unchanged (0.75, 0.90).
  - `docs/phase-b/reports.md:58` quotes the same numbers.
- **`docs/phase-b/replay.md` finding 3** said "pending the re-run". The re-run confirms mean +7.6% and worst −8.6%.
- **The replay's reconciliation CSVs** (`w10_vs_track23_cal90.csv`, `shadow_w10_vs_track23.csv` in
  `research/code/25-replay/`) compare with the old published list. The next `scripts/replay.py` run reads the new
  one, and the gaps should shrink to the re-priced residue (−0.10, −0.02, +0.01 points).
