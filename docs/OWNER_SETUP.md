# Your to-do list: every step, with links

About 45 minutes in all, split across a few sittings. Do Part 1 now. Do Part 2 after Claude says the Phase B build is ready to merge. Part 3 is ongoing.

The detailed reference for each step is `docs/OPERATIONS.md` §2–§4.

---

## Part 1 — now

### 1. Make the repository private (2 minutes)

1. Open **https://github.com/sol008/testProject/settings**.
2. Scroll to **Danger Zone** at the bottom.
3. Click **Change visibility → Change to private**, then confirm.

Why: `state/` will hold your paper positions and the trade ledger, and the market-data terms are personal use only.
Help: [GitHub: setting repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

### 2. The Gmail sending credential (about 20 minutes, once)

The system emails you through your own Gmail with a **send-only** permission. It can't read your mail.

1. **Create a Google Cloud project.** Open **https://console.cloud.google.com/projectcreate**, name it `traderec`, and click **Create**. Make sure the new project is selected in the top bar.
2. **Enable the Gmail API.** Open **https://console.cloud.google.com/apis/library/gmail.googleapis.com** and click **Enable**.
3. **Set up the consent screen.** Open **https://console.cloud.google.com/auth/overview** and click **Get started**.
   - App name: `traderec`. Support email: your Gmail.
   - Audience: **External**. Contact email: your Gmail. Agree, then **Create**.
4. **Add the scope.** Open **https://console.cloud.google.com/auth/scopes** and click **Add or remove scopes**.
   - Paste `https://www.googleapis.com/auth/gmail.send` into **Manually add scopes**.
   - Click **Add to table → Update → Save**.
5. **Add yourself as a test user.** Open **https://console.cloud.google.com/auth/audience**. Under **Test users**, click **Add users**, enter your Gmail, then **Save**.
6. **Publish the app** (important). On the same Audience page, click **Publish app → Confirm**. The status must read **In production**.
   - If it stays in *Testing*, Google expires the token after 7 days and the emails stop.
   - You don't need Google's verification for personal use.
7. **Create the OAuth client.** Open **https://console.cloud.google.com/auth/clients** and click **Create client**.
   - Application type: **Desktop app**. Name: `traderec`. Click **Create**.
   - Click **Download JSON**. Keep the file out of the repository folder.
8. **Get the refresh token, on your own computer.** You need Python 3 and git.
   ```bash
   git clone https://github.com/sol008/testProject.git
   cd testProject
   git checkout claude/clever-keller-vuvr50      # after the merge in Part 2, `master` works too
   pip install requests
   python scripts/gmail_oauth_setup.py --client-secret-json ~/Downloads/client_secret_XXXX.json
   ```
   - A browser opens. Sign in with the Gmail that should send the emails.
   - Google warns "Google hasn't verified this app". That is expected for your own app: click **Advanced → Go to traderec (unsafe) → Continue**.
   - The script prints one **refresh token**. Treat it like a password.
9. **Add four secrets.** Open **https://github.com/sol008/testProject/settings/secrets/actions/new** once per secret: type the name, paste the value, click **Add secret**.

   | Name | Value |
   |---|---|
   | `GMAIL_CLIENT_ID` | `client_id` from the downloaded JSON |
   | `GMAIL_CLIENT_SECRET` | `client_secret` from the downloaded JSON |
   | `GMAIL_REFRESH_TOKEN` | The token the script printed |
   | `ALERT_TO_EMAIL` | Your Gmail address: emails go from and to it |

Until these exist, nothing breaks: the emails are saved as `.eml` files in `state/outbox/` instead of being sent.

### 3. healthchecks.io: the "a run was missed" alarm (10 minutes)

GitHub sometimes silently skips a scheduled run. healthchecks.io emails you when a job goes quiet.

1. Sign up at **https://healthchecks.io/**. The free plan is enough, and alerts go to your sign-up email.
2. Click **Add Check** once per row below.
   - For a **Cron** schedule, open the check's **Schedule** tab, choose **Cron**, and set the expression, time zone and grace time.
   - For a **Simple** schedule, set the period and grace time.

   | Check name | Schedule | Time zone | Grace time | Secret name for its ping URL |
   |---|---|---|---|---|
   | traderec daily | Cron `17 21 * * 1-5` | America/New_York | 2 h 15 min | `HC_PING_URL_DAILY` |
   | traderec weekly | Cron `17 20 * * 0` | America/New_York | 2 h 15 min | `HC_PING_URL_WEEKLY` |
   | traderec monthly | Cron `13 12 1 * *` | UTC | 3 h | `HC_PING_URL_MONTHLY` |
   | traderec options (Phase B) | Cron `17 10 * * 1-5` | America/New_York | 2 h 30 min | `HC_PING_URL_OPTIONS` |
   | traderec hourly (Phase B, optional) | Simple: period 1 hour | — | 3 h | `HC_PING_URL_HOURLY` |

3. Copy each check's ping URL (`https://hc-ping.com/…`). Add it as a secret at **https://github.com/sol008/testProject/settings/secrets/actions/new**, under the name in the last column.

### 4. The AI veto for the W8/W9 macro trades (5 minutes)

W8/W9 trades need an AI check that can only **block** a trade, never start one. Without these two secrets, W8/W9 never trade; they are logged in the shadow ledger instead.

1. Create an API key at **https://platform.claude.com/settings/keys** (**Create Key**), and add a few dollars of credit at **https://platform.claude.com/settings/billing**. A veto check costs cents, and W8/W9 fire a few times a year at most.
   - Web search must be allowed for your organisation in the Console's settings. If your organisation keeps its own list of allowed domains, it must include the veto's (`veto.allowed_domains` in `config/constitution.yaml`).
2. Add two secrets at **https://github.com/sol008/testProject/settings/secrets/actions/new**:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | The key you just created |
   | `TRADEREC_VETO_MODEL` | The model ID the veto is pinned to (Claude will suggest one in chat). Keep it unchanged: a change raises an alert |

W9 also needs a file from you, but only on the day official sources report oil exports physically offline. There is nothing to do now: see Part 3.

### 5. Your contact for SEC requests (1 minute)

The SEC asks automated tools to identify themselves in each request ([SEC: Accessing EDGAR data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)). The SEC-filings shadow screens send this secret with every request to sec.gov.

- Add the secret `SEC_USER_AGENT` at **https://github.com/sol008/testProject/settings/secrets/actions/new**. The value is your name followed by a contact email address of your choice, on one line. It is sent only to sec.gov.
- Without it, the screens use a generic identity, which the SEC may throttle: www.sec.gov then refuses the filing documents, and four of the five screens raise a data alert each evening until the secret exists (`docs/OPERATIONS.md` §2(e)).

### 6. Robinhood checks in the app (10 minutes, nothing is submitted)

- **IRA: turn limited margin on** (design v4 decision 10). In the IRA's settings, enable **limited margin** for the retirement account. It lets Monday's buys use Monday's sale proceeds and never borrows; without it every switch takes Monday plus Tuesday. If you leave it off, set `accounts.ira.limited_margin: false` in `config/account.yaml` so the paper broker waits a day too.
- **IRA: SSO, QLD, IBIT and SGOV are buyable with dollar orders.** For each one, search it in the IRA, go to **Trade → Buy**, check the amount can be entered in **Dollars**, then back out. Accept Robinhood's leveraged-product acknowledgement for SSO and QLD if it asks. Do these checks before the paper phase ends.
- **IRA: dollar orders work.** Switch to the IRA and go to **Search SPY → Trade → Buy**. Check that you can enter the amount in **Dollars**, then back out without submitting.
- **Taxable (individual) account: options Level 3.** Needed for Phase B spreads, which can't go in an IRA.
  - Enable options in the individual account and request **Level 3**. See [Advanced options strategies (Level 3)](https://robinhood.com/us/en/support/articles/advanced-options-strategies/).
  - Why not the IRA: IRAs allow Level 2 only ([Options in Robinhood Retirement](https://robinhood.com/us/en/support/articles/options-in-robinhood-retirement/)).
- **Index options (XSP).** Check that **XSP** shows an options chain in the individual account ([Index options](https://robinhood.com/us/en/support/articles/index-options/)). How a spread is entered: [Placing an options trade](https://robinhood.com/us/en/support/articles/placing-an-options-trade/).
- **The spread screens.** The spread emails use the labels "Trade Options", "Select", "Call Debit Spread", "Continue", "Close position" and "Good for day". They come from Robinhood's help pages, so look for them once without submitting anything, and tell Claude if the wording differs.
- **Tell Claude** if your IRA is **not** at Robinhood. The emails use Robinhood's wording.

### 7. The growth-book decisions to send Claude in chat (design v4 §12)

The defaults apply until you answer; each is one config value.

| # | Decision | Options | Default |
|---|---|---|---|
| 1 | The drawdown limit D (the governor and the hard stop scale with it) | 30% / 40% / 50% | **40%** |
| 2 | Bitcoin weight | 20% / 30% / 40% (50% ceiling) | **30%** |
| 3 | Equity leverage | none (SPY 40%) / 2x (SSO + QLD, 25% each) / 3x | **2x** |
| 4 | Nasdaq-100 leg | SSO only / SSO + QLD 50/50 | **50/50** |
| 5 | Rule E, the exit-only mid-week email | outside the weekly cap, at most 6 a year / only when the week's slot is unused / none | **outside the cap, at most 6 a year** |
| 6 | M4 (the crash call spread) in the Sunday email | shadow / re-admit as a Monday 10:00 order in the taxable account | **shadow** |
| 7 | The gems reserve | 15%, shadow-first / 0% / live now | **15%, shadow-first** |
| 8 | G3c, the post-devaluation country ETF (12-month holds) | shadow / a monthly trend slot | **shadow** |
| 9 | Promotion basis for the growth book | risk-control evidence / the v3.3 edge gate | **risk-control evidence** |
| 10 | IRA facts: size and type; limited margin; the in-app checks (step 6) | — | **limited margin on; do the checks before the paper phase ends** |
| 11 | The taxable $20k | VOO held / SGOV / the M4 account | **VOO held, never sold** |
| 12 | A "WSB mode" variant (D = 50%: Bitcoin 40%, a wide governor) | on / off | **off** |
| 13 | 24-hour-market limit orders for IBIT on Sunday night | allow / keep the ban | **keep the ban** |
| 14 | The LLM shadow test of track 37 | run / do not run | **do not run** |

Also tell Claude your country and US state (the tax lines assume the US), and whether your IRA is at Robinhood (step 6).

---

## Part 2 — when Claude says "Phase B is ready to merge"

### 8. Merge the build into `master` (2 minutes)

Scheduled jobs run only from the default branch (`master`).

1. Open **https://github.com/sol008/testProject/compare/master...claude/clever-keller-vuvr50**.
2. Click **Create pull request**, then **Create pull request** again, then **Merge pull request → Confirm merge**.
3. At **https://github.com/sol008/testProject/settings/actions**, under **Actions permissions**, allow actions, at least those created by GitHub. Leave **Workflow permissions** as they are.
4. Don't add branch protection to `master`: every run commits its state there.

### 9. Dry runs (10 minutes)

1. Open **https://github.com/sol008/testProject/actions/workflows/daily.yml** and click **Run workflow**.
   - Branch `master`, tick **dry_run**, then **Run workflow**.
   - Before about 6 pm ET, type the previous trading day in **date**.
2. After a few minutes the run should be green. The end of its log shows a line like `daily 2026-10-01: ok (dry run)`.
   - The emails it *would* have sent are under **Artifacts** in the run (`.eml` files; most nights there are none).
3. Repeat for **https://github.com/sol008/testProject/actions/workflows/weekly.yml**.

A dry run sends nothing and saves nothing. After that the schedule runs by itself.

---

## Part 3 — ongoing

- **Every Sunday evening:** the growth email arrives (about 21:17 ET in summer, 20:17 in winter). "This week: no change" means nothing to place. Otherwise: **Step 1 tonight** (the sells, "Sell all", queued for the open) and **Step 2 Monday from 9:35 ET** once the sells show Filled (the buys, market orders in dollars, each at most 95% of the cash it needs). Then comment each fill on its own issue. Details: `docs/OPERATIONS.md` §1 "The growth book".
- **A Rule E email** (rare, weekday evenings, at most six a year): place the "Sell all" that night; buy SGOV with the proceeds during the week; record both.
- **When a trade email arrives:** it links to a GitHub issue. Comment on it once you've acted:
  - `filled <dollars> @ <price>` for an ETF order;
  - `filled <contracts> @ <net price>` for an option spread;
  - `skipped` if you didn't place it.

  The GitHub mobile app works. These comments feed two of the go-live checks.
- **Watch the repository** (**https://github.com/sol008/testProject** → **Watch → All activity**). GitHub then emails you when a trade issue opens, which is your backup if Gmail fails.
- **Read the monthly review** on the 1st of each month, and the quarterly review that follows it on 1 January, 1 April, 1 July and 1 October. The annual review on 1 January brings the year's decisions to you.
- **When official sources report oil exports physically offline** (at least 1 million barrels a day, no fix expected for at least 2 weeks): add the file `state/inputs/w9_supply_loss.json` for W9 the same day, or at the latest before the next trading day's evening run. The format and the rules are in `docs/OPERATIONS.md` §2(d). When the barrels come back, set `restored_on` in the file.
- **When a war starts:** add it to `geopolitical_onsets` in `config/econ_calendar.yaml` that evening (a shadow book fades gold's first-day spike). The same file needs the 2027 CPI, payrolls, GDP and PCE dates once BLS and BEA publish them; an alert will remind you (`docs/OPERATIONS.md` §9).
- **Go-live** is a decision you make with Claude after at least 3 months of paper trading (design §7). No real money moves before then.
