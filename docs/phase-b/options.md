# Phase B build notes: options infrastructure

This build covers option chains, fill model v1.0 for two-leg spreads, spreads in the paper broker, the snapshot store, and the 10:17 ET options job. The contracts are `docs/PHASE_B_CONTRACTS.md` §1, §3, §4 and §5. The design sections are v3.3 §3a (order kind (b) and the options rules), §4 (option expiry and option liquidity), §7 (fill model v1.0) and §10 (the schedule). The research tracks are 18 (the 10:17 job), 19 (finding M7) and 14 §6.7 (quote handling). The integrator merges these notes into `docs/INTERFACES.md` and `docs/OPERATIONS.md`.

## 1. What was built

| File | What |
|---|---|
| `traderec/options/chain.py` | `OptionChain` and the OCC helpers (unchanged); the CBOE and Yahoo normalisers; the selection helpers; `liquidity_check`; `chain_root` |
| `traderec/options/fillmodel.py` | The v1.0 spread fill decision, with the same API. No-fill reasons now use the contract's wording, and a model debit of zero or less is refused |
| `traderec/options/snapshots.py` | New. Filtered, gzipped chain snapshots in `state/options/<date>/`, kept under a daily byte budget |
| `traderec/options/job.py` | `run_options` (the 10:17 ET job), `mark_spreads(run)` (the daily hook, with the expiry safety net), and `status_lines` |
| `traderec/data/providers.py` | `DataProvider.option_chain`, `LiveProvider.option_chain` (CBOE, then Yahoo in market hours), and `FakeProvider(chains=...)` |
| `traderec/broker.py` | Spreads: `fill_spreads`, `spreads`, `mark_spreads`, `settle_spread`, `cancel_pending`; NAV includes spreads; the state round-trips them. `queue` now also checks that a spread is a vertical |
| `traderec/pipeline.py` | Two local edits: `status_text` lists spreads and pending spread orders, and `_fill_pending` skips spread orders (see §8) |
| `config/constitution.yaml` | The top-level `options:` block (`enabled: true`) and comments on `fills.options` |
| `.github/workflows/options.yml` | New. 10:17 ET Mon–Fri, in the `traderec-state` group; it commits `state/` and pings `HC_PING_URL_OPTIONS` |
| `tests/test_options.py`, `tests/fixtures/cboe_*_2026-09-28.json` | 77 tests, 75 offline plus 2 live CBOE smoke tests that run only with `RUN_NETWORK_TESTS=1`. The fixtures are CBOE payloads recorded after the 28 Sep 2026 close and trimmed to 72 XSP and 24 SPX/SPXW contracts (33 KB and 12 KB) |

## 2. Interfaces for the other builds

**Chains** (`traderec.options.chain`)

- `OptionChain(underlying, asof, spot, source, frame, raw_sha256)`.
  - `frame` has the columns in `CHAIN_COLUMNS`.
  - `asof` is `"YYYY-MM-DDTHH:MM:SS"` in ET.
  - `source` is `"cboe"`, `"yahoo"` or `"fake"`.
  - `mid` is NaN unless bid > 0, ask > 0 and ask ≥ bid.
- An SPX chain holds **SPX and SPXW** rows, and `root` tells them apart. Third Fridays list both at the same strikes, with different quotes.
  - Pass `root="SPXW"` to `strike_nearest` and `strike_by_delta` to pick one of them. These are optional keyword arguments, beyond the contract.
  - `chain_root("SPXW") == "SPX"` everywhere: in the provider, the broker and the job.
- CBOE marks a contract it did not model with IV 0. Its `iv` and greeks are NaN here, so `strike_by_delta` skips it.
  - Put deltas are negative. `strike_by_delta` compares |delta| with |target|, so -0.20 and 0.20 give the same strike.
  - A tie goes to the strike further out of the money.
- Yahoo chains have **no greeks**, so `strike_by_delta` returns None on them. Fail closed.
- `strike_nearest` gives the lower strike on a tie.
- `expiry_on_or_before(chain, limit, earliest=...)` and `expiries_between(chain, start, end)` are inclusive, and take dates as strings or Timestamps.
- `liquidity_check(chain, legs, cfg.constitution["options"]["liquidity"], expected_gain=None)`:
  - Each leg needs (ask - bid) ≤ 10% of its mid and open interest ≥ 500. A missing quote or a missing open interest fails.
  - The round trip is the natural width Σ(ask - bid) over |combo mid|. That is track 17's definition (`analyze_implied17.py`).
  - The round trip must be ≤ 10%, or ≤ 20% when `expected_gain` ≥ 2 × the natural width. **`expected_gain` is per share of the combo**, in the same units as the debit.
  - It returns `{"ok", "reasons", "per_leg", "round_trip_frac", "round_trip_cap", "combo_mid", "natural_width"}`.

**Fill model** (`traderec.options.fillmodel`): `combo_quote`, `model_price`, `order_prices` (limit and stated max or min from a quote) and `decide_fill`, as in contract §3.

**Broker** (`PaperBroker`)

- `fill_spreads(date, time_et, chains)`:
  - It closes before it opens.
  - Only orders created before `date` are eligible, with a chain whose `asof` date equals `date`. An order without such a chain stays pending, untouched. The job handles missing data (§3).
  - `last_fill_meta[intent_id]` holds `{"attempt", "reason", "quote", "cancelled", "model_price", "limit_price", "max_price", "time_et"}`. Fills also carry `"realized_pnl"`, and closes add `"entry_price"` and `"cost"`.
  - These are cancelled with a reason:
    - an opening order that cannot be paid for;
    - an opening order on a trade that already holds a spread;
    - a closing order with no open spread.
- `spreads(account=None, module=None)` returns records with `key` = `"account|trade_id"`.
  - They also carry `width`, `multiplier`, `intent_id` and `fill_time`, beyond the contract.
  - `mark` is None until the first mark. The NAV counts the spread at cost until then.
- `mark_spreads(date, chains)` returns `{key: mark per share}` for the spreads it marked.
  - The mark is clamped to [0, width].
  - A spread without a same-day chain or a two-sided quote keeps its last mark.
- `settle_spread(key, date, value_per_share, reason)`:
  - The value is clamped to [0, width].
  - It cancels pending orders of that trade.
  - The fill's `intent_id` is `SETTLE-<date>-<trade_id>`.
- `cancel_pending(intent_id, date, reason)` is new: it cancels a queued order now.
- `queue` now also rejects:
  - legs that are not a vertical: one OCC root, one right, one expiry, two strikes, ratio 1;
  - an opening order that is not a debit (for calls, the long strike must be below the short).
- `fill_pending` never touches spread orders.

**The runners' hooks** (called by the job; module state is the runners' job)

- `on_spread_fill(run, fill, intent)` fires for an opening fill, a closing fill, and **an expiry settlement**.
  - A settlement has `intent.reason == "expiry_settlement"`, `intent.side == "sell"` and an `intent_id` starting with `SETTLE-`. Match the trade on `trade_id`.
- `on_spread_cancel(run, intent, reason)` fires in two cases:
  - a no-fill at the snapshot, whose reason is the fill model's, e.g. "model price above the stated maximum";
  - an order whose session passed without an options run, whose reason starts "its session … passed".
- `roots_needed(run)` returns roots such as `{"XSP"}` or `{"SPXW"}`. They are mapped to their chain, and each root a runner asks for gets a surface sample in its snapshot (§4).
- `options_job(run, chains)` receives only **valid market-hours chains of the run date**, keyed by chain root.
  - A root that failed is absent. Fail closed.
  - `option_shadows` runs inside `pipeline._shadow_guard`; `m4` and `macro` raise, like trading runners.
- In the evening, the modules price their orders with `run.provider.option_chain(root)`. The provider's memo cache shares that snapshot with `mark_spreads(run)`.

## 3. The 10:17 ET job

`python -m traderec options [--date D] [--dry-run] [--force]` runs `run_options` with run kind `"options"`, one run per ET date. It does this, in order:

1. Begin. The run is idempotent; `--force` re-runs the latest run from its pre-run state; a dry run works on a copy.
2. **Cancel missed orders.** A spread order whose session (the first trading day after its creation) is before today is cancelled, with a "fill" alert, and `on_spread_cancel` is called. A day order cannot fill later.
3. **Snapshot** every root needed:
   - roots with orders due today;
   - roots of open spreads;
   - each runner's `roots_needed`.

   A chain is used only if its `asof` is on the run date inside `options.snapshot_window_et` (10:15–16:00 ET), with a positive spot and at least one contract. CBOE's quotes lag about 15 minutes, so 10:15 means quotes from 10:00 or later. Each chain gets a snapshot file and a `snapshot` ledger record (§4). A chain that fails logs a `signal` record (`check: option_chain`, `ok: false`) and a note.
4. **Fill** with `broker.fill_spreads`, one root at a time, `time_et` being the chain's HH:MM.
   - Each decision gets a `fill` ledger record: the fill, or `type: no_fill` with the model price and the reason.
   - Fills go to `state["fills"]` with `order_type`, `ref_price` (mid), `natural_width` and `attempt`, which the fills gate needs.
   - The owning runner's hook is called.
   - A closing no-fill raises a "fill" alert, since the module must re-issue the exit tonight; an opening no-fill is a note.
5. **Mark** open spreads at the snapshot's mid, and log a `mark` record (`kind: spreads`).
6. If a root with orders due today has no usable chain, the run ends here as **`data_missing`**: a retryable status, a "data" alert and a *fail* ping. Its orders stay pending. A retry the same day continues from the saved state.
7. Otherwise, call each runner's `options_job(run, chains)`, then finish with `ok`.

**Scheduled runs** (no `--date`) read the clock first. Before 10:15 ET the run returns `too_early`, and after 16:00 ET `too_late`, both touching nothing. `options.enabled: false` returns `disabled`. A weekend or NYSE holiday is recorded as `no_session`.

**The daily hook** `mark_spreads(run)` runs in `pipeline._daily` before `_mark`, and only when spreads are open.
1. **Safety net.** A spread open on or after its expiry date is settled at intrinsic value from the underlying's official close on that date. XSP uses ^GSPC ÷ 10; SPX and SPXW use ^GSPC; SPY, USO and DAL use their own close.
   - The fill is recorded with reason `expiry_settlement`, with an "expiry" alert.
   - The pending close for that trade is cancelled, and a `correction` record is logged.
   - The runner's `on_spread_fill` gets the settlement.
   - When that close is missing, a "data" alert is raised and the next run retries.
2. **Marks.** The other spreads are marked with chains stamped on the run date at or after `options.close_after_et` (16:00).
   - A missing or earlier chain keeps the last mark, with a note.
   - A legs-only snapshot (well under 1 KB) and a `snapshot` record are written for each chain used.
3. `broker.mark()` then counts spreads at mark × contracts × 100, or at cost before their first mark, inside `positions_value`.

## 4. Snapshots

- **Path.** `state/options/<date>/<root>-<HHMM>.csv.gz`, where HHMM is the quotes' ET time.
- **File.** A `#meta {json}` line, then a CSV of `CHAIN_COLUMNS`, gzipped with mtime 0 so the bytes are reproducible.
  - Prices are rounded to 4 decimals and gamma to 6; counts are integers.
  - `snapshots.load_snapshot(path)` reads a file back as an `OptionChain`. M4's re-pricing on real XSP quotes (design §3 M4, "before shipping") can use it.
- **Always kept.** The legs of pending and open spreads, and the `legs` of every module's and shadow book's `open_trade`.
- **Surface sample.** Only for roots a runner asked for:
  - expiries 20–120 days out, the last one listed in each ISO week, at most 12 spread evenly;
  - per expiry and right, the listed strikes nearest a 2.5% grid within ±25% of spot.
- **Budget.** `options.snapshots.max_bytes_per_day` is 100 KB, across every root and run of the day. It is shared equally among the surface roots still to store.
  - An over-budget sample is coarsened: twice the strike step and half the expiries, per level.
  - If even the coarsest level does not fit, only the legs are written. Legs alone can therefore exceed the budget, but they take about 0.4 KB.
  - Measured on the 28 Sep chains at level 0: XSP 11.5 KB (358 rows of 16,840), SPX 15.7 KB, SPY 10.8 KB.
- **The `snapshot` ledger record.** `{"kind": "option_chain", "root", "source", "asof", "spot", "raw_sha256", "needed_for", "budget", "path", "bytes", "file_sha256", "rows", "rows_total", "level", "surface", "legs_kept", "legs_missing"}`.
  - `raw_sha256` hashes the raw CBOE body the fills saw. For Yahoo it hashes the frames' CSV.

## 5. Data sources

- **CBOE**, the primary source: `https://cdn.cboe.com/api/global/delayed_quotes/options/{sym}.json`. It answers 307 to `cdn-api.cboe.com`, and the provider follows the redirect.
  - `sym` is `_XSP` or `_SPX` for index roots (`CBOE_INDEX_OPTION_ROOTS`) and `SPY`, `USO` or `DAL` for equities.
  - Files are 6–13 MB and parse in 0.2–0.5 s.
  - `timestamp` is UTC. `data.last_trade_time` and each contract's `last_trade_time` are ET without a zone. These were checked live on 2026-09-29, and a live smoke test passed.
  - The same retries, 20 s timeout, User-Agent and memo cache as the other `LiveProvider` calls apply. `sources["option_chain:<root>"]` records the source used.
- **yfinance**, the fallback, is used **only 09:30–16:00 ET on trading days**, by the provider's clock. Track 14 §6.7 says never to use Yahoo's after-hours quotes. Outside those hours a CBOE failure raises `DataError`.
  - It fetches every expiry up to 200 days out, one request each. Index roots use `^XSP` and `^SPX`.

## 6. Owner setup

1. **A healthchecks.io check for the options job.** Create it as in OPERATIONS §2(e):

   | Check | Cron expression | Time zone | Grace time | Its ping URL goes in |
   |---|---|---|---|---|
   | `traderec options` | `17 10 * * 1-5` | `America/New_York` | 2 hours 30 minutes | `HC_PING_URL_OPTIONS` |

   The job works at 10:17 ET in both seasons, because the clock check turns away the winter 09:17 EST slot. The grace time covers GitHub's cron delay and the retry slots (11:17 and 12:17 EDT in summer, 11:17 EST in winter), which run when an earlier slot could not read usable option quotes (exit code 3).
2. No API key is needed. CBOE's delayed quotes are public.
3. Paper mode needs nothing else.
   - In Robinhood you place the spread yourself after 10:00 ET, as the spread emails say.
   - The paper book fills it from the 10:17 snapshot.
   - Your own fill goes in the trade issue as `filled <contracts> @ <net price> [ROOT]`. That is the spread-email build's format.

## 7. Known limits

- **One snapshot a day.** The model's single 10:17 decision stands in for "limit after 10:00, then one re-price at 11:00". Quotes can move by 11:00, and the model does not see that.
- **Not modelled:**
  - the displayed size, which track 18 §5.1 includes but the design §7 rule does not;
  - rounding to the $0.05 tick;
  - commissions;
  - the staleness guard (a move of more than 0.5% in SPX or 2 points in VIX), which is in track 14 but not in the design.
- **Zero-bid legs.** A leg with a zero bid has no mid, so a spread whose short leg is worth nothing cannot be closed by the model. It stays open until the expiry safety net settles it at intrinsic value. The M4 and W8/W9 builds may prefer not to send exits for worthless spreads.
- **AM-settled SPX.** Third-Friday SPX options settle on the opening quotation (SOQ), but the safety net uses the close. XSP and SPXW are PM-settled, so this only matters for root `SPX`, which the modules avoid. The safety net should never run.
- **Liquidity rule.** The design's open-interest rule (≥ 500 per leg) fails most XSP strikes. On the 28 Sep close the ATM and 105% calls for 20 Nov had OI 203 and 84, though their quotes were tight: 0.8% and 1.8% of mid. Track 14 would exempt market-maker-quoted index options; the design does not. M4's SPY fallback covers this case.
- **No historical chains.** `--date` for a past day cannot fill anything: its chains fail the date check, so due orders stay pending and are cancelled the next day as missed.
- **Missed runs.** If the options job misses a session entirely, that session's orders are cancelled at the next run, and on the evening of the missed session the modules still see `pending_entry`.

## 8. Deviations and notes for the integrator

1. **`pipeline._fill_pending` edit.** This is outside the two edits my brief allowed. `_fill_pending` collected the tickers of *every* pending order to fetch their opens. A spread order still pending at 22:17, because the options job failed that day, made the daily run call `daily_bars("XSP")`, which crashed the run. It now skips `spread_limit` orders. This is one line, and `test_daily_run_skips_pending_spread_orders_at_the_open` covers it.
2. **Chains without quotes.** `fill_spreads` leaves orders without a same-day chain pending, where the contract reads "every pending spread_limit intent created before date". The job then either retries the same day (`data_missing`) or cancels the order as missed the next day. This keeps a CBOE outage from being booked as a no-fill.
3. **Fill window.** The window is 10:15–16:00 ET, not "10:17". The design names a 10:17 snapshot; the window lets a late GitHub cron still count, and 10:15 guarantees quotes from 10:00 or later.
4. **Additions beyond the contract:**
   - `PaperBroker.cancel_pending`;
   - the extra spread fields;
   - the optional `root=` on the strike helpers;
   - `chain_root`, `snapshots.load_snapshot`, `job.status_lines` and `job.intrinsic_value`;
   - `FakeProvider.chain_calls`, and exceptions in `chains=` lists to simulate failures.
5. **Stricter than the contract**, both failing closed: `queue` rejects non-vertical and credit opening spreads, and the mid is NaN for a crossed quote.
6. **Constitution changes.** `options.enabled` is now true. The block adds `preferred_root`, `min_entry_dte` (40), `close_sessions_before_expiry` (1), `snapshot_window_et`, `close_after_et`, `liquidity` and `snapshots`, citing design sections. `version` is unchanged.
7. **Pre-existing pyflakes warnings.** `python -m pyflakes traderec tests` reports two, both in files I don't own: an unused `typing.Any` in `runners/edgar.py` and in `runners/macro_shadows.py`.
8. **Merged docs.** Add `HC_PING_URL_OPTIONS` to OPERATIONS §2(c) and (e), and the `options` workflow to its schedule table. Add `state/options/` to OPERATIONS §8.
