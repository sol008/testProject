# Phase B build notes: the crypto shadow books (M6 and the ETH switch) and the hourly 24/7 job

Design v3.3: §3 "M6", "M3" and "Shadow ledger", and §10 "hourly, 24/7". Research: tracks 05 (§7, §11), 15 (§1.2, §4.7, R2), 19 (M12, m7) and 20. Contract: `docs/PHASE_B_CONTRACTS.md` §6, §7 and §12.

Everything here is **shadow only**: no emails, no orders and no LLM. Track 20 moved M6 to the shadow ledger because neither leg can be placed on the owner's venues:
- Coinbase has no USDC-USD book;
- the carry trade needs MBT futures, which make sense only above about $280k.

Every decision is a `shadow` ledger record plus an entry in `state["shadow"]["M6"]` or `state["shadow"]["ETH"]`.

## 1. What was built

| File | What it holds |
|---|---|
| `traderec/modules/crypto_shadows.py` | The rules, as pure functions with no network and no clock: the depeg monitor's hourly step, the carry test and contract calendar, the ETH weekly step, and the scoring helpers |
| `traderec/data/crypto_data.py` | The network adapters: stablecoin books from Coinbase Exchange, Kraken and Gemini; ETH-USD daily candles; CME Bitcoin futures in explicit months (Yahoo); BTC-USD at a given minute. Also `FakeCryptoData` for tests |
| `traderec/runners/crypto.py` | `daily(run, checks)`: the ETH switch and the carry check at 22:17 ET. `run_hourly(...)`: the depeg monitor |
| `config/constitution.yaml` | `shadow.ETH` and `shadow.M6`, both enabled |
| `.github/workflows/hourly.yml` | The hourly job: `python -m traderec hourly` at minute 41 of every hour, UTC |
| `tests/test_crypto_shadows.py` | 56 offline tests. The fixtures are trimmed from real responses captured on 29 Sep 2026 |

No shared file was edited. The CLI (`hourly`), the daily hook (`runners.SHADOW_RUNNERS`) and the state keys were already wired in the skeleton.

## 2. The rules as implemented

### 2.1 Depeg buy (hourly job; design §3 M6, track 05 §7.3 and §11)

**Trigger.** A coin from `shadow.M6.depeg.coins` has a book at or below **$0.97** on **at least 2 venues**. What counts as a venue's price:
- only a two-sided book counts, with 0 < bid ≤ ask and a spread of at most 2% (`max_spread`);
- the price is the book's mid; the last trade is ignored;
- an empty book is "no quote", not a depeg. For example, Gemini's USDG book reads 0.000005 bid / 0.99 ask.

**Conditions that can't be read mechanically.** Every event records "reserves attested" and "redemptions not suspended > 72 h" as **"unverified"** in `conditions`. The monitor can't check them, and shadow books use no LLM. The design's "regulated, fiat-backed" condition is the config list itself.

**Fail closed.** A coin at or below $0.97 on fewer than 2 venues opens no position. This covers two cases: the other venues disagree, or they have no usable book. It is logged once as `unconfirmed_start`, with a data alert, and once as `unconfirmed_end`.

**Hypothetical trade:**
- **Size.** 3% of NAV (`size_pct_nav`), with stress = 100% of the position (`stress_pct`; red team m7).
- **Entry.** The worst ask among the confirming venues, plus 0.25% (`fee_per_side`, track 15 §1.2's crypto base case).
- **Exit.** When the median mid across venues is back at **$0.995** or better ("recovered"), or after **30 calendar days** ("time_stop"). Both come from track 05 §11; the design states no exit. The exit price is the median bid less 0.25%.
- **New lows.** An open event records a new low when the median falls at least half a cent further (`update_step`). That gives the path's worst point without a record every hour.

**Precedent.** USDC bottomed on Saturday 11 March 2023 and was at par two days later (track 05; red team M12). The test `test_saturday_depeg_is_recorded_hour_by_hour` replays that shape.

### 2.2 Cash-and-carry (daily run; design §3 M6, track 05 §7.1)

The design specifies: CME contracts with ≤60 days to expiry, and an annualised basis ≥ T-bills + 6 points. The position is ≤15% notional: long IBIT, short MBT, in the same taxable account. It is held to expiry.

**Which contract.** The CME Bitcoin month with the most days to expiry, up to 60. This is the nearest thing to track 05's "2–3-month basis" within the 60-day cap. Contracts are monthly, so it always has 28–60 days left.

The expiry calendar follows CME's rule: the last Friday of the month, or the business day before when that Friday is a US or London holiday (Good Friday, 25 and 26 December).

**Prices.** Only explicit months are used: Yahoo `BTCX26.CME`, then the micro `MBTX26.CME`.
- `BTC=F` is used only when its name states the same month (e.g. "Bitcoin Futures,Nov-2026"). A continuous series is never read across a roll.
- **No explicit month means no signal**, plus a data alert.

The spot is Coinbase BTC-USD at the future's last-trade minute, from one-minute candles, so the two prices are synchronous. The basis is annualised as (F / S − 1) × 365 / days to expiry.

**Freshness and look-ahead.** The quote must be stamped between 00:00 ET on the run date and 06:00 ET the next day.
- An older quote is stale: a data alert, no signal.
- A later quote means a catch-up run for an earlier date. That run can't see that date's quotes: it gets a note, no signal.
- A target month that had already expired when the run was made is a catch-up run too: Yahoo answers 404 for an expired month, so no explicit month can be quoted. That is a note, no signal, no alert (a replay of 2026 otherwise alerted on 165 of 185 evenings). "Today" comes from the source's or the provider's clock (`_clock`, which `LiveProvider` and `LiveCryptoData` carry and `FakeCryptoData(clock=...)` takes), else the wall clock. A missing month for a contract that has not expired is still a data alert.

**Result.** At expiry the future settles to spot, so the hedged position earns the basis locked at entry, less costs:
- a 0.15% round trip (IBIT ~0.05% + MBT ~0.10%, track 15 §4.7);
- IBIT's 0.25% a year for the days held.

The event records the return, the annualised return, and the excess over the T-bill rate at entry.

**Today.** On 28 Sep 2026, Nov-26 (60 days) traded at $83,730 against spot $82,997.79. That is a 5.37% basis a year against a 10.08% trigger (T-bills 4.08% + 6), so the signal is off. This matches design §11 ("Off: basis below the trigger") and track 05's 5.3%.

### 2.3 ETH switch (daily run; design §3 M3 and "Shadow ledger", track 15 R2)

This is M3's rule applied to ETH: the weekly close, the Sunday UTC candle, above the average of the last 10 weekly closes. It reuses `btc_weekly_switch`.

**Decision.** The first daily run after the Sunday candle closes decides the week, normally Monday at 22:17 ET. As in `_m3`, that run sees the UTC day before the next ET date as complete. It also **replays missed weeks** in order, up to 12 (`max_catchup_weeks`); `_m3` decides only the latest week.

**Trade.** Buy when the switch turns on, and sell when it turns off. The fill is the **next UTC daily close** after the signal week, so normally Monday's close. This is track 15's convention: the signal at the close, the trade at the next close. The cost is 0.25% per side. ETH trades 24/7 on Coinbase (order kind (c)), so no US-market open applies. Like M3, the position continues while the switch stays on.

**Fail closed.** No ETH prices, or no Sunday candle, means the week is not decided: a data alert and a `data_missing` shadow record. Only candles dated before the run's UTC date are read, so a catch-up run never sees later prices.

**Today.** On 28 Sep 2026 the switch was on (weekly close 2,688.23 against a 10-week average of 2,282.25). A live check bought the shadow at 2,694.13, Monday's close plus the cost.

## 3. Coins and venues (checked 29 Sep 2026)

| Coin | Issuer (regulator) | Coinbase Exchange | Kraken | Gemini | Can confirm (≥2 venues)? |
|---|---|---|---|---|---|
| USDC | Circle | implied: `USDT-USD` / `USDT-USDC` | `USDCUSD` | `usdcusd` | yes (3) |
| RLUSD | Standard Custody & Trust (NYDFS) | – | `RLUSDUSD` | `rlusdusd` | yes (2) |
| PYUSD | Paxos Trust (NYDFS) | delisted | `PYUSDUSD` | – | no (1): logged "unconfirmed" if it prints ≤$0.97 |
| USDP | Paxos Trust (NYDFS) | `PAX-USD` (thin, limit-only) | – | – | no (1) |
| USDT *(watch only)* | Tether (not a regulated issuer) | `USDT-USD` | `USDTZUSD` | `usdtusd` | scored, never counted |

- **USDC on Coinbase.** Coinbase converts USDC 1:1 and has no USDC-USD book. Its USDT-USD and USDT-USDC books imply one:
  - bid = USDT-USD bid / USDT-USDC ask;
  - ask = USDT-USD ask / USDT-USDC bid.

  That is a price a Coinbase customer could trade at on 24/7 books. In a USDC depeg, USDT-USDC rises: at 1.111, USDC is worth $0.90.
- **Kraken** rejects a whole batch if one pair is unknown. A rejected batch is retried pair by pair. Configure Kraken's *result* key (`USDTZUSD`, not the altname `USDTUSD`).
- **Left out:**
  - GUSD: Gemini converts it 1:1, so its book is pinned at 1/1 with no volume;
  - USDG: Gemini's book is empty, and Kraken would be its only venue;
  - USD1: listed on all three venues, but the research doesn't cover its issuer or regulation. It can be added as `watch_only` or to `coins`;
  - FDUSD and TUSD: not listed on these venues;
  - algorithmic, synthetic and crypto-backed dollars (DAI, USDS, USDe): barred by track 05.

**USDT decision: watch only.** Track 05's summary row names a "USDC/USDT/PYUSD-class coin", but its conditions exclude USDT:
- the issuer must be regulated. Tether is not a US-regulated issuer (it is licensed offshore);
- the reserves must be attested T-bills and cash. Tether's reserves also hold Bitcoin, gold and secured loans, attested rather than audited;
- track 05's own rule (§7.3) says "regulated, fiat-backed coins with attested T-bill reserves";
- track 05's depeg table has no USDT case, and track 15 adds nothing on stablecoins.

So USDT does not meet the design's "regulated, fiat-backed". It sits under `watch_only`: its depegs are recorded and scored like the others, with `eligible: false`, and `m6_summary` reports eligible coins separately. The annual review can then see what counting it would have done. To change the decision, move it to `coins`.

## 4. Interfaces

```python
# traderec/runners/crypto.py
def daily(run, checks) -> None                  # guarded shadow runner (pipeline._daily, SHADOW_RUNNERS)
def run_hourly(cfg, provider, state_dir=None, *, now=None, dry_run=False, services=None) -> RunResult
    # status: ok | no_change | already_done | disabled | data_missing; kind "hourly", date "YYYY-MM-DDTHHZ"

# traderec/data/crypto_data.py
class CryptoSource(Protocol):                   # what the books read; LiveCryptoData and FakeCryptoData implement it
    sources: dict[str, str]
    def stablecoin_quotes(markets: {coin: {venue: symbol}}) -> {"quotes": {coin: {venue: quote|None}}, "errors", "fetched_at"}
    def eth_daily_utc() -> pd.Series            # ETH-USD per complete UTC day; Coinbase, then yfinance ETH-USD
    def btc_future_quote(year, month) -> dict | None   # {"ticker", "price", "time", "month", "name"}; explicit months only
    def btc_spot_at(when) -> float | None       # Coinbase one-minute candle containing `when`
def crypto_source(provider) -> CryptoSource | None
    # provider.crypto if set (tests: FakeCryptoData); a provider implementing the methods; LiveCryptoData around a
    # LiveProvider (its session, clock and User-Agent); otherwise None, and the daily hook notes "no crypto feeds"

# traderec/modules/crypto_shadows.py (pure)
depeg_check(quotes, cfg) -> dict;  depeg_step(book, quotes, now, cfg, nav, coins, *, markets) -> [changes]
cme_btc_expiry(year, month);  carry_contracts(asof, max_days);  quote_window(run_date);  carry_check(...)
carry_open(chk, run_date, nav, cfg);  carry_close(ev, asof, cfg)
eth_step(book, closes, asof_utc, cfg, *, tbill) -> {"changes", "notes", "problems"}
eth_promotion(weeks, cfg) -> {"weeks", "months", "alpha_annual", "beta", "t", "passes", "rule"}
m6_summary(events) -> {"depeg": {...}, "carry": {...}}
```

The live adapter makes one GET per Coinbase product, one for all Kraken pairs and one per Gemini symbol: 8 requests an hour with today's config. Each request has a 10 s timeout and one retry 2 s later on errors, HTTP 429 and 5xx. One venue failing never loses the others.

**State** (runners `setdefault` these for older states):

- `shadow.ETH`:
  ```
  {"on", "last_week_end", "open_trade", "trades", "weeks"}
  open_trade: {"trade_id": "S-<week_end>-ETH", "status": "pending_entry" | "open" | "pending_exit",
               "signal_date", "weekly_close", "sma", "entry_date", "entry_price", "exit_signal_date"}
  trades[]:   the same keys, plus "exit_date", "exit_price", "return", "days_held"
  weeks[]:    {"week_end", "close", "sma", "on", "rf"}   one per decided week, for the promotion test
  ```
- `shadow.M6`:
  ```
  {"events", "watch", "carry_last"}
  events[] (depeg): {"id", "kind": "depeg", "coin", "eligible", "status": "open" | "closed", "signal_date",
      "signal_time", "venues_below", "prices", "conditions", "entry_time", "entry_ask", "entry_price",
      "size_pct_nav", "size_usd", "stress_pct", "stress_usd", "low", "low_time", "updates", "markets",
      "exit_time", "exit_date", "exit_price", "exit_reason": "recovered" | "time_stop", "return", "pnl_usd",
      "hours_held"}
  events[] (carry): {"id", "kind": "carry", "status", "signal_date", "contract", "ticker", "expiry", "days",
      "future", "spot", "basis", "basis_annual", "tbill", "threshold", "notional_usd", "exit_date",
      "exit_reason": "expiry", "return", "return_annual", "excess_annual", "pnl_usd"}
  watch: {coin: {"since", "signal_date", "below", "prices", "reason"}}   unconfirmed prints now open
  carry_last: {"date", "contract", "ticker", "basis_annual", "threshold", "on"}
  ```

Every event carries `signal_date`, as the monthly report's shadow table needs.

**Ledger.** Each change is a `shadow` record with `book` set to "ETH" or "M6" and an `event`:
- ETH: `weekly`, `signal_on`, `entry`, `signal_off`, `exit`, `data_missing`;
- M6 hourly: `depeg_open`, `depeg_low`, `depeg_close`, `unconfirmed_start`, `unconfirmed_end`, each with `hour`;
- M6 daily: `carry_check` (every evening, with its `problem` if any), `carry_open`, `carry_close`.

## 5. Operations

### The hourly job (`.github/workflows/hourly.yml`, `python -m traderec hourly [--dry-run]`)

- **Schedule.** Every hour at minute 41 UTC. That keeps clear of the other state writers: daily, weekly and options at :17, monthly at 12:13 UTC. The job uses the shared `traderec-state` concurrency group and a 10-minute timeout.
- **Checkout and install.** The job checks out a shallow clone (`fetch-depth: 1`: it needs no history, and the commit step's `git pull --rebase` still works, fetching what the branch gained since checkout and replaying the one state commit on top) and installs `requirements-hourly.txt`: pandas, numpy, requests and PyYAML, what `python -m traderec hourly` (and `init --if-missing`) imports. yfinance is imported lazily by the daily bars, which this job never fetches, and pytest is for the test suite. Keep that file's versions in step with `requirements.txt`. GitHub bills a minimum of one minute per job whatever the run takes, so this trims seconds, not the estimate below; it keeps a quiet hour well clear of the second billed minute.
- **What it does.** It fetches the stablecoin books and plans the monitor's step on a copy of the state.
- **A quiet hour writes nothing.** There is no ledger record, no run entry and no `pre_run.json`, so the commit step finds nothing to commit. With today's markets that is every hour.
- **A recorded hour.** When an event starts, updates or ends, the hour becomes one `Run` transaction keyed `hourly:<YYYY-MM-DDTHHZ>`, like the other runs:
  - ledger check;
  - pre-run snapshot;
  - `shadow` records (plus a data alert for an unconfirmed print);
  - run manifest;
  - state.

  A recorded hour is idempotent: a re-run returns `already_done` without fetching.
- **Exit codes.** `data_missing` (no venue returned a usable book) exits with code 3. The workflow treats that as a warning; the next hour retries.
- **Healthchecks.** The job pings `HC_PING_URL` (secret `HC_PING_URL_HOURLY`):
  - "success" after each completed hour;
  - "fail" on an error;
  - nothing for a `data_missing` hour, so a lasting outage shows up as missed pings.

  The workflow also pings "fail" when setup, the commit or a timeout fails.

### Cost in GitHub Actions minutes (private repository)

GitHub bills each job rounded up to the whole minute. A normal hourly run takes about 30–45 s: checkout, Python with the pip cache, install from cached wheels, then a run of a few seconds. So each run bills **1 minute**:

- **Hourly job:** 24 × 30.4 ≈ **730 minutes a month** (744 in a 31-day month).
- **Other workflows**, for comparison:
  - daily: two slots, about 45–90 minutes;
  - options job: about 45–90 minutes;
  - weekly: about 10 minutes;
  - monthly: a few minutes;
  - CI: about 1–2 minutes per push.
- **Total:** about 850–950 minutes a month. The hourly job is roughly 80% of it.

That fits the 2,000 minutes a month that GitHub Free includes for private repositories (3,000 on Pro and Team). Public repositories are free. Beyond the quota, Linux minutes cost about $0.006–0.008 each at GitHub's list prices (check your plan): about $4–6 a month for this job.

To halve the cost, run every 2 hours (`cron: "41 */2 * * *"`). The one US precedent took about 2 days to recover, so 2-hourly sampling would still have caught it.

### How to switch it off

- **To stop the minutes:** GitHub → *Actions* → *hourly* → "⋯" → **Disable workflow**, or `gh workflow disable hourly.yml`. Re-enable it the same way. Nothing else depends on it.
- **To stop the monitor but keep the job:** set `shadow.M6.depeg.enabled: false`. The job still starts every hour and bills its minute; it just returns `disabled`.
- **Permanently:** delete the `schedule:` block and keep `workflow_dispatch` for manual runs.

### Owner setup

- **Optional:** a healthchecks.io check with **period 1 hour and grace 3 hours**. Store its ping URL as the repository secret `HC_PING_URL_HOURLY`. Without it, nothing is pinged.
- Nothing else. The endpoints are public and need no API key. The job reads no email secrets, because it sends no email.

### The 22:17 ET part

`crypto.daily` runs inside the daily run's shadow guard, after the Phase A shadow book. A failure in one sub-book becomes a `shadow` alert and does not stop the other.

Data problems raise a `data` alert and a ledger record:
- no ETH prices;
- a missing Sunday candle;
- no explicit month, a stale quote, or no spot price.

A provider without crypto feeds, such as a test `FakeProvider`, only adds a note.

## 6. Scoring and promotion tests

| Book | Promotion test (source) | What the state records |
|---|---|---|
| ETH switch | Timing alpha vs holding ETH with **t ≥ 2 over ≥ 24 months** of shadow trades (track 15 R2); otherwise it stays a risk overlay | Every round trip (`trades`, net of 0.25% a side) and every decided week (`weeks`). `eth_promotion(book["weeks"], cfg)` regresses the switch's weekly excess return on ETH's, with Newey-West errors (4 lags) and T-bills when flat, and returns `passes` |
| M6 depeg | No numeric rule in the tracks. It needs an executable venue (track 20) and results in line with track 05's expectation (+3–14% in days, n ≈ 3) | Entry, exit, return, P&L and trough for every event. `m6_summary(events)` gives n, mean return and hit rate, for eligible coins alone and for all coins |
| M6 carry | Needs MBT and ≳$280k (design §3 M6). Track 05 expects basis less costs of ≈10–20% a year when triggered | Every evening's basis (`carry_check`), and the locked and realised return of each position. `m6_summary` gives the mean annualised excess over T-bills |

## 7. Known limits

- **Attestations and redemption status are unverified.** Nothing mechanical reads them (design §3 M6). The shadow record says so in every event.
- **Hourly sampling misses intra-hour extremes.** Track 05's lows are intraday prints. An hourly sample sees fewer and shallower dislocations, so the recorded entry prices are conservative.
- **Only USDC and RLUSD can confirm today.** PYUSD and USDP are single-venue on these exchanges, so their prints can only be "unconfirmed" until a second venue lists them.
- **The Coinbase USDC price is implied** from two books, not quoted directly.
- **Kraken's ticker has no timestamp.** All books are live snapshots taken at fetch time.
- **The carry spot is Coinbase BTC-USD**, not the CME CF Bitcoin Reference Rate the futures settle to.
- **The realised carry equals the locked basis less modelled costs.** The shadow can't measure IBIT's tracking or margin costs.
- **Yahoo's explicit-month coverage is patchy.** Deferred months trade rarely. BTCF27 had last traded a week earlier on 29 Sep, but it is never the target: the target always has ≤60 days. A missing month fails closed.
- **ETH weekly records ignore the one-day fill lag.** `eth_promotion`'s weekly series does; the trade list is the exact record.
- **Scheduled runs can start late.** GitHub may start a scheduled job 5–30 minutes late.
- **Queued runs can be cancelled.** GitHub keeps only one pending run per concurrency group, so a long-delayed scheduled run (they can start 5-30 minutes late, more under load) can be cancelled by the next queued one; every state-writing workflow shares `traderec-state`. The 10-minute timeout and minute 41 make an overlap with the daily slots unlikely, but an hourly run that is still queued when the options or daily job arrives is the one that gets cancelled, and the reverse can happen too. In winter (EST) the options job has a single usable cron slot, so an options run cancelled this way is not retried that day; the daily job has a second slot.
- **Recorded hours affect `--force`.** A recorded hourly run becomes the state's "most recent run", so `--force` can then re-run only that hour, not an earlier daily run. It happens only on the rare event hours.

## 8. Deviations and notes for the integrator

Where the design or tracks are silent, these are the choices made:

1. **Quiet hours record nothing**: no run manifest and no `runs` entry. "Commit only when an event starts, updates or ends" needs this. The per-hour key and the Run transaction apply to the hours that change state.
2. **Data problems in the hourly job are raised on transitions.**
   - An unconfirmed print raises one alert and one record when it starts, and one record when it ends.
   - A total outage (no venue) exits 3 and writes nothing. It shows as missed healthchecks pings, not as a state alert every hour. The contract's "raise `run.alert("data", ...)`" would otherwise commit every hour of an outage.
3. **Depeg exit and costs come from track 05 §11 and track 15 §1.2**: $0.995, or 30 days; 0.25% a side. The entry is the worst confirming ask; the exit is the median bid.
4. **Carry choices:**
   - the contract with the most days to expiry (≤60);
   - Coinbase spot, synchronous with the future's last trade;
   - the evening quote window;
   - realised return = locked basis − costs.
5. **ETH fills at the next UTC close** (track 15's lag), not at a US open, and missed weeks are replayed. `_m3` evaluates only the latest week.
6. **USDT is watch only** (§3). **USDC's Coinbase price is implied** via USDT-USD / USDT-USDC.
7. **Shared files were left alone.**
   - `traderec/modules/__init__.py` does not export the new module; import `traderec.modules.crypto_shadows` directly.
   - `LiveProvider` gains no methods. `crypto_source()` wraps it, and a later `provider.crypto` attribute or methods would be picked up unchanged.
8. **Monthly report.** Under Phase A's `facts.monthly_report`, any book with `events` is shown as "(90-day score)", so M6 appears as "M6 (90-day score)" and its closed events are not counted. The reports build's generic shadow table should read M6 events by `status == "closed"` and `return` (schema in §4). ETH already renders correctly (trades with `signal_date`, `exit_date` and `return`).
9. **To merge into the shared docs:**
   - README / OPERATIONS: the `hourly` workflow, the `HC_PING_URL_HOURLY` secret, the minutes estimate and how to switch it off;
   - INTERFACES: the interfaces in §4.
10. **pyflakes** reports two pre-existing unused imports in skeleton files owned by other builds: `traderec/runners/edgar.py` and `traderec/runners/macro_shadows.py` (`typing.Any`). The crypto files are clean.
11. **The commit step's bot address.** `hourly.yml` uses the same `github-actions[bot]` noreply identity as the daily, weekly and monthly workflows. It is not personal data.
