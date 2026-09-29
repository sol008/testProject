# 32 — What you can actually execute, what taxes and rules cost, and how one weekly recommendation works

*29 September 2026. Track 32 of the research round on your new objective ("exceed SPY by a large margin", "at most 1 recommendation per week", "a make-rich quick engine"). Other tracks design the strategies: a trend-filtered leveraged index core, ETF momentum rotation, a bigger crypto sleeve, single-stock momentum and options as leverage. This track checks whether you can place those trades at Robinhood (IRA and taxable) and Coinbase, what the tax and venue rules cost, and how a single weekly email should work. It updates `20-executability-check.md` for the new instruments. Code and outputs are in `code/32-venues/`.*

## TL;DR

1. **You can place every candidate trade.** SSO, UPRO, QLD, TQQQ, SOXL, IBIT, ETHA, BITX and SGOV all trade on Robinhood with dollar orders, and no Robinhood help page found bars leveraged or crypto ETFs from an IRA. But an IRA can't borrow, can't do spreads (long calls are allowed), can't hold crypto directly, and earns 0% on idle cash. So "out of the market" means SGOV.
2. **Do the weekly switching in the IRA, with "limited margin" turned on.** It lets you buy with the same day's sale proceeds; a cash IRA must wait a day. The pattern-day-trader rule ended at Robinhood on 4 Jun 2026, and it never applies at a weekly pace anyway.
3. **Taxes decide the account.** Weekly switching makes every gain short-term, so the leveraged, rotation and crypto-ETF sleeves belong in the IRA. At 30% a year for 10 years, money grows 13.8× in an IRA against 5.1–7.8× in a taxable account. XSP options (taxed 60/40) belong in the taxable account. The 2026 IRA limit is **$7,500** ($8,600 at 50+), so a real $80k IRA needs an existing IRA or 401(k) moved in. **That is a question for you.**
4. **One email a week, Sunday about 21:17 ET.** That is the existing `weekly` job, which runs after Bitcoin's weekly close. It holds one target portfolio and at most 3 orders: sells queued for Monday's 9:30 open, and buys placed on Monday once the sells fill. M1 and W8 (and W10) move to the shadow ledger. M4 can join the weekly email as a Monday 10:00–11:00 ET order.
5. **A proposed exception, for you to approve:** one exit-only mid-week email when the index closes below its 200-day average (the weekly rule, checked daily). In the tests it fired about 1.7 times a year, never lowered return in six tests, and halved the worst week of 1987. Crash-day triggers are rejected. Every leveraged-ETF email carries the risk box in §6.

---

## 1. Robinhood: what you can execute

### 1.1 The instruments

Checked on 29 Sep 2026 (04:15 UTC) against Robinhood's public instruments API (`code/32-venues/check_venues_32.py` → `venue_check_32.json`) and Coinbase's products API.

| Ticker | What it is | Tradable | Dollar orders (regular hours) | Dollar orders pre-/after-market | 24 Hour Market¹ | Options listed | Margin maintenance² |
|---|---|---|---|---|---|---|---|
| SPY, VOO, QQQ | 1× S&P 500 / Nasdaq-100 | Yes | Yes | Yes | Yes | Yes | 25% |
| **SSO** | 2× S&P 500 (ProShares) | Yes | Yes | Yes | Yes | Yes | 50% |
| **UPRO** | 3× S&P 500 (ProShares) | Yes | Yes | Yes | Yes | Yes | 75% |
| SPXL | 3× S&P 500 (Direxion) | Yes | Yes | No | Yes | Yes | 75% |
| **QLD** | 2× Nasdaq-100 (ProShares) | Yes | Yes | Yes | Yes | Yes | 50% |
| **TQQQ** | 3× Nasdaq-100 (ProShares) | Yes | Yes | Yes | Yes | Yes | 75% |
| **SOXL** | 3× semiconductors | Yes | Yes | No | Yes | Yes | 90% |
| TECL | 3× technology | Yes | Yes | No | Yes | Yes | 75% |
| SH, SDS, SPXU, SQQQ | −1×, −2×, −3× S&P; −3× Nasdaq | Yes | Yes | No | Yes (SDS no) | Yes | 30–90% |
| **IBIT**, FBTC | Spot Bitcoin | Yes | Yes | No | Yes | Yes | 30% |
| **ETHA** | Spot Ether | Yes | Yes | No | Yes | Yes | 50% |
| **BITX**, BITU | 2× Bitcoin | Yes | Yes | No | Yes | Yes | 60% |
| ETHU | 2× Ether | Yes | Yes | No | Yes | Yes | 100% |
| **SGOV**, BIL | T-bill ETFs (the "out" position) | Yes | Yes | Yes | Yes | Yes | 25% |
| BTC-USD, ETH-USD | Coinbase spot | Online | Yes, minimum $1 | 24/7 | n/a | n/a | n/a |

¹ The 24 Hour Market takes **whole-share limit orders only** ([Robinhood: 24 Hour Market](https://robinhood.com/us/en/support/articles/24hour-market/)). The design already bans overnight-session orders.
² This matters only in a taxable margin account (§1.4). A 75% maintenance requirement means you can borrow almost nothing against the fund.

**No acknowledgement or ban is documented.** Robinhood's info labels for complex products include "Leveraged", "Inverse" and "Leveraged inverse". It says labelled products "are risky and typically not for buy-and-hold investors". It describes no extra approval step ([Robinhood: info labels](https://robinhood.com/us/en/support/articles/info-labels/)). The public API reports tradability only for "individual" accounts, even for SPY, so it can't confirm IRA eligibility. **[Verify in app]** Open TQQQ, UPRO, BITX and ETHA from the IRA and check that the Buy button works; you don't need to place an order.

### 1.2 IRA rules that matter for a weekly switching book

| Question | Answer | Source |
|---|---|---|
| Leveraged, inverse and crypto ETFs in a Robinhood IRA (traditional or Roth)? | **Yes**, as far as Robinhood documents. "You can invest in stocks and ETFs within a self-directed Robinhood IRA." No page excludes leveraged, inverse or crypto ETFs | [Retirement investing](https://robinhood.com/us/en/support/articles/retirement-investing/) |
| Crypto itself (BTC, ETH) in the IRA? | **No.** "Products and services offered by Robinhood Crypto, LLC, are not available in an IRA." Use IBIT, ETHA or BITX there | same |
| Dollar (fractional) orders? | Stocks and ETFs priced ≥$1 with a market cap >$25m, minimum $1. **All 23 tickers above qualify.** A dollar order placed outside market hours executes at the open. To cancel it, you must do so before 9:20 ET: "You can't cancel these orders between 9:20-9:30 AM ET". **[Verify in app]** that one-off dollar orders work in your IRA; recurring IRA investments do buy fractions | [Fractional shares](https://robinhood.com/us/en/support/articles/fractional-shares/), [Retirement investing](https://robinhood.com/us/en/support/articles/retirement-investing/) |
| Options level in an IRA | **Level 2 only:** "long calls, covered calls, long puts, and short puts". "Level 3 strategies, such as … vertical spreads … aren't available yet in Robinhood Retirement." **Deep in-the-money calls are long calls, so they are allowed** (§1.3). Index options (XSP) in an IRA aren't documented: **[verify in app]** | [Options in Robinhood Retirement](https://robinhood.com/us/en/support/articles/options-in-robinhood-retirement/) |
| Margin in an IRA? | **No borrowing, ever.** "Limited margin" only lets you trade with unsettled funds: "under no circumstances will any extension of credit or margin borrowing be made available". It doesn't allow "borrowing of funds, creating a margin debit, … short selling, or selling naked options" | [Supplemental Limited Margin Agreement](https://cdn.robinhood.com/assets/robinhood/legal/limited-margin-agreement.pdf) (version dated 5 Jun 2026), [IRA overview](https://robinhood.com/us/en/support/articles/ira-overview/) |
| Sell Monday, buy Monday with the proceeds? | **With limited margin: yes.** "You are permitted to sell a security, and before the trade settles, use the unsettled funds to purchase other securities." **In a cash IRA: no.** "With IRA cash accounts, you'll need to wait 1 day to trade with funds from stock sales." Settlement is T+1 | [Limited margin agreement](https://cdn.robinhood.com/assets/robinhood/legal/limited-margin-agreement.pdf), [IRA overview](https://robinhood.com/us/en/support/articles/ira-overview/), [Settlement and buying power](https://robinhood.com/us/en/support/articles/settlement-and-buying-power/) |
| Good-faith violations? | Robinhood's cash accounts simply block buys with unsettled money ("Cash accounts can't trade with unsettled funds"), so the cost is a one-day wait, not a violation. Limited margin "allows you to avoid certain … Regulation T settlement periods" | same |
| How to switch the IRA to limited margin | In the app: **Account (person) → Menu (3 bars) or Settings → Investing → your IRA → Account type → "Switch to limited margin account"**. Robinhood "may require a limited minimum equity" | [IRA overview](https://robinhood.com/us/en/support/articles/ira-overview/), agreement §6 |
| Pattern-day-trader rule? | **Gone.** FINRA's intraday margin standards replaced it on 4 Jun 2026: "No more day trade restrictions or day trade calls with your Robinhood margin account". It applied only to margin accounts anyway. A weekly book never opens and closes a position on the same day: even an emergency exit fills at the next open | [Day trading](https://robinhood.com/us/en/support/articles/day-trading/) |
| Interest on idle IRA cash? | **None from the cash program.** "Robinhood self-directed IRAs … are not eligible for the High-Yield Cash Program" (3.6% APY on eligible cash in taxable accounts as of 17 Sep 2026). **So "out" must be SGOV or BIL** (13-week T-bill yield 4.06% on 28 Sep) | [High-Yield Cash Program](https://robinhood.com/us/en/support/articles/high-yield-cash-program/) |
| Contribution limits (2026) | **$7,500** under 50, **$8,600** at 50+, across all your IRAs. IRA match: 1% of contributions, or 3% with Gold ($5 a month), kept 5 years | [IRS news release](https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500), [IRA overview](https://robinhood.com/us/en/support/articles/ira-overview/) |

### 1.3 Deep in-the-money calls as IRA leverage

Long calls are Level 2, so the IRA can buy them. `code/32-venues/ditm_calls.py` priced the call nearest to 0.85 delta from Yahoo's snapshot of the 28 Sep close:

| Underlying | Expiry (days) | Strike | One contract | Share of an $80k IRA | Leverage | Time value a year (% of spot) | Bid-ask (% of mid) | Open interest |
|---|---|---|---|---|---|---|---|---|
| SPY $765.61 | 31 Dec 2026 (93) | 668 | $10,715 | 13% | 6.1× | 4.9% | 3.2% | 23 |
| SPY | 31 Mar 2027 (183) | 620 | $16,291 | 20% | 4.0× | 4.5% | 2.2% | 14 |
| SPY | 17 Sep 2027 (353) | 580 | $21,644 | 27% | 3.0× | 4.2% | 2.3% | 8 |
| QQQ $736.53 | 31 Dec 2026 (93) | 630 | $11,866 | 15% | 5.3× | 6.5% | 0.7% | 2,546 |
| QQQ | 31 Mar 2027 (183) | 581 | $17,557 | 22% | 3.6× | 5.4% | 1.8% | 9 |
| QQQ | 17 Sep 2027 (353) | 535 | $23,582 | 29% | 2.7× | 4.8% | 1.6% | 35 |

**What this means:**
- The leverage costs about the T-bill rate plus 0–2.5 points a year, similar to a leveraged ETF. Unlike a leveraged ETF, there is no daily reset, and the most you can lose is the premium.
- But each contract is a lump of 13–29% of an $80k IRA, with **no dollar orders**, a 0.7–3% spread on the premium, and thin open interest at deep strikes.
- A position must be **closed before expiry**. If an in-the-money call expires and the IRA lacks the cash to exercise it, Robinhood may sell it or file a do-not-exercise request ([Expiration, exercise, and assignment](https://robinhood.com/us/en/support/articles/expiration-exercise-and-assignment/)).
- **Verdict:** usable only for a sleeve of at least one contract, so an IRA of about $100k or more. Below that, leveraged ETFs are the practical leverage.
- In the taxable account, SPY and QQQ calls are equity options taxed as ordinary short-term gains. **XSP calls are the only index leverage there taxed 60/40** (§3.4).

### 1.4 Margin — taxable account only (Gold not required)

| Settled margin balance | Rate (as of 17 Sep 2026) |
|---|---|
| Up to $50,000 | **5.25%** |
| $50,000 – $100,000 | 5.05% |
| $100,000 – $1 million | 4.75% |
| $1m – $10m / $10m – $50m / over $50m | 4.50% / 4.45% / 4.20% |

- One rate for everyone. Gold ($5 a month) makes the first $1,000 of borrowing free.
- The rate is the Fed-funds upper bound plus a spread that depends on the balance.
- Sources: [Robinhood margin rates](https://robinhood.com/us/en/support/articles/margin-rates/), [fee schedule, 17 Sep 2026](https://cdn.robinhood.com/assets/robinhood/legal/RHF+Fee+Schedule.pdf).

**Verdict: don't use margin.**
- It isn't available in the IRA.
- It costs about 1.2 points more than the 4.06% T-bill.
- Robinhood's maintenance requirement is 50–100% on 2× and 3× funds (table 1.1), so it adds almost nothing on top of them.
- Margin can be called in a crash. A leveraged ETF can't fall below zero and never calls for cash.
- For 2× exposure, SSO's built-in borrowing (about T-bill plus a swap spread, plus its 0.84% fee) costs roughly the same as 5.25% margin on SPY.

### 1.5 Order mechanics for a Monday-open switch

- **Market orders placed outside regular hours wait for the 9:30 ET open.** "Our venues don't support market orders during extended or overnight trading" ([Extended-hours trading](https://robinhood.com/us/en/support/articles/extendedhours-trading/), [Market order](https://robinhood.com/us/en/support/articles/market-order-update/)). No special order type is needed.
- **Queued buys reserve extra cash.** "We'll over-reserve 5% of your buying power for market orders placed outside of regular market hours", and "the 5% reserve might change in response to extreme volatility" ([Market order](https://robinhood.com/us/en/support/articles/market-order-update/)). The API shows `reserved_buying_power_percent_queued = 0.10` on every ticker (and `…_immediate = 0.05` for orders during market hours). If the reserve isn't there at the open, the order is cancelled. **Rule: a queued buy uses at most 90% of the cash shown; a buy during market hours at most 95%.**
- **A buy can't be queued against a sell that hasn't filled.** Buying power grows only when the sell executes. So every switch has two steps:
  - **Step 1, Sunday night (before 9:20 Monday):** queue the sells.
  - **Step 2, Monday from about 9:35 ET, once the sells show "Filled":** place the buys as market orders in dollars.
  - Limited margin makes Step 2 possible the same day; a cash IRA must wait for Tuesday.
- **Sell with "Sell all", not dollars.** A dollar-based sell can cover at most 95% of a position ([Market order](https://robinhood.com/us/en/support/articles/market-order-update/)).
- **Don't use pre-market, after-hours or the 24 Hour Market** (Sunday 20:00 to Friday 20:00 ET). They take limit orders only, have wider spreads, and several of the funds can't take dollar orders there.
- **Monday holidays:** the queued orders fill at Tuesday's open, and the email must say so. That means Martin Luther King Jr. Day, Presidents' Day, Memorial Day and Labor Day, plus observed holidays.
- **Fees** ([fee schedule](https://cdn.robinhood.com/assets/robinhood/legal/RHF+Fee+Schedule.pdf)):
  - $0 commission on ETFs and options;
  - SEC fee of $20.60 per $1m sold, plus FINRA's $0.000195 a share sold;
  - index options: $0.35 a contract with Gold, or $0.50, plus exchange fees.

---

## 2. Coinbase

| | Simple buy/sell (the default app screen) | Advanced (Advanced Trade) |
|---|---|---|
| Cost of a dollar market order | A spread of about 0.5%, plus a "Coinbase fee" (flat on small orders, a percentage on larger ones, higher by card). About **1–2.5% a side** from a USD balance or bank; 2–3% by card | Taker fee **0.60%** below $10k of 30-day volume, 0.40% for $10k–50k, 0.25% for $50k–100k (maker 0.40/0.25/0.15%). A market order is a taker order |
| $10,000 round trip | ≈$200–500 | ≈$120 |
| Coinbase One subscription | Removes the Coinbase fee on eligible simple trades; the spread remains | — |

- **Sources:**
  - [Coinbase pricing and fees](https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees) and [Coinbase Advanced fees](https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/advanced-trade-fees) block automated reads (HTTP 403). The numbers above come from their search snippets and a [20 Aug 2026 breakdown](https://www.datawallet.com/crypto/coinbase-fees).
  - The app's order preview shows the true total. **[Verify in app]**
- **Markets:** BTC-USD and ETH-USD are online, with a $1 minimum market order ([Coinbase Exchange API](https://api.exchange.coinbase.com/products/BTC-USD)).
- **Cost against IBIT in the IRA:**
  - A crypto switch like M3 trades about 5 times a year (in or out). On Coinbase Advanced that costs about 5 × 0.6% ≈ **3% of the sleeve a year**; on simple trades, 5–13%.
  - IBIT and ETHA cost a 0.25%-a-year fee plus spreads of a few hundredths of a percent, and they sit inside the IRA's tax shelter.
  - **Recommendation: hold crypto as ETFs in the IRA; Coinbase is optional.** Its advantage is 24/7 trading: a Sunday-night order fills at once.
- **Tax:**
  - Coinbase is taxable-only: it offers no IRA, and Robinhood Crypto isn't allowed in IRAs.
  - Spot crypto is property: short-term if held a year or less.
  - The wash-sale rule covers "stock or securities". The 2026 Form 1099-DA instructions apply wash-sale reporting only to tokenized securities, so **spot BTC and ETH currently have no wash-sale rule**. IBIT, ETHA and BITX are securities, so it does apply to them.
  - Coinbase reports gross proceeds from 2025, and cost basis for coins acquired from 1 Jan 2026 ([IRS: 1099-DA instructions](https://www.irs.gov/instructions/i1099da)).

---

## 3. Taxes (US federal; state tax adds to all of this)

### 3.1 Every weekly-switched gain is short-term

- "If you hold investment property more than 1 year, any capital gain or loss is a long-term capital gain or loss." Anything shorter is taxed as ordinary income: up to 37%, plus the 3.8% net investment income tax above the income thresholds ([IRS Pub. 550](https://www.irs.gov/publications/p550)).
- A trend switch, a momentum rotation or a crypto switch almost never holds anything for a year.
- Leveraged ETFs can also pay out gains inside the fund. FINRA: "daily resets can cause the ETP to realize significant short-term capital gains that may not be offset by a loss" ([FINRA](https://www.finra.org/investors/insights/lowdown-leveraged-and-inverse-exchange-traded-products)).

### 3.2 What the account type is worth (`code/32-venues/tax_drag.py`)

Growth of $1 over 10 years, with every gain realized and taxed each year. Federal tax only; no losing years.

| Where the gains are taxed | Tax rate | 15% a year pre-tax | 30% a year | 50% a year |
|---|---|---|---|---|
| **IRA / Roth** (untaxed inside) | 0% | **4.0×** | **13.8×** | **57.7×** |
| Taxable, short-term, 24% bracket | 24% | 2.9× | 7.8× | 25.1× |
| Taxable, short-term, top bracket + NIIT | 40.8% | 2.3× | 5.1× | 13.4× |
| Taxable, Section 1256 (XSP), 24% bracket | 18.6% | 3.2× | 8.9× | 30.4× |
| Taxable, Section 1256 (XSP), top bracket | 30.6% | 2.7× | 6.6× | 19.7× |

- **The account matters more than most strategy choices.** At 30% a year, the taxable version keeps 37–57% of the IRA's multiple.
- A traditional IRA is taxed as ordinary income when you withdraw; a Roth, if qualified, never.
- **IRA money is locked:** there is "a 10% additional tax on early distributions from traditional and Roth IRAs" before age 59½, unless an exception applies ([IRS Topic 557](https://www.irs.gov/taxtopics/tc557)). A "make-rich quick" IRA can't be spent quickly (decision D2).

### 3.3 Wash sales with weekly switching

**The rule** ([IRS Pub. 550](https://www.irs.gov/publications/p550)):
- You sell at a loss and, within 30 days before or after, you:
  - buy substantially identical stock or securities; or
  - acquire a contract or option to buy them; or
  - "acquire substantially identical stock for your individual retirement arrangement (IRA) or Roth IRA".
- For an IRA purchase, the loss is **lost for good**: it is not added to the IRA's basis ([Rev. Rul. 2008-5](https://www.irs.gov/pub/irs-drop/rr-08-05.pdf)).
- **"Substantially identical"** is judged on "all the facts and circumstances". The IRS has never ruled on ETFs tracking the same index.

| Pair | Our reading (not a ruling) | System rule |
|---|---|---|
| UPRO ↔ SPXL (both 3× S&P 500, different sponsors) | Economically near-identical | Treat as identical |
| SPY ↔ VOO ↔ IVV; QQQ ↔ QQQM; IBIT ↔ FBTC | Same index or asset, different sponsor: a grey zone | Treat as identical |
| SSO ↔ UPRO; QLD ↔ TQQQ; SPY ↔ SSO; IBIT ↔ BITX | Different multiples give clearly different returns: probably not identical | Allowed, but not as a planned tax-loss swap |
| XSP options ↔ SPY or UPRO | XSP options are Section 1256 contracts, marked to market every 31 Dec. Pub. 550 doesn't address the overlap. At most a timing effect within the year | Allowed; flag it on the tax line |
| Spot BTC (Coinbase) ↔ IBIT | Spot crypto isn't a security (§2) | Avoid anyway: the law may change |

**How the system stays out of trouble:**
1. All weekly switching happens **inside the IRA**, where wash sales can't hurt.
2. The taxable account **never holds the IRA's switching families**: S&P 500 funds at any multiple, Nasdaq-100 funds, Bitcoin ETFs and their equity options. Otherwise a taxable loss could be wiped out by the IRA's next purchase. Using XSP in taxable is the exception.
3. The existing ±30-day guard (design §4) extends from "same ticker" to "same index, same multiple".

### 3.4 Section 1256 (XSP and other index options)

- Broad-based index options are "nonequity options". For them, "60% of your capital gain or loss will be treated as a long-term capital gain or loss, and 40% … short-term … regardless of how long you actually held the property" ([IRS Pub. 550](https://www.irs.gov/publications/p550); reported on [Form 6781](https://www.irs.gov/forms-pubs/about-form-6781)).
- Open contracts are treated as sold at fair market value on the year's last business day.
- Robinhood's [index options page](https://robinhood.com/us/en/support/articles/index-options/) says the same, and lists SPX, XSP, NDX, RUT and VIX.
- **SPY and QQQ options are equity options, not Section 1256.**
- The top blended rate is 30.6%, against 40.8% short-term. This only matters in the taxable account. Spreads can't go in the IRA anyway (Level 2 only).

### 3.5 What goes where

| Sleeve / instrument | Home | Why |
|---|---|---|
| Leveraged index core (SSO, UPRO, QLD, TQQQ) and SGOV | **IRA, with limited margin** | Short-term gains untaxed; same-day switching; SGOV earns T-bill yield (IRA cash earns 0%) |
| ETF momentum rotation | **IRA** | 12 or more switches a year, all short-term |
| Crypto trend via IBIT, ETHA, BITX | **IRA** | Cheapest route (§2); tax shelter; a Robinhood IRA can't hold spot crypto anyway |
| Spot BTC and ETH | Coinbase (taxable) | Only if you want 24/7 trading; about 3% a year in fees on a switching sleeve |
| Single-stock momentum | IRA; taxable only for holdings likely to pass a year | Short-term gains otherwise |
| Option spreads (M4, W8): XSP | **Taxable** (Level 3 plus index options) | IRAs can't hold spreads; 60/40 tax |
| Deep in-the-money calls | IRA (SPY/QQQ), or taxable using **XSP** | Lumpy sizing (§1.3); in taxable only XSP gets 60/40 |
| Margin | Not used | §1.4 |

### 3.6 Can the real IRA be $80k? (owner question)

- The paper book uses **$80k IRA / $20k taxable** (design v3.3).
- New money can enter an IRA only at **$7,500 a year** in 2026 ($8,600 at 50+), across all IRAs and capped at earned income. Roth contributions also have income limits.
- So a real $80k IRA exists only if you already have IRA or old-401(k) money to **transfer or roll over** to Robinhood.
- **If the real IRA is smaller,** choose one:
  - (a) scale the live book down to what the IRA holds;
  - (b) run part of the leveraged core in the taxable account and accept the §3.2 tax cost;
  - (c) keep the $80k/$20k paper split for measurement and resize at go-live.
- **The accounts can't fund each other:** a withdrawal from an IRA is a taxable distribution. So every sleeve must fit inside one account.

---

## 4. The weekly cadence

### 4.1 When the one email goes out

| Option | Good | Bad |
|---|---|---|
| **Sunday, about 21:17 ET (20:17 in winter) — recommended** | The existing `weekly` job already runs then (01:17/02:17 UTC Monday). It follows Bitcoin's 00:00 UTC weekly close (20:00 EDT / 19:00 EST), which M3 uses. It includes Friday's closes and the weekend's crypto moves. Orders queue for Monday 9:30; Coinbase orders fill at once | You act on Sunday night, or before 9:20 Monday |
| Friday, 17:00–22:00 ET | The weekend to place orders | Crypto signals are two days stale, or need a second email; weekend news is not reflected |
| Monday, 08:00–09:15 ET | Freshest information | Little time before the open |

- The equity signals are the same either way: all use Friday's close.
- Keep the email on Sunday and move the other jobs' emails into it (§4.5).

### 4.2 One recommendation = one target portfolio, at most 3 orders

**Proposed reading of "at most 1 recommendation per week"** (decision D4):
- One email per Monday-to-Sunday week, holding **one target portfolio**.
- A week with no change sends a "no action" note, which **does not count**.
- The monthly review email is a report, not a recommendation.

How the email is built:

1. **Each sleeve states its target** in dollars of its own account (IRA, taxable, or Coinbase). Money never moves between accounts.
2. **Net per ticker.** For example, "sell SGOV" for the core and "sell SGOV" for crypto become one SGOV order.
3. **Skip small changes.** Drop any change smaller than 25% of the target or $300 (M2's no-trade band).
4. **At most 3 orders, ranked:**
   1. exits and risk cuts;
   2. then the biggest buys.
   The rest waits a week, and the email says so.
5. **Sequence in two steps:** sells queued Sunday night; buys on Monday after the sells fill, using at most 95% of the cash (§1.5). Buys may be queued on Sunday only if cash already covers 110% of them.

An example of the order block, as the owner would see it:

```
THIS WEEK — 1 recommendation, 3 orders (Robinhood IRA)                        PAPER
Target: TQQQ 60% · IBIT 10% · SGOV 25% · cash 5%   (now: SGOV 100%). Trend and Bitcoin rules both turned on.
Step 1 — tonight or before 9:20 Monday:
  1. Sell SGOV: 75% of your SGOV shares (≈ $60,000). Market order; Robinhood waits for 9:30.
Step 2 — Monday after 9:35 ET, when order 1 shows "Filled" (needs limited margin):
  2. Buy TQQQ $48,000 · market · in dollars
  3. Buy IBIT  $8,000 · market · in dollars      (together ≈ 93% of the cash; keep the rest)
If you can't do Step 2 on Monday, do it Tuesday morning. Don't use the 24 Hour Market.
Market holiday on Monday? No. (If it were, every order would fill on Tuesday.)
```

### 4.3 Mid-week emergencies: what the data say (`code/32-venues/midweek_exit.py`)

**The test book** is a stand-in for the core other tracks are designing:
- it holds a 2× or 3× index fund while the index closes above its 200-day average, and T-bills otherwise;
- the modelled fund returns L × the index, minus (L − 1) × the T-bill rate, minus a 0.9% fee;
- a switch costs 0.05%.

**The samples:**
- SPY 1993–2026 and QQQ 1999–2026, filled at the next day's real open;
- the S&P 500 index 1960–2026, filled at the next close (Yahoo's index opens before 2010 are only the prior close).

**The mid-week exit triggers tested** (all exit-only; the book re-decides at the next weekly close):
- **E1:** the index closes below its 200-day average;
- **E2:** the index is 7% or more below the last weekly close;
- **E3:** the index falls 4% or more in one day;
- **E5:** the index is 5% or more below the last weekly close;
- **E1-slot:** E1, but only in a week with no order yet.

| 3× book | Rule | Return a year | Worst drawdown | Worst week | Emergency exits a year | Weeks with 2 recommendations a year | Weeks with an order, a year |
|---|---|---|---|---|---|---|---|
| SPY 1993–2026 | weekly only | 15.5% | −75.6% | −30.9% | — | — | 3.3 |
| | **+E1** | **15.9%** | −74.6% | −36.2%¹ | 1.8 | 0.9 | 3.7 |
| | +E1-slot | 15.9% | −80.1% | −36.2% | 1.0 (0.8 blocked) | 0 | 3.9 |
| | +E5 | 14.7% | −78.3% | −29.4% | 0.3 | 0.03 | 3.7 |
| | daily (no cap) | 16.3% | −69.4% | −36.2% | — | — | 4.4 |
| QQQ 1999–2026 | weekly only | 15.9% | −90.0% | −59.9% | — | — | 3.1 |
| | **+E1** | **16.6%** | −90.7% | −59.9% | 1.7 | 0.6 | 3.7 |
| | +E5 | 21.8% | −78.6% | −27.7% | 0.9 | 0.15 | 4.2 |
| | daily (no cap) | 12.5% | −93.3% | −59.9% | — | — | 4.5 |
| S&P 500 1960–2026 | weekly only | 9.5% | −82.2% | −61.5% (Oct 1987) | — | — | 3.0 |
| | **+E1** | **11.7%** | −70.2% | −31.7% | 1.8 | 0.65 | 3.6 |
| | +E5 | 9.6% | −82.2% | −61.5% | 0.2 | 0.02 | 3.2 |

For comparison, holding SPY earned 10.9% (worst drawdown −55%), QQQ 8.9% (−83%), and the S&P index 7.8% (−57%). The 2× results, and E2 and E3, are in `midweek_exit.csv`.

¹ E1 sold at Friday 28 Feb 2020's gap-down open (SPY opened about 3.5% lower, then closed −0.4%). An exit at the next open can sell into the gap.

**What this shows:**
- **The weekly cap barely binds the core itself.** A trend-filtered core needs an order only 3–4 weeks a year. The cap binds only when many sleeves and daily modules pile up.
- **E1 is cheap insurance, not extra return.**
  - It never lowered return in the six tests: +0.1 to +2.2 points a year across 2× and 3×.
  - It halved the worst week of the long sample (Black Monday, 1987).
  - It costs about 1.7 extra emails a year.
  - It is the weekly rule checked daily, so it is the least data-mined of the triggers.
- **Crash triggers (E2, E3, E5) are rejected.**
  - They helped QQQ in 2000 but cut return on SPY by 0.4–0.9 points a year.
  - They sell on exactly the days W10's research shows are, on average, buying days in an uptrend (tracks 17 and 23).
  - Five triggers × three samples is a multiple-testing trap. E5's +5.9 points on QQQ is one sample.
- **A trend filter does not stop 75–90% drawdowns at 3×** (QQQ 2000–02, the S&P in 1987, SPY in 2008–09 and 2020). That belongs in every email (§6), and to the tracks sizing the core.

### 4.4 Proposed rule for urgent exits (decision D5)

**Rule E — emergency exit (pre-registered, exit-only):**
1. Checked at every weekday close, from the same two-source data as the daily run.
2. It fires only on a trigger fixed in advance for each sleeve. For the index core: **the index closes below its 200-day average** (E1). A sleeve with no tested trigger has no emergency exit.
3. It may only **sell to SGOV** (or to cash on Coinbase). It never buys anything else and never enters a position.
4. At most one per week, and at most 6 a year. Beyond that, exits wait for Sunday.
5. It is sent as a short EXIT email after the close: "Sell all TQQQ", a market order that waits for the next 9:30 open, plus "buy SGOV any time this week".
6. Each emergency exit is scored in the ledger against "waiting for Sunday". The exception is reviewed each year and dropped if its running value is negative.

**Your choice:**
- **(a) Recommended:** Rule E sits **outside** the one-a-week cap.
- **(b) The strict reading:** Rule E is allowed only in a week whose slot is unused (E1-slot). It keeps most of the return, but blocks about 0.8 exits a year and had a worse drawdown in the SPY sample.
- **(c) No mid-week emails:** accept weeks like 1987 (the weekly-only rows).

### 4.5 What happens to the existing daily modules

| Module (today) | Under one email a week | Why |
|---|---|---|
| **M1** dip-buy (daily signal, next-open entry, exit when the index closes above its 5-day average) | **Shadow ledger only** | Its edge is a 1–5 day bounce, which a Monday-only entry and exit misses. It adds only 0.05–0.1% a year next to a 2–3× core |
| **W10** crash-day buy (next-open entry, 90-day hold) | **Shadow**, or join the Sunday email only after a re-test with a Monday entry | When a leveraged core is on, 6% more SPY adds little |
| **M4** crash call spread (Phase B; 10:00 ET entry the day after the signal) | **Can join the Sunday email:** placed Monday 10:00–11:00 ET at the stated limit, one re-price at the stated maximum, otherwise skipped. **Re-test with the Monday entry first** (0–4 days later than the current next-day entry) | It fires when the index is ≥15% below its high, when the trend core is usually in T-bills. It is the only rebound exposure left then. Taxable account (spreads); XSP gives 60/40 |
| **W8** de-escalation spreads (event day +1, exit at 80% of maximum value or 20 days) | **Shadow** | The event edge fades within days, and its exits would use up weekly slots |
| **M2** monthly trend book | Replaced by the new core, or joins the first Sunday email of each month | |
| **M3** Bitcoin switch (weekly, Sunday) | **Joins as is** | Already weekly |
| Daily jobs (22:17 ET run, 08:47 pre-market re-price, 10:17 options snapshot) | Keep running for data, the shadow ledger, paper fills and the Rule E check. **Emails go out only on Sunday, plus Rule E** | |
| Time stops and "close ≥1 trading day before expiry" | Fall on the **last Monday open on or before** the deadline, stated in the preceding Sunday email | |

The budget becomes **at most 52 recommendation weeks a year, plus at most 6 Rule E exits** (if you choose (a)). That replaces the design's cap of 100 trades a year (decision 8).

### 4.6 Options inside a Sunday email

- The Sunday email can't know Monday's option prices. So it states:
  - the strikes and expiry;
  - a limit and a maximum as a share of the spread's width, anchored to Friday's close;
  - a band: "if SPY opens more than 2% away from Friday's close, skip the option order this week".
- Placing it is a Monday 10:00–11:00 ET task: one entry, one re-price at the stated maximum, otherwise skip (standard (b) in design §3a).
- The 10:17 ET snapshot job keeps modelling the paper fill.

---

## 5. Costs at a glance (per year unless stated)

| Item | Size | Source |
|---|---|---|
| Leveraged-fund fees (net) | TQQQ 0.78%, SSO 0.84%, UPRO 0.88%, QLD 0.89% | ProShares summary prospectuses dated 28 Sep 2026 ([TQQQ](https://www.proshares.com/globalassets/proshares/prospectuses/tqqq_summary_prospectus.pdf), [UPRO](https://www.proshares.com/globalassets/proshares/prospectuses/upro_summary_prospectus.pdf), [SSO](https://www.proshares.com/globalassets/proshares/prospectuses/sso_summary_prospectus.pdf), [QLD](https://www.proshares.com/globalassets/proshares/prospectuses/qld_summary_prospectus.pdf)) |
| Built-in borrowing | About (L − 1) × the short-term rate: ≈4% of the fund a year for 2×, ≈8% for 3× at today's 4.06% T-bill. It is inside the price, not a fee you see ("The cost of obtaining this leverage will lower your returns") | same |
| Daily-reset drag compared with L × the index's compound return | ≈ (L² − L)/2 × variance: 2× ≈ 3%, 3× ≈ 10% a year at 18% index volatility; 2× ≈ 6%, 3× ≈ 17% at 24% (Nasdaq-like) | Standard result; the illustration is in §6 |
| Robinhood trading | $0 commission; regulatory fees of a few cents; spreads about 0.01–0.05% on these funds | [Fee schedule](https://cdn.robinhood.com/assets/robinhood/legal/RHF+Fee+Schedule.pdf) |
| Coinbase | 0.60% a side (Advanced, first tier); about 1–2.5% a side (simple) | §2 |
| Margin | 5.25% (up to $50k) | §1.4 |
| Idle IRA cash | Earns 0% → use SGOV (≈4%) | §1.2 |
| Tax in taxable, short-term | Up to 40.8% federal, plus state | §3 |

---

## 6. The risk box every leveraged-ETF email must carry

Plain English, at most 8 lines, with the numbers filled in for the fund recommended:

> **Before you buy TQQQ — how this fund can hurt you**
> 1. **It resets every day.** It aims for 3× the Nasdaq-100's move *each day*, not over weeks. If the index rises 10% and then falls 9.1% (back to even), this fund is **down 5.5%**. Choppy markets eat it even when the index goes nowhere.
> 2. **A single day can wipe it out.** ProShares' own prospectus: "If the Index approaches a 33% loss at any point in the day, you could lose your entire investment" (50% for 2× funds).
> 3. **Real history:** TQQQ fell **82%** (Nov 2021–Dec 2022). UPRO fell **77% in five weeks** (Feb–Mar 2020), with **−35% in one day** (16 Mar 2020). BITX fell **83%** (Aug 2025–Jun 2026).
> 4. **Weekly checks can't dodge a crash week.** Even with the trend switch, the worst week of a 3× Nasdaq book was about **−60%** (April 2000, simulated). The system can only act at the next open.
> 5. **Monday gaps:** your order fills at Monday's open, after the weekend's news. The price can be far from Friday's.
> 6. **It costs more than it looks:** a 0.78% fee plus built-in borrowing of about 8% a year at today's rates.
> 7. **Only money you can afford to lose most of.** Regulators call these short-term trading tools ([FINRA](https://www.finra.org/investors/insights/lowdown-leveraged-and-inverse-exchange-traded-products), [FINRA Notice 09-31](https://www.finra.org/rules-guidance/notices/09-31)).

**Variants:**
- **2× crypto funds (BITX, ETHU):** add "Bitcoin trades 24/7, but BITX trades only in market hours, so weekend moves arrive as a Monday gap. BITX's worst day was −29% (5 Aug 2024)."
- **Deep in-the-money calls:** "You can lose the whole premium. One contract is a large, fixed lump. Close it before expiry: the IRA can't pay to exercise it."
- **Every email:** "IRA gains can't be withdrawn before 59½ without a 10% extra tax."

**Where the figures come from:** the history is from dividend-adjusted closes, 2009–2026; the prospectus lines are quoted from the 28 Sep 2026 summary prospectuses; the −60% week is from `midweek_exit.py`.

---

## 7. Decisions you need to make

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **How big is your real IRA, and what type is it?** | Existing IRA or 401(k) balance you can move to Robinhood; traditional or Roth; age 50 or over? | Tells us whether the $80k/$20k paper split is real (§3.6) |
| D2 | **Will you need this money before age 59½?** | Yes / no | If yes, the IRA-heavy plan conflicts with your goal; the taxable account then carries the §3.2 tax cost |
| D3 | **Turn on limited margin in the Robinhood IRA** | Yes / no | **Yes.** Same-day switching; no borrowing risk. Without it, a switch takes Monday plus Tuesday |
| D4 | **What counts as "1 recommendation"?** | (A) one weekly email = one target portfolio, at most 3 orders; (B) one order | **(A).** Under (B) an SGOV→TQQQ switch takes two weeks |
| D5 | **Mid-week emergency exits** | (a) Rule E outside the cap; (b) only if the week's slot is unused; (c) none | **(a)**, exit-only, E1 trigger, at most 1 a week and 6 a year |
| D6 | **Email day** | Sunday about 21:17 ET; Friday evening | **Sunday** |
| D7 | **Daily modules** | M1, W8 and W10 to shadow, M4 into the Sunday email after a re-test; or retire them all | **Shadow and fold, as §4.5** |
| D8 | **Crypto venue** | IBIT/ETHA/BITX in the IRA; Coinbase spot (taxable) | **The IRA** |
| D9 | **Tax bracket and US state** | — | Needed for each email's tax line and for D1/D2 |
| D10 | **Robinhood Gold ($5 a month)?** | — | Optional: 3% IRA match, $1,000 of free margin, 3.6% on taxable cash, cheaper index options |
| D11 | **Checks in the app** | Buy button in the IRA for TQQQ, UPRO, BITX and ETHA; one-off dollar orders in the IRA; Level 2 enabled in the IRA; Level 3 and index options in taxable (track 20) | Do them before the paper phase ends |

**For the integrating track (not decisions):**
- add the chosen tickers to `config/whitelist.yaml`, with their `venue_check_32.json` rows;
- add `ira.limited_margin` to `config/account.yaml`, and make the paper broker model a cash IRA's one-day wait when it is off;
- make the email renderer enforce the two-step order block, the 90% queue rule, "Sell all" for exits, the Monday-holiday line and the §6 risk box.

---

## 8. Sources

**Robinhood** (help pages read 29 Sep 2026):
- [IRA overview](https://robinhood.com/us/en/support/articles/ira-overview/)
- [Retirement investing](https://robinhood.com/us/en/support/articles/retirement-investing/)
- [Options in Robinhood Retirement](https://robinhood.com/us/en/support/articles/options-in-robinhood-retirement/)
- [Supplemental Limited Margin Agreement, version 20260605](https://cdn.robinhood.com/assets/robinhood/legal/limited-margin-agreement.pdf)
- [Settlement and buying power](https://robinhood.com/us/en/support/articles/settlement-and-buying-power/)
- [Fractional shares](https://robinhood.com/us/en/support/articles/fractional-shares/)
- [Extended-hours trading](https://robinhood.com/us/en/support/articles/extendedhours-trading/)
- [24 Hour Market](https://robinhood.com/us/en/support/articles/24hour-market/)
- [Market order](https://robinhood.com/us/en/support/articles/market-order-update/)
- [Day trading (PDT replaced 4 Jun 2026)](https://robinhood.com/us/en/support/articles/day-trading/)
- [Margin rates](https://robinhood.com/us/en/support/articles/margin-rates/)
- [Fee schedule, version 20260917](https://cdn.robinhood.com/assets/robinhood/legal/RHF+Fee+Schedule.pdf)
- [Info labels](https://robinhood.com/us/en/support/articles/info-labels/)
- [High-Yield Cash Program](https://robinhood.com/us/en/support/articles/high-yield-cash-program/)
- [Index options](https://robinhood.com/us/en/support/articles/index-options/)
- [Expiration, exercise, and assignment](https://robinhood.com/us/en/support/articles/expiration-exercise-and-assignment/)
- [Public instruments API](https://api.robinhood.com/instruments/?symbol=TQQQ)

**Coinbase:**
- [Pricing and fees](https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees)
- [Advanced fees](https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/advanced-trade-fees)
- [Exchange products API](https://api.exchange.coinbase.com/products/BTC-USD)
- Secondary: [Datawallet, 20 Aug 2026](https://www.datawallet.com/crypto/coinbase-fees)

**IRS:**
- [2026 IRA limit news release](https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500) and [Notice 2025-67](https://www.irs.gov/pub/irs-drop/n-25-67.pdf)
- [Publication 550](https://www.irs.gov/publications/p550)
- [Rev. Rul. 2008-5](https://www.irs.gov/pub/irs-drop/rr-08-05.pdf)
- [Form 6781](https://www.irs.gov/forms-pubs/about-form-6781)
- [Topic 557](https://www.irs.gov/taxtopics/tc557)
- [Form 1099-DA instructions](https://www.irs.gov/instructions/i1099da)

**Regulators and issuers:**
- [FINRA: The lowdown on leveraged and inverse ETPs (2022)](https://www.finra.org/investors/insights/lowdown-leveraged-and-inverse-exchange-traded-products)
- [FINRA Regulatory Notice 09-31](https://www.finra.org/rules-guidance/notices/09-31)
- ProShares summary prospectuses (28 Sep 2026) linked in §5

**Code** (`code/32-venues/`; Python 3.11 with `requests pandas numpy yfinance`):
- `check_venues_32.py` → `venue_check_32.json` (tradability, dollar orders, sessions, margin ratios)
- `ditm_calls.py` → `ditm_calls.csv` (deep in-the-money call sizing)
- `midweek_exit.py` → `midweek_exit.csv` (the cadence and emergency-exit tests)
- `tax_drag.py` (the §3.2 table)

*Not individualized tax or investment advice. The tax readings in §3.3 are not IRS rulings; confirm them with a tax adviser before real money is at stake.*
