# Research dossier — few-trade, high-return recommendation system

Phase 1 (research and design) for a system that emails one person a small number of high-conviction trades, each with a plain-English execution plan, and recalibrates itself at the end of every month. The tool itself has **not** been built yet; building starts once the open decisions in `00-SYNTHESIS.md` are settled.

Research date: 2026-09-28.

| # | File | Question it answers |
|---|---|---|
| 00 | `00-SYNTHESIS.md` | What should the system do, and why? Strategy constitution v0, architecture, open decisions. |
| 01 | `01-greatest-trades-and-blowups.md` | What produced history's largest percentage gains from the fewest decisions, and what ruined the people who tried? |
| 02 | `02-academic-evidence.md` | Which return premia and anomalies survive out of sample, and what destroys retail traders? |
| 03 | `03-sizing-and-growth-math.md` | What does "1000%" require mathematically? Kelly sizing, ruin, simulations. |
| 04 | `04-derivatives-leverage-convexity.md` | When is buying convexity (options, leverage) positive expected value? |
| 05 | `05-special-situations-and-alt-markets.md` | Event-driven, structural and alternative-market edges accessible to one person. |
| 06 | `06-backtests-few-trade-strategies.md` | Real-data backtests of rule-based strategies with very few trades. |
| 07 | `07-multibaggers-and-power-laws.md` | What identified 10–100x winners ahead of time, and what holding them felt like. |
| 08 | `08-current-environment-2026-09.md` | The market regime as of 28 Sep 2026, and the setups on the watch list. |
| 09 | `09-infrastructure-data-email-compliance.md` | Data sources, email delivery, scheduling, the LLM layer, broker and regulatory constraints. |
| 10 | `10-calibration-and-self-improvement.md` | How the monthly calibration loop improves the system without overfitting. |
| 11 | `11-trade-email-spec.md` | Exactly what each trade email contains. |

Code used for the analyses lives in `code/<track>/` and can be re-run with Python 3.11 plus `pandas numpy scipy statsmodels yfinance matplotlib requests xlrd openpyxl`.

**Nothing in this folder is individualized financial advice.** It is research for the owner's personal use. Every strategy described here can lose money, including all of the capital committed to it.
