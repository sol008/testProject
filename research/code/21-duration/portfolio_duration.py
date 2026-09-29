"""Portfolio-level history under the 60 / 90 / 120 calendar-day caps (historical, UNSHRUNK), for drawdowns,
trade counts and the interaction of the crisis modules.  Expected (shrunk) returns are assembled in the
report from the module studies; this script supplies the path statistics.

Daily excess-over-T-bill P&L on NAV:
  M1  ST-1 on SPY at 6% (track 13 engine, next open, SMA5 exit, cap 20) -- identical under every cap.
  W10 SPY at 6.7% from the next open for 42 / 63 / 84 sessions (shadow under 60 days: shown separately).
  M4  O2 call spread, 2% debit, 60 / 90 / 120 DTE, entry at the next close, 60-day cool-down (so up to two
      spreads can be open at 90-120 DTE), daily mark-to-model on track 14's surface, costs at entry/exit.
  M3  BTC weekly close vs 10-week average at 3% of NAV (BTC-USD as the IBIT proxy, from 2015).
  M2  long-only ETF8, 252-day sign, s = 0.5 (track 15 code, from 2005).
  W8/W9/M6/M7: omitted (<=1% premium, rare, shadow or infeasible at $100k).
Governor G(D), caps and circuit breakers are ignored (they would only cut exposure after losses).
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from common21 import CODE, save
from common13 import load, rsi_wilder, run_rule, sma, strategy_daily
import optmodel as om
import w10_duration as W
import o2_duration as O

sys.path.insert(0, str(CODE / "15-short-futures-crypto"))

START_MAIN = "2008-01-02"
END = "2026-09-25"


def m1_stream(spy):
    c = spy["C"]
    r2 = rsi_wilder(c, 2)
    vix = load("^VIX")["C"].reindex(spy.index)
    ent = (r2 < 10) & (c > sma(c, 200)) & (vix >= 20)
    tr = run_rule(spy, ent, mode="open", hold=20, exit_sig=c > sma(c, 5))
    r = strategy_daily(spy, tr)
    return 0.06 * (r - spy["rf"]), tr


def w10_stream(spy, H):
    df = W.panel()
    ev = [i for i in W.crash_events(df) if df.index[i] >= pd.Timestamp("1993-02-01")]
    aO, aC, rf = spy["aO"], spy["aC"], spy["rf"]
    pnl = pd.Series(0.0, index=spy.index)
    held = pd.Series(0, index=spy.index)
    entries = []
    busy_until = None
    for i in ev:
        d = df.index[i]
        if d not in spy.index:
            continue
        k = spy.index.get_loc(d)
        if k + H >= len(spy):
            continue
        if busy_until is not None and spy.index[k + 1] <= busy_until:
            continue                                   # one W10 position at a time
        e, x = k + 1, k + H
        r = pd.Series(np.r_[aC.iloc[e] / aO.iloc[e] - 1, (aC.iloc[e + 1:x + 1].values / aC.iloc[e:x].values - 1)],
                      index=spy.index[e:x + 1])
        pnl.loc[r.index] += 0.067 * (r - rf.loc[r.index])
        held.loc[r.index] += 1
        entries.append(spy.index[e])
        busy_until = spy.index[x]
    return pnl, entries


def o2_stream(mk, dte, cool=60, debit_frac=0.02):
    idx = mk.index
    mode_, markup = om.settings()
    sig = O.crash_signals(mk, cool)
    pnl = pd.Series(0.0, index=idx)
    entries = []
    for d0 in sig:
        i = idx.get_loc(d0)
        if i + 2 >= len(idx):
            continue
        e = idx[i + 1]
        tgt = e + pd.Timedelta(days=dte)
        if tgt > idx[-1]:
            continue
        E = idx[idx.searchsorted(tgt, side="right") - 1]
        x = idx[idx.get_loc(E) - 1]
        path = mk.loc[e:x]
        S0 = path.spx.iloc[0]
        K1, K2 = S0, 1.05 * S0
        tau = (E - path.index).days.values.astype(float)
        vl = path[["vix9d", "vix", "vix3m", "vix6m"]].values
        m = om.m_from_mode(path.m_skew.values, mode_)
        v1, _ = om.price(path.spx.values, np.full(len(path), K1), tau, path.rf.values, path.q.values, vl, m, "call", iv_markup=markup)
        v2, _ = om.price(path.spx.values, np.full(len(path), K2), tau, path.rf.values, path.q.values, vl, m, "call", iv_markup=markup)
        s1 = om.quoted_spread(v1, path.vix.values, path.index.year.values)
        s2 = om.quoted_spread(v2, path.vix.values, path.index.year.values)
        mid = v1 - v2
        debit = (v1[0] + O.FILL * s1[0] + O.COMM) - (v2[0] - O.FILL * s2[0] - O.COMM)
        exit_val = max((v1[-1] - O.FILL * s1[-1] - O.COMM) - (v2[-1] + O.FILL * s2[-1] + O.COMM), 0.0)
        marks = mid.copy()
        marks[-1] = exit_val
        # entry day: mark minus debit; later days: change in mark
        ch = np.r_[marks[0] - debit, np.diff(marks)]
        units = debit_frac / debit                     # NAV fraction per point of spread value
        pnl.loc[path.index] += units * ch
        # T-bill drag on the debit is ignored (idle cash earns bills in the baseline)
        entries.append(e)
    return pnl, entries


def m3_stream(nyse_idx):
    px = pd.read_csv("/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/17-short-macro/prices_adj.csv",
                     index_col=0, parse_dates=True)["BTC-USD"].dropna()
    wk = px.resample("W-FRI").last().dropna()
    on_wk = (wk > wk.rolling(10).mean()).shift(1)            # decided Friday, held the next week
    # daily position (calendar days): from Monday after the Friday signal
    pos = on_wk.reindex(px.index, method="ffill").fillna(False).astype(float)
    r = px.pct_change().fillna(0.0)
    daily = pos.shift(1).fillna(0.0) * r                     # position known at the prior day's close
    # aggregate calendar-day returns into NYSE sessions
    cum = (1 + daily).cumprod()
    s = cum.reindex(nyse_idx, method="ffill")
    ret = s.pct_change().fillna(0.0)
    # switches (entries) and forced re-entries at 60/90/120-day caps
    starts = pos[(pos.diff() > 0)].index
    spells = []
    for st in starts:
        after = pos.loc[st:]
        off = after[after == 0]
        en = off.index[0] if len(off) else pos.index[-1]
        spells.append((st, en, (en - st).days))
    return ret, spells


def m2_stream():
    import assets as A
    import p1_trend as P
    etf8 = ["SPY", "QQQ", "IEF", "GLD", "USO", "FXE", "FXY", "FXA"]
    RE, clsE = A.etf_universe(start="2004-01-01")
    R8 = RE[etf8]
    cls8 = {v: clsE[v] for v in etf8}
    costs, borrow, roll = P.cost_vectors(R8.columns, cls8, "etf")
    Wl, _ = P.tsmom_weights(R8, [252], 21, long_only=True)
    out = P.run_portfolio(R8, Wl, costs, borrow, roll)
    return 0.5 * out["net"]


def stats(x: pd.Series, rf: pd.Series) -> dict:
    x = x.dropna()
    yrs = len(x) / 252
    eq = (1 + x).cumprod()
    tot = (1 + x + rf.reindex(x.index).fillna(0)).cumprod()
    yr = x.groupby(x.index.year).apply(lambda z: (1 + z).prod() - 1)
    return dict(ex_mean_pa=x.mean() * 252, ex_cagr=eq.iloc[-1] ** (1 / yrs) - 1, vol=x.std() * np.sqrt(252),
                sharpe=x.mean() / x.std() * np.sqrt(252) if x.std() > 0 else np.nan,
                mdd_excess=(eq / eq.cummax() - 1).min(), mdd_total=(tot / tot.cummax() - 1).min(),
                total_cagr=tot.iloc[-1] ** (1 / yrs) - 1, worst_year_ex=yr.min(), worst_year=int(yr.idxmin()),
                best_year_ex=yr.max())


def main():
    spy = load("SPY")
    rf = spy["rf"]
    mk = O.market_plus()
    m1, m1tr = m1_stream(spy)
    streams = {"M1": m1}
    counts = {"M1": pd.Series(1, index=pd.DatetimeIndex(m1tr.entry))}
    for H in (42, 63, 84):
        p, ent = w10_stream(spy, H)
        streams[f"W10_{H}"] = p
        counts[f"W10_{H}"] = pd.Series(1, index=pd.DatetimeIndex(ent))
    for dte in (60, 90, 120):
        p, ent = o2_stream(mk, dte)
        streams[f"O2_{dte}"] = p.reindex(spy.index).fillna(0.0)
        counts[f"O2_{dte}"] = pd.Series(1, index=pd.DatetimeIndex(ent))
    m3, spells = m3_stream(spy.index)
    streams["M3"] = 0.03 * (m3 - rf).where(m3 != 0, 0.0)
    counts["M3"] = pd.Series(1, index=pd.DatetimeIndex([s[0] for s in spells]))
    try:
        m2 = m2_stream()
        streams["M2"] = m2.reindex(spy.index).fillna(0.0)
    except Exception as e:  # pragma: no cover
        print("M2 stream failed:", e)
    S = pd.DataFrame(streams).loc[:END].fillna(0.0)
    save(S.reset_index().rename(columns={"index": "date"}), "portfolio_daily_streams")

    books = {
        "Lean, 60 days (W10 shadow)": ["M1", "M3", "O2_60"],
        "Lean, 60 days + W10 at 42 (for reference)": ["M1", "M3", "O2_60", "W10_42"],
        "Lean, 90 days": ["M1", "M3", "O2_90", "W10_63"],
        "Lean, 120 days": ["M1", "M3", "O2_120", "W10_84"],
    }
    if "M2" in S:
        for k in list(books):
            books[k.replace("Lean", "Lean + M2")] = books[k] + ["M2"]
    rows = []
    for per, a in (("2008-2026", START_MAIN), ("1993-2026 (no M2/M3 before their data)", "1993-02-01")):
        for name, cols in books.items():
            x = S.loc[a:, cols].sum(axis=1)
            st = stats(x, rf)
            yrs = len(x) / 252
            n_tr = sum(int(counts[c].loc[a:].sum()) for c in cols if c in counts)
            rows.append(dict(period=per, book=name, trades_per_yr_ex_M2=n_tr / yrs, **st))
        # module stand-alone
        for c in S.columns:
            x = S.loc[a:, c]
            st = stats(x, rf)
            rows.append(dict(period=per, book=f"[module] {c}", trades_per_yr_ex_M2=(int(counts[c].loc[a:].sum()) / (len(x) / 252)) if c in counts else np.nan, **st))
        spy_x = (spy["aC"].pct_change() - rf).loc[a:END]
        st = stats(spy_x, rf)
        rows.append(dict(period=per, book="SPY buy-and-hold", trades_per_yr_ex_M2=0, **st))
    R = pd.DataFrame(rows)
    save(R, "portfolio_history")
    pd.set_option("display.width", 250)
    print(R.round(4).to_string(index=False))
    # crisis windows: combined drawdown inside 2008-09 and 2020 and 2022
    wins = {"2008-09": ("2008-01-02", "2009-12-31"), "2020": ("2020-01-02", "2020-12-31"), "2022": ("2022-01-03", "2022-12-30"),
            "2000-02": ("2000-01-03", "2002-12-31")}
    cw = []
    for name, cols in books.items():
        for w, (a, b) in wins.items():
            x = S.loc[a:b, cols].sum(axis=1)
            eq = (1 + x).cumprod()
            cw.append(dict(book=name, window=w, cum_excess=eq.iloc[-1] - 1, mdd=(eq / eq.cummax() - 1).min()))
    CW = pd.DataFrame(cw).pivot_table(index="book", columns="window", values=["cum_excess", "mdd"])
    save(CW.reset_index(), "portfolio_crisis_windows")
    print(CW.round(4).to_string())
    # M3 forced re-entries under each cap
    sp = pd.DataFrame(spells, columns=["start", "end", "days"])
    sp = sp[sp.start >= "2015-01-01"]
    yrs = (sp.end.max() - pd.Timestamp("2015-01-01")).days / 365.25
    for cap in (60, 90, 120):
        forced = int(np.sum(np.maximum(np.ceil(sp.days / cap) - 1, 0)))
        print(f"M3 cap {cap}: switches/yr {len(sp) / yrs:.2f}; forced re-entries/yr {forced / yrs:.2f}; "
              f"cost at IBIT 0.10% round trip x 3% sleeve {forced / yrs * 0.001 * 0.03 * 100:.4f}% NAV/yr; "
              f"Coinbase 0.8% {forced / yrs * 0.008 * 0.03 * 100:.4f}% NAV/yr")


if __name__ == "__main__":
    main()
