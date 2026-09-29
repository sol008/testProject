# 36 — The century view: what was the best thing to own each decade, was it knowable, and does "ride the strongest asset on Earth" beat the US market?

*29 September 2026, data to the 28 September 2026 close. Asked by the owner's objective ("exceed SPY by a large margin", "research human civilization and find some gems in the ocean"). This track looks across 150 years, 16 countries and four asset classes (plus gold, oil and bitcoin where they exist) for the best thing to own each decade, tests whether momentum could have picked it, and backtests a "ride the strongest asset on Earth" meta-rule at 1× and 2×. Code and outputs: `research/code/36-century/` (`python3 run_all.py`, about 6 minutes on a warm cache, 12 on a cold one; §8). Tracks 26–35 run in parallel and cover leveraged index trend, ETF momentum rotation since 1998, crypto, single-stock momentum, options, growth portfolios, the strategy zoo, feasibility math and structural gems; this track does not repeat them. Nothing here is individualized advice.*

*Labels: "USD" = nominal US-dollar total return (local total return converted at the year's exchange rate). "Regret" = the winner's CAGR minus the US market's CAGR over the same decade, in points a year. "κ" = the shrinkage this project applies to in-sample edges (0.5). "Top-1 / top-3" = hold the one (or the three, equal-weight) assets with the highest trailing 12-month USD return.*

---

## TL;DR

1. **Every decade since 1870 had an asset that beat the US market by a wide margin.** Holding the US index instead of the best of the 16 other equity markets cost a median **6 points a year** (range −1 to +21; the 1950s' winner, Germany, ended the decade with 4.9× the wealth of a US holder). Against the best investable asset of any class the regret was larger: gold +23 points in the 1970s and +16 in the 2000s, bitcoin +194 points in the 2010s and +28 so far in the 2020s. The US was the best market in 2 of 16 decades (1920s, 2010s) and in the top three in 7.
2. **It was not knowable from momentum.** The country leading on trailing 1-, 3-, 5- or 10-year return at a decade's start went on to win the decade 1, 0, 2 and 0 times in 14 decades (7%, 0%, 14%, 0%; a random pick wins 7%). The rank correlation between entry momentum and the decade's return averages −0.04. Momentum tells you what won the last decade, not the next one.
3. **The meta-rule does not beat the US market over the long run.** Top-1 by 12-month momentum across 16 equity markets, 16 bond markets and gold, re-decided every year with a trend exit to bills, 1871–2020: **7.7% a year vs 9.0% for US stocks**, max drawdown −58%, worst decade −3.4% a year (1890s); **15% of rolling 10-year windows beat the US by ≥5 points**, 27% lost by ≥5. The best of 52 variants (top-3 equities) adds +0.8 points; the equal-weight world gives 8.5%. **At 2× every variant is wiped out** (1981 or 2008).
4. **In the ETF era (1996–2026, monthly data) the same rule returns 37% a year, and every point of that comes from bitcoin.** Without bitcoin: 7.6% vs SPY's 10.5%; admitting bitcoin only from 2014: 20% with an −82% drawdown. Ex-bitcoin the rule beat SPY by 4–6 points a year in 1996–2010 and lost 5–10 points a year in 2011–2026 (the US decade). A random momentum-free picker of trending assets beats SPY by +5.6 points once in 52 tries, so the ex-bitcoin edge is inside the luck band.
5. **Verdict.** Riding manias with a weekly trend rule captured a median **50% of the peak gain** (range 16–101%) across 11 completed manias, gave back a third from the peak and cost 2–27 whipsaw round trips; an exit ladder captured 42% and a 25% trailing stop 41%. The highest credible long-run CAGR from the century view is **9–11% at 1× on historical return levels, about 6–8% at today's valuations** (the US market plus 0–2 points), with drawdowns of 50–60%. **P(beat SPY by ≥5 points a year over 10 years) ≈ 20–25%** without bitcoin, and 45–55% only if bitcoin's next decade resembles its last. It is executable as one decision a month (plus a weekly exit check) with 1–3 dollar market orders in the IRA — but it is a "be in the era's one asset" bet, not a rich-quick engine.

---

## 1. Decade winners, 1870s–2020s (USD)

JST release 6 gives annual total returns for equities, government bonds, bills and housing in 16 countries (Canada and Ireland carry no return series) from 1870 to 2020; the 2020s are extended to 28 September 2026 with country ETFs, GLD, WTI and bitcoin. Gold is the monthly London price (fixed at $20.67 and $35 before 1968). A decade's CAGR uses the years with data (≥7 of 10, except the partial 2020s).

| Decade | US equities | Best other equity market | Best investable non-equity | Best of any class (incl. housing) | Regret vs best equity (pts/yr) | Wealth ratio, best equity ÷ US |
|---|---|---|---|---|---|---|
| 1870s | 6.9% | Italy 10.0% | Portugal bonds 9.6% | Germany housing 13.6% | +3.1 | 1.33× |
| 1880s | 5.9% | Australia 12.5% | Japan bonds 10.2% | Germany housing 11.9% | +6.6 | 1.83× |
| 1890s | 5.6% | Sweden 9.0% | Italy bonds 5.4% | Norway housing 11.3% | +3.4 | 1.38× |
| 1900s | 10.2% | Australia 11.7% | Portugal bonds 11.4% | Denmark housing 13.3% | +1.5 | 1.14× |
| 1910s | 4.5% | Japan 17.8% | Spain bills 8.0% | Denmark housing 15.9% | +13.3 | 3.31× |
| 1920s | **15.0% (US best of 16)** | Australia 13.9% | Sweden bonds 9.8% | Finland housing 25.1% | −1.1 | 0.90× |
| 1930s | 0.0% | Finland 9.3% | Germany bonds 13.0%¹ (gold 5.3%) | Germany bonds 13.0%¹ | +9.3 | 2.44× |
| 1940s | 8.9% (2nd of 15) | Switzerland 9.0% | Switzerland bonds 3.7% | Belgium housing 13.2% | +0.1 | 1.01× |
| 1950s | 18.9% | **Germany 39.5%** | Finland bonds 10.2% | Finland housing 23.1% | +20.6 | 4.93× |
| 1960s | 7.7% | Spain 14.2% | Finland bonds 11.9% | Japan housing 24.5% | +6.5 | 1.79× |
| 1970s | 5.9% | Japan 19.5% | **Gold 29.2%** | Gold 29.2% | +13.6 (gold +23.3) | 3.34× |
| 1980s | 17.1% | Sweden 27.2% | Denmark bonds 15.0% (oil 9.4%) | Finland housing 22.9% | +10.1 | 2.28× |
| 1990s | 17.9% | Finland 23.4% | UK bonds 11.3% (oil 2.1%) | Finland equities 23.4% | +5.6 | 1.59× |
| 2000s | −0.7% | Australia 12.3% | **Gold 14.9%** (oil 11.1%) | Norway housing 16.9% | +13.0 (gold +15.6) | 3.44× |
| 2010s | **12.3% (US best of 16)** | Denmark 11.8% | **Bitcoin 206.5%** (gold 2.7%) | Bitcoin | −0.5 (bitcoin +194) | 0.96× |
| 2020s (to Sep 2026) | 13.9% (3rd of 17) | Spain 14.8% | **Bitcoin 42.0%** (gold 14.9%, DBC 12.9%) | Bitcoin | +0.9 (bitcoin +28) | 1.08× |

¹ Germany's 1930s returns are at the official Reichsmark rate under exchange controls; foreign holders received blocked marks worth a fraction of that. Not realizable. The first realizable non-equity asset of the 1930s was gold (+5.3% a year, from the 1934 devaluation).

**Regret.** Median regret against the best other equity market: 6.0 points a year (mean 6.6). The US ranked in the bottom half of markets in 5 decades (1880s, 1930s, 1970s, 1980s, 2000s) and won outright twice. Over the whole run the US was third of 16 in USD terms: Japan 9.9% (1886–2020), Australia 9.4%, USA 9.0%, Denmark 8.9%, Switzerland 8.7%, equal-weight world 8.7%, Sweden 8.6%, Germany 8.5%, ..., Italy 4.7%, France 3.2%, Portugal 3.1% (`q1_country_longrun.csv`). Every market except the US and Switzerland lost more than 50% at least once in USD terms; seven lost more than 75%.

**The ETF era with a wider universe** (USD total returns from inception, `q1_etf_era.csv`):

| Asset | 2000s | 2010s | 2020s (to Sep 2026) |
|---|---|---|---|
| Bitcoin (Coin Metrics, from 2010-07) | — | 206.5% | 42.0% |
| Semiconductors (SOXX) | −3.4% | 19.1% | 32.3% |
| Taiwan (EWT) | 4.2% | 7.5% | 22.6% |
| Nasdaq-100 (QQQ) | −6.4% | 17.8% | 20.1% |
| Korea (EWY) | 17.1% | 4.3% | 18.6% |
| Brazil (EWZ) | 21.6% | −1.7% | 2.2% |
| Mexico (EWW) | 12.9% | 1.0% | 9.9% |
| Australia (EWA) | 11.8% | 4.7% | 7.0% |
| **USA (SPY)** | **−1.0%** | **13.4%** | **14.7%** |
| Gold (GLD) | (spot 14.9%) | 2.9% | 14.9% |
| Commodities (DBC) | — | −4.0% | 12.9% |
| US 20-year Treasuries (TLT) | 4.9% | 7.2% | −4.8% |
| China (FXI) | — | 2.9% | −1.4% |
| India (INDA) | — | 5.2% | 5.4% |

The pattern across 150 years: the decade's winner was the era's single theme — Australian gold and wool in the 1880s, Japan's WWI boom, Germany's Wirtschaftswunder, gold in the 1970s, Nordic deregulation in the 1980s, Nokia's Finland in the 1990s, emerging markets and commodities in the 2000s, US tech and bitcoin in the 2010s, AI hardware in the 2020s. Each was one asset, not a diversified list.

## 2. Was it knowable? Momentum at the decade's start

For each decade from the 1880s to the 2010s, rank the countries by trailing USD equity return at the decade's start (lookbacks of 1, 3, 5 and 10 years) and compare the leader with the decade's eventual winner (`q2_decade_hits.csv`, `q2_hit_summary.csv`).

| Lookback | Leader wins the decade | Leader in the decade's top 3 | Winner among the 3 leaders | Leader beats the US | Leader − US (mean, pts/yr) | Spearman (momentum, decade CAGR) |
|---|---|---|---|---|---|---|
| 1 year | 1 of 14 (7%) | 21% | 21% | 29% | −2.3 | −0.04 |
| 3 years | 0 of 14 (0%) | 7% | 7% | 21% | −1.7 | −0.08 |
| 5 years | 2 of 14 (14%) | 21% | 29% | 43% | −1.4 | −0.04 |
| 10 years | 0 of 13 (0%) | 8% | 31% | 15% | −3.7 | −0.01 |
| Random pick | 7% | 20% | 20% | — | — | 0 |

The only hits: Japan in the 1910s (1-year), Germany in the 1950s and Finland in the 1990s (5-year). The 1-year leader entering the 1920s was Japan (+0.2% a year while the US did 15.0%); entering the 1940s it was Spain (−7.9% a year). The country at the *bottom* of the momentum ranking did on average 5–8 points a year better than the leader over the following decade, which is the ten-year mean reversion the literature reports for countries, not a signal to trade.

**"Hold the top-momentum country", re-decided every year, 1872–2020** (USD, 0.5% one-way cost, 16 countries; `q2_annual_rotation.csv`):

| Rule | CAGR | US same years | EW world | Excess vs US | Vol | Max DD | 10-yr windows beating US | ... by ≥5 pts | Excess pre-1950 / post-1950 / post-1990 |
|---|---|---|---|---|---|---|---|---|---|
| Top-1, 1-yr momentum | 6.6% | 9.0% | 8.5% | −2.3 | 27% | −68% | 40% | 11% | −3.0 / −1.6 / −3.6 |
| Top-1, 1-yr, trend exit to bills | 7.3% | 9.0% | 8.5% | −1.7 | 26% | −57% | 46% | 11% | −2.2 / −1.1 / −2.4 |
| Top-3, 1-yr | 9.3% | 9.0% | 8.5% | +0.3 | 20% | −52% | 54% | 14% | −0.8 / +1.6 / −1.3 |
| **Top-3, 1-yr, trend exit** | **9.8%** | 9.0% | 8.5% | **+0.8** | 19% | −51% | 63% | 15% | +0.2 / +1.5 / −2.1 |
| Top-1, 3-yr | 4.3% | 9.1% | 8.5% | −4.8 | 28% | −88% | 28% | 12% | −4.0 / −5.6 / −4.7 |
| Top-3, 3-yr | 6.9% | 9.1% | 8.5% | −2.2 | 21% | −71% | 32% | 8% | −3.1 / −1.1 / −1.3 |
| Top-1, 5-yr | 6.9% | 9.1% | 8.6% | −2.2 | 26% | −66% | 39% | 12% | −2.4 / −1.7 / −2.4 |
| Top-3, 5-yr | 6.6% | 9.1% | 8.6% | −2.5 | 18% | −54% | 40% | 5% | −2.9 / −1.9 / −1.8 |

Quarterly re-decision needs monthly data and is tested in §3.2 on the ETF era: with countries only, quarterly top-1 returned 10.5% vs SPY's 10.5% (1996–2026), monthly top-1 9.5%, annual 7.0%. Concentrating in the single strongest country has never paid over the US market at any decision frequency; holding the top three at most matched it.

## 3. The meta-rule: "ride the strongest asset on Earth"

### 3.1 The century, annual data (JST, 1871–2020)

Universe: 16 equity markets, 16 government bond markets and gold, all in USD (33 assets; housing is excluded as not investable). At each year-end rank by trailing L-year USD return, hold the top-1 or top-3 next year; with the trend exit, a pick whose trailing return is below trailing US bills is replaced by bills. 2× = 2r − r_bills − 1% financing spread with annual reset, floored at −100%. Cost 0.5% one-way per switch. 52 variants (`q3_annual_grid.csv`); the headline rows:

| Rule | CAGR | Excess vs US (9.0%) | Vol | Max DD | Worst year | Worst decade | 10-yr windows beating US | ... by ≥5 pts | Decades beating US | Excess pre-1950 / post-1950 / post-1990 | Switches/yr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **All assets, 12-m, top-1, trend exit, 1×** | **7.7%** | **−1.3** | 26% | **−58%** | −55% | 1890s −3.4%/yr | 47% | **15%** | 9 of 16 | −0.8 / −1.7 / −2.0 | 0.88 |
| All assets, top-1, no exit, 1× | 7.7% | −1.2 | 26% | −58% | −55% | 1890s −3.4% | 46% | 16% | 9 of 16 | −1.0 / −1.5 / −1.6 | 0.87 |
| All assets, top-3, trend exit, 1× | 8.6% | −0.4 | 18% | −53% | −51% | 2000s −0.3% | 53% | 11% | 9 of 16 | −0.4 / −0.3 / −3.8 | 1.00 |
| Equities only, top-3, trend exit, 1× (best of 52) | 9.8% | +0.8 | 19% | −51% | −51% | 2000s +0.1% | 63% | 15% | 12 of 16 | +0.2 / +1.5 / −2.1 | 1.00 |
| Ex capital-control years², top-1, exit, 1× | 7.3% | −1.6 | 26% | −58% | −55% | 1890s −3.4% | 43% | 14% | 8 of 16 | −1.5 / −1.7 / −2.0 | 0.89 |
| 3-yr momentum, top-1, exit, 1× | 4.2% | −4.7 | 27% | −71% | −65% | 1920s −7.8% | 26% | 7% | 4 of 16 | −3.7 / −6.0 / −6.5 | 0.72 |
| 5-yr momentum, top-1, exit, 1× | 5.9% | −3.1 | 25% | −65% | −65% | 2000s −4.6% | 38% | 9% | 5 of 16 | −2.8 / −3.4 / −3.0 | 0.62 |
| **All assets, top-1, trend exit, 2×** | **ruined 1981** | — | 41% | −100% | −100% | — | 39% | 22% | — | — | 0.88 |
| All assets, top-3, trend exit, 2× | ruined 2008 | — | 35% | −100% | −100% | — | 62% | 35% | — | — | 1.00 |
| Every other 2× variant (22) | ruined 1981 or 2008 | — | — | −100% | — | — | — | — | — | — | — |
| US equities | 9.0% | — | 18% | −61% | −40% | 2000s −0.7% | — | — | — | — | — |
| Equal-weight world equities | 8.5% | −0.5 | 16% | −49% | −46% | 1930s +3.8% | — | — | — | — | — |
| US bills | 4.0% | — | 3% | 0% | — | — | — | — | — | — | — |

² Germany 1931–1949 and Japan 1941–1949 removed (official exchange rates under controls; enemy assets).

**By decade, the headline rule vs the US** (`q3_decades.csv`): it won the 1870s (+0.8), 1880s (+4.1), 1900s (+4.7), 1910s (+1.0), 1930s (+2.6), 1960s (+4.4), 1990s (+2.4), 2000s (+3.4) and lost the 1890s (−9.0), 1920s (−5.1), 1940s (−5.6), 1950s (−2.0), 1970s (−5.2), 1980s (−3.2) and 2010s (−11.4). It sat in the eventual decade winner rarely: it held Japan through 1910–11 and 1917 and Germany in 1950 and 1952 (then rotated to Japan, Finland and Denmark while Germany compounded at 39% a year), held gold in 1975 and 1980 (missing 1976–79), and held Finland in 1994–95, 1997 and 1999–2000 (catching the Nokia peak and the crash). The 1890s were lost in Japanese bonds, Portuguese bonds and Italian equities during silver-standard devaluations.

**Why it does not work at annual frequency.** The 12-month signal ranks 33 assets whose USD returns are dominated by currency swings and one-off events; the leader's next-year return has a mean 1–2 points below the US market's and twice the dispersion, and a switch costs 1% a year on average. The cross-sectional country momentum premium the literature finds (Asness, Moskowitz and Pedersen 2013; Geczy and Samonov's two-century study) is a monthly, long-short, many-asset effect worth a few points a year on diversified portfolios; concentrating in one asset per year keeps the noise and throws away the diversification that carries it.

**What 2× does.** The top-1 rule at 2× held Portugal in 1981 (its USD equity return that year was below −60%; at 2× with financing that is ruin) and every other 2× variant died in 2008 (Finland, Norway or Sweden equities, −60% in USD). A daily-reset product would have ended near zero rather than negative, which is the same outcome for the owner.

### 3.2 The ETF era, monthly data (1996-07 to 2026-09)

Universe: 25 country/regional ETFs (17 iShares country funds from 1996, Korea, Taiwan and Brazil from 2000, South Africa and EEM from 2003, FXI from 2004, INDA from 2012, SPY), gold (spot then GLD), commodities (GSCI spot plus bills, then DBC from 2006), long Treasuries (synthetic from GS10, then TLT from 2002), bitcoin (Coin Metrics from 2010-07; alternatively admitted only from 2014, or excluded), cash = 3-month bills. Signal: 12-month total return; trend exit: price above its 10-month SMA and momentum above bills, checked every month for held positions; re-decided monthly (M), quarterly (Q) or annually (A). Costs 0.10% one-way for ETFs, 0.6% for bitcoin. 2× = 2r − r_bills − 1%/yr with monthly reset. SPY returned 10.5% over the same 30 years (max drawdown −51%). 52 variants (`q3_monthly_grid.csv`):

| Rule | CAGR | Excess vs SPY | Vol | Max DD | Worst year | 10-yr windows beating SPY by ≥5 pts | Excess 1996–2010 / 2011–2026 | Years beating SPY | Position changes/yr |
|---|---|---|---|---|---|---|---|---|---|
| **All assets, top-1, monthly, 1×** | **37.0%** | **+26.5** | 101% | **−82%** | −67% (2018) | 91% | +3.9 / **+53.2** | 58% | 3.7 |
| All assets, top-1, quarterly, 1× (best of 52) | 40.7% | +30.3 | 101% | −77% | −63% (2018) | 95% | +5.9 / +59.3 | 61% | 2.5 |
| All assets, top-1, annual, 1× | 18.7% | +8.2 | 90% | −71% | −52% (2018) | 92% | +3.8 / +13.1 | 55% | 1.7 |
| **No bitcoin, top-1, monthly, 1×** | **7.6%** | **−2.9** | 26% | −50% | −25% (2000) | 36% | +3.9 / **−8.8** | 42% | 4.8 |
| No bitcoin, top-1, quarterly, 1× | 8.1% | −2.4 | 27% | −50% | −26% (2015) | 38% | +5.9 / −9.6 | 42% | 2.9 |
| Bitcoin from 2014, top-1, monthly, 1× | 20.2% | +9.8 | 44% | −82% | −67% (2018) | 68% | +3.9 / +16.2 | 52% | 4.0 |
| Countries only, top-1, monthly, 1× | 9.5% | −1.0 | 26% | −54% | −25% (2001) | 40% | +8.2 / −9.0 | 39% | 4.6 |
| Countries only, top-1, quarterly, 1× | 10.5% | +0.1 | 26% | −51% | −33% (2000) | 41% | +7.3 / −6.3 | 48% | 2.7 |
| All assets, top-3, monthly, 1× | 21.3% | +10.8 | 37% | −44% | −40% (2018) | 89% | +6.2 / +16.0 | 58% | 8.4 |
| All assets, top-3, quarterly, 1× | 22.7% | +12.2 | 37% | −33% | −30% (2018) | 97% | +6.3 / +18.6 | 61% | 5.0 |
| **No bitcoin, top-3, monthly, 1×** | **8.9%** | **−1.6** | 17% | **−29%** | −23% (2018) | 35% | +6.2 / −8.5 | 35% | 8.9 |
| No bitcoin, top-3, quarterly, 1× | 10.6% | +0.2 | 17% | −25% | −13% (2011) | 38% | +6.3 / −5.3 | 48% | 5.0 |
| Bitcoin from 2014, top-3, monthly, 1× | 14.4% | +3.9 | 21% | −44% | −40% (2018) | 45% | +6.2 / +2.0 | 52% | 8.5 |
| All assets, top-1, monthly, 2× | 37.1% | +26.6 | 202% | **−98.5%** | −94% (2018) | 84% | +0.5 / +58.5 | 48% | 3.7 |
| No bitcoin, top-1, monthly, 2× | 4.7% | −5.7 | 53% | −90% | −51% (2000) | 35% | +0.5 / −11.2 | 39% | 4.8 |
| No bitcoin, top-3, quarterly, 2× | 15.2% | +4.8 | 34% | −62% | −27% (2011) | 48% | +10.8 / −0.5 | 58% | 5.0 |
| All assets, top-3, quarterly, 2× | 36.5% | +26.0 | 73% | −62% | −54% (2018) | 100% | +10.8 / +43.2 | 61% | 5.0 |

What the monthly top-1 rule held, by year (most frequent holdings; `q3_monthly_holdings.csv`): 1996 SPY · 1997 SPY, Spain, Mexico · 1998 Italy, Spain, Belgium · 1999 Malaysia, Belgium · 2000 Malaysia, commodities, Canada · 2001 bonds, commodities · 2002 Korea, commodities · 2003 Brazil, bonds · 2004–05 Austria, Brazil · 2006 Brazil, China, Korea · 2007 China, Malaysia, Singapore · 2008 Brazil, commodities, bonds · 2009 bonds, gold, Brazil · 2010 Malaysia, Brazil, Mexico · 2011 Sweden, gold · 2012 bonds, bitcoin · 2013 bitcoin · 2014 bitcoin, India, Italy · 2015 China, Belgium, India · 2016–17 bitcoin · 2018 bitcoin, SPY, commodities · 2019 bitcoin, SPY, bonds · 2020 bitcoin, bonds, Taiwan · 2021 bitcoin · 2022 commodities, bills, Brazil · 2023 Mexico, bitcoin, Italy · 2024 bitcoin · 2025 bitcoin, China, Korea · 2026 Korea.

Three readings:

- **The rule's ETF-era record is a bitcoin record.** From 2012 the top-1 rule held bitcoin in most months; the 2018 and 2022 drawdowns (−82% peak to trough) are bitcoin's. Strip bitcoin out and the rule underperforms SPY by 2–3 points a year with the same 50% drawdown; admit bitcoin only from 2014 (when a US retail investor could realistically buy it) and the excess falls from +26.5 to +9.8 points with the −82% drawdown intact.
- **Ex-bitcoin, the rule had one good era and one bad one.** In 1996–2010, when emerging markets, commodities and small European markets led, it beat SPY by 4–8 points a year; in 2011–2026 it lost 5–11 points a year to a US market that was itself the world's strongest asset. The quarterly, countries-only version matched SPY over the whole period (10.5% vs 10.5%) with a −51% drawdown — the same answer the century gives.
- **Top-3 is the only version with a tolerable path**: ex-bitcoin, quarterly top-3 returned 10.6% with a −25% drawdown (SPY −51%) — a diversification and trend benefit, not a return benefit; +0.2 points before tax and inside the luck band (§6).

## 4. Riding manias with a trend entry and an exit ladder

Archetype 7 of `01-greatest-trades-and-blowups.md` §5 ("riding a reflexive mania and exiting; 5–500×; round trips of −50% to −99.8%") is quantified here on 14 episodes: the 1920s US market, gold in the 1970s, the Nikkei (yen and dollars), the Nasdaq, two Shanghai bubbles, five bitcoin cycles, and the AI/semiconductor run (SOXX and Nvidia, still open). Each window starts before the run-up and ends after the bust. Decisions are weekly (Friday closes, 40-week SMA) for daily series and monthly (10-month SMA) for the two monthly ones. Three rules, all entered on the first close above the SMA: **A trend** (exit below the SMA, re-enter above it), **B ladder** (within each ride sell ⅓ at +100% from that ride's entry and ⅓ at +200%, the rest on the trend break; re-enter in full on the next signal), **C trailing stop** (exit 25% below the running peak, re-enter on the next SMA cross). Costs 0.1% a trade (0.6% bitcoin). "Capture" = the rule's return over the window ÷ the gain from entry to the peak (`q4_manias.csv`, `q4_trades.csv`).

| Mania (window) | Entry → peak | Peak gain | Buy-and-hold to window end | A trend: return / capture / giveback from peak / round trips / whipsaw cost | B ladder: return / capture | C trail 25%: return / capture |
|---|---|---|---|---|---|---|
| US stocks 1924–35 (monthly) | Jan 1924 → Sep 1929 | +255% | +48% | +234% / 92% / 34% / 6 / −23% | +281% / 110% | +143% / 56% |
| Gold 1970–85 (monthly) | Sep 1970 → Jan 1980 | +1,775% | +794% | +1,768% / 100% / 20% / 5 / −3% | +991% / 56% | +1,196% / 67% |
| Nikkei 1980–95 (yen) | Jan 1980 → Dec 1989 | +493% | +203% | +225% / 46% / 10% / 21 / −42% | +207% / 42% | +204% / 41% |
| Nikkei 1980–95 (USD) | Jan 1980 → Dec 1989 | +858% | +581% | +384% / 45% / 12% / 27 / −76% | +162% / 19% | +463% / 54% |
| Nasdaq 1990–2004 | Jan 1990 → Mar 2000 | +1,002% | +375% | +509% / 51% / 34% / 22 / −36% | +575% / 57% | +372% / 37% |
| Shanghai 2005–09 (yuan) | Sep 2005 → Oct 2007 | +396% | +164% | +400% / 101% / 27% / 3 / −3% | +230% / 58% | +398% / 100% |
| Shanghai 2013–16 (yuan) | Jun 2013 → Jun 2015 | +134% | +40% | +42% / 31% / 32% / 8 / −17% | +64% / 48% | +30% / 23% |
| Bitcoin 2011 cycle | Apr 2011 → Jun 2011 | +1,612% | +858% | +811% / 50% / 79% / 2 / 0% | +681% / 42% | +389% / 24% |
| Bitcoin 2013 cycle | Jun 2012 → Nov 2013 | +21,330% | +4,513% | +8,211% / 39% / 63% / 3 / −8% | +161% / 1% | +6,823% / 32% |
| Bitcoin 2016–18 cycle | Jul 2015 → Dec 2017 | +6,099% | +4,228% | +5,044% / 83% / 61% / 4 / −14% | +418% / 7% | +2,839% / 47% |
| Bitcoin 2020–22 cycle | Jun 2019 → Nov 2021 | +699% | +280% | +112% / 16% / 26% / 10 / −59% | +49% / 7% | +121% / 17% |
| Bitcoin 2023–26 (open) | Jan 2023 → Oct 2025 | +440% | +271% | +206% / 47% / 16% / 4 / −12% | +271% / 62% | +293% / 67% |
| Semiconductors 2023–26, SOXX (open) | Jan 2023 → Jun 2026 | +409% | +356% | +186% / 46% / 10% / 8 / −32% | +150% / 37% | +302% / 74% |
| Nvidia 2023–26 (open) | Jan 2023 → Sep 2026 | +1,266% | +1,236% | +935% / 74% / 2% / 4 / −4% | +282% / 22% | +978% / 77% |

Across the 11 completed manias (medians): peak gain +858% (9.6×); **the trend rule captured 50% of it** (16–101%), gave back 32% from the peak before its exit, made 6 round trips (2–27) and paid −17% of capital in losing whipsaw trips (−76% on the dollar Nikkei's 27 trips); its median return, +400%, was close to buy-and-hold to the window's end (+375%), because every window is long enough for the bust to be partly recovered. **The ladder captured 42%** (1–110%): it helps in modest manias (1920s, Shanghai 2014) and cripples the parabolic ones — it sold two thirds of the 2013 bitcoin ride at 2× and 3× of a 214× move. **The 25% trailing stop captured 41%**, with fewer trips but larger whipsaw losses.

The archetype's numbers, then: a mechanical rider keeps about half of a mania's peak gain, with a one-in-three chance (Shanghai 2014, bitcoin 2020–22, the yen Nikkei) of keeping under a third, and always gives back 10–80% of the peak before the exit fires. The round trip that track 01 lists as the failure mode (−50% to −99.8%) is avoided; what replaces it is 2–27 whipsaw trades of −2% to −10% each and the psychological cost of re-entering the same asset after a loss. None of the rules found the peak; none is designed to.

## 5. Executability today

**What the meta-rule would hold on 28 September 2026** (`q5_today_ranking.csv`; 12-month bill return 3.7%): the top-1 is **Korea (EWY, +160% over 12 months, 23% above its 10-month SMA)**; the top-3 are **EWY, SOXX (+130%) and Taiwan (EWT, +103%)** — one bet on AI hardware (Samsung, SK Hynix, TSMC) three times over. SPY is 13th of 33 (+20%); DBC (+51%) and Austria (+47%) follow the leaders; gold is 8.5% below its 10-month SMA after a −22% six months; IBIT is −23% over 12 months and below trend; TLT, India and China are negative. Under the rule the IRA would hold Korea (or Korea/semis/Taiwan) and nothing in gold, bonds or bitcoin.

| Version | Weekly decision? | Orders | Where | Tax notes |
|---|---|---|---|---|
| Top-1, monthly re-decision, weekly SMA check | One decision a month plus a weekly exit check; 3.7 position changes a year | 1 sell + 1 buy per change (dollar market orders) | Robinhood IRA | No tax on rotation. Country ETFs, GLD, DBC, TLT and IBIT are all NYSE-listed and eligible for dollar orders (track 20 verified SPY, GLD, TLT, IBIT; the iShares country funds [verify in app]) |
| Top-3, quarterly | Once a quarter; 5 changes a year | ≤3 orders per decision | IRA | As above; DBC issues a K-1 (harmless in an IRA; use PDBC in taxable) |
| Same in the taxable account | Same | Same | Robinhood taxable | Holds are 3–12 months, so gains are short-term (ordinary rates plus 3.8% NIIT); GLD/IAU gains are collectibles (28% maximum); IBIT is property (normal capital gains); DBC is 60/40 futures via K-1; foreign dividends carry a foreign tax credit here but not in the IRA. After tax the ex-bitcoin edge (0 to +1 point) is negative |
| 2× | Same signals | Only SSO/UPRO (US), UGL (gold) and BITX (bitcoin) exist as 2× products; there are no 2× country ETFs, so the 2× rule cannot be executed for the assets that lead most often | IRA allows LETFs (no margin needed) | Not recommended: 2× ruined every century variant and produced a −98.5% drawdown in the ETF era |
| Mania riding (§4) | Weekly Friday check of the 40-week SMA | 1 order per signal; ladder = up to 3 sells per ride | IRA for ETFs (SOXX, IBIT); Coinbase for spot bitcoin | Ladder sales inside 12 months are short-term in taxable |

Everything here fits "at most one recommendation a week" with room to spare. What it does not fit is "exceed SPY by a large margin" (§6).

## 6. Verdict

**Multiple testing.** 52 annual variants and 52 monthly variants were run. To price the luck in a "best of 52", 2,000 random rules were simulated in each universe: every year (or month) a random asset among those eligible (for the ETF era, among those above their 10-month SMA) is held with the same costs (`q6_random_pickers.csv`).

| Universe | Random rules: mean excess vs US | 95th pct | 99th pct | Expected best of 52 random rules | Best tested 1× variant |
|---|---|---|---|---|---|
| Century, annual (33 assets, 1871–2020) | −4.5 pts/yr | −2.3 | −1.5 | −1.5 | +0.8 (equities top-3, exit); no random rule reached it |
| ETF era, monthly (1996–2026) | −3.6 | +2.3 | +5.3 | **+5.6** | +30.3 (all assets incl. bitcoin, quarterly top-1); ex-bitcoin best: +0.2 at 1×, +4.8 at 2× — both inside the luck band |

So 12-month momentum carries real information in the century data (a random picker loses 4.5 points a year to the US; the momentum leader loses 1.3; the top-3 momentum equities gain 0.8), but not enough to beat the US market, and in the ETF era the only result outside the luck band is bitcoin's.

**Shrinkage.** The project's rule is κ = 0.5 on any in-sample edge. Applied here:

| Candidate | In-sample excess vs US | Less luck (best-of-52) | × κ | Valuation drag³ | Expected excess | Expected CAGR |
|---|---|---|---|---|---|---|
| Century meta-rule, top-1, 1× | −1.3 | −1.3 | −0.7 | 0 | **−0.7** | US minus 1 |
| Century, equities top-3 with exit (best) | +0.8 | +0.8 (beats all random) | +0.4 | 0 | **+0.4** | US plus 0–1 |
| ETF era, ex-bitcoin, top-3 quarterly, 1× | +0.2 | −5.4 → floor at 0 | 0 | 0 | **0** | US |
| ETF era, bitcoin from 2014, top-3 monthly, 1× | +3.9 | 0 to +3.9 | +2 | −1 (bitcoin's own valuation is undefined) | **+1 to +2** | US plus 1–2, with −44% drawdowns |
| ETF era, all assets incl. bitcoin, top-1 | +26.5 | +21 | +10 | — | not credible: one asset's 15-year history | — |

³ The US market at a CAPE of about 41 (track 08) has an expected nominal return near 5–6% a year (earnings yield 2.4% plus inflation), against the 9–10% history; the momentum rules' *excess* does not depend on the level, so their expected CAGR moves down with the market's.

**Probability of beating the US by ≥5 points a year over 10 years** (stationary block bootstrap of the annual excess log-returns, mean block 3 years, 20,000 paths; `q6_verdict.csv`):

| Case | Years | Historical excess | Historical share of 10-yr windows ≥ +5 | P(≥ +5) at the historical mean | P(≥ +5) with κ = 0.5 | P(≥ +5) if the true edge is zero | P(beat at all), κ = 0.5 | P(lose by ≥ 5), κ = 0.5 |
|---|---|---|---|---|---|---|---|---|
| Century, all assets, top-1, exit, 1× | 149 | −1.1 | 15% | 20% | **22%** | 25% | 46% | 27% |
| Century, top-3, exit, 1× | 149 | −0.3 | 11% | 17% | **18%** | 19% | 48% | 19% |
| Century, best variant (equities top-3) | 149 | +0.7 | 15% | 21% | **19%** | 17% | 52% | 14% |
| ETF era, ex-bitcoin, top-3 monthly | 29 | −2.1 | 35% | 16% | **20%** | 23% | 41% | 31% |
| ETF era, bitcoin admitted, top-3 monthly | 29 | +9.6 | 90% | 63% | **43%** | 28% | 64% | 15% |
| ETF era, bitcoin admitted, top-1 monthly | 29 | +22.8 | 95% | 73% | **53%** | 38% | 62% | 28% |
| ETF era, top-1 monthly, 2× | 29 | +21.5 | 85% | 64% | **52%** | 41% | 58% | 36% |

Read the "if the true edge is zero" column first: a concentrated 26%-volatility portfolio beats SPY by 5 points over a decade about one time in four *by dispersion alone*, and loses by 5 points about as often. Every century number sits on that line. The bitcoin rows are the only ones above it, and they assume bitcoin's next decade is drawn from its last (a 206%-a-year decade followed by a 42%-a-year one).

**The verdict, in numbers.**

- **Highest credible long-run CAGR from the century view: 9–11% a year at 1× on historical return levels, about 6–8% at today's valuations** — the US market plus 0–2 points — with max drawdowns of 50–60% (top-1) or 25–45% (top-3), and a worst decade near −3% a year. Not 100%, not 30%.
- **P(beat SPY by ≥5 points a year over the next 10 years): about 20–25%** for any version without bitcoin, against a 20–30% chance of losing by that much; **45–55%** with bitcoin in the universe if its past is a base rate, which it is not (one asset, two full cycles, drawdowns of 82%).
- **2× is not a multiplier here.** Every 2× century variant was ruined, and the 2× ETF-era rule lost 98.5% peak to trough.
- **What the 150 years actually say** about "gems in the ocean": each decade's gem was one asset — Australia, Japan, Germany, gold, Sweden, Finland, emerging markets, US tech, bitcoin, AI hardware — worth 6 points a year over the US on median and 13–20 points in the best decades. It was never the momentum leader entering the decade (1 hit in 14 with the 1-year signal); it was the leader *during* the decade, which is why a monthly trend rule catches half of each mania and hands back a third. The owner's system already holds that piece (the trend book and the crash-buy rule); this track finds no meta-rule that turns it into a large margin over SPY.
- **Recommendation for the design:** no new module. If the owner wants a "strongest asset" satellite anyway, the only version with a defensible path is top-3 quarterly across countries, gold, commodities, bonds and IBIT in the IRA (10.6% vs 10.5% ex-bitcoin, −25% drawdown; ≈14% with bitcoin from 2014, −44%), sized so its −45% drawdown is survivable, with the mania rule's weekly 40-week-SMA exit. Its expected excess after shrinkage is 0 to +2 points. Today it would buy Korea, semiconductors and Taiwan.

## 7. Method

- **Panel.** JST R6 (`JSTdatasetR6.xlsx`) → `data36.jst_usd_panel()`: USD return = (1 + local total return) × xrusd[t−1] / xrusd[t] − 1. Dropped country-years: Germany 1922–24 (hyperinflation at annual-average exchange rates gives +830% and −87% artefacts) and 1945–49 (the 10:1 Reichsmark→DM conversion appears as −88% then +702%); diagnostics in `q1_panel_diagnostics.csv`. Remaining extremes are real: Japan 1946 (yen 6.9→180 per dollar; bills −96% in USD), Italy 1942, France 1946, Portugal 1975–77 (exchange closed, −44% a year interpolated).
- **Decades** = calendar years 1870–79, ..., 2020–26; CAGR over available years, ≥7 required (except the 2020s). Equities extended 2021–26 by country ETFs (SPY, EWJ, EWG, EWU, EWQ, EWI, EWP, EWN, EWL, EWD, EWK, EWA, EDEN, EFNL, ENOR, EWC; Portugal's PGAL was delisted in 2025).
- **Momentum tests** (q2, q3 part A): trailing L-year USD return at each year-end; an asset is eligible if it has L valid trailing years and a valid return next year (no year-end leader was excluded by this). Costs 0.5% one-way per switch (19th-century costs were higher). Trend exit: trailing return ≤ trailing US bills → bills.
- **ETF era** (q3 part B): yfinance adjusted closes to month-ends (dividends reinvested); gold = monthly average London price minus 0.4%/yr until GLD lists (Nov 2004); commodities = S&P GSCI spot plus bills until DBC (Feb 2006); bonds = 10-year Treasury synthetic (yield/12 − 7.5 × Δyield) until TLT (Aug 2002); bitcoin = Coin Metrics daily reference price; bills = TB3MS. 10-month SMA on total-return index; positions dropped mid-quarter when they close below the SMA.
- **Leverage:** L × r − (L − 1) × (bills + 1%) per period, floored at −100%; after ruin the series is flat.
- **Manias** (q4): daily series resampled to Friday closes; 40-week SMA; monthly series 10-month SMA; details in §4.
- **Verdict** (q6): random pickers (2,000 per universe), expected maximum of 52 draws from the random distribution; stationary block bootstrap of annual excess log-returns with the mean recentred on κ × historical.

## 8. Caveats

1. **Survivorship in the panel.** JST covers 16 of today's rich countries: no Russia 1917, Austria-Hungary, China 1949, Argentina, Egypt or India. A real "strongest asset on Earth" investor in 1900 faced total losses the panel does not contain (Russia was the fifth-largest market in 1914). Every non-US number here is flattered.
2. **Exchange rates and controls.** Annual-average official rates; wartime and interwar controls make several USD returns unrealizable (the ex-controls variant changes the headline by −0.3 points). A foreigner could not buy "Japan equities" at index prices in 1886, gold was illegal for Americans in 1933–74, and bitcoin was a Mt. Gox account until 2013.
3. **Housing** returns are national, unlevered and illiquid: shown for completeness, excluded from every strategy.
4. **Costs and taxes:** 0.5% (century) and 0.1% (ETF) one-way, 0.6% for bitcoin; no taxes, no slippage, no bid-ask on illiquid country funds in 1996–2003. The ex-bitcoin ETF-era edge (0 to +0.2 points) is negative after any tax.
5. **Annual data is a crude momentum instrument**; the monthly ETF test is the proper one and gives the same ex-bitcoin answer (−3 to +0.2 points). Track 27 tests ETF momentum rotation in depth.
6. **Multiple testing:** 104 variants across the two universes; the random-picker benchmark is the honest yardstick, and only bitcoin clears it.
7. **Leverage modelling:** annual reset overstates the loss beyond −100% relative to a daily-reset ETF, which would end near zero; for the owner the two are the same.
8. **Indices in §4** (Nikkei, Nasdaq, Shanghai) are price-only, so captures are understated by the dividend yield; the 1920s and gold episodes use monthly averages, which smooth entries and exits.
9. **The 2020s are partial** (to 28 September 2026) and the two AI episodes are open.
10. **Bitcoin is not a base rate.** Fifteen years of one asset, two complete cycles. Every number in which it is the driver is reported separately for that reason.

## 9. Sources

- Jordà, Ò., Schularick, M. and Taylor, A. M., "Macrofinancial History and the New Business Cycle Facts", *NBER Macroeconomics Annual* 2016; Jordà, Knoll, Kuvshinov, Schularick and Taylor, "The Rate of Return on Everything, 1870–2015", *Quarterly Journal of Economics* 134(3), 2019. Data: Jordà–Schularick–Taylor Macrohistory Database, release 6 (2022), https://www.macrohistory.net/database/ — downloaded 29 Sep 2026 from the site's download ids 9834512569 (Excel) and 9834512469 (Stata); the two ids are labelled the wrong way round on the page, so the loader sniffs the file signature. Documentation: `JST_documentationR6.pdf`, `JST_RORE_Documentation_R6.pdf` (same page).
- Gold: Open Knowledge "datasets/gold-prices" (monthly average USD/oz since 1833; LBMA after 1968), https://github.com/datasets/gold-prices.
- FRED: MCOILWTICO (WTI spot, monthly, from 1986), NIKKEI225 (daily from 1949), NASDAQCOM (daily from 1971), DEXJPUS, DEXCHUS, TB3MS, GS10, CPIAUCNS.
- Coin Metrics community API, BTC PriceUSD, daily from 2010-07-18.
- Yahoo Finance via yfinance (adjusted closes to 2026-09-28): SPY, QQQ, SOXX, NVDA, GLD, DBC, TLT, IBIT, BIL, SSO, UPRO, ^SPGSCI, 000001.SS and the iShares country funds listed in §3.2.
- Robert Shiller, `ie_data.xls` (monthly S&P composite from 1871; the cached copy in `code/02-academic/data` ends 2023-09), used for the 1920s episode only. The Kenneth French files listed in the brief were not needed (US bills and bonds come from FRED).
- Literature named for context, not verified against Crossref in this track: Asness, Moskowitz and Pedersen, "Value and Momentum Everywhere", *Journal of Finance* 2013; Geczy and Samonov, "Two Centuries of Multi-Asset Momentum", 2017 (SSRN); Dimson, Marsh and Staunton, *Global Investment Returns Yearbook* (country rankings since 1900).

## Reproduction

```
cd research/code/36-century
python3 run_all.py            # all six modules; results/*.csv (835 KB total)
python3 run_all.py q4_manias  # one module
```

Modules: `data36.py` (loaders and cache; set `CENTURY_CACHE` to move the cache), `q1_decade_winners.py`, `q2_knowable.py`, `q3_meta_rule.py`, `q4_manias.py`, `q5_today.py`, `q6_verdict.py`. Requires Python 3.11 with `pandas numpy scipy yfinance requests xlrd openpyxl`. Randomness is seeded (`numpy.random.default_rng(36)`); every table in this document is produced by the corresponding `results/q*.csv`.
