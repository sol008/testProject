# Operations guide

How to set up, run and look after `traderec`, step by step. The design is `research/00-SYSTEM-DESIGN-v3.md` (v3.2); the component contracts are in `docs/INTERFACES.md`.

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

**It starts in the paper phase.** A paper broker fills every order itself at the next open, using a frozen fill model (v1.0), and scores the result.
- The emails are real and labelled **PAPER**. No real money is involved until the go-live gates in §6 pass.
- Handling each email as if it were real is still part of the test (§4).

**What arrives, and when** (all times New York):

| Email | When | Workflow |
|---|---|---|
| Orders for the next morning's open: a new trade, an exit, or the monthly trend-book rebalance | Weekday evenings, from about 22:17 in summer (EDT) and 21:17 in winter (EST), only when there is something to do | `daily` |
| The Bitcoin switch (M3): an IBIT order for Monday's open | Sunday evening, from about 21:17 in summer and 20:17 in winter, only when there is an order | `weekly` |
| The monthly review: results, operations, evidence, failures first | The 1st of each month, about 08:13 in summer and 07:13 in winter | `monthly` |

**Most evenings nothing arrives. No email means nothing to do.** You'll know the system is alive from:
- healthchecks.io, which emails you if a run is missed or fails (§2e);
- the monthly review.

**Two runs a night.** The GitHub cron clock is UTC, so each evening job is scheduled twice, one hour apart:
- `daily` at 02:17 and 03:17 UTC;
- `weekly` at 01:17 and 02:17 UTC.

The first slot does the work. The second slot finds the date already done and stops, unless the first failed, in which case it is the retry.

---

## 2. One-time setup

### (a) Make the repository private

GitHub → the repository → **Settings → General → Danger Zone → Change visibility → Private**.

Why:
- `state/` holds your positions, the ledger and copies of unsent emails (with a placeholder address, never yours).
- The market-data terms are personal use only.

Private repositories get 2,000 free Actions minutes a month on GitHub Free. This system uses a few hundred.

### (b) Merge the build branch into `master`

Scheduled workflows run only on the default branch, and the **Run workflow** button only appears for workflows that are on it.

1. **Pull requests → New pull request.** Set base to `master` and compare to `claude/clever-keller-vuvr50`, then **Create pull request → Merge**.
2. **Settings → General → Default branch** must say `master`.
3. **Settings → Actions → General:** Actions must be allowed, at least for actions created by GitHub.
   - You don't need to change **Workflow permissions**: each workflow asks for exactly what it needs (`contents: write` to save `state/`, `issues: write` for trade issues).
4. If you add branch protection or rulesets to `master`, don't require pull requests or status checks for it. The workflows push a state commit after every run, and GitHub's built-in token can't bypass those rules.

After the merge, the **Actions** tab lists four workflows: `daily`, `weekly`, `monthly` and `ci`.

### (c) Create the Actions secrets

**Settings → Secrets and variables → Actions → New repository secret.** Use repository secrets, not environment secrets.

| Secret | Value | What happens without it |
|---|---|---|
| `GMAIL_CLIENT_ID` | From step (d) | Runs work normally but save each email as an `.eml` file in `state/outbox/` instead of sending it |
| `GMAIL_CLIENT_SECRET` | From step (d) | (same) |
| `GMAIL_REFRESH_TOKEN` | From step (d) | (same) |
| `ALERT_TO_EMAIL` | The address that receives the emails, normally your own Gmail | (same) |
| `HC_PING_URL_DAILY` | Ping URL of the `daily` check, from step (e) | No missed-run alarm for the evening job |
| `HC_PING_URL_WEEKLY` | Ping URL of the `weekly` check | No alarm for the Sunday job |
| `HC_PING_URL_MONTHLY` | Ping URL of the `monthly` check | No alarm for the monthly job |

Don't create `GITHUB_TOKEN`: GitHub provides one to every run.

### (d) Gmail OAuth: the sending credential

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
7. On your own computer, in a clone of this repository, run the helper. It needs only Python 3 and `requests`.
   ```bash
   pip install requests
   python scripts/gmail_oauth_setup.py --client-secret-json ~/Downloads/client_secret_XXXX.json
   ```
   - A browser opens. If it doesn't, add `--no-browser` and paste the printed URL into one.
   - Sign in with the Gmail account that will **send** the emails.
   - Google warns that it "hasn't verified this app". That is expected for your own app: choose **Advanced → Go to traderec (unsafe)**, then allow sending email on your behalf. The permission is send-only: it can't read your mail.
   - The script prints the **refresh token** and nothing else. Treat it like a password.
8. Add the four secrets from step (c):

   | Secret | Where the value comes from |
   |---|---|
   | `GMAIL_REFRESH_TOKEN` | The token the script printed |
   | `GMAIL_CLIENT_ID` | `client_id` in the downloaded JSON |
   | `GMAIL_CLIENT_SECRET` | `client_secret` in the downloaded JSON |
   | `ALERT_TO_EMAIL` | The Gmail address you signed in with. Emails go from and to it |

The token stops working if you change your Google password, or if it goes unused for 6 months. The monthly review keeps it in use. To replace it, repeat steps 7 and 8.

### (e) healthchecks.io: the missed-run alarm

A scheduled run that GitHub drops produces no error anywhere. healthchecks.io notices the silence.

1. Sign up at [healthchecks.io](https://healthchecks.io) (the free plan is enough). Email alerts go to your sign-up address by default.
2. Create three checks. For each, choose **Cron** as the schedule type:

   | Check | Cron expression | Time zone | Grace time | Its ping URL goes in |
   |---|---|---|---|---|
   | `traderec daily` | `17 21 * * 1-5` | `America/New_York` | 2 hours 15 minutes | `HC_PING_URL_DAILY` |
   | `traderec weekly` | `17 20 * * 0` | `America/New_York` | 2 hours 15 minutes | `HC_PING_URL_WEEKLY` |
   | `traderec monthly` | `13 12 1 * *` | `UTC` | 3 hours | `HC_PING_URL_MONTHLY` |

3. Copy each check's ping URL (`https://hc-ping.com/…`) into its secret.

Why these times:
- The schedule is the earliest time each job does its work:
  - `daily` works at 21:17 ET in winter and 22:17 ET in summer;
  - `weekly` works an hour earlier than `daily`.
- The grace time covers the summer slot and the retry an hour later.
- You get an alert if no run has succeeded by about **23:30 ET** on a weekday (the design's target), 22:30 ET on a Sunday, or 15:15 UTC on the 1st.

Who pings:
- The pipeline sends *start*, then *success* or *fail*. It also sends *fail* when the number check blocked an email, or an email couldn't be sent.
- The workflow adds a *fail* if anything around the pipeline breaks: setup, saving the state, a refused email, or the venue check.
- Dry runs never ping. A second slot that finds the night already done pings nothing.

GitHub can also email you about failed runs: your account's **Settings → Notifications → Actions**.

### (f) The first run: a dry run

1. **Actions → daily → Run workflow.** Choose branch `master`, tick **dry_run**, then **Run workflow**.
   - Before about 18:00 ET, today's session isn't final yet. Put the previous trading day in **date**.
2. After a few minutes the run should be green.
   - Open it: the log of **Run the daily pipeline** ends with a summary such as `daily 2026-10-01: ok (dry run)`, followed by the NAV, any emails and any notes.
3. Under **Artifacts**, download `state-daily-<run id>`. Its `outbox/` folder holds, as `.eml` files, the emails the run would have sent (often none). Open them with any mail app.
4. Do the same for **weekly**.

A dry run sends nothing, opens no issues and commits nothing. After that, there is nothing else to do: the next scheduled run creates `state/` and commits it.

---

## 3. Robinhood checklist

- [ ] **IRA: dollar orders work.** In the app, switch to the IRA and go to **Search SPY → Trade → Buy**. Check that you can enter the order in **dollars** (fractional shares). Don't submit. The system's ETF orders are all dollar amounts.
- [ ] **Taxable (individual, margin) account: options Level 3 and index options.** This is needed only in Phase B, for option spreads. Today's modules don't use options.
- [ ] **Your IRA is at Robinhood.** If it's elsewhere, place the same order there: a market order for the stated dollar amount. The steps in the email use Robinhood's wording.

**Which trades go where:**

| Trade | Account | Order |
|---|---|---|
| M1 dip-buy (SPY) | Robinhood IRA | Market order in dollars, queued for the open |
| M2 trend book (SPY, QQQ, IEF, GLD, USO, FXE, FXY, FXA) | Robinhood IRA | At most 3 market orders in dollars per rebalance |
| M3 Bitcoin switch (IBIT) | Robinhood IRA | Market order in dollars. Coinbase is optional and off by default |
| Option spreads (Phase B: M4 crash call spread, W8) | Robinhood taxable account (IRAs allow no spreads) | One two-leg spread at a single net limit price, placed after 10:00 ET |

**Order rules:**
- Use only the order kinds the email names.
- **Never** stop, stop-limit, trailing-stop, bracket/OCO, market-on-close or 24-hour-market orders.
- A market order placed in the evening waits for the 9:30 ET open. Robinhood's overnight market accepts only limit orders, so a market order can't fill overnight by accident.
- Option spreads are always closed at least one trading day before expiry.
- Don't change the amounts, and don't place orders that no email asked for.
- Idle cash can sit in the account's cash sweep or in SGOV. The system doesn't send cash-management trades.

---

## 4. Recording fills

Every trade email links to that trade's GitHub issue: one issue per trade, labelled `traderec`, `paper` or `live`, and the module. After you act on an email, comment on its issue. The GitHub mobile app works well for this: tap the link in the email and write in the comment box.

| You… | Comment |
|---|---|
| Placed the order | `filled <dollars> @ <price>`, for example `filled 6000 @ 766.10` ($6,000 at an average price of $766.10). Both numbers are on the filled order's detail screen in the account's order history. |
| Didn't place it: you chose not to, or an email told you to skip it | `skipped` |

- **Several orders in one email** (a trend-book rebalance): post one comment per order, with the ticker at the end, for example `filled 2500 @ 612.40 QQQ`.
- **No issue link in the email** (issue creation failed): note the dollars and the price yourself. The email's "Record your fill" section says so, and the monthly review asks for them.
- **Mistakes:** post a new comment with the right numbers. Don't edit or delete old comments, because they are part of the record. The monthly review reads the comments and counts the latest line per order.
- **Backup channel:** watch the repository (**Watch → All activity**) so GitHub emails you when a trade issue opens, even if Gmail fails.

**In the paper phase** the paper broker fills every order itself, and its fills are the official paper result. Your comments never change them. Your comments measure the human side instead. Two go-live gates depend on them (§6):
- whether each email was handled the same evening (placed, or knowingly skipped);
- if you mirror the trades in a practice (paper-trading) account, how its fills compare with the model.

---

## 5. Reading the emails

Every email is labelled **PAPER** or **LIVE** and names its module (M1, M2, M3 or W10). Kinds: new trade, exit, trend-book rebalance, Bitcoin switch on or off, and the monthly review.

**W10, the crash-day buy** (design v3.3, decision 12), is the only rule that holds longer than 60 days.
- It buys SPY in the IRA after the first S&P 500 drop of 3% or more in an uptrend, which happens about once every two years.
- The new-trade email names the sell date: the last trading day within 90 calendar days of the purchase.
- An exit email arrives the evening before that date.
- Hold through the swings in between. There is no stop-loss and no early exit, which is how the rule was tested.
- **Shared SPY position.** M1, M2 and W10 can all hold SPY in the same IRA, and Robinhood shows them as one position. An exit email then asks you to sell a number of *shares* (this trade's shares only), not "Sell all"

From top to bottom:

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

---

## 6. Paper to live

**The gates** (design §7; details in track 18 §5.4):

1. **Paper phase.** At least 3 months, with fill model v1.0 frozen.
2. **Going live at 25% size is an operations gate.** All of these must hold:
   - at least 3 months of paper trading;
   - at least 95% of scheduled runs on time;
   - zero validator failures;
   - practice-account fills within tolerance of the model (about 10 bp on average for ETFs);
   - at least 90% of trade emails handled;
   - the ledger verifies.
3. **Edge evidence.**
   - P(edge > 0) ≥ 0.7 under a sceptical N(0, 0.1²) prior.
   - It is computed on the wide book of the same rules: the ST-1b signals for M1, every M3 switch, and M2's position-months.
   - It stays advisory until the selected book has 30 trades.
4. **Ramp.**
   - **50%** after at least 6 months and 30 live trades, with P ≥ 0.8, κ̂ ≥ 0.2 and implementation shortfall ≤ 20%.
   - **100%** after at least 100 resolved trades (paper at half weight), with P ≥ 0.9 and calibration verified.
   - Expect about **4–5 years (with M2) to 9 years (Lean) before full size**.

The monthly review reports these numbers.

**How to switch, once the gates pass:**

1. **Hold the go-live review (Phase C in design §10).** It confirms the gates from the monthly reviews and decides how the 25% pilot size is applied. Phase A has no live-size setting of its own.
2. **Edit `config/account.yaml` on `master`.** On GitHub: open the file, click the pencil icon, change `mode: paper` to `mode: live`, then **Commit changes**.
3. **Place the orders with real money.** From the next run on, emails and issues say **LIVE**. Record every fill on its issue (§4).

To go back to paper, set `mode: paper` again.

---

## 7. Pausing or stopping

**Pause a job.** **Actions →** choose `daily` (or `weekly`, `monthly`) in the left-hand list **→ … menu → Disable workflow.** Enable it the same way. With the GitHub CLI: `gh workflow disable daily` and `gh workflow enable daily`. Also pause the matching checks in healthchecks.io, or they will alert.

**While `daily` is off, nothing is watched:**
- no exit emails for open positions;
- no paper fills;
- no marks.

Before pausing, look at the open positions (`python -m traderec status`, or `state/state.json`) and decide what to do with any real ones yourself.

**When you enable it again,** the next run processes its own date. Days in between aren't replayed, and signals on those days are simply missed.

**Stop for good.** Disable all three scheduled workflows. The repository keeps the complete record.

**Turning a single module off** (`enabled: false` under the module in `config/constitution.yaml`) is a rule change. Record it in `research/DECISIONS.md`, because design §8 limits how often rules may change.

---

## 8. Where state lives

Everything the system knows is in `state/`, committed by the workflows after each run.

| Path | Contents |
|---|---|
| `state/state.json` | The paper book (cash, positions, pending orders), module memory, the shadow book, open forecasts, the run log (which job ran for which date, and its status), counters, alerts, and emails waiting to be retried |
| `state/ledger.jsonl` | The append-only ledger, one JSON record per line: run manifests, data snapshots, signals, recommendations, orders, fills, marks, forecasts, resolutions and corrections. Each record carries the hash of the one before it, so any edit, deletion or reordering is detectable |
| `state/outbox/` | Emails saved as `.eml` files instead of being sent (before the Gmail secrets exist), plus a copy of any email Gmail refused. A dry run's copies go into that run's artifact instead |
| `state/pre_run.json` | The state as it was just before the most recent run. `--force` restores it to redo that run |
| `state/venue_check.json` | The latest monthly venue check (see §9) |

**State commits.** Each commit is authored by `github-actions[bot]` with a message like `state: daily run 2026-10-02 [skip ci]`, where the date is the UTC date of the run. The git history is the timeline.

**Verify the ledger yourself:**

```bash
git pull
pip install -r requirements.txt
python -m traderec verify-ledger   # prints "OK: ..." or "FAILED: ..." with the first bad record
python -m traderec status          # prints the paper book
```

Every run also verifies the ledger before doing anything. It stops if the chain is broken or the ledger no longer matches the state.

**Don't edit `state/` by hand, and don't push a `state/` from your own computer.** The workflows own it. A hand edit breaks the hash chain and stops the next run.

---

## 9. Troubleshooting

**The runs are green, but no email arrives.** In the log of the pipeline step, each email line ends with its outcome:
- `-> sent` — it was sent;
- `-> outbox` — not all four Gmail secrets are set (§2c), so the email was saved in `state/outbox/` instead. Read it there on GitHub, or download it and open it in a mail app;
- `-> failed` — Gmail refused it, and the run is marked as failed (next item).

**A run fails with "could not be sent through Gmail".** Gmail refused an email. The run itself completed and its state was saved.
1. **Act on the email.** A copy is in `state/outbox/`; act on it if its orders are still current. The pipeline retries sending it at the next run, while its orders are still current, and then drops it with an alert.
2. **Find the cause.** The pipeline log's `email not sent: …` line says why. `token refresh failed (invalid_grant)` means the refresh token expired or was revoked.
   - The usual cause is an OAuth app still in *Testing*, where tokens expire after 7 days.
   - A Google password change also revokes the token.
3. **Fix it.** Publish the app (§2d step 5), run the setup script again (§2d steps 7–8), and replace `GMAIL_REFRESH_TOKEN`.
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
  - **Only the most recent run can be forced.**
- Tick **dry_run** first if you want to see what would happen.

**"Could not push the state commit".** The run finished, but its state couldn't be saved; its emails may already have gone out.
- Usual causes: branch protection on `master` (see §2b step 4), or someone changed `state/` at the same moment.
- The run's `state/` folder is attached to the run as an artifact, so you can inspect it.
- Fix the cause, then run the same date again **without** force. The repository never recorded that run. Expect its emails once more.

**An issue titled "Venue check failed" or "Venue check could not run".** The monthly check re-reads Robinhood's and Coinbase's public instrument data (`research/code/20-executability/check_venues.py`) and compares it with `config/whitelist.yaml`.
- **If an instrument really can't be traded as listed any more,** remove it from `config/whitelist.yaml` (no email can then contain it) and close the issue.
- **If every instrument fails at once,** the lookup was probably refused (for example, the API blocked GitHub's servers). Confirm in the app, re-run `monthly` with **dry_run** ticked to check again, and close the issue.

**The workflows don't appear, or never run.** They must be on `master`, and Actions must be allowed (§2b). The first scheduled run is the next slot after the merge.

**healthchecks.io says "down", then "up" an hour later.** The first slot hit a problem, often "data not available yet", and the second slot recovered. Nothing to do.
