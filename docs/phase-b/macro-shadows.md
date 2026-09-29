# Macro shadow books: W3, W4, the gold spike fade and the release log

Phase B build notes for design v3.3 §3 M5 ("Scheduled releases. Never traded; logged for calibration only") and
§3 "Shadow ledger" ("W3 (cool-CPI TLT), W4 (BoJ) and the gold spike fade; every scheduled-release reaction").
Every rule comes from `research/17-short-horizon-macro-events.md`: §2, §3.1, §5.2 (W3, W4) and §7 (R1, R2,
R6, R9, R12). Nothing here is emailed, traded or sent to an LLM.

## What was built

| File | What it holds |
|---|---|
| `traderec/modules/macro_shadows.py` | Pure rules: day-0 and forward moves, 2-year buckets, core CPI m/m as BLS publishes it, Fed and BoJ decisions, the W3/W4 checks, hypothetical trades (entry, exits, scoring), t tests, BH-FDR and the promotion summary |
| `traderec/runners/macro_shadows.py` | `daily(run, checks)`, the 22:17 ET hook, already wired as the last of `runners.SHADOW_RUNNERS` |
| `traderec/data/econ_calendar.py` | The calendar loader (pure) and the macro-data adapter: `LiveMacroData` (network) and `FakeMacroData` (tests) |
| `config/econ_calendar.yaml` | Every 2026-2027 release date from the official schedules, with sources; the owner's list of war onsets |
| `config/constitution.yaml` | `shadow.MACRO`, filled in and `enabled: true` |
| `tests/test_macro_shadows.py`, `tests/fixtures/macro_shadows/` | 45 tests (one live smoke test, skipped without `RUN_NETWORK_TESTS=1`); fixtures from real responses (1.2 KB) |

## The books, as implemented

**Release log (R1).** Every CPI, payrolls (NFP), FOMC, GDP, PCE, BoJ and ECB release is logged, then never traded.
PCE (BEA's Personal Income and Outlays) is in R1's list, so it is logged too.
- The **reaction session** is the first NYSE session on or after the release date. Every listed release comes
  before the 16:00 ET close. The BoJ announces around noon Tokyo time, which is the evening before in New York.
  Payrolls on Good Friday, 3 Apr 2026, react on 6 Apr.
- The **day-0 move** runs from the prior session's close to the reaction session's close:
  - SPY, TLT, GLD, USO and UUP (the dollar index `DX-Y.NYB` if UUP has no data), on total-return closes;
  - BTC, from the provider's per-UTC-day close (M3's source);
  - the 2- and 10-year yields, in basis points.
- The 2-year's day-0 move sets the **bucket**, track 17's surprise proxy (§2.1-2.2):
  - FOMC: hawkish at +5bp or more, dovish at -7bp or less;
  - CPI: hot at +4bp or more, cool at -6bp or less;
  - NFP: strong at +8bp or more, weak at -6bp or less.

  GDP, PCE, BoJ and ECB releases have no thresholds in the track, so they get no bucket.
- **Forward moves** run from the day-0 close over 1, 5 and 20 sessions, and are filled in as they mature.
- A record is complete 3 sessions after its 20-session mark, with anything still missing listed in `missing`.
- Releases in the same session are cross-referenced in `same_session` (e.g. GDP, PCE and ECB on 29 Oct).

**W3, cool CPI -> TLT (§5.2 W3; paper, since it fails BH-FDR).**
- Trigger, on a CPI release: the 2-year falls 6bp or more on the day, **and** core CPI m/m is 0.1% or less. Core
  CPI m/m is the change in FRED's `CPILFESL`, rounded half up to one decimal, as BLS publishes it.
- Trade: long TLT at the next open.
- Exits:
  - at the open after the 10-year closes above its pre-CPI close (the invalidation);
  - otherwise after 20 sessions (R6), selling at the open of session 21.

**W4, BoJ (§5.2 W4's BoJ sub-setup; paper; no edge claimed, n = 1).**
- Trigger: the BoJ raises its rate, **and** the Fed held at the FOMC decision nearest to the BoJ's (within 10
  calendar days). The rule is evaluated once both decisions are confirmed (see "Timing").
- Trade: long FXY at the first open after the later of the two decisions' sessions.
- Exits:
  - stop at USDJPY +1.5%, i.e. an FXY close at or below entry / 1.015;
  - target at USDJPY -4%, i.e. an FXY close at or above entry / 0.96;
  - otherwise after 20 sessions.

**Gold spike fade (§3.1: "reversed the next day in 8 of 8 war onsets"; R2: paper until n >= 10).**
- Trigger: a war onset the owner lists in `config/econ_calendar.yaml`.
- Trade: short GLD at the open after the onset's day 0; cover at the next open.
- Also recorded: the track's own measure, day-0 close to day-1 close (`research_f1`), and the day-0 move.
- An onset first seen by a run after its day-0 evening is recorded with `counted: false`. It stays out of the
  promotion count, because its outcome may already have been known when it was listed.
- A GLD day of +2% or more with no onset listed around it is logged as a `near_miss` (ledger and a run note),
  so the owner can decide whether it was one.

**Execution and scoring (all three).**
- Decisions are made on closes and filled at the next open, with the fill model's ETF slippage on both sides.
  Stops and targets are checked on closes, never as resting orders (§3a).
- `return` is the total return from the trade's side (distributions included, slippage deducted).
  `price_return` is the same without distributions.
- `baseline` is the mean open-to-open total return over the same number of sessions, across the 3 years before
  entry: the random-day bar (§1), with no look-ahead. `excess` = return - baseline for a long, and
  return + baseline for a short.
- Each trade carries a pre-registered base-rate forecast (`forecast_p_profit`, shrunk per R9 with κ = 0.25),
  resolved at exit with its Brier score (design §8).

## Promotion tests: what is recorded

`state.shadow.MACRO.meta.promotion` is recomputed every run from closed, counted trades, as
`{rule: {"n", "mean", "sd", "t", "p", "hit_rate", "min_instances", "min_t", "meets_n", "meets_t", "passes_fdr",
"ready"}}`.

| Book | Test | Recorded for it |
|---|---|---|
| W3 | R1: ≥24 paper instances, mean excess with t ≥ 2 net of costs, and BH-FDR 10% together with the rules tested alongside it | the excess per trade, net of slippage; t, two-sided p, BH-FDR across W3 and W4 |
| W4 | R1, as W3 (a post-release rule) | as W3 |
| Gold fade | R2: paper only until n ≥ 10 | counted n, return, excess, `research_f1`, hit rate |
| Release log | R1 (the record) and R12 (ii) and (iv): realized vs implied event moves; forward returns after triggered vs untriggered dates | day-0 and forward moves, the bucket, the W3/W4 evaluation on each CPI/BoJ record (the near-misses) |

"ready" means only that the track's numeric bar is met. Promotion is still decided at the quarterly and annual
reviews, with the design's other gates (§4, §7).

## Interfaces

- **Runner:** `daily(run, checks)`. Its order inside the evening:
  1. calendar checks;
  2. new releases, then the updates to open ones;
  3. W3, W4, the gold fade;
  4. walk the hypothetical trades;
  5. promotion summary;
  6. pruning.
- **State:** `state["shadow"]["MACRO"] = {"events": [...], "meta": {...}}`.
  - Every event carries `rule` ("RELEASE", "W3", "W4", "GOLD_FADE"), `id`, `signal_date` and `status`.
  - Release events: `kind`, `release_date`, `time`, `reference`, `prev_session`, `day0`, `fwd` ({"1", "5",
    "20"}), `src` (fallback sources only), `bucket`, `same_session`, `missing`, and `w3` (CPI) or `w4` (BoJ):
    the evaluation, with its reasons.
  - Trades: `ticker`, `side`, `entry_date`, `entry_price`, `exit_date`, `exit_price`, `exit_reason`,
    `sessions_held`, `held`, `return`, `price_return`, `baseline`, `excess`, `counted`, `forecast`.
  - `meta`:
    - `last_date`, `calendar_sha256`, `calendar_verified`;
    - `alerted`: alert keys with the date each last fired;
    - `onsets_seen`;
    - `promotion`;
    - `unavailable`: the R1 inputs this build cannot record, with the reason for each.
- **Ledger:** `shadow` records with `book: "MACRO"`, `rule` and `event`:
  - `release`, `complete` (the whole record) and `void`;
  - `signal`, `no_signal` and `unavailable` (evaluations);
  - `trade`, `entry`, `exit_signal` and `exit`;
  - `near_miss` and `data_problem`.
- **Adapter:** `MacroData` has `treasury_yields(tenor, years)`, `fred_series(id)` and `boj_basic_loan_rate()`.
  - The runner gets it with `macro_data_for(run.provider)`: `provider.macro_data` if the provider has one;
    otherwise, for a `LiveProvider`, a new `LiveMacroData` attached to it (one client and one cache per run).
  - Otherwise there is none, and every rule that needs macro inputs fails closed.
  - Tests inject `FakeMacroData` as `provider.macro_data`.
- **Calendar:** `load_calendar(path)` returns `EconCalendar`, with `active()`, `postponed()`, `covers()`,
  `coverage_gaps()` and `onsets`. `reaction_session(sessions, day)` gives the reaction session.

## Data sources and timing

| Input | Source | Available |
|---|---|---|
| ETF bars, BTC | the provider (yfinance; Coinbase for BTC) | evening |
| 2- and 10-year yields | Treasury's daily par yield curve CSV, `home.treasury.gov` | same evening |
| (fallback and cross-check) | FRED `DGS2` / `DGS10`, the same series | about a day later |
| Core and headline CPI | FRED `CPILFESL`, `CPIAUCSL` | release morning |
| Fed decision | FRED `DFEDTARU`, which changes the day after a decision | 1-2 days after |
| BoJ decision | BoJ basic loan rate file `cdab0101.csv` (the policy rate + 0.25 point) | its effective date, 1-4 business days after |

- **Retries.** A missing input is retried for `pending_sessions` (3) sessions, then recorded as unavailable with
  a data alert. A trigger never uses missing data.
- **Disagreeing yields.** If Treasury and FRED disagree by more than 2bp on a W3 input, W3 fails closed, with an
  alert.
- **Lagged decisions.** W4 is evaluated when the lagged official series confirm both decisions. Its hypothetical
  entry is still the first open after the decisions became public, so a W4 trade appears in the book up to about
  4 business days after its entry date. W3 and the release log use same-evening data.
- **No look-ahead.** Every series is cut at the run date. A test checks that the book is identical with and
  without the data after each run date.

## Operations and owner setup

No new secrets. The endpoints are public, and the adapter uses the project's `USER_AGENT`.

- **The calendar needs 2027 dates for BLS and BEA.**
  - On 2026-09-29, BLS (CPI, payrolls) and BEA (GDP, PCE) had not published their 2027 schedules. FOMC, BoJ and
    ECB are covered through 2027.
  - From 1 Jan 2027, the runner raises a monthly data alert: "config/econ_calendar.yaml has no CPI, NFP, GDP,
    PCE dates".
  - When the schedules appear, add the dates from the `source` pages, move `covered` and update `verified`.
- **Re-verify every 60 days** (`reverify_days`). After that, a monthly alert asks for a re-check of the dates.
  A shutdown (the CR expires on 11 Dec 2026) can postpone BLS and BEA releases.
- **Postponed releases.** Mark a postponed release `status: postponed`: the runner skips it and voids any record
  it made. Add the new date as a separate line.
- **War onsets.** Add war onsets to `geopolitical_onsets`, ideally the evening they happen:
  `{date, label, during_session}`. `during_session: false` means the news came after the close or on a closed
  day. A near-miss note in a run result is a prompt to decide.
- **State pruning.** Complete release records leave `state.json` 400 days after completion (`state_keep_days`);
  their ledger `complete` record keeps everything. Trades are never pruned. A year of the log (about 70
  releases) adds roughly 130-150 KB of state before pruning starts.

## Known limits and deviations

1. **W3 trades TLT shares, not the track's TLT call spread.**
   - There are no historical chains, and this runner is not in `OPTIONS_JOB_RUNNERS`.
   - The shadow score is TLT's total return with ETF slippage. It is not the spread's P&L, and not its 2.5-8%
     round-trip cost.
2. **W4's stops are checked on FXY, not USDJPY.**
   - They use FXY closes (yen per dollar, inverted), not USDJPY quotes, because FXY is the instrument and
     JPY=X's daily bars are not NYSE-session aligned.
   - The micro yen futures alternative is not modelled.
3. **W4's Fed pairing is my operationalization.** "The Fed holds" is read at the FOMC decision nearest to the
   BoJ's, within 10 days. The track names only the Oct 2026 cluster; every 2026-2027 BoJ meeting has such a pair.
4. **War onsets need a person.** Classifying an onset is a judgment, and the shadow book uses no LLM.
   - A missed run makes a timely listing look late: `first_seen` is the first run that saw it.
5. **Some of R1's fields are unavailable.** R1 also asks for the market-implied probability, the options-implied
   SPY/TLT event moves and (implicitly) the consensus. None has a free, reliable source here, so they are
   recorded as unavailable in `meta.unavailable`.
   - The implied moves could come from the 10:17 ET snapshots if SPY/TLT chains were added for this runner.
6. **Core CPI has one source.** FRED republishes the BLS series. BLS's public API rejected requests at its shared
   daily limit during development, so it is not a second source.
7. **Revisions.** CPI seasonal factors are revised each February. A W3 replay long after the fact (a backfill)
   would use revised data; the nightly run does not.
8. **"ready" in the promotion summary** uses two-sided p-values. The FDR family is W3 and W4 (the rules with
   an `fdr_q`); the gold fade's R2 bar is n only.

## Integrator notes

- `facts.monthly_report` reads any shadow book with `events` as W10's record, so MACRO shows up as a
  "MACRO (90-day score)" row whose signal count includes release records.
  - It does not break: every event has `signal_date`, and none has `scores`. A test renders and validates the
    monthly email.
  - The reports build may prefer a row per `rule`, using `status == "closed"`, `return` and `exit_date` for
    trades.
- `LiveProvider` needs no change: the runner attaches a `LiveMacroData` on first use. Wiring `macro_data` into
  `LiveProvider.__init__` instead would also work.
- The daily workflow needs no change. Most evenings the adapter makes one or two Treasury CSV requests (about
  15 KB each). It fetches FRED's CSVs and the BoJ file only on release days, or while W3 or W4 inputs are pending.
- `python -m pyflakes traderec tests` still reports `traderec/runners/edgar.py:7` (unused `typing.Any`). That
  file belongs to the EDGAR build.
