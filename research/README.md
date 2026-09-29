# Research dossier — few-trade, high-return recommendation system

Research and design for a system that emails one person a small number of trades, each with a plain-English execution plan, and recalibrates itself every month. **Phase A is built** (the `traderec` package at the repository root; see `../README.md` and `../docs/OPERATIONS.md`) and runs in paper mode.

Research date: 2026-09-28.

**Start here:**
- `00-SYSTEM-DESIGN-v3.md` — the system that will be built: the 1–60 day rule book, portfolio rules, paper-trading gates, architecture, and decisions needed.
- `DECISIONS.md` — the owner's decisions so far.

## Phase 1 — long-horizon research (background)

| # | File | Question it answers |
|---|---|---|
| 00 | `00-SYNTHESIS.md` (rev. 2) | Long-horizon strategy constitution and presets. Still the reference for an optional long-term core held outside the trade system. |
| 01 | `01-greatest-trades-and-blowups.md` | What produced history's largest percentage gains from the fewest decisions, and what ruined the people who tried? |
| 02 | `02-academic-evidence.md` | Which return premia and anomalies survive out of sample, and what destroys retail traders? |
| 03 | `03-sizing-and-growth-math.md` | What does "1000%" require mathematically? Kelly sizing, ruin, simulations. |
| 04 | `04-derivatives-leverage-convexity.md` | When is buying convexity (options, leverage) positive expected value? |
| 05 | `05-special-situations-and-alt-markets.md` | Event-driven, structural and alternative-market edges. |
| 06 | `06-backtests-few-trade-strategies.md` | Real-data backtests of rule-based strategies with very few trades. |
| 07 | `07-multibaggers-and-power-laws.md` | What identified 10–100x winners ahead of time, and what holding them felt like. |
| 08 | `08-current-environment-2026-09.md` | The market regime as of 28 Sep 2026, and the setups on the watch list. |
| 09 | `09-infrastructure-data-email-compliance.md` | Data sources, email delivery, scheduling, the LLM layer, broker and regulatory constraints. |
| 10 | `10-calibration-and-self-improvement.md` | How the monthly calibration loop improves the system without overfitting. |
| 11 | `11-trade-email-spec.md` | Exactly what each trade email contains. |
| 12 | `12-red-team-review.md` | Adversarial review of the phase-1 synthesis; its findings are fixed in rev. 2. |

## Phase 2 — the 1–60 day horizon the owner chose

| # | File | Question it answers |
|---|---|---|
| 13 | `13-short-horizon-index-etf-rules.md` | Which index/ETF rules with 1–60 day holds have a persistent edge after costs? Only the VIX-gated uptrend dip-buy (ST-1). |
| 14 | `14-short-horizon-options-vol.md` | Which option structures work for 1–60 day trades? The crash call spread (O2); put spreads are paper only; buying options into events loses. |
| 15 | `15-short-horizon-futures-crypto.md` | Futures and crypto with 1–60 day holds. Only slow multi-asset trend survives; crypto trend is a risk control. |
| 16 | `16-short-horizon-event-driven.md` | Event-driven single-stock catalysts. None survives for a follower acting the next day; shadow ledger only. |
| 17 | `17-short-horizon-macro-events.md` | Macro and geopolitical event trades, and the 60-day watch list from 28 Sep 2026. |
| 18 | `18-short-horizon-execution-sizing-paper.md` | Sizing, execution, taxes, the paper-trading protocol and the go-live gates for short-horizon trades. |
| 19 | `19-red-team-v3.md` | Adversarial review of the v3 design. |
| 20 | `20-executability-check.md` | Can a typical Robinhood/Coinbase user place every trade? Three order kinds only; the depeg and cash-and-carry modules moved to shadow. |
| 21 | `21-duration-cap-existing-modules.md` | What a 90- or 120-day cap does to the existing modules: ≈+0.2 points a year at 90 days (W10 at 63 sessions, M4 at 90 DTE), nothing more at 120. Also re-prices M4 with a next-day entry (≈0 at 60 days). |
| 22 | `22-duration-cap-new-strategies.md` | Which new strategies a longer cap would allow: only the uptrend-shock buy (W10), ≈+0.07 points; everything else is drift or too few episodes. Don't loosen globally. |

## Reproducing the numbers

Code for each track lives in `code/<track>/` and runs with Python 3.11 plus `pandas numpy scipy statsmodels yfinance matplotlib requests xlrd openpyxl`. The scripts behind the phase-1 synthesis's own numbers are in `code/00-synthesis/`.

**Nothing in this folder is individualized financial advice.** It is research for the owner's personal use. Every strategy described here can lose money, including all of the capital committed to it.
