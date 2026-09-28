"""Part 3b: altcoin momentum with weekly (1-7 day) and monthly holds, survivorship-free.

Universe: every Binance spot USDT pair in the public archive (including delisted ones), excluding
stablecoins, fiat, wrapped and leveraged tokens (fetch_alts.py). Each week (signal at the Sunday UTC close,
trade at the Monday close, hold one week), the universe is the top-N coins by trailing 30-day median daily
USDT volume with >= 60 days of history. BTC and ETH are excluded from the alt universe.
Series are split at data gaps > 5 days (delisting / relisting under the same ticker).

Strategies (long-only unless marked):
  EW          equal-weight top-N alts
  XSMOM k     top quintile by past k-day return (k = 7, 14, 28), equal weight
  XSMOM L/S   top quintile minus bottom quintile (not accessible to US retail; information only)
  TSMOM28     each alt held only if its 28-day return > 0 (else cash)
  REV7        bottom quintile by past 7-day return (short-term reversal, long-only)
Costs: 0.35% per side (0.25% fee + 0.10% spread/slippage for alts); cash earns 0.
Design: 2018-01 .. 2020-12; test: 2021-01 .. 2026-08.
"""
from __future__ import annotations

import glob
import os

import numpy as np
import pandas as pd

import common as C

ALT_DIR = C.CACHE / "alts"
COST = 0.0035
TOPN = 20


def load_panel():
    fn_c = C.SCRATCH / "alts_close.parquet"
    fn_v = C.SCRATCH / "alts_qvol.parquet"
    if fn_c.exists() and fn_v.exists():
        return pd.read_parquet(fn_c), pd.read_parquet(fn_v)
    closes, vols = {}, {}
    for f in sorted(glob.glob(str(ALT_DIR / "*.csv"))):
        sym = os.path.basename(f)[:-4]
        try:
            df = pd.read_csv(f, index_col=0, parse_dates=True)
        except Exception:  # noqa: BLE001
            continue
        if df.empty or "close" not in df:
            continue
        base = sym[:-4]
        # Binance tokenized US stocks/ETFs (e.g. NVDAB, SPYB, SNDKB) listed from June 2026: not crypto
        if base.endswith("B") and len(base) >= 4 and base != "SHIB" and df.index[0] >= pd.Timestamp("2026-06-01"):
            continue
        df = df[df["close"] > 0]
        df.index = df.index.normalize()
        df = df[~df.index.duplicated(keep="last")]
        # split at gaps > 5 days (delisting / relisting under the same symbol)
        gaps = df.index.to_series().diff().dt.days.fillna(1)
        seg = (gaps > 5).cumsum()
        for k, g in df.groupby(seg):
            name = sym if k == 0 else f"{sym}#{k}"
            if len(g) < 30:
                continue
            closes[name] = g["close"]
            vols[name] = g["quote_volume"]
    P = pd.DataFrame(closes).sort_index()
    V = pd.DataFrame(vols).sort_index()
    P = P.loc["2017-08-01":"2026-08-31"]
    V = V.reindex(P.index)
    try:
        P.to_parquet(fn_c)
        V.to_parquet(fn_v)
    except Exception:  # noqa: BLE001
        pass
    return P, V


def weekly_backtest(P, V, topn=TOPN, exclude=("BTCUSDT", "ETHUSDT"), coinbase_only=None):
    # daily returns; within a series' life, missing days -> 0 (rare)
    R = P.pct_change(fill_method=None)
    age = P.notna().cumsum()
    vol30 = V.rolling(30, min_periods=20).median()
    cols = [c for c in P.columns if c.split("#")[0] not in exclude]
    if coinbase_only is not None:
        cols = [c for c in cols if c.split("#")[0][:-4] in coinbase_only]
    sundays = P.index[P.index.dayofweek == 6]
    out = {k: [] for k in ["EW", "XSMOM7", "XSMOM14", "XSMOM28", "XSMOM7_LS", "XSMOM28_LS", "TSMOM28", "REV7", "BTC"]}
    trades = {k: [] for k in out}
    dates = []
    prev_hold = {k: set() for k in out}
    for s in sundays:
        i = P.index.get_loc(s)
        e0, e1 = i + 1, i + 8                    # trade at Monday close, hold to next Monday close
        if e1 >= len(P.index):
            break
        elig = [c for c in cols if age.at[s, c] >= 60 and not np.isnan(vol30.at[s, c]) and not np.isnan(P.at[s, c])]
        if len(elig) < topn:
            continue
        uni = vol30.loc[s, elig].sort_values(ascending=False).index[:topn].tolist()
        past = {k: P.loc[s, uni] / P.iloc[i - k][uni] - 1 for k in (7, 14, 28)}
        seg = P.iloc[e0:e1 + 1][uni]
        # forward 1-week return; if a coin dies mid-week, take its last available price
        last_valid = seg.ffill().iloc[-1]
        fwd = last_valid / seg.iloc[0] - 1
        q = max(1, topn // 5)

        def port(names, tag, sign=1.0):
            names = [n for n in names if not np.isnan(fwd.get(n, np.nan))]
            if not names:
                out[tag].append(0.0)
                return
            gross = sign * fwd[names].mean()
            # turnover cost: names entering/leaving (equal weight approx)
            newset = set(names)
            changed = len(newset.symmetric_difference(prev_hold[tag])) / max(len(newset), 1)
            cost = COST * min(2.0, changed)
            prev_hold[tag] = newset
            out[tag].append(gross - cost)
            for n in names:
                trades[tag].append(sign * fwd[n] - 2 * COST)

        port(uni, "EW")
        for k in (7, 14, 28):
            srt = past[k].dropna().sort_values()
            port(srt.index[-q:].tolist(), f"XSMOM{k}")
        s7 = past[7].dropna().sort_values()
        s28 = past[28].dropna().sort_values()
        long7, short7 = s7.index[-q:].tolist(), s7.index[:q].tolist()
        l7 = [n for n in long7 if not np.isnan(fwd.get(n, np.nan))]
        sh7 = [n for n in short7 if not np.isnan(fwd.get(n, np.nan))]
        out["XSMOM7_LS"].append((fwd[l7].mean() if l7 else 0) - (fwd[sh7].mean() if sh7 else 0) - 4 * COST)
        l28, sh28 = s28.index[-q:].tolist(), s28.index[:q].tolist()
        out["XSMOM28_LS"].append(fwd[l28].mean() - fwd[sh28].mean() - 4 * COST)
        tsm = [n for n in uni if past[28].get(n, -1) > 0]
        if tsm:
            port(tsm, "TSMOM28")
        else:
            out["TSMOM28"].append(0.0)
            prev_hold["TSMOM28"] = set()
        port(s7.index[:q].tolist(), "REV7")
        b = P["BTCUSDT"].iloc[e0:e1 + 1]
        out["BTC"].append(b.iloc[-1] / b.iloc[0] - 1)
        dates.append(P.index[e1])
    W = pd.DataFrame(out, index=pd.DatetimeIndex(dates))
    return W, trades


def summarize(W: pd.DataFrame):
    rows = []
    for per, a, b in [("design 2018-2020", "2018-01-01", "2020-12-31"), ("test 2021-2026", "2021-01-01", "2026-08-31"),
                      ("2023-2026", "2023-01-01", "2026-08-31")]:
        x = W.loc[a:b]
        for c in W.columns:
            r = x[c]
            eq = (1 + r).cumprod()
            yrs = (x.index[-1] - x.index[0]).days / 365.25
            rows.append({"period": per, "strategy": c, "weeks": len(r), "cagr_%": round(100 * (eq.iloc[-1] ** (1 / yrs) - 1), 1),
                         "ann_mean_%": round(100 * r.mean() * 52, 1), "vol_%": round(100 * r.std() * np.sqrt(52), 1),
                         "sharpe": round(r.mean() / r.std() * np.sqrt(52), 2), "maxDD_%": round(100 * (eq / eq.cummax() - 1).min(), 1),
                         "worst_week_%": round(100 * r.min(), 1), "win_weeks_%": round(100 * (r > 0).mean(), 0)})
    return pd.DataFrame(rows)


def liquidity(P, V):
    rows = []
    vol30 = V.rolling(30, min_periods=20).median()
    for d in ["2019-12-29", "2020-12-27", "2022-12-25", "2024-12-29", "2026-08-30"]:
        t = pd.Timestamp(d)
        if t not in vol30.index:
            continue
        s = vol30.loc[t].dropna()
        s = s[[c for c in s.index if c.split("#")[0] not in ("BTCUSDT", "ETHUSDT")]].sort_values(ascending=False)
        rows.append({"date": d, "alts_with_data": int(len(s)), "rank1": s.index[0], "rank1_$m_day": round(s.iloc[0] / 1e6),
                     "rank10_$m_day": round(s.iloc[9] / 1e6), "rank20_$m_day": round(s.iloc[19] / 1e6),
                     "rank50_$m_day": round(s.iloc[49] / 1e6) if len(s) > 49 else None,
                     "top20": ",".join([c.replace("USDT", "") for c in s.index[:20]])})
    return pd.DataFrame(rows)


def coinbase_bases():
    fn = C.CACHE / "coinbase_products.json"
    if not fn.exists():
        r = C.http_get("https://api.exchange.coinbase.com/products")
        fn.write_bytes(r.content)
    import json
    j = json.loads(fn.read_text())
    return {p["base_currency"] for p in j if p.get("quote_currency") in ("USD", "USDC", "USDT")}


def main():
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 200)
    P, V = load_panel()
    print("panel", P.shape, P.index[0].date(), P.index[-1].date())
    L = liquidity(P, V)
    C.save(L, "p3b_alt_liquidity.csv")
    print(L.drop(columns=["top20"]).to_string())
    print(L[["date", "top20"]].to_string())
    res = {}
    for label, kw in [("top20", dict(topn=20)), ("top10", dict(topn=10)), ("top40", dict(topn=40))]:
        W, tr = weekly_backtest(P, V, **kw)
        S = summarize(W)
        S["universe"] = label
        res[label] = S
        if label == "top20":
            W.to_csv(C.SCRATCH / "p3b_weekly_top20.csv")
            ts = []
            for k, v in tr.items():
                if not v:
                    continue
                ts.append({"strategy": k, **C.trade_stats(pd.Series(v), None)})
            TS = pd.DataFrame(ts)
            C.save(TS, "p3b_alt_trade_stats.csv")
            print(TS.to_string())
    try:
        cb = coinbase_bases()
        W, tr = weekly_backtest(P, V, topn=20, coinbase_only=cb)
        S = summarize(W)
        S["universe"] = "top20, Coinbase-listed today (look-ahead: survivorship)"
        res["cb"] = S
    except Exception as e:  # noqa: BLE001
        print("coinbase filter failed", e)
    ALL = pd.concat(res.values())
    C.save(ALL, "p3b_alt_momentum.csv")
    print(ALL.to_string())


if __name__ == "__main__":
    main()
