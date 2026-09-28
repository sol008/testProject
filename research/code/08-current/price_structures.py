"""Price concrete candidate option structures from live yfinance chains and compute scenario payoffs.

For each structure: legs (expiry, strike, type, side), leg bid/ask/mid/IV/OI, net debit at mid and at the ask
(the realistic retail fill for a buyer), max payoff, and payoff multiple under stated scenarios at expiry.
Output: SCRATCH/structures.csv + printed. Scenario prices are the report's assumptions (documented in the report).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf

from common import SCRATCH

# (name, underlying, target_expiry, legs[(type, strike_as_frac_of_spot or abs, side)], scenarios{label: spot_at_expiry_frac})
STRUCTS = [
    ("Yen up: FXY call spread", "FXY", "2027-03-19", [("call", 1.03, +1), ("call", 1.10, -1)],
     {"USDJPY 140 (FXY +12.4%)": 1.124, "USDJPY 148 (FXY +6.4%)": 1.064, "USDJPY 157 (flat)": 1.0, "USDJPY 165": 0.954}),
    ("Duration: TLT call spread", "TLT", "2027-03-19", [("call", 1.03, +1), ("call", 1.12, -1)],
     {"20y yld -100bp (TLT +17%)": 1.17, "-50bp (+8%)": 1.08, "flat": 1.0, "+50bp (-7.5%)": 0.925}),
    ("Crash hedge: SPY put spread", "SPY", "2027-03-19", [("put", 0.92, +1), ("put", 0.80, -1)],
     {"S&P -25%": 0.75, "S&P -15%": 0.85, "S&P -5%": 0.95, "S&P +5%": 1.05}),
    ("AI-crowding hedge: SMH put spread", "SMH", "2027-03-19", [("put", 0.90, +1), ("put", 0.70, -1)],
     {"SMH -40%": 0.60, "SMH -25%": 0.75, "SMH -10%": 0.90, "SMH +10%": 1.10}),
    ("Memory top: MU put spread", "MU", "2027-03-19", [("put", 0.90, +1), ("put", 0.65, -1)],
     {"MU -50%": 0.50, "MU -30%": 0.70, "MU -10%": 0.90, "MU +15%": 1.15}),
    ("BTC cycle: IBIT call spread", "IBIT", "2027-12-17", [("call", 1.05, +1), ("call", 1.50, -1)],
     {"BTC 140k (+68%)": 1.68, "BTC 110k (+32%)": 1.32, "BTC 84k flat": 1.0, "BTC 60k": 0.72}),
    ("Rates peak: XHB call spread", "XHB", "2027-03-19", [("call", 1.03, +1), ("call", 1.20, -1)],
     {"XHB +30%": 1.30, "XHB +15%": 1.15, "flat": 1.0, "XHB -15%": 0.85}),
    ("Peace: USO put spread", "USO", "2026-12-18", [("put", 0.90, +1), ("put", 0.70, -1)],
     {"WTI front -35% (peace)": 0.65, "WTI -20%": 0.80, "flat": 1.0, "WTI +20% (escalation)": 1.20}),
    ("Escalation: USO call spread", "USO", "2026-12-18", [("call", 1.10, +1), ("call", 1.40, -1)],
     {"WTI +45%": 1.45, "WTI +25%": 1.25, "flat": 1.0, "WTI -30%": 0.70}),
    ("Uranium: CCJ call spread", "CCJ", "2027-03-19", [("call", 1.05, +1), ("call", 1.35, -1)],
     {"CCJ +40%": 1.40, "CCJ +20%": 1.20, "flat": 1.0, "CCJ -20%": 0.80}),
    ("Gold rebound: GLD call spread", "GLD", "2027-03-19", [("call", 1.03, +1), ("call", 1.18, -1)],
     {"GLD +20%": 1.20, "GLD +10%": 1.10, "flat": 1.0, "GLD -10%": 0.90}),
    ("Private-credit rebound: BX call spread", "BX", "2027-03-19", [("call", 1.05, +1), ("call", 1.35, -1)],
     {"BX +40%": 1.40, "BX +20%": 1.20, "flat": 1.0, "BX -20%": 0.80}),
    ("Regional bank stress: KRE put spread", "KRE", "2026-12-31", [("put", 0.92, +1), ("put", 0.75, -1)],
     {"KRE -30%": 0.70, "KRE -15%": 0.85, "flat": 1.0, "KRE +10%": 1.10}),
]


def nearest_expiry(t: yf.Ticker, target: str) -> str | None:
    exps = t.options
    if not exps:
        return None
    d = pd.to_datetime(list(exps))
    k = int(np.argmin(np.abs((d - pd.Timestamp(target)).days)))
    return exps[k]


def leg_quote(chain, typ, strike):
    df = chain.calls if typ == "call" else chain.puts
    df = df.copy()
    i = (df["strike"] - strike).abs().idxmin()
    r = df.loc[i]
    bid, ask, last = float(r.get("bid", np.nan) or 0), float(r.get("ask", np.nan) or 0), float(r.get("lastPrice", np.nan) or 0)
    mid = (bid + ask) / 2 if bid > 0 and ask > 0 else last
    return {"strike": float(r["strike"]), "bid": bid, "ask": ask, "mid": mid, "iv": float(r["impliedVolatility"]) * 100,
            "oi": float(r.get("openInterest", 0) or 0), "vol": float(r.get("volume", 0) or 0)}


def payoff(legs, s):
    v = 0.0
    for q, typ, side in legs:
        k = q["strike"]
        intrinsic = max(s - k, 0) if typ == "call" else max(k - s, 0)
        v += side * intrinsic
    return v


def main():
    rows = []
    for name, und, target, legs, scen in STRUCTS:
        t = yf.Ticker(und)
        try:
            exp = nearest_expiry(t, target)
            spot = float(t.history(period="5d")["Close"].iloc[-1])
            ch = t.option_chain(exp)
        except Exception as e:  # noqa: BLE001
            print(name, "failed", e)
            continue
        qlegs = []
        for typ, k, side in legs:
            strike = k * spot if k < 5 else k
            q = leg_quote(ch, typ, strike)
            qlegs.append((q, typ, side))
        debit_mid = sum(side * q["mid"] for q, typ, side in qlegs)
        debit_ask = sum((q["ask"] if side > 0 else q["bid"]) * side for q, typ, side in qlegs)
        width = abs(qlegs[0][0]["strike"] - qlegs[1][0]["strike"])
        r = {"structure": name, "underlying": und, "spot": round(spot, 2), "expiry": exp,
             "legs": " / ".join(f"{'+' if s > 0 else '-'}{typ[0].upper()}{q['strike']:g} (bid {q['bid']:.2f} ask {q['ask']:.2f} iv {q['iv']:.0f}% oi {q['oi']:.0f})"
                                for q, typ, s in qlegs),
             "debit_mid": round(debit_mid, 3), "debit_ask(bid)": round(debit_ask, 3),
             "debit_%spot": round(debit_mid / spot * 100, 2), "max_payoff": round(width, 2),
             "max_multiple": round(width / debit_mid, 2) if debit_mid > 0 else np.nan}
        for lbl, f in scen.items():
            pv = payoff(qlegs, spot * f)
            r[f"x @ {lbl}"] = round(pv / debit_mid, 2) if debit_mid > 0 else np.nan
        rows.append(r)
    df = pd.DataFrame(rows)
    df.to_csv(SCRATCH / "structures.csv", index=False)
    pd.set_option("display.width", 300)
    pd.set_option("display.max_colwidth", 200)
    for _, r in df.iterrows():
        print("\n" + r["structure"], "| spot", r["spot"], "| exp", r["expiry"])
        print("  ", r["legs"])
        print(f"   debit mid {r['debit_mid']} (ask/bid fill {r['debit_ask(bid)']}) = {r['debit_%spot']}% of spot; "
              f"max payoff {r['max_payoff']} -> {r['max_multiple']}x")
        print("   scenario multiples:", {k: v for k, v in r.items() if str(k).startswith('x @') and pd.notna(v)})


if __name__ == "__main__":
    main()
