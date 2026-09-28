"""s04 - Is buying options around scheduled events positive EV?  (index: FOMC/CPI/NFP; stocks: earnings)

A. VIX1D (CBOE 1-day implied vol, 2022-05-13 onward): implied 1-day SD = VIX1D/sqrt(252) at the close
   of day t versus the realised close-to-close move on day t+1, split by event type of day t+1.
   1-day ATM straddle P&L proxy: premium = k * sqrt(2/pi) * sigma_1d * S (k = ATM/VIX1D ratio; 1.0 base,
   0.9/1.1 sensitivity), payoff |S_t+1 - S_t|, cost = half the quoted spread each way (1% of premium).
B. VIX9D event-variance extraction (2011+): implied event-day SD from the drop in VIX9D across the event.
C. Realised SPX event-day moves 1994-2026 (FOMC 1994+, CPI 1994+, NFP 2005+) vs other days.
D. Index 'IV run-up' trade (model-priced 30-day ATM straddle): buy at E-3 close, sell at E-1 close
   (before the event) vs buy at E-1 and sell at E close (through the event).  2011+ (VIX9D real).
E. Single stocks with CBOE equity-VIX indices (VXAPL, VXGOG, VXAZN, VXGS, VXIBM; 2011+): implied
   earnings move from the IV crush vs the realised earnings move; straddle-through-earnings P&L and
   the pre-earnings run-up trade (buy 5 days before, sell the day before), BS-priced off the index IV.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import optmodel as om
from common14 import OUT, bs_price, cboe, save, yf_close, yf_df


def part_a(mk: pd.DataFrame) -> pd.DataFrame:
    d = mk[["spx", "vix1d", "fomc_day", "cpi_day", "nfp_day"]].copy()
    d = d.loc["2022-05-13":]
    d["sig"] = d.vix1d / 100 / np.sqrt(252)
    d["r_next"] = np.log(d.spx.shift(-1) / d.spx)
    for c in ["fomc_day", "cpi_day", "nfp_day"]:
        d[c + "_next"] = d[c].shift(-1).fillna(False).astype(bool)
    d = d.dropna(subset=["sig", "r_next"])
    d["event"] = np.select([d.fomc_day_next, d.cpi_day_next, d.nfp_day_next], ["FOMC", "CPI", "NFP"], "none")
    rows = []
    for ev, g in list(d.groupby("event")) + [("ALL", d)]:
        row = dict(event=ev, n=len(g), mean_implied_sd=g.sig.mean(), mean_abs_move=g.r_next.abs().mean(),
                   ratio_abs_move_to_expected=g.r_next.abs().mean() / (np.sqrt(2 / np.pi) * g.sig).mean(),
                   realised_over_implied_variance=(g.r_next ** 2).mean() / (g.sig ** 2).mean(),
                   p_move_gt_straddle=(g.r_next.abs() > np.sqrt(2 / np.pi) * g.sig).mean())
        for k in (0.9, 1.0, 1.1):
            prem = k * np.sqrt(2 / np.pi) * g.sig
            pnl = g.r_next.abs() / prem - 1 - 0.02      # 1% half-spread in, 1% out (cash-settled: out ~0)
            row[f"straddle_mean_k{k}"] = pnl.mean()
            if k == 1.0:
                row["straddle_median"] = pnl.median()
                row["straddle_t"] = pnl.mean() / (pnl.std() / np.sqrt(len(pnl)))
                row["straddle_win"] = (pnl > 0).mean()
        rows.append(row)
    return pd.DataFrame(rows)


def part_b(mk: pd.DataFrame) -> pd.DataFrame:
    d = mk[["spx", "vix9d_act", "fomc_day", "cpi_day", "nfp_day"]].dropna(subset=["vix9d_act"]).copy()
    d["r"] = np.log(d.spx).diff()
    d["pre"] = d.vix9d_act.shift(1) / 100
    d["post"] = d.vix9d_act / 100
    var_e = (d.pre ** 2 - d.post ** 2) * 9 / 365 + d.post ** 2 * (365 / 252) / 365
    d["impl_sd_event"] = np.sqrt(var_e.clip(lower=0))
    rows = []
    for ev, mask in [("FOMC", d.fomc_day), ("CPI", d.cpi_day), ("NFP", d.nfp_day),
                     ("none", ~(d.fomc_day | d.cpi_day | d.nfp_day))]:
        g = d[mask].dropna()
        for per, a, b in [("2011-2019", "2011", "2019"), ("2020-2026", "2020", "2026")]:
            gg = g.loc[a:b]
            rows.append(dict(event=ev, period=per, n=len(gg), mean_impl_sd=gg.impl_sd_event.mean(),
                             mean_abs_move=gg.r.abs().mean(),
                             realised_var_over_implied=(gg.r ** 2).mean() / (gg.impl_sd_event ** 2).mean(),
                             median_ratio_abs_to_sd=(gg.r.abs() / gg.impl_sd_event.replace(0, np.nan)).median()))
    return pd.DataFrame(rows)


def part_c(mk: pd.DataFrame) -> pd.DataFrame:
    d = mk[["spx", "fomc_day", "cpi_day", "nfp_day"]].copy()
    d["r"] = np.log(d.spx).diff()
    d = d.loc["1994-02-01":]
    rows = []
    for per, a, b in [("1994-2007", "1994", "2007"), ("2008-2019", "2008", "2019"), ("2020-2026", "2020", "2026"),
                      ("2022-2026", "2022", "2026")]:
        g = d.loc[a:b]
        base = g[~(g.fomc_day | g.cpi_day | g.nfp_day)].r.abs().mean()
        for ev, m in [("FOMC", g.fomc_day), ("CPI", g.cpi_day), ("NFP", g.nfp_day)]:
            x = g[m].r
            if len(x) < 5:
                continue
            rows.append(dict(period=per, event=ev, n=len(x), mean_abs=x.abs().mean(), other_days_mean_abs=base,
                             ratio=x.abs().mean() / base, p_abs_gt_1pct=(x.abs() > 0.01).mean(),
                             p_abs_gt_2pct=(x.abs() > 0.02).mean(), mean_ret=x.mean()))
    return pd.DataFrame(rows)


def part_d(mk: pd.DataFrame) -> pd.DataFrame:
    """Index IV run-up vs through-event, model-priced 30-day ATM straddle (real VIX9D from 2011)."""
    mode, markup = om.settings()
    idx = mk.index
    d = mk.loc["2011-01-10":]
    rows = []
    for ev in ["fomc_day", "cpi_day", "nfp_day"]:
        for E in d.index[d[ev]]:
            i = idx.get_loc(E)
            if i < 3 or i + 1 >= len(idx):
                continue
            for trade, (a, b) in {"runup E-3->E-1": (i - 3, i - 1), "through E-1->E": (i - 1, i)}.items():
                d0, d1 = idx[a], idx[b]
                r0, r1 = mk.loc[d0], mk.loc[d1]
                expiry = d0 + pd.Timedelta(days=30)
                K = r0.spx
                vals = []
                for rr, dd in ((r0, d0), (r1, d1)):
                    tau = np.array([(expiry - dd).days], float)
                    vl = np.array([[rr.vix9d, rr.vix, rr.vix3m, rr.vix6m]])
                    m = np.array([om.m_from_mode(rr.m_skew, mode)])
                    c, _ = om.price(rr.spx, np.array([K]), tau, rr.rf, rr.q, vl, m, "call", iv_markup=markup)
                    p, _ = om.price(rr.spx, np.array([K]), tau, rr.rf, rr.q, vl, m, "put", iv_markup=markup)
                    vals.append(float(c[0] + p[0]))
                spr = om.quoted_spread(np.array([vals[0] / 2]), np.array([r0.vix]), 2020)[0] * 2
                cost = 0.5 * spr * 2   # half the straddle spread on entry and on exit
                rows.append(dict(event=ev.replace("_day", "").upper(), trade=trade, date=E,
                                 pnl_pct=(vals[1] - vals[0] - cost) / vals[0], pnl_pct_mid=(vals[1] - vals[0]) / vals[0]))
    t = pd.DataFrame(rows)
    out = t.groupby(["event", "trade"]).agg(n=("pnl_pct", "size"), mean=("pnl_pct", "mean"), median=("pnl_pct", "median"),
                                            mean_at_mid=("pnl_pct_mid", "mean"), win=("pnl_pct", lambda s: (s > 0).mean()),
                                            t=("pnl_pct", lambda s: s.mean() / (s.std() / np.sqrt(len(s))))).reset_index()
    return out


EQUITY_VIX = {"AAPL": "VXAPL", "GOOGL": "VXGOG", "AMZN": "VXAZN", "GS": "VXGS", "IBM": "VXIBM"}


def earnings_dates(ticker: str) -> pd.DataFrame:
    from common14 import DATA_DIR
    p = DATA_DIR / f"earnings_{ticker}.csv"
    if not p.exists():
        import yfinance as yf
        e = yf.Ticker(ticker).get_earnings_dates(limit=100)
        e.to_csv(p)
    e = pd.read_csv(p)
    col = e.columns[0]
    ts = pd.to_datetime(e[col], utc=True).dt.tz_convert("America/New_York")
    out = pd.DataFrame({"ts": ts})
    out["date"] = ts.dt.tz_localize(None).dt.normalize()
    out["amc"] = ts.dt.hour >= 12          # after market close
    return out.drop_duplicates("date")


def part_e() -> tuple[pd.DataFrame, pd.DataFrame]:
    rows = []
    for tk, vx in EQUITY_VIX.items():
        px = yf_close(tk, field="Adj Close")
        iv = cboe(vx) / 100
        ed = earnings_dates(tk)
        ed = ed[(ed.date >= "2011-02-01") & (ed.date <= "2026-09-25")]
        idx = px.index
        for _, e in ed.iterrows():
            if e.date not in idx:
                continue
            i = idx.get_loc(e.date)
            pre_i, post_i = (i, i + 1) if e.amc else (i - 1, i)
            if pre_i < 6 or post_i >= len(idx):
                continue
            d_pre, d_post = idx[pre_i], idx[post_i]
            if d_pre not in iv.index or d_post not in iv.index:
                continue
            ivp, ivq = iv.loc[d_pre], iv.loc[d_post]
            S0, S1 = px.loc[d_pre], px.loc[d_post]
            T = 30 / 365
            var_e = T * (ivp ** 2 - ivq ** 2) + ivq ** 2 / 252
            impl_sd = np.sqrt(max(var_e, 0))
            r = np.log(S1 / S0)
            # straddle through the event (30-day ATM, BS on the index IV), costs 3% of premium round trip
            prem0 = bs_price(S0, S0, T, 0.02, 0.0, ivp, "call") + bs_price(S0, S0, T, 0.02, 0.0, ivp, "put")
            dt = (d_post - d_pre).days / 365
            prem1 = bs_price(S1, S0, T - dt, 0.02, 0.0, ivq, "call") + bs_price(S1, S0, T - dt, 0.02, 0.0, ivq, "put")
            through = prem1 / prem0 - 1 - 0.03
            # run-up: buy 5 trading days before the pre-event close, sell at the pre-event close
            d_b = idx[pre_i - 5]
            if d_b in iv.index:
                Sb, ivb = px.loc[d_b], iv.loc[d_b]
                pb0 = bs_price(Sb, Sb, T, 0.02, 0.0, ivb, "call") + bs_price(Sb, Sb, T, 0.02, 0.0, ivb, "put")
                dt2 = (d_pre - d_b).days / 365
                # fixed-expiry option: its IV at d_pre carries the whole event variance over a shorter life
                t_rem = T - dt2
                iv_fix = np.sqrt(max((var_e + ivq ** 2 * max(t_rem - 1 / 252, 1e-4)) / t_rem, 1e-6))
                pb1 = bs_price(S0, Sb, t_rem, 0.02, 0.0, iv_fix, "call") + bs_price(S0, Sb, t_rem, 0.02, 0.0, iv_fix, "put")
                runup = pb1 / pb0 - 1 - 0.03
                runup_iv_change = iv_fix - ivb
            else:
                runup = np.nan
                runup_iv_change = np.nan
            rows.append(dict(ticker=tk, date=e.date, amc=e.amc, iv_pre=ivp, iv_post=ivq, crush=ivq - ivp,
                             implied_sd=impl_sd, abs_move=abs(r), move=r, ratio=abs(r) / impl_sd if impl_sd > 0 else np.nan,
                             straddle_through=through, runup_trade=runup, runup_iv_change=runup_iv_change))
    ev = pd.DataFrame(rows)
    summ = []
    for (tk, per), g in list(ev.assign(per=np.where(ev.date.dt.year <= 2018, "2011-2018", "2019-2026")).groupby(["ticker", "per"])) + \
            [(("ALL", "2011-2018"), ev[ev.date.dt.year <= 2018]), (("ALL", "2019-2026"), ev[ev.date.dt.year > 2018]),
             (("ALL", "all"), ev)]:
        summ.append(dict(ticker=tk, period=per, n=len(g), mean_implied_sd=g.implied_sd.mean(),
                         mean_expected_abs=(np.sqrt(2 / np.pi) * g.implied_sd).mean(), mean_abs_move=g.abs_move.mean(),
                         median_abs_move=g.abs_move.median(),
                         p_move_gt_expected=(g.abs_move > np.sqrt(2 / np.pi) * g.implied_sd).mean(),
                         mean_iv_crush_pts=100 * g.crush.mean(),
                         through_mean=g.straddle_through.mean(), through_median=g.straddle_through.median(),
                         through_t=g.straddle_through.mean() / (g.straddle_through.std() / np.sqrt(len(g))),
                         through_win=(g.straddle_through > 0).mean(),
                         runup_mean=g.runup_trade.mean(), runup_t=g.runup_trade.mean() / (g.runup_trade.std() / np.sqrt(g.runup_trade.notna().sum())),
                         runup_win=(g.runup_trade > 0).mean(), runup_iv_change_pts=100 * g.runup_iv_change.mean()))
    return ev, pd.DataFrame(summ)


def main():
    mk = om.market()
    a = part_a(mk)
    save(a, "s04a_vix1d_event_straddles", index=False)
    b = part_b(mk)
    save(b, "s04b_vix9d_event_variance", index=False)
    c = part_c(mk)
    save(c, "s04c_realised_event_moves", index=False)
    d = part_d(mk)
    save(d, "s04d_index_runup_vs_through", index=False)
    ev, e = part_e()
    ev.to_csv(OUT / "s04e_earnings_events.csv", index=False, float_format="%.5f")
    save(e, "s04e_earnings_summary", index=False)
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        for x in (a, b, c, d, e):
            print(x.round(4).to_string(index=False))
            print()


if __name__ == "__main__":
    main()
