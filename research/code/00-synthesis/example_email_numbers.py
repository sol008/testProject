"""Numbers for the corrected worked example in 00-SYNTHESIS.md §7 (after the red-team review).

Preset: Growth (85% core / 15% T-bill reserve). Illustrative portfolio of $300,000 at the
19 Feb 2020 S&P 500 peak. Crash tranches are shares of the reserve balance when the episode's first
trigger fires (normal regime: 10/20/30/40% at -20/-30/-40/-50%).

Also scores each pre-2020 reference episode (first close <= -30% from the all-time high) under the
tranche exit rule: exit when the index regains its pre-crash high, otherwise the tranche is valued at
5 years (and merges into the core). Price index only (dividends ignored, which is conservative).
"""
import numpy as np
import pandas as pd
import yfinance as yf

spx = yf.download("^GSPC", start="1927-12-01", end="2026-09-29", progress=False, auto_adjust=True)["Close"].squeeze()
spy = yf.download("SPY", start="2020-02-01", end="2020-12-31", progress=False, auto_adjust=False)["Close"].squeeze()

# --- 2020 example -------------------------------------------------------------------------------
peak_d, t1_sig, t1_fill, t2_sig, t2_fill, exit_d = "2020-02-19", "2020-03-12", "2020-03-13", "2020-03-20", "2020-03-23", "2020-08-18"
P0 = 300_000.0
core0, res0 = 0.85 * P0, 0.15 * P0
spy_peak = float(spy.loc[peak_d])
t1_amt = 0.10 * res0
t1_sh = int(t1_amt // float(spy.loc[t1_sig]))
t1_cost = t1_sh * float(spy.loc[t1_fill])
core_t2 = core0 * float(spy.loc[t2_sig]) / spy_peak
t1_val_t2 = t1_cost * float(spy.loc[t2_sig]) / float(spy.loc[t1_fill])
res_t2 = res0 - t1_cost
port_t2 = core_t2 + t1_val_t2 + res_t2
t2_amt = 0.20 * res0
t2_sh = int(t2_amt // float(spy.loc[t2_sig]))
t2_val = t2_sh * float(spy.loc[t2_sig])
print(f"SPY peak {spy_peak:.2f}; T1 signal close {float(spy.loc[t1_sig]):.2f}; T1 fill {float(spy.loc[t1_fill]):.2f}; "
      f"T2 signal close {float(spy.loc[t2_sig]):.2f}; T2 fill(close) {float(spy.loc[t2_fill]):.2f}; exit {float(spy.loc[exit_d]):.2f}")
print(f"T1: {t1_sh} sh cost ${t1_cost:,.0f}; at 20 Mar worth ${t1_val_t2:,.0f}")
print(f"Portfolio 20 Mar: core ${core_t2:,.0f}, T1 ${t1_val_t2:,.0f}, reserve ${res_t2:,.0f}, total ${port_t2:,.0f}")
print(f"T2: {t2_sh} sh = ${t2_val:,.0f} = {t2_val/port_t2*100:.1f}% of portfolio")
eq_after = (core_t2 + t1_val_t2 + t2_val) / port_t2
print(f"Stock exposure after T2: {eq_after*100:.1f}%; reserve after: {(res_t2 - t2_val)/port_t2*100:.1f}%")
for lbl, dd in (("-50% planning stress", -0.50), ("-78.5% worst path low", -0.785)):
    print(f"  {lbl}: tranche ${t2_val*dd:,.0f} = {t2_val*dd/port_t2*100:.1f}% of portfolio")
# whole-portfolio path low in a 1929-type continuation: equity sleeves fall a further 78.5% from here
port_low = (core_t2 + t1_val_t2 + t2_val) * (1 - 0.785) + (res_t2 - t2_val)
print(f"  whole portfolio in that path: ${port_low:,.0f} = {(port_low/P0-1)*100:.1f}% from the Feb peak")
g2 = float(spy.loc[exit_d]) / float(spy.loc[t2_fill]) - 1
g1 = float(spy.loc[exit_d]) / float(spy.loc[t1_fill]) - 1
print(f"Outcome: T2 +{g2*100:.1f}% (${t2_val*g2:,.0f}, {t2_val*g2/port_t2*100:.1f}% of portfolio); T1 +{g1*100:.1f}%")
print(f"Tranche 3/4 levels: -40% {3386.15*0.6:.2f}, -50% {3386.15*0.5:.2f}; T3 = 30% of reserve = ${0.30*res0:,.0f}, T4 = 40% = ${0.40*res0:,.0f}")

# --- reference class scored under the exit rule -------------------------------------------------
ath = spx.cummax(); dd = spx / ath - 1
rows = []; in_ep = False
for t, d in dd.items():
    if not in_ep and d <= -0.30 and t < pd.Timestamp("2020-01-01"):
        in_ep = True
        e_px = float(spx.loc[t]); ref = float(ath.loc[t])
        after = spx.loc[t:]
        hit = after[after >= ref]
        t5 = t + pd.DateOffset(years=5)
        if len(hit) and hit.index[0] <= t5:
            out = ref / e_px - 1; how = f"new high after {(hit.index[0]-t).days/365.25:.1f}y"; t_exit = hit.index[0]
        else:
            p5 = float(spx.iloc[spx.index.searchsorted(t5)])
            out = p5 / e_px - 1; how = "valued at 5y (merges into core)"; t_exit = t5
        held = after.loc[:t_exit]  # only while the tranche is held
        low_after = float(held.min()) / e_px - 1
        touched40 = bool((held <= 0.60 * ref).any()); touched50 = bool((held <= 0.50 * ref).any())
        up1 = float(spx.iloc[spx.index.searchsorted(t + pd.DateOffset(years=1))]) > e_px
        rows.append({"entry": t.date(), "tranche_result_pct": round(out * 100, 1), "how": how,
                     "worst_low_after_entry_pct": round(low_after * 100, 1), "touched_-40": touched40,
                     "touched_-50": touched50, "higher_after_1y": up1})
    if in_ep and d == 0:
        in_ep = False
ref = pd.DataFrame(rows)
print(ref.to_string(index=False))
print("mean tranche result %:", round(ref.tranche_result_pct.mean(), 1), "; median:", ref.tranche_result_pct.median())
ref.to_csv("example_reference_class.csv", index=False)
