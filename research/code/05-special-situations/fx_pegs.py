"""Currency-peg breaks: size of the jump, and what the 'short the peg' trade looked like.

For each historical break we measure the change in the USD value of the local
currency from 5 trading days before the break to +1 day, +1m, +3m, +12m
(negative = devaluation).  Sources: FRED H.10 daily rates (DEX*), Yahoo FX.
Also prints a monitor table for current pegs / managed currencies.

Run: python fx_pegs.py      Outputs: output/fx_peg_breaks.csv, output/fx_peg_monitor.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT, fred, save_json, yf_close

# (label, source, series, break_date, quote) ; quote 'local_per_usd' or 'usd_per_local'
EVENTS = [
    ("GBP exits ERM (Black Wednesday)", "fred", "DEXUSUK", "1992-09-16", "usd_per_local"),
    ("ITL exits ERM", "fred", "DEXITUS", "1992-09-16", "local_per_usd"),
    ("SEK peg abandoned", "fred", "DEXSDUS", "1992-11-19", "local_per_usd"),
    ("MXN Tequila crisis band abandoned", "fred", "DEXMXUS", "1994-12-20", "local_per_usd"),
    ("THB float (Asian crisis)", "fred", "DEXTHUS", "1997-07-02", "local_per_usd"),
    ("MYR float", "fred", "DEXMAUS", "1997-07-14", "local_per_usd"),
    ("KRW band abandoned", "fred", "DEXKOUS", "1997-11-17", "local_per_usd"),
    ("BRL Real Plan crawling peg ends", "fred", "DEXBZUS", "1999-01-13", "local_per_usd"),
    ("ARS convertibility ends", "yahoo", "ARS=X", "2002-01-07", "local_per_usd"),
    ("RUB band removed / free float", "yahoo", "RUB=X", "2014-11-10", "local_per_usd"),
    ("CHF: SNB removes EUR/CHF 1.20 floor (CHF value in EUR)", "chf", "CHF_in_EUR", "2015-01-15", "usd_per_local"),
    ("CNY Aug-2015 fixing reform", "fred", "DEXCHUS", "2015-08-11", "local_per_usd"),
    ("KZT free float", "yahoo", "KZT=X", "2015-08-20", "local_per_usd"),
    ("EGP float (IMF program)", "yahoo", "EGP=X", "2016-11-03", "local_per_usd"),
    ("ARS (Milei) step devaluation", "yahoo", "ARS=X", "2023-12-13", "local_per_usd"),
    ("NGN FX unification", "yahoo", "NGN=X", "2023-06-14", "local_per_usd"),
    ("EGP float #2 (Mar-2024)", "yahoo", "EGP=X", "2024-03-06", "local_per_usd"),
    ("ETB float (IMF program)", "yahoo", "ETB=X", "2024-07-29", "local_per_usd"),
    ("BOB peg (6.96) abandoned (official 29-Jun-2026; Yahoo lags)", "yahoo", "BOB=X", "2026-06-29", "local_per_usd"),
]

MONITOR = {  # ticker: (peg / central rate or None, regime note)
    "HKD=X": (7.80, "currency board 7.75-7.85 since 1983"),
    "SAR=X": (3.75, "hard peg since 1986"),
    "AED=X": (3.6725, "hard peg since 1997"),
    "QAR=X": (3.64, "hard peg"),
    "BHD=X": (0.376, "hard peg; weakest GCC fiscal position"),
    "OMR=X": (0.3845, "hard peg"),
    "JOD=X": (0.709, "hard peg since 1995"),
    "DKK=X": (None, "ERM-II vs EUR 7.46038 +/-2.25%"),
    "XOF=X": (None, "CFA franc: EUR 655.957 (French Treasury guarantee)"),
    "CNY=X": (None, "managed; daily fixing +/-2%"),
    "VND=X": (None, "managed band"),
    "EGP=X": (None, "floated Mar-2024 (managed)"),
    "NGN=X": (None, "floated 2023-24"),
    "ARS=X": (None, "crawling band regime (2025-)"),
    "TRY=X": (None, "managed depreciation"),
    "PKR=X": (None, "managed"),
    "LKR=X": (None, "managed float"),
    "MWK=X": (None, "de-facto peg ~1,700-1,750 with large parallel premium"),
    "MZN=X": (None, "de-facto peg ~63-64"),
    "BOB=X": (None, "peg broken Jul-2026"),
    "CUP=X": (None, "official 24; informal market far weaker (not tradeable)"),
}


def series(src: str, sid: str) -> pd.Series:
    if src == "fred":
        return fred(sid)
    if src == "chf":
        usdchf = fred("DEXSZUS")  # CHF per USD
        usdeur = fred("DEXUSEU")  # USD per EUR
        eurchf = (usdchf * usdeur).dropna()  # CHF per EUR
        return 1 / eurchf  # EUR value of 1 CHF
    s = yf_close(sid, start="2000-01-01", auto_adjust=False)[sid].dropna()
    return s


def main():
    rows = []
    for label, src, sid, d, quote in EVENTS:
        try:
            s = series(src, sid)
        except Exception as e:  # noqa: BLE001  (e.g. discontinued FRED series)
            rows.append({"event": label, "date": d, "error": f"series unavailable: {sid}"})
            continue
        v = s if quote == "usd_per_local" else 1 / s  # USD (or EUR) value of one unit of local currency
        v = v.dropna()
        t = pd.Timestamp(d)
        pre = v[v.index < t]
        if len(pre) < 6:
            rows.append({"event": label, "date": d, "error": "no pre data"})
            continue
        p0 = pre.iloc[-5]
        def at(days):
            w = v[v.index >= t + pd.Timedelta(days=days)]
            return float(w.iloc[0]) if len(w) else np.nan
        post = v[v.index >= t]
        rows.append({
            "event": label, "date": d, "source": f"{src}:{sid}",
            "day1_%": round(100 * (post.iloc[1] / p0 - 1), 1) if len(post) > 1 else np.nan,
            "1m_%": round(100 * (at(30) / p0 - 1), 1),
            "3m_%": round(100 * (at(91) / p0 - 1), 1),
            "12m_%": round(100 * (at(365) / p0 - 1), 1),
            "max_loss_12m_%": round(100 * (v[(v.index >= t) & (v.index <= t + pd.Timedelta(days=365))].min() / p0 - 1), 1),
            "prior_12m_vol_%": round(100 * float(np.log(v[(v.index < t) & (v.index >= t - pd.Timedelta(days=365))]).diff().std() * np.sqrt(252)), 1),
        })
    br = pd.DataFrame(rows)
    br.to_csv(OUT / "fx_peg_breaks.csv", index=False)
    print(br.to_string())

    mon = []
    px = yf_close(list(MONITOR), start="2024-01-01", auto_adjust=False)
    for t, (peg, note) in MONITOR.items():
        s = px[t].dropna()
        if s.empty:
            continue
        last = float(s.iloc[-1])
        yr = s[s.index <= s.index[-1] - pd.Timedelta(days=365)]
        r = np.log(s).diff().dropna()
        mon.append({"ticker": t, "regime": note, "last": round(last, 4),
                    "dev_from_peg_%": round(100 * (last / peg - 1), 2) if peg else None,
                    "chg_12m_%_(+ = local weaker)": round(100 * (last / float(yr.iloc[-1]) - 1), 1) if len(yr) else None,
                    "realised_vol_1y_%": round(100 * float(r.iloc[-252:].std() * np.sqrt(252)), 1)})
    mon = pd.DataFrame(mon)
    mon.to_csv(OUT / "fx_peg_monitor.csv", index=False)
    print(mon.to_string())
    save_json({"breaks": br.to_dict(orient="records"), "monitor": mon.to_dict(orient="records")}, "fx_pegs.json")


if __name__ == "__main__":
    main()
