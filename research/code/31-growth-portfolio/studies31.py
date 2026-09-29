"""Track 31 studies on the real (or forward-tilted) path: cadence (daily vs weekly; M1 and W10 on a
weekly clock; orders per weekly email), and taxes by account placement."""
from __future__ import annotations

import numpy as np
import pandas as pd

import sleeves31 as S

TD = 252
TAX = {"24% bracket (ST 24%, LT 15%)": (0.24, 0.15),
       "35% bracket + NIIT (ST 38.8%, LT 18.8%)": (0.388, 0.188)}   # track 18's profiles


def stats(r: pd.Series) -> dict:
    r = r.dropna()
    lw = np.log1p(r).cumsum()
    dd = (lw - np.maximum.accumulate(np.maximum(lw, 0))).min()
    return dict(cagr=np.expm1(lw.iloc[-1] / (len(r) / TD)), vol=r.std() * np.sqrt(TD), maxdd=np.expm1(dd))


# ----------------------------------------------------------------------------- cadence: trend sleeves
def cadence_trend(R: pd.DataFrame, pos: dict, windows: dict, label: str) -> pd.DataFrame:
    rows = []
    for wname, (a, b) in windows.items():
        for nm in ("SPX", "NDX"):
            for L in (1, 2, 3):
                row = dict(scenario=label, window=wname, index=nm, L=L)
                for cad in ("d", "w"):
                    k = f"{nm}{L}_200d_{cad}"
                    x = R[k].loc[a:b].dropna()
                    if len(x) < TD:
                        continue
                    st = stats(x)
                    p = pos[k].loc[a:b].dropna()
                    sw = (p.diff().abs() > 0).sum() / (len(p) / TD)
                    for kk, v in st.items():
                        row[f"{kk}_{'daily' if cad == 'd' else 'weekly'}"] = v
                    row[f"switches_pa_{'daily' if cad == 'd' else 'weekly'}"] = sw
                    row["start"] = str(x.index[0].date())
                if "cagr_weekly" in row and "cagr_daily" in row:
                    row["weekly_minus_daily_cagr"] = row["cagr_weekly"] - row["cagr_daily"]
                    rows.append(row)
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------- cadence: M1 and W10
def _rsi2(c: pd.Series) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=0.5, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=0.5, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def m1_weekly_vs_daily(start="1993-02-01", end="2026-09-28") -> pd.DataFrame:
    """Design M1 (ST-1): SPY > 200-day, RSI(2) < 10, VIX >= 20 at the close; buy the next open; sell the
    open after the first close above the 5-day average; time stop at the open of session 21.
    Weekly clock: the signal and the exit are only checked at the week's last close."""
    o = S.C04.yf_ohlc("SPY")
    op, cl = o["Open"], o["Close"]
    adj = o["Adj Close"] / o["Close"]                 # dividend adjustment for returns
    vix = S.C04.cboe("VIX").reindex(cl.index).ffill()
    rf = S.load_index("SPX").rf_ann.reindex(cl.index).ffill()
    sig = (cl > cl.rolling(200).mean()) & (_rsi2(cl) < 10) & (vix >= 20)
    ext = cl > cl.rolling(5).mean()
    wk = S.week_end_flags(cl.index)
    idx = cl.index
    rows = []
    for mode in ("daily", "weekly"):
        trades = []
        i = idx.get_indexer([pd.Timestamp(start)], method="bfill")[0]
        n = len(idx)
        while i < n - 1:
            ok = sig.iloc[i] and (mode == "daily" or wk.iloc[i])
            if not ok:
                i += 1
                continue
            e = i + 1                                     # entry at the next open
            j = e
            x = None
            while j < n - 1:
                check = mode == "daily" or wk.iloc[j]
                if check and ext.iloc[j]:
                    x = j + 1
                    break
                if j + 1 - e >= 20:                       # time stop: open of session 21
                    x = j + 1
                    break
                j += 1
            if x is None or idx[x] > pd.Timestamp(end):
                break
            ret = (op.iloc[x] * adj.iloc[x]) / (op.iloc[e] * adj.iloc[e]) - 1
            days = x - e
            trades.append(dict(entry=idx[e], exit=idx[x], ret=ret, sessions=days,
                               excess=ret - rf.iloc[e] * days / TD))
            i = x
        T = pd.DataFrame(trades)
        yrs = (pd.Timestamp(end) - pd.Timestamp(start)).days / 365.25
        rows.append(dict(module="M1 ST-1 (SPY, 1993-2026)", clock=mode, trades=len(T), trades_pa=len(T) / yrs,
                         win_rate=(T.ret > 0).mean(), mean_ret=T.ret.mean(), mean_excess=T.excess.mean(),
                         mean_sessions=T.sessions.mean(),
                         contribution_pa_at_6pct=0.06 * T.excess.sum() / yrs,
                         contribution_pa_at_6pct_halved=0.03 * T.excess.sum() / yrs))
    return pd.DataFrame(rows)


def w10_weekly_vs_daily(start="1962-01-02", end="2026-06-30") -> pd.DataFrame:
    """Design W10: ^GSPC closes >= 3% down, prior close above its 200-day average, no other -3% close in
    the prior 20 sessions; buy the next open (daily clock) or the next week's first open (weekly clock);
    sell at the open of the last session within entry + 90 calendar days. Index price return + dividends."""
    o = S.C04.yf_ohlc("^GSPC")
    op, cl = o["Open"], o["Close"]
    idx = cl.index
    r = cl.pct_change()
    ma = cl.rolling(200).mean()
    rf = S.load_index("SPX").rf_ann.reindex(idx).ffill()
    down = r <= -0.03
    wk = S.week_end_flags(idx)
    ev = []
    for i in range(221, len(idx) - 1):
        if idx[i] < pd.Timestamp(start) or idx[i] > pd.Timestamp(end):
            continue
        if down.iloc[i] and cl.iloc[i - 1] > ma.iloc[i - 1] and not down.iloc[i - 20:i].any():
            ev.append(i)
    rows = []
    for mode in ("daily", "weekly"):
        res = []
        for i in ev:
            e = i + 1
            if mode == "weekly":
                j = i
                while not wk.iloc[j]:
                    j += 1
                e = j + 1
            if e >= len(idx):
                continue
            lim = idx[e] + pd.Timedelta(days=90)
            x = idx.get_indexer([lim], method="ffill")[0]
            if x <= e:
                continue
            days = x - e
            ret = op.iloc[x] / op.iloc[e] - 1 + 0.02 * days / TD      # ~2% dividend yield
            res.append(dict(event=idx[i], ret=ret, excess=ret - rf.iloc[e] * days / TD,
                            delay=e - (i + 1)))
        T = pd.DataFrame(res)
        yrs = (pd.Timestamp(end) - pd.Timestamp(start)).days / 365.25
        rows.append(dict(module="W10 crash-day buy (^GSPC, 1962-2026)", clock=mode, trades=len(T),
                         trades_pa=len(T) / yrs, win_rate=(T.ret > 0).mean(), mean_ret=T.ret.mean(),
                         mean_excess=T.excess.mean(), mean_delay_sessions=T.delay.mean(),
                         contribution_pa_at_6pct=0.06 * T.excess.sum() / yrs))
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------- one weekly email
def weekly_book_orders(R: pd.DataFrame, pos: dict, w: dict, a: str, b: str, band_rel=0.25,
                       cash_is_etf=True) -> dict:
    """Run a book on the real path with weekly decisions only: sleeves drift between weeks; at each
    week's last close a sleeve that switches (fund <-> T-bills) is an order (two if 'out' is a T-bill ETF
    rather than the account's cash), and a sleeve outside its no-trade band (25% of target) is re-sized.
    Returns CAGR vs daily rebalancing and the order counts per weekly email."""
    X = R.loc[a:b, list(w) + ["rf"]].dropna()
    P = {k: pos[k].reindex(X.index).ffill() if k in pos else None for k in w}
    wk = S.week_end_flags(X.index).values
    tgt = np.array(list(w.values()))
    cash_t = 1 - tgt.sum()
    val = tgt.copy()
    cash = cash_t
    V = 1.0
    orders = []
    lw = [0.0]
    names = list(w)
    prevp = {k: (P[k].iloc[0] if P[k] is not None else 1) for k in names}
    for t in range(len(X)):
        rr = X.iloc[t][names].values
        val = val * (1 + rr)
        cash = cash * (1 + X.iloc[t]["rf"])
        tot = val.sum() + cash
        lw.append(lw[-1] + np.log(tot / V))
        V = tot
        if wk[t]:
            n = 0
            for i, k in enumerate(names):
                p = P[k].iloc[t] if P[k] is not None else 1
                switched = P[k] is not None and p != prevp[k]
                prevp[k] = p
                wt = val[i] / tot
                out_band = abs(wt - tgt[i]) > band_rel * tgt[i]
                if switched:
                    n += 2 if cash_is_etf else 1
                elif out_band:
                    n += 1
                if switched or out_band:
                    val[i] = tgt[i] * tot
            cash = tot - val.sum()
            orders.append(n)
    o = np.array(orders)
    yrs = len(X) / TD
    daily = S.np.log1p(sum(v * X[k] for k, v in w.items()) + cash_t * X["rf"]).sum() / yrs
    return dict(start=a, end=b, cagr_weekly_band=np.expm1(lw[-1] / yrs), cagr_daily_rebalanced=np.expm1(daily),
                weeks=len(o), share_weeks_with_orders=(o > 0).mean(), orders_pa=o.sum() / yrs,
                emails_with_orders_pa=(o > 0).sum() / yrs, max_orders_one_week=o.max(),
                share_weeks_over_3=(o > 3).mean())


# ----------------------------------------------------------------------------- taxes
def _net_tax(st_g, lt_g, carry, st, lt):
    """Net the year's short- and long-term gains with last year's loss carry; return (tax, new carry)."""
    s, l = st_g + carry, lt_g
    if s < 0 < l:
        l, s = l + s, 0.0
    if l < 0 < s:
        s, l = s + l, 0.0
    carry = min(s, 0.0) + min(l, 0.0)
    return max(s, 0.0) * st + max(l, 0.0) * lt, carry


def after_tax_switch(r: pd.Series, p: pd.Series, st: float, lt: float, liquidate=True) -> float:
    """Taxable account running one switching sleeve: the gain is realised at each exit (short-term if
    held < 1 year), netted and taxed at each year end with losses carried forward; taxes are paid by
    selling a slice of any open position. Returns the after-tax CAGR."""
    x = pd.concat([r.rename("r"), p.rename("p")], axis=1).dropna()
    V, basis, entry, prev = 1.0, None, None, 0.0
    st_g = lt_g = carry = 0.0
    yr = x.index.year
    for t in range(len(x)):
        pt = x["p"].iloc[t]
        if prev == 0 and pt == 1:
            basis, entry = V, x.index[t]
        V *= 1 + x["r"].iloc[t]
        if prev == 1 and pt == 0 and basis is not None:
            g = V - basis
            if (x.index[t] - entry).days > 365:
                lt_g += g
            else:
                st_g += g
            basis = None
        prev = pt
        if t == len(x) - 1 or yr[t + 1] != yr[t]:
            if t == len(x) - 1 and liquidate and basis is not None:
                g = V - basis
                if (x.index[t] - entry).days > 365:
                    lt_g += g
                else:
                    st_g += g
            tax, carry = _net_tax(st_g, lt_g, carry, st, lt)
            if basis is not None and V > 0:
                basis *= (V - tax) / V
            V -= tax
            st_g = lt_g = 0.0
    return V ** (1 / (len(x) / TD)) - 1


def after_tax_hold(r_tr: pd.Series, r_div: pd.Series, lt: float, liquidate=True) -> float:
    """Buy-and-hold in a taxable account: dividends taxed each year at the qualified (LT) rate, the gain
    at the end (liquidate) or never (held for a step-up in basis)."""
    x = pd.concat([r_tr.rename("r"), r_div.rename("d")], axis=1).dropna()
    V, basis, divs = 1.0, 1.0, 0.0
    yr = x.index.year
    for t in range(len(x)):
        V *= 1 + x["r"].iloc[t]
        divs += x["d"].iloc[t] * V
        if t == len(x) - 1 or yr[t + 1] != yr[t]:
            V -= divs * lt
            basis += divs * (1 - lt)       # reinvested dividends add to the basis
            divs = 0.0
    if liquidate:
        V -= max(V - basis, 0) * lt
    yrs = len(x) / TD
    return V ** (1 / yrs) - 1
