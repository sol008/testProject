"""Parts 1-2: crash-buying rules ("buy after an X% drawdown") on the S&P 500 and failure markets.

Conventions (no look-ahead):
  * drawdown measured on daily CLOSES of the price index;
  * signal on close t -> entry at the close of the NEXT trading day (t+1);
  * horizon exits at the first close on/after entry + H years; "ATH" exit at the first close at/above
    the pre-crash peak; trades still open on the last date are marked-to-market and flagged open;
  * returns use total-return series where available (US: Shiller dividends pre-1988, ^SP500TR after);
    other indices are PRICE-ONLY (understates returns by the dividend yield, ~1-3%/yr);
  * leverage = daily-rebalanced L x total return, financing on (L-1) at T-bill + 0.75%, plus 0.9%/yr fee
    (calibrated to SSO/UPRO, see common.calibrate_leverage);
  * round-trip trading cost 0.10% (1x), 0.20% (2x/3x), 3% of premium (options).
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import common as C
import data

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(OUT, exist_ok=True)

THRESHOLDS = [0.20, 0.30, 0.40, 0.50]
HORIZONS = {"1y": 1, "2y": 2, "3y": 3, "5y": 5}
LEVS = [1, 2, 3]


# ============================================================================ market container
class Market:
    def __init__(self, name, px, tr=None, rf_d=None, vol=None, divyield=None, cape=None, credit=None,
                 tbill=None):
        self.name = name
        self.px = px.dropna()
        idx = self.px.index
        self.idx = idx
        self.tr = (tr.reindex(idx).ffill() if tr is not None else self.px.copy())
        if rf_d is None:
            rf_d = data.daily_rf()
        self.rf = rf_d.reindex(rf_d.index.union(idx)).ffill().reindex(idx).fillna(0.0)
        self.r = self.tr.pct_change().fillna(0.0)
        self.rl = {L: C.lev_returns(self.r, self.rf, L) for L in LEVS}
        self.eq = {L: (1 + self.rl[L]).cumprod() for L in LEVS}
        self.cash = (1 + self.rf).cumprod()
        if vol is None:
            vol = data.realized_vol(self.px, 21) * 100 + 4.0
        self.vol = vol.reindex(vol.index.union(idx)).ffill().reindex(idx)
        self.divyield = (divyield.reindex(divyield.index.union(idx)).ffill().reindex(idx).fillna(0.02)
                         if divyield is not None else pd.Series(0.0, index=idx))
        self.cape = cape.reindex(idx) if cape is not None else None
        self.credit = credit.reindex(credit.index.union(idx)).ffill().reindex(idx) if credit is not None else None
        self.tbill = tbill.reindex(tbill.index.union(idx)).ffill().reindex(idx) if tbill is not None else None
        self.sma50 = self.px.rolling(50).mean()
        self.sma200 = self.px.rolling(200).mean()
        # 10-month SMA of month-end closes, known at each month end, held constant during next month
        me = self.px.resample("ME").last()
        s10 = me.rolling(10).mean()
        self.sma10m_me = s10
        self.p10ma = self.px / self.px.rolling(2520, min_periods=2400).mean()  # price vs 10y average


# ============================================================================ episodes
def peak_structure(px: pd.Series, mode: str = "ath", bear: float = 0.20, bull: float = 0.20):
    """Return (peak_series, episode_id).  mode='ath': running all-time high, new episode at each
    new high.  mode='bear': classic bear/bull state machine -- the reference peak resets to the
    current price once the index has rallied `bull` from its bear-market low (known in real time)."""
    if mode == "ath":
        peak = px.cummax()
        eid = (px >= peak).cumsum()
        return peak, eid
    vals = px.values
    peak_arr = np.empty(len(vals))
    eid_arr = np.empty(len(vals), dtype=int)
    state = "bull"
    peak = vals[0]
    trough = vals[0]
    e = 0
    for i, v in enumerate(vals):
        if state == "bull":
            if v >= peak:
                peak = v
                e += 1
            elif v <= peak * (1 - bear):
                state = "bear"
                trough = v
        else:
            if v < trough:
                trough = v
            if v >= trough * (1 + bull):
                state = "bull"
                peak = v
                e += 1
        peak_arr[i] = peak
        eid_arr[i] = e
    return pd.Series(peak_arr, index=px.index), pd.Series(eid_arr, index=px.index)


def episode_table(px: pd.Series, min_dd: float = 0.20, mode: str = "ath") -> pd.DataFrame:
    peak, eid = peak_structure(px, mode)
    dd = px / peak - 1
    rows = []
    for k, g in dd.groupby(eid):
        if g.min() > -min_dd:
            continue
        pdate = g.index[0]
        pval = peak.loc[pdate]
        tdate = g.idxmin()
        after = px.loc[tdate:]
        rec = after[after >= pval]
        rdate = rec.index[0] if len(rec) else pd.NaT
        rows.append({
            "peak_date": pdate.date(), "peak": round(pval, 2), "trough_date": tdate.date(),
            "trough": round(px.loc[tdate], 2), "max_dd": g.min(),
            "yrs_peak_to_trough": round(C.years_between(pdate, tdate), 2),
            "recovery_date": rdate.date() if pd.notna(rdate) else "not yet",
            "yrs_trough_to_recovery": round(C.years_between(tdate, rdate), 2) if pd.notna(rdate) else np.nan,
            "yrs_underwater": round(C.years_between(pdate, rdate), 2) if pd.notna(rdate) else np.nan,
        })
    return pd.DataFrame(rows)


# ============================================================================ signals
def find_signals(mkt: Market, thresholds=THRESHOLDS, mode="ath", filt=None, armed=False,
                 start=None, end=None) -> pd.DataFrame:
    """First date in each drawdown episode at which dd <= -threshold AND filt(date) is true.

    armed=False: both conditions on the same day.  armed=True: once dd<=-thr has occurred in the
    episode, buy at the first later day on which filt is true (e.g. trend confirmation), as long as
    the index has not yet recovered its peak.  filt: boolean Series aligned to mkt.idx (or None)."""
    px = mkt.px
    peak, eid = peak_structure(px, mode)
    dd = px / peak - 1
    f = filt.reindex(px.index).fillna(False).astype(bool) if filt is not None else pd.Series(True, index=px.index)
    rows = []
    for k, g in dd.groupby(eid):
        if g.min() > -min(thresholds):
            continue
        pdate = g.index[0]
        pval = peak.loc[pdate]
        for thr in thresholds:
            hit = g[g <= -thr]
            if len(hit) == 0:
                continue
            first = hit.index[0]
            if armed:
                cand = f.loc[first:g.index[-1]]
                cand = cand[cand]
            else:
                cand = f.loc[hit.index]
                cand = cand[cand]
            if len(cand) == 0:
                continue
            sdate = cand.index[0]
            pos = px.index.get_loc(sdate)
            if pos + 1 >= len(px):
                continue
            entry = px.index[pos + 1]
            if start is not None and entry < pd.Timestamp(start):
                continue
            if end is not None and entry > pd.Timestamp(end):
                continue
            after = px.loc[entry:]
            rec = after[after >= pval]
            rdate = rec.index[0] if len(rec) else pd.NaT
            rows.append({"peak_date": pdate, "peak": pval, "thr": thr, "signal_date": sdate, "entry": entry,
                         "entry_px": px.loc[entry], "dd_at_entry": px.loc[entry] / pval - 1,
                         "recovery": rdate})
    return pd.DataFrame(rows)


def exit_date(mkt: Market, entry: pd.Timestamp, rule: str, recovery=pd.NaT, stop: float | None = None):
    """Exit date for a rule; optional stop-loss on the underlying index (close <= entry*(1-stop))."""
    idx = mkt.idx
    if rule == "ATH":
        if pd.isna(recovery):
            t, open_ = idx[-1], True
        else:
            t, open_ = recovery, False
    else:
        H = HORIZONS[rule]
        t = C.first_on_or_after(idx, entry + pd.DateOffset(years=H))
        if t is None:
            t, open_ = idx[-1], True
        else:
            open_ = False
    if stop is not None:
        seg = mkt.px.loc[entry:t]
        hit = seg[seg <= seg.iloc[0] * (1 - stop)]
        if len(hit):
            return hit.index[0], False
    return t, open_


RUIN_LEVEL = 0.10  # a leveraged position that falls to 10% of its entry value is treated as abandoned


def trade_stats(mkt: Market, entry, exit_, L, ruin=False):
    """Return (net return, max drawdown within trade).  ruin=True: if the position ever falls to
    RUIN_LEVEL of its entry value it is assumed liquidated/abandoned there (-90%), since an investor
    (or the fund sponsor) is very unlikely to hold through a >90% loss."""
    # compound the daily (leveraged) returns inside the trade window; robust to a prior wipe-out of
    # the full-history equity curve (e.g. a 3x fund destroyed by the -33% Hang Seng day in Oct 1987)
    r = mkt.rl[L].loc[entry:exit_].iloc[1:]
    rel = pd.concat([pd.Series([1.0], index=[entry]), (1 + r).cumprod()])
    seg = rel
    cost = C.RT_COST_1X if L == 1 else C.RT_COST_LEV
    mdd = float((seg / seg.cummax() - 1).min())
    if ruin:
        hit = rel[rel <= RUIN_LEVEL]
        if len(hit):
            return float(hit.iloc[0]) * (1 - cost) - 1, mdd
    ret = float(rel.iloc[-1]) * (1 - cost) - 1
    return ret, mdd


def call_trade(mkt: Market, entry, T=2.0, iv="central", strike_mult=1.0):
    """Synthetic T-year call bought at the entry close, held to expiry.  Returns (ret_on_premium,
    premium_pct_of_spot, sigma_used, open_flag).  APPROXIMATION: Black-Scholes, no skew, IV from the
    vol proxy (central = long-dated IV mapping; 'vix' = flat at spot VIX, which overprices in crises)."""
    S = float(mkt.px.loc[entry])
    K = S * strike_mult
    rf_ann = float(mkt.rf.loc[entry] * 252)
    r = np.log1p(max(rf_ann, 0.0))
    q = float(mkt.divyield.loc[entry])
    v = float(mkt.vol.loc[entry])
    sig = (C.long_dated_iv(v) if iv == "central" else v) / 100.0
    prem = C.bs_call(S, K, T, r, q, sig)
    exp_t = C.first_on_or_after(mkt.idx, entry + pd.DateOffset(years=int(T)))
    c = C.RT_COST_OPT
    if exp_t is None:  # mark to market at current IV with remaining time
        last = mkt.idx[-1]
        rem = T - C.years_between(entry, last)
        v2 = float(mkt.vol.iloc[-1])
        val = C.bs_call(float(mkt.px.iloc[-1]), K, rem, r, q, C.long_dated_iv(v2) / 100.0)
        return val * (1 - c / 2) / (prem * (1 + c / 2)) - 1, prem / S, sig, True
    payoff = max(float(mkt.px.loc[exp_t]) - K, 0.0)
    return payoff * (1 - c / 2) / (prem * (1 + c / 2)) - 1, prem / S, sig, False


def build_trades(mkt: Market, sigs: pd.DataFrame, rules=("1y", "2y", "3y", "5y", "ATH"), levs=LEVS,
                 with_calls=True, stop: float | None = None) -> pd.DataFrame:
    rows = []
    for _, s in sigs.iterrows():
        base = {"market": mkt.name, "thr": s["thr"], "peak_date": s["peak_date"].date(),
                "signal_date": s["signal_date"].date(), "entry": s["entry"].date(),
                "entry_px": round(s["entry_px"], 2), "dd_at_entry": s["dd_at_entry"],
                "vol_at_entry": round(float(mkt.vol.loc[s["entry"]]), 1)}
        if mkt.cape is not None:
            base["cape_at_entry"] = round(float(mkt.cape.loc[s["entry"]]), 1) if pd.notna(mkt.cape.loc[s["entry"]]) else np.nan
        base["p10ma_at_entry"] = round(float(mkt.p10ma.loc[s["entry"]]), 2) if pd.notna(mkt.p10ma.loc[s["entry"]]) else np.nan
        for rule in rules:
            ex, open_ = exit_date(mkt, s["entry"], rule, s["recovery"], stop)
            d = dict(base)
            d.update({"exit_rule": rule, "exit": ex.date(), "open": open_,
                      "years": round(C.years_between(s["entry"], ex), 2)})
            for L in levs:
                ret, mdd = trade_stats(mkt, s["entry"], ex, L)
                d[f"ret_{L}x"] = ret
                d[f"mdd_{L}x"] = mdd
                d[f"cagr_{L}x"] = (1 + ret) ** (1 / max(d["years"], 1e-9)) - 1 if ret > -1 else -1.0
                if L > 1:
                    d[f"ret_{L}x_ruin"] = trade_stats(mkt, s["entry"], ex, L, ruin=True)[0]
            rows.append(d)
        if with_calls:
            d = dict(base)
            for iv in ["central", "vix"]:
                rr, prem, sig, open_ = call_trade(mkt, s["entry"], 2.0, iv)
                d[f"call2y_{iv}_ret"] = rr
                d[f"call2y_{iv}_prem_pct"] = prem
                d[f"call2y_{iv}_iv"] = sig
            d["exit_rule"] = "CALL2Y"
            d["open"] = open_
            ex2 = C.first_on_or_after(mkt.idx, s["entry"] + pd.DateOffset(years=2))
            d["exit"] = ex2.date() if ex2 is not None else mkt.idx[-1].date()
            d["years"] = 2.0
            # T-bill-collateralised call portfolios: w of capital in calls, rest T-bills for 2y
            exit_t = ex2 if ex2 is not None else mkt.idx[-1]
            cash_ret = float(mkt.cash.loc[exit_t] / mkt.cash.loc[s["entry"]] - 1)
            for w in (0.1, 0.2, 0.33):
                d[f"callport{int(w*100)}_ret"] = w * d["call2y_central_ret"] + (1 - w) * cash_ret
            rows.append(d)
    return pd.DataFrame(rows)


def summarize(trades: pd.DataFrame, col: str, include_open: bool = False) -> dict:
    """Per-trade statistics.  Open trades are excluded unless include_open (used for the 'ATH' exit,
    where excluding never-recovered trades would be survivorship bias: they enter at mark-to-market)."""
    t = trades if (include_open or "open" not in trades) else trades[~trades["open"]]
    r = t[col].dropna()
    if len(r) == 0:
        return {"n": 0}
    lg = np.log1p(r.clip(lower=-0.9999))
    return {"n": int(len(r)), "n_open": int(t["open"].sum()) if "open" in t else 0,
            "win": float((r > 0).mean()), "mean": float(r.mean()), "median": float(r.median()),
            "worst": float(r.min()), "best": float(r.max()), "p_loss30": float((r <= -0.30).mean()),
            "p_loss50": float((r <= -0.50).mean()), "geo_mean": float(np.expm1(lg.mean())),
            "mean_log": float(lg.mean()), "se_log": float(lg.std(ddof=1) / np.sqrt(len(lg))) if len(lg) > 1 else np.nan}


# ============================================================================ strategy equity (sleeves)
def sleeve_equity(mkt: Market, trades: list, L: int, weight: float = 1.0, idle: str = "cash") -> tuple[pd.Series, pd.Series, int]:
    """Equity of one sleeve that sits in T-bills (idle='cash') or in the 1x index (idle='index',
    i.e. a buy-and-hold core that is switched into L x during crash trades) and holds L x index
    during (entry, exit].  Overlapping trades are skipped.  Returns (equity, in-trade flag, n_trades)."""
    idx = mkt.idx
    rin = C.lev_returns(mkt.r, mkt.rf, L).values
    rcash = mkt.rf.values if idle == "cash" else mkt.r.values
    pos = np.zeros(len(idx), dtype=bool)
    first_day = np.zeros(len(idx), dtype=bool)
    last_exit = None
    n = 0
    for e, x in sorted(trades):
        if last_exit is not None and e < last_exit:
            continue
        i0 = idx.get_loc(e)
        i1 = idx.get_loc(x)
        if i1 <= i0:
            continue
        pos[i0 + 1: i1 + 1] = True
        first_day[i0 + 1] = True
        last_exit = x
        n += 1
    cost = C.RT_COST_1X if L == 1 else C.RT_COST_LEV
    r = np.where(pos, rin, rcash)
    r = np.where(first_day, (1 + r) * (1 - cost) - 1, r)
    eq = pd.Series(np.cumprod(1 + r), index=idx) * weight
    return eq, pd.Series(pos, index=idx), n


def strategy(mkt: Market, sigs: pd.DataFrame, rule: str, L: int, thresholds=None, start=None, idle="cash"):
    """Staged or single-threshold strategy: one equal-weight sleeve per threshold in `thresholds`."""
    if thresholds is None:
        thresholds = sorted(sigs["thr"].unique())
    w = 1.0 / len(thresholds)
    eqs, poss, ntot = [], [], 0
    for thr in thresholds:
        s = sigs[sigs["thr"] == thr]
        tr = []
        for _, row in s.iterrows():
            ex, _ = exit_date(mkt, row["entry"], rule, row["recovery"])
            tr.append((row["entry"], ex))
        eq, pos, n = sleeve_equity(mkt, tr, L, w, idle)
        eqs.append(eq)
        poss.append(pos.astype(float) * w)
        ntot += n
    eq = sum(eqs)
    pos = sum(poss)
    if start is not None:
        eq = eq.loc[start:]
        pos = pos.loc[start:]
    st = C.perf_stats(eq, pos, ntot)
    return eq, st


# ============================================================================ US market builder
def us_market(start="1927-12-30") -> Market:
    spx = data.sp500_daily_tr()
    px = spx["px"].loc[start:]
    tr = spx["tr"].loc[start:]
    sh = data.shiller_extended()
    dy = (sh["D"] / sh["P"]).dropna()
    # CAPE known with a lag: use CAPE of month m-4 scaled by price change since then
    cape_m = sh["CAPE"].dropna()
    pm = sh["P"].reindex(cape_m.index)
    lagged = pd.DataFrame({"cape": cape_m, "P": pm})
    lagged.index = lagged.index + pd.DateOffset(months=4)
    lagged = lagged.reindex(lagged.index.union(px.index)).ffill().reindex(px.index)
    cape_d = lagged["cape"] * px / lagged["P"]
    # credit spread: Moody's Baa minus 10y Treasury.  Daily FRED BAA10Y from 1986, monthly Baa - GS10 before
    baa = data.fred("BAA")
    baa.index = baa.index.to_period("M").to_timestamp()
    g10 = sh["GS10"]
    cm = (baa - g10.reindex(baa.index)).dropna()
    cm.index = cm.index + pd.offsets.MonthEnd(0)  # known at month end
    cd = data.fred("BAA10Y")
    credit = pd.concat([cm[cm.index < cd.index[0]], cd]).sort_index()
    # T-bill yield (%): DTB3 1954+, TB3MS 1934-1953, French RF*12 before
    dtb3 = data.fred("DTB3")
    tb3ms = data.fred("TB3MS")
    tb3ms.index = tb3ms.index + pd.offsets.MonthEnd(0)
    ffm = data.ff_factors("monthly")["RF"] * 1200
    tbill = pd.concat([ffm[ffm.index < tb3ms.index[0]], tb3ms[tb3ms.index < dtb3.index[0]], dtb3]).sort_index()
    vol = C.vol_proxy()
    m = Market("S&P 500", px, tr, data.daily_rf(), vol, dy, cape_d, credit, tbill)
    # price vs trailing 10-year average price, from Shiller monthly averages (history back to 1871)
    avg10 = sh["P"].rolling(120).mean().shift(1)
    avg10.index = avg10.index + pd.offsets.MonthEnd(0)
    avg10 = avg10.reindex(avg10.index.union(px.index)).ffill().reindex(px.index)
    m.p10ma = px / avg10
    return m


def easing_filter(mkt: Market, drop_pp=1.0, lookback_days=365) -> pd.Series:
    tb = mkt.tbill
    past = tb.reindex(tb.index - pd.Timedelta(days=lookback_days), method="ffill")
    past.index = tb.index
    return (tb <= past - drop_pp)


# ============================================================================ main (US)
def run_us(verbose=True):
    mkt = us_market()
    res = {}
    # ---- episode list
    ep_ath = episode_table(mkt.px, 0.20, "ath")
    ep_bear = episode_table(mkt.px, 0.20, "bear")
    ep_ath.to_csv(os.path.join(OUT, "us_ath_episodes.csv"), index=False)
    ep_bear.to_csv(os.path.join(OUT, "us_bear_episodes.csv"), index=False)
    res["ep_ath"] = ep_ath
    res["ep_bear"] = ep_bear

    # ---- base rules (no filter), ATH and bear-cycle modes
    all_trades = []
    summaries = []
    strat_rows = []
    variants = {
        "base": dict(filt=None, armed=False),
        "vix40": dict(filt=mkt.vol >= 40, armed=False),
        "credit3": dict(filt=mkt.credit >= 3.0, armed=False),
        "credit4": dict(filt=mkt.credit >= 4.0, armed=False),
        "trend50": dict(filt=mkt.px > mkt.sma50, armed=True),
        "trend200": dict(filt=mkt.px > mkt.sma200, armed=True),
        "cape<20": dict(filt=mkt.cape < 20, armed=False),
        "cape<25": dict(filt=mkt.cape < 25, armed=False),
        "p10ma<1.3": dict(filt=mkt.p10ma < 1.3, armed=False),
        "easing1pp": dict(filt=easing_filter(mkt, 1.0), armed=False),
        "vix40|trend50": dict(filt=(mkt.vol >= 40), armed=False),  # placeholder, replaced below
    }
    # "vix40 OR later trend confirmation" is not a clean single filter; drop placeholder
    variants.pop("vix40|trend50")
    for mode in ["ath", "bear"]:
        for vname, v in variants.items():
            sigs = find_signals(mkt, THRESHOLDS, mode, v["filt"], v["armed"])
            if len(sigs) == 0:
                continue
            tr = build_trades(mkt, sigs, with_calls=(vname in ("base", "vix40")))
            tr.insert(0, "variant", vname)
            tr.insert(0, "mode", mode)
            all_trades.append(tr)
            for thr in THRESHOLDS:
                t_thr = tr[tr["thr"] == thr]
                for rule in ["1y", "2y", "3y", "5y", "ATH"]:
                    tt = t_thr[t_thr["exit_rule"] == rule]
                    if len(tt) == 0:
                        continue
                    for L in LEVS:
                        for col in ([f"ret_{L}x"] + ([f"ret_{L}x_ruin"] if L > 1 else [])):
                            s = summarize(tt, col, include_open=(rule == "ATH"))
                            s.update({"mode": mode, "variant": vname, "thr": thr, "rule": rule, "L": L,
                                      "col": col, "worst_mdd": float(tt[f"mdd_{L}x"].min()),
                                      "avg_years": float(tt["years"].mean()),
                                      "median_cagr": float(tt[~tt["open"]][f"cagr_{L}x"].median()) if (~tt["open"]).any() else np.nan})
                            summaries.append(s)
                tc = t_thr[t_thr["exit_rule"] == "CALL2Y"]
                if len(tc):
                    for col in ["call2y_central_ret", "call2y_vix_ret", "callport20_ret"]:
                        s = summarize(tc, col)
                        s.update({"mode": mode, "variant": vname, "thr": thr, "rule": col, "L": "opt"})
                        summaries.append(s)
            # strategy-level equity curves 1928-2026 (single thresholds and staged)
            for rule in ["1y", "2y", "3y", "5y", "ATH"]:
                for L in LEVS:
                    for thrset in [[0.2], [0.3], [0.4], [0.5], [0.2, 0.3, 0.4, 0.5], [0.2, 0.3, 0.4]]:
                        ss = sigs[sigs["thr"].isin(thrset)]
                        if len(ss) == 0:
                            continue
                        for idle in (["cash", "index"] if vname == "base" else ["cash"]):
                            if idle == "index" and L == 1:
                                continue
                            eq, st = strategy(mkt, ss, rule, L, thrset, idle=idle)
                            st.update({"mode": mode, "variant": vname, "rule": rule, "L": L, "idle": idle,
                                       "thr": "+".join(f"{int(t*100)}" for t in thrset)})
                            strat_rows.append(st)
    trades = pd.concat(all_trades, ignore_index=True)
    summ = pd.DataFrame(summaries)
    strat = pd.DataFrame(strat_rows)
    trades.to_csv(os.path.join(OUT, "us_crash_trades.csv"), index=False)
    summ.to_csv(os.path.join(OUT, "us_crash_summary.csv"), index=False)
    strat.to_csv(os.path.join(OUT, "us_crash_strategies.csv"), index=False)
    # buy & hold reference
    bh = {}
    for L in LEVS:
        st = C.perf_stats(mkt.eq[L], pd.Series(1.0, index=mkt.idx), 1)
        bh[L] = st
    pd.DataFrame(bh).T.to_csv(os.path.join(OUT, "us_buyhold.csv"))
    res.update({"trades": trades, "summary": summ, "strat": strat, "bh": bh, "mkt": mkt})
    return res


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    r = run_us()
    print(r["ep_ath"].to_string())
    print(r["ep_bear"].to_string())
    s = r["summary"]
    print(s[(s["mode"] == "ath") & (s["variant"] == "base")].round(3).to_string())
    st = r["strat"]
    print(st[(st["mode"] == "ath") & (st["variant"] == "base")].round(3).to_string())
    print(pd.DataFrame(r["bh"]).T)
