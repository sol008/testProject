# 37 — Is there a gem in an LLM reading the world? The evidence, the plausible edge at weekly cadence, and a pre-registered shadow test

*29 September 2026. A literature-and-design study for the owner's objective ("exceed SPY by a large margin", "at most 1 recommendation per week", "find some gems in the ocean"). Track 01 §5 ranked the legal information-processing edge as archetype 4 ("the AI's comparative advantage, with haircut probabilities"), and design v3.3 keeps the LLM to a veto (§3 M5, §8; red team M6/m9; track 09). This track asks whether that is too cautious. No backtest was run: the numbers are arithmetic on published results and on the system's own cost model, plus three live records read from prices. Code: `research/code/37-llm-edge/` (`python3 run_all.py`, about 10 seconds; §7). A URL is given for every source. Nothing here is individualized advice.*

*Labels: "points a year" = percent of NAV a year, before tax. "Follower" = a trader who reads the news or filing at 22:17 ET and trades at the next open (the system's timing). "Cell" = one pre-registered combination of universe, horizon and side in the shadow test. The deflated-Sharpe convention is track 23's (Bailey & López de Prado 2014). No model is named anywhere in this track; the model comes from an environment variable.*

---

## TL;DR

1. **The documented LLM edge is real, small, fast and fading.** The best-known result (Lopez-Lira & Tang, updated Oct 2025) is a *next-day*, *long-short*, *small-stock* effect: annualized Sharpe 6.5 in 2021Q4 → 3.7 (2022) → 2.3 (2023) → 1.2 (Jan–May 2024), and **unprofitable at 20 bp per trade** in the paper that found it. The two "slow" results that could fit a weekly cadence are a withdrawn paper (Kim, Muhn & Nikolaev, withdrawn Feb 2025 after a co-author found "inconsistencies in the data and analyses") and a re-measurement of the known investment anomaly (Jha et al.: −1.8 points a year per standard deviation, over nine quarters, on the short side).
2. **For one long-only retail account taking one position a week at the next open, the plausible net edge is −2.0 to +0.8 points a year, central −0.4 (large caps) to −1.9 (small caps).** The gross day-after drift a follower can reach is 1–40 bp per trade; the system's own round-trip cost table is 15–80 bp. The fundamental law says the same: one name a week has a gross Sharpe of 0.03–0.29. Only a stack of optimistic assumptions (twice the published effect, no decay since 2021Q4, slippage-only execution) reaches +0.8. The deterministic modules: W10 +0.04, W8 +0.02, the EDGAR follower screens ≈0 (track 16: the follower's drift fell from +2.1% to +0.1% per trade), CEF discounts ≈+0.2.
3. **Every live record of "an AI reads the world and picks stocks" trails SPY:** AIEQ (IBM Watson, since Oct 2017) 9.5% a year vs SPY 14.8%, with more volatility and a deeper drawdown; Finder's ChatGPT fund +57.8% vs SPY +63.6% over three years; the $100 ChatGPT micro-cap experiment −17.1% vs SPY +12.9% in six months, after a +23.8% first month that made headlines.
4. **Backtests of LLM signals before the model's training cutoff are contaminated** (the model recalls exact prices and events; instructions and masking do not stop it). The only clean evidence is live and post-cutoff, which is what the design's shadow-book rules produce. §3 pre-registers one: a pinned model reads anonymized 8-Ks of a frozen 300-name universe every night, scores are logged in the hash-chained ledger before the open, no web tools, no emails, no trades; about 52 filings a week at $0.14–1.40 a week; promotion needs ≥300 GOOD events, +1.0% net per trade, clustered t ≥ 3.1 (deflated-Sharpe probability ≥ 0.95 at 8 cells) and a 56% sign hit rate over ≥450 filings; a memorization placebo runs first.
5. **Verdict: a mirage as a make-rich engine, a "maybe" only as a cheap monitor.** The shadow test costs $7–73 a year and answers in 6–24 months whether a follower can still harvest small-cap filing reactions. Nothing in the evidence supports LLM-generated trades; the veto-only design stands.

---

## 1. Evidence review

### 1.1 What was read, and what it found

| # | Source | What it measured | Effect size | Speed, side, size | Costs | Decay / caveat | Fit for a weekly, long-only, next-open follower |
|---|---|---|---|---|---|---|---|
| 1 | Lopez-Lira & Tang (2023; v6, 28 Oct 2025), "Can ChatGPT forecast stock price movements? Return predictability and large language models". [arXiv 2304.07619](https://arxiv.org/abs/2304.07619), [SSRN 4412788](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4412788) | An LLM scores news headlines good / bad / unknown without financial training; a daily long-short of the scored names, Oct 2021–May 2024. Overnight news: enter at the next open, exit at that day's close (§6.2) | Annualized Sharpe 2.97 overall (Table 1); about 90% portfolio-day hit rate on the *non-tradable* initial reaction; the tradable drift is much smaller | Next-day. "Substantially stronger among smaller stocks" (size interaction 0.404, t 4.75) and stronger for negative news (the short side) | Cumulative over 300% at 5 bp per trade, above 100% at 10 bp, **unprofitable at 20 bp** (§6.2, Fig. 4) | Sharpe 6.54 (2021Q4) → 3.68 (2022) → 2.33 (2023) → 1.22 (Jan–May 2024); "strategy returns decline as LLM adoption rises" | Poor: one day, long-short, small caps, and it costs more than a retail round trip |
| 2 | Kirtac & Germano (2024), "Sentiment trading with large language models", Finance Research Letters. [arXiv 2412.19245](https://arxiv.org/abs/2412.19245) | A replication and extension: an open LLM's sentiment on 965,375 US news articles, 2010–2023, next-day returns | Accuracy 74.4% vs 50.1% for the Loughran–McDonald dictionary; long-short Sharpe 3.05 vs 1.23 (dictionary) | Next-day | Not reported in the abstract | Most of 2010–2023 predates the model's release, so it sits inside its training window (§1.3) | Poor, the same shape as #1 |
| 3 | Chen, Kelly & Xiu (2023/24), "Expected returns and large language models". [SSRN 4416687](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4416687); discussion slides, S. Z. Li, Wharton Jacobs Levy 2024 ([PDF](https://jacobslevycenter.wharton.upenn.edu/wp-content/uploads/2024/09/ExpectedReturnAndLLM_Discussion_SophiaZhengziLi_NoPause.pdf)) | LLM embeddings of news → cross-sectional expected returns, daily portfolios | "Economically meaningful Sharpe ratios after transaction costs"; the discussant's reading: net annual Sharpe "around 1.5" at 10 bp (large) / 20 bp (small) daily costs | "Predictability persists for several days among small stocks but dissipates quickly for large stocks" | Daily turnover; the net Sharpe needs hundreds of names a day | The abstract says the result is "not driven by look-ahead bias" (a pre- vs post-cutoff comparison) | Poor: a breadth-driven daily strategy; the large-cap part is gone by the open |
| 4 | Ke, Kelly & Xiu (2019), "Predicting returns with text data". [NBER w26186](https://www.nber.org/papers/w26186) | A supervised text model (SESTM) on Dow Jones Newswires; daily long-short | Equal-weighted Sharpe 4.29 (value-weighted 1.33); RavenPack 3.2 / 1.1; Loughran–McDonald 1.7 / 0.7 | "Sentiment information is essentially fully incorporated into prices by the start of Day +3" | At 10 bp per trade the net Sharpe peaks at 2.3, and only with turnover control | Pre-LLM; it fixes the horizon of *all* news signals at 1–3 days | Poor; a weekly hold adds no mean, only noise |
| 5 | Jha, Qian, Weber & Yang (2024), "ChatGPT and corporate policies". [NBER w32161](https://www.nber.org/papers/w32161), [arXiv 2409.17933](https://arxiv.org/abs/2409.17933) | An LLM reads earnings calls and scores the expected change in capex; the score predicts investment and returns | One s.d. higher score → −1.83 points a year raw (−1.49 FF5-adjusted, −1.42 q5-adjusted) in the next quarter, persisting to nine quarters; about +0.6% cumulative abnormal return in the five days after the call | Quarterly; the tradable side is *short* high-investment firms | Not a trading paper | The investment anomaly (the q-factor) re-measured with text; not a new premium | Poor: short side, multi-quarter, about 1.5 points a year per s.d. before costs |
| 6 | Kim, Muhn & Nikolaev (2024), "Financial statement analysis with large language models". [arXiv 2407.17866](https://arxiv.org/abs/2407.17866) | An LLM reads anonymized financial statements and predicts the direction of next year's earnings; long-short on its predictions | Claimed: beats analysts; a higher Sharpe than ML models | Annual | — | **Withdrawn 20 Feb 2025**: "A co-author identified inconsistencies in the data and analyses while attempting to replicate past analyses" | Cannot be counted |
| 7 | Pelster & Val (2024), "Can ChatGPT assist in picking stocks?", Finance Research Letters 59. [SSRN 4602452](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4602452) | ChatGPT-4 *with internet access* rates stocks during earnings season | Ratings correlate with subsequent earnings surprises and returns; an "attractiveness" strategy earns positive returns | Days to weeks | Not reported | Short sample; web access means the model could read the price reaction it was meant to predict | Weak; suggestive only |
| 8 | Tetlock (2007, JF); Loughran & McDonald (2011, JF); survey: Loughran & McDonald (2016), [SSRN 2504147](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2504147) | Dictionary tone of the WSJ market column; of 10-Ks | Tetlock: one s.d. more pessimism → about 8 bp lower Dow the next day, reversed within the week (as reported in #2); L&M: 10-K tone explains filing-window returns | Next-day, then reversal | — | Dictionary signals are down to Sharpe 0.7–1.7 (VW / EW) in #4; McLean & Pontiff (2016): published predictors lose 26% out of sample and 58% after publication (track 02 §2) | Poor |
| 9 | Live evaluation: "Large language models and stock investing: is the human factor required?" [arXiv 2603.19944](https://arxiv.org/abs/2603.19944) | Four LLM platforms × three prompting styles pick IBEX-35 stocks monthly, Apr 2025–Jan 2026, with strict information boundaries | Basic prompting: +0.35% a month excess (≈0); structured: +2.24%; chain-of-thought: +3.04% a month, average t 2.45 | Monthly; long-only | Not modelled | Ten monthly observations, 35 stocks, twelve configurations, one non-US market: little protection against selection | The only documented monthly-cadence live test; suggestive, far from proof |

### 1.2 Live records of "an AI reads the news and picks stocks", from prices (`live_records.py`)

| Record | Window | Result | SPY, same window (total return) | Source |
|---|---|---|---|---|
| AIEQ, the AI Powered Equity ETF (IBM Watson reads news, filings and prices; 0.75% fee; $110m) | 18 Oct 2017 – 28 Sep 2026 (8.9 years) | +126% total, **9.5% a year**, vol 22%, max drawdown −39% | +244%, **14.8% a year**, vol 19%, drawdown −34% | prices: Yahoo; profile: [stockanalysis.com/etf/aieq](https://stockanalysis.com/etf/aieq/) |
| Finder's "ChatGPT fund": 38 stocks picked once on 3 Mar 2023 from fund-style criteria, equal weight, held | 3 Mar 2023 – 27 Mar 2026 | **+57.8%** (beat the ten most popular UK funds' +36.5%) | **+63.6%** | [finder.com tracker](https://www.finder.com/uk/share-trading/share-trading-research/ai-investing) |
| The ChatGPT micro-cap experiment ($100, full control, US micro caps under $300m) | 27 Jun – 26 Dec 2025 | **−17.1%** ($82.88), max drawdown −50%; +23.8% after four weeks made the news | **+12.9%** (the author's own S&P figure: +11.7%) | [final post](https://nathanbsmith729.substack.com/p/chatgpts-micro-cap-portfolio-week-e93), [GitHub](https://github.com/LuckyOne7777/ChatGPT-Micro-Cap-Experiment) |

None beat SPY. The one that "won" (Finder) won against actively managed UK funds, not the index, by holding large US growth names through a growth market.

### 1.3 Look-ahead contamination: the evidence, and how to test for it

| Source | Finding | What it means for a test |
|---|---|---|
| Glasserman & Lin (2023), "Assessing look-ahead bias in stock return predictions generated by GPT sentiment analysis". [arXiv 2309.17322](https://arxiv.org/abs/2309.17322) | Anonymizing headlines (removing the company's identifiers) *raises* returns inside the training window ("the distraction effect has a greater impact than look-ahead bias"), especially for large companies; after the cutoff, look-ahead is "not a concern" | Anonymize the text; score live |
| Sarkar & Vafa (2024/25), "Lookahead bias in pretrained language models", ICML 2025. [SSRN 4754678](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4754678) | Direct tests built on events that are unpredictable given a fixed information set find look-ahead bias in earnings-call risk prediction and election prediction; prompting does not remove it; only models trained on pre-period text do | "Ignore what you know" in a prompt is not a control |
| Lopez-Lira, Tang & Zhu (2025), "The memorization problem: can we trust LLMs' economic forecasts?" [arXiv 2504.14765](https://arxiv.org/abs/2504.14765) | LLMs recall exact economic and financial values before their cutoff; instructions to respect a date fail; masking fails because the model reconstructs entities and dates from context | Nothing dated before the cutoff counts; the model's cutoff date must be recorded |
| He, Lv, Manela & Wu (2025), "Chronologically consistent large language models". [arXiv 2502.21206](https://arxiv.org/abs/2502.21206) | Models trained only on text available at each date reach Sharpe ratios "comparable to a much larger" contaminated model in next-day news prediction: the *bias* in that task is modest | The next-day news effect is not an artifact; that does not make it tradable |
| Gao, Jiang & Yan (2025), "Detecting lookahead bias in LLM forecasts". [arXiv 2512.23847](https://arxiv.org/abs/2512.23847) | A "lookahead propensity" test (date-only recall queries) is positive in-sample and collapses to zero after the cutoff; forecast accuracy is amplified on high-propensity observations in-sample | A cheap placebo: ask the model to recover the company or the date from the anonymized text; count the recoveries |

### 1.4 Practice: what the professionals' edge needs

- **RavenPack** (news analytics since 2003) says more than 70% of the best-performing quant funds use its feed, and that news "impacts asset prices within milliseconds" ([ravenpack.com](https://www.ravenpack.com/products/edge/data/news-analytics)). In #4 its composite sentiment earned an equal-weighted daily Sharpe of 3.2, with the effect gone by day +3. The edge is breadth (thousands of names), speed (a machine-readable feed at the news timestamp) and the short side; the capacity per name is small.
- **BloombergGPT** (Wu et al. 2023, [arXiv 2303.17564](https://arxiv.org/abs/2303.17564); [press release](https://www.bloomberg.com/company/press/bloomberggpt-50-billion-parameter-llm-tuned-finance/)): a 50-billion-parameter model trained on 363 billion tokens of financial text plus 345 billion general tokens, for internal NLP tasks (sentiment, entity recognition, question answering). Bloomberg makes no trading claim for it.
- **The system's latency.** It runs at 22:17 ET and trades at the next open. For after-close news that is the same timing as #1's overnight strategy, so latency alone is not what kills the idea; costs, breadth and the long-only constraint are (§2). For intraday news the system is 7–13 hours late, after the reaction.

### 1.5 A retail-feasible, weekly-cadence LLM strategy with out-of-sample results?

None was found. #9 is monthly, ten months, one non-US market, twelve configurations. Simulated agent systems (for example MarketSenseAI on the S&P 100, 2023–24) report large returns on a simulated portfolio, with partial costs, inside or near the models' training windows. A retrospective test ([mf-journal.com](https://mf-journal.com/article/view/327)) finds abnormal returns for 30 days after news-based picks but poor out-of-sample performance. The live retail records (§1.2) are the out-of-sample evidence, and they are negative.

---

## 2. The plausible edge at weekly cadence for one retail account

### 2.1 Route A: per trade, from the published cost sensitivity (`edge_shrinkage.py`)

#1's overnight strategy is "over 300%" cumulative at 5 bp per trade and "above 100%" at 10 bp over about 660 sessions, and unprofitable at 20 bp. Read as a line, that is a gross long-short return of about 31.5 bp a session with about 2.1 trades a session (the check at 20 bp gives −10.5 bp a session: unprofitable, as the paper says). The long leg carries about 40% of it (#4: the long side earns less; #1: the effect is stronger for negative news): **12.6 bp gross per long position-day at the 2021–24 average level.** From there:

| Scenario | Level vs the 2021–24 average | Size tilt (large / mid / small) | Round trip, bp (large / mid / small) | Net bp per trade (large / mid / small) | Points a year at 5% of NAV, one trade a week (large / mid / small) |
|---|---|---|---|---|---|
| Upper bound: 2× effect (a whole filing, not a headline), 2021Q4 level, slippage-only costs | 2.2 × 2 | 0.3 / 0.8 / 1.5 | 10 / 24 / 50 | +6.7 / +20.5 / +33.4 | **+0.17 / +0.51 / +0.83** |
| Optimistic: 2021Q4 level, no forward decay | 2.2 | same | 15 / 30 / 80 | −6.7 / −7.8 / −38.3 | −0.17 / −0.19 / −0.96 |
| Published average 2021–24, no forward decay | 1.0 | same | 15 / 30 / 80 | −11.2 / −19.9 / −61.1 | −0.28 / −0.50 / −1.53 |
| **Central: the 2024 level, then the ×0.5 forward haircut** | 0.41 × 0.5 | same | 15 / 30 / 80 | −14.2 / −27.9 / −76.1 | **−0.36 / −0.70 / −1.90** |
| Pessimistic: adoption finished the job (gross 0) | 0 | — | 15 / 30 / 80 | −15 / −30 / −80 | −0.38 / −0.75 / −2.00 |

The size tilt is #1's and #3's finding; the ×0.5 haircut is track 02's convention (McLean & Pontiff); the cost table is the system's own (`shadow.EDGAR.costs`, track 16 §1.3); the slippage-only row uses the fill model's next-open slippage without a spread (track 18 §5.1), the cheapest defensible execution; 5% of NAV is track 16's single-stock weight. Holding to day 5 instead of day 1 changes no mean (#4: fully incorporated by day +3) and adds a week of single-stock noise.

**Range: −2.0 to +0.8 points a year; central −0.4 (large caps) to −1.9 (small caps).** The only positive cells need all three of: an effect twice what was published, no decay since 2021Q4, and no spread. The 2024 level with the track 02 haircut leaves 1–4 bp of gross drift per trade against 15–80 bp of cost.

### 2.2 Route B: breadth (the fundamental law of active management)

IR = IC × √breadth. A daily long-short of 100–300 names has a breadth of 25,000–75,000 name-days a year; a Sharpe of 2.97 implies an information coefficient of 0.011–0.019 per name-day (0.004–0.008 at the 2024 level; 0.024–0.041 at the 2021Q4 level). One name a week has a breadth of 50: **a gross Sharpe of 0.03–0.29**, that is +0.06 to +0.58 points a year at a 5% position in a 40%-volatility name, before costs of 0.4 (large caps) to 2.0 (small caps) points a year. The same answer by a different road.

### 2.3 Against the deterministic screens the system already runs

| Rule | Contribution a year (design §6; tracks 16, 23, 24) | Evidence | Running cost |
|---|---|---|---|
| W10 crash-day buy | +0.04 (−0.01 to +0.10) | p 0.019 post-1990; deflated Sharpe 0.42–0.62 | None |
| W8 (M5), with the frozen LLM veto | +0.02 (−0.1 to +0.2) | n = 5–17 | Under $5 a year |
| EDGAR follower screens SH1 / SH3 | ≈0 (monitors of rejected setups) | The follower's 20-session drift: +2.1% (2006–08) → +0.8% (2009–15) → +0.1% (2016–26) per trade, while the two-day filing reaction doubled (track 16) | None |
| CEF wide-discount buys (shadow candidate) | ≈+0.2 | t 2.8 post-2008 (track 24) | None |
| **An LLM reading filings, weekly, long-only** | **−0.4 central; −2.0 to +0.8** | §2.1–2.2 | $7–73 a year as a shadow; the cost table if traded |

The LLM edge is the object track 16 already measured for filings: the announcement effect is intact or larger, and the drift a next-open follower can harvest has gone to zero, "amplified by machine readership of EDGAR". An LLM reads the announcement better than a regular expression does, but it cannot move the trade before the open.

---

## 3. Integrity constraints and the pre-registered shadow test

### 3.1 What the design requires, and what the test keeps

Design v3.3 §3 M5 and red team M9: no LLM-generated trade without a pinned model, a frozen and hashed prompt, an enum answer and allow-listed citations; design §3 "Shadow ledger": logged automatically, no emails, no LLM in shadow books (m9: cost and integrity); track 10: an overconfident LLM scores *worse* than the market on raw probabilities, so nothing here asks the model for a probability. The test below is an exception to the "no LLM in shadow books" rule of the narrowest kind: the LLM *scores*, it never trades, sizes or vetoes; there is no web tool (a search would return the price reaction and contaminate the score); the "citation" is the accession number of the filing scored, which is the whole evidence; the spend is capped in the constitution; and the result can at most promote a *candidate screen* that must then pass its own deterministic test.

### 3.2 The spec

| Item | Specification |
|---|---|
| **Universe** (frozen on the first run, hashed into `state.shadow.LLM.universe_sha256`, re-frozen every 12 months; dead names keep their last price, as in the EDGAR book) | U-L: the 100 largest US common stocks by market cap in the provider's data. U-S: the 200 highest 20-day dollar-volume names with a market cap of $300m–$2bn, dollar volume ≥ $1m and price ≥ $5 (the never-list floors, design §5) |
| **Items scored** | Every 8-K of a universe name accepted by EDGAR up to 22:00 ET that day (the EDGAR book's `filings_final_et`), items 1.01, 1.02, 2.01, 2.02, 2.05, 2.06, 3.01, 4.01, 4.02, 5.02, 7.01 and 8.01; the EX-99.1 press release when there is one, else the 8-K body; the first 1,500 words. At most 20 filings a run and 60 a week |
| **Anonymization** (Glasserman & Lin) | The company's current and former names (from the EDGAR submissions header), tickers, exchange listings, CIK, file numbers, URLs, e-mail addresses and all dates are replaced (`prompt_hash.anonymize`, a reference implementation with a self-test); the filing date is never shown |
| **Model** | From the environment variable `TRADEREC_SHADOW_LLM_MODEL`; no identifier in the repository; the ledger records its SHA-256. `shadow.LLM.model_cutoff` holds the model's published training-cutoff date, and the book cannot start without it. A model change starts a new series (a tier-3 change, track 10); series are never pooled |
| **Prompt** | Frozen constants in `prompt_hash.py`: `prompt_sha256 = 96db8ce445c227a7ad5180687533f7758500727626aa749fc4e860359fb3221e`; the runner refuses to call with any other hash, as `llm_veto` does. No tools. The answer is one JSON object `{"score": GOOD | BAD | NEUTRAL, "confidence": LOW | HIGH, "reason": one sentence}`; anything else is `invalid` and logged. The question is fixed: is this filing, on its own, good or bad news for the stock over the next five sessions relative to the market? |
| **Timing and logging** | Inside the 22:17 ET daily run, after the EDGAR screens; each score is appended to the hash-chained ledger (a `shadow` record, `book: LLM`, `event: score`, with `adsh`, `prompt_sha256`, `request_sha256`, `response_sha256`, `model_sha256`, usage and cost) before the next open. Scores are never revised or re-scored. Beside each score the runner logs the Loughran–McDonald dictionary tone of the same text (free, deterministic): the LLM must beat it in the same cells |
| **Paper outcome** | Entry at the s1 open; exits at the s1 close (the day-1 cell) and the s5 close (the weekly cell, the cadence the owner would trade); excess vs SPY (≥ $2bn) or IWM; net of the EDGAR cost table; the filing reaction (close D−1 → s1 open) is recorded too, to split the announcement from the drift as track 16 does |
| **Cells** (8, all pre-registered) | {U-L, U-S} × {day-1, week} × {long-only GOOD; long-short GOOD − BAD}. **The primary cell is U-S × week × long-only.** The other seven are diagnostics and cannot promote; HIGH-confidence subsets are reported, not tested |
| **Cost** | About 52 filings a week (300 names × about 9 8-Ks a year), about 2,400 input and 60 output tokens each: **$0.14 / $0.28 / $0.56 / $1.40 a week** at the $1/$5, $2/$10, $4/$20 and $10/$50 price tiers (input / output per million tokens; the platform pricing page, cached 2026-09-25), i.e. $7–73 a year, half with the batch API. `max_spend_per_month_usd: 10` is a hard stop, inside red team m9's $50 limit |
| **Contamination controls** | (1) Live only: every filing is dated after the model's cutoff by construction. (2) Anonymized text, no date, no tools. (3) A one-off placebo before the series counts: 500 filings dated at least 12 months before the cutoff, through the same anonymizer; the model is also asked to name the company and the date. If it recovers either more than 5% of the time, or the placebo's hit rate exceeds the live hit rate by more than 5 points, the anonymizer is failing and the series is void. (4) No re-scoring; a new model is a new series. (5) The dictionary baseline flags a regime change without any model involvement |
| **Promotion test** (all must hold in the primary cell at a monthly review; promotion is an owner decision, as track 16 P2 requires) | n ≥ 300 GOOD events (about 25 weeks of flow); mean net excess ≥ +1.0% per trade; t ≥ 2.5 clustered by filing date **and** a deflated-Sharpe probability ≥ 0.95 at N = 8 trials, which is an observed t ≥ 3.1 (track 23's form of Bailey & López de Prado); a sign hit rate ≥ 56% over ≥ 450 scored filings on the day-1 excess (2.5 standard errors above a coin); and the LLM's cell beats the dictionary baseline's |
| **Power** (`power.py`; the per-event dispersion is assumed at 4% / 6% for small caps at day 1 / week and 2% / 3% for large caps, to be replaced by the measured values after the first month) | At n = 300 in the primary cell the smallest detectable mean is +1.08%; a true +1.0% needs 347 events (29 weeks); +0.5% needs 1,388 (2.2 years). The large-cap cells detect +0.5% in 26–58 weeks, but the expected effect there is ≈0. A 56% hit rate needs 435 filings (about 9 weeks) |
| **Kill switch** | After 52 weeks, if the sign hit rate ≤ 52% and the primary cell's mean net ≤ 0: stop the spend, keep the book. Any month over the spend cap: stop |
| **What promotion would mean** | Not live trades. A passing cell becomes a *candidate screen* whose signals still have to pass a deterministic rule with its own promotion test (as SH1–SH4 do) and the executability check (design §3a). The LLM stays out of sizing and out of the email |

The proposed constitution block is in `research/code/37-llm-edge/results/constitution_block.yaml` (`shadow.LLM`, `enabled: false`), and the prompt text is in `prompt_hash.py`.

### 3.3 What this test cannot show

- It measures a follower's harvest of small-cap filing reactions, not "the LLM's view of the world". Macro reading, thematic picks and multi-month theses have no clean, cheap, pre-registrable outcome at n > 100 a year, which is why they stay outside the test.
- Eight cells and one primary: the deflated-Sharpe bar is honest for this track. Across tracks 13–24 the cumulative Bonferroni bar is t ≥ 4.3 (track 24 §5), which no shadow of this size can reach. A pass here is a reason to build a deterministic screen and test *that*, not a reason to trade.
- The dispersion assumptions set the power; the review replaces them with the measured ones after the first month, and the promotion thresholds do not move.

---

## 4. Verdict

**A mirage as an engine; a "maybe" as a monitor.**

- The published edge is next-day, long-short, small-cap and shrinking (Sharpe 6.5 → 1.2 in 30 months); it was unprofitable at 20 bp per trade in the paper that found it, before a retail spread.
- For this system — one long-only position a week at the next open, the design's cost table — the plausible net contribution is **−2.0 to +0.8 points a year, central −0.4 to −1.9**, against a book whose central expectation is about +0.8 points over bills (design §6) and SPY's forward 3–6% at CAPE ≈ 41. It cannot deliver "exceed SPY by a large margin"; on the central numbers it subtracts.
- The slower LLM results that could fit the cadence are withdrawn (#6) or a known short-side anomaly (#5). No retail weekly LLM strategy has an out-of-sample record; the live records trail SPY by 5 points a year (AIEQ, nine years) to 30 points in six months (the micro-cap experiment).
- The design's veto-only role is right. The shadow test in §3 is cheap ($7–73 a year), integrity-preserving, and worth running only if the owner wants to know whether small-cap filing drift has come back for a follower. It is not a path to riches, it must not be built ahead of the EDGAR book's own first reviews, and it needs one owner decision first: whether to allow this one LLM shadow book at all (a change to design §3's "no LLM" shadow rule, with the spend cap).

---

## 5. Multiple testing and honesty

This track ran no backtest and fit no parameter. Route A has four assumed multipliers (the long-leg share 0.4, the size tilt 0.3 / 0.8 / 1.5, the 2× "whole filing" factor, the ×0.5 haircut) and two cost tables, all from the sources cited; Route B has two assumed breadths and one volatility. Halving or doubling any one of them does not change the sign of the central cells. The one thing that would change the verdict is evidence that a *follower's* drift after filings is back above the cost table, which is exactly what the shadow test measures.

Numbers that were looked up, not computed: every figure in §1.1 and §1.3 (from the papers' abstracts, text or discussion slides at the URLs given, read on 29 Sep 2026), AIEQ's profile, the Finder and micro-cap results. Numbers computed here: the AIEQ and SPY statistics and the SPY window returns (Yahoo adjusted closes), the Route A and B tables, the power and cost tables, the prompt hash.

---

## 6. Sources

- Lopez-Lira, A., Tang, Y. (2023; v6 2025). Can ChatGPT forecast stock price movements? Return predictability and large language models. https://arxiv.org/abs/2304.07619 ; https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4412788
- Kirtac, K., Germano, G. (2024). Sentiment trading with large language models. *Finance Research Letters*. https://arxiv.org/abs/2412.19245
- Chen, Y., Kelly, B., Xiu, D. (2023/24). Expected returns and large language models. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4416687 ; discussion (S. Z. Li, 2024): https://jacobslevycenter.wharton.upenn.edu/wp-content/uploads/2024/09/ExpectedReturnAndLLM_Discussion_SophiaZhengziLi_NoPause.pdf
- Ke, Z. T., Kelly, B., Xiu, D. (2019). Predicting returns with text data. NBER w26186. https://www.nber.org/papers/w26186
- Jha, M., Qian, J., Weber, M., Yang, B. (2024). ChatGPT and corporate policies. NBER w32161. https://www.nber.org/papers/w32161 ; https://arxiv.org/abs/2409.17933
- Kim, A., Muhn, M., Nikolaev, V. (2024; withdrawn 2025). Financial statement analysis with large language models. https://arxiv.org/abs/2407.17866
- Pelster, M., Val, J. (2024). Can ChatGPT assist in picking stocks? *Finance Research Letters* 59. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4602452
- Loughran, T., McDonald, B. (2011). When is a liability not a liability? *Journal of Finance* 66(1); (2016) Textual analysis in accounting and finance: a survey. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2504147
- Tetlock, P. (2007). Giving content to investor sentiment. *Journal of Finance* 62(3).
- McLean, R. D., Pontiff, J. (2016). Does academic research destroy stock return predictability? *Journal of Finance* 71(1). (Track 02.)
- Glasserman, P., Lin, C. (2023). Assessing look-ahead bias in stock return predictions generated by GPT sentiment analysis. https://arxiv.org/abs/2309.17322
- Sarkar, S. K., Vafa, K. (2024/25). Lookahead bias in pretrained language models. ICML 2025. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4754678
- Lopez-Lira, A., Tang, Y., Zhu, M. (2025). The memorization problem: can we trust LLMs' economic forecasts? https://arxiv.org/abs/2504.14765
- He, S., Lv, L., Manela, A., Wu, J. (2025). Chronologically consistent large language models. https://arxiv.org/abs/2502.21206
- Gao, Z., Jiang, W., Yan, Y. (2025). Detecting lookahead bias in LLM forecasts. https://arxiv.org/abs/2512.23847
- Wu, S. et al. (2023). BloombergGPT: a large language model for finance. https://arxiv.org/abs/2303.17564 ; https://www.bloomberg.com/company/press/bloomberggpt-50-billion-parameter-llm-tuned-finance/
- RavenPack, News Analytics. https://www.ravenpack.com/products/edge/data/news-analytics
- "Large language models and stock investing: is the human factor required?" (2026). https://arxiv.org/abs/2603.19944
- "Could ChatGPT have earned abnormal returns? A retrospective test from the U.S. stock market." *Modern Finance*. https://mf-journal.com/article/view/327
- AIEQ profile: https://stockanalysis.com/etf/aieq/ ; Finder's ChatGPT fund tracker: https://www.finder.com/uk/share-trading/share-trading-research/ai-investing ; the ChatGPT micro-cap experiment: https://nathanbsmith729.substack.com/p/chatgpts-micro-cap-portfolio-week-e93 and https://github.com/LuckyOne7777/ChatGPT-Micro-Cap-Experiment
- Bailey, D., López de Prado, M. (2014). The deflated Sharpe ratio. *Journal of Portfolio Management* 40(5). (Track 23's `deflated_sr`.)
- Grinold, R. (1989). The fundamental law of active management. *Journal of Portfolio Management* 15(3).
- API price tiers: the platform pricing page (platform.claude.com/docs), cached 2026-09-25 in the bundled API skill; track 09 §4.1.
- In this repository: `research/00-SYSTEM-DESIGN-v3.md` §3, §5, §6, §8; `research/01-greatest-trades-and-blowups.md` §5; `research/02-academic-evidence.md` §2; `research/09-infrastructure-data-email-compliance.md` §4; `research/10-calibration-and-self-improvement.md`; `research/12-red-team-review.md` M6, m9; `research/16-short-horizon-event-driven.md`; `research/18-short-horizon-execution-sizing-paper.md` §5.1; `research/23-duration-cap-verification.md`; `research/24-duration-cap-gap-search.md` §5; `docs/phase-b/edgar.md`; `docs/phase-b/w8w9.md`; `traderec/llm_veto.py`; `config/constitution.yaml` (`shadow.EDGAR`, `modules.W8.veto`).

---

## 7. Code

`research/code/37-llm-edge/`, Python 3.11 with `pandas numpy scipy yfinance`.

| File | What it does | Output |
|---|---|---|
| `run_all.py` | Runs everything in order (about 10 s; the last script needs network) | — |
| `prompt_hash.py` | The frozen prompt, its SHA-256, a reference anonymizer with a self-test, the proposed `shadow.LLM` constitution block | `results/prompt_sha256.txt`, `results/constitution_block.yaml` |
| `edge_shrinkage.py` | Routes A and B of §2 | `results/edge_scenarios.csv`, `results/breadth.csv` |
| `power.py` | Minimum detectable effects by cell, weeks needed, the deflated-Sharpe bar, cost per week by price tier | `results/power_mde.csv`, `results/power_weeks.csv`, `results/cost_per_week.csv` |
| `live_records.py` | AIEQ vs SPY since inception; SPY over the Finder and micro-cap windows (Yahoo, adjusted closes) | `results/live_records.csv` |
