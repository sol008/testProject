"""
Crypto cohort data: CoinMarketCap historical listings snapshots (public data-api used by their
website). We pull the full ranked list (up to 5,000 coins) on Jan-1 of each year 2014-2026 and on
the latest available date. A coin that is in a year-Y top-100 but absent from the latest snapshot
is treated as "untracked/dead" (CMC moves coins to 'untracked'/'inactive' when volume/data stops).

Also pulls long daily BTC and ETH price histories from the Coin Metrics community API
(BTC from 2010, ETH from 2015) because yfinance starts BTC only in Sep-2014 and ETH in Nov-2017.
"""
import os, time, json, requests

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
OUT = os.path.join(SCR, "crypto")
os.makedirs(OUT, exist_ok=True)
s = requests.Session()
s.headers.update({"User-Agent": "Mozilla/5.0 research"})

dates = [f"{y}-01-01" for y in range(2014, 2027)] + ["2026-09-27"]
for d in dates:
    fn = os.path.join(OUT, f"cmc_{d}.json")
    if os.path.exists(fn):
        continue
    allrows = []
    for start in (1, 5001):
        url = ("https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listings/historical"
               f"?date={d}&start={start}&limit=5000&convertId=2781")
        for attempt in range(4):
            try:
                r = s.get(url, timeout=60)
                if r.status_code == 200:
                    rows = r.json().get("data", [])
                    break
            except Exception as e:  # noqa
                print("err", d, e)
            time.sleep(5)
        else:
            rows = []
        allrows += rows
        time.sleep(1.5)
        if len(rows) < 5000:
            break
    json.dump(allrows, open(fn, "w"))
    print(d, len(allrows), flush=True)

# Coin Metrics community API: long BTC / ETH daily reference prices
for asset in ("btc", "eth"):
    fn = os.path.join(OUT, f"cm_{asset}.json")
    if os.path.exists(fn):
        continue
    url = (f"https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets={asset}"
           "&metrics=PriceUSD&frequency=1d&start_time=2010-01-01&page_size=10000")
    rows = []
    while url:
        r = s.get(url, timeout=60).json()
        rows += r.get("data", [])
        url = r.get("next_page_url")
        time.sleep(1)
    json.dump(rows, open(fn, "w"))
    print(asset, len(rows), rows[0] if rows else None)
