"""Option-implied event moves and defined-risk structure pricing (yfinance chains, 2026-09-28 close snapshot).

1) ATM straddle -> implied move and Black-Scholes IV per expiry for each underlying; forward variance per interval.
2) SPY: decompose the variance term structure into a baseline daily variance plus event variance for the intervals
   containing NFP (Oct 2, daily expiries), CPI (Oct 14), FOMC+megacap earnings (Oct 28 week), election+NFP (Nov 3-6),
   CPI+Nvidia (Nov 10-18). Compare with realized event-day |moves| (analyze_scheduled17 output).
3) Candidate defined-risk structures priced at realistic fills (buy at ask, sell at bid): debit, max payoff,
   multiple, breakeven, risk-neutral probabilities (strike IV), leg liquidity (spread % of mid, open interest).
4) USO: option-implied vs empirical probabilities of large moves by the Nov 20 / Dec 18 expiries.
Outputs: printed tables + SCRATCH/implied_*.csv
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.optimize import brentq
from scipy.stats import norm

from lib17 import SCRATCH, asset_panel

pd.set_option("display.width", 260)
pd.set_option("display.max_rows", 400)
pd.set_option("display.max_columns", 40)
ASOF = pd.Timestamp("2026-09-28")
R = 0.040
DIV = {"SPY": 0.011, "QQQ": 0.005, "IWM": 0.012, "TLT": 0.045, "XLE": 0.032, "EEM": 0.025, "DAL": 0.008,
       "UAL": 0.0, "INDA": 0.005, "EIDO": 0.03, "SMH": 0.004, "NVDA": 0.0003, "KRE": 0.03, "XOP": 0.02}
HOLIDAYS = {pd.Timestamp("2026-11-26"), pd.Timestamp("2026-12-25")}
C = pd.read_csv(SCRATCH / "chains17.csv")
C["mid"] = np.where((C.bid > 0) & (C.ask > 0), (C.bid + C.ask) / 2, np.nan)


def tdays(a: pd.Timestamp, b: pd.Timestamp) -> int:
    d = pd.bdate_range(a + pd.Timedelta(days=1), b)
    return int(sum(1 for x in d if x not in HOLIDAYS))


def bs(S, K, T, r, q, sig, typ):
    if T <= 0 or sig <= 0:
        return max(0.0, (S - K) if typ == "C" else (K - S))
    d1 = (math.log(S / K) + (r - q + 0.5 * sig * sig) * T) / (sig * math.sqrt(T))
    d2 = d1 - sig * math.sqrt(T)
    if typ == "C":
        return S * math.exp(-q * T) * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)
    return K * math.exp(-r * T) * norm.cdf(-d2) - S * math.exp(-q * T) * norm.cdf(-d1)


def iv_from(price, S, K, T, r, q, typ):
    try:
        return brentq(lambda s: bs(S, K, T, r, q, s, typ) - price, 1e-4, 5.0)
    except Exception:  # noqa: BLE001
        return np.nan


def atm_row(tkr: str, exp: str) -> dict | None:
    d = C[(C.ticker == tkr) & (C.expiry == exp)]
    if d.empty:
        return None
    S = float(d.spot.iloc[0])
    T = max((pd.Timestamp(exp) - ASOF).days, 0.5) / 365.0
    q = DIV.get(tkr, 0.0)
    F = S * math.exp((R - q) * T)
    ks = sorted(set(d.strike))
    k = min(ks, key=lambda x: abs(x - F))
    c = d[(d.type == "C") & (d.strike == k)]
    p = d[(d.type == "P") & (d.strike == k)]
    if c.empty or p.empty or np.isnan(c.mid.iloc[0]) or np.isnan(p.mid.iloc[0]):
        return None
    straddle = float(c.mid.iloc[0] + p.mid.iloc[0])
    ivc = iv_from(float(c.mid.iloc[0]), S, k, T, R, q, "C")
    ivp = iv_from(float(p.mid.iloc[0]), S, k, T, R, q, "P")
    iv = np.nanmean([ivc, ivp])
    spr = float(((c.ask - c.bid) / c.mid).iloc[0] + ((p.ask - p.bid) / p.mid).iloc[0]) / 2
    return {"ticker": tkr, "expiry": exp, "spot": S, "T_days": (pd.Timestamp(exp) - ASOF).days,
            "tdays": tdays(ASOF, pd.Timestamp(exp)), "strike": k, "straddle": straddle,
            "implied_move%": straddle / S * 100, "atm_iv%": iv * 100, "w": iv * iv * T, "atm_spread%": spr * 100,
            "oi_atm": float(c.oi.iloc[0] + p.oi.iloc[0])}


def term_structure(tkr: str) -> pd.DataFrame:
    rows = [atm_row(tkr, e) for e in sorted(C[C.ticker == tkr].expiry.unique())]
    t = pd.DataFrame([r for r in rows if r])
    if t.empty:
        return t
    t = t[t.T_days >= 1].reset_index(drop=True)
    t["fwd_var"] = t.w.diff()
    t.loc[0, "fwd_var"] = t.loc[0, "w"]
    t["fwd_tdays"] = t.tdays.diff()
    t.loc[0, "fwd_tdays"] = t.loc[0, "tdays"]
    t["fwd_daily_vol%"] = np.sqrt(np.maximum(t.fwd_var, 0) / t.fwd_tdays) * 100
    return t


EVENTS_2026 = {
    "2026-10-02": "NFP (Oct 2)", "2026-10-16": "CPI Oct 14 (+ bank earnings)",
    "2026-10-30": "FOMC Oct 28 + megacap earnings + BoJ/ECB + GDP", "2026-11-06": "Election Nov 3 + NFP Nov 6 + refunding",
    "2026-11-20": "CPI Nov 10 + Nvidia ~Nov 17-19", "2026-12-18": "NFP Dec 4 + FOMC Dec 9 + CPI Dec 10 + CR Dec 11",
}


def spy_events():
    t = term_structure("SPY")
    daily = t[(t.fwd_tdays == 1) & (t.expiry != "2026-10-02")]
    base = float(daily.fwd_var.median())
    print("\n=== SPY ATM term structure (straddle at forward-nearest strike; 9/28 close quotes)")
    print(t[["expiry", "tdays", "strike", "straddle", "implied_move%", "atm_iv%", "fwd_tdays", "fwd_daily_vol%", "atm_spread%"]].round(3).to_string(index=False))
    print(f"baseline one-day variance (median of non-event daily intervals, n={len(daily)}): 1-SD daily move {math.sqrt(base)*100:.3f}% "
          f"(annualised {math.sqrt(base*252)*100:.1f}%)")
    rows = []
    for exp, lbl in EVENTS_2026.items():
        r = t[t.expiry == exp]
        if r.empty:
            continue
        r = r.iloc[0]
        ev_var = r.fwd_var - r.fwd_tdays * base
        n_events = 2 if ("+ NFP" in lbl or "Nvidia" in lbl) else 1
        one = math.sqrt(max(ev_var, 0) / n_events + base)
        rows.append({"interval_to": exp, "contains": lbl, "tdays": int(r.fwd_tdays), "fwd_var_x1e4": r.fwd_var * 1e4,
                     "baseline_var_x1e4": r.fwd_tdays * base * 1e4, "event_excess_var_x1e4": ev_var * 1e4,
                     "implied_event_day_1sd%": one * 100, "implied_event_day_E|move|%": one * 100 * math.sqrt(2 / math.pi),
                     "assumed_events_in_interval": n_events})
    ev = pd.DataFrame(rows)
    print("\n=== SPY implied event-day moves (excess variance over baseline, split equally if two events)")
    print(ev.round(3).to_string(index=False))
    t.to_csv(SCRATCH / "implied_spy_term.csv", index=False)
    ev.to_csv(SCRATCH / "implied_spy_events.csv", index=False)
    return t, ev, base


def other_terms():
    out = []
    for tk in ["TLT", "GLD", "USO", "BNO", "IBIT", "QQQ", "IWM", "NVDA", "SMH", "XLE", "JETS", "DAL", "UAL", "EEM", "KRE", "INDA", "EIDO", "FXY", "UUP", "XOP"]:
        try:
            t = term_structure(tk)
        except Exception as e:  # noqa: BLE001
            print(tk, "term fail", e)
            continue
        if t.empty:
            continue
        out.append(t)
    allt = pd.concat(out)
    allt.to_csv(SCRATCH / "implied_terms.csv", index=False)
    key = allt[allt.expiry.isin(["2026-10-02", "2026-10-16", "2026-10-30", "2026-11-06", "2026-11-20", "2026-12-18", "2027-01-15"])]
    print("\n=== Implied moves (% of spot, ATM straddle mid) by expiry")
    pv = key.pivot_table(index="ticker", columns="expiry", values="implied_move%").round(2)
    print(pv.to_string())
    print("\n=== ATM IV (%) by expiry")
    print(key.pivot_table(index="ticker", columns="expiry", values="atm_iv%").round(1).to_string())
    print("\n=== Forward per-day vol (%/day) for the interval ending at each expiry (event weeks stand out)")
    print(key.pivot_table(index="ticker", columns="expiry", values="fwd_daily_vol%").round(2).to_string())
    print("\n=== ATM bid-ask (% of mid, avg of call & put) by expiry")
    print(key.pivot_table(index="ticker", columns="expiry", values="atm_spread%").round(1).to_string())
    return allt


def leg(tkr, exp, typ, target_k, band=0.03, min_oi=100):
    """Prefer the most-traded (highest open interest) quoted strike within +/-band of the target; else nearest."""
    d = C[(C.ticker == tkr) & (C.expiry == exp) & (C.type == typ)]
    if d.empty:
        return None
    near = d[((d.strike / target_k - 1).abs() <= band) & (d.bid > 0) & (d.ask > 0) & (d.oi.fillna(0) >= min_oi)]
    if len(near):
        # highest OI, tie-break by closeness
        near = near.assign(dist=(near.strike - target_k).abs()).sort_values(["oi", "dist"], ascending=[False, True])
        return near.iloc[0]
    return d.iloc[(d.strike - target_k).abs().argsort().iloc[0]]


def spread(tkr, exp, typ, k_long_mult, k_short_mult, label):
    d = C[(C.ticker == tkr) & (C.expiry == exp)]
    if d.empty:
        return None
    S = float(d.spot.iloc[0])
    L = leg(tkr, exp, typ, S * k_long_mult)
    Sh = leg(tkr, exp, typ, S * k_short_mult)
    if L is None or Sh is None or L.strike == Sh.strike:
        return None
    T = (pd.Timestamp(exp) - ASOF).days / 365.0
    q = DIV.get(tkr, 0.0)
    debit_fill = float(L.ask - Sh.bid)
    debit_mid = float(L.mid - Sh.mid) if not (np.isnan(L.mid) or np.isnan(Sh.mid)) else np.nan
    width = abs(float(L.strike - Sh.strike))
    ivL = iv_from(float(L.mid), S, float(L.strike), T, R, q, typ) if not np.isnan(L.mid) else np.nan
    ivS = iv_from(float(Sh.mid), S, float(Sh.strike), T, R, q, typ) if not np.isnan(Sh.mid) else np.nan

    def p_itm(K, iv):
        if np.isnan(iv):
            return np.nan
        d2 = (math.log(S / K) + (R - q - 0.5 * iv * iv) * T) / (iv * math.sqrt(T))
        return norm.cdf(d2) if typ == "C" else norm.cdf(-d2)
    be = float(L.strike + debit_fill) if typ == "C" else float(L.strike - debit_fill)
    return {"label": label, "ticker": tkr, "expiry": exp, "type": typ, "spot": S, "K_long": float(L.strike),
            "K_short": float(Sh.strike), "debit_fill": debit_fill, "debit_mid": debit_mid,
            "debit_%spot": debit_fill / S * 100, "max_value": width, "max_multiple": width / debit_fill if debit_fill > 0 else np.nan,
            "breakeven": be, "breakeven_move%": (be / S - 1) * 100,
            "RN_P(long ITM)%": p_itm(float(L.strike), ivL) * 100, "RN_P(full)%": p_itm(float(Sh.strike), ivS) * 100,
            "iv_long%": ivL * 100, "iv_short%": ivS * 100,
            "spread%_long": float((L.ask - L.bid) / L.mid * 100) if L.mid > 0 else np.nan,
            "spread%_short": float((Sh.ask - Sh.bid) / Sh.mid * 100) if Sh.mid > 0 else np.nan,
            "oi_long": float(L.oi), "oi_short": float(Sh.oi),
            "roundtrip_cost_%debit": float(((L.ask - L.bid) + (Sh.ask - Sh.bid)) / debit_mid * 100) if debit_mid and debit_mid > 0 else np.nan}


def structures():
    specs = [
        # oil de-escalation unwind (bearish oil) and escalation hedge
        ("USO", "2026-11-20", "P", 0.95, 0.80, "oil unwind: USO Nov put spread"),
        ("USO", "2026-12-18", "P", 0.93, 0.78, "oil unwind: USO Dec put spread"),
        ("USO", "2026-12-18", "C", 1.07, 1.30, "oil escalation hedge: USO Dec call spread"),
        ("BNO", "2026-12-18", "P", 0.93, 0.78, "oil unwind: BNO Dec put spread"),
        ("XLE", "2026-12-18", "P", 0.97, 0.87, "energy equities: XLE Dec put spread"),
        # beneficiaries of an unwind
        ("JETS", "2026-12-18", "C", 1.00, 1.15, "airlines: JETS Dec call spread"),
        ("DAL", "2026-12-18", "C", 1.00, 1.15, "airlines: DAL Dec call spread"),
        ("UAL", "2026-12-18", "C", 1.00, 1.15, "airlines: UAL Dec call spread"),
        ("INDA", "2026-12-18", "C", 1.00, 1.10, "EM importer: INDA Dec call spread"),
        ("EIDO", "2026-12-18", "C", 1.00, 1.15, "EM importer: EIDO Dec call spread"),
        ("EEM", "2026-12-18", "C", 1.00, 1.07, "EM: EEM Dec call spread"),
        # rates / FOMC
        ("TLT", "2026-11-20", "C", 1.00, 1.05, "duration: TLT Nov call spread"),
        ("TLT", "2026-12-18", "C", 1.01, 1.07, "duration: TLT Dec call spread"),
        ("TLT", "2026-12-18", "P", 0.99, 0.93, "bond rout: TLT Dec put spread"),
        # equity index
        ("SPY", "2026-11-20", "C", 1.00, 1.04, "equity: SPY Nov call spread"),
        ("SPY", "2026-12-18", "C", 1.00, 1.05, "equity: SPY Dec call spread"),
        ("SPY", "2026-12-18", "P", 0.97, 0.88, "hedge: SPY Dec put spread"),
        ("IWM", "2026-12-18", "C", 1.00, 1.06, "small caps: IWM Dec call spread"),
        # gold, bitcoin
        ("GLD", "2026-12-18", "C", 1.00, 1.08, "gold: GLD Dec call spread"),
        ("IBIT", "2026-12-18", "C", 1.00, 1.25, "bitcoin: IBIT Dec call spread"),
        ("IBIT", "2026-12-18", "P", 0.95, 0.75, "bitcoin: IBIT Dec put spread"),
        # AI capex / Nvidia (post-event only)
        ("SMH", "2026-12-18", "P", 0.95, 0.80, "AI capex: SMH Dec put spread"),
        ("FXY", "2026-12-18", "C", 1.00, 1.05, "yen: FXY Dec call spread"),
    ]
    rows = [spread(*s) for s in specs]
    t = pd.DataFrame([r for r in rows if r])
    cols = ["label", "K_long", "K_short", "spot", "debit_fill", "debit_mid", "debit_%spot", "max_multiple", "breakeven_move%",
            "RN_P(long ITM)%", "RN_P(full)%", "iv_long%", "spread%_long", "spread%_short", "oi_long", "oi_short", "roundtrip_cost_%debit"]
    print("\n=== Defined-risk structures at realistic fills (buy ask / sell bid), 9/28 close")
    print(t[cols].round(2).to_string(index=False))
    t.to_csv(SCRATCH / "implied_structures.csv", index=False)
    return t


def uso_empirical():
    P = asset_panel()
    uso = P["USO"].dropna()
    rows = []
    for exp, h in [("2026-11-20", tdays(ASOF, pd.Timestamp("2026-11-20"))), ("2026-12-18", tdays(ASOF, pd.Timestamp("2026-12-18")))]:
        f = (uso.shift(-h) / uso - 1).dropna() * 100
        war = f[(f.index >= "2026-03-02")]
        w22 = f[(f.index >= "2022-02-24") & (f.index <= "2022-12-31")]
        row = {"expiry": exp, "h_tdays": h}
        for lbl, x in [("all_2006+", f), ("2022_war", w22), ("2026_war", war)]:
            for thr in [-25, -15, -7]:
                row[f"{lbl}_P(<={thr}%)"] = (x <= thr).mean() * 100
            for thr in [10, 25]:
                row[f"{lbl}_P(>={thr}%)"] = (x >= thr).mean() * 100
            row[f"{lbl}_n"] = len(x)
        rows.append(row)
    t = pd.DataFrame(rows).T
    print("\n=== USO: empirical frequency of large moves over the same horizon (overlapping windows; 2026 war n is tiny)")
    print(t.round(1).to_string())
    # risk-neutral equivalents from the chain (strike-specific IVs)
    rn = []
    for exp in ["2026-11-20", "2026-12-18"]:
        d = C[(C.ticker == "USO") & (C.expiry == exp)]
        S = float(d.spot.iloc[0])
        T = (pd.Timestamp(exp) - ASOF).days / 365
        for m in [0.75, 0.85, 0.93, 1.10, 1.25]:
            typ = "P" if m < 1 else "C"
            r = leg("USO", exp, typ, S * m)
            iv = iv_from(float(r.mid), S, float(r.strike), T, R, 0.0, typ) if not np.isnan(r.mid) else np.nan
            d2 = (math.log(S / r.strike) + (R - 0.5 * iv * iv) * T) / (iv * math.sqrt(T))
            p = norm.cdf(-d2) if typ == "P" else norm.cdf(d2)
            rn.append({"expiry": exp, "strike": r.strike, "move%": (r.strike / S - 1) * 100, "iv%": iv * 100,
                       "RN_prob%": p * 100, "side": "below" if typ == "P" else "above"})
    rn = pd.DataFrame(rn)
    print(rn.round(1).to_string(index=False))
    rn.to_csv(SCRATCH / "implied_uso_rn.csv", index=False)


def nvda_event():
    t = term_structure("NVDA")
    print("\n=== NVDA ATM term structure (earnings est. Nov 17 after close per Yahoo; unconfirmed)")
    print(t[["expiry", "tdays", "implied_move%", "atm_iv%", "fwd_tdays", "fwd_daily_vol%", "atm_spread%"]].round(2).to_string(index=False))
    # event variance between the last expiry before Nov 17 and the first after
    before = t[t.expiry <= "2026-11-13"].tail(1)
    after = t[t.expiry >= "2026-11-20"].head(1)
    if len(before) and len(after):
        b, a = before.iloc[0], after.iloc[0]
        ordinary = t[(t.expiry > "2026-10-02") & (t.expiry <= "2026-11-13")]
        base_daily = float((ordinary.fwd_var / ordinary.fwd_tdays).median())
        ev = a.w - b.w - (a.tdays - b.tdays - 1) * base_daily
        print(f"NVDA implied earnings-day 1-SD move ~{math.sqrt(max(ev,0))*100:.1f}% (E|move| ~{math.sqrt(max(ev,0))*100*0.798:.1f}%); "
              f"from {b.expiry}->{a.expiry}; baseline daily vol {math.sqrt(base_daily)*100:.2f}%")
    # realised next-day moves after the last 16 reports
    P = asset_panel()
    ed = pd.read_csv(SCRATCH / "nvda_earnings_dates.csv")
    ed["d"] = pd.to_datetime(ed.iloc[:, 0].astype(str).str[:10])
    ed = ed[ed.d < ASOF].sort_values("d").tail(16)
    rows = []
    for d in ed.d:
        row = {"report": d.date()}
        for a in ["NVDA", "SMH", "SPY"]:
            s = P[a]
            p0 = s.index.searchsorted(d, side="right")  # next session after an after-close report
            row[a] = (s.iloc[p0] / s.iloc[p0 - 1] - 1) * 100
            if a == "NVDA":
                row["NVDA_f20"] = (s.iloc[min(p0 + 20, len(s) - 1)] / s.iloc[p0] - 1) * 100
        rows.append(row)
    h = pd.DataFrame(rows)
    print(h.round(2).to_string(index=False))
    print("NVDA next-day |move|: mean %.1f%% median %.1f%% | SMH |move| mean %.1f%% | SPY |move| mean %.2f%%" % (
        h.NVDA.abs().mean(), h.NVDA.abs().median(), h.SMH.abs().mean(), h.SPY.abs().mean()))
    h.to_csv(SCRATCH / "implied_nvda_history.csv", index=False)


def main():
    spy_events()
    other_terms()
    structures()
    uso_empirical()
    nvda_event()


if __name__ == "__main__":
    main()
