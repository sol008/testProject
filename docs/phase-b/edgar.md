# EDGAR/FINRA shadow screens

Build notes for the integrator: what was built, its interfaces, operations, owner setup, the promotion tests and
known limits. The sources are design v3.3 §3 "Shadow ledger", §5 (never-list), §8 (evidence) and §10 (data
table); track 16 §10.2 and §10.4 (SH-1 to SH-4); and track 05 §3.7 and §11 A (CEF tender capture).

## What was built

Five shadow setups are screened every evening inside the daily run. They are paper only: no emails, no orders,
no LLM.
- Each trigger becomes a shadow event. Its entry and exit are recorded from prices, and it is scored at the
  track's horizon.
- Each near-miss is logged: the trigger held, but a universe or data check failed.

D is the EDGAR filing date and s1 the first session after it.

| Setup | Trigger | Entry | Exit | Universe |
|---|---|---|---|---|
| **SH1** insider cluster (monitors a rejected setup) | ≥2 directors or officers with open-market purchases within 30 calendar days (Form 4, code P, common stock, filed ≤14 days after the trade); 90-day issuer lockout; the stock's close near the trade within ±25% of the insiders' price | open of s1 after the cluster-completing Form 4 | close of session 20 | price ≥ $5, market cap ≥ $300m, 20-day median dollar volume ≥ $1m |
| **SH2** special dividend (incubate) | an 8-K declaring a dividend ≥1.5× the median regular dividend of the prior 2 years (or a first dividend) and ≥1% of the price, ex-date 3–75 days after D, not contingent | close of s1 | close of the last session before the ex-date | price ≥ $5, dollar volume ≥ $1m |
| **SH3** activist 13D (monitors a rejected setup) | an original Schedule 13D with a listed activist among the filers; 90-day lockout per company | close of s1 | close of session 20 | market cap ≥ $300m, plus the track's base tradability (price ≥ $2, dollar volume ≥ $100k, 60 sessions of history) |
| **SH4** near-completion cash merger (incubate, as a cash substitute) | a watched cash deal (cash price, no stock) whose target reports all of: vote passed, all regulatory approvals received, expected close ≤30 days away, no financing condition | close of s1 after the last approval 8-K | the deal's cash at its closing date; after a break, the next close; otherwise the 60-day cap | market cap ≥ $300m |
| **CEF** tender capture (track 05) | a listed fund's unconditional self-tender at ≥98% of NAV while the fund trades ≥8% below NAV; the offer must expire within 60 days of the entry; 120-day lockout per fund | open of s1 | accepted shares tendered at the tender price; the rest sold at the close 3 sessions after expiry; 60-day cap | market cap ≥ $300m, dollar volume ≥ $1m (design §5) |

Two proposed screens were not built because they have not been approved: CEF wide-discount buys and spin-offs at
session 61.

## Files

- `traderec/data/edgar.py`: the network adapters (`EdgarClient`, `FinraClient`, `RateLimiter`) and pure payload
  parsers (`parse_efts`, `group_filings`, `parse_form4`, `parse_special_dividend`, `parse_merger_terms`,
  `parse_merger_update`, `parse_cef_tender`, `parse_cef_tender_result`, `parse_shares_outstanding`,
  `parse_finra_si_rows`, `html_to_text`, and others).
- `traderec/modules/edgar_screens.py`: the rules, scoring and promotion tests, with no I/O.
- `traderec/runners/edgar.py`: `daily(run, checks)`.
- `config/constitution.yaml`, block `shadow.EDGAR`: enabled; each parameter cites its source section.
- `tests/test_edgar.py` and `tests/fixtures/edgar/`: recorded EDGAR, XBRL and FINRA payloads, excerpted, with
  e-mail addresses redacted. There are 49 files (245 KB), each under 25 KB.

## Interfaces

**Runner.**
- `traderec.runners.edgar.daily(run, checks)` is the contract's shadow hook and runs inside
  `pipeline._shadow_guard`.
- `config(run)` merges `shadow.EDGAR` over `DEFAULTS`. The two are kept equal, and a test checks this.
- `sources(run, cfg)` returns `(provider.edgar, provider.finra)`:
  - a `LiveProvider` without them gets an `EdgarClient()` and a `FinraClient()` attached for the run;
  - any other provider without `edgar` skips the book with a note, so the other builds' fakes need nothing.

**Adapters.** They are injected through the provider; the tests pass a fake `session`.
- `EdgarClient(user_agent=None, session=None, max_rate=8, workers=4, ...)`:
  - `start(seconds, documents)` sets the run's budget;
  - `search(forms, start, end, q="", ciks=None)` returns EFTS hits, and `search_total(...)` their count;
  - `document(ciks, adsh, filename)` returns a document's text;
  - `documents([(ciks, adsh, filename), ...])` fetches in threads under one shared rate limit;
  - `company(cik)` returns the submissions header;
  - `shares_outstanding(cik, asof)` and `public_float(cik, asof)` return XBRL facts as filed by `asof`;
  - `stats` counts the run's work.
- `FinraClient().short_interest(symbol, asof, lag_days=12)` returns the latest settlement published by `asof`
  (settlement + 12 days). It asks api.finra.org first, then falls back to the cdn file.
- Errors: `EdgarAccessDenied` (HTTP 403), `BudgetExhausted`, and `DataError` for the rest.

**State** is kept in `state.shadow.EDGAR`: the contract's §6 keys plus the book's own.
- `events`: the shadow events (below).
- `seen`: `"SETUP:accession"` → filing date, pruned after 7 days.
- `cursor`: setup → the last filing date screened for good. `started`: setup → the first date screened.
- `insiders`: SH1's purchases by issuer CIK, pruned to the window.
- `lockout`: `"SETUP:cik"` → the first date a new event may start.
- `deals`: SH4's watchlist by target CIK: the terms, plus the dates of the vote, the approvals, the expected
  close, and any completion or termination.
- `last_run`: the counts, SEC requests and seconds of the last run, and whether work carried over.

**Event fields.**
- Identity:
  - `id`, `setup`;
  - `signal_date` (D), `detected` (the run date), `late` (detected on or after s1);
  - `ticker`, `cik`, `name`, `adsh`.
- Plan:
  - `entry_due` (s1);
  - `entry_basis`, the track's: `open` for SH1 and CEF, `close` for SH2, SH3 and SH4;
  - `exit_due`: the date the exit is checked. For SH2 this is the expected ex-date.
- Measured before s1:
  - `price`, `dvol20`, `mcap`, `mcap_basis`;
  - `bucket`, `cost` (the round trip);
  - `bench`: SPY from a $2bn cap, IWM below.
- Annotations:
  - `short_interest` (from FINRA);
  - `tbill` (SH4 only);
  - `details`: the setup's parsed facts;
  - `forecast`: `{"p", "question"}`; `outcome` and `brier` are added at the exit.
- Status: `pending_entry` → `open` → `closed`, or `void` (with `void_reason`).
- Entry:
  - `entry_date`, `entry_open`, `entry_close`;
  - `filing_reaction` (SH1, SH3);
  - `time_stop` (SH4, CEF).
- Exit:
  - `exit_date`;
  - `scores[label]`: the label is `"20"` for SH1 and SH3, `"ex-1"` for SH2, `"deal"` for SH4 and `"tender"` for
    CEF.

What each score holds:
- Every score: `return` (the net return the promotion test uses, on the setup's basis), `basis`, `exit_date`.
- SH1, SH2 and SH3: `open` and `close`, each `{raw, bench, excess, net}`.
- SH4: `outcome` and `days`; per basis, `{entry, raw, net, annualized}`.
- CEF: `accepted`, `tender_price` and `remainder_price`, and the source of each.

**Ledger.** Each record is a `shadow` record with `"book": "EDGAR"` and one of these `event` values:
- `signal`;
- `filtered`: a near-miss, with its `reasons`;
- `entry`, `scored`, `void`;
- `watch`: SH4 added a deal;
- `data_missing`: a source failed, and the date is retried.

**Reports.** For the reports build, `traderec.modules.edgar_screens` provides:
- `book_summary(events, month)`: monthly rows per setup, `{name, signals, closed, mean_ret}`;
- `setup_stats(events, setup)`;
- `promotion_test(events, setup, rule, tbill=None)` → `{stats, checks, passed, demote}`, where `rule` is
  `shadow.EDGAR.<setup>.promotion`;
- `reaction_split(events, setup, asof)`: track 16 P2's rolling 24-month split of filing reaction against
  follower return.

Today `facts.monthly_report` reads every book that has `events` the way it reads W10's (90-day scores). It would
therefore show the EDGAR book with signals but no closed events until it uses `book_summary`.

## Operations

**When.**
- The screens run inside the 22:17 ET daily run, after the Phase A shadows.
- EDGAR accepts filings until 22:00 ET, so a date is screened for good from 22:05 ET.
- In winter the daily job's first slot (02:17 UTC) runs at 21:17 EST. That evening's date is then screened
  provisionally: events are recorded, but the date is not marked done. The next evening screens it again for good,
  and `seen` prevents duplicates.

**Catch-up.**
- Each setup resumes from its cursor. The last final date is searched again, for filings indexed late.
- It catches up at most 7 days. Older dates are dropped, with a data alert.
- A new install starts at its first run, with no backfill. SH1 starts counting clusters after 30 days of
  collected purchases.

**Budget per run.**
- Limits: 90 s of EDGAR work, 150 documents and 40 price lookups, at no more than 8 SEC requests a second.
- Work past the budget carries over: a date counts as screened only once all of it was.
- Events are still entered and scored with whatever budget is left.
- A normal evening is well inside the budget. SH1 fetches only the Form 4s that the EFTS purchase pre-filter
  returns: 51 of 372 on 2026-09-28. The other setups need a handful of documents.

**Failures: fail closed.** When a source fails (EFTS, www.sec.gov, data.sec.gov, or price or NAV data):
- nothing is recorded for that setup and date;
- a `data_missing` record is logged and `run.alert("data", ...)` is raised;
- the date is retried at the next run.

The alerts:
- `EDGAR <setup> <date>: www.sec.gov refused the filing documents: set the SEC_USER_AGENT secret ...` (HTTP 403);
- `EDGAR <setup> <date>: source unavailable (...)`;
- `EDGAR SH1: the purchase pre-filter found no Form 4 among N filed <date>; check EFTS`;
- `EDGAR CEF <date>: no NAV series X<T>X for <T>'s tender offer; not screened`;
- `EDGAR <setup>: filings of <d1> to <d2> were not screened (more than 7 days behind)`.

Two cases are not alerts:
- A stock without usable price data is a near-miss.
- An event whose prices never arrive is voided after 10 days, and kept.

**Run note.** Each run adds `EDGAR shadow: screened N setup-days; signals …; K SEC requests; S s`. When the budget
ran out, it adds "work cap reached, the rest carries over".

**Switches.** `shadow.EDGAR.enabled` turns the book off; `enabled: false` inside a setup's block turns off that
setup.

## Owner setup

Add one Actions secret (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value | What happens without it |
|---|---|---|
| `SEC_USER_AGENT` | A name and a contact of your choosing, for example `Your Name <your contact address>`. The SEC's fair-access policy asks automated tools to say who is asking. The value is sent only to *.sec.gov; nothing writes it to the repository, the state or the ledger | www.sec.gov refuses the filing documents (HTTP 403, "Undeclared Automated Tool"). SH3 still runs, because it needs only EFTS and data.sec.gov. SH1, SH2, SH4 and CEF raise a data alert on each evening they need a document; those dates are retried (up to 7 days back) once the secret is set |

- The daily workflow must pass the secret to the pipeline (an integrator action below).
- No other keys are needed: EFTS, data.sec.gov and FINRA are open.

## Promotion tests

Each test is pre-registered in its track. The table shows what each needs and what is recorded for it.

| Setup | Test (track 16 §10.2; all must hold) | Recorded for it |
|---|---|---|
| SH1 | ≥60 shadow trades; mean net excess ≥ +1.0% per trade; month-clustered t ≥ 2.5; the median filing reaction (close D−1 → close D+1, excess) below +1.0% over the same period | `scores["20"]` (net excess on the open basis; both bases kept), `filing_reaction`, `signal_date` (for the month clusters), `cost`, `bench` |
| SH2 | ≥30 trades; mean net ≥ +0.5%; t ≥ 2.0; median > 0 | `scores["ex-1"]` (close basis), and in `details`: amount, yield, regular median, expected and observed ex-dates |
| SH3 | as SH1 | `scores["20"]` (close basis), `filing_reaction`, `details.activist` |
| SH4 | ≥30 deals; realised annualised return ≥ T-bill + 3% net; no break loss above 2% of the shadow book | `scores["deal"]` (`return`, `days`, `outcome`), `hold_days`, and `tbill` at the signal |
| CEF | none: track 05 pre-registers none, though design §3 says each shadow setup has one | `scores["tender"]` (the accepted fraction and price with their sources, the remainder price, the SPY excess), and in `details`: discount, NAV, % of NAV, offer size, expiry |

- **The tests.** `promotion_test` implements them, with the thresholds in `shadow.EDGAR.<setup>.promotion`.
  Promotion needs the owner's approval (track 16 P2). `demote` is set when the mean of the last 30 closed events
  is negative.
- **SH4 readings.**
  - The annualised return is capital-time weighted: the sum of net returns × 365 / the sum of holding days, as if
    the deals were held one after another.
  - The hurdle is the average T-bill rate at the signals, plus 3%.
  - "2% of the shadow book" is read as the worst loss × the 5% single-stock weight of track 16's sizing rule. A
    break that loses more than 40% therefore fails the test.
- **CEF.**
  - `promotion_test` reports the statistics, with `passed: None`.
  - The owner should pre-register a test before the first review. The recorded fields support one shaped like
    SH2's; for example: ≥30 events, mean net ≥ +2% (the low end of track 05's +2–6%), t ≥ 2.0.
- **Forecasts.** Every event carries a base-rate forecast (design §8), scored with a Brier score at the exit. The
  win rates come from track 16:
  - §2: SH1 0.42, SH2 0.52, SH3 0.42;
  - §4.1: SH4 0.95;
  - CEF has none.
- **Never-list floors.** Events keep `price`, `dvol20` and `mcap`, so a review can restrict any setup to the §5
  floors ($300m, $1m) before a promotion.

## Deviations from the tracks and the design, and why

1. **Filings are found through EFTS, not the Atom feed or the daily index.** Both of those are on www.sec.gov and
   are refused without a declared User-Agent. EFTS answers, filters by form and by text, and gives tickers and
   8-K items.
2. **SH1 fetches only pre-filtered Form 4s.** EFTS is searched for the text "P", which found all 81 purchase
   Form 4s over the two days checked. This cuts about 370 fetches a night to about 50. A nightly health check
   alerts if the filter returns nothing on a busy day. There is no history backfill, so clusters count only after
   a 30-day warm-up.
3. **SH2 takes the amount and ex-date from the 8-K.** The track's backtest used Yahoo's later dividend history,
   which would be look-ahead in a live screen.
   - The ex-date is the stated one. Failing that, it is the record date (T+1 settlement); for a distribution of
     ≥25% of the price, it is the session after the payable date.
   - At scoring, the ex-date is checked against the price data. The check accepts 0.75–2× the declared amount,
     because a special can go ex together with a regular dividend.
4. **How SH4 finds and reads deals.**
   - It watches cash deals from their definitive proxy (DEFM14A).
   - When an unwatched company files a vote 8-K, SH4 looks up that company's proxy from the last year.
   - It reads the target's own 8-K and DEFA14A news with regular expressions.
   - It adds the design's 60-day holding cap (§1) as a time stop.
   - The promotion-test readings are above.
5. **CEF.**
   - It has no promotion test (above).
   - Track 05 gives no universe or timing, so the design's §5 floors ($300m, $1m) and the next-open entry apply,
     and the offer must expire within the 60-day cap.
   - NAV comes from Yahoo's `X<ticker>X` series. The market cap uses the shares outstanding stated in the offer.
   - Acceptance comes from the fund's final amendment; without one, the offer size is used, as if every holder
     tendered.
   - The tender price comes from the amendment; without one, it is the offer's % of NAV at pricing.
   - The fund's distributions are left out, which is conservative.
6. **Both entries are recorded.** The brief says to enter at the next open, but the tracks enter SH2, SH3 and SH4
   at the close of s1. Each event keeps both; the promotion test uses the track's basis (config `entry`).
7. **Provisional screening before 22:05 ET**, for the winter slot (see Operations), so that events are on record
   before their entry.
8. **Market cap.** It is the latest reported shares outstanding (XBRL, as filed by D) × the last close. When no
   share count is filed, the public float stands in, which understates the cap.
9. **FINRA short interest is only an annotation.** Track 16 lists it as a source, but no rule uses it.
10. **The activist list is track 16's, verbatim**, with its mild hindsight and possible name misfires, so the
    shadow record matches the tested definition.

## Known limits

- **Regular-expression parsing.** Unusual wording can hide a special dividend, a merger milestone or tender terms.
  In that case nothing, or a near-miss, is recorded; the screen never guesses.
- **SH4 coverage.**
  - It follows only deals it saw from their proxy or their vote.
  - Stock and mixed deals are excluded.
  - CVRs are recorded but not valued.
- **EFTS.** It is the EDGAR website's own search API, not a documented one. A format change fails closed with
  alerts, and the SH1 pre-filter check covers SH1's dependence on it.
- **Outages.** An outage longer than 7 days loses screening days (with an alert). There is no historical
  backfill.
- **Prices** are daily bars through the provider, as total return from `adj_close`.
  - A halted or delisted SH1 or SH3 stock exits at its last close after 10 days.
  - A missing series voids the event.
- **SH1 ticker validation.** It requires the close near the trade date to be within ±25% of the insiders' price
  (track 16 §1.5). A reused ticker can still slip through.

## Integrator actions

- Add `SEC_USER_AGENT: ${{ secrets.SEC_USER_AGENT }}` to the env of the "Run the daily pipeline" step in
  `.github/workflows/daily.yml`. Add the Owner setup row to `docs/OPERATIONS.md` §2(c).
- For the EDGAR book, monthly and quarterly reports should use `book_summary`, `promotion_test` and
  `reaction_split` instead of the W10 reading of books that have `events`.
- Optional: attach `EdgarClient` and `FinraClient` in `LiveProvider` instead of relying on the runner attaching
  them itself.
- Owner decision: pre-register a CEF promotion test.
