# 20 — Executability check: can a typical r/wallstreetbets trader place every trade on Robinhood or Coinbase?

*29 September 2026. The owner asked for this check before implementation. It covers every module in `00-SYSTEM-DESIGN-v3.md` (v3.1) against the owner's venues: Robinhood (an IRA and a taxable margin account, with options enabled) and Coinbase (crypto).*

## TL;DR

- **Every instrument the design uses is tradable on Robinhood** and accepts dollar-amount (fractional) orders in regular hours. That covers SPY, VOO, QQQ, IEF, GLD, USO, FXE, FXY, FXA, IBIT, FBTC, DAL, TLT, BNO and SGOV/BIL. All of them also have listed options.
- **Index options are available on Robinhood**, including XSP (mini-SPX) and SPX, so the XSP spreads are placeable.
- **Robinhood IRAs allow Level 2 options only:** long calls and puts, covered calls, cash-secured puts. **No spreads.** Every option spread therefore goes in the taxable Robinhood account (Level 3 plus index options). The IRA holds the ETF trades.
- **"Buy at the next open" needs no special order type.** Robinhood queues any market order placed outside regular hours for the 9:30 ET open. Its overnight (24-hour) market accepts only limit orders, so a market order can't fill overnight by accident.
- **Robinhood auto-closes "at-risk" expiring equity and ETF options from 3:30 PM ET on expiration day** (not index options). Rule adopted: close every spread at least one trading day before expiration.
- **Coinbase has live BTC-USD and ETH-USD markets but no USDC-USD market** (USDC converts 1:1). The stablecoin-depeg buy can't be executed there, so it moves to the shadow ledger.
- **Four things were not WSB-friendly and are removed or simplified:**
  - bracket/OCO and market-on-close orders;
  - multi-step option limit ladders;
  - the depeg and cash-and-carry modules;
  - up to 8 ETF orders a month (now at most 3, thanks to a no-trade band).
- **Result:** every live-eligible trade is 1–3 orders of three kinds:
  - a market order in dollars;
  - a two-leg option spread at one net limit price;
  - (optionally) a Coinbase market buy in dollars.

## 1. What was checked, and how

| Check | Method | Result |
|---|---|---|
| Robinhood tradability, dollar orders, 24-hour eligibility and option chains per ticker | Robinhood's public instruments API (`code/20-executability/check_venues.py` → `venue_check.json`) | All 17 tickers tradable and fractional-tradable. Options listed on all. 24-hour market: SPY, VOO, QQQ, GLD, USO, IBIT, FBTC, DAL, TLT, SGOV, BIL (not IEF, FXE, FXY, FXA, BNO, DBMF) |
| Coinbase spot products | Coinbase Exchange public products API | BTC-USD and ETH-USD online. USDT-USD online. **No USDC-USD book.** BTC-USDC delisted |
| Robinhood index options | [Robinhood: What are XSP options?](https://robinhood.com/us/en/learn/articles/what-are-xsp-options/), [Robinhood: Index options](https://robinhood.com/us/en/support/articles/index-options), [Cboe press release](https://ir.cboe.com/news/news-details/2024/Robinhood-to-Offer-Cboes-Index-Options-Expanding-Retail-Access/default.aspx) | SPX, XSP, VIX, RUT and NDX options available in the app |
| Options in Robinhood IRAs | [Robinhood: Options in Robinhood Retirement](https://robinhood.com/us/en/support/articles/options-in-robinhood-retirement/) | Level 2 only; **vertical spreads not available**; options must be enabled per account |
| After-hours market orders | [Robinhood: Extended-hours trading](https://robinhood.com/us/en/support/articles/extendedhours-trading/) | Market orders placed outside regular hours are **queued for the regular open**; the 24-hour market is limit-only |
| Expiration-day handling | [Robinhood: Options trading hours](https://robinhood.com/us/en/support/articles/options-trading-hours), [Expiration, exercise, and assignment](https://robinhood.com/us/en/support/articles/expiration-exercise-and-assignment) | At-risk expiring equity/ETF options closed from 3:30 PM ET (3:45 for late-close); index options excluded |
| Fractional shares in IRAs | [Robinhood: Fractional shares](https://robinhood.com/us/en/support/articles/fractional-shares), [Retirement investing](https://robinhood.com/us/en/support/articles/retirement-investing/) | Dollar or share amounts; recurring investments in IRAs buy fractions. **[verify in app]** that one-off dollar orders are enabled in your IRA |

## 2. Module by module

| Module | Where | What you do in the app | Orders | Verdict |
|---|---|---|---|---|
| M1 dip-buy (SPY) | Robinhood IRA | Evening: Search SPY → Trade → Buy → Market → Dollars → amount → Review → Submit (it queues for 9:30). Exit: the same with Sell, after the EXIT email | 1 in, 1 out | **Easy** |
| M2 trend book (long-only ETF8) | Robinhood IRA | Monthly: 0–3 market orders in dollars from a table (buy/sell ticker, amount). Adjustments under 25% of a target or $300 are skipped | ≤3 a month (was up to 8) | **Easy after the no-trade band** |
| M3 Bitcoin switch | Robinhood IRA (IBIT), default; Coinbase (BTC) optional | IBIT: market order in dollars, queued for the open. Coinbase: Buy → BTC → amount → Buy now (24/7) | 1 in, 1 out | **Easy** |
| M4 crash call spread (O2) | Robinhood taxable (Level 3 + index options) | Search XSP → Trade Options → expiry → strategy "Call debit spread" (buy lower strike, sell higher) → contracts → limit (net debit) → Review. Place after 10:00 ET; if not filled by 11:00, cancel and re-enter once at the "max" price; otherwise skip. Sell to close ≥1 trading day before expiry | 1 spread in, 1 out | **Easy (for someone with Level 3); the email shows both strikes and prices** |
| M5 W8 de-escalation spreads | Robinhood taxable | The same as M4, on SPY, XSP or DAL | 1 in, 1 out | **Easy** |
| M5 W9 oil call spread (paper) | Robinhood taxable | The same as M4, on USO | 1 in, 1 out | Easy, but USO options are wide: paper only |
| M5 W10 crash day (shadow under the calendar reading) | Robinhood IRA | As M1 | n/a | Shadow |
| M6 depeg buy | Coinbase | **Not possible:** no USDC-USD market; USDC converts 1:1 | n/a | **Moved to shadow** |
| M6 cash-and-carry | Would need MBT futures | Not sensible below ≈$280k, and the legs sit in different accounts | n/a | **Moved to shadow** |
| M7 put credit spread (paper) | Robinhood taxable | "Put credit spread" builder; a GTC buy-back at 50% | 1 in, 1 out | Placeable, but **infeasible below ≈$162k**: shadow at $100k |
| Idle cash | Account cash (Robinhood sweep) or SGOV | Optional one-time SGOV buy; the system doesn't send cash-management trades | 0 | **Easy** |

## 3. The WSB-executable standard (now a hard rule in the design)

1. **Venues.**
   - ETF and Bitcoin-ETF trades in the Robinhood IRA.
   - Option spreads in the taxable Robinhood account.
   - Optional crypto on Coinbase.
   - No futures and no short selling in v1.
2. **Three order kinds only:**
   - **(a)** a market order in dollars, placed any time after the email, which Robinhood queues for 9:30 ET;
   - **(b)** a two-leg vertical spread at one net limit price, placed after 10:00 ET, with at most one re-price at a stated maximum, otherwise skipped;
   - **(c)** a Coinbase market buy/sell in dollars.
   - No stop, stop-limit, trailing-stop, bracket/OCO, MOC or overnight-session orders.
3. **At most 3 orders per email,** including monthly rebalances, via the no-trade band.
4. **Options.**
   - Only two-leg vertical spreads (debit spreads for live modules).
   - At least 1 whole contract, or the trade is skipped.
   - Closed at least 1 trading day before expiration.
   - XSP preferred (cash-settled, European, Section 1256); SPY or DAL only with the close-early rule.
5. **Every email carries a "Robinhood steps" block** (≤7 taps, with exact values), a "what if" block (price outside the band → skip; not filled → what to do), and plain-English explanations of any term.
6. **Recording fills.** One link opens the trade's GitHub issue, where you comment `filled <amount> @ <price>` or `skipped`. The GitHub mobile app works for this.
7. **Instrument whitelist.** An email may only contain tickers checked tradable on your venues. `check_venues.py` re-runs monthly, and a failed check blocks the email.

## 4. Changes to the design (v3.2)

- **M6** (depeg and cash-and-carry) → shadow ledger.
- **M7** → shadow at a $100k paper size (it needs ≈$162k).
- **M2** → no-trade band (25% of target or $300), which caps it at 3 orders a month. The paper backtest adopts the same band.
- **All option spreads** → the taxable Robinhood account, closed ≥1 trading day before expiration. The option limit "ladder" becomes: one entry, one re-price at the stated maximum, otherwise skip.
- **Time stops and exits** → a market order queued for the next open (no MOC). For M1 this replaces "sell at the close of session 20" with "sell at the open of session 21". That is a small change, and the paper run measures it.
- **Account map (paper, default $100k):** Robinhood IRA $70k; Robinhood taxable (margin, Level 3, index options) $30k; Coinbase optional, off by default.

## 5. Things only you can confirm in the app

- Options Level 3 and index-options access are enabled on the **taxable** Robinhood account.
- One-off dollar (fractional) orders work in your Robinhood IRA.
- Whether your IRA is at Robinhood or elsewhere. If elsewhere, the steps block uses that broker's wording.
