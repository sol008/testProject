# Owner decisions

The system is built to these decisions. Update this file whenever a decision changes.

| # | Decision | Answer | Date | Consequence for the design |
|---|---|---|---|---|
| 1 | Holding period | **1 day to 60 days.** Trades must be realized in the short term. | 2026-09-28 | The long-horizon presets and 5-year crash tranches in `00-SYNTHESIS.md` rev. 2 no longer define the trading system. A second research round (tracks 13–18) covers 1–60 day edges, and synthesis rev. 3 rewrites the constitution for them. |
| 2 | Capital at start | **Paper trading first.** | 2026-09-28 | The system sends real emails and scores itself, but no real money is used until pre-agreed pass criteria are met (track 18). |
| 3 | Instruments | **US stocks and ETFs, listed options, futures, Bitcoin ETF, crypto (direct).** | 2026-09-28 | Prediction markets are not selected: they are used only as a data source for implied probabilities. Direct crypto needs a regulated exchange with custody rules (track 09). |
| 4 | Runtime and email | **GitHub Actions + Gmail API.** | 2026-09-28 | The Gmail OAuth app must be published "In production", or refresh tokens expire after 7 days. A Google password change revokes the token (track 09). Needs Claude's GitHub access to `sol008/testProject` fixed and the repository made private. |

## Still open

- Country and US state: tax rules, product access and crypto venues depend on them.
- Approximate capital for sizing. For paper trading, a notional amount is enough (default $100,000 unless told otherwise).
- Account types (taxable vs IRA): the short-term gains from 1–60 day trades are taxed as ordinary income in taxable accounts.
- Go-ahead to build, after synthesis rev. 3.
