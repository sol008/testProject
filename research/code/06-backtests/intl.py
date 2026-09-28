"""Part 2: how crash-buying fails (Nikkei 1990-2024, Nasdaq 2000-2015, S&P 1929-1954, Greece, Italy...)
and an honest in-sample / out-of-sample test of failure filters.

In-sample (IS): S&P 500 signals with entry 1928-1985.  Out-of-sample (OOS): S&P 500 1986-2026 and
~30 other equity indices / country ETFs (full available history).  Filters are frozen from the IS
ranking before looking at OOS results (the script prints IS first, then OOS for the same list).
Caveat: OOS markets crash together (2000-02, 2008-09, 2020), so the OOS trades are far from
independent -- effective sample size is much smaller than the trade count.
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import common as C
import crash_buy as CB
import data

OUT = CB.OUT
SCRATCH = os.path.join(data.CACHE_DIR, "..")

# (label, source, ticker, kind) ; kind: 'px' local price index, 'tr' total-return index, 'etf' USD adj close
MARKETS = [
    ("Nikkei 225", "fred", "NIKKEI225", "px"),
    ("Nasdaq Composite", "yf", "^IXIC", "px"),
    ("Nasdaq 100", "yf", "^NDX", "px"),
    ("Russell 2000", "yf", "^RUT", "px"),
    ("TSX (Canada)", "yf", "^GSPTSE", "px"),
    ("FTSE 100", "yf", "^FTSE", "px"),
    ("DAX (TR index)", "yf", "^GDAXI", "tr"),
    ("CAC 40", "yf", "^FCHI", "px"),
    ("SMI (Swiss)", "yf", "^SSMI", "px"),
    ("AEX (NL)", "yf", "^AEX", "px"),
    ("IBEX 35", "yf", "^IBEX", "px"),
    ("FTSE MIB (Italy)", "yf", "FTSEMIB.MI", "px"),
    ("ATX (Austria)", "yf", "^ATX", "px"),
    ("BEL 20", "yf", "^BFX", "px"),
    ("ISEQ (Ireland)", "yf", "^ISEQ", "px"),
    ("Athens General", "yf", "GD.AT", "px"),
    ("Hang Seng", "yf", "^HSI", "px"),
    ("Straits Times", "yf", "^STI", "px"),
    ("ASX 200", "yf", "^AXJO", "px"),
    ("KOSPI", "yf", "^KS11", "px"),
    ("TAIEX", "yf", "^TWII", "px"),
    ("Shanghai Comp", "yf", "000001.SS", "px"),
    ("Jakarta Comp", "yf", "^JKSE", "px"),
    ("KLCI (Malaysia)", "yf", "^KLSE", "px"),
    ("Sensex", "yf", "^BSESN", "px"),
    ("TA-125 (Israel)", "yf", "^TA125.TA", "px"),
    ("IPC (Mexico)", "yf", "^MXX", "px"),
    ("MSCI Brazil ETF (USD)", "yf", "EWZ", "etf"),
    ("MSCI Japan ETF (USD)", "yf", "EWJ", "etf"),
    ("MSCI EAFE ETF (USD)", "yf", "EFA", "etf"),
    ("MSCI EM ETF (USD)", "yf", "EEM", "etf"),
    ("China large-cap ETF (USD)", "yf", "FXI", "etf"),
    ("MSCI Turkey ETF (USD)", "yf", "TUR", "etf"),
    ("MSCI Greece ETF (USD)", "yf", "GREK", "etf"),
    ("MSCI Italy ETF (USD)", "yf", "EWI", "etf"),
    ("MSCI Spain ETF (USD)", "yf", "EWP", "etf"),
]

FAILURE_FOCUS = ["Nikkei 225", "Nasdaq Composite", "Nasdaq 100", "Athens General", "FTSE MIB (Italy)",
                 "ISEQ (Ireland)", "Hang Seng", "Shanghai Comp", "MSCI Greece ETF (USD)", "MSCI Brazil ETF (USD)"]


def japan_rf() -> pd.Series:
    """Daily yen short rate (decimal/day): discount rate 1953-1985, call rate 1985+."""
    dr = data.fred("INTDSRJPM193N")
    cr = data.fred("IRSTCI01JPM156N")
    s = pd.concat([dr[dr.index < cr.index[0]], cr]).sort_index() / 100.0
    s.index = s.index + pd.offsets.MonthEnd(0)
    d = s.resample("D").ffill() / 252.0
    return d


def load_market(label, src, tk, kind) -> CB.Market:
    if src == "fred":
        px = data.fred(tk)
    else:
        px = data.yf_close(tk, adj=(kind == "etf"))
    px = px[px > 0].dropna()
    # drop obviously bad prints (single-day moves > 40% that fully reverse next day)
    r = px.pct_change()
    bad = (r.abs() > 0.4) & (r.shift(-1).abs() > 0.3) & (np.sign(r) != np.sign(r.shift(-1)))
    px = px[~bad]
    rf = japan_rf() if label == "Nikkei 225" else data.daily_rf()
    m = CB.Market(label, px, None, rf)
    return m


def variants_for(mkt: CB.Market, us=False):
    v = {
        "base": dict(filt=None, armed=False),
        "vix40": dict(filt=mkt.vol >= 40, armed=False),
        "trend50": dict(filt=mkt.px > mkt.sma50, armed=True),
        "trend200": dict(filt=mkt.px > mkt.sma200, armed=True),
        "p10ma<1.3": dict(filt=mkt.p10ma < 1.3, armed=False),
        "p10ma<1.1": dict(filt=mkt.p10ma < 1.1, armed=False),
    }
    if us:
        v.update({
            "cape<20": dict(filt=mkt.cape < 20, armed=False),
            "credit3": dict(filt=mkt.credit >= 3.0, armed=False),
            "easing1pp": dict(filt=CB.easing_filter(mkt, 1.0), armed=False),
        })
    return v


def run_market(mkt: CB.Market, us=False, start=None, end=None, modes=("ath", "bear")) -> pd.DataFrame:
    out = []
    for mode in modes:
        for vname, v in variants_for(mkt, us).items():
            sigs = CB.find_signals(mkt, CB.THRESHOLDS, mode, v["filt"], v["armed"], start=start, end=end)
            if len(sigs) == 0:
                continue
            for stop in ([None, 0.25] if vname == "base" else [None]):
                tr = CB.build_trades(mkt, sigs, rules=("1y", "3y", "5y", "ATH"), with_calls=False, stop=stop)
                tr.insert(0, "variant", vname if stop is None else f"{vname}+stop25")
                tr.insert(0, "mode", mode)
                out.append(tr)
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def pooled(trades: pd.DataFrame, group=("mode", "variant", "rule_L")) -> pd.DataFrame:
    rows = []
    for (mode, var), g in trades.groupby(["mode", "variant"]):
        for rule in ["1y", "3y", "5y", "ATH"]:
            gg = g[g["exit_rule"] == rule]
            for L in [1, 2, 3]:
                col = f"ret_{L}x" if L == 1 else f"ret_{L}x_ruin"
                s = CB.summarize(gg, col, include_open=(rule == "ATH"))
                if s.get("n", 0) == 0:
                    continue
                s.update({"mode": mode, "variant": var, "rule": rule, "L": L,
                          "markets": gg["market"].nunique()})
                rows.append(s)
    return pd.DataFrame(rows)


def run_all():
    us = CB.us_market()
    # ---------------- in-sample: US entries 1928-1985 ; OOS: US 1986+
    us_is = run_market(us, us=True, end="1985-12-31")
    us_oos = run_market(us, us=True, start="1986-01-01")
    us_is.insert(0, "sample", "IS: US 1928-85")
    us_oos.insert(0, "sample", "OOS: US 1986-2026")
    frames = [us_is, us_oos]
    episodes = []
    for label, src, tk, kind in MARKETS:
        try:
            m = load_market(label, src, tk, kind)
        except Exception as e:
            print("skip", label, e)
            continue
        t = run_market(m, us=False)
        if len(t) == 0:
            continue
        t.insert(0, "sample", "OOS: intl")
        frames.append(t)
        ep = CB.episode_table(m.px, 0.20, "ath")
        ep.insert(0, "market", label)
        ep.insert(1, "first_date", m.idx[0].date())
        episodes.append(ep)
    allt = pd.concat(frames, ignore_index=True)
    allt.to_csv(os.path.join(SCRATCH, "intl_all_trades.csv"), index=False)  # large: keep in scratchpad
    eps = pd.concat(episodes, ignore_index=True)
    eps.to_csv(os.path.join(OUT, "intl_ath_episodes.csv"), index=False)
    # base trades for the failure-focus markets (small file for the repo)
    foc = allt[(allt["variant"].isin(["base", "base+stop25"])) & (allt["mode"] == "ath") &
               (allt["market"].isin(FAILURE_FOCUS + ["S&P 500"]))]
    keep = ["sample", "market", "variant", "thr", "peak_date", "entry", "entry_px", "dd_at_entry", "p10ma_at_entry",
            "exit_rule", "exit", "open", "years", "ret_1x", "ret_2x", "ret_3x", "ret_2x_ruin", "ret_3x_ruin", "mdd_1x"]
    foc[keep].to_csv(os.path.join(OUT, "failure_market_trades.csv"), index=False)
    # pooled stats by sample
    res = []
    for samp, g in allt.groupby("sample"):
        p = pooled(g)
        p.insert(0, "sample", samp)
        res.append(p)
    # OOS combined (US 1986+ and intl)
    p = pooled(allt[allt["sample"] != "IS: US 1928-85"])
    p.insert(0, "sample", "OOS: all")
    res.append(p)
    pool = pd.concat(res, ignore_index=True)
    pool.to_csv(os.path.join(OUT, "oos_filter_pooled.csv"), index=False)
    return allt, pool, eps


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    pd.set_option("display.max_rows", 500)
    allt, pool, eps = run_all()
    print(eps.to_string())
    for samp in ["IS: US 1928-85", "OOS: US 1986-2026", "OOS: intl", "OOS: all"]:
        x = pool[(pool["sample"] == samp) & (pool["rule"].isin(["3y", "ATH"])) & (pool["L"].isin([1, 3]))]
        print("\n=====", samp)
        print(x[["mode", "variant", "rule", "L", "n", "n_open", "markets", "win", "mean", "median", "worst",
                 "p_loss30", "p_loss50", "geo_mean", "mean_log", "se_log"]].round(3).to_string())
