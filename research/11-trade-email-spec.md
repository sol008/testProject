# 11 — Trade email specification (v0)

What every email from the system looks like, so that one person with a brokerage app and ten minutes can execute each trade correctly, understand why they are doing it, and know in advance exactly how they will get out.

## TL;DR

- One email = one decision. There are four kinds: **NEW TRADE**, **ADJUST**, **EXIT**, and the **MONTHLY REVIEW**. An optional **HEADS-UP** email (a setup is close to triggering; get cash or permissions ready) is off by default to keep inbox noise minimal.
- Plain English first, numbers second. Every piece of jargon is explained the first time it appears.
- Every NEW TRADE email carries its complete, pre-committed exit plan (profit-taking, invalidation, and a time stop). Exits are never improvised later.
- The odds are shown prominently, including the chance of losing money and the maximum possible loss in dollars.
- Size is stated three ways: % of portfolio, dollars, and units (shares or contracts) for the portfolio value on file.
- Every number is traceable to a timestamped data snapshot. The language model writes the prose; it never produces a number that the data layer did not supply (enforced by an automated check before sending).
- Each email ends with a machine-readable block that feeds the ledger and the monthly calibration.

## 1. Design principles

1. **Executable standalone.** The email alone is enough to place the order: exact instrument identifier, order type, limit price, walk-away price, quantity, and the time window.
2. **Pre-commitment beats willpower.** The entry email states the exit rules. The system later sends an EXIT email when a rule fires; the user should not need to make judgment calls under stress.
3. **Honest odds.** Probabilities for each scenario are shown, sum to 100%, and are recorded in the ledger so the monthly review can score them.
4. **Defined risk by default.** The headline box always shows the maximum loss. Undefined-risk structures (naked short options, uncapped shorts) are not recommended in v0.
5. **Few, important emails.** The system is built to send few trades. If a month has no trade worth taking, the monthly review says so explicitly.
6. **Traceability.** Trade ID, strategy archetype, constitution version, data snapshot time, and forecast IDs appear in the footer.

## 2. Email types

| Type | Sent when | Subject prefix |
|---|---|---|
| NEW TRADE | A setup passes all gates | `[TRADE #NNN]` |
| ADJUST | Add-on tranche triggers, stop/target changes, partial take-profit | `[ADJUST #NNN]` |
| EXIT | A profit, invalidation or time rule fires, or the thesis breaks | `[EXIT #NNN]` |
| MONTHLY REVIEW | First business day of each month | `[MONTHLY] <Month YYYY>` |
| HEADS-UP (optional, default off) | A watch-list setup is within a set distance of its trigger | `[HEADS-UP]` |

## 3. Subject line

Format: `[TRADE #NNN] <ACTION> <instrument> — <archetype> — risk <x>% — act by <day date time TZ>`

Example: `[TRADE #007] BUY SPY Dec-2021 $230 call — crash rebound — risk 3% — act by Mon 23 Mar, 4pm ET`

Rules: under ~110 characters, no "!!!", no all-caps words beyond the tag, no "guaranteed" or similar spam-trigger phrases.

## 4. NEW TRADE body (sections in order)

```
┌────────────────────────────────────────────────────────────┐
│ ACTION     {{BUY/SELL}} {{instrument_plain}}                 │
│ SIZE       {{pct}}% of portfolio ≈ ${{dollars}} = {{units}}  │
│ MAX LOSS   ${{max_loss}} ({{max_loss_pct}}% of portfolio)    │
│ WINDOW     Place by {{deadline}}; skip if price outside band │
│ ODDS       {{p_profit}}% chance of profit · {{p_big}}% chance│
│            of ≥{{big_multiple}}x · {{p_total_loss}}% chance  │
│            of losing most or all of the stake                │
│ CONFIDENCE {{confidence_label}} ({{archetype}}, {{n_analogs}}│
│            historical analogs)                               │
└────────────────────────────────────────────────────────────┘
```

1. **In one sentence.** What the trade is and what has to happen for it to pay. No jargon.
2. **Do this.** A numbered order ticket:
   - Account and permission needed (e.g., "options level 2; no margin needed").
   - Instrument: plain name, ticker, and exact identifier (OCC option symbol, futures contract month, or crypto pair and venue).
   - Action (`BUY TO OPEN`, `SELL TO CLOSE`, …), quantity, order type (limit), time-in-force (day).
   - **Limit price** and **walk-away price**, with the working rule. Standard options rule: start at the mid-price; if unfilled after 10 minutes, raise by a quarter of the bid-ask spread; never pay above the walk-away price.
   - **Entry band.** If the underlying is outside `{{band_low}}–{{band_high}}` when you place the order, do not trade. Comment "skipped" on the trade's GitHub issue; the ledger records it either way.
   - **Recording fills.** Comment `filled <qty> @ <price>` or `skipped` on the GitHub issue linked in the footer. There is no inbound email path. Act only on emails whose issue link and hash match the ledger.
   - Staged entries, if any: "Tranche 1 now (1/3). Tranche 2 only if an ADJUST email arrives."
   - Timing advice (avoid the first 15 minutes after the open and the last 10 minutes before the close for options and thin stocks).
3. **How you get out (decided now).**
   - Profit-taking: e.g., "Sell half when the option is worth ≥ 2.5× what you paid; hold the rest until the time stop or the trailing rule."
   - Invalidation: the observable condition that means the thesis is wrong (e.g., "S&P 500 closes below 1,800" or "the deal is terminated").
   - Time stop: the date by which the trade must have worked.
   - "You will receive an EXIT email when any of these fire. You do not need to watch the screen."
4. **Why this trade.** Four to eight plain-English sentences: what the market is mispricing, why (the structural reason: forced sellers, a policy constraint, fear, a known bias), the catalyst, and the historical analogs.
5. **The odds.** Scenario table with probability, what happens, result in % of stake, and result in % of portfolio. Also: expected value after costs, and the base rate from the historical analogs ("In X of Y comparable episodes since 1928, …").
6. **What would prove us wrong.** Two to four specific, observable kill criteria (a pre-mortem).
7. **Risks you should know.** Maximum loss; overlap with open positions ("your total stock-market exposure becomes 38%"); liquidity; overnight gap risk; scheduled events (earnings, FOMC, elections); tax treatment (short-term vs long-term; Section 1256 where relevant).
8. **Your portfolio after this trade.** Table of open positions, cash, and total capital at risk versus the risk budget.
9. **Pre-flight checklist.** Price inside the entry band · permission level confirmed · order is a LIMIT order · quantity matches · this is risk capital.
10. **Glossary.** Only the terms used in this email, one line each.
11. **Footer.** Trade ID, archetype, constitution version, data-snapshot timestamp and sources, forecast IDs, a one-line disclaimer ("Automated research generated for your personal use. It is not individualized advice from a licensed professional; you decide and you are responsible for every trade."), and the machine-readable block below.

### Machine-readable block (plain-text part, and as a `.json` attachment)

This example matches the worked example in `00-SYNTHESIS.md` §7:

```json
{
  "trade_id": "T-2020-002",
  "github_issue": 2,
  "email_type": "NEW_TRADE",
  "constitution_version": "v0.2",
  "archetype": "crash_tranche",
  "sleeve": "S2",
  "instrument": {"type": "etf", "ticker": "SPY", "whitelisted": true},
  "action": "BUY",
  "size": {"pct_portfolio": 4.1, "dollars": 8923, "units": 39, "rule": "20% of reserve at episode start"},
  "entry": {"order": "LIMIT", "limit_rule": "last + 0.50", "walk_away": 245.00, "band_underlying": [205, 245], "deadline_utc": "2020-03-23T20:00:00Z"},
  "exits": {
    "take_profit": [{"rule": "SPX close >= 3386.15", "fraction": 1.0}],
    "invalidation": null,
    "time_stop": {"date": "2025-03-20", "action": "merge_into_core"}
  },
  "stress": {"planning_pct": -50, "planning_usd": -4462, "worst_analog_pct": -78.5, "worst_analog_usd": -7005},
  "forecasts": [
    {"id": "F-2020-002-a", "question": "SPX close on 2021-03-19 > 2304.92", "p": 0.50, "base_rate": "3/6"},
    {"id": "F-2020-002-b", "question": "SPX close on 2023-03-20 > 2304.92", "p": 0.75, "base_rate": "5/6"},
    {"id": "F-2020-002-c", "question": "SPX closes >= 3386.15 by 2025-03-20", "p": 0.50, "base_rate": "3/6"},
    {"id": "F-2020-002-d", "question": "SPX closes <= 2031.69 before the tranche exits", "p": 0.625, "base_rate": "4/6"},
    {"id": "F-2020-002-e", "question": "SPX closes <= 1693.08 before the tranche exits", "p": 0.375, "base_rate": "2/6"}
  ],
  "data_snapshot": {"as_of_utc": "2020-03-20T21:00:00Z", "sources": ["yfinance:^GSPC", "yfinance:SPY", "yfinance:^VIX"], "sha256": "9f2c…"}
}
```

Probabilities are Laplace-smoothed from the raw counts shown in `base_rate`.

## 5. ADJUST and EXIT bodies

**ADJUST** — headline box (what changes, new size, new maximum loss), the one-sentence reason, the order ticket, and the updated exit plan.

**EXIT** — headline box (`SELL TO CLOSE`, quantity, limit and walk-away), which rule fired, the result so far in % and $, a two-to-four sentence plain-English post-mortem draft ("what we expected / what happened / luck or skill?"), and a ledger block with realized P&L. If the user holds the position differently from the ledger (partial fills, skipped), the email asks them to comment their actual fill on the trade's GitHub issue so the ledger can be corrected. The monthly review also reconciles the ledger against a broker holdings export.

## 6. Standard execution playbooks (inserted verbatim by instrument)

| Instrument | Standard text |
|---|---|
| US stocks / ETFs | Limit order at or slightly above the last price, within the entry band. Avoid the first 15 minutes after the open. For positions larger than ~1% of average daily volume, split across the day. |
| US listed options | Use the exact OCC symbol. Limit at mid; walk up by a quarter of the spread every 10 minutes; never above the walk-away price. Minimum liquidity gates (track 04): open interest ≥ 500 contracts; bid-ask spread ≤ 2% of the mid for expiries of 6 months or more, ≤ 5% for shorter ones (≤ 10% only for hedges). Options expire; the time stop is always set before the final 60 days unless explicitly stated. |
| Crypto spot | Prefer a spot ETF in your brokerage account for simplicity and tax reporting, or a major regulated exchange with a limit order. Never use exchange leverage in v0. |
| Micro futures | Only if futures permission exists. Contract month stated explicitly; roll date stated; margin shown; defined stop always attached. |
| Prediction markets | Regulated venue only (availability depends on your state). Limit order; the email states the exact resolution rules and the fee drag. |
| Tender offers / corporate actions | The action is an *election* through your broker (often by phone or a web form) with a deadline earlier than the offer's expiry; the email lists the broker's likely cut-off. |

## 7. Automated quality gates (all must pass before sending)

1. Every number in the email matches the data snapshot (automated diff between the rendered email and the snapshot).
2. The underlying is still inside the entry band at send time.
3. Size ≤ per-trade cap; total capital at risk ≤ portfolio risk budget; correlated-cluster cap respected.
4. Options: liquidity gates pass; implied volatility check passes (see track 04).
5. Scenario probabilities sum to 100%; kill criteria, time stop and maximum loss are present.
6. No conflict with an open position (no accidental doubling or hedging-away).
7. Readability: short sentences; every jargon term appears in the glossary.
8. Rendered as multipart (plain text + simple HTML), no images required to understand it, no link shorteners.

## 8. Worked example

A full example email is in `00-SYNTHESIS.md` §7: a replay of the 20 March 2020 crash-tranche setup, using pre-2020 base rates rather than hindsight.
