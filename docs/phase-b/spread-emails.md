# Spread emails and spread fill comments

Build notes for the spread-email build (`docs/PHASE_B_CONTRACTS.md` §8). It covers the plain-English email for
option-spread orders (order kind (b), design v3.3 §3a and §9) and the owner's fill comments for spreads.

## What was built

- **`traderec/emails.py`.** `render()` sends every recommendation that has a `spread_limit` order to
  `_SpreadEmail`, a subclass of the ETF email (`_TradeEmail`).
  - The ETF path gained one no-op hook, `explainer()`, which places the spread explainer after "In one
    sentence". Nothing else in the ETF path changed.
  - Every email the Phase A tests build (all kinds; paper, live and bare context) renders byte for byte as
    before: subject, text, HTML, registered numbers and meta.
- **`traderec/validator.py`.** One new allowed literal, `"11:00"` (see "Validator").
- **`traderec/feedback.py`.** Spread comments count toward both go-live gates. Spread fill gaps are measured apart
  from the ETF gaps.
- **Tests.** `tests/test_emails_spreads.py` (27 tests) and 5 new tests in `tests/test_feedback.py`.

## The email

The order's side decides the email:
- `side="buy"` opens a debit vertical (NEW_TRADE);
- `side="sell"` with `close_all` closes it (EXIT).

The other kinds keep their tags, and the email follows the side.

**Subject:**

```
[PAPER][TRADE T-2026-09-29-M4] BUY 2 XSP 770/810 call spreads, 18 Dec, limit $7.45 — Crash call spread (M4) — after 10:00 ET Wed 30 Sep
[PAPER][EXIT T-2026-09-29-M4] CLOSE 2 XSP 770/810 call spreads, 18 Dec, limit $12.30 — Crash call spread (M4) — after 10:00 ET Thu 17 Dec
```

- Strikes are written long/short: low/high for a call debit spread, high/low for a put debit spread.
- The expiry is day and month. The window is the execute date.

**Sections, in order:**

1. **Headline box.**
   - ACTION: contracts, strikes, both legs, expiry, the net limit and the account.
   - SIZE: the debit, as `2 × $745`, and its % of the portfolio. For an EXIT: the credit at the limit and at the
     stated minimum.
   - STRESS: max loss = the debit at the stated maximum. For an EXIT: none once closed.
   - WINDOW: after 10:00 ET on the execute date. Not filled by 11:00 ET: re-enter once at the stated maximum
     (minimum); otherwise skip (for an EXIT, wait for tomorrow's email).
   - ODDS: base rates, marked "(of the debit)".
   - RESULT (EXIT only): at tonight's mid.
   - CONFIDENCE and STATUS.
2. **In one sentence.**
3. **The explainer.**
   - For a NEW_TRADE, "What you're buying: a call debit spread":
     - the two legs, and what a call (or put) is;
     - the price per share × 100;
     - max loss = what you pay, and when it happens;
     - max value = the width × 100, and when it happens;
     - breakeven, and spot;
     - closing before expiry;
     - settlement;
     - the OCC symbols for reference.
   - For an EXIT, "What you're closing": the position, the credit, and what it is worth.
4. **Do this in Robinhood**, with exact values.
   - Opening, 7 steps:
     1. after 10:00 ET, switch to the individual account;
     2. Search the root → Trade → Trade Options;
     3. Buy and Call, then the expiration;
     4. Select both strikes, Buy the lower and Sell the higher, to get one Call Debit Spread → Continue;
     5. Limit price, Contracts, Good for day;
     6. Review → Submit, with the expected total;
     7. record the fill.
   - Closing, 6 steps: search the root and tap the position (strikes, expiry, contracts) → Trade → Close
     position → the limit credit and all contracts → Review → Submit → record.
5. **What if.**
   - Not filled by 11:00 ET: re-enter once at the stated maximum, then skip. For an EXIT: the stated minimum, then
     a new EXIT email tomorrow evening.
   - The price moved.
   - Robinhood shows a different spread price: type the limit.
   - Only one leg is offered: skip, and never leg in (never close one leg alone).
   - The account can't trade spreads.
6. **How you get out.**
   - For a NEW_TRADE:
     - the planned close from `facts.exit_date`, at least one trading day before expiry;
     - then `facts.exit_plan`, or the module's EXIT_PLAN text, or the generic "No stop-loss order" line;
     - then the usual reminder, unless the module is in `PLAN_NAMES_EXIT_EMAIL`.
   - For an EXIT: "this email is the exit", plus tomorrow's email if it doesn't fill.
7. **Why** (module WHY text or a generic line per exit reason), **the odds** and **risks and tax.**
   - The module's RISKS come first.
   - Then the spread risks: max loss, time decay and wide quotes. American-style roots also get the assignment
     risk.
   - Then the tax line:
     - index roots (`section_1256`): "Section 1256 … 60% long-term and 40% short-term (the 60/40 rule)";
     - otherwise: "not Section 1256 contracts: gains are short-term, taxed as ordinary income". Both lines name the
       account (design §9).
8. **Portfolio after, record your fill, and the footer.**
   - The fill comment is `filled <contracts> @ <net price>`, with an example built from the order.
   - `meta["order_type"] = "spread_limit"`.

If the strikes, the expiration or the limit price are missing from both the facts and the order, the email never
guesses them. The steps and the what-if say "don't place anything, record skipped". The broker would refuse such an
order anyway.

## Interfaces

**Facts keys** (`rec.facts`). All are optional: facts come first, and the order's own fields (`ticker`, `legs`,
`contracts`, `limit_price`, `max_price`) fill the gaps.

| Key | Used for | Default when missing |
|---|---|---|
| `root` | everything | `order.ticker` |
| `underlying_name` | explainer ("XSP (Mini-S&P 500 index)") | `TICKER_NAMES`, then `OPTION_ROOT_NAMES`, then the root |
| `strategy_label` | explainer heading | "call debit spread" / "put debit spread" from the legs |
| `legs`, `expiry`, `contracts`, `limit_price`, `max_price` | the order | the order's fields; expiry from the legs |
| `debit_usd`, `max_debit_usd`, `max_value_usd` | size, max loss, max value | contracts × price × 100 |
| `credit_usd`, `min_credit_usd` (EXIT) | size, what-if | contracts × price × 100 |
| `breakeven` | explainer | long strike ± limit |
| `spot` | explainer | the sentence is left out |
| `exit_date` | planned close | "at least one trading day before it expires" |
| `stress_usd`, `stress_pct` | STRESS and risks | `max_debit_usd`; % from the NAV |
| `section_1256` (bool) | tax line | true for XSP, SPX, SPXW |
| `settlement` | explainer, assignment risk | "cash-settled, European-style" for index roots, else "shares, American-style" |
| `entry_price`, `pnl_usd`, `pnl_pct` (EXIT) | RESULT and why | left out |
| `reason` (EXIT) | sentence and why: `time_stop`, `take_profit`, `invalidation`, `expiry_rule` | the order's reason |
| `execute_date`, `base_rates`, `exit_plan`, `confidence`, `status`, `stage` | as in ETF emails | as in ETF emails |
| `multiplier` | per-spread dollars | 100 |

When facts and the order disagree, the email shows the facts and the broker uses the order. Runners should build
both from the same numbers.

**Derived keys** that module text may also use: `root`, `underlying_name`, `strategy_label`, `right`
("call" | "put"), `direction` ("rises" | "falls"), `long_strike`, `short_strike`, `strikes` ("770/810"),
`width`, `spreads_phrase` ("2 XSP 770/810 call spreads"), `per_spread_usd`, `max_per_spread_usd`, `debit_frac`
and `when` ("after 10:00 ET on Wed 30 Sep").

**Module text** comes from the shared tables (`ONE_SENTENCE`, `WHY`, `EXIT_PLAN`, `RISKS`, `MODULE_*`), merged from
`traderec/email_text/`.
- Module entries win. The generic spread text is in `SPREAD_ONE_SENTENCE` and `SPREAD_WHY`, and is not
  overridable per module.
- `emails.py` deliberately adds no M4/W8/W9/XSP keys to the shared tables: `merge_module_text` raises on duplicate
  keys. That is why index-root names live in `OPTION_ROOT_NAMES`.

**Validator.**
- `"11:00"` joins `ALLOWED_LITERALS`, next to `"10:00"`. The contract requires "if not filled by 11:00 ET" in every
  spread email.
- The tax lines (`SECTION_1256_TAX`, `ORDINARY_OPTION_TAX`) are fixed, reviewed text with digits. They are registered
  verbatim, like the label tables (the "1990" in W10's confidence label).

**`feedback.review()`** keeps its Phase A keys (`fills`, `median_gap_bps` are now the ETF orders only) and adds:
- `spread_fills`: rows with `spread`, `contracts`, `gap_bps` and `gap_usd`;
- `spread_median_gap_bps`;
- `spread_fills_ok`.

`fills_ok` passes only when every measured group is within its tolerance.

## The fill gap for spreads: basis points of the net price

- **Measure.** `gap_bps` = side × (owner price / model price − 1) × 10,000, where both prices are net per share of
  the spread.
  - Opening, that is bp of the debit; closing, bp of the credit.
  - Positive is worse for the owner.
  - `gap_usd` is the same gap in dollars per contract, for reports.
- **Gate.** The median |gap| ≤ `SPREAD_FILL_TOLERANCE_BPS` = 200 bp. ETFs keep 10 bp.
  - Why 200: the fill model leaves 0.2 × the natural width between the order's limit (mid + 0.3 × width) and its
    stated maximum (mid + 0.5 × width).
  - Under the liquidity rule (natural width ≤ 10% of the debit, design §4), that room is at most 2% of the debit.
- **A price typed per contract** ("filled 2 @ 745" for a 7.45 spread) is read as per share. That applies to any
  owner price between 50 and 200 times the model's, with the multiplier of 100.
- **Which paper fills count as spreads.** A fill is a spread fill when it records `order_type`, a `multiplier`
  above 1 or `legs`. Failing those, it counts when its module is in `SPREAD_MODULES` (M4, W8, W9), because
  `pipeline._on_fill` stores the Phase A keys only.
- **Comment forms.** `filled 2 @ 7.45`, `filled 2 @ 7.45 XSP`, `XSP filled 2 contracts @ $7.45`, `filled 3x @ 1.20`
  and `skipped` all parse.

## Owner setup

- Enable options spreads and index options on the **individual** Robinhood account (track 20 §5). IRAs allow
  Level 2 only.
- Confirm in the app that these labels exist: "Trade Options", "Select", "Call Debit Spread", "Continue",
  "Trade → Close position" and "Good for day".
  - They come from track 20's flow and Robinhood's help pages, not from a session in the app.
  - If the wording differs, the numbers in the steps still hold.
- Record fills on the trade's issue as `filled <contracts> @ <net price>`. The price is per share, as Robinhood
  quotes it.

## For the integrator

A spread NEW_TRADE and EXIT were pushed through the real `run.emit` path on the synthetic market of
`tests/test_pipeline.py`, with a patched `runners.m4.daily`. The result:
- both emails validated;
- the issues were recorded with `tickers == ["XSP"]`;
- both orders were queued;
- `feedback.review` measured the owner's comment against a model fill that had only the Phase A keys.

That run found items 1 and 2 below.

1. **Pending spread roots.** `pipeline._fill_pending` collects the tickers of *all* pending orders and fetches their
   daily bars for the opens, including `spread_limit` intents, which the broker ignores there.
   - With an index root (XSP) that has no daily bars, the next daily run raises.
   - It should skip `o.order_type == "spread_limit"` (`pipeline.py`, options build or integrator).
2. **Issue body.** `pipeline._issue_body` appends ``filled <dollars> @ <price>`` to every issue. For spread emails
   (`email.meta["order_type"] == "spread_limit"`) it should say ``filled <contracts> @ <net price>``.
3. **Model fills.** The options job must append spread fills to `state["fills"]` the way `pipeline._on_fill` does:
   `ticker` = the root and `price` = the net per share, ideally plus `multiplier` and `qty`. Otherwise
   `feedback.review` has no model fill to measure against. "Emails handled" works either way.
4. **Monthly report.** `facts.monthly_report` passes `fills_ok` through, which now covers spreads too. It could also
   pass `spread_fills` and `spread_median_gap_bps` to the monthly and quarterly reports.
5. **Module text** (`email_text/m4.py`, `w8w9.py`). The email already gives the planned close, the rule to close at
   least one trading day before expiry, the max loss, the explainer and the tax line.
   - The module's EXIT_PLAN and RISKS should add only its own rules and risks: take-profit, invalidation, crash
     depth, and so on.
   - `underlying_name` should be a plain name ("Mini-S&P 500 index"), without the root.
6. **Portfolio table.** `facts.portfolio_after` values orders by `dollars`, and a spread order has none. The
   "portfolio after" table won't show a new spread until it fills and is marked (options build).

## Known limits

- The Robinhood labels are unverified in the app (see "Owner setup").
- The 200 bp spread tolerance is this build's proposal; the design gives none. Change it at a quarterly review
  (design §8).
- Only debit verticals are emailed. Credit spreads (M7/O1) are shadow-only.
- Spreads have no ADJUST email. A failed close is re-issued as a fresh EXIT (contract §3).
