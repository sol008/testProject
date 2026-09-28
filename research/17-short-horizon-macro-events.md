# 17 — Short-horizon macro and geopolitical event trades, and the next 60 days (28 Sep – 27 Nov 2026)

*Research date: Monday 2026-09-28, after the US close. Prices are Yahoo Finance closes via yfinance (adjusted, so ETF returns include distributions); FRED series carry their own latest dates (yields to 9/25, spot oil to 9/22). Prediction-market odds (Kalshi public API, Polymarket gamma API) and option chains (yfinance, quotes stamped 16:14 ET) were snapshotted around 22:15 UTC on 2026-09-28. Code: `research/code/17-short-macro/` (see §8).*

*Labels: **[F]** = fact from data or a cited source; **[I]** = my inference; **[S]** = subjective probability. "p" is a two-sided placebo p-value (5,000 era-matched random-date draws, §0). Nothing here is individualized advice; every structure below can lose its full premium.*

---

## TL;DR

1. **Scheduled releases (FOMC, CPI, payrolls) move markets on the day and then stop.** [F]
   - Sorting 844 releases (1994–2026) by the day-0 move in the 2-year yield and testing SPY, TLT, gold, UUP, USO, BTC, 2y and 10y at 1/5/20/60 days gives **288 tests: 15 have p < 0.05 (14.4 expected by chance) and none survives a Benjamini–Hochberg 10% false-discovery cut.**
   - The pre-FOMC drift died after publication: +0.33% per FOMC day in 1994–2011 (p = 0.004), +0.10% in 2012–2026 (p = 0.68).
   - The system cannot beat Kalshi on the prints, so there is **no pre-event and no post-event trade** in these releases.
2. **"Buy the invasion" is buying on an ordinary day.** [F] Across 32 conflict onsets and escalations since 1939, the S&P's 20-day return after the day-0 close was +0.8% (placebo +0.65%, p = 0.85). Its 60-day return was +2.2% (placebo +1.9%, p = 0.79), with a fat left tail (May 1940 −24% in 20 days; Kuwait 1990 −13% in 60).
3. **What does repeat after onsets is in commodities, and it splits by barrels.** [F]
   - **Oil kept rising for weeks only when supply was physically lost with no quick fix** (1990, 2011, 2022, 2026): WTI +16.7% over the next 20 days on average (n = 5).
   - **After "fear" spikes it round-tripped** (Abqaiq, Soleimani, 2023–2025 Israel–Iran rounds): −10.3% over 20 days (n = 6).
   - **Gold's day-0 war spike reversed the next day in 8 of 8 war onsets** (−1.2% mean; n = 8, so incubator only).
4. **"Sell the ceasefire" in oil fails for anyone acting after the headline.** [F]
   - WTI falls −6.8% on the de-escalation day itself (n = 11); from that close the 20-day drift is −0.4% (median +1.8%, p = 0.66).
   - Across the 8 oil-relevant de-escalations, a short opened at that close suffered a median +8.6% adverse move within 20 days (2026's April ceasefire: +15%).
   - **Equities kept going**: the S&P was up 76% of the time 20 days later (mean +2.1%, n = 17) and airlines +3–7% (n = 5–8). Peace should be expressed through laggard equities, not oil shorts.
5. **Oil-premium unwinds are fast and front-loaded.** [F] Measured from the ex-post peak close (six episodes, 1990–2022):
   - WTI was 11–25% lower 20 trading days later in every episode (mean −16%), and 6–34% lower after 60 (mean −18%).
   - The fastest breaks lost 10% in 2–3 sessions.

   From real-time de-escalation dates the outcome is bimodal. When de-escalation held, oil drifted another −7% to −13% over 60 days (−53% in 2020, when COVID followed). When it failed (Oct 2024, and twice in 2026), oil rebounded +10% to +27%.
6. **Crash days are the one robust short-horizon buy, but only in an uptrend.** [F] Take the first S&P close of −3% or worse while the index is above its 200-day average. After 1990 this was followed by **+6.9% in 60 trading days** (median +8.8%, 76% up, n = 21, placebo p = 0.005; worst interim drawdown −31%, Feb 2020). Below the 200-day average the figure is 0.0%. After crash days TLT gives back its rally within a week (−1.5% over 5 days, 2 of 11 up).
7. **The midterm "edge" is a rebound-from-the-low effect and is off in 2026.** [F]
   - In midterm years with the S&P more than 5% below its 52-week high in late September, the S&P rose +6.6% from Sep 28 to Nov 27 (93% up, n = 14).
   - Within 5% of the high, as now (−1.5%), it rose +1.6% (67% up, n = 9), no better than other years near highs (+1.9%).
   - **Shutdowns** leave no lasting mark (n = 23; 60-day p = 0.88).
8. **Market-implied baselines, 9/28 close.** [F]
   - **SPY expected absolute move by event:**

     | Event | Expected move |
     |---|---|
     | Oct 2 payrolls | 0.65% |
     | Oct 14 CPI | 0.88% |
     | FOMC week (includes mega-cap earnings) | 1.25% |
     | Election day | ~0.96% |

   - **Nvidia earnings: ±5.9%**, against a 4.0% average over its last 8 reports.
   - **USO to Dec 18:** the straddle prices an expected absolute move of ~19% (1 s.d. ≈ 23%). The risk-neutral probability that USO falls ≥15% is 28.5%, against 15–17% historically, so both oil wings are expensive.
   - **Prediction markets:**

     | Event | Odds |
     |---|---|
     | Fed hike Oct 28 | 69–70% |
     | US–Iran ceasefire holds to Oct 31 | 55.5% |
     | US ends blockade by Oct 31 / by Dec 31 | 31.5% / 57.6% |
     | Hormuz traffic normal by Nov 30 | 11.5% |
     | Saudi East–West pipeline restarts by Oct 31 | 78.5% |
     | Democrats win the House | 91.5% |
     | Shutdown by Dec 12 | 22–28% |

9. **For the next 60 days: no pre-positioned event trade clears the bar.** [I] Three conditional setups are armed:
   - (a) **De-escalation confirmed:** SPY or airline call spreads the next morning (not oil puts).
   - (b) **First −3% S&P day while above the 200-day average:** 60-day SPY long.
   - (c) **Escalation that removes barrels:** USO call spread (it also hedges the book's "peace" factor).

   Everything else is watch-only or paper.
10. **A data trap arrives in two days.** [F] The Brent November contract ($105.98) expires Sep 30. Front-month Brent will then print the December contract ($98.60), a mechanical −7% that is not a de-escalation. The WTI November expiry on ~Oct 20 does the same (−3.8%). Triggers must use explicit contract months.

---

## 0. Question, data and method

### 0.1 What "tradable" means here

- **Day 0** is the first session in which US markets could react (for weekend or after-hours news, the next session). "Pre" is the last close before the news. Dates, tags and intraday timing are in `event_lists17.py`.
- **Forward returns run from the day-0 close** (the earliest realistic entry for an email sent after the close and executed manually), at h = 1, 5, 20 and 60 trading days. The day-0 reaction is shown separately; it is *not* capturable by this system.
- **The baseline is the same-length forward return on random days.** It is reported two ways:
  - (a) unconditional, all days within ±3 years of the events;
  - (b) an era-matched permutation: each event date is replaced by a random trading day within ±3 years, and 5,000 draws give the null distribution and a two-sided p.

  "Excess" is the event mean minus the placebo mean.
- **Overlapping events** (within 30 calendar days) are declustered to the first for aggregates. Per-event tables show all events.
- **Surprise proxy for scheduled releases.** No consensus data are used. The proxy is the day-0 change in the 2-year Treasury yield (FRED `DGS2`), in basis points:
  - *hawkish/hot* is the top ~15% of that release type's day-0 moves;
  - *dovish/cool* is the bottom ~15%.

  This follows the market-reaction logic of Kuttner (2001) and Bernanke & Kuttner (2005).
- **Multiple testing** uses the Benjamini & Hochberg (1995) false-discovery rate at 10%.
- **Instruments.** Adjusted closes for ETFs; ^GSPC (price only, 1928+) for long histories; FRED WTI/Brent spot (1986/1987+) for oil; 10-year and 2-year yields in bp. Gold is GLD spliced to GC=F (2000+). BTC is aligned to NYSE days.

### 0.2 Today's facts, re-checked for this track

| Item | Value (source, date) | Note |
|---|---|---|
| S&P 500 | 7,683.69; −1.48% from 7,798.99 ATH (2026-08-13); +6.6% above its 200-day MA (yfinance 9/28) | [F]; the last ≥3% down day was 2025-04-10 |
| Fed funds target | 3.75–4.00% (FRED `DFEDTARU` = 4.00, 9/28) | [F]; FOMC Sep 15–16 per federalreserve.gov calendar |
| 10-year Treasury | 5.24% (^TNX 9/28) | [F] |
| VIX / OVX / MOVE | 16.1 / 56.1 / 101.8 (9/28) | [F]; SPY 20-day realized vol 11.1% |
| **Brent "~$106"** | **November futures (BZX26) $105.98, expiring Sep 30. December (BZZ26) $98.60. Dated Brent spot (EIA via FRED) $114.89 on 9/22, after $130.80 on 9/15.** | [F] "$106" is correct only for the expiring contract. yfinance BZ=F already shows $98.69 |
| WTI | November $93.29, December $89.73 (−3.8%); spot $96.41 (9/22) | [F] November WTI expires ~Oct 20 |
| Hormuz ~15% of normal; war since 28 Feb 2026 | Per track 08 (press/Wikipedia chronology) | [verify]. Consistent with market prices: Polymarket "Hormuz normal by Nov 30" 11.5% |
| Scheduled dates | Jobs Oct 2, Nov 6, Dec 4; CPI Oct 14, Nov 10, Dec 10 (BLS schedule pages); GDP advance + Sept PCE Oct 29 (BEA); FOMC Oct 27–28, Dec 8–9 (Fed); midterms Nov 3; Nvidia ~Nov 17 after close (Yahoo estimate, **unconfirmed**) | [F] except Nvidia |

### 0.3 Caveats that apply everywhere

- **Tiny samples.** Geopolitical sets have n = 5–34, and many results rest on 5–10 events. Every such number is reported with dispersion and a placebo p, but a p of 0.05 on n = 8 is weak evidence, and any rule built on it must be shrunk hard (§7).
- **Event selection.** Choosing which ceasefires "count" is judgment. The lists were fixed before looking at returns and include failures (1973 ceasefire, the 2022 Istanbul talks, both 2026 de-escalations). The 2026 dates come from track 08's sourcing and are tagged approximate: the June 2026 de-escalation was priced progressively from ~Jun 11, before the Jun 17 anchor used here.
- **Spot oil is not investable.** USO/BNO roll futures. In today's steep backwardation (WTI Nov–Dec −$3.56, Brent −$7.38) they earn positive roll if spot holds, which cuts against oil shorts (§4.5).
- **Confounds.** The 2020-01-08 de-escalation's 60-day window runs into COVID. 60-day numbers that include it are flagged, and medians are shown.

---

## 1. The bar: random-day baselines

Forward returns in %, yields in bp. All days 2007-03 to 2026-09 (SPX from 1928).

| Asset | 1d mean / s.d. / up% | 5d | 20d | 60d |
|---|---|---|---|---|
| SPY | +0.05 / 1.23 / 55 | +0.24 / 2.47 / 60 | +0.95 / 4.64 / 67 | +2.81 / 7.65 / 73 |
| TLT | +0.01 / 0.95 / 52 | +0.07 / 1.98 / 52 | +0.28 / 3.92 / 51 | +0.89 / 6.93 / 55 |
| Gold (GLD) | +0.04 / 1.15 / 53 | +0.22 / 2.51 / 55 | +0.86 / 4.83 / 56 | +2.54 / 8.18 / 60 |
| UUP | +0.01 / 0.51 / 49 | +0.04 / 1.09 / 51 | +0.15 / 2.11 / 52 | +0.47 / 3.68 / 57 |
| USO | +0.01 / 2.37 / 51 | +0.04 / 5.31 / 53 | +0.23 / 10.81 / 53 | +0.99 / 20.22 / 55 |
| BTC (2014+) | +0.26 / 4.14 / 52 | +1.33 / 9.57 / 54 | +5.76 / 22.29 / 57 | +19.82 / 51.92 / 58 |
| S&P 500 (1928+) | +0.03 / 1.19 / 52 | +0.16 / 2.60 / 56 | +0.63 / 5.28 / 60 | +1.92 / 9.38 / 64 |

**Why this bar matters** [I]: an event "pattern" that makes +1% in 20 days on SPY is merely the equity premium. A single event's 20-day outcome has a standard deviation of 4–5% (SPY) to 11% (USO), so means from n = 10 carry standard errors of 1.5–3.5 points.

---

## 2. Scheduled macro events

### 2.1 FOMC decisions (261 scheduled meetings, 1994–2026)

**Buckets.** On decision days the 2-year yield moved by a standard deviation of 6.9bp. The hawkish bucket is Δ2y ≥ +5bp (n = 40); the dovish bucket is Δ2y ≤ −7bp (n = 40).

**Day 0 and what came after** [F]:

| Bucket | Day-0: 2y / SPY / TLT / gold / UUP | SPY after (f5 / f20 / f60), p | TLT after (f5 / f20), p | Gold f1 |
|---|---|---|---|---|
| Hawkish | +9.3bp / −0.02% / −0.39% / −0.66% / +0.55% | +0.12 / +0.91 / +2.38; p 0.79 / 0.95 / 0.90 | −0.03 / −0.30; p 0.79 / 0.37 | −0.01 |
| Dovish | −12.0bp / **+0.72%** / **+0.94%** / **+0.81%** / **−0.88%** | +0.29 / +0.79 / +2.78; p 0.79 / 0.99 / 0.74 | +0.50 / +1.05; p 0.18 / 0.19 | +0.57 (p 0.01) |
| Random-day baseline | — | +0.23 / +0.92 / +2.75 | +0.08 / +0.33 | +0.05 |

**Pre-FOMC drift decayed after publication.** Lucca & Moench (2015) documented it on 1994–2011 data [F]:

| Period | FOMC-day SPY mean | Other days | Welch p |
|---|---|---|---|
| 1994–2011 (n = 144) | **+0.33%** (60% up) | +0.03% | **0.004** |
| 2012–2026 (n = 117) | +0.10% (50% up) | +0.06% | 0.68 |
| 2020–2026 (n = 53) | +0.11% (47% up) | +0.06% | 0.82 |

**Cycle-stage analogs.** Tiny n; descriptive only. S&P %, 2y and 10y in bp [F]:

| Class | Dates | S&P f20 | S&P f60 | Comment |
|---|---|---|---|---|
| First hike of a cycle | 1994-02-04, 1999-06-30, 2004-06-30, 2015-12-16, 2022-03-16 (and 2026-09-16) | −0.6, −2.3, −3.5, −9.3, +2.0 | **−3.9, −6.9, −2.7, −2.8, −10.5 (5 of 5 negative, mean −5.4)** | 2026: f5 +2.0%. The 60-day mark falls ~Dec 10 |
| Second hike (Oct 28 would be one) | 1994-03-22, 1999-08-24, 2004-08-10, 2016-12-14, 2022-05-04 | −5.7, −3.9, +3.5, +0.9, −2.9 | −2.2, +3.5, +5.9, +5.0, −4.2 (mixed) | No pattern |
| Emergency intermeeting cuts (10) | 1998–2020 | mean +3.0, median +3.8, 80% up | mean +4.9 | 2001-Jan (−13.9% f60), 2008-Oct (−24.5% max drawdown) and 2020-03-03 (−27.6%) show the dispersion |

[I] The first-hike 5/5 record is suggestive but n = 5, and it conflicts with the (inapplicable, §2.5) midterm seasonal. It is logged as a warning, not a trade: it argues against adding index risk before mid-December without another trigger.

### 2.2 CPI (291 releases, 2002-06 to 2026-09) and payrolls (292 releases, 1995 to 2026-09)

**Buckets.**
- CPI: hot is Δ2y ≥ +4bp (n = 54); cool is ≤ −6bp (n = 44).
- Payrolls: strong is ≥ +8bp (n = 44); weak is ≤ −6bp (n = 44).

Forward moves from the day-0 close, with placebo p in brackets [F]:

| Release / bucket | Day-0 (2y / SPY / TLT) | SPY f1 | SPY f20 | TLT f1 | TLT f20 | 10y f20 (bp) | USO f1 |
|---|---|---|---|---|---|---|---|
| CPI hot | +8.4bp / +0.23% / −0.70% | −0.33 (0.03) | +0.35 (0.39) | +0.21 (0.11) | −0.18 (0.52) | +2.9 (0.56) | +0.08 (0.87) |
| CPI cool | −10.3bp / +0.08% / +0.98% | −0.23 (0.13) | +1.20 (0.57) | **+0.32 (0.02)** | **+1.39 (0.03)** | **−8.0 (0.03)** | −0.04 (0.90) |
| NFP strong | +13.8bp / +0.48% / −1.12% | +0.06 (0.90) | +0.28 (0.42) | −0.09 (0.46) | +0.29 (0.77) | −1.9 (0.46) | +0.80 (0.06) |
| NFP weak | −13.0bp / −0.57% / +1.22% | **−0.47 (0.01)** | +0.63 (0.93) | +0.08 (0.61) | +0.74 (0.45) | −1.6 (0.69) | **−1.30 (0.00)** |
| Random-day baseline | — | +0.05 | +0.95 | +0.01 | +0.28 | ~0 | +0.01 |

Gold, UUP and BTC rows are in `sched_all_buckets.csv`. None has a surviving signal. BTC's n is 13–34.

### 2.3 Multiple-testing verdict

[F] The full list of nominal "hits" at p < 0.05, out of 288 tests:
- FOMC dovish → gold f1;
- FOMC neutral → gold f1/f5, UUP f1/f5;
- CPI hot → SPY f1, BTC f60;
- CPI cool → TLT f1/f20, 10y f1/f20, UUP f1;
- NFP weak → SPY f1, USO f1;
- NFP neutral → 2y f5.

**15 hits against 14.4 expected by chance, and 0 pass BH-FDR 10%.**

[I] The only economically coherent cluster is "cool CPI → Treasuries keep rallying and the dollar keeps slipping", i.e. under-reaction to disinflation news. It is one event set tested several ways, not independent confirmation. **Verdict: paper-trade it only** (§5, W3).

### 2.4 How big are event days, and what do options charge now?

**Realized SPY absolute move on event days vs other days** [F]:

| Period | FOMC | CPI | NFP | Non-event days |
|---|---|---|---|---|
| 2002–2019 | 0.85% (1.13×) | 0.75% (0.99×) | 0.84% (1.11×) | 0.75% |
| 2022–2026 | 1.01% (1.32×) | 0.98% (1.29×) | 0.99% (1.31×) | 0.76% |
| 2024–2026 | 0.77%, median 0.56 (1.18×) | 0.76%, median 0.71 (1.16×) | **1.04%, median 0.83 (1.62×)** | 0.64% |
| 2025–2026 | 0.54% (0.77×) | 0.78% (1.11×) | 1.18% (1.74×) | 0.68–0.71% |

**Implied SPY moves from the 9/28 surface** [F]:
- **Method.** Take ATM straddles at the forward-nearest strike, back out the Black–Scholes IV, and compute total variance per expiry. Excess variance over a baseline day is then attributed to the event. The baseline day is the median of 8 non-event daily intervals: a 0.70% one-day s.d., or 11.1% annualised.
- **Limits.** Daily expiries exist through Oct 9; after that only weekly expiries are available, so weekly intervals mix events.

| Interval (to expiry) | Contains | Implied event-day 1-s.d. | Expected \|move\| | History for comparison |
|---|---|---|---|---|
| Oct 1 → Oct 2 | Payrolls | 0.81% | **0.65%** | 2024–26 mean 1.04% (median 0.83%) |
| Oct 9 → Oct 16 | CPI (+ bank earnings) | 1.11% | **0.88%** | 2024–26 mean 0.76% (median 0.71%) |
| Oct 23 → Oct 30 | FOMC + Oct 29 GDP/PCE/ECB + Oct 30 BoJ + mega-cap earnings | 1.56% (if one day) | 1.25% | FOMC days 2024–26: 0.77% |
| Oct 30 → Nov 6 | Election (Nov 4 reaction) + payrolls Nov 6 | 1.21% each | 0.96% each | Day-after-midterm S&P 1990–2022: 0.98% mean \|move\| |
| Nov 6 → Nov 20 | CPI Nov 10 + Nvidia | 1.46% each | 1.16% each | CPI 0.76%; SPY on Nvidia days 0.76% |

**Other underlyings: implied move to expiry (ATM straddle, % of spot)** [F]:

| Ticker | Oct 16 | Oct 30 | Nov 20 | Dec 18 | ATM IV Dec 18 |
|---|---|---|---|---|---|
| SPY | 2.25 | 3.16 | 4.23 | 5.34 | 14.2% |
| TLT | 2.73 | 3.57 | 4.60 | 5.64 | 15.1% |
| GLD | 3.94 | 5.29 | 6.84 | 8.39 | 22.4% |
| USO | 9.68 | 11.98 | 15.43 | 18.77 | 50.1% |
| IBIT | 6.40 | 8.73 | 11.76 | 15.04 | 39.9% |
| NVDA | 5.58 | 7.43 | 11.15 | 13.45 | 35.9% |
| JETS / DAL / UAL | 6.6 / 9.2 / 9.9 | 8.5 / 9.9 / — | 10.6 / 12.8 / 14.9 | 12.9 / 14.9 / 17.4 | 34 / 40 / 46% |

**Verdict** [I]:
- **CPI:** options charge more than recent history, so there is no long-vol edge (and selling naked is banned).
- **Election:** priced in line with history.
- **FOMC week:** confounded by mega-cap earnings.
- **Payrolls:** the one place implied (0.65%) sits well below the recent realized mean (1.04%; the median of 0.83% is still above it). Even so it is not an edge the system can use:
  - we have no historical implieds to backtest the gap;
  - 2024–26 includes the 2025-04-04 tariff crash, which fell on a payrolls day;
  - the instrument would be a 1-day option, which the constitution bans.

  **Paper-log only.**

### 2.5 US midterm elections (1934–2022, n = 23)

**S&P 500 price, %** [F]:

| Window | Midterm mean | Median | s.d. | Up% | Min / max | Same season, other years | Up% | p vs season (permutation) |
|---|---|---|---|---|---|---|---|---|
| 1 month before election day | **+3.88** | +2.41 | 6.52 | 74 | −10.3 / +16.6 | +0.08 | 62 | **0.00** (Welch 0.02) |
| Election → +1 week | +0.77 | +1.37 | 2.33 | 70 | −3.5 / +4.3 | −0.36 | 54 | 0.16 |
| Election → +1 month | +0.91 | +1.92 | 4.88 | 70 | −12.0 / +7.9 | +0.22 | 59 | 0.48 |
| Election → +2 months | +3.41 | +2.58 | 5.66 | 78 | −6.4 / +15.6 | +1.42 | 65 | 0.13 |
| −1 month → +2 months | **+7.34** | +7.67 | 7.81 | 87 | −10.4 / +25.9 | +1.51 | 64 | **0.00** |

**Per year, % (pre-month / +2 months)** [F]:

| Year | Pre / post | Year | Pre / post | Year | Pre / post |
|---|---|---|---|---|---|
| 1934 | +2.3 / +4.9 | 1962 | +2.2 / +11.0 | 1990 | −0.6 / +1.1 |
| 1938 | +4.8 / −6.4 | 1966 | +10.3 / +2.6 | 1994* | +1.4 / −0.9 |
| 1942 | +6.3 / +4.3 | 1970 | −2.6 / +9.0 | 1998 | +12.4 / +12.1 |
| 1946* | +3.5 / +0.5 | 1974 | +15.6 / −5.4 | 2002 | +16.6 / +0.8 |
| 1950 | −2.7 / +9.1 | 1978 | −10.3 / +5.8 | 2006* | +2.4 / +2.3 |
| 1954* | −1.5 / +15.6 | 1982 | +13.2 / +0.6 | 2010* | +5.0 / +6.6 |
| 1958 | +2.4 / +6.5 | 1986 | +4.9 / +2.7 | 2014 | +2.4 / −0.5 |
| | | | | 2018* | −4.5 / −6.2 |
| | | | | 2022* | +6.0 / +2.4 |

\* House changed hands. House-flip years (n = 7) averaged +2.9% over the 2 months after, against +3.6% for the others, so a Democratic House in 2026 is not a signal.

**The conditioning that matters for 2026.** The watch window is Sep 28 → Nov 27, calendar-matched [F]:

| Group | n | Sep 28 → election day (mean, up%) | Election → Nov 27 | Sep 28 → Nov 27: mean / median / s.d. / up% | P(drawdown ≤ −5%) |
|---|---|---|---|---|---|
| Midterm years, all | 23 | +3.65, 78% | +1.03 | +4.63 / +4.54 / 5.6 / 83% | 30% |
| Other years, all | 69 | +1.01, 65% | +0.07 | +1.12 / +1.89 / 7.6 / 65% | 23% |
| **Midterm, S&P within 5% of 52-week high on Sep 28 (2026: −1.5%)** | **9** | **+0.43, 56%** | +1.26 | **+1.64 / +3.91 / 5.8 / 67%** | 33% |
| Other years, within 5% of high | 40 | +0.60, 65% | +1.27 | +1.91 / +2.59 / 6.4 / 72% | 22% |
| Midterm, >5% below high | 14 | +5.73, 93% | +0.88 | +6.55 / +6.09 / 4.7 / 93% | 29% |

The near-high midterm years were 1950 +3.9, 1954 +5.7, 1958 +4.5, 1978 −5.9, 1982 +9.4, 1994 −2.7, 2006 +3.2, 2014 +4.5 and 2018 −8.0.

**Verdict** [I]: the famous midterm strength is the market recovering from a midterm-year low. **2026's low was on 30 March, during the war, and the index sits 1.5% below its high, so the pattern gives no edge for this window.** Track 08's "don't initiate index shorts into Nov–Dec" tilt survives only weakly.

Cross-asset after election day [F]:

| Asset | n | 60-day change after election day |
|---|---|---|
| 10-year yield | 16 | −22bp average |
| TLT | 6 | +5.1% |
| USO | 5 | −11.6% |
| Gold | 6 | +8.2% |

All of these samples are too small to trade.

### 2.6 Government-shutdown deadlines (23 funding gaps, 1976–2025; CRS list)

**S&P after the first day of the lapse** [F]:

| Horizon | Mean | Up% | Baseline | Excess | p |
|---|---|---|---|---|---|
| Day 0 | −0.04% | 52% | — | — | — |
| f5 | +1.00% | — | +0.19% | +0.76 | 0.09 |
| f20 | +1.39% | 65% | +0.74% | +0.44 | 0.61 |
| f60 | +3.10% | — | +2.25% | +0.24 | 0.88 |

- The seven major gaps (≥3 days, 1990+, including 43 days in Oct–Nov 2025) averaged +3.0% over 20 days and +6.6% over 60.
- The 10 days before a deadline averaged −0.45% (39% up), against +0.39% for all 10-day windows. This is noise-level.
- 10-year yields fell 7bp in the first week (p = 0.10), and 3-month bills rose 4.6bp on day 1.

**Verdict** [I]: the Dec 11 CR expiry (Kalshi: shutdown by Dec 12 at 22–28%) is not a market event on history. No trade.

### 2.7 Bank of Japan hikes (7 with data, plus 2026-09-18 partial)

USDJPY 20 days after the hike (negative = yen stronger) [F]:

| Hike | USDJPY f20 |
|---|---|
| Aug 2000 | −2.2% |
| Jul 2006 | +0.2% |
| Feb 2007 | −2.9% |
| Mar 2024 | +3.4% |
| **Jul 2024** | **−5.7%** (Nikkei −10.3% and S&P −5.9% within 5 days: the yen-carry unwind) |
| Jan 2025 | −4.3% |
| Dec 2025 [verify date] | +1.7% |

The mean is −1.4% (4 of 7 yen stronger). On day 0 the yen usually weakened slightly (+0.18%).

**Verdict** [I]: a BoJ hike alone is weak. The dangerous combination is **BoJ hikes + Fed holds + USDJPY near the intervention zone**, i.e. the Jul 31, 2024 analog (n = 1).

---

## 3. Unscheduled shocks

### 3.1 Conflict onsets and escalations (34 events 1939–2026; 32 after declustering)

**Per event.** S&P % from the day-0 close; maximum drawdown and days-to-low measured from the pre-event close; WTI and gold in %; 10-year in bp [F]:

| Event | Day 0 | S&P d0 | f5 | f20 | f60 | Max DD 60d | Days to low | WTI d0 / f20 | Gold d0 / f20 | 10y f20 |
|---|---|---|---|---|---|---|---|---|---|---|
| Germany invades Poland | 1939-09-01 | +1.1 | +15.2 | +14.0 | +8.0 | 0.0 | 0 | — | — | — |
| Germany invades France | 1940-05-10 | −3.0 | −15.4 | **−23.6** | −13.5 | −25.8 | 21 | — | — | — |
| **Pearl Harbor** | 1941-12-08 | −3.8 | −2.7 | +0.3 | −9.0 | −12.4 | 61 | — | — | — |
| **Korean War** | 1950-06-26 | −5.4 | −2.6 | −4.9 | +6.1 | −12.9 | 15 | — | — | — |
| Suez: Israel into Sinai | 1956-10-30 | −0.1 | +1.6 | −4.3 | −3.6 | −4.4 | 21 | — | — | — |
| **Cuban missile crisis** | 1962-10-23 | −2.7 | +5.7 | +13.7 | +22.0 | −2.7 | 1 | — | — | −2 |
| Six-Day War | 1967-06-05 | −1.5 | +4.1 | +2.8 | +5.0 | −1.5 | 1 | — | — | +37 |
| Yom Kippur War | 1973-10-08 | +0.3 | −0.2 | −4.3 | −9.5 | −16.1 | 42 | — | — | −1 |
| Iran–Iraq war | 1980-09-22 | +0.9 | −5.3 | +1.7 | +1.9 | −4.4 | 6 | — | — | +1 |
| **Iraq invades Kuwait** | 1990-08-02 | −1.1 | −3.3 | −9.3 | −13.3 | −16.9 | 50 | +9.8 / +13.7 | — | +45 |
| **Desert Storm air war** | 1991-01-17 | +3.7 | +2.1 | +11.1 | +16.2 | 0.0 | 0 | **−33.4** / +3.6 | — | −27 |
| **9/11** | 2001-09-17 | −4.9 | −3.4 | +4.9 | +9.4 | −11.6 | 5 | 0.0 / −19.1 | +6.8 / −1.8 | +4 |
| **Iraq war begins** | 2003-03-20 | +0.2 | −0.8 | +2.0 | +15.4 | −3.0 | 8 | −9.4 / +7.0 | −1.0 / −1.7 | −3 |
| **Crimea** | 2014-03-03 | −0.7 | +1.7 | +1.4 | +3.5 | −2.4 | 30 | +2.4 / −3.6 | +2.1 / −5.1 | +13 |
| Abqaiq | 2019-09-16 | −0.3 | −0.2 | −1.1 | +4.5 | −4.0 | 13 | +15.2 / −15.1 | +0.8 / −0.5 | −7 |
| Soleimani | 2020-01-03 | −0.7 | +0.9 | +0.4 | −20.1† | −31.3† | 55 | +3.0 / −20.5 | +1.3 / +1.7 | −26 |
| **Russia invades Ukraine** | 2022-02-24 | +1.5 | +1.7 | +5.4 | −9.0 | −7.7 | 60 | +0.7 / +23.1 | −0.6 / +3.4 | +38 |
| **Hamas attack on Israel** | 2023-10-09 | +0.6 | +0.9 | +0.7 | +8.1 | −4.4 | 15 | +3.7 / −9.2 | +1.8 / +6.1 | −8 |
| **Iran attacks Israel (Apr)** | 2024-04-15 | −1.2 | −1.0 | +3.2 | +10.3 | −3.0 | 5 | −0.3 / −6.4 | +1.9 / −2.1 | −15 |
| **Iran attacks Israel (Oct)** | 2024-10-01 | −0.9 | +0.7 | +2.2 | +5.8 | −1.2 | 5 | +2.4 / −2.1 | +1.0 / +4.3 | +55 |
| **Israel strikes Iran** | 2025-06-13 | −1.1 | +0.8 | +4.5 | +9.3 | −1.3 | 5 | +7.4 / −8.2 | +1.3 / −3.0 | +9 |
| **US strikes Iran nuclear sites** | 2025-06-23 | +1.0 | +3.0 | +4.7 | +9.5 | 0.0 | 0 | −8.4 / −2.6 | +0.3 / +1.6 | +1 |
| **US/Israel–Iran war** | 2026-03-02 | 0.0 | −1.2 | −7.8 | +9.3 | −7.8 | 21 | +6.2 / **+47.2** | +1.3 / **−15.4** | +30 |
| Ceasefire collapses (approx.) | 2026-07-08 | −0.3 | +1.2 | +3.2 | n/a | −2.5 | 16 | +4.2 / +3.0 | −0.8 / +4.1 | +7 |

† COVID window. The full 34-row table, including Tonkin, Tet, Cambodia, Afghanistan 1979/2001, Falklands, Kosovo, Libya 2011 and North Korea 2017, is in `shock_events_geo_all.csv`.

**Aggregates** (declustered; excess and p against the era-matched placebo) [F]:

| Set / asset | n | Day 0 | f5 | f20 | f60 | Note |
|---|---|---|---|---|---|---|
| All onsets / S&P | 32 | −0.55 (41% up) | +0.03 (p 0.72) | +0.81, s.d. 7.0, 69% up (p 0.85) | +2.21, s.d. 9.7 (p 0.79) | Over all 34 events: median days to low 15.5; median max drawdown −3.5%; P(max drawdown ≤ −10%) = 24% (8/34) |
| All / WTI | 17 | +0.66 (median +2.4) | **+4.54 (p 0.01)** | +2.50 (p 0.59) | +0.89 (p 0.69) | — |
| War subset / WTI | 11 | −1.15 | **+7.51, 82% up (p 0.00)** | **+7.60 (p 0.05)** | +7.15 (p 0.48) | — |
| All / gold | 14 | **+1.21 (79% up)** | −0.22 (p 0.42) | +0.03 (p 0.40) | −0.15 (p 0.13) | f1 −0.45 (p 0.09) |
| War subset / gold | 8 | +1.54 | −0.27 | −1.59 | −0.27 | **f1 −1.24, 0/8 up (p 0.01)** |
| All / 10y (bp) | 27 | +0.2 | +4.6 (p 0.16) | +4.8 (p 0.65) | +17.4 (p 0.28) | No flight-to-quality persistence |
| All / TLT | 12–13 | +0.14 | −0.28 | −0.18 | +3.45 (p 0.06) | — |
| All / DXY | 21–22 | −0.06 | +0.19 | +0.07 | +2.02 (p 0.06) | War subset f60 +2.5 (p 0.04) |
| All / BTC | 9–10 | +0.04 | +5.27 (p 0.14) | +11.46 (p 0.28) | +17.3 (p 0.94) | Baseline 20d +5.8 |

### 3.2 "Buy the invasion": verdict

- **S&P** [F]: no excess at 1, 5, 20 or 60 days (every p ≥ 0.2). The distribution is wide: 20-day outcomes run from −23.6% to +14.0%. The losers are onsets that hit a fragile macro backdrop: May 1940; the Kuwait oil shock in a recession year (1990); Yom Kippur plus the embargo (1973); and Ukraine plus Fed hikes (2022).
- **Timing the low** [I]: the median low came ~15 trading days after the news, but about a fifth of the lows (7 of 34) came at the pre-event close or within 2 days. A "buy X% below" rule cannot be tuned on n = 32 without overfitting.
- **For the system** [I]: in an already-running war with markets near highs, onsets are not buy signals. A crash-type day is, if the trend filter passes (§3.5).

### 3.3 Oil supply shocks: lasting disruption vs fear (11 onsets)

WTI spot, % from the day-0 close [F]:

| Class | Events | Day 0 | f5 | f20 | f60 |
|---|---|---|---|---|---|
| **Lasting physical disruption** (n = 5) | Kuwait 1990; Libya 2011; Russia 2022-02-24 and 03-06; Hormuz 2026-03-02 | +5.7 (median +6.2) | **+10.3** | **+16.7 (median +13.7)** | +18.1 (median +21.4) |
| **Fear / quickly restored** (n = 6) | Abqaiq 2019; Soleimani 2020; Hamas 2023; Iran–Israel Apr and Oct 2024; Israel–Iran Jun 2025 | +5.2 (median +3.3) | −2.6 | **−10.3 (median −8.7)** | −17.6 (median −10.1) |

- Within "lasting", the 2022-03-06 oil-ban scare marked the blow-off top (−13.4% over 20 days). Even real disruptions overshoot.
- **Across all oil shocks (n = 10)** the losers were oil importers:
  - XLE: +1.1% on day 0, then **−4.9% over 60 days (p 0.04)**;
  - INDA: −1.65% on day 0 (0/8 up);
  - JETS: −1.9% on day 0 (1/8 up);
  - EIDO: −7.9% over 60 days (p 0.05).

**Interpretation** [I]: the market prices the first day correctly on average. The information that decides the next month is whether barrels are physically lost and not restorable within ~2 weeks (Kilian 2009 distinguishes supply shocks from precautionary-demand shocks).

- **Now**, Hormuz is already at ~15% of normal and the Saudi East–West pipeline is offline (Polymarket restart odds 55.5% by Oct 15). The remaining supply at risk is the bypass routes (Yanbu, Fujairah) and the Red Sea / Bab al-Mandab (Houthi tanker seizure by Oct 31: 13%).
- A hit to those would be "lasting". Strikes on military targets would be "fear".

### 3.4 De-escalations and "sell the ceasefire" (17 events 1953–2026; 16 declustered)

**Per event** (from the day-0 close unless noted; % and bp) [F]:

| Event | Day 0 | S&P d0 | S&P f20 | S&P f60 | WTI d0 | WTI f20 | WTI f60 | 10y f60 |
|---|---|---|---|---|---|---|---|---|
| Korean armistice | 1953-07-27 | −0.7 | +0.1 | +0.5 | — | — | — | — |
| Cuba: Khrushchev backs down | 1962-10-29 | +2.2 | +11.5 | +18.3 | — | — | — | −6 |
| Yom Kippur ceasefire | 1973-10-22 | −1.0 | −7.7 | −10.9 | — | — | — | +20 |
| Iran accepts UNSC 598 | 1988-07-18 | −0.6 | −4.4 | +2.7 | +6.7 | −1.6 | −14.2 | −31 |
| **Desert Storm starts** | 1991-01-17 | +3.7 | +11.1 | +16.2 | **−33.4** | +3.6 | +0.3 | −8 |
| Gulf War ceasefire | 1991-02-28 | −0.2 | +2.2 | +2.8 | +1.3 | +1.8 | +9.1 | +8 |
| Iraq war starts | 2003-03-20 | +0.2 | +2.0 | +15.4 | −9.4 | +7.0 | +6.4 | −83 |
| Fall of Baghdad | 2003-04-09 | −1.4 | +6.3 | +16.0 | −2.8 | +14.3 | −0.7 | −19 |
| Iran stands down | 2020-01-08 | +0.5 | +2.9 | −23.5† | −4.9 | −14.6 | −52.5† | −125† |
| Istanbul talks | 2022-03-29 | +1.2 | −9.7 | −15.5 | −3.1 | −2.2 | +4.6 | +72 |
| Israel's limited strike on Iran | 2024-10-28 | +0.3 | +2.8 | +3.2 | −6.1 | +2.1 | +9.6 | +25 |
| **Israel–Iran ceasefire** | 2025-06-23 | +1.0 | +4.7 | +9.5 | −8.4 | −2.6 | −7.1 | −28 |
| **US–Iran two-week ceasefire** | 2026-04-08 | +2.5 | +8.6 | +11.1 | **−16.1** | +2.7 | −27.6 | +19 |
| Memo lifts blockade (approx.) | 2026-06-17 | −1.2 | +0.5 | +2.7 | +1.1 | +3.4 | +27.0 | +48 |

† COVID window.

**Aggregates** [F]:

| Asset | n | Day 0 | f1 | f5 | f20 | f60 |
|---|---|---|---|---|---|---|
| S&P | 16 | +0.49 | **+0.55 (81% up, p 0.04)** | +0.77 (p 0.31) | +1.79, 75% up (p 0.36) | +2.36 (p 0.83) |
| WTI | 11 | **−6.75 (median −4.9)** | −0.32 (p 0.63) | +0.55 (p 0.88) | **−0.41, median +1.8 (p 0.66)** | −3.78, median +2.7 (p 0.26) |
| USO | 7 | −3.82 | −0.46 | −1.77, 14% up (p 0.25) | −0.21 (p 0.59) | −2.11 (p 0.33) |
| LUV (airline) | 11 | +2.10 | +1.43 (p 0.06) | +2.81 (p 0.11) | **+7.12, 91% up (p 0.07)** | +3.76 (p 0.96) |
| Gold | 8 | −0.43 | −0.17 | −0.62 | −1.14 (p 0.11) | +0.69 |
| 2y (bp) | 11 | +2.0 | −0.2 | −3.5 | −3.7 | −14.4 (p 0.35) |

- Robustness: the S&P's 20-day return after all 17 de-escalations averaged +2.05% (76% up). The 12 in the oil era (1986+) averaged +2.6% (83% up).

**Verdict** [I]:
- **"Sell the ceasefire" in oil works only for those already short before the news.** The day-0 gap is the whole average effect.
- **Equities are slower.** Airlines, EM importers and the index keep rising for weeks after oil has repriced.

### 3.5 Crash-type days

**Named crashes** (n = 14 after declustering) [F]:

| Crash | Day 0 | S&P d0 | f5 | f20 | f60 | Max DD 60d | Days to low |
|---|---|---|---|---|---|---|---|
| Black Monday | 1987-10-19 | −20.5 | +1.3 | +9.7 | +9.4 | −20.8 | 34 |
| Oct 1989 | 1989-10-13 | −6.1 | +4.0 | +1.6 | +4.1 | −6.4 | 17 |
| Asian crisis | 1997-10-27 | −6.9 | +7.1 | +7.9 | +9.2 | −6.9 | 1 |
| LTCM/Russia | 1998-08-31 | −6.8 | +6.9 | +9.6 | +23.6 | −6.8 | 1 |
| TARP vote fails | 2008-09-29 | −8.8 | −4.5 | −23.3 | −22.0 | −38.0 | 39 |
| Oct 2008 | 2008-10-15 | −9.0 | −1.2 | −6.1 | −4.1 | −24.6 | 27 |
| **Flash crash** | 2010-05-06 | −3.2 | +2.6 | −5.6 | −0.2 | −12.3 | 41 |
| US downgrade | 2011-08-08 | −6.7 | +7.6 | +4.1 | +8.8 | −8.4 | 40 |
| **China deval selloff** | 2015-08-24 | −3.9 | +4.2 | +2.6 | +8.3 | −5.2 | 2 |
| Volmageddon | 2018-02-05 | −4.1 | +0.3 | +3.0 | −0.5 | −6.6 | 4 |
| **Covid** | 2020-03-09 / 03-16 | −7.6 / −12.0 | −13.1 / −6.2 | −3.0 / +19.3 | +13.7 / +33.7 | −24.7 / −17.5 | 11 / 6 |
| CPI shock | 2022-09-13 | −4.3 | −2.0 | −8.7 | 0.0 | −13.0 | 22 |
| **SVB failure** | 2023-03-10 | −1.4 | +1.4 | +6.4 | +10.9 | −1.6 | 2 |
| Yen-carry unwind | 2024-08-05 | −3.0 | +3.0 | +6.6 | +12.5 | −3.0 | 1 |
| Tariff crash | 2025-04-04 | −6.0 | +5.7 | +11.4 | +22.7 | −7.7 | 3 |

- **S&P aggregate** (declustered): f1 **+2.29% (p 0.00)**; f5 **+1.75%, 79% up (p 0.02)**; f20 +1.60% (p 0.59); f60 **+7.18%, 79% up (p 0.03)**.
- **Other assets**:
  - TLT f1 −1.54% and **f5 −2.12%, 20% up (p 0.00)**: the flight-to-quality rally reverses;
  - gold f1 −0.98% (p 0.01);
  - 2y f5 −9.5bp (p 0.01);
  - BTC −9.3% on day 0, then f1 +4.9% (p 0.01, n = 7).

**Systematic version**: the first close of −3% or −4% or worse in each 20-day cluster, split by whether the prior close was above the 200-day MA. S&P %, from the crash-day close [F]:

| Threshold | Trend | Period | n | f5 | f20 | f60 (median) | Up% at 60d | Median / worst max DD | Placebo p (f60) |
|---|---|---|---|---|---|---|---|---|---|
| ≤ −3% | **Above 200d** | 1928–1989 | 39 | +1.6 | +1.7 | +3.7 (+5.5) | 62 | −4.2 / −39.0 | 0.28 |
| ≤ −3% | **Above 200d** | **1990–2026** | **21** | +1.2 | +1.1 | **+6.9 (+8.8)** | **76** | −1.9 / −30.6 | **0.005** |
| ≤ −3% | Below 200d | 1990–2026 | 16 | −0.9 | −1.6 | 0.0 (+0.8) | 50 | −9.0 / −38.6 | — |
| ≤ −4% | Above 200d | 1928–1989 | 21 | +2.6 | +3.5 | +9.3 (+6.8) | 67 | −2.2 / −39.0 | 0.03 |
| ≤ −4% | Below 200d | 1928–1989 | 23 | −3.7 | −4.3 | −1.6 (+0.2) | 52 | −8.0 / −39.8 | — |

- All ≤ −4% days (n = 60): above-200d f5 +2.8% (p 0.00) and f60 +8.8% (p 0.02); below-200d f5 −2.2% (p 0.00) and f20 −3.2% (p 0.01).

**Verdict** [I]: this is the only short-horizon pattern here that has:
- n > 20;
- a mechanism (a volatility shock inside an uptrend usually doesn't break the trend);
- persistence after 1990.

The trend filter is essential. The S&P is currently +6.6% above its 200-day MA, so the rule is armed (§5, W10). The mean is not a promise: Feb 2020's first −3% day was followed by a −31% drawdown.

### 3.6 Headline days inside a war regime

WTI days with a move of 5% or more either way, declustered over 5 days, 1986–2026 [F]:
- **War regimes** (1990–91, 2022, 2026; n ≈ 45): no reliable continuation or reversal.
  - Up days: 5-day follow-through +0.45% (median −0.35%); 20-day −0.74% (median +0.6%).
  - Down days: 5-day follow-through −1.2% (median +0.1%).
- **In 2026**, 20-day follow-through after such days ranged from **−26.5% to +47.2%**.
- **Rule** [I]: never chase or fade a headline day in oil on the headline alone.

---

## 4. Oil-shock unwinds

### 4.1 How far and how fast (anchored at the ex-post peak; not knowable in real time)

WTI spot [F]:

| Episode | Peak close | 5d / 20d / 60d from the peak close | Days to −10% / −20% (vs the pre-peak close) | Notes |
|---|---|---|---|---|
| 1990 pre-war peak | 1990-10-11 | −9.8 / −13.3 / −33.6 | 6 / 7 | Premium faded before the war began |
| 2003 pre-war peak | 2003-03-07 ($37.8) | −21.8 / −24.5 / −16.8 | 3 / 4 | "Sell the rumour": the drop came before the invasion |
| 2011 Libya peak | 2011-04-08 | +2.0 / −11.2 / −18.8 | 11 / 42 | IEA stock release on Jun 23 |
| 2019 Abqaiq spike | 2019-09-16 | −7.0 / −15.1 / −6.9 | — | Round trip within ~2 weeks |
| **2022 March peak** | 2022-03-08 (WTI $123.64; Brent $133.18) | **−22.0** / −17.5 / −5.5 | **2 / 6** | $123.64 → $94.85 by Mar 16 (−23%), then +8.5% in a day; the Russian supply loss persisted |
| 2022 June peak | 2022-06-08 ($121.94) | −5.4 / −12.4 / −28.4 | 9 / 38 | ~$87 by early September |

On average WTI was 15.7% lower 20 days after the peak close (all six negative) and 18.3% lower after 60 (range −5.5% to −33.6%). These anchors use hindsight; §4.2 shows what was capturable.

### 4.2 What a trader acting after the news could capture (real-time anchors)

WTI; "cum" is measured from the pre-event close, "f" from the day-0 close [F]:

| Episode | WTI d0 | Cum 20d | Cum 60d | f5 | f20 | f60 | Share of 60d move on day 0 | Short's worst move within 20d |
|---|---|---|---|---|---|---|---|---|
| **Desert Storm, Jan 17 1991** ($32.25 → $21.48) | **−33.4** | −31.0 | −33.2 | **+19.3** | +3.6 | +0.3 | 100% | +19.3 |
| Iraq war start, 2003 | −9.4 | −3.1 | −3.6 | +2.9 | +7.0 | +6.4 | >100% | +23.0 |
| IEA stock release, 2011 | −3.2 | −7.4 | −15.8 | +6.1 | −4.4 | −13.0 | 20% | +9.8 |
| Iran stands down, 2020 | −4.9 | −18.8 | −54.8† | −3.0 | −14.6 | −52.5† | 9% | 0.0 |
| Israel's limited strike, Oct 2024 | −6.1 | −4.1 | +3.0 | +6.2 | +2.1 | +9.6 | n/m | +7.5 |
| **Israel–Iran ceasefire, Jun 2025** ($75.72 → $69.36 → $65.45) | −8.4 | −10.8 | −14.9 | −4.4 | −2.6 | −7.1 | 56% | +0.4 |
| **US–Iran ceasefire, Apr 8 2026** ($114.58 → $96.17) | **−16.1** | −13.8 | −39.3 | −3.3 | +2.7 | −27.6 | 41% | **+14.9** (→ $110.47 on Apr 29) |
| Memo lifts blockade, Jun 2026 (approx.; market moved from ~Jun 11) | +1.1 | +4.5 | +28.3 | −9.9 | +3.4 | +27.0 | n/m | +3.4 |

† COVID window.

**Summary for the 8 event anchors** [F]:
- WTI day 0: mean −10.0% (median −7.2%).
- From the day-0 close: f5 +1.7%; **f20 −0.3% (median +2.4%; only 38% negative)**; f60 −7.1% (median −3.4%; 50% negative).
- A short's worst move within 20 days: **median +8.6%, maximum +23%**.

USO confirms (n = 6): −5.1% on day 0, then f5 −0.9%, **f20 +1.7%**, f60 −5.2%.

### 4.3 Oil-sensitive assets: who kept moving

From the day-0 close after the 8 real-time anchors [F]:

| Asset | n | Day 0 | f5 | f20 (up%) | f60 | Note |
|---|---|---|---|---|---|---|
| **S&P 500** | 8 | +0.83 | +1.13 | **+4.67 (100%, p 0.02)** | +3.57 | Continuation |
| LUV | 8 | +2.80 | +3.45 (p 0.09) | **+7.00 (88%, p 0.13)** | +0.86 | Airline proxy back to 1991 |
| JETS | 5 | +1.92 | +3.46 (p 0.10) | +5.16 (80%) | −1.54 | 2015+ |
| DAL | 6 | +2.17 | +3.22 | +3.75 (67%) | −0.16 | — |
| UAL | 6 | +2.77 | +1.71 | +3.38 (50%) | +2.97 | — |
| XLE | 7 | −1.38 | −0.32 | +1.51 (43%) | −4.19 (p 0.06) | f1 −1.14 (p 0.06) |
| INDA | 5 | +1.25 | +1.19 | +0.51 (60%) | −9.2† | — |
| EIDO | 6 | +0.31 | +0.64 | −0.50 (33%) | −13.4† | Weak link to oil |
| TLT | 7 | +0.07 | +0.37 | +0.53 (57%) | +7.2† (p 0.00) | 10y f60 −31bp (median −18bp) |
| Gold | 7 | −0.68 | −1.26 (p 0.10) | −0.68 | +3.69 | — |

† Dominated by the COVID window (2020 anchor).

In June 2026 the 10-year barely moved as Brent fell ~27% (4.49% → 4.42%; track 08): duration is a weak peace proxy.

### 4.4 2026 is a one-factor market

Daily betas and correlations to USO (Mar 2 – Sep 28, 2026; n = 145), against 2022 [F]:

| Asset | β 2026 (corr) | β 2022 (corr) | Asset | β 2026 (corr) | β 2022 (corr) |
|---|---|---|---|---|---|
| JETS | **−0.46 (−0.78)** | −0.03 (−0.03) | S&P 500 | −0.12 (−0.54) | +0.08 (+0.14) |
| DAL | −0.42 (−0.66) | −0.04 (−0.04) | IWM | −0.18 (−0.58) | +0.10 (+0.16) |
| UAL | −0.60 (−0.72) | −0.12 (−0.10) | TLT | −0.09 (−0.53) | −0.04 (−0.09) |
| LUV | −0.53 (−0.75) | +0.01 (+0.01) | Gold | −0.11 (−0.23) | +0.15 (+0.44) |
| INDA | −0.19 (−0.66) | −0.02 (−0.04) | BTC | −0.15 (−0.23) | +0.17 (+0.12) |
| EEM | −0.23 (−0.44) | +0.08 (+0.15) | XLE | +0.24 (+0.62) | +0.55 (+0.68) |
| EIDO | −0.12 (−0.24) | +0.07 (+0.16) | FXY | −0.05 (−0.32) | +0.04 (+0.15) |

- **What a 20% oil move implies** [I]. A de-escalation that takes USO −20% implies, by 2026 betas:

  | Asset | Implied move |
  |---|---|
  | JETS | ~+9% |
  | UAL | ~+12% |
  | INDA | ~+4% |
  | S&P | ~+2.5% |
  | TLT | ~+1.8% |
  | XLE | ~−5% |

  An escalation does the opposite.
- **Factor budget** [I]: airlines, INDA, EM, small caps, TLT and gold upside all load on the **same "oil-down / peace" factor** in 2026. This quantitatively confirms track 08's one-factor warning, and they must share one risk budget.

### 4.5 Expressing the unwind (or the escalation) with defined risk

**Structures priced at realistic fills** (buy at the ask, sell at the bid; 9/28 close quotes). RN = risk-neutral probability from strike IVs. "Round trip" = bid-ask on both legs as a % of the mid debit, i.e. the cost of getting in and out [F]:

| Idea | Structure | Debit (% of spot) | Max × | Breakeven | RN P(long in the money) / P(full value) | Round trip | Liquidity verdict |
|---|---|---|---|---|---|---|---|
| Oil unwind | USO Nov 20 140/120 put spread | $5.25 (3.5%) | 3.81 | −10.2% | 39% / 16% | 14% | Usable (OI 4.1k/3.7k) |
| Oil unwind | USO Dec 18 140/120 put spread | $6.32 (4.2%) | 3.16 | −10.9% | 42% / 20% | 19% | Usable |
| Escalation hedge | USO Dec 18 165/200 call spread | $6.15 (4.1%) | **5.69** | +14.1% | 31% / 11% | 15% | Usable |
| Energy equities short | XLE Dec 60/55 put spread | $1.75 (2.8%) | 2.86 | −6.2% | 40% / 19% | 92% | **Fails** (verify intraday) |
| Airlines up | JETS Dec 29/32 call spread | $1.50 (5.3%) | 2.00 | +7.1% | 45% / 22% | 105% | **Fails** |
| Airlines up | **DAL Dec 85/95 call spread** | $3.72 (4.4%) | 2.69 | +5.6% | 45% / 24% | 15% | Usable |
| Airlines up | UAL Dec 110/130 call spread | $8.70 (7.8%) | 2.30 | +6.5% | 49% / 22% | 39% | Poor |
| EM importer | INDA / EIDO calls | — | — | — | — | no two-sided quotes | **Fails** → ETF outright |
| Index up | **SPY Nov 20 770/810 call spread** | $13.86 (1.8%) | 2.89 | +2.4% | 48% / 12% | 0.5% | Excellent |
| Index up | SPY Dec 18 780/800 call spread | $8.24 (1.1%) | 2.43 | +3.0% | 41% / 26% | 1.1% | Excellent |
| Index hedge | SPY Dec 18 735/660 put spread | $6.85 (0.9%) | 10.95 | −4.9% | 29% / 10% | 0.9% | Excellent |
| Duration | TLT Nov 20 80/83 call spread | $0.80 (1.0%) | 3.75 | +2.8% | 36% / 15% | 2.5% | Excellent |
| Bond rout | TLT Dec 80/75 put spread | $2.14 (2.7%) | 2.34 | −1.0% | 61% / 29% | 3.3% | Excellent |
| Gold | GLD Dec 380/400 call spread | $7.85 (2.1%) | 2.55 | +2.6% | 49% / 31% | 6.6% | Good |
| BTC | IBIT Dec 46/60 call spread / 45/35 put spread | $3.88 (8.2%) / $1.90 (4.0%) | 3.61 / 5.26 | +5.7% / −8.7% | 53% / 10%; 42% / 11% | 3% | Good |
| AI capex (post-event only) | SMH Dec 570/470 put spread | $22.00 (3.7%) | 4.55 | −8.7% | 40% / 13% | 15% | Usable |
| Yen | FXY Dec 58/60 call spread | $1.35 | 1.48 | +1.9% | — | 148% | **Fails** → FXY outright or CME yen futures |

Single-stock and sector-ETF quotes widen after 16:00 ET, so re-check JETS, XLE, EEM and UAL intraday before ruling them out. The go/no-go rule in §7 uses live quotes.

**Why buying oil wings in advance has no edge** [F/I]:

- **Risk-neutral vs historical odds for USO to Dec 18.** Historical frequencies use 58-trading-day windows [F]:

  | USO move | Risk-neutral | All 2006+ | 2022 war | 2026 war (88 overlapping windows) |
  |---|---|---|---|---|
  | ≤ −25% | 14.3% | 7.5% | 0% | 0% |
  | ≤ −15% | **28.5%** | **14.7%** | 7.0% | 17.0% |
  | ≤ −7% | 41.7% | 28.9% | 34.9% | 38.6% |
  | ≥ +10% | 31.4% | 26.8% | 9.8% | 34.1% |
  | ≥ +25% | 15.0% | 7.0% | 0.9% | 23.9% |

- **What the options already price** [I]. USO options charge roughly twice the historical frequency of a −15% move. The upside tail looks cheap only against the 2026 sample, which is 7 months of overlapping windows.
- **Roll yield** [I]:
  - USO's risk-neutral drift is ~r, while its real-world drift in backwardation includes positive roll: WTI Nov–Dec −$3.56 is ~3.9% a month if spot holds.
  - So puts must beat spot's decline **plus** the roll the fund earns. The futures curve already embeds a decline: Dec-26 WTI is $89.73 against Nov $93.29, and Dec-27 is $74.73.
- **Conclusion** [I]: an unwind bet pays only if de-escalation happens faster than the curve, the options (IV ~50%) and Polymarket (blockade end by Dec 31: 57.6%) already imply. The system has no information edge on Iranian diplomacy. **Pre-positioning is therefore a fair-to-expensive coin toss, and the defined-risk way to "play the unwind" is after the event and through the slow movers** (SPY, DAL; §4.3).

---

## 5. Watch list, 28 Sep – 27 Nov 2026

### 5.1 Calendar and market-implied baselines

Snapshot 9/28 ~22:15 UTC. K = Kalshi bid/ask midpoints; PM = Polymarket last price.

| Date | Catalyst | Market-implied baseline | Options-implied move | Historical pattern (this report) | Edge? |
|---|---|---|---|---|---|
| **Sep 30** | Brent Nov expiry; Aug PCE; Q2 GDP (third) | — | — | Front-month Brent resets $105.98 → $98.60 (−7%), a mechanical move | **Data trap** |
| **Oct 2** | September jobs | K: payrolls >90k 52–58%, >100k 44–45%, >50k 71%; unemployment >4.0% 69–70%, >4.1% 38–40% | SPY 0.65% expected \|move\| | No post-release drift after FDR; weak print → SPY f1 −0.47% (fails FDR) | No |
| **Oct 14** | September CPI | K: headline m/m >0.5% ~63%, >0.6% 17–20%; core m/m >0.2% ~35%, >0.3% 8–10%; y/y >3.6% ~37% | SPY 0.88%; TLT straddle to Oct 16: 2.7% | Cool print → TLT +1.4% over 20 days (p 0.03, fails FDR) | Paper only |
| Oct 15 | Polymarket deadlines | Blockade end by Oct 15: 15.5%; E–W pipeline restart by Oct 15: 55.5% | — | See W8 | — |
| ~Oct 20 | WTI Nov expiry | Nov $93.29 → Dec $89.73 | — | Mechanical −3.8% | **Data trap** |
| **Oct 27–28** | FOMC (+ Oct 29 GDP advance & Sept PCE, ECB; Oct 30 BoJ; mega-cap earnings) | Fed hike 69–70% (K), 68.5% (PM); hold 30%. GDP >3.0% 65–71%. ECB hold 76.5%. BoJ hike 28% | SPY 1.25% for the week (earnings-confounded) | Dovish day: TLT +0.9%, gold +0.8%, UUP −0.9%, then no drift. First-hike analog: S&P f60 negative 5/5 | No |
| Oct 31 | Polymarket deadlines | US–Iran ceasefire continues 55.5%; blockade end 31.5%; Hormuz normal 4.1%; Iran–Oman Hormuz deal 30%; E–W pipeline 78.5%; Houthis seize tanker 13%; nuclear deal 4.7% | USO straddle to Oct 30: ~12% | §3.3–3.4 | Conditional (W8) |
| **Nov 3** | Midterms (reaction Nov 4) | House D 91.5% (K); Senate D 61–62%; D/D 61.5%, R Senate/D House 30.5%, R/R 7.5% (PM) | ~0.96% | Seasonal edge absent near highs (n = 9) | No |
| ~Nov 4 | Treasury refunding | Coupons unchanged "for several quarters" (track 08) | — | — | No |
| Nov 6 / Nov 10 | October jobs / October CPI | — | CPI + Nvidia interval ~1.16% each | Same as Oct 2 / Oct 14 | No |
| **~Nov 17–19** | Nvidia Q3 FY27 (Yahoo: Nov 17 after close, unconfirmed) | Guide $108bn ±2% (company); consensus revenue ~$109bn (Yahoo) | NVDA ±5.9% (1-s.d. 7.4%); SMH ~2.8%; SPY ~0.8% | Realized: last 8 reports mean 4.0%, last 16 mean 6.7%; no 20-day drift (median +0.4%) | No (long vol overpriced) |
| Nov 30 | Polymarket deadlines | US–Iran ceasefire continues 39%; Hormuz normal 11.5%; nuclear deal 8.5% | USO straddle to Nov 20: ~15% | — | — |
| *Dec 11 (tail)* | CR expires | K: shutdown by Dec 12 22–28% | Dec 18 interval also holds payrolls, FOMC and CPI | n = 23: no lasting effect | No |
| Any day | Crash-type day | Fed emergency meeting before 2027: 4–8% (K) | VIX 16 | Uptrend crash-day rule: +6.9% over 60 days (n = 21, p 0.005) | **Yes, conditional (W10)** |

### 5.2 Setups: triggers, instruments, payoffs, invalidation

Probabilities marked [S] are subjective and are shrunk toward the market or the random-day baseline per §7. "Trigger probability" is the chance the setup even arms inside the window.

**W1 — Oct 2 payrolls.**
- *Pattern:* 2-year moves ±13bp on surprise days. No drift survives FDR.
- *Setup:* none for real money.
- *Paper:* a 1-day SPY ATM straddle (buy the Oct 1 close, expire Oct 2), to log implied (~0.65%) against realized. The 2024–26 realized mean of 1.04% suggests underpricing but cannot be verified.
- *Invalidation:* n/a.
- **No edge claimed.**

**W2 — the Sep 30 and ~Oct 20 roll traps.** Any rule keyed to "front-month Brent/WTI" must use explicit contracts (BZZ26, CLZ26) or the ETF (BNO/USO). Otherwise the system will read a −7% Brent "collapse" on Oct 1 as peace.

**W3 — Oct 14 CPI (paper).**
- *Trigger:* 2-year ≤ −6bp on the day **and** core CPI m/m ≤ 0.1%. Kalshi puts core ≤ 0.1% at ~25%; a qualifying 2-year reaction happens in ~15% of releases.
- *Instrument:* TLT Nov 20 80/83 call spread (~$0.80 at today's prices; max 3.75×; round trip 2.5%), bought at the next open, 20-day time stop.
- *History:* TLT +1.39% over 20 days after cool prints (67% up, n = 43), against a +0.33% baseline.
- *Payoff estimate* [S]: P(TLT ≥ 80.8 breakeven by Nov 20 | trigger) ~40–45%; P(full 3.75×) ~15–20%; EV ≈ 0 to +15% of premium before shrinkage.
- *Invalidation:* the 10-year back above its pre-CPI close.
- **Paper only**, because it fails FDR.

**W4 — Oct 27–30 cluster (FOMC, GDP/PCE, ECB, BoJ).**
- *Pattern:* a hold (30%) would be a dovish surprise: day-0 TLT ~+1%, gold ~+0.8%, UUP ~−0.9%, SPY ~+0.7%. No drift afterwards.
- *Setup:* none pre-event. The system's odds would equal Kalshi's.
- *After a hold:* feed track 08's Setup A trigger (2y − EFFR ≤ +50bp → longer-dated TLT structure; that is not an event trade).
- *BoJ sub-setup (paper):* BoJ hikes (28%) **and** the Fed holds (~30%). If independent, the joint probability is ~8%. Then:
  - FXY outright or CME micro yen futures, ≤1% NAV risk;
  - stop at USDJPY +1.5% from entry, target −4%, 20-day time stop;
  - analog Jul 31, 2024 (−5.7% over 20 days), n = 1.

  FXY options fail liquidity.
- **No edge claimed.**

**W5 — Nov 3 midterms.**
- Seasonal edge absent (§2.5).
- Implied election-day move (~0.96%) equals history (0.98%).
- Divided-government outcome is ~92% priced.
- **No trade.** Post-election 10-year drift (−22bp in 60 days, n = 16) is too weak to trade.

**W6 — ~Nov 17–19 Nvidia.**
- Options (±5.9%) exceed recent realized moves (4.0%, last 8), and the rule "never buy options into earnings" stands.
- *Post-event use only:* a guide below consensus, or a hyperscaler cutting 2027 capex in late-October calls, is track 08's Setup F trigger → SMH put spread with ≥45 days to expiry (the Dec 570/470 costs $22.00, max 4.55×, round trip 15%).
- It stays in the incubator until the archetype has ≥10 analogs.

**W7 — Dec 11 CR (tail).** 22–28% priced. No market effect on n = 23. **No trade.**

**W8 — Hormuz/Iran de-escalation (the main live catalyst).**
- *Trigger (all required, evaluated at the close):*
  - (i) an official announcement: US ends the blockade, a US–Iran or Iran–Oman Hormuz agreement, or a signed framework;
  - (ii) Brent December (BZZ26) or BNO down ≥6% on the day;
  - (iii) Polymarket "blockade end by Dec 31" or "Hormuz normal by Dec 31" up ≥15 points on the day, or through 75%.
- *Trigger probability:* blockade-end by Oct 31 31.5%, by Dec 31 57.6% → **~40–45% by Nov 27** [I, interpolated]. Hormuz normal by Nov 30: 11.5%.
- *Instrument (next morning):*
  - **SPY Nov/Dec call spread** (e.g. Dec 780/800, ~1.1% of spot, max 2.4×; excellent liquidity), **or**
  - DAL Dec call spread (~4.4% of spot, max 2.7×; round trip ~15%).
  - **Do not short oil after the day-0 close.**
- *History* (from the day-0 close): S&P +4.7% over 20 days (8/8 real-time anchors; +2.1% and 76% across all 17 de-escalations); airlines +3.8% to +7.0% (67–88% up).
- *Payoff estimate* [S], shrunk 75% toward the random-day baseline:
  - S&P +1.5–2.5% over 20 days: P(SPY call spread profitable at the 20-day exit) ~50–55%, expected ~+10–25% of premium;
  - DAL: P(profit) ~45–50%, expected ~0–+20%.

  Much of this is ordinary equity drift that any long call spread earns, not the event.
- *Exits:* take profit at 80% of max value; time stop at 20 trading days.
- *Invalidation:* Polymarket "US–Iran ceasefire continues" < 40%, or Brent retraces >50% of the day-0 fall (the April 2026 failure mode: +15% within 3 weeks).
- *Size:* ≤1% NAV premium, counted against the "peace" factor budget.

**W9 — escalation that removes barrels.**
- *Trigger:* credible reports (IEA/EIA/company) that ≥1 mb/d of **additional** exports is physically offline with no restoration or bypass path inside ~2 weeks. Examples: damage to the Yanbu/East–West system after its restart, Fujairah, Ras Tanura, or tanker seizures that halt Bab al-Mandab traffic. **And** front Brent/WTI up ≥5% on the day.
- *Trigger probability:* US–Iran ceasefire breaks by Oct 31 ~45% (PM), by Nov 30 ~61%. The **barrel-removing** subset is maybe **15–25%** [S].
- *Instrument (next morning):* USO Dec 165/200 call spread (~$6.15, 4.1% of spot, max 5.7×; RN P(>165) 31%). Re-price at the time: IV will be higher.
- *History:* WTI +10.3% over 5 days and +16.7% over 20 after "lasting" onsets (n = 5, 4/5 up; the blow-off-top exception was 2022-03-06).
- *Payoff estimate* [S]: conditional P(USO ≥ 171 breakeven by Dec 18) ~40–45% after shrinkage; EV modestly positive.
- *Role:* the natural **hedge** for W8 and for the book's peace-factor exposure.
- *Exits:* +100% of premium or 20 trading days.
- *Invalidation:* restoration or bypass announced, or WTI closes below the pre-event close.
- *Size:* ≤0.75% NAV premium.
- If the escalation is **fear only** (strikes without barrels lost): history says fade (WTI −10% over 20 days, n = 6), but the defined-risk fade (USO puts) is priced above historical odds (§4.5). **Paper only.**

**W10 — first uptrend crash day (any catalyst: war, bond auction, private credit, AI financing).**
- *Trigger:* the first S&P close ≤ −3% with the prior close above its 200-day MA (now +6.6% above; ≈7,200). Declustered: no other ≤ −3% close in the prior 20 sessions.
- *Trigger probability:* the base rate is ~0.6 qualifying days a year → **~13% in 60 trading days** [I]; perhaps 15–20% given today's event density [S].
- *Instrument:* SPY (or micro E-mini) outright at the next open, held 60 trading days.
  - Options right after a crash carry high IV. If options are used, buy a ≥90-day call spread and accept the cost.
- *History (1990+):* +6.9% over 60 days (median +8.8%, s.d. 7.6%, 76% up, n = 21) against a +2.2% placebo (p 0.005).
  - Losers: Feb 2020 (−9.4%), Oct 2018 (−7.6%), and three near-flat cases (1998, 2010 flash crash, Feb 2018).
  - Median worst interim −1.9%; worst −30.6%.
- *Size:* cap-bound, not Kelly-bound (§7). ≤6–7% NAV outright, so a −30% path costs ≤2% NAV.
- *Exit:* day 60, or earlier if the index regains its prior all-time high (then hand over to the core).
- *Invalidation:* none on price. The rule's edge includes riding out −10% interim drawdowns. The rule is voided if VIX >45 (hand over to the constitution's S2/VIX add-on rules) or if the 200-day filter fails at entry.

### 5.3 Where the system has no edge (explicitly)

1. **Event outcomes.** Fed decisions, CPI and payroll prints, election results, and ceasefire, blockade and nuclear-deal outcomes. Kalshi and Polymarket are the baseline; our historical data add nothing to those probabilities.
2. **Post-release drift** after FOMC, CPI and payrolls: 0 of 288 tests survive FDR.
3. **Event volatility.** CPI and Nvidia options price more than recent realized moves; the election is priced in line with history. Payrolls look underpriced but cannot be verified, and the instrument is banned.
4. **Oil after the day-0 close** of a de-escalation (no drift, large adverse excursions), and **oil headline days** in a war regime.
5. **"Buy the invasion"** in equities.
6. **Pre-positioned oil wings.** Risk-neutral tails are ~2× historical frequencies; the variance premium plus backwardation roll works against puts.
7. **Midterm seasonality in 2026** (index near highs).

### 5.4 Scenario map (track 08 weights) → which setups arm

| Scenario (3–6 months, [S] from track 08) | Weight | Likely catalysts inside 60 days | Arms |
|---|---|---|---|
| Grinding war, Fed one or two more hikes | 45% | FOMC hike, ceasefire wobbles, fear spikes | Nothing (fade urges suppressed); W10 if a crash day |
| De-escalation / Hormuz reopening path | 25% | Blockade-end announcement, pipeline restart, Iran–Oman deal | **W8**; unwind is the day-0 gap, so enter via SPY/DAL |
| Escalation / stagflation | 15% | Ceasefire collapse with new barrel losses; Brent ≥ $120 | **W9**; W10 only if the index is still above its 200-day |
| Non-oil accident (bond auction, Japan, private credit, AI financing) | 15% | ≥3% S&P day; MOVE ≥ 130; Fed emergency talk (K 4–8%) | **W10**; TLT's crash-day rally reverses within ~5 days (don't chase it) |

---

## 6. Costs and taxes for 1–60 day trades

Retail estimates; [F] where measured here, [I] or [unverified] otherwise.

| Instrument | Round-trip trading cost | Other frictions | Tax treatment (US) |
|---|---|---|---|
| SPY, TLT, GLD, IBIT (ETFs) | ~0.5–3bp (one-cent spreads: SPY 0.13bp, TLT 1.3bp, IBIT 2bp) plus 2–5bp slippage at the open [I] | IBIT expense ratio ~0.25%/yr [verify] | Short-term gains at ordinary rates (up to 37% + 3.8% NIIT + state) |
| USO, BNO, UUP | ~3–10bp [I] | USO/BNO are commodity pools: **K-1 tax forms**; roll yield ± | Ordinary rates on short-term gains; K-1 complexity |
| JETS, INDA, EIDO, DAL/UAL stock | ~5–20bp [I] | — | Ordinary rates |
| Options (2-leg spreads) [F] | SPY 0.5–1%, TLT 2.5–8%, IBIT ~3%, GLD ~7%, USO 14–19%, DAL 15%, SMH 15% of the debit; JETS, XLE, EEM, UAL, FXY 39–148% (unusable) | Commissions ~$0.50–0.65 per contract per leg [unverified; broker-specific]; early-exercise and pin risk near expiry | ETF options (SPY, TLT, USO, IBIT) are **not** Section 1256 → ordinary rates. **SPX/XSP index options are Section 1256** (60/40, max blended ~26.8%) |
| Micro futures (MES, MCL, micro yen) | ~1–3bp of notional (1 tick ≈ 0.3bp MES, ~1bp MCL) plus ~$0.5–1.5 per side commission [unverified] | Margin; daily mark-to-market; **gap risk: not defined-risk** | **Section 1256** (60/40) — the most tax-efficient short-horizon wrapper |
| Spot crypto | ~0.4–1.2% round trip on retail venues at low tiers [unverified] vs IBIT ~2bp | Custody | Property; short-term gains at ordinary rates |

**Implications** [I]:
- For a 1–60 day holding period, the cheapest expressions are **SPY/SPX options, TLT options, micro futures and IBIT**.
- USO options cost 14–19% of the debit to trade. A USO structure therefore needs ≥30% expected gain on premium just to clear costs at a 2× cost hurdle.
- In a taxable account, prefer **XSP/SPX (1256)** over SPY options for W8/W10 when a liquid equivalent exists.
- Paper trading should still **book these costs at the ask/bid actually quoted** at the time of the email.

---

## 7. Implications for the system design

Concrete, testable rules. Parameters are starting values to be frozen for the paper-trading phase and reviewed monthly.

### 7.1 Event classes and default stance

**R1 — Scheduled releases (FOMC, CPI, payrolls, GDP, PCE, ECB, BoJ).**
- **Never** take a directional position *into* the release when the system's probability is within ±10 points of the Kalshi/Polymarket price. That is always the case unless the system has a documented information source.
- **Never** trade the post-release drift for real money: 0 of 288 tests survive FDR.
- **Paper-log** every release. Record:
  - the market-implied probability;
  - the options-implied SPY and TLT event moves;
  - the realized day-0 move;
  - forward moves at 1, 5 and 20 days.
- Promote a post-release rule (e.g. W3) to live only after ≥24 paper instances with a mean excess of t ≥ 2 **net of costs**, and after it passes BH-FDR together with every rule tested alongside it.

**R2 — Geopolitical onset.**
- **No equity trade** on the onset itself ("buy the invasion" has no edge; p 0.72–0.85).
- **Oil.** Within 24 hours classify the event as *lasting disruption* or *fear*. "Lasting" means ≥1 mb/d of additional exports physically offline with no bypass or repair path within ~14 days, per IEA/EIA/company statements; anything else is "fear".
  - Lasting → W9 (USO call spread, ≥45 days to expiry, ≤0.75% NAV premium, 20-day time stop).
  - Fear → **no trade** (paper-log the fade).
- **Gold spike fade:** paper only until n ≥ 10 (today n = 8).

**R3 — De-escalation (W8).**
- **Forbidden:** new oil shorts or put spreads after the day-0 close. History shows zero drift, a median +8.6% adverse excursion, and failed de-escalations in 2024 and twice in 2026.
- **Allowed:** SPY/XSP or DAL call spreads the next morning, 45–75 days to expiry, ≤1% NAV premium; exit at 80% of max value or 20 trading days.
- **Invalidation:** ceasefire odds < 40% (Polymarket), or oil retraces >50% of its day-0 fall.

**R4 — Uptrend crash-day rule (W10).**
- *Trigger:* the first S&P close ≤ −3% (declustered over 20 sessions) with the prior close above the 200-day MA.
- *Action:* buy SPY, or MES in a taxable account, at the next open; hold 60 trading days; ≤6.7% NAV so that a −30% path costs ≤2% NAV.
- *Skip* if the prior close was below the 200-day MA (edge 0.0%), or if VIX > 45 (the constitution's VIX add-on governs).
- *Test:* the out-of-sample hit rate and mean 60-day excess are tracked. Demote after 5 consecutive losers or if the 1990+ sample's p rises above 0.10 with new data.

**R5 — Calendar tilts.**
- Midterm seasonality applies **only** if the S&P is >5% below its 52-week high on Sep 28 of a midterm year. **Off in 2026.**
- The first-hike "S&P weak for 60 days" pattern (5/5) is a **warning flag only** (n = 5): it forbids *adding* discretionary index longs without a W10 trigger before ~Dec 10, 2026. It is not a short signal.
- Shutdown deadlines: **no trade** (n = 23; p 0.61–0.88).

### 7.2 Holding periods, instruments, liquidity

**R6 — Holding periods by pattern:**

| Pattern | Holding period |
|---|---|
| De-escalation equities (W8) | 20 trading days |
| Barrel-loss oil (W9) | 20 |
| Uptrend crash (W10) | 60 |
| Cool-CPI TLT (W3, paper) | 20 |

No position is opened with less than 2× its holding period left to expiry.

**R7 — Amend constitution gate 6 for this sleeve.** Option expiry must be ≥ max(2 × holding period, 30 days to expiry), and positions close ≥10 trading days before expiry. The 9-month minimum is incompatible with 1–60 day trades. The **ban on weekly and 0DTE options stays**; the payroll straddle is paper only.

**R8 — Liquidity gate from live quotes:**
- Each leg: bid-ask ≤10% of mid **and** open interest ≥500.
- Whole structure: round trip ≤10% of the debit, or ≤20% if expected gain ≥2× costs.
- Today this passes SPY, TLT, IBIT, GLD and IWM; USO, DAL and SMH are borderline; JETS, XLE, EEM, UAL, FXY and INDA/EIDO fail.
- If a leg fails, re-express via the ETF or stock outright with a stop sized to R9, or via micro futures.

### 7.3 Sizing

**R9 — Fractional Kelly on shrunk probabilities, then caps; caps usually bind.**
- *Shrinkage:* p_shrunk = p_base + κ·(p_hist − p_base).
  - κ = 0.5 for n ≥ 20 with a surviving placebo test (W10);
  - κ = 0.25 for 10 ≤ n < 20 (W8 equities);
  - n < 10 → paper only (W9's n = 5 is the exception, sized as a hedge at ≤0.75% NAV premium).

  p_base is the random-day baseline for rule-based setups, or the market-implied (risk-neutral or prediction-market) probability for event-outcome bets.
- *Worked example, W10* [I]:
  - Shrunk 60-day mean = 2.2% + 0.5 × (6.9% − 2.2%) = 4.6%, or ~3.6% over bills.
  - σ_60d is 7.6% in-sample (9.4% unconditional).
  - Quarter-Kelly ≈ 0.25 × 0.036 / σ², with σ between 7.6% and 9.4%, ≈ 1.0–1.6× NAV.
  - **The cap of 6.7% NAV (a −30% path costs −2% NAV) binds by a factor of 15–20.**
- *Option spreads:* premium ≤1% NAV per trade and ≤3% per macro factor (track 08 §7.2). Airlines, INDA, EM, small caps, TLT, gold upside and USO puts are **one factor in 2026** (β to USO −0.1 to −0.6; §4.4).

### 7.4 When never to trade

**R10 — Blocklist:**

| # | Don't trade when… |
|---|---|
| (a) | …the thesis is the event outcome and the system's probability is within ±10 points of the market's |
| (b) | …the target asset has already moved ≥2 s.d. on day 0 in the thesis direction (oil ≥8% on a de-escalation or escalation day): trade the laggard or nothing |
| (c) | …the analog set has n < 10 (paper only) |
| (d) | …the trade would push the peace/oil-down factor above its 3% premium or 2% stop-risk budget |
| (e) | …round-trip costs exceed 20% of the expected gain |
| (f) | …the trigger reads a continuous futures series across a roll (Brent Nov expiry Sep 30: −7%; WTI Nov ~Oct 20: −3.8%) or a stale FRED print (spot oil lags 3–5 days) |
| (g) | …the setup relies on vendor IVs or quotes after 16:00 ET without re-pricing at the open |

### 7.5 Data and monitoring

**R11 — Dashboard additions** (event layer on top of track 08 §7.3):
- Explicit-month Brent/WTI (BZZ26, CLZ26), the Dated Brent–futures spread, and M1–M2.
- Polymarket: US–Iran ceasefire continues (Oct 31, Nov 30); blockade end (Oct 15, Oct 31, Dec 31); Hormuz normal (Nov 30, Dec 31); East–West pipeline restart; Iran–Oman deal; Houthi tanker seizure.
- Kalshi: FEDDECISION, PAYROLLS, U3, CPI, CPICORE, CPIYOY, GDP, GOVTSHUTDOWN, WTI (monthly and weekly), FEDMEET.
- The SPY event-variance decomposition each morning (script `analyze_implied17.py`).
- S&P distance to its 200-day MA (W10 armed flag).
- 2026 rolling 60-day betas to USO (the factor map).

### 7.6 Monthly calibration

**R12 — Calibration loop:**
- Each month, score:
  - (i) the market-implied vs the system's probabilities (Brier/log score);
  - (ii) the realized/implied event-move ratio per event type. Promote a volatility-buying rule only if the ratio is >1.2 with t > 2 over ≥24 events, **and** the instrument is allowed;
  - (iii) each W-rule's paper P&L against its pre-registered payoff range;
  - (iv) trigger efficacy: forward returns after triggered vs untriggered dates.
- Freeze the κ and cap parameters for the first 6 months of paper trading.

---

## 8. Reproducibility and sources

**Code** (`research/code/17-short-macro/`; cache in the session scratchpad `17-short-macro/`):

| Script | Purpose |
|---|---|
| `lib17.py` | Event alignment, forward returns, era-matched placebo, BH-FDR, asset panel |
| `fetch_data17.py` | yfinance adjusted closes (42 tickers, ^GSPC from 1927); FRED; FOMC dates (federalreserve.gov); CPI/NFP release dates (BLS archive) |
| `fetch_implied17.py` | Kalshi and Polymarket snapshots; yfinance option chains (21 underlyings) |
| `event_lists17.py` | Curated onsets, de-escalations, oil shocks, unwinds, crashes, shutdowns, Fed/BoJ actions, midterm dates |
| `analyze_scheduled17.py` | FOMC/CPI/NFP buckets, pre-FOMC drift, first/second hikes, emergency cuts, event-day \|moves\|, midterms (with conditioning), shutdowns, BoJ |
| `analyze_shocks17.py` | Geopolitical, de-escalation, oil-shock and crash studies |
| `analyze_oil_unwind17.py` | Unwind paths, tradable-after-day-0 analysis, onset class split, war-regime headline days |
| `analyze_implied17.py` | SPY event-variance decomposition, term structures, structure pricing and liquidity, USO risk-neutral vs empirical, Nvidia |
| `robustness17.py`, `betas17.py`, `tables17.py`, `report_tables17.py` | Recent-regime event moves, crash regime/period split, 2026 betas, baseline table, markdown tables |

Run order: `fetch_data17.py` → `fetch_implied17.py` → `analyze_shocks17.py` → `analyze_scheduled17.py` → `analyze_oil_unwind17.py` → `analyze_implied17.py` → `robustness17.py` → `betas17.py` → `tables17.py` → `report_tables17.py`.

**Primary data (retrieved 2026-09-28):**
- Yahoo Finance via yfinance (prices; option chains at 16:14 ET).
- FRED: DGS2, DGS10, DTB3, DCOILWTICO, DCOILBRENTEU, DFEDTAR/DFEDTARU, CPIAUCSL.
- Federal Reserve FOMC historical pages and calendar (federalreserve.gov/monetarypolicy).
- BLS archived news releases and 2026 schedules (bls.gov: `cpi.htm`, `empsit.htm`); BEA release schedule (bea.gov/news/schedule).
- Kalshi public API (api.elections.kalshi.com/trade-api/v2) and Polymarket gamma API (gamma-api.polymarket.com), snapshots ~22:15 UTC.
- Yahoo earnings calendar for Nvidia (the Nov 17 date is an estimate).

**Literature** (not re-checked in this session; used for method and context only):
- Kuttner (2001), *J. Monetary Economics*: futures-based policy surprises.
- Bernanke & Kuttner (2005), *J. Finance*: stock reaction to Fed surprises.
- Lucca & Moench (2015), *J. Finance*: pre-FOMC drift, re-tested here.
- Cieslak, Morse & Vissing-Jorgensen (2019), *J. Finance*: the FOMC cycle.
- Savor & Wilson (2013), *JFQA*: announcement-day premium.
- Kilian (2009), *AER*: oil supply vs precautionary demand shocks.
- Caldara & Iacoviello (2022), *AER*: the geopolitical risk index.
- Benjamini & Hochberg (1995), *JRSS B*: false-discovery rate.
- Hirsch, *Stock Trader's Almanac*: the presidential cycle.
- CRS reports RS20348 / RL34680: funding-gap list.

**Secondary / unverified items:**
- The 2026 war chronology (Feb 28 onset, Apr 8 ceasefire, June memorandum, Jul 8 collapse) comes from track 08's sources (Wikipedia pages on the 2026 Iran war and the oil-market chronology). The dates are approximate and the June anchor lags the market.
- Hormuz traffic at ~15% of normal (track 08; press).
- The BoJ hike on 2025-12-19 and the date of the June 2026 hike.
- The Nvidia report date (Yahoo estimate).
- The Treasury refunding date (~Nov 4).
- Broker commissions and crypto venue fees.
- The IBIT expense ratio.
- The CRS shutdown dates for 1976–1990 (±1 day).

**Disclosure:** written by Claude (Anthropic). No trade here involves Anthropic.
