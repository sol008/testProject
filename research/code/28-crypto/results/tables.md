# Track 28 — generated tables (run_all.py)

Weeks: 664 decision intervals from 2014-01-06 14:30:00 to 2026-09-28 13:30:00 (UTC).



### Data checks

| check | value |
|---|---|
| Coin Metrics vs Coinbase daily close, BTC (4088 days) | median |diff| 0.10%, 99th pct 1.30% |
| Coin Metrics vs Coinbase daily close, ETH (3783 days) | median |diff| 0.13%, 99th pct 1.64% |
| BTC price at Mon 00:00 UTC from hourly candles vs Sunday daily close | median |diff| 0.000%, max 0.19% |
| yfinance BTC-USD close vs ours (4394 days) | median |diff| 0.11%, 99th pct 2.33% |
| IBIT Monday-open to Monday-open vs BTC price at 09:30 ET (141 weeks) | corr 0.9949, tracking error 5.44%/yr, IBIT minus proxy -0.79%/yr (fee 0.25%) |

### Sleeve alone (100% crypto rule, cash when off), IRA/ETF route, 2014-2026

SPY over the same weeks: CAGR 13.8%, max DD -31.8%, worst year -18% (2022).

| Rule | CAGR | Vol | Sharpe | Max DD (weekly marks) | Worst year | Time in | Trades/yr |
|---|---|---|---|---|---|---|---|
| BTC_BH | 42.3% | 67.4% | 0.83 | -82.1% | -76% (2018) | 100% | 0.0 |
| BTC_10W | 46.2% | 48.7% | 0.97 | -72.4% | -66% (2018) | 54% | 7.9 |
| BTC_20W | 44.5% | 52.0% | 0.92 | -74.3% | -69% (2018) | 58% | 3.9 |
| BTC_50D | 49.9% | 47.8% | 1.04 | -73.5% | -61% (2018) | 55% | 8.6 |
| BTC_200D | 42.0% | 52.1% | 0.89 | -71.3% | -65% (2014) | 57% | 3.5 |
| BTC_10W_200D | 48.4% | 45.4% | 1.04 | -51.9% | -41% (2018) | 45% | 6.0 |
| BTC_10W_VT50 | 41.7% | 38.9% | 1.03 | -49.8% | -45% (2018) | 54% | 9.3 |
| ETH_10W | 80.7% | 81.3% | 1.07 | -70.9% | -40% (2022) | 48% | 6.4 |
| ROT_MOM_10W | 79.3% | 81.6% | 1.06 | -82.2% | -70% (2018) | 62% | 10.3 |
| ROT_ETHBTC_10W | 72.8% | 81.7% | 1.01 | -77.9% | -55% (2018) | 62% | 10.8 |
| HALF_10W | 77.0% | 55.1% | 1.26 | -60.1% | -46% (2018) | 62% | 13.0 |
| BTC2X_BH | 8.8% | 137.7% | 0.73 | -99.3% | -98% (2018) | 100% | 0.0 |
| BTC2X_10W | 56.0% | 100.2% | 0.89 | -94.5% | -92% (2018) | 54% | 7.9 |
| BTC2X_10W_200D | 67.3% | 93.6% | 0.95 | -81.8% | -71% (2018) | 45% | 6.0 |
| BTC_10W_VT80_L2 | 60.6% | 68.5% | 0.99 | -68.6% | -63% (2018) | 54% | 18.1 |
| HALVING_18M | 50.2% | 44.2% | 1.09 | -52.3% | -29% (2014) | 39% | 0.6 |

### Sleeve alone (100% crypto rule, cash when off), IRA/ETF route, 2018-2026

SPY over the same weeks: CAGR 14.6%, max DD -31.8%, worst year -18% (2022).

| Rule | CAGR | Vol | Sharpe | Max DD (weekly marks) | Worst year | Time in | Trades/yr |
|---|---|---|---|---|---|---|---|
| BTC_BH | 22.5% | 64.9% | 0.60 | -76.9% | -73% (2018) | 100% | 0.0 |
| BTC_10W | 24.5% | 44.2% | 0.65 | -64.5% | -62% (2018) | 51% | 8.7 |
| BTC_20W | 21.9% | 46.4% | 0.60 | -67.0% | -65% (2018) | 54% | 4.6 |
| BTC_50D | 29.4% | 43.5% | 0.74 | -65.9% | -57% (2018) | 51% | 9.2 |
| BTC_200D | 21.3% | 45.6% | 0.59 | -57.2% | -54% (2018) | 53% | 3.9 |
| BTC_10W_200D | 26.7% | 39.4% | 0.72 | -45.1% | -34% (2018) | 41% | 6.4 |
| BTC_10W_VT50 | 25.2% | 36.6% | 0.72 | -42.9% | -41% (2018) | 51% | 9.6 |
| ETH_10W | 27.6% | 62.9% | 0.66 | -70.9% | -40% (2022) | 52% | 7.6 |
| ROT_MOM_10W | 15.0% | 62.3% | 0.50 | -82.0% | -66% (2018) | 60% | 11.7 |
| ROT_ETHBTC_10W | 14.1% | 61.8% | 0.48 | -77.9% | -61% (2018) | 60% | 12.5 |
| HALF_10W | 31.3% | 47.2% | 0.75 | -60.1% | -49% (2018) | 60% | 13.7 |
| BTC2X_BH | -18.5% | 131.4% | 0.50 | -98.7% | -97% (2018) | 100% | 0.0 |
| BTC2X_10W | 16.0% | 90.1% | 0.56 | -89.9% | -89% (2018) | 51% | 8.7 |
| BTC2X_10W_200D | 25.7% | 80.7% | 0.63 | -74.6% | -63% (2018) | 41% | 6.4 |
| BTC_10W_VT80_L2 | 29.7% | 65.4% | 0.67 | -66.6% | -59% (2018) | 51% | 18.7 |
| HALVING_18M | 32.5% | 35.8% | 0.88 | -49.3% | -13% (2018) | 35% | 0.6 |

### Sleeve alone (100% crypto rule, cash when off), IRA/ETF route, 2021-2026

SPY over the same weeks: CAGR 14.8%, max DD -23.3%, worst year -18% (2022).

| Rule | CAGR | Vol | Sharpe | Max DD (weekly marks) | Worst year | Time in | Trades/yr |
|---|---|---|---|---|---|---|---|
| BTC_BH | 18.1% | 56.9% | 0.52 | -75.4% | -67% (2022) | 100% | 0.0 |
| BTC_10W | 14.3% | 41.4% | 0.45 | -49.8% | -42% (2022) | 53% | 8.4 |
| BTC_20W | 16.3% | 41.7% | 0.49 | -48.3% | -30% (2022) | 56% | 4.9 |
| BTC_50D | 20.8% | 40.0% | 0.59 | -41.1% | -24% (2022) | 52% | 9.4 |
| BTC_200D | 16.0% | 41.3% | 0.48 | -49.0% | -8% (2022) | 55% | 4.2 |
| BTC_10W_200D | 19.6% | 37.7% | 0.57 | -45.1% | -10% (2025) | 44% | 6.3 |
| BTC_10W_VT50 | 11.5% | 35.7% | 0.39 | -42.2% | -36% (2022) | 53% | 8.9 |
| ETH_10W | 28.4% | 53.9% | 0.66 | -57.3% | -40% (2022) | 53% | 8.4 |
| ROT_MOM_10W | 17.9% | 55.5% | 0.51 | -63.9% | -44% (2022) | 62% | 11.7 |
| ROT_ETHBTC_10W | 16.0% | 54.4% | 0.48 | -67.9% | -40% (2022) | 62% | 12.7 |
| HALF_10W | 24.6% | 42.1% | 0.65 | -49.5% | -41% (2022) | 62% | 13.8 |
| BTC2X_BH | -14.4% | 115.1% | 0.40 | -97.6% | -94% (2022) | 100% | 0.0 |
| BTC2X_10W | -0.1% | 84.2% | 0.36 | -81.5% | -71% (2022) | 53% | 8.4 |
| BTC2X_10W_200D | 13.7% | 76.9% | 0.48 | -74.6% | -31% (2025) | 44% | 6.3 |
| BTC_10W_VT80_L2 | 4.5% | 64.5% | 0.34 | -66.6% | -55% (2022) | 53% | 18.2 |
| HALVING_18M | 27.2% | 38.3% | 0.73 | -49.3% | 1% (2022) | 41% | 0.5 |

### Portfolio = sleeve + rest in SPY, IRA/ETF route, 2014-2026: CAGR / excess vs SPY (points) / max DD

SPY alone: CAGR 13.8%, max DD -31.8%.

| Rule | 3% sleeve | 10% sleeve | 20% sleeve | 30% sleeve | 50% sleeve |
|---|---|---|---|---|---|
| BTC2X_10W | 16.4% / +2.6 / -31% | 22.5% / +8.7 / -30% | 31.3% / +17.5 / -44% | 39.7% / +25.9 / -56% | 50.8% / +36.9 / -73% |
| BTC_10W | 15.2% / +1.4 / -31% | 18.2% / +4.4 / -30% | 22.4% / +8.5 / -27% | 26.9% / +13.1 / -34% | 35.5% / +21.7 / -47% |
| BTC_10W_200D | 15.2% / +1.4 / -31% | 18.2% / +4.4 / -30% | 22.5% / +8.7 / -27% | 26.8% / +13.0 / -25% | 35.8% / +22.0 / -31% |
| BTC_10W_VT80_L2 | 15.9% / +2.1 / -31% | 20.6% / +6.8 / -30% | 27.0% / +13.2 / -28% | 33.1% / +19.3 / -33% | 44.9% / +31.1 / -44% |
| BTC_20W | 15.1% / +1.3 / -31% | 18.1% / +4.3 / -31% | 22.4% / +8.6 / -29% | 26.5% / +12.7 / -35% | 34.5% / +20.7 / -47% |
| BTC_BH | 15.4% / +1.6 / -32% | 19.0% / +5.2 / -31% | 23.7% / +9.8 / -34% | 28.0% / +14.2 / -41% | 35.1% / +21.3 / -56% |
| ETH_10W | 16.4% / +2.6 / -33% | 22.5% / +8.7 / -35% | 31.1% / +17.3 / -37% | 40.5% / +26.7 / -40% | 57.3% / +43.5 / -50% |
| ROT_MOM_10W | 16.5% / +2.7 / -33% | 22.7% / +8.9 / -35% | 31.5% / +17.7 / -38% | 40.9% / +27.1 / -42% | 56.7% / +42.9 / -57% |

### Portfolio = sleeve + rest in SPY, IRA/ETF route, 2018-2026: CAGR / excess vs SPY (points) / max DD

SPY alone: CAGR 14.6%, max DD -31.8%.

| Rule | 3% sleeve | 10% sleeve | 20% sleeve | 30% sleeve | 50% sleeve |
|---|---|---|---|---|---|
| BTC2X_10W | 15.8% / +1.2 / -31% | 18.6% / +4.0 / -30% | 21.9% / +7.4 / -38% | 25.2% / +10.6 / -49% | 27.6% / +13.0 / -65% |
| BTC_10W | 15.2% / +0.7 / -31% | 16.7% / +2.2 / -30% | 18.6% / +4.0 / -27% | 20.5% / +6.0 / -30% | 23.7% / +9.2 / -41% |
| BTC_10W_200D | 15.2% / +0.6 / -31% | 16.6% / +2.1 / -30% | 18.7% / +4.1 / -27% | 20.4% / +5.8 / -25% | 23.8% / +9.3 / -29% |
| BTC_10W_VT80_L2 | 15.7% / +1.1 / -31% | 18.2% / +3.7 / -30% | 21.5% / +6.9 / -28% | 24.3% / +9.7 / -33% | 28.5% / +14.0 / -42% |
| BTC_20W | 15.1% / +0.6 / -31% | 16.5% / +1.9 / -31% | 18.2% / +3.7 / -29% | 19.8% / +5.2 / -30% | 21.8% / +7.3 / -42% |
| BTC_BH | 15.5% / +0.9 / -32% | 17.8% / +3.3 / -31% | 20.1% / +5.6 / -34% | 22.5% / +7.9 / -41% | 24.6% / +10.1 / -53% |
| ETH_10W | 15.5% / +1.0 / -33% | 17.7% / +3.2 / -35% | 20.4% / +5.8 / -37% | 23.5% / +9.0 / -40% | 27.6% / +13.0 / -50% |
| ROT_MOM_10W | 15.2% / +0.7 / -33% | 16.7% / +2.1 / -35% | 18.3% / +3.7 / -38% | 19.9% / +5.3 / -42% | 20.6% / +6.0 / -57% |

### Portfolio = sleeve + rest in SPY, IRA/ETF route, 2021-2026: CAGR / excess vs SPY (points) / max DD

SPY alone: CAGR 14.8%, max DD -23.3%.

| Rule | 3% sleeve | 10% sleeve | 20% sleeve | 30% sleeve | 50% sleeve |
|---|---|---|---|---|---|
| BTC2X_10W | 15.3% / +0.4 / -24% | 16.3% / +1.5 / -27% | 16.8% / +1.9 / -34% | 17.2% / +2.3 / -42% | 15.0% / +0.1 / -56% |
| BTC_10W | 15.1% / +0.3 / -23% | 15.7% / +0.8 / -24% | 16.2% / +1.3 / -25% | 16.7% / +1.9 / -28% | 17.6% / +2.7 / -35% |
| BTC_10W_200D | 15.2% / +0.4 / -23% | 16.0% / +1.1 / -21% | 17.2% / +2.3 / -20% | 17.8% / +2.9 / -19% | 19.7% / +4.9 / -23% |
| BTC_10W_VT80_L2 | 15.2% / +0.3 / -24% | 15.8% / +0.9 / -24% | 16.2% / +1.4 / -28% | 16.3% / +1.4 / -33% | 15.1% / +0.2 / -42% |
| BTC_20W | 15.2% / +0.3 / -23% | 15.9% / +1.0 / -23% | 16.6% / +1.7 / -25% | 16.7% / +1.9 / -28% | 18.0% / +3.2 / -34% |
| BTC_BH | 15.4% / +0.5 / -25% | 16.7% / +1.9 / -28% | 18.3% / +3.4 / -34% | 18.9% / +4.0 / -40% | 20.9% / +6.0 / -53% |
| ETH_10W | 15.7% / +0.9 / -23% | 17.8% / +3.0 / -23% | 19.8% / +4.9 / -25% | 22.5% / +7.7 / -28% | 26.6% / +11.8 / -35% |
| ROT_MOM_10W | 15.5% / +0.7 / -23% | 17.0% / +2.2 / -24% | 18.7% / +3.8 / -26% | 20.2% / +5.4 / -30% | 20.6% / +5.7 / -42% |

### Portfolio = sleeve + rest in RF, 2014-2026: CAGR / excess vs SPY / max DD

Rest in T-bills: isolates what the sleeve adds on its own.

| Rule | 3% | 10% | 20% | 30% | 50% |
|---|---|---|---|---|---|
| BTC2X_10W | 4.8% / -9.0 / -6% | 11.2% / -2.6 / -21% | 19.7% / +5.9 / -39% | 29.4% / +15.6 / -53% | 44.2% / +30.4 / -72% |
| BTC_10W | 3.5% / -10.3 / -2% | 7.2% / -6.6 / -10% | 12.3% / -1.5 / -20% | 17.3% / +3.5 / -29% | 28.3% / +14.5 / -45% |
| BTC_10W_200D | 3.5% / -10.3 / -2% | 7.2% / -6.6 / -6% | 12.4% / -1.4 / -12% | 17.4% / +3.6 / -18% | 28.5% / +14.7 / -29% |
| BTC_BH | 3.7% / -10.1 / -3% | 8.0% / -5.8 / -11% | 13.8% / -0.0 / -22% | 18.9% / +5.1 / -35% | 28.6% / +14.8 / -51% |

### Portfolio = sleeve + rest in LEVSPY, 2014-2026: CAGR / excess vs SPY / max DD

LEVSPY alone (SSO when SPY > 200-day average, else T-bills; a stand-in for the other track): CAGR 14.5%, excess vs SPY +0.7, max DD -34.9%.

| Rule | 3% | 10% | 20% | 30% | 50% |
|---|---|---|---|---|---|
| BTC2X_10W | 17.2% / +3.3 / -33% | 23.3% / +9.5 / -36% | 32.5% / +18.7 / -46% | 40.7% / +26.9 / -58% | 52.6% / +38.8 / -73% |
| BTC_10W | 15.9% / +2.1 / -33% | 19.0% / +5.2 / -32% | 23.5% / +9.7 / -33% | 27.9% / +14.1 / -36% | 36.3% / +22.5 / -48% |
| BTC_10W_200D | 15.8% / +2.0 / -33% | 18.9% / +5.1 / -29% | 23.4% / +9.6 / -25% | 28.1% / +14.3 / -26% | 36.5% / +22.7 / -32% |
| BTC_BH | 16.1% / +2.3 / -33% | 19.9% / +6.1 / -33% | 24.4% / +10.6 / -37% | 29.0% / +15.2 / -42% | 36.0% / +22.2 / -59% |

### Portfolio = sleeve + rest in RF, 2021-2026: CAGR / excess vs SPY / max DD

Rest in T-bills: isolates what the sleeve adds on its own.

| Rule | 3% | 10% | 20% | 30% | 50% |
|---|---|---|---|---|---|
| BTC2X_10W | 4.2% / -10.6 / -3% | 5.9% / -9.0 / -11% | 7.3% / -7.5 / -24% | 9.0% / -5.9 / -34% | 11.2% / -3.7 / -51% |
| BTC_10W | 4.0% / -10.9 / -1% | 5.3% / -9.5 / -6% | 7.3% / -7.6 / -12% | 8.6% / -6.2 / -18% | 11.5% / -3.4 / -28% |
| BTC_10W_200D | 4.1% / -10.8 / -1% | 5.7% / -9.2 / -4% | 8.0% / -6.8 / -9% | 9.8% / -5.0 / -14% | 13.6% / -1.2 / -25% |
| BTC_BH | 4.2% / -10.6 / -3% | 6.3% / -8.6 / -10% | 8.7% / -6.1 / -20% | 10.8% / -4.0 / -32% | 17.5% / +2.6 / -46% |

### Portfolio = sleeve + rest in LEVSPY, 2021-2026: CAGR / excess vs SPY / max DD

LEVSPY alone (SSO when SPY > 200-day average, else T-bills; a stand-in for the other track): CAGR 19.7%, excess vs SPY +4.9, max DD -31.9%.

| Rule | 3% | 10% | 20% | 30% | 50% |
|---|---|---|---|---|---|
| BTC2X_10W | 20.1% / +5.3 / -33% | 20.8% / +6.0 / -36% | 20.9% / +6.0 / -42% | 21.0% / +6.1 / -47% | 17.8% / +3.0 / -59% |
| BTC_10W | 19.9% / +5.0 / -32% | 20.1% / +5.3 / -32% | 20.3% / +5.4 / -33% | 20.2% / +5.4 / -35% | 19.7% / +4.9 / -38% |
| BTC_10W_200D | 20.0% / +5.1 / -31% | 20.6% / +5.7 / -28% | 21.1% / +6.2 / -25% | 21.9% / +7.0 / -23% | 22.2% / +7.3 / -24% |
| BTC_BH | 20.2% / +5.4 / -32% | 21.5% / +6.7 / -33% | 22.1% / +7.3 / -37% | 23.0% / +8.1 / -42% | 22.0% / +7.2 / -54% |

### BTC growth cycle by cycle (UTC daily closes; Coin Metrics before 20 Jul 2015, Coinbase after)

| Measure | From | To | Price | Years | CAGR | Complete? |
|---|---|---|---|---|---|---|
| halving epoch | 2012-11-28 | 2016-07-09 | $12 → $658 | 3.6 | 200.8% | yes |
| halving epoch | 2016-07-09 | 2020-05-11 | $658 → $8,572 | 3.8 | 95.2% | yes |
| halving epoch | 2020-05-11 | 2024-04-20 | $8,572 → $64,969 | 3.9 | 67.2% | yes |
| halving epoch | 2024-04-20 | 2026-09-28 | $64,969 → $83,457 | 2.4 | 10.8% | no (to date) |
| peak to peak | 2013-12-04 | 2017-12-16 | $1,135 → $19,650 | 4.0 | 102.8% | yes |
| peak to peak | 2017-12-16 | 2021-11-08 | $19,650 → $67,555 | 3.9 | 37.3% | yes |
| peak to peak | 2021-11-08 | 2025-10-06 | $67,555 → $124,720 | 3.9 | 17.0% | yes |
| trough to trough | 2015-01-14 | 2018-12-15 | $176 → $3,183 | 3.9 | 109.5% | yes |
| trough to trough | 2018-12-15 | 2022-11-21 | $3,183 → $15,760 | 3.9 | 50.2% | yes |
| trough to trough | 2022-11-21 | 2026-06-30 | $15,760 → $58,524 | 3.6 | 43.9% | no (to date) |

### Rolling 4-year BTC CAGR (one full halving cycle, so the cycle phase is the same at both ends)

| 4 years ending | BTC CAGR |
|---|---|
| 2014-12-31 | 471.8% |
| 2015-12-31 | 209.1% |
| 2016-12-31 | 191.2% |
| 2017-12-31 | 108.8% |
| 2018-12-31 | 84.2% |
| 2019-12-31 | 102.0% |
| 2020-12-31 | 133.6% |
| 2021-12-31 | 35.1% |
| 2022-12-31 | 45.5% |
| 2023-12-31 | 55.9% |
| 2024-12-31 | 34.0% |
| 2025-12-31 | 17.3% |
| 2026-09-28 | 44.0% |

### BTC calendar-year returns (2026 = to 28 Sep)

| Year | BTC |
|---|---|
| 2011 | 1471% |
| 2012 | 187% |
| 2013 | 5286% |
| 2014 | -56% |
| 2015 | 34% |
| 2016 | 126% |
| 2017 | 1324% |
| 2018 | -73% |
| 2019 | 94% |
| 2020 | 305% |
| 2021 | 59% |
| 2022 | -64% |
| 2023 | 156% |
| 2024 | 121% |
| 2025 | -6% |
| 2026 | -5% |

### Forward BTC growth from the decay

Median of the methods: log growth 0.157 (CAGR 17.0%). Shrunk halfway to SPY's assumed 6%: **CAGR 11.4%** (the 'central' case below).

| Method | Decay factor per 4-yr cycle | Next-cycle CAGR |
|---|---|---|
| halving epoch: exponential decay of log growth per cycle (3 complete cycles) | 0.68 | 40.1% |
| peak to peak: exponential decay of log growth per cycle (3 complete cycles) | 0.47 | 7.5% |
| trough to trough: exponential decay of log growth per cycle (2 complete cycles) | 0.55 | 25.1% |
| rolling 4-year CAGR at year ends 2014-2025 + today: exponential trend, value mid-2026-2031 | 0.54 | 16.8% |
| latest peak-to-peak cycle (2021-11-08 to 2025-10-06), unshrunk |  | 17.0% |

### BTC realized volatility (daily log returns, annualized with 365 days)

| Year | BTC realized vol |
|---|---|
| 2014 | 73% |
| 2015 | 69% |
| 2016 | 50% |
| 2017 | 93% |
| 2018 | 84% |
| 2019 | 70% |
| 2020 | 81% |
| 2021 | 81% |
| 2022 | 65% |
| 2023 | 44% |
| 2024 | 53% |
| 2025 | 42% |
| 2026 | 46% |

### Choose on 2014-2019, test on 2020-2026 (21 candidate rules, IRA/ETF route)

ETH rules hold cash before ETH has enough history (2015-16). Rotation alphas are against BTC.

| Rule | IS sleeve CAGR / Sharpe | OOS sleeve CAGR / Sharpe | OOS sleeve max DD | 20% sleeve excess vs SPY, IS → OOS | Timing alpha vs own coin, IS (t) | OOS (t) |
|---|---|---|---|---|---|---|
| BTC_BH | 41% / 0.81 | 43% / 0.85 | -75% | +11.6 → +8.1 | — | — |
| BTC_10W | 60% / 1.10 | 35% / 0.85 | -50% | +11.9 → +5.6 | +27.8% (1.86) | +10.6% (0.89) |
| BTC_20W | 55% / 1.00 | 36% / 0.85 | -48% | +12.0 → +5.6 | +21.2% (1.29) | +10.4% (0.90) |
| BTC_50D | 55% / 1.05 | 46% / 1.03 | -41% | +11.4 → +7.5 | +25.5% (1.75) | +18.6% (1.58) |
| BTC_200D | 49% / 0.93 | 36% / 0.87 | -49% | +10.8 → +5.7 | +16.7% (1.10) | +11.4% (0.93) |
| BTC_10W_200D | 65% / 1.20 | 35% / 0.88 | -45% | +12.4 → +5.4 | +33.2% (2.23) | +13.0% (1.09) |
| BTC_BH_VT50 | 43% / 0.93 | 32% / 0.75 | -67% | +8.7 → +5.3 | +7.6% (1.19) | -4.0% (-0.88) |
| BTC_10W_VT50 | 57% / 1.28 | 29% / 0.80 | -42% | +10.6 → +4.0 | +28.9% (2.55) | +7.7% (0.70) |
| ETH_BH | 119% / 1.17 | 55% / 0.91 | -77% | +29.8 → +12.6 | — | — |
| ETH_10W | 127% / 1.24 | 48% / 0.89 | -60% | +26.2 → +9.6 | +37.8% (1.18) | +12.3% (0.75) |
| ETH_20W | 198% / 1.51 | 41% / 0.81 | -68% | +34.2 → +8.1 | +71.6% (2.49) | +7.6% (0.46) |
| ETH_50D | 141% / 1.30 | 68% / 1.09 | -53% | +28.1 → +12.3 | +46.8% (1.52) | +25.4% (1.68) |
| ETH_200D | 102% / 1.15 | 39% / 0.79 | -60% | +21.0 → +8.2 | +30.3% (1.04) | +5.9% (0.35) |
| ROT_MOM_10W | 143% / 1.31 | 37% / 0.78 | -64% | +29.5 → +7.9 | +91.9% (1.94) | +11.6% (0.63) |
| ROT_ETHBTC_10W | 130% / 1.25 | 34% / 0.75 | -68% | +28.2 → +7.0 | +89.1% (1.83) | +11.2% (0.56) |
| HALF_10W | 118% / 1.51 | 47% / 0.99 | -49% | +19.5 → +7.6 | +69.0% (2.41) | +18.1% (1.41) |
| BTC2X_BH | 1% / 0.73 | 15% / 0.73 | -98% | +23.8 → +14.5 | -12.7% (-3.23) | -13.6% (-5.40) |
| BTC2X_10W | 79% / 1.01 | 39% / 0.76 | -81% | +25.9 → +10.4 | +47.9% (1.55) | +13.5% (0.58) |
| BTC2X_20W | 62% / 0.95 | 38% / 0.75 | -79% | +26.8 → +10.5 | +36.8% (1.12) | +12.5% (0.55) |
| BTC2X_10W_200D | 99% / 1.11 | 43% / 0.79 | -75% | +26.8 → +9.7 | +59.6% (1.93) | +19.0% (0.81) |
| BTC_10W_VT80_L2 | 101% / 1.29 | 32% / 0.70 | -67% | +20.5 → +6.9 | +53.0% (2.62) | +7.5% (0.39) |

- **Selection by growth (IS CAGR at a 20% sleeve + 80% SPY):** winner **ETH_20W**; its OOS rank 9 of 21; Spearman IS→OOS rank correlation 0.69. IS Sharpe 1.51 (t 3.69) → Bonferroni-haircut Sharpe 1.16 (haircut 23%); realized OOS Sharpe 0.81. At a 20% sleeve its excess vs SPY went +34.2 → +8.1 points; OOS timing alpha +7.6% (t 0.46).
- **Selection by IS sleeve Sharpe:** winner **HALF_10W**; its OOS rank 3 of 21; Spearman IS→OOS rank correlation 0.23. IS Sharpe 1.51 (t 3.70) → Bonferroni-haircut Sharpe 1.16 (haircut 23%); realized OOS Sharpe 0.99. At a 20% sleeve its excess vs SPY went +19.5 → +7.6 points; OOS timing alpha +18.1% (t 1.41).
- **BTC 1x rules only (8 variants):** IS growth winner **BTC_10W_200D**: IS sleeve CAGR 65% → OOS 35%; OOS rank among BTC 1x rules by 20%-sleeve CAGR 6 of 8; OOS timing alpha t 1.09.
- **Decay across all 21 rules:** median OOS/IS Sharpe ratio 0.75; median 20%-sleeve excess +21.0 → +7.9 points. Bonferroni bar for 21 tests: t ≥ 3.04; the best OOS timing-alpha t is 1.68.


### Listed crypto ETFs vs a frictionless replica (log growth, Monday open to Monday open)

Replica = the spot price at 09:30 ET (1x, gross of fee) or 2x daily reset at UTC midnights with no financing (2x). Robinhood lists all seven as tradable with dollar orders (instruments API, 29 Sep 2026).

| ETF | Exposure | From | Weeks | Fund growth/yr | Spot growth/yr | Frictionless replica/yr | Gap/yr | Gap beyond T-bills on the borrowed unit | Weekly beta |
|---|---|---|---|---|---|---|---|---|---|
| IBIT | 1x BTC | 2024-01-16 | 141 | 24.1% | 24.9% | 24.9% | -0.8% | — | 1.03 |
| ETHA | 1x ETH | 2024-07-29 | 113 | -10.7% | -10.3% | -10.3% | -0.4% | — | 1.03 |
| BITX | 2x BTC | 2023-07-03 | 169 | 16.5% | 31.0% | 40.6% | -24.0% | -19.4% | 2.08 |
| BITU | 2x BTC | 2024-04-08 | 129 | -27.2% | 6.0% | -9.3% | -17.9% | -13.3% | 2.09 |
| BTCL | 2x BTC | 2024-07-15 | 115 | -14.8% | 13.0% | 4.7% | -19.5% | -15.0% | 2.09 |
| ETHU | 2x ETH | 2024-06-10 | 120 | -96.3% | -13.5% | -75.1% | -21.3% | -16.7% | 2.13 |
| ETHT | 2x ETH | 2024-06-10 | 120 | -96.6% | -13.5% | -75.1% | -21.6% | -17.0% | 2.11 |

### When does a 2x daily-reset BTC fund out-grow 1x? (continuous-time approximation)

Growth of an L-times daily-reset fund ≈ L·μ − (L−1)·r − extra − L²σ²/2, with μ BTC's arithmetic return. Setting L=2 equal to L=1 gives μ* = 1.5σ² + r + extra − 1x fee; the CAGR column converts μ* with g = μ − σ²/2. T-bills 4%.

| BTC vol | realized ETF carry: 2nd-unit cost | realized ETF carry: 2x beats 1x only if BTC CAGR > | cheap hypothetical: 2nd-unit cost | cheap hypothetical: 2x beats 1x only if BTC CAGR > |
|---|---|---|---|---|
| 40% | 16.6% | 39% | 7.6% | 27% |
| 50% | 16.6% | 52% | 7.6% | 39% |
| 60% | 16.6% | 69% | 7.6% | 55% |
| 70% | 16.6% | 93% | 7.6% | 76% |
| 80% | 16.6% | 124% | 7.6% | 105% |

### Sleeve alone by calendar year: 1x / 2x at realized carry / 2x at cheap carry

2x = daily reset at each UTC midnight, T-bills on the borrowed unit plus 12.8% a year (realized) or 3.9% (cheap hypothetical); 1x pays IBIT's 0.25%. 2x ETFs only exist since mid-2023.

| year | BTC_BH | BTC_10W | BTC_10W_200D | BTC vol |
|---|---|---|---|---|
| 2014 | -66% / -94% / -93% | -22% / -47% / -45% | -28% / -52% / -51% | 73% |
| 2015 | 57% / 36% / 49% | 45% / 69% / 76% | 63% / 125% / 132% | 69% |
| 2016 | 114% / 217% / 246% | 89% / 171% / 189% | 89% / 171% / 189% | 50% |
| 2017 | 1433% / 9264% / 10073% | 774% / 3303% / 3577% | 774% / 3303% / 3577% | 93% |
| 2018 | -73% / -97% / -97% | -62% / -89% / -89% | -34% / -63% / -62% | 84% |
| 2019 | 81% / 76% / 92% | 134% / 271% / 288% | 57% / 75% / 81% | 70% |
| 2020 | 261% / 358% / 402% | 206% / 568% / 609% | 133% / 303% / 325% | 81% |
| 2021 | 61% / 20% / 31% | 75% / 85% / 97% | 44% / 29% / 36% | 81% |
| 2022 | -64% / -93% / -92% | -42% / -71% / -70% | 1% / 1% / 1% | 65% |
| 2023 | 155% / 360% / 401% | 66% / 111% / 125% | 55% / 86% / 97% | 44% |
| 2024 | 102% / 159% / 183% | 28% / 15% / 23% | 18% / -1% / 6% | 53% |
| 2025 | -13% / -47% / -42% | -17% / -42% / -40% | -17% / -42% / -40% | 42% |
| 2026 | -10% / -39% / -35% | 3% / -3% / -0% | 8% / 12% / 12% | 46% |

### 1x vs 2x, sleeve alone: CAGR / max DD

| rule | 2014-2026 | 2018-2026 | 2021-2026 |
|---|---|---|---|
| BTC2X_10W (cheap carry) | 63.8% / -94% | 21.5% / -90% | 4.8% / -80% |
| BTC2X_10W (realized carry) | 56.0% / -95% | 16.0% / -90% | -0.1% / -81% |
| BTC2X_10W_200D (cheap carry) | 74.2% / -81% | 30.5% / -74% | 18.3% / -74% |
| BTC2X_10W_200D (realized carry) | 67.3% / -82% | 25.7% / -75% | 13.7% / -75% |
| BTC2X_BH (cheap carry) | 19.3% / -99% | -10.7% / -98% | -6.2% / -97% |
| BTC2X_BH (realized carry) | 8.8% / -99% | -18.5% / -99% | -14.4% / -98% |
| BTC_10W | 46.2% / -72% | 24.5% / -64% | 14.3% / -50% |
| BTC_10W_200D | 48.4% / -52% | 26.7% / -45% | 19.6% / -45% |
| BTC_BH | 42.3% / -82% | 22.5% / -77% | 18.1% / -75% |

### BTC price move between the Sunday-close signal and the fill (2016-2026)

A positive entry move and a negative exit move are both costs: the price kept going the signal's way before the fill. About 40-50 entries and exits per rule, so each mean has a standard error of about 0.4%. Cost is per year of sleeve (sleeve = 100%).

| Route (fill time) | All weeks: mean / std | 1st / 99th pct | BTC_10W: entry / exit mean move → cost a year | BTC_10W_200D: entry / exit mean move → cost a year |
|---|---|---|---|---|
| IBIT 24h market, Mon 01:00 UTC (+1 h) | +0.03% / 0.91% | -2.6% / +2.7% | +0.23% / +0.13% → 0.4% | +0.27% / +0.16% → 0.4% |
| Coinbase, Mon 02:00 UTC (+2 h) | +0.03% / 1.22% | -3.6% / +3.3% | +0.41% / +0.09% → 1.3% | +0.35% / +0.11% → 0.8% |
| IBIT at Monday 09:30 ET (+13.5 h) | +0.19% / 2.99% | -9.1% / +8.8% | +0.72% / +0.14% → 2.4% | +0.36% / -0.11% → 1.5% |

### Sleeve-alone CAGR by execution route (pre-tax)

The 24-hour-market route assumes a 0.15% half-spread overnight (not measured) and that Robinhood's 24 Hour Market accepts IRA orders for IBIT [verify in app].

| Period | Rule | Sunday close, no cost | IRA IBIT, 24h market Sun 9 pm ET, 0.15%/side | IRA ETF, Monday open, 0.05%/side | Coinbase, Sun night, 0.6%/side |
|---|---|---|---|---|---|
| 2014-2026 | BTC_BH | 42.9% | 42.4% | 42.3% | 42.7% |
| 2014-2026 | BTC_10W | 51.7% | 49.0% | 46.2% | 42.6% |
| 2014-2026 | BTC_10W_200D | 51.5% | 49.5% | 48.4% | 44.9% |
| 2014-2026 | BTC_20W | 51.9% | 49.6% | 44.5% | 46.2% |
| 2014-2026 | BTC_50D | 57.3% | 53.8% | 49.9% | 46.3% |
| 2018-2026 | BTC_BH | 23.0% | 22.9% | 22.5% | 23.3% |
| 2018-2026 | BTC_10W | 30.6% | 28.5% | 24.5% | 21.9% |
| 2018-2026 | BTC_10W_200D | 31.2% | 29.7% | 26.7% | 25.1% |
| 2018-2026 | BTC_20W | 28.3% | 26.5% | 21.9% | 23.2% |
| 2018-2026 | BTC_50D | 39.2% | 35.4% | 29.4% | 28.0% |
| 2021-2026 | BTC_BH | 17.8% | 17.5% | 18.1% | 17.4% |
| 2021-2026 | BTC_10W | 21.9% | 19.6% | 14.3% | 12.8% |
| 2021-2026 | BTC_10W_200D | 23.5% | 22.1% | 19.6% | 17.5% |
| 2021-2026 | BTC_20W | 22.2% | 19.0% | 16.3% | 14.9% |
| 2021-2026 | BTC_50D | 28.0% | 24.4% | 20.8% | 16.2% |

### Coinbase at the 0.90% taker fee reported for US entry tier from 16 Sep 2026

| Rule | Coinbase at 0.9%/side, 2014-2026 | 2021-2026 |
|---|---|---|
| BTC_10W | 39.3% | 9.9% |
| BTC_10W_200D | 42.3% | 15.3% |

### Coinbase in a taxable account: sleeve-alone CAGR after tax (stylized)

Switch rules: each year's net realized gain taxed at the rate shown (holds are mostly < 1 year), losses carried forward. BTC_BH: never sold; 20% long-term tax on the gain at the end. State tax not included.

| Rule | Tax rate | 2014-2026 | 2021-2026 |
|---|---|---|---|
| BTC_10W | 0% | 42.6% | 12.8% |
| BTC_10W | 24% | 36.3% | 9.7% |
| BTC_10W | 37% | 32.6% | 8.0% |
| BTC_10W_200D | 0% | 44.9% | 17.5% |
| BTC_10W_200D | 24% | 38.0% | 14.2% |
| BTC_10W_200D | 37% | 34.0% | 12.4% |
| BTC_BH | 0% | 42.7% | 17.4% |
| BTC_BH | 24% | 40.2% | 14.8% |
| BTC_BH | 37% | 40.2% | 14.8% |

### IBIT opening gaps (2024-01 to 2026-09)

| IBIT gap | n | Std | 1st / 99th pct | Worst |
|---|---|---|---|---|
| Friday close → Monday open | 130 | 3.57% | -8.3% / 8.1% | -22.8% |
| Other overnight gaps | 549 | 1.99% | -4.7% / 5.3% | -8.4% |

### Hindsight Kelly: the sleeve size that would have maximized CAGR (rest in SPY)

Upper bound only: it uses the realized, unshrunk path.

| Period | Rule | Hindsight growth-optimal sleeve (rest SPY) | CAGR there |
|---|---|---|---|
| 2014-2026 | BTC_BH | 90% | 44.8% |
| 2014-2026 | BTC_10W | 100% | 46.2% |
| 2014-2026 | BTC_10W_200D | 100% | 48.4% |
| 2014-2026 | BTC2X_10W | 75% | 62.6% |
| 2018-2026 | BTC_BH | 75% | 25.8% |
| 2018-2026 | BTC_10W | 75% | 26.2% |
| 2018-2026 | BTC_10W_200D | 85% | 27.0% |
| 2018-2026 | BTC2X_10W | 60% | 30.5% |
| 2021-2026 | BTC_BH | 45% | 22.4% |
| 2021-2026 | BTC_10W | 50% | 17.6% |
| 2021-2026 | BTC_10W_200D | 55% | 19.9% |
| 2021-2026 | BTC2X_10W | 40% | 18.1% |

### Growth-optimal (Kelly) BTC weight, analytic

SPY CAGR 6%, vol 17%, T-bills 4%; BTC–SPY weekly correlation 0.25 (2018-2026). Log-normal, continuously rebalanced; it ignores fat tails and trend (those are in the Monte Carlo).

| BTC CAGR assumed | BTC vol | Kelly BTC weight, rest SPY | Half Kelly | Kelly BTC weight vs T-bills (unlevered cap none) |
|---|---|---|---|---|
| 0.0% | 50% | 25% | 13% | 34% |
| 0.0% | 65% | 35% | 18% | 41% |
| 5.1% | 50% | 47% | 23% | 54% |
| 5.1% | 65% | 48% | 24% | 53% |
| 11.4% | 50% | 71% | 35% | 77% |
| 11.4% | 65% | 62% | 31% | 66% |
| 17.0% | 50% | 92% | 46% | 97% |
| 17.0% | 65% | 75% | 37% | 78% |
| 28.4% | 50% | 100% | 50% | 134% |
| 28.4% | 65% | 98% | 49% | 100% |

### Monte Carlo growth-optimal (full-Kelly) crypto weight, BTC vol 50%

Grid 0, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100% (100% = the cap: no borrowing in an IRA). Half-Kelly is half. 7-day blocks remove the multi-week trend persistence (no timing skill); 60-day blocks keep 2018-2026's persistence. LEVSPY = 2x S&P above its 200-day average, else T-bills.

| rule | base | bear, 7-day blocks | bear, 60-day blocks | central, 7-day blocks | central, 60-day blocks | bull, 7-day blocks | bull, 60-day blocks |
|---|---|---|---|---|---|---|---|
| BTC_BH | SPY | 20% | 25% | 60% | 60% | 80% | 100% |
| BTC_BH | RF | 30% | 40% | 80% | 80% | 100% | 80% |
| BTC_BH | LEVSPY | 40% | 50% | 80% | 80% | 100% | 100% |
| BTC_10W | SPY | 25% | 80% | 60% | 100% | 80% | 100% |
| BTC_10W | RF | 40% | 100% | 80% | 100% | 100% | 100% |
| BTC_10W | LEVSPY | 50% | 100% | 80% | 100% | 100% | 100% |
| BTC_10W_200D | SPY | 20% | 100% | 60% | 100% | 80% | 100% |
| BTC_10W_200D | RF | 40% | 100% | 80% | 100% | 100% | 100% |
| BTC_10W_200D | LEVSPY | 50% | 100% | 80% | 100% | 100% | 100% |
| BTC2X_10W | SPY | 0% | 40% | 25% | 50% | 30% | 60% |
| BTC2X_10W | RF | 5% | 40% | 30% | 60% | 40% | 60% |
| BTC2X_10W | LEVSPY | 10% | 50% | 30% | 60% | 40% | 80% |

### Monte Carlo growth-optimal (full-Kelly) crypto weight, BTC vol hist 65%

Grid 0, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100% (100% = the cap: no borrowing in an IRA). Half-Kelly is half. 7-day blocks remove the multi-week trend persistence (no timing skill); 60-day blocks keep 2018-2026's persistence. LEVSPY = 2x S&P above its 200-day average, else T-bills.

| rule | base | bear, 7-day blocks | bear, 60-day blocks | central, 7-day blocks | central, 60-day blocks | bull, 7-day blocks | bull, 60-day blocks |
|---|---|---|---|---|---|---|---|
| BTC_BH | SPY | 30% | 40% | 60% | 60% | 60% | 80% |
| BTC_BH | RF | 40% | 40% | 60% | 60% | 80% | 80% |
| BTC_BH | LEVSPY | 40% | 50% | 60% | 60% | 80% | 80% |
| BTC_10W | SPY | 40% | 80% | 60% | 100% | 80% | 100% |
| BTC_10W | RF | 40% | 100% | 60% | 100% | 80% | 100% |
| BTC_10W | LEVSPY | 50% | 100% | 80% | 100% | 80% | 100% |
| BTC_10W_200D | SPY | 30% | 100% | 60% | 100% | 80% | 100% |
| BTC_10W_200D | RF | 40% | 100% | 80% | 100% | 80% | 100% |
| BTC_10W_200D | LEVSPY | 50% | 100% | 80% | 100% | 80% | 100% |
| BTC2X_10W | SPY | 10% | 40% | 25% | 50% | 30% | 60% |
| BTC2X_10W | RF | 15% | 40% | 30% | 50% | 30% | 60% |
| BTC2X_10W | LEVSPY | 15% | 50% | 30% | 50% | 30% | 60% |

### Monte Carlo, 10 years, 2000 paths — bear: BTC CAGR 0%; BTC vol 50%; rest in SPY

SPY alone on the same paths: median CAGR 6.2%, P(max DD ≤ −50%) 13%. Stationary block bootstrap of 2018-2026 daily BTC and SPY log returns, re-drifted (SPY 6%, T-bills 4%). Main columns: 7-day blocks (no timing skill). Rules recomputed on each path; weekly decisions, filled a day later; 0.05%/side; 25% band; 2x at the realized ETF carry.

| Rule | Sleeve | Median CAGR | 10th–90th pct CAGR | Median excess vs SPY | P(excess > 0) | P(excess ≥ +5) | P(max DD ≤ −50%) | Median max DD | 60-day blocks: median excess / P(DD ≤ −50%) |
|---|---|---|---|---|---|---|---|---|---|
| BTC_BH | 3% | 6.4% | -1.0% – 13.6% | +0.1 | 59% | 0% | 14% | -36% | +0.2 / 10% |
| BTC_BH | 10% | 6.6% | -1.2% – 14.2% | +0.3 | 57% | 0% | 15% | -37% | +0.4 / 13% |
| BTC_BH | 20% | 6.6% | -1.6% – 15.2% | +0.4 | 55% | 8% | 22% | -40% | +0.6 / 23% |
| BTC_BH | 30% | 6.4% | -2.6% – 16.4% | +0.1 | 52% | 17% | 35% | -44% | +0.6 / 38% |
| BTC_BH | 50% | 5.4% | -6.0% – 18.9% | -0.8 | 46% | 24% | 66% | -56% | -0.1 / 72% |
| BTC_10W | 3% | 6.3% | -0.9% – 13.5% | +0.1 | 58% | 0% | 13% | -35% | +0.3 / 8% |
| BTC_10W | 10% | 6.4% | -0.5% – 13.8% | +0.2 | 57% | 0% | 11% | -34% | +1.1 / 6% |
| BTC_10W | 20% | 6.4% | -0.5% – 14.0% | +0.3 | 55% | 4% | 10% | -34% | +2.0 / 5% |
| BTC_10W | 30% | 6.2% | -1.1% – 14.3% | +0.2 | 52% | 11% | 12% | -35% | +2.8 / 6% |
| BTC_10W | 50% | 5.6% | -2.5% – 16.0% | -0.4 | 48% | 22% | 27% | -41% | +4.1 / 15% |
| BTC_10W_200D | 3% | 6.2% | -0.8% – 13.5% | +0.1 | 57% | 0% | 13% | -35% | +0.3 / 8% |
| BTC_10W_200D | 10% | 6.4% | -0.6% – 13.5% | +0.2 | 55% | 0% | 10% | -34% | +1.0 / 5% |
| BTC_10W_200D | 20% | 6.4% | -0.4% – 13.5% | +0.2 | 53% | 3% | 8% | -33% | +1.9 / 3% |
| BTC_10W_200D | 30% | 6.2% | -0.8% – 13.9% | +0.1 | 51% | 9% | 9% | -33% | +2.6 / 2% |
| BTC_10W_200D | 50% | 5.5% | -2.1% – 15.0% | -0.4 | 47% | 18% | 14% | -37% | +3.9 / 4% |
| BTC2X_10W | 3% | 6.2% | -1.1% – 13.6% | -0.0 | 48% | 0% | 14% | -36% | +0.5 / 9% |
| BTC2X_10W | 10% | 5.9% | -1.7% – 14.0% | -0.3 | 45% | 2% | 19% | -38% | +1.4 / 11% |
| BTC2X_10W | 20% | 4.7% | -3.7% – 14.8% | -1.2 | 41% | 11% | 35% | -45% | +2.3 / 22% |
| BTC2X_10W | 30% | 3.4% | -6.4% – 16.0% | -2.5 | 37% | 16% | 60% | -54% | +2.7 / 45% |
| BTC2X_10W | 50% | -0.8% | -14.0% – 17.2% | -6.8 | 30% | 17% | 94% | -73% | +2.2 / 87% |

### Monte Carlo, 10 years, 2000 paths — central: BTC CAGR 11.4%; BTC vol 50%; rest in SPY

SPY alone on the same paths: median CAGR 6.2%, P(max DD ≤ −50%) 13%. Stationary block bootstrap of 2018-2026 daily BTC and SPY log returns, re-drifted (SPY 6%, T-bills 4%). Main columns: 7-day blocks (no timing skill). Rules recomputed on each path; weekly decisions, filled a day later; 0.05%/side; 25% band; 2x at the realized ETF carry.

| Rule | Sleeve | Median CAGR | 10th–90th pct CAGR | Median excess vs SPY | P(excess > 0) | P(excess ≥ +5) | P(max DD ≤ −50%) | Median max DD | 60-day blocks: median excess / P(DD ≤ −50%) |
|---|---|---|---|---|---|---|---|---|---|
| BTC_BH | 3% | 6.7% | -0.7% – 14.0% | +0.5 | 84% | 0% | 13% | -36% | +0.5 / 9% |
| BTC_BH | 10% | 7.8% | -0.1% – 15.4% | +1.4 | 82% | 2% | 13% | -35% | +1.6 / 11% |
| BTC_BH | 20% | 8.8% | 0.5% – 17.8% | +2.7 | 80% | 25% | 16% | -38% | +2.9 / 18% |
| BTC_BH | 30% | 9.9% | 0.5% – 20.2% | +3.6 | 78% | 39% | 25% | -41% | +4.1 / 27% |
| BTC_BH | 50% | 11.0% | -1.1% – 25.7% | +5.0 | 74% | 50% | 51% | -50% | +5.6 / 59% |
| BTC_10W | 3% | 6.5% | -0.7% – 13.7% | +0.3 | 76% | 0% | 12% | -35% | +0.5 / 8% |
| BTC_10W | 10% | 7.2% | 0.0% – 14.6% | +0.9 | 75% | 0% | 10% | -34% | +1.6 / 6% |
| BTC_10W | 20% | 7.7% | 0.5% – 15.6% | +1.5 | 73% | 12% | 9% | -33% | +3.2 / 5% |
| BTC_10W | 30% | 8.2% | 0.5% – 17.0% | +2.1 | 71% | 27% | 10% | -34% | +4.6 / 6% |
| BTC_10W | 50% | 8.8% | -0.3% – 20.1% | +2.7 | 67% | 38% | 21% | -40% | +7.0 / 14% |
| BTC_10W_200D | 3% | 6.4% | -0.7% – 13.6% | +0.2 | 72% | 0% | 12% | -35% | +0.4 / 8% |
| BTC_10W_200D | 10% | 6.9% | -0.2% – 14.1% | +0.7 | 71% | 0% | 10% | -34% | +1.5 / 5% |
| BTC_10W_200D | 20% | 7.4% | 0.4% – 14.9% | +1.2 | 70% | 9% | 8% | -32% | +2.8 / 3% |
| BTC_10W_200D | 30% | 7.8% | 0.5% – 16.0% | +1.6 | 67% | 20% | 7% | -32% | +4.0 / 3% |
| BTC_10W_200D | 50% | 8.1% | -0.4% – 18.6% | +2.1 | 63% | 34% | 12% | -36% | +6.2 / 4% |
| BTC2X_10W | 3% | 6.5% | -0.8% – 14.0% | +0.3 | 66% | 0% | 14% | -36% | +0.8 / 9% |
| BTC2X_10W | 10% | 7.0% | -0.6% – 15.5% | +0.9 | 64% | 8% | 16% | -37% | +2.5 / 10% |
| BTC2X_10W | 20% | 7.4% | -2.0% – 18.0% | +1.2 | 59% | 25% | 30% | -43% | +4.5 / 21% |
| BTC2X_10W | 30% | 7.1% | -3.9% – 20.9% | +1.0 | 54% | 32% | 53% | -51% | +6.0 / 42% |
| BTC2X_10W | 50% | 4.9% | -10.1% – 25.3% | -1.3 | 46% | 32% | 91% | -69% | +7.3 / 84% |

### Monte Carlo, 10 years, 2000 paths — bull: BTC CAGR 17.0%; BTC vol 50%; rest in SPY

SPY alone on the same paths: median CAGR 6.2%, P(max DD ≤ −50%) 13%. Stationary block bootstrap of 2018-2026 daily BTC and SPY log returns, re-drifted (SPY 6%, T-bills 4%). Main columns: 7-day blocks (no timing skill). Rules recomputed on each path; weekly decisions, filled a day later; 0.05%/side; 25% band; 2x at the realized ETF carry.

| Rule | Sleeve | Median CAGR | 10th–90th pct CAGR | Median excess vs SPY | P(excess > 0) | P(excess ≥ +5) | P(max DD ≤ −50%) | Median max DD | 60-day blocks: median excess / P(DD ≤ −50%) |
|---|---|---|---|---|---|---|---|---|---|
| BTC_BH | 3% | 6.9% | -0.5% – 14.2% | +0.6 | 91% | 0% | 12% | -35% | +0.6 / 9% |
| BTC_BH | 10% | 8.3% | 0.3% – 16.0% | +2.0 | 90% | 4% | 12% | -35% | +2.1 / 10% |
| BTC_BH | 20% | 10.0% | 1.5% – 18.9% | +3.7 | 88% | 36% | 14% | -37% | +4.0 / 15% |
| BTC_BH | 30% | 11.5% | 2.1% – 22.0% | +5.3 | 87% | 52% | 21% | -40% | +5.7 / 24% |
| BTC_BH | 50% | 14.0% | 1.3% – 29.0% | +7.7 | 83% | 62% | 45% | -48% | +8.3 / 52% |
| BTC_10W | 3% | 6.6% | -0.7% – 13.9% | +0.4 | 83% | 0% | 12% | -35% | +0.6 / 8% |
| BTC_10W | 10% | 7.5% | 0.2% – 14.9% | +1.2 | 81% | 1% | 10% | -34% | +1.9 / 6% |
| BTC_10W | 20% | 8.4% | 0.8% – 16.3% | +2.2 | 79% | 18% | 8% | -33% | +3.7 / 5% |
| BTC_10W | 30% | 9.2% | 1.2% – 18.3% | +3.1 | 78% | 35% | 9% | -34% | +5.4 / 5% |
| BTC_10W | 50% | 10.5% | 0.9% – 22.0% | +4.3 | 75% | 47% | 19% | -39% | +8.4 / 12% |
| BTC_10W_200D | 3% | 6.5% | -0.7% – 13.8% | +0.3 | 78% | 0% | 12% | -35% | +0.5 / 8% |
| BTC_10W_200D | 10% | 7.2% | 0.0% – 14.6% | +1.0 | 77% | 0% | 10% | -33% | +1.7 / 5% |
| BTC_10W_200D | 20% | 8.0% | 0.7% – 15.6% | +1.8 | 76% | 13% | 7% | -32% | +3.3 / 3% |
| BTC_10W_200D | 30% | 8.6% | 1.0% – 17.1% | +2.5 | 74% | 28% | 6% | -32% | +4.7 / 3% |
| BTC_10W_200D | 50% | 9.4% | 0.5% – 20.5% | +3.5 | 71% | 42% | 12% | -36% | +7.4 / 5% |
| BTC2X_10W | 3% | 6.7% | -0.7% – 14.3% | +0.5 | 74% | 0% | 14% | -36% | +1.0 / 9% |
| BTC2X_10W | 10% | 7.7% | -0.3% – 16.2% | +1.5 | 71% | 12% | 16% | -37% | +3.1 / 10% |
| BTC2X_10W | 20% | 8.7% | -1.1% – 19.5% | +2.5 | 68% | 33% | 27% | -42% | +5.6 / 20% |
| BTC2X_10W | 30% | 8.9% | -2.6% – 23.1% | +2.8 | 64% | 40% | 50% | -50% | +7.7 / 42% |
| BTC2X_10W | 50% | 7.5% | -8.3% – 29.1% | +1.7 | 55% | 40% | 90% | -67% | +10.0 / 84% |

### KEY TABLE — rule × sleeve size

History: IRA/ETF route, rest in SPY, weekly marks. Forward: Monte Carlo central case (BTC CAGR 11.4%, vol 50%, SPY 6%, no timing skill), 10 years. Growth-optimal sleeve (rest SPY), central case: BTC_BH 60%, BTC_10W 60%, BTC_10W_200D 60%, BTC2X_10W 25%.

| Rule | Sleeve | 2014-2026: CAGR / excess / max DD | 2018-2026: CAGR / excess / max DD | 2021-2026: CAGR / excess / max DD | Worst year 2014-26 | Forward median excess (central) | P(10-yr excess ≥ +5) | P(DD ≤ −50%) |
|---|---|---|---|---|---|---|---|---|
| BTC_BH | 3% | 15.4% / +1.6 / -32% | 15.5% / +0.9 / -32% | 15.4% / +0.5 / -25% | -19% (2022) | +0.5 | 0% | 13% |
| BTC_BH | 10% | 19.0% / +5.2 / -31% | 17.8% / +3.3 / -31% | 16.7% / +1.9 / -28% | -24% (2022) | +1.4 | 2% | 13% |
| BTC_BH | 20% | 23.7% / +9.8 / -34% | 20.1% / +5.6 / -34% | 18.3% / +3.4 / -34% | -29% (2022) | +2.7 | 25% | 16% |
| BTC_BH | 30% | 28.0% / +14.2 / -41% | 22.5% / +7.9 / -41% | 18.9% / +4.0 / -40% | -35% (2022) | +3.6 | 39% | 25% |
| BTC_BH | 50% | 35.1% / +21.3 / -56% | 24.6% / +10.1 / -53% | 20.9% / +6.0 / -53% | -49% (2018) | +5.0 | 50% | 51% |
| BTC_10W | 3% | 15.2% / +1.4 / -31% | 15.2% / +0.7 / -31% | 15.1% / +0.3 / -23% | -18% (2022) | +0.3 | 0% | 12% |
| BTC_10W | 10% | 18.2% / +4.4 / -30% | 16.7% / +2.2 / -30% | 15.7% / +0.8 / -24% | -20% (2022) | +0.9 | 0% | 10% |
| BTC_10W | 20% | 22.4% / +8.5 / -27% | 18.6% / +4.0 / -27% | 16.2% / +1.3 / -25% | -23% (2022) | +1.5 | 12% | 9% |
| BTC_10W | 30% | 26.9% / +13.1 / -34% | 20.5% / +6.0 / -30% | 16.7% / +1.9 / -28% | -28% (2018) | +2.1 | 27% | 10% |
| BTC_10W | 50% | 35.5% / +21.7 / -47% | 23.7% / +9.2 / -41% | 17.6% / +2.7 / -35% | -40% (2018) | +2.7 | 38% | 21% |
| BTC_10W_200D | 3% | 15.2% / +1.4 / -31% | 15.2% / +0.6 / -31% | 15.2% / +0.4 / -23% | -17% (2022) | +0.2 | 0% | 12% |
| BTC_10W_200D | 10% | 18.2% / +4.4 / -30% | 16.6% / +2.1 / -30% | 16.0% / +1.1 / -21% | -16% (2022) | +0.7 | 0% | 10% |
| BTC_10W_200D | 20% | 22.5% / +8.7 / -27% | 18.7% / +4.1 / -27% | 17.2% / +2.3 / -20% | -14% (2022) | +1.2 | 9% | 8% |
| BTC_10W_200D | 30% | 26.8% / +13.0 / -25% | 20.4% / +5.8 / -25% | 17.8% / +2.9 / -19% | -16% (2018) | +1.6 | 20% | 7% |
| BTC_10W_200D | 50% | 35.8% / +22.0 / -31% | 23.8% / +9.3 / -29% | 19.7% / +4.9 / -23% | -22% (2018) | +2.1 | 34% | 12% |
| BTC2X_10W | 3% | 16.4% / +2.6 / -31% | 15.8% / +1.2 / -31% | 15.3% / +0.4 / -24% | -19% (2022) | +0.3 | 0% | 14% |
| BTC2X_10W | 10% | 22.5% / +8.7 / -30% | 18.6% / +4.0 / -30% | 16.3% / +1.5 / -27% | -24% (2022) | +0.9 | 8% | 16% |
| BTC2X_10W | 20% | 31.3% / +17.5 / -44% | 21.9% / +7.4 / -38% | 16.8% / +1.9 / -34% | -36% (2018) | +1.2 | 25% | 30% |
| BTC2X_10W | 30% | 39.7% / +25.9 / -56% | 25.2% / +10.6 / -49% | 17.2% / +2.3 / -42% | -48% (2018) | +1.0 | 32% | 53% |
| BTC2X_10W | 50% | 50.8% / +36.9 / -73% | 27.6% / +13.0 / -65% | 15.0% / +0.1 / -56% | -66% (2018) | -1.3 | 32% | 91% |

**State at the 2026-09-27 close:** BTC 84,462; 10-week average 73,468; 20-week 70,318; 50-day 76,103; 200-day 71,073; 60-day vol 43%. Switches: BTC_10W ON, BTC_20W ON, BTC_50D ON, BTC_200D ON, BTC_10W_200D ON, ETH_10W ON.

