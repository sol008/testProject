"""Summary tables for the track 21 report, built from the results/ files of the other scripts:
  * O2 at the mid-point of the next-open and next-close entry proxies: per-trade stats, episodes,
    deflated Sharpe (N = 12 decision variants here; N = 840 track 14);
  * W10 contribution a year on the non-overlapping (one position at a time) trade list;
  * O2 signals that arrive while a W10 hold is open (US-equity cluster stacking).
Run after w10_duration, w10_nonoverlap, o2_duration (both modes).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from common21 import RESULTS, save
from common13 import deflated_sr
import o2_duration as O
import w10_duration as W


def o2_mid():
    T = pd.read_csv(RESULTS / "o2_trades.csv", parse_dates=["signal", "entry", "expiry", "exit"])
    yrs = (pd.Timestamp("2026-09-25") - pd.Timestamp("1990-03-01")).days / 365.25
    rows, eprows = [], []
    for dte in (60, 90, 120):
        for cool in sorted({60, dte}):
            g = T[(T.dte == dte) & (T.cool == cool) & (T.width == "100/105") & (T.cost == "base") &
                  (T["mode"].isin(["nextopen", "nextclose"]))]
            p = g.pivot_table(index="signal", columns="mode", values="R")
            x = p.mean(axis=1)
            ep = O.episodes(pd.Series(p.index))
            epm = x.groupby(ep).mean()
            sr = x.mean() / x.std(ddof=1)
            sk, ku = stats.skew(x.values), stats.kurtosis(x.values, fisher=False)
            rows.append(dict(dte=dte, cool=cool, n=len(x), per_yr=len(x) / yrs, mean=x.mean(), median=x.median(), sd=x.std(),
                             t=sr * np.sqrt(len(x)), win=(x > 0).mean(), lost_all=int((x <= -0.99).sum()),
                             IS_1990_2007=x[x.index < "2008"].mean(), OOS_2008_2026=x[x.index >= "2008"].mean(),
                             episodes=len(epm), ep_mean=epm.mean(), ep_t=epm.mean() / epm.std() * np.sqrt(len(epm)),
                             ep_negative=int((epm < 0).sum()),
                             dsr_N12=deflated_sr(sr, len(x), sk, ku, 12), dsr_N840=deflated_sr(sr, len(x), sk, ku, 840)))
            if cool == 60:
                first = pd.Series(p.index).groupby(ep).min()
                for k in epm.index:
                    eprows.append(dict(dte=dte, episode=int(k), first=first.loc[k].date(), n=int((ep == k).sum()), mean_R=epm.loc[k]))
    S = pd.DataFrame(rows)
    E = pd.DataFrame(eprows)
    Ep = E[E.dte == 60][["episode", "first", "n"]].set_index("episode").join(
        E.pivot_table(index="episode", columns="dte", values="mean_R"))
    save(S, "o2_mid_summary")
    save(Ep.reset_index(), "o2_episodes_mid")
    return S, Ep


def w10_contrib_nonoverlap():
    R = pd.read_csv(RESULTS / "w10_nonoverlap.csv")
    yrs = (pd.Timestamp("2026-09-28") - pd.Timestamp("1990-01-01")).days / 365.25
    rows = []
    for r in R.itertuples():
        f = r.n_trades / yrs
        edge = r.mean - r.era_placebo
        bills = 0.042 * r.H / 252
        for kap in (0.5, 0.3):
            d = dict(H=r.H, cap={42: 60, 63: 90, 84: 120}[r.H], trades_per_yr=f, edge=edge, kappa=kap,
                     hist=f * 0.067 * (r.era_placebo + kap * edge - bills))
            for lab, eq in (("fwd_lo", 0.03), ("fwd_mid", 0.045), ("fwd_hi", 0.06)):
                d[lab] = f * 0.067 * (eq * r.H / 252 + kap * edge - bills)
            rows.append(d)
    C = pd.DataFrame(rows)
    save(C, "w10_contribution_nonoverlap")
    return C


def o2_inside_w10():
    df = W.panel()
    idx = df.index
    ev = [i for i in W.crash_events(df) if idx[i] >= pd.Timestamp("1990-01-01")]
    sig = O.crash_signals(O.market_plus(), 60)
    rows = []
    for H in (42, 63, 84):
        taken, last = [], -1
        for i in ev:
            if i + 1 > last:
                taken.append(i)
                last = i + H
        wins = [(idx[i + 1], idx[min(i + H, len(idx) - 1)]) for i in taken]
        hits = [d.date().isoformat() for d in sig if any(a <= d <= b for a, b in wins)]
        rows.append(dict(H=H, o2_signals=len(sig), inside_open_w10=len(hits), dates="; ".join(hits)))
    X = pd.DataFrame(rows)
    save(X, "o2_inside_w10")
    return X


def expected_table():
    """Expected contribution a year (pre-tax, over T-bills, % of NAV) per module and book, per cap.
    Convention for the cap-sensitive modules (O2, W10, W8):
      high    = design convention: kappa 0.5 on the historical mean (history's equity drift kept);
      central = mean of the design convention and the forward convention (kappa 0.5, S&P drift at CAPE 41,
                4.5% total return);
      low     = kappa 0.3 with the low forward drift (3% total return).
    O2 under 90 / 120 days is run one spread at a time (cool-down = DTE, needed for the 3% premium factor
    budget): frequency from the cool-down = DTE signal list, per-trade value from all 26 signals (no credit for
    which signals the longer cool-down happened to skip).  W10 uses the non-overlapping trade list.
    Cap-insensitive modules keep the design's v3.2 section 6 ranges (M6 set to 0: shadow-only since v3.2)."""
    F = pd.read_csv(RESULTS / "o2_forward_contrib.csv")
    Wc = pd.read_csv(RESULTS / "w10_contribution_nonoverlap.csv")
    B = pd.read_csv(RESULTS / "w8_spreads.csv")
    yrs = (pd.Timestamp("2026-09-25") - pd.Timestamp("1990-03-01")).days / 365.25
    freq_cool = {60: 26 / yrs, 90: 22 / yrs, 120: 19 / yrs}
    rows = []
    for cap in (60, 90, 120):
        g = F[(F.dte == cap) & (F.cool == 60)]
        bills = 0.042 * cap / 365.0
        f = freq_cool[cap]

        def c(drift, kap, design=False):
            r = g[(g.drift == drift) & (g.kappa == kap)].iloc[0]
            er = kap * r.ev_mid if design else r.ER
            return f * 0.02 * (er - bills)
        o2 = dict(high=c("history", 0.5, True), fwd=c("fwd_mid", 0.5), low=c("fwd_lo", 0.3))
        o2["central"] = 0.5 * (o2["high"] + o2["fwd"])
        w = Wc[(Wc.cap == cap)]
        w5, w3 = w[w.kappa == 0.5].iloc[0], w[w.kappa == 0.3].iloc[0]
        w10 = dict(high=w5["hist"], fwd=w5["fwd_mid"], low=w3["fwd_lo"])
        w10["central"] = 0.5 * (w10["high"] + w10["fwd"])
        b = B[(B.H == 20) & (B.strikes == "sqrt-scaled")]
        bh, bf = b[b.drift == "history"].iloc[0], b[b.drift != "history"].iloc[0]
        b_bills = 0.042 * 28 / 365
        w8_hist = 0.4 * 0.01 * (bh.placebo_R + 0.25 * bh.edge - b_bills)
        w8_fwd = 0.4 * 0.01 * (bf.placebo_R + 0.25 * bh.edge - b_bills)
        mods = {
            "M1 ST-1 (6%)": (0.0008, 0.0005, 0.0010),
            "M3 BTC switch (3%)": (0.0010, -0.0030, 0.0050),
            "M4 O2 (2% debit)": (o2["central"], o2["low"], o2["high"]),
            "W8 (<=1%, 20 sessions)": (0.5 * (w8_hist + w8_fwd), -0.0010, 0.0020),
            "W10 (6.7%)": ((0.0, 0.0, 0.0) if cap == 60 else (w10["central"], w10["low"], w10["high"])),
            "W9 (paper)": (0.0, 0.0, 0.0),
            "M6 (shadow)": (0.0, 0.0, 0.0),
        }
        lean = [sum(v[k] for v in mods.values()) for k in range(3)]
        m2 = (0.006, 0.0, 0.012)
        for name, v in mods.items():
            rows.append(dict(cap=cap, row=name, central=v[0], low=v[1], high=v[2]))
        rows.append(dict(cap=cap, row="W10 if run live under this cap", central=w10["central"], low=w10["low"], high=w10["high"]))
        rows.append(dict(cap=cap, row="LEAN", central=lean[0], low=lean[1], high=lean[2]))
        rows.append(dict(cap=cap, row="M2 trend (s = 0.5)", central=m2[0], low=m2[1], high=m2[2]))
        rows.append(dict(cap=cap, row="LEAN + M2", central=lean[0] + m2[0], low=lean[1] + m2[1], high=lean[2] + m2[2]))
    E = pd.DataFrame(rows)
    E["nominal_central"] = np.where(E.row.str.startswith("LEAN"), 0.042 + E.central, np.nan)
    E["years_to_11x"] = np.where(E.row.str.startswith("LEAN"), np.log(11) / np.log(1 + 0.042 + E.central), np.nan)
    save(E, "portfolio_expected")
    return E


def main():
    pd.set_option("display.width", 250)
    print(expected_table().round(5).to_string(index=False))
    S, Ep = o2_mid()
    print(S.round(3).to_string(index=False))
    print(Ep.round(3).to_string())
    print(w10_contrib_nonoverlap().round(5).to_string(index=False))
    print(o2_inside_w10().to_string(index=False))


if __name__ == "__main__":
    main()
