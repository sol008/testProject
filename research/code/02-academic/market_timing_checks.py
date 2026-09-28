"""Timing-style claims tested on the US market with Ken French data (1926-07..2026-08).

1) Single-asset trend / time-series momentum on the US market (12m TSMOM, 10m SMA).
2) Volatility-managed market (Moreira-Muir 2017), full-sample-scaled vs real-time scaled.
3) Volatility-scaled momentum (Barroso & Santa-Clara 2015).
4) Forward returns after the market first crosses drawdown thresholds (-10..-50%).
5) Turn-of-the-month effect (days -1..+3) across publication sub-periods.

All results are gross of taxes; trading-cost assumptions noted inline.
Run:  python market_timing_checks.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm

from kf_utils import daily_returns, fmt_pct, monthly_returns, stats

ff3 = monthly_returns("F-F_Research_Data_Factors")
mom_m = monthly_returns("F-F_Momentum_Factor").iloc[:, 0].rename("UMD")
rf = ff3["RF"]
mkt = ff3["Mkt-RF"] + rf  # total return, VW CRSP
d3 = daily_returns("F-F_Research_Data_Factors_daily")
dmom = daily_returns("F-F_Momentum_Factor_daily").iloc[:, 0]
dmkt = d3["Mkt-RF"] + d3["RF"]


def sub(s, a=None, b=None):
    s = s.dropna()
    if a:
        s = s[s.index >= (pd.Period(a, "M") if isinstance(s.index, pd.PeriodIndex) else pd.Timestamp(a))]
    if b:
        s = s[s.index <= (pd.Period(b, "M") if isinstance(s.index, pd.PeriodIndex) else pd.Timestamp(b))]
    return s


PER = [("1927-2026", "1927-01", None), ("1927-1999", "1927-01", "1999-12"), ("2000-2026", "2000-01", None), ("2010-2026", "2010-01", None)]


def row(lbl, pname, r, exposure=None, switches=None, excess=None):
    d = stats(r)
    ex = r - rf.reindex(r.index)
    sh = ex.mean() / ex.std() * np.sqrt(12)
    extra = ""
    if exposure is not None:
        extra = f" | {fmt_pct(exposure.mean(), 0)} | {switches:.2f}"
    else:
        extra = " | 100% | 0"
    print(f"| {lbl} | {pname} | {fmt_pct(d['cagr'])} | {fmt_pct(d['ann_vol'])} | {sh:.2f} | {fmt_pct(d['max_dd'])} | {fmt_pct(d['worst_12m'])}{extra} |")


# ============================================================ 1) trend on the US market
idx = (1 + mkt).cumprod()
ex12 = ((1 + mkt).rolling(12).apply(np.prod, raw=True) - (1 + rf).rolling(12).apply(np.prod, raw=True))
sig_ts = (ex12 > 0).astype(float).shift(1)  # decide at end of t-1, hold during t
sma10 = idx.rolling(10).mean()
sig_sma = (idx > sma10).astype(float).shift(1)
COST = 0.001  # 10 bp per switch (ETF spread + slippage); applied on the switch month
res = {}
for name, sig in [("12m TSMOM (long mkt if 12m excess>0 else T-bills)", sig_ts), ("10m SMA (Faber)", sig_sma)]:
    sw = sig.diff().abs().fillna(0)
    r = sig * mkt + (1 - sig) * rf - sw * COST
    res[name] = (r.dropna(), sig.dropna(), sw)

print("## 1) Trend-following on the US market alone (monthly signals, 10bp per switch)\n")
print("| Strategy | Period | CAGR | Vol | Sharpe | Max DD | Worst 12m | % time in market | Switches / yr |")
print("|---|---|---:|---:|---:|---:|---:|---:|---:|")
for pname, a, b in PER:
    row("Buy & hold market", pname, sub(mkt, a, b))
    for name, (r, sig, sw) in res.items():
        rr = sub(r, a, b)
        ss = sig.reindex(rr.index)
        swy = sw.reindex(rr.index).sum() / (len(rr) / 12)
        row(name, pname, rr, ss, swy)

# ============================================================ 2) vol-managed market
rv = (d3["Mkt-RF"] ** 2).groupby(d3.index.to_period("M")).sum()  # monthly realized variance
f = ff3["Mkt-RF"]
inv = (1 / rv).shift(1).reindex(f.index)
raw = inv * f
c_full = f.std() / raw.std()  # MM-style: match unconditional vol in full sample (look-ahead)
vm_full = c_full * raw
# real-time: c chosen from data up to t-1 (expanding, min 120m), and leverage capped
c_rt = (f.expanding(120).std() / raw.expanding(120).std()).shift(1)
w_rt = (c_rt * inv)
vm_rt = (w_rt * f).dropna()
w_cap = (c_rt * inv).clip(upper=1.5)
vm_cap = (w_cap * f).dropna()

print("\n## 2) Volatility-managed market (Moreira-Muir 2017): weight = c / RV(t-1)\n")
print("| Version | Period | Ann. excess mean | Vol | Sharpe | Alpha vs market (ann., t) | Max DD (excess) | Avg weight | Max weight |")
print("|---|---|---:|---:|---:|---:|---:|---:|---:|")
for pname, a, b in [("1926-2026 (MM sample start)", "1926-08", None), ("1936-2026 (after 10y burn-in)", "1936-08", None), ("1936-1999", "1936-08", "1999-12"), ("2000-2026", "2000-01", None), ("2010-2026", "2010-01", None)]:
    for lbl, s, w in [("Unmanaged market", f, None), ("VM, full-sample c (look-ahead)", vm_full, c_full * inv), ("VM, real-time c, uncapped", vm_rt, w_rt), ("VM, real-time c, cap 1.5x", vm_cap, w_cap)]:
        if pname.startswith("1926") and "real-time" in lbl:
            continue  # real-time scaling needs a 120m burn-in
        x = sub(s, a, b)
        d = stats(x)
        if w is None:
            al, t = 0.0, np.nan
            aw, mw = 1.0, 1.0
        else:
            ff = f.reindex(x.index)
            m = sm.OLS(x, sm.add_constant(ff)).fit(cov_type="HAC", cov_kwds={"maxlags": 6})
            al, t = m.params.iloc[0] * 12, m.tvalues.iloc[0]
            ww = w.reindex(x.index)
            aw, mw = ww.mean(), ww.max()
        print(f"| {lbl} | {pname} | {fmt_pct(d['ann_mean'])} | {fmt_pct(d['ann_vol'])} | {d['sharpe']:.2f} | {fmt_pct(al)} ({t:.2f}) | {fmt_pct(d['max_dd'])} | {aw:.2f} | {mw:.2f} |")

# ============================================================ 3) vol-scaled momentum
rv_mom = (dmom ** 2).rolling(126).sum() * (252 / 126)  # annualized variance, trailing 126 days
rv_mom_m = rv_mom.groupby(rv_mom.index.to_period("M")).last().shift(1)  # known at end of t-1
TARGET = 0.12
w_bsc = (TARGET / np.sqrt(rv_mom_m)).reindex(mom_m.index)
umd_bsc = (w_bsc * mom_m).dropna()
w_bsc_cap = w_bsc.clip(upper=2.0)
umd_bsc_cap = (w_bsc_cap * mom_m).dropna()
print("\n## 3) Volatility-scaled momentum (Barroso & Santa-Clara 2015; 12% target, 126d realized vol)\n")
print("| Version | Period | Ann. mean | Vol | Sharpe | Max DD | Worst month | Worst 12m |")
print("|---|---|---:|---:|---:|---:|---:|---:|")
for pname, a, b in [("1927-2026", "1927-07", None), ("1927-1999", "1927-07", "1999-12"), ("2000-2026", "2000-01", None), ("2010-2026", "2010-01", None)]:
    for lbl, s in [("Raw UMD", mom_m), ("Scaled UMD", umd_bsc), ("Scaled UMD, cap 2x", umd_bsc_cap)]:
        d = stats(sub(s, a, b))
        print(f"| {lbl} | {pname} | {fmt_pct(d['ann_mean'])} | {fmt_pct(d['ann_vol'])} | {d['sharpe']:.2f} | {fmt_pct(d['max_dd'])} | {fmt_pct(d['worst_period'])} ({d['worst_period_date']}) | {fmt_pct(d['worst_12m'])} |")

# ============================================================ 4) after drawdowns
di = (1 + dmkt).cumprod()
peak = di.cummax()
dd = di / peak - 1
print("\n## 4) US total market after FIRST daily close below a drawdown threshold (each bear counted once per threshold)\n")
print("| Threshold | Episodes | Median fwd 1y | Mean fwd 1y | % 1y > 0 | Median fwd 3y (cum) | Median fwd 5y (cum) | Worst fwd 1y | Median further DD from entry | Worst further DD |")
print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
H = {"1y": 1, "3y": 3, "5y": 5}  # calendar years (pre-1952 NYSE traded ~300 days/yr, so day counts would mislead)
dates = di.index.values


def fwd(i: int, years: int):
    """Return from index position i to the first trading day >= date_i + years (NaN if beyond data)."""
    tgt = di.index[i] + pd.DateOffset(years=years)
    j = di.index.searchsorted(tgt)
    return di.iloc[j] / di.iloc[i] - 1 if j < len(di) else np.nan


def fwd_all(years: int) -> pd.Series:
    tgt = di.index + pd.DateOffset(years=years)
    j = di.index.searchsorted(tgt)
    ok = j < len(di)
    return pd.Series(di.values[j[ok]] / di.values[ok] - 1, index=di.index[ok])


uncond = {k: fwd_all(h) for k, h in H.items()}
ep_rows = []
for thr in [-0.10, -0.20, -0.30, -0.40, -0.50]:
    eps = []
    armed = True
    for t, v in dd.items():
        if v == 0:
            armed = True
        elif armed and v <= thr:
            eps.append(t)
            armed = False
    out = {k: [] for k in H}
    fdd = []
    for t in eps:
        i = di.index.get_loc(t)
        for k, h in H.items():
            v = fwd(i, h)
            if not np.isnan(v):
                out[k].append(v)
        # further drawdown from entry until the market regains the prior peak (or the end of data)
        fut = di.iloc[i:]
        rec = fut[fut >= peak.iloc[i]]
        end = rec.index[0] if len(rec) else fut.index[-1]
        fdd.append(fut.loc[:end].min() / di.iloc[i] - 1)
        ep_rows.append({"threshold": thr, "date": t.date(), "fwd1y": fwd(i, 1), "further_dd": fdd[-1]})
    o1 = np.array(out["1y"])
    print(
        f"| {int(thr * 100)}% | {len(eps)} | {fmt_pct(np.median(o1))} | {fmt_pct(o1.mean())} | {fmt_pct((o1 > 0).mean(), 0)} | "
        f"{fmt_pct(np.median(out['3y']))} | {fmt_pct(np.median(out['5y']))} | {fmt_pct(o1.min())} | {fmt_pct(np.median(fdd))} | {fmt_pct(min(fdd))} |"
    )
print(
    f"| Unconditional (all days) | {len(uncond['1y'])} days | {fmt_pct(uncond['1y'].median())} | {fmt_pct(uncond['1y'].mean())} | {fmt_pct((uncond['1y'] > 0).mean(), 0)} | "
    f"{fmt_pct(uncond['3y'].median())} | {fmt_pct(uncond['5y'].median())} | {fmt_pct(uncond['1y'].min())} | n/a | n/a |"
)
ep = pd.DataFrame(ep_rows)
print("\nEpisodes crossing -30% or worse (date, fwd 1y, further DD):")
for _, r in ep[ep.threshold <= -0.30].iterrows():
    print(f"  {r.threshold:.0%} {r.date} fwd1y={fmt_pct(r.fwd1y)} furtherDD={fmt_pct(r.further_dd)}")

# ============================================================ 5) turn of the month
dm = pd.DataFrame({"r": dmkt, "ex": d3["Mkt-RF"]})
dm["ym"] = dm.index.to_period("M")
dm["pos"] = dm.groupby("ym").cumcount() + 1  # trading day number within month
dm["n"] = dm.groupby("ym")["r"].transform("size")
dm["tom"] = (dm["pos"] <= 3) | (dm["pos"] == dm["n"])  # day -1 and days +1..+3
print("\n## 5) Turn-of-the-month (last trading day + first 3), daily VW market excess returns\n")
print("| Period | TOM mean/day | Other mean/day | Diff t-stat | TOM days share | Share of total excess return earned on TOM days |")
print("|---|---:|---:|---:|---:|---:|")
for pname, a, b in [("1926-1987 (pre Ariel 1987)", None, "1987-12-31"), ("1988-2008 (to McConnell-Xu 2008)", "1988-01-01", "2008-12-31"), ("2009-2026", "2009-01-01", None), ("2000-2026", "2000-01-01", None), ("2015-2026", "2015-01-01", None)]:
    x = dm.copy()
    if a:
        x = x[x.index >= pd.Timestamp(a)]
    if b:
        x = x[x.index <= pd.Timestamp(b)]
    t1, t0 = x.loc[x.tom, "ex"], x.loc[~x.tom, "ex"]
    se = np.sqrt(t1.var() / len(t1) + t0.var() / len(t0))
    share = t1.sum() / x["ex"].sum()
    print(f"| {pname} | {100 * t1.mean():.3f}% | {100 * t0.mean():.3f}% | {(t1.mean() - t0.mean()) / se:.2f} | {fmt_pct(x.tom.mean(), 0)} | {fmt_pct(share, 0)} |")

# ============================================================ 6) leverage with and without a trend filter
# Daily-rebalanced L x market (like a leveraged ETF), financing at RF + 0.5%/yr spread on the borrowed part,
# 0.9%/yr expense for L>1 (typical leveraged-ETF fee). Monthly 10m-SMA filter on the unlevered index:
# when below its SMA hold T-bills (decided at month end, applied the next month). 10bp per switch.
print("\n## 6) Leveraged market (daily rebalanced) with/without a 10-month SMA trend filter\n")
print("| Strategy | Period | CAGR | Vol | Max DD | Worst 12m | Final multiple of $1 | Switches / yr |")
print("|---|---|---:|---:|---:|---:|---:|---:|")
drf = d3["RF"]
days_per_year = pd.Series(dmkt.index.year, index=dmkt.index).map(pd.Series(dmkt.index.year).value_counts())
SPREAD, FEE = 0.005 / days_per_year, 0.009 / days_per_year  # per-trading-day charges
mon_idx = (1 + mkt).cumprod()
sig_m = (mon_idx > mon_idx.rolling(10).mean()).astype(float).shift(1)  # for month t
sig_d = pd.Series(dmkt.index.to_period("M").map(sig_m).values, index=dmkt.index).astype(float)
sw_d = sig_d.diff().abs().fillna(0)
for pname, a, b in [("1927-2026", "1927-01-01", None), ("1927-1999", "1927-01-01", "1999-12-31"), ("2000-2026", "2000-01-01", None), ("2010-2026", "2010-01-01", None)]:
    for L in [1, 2, 3]:
        lev = L * dmkt - (L - 1) * (drf + SPREAD) - (FEE if L > 1 else 0.0)
        lev = lev.clip(lower=-1)
        for filt in [False, True]:
            r = (sig_d * lev + (1 - sig_d) * drf - sw_d * 0.001) if filt else lev
            r = r[r.index >= pd.Timestamp(a)]
            if b:
                r = r[r.index <= pd.Timestamp(b)]
            r = r.dropna()
            w = (1 + r).cumprod()
            yrs = (r.index[-1] - r.index[0]).days / 365.25
            cagr = w.iloc[-1] ** (1 / yrs) - 1 if w.iloc[-1] > 0 else -1
            mdd = (w / w.cummax() - 1).min()
            wm = w.groupby(w.index.to_period("M")).last()
            w12 = (wm / wm.shift(12) - 1).min()
            swy = (sw_d.reindex(r.index).sum() / yrs) if filt else 0
            print(f"| {L}x {'+ 10m SMA filter' if filt else 'buy & hold'} | {pname} | {fmt_pct(cagr)} | {fmt_pct(r.std() * np.sqrt(len(r) / yrs))} | {fmt_pct(mdd)} | {fmt_pct(w12)} | {w.iloc[-1]:,.1f} | {swy:.2f} |")
