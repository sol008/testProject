"""Family (d): post-crash rebounds in non-US equity indices, held 42 / 63 / 84 sessions, with track 06's
valuation filter (price < 1.3 x its own trailing 10-year average price).

Signal (per market, at its close): the first close at or beyond -20% (or -30%) from the market's
all-time high since the last ATH (track 06 'ATH mode'); filter 'none' or 'p10<1.3'.
Panels:
  LOCAL  local-currency price indices (track 06/13 caches; Nikkei from FRED 1949-), next-close entries,
         5 bp per side.  Design = signals before 2008, test = 2008-2026.
  USD    the same local signal executed in the matching iShares USD country ETF at the next open
         (6 bp per side, doubled when VIX > 30) -- the Robinhood-executable version, test 2008-2026.
Baseline: each trade's own market, era-matched (+-3 years).  Crashes cluster across markets, so the
pooled t is also computed with trades clustered by signal month (the honest one).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common22 as K

FAMILY = "d_intl"
HOLDS = (42, 63, 84)

# (label, local ticker or 'fred:ID', matching USD ETF or None)
MARKETS = [
    ("Nikkei 225", "fred:NIKKEI225", "EWJ"), ("TSX (Canada)", "^GSPTSE", "EWC"), ("FTSE 100", "^FTSE", "EWU"),
    ("DAX", "^GDAXI", "EWG"), ("CAC 40", "^FCHI", "EWQ"), ("SMI", "^SSMI", "EWL"), ("AEX", "^AEX", "EWN"),
    ("IBEX 35", "^IBEX", "EWP"), ("FTSE MIB", "FTSEMIB.MI", "EWI"), ("ATX", "^ATX", "EWO"), ("BEL 20", "^BFX", "EWK"),
    ("ISEQ", "^ISEQ", None), ("Athens", "GD.AT", None), ("Hang Seng", "^HSI", "EWH"), ("Straits Times", "^STI", "EWS"),
    ("ASX 200", "^AXJO", "EWA"), ("KOSPI", "^KS11", "EWY"), ("TAIEX", "^TWII", "EWT"), ("Shanghai", "000001.SS", None),
    ("Jakarta", "^JKSE", None), ("KLCI", "^KLSE", "EWM"), ("Sensex", "^BSESN", None), ("TA-125", "^TA125.TA", None),
    ("IPC Mexico", "^MXX", "EWW"), ("Bovespa", "^BVSP", "EWZ"), ("Euro Stoxx 50", "^STOXX50E", None),
    ("OMX Stockholm", "^OMX", "EWD"),
]


def local_frame(tk: str) -> pd.DataFrame:
    if tk.startswith("fred:"):
        s = K.fred(tk.split(":")[1])
        return K.synthetic_frame(s, tk)
    df = K.load(tk)
    r = df["C"].pct_change()
    bad = (r.abs() > 0.4) & (r.shift(-1).abs() > 0.3) & (np.sign(r) != np.sign(r.shift(-1)))
    df = df[~bad.fillna(False)]
    df.attrs["ticker"] = tk
    return df


def signals(px: pd.Series) -> dict[str, pd.Series]:
    dd = K.drawdown(px)
    p10 = px / px.rolling(2520, min_periods=2400).mean()
    out = {}
    for thr in (20, 30):
        s = K.first_since_ath(dd, -thr / 100)
        out[f"DD-{thr}|none"] = s
        out[f"DD-{thr}|p10<1.3"] = s & (p10 < 1.3)
    return out, p10


def cluster_t(tr: pd.DataFrame, col: str = "edge") -> tuple[float, int]:
    if len(tr) < 3:
        return float("nan"), len(tr)
    g = tr.groupby(pd.to_datetime(tr["signal"]).dt.to_period("M"))[col].mean()
    if len(g) < 3:
        return float("nan"), len(g)
    return float(g.mean() / g.std(ddof=1) * np.sqrt(len(g))), len(g)


def main():
    spx = K.load("^GSPC")
    gauge = K.vix_gauge(spx)
    reg = K.Registry(FAMILY)
    alltr = []
    for label, tk, etf in MARKETS:
        try:
            df = local_frame(tk)
        except Exception as e:  # noqa: BLE001
            print("skip", label, e)
            continue
        sigs, p10 = signals(df["C"])
        edf = None
        if etf:
            try:
                edf = K.load(etf)
            except Exception as e:  # noqa: BLE001
                print("no ETF", etf, e)
        for v, s in sigs.items():
            for H in HOLDS:
                vH = f"{v}|H{H}"
                for role, a, b in (("design", None, "2007-12-31"), ("test", "2008-01-01", None)):
                    tr, st = K.evaluate(df, s, H, "close", a, b, cost_bps=5.0, B=500)
                    reg.add(vH, label, role, st, None)
                    if len(tr):
                        tr = tr.assign(market=label, variant=vH, role=role)
                        alltr.append(tr)
                if edf is not None:
                    se = s.reindex(edf.index).fillna(False)
                    # a signal on a local holiday maps to nothing; carry it to the next ETF session
                    miss = s[s & ~s.index.isin(edf.index)].index
                    for d in miss:
                        k = edf.index.searchsorted(d)
                        if k < len(edf.index):
                            se.iloc[k] = True
                    tr, st = K.evaluate(edf, se, H, "open", "2008-01-01", None, cost_bps=6.0, vix=gauge, B=500)
                    reg.add(vH, label + " via " + etf, "test_exec", st, None)
                    if len(tr):
                        tr = tr.assign(market=label + " via " + etf, variant=vH, role="test_exec")
                        alltr.append(tr)
        print("done", label, flush=True)
    reg.save()
    T = pd.concat(alltr, ignore_index=True)
    T.to_csv(K.RESULTS / "trades_d_intl.csv", index=False, float_format="%.6g")
    # pooled statistics per variant x role
    rows = []
    yrs = {"design": None, "test": K.years_between("2008-01-01", K.TODAY), "test_exec": K.years_between("2008-01-01", K.TODAY)}
    for (v, role), g in T.groupby(["variant", "role"]):
        tc, ncl = cluster_t(g)
        H = int(v.split("|H")[1])
        rows.append(dict(family=FAMILY, variant=v, role=role, H=H, n=len(g), markets=g["market"].nunique(),
                         clusters=ncl, win=float((g["net"] > 0).mean()), mean_net=g["net"].mean(),
                         median_net=g["net"].median(), worst=g["net"].min(), mean_ex=g["excess"].mean(),
                         base=g["base"].mean(), edge=g["edge"].mean(),
                         t_naive=g["edge"].mean() / g["edge"].std(ddof=1) * np.sqrt(len(g)),
                         t_cluster=tc, sr_edge=g["edge"].mean() / g["edge"].std(ddof=1),
                         skew_edge=float(g["edge"].skew()), kurt_edge=float(g["edge"].kurt() + 3),
                         mae_worst=g["mae"].min(),
                         distinct_months=g["signal"].astype(str).str[:7].nunique(),
                         per_yr_panel=(len(g) / yrs[role]) if yrs.get(role) else np.nan,
                         episodes_per_yr=(ncl / yrs[role]) if yrs.get(role) else np.nan))
    P = pd.DataFrame(rows)
    P.to_csv(K.RESULTS / "pooled_d_intl.csv", index=False, float_format="%.5g")
    return P


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 200)
    P = main()
    print(P.round(4).to_string())
