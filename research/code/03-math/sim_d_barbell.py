"""(d) Barbell vs concentrated all-in vs leveraged index.

Market paths: stationary block bootstrap (Politis & Romano 1994, mean block 126 trading
days) of Fama-French daily US market total returns and 1-month T-bill returns,
July 1926 - Aug 2026. Two calibrations:
  * "Historical": expected annual log return of the index = 9.8 % (the 1926-2026 value;
     the raw daily sample is shifted by +0.4 %/yr to undo the pre-1952 Saturday sessions).
  * "Muted": the same paths shifted down by 3.3 %/yr (index geometric ~6.7 %/yr), closer to
     current forward-looking forecasts (Vanguard VCMM, Dec 2025: 3.9-5.9 %/yr for US stocks).
All strategies share the same random market paths (common random numbers). No taxes.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd

from common import SEED, fmt_pct, fmt_x, load_ff_daily, save_table

DAYS = 252
HORIZONS = (5, 10, 20)
T = max(HORIZONS) * DAYS
N_PATHS = 10_000
CHUNK = 1_000
MEAN_BLOCK = 126

HIST_LOG_MU = 0.0979          # 1926-2026 annualised log return of the CRSP VW index
SCENARIOS = {"Historical (index ~10.3%/yr geometric)": 0.0,
             "Muted (index ~6.7%/yr geometric)": -0.033}

# cost assumptions (annual)
IDX_ER = 0.0003
LETF_ER = 0.009               # UPRO 0.89 %, SSO 0.87 % (ProShares, 2026)
LETF_SPREAD = 0.005           # swap financing over T-bills on the borrowed notional
MARGIN_SPREAD = 0.015         # retail margin over T-bills

# convex sleeve: bets that pay 11x the premium (+1000 %) or expire worthless
CONVEX_EV_POS = 0.15          # p for the brief's "convex option bet" (EV +65 % per bet)
CONVEX_FAIR = 1 / 11          # zero-EV option (fairly priced)
CONVEX_NEG = 0.7 / 11         # EV -30 % per bet (typical of retail OTM option buying)


def stationary_bootstrap_idx(n_obs, n_paths, t_len, mean_block, rng):
    new = rng.random((n_paths, t_len)) < 1.0 / mean_block
    new[:, 0] = True
    starts = rng.integers(0, n_obs, size=(n_paths, t_len), dtype=np.int64)
    tt = np.arange(t_len)
    last_t = np.maximum.accumulate(np.where(new, tt, 0), axis=1)
    start_at = np.take_along_axis(starts, last_t, axis=1)
    return (start_at + (tt - last_t)) % n_obs


def wealth_from_returns(r):
    """Daily simple returns -> wealth path starting at 1; wealth is absorbed at 0."""
    r = np.maximum(r, -1.0)
    with np.errstate(divide="ignore"):
        lw = np.cumsum(np.log1p(r), axis=1)
    return np.exp(lw)


def barbell(core_r, w, p_win, rng, bets_per_year=4, payoff=11.0):
    """Annually rebalanced barbell: (1-w) in the core, w spent on independent convex bets.

    Each year the sleeve budget w*W is split into `bets_per_year` equal stakes, one bet
    resolving at the end of each quarter (value 11x stake with prob p_win, else 0).
    Stakes are carried at cost until they resolve; winnings sit in cash until year end.
    """
    n, t_len = core_r.shape
    years = t_len // DAYS
    out = np.empty((n, t_len))
    W = np.ones(n)
    res_days = [int(DAYS * (k + 1) / bets_per_year) - 1 for k in range(bets_per_year)]
    for y in range(years):
        sl = slice(y * DAYS, (y + 1) * DAYS)
        core = (1 - w) * W[:, None] * np.cumprod(1 + core_r[:, sl], axis=1)
        stake = w * W / bets_per_year
        wins = rng.random((n, bets_per_year)) < p_win
        inc = np.zeros((n, DAYS))
        for k, d in enumerate(res_days):
            inc[:, d] = stake * (payoff * wins[:, k] - 1.0)
        sleeve = w * W[:, None] + np.cumsum(inc, axis=1)
        out[:, sl] = core + sleeve
        W = out[:, (y + 1) * DAYS - 1]
    return out


def drawdown_governed(mkt, rf, m=3.0, alpha=0.5, cap=1.5):
    """Grossman-Zhou style: exposure = min(cap, m * (1 - alpha * peak / W))."""
    n, t_len = mkt.shape
    out = np.empty((n, t_len))
    W = np.ones(n)
    peak = np.ones(n)
    for t in range(t_len):
        e = np.clip(m * (1 - alpha * peak / W), 0.0, cap)
        borrow = np.maximum(e - 1, 0.0)
        cash = np.maximum(1 - e, 0.0)
        r = e * mkt[:, t] + cash * rf[:, t] - borrow * (rf[:, t] + MARGIN_SPREAD / DAYS)
        W = W * (1 + r)
        peak = np.maximum(peak, W)
        out[:, t] = W
    return out


def single_stock(mkt, rng, idio_vol=0.35, alpha=0.0, hazard=0.01, df=4):
    """All-in on one stock: market + fat-tailed idiosyncratic noise + default hazard.

    Drift is compensated for the hazard so expected return = market + alpha.
    """
    n, t_len = mkt.shape
    scale = idio_vol / np.sqrt(DAYS) / np.sqrt(df / (df - 2))
    eps = rng.standard_t(df, size=(n, t_len)) * scale
    default = rng.random((n, t_len)) < hazard / DAYS
    r = mkt + eps + (alpha + hazard) / DAYS
    r = np.where(default, -1.0, np.maximum(r, -0.95))
    return wealth_from_returns(r)


def strategies(mkt, rf, rng):
    yield "Cash (T-bills)", wealth_from_returns(rf)
    idx = mkt - IDX_ER / DAYS
    yield "Index 1x buy-and-hold", wealth_from_returns(idx)
    for L, label, spread, er in ((1.5, "Index 1.5x (margin, daily rebal.)", MARGIN_SPREAD, IDX_ER),
                                 (2.0, "Index 2x daily LETF", LETF_SPREAD, LETF_ER),
                                 (3.0, "Index 3x daily LETF", LETF_SPREAD, LETF_ER)):
        r = L * mkt - (L - 1) * (rf + spread / DAYS) - er / DAYS
        yield label, wealth_from_returns(r)
    yield "Drawdown-governed index (<=1.5x, floor 50% of peak)", drawdown_governed(mkt, rf)
    yield "Barbell 90/10: index + convex bets EV+65%", barbell(idx, 0.10, CONVEX_EV_POS, rng)
    yield "Barbell 80/20: index + convex bets EV+65%", barbell(idx, 0.20, CONVEX_EV_POS, rng)
    yield "Barbell 90/10: index + convex bets EV 0 (fair)", barbell(idx, 0.10, CONVEX_FAIR, rng)
    yield "Barbell 90/10: index + convex bets EV-30%", barbell(idx, 0.10, CONVEX_NEG, rng)
    yield "Taleb barbell 90/10: T-bills + convex EV+65%", barbell(rf, 0.10, CONVEX_EV_POS, rng)
    yield "All-in single stock, no skill", single_stock(mkt, rng)
    yield "All-in single stock, +5%/yr alpha", single_stock(mkt, rng, alpha=0.05)


def run(n_paths=N_PATHS, chunk=CHUNK):
    data = load_ff_daily()
    base_mkt = data["mkt"].to_numpy()
    base_rf = data["rf"].to_numpy()
    # undo the Saturday-session day-count bias: match the 1926-2026 annual log return
    raw_log_mu = DAYS * np.log1p(base_mkt).mean()
    rows = []
    for s_i, (scen, shift) in enumerate(SCENARIOS.items()):
        adj = (HIST_LOG_MU - raw_log_mu + shift) / DAYS
        rng = np.random.default_rng(SEED + 100 + s_i)
        store: dict[str, dict[int, list]] = {}
        t0 = time.time()
        for c in range(n_paths // chunk):
            idx = stationary_bootstrap_idx(len(base_mkt), chunk, T, MEAN_BLOCK, rng)
            mkt = np.expm1(np.log1p(base_mkt[idx]) + adj)
            rf = base_rf[idx]
            for name, W in strategies(mkt, rf, rng):
                peak = np.maximum.accumulate(np.maximum(W, 1.0), axis=1)
                dd = np.maximum.accumulate(1.0 - W / peak, axis=1)
                hi = np.maximum.accumulate(W, axis=1)
                d = store.setdefault(name, {h: [] for h in HORIZONS})
                for h in HORIZONS:
                    k = h * DAYS - 1
                    d[h].append(np.stack([W[:, k], dd[:, k], hi[:, k]], axis=1))
        print(f"{scen}: {time.time() - t0:.1f}s")
        for name, d in store.items():
            for h in HORIZONS:
                arr = np.concatenate(d[h])
                wt, mdd, hi = arr[:, 0], arr[:, 1], arr[:, 2]
                rows.append({
                    "Scenario": scen, "Strategy": name, "Years": h,
                    "P(>=10x)": fmt_pct(np.mean(wt >= 10), 1),
                    "P(>=11x)": fmt_pct(np.mean(wt >= 11), 1),
                    "P(touch 11x)": fmt_pct(np.mean(hi >= 11), 1),
                    "Median W": fmt_x(float(np.median(wt))),
                    "Median CAGR": f"{100 * (np.median(wt) ** (1 / h) - 1):.1f}%",
                    "Mean W": fmt_x(float(np.mean(wt))),
                    "5th pct W": fmt_x(float(np.quantile(wt, 0.05))),
                    "95th pct W": fmt_x(float(np.quantile(wt, 0.95))),
                    "P(W<1)": fmt_pct(np.mean(wt < 1), 1),
                    "P(maxDD>=50%)": fmt_pct(np.mean(mdd >= 0.5), 1),
                    "Median maxDD": fmt_pct(float(np.median(mdd))),
                })
    df = pd.DataFrame(rows)
    save_table(df, "d_barbell_vs_concentrated_vs_leverage")
    return df


def historical_paths():
    """Actual 1926-2026 path of constant-leverage index strategies (not bootstrapped)."""
    data = load_ff_daily()
    mkt, rf = data["mkt"], data["rf"]
    rows = []
    years = (data.index[-1] - data.index[0]).days / 365.25
    for L, spread, er, label in ((1.0, 0.0, IDX_ER, "1x index"), (1.5, MARGIN_SPREAD, IDX_ER, "1.5x margin"),
                                 (2.0, LETF_SPREAD, LETF_ER, "2x daily LETF"),
                                 (3.0, LETF_SPREAD, LETF_ER, "3x daily LETF")):
        r = L * mkt - (L - 1) * (rf + spread / DAYS) - er / DAYS
        W = (1 + r).cumprod()
        dd = 1 - W / W.cummax()
        # worst drawdown and its dates
        trough = dd.idxmax()
        peak_date = W.loc[:trough].idxmax()
        sub = {}
        for start, end in (("1926-07-01", "2026-08-31"), ("1929-09-01", "1932-07-31"),
                           ("2000-01-01", "2009-12-31"), ("2009-06-25", "2026-08-31")):
            rr = r.loc[start:end]
            yrs = (rr.index[-1] - rr.index[0]).days / 365.25
            sub[f"{start[:4]}-{end[:4]} CAGR"] = f"{100 * ((1 + rr).prod() ** (1 / yrs) - 1):.1f}%"
        rows.append({"Strategy": label,
                     "CAGR 1926-2026": f"{100 * (W.iloc[-1] ** (1 / years) - 1):.1f}%",
                     "Max drawdown": f"{100 * dd.max():.1f}%",
                     "Worst DD peak->trough": f"{peak_date.date()} -> {trough.date()}",
                     **{k: v for k, v in sub.items() if not k.startswith("1926")}})
    df = pd.DataFrame(rows)
    save_table(df, "d_historical_leverage_paths")
    return df


def validate_letf():
    """Compare the simulated 3x/2x LETF (FF daily data + cost model) with real UPRO/SSO."""
    import yfinance as yf
    data = load_ff_daily()
    rows = []
    for tic, L in (("UPRO", 3.0), ("SSO", 2.0)):
        px = yf.download(tic, start="2009-06-26", end="2026-09-01", auto_adjust=True, progress=False)["Close"]
        px = px.iloc[:, 0] if isinstance(px, pd.DataFrame) else px
        start, end = px.index[0], min(px.index[-1], data.index[-1])
        r = L * data["mkt"] - (L - 1) * (data["rf"] + LETF_SPREAD / DAYS) - LETF_ER / DAYS
        sim = (1 + r.loc[start:end].iloc[1:]).prod()
        act = px.loc[end] / px.loc[start]
        yrs = (end - start).days / 365.25
        rows.append({"ETF": tic, "Period": f"{start.date()} to {end.date()}",
                     "Actual CAGR": f"{100 * (act ** (1 / yrs) - 1):.1f}%",
                     "Simulated CAGR (CRSP VW index, cost model)": f"{100 * (sim ** (1 / yrs) - 1):.1f}%"})
    df = pd.DataFrame(rows)
    save_table(df, "d_letf_validation")
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.max_rows", 200)
    print(historical_paths().to_string())
    try:
        print(validate_letf().to_string())
    except Exception as exc:  # network optional
        print("LETF validation skipped:", exc)
    print(run().to_string())
