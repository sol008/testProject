## A. 10x rate by absolute starting market cap (2010-2021 cohorts)

| mcap | N | %10x | %5x | %lost>=80% | median_x | mean_x |
|---|---|---|---|---|---|---|
| <$100M | 3171 | 1.77 | 5.8 | 19.2 | 1.07 | 1.85 |
| $100-300M | 3019 | 0.86 | 4.3 | 11.6 | 1.28 | 1.69 |
| $300M-1B | 4419 | 0.59 | 4.2 | 7 | 1.38 | 1.78 |
| $1-2B | 3060 | 0.52 | 2.9 | 4.1 | 1.46 | 1.78 |
| $2-10B | 6080 | 0.26 | 2.3 | 3.2 | 1.49 | 1.75 |
| >$10B | 4078 | 0.27 | 1.9 | 1.3 | 1.59 | 1.81 |

## B. 10x rate by starting share price (2005-2021 cohorts)

| price | N | %10x | %5x | %lost>=80% | median_x | mean_x |
|---|---|---|---|---|---|---|
| $1-3 | 2427 | 2.64 | 8.9 | 25.5 | 0.84 | 2.04 |
| $3-5 | 1773 | 1.52 | 6.5 | 17.5 | 0.97 | 1.75 |
| $5-10 | 3826 | 0.94 | 5.6 | 10.1 | 1.34 | 1.83 |
| $10-20 | 6506 | 0.46 | 3.6 | 5 | 1.43 | 1.77 |
| $20-50 | 11495 | 0.23 | 1.9 | 2.6 | 1.42 | 1.67 |
| >$50 | 8190 | 0.24 | 1.8 | 2.2 | 1.46 | 1.69 |

## C. Regime: cohorts formed within ~4 months of a bear-market low (Jun-2009, Jun-2016 small-cap low, Jun-2020) vs the rest

| cohorts | N | %10x | %5x | %lost>=80% | median_x | mean_x |
|---|---|---|---|---|---|---|
| post-crash (2009, 2016, 2020) | 6503 | 1.55 | 7 | 5.4 | 1.77 | 2.33 |
| all other (14) | 27714 | 0.37 | 2.5 | 6.4 | 1.32 | 1.6 |

## D. Census: stocks with at least one month-end-to-month-end 60-month window >= 10x (starts 2005-01..2021-09)

US-domiciled survivors with any eligible start month: 2870; with >=1 ten-bagger 5y window: 347 (12.1%). Share of (stock, start-month) windows that are 10x: 0.67%

Top 30 best 5-year windows (multiple): ENPH 232x, CHRD 106x, GBTC 84x, APPS 73x, CELH 69x, ASTH 62x, FATE 51x, AMD 50x, PATK 50x, ARWR 49x, AMTX 48x, SMCI 48x, FTLF 46x, INOD 46x, LMB 45x, DDD 44x, LVS 42x, JYNT 41x, AEHR 41x, EVI 40x, CYRX 40x, ACAD 40x, TTD 39x, STRL 38x, NXST 38x, LEU 38x, TDS 38x, VRTS 37x, LQDA 37x, FIVN 35x

Share of 60m windows that are 10x, by start year: 2005: 0.11%, 2006: 0.10%, 2007: 0.04%, 2008: 0.86%, 2009: 2.09%, 2010: 0.63%, 2011: 0.31%, 2012: 0.43%, 2013: 0.33%, 2014: 0.25%, 2015: 0.59%, 2016: 1.81%, 2017: 0.54%, 2018: 0.50%, 2019: 0.72%, 2020: 1.07%, 2021: 0.70%

## E. Daily path statistics of the cohort ten-baggers (entry at June month-end, 5-year window)

| index | maxDD | n_dd30 | n_dd50 | pct_days_20pct_below_peak | min_vs_entry | yrs_to_first_2x | yrs_to_first_10x |
|---|---|---|---|---|---|---|---|
| 0.1 | -0.81 | 1 | 0 | 0.07 | 0.46 | 0.21 | 1.59 |
| 0.25 | -0.68 | 2 | 0 | 0.2 | 0.67 | 0.47 | 3.03 |
| 0.5 | -0.56 | 3 | 1 | 0.33 | 0.86 | 0.87 | 3.95 |
| 0.75 | -0.47 | 4 | 2 | 0.5 | 0.95 | 1.66 | 4.51 |
| 0.9 | -0.36 | 5 | 2.8 | 0.7 | 0.99 | 2.58 | 4.79 |

Share of 10-baggers with a daily drawdown >=50% inside the window: 59%; >=40%: 85%; >=30%: 96%; that traded below the entry price at some point: 94%; that fell >=30% below entry at some point: 28%

## F. Holding rules on monthly paths (all 2005-2021 cohort windows; cash earns 0 after exit)


### Pool: all 2005-2021 (N=34217)

| rule | mean_x | median_x | %>=10x | %>=5x | %<=0.5x | p99_x |
|---|---|---|---|---|---|---|
| hold | 1.74 | 1.39 | 0.59 | 3.33 | 14.2 | 8.11 |
| stop_-50%_from_cost | 1.63 | 1.28 | 0.54 | 3.07 | 31.3 | 7.81 |
| trail_-30% | 1.33 | 0.95 | 0.16 | 1.29 | 2.2 | 5.46 |
| trail_-50% | 1.53 | 1.15 | 0.42 | 2.49 | 17.3 | 7.17 |
| trim_half_at_3x | 1.69 | 1.44 | 0.24 | 1.68 | 13.6 | 5.78 |
| trim_half_at_10x | 1.75 | 1.4 | 0.7 | 3.63 | 14.1 | 9.05 |
| sell_all_at_3x | 1.63 | 1.44 | 0.01 | 0.23 | 13.6 | 3.92 |

### Pool: small caps $50M-2B (2010-21) (N=11955)

| rule | mean_x | median_x | %>=10x | %>=5x | %<=0.5x | p99_x |
|---|---|---|---|---|---|---|
| hold | 1.75 | 1.35 | 0.72 | 3.96 | 17.6 | 8.63 |
| stop_-50%_from_cost | 1.65 | 1.23 | 0.66 | 3.58 | 33.1 | 8.5 |
| trail_-30% | 1.33 | 0.94 | 0.25 | 1.42 | 2.5 | 5.81 |
| trail_-50% | 1.55 | 1.1 | 0.57 | 2.91 | 18 | 7.75 |
| trim_half_at_3x | 1.7 | 1.43 | 0.33 | 2.07 | 16.7 | 6.1 |
| trim_half_at_10x | 1.76 | 1.36 | 0.85 | 4.31 | 17.5 | 9.57 |
| sell_all_at_3x | 1.64 | 1.43 | 0.02 | 0.27 | 16.7 | 4.05 |

### Pool: lottery (px<$5 & vol top quintile) (N=3151)

| rule | mean_x | median_x | %>=10x | %>=5x | %<=0.5x | p99_x |
|---|---|---|---|---|---|---|
| hold | 1.83 | 0.74 | 2.28 | 7.58 | 41.4 | 17.82 |
| stop_-50%_from_cost | 1.63 | 0.48 | 2.03 | 6.54 | 65 | 17.62 |
| trail_-30% | 1.24 | 0.74 | 0.63 | 2.51 | 5 | 8.11 |
| trail_-50% | 1.47 | 0.64 | 1.52 | 4.82 | 35.5 | 12.68 |
| trim_half_at_3x | 1.71 | 0.9 | 1.24 | 5.24 | 38.6 | 10.59 |
| trim_half_at_10x | 1.85 | 0.74 | 2.73 | 9.46 | 41.2 | 15.28 |
| sell_all_at_3x | 1.59 | 0.9 | 0.06 | 1.62 | 38.6 | 5.76 |
