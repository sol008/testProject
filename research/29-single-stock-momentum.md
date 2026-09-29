# Track 29 — Single-stock momentum with at most one new pick a week

*29 September 2026. Research round on the owner's new objective: "exceed SPY by a large margin", at most one recommendation a week. This track tests concentrated single-stock momentum books (4–12 names, one new pick a week, each position held ≤60 days or continued when re-decided). Code: `code/29-stock-momentum/` (`python run_all.py`).*

## TL;DR

1. **The bias-free record doesn't support +5 points a year.** Ken French's data (CRSP, 1927–2026) shows large-cap momentum winners beat the market by +2.6 points a year at today's costs. That fell to +1.0 after 1990 and +0.3 after 2010. The top decile, which leans smaller and trades more, beat it by +5.7, +3.5 and +2.3 points.
2. **Our weekly one-pick book (12-1 momentum, 8 names, point-in-time S&P 500) beat SPY by +3.9 points a year over 2000–2026.** About 2 points of that is survivorship bias, so about +2 is real. The whole edge came from 2024–2026: over 2000–2023 it was +0.5 before the bias correction. Its worst drawdown was −68%, against −55% for SPY. The same rule run on today's constituents shows **+23 points: that's the bias, not skill.**
3. **Ten-year outcomes against SPY, bias-corrected, 8 names:**
   - block bootstrap: median ≈ +2 points, 10th–90th percentile ≈ −7 to +12;
   - the actual rolling 10-year windows: median ≈ −3 points;
   - about a 50% chance of a ≥50% drawdown in any 10 years.
4. **Live momentum funds net of fees:** a median of **+0.4 points a year** across eight funds, from −3.7 (QMOM, the concentrated fund) to +4.3 (SPMO; t = 1.5). None is statistically distinguishable from SPY.
5. **The two levers make it worse or dangerous.**
   - The trend filter halves drawdowns but lowers the long-run return.
   - 2× leverage (margin or daily single-stock ETFs) raises the median only on the 1927–2026 record. It brings a 79–99% chance of a ≥50% drawdown within 10 years. It was a −97% wipe-out in 1929–32. On our 2000–2026 book, 2× margin had a lower CAGR than 1×.

**Recommendation: none credible.** No single-stock rule here credibly beats SPY by +5 points a year after costs and bias. If you still want the exposure:
- run the pre-registered base rule (§4) as a paper-only shadow for ≥3 years; or
- hold one momentum ETF (SPMO) in the IRA as a satellite, expecting about +0–2 points, not +5.

---

## 1. The question and how it was tested

The owner's target is SPY + 5 points a year or more: the median over 5–10 years, after costs. The design allows at most one new recommendation a week, and each email has at most 3 orders (design §3a.3). This track asks whether concentrated momentum in single stocks meets that target.

It uses three sources of evidence, from most to least trustworthy:

| Evidence | What it is | Bias |
|---|---|---|
| **Ken French / CRSP portfolios, 1927–2026** | Top-decile momentum (all stocks) and the "big × top-momentum" portfolio from the 5×5 size-momentum sort (NYSE breakpoints; median 52 stocks, range 5–221). This is the bias-free analogue of "top-quintile S&P 500 momentum" | None: includes every delisted stock |
| **Live momentum funds (2005–2026)** | MTUM, SPMO, QMOM, XMMO, PDP, JMOM, VFMO, MMTM, from Yahoo adjusted closes (net of fees) | None: real money after publication |
| **Our weekly stock-level backtest, 2000–2026** | A point-in-time S&P 500 membership list (Clenow + Wikipedia changes, `github.com/fja05680/sp500`, pinned) with Yahoo prices for 765 of 1,188 historical members | **Residual survivorship bias: delisted members are missing** (§3) |

**No look-ahead.**
- Signals use closes up to and including Friday.
- Orders fill at the next session's open (adjusted open price).
- The Ken French portfolios are formed at month end on returns t−12..t−2.

**Costs.**
- 0.10% per side on every fill (retail, opening auction, S&P 500 names), with sensitivity runs at 0.25% and 0.50%.
- The Ken French series are charged turnover × 2 × cost. We measured one-way turnover on our panel: 25% a month for the top quintile and 29% for the top decile.
- The "era" cost schedule is the one investors of the time paid (Jones 2002-style): 1.0% per side before 1975, 0.5% in 1975–89, 0.25% in 1990–2000, 0.15% in 2001–09 and 0.10% from 2010.

---

## 2. Q1 — What large-cap momentum earned over the market (bias-free, Ken French)

The figures are CAGR differences against the CRSP value-weighted market (SPY's stand-in, with no fee), in points a year.
- "Net today" charges today's retail costs in every month: what the premium is worth to the owner now.
- "Net era" charges the costs of the time.
- t is the t-statistic of the mean monthly excess, before costs.

| Portfolio | 1927–2026 gross / net today / net era (t) | 1990–2026 gross / net today (t) | 2010–2026 gross / net today (t) | Max drawdown, 1927–2026 (market −84%) |
|---|---|---|---|---|
| Top decile, value-weighted | +6.5 / **+5.7** / +1.6 (5.4) | +4.3 / **+3.5** (2.3) | +3.1 / **+2.3** (1.2) | −76% |
| Top decile, equal-weighted | +8.8 / +8.0 / +3.8 (6.6) | +4.8 / +4.0 (2.4) | −1.3 / −2.1 (0.1) | −73% |
| **Big × top-momentum quintile, value-weighted** ("large-cap winners") | +3.2 / **+2.6** / −0.8 (3.4) | +1.7 / **+1.0** (1.2) | +1.0 / **+0.3** (0.6) | −77% |
| Big × top-momentum quintile, equal-weighted | +4.0 / +3.3 / −0.1 (4.4) | +2.1 / +1.4 (1.5) | +0.5 / −0.1 (0.4) | −76% |
| Market CAGR | 10.3% | 11.0% | 14.3% | |

**Reading.**
- Momentum is one of the most robust premia in the century-long data: t = 5.4 for the top decile.
- **But the large-cap version is small**, about +1 to +3 points net. It has decayed since publication (Jegadeesh-Titman 1993) and is **statistically indistinguishable from zero after 2010** (t 0.6–1.2).
- Before 1975, trading costs ate it entirely. The top decile's larger premium comes from smaller, costlier stocks; its large-cap part is the "big winners" row.

**Momentum crashes.** These are compounded returns over each window. "Winners" is the top decile, value-weighted.

| Window | Market | Winners | Big winners | Winners − market | UMD (long-short) |
|---|---|---|---|---|---|
| 1929–32 bear (Sep 29–Jun 32) | −84% | −70% | −75% | +14 | +120% |
| **1932 rebound (Jun–Aug 1932)** | **+82%** | +32% | +42% | **−50** | **−74%** |
| 1933 junk rally (Apr–May 1933) | +69% | +53% | +52% | −16 | −22% |
| 2000–02 bear | −45% | −48% | −43% | −3 | +35% |
| 2008 crash (Sep 08–Feb 09) | −42% | −44% | −42% | −3 | +13% |
| **2009 rebound (Mar–May 2009)** | **+26%** | +7% | +8% | **−19** | **−49%** |
| 2009 calendar year | +29% | +10% | +13% | −19 | −53% |
| 2020 COVID crash (Feb–Mar) | −20% | −16% | −17% | +5 | +8% |
| 2020 vaccine rotation (Nov 2020) | +13% | +10% | +10% | −2 | −13% |
| Nov 2020–Mar 2021 | +25% | +9% | +11% | −16 | −23% |
| 2022 bear (Jan–Sep) | −25% | −24% | −23% | +1 | +12% |

The crashes follow Daniel and Moskowitz (2016):
- **Long-only winners don't crash more than the market in the bear market.**
- **They miss the violent rebound after it,** by 50 points in three months in 1932 and 19 points in 2009.
- The worst 12 months relative to the market were −40 points (to May 1933).
- The long-short factor lost 74% in three months in 1932 and 49% in 2009. That is why nobody should short the losers here.

Files: `results/kf_q1_table.csv`, `results/kf_crashes.csv`.

---

## 3. The survivorship bias: measured and bounded

**Coverage.** Yahoo has prices for only the S&P 500 members that still trade. Share of point-in-time members with Yahoo data:

| Year | 1998 | 2000 | 2005 | 2010 | 2015 | 2020 | 2026 |
|---|---|---|---|---|---|---|---|
| Coverage | 41% | 45% | 51% | 63% | 73% | 88% | 99% |

The missing names are the bankrupt and the acquired: Enron, WorldCom, Lehman, Bear Stearns, Countrywide, WaMu and hundreds of takeovers. Several of them were momentum winners before they fell.

**Three measurements of the bias:**

| Test | Window | Biased result | Bias-free benchmark | Bias |
|---|---|---|---|---|
| Equal-weight S&P 500, point-in-time members with data | 2003-06 to 2026-08 | 12.2% | RSP (the real equal-weight ETF, every delisted member included, net of fees): 10.7% | **+1.5 points a year** |
| Equal-weight S&P 500, today's members | 2003-06 to 2026-08 | 17.0% | RSP 10.7% | **+6.3 points a year** |
| Monthly top-quintile 12-1 momentum, point-in-time members | 2000-01 to 2026-08 | 11.2% | Ken French big winners: 9.6% (equal-weighted), 9.0% (value-weighted) | **+1.6 to +2.2 points a year** |
| Monthly top-decile 12-1 momentum, today's members | 2000-01 to 2026-08 | 22.1% | Ken French top decile: 10.6% | **+11.5 points a year** |
| **Our weekly one-pick book (base rule), today's members vs point-in-time** | 2000-01 to 2026-09 | +23.1 points over SPY | +3.9 points (point-in-time) | **+19 points a year** |

**Correction used below:** point-in-time results are cut by **−2 points a year** (measured range −1.5 to −2.2). For concentrated books the true bias may be larger, because a missing Enron or Lehman would have been held at 1/8 of the book, not 1/100. So −2 is a floor, not a ceiling.

**A backtest on today's constituents is worthless here.** It turns a +2-point strategy into a +23-point one. Any backtest of this kind that reaches the owner, from anyone, should be checked for exactly this.

Files: `results/bias_*.csv`.

---

## 4. The weekly one-pick book (≤1 new pick a week, 4–12 names)

**Rule (engine `engine29.py`; the pre-registered base is the first line of each parameter):**
- **Universe:** S&P 500 members on that Friday (point-in-time). Variant: the 50 largest by 63-day dollar volume ("mega").
- **Signal**, ranked every Friday at the close:
  - 12-1 month return (base);
  - 6-1;
  - 52-week-high proximity (George-Hwang);
  - "frog-in-the-pan" smooth momentum (the smoothest names inside the top quintile by 12-1; Da-Gurun-Warachka);
  - residual (market-adjusted, standardized) momentum (Blitz-Huij-Martens);
  - risk-adjusted 12-1 (divided by volatility, like MTUM);
  - a combination of 12-1, 52-week high and residual momentum.
- **Book:** K = 4, **8** or 12 equal slots.
  - At most 1 buy a week, and at most 3 orders a week including sells.
  - The buy is the top-ranked stock not held that has positive 12-1 momentum, sized at min(cash, equity/K).
  - Idle cash earns T-bills.
- **The 60-day cap:** at the last weekly email before entry + 60 calendar days, each position is re-decided. It **continues**, with the clock restarting, if it still ranks in the top 10% of the universe; otherwise it is sold. Sells use market orders at the open; there are no stop orders.
- **Trend filter** (SPY vs its 200-session average at the Friday close):
  - **none** (base);
  - **entry**: no buys and no continuations while SPY is below;
  - **exit**: entry, plus sell up to 3 names a week, weakest first.

**Headline, 2000-01-10 to 2026-09-28** (0.10% per side; SPY 8.3% a year, max drawdown −55%):

| Rule | CAGR | Excess over SPY, raw → **bias-corrected** | Vol | Beta | Max DD | Entries a year | Median hold |
|---|---|---|---|---|---|---|---|
| **Base: 12-1, 8 names, point-in-time S&P 500** | 12.1% | +3.9 → **≈ +1.9** | 32% | 1.22 | **−68%** | 12 | 168 days (76% of re-decisions continued) |
| Base, 2000–2023 only | 7.4% | +0.5 → **≈ −1.5** | | | | | |
| Base, 2010–2023 only | 12.6% | −0.4 → **≈ −2.4** | | | | | |
| 12-1, 4 names | 10.8% | +2.5 → ≈ +0.5 | 36% | 1.18 | −85% | 6 | 224 days |
| 12-1, 12 names | 10.0% | +1.7 → ≈ −0.3 | 29% | 1.16 | −69% | 19 | 168 days |
| 12-1, 8 names, trend entry | 12.9% | +4.6 → ≈ +2.6 | 25% | 0.72 | −49% | 11 | 168 days |
| 12-1, 8 names, trend exit | 11.5% | +3.3 → ≈ +1.3 | 23% | 0.56 | −39% | 13 | 113 days |
| 6-1, 8 names | 17.0% | +8.7 → ≈ +6.7 | 31% | 1.20 | −74% | 21 | 112 days |
| 12-1, 8 names, mega-cap top 50 | 13.7% | +5.4 → ≈ +3.4 | 30% | 1.18 | −65% | 27 | 56 days |
| Best of 126 cells: mega, 12-1, 4 names, trend entry | 22.2% | +13.9 → ≈ +11.9 | 29% | 0.76 | −45% | 9 | 111 days |
| *Same base rule on today's constituents (biased)* | *31.4%* | *+23.1* | *38%* | *1.35* | *−67%* | *10* | *224 days* |
| Cost sensitivity: base at 0.25% / 0.50% per side | 11.7% / 10.9% | +3.4 / +2.6 | | | | | |

**Across the full grid of 126 point-in-time variants** (7 signals × K 4/8/12 × 3 filters × 2 universes), raw:
- S&P 500 universe: median +1.8 points; 71% beat SPY; 21% by ≥5 points; median max drawdown −44%.
- Mega-cap universe: median +4.4 points; 90% beat SPY; 38% by ≥5 points.
- After the −2-point correction, the medians are about −0.2 and +2.4.

By signal (median over both universes):

| Signal | Median excess (raw) |
|---|---|
| 6-1 | +4.8 |
| risk-adjusted | +4.5 |
| combination | +4.4 |
| residual | +3.6 |
| 12-1 | +3.3 |
| frog-in-the-pan | +0.7 |
| 52-week high | −1.6 |

Fewer names earned more but swung harder: K = 4 had a median of +4.9, K = 8 +3.4, K = 12 +1.6.

**Why the best cells are not credible.**
- The books' tracking error against SPY is about 20% a year, so a 26.7-year mean excess has a standard error of about ±3.9 points.
- The best of about 126 correlated variants (roughly 20–30 independent ones) is expected to sit **+8 to +9 points above its true value by luck alone**.
- A +12-point corrected best is consistent with a true edge of +3–4.
- The mega-cap cells also ride one regime, the mega-cap tech decade of 2015–2026. The century data don't show that regime as a general rule: big-stock winners earned +1.0 points after 1990.

**It is lumpy.** The base rule beat SPY in 18 of 27 calendar years. The totals came from a few years:
- **2024 alone: +59 points**, from AI and momentum names;
- 2026 to date: +42;
- 2005: +41.

It lost 41 points in 2009 (the momentum crash), 24 in 2021 and 21 in 2023.

**What the book would hold today** (28 Sep 2026 close, base rule): GEV, WDC, STX, SNDK, LITE, CIEN, MU and INTC. Seven of the eight are one theme, AI data-centre hardware (memory, storage, optical, chips), and the eighth is GE Vernova, which powers the same build-out. So the concentrated single-stock momentum book is, in practice, a **sector bet**, and design §5 bans sector rotation.

Files: `results/grid.csv`, `results/base_calendar_years.csv`.

---

## 5. Q2 — The distribution of 5- and 10-year outcomes versus SPY

Excess CAGR against SPY, in points a year. Positive means the book beat SPY.

| Rule and method | Years | 10th pct | **Median** | 90th pct | P(beat SPY) | P(beat by ≥5) | Median max DD | P(DD ≥ 50%) |
|---|---|---|---|---|---|---|---|---|
| **Base (8 names), block bootstrap of 2000–26 weekly pairs, raw** | 10 | −5.2 | **+4.0** | +14.0 | 72% | 45% | −51% | **51%** |
| Same, **bias-corrected (−2)** | 10 | **≈ −7** | **≈ +2** | **≈ +12** | ≈ 60% | ≈ 30% | −51% | 51% |
| Base, the **actual** rolling 10-year windows (875 weekly starts), raw | 10 | −6.8 | **−0.6** | +5.1 | 46% | 10% | | |
| Base, actual rolling 5-year windows, raw | 5 | −11.5 | +2.2 | +15.4 | 59% | 35% | | |
| Base with **pick luck** (random choice among the top 5 each week, 100 seeds), actual 10-year windows | 10 | −8.7 | −2.9 | +3.0 | 27% | 5% | | |
| Base with pick luck, full 2000–2026 | 26.7 | −1.1 | +0.8 | +3.4 | 69% | 3% | | |
| 4 names, bootstrap, raw | 10 | −10.6 | +2.5 | +16.7 | 59% | 41% | −61% | 68% |
| 12 names, bootstrap, raw | 10 | −6.2 | +1.9 | +10.6 | 62% | 32% | −51% | 51% |
| 8 names + trend exit, bootstrap, raw | 10 | −4.4 | +3.3 | +11.1 | 70% | 38% | −32% | 4% |
| Mega-cap top 50, bootstrap, raw | 10 | −4.0 | +5.5 | +16.3 | 77% | 52% | −52% | 53% |
| Mega-cap top 50, actual rolling 10-year windows, raw | 10 | −0.6 | +3.4 | +8.6 | 85% | 32% | | |
| **Bias-free long run: Ken French big winners net at today's costs + stock-specific noise for 8 names, 1927–2026 bootstrap** | 10 | **−3.7** | **+2.1** | **+8.3** | 67% | **26%** | −39% | 28% |
| Same, 1990–2026 | 10 | −5.0 | +0.5 | +6.1 | 54% | 16% | −34% | 20% |
| Same, 4 names, 1927–2026 | 10 | −5.8 | +1.5 | +9.3 | 61% | 27% | −43% | 34% |

**How to read it.**
- The pick-luck row shows that the base rule's specific rank-1 picks were luckier than the typical near-top pick: +3.9 points against a +0.8 median.
- The bias-free century model puts the chance of beating SPY by ≥5 points over a decade at **about 1 in 4**. The concentrated book also carries a 20–50% chance of a ≥50% drawdown.
- The block bootstraps overstate the median, because they resample 2000–2026, which contains the 2024–26 windfall. The actual rolling windows are the sobering row.

Files: `results/dist_outcomes.csv`, `results/kf_bootstrap.csv`, `results/kf_rolling.csv`.

---

## 6. Q3 — Do live momentum funds beat SPY? (net of fees, since inception, to 28 Sep 2026)

| Fund | Since | Years | CAGR | SPY, same window | **Excess** | t | 36-month windows ahead | Max DD (SPY) |
|---|---|---|---|---|---|---|---|---|
| SPMO (S&P 500 Momentum, 0.13%) | 2015-10 | 11.0 | 19.1% | 14.8% | **+4.3** | 1.46 | 71% | −31% (−34%) |
| MTUM (MSCI USA Momentum, 0.15%) | 2013-04 | 13.4 | 15.9% | 14.6% | **+1.3** | 0.67 | 60% | −34% (−34%) |
| JMOM (JPMorgan, 0.12%) | 2017-11 | 8.9 | 15.8% | 14.8% | +1.0 | 0.67 | 54% | −34% (−34%) |
| XMMO (mid-cap momentum, 0.34%) | 2005-03 | 21.6 | 11.8% | 10.9% | +0.8 | 0.71 | 53% | −55% (−55%) |
| XMMO, after its July 2019 index change | 2019-07 | 7.2 | 14.3% | 15.7% | −1.4 | −0.14 | 63% | −37% (−34%) |
| VFMO (Vanguard, active, 0.13%) | 2018-02 | 8.6 | 14.4% | 14.5% | −0.1 | 0.18 | 37% | −37% (−34%) |
| MMTM (S&P 1500 Momentum Tilt, 0.12%) | 2012-10 | 13.9 | 14.1% | 14.9% | −0.7 | −0.65 | 47% | −34% (−34%) |
| PDP (Dorsey Wright, 0.62%) | 2007-03 | 19.6 | 9.7% | 11.1% | −1.4 | −0.45 | 32% | −59% (−55%) |
| **QMOM (concentrated, about 50 stocks, 0.29%)** | 2015-12 | 10.8 | 11.0% | 14.7% | **−3.7** | −0.42 | 34% | −39% (−34%) |

- **Median +0.35 points a year; none has t > 1.5.**
- The concentrated fund (QMOM), the closest thing to what the owner is asking for, lagged by 3.7 points a year. It had the highest tracking error (14%).
- The one fund near +5 (SPMO) is a cap-weighted S&P 500 momentum tilt, whose excess came largely from mega-cap tech. That's the same regime that made our mega-cap cells look good.
- AQR's Large Cap Momentum fund (AMOMX, 2009) has no Yahoo history and was not checked.

File: `results/etf_live.csv`.

---

## 7. Q4 — Trend filter and leverage: large-margin winner or ruin risk?

**The trend filter is a risk control, not a return engine.**

| Book | Period | CAGR | Excess | Max DD |
|---|---|---|---|---|
| Big winners, net (Ken French) | 1927–2026 | 12.9% | +2.6 | −77% |
| Same + 10-month market trend filter (T-bills when down) | 1927–2026 | 11.3% | +1.0 | **−48%** |
| Big winners, net | 1990–2026 | 12.1% | +1.0 | −51% |
| Same + trend filter | 1990–2026 | 10.7% | −0.3 | **−22%** |
| Big winners, net | 2010–2026 | 14.6% | +0.3 | −26% |
| Same + trend filter | 2010–2026 | 8.6% | **−5.7** (whipsaws: 2011, 2015–16, 2018, 2020, 2023) | −19% |
| Weekly one-pick book, 8 names: none / entry / exit filter | 2000–2026 | 12.1 / 12.9 / 11.5% | +3.9 / +4.6 / +3.3 raw | −68 / −49 / −39% |

**Leverage buys a higher median at a high chance of a ≥50% drawdown, and 1929–32 was a wipe-out.**

| Book | Period | CAGR | Max DD | Margin-call periods* | 10-year bootstrap: median / 10th / 90th pct excess | P(DD ≥ 50%) within 10 years |
|---|---|---|---|---|---|---|
| Big winners, net, 1× (Ken French, 8-name noise) | 1927–2026 | 12.9% | −77% | 0 | +2.1 / −3.7 / +8.3 | 28% |
| **Same, 2× margin** (T-bill + 1.5%) | 1927–2026 | 16.5% | **−97%** | 8 months | **+6.5** / −7.3 / +21.4 | **79%** (P ≥ 80% DD: 25%) |
| Same, 2× margin + trend filter | 1927–2026 | 15.8% | −79% | 4 | +5.2 / −6.8 / +18.0 | 56% |
| Same, 3× margin | 1927–2026 | 14.1% | −100% (ruined) | 30 | | |
| Weekly book, 1× | 2000–2026 | 12.2% | −67% | 1 week | +4.3 / −4.9 / +14.1 (raw) | 50% |
| **Weekly book, 2× margin** | 2000–2026 | **9.6%** (below 1×) | **−94%** | 1 week | +2.2 / −18.3 / +26.3 | **99%** |
| Weekly book + trend exit, 2× margin | 2000–2026 | 13.7% | −71% | 0 | +5.9 / −8.2 / +21.3 | 85% |
| **Each pick as a daily-reset 2× single-stock ETF** (1% fee + 1% financing) | 2000–2026 | **1.3%** | **−98%** | 13 weeks (≥25% book loss) | −5.9 / −25.4 / +17.3 | **100%** |
| Mega-cap book, 2× single-stock ETFs | 2000–2026 | 16.1% | −95% | 7 weeks (≥25% book loss) | +8.2 / −13.7 / +33.9 | 99% |
| SPY, 2× margin | 2000–2026 | 9.6% | −87% | 0 | +2.0 / −6.4 / +10.5 | 79% |

\* For the 1927–2026 rows: months in which the unlevered book lost more than 33%, which puts a 2× margin account below Reg-T 25% maintenance. For the 2000–2026 margin rows: weeks in which the unlevered book lost ≥25%, a 50% loss at 2×. Monthly and weekly data understate intra-period breaches.

**Verdict on Q4.**
- On the century-long record, 2× leverage lifts the median 10-year excess to about +5 to +6.5 points, which is the owner's target.
- But the odds of a ≥50% drawdown within any decade are **56–79%**, with margin calls in the bad months. On 1929–32 it was a −97% wipe-out.
- On the concentrated single-stock book, 2× margin **lowered** the long-run return: volatility drag on a 32%-volatility book costs about 15 points a year.
- The daily 2× single-stock ETFs were a near-total loss (−98%). They are also banned by the design and exist only for about a dozen names since 2022.
- **Leverage turns this into a ruin risk, not a credible large-margin winner.**
- Margin is not available in an IRA, so any leverage would also sit in the taxable account and be taxed at short-term rates (§8).

Files: `results/kf_trend_leverage.csv`, `results/leverage.csv`.

---

## 8. Q5 — Can the owner execute it?

| Requirement | Finding |
|---|---|
| **One weekly email, ≤3 orders** | The engine enforces ≤1 buy and ≤3 orders a week. The base rule never needed more than 3 and never breached the 60-day cap. Across the 126 variants there were at most 6 cap breaches (K = 12 only), where re-decisions collided in one week. **K ≤ 8 is the executable range.** |
| **Entries a year** | Base: 12 a year. The range across variants is 6 (K = 4, 12-1) to 49 (52-week high, K = 12), all inside 52. Continuation (76% of re-decisions) keeps turnover down: the median hold is 168 days, as a chain of 60-day decisions. |
| **Dollar orders in the Robinhood IRA** | Dollar-based (fractional) market orders are supported for most S&P 500 names and queue for the 9:30 open **[verify in app: one-off dollar orders in the IRA are still an open item in `DECISIONS.md`]**. The whole book fits the design's order kind (a). No stops or brackets are needed: exits are weekly rule decisions. |
| **Whitelist (design §3a.6)** | Today the whitelist is 16 fixed ETFs. A single-stock book needs **the whole S&P 500 (about 503 names, changing several times a month)** verified. `code/20-executability/check_venues.py` would have to loop over the current constituents monthly, via Robinhood's public instruments API (`tradeable`, `fractional_tradability`), and re-check the week's pick nightly before the email. That is also a new dependency on a constituent source (SPY's daily holdings file or Wikipedia) that must be point-in-time. |
| **Liquidity** | S&P 500 names trade from tens of millions to billions of dollars a day, so a $1–25k order has no measurable impact. Costs of 0.25% and 0.50% per side cut the base rule's excess from +3.9 to +3.4 and +2.6. Liquidity is not the problem. |
| **Risk caps (design §4)** | The current design caps the US-equity cluster at **7% of NAV stress**. The base book's worst 10-session loss was **−35%** (October 2008; SPY −27%). So a sleeve sized to matter (25–50% of NAV) carries 9–17% of NAV in stress. **It cannot fit inside the current rule book.** It would need a new "equity core" allocation outside the trade system's stress caps, which is an owner decision. |
| **Tax (taxable account)** | 86% of closed trades are held ≤365 days, so short-term. At an illustrative 37% short-term rate, the base rule's 12.1% pre-tax became **9.5% after tax**. SPY buy-and-hold in the same account: 7.9% (dividend tax only), or 7.1% if sold at the end. **Keep it in the IRA.** A wash-sale guard is needed if the taxable account holds the same names (design §4 has one). |
| **Earnings** | The rule doesn't trade earnings, but an 8-week hold spans about one earnings release per name, so every position carries gap risk. That is part of the −68% drawdown. |

---

## 9. Post-earnings drift and earnings trades (the never-list)

**Not re-tested; 0 extra variants counted.** The ban stands, for reasons measured in earlier tracks:

- **Track 16** (2011–2026, 108,796 EDGAR earnings events; next-day follower):
  - post-earnings drift decile spreads were ≈ −0.1% to 0.0% at 20 and 60 sessions;
  - the long top decile lost 0.47% (announcement-return sort) or 0.52% (surprise sort) over 20 days, 2016–26;
  - the spread was positive in only 6–8 of 16 years.
- **Track 24** re-ran the drift at 42, 63 and 84 sessions with a 90–120 day cap: still no gain.
- The mechanism has gone. The *announcement* reaction is intact, but the *drift* a slow follower could harvest has been arbitraged away since machine-read EDGAR (Martineau 2022 **[unverified]**).
- What remains of "earnings momentum" is largely already inside 12-1 price momentum (Chan, Jegadeesh and Lakonishok 1996; Novy-Marx 2015 **[unverified]**). An earnings layer would add turnover and event risk, not a separate premium.

---

## 10. Recommendation

**None credible for the stated objective.** No single-stock rule here credibly beats SPY by +5 points a year, as a median over 5–10 years, after costs and survivorship bias:

| Question | Answer |
|---|---|
| Bias-free large-cap momentum premium | +2.6 points (1927–2026), +1.0 (1990–2026), +0.3 (2010–2026), net at today's costs |
| Our one-pick book, bias-corrected | ≈ +2 points over 2000–2026, but ≈ −1.5 over 2000–2023; the edge is one regime (2024–26) |
| Chance of beating SPY by ≥5 points over a decade | ≈ 1 in 4 (bias-free model) to ≈ 1 in 10 (actual rolling windows) |
| Cost in risk | −65% to −85% historical drawdowns; ≈ 50% odds of a ≥50% drawdown in any decade with 8 names |
| Live funds | median +0.4 points; the concentrated one −3.7 |
| Leverage | reaches the target median only by accepting 56–99% odds of halving, and a 1929–32-type wipe-out |

**If the owner still wants single-stock momentum,** the honest ways are:

1. **Paper shadow, not money.** Pre-register the base rule and run it in the shadow ledger for ≥3 years against SPY and SPMO:
   - 12-1 momentum, point-in-time S&P 500, 8 names, 1 pick a week;
   - re-decide at 60 days, continuing inside the top 10%;
   - 0.10% per side, IRA only, no leverage.

   The first email today would buy the top name not held.
2. **One ETF instead of 52 picks.** SPMO or MTUM in the Robinhood IRA as a satellite is one order, with no whitelist or constituent problem. Live history: +1.3 to +4.3 points, not significant, with SPY-like drawdowns. Expect about +0–2 points.
3. **Neither is a "make-rich quick engine".** The large, fast gains in this track come from 2024–2026 hindsight, survivorship bias or leverage that historically ended in ruin. The biggest lever for long-run wealth is still the long-horizon core (design §0.4).

---

## 11. Caveats

- **The residual bias is a floor.** It was measured on equal-weight and quintile portfolios. For an 8-name book, one missing Enron-type collapse (−100% on 12.5% of the book) is a 12-point hit in one year. The −2-point correction may understate the true bias.
- **The Ken French "big winners" portfolio is the NYSE top size quintile**, about 50 of the largest winners and not exactly the S&P 500. The top decile includes small caps whose premium is not reachable at scale.
- **Cost of the time** (Jones 2002-style) is an approximation: before 1975, momentum was untradeable at a profit for large caps.
- **Quality plus momentum** was tested only with price-based proxies: risk-adjusted and smooth (frog-in-the-pan) momentum. Point-in-time accounting data (profitability, accruals) are not free. Smooth momentum underperformed plain 12-1 here (+0.7 against +3.3 median).
- **Nasdaq-100 point-in-time membership** was not available. The mega-cap (top-50 dollar-volume) universe stands in for it.
- **Yahoo data errors:** one-day spikes are removed, and tickers reused by a different company are trusted only from their last S&P 500 spell.
- **Multiple testing:** 152 stock-level runs (126 point-in-time variants, 21 survivor-universe runs, 5 sensitivities), plus the leverage and filter families. Only the pre-registered base rule is quoted as the estimate; everything else is context.
- All figures are before tax unless stated. Nothing here is individualized financial advice.

---

## 12. Reproduction

`research/code/29-stock-momentum/` (Python 3.11: pandas, numpy, yfinance, requests):

| File | What it does | Outputs |
|---|---|---|
| `data29.py` | Point-in-time S&P 500 list (pinned `fja05680/sp500` commit a2430f2, updated 2026-08-18), Yahoo prices for 1,204 tickers (about 4 minutes, cached in `cache/`, git-ignored), Ken French files through `02-academic/kf_utils.py` | `cache/` |
| `engine29.py` | Weekly one-pick book: signals, universes, the 60-day re-decision, the ≤1 buy and ≤3 order limits, trend filters, synthetic 2× ETFs | |
| `kf_long_run.py` | Q1 tables, crashes, rolling windows, trend and leverage, the concentration bootstrap (1927–2026) | `results/kf_*.csv`, `kf_summary.txt` |
| `studies29.py` | Bias audit, the 152-run grid, distributions, leverage, taxes | `results/bias_*.csv`, `grid.csv`, `dist_outcomes.csv`, `leverage.csv`, `taxes.csv`, `turnover_measured.json` |
| `etf29.py` | Live momentum funds vs SPY | `results/etf_live.csv` |
| `run_all.py` | Everything, in order (about 3 minutes after the download) | `results/summary.txt`, `base_calendar_years.csv` |

Results total about 150 KB. Prices run through the 28 Sep 2026 close and Ken French through Aug 2026.

---

## Sources

- Jegadeesh, N., Titman, S. (1993). Returns to buying winners and selling losers. *Journal of Finance* 48(1).
- George, T., Hwang, C.-Y. (2004). The 52-week high and momentum investing. *Journal of Finance* 59(5).
- Da, Z., Gurun, U., Warachka, M. (2014). Frog in the pan: continuous information and momentum. *Review of Financial Studies* 27(7).
- Blitz, D., Huij, J., Martens, M. (2011). Residual momentum. *Journal of Empirical Finance* 18(3).
- Daniel, K., Moskowitz, T. (2016). Momentum crashes. *Journal of Financial Economics* 122(2).
- Barroso, P., Santa-Clara, P. (2015). Momentum has its moments. *Journal of Financial Economics* 116(1).
- Asness, C., Frazzini, A., Israel, R., Moskowitz, T. (2014). Fact, fiction and momentum investing. *Journal of Portfolio Management* 40(5).
- Novy-Marx, R., Velikov, M. (2016). A taxonomy of anomalies and their trading costs. *Review of Financial Studies* 29(1).
- Patton, A., Weller, B. (2020). What you see is not what you get: the costs of trading market anomalies. *Journal of Financial Economics* 137(2).
- McLean, R.D., Pontiff, J. (2016). Does academic research destroy stock return predictability? *Journal of Finance* 71(1).
- Jones, C. (2002). A century of stock market liquidity and trading costs. Columbia Business School working paper.
- Chan, L., Jegadeesh, N., Lakonishok, J. (1996). Momentum strategies. *Journal of Finance* 51(5).
- Novy-Marx, R. (2015). Fundamentally, momentum is fundamental momentum. NBER working paper 20984 **[unverified]**.
- Martineau, C. (2022). Rest in peace post-earnings announcement drift. *Critical Finance Review* 11 **[unverified]**.
- Kenneth R. French Data Library: 10 portfolios on prior 12-2 return; 25 portfolios on size and prior 12-2 return; Fama-French factors; momentum factor (through Aug 2026).
- S&P 500 historical components: github.com/fja05680/sp500 (Clenow, *Trading Evolved*, plus Wikipedia's changes list), commit a2430f2.
- Fund data: Yahoo Finance adjusted closes (net of expense ratios) through 28 Sep 2026; expense ratios from issuer pages **[as recalled, verify]**.
- Earlier tracks: `02-academic-evidence.md` (momentum factor decay, live ETFs), `16-short-horizon-event-driven.md` and `24-duration-cap-gap-search.md` (earnings drift).
