# The growth book, Phase C1 (config, G1/G2 signals, the governor, the order set, the Sunday job, the paper broker)

Design v4.0 (`research/00-SYSTEM-DESIGN-v4.md`): §3 (the rule book), §3a (execution), §4 (portfolio rules), §9 (the
Sunday email's facts), §10, §11, Appendix A (A.1 config, A.2 modules, A.3 state and ledger keys, A.4 tests). Builder C2
renders the Sunday email and Rule E from the facts record in §4 below; a later builder writes the G3 screens.

## 1. What was built

| File | What |
|---|---|
| `config/constitution.yaml` | The `growth` block of A.1 (paper mode, `enabled: true`) and a `status` key on every module block: M1 `shadow`, M2 `retired` (+ `shadow_series: true`), M3 `"superseded_by: G2"`, M4 `shadow`, W8/W9 `shadow` (their old display strings live in `email_text/w8w9.py`), W10 `active`. Keys beyond A.1 are marked `C1:` (§7) |
| `config/account.yaml` | `ira.nav: 80000`, `ira.limited_margin: true`; `taxable.holdings: {VOO: 20000}` (recorded; §7); Coinbase stays off |
| `config/whitelist.yaml` | SSO and QLD (track 32 §1.1's venue table) |
| `traderec/growth/__init__.py` | `cfg_growth`, `enabled`, `module_status`, `supersedes_m3`, `with_enabled` (tests), `new_growth_state`, `state_growth` |
| `traderec/growth/governor.py` | `peak_nav`, `drawdown`, `G(drawdown, cfg)`, `hard_stop`, `update` (the Sunday state update), `restart`, `paused_blocks` |
| `traderec/modules/g1_lev_trend.py` | `sma_snapshot`, `g1_signal` (the 200-day SMA, the 2% band with hysteresis, the week's last session), `leg_check` (the two-source rule), `below_sma_today` (Rule E, band-free), `last_session_before` |
| `traderec/modules/g2_btc_switch.py` | `g2_signal` (the Sunday UTC close vs its 10-week average of Sunday closes and the 200-day average of daily closes, via `m3_btc.btc_weekly_switch`), `realized_vol`, `vol_cut`, `two_source_check` |
| `traderec/growth/orders.py` | `sleeve_targets`, `build_order_set` (deltas, netting, bands, ranking, the three-order cut, the deferred list, the cash rules, "Sell all", W10 last), `holiday_shift` |
| `traderec/growth/weekly.py` | `run(run)`: the Sunday job (§3) and the facts record (§4) |
| `traderec/pipeline.py` | The hook in `run_weekly` (§3); nothing else |
| `traderec/broker.py` | The cash vehicle at par with the T-bill accrual, limited margin, the queued-cash cap, `valuation`, `holdings_value` (§5) |
| `traderec/ledger.py` | `RECORD_TYPES` += `growth_decision`, `governor`, `order_set`, `rule_e`, `g3_shadow` (the last two for C2 and G3) |
| `traderec/data/providers.py` | `^NDX` gets a second source (CBOE's delayed NDX quote; no FRED series exists). Unverified live: the `_NDX` quote file is assumed to exist as `_SPX`'s does |
| `tests/test_growth.py` | A.4 groups 1, 2, 3, 5, 7, 8, the §11 first Sunday, a missing-data run, W10 folded in (26 tests) |
| `tests/test_pipeline.py`, `tests/test_replay.py` | Their `cfg` fixtures pin the v3.3 book (`growth.with_enabled(cfg, False)`): they assert M3's weekly switch |

## 2. The rules as implemented

**G1** (`g1_lev_trend`). Per leg (SSO on ^GSPC, QLD on ^NDX), on the Sunday run: the close of the week's last NYSE
session (Friday; Thursday in a holiday-shortened week: `last_session_before`) against the simple average of the last
200 closes including it, unrounded. Enter when out and close/SMA − 1 ≥ +2%; exit when in and ≤ −2%; otherwise hold.
The first decision (no state) is band-free: in when the close is above the average. No close for the week's last
session, or fewer than 200 closes: no signal, state kept, `data` alert. The two-source rule (`leg_check`):
`verify_close` on the index close (`data.two_source_tolerance`, 0.1%) and the decision re-run on the second source's
close; both must agree on the state, else no signal for that leg and the event is in the `growth_decision` record.
`below_sma_today(bars, date, cfg)` is Rule E's daily, band-free check (C2 wires it).

**G2** (`g2_btc_switch`). On the Sunday run with M3's convention (`asof_utc` = the Monday UTC date, so the Sunday
candle that closed at 00:00 UTC Monday counts): on when the Sunday close is above both its 10-week average of Sunday
closes and the 200-day average of daily UTC closes. The second source for the Sunday close is
`provider.second_source_close("BTC-USD", week_end)`, else the provider's `daily_bars("BTC-USD")` close for that UTC
day; tolerance `growth.sleeves.G2.signal.two_source_tolerance` (0.5%; §7). Vol cut: the 60-day realised volatility
(annualised over 365 days) above 70% on every Sunday for 91 days cuts the weight to 0.667 × 30% until a Sunday reading
below 60%. The 25% band and the size ceiling (50%) are in the order set and the targets.

**The governor** (`governor`). NAV = the IRA plus the taxable account at Friday's close (`PaperBroker.valuation`);
the peak starts at the first Sunday run and never falls; G(d) = 1 to 15%, linear to 0.25 at 35%, 0.25 beyond; re-set on
the Sunday run only. At d ≥ 40% the run raises a `hard_stop` alert, `paused` and `hard_stop_hit_on` are set, every
sleeve's target becomes 0 (three "Sell all" orders; the SGOV buy of the proceeds follows) and buys stay blocked until
`governor.restart(state.growth, nav, date)` after the owner's review (the peak starts again there).

**Targets** (`orders.sleeve_targets`). Per-ticker dollar targets on the **IRA's NAV** × G: SSO 25%, QLD 25% while in,
IBIT 30% × the vol factor (≤ 50%) while on, and SGOV = the residual (the G3 reserve 15%, the cash sleeve 5%, every
sleeve that is out, less W10's holding or its buy). Percent figures in the facts are percent of the IRA.

**The order set** (`orders.build_order_set`), in this order:
1. deltas per risk ticker: target 0 with a holding → "Sell all X" (the band never applies); a holding of 0 with a target
   → "Buy X $target" (a switch); otherwise a resize when |delta| ≥ $300 and (|delta| ≥ 25% of the target or G moved
   ≥ 0.10 since the last order sent); a resize down is a dollar sell (`governor_cut` when G fell, else `rebalance`);
2. ranking for the cut: sells (exits and cuts, largest first), then the buys largest first, then W10;
3. the first three: each buy must see cash ≥ its dollars / 0.90 (Robinhood's reserve on queued market orders; the
   reserves add up across the buys); when the sells' proceeds and the IRA's cash fall short, one netted "Sell SGOV $X"
   supplies the shortfall and takes a slot (so a buy that needs it also needs a free slot for it); a buy the SGOV
   holding cannot fund is deferred ("insufficient cash"); W10 that does not fit is **dropped** for the week and noted
   (design §3 W10), not deferred;
4. the SGOV buy of the idle cash (the cash after the sells and buys, less 0.5% of the sells' proceeds for their fills
   at Monday's open): lowest priority but W10; it always waits a week when no slot is left;
5. the listing: Step 1 = exits and cuts, then the SGOV sale; Step 2 = the buys in sleeve order (the G1 legs, G2, W10),
   then the SGOV buy of the idle cash last (Phase C3: listed before W10 it took W10's cash and the 90% cap cancelled
   W10's buy at the open; `docs/phase-c/replay.md`). A Monday holiday: `holiday_shift(sunday)` gives Tuesday's date
   (the broker fills at the first session).
The `queued_cash_frac` (0.90) is the cap the paper broker enforces (§5); `market_hours_cash_frac` (0.95) is the figure
the email quotes for Step 2 placed after the sells show "Filled" (C2).

**W10.** The daily module keeps the rule and its 90-day exit. For the Sunday email it must record a confirmed signal as
`state.modules.W10.fired = {"signal_date": ..., "ret": ..., "close": ...}` instead of emitting its own order (§8, an
integrator change). The Sunday job then queues "Buy SPY $(6% × G × IRA NAV)" from SGOV, ranked last, and sets
`state.modules.W10.open_trade` (`pending_entry`, `trade_id T-<signal_date>-W10`) so the daily fill handler and the
90-day exit work unchanged; `fired.handled` records the Sunday that took it (sent or dropped). A signal older than the
week is ignored. The facts' `w10.state` is `armed`, `fired`, `open` (`pending_entry` / `pending_exit`) or `disabled`.

## 3. The Sunday job and the pipeline hook

`pipeline.run_weekly` is unchanged but for four lines after `run.retry_unsent()`:

```python
if growth.enabled(cfg):                    # design v4: the growth book's Sunday job (Phase C1)
    growth_weekly.run(run)
if not growth.supersedes_m3(cfg):          # modules.M3.status "superseded_by: G2" retires M3 here
    _m3(run, asof_utc=...)
```

With the production config (`growth.enabled: true`, `modules.M3.status: "superseded_by: G2"`) the weekly job runs the
growth book and skips M3. `growth_weekly.run(run)`:

1. G1 per leg and G2 (with their two-source checks; every failure fails closed with a `data` alert);
2. the NAV at Friday's close (`broker.valuation` with the last closes of every held ticker and the book's tickers),
   then `governor.update`;
3. W10's state, the targets, the holdings per ticker (the book's own lots: modules `G1`, `G2`, `GROWTH` for SGOV, `W10`
   for the W10 lot) and the order set;
4. the orders queued with the paper broker (`OrderIntent` with `module` G1/G2/GROWTH/W10, `account` ira,
   `created_date` the Sunday, `close_all` for exits, `meta.max_cash_frac 0.90` on the risk-sleeve buys) and one
   `order` ledger record each; a rejected order (whitelist, account) is an `order` alert;
5. the ledger: `growth_decision` (every signal with both sources, the states after, the NAV and closes), `governor`
   (peak, drawdown, G, step), `order_set` (targets, holdings, netting, sent, deferred, skipped, dropped);
6. the state (§6) and the facts record (§4) in `state.growth.last_facts`; `run.result.nav` is the total NAV.

The fills happen in Monday's daily run (`_fill_pending`, the first session after the Sunday), sells before buys. The
job sends no email: C2's renderer reads `state.growth.last_facts` (or the return value) and the ledger ids in it.
Dry runs change nothing (the run works on a copy of the state, as every run does).

## 4. The facts record (`state.growth.last_facts`; C2 renders from it)

Every number the email prints is here. `*_pct` keys are percent units; `drawdown`, `G` and the `*_frac` keys are
fractions; dollars are rounded to cents.

```
{"kind": "GROWTH", "label": "PAPER" | "LIVE", "date": "2026-09-27", "week": 39, "friday": "2026-09-25",
 "execute_date": "2026-09-28",                       # the next NYSE session (Tuesday after a Monday holiday)
 "summary": {"changes": 3, "orders": 3, "recommendation": true},      # changes = sleeves whose state changed
 "nav": {"ira": 80000.0, "taxable": 20000.0, "total": 100000.0, "peak": 100000.0, "drawdown": 0.0},
 "governor": {"G": 1.0, "step": null, "full_until": 0.15, "floor_at": 0.35, "floor": 0.25, "hard_stop": false,
              "hard_stop_at": 0.4, "paused": false, "hard_stop_hit_on": null},
 "sleeves": [
   {"name": "G1 SSO", "ticker": "SSO", "state": "in" | "out", "changed": true, "target_pct": 25.0,
    "target_usd": 20000.0, "held_usd": 0.0, "delta_usd": 20000.0,
    "why": {"index": "^GSPC", "close": 7743.0, "sma200": 7205.4, "pct_vs_sma": 7.46, "band_pct": 2.0,
            "session": "2026-09-25", "signal": true, "reason": "first decision: close above its average"}},
   {"name": "G1 QLD", ... "why": {"index": "^NDX", ...}},
   {"name": "G2 Bitcoin", "ticker": "IBIT", "state": "on" | "off", "changed": true, "target_pct": 30.0,
    "target_usd": 24000.0, "held_usd": 0.0, "delta_usd": 24000.0,
    "why": {"weekly_close": 90000.0, "ma10w": 55000.0, "sma200": 43750.0, "week_end": "2026-09-27",
            "above_ma10w": true, "above_sma200": true, "vol60_pct": 12.3, "vol_cut_factor": 1.0, "signal": true,
            "reason": "weekly close 90,000 vs 10-week average 55,000 (above) and 200-day average 43,750 (above): on"}},
   {"name": "G3 reserve and cash", "ticker": "SGOV", "state": "reserve", "changed": false, "target_pct": 20.0,
    "target_usd": 16000.0, "held_usd": 0.0, "delta_usd": 16000.0,
    "why": {"g3_reserve_usd": 12000.0, "cash_sleeve_usd": 4000.0, "promoted_rules": [],
            "reason": "held in SGOV until a G3 rule is promoted"}}],
 "orders": {
   "step1": [{"action": "sell_all" | "sell", "ticker": "SSO", "held_usd": 11800.0, "usd": null | 9084.0,
              "rank": 1, "reason": "switch_off" | "governor_cut" | "rebalance" | "hard_stop" | "fund_buys",
              "sleeve": "G1"}],
   "step2": [{"action": "buy", "ticker": "SSO", "usd": 20000.0, "cash_cap_usd": 72000.0, "rank": 1,
              "reason": "switch_on" | "rebalance" | "governor_restore" | "idle_cash_to_sgov" | "w10_entry",
              "sleeve": "G1"}, ...],
   "deferred": [{"action": "buy", "ticker": "SGOV", "usd": 16000.0, "sleeve": "SGOV",
                 "why": "the 3 orders are used; the SGOV buy of idle cash may wait a week"}],
   "dropped": [ ...W10 this week, with "why"... ], "skipped": [ ...inside the bands, with "reason"... ],
   "sgov_sell_usd": 0.0, "sgov_buy_usd": 0.0, "max_orders": 3, "queued_cash_frac": 0.9},
 "w10": {"ticker": "SPY", "held_usd": 0.0, "state": "armed" | "fired" | "open" | "pending_entry" | "disabled",
         "signal_date": null, "open_trade": null, "exit_due": null, "disabled": false, "weight": 0.06,
         "buy_usd": 0.0, "note": ""},
 "holiday": null | "2026-09-08",
 "risk": {"leveraged_held": ["SSO", "QLD", "IBIT"],          # held or bought, in email.risk_box.required_for order
          "crash_day_loss_pct": 29.5, "hard_stop_pct": 40.0, "drawdown_limit_pct": 40.0},
 "sources": [{"ticker": "^GSPC", "a": 7743.0, "b": 7743.0, "b_source": "nasdaq", "agree": true, "date": "2026-09-25"},
             {"ticker": "^NDX", ...}, {"ticker": "BTC-USD", ..., "date": "2026-09-27"}],
 "ids": {"growth_decision": "<hash>", "governor": "<hash>", "order_set": "<hash>"},
 "account": "ira", "constitution_version": "3.3.0"}
```

`crash_day_loss_pct` = Σ(held or bought 2× leg ÷ IRA NAV × 41%) + IBIT ÷ IRA NAV × 30% (design §6: "about 30%").
Step 1's `usd` is null for "Sell all" (the email says "Sell all X"; `held_usd` is the Friday value). A Step 2 buy's
`cash_cap_usd` is 90% of the cash it will see after Step 1 (the SGOV buy's is the cash itself). With no orders,
`summary.orders` is 0 and `recommendation` false ("This week: no change").

## 5. The paper broker (design A.2 "Paper broker")

- **The cash vehicle** (`growth.sleeves.cash.vehicle`, SGOV) is a par instrument: orders fill at 1.0 per dollar, no
  slippage, no open price needed; lots are valued at par (`qty` = dollars) and never at a bar close; `accrue_interest`
  grows them at the T-bill rate (the daily job's existing call) as `dividends` income; `apply_dividend` ignores the
  vehicle, so real SGOV distributions never double count. `mark`, `valuation`, `holdings_value` and `_lot_value` apply it.
- **Limited margin** (`accounts.<name>.limited_margin`, default true): sells fill before buys in one pass, so
  Monday's sells fund Monday's buys. With `false`, a buy the pass's settled cash (the balance before its sells) cannot
  pay waits one session (`meta.waited_settlement`) and fills at the next open.
- **The queued-cash cap**: a buy with `meta.max_cash_frac` (the book's risk-sleeve buys, 0.90) that asks for more than
  that fraction of the account's cash at fill time is cancelled (reason "buy of $X exceeds 90% of the $Y available");
  the pipeline's cancel handler raises the `fill` alert (its text still says "no open price"; §8).
- `valuation(closes)` is `mark` without side effects; `holdings_value(account, ticker, price, module)` values one
  ticker. Phase A/B orders carry no cap, never trade the vehicle and live in limited-margin accounts: unchanged.

## 6. State and ledger keys (A.3)

`state.growth`: `peak_nav`, `drawdown`, `G`, `G_date`, `G_at_last_order`, `hard_stop_hit_on`, `paused`, `first_run`,
`last_run`, `sleeves.G1.<leg>.{in, since, last_close, sma200, band_state ("above" | "inside" | "below"), last_signal}`,
`sleeves.G2.{on, since, weekly_close, ma10w, sma200, week_end, vol60, vol_cut_factor, vol_high_since}`,
`sleeves.G3.{reserve, rules}` (the reserve in dollars, held in SGOV), `W10.{open, entry, exit_due, state}`, `targets`
(per ticker: sleeve, state, weight, target_pct, target_usd, held_usd, delta_usd), `order_set` (the orders sent, with
ranks and intent ids), `deferred`, `rule_e.{count_week, count_year, last}` (C2), `weeks_with_orders.<year>`,
`last_facts`. `state_growth(state)` creates the block for states saved before Phase C. The W10 keys the Sunday job
reads and writes are on `state.modules.W10` (`fired`, `open_trade`, `disabled`).

Ledger records (hash-chained as today): `growth_decision`, `governor`, `order_set` every Sunday, `order` per queued
order, the daily `fill`s as before. `rule_e` and `g3_shadow` are registered for C2 and the G3 builder.

## 7. Interpretations (design Appendix B style)

| Where | The design says | Built as | Why |
|---|---|---|---|
| §3 G1, first decision | the band with hysteresis | the first evaluation (no state) is band-free: in when the close is above the average | the band needs a prior state; §11 has both legs in at +7.5% |
| §3 G1, the decision day | "after Friday's close" | the last NYSE session on or before the Sunday; a missing close for it fails closed | holiday weeks (Good Friday) decide on Thursday |
| §3 G2, two sources | "two-source rule as for M3" | M3 has no second source in code; G2 checks the Sunday close against `second_source_close("BTC-USD")`, else Yahoo's BTC-USD bar, tolerance 0.5% (`C1:` key) | venue closes at 00:00 UTC differ by more than the 0.1% ETF tolerance |
| §3 G2, the vol cut | "stays above 70% for a quarter" | above 70% on every Sunday reading for 91 days | weekly readings; the clock resets on one reading at or below 70% |
| §4 sleeve weights | "% of NAV" | % of the IRA's NAV (`account.yaml ira.nav`); the governor's drawdown is on IRA + taxable | §1 "the growth book uses 100% of [the IRA]"; §11's $20k/$20k/$24k |
| §3a.3 netting | "two sleeves selling SGOV is one SGOV order" | one netted SGOV sale sized to the buys' 90% reserve, or one SGOV buy of the idle cash | the reserve applies per queued buy against the same cash |
| §3a.4 the 95% / 90% | "each at most 95% of the cash it needs (a queued buy uses at most 90%)" | the builder sizes and the broker enforces 90% (the paper fills are queued); 0.95 is stored for the email's Step 2 line | one fill pass at the open |
| §3a.3 the SGOV buy | "may always wait a week" | sized at the idle cash less 0.5% of the sells' proceeds, no cash cap, deferred when no slot is left | never a buy for more than the cash after the sells' slippage |
| §3 W10 | "skipped for that week (and logged) if the email already carries 3 orders" | dropped for the week, noted in the run and the `order_set` record; not carried to the next Sunday | a crash-day buy two weeks late is another trade |
| §3 W10 exit | "the last session within 90 calendar days" | the daily W10 module's calendar stop and EXIT email, unchanged | a time stop is not a Sunday decision; C2 may fold it into the Sunday email |
| §6, §9 risk line | "a 1987-style day costs about 30%" | 41% on each 2× leg's weight plus 30% on IBIT's | 0.5 × 41% + 0.3 × 30% = 29.5% |
| §4 accounts, VOO | "taxable $20k: VOO held" | `holdings: {VOO: 20000}` recorded; the paper taxable account stays cash at the T-bill rate | no VOO price exists at init and the daily run would need VOO bars in every provider; C2's account changes |
| §3 table, statuses | M1/M2/M4/W8/W9 to shadow or retired | `status` keys recorded; only M3's is enforced (the weekly job) | the brief's scope; §8 |

## 8. Changes needed elsewhere (files this build could not edit)

1. **`pipeline._daily`**: while `growth.enabled`, skip `_m3` there too (`growth.supersedes_m3(cfg)`), or M3's daily
   catch-up buys a 3% IBIT lot next to G2's. And `_m2` / `_m1` / M4 / W8 / W9 keep trading the paper IRA under their
   v3.3 rules (their `status` keys are not enforced): with M2 at up to 60% of NAV and the book at 100% the paper IRA is
   oversubscribed. Set `enabled: false` (or wire `growth.module_status`) for M1, M2, M4, W8 and W9 when the book goes
   on paper, keeping their shadow books.
2. **`pipeline._w10`**: under the growth book, record the confirmed signal as `state.modules.W10.fired` (signal_date,
   ret, close, prev_close, sma_prev) and return, instead of `run.emit` (design §3 W10: entry at the open after the next
   Sunday email). Everything after that is built (§2).
3. **`pipeline._on_cancel`**: read the reason from `run.broker.cancelled` (`meta.cancel_reason`) instead of the fixed
   "no open price", so the 90%-cap cancellation's `fill` alert says why.
4. **`emails.py` / `validator.py`** (C2): the GROWTH renderer from §4, the risk box when `risk.leveraged_held` is not
   empty, the Step 1 / Step 2 / deferred lines, the holiday line, `w10`; the validator's slots for every number in §4.
5. **`docs/INTERFACES.md`, `docs/OPERATIONS.md`, `README.md`** (the integrator): §6's keys and records, the Sunday job,
   limited margin, the two-step order routine.
6. **`scripts/replay.py`** (C3): `replay_tickers` must add SSO, QLD, ^NDX, SGOV, BTC-USD bars for the book.

## 9. Owner setup and limits

- Robinhood IRA: limited margin on (design decision 10); `account.yaml ira.limited_margin` mirrors it for the paper
  broker. SSO, QLD, IBIT and SGOV are on the whitelist; `check_venues.py` should re-verify SSO and QLD monthly.
- The G1 kill rule (fund closed or a 20-session tracking gap above 3 points) and G2's annual weight review are not
  automated; the hard stop's restart is `governor.restart` by hand after the owner's review.
- Every provider the daily run sees must serve SSO, QLD, ^NDX, SGOV and BTC-USD bars once the book holds them (the
  dividend and mark steps read every held ticker).
