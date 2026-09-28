# 12 — Red-team review of 00-SYNTHESIS.md (strategy constitution v0)

*Reviewer: adversarial "red team" agent, 28 Sep 2026.*

**Version reviewed.** `00-SYNTHESIS.md` as of 21:20:36 UTC: 635 lines, md5 `c0790aff…`. Section 3.6 (track 05) was merged while this review was in progress, so it received only a light-touch consistency check. Line numbers refer to that version.

**Method.**
- I read the synthesis end to end and checked it against the relevant sections of tracks 01–11 and their result files.
- I recomputed the §7 worked example from `code/00-synthesis/example_base_rates.csv`, SPY/^GSPC/^VIX closes and the Fama-French daily file.
- I spot-checked live levels with yfinance and FRED.
- I ran three new backtests of the sleeve design (1928-01 → 2026-08). They use CRSP value-weighted total return and T-bills from Fama-French daily data, with ^GSPC price drawdowns as the triggers. The scripts and outputs are in the scratchpad (`…/scratchpad/12-redteam/`):
  - `sleeve_backtest.py` and `sleeve_backtest_output.txt`;
  - `tranche_episodes.py` and `tranche_episodes.csv`;
  - `alt_designs.py` and `alt_designs_output.txt`.

**Labels.**
- **VERIFIED** means I checked the finding against a report, code or data.
- **JUDGMENT** means it is my opinion.

---

## TL;DR — the ten issues that matter most

1. **The crash-tranche program (S2) cannot run as written.** (C1)
   - The schedule adds 10/15/25/50% of *core notional*. Track 06 designed that as **leverage up to 2.0×**. The synthesis funds it instead from a 30% cash reserve and never rescaled it.
   - In 1929 and 2008 the −50% tranche could be only **42–46% funded**.
   - The drawdown governor applies to crisis deployment (track 03 §6D.4; now also Appendix A). At the −40% trigger the portfolio is 28–30% down, so G(D) = 0.34–0.41. At −50%, G(D) = **0.00**.
   - The §7 email nonetheless promises full-size tranches 3 and 4 "from the reserve".
2. **The recommended default is mis-described, and it trails a plain index fund.** (C2)
   - §10 labels "Growth" with the **100% index's** P(11×) of ≈30% / 9%.
   - The actual default holds 70% core, 30% T-bills and S2. From 1928 to 2026 it earned **8.7–9.6% a year against 10.0%** for the index, reached 11× in only **10–16% of 20-year windows (against 28%)**, and still fell **−81%** in 1929–32.
   - The "Conservative" trend preset would have beaten the default on compound annual growth (9.9%), median outcome and maximum drawdown (−47%).
3. **The reserve's cost is the biggest return lever in the design, and the synthesis never states it.** (M8)
   - Under 1928–2026 conditions the reserve costs about **1.4–1.6 points a year**.
   - At today's valuations (forward earnings yield ≈ 10-year Treasury yield; CAPE regression 0–1% real) it costs **about 0 (−0.8 to +0.7)**.
   - The 70% core weight is not derived from the stated log-growth objective under any explicit equity-premium assumption.
4. **The Δg ≥ 0.2% hurdle is mis-specified.** (M1)
   - It is per trade, not per year. It is measured against cash earning 0%, not T-bills. It is computed in isolation from the core.
   - On the §7 reference class, tranche 2's joint Δg is **−0.42% per 3 years** against **+0.48%** in isolation.
   - Several §3.6 modules can never clear the hurdle; odd-lot tenders, for example, add ≈0.016%.
5. **The worked example (§7) is not faithful to its own reference class.** (M2)
   - The forecasts "shrunk toward base rates" are about half the base rates: −40% touched in 4 of 6 cases (email: 35%), −50% in 2 of 6 (email: 15%).
   - The stress uses the 3-year point (−66%) instead of the path low (**−78.5%**).
   - It ignores G(D), gets the tax outcome wrong (the exit came after 5 months, so the gain was short-term), says "Reply" when fills go to GitHub, and omits fields that tracks 03 and 11 require.
6. **S4 (Bitcoin) breaks the constitution's own gates.** (M3)
   - Gate 1 needs ≥10 analogs; BTC has 3–4 cycles.
   - A 5% position with a −80% stress is a 4% stress loss, above the 3% per-trade cap.
   - The cap uses "net worth", a different base from every other cap.
   - The invalidation level is ambiguous.
   - The new trigger (≈$79k) is about 5% away, so an email can fire any day.
7. **Self-improvement is over-sold and structurally frozen.** (M6, M7)
   - The "82% confirmed in 12 months" comes from a 500-stock, IC-0.09 stock-picking simulation. That skill is switched off in v0; with a weaker IC of 0.04 the figure is 22%.
   - k halves at a 25% drawdown, which the default hits at every −40% bear. It can rise again only after ≥100 resolved trades, which takes 17–100 years at 1–6 trades a year. After the first bear market, k is effectively stuck at 0.125.
8. **The "Growth+" preset contradicts the invariants.** (M4)
   - It uses 1.5× leverage, while track 03's hard limit is 1.3× even after proof.
   - The portfolio volatility cap is 20%, but 1.5 × 16–19% = 24–28%.
   - §3.2 requires a trend switch with leverage; §10 says "n/a".
   - The volatility cap has no stated estimator. With a live estimate it would force selling at the bottom (VIX 66 → about 50% portfolio vol in March 2020).
9. **"No setup clears the bar" contradicts "Jakarta passes the filter".** (M5)
   - By the rules, a half-size −30% tranche (≈5% of the portfolio) is live now, unless triggers that fired before launch are excluded.
   - The vehicle, EIDO, is −51% from its 2018 all-time high, so the "new ATH" exit will not fire. The rupiah is near record lows, and Indonesia belongs in the "peace / oil" factor budget.
10. **Automation and behaviour holes.** (M10, M11)
    - The LLM "engineer" can change evaluator code and its pinned hash in the same PR.
    - The number validator checks provenance, not meaning: a wrong slot, BUY/SELL, or the wrong ticker would pass.
    - Spoofed trade emails are unaddressed.
    - Fills have no inbound path, and there is no reconciliation with the broker.
    - The plan assumes a human will buy at −40/−50% at the exact moment the governor asks for a "human review".

---

## Findings table

Severity: **critical** means it breaks the design or misleads the central decision; **major** means it must be fixed before build; **minor** means clean-up.

| # | Severity | Section | Issue | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|---|
| C1 | critical | §3.2 S2 (l.164–173), §3.1 governor (l.149), §3.4 (l.200), §7 (l.488–489), App. A (l.612, 621) | **S2 is unfundable and blocked by the governor.** (1) Tranches of 10/15/25/50% of *core notional* need about 41% of the starting portfolio even when marked to market, against a 30% S0. The −50% tranche can be only 42–46% funded (76–77% in the expensive branch). (2) G(D) applies to crisis buys (track 03 l.657, "crisis buys are not exempt"; Appendix A l.621, "subject to the drawdown governor"). The portfolio drawdown at the −40% trigger is 27.6–29.8% (G = 0.34–0.41); at −50% it is 38–41% (G = 0.00–0.05). (3) The same drawdowns trigger "halve k" (25%) and "human review" (40%). (4) S0 is also claimed by the credit-crisis buy (15–30%), the VIX add-on (10%), S4 and SPAC/CEF parking. Requested deployments in a 2008-type crash reach about 55–80% (S2 ≈41% + credit 15–30% + VIX add-on 10%) against 30% available. | Track 06 l.722 ("add 10, 15, 25 and 50% of core notional. Total exposure is capped at **2.0x**"; l.706: an "always-invested core" with tranches that *add* exposure). Track 01 R13 (l.854) deploys a 10–40% sleeve "in thirds" and so is fundable. `tranche_episodes.csv`: 1930-11-10 needed 28.9% of W with 13.3% left; 2008-11-20 needed 29.2% with 12.4% left. | (a) Size tranches as shares of the **S0 balance at the start of the episode**: normal regime 10 / 20 / 30 / 40% at −20/−30/−40/−50%; expensive regime 25 / 35 / 40% at −30/−40/−50%. (b) Exempt S2 from G(D) and from k-halving: it is unlevered, pre-committed and bounded by gross ≤1.0×, and its edge is concentrated at −40/−50% (track 01 l.22–23; track 06 l.17). If the governor must stay, delete the −40/−50% tranches and say so; the backtest with G(D) gives CAGR 8.48% and max drawdown −68.8%. (c) Add an S0 waterfall: S2, then credit-crisis, then VIX add-on. Earmark ≥20% of the portfolio for S2 that S3, S4 and §3.6 may not use. (d) Rewrite §7 l.488–489 with the real amounts. | VERIFIED |
| C2 | critical | §10 presets (l.580–585), §0 item 6 (l.33–41) | **The default's P(11×) is the 100% index's number.** "Growth ≈30% / 9% for the index core" is track 03's *plain-index* bootstrap, but the default is 70% core + 30% T-bills + S2. Track 03's own "Growth" preset is 100% core (l.655). Backtest, 1928–2026, quarterly starts:<br>• Default, rebalanced yearly: CAGR 8.66%, 20-year median 6.40×, P(≥11×) 9.6%.<br>• Default, never rebalanced: 9.64%, 6.63×, 15.6%.<br>• 100% index: 10.03%, 7.80×, 28.3%.<br>• Max drawdown: default −81.3%, index −84.1%.<br>A lognormal approximation of the muted scenario gives the default about 2–3%, against 9% for the index. The "Conservative" preset (100% + 10-month SMA) had CAGR 9.86%, max drawdown −47.2% and median 7.20×, but P(11×) of only 4.1%. | `sleeve_backtest_output.txt`, `alt_designs_output.txt`. Plain-index cross-check: 0% of 10-year and 28.3% of 20-year windows reached ≥11×, matching track 02 l.454. | Replace the Growth row with the default's own figures: "≈10–16% historical / ≈2–3% muted; CAGR 8.7–9.6% vs 10.0% for 100% equity; worst drawdown ≈ index". Add a "100% index" row and give Conservative real numbers (CAGR 9.9%, max drawdown −47%, P(11×) ≈4%). Add the default as a row in §0 item 6. | VERIFIED |
| M1 | major | §1.2 (l.77–79), §3.3 gate 4 (l.180), §3.4, §3.6 | **The Δg hurdle is mis-specified.** (1) `sizing_rule.py` uses `hurdle = 0.002  # … per trade`, not per year: a 5-year tranche and a 3-month option face the same bar. (2) The formula compares against cash at 0%: a 3% stake held a year forgoes 0.13% of T-bill interest, two-thirds of the hurdle. (3) It is isolated from the core. Tranche 2 on the §7 reference class (total returns, T-bills on cash): joint Δg −0.42% per 3 years against +0.48% isolated; +0.36% against +0.55% at 1 year. (4) Track 03's own launch examples fail the hurdle (option bet 0.12%, 60¢ event 0.18%, l.625–626), so S3's "1–6 emails a year" is optimistic. (5) §3.6 modules: an odd-lot tender (~$40, 0.016% of a $250k book) and SPAC parking (T-bills + 1–3% on ≤10%, 0.1–0.3%/yr) cannot clear it. | `code/03-math/sizing_rule.py` (Policy.hurdle, `dg = p_s*log1p(f*b) + …`); my 6-episode joint-vs-isolated computation; track 03 l.619–629. | Define **Δg_yr = (E ln W_T\|trade − E ln W_T\|no trade) / T**, computed on the whole portfolio (core and open positions included) with idle cash at T-bills. Hurdle ≥0.2% a year. List "cash-substitute" modules (SPAC/CEF/odd-lot) as exempt with their own rule, or drop them. Put the §7 "Why not options?" Δg comparison in code; my rough version agrees (call 0.12% vs index 0.53% per 21 months at quarter-Kelly). | VERIFIED |
| M2 | major | §7 (l.448–545) | **The worked example misstates its own base rates and misses the template's required fields.**<br>• Forecasts versus the printed reference class: −40% touched 4/6 (67%) vs email 35%; −50% touched 2/6 (33%) vs 15%; higher after 1 year 3/6 (50%) vs 62%.<br>• STRESS uses the 3-year point (−66%). The path low was **−78.5%** (1932-06-01), so the stress is −$17,600 / 7.0%, not −$14,800 / 5.9%.<br>• "Sized so you can hold through a 1929": the default portfolio fell −80.5% in 1929–32.<br>• G(D) at 20 Mar 2020 would be ≈0.57 (portfolio drawdown 23%), making tranche 2 ≈5.2%, not 9%.<br>• Tax line: the exit came on 18 Aug 2020, after 5 months, so the gain was short-term.<br>• "Reply 'filled…'" conflicts with fills via GitHub issue (§6 l.437); there is no inbound email path.<br>• Missing fields from track 11 §4 and track 03 §6F: MAX LOSS, a scenario table summing to 100%, EV after costs, model vs shrunk probability, Δg, binding constraint, portfolio-level stress.<br>• Correct: size, levels, dates, returns, the table (all 18 cells), 22 trading days, VIX 66.04. | `example_base_rates.csv`; ^GSPC path check; `tranche_episodes.py` (2020 row); track 11 l.48, 73, 131; track 03 l.677–683. | Use Laplace-smoothed base rates with the raw counts shown: up at 1 year 4/8 = 50%; up at 3 years 6/8 = 75%; new ATH within 5 years 4/8 = 50%; touch −40% 5/8 = 62.5%; touch −50% 3/8 = 37.5%. Change STRESS to "−78% path low: −$17,600 (7.0%); whole portfolio ≈ −80% in that path". Add the missing fields. Tax line: "if the exit comes within 12 months the gain is short-term — hold tranches in an IRA where possible". Replace "Reply" with "comment on GitHub issue #…". | VERIFIED |
| M3 | major | §3.2 S4 (l.161), §3.3 gates 1 and 5, §4 (l.310) | **S4 cannot pass the gates it is subject to.**<br>• Gate 1 needs ≥10 analogs; BTC has 3–4 cycles and 4 touches of the 200-week average (track 06 l.646–648).<br>• Historical drawdowns of −75% to −93% make 5% a 3.75–4.65% stress loss, above the 3% per-trade cap.<br>• "≤5% of *net worth*" uses a different base from all other caps, which are % of portfolio.<br>• The invalidation "weekly close below the prior cycle low" is ambiguous: $57.7k (this cycle, §4) or $15.8k (2022)?<br>• BTC is not a diversifier: 2018–26 daily correlation with the S&P was 0.31; on S&P days below −2% it averaged −2.9%; it fell −48% from 19 Feb to 12 Mar 2020 and −64% in 2022.<br>• The trigger is ≤1.2× the 200-week average ≈ $79.4k, with spot at $83.4k (5% away). | yfinance BTC-USD: 200-week average $66.2k, low of $58.6k on 2026-06-30; `btc_episodes.csv`; track 06 l.646–648. | Size S4 as a portfolio % bounded by stress: ≤3% at an −80% stress, staged 1.5% + 1.5%. Make S4 an explicit, user-opted exception to gate 1, stated in the email, or move it to the incubator. Invalidation: "weekly close < $57.7k". Tell the user now that tranche 1 may fire within days. | VERIFIED |
| M4 | major | §10 Growth+ (l.584), §3.1 caps (l.134, 147), §3.2 S1 (l.158), App. A (l.615) | **The Growth+ preset contradicts the invariants.** It uses 1.5×, but track 03's hard limit is 1.3× even after ≥3 years and ≥100 trades (l.641). The volatility cap is ≤20% (l.644), yet 1.5 × 16–19% = 24–28%. §3.2 and Appendix A say a trend switch is "required with leverage"; §10 says "n/a". The volatility cap has no estimator: with implied or realized volatility it binds in every crash (0.75 × VIX 66 ≈ 50% on 20 Mar 2020) and would force selling at the bottom. | Track 03 §6C; synthesis text. | Growth+: "≤1.3× via index futures or box-spread financing (track 04 l.697), trend switch on, vol cap 25% in this preset only". Vol cap: "10-year realized vol of the target weights; S2 exempt". | VERIFIED |
| M5 | major | §0 item 9 (l.48–57), §4 (l.312), §3.2 international (l.172), §3.3 gate 9 (l.187) | **The Jakarta signal contradicts "no setup clears the bar".**<br>• ^JKSE is −31.7% from its 2026-01-20 peak, touched −41.5% on 2026-06-08, and stands at 0.97× its 10-year average. The rules therefore make a half-size −30% tranche (7.5% of core, ≈5% of the portfolio) *live*.<br>• The US vehicle EIDO is −37% from its 2026 high and −51% from its 2018 all-time high, so the ATH exit is unreachable and only the 5-year stop applies.<br>• USDIDR is 17,960, near the record 18,190. Track 06's international tests use local-currency, price-only indices, so they miss the currency risk.<br>• As an oil importer, Indonesia is the same "peace / oil" bet as INDA (track 08 l.477, 872), but gate 9's list omits it. | yfinance ^JKSE and EIDO; track 06 l.33, 47, 695. | Choose one: (a) "Triggers that fired before launch are not traded; Jakarta re-arms after a new −30% close following a new high"; or (b) issue the tranche with EIDO specifics and the currency risk, count it in the peace/oil factor budget, and exit at 5 years or at the local-index ATH. **[verify]** whether the 2026 decline is partly structural (e.g., index-provider free-float/investability review) before treating it as a cyclical crash. | VERIFIED (numbers); JUDGMENT (structural cause) |
| M6 | major | §5.2 (l.356–362), §5.5 | **The 82% detection claim does not transfer to this system.**<br>• It comes from a monthly scan of 500 **single stocks** with independent idiosyncratic alpha and IC 0.087. At IC 0.037 the figure is **22%** at 12 months.<br>• Track 10 itself calls the timelines "optimistic lower bounds" and says "transfer is not guaranteed".<br>• v0 switches single stocks off. The actual decisions are macro, crash and crypto calls that track 08 says are "the same bet".<br>• The gym's "stock k vs SPY over 21 days" questions measure a skill the system does not use.<br>• The shadow book logs 40 candidates "every scan" and scans run daily, 12–20× the simulated monthly volume; its LLM cost is not in `cost_model.py`. | Track 10 l.169–181, 194, 202, 211–212 (six sub-forecasts ≈ two independent observations), 748–749; `code/09-infra/cost_model.py` (triage, write-ups and one calibration run only). | Restate: "In a stylized stock-picking simulation … 82% (22% for weaker skill). Our decisions are fewer and correlated, so expect far less power." v1 shadow book: deterministic rules with base-rate forecasts and no LLM calls, once per month. Build the gym (v2) only from question families that mirror real decisions. | VERIFIED |
| M7 | major | §3.4 (l.200) | **The k ratchet leaves the Kelly fraction permanently reduced.** k halves at D ≥ 25%, which the default reaches at every −40% bear (portfolio drawdown 27.6–29.8% in 1929/1974/2002/2008). It can rise only after ≥3 years and ≥100 resolved trades (track 03 l.633, 665), which is 17–100 years at 1–6 trades a year. After the first bear market, k is 0.125 in practice. κ is equally frozen because a category needs ≥30 trades. | Track 03 §6E; `tranche_episodes.csv`. | "The halving is temporary: k is restored when D < 10% for 3 months. Shadow and paper trades count at weight 0.5 toward the 100-trade gate." Otherwise, tell the user plainly that sizing will not grow. | VERIFIED |
| M8 | major | §3.2 S0/S1 (l.157–158) | **The reserve is the dominant return decision, and its cost and rebalancing are unspecified.**<br>• Rebalancing alone moves CAGR by about 1 point (default 9.64% never rebalanced vs 8.66% rebalanced yearly).<br>• The 70% core is set by fiat. Kelly weight = ERP/σ²:<br>  – historical premium (8.3% excess, σ ≈ 20%): ≈2.1, so 70% ≈ ⅓ Kelly;<br>  – Vanguard midpoint (ERP ≈ 2%): ≈0.7, so 70% ≈ full Kelly;<br>  – CAPE regression (ERP ≈ 0): ≈0, so 70% is far above Kelly.<br>• The design is timid under one frame and aggressive under another, and it does not say which it assumes. | §3 below; track 02 l.155, 330; track 03 sources (Vanguard 3.9–5.9%); track 06 l.29; track 08 l.140. | Add to S0: "Expected cost vs 100% equity: ≈1.5 points a year if 2026–46 resembles 1928–2026; ≈0 at today's CAPE-implied returns." Offer S0 = 0/15/30% as the user's choice. Rebalancing rule: "rebuild S0 only from tranche exits and new contributions; rebalance only if S0 < 10% or > 40%". State the equity-premium prior used for the core. | VERIFIED (numbers); JUDGMENT (fix) |
| M9 | major | §3.6 (l.211–247), §3.1 (l.145) | **§3.6 turns the dry powder into crash-correlated exposure** (light-touch check; merged mid-review).<br>• "Short-put-like" modules are capped at 30% of the portfolio, as large as S0 itself, for strategies that "lose *together* in liquidity crises" (l.213).<br>• "≤15% when VIX > 30" forces selling into the crash.<br>• SPAC/CEF parking sits "part of the cash reserve", making dry powder crash-correlated.<br>• The credit-crisis buy is called "highest priority" (l.219) but Appendix A (l.621) splits the reserve "in proportion".<br>• The evidence "+14% to +47%" conflicts with track 05's own table (+14–35%, l.655). | Synthesis text; track 05 l.11 vs l.655, 679. | Cap short-put-like at ≤10–15% and never inside the S2-earmarked part of S0. At VIX > 30 open no new positions rather than forcing sales. Pick one priority rule (recommended: S2, then credit, then VIX add-on). | VERIFIED (text); JUDGMENT (sizes) |
| M10 | major | §6 (l.437), §7 (l.481), §0 item 8 (l.47) | **Behavioural and operational single points of failure.**<br>• The design's excess return depends on a human buying at −30/−40/−50%, just as the governor calls a "human review". If tranches are skipped, S0 is pure drag: static 70/30 earned 8.40% vs 10.03%.<br>• The ledger has no inbound email path (the §7 email says "Reply") and no broker reconciliation, so the sizes and P(11×) drift from real holdings.<br>• "Months of silence mean the system is working" is also what a broken data feed looks like.<br>• A spoofed "[TRADE #…]" email could trigger a harmful trade. | Synthesis text; track 09 l.565; `sleeve_backtest_output.txt`. | Place **standing GTC limit orders** for S2 at launch and refresh them before broker expiry; the user's job becomes not cancelling them. Add a monthly holdings reconciliation (CSV import or read-only API). Track the skip rate and show its cost. The monthly email must attest data freshness ("last good snapshot: …"). Every trade email links its GitHub issue and hash; act only on emails that match. | VERIFIED (inconsistency); JUDGMENT |
| M11 | major | §3.1 (l.150), §6 (l.430, 435) | **LLM guardrails have gaps.**<br>• The "engineer" routine opens PRs in the same repo as the evaluator, so it can change code *and* its pinned hash together, and the user is the only, likely non-expert, reviewer. This is the reward-hacking path track 10 warns about (METR 2025).<br>• The number validator checks that numbers exist in the snapshot, not that they sit in the right slot: swapped −40/−50 levels, BUY/SELL, or a wrong ticker (SPY vs SPXL; SPUT as U-UN.TO / U.U / SRUUF) would pass.<br>• Prose facts ("Fed cut to zero on 15 March") are not validated.<br>• Web and filings text can prompt-inject triage. | Track 09 l.286, 436–442; synthesis §6. | Put the evaluator and constitution in protected paths (CODEOWNERS, with a CI failure if a bot PR touches them) or a separate repo; the engineer token has no write access there. Render the order ticket (action, ticker from a whitelist, quantity, limits, dates) only from structured JSON, never from prose. Allow factual claims only with a citation from allowlisted sources. The LLM may annotate deterministic candidates but not add them. | JUDGMENT |
| M12 | major | Throughout (§0, §10) | **Expectations are incomplete by omission.** The synthesis never states the *expected annual return* of its default at today's valuations. That is about 3–6% nominal for the core (Vanguard 3.9–5.9%; CAPE regression 0–1% real) plus ≈4.2% on the reserve, or roughly 1.5–1.8× over 10 years. It also never says that year-1 "self-improvement" is measurement, not bigger or better bets. | Track 03 sources; track 06 l.29; DGS3MO 4.24%. | Add to §0: "Expect roughly 4–6% a year from the default over the next decade. 11× in 20 years is ≈2–3% likely in the muted case unless you choose Growth+. In year 1, 'self-improvement' means measuring, fixing bugs and recalibrating probabilities — not larger positions." | VERIFIED (inputs); JUDGMENT (range) |
| m1 | minor | §3.3 gate 7 (l.183–185) | The liquidity rule is misattributed and weakened. Track 04 §9.4 requires a spread ≤2% of mid (T ≥ 6 months) or ≤5% (T < 6 months) as a hard block; "≤10% of mid" is track 08/11's rule. | Track 04 l.721, 753; track 08 l.864. | "Spread ≤2% of mid for T ≥ 6 months, ≤5% otherwise (track 04); ≤10% only for hedges." | VERIFIED |
| m2 | minor | §4 triggers A/C/D (l.319–322) | Conditions were dropped. C loses "term price ≥ $95" and the buyback path; D loses "and Setup A's triggers are firing"; A loses the FMS washout and "10-year still > 5.0%". Note that SRUUF closed at $18.60 on 28 Sep (vs $19.00 behind the −11.7% figure), so the discount leg may already be ≥12%; URNM's 200-day average is the binding test. | Track 08 l.616–618, 693, 726; yfinance SRUUF. | Copy track 08's full trigger definitions. | VERIFIED |
| m3 | minor | §4 E (l.323) vs §3.7 (l.255), App. A (l.614) | The "equity hedge" is armed in §4, but hedges are "off at launch; only if you ask". | Text. | Remove E from the armed list, or mark it "only if you opted in". | VERIFIED |
| m4 | minor | §1.2 (l.80) | "Deferral turns 5.5× into 12.7×" mixes two effects. At 15%, taxed yearly at the long-term rate gives 8.71×. Deferral alone is 8.71 → 12.7× (+46%); the rate difference is 5.48 → 8.71×. | `g5_tax_drag_20y.md`. | "Long-term rates plus deferral turn 5.5× into 12.7×; deferral alone is worth about +46%." | VERIFIED |
| m5 | minor | §8 (l.553), App. A (l.620) | "Multiples decaying about 10× per cycle" is wrong. Halving −18m/+18m multiples went 69× → 49× → 10.2× → 5.8×, a decay of 1.4×, 4.8× and 1.8× per cycle (≈2.3× geometric mean). | `btc_halving_trades.csv`. | "about 2–5× per cycle". | VERIFIED |
| m6 | minor | §3.1 (l.141, 146), §3.8 (l.269–276), §3.7 | The caps conflict. "Single stock ≤15%" vs "never >25% one issuer" vs single stocks incubator-only; and 15% at the −50% stress track 03 applies is 7.5%, above the 2–3% per-trade caps. "Lottery-type trades 0.5–1%" vs "never: betting on long shots / lottery stocks". | Track 03 l.638; text. | Single stock ≤5% while incubator-only; define "lottery-type" as defined-premium long-dated OTM options, or delete the row. | VERIFIED |
| m7 | minor | §3.2 (l.158, 166), §0 item 6 | "S&P 500 (or MSCI ACWI)" is an ambiguous trigger. The core is global, but P(11×) and every backtest are US-only, and the US is the survivor market (the synthesis's own point). | Text. | Trigger on the index actually held; label P(11×) "US history, likely optimistic for a global core". | VERIFIED (text); JUDGMENT |
| m8 | minor | §3.2 S0 (l.157), §4 (l.317) | "4.06%" is the 13-week bill *discount* rate (^IRX). The bond-equivalent yield is ≈4.16%, and 3-month constant maturity (DGS3MO) was 4.24% (the track 08 table lists both). | FRED DGS3MO, DTB3; track 08 l.164. | Quote the investment yield (≈4.2%). | VERIFIED |
| m9 | minor | §6 cost (l.439), §0 item 10 | "$5–35/month" excludes the shadow book, gym, reviewer model and blind re-grading. At about $0.30 per Opus candidate, 40 candidates each daily scan comes to about $250/month. | `cost_model.py` workloads. | Add those lines or make the shadow book deterministic; keep the $50 hard spend limit. | VERIFIED |
| m10 | minor | §3.5 (l.209), §3.2 S2 exit | The 5-year time stop realized −33% to −50% on the Oct–Nov 1929 tranches in late 1934; holding 7 years would have returned +1% to +31%. It also moves money to T-bills right after a crash. The ATH exit realized a short-term gain in 2020. | FF total-return index. | At the time stop, **merge the tranche into the core (no sale)**. Rebuild S0 from contributions. Hold S2 in tax-advantaged accounts where possible. | VERIFIED |
| m11 | minor | §4 valuation (l.305) | "CAPE ≥35 → −6% to +1% real" rests on one episode (34 months, all 1998–2001). | Track 06 l.29, 529. | Add "(one episode)". | VERIFIED |
| m12 | minor | §1.2 vs track 02 | Track 02's minimum edge ("≥2× costs and ≥1%/yr at the portfolio level", l.481) is not reconciled with the 0.2% hurdle in Appendix A. | Track 02 §8.1. | Add a row to Appendix A. | VERIFIED |
| m13 | minor | §3.1 cluster cap (l.142) vs §3.3 gate 9 | The correlated-cluster cap is 8% (track 03), while track 08's factor budget is 3% premium / 2% stop-risk per factor (l.872–875). The synthesis never says which applies. | Text. | "Macro-factor budget 3% (track 08) inside the 8% cluster cap." | VERIFIED |
| m14 | minor | §2 law 8 (l.121), §7 (l.508) vs §3.3 gate 2 (l.178) | The shrinkage target is inconsistent: "toward the base rate" in two places, "toward break-even (no edge)" in another. | Text. | Specify one target per archetype: rule-based archetypes shrink to the base rate; LLM-subjective ones to the market/break-even. | VERIFIED |
| m15 | minor | §0 item 4 (l.24) | "Index options were overpriced on 86% of days" actually means the VIX exceeded subsequent 21-day realized vol on 86% of days, which is not the same as being "overpriced". "Every… volatility strategy lost money" ignores the VIX/VIX3M > 1.1 straddle bucket (+14%, t = 0.6). | Track 04 l.9, 302. | Reword. | VERIFIED |

---

## §3 — Does the design serve "maximum % return, fewest trades"? (steelman the user)

### 3.1 What the default actually delivers (historical US backtest, 1928-01 → 2026-08)

| Design (my implementation of the synthesis's rules) | CAGR | Max drawdown | 20-year median | P(≥11× in 20 years) | 20-year 5th percentile | 10-year 5th percentile |
|---|---|---|---|---|---|---|
| 100% index (1 trade) | **10.03%** | −84.1% | **7.80×** | **28.3%** | 3.54× | 1.02× |
| **Synthesis default**: 70/30 + S2, rebalanced yearly | 8.66% | −81.3% | 6.40× | 9.6% | 3.44× | 1.25× |
| Default, never rebalanced (S0 drifts down) | 9.64% | −82.2% | 6.63× | 15.6% | 3.46× | 1.27× |
| Default + expensive-regime filter | 8.62% | −81.3% | 6.30× | 8.3% | 3.42× | 1.25× |
| Default with G(D) applied to S2 (per track 03 / App. A) | 8.48% | −68.8% | 6.05× | 8.6% | 3.11× | — |
| 70/30 static, no tranches, rebalanced yearly | 8.40% | −69.3% | 5.63× | 5.7% | 2.90× | 1.17× |
| 85/15 + S2 sized from the reserve (fundable) | 9.34% | −82.1% | 6.89× | 18.2% | 3.52× | — |
| "Conservative": 100% + 10-month SMA switch | 9.86% | **−47.2%** | 7.20× | 4.1% | **4.38×** | — |

Drawdowns by episode, starting at the pre-crash all-time high (100% index / static 70/30 / default):

| Episode | 100% index | Static 70/30 | Default |
|---|---|---|---|
| 1929–32 | −84% | −57% | **−80.5%** |
| 1973–74 | −48% | −30% | −35% |
| 2000–02 | −49% | −31% | −36% |
| 2007–09 | −55% | −37% | −46% |
| 2020 | −34% | −24% | −25% |

**Reading the results.**
- The tranches do their job in ordinary bears. The default ends each episode window **ahead of the index**: 2007–13 at 1.58× vs 1.42×; 2000–07 at 1.27× vs 1.11×.
- Its cost is the reserve's drag in bull decades.
- In a 1929 path it ends level with the index (0.75× vs 0.76×). The reserve is spent on the way down, so the design gives back nearly all the tail protection a plain 70/30 had.
- Net over 98 years: **−0.4 to −1.4 points a year** vs 100% equity, depending on the unspecified rebalancing rule.

Caveats: US only, pre-tax, pre-cost, overlapping windows, and the CRSP total market used as a proxy for the S&P/ACWI core.

### 3.2 Cash drag of the 30% reserve at today's rates and valuations

The expected log-growth gap between 100% equity and a 70/30 mix is 0.3·ERP − 0.51·σ²/2.

| Equity-premium assumption | Inputs | Cost of the 30% reserve (points a year) |
|---|---|---|
| History (track 02) | 8.3% arithmetic excess, σ ≈ 20% | **≈ +1.5** (backtest: 1.4–1.6) |
| Vanguard VCMM (track 03 sources) | 3.9–5.9% nominal, σ ≈ 17%; T-bills 4.24% (DGS3MO); ERP ≈ 1–3% | **≈ −0.4 to +0.2** |
| CAPE regression (track 06: 0–1% real; 5y5y inflation 2.35%) | ERP ≈ 0 | **≈ −0.8 to −0.5** (the reserve *adds* growth) |
| Forward E/P 5.21% + inflation | Track 08 l.140 | **≈ +0.7** |

**Verdict: not an index fund with extra steps, but close to one.** At today's valuations the reserve is roughly free, and it is defensible — but only through a valuation argument the synthesis disclaims ("CAPE timing fails out of sample"). If the future looks like the past, it costs about 1.5 points a year. The synthesis should state both numbers and let the user choose 0/15/30%.

### 3.3 What each sleeve plausibly adds vs a plain index (points a year of log growth)

| Sleeve | Estimate | Basis |
|---|---|---|
| S0 reserve | −1.5 (history) … ≈0 (today) | §3.2 |
| S2 tranches (vs static 70/30) | **+0.0 to +0.26** | Backtest: 9.63 → 9.64 never rebalanced; 8.40 → 8.66 rebalanced yearly |
| VIX add-on | +0 to +0.4 | 0.2 signals a year × 10% × (+24% median − 4% bills), post-1986 only. The 1929–46 analogue won 4 of 11, so possibly ≈0 |
| S3 opportunity | −0.2 to +0.4 (model-implied up to +0.9) | 1–3 qualifying trades a year × Δg 0.2–0.3% (track 03 examples), times true κ of 0–0.5, minus spreads. The launch examples for options and events fail the hurdle |
| S4 BTC (≤5%) | ≈0 to +0.5 expected; ±2–4% of the portfolio per cycle | ⅓ of track 06's "200-week average → old ATH" median (+224% → +75%) at 50–60% odds, vs −30 to −50% at the invalidation |
| §3.6 modules | 0 to +0.2 | Credit-crisis buy ≈ +0.05 to +0.2 amortized (15–30% × +14–35%, once every 6–9 years). The rest are cash substitutes |
| **Net vs 100% equity** | **History: ≈ −1.3 to +0.2. Today's valuations: ≈ −0.3 to +1.2** | |

### 3.4 Where it leaves growth on the table without an evidence-based reason

1. The size and rebalancing of the reserve (M8).
2. Realizing gains and losses at every tranche exit (m10); a tranche is the same asset as the core.
3. No tax-loss harvesting or asset location (§5): ≈0.3–1 point a year after tax for a taxable account in crash years.
4. The reserve earns 3-month bills (4.24%) instead of a 0–2-year Treasury ladder (2-year at 4.81%) or SPX box spreads (4.8–5.3%, track 04 l.16): +0.1 to +0.2 points a year on the portfolio.
5. The one evidence-backed lever for more growth, governed modest leverage (track 03 bootstrap: governed ≤1.5× median 8.2× vs 7.3×, P(11×) 39% vs 30%, no 50% drawdown), is presented inconsistently (M4).

More S3 trades are **not** the lever. Even at the synthesis's own shrinkage they add tenths of a point.

### 3.5 Where it is still too risky

- **The 1929 tail at portfolio level.** The default fell −80.5% in 1929–32, not the "survive a 1929" the email implies.
- **All risk sleeves are long risk together.** In a 2008-type crash the rules ask for S2, credit-crisis (15–30%), VIX add-on (10%) and S4, while up to 30% sits in crash-correlated "short-put-like" modules. Requested deployments exceed the 30% reserve, and BTC and HY fall with equities (BTC −48% Feb–Mar 2020).
- **The live regime is stagflationary.** Track 08's regime looks like 1973–74, in which bonds do not hedge. T-bills are the only true hedge and the default fell −35% nominal, far more in real terms.
- **Single-country tranches.** A half-size tranche is ≈5% in one emerging market under currency stress (M5).

---

## §5 — Missing edges and tools, and when to add them

| Tool | Why it matters for this objective | Evidence in the dossier | When |
|---|---|---|---|
| **Tax-loss harvesting** (swap to a non-identical fund) | Crash-driven buying creates large harvestable losses exactly when S2 buys. It needs no forecast and adds only a few trades | Not in any track; standard practice | **v0**: monthly review flags lots down >10% with a loss above $X |
| **Asset location** | S2 tranches, S3 options, trend switches and HY (credit-crisis) ETFs generate short-term or ordinary income, so hold them in an IRA/401k. The long-hold core belongs in taxable accounts | Track 02 l.486 ("put higher-turnover sleeves in tax-advantaged accounts") | **v0** (needs §10 decision 3) |
| **Section 1256** (SPX/XSP options, futures, box spreads: 60/40) | S3 options in taxable accounts should default to SPX/XSP | Track 02 l.486; track 04 l.713, 731 | **v0**: add to gate 8 and the email "tax" line |
| **Reserve yield**: 0–2-year Treasury ladder, T-bills held directly (no state tax), optionally part in 5–10-year TIPS at 2.8% real (99.6th percentile) | +0.1 to +0.2 points a year on the portfolio. TIPS lock in a real return about equal to the CAPE-implied equity return | FRED DGS2 4.81%, DGS3MO 4.24%, DFII10 2.83%; track 08 l.170 | **v0** for ladder and bills; **v1.1** for TIPS (JUDGMENT) |
| **SPX box-spread cash** (4.8–5.3%) | Higher yield plus 1256 treatment, but needs options approval and adds complexity | Track 04 l.16 | Later |
| **Fee minimization** | A long-hold core at ≤0.03–0.06% (VOO/IVV/VTI/VT) rather than SPY (0.0945%), which the §7 example names | — | **v0** (trivial) |
| **Standing GTC limit orders for S2 tranches** | Removes the behavioural failure at −40/−50% and cuts latency | Track 06 l.10 ("failure mode was selling in the second leg") | **v0** |
| **Managed futures / trend fund** (10–20%, from S0) | The one diversifier that worked in stagflationary 2022 and in 2008. It is not a return engine (AQMIX 4.6%/yr since 2010, about bills + 1) | Track 02 l.23, 496 (recommended; dropped by the synthesis without comment) | **Later (v1.1)**, as an optional part of S0 (JUDGMENT) |
| **Bonds as crash hedge** | Rallied in 2008 and 2020, fell with equities in 2022. With 10–30-year yields at 5.2–5.6% the carry is attractive, but the current shock is inflationary | Track 08 setup A | Partial: ≤⅓ of S0 in intermediate Treasuries is reasonable (JUDGMENT) |
| **Futures or box-financed leverage** for Growth+ (instead of margin) | Financing at T-bills + 0.3–0.8% vs retail margin | Track 04 l.697 | Only if Growth+ is chosen |
| **LEAPS "stock replacement" for deep tranches** (20% in 2-year ATM calls + 80% T-bills) | Track 06 ranks it the "best leveraged implementation" (worst −20% over 2 years) | Track 06 l.659; track 04 l.323–331 | Later, after the Δg code (M1) says it beats 1× |
| **Global diversification** | The core is already global, but triggers and P(11×) are US-only | — | **v0** consistency fix (m7) |
| **Contributions plan**, with P(11×) on time-weighted returns | New savings are the cheapest way to rebuild S0 without selling. Money-weighted and time-weighted 11× differ | Track 10 l.309 | **v0**: add to §10 decision 1 |
| Rebalancing premium | Small for stocks vs bills; the real question is the S0/S1 rule (M8) | — | v0 (as a rule, not an edge) |
| Direct indexing, covered calls, risk reversals | Add trades or are short the tail | Track 04 l.344 | **Never** |
| Crypto trend filter (20-week average), as an *exit* | Already partly adopted in the new S4 exit. Its out-of-sample evidence (track 02) is better than the cycle rules | Track 02 l.498 | v0 (done); also consider it as the *entry* filter |

---

## §6 — The calibration and self-improvement design

**Is it implementable by a small system? Not as specified.** v1 alone requires:
- a hash-chained ledger;
- six sub-forecasts per trade;
- a shadow book of 40 candidates with LLM forecasts on every daily scan;
- reliability tables;
- κ;
- Tier 1 maps.

v2 adds a gym (200 questions a month), a second reviewer model, e-processes, forward A/B tests and Thompson sampling. Most of this machinery serves the LLM-judgment sleeve (S3), which by §3 contributes tenths of a point. S1, S2 and S4 are rule-based and do not need LLM calibration at all.

**Flaws in using sub-forecasts and a shadow book as evidence.**
1. **Transfer (M6).** The simulated power comes from a single-stock world. The gym's single-stock, 21-day questions measure a skill the system has switched off. The decisions that drive P&L (crash continuation, 5-year recovery, BTC cycle milestones) resolve in 1–5 years, so the monthly loop learns almost nothing about them.
2. **Correlation.** Six sub-forecasts are worth about two independent observations (ICC 0.37–0.41, track 10 l.211). The macro watch list is "the same bet" (track 08 l.76). Same-day scans repeat the same candidates. The effective N is probably tens a year, not 4,400.
3. **Selection effects.** The "top-30 rejects" are chosen by the model being evaluated, so they are not controls, and a macro universe may not contain 10 genuine random controls. Track 10 already down-weights shadow data to 0.5; the effective N should be down-weighted too.
4. **Goodhart.** If the pooled calibration of easy, high-volume gym questions feeds κ or k, the system can look calibrated while its rare, decision-relevant forecasts are not. The engineer routine can also optimize prompts toward forecasts that are easy to score.
5. **Baselines.** "Real-world market probabilities" do not exist for most of these questions. Track 10's fix (option-implied probabilities recalibrated on a historical panel) is itself a research project.
6. **Unreachable gates.** κ and k cannot move for a decade (M7), so Tier 2 changes will mostly tune question families that do not size anything.

**Minimum viable version that still guards against overfitting (recommend as v1).**
1. **Ledger.** Append-only JSONL in the private repo, with the head hash emailed monthly. Keep this.
2. **Three forecasts per trade**, pre-registered with the reference-class base rate beside each:
   - P(profit at the time stop);
   - P(invalidation before target);
   - P(target by date).
   Score them as they resolve and report reliability with Jeffreys intervals.
3. **Deterministic shadow book, monthly.** Log every rule trigger and near-miss (within 5% of a trigger) with a paper plan and a *base-rate* forecast, and make no LLM calls. This measures whether the **rules** still work on fresh data, which is what S1, S2 and S4 depend on.
4. **Frozen sizing in year 1.** k = 0.25 and κ = 0.5 for rule-based archetypes. For LLM-subjective S3 edges use κ = 0.25, since track 10 finds a typically overconfident LLM scores *worse* than the market on raw probabilities. Only Tier 1 state estimates and costs update automatically.
5. **Annual review, by you**, using track 06's rule: change a parameter only if it improves the 36-market panel in two disjoint periods, never on live P&L.
6. **Deferred.** Gym, e-process, Thompson sampling, Platt and isotonic maps wait until a *decision-relevant* question family has ≥150 resolved questions. When the gym is built, its questions should mirror real decisions: index drawdown-continuation over 1–3 months, CEF discount mean-reversion, BTC 200-week-average revisits, and credit-spread thresholds.

This version can be built in days, costs almost nothing in LLM tokens, and keeps the anti-overfitting protections that matter: pre-registration, frozen evaluation, no P&L-chasing, and human-owned changes.

---

## Appendix — spot-check log

These are the numbers I checked; ✓ means it matches the source, ✗ means it does not.

| Claim (synthesis) | Check | Result |
|---|---|---|
| Coin flip: 86.5% poorer; median 0.5% | `g1_ergodicity_coin.md`: 86.5%, 0.005× | ✓ |
| 61.5 / 27.1 / 12.7% a year for 11× | 11^(1/5), 11^(1/10), 11^(1/20) | ✓ |
| 10.3% since 1928; 11× in 0% of 10-year and 28% of 20-year windows | Track 02 l.155, 454. My CRSP backtest: 0% / 28.3% | ✓ |
| P(11×) 30/9%, medians 7.3/3.8×; 39/14%; 62/40% | `d_barbell…md`: 30.2/9.3, 7.28/3.79; 39.3/14.3; 61.5/40.3 | ✓ (but see C2) |
| Required Sharpe 1.09 / 0.74 / 0.48; market 0.44 | `f1_required_sharpe_for_11x.md`; track 03 l.38 | ✓ |
| 16.4× / 5.5× / 12.7× | `g5_tax_drag_20y.md` | ✓ numbers, ✗ attribution (m4) |
| Index options overpriced on 86% of days; hedged calls −12 to −27%; complacency puts ≈ −97% | Track 04 l.9, 12, 268 (−96/−98%) | ✓ (wording, m15) |
| Active retail −6.5 points; momentum 7.4 → 2.2%; value −0.6% | Track 02 l.27, 15–16 | ✓ |
| −40% trigger 1.64× vs 1.42× (n = 5); ≥40% drawdowns 0.4 per decade; VIX ≥50 four times | Track 01 l.22, 27, 29; `vix_spikes.csv` (2008, 2009, 2020, 2025) | ✓ |
| Median 0.45×, 37% lose ≥80% | Track 07 l.163 (36.9%) | ✓ |
| Waiting in cash 3–8% vs 10.2% | Track 06 l.10 | ✓ |
| 82% / 11% / ≤3%; 4,400 vs 72 | Track 10 l.18, 191–206: 72 + 1,920 + 2,400 = 4,392 | ✓ numbers, ✗ context (M6) |
| S&P 7,683.69; ATH 7,798.99; −1.5%; tranche levels 5,459 / 4,679 / 3,899 | yfinance ^GSPC; ×0.7/0.6/0.5 | ✓ |
| VIX 16.1; 10-year 5.24%; 30-year 5.56%; HY 2.93%; IG 0.81%; CCC 11.28%; Fed 3.75–4.00% | yfinance: 16.07, 5.24, 5.561. FRED (25 Sep): 2.93, 0.81, 11.28; DFEDTARU 4.00 | ✓ |
| 10-year real 2.85% | FRED DFII10 2.83 (25 Sep) | ≈✓ |
| T-bill 4.06% | ^IRX 4.057 (discount basis); DGS3MO 4.24 | ✗ understated (m8) |
| BTC $83.5k, −33%, 1.27× the 200-week average, trigger ≈$79k | yfinance: 83.4k, −33.1%, 200-week average 66.2k, 1.2× = 79.4k | ✓ |
| USDJPY 157.4 | yfinance 157.36 | ✓ |
| Jakarta −32%, filter passes | ^JKSE −31.7%, 0.97× 10-year average; EIDO −51% from ATH | ✓ (see M5) |
| §7: 98 SPY ≈ $22,400 = 9.0%; stress $14,800 = 5.9% | 98 × $228.80 = $22,422 (8.97%); $22.4k × 0.66 = $14.8k | ✓ arithmetic, ✗ stress definition (−78.5% path) |
| §7: −40% = 2,031.69; −50% = 1,693.08; new high 18 Aug 2020 at SPY $338.64; +51.9% / +25.7% / +4.7% | ^GSPC 3,386.15 × 0.6 / 0.5; SPY closes 13 Mar 269.32, 23 Mar 222.95, 18 Aug 338.64 | ✓ |
| §7 table (18 cells), median +15%, 5 of 6, 1.8–24.9 years, 22 trading days, VIX 66, call 1.6–3.3× in 3 of 6, 6.5× | `example_base_rates.csv`; ^VIX 66.04 | ✓ (6.5× uses a flat 30% vol, so it is optimistic) |
| §7 forecasts: 62% / 78% / 55% / 35% / 15% | Base rates: 3/6, 5/6, 3/6, 4/6, 2/6 | ✗ (M2) |
| BTC multiples decay "about 10× per cycle" | 1.4×, 4.8×, 1.8× | ✗ (m5) |
| Credit-crisis buy +14% to +47% | Track 05 l.11 says +47%; l.655 says +14–35% | ✗ (track 05 inconsistent) |
| Liquidity rule "(track 04) ≤10% of mid" | Track 04 says ≤2% / ≤5% | ✗ (m1) |
