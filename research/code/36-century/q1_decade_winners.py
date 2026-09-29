"""Q1: the best thing to own each decade (USD), 1870s–2020s, and the regret of holding the US index.

Outputs (results/):
  q1_panel_diagnostics.csv   extreme country-years in the USD panel (sanity check of the FX conversion)
  q1_decade_table.csv        per decade: best equity market, best asset of any class, best non-equity,
                             gold/oil/BTC where available, US equity CAGR, regret
  q1_decade_country_cagr.csv country x decade equity CAGR matrix (USD)
  q1_etf_era.csv             2000s/2010s/2020s with the ETF universe (adds China, India, Korea, Taiwan,
                             Brazil, Hong Kong, Canada, EM, gold, commodities, bitcoin, bonds)
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import data36 as D

OUT = D.RESULTS
MIN_YEARS = 7  # a decade CAGR needs at least this many years of data

ETF_MAP = {  # country ETF used to extend the annual panel 2021–2026
    "USA": "SPY", "Japan": "EWJ", "Germany": "EWG", "UK": "EWU", "France": "EWQ", "Italy": "EWI", "Spain": "EWP",
    "Netherlands": "EWN", "Switzerland": "EWL", "Sweden": "EWD", "Belgium": "EWK", "Australia": "EWA",
    "Denmark": "EDEN", "Finland": "EFNL", "Norway": "ENOR", "Canada": "EWC",
}  # Portugal's ETF (PGAL) was delisted in 2025, so Portugal is not extended past 2020
EXTRA_ETFS = {"China": "FXI", "India": "INDA", "Korea": "EWY", "Taiwan": "EWT", "Brazil": "EWZ", "Hong Kong": "EWH",
              "Mexico": "EWW", "South Africa": "EZA", "Emerging mkts": "EEM", "Gold (GLD)": "GLD",
              "Commodities (DBC)": "DBC", "US 20y Treasuries (TLT)": "TLT", "Semis (SOXX)": "SOXX", "Nasdaq-100 (QQQ)": "QQQ"}


def annual_from_daily(px: pd.Series) -> pd.Series:
    """Calendar-year total returns from a daily adjusted price series; the last (partial) year is kept
    and flagged by the caller."""
    ye = px.groupby(px.index.year).last()
    r = ye / ye.shift(1) - 1
    return r.dropna()


def decade_cagr(r: pd.Series) -> pd.DataFrame:
    """Per-decade CAGR and number of years for an annual return series indexed by year."""
    r = r.dropna()
    rows = []
    for dec, g in r.groupby((r.index // 10) * 10):
        n = len(g)
        rows.append({"decade": f"{dec}s", "n_years": n, "cagr": D.cagr(float((1 + g).prod()), n),
                     "growth": float((1 + g).prod())})
    return pd.DataFrame(rows).set_index("decade")


def run() -> None:
    p = D.jst_usd_panel()
    # ---- diagnostics: extreme USD returns
    ext = p[(p.r_usd > 3) | (p.r_usd < -0.85)].sort_values("r_usd")
    ext.to_csv(os.path.join(OUT, "q1_panel_diagnostics.csv"), index=False)
    print("extreme country-years (USD return > +300% or < -85%):")
    print(ext[["year", "country", "asset", "r_usd", "r_loc", "fx_growth"]].to_string(index=False))

    eq = D.usd_wide("eq")
    bond = D.usd_wide("bond")
    bill = D.usd_wide("bill")
    hous = D.usd_wide("housing")
    gold = D.gold_annual()
    us = eq["USA"]

    # ---- extend equities 2021–2026 with country ETFs (USD total return)
    ext_rows = {}
    for c, t in ETF_MAP.items():
        try:
            a = annual_from_daily(D.yf_close(t))
            ext_rows[c] = a[(a.index >= 2021)]
        except Exception as e:  # pragma: no cover
            print("ETF extension failed", c, t, e)
    ext_df = pd.DataFrame(ext_rows)
    eq_x = pd.concat([eq, ext_df]).sort_index()
    eq_x = eq_x[~eq_x.index.duplicated(keep="first")]
    us_x = eq_x["USA"]

    # per-decade country CAGRs
    dec_rows = {}
    for c in eq_x.columns:
        dc = decade_cagr(eq_x[c])
        dec_rows[c] = dc["cagr"].where(dc["n_years"] >= MIN_YEARS)
    dmat = pd.DataFrame(dec_rows)
    # 2020s is partial (2021-01 to 2026-09 plus JST 2020): allow it with fewer years
    d2020 = {c: decade_cagr(eq_x[c]).loc["2020s", "cagr"] for c in eq_x.columns if "2020s" in decade_cagr(eq_x[c]).index}
    dmat.loc["2020s"] = pd.Series(d2020)
    dmat.to_csv(os.path.join(OUT, "q1_decade_country_cagr.csv"))

    # asset-class decade table
    rows = []
    for dec in dmat.index:
        d0 = int(dec[:-1])
        yrs = list(range(d0, d0 + 10))
        us_c = dmat.loc[dec, "USA"]
        eqd = dmat.loc[dec].drop("USA").dropna()
        best_eq = eqd.idxmax() if len(eqd) else None
        # other classes (JST years only, so through 2020)
        cands = {}
        for name, wide in [("bonds", bond), ("bills", bill), ("housing", hous)]:
            sub = wide[wide.index.isin(yrs)]
            for c in sub.columns:
                s = sub[c].dropna()
                if len(s) >= MIN_YEARS or (dec == "2020s" and len(s) >= 1):
                    cands[f"{c} {name}"] = D.cagr(float((1 + s).prod()), len(s))
        g = gold[gold.index.isin(yrs)]
        gold_c = D.cagr(float((1 + g).prod()), len(g)) if len(g) >= 1 else np.nan
        if dec == "2020s":
            try:
                gl = annual_from_daily(D.yf_close("GLD"))
                gl = gl[gl.index.isin(yrs)]
                gold_c = D.cagr(float((1 + gl).prod()), len(gl))
            except Exception:
                pass
        cands["gold"] = gold_c
        oil_c = np.nan
        if d0 >= 1980:
            oil = D.fred("MCOILWTICO")
            oil_y = oil[oil.index.month == 12]
            oil_y.index = oil_y.index.year
            if d0 == 2020:
                last = oil.iloc[-1]
                oil_y = pd.concat([oil_y[oil_y.index < 2026], pd.Series({2026: last})])
            ro = (oil_y / oil_y.shift(1) - 1).dropna()
            ro = ro[ro.index.isin(yrs)]
            if len(ro) >= 1:
                oil_c = D.cagr(float((1 + ro).prod()), len(ro))
                cands["oil (WTI spot)"] = oil_c
        btc_c = np.nan
        if d0 >= 2010:
            b = D.btc_daily()
            rb = annual_from_daily(b)
            rb = rb[rb.index.isin(yrs)]
            if len(rb):
                btc_c = D.cagr(float((1 + rb).prod()), len(rb))
                cands["bitcoin"] = btc_c
        cs = pd.Series(cands).dropna()
        best_noneq = cs.idxmax() if len(cs) else None
        inv = cs[[i for i in cs.index if "housing" not in i]]  # housing is not investable for a foreigner
        best_inv = inv.idxmax() if len(inv) else None
        allc = pd.concat([eqd.rename(lambda x: f"{x} equities"), cs])
        best_all = allc.idxmax()
        allinv = pd.concat([eqd.rename(lambda x: f"{x} equities"), inv])
        best_allinv = allinv.idxmax()
        rows.append({
            "decade": dec, "us_equity_cagr": us_c,
            "best_equity_market": best_eq, "best_equity_cagr": eqd.max() if len(eqd) else np.nan,
            "n_equity_markets": int(len(eqd)) + 1,
            "median_equity_cagr": float(dmat.loc[dec].dropna().median()),
            "us_rank_of_n": int((dmat.loc[dec].dropna() > us_c).sum() + 1),
            "best_non_equity": best_noneq, "best_non_equity_cagr": cs.max() if len(cs) else np.nan,
            "best_investable_non_equity": best_inv, "best_investable_non_equity_cagr": inv.max() if len(inv) else np.nan,
            "best_asset_any": best_all, "best_asset_cagr": allc.max(),
            "best_investable_asset": best_allinv, "best_investable_asset_cagr": allinv.max(),
            "gold_cagr": gold_c, "oil_cagr": oil_c, "btc_cagr": btc_c,
            "regret_pts_best_equity": (eqd.max() - us_c) if len(eqd) else np.nan,
            "regret_pts_best_asset": allc.max() - us_c,
            "regret_pts_best_investable": allinv.max() - us_c,
        })
    tab = pd.DataFrame(rows).set_index("decade")
    # terminal-wealth ratio of the best equity market vs US over the decade (10 years, or fewer)
    tab["wealth_ratio_best_eq_vs_us"] = ((1 + tab["best_equity_cagr"]) / (1 + tab["us_equity_cagr"])) ** 10
    tab.to_csv(os.path.join(OUT, "q1_decade_table.csv"))
    print("\nDecade table (USD):")
    with pd.option_context("display.width", 250, "display.max_columns", 30):
        print(tab.round(3).to_string())

    # ---- ETF era: broader universe 2000s–2020s (USD total return, from inception)
    rows = []
    univ = dict(ETF_MAP)
    univ.update(EXTRA_ETFS)
    for name, t in univ.items():
        try:
            a = annual_from_daily(D.yf_close(t))
        except Exception:
            continue
        for dec, g in a.groupby((a.index // 10) * 10):
            if dec < 2000:
                continue
            n = len(g)
            if n >= 7 or dec == 2020:
                rows.append({"asset": f"{name} ({t})", "decade": f"{dec}s", "n_years": n,
                             "cagr": D.cagr(float((1 + g).prod()), n)})
    b = D.btc_daily()
    rb = annual_from_daily(b)
    for dec, g in rb.groupby((rb.index // 10) * 10):
        rows.append({"asset": "Bitcoin (Coin Metrics)", "decade": f"{dec}s", "n_years": len(g),
                     "cagr": D.cagr(float((1 + g).prod()), len(g))})
    e = pd.DataFrame(rows)
    piv = e.pivot(index="asset", columns="decade", values="cagr")
    piv.to_csv(os.path.join(OUT, "q1_etf_era.csv"))
    print("\nETF-era decade CAGRs (USD):")
    print(piv.round(3).sort_values("2010s", ascending=False).to_string())

    # ---- long-run summary: 1870–2020 CAGR of US vs best country ex post and EW world
    ew = eq.mean(axis=1)
    summ = {}
    for c in eq.columns:
        s = eq[c].dropna()
        summ[c] = {"start": int(s.index[0]), "years": len(s), "cagr_usd": D.cagr(float((1 + s).prod()), len(s)),
                   "worst_year": float(s.min()), "max_dd": D.max_drawdown((1 + s).cumprod())}
    summ["EW world (avail.)"] = {"start": int(ew.index[0]), "years": len(ew), "cagr_usd": D.cagr(float((1 + ew).prod()), len(ew)),
                                "worst_year": float(ew.min()), "max_dd": D.max_drawdown((1 + ew).cumprod())}
    sm = pd.DataFrame(summ).T.sort_values("cagr_usd", ascending=False)
    sm.to_csv(os.path.join(OUT, "q1_country_longrun.csv"))
    print("\nLong-run USD equity CAGR by country (JST years):")
    print(sm.round(3).to_string())


if __name__ == "__main__":
    run()
