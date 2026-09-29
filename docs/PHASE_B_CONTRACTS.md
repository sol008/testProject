# Phase B build contracts

Phase B of design v3.3 §10: the 10:17 ET options job with M4 and M7, W8/W9 with the frozen LLM veto, M6 with the hourly crypto job, the EDGAR/FINRA shadow screens, and the quarterly and annual reports. Several builds run in parallel against this file, and the Phase A contracts in `INTERFACES.md` still hold.

The source of truth for every rule is `research/00-SYSTEM-DESIGN-v3.md` (v3.3): §3 (modules and shadow ledger), §3a (execution standard), §4 (portfolio rules), §7 (fill model and go-live), §8 (calibration), §10 (schedule). The research tracks are cited there. When this file and the design disagree on a rule, the design wins; say so in your report.

## 0. Ground rules for every build

1. **Files you own.** Put new logic in new files, and edit only the files your brief lists. The skeleton already has the hook points, config blocks and state keys, so shared files need few or no edits.
   - Don't edit `README.md`, `docs/OPERATIONS.md`, `docs/INTERFACES.md` or the design.
   - Write your documentation to `docs/phase-b/<your-area>.md`: what was built, its interfaces, operations, owner setup and known limits. The integrator merges it into the shared docs.
2. **No new dependencies.** Use pandas, numpy, requests, PyYAML, yfinance and the standard library.
3. **Network only in data adapters.**
   - Adapters live in `traderec/data/` (or your runner's data section) and are injected through the provider.
   - Every test runs offline, on fakes or recorded fixtures under `tests/fixtures/`, each ≤200 KB.
   - A live smoke check is fine during development, but must not be part of the suite, or must be skipped without network, like the existing network tests.
4. **No model identifiers anywhere in the repository:** not in code, config, comments, docs or tests.
   - The W8/W9 veto reads its pinned model from the environment variable `TRADEREC_VETO_MODEL`, with no default.
   - Tests use a placeholder such as `"test-model"`.
5. **No personal data.**
   - SEC requests take their User-Agent from the environment variable `SEC_USER_AGENT`. The owner sets it, and the default is a generic product string.
   - Never put an email address in the repository.
6. **Fail closed** for new entries on missing, stale or disagreeing data. Log the event in the ledger as `shadow` or `signal`, and raise `run.alert("data", ...)`.
7. **Determinism and look-ahead.**
   - Signals use data up to and including the run date only (`run.bars()` is already cut at `run.asof`).
   - Shadow books use no LLM.
8. **Tests.** Add tests next to the existing ones (`tests/test_<area>.py`).
   - `python -m pytest -q` must pass in your worktree before you commit.
   - Run `python -m pyflakes traderec tests` if it is available.
9. **Commit in your worktree; don't push.** End the commit message with the two trailer lines from your brief, and report the branch and commit SHA.

## 1. Option chains — `traderec/options/chain.py` (options build)

```python
CHAIN_COLUMNS = ["occ", "root", "right", "strike", "expiry", "bid", "ask", "mid", "iv", "delta", "gamma",
                 "theta", "vega", "open_interest", "volume", "last_trade_time"]
# right "C" | "P"; expiry "YYYY-MM-DD"; mid = (bid + ask) / 2 when bid > 0 and ask > 0, else NaN

@dataclass
class OptionChain:
    underlying: str            # option root: "XSP", "SPX", "SPY", "USO", "DAL", ...
    asof: str                  # ISO datetime in ET of the quotes, e.g. "2026-09-29T10:17:00"
    spot: float                # the underlying's price at `asof`
    source: str                # "cboe" | "yahoo" | "fake"
    frame: pd.DataFrame        # CHAIN_COLUMNS, one row per contract
    raw_sha256: str | None = None
    def expiries(self) -> list[str]
    def quote(self, occ: str) -> dict | None          # the row as a dict, or None
    def select(self, right: str, expiry: str) -> pd.DataFrame

def parse_occ(occ: str) -> dict                      # {"root", "expiry", "right", "strike"}; "XSP261218C00770000"
def occ_symbol(root: str, expiry: str, right: str, strike: float) -> str
def expiry_on_or_before(chain: OptionChain, limit: str, *, earliest: str | None = None) -> str | None
    # the latest listed expiry <= limit (and >= earliest)
def expiries_between(chain: OptionChain, start: str, end: str) -> list[str]
def strike_nearest(chain: OptionChain, expiry: str, right: str, target: float) -> float | None
def strike_by_delta(chain: OptionChain, expiry: str, right: str, target_delta: float) -> float | None
def liquidity_check(chain: OptionChain, legs: list[dict], cfg_liquidity: dict, *,
                    expected_gain: float | None = None) -> dict
    # design §4 "Option liquidity":
    # - each leg's (ask - bid) <= 10% of mid, with open interest >= 500;
    # - the structure's round trip <= 10% of the debit (<= 20% when expected_gain >= 2x costs).
    # returns {"ok", "reasons", "per_leg", "round_trip_frac"}
```

**Provider.** `DataProvider.option_chain(underlying: str) -> OptionChain` takes a live snapshot "now".
- Primary source: CBOE delayed quotes, `https://cdn.cboe.com/api/global/delayed_quotes/options/{sym}.json`, following the redirect to `cdn-api.cboe.com`. `sym` is `_XSP` or `_SPX` for index roots and `SPY`, `USO` or `DAL` for equities. The payload has `data.options[]` with `option`, `bid`, `ask`, `iv`, `delta`, `open_interest`, `volume`, …, plus `data.current_price` and `timestamp`.
- Fallback: yfinance `Ticker(root).option_chain(expiry)`.
- Raises `DataError` when both fail.
- `FakeProvider(..., chains={"XSP": OptionChain | [OptionChain, ...]})` returns the next chain on each call, or the last one repeatedly.
- There are no historical chains. Replays and tests use fakes.

## 2. Spread orders — `OrderIntent` with `order_type="spread_limit"` (field meanings in `traderec/types.py`)

- **Order fields.**
  - `ticker` is the option root and `account` is `"taxable"`. The broker rejects a spread in an account whose `options_level` is below 3.
  - `side="buy"` opens a **debit** vertical. `side="sell"` with `close_all=True` closes the whole spread of that `trade_id`.
  - `legs` are the **position** legs, with `position` "long" or "short" and `ratio` 1. `contracts` is ≥1.
- **Prices.** Every price is per share of the combo; a contract is ×100.
  - Combo **mid** = Σ mid(long legs) − Σ mid(short legs).
  - **Natural width** `nw` = Σ (ask − bid) over the legs.
- **Opening:**
  - `limit_price` = mid + `fills.options.concession` (0.3) × nw;
  - `max_price` = mid + `max_concession` (0.5) × nw, the natural price.
- **Closing:**
  - `limit_price` = mid − 0.3 × nw;
  - `max_price` = max(0, mid − 0.5 × nw), the stated minimum credit.
- **Timing.** The module computes these from the **evening** chain, the closing quotes fetched by the 22:17 ET run. The email shows the contracts, the limit, the stated maximum or minimum, and "place after 10:00 ET; if not filled by 11:00 ET, re-enter once at the stated maximum; otherwise skip" (design §3a (b)).
- **Expiry rules.** Entry needs ≥40 DTE. Close ≥1 trading day before expiry (design §3a.4). M4's and W8/W9's own DTE rules apply.

## 3. Fill model v1.0 for spreads — `traderec/options/fillmodel.py` (options build)

```python
def combo_quote(chain: OptionChain, legs: list[dict], side: str) -> dict | None
    # {"mid", "natural_width", "legs": [{"occ", "bid", "ask", "mid"}]}; None if any leg lacks a two-sided quote
def model_price(quote: dict, side: str, concession: float) -> float    # buy: mid + c*nw; sell: mid - c*nw
def decide_fill(intent: OrderIntent, quote: dict | None, cfg_options_fills: dict) -> dict
    # {"filled": bool, "price": float | None, "attempt": "limit" | "reprice" | None, "reason": str}
```

- The 10:17 ET snapshot gives P = model_price(concession 0.3).
  - **Open:** filled at P if P ≤ `limit_price` (attempt "limit"); else at P if P ≤ `max_price` ("reprice"); else no fill ("above the stated maximum").
  - **Close:** the same with ≥, using the stated minimum.
- **The `Fill` record:**
  - `qty` = contracts, `price` = P, `ref_price` = combo mid;
  - `multiplier` = 100, `dollars` = contracts × P × 100;
  - `slippage_bps` 0.0, `model_version` "1.0";
  - `legs` = the leg quotes used, `fill_time` "10:17".
- **No fill, open order:** the order is **cancelled**, the entry is skipped, and the module's `on_spread_cancel` runs.
- **No fill, close order:** the order is cancelled too, and the owning module re-issues a fresh EXIT that evening with new prices (its `daily()` sees `status == "open"` and the exit still due) and raises an alert.
- **Safety net.** A spread still open on its expiry date is settled at intrinsic value. It uses the underlying's official close in the daily run, recorded with reason `"expiry_settlement"`, plus an alert. The rules should make this never happen.

## 4. Paper broker spreads — `traderec/broker.py` (options build)

```python
PaperBroker.queue(intent)                    # also accepts spread_limit intents (validated as in §2)
PaperBroker.fill_pending(date, opens)        # ETF opens: must ignore spread_limit intents
PaperBroker.fill_spreads(date: str, time_et: str, chains: dict[str, OptionChain]) -> list[Fill]
    # every pending spread_limit intent created before `date`; last_fill_meta[intent_id] =
    # {"attempt", "reason", "quote", "cancelled": bool}; cancelled intents go to `cancelled` with meta
PaperBroker.spreads(account: str | None = None, module: str | None = None) -> list[dict]
    # [{"key", "account", "module", "trade_id", "root", "legs", "contracts", "entry_price", "cost",
    #   "opened", "expiry", "mark", "mark_date"}]; key = f"{account}|{trade_id}"
PaperBroker.mark_spreads(date: str, chains: dict[str, OptionChain]) -> dict   # combo mid per spread -> value
PaperBroker.settle_spread(key: str, date: str, value_per_share: float, reason: str) -> Fill
PaperBroker.mark(date, closes)               # NAV includes spreads at their last mark x contracts x 100
```

- **Cash.** Opening debits cash by the dollars filled. Closing credits it and records `realized_pnl` in `last_fill_meta`.
- **State.** `to_state()` / `from_state()` round-trip the spreads, and an older state without spreads still loads.

## 5. The options job — `traderec/options/job.py` (options build)

```python
def run_options(cfg, provider, state_dir=None, *, date=None, dry_run=False, force=False, services=None) -> RunResult
def mark_spreads(run) -> None                # daily-run hook before _mark (already wired in pipeline._daily)
```

- **`run_options`:** the run kind is `"options"`, one per ET date. It is idempotent like the other runs and uses the `Run` class. Its work, in order:
  1. Begin.
  2. Take a chain snapshot of every root needed: pending spread orders, open spreads, and each runner's `roots_needed(run)` from `runners.OPTIONS_JOB_RUNNERS`.
  3. Store a **filtered** snapshot at `state/options/<date>/<root>-<HHMM>.csv.gz` (≤100 KB a day in all), and log a `snapshot` ledger record with the raw payload's SHA-256.
  4. Run `broker.fill_spreads`. Log each fill (`fill`) and call `runners.SPREAD_MODULES[module].on_spread_fill` or `on_spread_cancel`.
  5. Run `broker.mark_spreads`.
  6. Call each runner's `options_job(run, chains)`.
  7. Finish.
- **No trade emails.** Alerts appear in the run result.
- **`mark_spreads(run)`:** fetches closing chains for the roots with open spreads and marks them. On failure it keeps the last marks and adds a note.
- **CLI:** `python -m traderec options [--date D] [--dry-run] [--force]`, already wired.
- **Workflow:** `.github/workflows/options.yml`, at 10:17 ET Mon–Fri (UTC crons for EDT and EST, like `daily.yml`). It uses the `traderec-state` concurrency group, commits `state/` like the daily workflow, and pings `HC_PING_URL_OPTIONS`.

## 6. State keys (created by `new_state`; runners must `setdefault` them for older states)

- `modules`:
  - `M4`: `{"open_trade", "history", "cooldown_until"}`;
  - `W8`, `W9`: `{"open_trade", "history"}`.
- `shadow`:
  - `M4_TWIN`, `O1`, `O1H`, `I1`, `I2`, `ST2`: `{"open_trade", "trades"}`;
  - `ETH`: `{"on", "last_week_end", "open_trade", "trades"}`;
  - `M6`, `MACRO`: `{"events"}`;
  - `EDGAR`: `{"events", "seen"}`.
- A spread module's `open_trade`: `{"trade_id", "status": "pending_entry" | "open" | "pending_exit", "signal_date", "intent_id", "legs", "contracts", "expiry", "exit_date", "entry_price", "fill_date", ...}`.
- Add more keys inside your own entries freely. Don't rename existing ones.

## 7. Runners — `traderec/runners/<name>.py` (already wired into `pipeline._daily`)

```python
def daily(run, checks) -> None                       # checks: {"spy_ok", "vix", "vix_ok", "vix_series"}
def on_spread_fill(run, fill, intent) -> None        # spread modules (m4, macro)
def on_spread_cancel(run, intent, reason) -> None    # spread modules
def roots_needed(run) -> set[str]                    # optional: roots the 10:17 job must snapshot
def options_job(run, chains) -> None                 # optional: work at the 10:17 snapshot
```

- **Daily order:** M1 → W10 → **M4** → M2 → M3 → **W8/W9** → Phase A shadow → **option_shadows → crypto → edgar → macro_shadows**.
- **Guards.** Shadow runners run inside `pipeline._shadow_guard`, so an exception becomes an alert. Trading runners raise, as Phase A modules do.
- **Emitting a decision.** Build `Recommendation(kind, module, trade_id, run.date, [intent], facts)` and call `run.emit(rec)`. It pre-registers the decision, renders, validates, opens the issue and queues the order. Then `run.count_trade()` for a new trade, and `run.budget_ok()` before it.
- **Risk for premium trades:** `traderec/risk.py`, extended by the **M4 build**:
  ```python
  risk.admit_premium(module, root, premium_usd, cluster, positions_stress, cfg, drawdown, *,
                     exempt_governor=False, min_premium_usd=0.0) -> dict
      # {"ok", "premium_usd" (allowed), "binding", "notes", "cluster_overflow"}; design §4: stress = premium;
      # per-trade premium cap 3%; option premium total <= 10%; macro-factor budget 3% premium per factor;
      # M4 in the 4% US-equity reserve (first come with W10; skipped under one contract)
  risk.open_stress(...)   # counts open spreads at max(cost, current value) in their cluster
  ```
  Clusters: M4 and XSP/SPY spreads → `us_equity`. W8 → `oil` ("peace/oil-down" is one factor in 2026, design §4), with DAL/SPY legs also inside the factor budget. W9 (USO) → `oil`.
- **Facts.** Put the facts builders in your runner file, not `facts.py`, and give them the keys in §8.

## 8. Spread emails — generic rendering in `traderec/emails.py` (spread-email build)

- **Generic rendering.** Any order with `order_type == "spread_limit"` renders as a vertical spread. It gets:
  - the subject;
  - the headline box: ACTION, SIZE, STRESS = the debit at risk, WINDOW "after 10:00 ET", ODDS;
  - the **Robinhood steps**: ≤7 taps with exact values, in the individual account, as a two-leg vertical at one net limit price;
  - **what if**: not filled by 11:00 ET → re-enter once at the stated maximum, otherwise skip; for exits, the stated minimum, then tomorrow's email;
  - the exit plan, risks, and tax: Section 1256 60/40 for index options (XSP/SPX), ordinary short-term otherwise.
- **Facts keys, NEW_TRADE:**
  - `root`, `underlying_name`, `strategy_label` (e.g. "call debit spread"), `legs`, `expiry`, `contracts`;
  - `limit_price`, `max_price`;
  - `debit_usd` (contracts × limit × 100), `max_debit_usd`, `max_value_usd` (width × contracts × 100);
  - `breakeven`, `spot`;
  - `exit_date` (the planned close session), `stress_usd` (= `max_debit_usd`), `stress_pct`;
  - `section_1256` (bool), `settlement` ("cash-settled, European-style" | "shares, American-style");
  - `base_rates` (as Phase A).
- **Facts keys, EXIT (closing a spread):**
  - `contracts`, `limit_price`, `max_price` (the stated minimum), `credit_usd`, `min_credit_usd`;
  - `entry_price`, `pnl_usd` / `pnl_pct` at tonight's mid;
  - `reason` ("time_stop" | "take_profit" | "invalidation" | "expiry_rule").
- **Module text** goes in `traderec/email_text/<module>.py` as `TEXT = {table: entries}`. It is merged into emails.py's tables at import (`MODULE_NAMES`, `WHY`, `EXIT_PLAN`, `RISKS`, `ONE_SENTENCE`, …). The M4 build owns `m4.py`; the W8/W9 build owns `w8w9.py`.
- **Owner fill comments** for spreads: `filled <contracts> @ <net price> [ROOT]` or `skipped` (`feedback.py`, spread-email build).
- **Validator.** Every number still goes through the registry, and `validator.validate` must pass.

## 9. Forecasts

Register builders at import in your runner: `forecasts.EXTRA_SPECS[(module, kind)] = builder`. A builder returns `_spec(...)` dicts. Extend `forecasts._exit_outcome` if you add a new on-exit event.

## 10. Config

Your block is pre-placed in `config/constitution.yaml` (`modules.M4/W8/W9`, `shadow.*`, top-level `options`, `fills.options`).
- Fill it in with the design's parameters, citing the section in a comment.
- Set `enabled: true` once your code and tests are complete. Paper mode runs everything.
- Leave other blocks alone.
- Bump `version` only if your brief says so; the integrator sets 3.4.0.

## 11. Reports — `traderec/reports.py` (reports build)

- `run_quarterly(cfg, provider, state_dir=None, *, quarter=None, ...)` and `run_annual(..., year=None, ...)`, with the CLI already wired.
- The monthly report (`facts.monthly_report` and `emails.render_monthly`) is extended to every module and shadow book in the state, generically.
- Workflows: extend `monthly.yml` to run the quarterly job after the March, June, September and December reviews, and the annual job after December's.

## 12. Hourly crypto job — `traderec/runners/crypto.py` (crypto build)

- `run_hourly(cfg, provider, state_dir=None, *, now=None, dry_run=False, services=None) -> RunResult`, with the CLI `hourly` already wired.
- Workflow `.github/workflows/hourly.yml`:
  - cheap: pip cache, no work beyond the checks;
  - commits `state/` only when a shadow event changes it;
  - shares the `traderec-state` concurrency group;
  - pings `HC_PING_URL_HOURLY`.
