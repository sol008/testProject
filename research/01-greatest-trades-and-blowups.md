# Track 01: The greatest trades in history, and the greatest blowups

*Research for the design of a low-turnover, high-return trade recommendation engine. Market data runs to 28 Sep 2026 (Yahoo Finance, FRED, Shiller, Polymarket). Code and outputs are in `research/code/01-history/`.*

## TL;DR

1. **Three sources produced the largest documented percentage returns from the fewest decisions.**
   - **Buying a broad market or great franchise at a generational low and not selling.** The 1932 low has since returned about 1,808x in real total return. Buffett made about 21x in 12 years on the Washington Post and about 37x in 18 years on GEICO.
   - **Cheap convexity bought just before a regime change.** Ackman's 2020 CDS hedge made about 96x in 4 weeks. Universa reported +3,612% for March 2020. Paulson's fund made +590% in 2007.
   - **Venture-like early adoption.** Bitcoin is up about 2.5 million times and the Ethereum ICO about 15,700x. This is mostly survivorship.
2. **Headline multiples are not portfolio returns.**
   - Ackman's 96x was about +40% of fund NAV.
   - Soros's >$1bn sterling profit was about 15-20% of his fund's NAV.
   - Universa's figure is on premium spent.
3. **Winners sized by maximum loss.** Large notional positions appear only where structure capped the loss: a peg band, a premium, a $1-stock basket, or senior securities. Nearly every one of the 35 blowups had an uncapped loss:
   - leverage
   - short convexity
   - squeezes
   - counterparty or fraud failure
   - being early with negative carry
4. **Crisis buying is the most reliable few-decision edge, and a modest one.**
   - The first month at ≥40% below the high (n = 5 since 1881) gave a median 5-year real multiple of 1.64x, against 1.42x for any month.
   - Triggers at -20% or -30% show no edge.
   - Buying at the exact bottom (3.5x over 10 years) is hindsight.
   - Being early is costly: another -77% after buying at -40% in 1929; 33 years to break even in Japan.
5. **Setups are rare.**
   - US drawdowns of ≥40%: about 0.4 per decade.
   - Falls of ≥20% within 3 months: 1.35 per decade since 1945.
   - VIX closes ≥50: four episodes since 1990.
6. **Survivorship bias is extreme.**
   - 4.3% of stocks created all net wealth.
   - More than 40% of Russell 3000 stocks suffered an unrecovered fall of ≥70%.
   - 53% of crypto tokens launched since 2021 are dead.
   - The tail-hedge fund index lost about 3% a year.
   - Pegs under attack often hold.
7. **Winners required 50-96% drawdowns, and their multiples decay.** Bitcoin's cycle multiples went 109x, then 21x, then 8x.
8. **Sizing math.**
   - Half-Kelly on a +40% expected-value bet (a 35% chance of 4x) gives a median of about 1.6x after 30 bets.
   - Betting 25% each time gives a median loss.
   - Going all-in means ruin.
9. **Design.**
   - A barbell: an unlevered core deployed into crises by rule, plus a small defined-risk convexity and opportunity sleeve.
   - Hard vetoes, sizing by maximum loss, pre-registered exits, and slow Bayesian calibration.
   - Honest targets: 11x needs 27% a year over 10 years, or 12.7% over 20.

## 0. Method and caveats

**Scope.** The report covers 67 trades from about 600 BC to 2026 and 35 blowups. The full fields for each are in `output/trade_catalog.csv` and `output/blowups.csv`.

**Confidence grades.**
- **A:** recomputed from market data, or taken from filings, audited reports or Berkshire letters.
- **B:** consistent across reputable books or the major financial press.
- **C:** single-source, self-reported or folklore. Anything taken from *Reminiscences of a Stock Operator* is C.

**Return definitions.** "Return on capital at risk" is the multiple on the premium, equity or cost actually committed. "Portfolio-level" is the effect on total capital.

**Hindsight entries.** Computed episode multiples use the lowest close in an entry window, so they are upper bounds on what anyone could have captured.

**Delisted tickers.** Delisted tickers (e.g. HTZGQ) are missing from Yahoo Finance, which is itself a survivorship bias in the data. Historical failures therefore come from the literature.

**Scripts:**

| Script | What it does |
|---|---|
| `generational_lows.py` | Buying at generational lows, ex-ante buy rules, early dip-buyers |
| `winners_and_squeezes.py` | Winner episodes and the drawdowns inside them |
| `peg_breaks.py` | Currency peg breaks and pegs that held |
| `crash_base_rates.py` | How often fast crashes happen |
| `opportunity_frequency.py` | Deep drawdowns across 12 stock indices |
| `sizing_sim.py` | 100k-path bet-sizing Monte Carlo |
| `polymarket_2024.py` | Polymarket 2024 election prices |
| `catalog.py` | The trade and blowup catalog |
| `synthesis.py` | Machine-readable archetypes, survivorship and design rules |
| `assemble_report.py` | Fills the generated tables into this report |

## 1. What the record says, in numbers

### 1.1 Buying the US market at generational lows

Real total-return multiples, with dividends reinvested. Sources: Shiller data spliced with ^SP500TR from 1988 and FRED CPI. Entry is the month of the monthly-average low. For 1942 and 1949 the drawdown is measured from the 1929 peak.

| Low | Date | Drawdown | CAPE | 1y | 5y | 10y | 20y | To Aug 2026 | Real CAGR |
|---|---|---|---|---|---|---|---|---|---|
| Depression | 1 Jun 1932 | -86% | 5.6 | 2.51x | 3.96x | 2.53x | 7.97x | 1,808x | 8.3% |
| WWII | 28 Apr 1942 | -77% | 8.5 | 1.44x | 1.76x | 3.24x | 12.2x | 760x | 8.2% |
| Post-war | 13 Jun 1949 | -58% | 9.1 | 1.44x | 2.52x | 5.60x | 10.5x | 436x | 8.2% |
| Stagflation | 3 Oct 1974 | -48% | 8.3 | 1.29x | 1.37x | 1.94x | 5.27x | 72x | 8.6% |
| Volcker | 12 Aug 1982 | -27% | 6.6 | 1.56x | 2.98x | 3.83x | 7.91x | 58x | 9.6% |
| 1987 crash | 4 Dec 1987 | -34% | 13.4 | 1.14x | 1.74x | 3.83x | 5.30x | 25x | 8.7% |
| Dot-com | 9 Oct 2002 | -49% | 22.0 | 1.21x | 1.71x | 1.61x | 3.94x | 7.7x | 8.9% |
| GFC | 9 Mar 2009 | -57% | 13.3 | 1.52x | 2.47x | 3.82x | n/a | 9.0x | 13.4% |
| Covid | 23 Mar 2020 | -34% | 24.8 | 1.46x | 1.88x | n/a | n/a | 2.5x | 15.4% |
| 2022 inflation low | 12 Oct 2022 | -25% | 27.1 | 1.13x | n/a | n/a | n/a | 2.0x | n/a |
| Tariff shock | 8 Apr 2025 | -19% | n/a | 1.26x | n/a | n/a | n/a | 1.4x | n/a |

For comparison, the S&P returned 7.0% real and 10.3% nominal a year from 1928 to 2026. The huge "to date" multiples come mostly from decades of compounding. The entry adds perhaps 1-2 percentage points a year.

### 1.2 What ex-ante rules captured

Forward real total-return multiples, monthly data from 1881 to 2026. Each drawdown rule fires once per bear market.

| Rule | n | Median 1y | Median 5y | Median 10y | Worst 5y | % of 5y periods losing |
|---|---|---|---|---|---|---|
| Any month (baseline) | 1,688 | 1.09x | 1.42x | 1.90x | 0.49x | 20% |
| First month drawdown ≤ -20% | 11 | 1.05x | 1.36x | 1.39x | 0.78x | 27% |
| First month drawdown ≤ -30% | 7 | 1.11x | 1.41x | 1.46x | 0.78x | 14% |
| **First month drawdown ≤ -40%** | 5 | 1.21x | **1.64x** | 1.89x | 1.09x | 0% |
| First month drawdown ≤ -50% | 2 | 1.08x | 1.90x | 2.59x | 1.33x | 0% |
| **First month CAPE < 10** | 5 | 1.09x | **1.73x** | 2.13x | 0.96x | 20% |
| Hindsight: exact bear-market low | 9 | 1.44x | 1.88x | **3.53x** | 1.37x | 0% |

- **Shallow triggers are not an edge.** They fired too early in 1929, 1937, 1973, 2000 and 2008.
- **Deep triggers add about 2-4 percentage points a year of real return over 5 years**, but n is only 2-5.
- **The gap between the rules and the legends is mostly hindsight.**

### 1.3 The cost of being early

Price only, daily closes; years are counted from the purchase date.

| Market | Buy at | Date | Further fall | Years to price break-even |
|---|---|---|---|---|
| S&P 500 (1929 peak) | -20% | 28 Oct 1929 | -81% | 21.5 |
| | -40% | 12 Nov 1929 | -77% | 16.4 |
| | -60% | 1 Jun 1931 | -65% | 4.4 |
| | -80% | 8 Apr 1932 | -30% | 0.3 |
| Nikkei (Dec 1989 peak) | -20% | 20 Mar 1990 | -77% | 33.2 |
| | -40% | 26 Sep 1990 | -68% | 27.1 |
| | -60% | 22 Jul 1992 | -55% | 20.8 |
| Nasdaq (Mar 2000 peak) | -20% | 12 Apr 2000 | -70% | 13.4 |
| | -40% | 10 Nov 2000 | -63% | 11.3 |
| | -60% | 12 Mar 2001 | -42% | 2.6 |

**Dividends and deflation change the 1929 picture.** A buyer at the September 1929 peak month got back to break-even:
- on nominal price in Sep 1954 (25 years)
- on nominal total return in Jan 1945 (15 years)
- on real total return first in Nov 1936 (7 years)

Buying in the first month the market was down 20% broke even in real terms in 5.8 years.

**Those ruined in 1929-32 were mostly leveraged**, for example buyers on 10% margin.

**Japan and Nasdaq started from extreme valuations**, which is why the waits there were so long.

### 1.4 How often opportunities come

**Peak-to-recovery drawdown episodes, daily closes:**

| Index | ≥20% | ≥30% | ≥40% per decade | ≥40% episodes |
|---|---|---|---|---|
| S&P 500 (since 1928) | 12 | 7 | 0.41 | 1929-32 -86%; 1973-74 -48%; 2000-02 -49%; 2007-09 -57% |
| Nasdaq (since 1971) | 13 | 7 | 0.36 | 1973-74 -60%; 2000-02 -78% |
| Nikkei (since 1965) | 8 | 2 | 0.16 | 1989-2009 -82% |
| DAX (since 1988) | 8 | 5 | 0.52 | 2000-03 -73%; 2007-09 -55% |
| Hang Seng (since 1987) | 7 | 6 | 1.51 | six, including 2018-22 -56% (unrecovered) |
| Bovespa (since 1993) | 11 | 5 | 1.50 | five |
| KOSPI (since 1997) | 8 | 6 | 1.34 | four |
| Shanghai (since 1997) | 4 | 2 | 0.68 | including 2007-08 -72% (unrecovered after 19 years) |

This table shows 8 of the 12 indices analysed; all 12 are in `output/opportunity_frequency.csv`.

**Fast crashes in the S&P:**

| Event | Since 1928 | Since 1945 |
|---|---|---|
| Fall of ≥20% within 3 months | 25 | 11 (1.35 per decade) |
| Fall of ≥30% within 3 months | 10 | 3 (1987, 2008, 2020) |

**VIX spikes since 1990:**

| Close at least | Episodes | Per decade |
|---|---|---|
| 40 | 13 | 3.6 |
| 50 | 4 (2008, 2009, 2020, 2025) | about 1.1 |
| 80 | 2 (2008, 2020) | about 0.6 |

### 1.5 Peg and policy breaks

Value of the defended currency after the break (FRED noon rates).

| Episode | 1 day | 1 week | 1 month | 3 months | 12 months | Worst within 2 years |
|---|---|---|---|---|---|---|
| GBP vs DEM, Sep 1992 (monthly data) | n/a | n/a | n/a | -12.7% | -10.2% | -16.0% |
| MXN, Dec 1994 | -12.2% | -26.3% | -34.5% | -50.5% | -54.9% | -56.9% |
| THB, Jul 1997 | -18.8% | -15.2% | -24.1% | -31.6% | -41.9% | -56.3% |
| KRW, late 1997 | 0% | -1.5% | -17.1% | -36.5% | -26.6% | -50.5% |
| BRL, Jan 1999 | -8.3% | -24.3% | -36.3% | -27.3% | -34.0% | -45.0% |
| RUB, Aug 1998 (monthly) | n/a | n/a | -9.8% | -60.9% | -74.4% | -78.3% |
| IDR, 1997-98 (monthly) | n/a | n/a | -2.9% | -19.0% | -82.3% | -83.0% |
| EUR vs CHF, 15 Jan 2015 | -13.8% | -17.1% | -11.6% | -14.2% | -8.9% | -18.6% (about -30% intraday) |
| CNY, Aug 2015 | -1.8% | -2.9% | -2.6% | -2.4% | -6.7% | -10.8% |
| GBP, Brexit vote 2016 | -7.8% | -10.5% | -11.5% | -11.5% | -14.0% | -18.1% |

**Pegs that held despite attacks:**
- The Hong Kong dollar has stayed in a 1.5% robust range since 1998.
- The Danish krone has stayed within about 1.0% since 1999.

In both cases the bettors lost carry and got squeezed rather than losing on spot moves.

**Famous discretionary FX trades, checked against the data:**
- Yen after the Plaza Accord (1985): +17% in 3 months and +53% in 11 months.
- D-mark after the Berlin Wall (1989): +26% in 13 months.
- New Zealand dollar after Krieger's 1987 short: only -3.3% in the next month, and +3.3% six months later. The famous kiwi trade was tactical.

**The payoff is bimodal.** A break moves the currency 10-80%, mostly within 1-3 months. When the peg holds, a well-structured bet loses little. Pegs suppress implied volatility, so options on a break are cheap. Selling that volatility is how people get blown up.

### 1.6 The pain inside the winners

Dividend-adjusted closes.

| Asset | Since | Multiple | CAGR | Max drawdown | Drawdowns ≥50% | Longest under water |
|---|---|---|---|---|---|---|
| Nvidia | 1999 | 6,100x | 37% | -90% | 7 | 8.5 years |
| Amazon | 1997 | 2,514x | 30.5% | -94% | 4 | 9.9 years |
| Apple | 1980 | 3,449x | 19.5% | -82% | 6 | 8.4 years |
| Microsoft | 1986 | 8,629x | 25% | -69% | 2 | 14.5 years |
| Monster | 1985 | 1,257x | 19.1% | -96% | 3 | 17.6 years |
| Bitcoin (data from 2014; -93% in 2011) | 2014 | 183x | 54% | -83% | 5 | 3.0 years |
| Solana | 2020 | 125x | 111% | -96% | 4 | 3.2 years |
| Cisco | 1990 | 2,155x | 23% | -89% | 2 | 21.4 years |
| MicroStrategy | 1998 | 15x | 10% | -99.9% | 3 | 24.7 years |

**Episodes, from the hindsight-best entry to the peak:**

| Episode | Entry to peak | Worst drawdown while holding | Fall after peak | Latest vs entry |
|---|---|---|---|---|
| GME, Apr 2020 to Jan 2021 | 124x in 9.8 months | -36% | -88% | 34x |
| AMC, 2021 | 32x in 4.9 months | -72% | -99.8% | 0.2x |
| Tesla, 2019-21 | 34x in 29 months | -61% | -74% | 30x |
| MicroStrategy, 2020-24 | 41x in 52 months | -89% | -83% | 14x |
| Nvidia, Oct 2022 to May 2026 | 21x in 43 months | -37% | -19% | 20x |
| Carvana, Dec 2022 to Jan 2026 | 129x in 37 months | -54% | -41% | 81x |
| Palantir, 2022-25 | 34.5x in 34 months | -41% | -48% | 31x |
| Super Micro, 2022-24 | 34x in 23 months | -35% | -85% | 12x |
| Bitcoin cycles: 2015→17, 2018→21, 2022→25 | 109x, then 21x, then 7.9x | -36%, -62%, -28% | -83%, -77%, -53% | n/a |
| Solana, 2020-21 | 502x in 18 months | -75% | -96% | 231x |
| Silver, Feb 2024 to Jan 2026 | 5.2x | -17% | -51% | 2.8x |

**What the episodes show:**
- The biggest multiples required sitting through drawdowns most people cannot stand.
- Multiples decay as an asset matures.
- Manias round-trip. The share of the peak gain retained today is 27% for GME, 31% for MicroStrategy, 42% for silver, and negative for AMC.

### 1.7 Sizing arithmetic

100,000 paths of 30 independent bets.

| Bet | Sizing | Median result | P(loss) | P(lose ≥90%) | P(drawdown >50%) | P(≥10x) |
|---|---|---|---|---|---|---|
| 35% chance of 4x (EV +40%) | 2% | 1.20x | 12% | 0% | 0% | 0% |
| | half-Kelly (6.7%) | 1.56x | 22% | 0% | 15% | 0.5% |
| | full Kelly (13.3%) | 1.65x | 23% | 0.8% | 80% | 12.5% |
| | 25% | 0.85x | 51% | 12% | 99% | 22% |
| | all-in | 0 | 100% | 100% | 100% | ~0% |
| Same bet, but true hit rate is 25% (EV 0) | full Kelly on the believed 35% | 0.39x | 67% | 10% | 96% | 0.8% |
| 10% chance of 15x (EV +50%) | Kelly (3.6%) | 1.26x | 41% | 0% | 25% | 0.8% |
| | 25% | 0.04x | 82% | 65% | 100% | 2.6% |
| 7% chance of 10x (EV -30%) | 5% | 0.50x | 84% | 0% | 80% | 0% |

**What the simulation shows:**
- **Oversizing is how famous "1000%" outcomes happen**: 22% of the 25%-per-bet paths reach 10x.
- **Oversizing is also how most people are ruined**: the median of those same paths is below 1x.
- **Overestimating the edge is the silent killer.** That is why fractional Kelly and haircut probabilities are needed.

## 2. Catalog of 67 great trades

Master table below. Per-trade cards (ex-ante signals, sizing, what could have gone wrong, sources) follow it. All fields are in `output/trade_catalog.csv`.

| # | Trade | Period | Return on capital at risk | Portfolio-level | Hold | Decisions | Archetype | Conf. |
|---|---|---|---|---|---|---|---|---|
| T01 | Thales of Miletus - olive presses | c. 6th c. BC | Unquantified ('made a lot of money'); premium was small | Unknown | One season | 2 | CONVEX + INFO / corner | C |
| T02 | Richard Cantillon - Mississippi System | 1719-1720 | 'Two fortunes'; magnitude uncertain (tens of millions of livres claimed) | Most of his bank's capital | ~1-2 years | Several | MANIA-L + PEG (monetary regime) | C |
| T03 | Thomas Guy - sells South Sea stock | 1711-1720 | ~4.5-5.5x on cost | 'Quintupled his fortune'; funded Guy's Hospital | Years; sale over ~3 months | Few (sell in tranches) | MANIA-L | B |
| T04 | Nathan Rothschild - Waterloo myth vs. the consols trade | 1815-1817 | ~+40% on a very large position; ~GBP 600m in today's money (Ferguson) | Large | ~2 years | 2 | CRISIS-I + PEG (war->peace fiscal regime) | B |
| T05 | Cornelius Vanderbilt - Harlem Railroad corners | 1863-1864 | Order of 10-30x on stock bought early (uncertain) | Large | ~2 years | Few | SQUEEZE + control | C |
| T06 | Northern Pacific corner | May 1901 | Up to ~10x for holders who sold into the peak | n/a | Days | 1-2 | SQUEEZE | B |
| T07 | Jesse Livermore - Union Pacific short | Apr 1906 | ~$250,000 profit (unknown base) | Large | Days-weeks | 2 | SHORT + event luck | C |
| T08 | Jesse Livermore - Panic of 1907 | Oct 1907 | Unknown base; large | Most of his capital | Weeks | Few | SHORT + CRISIS-I | C |
| T09 | Jesse Livermore - 1929 crash | 1929 | Unknown; figure contested (he denied it at the time) | All-in | Months | Many | SHORT + MANIA | C |
| T10 | Joseph P. Kennedy - exits before 1929 | 1928-1933 | Undocumented | Emerged richer from 1929 (Nasaw) | Months-years | Few | MANIA-L + SHORT | C |
| T11 | Buy the 1932 low (rule-based) | Jun 1932 -> | Real total return: 2.5x in 1y, 4.0x in 5y, 2.5x in 10y, 8.0x in 20y; 1,808x to date (8.3%/yr real) | 100% if all-in | Any | 1 | CRISIS-I | A |
| T12 | John Templeton - 104 stocks under $1 | 1939-1943 | ~4x on the basket (more on his equity, since fully borrowed) | ~100% of his net worth, borrowed | ~4 years | 2 | CRISIS-I + deep-value basket (option-like penny stocks) | B |
| T13 | Buy the 1942 low (rule-based) | Apr 1942 -> | Real TR 1.4x (1y), 1.8x (5y), 3.2x (10y), 12.2x (20y); 760x to date | 100% if all-in | Any | 1 | CRISIS-I | A |
| T14 | Graham-Newman buys half of GEICO | 1948-1972 | ~500x over ~24 years | ~25% of fund assets; Graham: this one decision out-earned all others combined | 24 years | 1-2 | COMPOUND + FORCED (family block sale) | B |
| T15 | Buffett Partnership - American Express | 1964-1968 | ~2.5x (commonly cited ~$20m gain) | 40% of the partnership (his self-imposed cap) | ~4 years | Few | CRISIS-C + INFO (scuttlebutt) | B |
| T16 | Li Ka-shing - Hong Kong 1967 riots | 1967-1980s | Unquantified; foundation of a multi-billion fortune | Concentrated | Decades | Few | CRISIS-C + FORCED (emigrating sellers) | B |
| T17 | Gold after the Nixon shock | 1971-1980 | ~20-24x in 8.5 years (silver: $1.3 -> $49.45) | n/a | 8.5 years | 2 | PEG + MANIA-L | A |
| T18 | Buffett - Washington Post | 1973-2014 | ~21x in 12 years | Large for Berkshire then | ~40 years | 1 | CRISIS-C + COMPOUND | A |
| T19 | Buy the 1974 low (rule-based) | Oct 1974 -> | Real TR 1.3x (1y), 1.4x (5y), 1.9x (10y), 5.3x (20y); 72x to date | 100% if all-in | Any | 1 | CRISIS-I | A |
| T20 | Buffett - GEICO rescue | 1976-1995 | ~37x by end-1994 (~50x at the buy-out) | Large | ~18 years | Few | CRISIS-C + FORCED (rescue capital) | A |
| T21 | Charlie Munger - Belridge Oil | 1977-1979 | ~32x in <2 years | Tiny (~$34.5k) - he called passing on more his biggest error | <2 years | 1 | INFO + deep value / hidden assets | B |
| T22 | Carlos Slim - Mexico 1982 | 1982-1990s | Unquantified; seed of a ~$100bn fortune | Concentrated | Decades | Several | CRISIS-C + FORCED (foreign owners exiting) | B |
| T23 | Buy the 1982 low (rule-based) | Aug 1982 -> | Real TR 1.6x (1y), 3.0x (5y), 3.8x (10y), 7.9x (20y); 58x to date | 100% if all-in | Any | 1 | CRISIS-I | A |
| T24 | Soros - yen after the Plaza Accord | Sep 1985 | JPY +17% in 3 months, +53% in 11 months (FRED) | Quantum +122% in 1985 | Months | Few | PEG + policy coordination | B |
| T25 | Paul Tudor Jones - 1987 crash | Oct 1987 | n/a (futures) | +62% in October; +125.9% net for 1987; ~$80-100m personal (est.) | Weeks | Few | CONVEX + SHORT (mania unwind) | B |
| T26 | Nassim Taleb - 1987 crash | Oct 1987 | Reported $35-40m for First Boston; multiple on premium unknown | Bank book | Months of bleed | Few | CONVEX | C |
| T27 | Andy Krieger - short NZD | Oct-Nov 1987 | Unknown (highly levered options) | Bank trading book (reported $700m limit) | Days-weeks | Few | CONVEX + liquidity | C |
| T28 | Buffett - Coca-Cola | 1988- | ~10x in 10 years (plus dividends); flat 1998-2011 | Largest Berkshire holding | 37+ years | 1 | COMPOUND + post-crash | A |
| T29 | Druckenmiller - long D-mark | 1988-1990 | DEM +26% vs USD in 13 months after Oct 1989 (FRED); P&L not documented | Large | ~1 year | Few | PEG + central-bank reaction function | C |
| T30 | Soros & Druckenmiller - sterling | Aug-Sep 1992 | >$1bn (GBP ~1bn) on sterling; downside was only the ~2-3% to the ERM floor plus carry | ~+15-20% of Quantum NAV in weeks; UK Treasury cost GBP 3.3bn | ~2 months | 3 (build, upsize, cover) | PEG | B |
| T31 | SoftBank - Alibaba | 2000-2014 | ~3,000x | Small cheque; offset SoftBank's own >90% share-price collapse in 2000-02 | 14 years | 1 | EARLY | A |
| T32 | Amazon from the IPO | 1997- | ~2,500x total (Adj. close since May 1997) | n/a | 29 years | 1 | COMPOUND + EARLY | A |
| T33 | Monster Beverage (Hansen Natural) | 1985- | ~1,250x (Adj. close); best US stock 1995-2015 | n/a | 40 years | 1 | COMPOUND | A |
| T34 | Jim Chanos - Enron short | Nov 2000-Dec 2001 | ~+100% on the short (max for a short) | Undisclosed (a $500m figure circulates, unverified) | 13 months | Several (added as evidence came) | SHORT + INFO | B |
| T35 | John Templeton - shorting IPO lock-up expiries | 1999-2000 | Reported ~$86m profit | Part of personal portfolio | Weeks-months | Many small | FORCED + SHORT (mania) | C |
| T36 | Peter Thiel - Facebook | 2004-2012 | ~2,000x | Small cheque | 8 years | 2 | EARLY | A |
| T37 | John Arnold - natural gas vs. Amaranth | 2006 | n/a (futures) | ~$1bn+ profit; Centaurus reportedly up several hundred % in 2006 | Months | Many | INFO + FORCED (Amaranth's liquidation) | B |
| T38 | Cornwall Capital (Ledley, Mai, Hockett) | 2003-2007 | ~100-500x on starting capital over 4 years (reported) | Whole fund | 4 years | Dozens of small bets + 1 big one | CONVEX + INFO | B |
| T39 | John Paulson - subprime CDS | 2006-2007 | Credit Opportunities fund +590% (2007); firm +$15bn | Paulson personally ~$3.7bn in 2007 | ~1.5 years | Several | CONVEX + INFO | B |
| T40 | Michael Burry - Scion subprime CDS | 2005-2008 | Scion +489% net Nov 2000-Jun 2008 (S&P ~+3%) | Investors ~$700m, Burry ~$100m | ~2-3 years | Several | INFO + CONVEX | B |
| T41 | Kyle Bass - Hayman subprime | 2006-2007 | Subprime fund +212% (2007); ~$500m profit | Firm-defining | ~1.5 years | Few | CONVEX + INFO | B |
| T42 | Andrew Lahde - subprime | 2007 | +866% in 2007 | Whole fund | ~1 year | Few | CONVEX | B |
| T43 | David Einhorn - Lehman (and Allied Capital) | 2002-2008 | ~+100% on the Lehman short | Undisclosed | 1-7 years | Several | SHORT + INFO | B |
| T44 | Porsche SE - Volkswagen options | 2005-Oct 2008 | Porsche booked >= EUR 6bn option gains; shorts lost > EUR 20bn | Company-level | ~3 years | Few | SQUEEZE + control / disclosure loophole | A |
| T45 | Buffett - Goldman Sachs & Bank of America rescue capital | 2008-2017 | BAC warrants alone ~$12bn gain on $5bn; GS ~$3bn+ | Large | 3-6 years | 2 each | FORCED + CRISIS-C | A |
| T46 | Buffett/Munger - BYD | 2008-2025 | ~39x peak; ~20-30x realised | Small for Berkshire | 17 years | Several (trims) | EARLY + COMPOUND | A |
| T47 | Buy the March 2009 low (rule-based) | Mar 2009 -> | Price 11.4x to Sep 2026; real TR 9.0x (13.4%/yr) | 100% if all-in | 17.5 years | 1 | CRISIS-I | A |
| T48 | Bitcoin - early adoption | 2010-2025 | ~2.5 million x (to ATH); ~1.7 million x to Sep 2026 | n/a | 15 years | 1 (but survive 5 crashes) | EARLY + MANIA-L | A |
| T49 | Ethereum ICO | 2014-2025 | ~15,700x to ATH; ~8,700x to Sep 2026 | n/a | 11 years | 1 | EARLY | A |
| T50 | Solana - 2020 public sale | Mar 2020-Jan 2025 | ~1,190x to ATH; ~540x to Sep 2026 | n/a | ~5 years | 1 (survive -96%) | EARLY + MANIA-L | A |
| T51 | Tesla 2019 -> 2021 | Jun 2019-Nov 2021 | 34x in 29 months | n/a | 2.4 years | 1-2 | MANIA-L + SQUEEZE (shorts lost $40bn in 2020) | A |
| T52 | SNB floor removal - the long-franc convexity side | 15 Jan 2015 | Deep-OTM EUR/CHF puts, priced cheaply because the floor suppressed implied volatility, paid very large multiples; few documented individual winners | n/a | Minutes-days | 1-2 | PEG + CONVEX | C |
| T53 | Brexit night (Crispin Odey) | 23-24 Jun 2016 | Claimed ~GBP 220m overnight | Fund-level | Overnight | 2 | INFO + PEG-like binary event | C |
| T54 | Prediction markets: Trump 2016 at ~18% | Nov 2016 | ~5.5x | n/a | Days-months | 1 | INFO + CONVEX (long-shot) | B |
| T55 | Buy the March 2020 low (rule-based) | Mar 2020 -> | Real TR 1.46x (1y), 1.88x (5y); price 3.4x to Sep 2026 | 100% if all-in | 6.5 years | 1 | CRISIS-I | A |
| T56 | Universa - March 2020 | Feb-Mar 2020 | +3,612% in March; +4,144% YTD Q1 - on 'required invested capital' (premium), not client portfolio | Portfolio-level benefit = offset of equity losses, not 36x | Continuous | Systematic | CONVEX | B |
| T57 | Bill Ackman - Pershing Square CDS hedge | Feb-Mar 2020 | ~96x in ~3-4 weeks | Premium ~0.4% of ~$6.5bn NAV -> ~+40% of NAV; PSH 2020 NAV +70.2% | ~4 weeks | 3 (buy, sell, redeploy) | CONVEX + CRISIS-I (redeploy) | A |
| T58 | Hertz - bankrupt equity | May 2020-Jun 2021 | ~10x in 2 weeks; ~14x for holders to emergence | n/a | 2 weeks-13 months | 1-2 | EVENT + CRISIS-C | B |
| T59 | Keith Gill (Roaring Kitty) - GameStop | 2019-Jan 2021 (and 2024) | ~900x on initial stake (incl. calls/adds); GME close 124x from Apr 2020 low to 27 Jan 2021 | Concentrated personal account | ~19 months | Few adds; held through | SQUEEZE + CRISIS-C / INFO | A |
| T60 | SPAC warrants | 2020-2021 | Avg merged-company warrant +44% 1-yr (2010-20 sample); outliers >10x | n/a | Months | 1-2 | EVENT + MANIA-L | B |
| T61 | MicroStrategy's bitcoin pivot | Aug 2020-Nov 2024 (-> 2026) | 41x in 52 months | n/a | 4.3 years | 1 | MANIA-L + reflexive premium | A |
| T62 | Nvidia - Oct 2022 low -> AI boom | Oct 2022-2026 | 21x in 43 months | n/a | 3.6 years | 1 | COMPOUND + CRISIS-C | A |
| T63 | Carvana - Dec 2022 low -> recovery | Dec 2022-Jan 2026 | 129x in 37 months | n/a | 3 years | 1 | CRISIS-C + SQUEEZE | A |
| T64 | Palantir - Dec 2022 low | Dec 2022-Nov 2025 | 34.5x | n/a | 2.9 years | 1 | MANIA-L + COMPOUND | A |
| T65 | 'Theo' - Polymarket 2024 election whale | Oct-Nov 2024 | ~$79m (Chainalysis) - $85m (claimed) profit: ~2-3x on stake | Share of his wealth not disclosed | ~1-2 months | Many (accumulation) | INFO | B |
| T66 | Buy the April 2025 tariff-crash low | Apr 2025-Sep 2026 | +54% price in 17.7 months | 100% if all-in | 1.5 years | 1 | CRISIS-I | A |
| T67 | Gold & silver 2024-26 run | Feb 2024-Jan 2026 | Gold 2.7x; silver 5.2x | n/a | 2 years | 1-2 | MANIA-L + PEG-like (debasement narrative) | A |


### Trade cards - Ancient & early modern

**T01. Thales of Miletus - olive presses** (c. 6th c. BC; conf. C)  
*Instrument / entry -> exit:* Deposits reserving all olive presses in Miletus & Chios (a call option on press capacity); Paid small off-season deposits; rented presses out at his own price when a bumper harvest came.  
*Ex-ante signals:* Forecast of a large harvest (attributed to astronomy); no competing bidders in winter. *Sizing:* Small premium ('a little money').  
*What could have gone wrong:* Poor harvest -> deposits lost (loss capped at premium). *Sources:* Aristotle, Politics I.11 (1259a), written ~250 years later as a parable.

**T02. Richard Cantillon - Mississippi System** (1719-1720; conf. C)  
*Instrument / entry -> exit:* Mississippi Co. shares, then short the livre / Law's paper via bills of exchange; loans against shares; Bought early, sold into the 1719 surge (shares 500 -> ~10,000 livres), moved into foreign currency, then collected on loans after the crash.  
*Ex-ante signals:* Law printing unbacked notes to hold shares at 9,000 livres -> currency must fall; insider view of the System. *Sizing:* Large.  
*What could have gone wrong:* Expelled by Law; years of lawsuits from borrowers; political confiscation risk. *Sources:* Murphy (1986) Richard Cantillon: Entrepreneur and Economist.

**T03. Thomas Guy - sells South Sea stock** (1711-1720; conf. B)  
*Instrument / entry -> exit:* South Sea Company stock (long-held); Accumulated for ~GBP 42-54k; sold April-June 1720 for GBP 234,428, months before the September crash.  
*Ex-ante signals:* Stock up ~8x in 6 months on company-financed purchases and serial subscriptions. *Sizing:* Existing core holding.  
*What could have gone wrong:* Selling early was the only 'risk'; holding on (like Newton) was the real danger. *Sources:* Thomas Guy biographies; Odlyzko (2019) Notes & Records 73(1).

**T04. Nathan Rothschild - Waterloo myth vs. the consols trade** (1815-1817; conf. B)  
*Instrument / entry -> exit:* British government consols; MYTH: killing on early Waterloo news (traced to an 1846 antisemitic pamphlet). FACT (Ferguson): bought consols after the war, sold in 1817 after a >40% rise.  
*Ex-ante signals:* End of 20+ years of war borrowing -> falling yields; he was initially long gold (wrong side). *Sizing:* Very large.  
*What could have gone wrong:* Renewed war/inflation; he first lost on bullion when peace cut demand. *Sources:* Ferguson (1998) House of Rothschild; Ferguson (2008) Ascent of Money; Cathcart (2015) The News from Waterloo.

**T05. Cornelius Vanderbilt - Harlem Railroad corners** (1863-1864; conf. C)  
*Instrument / entry -> exit:* Harlem Railroad stock vs. short sellers (incl. NY aldermen); Controlled the float; shorts forced to cover at ~$179 (1863) and ~$285 (1864) vs. ~$10 in 1862.  
*Ex-ante signals:* Shorts > float; opponents' political manipulation. *Sizing:* Control stake.  
*What could have gone wrong:* Would be illegal manipulation today (Exchange Act s.9). *Sources:* Gordon (1988) The Scarlet Woman of Wall Street; Renehan (2007) Commodore.

**T06. Northern Pacific corner** (May 1901; conf. B)  
*Instrument / entry -> exit:* Northern Pacific common; Harriman vs. Hill/Morgan control fight: ~$100-110 -> $1,000 intraday on 9 May 1901; shorts settled at $150.  
*Ex-ante signals:* Two buyers competing for a majority + large short interest + delivery deadlines. *Sizing:* n/a.  
*What could have gone wrong:* Shorts ruined; market-wide panic as they dumped other stocks. *Sources:* NYT 10 May 1901; 'Panic of 1901' (Wikipedia summary of contemporary press).

### Trade cards - 1900-1945

**T07. Jesse Livermore - Union Pacific short** (Apr 1906; conf. C)  
*Instrument / entry -> exit:* Union Pacific stock (short); Shorted days before the San Francisco earthquake.  
*Ex-ante signals:* 'Hunch' about an extended market; mostly luck. *Sizing:* Heavily margined.  
*What could have gone wrong:* A rally would have hurt a margined short. *Sources:* Lefevre (1923, fictionalised); Smitten (2001); Rubython (2014).

**T08. Jesse Livermore - Panic of 1907** (Oct 1907; conf. C)  
*Instrument / entry -> exit:* Stocks (short, then long); Short into the call-money squeeze; reportedly ~$1m in a day, ~$3m for the episode; covered and went long at J.P. Morgan's urging.  
*Ex-ante signals:* Bank runs, call money >100%. *Sizing:* Margined.  
*What could have gone wrong:* Lost it all within a year (cotton, 1908). *Sources:* Lefevre (1923); Smitten (2001).

**T09. Jesse Livermore - 1929 crash** (1929; conf. C)  
*Instrument / entry -> exit:* Stocks (short); Built shorts through 1929 after early losses; reported ~$100m profit.  
*Ex-ante signals:* Extreme margin debt, speculation, weakening breadth. *Sizing:* Heavily leveraged.  
*What could have gone wrong:* He was early and lost first; bankrupt again by 1934; suicide 1940. *Sources:* Smitten (2001); Rubython (2014).

**T10. Joseph P. Kennedy - exits before 1929** (1928-1933; conf. C)  
*Instrument / entry -> exit:* Stocks; short sales; trading pools; Sold most stock before the crash and shorted; profited from pools (legal then).  
*Ex-ante signals:* Speculative excess (the 'shoeshine boy' story first appears in a 1965 biography - folklore). *Sizing:* Unknown.  
*What could have gone wrong:* Pools were outlawed in 1934 - he became the first SEC chairman. *Sources:* Nasaw (2012) The Patriarch; Barry Popik on the shoeshine anecdote.

**T11. Buy the 1932 low (rule-based)** (Jun 1932 ->; conf. A)  
*Instrument / entry -> exit:* US stock market (S&P composite, dividends reinvested); Monthly low Jun 1932 (-86% from 1929 top, CAPE 5.6, dividend yield ~14%).  
*Ex-ante signals:* -86% drawdown, CAPE ~5-6, deflation, bank failures, regime change in policy (1933). *Sizing:* Unlevered.  
*What could have gone wrong:* Buying at -80% (Apr 1932) still meant a further -30%; 1937-38 fell 54% again. *Sources:* Shiller data; generational_lows.py.

**T12. John Templeton - 104 stocks under $1** (1939-1943; conf. B)  
*Instrument / entry -> exit:* $100 of each of 104 NYSE/AMEX stocks priced <= $1 (34 in bankruptcy); Borrowed $10,000 when WWII began (Sep 1939); sold after ~4 years for ~$40,000; 100 of 104 profitable, 4 worthless.  
*Ex-ante signals:* War panic; stocks priced as options on survival; war demand would revive industry. *Sizing:* All-in on borrowed money, but diversified across 104 names.  
*What could have gone wrong:* Allied defeat / prolonged depression -> he would owe $10k from salary. *Sources:* Templeton & Phillips (2008) Investing the Templeton Way; Templeton biographies.

**T13. Buy the 1942 low (rule-based)** (Apr 1942 ->; conf. A)  
*Instrument / entry -> exit:* US stock market; Monthly low Apr 1942 (-77% below 1929 peak, CAPE 8.5) during Pacific defeats.  
*Ex-ante signals:* War news at its worst; CAPE < 10. *Sizing:* Unlevered.  
*What could have gone wrong:* 1946-49 bear market and post-war inflation cut 5-yr real returns. *Sources:* Shiller data; generational_lows.py.

### Trade cards - 1945-1990

**T14. Graham-Newman buys half of GEICO** (1948-1972; conf. B)  
*Instrument / entry -> exit:* Private block: 50% of GEICO from the founding family; Paid $712,500 (~10% below book); stake distributed to fund holders; market value ~$400m at the 1972 peak (reported).  
*Ex-ante signals:* Low-cost direct insurer with superior economics, bought below book from a motivated seller. *Sizing:* 25% - broke Graham's own diversification rules.  
*What could have gone wrong:* GEICO later fell ~95% (1972-76) and nearly failed. *Sources:* Graham, The Intelligent Investor (postscript); Graham-Newman histories.

**T15. Buffett Partnership - American Express** (1964-1968; conf. B)  
*Instrument / entry -> exit:* AmEx common; Salad-oil scandal: $61.8 -> $35.3 (Jun 1964); bought ~$13m at ~$41 avg; sold 1967-68.  
*Ex-ante signals:* Liability finite vs. franchise value; merchants & customers still used AmEx cards/cheques. *Sizing:* 40%, unlevered.  
*What could have gone wrong:* Liability larger than feared / brand damage. *Sources:* Buffett Partnership letters; Fortune (2024).

**T16. Li Ka-shing - Hong Kong 1967 riots** (1967-1980s; conf. B)  
*Instrument / entry -> exit:* Hong Kong land & buildings; Bought from fleeing owners after the 1967 riots; Cheung Kong (1971) built ~1 in 7 private flats in HK by 1983.  
*Ex-ante signals:* Political panic + emigration while the administrative/legal system held. *Sizing:* Concentrated, some leverage.  
*What could have gone wrong:* Chinese takeover/expropriation (the tail that made it cheap). *Sources:* Wikipedia; HKFP (2016); Bloomberg profile.

**T17. Gold after the Nixon shock** (1971-1980; conf. A)  
*Instrument / entry -> exit:* Gold (US persons: via miners/abroad until 1975); $35 official (Aug 1971) -> $850 London fix (21 Jan 1980).  
*Ex-ante signals:* Bretton Woods strain, falling US gold cover, rising inflation, fixed price below market. *Sizing:* n/a.  
*What could have gone wrong:* Holders at the 1980 top lost ~2/3 in 2 years and waited until 2008 to break even nominally. *Sources:* LBMA/historical fixes.

**T18. Buffett - Washington Post** (1973-2014; conf. A)  
*Instrument / entry -> exit:* WPO class B; $10.6m in the 1973-74 bear (~1/4 of appraised value) -> $221m by 1985.  
*Ex-ante signals:* Private-market value ~$400m vs. ~$80m market cap; Watergate-era pressure; 1974 bear. *Sizing:* Unlevered.  
*What could have gone wrong:* Fell further after purchase; newspapers' later structural decline. *Sources:* Berkshire letters (1985).

**T19. Buy the 1974 low (rule-based)** (Oct 1974 ->; conf. A)  
*Instrument / entry -> exit:* US stock market; Daily low 3 Oct 1974 (-48%, CAPE 8.3).  
*Ex-ante signals:* -48% drawdown, CAPE < 10, oil shock, stagflation. *Sizing:* Unlevered.  
*What could have gone wrong:* High inflation in 1977-81 held real returns down for a decade. *Sources:* Shiller data; generational_lows.py.

**T20. Buffett - GEICO rescue** (1976-1995; conf. A)  
*Instrument / entry -> exit:* GEICO common + convertible preferred in the recapitalisation; Stock ~$2 (from ~$61 in 1972); $45.7m invested 1976-80 -> $1.68bn market value at end-1994; 1995-96 buy-out of the rest implied ~$2.3bn for Berkshire's half.  
*Ex-ante signals:* Franchise intact; new CEO; recapitalisation under way. *Sizing:* Unlevered.  
*What could have gone wrong:* Failed recap -> wipe-out. *Sources:* Berkshire letters (1976-1995); GEICO 1995 proxy.

**T21. Charlie Munger - Belridge Oil** (1977-1979; conf. B)  
*Instrument / entry -> exit:* Illiquid OTC shares; Bought 300 shares at $115; declined 1,500 more; Shell paid $3,665/share (1979).  
*Ex-ante signals:* Market cap far below value of oil reserves; illiquidity kept it cheap. *Sizing:* Far too small (declined extra 1,500 shares).  
*What could have gone wrong:* Illiquidity; oil price collapse. *Sources:* Munger's own accounts (Wesco/Berkshire meetings).

**T22. Carlos Slim - Mexico 1982** (1982-1990s; conf. B)  
*Instrument / entry -> exit:* Controlling stakes in Mexican companies; Bought during the debt crisis/capital flight (e.g. Reynolds Aluminum & General Tire affiliates, Sanborns, Frisco ~$50m).  
*Ex-ante signals:* Default, devaluation, capital flight, foreign parents dumping subsidiaries. *Sizing:* Concentrated.  
*What could have gone wrong:* Nationalisation (banks were nationalised in 1982). *Sources:* Encyclopedia.com; Academy of Achievement; Wikipedia.

**T23. Buy the 1982 low (rule-based)** (Aug 1982 ->; conf. A)  
*Instrument / entry -> exit:* US stock market; Daily low 12 Aug 1982 (-27% from 1980 high; CAPE 6.6, 10y yield ~13%).  
*Ex-ante signals:* CAPE < 8 and Volcker pivot (Fed easing summer 1982). *Sizing:* Unlevered.  
*What could have gone wrong:* Low drawdown depth: a drawdown rule alone would not have fired. *Sources:* Shiller data; generational_lows.py.

**T24. Soros - yen after the Plaza Accord** (Sep 1985; conf. B)  
*Instrument / entry -> exit:* Leveraged long JPY/DEM vs USD; Positions larger than the fund; ~$150m in a day after the 22 Sep 1985 accord.  
*Ex-ante signals:* Overvalued dollar; Baker Treasury shift; G5 meeting. *Sizing:* Leverage > 1x NAV.  
*What could have gone wrong:* Intervention failure; 1987 shows the same style's crash risk. *Sources:* Soros (1987) The Alchemy of Finance; Time; macro_fx_trades.csv.

**T25. Paul Tudor Jones - 1987 crash** (Oct 1987; conf. B)  
*Instrument / entry -> exit:* Short S&P futures / long bonds; Positioned using a 1929 price analog; covered around the crash.  
*Ex-ante signals:* +44% YTD rally with 10y yields 7%->10%, weak dollar, portfolio-insurance feedback, 1929 analog. *Sizing:* Leveraged futures with tight risk control.  
*What could have gone wrong:* Analog charts fail far more often than they work. *Sources:* Mallaby (2010) More Money Than God; Tudor Investment Corp. (Wikipedia).

**T26. Nassim Taleb - 1987 crash** (Oct 1987; conf. C)  
*Instrument / entry -> exit:* Long out-of-the-money Eurodollar futures options; Held a large long-convexity book; Fed liquidity flood made it explode.  
*Ex-ante signals:* Cheap wings; belief that markets under-price tails. *Sizing:* Premium budget.  
*What could have gone wrong:* Premium decay if nothing happens (the usual outcome). *Sources:* Forbes (2009); Bloomberg (2017).

**T27. Andy Krieger - short NZD** (Oct-Nov 1987; conf. C)  
*Instrument / entry -> exit:* Leveraged NZD options at Bankers Trust; Shorted the kiwi after the crash; reported ~$300m for the bank.  
*Ex-ante signals:* Thin market, high-yield currency after a global risk shock. *Sizing:* Far beyond normal limits.  
*What could have gone wrong:* NZD was HIGHER 6 months later (+3.3%, FRED): tactical, not durable; 'bigger than NZ money supply' is folklore. *Sources:* Trade press; macro_fx_trades.csv.

**T28. Buffett - Coca-Cola** (1988-; conf. A)  
*Instrument / entry -> exit:* KO common; $1.299bn bought 1988-89 after the crash -> $13.4bn by end-1998.  
*Ex-ante signals:* Global brand, buybacks, focus under Goizueta; post-crash valuation. *Sizing:* Unlevered, concentrated.  
*What could have gone wrong:* Over-valuation by 1998 -> 13 flat years. *Sources:* Berkshire letters (1988-1998).

**T29. Druckenmiller - long D-mark** (1988-1990; conf. C)  
*Instrument / entry -> exit:* Long DEM vs USD; ~$1bn position Soros told him to double ('You call that a position?'); after the Wall fell (Nov 1989) bet on reunification + Bundesbank tightening.  
*Ex-ante signals:* Fiscal shock of reunification -> Bundesbank must tighten. *Sizing:* Soros-style concentration.  
*What could have gone wrong:* Bundesbank accommodation. *Sources:* Schwager (1992) The New Market Wizards; macro_fx_trades.csv.

### Trade cards - 1990-2007

**T30. Soros & Druckenmiller - sterling** (Aug-Sep 1992; conf. B)  
*Instrument / entry -> exit:* Short GBP vs DEM (forwards/options), ~$10bn at peak; Built through summer 1992; UK left the ERM 16 Sep 1992.  
*Ex-ante signals:* Peg far above fundamentals (UK recession, 10% rates) vs. tightening Bundesbank; Schlesinger remarks 15 Sep; finite reserves. *Sizing:* ~1.5x NAV - acceptable only because the peg band capped the loss.  
*What could have gone wrong:* Realignment or German rate cut -> small loss; France's franc survived similar attacks. *Sources:* Mallaby (2010); Black Wednesday (Wikipedia/HM Treasury 2005); peg_breaks.csv.

**T31. SoftBank - Alibaba** (2000-2014; conf. A)  
*Instrument / entry -> exit:* Private venture stake; $20m in 2000 -> ~$58-75bn at the Sept 2014 IPO.  
*Ex-ante signals:* Founder quality; China internet adoption. *Sizing:* Small cheque.  
*What could have gone wrong:* Most of SoftBank's 2000-era bets failed. *Sources:* Bloomberg (2014); Yahoo 10-K.

**T32. Amazon from the IPO** (1997-; conf. A)  
*Instrument / entry -> exit:* AMZN common; Split-adjusted IPO-era price -> 2026.  
*Ex-ante signals:* Category-defining platform; founder-led; reinvestment runway. *Sizing:* n/a.  
*What could have gone wrong:* -94% drawdown 1999-2001 and 9.9 years under water (computed). *Sources:* long_winner_pain.csv.

**T33. Monster Beverage (Hansen Natural)** (1985-; conf. A)  
*Instrument / entry -> exit:* MNST common; 1985 -> 2026.  
*Ex-ante signals:* Tiny, cheap, then a new product category (energy drinks, 2002). *Sizing:* n/a.  
*What could have gone wrong:* -96% drawdown 1986-95; 17.6 years under water (computed). *Sources:* long_winner_pain.csv; CNBC (2024).

**T34. Jim Chanos - Enron short** (Nov 2000-Dec 2001; conf. B)  
*Instrument / entry -> exit:* Enron (short); Shorted ~$70-80 after reading the 10-Q; Enron bankrupt Dec 2001 (~$0.26).  
*Ex-ante signals:* Low ROIC, opaque related-party SPEs, heavy insider selling, 'mark-to-market' earnings. *Sizing:* Grew position as thesis confirmed.  
*What could have gone wrong:* Squeeze/borrow recall; many other Kynikos shorts lost for years (funds closed 2023). *Sources:* SEC roundtable testimony (Chanos); Barron's.

**T35. John Templeton - shorting IPO lock-up expiries** (1999-2000; conf. C)  
*Instrument / entry -> exit:* Short ~80+ bubble-era tech IPOs; Shorted ~11 days before insider lock-ups expired.  
*Ex-ante signals:* Stocks up 3x+ since IPO; mechanical insider supply at lock-up expiry. *Sizing:* Spread across many names.  
*What could have gone wrong:* Mania could keep running; squeeze risk. *Sources:* Templeton & Phillips (2008).

**T36. Peter Thiel - Facebook** (2004-2012; conf. A)  
*Instrument / entry -> exit:* Angel note -> ~10% of Facebook; $500k (2004) -> >$1bn realised after the 2012 IPO.  
*Ex-ante signals:* Network effects visible in campus adoption. *Sizing:* Small.  
*What could have gone wrong:* Venture base rates: most angel bets return zero. *Sources:* CNBC (2017); TechCrunch (2012).

**T37. John Arnold - natural gas vs. Amaranth** (2006; conf. B)  
*Instrument / entry -> exit:* NYMEX natural-gas spreads; Took the other side of Amaranth's winter/summer spreads as they collapsed.  
*Ex-ante signals:* Visible crowding: one fund holding a huge share of open interest in a few contract months. *Sizing:* Large.  
*What could have gone wrong:* Squeeze if Amaranth had been able to hold. *Sources:* MoneyWeek; US Senate PSI (2007) report on Amaranth.

**T38. Cornwall Capital (Ledley, Mai, Hockett)** (2003-2007; conf. B)  
*Instrument / entry -> exit:* Cheap long-dated options; then CDS on AA tranches of subprime CDOs; $110k Schwab account (2003) -> ~$12-30m by 2006 -> ~$80m+ gain on subprime protection (2007).  
*Ex-ante signals:* Options priced with thin tails on binary situations; AA tranches insured for ~0.5%/yr. *Sizing:* Many small premium bets; premium never large vs. capital.  
*What could have gone wrong:* Counterparty (Bear/Lehman) and bleed. *Sources:* Lewis (2010) The Big Short; Cornwall Capital (Wikipedia).

**T39. John Paulson - subprime CDS** (2006-2007; conf. B)  
*Instrument / entry -> exit:* CDS/ABX protection on subprime RMBS; Bought protection from mid-2006 (~1-2%/yr premium); collected 2007-08.  
*Ex-ante signals:* Record house-price/income; collapsing lending standards; home-price stalls wipe out BBB tranches; protection cheap. *Sizing:* Dedicated funds; premium modest vs. capital.  
*What could have gone wrong:* Bleed while housing kept rising; bank counterparties. *Sources:* Zuckerman (2009) The Greatest Trade Ever; WSJ; Institutional Investor.

**T40. Michael Burry - Scion subprime CDS** (2005-2008; conf. B)  
*Instrument / entry -> exit:* CDS on subprime MBS; Bought from 2005; investor revolt & side-pocket during the 2006 bleed; paid off 2007.  
*Ex-ante signals:* Read the prospectuses: teaser-rate ARMs resetting 2007. *Sizing:* Large premium outlay, painful.  
*What could have gone wrong:* Nearly lost his investors before being proven right. *Sources:* Lewis (2010); Scion (Wikipedia).

**T41. Kyle Bass - Hayman subprime** (2006-2007; conf. B)  
*Instrument / entry -> exit:* Subprime CDS; Started 2005 with $33m.  
*Ex-ante signals:* As Paulson. *Sizing:* Dedicated fund.  
*What could have gone wrong:* Later 'next big short' bets (JGBs, HKD peg) did not pay; 1.6%/yr 2008-mid-2015. *Sources:* Kyle Bass (Wikipedia); Fortune (2016).

**T42. Andrew Lahde - subprime** (2007; conf. B)  
*Instrument / entry -> exit:* Subprime CDS; Small fund (~$80m by 2008); closed Oct 2008 citing counterparty risk.  
*Ex-ante signals:* As Paulson. *Sizing:* Concentrated.  
*What could have gone wrong:* Counterparty default (why he quit). *Sources:* Andrew Lahde (Wikipedia); LA Business Journal.

**T43. David Einhorn - Lehman (and Allied Capital)** (2002-2008; conf. B)  
*Instrument / entry -> exit:* Short equity; Allied: 2002-09 campaign netted only ~$35m; Lehman: short from Jul 2007, public case 2007-08, bankrupt Sep 2008.  
*Ex-ante signals:* Leverage, questionable marks, shrinking funding. *Sizing:* Moderate.  
*What could have gone wrong:* Years of regulatory/PR war (Allied); squeezes. *Sources:* Einhorn (2008) Fooling Some of the People; Institutional Investor.

### Trade cards - 2008-2019

**T44. Porsche SE - Volkswagen options** (2005-Oct 2008; conf. A)  
*Instrument / entry -> exit:* VW shares + cash-settled options (74.1% combined); Disclosed 26 Oct 2008 -> VW ord. EUR 211 -> >EUR 1,005 intraday (28 Oct); free float <6% vs. ~12% short interest.  
*Ex-ante signals:* Stake-building via undisclosed cash-settled options. *Sizing:* Bet-the-company.  
*What could have gone wrong:* Porsche then nearly collapsed under ~EUR 10bn debt and was absorbed by VW (2009). *Sources:* Harvard Law corpgov (2021) study summary; Porsche disclosure.

**T45. Buffett - Goldman Sachs & Bank of America rescue capital** (2008-2017; conf. A)  
*Instrument / entry -> exit:* 10% / 6% preferreds + warrants; GS $5bn (Sep 2008); BAC $5bn (Aug 2011) with warrants on 700m shares at $7.14, exercised 2017.  
*Ex-ante signals:* Issuer needed a confidence signal; negotiated terms; senior security + upside. *Sizing:* Large but senior.  
*What could have gone wrong:* Bank failure (mitigated by seniority and systemic support). *Sources:* BAC 8-K (2011); CNBC (2017).

**T46. Buffett/Munger - BYD** (2008-2025; conf. A)  
*Instrument / entry -> exit:* BYD H-shares; $230m for ~10% (Sep 2008) -> ~$9bn peak (2022); fully sold by 2025.  
*Ex-ante signals:* Founder, batteries -> EVs; Li Lu/Munger research. *Sizing:* Small.  
*What could have gone wrong:* Chinese policy/competition. *Sources:* CNBC (2025); CNN (2025).

**T47. Buy the March 2009 low (rule-based)** (Mar 2009 ->; conf. A)  
*Instrument / entry -> exit:* US stock market; Daily low 9 Mar 2009 (-57%).  
*Ex-ante signals:* -57% drawdown, VIX >40 for months, TARP/QE policy pivot. *Sizing:* Unlevered.  
*What could have gone wrong:* Buyers at -40% (Oct 2008) first saw another -30%. *Sources:* generational_lows.py.

**T48. Bitcoin - early adoption** (2010-2025; conf. A)  
*Instrument / entry -> exit:* BTC; First Mt.Gox trade $0.0495 (Jul 2010) -> $124,753 close (6 Oct 2025).  
*Ex-ante signals:* Novel scarce digital asset; tiny market cap. *Sizing:* Tiny amounts.  
*What could have gone wrong:* Drawdowns -93% (2011), -86%, -84%, -77%, -53% (2025-26); Mt.Gox theft; lost keys; most early coins were sold far too soon. *Sources:* Exchange records; winners_and_squeezes.py.

**T49. Ethereum ICO** (2014-2025; conf. A)  
*Instrument / entry -> exit:* ETH; $0.31 (Jul-Sep 2014 sale) -> $4,831 close (Aug 2025).  
*Ex-ante signals:* Programmable blockchain; developer adoption. *Sizing:* n/a.  
*What could have gone wrong:* -94% drawdown in 2018; thousands of 2017-18 ICOs went to ~0. *Sources:* Ethereum Foundation blog (2014); price data.

**T50. Solana - 2020 public sale** (Mar 2020-Jan 2025; conf. A)  
*Instrument / entry -> exit:* SOL; CoinList auction $0.22 (24 Mar 2020) -> $261.87 close (18 Jan 2025).  
*Ex-ante signals:* High-throughput chain launched into the 2020-21 crypto cycle. *Sizing:* n/a.  
*What could have gone wrong:* -96% drawdown 2021-22 (FTX/Alameda backers collapsed); -76% again 2025-26. *Sources:* CoinList (2020); winners_and_squeezes.py.

**T51. Tesla 2019 -> 2021** (Jun 2019-Nov 2021; conf. A)  
*Instrument / entry -> exit:* TSLA; $11.93 (split-adj., Jun 2019) -> $409.97 (Nov 2021).  
*Ex-ante signals:* Model 3 ramp success, profitability inflection, S&P inclusion, huge short interest. *Sizing:* n/a.  
*What could have gone wrong:* -61% drawdown along the way (Feb-Mar 2020); -74% after the 2021 peak. *Sources:* winners_and_squeezes.py; S3 Partners via CNN (2021).

**T52. SNB floor removal - the long-franc convexity side** (15 Jan 2015; conf. C)  
*Instrument / entry -> exit:* Long CHF / EUR-CHF puts; EUR/CHF 1.20 floor abandoned without warning: 1.201 -> ~0.85 intraday, 1.03-1.04 close (-14% at the noon fix).  
*Ex-ante signals:* Floor defended by ever-larger SNB balance sheet (~80% of GDP); ECB QE imminent (22 Jan 2015); SNB had just affirmed the floor. *Sizing:* Premium only.  
*What could have gone wrong:* The floor could have lasted years (it had held 3.3 years) -> premium bleed. *Sources:* CRS (2015); SNB; peg_breaks.csv (move is grade A).

**T53. Brexit night (Crispin Odey)** (23-24 Jun 2016; conf. C)  
*Instrument / entry -> exit:* Short GBP, long gold/UK shorts; Positioned for Leave while markets priced ~75-85% Remain; GBP -7.8% day one (noon rates), -18% by Jan 2017.  
*Ex-ante signals:* Polls near 50/50 while markets priced Remain as a near-certainty. *Sizing:* Large.  
*What could have gone wrong:* Reportedly gave the gains back within weeks as markets rallied. *Sources:* The London Economic; Fortune (2022); peg_breaks.csv.

**T54. Prediction markets: Trump 2016 at ~18%** (Nov 2016; conf. B)  
*Instrument / entry -> exit:* Betfair / PredictIt contracts; Trump ~18% on Betfair the day before the vote.  
*Ex-ante signals:* State polls within error; correlated polling errors under-priced. *Sizing:* n/a.  
*What could have gone wrong:* Same logic lost in 2020 (post-election Trump contracts at 10-15% went to 0). *Sources:* Newsweek; CNBC (2016).

### Trade cards - 2020-2026

**T55. Buy the March 2020 low (rule-based)** (Mar 2020 ->; conf. A)  
*Instrument / entry -> exit:* US stock market; Daily low 23 Mar 2020 (-34% in 23 trading days; VIX close 82.7 on 16 Mar).  
*Ex-ante signals:* Fastest -30% in history, VIX > 80, unlimited QE (23 Mar) + fiscal package. *Sizing:* Unlevered.  
*What could have gone wrong:* A deeper pandemic depression; buyers at -20% (early Mar) first saw another -18%. *Sources:* generational_lows.py; crash_base_rates.py.

**T56. Universa - March 2020** (Feb-Mar 2020; conf. B)  
*Instrument / entry -> exit:* Deep OTM S&P puts (tail hedge); Rolling tail protection; monetised during the Covid crash.  
*Ex-ante signals:* Systematic; always on. *Sizing:* Small sleeve with the rest in equities.  
*What could have gone wrong:* Bleed in normal years; tail-risk hedge fund index ~-3%/yr since 2008. *Sources:* Bloomberg (8 Apr 2020); Forbes (2020); AQR (2011).

**T57. Bill Ackman - Pershing Square CDS hedge** (Feb-Mar 2020; conf. A)  
*Instrument / entry -> exit:* CDX IG/HY credit-default-swap index protection; Paid ~$27m premium (late Feb); closed for ~$2.6bn in March; reinvested in equities near the low.  
*Ex-ante signals:* Credit spreads near historic tights (cheap protection) + visible catalyst (Covid spreading outside China). *Sizing:* Tiny premium vs. NAV.  
*What could have gone wrong:* Virus contained -> lose ~0.4% of NAV. *Sources:* Pershing Square letters; Forbes (27 Mar 2020).

**T58. Hertz - bankrupt equity** (May 2020-Jun 2021; conf. B)  
*Instrument / entry -> exit:* HTZ/HTZGQ common in Chapter 11; ~$0.56 after the 22 May 2020 filing -> ~$5.50 (8 Jun 2020); 2021 plan gave holders ~$8/share (cash + new equity + warrants).  
*Ex-ante signals:* Used-car price boom lifted fleet value above debt; bidding war for the equity. *Sizing:* n/a.  
*What could have gone wrong:* Equity in Ch.11 is usually wiped out; the new HTZ shares fell ~96% from the Nov-2021 relisting-day high ($35.06) to Aug 2026 ($1.51) (computed). *Sources:* Wikipedia; Bloomberg (12 May 2021); SEC filings; winners_and_squeezes.py.

**T59. Keith Gill (Roaring Kitty) - GameStop** (2019-Jan 2021 (and 2024); conf. A)  
*Instrument / entry -> exit:* GME shares + calls; ~$53k from mid-2019 (~$4-5/share pre-split) -> ~$48m at the 27 Jan 2021 peak; 2024: ~9m shares ~$262m.  
*Ex-ante signals:* Net cash, EV/sales ~0.1x, console cycle, Ryan Cohen stake (Aug-Sep 2020), short interest >100% of float. *Sizing:* All-in on one idea.  
*What could have gone wrong:* Declining retailer could have gone bankrupt; GME -88% after the peak. *Sources:* CNBC (2024); his posted statements; winners_and_squeezes.py.

**T60. SPAC warrants** (2020-2021; conf. B)  
*Instrument / entry -> exit:* Listed SPAC warrants (strike $11.50); Bought pre-deal at $1-2; deal rumours (e.g. Lucid/CCIV, QuantumScape) sent some to many multiples.  
*Ex-ante signals:* Free option on a deal with $10 trust floor for units; retail mania. *Sizing:* n/a.  
*What could have gone wrong:* 2021-22 de-SPACs lost ~60-67%; most warrants expired worthless. *Sources:* Gahng, Ritter & Zhang (2023) RFS; Klausner, Ohlrogge & Ruan (2022).

**T61. MicroStrategy's bitcoin pivot** (Aug 2020-Nov 2024 (-> 2026); conf. A)  
*Instrument / entry -> exit:* MSTR; $11.58 (Jul 2020, split-adj.) -> $473.83 (20 Nov 2024).  
*Ex-ante signals:* Leveraged BTC proxy trading at a premium to NAV. *Sizing:* n/a.  
*What could have gone wrong:* -89% drawdown in 2021-22; then -83% to Jun 2026 as the premium (mNAV) fell below 1. *Sources:* winners_and_squeezes.py; Strategy Q1-2026 results.

**T62. Nvidia - Oct 2022 low -> AI boom** (Oct 2022-2026; conf. A)  
*Instrument / entry -> exit:* NVDA; $11.23 (14 Oct 2022, split-adj.) -> $235.74 (14 May 2026).  
*Ex-ante signals:* -66% drawdown into a demand shock (ChatGPT Nov 2022; May 2023 guidance). *Sizing:* n/a.  
*What could have gone wrong:* NVDA had 7 drawdowns >50% in its history (e.g. -90% 2000-02, -85% 2007-08). *Sources:* winners_and_squeezes.py.

**T63. Carvana - Dec 2022 low -> recovery** (Dec 2022-Jan 2026; conf. A)  
*Instrument / entry -> exit:* CVNA; $0.744 split-adj. ($3.72 pre-split, 27 Dec 2022) -> $95.69 (22 Jan 2026).  
*Ex-ante signals:* -99% drawdown, bonds pricing default; 2023 debt exchange cut interest; unit economics improving. *Sizing:* n/a.  
*What could have gone wrong:* Base case was bankruptcy; high short interest cut both ways. *Sources:* winners_and_squeezes.py.

**T64. Palantir - Dec 2022 low** (Dec 2022-Nov 2025; conf. A)  
*Instrument / entry -> exit:* PLTR; $6.00 -> $207.18 (3 Nov 2025).  
*Ex-ante signals:* -85% drawdown, then GAAP profitability + AI narrative. *Sizing:* n/a.  
*What could have gone wrong:* Extreme valuation multiples; -48% after peak. *Sources:* winners_and_squeezes.py.

**T65. 'Theo' - Polymarket 2024 election whale** (Oct-Nov 2024; conf. B)  
*Instrument / entry -> exit:* Polymarket contracts (Trump win, popular vote, swing states); Spent >$45m across accounts at ~0.45-0.63 (Trump win) and longer odds (popular vote).  
*Ex-ante signals:* Commissioned 'neighbour-effect' polls suggesting shy-Trump bias. *Sizing:* Very large.  
*What could have gone wrong:* A normal polling error in the other direction -> lose most of $45m. *Sources:* Bloomberg (24 Oct 2024); WSJ; CBS 60 Minutes; polymarket_2024.py.

**T66. Buy the April 2025 tariff-crash low** (Apr 2025-Sep 2026; conf. A)  
*Instrument / entry -> exit:* S&P 500; 4,982.77 (8 Apr 2025; -19%, VIX close >50) -> 7,683.69 (28 Sep 2026).  
*Ex-ante signals:* VIX > 50 (4th time since 1990), policy-driven shock with reversal option (tariff pause 9 Apr). *Sizing:* Unlevered.  
*What could have gone wrong:* Tariffs could have stayed; drawdown only ~19% (below classic thresholds). *Sources:* generational_lows.py; crash_base_rates.py.

**T67. Gold & silver 2024-26 run** (Feb 2024-Jan 2026; conf. A)  
*Instrument / entry -> exit:* Gold / silver futures; Gold $2,004 -> $5,318 (29 Jan 2026); silver $22.1 -> $115.08 (26 Jan 2026).  
*Ex-ante signals:* Central-bank buying, fiscal deficits, trend acceleration. *Sizing:* n/a.  
*What could have gone wrong:* Silver -51% and gold -25% from those peaks by Sep 2026 (computed). *Sources:* winners_and_squeezes.py.


### 2.1 Where the biggest returns per decision came from

| Profile | Examples | What it took | Replicable by a retail engine? |
|---|---|---|---|
| 1 decision, ≥1,000x over decades | BTC, ETH, Alibaba, Facebook, Amazon, GEICO 1948, the 1932 low | A tiny early stake, or a crisis-low index buy, followed by decades of not selling | Only the index version reliably. The rest are survivor-biased lotteries. |
| 1-3 decisions, 20-130x in 1-4 years | Carvana, GME, MicroStrategy, Tesla, Palantir, Belridge, Nvidia | Buying a hated or distressed asset before a reflexive re-rating | Partially, with small sizes and baskets |
| 1-3 decisions, 30-100x on premium in weeks | Ackman, Universa, Northern Pacific, Hertz, VW | Convexity or a squeeze meeting a sudden regime change | Convexity, yes, within a budget. Squeezes, no. |
| A few decisions, +60% to +600% on a whole fund | Paulson, Lahde, Bass, Tudor, Soros in 1985 | Institutional leverage on bounded-loss structures plus research | Only the unlevered, bounded-loss logic transfers |

## 3. Catalog of 35 blowups

| # | Who / what | When | Loss | Mechanism of ruin | Detail | Lesson | Conf. |
|---|---|---|---|---|---|---|---|
| B01 | Isaac Newton - South Sea Bubble | 1720 | ~GBP 10-20k+ (a large part of his fortune); holding throughout would have made ~GBP 250k | Re-entry near the top (FOMO) + concentration | Sold early at a profit, then bought back at roughly double the price near the June 1720 peak | Pre-commit exits; never re-enter a parabolic move after selling | B |
| B02 | John Law & late Mississippi buyers | 1720 | Shares 10,000 -> 1,000 livres within a year (-90%) | Policy/fraud + leverage | Money printing to support shares; convertibility suspended; Law fled and died poor (1729) | When the sponsor is printing to hold up the price, the peg will break | B |
| B03 | Northern Pacific short sellers | May 1901 | Forced to cover at up to $1,000 vs ~$150 fair; ruinous for many | Short squeeze / delivery failure | Two control bidders absorbed the float | Never be short something that someone may need to own | B |
| B04 | Jesse Livermore's ruin | 1908-1940 | Bankrupt several times (last in 1934); suicide 1940 | Leverage + over-trading + not banking gains | Gave back 1907 and 1929 fortunes on subsequent trades | Wealth must be banked/de-risked after a windfall | B |
| B05 | Irving Fisher | 1929 | ~$8-10m personal fortune; lifelong debt | Leverage + concentration + overconfidence | 'Stocks have reached a permanently high plateau' (Oct 1929); margined Remington Rand | Expertise does not protect a levered, concentrated position | B |
| B06 | 1929-32 dip-buyers | 1929-1932 | Buying at -40% (Nov 1929) meant another -77%; price break-even took 16+ years | Being early + margin | Unlevered with dividends: real total-return break-even ~5-6 years (computed); on 10% margin, wiped out | Crisis buying must be tranche-based and unlevered | A |
| B07 | Keynes - 1920 currency losses | 1920 (and 1928-29) | Near personal bankruptcy in May 1920 | Leverage + timing (right thesis, wrong path) | Short European currencies; rescued by father and Sir Ernest Cassel; later reformed into patient value investing (King's +16%/yr 1921-46) | Survive the path; leverage turns a correct thesis into ruin | A |
| B08 | Hunt brothers - silver | 1979-80 | Silver $49.45 -> $10.80 (27 Mar 1980); $1.1bn bank rescue; later bankrupt | Leverage + concentration + rule change | ~195m oz controlled; COMEX 'Silver Rule 7' limited margin buying (Jan 1980) | Exchanges change rules against corners; liquidity vanishes on exit | A |
| B09 | Soros - 1987 crash | Oct 1987 | Quantum lost ~$300m+ selling futures near the low (year still ~+14%) | Wrong-way positioning + forced de-risking | Long US, short Japan; sold into the panic | Even great macro traders take crash losses - they survive by sizing | B |
| B10 | Japan 1990 dip-buyers | 1990-2024 | Nikkei -82% (1989-2009); buyer at -20% waited 33 years, at -40% 27 years (price) | Valuation (CAPE ~60+) + being early | Dividends shorten this somewhat; still a lost generation | A cheap-looking market after -40% can fall another 60-70% if the starting valuation was extreme | A |
| B11 | Barings - Nick Leeson | 1995 | GBP 827m > bank's capital; sold for GBP 1 | Rogue trading + doubling down + short straddles (short convexity) | Hidden account 88888; Kobe earthquake hit Nikkei longs and short straddles | Separate front and back office; no averaging down on losing leveraged trades | A |
| B12 | Victor Niederhoffer | 1997 & 2007 | Main fund wiped out Oct 1997; Matador fund -75%+ in 2007 | Concentration (Thai banks) + short puts (short convexity) | Sold naked S&P puts; 27 Oct 1997 mini-crash | Selling tails produces steady gains until it produces ruin | B |
| B13 | Long-Term Capital Management | 1998 | $4.6bn; equity $4.7bn -> ~$0.4bn; $3.6bn bank recapitalisation | Leverage (~25:1 on balance sheet) + crowding/liquidity | Convergence trades diverged after Russia's default | Correlations go to 1 and liquidity vanishes exactly when levered books need it | A |
| B14 | Tiger Management | 1998-2000 | -4% (1998), -19% (1999); AUM $22bn -> ~$6bn; closed Mar 2000 | Being early (fading the tech bubble) | Closed weeks before the Nasdaq peak - right thesis, wrong timing | Shorting/avoiding a mania can cost you the business before you are proven right | B |
| B15 | Druckenmiller - buying the tech top | Mar-Apr 2000 | ~$3bn lost in ~6 weeks on ~$6bn of tech; Quantum -21% in 2000 | Re-entry near the top (FOMO) after being right | Had profited riding tech in 1999, then chased it at the peak | Mania re-entry after a big win is the classic giveback | B |
| B16 | Enron employees | 2001 | 401(k) plans heavily in company stock; employees lost ~$1bn+ | Concentration in employer + fraud | Stock ~$90 -> $0.26 | Never let one issuer (especially your employer) dominate your wealth | B |
| B17 | Amaranth Advisors | Sep 2006 | ~$6.5bn (~65% of $9.5bn) in about a week | Concentration + illiquidity + leverage | Winter/summer natural-gas spreads too big to exit; Centaurus/JPM/Citadel took the book | Position size must be judged against market depth, not conviction | A |
| B18 | VW short sellers & Adolf Merckle | Oct 2008 | Shorts lost > EUR 20bn (~$30bn); Merckle lost ~EUR 500m, suicide Jan 2009 | Short squeeze (float disappeared) | Porsche's hidden option stake left <6% float vs ~12% short interest | Monitor float vs. short interest; shorts have unbounded loss | A |
| B19 | Societe Generale - Jerome Kerviel | Jan 2008 | EUR 4.9bn | Rogue trading / control failure | ~EUR 50bn of hidden index-futures exposure | Operational controls matter as much as market views | A |
| B20 | SNB floor removal: FXCM clients, Alpari UK, Everest Capital | 15 Jan 2015 | FXCM clients owed $225m; Alpari UK insolvent; Everest's ~$830m Global Fund wiped out | Leverage + short convexity against a policy peg | EUR/CHF -14% at the noon fix, ~-30% intraday; Everest ran 400-900% gross exposure (SEC) | Pegs suppress volatility until the day they don't; never sell the peg's tail with leverage | A |
| B21 | XIV & LJM ('Volmageddon') | 5-6 Feb 2018 | XIV -96% in a day (terminated); LJM Preservation & Growth -80% in 2 days | Short volatility (short convexity) | VIX +115.6% in one day | Products that 'earn' steady carry by selling volatility have a hidden ruin state | A |
| B22 | OptionSellers.com (James Cordier) | Nov 2018 | ~$150m; 290 clients lost 100% and owed the broker more | Naked short calls (short convexity) + concentration | Natural gas +60% in a week | Undefined-risk option selling can lose more than 100% of the account | B |
| B23 | Allianz Structured Alpha & Malachite | Feb-Mar 2020 | Structured Alpha > $7bn (Allianz paid >$6bn); Malachite ($600m) dissolved | Short volatility + (Allianz) fraud: promised hedges not bought | Stress test edited from -42.15% to -4.15% (SEC) | Verify hedges exist; 'hedged' short-vol can be naked | A |
| B24 | Negative oil (20 Apr 2020) | Apr 2020 | WTI May future settled -$37.63; retail products (e.g. Bank of China 'Crude Oil Treasure') lost >100%; brokers ate client deficits | Structural/liquidity (expiring physically settled future, storage full) | Retail long-oil vehicles holding the front month | Know the instrument's settlement mechanics; retail should avoid expiring futures | B |
| B25 | Melvin Capital | Jan 2021 | -53% in January 2021 (~$6.8bn); $2.75bn rescue; closed 2022 | Short squeeze + crowding + concentration | Short GME with >100% of float shorted | Crowded shorts in small floats are exposed to reflexive retail flows | A |
| B26 | Archegos (Bill Hwang) | Mar 2021 | ~$20bn personal in 2 days; banks >$10bn (Credit Suisse $5.5bn, Nomura $2.9bn) | Hidden leverage via total-return swaps + concentration + fraud | ~$36bn equity controlling ~$160bn exposure; Hwang sentenced to 18 years | Leverage + concentration + forced selling by lenders = instant ruin | A |
| B27 | Terra/Luna | May 2022 | ~$40-45bn market value; LUNA $119.51 ATH -> ~0 | Reflexive algorithmic peg + unsustainable yield (Anchor ~20%) | LFG spent ~80k BTC defending UST; death spiral | Yield that has no visible source is paid by the last buyer | A |
| B28 | Three Arrows Capital (and Celsius, Voyager) | Jun 2022 | ~$3bn+ liabilities; contagion to lenders | Leverage + concentration + counterparty chains | GBTC premium trade, stETH, LUNA | Crypto lenders were unsecured counterparties | B |
| B29 | FTX customers | Nov 2022 | ~$8bn customer shortfall; 2024 plan repays ~118% of Nov-2022 USD value (BTC ~$16k), missing the later 5-7x | Counterparty fraud / custody | Customer assets lent to Alameda | Custody risk can override a correct market view | A |
| B30 | Tesla short sellers | 2020 | ~$40bn mark-to-market loss in one year (S3 Partners) | Shorting a reflexive winner / squeeze | TSLA +743% in 2020 | Valuation is not a catalyst; don't short momentum without a trigger | A |
| B31 | JGB 'widowmaker' | 1990s-2020s | Decades of negative carry and losses as yields fell towards 0 | Being early / negative carry | Obvious-looking debt thesis defeated by BoJ policy | A thesis without a catalyst and with negative carry is a slow bleed | B |
| B32 | Crypto liquidation cascade | 10-11 Oct 2025 | ~$19.3-19.5bn liquidated in 24h (largest ever, ~9x prior record); ~6,300 Hyperliquid wallets wiped | Leverage + liquidity (auto-deleveraging) | Triggered by a 100% China-tariff threat | Perpetual-futures leverage is liquidated at the worst print | A |
| B33 | Bitcoin-treasury companies (MSTR et al.) | 2025-2026 | MSTR -83% (Nov 2024 -> Jun 2026); treasury stocks lost ~$62bn in the June-2026 rout | Reflexive premium + leverage | mNAV premium collapsed below 1 | Premiums to NAV funded by issuance are reflexive in both directions | A |
| B34 | Late meme-stock and SPAC buyers | 2021-2022 | GME -88% and AMC -99.8% from 2021 peaks (computed); non-redeeming SPAC holders median -88% market-adjusted | Buying the mania late + dilution | Sponsors' promote and warrants diluted holders | The same trade is a different trade at a different price | A |
| B35 | Hertz's post-bankruptcy equity | Nov 2021-Sep 2026 | -96% from the 2 Nov 2021 relisting-day high ($35.06) to the Aug 2026 low ($1.51) (computed); -41% in one day (24 Jun 2026) | Leverage + cyclical asset values | Used-car softness and dilutive financing | Yesterday's miracle recovery is not today's margin of safety | A |


**Approximate tally of mechanisms** (cases can carry more than one tag):
- leverage, often hidden: about 12
- short convexity (sold options or volatility, or short a squeezable float): about 10
- concentration or illiquidity: about 8
- being early or paying carry: about 6
- fraud, counterparty or custody failure: about 6
- re-entering near the top: 3

**Common thread.** Almost no catastrophe came from a small, defined-risk, unlevered position. Several were right-thesis, wrong-path failures: Keynes in 1920, Tiger in 2000, Livermore early in 1929, and Burry, whose investors nearly left in 2006.

## 4. Survivorship: the denominators behind the famous winners

The same table is in `output/survivorship.csv`.

| Famous winner | Same bet, lost | Denominator evidence |
|---|---|---|
| Soros/Druckenmiller vs GBP, 1992 | HKD attacks (1998, 2016-20); CNY shorts in 2016; DKK in 2015; sellers of SNB-floor volatility | HKD 1.5% and DKK 1% robust ranges; Frankel & Rose (1996) |
| Paulson, Burry, Bass, 2007 | JGB shorts over decades; Tiger 1999-2000; Hayman after 2008 (about 1.6% a year to 2015); Kynikos funds closed 2023; Hindenburg closed 2025 | Asquith, Pathak & Ritter (2005): high variance and squeezes |
| Tudor, Taleb, Universa, Ackman | Tail-hedge buyers 2009-19; the "1929 analog" chart of 2013-14 | Tail-risk index about -3.2% a year 2008-20, median rolling 12-month about -7% |
| Gill, VW, Northern Pacific | Late GME buyers (-88%), AMC (-99.8%), BBBY (bankrupt 2023), Piggly Wiggly (1923), the Hunts | Short-constrained stocks returned -2.15% a month equal-weighted, 1988-2002 |
| Nvidia, Amazon, Monster, GEICO | Cisco (21 years under water with dividends), Intel, MicroStrategy (24.7 years under water from its 2000 peak), Lucent, Nortel | 4.3% of stocks created all wealth and 57% lagged T-bills (Bessembinder); more than 40% of Russell 3000 stocks had an unrecovered -70% (J.P. Morgan) |
| BTC, ETH, SOL | LUNA, FTT, most 2017-18 ICOs, the 2021-25 memecoins | 53.2% of about 20.2m tokens dead; 11.6m died in 2025 alone (CoinGecko) |
| Templeton 1939, the 1932 and 2009 buyers | Japan 1990 (33 years), Shanghai 2007 and Hang Seng 2018 (unrecovered), Russia 1917 and China 1949 (total loss), 1929 margin buyers | Jorion & Goetzmann (1999): the US is the survivor market |
| Carvana, Hertz | Lehman, WaMu, BBBY, WeWork; Hertz's post-emergence buyers (-96%) | Chapter 11 equity usually goes to zero |
| Théo, Trump at 18% in 2016 | Trump bettors after the 2020 election; "red wave" bettors in 2022 | Zero-sum after fees; favorite-longshot bias (Snowberg & Wolfers 2010) |
| SPAC warrants, 2020 | 2021-22 de-SPAC buyers | Non-redeeming holders: mean -64%, median -88% market-adjusted (Klausner et al. 2022) |
| Buffett/Graham concentration | Ackman's Valeant (about -$4bn); Enron 401(k)s; Legg Mason Value Trust in 2008 | J.P. Morgan concentrated-stock research |
| "A few big trading wins" | 97% of persistent Brazilian day traders lost; under 1% of Taiwanese day traders were reliably profitable | Chague et al. (2019); Barber et al. (2014); Barber & Odean (2000) |

**Rule of thumb** (except unlevered broad-index crisis buying in markets that survive). For each famous winner, assume this many comparable losers:
- convexity and pegs: 5 or more
- squeezes and manias: 20 or more
- single-stock compounders and tokens: 100 or more

## 5. Taxonomy of edge archetypes, ranked

Scores run 1 (poor) to 5 (good) and are judgmental. The same table is in `output/archetypes.csv`.

| Rank | Archetype | Multiple on risk capital | Identifiable ex ante | Setups per decade | Retail access 2026 | Main failure modes | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Crisis buying of broad markets | 1.5-2x real in 5y; 50-1,800x over decades | 5 for depth, 1 for the bottom | US ≥40%: about 0.4; VIX ≥40: about 3.6 | 5 | Early entry, country failure, leverage, panic selling | **Core deployment rule** |
| 2 | Cheap convexity before a regime change | 30-100x on premium | 4 for cheapness, 1-2 for timing | about 1-1.5 paying events | 4 (listed options, no CDS) | Premium bleed, wrong strike or expiry, failing to monetise | **Opportunistic**, with a premium budget and redeployment |
| 3 | Forced or structural seller, liquidity provision | 1.2-3x | 4 | continuous | 3 | Falling knives | **Satellite** (Coval & Stafford 2007) |
| 4 | Legal information-processing edge | 2-30x | depends on the edge | continuous | 4 | Overconfidence, crowding, MNPI | **Satellite**; the AI's comparative advantage, with haircut probabilities |
| 5 | Impaired franchise or distressed asset | 2.5-130x | 3 | 10+ per bear market | 4 | Value traps, bankruptcy | **Satellite** via baskets or senior securities |
| 6 | Long-duration compounder | 10-6,000x | 2 | continuous | 5 | Drawdowns of 50-96%; flat decades | **Satellite**; let winners run, trim above 20-25% |
| 7 | Riding a reflexive mania and exiting | 5-500x | 3 | 1-3, plus crypto cycles | 5 | Round-trips of -50% to -99.8%, re-entry | **Satellite** with trend and exit ladders |
| 8 | Peg or policy break | 10-80% underlying; 5-50x on options | 3 | 1-3 major | 2 | The peg holds; controls; broker failure | **Opportunistic**, ≤1-2% maximum loss |
| 9 | Special situations | 2-15x | 3 | several a year | 4 | Chapter 11 equity goes to zero; dilution | **Opportunistic**, small |
| 10 | Early adoption | 1,000-2.5 million x | 1 | 1-3 mega outcomes | 2 | Total loss is the base case | **Lottery**, ≤1% in total |
| 11 | Fundamental short | ≤1x; puts 5-20x | 3 for red flags, 1 for timing | several | 3 | Squeezes, being early | **Avoid naked shorts** |
| 12 | Corner or short squeeze | 3-125x | 2-3 | about 1 mega | 4 | Reversal; negative EV on average | **Avoid** (≤0.5% at most) |

## 6. Principles that separated winners from blowups

1. **Asymmetry came from the structure, not the opinion.** A peg band, a premium, a basket or seniority capped the winners' downside.
2. **Size by maximum loss.** Soros ran about 1.5x NAV because the ERM band capped the loss. Ackman committed about 0.4% of NAV. Everest ran 400-900% gross exposure and died in a day.
3. **Survive the path.**
   - Leverage and negative carry ruin correct theses.
   - Unlevered longs in surviving markets can wait.
   - Anything with an expiry needs a catalyst inside its life.
4. **Catalyst plus cheap convexity beats always-on hedging.** Always-on hedging bleeds about 3% a year.
5. **Liquidity is part of the thesis.** Amaranth, the Hunts, LTCM, the VW shorts, and the brokers on SNB day and negative-oil day all show this.
6. **Custody and counterparty risk can override a correct view.** FTX, 3AC, Alpari and MF Global all show this, and it is why Lahde quit.
7. **Take profits by rule, and never re-enter a parabola.** Thomas Guy sold; Newton sold and then bought back near the top. Druckenmiller's 2000 re-entry cost about $3bn.
8. **Patience is the cheapest and rarest edge.** GEICO, Coca-Cola, Amazon and the 1932 low all required enduring 50-96% drawdowns and flat decades.
9. **Legality binds.** Corners and pools would be illegal today. Vega Capital's settlement-window selling was alleged to be manipulation. The October 2025 short raised insider suspicions. None of these is a template.
10. **Overconfidence after wins is the usual ending.** Livermore, Niederhoffer, Hwang, and Druckenmiller in 2000 all followed this path. Rules must not loosen after success.

## 7. Implications for the system design

Values in brackets are proposed defaults to be calibrated later. The same rules are in `output/design_rules.csv`.

**Objective**
- **R0. Maximise long-run geometric growth under a hard ruin constraint.** Every email states:
  - maximum loss in $ and as % of the portfolio
  - P(total loss), P(≥2x) and P(≥5x)
  - the expected holding period
  - the reference class, including its losers

  Show honest targets: 11x takes 27% a year over 10 years, 17.3% over 15, 12.7% over 20, or 8.3% over 30. The S&P has done 10.3% nominal a year since 1928. Medallion (about 39% net) and Druckenmiller (about 30%) are extreme outliers.

**Architecture**
- **R1. Core [60-90%]:** an unlevered, diversified, low-cost equity index.
- **R2. Opportunity sleeve [10-40%]:**
  - at most [3-8] positions, with idle cash in T-bills
  - total open maximum loss ≤ [15%] of the portfolio
  - convexity and lottery premium ≤ [2-3%] a year

**Admission (every item must pass)**
- **R3.** An archetype with ≥ [10] historical analogs, including failures; base rates are computed from them.
- **R4.** Positive EV after shrinking the model's probability [25-50%] toward the base rate, net of costs and taxes.
- **R5.** Maximum loss is defined at entry. Stops do not count as defining it, because prices can gap.
- **R6.** Asymmetry of ≥ [3:1] for satellites. Crisis index buys need a base-rate 5-year real multiple of ≥ [1.5x].
- **R7.** A catalyst or valuation anchor exists, and option expiry is ≥ [2x] the catalyst window.
- **R8. Liquidity:**
  - ≤ [1%] of average daily volume, and ≤ [5%] of options open interest
  - exit possible within a day
  - no physically settled futures held into expiry
- **R9.** US-regulated venue with segregated client assets; crypto only through regulated ETFs or self-custody.
- **R10.** No MNPI, no coordination, and prediction markets only where legal for the user.

**Sizing**
- **R11. Size = min(archetype maximum-loss cap, [0.25-0.5] x Kelly on the shrunk probability).** Caps by archetype:

  | Archetype | Maximum-loss cap |
  |---|---|
  | Lottery, early-stage, squeeze, long-shot | [0.5-1%] |
  | Convexity premium | [0.5%] a quarter; [1%] only with a visible catalyst |
  | Peg-break options | [1-2%] |
  | Single-name catalyst | [3-5%] |
  | Distressed basket | [2-3%] per name, [10-30] names |
  | Crisis index tranches | Unlevered; up to the whole sleeve |

- **R12.** Gross exposure ≤ 1.0x, and no margin loans.

**Playbooks**
- **R13. Crisis-buy.** Deploy the sleeve into the index in thirds:
  - at S&P drawdowns of [-30/-40/-50%], **or**
  - on a VIX close ≥ [45], **or**
  - on CAPE < [12], which adds a tranche

  Hold ≥ [3-5] years, never levered. Country ETFs may take ≤ [1/3] each, given Japan 1990, China 2007 and Hong Kong 2018.
- **R14. Convexity.**
  - Buy long-dated OTM index put spreads, credit-ETF puts or VIX calls, only when both hold:
    - the VIX is below [14] and credit spreads are near their tights
    - a nameable catalyst is emerging (the Ackman 2020 template)
  - Take profits: 1/3 at [5x], 1/3 at [10x], and the rest at [20x] or when the VIX closes > [45].
  - Proceeds go into R13.
  - Expect to lose the premium in most years.
- **R15. Peg break.** Flag a candidate when ≥3 of these hold:
  - reserves down more than [20%] in 6 months, or below [3-4] months of imports
  - real exchange rate more than [15%] above its 10-year average
  - the anchor central bank's policy diverging
  - carry cost below [3%] a year
  - political stress

  Use defined-risk options or futures only, with ≤ [1-2%] maximum loss. Mark untradable pegs "watch only".
- **R16. Mania.**
  - Enter only when the price is above a rising 200-day moving average, with positive 12-month momentum. Size ≤ [5%] at cost.
  - Sell 25% at [2x] and 25% at [4x]. Trail the rest with a [30%] stop, or exit on a close below the 200-day average.
  - Wait [3] months before re-entering after an exit.
  - Never short with shares; at most ≤ [1%] in puts after the trend breaks.
- **R17. Distressed.**
  - Use baskets of [10-30] names or senior securities.
  - Require ≥ [24] months of cash runway.
  - Veto the common stock of companies already in Chapter 11.
- **R18. Compounders.** Don't sell just because a position is up 5-10x. Trim above [20-25%] of the portfolio. Accept 50%+ drawdowns only on positions whose cost basis is ≤ [5%].
- **R19. Prediction markets.** Only when the model disagrees with the price by ≥ [10] points **and** the source of the edge can be named. Maximum loss ≤ [1-2%] per market.

**Hard vetoes**
- **R20.** Never recommend:
  - gross exposure above 1.0x, or any margin
  - naked short options, or short-volatility ETPs
  - shorts when short interest exceeds [20%] of float or the borrow fee exceeds [10%]
  - leveraged or inverse ETPs held for more than a few days
  - averaging down on a levered loser
  - more than [25%] in one issuer, including the user's employer
  - algorithmic stablecoins, or yield with no visible source
  - offshore custody
  - anything relying on MNPI or coordinated trading

**Exits and communication**
- **R21.** Every email pre-registers:
  - the thesis-invalidation condition
  - a time stop at [1.5x] the catalyst window
  - the profit ladder
  - what to do if the price gaps
- **R22.** Every email names the losers in the trade's reference class.

**Monthly calibration**
- **R23.** Log each recommendation ex ante, immutably: probabilities, archetype, reference class, maximum loss, horizon.
- **R24.** Score every month:
  - Brier and log scores
  - calibration by archetype
  - realised versus predicted multiples
  - slippage and rule adherence
  - a "graveyard" ledger of rejected ideas and how they turned out
- **R25.** Update slowly:
  - use Beta priors with strength equal to the reference-class size, [10-30]
  - change a cap only after ≥ [10-20] resolved trades in that archetype
  - never loosen vetoes after a run of wins
- **R26. Drawdown governor.** Freeze new satellite trades if the portfolio is more than [25%] below its peak, or the sleeve's maximum-loss budget is used up.
- **R27. Cadence.** Expect 0-2 tier-1 setups a year. Recommending nothing for months is correct for this user.

## Appendix: Sources

**Primary data:** Yahoo Finance via yfinance; FRED (H.10, IFS, CPIAUCSL); Shiller `ie_data.xls`; Polymarket gamma and CLOB APIs.

**Literature:**
- Accominotti & Chambers (2016), *J. Econ. History*.
- Aristotle, *Politics* I.11.
- Asquith, Pathak & Ritter (2005), *JFE*.
- Barber & Odean (2000), *J. Finance*.
- Barber, Lee, Liu & Odean (2014), *J. Financial Markets*.
- Bessembinder (2018), *JFE*.
- Brunnermeier & Nagel (2004), *J. Finance*.
- Cathcart (2015), *The News from Waterloo*.
- Chague, De-Losso & Giovannetti (2019), SSRN 3423101.
- Chambers & Dimson (2013), *J. Econ. Perspectives*.
- Coval & Stafford (2007), *JFE*.
- Dichev (2007), *AER*.
- Ferguson (1998), *The House of Rothschild*; (2008), *The Ascent of Money*.
- Frankel & Rose (1996), *J. International Economics*.
- Gahng, Ritter & Zhang (2023), *Review of Financial Studies*.
- Gordon (1988).
- Graham, *The Intelligent Investor*.
- Greenwood, Shleifer & You (2019), *JFE*.
- Jorion & Goetzmann (1999), *J. Finance*.
- J.P. Morgan, *The Agony & the Ecstasy*.
- Kelly (1956).
- Klausner, Ohlrogge & Ruan (2022), *Yale J. on Regulation*.
- Lefèvre (1923).
- Lewis (2010).
- Lowenstein (2000).
- Mallaby (2010).
- Mayer (2015).
- Murphy (1986).
- Nasaw (2012).
- Odlyzko (2019), *Notes & Records*.
- President's Working Group on Financial Markets (1999).
- Rubython (2014).
- Schwager (1992).
- Smitten (2001).
- Snowberg & Wolfers (2010), *J. Political Economy*.
- Soros (1987).
- Temin & Voth (2004), *AER*.
- Templeton & Phillips (2008).
- US Senate Permanent Subcommittee on Investigations (2007).
- Zuckerman (2009); (2019).

**Filings and letters:**
- Berkshire Hathaway letters (1985, 1994, 1998) and Buffett Partnership letters.
- Bank of America 8-K, Aug 2011.
- Hertz SEC filings (2021).
- Pershing Square Holdings reports (2020).
- SEC IA-5491 (Everest Capital).
- SEC press release 2022-84 (Allianz Structured Alpha).
- DOJ on the Archegos sentencing (2024).
- Strategy Q1-2026 results.

**Key web sources used:**
- [Bloomberg, Universa March 2020](https://www.bloomberg.com/news/articles/2020-04-08/taleb-advised-universa-tail-risk-fund-returned-3-600-in-march)
- [Forbes, Universa 4,144%](https://www.forbes.com/sites/antoinegara/2020/04/13/how-a-goat-farmer-built-a-doomsday-machine-that-just-booked-a-4144-return/)
- [Forbes, Ackman explains himself (2020)](https://www.forbes.com/sites/antoinegara/2020/03/27/billionaire-investor-bill-ackman-explains-himself/)
- [SEC IA-5491, Everest Capital](https://www.sec.gov/files/litigation/admin/2020/ia-5491.pdf)
- [CNBC, SNB victim broker insolvency](https://www.cnbc.com/2015/01/16/snb-victim-forex-broker-enters-insolvency.html)
- [Harvard corpgov, VW short squeeze](https://corpgov.law.harvard.edu/?p=140132)
- [CNBC, Keith Gill (2024)](https://www.cnbc.com/2024/06/04/how-roaring-kittys-wealth-went-from-53000-to-nearly-300-million-and-could-one-day-top-1-billion.html)
- [Bloomberg, Hertz bankruptcy auction (2021)](https://www.bloomberg.com/news/articles/2021-05-12/hertz-picks-knighthead-certares-offer-in-bankruptcy-auction)
- [Bloomberg, Hertz (Jun 2026)](https://www.bloomberg.com/news/articles/2026-06-24/hertz-slides-after-warning-used-car-softness-is-hurting-profit)
- [Bloomberg, Polymarket whale identified](https://www.bloomberg.com/news/articles/2024-10-24/polymarket-says-trump-whale-identified-as-french-trader)
- [The Block, French whale profit estimate](https://www.theblock.co/post/324996/french-polymarket-whale-us-election-profit-france-ban)
- [Newsweek, 2016 Betfair odds](https://www.newsweek.com/trumps-chances-winning-election-almost-double-what-his-odds-were-before-2016-upset-1543980)
- [Gahng, Ritter & Zhang, SPACs](https://site.warrington.ufl.edu/ritter/files/SPACs.pdf)
- [Klausner, Ohlrogge & Ruan, A Sober Look at SPACs](https://law.stanford.edu/wp-content/uploads/2022/07/2022-01-24-A-Sober-Look-At-SPACs-Yale-Journal-on-Regulation.pdf)
- [CoinDesk, more than half of tokens failed (2026)](https://www.coindesk.com/markets/2026/01/14/more-than-half-of-all-crypto-tokens-have-failed-and-most-died-in-2025)
- [CoinDesk, Oct 2025 liquidation event](https://www.coindesk.com/markets/2025/10/11/largest-ever-crypto-liquidation-event-wipes-out-6-300-wallets-on-hyperliquid)
- [Yahoo Finance, treasury-company losses (2026)](https://finance.yahoo.com/markets/crypto/articles/bitcoin-crash-just-wiped-62-092912084.html)
- [Strategy Q1-2026 results](https://www.strategy.com/press/strategy-announces-first-quarter-2026-financial-results_05-05-2026)
- [Bessembinder (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2900447)
- [J.P. Morgan, The Agony & the Ecstasy](https://www.jpmorgan.com/insights/investing/investment-strategy/the-agony-and-the-ecstasy)
- [Odlyzko, Newton and the South Sea Bubble](https://royalsocietypublishing.org/rsnr/article/73/1/29/48674/Newton-s-financial-misadventures-in-the-South-Sea)
- [Rothschild Archive, Nathan and Waterloo](https://www.rothschildarchive.org/materials/nathan_and_waterloo.pdf)
- [Barry Popik, the shoeshine-boy anecdote](https://www.barrypopik.com/index.php/new_york_city/entry/when_even_shoeshine_boys_are_giving_you_stock_tips_its_time_to_sell_joseph)
- [President's Working Group, LTCM report](https://www.cftc.gov/sites/default/files/tm/tmhedgefundreport.htm)
- [SEC 2022-84, Allianz](https://www.sec.gov/newsroom/press-releases/2022-84)
- [CNBC, Archegos sentencing](https://www.cnbc.com/2024/11/20/archegos-bill-hwang-sentenced-to-18-years-in-prison-for-massive-us-fraud.html)
- [CNN, Tesla shorts 2020](https://www.cnn.com/2021/01/06/investing/tesla-shorts-losses-elon-musk-win)
- [CNBC, BofA warrant profit](https://www.cnbc.com/2017/06/30/warren-buffett-just-made-a-quick-12-billion-on-bank-of-america.html)
- [CNBC, BYD exit](https://www.cnbc.com/2025/09/21/buffett-munger-byd-exits-stake.html)
- [Ethereum Foundation, ether sale](https://blog.ethereum.org/2014/07/22/launching-the-ether-sale)
- [CoinList, Solana auction](https://medium.com/coinlist/solanas-launch-auction-sells-out-f9032b65c48b)
- [Forbes, tail-risk funds (2022)](https://www.forbes.com/sites/jacobwolinsky/2022/06/30/are-tail-risk-hedge-funds-worth-the-steep-losses-in-good-times-to-win-big-in-bad-times/)
- [CNBC, OptionSellers](https://www.cnbc.com/2018/11/21/a-risky-natural-gas-bet-gone-awry-leads-to-weepy-youtube-confessional.html)
- [ETF.com, XIV shuts down](https://www.etf.com/sections/news/inverse-vix-etn-shuts-down)
- [MIT Sloan CFI, Terra/Luna](https://mitsloan.mit.edu/cfi/anatomy-a-run-terra-luna-crash)
- [Axios, FTX repayment](https://www.axios.com/2024/05/08/ftx-customers-recovery-repay-bankruptcy)
- [Fortune, AmEx salad-oil scandal (2024)](https://fortune.com/2024/09/22/warren-buffett-investing-strategy-american-express-stock-scandal)
- [Wikipedia, Black Wednesday](https://en.wikipedia.org/wiki/Black_Wednesday)
- [Wikipedia, Tudor Investment Corporation](https://en.wikipedia.org/wiki/Tudor_Investment_Corporation)
- [Wikipedia, Scion Asset Management](https://en.wikipedia.org/wiki/Scion_Asset_Management)
- [Wikipedia, Cornwall Capital](https://en.wikipedia.org/wiki/Cornwall_Capital)
- [Wikipedia, Andrew Lahde](https://en.wikipedia.org/wiki/Andrew_Lahde)
- [Wikipedia, Amaranth Advisors](https://en.wikipedia.org/wiki/Amaranth_Advisors)
- [Wikipedia, Silver Thursday](https://en.wikipedia.org/wiki/Silver_Thursday)
- [Wikipedia, Panic of 1901](https://en.wikipedia.org/wiki/Panic_of_1901)
- [Wikipedia, Hertz Global Holdings](https://en.wikipedia.org/wiki/Hertz_Global_Holdings)
- [Wikipedia, Kyle Bass](https://en.wikipedia.org/wiki/Kyle_Bass)
