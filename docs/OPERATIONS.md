# Operations guide

How to set up, run and look after `traderec`, step by step. The design is `research/00-SYSTEM-DESIGN-v3.md` (v3.3); the component contracts are in `docs/INTERFACES.md`. `docs/OWNER_SETUP.md` is the same setup as a short to-do list with direct links.

**Contents**

1. [What this is](#1-what-this-is)
2. [One-time setup](#2-one-time-setup)
3. [Robinhood checklist](#3-robinhood-checklist)
4. [Recording fills](#4-recording-fills)
5. [Reading the emails](#5-reading-the-emails)
6. [Paper to live](#6-paper-to-live)
7. [Pausing or stopping](#7-pausing-or-stopping)
8. [Where state lives](#8-where-state-lives)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. What this is

`traderec` runs on GitHub Actions. After the US close it checks a few pre-registered rules and sizes any trade with fixed risk rules. It records the decision in a hash-chained ledger *before* the outcome is known. Then it emails you plain-English instructions for placing the order in the Robinhood app.

**It starts in the paper phase.** A paper broker fills every order itself, using a frozen fill model (v1.0), and scores the result. ETF orders fill at the next open. Option-spread orders fill from the option quotes taken at 10:17 ET (§5).
- The emails are real and labelled **PAPER**. No real money is involved until the go-live gates in §6 pass.
- Handling each email as if it were real is still part of the test (§4).

**What arrives, and when** (all times New York):

| Email | When | Workflow |
|---|---|---|
| Orders for the next morning's open: a new trade, an exit, or the monthly trend-book rebalance | Weekday evenings, from about 22:17 in summer (EDT) and 21:17 in winter (EST), only when there is something to do | `daily` |
| Option-spread orders (M4, W8, W9): open a spread or close one, after 10:00 ET the next trading day | The same weekday evenings, from the same run, only when there is something to do | `daily` |
| The Bitcoin switch (M3): an IBIT order for Monday's open | Sunday evening, from about 21:17 in summer and 20:17 in winter, only when there is an order | `weekly` |
| The monthly review: results, operations, evidence, failures first | The 1st of each month, about 08:13 in summer and 07:13 in winter | `monthly` |
| The quarterly review: go-live and ramp, costs, calibration, evidence | 1 January, 1 April, 1 July and 1 October, right after the monthly review | `monthly` |
| The annual review: the decisions for you, each with a recommendation | 1 January, right after the quarterly review | `monthly` |

**Most evenings nothing arrives. No email means nothing to do.** You'll know the system is alive from:
- healthchecks.io, which emails you if a run is missed or fails (§2c);
- the monthly review.

**Two jobs never email.** They keep the paper book and the shadow books up to date:

| Job | When | What it does | Workflow |
|---|---|---|---|
| The options job | Weekdays at 10:17 ET | Takes a snapshot of the option quotes, fills or cancels the paper spread orders from the evening before, values open spreads, and runs the option shadow books | `options` |
| The hourly crypto job | Every hour at 41 minutes past, every day of the week | Watches stablecoin prices for a depeg (the M6 shadow book). It saves something only when a depeg starts, changes or ends | `hourly` |

The hourly job is the only one that uses many GitHub Actions minutes: about 730 a month. §7 shows how to halve it or switch it off.

**Two runs a night.** The GitHub cron clock is UTC, so each evening job is scheduled twice, one hour apart:
- `daily` at 02:17 and 03:17 UTC;
- `weekly` at 01:17 and 02:17 UTC.

The first slot does the work. The second slot finds the date already done and stops, unless the first failed, in which case it is the retry.

**Two slots each morning.** The options job is scheduled at 14:17 and 15:17 UTC:
- in summer (EDT) the first slot is 10:17 ET and does the work; the second, at 11:17 ET, is the retry;
- in winter (EST) the first slot is 09:17 ET, too early for option quotes, so it stops at once and changes nothing. The second, at 10:17 ET, does the work. There is no later retry slot in winter.

**Shadow books: recorded, never emailed.** A shadow book follows a rule on paper to collect evidence. It never sends an email, never places an order and never asks the AI. There is nothing for you to do. Results appear in the monthly and quarterly reviews, in `state/state.json` under `shadow`, and as `shadow` records in the ledger (§8).

| Shadow book | What it records |
|---|---|
| ST-1b | M1's rule without the VIX gate |
| W10 record | Every uptrend −3% day, scored 60 and 90 days later |
| M4 twin | M4's signal on a spread that expires within 60 days instead of 90, at model prices |
| O1 (M7) | A trend-filtered XSP put credit spread. Trading it needs about $162k, so at $100k it is a shadow |
| O1-h, I1, I2 | Put-spread variants: O1 held to expiry, a put spread after a VIX spike fades, and O1's rule on IBIT |
| ST-2 | SPY bought when the VIX rises above VIX3M in an uptrend, held 20 sessions |
| ETH | M3's Bitcoin switch, applied to ETH |
| M6 | Crypto: a stablecoin depeg buy (the hourly job) and Bitcoin cash-and-carry (the evening run) |
| MACRO | W3 (cool CPI → TLT), W4 (BoJ hike → yen), the gold spike fade, and the market's reaction to every scheduled release (CPI, payrolls, FOMC, GDP, PCE, BoJ, ECB) |
| EDGAR | *Placeholder: EDGAR build pending.* Insider clusters, special dividends, activist 13D filings, near-completion cash mergers and CEF tenders. Off until it is built |

Two of them need a little help from you, both in `config/econ_calendar.yaml` (§9, "Macro shadow book alerts"):
- the gold spike fade trades only the war onsets you list;
- the release log needs the official release dates kept current.

---

## 2. One-time setup

These steps follow the same order as `docs/OWNER_SETUP.md`, which has direct links: (a)–(e) are its steps 1–5, and (g)–(h) its steps 8–9. Its step 6, the Robinhood checks, is §3 here.

### (a) Make the repository private

GitHub → the repository → **Settings → General → Danger Zone → Change visibility → Private**.

Why:
- `state/` holds your positions, the ledger and copies of unsent emails (with a placeholder address, never yours).
- The market-data terms are personal use only.

Private repositories get 2,000 free Actions minutes a month on GitHub Free (3,000 on Pro). This system uses about 850–950 a month. The hourly crypto job is about 80% of that (§7).

### (b) Gmail OAuth: the sending credential

The system sends from your Gmail account to `ALERT_TO_EMAIL` through the Gmail API, using the `gmail.send` scope only.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a project (for example `traderec`).
2. **APIs & Services → Library → Gmail API → Enable.**
3. Set up the **OAuth consent screen**, which newer consoles call **Google Auth Platform**:
   - user type / audience **External**;
   - app name `traderec`;
   - your Gmail as the support and developer contact;
   - under **Data access**, add the scope `https://www.googleapis.com/auth/gmail.send`.
4. **Audience → Test users → Add users:** add your own Gmail address.
5. **Publish the app: Audience → Publish app**, so the status reads **In production**.
   - **This step matters.** While the app is in *Testing*, Google expires the refresh token after 7 days, and sending stops after a week.
   - You don't need Google's verification for personal use.
6. **Clients → Create client → Application type: Desktop app → Create**, then download the JSON file.
   - Keep the file outside the repository folder and never commit it.
7. On your own computer, in a clone of this repository, run the helper. It needs only Python 3 and `requests`. Until you merge in (g), check out the build branch `claude/clever-keller-vuvr50` first; after the merge, `master` works too.
   ```bash
   pip install requests
   python scripts/gmail_oauth_setup.py --client-secret-json ~/Downloads/client_secret_XXXX.json
   ```
   - A browser opens. If it doesn't, add `--no-browser` and paste the printed URL into one.
   - Sign in with the Gmail account that will **send** the emails.
   - Google warns that it "hasn't verified this app". That is expected for your own app: choose **Advanced → Go to traderec (unsafe)**, then allow sending email on your behalf. The permission is send-only: it can't read your mail.
   - The script prints the **refresh token** and nothing else. Treat it like a password.
8. Add four repository secrets: **Settings → Secrets and variables → Actions → New repository secret**, once for each.

   | Secret | Where the value comes from |
   |---|---|
   | `GMAIL_REFRESH_TOKEN` | The token the script printed |
   | `GMAIL_CLIENT_ID` | `client_id` in the downloaded JSON |
   | `GMAIL_CLIENT_SECRET` | `client_secret` in the downloaded JSON |
   | `ALERT_TO_EMAIL` | The Gmail address you signed in with. Emails go from and to it |

Until these exist, nothing breaks: runs save each email as an `.eml` file in `state/outbox/` instead of sending it.

The token stops working if you change your Google password, or if it goes unused for 6 months. The monthly review keeps it in use. To replace it, repeat steps 7 and 8.

### (c) healthchecks.io: the missed-run alarm

A scheduled run that GitHub drops produces no error anywhere. healthchecks.io notices the silence.

1. Sign up at [healthchecks.io](https://healthchecks.io) (the free plan is enough). Email alerts go to your sign-up address by default.
2. Create five checks. Choose **Cron** as the schedule type for the first four, and **Simple** for the hourly one:

   | Check | Schedule | Time zone | Grace time | Its ping URL goes in |
   |---|---|---|---|---|
   | `traderec daily` | Cron `17 21 * * 1-5` | `America/New_York` | 2 hours 15 minutes | `HC_PING_URL_DAILY` |
   | `traderec weekly` | Cron `17 20 * * 0` | `America/New_York` | 2 hours 15 minutes | `HC_PING_URL_WEEKLY` |
   | `traderec monthly` | Cron `13 12 1 * *` | `UTC` | 3 hours | `HC_PING_URL_MONTHLY` |
   | `traderec options` | Cron `17 10 * * 1-5` | `America/New_York` | 1 hour 30 minutes | `HC_PING_URL_OPTIONS` |
   | `traderec hourly` (optional) | Simple: period 1 hour | — | 3 hours | `HC_PING_URL_HOURLY` |

3. Copy each check's ping URL (`https://hc-ping.com/…`) into a repository secret with the name in the last column.

Why these times:
- The schedule is the earliest time each job does its work:
  - `daily` works at 21:17 ET in winter and 22:17 ET in summer;
  - `weekly` works an hour earlier than `daily`;
  - `options` works at 10:17 ET in both seasons (§1).
- The grace time covers the later slot and GitHub's delays.
- You get an alert if no run has succeeded by about **23:30 ET** on a weekday (the design's target), 22:30 ET on a Sunday, 15:15 UTC on the 1st, or about 11:45 ET on a weekday for the options job.
- The hourly check alerts after about 4 hours without a ping: its 1-hour period plus 3 hours of grace.

Who pings:
- The daily, weekly, monthly and options runs send *start*, then *success* or *fail*. They also send *fail* when the number check blocked an email, or an email couldn't be sent. The quarterly and annual reviews ping the monthly check.
- The options run also sends *fail* when spread orders are due but no usable option quotes came in.
- The hourly job sends *success* after every hour it checks, quiet hours included, and *fail* on an error. When no stablecoin venue answers, it sends nothing, so a long outage shows up as silence.
- The workflow adds a *fail* if anything around the run breaks: setup, saving the state, a refused email, or the venue check.
- Dry runs never ping. A second daily, weekly or options slot that finds its run already done pings nothing. So does an options slot outside 10:15–16:00 ET.

GitHub can also email you about failed runs: your account's **Settings → Notifications → Actions**.

### (d) W8 and W9: the veto and W9's barrels file

W8 and W9 are the macro-event spread modules (§5). Before a W8 or W9 trade is emailed, an AI check reads official websites. It can only **block** a trade: it can't start, size or change one.

1. Create an API key in the Claude Console and add a few dollars of credit.
   - A check runs only for a candidate that passed every other rule, a few times a year at most. A check costs cents, $2 at worst, so expect under $5 a year.
   - Web search must be allowed for your organisation in the Console's settings. If your organisation keeps its own list of allowed domains, the veto's lists (`veto.allowed_domains` under W8 and W9 in `config/constitution.yaml`) must be inside it.
2. Add two repository secrets:

   | Secret | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | The key you just created |
   | `TRADEREC_VETO_MODEL` | The one model the veto is pinned to: a specific model ID from the API's model list (Claude will suggest one in chat) |

   - Keep the model unchanged. The ledger records a fingerprint of it with every check. If it changes, you get a `veto` alert and the new model is pinned from then on.
   - The model must support the web-search tool version named in `config/constitution.yaml` (`veto.web_search_tool`).
   - Without both secrets, nothing breaks: every W8 and W9 candidate is logged in the shadow ledger instead of emailed, with a `veto` alert.

**W9's offline-barrels file.** W9 needs one fact that no free data feed gives: official sources report at least 1 million barrels a day of oil exports physically offline, with no fix or bypass expected for at least 14 days. You record that fact in a file, `state/inputs/w9_supply_loss.json`. There is nothing to set up now. Add the file only when such a loss happens.
- Add it the same day, or at the latest before the evening run of the next trading day. On GitHub: **Add file → Create new file**, type the path `state/inputs/w9_supply_loss.json`, paste the record, and **Commit changes** to `master`. To add a second event later, edit the file and add it to the list.
- The record:
  ```json
  {"events": [{"id": "yanbu-2026-10", "event_date": "2026-10-15", "mbd_offline": 1.8,
               "no_restoration_days": 21, "what": "Yanbu terminal and East-West pipeline damaged",
               "sources": ["https://www.iea.org/...", "https://www.aramco.com/..."],
               "restored_on": null}]}
  ```
  - `id`: a name you choose, different for each event.
  - `event_date`: the trading day of the loss. W9 reads a record only on that day's evening run and the next trading day's.
  - `mbd_offline`: million barrels a day offline, at least 1.0.
  - `no_restoration_days`: days before a fix or bypass is expected, at least 14.
  - `what`: a few words on what happened.
  - `sources`: at least two `https` pages on these sites: `iea.org`, `eia.gov`, `energy.gov`, `opec.org`, `aramco.com`, `adnoc.ae`, `qatarenergy.qa`, `kpc.com.kw`, `spa.gov.sa`, `wam.ae`, `ukmto.org`, `imo.org` or `centcom.mil`.
  - `restored_on`: `null` for now. When the barrels come back, edit the file and set it to that date. An open W9 trade then exits.
- W9 also needs Brent or WTI crude up 5% or more on `event_date`. Each record gets at most one AI check and one trade.
- A file that isn't valid JSON raises a `data` alert, and W9 does nothing until you fix it. Without the file, W9 never fires.
- This is the one file in `state/` you write yourself (§8).

### (e) Your contact for SEC requests

The SEC asks automated tools to identify themselves in each request. The EDGAR shadow screens will send this contact.
- Add the repository secret `SEC_USER_AGENT`: your name and a contact email address of your choice, on one line. It is sent only to sec.gov.
- The daily workflow already passes it to the run. Nothing reads it yet: the EDGAR screens are still being built.
- Without it, the screens will use a generic identity, which the SEC may throttle.

> **Placeholder: EDGAR build pending** (`docs/phase-b/edgar.md`). What the EDGAR/FINRA screens fetch, when, and what they need from you goes here.

### (f) Check the secrets

**Settings → Secrets and variables → Actions.** Use repository secrets, not environment secrets. You should now have these:

| Secret | From step | What happens without it |
|---|---|---|
| `GMAIL_CLIENT_ID` | (b) | Runs work normally but save each email as an `.eml` file in `state/outbox/` instead of sending it |
| `GMAIL_CLIENT_SECRET` | (b) | (same) |
| `GMAIL_REFRESH_TOKEN` | (b) | (same) |
| `ALERT_TO_EMAIL` | (b): the address that receives the emails, normally your own Gmail | (same) |
| `HC_PING_URL_DAILY` | (c) | No missed-run alarm for the evening job |
| `HC_PING_URL_WEEKLY` | (c) | No alarm for the Sunday job |
| `HC_PING_URL_MONTHLY` | (c) | No alarm for the monthly job and its quarterly and annual reviews |
| `HC_PING_URL_OPTIONS` | (c) | No alarm for the 10:17 ET options job |
| `HC_PING_URL_HOURLY` | (c), optional | No alarm for the hourly crypto job |
| `ANTHROPIC_API_KEY` | (d) | W8 and W9 never trade: their candidates are logged in the shadow ledger, with a `veto` alert |
| `TRADEREC_VETO_MODEL` | (d) | (same) |
| `SEC_USER_AGENT` | (e) | The EDGAR screens, once built, use a generic identity |

Don't create `GITHUB_TOKEN`: GitHub provides one to every run.

### (g) Merge the build branch into `master`

Scheduled workflows run only on the default branch, and the **Run workflow** button only appears for workflows that are on it.

1. **Pull requests → New pull request.** Set base to `master` and compare to `claude/clever-keller-vuvr50`, then **Create pull request → Merge**.
2. **Settings → General → Default branch** must say `master`.
3. **Settings → Actions → General:** Actions must be allowed, at least for actions created by GitHub.
   - You don't need to change **Workflow permissions**: each workflow asks for exactly what it needs (`contents: write` to save `state/`, `issues: write` for trade issues).
4. If you add branch protection or rulesets to `master`, don't require pull requests or status checks for it. The workflows push a state commit after every run, and GitHub's built-in token can't bypass those rules.

After the merge, the **Actions** tab lists six workflows: `daily`, `weekly`, `monthly`, `options`, `hourly` and `ci`.

### (h) The first run: a dry run

1. **Actions → daily → Run workflow.** Choose branch `master`, tick **dry_run**, then **Run workflow**.
   - Before about 18:00 ET, today's session isn't final yet. Put the previous trading day in **date**.
2. After a few minutes the run should be green.
   - Open it: the log of **Run the daily pipeline** ends with a summary such as `daily 2026-10-01: ok (dry run)`, followed by the NAV, any emails and any notes.
3. Under **Artifacts**, download `state-daily-<run id>`. Its `outbox/` folder holds, as `.eml` files, the emails the run would have sent (often none). Open them with any mail app.
4. Do the same for **weekly**.
5. Optional: **hourly** with **dry_run** works at any time. **options** with **dry_run** does its work only between 10:15 and 16:00 ET on a trading day, with **date** left empty. Earlier or later on a trading day it stops at once with "too early" or "too late".

A dry run sends nothing, opens no issues and commits nothing. After that, there is nothing else to do: the next scheduled run creates `state/` and commits it.

---

## 3. Robinhood checklist

- [ ] **IRA: dollar orders work.** In the app, switch to the IRA and go to **Search SPY → Trade → Buy**. Check that you can enter the order in **dollars** (fractional shares). Don't submit. The system's ETF orders are all dollar amounts.
- [ ] **Taxable (individual, margin) account: options Level 3 and index options.** The option-spread modules (M4, W8, W9) need it. IRAs allow Level 2 only, so spreads can't go there.
- [ ] **XSP shows an options chain** in the individual account (index options).
- [ ] **The spread screens match the emails.** The steps use the labels "Trade Options", "Select", "Call Debit Spread", "Continue", "Close position" and "Good for day". They come from Robinhood's help pages, not from a session in the app, so look for them once without submitting anything. If the wording differs, the numbers in the steps still hold.
- [ ] **Your IRA is at Robinhood.** If it's elsewhere, place the same order there: a market order for the stated dollar amount. The steps in the email use Robinhood's wording.

**Which trades go where:**

| Trade | Account | Order |
|---|---|---|
| M1 dip-buy (SPY) | Robinhood IRA | Market order in dollars, queued for the open |
| M2 trend book (SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA) | Robinhood IRA | At most 3 market orders in dollars per rebalance |
| M3 Bitcoin switch (IBIT) | Robinhood IRA | Market order in dollars. Coinbase is optional and off by default |
| W10 crash-day buy (SPY) | Robinhood IRA | Market order in dollars, queued for the open |
| Option spreads: M4 crash call spread, W8 de-escalation spread, W9 oil spread | Robinhood taxable account (IRAs allow no spreads) | One two-leg spread at a single net limit price, placed after 10:00 ET the next trading day (§5) |

**Order rules:**
- Use only the order kinds the email names.
- **Never** stop, stop-limit, trailing-stop, bracket/OCO, market-on-close or 24-hour-market orders.
- A market order placed in the evening waits for the 9:30 ET open. Robinhood's overnight market accepts only limit orders, so a market order can't fill overnight by accident.
- Place a spread as one order with both legs. Never leg in or out: never trade one option now and the other later.
- Option spreads are always closed at least one trading day before expiry.
- Don't change the amounts, and don't place orders that no email asked for.
- Idle cash can sit in the account's cash sweep or in SGOV. The system doesn't send cash-management trades.

---

## 4. Recording fills

Every trade email links to that trade's GitHub issue: one issue per trade, labelled `traderec`, `paper` or `live`, and the module. After you act on an email, comment on its issue. The GitHub mobile app works well for this: tap the link in the email and write in the comment box.

| You… | Comment |
|---|---|
| Placed an ETF order | `filled <dollars> @ <price>`, for example `filled 6000 @ 766.10` ($6,000 at an average price of $766.10). Both numbers are on the filled order's detail screen in the account's order history. |
| Placed an option-spread order | `filled <contracts> @ <net price>`, for example `filled 2 @ 7.45` (2 spreads at a net $7.45 a share). Write the net price per share, as Robinhood shows it, not the price per contract, which is 100 times that. For a close, it's the net credit you received. If only some spreads filled, write the number that did. |
| Didn't place it: you chose not to, an email told you to skip it, or a spread order didn't fill even at the stated maximum | `skipped` |

- **Several orders in one email** (a trend-book rebalance): post one comment per order, with the ticker at the end, for example `filled 2500 @ 612.40 QQQ`. For a spread you may add the root the same way: `filled 2 @ 7.45 XSP`.
- **No issue link in the email** (issue creation failed): note the amounts and the prices yourself. The email's "Record your fill" section says so, and the monthly review asks for them.
- **Mistakes:** post a new comment with the right numbers. Don't edit or delete old comments, because they are part of the record. The monthly review reads the comments and counts the latest line per order.
- **Backup channel:** watch the repository (**Watch → All activity**) so GitHub emails you when a trade issue opens, even if Gmail fails.

**In the paper phase** the paper broker fills every order itself, and its fills are the official paper result. Your comments never change them. Your comments measure the human side instead. Two go-live gates depend on them (§6):
- whether each email was handled the same evening (placed, or knowingly skipped);
- if you mirror the trades in a practice (paper-trading) account, how its fills compare with the model. ETF fills are compared in basis points of the price; spread fills in percent of the net price.

---

## 5. Reading the emails

Every email is labelled **PAPER** or **LIVE** and names its module: M1, M2, M3, W10, M4, W8 or W9. Kinds: new trade, exit, trend-book rebalance, Bitcoin switch on or off, and the monthly, quarterly and annual reviews.

**W10, the crash-day buy** (design v3.3, decision 12), holds up to 90 days, like M4 below.
- It buys SPY in the IRA after the first S&P 500 drop of 3% or more in an uptrend, which happens about once every two years.
- The new-trade email names the sell date: the last trading day within 90 calendar days of the purchase.
- An exit email arrives the evening before that date.
- Hold through the swings in between. There is no stop-loss and no early exit, which is how the rule was tested.
- **Shared SPY position.** M1, M2 and W10 can all hold SPY in the same IRA, and Robinhood shows them as one position. An exit email then asks you to sell a number of *shares* (this trade's shares only), not "Sell all".

**M4, the crash call spread** (policy module, 90-day exception):
- It fires after the S&P 500 closes 15% or more below its highest close of the past 252 sessions, with the VIX at 30 or higher. First day only: a new signal needs 90 days since the last. In 1990–2026 it would have fired 26 times, in 12 crises.
- It buys a call debit spread on XSP, the Mini-S&P 500 index (one-tenth of the S&P 500): buy the at-the-money call and sell the 105% call, on the listed expiry nearest to, but not beyond, 90 days after the purchase. SPY replaces XSP only when XSP fails the liquidity check.
- Size: about 2% of the portfolio, in whole contracts, never above 3%. It is skipped if one contract doesn't fit.
- No stop and no profit target. The exit email arrives the evening before the planned close, two trading days before expiry. If that close doesn't fill, a new exit email comes the next evening for the last trading day before expiry.

**W8, the de-escalation call spread** (policy module, small):
- It fires when three things happen on one day: an official announcement that the US blockade of Iran is ending, a Hormuz shipping deal, or a US-Iran ceasefire or peace deal, confirmed by the AI check on official websites (§2d); Brent crude (or BNO) down 6% or more; and a Polymarket market on the blockade ending or Hormuz traffic returning up 15 points, or through 75%.
- It buys a call debit spread on XSP, else SPY, else Delta Air Lines (DAL), 56–75 days to expiry, costing at most 1% of the portfolio. DAL options must expire before Delta's next earnings.
- It never enters when a Fed decision, a CPI report or a payrolls report falls on the entry day or the five trading days after it.
- It exits at the first of: 10 trading days before expiry; a Polymarket ceasefire market falling below 40%; the spread reaching 80% of its maximum value; or 20 trading days, with the exit email on the evening of the 20th.
- It never shorts oil.

**W9, the barrel-loss oil call spread** (paper module):
- It fires when your offline-barrels record meets its rules (§2d), Brent or WTI crude rose 5% or more that day, and the AI check confirms the loss on official websites. It is skipped when crude futures are in steep contango (a roll cost worse than 20% a year).
- It buys a USO call debit spread, 56–75 days to expiry, costing at most 0.75% of the portfolio. USO options often fail the liquidity check, so most W9 signals are only logged.
- It exits at the first of: 10 trading days before expiry; WTI back below its close before the event, or `restored_on` set in your file; the spread worth twice what it cost; or 20 trading days.
- In the live phase W9 stays on paper: its signals are logged, not emailed.

W8 and W9 also pause new entries after a 2% daily loss or a 4% weekly loss, and at a 20% drawdown (design §4).

From top to bottom, an ETF email reads (spread emails below):

1. **The headline box.** The decision at a glance:

   | Field | What it says |
   |---|---|
   | ACTION | What to do, in which ticker and account |
   | SIZE | The amount in dollars and as a % of the portfolio |
   | STRESS | The planning loss if the instrument repeats its worst crash on record |
   | WINDOW | When to place the order |
   | ODDS | The logged forecast |
   | CONFIDENCE | How much weight the forecast deserves |
   | STATUS | PAPER or LIVE, the module and its stage |

2. **In one sentence.** What the trade is and what has to happen for it to pay.
3. **Do this in Robinhood.** At most 7 taps, with the exact values: account, ticker, Trade → Buy or Sell, Market, Dollars, amount, Review → Submit. Place the order any time after the email; Robinhood queues it for the 9:30 ET open.
4. **What if.** What to do when something is off. For example:
   - The price jumps at the open: don't chase it, and don't skip unless an email says so.
   - You missed the open: place it anyway during the day.
   - Robinhood won't take a dollar order: buy the stated number of whole shares.
5. **How you get out (decided now).** The exit rule, fixed before you enter.
   - Example (M1): sell at the next open after SPY first closes above its 5-day average, and at the latest at the open of the 21st session.
   - An exit email arrives when the rule fires, so you don't need to watch the market.
6. **Why this trade, the odds, the risks and tax.**
   - the forecasts logged for scoring;
   - which account it sits in and what that means for tax;
   - your portfolio after the trade.
7. **Record your fill.** The link to the trade's issue (§4).
8. **The footer.**
   - the trade ID, module and constitution version;
   - the data date and sources;
   - the ledger head hash at the moment of the decision;
   - the disclaimer.

**Every number is checked before sending.** Each number in an email is checked against the data; an email that fails the check is not sent, and the run reports a failure instead. The full email design is in `research/11-trade-email-spec.md` and design §3a.

### Option-spread emails (M4, W8, W9)

A spread email has the same sections, with these differences.

- **Subject.** For example: `[PAPER][TRADE T-2026-09-29-M4] BUY 2 XSP 770/810 call spreads, 18 Dec, limit $7.45 — Crash call spread (M4) — after 10:00 ET Wed 30 Sep`. An exit says CLOSE instead of BUY.
- **What you're buying.** The two options, what you pay, the most you can lose (the whole debit), the most the spread can be worth (the gap between the strikes, times 100 per spread), the breakeven, and how it settles.
- **When.** Place it after 10:00 ET on the next trading day, not the evening before.
- **The limit.** One net price per share for the whole spread: the debit you pay to open it, or the credit you receive to close it. One contract is 100 times that. Type it yourself: Robinhood's suggested price moves all day.
- **The stated maximum** (to open) or **stated minimum** (to close). Your one allowed re-price. If the order hasn't filled by 11:00 ET, cancel it and place it once more at that price. Never go beyond it.
- **Skip.** If the re-priced order doesn't fill by the close either, stop:
  - an opening order: skip the trade and comment `skipped`. Skipping is the rule working, not a mistake;
  - a closing order: keep the spread. A new exit email arrives the next evening with fresh prices.
- **SIZE and STRESS.** SIZE is the net debit and its share of the portfolio. STRESS is the most you can lose: the whole debit at the stated maximum.
- **Do this in Robinhood.** Seven steps to open:
  1. After 10:00 ET, switch to the individual account.
  2. Search the root (XSP, SPY, DAL or USO), then **Trade → Trade Options**.
  3. Choose **Buy** and **Call**, then the expiration.
  4. Tap **Select**, then both strikes: **Buy** the lower and **Sell** the higher. Robinhood shows one **Call Debit Spread**; tap **Continue**.
  5. **Limit price**, **Contracts** and **Good for day**, as the email says.
  6. **Review → Submit.** The total should match the email.
  7. Record the fill (§4).

  To close: search the root, tap your spread (strikes, expiry, contracts), then **Trade → Close position**; the limit credit, all contracts, **Good for day**; **Review → Submit**; record the fill.
- **Never leg in or out.** Both legs go in one order. If Robinhood offers only one leg, skip.
- **Closing before expiry.** Every spread is closed at least one trading day before it expires. M4 plans its close two trading days before, which leaves a day for a retry. W8 and W9 close 10 trading days before at the latest.
- **Tax.** XSP options are Section 1256 contracts: 60% of the gain or loss counts as long-term and 40% as short-term, however long you hold them. SPY, DAL and USO options are not: their gains are short-term, taxed as ordinary income.
- **Early exercise.** SPY, DAL and USO options are American-style: the call you sold can be exercised early, most often just before a dividend. The email's risks section says what to do then. XSP options can't be exercised early and settle in cash.
- **The paper book** places the same order itself on the 10:17 ET quotes: it fills at its model price if that is within the limit, or else within the stated maximum or minimum (the re-price). Otherwise it doesn't fill either.

### The quarterly and annual reviews

- **The quarterly review** arrives on 1 January, 1 April, 1 July and 1 October, after the monthly review. Problems come first. It covers: go-live and ramp (§6); results this quarter and since the start, against SPY and T-bills; the edge evidence; realised against claimed edge (κ̂); costs and slippage; how well the forecasts were calibrated; drift from the base rates; recalibration maps; kill switches and module reviews; and the shadow books. Its last section, rule changes, always says none.
- **The annual review** arrives on 1 January, after the quarterly review. It starts with the decisions for you, each with a recommendation. Then: the year's results, the calibration slope, retirement candidates, W10's re-decision against its shadow record, M2's review and pause triggers, the hurdle and the trade budget, and the bar a rule change must clear.
- **The reviews report and recommend. They never change a rule, a size or a module.** Go-live and ramp decisions come from the quarterly review, and you take them. Rule changes are decided with you at the annual review.

---

## 6. Paper to live

**The gates** (design §7; details in track 18 §5.4):

1. **Paper phase.** At least 3 months, with fill model v1.0 frozen.
2. **Going live at 25% size is an operations gate.** All of these must hold:
   - at least 3 months of paper trading;
   - at least 95% of scheduled runs on time (the daily run, and the options job from its first run);
   - zero validator failures;
   - practice-account fills within tolerance of the model: about 10 bp on average for ETFs, and 2% (200 bp) of the net price for option spreads, as a median;
   - at least 90% of trade emails handled;
   - the ledger verifies.
3. **Edge evidence.**
   - P(edge > 0) ≥ 0.7 under a sceptical N(0, 0.1²) prior.
   - It is computed on the wide book of the same rules: the ST-1b signals for M1, every M3 switch, M2's position-months, and W10's record of every uptrend −3% day (90-day score).
   - It stays advisory until the selected book has 30 trades.
4. **Ramp.**
   - **50%** after at least 6 months and 30 live trades, with P ≥ 0.8, κ̂ ≥ 0.2 and implementation shortfall ≤ 20%.
   - **100%** after at least 100 resolved trades (paper at half weight), with P ≥ 0.9 and calibration verified.
   - Expect about **4–5 years (with M2) to 9 years (Lean) before full size**.

The monthly review reports these numbers each month. The quarterly review turns them into a go-live and ramp recommendation.

**How to switch, once the gates pass:**

1. **Hold the go-live review (Phase C in design §10).** It confirms the gates from the quarterly reviews and decides how the 25% pilot size is applied. The build has no live-size setting of its own.
2. **Edit `config/account.yaml` on `master`.** On GitHub: open the file, click the pencil icon, change `mode: paper` to `mode: live`, then **Commit changes**.
3. **Place the orders with real money.** From the next run on, emails and issues say **LIVE**. Record every fill on its issue (§4). W9 stays on paper: in live mode its signals are logged, not emailed.

To go back to paper, set `mode: paper` again.

---

## 7. Pausing or stopping

**Pause a job.** **Actions →** choose `daily` (or `weekly`, `monthly`, `options`, `hourly`) in the left-hand list **→ … menu → Disable workflow.** Enable it the same way. With the GitHub CLI: `gh workflow disable daily` and `gh workflow enable daily`. Also pause the matching checks in healthchecks.io, or they will alert.

**While `daily` is off, nothing is watched:**
- no exit emails for open positions or spreads;
- no paper fills at the open;
- no marks.

Before pausing, look at the open positions (`python -m traderec status`, or `state/state.json`) and decide what to do with any real ones yourself.

**While `options` is off:**
- the paper book fills no spread orders. The evening emails still arrive; placing real orders is up to you;
- a spread order whose trading day has passed is cancelled at the next options run: an opening order is then skipped, and a closing order goes out again that evening if it is still due;
- the evening run still values open spreads, and settles any spread still open on its expiry date at its value that day, with an alert;
- the option shadow books open no new spreads and skip their 10:17 ET checks. ST-2, which trades SPY, still runs.

**While `hourly` is off,** the stablecoin depeg monitor (M6) stops. Nothing else depends on it.

**The hourly job's Actions minutes.** GitHub bills each run as a whole minute, so the job uses about 730 minutes a month (744 in a 31-day month). With the other jobs the total is about 850–950 a month. GitHub Free includes 2,000 minutes a month for private repositories (3,000 on Pro and Team); public repositories are free. Beyond that, minutes cost about $0.006–0.008 each at GitHub's list prices, about $4–6 a month for this job; check your plan. Your options:
- **Halve it:** in `.github/workflows/hourly.yml`, change the cron to `"41 */2 * * *"` (every 2 hours). The one US precedent took about two days to recover, so checking every 2 hours would still have caught it.
- **Switch it off:** disable the `hourly` workflow as above, or run `gh workflow disable hourly`. Re-enable it the same way.
- **Keep the job but stop the monitor:** set `shadow.M6.depeg.enabled: false` in `config/constitution.yaml`. That is a rule change (below), and the job still bills its minute every hour.
- **For good:** delete the `schedule:` block in `hourly.yml`. The **Run workflow** button still works for manual runs.

**When you enable a job again,** the next run processes its own date. Days in between aren't replayed, and signals on those days are simply missed.

**Stop for good.** Disable all five scheduled workflows: `daily`, `weekly`, `monthly`, `options` and `hourly`. The repository keeps the complete record.

**Turning a single module or shadow book off** (`enabled: false` under it in `config/constitution.yaml`) is a rule change. Record it in `research/DECISIONS.md`, because design §8 limits how often rules may change.

---

## 8. Where state lives

Everything the system knows is in `state/`, committed by the workflows after each run.

| Path | Contents |
|---|---|
| `state/state.json` | The paper book (cash, ETF positions, option spreads, pending orders), module memory, the shadow books, open forecasts, the run log (which job ran for which date, and its status), counters, alerts, and emails waiting to be retried |
| `state/ledger.jsonl` | The append-only ledger, one JSON record per line: run manifests, data snapshots, signals, recommendations, orders, fills, marks, forecasts, resolutions, shadow records, the monthly, quarterly and annual reviews, and corrections. Each record carries the hash of the one before it, so any edit, deletion or reordering is detectable |
| `state/options/<date>/<root>-<HHMM>.csv.gz` | Option-quote snapshots from the options job and the evening marks: every option the book holds or has ordered, plus a sample of the chain for the modules. At most about 100 KB a day in all |
| `state/inputs/w9_supply_loss.json` | Your W9 record of oil exports taken offline (§2d), once you have added one |
| `state/outbox/` | Emails saved as `.eml` files instead of being sent (before the Gmail secrets exist), plus a copy of any email Gmail refused. A dry run's copies go into that run's artifact instead |
| `state/pre_run.json` | The state as it was just before the most recent run. `--force` restores it to redo that run |
| `state/venue_check.json` | The latest monthly venue check (see §9) |

**State commits.** Each commit is authored by `github-actions[bot]` with a message like `state: daily run 2026-10-02 [skip ci]`, where the date is the UTC date of the run. The options job writes `state: options run …`, and the monthly workflow `state: monthly+quarterly run …` after a quarter ends. The hourly job commits only in an hour when a depeg event starts, changes or ends, as `state: hourly run 2026-10-02T14Z [skip ci]`; most hours it commits nothing. The git history is the timeline.

**Verify the ledger yourself:**

```bash
git pull
pip install -r requirements.txt
python -m traderec verify-ledger   # prints "OK: ..." or "FAILED: ..." with the first bad record
python -m traderec status          # prints the paper book, open spreads and pending spread orders
```

Every run that records anything verifies the ledger first. It stops if the chain is broken or the ledger no longer matches the state.

**Don't edit `state/` by hand, and don't push a `state/` from your own computer.** The workflows own it. A hand edit breaks the hash chain and stops the next run. **The one exception is W9's file**, `state/inputs/w9_supply_loss.json`: it isn't part of the ledger, so add or edit it on GitHub as §2d describes.

---

## 9. Troubleshooting

**The runs are green, but no email arrives.** In the log of the pipeline step, each email line ends with its outcome:
- `-> sent` — it was sent;
- `-> outbox` — not all four Gmail secrets are set (§2b), so the email was saved in `state/outbox/` instead. Read it there on GitHub, or download it and open it in a mail app;
- `-> failed` — Gmail refused it, and the run is marked as failed (next item).

**A run fails with "could not be sent through Gmail".** Gmail refused an email. The run itself completed and its state was saved.
1. **Act on the email.** A copy is in `state/outbox/`; act on it if its orders are still current. The pipeline retries sending it at the next run, while its orders are still current, and then drops it with an alert.
2. **Find the cause.** The pipeline log's `email not sent: …` line says why. `token refresh failed (invalid_grant)` means the refresh token expired or was revoked.
   - The usual cause is an OAuth app still in *Testing*, where tokens expire after 7 days.
   - A Google password change also revokes the token.
3. **Fix it.** Publish the app (§2b step 5), run the setup script again (§2b steps 7–8), and replace `GMAIL_REFRESH_TOKEN`.
   - If the script says Google returned no refresh token, remove the app's access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and run it again.

**Runs start late, or a whole night is missing.**
- GitHub starts scheduled runs when it has capacity: usually within minutes, sometimes an hour late. Under heavy load it can drop a run entirely. That is why there are two slots a night and a healthchecks.io alarm.
- A late run still processes the right session, because scheduled runs name their date explicitly.
- **If both slots of a night were missed and no later night has run yet,** run it yourself: **Actions → daily → Run workflow**, with **date** set to the missed session and **force** unticked. Do it before the next 9:30 ET open if you can, so the orders are still actionable.
- **If a later night has already run,** don't back-fill the missed one.

**"Data not available yet" (exit code 3).** The session's prices weren't published when the run started. Nothing was saved.
- The first slot only warns; the second slot retries an hour later.
- If the second slot also fails (a red run), run `daily` by hand for that date once the data is there, for example the next morning before 9:30 ET.

**"Two-source check failed" or "new M1 entries blocked".** The system **fails closed**:
- If a closing price can't be confirmed by a second source, it opens no new position that depends on it that night, and it records an alert.
- Usually the next night is fine.
- If it keeps happening, the log names the source: Yahoo Finance, Nasdaq, Robinhood quotes, CBOE, Coinbase or FRED.

**Re-running a date.**
- **The date never ran, or stopped with "data not available":** **Run workflow** with that **date**, force unticked.
- **The most recent run went wrong and you have fixed the cause:** **Run workflow** with the same **date** and **force** ticked.
  - The run is redone from its pre-run snapshot, and a correction record goes into the ledger.
  - Its emails and issues are created again, so close the duplicate issues.
  - **Only the most recent run can be forced.** That includes options runs, reviews and the rare hours the hourly job records: after the hourly job records a depeg event, an earlier run can no longer be forced.
- Tick **dry_run** first if you want to see what would happen.

> **Placeholder: replay build pending** (`docs/phase-b/replay.md`). How to replay past dates goes here.

**"Could not push the state commit".** The run finished, but its state couldn't be saved; its emails may already have gone out.
- Usual causes: branch protection on `master` (see §2g step 4), or someone changed `state/` at the same moment.
- The run's `state/` folder is attached to the run as an artifact, so you can inspect it.
- Fix the cause, then run the same date again **without** force. The repository never recorded that run. Expect its emails once more.

**An issue titled "Venue check failed" or "Venue check could not run".** The monthly check re-reads Robinhood's and Coinbase's public instrument data (`research/code/20-executability/check_venues.py`) and compares it with `config/whitelist.yaml`.
- **If an instrument really can't be traded as listed any more,** remove it from `config/whitelist.yaml` (no email can then contain it) and close the issue.
- **If every instrument fails at once,** the lookup was probably refused (for example, the API blocked GitHub's servers). Confirm in the app, re-run `monthly` with **dry_run** ticked to check again, and close the issue.

**The workflows don't appear, or never run.** They must be on `master`, and Actions must be allowed (§2g). The first scheduled run is the next slot after the merge.

**healthchecks.io says "down", then "up" an hour later.** The first slot hit a problem, often "data not available yet", and the second slot recovered. Nothing to do.

**The options run says "too early" or "too late".** Nothing is wrong. Paper spread fills use only quotes from 10:15–16:00 ET. In winter the 14:17 UTC slot is 09:17 ET, so it stops at once and the 15:17 UTC slot does the work. A manual run with **date** empty works only inside that window on a trading day.

**The options run fails with "no usable market-hours option quotes" (exit code 3).** The option quotes for today's spread orders couldn't be read, so nothing was filled and the orders stay pending.
- In summer the 15:17 UTC slot (11:17 ET) retries on its own.
- In winter there is no later slot: run **Actions → options → Run workflow** yourself before 16:00 ET, with **date** empty.
- If no run succeeds that day, the next options run cancels those orders, because a day order can't fill a day late. An opening order is then skipped. A closing order goes out again as a new exit email that evening, if it is still due.
- Your real orders are unaffected: place them as the email says.

**An alert says an order "is still pending after its 10:17 ET session; check the options job".** The options job didn't run or didn't succeed that day. See the item above, and the log under **Actions → options**.

**A spread wasn't closed before expiry.** The rules close every spread at least one trading day before expiry, so these alerts mean the closing orders didn't fill:
- "was not closed by …, the last session before its expiry" (an M4 `fill` alert, the evening before expiry): the paper book will settle it at expiry. If you still hold the spread in Robinhood, close it yourself the next morning after 10:00 ET; otherwise Robinhood may close it for you on expiration day, from 3:30 PM ET (design §3a).
- an `expiry` alert: the paper book settled a spread still open on its expiry date at its value from that day's official close.

**A spread's exit can't be priced** ("cannot be priced tonight", or "no two-sided quote for its legs"). A leg has no bid, usually because the spread is nearly worthless. No exit email can go out without prices, so the system tries again each evening. If it never can, the paper book settles the spread at expiry at its value then, usually near zero.

**`veto` alerts (W8, W9).**
- These block the candidate: it is logged in the shadow ledger, not emailed, so there is nothing to place.
  - "`TRADEREC_VETO_MODEL` is not set" or "`ANTHROPIC_API_KEY` is not set": add the secrets (§2d).
  - An HTTP error: check the key and the credit balance in the Claude Console.
  - "invalid": the answer couldn't be read, or said PROCEED without two valid official citations. Nothing to fix: the check failed closed, as designed.
  - "the veto prompt differs from the constitution's pinned prompt_sha256": the veto's prompt was changed without the matching constitution change. That is a code problem: tell Claude.
- "the veto model changed": `TRADEREC_VETO_MODEL` was changed, and the new model is pinned from that day. The check itself still ran. If you didn't mean to change the model, set it back.

**`data` alerts from W8 or W9.** Polymarket or Kalshi unreachable, a market that can't be mapped, or a missing crude-futures price: W8 and W9 open nothing that night (they fail closed). A failing feed alerts once when it starts, then only adds a note each night until it recovers. Nothing to do unless it lasts for weeks.

**"W9: unreadable supply-loss input".** `state/inputs/w9_supply_loss.json` isn't valid JSON, or has no `events` list. Fix it on GitHub (§2d).

**The hourly job warns "No usable stablecoin quotes this hour" (exit code 3).** No venue answered. Nothing was saved, and the next hour tries again. healthchecks.io alerts only after about 4 hours of this.

**"option shadow books fail closed: …" (`data`).** An option shadow book lacked a price, for example a VIX3M close, and skipped that entry. Nothing to do.

**A `shadow` alert: "… failed: …".** A shadow book raised an error. The other books and every trading module still ran. Tell Claude.

**Macro shadow book alerts.** They concern `config/econ_calendar.yaml`. That file is data, not a rule, so editing it is not a rule change.
- "config/econ_calendar.yaml has no CPI, NFP, GDP, PCE dates …" (monthly, from 1 January 2027): BLS and BEA hadn't published their 2027 schedules when the file was written. When they do, add the dates from the `source` pages, move `covered` forward and update `verified`.
- "the release calendar was last verified …; re-check the dates" (monthly, once `verified` is more than 60 days old): compare the file with the official schedules and update `verified`.
- A release is postponed, for example by a government shutdown: mark its line `status: postponed` and add the new date as a line of its own.
- A note in the daily run's log about GLD up 2% or more "with no war onset listed": decide whether it was the start of a war. If so, add it under `geopolitical_onsets` as `{date, label, during_session}`, where `during_session: false` means the news came after the close or on a closed day. List onsets the evening they happen: one first seen by a later run is recorded but doesn't count toward the gold fade's evidence.

> **Placeholder: EDGAR build pending** (`docs/phase-b/edgar.md`). The EDGAR screens' alerts and what to do about them go here.
