# Track 05: Special situations, event-driven trades and alternative markets

*As of 2026-09-28. Every number labelled "our data" can be reproduced with the scripts in `research/code/05-special-situations/` (see Appendix). Literature numbers come from the cited papers. Anything I could not verify is marked **[unverified]**.*

---

## TL;DR

1. **Most special situations sell insurance: small edge, negative skew.** Merger arbitrage, SPAC trust arbitrage, prediction-market favourites and crypto carry all win often and lose rarely but heavily. They also tend to lose at the same time, in crashes. Diversified merger-arb funds earned about **T-bills + 1–2%/yr**. The Merger Fund (MERFX) returned 4.9% CAGR over 1990–2026, against 2.8% for T-bills and 10.8% for SPY. Its monthly skew was −1.7 and its max drawdown −15%. The IQ Merger Arbitrage ETF (MNA) returned 2.7% CAGR over 2009–26. **None of these can produce "1000%".** The engine should treat them as trigger-gated cash substitutes, not as core return drivers.
2. **The best fit for "few trades, high % return" is buying forced-sold assets only after a crisis signal.** Examples:
   - **High-yield credit / fallen angels** when Moody's Baa−10y spread is above 3.5% at a month-end. This happened in 4 episodes since 1990 (2002, 2008–09, 2016, 2020). Every such month-end returned **+14% to +47%** on a high-yield fund over the next 12 months (our data).
     - Checking the trigger daily instead adds a one-day breach in Mar-2008, which lost −17%. The 2008 entries also sat through −22% to −26% drawdowns.
     - With n ≈ 4–6 episodes, treat these numbers as indicative only, and scale in.
   - **Fiat-backed, regulated stablecoins below ~$0.97.** USDC traded as low as $0.877 on 11-Mar-2023 and was back at par about 2 days later (+14%). FDUSD fell to $0.881 in Apr-2025 and recovered in the same way.
   - These triggers fire about 0–2 times a year in total. Today (Baa−10y = 1.39%, HY OAS ≈ 2.9%) **none is active**.
3. **Odd-lot tender offers are a real, low-risk retail edge, but a tiny one.** EDGAR shows 17–40 listed issuer tender offers a year that mention odd-lot priority. In only about 16–22% of parsed offers was the minimum tender price above the market price near expiry (by >2% and >0.5% respectively). Among those, the gain per 99-share trade had a median of about $40 and a mean of about $240 (our EDGAR + Yahoo sample; parsing is noisy). The expected value is positive but negligible for a portfolio unless the account is small.
4. **Prediction markets price well, and the one documented bias only pays small, fat-tailed returns.**
   - Kalshi shows a classic favourite–longshot bias: contracts under 10¢ lose more than 60% of stake; makers buying at 50¢ or more earn about +2.6% per contract, with a 33% standard deviation (Bürgi, Deng & Whelan 2026).
   - On Polymarket, 2023–26 (10,537 markets in 1,525 complete events, our data), prices are well calibrated and the Kalshi bias does **not** replicate. After 2026 fees and half-spread, near-certain ≥98¢ "bonds" lose −0.2% to −0.3% per trade, 80–95¢ favourites lose −2% to −5%, and <2¢ longshots lose 65–78%. Only data-release (macro) markets hint at favourite underpricing (89/89 favourites won; n small).
   - A naïve per-market sample (filtered on lifetime volume) roughly triples the apparent longshot win-rate excess. That is a selection effect, and a warning for the engine's own backtests.
   - Live cross-venue gaps on the biggest markets (House/Senate 2026, October FOMC) are ≤1¢. Buying both sides across venues costs **≥$1.005 per $1 payout after fees**, so there is no arbitrage (our live check).
   - Legal status is volatile. The circuits are split on sports contracts (3rd Cir. pro-Kalshi; 6th and 9th Cir. pro-state, 25-Sep-2026 and 28-Aug-2026). Polymarket US is live; the international Polymarket book is closed to US persons.
5. **Pegs break violently, but you usually can't short them and can't time them.**
   - Across 15 EM/ERM breaks since 1992, the local currency's median 12-month move was about **−40%**. Bolivia abandoned its 6.96 peg on **29-Jun-2026**, a 40% devaluation to 9.73.
   - Frontier currencies (NGN, EGP, ARS, BOB, ETB) are essentially un-shortable from a US retail account.
   - Well-reserved pegs last decades: HKD for 43 years, SAR for 40.
   - Forward points already price devaluation risk.
   - Verdict: monitor only. At most, occasionally buy after the reset.
6. **Crypto structural carry has compressed.**
   - Perpetual funding averaged about **9.7%/yr** over 2016–26 (BitMEX), but only about **0.1% in 2026**.
   - Deribit 3-month basis had a median of 5.8% annualised over 2019–26. It hit 15% in 2021 and 12% in 2024, and is **~5.3% now vs T-bills at 4.1%**.
   - Rule: cash-and-carry only when basis ≥ T-bill + 6%.
   - The halving "cycle" is **n = 4 with shrinking peaks** (≈95× → 30× → 7.9× → 1.9×). BTC is 33% below its Oct-2025 high. Don't build rules on it.
   - Algorithmic or synthetic stablecoins that break go to about zero (UST, Elixir deUSD, USDN).
7. **Spin-off and index effects have mostly been arbitraged away. Thrift conversions still pop, but only for depositors.**
   - The S&P 500 inclusion effect fell from +7.6% (1990s) to +0.8% (2010s) (Greenwood & Sammon 2022).
   - The S&P spin-off ETF (CSD) returned 9.6% CAGR vs SPY's 10.9% over 2006–26, with a −70% max drawdown.
   - Thrift conversion IPOs rose a mean **+15% on day 1** vs the $10 offer price (median +19%, 24% broke issue; n = 17 first-time listings 2019–24, survivors only). Those $10 allocations go to eligible depositors. Buying at the first trade earned a median **+2%** over the next year.
8. **Avoid (evidence is negative or the edge can't be accessed):**
   - biotech binary bets. Base rates are public and priced. In our 2020–26 FDA event study, small caps returned +12% on approval and −27% on a CRL, a break-even of ≈70% approval probability. No replicated retail edge found.
   - buying old equity of Chapter 11 companies (negative drift, usually wiped out);
   - index-inclusion trades;
   - share-class arbitrage (GOOGL/GOOG spread ±1.5% daily s.d.; BRK A/B is bounded by the conversion right);
   - holdco discounts without a catalyst;
   - airdrop farming;
   - halving timing;
   - chasing commodity squeezes. Cocoa rose 5.0× then fell −78%; silver rose 5.2× then fell −51% (Jan → Sep 2026). The LME cancelled nickel trades in 2022.
   - distressed and busted-convertible bonds. Most are 144A-only (institutional buyers), which retail can't access.
9. **Free public data is enough to detect nearly all of these opportunities.** Sources: EDGAR full-text search, FRED, the Kalshi, Polymarket, Deribit and Kraken APIs, DefiLlama, Yahoo, and openFDA CRLs. Our live merger scan found 22 pending cash deals, with a median gross spread of 0.6%, a mean of 2.1%, and 7 deals above 2%.

---

## 1. Scope, method and data

**Question.** Which structural, repeatable edges give an asymmetric payoff, or odds mispriced for an identifiable reason? Which of them can one US retail investor access in 2026, and detect with free data? The system's objective is "as few trades as possible, as much % return as possible," with monthly self-calibration.

**Evidence standard.** Peer-reviewed or replicated findings rank above practitioner lore. Where possible I added reproducible data work (below). I flag small samples, survivorship bias, look-ahead bias and data-mining throughout.

| Analysis (our data) | Script | Source | Key caveat |
|---|---|---|---|
| Merger-arb, spin-off, fallen-angel, CEF-activism fund proxies; credit-spread regimes; share-class spreads | `etf_proxies.py` | Yahoo, FRED | Fund proxies include fees and manager skill; credit regimes n = 4 episodes |
| Live merger/tender spread scan | `merger_scan.py` | EDGAR FTS + Yahoo | Regex parsing; cash deals only |
| Odd-lot issuer tenders 2012–26 | `edgar_odd_lot.py` | EDGAR FTS + Yahoo | Parsing covers ~35% of filings; ticker/price-history mismatches on old events |
| Opportunity frequency (filings/yr) | `edgar_counts.py` | EDGAR FTS | Filings ≠ events exactly |
| Thrift conversion IPO returns | `thrift_conversions.py` | EDGAR + Yahoo | n = 17, survivors only |
| Prediction-market microstructure snapshot | `pm_snapshot.py` | Kalshi, Polymarket APIs | Point-in-time (28-Sep-2026) |
| Polymarket calibration (per-market and complete-event) | `pm_calibration_polymarket*.py` | Gamma + CLOB APIs | Mid/last prices, not executable asks |
| Cross-venue check | `pm_crossvenue.py` | Kalshi + Polymarket | 4 matched questions |
| Funding, basis, halvings, stablecoin depegs | `crypto_structural.py` | BitMEX, Deribit, Kraken, OKX, Hyperliquid, DefiLlama, Yahoo | Venue-specific; daily data misses intraday |
| Peg breaks and monitor | `fx_pegs.py` | FRED H.10, Yahoo | Yahoo EM FX quotes lag/contain bad ticks |
| Commodity episodes and curves | `commodities.py` | Yahoo futures | Continuous front-month splices |
| FDA complete response letters | `fda_crl.py` | openFDA | Dataset composition is selective |
| Stock reaction to FDA approvals vs CRLs | `biotech_events.py` | Drugs@FDA, openFDA CRL, SEC tickers, Yahoo | n = 135 matched events; name matching |

**Context (28-Sep-2026, from FRED/Yahoo/markets):**
- Rates: fed funds 3.88%, 3-month T-bill 4.08%, 10-year 5.17%.
- Prediction markets price about a 70% chance the Fed **hikes** 25bp at the October FOMC.
- Commodities: WTI $93 in steep backwardation; gold $4,150 (−22% from its Jan-2026 peak).
- Crypto: BTC $83.5k.
- Credit: Baa−10y 1.39%, near historic tights.

Higher cash yields raise the hurdle for every "T-bill-plus" special situation.

---

## 2. Scorecard

Returns are before tax. "Opps/yr" counts detectable candidates, not good ones. Verdicts refer to *our* system: **Core** = run continuously; **Opportunistic** = trigger-gated, rare; **Avoid**.

### 2a. Equity special situations

| Strategy | Expected return (evidence) | Payoff skew | Opps/yr (US) | Free-data detectability | Capital / access | Key risks | Verdict |
|---|---|---|---|---|---|---|---|
| Merger arb (cash deals) | Diversified: T-bill + 1–3%/yr (MERFX +2.2%/yr, MNA +1.3%/yr over T-bills). Mitchell & Pulvino: ~4%/yr excess 1963–98. Single deals: gross spread median 0.6% now; risky deals 3–15% | Strongly negative (win ~90%+, lose 15–40% on break; monthly skew −1.3 to −1.7) | ~170–280 merger proxies + ~45–55 cash tender offers | High (EDGAR 8-K/DEFM14A/SC TO-T, Yahoo) | Any; needs 10+ deals to diversify | Regulatory/financing breaks, crash correlation (MNA −12.8% Feb–Mar 2020), timing extensions | **Opportunistic** (cash substitute; only high-annualised, low-regulatory-risk deals) |
| Odd-lot tender (≤99 sh) | +2–10% in ~4–6 weeks on the ~16–22% of offers where min price > market; median profit ≈ $40, mean ≈ $240 per trade | Mildly negative (offer terminated) | 17–40 listed offers mention odd lots; ~3–10 worthwhile | High (EDGAR FTS "odd lot" in SC TO-I) | ≤99 shares; some brokers charge tender fees | Conditions fail, withdrawal, broker fees/cutoffs | **Opportunistic micro-edge** (optional, low priority) |
| Dutch-auction / fixed self-tenders (round lots) | Proration and price-above-range common; median min-price vs market at day 30: −6.6% | Negative | 6–33 Dutch auctions/yr (6 in 2025) | High | Any | Proration, post-offer drop | **Avoid** (except odd-lot variant) |
| Rights offerings | CEF rights typically dilutive; bankruptcy rights (backstopped) are creditor-only | Mixed | Few | Medium | Often restricted to holders/creditors | Dilution, illiquid rights | **Avoid** |
| Spin-offs | 1965–2000: large abnormal returns (Cusatis et al. 1993; McConnell & Ovtchinnikov 2004). CSD ETF 2006–26: 9.6% vs SPY 10.9%; 2014–19 CSD 3.6%/yr vs SPY 12.1% | Positive but noisy; −70% max DD | 8–45 Form 10-12Bs/yr | High (EDGAR 10-12B, 8-K) | Any | Leverage parked in spinco, small-cap beta | **Opportunistic** (screen for forced selling), not systematic |
| Post-reorg ("orphan") equity | +24.6% 200-day excess return 1980–93 (Eberhart, Altman & Aggarwal 1999); not re-verified recently | Positive, fat-tailed | ~10–30 emergences/yr **[unverified]** | Medium | Any; illiquid | Re-default, dilution | **Opportunistic** (small) |
| Old equity in Chapter 11 | Negative post-filing drift, retail net buyers (Dawkins, Bhattacharya & Bamber 2007) | Lottery (mostly −100%) | Many | High | Any | Absolute priority → wiped out | **Avoid** |
| Index inclusion/deletion | S&P add effect +7.6% (1990s) → +0.8% (2010s); deletions −0.6% (Greenwood & Sammon 2022) | ~Zero | ~20–30 S&P 500 changes | High | Any | Front-run by pros | **Avoid** |
| CEF discount capture / activist-driven tenders | Discount mean-reversion (Pontiff 1995); activism narrows discounts (Bradley et al. 2010); CEFS ETF 11.7% vs SPY 15.0% (2017–26) | Mildly positive | Dozens of CEF tender offers/yr **[count unverified]** | Medium (NAVs from fund sites/CEFConnect; EDGAR SC TO-I) | Any | NAV beta, leverage, proration | **Opportunistic** (CEF tender at ≥98% NAV when discount ≥8%) |
| Holdco discounts | Persistent without catalysts | ~Zero | Continuous | Medium | Any | Discounts can widen for years | **Avoid** (unless hard catalyst) |
| Liquidations / plans of dissolution | Positive announcement returns (Kim & Schatzberg 1987); IRR hinges on timing | Positive, timing risk | 0–14 liquidation proxies/yr | High (EDGAR "plan of complete liquidation") | Small caps, illiquid | Contingent liabilities, delays | **Opportunistic** (rare) |
| Share-class arb | GOOGL/GOOG premium mean 0.5%, range −4.4% to +5.3%; BRK-A vs 1500×B mean +0.2% | Symmetric, tiny | Continuous | High | Needs shorting | Costs > edge | **Avoid** |
| Thrift conversion (as eligible depositor) | Day-1 +15% mean/+19% median vs $10 (n = 17, 2019–24), 24% broke issue; 1-yr +24% vs $10 | Positive | 3–16 conversion S-1s/yr | High (EDGAR S-1 FTS) | Must be depositor before eligibility record date; purchase caps; non-transferable rights | Rationing, weak deals (2023 median −9% day 1) | **Opportunistic** (pre-positioning deposits is optional, long-dated) |
| Thrift conversion (buy at first trade) | 1-yr from first close: mean +8%, median +2% | Symmetric | same | High | Any | Illiquid small banks | **Avoid** |
| SPAC trust arbitrage | ≈ T-bill yield on trust plus free warrant/right option; 2019–20 SPAC IPO investors ≈11.6%/yr (Klausner, Ohlrogge & Ruan 2022) | Positive (floor = trust) | SPAC S-1s: 991 (2021) → 113 (2023) → 269 (2025) → 182 (2026 YTD) | Medium (10-Q trust balance; Yahoo) | Any; must instruct broker to redeem | Redemption logistics, extensions, excise tax, low liquidity | **Opportunistic** cash substitute (buy ≤ trust − 1% with near-term redemption) |

### 2b. Alternative markets

| Strategy | Expected return (evidence) | Payoff skew | Opps/yr | Detectability | Capital / access | Key risks | Verdict |
|---|---|---|---|---|---|---|---|
| Biotech binary (PDUFA / Ph3) | No replicated edge; base rates public (Ph3→approval ≈ 52%, NDA/BLA→approval ≈ 91%, BIO 2021). Our 2020–26 study, small caps: approval +11.6% mean vs CRL −26.5% mean (10th pct −69%) → break-even p ≈ 70% | Binary, negative tail | Hundreds of PDUFA dates/readouts | Medium (company PRs; Drugs@FDA; openFDA CRLs since 2025) | Options/stock | Implied moves already large; insider-information asymmetry | **Avoid** |
| Short a currency peg | Break: median ≈ −40% (12m) for local currency in 15 breaks; but carry cost, decades-long pegs, forwards pre-price risk | Positive skew, low hit-rate | 0–3 breaks/yr globally | Medium (reserves, parallel premium, forwards) | Frontier FX un-shortable for US retail; majors via FX/CME | Squeezes (offshore rates 1000%+), capital controls, timing | **Avoid** (monitor as risk signal) |
| Buy after devaluation reset | Anecdotal (e.g., post-float rallies); no systematic study here | Positive | ~1/yr | Medium | Country ETFs (ARGT, TUR, EWZ) | Second devaluation, capital controls | **Opportunistic** (small, IMF-program + unified FX only) |
| Prediction-market favourites ("bonds") | Kalshi ≥50¢ maker +2.6%/contract (SD 33%). Polymarket (our data): ≥98¢ −0.2% to −0.3% net per trade; 80–95¢ −2% to −5% net; macro/data-release favourites 89/89 won. Live "yields" 12–17% annualised are before upsets | Negative (lose 100% on upset) | Thousands | High (public APIs) | Kalshi / Polymarket US; state restrictions | Resolution/oracle disputes, venue/legal risk, correlated upsets | **Opportunistic, low priority** (data-release markets only, capped) |
| Prediction-market "information edge" (e.g., CPI/payroll brackets vs nowcasts) | Untested here; only place a model can add value | Mixed | ~50–100 macro events/yr | High | Kalshi / Polymarket US | Model error; thin books | **Experimental** (tiny budget, monthly calibration) |
| Prediction-market longshots | <10¢ lose >60% (Kalshi) | Lottery | Thousands | High | – | Negative EV | **Avoid** |
| Cross-venue PM arbitrage | Box cost ≥ $1.005 on top markets after fees (our live check) | – | Rare, fleeting | High | Needs both venues (US: Kalshi + Polymarket US) | Resolution-wording mismatch | **Avoid** (unless automated) |
| Crypto cash-and-carry (basis) | Deribit 3m basis median 5.8% (2019–26), 12% avg 2024, 3.4% 2026; now ~5.3% | Mildly negative (venue risk, margin calls) | Basis ≥ T-bill + 6pp on 31% of days 2019–26 (86% in 2021, 53% in 2024, 0% in 2026) | High (Deribit/CME/Kraken APIs) | US: spot ETF + CME (micro) futures | Exchange/counterparty, margin, basis blowout | **Opportunistic** (basis ≥ T-bill + 6%) |
| Perp funding carry | BitMEX avg ~9.7%/yr 2016–26; 2018 −7.9%, 2022 −3.4%, 2026 +0.1% | Negative in crashes | Continuous | High | Offshore perps mostly unavailable to US | Venue default (FTX), negative funding regimes | **Avoid** for US retail (use CME basis instead) |
| Halving-cycle timing | n = 4; peak multiples 95× → 30× → 7.9× → 1.9× | – | Every 4 yrs | High | Any | Tiny sample, reflexive folklore | **Avoid** as a rule |
| Airdrop farming | Mostly post-TGE decline; sybil filters (Messias, Yaish & Livshits 2023) | Lottery | Many | Low | Time-intensive, taxable as income | Wasted effort, hacks | **Avoid** |
| Token-unlock shorts | Pre-unlock weakness reported by industry studies **[unverified]** | Mixed | Many | Medium | Shorting alts not available to US retail | Squeezes | **Avoid** |
| Buy fiat-backed stablecoin depeg | USDC 0.877 → par in 2 days (+14%); FDUSD 0.881 → par in 2 days | Positive if issuer solvent; −100% if not | ~0–2/yr | High (Yahoo/DefiLlama/CEX quotes) | Crypto account | Issuer insolvency (HUSD), algorithmic coins → 0 | **Opportunistic** (strict filter) |
| Commodity squeeze chasing | Boom-bust: cocoa 5.0× then −78%; silver 5.2× then −51%; U trust 2.6× then −49% | Momentum then crash | 1–3/yr | High (Yahoo, CFTC COT, inventories) | Futures/ETFs | Exchange intervention (LME 2022), margin hikes | **Avoid** as edge |
| Term-structure (carry) tilt | Commodity carry Sharpe ≈ 0.6–0.8 diversified (Koijen et al. 2018) | Mild | Continuous | High | ETFs/futures | Roll/ETF structure | **Opportunistic** (filter only) |
| Fallen angels | ANGL 6.6% vs HYG 4.5% CAGR (2012–26), FALN +1.5%/yr vs HYG (2016–26); Ben Dor & Xu 2011 | Negative (credit crashes) | Continuous; crisis entries ~1 per decade | High (FRED, ETFs) | ETFs | Recession defaults, duration | **Opportunistic** (crisis trigger; small strategic tilt) |
| Crisis-spread credit buy | Baa−10y > 3.5% at month-end: fwd-12m HY fund +14% to +47% (4 episodes); daily-trigger variant includes −17% (Mar-2008) | Positive after trigger, GFC-path drawdown −20% to −26% | ~1 per 6–9 years | High (FRED BAA10Y) | ETFs | n ≈ 4–6; in-sample threshold; spreads can widen further | **Opportunistic, high priority** |
| Distressed debt / busted converts | Institutional returns; mostly 144A | Fat tails | Many | Low–medium (FINRA TRACE) | Mostly inaccessible (QIB-only, $1–250k lots) | Legal complexity, illiquidity | **Avoid** |

---

## 3. Equity special situations

### 3.1 Merger arbitrage and cash tender offers

**Evidence.**
- Mitchell & Pulvino (2001) studied 4,750 US deals from 1963–98. They found risk arbitrage earned about 4%/yr excess return after transaction costs. The return profile resembles *selling uncovered index puts*: beta near zero in normal and rising markets, rising to about 0.5 in severe down markets.
- Baker & Savasoglu (2002) estimate abnormal returns of roughly 0.6–0.9% per month and attribute them to limited arbitrage capital.
- Jetley & Ji (2010) document that spreads shrank after 2002 as arbitrage capital grew.

**Our data (investable proxies, total return, Yahoo).**

| Fund | Period | CAGR | Vol | Max DD | Monthly skew | Excess over T-bill | β (down-mkt β) | Same-period SPY | Same-period T-bill |
|---|---|---|---|---|---|---|---|---|---|
| MERFX (The Merger Fund) | 1990–2026 | 4.9% | 5.3% | −15.1% | −1.72 | +2.2%/yr | 0.12 (0.20) | 10.8% | 2.8% |
| ARBIX (Arbitrage Fund) | 2017–2026 | 5.2% | 1.6% | −4.3% | −1.35 | +2.4%/yr | 0.09 (0.16) | 15.0% | 2.6% |
| MNA (IQ Merger Arb ETF) | 2009–2026 | 2.7% | 7.4% | −16.7% | −1.32 | +1.3%/yr | 0.14 (0.30) | 14.1% | 1.5% |
| MRGR (ProShares Merger ETF) | 2012–2026 | 2.1% | 5.8% | −13.2% | −0.40 | +0.2%/yr | 0.06 (0.16) | 14.9% | 1.8% |

The crash signature is visible in the data. MERFX lost −10.8% in the 1998 LTCM window and −6.9% in Feb–Mar 2020 (MNA −12.8%). In the worst 5% of SPY months (SPY averaging about −8% to −9%), merger-arb funds lost about −0.3% to −1.8% on average. The edge is real but small. It is **economically a cash-plus product with crash beta**.

**Current environment.** Our live EDGAR scan (`merger_scan.py`) covers SC TO-T filings from the last 60 days and DEFM14A filings from the last 120 days. It parsed 22 pending cash deals: median gross spread 0.6%, mean 2.1%, 7 deals above 2%. Most are near shareholder votes. EDGAR shows about **230 definitive merger proxies/yr** (174 YTD 2026) and about 45–55 third-party cash tender offers/yr. Deal flow is healthy.

Regulatory breaks were unusually frequent in 2021–24: Amazon/iRobot, JetBlue/Spirit, Kroger/Albertsons, Tapestry/Capri, and Adobe/Figma (EU/UK). Nippon Steel/US Steel was blocked in Jan-2025, then approved with a golden share in Jun-2025. The 2025–26 US agencies have been more open to remedies, but review has become more political **[2026 specifics unverified; web search budget exhausted]**. China's SAMR remains a source of break risk for semiconductor and tech deals (Intel/Tower was terminated in 2023).

**How to price a deal.** The market-implied break probability is roughly p ≈ spread / (spread + downside), where downside is the fall back to the undisturbed price. A 2% spread with 25% downside implies p ≈ 7%. Take the deal only if your own estimate of p is clearly lower. Base rates: roughly 90% of announced US public deals complete (Mitchell & Pulvino's sample; industry data). Hostile deals, deals needing a financing condition, and deals needing multi-jurisdiction antitrust clearance complete less often.

**Retail fit.** Execution is easy (buy the target; for stock deals, also short the acquirer, which needs a margin account). The payoffs are small relative to the objective. Gains are short-term and taxed as ordinary income. Useful rule: consider merger arb only when **annualised net spread ≥ 15% on a strategic, financing-certain, no-antitrust-overlap deal**. Size ≤ 5% per deal and ≤ 20% aggregate.

### 3.2 Odd-lot priority, Dutch auctions and self-tenders

**Mechanism.** SEC Rule 13e-4(f)(3)(i) lets an issuer tender offer buy *all* shares from holders of fewer than 100 shares before prorating everyone else. A holder of ≤99 shares who tenders "at the purchase price" is therefore not prorated. If the minimum price in a modified Dutch auction (or the fixed price) is above the market price, that holder locks in the gap, provided the offer closes.

**Our EDGAR study (2012–2026).**
- 612 unique original SC TO-I filings mention "odd lot"; 361 are by listed companies.
- Price terms were parsed for 242; 128 have usable before/after prices.
- The opportunity set is annually **17–40 listed offers** (e.g., 37 in 2024, 17 in 2025, 19 YTD 2026).
- The *minimum* offer price exceeded the market close 30 days after filing (≈ near expiry) by >0.5% in **22%** of cases, and by >2% in **16%**.
- Conditional on a positive gap, profit per 99-share lot had a **median of $37 and a mean of $244**. The right tail includes a few high-priced stocks with gaps of $500–$3,000; some of those are artefacts of spin-off-adjusted price histories.
- The unconditional median (min price vs day-30 close) is **−6.6%**. Most issuer tenders are not a free lunch: the buyback announcement lifts the stock above the range.

**Takeaways.**
1. The edge is genuine, low-risk and detectable daily from EDGAR.
2. The absolute profit is tiny because each account can hold at most 99 shares per offer.
3. Watch for broker "voluntary corporate action" fees ($0–$50) and early broker cut-offs.
4. Check for financing or minimum conditions.

The engine can surface these as optional "micro-trades." For a small account (<$25k) they matter more, since 1 month × 3–10% on about $2–10k is meaningful there.

**Round-lot Dutch auctions** (Comment & Jarrell 1991 document positive signalling returns). For large holders the trade is mostly a bet on proration and the post-offer drift. **Avoid.** Dutch-auction volume has fallen (EDGAR: 14–33/yr through 2024, 6 in 2025, 6 YTD 2026).

### 3.3 Rights offerings

US rights offerings are rare outside closed-end funds and restructurings. CEF rights offerings are typically priced at a discount to NAV and dilute non-participants. The attractive cases, backstopped rights offerings in Chapter 11, are reserved for creditors and backstop parties. **Avoid**, except to avoid being diluted in funds you already own.

### 3.4 Spin-offs

**Evidence.**
- Cusatis, Miles & Woolridge (1993) found significant positive abnormal returns for spin-offs and parents over up to 3 years (1965–88), concentrated in firms that later became takeover targets.
- McConnell & Ovtchinnikov (2004) extended the finding to 2000.
- Greenblatt (1997) popularised the forced-selling logic: index funds and institutions dump small, unwanted spincos.
- Veld & Veld-Merkoulova (2009) reviewed 26 studies: +3.0% average announcement abnormal return, with long-run evidence mixed.

**Our data (investable index).** The Invesco S&P Spin-Off ETF (CSD, 2006–2026) returned 9.6% CAGR vs SPY 10.9%, IJH 9.4% and RSP 9.5%. Vol was 23.8% and max drawdown −70.5% (vs −55% for SPY).

| Sub-period | CSD | SPY | IJH |
|---|---|---|---|
| 2006–2013 | 9.8% | 6.0% | 8.8% |
| 2014–2019 | 3.6% | 12.1% | 9.3% |
| 2020–2026 | 15.3% | 15.2% | 10.3% |

The mechanical spin-off premium has **not** persisted as a systematic, investable edge since about 2014. The remaining edge is selective: small spincos relative to the parent, index-ineligible spincos, insider equity incentives, and waiting out the first 1–3 months of forced selling. Detection is easy (EDGAR Form 10-12B: 8–45 per year; 18 YTD 2026). **Opportunistic** only.

### 3.5 Post-bankruptcy ("orphan") equities vs. old equity in bankruptcy

**New equity** issued at emergence is often received by creditors who cannot or will not hold equity, such as CLOs and loan funds. Eberhart, Altman & Aggarwal (1999) found +24.6% 200-day excess returns for 131 emergences (1980–93). I did not find a recent replication, so treat the effect as plausible but unproven today. **Opportunistic.**

**Old equity** of a company in Chapter 11 is usually cancelled under absolute priority. Dawkins, Bhattacharya & Bamber (2007) document negative post-filing drift, with small trades dominating the buy side. The Bed Bath & Beyond retail frenzy (2023; equity cancelled) shows the typical outcome. Hertz (2020–21), where old equity was rescued by a used-car price boom, is the rare exception that keeps the lottery alive. **Avoid.**

### 3.6 Index inclusion and deletion

Greenwood & Sammon (2022) report average S&P 500 addition abnormal returns of +3.4% (1980s), +7.6% (1990s) and **+0.8% (2010–2020)**; deletions went from strongly negative to −0.6%. The effect is now small, known, and front-run by professional desks. **Avoid.**

### 3.7 Closed-end fund discounts, activism, holdco discounts, liquidations

**CEFs.**
- Discounts mean-revert and predict returns (Pontiff 1995; Lee, Shleifer & Thaler 1991 on sentiment).
- Activist campaigns to open-end or tender narrow discounts significantly (Bradley, Brav, Goldstein & Jiang 2010).
- The investable proxy, the Saba Closed-End Funds ETF (CEFS, 2017–26), returned 11.7% CAGR vs SPY 15.0%, with −39% max drawdown. Discount capture adds beta and leverage, not a free lunch.
- The clean retail trade is the **CEF self-tender at 98–99% of NAV** when the fund trades at a ≥8–10% discount. The gain is about the discount × acceptance fraction. Proration and NAV risk (hedgeable with an index ETF) remain. **Opportunistic.**

**Holdco discounts** (e.g., SoftBank, Exor, Pershing Square Holdings, Liberty trackers) persist for years without a hard catalyst such as a large buyback, collapse of the structure or a tender. **Avoid** unless a dated catalyst exists.

**Liquidations.** Kim & Schatzberg (1987) found positive announcement returns for voluntary liquidations. EDGAR shows 0–14 "plan of complete liquidation" proxies per year (14 in 2024, 7 in 2025, 7 YTD 2026). The IRR depends on distribution timing and contingent liabilities. **Opportunistic, rare.**

### 3.8 Share-class arbitrage

Lamont & Thaler (2003) is the classic evidence (3Com/Palm) that mispricings can persist when shorting is constrained. For liquid dual-class pairs the gaps are small:

| Pair | Mean | 5th–95th percentile | Min–max | Today |
|---|---|---|---|---|
| GOOGL premium over GOOG (2014–26) | +0.52% | −1.07% to +3.15% | −4.35% to +5.31% | +1.06% |
| BRK-A vs 1500×BRK-B (2010–26) | +0.19% | −0.19% to +1.14% | — | −0.10% |

For BRK, A shares can be converted into 1,500 B at any time, which bounds the A discount. Transaction and borrow costs absorb the edge. **Avoid.**

### 3.9 Mutual thrift / savings-bank conversions

**Mechanism.** In a standard mutual-to-stock conversion, shares are sold at **$10.00** through a subscription offering. Priority goes to *eligible account holders*: depositors with qualifying balances on an eligibility record date usually set a year or more before the offering. The pricing is set by an independent appraisal, often at a large discount to pro-forma book value. Subscription rights are **non-transferable**; agreeing to sell them or acting as a nominee is prohibited.

**Our data.** 17 first-time listings in 2019–24 had Yahoo data (survivors only; acquired thrifts, usually good outcomes, are missing):

| Measure | Mean | Median | Note |
|---|---|---|---|
| Day-1 close vs $10 | +15.3% | +18.6% | 24% traded below $10 |
| 1-year vs $10 | +23.9% | +28.6% | |
| 1-year from first close (outsider buying at first trade) | +8.4% | +2.0% | |

By year, the median day-1 pop was +40% (2021), +29% (2022), **−9% (2023)** and +11% (2024). The pop is regime-dependent (bank-stock sentiment, rates). EDGAR shows 3–16 conversion S-1s per year (6 in 2025, 6 YTD 2026). Maksimovic & Unal (1993) document conversion underpricing academically.

**Retail fit.** The edge requires being a depositor *in advance* and accepting rationing and allocation caps. That makes it a slow, low-effort "option" (small deposits at many mutual savings banks), not something an engine can act on at short notice. **Opportunistic.** For outsiders buying on the open market, there is no edge.

### 3.10 SPACs: does trust-value arbitrage still work in 2026?

**Structure.** Shareholders can redeem for their pro-rata share of a trust holding T-bills (≈$10 plus accrued interest) at the business-combination vote or extension. A SPAC share bought at or below trust value is therefore a **T-bill with a free call option** (the upside if the deal is popular), plus warrants or rights.

**History.**
- Klausner, Ohlrogge & Ruan (2022) found that SPAC IPO investors, mostly arbitrage funds that redeemed, earned about 11.6%/yr in 2019–20.
- Shareholders who stayed through the merger did badly: the median SPAC held only about $5.70 of net cash per share at merger.
- Merged SPAC shares averaged about $3.85 for 2020–21 deals (Wikipedia summary of 2022 study).
- IPO counts: 2019: 59; 2020: ~250; 2021: 613; 2022: 86; 2023: 31; 2024: 57 (Wikipedia).
- Our EDGAR proxy (SPAC S-1 filings) shows a **revival**: 991 (2021) → 113 (2023) → 154 (2024) → **269 (2025)** → **182 YTD 2026**. Many new SPACs carry rights rather than warrants. Our scan shows pre-deal SPAC shares at about $10.6–10.7, i.e., trust plus accrued interest.

**2026 edge.** The floor return now is about the T-bill yield (~4%) plus small "discount to trust" capture and option value. Positioning should only be **≤ trust − 1% with a redemption date ≤ 6 months away**.

**Operational risks.**
- Redemption requests must usually be made by instructing the broker, often 2 business days before the vote.
- Extensions delay capital.
- The 1% stock-buyback excise tax can apply to redemptions in some structures.
- SEC rules adopted in Jan-2024 add disclosure but not economics.

**Opportunistic cash substitute.** Never hold through the de-SPAC by default.

---

## 4. Biotech binary events (PDUFA dates, Phase 3 readouts)

**Base rates (well documented, hence priced).**
- BIO/Informa/QLS (2021), 2011–20: Phase I→II 52.0%; Phase II→III 28.9%; **Phase III→NDA/BLA 57.8%**; **NDA/BLA→approval 90.6%**. Likelihood of approval from Phase I is 7.9%; oncology is lower and hematology higher.
- Wong, Siah & Lo (2019), with 406k data points: probability of success from Phase 1 to approval 13.8% overall, **3.4% in oncology**.

**Free monitoring source.** The FDA began publishing complete response letters (CRLs) in 2025 (openFDA `transparency/crl`: 458 letters as of Aug-2026; 69 dated 2024, 59 in 2025, 32 so far in 2026). The dataset was assembled selectively: its first release covered CRLs for products later approved. It is useful for tracking new CRLs and deficiency types (manufacturing/facility language appears in about three-quarters of letters), not as an unbiased approval base rate.

**Our event study (`biotech_events.py`).** FDA decisions 2020–26: Drugs@FDA original NME-NDA/BLA approvals and openFDA CRL letters, matched to listed sponsors, XBI-adjusted returns. "Small/volatile" = prior 60-day volatility above 60%, a proxy for single-asset biotechs.

| Event | n | Pre-run-up (t−30→t−1), mean / median | Event window (t−1→t+2), mean / median | 10th / 90th pct of event | Drift after (t+2→t+30), mean / median |
|---|---|---|---|---|---|
| CRL, small/volatile | 29 | −5.8% / −4.1% | **−26.5% / −17.0%** | **−68.7%** / +4.3% | +0.9% / −4.0% |
| Approval, small/volatile | 12 | +6.8% / +3.1% | **+11.6% / +7.1%** | −11.6% / +43.9% | **−6.3% / −8.0%** |
| CRL, large/calm | 29 | +0.5% / −3.0% | −8.6% / −0.8% | −31.8% / +3.3% | +2.1% / +4.6% |
| Approval, large/calm | 65 | +2.5% / +2.4% | +0.9% / −0.3% | −4.1% / +5.5% | −2.1% / −2.3% |

**Reading it.**
- For small biotechs the payoff is roughly +12% if approved and −27% if rejected (with a −69% tail).
- Holding the stock through the decision breaks even at about a **70% approval probability** (0.70 × 11.6 ≈ 0.30 × 26.5). That is roughly what one would expect for small-cap first-cycle reviews, below the 91% all-sponsor NDA/BLA base rate. So there is no free lunch in the average.
- The "run-up then sell-the-news" folklore has *weak* support: +3–7% pre-drift and −6% to −8% post-approval drift in the small-cap subsample. With n = 12 this is not significant.

Caveats: small n; name-matching misses subsidiaries; CRL letter dates can precede disclosure by 0–3 days.

**Options.** Options on small and mid-cap biotechs usually imply very large event moves, and implied volatility collapses after the event. The earnings-announcement literature (e.g., Dubinsky, Johannes, Kaeck & Seeger 2019) finds event variance is on average priced richly, which favours premium sellers. But the loss when a biotech gaps is catastrophic and hard to size.

I did not find a peer-reviewed, replicated, retail-accessible edge. The informational playing field is uneven: specialist funds have KOL (key opinion leader) networks, and trial data carries insider-trading risk.

**Verdict: Avoid** as a systematic strategy. If the user insists on exposure, use defined-risk structures (debit spreads) sized as lottery tickets (≤0.5% of capital), and only where the engine has an explicit probability model that differs materially from the implied distribution.

---

## 5. Currency pegs and central-bank floors

### 5.1 What breaks look like (our data)

Change in the local currency's USD value (EUR for CHF) from 5 trading days before the break:

| Break | Date | Day 1 | +1m | +3m | +12m | Worst within 12m | Prior 12m vol |
|---|---|---|---|---|---|---|---|
| GBP exits ERM | 1992-09-16 | −9.8% | −16.2% | −20.1% | −22.4% | −28.2% | 11.4% |
| SEK peg abandoned | 1992-11-19 | −11.0% | −13.6% | −20.8% | −28.2% | −28.2% | 13.8% |
| MXN band abandoned | 1994-12-20 | −13.5% | −39.1% | −51.3% | −54.2% | −57.1% | 6.1% |
| THB float | 1997-07-02 | −12.6% | −21.3% | −29.5% | −40.1% | −54.8% | 13.6% |
| MYR float | 1997-07-14 | −1.7% | −9.1% | −18.8% | −38.9% | −46.6% | 3.0% |
| KRW band abandoned | 1997-11-17 | −5.3% | −33.7% | −41.8% | −24.2% | −49.7% | 5.7% |
| BRL crawling peg ends | 1999-01-13 | −8.3% | −36.3% | −27.5% | −33.2% | −45.0% | 1.7% |
| ARS convertibility ends | 2002-01-07 | −64.0% | −67.0% | −64.0% | −70.0% | −73.9% | 1.1% |
| RUB free float | 2014-11-10 | −6.9% | −20.6% | −35.9% | −33.5% | −39.3% | 12.9% |
| **CHF floor removed** (CHF value) | 2015-01-15 | **+22.9%** | +12.8% | +16.7% | +9.7% | +8.8% | 1.9% |
| CNY fixing reform | 2015-08-11 | −2.8% | −2.6% | −2.4% | −6.4% | −7.4% | 1.7% |
| KZT free float | 2015-08-20 | −25.9% | −32.3% | −39.2% | −44.8% | −51.7% | 6.5% |
| EGP float | 2016-11-03 | −41.8% | −50.9% | −52.8% | −49.6% | −54.7% | 17.6% |
| NGN unification | 2023-06-14 | −0.5%* | −40.8% | −39.0% | −69.4% | −71.8% | 8.5% |
| ARS step devaluation | 2023-12-13 | −54.6% | −55.5% | −57.1% | −64.3% | −64.3% | 20.0% |
| EGP float #2 | 2024-03-06 | −37.7% | −34.8% | −34.9% | −39.0% | −39.5% | 4.4% |
| ETB float | 2024-07-29 | −0.9%* | −46.8% | −53.1% | −58.5% | −58.9% | 6.7% |
| **BOB peg abandoned** | **2026-06-29** | (official −40% to 9.73)* | −40.0% | −43.8% | n/a | −45.3% | 5.3% |

\*Yahoo's quotes lag the official change for NGN, ETB and BOB. The Bolivian central bank announced "a 40% devaluation … setting the rate at BOB 9.73" on 29-Jun-2026, after the parallel rate had reached about Bs 15 (Wikipedia). Yahoo now shows about 11.98.

**Patterns.**
1. The median 12-month move across the 15 devaluations (excluding the CNY 2015 reform and the CHF floor) is **−40.1%**. The typical break is a step followed by an overshoot within 1–3 months.
2. Realised volatility before the break is low (1–20%), so any options that exist look cheap. The market still knew: parallel-market premia, forward points and reserve drains usually flash red for months.
3. The **CHF 2015** case shows that betting against a *floor* (a strong-side commitment) can blow up the *short* side instead.

### 5.2 Why "short the peg" is still not a good systematic trade for us

- **Timing and carry.** A peg can outlast the trade. Obstfeld & Rogoff (1995) stress that tight pegs rarely survive long among open economies. The survivors are backed by huge reserves or currency boards (HKD since 1983, SAR since 1986) and can last decades while shorts pay the interest differential. A classic example is the 2019–20 Hong Kong dollar option bets by well-known hedge funds, which expired worthless **[details unverified]**.
- **Forwards already price the risk** (the "peso problem"). Burnside, Eichenbaum, Kleshchelski & Rebelo (2011) show carry-trade returns aren't explained simply by rare crashes. Expected devaluation is largely in the forward points you pay.
- **Squeezes.** Defending central banks squeeze shorts. Thailand segmented its offshore baht market in May-1997. Hong Kong's overnight HIBOR briefly spiked to about 280% in Oct-1997 **[recalled figure]**. Short-peg positions are funded daily, so a squeeze can force exit before the break.
- **Access (US retail).** NFA-regulated retail FX covers majors and some EMs (e.g., MXN, ZAR, TRY, CNH, HKD) with leverage caps. CME lists EUR, JPY, GBP, CHF, CAD, AUD, MXN, BRL, ZAR and CNH futures and options. **NGN, EGP, ARS, BOB, ETB, LBP, MWK cannot practically be shorted**. The only proxies are country-ETF puts (EWW, EWZ, TUR, ARGT), which mix equity and FX risk. Frontier NDFs require institutional ISDA documentation.

**Early-warning indicators (for monitoring and risk):**
- real exchange-rate overvaluation, falling reserves / reserves-to-M2, export slump, credit boom (Kaminsky, Lizondo & Reinhart 1998; Frankel & Rose 1996; Frankel & Saravelos 2012);
- a parallel-market premium above ~20–50% (Bolivia ~115% before its break; Egypt 2016, Nigeria 2023 and Ethiopia 2024 roughly 60–100% **[recalled]**) — the size of the eventual step roughly converges toward the parallel rate;
- forward points / NDF-implied depreciation;
- IMF program negotiations. A new program usually *precedes* unification (EGP 2016 and 2024, ETB 2024).

### 5.3 2026 monitor (Yahoo, 28-Sep-2026)

- **HKD** 7.845 (weak edge of the 7.75–7.85 band).
- **GCC pegs** at parity: SAR 3.754, AED 3.673, QAR 3.64, OMR 0.385, BHD 0.377 (Bahrain is the weakest fiscally). Yahoo GCC ticks are noisy; ignore their "vol".
- **DKK** (ERM-II) and **XOF** (CFA, EUR 655.957) are stable.
- **Bulgaria** adopted the euro on 1-Jan-2026 (BGN quotes delisted). That is the "good" way for a peg to end.
- Managed/floated: **TRY** +17.8% in 12m (managed depreciation), **ARS** +13.8% (band regime), EGP +8.2%, **NGN −11.4% (appreciated)**, LKR +10.4%. **INR** has weakened 8% to ~96/USD. **CNY** has *appreciated* 6% to 6.71.
- De facto pegs with parallel premia and no tradable instruments: **MWK** flat at ~1,717, **MZN** ~63.2, CUP official 24. These are the classic pre-break profiles.
- **IRR** was unified from 42,000 to ~1.0–1.7 million in 2026 (not tradable).

**Verdict: Avoid shorting pegs.** Use the monitor as an input to the macro-risk module. After a reset, allow a small **opportunistic long**, via a liquid country ETF or USD sovereign-bond fund, when four conditions hold: FX is unified, an IMF program is in place, the real exchange rate is cheap and the parallel premium is under 10%.

---

## 6. Prediction markets (Kalshi, Polymarket)

### 6.1 Legal status and fees (verified Sep-2026)

- **Kalshi** is a CFTC-designated contract market.
  - Sports contracts (about 89% of 2025 revenue per Wikipedia) are in litigation with states.
  - The **3rd Circuit** held that CFTC jurisdiction preempts New Jersey. **New Jersey has petitioned the Supreme Court.**
  - The **9th Circuit** (opinion 28-Aug-2026) and **6th Circuit** (25-Sep-2026, Ohio and Tennessee) held that sports contracts are **not swaps** and states may apply gambling law. The circuit split makes Supreme Court review likely.
  - State actions include Massachusetts (injunction Jan-2026), Nevada (settlement Jul-2026), New York (AG suit Jul-2026), Washington, Michigan, Wisconsin and Ohio.
  - Minnesota enacted a ban, which a federal court enjoined in Jul-2026. The CFTC has counter-sued several states.
  - Non-sports event contracts (economics, politics) are on firmer ground, but venue and state risk is real.
- **Polymarket.** The CFTC fined it $1.4m in 2022, after which it blocked US users. It acquired QCEX (a CFTC-licensed DCM) in Jul-2025 and received an amended order of designation in Nov-2025. **Polymarket US** has been open without a waitlist since May-2026. The **international book remains close-only for US IPs**, so US persons must use Polymarket US. Its order books are separate; don't assume the international liquidity described below applies.
- **Fees (2026).**
  - Kalshi taker fee = ceil(0.07 × C × P × (1−P)), at most 1.75¢/contract at 50¢. Maker fees apply on some series.
  - Polymarket international (Fee Structure V2) charges takers C × rate × p(1−p): crypto 0.07; sports 0.05 (from Jul-2026); politics/finance/tech 0.04; economics/culture/weather 0.05; geopolitics 0. Makers pay nothing and receive 15–25% rebates.
  - Polymarket US taker Θ = 0.0695, maker rebate Θ = −0.0125.
  - Some Polymarket markets pay "holding rewards" on positions (API flag `holdingRewardsEnabled`; the reported rate of ~4% APY is **[unverified]**).
- **Resolution risk.**
  - Polymarket resolves via the UMA optimistic oracle: $750 bond, 2-hour challenge window, escalation to a token-holder vote (~48h). Outcomes can be contested; rules, not titles, govern.
  - Kalshi uses its own settlement rules. In a 2026 controversy it froze about $54m of trades in Khamenei-related markets.

### 6.2 Microstructure snapshot (our data, 28-Sep-2026)

| | Kalshi (non-combo) | Polymarket (international) |
|---|---|---|
| Open markets | 107,403 | ≥60,100 (pagination capped) |
| With 24h volume | 17,503 | 16,258 |
| 24h volume | 78.3m contracts (~$ notional ≤ $78m) | $44.4m |
| Share of 24h volume in top-1% markets | 82% | 82% |
| Median quoted spread, markets with 24h volume | 3¢ | 2¢ |
| Median spread, top-200 markets | 1¢ | 1¢ |
| Category concentration | Sports = 78% of 24h volume | Sports fee-type = 75% of open markets |

Liquidity is extremely concentrated. Outside the top few hundred markets, 3–10¢ spreads dominate the economics.

**Cross-venue check** (live, taker fees included): cost of buying YES on one venue and NO on the other.

| Question | Kalshi bid/ask | Polymarket bid/ask | Box cost (YES Kalshi + NO Poly) | Box cost (YES Poly + NO Kalshi) |
|---|---|---|---|---|
| Democrats win House 2026 | 0.916/0.917 | 0.92/0.93 | 1.005 | 1.022 |
| Democrats win Senate 2026 | 0.61/0.62 | 0.62/0.63 | 1.026 | 1.046 |
| Fed +25bp Oct-2026 | 0.69/0.70 | 0.68/0.69 | 1.044 | 1.024 |
| Fed no change Oct-2026 | 0.29/0.30 | 0.30/0.31 | 1.023 | 1.043 |

Mid-price gaps are ≤1¢ and **no box is below $1**. Flagship markets are efficiently linked, and even a sub-$1 box would carry resolution-wording mismatch risk. Historical cross-venue gaps on election nights were larger (e.g., PredictIt's $850 cap and 10% profit fee sustained wide gaps in 2020–24), but these belong to thinner or capped markets.

### 6.3 Is there a systematic bias? (evidence)

**Kalshi.** Bürgi, Deng & Whelan (2026) studied 46,282 contracts and 313,972 prices (2021–Apr-2025; contracts with ≥$1k volume, open ≥24h). Their findings:
- Prices are informative and more accurate near close.
- There is a clear favourite–longshot bias: contracts at **≤10¢ lose >60%** of stake on average, while contracts **>70¢ earn small but significant positive post-fee returns**.
- Makers buying at ≥50¢ earn **+2.6%** after fees, with a **33% standard deviation** of per-contract return.
- The average pre-fee return across contracts is about −20%, because the losses are concentrated in cheap contracts.
- They attribute persistence to small volumes, risk and lack of awareness. Now that the bias is published, it may decay.

**Older evidence.**
- Page & Clemen (2013), on InTrade: longshot overpricing in *long-dated* markets (time-discounting), but good calibration near expiry.
- Snowberg & Wolfers (2010), on horse racing: favourite-longshot bias driven by misperception of probabilities.
- Rothschild & Sethi (2016): a single large trader can move InTrade prices for weeks.

**Our Polymarket test.** Two samples, 2023–26:
- **(a) Per-market sample:** the 6,000 highest-volume closed markets (3,795 clean binary resolutions).
- **(b) Complete-event sample:** every resolved market in those markets' events, whatever its own volume.

Sample (a) conditions on lifetime volume, a *post-outcome* variable (winning longshots attract late volume). It shows a strong *reverse* favourite–longshot pattern: 5–20¢ contracts won 12–22% of the time vs 7–15% implied (+50–75% returns), and 80–95¢ favourites lost 6–9%. Sample (b) removes the selection: the effect shrinks by roughly two-thirds and mostly loses significance. That is exactly the look-ahead bias a naïve backtest would fall into.

**Complete-event results.** 10,537 markets in 1,525 events, resolutions Mar-2023 → Sep-2026. Both sides of every contract are included, so the table is symmetric. CIs are 95%, bootstrapped by event. Net = after a 0.5¢ half-spread plus the 2026 taker fee of 0.04·p(1−p); before 2026 most Polymarket markets were fee-free.

| Price bucket | Horizon 1 day: win vs price | Pre-cost return | Net return (95% CI) | Horizon 7 days: net return (95% CI) | Horizon 30 days: net return (95% CI) |
|---|---|---|---|---|---|
| <2¢ | 0.34% vs 0.33% | −64% | **−78%** (−88, −67) | **−65%** (−82, −46) | **−65%** (−84, −46) |
| 2–5¢ | 2.6% vs 3.2% | −25% | −37% (−67, −3) | −7% (−42, +40) | **−56%** (−80, −30) |
| 5–10¢ | 8.8% vs 7.2% | +23% | +11% (−18, +46) | +11% (−14, +41) | −10% (−42, +25) |
| 10–20¢ | 17.6% vs 14.8% | +21% | +13% (−2, +31) | +8% (−11, +30) | −3% (−25, +22) |
| 80–90¢ | 82.1% vs 85.1% | −3.4% | **−4.5%** (−7.6, −1.4) | **−4.5%** (−8.3, −1.0) | −0.7% (−4.6, +3.0) |
| 90–95¢ | 91.2% vs 92.7% | −1.6% | −2.4% (−5.1, +0.2) | **−2.6%** (−5.3, −0.3) | −0.8% (−3.9, +2.1) |
| 95–98¢ | 97.5% vs 96.7% | +0.8% | +0.2% (−1.1, +1.4) | −1.0% (−2.8, +0.5) | +0.6% (−0.7, +1.7) |
| ≥98¢ | 99.64% vs 99.66% | −0.02% | **−0.23%** (−0.43, −0.08) | **−0.32%** (−0.56, −0.11) | **−0.27%** (−0.54, −0.04) |

Brier scores: 0.066 (1 day), 0.073 (7 days), 0.059 (30 days).

**What this means.**
1. Polymarket's large events are **well calibrated**. There is **no Kalshi-style favourite underpricing**. At 1–7-day horizons, 80–95¢ favourites were, if anything, slightly *over*-priced (net −2% to −5%). The mirror image, 5–20¢ contracts, was slightly under-priced (+8–13% net), but those CIs include zero.
2. **Near-certain "bonds" (≥98¢) lose ~0.2–0.3% per trade after costs**, significantly. Their apparent 12–17% "annualised yield" is fully paid away in upsets and costs.
3. **Ultra-longshots (<2¢) lose 65–78% net.** The only robust bias on both venues is the one against lottery tickets.
4. **Category matters.** In macro/markets questions (data releases, Fed, prices), 7-day favourites at 90–98¢ won **89 of 89** (net +4.1%) and 2–10¢ longshots won **0 of 90**. Sports favourites earned +1.4%; crypto, politics and other favourites earned −2.7% to −3.3%. This is suggestive of Kalshi-style favourite underpricing *only* in objective, data-release markets, but n is small.

Caveats: the prices are CLOB history values (mid/last), not executable asks. Events are still selected by their largest market's volume. The sample is heavy in sports, elections and crypto.

**Documented large mispricings, and what they teach.**
- **2016:** election-day markets had Clinton at ~80%+; she lost. That is not proof of mispricing, since 20% events happen.
- **2020:** after the result was clear, "Trump wins" traded around 10–15% for weeks on several venues. Buying Biden paid ~10% in ~6 weeks, a partisan/wishful-bias episode **[levels from memory; unverified]**.
- **2024:** Polymarket had Trump at ~60% versus toss-up polling, and was right. A single whale reportedly staked tens of millions **[unverified]**.

The pattern: the biggest opportunities arise when *partisan or emotional* flow meets a *mechanically resolved* outcome after the uncertainty has collapsed. They are rare (a few per election cycle) and capital-limited.

### 6.4 Strategies ranked

1. **Near-certain "bond" markets** (buy the ≥95¢ side). Live medians, if resolved as priced: Kalshi 2,504 sides, 93 days, +1.9% gross, **~12% annualised after taker fee**; Polymarket 2,536 sides, 36 days, +2.0% gross, **~17% annualised**.
   - Those yields are illusory on average. On Polymarket, the ≥98¢ bucket lost 0.2–0.3% per trade after costs; upsets and fees consume the whole "yield."
   - The tail: one upset wipes out about 20–50 trades' profit, and upsets cluster, for example on correlated sports or policy shocks.
   - The only defensible version is **objective data-release markets** (CPI, payrolls, Fed decision, index/price thresholds). Here Kalshi's favourite underpricing and our macro subsample (89/89) point the same way.
   - Conditions: ≤60 days to expiry, ≥15% annualised after fees, maker (limit) orders. Cap at ≤1% of capital per market and ≤5% aggregate. **Opportunistic, low priority.**
2. **Fading longshots** (selling cheap YES = buying expensive NO). Economically identical to #1 at the other end.
3. **Buying longshots.** Strongly negative EV. **Never.**
4. **Cross-venue arbitrage.** Not available on flagship markets after fees. Resolution-wording mismatch makes "arbs" risky. **Avoid** unless fully automated.
5. **Information edge.** Macro-release markets (CPI, payrolls, Fed) versus professional forecasts, e.g., comparing Kalshi CPI brackets to Cleveland Fed nowcasts. This is the only place a model can add value. Treat it as an experiment within a tiny budget, and calibrate monthly.

**Tax/legal note.** US tax treatment of event-contract gains is unsettled (ordinary vs. Section 1256 treatment is debated) **[unverified]**. State access varies; check residency before recommending any sports contract.

---

## 7. Crypto-specific structural trades

### 7.1 Funding-rate carry and cash-and-carry basis (our data)

BitMEX XBTUSD perpetual funding, annualised (short-perp/long-spot collects it):

| 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 YTD |
|---|---|---|---|---|---|---|---|---|---|---|
| 53.5% | 27.2% | −7.9% | 6.8% | 6.9% | 15.4% | −3.4% | 3.9% | 11.2% | 6.2% | **0.1%** |

Over 2016–26 the average was 9.7%/yr. The 30-day annualised funding ranged −104% to +200% (5th–95th percentile −39% to +69%). 29% of 8-hour periods were negative, and the worst 90-day stretch cost −10.4%.

**Deribit quarterly futures basis** (contract with 45–135 days to expiry vs perpetual, annualised):

| 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 YTD |
|---|---|---|---|---|---|---|---|
| 2.8% | 8.0% | **15.0%** (max 57.9%) | 1.7% | 5.2% | **12.3%** | 7.0% | 3.4% |

The median over 2019–26 was 5.8%, with a 5th–95th percentile range of −1.7% to +20.0%.

**Today's curve.** Deribit Dec-26 is at 5.3% and Mar-27 at 5.2%; Kraken Mar-27 is at 6.6%. Instantaneous funding: Kraken 7.6%, BitMEX 11.0%, Hyperliquid 6.1%, OKX 3.3%. The 3-month T-bill is **4.08%**, so the carry premium over cash is only about 1–2%.

**Evidence.** Schmeling, Schrimpf & Todorov (2023, BIS WP 1087, "Crypto carry") find carry is large and time-varying, driven by leveraged retail demand, and predicts crash risk. He, Manela, Ross & von Wachter (2022) model perpetual-futures pricing.

**US retail access.** Long spot ETF (e.g., IBIT) plus short CME Bitcoin futures or micro futures (0.1 BTC). That combination avoids offshore venue risk (FTX in 2022 is the lesson).

**Rule.** Enter only when the CME 2–3-month annualised basis is ≥ T-bill + 6% (e.g., ≥10% today). Hold to expiry and keep ≥2× the initial margin in reserve for basis blowouts. **Opportunistic.**

On Deribit data this condition held on **31% of days in 2019–26**: 22% in 2019, 58% in 2020, **86% in 2021**, 4% in 2022, 8% in 2023, **53% in 2024**, 9% in 2025 and **0% in 2026**. The median excess over T-bills was 3.0pp. CME basis usually runs a little below offshore basis (not tested here).

### 7.2 Halving cycles

| Halving | Price | 12m return | Peak multiple within 18m | Subsequent max DD |
|---|---|---|---|---|
| 2012-11-28 | ~$12 | ~+8,000% | ~95× | — (approx.) |
| 2016-07-09 | $651 | +287% | 30.0× | −83% |
| 2020-05-11 | $8,602 | +559% | 7.9× | −77% |
| 2024-04-20 | $64,994 | +31% | **1.9×** | cycle peak $124.8k (6-Oct-2025); now −33% |

Four observations, a reflexive narrative, and shrinking amplitude. The timing has rhymed (the peak came about 18 months post-halving each time) but the magnitude has not. **Do not encode as a rule.**

### 7.3 Stablecoin depegs

| Coin (type) | Worst print | When | Outcome |
|---|---|---|---|
| USDC (fiat, regulated) | $0.877 intraday | 11-Mar-2023 (SVB exposure) | Par in 2 days → **+14%** |
| FDUSD (fiat) | $0.881 | 2-Apr-2025 | Par in 2 days (+13.5%) |
| DAI (crypto-collateralised, USDC-backed) | $0.897 | 11-Mar-2023 | Recovered in 2 days |
| TUSD (fiat, troubled custodian) | $0.964 daily | Feb-2024 | Recovered after 45 days below $0.99 |
| UST (algorithmic) | $0.006 | May–Jun-2022 | **Never recovered** |
| deUSD (Elixir, synthetic) | $0.00 | Nov-2025 → 2026 | Worthless |
| USDN (algorithmic) | $0.015 | — | Worthless |
| HUSD (fiat, weak issuer) | $0.02 | — | Worthless |

Sources: Yahoo intraday lows; DefiLlama daily with 3-day median to remove glitches. DefiLlama also shows MIM near $0.02 in Sep-2026 **[cause unverified]**.

**Rule.** Buy only regulated, fiat-backed coins with attested T-bill reserves and open primary redemption, at ≤$0.97, with position ≤5% and exit ≥$0.995. Never algorithmic, synthetic, yield-bearing or "delta-neutral" dollars. Frequency is about 0–2 per year. **Opportunistic.**

### 7.4 Other crypto items

- **Airdrops.** Farming is labour-intensive and increasingly sybil-filtered. Rewards are taxed as ordinary income at receipt. Many tokens drift down after launch (Messias, Yaish & Livshits 2023, "Airdrops: giving money away is harder than it seems"). **Avoid.**
- **Token unlocks.** Industry studies (e.g., Keyrock 2024) report pre-unlock weakness **[unverified]**. US retail generally cannot short alts on regulated venues. **Avoid.**
- **Exchange-failure contagion** (Mt.Gox 2014, FTX Nov-2022, the 10-Oct-2025 liquidation cascade of ~$19bn **[unverified figure]**). These are risk lessons, not trades. Custody at regulated venues and ETFs dominates.
- **ETF flows.** There is no robust evidence that daily spot-ETF flows predict returns beyond contemporaneous momentum. **Avoid** as a signal.

---

## 8. Commodity squeezes and term structure

### 8.1 Episodes (our data, Yahoo)

| Asset | Run-up (2y low → peak) | Peak date | Max DD after peak | Now vs peak | 1y vol |
|---|---|---|---|---|---|
| Cocoa (CC) | **5.0×** ($2,498 → $12,565) | 2024-12-18 | **−77.7%** | −55% ($5,607) | 59% |
| Silver (SI) | **5.2×** ($22 → $115) | 2026-01-26 | −51.4% | −47% | 70% |
| Gold (GC) | 2.65× ($2,004 → $5,318) | 2026-01-29 | −24.9% | −22% | 29% |
| Coffee (KC) | 3.0× | 2025-02-13 | −44.3% | −34% | 41% |
| Uranium (Sprott trust SRUUF) | 2.6× | 2024-02-02 | −48.7% | −26% | 33% |
| Uranium miners (URA / CCJ) | 3.2× / 3.7× | 2026-01-28 | −39% / −37% | −35% | 52–54% |
| Copper (HG) | 1.7× | 2026-09-09 | −7.0% | −3% | 28% |

The nickel precedent: on 8-Mar-2022 LME nickel spiked to >$100k/t intraday. The LME suspended trading and **cancelled that day's trades**, a stark example of exchange/resolution risk for squeeze longs. (The UK FCA later fined the LME **[amount unverified]**.)

**What's structural vs. folklore.** Squeezes arise from physical shortages plus short hedgers plus low exchange stocks:
- cocoa: West African crop failures, record-low ICE stocks;
- uranium: a decade of under-investment plus Sprott's physical buying;
- silver/gold 2024–26: central-bank buying and a speculative blow-off.

They are only visible *ex post*. Trying to catch them is trend-following with crash risk.

### 8.2 Contango/backwardation as a signal

The literature is solid:
- Gorton, Hayashi & Rouwenhorst (2013): backwardation and low inventories predict higher futures returns.
- Koijen, Moskowitz, Pedersen & Vrugt (2018): diversified commodity *carry* has a Sharpe ratio of roughly 0.6–0.8.
- Erb & Harvey (2006): roll yield is a major source of commodity futures returns.

Live curve (annualised roll yield, positive = backwardation):

| Contract pair | Roll yield |
|---|---|
| Crude Nov-26 → Dec-27 | **+22.6%** |
| Coffee | +11.5% |
| Cocoa Dec-26 → Jul-27 | **−7.2%** (shortage over) |
| Gold | −5.6% (normal carry) |
| Copper | −6.1% |
| Silver | −5.2% |
| Corn | −9.7% |

**Verdict.** Use term structure only as a **filter**: hold commodity longs only in backwardation, never in steep contango. Chasing squeezes is **Avoid**.

---

## 9. Credit: fallen angels, distressed debt, busted converts

**Fallen angels.** Ben Dor & Xu (2011) document price pressure around the downgrade from investment grade and subsequent outperformance of fallen angels versus original-issue high yield. Our data:

| Period | Fallen-angel ETF | CAGR | HYG | JNK | Excess vs HYG |
|---|---|---|---|---|---|
| 2012–26 | ANGL | 6.56% | 4.53% | 4.44% | ≈ **+2.0%/yr** (Sharpe 0.55 vs 0.39) |
| 2016–26 | FALN | 6.11% | 4.63% | 4.66% | ≈ +1.5%/yr (Sharpe 0.45 vs 0.31) |

The fallen-angel ETFs carried higher drawdowns (−29% vs −22%) and longer duration. This is a real, accessible tilt *within* a credit allocation, but not a return engine at today's spreads.

**Crisis-conditional buying (the high-value rule).** Monthly 1990–2025, Moody's Baa−10y spread regime vs next-12-month return of Vanguard HY (VWEHX):

| Baa−10y at entry | Months | Mean 12m HY return | Median | Share negative |
|---|---|---|---|---|
| ≤2.0% | 179 | 7.2% | 7.8% | 16% |
| 2.0–2.5% | 107 | 6.2% | 4.6% | 10% |
| 2.5–3.0% | 82 | 5.2% | 6.2% | 15% |
| 3.0–3.5% | 47 | 7.9% | 10.7% | 13% |
| 3.5–4.0% | 6 | 16.6% | 16.8% | 0% |
| >4.0% | 8 | **34.9%** | **36.9%** | **0%** |

Months above 3.5% cluster in **4 episodes**: Sep–Oct 2002, Sep-2008–Jun-2009, Feb-2016 and Mar-2020. The windows overlap, so effective n ≈ 4. SPY's forward 12m return from the same months was mostly strongly positive, except for a Sep-2008 entry (−6.6%).

**Robustness check.** The trigger date matters. Evaluated **daily**, the first breach of 3.5% gives these outcomes (next-12m VWEHX return / max drawdown):

| First breach | 12m return | Max drawdown |
|---|---|---|
| 19-Sep-2001 | +2.9% | −1.1% |
| 17-Sep-2002 | +13.2% | −4.1% |
| **17-Mar-2008** (one-day spike) | **−17.1%** | −25.8% |
| 15-Sep-2008 | +5.5% | −26.5% |
| 3-Feb-2016 | +14.5% | −2.6% |
| 18-Mar-2020 | +22.1% | −5.0% |

A month-end-persistence filter would have skipped the 2001 and Mar-2008 spikes. That filter was chosen with hindsight, and the 3.5% threshold itself is in-sample. The honest summary: large positive expected return, but a GFC-type path means a −20% to −25% drawdown after entry. Stage the entry and size for that. Today's spread is **1.39%**, bottom decile: expected credit excess return is low.

**Distressed debt and busted converts.** Institutional returns can be high, but most new high-yield, distressed and convertible bonds are **Rule 144A (QIB-only)**. Retail can see prices on FINRA TRACE, but faces $1k–$250k minimums, 1–3-point bid-ask spreads and complex restructuring law. **Avoid**; get exposure only via ETFs or CEFs when the crisis trigger fires.

---

## 10. Cross-cutting lessons

1. **Negative skew clusters.** Merger arb, SPAC arb, PM favourites, carry and credit all lose together in liquidity crises (e.g., Mar-2020: MNA −12.8%, HY −20%, funding negative). The engine needs a single **aggregate "short-volatility" budget** across these modules.
2. **Selection bias is everywhere.** Our Polymarket per-market sample roughly tripled the apparent mispricing purely through volume selection. EDGAR/Yahoo studies lose delisted names (survivorship), and ticker reuse corrupts old price histories. Every monthly recalibration must use point-in-time universes.
3. **Publication decay.** Index and spin-off effects shrank after publication. The Kalshi bias is now published (2026) and may decay. Retest monthly.
4. **Capacity vs. % return.** Several edges (odd-lot, thrift subscriptions, PM favourites, micro-cap tenders) have high % per trade but tiny dollar capacity. They help a small account and are irrelevant to a large one. The engine should scale candidate lists by account size.
5. **Rates matter.** With T-bills at ~4.1%, every "T-bill-plus" trade must clear a higher hurdle. Several (SPAC trust, carry at 5%) currently add only ~1%.
6. **Legal/venue risk is a first-class risk** (prediction markets, crypto venues, exchange trade cancellations). Prefer regulated venues even at slightly worse prices.

---

## 11. Implications for the system design

**A. Module roster (default state).** Everything below is **OFF** unless its trigger fires. That matches "few trades."

| Module | Trigger (all must hold) | Action / instrument | Size | Exit | Expected (evidence) |
|---|---|---|---|---|---|
| **Credit crisis buy** (highest priority) | FRED `BAA10Y` ≥ 3.5% at a **month-end** (or ICE HY OAS ≥ 700bp). Staging: ⅓ at trigger, ⅓ if spread ≥ 4.5% or after 1 month, ⅓ once spread is ≥ 50bp off its peak | HY / fallen-angel ETF (ANGL/FALN/HYG) | 15–30% of portfolio in total | 12–24 months, or when BAA10Y < 2.5% | +14–35% in 12m at month-end triggers; −17% from a daily Mar-2008 trigger; −20% to −25% drawdown in GFC paths (n ≈ 4–6 episodes) |
| **Stablecoin depeg buy** | USDC/USDT/PYUSD-class coin ≤ $0.97 on ≥2 venues; issuer regulated; reserves attested (T-bills/cash); primary redemptions not suspended >72h; no algorithmic/synthetic design | Buy coin on a regulated US venue | ≤5% | ≥$0.995, or 30-day time stop | +3–14% in days (n ≈ 3 cases) |
| **Crypto cash-and-carry** | CME 2–3-month annualised basis ≥ 3m T-bill + 6% | Long spot BTC ETF + short CME (micro) futures to expiry | ≤15% notional, 2× margin buffer | At expiry | Basis − costs: ≈10–20% annualised when triggered (long stretches of 2020–21 and 2024; never in 2026 YTD) |
| **Merger arb (select)** | Cash deal, strategic buyer, committed financing, no HSR second request / foreign-regulator overlap flagged, **annualised net spread ≥ 15%**, implied break probability ≥ 2× model estimate | Buy target | ≤5% per deal; ≤20% aggregate | Close or break | T-bill + 3–10% on selected deals; negative skew |
| **Odd-lot tender** (optional micro) | EDGAR SC TO-I with odd-lot priority; (min price ÷ last price − 1) ≥ 3%; no financing condition; ≥5 trading days to expiry | Buy ≤99 shares, tender at the clearing price | ≤$10k per trade | Offer settlement | +3–10% per ~5 weeks; ~$50–300 each |
| **SPAC trust parking** | Price ≤ trust NAV/share − 1%; redemption/vote ≤ 6 months; trust in T-bills | Buy common; submit redemption | Part of cash sleeve, ≤10% | Redeem (unless deal trades > trust + 5%) | ≈ T-bill + 1–3% |
| **CEF tender capture** | Fund announces self-tender ≥ 98% NAV; discount ≥ 8% | Buy fund; optionally hedge NAV beta with index ETF | ≤5% | Tender, then sell remainder | +2–6% per event |
| **PM favourites** (low priority) | Objective data-release resolution only (CPI, payrolls, FOMC, price thresholds); ≤60 days; after-fee annualised ≥ 15%; price 0.90–0.97 (avoid ≥0.98, which is negative after costs); ≥$25k depth within 1¢; venue legal in user's state | Buy the favourite side with maker (limit) orders | ≤1% per market, ≤5% aggregate | Resolution | Small positive at best (Kalshi +2.6%/contract for makers ≥50¢, SD 33%; Polymarket macro favourites 89/89 but n small; other categories negative) |
| **Post-devaluation long** | Official FX unified (parallel premium <10%); IMF program approved; ≥20% real depreciation in 12m | Country ETF or EM USD-bond ETF | ≤5% | 12–24m, or on re-emergence of a parallel premium >15% | Anecdotal; low confidence |

**B. Hard exclusions (never recommend):**
- buying longshots (<20¢) in prediction markets;
- old equity of Chapter 11 companies;
- index-inclusion front-running;
- share-class pairs;
- biotech binary bets without an explicit probability model (and then ≤0.5% as a defined-risk option spread);
- shorting pegs of un-tradable currencies;
- airdrop farming and token-unlock shorts;
- offshore perpetual venues;
- algorithmic/synthetic stablecoins;
- 144A distressed or convert bonds;
- chasing commodity squeezes in contango.

**C. Risk budget.**
- Aggregate "short-put-like" exposure (merger arb + SPAC + PM favourites + carry + non-crisis credit) is capped at **30% of portfolio**, and at **15% when VIX > 30**.
- No single special-situation position may exceed 5%, except the credit-crisis module, which is diversified ETFs.

**D. Data feeds and polling.**

| Feed | Frequency |
|---|---|
| EDGAR full-text search (SC TO-I/T, DEFM14A, 8-K Item 1.01, 10-12B, S-1 "plan of conversion", "plan of complete liquidation") | Daily |
| FRED (BAA10Y, DTB3, DFF) | Daily |
| Deribit/CME/Kraken curves | Daily |
| Stablecoin prices (Yahoo + DefiLlama + one exchange API) | Every 15 min |
| Kalshi/Polymarket markets | Hourly (for PM module only) |
| openFDA CRLs | Weekly (monitor only) |
| FX peg monitor: HKD band edge, GCC forwards if available, parallel premia from news | Weekly |

The reference scripts are in `research/code/05-special-situations/`.

**E. Monthly self-calibration (what to log and how to adjust):**
- For every signal, log the **ex-ante implied probability or expected return** and the realised outcome.
  - Merger arb: implied break probability vs. realised closes.
  - PM: price vs. outcome.
  - Odd-lot: expected vs. realised gain.
  - Basis: locked vs. realised.
- Compute Brier score / calibration by bucket, and hit rate, average win/loss and skew per module.
- Shrink a module's size by 50% if its trailing 12-month realised edge is below half of the expected edge, or if a single loss exceeds 3× the average win.
- Re-enable at full size after 6 months in line with expectations.
- Re-run the complete-event PM calibration and the Kalshi bias test quarterly, **on the module's own universe** (data-release markets). If the 90–97¢ bucket's after-fee return has a 95% CI below zero, disable the PM module. On all Polymarket categories combined, this test already fails (90–95¢ at 7 days: −2.6%, CI −5.3% to −0.3%). That is why the module is restricted.
- Use **point-in-time universes** only (no current-ticker price histories for old events; no volume filters that use post-event volume).

**F. Communicating to the user (email).** Each special-situation email must state:
- the trigger that fired;
- the base rate and its sample size (e.g., "n = 4 prior episodes");
- the maximum loss scenario (e.g., "deal break: −25%");
- the exact execution steps (broker tender or redemption instructions and deadlines, which are often 2 business days before expiry);
- the tax character (usually short-term).

---

## References

Baker, M., & Savasoglu, S. (2002). Limited arbitrage in mergers and acquisitions. *Journal of Financial Economics*, 64(1), 91–115.
Ben Dor, A., & Xu, Z. (2011). Fallen angels: Characteristics, performance, and implications for investors. *Journal of Fixed Income*, 20(4), 33–58.
BIO, Informa Pharma Intelligence & QLS (2021). *Clinical Development Success Rates and Contributing Factors 2011–2020.*
Bradley, M., Brav, A., Goldstein, I., & Jiang, W. (2010). Activist arbitrage: A study of open-ending attempts of closed-end funds. *Journal of Financial Economics*, 95(1), 1–19.
Bürgi, C., Deng, W., & Whelan, K. (2026). Makers and takers: The economics of the Kalshi prediction market. UCD WP 2025/19; GWU WP 2026-001; CEPR DP20631.
Burnside, C., Eichenbaum, M., Kleshchelski, I., & Rebelo, S. (2011). Do peso problems explain the returns to the carry trade? *Review of Financial Studies*, 24(3), 853–891.
Comment, R., & Jarrell, G. (1991). The relative signalling power of Dutch-auction and fixed-price self-tender offers and open-market share repurchases. *Journal of Finance*, 46(4), 1243–1271.
Cusatis, P., Miles, J., & Woolridge, J. R. (1993). Restructuring through spinoffs: The stock market evidence. *Journal of Financial Economics*, 33(3), 293–311.
Dawkins, M., Bhattacharya, N., & Bamber, L. (2007). Systematic share price fluctuations after bankruptcy filings and the investors who drive them. *Journal of Financial and Quantitative Analysis*, 42(2), 399–420.
Dubinsky, A., Johannes, M., Kaeck, A., & Seeger, N. (2019). Option pricing of earnings announcement risks. *Review of Financial Studies*, 32(2), 646–687.
Eberhart, A., Altman, E., & Aggarwal, R. (1999). The equity performance of firms emerging from bankruptcy. *Journal of Finance*, 54(5), 1855–1868.
Erb, C., & Harvey, C. (2006). The strategic and tactical value of commodity futures. *Financial Analysts Journal*, 62(2), 69–97.
Frankel, J., & Rose, A. (1996). Currency crashes in emerging markets: An empirical treatment. *Journal of International Economics*, 41(3–4), 351–366.
Frankel, J., & Saravelos, G. (2012). Can leading indicators assess country vulnerability? *Journal of International Economics*, 87(2), 216–231.
Gorton, G., Hayashi, F., & Rouwenhorst, K. G. (2013). The fundamentals of commodity futures returns. *Review of Finance*, 17(1), 35–105.
Greenblatt, J. (1997). *You Can Be a Stock Market Genius.* Simon & Schuster.
Greenwood, R., & Sammon, M. (2022). The disappearing index effect. NBER Working Paper 30748.
He, S., Manela, A., Ross, O., & von Wachter, V. (2022). Fundamentals of perpetual futures. arXiv:2212.06888.
Jetley, G., & Ji, X. (2010). The shrinking merger arbitrage spread: Reasons and implications. *Financial Analysts Journal*, 66(2), 54–68.
Kaminsky, G., Lizondo, S., & Reinhart, C. (1998). Leading indicators of currency crises. *IMF Staff Papers*, 45(1), 1–48.
Kim, E. H., & Schatzberg, J. (1987). Voluntary corporate liquidations. *Journal of Financial Economics*, 19(2), 311–328.
Klausner, M., Ohlrogge, M., & Ruan, E. (2022). A sober look at SPACs. *Yale Journal on Regulation*, 39(1), 228–303.
Koijen, R., Moskowitz, T., Pedersen, L., & Vrugt, E. (2018). Carry. *Journal of Financial Economics*, 127(2), 197–225.
Lamont, O., & Thaler, R. (2003). Can the market add and subtract? Mispricing in tech stock carve-outs. *Journal of Political Economy*, 111(2), 227–268.
Lee, C., Shleifer, A., & Thaler, R. (1991). Investor sentiment and the closed-end fund puzzle. *Journal of Finance*, 46(1), 75–109.
Maksimovic, V., & Unal, H. (1993). Issue size choice and "underpricing" in thrift mutual-to-stock conversions. *Journal of Finance*, 48(5), 1659–1692.
McConnell, J., & Ovtchinnikov, A. (2004). Predictability of long-term spinoff returns. *Journal of Investment Management*, 2(3), 35–44.
Messias, J., Yaish, A., & Livshits, B. (2023). Airdrops: Giving money away is harder than it seems. arXiv:2312.02752.
Mitchell, M., & Pulvino, T. (2001). Characteristics of risk and return in risk arbitrage. *Journal of Finance*, 56(6), 2135–2175.
Obstfeld, M., & Rogoff, K. (1995). The mirage of fixed exchange rates. *Journal of Economic Perspectives*, 9(4), 73–96.
Page, L., & Clemen, R. (2013). Do prediction markets produce well-calibrated probability forecasts? *Economic Journal*, 123(568), 491–513.
Pontiff, J. (1995). Closed-end fund premia and returns: Implications for financial market equilibrium. *Journal of Financial Economics*, 37(3), 341–370.
Rothschild, D., & Sethi, R. (2016). Trading strategies and market microstructure: Evidence from a prediction market. *Algorithmic Finance*, 5(1–2), 1–29.
Schmeling, M., Schrimpf, A., & Todorov, K. (2023). Crypto carry. BIS Working Paper 1087.
Snowberg, E., & Wolfers, J. (2010). Explaining the favorite–long shot bias: Is it risk-love or misperceptions? *Journal of Political Economy*, 118(4), 723–746.
Veld, C., & Veld-Merkoulova, Y. (2009). Value creation through spin-offs: A review of the empirical evidence. *International Journal of Management Reviews*, 11(4), 407–420.
Wolfers, J., & Zitzewitz, E. (2004). Prediction markets. *Journal of Economic Perspectives*, 18(2), 107–126.
Wong, C. H., Siah, K. W., & Lo, A. W. (2019). Estimation of clinical trial success rates and related parameters. *Biostatistics*, 20(2), 273–286.

**Web sources (accessed 28-Sep-2026):**
- Kalshi and Polymarket Wikipedia articles;
- CoinDesk, "Another appeals court rules against … Kalshi" (25-Sep-2026);
- Sportico / Prediction News on the 6th-Circuit split;
- Ninth Circuit opinion 25-7516 (28-Aug-2026);
- Polymarket docs (fees, resolution);
- Polymarket US fee schedule (docs.polymarket.us/fees);
- Kalshi fee help page and fee schedule PDF;
- PR Newswire (Polymarket amended order of designation);
- Wikipedia: "Bolivian boliviano", "Special-purpose acquisition company";
- NBER w30748 page.

---

## Appendix: reproducibility

All scripts are in `/home/user/testProject/research/code/05-special-situations/` (Python 3.11; pandas, numpy, requests, yfinance). Outputs go to `./output/`; raw caches go to the session scratchpad.

| Script | What it produces |
|---|---|
| `common.py` | Helpers (FRED CSV, Yahoo, performance stats, polite HTTP) |
| `etf_proxies.py` | Merger-arb, spin-off, fallen-angel and CEFS stats; credit-spread regimes and daily-trigger robustness; share-class spreads → `etf_proxies.json`, `merger_arb_annual_returns.csv`, `credit_spread_regimes_vwehx.csv`, `credit_trigger_daily_breaches.csv` |
| `merger_scan.py` | Live pending cash deals and gross spreads → `merger_scan.csv` |
| `edgar_odd_lot.py` | Odd-lot tender study → `odd_lot_tenders.csv`, `odd_lot_summary.json` |
| `edgar_counts.py` | Opportunity counts per year → `edgar_counts.csv` |
| `thrift_conversions.py` | Conversion IPO returns → `thrift_conversions.csv`, `thrift_conversions_summary.json` |
| `pm_snapshot.py` | Kalshi/Polymarket microstructure and "bond" yields → `pm_snapshot_summary.json` (+ market CSVs) |
| `pm_calibration_polymarket.py` | Per-market calibration (selection-biased by design, for comparison) |
| `pm_calibration_polymarket_events.py` | Complete-event calibration → `pm_poly_events_calibration_*` |
| `pm_crossvenue.py` | Cross-venue box costs → `pm_crossvenue.csv` |
| `crypto_structural.py` | Funding, basis, term structure, halvings, depegs → `crypto_structural.json`, `deribit_quarterly_basis.csv` |
| `fx_pegs.py` | Peg-break table and 2026 monitor → `fx_peg_breaks.csv`, `fx_peg_monitor.csv` |
| `commodities.py` | Squeeze episodes and live curves → `commodities.json` |
| `fda_crl.py` | openFDA CRL summary → `fda_crl_summary.json` |
| `biotech_events.py` | Approval vs CRL event study → `biotech_events.csv`, `biotech_events_summary.json` |
| `pm_calibration_postprocess.py` | Net-of-cost returns by price bucket, category splits → `pm_poly_events_net.json` |
