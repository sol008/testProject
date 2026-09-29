# Owner decisions

The system is built to these decisions. Update this file whenever a decision changes.

| # | Decision | Answer | Date | Consequence for the design |
|---|---|---|---|---|
| 1 | Holding period | **1 day to 60 days**; trades are realized in the short term | 2026-09-28 | The long-horizon presets in `00-SYNTHESIS.md` rev. 2 don't define the trading system. The second research round (tracks 13–18) led to `00-SYSTEM-DESIGN-v3.md` |
| 2 | Capital at start | **Paper trading first** | 2026-09-28 | Real emails and self-scoring; no real money until the §7 gates pass |
| 3 | Instruments | **US stocks and ETFs, listed options, futures, Bitcoin ETF, crypto (direct)** | 2026-09-28 | Futures unused below ≈$280k–$800k; prediction markets are a data source only |
| 4 | Runtime and email | **GitHub Actions + Gmail API** | 2026-09-28 | The Gmail OAuth app must be "In production", or tokens expire in 7 days. Dry-run mode until the credential exists |
| 5 | What "60 days" means | **Calendar days; a monthly re-decided trend position may continue** | 2026-09-29 | W10 (crash day) stays in the shadow ledger |
| 6 | Trend book (M2) | **Long-only ETF8** (SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA) in the IRA | 2026-09-29 | No shorts, no gross above 1.0× |
| 7 | Accounts | **IRA, taxable margin with options (spreads), a Robinhood account with full options, Coinbase for crypto** | 2026-09-29 | ETFs/IBIT in the Robinhood IRA; option spreads in the Robinhood taxable account (IRAs are Level 2 only); Coinbase optional. Paper split $70k IRA / $30k taxable |
| 8 | Approvals | **Policy-module exemptions (M1, M3, M4, W8); trade cap 100 a year; ST-1 at 6%** | 2026-09-29 | As in v3.2 §4 |
| 9 | Go-ahead | **Start Phase A after a check that every trade is easy for a typical r/wallstreetbets trader on Robinhood/Coinbase** | 2026-09-29 | Check done (`20-executability-check.md`): the depeg and cash-and-carry modules moved to shadow; three order kinds only; ≤3 orders per email; spreads closed ≥1 trading day before expiry |
| 10 | GitHub access | Claude GitHub App granted on `sol008/testProject` | 2026-09-29 | Pushes from cloud sessions work |
| 11 | Build-time reading of #5 for M3 | The weekly re-decided Bitcoin switch is a trend position, so it **continues while on** (no forced 60-day close and re-entry) | 2026-09-29 | Design §3 M3 "Holding" updated; fewer orders, same exposure. Revert by restoring the forced close if you read #5 differently |

## Still open (not blocking)

- Country and US state (the design assumes US).
- Gmail OAuth credential ("In production").
- A long-horizon core outside the system.
- In-app confirmations:
  - Level 3 and index options on the taxable account;
  - one-off dollar orders in the IRA;
  - whether the IRA is at Robinhood.
