# Historical replay of the growth book, 2014-11-24 → 2026-09-28 (Phase C3), and of the G1 legs alone, 1986–2026 (Phase C4b)

Design v4 (`research/00-SYSTEM-DESIGN-v4.md`) Appendix A.5: the growth book run through the **real pipeline** day by
day with the production config (`growth.enabled: true`, the $80k IRA with limited margin on, the v4 module statuses),
reconciled against track 38's real path (`research/code/38-growth-book/results/`). `scripts/replay.py` is the Phase A
harness (`docs/phase-b/replay.md`) extended for the book; the CSVs are in `research/code/39-growth-replay/`. Phase C4b
(the section "The 1986–2026 G1-only replay" below) adds A.5's second item: the G1 legs alone from 1986 on proxy fund
bars, with and without the governor, through 1987, 2000–02 and 2008.

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

**Correction (Phase C4b).** The reference books above were built by a helper that put the Sunday decision on
Tuesday's session, not Monday's (`states.reindex(sessions, ffill).shift(1)` on a Sunday-indexed series: the forward
fill alone lands on Monday). Fixed in `scripts/replay.py` (`_sleeve_returns`, `_governed`) while building the 1986
replay, where it mattered (the reference took Black Monday in full although its Friday signal had said exit). Re-run
on the second replay's work directory, the references switch at Monday's open and come out about 1.5 points a year
lower, so the pipeline (30.0%) is **above** its like-for-like reference, not below it:

| Reference (from 2015-04-07, no gems) | As published (Tuesday switch) | Corrected (Monday switch) | Pipeline − corrected |
|---|---|---|---|
| Band-free (track 38's simulation) | 31.7% | **30.1%**, worst drawdown −22.6% (2020-02-19 → 2020-03-16) | −0.1 points |
| The 2% band | 31.4% | 30.0%, −24.1% | +0.0 |
| The band and the vol cut | 30.9% | 29.6%, −24.1% | +0.4 |
| The band and the D40 governor | 31.2% | 29.6%, −23.1% | +0.5 |
| The band, the vol cut and the governor (the pipeline's rules) | 30.8% | **29.2%**, −23.1% | **+0.8** |

By calendar year the corrected band-free reference makes 2017 +155.7% (was +182.9%), 2018 −6.6% (was −11.5%),
2019 +32.4%, 2020 +59.1% and 2022 −12.2%; the pipeline's own rows and track 38's are unchanged. The root CSVs in
`research/code/39-growth-replay/` stay as published (the record of the C3 run); the corrected references are in
`research/code/39-growth-replay/g1-1986/c3_reference_corrected.csv`.

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
their modules are shadow under v4. `tests/test_reports.py`'s annual hurdle line names the policy modules by label
again: `reports.module_statuses` treats a v4 `status` value (shadow, retired, superseded_by, active) as the module's
lifecycle, not its label, and adds the growth book as a policy module while `growth.enabled` (fixed at integration).

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

## The 1986–2026 G1-only replay (Phase C4b)

Design v4 Appendix A.5, second item, and red-team item 3 (§13: "the bootstrap understates long bears"; the 2014–2026
replay never met one): the G1 legs alone through the real pipeline from 1986-07-01 to 2026-09-28 on proxy fund bars,
once without the governor and once with the production governor and hard stop, reconciled against track 38's
`real_path.csv`, `episodes.csv` and `calendar_years.csv` and against reference books rebuilt from the same bars. The
CSVs are in `research/code/39-growth-replay/g1-1986/`; the commands are at the end of this section.

### Results at a glance

| | |
|---|---|
| Window | 1986-07-01 → 2026-09-28, `init` on 1986-07-01: 13,080 runs each (10,500 weekday runs, 2,100 Sundays, 480 month-ends; 479 in the governed run, finding 3), in resumable chunks. Run 1 `--no-governor`, run 2 the production governor and hard stop |
| Compute | about **8 hours per replay** on one core (7.9 h without the governor, 8.0 h with it; a lower bound, the killed chunks being timed to their last progress line), the two in parallel; the wall clock was 13 hours with two container restarts. A run costs 0.03 s at the start, a daily run 0.46 s in 1990, 1.5 s in 2000, 2.5 s in 2010, about 3.2 s by 2019 and 5.5 s in 2026: every run re-verifies the whole ledger (43,500 records at the end), so a replay's time is quadratic in its length |
| Run statuses | 12,718 `ok`, 362 `no_session`, 0 exceptions, 0 `data_missing`, in both runs |
| Look-ahead | 0 rows served after a run date in either run. The cut / no-cut pair over 1987-06-01 → 1987-12-31 (30 Sundays, 190 runs, the governed config) made identical decisions (282 decision records) although 1,150 provider calls returned future rows without the cut |
| Data | every proxy flagged in `segment.json` and `summary.csv` (SSO and QLD before 2006-06-21, SPY before 1993-01-29); 10,887 second-source echoes (SPY, ^GSPC, ^NDX) |
| Emails | 2,678 (2,677 with the governor): 2,100 GROWTH (one every Sunday), 480 (479) MONTHLY, 98 RULE_E; 0 validator errors |
| Fills | 443 (448 with the governor); 23 orders cancelled, all "no position to sell" (finding 1); 76 distributions credited on the real funds |
| Ledger | the hash chain verifies: 43,497 records (43,509) |
| NAV | the IRA $80,000 → **$4,822,387** without the governor (×60, 10.7% a year) and **$4,646,522** with it (×58); SPY's total return ×73 (11.3% a year) at 18.5% volatility and a −55% drawdown against the book's 14% and −28% |

### The reference vs track 38 (1986-07-22 → 2026-09-28)

`book_vs_track38.csv`; CAGR with track 38's 252-session convention; the references are rebuilt from the replay's own
proxy and real bars (Method).

| Book | CAGR | Vol | Worst drawdown | Worst day |
|---|---|---|---|---|
| Reference: the two legs band-free at 100% equity, daily-rebalanced | **16.8%** | 27.9% | **−60.1%** (2000-03-27 → 2003-03-31) | −15.6% on 2000-04-14 |
| Track 38: "2x blend, equity part only" (`real_path.csv`) | **17.7%** | 28.0% | **−60.1%** | −15.6% on 2000-04-14 |
| Reference at the book's 50%, the rest T-bills (track 38's `blend_2x_50pct`) | 10.8% | 14.0% | −31.8% (2000-03-27 → 2003-03-31) | −7.8% on 2000-04-14 |
| Reference: the 2% band at 50% | 11.5% | 14.1% | −26.2% (2000-03-27 → 2003-01-17) | −7.8% on 2000-04-14 |
| Reference: the band and the D40 governor at 50% | 11.3% | 14.0% | −26.3% (2000-03-27 → 2000-10-06) | −7.8% on 2000-04-14 |

- **CAGR: reference − track 38 = −0.9 points, within the 1-point tolerance**, of the expected sign and size: the
  0.70% financing spread against track 31's 0.40% (−0.3 points a year on the 2× legs throughout), the real SSO/QLD
  bars after 2006 against a model that track 26 found 0.3 points richer than the funds, the Nasdaq-100's
  QQQ-implied yield (about 0.2% a year in 1999–2006) against a flat 0.8%, less track 31's 0.05% a switch (about
  0.15 points the other way).
- **Worst drawdown and worst day: the same to the fourth decimal** (−60.08% from 27 March 2000; −15.6% on 14 April
  2000): the same bear, the same day, the same open convention on Black Monday.
- Calendar years: the 50% reference against track 38's 50% column over 41 years: mean −0.5 points, the largest gap
  3.2 points in 2020 (the real QLD bars in the March 2020 gap days against the model).

### The pipeline's book, with and without the governor (the IRA, from 1986-07-22)

| Book | CAGR | Vol | Worst drawdown | Worst day |
|---|---|---|---|---|
| Pipeline: G1 only, **no governor** | **10.8%** | 14.1% | **−27.9%** (2000-03-27 → 2000-10-06) | −6.9% on 1997-10-27 |
| Pipeline: G1 only, **with the governor and hard stop** | **10.7%** | 13.9% | **−25.8%** (2000-03-27 → 2000-10-06) | −6.9% on 1997-10-27 |
| Pipeline: IRA + taxable with the governor (what the governor sees) | 10.1% | 12.7% | −24.0% (2000-03-27 → 2000-10-06) | −6.2% on 1997-10-27 |
| Reference at 50%, band-free (track 38's simulation) | 10.8% | 14.0% | −31.8% | −7.8% on 2000-04-14 |
| Reference at 50%, the 2% band | 11.5% | 14.1% | −26.2% | −7.8% on 2000-04-14 |
| Reference at 50%, the band and the D40 governor | 11.3% | 14.0% | −26.3% | −7.8% on 2000-04-14 |
| SPY total return (replay marks; ^GSPC proxy before 1993) | 11.3% | 18.5% | −55.2% (2007-10-09 → 2009-03-09) | −20.5% on 1987-10-19 |
| Track 38: SPY (from 1985-10-01) | 11.8% | 18.2% | −55.3% | −20.4% on 1987-10-19 |

- **CAGR: pipeline − reference at the same weight = −0.01 points** against the band-free reference and −0.7 against
  the band reference, both within the 1-point tolerance. Against the band reference the pipeline loses 0.7 points to
  Rule E's whipsaws (103 mid-week exits, a net −0.26% of the leg each against waiting for Sunday), weekly band
  rebalancing and 3 bp slippage; against the band-free reference those losses and the entry band's gains cancel.
  The governor costs **0.1 points a year** (−3.6% of the final NAV).
- **Worst drawdown: the pipeline's −27.9% is 3.9 points shallower than the band-free reference's −31.8%**, outside
  the 3-point tolerance in the safe direction, and 1.7 points deeper than the band reference's −26.2%. Rule E and the
  band had the book in SGOV from 8 October 2000 to January 2003 (a fortnight in January 2002 aside), so its trough is
  6 October 2000; the band-free reference re-entered on each 2001–02 rally and troughed on 31 March 2003. The
  governor takes the drawdown to −25.8% (2.1 points shallower).
- **Worst day:** −6.9% on 27 October 1997 (both legs in at full weight) rather than the references' −7.8% on 14 April
  2000: by then the March 2000 falls had left both legs below their 25% targets and the weekly 25% band does not top
  a leg up, so the book carried less than the daily-rebalanced references into the −15.6% 2× day.
- The G1-only book is **0.5 points a year behind SPY at half its volatility and half its drawdown**: the 50% weight
  in T-bills and the 1986–2026 whipsaw cost (about a third of the years are down years for the legs while SPY is
  up, the calendar table) are the price of −28% against −55%.

**Calendar years** (`calendar_years.csv`; 41 years against track 38's 50% blend: mean difference −0.5 points, 40 of
41 with the same sign, the exception 2010).

| Year | Pipeline, no governor | With the governor | Ref. band-free 50% | Ref. band 50% | Track 38 blend 50% | SPY (replay) |
|---|---|---|---|---|---|---|
| 1986 (from 1 Jul) | −7.6% | −7.6% | −8.7% | −4.5% | −5.9% | −2.3% |
| 1987 | +25.6% | +25.6% | +19.2% | +19.2% | +19.4% | +5.2% |
| 1988 | −7.8% | −7.8% | −1.1% | +1.1% | −1.0% | +16.6% |
| 1989 | +26.4% | +26.4% | +28.4% | +27.6% | +28.7% | +31.7% |
| 1990 | −4.8% | −4.8% | −7.7% | −7.6% | −7.7% | −3.1% |
| 1991 | +37.3% | +37.3% | +40.1% | +40.2% | +40.4% | +30.5% |
| 1992 | +1.0% | +1.0% | +0.4% | +2.5% | +0.4% | +7.6% |
| 1993 | +4.4% | +4.4% | +7.3% | +10.0% | +7.5% | +9.6% |
| 1994 | −5.1% | −5.1% | −2.4% | −6.3% | −2.3% | +0.4% |
| 1995 | +39.2% | +39.2% | +39.9% | +38.5% | +40.3% | +38.0% |
| 1996 | +19.1% | +19.1% | +32.2% | +32.2% | +32.5% | +22.5% |
| 1997 | +24.2% | +24.2% | +26.0% | +25.4% | +26.3% | +33.5% |
| 1998 | +35.5% | +34.0% | +38.6% | +39.4% | +38.8% | +28.7% |
| 1999 | +49.9% | +48.6% | +46.4% | +49.6% | +46.9% | +20.4% |
| 2000 | −21.4% | −19.0% | −18.0% | −15.1% | −17.8% | −9.7% |
| 2001 | +3.5% | +3.5% | +0.6% | +3.5% | +0.5% | −11.8% |
| 2002 | −0.9% | −0.4% | −1.7% | −2.2% | −1.7% | −21.6% |
| 2003 | +30.8% | +27.0% | +27.2% | +29.3% | +27.7% | +28.2% |
| 2004 | +1.1% | +2.2% | +2.9% | +2.3% | +3.1% | +10.7% |
| 2005 | −6.9% | −6.9% | −5.6% | −1.1% | −5.6% | +4.8% |
| 2006 | +7.1% | +7.1% | +4.7% | +3.4% | +7.2% | +15.8% |
| 2007 | +8.9% | +8.9% | +5.0% | +8.8% | +6.7% | +5.1% |
| 2008 | −5.9% | −5.9% | −3.2% | −11.1% | −3.1% | −36.8% |
| 2009 | +20.2% | +20.2% | +22.6% | +24.1% | +22.5% | +26.4% |
| 2010 | −1.8% | −2.8% | +3.6% | +3.4% | +4.6% | +15.1% |
| 2011 | −7.4% | −7.2% | −15.2% | −8.4% | −14.8% | +1.9% |
| 2012 | +8.4% | +6.9% | +10.4% | +10.9% | +9.5% | +16.0% |
| 2013 | +35.5% | +35.5% | +32.2% | +31.7% | +32.1% | +32.3% |
| 2014 | +14.2% | +14.2% | +13.2% | +15.5% | +13.2% | +13.5% |
| 2015 | −7.0% | −7.0% | −9.5% | −8.7% | −7.5% | +1.2% |
| 2016 | +0.9% | +0.6% | +4.6% | +1.7% | +4.6% | +12.0% |
| 2017 | +29.1% | +28.3% | +26.2% | +26.2% | +26.3% | +21.7% |
| 2018 | +6.8% | +6.6% | +6.2% | +5.3% | +6.5% | −4.6% |
| 2019 | +12.4% | +12.4% | +11.9% | +17.8% | +12.1% | +31.2% |
| 2020 | +20.5% | +20.5% | +19.3% | +15.2% | +22.6% | +18.3% |
| 2021 | +28.9% | +28.9% | +27.2% | +27.2% | +27.5% | +28.7% |
| 2022 | −8.4% | −8.4% | −12.2% | −9.3% | −12.2% | −18.2% |
| 2023 | +23.2% | +23.2% | +21.2% | +24.0% | +21.9% | +26.2% |
| 2024 | +26.3% | +26.3% | +23.9% | +23.9% | +24.7% | +24.9% |
| 2025 | +13.5% | +13.5% | +12.7% | +10.9% | +13.2% | +17.7% |
| 2026 (to 28 Sep) | +11.4% | +11.4% | +12.7% | +8.8% | +12.7% | +13.2% |

The largest gap to track 38 is **1996 (−13.4 points)**: Rule E sold QLD on 9 January (its close 2.5% below the
average) and both legs on 15 July (SSO 0.3% below, QLD 1.7%), then QLD again on 23 July, each at the low of a short
dip, and the +2% band kept SSO out until 5 August while the S&P rallied; the band-free reference, which re-enters at
any close above the average, lost 0.3 points to track 38 that year. 1988 (−6.8: six Rule E exits) and 2010 (−6.4:
the flash-crash whipsaws) are the other years more than 5 points below track 38; the governor's 2003 cost is below.

### The episodes (`episodes.csv`; the return from the close before the first date, as track 38 computes them)

| Episode | Pipeline, no governor | With the governor | Ref. band-free 50% | Ref. band 50% | Track 38 `blend_2x_50pct` | SPY (replay) |
|---|---|---|---|---|---|---|
| Aug 25 – Dec 31 1987 | **−10.0%** | −10.0% | −12.7% | −12.7% | **−12.7%** | −25.0% |
| Mar 24 2000 – Oct 9 2002 | **−24.9%** | −22.4% | −28.0% | −23.2% | **−28.0%** | −47.2% |
| Oct 9 2007 – Mar 9 2009 | **−9.2%** | −9.2% | −10.7% | −16.6% | **−8.8%** | −54.8% |
| Feb 19 – Mar 23 2020 | **−14.5%** | −14.5% | −18.7% | −18.7% | **−16.7%** | −33.4% |
| Jan 3 – Oct 12 2022 | **−9.2%** | −9.2% | −11.8% | −10.1% | **−11.7%** | −24.1% |
| Feb 19 – Apr 8 2025 | **−8.6%** | −8.6% | −9.0% | −10.4% | **−9.0%** | −18.6% |

Five of the six are within the 3-point tolerance (+2.7, −0.3, +2.2, +2.5, +0.4 points); **2000–02 is 3.05 points
better than track 38**, 0.05 over it. Every miss is Rule E or the band, both absent from track 38's sleeves:

- **1987 (+2.7):** Rule E sold SSO on Thursday 15 October's close (0.17% below its average), filled at Friday's
  open, before Friday's −4.6% (2 × 4.6% × 25% = 2.3 points).
- **2000–02 (+3.05):** seven Rule E exits in 2000 (SSO on 7 and 14 March, 14 April, 10 May; QLD on 10 and 19 May
  and later) and the +2% re-entry band left the book in SGOV from 8 October 2000 through 2002 while the band-free
  reference re-entered on every rally; the band reference alone (−23.2%) is 1.7 points better than the pipeline,
  which is weekly band rebalancing (the legs ran above 25% into the April 2000 drop) and slippage.
- **2007–09 (−0.3):** a match; the band-free reference on the same bars is 1.9 points worse than track 38 (the real
  QLD bars in the 2008 whipsaws against the model).
- **2020 (+2.2):** Rule E sold SSO at Friday 28 February's gap-down open (2.2% below the average on Thursday's
  close), 2% under the Monday open the weekly rule would have had, but sold QLD on 10 March (2.8% below on the 9th),
  six days before the weekly rule's exit filled at the open of 16 March, the −12% day.
- **2022 (+2.5):** Rule E's two exits and the band; **2025 (+0.4):** a match.

### 1987: the Sunday 18 October email, Black Monday, the next Sunday's G

The week of 12–16 October 1987 in the pipeline (both runs, identical until the governor's first cut in 2000):

- **Thursday 15 October**, the 22:17 ET daily run: the S&P 500 closed at 298.08, 0.17% below its 200-day average
  (298.59): Rule E sold all SSO, queued for Friday's open, and sent its exit email (the first Rule E exit of 1987).
  The fill: Friday 16 October at $0.5900 (the proxy's open, the prior close: Yahoo's index open that day equals it).
- **Friday 16 October:** the S&P −5.2% to 282.70, the Nasdaq-100 −5.1% to 183.29. Rule E triggered on QLD (2.88%
  below its average) but hit the weekly cap: logged, "Sunday decides".
- **Sunday 18 October, the email** (`emails/0088_weekly_1987-10-18_GROWTH.txt`), subject
  `[PAPER][GROWTH G-1987-10-18] week 42: 2 orders — Step 1 tonight, Step 2 Mon 19 Oct from 9:35 ET`:

  > STATUS PAPER · GROWTH (growth book) · policy module · week 42 · decided Sun 18 Oct on the closes of Fri 16 Oct
  > THIS WEEK 1 recommendation, 2 orders · BOOK NAV $113,342: IRA $91,825, taxable $21,517 · SIZE G 1.00 · 9.5% below the peak
  > WHY — On Fri 16 Oct the Nasdaq-100 closed 183, 2.9% below its 200-day average of 189: QLD switches out (in and
  > close −2.88% vs the average (≤ −2%): exit). — The book is 9.5% below its peak of $125,215, so the size is 1.00.
  > STEP 1: Sell all QLD, market ($19,307 at Friday's close): the sleeve switched off.
  > STEP 2: Buy $40,201 of SGOV, market, in dollars: idle cash goes to the cash fund.
  > RULE E — Rule E sold SSO on Fri 16 Oct at $0.59; a Sunday exit would have sold at about $0.53 (Friday's close),
  > so the exit scored +11.49% (positive: Rule E sold higher). Rule E has fired 1 of at most 6 times this year.

  SSO was 5.38% below its average at Friday's close, QLD 2.88%: both legs out. The IRA was 12% below its August
  peak ($103,909 → $91,825); the governor, which sees the IRA plus the T-bill taxable account, saw 9.5%, under its
  15% threshold: **G 1.00**.
- **Monday 19 October:** the S&P −20.5%, the Nasdaq-100 −15.1%. The fills at the open: sell all QLD at $0.2124
  (the proxy's open $0.2125 = Friday's close, since Yahoo's index open equals the prior close that day), buy $40,201
  of SGOV at par. **The book's mark: +0.05%** ($91,825 → $91,872, the T-bill accrual); the book lost nothing on
  Black Monday because both exits had been decided before it and the data's open is the prior close. A real market
  order at that morning's open would not have filled at Friday's level (the index's opening print is the prior close
  because most stocks opened late and lower); the record is the data's, and it is flagged.
- **Sunday 25 October:** drawdown 9.4% (peak $125,215), **G 1.00**, no orders; the legs re-entered in 1988. Over
  track 38's episode (25 August → 31 December) the book lost 10.0% against the reference's and track 38's 12.7%.
- **What a 1987 day costs this book if nothing is sold before the close:** with both legs in at 25% each and filled
  at Monday's close, the IRA loses 17.8% (2 × −20.5% and 2 × −15.1% at 25% each; track 38's `shock_1987.csv`:
  −29.5% for the full book with Bitcoin and gems), the governor's drawdown on the 16 October peak becomes 22.5% and
  the next Sunday's **G 0.72** (track 38: 0.456 for the full book). The email that Sunday would carry the cuts first.

### What the governor did in 1987, 2000–02 and 2008 (`governor_path.csv`, `sundays.csv`)

| | 1987 (25 Aug → 31 Dec) | 2000–02 (24 Mar 2000 → 9 Oct 2002) | 2007–09 (9 Oct 2007 → 9 Mar 2009) |
|---|---|---|---|
| Deepest Friday drawdown the governor saw (IRA + taxable) | 9.5% (18 Oct 1987) | **24.0% (8 Oct 2000)**, the deepest of the 40 years | 9.3% (24 Aug 2008) |
| Lowest G / Sundays with G < 1 / at the floor 0.25 | 1.00 / 0 / 0 | **0.66 (8 Oct 2000)** / 128 of 133 / 0 | 1.00 / 0 / 0 |
| Explicit `governor_cut` sells / `governor_restore` buys | 0 / 0 | 1 (30 Jul 2000) / 2 (16 Apr, 16 Jul 2000) | 0 / 0 |
| Hard stop (−40%) | no | no | no |
| The IRA over the episode, without / with the governor | −10.0% / −10.0% | −24.9% / **−22.4%** | −9.2% / −9.2% |

In plain words:

- **1987: nothing.** The 200-day rule and Rule E had both legs out before Black Monday and the drawdown at Friday's
  close was under 15%, so G stayed 1.00 through the crash and its aftermath (the legs re-entered in 1988). The
  governor is a week-scale rule; a crash that arrives with the legs still in (the hypothetical above) would have
  taken G to 0.72 the Sunday after.
- **2000–02: the governor's first real test, and it never reached its floor or the stop.** The first cut came on
  Sunday 16 April 2000, the week of the legs' −15.6% day: drawdown 18.2%, G 0.88; that email sold all SSO (its own
  exit signal), topped QLD up to its reduced target and swept the rest to SGOV. G then moved with each Friday's
  drawdown between 0.66 and 1.00 through the summer (back to 0.99 on 23 April and 1.00 on 30 April as the legs
  re-entered; 0.85 on 14 May; a restore on 16 July at 0.96); the only explicit size cut was on **30 July 2000**
  (drawdown 23.2%, G 0.69): $28,007 of SSO sold beside QLD's own exit. From **8 October 2000** (SSO's exit, drawdown
  24.0%, **G 0.66**, the lowest of the replay) both legs were out and the book sat in SGOV; G crept up with the
  T-bill accrual (0.70 by the end of 2000, 0.80 by the end of 2001, 0.79 at the October 2002 low) because the peak
  of March 2000 stood while the NAV earned 6%, then 3%, then 1.7%. QLD re-entered for a fortnight in January 2002
  at G 0.81 and was sold again. The governor was worth **+1.6% of the IRA over the episode** (−22.4% against −24.9%:
  the reduced size in April–October 2000) and took the worst drawdown from −27.9% to −25.8%.
- **2003: the bill.** The legs re-entered the 2003 rally at G 0.73–0.78 (QLD on 16 March, SSO on 27 April); the
  restores came on 11 May (G 0.89) and 8 June (G 1.00), three months into it, and 2003 made 27.0% against 30.8%
  without the governor (−3.8 points, its largest single-year cost; 2000 its largest saving at +2.4).
- **2007–09: nothing, by design.** Rule E sold SSO on 7 November 2007 (0.5% below its average; the weekly rule
  confirmed it on the 11th) and QLD on 4 January 2008; QLD re-entered three times for a week or two (May, June,
  August 2008) and was sold again each time. The deepest Friday drawdown the governor saw in the whole 2007–09 bear
  was 9.3% (24 August 2008), so **G stayed 1.00 throughout**: the 200-day rule had the book out before the size rule
  could act, and the book lost 9.2% over the episode against SPY's −54.8% (2008: −5.9% against −36.8%). Red-team
  item 3's bear reached the rule, not the governor.
- **The other G < 1 spells** (230 Sundays in all, none at the floor): 1998 (LTCM: G 0.88 on 11 October, eight
  Sundays), 2010 (the flash crash and the summer whipsaws: G 0.83 from 15 August, 24 Sundays), 2011 (G 0.90, 21),
  2012 (8), 2016 (G 0.945, 5) and one Sunday in 1988 at 0.999. Over the 40 years the governor cost 0.1 points a
  year and 3.6% of the final NAV for a worst drawdown 2.1 points shallower; it changed a calendar year by a point or
  more seven times (1998 −1.5, 1999 −1.3, 2000 +2.4, 2003 −3.8, 2004 +1.2, 2010 −1.0, 2012 −1.5).
- **The hard stop never fired**, so `governor.restart` was never needed; had it, the book would have sold everything
  to SGOV, blocked buys and waited for the owner's review, which restarts the peak at that NAV (`restart(state.growth,
  nav, date)`).

### The switches, Rule E and the orders (`g1_switches.csv`, `orders_and_governor_by_year_*.csv`)

| | Pipeline | Reference / expected |
|---|---|---|
| SSO switches a year (Rule E exits included) / weeks in | 2.2 / 72% | the 2% band rule on the same data 1.1; band-free 3.3; track 26 about 1.1 |
| QLD switches a year / weeks in | 2.6 / 72% | 1.6; 3.0 |
| Switch events matched to the band rule within a week (SSO / QLD) | 37 of 44 / 60 of 66 rule events; 51 / 46 extra (Rule E) | |
| Rule E exits | **103** (2.6 a year: 50 SSO, 53 QLD); 46 triggers capped (Sunday decided) | not in track 26/31/38 |
| Rule E's edge against waiting for Sunday (the fill against the leg's Friday close) | mean **−0.26%** of the leg, median −0.26%, 49 of 103 positive; best +16.9% (SSO, 15 Oct 1987), worst −13.6% | decision 5's review has its number |
| Sundays with orders | 217 of 2,101 (5.4 a year); 363 orders (368 with the governor); **max 3 in one email**; 0 deferred (6 Sundays with one, governed) | A.5: about 13 a year for the full book; 3 |
| Orders cancelled at the open | 23, all "no position to sell" (finding 1) | 0 |
| Sundays with G < 1 / lowest G / hard stop | 230 / 0.66 / never | |

### What the 1986 replay found

1. **A Friday Rule E exit is queued twice** (`traderec/growth/weekly.py`, not this phase's file). When Rule E sells
   a leg on a Friday night (its order fills at Monday's open), the Sunday job still lists "Sell all <leg>": it sizes
   the sell on the broker's holding at Friday's close, where the lot still is, and the leg's state is already "out".
   On paper the second order is cancelled at the open ("no position to sell": 23 times in 40 years, on 26 April 1992,
   4 October 1992, 25 April 1993, 16 April 2000, 6 January 2008, 1 March 2020 among others). Live it would be a second
   market sell of the whole position: rejected by the broker, or, after a partial first fill, a short sale in an
   IRA. **Fixed at integration:** `weekly.run` now reads the broker's pending sells, treats a queued sale as done when
   it builds the order set (a close-all sale zeroes the holding, a partial one reduces it), records them in the
   `order_set` record (`pending_sells`, `held_after_pending`) and the facts (`rule_e.pending_sells`), and the Sunday
   email says the sale is pending (`tests/test_growth_email.py`, the Friday Rule E test).
2. **The G-step rule sends tiny resizes.** When G moved 0.10 or more since the last order, any delta above the $300
   minimum is an order: six orders under $1,000 in 40 years (a $431 QLD sell on 1 November 1998, $534 on 23 April
   2000). Cosmetic.
3. **`--resume` skipped a month's review** when the earlier segment ended on that month's last day (the review runs
   on the 1st with the month-end as its as-of date, and the resumed plan started the day after): five monthly runs
   across the two replays (2024-05 and 2025-09 without the governor; 2021-05, 2021-11 and 2024-01 with it). The
   monthly job writes the review email and its ledger record and never touches the book. Fixed in `replay()`, with a
   test. The time-boxed chunks also meant `runs.csv`, `emails.csv` and `segment.json` were rebuilt from the state, the
   ledger, the emails directory and the logs after the fact (the harness writes them only when a chunk completes);
   the states and ledgers are complete and verify.
4. **The Phase C3 reference books switched on Tuesday** (the correction above).
5. **The replay's runtime is quadratic in its length**: `Run.begin` re-verifies the whole ledger (and the monthly
   report verifies it again), so the 40-year runs cost 8 hours each. A checkpointed verification (the head witnessed
   at the last run) would make a replay linear; it is a pipeline change, not a harness one.

### Interpretations (design Appendix B style)

| Where | The design says | Built as | Why |
|---|---|---|---|
| A.5 "G1 alone" | the legs alone | `--book g1-only`: G2's weight 0 with its instrument kept, the Sunday job's G2 leg replaced by a stub that returns "no signal" without an alert; W10's weight 0 and the module off; every v3.3 module and shadow book off | the Sunday job has no switch for a sleeve without data (Bitcoin has none before 2014, so the real leg alerts every Sunday); SPY starts in 1993 and ^VIX in 1990, so the modules would alert daily; the facts and records keep their shape |
| A.5 "proxy fund bars (track 04's model …, financing at T-bills + 0.4%, 0.9% fee)" | track 31's constants | track 26's calibrated model: 2 × the index's total return − (T-bill + 0.70%)/252 − 0.89%/252, the T-bill the prior DTB3 print | the 0.70% spread reproduces the real SSO's 2006–2026 CAGR within 0.1 points (15.8% model vs 15.7%; QLD 25.2% vs 25.4%); the 0.4% pair is 0.3 points a year richer than the real funds |
| A.5 the index's total return | — | dividends from track 26's loaders on its cached inputs: Shiller's monthly yield before 1988, then ^SP500TR's return less ^GSPC's; QQQ's implied yield for the Nasdaq-100, 0.6% a year before 1999; a constant (2.3%, 0.6%) when the cache is absent, said in the flag | `spx_panel` / `ndx_panel`, so the proxy is track 26's series; the harness never downloads |
| §3a "filled at Monday's open" | the fund's open | the proxy's open is the prior close moved by 2 × the index's overnight move where Yahoo's index open differs from the prior close (26% of 1986's sessions, 22% of the S&P proxy's, 40% of the Nasdaq-100's), else the prior close | Yahoo's index opens are mostly the prior close before about 2000; the alternative (every open = the prior close) hides even the real gaps. Black Monday's open is the prior close in both indices: the fills that morning are at Friday's level, and the record says so |
| A.5 the replay's start | 1986-07-01 | proxies from 1985-10-01 (^NDX's first Yahoo session); SSO's first decision 1986-07-06 (band-free), QLD's 1986-07-20 (the 200th ^NDX close is 1986-07-16) | track 38's blend starts 1986-07-22 for the same reason; the reconciliation window is 1986-07-22 → 2026-09-28 |
| the daily run needs SPY | — | SPY before 1993-01-29 is ^GSPC scaled to SPY's first close (adj_close from the index's total return), flagged | the daily run takes its session calendar, its SPY marks and its SPY two-source check (an echo) from SPY's bars; no module trades it here |
| §3a.7 Rule E | decision 5: on | kept as in production (band-free mid-week exits, one a week, six a year) in both runs | the replay is the pipeline as built; its cost and benefit are reported (the switch counts, the scores against "waiting for Sunday") rather than switched off |
| "without the governor" | — | the production config with `governor.full_until = floor_at = 1.0`, `floor = 1.0` and `hard_stop.at = 1.0`: G = 1 on every Sunday, the hard stop unreachable | a threshold, not a code path, so the Sunday job runs unchanged |
| the cash vehicle before 2020 | SGOV at par | SGOV at par with the T-bill accrual from 1986 (the pipeline's rule; its bars are never read) | the book's "out" leg is T-bills throughout, as in track 38 |
| the reference books | track 38's simulation | daily-rebalanced, switched at Monday's open, from the same proxy/real bars: band-free at 100% and at the book's 50%, the 2% band at 50%, the band and the D40 governor at 50%; no costs | the C3 helper switched on Tuesday (the correction above); track 31's own sleeves charge 0.05% a switch and use the model after 2006 too |
| the look-ahead comparison | identical decisions | the Rule E scores' `record` and `trigger_record` hashes are dropped from the compared payloads, as `ids` are | they are hashes of timestamped records that two replays never share |

### Method

- **Data** (`--fund-proxies`): the cache of the 2014 replay plus `period="max"` bars for ^GSPC (from 1927) and ^NDX
  (from 1985), FRED DTB3 from 1954 and the real SSO/QLD bars from 2006-06-21. `splice_fund_proxies` builds the proxy
  bars from 1985-10-01: the close compounds the model's daily return and is spliced to the real fund's first close by
  ratio (SSO × 0.243596, QLD × 0.095797; 5,226 sessions each from 1985-10-03), the open from the index's real open
  where Yahoo has one, high and low likewise, adj_close = close (no distributions), volume 0. SPY before 1993-01-29 is
  ^GSPC × 0.100136 (1,854 sessions). Every proxy is in `History.flags`, `segment.json` and `summary.csv`. The 200-day
  average is on the index closes (^GSPC, ^NDX), never on the proxies. Track 26's Yahoo files match the replay cache's
  ^GSPC exactly; its ^SP500TR series has two self-cancelling one-day glitches (June 1989, January 1990) that the proxy
  inherits.
- **Runs**: `run_init` on 1986-07-01, then daily Monday–Friday, weekly on Sundays, monthly on the 1st: the same
  schedule as the 2014 replay, in eight resumable chunks with mid-month boundaries (a month-end boundary would skip
  that month's monthly run). Run 1 with `--no-governor`, run 2 with the production governor; the two are identical
  until the first Sunday with G < 1.
- **Look-ahead**: 1987-06-01 → 1987-12-31 with and without the as-of cut (`--no-cut`), compared with `compare_runs`.
- **Reconciliation** (`reconcile-g1`): `reference_g1` rebuilds the four reference books from the spliced bars with the
  weekly rule (`g1_signal`, band-free or the 2% band) switched at Monday's open, the residual at the prior DTB3 print;
  CAGR with track 38's 252-session convention; the episodes from the close before each window's first date, as
  track 38 computes them; the governor's path from the `governor` records; the 1987 record from the `growth_decision`,
  `rule_e`, `fill` and `mark` records and the captured Sunday email.
- **Expected differences** from track 38's sleeves, in order of size: Rule E (mid-week, band-free exits; not in track
  31/38); the 2% entry band against band-free re-entries; weekly band rebalancing (the 25% band, the $300 minimum, the
  three-order cut) against daily rebalancing; the real SSO/QLD bars after 2006 against the model (track 26: the model
  at 0.70% matches them; track 31's 0.40% is richer); the Nasdaq-100 yield (QQQ-implied, about 0.2% a year in
  1999–2006, against a flat 0.8%); track 31's 0.05% a switch against the pipeline's 3 bp slippage; the T-bill accrual
  (calendar days / 365) against rf/252.

### How to run

```
python scripts/replay.py run --book g1-only --fund-proxies --no-governor --start 1986-07-01 --end 1991-07-15 --work /tmp/traderec-replay-g1-nogov --cache /tmp/traderec-replay-cache
python scripts/replay.py run --book g1-only --fund-proxies --no-governor --start 1986-07-01 --end 1996-07-15 --work /tmp/traderec-replay-g1-nogov --resume --cache ...   # ... to 2026-09-28
python scripts/replay.py run --book g1-only --fund-proxies --start 1986-07-01 --end 1991-07-15 --work /tmp/traderec-replay-g1-gov --cache ...                          # the same chunks with the governor
python scripts/replay.py run --book g1-only --fund-proxies --start 1987-06-01 --end 1987-12-31 --work /tmp/traderec-replay-g1-la-cut --cache ...
python scripts/replay.py run --book g1-only --fund-proxies --start 1987-06-01 --end 1987-12-31 --work /tmp/traderec-replay-g1-la-nocut --no-cut --cache ...
python scripts/replay.py reconcile-g1 --work /tmp/traderec-replay-g1-nogov --work-governor /tmp/traderec-replay-g1-gov --out research/code/39-growth-replay/g1-1986 \
                                      --lookahead /tmp/traderec-replay-g1-la-cut /tmp/traderec-replay-g1-la-nocut --cache ...
```

`--start` before the first real fund bar without `--fund-proxies` is refused; `--no-governor` needs `--book g1-only`.
Each run re-verifies the whole ledger, so a run's time grows with the ledger (0.03 s at the start, several seconds at
the end): budget most of a day for the two full runs, or run them in parallel.

## What remains

- **Crash-day opens.** The 1986 replay fills at Yahoo's index open, which is the prior close on 19 October 1987 and
  on most sessions before 2000; a real market order that morning filled far lower. The record states both the fill
  and the close-filled hypothetical (−17.8% of the IRA, G 0.72); intraday index data, or SPY's own opens from 1993,
  would sharpen the crash-day fills.
- **Rule E's number.** Over 40 years it fired 2.6 times a year with a net edge of about zero against waiting for
  Sunday (−0.26% of the leg on average, half the exits positive) and cost the book most of a 13-point year (1996);
  it also sold QLD six days ahead of the weekly rule in March 2020. Decision 5's review can now use these figures.
- **The replay's runtime**: 8 hours per 40-year run (finding 5); a checkpointed ledger verification in the pipeline
  would make it linear.
- **A historical second source for ^NDX** (Nasdaq's index history) would let `--second-source history` cover the
  book; today it covers SPY and ^GSPC only, so the book's replay uses the echo for the index closes.
- **The annual report's hurdle line** (`reports.module_statuses`, `emails.render_annual`) names the policy modules
  by their labels, the growth book among them ("M1, M3, W10, M4, W8 and GROWTH"); a v4 lifecycle status is reported
  separately as `lifecycle` (fixed at integration). The review emails do not yet show each module's lifecycle.
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
| `g1-1986/` | the 1986–2026 G1-only replay (Phase C4b, the section above): `summary.csv`, `book_vs_track38.csv`, `calendar_years.csv`, `episodes.csv`, `sundays.csv`, `g1_switches.csv`, `governor_path.csv`, `nav_monthly.csv`, `orders_and_governor_by_year_{nogov,gov}.csv`, `c3_reference_corrected.csv` |
