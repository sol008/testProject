# 31 — The growth portfolio: how to combine sleeves and size leverage for maximum long-run growth, and what to really expect

*Research track 31 of the growth round (tracks 26–31), 29 Sep 2026. Everything here is reproduced by `python3 research/code/31-growth-portfolio/run_all.py` (about 10–15 minutes, fixed seed). Each table has a CSV twin in `research/code/31-growth-portfolio/results/`. Returns are nominal, in USD, after fund costs (expense ratios, leveraged-ETF financing, 0.05% a switch), and before tax unless a table says otherwise. This is research for the owner's own use, not individualized financial advice. Every book below can lose most of its money.*

---

## TL;DR

1. **At today's prices, leverage alone is not expected to beat SPY.** With CAPE ≈41 (equities ≈4.5% a year, T-bills 4.2%), Kelly says ≈1× equity. 2–3× S&P or Nasdaq-100 books with a 200-day filter show a median 10-year CAGR of ≈0–3% vs SPY's 5.1%. The 3× versions carry an 80–99% chance of a >50% drawdown. They beat SPY by 5+ points (16–27% a year, 10× in 9–14 years) only if the last century's 6.6-point equity premium returns — a bet, not an edge.
2. **In the central forward case, every book with ≥1-in-3 odds of beating SPY by 5+ points holds ≥20% in the Bitcoin 10-week switch** (≈12% a year forward, from Bitcoin's decaying cycles and a shrunk timing edge). If Bitcoin goes flat, those odds fall to 17–33%.
3. **Candidates by forward median 10-year CAGR / P(beat SPY by ≥5 points) / P(drawdown >50%) / median years to 10×:** **A**, Bitcoin-led half Kelly: 10.4% / 52% / 10% / 21. **B**, SPY 80% + 20% IBIT switch: 8.7% / 36% / 11% / 26. **C**, 2× S&P + 2× Nasdaq-100 (200-day, weekly) 80% + 20% IBIT switch: 7.6% / 34% / 20% / 29. SPY: 5.1% / — / 20% / 44. If history repeats, C leads: 29.6%, 10× in 8 years.
4. **One Sunday email with ≤3 orders loses nothing:** weekly vs daily trend decisions differ by −0.9 to +1.2 points, with half the switches. M1, M4 and W8 go to shadow (together ≈0.1–0.2 points a year); W10 rides along. Replace G(D), which halves a leveraged book's growth, with a wide 20%→50% governor: it costs ≈0.7 points and cuts book C's 20-year chance of a >50% drawdown from 42% to 3%.
5. **Hold every switching sleeve in the IRA;** in a taxable account they lose 2–4.5 points a year (equity trend) and 4–14 points (the Bitcoin switch). **Recommendation: paper-trade C with the wide governor.** Expect ≈7% a year in the central case (≈2.1× in 10 years; 1 in 3 odds of SPY + 5; 1 in 8 of ending below the start) and ≈29% if history repeats. 10× in ≤10 years is a tail outcome, not a plan.

---

## 0. The objective, as numbers

The owner's new objective (29 Sep 2026): "exceed SPY return by a large margin", at most one recommendation a week, a "make-rich-quick engine". This track reads that as:

- **Target:** SPY + 5 points a year or more. The yardstick is the median over 5–10 years, after costs.
- **Speed:** the median time to 2×, 5× and 10× wealth, with the 10th and 90th percentiles.
- **Cadence:** one email a week, with at most 3 orders.
- **Honesty:** every number comes in two worlds.
  - **History:** the future looks like 1928–2026, or 2008–2026.
  - **Forward:** the design's own planning view (§0 and §6). CAPE is about 41, so equities earn about 4.5% a year (range 3–6%), T-bills 4.2%, and Bitcoin follows its cycle decay.

The current Phase A book (M1, M2, M3 and W10) expects about 5.0% a year. That is roughly SPY's forward return, and 6 points below SPY's history.

---

## 1. The core arithmetic: when does leverage beat SPY?

An L× daily-reset fund earns roughly:

> L × index return − (L − 1) × (T-bill + 0.4%) − 0.9% fee − (L² − L) × σ²/2

The last term is volatility drag. At the S&P's long-run volatility (≈19%), it costs about 3.6 points a year at 2× and 10.8 points at 3×.

So leverage adds return only when the index's premium over T-bills is large compared with its variance. The 200-day filter helps because the index's worst, most volatile stretches come below its 200-day average (Gayed & Bilello 2016). Holding cash then removes much of the drag. The filter doesn't remove crashes that start above the average, such as October 1987.

**Table 1. Leverage is a bet on the equity premium** (`leverage_breakeven.csv`). The 1928–2026 S&P path is tilted so that buy-and-hold earns each "world" return. T-bills are 4.2%, except in the history row. Filter rules are decided weekly and their historical timing edge is halved (§3.1).

| World: S&P buy-and-hold a year | SPY | 1× + 200d | 2× + 200d | 3× + 200d | 3×, no filter | 3× + 200d worst drawdown |
|---|---|---|---|---|---|---|
| 3% (bear end of the design's range) | 2.9% | 4.4% | 2.7% | 0.3% | −11.4% | −95% |
| **4.5% (design central, CAPE 41)** | **4.4%** | **5.2%** | **4.3%** | **2.4%** | **−7.4%** | **−95%** |
| 6% (bull end of the range) | 5.9% | 6.0% | 5.9% | 4.7% | −3.4% | −95% |
| 7.5% | 7.4% | 6.9% | 7.5% | 7.2% | +0.8% | −93% |
| 9% | 8.9% | 7.5% | 8.8% | 8.9% | +5.0% | −95% |
| History 1928–2026 (10.0%; real T-bills averaged 3.4%) | 10.0% | 9.9% | 14.4% | 17.9% | 10.0% | −94% |

What this means:
- **Leverage beats SPY only when the equity premium over T-bills is historical-sized.** On this path, the premium must reach about 3 points a year (2×) or 5 points (3×) before the filtered book merely *matches* SPY.
- The 1928–2026 S&P earned 6.6 points over T-bills. The design's forward view gives about 0.3 points.
- The historical +8 points for 3× also needs the filter's full historical timing edge and low T-bill rates. The average T-bill rate was 3.4%, and near zero for much of 2009–2021.
- **Holding 3× without the filter loses money** in every forward world below about 7.5%.

---

## 2. Growth-optimal mix and leverage (Kelly)

### 2.1 One asset at a time

Kelly (1956) and Breiman (1961) show that the stake maximising expected log growth also maximises the median outcome and minimises the time to a distant goal. Track 03 §1–2 has the background.

**Table 2. Full-Kelly exposure** (`kelly_single.csv`). Exposure is the multiple of NAV held in the asset while its rule is "in". Past 1×, the leverage is built from 1× and 3× funds, and beyond 3× from margin at T-bills + 0.4%.

| Asset | History: full Kelly | History: CAGR at full / half / quarter | Forward: full Kelly | Forward: CAGR at full / half / quarter |
|---|---|---|---|---|
| S&P 500, buy-and-hold (1928–2026) | 2.0× | 12.1% / 10.0% / 7.1% | 0.55× | 4.8% / 4.6% / 4.4% |
| S&P 500 + 200-day filter (1928–2026) | **4.15×** | 19.2% / 15.0% / 10.1% | **1.05×** | 5.2% / 4.9% / 4.6% |
| S&P 500 + 200-day filter (2008–2026) | 5.5× | 25.6% / 19.1% / 11.5% | 0.45× | 4.3% / 4.3% / 4.2% |
| Nasdaq-100 + 200-day filter (1986–2026) | 3.2× | 23.9% / 18.2% / 11.7% | 0.8× | 5.1% / 4.9% / 4.6% |
| Bitcoin, buy-and-hold (2014–2026) | 1.45× | 65% / 46% / 26% | 0.55× | 11.8% / 9.7% / 7.4% |
| Bitcoin 10-week switch (2014–2026) | 2.3× | 95% / 65% / 35% | 0.85× | 12.3% / 10.3% / 7.7% |

- **On history, Kelly says lever up:** 2× on the plain S&P, and 3–5× with the 200-day filter.
- **On the design's forward numbers, Kelly says don't:**
  - about 0.5× on plain equities, and about 1× with the filter;
  - the growth-optimal equity book earns about 5% a year, the same as the current design.
- **The two worlds disagree by a factor of 4–10 in stake size.** That disagreement, not any lack of data, is the whole sizing problem.

### 2.2 Several sleeves together

**Table 3. Kelly mix** (`kelly_mix.csv`). Building blocks are SPY, QQQ, and the 1× and 3× filtered S&P and Nasdaq-100 funds, all decided weekly, plus the Bitcoin switch. Weights are ≥0 and sum to ≤100%; the rest is T-bills. There is no margin, so 3× exposure is the maximum. Half and quarter Kelly scale every weight toward T-bills. "Worst drawdown" is on the real path.

| Sample | Full Kelly weights | Full: CAGR / worst drawdown | Half: CAGR / worst drawdown | Quarter: CAGR |
|---|---|---|---|---|
| History 1928–2026, S&P only | 100% 3× S&P + 200d (the cap binds) | 17.9% / −94% | 12.3% / −70% | 8.2% |
| History 1986–2026, S&P + Nasdaq | 90% 3× Nasdaq + 200d, 9% 3× S&P + 200d | 23.8% / −87% | 17.0% / −58% | 10.8% |
| History 2014–2026, with Bitcoin | 89% BTC switch, 11% 3× Nasdaq + 200d | 58% / −62% | 30% / −36% | 16% |
| Forward 1928–2026, S&P only | 82% 1× S&P + 200d, 17% SPY (1.03× equity) | 5.2% / −55% | 4.9% / −27% | 4.6% |
| Forward 1986–2026, S&P + Nasdaq | 40% 1× Nasdaq + 200d, 38% QQQ, 22% T-bills | 5.4% / −61% | 5.1% / −30% | 4.7% |
| **Forward 2014–2026, with Bitcoin** | **79% BTC switch, 21% 1× S&P + 200d** | **12.6% / −66%** | **10.2% / −32%** | **7.7%** |

- **Under forward assumptions, the growth-optimal book is mostly the Bitcoin switch.** Equities barely beat T-bills at CAPE 41, and leverage makes them worse.
- **Everything therefore rests on one number:** Bitcoin's forward return.
  - That figure is the most uncertain input in this whole study (§8).
  - Its central value (7.5% a year buy-and-hold; the switch ≈12%) is an extrapolation of three cycles.

### 2.3 Why fractional Kelly, and how much

Full Kelly is right only when the inputs are right. Track 03 §2.5–2.6 gives the theory:
- An estimated edge with t-statistic t should be bet at t²/(1 + t²) of plug-in Kelly.
- Betting c × Kelly keeps 2c − c² of the growth.
- The chance of ever halving is 0.5^(2/c − 1): 50% at full Kelly, 12.5% at half.

Here the uncertainty is not sampling noise but which world we are in. The model-risk tables make that concrete.

**Table 4. Regret: sized for one world, living in another** (`kelly_regret.csv`). The book is the S&P with the 200-day filter, 1928–2026 path. Cells are the CAGR.

| Sized for (exposure) | True world: 3% | True: 4.5% | True: 6% | True: history |
|---|---|---|---|---|
| Forward 4.5%, full Kelly (1.05×) | 4.3% | **5.2%** | 6.1% | 10.2% |
| History, full Kelly (4.15×) | **−4.5%** | **−1.7%** | 1.3% | **19.2%** |
| History, half Kelly (2.1×) | 2.8% | 4.4% | 6.1% | 15.0% |
| History, quarter Kelly (1.04×) | 4.3% | 5.2% | 6.1% | 10.1% |

**Table 5. Kelly under model uncertainty** (`kelly_model_uncertainty.csv`). The table maximises growth averaged over worlds: the historical premium returns with probability p; otherwise the three forward worlds (3 / 4.5 / 6%) are equally likely.

| p(historical premium returns) | Best exposure (S&P + 200d) | Expected CAGR | CAGR if forward 4.5% | CAGR if history |
|---|---|---|---|---|
| 0% | 1.05× | 5.2% | 5.2% | 10.2% |
| 10% | 1.4× | 5.8% | 5.1% | 12.0% |
| 25% | 1.95× | 7.0% | 4.6% | 14.5% |
| 50% | 2.75× | 10.0% | 3.1% | 17.3% |

Reading the two tables:
- **Sizing for history when the forward view is right costs about 7 points a year:** −1.7% instead of +5.2%.
- **Quarter-Kelly-on-history ≈ full-Kelly-on-forward.** It gives up nothing if the forward view is right, and keeps 10% a year if history repeats.
- A believer who puts 10–25% on the historical premium returning should hold **about 1.4–2× equity exposure while the filter is "in"**, not 3×. At 3×, you are betting that history repeats with probability of more than one half.

**Recommendation:**
- **Equity leverage: about half of the historical Kelly** (≈2× while in, and ≤1.6× of NAV in the book below).
- **Bitcoin: about a quarter of forward Kelly** (≈20% of NAV), because its forward return is the least certain input (§8).

---

## 3. Outcome distributions

### 3.1 Method

- **Sleeves** (`sleeves31.py`), all as daily return series:
  - SPY and QQQ;
  - 1×, 2× and 3× S&P 500 and Nasdaq-100 funds, held while the index closes above its 200-day average and in T-bills otherwise;
  - the Bitcoin 10-week switch in IBIT;
  - the current Phase A book, from track 23's 1993–2026 history spread over each month's sessions.
- **Fund model and execution:**
  - The leveraged funds use track 04's validated formula (it tracks UPRO and SSO at 0.998–0.995 correlation).
  - Decisions are made at the week's last close and executed at the next open (1962 on; the next close before 1962).
  - Each switch costs 0.05%. Weekly and daily versions are both built (§5).
- **Forward model:**
  - T-bills are a flat 4.2%.
  - The S&P and Nasdaq-100 total-return paths get a constant daily tilt so that buy-and-hold earns 4.5% a year over the sample window. Every 200-day signal is recomputed on the tilted path.
  - Each timing rule's Jensen alpha on its asset is then shrunk by 1 − κ, with κ = min(0.5, t²/(1 + t²)) (track 03 §2.5; design §4 uses κ = 0.5).
    - Without the shrink, a constant tilt would hand any rule that is sometimes out of the market an artificial edge.
    - Equity filters: t = 1.8–3.7, so κ = 0.5.
  - Bitcoin is tilted to **7.5% a year**, the peak-to-peak cycle-decay extrapolation (`btc_cycle_decay.csv`):
    - peak to peak: 16.9× → 3.5× → 1.8×, next ≈1.33× in 4 years;
    - trough to trough gives 25% a year, but the 2026 trough may not be in.
  - Its switch keeps κ = 0.26 of its timing alpha, from the 2021–2026 out-of-sample t of 0.60 (track 15's test period). Result: ≈12% a year, −77% worst drawdown on the tilted path.
- **Optimistic forward:** equities 6%, T-bills 3.5%, Bitcoin 15%.
- **Bootstrap** (`engine31.py`): 2,000 paths of 50 years, built from blocks of 21, 42 or 63 sessions (1–3 months) drawn from the window. All books share the same draws, so "beats SPY" is measured on the same path.
  - A sleeve whose history starts after a drawn block is filled from its own history. This affects Bitcoin before 2014, which is 37% of blocks in 2008–2026.
  - Books whose sleeves cover under half the window are skipped. So there is no Bitcoin book before 2008, and no Nasdaq book in 1928–2026.
  - Books are rebalanced daily to their weights. §5.3 checks weekly band rebalancing on the real path: same or better.

### 3.2 Ten-year outcomes

**Table 6. Forward (central) world, 2008–2026 structure** (`headline.csv`, `mc_outcomes.csv`). Median 10-year CAGR (10th–90th percentile) and probabilities over 10 years. SPY's own median is 5.1% here. Its 10-year distribution is left-skewed, so the median sits above its 4.4% average growth.

| Book | Median 10-y CAGR (p10–p90) | P(beat SPY) | P(beat SPY by ≥5 pts) | P(drawdown >50%) | P(>80%) | P(end below start) | Median years to 10× |
|---|---|---|---|---|---|---|---|
| SPY | 5.1% (−2 to 12%) | — | — | 20% | 0% | 18% | 43.5 |
| Phase A (current design) | 4.9% (3 to 7%) | 49% | 16% | 0% | 0% | 0% | 47.8 |
| 2× S&P + 200d | 2.6% (−5 to 11%) | 34% | 9% | 34% | 0% | 33% | >50 |
| 3× S&P + 200d | 0.5% (−10 to 12%) | 29% | 11% | 80% | 13% | 48% | >50 |
| 3× Nasdaq-100 + 200d | 0.5% (−13 to 18%) | 33% | 20% | 94% | 30% | 48% | >50 |
| 3× blend (S&P/Nasdaq 50/50) + 200d | 1.3% (−10 to 15%) | 33% | 15% | 83% | 14% | 44% | >50 |
| **2× blend + 200d, plus 20% BTC switch** | **7.6% (−1 to 17%)** | 66% | 34% | 20% | 0% | 13% | 29.2 |
| 3× blend + 200d, plus 20% BTC switch | 6.3% (−5 to 19%) | 57% | 32% | 63% | 4% | 24% | 31.4 |
| **SPY 80% + BTC switch 20%** | **8.7% (0 to 17%)** | 83% | 36% | 11% | 0% | 8% | 26.1 |
| **Half Kelly, forward mix (40% BTC switch, 10% 1× S&P + 200d, 50% T-bills)** | **10.4% (1 to 21%)** | 75% | 52% | 10% | 0% | 7% | 21.2 |
| Full Kelly, forward mix (79% BTC switch, 21% 1× S&P + 200d) | 13.0% (−5 to 36%) | 71% | 58% | 90% | 13% | 19% | 14.1 |
| BTC 10-week switch alone | 12.2% (−9 to 40%) | 65% | 55% | 99% | 35% | 24% | 13.1 |

**Table 7. History 2008–2026 world.** Bitcoin books draw their pre-2014 Bitcoin blocks from 2014–2026, including the 2015–2021 bubble years. SPY's median is 12.0%.

| Book | Median 10-y CAGR (p10–p90) | P(beat SPY by ≥5 pts) | P(drawdown >50%) | P(end below start) | Median years to 10× |
|---|---|---|---|---|---|
| SPY | 12.0% (4 to 19%) | — | 9% | 2% | 20.0 |
| Phase A | 5.4% (3 to 7%) | 1% | 0% | 0% | 43.5 |
| 3× S&P + 200d | 20.7% (6 to 38%) | 66% | 52% | 3% | 11.2 |
| 3× blend + 200d | 26.6% (9 to 47%) | 82% | 69% | 2% | 8.7 |
| 2× blend + 200d, plus 20% BTC switch | 29.6% (17 to 43%) | 96% | 3% | 0% | 8.4 |
| SPY 80% + BTC switch 20% | 22.8% (13 to 33%) | 88% | 1% | 0% | 10.9 |
| Half Kelly, forward mix | 26.8% (14 to 41%) | 83% | 1% | 0% | 9.3 |

**Table 8. The longer histories, equity books only.** The 1928–2026 bootstrap includes the Depression and 1987.

| Book | History 1928–2026: median / P(+5 pts) / P(DD >50%) | History 1986–2026 | Forward, 1928–2026 structure | Forward, 1986–2026 structure |
|---|---|---|---|---|
| SPY | 9.7% / — / 16% | 11.2% / — / 7% | 4.1% / — / 30% | 4.5% / — / 17% |
| 2× S&P + 200d | 14.4% / 47% / 29% | 12.8% / 28% / 18% | 4.5% / 20% / 43% | 2.2% / 9% / 35% |
| 3× S&P + 200d | 17.8% / 62% / 73% | 15.9% / 48% / 64% | 2.8% / 22% / 85% | −0.2% / 11% / 82% |
| 3× blend + 200d | n/a | 21.7% / 69% / 78% | n/a | 0.1% / 16% / 91% |
| 3× Nasdaq-100 + 200d | n/a | 23.5% / 67% / 96% | n/a | −2.6% / 18% / 99% |

What the tables say:
- **Equity leverage is a coin you flip once, on the equity premium.**
  - In history-like worlds, 3× filtered books make 16–27% a year, beat SPY by 5+ points 48–82% of the time, and reach 10× in 9–14 years.
  - In the forward world, they make −3% to +3%, and 80–99% of paths suffer a >50% drawdown.
  - Nothing inside the rule tells you in advance which world you are in.
- **In the forward world, every book that beats SPY by ≥5 points with ≥1-in-3 odds holds 20% or more in the Bitcoin switch.** §8 tests how much that rests on Bitcoin.
- **The current design (Phase A) is SPY-like in the forward world with no deep drawdowns.** It is far behind SPY in history-like worlds. It can't meet the new objective in any world.

### 3.3 "Make-rich-quick" metrics: time to 2×, 5× and 10×

**Table 12. Years to reach 2×, 5× and 10× wealth, median (10th–90th percentile)** (`mc_time_to_multiple.csv`). Nominal, pre-tax. ">50" means the percentile is not reached within 50 years.

| Book | World | 2× | 5× | 10× | Share reaching 10× within 50 y |
|---|---|---|---|---|---|
| SPY | forward | 10.3 (4.4–30) | 29 (15–>50) | 44 (24–>50) | 60% |
| SPY | history 2008–26 | 5.3 (2.8–11) | 14 (8–22) | 20 (13–30) | 100% |
| Phase A | forward | 14 (10–20) | 33 (27–41) | 48 (40–>50) | 60% |
| 3× S&P + 200d | forward | 13 (2.4–>50) | >50 | >50 | 20% |
| 3× S&P + 200d | history 2008–26 | 2.5 (1.1–7.6) | 7.3 (3.9–15) | 11 (6–21) | 100% |
| 2× blend + 20% BTC | forward | 7.2 (2.6–21) | 20 (9–40) | 29 (16–>50) | 90% |
| 2× blend + 20% BTC | history 2008–26 | 2.3 (1.2–4.7) | 5.9 (3.7–9.5) | 8.4 (5.8–13) | 100% |
| SPY 80% + 20% BTC | forward | 6.8 (2.9–17) | 18 (10–33) | 26 (16–44) | 90% |
| Half Kelly, forward mix | forward | 5.5 (1.9–15) | 14 (7–28) | 21 (12–37) | 100% |
| Half Kelly, forward mix | history 2008–26 | 2.6 (1.2–5.4) | 6.5 (3.7–11) | 9.3 (6–15) | 100% |

- **In the central forward case, no book with tolerable risk reaches 10× in under about 20 years in the median.** The lucky tenth of paths get there in 12–16 years.
- **"Make-rich-quick" (10× in 5–10 years) happens in the forward world only on the lucky tails of Bitcoin-heavy books.**
  - Full Kelly reaches 10× within 10 years on 22% of paths.
  - It also has a 90% chance of a >50% drawdown.
- **If history repeats, the 2× blend with Bitcoin reaches 10× in about 8 years.** That is the whole bet.

---

## 4. Candidate books, ranked by median wealth growth

Ranked by forward (central) median growth. The history-like world is alongside. All run in the IRA, with a weekly clock, ≤3 orders a week, and no margin.

| Rank | Book | Holdings | Forward: median 10-y CAGR / P(≥SPY + 5) / P(DD >50%) / median years to 10× | History-like: the same | If Bitcoin earns 0% a year (no switch edge) |
|---|---|---|---|---|---|
| 1 | **A. Bitcoin-led half Kelly** | 40% IBIT on the 10-week switch, 10% SPY on the 200-day filter, 50% T-bills | 10.4% / 52% / 10% / 21 y | 26.8% / 83% / 1% / 9 y | 6.3% / 33% |
| 2 | **B. Core + Bitcoin** | 80% SPY (held), 20% IBIT on the 10-week switch | 8.7% / 36% / 11% / 26 y | 22.8% / 88% / 1% / 11 y | 6.7% / 17% |
| 3 | **C. 2× trend + Bitcoin** | 40% SSO and 40% QLD, each only while its index closes above its 200-day average (weekly); 20% IBIT on the 10-week switch | 7.6% / 34% / 20% / 29 y | 29.6% / 96% / 3% / 8 y | 5.6% / 22% |
| — | SPY | 100% SPY | 5.1% / — / 20% / 44 y | 12.0% / — / 9% / 20 y | — |
| — | 3× trend + Bitcoin (for reference) | 40% UPRO / 40% TQQQ with the filter, 20% IBIT | 6.3% / 32% / 63% / 31 y | 36.8% / 97% / 32% / 7 y | 4.5% / 21% |

How to choose:
- **A** has the best central-case numbers, but it is a Bitcoin book. 40% of NAV rides one switch whose forward return is the least certain input here.
- **B** is the most robust. It beats SPY in 83% of forward paths, with the fewest losses of capital, and it doesn't depend on leverage.
- **C** is the one to own if you give the historical equity premium real odds:
  - its equity exposure (1.6× NAV while "in") is what a 10–25% belief in that premium justifies (Table 5);
  - it is the fastest to 10× of the three if history repeats;
  - it is the weakest if the forward view is right.

---

---

## 5. Cadence: one recommendation a week

### 5.1 Trend sleeves: weekly decisions lose nothing

**Table 9. Daily vs weekly 200-day decisions, both executed at the next open** (`cadence_trend_daily_vs_weekly.csv`). Cells are CAGR daily / weekly, and switches a year daily / weekly. Before 1962 the S&P has no real open, so both clocks switch at the next close.

| Sample | Sleeve | CAGR daily / weekly | Weekly − daily | Worst drawdown daily / weekly | Switches a year |
|---|---|---|---|---|---|
| History 1928–2026 | S&P 3× | 18.8% / 17.9% | −0.9 | −93% / −94% | 6.0 / 3.0 |
| History 1962–2026 (real opens) | S&P 3× | 17.3% / 17.3% | 0.0 | −69% / −76% | 6.2 / 3.0 |
| History 1962–2026 | S&P 2× | 13.9% / 14.0% | +0.1 | −51% / −58% | 6.2 / 3.0 |
| History 1986–2026 | Nasdaq-100 3× | 22.5% / 23.8% | +1.2 | −94% / −89% | 6.9 / 3.0 |
| History 2008–2026 | S&P 3× | 19.3% / 20.2% | +0.9 | −53% / −47% | 5.7 / 2.9 |
| History 2008–2026 | Nasdaq-100 3× | 28.6% / 28.3% | −0.4 | −58% / −66% | 6.4 / 2.8 |
| Forward 1928–2026 | S&P 3× | 2.7% / 2.4% | −0.2 | −95% / −95% | 7.6 / 3.6 |
| Forward 1986–2026 | Nasdaq-100 3× | −2.6% / −2.4% | +0.2 | −99% / −99% | 9.8 / 4.1 |

A weekly clock:
- **halves the switches;**
- changes CAGR by −0.9 to +1.2 points, about zero on average;
- sometimes deepens the worst drawdown by up to 7 points, because a crash that starts mid-week is met only on Friday.

The owner's one-a-week limit costs the trend sleeves nothing measurable.

### 5.2 The daily-signal modules on a weekly clock

**Table 10. M1 and W10 on a weekly clock** (`cadence_m1_w10.csv`). Unshrunk history; contribution is at the design's 6% of NAV, over T-bills.

| Module | Clock | Trades a year | Win rate | Mean excess per trade | Contribution a year |
|---|---|---|---|---|---|
| M1 dip-buy (SPY, 1993–2026) | daily (design) | 3.7 | 83% | +1.04% | +0.23% (design plans +0.05–0.10%) |
| M1 dip-buy | weekly (Friday signal, Monday entry, Friday exit check) | 1.0 | 68% | +0.93% | **+0.06%** |
| W10 crash-day buy (^GSPC, 1962–2026) | daily (design) | 0.39 | 88% | +6.1% | +0.14% (design plans +0.04%) |
| W10 crash-day buy | weekly (enter the next Monday; 2 sessions later on average) | 0.39 | 92% | +6.1% | **+0.14%** |

What each daily or options module is worth, and its verdict under a weekly cadence:

| Module | Worth a year (design §6) | Under a weekly cadence | Verdict |
|---|---|---|---|
| M1 dip-buy | +0.05–0.10% | loses ≈75% | **Shadow.** Its 1–5-day trades need a daily clock |
| W10 crash-day buy | +0.04% | unchanged | **Keep, folded into the weekly email** as "crash buy" (≈1 in 2.5 years), sized from the growth book's cash |
| M4 crash call spread | +0.04% at κ 0.25 | needs a 10:00–10:30 ET weekday entry | **Shadow** (Phase B anyway) |
| W8 de-escalation spreads | +0.02% | same | **Shadow** |
| M2 trend book (ETF8) | 0 to +1.2% | already monthly | **Replaced** by the growth core below; keep as shadow |
| M3 BTC switch | −0.3 to +0.5% at 3% | already weekly | **Promoted**: it becomes the 20% crypto sleeve |

- **Together, the daily-signal modules are worth ≈0.1–0.2 points a year.** That is 2–4% of the +5-point target.
- They can't move a growth book. They cost attention and add orders.
- Keep them as shadows, so the evidence keeps accruing.

### 5.3 One weekly email, ≤3 orders

**Table 11. Orders per weekly email on the real path** (`cadence_weekly_email_orders.csv`). Weekly decisions only; a sleeve is re-sized only when it drifts more than 25% from its target.

| Book | Sample | If "out" means | Emails with orders a year | Orders a year | Most in one week | Weeks with >3 | CAGR, weekly band vs daily rebalance |
|---|---|---|---|---|---|---|---|
| 2× blend + 20% BTC switch | 2014–2026 | account cash | 13 | 15 | 3 | 0% | 30.6% vs 30.4% |
| 2× blend + 20% BTC switch | 2014–2026 | buying a T-bill ETF | 13 | 28 | 6 | 2.6% | same |
| 3× blend + 20% BTC switch | 2014–2026 | account cash | 13 | 16 | 3 | 0% | 37.5% vs 37.5% |
| 3× blend (no Bitcoin) | 1986–2026 | account cash | 6 | 7 | 2 | 0% | 22.6% vs 22.4% |

**How to fold everything into one email:**
- **One run on Sunday night.** Evaluate the S&P and Nasdaq-100 200-day filters on Friday's close, and the Bitcoin 10-week rule on Sunday's weekly close (as M3 does today). Queue dollar market orders for Monday's open.
- **At most one order per sleeve:**
  - an equity-sleeve switch: sell the 2× fund to cash, or buy it with cash;
  - the Bitcoin switch (IBIT);
  - a drift re-size, only outside the 25% band.
- **"Out" means uninvested cash in the IRA,** not a T-bill ETF. A T-bill ETF doubles the orders, and 2.6% of weeks would need up to 6.
  - If the IRA's cash sweep pays well below T-bills, buy SGOV only in a week with a spare order slot.
- **W10's crash buy rides in the same email,** and never displaces a switch.
- **In 3 weeks out of 4, the email says "no change".** About 13 emails a year carry orders.

---

## 6. Drawdown rules: does a governor help a leveraged book?

**Table 14. 20-year outcomes with and without a governor** (`mc_governor.csv`). Exposure is re-set weekly from the book's own drawdown; the rest sits in T-bills.

| Book / world | No governor: median / P(DD >50%) | Design G(D): 1 → 0.25 between 5% and 15% | Wide G: 1 → 0.25 between 20% and 50% | Floor: exposure ∝ cushion above 50% of peak |
|---|---|---|---|---|
| 3× S&P + 200d, history 1928–2026 | 17.8% / 92% | 10.0% / 10% | 14.7% / 71% | 12.6% / 9% |
| 3× S&P + 200d, history 2008–2026 | 20.3% / 79% | 8.7% / 0% | 16.4% / 41% | 13.2% / 0% |
| 3× S&P + 200d, forward 2008–2026 | −0.1% / 97% | 2.0% / 0% | 1.0% / 76% | 1.8% / 0% |
| 3× blend + 200d, history 1986–2026 | 22.3% / 95% | 10.9% / 0% | 17.0% / 72% | 14.4% / 0% |
| 2× blend + 20% BTC, history 2008–2026 | 29.2% / 9% | 19.1% / 0% | **28.5% / 0.4%** | 24.4% / 0% |
| 2× blend + 20% BTC, forward 2008–2026 | 7.3% / 42% | 5.4% / 0% | **6.7% / 3%** | 6.4% / 0% |
| 3× blend + 20% BTC, forward 2008–2026 | 5.8% / 88% | 4.5% / 0% | 5.0% / 44% | 5.0% / 0% |

A governor is de-leveraging on a rule:
- It **raises** long-run growth only when the book is *above* its growth-optimal exposure. That is the 3× books in the forward world: −0.1% becomes +2.0%.
- It **lowers** growth when the book is at or below Kelly. The design's G(D) halves the historical growth of every leveraged book (20.3% → 8.7%).
- **The reason:** it was built for a 5%-volatility book. On a 25–35%-volatility book, a 15% drawdown is routine, and G then sits at 0.25 for years ("cash lock"; Grossman & Zhou 1993).

For the recommended book (C), the **wide governor** is almost free:
- it costs 0.6–0.7 points a year;
- it cuts the 20-year chance of a >50% drawdown from 42% to 3% (forward) and from 9% to 0.4% (history).
- The floor rule is safer still, but costs 1–5 points.

**Replace G(D) with the wide governor for the growth book.**

---

---

## 7. Account placement and taxes

**Table 13. The same sleeve in the IRA vs a taxable account** (`taxes_by_placement.csv`). The simulation realises each exit's gain: short-term if held ≤1 year. It nets gains yearly with losses carried forward, and pays tax from the position. Profiles follow track 18.

| Sleeve (switches a year) | Sample | IRA (no tax) | Taxable, 24% bracket | Taxable, 35% + NIIT | Tax cost, points a year |
|---|---|---|---|---|---|
| 3× S&P + 200d (2.9) | history 2008–2026 | 20.2% | 17.6% | 16.6% | 2.6–3.5 |
| 3× Nasdaq-100 + 200d (2.8) | history 2008–2026 | 28.3% | 25.0% | 23.8% | 3.3–4.5 |
| 2× S&P + 200d (2.9) | history 2008–2026 | 14.9% | 12.9% | 12.1% | 2.0–2.8 |
| 3× S&P + 200d (3.3) | history 1993–2026 | 16.0% | 14.5% | 13.9% | 1.6–2.2 |
| Bitcoin 10-week switch (8.1) | history 2014–2026 | 57.8% | 49.6% | 44.1% | 8.3–13.7 |
| Bitcoin 10-week switch (7.7) | forward | 12.0% | 8.0% | 5.2% | **4.1–6.8** |
| SPY, bought and held (sold at the end) | history 2008–2026 | 11.2% | 10.2% | 9.9% | 1.0–1.3 (0.3–0.4 if never sold) |
| SPY, bought and held | forward | 4.4% | 3.8% | 3.7% | 0.6–0.7 (0.2 if never sold) |

**Placement:**
- **Every switching sleeve belongs in the IRA.**
  - A trend sleeve realises most gains in under a year, so in a taxable account it pays ordinary-income rates.
  - That costs 2–4.5 points a year for the equity sleeves and 4–14 points for the Bitcoin switch. It is most of the edge the growth book is trying to earn.
  - In the IRA, the Bitcoin switch goes through **IBIT**, not Coinbase. Coinbase spot is taxable, and its fees are ≈10× IBIT's spread.
- **The taxable account** holds only what is tax-efficient:
  - buy-and-hold SPY/VOO, which costs 0.2–0.4 points a year if never sold;
  - **index options on XSP or SPX**, which are Section 1256 contracts taxed 60/40 (26 U.S.C. §1256). The blended rate is 18.6% vs 24% in the 24% bracket, and 26.8% vs 38.8% at the top (track 18).
  - That is where track 30's option-leverage ideas should live, if any survive.
- **Size of the IRA.** At the paper split ($80k IRA / $20k taxable), the whole growth core fits in the IRA:
  - 80% of NAV in the two leveraged sleeves and IBIT;
  - the taxable $20k holds the SPY core or stays in T-bills.
  - IRA contribution limits are small, so the IRA's size is fixed by what is already in it. That makes the IRA the scarce, valuable place for the high-turnover engine.
- **Wash sales across accounts.** Selling at a loss in the taxable account and buying the same fund in the IRA within 30 days disallows the loss permanently (Rev. Rul. 2008-5). Keep each fund in one account family, as the design already does.
- **Confirm in the app** that Robinhood's IRA allows buying 2× and 3× leveraged ETFs (SSO, QLD, UPRO, TQQQ). Some brokers restrict them in retirement accounts; track 20's venue check should add them to the whitelist test.

---

## 8. How much of the answer is Bitcoin?

**Table 15. Forward Bitcoin assumption vs the books** (`btc_sensitivity_kelly.csv`, `btc_sensitivity_mc.csv`; 1,000 paths). Equities and T-bills are at the central forward values. Cells are the median 10-year CAGR / P(beat SPY by ≥5 points); SPY's median is 5.1%.

| BTC buy-and-hold a year | Switch timing edge | Switch CAGR (worst DD) | Full-Kelly BTC weight | A. half Kelly | B. SPY 80 + BTC 20 | C. 2× trend + BTC 20 |
|---|---|---|---|---|---|---|
| 0% | none (κ = 0) | 2.4% (−84%) | 33% | 6.3% / 33% | 6.7% / 17% | 5.6% / 22% |
| 0% | out-of-sample (κ = 0.26) | 9.1% (−78%) | 60% | 9.0% / 46% | 8.0% / 28% | 7.0% / 30% |
| **7.5% (central)** | none | 6.2% (−82%) | 49% | 8.1% / 42% | 7.6% / 25% | 6.4% / 27% |
| **7.5% (central)** | **out-of-sample (central)** | **12.0% (−77%)** | **71%** | **10.4% / 52%** | **8.7% / 35%** | **7.5% / 33%** |
| 15% | out-of-sample | 16.4% (−73%) | 86% | 12.4% / 62% | 9.6% / 46% | 8.5% / 40% |

- **With Bitcoin flat and no switch edge, every book still edges out SPY by 0.5–1.6 points.**
  - The reason is not Bitcoin's return. A 20–40% sleeve of a volatile, weakly correlated asset, rebalanced back to target, harvests volatility (Shannon's "demon"). The bootstrap's independent fill of pre-2014 Bitcoin blocks also flatters the diversification.
  - That bonus assumes Bitcoin doesn't trend in one direction for years. In a multi-year Bitcoin bear market, rebalancing into it hurts.
- **Beating SPY by 5 points needs Bitcoin to keep compounding and the switch to keep some of its edge.**
  - P(+5) falls from 52% to 33% (A), from 35% to 17% (B) and from 33% to 22% (C) if both fail.
  - This is the single biggest uncertainty in the growth objective.

---

## 9. Caveats

1. **The forward model sets the answer, and it is an assumption.**
   - Equities at 4.5% and T-bills at 4.2% is the design's CAPE-based view, not a forecast with error bars.
   - If the 1928–2026 premium returns (6.6 points over T-bills), leverage wins big. If it doesn't, leverage loses.
   - Tables 4–5 are the honest way to hold both views.
2. **Bitcoin carries most of the forward excess, and its forward return is an extrapolation of three cycles.** §8 shows what happens if the extrapolation is wrong.
3. **The timing-edge shrink is a judgment call.** κ = 0.5 for the equity filters is the design's convention; κ = 0.26 for Bitcoin comes from its out-of-sample t.
   - The 200-day rule underperformed buy-and-hold after its publication (2016–2026: 10.8% vs 15.2% for 1×, track 04), although it kept its drawdown control.
4. **Bootstrap limits.**
   - 1–3-month blocks keep momentum and volatility clustering inside a block but cut longer bear markets into pieces. The 1929–32 and 2000–02 paths are rarer in the bootstrap than a 20-year history would suggest.
   - Filling Bitcoin before 2014 from its own history understates its co-crashes with equities in 2008-style years.
   - Books are rebalanced daily in the Monte Carlo. Table 11 shows weekly band rebalancing is no worse on the real path.
5. **Fund model.**
   - Track 04's formula (financing at T-bills + 0.4%, 0.9% fee) tracks UPRO and SSO closely since 2006–2009. Before that, it is a simulation of funds that did not exist.
   - A −33% day would wipe out a 3× fund. The worst S&P day (−20.5%, 19 Oct 1987) cost −61% at 3×; the S&P was then below its 200-day average only on the day itself.
6. **Taxes** assume a federal-only rate, no state tax, yearly settlement and no wash-sale disallowance inside the sleeve. State tax would make taxable placement worse still.
7. **The Phase A history is monthly** (track 23), spread evenly over each month's sessions. That understates its daily volatility, which is harmless at ≈1%.
8. **Nothing here is a promise.**
   - The "median" is the middle of 2,000 simulated paths built from one historical record.
   - The real future is a single path, and it may look like none of them.

---

## 10. Recommendation, and what it changes in the design

**Paper-trade book C, "2× trend + Bitcoin", as the growth core.**
- **Holdings.** In the IRA:
  - 40% SSO while the S&P 500 closes above its 200-day average at Friday's close;
  - 40% QLD on the same rule for the Nasdaq-100;
  - 20% IBIT while Bitcoin's Sunday weekly close is above its 10-week average;
  - uninvested cash otherwise.
- **Operations.**
  - One Sunday-night email with ≤3 dollar market orders for Monday's open.
  - The wide governor (G = 1 until a 20% drawdown, falling to 0.25 at 50%).
  - W10's crash buy rides along.
  - M1, M2, M4 and W8 move to the shadow ledger.

**Why C and not A or B:**
- It is the only candidate that participates fully if equities earn anything like their history: 29.6% median, 10× in 8 years.
- It still beats SPY in the median if the design's forward view is right: 7.6% vs 5.1%.
- Its equity leverage is sized to a 10–25% belief in the historical premium (Table 5), not to history itself. Full historical Kelly would be 3–5×.
- A Bitcoin failure costs it about 2 points, not the account (Table 15).
- **The alternatives:**
  - Pick **B** if you trust the design's forward view and want the fewest bad outcomes.
  - Pick **A** only if you are willing to make Bitcoin the main engine.

**What to really expect from C** (forward central case, before tax, in the IRA):
- **10-year median ≈7–7.5% a year:** $100k → ≈$210k, vs ≈$165k for SPY.
  - 1 path in 10 ends below ≈$90k, and 1 in 10 above ≈$470k.
- **Odds:**
  - ≈1 in 3 of beating SPY by ≥5 points a year;
  - ≈1 in 8 of ending below the start;
  - ≈1 in 5 of a >50% drawdown within 10 years without the governor, under 1 in 100 with it. The governor trims the 10-year median to ≈7.0% (`mc_governor.csv`).
- **Median time to 10× is ≈29 years.**
- **If the historical premium returns:** ≈29% a year and 10× in about 8 years.
- **This is not a make-rich-quick engine in the central case.** It is a book with a real chance of large gains and a real chance of mediocre ones, sized so that neither ruins you.

**Design invariants this needs you to approve** (design §4 and §12):
1. **Gross equity exposure above 1.0×.** Up to 1.6× of NAV while both filters are "in". Today: "no gross above 1.0×".
2. **Crypto at 20% of NAV** (M3 is capped at 3% today).
3. **The per-trade stress caps (2%) and the 7% US-equity cluster cap can't hold a growth book.** Book C's 10-session stress, under design §4's definition, is about 60% of NAV: worst 10-session losses of −32.5% for the S&P, −35.6% for the Nasdaq-100 and −44% for Bitcoin. They would be replaced, for this book only, by:
   - the wide governor;
   - the weekly cadence;
   - the IRA-only placement.
4. **The growth core counts as one policy module** with one order budget (≤3 a week).
5. **Paper first and the go-live gates still apply.** A growth book's edge can't be verified quickly: at 3 switches a year per sleeve, nothing will be proven for years.

**For the synthesis:**
- Re-run `run_all.py --inputs` with tracks 26–30's final series. The sleeves above are simple, faithful stand-ins.
- If a track shows a sleeve whose *forward* edge survives shrinkage, Table 5's logic says how much leverage it deserves:
  - track 27 (momentum rotation) and track 29 (single-stock momentum) are the candidates;
  - track 28 should confirm or replace the Bitcoin forward figure.
- **Watch for these signals:**
  - A Bitcoin cycle top below ≈1.3× the 2025 peak (≈$165k) would confirm the decay and argue for cutting the crypto sleeve.
  - A CAPE back under ≈30 would raise the forward equity premium and the justified leverage.

---

## Sources

- Kelly, J. L. (1956). "A New Interpretation of Information Rate." *Bell System Technical Journal* 35(4).
- Breiman, L. (1961). "Optimal Gambling Systems for Favorable Games." *Proc. 4th Berkeley Symposium*.
- Thorp, E. O. (2006). "The Kelly Criterion in Blackjack, Sports Betting, and the Stock Market." *Handbook of Asset and Liability Management*, vol. 1.
- MacLean, L. C., Thorp, E. O., & Ziemba, W. T. (2011). *The Kelly Capital Growth Investment Criterion*. World Scientific.
- Grossman, S. J., & Zhou, Z. (1993). "Optimal Investment Strategies for Controlling Drawdowns." *Mathematical Finance* 3(3).
- Busseti, E., Ryu, E. K., & Boyd, S. (2016). "Risk-Constrained Kelly Gambling." *Journal of Investing* 25(3).
- Gayed, M. A., & Bilello, C. (2016). "Leverage for the Long Run: A Systematic Approach to Managing Risk and Magnifying Returns in Stocks." SSRN 2741701.
- Faber, M. T. (2007). "A Quantitative Approach to Tactical Asset Allocation." *Journal of Wealth Management* 9(4).
- Cheng, M., & Madhavan, A. (2009). "The Dynamics of Leveraged and Inverse Exchange-Traded Funds." *Journal of Investment Management* 7(4).
- Moreira, A., & Muir, T. (2017). "Volatility-Managed Portfolios." *Journal of Finance* 72(4).
- Campbell, J. Y., & Shiller, R. J. (1998). "Valuation Ratios and the Long-Run Stock Market Outlook." *Journal of Portfolio Management* 24(2).
- Künsch, H. R. (1989). "The Jackknife and the Bootstrap for General Stationary Observations." *Annals of Statistics* 17(3). Politis, D. N., & Romano, J. P. (1994). "The Stationary Bootstrap." *JASA* 89(428).
- Liu, Y., Tsyvinski, A., & Wu, X. (2022). "Common Risk Factors in Cryptocurrency." *Journal of Finance* 77(2).
- 26 U.S.C. §1256 (60/40 treatment of index options and futures); 26 U.S.C. §1091 and Rev. Rul. 2008-5 (wash sales through an IRA).
- Data: Yahoo Finance (^GSPC, ^SP500TR, ^NDX, SPY, QQQ, BTC-USD), FRED (DTB3, TB3MS, NBER M1329A), Shiller's dividend series, CBOE VIX. All come via track 04's cache.
- This dossier:
  - design v3.3 §0, §4 and §6;
  - tracks 03 (Kelly, governor), 04 (leveraged-ETF model), 15 (Bitcoin switch), 18 (taxes), 20 (venues), 23 (Phase A history) and 25 (2019–2026 replay).

## Reproducing

```
python3 research/code/31-growth-portfolio/run_all.py            # everything (about 10-15 min; --paths 500 is quicker)
python3 research/code/31-growth-portfolio/run_all.py --inputs DIR --books my_books.json --window 2008-01-01:2026-09-28
```

The second form is for the synthesis. `DIR` is any folder of daily return CSVs (`date,ret`), one per sleeve plus `rf.csv`. `my_books.json` maps each book to its sleeve weights, as in `books.json`. It prints the full-Kelly mix and writes the Monte Carlo tables (`generic_mc_*.csv`).

Built sleeves are cached in `TRACK31_DATA/inputs/<scenario>/` (not committed), so the other tracks' series can be mixed with them.
