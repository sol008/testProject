"""Track 28 engine: weekly schedule, execution prices, rules, portfolio simulator, metrics, Monte Carlo.

Timing (no look-ahead):
  * The signal uses UTC daily closes up to and including Sunday S (the Sunday candle closes Monday 00:00 UTC).
  * Routes:  "etf"   trade at 09:30 New York on the first NYSE session after S (IBIT/FBTC/ETHA/BITX in the IRA);
             "night" trade Monday 01:00 UTC = Sunday 8-9 pm New York, IBIT in Robinhood's 24 Hour Market (limit order);
             "cb"    trade Monday 02:00 UTC = Sunday 9-10 pm New York (Coinbase, taxable);
             "ideal" trade at the Sunday close itself (no delay, no cost) - a reference only.
  * Crypto prices between UTC midnights come from Coinbase hourly candles (linear inside the hour); before hourly
    data exists (BTC before 2015-07-20) they are geometric interpolations of the daily closes.
  * SPY: dividend-adjusted open to open, same sessions as the ETF route. T-bills: daily French RF over those sessions.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

INSTR = ["BTC", "ETH", "BTC2X", "ETH2X"]
ASSETS = INSTR + ["BASE", "CASH"]
HALVINGS = pd.to_datetime(["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"])
WEEKS_PER_YEAR = 365.25 / 7


# ------------------------------------------------------------------------------------------------ prices
def price_at(daily: pd.Series, hourly: pd.DataFrame | None, times) -> np.ndarray:
    times = pd.DatetimeIndex(times)
    day = times.normalize()
    frac = np.asarray((times - day) / pd.Timedelta(days=1), dtype=float)
    prev = daily.reindex(day - pd.Timedelta(days=1)).to_numpy(dtype=float)   # price at `day` 00:00
    nxt = daily.reindex(day).to_numpy(dtype=float)                            # price at next midnight
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(frac == 0, prev, prev * (nxt / prev) ** frac)
    if hourly is not None and len(hourly):
        hs = times.floor("h")
        pos = hourly.index.searchsorted(hs, side="right") - 1
        use = (hs >= hourly.index[0]) & (pos >= 0)
        pos_c = np.clip(pos, 0, len(hourly) - 1)
        start = hourly.index[pos_c]
        o = hourly["open"].to_numpy()[pos_c]
        c = hourly["close"].to_numpy()[pos_c]
        f = np.asarray((times - hs) / pd.Timedelta(hours=1), dtype=float)
        exact = start == hs
        hp = np.where(exact, o + f * (c - o), c)  # missing candle: last trade before it
        out = np.where(use, hp, out)
    return out


def schedule(sessions: pd.DatetimeIndex, first: str, last: pd.Timestamp) -> pd.DataFrame:
    sundays = pd.date_range(pd.Timestamp(first), last, freq="W-SUN")
    pos = sessions.searchsorted(sundays, side="right")
    keep = pos < len(sessions)
    sundays, sess = sundays[keep], sessions[pos[keep]]
    etf = (sess + pd.Timedelta(hours=9, minutes=30)).tz_localize("America/New_York").tz_convert("UTC").tz_localize(None)
    return pd.DataFrame({"session": sess, "etf_time": etf, "ideal_time": sundays + pd.Timedelta(days=1),
                         "cb_time": sundays + pd.Timedelta(days=1, hours=2),
                         "night_time": sundays + pd.Timedelta(days=1, hours=1)}, index=sundays)


def weekly_returns(sch: pd.DataFrame, route: str, D: dict, cfg: dict) -> pd.DataFrame:
    """Row k = the holding interval from execution k to execution k+1 (index = Sunday of decision k)."""
    times = pd.DatetimeIndex(sch[f"{route}_time"])
    dt = np.diff(times.values).astype("timedelta64[s]").astype(float) / (365.25 * 86400)
    out = pd.DataFrame(index=sch.index[:-1])
    # T-bills and SPY on NYSE sessions (same for every route)
    sess = pd.DatetimeIndex(sch["session"])
    rf = D["rf"]
    rf_s = rf.reindex(D["SPY"].index).fillna(0.0)
    g = np.log1p(rf_s).cumsum()
    prev = g.shift(1).reindex(sess).to_numpy()   # cumulative log RF before session k
    rf_w = np.expm1(np.diff(prev))
    out["CASH"] = rf_w
    spy_o = D["SPY"]["open"].reindex(sess).to_numpy()
    out["SPY"] = spy_o[1:] / spy_o[:-1] - 1
    out["SSO"] = np.nan
    if "SSO" in D:
        so = D["SSO"]["open"].reindex(sess).to_numpy()
        out["SSO"] = so[1:] / so[:-1] - 1
    for a in ("btc", "eth"):
        daily = D[a]
        hourly = None if route == "ideal" else D.get(f"{a}_h")
        p = price_at(daily, hourly, times)
        r1 = p[1:] / p[:-1] - 1
        # 2x daily reset at every UTC midnight inside the interval
        r2 = np.full(len(r1), np.nan)
        cl = daily
        for k in range(len(r1)):
            t0, t1 = times[k], times[k + 1]
            if not (np.isfinite(p[k]) and np.isfinite(p[k + 1])):
                continue
            m = pd.date_range(t0.normalize() + pd.Timedelta(days=1), t1, freq="D")
            m = m[(m > t0) & (m < t1)]
            chain = np.concatenate([[p[k]], cl.reindex(m - pd.Timedelta(days=1)).to_numpy(), [p[k + 1]]])
            seg = chain[1:] / chain[:-1] - 1
            r2[k] = np.prod(1 + 2 * seg) - 1
        er1 = cfg["er1"]
        er2 = cfg["er2"] + cfg["fin_spread2"]
        out[a.upper()] = r1 - er1 * dt
        out[a.upper() + "2X"] = r2 - rf_w - er2 * dt
    out["dt"] = dt
    out["t0"] = times[:-1]
    out["t1"] = times[1:]
    return out


# ------------------------------------------------------------------------------------------------ rules
def features(daily: pd.Series, sundays: pd.DatetimeIndex) -> pd.DataFrame:
    wk = daily[daily.index.weekday == 6]
    lr = np.log(daily).diff()
    f = pd.DataFrame(index=sundays)
    f["close"] = daily.reindex(sundays)
    f["sma10w"] = wk.rolling(10).mean().reindex(sundays)
    f["sma20w"] = wk.rolling(20).mean().reindex(sundays)
    f["sma50d"] = daily.rolling(50).mean().reindex(sundays)
    f["sma200d"] = daily.rolling(200).mean().reindex(sundays)
    f["vol60"] = (lr.rolling(60).std() * math.sqrt(365)).reindex(sundays)
    f["mom10w"] = (wk / wk.shift(10) - 1).reindex(sundays)
    return f


def build_rules(D: dict, sundays: pd.DatetimeIndex) -> dict[str, pd.DataFrame]:
    fb, fe = features(D["btc"], sundays), features(D["eth"], sundays)
    ratio = (D["eth"] / D["btc"]).dropna()
    rw = ratio[ratio.index.weekday == 6]
    r_on = (rw > rw.rolling(10).mean()).reindex(sundays).fillna(False).to_numpy(dtype=bool)
    z = np.zeros(len(sundays))

    def on(f, a, b):
        return (f[a] > f[b]).fillna(False).to_numpy().astype(float)

    b10, b20, b50, b200 = on(fb, "close", "sma10w"), on(fb, "close", "sma20w"), on(fb, "close", "sma50d"), on(fb, "close", "sma200d")
    e10, e20, e50, e200 = on(fe, "close", "sma10w"), on(fe, "close", "sma20w"), on(fe, "close", "sma50d"), on(fe, "close", "sma200d")
    e_has = fe["close"].notna().to_numpy().astype(float)
    vt50 = np.minimum(1.0, 0.5 / fb["vol60"].to_numpy())
    e_vt = b10 * np.minimum(2.0, 0.8 / fb["vol60"].to_numpy())
    x2 = np.clip(e_vt - 1, 0, 1)
    x1 = np.where(e_vt > 1, 2 - e_vt, e_vt)
    mb, me = fb["mom10w"].fillna(-9).to_numpy(), fe["mom10w"].fillna(-9).to_numpy()
    pick_eth_mom = (e10 > 0) & ((b10 == 0) | (me > mb))
    rot_mom_e = pick_eth_mom.astype(float)
    rot_mom_b = ((b10 > 0) & ~pick_eth_mom).astype(float)
    cand_eth = r_on & (e_has > 0)
    rot_rat_e = (cand_eth & (e10 > 0)).astype(float)
    rot_rat_b = (~cand_eth & (b10 > 0)).astype(float)
    halv = np.zeros(len(sundays))
    for h in HALVINGS:
        halv = np.maximum(halv, ((sundays >= h) & (sundays < h + pd.Timedelta(days=548))).astype(float))

    def R(btc=z, eth=z, btc2=z, eth2=z):
        return pd.DataFrame({"BTC": btc, "ETH": eth, "BTC2X": btc2, "ETH2X": eth2}, index=sundays)

    rules = {
        "BTC_BH": R(btc=np.ones(len(sundays))),
        "BTC_10W": R(btc=b10), "BTC_20W": R(btc=b20), "BTC_50D": R(btc=b50), "BTC_200D": R(btc=b200),
        "BTC_10W_200D": R(btc=b10 * b200),
        "BTC_BH_VT50": R(btc=np.nan_to_num(vt50)), "BTC_10W_VT50": R(btc=b10 * np.nan_to_num(vt50)),
        "ETH_BH": R(eth=e_has), "ETH_10W": R(eth=e10), "ETH_20W": R(eth=e20), "ETH_50D": R(eth=e50),
        "ETH_200D": R(eth=e200),
        "ROT_MOM_10W": R(btc=rot_mom_b, eth=rot_mom_e), "ROT_ETHBTC_10W": R(btc=rot_rat_b, eth=rot_rat_e),
        "HALF_10W": R(btc=0.5 * b10, eth=0.5 * e10),
        "BTC2X_BH": R(btc2=np.ones(len(sundays))), "BTC2X_10W": R(btc2=b10), "BTC2X_20W": R(btc2=b20),
        "BTC2X_10W_200D": R(btc2=b10 * b200),
        "BTC_10W_VT80_L2": R(btc=np.nan_to_num(x1), btc2=np.nan_to_num(x2)),
        "HALVING_18M": R(btc=halv),   # curiosity only (n = 3 cycles in sample); never a candidate
    }
    return rules


CANDIDATES = [k for k in [
    "BTC_BH", "BTC_10W", "BTC_20W", "BTC_50D", "BTC_200D", "BTC_10W_200D", "BTC_BH_VT50", "BTC_10W_VT50",
    "ETH_BH", "ETH_10W", "ETH_20W", "ETH_50D", "ETH_200D", "ROT_MOM_10W", "ROT_ETHBTC_10W", "HALF_10W",
    "BTC2X_BH", "BTC2X_10W", "BTC2X_20W", "BTC2X_10W_200D", "BTC_10W_VT80_L2"]]


# ------------------------------------------------------------------------------------------------ simulator
def simulate(expo: np.ndarray, R: np.ndarray, w: float, costs: np.ndarray, band: float = 0.25):
    """expo: K x 4 sleeve exposures; R: K x 6 interval returns (BTC, ETH, BTC2X, ETH2X, BASE, CASH).

    Trades (whole-portfolio rebalance to target) happen at a decision when an instrument turns on or off, or when
    a held instrument's weight is more than `band` (relative) away from its target. Returns (nav[K+1], trade[K]).
    """
    K = len(expo)
    nav = np.empty(K + 1)
    nav[0] = 1.0
    trade = np.zeros(K, dtype=bool)
    h = None
    Rn = np.nan_to_num(R)
    for k in range(K):
        tc = w * expo[k]
        tgt = np.array([tc[0], tc[1], tc[2], tc[3], 1 - w, w - tc.sum()])
        if h is None:
            do, cost = True, float(np.dot(costs, np.abs(tgt)))
        else:
            do = False
            for i in range(4):
                on_t, on_h = tc[i] > 1e-9, h[i] > 1e-9
                if on_t != on_h or (on_t and abs(h[i] / tc[i] - 1) > band):
                    do = True
                    break
            cost = float(np.dot(costs, np.abs(tgt - h))) if do else 0.0
        if do:
            h = tgt
            trade[k] = True
        v = h * (1 + Rn[k])
        s = v.sum()
        nav[k + 1] = nav[k] * (1 - cost) * s
        h = v / s
    return nav, trade


def metrics(nav: np.ndarray, t: pd.DatetimeIndex, rf_w: np.ndarray, trade: np.ndarray | None = None) -> dict:
    years = (t[-1] - t[0]).days / 365.25
    r = nav[1:] / nav[:-1] - 1
    ex = r - rf_w
    dd = nav / np.maximum.accumulate(nav) - 1
    ser = pd.Series(nav, index=t)
    yr = {}
    for y in range(t[0].year, t[-1].year + 1):
        a = ser[ser.index < pd.Timestamp(f"{y}-01-01")]
        b = ser[ser.index < pd.Timestamp(f"{y + 1}-01-01")]
        if len(b) == 0:
            continue
        start = a.iloc[-1] if len(a) else ser.iloc[0]
        yr[y] = b.iloc[-1] / start - 1
    out = {"cagr": nav[-1] ** (1 / years) - 1, "vol": r.std(ddof=1) * math.sqrt(WEEKS_PER_YEAR),
           "sharpe": ex.mean() / ex.std(ddof=1) * math.sqrt(WEEKS_PER_YEAR) if ex.std() > 0 else np.nan,
           "maxdd": dd.min(), "worst_year": min(yr.values()), "worst_year_which": min(yr, key=yr.get),
           "years": years}
    if trade is not None:
        out["trades_per_year"] = (trade.sum() - 1) / years
    return out


# ------------------------------------------------------------------------------------------------ helpers
def nw_tstat(y: np.ndarray, x: np.ndarray, lags: int = 4):
    """OLS y = a + b x with Newey-West standard errors. Returns (a, t_a, b)."""
    X = np.column_stack([np.ones(len(x)), x])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    e = y - X @ beta
    n = len(y)
    S = (X * e[:, None]).T @ (X * e[:, None])
    for L in range(1, lags + 1):
        wgt = 1 - L / (lags + 1)
        G = (X[L:] * e[L:, None]).T @ (X[:-L] * e[:-L, None])
        S += wgt * (G + G.T)
    XtXi = np.linalg.inv(X.T @ X)
    V = XtXi @ S @ XtXi * n / (n - 2)
    return beta[0], beta[0] / math.sqrt(V[0, 0]), beta[1]


# ------------------------------------------------------------------------------------------------ Monte Carlo
def stationary_bootstrap_idx(rng, n_paths: int, n_days: int, n_src: int, block: float) -> np.ndarray:
    idx = np.empty((n_paths, n_days), dtype=np.int64)
    idx[:, 0] = rng.integers(0, n_src, n_paths)
    jump = rng.random((n_paths, n_days)) < 1.0 / block
    fresh = rng.integers(0, n_src, (n_paths, n_days))
    for d in range(1, n_days):
        idx[:, d] = np.where(jump[:, d], fresh[:, d], (idx[:, d - 1] + 1) % n_src)
    return idx


def mc_run(src: pd.DataFrame, rules: list[str], weights: np.ndarray, bases: list[str], *, g_btc: float,
           g_spy: float, rf: float, vol_btc: float | None, years: int = 10, n_paths: int = 2000, block: float = 60,
           seed: int = 7, cost_btc: float = 0.0005, cost2: float = 0.001, er1: float = 0.0025,
           er2_all: float = 0.045, lev_spy_cost: float = 0.014, band: float = 0.25, chunk: int = 500) -> pd.DataFrame:
    """Joint stationary block bootstrap of calendar-day log returns (BTC, SPY), re-drifted to forward assumptions.

    src columns: btc, spy (daily log returns, SPY 0 on non-sessions). Rules are recomputed on each simulated path
    (weekly decision every 7th day, executed one day later). Bases: SPY, RF, LEVSPY (2x daily SPY when SPY is above
    its 200-day average at the decision, else T-bills). Returns one row per rule x base x weight.
    """
    rng = np.random.default_rng(seed)
    b = src["btc"].to_numpy()
    s = src["spy"].to_numpy()
    b = b - b.mean()
    if vol_btc is not None:
        b = b * (vol_btc / (b.std() * math.sqrt(365.25)))
    b = b + g_btc / 365.25
    s = s - s.mean() + g_spy / 365.25
    rfd = math.log1p(rf) / 365.25
    warm, n_days = 210, int(years * 365.25) + 1
    K = (n_days - 9) // 7
    total = warm + n_days
    rows = []
    acc = {}
    for c0 in range(0, n_paths, chunk):
        n = min(chunk, n_paths - c0)
        idx = stationary_bootstrap_idx(rng, n, total, len(b), block)
        lb, ls = b[idx], s[idx]
        P = np.exp(np.cumsum(lb, axis=1))
        Q = np.exp(np.cumsum(ls, axis=1))
        rb = np.expm1(lb)
        rs = np.expm1(ls)
        csP = np.cumsum(P, axis=1)
        csQ = np.cumsum(Q, axis=1)
        dec = warm + 7 * np.arange(K)            # decision day index (close)
        # signals
        close = P[:, dec]
        sma10w = np.mean([P[:, dec - 7 * j] for j in range(10)], axis=0)
        sma20w = np.mean([P[:, dec - 7 * j] for j in range(20)], axis=0)
        sma200 = (csP[:, dec] - csP[:, dec - 200]) / 200
        on10 = (close > sma10w).astype(float)
        on20 = (close > sma20w).astype(float)
        on200 = (close > sma200).astype(float)
        spy_on = (Q[:, dec] > (csQ[:, dec] - csQ[:, dec - 200]) / 200).astype(float)
        # weekly interval returns: from close of day dec+1 to close of day dec+8
        a0, a1 = dec + 1, dec + 8
        R_btc = P[:, a1] / P[:, a0] - 1 - er1 * 7 / 365.25
        R_spy = Q[:, a1] / Q[:, a0] - 1
        R_rf = math.expm1(rfd * 7)
        # 2x daily reset
        lev = np.ones((n, K))
        lev_s = np.ones((n, K))
        for j in range(2, 9):
            lev *= 1 + 2 * rb[:, dec + j]
            lev_s *= 1 + 2 * rs[:, dec + j]
        R_b2 = lev - 1 - R_rf - er2_all * 7 / 365.25
        R_s2 = lev_s - 1 - R_rf - lev_spy_cost * 7 / 365.25
        R_lev = np.where(spy_on > 0, R_s2, R_rf)
        expo = {"BTC_BH": (np.ones((n, K)), 0), "BTC_10W": (on10, 0), "BTC_20W": (on20, 0),
                "BTC_10W_200D": (on10 * on200, 0), "BTC_200D": (on200, 0),
                "BTC2X_10W": (on10, 1), "BTC2X_BH": (np.ones((n, K)), 1)}
        for rule in rules:
            e, is2 = expo[rule]
            Rc = R_b2 if is2 else R_btc
            cc = cost2 if is2 else cost_btc
            for base in bases:
                Rb = {"SPY": R_spy, "RF": np.full((n, K), R_rf), "LEVSPY": R_lev}[base]
                W = weights[None, :]
                nav = np.ones((n, len(weights)))
                peak = nav.copy()
                mdd = np.zeros_like(nav)
                hc = np.zeros_like(nav)     # crypto weight held
                hb = np.zeros_like(nav)     # base weight held
                first = True
                for k in range(K):
                    tc = W * e[:, k:k + 1]
                    if first:
                        do = np.ones_like(nav, dtype=bool)
                        first = False
                    else:
                        on_t, on_h = tc > 1e-9, hc > 1e-9
                        rel = np.where(on_t, np.abs(hc / np.where(on_t, tc, 1) - 1), 0)
                        do = (on_t != on_h) | (on_t & (rel > band))
                    cost = np.where(do, cc * np.abs(tc - hc), 0.0)
                    hc = np.where(do, tc, hc)
                    hb = np.where(do, 1 - W, hb)
                    hcash = 1 - hc - hb
                    rc, rbk = Rc[:, k:k + 1], Rb[:, k:k + 1]
                    vc, vb, vr = hc * (1 + rc), hb * (1 + rbk), hcash * (1 + R_rf)
                    tot = vc + vb + vr
                    nav = nav * (1 - cost) * tot
                    hc, hb = vc / tot, vb / tot
                    peak = np.maximum(peak, nav)
                    mdd = np.minimum(mdd, nav / peak - 1)
                spy_only = np.prod(1 + R_spy, axis=1)[:, None]
                key = (rule, base)
                yrs = K * 7 / 365.25
                part = {"logw": np.log(nav), "mdd": mdd, "spy": np.log(spy_only) * np.ones_like(nav)}
                if key not in acc:
                    acc[key] = {k2: [v] for k2, v in part.items()}
                else:
                    for k2, v in part.items():
                        acc[key][k2].append(v)
    yrs = K * 7 / 365.25
    for (rule, base), d in acc.items():
        logw = np.vstack(d["logw"])
        mdd = np.vstack(d["mdd"])
        spy = np.vstack(d["spy"])
        g = logw / yrs
        ex = (np.exp(g) - 1) - (np.exp(spy / yrs) - 1)
        for j, w in enumerate(weights):
            rows.append({"rule": rule, "base": base, "w": w, "g_mean": g[:, j].mean(),
                         "cagr_median": math.expm1(np.median(g[:, j])),
                         "cagr_p10": math.expm1(np.quantile(g[:, j], 0.10)),
                         "cagr_p90": math.expm1(np.quantile(g[:, j], 0.90)),
                         "excess_median": np.median(ex[:, j]), "p_excess_pos": (ex[:, j] > 0).mean(),
                         "p_excess_5": (ex[:, j] >= 0.05).mean(), "p_dd50": (mdd[:, j] <= -0.5).mean(),
                         "mdd_median": np.median(mdd[:, j]), "p_loss_10y": (logw[:, j] < 0).mean()})
    return pd.DataFrame(rows)
