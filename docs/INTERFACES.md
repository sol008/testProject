# traderec — component interfaces (Phases A and B)

Every component builds against these contracts, and this file records them as built. Phase B's original build contracts are in `docs/PHASE_B_CONTRACTS.md`, and each Phase B build's notes are in `docs/phase-b/`. Where the two differ, this file and the code are current. Shared types are in `traderec/types.py`, config loading in `traderec/config.py` (`load_config()` → `Config`) and indicators in `traderec/indicators.py`. The design is `research/00-SYSTEM-DESIGN-v4.md` (the growth book, Phase C) on top of `research/00-SYSTEM-DESIGN-v3.md` (v3.3; its Appendix C lists Phase B's interpretations, and `docs/phase-c/` Phase C's); the rule parameters are in `config/constitution.yaml` (version 4.0.0).

**Contents:** 1 data layer · 2 ledger · 3 paper broker · 4 forecasts · 5 modules and risk · 6 emails, validator, notify, feedback · 7 pipeline, CLI, runs and the order of work · 8 options (`traderec/options/`) · 9 runners and hooks · 10 the LLM veto · 11 reviews (`traderec/reports.py`) · 12 the growth book (`traderec/growth/`, design v4).

## Conventions

- **Dates.** Strings `YYYY-MM-DD` at every boundary; `pd.Timestamp` inside functions.
- **Trading dates.** New York exchange trading dates.
- **Price frames.** `pd.DataFrame` indexed by a tz-naive, normalised `DatetimeIndex` (the ET session date), with columns:
  - `open`, `high`, `low`, `close` — raw, unadjusted;
  - `adj_close` — total-return adjusted;
  - `volume`.
- **Money.** Floats in USD. Percentages are fractions (0.06 = 6%) unless a key ends in `_pct`.
- **Option prices.** Per share of the combo; a contract is ×100 (`fills.options.multiplier`).
- **Network.** Only the data adapters in `traderec/data/`, `notify.py`, `feedback.fetch_comments` and `llm_veto.py` touch the network. Adapters are injected through the provider (the veto through `run.services`), so every test runs offline with fakes or recorded fixtures under `tests/fixtures/`. Live smoke tests run only with `RUN_NETWORK_TESTS=1`.
- **No model identifiers and no personal data in the repository.** The veto's model comes from the environment variable `TRADEREC_VETO_MODEL`, with no default. SEC requests take their User-Agent from `SEC_USER_AGENT` (`data/edgar.py`; without it, a generic product string that names no one).
- **Fail closed** for new entries on missing, stale or disagreeing data: log a `shadow` or `signal` record and raise `run.alert("data", ...)`.
- **Look-ahead.** Signals use data up to and including the run date (`run.bars()` is cut at `run.asof`). Shadow books use no LLM.
- **Git.** No component writes to git. The workflows commit `state/` in CI.

## 1. Data layer — `traderec/data/`

```python
class DataProvider(Protocol):
    def daily_bars(self, ticker: str) -> pd.DataFrame
        # Full available history, columns as above.
    def vix(self, name: str = "VIX") -> pd.Series
        # CBOE official daily close (VIX, VIX3M); DatetimeIndex.
    def btc_daily_utc(self) -> pd.Series
        # BTC-USD close per UTC day (index = UTC candle start date); Coinbase, falling back to yfinance BTC-USD.
    def tbill_rate(self) -> float
        # Annualised 3-month T-bill yield as a decimal: FRED DTB3, then yfinance ^IRX/100, then config fallback.
    def second_source_close(self, ticker: str, date: str) -> dict | None
        # {"close": float, "source": "nasdaq" | "robinhood" | "yahoo-quote" | "fred:SP500" | "cboe-quote"} or None.
        # ^GSPC uses FRED's SP500 series, then CBOE's delayed index quote (W10's two-source rule).
    def option_chain(self, underlying: str) -> OptionChain                    # Phase B (§8.1)
        # A live snapshot of an option root's chain "now". There are no historical chains.

class LiveProvider(DataProvider)     # network: yfinance, api.nasdaq.com, api.robinhood.com/quotes,
                                     # cdn.cboe.com (index and option quotes), api.exchange.coinbase.com,
                                     # fred.stlouisfed.org; retries with backoff, User-Agent header, in-run memo cache
class FakeProvider(DataProvider)     # built from in-memory frames/series for tests

def verify_close(provider, bars: pd.DataFrame, ticker: str, date: str, tolerance: float) -> dict
    # {"ok": bool, "primary": float, "secondary": float | None, "source": str | None, "reason": str}
    # ok=False on a mismatch above tolerance OR when no second source is available
    # (fail closed for new entries; the pipeline decides).
```

**Option chains** (`LiveProvider.option_chain`):
- CBOE's delayed quotes first: `https://cdn.cboe.com/api/global/delayed_quotes/options/{sym}.json`, following the redirect to `cdn-api.cboe.com`. `sym` is `_XSP` or `_SPX` for index roots and the ticker for equities (`cboe_option_symbol`). `asof` is CBOE's file time in ET; the quotes lag it by about 15 minutes; `raw_sha256` hashes the raw body.
- yfinance as the fallback, **only 09:30–16:00 ET on trading days** by the provider's clock (track 14 §6.7: never Yahoo's after-hours quotes). It fetches every expiry up to 200 days out; its chains have no greeks.
- `"SPXW"` is served from the SPX chain (`chain_root`). The memo cache gives one snapshot per root per provider, so one run sees one set of quotes. `sources["option_chain:<root>"]` records the source. Raises `DataError` when both sources fail.
- `FakeProvider(..., chains={"XSP": chain | [chain_or_exception, ...]})` serves the next item on each call and then the last one repeatedly; an exception in the list is raised; a root without a chain raises `DataError`; `chain_calls` lists the roots asked for.

### 1.1 Phase B adapters

Each is reached through the provider, so tests inject fakes:

| Adapter | Module | Reached as | Used by |
|---|---|---|---|
| Prediction markets (Polymarket gamma, Kalshi) | `data/prediction_markets.py` | `provider.prediction_markets`; the macro runner attaches a `PredictionMarkets()` to a `LiveProvider` on first use | W8, W9 |
| W8/W9 macro data (explicit crude months, day moves, contango, DAL earnings, W9's input file) | `data/macro_data.py` | `provider.macro_data`; the macro runner attaches a `MacroData()` to a `LiveProvider` on first use | W8, W9 |
| Crypto data (stablecoin books, ETH-USD, CME Bitcoin futures, BTC-USD at a minute) | `data/crypto_data.py` | `crypto_source(provider)`: `provider.crypto`, else a provider implementing the methods, else `LiveCryptoData` around a `LiveProvider`, else None | crypto shadows, hourly job |
| Release calendar and macro series (Treasury yields, FRED, BoJ) | `data/econ_calendar.py` | `load_calendar()`; `macro_data_for(provider)`: `provider.econ_data` (an attached object without `treasury_yields` counts as absent), else a `LiveMacroData` attached to a `LiveProvider` as `econ_data`, else None | macro shadows |
| SEC EDGAR and FINRA (full-text search, data.sec.gov, filing documents, short interest) | `data/edgar.py` | `provider.edgar`, `provider.finra`; `runners.edgar.sources(run, cfg)` attaches an `EdgarClient()` and a `FinraClient()` to a `LiveProvider` on first use; any other provider without `edgar` skips the book with a note | EDGAR screens |

> **Two adapters, two attributes (fixed at integration).** W8/W9's `MacroData` lives at `provider.macro_data` and the macro shadow books' `LiveMacroData` at `provider.econ_data`. They used to share `provider.macro_data`, so whichever runner went second got the wrong object in a live run; `macro_data_for` now reads only `econ_data` and treats an object without `treasury_yields` as absent.

```python
# data/prediction_markets.py: a "family" is a ladder of dated yes/no markets named by one rule
class PredictionMarkets:
    def family(self, spec: dict) -> {"quotes": [quote, ...], "incomplete": bool}
        # spec {"venue": "polymarket" | "kalshi", "query" | "series", "pattern"} (constitution W8 `markets`)
    def refresh(self, ids, venue="polymarket") -> {id: quote}          # resolved markets included
    def release_dates(self, series_by_kind: dict) -> {kind: [date, ...]}
        # Kalshi release calendars (FOMC, CPI, payrolls); a series with no open event raises DataError
    payload_sha256: list[str]
# quote: {"venue", "id", "question", "yes", "bid", "ask", "one_day_change", "end", "listed", "resolved",
#         "outcome", "closed_time", "event_id", "event_closed", "problem"} (+ "date" from family_quotes)
def family_quotes(quotes, pattern) -> list[dict]              # name matches the pattern; its date parsed
def pick_on_or_after(quotes, target, *, incomplete=False) -> dict
    # "the first listed date on or after target" (W8's invalidation market)
def pick_nearest(quotes, target, not_before, *, incomplete=False) -> dict
    # "the listed date nearest target, on or after not_before", ties to the earlier (W8's trigger markets)
    # both: {"status": "ok" | "missing" | "ambiguous", "market", "date", "reason", "listed"}; duplicates, flawed
    # markets that could be the pick, a missing price or an incomplete listing are "ambiguous" (fail closed)

# data/macro_data.py (W8/W9)
def front_month(root: "CL" | "BZ", date) -> pd.Period         # front-safe month: CL +1/+2, BZ +2/+3 (days 1-15 / after)
def front_contracts(root, date, n=2) -> ["BZZ26.NYM", ...]    # explicit months, never a continuous future
def day_move(bars, date) -> {"ok", "ret", "close", "prev_close", "prev_date", "reason"}   # dated exactly on date
def contango(front, second, date, threshold, max_stale_days=5) -> {"ok", "veto", "roll_yield", "prices", "reason"}
def load_supply_input(path) -> {"ok", "events", "reason"}    # state/inputs/w9_supply_loss.json; missing = no events
def supply_loss_check(events, date, prev_session, cfg) -> {"ok", "event", "reasons"}   # cfg: modules.W9.supply
class MacroData:
    def next_earnings(self, ticker, asof) -> {"ok", "date", "sources", "reason"}   # Nasdaq, Yahoo may only move
                                                                                    # it earlier (<= 7 days); never raises

# data/crypto_data.py
class CryptoSource(Protocol):                 # LiveCryptoData and FakeCryptoData implement it
    sources: dict[str, str]
    def stablecoin_quotes(self, markets: {coin: {venue: symbol}}) -> {"quotes": {coin: {venue: quote | None}},
                                                                     "errors", "fetched_at"}
    def eth_daily_utc(self) -> pd.Series      # ETH-USD per complete UTC day; Coinbase, then yfinance
    def btc_future_quote(self, year, month) -> dict | None   # {"ticker", "price", "time", "month", "name"};
                                                             # explicit months only (BTCX26.CME, then MBTX26.CME)
    def btc_spot_at(self, when) -> float | None               # Coinbase one-minute candle containing `when`
def crypto_source(provider) -> CryptoSource | None
# LiveCryptoData: 10 s timeout, one retry 2 s later; one GET per Coinbase product, one for all Kraken pairs,
# one per Gemini symbol; a venue failing never loses the others. A Coinbase symbol may be a cross,
# "USDT-USD/USDT-USDC" (USDC's USD book implied from two books).

# data/econ_calendar.py (config/econ_calendar.yaml: release dates with sources, and the owner's war onsets)
def load_calendar(path=None) -> EconCalendar
    # .of_kind(kind), .active(kinds=None), .postponed(), .covers(kind, day), .coverage_gaps(day, kinds),
    # .onsets, .verified, .sha256; raises CalendarError on an invalid file
def reaction_session(sessions, day, *, during_session=True) -> str | None   # first NYSE session on or after day
class MacroData(Protocol):                    # raises DataError when it has nothing
    def treasury_yields(self, tenor: "2Y" | "10Y", years=None) -> pd.Series   # Treasury par yield curve, percent
    def fred_series(self, series_id) -> pd.Series            # DGS2, DGS10, CPILFESL, CPIAUCSL, DFEDTARU
    def boj_basic_loan_rate(self) -> pd.Series               # BoJ cdab0101.csv, by effective date
class LiveMacroData / FakeMacroData                          # network (20 s, 3 retries) / in-memory
def macro_data_for(provider) -> MacroData | None
```

```python
# data/edgar.py (the EDGAR/FINRA shadow screens; with providers.py the only traderec code on the network)
SEC_USER_AGENT_ENV = "SEC_USER_AGENT";  DEFAULT_USER_AGENT = "traderec/<version> (paper-trading shadow screens)"
def sec_user_agent() -> str                     # the environment variable, stripped, else the generic default
class EdgarClient:
    def __init__(self, *, user_agent=None, session=None, sleep=time.sleep, clock=time.monotonic, max_rate=8.0,
                 workers=4, timeout=20.0, max_document_bytes=8_000_000)   # user_agent defaults to sec_user_agent()
    def start(self, *, seconds=None, documents=None) -> None    # the run's work budget; past it, BudgetExhausted
    def search(self, forms, start, end, *, q="", ciks=None, max_hits=2000) -> list[hit]   # EFTS, 100 hits a page
    def search_total(self, forms, start, end, *, q="") -> int
    def document(self, ciks, adsh, filename) -> str             # www.sec.gov/Archives, tried under each CIK in turn
    def documents(self, [(ciks, adsh, filename), ...]) -> {(adsh, filename): text | Exception}   # worker threads
    def company(self, cik) -> {"cik", "name", "tickers", "exchanges", "sic", "entity_type"} | None   # data.sec.gov
    def shares_outstanding(self, cik, asof) -> {"shares", "end", "filed", "form", "source"} | None
        # XBRL facts filed by `asof` (dei EntityCommonStockSharesOutstanding, else us-gaap), at most 400 days old
    def public_float(self, cik, asof) -> {"value", "end", "filed", "form", "source"} | None   # dei EntityPublicFloat,
                                                                                            # at most 550 days old
    stats: {"requests", "documents", "bytes", "retries"}
class FinraClient:                              # always the generic User-Agent; the secret goes to *.sec.gov only
    def short_interest(self, symbol, asof, *, lag_days=12) -> {"settlement_date", "short_qty", "avg_daily_volume",
                                                               "days_to_cover"} | None
        # api.finra.org, then cdn.finra.org's twice-monthly file; a settlement counts from settlement + lag_days
class RateLimiter(per_second=8.0)               # one limiter for every *.sec.gov host, across threads; capped at 10
class EdgarAccessDenied(DataError)              # HTTP 403: an undeclared User-Agent, or the SEC's rate threshold
class BudgetExhausted(DataError)                # the run's seconds or documents are used up; the rest carries over
# hit: {"adsh", "filename", "form", "file_type", "file_date", "period", "ciks", "entities", "items", "sics"}
# pure parsers (on recorded fixtures, tests/fixtures/edgar/): parse_efts, group_filings, display_name, yahoo_symbol,
# html_to_text, parse_long_date, parse_form4, parse_submissions, parse_concept_value, parse_shares_outstanding,
# parse_finra_si_rows, parse_finra_si_file, parse_special_dividend, parse_merger_terms, parse_merger_update,
# parse_cef_tender, parse_cef_tender_result
```

- **Hosts.** EDGAR full-text search (`efts.sec.gov/LATEST/search-index`: one hit per document, with the filers' CIKs, display names with tickers, and 8-K items), `data.sec.gov` (submissions and XBRL company concepts, point in time by filing date), `www.sec.gov/Archives` (the filing documents), and FINRA's consolidated short interest. EFTS and data.sec.gov answer the generic User-Agent; www.sec.gov answers HTTP 403 ("Undeclared Automated Tool") unless the User-Agent names who is asking, which is why the owner sets `SEC_USER_AGENT`.
- **Fair access.** Every request goes through one `RateLimiter` (8 a second by default, never above the SEC's 10), with a 20 s timeout; 429, 5xx and connection errors are retried 1, 2 and 4 s apart; 403 raises `EdgarAccessDenied` at once; 404 is a `DataError` ("not found"); everything else a `DataError`. `document` counts against the budget from `start`; `company` and the concept lookups are memoised per client.
- **Tests** pass a fake `session` (anything with a requests-style `get`, and `post` for FINRA) serving recorded payloads; no test touches the network.

## 2. Ledger — `traderec/ledger.py`

```python
class Ledger:
    def __init__(self, path: Path)                      # append-only JSONL; creates the file if missing
    def append(self, record_type: str, payload: dict, *, as_of: str,
               constitution_version: str) -> dict        # returns the full record including "hash"
    def head(self) -> str                                # hash of the last record, or "GENESIS"
    def verify(self) -> tuple[bool, str]                 # recompute the chain; detects edits, deletions, reordering
    def records(self, record_type: str | None = None) -> Iterator[dict]
```

- **Record envelope:** `seq`, `record_type`, `created_at` (UTC ISO), `as_of`, `constitution_version`, `payload`, `prev_hash`, `hash`.
- **Hash:** `hash = sha256(canonical_json(record without "hash"))`, where canonical JSON uses `sort_keys` and `separators=(",", ":")`.
- **Record types:** `run_manifest`, `snapshot`, `signal`, `recommendation`, `order`, `fill`, `mark`, `forecast`, `resolution`, `shadow`, `monthly_report`, `quarterly_report`, `annual_report`, `correction`. Phase B added `quarterly_report` and `annual_report`; the review's payload also says `"review": "quarterly" | "annual"`. Phase C (design v4 A.3) added `growth_decision`, `governor`, `order_set`, `rule_e` and `g3_shadow` (§12); a Sunday email's `recommendation` record has `"kind": "GROWTH"` and carries the facts record it was rendered from.
- **The `g3_shadow` payload** (Phase C4a, `traderec/runners/g3.py`): `{"rule": "cef_crash_discount" | "crypto_trust_discount", "event", "date", ...}` with, per event: `signal` (a slot opened: `id`, `ticker`, `book` "shadow" | "live", `signal_date`, `z`, `discount`, `mean252`, `sd252`, `price`, `adv_usd`, `leverage`, `crash_mode`, `reasons`; a trust: `discount`, `price`, `nav`, `catalyst` "filing" | "decision", `catalyst_detail`), `filtered` (a trigger refused: `ticker`, `z`, `discount`, `reasons`), `entry` (`id`, `ticker`, `book`, `signal_date`, `entry_date`, `entry_price`, `exit_due`, `usd`, `intent_id`, `trade_id`), `exit_signal` (`id`, `ticker`, `reason` "time_stop" | "mean_reversion" | "discount_closed" | "conversion" | "filing_withdrawn", `reasons`, `discount`, `mean252`), `exit` (the entry keys plus `exit_date`, `exit_price`, `exit_reason`, `return`, `baseline` (a fund) or `coin_return` (a trust), `excess`, `widened`, `exit_intent_id`), `void` (`id`, `ticker`, `reason`), `catalyst` (`ticker`, `filing`: {`form`, `filed`, `adsh`, `cik`, `url`, `withdrawn`} | null, `decision_date`, `hits`), `catalyst_error` (`ticker`, `error`), `promotion_test` (`quarter`, `status`, `shadow_stats`, `promotion`: {`passed`, `n`, `checks`, `reason`, `checks_ok`, `checks_total`, ...}) and `error` (`error`). The orders of a live slot are ordinary `order` records (`module` G3, `reason` "g3_entry" | "g3_exit" | "hard_stop", `meta.rule`, `meta.slot_id`) filled by the daily run.
- **Phase B payload conventions** (no other new types):
  - `snapshot` with `"kind": "option_chain"`: `root`, `source`, `asof`, `spot`, `raw_sha256` (what the fills saw), `needed_for`, `budget`, `path`, `bytes`, `file_sha256`, `rows`, `rows_total`, `level`, `surface`, `legs_kept`, `legs_missing`.
  - `fill` for a spread: the `Fill` fields plus the broker's decision meta and `"order_type": "spread_limit"`; a no-fill or cancellation is `{"type": "no_fill", "filled": false, ...}` with the model price and reason.
  - `mark` with `"kind": "spreads"`: `marks` per spread key (and `kept` in the daily run).
  - `signal` with `check`: `option_chain` (a chain not usable), `roots_needed` (a runner's request failed); M4's `entry`, `structure`, `size`, `admit`, `exit`, `liquidity_probe`, `entry_cancelled`; W8/W9's `trigger`, `pm_remap`, `veto` (request hash, sanitised response, verdict, before any email), `exit`, `invalidation_remap`.
  - `shadow`: `{"book", "event", ...}` for every shadow book, and for blocked W8/W9 candidates (`"event": "blocked"`, with `stage` and `reason`) and unconfirmed M4 or W10 signals.
  - `correction`: also for voided forecasts of an entry that never filled, and for spread orders cancelled by the expiry safety net.

## 3. Paper broker — `traderec/broker.py`

```python
class PaperBroker:
    @classmethod
    def new(cls, cfg: Config) -> "PaperBroker"            # accounts from account.yaml start_cash
    @classmethod
    def from_state(cls, state: dict, cfg: Config) -> "PaperBroker"
    def to_state(self) -> dict                           # JSON-serialisable; spreads round-trip, older states load
    def cash(self, account: str) -> float
    def positions(self, account: str | None = None, module: str | None = None) -> list[dict]
        # [{"account", "ticker", "module", "qty", "cost", "opened", "trade_id"}]; lots keyed by (account, ticker, module)
    def position(self, account: str, ticker: str, module: str) -> dict | None
    def queue(self, intent: OrderIntent) -> None
    def pending(self) -> list[OrderIntent]               # ETF orders and spread orders
    def fill_pending(self, date: str, opens: dict[str, float]) -> list[Fill]
        # Fill model v1.0: price = open * (1 + side * slippage_bps / 1e4), side +1 buy / -1 sell.
        # Buys: dollars capped by available cash (a partial fill is recorded in meta).
        # close_all sells the module's whole lot.
        # A missing open keeps the order pending once, then cancels it (recorded in meta).
        # Never touches spread orders.
    def accrue_interest(self, from_date: str, to_date: str, annual_rate: float) -> float
        # simple daily accrual on positive cash per calendar day; returns the interest added
    def mark(self, date: str, closes: dict[str, float]) -> dict
        # {"date", "nav", "by_account": {acct: {"cash", "positions_value", "equity"}}, "peak", "drawdown"}
        # updates the NAV peak; open spreads count at their last mark x contracts x 100, or at cost before a mark
    def market_value(self, account: str, ticker: str, module: str, price: float) -> float

    # Phase B: two-leg vertical spreads (order_type "spread_limit"; docs/PHASE_B_CONTRACTS.md §2-§4)
    def fill_spreads(self, date: str, time_et: str, chains: dict[str, OptionChain]) -> list[Fill]
    def spreads(self, account: str | None = None, module: str | None = None) -> list[dict]
    def mark_spreads(self, date: str, chains: dict[str, OptionChain]) -> dict[str, float]
    def settle_spread(self, key: str, date: str, value_per_share: float, reason: str) -> Fill
    def cancel_pending(self, intent_id: str, date: str, reason: str) -> OrderIntent | None
```

- **`queue` for a spread** (`OrderIntent` with `order_type="spread_limit"`, `ticker` = the option root, `legs` = position legs, `contracts` ≥ 1): the account needs `options_level` ≥ 3 (the taxable account; the IRA is level 2); the root must be whitelisted or an index root (XSP, SPX, SPXW); exactly one long and one short leg with valid OCC symbols on one root, one right, one expiry, two strikes, ratio 1. An opening order (`side="buy"`) must be a **debit** vertical with positive `limit_price` and `max_price` and no `close_all`; a closing order (`side="sell"`) must set `close_all`. Raises `ValueError` otherwise.
- **`fill_spreads`**: eligible orders are `spread_limit` orders created before `date` whose root's chain (SPXW uses the SPX chain) is in `chains` and dated `date`; closes go first, then opens, in queue order. Orders without such a chain stay pending, untouched. Each decision is `options.fillmodel.decide_fill` on the combo quote of the legs (a close uses the open spread's legs):
  - filled open: cash is debited contracts × P × 100 and the spread opens; filled close: cash is credited and the spread is removed;
  - no fill: the order moves to `cancelled` with `cancel_reason` and `cancel_date`. So does a close with no open spread, an open whose trade already holds a spread, and an open the account's cash can't pay;
  - `last_fill_meta[intent_id]` = `{"attempt", "reason", "quote", "cancelled", "model_price", "limit_price", "max_price", "time_et"}`, plus `"realized_pnl"` (0.0 for opens), and `"entry_price"` and `"cost"` for closes;
  - the `Fill`: `qty` = contracts, `price` = P, `ref_price` = combo mid, `multiplier` 100, `dollars` = contracts × P × 100, `slippage_bps` 0.0, `model_version` "1.0", `legs` = the leg quotes used, `fill_time` = `time_et`.
- **`spreads()`** rows: `{"key": "account|trade_id", "account", "module", "trade_id", "root", "legs", "contracts", "entry_price", "cost", "opened", "expiry", "mark", "mark_date", "width", "multiplier", "intent_id", "fill_time"}`. `mark` is None until the first mark.
- **`mark_spreads`** returns `{key: mark per share}` for the spreads it marked, at the combo mid clamped to [0, width]; a spread without a same-day chain or a two-sided quote keeps its last mark.
- **`settle_spread`**: closes the spread at `value_per_share` clamped to [0, width], cancels the trade's pending spread orders, and returns a sell `Fill` whose `intent_id` is `SETTLE-<date>-<trade_id>`; `last_fill_meta` has `"settled": True`, `"realized_pnl"`, `"cancelled_orders"`, … Raises `KeyError` for an unknown key and `ValueError` for a value that isn't a finite number ≥ 0.

## 4. Forecasts — `traderec/forecasts.py`

```python
def make_forecasts(rec: Recommendation, cfg: Config) -> list[dict]
    # 1-3 pre-registered, mechanically resolvable forecasts:
    # {"forecast_id", "trade_id", "module", "question", "p", "resolves": "on_exit" | "date", "due": date | None}
def resolve_trade_forecasts(forecasts: list[dict], trade_result: dict) -> list[dict]
    # adds "outcome" (0/1) and "brier"
def brier(p: float, outcome: int) -> float
def summarize(resolved: list[dict]) -> dict
    # counts, mean Brier, mean p vs hit rate, per module
EXTRA_SPECS: dict[tuple[str, str], Callable[[Recommendation, Config], list[dict]]]
    # Phase B runners register builders at import: EXTRA_SPECS[(module, kind)] = builder, returning _spec(...) dicts
```

Phase B registrations, all on `NEW_TRADE` and resolved on exit (the existing `profit` and `time_stop` events):

| Module | Forecasts (p) | Source |
|---|---|---|
| M4 | "The spread closes worth more than its debit" (0.60) | `runners/m4.py`; `modules.M4.forecasts.p_profit` |
| W8 | profit (0.50); exits on the 20-trading-day time stop (0.60) | `runners/macro.py`; `modules.W8.forecasts` |
| W9 | profit (0.40); exits on the time stop (0.45) | `runners/macro.py`; `modules.W9.forecasts` |

An entry that never fills voids its open forecasts with a `correction` record.

## 5. Modules and risk — `traderec/modules/`, `traderec/risk.py`

```python
# m1_dipbuy.py (ST-1)
def m1_entry_check(spy: pd.DataFrame, vix: pd.Series, date: str, cfg_m1: dict) -> dict
    # {"signal": bool, "close", "sma200", "rsi2", "vix", "reasons": [...]}; uses raw SPY closes
def m1_exit_check(spy: pd.DataFrame, date: str, open_trade: dict, cfg_m1: dict) -> dict
    # {"exit": bool, "reason": "exit_rule" | "time_stop" | None, "sessions_held", "close", "sma5"}
    # sessions_held counts sessions from the fill date (fill day = 1) to `date` inclusive;
    # time stop when sessions_held >= max_sessions (sell at the next open = session 21)

# m2_trend.py (long-only ETF8)
def m2_signals(adj: dict[str, pd.Series], date: str, rf_annual: float, cfg_m2: dict) -> dict[str, dict]
    # per leg: {"ret_252", "excess", "sign", "vol", "raw_target_frac"}
def m2_targets(signals: dict, nav: float, stress: dict[str, float], cfg_m2: dict) -> dict
    # {"targets": {ticker: dollars}, "scalers": {...}, "notes": [...]}
    # long-only; per-leg cap; gross cap; US-equity legs scaled so sum(notional * stress) <= cap * nav
def m2_orders(current: dict[str, float], targets: dict[str, float], cfg_m2: dict) -> dict
    # {"orders": [{"ticker", "side", "dollars", "close_all"}], "deferred": [...], "skipped_band": [...]}
    # sells first; no-trade band; exits to zero always execute; at most max_orders_per_email
    # (the rest deferred, largest |diff| first)

# m3_btc.py
def btc_weekly_switch(btc_daily_utc: pd.Series, asof_utc_date: str, weeks: int = 10) -> dict
    # {"on": bool, "week_end": date, "weekly_close", "sma", "complete": bool}
    # weekly close = close of the last complete week ending Sunday (UTC candles)

# w10_crashbuy.py (W10: policy module with a 90-day exception, design v3.3 §3)
def w10_signal(spx: pd.DataFrame, date: str, cfg_w10: dict, *, close_override: float | None = None) -> dict
    # {"signal", "ret", "close", "prev_close", "sma_prev", "prior_shock", "reasons"}; unrounded closes;
    # close_override re-runs the test on a second source's close (the pipeline requires both to fire)
def w10_exit_date(entry_date: str, max_calendar_days: int) -> str       # the last NYSE session <= entry + N days
def w10_exit_check(date: str, open_trade: dict, cfg_w10: dict, sessions=None) -> dict
    # {"exit", "reason": "calendar_stop", "exit_date", "days_held", "sessions_held"}; exit queued the evening before
def w10_kill_check(history: list[dict], nav: float, cfg_w10: dict) -> str | None   # damage-limit kill switch

# shadow.py
def st1b_entry_check(...)  # as m1_entry_check without the VIX gate
def w10_check(spx: pd.DataFrame, vix: pd.Series, date: str, last_trigger: str | None, cfg_w10: dict) -> dict

# m4_crashspread.py (M4, O2; Phase B): pure, on closes up to the run date
def crash_condition(closes, vix, cfg_m4) -> pd.Series      # close <= (1 + drop_from_high) x its 252-session high
                                                           # (today included) and VIX >= vix_min
def signal_chain(condition, cooldown_days) -> list[pd.Timestamp]   # a signal needs (day - last).days > cool-down
def m4_signal(spx, vix, date, cfg_m4, *, cooldown_until=None, close_override=None, vix_override=None) -> dict
    # {"signal", "condition", "first_day", "close", "high", "drawdown", "vix", "last_signal", "cooldown_until",
    #  "reasons"}; fail closed without today's close, 252 closes or a VIX history covering the window
def cooldown_end(signal_date, cooldown_days) -> str;  entry_session(signal_date) -> str   # the next session
def choose_expiry(expiries, entry_date, max_calendar_days, min_dte) -> str | None   # latest in [entry + min_dte,
                                                                                   #  entry + max_calendar_days]
def choose_strikes(chain, expiry, spot, short_ratio, tolerance) -> {"ok", "long_strike", "short_strike", "legs",
                                                                    "reasons"}      # each within 1% of its target
def size_contracts(nav, per_contract_usd, target_frac, cap_frac) -> {"contracts", "target_usd", "cap_usd",
                                                                     "per_contract_usd", "reason"}
def spread_terms(legs, price, contracts, multiplier=100) -> {"long_strike", "short_strike", "width", "width_usd",
                                                             "max_value_usd", "breakeven", "max_multiple"}
def intrinsic_value(legs, underlying) -> float
def last_close_date(expiry) -> str;  planned_exit_date(expiry, sessions_before=2) -> str
def m4_exit_check(date, open_trade, sessions_before=2) -> {"exit", "reason": "expiry_rule" | None, "exit_date",
                                     "last_close_date", "expiry", "next_session", "too_late", "days_held"}
def liquidity_fallback(...)         # used only if options.chain.liquidity_check were missing

# w8w9_macro.py (W8, W9; Phase B): pure
def move_leg(moves, threshold) -> {"fired", "disagree", "by", "rets", "reason"}   # disagreement fails closed
def pm_leg(prev, today, prev_session, jump, through) -> {"fired", "up", "through", "prev", "price", "market_id",
                                                         "question", "reason"}   # needs last session's snapshot
def release_ban(entry_date, releases, sessions) -> {"banned", "hits", "window"}  # entry day .. + `sessions`
def discretionary_pause(marks, cfg, pause_at) -> {"paused", "reason"}   # cfg: circuit_breakers; 20% DD, -2% day, -4% week
def expiry_candidates(expiries, entry_date, dte_min, dte_max, before=None) -> list[str]   # latest first
def call_spread(chain, expiry, spot, moneyness) -> {"ok", "long", "short", "legs", "reason"}
def no_oil_short(module, root, legs) -> None          # ValueError: W8 on an oil root, or not a bull call spread
def round_price(price, side) -> float                 # to the cent: buys up, sells down
def contracts_for(budget_usd, max_price, multiplier=100) -> int
def sessions_after(date, n) -> str;  sessions_held(fill_date, date) -> int
def time_stop_date(entry_date, sessions) -> str       # entry session = 1: the exit order goes out on the evening
                                                      # of session `sessions` and fills in the next one
def exit_check(module, date, ot, value, cfg, invalidated=None) -> {"exit", "reason", "sessions_held", "value",
                                                                   "detail"}
    # in order: "expiry_rule" (<= expiry_close_sessions to expiry), "invalidation" (sticky), "take_profit"
    # (W8: value >= 0.8 x width; W9: value >= 2 x entry price), "time_stop"

# option_shadows.py (O1/M7, O1-h, I1, I2, ST-2; Phase B): pure; see docs/phase-b/option-shadows.md
monthly_expiry(year, month); cycle_expiry(entry_date, window); days_to_expiry(expiry, day); nth_session(sessions,
    start, n)
o1_filters(index, vix, vix3m, date, cfg_filters); vix_fade_signal(vix, date, last_signal, cfg_trigger)
btc_trend(btc, date, sma_days); st2_signal(spy, vix, vix3m, date, cfg)
pick_expiry(expiries, day, *, target=None, target_dte=45, dte_range=(40, 50)); pick_put_spread(chain, expiry, day,
    cfg, *, rate=0.0)   # Black-Scholes put delta when the chain has none
atm_iv(chain, expiry); iv_term_ratio(chain, day, near_dte, far_dte)
credit_quote(chain, legs); sell_to_open_price(quote, concession); buy_to_close_price(quote, concession)
credit_liquidity(chain, quote, legs, cfg_liquidity)
spread_intrinsic(legs, spot); managed_exit(credit, cost_to_close, days_left, cfg)
result_on_max_loss(credit, width, cost) -> {"pnl", "max_loss", "return"}   # per share; R = P&L / max loss
o1_promotion_check(trades, cfg_promotion, *, months=None)       # track 14 §7.6

# crypto_shadows.py (M6, ETH; Phase B): pure; see docs/phase-b/crypto.md
depeg_check(quotes, cfg) -> dict; depeg_step(book, quotes, now, cfg, nav, coins, *, markets) -> [changes]
cme_btc_expiry(year, month); carry_contracts(asof, max_days=60, months_ahead=4); quote_window(run_date)
carry_check(contract, quote, spot, tbill, cfg); carry_open(chk, run_date, nav, cfg); carry_close(ev, asof, cfg)
eth_step(book, closes, asof_utc, cfg, *, tbill) -> {"changes", "notes", "problems"}
eth_promotion(weeks, cfg=None) -> {"weeks", "months", "alpha_annual", "beta", "t", "passes", "rule"}
m6_summary(events) -> {"depeg": {...}, "carry": {...}}; hour_label(when) -> "YYYY-MM-DDTHHZ"

# macro_shadows.py (W3, W4, gold fade, release log; Phase B): pure; see docs/phase-b/macro-shadows.md
window_move, bucket, cpi_mm, fed_decision, boj_decision, nearest_fomc, w3_check, w4_check, new_trade,
advance_trade, w3_exit_check, w4_exit_check, time_exit_check, baseline_mean, score_trade, t_stats,
promotion_summary, bh_fdr

# edgar_screens.py (SH1-SH4, CEF; Phase B): pure, no I/O; see docs/phase-b/edgar.md
SETUPS = {"SH1": "insider cluster buy", "SH2": "special dividend", "SH3": "activist Schedule 13D",
          "SH4": "near-completion cash merger", "CEF": "CEF tender capture"};  KNOWN_ACTIVISTS (track 16's list)
first_session_after(d); nth_session_after(d, n); anchor_session(d)          # NYSE sessions around a filing date D
market_features(bars, d) -> {"price", "dvol20", "hist", "last_bar", "stale"}   # before the filing's first session
market_cap(shares, price, public_float) -> (mcap, basis);  cost_for(mcap, costs) -> (bucket, round_trip)
benchmark_for(mcap) -> "SPY" | "IWM";  universe_check(features, mcap, rules) -> [reasons]
form4_purchase(doc, filing_date, adsh, max_lag_days=14) -> purchase | None
insider_cluster(purchases, window_days, min_insiders, *, not_before) -> cluster | None
ticker_check(bars, trade_date, vwap, tolerance) -> {"ok", "close", "ratio"}
infer_dividends(bars) -> pd.Series;  special_dividend_ex_date(parsed, price) -> (ex_date, basis)
special_dividend_check(parsed, bars, d, price, cfg) -> {"ok", "reasons", "amount", "yield", "regular_median",
                                                       "prior_dividends", "ex_date", "ex_basis", "exit_due"}
activist_match(filer_names) -> str | None
merger_apply(deal, update, d) -> deal;  merger_trigger(deal, d, cfg) -> {"ok", "reasons", "days_to_close"}
cef_tender_check(terms, price, nav, entry_day, cfg) -> {"ok", "reasons", "discount", "days_to_expiry"}
entry_day(bars, d);  window_returns(bars, bench, start, end, cost) -> {"open": {...}, "close": {...}}   # each
    {"raw", "bench", "excess", "net"};  filing_reaction(bars, bench, d);  follow_exit(bars, start, hold_sessions)
observed_ex_date(bars, expected, amount);  score_merger(entry, start, exit_date, exit_price, cost)
score_cef(bars, bench, start, sell_day, accepted, tender_price, cost)
primary_return(event); t_stat(values); clustered_t(values, dates); setup_stats(events, setup)
promotion_test(events, setup, rule, *, tbill=None) -> {"setup", "stats", "checks", "passed", "demote"}
reaction_split(events, setup, asof, months=24);  book_summary(events, month=None) -> [{"name", "signals", "closed",
    "mean_ret"}]                                       # built for the reviews; nothing calls them yet (§9)

# risk.py
def governor(drawdown: float, cfg_risk: dict) -> float     # G(D)
def stress_table(closes: dict[str, pd.Series], cfg: Config) -> dict[str, float]
    # |worst 10-session loss| per ticker, floored at stress_floor; IBIT uses crypto_stress
def open_stress(positions: list[dict], values: dict, stress: dict, cfg: Config, *,
                spreads: list[dict] | None = None, pending: list | None = None) -> dict
    # {"total", "us_equity", "by_module", "nav"}; M2 counted once as its sleeve stress.
    # With spreads or pending (Phase B; an empty list counts) also {"by_cluster", "premium",
    # "premium_by_cluster", "pending"}:
    # - each open spread counts at max(cost, mark x contracts x 100) in its module, its cluster
    #   (spread_cluster) and the option premium; a spread with neither raises ValueError;
    # - each pending buy counts as if filled tonight: a spread at max_price x contracts x 100, an ETF order at
    #   dollars x unit stress; sells, M2's orders and shadow orders are left out
def admit(module: str, ticker: str, dollars: float, positions_stress: dict, stress: dict, cfg: Config,
          drawdown: float) -> dict
    # {"ok": bool, "dollars": float (possibly scaled), "binding": str | None, "notes": [...], "cluster_overflow"}
    # v3.3: M1 has priority in the 7% US-equity cluster (never cut; overflow reported); W10 is skipped when the
    # reserve leaves less than cluster_min_fraction of its size
def admit_premium(module: str, root: str, premium_usd: float, cluster: str, positions_stress: dict, cfg: Config,
                  drawdown: float, *, exempt_governor: bool = False, min_premium_usd: float = 0.0) -> dict
    # Phase B: a defined-risk option trade whose stress is its premium. Scaled down in order by:
    # "governor" (unless exempt_governor or M4), "per_trade_premium" 3%, "option_premium" 10% (open + pending),
    # "factor_premium" 3% per cluster, the cluster ("us_equity_cluster" 7%, else "<cluster>_cluster" 6%),
    # "total_open_stress" 10%. Needs open_stress(..., spreads=...) output ("nav", "premium"), else ValueError.
    # ok is False when the allowed premium is 0 or below min_premium_usd (one contract). Returns {"ok",
    # "premium_usd" (allowed), "binding", "notes", "cluster_overflow" (always 0.0)}
def ticker_cluster(ticker, cfg) -> str      # "us_equity" for SPY/QQQ/VOO, S&P index options and M2's equity legs;
                                            # "crypto"; M2's leg map; else "other"
def spread_cluster(module, root, cfg) -> str   # SPREAD_CLUSTERS: M4 -> "us_equity"; W8, W9 -> "oil"; else the root's
def premium_caps(cfg) -> dict               # risk.caps overrides PREMIUM_CAPS (0.03 / 0.10 / 0.03 / 0.06) key by key
```

`pipeline.Run.open_stress(stress)` passes `spreads=broker.spreads()` and `pending=broker.pending()`, so every admission (M1, W10, M3, M4, W8, W9) sees open spreads and tonight's queued buys. M4 builds the same book itself (`runners.m4._book_stress`), counting every pending buy, so a W10 order queued the same evening takes the US-equity reserve first.

## 6. Emails, validator, notify, feedback — `traderec/emails.py`, `traderec/validator.py`, `traderec/notify.py`, `traderec/feedback.py`

```python
def render(rec: Recommendation, ctx: dict) -> RenderedEmail
    # ctx: {"mode": "paper" | "live", "nav", "portfolio_after": [...], "ledger_head", "issue_url",
    #       "data_asof", "sources", "constitution_version"}
    # Sections (design §3a, spec 11): headline box, in one sentence, Robinhood steps (<= 7 taps, exact values),
    # what-if, how you get out, why, the odds (base rates), risks and tax, portfolio after, footer + disclaimer.
    # Every number goes through a registry (numbers_registered).
    # A rec with any order_type "spread_limit" order renders as a vertical spread (_SpreadEmail, below).
def render_monthly(report: dict, ctx: dict) -> RenderedEmail
def render_quarterly(report: dict, ctx: dict) -> RenderedEmail     # Phase B (§11)
def render_annual(report: dict, ctx: dict) -> RenderedEmail        # Phase B (§11)

def validate(email: RenderedEmail) -> list[str]
    # every numeric token in subject/text must be in numbers_registered or a template-allowed literal
    # (ALLOWED_LITERALS; Phase B added "11:00", the spread re-price time; Phase C "9:20" and "9:35", the Sunday
    # email's Step 1 deadline and Step 2 time), then check_slots (value AND slot). For meta["kind"] GROWTH or RULE_E
    # the slots and their values are rebuilt from meta["facts"] (growth_slots, growth_problems; §12)

def send(email: RenderedEmail, *, dry_run: bool, outbox: Path) -> dict
    # Gmail API via HTTPS (refresh-token flow; env GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN,
    # ALERT_TO_EMAIL); dry_run or missing credentials -> write .eml to outbox
def create_issue(title: str, body: str, labels: list[str] | None = None) -> str | None
    # GitHub REST (GITHUB_TOKEN, GITHUB_REPOSITORY); None when unavailable
def healthcheck(status: str) -> None
    # HC_PING_URL; "start" | "success" | "fail"; silent on errors
```

**Spread emails** (`_SpreadEmail`, a subclass of the ETF email). The order's side decides the email: `buy` opens a debit vertical (NEW_TRADE), `sell` with `close_all` closes it (EXIT). The subject reads `[PAPER][TRADE <trade_id>] BUY 2 XSP 770/810 call spreads, 18 Dec, limit $7.45 — <module name> (<module>) — after 10:00 ET <execute date>` (CLOSE for an exit). The email gives the headline box (ACTION, SIZE = the debit, STRESS = the debit at the stated maximum, WINDOW "after 10:00 ET … not filled by 11:00 ET: re-enter once at the stated maximum (minimum); otherwise skip (wait for tomorrow's email)", ODDS "of the debit", RESULT for an exit), an explainer, 7 opening or 6 closing Robinhood steps, the what-if, the planned close, why, odds, risks, the tax line (`SECTION_1256_TAX` for XSP/SPX/SPXW, else `ORDINARY_OPTION_TAX`), and `meta["order_type"] = "spread_limit"`. If the strikes, the expiration or the limit are missing from both the facts and the order, the email says to place nothing.

**Facts keys** (all optional; facts win, the order's fields fill the gaps): NEW_TRADE `root`, `underlying_name`, `strategy_label`, `legs`, `expiry`, `contracts`, `limit_price`, `max_price`, `debit_usd`, `max_debit_usd`, `max_value_usd`, `breakeven`, `spot`, `exit_date`, `stress_usd`, `stress_pct`, `section_1256`, `settlement` ("cash-settled, European-style" | "shares, American-style"), `base_rates`, `exit_plan`, `multiplier`; EXIT `contracts`, `limit_price`, `max_price` (the stated minimum), `credit_usd`, `min_credit_usd`, `entry_price`, `pnl_usd`, `pnl_pct`, `reason` ("time_stop" | "take_profit" | "invalidation" | "expiry_rule"), `exit_date`; both `execute_date`, labels and `base_rates` as for ETF emails. Derived keys module text may use: `right`, `direction`, `long_strike`, `short_strike`, `strikes`, `width`, `spreads_phrase`, `per_spread_usd`, `max_per_spread_usd`, `debit_frac`, `when`. `runners.m4` and `runners.macro` build their facts (`entry_facts`, `exit_facts`) with every contract key plus their own.

**Module text** lives in `traderec/email_text/<module>.py` as `TEXT = {table: entries}` (`m4.py`, `w8w9.py`), merged into `emails.py`'s tables at import by `email_text.merge_module_text`: `MODULE_NAMES`, `MODULE_STATUS`, `MODULE_CONFIDENCE`, `DEFAULT_TICKERS`, `TICKER_NAMES`, `PLAN_NAMES_EXIT_EMAIL`, `ONE_SENTENCE`, `WHY`, `EXIT_PLAN`, `RISKS`. A duplicate key raises. No digits in templates.

**Owner feedback** (`traderec/feedback.py`): the monthly and quarterly jobs read the trade issues' comments: `filled <dollars> @ <price> [TICKER]`, `filled <contracts> @ <net price> [ROOT]` for spreads ("contracts", "spreads" or "x" after the count is fine), or `skipped`. `review(issues, model_fills, *, fetch)` returns `{"issues", "handled", "measured", "fills", "median_gap_bps", "spread_fills", "spread_median_gap_bps", "spread_fills_ok", "fills_ok"}`: `fills` and `median_gap_bps` are the ETF orders (gate: median |gap| ≤ `FILL_TOLERANCE_BPS` = 10 bp); spread gaps are in bp of the net price (gate: median ≤ `SPREAD_FILL_TOLERANCE_BPS` = 200 bp), each row with `gap_usd` per contract; `fills_ok` needs every measured group within tolerance. A spread price typed per contract (50–200 × the model's) is read as per share. A paper fill is a spread fill when it records `order_type`, a `multiplier` above 1 or `legs`, or else when its module is in `SPREAD_MODULES` (M4, W8, W9). The issue body asks for `filled <contracts> @ <net price>` on spread emails.

## 7. Pipeline, CLI and runs — `traderec/pipeline.py`, `traderec/facts.py`, `traderec/cli.py`

```
python -m traderec init       [--nav 100000] [--date D] [--if-missing]   # create state/state.json and an empty ledger
python -m traderec daily      [--date D] [--dry-run] [--force]   # default D: the latest session whose close is final
python -m traderec weekly     [--date D] [--dry-run] [--force]   # Bitcoin switch; default D: the latest Sunday (ET)
python -m traderec monthly    [--month YYYY-MM] [--dry-run] [--force]    # default: the month that just ended
python -m traderec options    [--date D] [--dry-run] [--force]   # Phase B: the 10:17 ET job; default D: today (ET)
python -m traderec hourly     [--dry-run]                        # Phase B: the hourly stablecoin depeg check
python -m traderec quarterly  [--quarter YYYY-Qn] [--dry-run] [--force]  # Phase B; default: the quarter just ended
python -m traderec annual     [--year YYYY] [--dry-run] [--force]        # Phase B; default: the year just ended
python -m traderec verify-ledger
python -m traderec status     # the paper book, open spreads and pending spread orders, open trades, recent runs
```

**The historical replay harness** (`scripts/replay.py`; method and results in `docs/phase-b/replay.md`) is a script, not a CLI command, and adds no run kind: it drives the real `run_init`, `run_daily`, `run_weekly` and `run_monthly` day by day over past years, so its runs are ordinary `daily:<date>`, `weekly:<date>` and `monthly:YYYY-MM` runs in a state directory of its own (`--work/state`), with `dry_run=False` and stub services. The workflows never run it, and only `fetch` (and track 15's research code, when its cache is missing) touches the network.

```
python scripts/replay.py fetch     [--cache DIR] [--refresh]                            # every series, once, as pickles
python scripts/replay.py run       [--start 2019-01-02] [--end 2026-09-28] [--cache DIR] [--work DIR] [--resume]
                                   [--no-cut] [--second-source echo|history]
python scripts/replay.py reconcile [--cache DIR] [--work DIR ...] [--out research/code/25-replay] [--compare DIR]
python scripts/replay.py all       [...]                                               # fetch if needed, run, reconcile
# defaults: --cache /tmp/traderec-replay-cache (env TRADEREC_REPLAY_CACHE), --work /tmp/traderec-replay-work
# (TRADEREC_REPLAY_WORK); --config-dir on every command
```

```python
@dataclass
class History: bars, vix, btc, tbill, flags, sources, proxy_before, second     # the full histories from the cache
def replay_tickers(cfg) -> list[str]           # SPY, ^VIX, W10's index, M1's, W10's and M3's tickers, M2's legs
def fetch_history(cfg, cache, *, refresh=False) -> manifest
    # LiveProvider downloads: bars for replay_tickers, CBOE VIX, FRED DTB3, Coinbase daily BTC (from 2017) and hourly
    # BTC (for the IBIT proxy), Yahoo BTC-USD (gap fill), FRED SP500 and Nasdaq SPY history (the second sources)
def load_history(cfg, cache) -> History        # splices the flagged IBIT proxy before IBIT's first session (ibit_proxy),
                                               # fills BTC gaps from Yahoo (flagged)
class AsOfProvider(history, *, cut=True, second_source="echo")   # a DataProvider served as of set_asof(date):
    # daily_bars / vix: rows <= the date; btc_daily_utc: UTC days <= the date; tbill_rate: the last DTB3 print before
    # it; second_source_close: "echo" = the primary close as "replay-echo" (counted in .echoes), "history" = Nasdaq SPY
    # / FRED SP500, None when absent (fail closed); cut=False is the look-ahead diagnostic; .served_after_asof, .calls,
    # .second_calls, .sources
class CaptureServices(email_dir=None, *, first_n=1)   # .services() -> pipeline.Services: send re-validates each email
    # and writes it as text (.emails); create_issue -> None (.issue_calls); healthcheck recorded (.pings);
    # fetch_comments -> None
def schedule(start, end) -> [(kind, date_or_month, asof)]   # monthly on the 1st for the month just ended (as of its
                                                             # last day), daily Monday-Friday, weekly on Sundays
def replay(cfg, provider, state_dir, start, end, capture, *, resume=False, progress_every=21) -> [run rows]
    # run_init at `start` (unless resuming after _last_done), then every scheduled run; an exception is recorded and
    # the loop goes on; rows {"kind", "date", "asof", "status", "seconds", "notes", "emails", "fills", "alerts", "nav",
    # "error"}
def run_segment(cfg, history, work, start, end, *, resume=False, cut=True, second_source="echo") -> None
    # refuses a non-empty work/state without --resume; writes runs.csv, emails.csv, emails/, segment.json
def reconcile(cfg, works, out, *, history=None, compare=None) -> {"summary", "segments"}
    # summary.csv and the CSVs listed in docs/phase-b/replay.md; the research lists: tracks 13 and 23 from their
    # results/ (research_st1, research_w10), track 15's R1 and R2 recomputed with its own code (research_r1,
    # research_r2); a W10 re-pricing at the open (w10_reprice_open); the two-source rules on every signal day with the
    # real historical second sources (second_source_check)
def compare_runs(work_a, work_b, until=None) -> {"records_a", "records_b", "identical", "first_difference",
                                                  "spy_check_failures", "w10_unconfirmed"}    # DECISION_RECORDS only
# pure helpers, also used by tests/test_replay.py: match_trades, match_switches, event_summary, max_drawdown,
# sleeve_pnl, admissions, ibit_proxy, parse_candles_ohlc, parse_nasdaq_rows, pipeline_trades, m2_decisions, m3_weeks,
# m1_checks, fills_frame
```

`tests/test_replay.py` loads the script with `importlib` and drives it offline through a synthetic market: the as-of rules, both second sources, production order, an end-to-end replay, identical decisions with and without the cut, resume, and the reconciliation helpers. The 2019–2026 reconciliation (M1 39 of 40 track-13 trades, W10 3 of 3, M2 722 of 736 leg-months, M3 400 of 404 weeks; 17.4 minutes) and its four findings are in `docs/phase-b/replay.md`. Findings 2 and 3 were fixed afterwards (`market_calendar`'s unscheduled closures; track 23's W10 exit pricing); findings 1 and 4 (M3 never re-sized; M2's excess and EWMA definitions) stand, and are listed in design Appendix C.

- **Exit codes:** 0 done or nothing to do; 3 a `data_missing` result, the data isn't available yet (retry; from `daily`, `options` or `hourly`); 1 error.
- **Run kinds and keys** (one run per key; `state["runs"][key]` holds its status and ledger range):

  | Kind | Key | Statuses |
  |---|---|---|
  | `init` | `init:<date>` | `ok` |
  | `daily` | `daily:<date>` | `ok`, `no_session`, `data_missing` |
  | `weekly` | `weekly:<date>` | `ok` |
  | `monthly` | `monthly:YYYY-MM` | `ok` |
  | `options` | `options:<date>` (ET) | `ok`, `no_session`, `data_missing`; not recorded: `too_early`, `too_late` (scheduled runs outside `options.snapshot_window_et`), `disabled` (`options.enabled: false`) |
  | `hourly` | `hourly:<YYYY-MM-DDTHHZ>` (UTC hour) | `ok`, recorded only in an hour with a depeg event; not recorded: `no_change`, `disabled`, `data_missing` (no venue answered) |
  | `quarterly` | `quarterly:YYYY-Qn` | `ok` |
  | `annual` | `annual:YYYY` | `ok` |

  Any run may also return `already_done` without running (and the hourly job returns it for an hour already recorded).
- **State:** `state/state.json` holds `{"broker", "modules", "shadow", "forecasts", "runs", "counters", "marks", "dividends", "issues", "fills", "outbox", "alerts"}` (plus `version`, `created`, `mode`, `constitution_version`, `last_accrual`, `last_daily`). `state/pre_run.json` is the state before the most recent run, which is what `--force` restores. `state/outbox/` holds `.eml` copies of emails that were not sent (dry runs, no Gmail credentials, failed sends). Phase B adds `state/options/<date>/<root>-<HHMM>.csv.gz` (§8.3) and reads the owner's `state/inputs/w9_supply_loss.json` (from the real state directory, also in dry runs).
- **Phase B state keys** (created by `new_state`; runners `setdefault` them for older states): `modules.M4` `{"open_trade", "history", "cooldown_until"}` (+ `last_signal`, `armed`, `liquidity_probe`, `skipped`); `modules.W8` / `W9` `{"open_trade", "history"}` (+ `events`, the last 60 candidate outcomes; `pm_map` (W8); `data_flags`; `veto_model_sha256`; `processed_events` (W9)); `shadow.M4_TWIN`, `O1`, `O1H`, `I1`, `I2`, `ST2` `{"open_trade", "trades"}` (+ `held`, `last_cycle`, `last_signal`); `shadow.ETH` `{"on", "last_week_end", "open_trade", "trades"}` (+ `weeks`); `shadow.M6` `{"events"}` (+ `watch`, `carry_last`); `shadow.MACRO` `{"events"}` (+ `meta`); `shadow.EDGAR` `{"events", "seen"}` (+ `cursor`, `started`, `insiders`, `lockout`, `deals`, `last_run`; §9). A spread module's `open_trade` is `{"trade_id", "status": "pending_entry" | "open" | "pending_exit", "signal_date", "intent_id", "root", "account", "legs", "contracts", "expiry", "exit_date", "limit_price", "max_price", "entry_price", "fill_date", "cost", ...}`. Shadow trades and events carry `signal_date`, and closed ones `exit_date` and `return`, which the review tables read.
- **Idempotency:** one run per key. `data_missing` and `error` runs may be retried. `--force` re-runs only the most recent run (of any kind, a recorded hourly hour included), from `pre_run.json`, and records a `correction` in the ledger.
- **Ledger integrity:** each run verifies the hash chain and that the record the state last committed (`counters.ledger_head`) is still there. Records written by a run that crashed before saving the state are marked with a `correction`. A quiet hourly check reads the state and writes nothing.
- **Daily order of work** (`pipeline._daily`):
  1. retry emails that failed to send earlier, while their orders are still current;
  2. credit dividends (ex-dates since the last run, on the holdings before today's fills);
  3. fill queued ETF orders at the first session after their creation date (spread orders are left to the options job);
  4. accrue T-bill interest;
  5. spread marks (`options.job.mark_spreads`, only with open spreads): settle any spread open on or after its expiry at intrinsic value from the official close (the safety net), then mark the rest at tonight's closing chains (§8.4);
  6. mark the book (spreads at mark × contracts × 100, or cost before a first mark);
  7. snapshot and two-source checks;
  8. M1 exit or entry;
  9. W10 exit (calendar-exact) or entry (two-source S&P close; admitted after M1);
  10. M4 (`runners.m4.daily`): the twin's expiry settlement, the open spread's close, then the entry test; after M1 and W10 in the US-equity reserve;
  11. M2 monthly decision, or the next batch of deferred legs;
  12. M3 catch-up (the weekly job normally decides);
  13. W8/W9 (`runners.macro.daily`): exits first, then W8, then W9;
  13a. Rule E (`growth.rule_e.daily`, design v4 §3a.7): while the growth book is enabled and not paused, each held G1 leg whose index closed below its 200-day average (no band, two sources) is sold at the next open with a short exit-only email (§12);
  14. the Phase A shadow book (ST-1b; every uptrend −3% day scored at 60 and 90 days);
  15. the Phase B shadow runners, each inside `pipeline._shadow_guard`: `option_shadows` → `crypto` → `edgar` → `macro_shadows`;
  16. dated forecasts;
  17. drawdown alerts.
- **Each decision:** pre-registered in the ledger, rendered, validated, GitHub issue opened, paper orders queued, and email sent after the state is saved. A validator failure blocks the orders and raises an alert.
- **Owner feedback:** see §6. The monthly job measures two go-live gates: emails handled, and practice fills vs the fill model (ETFs 10 bp; spreads 200 bp of the net price).
- **Monthly report** (`facts.monthly_report`, `emails.render_monthly`): generic over every module and shadow book in the state, whatever its shape. History entries with `exit_date` are closed trades, and entries without one (M2's rebalances) count as opened on their `date`; shadow `events` count by the first of `signal_date`, `date`, `event_date`, `detected`, `filed`, `asof`, and scored records (the W10 record) at the longest configured horizon; `trades` count by `signal_date` and `exit_date`; returns come from `return` or `ret`; unknown shapes are skipped. It adds `stage`, `edge_p`, `edge_units`, `edge_threshold`, `edge_binding`, `edge_families`, `emails_handled_rate_to_date`, `fills_ok_to_date`, `open_trades`, `paused_modules`, `next_quarterly`, `quarterly_this_month`, `gate_checks` and `go_live_ready` from `reports.monthly_gate`; a failure there degrades to a note. "Runs on time" counts the daily run and, from its first run, the options job; the hourly job isn't counted.

## 8. Options — `traderec/options/`

### 8.1 Chains — `options/chain.py`

```python
CHAIN_COLUMNS = ["occ", "root", "right", "strike", "expiry", "bid", "ask", "mid", "iv", "delta", "gamma",
                 "theta", "vega", "open_interest", "volume", "last_trade_time"]

@dataclass
class OptionChain:
    underlying: str            # the chain root: "XSP", "SPX", "SPY", "USO", "DAL", "IBIT", ...
    asof: str                  # "YYYY-MM-DDTHH:MM:SS" in ET, the quotes' time
    spot: float
    source: str                # "cboe" | "yahoo" | "fake"
    frame: pd.DataFrame        # CHAIN_COLUMNS, one row per contract
    raw_sha256: str | None = None
    def expiries(self) -> list[str]
    def quote(self, occ: str) -> dict | None
    def select(self, right: str, expiry: str) -> pd.DataFrame

def parse_occ(occ) -> {"root", "expiry", "right", "strike"};  occ_symbol(root, expiry, right, strike) -> str
def chain_root(root) -> str                                    # "SPXW" -> "SPX"; others unchanged
def parse_cboe_chain(payload, underlying, *, raw_sha256=None) -> OptionChain
def parse_yahoo_chain(frames, underlying, spot, asof, *, raw_sha256=None) -> OptionChain     # no greeks
def expiry_on_or_before(chain, limit, *, earliest=None) -> str | None;  expiries_between(chain, start, end)
def strike_nearest(chain, expiry, right, target, *, root=None) -> float | None    # ties to the lower strike
def strike_by_delta(chain, expiry, right, target_delta, *, root=None) -> float | None
    # compares |delta|; ties to the strike further out of the money; None without greeks (fail closed)
def liquidity_check(chain, legs, cfg_liquidity, *, expected_gain=None) -> dict
    # design §4 "Option liquidity" on this snapshot: each leg (ask - bid) <= 10% of its mid with open interest
    # >= 500; the round trip = natural width / |combo mid| <= 10%, or <= 20% when expected_gain (per share)
    # >= 2 x the natural width. Missing keys fall back to LIQUIDITY_DEFAULTS (keys as in `options.liquidity`).
    # {"ok", "reasons", "per_leg", "round_trip_frac", "round_trip_cap", "combo_mid", "natural_width"}
```

`mid` is NaN unless bid > 0, ask > 0 and ask ≥ bid. An SPX chain holds SPX and SPXW rows (`root` tells them apart). CBOE marks a contract it didn't model with IV 0; its IV and greeks are then NaN.

### 8.2 Fill model v1.0 for spreads — `options/fillmodel.py`

```python
def combo_quote(chain, legs, side="buy") -> {"mid", "natural_width", "legs": [{"occ", "bid", "ask", "mid"}]} | None
    # mid = long mids - short mids per share; natural width = sum of (ask - bid); None if a leg lacks a two-sided quote
def model_price(quote, side, concession) -> float    # buy: mid + c x nw; sell: max(0, mid - c x nw)
def order_prices(quote, side, cfg_options_fills) -> {"limit_price", "max_price"}   # c = 0.3 and max_concession 0.5
def decide_fill(intent, quote, cfg_options_fills) -> {"filled", "price", "attempt": "limit" | "reprice" | None,
                                                      "reason"}
    # P = model_price(c = 0.3). Open: filled at P if P <= limit ("limit"), else if P <= max_price ("reprice"),
    # else "model price above the stated maximum". Close: the same with >=, "below the stated minimum".
    # No quote, or a model debit <= 0, is no fill.
```

Not modelled: the displayed size, rounding to the $0.05 tick, commissions, and track 14's staleness guard.

### 8.3 Snapshots — `options/snapshots.py`

```python
def store(state_root, date, chain, keep_occ, cfg_snapshots, *, surface, budget) -> dict
    # writes state/options/<date>/<root>-<HHMM>.csv.gz: a "#meta {json}" line, then CHAIN_COLUMNS rows, gzipped
    # with mtime 0. Always keeps `keep_occ` (the book's legs); with `surface`, a sample: expiries 20-120 days out,
    # at most one a week, up to 12; per expiry and right, the strikes nearest a 2.5% grid within +/-25% of spot,
    # coarsened level by level to fit `budget`, else the legs only.
    # {"path", "bytes", "file_sha256", "rows", "rows_total", "level", "surface", "legs_kept", "legs_missing"}
def load_snapshot(path) -> OptionChain;  sample(...);  encode(...);  snapshot_config(cfg) -> dict
def day_bytes(state_root, date, *, exclude=()) -> int;  snapshot_dir(state_root, date);  snapshot_name(chain)
```

The day's budget is `options.snapshots.max_bytes_per_day` (100 KB) across every root and run, shared equally among the surface roots still to store.

### 8.4 The 10:17 ET job — `options/job.py`

```python
def run_options(cfg, provider, state_dir=None, *, date=None, dry_run=False, force=False, services=None) -> RunResult
def mark_spreads(run) -> None          # the daily run's hook, before _mark (§7 step 5)
def book_legs(run) -> set[str]         # legs of pending and open spreads and of every open_trade
def intrinsic_value(legs, underlying) -> float
def status_lines(broker) -> list[str]  # `status` lines for spreads and pending spread orders
def options_config(cfg) -> dict       # the top-level `options` block with defaults
```

`run_options` (run kind `options`, one per ET date, on the pipeline's `Run`):
1. With no `--date` it reads the clock: on a trading day, before `options.snapshot_window_et[0]` (10:15) it returns `too_early`, after `[1]` (16:00) `too_late`, touching nothing. `options.enabled: false` returns `disabled`. Then `begin()` (idempotent; `--force`; dry runs on a copy) and a *start* ping. A weekend or NYSE holiday records `no_session`.
2. **Cancel missed orders:** a spread order whose session (the first trading day after its creation) is before today is cancelled with a `fill` alert, a `fill` record (`type: no_fill`) and `on_spread_cancel`, whose reason starts "its session … passed".
3. **Roots:** those of spread orders due today, of open spreads, and each `OPTIONS_JOB_RUNNERS` runner's `roots_needed(run)` (a failing request is an alert, not a stop).
4. **Snapshot:** a chain is usable only if its `asof` is on the run date inside the window, with a positive spot and at least one contract. Each usable chain is stored (§8.3; runner roots get the surface sample) with a `snapshot` record. A failure logs a `signal` record (`check: option_chain`, `ok: false`) and a note.
5. **Fill**, root by root, with `broker.fill_spreads` at the chain's HH:MM: every decision gets a `fill` record; fills also go to `state["fills"]` with `order_type`, `ref_price` (mid), `natural_width`, `multiplier`, `qty` and `attempt`; the owning runner's `on_spread_fill` or `on_spread_cancel` runs (via `runners.SPREAD_MODULES`). A closing no-fill is a `fill` alert (the module re-issues the exit that evening); an opening no-fill is a note.
6. **Mark** open spreads at the snapshot's mid (`mark` record, `kind: spreads`).
7. A root with orders due today but no usable chain ends the run as `data_missing` (retryable, a `data` alert, a *fail* ping); its orders stay pending and step 8 is skipped.
8. Each runner's `options_job(run, chains)` with only the usable chains of the run date, keyed by chain root; `option_shadows` inside `_shadow_guard`, `m4` and `macro` unguarded. Then `finish("ok")` and a *success* ping. No emails.

`mark_spreads(run)` runs only with open spreads. It first settles any spread whose expiry is on or before the run date at intrinsic value from the underlying's official close on the expiry date (`SETTLEMENT_SOURCES`: XSP = ^GSPC × 0.1, SPX and SPXW = ^GSPC, other roots their own close): a `fill` with reason `expiry_settlement`, an `expiry` alert, a `correction` for each cancelled pending close, and the runner's `on_spread_fill` with a synthetic sell intent (reason `expiry_settlement`, `intent_id` `SETTLE-<date>-<trade_id>`). A missing close is a `data` alert, retried next run. It then marks the rest with chains stamped on the run date at or after `options.close_after_et` (16:00), storing a legs-only snapshot for each; a missing or earlier chain keeps the last mark, with a note.

## 9. Runners and hooks — `traderec/runners/`

```python
SHADOW_RUNNERS = ("option_shadows", "crypto", "edgar", "macro_shadows")   # daily hooks, each in _shadow_guard
SPREAD_MODULES = {"M4": m4, "W8": macro, "W9": macro}                     # who owns a spread order's hooks
OPTIONS_JOB_RUNNERS = ("m4", "macro", "option_shadows")                  # roots_needed / options_job, in order

def daily(run, checks) -> None                     # 22:17 ET; checks: {"spy_ok", "vix", "vix_ok", "vix_series"}
def on_spread_fill(run, fill, intent) -> None      # m4, macro: an opening fill, a closing fill or an expiry settlement
def on_spread_cancel(run, intent, reason) -> None  # m4, macro: no fill at the snapshot, or a missed session
def roots_needed(run) -> set[str]                  # m4, macro, option_shadows
def options_job(run, chains) -> None               # m4, macro (no-op), option_shadows
```

- **Guards.** Shadow runners run inside `pipeline._shadow_guard`: an exception becomes a `shadow` alert and a `shadow` record (`event: error`). Trading runners (`m4`, `macro`) raise, as Phase A modules do; M4 guards its own shadow work (the twin and the liquidity probe).
- **Emitting a decision:** build `Recommendation(kind, module, trade_id, run.date, [intent], facts)`, check `run.budget_ok()`, call `run.emit(rec)` (pre-register, render, validate, open the issue, queue the order), then `run.count_trade()` for a new trade.
- **`on_spread_fill` for a settlement:** `intent.reason == "expiry_settlement"`, `intent.side == "sell"`, `intent_id` starts `SETTLE-`. Match on `trade_id`.
- **The run context** runners use: `run.cfg`, `run.provider`, `run.services`, `run.state`, `run.broker`, `run.date`, `run.bars()`, `run.close_on()`, `run.get_tbill()`, `run.current_nav()`, `run.current_drawdown()`, `run.stress()`, `run.open_stress()`, `run.log()`, `run.alert()`, `run.note()`, `run.next_intent_id()`, `run.order_deadline()`, `run.real` (the real state paths, also in dry runs).

| Runner | `daily` (22:17 ET) | 10:17 ET options job |
|---|---|---|
| `m4` (M4 and `shadow.M4_TWIN`) | The twin's expiry settlement; the open spread's close (EXIT the evening before the planned close, two sessions before expiry, priced from tonight's chain; after the last session, an alert and the safety net); the entry test, two-source confirmation (the cool-down starts either way), one spread at a time, the budget, the structure (XSP, SPY only on a liquidity failure), prices, size, `admit_premium(..., exempt_governor=True, min_premium_usd=one contract)`, NEW_TRADE; the twin's pending entry | Hooks: buy fill → `open`; sell fill → history, forecasts resolved; cancelled entry → skipped (`skipped`), forecasts voided, cool-down stands; cancelled close → `open` again, re-issued that evening while a session before expiry is left. `roots_needed`: M4's spread root; XSP and SPY while flat and "armed" (last close ≥10% below its high); the twin's root while its entry or exit is due. `options_job`: the liquidity probe (armed and flat) into `modules.M4.liquidity_probe`, and the twin's entry and exit at model prices |
| `macro` (W8, W9) | Exits first (expiry rule, invalidation, take-profit, time stop; sell-to-close at `order_prices` rounded down); then W8 (roll the market map, condition (iii), condition (ii), then the gates: one at a time, the pause, the budget, the release ban, the invalidation market, the structure, `admit_premium(cluster "oil")`, the veto) and W9 (the owner's supply record and crude months, the same gates plus the contango veto) | Hooks: buy fill → `open`, `exit_date` reset from the fill date; sell fill → history, forecasts resolved; cancelled entry → forecasts voided, `shadow` `entry_not_filled`; cancelled close → `open` again with an alert, re-issued that evening if still due. `roots_needed`: roots of W8/W9 trades pending or open. `options_job`: no-op |
| `option_shadows` (O1, O1H, I1, I2, ST2) | Settle held spreads at or past expiry at intrinsic value; drop entries no options job took (`expired`); signals at the close (O1/O1-h filters on two-source closes, I1's VIX fade, I2's BTC trend); ST-2 (buy SPY at the next open, sell at the close of session 20); one `data` alert per run listing the books that failed closed | `roots_needed`: roots of books with a pending entry or an open spread. `options_job`: marks, the 50%-of-credit take-profit and 21-DTE close (managed books), then entries on the snapshot (I2's IV term structure checked here); each book guarded |
| `crypto` (ETH, M6 carry) | The ETH weekly switch (replays up to 12 missed weeks); the M6 cash-and-carry check. Each sub-book guarded; a provider without crypto feeds only adds a note | — (the hourly job: `run_hourly`) |
| `edgar` (EDGAR: SH1–SH4, CEF) | `config(run)` merges `shadow.EDGAR` over `DEFAULTS` (equal but for `enabled`, which only the constitution switches on; a test checks this); `sources(run, cfg)` (§1.1), or a note and nothing else. Then, cheapest screen first (SH3 → SH2 → CEF → SH4 → SH1), each filing date not yet screened: weekdays only, the run date final from 22:05 ET and screened provisionally before that, the last final date searched again, at most 7 days back (older dates dropped with a `data` alert). A hit passes the universe and data checks into a `pending_entry` event (`signal`), else a near-miss (`filtered`); then the entries (once the stock's bars show the session after the filing) and exits (SH1/SH3 at session 20, SH2 at the close before the ex-date, SH4 at the deal's cash, a break or the 60-day cap, CEF at the tender plus the remainder 3 sessions after expiry) of open events; then pruning (`seen` 7 days, insider purchases, past lockouts, stale deals). Budget per run: 90 s, 150 documents, 40 price lookups (`BudgetExhausted`: the rest carries over, and a date counts as screened only when all of it was). A failing source (`EdgarAccessDenied`, `DataError`) records `data_missing` for that screen and date with one `data` alert, and the date is retried next run. `last_run` and a run note record the counts | — |
| `macro_shadows` (MACRO) | Calendar checks, new and maturing release records, W3, W4, the gold fade, walking the hypothetical trades, the promotion summary, pruning | — |

**The hourly job** (`runners.crypto.run_hourly(cfg, provider, state_dir=None, *, now=None, dry_run=False, services=None) -> RunResult`, run kind `hourly`, date the UTC hour `YYYY-MM-DDTHHZ`):
1. `disabled` when `shadow.M6.enabled` or `shadow.M6.depeg.enabled` is false; `already_done` for a recorded hour.
2. Fetch the books of the configured coins, the watch-only coins and the coins of open events; no usable book anywhere → `data_missing` (exit code 3, no ping, nothing written).
3. Plan `depeg_step` on a copy of the state. No change → `no_change`: no ledger record, no run entry, no state change, so the workflow commits nothing.
4. Otherwise one `Run` transaction keyed `hourly:<hour>`: ledger check, pre-run snapshot, `shadow` records (`depeg_open`, `depeg_low`, `depeg_close`, `unconfirmed_start`, `unconfirmed_end`, each with `hour`; a `data` alert for an unconfirmed print), run manifest, state.
5. Pings: *success* for `ok`, `no_change`, `already_done` and `disabled`; *fail* on an exception; none for `data_missing` or a dry run.

**Shadow ledger events** (`record_type` `shadow`, `{"book", "event", ...}`):
- option books: `signal`, `filters_failed`, `blocked`, `entry`, `skip`, `expired`, `mark`, `no_quote`, `exit`, `no_fill` (ST-2), `error`;
- M4 twin: `signal`, `signal_while_open`, `entry`, `entry_waiting`, `entry_missed`, `exit_unpriced`, `exit`; M4 itself: `unconfirmed_signal`, `signal_while_open`;
- ETH: `weekly`, `signal_on`, `entry`, `signal_off`, `exit`, `exit_cancelled`, `entry_cancelled`, `data_missing`; M6: the hourly events above, and `carry_check`, `carry_open`, `carry_close` in the daily run;
- MACRO (with `rule`): `release`, `complete`, `void`, `signal`, `no_signal`, `unavailable`, `trade`, `entry`, `exit_signal`, `exit`, `near_miss`, `data_problem`;
- EDGAR (with `setup`): `signal` (the event's fields but its status and scores), `filtered` (a near-miss, with `reasons`), `entry`, `scored` (with the `score`), `void` (with the `reason`), `watch` (SH4 added a deal), `data_missing`;
- W8/W9: `blocked` (with `stage`), `entry_not_filled`.

**EDGAR events** (`state.shadow.EDGAR.events`; `docs/phase-b/edgar.md` has the full list): `id`, `setup`, `signal_date` (the filing date), `detected`, `late`, `ticker`, `cik`, `name`, `adsh`, `entry_due`, `entry_basis` (`open` for SH1 and CEF, `close` for SH2, SH3 and SH4: the basis the setup's promotion test uses), `exit_due`, `price`, `dvol20`, `mcap`, `mcap_basis`, `bucket`, `cost`, `bench` (SPY from a $2bn cap, IWM below), `short_interest`, `tbill` (SH4), `details`, `forecast` (`{"p", "question"}`, with `outcome` and `brier` at the exit; none for CEF), `status` (`pending_entry` → `open` → `closed`, or `void` with `void_reason`), `entry_date`, `entry_open`, `entry_close`, `filing_reaction` (SH1, SH3), `time_stop` (SH4, CEF), `exit_date`, `scores[label]` with the label `"20"` (SH1, SH3), `"ex-1"` (SH2), `"deal"` (SH4) or `"tender"` (CEF); every score holds `return` (net, on the setup's basis), `basis` and `exit_date`.

> **How the reviews read the book (fixed at integration).** `reports.shadow_activity` recognises a book whose events carry a `setup` and gives one row per setup (signals by `signal_date`, events with `status: closed` whose `exit_date` falls in the period, mean of `edgar_screens.primary_return`, the net return on the setup's entry basis whatever the score label); a book with no activity in any setup is one quiet row. `reports.drift_review` adds a row per setup against `shadow.EDGAR.<setup>.base_rate` (family `EDGAR/<setup>`, since 2016), and `reports.edgar_review(run, asof)` puts `promotion_test` (plus `reaction_split` for SH1 and SH3) under the quarterly and annual facts' `edgar` key. `book_summary` stays available for ad-hoc use; the reviews take the period from their own `in_period` callable instead. The email renderers do not print the `edgar` key yet.

## 10. The LLM veto — `traderec/llm_veto.py`

```python
def run_veto(module: "W8" | "W9", facts: dict, cfg_veto: dict, *, session=None, env=None, sleep=time.sleep) -> dict
    # Never raises; fails closed. {"status": "proceed" | "veto" | "invalid" | "unavailable", "proceed": bool,
    #  "verdict", "citations" (valid, normalised), "cited", "retrieved", "reason", "problems", "prompt_sha256",
    #  "request_sha256", "model_sha256", "response_sha256", "response" (sanitised), "stop_reason", "usage",
    #  "requests"}
def prompt_sha256(module) -> str      # sha256 of the system prompt, the module template and its verdict set
def build_request(module, facts, model, cfg_veto) -> dict;  render_prompt(module, facts) -> str
def parse_answer(module, content, stop_reason, cfg_veto) -> dict
PROMPTS, SYSTEM_PROMPT, VERDICTS                      # W8: PROCEED, VETO_NO_OFFICIAL_ANNOUNCEMENT, VETO_REVERSED,
                                                      # VETO_OTHER_CAUSE, VETO_UNCERTAIN; W9: PROCEED,
                                                      # VETO_NOT_CONFIRMED, VETO_RESTORED, VETO_OTHER_CAUSE,
                                                      # VETO_UNCERTAIN
```

- **Transport:** the Messages API over `requests` (no SDK), `ANTHROPIC_API_KEY` from the environment, retries on 429, 5xx, 529 and connection errors, and up to `max_continuations` (2) `pause_turn` continuations.
- **Frozen:** the model comes from `TRADEREC_VETO_MODEL` (no default) and is logged only as `model_sha256`; `runners.macro` alerts (`veto`) and re-pins when it changes. The prompt's SHA-256 must equal `veto.prompt_sha256` in the module's constitution block, else `unavailable`.
- **Search:** the server-side web search tool (`veto.web_search_tool`, `max_uses` = `max_searches`) limited to `veto.allowed_domains`, with `allowed_callers ["direct"]` so every result is visible to the citation check.
- **Answer:** exactly one JSON object `{"verdict", "citations", "reason"}` after the last search result. PROCEED counts only with ≥ `min_citations` (2) distinct allow-listed URLs that the search returned in this call. A refusal, truncation, parse failure or verdict outside the set is `invalid`; no key, no model, a prompt mismatch or an HTTP failure is `unavailable`.
- **Wiring:** `runners.macro` calls `run.services.veto` when set (tests set the attribute on a `Services` instance), else `llm_veto.run_veto`, as the last gate, and logs the result as a `signal` record (`check: veto`) before any email. `veto`/`invalid`/`unavailable` block the candidate into the shadow ledger (`unavailable` and `invalid` with a `veto` alert).

## 11. Reviews — `traderec/reports.py`

```python
def run_quarterly(cfg, provider, state_dir=None, *, quarter=None, dry_run=False, force=False, services=None)
    -> RunResult                                   # default: the quarter that just ended; key quarterly:YYYY-Qn
def run_annual(cfg, provider, state_dir=None, *, year=None, dry_run=False, force=False, services=None)
    -> RunResult                                   # default: the year that just ended; key annual:YYYY
def quarterly_report(run, quarter) -> dict         # emails.render_quarterly's keys; also the ledger payload
def annual_report(run, year) -> dict               # emails.render_annual's keys
def monthly_gate(run, asof, *, fetch, ledger_ok=None) -> dict   # used by facts.monthly_report

# pure maths
def edge_posterior(n, sharpe, *, prior_sd=0.1) -> float | None     # Φ(n·ŝ / √(n + 1/prior_sd²)) (track 18 §5.4)
def edge_evidence({family: [excess | (excess, weight)]}, *, prior_sd, min_units=5) -> dict
def kappa_observation(returns, claimed_mean) -> (κ_obs, se) | None
def kappa_posterior([(κ_obs, se)], *, prior_mean=0.35, prior_sd=0.15, lo=0.1, hi=0.6) -> dict
def calibration_in_the_large(forecasts, *, icc=0.4, tol=0.20, min_n=20) -> dict   # hit − mean p, 90% interval
def calibration_slope(p, y) -> dict | None           # logit P(y) = a + b·logit p, Wald 90% interval
def miscalibration_lr_test(p, y) -> float | None     # H0: a = 0, b = 1
def fit_platt(p, y) -> (a, b)                        # MAP, shrunk toward the identity
def recalibration_review(forecasts, *, min_n=150, isotonic_n=1000, alpha=0.05) -> dict
def base_rate_drift(returns, base_rates, *, min_n=150) -> dict
def sleeve_review(months, *, review_drawdown=0.2, pause_sharpe=-0.5, window=36) -> dict
quarter_bounds, year_bounds, last_quarter, quarter_of, period_end, months_between
# generic collectors (read the state and ledger, never change them)
module_activity, open_trades, paused_modules, shadow_activity, run_punctuality, selected_trades, closed_trades,
live_record, collect -> Evidence
```

- **A review run** is one `Run` keyed by its period: `begin()`, a *start* ping, the report, a `quarterly_report` or `annual_report` ledger record (`_record_type`; `monthly_report` only if the ledger lacked the type), render, validate, finish, then *success* or *fail*. It pings `HC_PING_URL`, which the monthly workflow sets to `HC_PING_URL_MONTHLY`. The reviews report and recommend; they never change a rule, a size or a module's state.
- **Thresholds** are in `reports.GATES`, each with its design or track citation; an optional `reports:` block in `config/constitution.yaml` may override any key (none is set).
- **Labels and references:** `SHADOW_LABELS` (or a book's `name` in its config block), `WIDE_BOOK_LABELS`, `SHADOW_EVIDENCE`, `SHADOW_BASE_RATES` (ST-1b), `W10_RECORD_REFERENCE` (track 23: SPY 1993–2026 at 60 and 90 days, and random entry days).
- **The wide book** for the edge evidence: `ST1B` (the ST-1b shadow trades), `M3` (every closed switch), `M2` (position-months: a leg with a positive target, from one monthly decision to the next, on adjusted closes), `W10` (the W10 shadow record at 90 days). Each family is standardised by its own standard deviation and joins the pooled estimate from 5 units with some variation; excess returns are net of the T-bill rate in the last snapshot before entry.
- **Workflow:** `monthly.yml`'s "Plan the reviews" step runs `quarterly --quarter YYYY-Qn` after a March, June, September or December review, and `annual --year YYYY` after December's; a manual run can pick one review (`review` input), which `--force` requires. Each review is its own run, so one failing doesn't stop the others; state is committed if any succeeded.

## 12. The growth book — `traderec/growth/` (design v4; Phases C1 and C2)

The build notes are `docs/phase-c/growth.md` (C1: config, signals, governor, order set, the Sunday job, the paper broker; C2 §10: the emails and Rule E). The design is `research/00-SYSTEM-DESIGN-v4.md`; its rule parameters are the `growth` block of `config/constitution.yaml` (A.1, plus the `C1:`/`C2:` keys: `rebalance.queued_cash_frac` 0.90 and `market_hours_cash_frac` 0.95; `email.send_no_change`, `email.risk_box.crash_day`, `email.risk_box.funds.<ticker>` and `email.ira_withdrawal`, the numbers the risk box prints).

```python
# growth/__init__.py
cfg_growth(cfg) -> dict;  enabled(cfg) -> bool;  module_status(cfg, name) -> str;  supersedes_m3(cfg) -> bool
new_growth_state() -> dict;  state_growth(state) -> dict          # state["growth"], created for older states
# growth/governor.py (pure, plus the Sunday state update)
peak_nav(prev, nav);  drawdown(nav, peak);  G(dd, cfg_gov);  hard_stop(dd, cfg);  update(st, nav, date, cfg) -> record
restart(st, nav, date);  paused_blocks(st, side)
# growth/orders.py (pure)
sleeve_targets(g1_in, g2_on, nav_ira, G, cfg, *, vol_factor, w10_held_usd, w10_buy_usd) -> {ticker: target}
build_order_set(targets, held, cash, *, G, G_last_order, cfg_growth, paused, w10, modules) -> {"orders", "deferred",
    "skipped", "dropped", "sgov_sell_usd", "sgov_buy_usd", "cash_after_usd", "g_step", "max_orders", "queued_cash_frac"}
holiday_shift(sunday) -> str | None
# growth/weekly.py: the Sunday job, called from pipeline.run_weekly while growth.enabled
run(run) -> facts               # signals -> governor -> Rule E scores -> targets -> order set -> broker -> ledger
                                # -> the facts record (state.growth.last_facts) -> send.send_sunday
# growth/email.py: the renderers and the validator's slot table, from the facts record alone
render_growth(facts, ctx) -> RenderedEmail       # meta: kind "GROWTH", trade_id "G-<date>", facts, slots, slots_required
render_rule_e(facts, ctx) -> RenderedEmail       # meta: kind "RULE_E", trade_id "G-<date>-<ticker>" (or -RULE-E)
slot_specs(facts) -> [{"key", "template", "fields": {field: (value, spec)}, "literals"}];  rule_e_slot_specs(facts)
fill_slot(slot, fmt) -> str                      # the phrase with its fields formatted by fmt(value, spec)
# growth/send.py
send_sunday(run, facts, intents) -> {"blocked", "errors", "subject", "issue_urls"}   # the recommendation record, then:
dispatch(run, render, facts, intents, *, kind, trade_id, module, expires, ctx)        # render -> validate -> one issue
                                                 # per order -> run.outgoing (Run.finish sends; dry runs -> the outbox)
order_line(intent) -> "Sell all SSO" | "Buy $20,000 of SSO"
# growth/rule_e.py
daily(run) -> dict | None       # the daily hook (pipeline._daily, after W8/W9); None when nothing fired
score_pending(run, st, closes, g1, friday) -> {"scored", "count_week", "count_year", "max_per_year", "running_pct"}
rule_e_state(st, date) -> dict  # state.growth.rule_e with its counters reset by ISO week and by year
week_key(date) -> "2026-W40"
# validator.py (Phase C2)
growth_slots(kind, facts) -> (templates, {field: [rendering]});  growth_problems(kind, facts) -> [str]
# modules/g3_gems.py (Phase C4a; pure, no I/O; discounts are fractions)
cef_discount(price_close, nav_close) -> Series;  discount_stats(discount, lookback=252, min_obs=200) -> DataFrame
cef_crash_check(bars, nav_bars, date, cfg_rule, fund_meta) -> {"trigger", "z", "discount", "mean252", "sd252", "price",
    "adv_usd", "leverage", "nav", "observations", "reasons"}
cef_exit_due(entry_date, hold_days) -> str;  cef_exit_check(bars, nav_bars, date, event, cfg_rule, *, next_chance=None)
crash_mode_update(prev, date, week_triggers, cfg_rule) -> dict | None;  entry_capacity(open, slots, crash_mode, this_week)
trust_nav(coin_close, coins_per_share, as_of, fee_annual, date) -> float | None;  trust_nav_series(...) -> Series
catalyst_status(catalyst, date, cfg_rule, cik=None);  crypto_trust_check(price_close, nav_close, date, cfg_rule, catalyst, *, cik=None)
crypto_trust_exit_check(price_close, nav_close, date, episode, cfg_rule, catalyst, trust_meta=None);  widened(entry, low, points=0.15)
random_entry_baseline(adj_close, entry_date, horizon=60, lookback=252, min_windows=100);  total_return_price(bars, day, price)
cef_promotion_test(closed_events, baseline=None, rule=None) -> {"passed", "n", "checks", "reason", "checks_ok", "checks_total", ...}
trust_promotion_test(resolved_episodes, rule=None);  shadow_stats(closed_events) -> {"n", "n_scored", "mean_excess", ...}
# runners/g3.py (Phase C4a)
daily(run) -> None              # the daily hook (pipeline._daily, after Rule E, while growth.enabled); never raises
sunday_book(run, st, cfg_growth, nav_ira, G, closes, acct, *, paused=False) -> {"held", "buys", "sells", "waiting",
    "reserve_usd", "sgov_usd", "slots_usd", "promoted", "facts"}     # the Sunday job's view of the live rules
record_orders(st, sent, date);  rule_state(g3_state, name, status);  new_rule_state(status);  rules_of(cfg_growth)
promotion_test(name, events, cfg_rule);  rule_label(name, cfg_rule=None)
# reports.py (Phase C4a)
g3_review(run, asof) -> [{"rule", "label", "status", "n", "closed", "mean_excess", "checks", "passed", "checks_ok", ...}]
```

**The gems rules (G3; Phase C4a).** `runners.g3.daily` keeps `state.growth.sleeves.G3.rules.<name>` for `cef_crash_discount` and `crypto_trust_discount`: `status` (the constitution's, synced each run), `open_slots` (the slots pending entry, open or pending exit: `id`, `rule`, `kind` "cef" | "trust", `ticker`, `nav_symbol` or `coin`, `book` "shadow" | "live", `status`, `signal_date`, `week`, `z`, `discount`, `mean252`, `sd252`, `price`, `adv_usd`, `leverage`, `crash_mode`, `entry_date`, `entry_price`, `entry_tr`, `exit_due`, `exit_signal_date`, `exit_reason`, `usd`, `intent_id`, `trade_id`, `exit_intent_id`, `last_check`; a trust also `entry_discount`, `min_discount`, `widened`, `catalyst`, `coin_entry`), `events` (closed and void slots, with `exit_date`, `exit_price`, `return`, `baseline` | `coin_return`, `excess`), `shadow_stats` ({`n`, `n_scored`, `mean_return`, `mean_excess`, `median_excess`, `win_rate`, `last_exit`, `basis`, `open`}), `promotion` (the test's result), `crash_mode` ({`since`, `until`, `week`, `per_week`, `weeks`, `triggers`} | null), `triggers_by_week`, `entries_by_week`, `last_screen` ({`date`, `screened`, `missing`, `triggers`, `entered`, `crash_mode`}), `promotion_quarter`, `catalysts` (per trust: `checked`, `attempted`, `error`, `filing`, `searched`) and `note`; `country_devaluation` holds only `status` and `note`. `state.growth.sleeves.G3.reserve` is the reserve's part still in SGOV and `slots_usd` what the live slots hold or buy (the Sunday job). A live slot's paper orders are `module` G3 lots in the broker.

**The facts record's `g3` block** (`weekly._facts`, from `runners.g3.sunday_book`): `{"reserve_usd", "sgov_usd", "slots_usd", "promoted_rules": [...], "slots": [{"rule", "label", "ticker", "status": "pending_entry" | "open" | "pending_exit", "usd", "entry", "exit_due", "discount", "z", "signal_date", "book", "order": "buy" | "sell" | "deferred" | null}], "shadow": {rule: {"label", "status", "n", "mean_excess", "median_excess", "win_rate", "open", "basis", "promotion": {"passed", "n", "checks", "reason", "checks_ok", "checks_total"}}}, "waiting": [{"rule", "ticker", "slot_id", "z", "discount", "why"}], "single_names_open", "single_names_max", "single_name_cap_usd", "slots_max"}`; the `sleeves` list gains one row per live slot (`name` "G3 <label>", `state` entry | open | exit) and the reserve row's `why` gains `g3_slots_usd` and `promoted_rules`. The email's Gems phrases (`email_text/growth.py`: `gems_promoted`, `gems_live`, `gems_slot*`, `gems_tally*`) are slots of `slot_specs`, so the validator holds every number in them; `growth_problems` rejects more single names, or a larger one, than `single_names_max` and `single_name_cap_usd` allow.

**The GROWTH email kind.** `render_growth` renders design v4 §9's body from the facts record (`docs/phase-c/growth.md` §4, plus the C2 keys in §10 there): the banner, the headline box (STATUS, THIS WEEK, BOOK, SIZE, WINDOW), the one line, the target-vs-now table, the why lines (one per changed sleeve, then the book's size line), Step 1 (the sells: "Sell all X, market (…at Friday's close)"), Step 2 (the buys: "Buy $X of Y, market, in dollars", with the 95%/90% cash rule), the deferred, dropped and skipped lines, Rule E's scores when any, the risk box per leveraged fund bought or held (a box per fund: RESET, ONE DAY, HISTORY, COST for the 2x funds; GAP, SWITCH, FEE for IBIT), the 1987-day line, the hard-stop line, the Monday-gap line, the IRA withdrawal line and the tax line, the Robinhood steps (at most 7; the Tuesday variant when `facts.limited_margin` is false), the what-if block, the sources with their two-source checks, the fill links (one issue per order) and the footer with the `growth_decision` and `order_set` ids. A Monday holiday adds its line after the summary. A no-change week is the short version (no orders, no steps) and is sent unless `growth.email.send_no_change` is false. Text lives in `traderec/email_text/growth.py` (`TEXT` for the shared label tables, `PHRASES` for the numbered sentences, `STATIC` for the rest; no digits).

**Value and slot for GROWTH and RULE_E.** Every numbered phrase is one entry of `slot_specs(facts)`: a template with `{field}` placeholders (field names suffixed per phrase, `{c__why_SSO}`) and the field's (value, spec) from the facts. The renderer fills the template through the number registry; `validator.check_slots` calls `growth_slots` to rebuild the same table from `meta["facts"]`, formats each value with its own formatter (`_fmt_spec`, mirroring `NumberRegistry.fmt`) and requires each phrase, wherever it occurs in the subject, text or HTML, to show exactly those values; every phrase is required in the text and the HTML. `growth_problems` blocks an email whose facts carry more orders than `orders.max_orders`, a Step 1 sell ranked after a Step 2 buy, or a fund in `risk.required_for` bought or held without its numbers in `risk.funds` (so the risk box is mandatory whenever SSO, QLD or IBIT is bought or held). A phrase that recurs per fund or per index names the ticker or the index in its literal text.

**The `rule_e` record** (`payload.event`): `exit` (the trigger: `date`, `week`, `execute_date`, `trade_id`, `legs[]` with `ticker`, `index`, `close`, `sma200`, `pct_vs_sma` (percent units), `sma_days`, `band_pct`, `held_usd`, `check` (the two-source check), `intent_id`, `trade_id`; `count_week`, `count_year`, `max_per_week`, `max_per_year`, `orders[]`), `capped` (the same facts plus `reason`: "the weekly cap" | "the annual cap"; logged, not sent), `score` (`ticker`, `trigger_date`, `exit_date`, `exit_price`, `alt_price` (the leg's Friday close), `alt_date`, `alt_action` ("exit" | "hold" | None), `edge_pct` (exit / alternative − 1, in percent; positive when Rule E sold higher), `resolved`, `trigger_record`, `intent_id`) and `unresolved` (no paper fill within two weeks). The exit's orders are ordinary `order` records (`module` G1, `reason` "rule_e", `close_all`), filled by the daily run like any queued order.

**State keys** (`state.growth`; A.3 and `docs/phase-c/growth.md` §6): `peak_nav`, `drawdown`, `G`, `G_date`, `G_at_last_order`, `hard_stop_hit_on`, `paused`, `first_run`, `last_run`, `sleeves.G1.<leg>.{in, since, last_close, sma200, band_state, last_signal, rule_e_exit}`, `sleeves.G2.{on, since, weekly_close, ma10w, sma200, week_end, vol60, vol_cut_factor, vol_high_since}`, `sleeves.G3.{reserve, slots_usd, rules.<name>.{status, open_slots, events, shadow_stats, promotion, crash_mode, triggers_by_week, entries_by_week, last_screen, promotion_quarter, catalysts, note}}` (Phase C4a, above), `W10.{open, entry, exit_due, state}`, `targets`, `order_set`, `deferred`, `weeks_with_orders.<year>`, `last_facts` (the facts record, plus `email: {record, subject, blocked, issue_urls}` after the send), and `rule_e.{count_week, count_year, week, year, last, pending, scores, capped, running_pct}`. The Sunday email's per-order issues are `state.issues` entries with the order's own `trade_id` (`G-<date>-<ticker>`), so `feedback.review` matches the owner's fill comments to the paper fills; `email` names the Sunday email's id.
