"""Track 29, part A: the survivorship-free long-run record of large-cap momentum (Ken French / CRSP, 1927-2026).

Series (monthly, all CRSP common stocks, formed at the end of month t-1 on returns t-12..t-2, held in month t):
  * TopDec VW / EW   : top decile of prior 12-2 month return, value- / equal-weighted (10_Portfolios_Prior_12_2)
  * BigWin VW / EW   : biggest size quintile x top momentum quintile, NYSE breakpoints (25_Portfolios_ME_Prior_12_2)
                       -- about 24-72 stocks, the closest bias-free analogue of "top-quintile S&P 500 momentum"
  * Market           : Mkt-RF + RF (CRSP value-weighted; SPY's long-run stand-in, no fee)
Costs: each month's one-way turnover (measured on our S&P 500 stock panel, results/turnover_measured.json) times
2 (sell + buy) times an era cost per side (Jones 2002-style schedule, below).  Everything is before tax.

Outputs: results/kf_*.csv and results/kf_summary.txt
"""
from __future__ import annotations

import json
import sys

sys.dont_write_bytecode = True

import numpy as np
import pandas as pd

import data29 as D

RNG = np.random.default_rng(29)
PERIODS = {"1927-2026": ("1927-01", "2026-08"), "1990-2026": ("1990-01", "2026-08"), "2010-2026": ("2010-01", "2026-08")}
MARGIN_SPREAD = 0.015          # retail margin ~ T-bill + 1.5 points a year (Robinhood Gold is about 5%, Sep 2026)


def cost_per_side(p: pd.Period) -> float:
    """One-way large-cap trading cost (half-spread + commission + impact for a small account), by era."""
    y = p.year
    if y < 1975:
        return 0.0100      # fixed commissions era (Jones 2002: ~1% one way for Dow stocks)
    if y < 1990:
        return 0.0050
    if y < 2001:
        return 0.0025      # pre-decimal spreads
    if y < 2010:
        return 0.0015
    return 0.0010          # retail, commission-free, opening auction slippage on S&P 500 names


def load() -> pd.DataFrame:
    s10 = D.KF.read_sections("10_Portfolios_Prior_12_2")
    s25 = D.KF.read_sections("25_Portfolios_ME_Prior_12_2")
    ff = D.kf_factors()
    df = pd.DataFrame({
        "Market": ff["Mkt-RF"] + ff["RF"],
        "RF": ff["RF"],
        "TopDec VW": s10["Value Weight Returns -- Monthly [monthly]"]["Hi PRIOR"] / 100,
        "TopDec EW": s10["Average Equal Weighted Returns -- Monthly [monthly]"]["Hi PRIOR"] / 100,
        "BigWin VW": s25["Average Value Weighted Returns -- Monthly [monthly]"]["BIG HiPRIOR"] / 100,
        "BigWin EW": s25["Average Equal Weighted Returns -- Monthly [monthly]"]["BIG HiPRIOR"] / 100,
        "Big4 VW": s25["Average Value Weighted Returns -- Monthly [monthly]"]["ME5 PRIOR4"] / 100,
    }).dropna()
    df["BigWin n"] = s25["Number of Firms in Portfolios [monthly]"]["BIG HiPRIOR"].reindex(df.index)
    umd = D.KF.monthly_returns("F-F_Momentum_Factor")
    df["UMD"] = umd.iloc[:, 0].reindex(df.index)
    return df


def turnover() -> dict:
    fn = D.RESULTS / "turnover_measured.json"
    if fn.exists():
        return json.loads(fn.read_text())
    return {"top_decile": 0.40, "top_quintile": 0.30, "source": "fallback guess (stock panel not run)"}


TODAY_COST = 0.0010   # per side, what the owner pays now (see cost_per_side)


def net_of_costs(r: pd.Series, to: float, era: bool = False) -> pd.Series:
    """Monthly return minus 2 x one-way turnover x cost per side: era costs (what investors then paid) or, by
    default, TODAY's retail cost on every month (what the premium is worth to the owner now)."""
    c = pd.Series([cost_per_side(p) if era else TODAY_COST for p in r.index], index=r.index)
    return r - 2 * to * c


def cagr(r: pd.Series, ppy: int = 12) -> float:
    r = r.dropna()
    return float((1 + r).prod() ** (ppy / len(r)) - 1) if len(r) else np.nan


def mdd(r: pd.Series) -> float:
    w = (1 + r.fillna(0)).cumprod()
    return float((w / w.cummax() - 1).min())


def beta(r, m) -> float:
    return float(np.cov(r, m)[0, 1] / np.var(m, ddof=1))


def q1_table(df: pd.DataFrame, to: dict) -> pd.DataFrame:
    rows = []
    for per, (a, b) in PERIODS.items():
        x = df.loc[a:b]
        m = x["Market"]
        for s in ["TopDec VW", "TopDec EW", "BigWin VW", "BigWin EW"]:
            t = to["top_decile"] if s.startswith("TopDec") else to["top_quintile"]
            gross = x[s]
            net = net_of_costs(gross, t)
            net_era = net_of_costs(gross, t, era=True)
            ex = gross - m
            rows.append(dict(
                period=per, series=s, months=len(x),
                cagr_gross=cagr(gross), cagr_net_today=cagr(net), cagr_net_era=cagr(net_era), cagr_mkt=cagr(m),
                excess_cagr_gross=cagr(gross) - cagr(m), excess_cagr_net_today=cagr(net) - cagr(m),
                excess_cagr_net_era=cagr(net_era) - cagr(m),
                mean_excess_ann=ex.mean() * 12, t_excess=ex.mean() / ex.std(ddof=1) * np.sqrt(len(ex)),
                vol=gross.std(ddof=1) * np.sqrt(12), vol_mkt=m.std(ddof=1) * np.sqrt(12),
                beta=beta(gross, m), maxdd=mdd(gross), maxdd_mkt=mdd(m),
                cost_drag_today=(gross - net).mean() * 12, cost_drag_era=(gross - net_era).mean() * 12,
            ))
    return pd.DataFrame(rows)


def crash_table(df: pd.DataFrame) -> pd.DataFrame:
    wins = {
        "1932 rebound (Jun-Aug 1932)": ("1932-06", "1932-08"),
        "1929-32 bear (Sep 1929-Jun 1932)": ("1929-09", "1932-06"),
        "1933 junk rally (Apr-May 1933)": ("1933-04", "1933-05"),
        "2000-02 bear (Sep 2000-Sep 2002)": ("2000-09", "2002-09"),
        "2008 crash (Sep 2008-Feb 2009)": ("2008-09", "2009-02"),
        "2009 rebound (Mar-May 2009)": ("2009-03", "2009-05"),
        "2009 full year": ("2009-01", "2009-12"),
        "2020 COVID crash (Feb-Mar 2020)": ("2020-02", "2020-03"),
        "2020 vaccine rotation (Nov 2020)": ("2020-11", "2020-11"),
        "Nov 2020-Mar 2021": ("2020-11", "2021-03"),
        "2022 bear (Jan-Sep 2022)": ("2022-01", "2022-09"),
    }
    rows = []
    for k, (a, b) in wins.items():
        x = df.loc[a:b]
        comp = lambda s: float((1 + x[s]).prod() - 1)  # noqa: E731
        rows.append(dict(window=k, market=comp("Market"), topdec_vw=comp("TopDec VW"), bigwin_vw=comp("BigWin VW"),
                         bigwin_ew=comp("BigWin EW"), umd_long_short=comp("UMD"),
                         topdec_minus_mkt=comp("TopDec VW") - comp("Market"),
                         bigwin_minus_mkt=comp("BigWin VW") - comp("Market")))
    # worst rolling relative windows, full sample
    for h in (1, 3, 12):
        rel = (np.log1p(df["TopDec VW"]) - np.log1p(df["Market"])).rolling(h).sum()
        i = rel.idxmin()
        rows.append(dict(window=f"worst {h}-month TopDec VW minus market (ending {i})", topdec_minus_mkt=float(np.expm1(rel.min()))))
    return pd.DataFrame(rows)


def rolling_table(df: pd.DataFrame, series: dict[str, pd.Series]) -> pd.DataFrame:
    rows = []
    for name, r in series.items():
        for per, (a, _) in (("1927-2026", PERIODS["1927-2026"]), ("1990-2026", PERIODS["1990-2026"])):
            for yrs in (5, 10):
                n = 12 * yrs
                x = r.loc[a:]
                m = df["Market"].loc[a:]
                lx = np.log1p(x).rolling(n).sum()
                lm = np.log1p(m).rolling(n).sum()
                ex = (np.exp(lx / yrs) - np.exp(lm / yrs)).dropna()
                rows.append(dict(series=name, start_from=per, horizon_y=yrs, windows=len(ex),
                                 p10=ex.quantile(0.1), median=ex.median(), p90=ex.quantile(0.9),
                                 share_ge_5pts=(ex >= 0.05).mean(), share_below_0=(ex < 0).mean()))
    return pd.DataFrame(rows)


def trend_signal(df: pd.DataFrame, months: int = 10) -> pd.Series:
    """True = hold equities NEXT month: market total-return index above its trailing 10-month mean at month end."""
    idx = (1 + df["Market"]).cumprod()
    return (idx > idx.rolling(months).mean()).shift(1).fillna(True).astype(bool)


def bear_state(df: pd.DataFrame) -> pd.Series:
    """Daniel-Moskowitz bear state: trailing 24-month market return < 0 -> hold T-bills next month."""
    idx = (1 + df["Market"]).cumprod()
    return ~((idx / idx.shift(24) - 1) < 0).shift(1).fillna(False).astype(bool)


def lever(r: pd.Series, rf: pd.Series, L: float) -> pd.Series:
    return L * r - (L - 1) * (rf + MARGIN_SPREAD / 12)


def stationary_bootstrap_idx(n: int, length: int, mean_block: int, paths: int) -> np.ndarray:
    """(paths x length) indices of a Politis-Romano stationary bootstrap (vectorised over paths)."""
    idx = np.empty((paths, length), dtype=int)
    idx[:, 0] = RNG.integers(n, size=paths)
    jump = RNG.random((paths, length)) < 1 / mean_block
    fresh = RNG.integers(n, size=(paths, length))
    for k in range(1, length):
        idx[:, k] = np.where(jump[:, k], fresh[:, k], (idx[:, k - 1] + 1) % n)
    return idx


def path_stats(rs: np.ndarray, rm: np.ndarray, yrs: int) -> tuple[np.ndarray, np.ndarray]:
    cs = np.prod(1 + rs, axis=1) ** (1 / yrs) - 1
    cm = np.prod(1 + rm, axis=1) ** (1 / yrs) - 1
    w = np.cumprod(1 + rs, axis=1)
    dd = (w / np.maximum.accumulate(w, axis=1) - 1).min(axis=1)
    return cs - cm, dd


def concentration_bootstrap(df: pd.DataFrame, to: dict, idio_m: float, variants: dict, n_paths: int = 5000) -> pd.DataFrame:
    """Distribution of 5- and 10-year outcomes for an N-stock book whose average return is the bias-free KF
    series (net of costs) and whose stock-specific noise has monthly s.d. idio_m / sqrt(N), fat-tailed (t, 4 df,
    scaled to unit variance).  Stationary block bootstrap (mean block 12 months) keeps crashes and regimes together;
    the same resampled months and noise draws are used for every variant (common random numbers)."""
    rows = []
    for per in ("1927-2026", "1990-2026"):
        a, b = PERIODS[per]
        x = df.loc[a:b]
        m = x["Market"].values
        bases = {k: fn(x).values for k, fn in variants.items()}
        for yrs in (5, 10):
            T = 12 * yrs
            ii = stationary_bootstrap_idx(len(x), T, 12, n_paths)
            z = RNG.standard_t(4, (n_paths, T)) / np.sqrt(2.0)
            rm = m[ii]
            for vname, base in bases.items():
                for N in (4, 8, 12, 50):
                    eps = z * idio_m / np.sqrt(N) if N < 50 else 0.0
                    rs = np.maximum(base[ii] + eps, -0.95)
                    ex, dd = path_stats(rs, rm, yrs)
                    rows.append(dict(sample=per, variant=vname, N=N if N < 50 else "diversified (~50)", years=yrs,
                                     p10=np.quantile(ex, 0.1), median=np.median(ex), p90=np.quantile(ex, 0.9),
                                     p_beat_spy=(ex > 0).mean(), p_beat_by_5=(ex >= 0.05).mean(),
                                     median_maxdd=np.median(dd), p_dd_50=(dd <= -0.5).mean(),
                                     p_dd_80=(dd <= -0.8).mean()))
    return pd.DataFrame(rows)


def trend_leverage_table(df: pd.DataFrame, to: dict) -> pd.DataFrame:
    rows = []
    sig, bear = trend_signal(df), bear_state(df)
    net = net_of_costs(df["BigWin VW"], to["top_quintile"])
    switch_cost = TODAY_COST * sig.astype(int).diff().abs().fillna(0)
    series = {
        "Market (buy and hold)": df["Market"],
        "Market, 10-month trend filter": df["Market"].where(sig, df["RF"]) - switch_cost,
        "BigWin VW net": net,
        "BigWin VW net, 10-month trend filter": net.where(sig, df["RF"]) - switch_cost,
        "BigWin VW net, bear-state filter": net.where(bear, df["RF"]),
    }
    for L in (1.5, 2.0, 3.0):
        series[f"BigWin VW net x{L:g} margin"] = lever(net, df["RF"], L)
        series[f"BigWin VW net x{L:g} margin + trend filter"] = lever(net, df["RF"], L).where(sig, df["RF"]) - switch_cost
    for per, (a, b) in PERIODS.items():
        m = df["Market"].loc[a:b]
        for k, r in series.items():
            r = r.loc[a:b]
            w = (1 + r).cumprod()
            rows.append(dict(period=per, series=k, cagr=cagr(r), excess_vs_mkt=cagr(r) - cagr(m),
                             vol=r.std(ddof=1) * np.sqrt(12), maxdd=mdd(r), worst_month=r.min(),
                             months_loss_gt_33pct=int((r <= -1 / 3).sum()), end_wealth=float(w.iloc[-1]),
                             ruined=bool((w < 0.05).any())))
    return pd.DataFrame(rows), series


def main() -> dict:
    df = load()
    to = turnover()
    idio = to.get("idio_monthly_sd", 0.085)
    out = {}
    q1 = q1_table(df, to)
    q1.to_csv(D.RESULTS / "kf_q1_table.csv", index=False, float_format="%.4f")
    cr = crash_table(df)
    cr.to_csv(D.RESULTS / "kf_crashes.csv", index=False, float_format="%.4f")
    tl, series = trend_leverage_table(df, to)
    tl.to_csv(D.RESULTS / "kf_trend_leverage.csv", index=False, float_format="%.4f")
    roll = rolling_table(df, {k: series[k] for k in ["BigWin VW net", "BigWin VW net, 10-month trend filter",
                                                     "BigWin VW net x2 margin", "BigWin VW net x2 margin + trend filter"]}
                         | {"TopDec VW gross": df["TopDec VW"], "BigWin EW gross": df["BigWin EW"]})
    roll.to_csv(D.RESULTS / "kf_rolling.csv", index=False, float_format="%.4f")
    sig = trend_signal(df)
    rfm = df["RF"]

    def v_plain(x):
        return net_of_costs(x["BigWin VW"], to["top_quintile"])

    def v_trend(x):
        return net_of_costs(x["BigWin VW"], to["top_quintile"]).where(sig.loc[x.index], rfm.loc[x.index])

    def v_x2(x):
        return lever(net_of_costs(x["BigWin VW"], to["top_quintile"]), rfm.loc[x.index], 2.0)

    def v_x2_trend(x):
        return v_x2(x).where(sig.loc[x.index], rfm.loc[x.index])

    bs = concentration_bootstrap(df, to, idio, {"BigWin VW net": v_plain, "+ trend filter": v_trend,
                                               "x2 margin": v_x2, "x2 margin + trend filter": v_x2_trend})
    bs.to_csv(D.RESULTS / "kf_bootstrap.csv", index=False, float_format="%.4f")
    out.update(q1=q1, crashes=cr, trend_leverage=tl, rolling=roll, bootstrap=bs, turnover=to,
               kf_last=str(df.index[-1]), bigwin_n=df["BigWin n"].describe())
    with open(D.RESULTS / "kf_summary.txt", "w") as fh:
        fh.write(f"Ken French data through {df.index[-1]}; turnover/idio inputs: {json.dumps(to)}\n")
        fh.write(f"BIG HiPRIOR firm count: median {df['BigWin n'].median():.0f}, range {df['BigWin n'].min():.0f}-{df['BigWin n'].max():.0f}\n\n")
        for name, t in (("Q1", q1), ("CRASHES", cr), ("TREND/LEVERAGE", tl), ("ROLLING", roll), ("BOOTSTRAP", bs)):
            fh.write(f"== {name}\n{t.to_string(index=False, float_format=lambda v: f'{v:.3f}')}\n\n")
    return out


if __name__ == "__main__":
    main()
    print((D.RESULTS / "kf_summary.txt").read_text())
