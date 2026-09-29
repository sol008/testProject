# Track 35: The gems census — documented, retail-accessible mispricings that paid far more than the market per episode

*Research date 29 Sep 2026. Market data: Yahoo Finance (yfinance), Polymarket Gamma/CLOB APIs, to 28 Sep 2026. Code and outputs in `research/code/35-gems/`. Earlier tracks already cover the famous trades (01), multibaggers (07), merger arb, odd-lots, CEF panel tests, pegs, crypto carry and Polymarket calibration (05, 16, 24). This track is the census of everything they did not catalog, with the overlaps cross-referenced rather than re-run.*

## TL;DR

1. **63 gems cataloged; 5 worth building.** Only about a dozen were ever both retail-accessible and rule-detectable, and the ones that paid "far more than the market" per episode (GBTC/ETHE discount closure +60–70% over the coin, the 2020–21 SPAC floor-plus-mania, the Hyperliquid airdrop, FTX claims at 13–20c that paid 118%+) were each one-off, mania-dependent, venue-gated or being exhausted.
2. **Our checks:** buying GBTC at the first −40% discount and holding to the ETF conversion returned +322% vs BTC +164% (+60% excess; ETHE +70%), with 60-day catalyst windows worth +8% to +30% over the coin; 14 surviving 2019–22 SPACs never closed more than 6.6% below trust before their deal and popped a median +30% on announcement, but lost a median 54% in the year after the merger; 18 CEFs fell to median discounts of −27% (2008) and −17% (2020) and returned +21% / +55% in the 60 sessions after the trough, while the pre-registered z-score rule earned +5.4% per 60 sessions (69% win rate) and −7.6% in 2008; on 3,785 Polymarket markets (Jan 2024–Aug 2026), ≥98c favourites lose 0.3–0.5% net per trade at every horizon, 50–80c favourites earn +7–12% (SE 4–5%) at 1, 7 and 90 days, and <2c longshots lose 74–80%.
3. **The design's index ban is right for additions (+7.4% in the 1990s → +0.3% in the 2010s, Greenwood & Sammon 2025) and for the Russell reconstitution, and unproven for S&P deletions** (track 24: +5.5% at 42 sessions, t 2.6, but only 46% of deletions priced). Keep the ban; shadow-log deletions with delisting-adjusted data.
4. **Ranked by expected contribution to a $100k book at ≤1 recommendation a week, after costs and decay:** crypto-trust discount + conversion catalyst +0.5–2%/yr (until the last trusts convert), CEF crash-discount buys +0.3–1%, post-devaluation country ETFs +0.5–1% (high variance), SPAC cash-plus +0.2–0.4%, prediction-market short-dated favourites 0–0.5% (data source only under decision 3). The largest risk-free items are out of scope: brokerage transfer bonuses (1–3% of the book, one-off) and bank bonuses ($3–4k a year).
5. **Verdict: the top five combined add about +2–4 points a year (range 0–8) to a book that earns roughly SPY ±5.** That is not "SPY by a large margin". The exception is a crash year (2008, 2020), when the CEF, credit and crypto-discount gems can add +10–20% in a few months; those come about twice a decade. Three of the five need holds of 3–18 months, which the 60-day cap (decisions 1, 5, 12) forbids, so they belong in the still-open "long-horizon core outside the system" or a monthly re-decided trend slot.

## 0. Method

- **What counts as a gem.** A documented episode or structure where an identifiable, retail-sized buyer earned far more than the market per unit of time, for a reason that can be written as a rule. Anecdotes count as evidence only when a filing, a paper or a price series backs them.
- **Fields recorded per gem** (in the census table): what it was; documented return per episode and per year while active; recurrence (episodes a decade); capacity; whether a rule could catch it ex ante; retail access today on Robinhood (RH) or Coinbase (CB); post-publication decay (McLean & Pontiff 2016 find anomaly returns fall 26% out of sample and 58% after publication [S1]); main failure mode; source.
- **Our data** is limited to what free data allows: four scripts (§3). Everything else is cited. Numbers from the press are marked as such; anything I could not verify is marked **[unverified]**.
- **Retail access** is judged against the owner's venues: a Robinhood IRA and taxable account (Level 3 options), and Coinbase. "Access: no" means the gem needs a venue, a status (accredited, depositor, creditor) or an order type (short, tender instruction) the design does not have.

## 1. Census

Returns are per episode unless marked "/yr". "Rule?" scores whether a mechanical rule could have entered before the payoff (5 = yes, timestamped trigger; 1 = only in hindsight). "Decay" is the direction of the edge since it was documented. Sources are in §7.

### 1a. Discount-to-value closures with a catalyst

| # | Gem | What it was | Return per episode | Recurrence | Capacity | Rule? | Access today | Decay | Main failure mode | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | GBTC discount → ETF conversion (2022–24) | OTC trust with no redemption traded at −49% to NAV (13 Dec 2022); Grayscale v. SEC (29 Aug 2023) and the ETF approval (10 Jan 2024) closed it to 0% | Our data: first −40% close (10 Nov 2022) to conversion +322% vs BTC +164% (+60% excess), max drawdown −26%; first −30% (Jan 2022): +69% vs +25%, drawdown −76%. Ruling day +12% vs BTC +5%; 60 d after the BlackRock filing +52% vs +17% | Once for BTC; the structure recurred for every Grayscale/Bitwise trust (#2–3) | $100k: fine (GBTC ADV was $100m+) | 5 (discount is public daily; the catalyst was a court date) | RH: yes (was OTC, now NYSE Arca) | Exhausted for BTC/ETH; the remaining trusts are small | Discount widened from −21% to −49% before it closed; 2.0% fee; SEC could have won the appeal | S2–S5, our data |
| 2 | ETHE discount → ETF (2022–24) | Same structure; −60.2% on 29 Dec 2022 (record); 19b-4 approval 23 May 2024; launch 23 Jul 2024 | Our data: first −40% (11 Nov 2022) to launch +359% vs ETH +171% (+70% excess), drawdown −41%; approval day +6.7% vs ETH −0.3%; launch day +7.9% vs −3.0% | Once | Fine | 5 | RH: yes | Exhausted | Path: −71% drawdown from the −30% entry; ETH fell 24% in the 60 days after launch | S3, S6, our data |
| 3 | The rest of the family: GDLC, BITW, OBTC, GLNK, GXRP, GSOL | GDLC at −59% (early 2023) and −38% (Aug 2023) → ETF 19 Sep 2025; BITW hit −67.8% (28 Dec 2022) and averaged −15.7% Dec 2020–Sep 2025; OBTC −30% (Jun 2023); GLNK converted 2 Dec 2025 (fee 2.5% → 0.35%); GXRP listed 24 Nov 2025 and trades within 0.2% of NAV | +30% to +60% over the underlying per conversion, over 6–24 months | 2024: 2; 2025: 3+; 2026: the small ones (Sui, XLM, DOGE) | $10k–$100k per name; OTC spreads 2–5% | 4 (the S-1 or 19b-4 filing is the trigger) | RH: OTC names partly; converted ETFs yes | Being exhausted; conversions now take months, not years | Sponsor may never convert; premium trap on the way in (GSOL traded at +810% in Mar 2024) | S7–S10 |
| 4 | CEF discounts in crashes | Retail-held funds gap to −20% to −40% discounts in liquidity panics and recover in days | Our data (18 funds): median trough −27% (Oct 2008, half-recovered in 4.5 sessions) and −17% (18 Mar 2020, 2 sessions); 60-session total return after the trough +21% (2008) and +55% (2020); 2022 and Apr 2025 troughs were only −5% | 2 deep episodes a decade; ~5 shallow | $10–50k per fund (spreads 10–50 bp) | 3 (the rule fires early: 2008 signals lost −7.6%) | RH: yes | Persistent (Lee, Shleifer & Thaler 1991; Pontiff 1995) | Leverage: track 24 found −69% to −76% single-fund losses in the crises | S11–S13, track 24 §2.5, our data |
| 5 | CEF wide-discount rule | First close with the discount ≥2.5 sd below its 1-year mean, 40-session cooldown | Our data: 259 trades 2004–26, +5.4% mean / +5.3% median per 60 sessions, 69% win rate; by year: 2008 −7.6% (n 33), 2009 +72% (n 3), 2016 +13.6%, 2018 +14.5%, 2022 +8.0%, 2023 +9.9%, 2025 +8.2% | 5–30 signals a year on 20 funds; 50–120 on track 24's 139 | Same | 5 | RH: yes | Track 24: +1.7–2.5% vs random entry in both halves | Raw returns carry market beta; the crisis trades are the worst | our data; track 24 |
| 6 | CEF activism tenders (Saba, Bulldog) | Activist forces a tender at 99–99.5% of NAV on a fund at a 10–15% discount (BIGZ 50%, BMEZ 40% in 2025; PCF liquidated at 99% of NAV) | +5–12% per event, prorated | Dozens of events a year; Saba $6.3bn AUM keeps producing them | Small to mid | 4 (13D/DEF 14A visible) | Tendering is a corporate-action instruction, not one of the design's three order kinds | Persistent (Bradley et al. 2010) | Proration; the Supreme Court/2d Cir. poison-pill rulings narrow the toolkit | S14–S16, track 05 §3.7 |
| 7 | PIMCO premium collapses | PCN/PTY/PHK premiums of +20–30% turned to −9% to −16% discounts in 7 sessions in Mar 2020; 60-session returns +63%/+54%/+37% | See left | Mar 2020; again in 2025–26 ("private credit paranoia"): PCN at −4% vs a +12% mean since 2010, PHK −6% vs +24% | Fine | 3 | RH: yes | Unknown; a manager premium can de-rate permanently (PHK's 2008–16 premium of 50–70% vanished after distribution cuts) | Distribution cut = permanent de-rating | S17, our data |
| 8 | CEF IPO dynamics | New CEFs list at a premium and fall to a ~10% discount within 120 days (Weiss 1989), or within ~2 years (Cherkes et al.) | −5% to −10% for IPO buyers; nothing for a long-only follower | Continuous | — | — | — | Stable | Cannot short retail | S18 |
| 9 | Term / target-term CEFs | Discount converges to 0 at the termination date | 1–3% a year of "alpha" until term | Continuous | Small | 5 | RH: yes | Stable | Slow; extension votes | S19 |
| 10 | Altaba liquidation (2019) | Former Yahoo, mostly cash after selling Alibaba, traded at a 12–13% discount to NAV during the wind-down | +12–13% over 6–18 months (tax reserve $8bn was the uncertainty) | Liquidating holdcos: 0–14 a year (track 05) | Large | 4 | RH: yes when listed | Persistent | Contingent liabilities, delays | S20 |
| 11 | Negative stubs (Palm/3Com, Mar 2000) | 3Com's non-Palm stub priced at −$63 a share; five more negative stubs 1998–2000 (UBID, Retek, PFSWeb, Xpedior, Stratos) | Needed a short of the subsidiary; long-only parent holders got the parent's −70% | 6 in 1998–2000, ~0 since | — | 3 | No (short constrained) | Dead (Lamont & Thaler 2003) | The overpriced leg cannot be shorted | S21 |
| 12 | Holdco discounts (Naspers/Prosus, SoftBank) | 30–50% discounts that persist | ~0 without a catalyst | Continuous | Large | — | RH: ADRs | Persistent | Discount widens for years | track 05 |

### 1b. Trust-floor structures (SPACs)

| # | Gem | What it was | Return per episode | Recurrence | Capacity | Rule? | Access today | Decay | Failure mode | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 13 | SPAC IPO / trust arbitrage 2010–20 | Units at $10 with cash in trust plus warrants; redeem at the vote | 15.9%/yr for 2010–19 IPO investors incl. liquidations (Gahng, Ritter & Zhang 2023); 11.6%/yr for the 2019–20 cohort's redeemers (Klausner et al.) | Continuous | Institutional at the IPO; retail after | 5 | RH: shares yes; units rarely | Crowded: >70% of shares held by arb funds by 2022 | Redemption logistics; missing the vote | S22–S24 |
| 14 | SPAC yield-to-trust 2022 | 98% of SPACs below trust; weighted yield 5.80% at 30 Sep 2022 (1.71% a year earlier) vs 3-month bills ~3.3%; 127 liquidations returned ~$45bn in 2022, 201 of 308 maturing SPACs liquidated in 2023 at $10.09–10.44 | T-bill + 2–3 pp, essentially riskless; liquidation cash arrives automatically | The spread reappears whenever deals dry up (Jan 2025: 4.56% vs bills 4.3%) | $100k: fine spread over 10 names | 5 (price < trust − 1%, deadline ≤ 6 months) | RH: yes; redemption needs a broker instruction, liquidation does not | Compressed to ~+0.5 pp in 2025–26 | Extension votes; excise tax; sponsor "overfunding" games | S25–S28, track 05 §3.10 |
| 15 | SPAC floor + announcement option (2019–21) | Our data, 14 surviving de-SPACs: never closed more than 6.6% below trust before the deal (median −1.6%); announcement-day close median +30% over trust; max within 60 sessions median +79%; 12 months after the merger median −54% | See left | Mania-dependent: 2020–21 only; 2022–26 pops ≈0 (LUNR: 96% of pre-deal sessions below $9.80, pop −1.7%) | Fine | 4 for the floor; 1 for the pop | RH: yes | Dead as a pop; alive as a floor | Holding through the merger (−54%); 4 of 22 successors delisted (NKLA, FSR, SKLZ, MTTR) | our data |
| 16 | DWAC (Oct 2021) | $9.96 → $94.20 in two days (+845%), $175 intraday, on the Trump Media deal | +845% in 2 days for anyone holding at trust | Once | Small float | 1 | RH: yes | — | Lottery; the same shares later −90% | S29 |
| 17 | SPAC warrants | Pre-deal warrants at $0.50–2; merged-company warrants +68% first year 2010–21, OTM warrants +104% (Gahng et al.); most 2021–22 warrants expired worthless | 5–20x on the winners; −100% typical | Continuous | Small | 2 | RH: some | Decayed with the de-SPAC index (−45% 2021, −75% 2022) | Worthless at liquidation (PSTH warrants got nothing) | S22, S30, track 01 T60 |

### 1c. Bankruptcy and orphaned securities

| # | Gem | What it was | Return per episode | Recurrence | Capacity | Rule? | Access today | Decay | Failure mode | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 18 | Post-reorg ("orphan") equities | New shares handed to creditors who sell | +24.6% to +138.8% 200-day excess, 131 firms 1980–93 (Eberhart, Altman & Aggarwal 1999); +85% relative first year, 117 firms 1988–2003 (JPM 2004); 2008–19 (93 firms): +19.8% first year vs Russell 2000 +11.2%, but 22% lost >80% within two years and only half outperformed | 10–30 emergences a year | Thin at first | 4 (8-K/plan effective date) | RH: listed names yes; OTC limited | Weakening, fat-tailed | Re-default; illiquidity | S31–S33, track 05 §3.5 |
| 19 | Bankruptcy claims (crypto 2022–23) | FTX claims at 8–13c (Jan 2023), 20c (Feb), 37c (Sep), 57–70c (Dec 2023); plan pays 118–142%; Celsius claims 18.5c → ~79% recovery; Voyager 41c; Mt. Gox claims bought by Fortress at $900 per BTC claim (2019) paid out in BTC at $60k+ in 2024 | 5–9x on FTX in 18 months; >10x on Mt. Gox over 5 years | One cluster per crypto cycle (2014, 2022–23) | Marketplace minimums ($ tens of thousands) | 3 | No (Xclaim/Cherokee OTC, not RH/CB) | — | Recovery estimates were wrong for months; illiquid; legal |  S34–S38 |
| 20 | Old equity of Chapter 11 companies | Retail net buyers of stock that is usually cancelled | Negative drift; Hertz 2020 (T58) was the exception, then −96% after emergence (B35) | Many | — | — | RH: yes | Negative | Absolute priority | track 05 |
| 21 | TARP and post-bankruptcy warrants | Treasury auctioned bank warrants in 2009–10; BAC "A" warrants (strike $13.30, expired Jan 2019) went from about $2–3 in 2011–12 to ~$12 in 2017–18; JPM ($42.42) and WFC ($33.59/34.01, expired Oct 2018) finished deep in the money; Citi warrants expired worthless; GM series-A warrants ($10) roughly flat 2011–16; Hertz HTZWW ~$9 (2021) → $3.37 (May 2025) | 2–6x on the winners over 5–7 years; −100% on the losers | One batch a decade (issued in crises) | Fine | 3 | RH: exchange-listed warrants partly | — | Long-dated leverage on one issuer; expiry | S39–S41 |
| 22 | NOL shells (WMIH, Pendrell, PICO) | Shells whose asset is a tax loss (WMIH: $6bn NOLs, KKR-backed) | Modest; WMIH became Mr. Cooper (2018) and the later 10x was the mortgage business, not the NOL | Rare | Small | 2 | RH: yes | — | Years of cash drag; §382 limits | S42 |
| 23 | Rights offerings with oversubscription | Chapter 11 rights at 10–25% (up to 80%) discounts to plan value (35% of large cases); Core Scientific's $55m ERO (2023) was oversubscribed and prorated | +10–30% on the subscribed shares | Few a year | Restricted to holders/creditors | 3 | Only as an existing holder; RH handles some rights | — | Proration; dilution for non-participants | S43–S44 |

### 1d. Index and listing effects

| # | Gem | What it was | Return per episode | Recurrence | Capacity | Rule? | Access today | Decay | Failure mode | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 24 | S&P 500 additions | Buy the announced addition, sell at inclusion | +7.4% (1990s) → +0.3% (2010s); deletions −? → 0.1% (Greenwood & Sammon, JF 2025) | ~20–30 a year | Large | 5 | RH: yes | Dead | Front-run by pros | S45 |
| 25 | S&P 500 deletions rebound | Buy the deleted name after the effective date | No permanent decline for deletions (Chen, Noronha & Singal 2004); deletions beat additions by >5%/yr for 5 years, 1990–2022 (Research Affiliates 2024); track 24: +5.5% at 42 sessions vs IWM (t 2.6), but only 46% of deletions still have prices | 10–20 a year | Large | 5 | RH: yes | Unknown (survivor-biased evidence) | The unpriced 54% are the later failures | S46–S47, track 24 |
| 26 | Russell reconstitution | Long small caps after the June recon | Edge vs random entry +0.3% / −1.0% / −2.6% at 42/63/84 sessions (track 24) | Yearly | — | — | — | Nothing for a long-only follower | — | track 24 |
| 27 | IPO underpricing / Robinhood IPO Access | Average first-day return 2025: +22% (median +13%), the 20 largest +36%; Circle +168%, Figma +250%; IPO Access (May 2021+) allocates randomly, flips within 30 days trigger a 60-day ban; 80–85% of FIGS/YOU allocations were still held after 30 days | +20% on the allocation; long-run IPOs underperform (Ritter) | Continuous; hot deals rationed | $100s–$1,000s per deal | 3 | RH: yes | Stable in hot markets | Adverse selection: big allocations arrive in the cold deals | S48–S51 |
| 28 | Direct listings | Spotify −10.2%, Slack +0.3%, Palantir −5.0%, Coinbase −13.8% vs the reference price on day 1 | Nothing | Few | — | — | — | — | No underpricing to capture | S52 |
| 29 | Thrift conversions | +15% day 1 for depositors (track 05, n 17); +2% for outsiders | See left | 3–16 a year | Depositor caps | 4 | Only as a depositor | Stable | Rationing | track 05 §3.9 |
| 30 | Tax-loss / January effect | Microcap losers sold in December rebound in January | Diminished since the 1990s; concentrated in illiquid names | Yearly | Tiny | 3 | RH: OTC limited | Decayed | Illiquidity | S53 |

### 1e. Crypto structures

| # | Gem | What it was | Return per episode | Recurrence | Capacity | Rule? | Access today | Decay | Failure mode | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 31 | Grayscale premium trade (2015–20) | Accredited investors subscribed at NAV (6–12-month lockup) and sold at a 20–140% premium (average 37%, May 2015–Dec 2020); retail paid the premium | +20–40% per 6-month cycle for the accredited; −premium for retail | 2015–Feb 2021 | Huge (3AC held $1bn) | 5 (for the accredited) | No (private placement) | Dead: premium → discount Mar 2021; killed 3AC | Lockup vs a vanishing premium | S54–S55 |
| 32 | Kimchi premium (2017–18) | BTC in Korea at +30–54% (Jan 2018) vs offshore; average +4.7% 2016–18 | +30–50% per round trip in theory | One cluster | — | 3 | No (won capital controls) | Dead by Feb 2018 | Cannot move won | S56 |
| 33 | Exchange-listing effect | Coinbase listings +91% in 5 days (Messari 2021, n 28, range −32% to +645%); Binance listings +87% at listing, then +0.4% after a week, −38% after 6 months; 98% eventually dump; 2025: only 3 of 27 Binance listings positive | Positive only if held before the announcement | Continuous | Small | 1 | CB: the listed token yes, but after the pop | Decayed to negative | Buying the announcement | S57–S59 |
| 34 | Airdrops | UNI: 400 tokens = $1,320 (Sep 2020), ~$12k today; ENS: 200 tokens = $17k at the high; ARB: mean 1,859 tokens = $2.3k; Hyperliquid (29 Nov 2024): $1.6bn to ~94k wallets, mean ~$45k, median $5–15k at TGE, and HYPE rose from $4 to $16 after | $1k–$45k per wallet for past users | Several a year; shrinking (88% of 62 airdropped tokens fell, most within 15 days; 84.7% of 118 2025 TGEs trade below TGE value) | Per-wallet | 2 (eligibility is retroactive) | No (self-custody DeFi; taxed as ordinary income) | Decaying, sybil-filtered | Labour; the token drops; hacks | S60–S64 |
| 35 | Points farming | Ethena S1 560% APR, EigenLayer S1 94% (2024); later seasons diluted; ZKsync/Scroll drops "paltry" | High early, falling | 2023–25 | — | 2 | No | Decayed | Dilution by later farmers | S65–S66 |
| 36 | Bitcoin forks (2017–18) | BCH 1:1 (traded $400–750 at the fork, >$4,000 in Dec 2017), BTG ($200), BCD ($20); ~44 forks | +15–25% of BTC's value "free" in 2017; BCH now <1% of BTC | One cluster | Holders only | 5 (announced) | CB credited BCH (Dec 2017) | Dead (ETHW 2022 was worth 0.5% of ETH) | Claiming risk; tax | S67–S68 |
| 37 | Fiat stablecoin depegs | USDC $0.877 → par in 2 days (Mar 2023, +14%); FDUSD $0.87 (Apr 2025); USDe $0.65 on Binance for an hour (Oct 2025); TUSD $0.926 (Jan 2024); UST/deUSD → 0 | +10–15% in days when the issuer is solvent | 0–2 a year | Large on CB (USDC) | 5 | CB: yes | Persistent | Insolvent issuer = −100% | S69, track 05 §7.3 (shadow module) |
| 38 | Basis / funding carry | Perp funding averaged 9.7%/yr 2016–26 (BitMEX), 0.1% in 2026; Deribit 3-month basis median 5.8% | T-bill + 1–2 pp now | Continuous | Large | 5 | CB + CME | Compressed | Venue failure | track 05 §7.1 (shadow) |
| 39 | Treasury-company mNAV | MSTR premium 3.76x (Apr 2025) → about 0.9x NAV (2026); Metaplanet 0.64x with a $500m buyback; 26 of 168 BTC-holding firms below NAV | Discount capture if buybacks bite; MSTR −83% Nov 2024 → Jun 2026 on the way | Cycle-dependent | Large | 4 | RH: yes | New | Leverage, dilution, no forced closure | S70–S71, track 01 B33 |
| 40 | GSOL premium trap | Grayscale Solana Trust at +810% to NAV (Mar 2024), +650–700% (Jul–Aug 2024); now an ETF near NAV | −85% for premium buyers | Repeats for every hot single-asset trust before an ETF exists | — | 5 (never buy a premium) | RH: OTC | — | Unshortable | S72 |

### 1f. Prediction markets

| # | Gem | What it was | Return per episode | Recurrence | Capacity | Rule? | Access today | Decay | Failure mode | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 41 | Favourite–longshot bias, Kalshi | 46,282 contracts 2021–Apr 2025: <10c contracts lose >60%; >50c earn a small positive return; makers at ≥50c +2.6% per contract (SD 33%); takers lose 32% on average (Bürgi, Deng & Whelan 2026) | +2.6% per contract as a maker | Continuous; Kalshi did $148bn in 2026 to date | Thin books: median Polymarket market volume in our sample $175k lifetime | 5 | Kalshi/Polymarket US, state-dependent | Published Jan 2026; expect decay | Upsets cluster; takers pay the spread | S73–S75 |
| 42 | Polymarket favourites and longshots (our data) | 3,785 resolved markets Jan 2024–Aug 2026 sampled by end date, both sides: ≥98c net −0.3% to −0.5% at 1/7/30/90 d; 90–98c ≈0 to +1.4% (7–30 d), ≈0 at 90 d; 50–80c +7%/+11%/−3%/+10% at 1/7/30/90 d (SE 4–5%); <2c −74% to −80%; macro and crypto-price favourites at 90–98c won 30 of 30 at 30 d | ~+1% per short-dated favourite in objective markets | Continuous | Same | 5 | Polymarket US (waitlist removed May 2026) | Same | Resolution risk (UMA vote flipped "Ukraine minerals" to a false YES in Mar 2025, $7m); venue/legal risk (6th and 9th Cir. vs 3rd Cir. on sports) | our data; S76–S78; track 05 §6 |
| 43 | Election mispricings | 2016: Trump at ~18% on Betfair the day before (5.5x); 2020: "Trump wins" 10–15% for weeks after the call [levels unverified]; 2024: Polymarket 61–67% for Trump vs 50/50 polls (Théo's ~$85m on ~$45m, using private "neighbour-effect" polls) | +10% (stale loser) to 5x (longshot) | About one per two-year cycle | Depth: moving Oct 2024 by 5 points cost ~$9m | 2–3 | Same | — | Wash trading; the 2016 logic lost in 2020 | S79–S82, track 01 T54/T65 |
| 44 | Cross-venue arbitrage | Box cost ≥$1.005 on flagship markets (track 05); bots extracted ~$40m Apr 2024–Apr 2025 across 7,000 markets, top 3 wallets $4.2m; spreads 2–5% close in 15–30 s | Bots only | Continuous | — | 5 (automated) | Needs both venues and code | Compressing | Resolution wording differs (Kalshi "No" vs Polymarket "Yes" on the 2024 shutdown market) | S83–S84 |

### 1g. Foreign structural discounts and market openings

| # | Gem | What it was | Return per episode | Recurrence | Capacity | Rule? | Access today | Decay | Failure mode | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 45 | Japan cross-holding unwind and parent–subsidiary buyouts | TSE's Mar 2023 "P/B below 1" request: average PBR 1.1 → 1.4 in three years; 135 tender offers ($71bn) and 142 delisting deals in 2025; premiums 42–74% (Nidec/Makino), 99.5% (Topcon), 15% (Aeon Delight); EWJV +23.6% (2023), +11.6% (2024), +34.0% (2025); Berkshire's trading houses $13.8bn → ~$38bn | +40–100% per subsidiary buyout; ~+10 pp/yr for the value index | Dozens of buyouts a year | Large | 4 (subsidiary lists are public) | RH: ETFs (EWJV, DXJ, JPXN) and a few ADRs; no TSE single names | Decaying as P/B rises | The ETF only gets the beta of the reform | S85–S89 |
| 46 | Korean preferred discount | Non-voting preferreds at an average 45% discount to common (widest in a decade); Samsung pref 26% (was 37%); Hyundai >50%; Samsung's 110tn-won return programme (Sep 2026) may buy preferreds | +20–40% if the discount halves | One regime | Large | 4 | No KRX access on RH; OTC ADRs illiquid | New catalyst | "Tunnelling risk, not voting rights" | S90–S91 |
| 47 | A–H premium | Mainland A shares at +27% over the same companies' H shares (Jun 2025, five-year low; index 128) | Only long H / short A, non-fungible | Since 2014 | — | — | No | Narrowing | No arbitrage mechanism | S92 |
| 48 | Post-devaluation / regime-change country ETFs | Argentina: YPF +43% on Milei's win (Nov 2023), ARGT the best country ETF of 2024 (+35% in USD, Merval +125% local), $20bn IMF deal 2025; Egypt: float Mar 2024 (EGP 31 → 50), EGX30 +68% local from the low by end-2025; Vietnam: FTSE upgrade announced Oct 2025, VN-Index +41% in 2025, effective 21 Sep 2026; Saudi MSCI inclusion 2019: KSA +9.3%; Greece 2012; Bolivia (Jun 2026, 40% devaluation, no ETF) | +30% to +100% over 12 months on the winners; Russia 2022: RSX halted and liquidated (a near-total loss for months) | 0.5–1 a year | Fine in ETFs | 3 (devaluation + IMF programme + unified FX are datable) | RH: ARGT, VNM, KSA, GREK, EGPT | Regime-specific | Second devaluation; sanctions (RSX) | S93–S99, track 05 §5 |
| 49 | Frontier → EM index upgrades | Vietnam (FTSE, 2025–26; est. $5–6bn inflows), Saudi (MSCI 2019), Pakistan, Kuwait | Run-up before the effective date, weak after | ~1 every 2 years | Fine | 4 (announcement dates) | RH: ETFs | — | "Buy the rumour" is mostly done by the announcement | S94, S100 |

### 1h. Historical arbitrage classics and crisis baskets

| # | Gem | What it was | Return per episode | Recurrence | Capacity | Rule? | Access today | Decay | Failure mode | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 50 | Thorp's warrant hedging | Long undervalued warrants/convertibles, short stock (Beat the Market, 1967): ~25%/yr for five years in the 1960s; Princeton Newport 19.1%/yr 1969–88 | See left | Institutionalised by the 1970s | — | 5 then | No (needs shorts) | Dead for retail | Arbitraged away | S101–S102 |
| 51 | Buffett's Rockwood cocoa tender (1954) | Exchange a $34 share for $36 of cocoa warehouse receipts (Graham's +6% arbitrage); Buffett held 222 shares instead to ~$100 (+$13,000) | +6% per share arbitrage; ~3–6x holding | Partial liquidation tenders are rare | — | 4 | Tender instruction needed | Rare | Hedging the beans | S103 |
| 52 | Buffett's "workouts" (1957–69) | Mergers, liquidations, spin-offs; "10–20%" a year, levered up to 25% | 10–20%/yr | Continuous then | — | 4 | Partly | Compressed to T-bill + 1–3% (track 05) | Deal breaks | S104 |
| 53 | Templeton's 1939 basket | $100 of each of 104 stocks under $1 (34 in bankruptcy) → ~4x in 4 years | 4x | War/crash baskets: ~2 a decade | — | 4 | RH: yes | = crisis buying (track 01 archetype 1) | Being early | track 01 T12 |
| 54 | Voluntary liquidations (Klarman) | Kim & Schatzberg 1987: substantial gains to holders of successfully liquidating firms | +10–30% | 0–14 proxies a year (track 05) | Small | 4 (plan of dissolution filing) | RH: yes | Persistent but rare | Delays, contingent liabilities | S105, track 05 |
| 55 | Spin-offs (Greenblatt) | Cusatis, Miles & Woolridge 1993: spin-offs +11 pp/yr over benchmarks for 3 years (1965–88), parents +6 pp; concentrated in takeover targets; CSD ETF 9.6%/yr vs SPY 10.9% (2006–26) | Selective only | 8–45 Form 10s a year | Fine | 4 | RH: yes | Decayed as an index | Leverage parked in the spinco | S106, track 05 §3.4, track 16 |
| 56 | Litigated-deal merger arb (Twitter 2022) | TWTR from ~$33 (Jul 2022) to $54.20 (28 Oct 2022) once Musk was forced to close; Pentwater ~+$200m; Activision 2023 spread 20%+ | +45–60% in 3 months on the extreme cases; diversified merger arb T-bill + 1–3%/yr | 1–2 broken/litigated deals a year | Fine | 2 (needs a legal judgment) | RH: yes | Stable | Deal actually breaks (−30–50%) | S107, track 16, track 24 §2.1 |
| 57 | Nifty Fifty crash buys (1974) | The 1972 peak buyers matched the S&P over 26 years (12.2% vs 12.7%, Siegel); buyers at the 1974 lows (Avon −86%, Polaroid −91%, Xerox −71%) beat it | Crisis buying of quality | ~2 a decade | — | 3 | RH: yes | = archetype 1 | Being early | S108 |
| 58 | Short-report dips (Hindenburg) | Targets fell 42% (2022) and 36% (2023) on average; 53 of 65 closed positions were profitable for the short seller | Nothing documented for dip buyers | Firm closed Jan 2025 | — | — | — | — | Fraud is often real | S109 |

### 1i. "Free money" episodes (out of scope, but larger than most gems)

| # | Gem | What it was | Value | Access | Note | Src |
|---|---|---|---|---|---|---|
| 59 | Series I bonds, May–Oct 2022 | 9.62% composite rate; $10k per person per year (+$5k via tax refund, plus entities); TreasuryDirect opened 3.7m accounts in 2022 vs 2.4m in 2011–21 and crashed on 28 Oct 2022 | ~$500–900 per person above T-bills over the year | TreasuryDirect only | Recurs when CPI spikes | S110–S112 |
| 60 | Brokerage transfer and IRA matches | Robinhood: 3% on IRA contributions and 2% on IRA transfers/401(k) rollovers with Gold (to 30 Apr 2026; 1% after), 2% on taxable ACATS with Gold and a 5-year hold, 3% with a $10k margin balance; also 1–3% ACAT bonuses elsewhere | 1–3% of the book, one-off: $1,000–3,000 on $100k, zero market risk | RH | The single largest riskless item in this census | S113–S114 |
| 61 | Bank-account bonuses | Chase up to $900; a realistic 12-month calendar yields $3,000–3,800; taxable as interest | ~3% of a $100k book a year for a few hours of work | Any | Out of scope for the emailer | S115–S116 |
| 62 | Treasury auction "tails" | Non-competitive bidders receive the stop-out yield; the retail advantage over the secondary market is 0–3 bp | Negligible | TreasuryDirect | — | S117 |
| 63 | CeFi/DeFi stablecoin yields (2021) | Anchor 20% ($14bn deposits) → UST to 0; BlockFi/Celsius 8% → bankrupt; Aave/Compound 2–8%; 2026 range 3.5–9% | The yield was the risk premium | CB: USDC rewards only | Design vetoes "yield with no visible source" | S118–S119 |

**Meme squeezes and short-squeeze baskets (negative EV, for the record).** Track 16 measured "short interest ≥20% plus a catalyst day": −6.0% net per 20 sessions, median −9%, 34% winners, 95th percentile +44%. The Roundhill MEME ETF launched in Dec 2021, fell 57% and was closed in Dec 2023. GME retained 27% of its peak gain and AMC lost 99.8% (track 01). The 2024 GME reprise round-tripped $10 → $80 intraday → $20 in three weeks. Nothing here is a rule.

## 2. What the census says as a whole

1. **The big multiples came from one of four shapes, each with a reason.** (a) A trust or fund that cannot be redeemed, priced by a captive retail crowd, plus a sponsor with a fee incentive to fix it (GBTC, ETHE, GDLC, CEF activism). (b) A cash floor with a free option on a mania (SPACs 2020–21). (c) A claim on a bankrupt estate priced at the panic low of the collateral (FTX, Mt. Gox). (d) A gift for prior behaviour (airdrops, forks, thrift conversions). Only (a) and, weakly, (b) fit a rule-based emailer using Robinhood and Coinbase.
2. **Discounts close on a date; premiums do not.** Every successful discount trade in the census had a scheduled or filed catalyst. The premium side (GBTC 2020, GSOL 2024, MSTR 2024, PIMCO 2019) is where retail lost.
3. **Decay is the rule.** The IPO pop survives because it is rationed; the index-addition effect died when it stopped being rationed; the Kalshi bias was published in 2026 and should be assumed to shrink; Grayscale's remaining trusts are small and convert quickly now.
4. **Access is the binding constraint, not detection.** Claims, airdrops, Korean preferreds, Japanese subsidiaries, warrant hedging and cross-venue arbitrage are all detectable with free data and all unreachable from the owner's accounts. The redemption and tender instructions that make SPAC and CEF gems work are also outside the design's three order kinds (`20-executability-check.md`).
5. **Holding periods do not fit the 60-day cap.** GBTC (14 months from the −40% trigger), ETHE (20 months), post-reorg drift (200 days), post-devaluation rallies (12 months) and Japan (3 years) all exceed it. The 60-day windows around scheduled catalysts (§3.1) are the part that fits.

## 3. Empirical checks (our data)

All scripts are in `research/code/35-gems/` and write to `output/` (≤ 1 MB). Yahoo prices are split-adjusted closes.

### 3.1 GBTC and ETHE: the discount and the catalyst windows (`gbtc_ethe_discount.py`)

Yahoo has no NAV for the trusts, so NAV is rebuilt from the coin price and an implied coins-per-share, calibrated from the post-conversion months (when the trust traded within 0.3% of NAV) and decayed at the sponsor fee. Yahoo folds the July-2024 Mini-Trust spin-offs into the series as a 0.9x factor, so the implied GBTC figure of 0.000897 BTC per share on 11 Jan 2024 corresponds to 0.000807 in Yahoo's units; both match Grayscale's published numbers to within 1%. The computed troughs (−49.0% on 13 Dec 2022 for GBTC, −60.2% on 29 Dec 2022 for ETHE) match the press reports of −48.9% and −59.4% [S2, S6].

| Trust | Year | Mean prem/disc | Widest | Sessions ≤ −30% / ≤ −40% |
|---|---|---|---|---|
| GBTC | 2017 | +48% | +131% (31 Aug 2017) | 0 / 0 |
| GBTC | 2020 | +18% | +42% (21 Dec 2020) | 0 / 0 |
| GBTC | 2022 | −32% | −49.0% (13 Dec 2022) | 143 / 32 |
| GBTC | 2023 | −29% | −47.7% (13 Feb 2023) | 123 / 66 |
| GBTC | 2024–26 | −0.3% | −8.4% (2 Jan 2024) | 0 / 0 |
| ETHE | 2020 | +254% | +932% (4 Jun 2020) | 0 / 0 |
| ETHE | 2022 | −30% | −60.2% (29 Dec 2022) | 106 / 33 |
| ETHE | 2023 | −40% | −59.9% (3 Jan 2023) | 179 / 137 |
| ETHE | 2025–26 | 0.0% | −6.4% | 0 / 0 |

Pre-registered rules, entered at the first close through the threshold and held to the conversion date:

| Rule | Entry | Days | Trust return | Coin return | Excess from the discount | Worst drawdown on the path |
|---|---|---|---|---|---|---|
| GBTC ≤ −20% | 13 May 2021 | 973 | +9% | −7% | +17% | −85% |
| GBTC ≤ −30% | 27 Jan 2022 | 714 | +69% | +25% | +35% | −76% |
| **GBTC ≤ −40%** | 10 Nov 2022 | 427 | **+322%** | +164% | **+60%** | −26% |
| GBTC widest (hindsight) | 13 Dec 2022 | 394 | +391% | +161% | +88% | — |
| ETHE ≤ −30% | 10 May 2022 | 805 | +101% | +49% | +35% | −71% |
| **ETHE ≤ −40%** | 11 Nov 2022 | 620 | **+359%** | +171% | **+70%** | −41% |
| ETHE widest (hindsight) | 29 Dec 2022 | 572 | +597% | +190% | +141% | — |

Windows that fit the 60-day cap (prior close to +1 and +60 calendar days):

| Event | +1 day: trust vs coin | +60 days: trust vs coin | Excess at +60 d |
|---|---|---|---|
| BlackRock files for a spot ETF (15 Jun 2023) | +14.0% vs +4.8% | +51.7% vs +17.1% | **+29.6%** |
| DC Circuit ruling (29 Aug 2023) | +12.1% vs +4.6% | +42.6% vs +30.6% | +9.2% |
| SEC approval (10 Jan 2024) | +4.3% vs +0.5% | +58.7% vs +49.6% | +6.1% |
| Last 60 days before the GBTC conversion | — | +35.8% vs +25.1% | +8.5% |
| ETHE 19b-4 approval (23 May 2024) | +6.7% vs −0.3% | −9.6% vs −7.9% | −1.8% |
| ETHE launch (23 Jul 2024) | +7.9% vs −3.0% | −18.6% vs −24.0% | +7.1% |

**Reading.** The discount was a public number for 700 sessions. A rule at −40% caught the whole closure with a tolerable path; a rule at −20% caught it with an −85% drawdown and 32 months of waiting. The catalyst-window version is real (+6% to +30% over the coin in 60 days) but each window still carried the coin's beta, which was −24% in the ETHE launch window.

### 3.2 SPAC trust floor on 2019–22 survivors (`spac_floor.py`)

22 successor tickers were tried; 4 are delisted (NKLA, FSR, SKLZ, MTTR) and 4 have Yahoo history only from the ticker change (QS, GENI, SOFI, DJT), leaving 14. Three had later reverse splits folded into the pre-merger history (SPCE and CHPT 1:20, LCID 1:10) and were rescaled to the $10 trust.

| Statistic (n = 14) | Median | Worst / best |
|---|---|---|
| Lowest close vs trust in the 180 sessions before the announcement | −1.6% | −6.6% (LGVW/BFLY, Nov 2020) |
| Share of pre-announcement sessions below $9.80 | 0% | 96% (IPAX/LUNR, 2022) |
| Announcement-day close vs trust | +30% | −1.7% (LUNR) to +474% (CCIV/LCID) |
| Highest close within 60 sessions of the announcement, vs trust | +79% | 0% (LUNR) to +459% (SHLL/HYLN) |
| Return in the 12 months after the merger closed | **−54%** | −82% (HYLN) to +206% (DKNG) |

The floor held in every case (the worst pre-deal close was 6.6% below trust). The option paid only in the 2020–21 mania; the one 2022-vintage name (LUNR) spent 96% of its pre-deal life below $9.80 and did not pop. The survivors overstate the pop and understate the de-SPAC loss, since the four delisted successors are the losers. The rule that survives is the floor: buy below trust with a dated deadline, sell at the announcement, never hold through the merger.

### 3.3 CEF discounts in four episodes and a pre-registered rule (`cef_crash_discounts.py`)

20 funds with Yahoo NAV symbols (X…X); ADX and TY have none. Episode troughs are hindsight; the rule is not.

| Episode | n | Median trough discount | Discount before the episode | Sessions to recover half | 60-session total return after the trough (median / mean) |
|---|---|---|---|---|---|
| GFC (Sep 2008–Jun 2009) | 16 | −27.1% | −7.0% | 4.5 | +21% / +35% |
| Covid (Feb–Jun 2020) | 18 | −16.9% | +0.2% | 2 | +55% / +55% |
| 2022 bear | 18 | −4.7% | +0.5% | 7 | +8% / +7% |
| Tariff shock (Mar–Jun 2025) | 18 | −4.9% | −3.4% | 1 | +18% / +18% |

Rule: first close with the discount ≥2.5 sd below its trailing 252-session mean, buy the next close, hold 60 sessions, 40-session cooldown: **259 trades, +5.4% mean, +5.3% median, 69% winners.** By year the rule lost only in 2006 (n 1), 2008 (−7.6%, n 33), 2013 (−1.3%), 2015 (−0.4%) and 2021 (n 1); it made +72% in 2009 (n 3), +13.6% in 2016, +14.5% in 2018, +8.0% in 2022, +9.9% in 2023 and +8.2% in 2025. These are raw returns; track 24's panel puts the edge over random entry at +1.7% to +2.5% per 60 sessions and the design-capped contribution at +0.2% to +0.4% a year. The current snapshot (28 Sep 2026) has all four PIMCO funds at discounts (PCN −4.0%, PTY −2.4%, PDI −7.9%, PHK −6.0%) against premiums of +12% to +24% on average since 2010; the rule has already fired 12 times in 2026 (+4.9% mean).

### 3.4 Polymarket favourites and longshots, sampled by resolution month (`polymarket_longshots.py`)

3,785 clean binary markets with ≥$5k lifetime volume, drawn as the first 120 markets the Gamma API returns for each end-date month from Jan 2024 to Aug 2026 (not by volume rank), priced from the CLOB daily history at 1, 7, 30 and 90 days before the end date, both sides included. Net = after a 0.5c half-spread and the 2026 taker fee 0.04·p(1−p).

| Bucket | n (7 d) | Win rate vs price (7 d) | Net return at 1 d | 7 d | 30 d | 90 d |
|---|---|---|---|---|---|---|
| <2c | 1,131 | 0.4% vs 0.5% | −80% | −74% | −53% | −74% |
| 2–5c | 230 | 1.7% vs 3.2% | −1% | −58% | −64% | −37% |
| 5–10c | 158 | 5.1% vs 7.0% | −12% | −38% | −38% | −23% |
| 10–20c | 112 | 13.4% vs 14.7% | −14% | −18% | −34% | −21% |
| 20–50c | 254 | 25.6% vs 34.6% | −27% | −29% | −1% | −22% |
| 50–80c | 264 | 73.1% vs 64.6% | **+7.0% (SE 4.7)** | **+11.2% (SE 4.4)** | −2.7% (SE 3.7) | **+10.0% (SE 3.7)** |
| 80–90c | 110 | 86.4% vs 85.1% | −1.0% | +0.2% | +3.5% | +0.3% |
| 90–95c | 158 | 94.9% vs 92.9% | −0.1% | +1.4% | +1.2% | −0.3% |
| 95–98c | 229 | 98.3% vs 96.8% | −1.5% | +0.9% | +1.2% | +0.3% |
| ≥98c | 1,136 | 99.6% vs 99.5% | −0.3% | −0.5% | −0.4% | −0.4% |

By category at 30 days: macro and crypto-price favourites at 90–98c won 30 of 30 (net +2.6% to +6.7%); politics favourites at 90–98c lost −0.7% to −1.4% net; sports and "other" favourites earned +0.5% to +2.8%. Longshots under 5c in macro, crypto and sports went 0 for 300.

**Reading.** This independent sample agrees with track 05 and with the Kalshi paper on the robust part: cheap contracts are overpriced (−53% to −80% net) and near-certain contracts earn nothing after costs (−0.3% to −0.5%). It differs in the middle: 50–80c favourites earned +7% to +11% at 1, 7 and 90 days, roughly 2–2.7 standard errors, but −3% at 30 days, so it is suggestive rather than established. The 90-day horizon removes whatever favourite edge exists above 80c, so any favourite rule has to be short-dated. Capacity is the limit: the median market in the sample traded $175k over its life, so positions above a few thousand dollars move the price.

## 4. Is the design's ban on index-reconstitution trades right?

The design's never-list bans "index-inclusion or reconstitution trades" (`00-SYSTEM-DESIGN-v3.md`). The evidence, by leg:

| Leg | Evidence | Verdict |
|---|---|---|
| S&P 500 additions | +7.4% abnormal return in the 1990s → +0.3% in 2010–20 (Greenwood & Sammon, JF 2025); track 24: additions drifted −0.9% to −3.3% vs SPY after the effective day | **Ban is right** |
| Russell reconstitution | Long IWM after the June recon: +0.3% / −1.0% / −2.6% vs random entry (track 24) | **Ban is right** |
| S&P 500 deletions | No permanent price decline for deletions (Chen, Noronha & Singal 2004); deletions beat additions by >5%/yr for 5 years, 1990–2022 (Research Affiliates); track 24: +5.5% vs IWM at 42 sessions (t 2.6), +3.6% at 63, but only 130 of 282 deletions could be priced and the missing ones are disproportionately later failures | **Unproven.** The direction is consistent across three sources, the survivorship problem is real, and the effect, if true, is +1–2 points a year at one 3% slot (10–20 deletions a year × ~3–5%) |

Recommendation: keep the ban on additions and Russell; convert the deletion ban into a shadow-ledger item and only promote it after a test in which every deletion is priced, including the ones that later delisted (which needs a survivorship-free source such as CRSP or a hand-built delisting file; Yahoo cannot do it).

## 5. Ranking

Expected contribution a year to a $100k book at ≤1 recommendation a week, after costs and decay, central estimate with a range. "Fits the cap" says whether the trade fits the 60-day holding cap (90 for W10/M4). Contributions assume the position sizes in the rule sketches (§6).

| Rank | Gem | Per-episode excess (haircut) | Episodes a year | Position | Contribution a year | Range | Fits the cap? | Access | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Crypto-trust discount + filed conversion catalyst (#1–3) | +20–30% over the coin per conversion; +8–30% per 60-day catalyst window | 1–3 through 2027, then ~0 | 5% | **+0.5% to +2%** | 0 to +5% | Windows yes; full closure no | RH (OTC names partly) | Medium: n = 2 large + 3 small episodes; the pool is being exhausted |
| 2 | CEF crash-discount rule (#4–5, #7) | +2% vs random entry per 60 sessions (track 24); +20–55% in the 60 sessions after a crash trough | 5–30 signals; 2 crashes a decade | 5% per name, 2 slots | **+0.3% to +1%**; +5–10% in a crash year | −2% to +10% | Yes | RH | High for the direction, low for the size; already a track-24 shadow |
| 3 | Post-devaluation / regime-change country ETF (#48–49) | +30% over 12 months (haircut from +35–100%) | 0.5–1 | 4% | **+0.5% to +1%** | −4% (an RSX-type loss) to +4% | No (12 months) unless run as a monthly re-decided trend slot | RH | Low: n ≈ 6 winners, 1 total loss |
| 4 | SPAC cash-plus (#13–15) | T-bill + 0.5–3 pp on the cash sleeve, plus a 10–20% chance of a +10% announcement pop per name-year | Continuous (250 SPACs searching) | 20% of the cash sleeve, 10 names | **+0.2% to +0.4%** | 0 to +1% | Multi-month; treat as the cash sleeve | RH; liquidation cash is automatic, redemption is not | High for the floor, low for the pop |
| 5 | Short-dated prediction-market favourites in objective markets (#41–42) | +1% net per trade (Polymarket 90–98c at 7–30 d); +2.6% as a Kalshi maker | Up to 52 | 1% per market, 5% aggregate | **0 to +0.5%** | −1% to +1% | Yes | Kalshi / Polymarket US; **data source only under decision 3** | Medium; published bias, thin books |
| 6 | Post-reorg equity basket (#18) | +10% first-year excess (haircut from +20%) with 22% wipe-outs | 10–30 emergences | 1% per name, 5–10 names | +0.5% to +1% | −2% to +3% | No (200-day drift) | RH: listed names | Low–medium; no post-2019 study |
| 7 | S&P deletions (#25) | +3–5% at 42 sessions if the survivorship-free test holds | 10–20 | 3% | 0 (banned) → +1–2% if promoted | 0 to +2% | Yes | RH | Low until tested |
| 8 | Japan value / subsidiary-buyout beta (#45) | +10 pp/yr relative in 2023–25 | Continuous | 5% trend slot | +0.5% | −1% to +1.5% | Trend slot only | RH ETFs | Low: regime beta, not a mispricing |
| 9 | Litigated-deal merger arb (#56) | +20–50% on the rare Twitter/Activision case | 1–2 | 3% | +0.3% | −1.5% to +1.5% | Sometimes | RH | Low: needs legal judgment |
| 10 | Odd-lot tenders (track 05) | $40 median, $240 mean per 99-share trade | 3–10 | 99 shares | +0.1% to +1% | 0 to +2% | Yes | Tender instruction not supported | High but tiny; blocked by executability |
| 11 | Stablecoin depeg buy (#37) | +10–15% in days | 0–2 | 5% | +0.3% | 0 to +1.5% | Yes | CB | Already a shadow module |
| 12 | IPO Access (#27) | +20% on a random $200–1,000 allocation | 5–20 deals | Allocation size | <+0.1% | 0 to +0.3% | Yes | RH | High but immaterial |
| — | Out of scope: transfer/IRA matches (#60), bank bonuses (#61), I-bonds (#59) | 1–3% one-off; ~3%/yr; ~0.5–0.9% per person | — | — | **+2% to +5% in year one** | — | — | Outside the emailer | High |
| — | Not accessible: claims (#19), airdrops (#34–35), Korean preferreds (#46), Japanese single names, warrant hedging (#50), cross-venue bots (#44) | 2x to 10x on the best cases | — | — | 0 | — | — | No | — |
| — | Negative EV: meme/squeeze baskets, longshots (<5c), buying listings, buying premiums (#40) | −6% per 20 sessions; −53% to −80% per contract; −38% at 6 months; −85% | — | — | **Avoid** | — | — | — | High |

## 6. The top five as pre-registered rules

Each rule states the trigger, the size, the exit and the promotion test the shadow ledger must pass before real money (the design's §7 gates apply on top).

**G1. Crypto-trust discount with a filed catalyst.**
- Universe: US-listed closed-end crypto trusts without a redemption programme (Grayscale, Bitwise, Osprey) whose NAV the sponsor publishes daily.
- Trigger: discount ≤ −25% for 5 consecutive closes **and** a conversion filing on file (S-1/S-3 or 19b-4) or a scheduled court/SEC decision within 120 days. Never buy a premium.
- Size: 5% of NAV; ≤2% of the trust's average daily dollar volume; OTC names need a limit order inside a 3% spread.
- Exit: discount ≥ −3% for 3 closes, or the conversion date, or the filing is withdrawn/denied, or 60 days after a scheduled decision without a decision (cap-compliant version: enter only within 60 days of a dated catalyst).
- Promotion test: 3 resolved episodes with a mean excess over the underlying ≥ +10% and no episode where the discount widened by more than 15 points after entry.
- Honest note: GBTC and ETHE are done; the live candidates are small (BITW, GXLM, GDOG, GSUI). Expect the module to retire by 2028.

**G2. CEF crash-discount buy (extend track 24's shadow).**
- Trigger: discount ≥ 2.5 sd below its 252-session mean at the close, NAV published the same evening, fund leverage ≤ 35%, price ≥ $5, ADV ≥ $1m.
- Size: 2% ÷ the fund's worst 10-session loss (about 5%); at most 2 slots; widest discount first.
- Exit: the last session within 60 calendar days, or discount back to its 252-session mean.
- Crash mode: when ≥10 funds trigger in one week (2008, 2020), stagger entries over 3 weeks; the rule's only losing year was 2008 because it bought the first leg.
- Promotion test: ≥30 shadow trades with mean excess over random entry ≥ +1.5% per 60 sessions and a positive median in both halves of the sample.

**G3. Post-devaluation country ETF (monthly re-decided trend slot).**
- Trigger, all three within 90 days: an official devaluation or float of ≥30%; an IMF programme or a unification of the official and parallel rates; a US-listed country ETF with ADV ≥ $2m and no sanctions or capital-control risk to the ETF itself (the RSX veto).
- Entry: the first month-end after the ETF closes above its 50-day average.
- Size: 4% of NAV. Exit: monthly re-decision, out on a close below the 200-day average or after 12 months; hard stop at −25%.
- Promotion test: backtest on the documented set (Greece 2012, Argentina 2023, Egypt 2024, Vietnam 2025, Saudi 2019, Nigeria 2023 [no ETF: excluded], Russia 2022 as the loss case) and ≥2 live shadow episodes with positive excess over EEM.

**G4. SPAC cash-plus on the idle-cash sleeve.**
- Trigger: pre-deal SPAC trading ≤ trust value − 1% (trust from the latest 10-Q), deadline ≤ 9 months, no announced deal, listed on NYSE/Nasdaq, ADV ≥ $300k.
- Size: 2% each, 10 names, from the cash sleeve only (this is a T-bill substitute, not a satellite).
- Exit: sell on the first close ≥ trust + 3% after a deal announcement; otherwise hold to the liquidation payment; never hold through a merger vote; sell if the SPAC is delisted to OTC on an extension.
- Promotion test: one year of shadow with a realised yield ≥ T-bill + 1 pp after spreads and no name closed below entry − 3%.

**G5. Short-dated favourites in objective prediction markets (only if decision 3 is revisited).**
- Universe: Kalshi (CFTC-regulated) markets on data releases, Fed decisions and price thresholds; resolution by a named official source.
- Trigger: price 90–97c, ≤30 days to resolution, the model's own probability ≥ price + 3 points; maker (limit) orders only.
- Size: 1% of NAV per market, 5% aggregate; never sports or politics.
- Exit: resolution.
- Promotion test: 100 resolved shadow contracts with net return ≥ +1% per contract and no 30-day window losing more than 3% of the sleeve. The design keeps prediction markets as a data source until then.

## 7. Verdict: can the top gems, combined, beat SPY by a large margin?

Numbers, for a $100k book:

| Scenario | G1 | G2 | G3 | G4 | G5 | Sum |
|---|---|---|---|---|---|---|
| Normal year, central | +1.0% | +0.5% | +0.7% | +0.3% | +0.2% | **+2.7%** |
| Normal year, low | 0 | −1% | −2% | 0 | −0.5% | −3.5% |
| Normal year, high | +3% | +2% | +3% | +0.8% | +0.7% | +9.5% |
| Crash year (2008/2020 type) | +3% | +8% | 0 | +0.5% | 0 | **+11%** |
| After 2028 (trusts converted) | 0 | +0.5% | +0.7% | +0.3% | +0.2% | +1.7% |

SPY has returned about 10% a year nominal since 1928 (track 01). The census adds roughly 3 points in a normal year and 10 in a crash year, with the crypto-trust module retiring within two years. That is a useful satellite and a real edge, but "exceeding SPY by a large margin" from gems alone is not on offer: the episodes that did pay 5x–100x for retail (DWAC, the 2021 SPAC pops, Hyperliquid, FTX claims) were one-offs, manias or venue-gated, and the census found no recurring, accessible gem with an expected excess above about +2% a year of book. The largest riskless items in the census, transfer matches and bank bonuses, are worth more than G2–G5 combined in year one and sit outside the trade system altogether.

## 8. Caveats

- **Survivorship** in the SPAC check (4 of 22 successors delisted; the pops are overstated) and in the CEF panel (today's funds). The Polymarket sample still filters on lifetime volume, a post-outcome variable, though only at $5k.
- **Hindsight thresholds.** The −40% GBTC trigger is one of three I tried; the −20% version had an −85% drawdown. Two episodes cannot calibrate a threshold.
- **NAV reconstruction** for GBTC/ETHE uses a calibrated coins-per-share path; it matches the sponsor's numbers to within 1% but is not the sponsor's series.
- **Small n everywhere.** Crypto-trust conversions n = 5, devaluation rallies n ≈ 7, crash-episode CEF returns n = 2 deep episodes, election mispricings n = 3.
- **Post-publication decay.** The Kalshi bias (2026), the deletion rebound (2024), the Japan reform trade (2023) and the SPAC yield trade (2022) are all now published; McLean & Pontiff's 58% haircut is the right prior.
- **Executability.** Tender and redemption instructions are not among the design's three order kinds; OTC trusts are not all on Robinhood; prediction markets are a data source by decision 3. Three of the five rules need holds beyond the cap.
- **Web-search budget.** Press figures marked [unverified] or "reported" were not checked against filings; the Polymarket 2020 post-election prices are from memory (track 05 flags the same).

## 9. Reproducibility

Run from `research/code/35-gems/` with Python 3.11 and `pandas numpy requests yfinance`:

| Script | What it does | Outputs (in `output/`) |
|---|---|---|
| `gbtc_ethe_discount.py` | Rebuilds the GBTC/ETHE discount series, yearly stats, the threshold rules and the 60-day catalyst windows | `gbtc_ethe_discount_daily.csv`, `gbtc_ethe_summary.csv`, `gbtc_ethe_rules.csv`, log |
| `spac_floor.py` | Pre-deal floor, announcement pop and post-merger drift for 22 SPAC successors (14 usable) | `spac_floor.csv`, log |
| `cef_crash_discounts.py` | Episode troughs and the 2.5-sd rule on 20 CEFs with Yahoo NAVs | `cef_episodes.csv`, `cef_rule_trades.csv`, `cef_snapshot.csv`, log |
| `polymarket_longshots.py` | 3,785 resolved Polymarket markets sampled by end-date month, priced at 1/7/30/90 days, bucketed both sides | `polymarket_buckets.csv`, `polymarket_markets.csv`, log |

Runtime: about 8 minutes in total; the Polymarket script makes ~3,800 CLOB calls.

## Sources

- S1 McLean & Pontiff (2016), Does academic research destroy stock return predictability? *JF* 71. https://onlinelibrary.wiley.com/doi/abs/10.1111/jofi.12365
- S2 Invezz, GBTC discount −48.89% on 13 Dec 2022. https://invezz.com/news/2023/01/10/grayscale-bitcoin-gbtc-discount-to-nav-narrows-to-38-55/
- S3 Cryptonews, ETHE discount 60%, GBTC 45%. https://cryptonews.com/news/grayscale-ethereum-trust-discount-reaches-record-60-gbtc-at-45/
- S4 CoinDesk, Grayscale's victory ignites a GBTC frenzy (29 Aug 2023). https://www.coindesk.com/markets/2023/08/29/grayscales-victory-ignites-a-gbtc-trading-frenzy-as-investors-bet-on-narrowing-discount-to-bitcoin-price
- S5 CoinDesk, GBTC discount closes to zero (11 Jan 2024). https://www.coindesk.com/markets/2024/01/11/grayscales-gbtc-discount-closes-to-zero-for-first-time-since-february-2021
- S6 The Block, ETHE nears record −60% discount. https://www.theblock.co/post/198848/ethe-record-discount-60 ; ETHE switches to a premium before launch. https://www.theblock.co/post/303696/grayscale-ethereum-trust-discount-premium-to-nav-spot-etf-launch ; The Block, ETHE discount −20.5% → −11.8% on the 19b-4 news. https://www.theblock.co/post/295938/grayscale-ethe-discount-to-nav-spot-ethereum-etf
- S7 Seeking Alpha, GDLC's 59% discount. https://seekingalpha.com/article/4580369-gdlc-59-percent-discount-to-nav-irresistible ; Grayscale GDLC fact sheet (19 Sep 2025). https://www.sec.gov/Archives/edgar/data/1729997/000119312525208959/gdlc_fact_sheet_9.19.202.htm
- S8 Bitwise 10 Crypto Index Fund 10-Q (Sep 2025): average discount 15.65%, widest 67.80% on 28 Dec 2022. https://www.sec.gov/Archives/edgar/data/1723788/000119312525274510/bitw-20250930.htm
- S9 Osprey Bitcoin Trust 10-Q (Jun 2023), ~30% discount. https://www.sec.gov/Archives/edgar/data/1767057/000093041323001940/c106733_10q-ixbrl.htm ; Bitwise–Osprey deal and termination. https://www.businesswire.com/news/home/20240827146280/en/
- S10 Grayscale Chainlink Trust ETF 10-K (FY2025), uplisting 2 Dec 2025. https://www.sec.gov/Archives/edgar/data/1852025/000119312526104216/glnk-20251231.htm ; Grayscale XRP Trust ETF launch. https://finance.yahoo.com/news/grayscale-launches-xrp-trust-etf-165340191.html
- S11 Lee, Shleifer & Thaler (1991), Investor sentiment and the closed-end fund puzzle, *JF* 46. https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1991.tb03746.x
- S12 Pontiff (1995), Closed-end fund premia and returns, *JFE*. https://www.sciencedirect.com/science/article/abs/pii/0304405X9400800G
- S13 Financial Advisor, CEF discounts hit 21.6% on 18 Mar 2020. https://www.fa-mag.com/news/hunkering-down-with-closed-end-funds-55847.html ; Calamos on the March 2020 selling. https://www.calamos.com/blogs/investment-ideas/indiscriminate-selling-has-driven-closed-end-fund-discounts-creating-compelling-value/
- S14 Saba–BlackRock BIGZ/BMEZ tender agreements (Jan 2025). https://www.businesswire.com/news/home/20250121439547/en/Saba-Capital-Reaches-Agreements-with-Two-BlackRock-Closed-End-Funds
- S15 ICI, Closed-end fund activism (2025). https://www.ici.org/files/2025/cef-activism.pdf
- S16 Bulldog Investors interview (PCF tender at 99% of NAV). https://bulldoginvestors.com/wp-content/uploads/sites/20/2018/08/interview-with-phil-goldstein-and-andrew-dakos-of-bulldog-investors.pdf
- S17 Seeking Alpha, PIMCO CEF premiums plummet. https://seekingalpha.com/article/4909340-pimco-cef-premiums-plummet-due-to-private-credit-paranoia
- S18 Weiss (1989), The post-offering price performance of closed-end funds, *Financial Management*. https://business.lehigh.edu/sites/default/files/2019-08/9%20weiss_fm_1989.pdf ; Ritter, CEF IPOs (2018). https://site.warrington.ufl.edu/ritter/files/2018/06/CEF_IPOs_June15_2018.pdf
- S19 Seeking Alpha, term CEFs. https://seekingalpha.com/article/4271250-term-cefs-good-mix-of-risk-control-and-potential-yield-boost
- S20 Altaba plan of liquidation (DEF 14A 2019). https://www.sec.gov/Archives/edgar/data/1011006/000119312519149882/d724897ddef14a.htm ; Nasdaq, Altaba rewarded shareholders. https://www.nasdaq.com/articles/altaba-rewarded-shareholders.-heres-whats-next.-2019-09-24
- S21 Lamont & Thaler (2003), Can the market add and subtract? *JPE* 111. https://www.journals.uchicago.edu/doi/10.1086/367683
- S22 Gahng, Ritter & Zhang (2023), SPACs, *RFS* 36. https://academic.oup.com/rfs/article-abstract/36/9/3463/7067751 ; working paper. https://site.warrington.ufl.edu/ritter/files/SPACs.pdf
- S23 Klausner, Ohlrogge & Ruan (2022), A sober look at SPACs, *Yale J. Reg.* https://law.stanford.edu/wp-content/uploads/2022/07/2022-01-24-A-Sober-Look-At-SPACs-Yale-Journal-on-Regulation.pdf
- S24 SPACGraveyard, redemption crisis (arb-fund share of holders). https://www.spacgraveyard.com/redemption-crisis
- S25 Robinson pre-merger SPAC ETF N-CSR: weighted yield 5.80% at 30 Sep 2022 vs 1.71% a year earlier. https://www.sec.gov/Archives/edgar/data/1742912/000183988222015254/robinson-ncsr_043022.htm
- S26 CNBC, SPAC liquidations top $12bn (Oct 2022). https://www.cnbc.com/2022/10/19/spac-liquidations-top-12-billion-this-year-as-sponsors-grapple-with-tough-market-new-buyback-tax.html ; Intelligize, the great SPAC liquidation (127 in 2022, ~$45bn). https://www.intelligize.com/the-great-spac-liquidation/
- S27 Accelerate, AlphaRank SPAC Monitor 2023 (201 of 308 liquidated). https://accelerateshares.com/research/alpharank-spac-monitor-2023-reflects-on-blank-checks/ ; Pender, SPAC yield 4.56% (Jan 2025). https://www.penderfund.com/commentaries/pender-alternative-arbitrage-fund-january-2025/
- S28 Boardroom Alpha, SPAC market review March 2022 (median $9.85). https://www.boardroomalpha.com/spac-market-review-march-2022/ ; ARC Group, trust overfunding in 2026. https://arc-group.com/trust-overfunding-deal-starved-spac-market/
- S29 CNBC, DWAC +845% in two days. https://www.cnbc.com/2021/10/22/trump-social-media-spac-digital-world-acquisition-corp-surges-another-100percent.html
- S30 Russell Investments, state of the SPAC market (De-SPAC index −45% 2021, −75% 2022). https://russellinvestments.com/us/blog/state-of-spac-market ; PSTH liquidation. https://www.spacinsider.com/news/mhaddad/pershing-square-tontine-holdings-to-liquidate-trust
- S31 Eberhart, Altman & Aggarwal (1999), *JF* 54. https://onlinelibrary.wiley.com/doi/abs/10.1111/0022-1082.00169
- S32 Verdad, Post-reorg equities (2008–19 sample). https://verdadcap.com/archive/ymo55pidxxqf34wns523ph1vkvp0e8
- S33 Seeking Alpha, Performance of US equities post-bankruptcy emergence (2025). https://seekingalpha.com/article/4823918-performance-of-us-equities-post-bankruptcy-emergence
- S34 CoinDesk, FTX claims at 20c (Feb 2023). https://www.coindesk.com/business/2023/02/20/ftx-bankruptcy-claims-sell-for-20-cents-on-the-dollar-in-private-otc-markets ; at 13c on Xclaim (Jan 2023). https://www.coindesk.com/business/2023/01/11/ftx-creditor-claims-going-for-13-cents-on-the-dollar-on-bankruptcy-marketplace-xclaim
- S35 CoinDesk, FTX claims at 37c (Sep 2023). https://www.coindesk.com/markets/2023/09/28/ftx-bankruptcy-claims-soar-in-value-in-over-the-counter-markets-as-estate-recovers-73b
- S36 The Block, FTX claims above 100c on the 118% plan. https://www.theblock.co/post/293188/ftx-creditors-could-recover-118-of-their-money-in-bankruptcy-plan ; Fortune, the biggest winners are bankruptcy traders. https://fortune.com/crypto/2024/05/08/ftx-customers-will-get-their-money-back-and-more-but-the-biggest-winners-are-bankruptcy-traders
- S37 Gate, Celsius distributions (79.2% recovery). https://www.gate.com/blog/Celsius-Network-2024-Bankruptcy-Distribution--Second-Round-Payments-and-Recovery-Rate-Update ; BeInCrypto, claims traders (Voyager 41c, BlockFi 28.5c, Celsius 18.5c). https://beincrypto.com/bankruptcy-claims-traders-have-begun-offering-creditors-of-embattled-crypto-firms-a-lifeline/
- S38 CoinDesk, Fortress buys Mt. Gox claims at $900 per BTC (2019). https://www.coindesk.com/markets/2019/07/08/investor-fortress-will-buy-mt-gox-creditor-claims-for-900-per-bitcoin ; CNBC, Mt. Gox windfall (2024). https://www.cnbc.com/2024/06/29/bitcoin-windfall-comes-for-mt-gox-creditors-after-10000percent-price-spike.html
- S39 Treasury, TARP warrant disposition report. https://home.treasury.gov/news/press-releases/tg511 ; Seeking Alpha, BAC class A warrants. https://seekingalpha.com/article/3338925-bank-of-america-class-a-warrants-double-the-return-in-a-bullish-scenario
- S40 Wells Fargo warrant expiration notice (Oct 2018). https://www.benzinga.com/node/12522859 ; GM series A warrant expiry (Jul 2016). https://gmauthority.com/blog/2016/06/general-motors-gm-publicly-traded-series-a-warrants-to-expire-on-july-10-2016/
- S41 Hertz emergence 8-K (warrants, 2021). https://www.sec.gov/Archives/edgar/data/1657853/000110465921089858/tm2121430d1_8k.htm ; HTZWW quote $3.37 (May 2025). https://www.valueresearchonline.com/stocks/302222/hertz-global-holdings-inc-warrant-htzww/
- S42 Clark Street Value, WMIH Corp NOL shell. http://clarkstreetvalue.blogspot.com/2015/07/wmih-corp-kkr-controlled-nol-shell.html
- S43 Harvard Bankruptcy Roundtable, rights offerings in Chapter 11 (35% of cases, $46bn). https://bankruptcyroundtable.law.harvard.edu/2025/05/06/do-rights-offerings-reduce-bargaining-complexity-in-chapter-11/ ; Skadden, rights offerings in Chapter 11. https://www.skadden.com/-/media/files/publications/2020/08/rights_offerings_in_chapter_11_bankruptcies.pdf
- S44 Core Scientific oversubscribed $55m ERO (2024). https://investors.corescientific.com/news-events/press-releases/detail/41/core-scientific-inc-announces-final-results-of-oversubscribed-55-million-equity-rights-offering
- S45 Greenwood & Sammon (2025), The disappearing index effect, *JF* 80. https://onlinelibrary.wiley.com/doi/abs/10.1111/jofi.13410
- S46 Chen, Noronha & Singal (2004), *JF* 59. https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.2004.00683.x
- S47 Research Affiliates, Nixed: the upside of getting dumped (2024). https://www.researchaffiliates.com/publications/press-exclusive/1043-nixed-the-upside-of-getting-dumped
- S48 Ritter, IPO data (updated 2026). https://site.warrington.ufl.edu/ritter/ipo-data/
- S49 Nasdaq, IPO market gained strength in 2025 (22% average pop). https://www.nasdaq.com/articles/ipo-market-gained-strength-2025 ; CNBC, Figma and Circle debuts. https://www.cnbc.com/2025/08/15/tech-ipos-bullish-figma-circle-roaring-after-years-of-prohibition-.html
- S50 Robinhood, About IPO Access (flipping rule). https://robinhood.com/us/en/support/articles/ipo-access/
- S51 Robinhood Q2-2021 8-K (80–85% of FIGS/YOU allocations held after 30 days). https://www.sec.gov/Archives/edgar/data/1783879/000178387921000028/robinhoodexhibit991_6302021.htm
- S52 Ritter, Direct listings 2018–2026 (table 13a). https://site.warrington.ufl.edu/ritter/files/Direct-Listings.pdf
- S53 Quantpedia, January effect in stocks. https://quantpedia.com/strategies/january-effect-in-stocks
- S54 Grayscale Bitcoin Trust 10-K (FY2020): maximum premium 142%, average 37%. https://www.sec.gov/Archives/edgar/data/1588489/000156459021011121/gbtc-10k_20201231.htm
- S55 Citation Needed, GBTC: the free money machine that went into reverse. https://www.citationneeded.news/grayscale-bitcoin-trust-the-free/ ; Protos, GBTC and the crypto meltdowns. https://protos.com/grayscale-bitcoin-trust-and-its-ties-to-crypto-meltdowns/
- S56 Choi, Lehar & Stauffer, Bitcoin microstructure and the Kimchi premium. https://www.researchgate.net/publication/326027783_Bitcoin_Microstructure_and_the_Kimchi_Premium ; CNBC on the 2018 premium. https://www.cnbc.com/2024/04/03/south-koreas-kimchi-premium-in-the-spotlight-after-btcs-record-highs.html
- S57 Nasdaq/CoinDesk, "Coinbase effect" +91% in five days (Messari, 2021). https://www.nasdaq.com/articles/coinbase-effect-means-average-91-token-price-gain-in-5-days-messari-says-2021-04-07
- S58 BitPinas, 98% of Binance-listed tokens dump. https://bitpinas.com/cryptocurrency/binance-token-listing-dump/ ; CryptoNinjas, CEX listing effects. https://www.cryptoninjas.net/exchange/study-cex-listing-effects/
- S59 Bitget News, 89% of 2025 Binance listings negative. https://www.bitget.com/news/detail/12560604680760
- S60 CoinLedger, the Uniswap airdrop ($1,320 at receipt). https://coinledger.io/blog/uniswap-airdrop-taxes ; CryptoPotato, UNI airdrop now worth $12,000. https://cryptopotato.com/uniswaps-2020-uni-airdrop-now-worth-12000/
- S61 Benzinga, ENS airdrop up to $84,000. https://benzinga.com/markets/cryptocurrency/21/12/24442518/another-ens-airdrop-may-be-coming-after-the-first-one-gifted-up-to-84-000-to-past-users ; Decrypt/Yahoo, ARB airdrop values. https://finance.yahoo.com/news/arbitrum-airdrop-just-around-corner-104643369.html
- S62 CoinGecko, Hyperliquid airdrop (94k wallets, ~$45k average). https://www.coingecko.com/learn/what-is-hyperliquid-and-what-the-hyperliquid-airdrop-means-for-defi ; DL News. https://www.dlnews.com/articles/defi/hyperliquid-airdrop-farming-among-factors-driving-hype-token/
- S63 DL News on the Keyrock airdrop study (88% fell). https://www.dlnews.com/articles/snapshot/keyrock-study-says-most-token-airdrops-crash-after-launch/ ; HackerNoon, 88% of airdrops fail. https://hackernoon.com/88percent-of-airdrops-fail-and-nobody-in-web3-wants-to-admit-it
- S64 CoinGecko, 50 biggest airdrops ($26.6bn). https://www.coingecko.com/research/publications/biggest-crypto-airdrops
- S65 One Click Team, key takeaways from 2024 airdrops (Ethena 560% APR, EigenLayer 94%). https://medium.com/airdrop-mastery/key-takeaways-from-2024-airdrops-eb4d91cc3853
- S66 DL News, why airdrop farmers will find it harder in 2025. https://www.dlnews.com/articles/defi/why-airdrop-farmers-will-find-it-harder-to-make-a-killing/
- S67 AirdropAlert, Bitcoin fork history. https://airdropalert.com/blogs/bitcoin-fork-history/ ; Cointelegraph, 2017 Bitcoin forks. https://cointelegraph.com/news/forks-in-the-road-2017-bitcoin-forks
- S68 Bitstamp, exploring Bitcoin's forks (BitMEX count of 44). https://www.bitstamp.net/en-gb/learn/crypto-101/exploring-bitcoin-forks/
- S69 Spark, stablecoin depegging history. https://www.spark.money/tools/stablecoin-depegging-history ; Cybrid, the 2023 USDC depeg. https://blog.cybrid.xyz/2023-usdc-depeg-explained
- S70 Bitcoin Magazine, Bitcoin treasury companies are undervalued (MSTR ~0.9x). https://bitcoinmagazine.com/markets/bitcoin-treasury-companies-are-undervalued
- S71 Yahoo Finance, Metaplanet $500m buyback to fix the premium gap. https://finance.yahoo.com/news/metaplanet-launches-500m-share-buyback-131842827.html
- S72 Seeking Alpha, GSOL's 800% premium. https://seekingalpha.com/article/4677121-grayscale-solana-trusts-800-percent-premium-is-a-massive-sell ; Unchained, GSOL premium after ETF filings. https://unchainedcrypto.com/grayscales-solana-trust-continues-to-trade-at-a-high-premium-after-2-spot-sol-etf-filings/
- S73 Bürgi, Deng & Whelan (2026), Makers and takers: the economics of the Kalshi prediction market, CEPR DP 20631. https://cepr.org/publications/dp20631 ; PDF. https://www.karlwhelan.com/Papers/Kalshi.pdf
- S74 CEPR VoxEU column. https://cepr.org/voxeu/columns/economics-kalshi-prediction-market
- S75 Blockonomi, Kalshi's 2026 volume tops $148bn. https://blockonomi.com/kalshis-2026-trading-volume-tops-148b-making-up-85-of-all-time-activity/
- S76 Orochi, the Polymarket $7m oracle manipulation (Mar 2025). https://orochi.network/blog/oracle-manipulation-in-polymarket-2025
- S77 DLA Piper, legal status of prediction markets (Sep 2026). https://www.dlapiper.com/en-us/insights/publications/2026/09/legal-status-at-odds-tracking-developments-in-prediction-markets-and-sports-betting ; CBS Sports state-by-state. https://www.cbssports.com/prediction/news/prediction-market-legal-states/
- S78 Yang & Tsang (2026), The anatomy of a blockchain prediction market: Polymarket in the 2024 election. https://arxiv.org/abs/2603.03136
- S79 Newsweek, Trump's 2016 Betfair odds. https://www.newsweek.com/trumps-chances-winning-election-almost-double-what-his-odds-were-before-2016-upset-1543980
- S80 Bloomberg, Trump whale's haul boosted to $85m. https://www.bloomberg.com/news/articles/2024-11-07/trump-whale-s-polymarket-haul-boosted-to-85-million-in-new-analysis
- S81 Entrepreneur, how Théo made $85m (the neighbour-effect poll). https://www.entrepreneur.com/business-news/how-trump-whale-theo-made-48-million-neighbor-effect/482539
- S82 Fortune, wash trading on Polymarket (Oct 2024). https://fortune.com/crypto/2024/10/30/polymarket-trump-election-crypto-wash-trading-researchers/
- S83 Suarez-Tangil et al. (2025), Unravelling the probabilistic forest: arbitrage in prediction markets. https://arxiv.org/abs/2508.03474
- S84 OddsShopper, Kalshi vs Polymarket settlement rules. https://www.oddsshopper.com/articles/prediction-markets/kalshi-vs-polymarket-settlement-rules
- S85 Harvard corpgov, TSE initiative on cost of capital (PBR 1.1 → 1.4). https://corpgov.law.harvard.edu/2025/10/21/tokyo-stock-exchange-initiative-on-cost-of-capital-and-stock-price-conscious-management/
- S86 Lexology, recent trends in Japanese M&A (135 tender offers, $71bn, 2025). https://www.lexology.com/library/detail.aspx?g=a0090dfc-6ae0-4691-83f6-e2f4f5d94203
- S87 QUICK, accelerating dissolution of parent–subsidiary listings. https://corporate.quick.co.jp/en/japanmarketsview/equity/accelerating-dissolution-of-parent-subsidiary-listings/
- S88 iShares EWJV performance (2023–25 returns). https://finance.yahoo.com/quote/EWJV/performance/
- S89 CNBC, Berkshire's trading-house stakes (Mar 2025). https://www.cnbc.com/2025/03/17/buffett-hikes-stakes-in-five-japanese-trading-houses-to-almost-10percent-each.html
- S90 Bloomberg/Yahoo, Samsung buyback highlights Korea's 45% preferred discount (Sep 2026). https://finance.yahoo.com/markets/stocks/articles/samsung-buyback-highlights-korea-45-001936501.html
- S91 Smartkarma, Samsung Electronics preferred. https://www.smartkarma.com/insights/samsung-electronics-preferred-time-to-catch-up-to-common-shares
- S92 Bloomberg, A-share premium at a five-year low (Jun 2025). https://www.bloomberg.com/news/articles/2025-06-12/chinese-stocks-premium-over-hong-kong-peers-drops-to-5-year-low ; HSI AH premium factsheet. https://www.hsi.com.hk/static/uploads/contents/en/dl_centre/factsheets/ahpremiume.pdf
- S93 Seeking Alpha, YPF +43% on Milei's win. https://seekingalpha.com/news/4038646-ypf-surges-43-as-milei-election-victory-lifts-argentine-adrs ; BNN Bloomberg, ARGT record inflows (Nov 2024). https://www.bnnbloomberg.ca/investing/2024/11/25/argentina-etf-sees-record-inflows-as-traders-buy-mileis-efforts/
- S94 Bloomberg, FTSE to upgrade Vietnam (Oct 2025). https://www.bloomberg.com/news/articles/2025-10-07/ftse-to-upgrade-vietnam-to-emerging-market-status-from-frontier ; CNBC, FTSE confirms (Apr 2026). https://www.cnbc.com/2026/04/08/ftse-russell-confirms-vietnams-emerging-market-status.html
- S95 The Platinum Capital, Egypt exchange recovery after the 2024 devaluation. https://www.theplatinumcapital.com/article/egypt-exchange-recovery-devaluation-reform-and-returns
- S96 Yahoo Finance, KSA performance history. https://finance.yahoo.com/quote/KSA/performance/
- S97 VanEck, RSX/RSXJ liquidation FAQ. https://www.vaneck.com/us/en/blogs/emerging-markets-equity/rsx-rsxj-liquidation-faq/
- S98 France24, Bolivia removes its 15-year dollar peg (Jun 2026). https://www.france24.com/en/live-news/20260629-bolivia-removes-15-year-dollar-peg-in-bid-to-revive-economy
- S99 Buenos Aires Herald, exchange-rate gap at 4%. https://buenosairesherald.com/economics/exchange-rate-gap-drops-to-4-a-record-low
- S100 INSEAD Knowledge, from frontier to emerging: what's an upgrade worth? https://knowledge.insead.edu/economics-finance/frontier-emerging-whats-upgrade-worth
- S101 Thorp & Kassouf (1967), Beat the Market (PDF). https://www.economics.uci.edu/files/kassouf/pdfs/beatthemarket.pdf
- S102 Princeton Newport Partners. https://en.wikipedia.org/wiki/Princeton_Newport_Partners
- S103 The Fat Pitch, Rockwood cocoa arbitrage. https://findvalue23.substack.com/p/history-rockwood-cocoa-arbitrage ; GuruFocus, Buffett's six-bagger cocoa investment. https://www.gurufocus.com/news/1017023/a-look-back-at-warren-buffetts-sixbagger-cocoa-bean-investment
- S104 Buffett Partnership letters (1957–63) blueprint. https://www.compoundwithrene.com/p/blueprint-warren-buffetts-partnership
- S105 Kim & Schatzberg (1987), Voluntary corporate liquidations, *JFE*. https://www.sciencedirect.com/science/article/abs/pii/0304405X87900079
- S106 Cusatis, Miles & Woolridge (1993), Restructuring through spinoffs, *JFE* 33. https://www.sciencedirect.com/science/article/abs/pii/0304405X9390009Z
- S107 Bloomberg, merger-arb traders are the big winners in Musk's Twitter deal. https://www.bloomberg.com/news/articles/2022-10-04/merger-arbitrage-traders-are-big-winners-in-musk-s-twitter-deal ; CNBC, Pentwater's ~$200m. https://www.cnbc.com/2022/10/05/twitter-arbitrage-bet-could-pay-off-big-for-pentwater-capital.html
- S108 AAII, Valuing growth stocks: revisiting the Nifty Fifty (Siegel). https://www.aaii.com/journal/article/valuing-growth-stocks-revisiting-the-nifty-fifty
- S109 CNBC, Hindenburg's record (2024). https://www.cnbc.com/2024/03/19/hindenburg-research-is-making-a-name-for-itself-by-taking-on-carl-ichan-gautam-adani-and-others.html
- S110 TreasuryDirect, May 2022 rate release (9.62%). https://www.treasurydirect.gov/news/2022/release-05-02-rates/
- S111 CNBC, TreasuryDirect crashes ahead of the I-bond deadline (Oct 2022). https://www.cnbc.com/2022/10/28/treasurydirect-crashes-as-investors-try-to-beat-key-i-bond-deadline.html
- S112 Marketplace, TreasuryDirect after the 2022 surge (3.7m accounts). https://www.marketplace.org/story/2023/11/03/after-surge-in-i-bond-buying-crashed-the-site-last-year-treasurydirect-has-made-some-upgrades
- S113 Robinhood, Gold IRA transfer match terms (2025–26). https://robinhood.com/us/en/support/articles/ira-gold-match-2026 ; https://robinhood.com/us/en/support/articles/ira-gold-match-2025
- S114 My Money Blog, Robinhood 2026 transfer promos (up to 3% ACAT). https://www.mymoneyblog.com/robinhood-hood-month-2025-transfer-promos.html
- S115 BonusWave, how much can you earn churning bank bonuses (2025 numbers). https://www.bonuswave.app/blog/how-much-can-you-earn-churning-bank-bonuses
- S116 CNBC Select, Chase bonuses. https://www.cnbc.com/select/chase-bank-new-account-bonuses/
- S117 TreasuryDirect, how auctions work. https://treasurydirect.gov/auctions/how-auctions-work/
- S118 FXStreet, Anchor proposes cutting UST yield to 4% (May 2022). https://www.fxstreet.com/amp/cryptocurrencies/news/terra-based-defi-protocol-anchor-proposes-cutting-ust-yield-rates-to-4-202205121257
- S119 DeFi Rate, live stablecoin lending rates (2026). https://defirate.com/lend/
- S120 Roundhill MEME ETF closure (fell 57%, closed Dec 2023). https://www.etf.com/sections/news/roundhill-revives-meme-stock-etf-speculative-fever-returns
- S121 Seeking Alpha, the (not so) lucrative details of odd-lot tenders. https://seekingalpha.com/article/2285113-m-and-a-special-situations-the-not-so-lucrative-details-of-odd-lot-tenders
- S122 BIS Quarterly Review (Sep 2025), the swift recovery after the April 2025 tariff shock (retail bought the rally). https://www.bis.org/publ/qtrpdf/r_qt2509w.htm
- S123 Robinhood index options (SPX, XSP, VIX, RUT). https://robinhood.com/us/en/support/articles/index-options ; Robinhood 24-hour market. https://robinhood.com/us/en/support/articles/24hour-market
