# Phase B build notes: quarterly and annual reviews, go-live gates, the monthly report

Contract: `docs/PHASE_B_CONTRACTS.md` §11. Design: `research/00-SYSTEM-DESIGN-v3.md` (v3.3) §3 (kill switches and
reviews), §7 (paper phase, go-live, edge evidence, ramp) and §8 (monthly, quarterly and annual content). The maths
comes from track 18 (§5.4–§6.2, `research/code/18-short-exec/paper_protocol.py`) and track 10 (§4.8, §6(e)). The
red-team finding C1 (track 19) is why the edge evidence is computed on the wide book and stays advisory.

**The reviews report and recommend. They never change a rule, a size or a module's state.**
- Go-live and ramp decisions come from the quarterly review; the owner takes them.
- Rule changes are decided with the owner at the annual review.

## What was built

| File | What |
|---|---|
| `traderec/reports.py` | `run_quarterly`, `run_annual`; the gate and calibration maths as pure functions; generic state collectors; the report builders |
| `traderec/facts.py` (`monthly_report` only) | generic over every module and shadow book in the state; adds the gate status and the evidence meter |
| `traderec/emails.py` (`render_monthly` and the end of the file) | the gate table shared by the monthly and quarterly emails; `render_quarterly`, `render_annual` |
| `.github/workflows/monthly.yml` | the quarterly review after the March, June, September and December reviews; the annual after December's |
| `tests/test_reports.py` | offline tests of all of the above |

### The quarterly review (`python -m traderec quarterly [--quarter YYYY-Qn] [--dry-run] [--force]`)

Default quarter: the one that just ended. One run per quarter (run key `quarterly:YYYY-Qn`); `--force` and
`--dry-run` work as for the monthly run. Failures come first in the email. Sections:

1. **Go-live and ramp.**
   - The operations gate to date (design §7.2): ≥3 months, ≥95% of runs on time, no validator failures, ≥90% of
     trade emails handled, practice fills within tolerance, the ledger verifies. An unmeasured check fails closed.
   - The edge evidence (§7.3). It binds only once the selected book has 30 trades (the budget counter; one M2
     rebalance = one trade).
   - In live mode, the ramp (§7.4):
     - half size: ≥6 months and ≥30 live trades, P ≥ 0.8, κ̂ ≥ 0.2, implementation shortfall ≤ 20%;
     - full size: ≥100 resolved trades (paper at half weight), P ≥ 0.9, calibration verified.
2. **Results** this quarter and since the start, against SPY and T-bills, and module activity.
3. **Edge evidence on the wide book** (P(edge > 0) under N(0, 0.1²)), per family and pooled.
4. **Claimed vs realised edge (κ̂).**
5. **Costs and slippage.** The fill model's cost per fill, by ticker, and practice-account fills against the model.
6. **Calibration.** Per forecast family and pooled.
7. **Base-rate drift.**
8. **Recalibration maps.**
9. **Kill switches and module reviews:** W10's kill switch, M2's review and pause triggers, and paused modules.
10. **Shadow books.**
11. **Rule changes:** always none.

### The annual review (`python -m traderec annual [--year YYYY] [--dry-run] [--force]`)

Default year: the one that just ended.
- **Decisions for you.** Each one comes with a recommendation.
- **The year's results.**
- **The calibration slope** (logistic slope with a 90% interval, from 30 scored forecasts).
- **Retirements.** Track 10's test (c):
  - a module is a candidate when P(edge > 0) < 0.2 after ≥20 trades and ≥12 months, AND its shadow evidence is
    negative;
  - a kill switch shows as "paused";
  - thesis invalidation is the owner's call.
- **W10's re-decision.** Its shadow record (every uptrend −3% day) is scored at 60 and 90 days against track 23's
  references (SPY 1993–2026, all events: 60 days +3.81%, 75% won; 90 days +6.86%, 90% won; random entry days
  +1.77% and +2.66%). The recommendation:
  - "keep" by default;
  - "consider the shadow ledger" when ≥5 scored events average below random entry days;
  - "back to shadow" if its kill switch fired.
- **M2's triggers:**
  - review at a 20% sleeve drawdown;
  - pause when the 36-month Sharpe falls below −0.5 (only once 36 months exist).
- **Hurdle and budget.**
- **The rule-change bar:** a change must hold before and after 2008 and clear the multiple-testing bar; nothing
  changes on one good or bad month.

### The monthly report (generic)

- **Trades and shadow books** are summarised over every module and book in the state, whatever its shape:
  - a module history entry with `exit_date` is a closed trade, and one without (M2's rebalances) counts as opened
    on its `date`;
  - an open trade counts from its `fill_date`;
  - shadow `events` count by the first date key found (`signal_date`, `date`, `event_date`, `detected`, `filed`,
    `asof`); scored records use the longest configured horizon (W10: 90 days);
  - `trades` count by `signal_date` and `exit_date`; returns are read from `return` or `ret`;
  - unknown shapes are skipped, never fatal.
- **The shadow table** shows the books with activity. Enabled books without activity are named on one line.
  Disabled idle books (Phase B books not switched on yet) are left out.
- **New keys:**
  - `stage`, `edge_p`, `edge_units`, `edge_threshold`, `edge_binding`, `edge_families`;
  - `emails_handled_rate_to_date`, `fills_ok_to_date` (the gate now uses to-date fills);
  - `open_trades`, `paused_modules`, `next_quarterly`, `quarterly_this_month`, `gate_checks`, `go_live_ready`.
  - Every existing key is unchanged.
- **Runs on time** now include the 10:17 ET options job, from its first run. The hourly crypto job is not counted.
- **Problems first** also lists kill-switch, shadow-book-error, cluster and open-position-cap alerts.
- **If the gate computation fails,** the monthly review still goes out, with a note.

## Interfaces (`traderec/reports.py`)

```python
run_quarterly(cfg, provider, state_dir=None, *, quarter=None, dry_run=False, force=False, services=None) -> RunResult
run_annual(cfg, provider, state_dir=None, *, year=None, dry_run=False, force=False, services=None) -> RunResult
quarterly_report(run, quarter) -> dict          # emails.render_quarterly's keys; also the ledger record
annual_report(run, year) -> dict                # emails.render_annual's keys
monthly_gate(run, asof, *, fetch, ledger_ok=None) -> dict      # used by facts.monthly_report

# pure maths
edge_posterior(n, sharpe, *, prior_sd=0.1) -> float | None     # Φ(n·ŝ / √(n + 1/prior_sd²))  (track 18 §5.4)
edge_evidence({family: [excess | (excess, weight)]}, *, prior_sd, min_units=5) -> dict
kappa_observation(returns, claimed_mean) -> (κ_obs, se) | None
kappa_posterior([(κ_obs, se)], *, prior_mean=0.35, prior_sd=0.15, lo=0.1, hi=0.6) -> dict
calibration_in_the_large(forecasts, *, icc=0.4, tol=0.20, min_n=20) -> dict   # hit − mean p, 90% interval
calibration_slope(p, y) -> dict | None           # logit P(y) = a + b·logit p, Wald 90% interval
miscalibration_lr_test(p, y) -> p-value          # H0: a = 0, b = 1 (1 df with one distinct p)
fit_platt(p, y) -> (a, b)                        # MAP, shrunk toward the identity
recalibration_review(forecasts, *, min_n=150, isotonic_n=1000, alpha=0.05) -> dict
base_rate_drift(returns, base_rates, *, min_n=150) -> dict
sleeve_review(months, *, review_drawdown=0.2, pause_sharpe=-0.5, window=36) -> dict
quarter_bounds, year_bounds, last_quarter, quarter_of, period_end, months_between
```

Thresholds live in `reports.GATES`, each with its design or track citation. An optional `reports:` block in
`config/constitution.yaml` overrides any key; none is needed.

### How each number is computed

- **Excess returns** are net of T-bills over the same calendar days. The T-bill rate is the one in the last
  daily snapshot on or before the entry, read from the ledger.
- **The wide book**, one family each:
  - `ST1B`: the ST-1b shadow trades;
  - `M3`: every closed M3 switch;
  - `M2`: position-months. Each is a leg with a positive target, held from one monthly decision (the M2 `signal`
    record in the ledger) to the next, or to its month's end once that has passed. Its return is the leg's
    total return from adjusted closes;
  - `W10`: the W10 shadow record at 90 days.
- **Pooling.** Each family is standardised by its own standard deviation. A family joins the pooled estimate
  once it has 5 units with some variation.
- **κ̂.**
  - Per module with `base_rates.mean_pct`: the realised mean return of its closed trades over the claimed mean,
    with standard error sd / (√n · claimed). A module contributes from 5 trades.
  - The observations update the N(0.35, 0.15²) prior. The mean is clipped to [0.1, 0.6].
- **Calibration.**
  - Families are (module, event), e.g. "M1 profit".
  - The effective sample divides each trade's m forecasts by 1 + (m − 1) × 0.4.
  - Warnings (the 90% interval excludes 0) and gross bias (the interval lies wholly beyond ±20 points) need 20
    scored forecasts in a family.
  - "Calibration verified" (the full-size ramp) means the pooled gap is within ±5 points and the slope's 90%
    interval contains 1.
- **Recalibration maps.**
  - Identity below 150 per family.
  - From 150, a MAP Platt map is recommended only if the likelihood-ratio test gives p < 0.05 AND a map fitted
    on the older half scores better on the newer half.
  - In the tests the gate recommends a map for about 3% of honest forecasters and ≥90% of over-confident ones
    (n = 300).
  - Isotonic maps are only flagged as eligible (from 1000); nothing fits them.
- **Base-rate drift** runs two one-sample tests at 90%: the win rate and the mean against the base rates. The
  base rates come from:
  - the constitution's `base_rates` for modules;
  - track 13 §8.1 for ST-1b (73% won, +0.43%);
  - a Phase B shadow block's `base_rates` when its build adds them.

  Status: "too few" (<5), "in line", "early sign" (outside, fewer than 150), "drift" (outside, 150 or more:
  listed as a problem).
- **Costs.**
  - Modelled cost = |fill price − reference price| × quantity × multiplier, for every non-dividend ledger fill
    in the period (ETFs and spreads alike).
  - Practice gaps come from `feedback.review` on the period's issues.
  - The advice follows track 18 §6.1: a more conservative model when fills are worse than the 10 bp tolerance
    on average; a cheaper one only with ≥60 practice fills.
- **Live trades** are the trades whose entry email (NEW_TRADE, SWITCH_ON, REBALANCE) was labelled `[LIVE]`. The
  account mode is global, so the email labels are the only per-trade record. Live since = the first such email.
- **Implementation shortfall** = 2 × the mean signed practice-vs-model gap (bp per order) / the mean paper return
  per resolved trade (bp). It is None (fails closed) without practice fills or with a paper edge ≤ 0.
- **M2's sleeve month** = Σ legs target / NAV × leg return: M2's result in NAV terms. Drawdown is on the
  compounded path; the Sharpe is annualised from monthly excess returns.

## Operations

- **Schedule.** The `monthly` workflow runs on the 1st at 12:13 UTC.
  - A new step, "Plan the reviews", works out which reviews are due from the month reviewed (default: the month
    that just ended, in New York time).
  - After a March, June, September or December review, `quarterly --quarter YYYY-Qn` runs. After December's,
    `annual --year YYYY` also runs.
- **Independence.** Each review is its own run over the same state, so one failing does not stop the others.
  State is committed if any of them succeeded, and the job fails if any failed.
- **Checks.** The quarterly and annual steps ping the same healthchecks.io check (`HC_PING_URL_MONTHLY`) and
  use the same Gmail secrets.
- **Manual runs.** The workflow has a new `review` input: `auto` (the default), `monthly`, `quarterly` or
  `annual`.
  - `quarterly` or `annual` with an empty month runs the period that just ended. With a month, the month must
    end the quarter or the year.
  - `--force` redoes only the most recent run, so a forced run must name its review. `auto` with force stops with
    an error.
- **Venue check.** It runs with the monthly review only.

## Owner setup

None. No new secrets, config blocks or dependencies.

## Known limits

- **Ledger record type.** `ledger.RECORD_TYPES` has no `quarterly_report` or `annual_report`, and the ledger is not
  in this build's files. The reviews are logged as `monthly_report` with `"review": "quarterly"` or `"annual"`.
  `reports._record_type` switches to the dedicated types automatically once the integrator adds them.
- **M2 position-months are correlated.** The legs of one month share the market's move, so the pooled P is
  somewhat optimistic for M2. The design specifies this unit (§7.3); the per-family table shows M2 on its own.
- **Targets stand in for M2's holdings** in its position-months and sleeve (the no-trade band keeps them within
  25%). Rebalance slippage is left out.
- **The selected-book trade count** is the budget counter, summed over the years up to the period's year. A
  review of an old quarter run late therefore counts later trades of the same year.
- **"Runs on time"** counts runs that completed with status ok. Actual start times are not measured. The hourly
  job is not counted.
- **Phase B shapes.** M4, W8 and W9 trades are read from their `history` (`exit_date`, `return`/`ret`,
  `pnl`/`pnl_usd`/`realized_pnl`). κ̂ and drift use them once their config has `base_rates` with `mean_pct` and
  `win_rate`. Shadow books have labels in `reports.SHADOW_LABELS`, or a `name` in their config block.
- **Wide book.** It includes W10's shadow record at 90 days. v3.3 made W10 a module, and the record is the wide
  book of the same rule. The design's §7.3 list (written before v3.3) names ST-1b, M3 and M2 only.
