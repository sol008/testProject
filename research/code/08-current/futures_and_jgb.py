"""Futures term structures by contract month (yfinance) and the Japanese government bond curve (Japan MOF CSV).

Outputs: SCRATCH/futures_curves.csv, SCRATCH/jgb_current.csv (+ printed key spreads)
Why contract months: yfinance continuous tickers (e.g. BZ=F) roll silently -- on 2026-09-28 BZ=F rolled from
Nov to Dec Brent, printing an artificial -5.8% 'move'. Use explicit contracts for anything roll-sensitive.
"""
from __future__ import annotations

import io

import pandas as pd
import requests
import yfinance as yf

from common import SCRATCH

MONTHS = "FGHJKMNQUVXZ"


def curve(root: str, exch: str, start=(26, 9), end=(28, 5)) -> list[tuple]:
    out = []
    y, m = start
    while (y, m) <= end:
        t = f"{root}{MONTHS[m]}{y}.{exch}"
        try:
            h = yf.Ticker(t).history(period="5d", auto_adjust=False)
            if len(h):
                out.append((root, t, h.index[-1].date(), float(h["Close"].iloc[-1])))
        except Exception:  # noqa: BLE001
            pass
        m += 1
        if m == 12:
            m, y = 0, y + 1
    return out


def main():
    rows = []
    for root, ex in [("CL", "NYM"), ("BZ", "NYM"), ("NG", "NYM"), ("GC", "CMX"), ("HG", "CMX")]:
        rows.extend(curve(root, ex))
    df = pd.DataFrame(rows, columns=["root", "ticker", "date", "close"])
    df.to_csv(SCRATCH / "futures_curves.csv", index=False)
    for root in ["CL", "BZ"]:
        c = df[df.root == root].reset_index(drop=True)
        if len(c) >= 13:
            print(f"{root}: M1 {c.close[0]:.2f}  M2 {c.close[1]:.2f}  (M1-M2 {c.close[0]-c.close[1]:.2f})  "
                  f"M13 {c.close[12]:.2f}  (M1-M13 {c.close[0]-c.close[12]:.2f}, {100*(c.close[0]/c.close[12]-1):.1f}%)")
    r = requests.get("https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv",
                     headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
    r.raise_for_status()
    (SCRATCH / "jgb_current.csv").write_bytes(r.content)
    jgb = pd.read_csv(io.BytesIO(r.content), skiprows=1, encoding="latin-1").dropna(subset=["10Y"])
    print("JGB curve (MOF):\n", jgb.tail(3).to_string(index=False))


if __name__ == "__main__":
    main()
