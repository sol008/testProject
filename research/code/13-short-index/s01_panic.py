"""Track 13 / test 1: panic and volatility-spike signals, holds of 1-60 sessions.

Signals (evaluated at the close of day t, market-wide):
  VIX level      VIX >= 30 / 40 / 45        flavours: 'first' (first close >= L after 20 sessions below)
                                                      'any'   (any day >= L; trades never overlap)
  VIX term       VIX/VIX3M >= 1.0 / 1.1     same two flavours (VIX3M exists from 2006-07)
  VIX jump       1-day VIX change >= +30% / +50%
  1-day fall     S&P 500 1-day return <= -3% / -4% / -5%
  Drawdown       S&P 500 close <= -10% / -15% / -20% below its all-time high
                 flavours: 'first' (first close past the level since the last ATH) / 'any'
Trend filter (on the traded instrument): all / above its 200-day SMA / below it.
Holds H = 1, 5, 10, 20, 40, 60 sessions; entries at next open (ETFs) and next close.

Instruments: ^GSPC total return 1928- (close entries only; VIX = VXO 1986-89 and a
realised-vol proxy RV21+4 before 1986, reported separately), SPY 1993-, QQQ 1999-,
IWM 2000-, EFA 2001-.  In-sample = before 2008, out-of-sample = 2008 onward.
Other markets (own drawdown / own 1-day fall): 16 foreign indices, close entries.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common13 import (SPLIT, TODAY, Registry, base_cost, drawdown, fred, load, run_rule,
                      save, sma, stream_stats, strategy_daily, trade_stats)

HOLDS = [1, 5, 10, 20, 40, 60]
REG = Registry("s01_panic")


def vix_series(gspc: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Spliced fear gauge on the ^GSPC calendar: VIX 1990-, VXO 1986-89, RV21+4 before.
    Returns (gauge, is_proxy flag)."""
    vix = load("^VIX")["C"]
    vxo = fred("VXOCLS")
    rv = np.log(gspc["C"]).diff().rolling(21).std() * np.sqrt(252) * 100 + 4.0
    g = rv.copy()
    proxy = pd.Series(True, index=gspc.index)
    vxo_d = vxo.reindex(gspc.index)
    m = (gspc.index >= "1986-01-02") & (gspc.index < "1990-01-02") & vxo_d.notna()
    g[m] = vxo_d[m]
    proxy[m] = False
    vix_d = vix.reindex(gspc.index)
    m2 = (gspc.index >= "1990-01-02") & vix_d.notna()
    g[m2] = vix_d[m2]
    proxy[m2] = False
    return g.ffill(), proxy


def first_cross(cond: pd.Series, quiet: int = 20) -> pd.Series:
    """cond true today and false on each of the previous `quiet` sessions."""
    prev = cond.shift(1).rolling(quiet, min_periods=1).max().fillna(0).astype(bool)
    return cond & ~prev


def first_since_ath(dd: pd.Series, level: float) -> pd.Series:
    """First close with drawdown <= level since the last all-time high."""
    ath = (dd >= 0)
    ep = ath.cumsum()
    hit = dd <= level
    first = hit & (hit.groupby(ep).cumsum() == 1)
    return first


def build_signals(spx: pd.DataFrame, gauge: pd.Series) -> dict[str, pd.Series]:
    s = {}
    for L in (30, 40, 45):
        c = gauge >= L
        s[f"VIX>={L}|first"] = first_cross(c)
        s[f"VIX>={L}|any"] = c
    v3 = load("^VIX3M")["C"].reindex(spx.index)
    vx = load("^VIX")["C"].reindex(spx.index)
    ratio = vx / v3
    for R in (1.0, 1.1):
        c = (ratio >= R) & ratio.notna()
        s[f"VIX/VIX3M>={R}|first"] = first_cross(c)
        s[f"VIX/VIX3M>={R}|any"] = c
    jump = gauge / gauge.shift(1) - 1
    for J in (0.30, 0.50):
        s[f"VIXjump>={int(J * 100)}%"] = jump >= J
    r1 = spx["C"].pct_change()
    for D in (0.03, 0.04, 0.05):
        s[f"SPX1d<=-{int(D * 100)}%"] = r1 <= -D
    dd = drawdown(spx["C"])
    for X in (0.10, 0.15, 0.20):
        s[f"DD<=-{int(X * 100)}%|first"] = first_since_ath(dd, -X)
        s[f"DD<=-{int(X * 100)}%|any"] = dd <= -X
    return s


def family_of(sig: str) -> str:
    return sig.split(">=")[0].split("<=")[0].split("|")[0] + ("|" + sig.split("|")[1] if "|" in sig else "")


_UNC = {}


def uncond(df: pd.DataFrame, H: int, mode: str, lo, hi) -> dict:
    """Unconditional H-session excess return from every entry day in [lo, hi)."""
    key = (df.attrs.get("ticker"), H, mode, pd.Timestamp(lo), pd.Timestamp(hi))
    if key in _UNC:
        return _UNC[key]
    _UNC[key] = _uncond(df, H, mode, lo, hi)
    return _UNC[key]


def _uncond(df: pd.DataFrame, H: int, mode: str, lo, hi) -> dict:
    aO, aC, rf = df["aO"], df["aC"], df["rf"]
    rfc = rf.cumsum()
    if mode == "open":
        ent = aO.shift(-1)
        ex = aC.shift(-H)
        rfh = rfc.shift(-H) - rfc
    elif mode == "close":
        ent = aC.shift(-1)
        ex = aC.shift(-(H + 1))
        rfh = rfc.shift(-(H + 1)) - rfc.shift(-1)
    else:
        ent = aC
        ex = aC.shift(-H)
        rfh = rfc.shift(-H) - rfc
    x = (ex / ent - 1 - rfh)
    x = x[(x.index >= lo) & (x.index < hi)].dropna()
    return dict(u_mean=float(x.mean()), u_sd=float(x.std()), u_sr=float(x.mean() / x.std()))


def run_block(inst: str, df: pd.DataFrame, sigs: dict, modes, periods, vix_for_cost, proxy=None,
              rows=None):
    tr200 = df["C"] > sma(df["C"], 200)
    for sig_name, sig in sigs.items():
        sig = sig.reindex(df.index).fillna(False).astype(bool)
        for filt in ("all", "above200", "below200"):
            if filt == "all":
                e = sig
            elif filt == "above200":
                e = sig & tr200
            else:
                e = sig & ~tr200
            for H in HOLDS:
                for mode in modes:
                    tr = run_rule(df, e, mode=mode, hold=H, vix=vix_for_cost)
                    for pname, (lo, hi) in periods.items():
                        if len(tr):
                            sub = tr[(tr["signal"] >= lo) & (tr["signal"] < hi)]
                        else:
                            sub = tr
                        # skip periods where the signal cannot exist (e.g. VIX3M before 2006)
                        st = trade_stats(sub, max(lo, df.index[0]), min(hi, df.index[-1]))
                        u = uncond(df, H, mode, max(lo, df.index[0]), min(hi, df.index[-1]))
                        variant = f"{sig_name}|{filt}|H{H}"
                        REG.add(family_of(sig_name), variant, inst, mode, pname, st, **u)
                        row = dict(inst=inst, signal=sig_name, family=family_of(sig_name), filt=filt,
                                   H=H, mode=mode, period=pname, **st, **u)
                        row["edge_vs_uncond"] = (st.get("mean_ex", np.nan) - u["u_mean"]) if st.get("n", 0) else np.nan
                        rows.append(row)


def episodes_table(spx, sigs, gauge, spy):
    """One row per 'first' signal on the S&P: date, gauge, DD, forward returns (next close
    entry, total return) at 5/20/60 sessions; SPY next-open numbers where available."""
    out = []
    dd = drawdown(spx["C"])
    tr200 = spx["C"] > sma(spx["C"], 200)
    for name in [k for k in sigs if k.endswith("|first")] + [k for k in sigs if k.startswith("SPX1d") or k.startswith("VIXjump")]:
        for d in sigs[name][sigs[name]].index:
            i = spx.index.get_loc(d)
            row = dict(signal=name, date=d.date(), gauge=round(float(gauge.iloc[i]), 1),
                       dd=round(float(dd.iloc[i]), 3), above200=bool(tr200.iloc[i]))
            for H in (5, 20, 60):
                if i + 1 + H < len(spx):
                    row[f"r{H}"] = spx["aC"].iloc[i + 1 + H] / spx["aC"].iloc[i + 1] - 1
                else:
                    row[f"r{H}"] = np.nan
                # path low over the hold (for stress)
            if i + 61 < len(spx):
                row["min60"] = spx["aC"].iloc[i + 1:i + 62].min() / spx["aC"].iloc[i + 1] - 1
            out.append(row)
    return pd.DataFrame(out)


def main():
    spx = load("^GSPC")
    gauge, proxy = vix_series(spx)
    sigs = build_signals(spx, gauge)
    vix_cost = gauge  # costs doubled when VIX > 30
    rows = []
    # --- S&P 500 long history (close-based execution only; ^GSPC opens are stale pre-2000s)
    periods_spx = {
        "1928-1985 (proxy VIX)": (pd.Timestamp("1928-01-01"), pd.Timestamp("1986-01-01")),
        "1986-2007 (IS)": (pd.Timestamp("1986-01-01"), SPLIT),
        "2008-2026 (OOS)": (SPLIT, TODAY + pd.Timedelta(days=1)),
        "1928-2007": (pd.Timestamp("1928-01-01"), SPLIT),
        "full": (pd.Timestamp("1928-01-01"), TODAY + pd.Timedelta(days=1)),
    }
    run_block("^GSPC", spx, sigs, ["close", "ideal"], periods_spx, vix_cost, proxy, rows)
    # --- ETFs (next open and next close)
    for t in ["SPY", "QQQ", "IWM", "EFA"]:
        df = load(t)
        periods = {
            "IS (<2008)": (df.index[0], SPLIT),
            "OOS (2008-)": (SPLIT, TODAY + pd.Timedelta(days=1)),
            "full": (df.index[0], TODAY + pd.Timedelta(days=1)),
        }
        run_block(t, df, sigs, ["open", "close"], periods, vix_cost, None, rows)
    res = pd.DataFrame(rows)
    save(res, "panic_all_variants.csv")
    ep = episodes_table(spx, sigs, gauge, None)
    save(ep, "panic_episodes.csv")
    # --- other markets: own drawdown / own 1-day fall, next-close entries, H=5/20/60
    intl = ["^N225", "^FTSE", "^GDAXI", "^FCHI", "^HSI", "^STOXX50E", "^AXJO", "^GSPTSE", "^SSMI",
            "^AEX", "^IBEX", "^KS11", "^TWII", "^BVSP", "^MXX", "^BSESN"]
    irows = []
    for t in intl:
        df = load(t)
        dd = drawdown(df["C"])
        r1 = df["C"].pct_change()
        own = {}
        for D in (0.03, 0.04, 0.05):
            own[f"own1d<=-{int(D * 100)}%"] = r1 <= -D
        for X in (0.10, 0.15, 0.20):
            own[f"ownDD<=-{int(X * 100)}%|first"] = first_since_ath(dd, -X)
        tr200 = df["C"] > sma(df["C"], 200)
        for nm, sg in own.items():
            for filt in ("all", "above200", "below200"):
                e = sg if filt == "all" else (sg & tr200 if filt == "above200" else sg & ~tr200)
                for H in (5, 20, 60):
                    tr = run_rule(df, e, mode="close", hold=H)
                    for pname, (lo, hi) in {"IS (<2008)": (df.index[0], SPLIT),
                                            "OOS (2008-)": (SPLIT, TODAY + pd.Timedelta(days=1))}.items():
                        sub = tr[(tr["signal"] >= lo) & (tr["signal"] < hi)] if len(tr) else tr
                        st = trade_stats(sub, max(lo, df.index[0]), min(hi, df.index[-1]))
                        u = uncond(df, H, "close", max(lo, df.index[0]), min(hi, df.index[-1]))
                        irows.append(dict(inst=t, signal=nm, filt=filt, H=H, period=pname, **st, **u))
    ires = pd.DataFrame(irows)
    save(ires, "panic_intl.csv")
    REG.save()
    print("done", len(res), len(ires))


if __name__ == "__main__":
    main()
