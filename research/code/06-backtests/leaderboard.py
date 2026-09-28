"""Leaderboard: per-trade statistics for every candidate rule on a common footing.

Ranking metric = 'adjusted geometric return per trade' = exp(mean(log(1+r)) - 1*SE) - 1, i.e. the
geometric-mean trade return penalised by one standard error of the mean log return.  Taking logs
punishes large losses (a -90% trade costs as much as a +900% trade gains), and the SE term punishes
small samples and dispersion.  It is NOT a forecast.  'Annualised' divides the mean log by the mean
holding period.
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

import common as C
import data
import trend as T

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
SCR = os.path.join(data.CACHE_DIR, "..")


def stats(r: pd.Series, years: pd.Series | float) -> dict:
    r = pd.Series(r).dropna().astype(float)
    lg = np.log1p(r.clip(lower=-0.9999))
    n = len(r)
    se = lg.std(ddof=1) / np.sqrt(n) if n > 1 else np.nan
    yrs = float(np.mean(years)) if not np.isscalar(years) else float(years)
    return {"trades": n, "win_rate": (r > 0).mean(), "mean": r.mean(), "median": r.median(), "worst": r.min(),
            "best": r.max(), "p_loss_gt50": (r <= -0.5).mean(), "geo_per_trade": np.expm1(lg.mean()),
            "adj_geo_per_trade": np.expm1(lg.mean() - (se if pd.notna(se) else 0)),
            "avg_years_held": yrs, "geo_annualised": np.expm1(lg.mean() / yrs) if yrs > 0 else np.nan}


def spells_from_daily(pos: pd.Series, eq: pd.Series):
    """Per-trade returns of a timing strategy: from the equity value before the first in-market day to
    the last in-market day of each spell."""
    p = pos.astype(bool)
    starts = p & ~p.shift(1, fill_value=False)
    ends = p & ~p.shift(-1, fill_value=False)
    s_idx = list(p.index[starts])
    e_idx = list(p.index[ends])
    rows = []
    for s, e in zip(s_idx, e_idx):
        i0 = eq.index.get_loc(s)
        base = eq.iloc[i0 - 1] if i0 > 0 else eq.iloc[0]
        rows.append({"entry": s, "exit": e, "ret": eq.loc[e] / base - 1, "years": C.years_between(s, e)})
    return pd.DataFrame(rows)


def build():
    rows = []
    t = pd.read_csv(os.path.join(OUT, "us_crash_trades.csv"), parse_dates=["entry"])

    def add(name, df, col, evidence, note=""):
        d = df[~df["open"]] if "open" in df.columns and not name.endswith("(ATH exit)") else df
        s = stats(d[col], d["years"] if "years" in d.columns else 1.0)
        s.update({"rule": name, "oos_evidence": evidence, "note": note})
        rows.append(s)

    ath = t[(t["mode"] == "ath")]
    b = ath[ath["variant"] == "base"]
    for thr in (0.2, 0.3, 0.4):
        for rule in ("3y", "5y"):
            x = b[(b["thr"] == thr) & (b["exit_rule"] == rule)]
            add(f"S&P -{int(thr*100)}% from ATH, hold {rule}, 1x", x, "ret_1x", "mixed")
            add(f"S&P -{int(thr*100)}% from ATH, hold {rule}, 3x", x, "ret_3x_ruin", "poor")
        x = b[(b["thr"] == thr) & (b["exit_rule"] == "ATH")]
        add(f"S&P -{int(thr*100)}% from ATH, hold to new ATH (ATH exit)", x, "ret_1x", "mixed",
            "win rate is mechanical; see years held")
    x = b[(b["exit_rule"] == "CALL2Y") & (b["thr"] == 0.2)]
    x = x.assign(years=2.0)
    add("S&P -20%: buy 2y ATM call (synthetic, return on premium)", x, "call2y_central_ret", "n/a",
        "Black-Scholes approximation; -100% on 5/12")
    add("S&P -20%: 20% of capital in 2y ATM calls + 80% T-bills", x, "callport20_ret", "n/a", "approximation")
    x = b[(b["exit_rule"] == "CALL2Y") & (b["thr"] == 0.3)].assign(years=2.0)
    add("S&P -30%: buy 2y ATM call (synthetic)", x, "call2y_central_ret", "n/a", "approximation")
    v = ath[(ath["variant"] == "vix40") & (ath["thr"] == 0.2) & (ath["exit_rule"] == "3y")]
    add("S&P -20% AND VIX>=40, hold 3y, 1x", v, "ret_1x", "weak")
    add("S&P -20% AND VIX>=40, hold 3y, 3x", v, "ret_3x_ruin", "weak")
    v = ath[(ath["variant"] == "p10ma<1.3") & (ath["thr"] == 0.2) & (ath["exit_rule"] == "3y")]
    add("S&P -20% AND price<1.3x 10y avg, hold 3y, 1x", v, "ret_1x", "modest")
    add("S&P -20% AND price<1.3x 10y avg, hold 3y, 3x", v, "ret_3x_ruin", "modest")
    # OOS pooled (international + US 1986+), 3y hold
    allt = pd.read_csv(os.path.join(SCR, "intl_all_trades.csv"))
    o = allt[(allt["sample"] == "OOS: intl") & (allt["mode"] == "ath")]
    for var, lab in [("base", "any index -20% from ATH"), ("p10ma<1.3", "any index -20% AND price<1.3x 10y avg")]:
        x = o[(o["variant"] == var) & (o["thr"] == 0.2) & (o["exit_rule"] == "3y")]
        add(f"{lab}, hold 3y, 1x (36 non-US indices, OOS)", x, "ret_1x", "this IS the OOS test",
            "clustered: ~6 global crises")
        add(f"{lab}, hold 3y, 3x (36 non-US indices, OOS)", x, "ret_3x_ruin", "this IS the OOS test",
            "clustered: ~6 global crises")
    # VIX spikes
    vs = pd.read_csv(os.path.join(OUT, "vix45_spike_trades.csv"), parse_dates=["signal"])
    ve = vs[vs["signal"] >= "1986-01-01"]
    add("VIX>=45 spike (1986-2026), hold 1y, 1x", ve.assign(years=1.0, open=ve["open_1y"]), "ret_1y_1x", "decent")
    add("VIX>=45 spike (1986-2026), hold 1y, 3x", ve.assign(years=1.0, open=ve["open_1y"]), "ret_1y_3x", "decent")
    vp = vs[vs["signal"] < "1986-01-01"]
    add("Vol spike (realised-vol proxy, 1929-1946), hold 1y, 1x", vp.assign(years=1.0, open=False), "ret_1y_1x", "fails",
        "pre-VIX proxy")
    # 3 down years
    td = pd.read_csv(os.path.join(OUT, "three_down_years.csv"))
    add("3 consecutive down calendar years -> hold 3y (US+14 intl)", td.assign(years=3.0, open=td["next_3y"].isna()),
        "next_3y", "consistent but clustered", "~7 independent episodes")
    # BTC
    bt = pd.read_csv(os.path.join(OUT, "btc_dd_wma_trades.csv"))
    for rl, lab in [("DD>=80%", "BTC -80% from ATH"), ("DD>=75%", "BTC -75% from ATH"),
                    ("close<=200WMA", "BTC touches 200-week MA")]:
        for ex in ("ATH", "3y"):
            x = bt[(bt["rule"] == rl) & (bt["exit_rule"] == ex)]
            add(f"{lab}, exit {ex}" + (" (ATH exit)" if ex == "ATH" else ""), x, "ret", "tiny sample",
                "3-4 cycles; survivorship")
    hv = pd.read_csv(os.path.join(OUT, "btc_halving_trades.csv"))
    for rl in hv["rule"].unique():
        x = hv[hv["rule"] == rl]
        add(f"BTC halving {rl}", x, "ret", "tiny sample", "4 cycles, all in a secular bull; widely known")
    # trend-following spells
    r, p, dec, curves, tl = T.run_sma10()
    tl = tl.copy()
    tl["years"] = tl["months"] / 12
    tl["open"] = tl["first_month_out"].astype(str) == "open"
    add("S&P 10-month SMA (Faber), per in-market spell, 1x", tl, "ret_1x", "weaker post-2007",
        "~0.75 round trips/yr; value is drawdown control")
    spx = data.sp500_daily_tr()
    rf = data.daily_rf()
    sig = spx["px"] > spx["px"].rolling(200).mean()
    for L in (1, 3):
        eq, pos, n = T.daily_timing(spx["px"], spx["tr"], rf, L, sig)
        sp = spells_from_daily(pos, eq)
        sp["open"] = False
        add(f"S&P 200-day MA, per spell, {L}x", sp, "ret", "weaker post-2016", "~3 round trips/yr (whipsaws)")
    return pd.DataFrame(rows)


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.max_rows", 200)
    lb = build().sort_values("adj_geo_per_trade", ascending=False)
    cols = ["rule", "trades", "win_rate", "median", "worst", "p_loss_gt50", "geo_per_trade", "adj_geo_per_trade",
            "avg_years_held", "geo_annualised", "oos_evidence", "note"]
    print(lb[cols].round(3).to_string())
    lb[cols].to_csv(os.path.join(OUT, "leaderboard.csv"), index=False)
