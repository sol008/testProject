# 18 — Short-horizon trades (1–60 days): sizing, execution from an email, rules and taxes, paper trading, and calibration speed

*Track 18 of research round 2 (tracks 13–18), written 28 September 2026 after the owner's decisions in `DECISIONS.md`: holding periods of 1–60 days, paper trading first, US stocks/ETFs, listed options, futures, a Bitcoin ETF and direct crypto, GitHub Actions + Gmail API, daily scan at about 22:17 ET.*

*Code: `research/code/18-short-exec/`. `python3 run_all.py quick` reproduces everything except the two portfolio grids in about 2 minutes; `python3 run_all.py` runs everything in about 25–35 minutes on 4 CPUs. Seeds are fixed. Every table has a CSV/Markdown twin in `results/`. `python3 test_18.py` runs the sanity tests.*

**Evidence labels.** ✅ computed in this container. 📄 primary source fetched on 2026-09-28. 🔎 secondary source or search summary, 2026-09-28. **[unverified]** means from memory or not checked; confirm before the tool relies on it.

---

## TL;DR

1. **At 1–60 days the growth engine changes, and so does what can be proven.**
   - Expected log growth from trading is roughly (number of trades) × (per-trade Sharpe)² × (a sizing factor), until risk caps bind.
   - With the recommended rule (§2), a true per-trade Sharpe of 0.1 gives about **+3.0% a year over T-bills at 50 trades a year**. It gives 0.8% at 12 trades and 4.6% at 100. A Sharpe of 0.2 gives 1.9 / 3.7 / 6.5 / 10.5% at 12 / 25 / 50 / 100 trades.
   - A zero-edge system loses 0.2–0.7% a year to costs, and has a 7–76% chance of a 10% drawdown within 3 years.
   - After 3 years of live P&L, a t-test detects a real per-trade Sharpe of 0.1 only 11–41% of the time. At 0.2 it is 26–86% (✅ `sim_portfolio.py`).
2. **Sizing is set by caps, not by Kelly.**
   - Quarter-Kelly on a shrunk edge asks for 1–2% of equity at risk per trade. The binding limits are the per-trade stress cap (2% of equity at the 99th-percentile gap loss), the correlation divisor and the total-stress cap.
   - In practice that means **0.45–0.75% of equity at risk per stop-based trade**.
   - The correlation and cluster caps cost 23–37% of growth when the edge is real. They cut the 3-year chance of a 20%+ drawdown from 4–76% to about 0%.
   - Full Kelly on the model's *claimed* edge ruined (−90% or worse) **0.4–54% of paths within 3 years**. That includes 9–35% of paths at 50–100 trades a year with a genuinely positive edge (s = 0.1).
3. **Gap risk is larger than the earlier tracks assumed** (✅ `gap_risk.py`, 2005–2026, 82 names).
   - With stops at 2×ATR(14), **16–31% of stop-outs gap through the stop**.
   - The 99th-percentile loss is **1.7R** for ETFs, **2.1R** for large caps, **2.6R** for high-volatility stocks and **3.1R** for Bitcoin ETFs. The worst losses are 3–8R. Track 03 used 1.2R.
   - Bitcoin ETFs gap more than 5% on **7.5–13% of Mondays**, against 2.7–3.6% of other days.
4. **The growth hurdle has been corrected and re-based per trade** (✅ `sizing_v2.py`).
   - Track 03's rule has four flaws: its hurdle is per trade, it is isolated from the portfolio, it treats cash as earning 0%, and it puts the gap-stress multiple *inside* the Kelly formula. The last flaw makes every realistic stop-based trade look negative-edge: break-even 58.8% against an actual hit rate of 57.6% on the SPY example.
   - Dividing Δg by the holding period is also wrong for short trades. It turns a 1-day trade worth 3 bp into "786 bp a year".
   - The fix:
     - compute Δg on the whole book, jointly simulated, with idle cash earning T-bills;
     - T-bills alone eat about half of a typical 10-day ETF swing edge;
     - send a trade only if it adds **≥ 6 bp of expected log growth per trade**.
5. **"Few trades" should mean about 25–50 a year** (2–4 a month), with a hard cap of 100 and 8 open at once.
   - Below about 20 a year the system can neither compound nor learn.
   - With a per-trade risk cap, every positive-edge trade adds growth. Under the modelled candidate pipelines, 12 trades a year capture only 10–40% of the achievable growth. 50 capture 31–92% (✅ `sim_selection.py`).
6. **Selection inflates edges badly.**
   - Among the trades that pass the hurdle, the claimed edge exceeded the true edge **3–19×** in the simulated pipelines. The realized shrinkage factor κ was 0.05–0.36, against the 0.5 assumed at launch.
   - κ must therefore be *measured* from paper and live trades, and the default expectation is about 0.3.
7. **A 22:17 ET email and next-open execution forfeit the first night** (✅ `latency.py`).
   - Between 2005 and 2026, ETFs earned a median 9.8% a year overnight against 1.2% intraday.
   - After short-term reversal signals, next-open entry kept only **37–76%** of the 10-day edge (37–51% for ETFs). Breakout signals kept 87–94%.
   - So: no 1–5-day mean-reversion archetypes, and every backtest must assume next-open fills.
8. **Execution can be almost entirely pre-placed.** On the email evening:
   - a DAY limit entry at the edge of a ±1.5 σ entry band (this skips 3–7% of entries);
   - plus a one-triggers-OCO bracket: a GTC stop-market order and a GTC take-profit limit.
   - Options get **no stop orders**: defined-risk structures, a GTC take-profit, and exits by EXIT email.
   - Time stops arrive as EXIT emails.
9. **Rules and taxes.**
   - **PDT rule:** replaced by intraday-margin standards. The SEC approved it on 2026-04-14; it took effect on 2026-06-04, with firm phase-in until 2027-10-20 (📄 FINRA RN 26-10).
   - **Cash accounts:** still T+1, with good-faith and free-riding violations (📄 Reg T 220.8).
   - **Wash sales:** at 50 trades a year on 10 underlyings, **56% of losing exits are wash sales**. If 30% of trades run in an IRA, **22% of all losses become permanently disallowed** (🔎 Rev. Rul. 2008-5). So each underlying is assigned to exactly one account.
   - **§1256 (60/40):** saves 5–12% of every gain (✅).
   - **Crypto held directly:** still outside the wash-sale rule in 2026; bills are pending (🔎).
   - **475(f) mark-to-market election:** not worth pursuing at 25–100 trades a year.
10. **Paper trading can prove operations, costs and gross calibration, not a small edge.**
    - Minimum: 3 months and 30 resolved trades.
    - Paper-trade a "wide book" of every candidate above a low hurdle.
    - Go live at **25% of target size** when P(edge > 0) ≥ 0.7 under a sceptical prior and all operational gates pass.
    - At 50 paper trades a year, this passes within 12 months 22% of the time with no edge, 46% with s = 0.1 and 73% with s = 0.2. A wide book of 200 a year raises the latter two to 84% and 99%.
    - About 21% of go-lives will have no edge, which is why the pilot is small.
11. **Paper optimism is measurable.**
    - "Touch = fill" limit rules overstate results by 1.4–5.6 bp per trade.
    - Limit entries below the close capture only about half of a generic long signal's edge per signal. Fills are adversely selected: the 34–72 bp price improvement is mostly given back.
    - Options should be filled at mid + 0.6 × half-spread (Muravyev & Pearson 2020: 58% of the half-spread for all traders), and never beyond the displayed size.
12. **The monthly loop at short horizons.**
    - **Monthly:** operations and execution.
    - **Quarterly:** costs, κ, calibration warnings, base-rate drift.
    - **Annually:** slope, retirement, k.
    - With 50 trades a year, 12 months of P&L can only confirm a per-trade Sharpe ≥ 0.35. Stated probabilities can be checked for biases ≥ 14 points. A slippage bias of 2.5 bp is detectable, and a deterministic shadow family of 1,000 signals a year detects a 4-point base-rate drift.
    - A dead edge takes a CUSUM 9–53 months to notice (median 22 months for s = 0.2 at 50 trades a year).

---

## 1. What changes when horizons shrink to 1–60 days

| Topic | Long-horizon constitution (00-SYNTHESIS rev. 2) | Short-horizon system (this track) |
|---|---|---|
| Trades a year | 1–6 expected, cap 24 | Target 25–50, hard cap 100 (§2.6) |
| Growth hurdle | Δg_yr ≥ 0.2% a year, per trade (§1.2) | Δg per trade ≥ 6 bp; per-year division by T abolished for T < 1 year (§2.1) |
| Risk unit | Stress loss per trade, 1.2 × stop for liquid names | R = planned loss at the stop, stress = R × **measured** P99 gap multiple 1.7–3.1 (§2.2) |
| Drawdown governor | 10% → 40% linear | 5% → 15% linear to a 0.25 floor; review at 15%, pause at 20% (§2.4) |
| Taxes | Prefer > 1-year holds | Every gain is short-term unless §1256; account placement matters more than holding period (§4) |
| Calibration evidence | Years per resolution | Resolves within ≤ 60 trading days; a deterministic daily shadow book gives hundreds of resolved questions a year (§6) |
| Execution | Standing GTC tranche orders | Evening order placement, OTOCO brackets, entry bands, next-open fills (§3) |
| Proof before money | Shadow book | Paper trading with a conservative, versioned fill model and a pre-registered go-live rule (§5) |

---

## 2. Sizing many short, possibly correlated trades

### 2.1 The corrected growth hurdle (`sizing_v2.py`)

`research/code/03-math/sizing_rule.py` computes `dg = p·ln(1 + f·b) + (1 − p)·ln(1 − f·a)`. Track 12 (M1) and 00-SYNTHESIS §1.2 flagged three problems with it:

- the hurdle is per trade, not per year;
- cash earns 0% instead of T-bills;
- the calculation is isolated from the rest of the portfolio.

Testing it on short trades exposed a fourth:

- **The stress multiple sits inside the Kelly formula.** Track 03 sets `a` = "gap-aware stress loss" (1.2× the stop, more around events) and uses it both for the caps *and* for the expected-value and Kelly calculation.
- Our data show why that fails. The **average** stop-out loses 1.04–1.12R, while the **99th percentile** loses 1.7–3.1R (§2.2).
- Using the tail as the mean moves the break-even hit rate from 45.6% to 58.8% on the SPY example. The simulated trade wins 57.6% of the time, so the old rule rejects it.
- ✅ Replayed on the old rule: all five stop-based examples get a stake of 0. Only the defined-risk spread passes.

**The v2 rule, as implemented:**

```
s_used  = κ · s_claim                        κ = 0.5 rule-based, 0.25 LLM-subjective (frozen in year 1)
X       = joint scenario simulation of the candidate AND every open position (common factor,
          Student-t overnight gaps, news jumps, market crash gaps, stops/targets via Brownian bridge)
W_T     = 1 + r_f·T + Σ_open r_i·ΔX_i + r·(X_cand − drag)          drag = T-bill carry per 1R (below)
Δg_trade(r) = E ln W_T(with r) − E ln W_T(without)                  (common random numbers)
r*      = argmax_r Δg_trade(r)                                       → joint Kelly given the open book
r       = G(D) · min( 0.25·r*(s_used),  r*(s_claim − 0.05),  2%/gap_mult (stop) or 3% (premium),
                      cluster room (6% stress), total room (10% stress) )
send if Δg_trade(r) ≥ 6 bp  AND  E[X] − drag > 0  AND  gross edge ≥ 2 × round-trip cost
Δg_yr   = Δg_trade / max(T_years, 1)  → for T ≤ 1 year this is the trade's contribution to the year
```

**T-bill drag.** A cash-funded position forgoes r_f·T on its notional. For a stop-based trade, the notional per 1R is 1/(stop distance). So the drag in R units is `r_f · T / stop%`.

- It is large for low-volatility instruments held for weeks: 0.05R for a 10-day SPY trade with a 3.3% stop, 0.05R for a 20-day stock trade with a 6.6% stop, and 0.20R for a 40-day index-ETF trade.
- If the claimed edge is measured on futures prices, it is already in excess of T-bills and the drag is zero. The code's `edge_basis` flag records which case applies.
- The drag also exposes a trap. Much of a "long ETF for 10 days" edge is simply what buy-and-hold earns: T-bills plus the equity premium. The system must require the edge to beat buy-and-hold, not zero.

**Worked examples** (✅ `results/sizing_v2_examples.csv`). "Empty book" means a paper account of 100% T-bills.

| Context | Trade (claimed s → s used) | Raw edge / T-bill drag / buy-and-hold over H (R) | Final risk r (% equity) | Binding constraint | Δg per trade | Δg ÷ T ("annualised", wrong) | Send? |
|---|---|---|---|---|---|---|---|
| Empty book | SPY pullback, 10 d, rule (0.20 → 0.10) | 0.094 / 0.050 / 0.083 | 1.02% | quarter Kelly | 3.8 bp | 97 bp/yr | no |
| Empty book | Single-stock earnings drift, 20 d, LLM (0.25 → 0.06) | 0.067 / 0.050 / 0.097 | 0.25% | quarter Kelly | 0.4 bp | 4 bp/yr | no |
| Empty book | MES futures trend, 40 d, rule (0.15 → 0.075), excess basis | 0.119 / 0 / 0.130 | 1.18% | stress cap (2%/1.7) | **12.4 bp** | 78 bp/yr | **yes** |
| Empty book | QQQ call debit spread, 20 d (0.20 → 0.10) | 0.114 / 0.003 / n/a | 1.82% premium | quarter Kelly | **17.5 bp** | 221 bp/yr | **yes** |
| Empty book | IBIT breakout, 20 d (0.15 → 0.075) | 0.089 / 0.035 / 0.072 | 0.65% | stress cap (2%/3.1) | 3.1 bp | 40 bp/yr | no |
| Empty book | 1-day ETF event trade (0.20 → 0.10) | 0.032 / 0.005 / 0.008 | 1.18% | stress cap | 3.1 bp | **786 bp/yr** | no |
| 2 open correlated trades | MES trend, 40 d | same | 0.91% | quarter Kelly (joint) | 8.4 bp | 53 bp/yr | yes |
| 2 open correlated trades | QQQ call spread | same | 1.64% | quarter Kelly (joint) | 14.2 bp | 179 bp/yr | yes |
| 2 open + 12% drawdown | MES trend, 40 d | same | 0.43% | Kelly × governor 0.48 | 4.2 bp | 27 bp/yr | no |
| 60% index core + 2 open | MES trend, 40 d | same | 0.92% | quarter Kelly (joint) | 6.1 bp | 38 bp/yr | yes (barely) |
| 60% index core + 2 open | QQQ call spread | same | 1.07% premium | quarter Kelly (joint) | 6.0 bp | 76 bp/yr | yes (barely) |
| 60% index core + 2 open | SPY pullback, 10 d | same | 0.61% | quarter Kelly (joint) | 1.4 bp | 35 bp/yr | no |

**What the table shows:**

- **Correlated open positions and a core cut both the Kelly size and Δg.** The QQQ spread falls from 17.5 to 14.2 to 6.0 bp, and the MES trade from 12.4 to 8.4 to 6.1 bp. The whole-portfolio calculation does what the synthesis asked for.
- **The ÷T annualisation is unusable at short horizons.** Every trade in the table would clear the synthesis's 0.2%-a-year bar, including a 1-day trade worth 3 bp.
- **The 6 bp per-trade hurdle comes from §2.6.** At the caps, it corresponds to a *shrunk* per-trade Sharpe of about 0.05–0.06 on a full-size trade.

### 2.2 Stop-based vs defined-risk sizing; gap risk

**Empirical stop-outs** (✅ `gap_risk.py`, `results/stop_gap_through.csv`).
- Data: yfinance daily adjusted OHLC, 2005-01 to 2026-09; 16 broad/sector ETFs, 6 rates/commodity ETFs, 40 large caps, 18 high-volatility stocks, IBIT and BITO.
- Method: a hypothetical entry at every close; a stop at k × ATR(14); a 20-day time stop.
- Fill rules: if the next open is beyond the stop, the fill is at the open. Otherwise an intraday touch fills exactly at the stop, with no extra slippage.
- Survivorship: the universe is today's survivors, so the tails are if anything **understated**.

| Group (long entries) | Stop | Stopped out within 20 d | Stop-outs that gapped through | Mean loss | P95 | **P99** | P99.9 | Worst |
|---|---|---|---|---|---|---|---|---|
| Broad/sector ETFs | 2×ATR | 46% | 19% | 1.04R | 1.26R | **1.66R** | 2.43R | 3.2R |
| Rates/commodity ETFs | 2×ATR | 49% | 27% | 1.05R | 1.32R | **1.65R** | 2.23R | 3.5R |
| Large-cap stocks | 2×ATR | 45% | 16% | 1.05R | 1.30R | **2.08R** | 3.68R | 6.0R |
| High-volatility stocks | 2×ATR | 47% | 18% | 1.08R | 1.54R | **2.57R** | 4.70R | 5.6R |
| Bitcoin ETFs (IBIT, BITO) | 2×ATR | 48% | 31% | 1.12R | 1.59R | **3.10R** | 3.27R | 3.4R |
| Large-cap stocks | 1×ATR | 68% | 15% | 1.08R | 1.43R | 2.79R | 5.87R | 12.0R |
| High-volatility stocks | 1×ATR | 71% | 14% | 1.11R | 1.52R | 3.71R | 7.83R | 10.8R |
| Large-cap stocks | 3×ATR | 29% | 17% | 1.04R | 1.23R | 1.81R | 2.91R | 4.5R |

Shorts look similar, with slightly worse tails for single stocks: the 2×ATR P99 for large caps is 2.29R.

**Overnight gaps** (✅ `results/gap_distribution.csv`), in units of the prior 20-day daily σ:

| Group | Overnight share of daily variance | P(\|gap\| > 2σ) after a weekend or holiday | P(\|gap\| > 2σ) other days | P(gap < −4σ) | Worst gap |
|---|---|---|---|---|---|
| Broad/sector ETFs | 36% | 2.4% | 1.0% | 0.07% | −7.1σ |
| Large caps | 35% | 1.6% | 1.5% | 0.17% | −16.6σ |
| High-vol stocks | 34% | 1.1% | 1.8% | 0.27% | −19.7σ |
| Bitcoin ETFs | 60% | **8.7%** | 2.1% | 0.16% | −6.3σ |

**Bitcoin ETFs over the weekend.** IBIT: P(|gap| > 5%) is 7.5% after weekends and 2.7% on other days, and the worst gap is −20.4%. BITO: 13.1% against 3.6%. Bitcoin itself trades all weekend; the ETF's stop does not.

**Rules that follow:**

1. **Stress = R × the group's P99 multiple.** At 2×ATR stops: ETFs and index futures 1.7, large caps 2.1, high-volatility stocks 2.6, Bitcoin ETFs 3.1. Spot crypto with an exchange stop that works 24/7 gets 1.5 (judgment: continuous trading, but flash crashes).
2. **Minimum stop width 2×ATR(14).** 1×ATR stops are hit 68–80% of the time within 20 days, and their tails reach 12–14R.
3. **No stop-based single-stock position through an earnings date.** The −17σ to −20σ single-stock gaps above are the size of earnings and company-news shocks [judgment: earnings dates were not matched in this study]. Either exit before earnings, or use a defined-risk structure, or size the stock at a stress of ≥ 5R.
4. **Defined-risk structures earn their larger allowance only where gaps dominate.** Examples: event and earnings trades, positions held through weekends in Bitcoin ETFs, and single names with jump risk.
   - A defined-risk trade's P99 loss is exactly 1R. At equal 2% stress caps it may therefore carry 1.7–3.1× the R of a stop-based trade; under the synthesis caps (3% premium vs 2% stress) it may carry 2.5–4.6×.
   - ✅ In the portfolio simulation (§2.5), a defined-risk book at the same per-R edge grew 1.4–2.4× faster but drew down far more often: P(10% drawdown in 3 years) was 93% against 23% at N = 50, s = 0.1.
   - That comparison flatters options. Track 04 found that buyers overpay implied volatility on 86% of days, so per unit of premium the edge after spread and variance premium is usually *worse* than the equivalent stock edge per R.
   - Hence the default is a stop-based stock, ETF or future. Defined risk is for gap-dominated setups.

### 2.3 Correlation clustering

In the simulation, 70% of trades are "long risk" and load on one common factor with pairwise correlation ρ. The factor also carries a crash gap on 1 day in 500. Five concurrent long-risk trades are, to first order, one leveraged bet on that factor.

| N / true s | Policy (✅ `results/portfolio_main.csv`, `portfolio_sensitivity.csv`) | Growth a year (log, over T-bills) | P(max DD > 10%, 3 y) | P(max DD > 20%, 3 y) | P(equity < 10% of start) |
|---|---|---|---|---|---|
| 50 / 0.1 | v2 (correlation divisor, 6% cluster / 10% total stress caps, governor) | **3.0%** | 23% | 0.0% | 0% |
| 50 / 0.1 | Same caps per trade, but no correlation/cluster caps and no governor, ρ = 0.3 | 3.9% | 54% | 4.2% | 0% |
| 50 / 0.1 | Same, ρ = 0.6 | 3.5% | 69% | 9.8% | 0% |
| 50 / 0.1 | Full Kelly on the claimed edge | −2.3% | 100% | 100% | **9.3%** |
| 100 / 0.1 | v2 | 4.6% | 36% | 0.0% | 0% |
| 100 / 0.1 | No correlation caps, ρ = 0.3 / 0.6 | 7.3% / 6.4% | 89% / 98% | 24% / 44% | 0% |
| 100 / 0 (no edge) | v2 | −0.7% | 76% | 0.1% | 0% |
| 100 / 0 (no edge) | No correlation caps, ρ = 0.3 / 0.6 | −2.1% / −2.8% | 99% / 100% | **61% / 76%** | 0% |
| 100 / 0 (no edge) | Full Kelly on the claimed edge | n/m | 100% | 100% | **54%** |

- **The correlation controls are the price of not being ruined by a correlated book that turns out to have no edge.** With an edge they cost 23–37% of growth. Without an edge they prevent a 61–76% chance of a 20% drawdown.
- **The model's cluster map needs these factors:**
  - US equity beta, with sector sub-clusters;
  - duration (rates);
  - USD;
  - oil/energy;
  - gold;
  - crypto;
  - an idiosyncratic single-name residual.
- **Assume ρ ≥ 0.5 within a cluster and ρ ≥ 0.3 across long-risk clusters** (track 03 §2.4). In a 2020- or 2022-type shock, "unrelated" risk trades converge.
- **The joint simulation in `sizing_v2.py` sizes against open positions directly.** Adding a QQQ spread to a book holding two correlated equity trades lowered its joint Kelly size from 7.3% to 6.6% premium. The divisor 1 + 0.5 × (open positions in the cluster) is the conservative fallback.

### 2.4 Daily and weekly loss limits; the drawdown governor

The synthesis governor (G = 1 up to a 10% drawdown, falling to 0 at 40%) was built for a portfolio holding an unlevered index core. For a trading book risking about 0.5% a trade, 40% is never reached, and a 20% drawdown already means something is broken. The short-horizon governor:

**G(D) = 1 for D ≤ 5%; linear to 0.25 at D = 15%; floor 0.25.** A human review is triggered at 15%, and new trades pause at 20% until the review is done.

✅ The governor and loss limits were tested in an i.i.d. world and in a stylised regime-switching world. In the regime world the edge flips sign and volatility doubles in a persistent stress state that covers 16% of days.

| N / s | World | v2 (governor + loss limits) | No loss limits | No loss limits, no governor |
|---|---|---|---|---|
| 50 / 0.1 | i.i.d. | 3.00% growth; P(DD > 20%) 0.0% | 2.94%; 0.0% | 3.09%; 0.6% |
| 50 / 0.1 | regime | 1.52%; 0.0% | 1.43%; 0.0% | 1.54%; 4.2% |
| 100 / 0 | i.i.d. | −0.67%; 0.1% | −0.67%; 0.0% | −0.82%; **17.1%** |
| 100 / 0 | regime | −1.21%; 0.3% | −1.21%; 0.4% | −1.68%; **28.8%** |
| 100 / 0.1 | regime | 2.16%; 0.1% | 2.25%; 0.2% | 2.50%; 10.9% |

- **The governor is the tail control that works.** It is almost free when the edge is real (−0.1 to −0.3 points a year) and removes 10–29% chances of a 20% drawdown when it is not.
- **Daily (−2%) and weekly (−4%) loss limits neither helped nor hurt in either world.** At daily granularity, a manual system cannot react faster than its stops already do.
  - Keep them as an **operational circuit breaker**: after such a loss, pause new entries for one day or one week and check the data, fills and the cluster map.
  - Do not keep them as a risk model.
- **When edges die in stress regimes, no risk overlay recovers the growth.** It halved: 3.0% to 1.5% at N = 50. Only signal research can fix that (tracks 13–17).

### 2.5 Simulation: 12 / 25 / 50 / 100 trades a year, per-trade Sharpe 0.05–0.3, with costs

**Engine** (`sim_portfolio.py`, `trade_model.py`; 3,000 paths × 3 years, daily steps, vectorised numpy):

- **Candidate flow.** Candidates that already passed the hurdle arrive as a Poisson process.
- **Holding periods** are drawn from {5, 10, 20, 40, 60} days, mean 20.5.
- **Trade structure.** Stop at 3 daily σ (about 2×ATR) and take-profit at +2R.
- **Price moves.** Overnight share of variance 35%, Student-t(3) gaps, idiosyncratic jumps about twice a year, and factor crash gaps.
- **Calibration check.** The trade model reproduces the empirical stop-out tails: mean 1.07R, P99 2.4R, against 1.05–1.08R and 2.1–2.6R in §2.2.
- **Costs:**
  - 0.03R round trip;
  - an extra 0.02R on stop fills;
  - 0.08R for option spreads.
- **"True s"** is the design net per-trade Sharpe. Realised values are slightly lower because of the market crash gaps: −0.02, 0.03, 0.08, 0.18 and 0.28.
- **The model over-claims.** It believes s_claim = s + 0.10; κ = 0.5 shrinks that back.

Each cell of the **v2 rule** table (✅ `results/portfolio_main.csv`) reads: *log growth a year over T-bills / P(losing year) / median 3-year max drawdown / power to detect the edge from P&L after 3 years (t-test, one-sided 5%).*

| Trades a year | s = 0 | s = 0.05 | s = 0.1 | s = 0.2 | s = 0.3 |
|---|---|---|---|---|---|
| 12 | −0.2% / 52% / 5.9% / 4% | 0.3% / 46% / 5.4% / 7% | 0.8% / 41% / 4.9% / 11% | 1.9% / 28% / 4.2% / 26% | 3.0% / 19% / 3.6% / 47% |
| 25 | −0.4% / 55% / 8.3% / 4% | 0.6% / 44% / 7.3% / 9% | 1.7% / 36% / 6.3% / 18% | 3.7% / 22% / 5.3% / 45% | 5.8% / 11% / 4.5% / 74% |
| 50 | −0.5% / 53% / 10.3% / 5% | 1.1% / 42% / 9.1% / 12% | **3.0% / 29% / 7.8% / 29%** | 6.5% / 13% / 6.2% / 67% | 10.4% / 5% / 5.1% / 94% |
| 100 | −0.7% / 56% / 12.3% / 6% | 1.9% / 41% / 10.4% / 20% | 4.6% / 26% / 8.9% / 41% | 10.5% / 8% / 6.8% / 86% | 16.4% / 2% / 5.6% / 99% |

- **Average risk per trade** falls as concurrency rises and the caps bind: 0.76% at 12 trades a year, 0.69% at 25, 0.59% at 50, 0.48% at 100.
- **Fixed 1% risk with no portfolio caps** doubles growth when the edge is real: 8.6% at N = 100, s = 0.1. Without an edge it produces a 20% drawdown in 36–76% of 3-year paths at 50–100 trades a year.
- **Time to detect** (analytic check: (1.645 + 0.842)² / s² trades, 80% power): 966 trades for a realised s of 0.08, 197 for 0.18, 82 for 0.28. At 50 trades a year that is **19, 3.9 and 1.6 years**.
- **What realistic edges look like.** Well-documented systematic effects traded on single instruments give per-trade Sharpe ratios of roughly 0.05–0.15 after costs. Example: time-series momentum on one futures market with an annual Sharpe of about 0.3–0.5, rebalanced monthly [unverified magnitude; Moskowitz, Ooi & Pedersen 2012]. A per-trade Sharpe of 0.2–0.3 would be exceptional and should be believed only after forward evidence.

### 2.6 How many trades a year should "few trades" mean?

Three forces set the answer:

- **Growth.** With a per-trade risk cap, growth is additive in positive-edge trades (§2.5).
- **Selection quality.** Taking fewer trades raises the average edge only if the system can rank candidates.
- **Learnability.** Power grows with N.

✅ `sim_selection.py` models the ranking problem directly:

- A scanner produces 250 (or 1,000) candidates a year.
- True net per-trade Sharpe s ~ N(μ₀, 0.05²).
- The model sees s + 0.05 (optimism) + noise.
- It shrinks with κ = 0.5, sizes at quarter Kelly under the cap, and sends a trade if Δg ≥ hurdle.

| Pipeline (candidates a year; mean true edge; skill = corr(estimate, truth)) | Max growth a year (trades at max) | Growth at 12 / 25 / 50 / 100 trades | True s of selected trades at 25/yr | Claimed s at 25/yr | Claimed ÷ true |
|---|---|---|---|---|---|
| A. 250; mean 0; strong skill (0.71) | 3.1% (110) | 0.9 / 1.5 / 2.4 / 3.1% | 0.062 | 0.174 | 2.8× |
| B. 250; mean 0; moderate skill (0.45) | 1.7% (110) | 0.5 / 0.9 / 1.4 / 1.7% | 0.040 | 0.247 | 6.2× |
| C. 250; mean 0; weak skill (0.24) | 0.7% (96) | 0.3 / 0.4 / 0.6 / 0.7% | 0.022 | 0.412 | **19×** |
| D. 250; mean +0.03; moderate | 6.5% (190) | 0.9 / 1.7 / 3.0 / 5.0% | 0.070 | 0.277 | 4.0× |
| E. 1,000; mean 0; moderate | 7.0% (414) | 0.7 / 1.3 / 2.2 / 3.7% | 0.053 | 0.312 | 5.9× |
| F. 250; mean +0.05 (proven edge); moderate | 10.4% (203) | 1.2 / 2.3 / 4.1 / 7.2% | 0.090 | 0.297 | 3.3× |

Reading it:

1. **At 12 trades a year, the pipelines capture 10–40% of their achievable growth.** At 25 trades it is 18–64%; at 50, 31–92%.
2. **The hurdle that captures 80% of the maximum is 4.5–13.5 bp a trade.** It corresponds to 38–211 trades a year, and 52–131 for the 250-candidate pipelines other than the weak-skill one.
3. **The winner's curse is severe.** Selected trades' claimed edges overstate their true edges 3–19×, and more so for weaker skill and higher hurdles.
   - κ = 0.5 is therefore an *upper* bound on what to expect after selection; κ̂ ≈ 0.3 is typical.
   - κ must be learned from resolved trades, and the paper phase exists partly to measure it (§5).
4. **P&L detection is hopeless for the average selected trade** (years to 80% power at the knee: 10–450). Only forecast scoring and the shadow book can teach the system (§6).
5. **The objectives conflict.** "Maximum % return" pushes toward 100–200 trades a year. "As few as possible" pushes toward ≤ 12. Around **25–50 trades a year** captures a meaningful share of the achievable growth in every pipeline, keeps concurrency below the caps, allows some learning (§2.5), and is about 2–4 emails a month.
   - Above 100 a year, the marginal trades' true edges approach zero and the caps bind (risk per trade falls to 0.48%).
   - Below 20 a year, the system is effectively a long-horizon system and should be run as one.

**Recommendation:**
- Target 25–50 new trades a year; hard cap 100 a year and 8 open at once.
- Per-trade hurdle Δg ≥ 6 bp, after shrinkage, costs and T-bills.
- Revisit the hurdle once, at the 12-month review, using the measured κ̂ and the paper book's frontier.

---

## 3. Execution when trading manually from a 22:17 ET email

### 3.1 The daily timeline (Eastern time)

| Time | Event | Who |
|---|---|---|
| 16:00 | US cash close (SPX options 16:15) | market |
| 22:17 (±GitHub cron delay; healthchecks.io dead-man switch, track 09) | Daily run: (1) simulate the paper fills of the previous night's orders from today's OHLC; (2) check exits (stop, target, time stop, invalidation); (3) new signals → NEW TRADE / EXIT emails, one GitHub issue per trade, ledger append | system |
| ~22:30–23:30 | Read the email and place **tomorrow's** orders tonight: DAY limit entries with attached brackets (§3.3). Comment "placed" or "skipped" on the issue | you |
| 08:47 | Pre-market check (track 09): re-price open trades; email only if something invalidates a trade before the open (e.g., a pre-announcement, or index futures beyond a set move) | system |
| 09:30 | Opening auctions. Queued DAY limit orders execute at or near the open when marketable | market |
| 10:00–15:30 | Option entries, working a limit ladder (§3.3). Stock, ETF and futures brackets need no attention | you (options only) |
| 10:17 | Option-fill job: snapshot of CBOE delayed quotes (about 10:02) → simulated paper fills for option orders | system |

**Your job is about 5–10 minutes each evening a trade arrives.** The design never needs you to watch the open, except for option entries.

### 3.2 What the overnight delay costs

✅ `latency.py`, 2005–2026. Adjusted data, so ex-dividend nights count as total return.

| Universe | Overnight log return, % a year | Intraday log return, % a year |
|---|---|---|
| 16 ETFs (median) | 9.75 | 1.24 |
| 30 large caps (median) | 9.14 | 4.53 |
| SPY | 7.95 | 2.44 |

This is the well-known "night and day" pattern: most of the equity premium accrues overnight (Cliff, Cooper & Gulen 2008; Lou, Polk & Skouras 2019 [citations from memory, unverified]). An email that arrives after the close and is executed at the next open **misses the first night of every trade**.

**First-night cost of signals known at the close** (long signals):

| Universe | Signal | Events | First night (bp) | t | 10-day return from the close (bp) | …from the next open (bp) | Share kept |
|---|---|---|---|---|---|---|---|
| 16 ETFs | 20-day-high breakout | 7,390 | +3.6 | 4.8 | 27.1 | 23.6 | 87% |
| 16 ETFs | 3-day drop > 2σ (reversal) | 2,118 | **+17.8** | 5.5 | 36.5 | 18.8 | **51%** |
| 16 ETFs | 1-day drop > 2.5σ (reversal) | 1,644 | **+17.0** | 5.0 | 27.1 | 10.1 | **37%** |
| 16 ETFs | Cross above 200-day average | 1,339 | −2.0 | −1.0 | 8.9 | 10.9 | 123% |
| 30 large caps | 20-day-high breakout | 12,618 | +2.7 | 2.7 | 45.8 | 43.2 | 94% |
| 30 large caps | 3-day drop > 2σ (reversal) | 4,165 | +16.5 | 6.0 | 52.3 | 35.8 | 68% |
| 30 large caps | 1-day drop > 2.5σ (reversal) | 2,986 | +9.1 | 2.6 | 38.3 | 29.1 | 76% |
| Both | Every day (baseline) | — | +3.6 / +4.1 | 12 | 38 / 56 | 35 / 52 | 91–93% |

**Bitcoin between the email and a morning execution** (✅ hourly bars, 721 nights, 22:00 → 09:30 ET):
- standard deviation 1.28%;
- |move| > 2% on 12% of nights, > 4% on 0.8%;
- 5th/95th percentiles −2.0% / +2.2%.

**Implications:**

1. **Short-term reversal ("buy the sharp drop") archetypes lose half or more of their edge to the delay.** Trend, breakout and drift archetypes lose about 6–13%.
2. **Backtests and paper fills must enter at the next open,** or at the 10:00 quote snapshot for options. A backtest entered at the signal close overstates reversal edges by 1.3–2.7×.
3. **Default minimum holding period: 5 trading days.**
   - A 1–4-day trade is allowed only for event archetypes whose edge is shown on next-open fills.
   - ✅ `sizing_v2.py`: a 1-day trade needs a *shrunk* per-trade Sharpe of about 0.2 to clear the 6 bp hurdle.
4. **Crypto and futures trade overnight, but the user acts the next morning,** so entry bands are ±2–3% for BTC. Acting immediately at 22:20 is allowed for crypto and futures if you prefer; the paper fill model then uses the price at the email's timestamp plus costs.

### 3.3 Order types by instrument, and what can be pre-placed

| Instrument | Entry | Protective exit | Profit exit | Time stop | Pre-placeable the evening before? |
|---|---|---|---|---|---|
| **US stocks / ETFs** | **DAY limit at the band edge**: buy limit = close + 1.5 × daily σ; sell-short limit = close − 1.5σ. It works at the open; if the open is beyond the limit it does not fill (a skip). MOO/LOO orders are acceptable where offered (Nasdaq MOO entry closes 09:28, LOO 09:29:59; NYSE until the stock opens 🔎) | **Stop-market GTC** at 2×ATR, **not stop-limit**: a stop-limit can fail to execute in a gap, and a stop's trigger price is not its execution price (SEC Investor Bulletin on stop orders 🔎) | GTC limit at the target, **OCO with the stop** | EXIT email the evening before: cancel the OCO and sell at the open (DAY limit at bid − 1σ, or MOO) | **Yes, fully:** entry + OTOCO bracket. Fidelity offers OTO/OCO/OTOCO for stocks and single-leg options (🔎 Fidelity conditional orders); IBKR and Schwab offer brackets [unverified] |
| **Listed options** (defined risk: debit spreads, long options) | **After 10:00 ET**: limit starting at the mid, raised by ¼ of the spread every 10 minutes, capped by a **limit ladder** in the email (maximum price at 3–5 underlying levels, from the model price plus a spread allowance). Track 04 liquidity gates apply | **No stop orders on options.** They trigger on noisy quotes with wide spreads. The structure's maximum loss is the stop. Invalidation and time stops come by EXIT email and are based on the underlying's close. A contingent order on the underlying's price is acceptable where the broker offers it (Fidelity "contingent" 🔎) | GTC limit on the whole spread (e.g., 70–80% of the maximum value) | EXIT email; close ≥ 5 trading days before expiry; never hold an in-the-money short leg of an American-style option through an ex-dividend date (early-assignment risk [unverified detail]) | **Partly:** the take-profit only (multi-leg orders usually cannot join an OCO) |
| **Index futures** (MES, MNQ, M2K; micro Bitcoin MBT) | Limit at the regular-session open, or any time on Globex (open Sunday 18:00 to Friday 17:00 ET, with a daily 17:00–18:00 break [unverified exact hours]) | Stop-market GTC. It works overnight on Globex, so gap-through risk sits mainly at the Sunday open and the daily break | GTC limit, OCO | EXIT email; never hold into the last trading day; the contract month and roll date are in the email | **Yes, fully:** futures platforms support brackets |
| **Bitcoin ETF** (IBIT) | As for ETFs; entry band ±2–3% | Stop-market GTC, but it cannot trigger over the weekend. Stress multiple 3.1 (§2.2) | GTC limit, OCO | EXIT email | **Yes**, with weekend gap risk accepted and sized |
| **Direct crypto** (regulated US exchange) | Limit, maker if possible. Kraken Pro 30-day-volume tiers: $0+: 0.40% maker / 0.80% taker; $10k+: 0.22% / 0.38%; $50k+: 0.15% / 0.30% (📄 fee schedule, 2026-09-28) | Exchange stop-market orders trigger around the clock (no weekend gap) but can slip in flash crashes | Limit, OCO where the exchange supports it | EXIT email | **Yes** (24/7 stops) |

**Cost comparison for a 20-day Bitcoin trade** (✅ arithmetic):
- **Direct at Kraken Pro** ($10k tier, taker both ways): about 0.76% plus spread.
- **IBIT:** about 0.02–0.04% (a 1–2 bp spread each way, plus 20/252 of a 0.25% expense ratio [unverified ratio]).
- **CME micro futures:** commission a few dollars [unverified]; §1256 tax.

Direct crypto is therefore worth it only for trades whose risk is dominated by weekend moves, or to use the 24/7 stop.

### 3.4 Gaps: pre-decided rules

| Situation | Rule |
|---|---|
| Open outside the entry band | No entry. The DAY limit simply does not fill; comment "skipped: band". The paper book records a skip (3–7% of entries at ±1.5σ, table below). **Never chase later in the day unless an ADJUST email says so.** |
| Gap through the target | The GTC take-profit limit fills at the better opening price. Accept. |
| Gap through the stop | The stop-market fills at or after the open. **Do not cancel it hoping for a rebound.** The loss was sized at the P99 multiple. |
| Gap through a defined-risk trade's "stop" | Nothing to do. Maximum loss is capped; follow the EXIT email. |
| Scheduled earnings or event inside the holding period (single stocks) | Stop-based trades exit before the event (EXIT email the evening before) or are not entered. Otherwise use a defined-risk structure. |
| Weekend on a Bitcoin ETF | Accept at a stress multiple of 3.1, or use spot with a 24/7 stop, or exit on Friday. |
| Trading halt / limit-up-limit-down pause | Stops cannot trigger while halted and reopen at the auction price [general knowledge]. Sized for by the P99.9 column of §2.2. |

**Entry-band skip rates** (✅ `results/entry_band_skip_rates.csv`): share of next opens outside close ± k × daily σ.

| Group | ±0.5σ | ±1σ | **±1.5σ** | ±2σ |
|---|---|---|---|---|
| Broad/sector ETFs | 35% | 10.4% | **3.3%** | 1.3% |
| Rates/commodity ETFs | 44% | 15.1% | **5.1%** | 2.0% |
| Large caps | 27% | 7.1% | **2.8%** | 1.5% |
| High-vol stocks | 20% | 5.6% | **2.6%** | 1.6% |
| Bitcoin ETFs | 44% | 16.4% | **6.8%** | 3.5% |

### 3.5 Partial fills, corporate actions and order expiry

- **Partial fills.**
  - Stocks and ETFs: keeping each order ≤ 1% of average daily volume (synthesis §3.3) makes partials rare. If an order is still partial at the end of the entry day, keep the partial, cancel the rest, and make sure the bracket quantity equals the filled quantity (not every platform resizes child orders automatically [unverified]). Record the actual fill on the issue.
  - Options: partial fills are common. The unfilled rest follows the limit ladder until 15:30, then is cancelled.
  - The paper fill model mirrors these rules (§5.1): no fills beyond the displayed size, and at most 1% of the day's volume.
- **Corporate actions.**
  - FINRA Rule 5330 reduces open **buy limit and sell stop** orders by the dividend amount on the ex-date, unless they are marked "do not reduce". Reverse splits cancel them (📄 FINRA 5330).
  - Brokers may also cancel GTC orders on corporate actions [unverified, broker-specific].
  - The daily run checks the ex-dividend and split calendar for every open position and re-sends bracket levels in an ADJUST email when needed.
- **Order expiry.** Fidelity and Schwab GTC orders expire after 180 calendar days (🔎); IBKR's persist (🔎). That never binds for ≤ 60-day trades.
- **Settlement.** In a cash account, only **settled cash** funds new entries (§4.1). The daily run tracks settled cash from the fills you record.

### 3.6 The execution block every NEW TRADE email should carry

The layout follows track 11 §4. The numbers below are **illustrative placeholders, not a recommendation**.

```
DO THIS TONIGHT (about 5 minutes; you do not need to watch the open)
1. Account: IRA-1 (this ticker is assigned to IRA-1 - see "account placement")
2. BUY 25 XLE, LIMIT $97.40, DAY  - enter it tonight; it will work at tomorrow's open.
   Entry band $92.10-$97.40. If XLE opens above $97.40 the order will not fill: do nothing.
3. Attach a bracket (OTOCO / "one triggers OCO"):
     SELL 25 XLE STOP $91.10, GTC   (stop-market, NOT stop-limit)
     SELL 25 XLE LIMIT $103.60, GTC
   No bracket at your broker? Place both GTC orders right after the fill; when one fills, cancel the other.
4. Time stop Thu 23 Oct: you will get an EXIT email the evening before.
5. Record: comment "filled 25 @ <price>" or "skipped" on issue #123 by tomorrow evening.
Planned loss at the stop $150 (0.15%) | gap-adjusted stress $255 (0.26%) | adds about 8 bp to expected growth
Paper phase: this is a PAPER trade unless you have been told the pilot has started.
```

---

## 4. Rules and taxes (status on 28 September 2026; US federal; not tax advice)

### 4.1 Rule status

| Rule | Status | What the system must do | Source |
|---|---|---|---|
| **Pattern day trader** ($25k minimum; 4 day trades in 5 days) | **Replaced** by FINRA Rule 4210 intraday margin standards. SEC approval 2026-04-14 (Release No. 34-105226); **effective 2026-06-04**; firms may phase in **until 2027-10-20**. Day-trade counting and the $25k minimum are gone. Firms compute intraday margin deficits. If deficits are not met by the 5th business day, the customer is restricted from increasing debits or shorts for 90 calendar days. The notice does not change cash accounts | For 1–60-day trades a day trade happens only when a stop hits on the entry day. Record each broker's implementation date in `account.yaml`; until it switches, keep ≥ $25k in a margin account or count day trades | 📄 FINRA Regulatory Notice 26-10 |
| **Settlement** | T+1 for most securities since 2024-05-28 | Sale proceeds count as settled the next business day | 📄 SEC 2023-29 (track 09) |
| **Cash-account violations** | Reg T §220.8: a security sold before being fully paid for → the "privilege of delaying payment" is withdrawn **for 90 days**. Broker policy (Fidelity): 3 good-faith violations or 3 cash-liquidation violations in 12 months → 90-day settled-cash-only restriction; **1 free-riding violation** is enough | New entries only from settled cash. Never let a position bought with unsettled proceeds be sold (for example stopped out) before those proceeds settle | 📄 12 CFR 220.8 (LII); 📄 Fidelity, "Avoiding cash account trading violations" |
| **Short-term gains** | Held ≤ 1 year → ordinary income rates | Every trade here, except §1256 contracts | 📄 IRS Topic 409 (track 09) |
| **Section 1256** | Regulated futures and **non-equity** (broad-based index) options: **60% long-term / 40% short-term whatever the holding period**, marked to market at year-end. "Equity options" (single stocks, narrow indices) are excluded. ETF options such as SPY, QQQ and IBIT are generally treated as equity options (track 09 ⚠️) | Prefer MES/MNQ/M2K, XSP/SPX options and CME Bitcoin futures in taxable accounts. CME Bitcoin futures' §1256 status follows from "regulated futures contract" [unverified; confirm] | 📄 26 U.S.C. §1256 (LII) |
| **Wash sales** | Loss disallowed if substantially identical stock or securities, **or a contract or option to acquire them**, are bought within 30 days before or after the sale. The loss is added to the new lot's basis. **An IRA or Roth IRA purchase makes it permanent** (the basis is not increased). §1091 does not apply to §1256 losses recognised by the year-end mark-to-market | Track wash sales across **all** accounts, including a spouse's (brokers match only within an account [general knowledge]). See §4.3 | 📄 IRS Pub. 550 (2025); 🔎 Rev. Rul. 2008-5 (irs.gov PDF); 📄 §1256 |
| **Crypto held directly** | Property, not a security (IRS Notice 2014-21 [not re-fetched]). **§1091 does not apply in 2026.** The One Big Beautiful Bill Act did not change that; a Senate digital-asset tax bill (2025) and a House discussion draft (December 2025) would, and neither is law as of mid-2026. Spot Bitcoin **ETFs are securities**, so the wash-sale rule applies to them | Loss harvesting on spot crypto is legal today but watch the bills. Immediate buy-backs carry economic-substance risk [judgment]. Treat spot BTC and IBIT as possibly substantially identical [unverified] | 🔎 Gordon Law Group (2026-05-15) and several CPA-firm summaries |
| **Form 1099-DA** | Gross proceeds reported from the 2025 tax year; cost basis for digital assets acquired from 2026-01-01 in custodial accounts | Keep own lot records (the ledger) | 📄 IRS 1099-DA pages (track 09) |
| **§475(f) mark-to-market trader election** | Needs trader status: seeking profit from daily moves; substantial activity; continuity and regularity. The IRS looks at holding periods, trade frequency and dollar amounts, time devoted, and livelihood. **Election due by the original due date of the prior year's return** (e.g., 15 April 2027 for 2027); new taxpayers within 2 months 15 days. Effects: ordinary gains and losses, **no wash-sale rule, no $3,000 capital-loss limit**, not subject to self-employment tax. Revocation needs a notice plus Form 3115 by the same kind of deadline | See §4.4 | 📄 IRS Topic 429 (page reviewed 2026-09-24) |

### 4.2 After-tax growth by account and instrument

✅ `tax_compare.py`:
- 10 years; the sleeve's annual log return ~ N(g, 6%);
- capital losses net against gains; net losses deduct $3,000 a year against ordinary income, with carry-forward;
- §1256 loss carry-back ignored (conservative for §1256);
- IRA = Roth, or traditional at the same tax rate going in and out.

| Pre-tax growth | Profile (marginal ordinary / long-term, including NIIT) | Taxable, short-term | Taxable, **§1256** | Taxable, 475(f) | **IRA** |
|---|---|---|---|---|---|
| 5% | 24% / 15% | 3.9% | 4.2% | 3.9% | 5.1% |
| 5% | 38.8% / 18.8% | 3.2% | **3.8%** | 3.2% | 5.1% |
| 5% | 40.8% / 23.8% | 3.1% | 3.6% | 3.1% | 5.1% |
| 10% | 38.8% / 18.8% | 6.5% | **7.7%** | 6.5% | 10.5% |
| 2% | 38.8% / 18.8% | 1.2% | 1.6% | 1.3% | 2.0% |

- **Blended §1256 rates:** 18.6%, 26.8% and 30.6% against 24%, 38.8% and 40.8% short-term. That saves **$5.4–$12.0 per $100 of gain**.
- **The IRA is worth the most:** the full pre-tax growth.
- **475(f) only helps in losing years.** Its unlimited ordinary loss deduction adds 0.04–0.12 points a year at 2% growth (more for larger accounts, where the $3,000 limit binds) and almost nothing at 5–10%.

### 4.3 Wash sales under frequent trading

✅ `tax_compare.py`: 50 blocks × 20 years of simulated trading. A "wash sale" is any other purchase of the same underlying within ±30 calendar days of a losing taxable exit.

| Trades a year | Distinct underlyings | Losing exits that are wash sales | …with 30% of trades in an IRA: **permanently lost** | …deferred past 31 Dec |
|---|---|---|---|---|
| 25 | 10 | 34% | 12% | 1.6% |
| 50 | 5 | 80% | **39%** | 4.8% |
| 50 | 10 | **56%** | **22%** | 3.1% |
| 50 | 25 | 28% | 9% | 1.3% |
| 100 | 10 | 81% | 39% | 4.8% |
| 100 | 50 | 28% | 9% | 1.3% |

- **In taxable accounts, wash sales mostly *defer* losses.** The basis moves to the replacement lot, and the loss comes back when that lot is sold, which is usually within weeks. They distort annual tax only around 31 December (1–5% of losing exits).
- **Across a taxable account and an IRA, they destroy losses.** This is the costliest tax mistake a frequent trader can make, and brokers will not catch it. The fix is structural (§4.5).

### 4.4 Mark-to-market trader status (475(f)): pros and cons

| Pros | Cons |
|---|---|
| Losses fully deductible against ordinary income (no $3,000 limit) | Needs *trader status*. 25–100 trades a year held 1–60 days sits poorly with "substantial, regular, continuous" and "profit from daily market movements". Courts have generally denied status at a few hundred trades a year with multi-week holds [unverified; get professional advice] |
| No wash-sale rule on the elected securities | All gains ordinary, forever: no long-term rate on anything inside the elected business, which is irrelevant here but binding if habits change |
| Clean annual accounting (year-end mark-to-market) | Sticky: revocation needs a timely notice plus Form 3115. The election for 2026 has already lapsed (due 15 April 2026); the earliest is 2027 |
| Business-expense deductions if the trading is a business | Audit exposure; state treatment varies [unverified] |

**Verdict: do not plan on 475(f).** At the recommended 25–50 trades a year the status is doubtful. §4.2 shows it adds almost nothing to a profitable sleeve. Account placement and §1256 instruments capture most of the tax value without it.

### 4.5 Account and instrument placement rule

1. **Assign each underlying to exactly one account family,** recorded in `account.yaml` and enforced by the risk gate. This eliminates IRA-induced permanent wash sales.
   - **IRA:** stock and ETF trades, equity-option spreads (defined risk only, no margin) and the Bitcoin ETF.
   - **Taxable:** §1256 instruments (micro index futures, XSP/SPX options, CME Bitcoin futures) and direct crypto.
2. **Prefer §1256 instruments** for index exposure in taxable accounts.
3. **Constraints to check before assigning:**
   - IRAs cannot short or use margin;
   - futures in IRAs are available only at some brokers [unverified];
   - direct crypto in an IRA needs specialised custodians [unverified].
4. **Before any taxable loss sale,** the risk gate checks for purchases of the same underlying (including its options) in any account 30 days either side. In December it warns about year-end deferral.

---

## 5. The paper-trading protocol

### 5.1 Fill simulation (fill model v1.0, `paper_protocol.FillModel`; frozen, versioned, hashed in the constitution record)

**When fills are computed.** Paper fills are computed **after the fact** by the next 22:17 run, from that day's OHLC (options: from the 10:17 quote snapshot). They are appended to the ledger. Your own fills in a broker practice account are recorded separately (§5.2) and never replace them.

| Instrument | Entry | Exit | Costs | Refusals / size limits |
|---|---|---|---|---|
| **Stocks / ETFs** | **Next session.** MOO: open × (1 + slippage by tier: ETF 3 bp, large cap 5 bp, mid cap 12 bp, small cap 25 bp). Limit: fills at the open (open + slippage, capped at the limit) when the open is better than the limit. Otherwise only if the day's low **trades through the limit by ≥ 1 tick** — a touch is not a fill. Open outside the band → skip | **Stop:** if the open is beyond the stop, the open × (1 − 10 bp); else the stop × (1 − 10 bp). **Take-profit limit:** at the open if gapped through, else only on a 1-tick trade-through. **If stop and target are both touched in one bar, the stop comes first.** Time stop: next open with MOO slippage | Commissions per `account.yaml` (usually $0) | ≤ 1% of the day's volume; the rest unfilled |
| **Listed options** | **Snapshot ≥ 30 minutes after the open:** buys at mid + **0.6** × half-spread (Muravyev & Pearson 2020: all traders pay about 58% of the quoted half-spread, algorithmic traders about 30%); sells mirror it. Refused if the spread > 10% of mid (track 04's 2%/5% gates are applied earlier) | Same rule at the exit snapshot; expiry at intrinsic value (cash-settled index options) | $0.65 per contract per side [unverified; typical retail] | **Never more than the displayed size at the touch**; the rest retried at the next snapshot |
| **Futures (micro)** | Regular-session open ± 1 tick | Stop: the worse of the stop and the open ± 2 ticks, using full-session (overnight included) highs and lows | $1.25 per contract per side [unverified] | Whole contracts only |
| **Crypto (direct)** | Price at 09:30 ET (or at the email's timestamp if acted on at once) ± (2 bp half-spread + 5 bp slippage) + taker fee (0.38% at the Kraken Pro $10k tier 📄) | Same; stops use the hourly low/high, 24/7 | Taker fee on both legs | ≤ 1% of hourly volume [judgment] |

**Self-test** (✅ `results/fill_model_selftest.csv`):
- a buy limit at 98.90 against a day low of 98.90 → **no fill**;
- stop and target both touched → **stop**, at 99.40 with 10 bp slippage;
- 10 option contracts wanted against an ask size of 7 → **7 filled** at 2.08 (bid 2.00 / ask 2.10);
- a $0.50 / $0.70 option market (spread 33% of mid) → **refused**;
- an MES stop at 4,990 after an opening gap to 4,980 → fill at **4,979.50**;
- a $5,000 crypto buy → $19 fee plus 7 bp.

### 5.2 Recording decisions immutably

1. **Ledger.** Track 10's append-only, SHA-256 hash-chained JSONL ledger (`ledger.py`) is used unchanged.
   - Every candidate in the paper book, and its forecasts and planned orders, is written **before** the next open.
   - Paper fills and resolutions come later, as new records.
   - ✅ Demo (`results/paper_ledger_demo.csv`): editing one stored forecast from 0.56 to 0.95 breaks verification ("line 2: content hash mismatch").
2. **Nightly write order:**
   1. yesterday's paper fills (fill model v1.0);
   2. resolutions;
   3. new recommendations, forecasts and orders;
   4. email carrying the ledger head hash;
   5. push to the protected `ledger` branch.
3. **Witnesses outside the repository:**
   - every Gmail message carries the head hash, and Google's timestamps are outside the system's control;
   - GitHub push timestamps;
   - optionally, a daily OpenTimestamps proof of the head hash [optional; tool not tested here].
4. **The fill model is part of the constitution.**
   - Its version and parameters are hashed.
   - Changes happen only at a quarterly review, never retroactively: past trades keep their original fills, and a re-score under the new model is shown alongside.
5. **Two execution streams.**
   - The official paper P&L comes from the fill model.
   - Your broker practice-account fills (paper account at IBKR, thinkorswim or similar [unverified availability]) are `execution` records with `paper: true, source: practice_account`.
   - The gap between the two streams measures the human implementation shortfall (Perold 1988).
6. **The "wide book".**
   - The paper book holds **every** rule trigger that clears Δg ≥ 0, not just the ones above the 6 bp live hurdle. The live-hurdle subset is flagged "selected".
   - The selected subset is the official paper result; the rest is the deterministic shadow book (§6).
   - Selection alpha (selected minus the rest, paired by month) is measured, not assumed.

### 5.3 Paper-trading optimism: sources and countermeasures

| Source of optimism | Size (evidence) | Countermeasure in v1 |
|---|---|---|
| Limit order "filled" because the price touched it | ✅ Overstates the 5-day return per filled trade by **1.4–5.6 bp** (ETFs and large caps, limits 0.5–1% below the close); fill rates 28–62% | Fill only on a 1-tick trade-through |
| Adverse selection of passive limit entries | ✅ The 34–72 bp price improvement is mostly given back: filled days are the weak days. Per signal, a limit 0.5–1% below the close captured **38–57%** of what a market-on-open entry captured | Paper uses exactly the order the email specifies; archetype backtests use the same order type |
| Options filled at mid | Retail-style traders pay about 58% of the quoted half-spread (Muravyev & Pearson 2020) | Mid + 0.6 × half-spread; never beyond the displayed size; wide spreads refused |
| Entry at the signal's close | ✅ Overstates short-term reversal edges 1.3–2.7× (§3.2) | Next-open entries only (options: 10:00 snapshot) |
| Stops filled at the stop price | ✅ 16–31% of stop-outs gap through; P99 loss 1.7–3.1R (§2.2) | Gap-through fills at the open; stop-first on ambiguous bars |
| No human frictions (skips, late or wrong orders; selling winners too early and riding losers — the disposition effect, Shefrin & Statman 1985; Odean 1998 [from memory]) | Unknown until measured | Practice-account execution in parallel; skip rate and implementation shortfall reported monthly; brackets pre-committed |
| Hypothetical money changes behaviour: people choose differently with hypothetical than with real stakes (Holt & Laury 2002 [from memory]) | Unknown | The pilot at 25% size is the real behavioural test (§5.5) |
| Editing history or dropping bad trades | — | Hash-chained ledger; the wide book logs every candidate before resolution; annulments only by pre-registered rules |
| Winner's curse in selection | ✅ Claimed edges of selected trades 3–19× the true edges (§2.6) | Measure κ̂ and size with it; report "claimed vs realised" for every archetype |
| Look-ahead in data or the model | Documented for LLMs (track 10 §5.2) | Point-in-time snapshots stored before the LLM runs; only post-cutoff forward data counts |
| T-bills and taxes ignored | T-bill drag ≈ half of a 10-day ETF swing edge (§2.1); tax 19–41% of each gain (§4.2) | Paper P&L reported **net of T-bills**, with an estimated tax line per account placement |

### 5.4 How long, how many trades, and the pass/fail rule

**Pre-registered go-live rule.** It is evaluated **only** at months 3, 6, 9 and 12, and the first look that passes starts the pilot. All six conditions must hold:

1. **Sample:** ≥ 3 months **and** ≥ 30 resolved trades in the selected paper book.
2. **Operations:**
   - ≥ 95% of scheduled runs on time;
   - zero sent emails failing the number/slot validator;
   - the ledger verifies;
   - ≥ 90% of trade emails handled in the practice account (placed or knowingly skipped) the same evening.
3. **Execution realism:** practice-account fills differ from the fill model by ≤ 10 bp on average for stocks/ETFs and ≤ 20% of the half-spread for options. Otherwise make the model more conservative and restart the looks.
4. **Edge:** posterior **P(s > 0) ≥ 0.7** for the selected book's net per-trade R, net of the fill model and T-bills, under a sceptical N(0, 0.1²) prior on the per-trade Sharpe.
5. **Calibration:** no *gross* bias. The 90% interval of (hit rate − mean stated P(profit)) must contain a value within ±20 points. A narrower *warning* (the interval excludes 0) forces recalibration of the LLM overlay before go-live, but does not fail the rule.
6. **Risk:** paper maximum drawdown < 15%.

If the rule has not passed by month 12, extend by at most 6 months, and only if P(s > 0) ≥ 0.5 and operations pass. Otherwise **fail**: return the archetypes to research. Do not loosen the rule after seeing the data.

**Operating characteristics** (✅ `paper_protocol.oc_simulation`, 4,000 histories per cell; 20-day stop-based trades from the trade model). Each cell reads *P(go live by month 6) / by month 12*:

| Paper trades a year | s = −0.05 | s = 0 | s = 0.05 | s = 0.1 | s = 0.2 | s = 0.3 |
|---|---|---|---|---|---|---|
| 25 | 0% / 2% | 0% / 3% | 0% / 4% | 0% / 5% | 0% / 10% | 0% / 14% |
| 50 | 1% / 13% | 2% / 22% | 4% / 33% | 6% / 46% | 10% / 73% | 13% / 90% |
| 100 | 11% / 18% | 18% / 32% | 29% / 50% | 42% / 69% | 70% / 92% | 88% / 99% |
| 200 (wide book) | 15% / 21% | 29% / 41% | 48% / 66% | 65% / 84% | 90% / 99% | 99% / 100% |

The threshold trades false passes against true passes (100 trades a year, P(go live by month 12)):

| Threshold P(s > 0) ≥ | s = −0.05 | s = 0 | s = 0.1 | s = 0.2 |
|---|---|---|---|---|
| 0.5 | 48% | 65% | 91% | 99% |
| **0.7** | 18% | 32% | 69% | 92% |
| 0.9 | 1% | 5% | 22% | 61% |

**Value of the pilot year** (✅ `paper_pilot_value`). Sceptical prior over the true edge: 20% s = −0.05, 20% s = 0, 30% s = 0.05, 20% s = 0.1, 10% s = 0.2. The pilot trades at 0.2% risk per trade.

- **Threshold 0.7:**
  - P(go live by month 12) = 33% at 50 trades a year, 48% at 100, 59% with the wide book.
  - **P(no edge | went live) = 21%.**
  - Expected pilot-year value: +37 / +103 / +121 bp of log growth.
- **Threshold 0.9:**
  - P(no edge | went live) = 6–9%.
  - Pilot value +9 / +49 / +86 bp.
- **Threshold 0.5:** 30% of go-lives have no edge.

**0.7 is recommended** because the pilot is small: a false go-live costs a few basis points, and a false "no" delays a real edge by a year.

**What the calibration gate can see** (month 12; each cell reads *P(warning) / P(gate fails)*):

| Stated minus true P(profit) | 50 trades a year | 100 | 200 |
|---|---|---|---|
| 0 (calibrated) | 11% / 0% | 11% / 0% | 10% / 0% |
| +10 points | 57% / 0% | 82% / 0% | 98% / 0% |
| +15 points | 86% / 1% | 99% / 0% | 100% / 0% |
| +25 points | 100% / 23% | 100% / 37% | 100% / 57% |
| +35 points | 100% / 86% | 100% / 99% | 100% / 100% |

**What the tables show:**

- **Paper trading can prove operations and execution, and catch gross calibration errors, negative edges and broken cost models.** It **cannot** prove a per-trade edge of 0.05–0.1 within a year.
- **At 25 trades a year the 30-trade minimum is not even reached within 12 months.** The wide book (100–200 paper trades a year) is what makes a 3–12-month paper phase informative.
- **The honest answer to "prove the system first":** 3–12 months of paper trading establishes that the machine works and that its edge is *not obviously absent*. Proof of an edge accrues over the next 2–4 years, through the size ramp in §5.5.

### 5.5 From paper to live: the size ramp

| Stage | Risk per trade (share of the v2 target) | Condition to enter | Demotion |
|---|---|---|---|
| Paper | 0 | Start (the system sends real emails marked PAPER) | — |
| **Pilot** | **25%** (about 0.12–0.2% of equity at risk per trade) | The go-live rule in §5.4 | Back to paper if the live drawdown exceeds 10%, if operations gates fail two months running, or if P(s > 0) falls below 0.5 |
| Half size | 50% | ≥ 6 months and ≥ 30 live trades; P(s > 0) ≥ 0.8, pooling live trades with paper trades at half weight; implementation shortfall ≤ 20% of the paper edge; κ̂ ≥ 0.2 | Governor; back to pilot on any demotion trigger |
| Full size (k = 0.25) | 100% | ≥ 100 resolved trades (paper at half weight); P(s > 0) ≥ 0.9; calibration verified (calibration-in-the-large within ±5 points, slope interval includes 1) | Governor; temporary halving of k at a 15% drawdown, restored after 3 months below 5% (per track 12 M7) |
| k above 0.25 | +0.05 a quarter at most, up to 0.5 | Synthesis §3.4 conditions: ≥ 100 resolved trades, verified calibration; plus κ̂'s 80% lower bound ≥ 0.5 | Same |

---

## 6. The monthly calibration loop at short horizons

### 6.1 What can be learned monthly, quarterly, annually

**Minimum detectable effects** (✅ `calibration_cadence.py`; 80% power, one-sided 5%). Assumptions:
- 3 forecasts per trade with a design effect of 1.8;
- 2 fills per trade;
- a deterministic shadow family of S signals a year.

| Question (evidence) | 20 trades a year: 3 m / 12 m | 50 trades a year: 1 m / 3 m / 12 m | 100 trades a year: 3 m / 12 m |
|---|---|---|---|
| Is there an edge? (P&L, per-trade Sharpe) | 1.11 / 0.56 | 1.22 / 0.70 / **0.35** | 0.50 / 0.25 |
| Is the LLM overlay biased? (calibration-in-the-large, points) | 43 / 22 | 47 / 27 / **14** | 19 / 10 |
| Are rule base rates drifting? (shadow family, S = 250 / 1,000 a year) | 15.7 / 7.9 — 7.9 / 3.9 | 27 / 16 / 8 — 14 / 8 / **4** | same |
| Are fills as modelled? (ETF slippage bias, bp; fill s.d. 10 bp) | 7.9 / 3.9 | 8.6 / 5.0 / **2.5** | 3.5 / 1.8 |
| Option fills (bias as % of the half-spread; s.d. 25%) | 19.7 / 9.8 | 21.5 / 12.4 / 6.2 | 8.8 / 4.4 |
| Am I executing the emails? (skip rate vs 0%, points) | 45 / 14 | 51 / 21 / 5.8 | 11 / 3.0 |

Two further checks need more data:

- **Over-confidence** (✅ simulated logistic fits). A true calibration slope of 0.6 is detected with 59% power from 150 forecasts, 82% from 300 and 97% from 600. That is 1–2 years at 50 trades a year for the overlay's live forecasts. A slope of 0.8 needs well over 1,200.
- **A dead edge** (✅ CUSUM, ≤ 10% false alarms in 3 years). Median time to alarm after the edge vanishes:
  - s = 0.2: 22 months at 50 trades a year, 15 months at 100;
  - s = 0.1: 32–53 months;
  - s = 0.3: 9–21 months.

**So the cadence is:**

| Cadence | What the loop may learn and change | What it must not do |
|---|---|---|
| **Monthly** | Operations: runs, data freshness, validator, ledger. Execution: slippage by instrument, skip rate, latency. Rule compliance. Drawdown vs its band. Evidence meters (e-process on monthly means). Reconciliation with broker exports | Change any strategy parameter; judge edges on P&L |
| **Quarterly** (pre-registered looks) | Cost-model update, only toward conservatism unless ≥ 60 fills support a cut. κ̂ update (normal-normal, prior N(0.35, 0.15²)). Calibration-in-the-large warnings. Shadow base-rate drift for families with ≥ 150 resolved signals. Gated Platt maps (track 10) for shadow families. Go-live / ramp decisions | More than one change per parameter; any change without a forward shadow comparison |
| **Annually** (with you) | Calibration slope; archetype retirement or promotion (CUSUM or thesis invalidation); hurdle and trade-budget review against the measured frontier; tax review | Raising risk limits after a lucky year (track 10 guardrails) |

### 6.2 Track 10's rules and track 12's minimum viable loop, re-tuned for 1–60 days

| Item | Track 10 / 12 (long horizon) | Short-horizon v1-S (this track) | Why |
|---|---|---|---|
| Forecasts per trade | ≥ 6 (track 10); 3 (track 12 MVL) | **3, all mechanical, all resolving by the time stop:** P(profit at the time stop), P(target before stop), P(stop hit by the time stop). Plus a 10/50/90% quantile of the R-multiple (optional, for PIT checks) | Six sub-forecasts are worth about 2 observations (ICC ≈ 0.4); horizons ≤ 60 days make every question resolve within a quarter |
| Shadow book | Top-30 rejects + 10 random controls with LLM forecasts (track 10); deterministic, monthly (track 12) | **Deterministic, daily: every rule trigger with Δg ≥ 0 gets base-rate forecasts and fill-model paper fills** (the wide book). The LLM annotates at most the day's top 5 | Short horizons give 250–1,000 resolved shadow signals a year per family at almost no LLM cost |
| Gym | 200 LLM questions a month (deferred by track 12) | **Not built.** The wide book *is* the gym, and its questions mirror real decisions | Removes the transfer problem (track 12 M6) |
| Platt / isotonic maps | Platt from 150 resolved per family; isotonic from 1,000 | Same thresholds. Shadow families reach 150 in **2–7 months**; the LLM overlay family in about **1 year at 50 trades a year** | — |
| e-process evidence meter | Monthly | Monthly means of (a) net R per trade for the selected book, (b) log-score difference vs base rate. Reported, never acted on outside the looks | Valid under monthly peeking (track 10 §3.4) |
| Pre-registered looks | Months 6, 12, 24, 36 | Paper: months 3, 6, 9, 12. Live: 6, 12, 24 | Faster resolution |
| Forward A/B for a parameter change | 6 months, ≥ 100 paired shadow candidates | **≥ 3 months and ≥ 150 paired shadow trades** from the wide book; P(better) ≥ 0.95 under a sceptical prior; 3 months at 50% influence | The wide book supplies the pairs |
| Sizing inputs | κ = 0.5 / 0.25 frozen in year 1 | κ frozen through paper and pilot; from the half-size stage, **κ̂ updated quarterly** with prior N(0.35, 0.15²), clipped to [0.1, 0.6] | §2.6: realised κ after selection was 0.05–0.36 |
| Drawdown bands | Track 10 simulation E | ✅ `sim_portfolio`, v2 at 50 trades a year: median 3-year maximum drawdown 7.8% (s = 0.1) to 10.3% (s = 0). Review at 15%, pause at 20% | — |
| Retirement | CUSUM or SPRT, never before 12 months or 12 trades | Same, plus thesis invalidation. Median CUSUM delay 9–53 months (§6.1), so *retirement by P&L is slow by nature*; thesis invalidation and shadow base-rate drift are the fast paths | — |

### 6.3 Additions to the monthly review email (track 10 §6(d))

1. **Paper/pilot status:**
   - stage (paper, pilot, half, full);
   - months and resolved trades so far;
   - the next pre-registered look and which gates currently pass;
   - posterior P(s > 0).
2. **Execution:**
   - paper vs practice-account slippage by instrument;
   - skip rate and its cost;
   - trades skipped at the entry band.
3. **Claimed vs realised edge** per archetype: κ̂ with an 80% interval.
4. **Wide-book frontier:** growth vs trades a year on resolved paper trades. This is the empirical version of §2.6 and is used at the annual hurdle review.
5. **Tax line:**
   - realised short-term vs §1256 gains;
   - wash sales triggered (and the cross-account check, which must be zero);
   - settled-cash status.

---

## 7. Limitations

- **The trade model is stylised.**
  - Real edges are not constant per archetype, and they cluster in regimes. The regime test in §2.4 halved growth.
  - The gap model was calibrated to the empirical 2×ATR tails, but survivorship makes those tails optimistic.
  - Option trades were modelled as call-spread payoffs on the same factor model, not from historical option quotes.
- **"True s" is an input, not a forecast.** Nothing here says the system *has* an edge. Round 2's signal tracks (13–17) must supply candidate archetypes, and the paper phase must measure them.
- **The selection model's pipelines (μ₀, τ, skill) are assumptions.** The qualitative results (winner's curse; growth rising with N at fixed quality) are robust. The exact knee (38–211 trades a year across the six pipelines) is not.
- **Taxes.**
  - The calculations are federal only; state taxes are ignored.
  - The rate profiles are illustrative marginal rates, not bracket calculations.
  - The §1256 status of CME Bitcoin futures and the equity-option status of ETF options follow the statute's definitions and track 09's reading, not a ruling.
  - Crypto wash-sale status rests on secondary sources (May–July 2026), and pending bills could change it.
  - Nothing here is tax advice.
- **Broker specifics are [unverified]** except Fidelity's conditional orders and GTC expiry, the Kraken fees and FINRA/SEC rules. They include bracket support, stop behaviour outside regular hours, futures in IRAs, practice accounts and commissions. `account.yaml` must record them per broker.
- **The latency result is historical.** The overnight/intraday split in 2005–2026 may not persist, but the rule "backtest on next-open fills" does not depend on it.
- **The OC simulations assume i.i.d. trades.** Correlated trades, as in §2.3, make the evidence weaker and the go-live rule somewhat more permissive than shown.

---

## 8. Implications for the system design (rules and parameters)

**A. Objective, hurdle and trade budget**

1. **Δg definition.** Keep Δg on the whole portfolio: joint scenario simulation of the candidate with every open position and the core; idle cash at T-bills; `sizing_v2.py` is the reference. **Δg_yr = Δg_trade / max(T_years, 1)**, so for 1–60-day trades use Δg_trade directly and never divide by T.
2. **Send a trade only if all of these hold:**
   - Δg_trade ≥ **6 bp** of expected log growth, computed with the shrunk edge, after costs and T-bill drag;
   - expected R after drag > 0;
   - the edge beats **buy-and-hold** over the same horizon, not zero;
   - gross edge ≥ 2× round-trip cost.
3. **Kelly uses the full scenario distribution.** Gap multiples feed only the caps; never put the stress loss into the EV/Kelly calculation (the track 03 flaw).
4. **Trade budget:**
   - target 25–50 new trades a year; hard cap 100 a year;
   - ≤ 8 open positions;
   - minimum holding period 5 trading days, unless the archetype is an event trade backtested on next-open fills.
   - Review the hurdle and budget once a year against the wide-book frontier.

**B. Sizing and risk**

5. **R and stress.** R = loss at the stop (stop-based) or premium (defined risk). Stress = R × P99 gap multiple:
   - ETFs and index futures 1.7;
   - rates/commodity ETFs 1.7;
   - large caps 2.1;
   - high-volatility stocks 2.6;
   - Bitcoin ETF 3.1;
   - spot crypto on a venue with 24/7 stops 1.5.

   Stops at ≥ 2×ATR(14).
6. **Size formula.** r = G(D) · min(0.25 · joint Kelly(κ·s_claim), Kelly(s_claim − 0.05), stress cap, cluster room, total room). Parameters:
   - k = 0.25;
   - κ = 0.5 for rule-based and 0.25 for LLM-subjective edges, frozen through the pilot, then κ̂ updated quarterly (prior N(0.35, 0.15²), clip [0.1, 0.6]);
   - **never full Kelly on claimed edges** (0.4–54% ruin in 3 years in simulation).
7. **Caps:**
   - per-trade stress ≤ 2% of equity (stop-based) or ≤ 3% premium (defined risk);
   - cluster stress ≤ 6%;
   - total open stress ≤ 10%; may rise to 8% / 15% only at the full-size stage;
   - option premium outstanding ≤ 10%.
8. **Correlation.** Map every position to factor clusters: US equity beta (with sector sub-clusters), duration, USD, oil, gold, crypto, single-name residual. Assume ρ ≥ 0.5 within a cluster and ≥ 0.3 across long-risk clusters. Use the joint simulation; the fallback is the divisor 1 + 0.5 × (open positions in the cluster).
9. **Drawdown governor (short-horizon version).**
   - G = 1 up to a 5% drawdown, linear to 0.25 at 15%, floor 0.25;
   - human review at 15%; pause new trades at 20% until reviewed;
   - k halving at 15% is temporary.
10. **Loss limits are operational circuit breakers only.** A daily loss ≥ 2% or a weekly loss ≥ 4% pauses new entries for 1 or 5 days pending a data/fill/cluster check. They had no risk benefit in simulation.
11. **No stop-based single-stock position through earnings.** Either exit the evening before, or use defined risk, or size at stress ≥ 5R. Use defined-risk structures for gap-dominated setups; the default instrument is the stock, ETF or future.

**C. Execution (email content and playbooks)**

12. **Stocks/ETFs/futures.**
    - Evening DAY limit entry at the ±1.5σ band edge (skips 3–7%);
    - OTOCO bracket: a stop-market GTC (never stop-limit) plus a GTC take-profit limit;
    - time stop by EXIT email the evening before, then sell at the open.
13. **Options.**
    - Enter after 10:00 ET with a limit ladder (mid, +¼ spread every 10 minutes, capped by an underlying-price table in the email);
    - **no stop orders**; defined risk only;
    - GTC take-profit; EXIT emails for invalidation and time stops;
    - close ≥ 5 trading days before expiry;
    - prefer cash-settled European index options.
14. **Crypto.** Bitcoin exposure for ≥ 10-day trades via IBIT (in the IRA) or CME micro futures (taxable). Direct spot only where the 24/7 stop matters; fees 0.2–0.8% a side. Entry band ±2–3%.
15. **Gap rules as §3.4:**
    - no chasing outside the band;
    - never cancel a stop after a gap;
    - accept gap-improved take-profits.
16. **Checks built into the daily run:**
    - partial fills: brackets sized to the filled quantity;
    - FINRA 5330 ex-date adjustments and split cancellations checked daily, with an ADJUST email re-sending levels;
    - new entries only from settled cash in cash accounts.
17. **Next-open fills everywhere.** Every backtest, paper fill and archetype evaluation uses next-open fills (10:00 snapshot for options). Short-term reversal archetypes need proof on next-open fills: they lost 24–63% of their edge.

**D. Rules and taxes**

18. **`account.yaml` records, per account and broker:**
    - the PDT/intraday-margin implementation date (FINRA RN 26-10: effective 2026-06-04, phase-in to 2027-10-20);
    - cash vs margin;
    - options level;
    - futures permission;
    - bracket support;
    - fee schedule.
19. **Placement.** Each underlying is assigned to exactly one account family. IRA: stocks, ETFs, equity-option spreads, Bitcoin ETF. Taxable: §1256 instruments (MES/MNQ/M2K, XSP/SPX, CME Bitcoin futures) and direct crypto.
20. **Cross-account wash-sale guard.**
    - Block any purchase of an underlying (including its options) within ±30 days of a taxable loss sale in another account family.
    - Warn in December about year-end deferral.
    - Treat spot BTC and IBIT as possibly substantially identical.
21. **Do not pursue a §475(f) election at this trade frequency.** Re-evaluate only if trading exceeds several hundred trades a year, and then with a tax professional; the next possible election is for 2027, due 15 April 2027.

**E. Paper trading and go-live**

22. **Paper phase.**
    - Minimum 3 months and 30 resolved selected trades, maximum 12 months (+6 by rule).
    - The wide paper book includes every trigger with Δg ≥ 0.
    - Fill model v1.0 as in §5.1, frozen and hashed.
    - The user executes in a broker practice account in parallel.
23. **Go-live rule** at months 3, 6, 9 and 12: ops ≥ 95% on-time runs and 0 validator failures; practice-vs-model fills within 10 bp (options 20% of the half-spread); **P(s > 0) ≥ 0.7** under N(0, 0.1²); no gross calibration bias (±20 points); paper maximum drawdown < 15%.
24. **Ramp:**
    - pilot at 25% of target size;
    - 50% after ≥ 6 months and ≥ 30 live trades with P(s > 0) ≥ 0.8, κ̂ ≥ 0.2 and implementation shortfall ≤ 20%;
    - 100% after ≥ 100 resolved trades (paper at half weight), P(s > 0) ≥ 0.9 and calibration verified;
    - demote on the triggers in §5.5.

**F. Calibration loop**

25. **Evidence stream.** Three mechanical forecasts per trade, and a deterministic daily shadow book with base-rate forecasts and paper fills (no LLM calls); no gym.
26. **Cadence.**
    - Monthly: operations, execution and evidence meters only.
    - Quarterly: costs, κ̂, calibration warnings, base-rate drift, gated Platt maps (≥ 150 per family), go-live/ramp decisions.
    - Annually, with you: slope, retirement, hurdle and budget.
    - At most one change per parameter per quarter, via a ≥ 3-month forward comparison with ≥ 150 paired shadow trades.
27. **Monthly review additions (§6.3):** stage and gates, paper vs practice fills, claimed vs realised edge (κ̂), wide-book frontier, and the tax/wash-sale/settlement line.

---

## Sources

All accessed 2026-09-28 unless stated. 📄 = fetched; 🔎 = via search summary.

**Rules and taxes**
- 📄 FINRA Regulatory Notice 26-10, intraday margin standards replacing the day-trading margin requirements (SEC approval 14 Apr 2026, Release No. 105226; effective 4 Jun 2026; phase-in to 20 Oct 2027): https://www.finra.org/rules-guidance/notices/26-10
- 📄 12 CFR §220.8, Regulation T cash account (90-day freeze): https://www.law.cornell.edu/cfr/text/12/220.8
- 📄 Fidelity, "Avoiding cash account trading violations" (good-faith, free-riding and cash-liquidation violations; T+1): https://www.fidelity.com/learning-center/trading-investing/trading/avoiding-cash-trading-violations
- SEC press release 2023-29 (T+1 settlement from 28 May 2024), via track 09: https://www.sec.gov/newsroom/press-releases/2023-29
- 📄 IRS Publication 550 (2025), wash sales: https://www.irs.gov/publications/p550
- 🔎 Rev. Rul. 2008-5 (IRA purchase makes the wash-sale loss permanent): https://www.irs.gov/pub/irs-drop/rr-08-05.pdf
- 📄 26 U.S.C. §1256 (60/40, mark-to-market, definitions; §1091 not applicable to mark-to-market losses): https://www.law.cornell.edu/uscode/text/26/1256
- 📄 IRS Topic 429, Traders in securities (trader status, §475(f) election and revocation; page last reviewed 24 Sep 2026): https://www.irs.gov/taxtopics/tc429
- IRS Topic 409 and Form 1099-DA pages, via track 09: https://www.irs.gov/taxtopics/tc409 ; https://www.irs.gov/instructions/i1099da
- IRS Notice 2014-21 (virtual currency treated as property) [not re-fetched]: https://www.irs.gov/pub/irs-drop/n-14-21.pdf
- 📄 Gordon Law Group, "Crypto Wash Sale Rule in 2026: Is the Loophole Finally Closed?" (15 May 2026): https://gordonlaw.com/learn/crypto-wash-sale-rule-in-2026-is-the-loophole-finally-closed/
- 🔎 Summaries stating that the One Big Beautiful Bill Act did not extend §1091 to digital assets, and that a 2025 Senate bill and a December 2025 House discussion draft were pending as of July 2026: https://chainwisecpa.com/crypto-wash-sale-2026/ ; https://tokentax.co/blog/wash-sale-trading-in-crypto
- Tax Foundation 2026 brackets, via track 09: https://taxfoundation.org/data/all/federal/2026-tax-brackets/

**Order handling and execution**
- 📄 FINRA Rule 5330, Adjustment of Orders: https://www.finra.org/rules-guidance/rulebooks/finra-rules/5330
- 🔎 SEC Investor Bulletin, "Stop, Stop-Limit, and Trailing Stop Orders" (a stop's trigger price is not its execution price; gaps): https://www.sec.gov/resources-investors/investor-alerts-bulletins/stop-stop-limits-trading-stop-orders
- 🔎 Nasdaq, "The Nasdaq Opening and Closing Crosses" quick guide (MOO until 09:28, LOO until 09:29:59): https://www.nasdaqtrader.com/content/technicalsupport/specifications/TradingProducts/openclosequickguide.pdf ; NYSE auctions fact sheet: https://www.nyse.com/publicdocs/nyse/NYSE_Opening_and_Closing_Auctions_Fact_Sheet.pdf
- 🔎 Fidelity, conditional orders (OTO, OCO, OTOCO; stocks and single-leg options; both legs can execute in fast markets): https://www.fidelity.com/learning-center/trading-investing/trading/conditional-order-types
- 🔎 Fidelity and Schwab GTC expiry (180 days): https://www.fidelity.com/trading/faqs-order-types ; https://www.schwab.com/content/how-to-place-trade-using-good-til-canceled
- 📄 Kraken fee schedule (Kraken Pro tiers): https://www.kraken.com/features/fee-schedule

**Academic**
- 🔎 Muravyev, D., & Pearson, N. D. (2020). Options trading costs are lower than you think. *Review of Financial Studies* 33(11): 4973–5014 (effective spread = 58.4% of the quoted half-spread for all traders, 29.6% for algorithmic traders).
- 🔎 Perold, A. F. (1988). The implementation shortfall: paper versus reality. *Journal of Portfolio Management* 14(3): 4–9.
- Cliff, M., Cooper, M., & Gulen, H. (2008). Return differences between trading and non-trading hours: like night and day. SSRN working paper [from memory, unverified].
- Lou, D., Polk, C., & Skouras, S. (2019). A tug of war: overnight versus intraday expected returns. *Journal of Financial Economics* 134(1): 192–213 [from memory, unverified].
- Holt, C. A., & Laury, S. K. (2002). Risk aversion and incentive effects. *American Economic Review* 92(5): 1644–1655 [from memory, unverified].
- Shefrin, H., & Statman, M. (1985). The disposition to sell winners too early and ride losers too long. *Journal of Finance* 40(3): 777–790; Odean, T. (1998). Are investors reluctant to realize their losses? *Journal of Finance* 53(5): 1775–1798 [from memory, unverified].
- Moskowitz, T., Ooi, Y. H., & Pedersen, L. H. (2012). Time series momentum. *Journal of Financial Economics* 104(2): 228–250 [from memory, unverified].
- Kelly (1956); Thorp (2006); Grossman & Zhou (1993); Busseti, Ryu & Boyd (2016); Smith & Winkler (2006); McLean & Pontiff (2016); Page (1954); Bailey & López de Prado (2012, 2014) — as cited in tracks 03 and 10.
- Brownian-bridge barrier-crossing probability exp(−2ab/σ²t): standard result, e.g. Glasserman (2004), *Monte Carlo Methods in Financial Engineering*, §6.4 [from memory].

**Data**
- Yahoo Finance via yfinance: daily adjusted OHLC 2005-01 to 2026-09-25 for 82 tickers; BTC-USD hourly bars for the last 729 days. Personal-use terms (track 09).

---

## Reproducibility map (`research/code/18-short-exec/`)

| Section | Script | Outputs (`results/`) |
|---|---|---|
| 2.1 corrected hurdle, worked examples | `sizing_v2.py` (imports track 03's `sizing_rule.py` for the old-rule comparison) | `sizing_v2_examples` |
| 2.2 gap risk, entry bands | `gap_risk.py` | `gap_distribution`, `stop_gap_through`, `btc_etf_weekend_gaps`, `entry_band_skip_rates` |
| 2.3–2.5 portfolio simulation | `sim_portfolio.py`, `trade_model.py` | `portfolio_main`, `portfolio_sensitivity` |
| 2.6 how many trades | `sim_selection.py` | `selection_frontier`, `selection_knee`, `selection_at_fixed_n` |
| 3.2 latency | `latency.py` | `overnight_vs_intraday`, `first_night_cost`, `btc_email_to_morning_window` |
| 4 taxes | `tax_compare.py` | `tax_rates`, `tax_after_tax_growth`, `tax_wash_sales` |
| 5 paper trading | `paper_protocol.py` (imports track 10's `ledger.py`) | `fill_model_selftest`, `paper_ledger_demo`, `limit_adverse_selection`, `paper_pass_rule_oc`, `paper_calibration_gate_power`, `paper_pilot_value` |
| 6 calibration cadence | `calibration_cadence.py` | `cadence_mde`, `cadence_slope_power`, `cadence_cusum` |
| All | `run_all.py` (full or `quick`), `test_18.py` (4 sanity tests), `util18.py` (paths, caching, tables) | — |
