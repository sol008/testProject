"""W10 (first uptrend crash day) at 42 / 63 / 84 sessions -- the 60 / 90 / 120 calendar-day caps.

Rule (track 17 R4, unchanged): the first S&P close <= -3% (no other <= -3% close in the prior 20 sessions)
with the prior close above its 200-day average.  Buy at the next open, hold H sessions.

Samples
  * Design / headline: 1990-2026 (track 17's n = 21).  Tradable return = SPY total return from the next
    open to the close of session t+H (1993+); the one 1991 event uses the S&P total return from the next
    close (^GSPC opens are stale before the 2000s).
  * Out-of-sample check: 1928-1989, S&P from the signal close (price) and from the next close (total return).
  * Pooled 1928-2026.

Statistics per horizon: mean / median / hit / t, worst and median interim drawdown (close-based, from the
entry price), era-matched placebo (each event date replaced by a random session within +-3 years, 5,000
draws) and uptrend-only placebo (random sessions whose prior close was above the 200-day average), both
two-sided.  The same random sessions are used at all three horizons, so the maximum standardised statistic
over horizons gives a family-wise p for "best of the three caps".
Variants checked (counted in the report): calendar-exact exit (open of the last session within 60/90/120
calendar days of entry), the design's all-time-high exit, the VIX > 45 void.
Overlap with M1 (ST-1): ST-1 signals on day 0-3; share of W10 holding sessions with an M1 trade open.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common21 import BILLS_FWD, CAPS, EQ_FWD, KAPPA, RNG_SEED, SCRATCH, placebo_p, save, sidak
from common13 import load, rsi_wilder, run_rule, sma

HS = [42, 63, 84]
NDRAW = 5000


def panel() -> pd.DataFrame:
    g = load("^GSPC")
    spy = load("SPY")
    vix = load("^VIX")["C"]
    df = pd.DataFrame({"C": g["C"], "aC": g["aC"], "rf": g["rf"]})
    df["spy_aO"] = spy["aO"].reindex(df.index)
    df["spy_aC"] = spy["aC"].reindex(df.index)
    df["vix"] = vix.reindex(df.index)
    df["ma200"] = df["C"].rolling(200, min_periods=200).mean()
    df["ath"] = df["C"].cummax()
    return df


def crash_events(df: pd.DataFrame, thr=-0.03, gap=20) -> list[int]:
    c = df["C"].values
    r = np.r_[np.nan, c[1:] / c[:-1] - 1]
    ma = df["ma200"].values
    ev, last = [], -10 ** 9
    for i in np.where(r <= thr)[0]:
        if i - last > gap and i >= 200 and np.isfinite(ma[i - 1]) and c[i - 1] > ma[i - 1]:
            ev.append(int(i))
        last = i
    return ev


def forward_tables(df: pd.DataFrame, H: int) -> dict[str, np.ndarray]:
    """Vectors indexed by signal session j (NaN where the window is incomplete).
    px   : S&P price, signal close -> close j+H
    nc   : S&P total return, next close j+1 -> close j+1+H
    trad : SPY TR next open j+1 -> close j+H where SPY exists, else `nc`
    mae_trad : worst close-based drawdown from the entry price inside the trade
    ex_bills : trad minus T-bills over the exposure sessions
    """
    n = len(df)
    C, aC, rf = df["C"].values, df["aC"].values, df["rf"].values
    so, sc = df["spy_aO"].values, df["spy_aC"].values
    rfc = np.r_[0.0, np.cumsum(rf)]
    px = np.full(n, np.nan)
    nc = np.full(n, np.nan)
    trad = np.full(n, np.nan)
    mae = np.full(n, np.nan)
    rfh = np.full(n, np.nan)
    j = np.arange(n)
    ok = j + H < n
    px[ok] = C[j[ok] + H] / C[j[ok]] - 1
    ok2 = j + 1 + H < n
    nc[ok2] = aC[j[ok2] + 1 + H] / aC[j[ok2] + 1] - 1
    # SPY next-open version
    spy_ok = ok & np.r_[np.isfinite(so[1:]), False] & np.isfinite(sc[np.minimum(j + H, n - 1)])
    trad[:] = nc
    trad[spy_ok] = sc[j[spy_ok] + H] / so[j[spy_ok] + 1] - 1
    # interim drawdown and bills
    from numpy.lib.stride_tricks import sliding_window_view
    w_sc = sliding_window_view(np.r_[sc, np.full(H + 2, np.nan)], H)      # sc[k .. k+H-1]
    w_ac = sliding_window_view(np.r_[aC, np.full(H + 2, np.nan)], H + 1)  # aC[k .. k+H]
    for jj in np.where(spy_ok)[0]:
        mae[jj] = min(np.nanmin(w_sc[jj + 1]) / so[jj + 1] - 1, 0.0)
        rfh[jj] = rfc[jj + H + 1] - rfc[jj + 1]
    for jj in np.where(ok2 & ~spy_ok)[0]:
        mae[jj] = min(np.nanmin(w_ac[jj + 1]) / aC[jj + 1] - 1, 0.0)
        rfh[jj] = rfc[jj + 2 + H] - rfc[jj + 2]
    return dict(px=px, nc=nc, trad=trad, mae=mae, ex=trad - rfh)


def calendar_exit_returns(df: pd.DataFrame, events: list[int], cap_days: int) -> pd.Series:
    """SPY: enter at the open of j+1, exit at the OPEN of the last session dated <= entry + cap_days
    (an evening email queues a market order for that open)."""
    idx = df.index
    so = df["spy_aO"].values
    out = {}
    for i in events:
        if i + 1 >= len(idx) or not np.isfinite(so[i + 1]):
            continue
        e = i + 1
        lim = idx[e] + pd.Timedelta(days=cap_days)
        x = idx.searchsorted(lim, side="right") - 1
        if x >= len(idx) - 1 or idx[x] > lim or x <= e:
            continue
        out[idx[i]] = so[x] / so[e] - 1
    return pd.Series(out)


def ath_exit_returns(df: pd.DataFrame, events: list[int], H: int) -> pd.Series:
    """Design spec: exit at day H or earlier at the next open after the first close at/above the
    pre-crash all-time high (SPY era only)."""
    idx = df.index
    C, so, sc = df["C"].values, df["spy_aO"].values, df["spy_aC"].values
    ath = df["ath"].values
    out = {}
    for i in events:
        if not np.isfinite(so[min(i + 1, len(so) - 1)]) or i + H >= len(idx):
            continue
        prior_ath = ath[i - 1]
        hit = None
        for k in range(i + 1, i + H):
            if C[k] >= prior_ath:
                hit = k
                break
        if hit is not None and hit + 1 < len(idx):
            out[idx[i]] = so[hit + 1] / so[i + 1] - 1
        else:
            out[idx[i]] = sc[i + H] / so[i + 1] - 1
    return pd.Series(out)


def summarize_sample(df, events, fwd, label, lo, hi, rng, uptrend_pool) -> list[dict]:
    """Stats for one sample at all horizons, with joint placebos."""
    n = len(df)
    rows = []
    # common random draws (era) for all horizons: complete windows at the longest horizon
    Hmax = max(HS)
    valid_all = np.arange(n) + 1 + Hmax < n
    era_idx = np.empty((NDRAW, len(events)), dtype=int)
    for k, i in enumerate(events):
        a, b = max(0, i - 756), min(n - 2 - Hmax, i + 756)
        era_idx[:, k] = rng.integers(a, b + 1, size=NDRAW)
    up_idx = rng.choice(uptrend_pool, size=(NDRAW, len(events)), replace=True)
    z_era, z_up, obs_z_era, obs_z_up = [], [], [], []
    for H in HS:
        for key in ("px", "nc", "trad"):
            v = fwd[H][key]
            x = v[events]
            x = x[np.isfinite(x)]
            if len(x) < 3:
                continue
            s_era = np.nanmean(v[era_idx], axis=1)
            s_up = np.nanmean(v[up_idx], axis=1)
            obs = float(x.mean())
            mae = fwd[H]["mae"][events]
            ex = fwd[H]["ex"][events]
            rows.append(dict(sample=label, H=H, series=key, n=len(x), mean=obs, median=float(np.median(x)),
                             sd=float(x.std(ddof=1)), hit=float((x > 0).mean()),
                             t0=float(obs / (x.std(ddof=1) / np.sqrt(len(x)))),
                             era_placebo=float(s_era.mean()), p_era=placebo_p(obs, s_era),
                             up_placebo=float(s_up.mean()), p_up=placebo_p(obs, s_up),
                             edge_era=obs - float(s_era.mean()), edge_up=obs - float(s_up.mean()),
                             worst_mae=float(np.nanmin(mae)) if key == "trad" else np.nan,
                             median_mae=float(np.nanmedian(mae)) if key == "trad" else np.nan,
                             mean_ex_bills=float(np.nanmean(ex)) if key == "trad" else np.nan,
                             worst=float(x.min()), best=float(x.max())))
            if key == "trad":
                z_era.append((s_era - s_era.mean()) / s_era.std())
                z_up.append((s_up - s_up.mean()) / s_up.std())
                obs_z_era.append((obs - s_era.mean()) / s_era.std())
                obs_z_up.append((obs - s_up.mean()) / s_up.std())
    # family-wise p across the three horizons (tradable series): max |z|
    if z_era:
        mz = np.max(np.abs(np.vstack(z_era)), axis=0)
        mzu = np.max(np.abs(np.vstack(z_up)), axis=0)
        fw_era = float(np.mean(mz >= np.max(np.abs(obs_z_era)) - 1e-12))
        fw_up = float(np.mean(mzu >= np.max(np.abs(obs_z_up)) - 1e-12))
        for r in rows:
            if r["series"] == "trad":
                r["fwer_p_era_3caps"] = fw_era
                r["fwer_p_up_3caps"] = fw_up
    return rows


def m1_overlap(df: pd.DataFrame, events: list[int]) -> pd.DataFrame:
    spy = load("SPY")
    c = spy["C"]
    r2 = rsi_wilder(c, 2)
    vix = load("^VIX")["C"].reindex(spy.index)
    sig = (r2 < 10) & (c > sma(c, 200)) & (vix >= 20)
    tr = run_rule(spy, sig, mode="open", hold=20, exit_sig=c > sma(c, 5))
    held = pd.Series(0, index=spy.index)
    for t in tr.itertuples():
        held.loc[t.entry:t.exit] = 1
    rows = []
    for i in events:
        d = df.index[i]
        if d not in spy.index:
            continue
        k = spy.index.get_loc(d)
        sig03 = bool(sig.iloc[k:k + 4].any())
        rec = dict(date=d.date(), st1_signal_day0_3=sig03)
        for H in HS:
            if k + H < len(spy):
                win = held.iloc[k + 1:k + H + 1]
                rec[f"m1_overlap_share_{H}"] = float(win.mean())
                rec[f"m1_trades_inside_{H}"] = int(((tr.entry > spy.index[k]) & (tr.entry <= spy.index[k + H])).sum())
        rows.append(rec)
    out = pd.DataFrame(rows)
    # share of all M1 trades (1993+) whose entry falls inside some W10 window
    for H in HS:
        inside = 0
        for t in tr.itertuples():
            for i in events:
                d = df.index[i]
                if d not in spy.index:
                    continue
                k = spy.index.get_loc(d)
                if k + H < len(spy) and spy.index[k] < t.entry <= spy.index[k + H]:
                    inside += 1
                    break
        out.attrs[f"m1_trades_in_w10_windows_{H}"] = inside
    out.attrs["m1_trades_total"] = len(tr)
    return out


def contribution_table(stats: pd.DataFrame, freq: float, size: float = 0.067) -> pd.DataFrame:
    """Expected contribution a year to the whole portfolio, over T-bills (forward bills 4.2%).
    hist-drift: E[R] = placebo + kappa * edge (track 17's worked example);
    fwd-drift : E[R] = forward S&P TR over H + kappa * edge, with the forward TR at 3 / 4.5 / 6% a year."""
    rows = []
    for H in HS:
        s = stats[(stats.H == H) & (stats.series == "trad")].iloc[0]
        bills = BILLS_FWD * H / 252
        for kap in (KAPPA, 0.3):
            e_hist = s.era_placebo + kap * s.edge_era - bills
            rec = dict(H=H, cap_days={v: k for k, v in CAPS.items()}[H], kappa=kap, events_per_yr=freq,
                       edge=s.edge_era, placebo=s.era_placebo,
                       per_trade_ex_hist=e_hist, contrib_hist=freq * size * e_hist)
            for lab, eq in zip(("lo", "mid", "hi"), EQ_FWD):
                e_f = eq * H / 252 + kap * s.edge_era - bills
                rec[f"per_trade_ex_fwd_{lab}"] = e_f
                rec[f"contrib_fwd_{lab}"] = freq * size * e_f
            rows.append(rec)
    return pd.DataFrame(rows)


def main():
    rng = np.random.default_rng(RNG_SEED)
    df = panel()
    ev_all = crash_events(df)
    idx = df.index
    ev90 = [i for i in ev_all if idx[i] >= pd.Timestamp("1990-01-01") and i + 1 + max(HS) < len(df)]
    ev28 = [i for i in ev_all if idx[i] < pd.Timestamp("1990-01-01") and i + 1 + max(HS) < len(df)]
    print("events 1990-2026:", len(ev90), "1928-1989:", len(ev28))
    print([idx[i].date().isoformat() for i in ev90])
    fwd = {H: forward_tables(df, H) for H in HS}
    C, ma = df["C"].values, df["ma200"].values
    upmask = np.r_[False, C[:-1] > ma[:-1]] & (np.arange(len(df)) + 1 + max(HS) < len(df))
    pool90 = np.where(upmask & (idx >= "1990-01-01"))[0]
    pool28 = np.where(upmask & (idx < "1990-01-01"))[0]
    rows = []
    rows += summarize_sample(df, ev90, fwd, "1990-2026", "1990", "2026", rng, pool90)
    rows += summarize_sample(df, ev28, fwd, "1928-1989", "1928", "1989", rng, pool28)
    rows += summarize_sample(df, ev28 + ev90, fwd, "1928-2026 pooled", "1928", "2026", rng, np.r_[pool28, pool90])
    st = pd.DataFrame(rows)
    save(st, "w10_stats")
    pd.set_option("display.width", 250)
    cols = ["sample", "H", "series", "n", "mean", "median", "hit", "t0", "era_placebo", "p_era", "up_placebo", "p_up",
            "edge_era", "worst_mae", "median_mae", "fwer_p_era_3caps", "fwer_p_up_3caps"]
    print(st[cols].round(4).to_string(index=False))

    # per-event table (1990+)
    pe = pd.DataFrame({"date": [idx[i].date() for i in ev90],
                       "vix": [df["vix"].values[i] for i in ev90]})
    for H in HS:
        pe[f"trad{H}"] = fwd[H]["trad"][ev90]
        pe[f"mae{H}"] = fwd[H]["mae"][ev90]
    save(pe, "w10_events_1990")
    print(pe.round(4).to_string(index=False))

    # calendar-exact and ATH-exit variants (SPY era)
    ev_spy = [i for i in ev90 if np.isfinite(df["spy_aO"].values[i + 1])]
    var = []
    for cap, H in CAPS.items():
        ce = calendar_exit_returns(df, ev_spy, cap)
        ae = ath_exit_returns(df, ev_spy, H)
        base = pd.Series(fwd[H]["trad"][ev_spy], index=[idx[i] for i in ev_spy])
        var.append(dict(cap=cap, H=H, n=len(ce), base_mean=base.mean(), calendar_exit_mean=ce.mean(),
                        calendar_exit_median=ce.median(), ath_exit_mean=ae.mean(), ath_exit_median=ae.median(),
                        ath_exits_early=int((ae.round(8) != base.reindex(ae.index).round(8)).sum())))
    var = pd.DataFrame(var)
    vix_void = [idx[i].date() for i in ev_all if df["vix"].values[i] > 45]
    print("\nVariants (SPY era, n=%d):" % len(ev_spy))
    print(var.round(4).to_string(index=False))
    print("Events voided by VIX > 45 (any trend):", vix_void)
    save(var, "w10_variants")

    # M1 overlap
    ov = m1_overlap(df, ev90)
    save(ov, "w10_m1_overlap")
    print("\nM1 overlap:")
    print(ov.to_string(index=False))
    print({k: v for k, v in ov.attrs.items()})
    print("share of W10 events with an ST-1 signal on day 0-3: %d/%d" % (ov.st1_signal_day0_3.sum(), len(ov)))
    for H in HS:
        print(f"H={H}: mean share of W10 holding sessions with an M1 trade open {ov[f'm1_overlap_share_{H}'].mean():.3f}; "
              f"M1 trades entered inside W10 windows {ov.attrs[f'm1_trades_in_w10_windows_{H}']}/{ov.attrs['m1_trades_total']}")

    # contributions
    yrs90 = (pd.Timestamp("2026-09-28") - pd.Timestamp("1990-01-01")).days / 365.25
    freq90 = len(ev90) / yrs90
    freq_all = (len(ev90) + len(ev28)) / ((pd.Timestamp("2026-09-28") - pd.Timestamp("1928-10-01")).days / 365.25)
    ct = contribution_table(st[st["sample"] == "1990-2026"], freq90)
    ct["basis"] = "1990-2026 edge"
    ct2 = contribution_table(st[st["sample"] == "1928-2026 pooled"], freq_all)
    ct2["basis"] = "1928-2026 pooled edge"
    ct = pd.concat([ct, ct2])
    save(ct, "w10_contribution")
    print("\nevents/yr 1990-2026 %.3f; 1928-2026 %.3f" % (freq90, freq_all))
    print(ct.round(5).to_string(index=False))
    # multiple-testing bookkeeping: best of 8 track-17 cells x 3 horizons
    for H in HS:
        p = st[(st["sample"] == "1990-2026") & (st.H == H) & (st.series == "trad")].p_era.iloc[0]
        print(f"H={H}: p_era {p:.4f}; Sidak over 8 cells {sidak(p, 8):.3f}; over 24 (8 cells x 3 caps) {sidak(p, 24):.3f}")


if __name__ == "__main__":
    main()
