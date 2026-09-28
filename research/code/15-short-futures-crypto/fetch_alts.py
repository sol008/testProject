"""Download Binance spot daily klines (USDT quote) for every non-stablecoin, non-leveraged symbol in the
public archive, including delisted pairs (survivorship-free universe). Cached per symbol in SCRATCH/cache/alts.

Run: python fetch_alts.py   (about 25-40k small requests with 12 threads; resumable)
"""
from __future__ import annotations

import io
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import requests

import common as C

OUT = C.CACHE / "alts"
OUT.mkdir(exist_ok=True)
STABLE = {"USDC", "BUSD", "TUSD", "USDP", "PAX", "DAI", "FDUSD", "UST", "USTC", "USDS", "USDSB", "EUR", "GBP", "AUD", "TRY", "BRL",
          "AEUR", "EURI", "USDE", "PYUSD", "SUSD", "BKRW", "IDRT", "BIDR", "NGN", "RUB", "UAH", "ZAR", "XUSD", "USD1", "RLUSD",
          "FRAX", "PAXG", "XAUT", "WBTC", "WBETH", "BETH", "BFUSD", "USDX", "BVND", "JPY", "MXN", "PLN", "RON", "ARS", "COP", "CZK",
          "VAI", "USDJ", "GUSD", "LUSD", "USDD", "EURC"}


def candidate_symbols() -> list[str]:
    syms = C.binance_list_symbols()
    usdt = [s for s in syms if s.endswith("USDT")]
    bases = {s[:-4] for s in usdt}
    out = []
    for s in usdt:
        b = s[:-4]
        if b in STABLE:
            continue
        if b.endswith("DOWN") or b.endswith("BULL") or b.endswith("BEAR"):
            continue
        if b.endswith("UP") and b[:-2] in bases and len(b) > 3:
            continue
        out.append(s)
    return sorted(out)


def months_available(sym: str) -> list[str]:
    prefix = f"data/spot/monthly/klines/{sym}/1d/"
    r = requests.get("https://s3-ap-northeast-1.amazonaws.com/data.binance.vision",
                     params={"delimiter": "/", "prefix": prefix}, headers=C.UA, timeout=60)
    return re.findall(r"<Key>" + re.escape(prefix) + r"[A-Z0-9]+-1d-(\d{4}-\d{2})\.zip</Key>", r.text)


def fetch_symbol(sym: str) -> tuple[str, int]:
    fn = OUT / f"{sym}.csv"
    if fn.exists():
        return sym, -1
    months = months_available(sym)
    frames = []
    sess = requests.Session()
    for m in months:
        url = f"https://data.binance.vision/data/spot/monthly/klines/{sym}/1d/{sym}-1d-{m}.zip"
        for i in range(4):
            try:
                r = sess.get(url, headers=C.UA, timeout=60)
                if r.status_code == 404:
                    break
                r.raise_for_status()
                z = zipfile.ZipFile(io.BytesIO(r.content))
                frames.append(pd.read_csv(z.open(z.namelist()[0]), header=None))
                break
            except Exception:  # noqa: BLE001
                import time
                time.sleep(1 + i)
    if not frames:
        pd.DataFrame().to_csv(fn)
        return sym, 0
    df = pd.concat(frames).iloc[:, :8]
    df.columns = ["open_time", "open", "high", "low", "close", "volume", "close_time", "quote_volume"]
    ot = df["open_time"].astype("int64").values
    ot = np.where(ot > 10 ** 14, ot // 1000, ot)
    df.index = pd.to_datetime(ot, unit="ms")
    df = df[~df.index.duplicated(keep="last")].sort_index()[["open", "high", "low", "close", "volume", "quote_volume"]]
    df.to_csv(fn)
    return sym, len(df)


def main():
    syms = candidate_symbols()
    print("candidates", len(syms), flush=True)
    done = 0
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(fetch_symbol, s): s for s in syms}
        for f in as_completed(futs):
            done += 1
            try:
                s, n = f.result()
            except Exception as e:  # noqa: BLE001
                s, n = futs[f], f"ERR {e}"
            if done % 25 == 0:
                print(done, s, n, flush=True)
    print("finished", flush=True)


if __name__ == "__main__":
    main()
