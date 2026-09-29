# 26 — A leveraged index trend core: can 2× or 3× the index, held only in uptrends, beat SPY by a large margin?

*Track 26, research round of 29 September 2026. It answers the owner's new objective: "exceed SPY return by a large margin", at most one recommendation a week. Code: `research/code/26-leveraged-trend/` (`run_all.py` reproduces every number here; outputs in `output/`, 0.25 MB).*

---

## TL;DR

1. **Historically, yes:** 3× the S&P 500 (UPRO), held only while the Friday close is above the 200-day average (2% band), otherwise T-bills, made **16.3% a year in 1929–2026 vs SPY's 9.8% (+6.5 points)**, +7.8 points out of sample (1990–2026) and **+13.1 points on the real UPRO in 2016–2026** (Monday-open fills), with about 1.2 trades a year.
2. **The price is ruin-level drawdowns:** −92% in 1929–33 (16 years underwater) and −81% in 1987–88 (the Friday 16 October exit signal was filled on Black Monday); even at historical returns, a **73% / 14% chance of a −50% / −80% drawdown within 10 years**.
3. **After 2,616 variants, its edge over SPY is not distinguishable from luck** (reality-check p 0.40; deflated-Sharpe probability vs SPY 0.21); the only robust finding is that a slow filter makes leverage survivable, and short lookbacks and VIX brakes do not help.
4. **Forward, the edge is gone:** at CAPE 41 and 4.2% T-bills, leverage costs about 4.9% a year, and with SPY at 4.5% the 3× rule's **median 10-year result is 2.6% a year (−2.4 points vs SPY)**, with a 41% chance of beating SPY and an 81% / 20% chance of a −50% / −80% drawdown; +5 points needs SPY at about 10–11% a year, its long-run historical average.
5. **Recommendation: do not make 3× the core now.** If you want leverage anyway, run the **2× (SSO) version on paper** (forward median ≈ SPY +0.5, **not +5**; about 40% chance of a −50% drawdown in 10 years); it is one Friday check and ≤2 dollar market orders in the Robinhood IRA.

**The rule, if adopted (paper first): "L-200W".**
- **Every Friday after the close:** compare the S&P 500 index close (^GSPC) with its 200-day simple average, including that day.
- **If out,** and the close is **≥2% above** the average: email a BUY for Monday's open. Sell all SGOV, then buy SSO (2×; or UPRO for 3×) with the proceeds.
- **If in,** and the close is **≥2% below** the average: email a SELL for Monday's open. Sell all SSO/UPRO, then buy SGOV.
- **Otherwise:** no order, and only a one-line weekly status.
- **Cadence:** about 1.2 switches a year (0–5; none in 31% of years), at most one a week by construction.
- **Venue:** the Robinhood IRA, with no tax on switches.
- **Today** (25 Sep close 7,743): **in**, at +7.5% above the average (7,205). The exit trigger is a Friday close below about 7,060.

---

## 1. What was tested, and how

**Data.**
- ^GSPC daily from 1928. Total return uses Shiller dividends before 1988 and ^SP500TR after.
- ^NDX from October 1985. Total return = price plus QQQ's dividend yield (0.6% a year before 1999).
- **Not spliced with ^IXIC before 1985** (`s02_ixic_splice_1972_1985.csv`).
  - The early Nasdaq Composite has stale small-cap prices: its daily returns had a lag-1 autocorrelation of 0.31 in 1972–85, against −0.04 for the Nasdaq-100 since 1986.
  - That flatters any trend rule. Spliced, the 1× rule "beat" its own index by 5.7 points a year (13.1% vs 7.4%), and 3× made 19.6%. Neither is credible.
- T-bills: Ken French's daily 1-month rate to August 2026, then FRED DTB3.
- VIX from 1990, VXO for 1986–89, and before that a proxy (VIX ≈ 8.7 + 0.70 × 20-day realised vol; correlation 0.86 on 1990–2026).
- Real ETFs from Yahoo: SPY, QQQ, SSO, UPRO, QLD, TQQQ, BIL, SGOV, IEF, TLT, GLD.
- A synthetic 10-year Treasury built from FRED DGS10, calibrated to IEF.
- Gold: GLD from 2004; monthly LBMA gold before that.

**Leveraged-fund model.**
- An exposure of E × the index earns E × total return − (E−1) × (T-bill + 0.70%) − fee.
  - Fees: 0.09% for the first unit and 0.80% for the second, so 2× ≈ 0.89% (SSO) and 3× ≈ 0.91% (UPRO).
- The 0.70% spread is calibrated on the real funds since their launch (`s00_letf_calibration.csv`):

| Fund | Actual CAGR | Model CAGR | Daily correlation |
|---|---|---|---|
| SSO (2006–) | 15.80% | 15.86% | 0.995 |
| UPRO (2009–) | 32.89% | 32.90% | 0.998 |
| QLD (2006–) | 25.44% | 25.18% | 0.996 |
| TQQQ (2010–) | 43.15% | 42.79% | 0.999 |

- The Nasdaq funds matched at a 0.50–0.55% spread, so the Nasdaq results here are slightly conservative.

**Execution, with no look-ahead.**
- The signal is the index close on a decision day. The trade happens at the **next day's close** in the long simulations, because index opens before 1962 do not exist and are unreliable before about 1982.
- The realistic Robinhood fill is a dollar market order **queued for the Monday open** after the evening email. The real-ETF test (§3.3) runs both fills over 2016–2026:
  - S&P: the open fill was about the same as the close fill (28.1% vs 27.8%).
  - Nasdaq: the open fill was better (34.5% vs 31.2%).
- Costs: 0.10% of the fund notional per trade, plus 0.01% on the SGOV leg. Real UPRO/TQQQ spreads are about 0.01–0.03%.

**The search.**
- 1,308 rule variants per index, 2,616 cells in all (`s01_grid.csv.gz`):
  - leverage 1, 1.5, 2 and 3×;
  - filters: 200-day, 150-day and 250-day SMA; the "banned" 50-day and 100-day SMA; the 10-month SMA; the 50/200 cross; *dual* (200-day **and** 12-month return > T-bills); *either* (200-day **or** 12-month);
  - decisions daily, weekly (Friday) or monthly;
  - hysteresis bands of 0, 1, 2 and 3%;
  - no brake, VIX > 30 or VIX > 40;
  - a vol-targeting family: exposure = target ÷ realised vol, capped at 1.5, 2 or 3×, with targets of 15–30% and 20- or 60-day windows, with or without the 200-day gate.
- Plus 16 exit-asset runs, 10 real-ETF runs and 4 October-1987 variants.
- **Parameters were chosen in-sample:** S&P 1929–1989; Nasdaq-100 1986–2005. They were tested out of sample on S&P 1990–2026 and Nasdaq-100 2006–2026. 2016–2026 is post-publication for Gayed & Bilello (2016).

---

## 2. Q1 — Which rules give the highest long-run CAGR out of sample?

### 2.1 In-sample winners and how they did afterwards (weekly or monthly only, ≤1 order a week)

| Index | In-sample pick (highest IS CAGR) | IS CAGR (excess vs SPY) | OOS CAGR (excess) | OOS max DD | 2016–26 CAGR |
|---|---|---|---|---|---|
| S&P | 1.5×, 200-day, monthly, 1% band | 12.2% (+2.9) | 12.8% (+1.9) | −32% | 15.6% |
| S&P | 2×, 100-day, weekly, no band | 14.0% (+4.7) | 10.5% (−0.3) | −68% | 18.2% |
| S&P | **3×, 50-day, weekly, 3% band, VIX>40 brake** | **17.5% (+8.2)** | **13.8% (+2.9)** | −74% | 19.8% |
| S&P | vol-target 30% (20-day), cap 3×, 200-day gate | 15.4% (+6.2) | 11.6% (+0.7) | −43% | 20.7% |
| S&P | 3× buy & hold (reference) | 6.2% (−3.0) | 14.7% (+3.8) | −98% | 29.3% |
| NDX | 3×, *either*, weekly, 3% band, VIX>30 | 25.5% (+13.8) | 21.7% (+10.5) | −65% | 22.2% |
| NDX | vol-target 30% (20-day), cap 3×, no gate | 19.3% (+7.6) | 25.0% (+13.9) | −52% | 29.0% |
| NDX | 3× buy & hold (reference) | 2.7% (−9.0) | 26.7% (+15.5) | −95% | 39.1% |

- **The in-sample winner is usually not the out-of-sample winner.**
  - Across variants at the same leverage, the rank correlation between in-sample and out-of-sample CAGR was 0.33–0.35 for the S&P and 0.14–0.32 for the Nasdaq-100.
  - The top tenth by in-sample CAGR did no better out of sample than the median variant (S&P 3×: 14.9% vs 15.8%).
  - Picking the in-sample best cell is mostly picking noise (`s01_is_oos_rank.csv`).
- **The S&P in-sample winner at 3× is a banned short lookback (50 days).** It lost 3.7 points a year out of sample relative to its in-sample result, and trailed the plain 200-day rule by about 5 points.

### 2.2 The robust pattern: families, not cells

Median CAGR over bands of 0–3%, at 3×, weekly decisions, no brake:

| Filter | S&P IS (1929–89) | S&P OOS (1990–26) | S&P IS max DD | NDX IS (1986–05) | NDX OOS (2006–26) |
|---|---|---|---|---|---|
| **200-day SMA** | **14.9%** | **17.4%** | −93% | 14.7% | 21.6% |
| 150-day / 250-day SMA | 12.7% / 14.3% | 15.8% / 16.4% | −97% / −95% | 8.7% / 16.1% | 21.4% / 22.7% |
| 10-month SMA (monthly) | 13.8% | 17.1% | −94% | 19.9% | 21.2% |
| 50/200 cross | 10.5% | 17.0% | −96% | 15.9% | 22.7% |
| dual (200-day **and** 12-month) | 13.0% | 14.3% | −81% | 17.0% | 16.5% |
| either (200-day **or** 12-month) | 13.3% | 21.8% | −96% | 16.7% | 27.5% |
| **100-day SMA (banned)** | 13.1% | 12.0% | −87% | 13.9% | 22.2% |
| **50-day SMA (banned)** | 12.7% | **9.1%** | −90% | 12.1% | **13.8%** |
| none (3× buy & hold) | 6.2% | 14.7% | −99.9% | 2.7% | 26.7% |
| *SPY, same period* | *9.2%* | *10.9%* | *−84%* | *11.6%* | *11.2%* |

What the grid says, in plain English:

- **Leverage.** With a filter, more leverage raised the S&P's CAGR in every period:
  - 1929–2026, weekly 200-day rule with a 2% band: 1× 9.6%, 1.5× 11.8%, 2× 13.6%, 3× 16.3%.
  - It did the same in-sample, out of sample and after 2016.
  - On the Nasdaq-100 in-sample (1986–2005), 3× was no better than 2×: 18.7% vs 19.1%.
  - Without a filter, 3× was ruined in 1929–32 (−99.9%) and in 2000–09 (−98%).
- **Index.** The Nasdaq-100 rules beat SPY by more in both samples. Much of that is the Nasdaq-100 beating the S&P, not a better rule:
  - 1× Nasdaq-100 buy-and-hold beat SPY by 2.5 points a year in 1986–2005 and by 4.7 in 2006–2026.
  - The 3× rules carried −90% drawdowns.
  - Forward, there is no reason to assume the premium persists (§6).
- **Filter.** The slow filters (150–250 days, 10 months, 50/200) cluster together. The "either" filter did best out of sample only because it is in the market more (closer to buy-and-hold) during a bull market. In-sample it was worse, with −96% drawdowns.
- **Short lookbacks (<6 months) are worse.** The 50-day rule lost 8 points a year out of sample against the 200-day rule on the S&P, and 8 points on the Nasdaq. **The design's §5 ban holds.**
- **Weekly vs daily.** Across the grid at 3×, daily decisions added 1.6 points in-sample on the S&P, nothing out of sample (−0.2), and cost 2.4 points after 2016.
  - Daily rules also break the one-a-week limit: up to 5 orders in a single week.
  - **Weekly costs little.**
- **Bands** cut orders from 3.4 to 1.1 a year (S&P 3×, 200-day) without a clear return cost:

| Band | IS CAGR | OOS CAGR | 2016–26 CAGR | OOS orders a year |
|---|---|---|---|---|
| 0% | 15.6% | 14.4% | 28.6% | 3.4 |
| 1% | 14.6% | 16.7% | 28.8% | 2.0 |
| 2% | 14.9% | 18.7% | 27.8% | 1.1 |
| 3% | 14.9% | 18.2% | 25.5% | 0.9 |

  The 2% band is chosen for fewer emails and less whipsaw; in-sample, the bands are indistinguishable.
- **VIX brakes do not help.**
  - VIX > 30 cost 0.2–1.7 points a year on the S&P and 0.8–2.6 on the Nasdaq (median over the grid).
  - VIX > 40 changed almost nothing.
  - Neither reduced the worst drawdown by more than a few points. The trend filter already does the brake's job, and the VIX spikes *after* the damage.
- **Vol targeting** (exposure = target ÷ realised vol, capped at 3×) roughly halves drawdowns but gives up most of the excess return.
  - Its best in-sample S&P version made 11.6% out of sample (+0.7 vs SPY).
  - It needs 10–24 orders a year.
  - It is a risk tool, not a return tool, and does not meet the "large margin" goal.
- **Exit asset** (S&P 200-day rule, 2% band; `s02_exit_assets.csv`):

| Exit asset | 3× CAGR 1962–2026 | 3× in 2022 |
|---|---|---|
| T-bills | 15.3% | −26.7% |
| 10-year Treasuries (IEF-like) | 16.7% | −37.1% |
| TLT (real, 2002–26) | 22.3% (vs 21.1% with T-bills) | −47.1% |
| Gold (1975–2026) | 17.7% (same as T-bills) | −30.9% |

  - Bonds added 1.4 points a year over 1962–2026, a period dominated by the 1982–2020 fall in yields.
  - In 2022, when the rule was out of stocks, IEF-like bonds cost another 10 points and TLT another 20.
  - With T-bills at 4.2%, a term premium near zero and stock–bond correlation positive in inflation shocks, **T-bills (SGOV) are the exit asset.**

---

## 3. Q2 — Full statistics for the finalists

All finalists use weekly Friday decisions, a 200-day SMA of the index price, a 2% band, T-bills when out, the next-close fill, and costs (`s02_finalists_stats.csv`, `s02_rolling_vs_spy.csv`).

### 3.1 S&P 500, 1929–2026 (97.7 years)

| Rule | CAGR | Excess vs SPY | Vol | Sharpe | Max DD | Worst year | Days >20% under peak | Longest underwater | Orders a year |
|---|---|---|---|---|---|---|---|---|---|
| SPY buy & hold | 9.8% | — | 18.9% | 0.43 | −84% | −43% (1931) | 22% | 15.3 yrs | 0 |
| 1× + filter | 9.6% | −0.3 | 12.6% | 0.54 | −47% | −16% (1939) | 10% | 6.3 yrs | 1.2 |
| 1.5× + filter | 11.8% | +2.0 | 18.9% | 0.52 | −64% | −25% (1932) | 18% | 6.5 yrs | 1.2 |
| **2× + filter (SSO)** | **13.6%** | **+3.7** | 25.2% | 0.51 | **−77%** | −36% (1932) | 34% | 7.9 yrs | 1.2 |
| **3× + filter (UPRO)** | **16.3%** | **+6.5** | 37.8% | 0.51 | **−92%** | **−57% (1932)** | **60%** | **16.0 yrs** | 1.2 |
| 3× buy & hold | 9.3% | −0.5 | 56.8% | 0.39 | −99.9% | −89% (1931) | 75% | 29 yrs | 0 |

*SPY = the S&P total return less SPY's 0.0945% fee. Sharpe ratios are over T-bills. "Longest underwater" is the longest spell below a previous peak.*

### 3.2 Out of sample and post-publication

| Rule | OOS 1990–2026 CAGR (excess) | OOS max DD | 2016–2026 CAGR (excess) | 2016–26 max DD |
|---|---|---|---|---|
| SPY | 10.9% | −55% | 15.0% | −34% |
| S&P 1× + filter | 9.8% (−1.1) | −19% | 12.3% (−2.8) | −15% |
| S&P 2× + filter (SSO) | 14.6% (+3.8) | −36% | 20.3% (+5.2) | −29% |
| **S&P 3× + filter (UPRO)** | **18.7% (+7.8)** | **−50%** | **27.8% (+12.8)** | −41% |
| NDX 2× + filter (QLD), OOS 2006–26 | 15.8% (+4.6) | −55% | 24.3% (+9.2) | −55% |
| **NDX 3× + filter (TQQQ), OOS 2006–26** | **18.8% (+7.6)** | **−72%** | **30.7% (+15.6)** | −72% |
| NDX 3× + filter, 1986–2026 | 18.7% (+7.3) | **−91%** | | |

### 3.3 The real funds, 2016–2026 (post-publication; `s02_real_etfs_2016_2026.csv`)

Signals come from the ^GSPC / ^NDX Friday closes. Trades are in the real ETF at **Monday's open**, with BIL and then SGOV when out.

| Real fund | Rule CAGR (open fill) | Max DD | Fund buy & hold | Fund B&H max DD | SPY | Excess vs SPY | Switches a year |
|---|---|---|---|---|---|---|---|
| UPRO | **28.1%** | −45% | 29.1% | −77% | 15.1% | **+13.1** | 1.3 |
| SSO | 20.4% | −33% | 23.4% | −59% | 15.1% | +5.4 | 1.3 |
| TQQQ | 34.5% | −70% | 39.4% | −82% | 15.1% | +19.5 | 1.4 |
| QLD | 26.4% | −53% | 32.3% | −64% | 15.1% | +11.3 | 1.4 |

- **The model matches the real funds.** The S&P 3× rule gives 27.8% with the model's next-close fill and 27.8% with the real UPRO filled at the close.
- **After publication, the rule beat SPY by a lot but trailed leveraged buy-and-hold by 1–6 points**, because 2016–2026 had short V-shaped sell-offs (2018, 2020, 2025) that whipsawed it.
- **This decade is close to the best case for leverage:** 15% SPY returns, and near-zero rates through 2021.

### 3.4 Rolling windows against SPY

| Rule (sample) | 10-yr windows beating SPY | …by ≥5 points a year | Median 10-yr excess | 10th percentile | Worst 10-yr CAGR |
|---|---|---|---|---|---|
| S&P 1.5× (1929–2026) | 69% | 10% | +1.8 | −2.2 | +0.7% |
| S&P 2× (1929–2026) | 81% | 35% | +3.3 | −1.5 | −1.6% |
| **S&P 3× (1929–2026)** | **80%** | **56%** | **+6.2** | **−2.5** | **−9.4%** |
| S&P 3× (OOS 1990–2026) | 98% | 87% | +8.7 | +4.8 | +1.7% |
| NDX 3× (1986–2026) | 75% | 61% | +8.9 | −4.3 | −13.8% |
| S&P 3× buy & hold (1929–2026) | 61% | 45% | +3.0 | −12.2 | −43.8% |

5-year windows for S&P 3× + filter:
- It beat SPY in 74% of windows, and by ≥5 points in 60%.
- The worst 5-year CAGR was −36% a year.

---

## 4. Q3 — Tail risk

### 4.1 October 1987: was the filter "in" on Friday 16 October?

| Date | S&P close | 200-day SMA | Gap | Weekly rule (2% band) | Daily rule (no band) | 3× held that day |
|---|---|---|---|---|---|---|
| Fri 9 Oct | 311.07 | 297.35 | +4.6% | **in** (weekly check) | in | 3× |
| Wed 14 Oct | 305.23 | 298.32 | +2.3% | in | in | 3× (−8.9%) |
| Thu 15 Oct | 298.08 | 298.60 | −0.2% | in (no check) | **out signal** | 3× (−7.1%) |
| Fri 16 Oct | 282.70 | 298.78 | **−5.4%** | **out signal** (weekly check) | out, sold at this close | 3× (−15.5%) |
| **Mon 19 Oct** | 224.84 | 298.64 | −24.7% | sell order fills today | **flat** | **weekly: 3× (−61.4%)** |

- **The filter was still "in" going into 16 October.** The Friday close flipped it to "out", but the weekly rule's sell was filled only on Black Monday.
  - At the next close, that is the full −20.5% day at 3×, **−61%**.
  - At the Monday open (the realistic Robinhood fill), the order would have been filled into the opening collapse. Many NYSE stocks opened late that morning, so the index has no meaningful opening print and the loss can't be reconstructed precisely. Expect well over −20% at 3×.
- **The daily rule (no band) got out at Friday's close only by luck:** the crossing happened on Thursday. A daily rule with a 2% band would also have held through Monday.
- **Over the 1987 episode** (25 Aug to 31 Dec): SPY −25%; the 3× rule **−77%**; 2× −58%; 1× −32%.
  - The rule's second-worst drawdown, **−81% (Aug 1987 to Aug 1988)**, took **8.7 years** to recover.
- **Structural lesson:** no moving-average rule can dodge a one-day gap. At 3×, a −33.4% index day wipes out a daily-reset fund (the ETF issuers' own prospectus risk). The S&P's worst day, −20.5%, is 61% of that.

### 4.2 The 1929–32 and 2000–02 paths (`s03_crash_paths.csv`, `s03_worst_drawdowns.csv`)

| Window | SPY | S&P 1× rule | S&P 2× rule | S&P 3× rule | NDX 3× rule | S&P 3× buy & hold |
|---|---|---|---|---|---|---|
| Sep 1929 – Jun 1932 | −84% | −25% | −49% | −67% (1 switch) | n/a | −99.9% |
| Sep 1929 – Dec 1935 | −39% | +1% | −35% | −71% (8 switches; worst −92%) | n/a | −99.2% |
| Mar 1937 – Apr 1942 | −43% | −30% | −57% | **−75%** (11 switches) | n/a | −94% |
| 1973–74 | −38% | +1% | −13% | −24% | n/a | −86% |
| Mar 2000 – Oct 2002 | −48% | −1% | −14% | **−26%** | **−86%** (7 switches) | −93% |
| Oct 2007 – Mar 2009 | −55% | −5% | −13% | −20% | −63% | −96% |
| Feb – Mar 2020 | −34% | −8% | −16% | −24% | −68% | −76% |
| Jan – Oct 2022 | −24% | −9% | −18% | −27% | −30% | −63% |
| Feb – Apr 2025 | −19% | −8% | −17% | −25% | −30% | −49% |

- **The filter sidesteps slow bear markets** (1973–74, 2000–02, 2008) but not **fast crashes** (1987, 2020) or **bear-market rallies** (1930–33, 1937–42). Rallies above the average re-enter 3×, and the next leg down hits the fund.
- **The rule's worst drawdowns:**
  - S&P 3×: −92% (Sep 1929 – Apr 1933, recovered Sep 1945, **16.0 years**); −81% (1987–88, 8.7 years); −58% (1976–80).
  - NDX 3×: **−91% (Mar 2000 – Jul 2009, recovered Dec 2019: 19.7 years)**; −80% (1987–91); −72% (2020, which recovered within a year).

### 4.3 Whipsaw years (calendar-year returns; `s02_calendar_years.csv`)

| Year | SPY | S&P 3× rule (switches) | S&P 2× rule | S&P 3× buy & hold | NDX 3× rule (switches) |
|---|---|---|---|---|---|
| 2011 | +2.0% | **−32.1%** (1) | −21.3% | −11.9% | −36.9% (3) |
| 2015 | +1.3% | **−23.2%** (1) | −15.2% | −5.3% | −20.2% (2) |
| 2016 | +11.8% | +27.5% (1) | +18.6% | +30.2% | **−23.3%** (4) |
| 2018 | −4.5% | −10.1% (1) | −4.3% | −25.6% | +0.4% (1) |
| 2022 | −18.2% | −26.5% (1) | −17.8% | −56.1% | −29.8% (1) |

- **In a flat year a whipsaw costs the 3× rule 20–35%.** The fund is in for the first leg of a drop, sells near the low, and buys back higher.
- **Expect about one such year in six.** 17 of the 98 calendar years lost 20% or more at 3×: 1929, 1932, 1939–41, 1960, 1962, 1969, 1973, 1981, 1987, 1990, 1994, 2000, 2011, 2015 and 2022. At 2× it was 7 years.
- The 3× rule lost money in 36% of calendar years; SPY did in 27%.

### 4.4 How likely are −50% and −80% drawdowns within 10 years? (block bootstrap, `s03_bootstrap_hist.csv`)

Method:
- 4,000 synthetic 11-year paths built from 250-day blocks of real daily history.
- The rule is re-run on each path; drawdowns are scored over the last 10 years.

| Rule (historical drift, 1928–2026 pool) | Median 10-yr CAGR | SPY median | P(beat SPY) | P(beat by ≥5 pts) | **P(DD ≤ −50%)** | **P(DD ≤ −80%)** | P(lose money over 10 yrs) |
|---|---|---|---|---|---|---|---|
| SPY | 10.8% | — | — | — | 24% | 1.5% | 6% |
| S&P 1× + filter | 9.3% | 10.8% | 36% | 8% | 1% | 0% | 1% |
| S&P 2× + filter | 12.9% | 10.8% | 69% | 36% | **36%** | **0.7%** | 6% |
| **S&P 3× + filter** | **15.4%** | 10.8% | **71%** | **52%** | **73%** | **14%** | 11% |
| S&P 3× buy & hold | 13.1% | 10.8% | 56% | 44% | 97% | 60% | 27% |
| NDX 3× + filter (1985–2026 pool) | 19.1% | 12.2% | 68% | 56% | **98%** | **39%** | 14% |

- **The bootstrap understates the rule by about 1 point a year relative to actual history**, because blocks break some long trends. The shape is right: at 3×, a −50% drawdown within 10 years is the *normal* case, not the tail.

---

## 5. Q4 — Multiple testing

**Variants tried in this track:** 2,616 rule cells, plus 30 exit-asset, real-ETF and 1987 runs, about 2,650 in all. Earlier tracks tested closely related 200-day and 10-month leverage rules (04 §7.3, 06 §3). Output: `s04_deflated_sharpe_rc.csv`.

| Test (in-sample daily returns) | S&P 3×, 200-day, weekly, 2% band | NDX 3×, same rule |
|---|---|---|
| Sharpe vs T-bills (annualised) | 0.48 | 0.53 |
| Deflated-Sharpe probability (N = 924 compliant variants) | **0.98** | 0.92 |
| Information ratio vs SPY (log excess) | 0.16 | 0.11 |
| IR needed to beat the luck of N = 924 trials | 0.27 | 0.30 |
| **Deflated-Sharpe probability vs SPY** | **0.21** | **0.21** |
| Same, with the effective number of independent trials (N_eff 2.7 / 1.9) | 0.78 | 0.62 |
| Single-test probability (no search) that it beats SPY | 0.89 | 0.69 |
| White's reality check, p for the *best* of all variants vs SPY | **0.40** | **0.56** |

What it means:
- **"It beats T-bills" survives the search.** That is just the equity premium, levered.
- **The two deflated-Sharpe rows bracket the truth.**
  - N = 924 treats every variant as an independent try.
  - N_eff (the participation ratio of the correlation eigenvalues of the variants' excess-vs-SPY returns) is only 2.7 and 1.9, because one factor, the leverage level, dominates them. That understates the real number of tries.
  - The probability that the rule's edge over SPY is real therefore lies somewhere between 0.2 and 0.8.
  - White's reality check handles the correlation directly, and is the better single number: **p 0.40, not significant.**
- **"It beats SPY" does not**, even though it did so both in-sample and out of sample. The margin over SPY (about +5 points a year in log terms) is small relative to its tracking error: 31% a year at 3×, 20% at 2×.
  - Sixty years of data cannot separate +5 points a year from luck at an information ratio of 0.16.
  - After 924 tries, even the best variant's in-sample edge (p 0.04 alone) is what luck would produce 40% of the time.

**Shrinkage.** Regressing each variant's out-of-sample excess on its in-sample excess (S&P, 3×, 239 variants) gives a slope of 0.56 (`s04_shrinkage.csv`).
- The chosen rule's predicted out-of-sample excess is +6.0 points, against +7.8 realised.
- At 2×, the slope is 0.70 and the prediction +3.1 points.
- On the Nasdaq-100 the slope is 0.22, so its in-sample ranking says almost nothing.

**Shrunk expectation, historical regime** (T-bills about 3%, SPY about 10%):
- S&P 3× rule: **+3 to +6 points** over SPY.
- S&P 2× rule: **+2 to +3 points**.
- The low ends keep about half of the full-sample excess (a deflated-Sharpe-style haircut); the high ends are the regression predictions (+6.0 and +3.1).

---

## 6. Q5 — The forward view: CAPE 41, T-bills 4.2%

**Why the regime matters.** Leverage adds (L−1) × (index return − T-bill − 0.7%) and subtracts about (L² − 1) × σ² / 2 of volatility drag while invested. Over 1929–2026 the weekly 200-day rule was invested 68% of the days (`s05_in_out_split.csv`):

| | Share of days | Index return (arithmetic, annualised) | Index vol | T-bills |
|---|---|---|---|---|
| In market | 68% | **13.5%** | 15.3% | 3.1% |
| Out of market | 32% | 6.7% | 25.0% | 3.2% |

- **Historically** the in-market spread over financing was about 13.5 − 3.1 − 0.7 = **9.7 points**.
  - At 3×: 2 × 9.7 − 4 × 0.153² × 100 − 0.8 ≈ **+9.2 points per invested year**, or about +6.3 a year.
  - That matches the +6.5 realised.
- **Forward**, with SPY at 4.5% and T-bills at 4.2%, the in-market arithmetic return is about 7.3%, so the spread is about 2.4 points.
  - At 3×: 2 × 2.4 − 9.4 − 0.8 ≈ **−5 points per invested year**.
  - **At today's valuations and rates, volatility drag eats more than leverage earns.**

**Simulated forward scenarios** (the §4.4 bootstrap with the drift shifted so that SPY compounds at the stated rate; T-bills constant; 3,000 paths; 10 years; `s05_forward_scenarios.csv`):

| Forward SPY / T-bills | SPY median | 1× + filter | 1.5× + filter | 2× + filter (SSO) | **3× + filter (UPRO)** | 3× buy & hold |
|---|---|---|---|---|---|---|
| History (≈10.7% / 3.1%) | 10.7% | 9.3% | 11.3% | 12.9% | **15.3%** (P>SPY 70%) | 12.7% |
| 10% / 4.2% | 10.5% | 9.5% | 11.1% | 12.3% | **13.8%** (P>SPY 66%) | 10.3% |
| 8% / 4.2% | 8.5% | 8.1% | 9.0% | 9.4% | **9.6%** (P>SPY 59%) | 4.4% |
| 6% / 4.2% | 6.5% | 6.6% | 6.8% | 6.6% | **5.6%** (P>SPY 49%) | −1.3% |
| **4.5% / 4.2% (central)** | **5.0%** | **5.5%** | **5.3%** | **4.6%** | **2.6%** (P>SPY 41%) | −5.4% |
| 3% / 4.2% | 3.5% | 4.5% | 3.7% | 2.7% | **0.1%** (P>SPY 36%) | −9.5% |

Risk in the central case (SPY 4.5%, T-bills 4.2%), over 10 years:

| | 1× + filter | 2× + filter | 3× + filter | NDX 3× + filter (no tech premium) |
|---|---|---|---|---|
| P(beat SPY) | 53% | 50% | **41%** | 22% |
| P(beat SPY by ≥5 pts) | 18% | 19% | **22%** | 12% |
| P(−50% drawdown) | 1% | 40% | **81%** | 99.5% |
| P(−80% drawdown) | 0% | 2% | **20%** | 60% |
| P(lose money over 10 yrs) | 5% | 25% | **40%** | 63% |

- **The Nasdaq-100 is worse forward.** With the same forward return as the S&P, its higher volatility (σ ≈ 22% while invested) makes the 3× drag about twice as large. The median is −4.3% a year, and the chance of a −80% drawdown is 60%.
  - Even granting the Nasdaq-100 a +2-point premium over the S&P, the median is −0.8% (−5.2 points vs SPY).
  - Its 2006–2026 results were a technology boom, not a property of the rule.
- **Break-even.**
  - At SPY 10% with T-bills at 4.2%, the 3× rule's median excess is +4.3 points, or about +5 after adding back the bootstrap's understatement.
  - So +5 needs SPY at about 10–11% a year, roughly its 1929–2026 average.
  - Each point of lower index return costs the rule about 2 points: from SPY 8% to 4.5%, the 3× median falls from 9.6% to 2.6%.
- **Shrunk forward expectation** (central case, adding back the bootstrap's under-statement: about 1 point at 3×, less at lower leverage):

| Rule | Central forward CAGR | vs SPY |
|---|---|---|
| **S&P 3× rule** | ≈3.5% | ≈ −1.5 points |
| **S&P 2× rule** | ≈5.5% | ≈ +0.5 |
| **S&P 1.5× rule** | ≈6% | ≈ +1 |

  None is +5.

---

## 7. Q6 — Executability

- **One weekly decision.** The Friday-close check is a GitHub Actions job on Friday evening, within the design's existing 22:17 ET run.
  - An email goes out only when the state flips, about 1.2 times a year (0–5; at most one a week by construction).
  - The other weeks get a one-line status in the weekly digest.
- **Orders, all Robinhood kind (a), dollar market orders queued for the Monday 9:30 ET open:**
  - to go in: "Sell all SGOV", then "Buy $X SSO/UPRO" with the proceeds;
  - to go out: "Sell all SSO/UPRO", then "Buy $X SGOV".
  - **Two orders, within the ≤3 limit.** In the IRA (a cash account), buying with the proceeds of a same-day sale is allowed. Selling the new position before the first sale settles (T+1) would be a good-faith violation, and the weekly cadence makes that impossible.
- **Tradability** (Robinhood public instruments API, 29 Sep 2026; `s06_venue_check.json`):
  - UPRO, SSO, TQQQ, QLD, SPXL and SGOV are all `tradable`, with `fractional_tradability: tradable`, so **dollar orders work**.
  - All but SPXL also trade in extended hours with fractional orders.
- **IRA eligibility.**
  - Robinhood's IRA pages say you "can invest in stocks and ETFs within a self-directed Robinhood IRA", and that Robinhood Crypto products are not available in an IRA.
  - Options in the IRA are limited to Level 2 (design §3a, track 20), and an IRA cannot borrow on margin, so the leverage has to come from the fund itself.
  - **No Robinhood page lists leveraged ETFs as restricted in IRAs.** They carry an in-app *info label* warning that such products are "typically not for buy-and-hold investors".
  - **Verdict: very likely allowed. Confirm once in the app** (add it to track 20's list of in-app confirmations, with any complex-product acknowledgement).
  - The taxable account is the wrong home: each switch realises gains, mostly short-term.
- **Synthetic leverage** (not tested here) is an alternative in the taxable options account: deep in-the-money LEAPS calls, or XSP call spreads, at roughly box-rate financing without daily reset. It needs options orders the design limits to spreads, and adds roll decisions.
- **Design conflicts to resolve if adopted:**
  - §12.4 "no gross above 1.0×" is an invariant change that needs the owner's approval.
  - §4's stress rule: the notional × the worst 10-session loss is −56% of the sleeve at 2× and −76% at 3×.
  - The M2 US-equity cluster caps.
  - It is a continuing position re-decided weekly, like M3, so it needs the §12.1-style policy-module approval.

---

## 8. Recommendation

1. **Do not adopt a 3× core at today's valuations.**
   - It is the highest-CAGR rule in history: +6.5 points a year over 97 years, +7.8 out of sample and +13 on real UPRO since 2016.
   - But its forward median is *below* SPY (≈ −1.5 to −2.4 points), with an 81% chance of a −50% drawdown and 20% of −80% within 10 years, and a 40% chance of losing money over a decade.
   - Its historical edge over SPY does not survive the multiple-testing haircut (reality-check p 0.40).
   - It is "make-rich quick" only if the next decade repeats 2010–2026.
2. **If you want a leveraged trend core anyway, use 2× on the S&P 500 (SSO), weekly 200-day rule, 2% band, SGOV when out, in the IRA, on paper first.**
   - History: +3.7 points (1929–2026) and +5.2 on real SSO since 2016.
   - Forward central: about SPY +0.5, a 50% chance of beating SPY over 10 years, and about 40% / 2% chances of −50% / −80% drawdowns.
   - It is honest leverage, but it is **not** the +5-point engine you asked for. Nothing in this track credibly delivers that in the median at a CAPE of 41 with 4.2% T-bills.
   - As a *core*, it needs your explicit exemption from §4's stress cap. At 2% stress per position, the design would allow only about 3.5% of NAV in SSO (simulated worst 10-session loss −56%, October 1929) and about 2.6% in UPRO (−76%, October 1987).
3. **Go 3× only as an explicitly sized bet:** money you can watch fall 90% and wait 16 years for.
4. **Pre-register one untested idea for a follow-up track rather than choosing it now:**
   - a **premium gate** that allows leverage only when the equity earnings yield (1/CAPE) exceeds the T-bill rate.
   - Today it would say "1× only": 2.4% against 4.2%.
   - The math in §6 says that is when leverage stops paying, but it was not tested here and would add variants.
5. **Nasdaq-100 leverage: reject as a core.**
   - Its out-of-sample result is the 2006–2026 tech boom.
   - Its rule had a −91% drawdown lasting 19.7 years.
   - Forward, its volatility drag is about double the S&P's.

---

## 9. Caveats

- **Pre-1990 VIX is a proxy,** and pre-1962 opens do not exist. The long simulations use next-close fills. The real-ETF test shows open fills roughly equal for the S&P and better for the Nasdaq.
- **Daily-reset funds before 2006 are modelled, not observed.** The model is calibrated within 0.4 points a year of the real funds, but it cannot capture fund closures, swap-counterparty stress or a halted fund on a −20% day.
  - **An issuer can close or de-lever a fund in a crash**, forcing a sale at the worst time.
- **The bootstrap uses 250-day mean blocks,** so it understates the rule by about 1 point a year. Forward scenarios shift the whole distribution down uniformly, which keeps history's timing structure. A future with more V-shaped crashes (as in 2016–2026) would whipsaw the rule more.
- **The drift shift is a planning assumption.** The design's forward SPY of 3–6% rests on CAPE ≈ 41 (tracks 02 and 08) and could be wrong in either direction. Each point higher adds about 2 points to the 3× rule.
- **Behaviour.** A rule that spends 60% of its days more than 20% below its peak is hard to hold. Abandoning it after a −70% year locks in the loss.

---

## 10. Sources

- Gayed, M. & Bilello, C. (2016). "Leverage for the Long Run: A Systematic Approach to Managing Risk and Magnifying Returns in Stocks." SSRN 2741701.
- Faber, M. (2007). "A Quantitative Approach to Tactical Asset Allocation." *Journal of Wealth Management* (10-month SMA).
- Bailey, D. & López de Prado, M. (2014). "The Deflated Sharpe Ratio." *Journal of Portfolio Management* 40(5).
- White, H. (2000). "A Reality Check for Data Snooping." *Econometrica* 68(5).
- Politis, D. & Romano, J. (1994). "The Stationary Bootstrap." *JASA* 89(428).
- Cheng, M. & Madhavan, A. (2009). "The Dynamics of Leveraged and Inverse Exchange-Traded Funds." *Journal of Investment Management*.
- Kenneth French data library (daily RF); FRED (DTB3, DGS10, VXOCLS); Robert Shiller, `ie_data.xls`; Yahoo Finance via yfinance.
- Presidential Task Force on Market Mechanisms (1988). *Report* (the "Brady Report"), on the delayed NYSE openings of 19 October 1987.
- Robinhood help centre (read 29 Sep 2026):
  - [Retirement investing](https://robinhood.com/us/en/support/articles/retirement-investing/)
  - [Info labels](https://robinhood.com/us/en/support/articles/info-labels/)
  - Robinhood public instruments API (`api.robinhood.com/instruments/`), queried 29 Sep 2026.
- Prior tracks: `04-derivatives-leverage-convexity.md` §7.3 (LETF model, 200-day rule); `06-backtests-few-trade-strategies.md` §3 (10-month and 200-day rules); `00-SYSTEM-DESIGN-v3.md` §0, §4–§6, §12.

**Reproduce:**
- `cd research/code/26-leveraged-trend && python run_all.py` (about 6–12 minutes).
- Downloads are cached in `TRACK26_CACHE` (default: the session scratchpad). Track 04/06 caches are reused when present.
- Files:
  - `common.py`: data, the LETF model and the rule engine;
  - `s00`: calibration;
  - `s01`: grid;
  - `s02`: finalists, exit assets and real ETFs;
  - `s03`: tails, bootstrap, stress inputs and tracking error;
  - `s04`: multiple testing;
  - `s05`: forward scenarios;
  - `s06`: Robinhood check;
  - `boot.py`: the bootstrap engine.
