# Historical replay of the growth book, 2014-11-24 → 2026-09-28 (Phase C3)

Design v4 (`research/00-SYSTEM-DESIGN-v4.md`) Appendix A.5: the growth book run through the **real pipeline** day by
day with the production config (`growth.enabled: true`, the $80k IRA with limited margin on, the v4 module statuses),
reconciled against track 38's real path (`research/code/38-growth-book/results/`). `scripts/replay.py` is the Phase A
harness (`docs/phase-b/replay.md`) extended for the book; the CSVs are in `research/code/39-growth-replay/`.

Two full replays were run: the first with the code as merged from Phase C1, which found the two bugs below; the
second with the fixes. Both are reported.

## Results at a glance (the first replay: the Phase C1 code as merged)

| | |
|---|---|
| Window | 2014-11-24 → 2026-09-28 in one segment: 3,851 runs (3,091 weekday runs, 618 Sundays, 142 month-ends), `init` on 2014-11-24 |
| Runtime | 42.2 min on one core: 0.64 s per daily run on average, 1.26 s at the end (the ledger check re-hashes every record on every run; 18,137 records at the end). The second replay ran at the same pace |
| Run statuses | 3,737 `ok`, 114 `no_session`, 0 exceptions, 0 `data_missing` |
| Look-ahead | 0 rows served after a run date. The cut / no-cut pair over 2021-01-03 → 2021-06-27 (26 Sundays, 156 runs) made identical decisions (486 decision records, the Sunday `growth_decision`, `governor` and `order_set` records included) although 1,347 provider calls returned future rows without the cut |
| Alerts (kept in the state: the last 400 days) | `data` 330 (the option shadow books have no VIX3M in the replay, one a session), `circuit` 6, `fill` 3 (the two W10 cancellations below and one partial fill) |
| v3.3 modules | orders queued: M1 0, M2 0, M3 0, M4 0, W8 0, W9 0; recommendations blocked at `emit`: 0 (each module stops earlier); shadow books: ST-1 50 trades, ST-1b 105, M2 142 monthly records |
| Emails (daily and monthly; the Sunday email is C2's renderer) | 146: 142 MONTHLY, 4 EXIT (W10's 90-day exits); 0 validator errors |
| Fills | 258; 2 orders cancelled (the W10 buys of 27 June 2016 and 8 September 2020, finding 1) |
| Ledger | the hash chain verifies (18,137 records) |
| NAV | $100,000 → $1,812,551 (the IRA $80,000 → $1,760,000); SPY +377% over the same window |

**The book vs track 38** (`book_vs_track38.csv`; CAGR with track 38's 252-session convention; the reference books are
rebuilt from the same bars, see Method).

| Book | Start → end | CAGR | Vol | Worst drawdown | Worst day |
|---|---|---|---|---|---|
| Pipeline: the IRA (the book), from track 38's start | 2015-04-07 → 2026-09-28 | **31.4%** | 21.3% | **−24.5%** (2020-02-19 → 2020-04-21) | −8.9% on 2024-08-05 |
| Pipeline: the IRA, whole window | 2014-11-24 → 2026-09-28 | 30.3% | 21.1% | −24.5% | −8.9% on 2024-08-05 |
| Pipeline: IRA + taxable (what the governor sees) | 2015-04-07 → 2026-09-28 | 29.0% | 20.0% | −23.4% | −8.8% on 2024-08-05 |
| SPY total return (replay marks) | 2015-04-07 → 2026-09-28 | 14.0% | 17.6% | −33.7% (2020-02-19 → 2020-03-23) | −10.9% on 2020-03-16 |
| Reference: daily-rebalanced, band-free weekly rules (track 38's simulation), no gems | 2015-04-07 → 2026-09-28 | 31.7% | 20.5% | −22.2% (2017-12-18 → 2018-04-02) | −7.2% on 2024-08-05 |
| Reference: daily-rebalanced, the 2% band, no gems | 2015-04-07 → 2026-09-28 | 31.4% | 20.6% | −22.2% | −7.2% on 2024-08-05 |
| Reference: the 2% band and G2's vol cut, no gems | 2015-04-07 → 2026-09-28 | 30.9% | 20.1% | −21.9% (2020-02-19 → 2020-04-21) | −7.2% on 2024-08-05 |
| Reference: the 2% band and the D40 governor, no gems | 2015-04-07 → 2026-09-28 | 31.2% | 20.5% | −21.6% (2020-02-19 → 2020-03-16) | −7.2% on 2024-08-05 |
| Reference: the band, the vol cut and the governor (the pipeline's rules), no gems | 2015-04-07 → 2026-09-28 | 30.8% | 20.0% | −21.6% | −7.2% on 2024-08-05 |
| Track 38: 2x 50% + BTC 30% + gems 15% (hist) | 2015-04-07 → 2026-09-28 | **35.9%** | 20.4% | **−21.9%** | −7.4% on 2020-09-03 |
| Track 38: SPY | 2014-11-25 → 2026-09-28 | 13.6% | 17.6% | −33.8% | −12.0% on 2020-03-16 |

- **CAGR:** pipeline − track 38 = −4.5 points, of which the gems stream (an estimate the pipeline holds as SGOV) is
  about +3.7 to +4.4 points on track 38's side: the band-free reference on the same bars without gems makes 31.7%,
  so **pipeline − like-for-like reference = −0.3 points** (−0.1 against the band reference, +0.1 against the band
  plus the governor, +0.6 against the reference with the pipeline's own rules, the vol cut included). Within A.5's
  1 point once the stated differences are removed. (This first replay was helped by finding 2: its two-source
  failures kept G2 in through 2017's whipsaw weeks and skipped 25 of the vol-cut Sundays; the second replay below
  is the honest number.)
- **Worst drawdown:** −24.5% against −21.9%: **−2.6 points, within the 3-point tolerance.** The pipeline's worst
  drawdown is the Covid one (Feb–Apr 2020, the governor at 0.70 slowed the recovery by a week); the references'
  is the 2018 Bitcoin bear (Dec 2017 → Apr 2018, −22.2%), which the pipeline rode at −21.4%.
- **Worst day:** −8.9% on 5 August 2024 against track 38's −7.4% on 3 September 2020. On the same bars the
  daily-rebalanced references also have 5 August 2024 as their worst day (−7.2%); the pipeline lost more because
  weekly band rebalancing had let IBIT and QLD drift above their targets in the rally before it. Track 38's IBIT
  model (Yahoo's daily series with the Monday-old share) has 3 September 2020 instead.

**Calendar years** (`calendar_years.csv`).

| Year | Pipeline (IRA) | Ref. band-free | Ref. band | Ref. band + gov. | Track 38 book | SPY (replay) | Track 38 SPY |
|---|---|---|---|---|---|---|---|
| 2014 (from 24 Nov) | −1.1% | −0.9% | −0.9% | −0.9% |  | −0.3% | +13.6% |
| 2015 | +8.1% | +15.4% | +14.3% | +14.3% | +9.4% | +1.2% | +1.3% |
| 2016 | +32.8% | +34.0% | +29.7% | +29.7% | +33.5% | +12.0% | +11.8% |
| 2017 | +158.7% | +182.9% | +182.9% | +182.9% | +172.8% | +21.7% | +21.7% |
| 2018 | −3.3% | −11.5% | −11.5% | −11.7% | −1.1% | −4.6% | −4.5% |
| 2019 | +37.9% | +31.1% | +38.2% | +37.8% | +31.5% | +31.2% | +31.4% |
| 2020 | +50.4% | +59.8% | +57.9% | +56.3% | +89.1% | +18.3% | +18.3% |
| 2021 | +55.6% | +49.6% | +49.6% | +49.6% | +55.4% | +28.7% | +28.6% |
| 2022 | −10.2% | −9.9% | −9.1% | −9.1% | −10.2% | −18.2% | −18.2% |
| 2023 | +40.5% | +35.9% | +35.7% | +35.4% | +33.7% | +26.2% | +26.2% |
| 2024 | +37.1% | +34.2% | +34.2% | +34.2% | +40.2% | +24.9% | +24.9% |
| 2025 | +4.4% | +7.0% | +7.0% | +7.0% | +13.1% | +17.7% | +17.8% |
| 2026 to 28 Sep | +10.4% | +11.7% | +8.5% | +8.5% | +15.6% | +13.2% | +13.1% |

Twelve years compared with track 38, the same sign in all twelve; mean difference −5.1 points; the largest gap is
2020 (+50.4% against +89.1%): track 38's gems stream adds its crash bonus in the 60 sessions after the March 2020
trough, its daily rebalancing kept buying the Bitcoin rally, and the pipeline's governor ran at 0.70–0.82 from
22 March to 10 May 2020 (the band-plus-governor reference makes +56.3%). 2018 is the other way (−3.3% against
−1.1% for track 38 and −11.5% for the references): the pipeline's two-source failures kept G2 out of part of the
2018 Bitcoin bear by accident.

**G2's switches, G1's switches, orders per email, the governor** (`g2_switches.csv`, `sundays.csv`,
`orders_and_governor_by_year.csv`).

| | Pipeline | Reference / expected |
|---|---|---|
| G2 Sundays decided | 600 (of 618: the first 18 lack 200 daily closes) | |
| G2 weeks on | 50.2% | track 38: 48%; the rule on the same data: 48.7% |
| G2 switches a year | 5.5 | the rule on the same data (band-free, no two-source check): 6.0; track 38: 6.2 |
| G2 switch events matched within a week / extra / missed | **65 / 0 / 6**; every match on the same Sunday | the 6 missed are short on-off pairs swallowed by two-source failures |
| G2 weeks in the same state as the rule | 591 of 600 | |
| G2 Sundays with no signal | 120: 102 two-source failures (finding 2), 18 without 200 closes | |
| G2 vol cut in force | 55 Sundays (the 2017–18 and 2021 spikes) | not in track 38's simulation |
| G1 SSO switches a year, 2% band / band-free | 1.2 / 2.9; in 79.8% of weeks | track 26: about 1.1 with the band, 3 without |
| G1 QLD switches a year, 2% band / band-free | 1.4 / 2.0; in 81.7% of weeks | |
| Sundays with orders | 125 of 618: **10.6 a year** | A.5: about 13 a year |
| Orders in one email, max | **3** (256 orders in all; 7 Sundays with a deferred order; 1 W10 buy dropped) | 3 |
| Hard stop fired | **never** | 0 |
| Sundays with G < 1 / lowest G | 28 / **0.70 on 22 March 2020** (drawdown 22.9% on IRA + taxable) | the reference book alone: 0.78 |
| Governor cuts / restores | cuts on 14 June 2020 (QLD $11,618, SSO $5,112, IBIT $1,450) and 12 March 2023; restores on 10 May 2020 (QLD, IBIT) and 19 March 2023 | |
| 2018 | G stayed 1.00: the deepest Friday drawdown was 13.6% (11 February 2018), under the 15% threshold; the legs exited by their rule on 28 October 2018 | |
| 2020 | G 0.70 at the low; 0.82 by 10 May; back to 1.00 on 21 June | |
| 2022 | G stayed 1.00: 13.9% on 27 February 2022; both legs had exited on 23 January and 20 February, G2 was off from 2 January | |
| 2025 | G 0.98 (15.5% on 6 April 2025), no order crossed a band | |

**By year** (`orders_and_governor_by_year.csv`).

| Year | Sundays | With orders | Orders | Deferred | Lowest G | Deepest drawdown |
|---|---|---|---|---|---|---|
| 2014 | 5 | 1 | 3 | 0 | 1.00 | 2.4% |
| 2015 | 52 | 6 | 13 | 0 | 1.00 | 13.6% |
| 2016 | 52 | 13 | 27 | 1 | 1.00 | 8.7% |
| 2017 | 53 | 11 | 20 | 0 | 1.00 | 9.0% |
| 2018 | 52 | 5 | 9 | 0 | 1.00 | 13.6% |
| 2019 | 52 | 9 | 19 | 0 | 1.00 | 12.2% |
| 2020 | 52 | 20 | 43 | 3 | 0.70 | 22.9% |
| 2021 | 52 | 13 | 25 | 0 | 1.00 | 9.5% |
| 2022 | 52 | 2 | 3 | 0 | 1.00 | 13.9% |
| 2023 | 53 | 13 | 27 | 2 | 0.90 | 17.7% |
| 2024 | 52 | 12 | 24 | 0 | 0.94 | 16.5% |
| 2025 | 52 | 17 | 35 | 1 | 0.98 | 15.5% |
| 2026 | 39 | 3 | 8 | 0 | 1.00 | 10.1% |

## The second replay: with the fixes (`research/code/39-growth-replay/`, the root files)

The same window and config with finding 1 fixed and the 2% tolerance of finding 2 (41.9 min, 3,851 runs, 3,737 `ok`,
114 `no_session`, 0 exceptions; 18,149 records, the chain verifies; 0 rows served after a run date; the same
look-ahead pair). What changed:

| | First replay (C1 code) | Second replay (fixed) | Reference / expected |
|---|---|---|---|
| The book (IRA) from 2015-04-07: CAGR | 31.4% | **30.0%** | track 38 35.9% (with gems); the reference with the pipeline's rules, no gems: 30.8% |
| Worst drawdown | −24.5% | **−24.5%** (2020-02-19 → 2020-04-21) | track 38 −21.9%: −2.6 points, within 3 |
| Worst day | −8.9% on 2024-08-05 | −8.9% on 2024-08-05 | track 38 −7.4% on 2020-09-03 (see above) |
| CAGR, pipeline − reference band-free / band / band + vol cut / band + governor / all three | −0.3 / −0.1 / +0.4 / +0.1 / +0.6 | −1.7 / −1.4 / −0.9 / −1.2 / **−0.8** | within 1 point against the pipeline's own rules |
| G2 switch events matched within a week / extra / missed | 65 / 0 / 6 | **71 / 0 / 0** | the rule on the same data: 71 events, 6.0 a year; track 38: 6.2 |
| G2 weeks in the rule's state | 591 of 600 | **600 of 600** | |
| G2 weeks on | 50.2% | 48.7% | track 38: 48% |
| Bitcoin two-source failures (Sundays) | 102 | **13** (all 2017–2019, the largest gaps) | |
| G2 vol cut in force (Sundays) | 55 | 76 | the rule on the same data: 80 |
| W10 buys cancelled | 2 | **0** (5 W10 trades, 5 EXIT emails) | |
| Sundays with orders / orders / max in one email | 125 / 256 / 3 | 127 (10.7 a year) / 263 / **3** | A.5: about 13 a year; 3 |
| Lowest G / deepest Friday drawdown seen | 0.70 / 22.9% | 0.71 / 22.8% (22 March 2020) | |
| Governor cuts / restores | 14 Jun 2020, 12 Mar 2023 / 10 May 2020, 19 Mar 2023 | the same Sundays | |
| Hard stop | never | **never** | 0 |
| NAV at the end (IRA + taxable) | $1,812,551 | $1,650,801 | |

Calendar years of the second replay (`calendar_years.csv`):

| Year | Pipeline (IRA) | Ref. band + vol cut + gov. | Ref. band-free | Track 38 book | SPY (replay) |
|---|---|---|---|---|---|
| 2015 | +8.1% | +14.3% | +15.4% | +9.4% | +1.2% |
| 2016 | +33.4% | +29.7% | +34.0% | +33.5% | +12.0% |
| 2017 | +132.1% | +138.6% | +182.9% | +172.8% | +21.7% |
| 2018 | −4.5% | −8.9% | −11.5% | −1.1% | −4.6% |
| 2019 | +37.9% | +37.8% | +31.1% | +31.5% | +31.2% |
| 2020 | +50.3% | +56.3% | +59.8% | +89.1% | +18.3% |
| 2021 | +55.6% | +49.4% | +49.6% | +55.4% | +28.7% |
| 2022 | −10.2% | −9.1% | −9.9% | −10.2% | −18.2% |
| 2023 | +40.5% | +35.4% | +35.9% | +33.7% | +26.2% |
| 2024 | +37.1% | +34.2% | +34.2% | +40.2% | +24.9% |
| 2025 | +4.4% | +7.0% | +7.0% | +13.1% | +17.7% |
| 2026 to 28 Sep | +10.4% | +8.5% | +11.7% | +15.6% | +13.2% |

- The second replay is 1.4 points a year below the first because it follows the rules exactly: **G2's vol cut** (a
  designed rule, track 28 §9, absent from track 38's simulation) ran for most of 2017's rally (Bitcoin's 60-day
  volatility stayed above 70% for a quarter), holding IBIT at 20% instead of 30%: 2017 makes +132% against +183% for
  the band-free reference and +139% for the reference with the vol cut. The first replay's two-source failures had
  skipped 25 of those vol readings and kept G2 in through the whipsaw weeks the rule would have sat out.
- Against the reference with the pipeline's own rules (band, vol cut, governor) the pipeline is **−0.8 points a
  year**: weekly band rebalancing instead of daily (it let IBIT and QLD run above target into 5 August 2024, the
  −8.9% day), 3 bp slippage on the funds, the three-order cut and the deferred SGOV buys (7 Sundays), and the 13
  remaining two-source failures.
- Against track 38's published book the gap is −5.8 points, of which about 4 is the gems estimate, 1 the vol cut and
  the rest the items above; the worst drawdown is 2.6 points deeper and the worst day is a different day.

## What the replay found and what was fixed

### 1. The SGOV sweep took W10's cash (fixed: `traderec/growth/orders.py`)

- **Where.** `orders.build_order_set` listed Step 2 as "the G1 legs, G2, SGOV, W10 last". The SGOV buy of the idle
  cash is sized at the cash left after every other buy, so any buy queued after it finds no cash.
- **Failing scenario.** 24 June 2016 (Brexit): W10 fired (−3.6%). The Sunday job of 26 June queued "Buy SPY $5,504"
  (W10) and "Buy SGOV $X" (the sweep) with the sweep ahead of W10. On Monday the paper broker filled the sweep first
  and cancelled W10: `buy of $5,503.79 exceeds 90% of the $5,356.29 available`. Live, an SGOV market buy placed before
  W10's would do the same.
- **Fix.** The sweep is listed and queued after W10 (`tests/test_growth_daily.py::test_the_sgov_sweep_is_listed_and_queued_after_w10_so_w10_keeps_its_cash`,
  and the end-to-end W10 test). `docs/phase-c/growth.md` §2 updated.

### 2. The Bitcoin two-source tolerance was too tight (changed: `config/constitution.yaml`)

- **Where.** `growth.sleeves.G2.signal.two_source_tolerance` (a Phase C1 key) was 0.5%. The Sunday close from Coinbase
  (`btc_daily_utc`) is checked against Yahoo's BTC-USD bar for that UTC day (the live fallback, since the quote
  sources know today only).
- **Evidence** (`research/code/39-growth-replay/` and the cache; 509 Sundays with both sources, 2017–2026): the median
  gap is 0.08%, the 90th percentile 1.06%, the 99th 2.64%, the largest 3.69% (17 September 2017). At 0.5% the check
  **failed on 102 Sundays (20%; 68% of the Sundays of 2017)**, at 1% on 53 (10%), at 2% on 13 (2.6%, all 2017–2019),
  at 3% on 5. Since 2020 the largest gap is 0.93%.
- **Effect.** Every failure keeps G2's state for a week (fail closed), so switches lagged the rule by a week or more
  during 2017–2019: in the first replay 96 of the 286 Sundays to May 2020 failed.
- **Change.** 2%: it passes 97% of the historical Sundays and every one since 2020, and still catches a wrong print
  (a wrong or stale close is off by far more). Recorded as an interpretation (Appendix B style, below).

### 3. Checked and clean

- **Look-ahead.** The main replay served no row after a run date. The pair of replays over 2021-01-03 → 2021-06-27
  (26 Sundays), one with the as-of cut and one with full histories on offer, made the same 486 decision records
  (recommendations, orders, fills, signals, marks, shadow records and the Sunday `growth_decision`, `governor` and
  `order_set` records) although 1,347 provider calls returned future rows without the cut: the pipeline and the
  Sunday job cut at the run date themselves (`Run.bars`, `g2_signal` on `asof_utc`). `tests/test_replay.py` checks
  the same on the synthetic market with the growth book on.
- **Orders per email.** Never above 3 in either replay (the `order_set` records): 256 orders on 125 of 618 Sundays
  in the first, 263 on 127 in the second, 10.6–10.7 Sundays with orders a year against A.5's "about 13" (the 25%
  band keeps resizes rare: 7 Sundays with a deferred order, 1 W10 buy dropped).
- **The hard stop** never fired: the deepest Friday drawdown the governor saw was 22.9% on 22 March 2020 (IRA +
  taxable; 24.5% on the IRA alone). The governor cut size to 0.70 then, restored it by 21 June 2020, and cut once
  more in March 2023 (G 0.90); it did nothing in 2018 (13.6%), 2022 (13.9%: the legs and G2 were already out by the
  rule) or 2025 (15.5%, G 0.98, no order crossed a band).
- **Module statuses.** No order and no email from M1, M2, M3, M4, W8 or W9 in either replay; the ST-1, ST-1b, M2
  monthly, M4 twin and the other shadow books kept logging (`summary.csv`, section `shadow`).
- **Ledger.** The hash chain verifies at the end of both replays.

## Part 1: the daily run under the growth book (`traderec/pipeline.py`)

| Change | Where | What |
|---|---|---|
| Statuses enforced | `growth.module_trades`, `Run.emit` | With the book on, a module whose status is `shadow`, `retired` or `superseded_by: …` places no orders and sends no emails: `emit` turns its would-be recommendation into a `shadow` record (`event: blocked_by_status`). An `EXIT` / `SWITCH_OFF` of a position the module still holds goes through, so nothing is stranded. With the book off, nothing changes |
| M1 | `_m1`, `_shadow` | Returns before the daily check; "ST-1 keeps logging": M1's own rule runs as a shadow book (`state.shadow.ST1`, next to ST-1b; entries at the next open with slippage, M1's exit rule) |
| M2 | `_m2_decide` | The monthly decision is logged (`signal` and a `shadow` `monthly_targets` record: the shadow series), nothing is sent or deferred |
| M3 | `_m3` | Skipped while `growth.supersedes_m3` (the daily catch-up would buy a 3% lot beside G2's) |
| M4, W8, W9 | `runners/m4.py`, `runners/macro.py` | No entries (M4 logs `signal_while_shadow`; the twin keeps running; W8/W9 make no veto call); exits of open spreads still run |
| W10 | `_w10` | A confirmed signal is recorded as `state.modules.W10.fired = {signal_date, ret, close, prev_close, sma_prev, second_source}` (and a `signal` record, `check: fired`) for the Sunday job; the 90-day exit stays daily. Book off: unchanged |
| Cancel alert | `_on_cancel`, `_cancel_reason` | The `fill` alert and the `correction` record carry the broker's `cancel_reason` (the 90% cap, no lot, no open) |

Tests: `tests/test_growth_daily.py` (11) and the growth-book replay test in `tests/test_replay.py`. `tests/test_m4.py`
and `tests/test_w8w9.py` now pin the v3.3 book (`growth.with_enabled(cfg, False)`) as `test_pipeline.py` does, since
their modules are shadow under v4; `tests/test_reports.py`'s annual hurdle line is pinned to the v4 statuses (it had
been failing since the C1 config change: `reports.module_statuses` reads the `status` keys).

## Interpretations (design Appendix B style)

| Where | The design says | Built as | Why |
|---|---|---|---|
| §3 statuses | shadow / retired / superseded modules | entries blocked at `Run.emit`; exits of a held position allowed | a paper position must never be stranded; none exists at go-live |
| §3 M1 "ST-1 keeps logging" | — | M1's rule as a shadow book with ST-1b's mechanics | the only cheap way to keep a scored record |
| §3 G2 two-source | "as for M3" | tolerance 2% (was C1's 0.5%) on the Sunday close vs Yahoo's bar | venue basis at 00:00 UTC (above); a wrong print is far larger |
| §3a.3 the SGOV buy | "then the SGOV buy, then W10" (the ranking) | ranked before W10 for the cut, listed and queued after it | it is sized at the cash left after every other buy |
| A.5 the book | "the book from 7 April 2015" | the IRA's equity (100% of the book); the governor's drawdown on IRA + taxable | §4 sleeves are % of the IRA; §3 governor is on both accounts |
| A.5 second sources | "as the Phase A replay" | SPY, ^GSPC, ^NDX echoed (flagged); BTC-USD from Yahoo's bar, as live | ^NDX has no FRED history; Yahoo is the live BTC fallback |
| A.5 IBIT before 2024 | the Phase A proxy | Coinbase hourly candles from 2015-07-20; before that Yahoo's UTC daily bars (211 sessions) | Coinbase has no earlier candles |
| A.5 Bitcoin before 2017 | — | Yahoo BTC-USD per UTC day (837 days) before Coinbase's first daily candle | the same series the second source uses; the 200-day average needs it |

## Method

- **Data** (`fetch`): the Phase A series plus SSO, QLD, ^NDX, SGOV (yfinance, real bars from 2006-06-21; SGOV from
  2020-06-01, which the pipeline never reads since the vehicle fills and is valued at par) and Coinbase's hourly candles
  from 2015-07-20 for the IBIT proxy; the cache is `/tmp/traderec-replay-cache`. Everything is served as of each run by
  `AsOfProvider` (bars and ^VIX ≤ the run date, Bitcoin ≤ the run date's UTC day, the T-bill rate from the prior print).
- **Runs**: `run_init` on 2014-11-24, then daily Monday–Friday (22:17 ET), weekly on Sundays (the Sunday job of
  `traderec/growth/weekly.py`, then the fills at Monday's open in the daily run), monthly on the 1st: 3,851 runs.
- **The book**: G1's first decision is band-free (both legs in on 30 Nov 2014); G2 needs 200 daily closes and 10
  weekly closes, so its first signal is 5 April 2015 (track 38's book starts 7 April); the reconciliation window is
  2015-04-07 → 2026-09-28.
- **Reference books** (`reference_books`): to separate the rules from the data, three track-38-style books are rebuilt
  from the same bars the pipeline used (SSO, QLD, the IBIT proxy, T-bills): daily-rebalanced 25/25/30/20 with the
  weekly rules switched at Monday's open, (a) band-free as track 38 simulated, (b) with the 2% band, (c) with the band
  and the D40 governor on the book's own Friday drawdown. No gems stream: track 38's "2x 50% + BTC 30% + gems 15%"
  includes a synthetic gems estimate worth +3.7 points a year in history (`research/code/38-growth-book/README.md`),
  which the pipeline holds as SGOV.
- **Expected differences** from track 38, in order of size: the gems stream (about +3.7 points a year for track 38);
  G2's vol cut (design §3 G2, not in track 38's simulation: about −0.5 points, most of it in 2017); the 2% band and
  weekly band rebalancing (the pipeline) against band-free daily rebalancing (track 38); the governor (none in
  track 38's real path; about −0.2 points); fill slippage (3 bp), the 90% queued-cash rule, the three-order cut and
  the deferred SGOV buys; the IBIT proxy (no fee drag) against track 38's IBIT-cost model; two-source failures.

## How to run

```
python scripts/replay.py fetch            --cache /tmp/traderec-replay-cache                       # ~2 min
python scripts/replay.py run              --cache ... --work /tmp/traderec-replay-growth --start 2014-11-24 --end 2026-09-28
python scripts/replay.py run              --cache ... --work /tmp/traderec-replay-la-cut   --start 2021-01-03 --end 2021-06-27
python scripts/replay.py run              --cache ... --work /tmp/traderec-replay-la-nocut --start 2021-01-03 --end 2021-06-27 --no-cut
python scripts/replay.py reconcile-growth --cache ... --work /tmp/traderec-replay-growth --out research/code/39-growth-replay \
                                          --lookahead /tmp/traderec-replay-la-cut /tmp/traderec-replay-la-nocut
```

## What remains

- **The 1986–2026 G1-only replay with proxy fund bars** (A.5's second item) was not run: the main replay took the
  time budget.
- **A historical second source for ^NDX** (Nasdaq's index history) would let `--second-source history` cover the
  book; today it covers SPY and ^GSPC only, so the book's replay uses the echo for the index closes.
- **The annual report's hurdle line** (`reports.module_statuses`, `emails.render_annual`) now names the v4 statuses
  as "not policy modules", W10 and the growth book included; the integrator should decide how the report describes
  the v4 book (C2's file).
- **The governor's drawdown** is on IRA + taxable, and the paper taxable account is T-bill cash (C1's interpretation
  of the $20k VOO), so the governor sees roughly 80% of the book's drawdown. Track 38's governor was on the book
  alone. With VOO bars in the paper broker it would see more.
- **Live, unverified:** `LiveProvider.second_source_close("BTC-USD", sunday)` on a Sunday night; the pipeline falls
  back to Yahoo's bar when it returns nothing or a mismatched date.

## Files in `research/code/39-growth-replay/`

| File | What |
|---|---|
| `summary.csv` | every metric in this document, by section (the root files are the second replay; `first-replay/` holds the same files for the first) |
| `book_vs_track38.csv` | the book (IRA), IRA + taxable, SPY, the three reference books and track 38's rows: CAGR, volatility, worst drawdown, worst day |
| `calendar_years.csv` | calendar-year returns: pipeline (IRA, total), SPY, the reference books, track 38 |
| `g2_switches.csv`, `sundays.csv` | G2's state per Sunday vs the rule on the same data; every Sunday's decision, governor and order set |
| `orders_and_governor_by_year.csv` | Sundays with orders, orders, deferred, lowest G and deepest drawdown per year |
| `alerts_by_kind.csv`, `nav_monthly.csv` | alerts; month-end IRA, total NAV and SPY |
