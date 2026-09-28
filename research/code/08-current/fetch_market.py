"""Pull daily history for a broad cross-asset universe from yfinance.

Output: SCRATCH/market_close.csv (adjusted-close-free raw closes, wide) and
        SCRATCH/market_meta.csv (first/last date per ticker).
Usage:  python fetch_market.py
"""
from __future__ import annotations

import sys
import time

import pandas as pd
import yfinance as yf

from common import SCRATCH

UNIVERSE = {
    # --- US equity indices / ETFs
    "^GSPC": "S&P 500", "^NDX": "Nasdaq 100", "^IXIC": "Nasdaq Composite", "^RUT": "Russell 2000",
    "^DJI": "Dow Jones", "SPY": "SPY", "RSP": "S&P 500 Equal Weight ETF", "QQQ": "QQQ", "IWM": "IWM",
    "MGK": "Vanguard Mega Cap Growth", "SPHB": "S&P High Beta", "SPLV": "S&P Low Vol", "ARKK": "ARK Innovation",
    "XLK": "Tech", "XLF": "Financials", "XLE": "Energy", "XLV": "Health Care", "XLI": "Industrials",
    "XLU": "Utilities", "XLP": "Staples", "XLY": "Discretionary", "XLB": "Materials", "XLRE": "Real Estate",
    "XLC": "Comm Services", "SMH": "Semis ETF", "SOXX": "Semis ETF (iShares)", "IGV": "Software ETF",
    "KRE": "Regional banks", "KBE": "Banks", "XHB": "Homebuilders", "ITB": "Home construction",
    "IPO": "Renaissance IPO ETF", "MTUM": "Momentum factor", "VLUE": "Value factor", "USMV": "Min vol",
    # --- Mega caps / AI complex
    "AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "Nvidia", "GOOGL": "Alphabet", "AMZN": "Amazon",
    "META": "Meta", "TSLA": "Tesla", "AVGO": "Broadcom", "ORCL": "Oracle", "AMD": "AMD", "TSM": "TSMC ADR",
    "PLTR": "Palantir", "CRWV": "CoreWeave", "MU": "Micron", "ASML": "ASML", "SMCI": "Supermicro",
    "VRT": "Vertiv", "CEG": "Constellation Energy", "VST": "Vistra", "NBIS": "Nebius", "OKLO": "Oklo",
    # --- Private credit / alt managers / BDCs
    "BIZD": "BDC ETF", "ARCC": "Ares Capital", "OBDC": "Blue Owl Capital Corp", "BXSL": "Blackstone Secured Lending",
    "FSK": "FS KKR", "MAIN": "Main Street", "BX": "Blackstone", "APO": "Apollo", "KKR": "KKR", "ARES": "Ares Mgmt",
    "OWL": "Blue Owl", "BLK": "BlackRock",
    # --- Brokers / speculation proxies
    "HOOD": "Robinhood", "COIN": "Coinbase", "MSTR": "Strategy (MicroStrategy)", "IBIT": "iShares Bitcoin Trust",
    "ETHA": "iShares Ethereum Trust", "TQQQ": "3x QQQ", "SOXL": "3x Semis", "UVXY": "1.5x VIX ST futures",
    "SVXY": "-0.5x VIX ST futures", "VIXY": "VIX ST futures",
    # --- International equity
    "EFA": "EAFE", "EEM": "EM", "FXI": "China large cap", "KWEB": "China internet", "MCHI": "MSCI China",
    "EWJ": "Japan", "EWZ": "Brazil", "INDA": "India", "EWY": "Korea", "EWT": "Taiwan", "EWG": "Germany",
    "EWU": "UK", "EWQ": "France", "EWW": "Mexico", "ARGT": "Argentina", "TUR": "Turkey",
    "^N225": "Nikkei 225", "^STOXX50E": "Euro Stoxx 50", "^GDAXI": "DAX", "^FTSE": "FTSE 100", "^FCHI": "CAC 40",
    "^HSI": "Hang Seng", "000001.SS": "Shanghai Composite", "^KS11": "KOSPI", "^TWII": "Taiex", "^BSESN": "Sensex",
    # --- Volatility
    "^VIX9D": "VIX 9-day", "^VIX": "VIX", "^VIX3M": "VIX 3-month", "^VIX6M": "VIX 6-month", "^VIX1Y": "VIX 1-year",
    "^VVIX": "VVIX", "^SKEW": "CBOE SKEW", "^MOVE": "ICE BofA MOVE", "^OVX": "Oil VIX", "^GVZ": "Gold VIX",
    "^VXN": "Nasdaq VIX", "^RVX": "Russell VIX", "^VXEEM": "EM VIX",
    # --- Rates (CBOE yield indices are x10 historically for ^TNX etc. -> yfinance now in % units)
    "^IRX": "13w T-bill", "^FVX": "5y UST", "^TNX": "10y UST", "^TYX": "30y UST",
    "TLT": "20y+ Treasury ETF", "IEF": "7-10y Treasury ETF", "SHY": "1-3y Treasury", "TIP": "TIPS",
    "HYG": "HY corp ETF", "JNK": "HY corp ETF (SPDR)", "LQD": "IG corp ETF", "EMB": "EM USD sov", "BKLN": "Leveraged loans",
    "SRLN": "Senior loans", "MBB": "Agency MBS",
    # --- FX
    "DX-Y.NYB": "DXY", "EURUSD=X": "EURUSD", "JPY=X": "USDJPY", "CNH=X": "USDCNH", "CNY=X": "USDCNY",
    "GBPUSD=X": "GBPUSD", "CHF=X": "USDCHF", "AUDUSD=X": "AUDUSD", "CAD=X": "USDCAD", "MXN=X": "USDMXN",
    "INR=X": "USDINR", "KRW=X": "USDKRW", "TWD=X": "USDTWD", "HKD=X": "USDHKD", "SAR=X": "USDSAR",
    "DKK=X": "USDDKK", "EURDKK=X": "EURDKK", "TRY=X": "USDTRY", "ARS=X": "USDARS", "EGP=X": "USDEGP",
    "NGN=X": "USDNGN", "BRL=X": "USDBRL", "ZAR=X": "USDZAR", "EURCHF=X": "EURCHF", "EURJPY=X": "EURJPY",
    "AUDJPY=X": "AUDJPY", "MXNJPY=X": "MXNJPY", "SGD=X": "USDSGD", "AED=X": "USDAED", "QAR=X": "USDQAR",
    "PKR=X": "USDPKR", "VND=X": "USDVND", "IDR=X": "USDIDR", "PHP=X": "USDPHP",
    # --- Commodities
    "GC=F": "Gold fut", "SI=F": "Silver fut", "PL=F": "Platinum fut", "PA=F": "Palladium fut", "HG=F": "Copper fut",
    "CL=F": "WTI crude fut", "BZ=F": "Brent crude fut", "NG=F": "Henry Hub nat gas fut", "RB=F": "RBOB gasoline",
    "HO=F": "Heating oil", "ZC=F": "Corn", "ZW=F": "Wheat", "ZS=F": "Soybeans", "KC=F": "Coffee", "CC=F": "Cocoa",
    "SB=F": "Sugar", "LE=F": "Live cattle", "ALI=F": "Aluminum", "UX=F": "Uranium fut (COMEX UxC)",
    "GLD": "Gold ETF", "SLV": "Silver ETF", "GDX": "Gold miners", "GDXJ": "Junior gold miners", "SIL": "Silver miners",
    "COPX": "Copper miners", "URA": "Uranium ETF", "URNM": "Uranium miners ETF", "CCJ": "Cameco",
    "SRUUF": "Sprott Physical Uranium Trust (OTC)", "U-UN.TO": "Sprott Physical Uranium Trust (TSX)",
    "LIT": "Lithium ETF", "USO": "Oil ETF", "UNG": "Nat gas ETF", "DBC": "Commodity index", "XOP": "E&P ETF",
    "OIH": "Oil services", "REMX": "Rare earths ETF", "MP": "MP Materials",
    # --- Crypto
    "BTC-USD": "Bitcoin", "ETH-USD": "Ether", "SOL-USD": "Solana", "XRP-USD": "XRP", "DOGE-USD": "Dogecoin",
    "BNB-USD": "BNB", "USDT-USD": "Tether", "ETHBTC=X": "ETH/BTC",
    # --- Housing / consumer / misc stress
    "HYLB": "HY ETF (Xtrackers)", "ANGL": "Fallen angels", "CWB": "Convertibles", "PFF": "Preferreds",
    "SCHW": "Schwab", "JPM": "JPMorgan", "GS": "Goldman", "C": "Citi", "WAL": "Western Alliance",
    "ZION": "Zions", "NYCB": "NY Community (Flagstar)", "FLG": "Flagstar", "ALLY": "Ally", "COF": "Capital One",
    "SYF": "Synchrony", "AFRM": "Affirm", "UPST": "Upstart", "CVNA": "Carvana",
}


def download(tickers, start="1990-01-01", chunk=40):
    frames = []
    tickers = list(tickers)
    for i in range(0, len(tickers), chunk):
        batch = tickers[i:i + chunk]
        for attempt in range(3):
            try:
                df = yf.download(batch, start=start, progress=False, auto_adjust=False,
                                 group_by="column", threads=True)
                close = df["Close"] if isinstance(df.columns, pd.MultiIndex) else df[["Close"]].rename(columns={"Close": batch[0]})
                frames.append(close)
                break
            except Exception as e:  # noqa: BLE001
                print(f"batch {i} attempt {attempt} failed: {e}", file=sys.stderr)
                time.sleep(5)
    out = pd.concat(frames, axis=1)
    out = out.loc[:, ~out.columns.duplicated()]
    return out


def main():
    close = download(UNIVERSE.keys())
    close.index = pd.to_datetime(close.index).tz_localize(None) if close.index.tz is not None else pd.to_datetime(close.index)
    close.sort_index(inplace=True)
    close.to_csv(SCRATCH / "market_close.csv")
    meta = pd.DataFrame({
        "name": pd.Series(UNIVERSE),
        "first": close.apply(lambda s: s.first_valid_index()),
        "last": close.apply(lambda s: s.last_valid_index()),
        "n": close.count(),
    })
    meta.to_csv(SCRATCH / "market_meta.csv")
    missing = meta[meta["n"].fillna(0) == 0].index.tolist()
    print("rows", close.shape, "missing:", missing)
    stale = meta[(meta["last"].notna()) & (pd.to_datetime(meta["last"]) < close.index.max() - pd.Timedelta(days=7))]
    print("stale (>7d old):\n", stale[["name", "last"]])


if __name__ == "__main__":
    main()
