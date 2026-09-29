# Option shadow books: M7 (O1), O1-h, I1, I2 and ST-2

This build covers contract §6 and §7 for the option shadow books. Sources: design v3.3 §3 ("M7" and "Shadow ledger"), §4 and §6; track 14 §3.2–§3.6, §4.4, §6.7 and §7.1–§7.6; track 13 §11.3; and the research code in `research/code/14-short-options/` (`spreadsim.manage`, `s03`, `s05`) and `research/code/13-short-index/` (`first_cross`, `run_rule`).

All five books are shadow books:

- they send no emails and place no orders;
- they make no LLM calls;
- they log every event as a `shadow` ledger record `{"book", "event", ...}`;
- they keep their closed trades in `state.shadow.<BOOK>.trades`.

## What was built

| File | Contents |
|---|---|
| `traderec/modules/option_shadows.py` | Pure rules: calendar, signals, chain selection, credit-spread fill model, liquidity, results, O1 promotion check |
| `traderec/runners/option_shadows.py` | `daily`, `roots_needed`, `options_job` (the hooks already wired in `pipeline._daily` and `runners.OPTIONS_JOB_RUNNERS`) |
| `config/constitution.yaml` | `shadow.O1`, `O1H`, `I1`, `I2`, `ST2`, filled in and `enabled: true` |
| `tests/test_option_shadows.py` | 30 offline tests |

### The books

**O1 (M7): trend-filtered put credit spread.** Shadow at the $100k paper size; the design says it needs ≈$162k.

- **Structure.** XSP. Sell the put nearest 0.20 delta (0.15–0.25). Buy the put nearest 5% of spot lower (width 4–6% of spot).
- **Cycle.** One entry per monthly (third-Friday) expiry cycle, one spread open at a time.
- **Entry.** At the 10:17 ET snapshot of a session 45 to 40 days before the monthly expiry.
- **Filters,** checked at the previous close:
  - the S&P 500 (^GSPC) close is above its 200-day average;
  - VIX < 30;
  - VIX/VIX3M < 1.0.

  The ^GSPC close and the VIX must pass their two-source checks.
- **Exits,** checked at each 10:17 snapshot:
  - `take_profit` when buying the spread back costs ≤ 50% of the credit;
  - otherwise `time_stop` at the first snapshot with ≤ 21 days to expiry.

  There is no stop and no roll.

**O1-h.** O1 held to expiry, with a 0.10-delta short put (track 14 §7.1).

- It uses O1's filters and O1's monthly cycle.
- It settles at intrinsic value from the S&P 500's official close on the expiry date (XSP = S&P / 10).
- The next cycle opens while the last spread is still held, so up to 2 spreads can be open at once (`max_open: 2`, track 14 §7.4).

**I1.** A 0.20-delta / 5%-wide XSP spread after a fading VIX spike, held to expiry.

- **Trigger:** VIX closed ≥ 30 in the last 10 sessions (today included), and today's close is ≤ 0.8 × that peak.
- **Cool-down:** a new signal needs more than 30 calendar days since the last one.
- **No filters:** no trend, VIX or term-structure filter (track 14 §7.2, §7.5.9).
- **Expiry:** the last listed expiry at most 45 days out, and at least 40.

**I2.** O1's logic on IBIT.

- **Filters:**
  - BTC-USD above the average of its last 200 UTC daily closes, at the close;
  - at 10:17 ET, IBIT's ~30-day ATM implied volatility below its ~90-day ATM implied volatility. This stands in for "DVOL not in backwardation" (see Deviations).
- **Liquidity:** open interest ≥ 500 on each leg.
- **Exits:** O1's take-profit and 21-DTE close.

**ST-2.** An ETF shadow, not options (track 13 §11.3).

- **Signal:** the first VIX/VIX3M close ≥ 1.00 after 20 sessions below 1.00, while SPY's raw close is above its 200-day average.
- **Entry:** SPY bought at the next open, with fill model v1.0's slippage (1 bp).
- **Exit:** sold at the close of session 20, the entry session counting as 1. This is the research code's `run_rule(mode="open", hold=20)`.
- **Recorded:** `return` on notional, and `excess_return` = return − T-bill × 20/252.

### Fill model for credit spreads

Every spread fill uses fill model v1.0, with `concession` c = 0.3 from `fills.options`.

- **Quote.** The combo quote comes from `options.fillmodel.combo_quote`, seen from the seller's side:
  - V = mid(short) − mid(long);
  - nw = Σ(ask − bid) over the legs.
- **Sell to open** at V − c × nw.
- **Buy back** at V + c × nw.
- **Liquidity (track 14 §7.2).** An entry is skipped when:
  - nw is more than 10% of the mid credit V; or
  - for ETF options only (I2), a leg's open interest is below 500.
- **Settlement.** Spreads held to expiry settle at intrinsic value, at no cost.
- **Results.** Every spread records R = (credit − exit cost) / (width − credit), the return on max loss, per contract. R does not depend on the paper account's size. The trade record carries `return` (= R) and `return_basis: "max_loss"`. ST-2 records `return_basis: "notional"`.

At $100k, M7's own sizing rule (2% of NAV at max loss) gives 0 contracts. Each O1 entry records this as:

- `contracts_at_nav` (0 at $100k);
- `nav_for_one_contract` (max loss per contract / 2%).

## Interfaces

```python
# traderec/runners/option_shadows.py (contract §7)
def daily(run, checks) -> None          # 22:17 ET; checks = {"spy_ok", "vix", "vix_ok", "vix_series"}
def roots_needed(run) -> set[str]       # {"XSP"} / {"IBIT"} while a book has a pending entry or an open spread
def options_job(run, chains) -> None    # 10:17 ET; chains = {root: OptionChain}; guards each book itself
```

**Pure rules** (`traderec/modules/option_shadows.py`):

| Group | Functions |
|---|---|
| Calendar | `monthly_expiry`, `cycle_expiry`, `days_to_expiry`, `nth_session` |
| Signals | `o1_filters`, `vix_fade_signal`, `btc_trend`, `st2_signal` |
| Chain selection | `pick_expiry`, `pick_put_spread` (a Black-Scholes `put_delta` fallback when the chain has no delta), `atm_iv`, `iv_term_ratio` |
| Fills and liquidity | `credit_quote`, `sell_to_open_price`, `buy_to_close_price`, `credit_liquidity` |
| Results | `spread_intrinsic`, `managed_exit`, `result_on_max_loss` |
| Promotion | `o1_promotion_check(trades, cfg_promotion, months=None)`: track 14 §7.6 on the closed O1 trades |

`o1_promotion_check` checks:

1. ≥ 24 trades, or 30 months;
2. mean R ≥ +2.0% − 2 × 8.4% / √n;
3. no loss beyond 100% of the max loss;
4. the filters held on every entry.

The slippage criterion needs practice-account fills. Model fills concede 0.3 × nw by construction, so the check reports that criterion and does not test it.

**State**, per contract §6 plus these keys:

| Key | Meaning |
|---|---|
| `open_trade` | The pending entry, or the newest open trade |
| `trades` | Closed trades |
| `held` | O1-h / I1: older spreads still open |
| `last_cycle` | The monthly expiry last traded |
| `last_signal` | The last signal date, used for I1's cool-down |

**The open-trade and closed-trade records** carry these keys:

| Group | Keys |
|---|---|
| Signal | `trade_id` (`S-<signal date>-<BOOK>`), `signal_date`, `entry_due`, `target_expiry`, `filters` / `trigger` |
| Fill | `fill_date`, `fill_time`, `expiry`, `dte`, `legs` (contract §2 position legs), `contracts: 1` |
| Strikes | `short_strike`, `long_strike`, `short_delta`, `short_iv`, `delta_source`, `spot` |
| Prices | `credit` (= `entry_price`), `mid_credit`, `natural_width`, `slippage` |
| Risk | `width`, `width_pct`, `max_loss`, `max_loss_usd`, `credit_over_max_loss` |
| Checks | `quote`, `liquidity`, `planned_exit` |
| Marks | `mark`, `min_return` |
| Exit (closed trades) | `exit_date`, `exit_reason` (`take_profit` / `time_stop` / `expiry` / `expiry_settlement`), `exit_price` (the cost to close), `pnl`, `pnl_usd`, `return`, `return_basis`, `days_held` |

**Ledger events** (`record_type` "shadow"):

| Event | When |
|---|---|
| `signal` | A pending entry was created |
| `filters_failed` | An O1 / O1-h / I2 cycle window was open, but the filters failed |
| `blocked` | Missing, stale or unconfirmed data blocked an entry (fail closed) |
| `entry` | A spread was opened |
| `skip` | An entry was abandoned at 10:17, with the reason and the measured quote / liquidity |
| `expired` | A pending entry was not taken by the next 10:17 job |
| `mark` | An open spread was marked at 10:17 |
| `no_quote` | An open spread could not be quoted at 10:17 |
| `exit` | A trade was closed |
| `no_fill` | ST-2 had no open price for its entry |
| `error` | The book raised an exception |

## Operations

- **Schedule.** The books run inside the daily run and the options job, and need nothing else.
- **Until the options job is live:**
  - each option-book signal expires the next evening, logged as `expired` with a run note;
  - ST-2 is unaffected.
- **`data` alerts.** At most one per run. It lists the books that failed closed and why, for example: "option shadow books fail closed: O1: no VIX3M close; ST2: no VIX/VIX3M ratio on 2026-10-05".
- **`shadow` alerts:**
  - a book raised an error (the other books still run);
  - a managed spread was still open at expiry and was settled by the safety net.
- **Where to read results:**
  - `state/state.json` → `shadow.O1` … `shadow.ST2`;
  - the `shadow` records in `state/ledger.jsonl`.

  The generic monthly-report row reads `trades[].return`. For option books that is R on max loss; for ST-2 it is the return on notional.
- **Owner setup:** none. To stop a book, set `enabled: false` in its constitution block. That is a rule change under design §8.

## Deviations and interpretations

1. **Entry window 45→40 DTE, monthly cycles** (design: "40–50 DTE").
   - Track 14 tested one entry per monthly cycle, about 45 days before the expiry (§3.2, §7.7 "Monthly cycle"). That gives the design's "≤ 9 trades a year".
   - Entering whenever the book is flat would give about 15–20 a year.
   - So entries start at 45 DTE and may slip to 40 on filter or fill misses. Both bounds are inside the design's range.
   - A listed expiry within 40–50 DTE stands in when the monthly isn't listed.
2. **O1-h uses the 0.10-delta short put,** per track 14 §7.1 ("Same, short 0.10Δ, held to expiry"). The design's "O1 held to expiry" is read as shorthand for that definition.
3. **I2's "DVOL not in backwardation" is a proxy.** No provider serves Deribit's DVOL. The IBIT chain's ATM implied-volatility term structure (IV30 / IV90 < 1.0, the chain's analogue of VIX/VIX3M) is used instead, at 10:17 ET. A missing term structure fails closed. I2 has no analogue of O1's VIX < 30 crisis veto, because none is specified.
4. **Liquidity.** Credit spreads use track 14 §7.2's rule: natural width ≤ 10% of the mid credit, with OI ≥ 500 only for ETF options. Design §4's per-leg "bid-ask ≤ 10% of mid" is written for debit structures, and it would reject most 5%-wide long legs.
5. **Fills.**
   - Fills come from the same 10:17 snapshot that chooses the strikes. The shadow has no evening chain or limit price, so the model price is the fill.
   - No commissions: fill model v1.0 has none for spreads.
   - The take-profit is checked only at the 10:17 snapshots, which is conservative. A real good-till-cancelled order could fill intraday.
6. **ST-2 exits at the close of session 20,** the research's exact definition. It is a shadow, so this needs no execution. If ST-2 were promoted, Robinhood has no market-on-close order, so it would need M1's open-of-session-21 convention.
7. **Not applied:**
   - track 14 §7.2's "don't open on an FOMC or CPI day". It is "convenience only", and the design's M7 filters don't include it;
   - the drawdown governor, in the shadow's size information.
8. **Quotes.** A spread whose leg has no two-sided quote can't be marked or closed on that snapshot. That is the fill model's `combo_quote` rule. The spread retries at the next snapshot, and the expiry safety net settles it at intrinsic value.
9. **I1's cool-down** counts from the signal date, even when the entry is then skipped. That matches the research, whose signal dates don't depend on trades.

## For the integrator

- **Provider.** No change needed:
  - `FakeProvider(vix={"VIX": ..., "VIX3M": ...})` already serves VIX3M;
  - `LiveProvider.vix("VIX3M")` reads CBOE, then Yahoo;
  - the runner itself uses Yahoo's `^VIX3M` bar when CBOE lacks the run date's close.
- **Options job:**
  - pass `chains` keyed by root (`"XSP"`, `"IBIT"`), stamped with the snapshot's date in `asof`. A chain from another date is treated as stale;
  - a chain filtered for storage must still give the runner the target expiry's puts, and for I2 the ~30- and ~90-day expiries' at-the-money options.
  - `options_job` guards each book, so it never raises.
- **Tests.** `test_the_daily_pipeline_runs_the_books` goes through `pipeline.run_daily` and disables every other module and shadow book in its config. It assumes other runners honour `enabled: false`.
- **pyflakes.** It still flags unused `typing.Any` imports in the `runners/edgar.py` and `runners/macro_shadows.py` skeletons. Those files belong to other builds and are untouched here.
