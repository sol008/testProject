# 13 — Short-horizon rules on US index, sector and country ETFs (holding 1–60 days)

*Track 13 of the trade-recommender research programme. Prepared 2026-09-28 with data through the 28 Sep 2026 close. All numbers come from our own backtests in `research/code/13-short-index/` (re-run everything with `python3 run_all.py`, about 4 minutes once the scratchpad cache is warm). Literature figures we could not check against the source are marked [unverified].*

---

## TL;DR

1. **We tested 533 distinct rule variants in 36 families**, on up to 49 instruments, over 1928–2026. The families were panic and volatility spikes, mean reversion, breakouts and rotation, calendar and event effects, and overnight holding. **Exactly one family survives design-before-2008 / test-after-2008 with a real edge after costs: buying a short-term dip in an index that is still in a long-term uptrend.** This is the Connors-style RSI(2) rule.
   - It fits the known mechanism: short-term reversal is paid for providing liquidity, and pays more when volatility is high (Nagel 2012).
   - It weakened by 40–50% after publication.
2. **Rule ST-1, the recommended "fewest trades" version (SPY, next-open fills, 1 bp/side).**
   - Buy when three conditions hold at the close: SPY is above its 200-day average, RSI(2) is below 10, and the VIX is at or above 20. Sell at the open after the first close with RSI(2) above 70, and within at most 20 sessions.
   - **2008–2026 (out of sample):** 3.7 trades/yr, 83% winners, **+0.95% mean per trade** (median +1.5%), 4.3 sessions average hold.
     - Per-trade Sharpe 0.44 (t 3.7). The edge over random-entry drift is +0.74% (t 2.8).
     - Worst trade −8.5%. Max drawdown −14% at 1× notional.
   - **1993–2007 (design period):** +1.47% per trade, t 4.3.
   - Without the VIX gate (ST-1b), the rule trades 7.5 times a year for +0.49% per trade (t 3.3). The expected log-growth per year is about the same, with twice the trades.
3. **Tails are real.** The same dip-buy lost **−32% on the S&P in Oct 1929** and **−38.5% on IWM in Feb–Mar 2020**, and dodged the 1987 crash only because the S&P closed 0.5 points below its 200-day average. **Size by gap stress, not by the backtest.**
   - Planned size is **0.5× notional of the capital assigned to this sleeve**, capped at 6% of the total portfolio (a 2% portfolio stress loss at a 33% gap).
   - Quarter-Kelly is 1.7× on 2008+ data but only 0.5× on the full 1928–2026 history.
   - Expected log-growth is **≈ +0.9%/yr of the sleeve** at 0.5× (after halving the edge for shrinkage), or ≈ +0.1%/yr of the whole portfolio at the 6% cap.
4. **Panic and volatility signals** (VIX ≥30/40/45, VIX/VIX3M ≥1.0/1.1, VIX jumps of +30%/+50%, −3/−4/−5% days, −10/−15/−20% drawdowns), held 1–60 days, deliver **equity drift plus noise, not timing skill**.
   - The in-sample-best variant of every sub-family failed out of sample.
   - The only consistent cell is the same "fear spike while still above the 200-day" bounce, e.g. the first VIX≥30 close above the 200-day, held 5 sessions: +1.1%, +1.8% and +1.2% edge in 1928–85, 1986–2007 and 2008–26 (n = 28 in total).
   - VIX/VIX3M ≥1 in an uptrend, held 20 sessions, returned +2.0% per trade after 2008. But VIX3M only exists from 2006, so it has no real out-of-sample test: **paper only**.
5. **Momentum and breakouts are dead at this horizon.**
   - Donchian 20/55 breakouts add no timing edge. Their edge vs random entry is ≤0 in 78–100% of sector ETFs.
   - 1–3-month rotation worked on 1927–2007 industry data (+0.29%/month, t 3.5) but not since 2008: industries −0.08%/month (t −0.3), sector SPDRs −0.17% (t −0.9), country ETFs −0.56% (t −2.3).
6. **Calendar effects are dead.** Edge per window, before publication → 2008–2026:
   - turn-of-month +0.50% → +0.03%;
   - pre-holiday +0.30% → +0.09%;
   - FOMC day +0.29% → 0.00% after 2011;
   - CPI day ≈0 throughout;
   - options-expiration week ≤0.
7. **The midterm-year Q4 is suggestive but unproven.** Buying at the end-of-September close and holding 60 sessions rose 21 of 24 times since 1930: +5.4% vs +2.0% unconditional, an edge of +3.5% with t only 1.9. The 4 cases since 2008 have a −0.8% edge, including −15% in 2018. **Context only, not a trade.** The 2026 window opens at the 30 Sep close.
8. **Overnight vs intraday.** Most of the equity premium does arrive overnight: SPY 1993–2007 returned +13.9%/yr overnight vs −3.3% intraday; 2008–26, +7.4% vs +3.6%. But buying the close and selling the open means 252 round trips a year, **breaks even at ~1.3 bp per side**, and since 2008 has the same Sharpe as buy-and-hold (0.54 vs 0.57). Reject.
9. **The honest ceiling.** An account restricted to 1–60-day holds that runs these rules would have made about **T-bills + 3–4%/yr at 1×** from 2008 to 2026 (≈5% CAGR, −14% max drawdown), vs 11.3% for buy-and-hold SPY (−52%).
   - Holding periods ≤60 days give up most of the equity premium unless positions are simply rolled. Rolling is buy-and-hold with short-term taxes.
   - **No short-horizon index rule changes the "1000%" arithmetic.**
10. **Paper trading cannot validate these edges quickly.** At 3.7 trades a year, a t = 2 confirmation of the shrunk edge needs about 90 trades, roughly 24 years. Paper trading's job is to validate data, signals, fills and emails.
11. **Firing now (28 Sep 2026 close): nothing.**
    - SPY RSI(2) is 27.5; a close ≤ $757.57 (−1.05%) would trigger ST-1b. VIX is 16.1, so ST-1 would also need VIX ≥ 20.
    - IWM is on the cusp: RSI(2) 10.4 and 1.5% above its 200-day, so any lower close ≤ $279.95 triggers the ungated rule. IWM is not in the recommended set.
    - VIX/VIX3M is 0.88. The S&P is −1.5% from its high; −10% would be 7,019.

---

## 1. Question, data and method

### 1.1 Data (all cached in the scratchpad, `s00_data.py`)

| Series | Source | Coverage | Notes |
|---|---|---|---|
| S&P 500 (^GSPC) | Yahoo | 1927-12-30 → 2026-09-28 (24,802 sessions) | Total return from Shiller's D/P before 1988, ^SP500TR after. **Opens are stale before ~2000s** (often equal to the prior close), so S&P tests use close-based entries |
| SPY, QQQ, IWM, DIA, MDY, EFA, EEM | Yahoo | 1993 / 1999 / 2000 / 1998 / 1995 / 2001 / 2003 → 2026 | Dividend-adjusted opens and closes (Yahoo adjustment factor applied to both) |
| 9 Select Sector SPDRs (XLB…XLY) | Yahoo | 1998-12 → 2026 | XLRE and XLC are excluded from rotation (too short) |
| 22 iShares country ETFs | Yahoo | 1996-03 → 2026 | Point-in-time membership: EWT/EWY/EWZ from 2000, EZA from 2003, FXI from 2004 |
| 16 foreign indices (Nikkei, FTSE, DAX, CAC, HSI, …) | Yahoo | 1965–2007 starts → 2026 | Price only, local currency; used for other-market tests (close entries) |
| VIX; VXO; realised-vol proxy | Yahoo / FRED VXOCLS | 1990→; 1986–89; before 1986: 21-day realised vol + 4 | The pre-1986 "VIX" is a **proxy** and is reported separately |
| VIX3M, VIX9D | Yahoo | 2006-07 / 2011 → | VIX3M's short history is the main limitation of the term-structure tests |
| Leveraged ETFs SSO, UPRO, QLD, TQQQ | Yahoo | 2006 / 2009 / 2006 / 2010 → | Instrument comparison |
| T-bills | Ken French monthly RF (before 1954); FRED DTB3 (1954→) | 1926 → 2026 | The French *daily* RF is rounded to 0.01%/day, so it was not used |
| 12 industry portfolios (value-weighted, daily) | Ken French | 1926-07 → 2026-08 | Long-history rotation test (not tradable) |
| FOMC announcement dates | Track 02 scrape of federalreserve.gov (+ 28 Oct / 9 Dec 2026) | 1994 → 2026 (263) | |
| CPI first-release dates | **Reconstructed from ALFRED vintages** (first vintage in which each month appears) | 1995 → 2026 (379) | Checks: the 30 Oct 2013 shutdown delay is caught; Sep-2025 patched to 24 Oct 2025 |
| NYSE holidays | Rule-based classification of weekday closures | 1928 → 2026 (906) | Unscheduled closures (9/11, Sandy, funerals, 1968 Wednesdays) excluded |

### 1.2 Execution model and costs

- **Signals** are computed from the close of day *t*.
- **Entry**, in two variants:
  - the **next open** (market-on-open after an evening email);
  - the **next close** (market-on-close the next day).
- An **"ideal" same-close fill** is reported only as an upper bound. For calendar rules, where the date is known in advance, market-on-close fills are genuinely available.
- **Exits** are either time-based (close of the H-th session) or rule-based: the condition is evaluated at a close and executed at the next open or close. Every mode gives exactly H sessions of exposure for a time exit.
- **Trades never overlap**: signals are ignored while a position is open.
- **Costs** are per side (half-spread + slippage + commission) and **doubled when VIX > 30**:

  | Instrument | Base cost per side |
  |---|---|
  | SPY, QQQ, S&P | 1 bp |
  | IWM, DIA | 1.5 bp |
  | EFA, EEM | 2.5 bp |
  | Sector SPDRs | 2–4 bp |
  | Country ETFs | 6 bp |
  | Foreign-index proxies | 5 bp |

  Cost sensitivity at 0–20 bp is reported for the finalists.
- **Two yardsticks for every rule:**
  1. **Excess return** = net trade return − T-bill return over the same sessions. This is what the trading capital earns versus sitting in bills.
  2. **Timing edge** = excess − (the instrument's mean daily excess × sessions held), i.e. the excess return versus entering at a random time for the same length.

  A rule can have a big t-stat on (1) purely from equity drift, e.g. "buy a −10% drawdown in an uptrend and hold 60 days" (t 3.8 out of sample, timing t only 1.4). **We judge edges on (2).**
- **Taxes.**
  - Short-term gains are ordinary income: 40.8% at the top federal rate including the net investment income tax, or 24% in a middle bracket.
  - Section 1256 futures are taxed 60/40, giving 30.6% at the top rate.
  - T-bill interest is also ordinary income, so the after-tax **excess** return is (1 − t) × excess.
  - State tax is ignored. Frequent re-entries into the same ETF after losses trigger **wash-sale** deferrals in taxable accounts.

### 1.3 Statistics and multiple-testing protocol

- **Per rule we report:**
  - trades per year, win rate, average win and loss, mean and median trade;
  - per-trade Sharpe (mean excess ÷ sd) and its t-stat;
  - the timing edge and its t-stat;
  - worst trade;
  - strategy max drawdown, with the daily stream fully invested during trades and in T-bills otherwise;
  - exposure;
  - quarter-Kelly size and expected log-growth.
- **Kelly** is the empirical maximiser of mean ln(1 + f·r). It is computed on excess returns whose mean is **shrunk halfway to zero** (κ = 0.5, per the synthesis §3.4); we use a quarter of that. Δg/yr = trades/yr × mean ln(1 + f·r_shrunk).
- **Registry.** Every variant evaluated is logged to `results/variant_registry.csv.gz`: **533 distinct (family, variant) hypotheses in 36 families**.

  | Family | Variants |
  |---|---|
  | Panic | 378 |
  | Mean reversion (including threshold, VIX-gate and proxy checks) | 76 + 6 |
  | Rotation | 54 |
  | Donchian | 6 |
  | Calendar | 12 |
  | Overnight | 1 |

  For N = 533, the expected maximum t-stat of pure noise is **3.07**, and the Bonferroni 5% two-sided hurdle is **3.91**. For N = 36 families they are 2.15 and 3.20.
- **Protocol.** Within each family the variant with the best **pre-2008** t-stat (n ≥ 8) is selected; we ran the selection on both raw and timing-edge t. That single variant is then tested on 2008–2026. We also report the deflated Sharpe ratio (DSR; Bailey & López de Prado 2014) for the finalists at N = 1, 36 and 533.

---

## 2. Test 1 — Panic and volatility spikes (`s01_panic.py`, `s06_extras.py`)

### 2.1 Forward returns after each signal

Each cell shows **n · timing edge per trade (t of the edge)**. S&P columns use next-close entries; the SPY column uses next-open entries. "First" means the first close beyond the level after 20 sessions below it; drawdown signals are the first close since the last all-time high. Filter: none.

| Signal (filter: none) | H | 1928–85 (proxy VIX) | 1986–2007 (IS) | 2008–26 (OOS) | SPY next open, 2008–26 | QQQ/IWM/EFA 2008–26 |
|---|---|---|---|---|---|---|
| VIX ≥30 (first close) | 5 | 34 · −0.4% (−0.6) | 18 · +0.4% (+0.4) | 20 · +2.1% (+3.5) | 20 · +1.7% (+2.6) | +1.7% |
| VIX ≥30 (first close) | 20 | 34 · −2.7% (−1.8) | 18 · +1.3% (+1.0) | 20 · +0.6% (+0.3) | 20 · +0.7% (+0.5) | +0.7% |
| VIX ≥40 (first) | 5 | 17 · −1.6% (−0.6) | 5 · +1.5% (+0.5) | 9 · −1.3% (−0.5) | 9 · +1.6% (+1.0) | +1.3% |
| VIX ≥40 (first) | 20 | 17 · +0.5% (+0.2) | 5 · +5.9% (+2.1) | 9 · −1.2% (−0.3) | 9 · −1.9% (−0.4) | −2.1% |
| VIX ≥45 (first) | 5 | 18 · −0.3% (−0.2) | 3 · +0.6% (+0.5) | 6 · −2.2% (−0.6) | 6 · +0.8% (+0.2) | +0.3% |
| VIX ≥45 (first) | 20 | 18 · −0.4% (−0.2) | 3 · +0.6% (+0.3) | 6 · −1.4% (−0.3) | 6 · +0.2% (+0.0) | −0.3% |
| VIX/VIX3M ≥1.0 (first) | 5 | – | 5 · +0.6% (+0.9) | 45 · +0.4% (+1.0) | 45 · +0.2% (+0.5) | +0.1% |
| VIX/VIX3M ≥1.0 (first) | 20 | – | 5 · −0.3% (−0.2) | 45 · +0.2% (+0.3) | 45 · +0.1% (+0.1) | −0.1% |
| VIX/VIX3M ≥1.1 (first) | 5 | – | 3 · −0.5% (−0.3) | 15 · +0.7% (+0.6) | 15 · +1.8% (+1.6) | +1.7% |
| VIX/VIX3M ≥1.1 (first) | 20 | – | 3 · +0.4% (+0.3) | 15 · −0.8% (−0.3) | 15 · −0.5% (−0.2) | −0.5% |
| VIX 1-day jump ≥+30% | 5 | 39 · −0.1% (−0.2) | 13 · +0.2% (+0.4) | 33 · −0.2% (−0.2) | 34 · −0.1% (−0.1) | −0.2% |
| VIX 1-day jump ≥+30% | 20 | 38 · +0.6% (+0.7) | 12 · +0.5% (+0.4) | 27 · −0.2% (−0.1) | 29 · −0.8% (−0.5) | −0.9% |
| VIX 1-day jump ≥+50% | 5 | 10 · −2.4% (−1.4) | 5 · −1.1% (−2.1) | 7 · +1.7% (+1.6) | 7 · +2.7% (+2.0) | +2.3% |
| VIX 1-day jump ≥+50% | 20 | 10 · −2.8% (−2.3) | 5 · −2.4% (−1.1) | 7 · +2.9% (+2.3) | 7 · +4.1% (+2.4) | +4.0% |
| S&P 1-day ≤−3% | 5 | 156 · +0.5% (+1.0) | 30 · +0.3% (+0.5) | 50 · −0.0% (−0.0) | 53 · −0.3% (−0.5) | −0.5% |
| S&P 1-day ≤−3% | 20 | 97 · −0.0% (−0.0) | 23 · +0.9% (+0.9) | 29 · −0.7% (−0.5) | 29 · −1.8% (−1.0) | −1.6% |
| S&P 1-day ≤−4% | 5 | 73 · −1.0% (−1.5) | 13 · +1.1% (+1.3) | 22 · −0.4% (−0.3) | 24 · −0.3% (−0.2) | −0.7% |
| S&P 1-day ≤−4% | 20 | 49 · −1.1% (−0.9) | 12 · +1.2% (+0.9) | 14 · −1.0% (−0.4) | 14 · −0.1% (−0.1) | −0.2% |
| S&P 1-day ≤−5% | 5 | 45 · +0.3% (+0.3) | 7 · +2.6% (+2.6) | 12 · +0.6% (+0.2) | 14 · −0.4% (−0.2) | −0.8% |
| S&P 1-day ≤−5% | 20 | 34 · −0.2% (−0.1) | 6 · +2.4% (+1.6) | 7 · −3.8% (−1.0) | 7 · −4.4% (−0.9) | −5.2% |
| S&P drawdown −10% (first) | 5 | 12 · +0.2% (+0.4) | 8 · −0.2% (−0.1) | 6 · +2.4% (+3.3) | 6 · +2.3% (+2.6) | +1.7% |
| S&P drawdown −10% (first) | 20 | 12 · −3.5% (−1.1) | 8 · −1.1% (−0.5) | 6 · −2.7% (−0.8) | 6 · −3.5% (−1.2) | −4.4% |
| S&P drawdown −15% (first) | 5 | 7 · −1.3% (−0.9) | 4 · +2.1% (+3.2) | 5 · +0.6% (+0.2) | 5 · −0.5% (−0.1) | −1.2% |
| S&P drawdown −15% (first) | 20 | 7 · −3.7% (−1.1) | 4 · +3.3% (+1.2) | 5 · +2.8% (+0.9) | 5 · +3.9% (+1.1) | +4.2% |
| S&P drawdown −20% (first) | 5 | 7 · +0.8% (+0.6) | 2 · −3.3% (−2.1) | 3 · −4.8% (−0.9) | 3 · −3.2% (−1.2) | −3.0% |
| S&P drawdown −20% (first) | 20 | 7 · −0.1% (−0.1) | 2 · −0.8% (−0.3) | 3 · +0.6% (+2.0) | 3 · +2.7% (+1.7) | +2.6% |

**With the 200-day trend filter** (the signal counts only while the index is above its 200-day SMA), "fear in an uptrend":

| Signal, only above the 200-day SMA | H | 1928–85 (proxy VIX) | 1986–2007 (IS) | 2008–26 (OOS) | SPY next open, 2008–26 |
|---|---|---|---|---|---|
| VIX ≥30 (first close) | 5 | 14 · +1.1% (+2.2) | 6 · +1.8% (+2.3) | 8 · +1.2% (+1.5) | 8 · +1.0% (+1.0) |
| VIX ≥30 (first close) | 20 | 14 · +0.9% (+0.4) | 6 · +0.5% (+0.3) | 8 · +1.5% (+1.0) | 8 · +1.7% (+1.1) |
| VIX/VIX3M ≥1.0 (first) | 5 | – | 4 · +0.1% (+0.2) | 36 · +0.4% (+1.1) | 36 · +0.3% (+0.6) |
| VIX/VIX3M ≥1.0 (first) | 20 | – | 4 · −1.1% (−0.7) | 36 · +1.3% (+1.8) | 36 · +1.2% (+1.7) |
| VIX jump ≥+30% | 5 | 21 · −0.3% (−0.4) | 9 · +0.1% (+0.2) | 24 · +0.3% (+0.8) | 25 · +0.3% (+0.8) |
| S&P 1-day ≤−3% | 5 | 55 · +0.8% (+1.1) | 9 · −0.1% (−0.2) | 8 · +0.9% (+0.8) | 8 · +0.9% (+0.7) |

The "below the 200-day" split and holds of 1, 10, 40 and 60 sessions are in `results/panic_all_variants.csv.gz`. Some of them look good in one era; none looks good in all three.

### 2.2 In-sample selection → out-of-sample test (timing-edge criterion)

Selection on 1986–2007; test on 2008–2026; S&P next-close entries.

| Sub-family (variants) | In-sample-best variant | IS n · edge (t) | OOS n · edge (t) | SPY next-open OOS edge t | Verdict |
|---|---|---|---|---|---|
| VIX level, first cross (54) | VIX ≥30, H1 | 18 · +0.64% (1.3) | 20 · +0.32% (0.4) | 0.0 | Fails |
| VIX level, any day (54) | VIX ≥45 below 200-day, H1 | 21 · +1.48% (2.9) | 63 · +0.16% (0.3) | 0.3 | Fails |
| VIX/VIX3M, any day (36) | ≥1.0 below 200-day, H1 | 15 · +0.57% (1.5) | 203 · −0.16% (−0.8) | −0.1 | Fails (IS is only 2006–07) |
| VIX jump (36) | ≥+30%, H40 | 11 · +1.60% (0.9) | 24 · −1.21% (−0.7) | −1.0 | Fails |
| S&P 1-day fall (54) | ≤−4% below 200-day, H40 | 8 · +4.45% (3.8) | 10 · −3.34% (−0.9) | −0.7 | **Fails badly** |
| Drawdown, first cross (54) | −10%, H5 | 8 · −0.23% (−0.1) | 6 · +2.44% (3.3) | 2.6 | IS negative; proxy era +0.2%. Not consistent |
| Drawdown, any day (54) | −10% above 200-day, H60 | 23 · +1.17% (1.2) | 20 · +1.55% (1.4) | 1.3 | Raw t 3.8, but it is **drift**; IWM and EFA negative out of sample |

**Other markets** (16 foreign indices, own signals, next close, price only):
- Reversal after a large down day is broader abroad. After an own −4% day, the 20-session edge was +0.9% before 2008 and +1.3% after, positive in 80% and 81% of the markets respectively.
- The first −10% correction while still above the 200-day gave a 5-session edge of +1.9% (87% of markets) before 2008 and +1.8% (75%) after.
- These are local-currency cash indices that a US account cannot trade at those prices. Crashes are global, so the markets are not independent.

**Pre-2006 test of the VIX-term-structure signal.** We calibrated a proxy for "VIX/VIX3M ≥ 1" on 2006–2026 without using returns: VIX ÷ its 126-day average ≥ 1.32 (Jaccard overlap 0.55). The proxy **did not reproduce the returns**: its 20-session edge was +0.55% on 2006–26, versus +1.0–1.3% for the true ratio, and −1.9% (n = 6) on 1990–2005. The VIX/VIX3M result therefore has **no genuine out-of-sample test**.

### 2.3 Verdict on panic signals

- At 1–60-day horizons the famous "blood in the streets" triggers are **drift plus noise**. Many look superb in one period and fail in the next.
- VIX ≥40/45 and −5% days lost money after 2008 at 5–20 sessions, driven by 2008 itself.
- This matches track 06: panic buying pays over 1–5 years, not 1–60 days.
- The one consistent pattern is **short-term fear while the long-term trend is up**. It is the same phenomenon the RSI(2) rule captures: 72% of VIX/VIX3M-in-uptrend signals and 55% of first-VIX≥30 signals came within ±3 days of an RSI(2) dip signal.

---

## 3. Test 2 — Connors-style mean reversion in up-trends (`s02_meanrev.py`, `s06_extras.py`)

**Grid.**
- Entries: RSI(2) < 5 or < 10; 3, 4 or 5 consecutive lower closes; close below the lower 20-day, 2-sd Bollinger band.
- Exits: RSI(2) > 70 or close > 5-day SMA, both capped at 20 sessions; or time exits after 5 or 10 sessions.
- Each combination with and without the 200-day filter: 48 variants.
- RSI is Wilder's, computed on closes.
- **Publication:** Connors & Alvarez's RSI(2) rules circulated around 2004–2008 [unverified exact dates]. The brief's 2008 split doubles as the publication split.

### 3.1 By era and instrument

Filter: close > 200-day SMA. Each cell is the mean excess per trade (t). S&P: next-close fills. ETFs: next-open fills.

| Entry → exit | S&P 1928–59 | S&P 1960–89 | S&P 1990–2007 | S&P 2008–26 | SPY 1993–2007 | SPY 2008–26 | QQQ 2008–26 | IWM 2008–26 |
|---|---|---|---|---|---|---|---|---|
| **RSI2<10 → RSI2>70** | +0.41% (1.8) | +0.11% (0.6) | **+0.88% (6.9)** | **+0.44% (2.9)** | **+0.85% (4.7)** | **+0.49% (3.3)** | +0.54% (3.0) | +0.53% (1.5) |
| RSI2<10 → close>SMA5 | +0.36% (2.0) | +0.17% (1.4) | +0.68% (5.9) | +0.36% (2.6) | +0.68% (4.3) | +0.41% (3.1) | +0.43% (3.1) | +0.44% (2.2) |
| RSI2<5 → RSI2>70 | +0.34% (1.0) | +0.09% (0.4) | +0.77% (3.8) | +0.60% (2.8) | +1.33% (3.9) | +0.54% (2.3) | +0.71% (2.6) | +0.47% (0.8) |
| RSI2<10 → T5 | +0.65% (3.7) | +0.21% (1.8) | +0.79% (5.8) | +0.33% (2.0) | +0.72% (3.6) | +0.41% (2.6) | +0.09% (0.4) | +0.61% (2.7) |
| 3 down days → close>SMA5 | +0.18% (1.0) | +0.01% (0.1) | +0.48% (4.3) | +0.36% (2.8) | +0.44% (4.4) | +0.39% (3.4) | +0.52% (4.0) | +0.46% (2.6) |
| 5 down days → close>SMA5 | +0.83% (1.5) | −0.23% (−0.8) | +0.79% (2.4) | +0.35% (0.8) | +0.75% (1.8) | +0.20% (0.3) | +0.69% (2.7) | +0.50% (0.8) |
| Below lower band → RSI2>70 | +0.70% (1.4) | −0.11% (−0.4) | +1.18% (6.3) | +0.72% (3.2) | +1.22% (3.5) | +0.77% (3.9) | +1.02% (4.4) | +0.82% (2.4) |

- **The in-sample-best variant, whether ranked by raw t or by timing t, is the same on SPY and on the S&P: RSI2 < 10, exit RSI2 > 70, with the trend filter.** Out of sample: SPY +0.49%/trade (t 3.3; timing t 1.8); S&P +0.44% (t 2.9).
- The 200-day filter matters: without it, SPY OOS drops to about +0.2–0.3% per trade and the S&P 1928–89 result is ≈0.
- Next-close fills are about as good as next-open fills; same-close "ideal" fills add ≈0.05–0.1% per trade.
- **The regime shift is real.** The effect was ≈0 in 1950–69, when daily index returns were positively autocorrelated.
  - Trades taken when the trailing 3-year lag-1 autocorrelation of S&P daily returns was ≤ +0.05 earned +0.63–0.70% (t 3.5–4.3); above +0.05, +0.21–0.30% (t 1.1–1.8).
  - Autocorrelation today is **−0.05**, which is favourable. Use it as a **monitoring gauge, not a gate**.

### 3.2 Breadth (RSI2<10 → RSI2>70, trend filter, next close, after costs)

| Universe | Before 2008: mean / share of instruments positive | 2008–26: mean / share positive |
|---|---|---|
| 9 sector SPDRs | +0.62% / 89% | **+0.38% / 100%** |
| 17 country ETFs | +0.57% / 100% | +0.25% / 82% |
| 16 foreign indices | +0.41% / 100% | +0.13% / 75% |
| DIA, EFA, EEM (2008–26, next open) | | +0.40% (t 2.9), +0.23% (1.2), +0.27% (1.1) |

The edge is broad but **strongest in US large-cap indices**, and weaker abroad since 2008.

### 3.3 Stability, VIX dependence, exits, stops and instruments

**By 5-year block** (SPY, close > 5-day SMA exit):

| Block | Mean per trade (t) |
|---|---|
| 1990–99 | +1.07% (4.4) |
| 2000–07 | +0.34% (1.5) |
| 2008–12 | +0.44% (1.0) |
| 2013–17 | +0.47% (3.4) |
| 2018–22 | +0.27% (0.8) |
| 2023–26 | +0.45% (2.7) |

Every block since 2008 is positive. QQQ's blocks are similar (+0.09% to +0.72%).

**The edge rises with VIX at entry**, in both periods. This is the liquidity-provision mechanism (Nagel 2012; Campbell, Grossman & Wang 1993), not a fitted parameter.

| VIX at the signal close | ≤15 | 15–20 | 20–25 | 25–30 | >30 |
|---|---|---|---|---|---|
| SPY 1993–2007: mean (n) | +0.30% (36) | +0.53% (26) | +0.98% (28) | +1.45% (12) | +4.35% (5) |
| SPY 2008–26: mean (n) | +0.16% (28) | +0.33% (61) | +0.68% (34) | +0.98% (11) | +1.54% (7) |

Hence the **VIX ≥ 20 gate (ST-1).** It is motivated by the in-sample half and the literature, and was chosen after both periods had been seen, so treat its out-of-sample figures as semi-out-of-sample. We registered 3 thresholds (15/20/25) as variants.

| Rule (SPY, next open) | Period | n / yr | Win | Mean | Median | Per-trade SR | t | Timing edge (t) | Worst | Max DD at 1× |
|---|---|---|---|---|---|---|---|---|---|---|
| **ST-1: RSI2<10 & >SMA200 & VIX≥20** | 1993–2007 | 3.4 | 88% | +1.47% | +1.47% | 0.61 | 4.3 | +1.26% (3.8) | −5.1% | −8.9% |
| | **2008–26** | **3.7** | **83%** | **+0.95%** | **+1.51%** | **0.44** | **3.7** | **+0.74% (2.8)** | **−8.5%** | **−14.1%** |
| ST-1b: same, no VIX gate | 1993–2007 | 7.2 | 79% | +0.92% | +0.94% | 0.45 | 4.7 | +0.72% (3.8) | −5.2% | −8.9% |
| | 2008–26 | 7.5 | 74% | +0.52% | +0.77% | 0.28 | 3.3 | +0.28% (1.8) | −8.5% | −15.3% |
| VIX ≥15 gate | 2008–26 | 6.5 | 75% | +0.61% | +1.05% | 0.31 | 3.4 | +0.37% (2.1) | −8.5% | −15.3% |
| VIX ≥25 gate | 2008–26 | 1.4 | 73% | +0.70% | +1.36% | 0.26 | 1.3 | +0.46% (0.9) | −8.7% | −14.3% |
| ST-1 on S&P (next close) | 1990–2007 / 2008–26 | 3.4 / 3.6 | 84% / 81% | +1.35% / +0.80% | | 0.61 / 0.36 | 4.8 / 2.9 | +1.13% (4.2) / +0.57% (2.1) | −6.3% / −8.2% | |
| ST-1 on QQQ | 2008–26 | 3.7 | 72% | +0.75% | +1.53% | 0.26 | 2.2 | +0.42% (1.2) | −10.5% | −13.4% |
| ST-1 on IWM | 2008–26 | 2.9 | 81% | +0.67% | +1.70% | 0.11 | 0.8 | +0.48% (0.6) | **−38.5%** | −39.2% |

Other checks:
- **Thresholds** (`dip_sweep.csv`). Out-of-sample results are smooth across RSI(2) < 10, 15 and 20 (t 2.5–4.4), weaker at < 5 (t 1.4–2.1), and ≈0 at < 2. The rule is not knife-edge.
- **Exits.** RSI(2) > 70 and close > SMA5 are equivalent. Fixed 3- or 5-session exits are worse.
- **Stops** (closing basis, SPY OOS):

  | Stop | Mean per trade | t |
  |---|---|---|
  | None | +0.40% | 2.52 |
  | 3% | +0.36% | 2.58 |
  | 5% | +0.39% | 2.52 |
  | 8% | +0.38% | 2.36 |

  On QQQ a 3% stop cuts the mean from +0.45% to +0.24%. **Stops don't help.** They trim the worst SPY trade (−14% to −5.7%) at a small cost. Consistent with Connors' own advice [unverified].
- **Time cap.** On SPY OOS, a 10- vs 20-session cap gives the same mean (+0.45% vs +0.49%) but moves the worst trade around (−14.0% vs −8.5%); on IWM the 10-session cap turns −38.5% into −19.8%. Tail risk must be handled by **size**.

**Instrument choice** (ST-1b signals on SPY/QQQ, trades 2008–26 or from launch):

| Instrument | Mean per trade | Per-trade SR | Worst | Comment |
|---|---|---|---|---|
| SPY | +0.40% | 0.21 | −14.0% | Baseline |
| SSO (2×) | +0.75% | 0.20 | −27.3% | Scales risk; no better Sharpe |
| UPRO (3×, 2010–) | +0.98% | 0.18 | −39.0% | Worse Sharpe; unacceptable tail |
| MES/ES futures (modelled: SPY excess, 0.5 bp per side) | +0.41% | 0.21 | −14.0% | Same economics; 60/40 tax; about $38k notional per MES contract at today's level |
| 1-month ATM SPY call (Black-Scholes at 0.95×VIX, 1% of premium per side) | **−3.1% of premium** | −0.10 | −94% | **Loses**: theta, falling implied vol after the bounce, and spreads |
| QQQ / QLD / TQQQ | +0.45% / +0.79% / +1.09% | 0.24 / 0.21 / 0.20 | −7% / −15% / −22% | Same pattern |

**Cost sensitivity** (per side; ST-1 / ST-1b, SPY 2008–26):

| Cost per side | ST-1 mean (t) | ST-1b mean (t) |
|---|---|---|
| 0 bp | +0.97% (3.8) | +0.54% (3.5) |
| 1 bp | +0.95% (3.7) | +0.52% (3.3) |
| 2 bp | +0.93% (3.6) | +0.50% (3.2) |
| 5 bp | +0.87% (3.4) | +0.44% (2.8) |
| 10 bp | +0.77% (3.0) | +0.34% (2.1) |
| 20 bp | +0.57% (2.2) | +0.14% (0.8) |

The gated rule is robust to realistic retail costs; SPY's quoted spread is about 0.15 bp.

### 3.4 The tail, in plain numbers

- **Worst SPY trades, 2008–26 (ST-1b):**
  - Jul–Aug 2011: −8.5% (intra-trade low −14%);
  - Feb–Mar 2025: −6.2%;
  - Feb–Mar 2020: −4.5% (rescued by an early RSI exit).
- **S&P, 1928–2026:**
  - Oct 1929: **−32%** (−22.8% with the SMA5 exit);
  - 1936: −9%;
  - 2011: −9%.
- **1987 crash.** The signal fired on 8 Oct 1987 and exited on the 14th for about −2%. On 15 Oct the S&P closed at 298.08, **0.52 points below its 200-day SMA (298.60)**. That blocked a new entry before the −20.5% day on 19 Oct.
- **IWM, Feb 2020:** **−38.5%** (20-session time exit on 23 Mar 2020).
- **Worst S&P losses since 1928 over any window** (the sizing stress inputs):

  | Window | Worst loss | Date |
  |---|---|---|
  | 1 session | −20.5% | 1987 |
  | 3 sessions | −26.3% | 1987 |
  | 5 sessions | −27.7% | 1929 |
  | 10 sessions | −32.6% | 1929 |
  | 20 sessions | −42.2% | 1929 |
  | 60 sessions | −50.1% | 1932 |

- The out-of-sample trade distribution has **skew −2.1 and kurtosis ~9**. Most trades are small winners; the rare losers are large.

### 3.5 Verdict

- This is the only family that passes every test we set:
  - the in-sample-selected variant stays positive out of sample;
  - positive on SPY, QQQ, DIA, the S&P and all 9 sector SPDRs out of sample;
  - positive in every 5-year block since 2008;
  - a documented economic mechanism, with the predicted VIX dependence in both halves.
- **Decay:** the per-trade edge fell about 45–50% from the design era (1990–2007) to 2008–2026. That matches the typical post-publication decline (McLean & Pontiff 2016).
- **Deflated Sharpe**, out-of-sample trades alone:
  - ST-1: 0.99 at N = 1, **0.84 at N = 36 families**, 0.65 at N = 533;
  - ST-1b: 0.99, 0.82, 0.58.
- **On 1993–2026 data** both score 0.97–1.00. Under the harshest deflation, which treats all 533 variants as competing on the same data, the post-2008 evidence alone is **suggestive, not conclusive**.

---

## 4. Test 3 — Short-term momentum and breakouts (`s03_momentum.py`)

### 4.1 Donchian breakouts (long only, close channels; 6 variants)

Variants: a 20- or 55-day breakout, exiting on a 10- or 20-day channel break or after a fixed 20 or 60 sessions.

| Instrument | Period | Best variant | Mean per trade (t) | Edge vs random entry | Strategy Sharpe vs buy-and-hold |
|---|---|---|---|---|---|
| SPY (next open) | 1993–2007 | DC20 hold 60 (IS-best) | +1.46% (1.8) | **−0.30%** | 0.35 vs 0.44 |
| SPY (next open) | 2008–26 | same | +2.48% (2.6) | **−0.19%** | 0.54 vs 0.57 |
| SPY | 2008–26 | DC20 hold 20 | +1.29% (4.2) | +0.40% | 0.89 vs 0.57 (but 0.21 vs 0.44 before 2008) |
| S&P (next close) | 1928–89 | DC55 channel exit | +1.57% (3.1) | +0.57% | 0.46 vs 0.39 |
| S&P (next close) | 1990–2007 | DC55 channel exit | −0.13% (−0.2) | −0.92% | −0.08 vs 0.45 |
| 9 sector SPDRs | 2008–26 | all 6 variants | | edge > 0 in only **0–22%** of sectors | Sharpe below buy-and-hold on average |
| 17 country ETFs / 12 foreign indices | 2008–26 | all 6 variants | | edge ≤0 on average (18–65% positive) | Below buy-and-hold |

**Verdict: no timing edge.** A breakout system is a drift-capture system with 40–80% exposure. It cuts drawdowns (SPY 2008–26: −17% to −49% vs −52%), not returns. This is consistent with Brock, Lakonishok & LeBaron (1992) being overturned out of sample by Sullivan, Timmermann & White (1999).

### 4.2 1–3-month momentum rotation, 1-month holds (54 variants)

Rank by the trailing L = 1, 2 or 3 months, hold the top K = 1, 2 or 3 for a month, with or without an absolute-momentum filter. Results are versus an equal-weight portfolio of the universe.

| Universe | Period | IS-best (L2, K2, relative) excess over equal weight per month (t) | Buys a year | CAGR vs equal weight |
|---|---|---|---|---|
| Ken French 12 industries | 1927–2007 (IS) | **+0.29% (3.5)** | 14 | 14.5% vs 10.9% |
| Ken French 12 industries | 2008–26 | **−0.08% (−0.3)** | 14 | 9.4% vs 10.9% |
| 9 sector SPDRs (next open) | 2008–26 | −0.17% (−0.9) | 14 | |
| Sector SPDRs, all 18 variants | 1999–2007 / 2008–26 | −0.01 to −0.54% / −0.05 to −0.54% | | Every variant below equal weight |
| Country ETFs (next open) | 2008–26 | **−0.56% (−2.3)** | 16 | |
| Country ETFs, all variants | 1996–2007 / 2008–26 | +0.02 to +0.51% / −0.14 to −0.65% | | |

**Verdict: dead, and reversed for countries.**
- Industry momentum (Moskowitz & Grinblatt 1999) and country momentum (Asness, Liew & Stevens 1997) were strong before about 2008 and are gone since.
- Rotation also needs 10–30 buys a year, which conflicts with "few trades".

---

## 5. Test 4 — Calendar and event effects (`s04_calendar.py`)

Fills are market-on-close to market-on-close (the dates are known in advance). The edge is the mean excess minus the unconditional mean over the same number of sessions.

### 5.1 Edge per window, before and after publication

| Rule (window) | Publication | S&P before publication: n · edge (t) | S&P publication–2007 | S&P 2008–26 | SPY 2008–26 (next open in brackets) |
|---|---|---|---|---|---|
| Turn of month: last trading day through day +3 (4 sessions, 12/yr) | Ariel 1987; Lakonishok & Smidt 1988 | 720 · **+0.50% (5.6)** | 240 · +0.26% (2.0) | 224 · **+0.03% (0.2)** | +0.03% (+0.05%) |
| Pre-holiday session (9/yr) | Lakonishok & Smidt 1988; Ariel 1990 [unverified] | 577 · **+0.30% (6.1)** | 151 · −0.03% (−0.4) | 171 · +0.09% (1.3) | +0.08% (+0.03%) |
| FOMC announcement day (8/yr, 1994–) | Lucca & Moench 2015 (2011 working paper) | 138 · +0.29% (2.9) | | 150 · +0.14% (1.3) | After Apr 2011: **+0.00%** (−0.12%) |
| CPI release day (12/yr, 1995–) | Savor & Wilson 2013 [unverified] | 179 · +0.03% (0.3) | | 222 · +0.03% (0.3) | After 2010: −0.06% (−0.10%) |
| Options-expiration week (12/yr) | Stivers & Sun 2013 [unverified] | 1,020 · −0.10% (−1.2) | | 225 · −0.16% (−1.0) | −0.18% |
| Week after expiration | folklore | 1,020 · −0.27% (−3.4) | | 225 · +0.00% (0.0) | +0.02% |

**Decay by decade** (S&P timing edge per window):

| Decade | Turn of month | Pre-holiday | FOMC |
|---|---|---|---|
| 1920s | +0.77% | +0.79% | |
| 1950s | +0.66% | +0.29% | |
| 1970s | +0.30% | +0.33% | |
| 1990s | +0.17% | −0.03% | +0.22% |
| 2000s | +0.18% | +0.06% | +0.38% |
| 2010s | **0.00%** | **0.00%** | +0.05% |
| 2020s | +0.10% | +0.14% | −0.07% |

This confirms track 02's findings (turn of month and pre-FOMC dead; Kurov, Wolfe & Gilbert 2021). The per-window edges are also comparable to a few basis points of costs and the risk of tiny samples.

### 5.2 Election-cycle windows

| Window (S&P, market-on-close) | n | Up | Mean excess | Median | Unconditional | Edge (t) | By era: before 1970 / 1970–2007 / 2008–22 edge |
|---|---|---|---|---|---|---|---|
| **Midterm year: last Sep session → +60 sessions** | 24 | 21 (88%) | +5.4% | +7.4% | +2.0% | **+3.5% (1.9)** | +2.9% (1.0) / +5.8% (2.4) / **−0.8% (n = 4)** |
| Same window, other years | 74 | 72% | +1.5% | +3.9% | +2.0% | −0.5% | |
| Midterm, +20 / +40 sessions | 24 | 63% / 79% | +1.7% / +4.0% | | | +1.1% (1.0) / +2.6% (1.9) | |
| Election day → +20 / +60 sessions (even years) | 49 | 63% / 78% | +0.7% / +3.9% | | | +0.0% / +1.9% (1.7) | Other years: −0.3% / −0.3% |

Midterm trades (60 sessions): the losers were 1930 (−19.7%), 1978 (−3.7%) and 2018 (−14.9%). The 2008+ cases were 2010 +10.7%, 2014 +6.1%, 2018 −14.9% and 2022 +7.2%.

**Verdict.**
- The midterm-Q4 seasonal (Stock Trader's Almanac; Hirsch [unverified]) is the strongest calendar pattern here, but it is weak evidence:
  - 24 observations, only ~6 of them independent per generation;
  - timing t 1.9;
  - an in-sample-looking 1970–2007 stretch;
  - four post-2008 cases with a negative edge.
- DSR at N = 12 calendar variants: 0.80 (full sample); 0.10 out of sample.
- **Do not trade it.** Report it as context. The 2026 window runs from the 30 Sep close to 24 Dec (60 sessions).

---

## 6. Test 5 — Overnight vs intraday (`s05_overnight.py`)

Overnight = close → next open (dividends included via the adjustment factor); intraday = open → close.

| ETF | Period | Overnight % per yr (Sharpe) | Intraday % per yr | Close-to-close % per yr (Sharpe) | Break-even cost per side for "buy close, sell open" |
|---|---|---|---|---|---|
| SPY | 1993–2007 | **+13.9% (1.11)** | −3.3% | +10.1% (0.42) | 1.9 bp |
| SPY | 2008–26 | +7.4% (0.54) | +3.6% | +11.3% (0.57) | **1.3 bp** |
| QQQ | 2008–26 | +11.2% (0.76) | +4.6% | +16.3% (0.72) | 2.0 bp |
| IWM | 2008–26 | +11.4% (0.73) | −2.5% | +8.7% (0.40) | 2.1 bp |
| DIA | 2008–26 | +6.7% (0.50) | +3.0% | +9.9% (0.52) | 1.1 bp |
| EFA | 2008–26 | **−2.3%** | +7.1% | +4.6% | none (overnight negative) |

**What the overnight strategy nets after costs** (SPY, 2008–26):

| Cost per side | Net return per yr | Sharpe |
|---|---|---|
| 0.5 bp | +4.7% | 0.33 |
| 1 bp | +2.1% | 0.12 |
| 2 bp | −2.9% | |

**Verdict: reject.**
- The overnight premium is real and documented (Cliff, Cooper & Gulen 2008 [unverified]; Kelly & Clark 2011 [unverified]; Lou, Polk & Skouras 2019). Since 2008 the intraday leg has also been positive.
- Harvesting it needs 252 round trips a year and near-zero costs. It creates a daily stream of short-term gains and wash sales, and even gross of costs it is no better than holding (Sharpe 0.54 vs 0.57).
- It is the opposite of "fewest trades".

---

## 7. What survives the multiple-testing audit

| Family (variants) | IS-selected variant → OOS result | Survives? |
|---|---|---|
| Mean reversion in up-trends (76) | RSI2<10 → RSI2>70, trend filter: SPY IS t 4.7 → **OOS t 3.3** (timing 1.8); S&P OOS t 2.9 | **Yes (ST-1b)**; VIX-gated ST-1: OOS t 3.7, timing t 2.8 |
| VIX term structure in uptrend (in panic) | Only 2006+ data exist, so there was no pre-2008 selection | **Unproven → paper only (ST-2)** |
| Other panic sub-families (378) | All 7 in-sample winners fail out of sample (table §2.2) | No |
| Donchian (6) | DC20 hold 60: timing edge −0.30% → −0.19% | No |
| Rotation (54) | L2 K2: t 3.5 → −0.3 (industries), −0.9 (sectors), −2.3 (countries) | No |
| Calendar (12) | Turn of month, pre-holiday, FOMC, CPI, opex: post-publication edges ≈0; midterm: 4 OOS cases | No (midterm = context) |
| Overnight (1) | Break-even ≈1.3 bp per side | No |

**Deflated Sharpe ratios, finalists (out-of-sample trades only).**

| Candidate | n | Per-trade SR | N = 1 | N = 36 families | N = 533 variants | Full-sample (1993–2026) DSR at N = 533 |
|---|---|---|---|---|---|---|
| ST-1 (VIX-gated dip-buy, SPY) | 70 | 0.44 | 0.99 | **0.84** | 0.65 | 0.97 |
| ST-1b (dip-buy, SPY) | 141 | 0.28 | 0.99 | 0.82 | 0.58 | 0.98 |
| Dip-buy, QQQ | 154 | 0.24 | 0.99 | 0.75 | 0.48 | 0.86 |
| Dip-buy, S&P, next close | 138 | 0.25 | 0.99 | 0.74 | 0.45 | 0.84 (1928–2026) |
| ST-2 (VIX/VIX3M in uptrend, hold 20) | 36 | 0.49 | 0.99 | 0.72 | 0.45 | – (no pre-2006 data) |
| Midterm Q4 (S&P) | 4 | 0.16 | 0.60 | 0.04 | 0.01 | 0.46 (1930–2022) |

**Reading.**
- The dip-buy is the only rule whose evidence holds up after deflation, on the long sample and on the in-sample-selection-then-test protocol.
- On post-2008 data alone, and against the full 533-variant search, the probability that its true Sharpe is positive is about 0.6–0.65. That is the honest confidence level for money decisions.

---

## 8. The rules worth including

### 8.1 Full statistics

SPY, next-open fills, 1 bp per side, excess over T-bills. Planning values halve the edge.

| Metric | **ST-1: VIX-gated dip-buy** (recommended) | ST-1b: ungated dip-buy | ST-2: VIX/VIX3M in uptrend (paper only) | Midterm Q4 (context only) |
|---|---|---|---|---|
| Sample | 2008–26 (1993–2007) | 2008–26 (1993–2007) | 2006–26 | S&P 1930–2022 |
| Trades per year | **3.7** (3.4) | 7.5 (7.2) | 1.9 | 0.25 |
| Win rate | 83% (88%) | 74% (79%) | 78% | 88% |
| Average win / loss | +1.72% / −2.74% | +1.27% / −1.59% | +3.81% / −3.75% | +8.9% / −12.8% |
| Mean / median trade (net) | **+0.95% / +1.51%** (+1.47%) | +0.52% / +0.77% (+0.92%) | +2.13% / +2.68% | +6.2% / +7.4% |
| Timing edge (t) | +0.74% (2.8) | +0.28% (1.8) | +1.15% (1.7) | +3.5% (1.9) |
| Per-trade Sharpe (t) | 0.44 (3.7) | 0.28 (3.3) | 0.49 (2.9) | 0.61 (3.0) |
| Average hold (sessions) | 4.3 | 4.6 | 20 | 60 |
| Exposure (share of days) | 6.3% | 13.9% | 15.3% | 5.8% |
| Worst trade | −8.5% (plan for −35%) | −8.5% (S&P 1929: −32%) | −9.6% | −19.7% |
| Strategy max DD at 1× | −14.1% | −15.3% | −16.4% | −24.8% |
| Strategy CAGR at 1× (T-bills otherwise) | 4.9% (SPY 11.3%) | 5.1% | 5.3% | – |
| Kelly (shrunk) / quarter-Kelly | 6.8 / 1.7 (full history of ST-1b: 2.1 / 0.5) | 6.0 / 1.5 | 4.6 / 1.1 | 2.4 / 0.6 |
| **Planned size** | **0.5× sleeve notional, ≤6% of total portfolio** | same | paper | none |
| Log-growth per yr at 0.5× (shrunk / unshrunk) | **+0.9% / +1.9%** of the sleeve | +0.9% / +1.8% | – | – |
| Log-growth per yr at 1.0× (shrunk) | +1.8% | +1.7% | +1.8% | +0.4% |
| Pre-tax excess per yr at 1× | +3.5% | +3.7% | +3.9% | +1.3% |
| After tax at 40.8% / 24% / 1256 futures | 2.0% / 2.6% / 2.4% | 2.2% / 2.8% / 2.6% | 2.3% / 3.0% / 2.7% | – |
| Break-even cost per side | >20 bp | ≈27 bp | >20 bp | – |

### 8.2 Why 0.5× and not quarter-Kelly's 1.5–1.7×

1. The post-2008 sample contains no 1929- or 1987-type gap. The 1928–2026 S&P history of the same rule, which includes the −32% trade in Oct 1929, gives quarter-Kelly ≈ 0.5×.
2. The skew is −2.1: the losers that matter are rare.
3. The constitution's per-trade stress cap (2% of the portfolio) with a 33% gap stress (the worst 10-session S&P loss since 1928, −32.6%) allows notional of **≤6% of the total portfolio**.

At 6% notional, ST-1 adds about **+0.1%/yr** (shrunk) to **+0.2%/yr** (unshrunk) of expected log-growth to the whole portfolio. That is honest, and small.

---

## 9. What is firing or near-firing (28 Sep 2026 close; `s07_current.py`)

### 9.1 Market gauges

| Gauge | Value | Trigger distance |
|---|---|---|
| S&P 500 | 7,683.69 (−0.77% on the day); −1.5% from the 7,798.99 high; above its 200-day | −10% = 7,019; −15% = 6,629 |
| VIX / VIX3M / VIX9D | 16.07 (+8.1%) / 18.23 / 14.39 | **ST-1 gate needs VIX ≥ 20 (+24%)**; VIX ≥30 needs +87% |
| VIX/VIX3M | 0.88 (20-day max 0.90) | ST-2 needs ≥1.00 (VIX ≈ 18.2 with VIX3M unchanged) |
| S&P 3-year lag-1 autocorrelation | −0.05 | Favourable regime for mean reversion (flag if > +0.05) |

### 9.2 ETF signal state

| ETF | Close | vs 200-day | RSI(2) | Close needed for RSI(2) < 10 | Status |
|---|---|---|---|---|---|
| **SPY** | 765.61 | +6.5% | 27.5 | ≤ **757.57 (−1.05%)** | ST-1b not firing; ST-1 also needs VIX ≥ 20 |
| QQQ | 736.53 | +10.6% | 24.6 | ≤ 728.01 (−1.16%) | Not firing |
| **IWM** | 280.02 | +1.5% | **10.4** | ≤ **279.95 (−0.02%)** | **On the cusp** (not in the recommended set) |
| DIA | 514.02 | +2.4% | 36.1 | ≤ 504.79 (−1.8%) | – |
| XLF | 54.19 | +0.9% | 17.1 | ≤ 53.87 (−0.6%) | Near |
| EWC | 59.07 | +2.5% | 13.0 | ≤ 58.95 (−0.2%) | Near |
| XLY | 109.00 | **−6.5%** | 8.5 | – | Blocked by the trend filter |
| XLU, XLI, XLB, XLP, EWZ, EZA, FXI, EWW | – | below their 200-days | – | – | Blocked |

No ETF made a new 20- or 55-day closing high today. Breakouts and rotation are not recommended, and no panic trigger is active.

### 9.3 Scheduled windows (none is a trade)

| Window | Dates (market-on-close to market-on-close) | Status |
|---|---|---|
| Turn of month | 29 Sep → 5 Oct | Dead since 2008 |
| **Midterm Q4** | **30 Sep → 24 Dec** (60 sessions) | Context only (21/24 historically; t 1.9; 2018 −15%) |
| Options-expiration week | 9 → 16 Oct | No edge |
| CPI | 14 Oct | No edge |
| FOMC | 28 Oct | No edge after 2011 |
| Election | 3 Nov → 2 Dec | No edge |
| Pre-holiday | 25 Nov, 24 Dec, 31 Dec | Weak (+0.09%) |

---

## 10. Limitations

- **One effect, one mechanism.** All survivors are the same liquidity-provision / short-term-reversal effect. They will fail together, for example if index autocorrelation turns positive as in 1950–69, or if the effect is arbitraged further. Do not count ST-1, ST-1b and ST-2 as diversification.
- **Samples are small.** The gated rule has 120 trades since 1993. ST-2 has 40, all from one volatility regime. The midterm window has 24, of which 4 are after 2008.
- **Data.**
  - Yahoo opens for ETFs are the first print, not necessarily the auction price, and data before about 2000 have stale opens (hence S&P close fills).
  - Pre-1986 VIX is a proxy.
  - Foreign indices are price-only and in local currency.
  - Costs are modelled, not measured.
  - The high-VIX cost doubling may still be optimistic for a panic open.
- **Researcher degrees of freedom.** The VIX≥20 gate was motivated by the in-sample half and by Nagel (2012), but it was *noticed* after both halves had been viewed. The 20-session cap and the RSI thresholds follow Connors' published defaults, not our optimisation.
- **Taxes.** The after-tax figures ignore state tax, and assume other gains absorb losses and that there are no wash-sale deferrals.
- **Literature numbers.** We cited no literature magnitudes except where marked. Citations verified by DOI (OpenAlex):
  - Lucca & Moench; McLean & Pontiff; Harvey, Liu & Zhu; Moskowitz & Grinblatt;
  - Brock, Lakonishok & LeBaron; Sullivan, Timmermann & White; Lakonishok & Smidt; Ariel 1987; McConnell & Xu;
  - Lou, Polk & Skouras; Nagel; Bailey & López de Prado; Jegadeesh; Lehmann;
  - Campbell, Grossman & Wang; Kurov, Wolfe & Gilbert; Whaley; Asness, Liew & Stevens; Cederburg et al.

  Unverified: Ariel 1990, Savor & Wilson 2013, Stivers & Sun 2013, Cliff, Cooper & Gulen 2008, Kelly & Clark 2011, Santa-Clara & Valkanov 2003, the Connors & Alvarez books, and the Hirsch almanac.

---

## 11. Implications for the system design (concrete, testable rules)

### 11.1 ST-1 — VIX-gated uptrend dip-buy (the only short-horizon index rule to include; paper first)

- **Instrument.** SPY.
  - Or an identical S&P 500 ETF (VOO, IVV) consistently. **Never mix them within a 30-day window in a taxable account**; it is safest to treat them as substantially identical for wash sales.
  - Or **MES micro E-mini futures** in a taxable account whose sleeve is ≥ about $80k (60/40 tax, about 0.5 bp per side all-in; about $38k notional per contract).
  - **Not** leveraged ETFs, **not** options (calls lost −3.1% per trade), **not** IWM or foreign ETFs.
- **Signal, computed after the official close of day t from final data** (all three must hold):
  1. The SPY close is above the simple average of the last 200 SPY closes.
  2. The RSI(2) of SPY closes is below 10. Use Wilder smoothing (α = ½), seeded with at least 250 sessions of history, on unadjusted official closes.
  3. The CBOE VIX close is at or above 20.00.
- **Entry.** Buy at the next session's open with a market-on-open order, as tested. Do not substitute limit orders or intraday entries without re-testing.
- **Exit.**
  - After the first close at which RSI(2) of SPY exceeds 70, sell at the next open (market-on-open).
  - **Time stop:** sell at the close of the 20th session after entry (market-on-close), stated in the entry email.
  - **No stop-loss** (tested: it does not improve results).
- **One position at a time.** Ignore new signals while in a trade, and never hold the same dip in SPY and QQQ/IWM together.
- **Size.**
  - Notional = min(0.5 × the short-horizon sleeve's capital, 6% of total portfolio). The second term is the 2% portfolio stress cap at a 33% gap.
  - No leverage above 1.0× sleeve notional, even though out-of-sample quarter-Kelly says 1.7×.
  - Apply the drawdown governor G(D).
- **Expected values** (planning = out-of-sample with the edge halved):
  - 3–4 trades a year (range 0–8);
  - win rate ~80%;
  - mean excess +0.45% per trade (backtest +0.93%);
  - ~4 sessions held;
  - sleeve log-growth +0.9%/yr at 0.5×;
  - a planning stress loss of −35% of notional on one trade in a crash.
- **When never to trade:**
  - SPY below its 200-day average;
  - VIX < 20;
  - data not final or a two-source close mismatch above 0.1%;
  - the market closed or halted at the open (then use the first regular-session price);
  - G(D) = 0.

  **Do not apply** the constitution's "no new crash-correlated positions when VIX > 30" freeze to ST-1. Its best trades come at VIX > 25 (+0.98% to +1.54% per trade out of sample), and the stress cap already limits the tail.
- **Accounts.** An IRA first (short-term gains, frequent wash sales). In a taxable account, use MES futures if size allows.

### 11.2 ST-1b (optional, higher frequency)

- Same rule without the VIX gate: 7–8 trades a year, +0.49% per trade out of sample. It gives the same log-growth with twice the trades, taxes and attention.
- **Use ST-1b in the paper phase only**, as a pipeline test, since its signals are a superset of ST-1's. Promote only ST-1 to live.

### 11.3 ST-2 — VIX/VIX3M inversion in an uptrend (incubator / shadow book only)

- **Rule.** The first VIX/VIX3M close ≥ 1.00 after 20 sessions below 1.00, while SPY is above its 200-day → buy SPY at the next open, hold 20 sessions.
- **Evidence.** 36 trades 2008–26, +2.0% per trade, t 2.9. The data start in 2006, so there is no out-of-sample test. 72% of its signals coincide with ST-1b signals.
- **Promotion rule.** Promote only if the next ≥15 shadow signals average ≥ +1.0% excess **and** its overlap-adjusted marginal log-growth over ST-1 is positive. At about 2 signals a year this is a multi-year test.

### 11.4 Context only (log and cite, never trade)

- The midterm-Q4 base rate: S&P higher 60 sessions after the end-September close in 21 of 24 midterm years since 1930, timing edge t 1.9, 2018 −15%.
- Turn of month, pre-holiday, FOMC day, CPI day, options expiration, post-election drift: all ≈0 after publication.
- Panic levels (VIX ≥40/45, −4%/−5% days, −10/−15/−20% drawdowns) belong to the long-horizon S2 tranches and the VIX add-on. **At 1–60 days they are not trade signals.**

### 11.5 Never recommend (short-horizon additions to §3.9 of the synthesis)

- Buy-the-close / sell-the-open overnight programmes.
- Donchian or breakout systems on index, sector or country ETFs.
- 1–3-month sector or country rotation.
- Calendar trades.
- Short-dated calls or leveraged ETFs to express a dip-buy.
- Stacking the same US dip across several ETFs.
- Standalone panic-level trades held 1–60 days.

### 11.6 Monitoring and monthly calibration (deterministic, no LLM needed)

- **Log every ST-1/ST-1b signal and near-miss** in the shadow book. A near-miss is RSI(2) < 15 with price above the 200-day, or VIX within 2 points of 20. For each, record the paper fill at the official open.
- **Monthly report:**
  - realised mean excess per trade vs the +0.45% planning value (per-trade sd ≈ 2.2%);
  - fill slippage vs the official open (budget ≤3 bp per side);
  - the S&P trailing 3-year lag-1 autocorrelation;
  - trades year-to-date vs the expected 3–4.
- **Suspend to paper** if any of these holds:
  1. after ≥20 live trades the mean-excess t-stat is < −1.0;
  2. average slippage exceeds 10 bp per side over 10 trades;
  3. the trailing autocorrelation stays above +0.10 for 6 months (the 1950–69 regime, when the effect disappeared).
- **Do not "improve" the rule from live P&L.** The effect needs about 90 trades (≈24 years at 3.7 a year) to confirm the shrunk edge at t = 2. Parameter changes follow the synthesis's annual two-period rule only.

### 11.7 Notes for the synthesis and constitution

1. **Short horizons forfeit the equity premium.** A 1–60-day-only account running ST-1 at 1× would have earned about 4.9% CAGR in 2008–26 (T-bills + ~3.5%), versus 11.3% for buy-and-hold SPY, with a −14% max drawdown vs −52%.
   - The equity premium is available at ≤60-day holds only by rolling positions, which is buy-and-hold with short-term taxes.
   - If return is the goal, keep a long-horizon core outside the 1–60-day rule set.
2. **Gate 5 ("defined maximum loss; stops don't count") cannot be met by ST-1** without options, and the option version loses money. Grant ST-1 the same kind of documented exception as the S2 tranches: size by gap stress (a = 0.33) instead of a defined maximum loss.
3. **Use a rule-level Δg for short-horizon rules:** Δg_yr = trades/yr × E ln(1 + f·r).
   - The per-trade Δg annualised over a 4-session horizon (≈6%/yr for ST-1) passes any hurdle and is misleading.
   - At 6% of the portfolio, ST-1's rule-level Δg is ≈ +0.1%/yr (shrunk), below the 0.2% hurdle. Admit it as a paper-then-live policy module with an explicit exemption, or at the 0.2% hurdle's implied size (≈13% notional, stress loss ≈4% of the portfolio) **only** if the owner accepts that stress. Default: 6%.
4. **Trade budget.** ST-1 uses about 4 of the ≤24 annual trades (8 emails: entry plus exit). ST-1b would use about 8.

---

### Files

All paths are under `research/code/13-short-index/`:

| File | Purpose |
|---|---|
| `common13.py` | Loaders, trade engine, statistics, Kelly, deflated Sharpe, variant registry |
| `s00_data.py` | Downloads; CPI release dates via ALFRED |
| `s01_panic.py` | Test 1 |
| `s02_meanrev.py` | Test 2 |
| `s03_momentum.py` | Test 3 |
| `s04_calendar.py` | Test 4, including the holiday classifier |
| `s05_overnight.py` | Test 5 |
| `s06_extras.py` | Term-structure proxy, stops, instruments, overlap, threshold sweep, VIX gate |
| `s07_current.py` | Status as of today |
| `s08_summary.py` | Variant counts, in-sample selection → out-of-sample test, deflated Sharpe, finalists |
| `s09_tables.py` | Report tables |
| `s10_scorecard.py` | Full-stat scorecard |
| `run_all.py` | Runs everything in order |
| `results/` | Result tables (files over 400 kB are gzipped); raw data cached in the scratchpad `13-short-index/cache/` |
