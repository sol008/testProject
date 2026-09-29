# traderec

A small, rule-based trade recommendation system for one person. Every weekday evening it runs on GitHub Actions and checks a few pre-registered rules against the day's closing prices. When a rule fires, it emails plain-English instructions for placing the order in the Robinhood app the next morning. It starts in paper mode.

## What it does

- **Few, pre-committed, evidence-gated trades.** Only rules that survived out-of-sample testing are traded, each with a measured edge and a fixed exit decided in advance.

  | Module | What it does | Venue |
  |---|---|---|
  | **M1** | VIX-gated uptrend dip-buy in SPY (policy module) | Robinhood IRA |
  | **M2** | Slow multi-asset trend book, long-only (SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA), rebalanced monthly | Robinhood IRA |
  | **M3** | Weekly Bitcoin trend switch | IBIT in the Robinhood IRA |
  | **W10** | Uptrend crash-day buy: SPY after the first −3% S&P day in an uptrend, sold at the last session within 90 calendar days (policy module, 90-day exception) | Robinhood IRA |
  | Shadow book | Near-miss variants and every uptrend −3% day scored at 60 and 90 days, logged but never emailed | — |

  - That is about 20 trades a year, including the 12 monthly rebalances. W10 fires about once every two years.
  - Every trade closes within 60 calendar days. The exceptions are W10 (90 days) and the continuing trend positions (M2, M3), per decision 12. The research on 60 vs 90 vs 120 days is in `research/21`–`24`.
  - Option spreads (M4, W8) come in Phase B.
- **Sized and capped by fixed rules:**
  - per-trade and total stress caps;
  - a drawdown governor;
  - a hard budget of 100 trades a year.
- **Honest records.**
  - Every decision goes into an append-only, hash-chained ledger *before* its outcome is known, with pre-registered forecasts that are scored later.
  - A monthly review reports results, operations and evidence, failures first.
- **Plain-English emails.** Each one has:
  - a headline box;
  - the exact taps in Robinhood (at most 7);
  - what to do if something is off;
  - how you get out.

  Every number is checked against the data before an email is sent, and fills are recorded as comments on the trade's GitHub issue.
- **Paper first.** A paper broker fills every order at the next open with a frozen fill model. Real money only after the go-live gates in design §7 pass, then in stages: 25% → 50% → 100% size.

## Honest expectations

Read this before anything else (design §0 and §6):

- **The realistic result is T-bills (about 4.2%) plus roughly 0–2 points a year before tax.**
  - The central estimate for the book being built (M1, M2, M3 and W10) is about +0.8 points: **about 5.0% a year**. Without the trend book it is about 4.4% (track 23).
  - SPY returned about 10% a year historically (10.3% over 1928–2026, 11.3% over 2008–2026), with −52% to −55% drawdowns. The forward-looking range at today's valuations is about 3–6%.
  - Drawdowns should stay around 10–15%.
- **Short holding periods give up most of the stock market's return.** Over 2008–2026, holding SPY earned 11.3% a year with a −52% worst drawdown. The best short-horizon rule on its own earned about 4.7% with a −14% drawdown.
- **"1000%" is not reachable with 1–60 day trades without risking ruin.**
  - At about 5% a year, 11× takes about 48–49 years before tax.
  - Loosening the holding cap is not a lever: 90 days adds ≈+0.04 points now (W10 only), and 120 days adds nothing (research tracks 21–24).
  - The biggest lever for large long-run gains is a long-horizon core held *outside* this system.
- **Reaching full size takes years of evidence:** about 4–5 years with the trend book, about 9 without. The paper phase exists to measure the true number.

What makes the system worth having: it takes the few trades with measured edges, refuses the many that lose money, and keeps an honest, scored record of whether any of it works.

## Quick start

Python 3.11 or later:

```bash
pip install -r requirements.txt
python -m traderec init               # creates state/state.json and an empty ledger
python -m traderec daily --dry-run    # live data, the rules, any email written to state/outbox/ as .eml
python -m pytest -q                   # the offline test suite
```

Notes on the dry run:
- It works on a copy of the state and sends nothing.
- Before about 18:00 ET, today's session isn't final, so add `--date <previous trading day>`.
- Don't commit or push a local `state/` folder. The scheduled workflows own `state/` on `master`.

| Command | What it does |
|---|---|
| `python -m traderec init [--nav 100000] [--if-missing]` | Create the state and an empty ledger |
| `python -m traderec daily [--date D] [--dry-run] [--force]` | The evening run: fills, marks, M1/M2/M3, emails |
| `python -m traderec weekly [--date D] [--dry-run] [--force]` | The Bitcoin switch (Sunday night ET) |
| `python -m traderec monthly [--month YYYY-MM] [--dry-run] [--force]` | The monthly review email |
| `python -m traderec verify-ledger` | Recompute the ledger's hash chain |
| `python -m traderec status` | Print the paper book |

## Running it for real

Follow **[docs/OPERATIONS.md](docs/OPERATIONS.md)**. It covers:
- making the repository private and merging to `master`;
- the GitHub secrets;
- the Gmail OAuth credential;
- the healthchecks.io alarms;
- the first dry run;
- the Robinhood checklist and how to record fills;
- going live, and troubleshooting.

**The schedule** (GitHub Actions, UTC cron; each evening job has a second slot an hour later as a retry):

| Workflow | Runs | Purpose |
|---|---|---|
| `daily` | Mon–Fri evenings, about 22:17 ET (21:17 in winter) | Evening run |
| `weekly` | Sunday evening ET | Bitcoin switch |
| `monthly` | The 1st of the month | Review and venue re-check |
| `ci` | Every push and pull request | Tests |

## Documentation

- [docs/OPERATIONS.md](docs/OPERATIONS.md): the owner's step-by-step guide.
- [docs/INTERFACES.md](docs/INTERFACES.md): the component contracts.
- [research/00-SYSTEM-DESIGN-v3.md](research/00-SYSTEM-DESIGN-v3.md): the system design (v3.2), with the rule book, portfolio rules, go-live gates and architecture.
- [research/README.md](research/README.md): the research dossier behind it.
- [research/DECISIONS.md](research/DECISIONS.md): the owner's decisions.

## Repository layout

```
traderec/            the package: data, modules (M1-M3, shadow), risk, paper broker, ledger, emails, pipeline, CLI
config/              account.yaml (accounts, paper/live), constitution.yaml (the rules, v3.2), whitelist.yaml
state/               written by the workflows: state.json, ledger.jsonl, pre_run.json, outbox/
tests/               offline tests with fake data providers
scripts/             gmail_oauth_setup.py (the one-time Gmail credential)
.github/workflows/   daily, weekly, monthly, ci
docs/                OPERATIONS.md, INTERFACES.md
research/            the research dossier and the design
```

## Disclaimer

**Automated research generated for your personal use. It is not individualized advice from a licensed professional; you decide and you are responsible for every trade.**

- Every strategy here can lose money, including all of the capital committed to it.
- Backtests and paper results don't guarantee future results.
- **Personal use only.** Don't forward or publish the emails. Doing so, especially for pay, can bring investment-adviser rules into play. The market-data terms are also personal-use only.
- The system and its research were built with AI assistance (Claude).
