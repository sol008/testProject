# Historical replay of Phase A, 2019-01-02 → 2026-09-28

`scripts/replay.py` runs the **real** pipeline (`run_init`, `run_daily`, `run_weekly`, `run_monthly`) day by day over
past years on real market data, then reconciles its trades with the research backtests. It covers M1, M2, M3 and
W10 and the Phase A shadow books (ST-1b and the W10 record of every uptrend −3% day). The goal is to find
implementation bugs before the system goes live. The reconciliation CSVs are in `research/code/25-replay/`.

No pipeline or module code was changed. Four issues are written up under [Findings](#findings) for the
integrator: two in the pipeline, one in track 23's research code and one discrepancy between M2 and the research.

## Results at a glance

| | |
|---|---|
| Window | 2019-01-02 → 2026-09-28 in one segment: 2,515 runs (2,019 weekday runs of which 1,945 sessions, 404 Sundays, 92 month-ends), `init` on 2019-01-02 |
| Runtime | 17.4 min on one core: 0.37 s per calendar day, 0.41 s per daily run on average, 0.80 s at the end. The ledger check re-hashes every record on every run (11,086 records at the end), so the cost grows with the ledger. It was fast enough for one segment, so there was no need to split 2019–2021 from 2024–2026. |
| Run statuses | 2,441 `ok`, 73 `no_session` (NYSE holidays), 1 `data_missing` (2025-01-09, finding 2), 0 exceptions |
| Validator | 0 emails blocked; 0 errors when the 310 sent emails were re-validated |
| Alerts by kind | `circuit` 1 (2019-06-27, a −2.05% day); `data` 1 (2025-01-09) |
| Look-ahead | 0 data served after a run date. With full histories on offer (`--no-cut`), the pipeline's 1,743 decision records over 2019–2020 were identical, although 4,928 provider calls returned future rows. So the pipeline cuts at the run date itself; the offline test checks the same. |
| Ledger | hash chain verifies (11,086 records) |
| NAV | $100,000 → $179,302: +79.3%, 7.8% a year. SPY +242.9%, 17.3% a year. |
| Max drawdown | 6.7% (2020-02-19 → 2020-03-20). SPY 33.7%. |

| Year | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 to 28 Sep |
|---|---|---|---|---|---|---|---|---|
| Book | +10.7% | +12.5% | +8.0% | −0.8% | +6.8% | +9.7% | +8.3% | +5.9% |
| SPY (total return) | +31.1% | +18.3% | +28.7% | −18.2% | +26.2% | +24.9% | +17.7% | +13.2% |
| T-bills | 2.1% | 0.4% | 0.1% | 2.0% | 5.0% | 5.0% | 4.0% | 2.7% |

P&L by source, in USD:

- M2 +35,333, including 4,206 of distributions;
- M3 +20,675 on closed trades;
- T-bill interest +19,003;
- M1 +2,667;
- W10 +1,327.

The book beat the design's central ~5% a year even though T-bills averaged only about 2.6%. Two things did it:

- a good sample for M2, which earned 2.3% of NAV a year over T-bills;
- Bitcoin: M3 earned 2.3% of NAV a year, about 0.9 points of it because the sleeve was never trimmed (finding 1).

### Per module

| Module | Research list | Matched | Missed | Extra | Returns (pipeline − research) |
|---|---|---|---|---|---|
| **M1** | track 13 ST-1 | 39. All have the same entry and exit dates, and all exited by the rule, so the time stop never fired. | 1: 2021-02-22, refused by the 10% total-stress cap (finding 1) | 0 | mean −0.0002 points, max 0.007 points. Sum 32.61% vs 32.62%. |
| **W10** | track 23 CAL90, one at a time | 3: 2020-02-24, 2020-06-11, 2020-10-28, with the same dates | 0 | 0 | +1.33 points mean (max 2.56) vs the published list. −0.04 points once the list is re-priced at the open (finding 3). |
| **M2** | track 15 R1 long-only ETF8, recomputed on M2's 92 decision dates | 722 of 736 leg-months agree (370 long in both, 352 flat in both) | 7 legs long in research only | 7 legs long in the pipeline only | Sleeve excess over T-bills 2.29% of NAV a year, vs 2.54% for R1 at s = 0.5 (finding 4). |
| **M3** | track 15 R2, recomputed | 400 of 404 weeks in the same state. 63 switch events matched. | 4 events | 4 events | 33 closed trades: mean +18.5% vs +19.6% research-style (execution timing). P&L 2.30% of NAV a year as built, 1.40% at the research's constant 3% (finding 1). |
| **ST-1b shadow** | track 13 ST-1b | 69 | 0 | 0 | mean −0.01 points. The largest gap, −0.34, is SPY's 2024-12-20 dividend: the shadow book scores price only. |
| **W10 shadow** | track 23, every uptrend −3% day | 4 of 4 events (2020-02-24, 06-11, 09-03, 10-28) | 0 | 0 | 60- and 90-day scores share their dates with the research. They show the same close-vs-open gap as W10. |

- **M3's four event mismatches** are one-week timing shifts on four borderline weeks (2021-07-25, 2022-09-11,
  2023-03-12 and 2025-10-12). In each, the weekly close sat within 0.6% of its 10-week average, and Coinbase
  (pipeline) and the Coin Metrics reference rate (research) landed on opposite sides. That is source noise, not code.
- **The research M3 trade return** buys and sells BTC at the Monday UTC close. The pipeline trades IBIT, or its
  proxy, at the Monday 9:30 ET open.

## Findings

### 1. M3 is sized once and never trimmed: the Bitcoin sleeve reached 14% of NAV and crowded out M1

- **Where.** `traderec/pipeline.py:1032–1078` (`_m3`).
  - Line 1055 sizes the switch-on at `sleeve_pct_nav × NAV`.
  - The branches at 1052 (switch on, nothing open) and 1071 (switch off, trade open) have no case for "on and open".
  - So the IBIT lot is never re-sized while the switch stays on.
- **Spec.**
  - Design §3 M3: "Size. Sleeve ≤3% of NAV. Stress = sleeve × the worst 10-session loss."
  - §4 per-trade stress cap: 2%.
  - `config/constitution.yaml:73`: `sleeve_pct_nav: 0.03`.
  - Track 23 prices M3 as a constant 3% of NAV: `research/code/23-duration-verify/modules23.py:140,152`,
    `contrib = weight * (...)` with `weight=0.03`.
  - The design's expectation for M3 (−0.3 to +0.5% a year) is stated for that 3% sleeve.
- **Failing scenario (replay).**
  - M3 switched on on 2020-10-11 with $3,462, 3.0% of NAV.
  - Bitcoin went from $11k to $63k, and the lot reached **14.35% of NAV on 2021-04-15**.
  - At the 45% crypto stress, that is **6.46% of NAV** against the 2% per-trade cap.
  - Over the replay:
    - M3 held more than 1.25 × its 3% sleeve on 415 of its 1,072 days;
    - its stress was above the 2% per-trade cap on 250 days.
  - Because the total open-stress cap is 10%:
    - **2020-12-14:** M1 was cut to $4,513, 63% of its size. Open stress was 8.77% of NAV: M3 2.19% at a 4.9% weight, W10 2.09%, M2 4.50%.
    - **2021-02-22:** M1 was refused outright. Open stress was 10.09% of NAV: M3 5.59% at a 12.4% weight, M2 4.50%. That signal is a track-13 winner (+1.47%); it is the only research trade the replay missed.
  - At a constant 3%, M3's stress is 1.35% and both M1 trades are admitted in full.
  - M3 earned 2.30% of NAV a year as built, against 1.40% at a constant 3% on the same days. The extra is
    Bitcoin beta well above the approved size.
- **Suggested fix.**
  - In `_m3`, when the switch is on and the trade is open, re-size to `sleeve_pct_nav × NAV` at the weekly decision.
  - Do it only when the lot's value leaves a band, so emails stay rare. M2's `band_rel` (25%) is the obvious choice;
    at least trim whenever the lot's stress exceeds `risk.caps.per_trade_stress`.
  - The re-size is a dollar sell (or buy) of the difference, emitted as a `REBALANCE` for M3.
  - If letting the position ride is intended instead:
    - restate design §3 M3 (size and expectation);
    - count M3 in `risk.open_stress` at its sleeve, as M2 is, so it cannot block M1.

### 2. Unscheduled NYSE closures read as missing data

- **Where.**
  - `traderec/market_calendar.py:61` (`nyse_holidays`) knows the regular holidays only, and `is_trading_day`
    (line 79) relies on it.
  - `traderec/pipeline.py:515–519`: a missing SPY bar on a "trading day" raises `DataMissing`.
  - `Run.order_deadline` (`pipeline.py:383–385`) names the next session with `next_trading_day`.
- **Failing scenario.**
  - On 2025-01-09 (national day of mourning, NYSE closed) the daily run ended `data_missing` with a `data` alert.
    In Actions, `daily.yml` would retry in its late slot, then fail the job with exit code 3, for a closed market.
  - The January 2025 monthly report counts 20 of 21 runs on time, so the go-live "runs on time" gate is charged a
    miss for a closed market.
  - An email sent on 2025-01-08 would have said to place the orders before 9:30 ET on Thu 9 Jan. None was due in
    the replay.
  - Fills were right: they key off the sessions in the data.
- **Suggested fix.**
  - Add the announced unscheduled closures (2018-12-05, 2025-01-09 and future ones) to `market_calendar`, for
    example as an `UNSCHEDULED_CLOSURES` set that `is_trading_day` checks.
  - Alternatively, treat "no SPY bar, and the provider already has a later session" as `no_session`.

### 3. Track 23 prices W10's calendar exits at the close (research code; the pipeline follows the design)

- **Where.** `research/code/23-duration-verify/common23.py`:
  - line 311: `exit_px = I.mark if rule.startswith("C") else I.ex_open`;
  - the same test appears at 314 (T-bills) and at 329 and 331 (worst interim loss).
  - The test is meant for the `C<H>` rules, but `"CAL90".startswith("C")` is true. So calendar-exact exits are
    priced at the adjusted **close** of the exit day.
  - The module's docstring (lines 9–11) and design §3 W10 both say the **open**. The pipeline sells at the open.
- **Failing scenario.** The three replay trades differ from track 23's list by −0.37, +2.56 and +1.80 points.
  Re-priced at the open (`w10_track23_cal90_repriced_open.csv`), the gaps shrink to −0.10, −0.02 and +0.01 points.
  The residue is costs and dividends paid as cash rather than reinvested.
- **Effect on the published base rates** (SPY 1993–2026, CAL90, one at a time, 17 trades):

  | | Win rate | Mean | Worst |
  |---|---|---|---|
  | Published (close exit) | 88% | +7.2% | −8.3% |
  | Re-priced at the open | 88% | +7.6% | −8.6% |

  The W10 emails print these from `config/constitution.yaml:98–102`.
- **Suggested fix.**
  - Test `rule.startswith("CAL")` before `rule.startswith("C")` in `trade_returns` and `mae`.
  - Re-run track 23.
  - Update W10's `base_rates` (`mean_pct` 7.6, `worst_pct` −8.6, pending the re-run).

### 4. M2's trend sign and volatility are defined differently from the research (discrepancies, small effect)

- **Excess return.**
  - `traderec/modules/m2_trend.py:56` computes `excess = ret_252 − rf_annual`, where `rf_annual` is today's T-bill
    rate (`pipeline.py:944`).
  - Tracks 15 and 23 compound the realized daily T-bill return over the same 252 sessions.
  - 14 of 736 leg-months flip, all borderline (|excess| < 1.4%), and they follow the rate cycle:
    - 7 legs are long in the research only, all in the 2022–23 hikes, when today's rate exceeded the trailing
      year's;
    - 7 are long in the pipeline only, in the 2019–20 and 2024–26 cuts.
  - Fix, if wanted: pass the trailing 252-session T-bill return, which needs a T-bill history from the provider.
    Otherwise, record the approximation in the design.
- **Volatility.**
  - `traderec/indicators.py:29` uses `ewm(span=60)` (`config/constitution.yaml:54`, `ewma_span: 60`), a half-life
    of about 21 sessions.
  - The research uses `ewm(com=60)`, a half-life of about 42: `research/code/15-short-futures-crypto/p1_trend.py:34`
    and `research/code/23-duration-verify/modules23.py:166`.
  - The median ratio is small (vol 0.96, leg size before caps 1.03). The pipeline reacts twice as fast after
    shocks, though: on 2020-04-01 QQQ's vol was 64% vs research's 51%.
  - Fix: pick one definition, `com` 60 as tested or `span` 60 as built, and record it in the design, which only
    says "60-day EWMA".
- **Returns.** The M2 sleeve earned 2.29% of NAV a year over T-bills, against 2.54% for R1 at s = 0.5.
  - 2019 is the largest gap: M2 decides from February (the launch month counts as decided) and sends at most three
    orders per email, deferring the rest to later batches.
  - The design caps cut the average gross from 60% to 39%: 25% per leg, 60% gross, 3% US-equity stress. The
    research had none of these caps.
  - The caps mostly cut the low-volatility bond and currency legs, so they cost little return.

### Checked and clean

- **Two-source rules on real second sources.** Nasdaq's SPY history and FRED's SP500, the live system's first
  choices, cover the whole window.
  - A second full replay with them (`--second-source history`) made **exactly the same 6,533 decision records** as
    the echo replay.
  - Their only failure was SPY on 2026-04-20 (Nasdaq 0.20% off), which is not a signal day.
  - On the 40 M1 and 4 W10 signal days, both sources matched the primary close to the cent.
  - The CBOE-vs-Yahoo VIX cross-check failed on 2026-02-06 only (17.76 vs 20.37), while M1 was already in a trade.
- **The broker at the end.**
  - No cancelled or stale orders.
  - No unsent emails.
  - One open forecast, for the open M3 trade; 379 resolved.
  - 122 distributions credited (SPY, QQQ, IEF, FXE, FXA), none on non-payers.
- **Risk engine.**
  - The trade budget peaked at 25 a year.
  - No cluster, drawdown, budget, kill-switch or fill alerts.
  - The drawdown governor never cut an entry. The drawdown passed 5% on six days only (2020-03-16 → 03-23), and
    nothing was entered then.

## Method

### Data, served as of each run

`fetch` composes `traderec.data.LiveProvider` for every download, using its retries, User-Agent and parsers. It
caches full histories as pickles outside the repo (default `/tmp/traderec-replay-cache`). `AsOfProvider` serves them
as of each run.

| Series | Source (via LiveProvider) | As of run date D |
|---|---|---|
| Daily bars: SPY, the 8 M2 legs, IBIT, ^GSPC, ^VIX | yfinance, `auto_adjust=False` | rows dated ≤ D (the 22:17 ET run sees D's close) |
| VIX | CBOE official closes | ≤ D |
| BTC-USD per UTC day | Coinbase daily candles from 2017; Yahoo fills any gap (none were needed) | UTC days ≤ D (a UTC day ends at 19:00/20:00 ET) |
| T-bill rate | FRED DTB3 series | the last print dated before D (H.15 publishes a day late) |
| Second-source close | primary close echoed, source `replay-echo` (flagged) | only for dates ≤ D |

- **Monthly runs** are served as of the last day of the month.
- **Adjusted closes** carry dividends up to 2026. Only ratios are ever used (M2 returns, the dividend inference,
  forecast scoring), and a ratio is unchanged by later dividends. So the adjustment leaks nothing.

### Second sources

- **The replay echoes.** As instructed, the replay gives `second_source_close` the primary close, marked
  `replay-echo`.
  - It is counted: 1,948 echoes, on SPY every session and on ^GSPC for the three W10 entries.
  - It is shown in the ledger's snapshots and in every email's sources.
  - Every two-source check therefore passed by construction.
- **Real sources exist.** The live fallbacks, Robinhood's and CBOE's quotes, only know today. But the live
  system's first choices, Nasdaq's historical quote and FRED's SP500, do serve 2019–2026.
- **Two cross-checks against them.** `fetch` caches both, then:
  - a full replay with `--second-source history` confirmed identical decisions;
  - `reconcile` re-checks every signal day (`second_source_signal_days.csv`).

### IBIT before 11 January 2024

- **The proxy.** IBIT did not exist, so M3 trades a proxy spliced to the real bars. It is flagged in every output,
  and its bars come from Coinbase hourly BTC-USD:
  - open = the 9:00–10:00 ET candle's (open + close)/2;
  - close = the price at 16:00 ET;
  - high/low over 9:00–16:00 ET;
  - all scaled by IBIT's first close divided by BTC at 16:00 ET that day (0.00057542).
- **What it leaves out.** The ETF's premium or discount, its fee drag, and weekend gaps beyond BTC's own.
- **Where it applies.** 20 of M3's 34 trades are on the proxy.
- **Timing.** Coin Metrics' daily value, which the research uses, is the same-day UTC close (checked against
  Coinbase). So research and pipeline weeks line up.

### Runs and services

- **Order of runs.** The loop follows production:
  - `run_monthly` for the month just ended, first thing on the 1st (08:13 ET);
  - `run_daily` Monday to Friday (22:17 ET), holidays included (they return `no_session`);
  - `run_weekly` on Sundays.
- **State.** `dry_run=False` on a work state directory, so the book evolves as it would live.
- **Services.** Stubs throughout:
  - `send` captures each email, re-validates it and writes a text copy;
  - `create_issue` returns None, so no issues are opened;
  - `healthcheck` records pings;
  - `fetch_comments` returns None.
- **Failures.** A run that raises is recorded and the replay goes on. None raised.

### Reconciliation

- **Research lists.** Tracks 13 and 23 are read from their `results/`. Track 15's R1 and R2 have no saved lists, so
  they are recomputed with track 15's own code from its cache:
  - R1: `p1_trend.tsmom_weights`, sampled on M2's decision dates;
  - R2: `p3_crypto.load`, with the weekly close vs its 10-week mean.
- **Matching.** Trades match on the signal date. Returns compare the pipeline's fill-to-fill return, including
  dividends paid as cash, with the research's `net`.
- **M2** is compared per leg and month, on sign, size before caps and target after caps. Its returns are rebuilt
  day by day from its fills and compared with R1's daily excess stream at s = 0.5.

## How to run

```
python scripts/replay.py fetch     --cache /tmp/traderec-replay-cache       # ~1 min of downloads
python scripts/replay.py run       --cache ... --work /tmp/replay-echo       # ~17 min
python scripts/replay.py run       --cache ... --work /tmp/replay-hist --second-source history   # optional
python scripts/replay.py reconcile --cache ... --work /tmp/replay-echo --compare /tmp/replay-hist \
                                   --out research/code/25-replay
```

- **Other periods.** `--start`/`--end` pick any window; `run` segments can be reconciled together (`--work A B`).
- **Other options.**
  - `--resume` continues an interrupted run.
  - `--no-cut` is the look-ahead diagnostic.
- **Tests.** `tests/test_replay.py` drives the harness offline through a synthetic market. It covers:
  - the as-of rules;
  - the echo and history second sources;
  - production order;
  - an end-to-end replay;
  - identical decisions with and without the as-of cut;
  - resume;
  - the reconciliation helpers.

## Limitations

- **Second sources** are echoed in the main replay. The cross-check shows that makes no difference here.
- **The IBIT proxy** has no premium or discount, and no fee drag.
- **The contango veto (R3)** was never exercised: yfinance has no expired crude contracts, so every M2 decision
  logged "not checked". Research R1 had no veto either.
- **Splits.** yfinance history is split-adjusted, so no corporate action reaches the paper broker, which has no
  split handling. USO's 1:8 reverse split (April 2020) fell while M2 held no USO. A split in a held ETF would
  mis-mark the lot live; worth a guard.
- **Fills** use the official open and fill model v1.0. No owner feedback exists, so the go-live fill and email
  gates are not measured.
- **Phase B modules** (options, M4, W8/W9, their shadow books) are skeletons at this commit and were not replayed.

## Files in `research/code/25-replay/`

| File | What |
|---|---|
| `summary.csv` | every metric above, by section |
| `m1_vs_track13_st1.csv`, `w10_vs_track23_cal90.csv`, `shadow_st1b_vs_track13.csv`, `shadow_w10_vs_track23.csv` | trade-by-trade matches, return differences and why a trade was missed |
| `w10_track23_cal90_repriced_open.csv` | track 23's W10 list, published vs re-priced at the open |
| `m2_targets_vs_track15_r1.csv`, `m2_returns_by_year.csv` | M2 per leg and month; sleeve vs R1 per year |
| `m3_weeks_vs_track15_r2.csv`, `m3_trades.csv`, `m3_sleeve_weight_monthly.csv` | M3 switch per week; trades (proxy flagged); sleeve weight |
| `admissions_cut_or_refused.csv`, `alerts_by_kind.csv`, `emails_by_year.csv`, `second_source_signal_days.csv` | risk-engine cuts; alerts; emails; signal-day source checks |
| `pipeline_trades.csv`, `nav_monthly.csv` | every M1/M3/W10 trade; month-end NAV, drawdown and SPY |
