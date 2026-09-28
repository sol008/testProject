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
   - Track 03's rule has three flaws: it is isolated from the portfolio, it treats cash as earning 0%, and it puts the gap-stress multiple *inside* the Kelly formula. The last flaw makes every realistic stop-based trade look negative-edge: break-even 58.8% against an actual hit rate of 57.6% on the SPY example.
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
   - **Wash sales:** at 50 trades a year on 10 underlyings, **56% of losing exits are wash sales**. If 30% of trades run in an IRA, **22% of all losses become permanently disallowed** (📄 Rev. Rul. 2008-5). So each underlying is assigned to exactly one account.
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

- It is large for low-volatility instruments held for weeks: 0.05R for a 10-day SPY trade with a 3.3% stop, 0.05R for a 20-day stock trade with a 6.6% stop, and 0.14R for a 40-day index trade.
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
3. **No stop-based single-stock position through an earnings date.** The −17σ to −20σ gaps above are earnings-type events. Either exit before earnings, or use a defined-risk structure, or size the stock at a stress of ≥ 5R.
4. **Defined-risk structures earn their larger allowance only where gaps dominate.** Examples: event and earnings trades, positions held through weekends in Bitcoin ETFs, and single names with jump risk.
   - A defined-risk trade's P99 loss is exactly 1R. Under the 2%/3% caps it may therefore carry 1.6–3× the R of a stop-based trade.
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
2. **Backtests and paper fills must enter at the next open,** or at the 10:00 quote snapshot for options. A backtest entered at the signal close overstates reversal edges by 1.5–2.7×.
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

