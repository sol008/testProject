# Research dossier — few-trade, high-return recommendation system

Research and design for a system that emails one person a small number of trades, each with a plain-English execution plan, and recalibrates itself every month. **Phase A is built on design v3.3** (the `traderec` package at the repository root; see `../README.md` and `../docs/OPERATIONS.md`) and runs in paper mode. The first build was reverted so the holding-cap research (tracks 21–24) could come first.

Research date: 2026-09-28.

**Start here:**
- `00-SYSTEM-DESIGN-v4.md` — the growth book (29 Sep 2026): what changes for the new objective, "the largest return at a reasonable risk", with one Sunday email a week. Its numbers are in `38-growth-book-synthesis.md`.
- `00-SYSTEM-DESIGN-v3.md` — the system as built (Phases A and B, paper mode): the 1–60 day rule book, portfolio rules, paper-trading gates, architecture, and decisions taken. v4 says what changes; v3.3 stays the record of the current build.
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
| 23 | `23-duration-cap-verification.md` | Independent replication and red-team of tracks 21–22. W10 replicates exactly, but it is worth only +0.04 points a year now (≈+0.1 with M4). It fixes the exit (calendar-exact), size (6%), cluster (7%) and kill switch. Verdict: a 90-day exception for W10 only. |
| 24 | `24-duration-cap-gap-search.md` | Families tracks 21–22 skipped (merger arb, longer-dated option premium, sector momentum, earnings drift, CEF and index effects, and others). 380 variants; none gains from 90 or 120 days. Two new shadow candidates. |

## Phase 3 — the growth objective: the largest return at a reasonable risk, one recommendation a week (29 Sep 2026)

The owner's objective changed on 29 Sep 2026 from "1–60 day trades" to "exceed SPY by a large margin", then, after track 34, to "the largest return with a reasonable risk tolerance". Tracks 26–37 test every candidate; track 38 synthesises them into the growth-book design, `00-SYSTEM-DESIGN-v4.md`. v3.3 stays as the record of the current build.

| # | File | Question it answers |
|---|---|---|
| 26 | `26-leveraged-trend-core.md` | Can 2× or 3× the index, held only above its 200-day average (weekly, 2% band, T-bills when out), beat SPY by a large margin? Historically yes (3× S&P +6.5 points since 1929, −92% worst drawdown); forward, at CAPE 41 and 4.2% T-bills, no (3× median 2.6%, 81% chance of a −50% drawdown). 2× (SSO) on paper at most; 3× and Nasdaq-100 leverage rejected as a core. |
| 27 | `27-momentum-rotation.md` | ETF momentum and relative-strength rotation, weekly or monthly, 3,030 variants. Unlevered crypto-free rotation lost to SPY out of sample in every universe; the winners were the asset list (SMH, Bitcoin) or leverage. Rotation stays on the never-list; leveraged rotation is added to it. |
| 28 | `28-crypto-aggressive.md` | An aggressive crypto sleeve decided once a week. Bitcoin above its 10-week and 200-day averages via IBIT in the IRA, 30% of NAV (half Kelly; 50% ceiling): +13 points over SPY in 2014–26, +1.5 to +4 forward. 2× Bitcoin ETFs bleed 13–19% a year; rejected. |
| 29 | `29-single-stock-momentum.md` | Concentrated single-stock momentum with one new pick a week. Bias-free large-cap momentum is worth +1 to +3 points and fading; the weekly book's +3.9 raw is about +2 after survivorship bias and rides one regime (2024–26); leverage turns it into ruin risk. Not credible. |
| 30 | `30-options-leverage.md` | Options as the leverage vehicle for a trend-filtered core. Rolled deep in-the-money calls cost 1.3–5% a year per unit of exposure and at best tie a leveraged ETF; their one advantage is a partial floor on a crash day. Leveraged ETFs in the IRA are the vehicle. |
| 31 | `31-growth-portfolio.md` | How to combine sleeves and size leverage for maximum long-run growth (Kelly under model uncertainty, block-bootstrap outcome distributions, cadence, the drawdown governor, taxes). Book C (40% SSO + 40% QLD with weekly 200-day filters, 20% Bitcoin switch) with a wide governor: about 7% a year forward, about 29% if the last decade repeats. Its simulator is reused by track 38. |
| 32 | `32-venues-tax-cadence.md` | What can actually be executed at Robinhood and Coinbase, what taxes and IRA rules cost, and how one Sunday email with at most 3 orders works. Every switching sleeve belongs in the IRA with limited margin; "out" means SGOV; a proposed exit-only mid-week exception (Rule E). |
| 33 | `33-strategy-zoo.md` | The strategy zoo: every system type simulated and ranked by annual return against the 100% and 1000% targets. **In progress on its own branch; its row and its numbers are added to 38 §10 when it lands.** |
| 34 | `34-hundred-percent-feasibility.md` | Is 100% a year feasible? It needs a sustained Sharpe ratio above 1.1 at full Kelly; nobody has done it for a decade (Medallion net 38%); the aggressive systems reach it in 0–0.1% of decades. The objective becomes "maximise growth subject to a drawdown limit the owner chooses". |
| 35 | `35-gems-census.md` | A census of 63 documented, episodic or structural mispricings across markets and history (crypto-trust discounts, SPAC floors, CEF crashes, claims, airdrops, prediction markets, foreign discounts, "free money"), with four empirical checks. Five are worth building; combined they add about +3 points a year (+10 in a crash year), not "SPY by a large margin". |
| 36 | `36-century-view.md` | 150 years, 16 countries, four asset classes: the best thing to own each decade, whether momentum could have picked it (no: 1 hit in 14), and a "ride the strongest asset on Earth" meta-rule (7.7% vs 9.0% for US stocks; every 2× variant ruined). No new module. |
| 37 | `37-llm-information-edge.md` | Is there a gem in an LLM reading the world? The documented edge is next-day, long-short, small-cap and fading; for one weekly long-only pick it is −2.0 to +0.8 points a year. Veto-only stays; a cheap pre-registered shadow test is specified. |
| 38 | `38-growth-book-synthesis.md` | The synthesis: maximise expected log growth subject to P(10-year drawdown > D) ≤ 10% for D = 30/40/50% under three belief sets; the allocation frontier, the sensitivities, a ranked table of every alternative, and the growth book behind `00-SYSTEM-DESIGN-v4.md`. Code: `code/38-growth-book/` (reuses track 31's engine). |

## Reproducing the numbers

Code for each track lives in `code/<track>/` and runs with Python 3.11 plus `pandas numpy scipy statsmodels yfinance matplotlib requests xlrd openpyxl`. The scripts behind the phase-1 synthesis's own numbers are in `code/00-synthesis/`.

**Nothing in this folder is individualized financial advice.** It is research for the owner's personal use. Every strategy described here can lose money, including all of the capital committed to it.
