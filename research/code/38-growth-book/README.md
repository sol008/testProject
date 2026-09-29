# Track 38 code: the growth-book synthesis

`run38.py` produces every number in `research/38-growth-book-synthesis.md`. It reuses track 31's engine
(`research/code/31-growth-portfolio/engine31.py`: the block bootstrap with common random numbers, the drawdown
governors) and track 31's cached daily sleeve returns; it adds only what the synthesis needs.

```
python3 run38.py               # about 4-6 minutes on 4 cores, seed 38; results/*.csv and results/summary.txt
python3 run38.py --paths 500   # quicker, noisier
```

## Inputs (all local; no network)

| Input | Where | Built by |
|---|---|---|
| Daily sleeve returns, history as it happened and the forward-shrunk versions (`SPY`, `QQQ`, `SPX{1,2,3}_200d_w`, `NDX{1,2,3}_200d_w`, `BTC_10wk`, `PhaseA`, `rf`) | `TRACK31_DATA/inputs/hist`, `.../fwd_2008-2026` (default: the session scratchpad) | `research/code/31-growth-portfolio/run_all.py` (its `save_inputs`) |
| BTC-USD daily closes (Yahoo) | `TRACK04_DATA/yf_BTC_USD.csv` | track 04's cache |

If the caches are missing, run track 31's `run_all.py` first (it downloads through track 04's loaders).

## What the script adds to track 31

- **The Bitcoin switch with track 28's 200-day condition** (`BTC10w200`): Sunday close above its 10-week
  average *and* above its 200-day average, IBIT costs, the Monday-open delay, 0.05% a switch. The forward
  version follows track 31's recipe (tilt the price path so buy-and-hold earns 7.5% a year, rebuild the rule,
  keep κ = min(0.5, t²/(1+t²)) of its alpha with t from the 2021–2026 out-of-sample alpha). Flat (0%), no-edge
  and bull (15%) variants for the sensitivities.
- **A gems satellite stream** (`GEMS`): a synthetic series with track 35 §7's distribution (a triangular draw per
  calendar year; a crash bonus in the 60 sessions after the 2008 and 2020 troughs), at the 15% reference size.
  The forward version uses track 35's post-2028 level and κ = 0.5. **This is an estimate, not a backtest.**
- **Three belief sets**: forward-central, historical-repeat (2008–2026), and their 50/50 mixture of paths.
- **The drawdown constraint** P(max drawdown over 10 years > D) ≤ 10% for D = 30/40/50%, the frontier over a
  grid of 324 books, and five governors including one scaled to D = 40% (full size to −15%, 25% at −35%).
- The sensitivities and real-path checks the synthesis asks for.

## Outputs (`results/`)

| File | Content |
|---|---|
| `btc_sleeves.csv` | The two Bitcoin rules (10-week; 10-week + 200-day) in each world: CAGR 2014–2026, drawdown, time in, κ |
| `gems_stream.csv` | What the gems estimate contributes a year, by world |
| `grid_10y.csv` | Every grid book × belief set: expected log growth, median/p10/p90 CAGR, P(beat SPY), P(+5), P(dd > 30/40/50%), years to 2× and 10× (10-year paths) |
| `frontier.csv` | The five best feasible books for each belief × D |
| `governed_20y.csv`, `frontier_governed.csv` | The shortlist × five governors on 20-year paths, and the governed frontier |
| `finalists_50y.csv` | The finalists on 50-year paths: the tables in the synthesis §6 |
| `sensitivity_forward.csv` | The recommended book under Bitcoin flat / no edge / bull, financing +1 point, no gems, the 10-week rule |
| `real_path.csv`, `episodes.csv`, `calendar_years.csv`, `shock_1987.csv` | History as it happened: CAGR and drawdowns on the real path, the crash episodes, calendar years (whipsaws), and a 1987-style day |
| `summary.txt` | The console summary |
