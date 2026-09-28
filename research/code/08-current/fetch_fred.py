"""Pull macro / rates / credit / liquidity series from FRED's public CSV endpoint.

Output: SCRATCH/fred_<ID>.csv for each series + SCRATCH/fred_all.csv (outer-joined, raw frequencies).
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from common import SCRATCH, fred

SERIES = {
    # Policy & money market
    "DFF": "Effective fed funds", "DFEDTARU": "FF target upper", "DFEDTARL": "FF target lower", "IORB": "Interest on reserves",
    "SOFR": "SOFR", "RRPONTSYD": "ON RRP usage ($bn)", "WALCL": "Fed total assets ($mn)", "WRESBAL": "Reserve balances ($bn)",
    "WTREGEN": "Treasury General Account ($mn)", "M2SL": "M2 ($bn)",
    # Treasury curve
    "DGS1MO": "1m UST", "DGS3MO": "3m UST", "DGS6MO": "6m UST", "DGS1": "1y UST", "DGS2": "2y UST", "DGS5": "5y UST",
    "DGS10": "10y UST", "DGS20": "20y UST", "DGS30": "30y UST", "T10Y2Y": "10y-2y", "T10Y3M": "10y-3m",
    "DFII5": "5y TIPS real", "DFII10": "10y TIPS real", "DFII30": "30y TIPS real", "T5YIE": "5y breakeven", "T10YIE": "10y breakeven",
    "T5YIFR": "5y5y fwd inflation", "THREEFYTP10": "ACM/KW 10y term premium", "MORTGAGE30US": "30y mortgage rate",
    # Credit
    "BAMLH0A0HYM2": "HY OAS", "BAMLC0A0CM": "IG OAS", "BAMLH0A3HYC": "CCC OAS", "BAMLH0A1HYBB": "BB OAS",
    "BAMLC0A4CBBB": "BBB OAS", "BAMLEMCBPIOAS": "EM corp OAS", "BAMLHE00EHYIOAS": "Euro HY OAS",
    # Financial conditions / stress
    "NFCI": "Chicago Fed NFCI", "ANFCI": "Adjusted NFCI", "STLFSI4": "St Louis Fed FSI", "VIXCLS": "VIX (FRED)",
    "USEPUINDXD": "Econ policy uncertainty (daily)",
    # Inflation
    "CPIAUCSL": "CPI", "CPILFESL": "Core CPI", "PCEPI": "PCE", "PCEPILFE": "Core PCE", "PPIFIS": "PPI final demand",
    "MICH": "UMich 1y infl exp", "EXPINF1YR": "Cleveland Fed 1y exp infl",
    # Labor & activity
    "UNRATE": "Unemployment rate", "PAYEMS": "Nonfarm payrolls (k)", "ICSA": "Initial claims", "CCSA": "Continuing claims",
    "JTSJOL": "JOLTS openings", "SAHMREALTIME": "Sahm rule (real-time)", "INDPRO": "Industrial production",
    "RSAFS": "Retail sales", "UMCSENT": "UMich sentiment", "GDPC1": "Real GDP", "A191RL1Q225SBEA": "Real GDP growth q/q saar",
    "HOUST": "Housing starts", "PERMIT": "Building permits", "CSUSHPINSA": "Case-Shiller national", "TOTALSL": "Consumer credit",
    "DRCCLACBS": "Credit card delinquency rate", "DRSFRMACBS": "Mortgage delinquency rate", "DRCLACBS": "Consumer loan delinquency",
    "DRTSCILM": "SLOOS: tightening C&I large/mid", "RECPROUSM156N": "Smoothed recession prob",
    # Fiscal
    "GFDEBTN": "Federal debt ($mn)", "GFDEGDQ188S": "Debt % GDP", "FYFSGDA188S": "Deficit % GDP (FY)", "MTSDS133FMS": "Monthly surplus/deficit ($mn)",
    "A091RC1Q027SBEA": "Federal interest payments (saar $bn)", "FGRECPT": "Federal receipts",
    # FX / commodities / global
    "DTWEXBGS": "Broad USD index", "DEXJPUS": "USDJPY (H.10)", "DEXCHUS": "USDCNY (H.10)", "DEXUSEU": "EURUSD (H.10)",
    "DCOILWTICO": "WTI spot", "DCOILBRENTEU": "Brent spot", "DHHNGSP": "Henry Hub spot",
    "IRLTLT01JPM156N": "Japan 10y (monthly)", "IRLTLT01DEM156N": "Germany 10y (monthly)", "IRLTLT01GBM156N": "UK 10y (monthly)",
    "IRLTLT01ITM156N": "Italy 10y (monthly)", "IRLTLT01FRM156N": "France 10y (monthly)",
    "IR3TIB01JPM156N": "Japan 3m interbank", "ECBDFR": "ECB deposit rate",
}


def _one(sid):
    try:
        s = fred(sid, start="1950-01-01")
        s.to_csv(SCRATCH / f"fred_{sid}.csv")
        return sid, s, None
    except Exception as e:  # noqa: BLE001
        return sid, None, str(e)


def main():
    out, errs = {}, {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for sid, s, err in ex.map(_one, SERIES):
            if s is None:
                errs[sid] = err
            else:
                out[sid] = s
    df = pd.DataFrame(out)
    df.to_csv(SCRATCH / "fred_all.csv")
    summary = pd.DataFrame({
        "name": pd.Series(SERIES),
        "last_date": {k: v.index[-1].date() for k, v in out.items()},
        "last": {k: v.iloc[-1] for k, v in out.items()},
    })
    pd.set_option("display.width", 200)
    print(summary.to_string())
    print("errors:", errs)


if __name__ == "__main__":
    main()
