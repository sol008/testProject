"""Family 5: closed-end-fund discount capture, and index inclusion / deletion / reconstitution effects at 1-4 months.

(a) CEF discounts (Pontiff 1995; Lee, Shleifer & Thaler 1991: discounts mean-revert and predict returns).
    Panel: US-listed CEFs whose daily NAV Yahoo carries as "X<ticker>X" (distribution-adjusted NAV and price).
    Discount D = price / NAV - 1 (unadjusted, same day).  Signal: the first close (quiet 20 sessions) with the
    discount's z-score against its own trailing 756 (or 252) sessions <= -2 (or -1.5), i.e. unusually wide for
    that fund.  Buy the fund at the next open, hold 21 / 42 / 63 / 84 sessions.  Measured: excess over T-bills,
    the edge vs an era-matched random entry into the same fund (track 22 placebo), and the change in the discount
    itself (the narrowing, in points of NAV; Yahoo's NAV "Adj Close" is only partly distribution-adjusted, so a
    price-TR minus NAV-TR difference would be biased and is not used).  Pooled over funds; t-stats
    clustered by signal month (discount blow-outs are market-wide: 2008, 2020, 2022).  Design 1999-2007, test
    2008-2026.  Survivor panel: funds that were liquidated or open-ended (often after activism, the case where a
    discount is realised) are missing, which biases AGAINST discount capture.
(b) S&P 500 additions and deletions (point-in-time membership from track 16's cache, 1997-2026): hold from the
    close before the effective date E-1 for 20 / 42 / 63 / 84 sessions.  Additions test the post-inclusion reversal
    (a long-only follower cannot short it); deletions test the rebound Chen, Noronha & Singal (2004) documented.
    Excess vs IWM for deletions (they are mid/small caps) and SPY for additions.  Deleted names that later
    delisted have no Yahoo prices (survivorship: biases the rebound UP).
(c) Russell reconstitution (index proxy, 2001-2025; recon day = last Friday of June): long IWM or IWC from the
    next open for 42 / 63 / 84 sessions vs an era-matched random entry, and the IWM-IWB spread over the window.
Outputs: results/f5_*.csv
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import logging  # noqa: E402

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import common24 as C  # noqa: E402

logging.getLogger("yfinance").setLevel(logging.CRITICAL)

CEFS = """GAB GDV GUT GAM USA RVT RMT BST BME BUI CII ETV ETY EOS EOI ETW ETB EXG EVT ETO ETG NIE UTF UTG RQI RNP RFI
FFA BDJ BGY BOE CSQ DNP TY ADX PEO SOR CET JCE JOF TWN SWZ IAF GCV GGT GNT GLU GGN HQH HQL THQ KYN NML CHI CHY CHW
CGO HTD HPI HPS HPF IGR FLC PFD PFO JPS JPC JQC JRI BIT BGT FRA FPF GOF PCN PDI PFN PHK PTY PCM RCS DSL DSU HYT BTZ
BHK BKT EVV EFT EFR EHI EAD ERC HIX NHS MHD MUI MYD MQY MUA NMZ NVG NEA NAD NZF NXP VKQ VMO VGM IIM IQI BLE BFK BTT
BYM PML PMF PCQ PMX AWF AFB ASA CEE IIF MXF KF SPE GRX NRO BGR BCX AOD AGD AWP NFJ NCV NCZ ACV CEM EMO FEI TYG NTG
KMF DMO JHS JLS EDD EMD MSD GHY HYI BGX BSL ECF BCV DHF DHY KTF MMU MVF MVT NPV NQP NUV NIM NXC NXN VPV VCV VKI""".split()


# ============================================================================ (a) CEF discounts
def cef_panel(min_years: float = 6.0) -> dict:
    out = {}
    for t in CEFS:
        try:
            p = C.C13.yf_raw(t)
            n = C.C13.yf_raw(f"X{t}X")
        except Exception:  # noqa: BLE001
            continue
        if p is None or n is None or len(p) < 500 or len(n) < 500:
            continue
        df = C.yf_frame(t)
        nav_c = n["Close"].reindex(df.index)
        nav_tr = n["Adj Close"].reindex(df.index) if "Adj Close" in n else nav_c
        # a NAV series that is stale or mostly missing is useless
        ok = nav_c.notna() & (nav_c > 0)
        if ok.sum() < 252 * min_years:
            continue
        df = df.loc[ok[ok].index[0]:]
        df["nav"] = nav_c.reindex(df.index).ffill(limit=3)
        df["nav_tr"] = nav_tr.reindex(df.index).ffill(limit=3)
        df["disc"] = df["C"] / df["nav"] - 1
        bad = (df["disc"].abs() > 0.6) | df["disc"].isna()
        df.loc[bad, "disc"] = np.nan
        df.attrs["ticker"] = t
        out[t] = df
    return out


def cef_z(df: pd.DataFrame, win: int) -> pd.Series:
    d = df["disc"]
    m = d.rolling(win, min_periods=int(win * 0.67)).mean()
    s = d.rolling(win, min_periods=int(win * 0.67)).std()
    return (d - m) / s


def cef_signals(df: pd.DataFrame, z_lvl: float, win: int) -> pd.Series:
    return C.first_cross(cef_z(df, win) <= z_lvl, quiet=20)


def cef_tests(panel: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows, trades = [], []
    variants = {"z-2 w756": (-2.0, 756), "z-1.5 w756": (-1.5, 756), "z-2 w252": (-2.0, 252)}
    for vname, (zl, win) in variants.items():
        for H in (21,) + C.HOLDS:
            for role, a, b in (("design", "1999-01-01", "2007-12-31"), ("test", "2008-01-01", "2026-12-31")):
                allt = []
                for t, df in panel.items():
                    sig = cef_signals(df, zl, win)
                    tr, st = C.evaluate(df, sig, H, "open", a, b, cost_bps=10.0, B=200)
                    if len(tr) == 0:
                        continue
                    # discount narrowing = change in the UNADJUSTED price/NAV discount over the window, in points
                    # of NAV.  (Yahoo's NAV "Adj Close" is only partly distribution-adjusted, so a price-TR minus
                    # NAV-TR difference would be biased upward; the discount itself is clean.)
                    ent = [df.index.get_loc(x) for x in tr["entry"]]
                    ext = [df.index.get_loc(x) for x in tr["exit"]]
                    dd = df["disc"].values
                    tr["disc_entry"] = [dd[i - 1] for i in ent]
                    tr["disc_change"] = [dd[j] - dd[i - 1] for i, j in zip(ent, ext)]
                    zz = cef_z(df, win)
                    tr["z_entry"] = [zz.iloc[i - 1] for i in ent]
                    tr["fund"] = t
                    allt.append(tr)
                if not allt:
                    continue
                T = pd.concat(allt, ignore_index=True)
                T["variant"], T["H"], T["role"] = vname, H, role
                trades.append(T)
                mm = T.groupby(T["signal"].dt.to_period("M"))["edge"].mean()
                t_cl = mm.mean() / mm.std(ddof=1) * np.sqrt(len(mm)) if len(mm) > 5 else np.nan
                pn = T.groupby(T["signal"].dt.to_period("M"))["disc_change"].mean()
                rows.append(dict(variant=vname, H=H, role=role, n=len(T), n_funds=T["fund"].nunique(),
                                 n_months=len(mm), per_yr=len(T) / C.years(a, min(pd.Timestamp(b), pd.Timestamp("2026-09-28"))),
                                 mean_excess=T["excess"].mean(), edge=T["edge"].mean(), t_clustered=t_cl,
                                 disc_change=T["disc_change"].mean(),
                                 t_disc_change=pn.mean() / pn.std(ddof=1) * np.sqrt(len(pn)) if len(pn) > 5 else np.nan,
                                 win=(T["net"] > 0).mean(), worst=T["net"].min(), disc_entry=T["disc_entry"].mean()))
                # ledger: overlap-robust t (Newey-West on signal-month means, lags = holding months)
                import math as _m
                t_nw = C.nw_t(mm.values, max(1, _m.ceil(H / 21)))
                rows[-1]["nw_t"] = t_nw
                C.Ledger.add("f5_cef_index", f"CEF {vname} H{H}", role, len(mm), t_nw, edge=T["edge"].mean())
    return pd.DataFrame(rows), (pd.concat(trades, ignore_index=True) if trades else pd.DataFrame())


# ============================================================================ (b) S&P 500 adds / deletes
def sp500_events() -> pd.DataFrame:
    comp = pd.read_csv(C.T16 / "sp500_hist_components.csv")
    comp["date"] = pd.to_datetime(comp["date"])
    rows, prev = [], None
    for d, t in zip(comp["date"], comp["tickers"]):
        s = set(t.split(","))
        if prev is not None:
            rows += [(d, a, "add") for a in s - prev] + [(d, r, "del") for r in prev - s]
        prev = s
    ch = pd.read_csv(C.T16 / "sp500_changes_since_2019.csv")
    for d, a, r in zip(ch["date"], ch["add"], ch["remove"]):
        for x in (a.split(",") if isinstance(a, str) else []):
            rows.append((pd.Timestamp(d), x.strip(), "add"))
        for x in (r.split(",") if isinstance(r, str) else []):
            rows.append((pd.Timestamp(d), x.strip(), "del"))
    ev = pd.DataFrame(rows, columns=["E", "raw", "type"])
    ev = ev[ev["E"] >= "1997-01-01"]
    ev["delisted_suffix"] = ev["raw"].str.contains(r"-\d{6}$")
    ev["ticker"] = ev["raw"].str.replace(r"-\d{6}$", "", regex=True).str.replace(".", "-", regex=False)
    # deterministic de-duplication (set order depends on string hashing): keep the unsuffixed listing first
    ev = ev.sort_values(["E", "ticker", "type", "delisted_suffix"], kind="mergesort")
    return ev.drop_duplicates(["E", "ticker", "type"], keep="first").reset_index(drop=True)


def sp500_tests() -> pd.DataFrame:
    sys.path.insert(0, str(C.CODE / "16-short-events"))
    from fastev import anchor_windows  # track 16, read-only
    ev = sp500_events()
    ev = ev[~ev["delisted_suffix"]].reset_index(drop=True)
    wins = {f"h{H}": (-1, -1 + H) for H in (20,) + C.HOLDS}
    w = anchor_windows(ev, wins, anchor_col="E", bench=["SPY", "IWM"], features=False, gap_offsets=(0,))
    rows = []
    ev_out = w[["E", "ticker", "type", "gap0"] + [f"h{H}" for H in (20,) + C.HOLDS]
               + [f"h{H}_{b}" for H in (20,) + C.HOLDS for b in ("SPY", "IWM")]].copy()
    C.save(ev_out, "f5_sp500_events")
    for typ, bench in (("add", "SPY"), ("del", "IWM")):
        for per, a, b in (("1997-2007", "1997-01-01", "2007-12-31"), ("2008-2026", "2008-01-01", "2026-12-31")):
            g = w[(w["type"] == typ) & (w["E"] >= a) & (w["E"] <= b)]
            for H in (20,) + C.HOLDS:
                for entry in ("close E-1", "open E"):
                    stock = g[f"h{H}"] if entry == "close E-1" else (1 + g[f"h{H}"]) / (1 + g["gap0"]) - 1
                    x = (stock - g[f"h{H}_{bench}"] - 0.002).dropna()      # 0.2% round trip
                    if len(x) < 8:
                        continue
                    mm = x.groupby(pd.to_datetime(g.loc[x.index, "E"]).dt.to_period("M")).mean()
                    t_cl = mm.mean() / mm.std(ddof=1) * np.sqrt(len(mm)) if len(mm) > 5 else np.nan
                    rows.append(dict(type=typ, entry=entry, period=per, H=H, n=len(x), n_total=len(g), mean=x.mean(),
                                     median=x.median(), win=(x > 0).mean(), t_clustered=t_cl, p05=x.quantile(0.05)))
                    if entry == "open E":
                        C.Ledger.add("f5_cef_index", f"S&P {typ} open E -> +{H}", per, len(x), t_cl, mean=x.mean())
    return pd.DataFrame(rows)


# ============================================================================ (c) Russell reconstitution
def russell_tests() -> pd.DataFrame:
    rows = []
    for t in ("IWM", "IWC"):
        df = C.yf_frame(t)
        idx = df.index
        rdays = []
        for y in range(2001, 2026):
            fr = pd.date_range(f"{y}-06-01", f"{y}-06-30", freq="W-FRI")
            R = fr[-1]
            k = idx.searchsorted(R, side="right") - 1
            if k > 0:
                rdays.append(idx[k])
        sig = pd.Series(False, index=idx)
        sig.loc[pd.DatetimeIndex(rdays)] = True
        for H in C.HOLDS:
            for role, a, b in (("2001-2007", "2001-01-01", "2007-12-31"), ("2008-2025", "2008-01-01", "2026-12-31")):
                tr, st = C.evaluate(df, sig, H, "open", a, b, cost_bps=2.0, B=2000)
                st.update(etf=t, role=role)
                rows.append(st)
                C.Ledger.add("f5_cef_index", f"Russell recon long {t} H{H}", role, st.get("n", 0), st.get("t_edge", np.nan),
                             edge=st.get("edge"))
    # relative spread IWM - IWB after R (not executable long-only; context)
    a, b = C.yf_frame("IWM")["aC"], C.yf_frame("IWB")["aC"]
    j = pd.concat([a, b], axis=1, keys=["m", "l"]).dropna()
    for H in C.HOLDS:
        sp = []
        for y in range(2001, 2026):
            R = pd.date_range(f"{y}-06-01", f"{y}-06-30", freq="W-FRI")[-1]
            k = j.index.searchsorted(R, side="right") - 1
            if k + 1 + H < len(j):
                sp.append((j["m"].iloc[k + 1 + H] / j["m"].iloc[k + 1]) - (j["l"].iloc[k + 1 + H] / j["l"].iloc[k + 1]))
        sp = np.array(sp)
        rows.append(dict(etf="IWM-IWB spread", role="2001-2025", H=H, n=len(sp), mean_ex=sp.mean(),
                         t_edge=sp.mean() / sp.std(ddof=1) * np.sqrt(len(sp)), edge=sp.mean()))
    return pd.DataFrame(rows)


def main():
    panel = cef_panel()
    print("CEF panel:", len(panel), "funds", sorted(panel)[:200], flush=True)
    meta = pd.DataFrame([dict(fund=t, start=df.index[0].date(), end=df.index[-1].date(), disc_mean=df["disc"].mean(),
                              disc_now=df["disc"].dropna().iloc[-1] if df["disc"].notna().any() else np.nan,
                              nav_vol=float(np.log(df["nav_tr"]).diff().std() * np.sqrt(252)),
                              worst10=C.C22.worst_window_loss(df["aC"], 10),
                              z_now_w756=float(cef_z(df, 756).dropna().iloc[-1]) if cef_z(df, 756).notna().any() else np.nan,
                              last_date=df["disc"].dropna().index[-1].date() if df["disc"].notna().any() else None)
                         for t, df in panel.items()])
    C.save(meta, "f5_cef_panel")
    cef, cef_tr = cef_tests(panel)
    C.save(cef, "f5_cef_tests")
    if len(cef_tr):
        keep = cef_tr[["variant", "H", "role", "fund", "signal", "entry", "exit", "net", "excess", "edge", "disc_change",
                       "disc_entry", "z_entry"]]
        # every variant's trades go to the scratchpad (read by f5b); results/ keeps the primary variant only
        keep.to_csv(C.SCRATCH / "f5_cef_trades_all.csv.gz", index=False, float_format="%.6g", compression="gzip")
        C.save(keep[keep["variant"] == "z-2 w756"], "f5_cef_trades")
    print(cef.round(4).to_string(index=False), flush=True)
    sp = sp500_tests()
    C.save(sp, "f5_sp500_adds_deletes")
    print(sp.round(4).to_string(index=False), flush=True)
    ru = russell_tests()
    C.save(ru, "f5_russell_recon")
    cols = ["etf", "role", "H", "n", "mean_ex", "base", "edge", "t_edge", "p_placebo"]
    print(ru[[c for c in cols if c in ru.columns]].round(4).to_string(index=False), flush=True)
    C.Ledger.save("f5_cef_index")


if __name__ == "__main__":
    main()
