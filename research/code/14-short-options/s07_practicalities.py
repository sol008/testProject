"""s07 - Practicalities from the live 2026-09-28 chain snapshot (after-close Yahoo quotes; treat spreads as
upper bounds): what a 45-DTE defined-risk trade costs to execute in SPX vs XSP vs SPY, margin/buying power,
a paper-fill rule, and today's implied event moves (NFP 2 Oct, CPI 14 Oct, FOMC 28 Oct) from the SPX
expiry-by-expiry term structure.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm

import optmodel as om
from common14 import OUT, save

COMM = {"^SPX": 1.30, "^XSP": 0.75, "SPY": 0.65}   # $ per contract per leg incl. typical exchange/index fees (assumption)
MULT = 100


def nearest(df, col, val):
    return df.iloc[(df[col] - val).abs().argsort().iloc[:1]]


def bs_delta_put(F, K, T, iv):
    d1 = (np.log(F / K) + 0.5 * iv ** 2 * T) / (iv * np.sqrt(T))
    return norm.cdf(d1) - 1


def bs_delta_call(F, K, T, iv):
    d1 = (np.log(F / K) + 0.5 * iv ** 2 * T) / (iv * np.sqrt(T))
    return norm.cdf(d1)


def spread_trade(ch, ticker, expiry, short_delta=0.20, width_pct=0.05, side="put"):
    g = ch[(ch.ticker == ticker) & (ch.expiry == expiry) & (ch.kind == side) & (ch.bid > 0) & (ch.ask > 0) & ch.iv_mid.notna()].copy()
    if g.empty:
        return None
    F, T = g.F.iloc[0], g["T"].iloc[0]
    g["delta"] = bs_delta_put(F, g.strike, T, g.iv_mid) if side == "put" else bs_delta_call(F, g.strike, T, g.iv_mid)
    short = g.iloc[(g.delta.abs() - short_delta).abs().argsort().iloc[:1]].iloc[0]
    target = short.strike * (1 - width_pct) if side == "put" else short.strike * (1 + width_pct)
    long = g.iloc[(g.strike - target).abs().argsort().iloc[:1]].iloc[0]
    width = abs(short.strike - long.strike)
    mid_credit = short.mid - long.mid
    nat_credit = short.bid - long.ask
    comm = 2 * COMM[ticker] / MULT
    paper_fill = mid_credit - 0.25 * (short.ask - short.bid + long.ask - long.bid)
    ml = width - paper_fill
    return dict(ticker=ticker, expiry=expiry, dte=int(short.dte), side=side, spot=float(short.spot), short_K=short.strike,
                short_delta=round(float(short.delta), 3), short_bid=short.bid, short_ask=short.ask, long_K=long.strike,
                long_bid=long.bid, long_ask=long.ask, width=width, mid_credit=mid_credit, natural_credit=nat_credit,
                natural_haircut_pct_of_mid=(mid_credit - nat_credit) / mid_credit,
                paper_fill_credit=paper_fill, commission_per_spread_pts=comm, max_loss_pts=ml,
                credit_over_maxloss=paper_fill / ml, dollars_at_risk_per_spread=ml * MULT,
                reg_t_requirement_per_spread=(width - paper_fill) * MULT,
                cost_mid_to_paper_plus_comm_pct_of_credit=(mid_credit - paper_fill + comm) / mid_credit,
                short_oi=short.openInterest, long_oi=long.openInterest)


def implied_event_moves(ch):
    s = ch[(ch.ticker == "^SPX") & (ch.bid > 0) & (ch.ask > 0) & ch.iv_mid.notna() & (ch.dte >= 1)]
    rows = []
    for (ex, dte), g in s.groupby(["expiry", "dte"]):
        g = g.sort_values("strike")
        lk = np.log(g.strike / g.F)
        # ATM straddle-equivalent IV at the forward
        atm = np.interp(0.0, lk, g.iv_mid)
        rows.append(dict(expiry=pd.Timestamp(ex), dte=dte, atm_iv=atm, T=g["T"].iloc[0]))
    ts = pd.DataFrame(rows).sort_values("expiry").reset_index(drop=True)
    # total variance in trading-day units: use business days between 2026-09-28 close and expiry close
    asof = pd.Timestamp("2026-09-28")
    ts["bdays"] = [np.busday_count(asof.date(), e.date()) for e in ts.expiry]
    ts["w"] = ts.atm_iv ** 2 * ts["T"]
    ts["dw"] = ts.w.diff()
    ts["dbd"] = ts.bdays.diff()
    events = {"NFP 2026-10-02": "2026-10-02", "CPI 2026-10-14": "2026-10-14", "FOMC 2026-10-28": "2026-10-28"}
    out = []
    normal = ts[(ts.dbd == 1)]
    for name, d in events.items():
        e = pd.Timestamp(d)
        i = ts.index[ts.expiry == e]
        if not len(i):
            continue
        i = i[0]
        dw = ts.loc[i, "dw"]
        # normal one-day variance: median of 1-business-day increments that contain no event
        ev_days = [pd.Timestamp(x) for x in events.values()]
        nd = normal[~normal.expiry.isin(ev_days)].dw
        nd_med = float(nd[nd > 0].median())
        ev_var = max(dw - nd_med, 0) + nd_med
        out.append(dict(event=name, var_increment=dw, normal_day_var=nd_med, implied_event_day_sd=np.sqrt(ev_var),
                        implied_excess_sd=np.sqrt(max(dw - nd_med, 0)), normal_day_sd=np.sqrt(nd_med),
                        straddle_equiv_move=np.sqrt(2 / np.pi) * np.sqrt(ev_var)))
    return ts, pd.DataFrame(out)


def main():
    ch = pd.read_csv(om.SNAP)
    rows = []
    for tk, ex in [("^SPX", "2026-11-13"), ("^SPX", "2026-11-20"), ("^XSP", "2026-11-13"), ("^XSP", "2026-11-20"),
                   ("SPY", "2026-11-13"), ("SPY", "2026-11-20")]:
        for side in ("put", "call"):
            r = spread_trade(ch, tk, ex, side=side)
            if r:
                rows.append(r)
    tr = pd.DataFrame(rows)
    save(tr, "s07_live_spread_costs", index=False)
    # quoted spread % of mid by product, 25-60 DTE, 0.10-0.30 |delta| OTM options
    ch2 = ch[(ch.bid > 0) & (ch.ask > 0) & ch.dte.between(25, 60) & ch.iv_mid.notna()].copy()
    ch2["delta"] = np.where(ch2.kind == "put", bs_delta_put(ch2.F, ch2.strike, ch2["T"], ch2.iv_mid),
                            bs_delta_call(ch2.F, ch2.strike, ch2["T"], ch2.iv_mid))
    sel = ch2[ch2.delta.abs().between(0.03, 0.35)]
    q = sel.groupby(["ticker", pd.cut(sel.delta.abs(), [0.03, 0.08, 0.15, 0.25, 0.35])]).agg(
        n=("mid", "size"), median_mid=("mid", "median"), median_spread=("spread", "median"),
        median_spread_pct=("spread_pct_mid", "median"), median_oi=("openInterest", "median")).reset_index()
    save(q, "s07_quoted_spreads_by_delta", index=False)
    ts, ev = implied_event_moves(ch)
    ts.to_csv(OUT / "s07_spx_term_structure_20260928.csv", index=False, float_format="%.6f")
    save(ev, "s07_implied_event_moves_20260928", index=False)
    with pd.option_context("display.width", 250, "display.max_columns", 40):
        print(tr.T.to_string())
        print(q.round(4).to_string(index=False))
        print(ts.round(5).to_string(index=False))
        print(ev.round(5).to_string(index=False))


if __name__ == "__main__":
    main()
