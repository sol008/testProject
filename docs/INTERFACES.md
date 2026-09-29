# traderec — component interfaces (Phase A)

Every component builds against these contracts. Shared types are in `traderec/types.py`, config loading in `traderec/config.py` (`load_config()` → `Config`) and indicators in `traderec/indicators.py`. The design is `research/00-SYSTEM-DESIGN-v3.md` (v3.2); the rule parameters are in `config/constitution.yaml`.

## Conventions

- **Dates.** Strings `YYYY-MM-DD` at every boundary; `pd.Timestamp` inside functions.
- **Trading dates.** New York exchange trading dates.
- **Price frames.** `pd.DataFrame` indexed by a tz-naive, normalised `DatetimeIndex` (the ET session date), with columns:
  - `open`, `high`, `low`, `close` — raw, unadjusted;
  - `adj_close` — total-return adjusted;
  - `volume`.
- **Money.** Floats in USD. Percentages are fractions (0.06 = 6%) unless a key ends in `_pct`.
- **No component other than the pipeline touches the network.** Data providers are injected, so every test runs offline with a fake provider.
- **Git.** No component writes to git. The pipeline commits `state/` in CI.

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

class LiveProvider(DataProvider)     # network: yfinance, api.nasdaq.com, api.robinhood.com/quotes,
                                     # cdn.cboe.com, api.exchange.coinbase.com, fred.stlouisfed.org
                                     # retries with backoff, User-Agent header, in-run memo cache
class FakeProvider(DataProvider)     # built from in-memory frames/series for tests

def verify_close(provider, bars: pd.DataFrame, ticker: str, date: str, tolerance: float) -> dict
    # {"ok": bool, "primary": float, "secondary": float | None, "source": str | None, "reason": str}
    # ok=False on a mismatch above tolerance OR when no second source is available
    # (fail closed for new entries; the pipeline decides).
```

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
- **Record types:** `run_manifest`, `snapshot`, `signal`, `recommendation`, `order`, `fill`, `mark`, `forecast`, `resolution`, `shadow`, `monthly_report`, `correction`.

## 3. Paper broker — `traderec/broker.py`

```python
class PaperBroker:
    @classmethod
    def new(cls, cfg: Config) -> "PaperBroker"            # accounts from account.yaml start_cash
    @classmethod
    def from_state(cls, state: dict, cfg: Config) -> "PaperBroker"
    def to_state(self) -> dict                           # JSON-serialisable
    def cash(self, account: str) -> float
    def positions(self, account: str | None = None, module: str | None = None) -> list[dict]
        # [{"account", "ticker", "module", "qty", "cost", "opened", "trade_id"}]; lots keyed by (account, ticker, module)
    def position(self, account: str, ticker: str, module: str) -> dict | None
    def queue(self, intent: OrderIntent) -> None
    def pending(self) -> list[OrderIntent]
    def fill_pending(self, date: str, opens: dict[str, float]) -> list[Fill]
        # Fill model v1.0: price = open * (1 + side * slippage_bps / 1e4), side +1 buy / -1 sell.
        # Buys: dollars capped by available cash (a partial fill is recorded in meta).
        # close_all sells the module's whole lot.
        # A missing open keeps the order pending once, then cancels it (recorded in meta).
    def accrue_interest(self, from_date: str, to_date: str, annual_rate: float) -> float
        # simple daily accrual on positive cash per calendar day; returns the interest added
    def mark(self, date: str, closes: dict[str, float]) -> dict
        # {"date", "nav", "by_account": {acct: {"cash", "positions_value", "equity"}}, "peak", "drawdown"}
        # updates the NAV peak
    def market_value(self, account: str, ticker: str, module: str, price: float) -> float
```

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
```

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

# risk.py
def governor(drawdown: float, cfg_risk: dict) -> float     # G(D)
def stress_table(closes: dict[str, pd.Series], cfg: Config) -> dict[str, float]
    # |worst 10-session loss| per ticker, floored at stress_floor; IBIT uses crypto_stress
def open_stress(positions: list[dict], values: dict, stress: dict, cfg: Config) -> dict
    # {"total", "us_equity", "by_module"}; M2 counted once as its sleeve stress
def admit(module: str, ticker: str, dollars: float, positions_stress: dict, stress: dict, cfg: Config,
          drawdown: float) -> dict
    # {"ok": bool, "dollars": float (possibly scaled), "binding": str | None, "notes": [...], "cluster_overflow"}
    # v3.3: M1 has priority in the 7% US-equity cluster (never cut; overflow reported); W10 is skipped when the
    # reserve leaves less than cluster_min_fraction of its size
```

## 6. Emails, validator, notify — `traderec/emails.py`, `traderec/validator.py`, `traderec/notify.py`

```python
def render(rec: Recommendation, ctx: dict) -> RenderedEmail
    # ctx: {"mode": "paper" | "live", "nav", "portfolio_after": [...], "ledger_head", "issue_url",
    #       "data_asof", "sources", "constitution_version"}
    # Sections (design §3a, spec 11): headline box, in one sentence, Robinhood steps (<= 7 taps, exact values),
    # what-if, how you get out, why, the odds (base rates), risks and tax, portfolio after, footer + disclaimer.
    # Every number goes through a registry (numbers_registered).
def render_monthly(report: dict, ctx: dict) -> RenderedEmail

def validate(email: RenderedEmail) -> list[str]
    # every numeric token in subject/text must be in numbers_registered or a template-allowed literal

def send(email: RenderedEmail, *, dry_run: bool, outbox: Path) -> dict
    # Gmail API via HTTPS (refresh-token flow; env GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN,
    # ALERT_TO_EMAIL); dry_run or missing credentials -> write .eml to outbox
def create_issue(title: str, body: str) -> str | None
    # GitHub REST (GITHUB_TOKEN, GITHUB_REPOSITORY); None when unavailable
def healthcheck(status: str) -> None
    # HC_PING_URL; "start" | "success" | "fail"; silent on errors
```

## 7. Pipeline and CLI (integration) — `traderec/pipeline.py`, `traderec/facts.py`, `traderec/cli.py`

```
python -m traderec init [--nav 100000] [--date D] [--if-missing]   # create state/state.json and an empty ledger
python -m traderec daily   [--date D] [--dry-run] [--force]          # default D: the latest session whose close is final
python -m traderec weekly  [--date D] [--dry-run] [--force]          # Bitcoin switch; default D: the latest Sunday (ET)
python -m traderec monthly [--month YYYY-MM] [--dry-run] [--force]   # default: the month that just ended
python -m traderec verify-ledger
python -m traderec status
```

- **Exit codes:** 0 done or nothing to do; 3 the session's data isn't available yet (retry); 1 error.
- **State:** `state/state.json` holds `{"broker", "modules", "shadow", "forecasts", "runs", "counters", "marks", "dividends", "issues", "fills", "outbox", "alerts"}`. `state/pre_run.json` is the state before the most recent run, which is what `--force` restores. `state/outbox/` holds `.eml` copies of emails that were not sent (dry runs, no Gmail credentials, failed sends).
- **Idempotency:** one run per (kind, date). `data_missing` and `error` runs may be retried. `--force` re-runs only the most recent run, from `pre_run.json`, and records a `correction` in the ledger.
- **Ledger integrity:** each run verifies the hash chain and that the record the state last committed (`counters.ledger_head`) is still there. Records written by a run that crashed before saving the state are marked with a `correction`.
- **Daily order of work:**
  1. credit dividends (ex-dates since the last run, on the holdings before today's fills);
  2. fill queued orders at the first session after their creation date;
  3. accrue T-bill interest;
  4. mark the book;
  5. snapshot and two-source checks;
  6. M1 exit or entry;
  7. W10 exit (calendar-exact) or entry (two-source S&P close; admitted after M1);
  8. M2 monthly decision, or the next batch of deferred legs;
  9. M3 catch-up (the weekly job normally decides);
  10. shadow book (ST-1b; every uptrend −3% day scored at 60 and 90 days);
  11. dated forecasts;
  12. drawdown alerts.
- **Each decision:** pre-registered in the ledger, rendered, validated, GitHub issue opened, paper orders queued, and email sent after the state is saved. A validator failure blocks the orders and raises an alert.
- **Owner feedback (`traderec/feedback.py`):** the monthly job reads the trade issues' comments (`filled <dollars> @ <price> [TICKER]` / `skipped`) to measure two go-live gates: emails handled, and practice fills vs the fill model (median gap ≤ 10 bp).
