"""Part 5: what is firing as of 2026-09-28 (uses caches produced by p1-p3 plus live curve/funding snapshots)."""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

import common as C
import p3_crypto as P3

MONTH = "FGHJKMNQUVXZ"


def curve_now():
    out = {}
    specs = {"CL": ["V26", "X26", "Z26", "F27", "G27", "H27"], "HO": ["V26", "X26", "Z26", "F27"],
             "RB": ["V26", "X26", "Z26", "F27"], "NG": ["V26", "X26", "Z26", "F27", "G27"], "GC": ["V26", "Z26", "G27"]}
    import yfinance as yf
    for sym, months in specs.items():
        ex = "CMX" if sym == "GC" else "NYM"
        px = {}
        for m in months:
            t = f"{sym}{m}.{ex}"
            try:
                d = yf.download(t, start="2026-09-15", progress=False, auto_adjust=False)
                if len(d):
                    c = d["Close"]
                    c = c.iloc[:, 0] if isinstance(c, pd.DataFrame) else c
                    px[m] = (str(c.index[-1].date()), round(float(c.iloc[-1]), 4))
            except Exception:  # noqa: BLE001
                pass
        keys = [k for k in months if k in px]
        slopes = {}
        for a, b in zip(keys[:-1], keys[1:]):
            gap_m = (int("20" + b[1:]) * 12 + MONTH.index(b[0])) - (int("20" + a[1:]) * 12 + MONTH.index(a[0]))
            slopes[f"{a}->{b}"] = round(100 * math.log(px[a][1] / px[b][1]) * 12 / gap_m, 1)
        out[sym] = {"prices": px, "annualised_roll_yield_%_(+=backwardation)": slopes}
    return out


def funding_now():
    out = {}
    try:
        k = C.http_get("https://futures.kraken.com/derivatives/api/v3/tickers").json()
        for x in k["tickers"]:
            if x.get("symbol") in ("PF_XBTUSD", "PF_ETHUSD"):
                # Kraken 'fundingRate' is an absolute hourly rate in USD per contract; relative = rate/markPrice
                out[f"kraken_{x['symbol']}_ann_%"] = round(100 * x["fundingRate"] / x["markPrice"] * 24 * 365, 2)
    except Exception as e:  # noqa: BLE001
        out["kraken_error"] = str(e)[:80]
    try:
        bm = C.http_get("https://www.bitmex.com/api/v1/instrument", {"symbol": "XBTUSD", "columns": "fundingRate,indicativeFundingRate"}).json()
        out["bitmex_XBTUSD_ann_%"] = round(100 * float(bm[0]["fundingRate"]) * 3 * 365, 2)
    except Exception as e:  # noqa: BLE001
        out["bitmex_error"] = str(e)[:80]
    try:
        o = C.http_get("https://www.okx.com/api/v5/public/funding-rate", {"instId": "BTC-USDT-SWAP"}).json()
        out["okx_BTC-USDT-SWAP_ann_%"] = round(100 * float(o["data"][0]["fundingRate"]) * 3 * 365, 2)
    except Exception as e:  # noqa: BLE001
        out["okx_error"] = str(e)[:80]
    try:
        d = C.http_get("https://www.deribit.com/api/v2/public/get_book_summary_by_currency", {"currency": "BTC", "kind": "future"}).json()
        now = datetime.now(timezone.utc)
        rows = []
        for x in d["result"]:
            n = x["instrument_name"]
            if "PERPETUAL" in n:
                continue
            exp = datetime.strptime(n.split("-")[1], "%d%b%y").replace(hour=8, tzinfo=timezone.utc)
            dte = (exp - now).total_seconds() / 86400
            if dte < 20:
                continue
            rows.append((n, round(dte), round(100 * ((x["mark_price"] / x["estimated_delivery_price"]) ** (365 / dte) - 1), 2)))
        out["deribit_basis_ann_%"] = sorted(rows, key=lambda r: r[1])[:4]
    except Exception as e:  # noqa: BLE001
        out["deribit_error"] = str(e)[:80]
    return out


def position_since(asset: str, rule: str):
    px = P3.load(asset)
    sig = P3.signal_series(px, rule)
    eq, T, pos = P3.backtest(px, sig, P3.BASE_COST, a="2025-01-01", b=None)
    state = int(pos.iloc[-1])
    if state == 1 and len(T):
        entry = T["entry"].iloc[-1]
        return {"state": "LONG", "current_trade_entry": str(entry.date()), "entry_px": round(float(px.loc[entry]), 0),
                "days_in_trade": int((px.index[-1] - entry).days), "open_pnl_%": round(100 * (px.iloc[-1] / px.loc[entry] - 1), 1)}
    return {"state": "FLAT", "last_exit": str(T["exit"].iloc[-1].date()) if len(T) else None}


def main():
    res = {"asof": "2026-09-28"}
    try:
        res["micro8_trend"] = json.loads((C.RES / "p1_current_signals.json").read_text())
    except Exception as e:  # noqa: BLE001
        res["micro8_trend_error"] = str(e)
    res["carry"] = json.loads((C.RES / "p2_current.json").read_text())
    res["energy_curves_yahoo"] = curve_now()
    res["crypto_state"] = json.loads((C.RES / "p3_crypto_current.json").read_text())
    res["crypto_positions"] = {f"{a.upper()} {r}": position_since(a, r) for a in ("btc", "eth")
                               for r in ("MA50", "MA100", "TSMOM28", "WMA10", "BRK20")}
    res["funding_live"] = funding_now()
    res["crypto_hist"] = json.loads((C.RES / "p3_current.json").read_text())
    C.save(res, "p5_current_all.json")
    print(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
