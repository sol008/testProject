"""Part 4: micro-futures practicalities for a $10k-$250k account.

- Contract table: multiplier, notional at the 2026-09-28 close, realised vol, $ risk per contract,
  a SPAN-like margin *estimate* (3.5 x daily sigma x notional; broker margins must be verified).
- Integer-contract sizing: contracts per account size for (a) an 8-market trend portfolio at 10% vol
  (3.5% per market), (b) a single-market trade risking 2% of the account on a 2-sigma(20d) stop.
- Gap risk: weekend and overnight gaps for futures (Yahoo continuous) vs the ETF proxies.
- Tax drag: Section 1256 60/40 vs short-term capital gains.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

import common as C

# symbol, Yahoo proxy for price, multiplier ($ per point), tick size, tick $, underlying label
CONTRACTS = [
    ("MES", "ES=F", 5.0, 0.25, 1.25, "Micro E-mini S&P 500"),
    ("MNQ", "NQ=F", 2.0, 0.25, 0.50, "Micro E-mini Nasdaq-100"),
    ("M2K", "RTY=F", 5.0, 0.10, 0.50, "Micro E-mini Russell 2000"),
    ("MGC", "GC=F", 10.0, 0.10, 1.00, "Micro Gold (10 oz)"),
    ("SIL", "SI=F", 1000.0, 0.005, 5.00, "Micro Silver (1,000 oz)"),
    ("MCL", "CL=F", 100.0, 0.01, 1.00, "Micro WTI Crude (100 bbl)"),
    ("M6E", "6E=F", 12500.0, 0.0001, 1.25, "E-micro EUR/USD (12,500 EUR)"),
    ("10Y", "^TNX", None, None, None, "Micro 10-Year Yield ($10 per bp)"),
    ("MBT", "BTC-USD", 0.1, 5.0, 0.50, "Micro Bitcoin (0.1 BTC)"),
    ("MET", "ETH-USD", 0.1, 0.50, 0.05, "Micro Ether (0.1 ETH)"),
]
ACCOUNTS = [10_000, 25_000, 50_000, 100_000, 250_000]


def contract_table():
    rows = []
    for sym, yft, mult, tick, tickd, label in CONTRACTS:
        px = C.yf_close(yft, adjusted=False)[yft].dropna()
        last = float(px.iloc[-1])
        if sym == "10Y":
            # DV01 $10/bp; 'notional-equivalent' = DV01 / (modified duration * 1bp) of a 10y par bond at the current yield
            y = last / 100
            D = (1 - (1 + y / 2) ** (-20)) / y
            notional = 10 / (D * 1e-4)
            dy = C.fred("DGS10").diff().dropna() * 100      # daily change in bp
            vol_d = float(dy.iloc[-252:].std()) * 10 / notional   # $ per day / notional
            vol_60 = float(dy.iloc[-60:].std()) * 10 / notional
        else:
            notional = last * mult
            r = np.log(px).diff().dropna()
            days = 365 if sym in ("MBT", "MET") else 252
            vol_d = float(r.iloc[-days:].std()) * (math.sqrt(days / 252) if days == 365 else 1)
            vol_60 = float(r.iloc[-60:].std()) * (math.sqrt(365 / 252) if days == 365 else 1)
        ann = vol_d * math.sqrt(252)
        rows.append({"contract": sym, "description": label, "price": round(last, 4 if sym == "M6E" else 2),
                     "notional_$": round(notional), "vol_1y_ann_%": round(100 * ann, 1), "vol_60d_ann_%": round(100 * vol_60 * math.sqrt(252), 1),
                     "$vol_per_contract_yr": round(notional * ann), "$1sd_day": round(notional * vol_d),
                     "est_margin_$ (3.5 x daily sd)": round(3.5 * notional * vol_d)})
    return pd.DataFrame(rows).set_index("contract")


def sizing_tables(ct: pd.DataFrame):
    # (a) 8-market trend portfolio at 10% vol -> 3.5% annual vol budget per market
    per_mkt = 0.10 / math.sqrt(8)
    rows = []
    for acct in ACCOUNTS:
        row = {"account_$": acct}
        for sym in ["MES", "MNQ", "MGC", "MCL", "10Y", "M6E", "MBT"]:
            target = acct * per_mkt
            n = target / ct.loc[sym, "$vol_per_contract_yr"]
            row[sym] = round(n, 2)
        rows.append(row)
    A = pd.DataFrame(rows).set_index("account_$")
    # (b) single-market trade, 2% of account at risk on a stop 2 x 20-day daily sd away (gap-adjusted x1.5)
    rows = []
    for acct in ACCOUNTS:
        row = {"account_$": acct}
        for sym in ["MES", "MNQ", "M2K", "MGC", "MCL", "10Y", "M6E", "MBT", "MET"]:
            risk_per = ct.loc[sym, "$1sd_day"] * math.sqrt(1) * 2 * 1.5
            row[sym] = int(math.floor(0.02 * acct / risk_per))
        rows.append(row)
    B = pd.DataFrame(rows).set_index("account_$")
    return A, B


def gap_stats():
    rows = []
    for name, t in [("ES=F (S&P fut)", "ES=F"), ("SPY (ETF)", "SPY"), ("GC=F (gold fut)", "GC=F"), ("GLD (ETF)", "GLD"),
                    ("CL=F (crude fut)", "CL=F"), ("USO (ETF)", "USO"), ("ZN=F (10y fut)", "ZN=F"), ("TLT (ETF)", "TLT"),
                    ("BTC=F (CME BTC fut)", "BTC=F"), ("IBIT (spot BTC ETF)", "IBIT"), ("6E=F (EUR fut)", "6E=F")]:
        df = C.yf_ohlc(t, adjusted=False).loc["2018-01-01":]
        df = df[(df["Open"] > 0) & (df["Close"] > 0)]
        gap = np.log(df["Open"] / df["Close"].shift(1)).dropna()
        cc = np.log(df["Close"] / df["Close"].shift(1)).dropna()
        dow = gap.index.dayofweek
        wk = gap[dow == 0]
        wd = gap[dow != 0]
        sd = cc.std()
        rows.append({"instrument": name, "n": len(gap), "daily_sd_%": round(100 * sd, 2),
                     "weekday_gap_p99_abs_%": round(100 * wd.abs().quantile(0.99), 2),
                     "monday_gap_p99_abs_%": round(100 * wk.abs().quantile(0.99), 2),
                     "worst_gap_%": round(100 * gap.min(), 1), "worst_gap_date": str(gap.idxmin().date()),
                     "share_gaps_>2sd_%": round(100 * (gap.abs() > 2 * sd).mean(), 2)})
    return pd.DataFrame(rows).set_index("instrument")


def tax_table():
    rows = []
    for label, st, lt, niit in [("top bracket", 0.37, 0.20, 0.038), ("24% bracket", 0.24, 0.15, 0.0), ("32% bracket + NIIT", 0.32, 0.15, 0.038)]:
        r1256 = 0.6 * lt + 0.4 * st + niit
        rst = st + niit
        for pre in [0.05, 0.10, 0.20]:
            rows.append({"bracket": label, "pre_tax_return_%": 100 * pre, "1256_rate_%": round(100 * r1256, 1),
                         "short_term_rate_%": round(100 * rst, 1),
                         "after_tax_1256_%": round(100 * pre * (1 - r1256), 2), "after_tax_ST_%": round(100 * pre * (1 - rst), 2),
                         "1256_advantage_pp": round(100 * pre * (rst - r1256), 2)})
    return pd.DataFrame(rows)


def main():
    pd.set_option("display.width", 250)
    ct = contract_table()
    A, B = sizing_tables(ct)
    G = gap_stats()
    T = tax_table()
    C.save(ct, "p4_contracts.csv")
    C.save(A, "p4_sizing_trend8.csv")
    C.save(B, "p4_sizing_single_trade.csv")
    C.save(G, "p4_gaps.csv")
    C.save(T, "p4_tax.csv")
    print(ct.to_string())
    print("contracts per market for an 8-market trend book at 10% vol (fractional = cannot hold exactly):")
    print(A.to_string())
    print("contracts for a single trade risking 2% of the account on a 2-sd (x1.5 gap) stop:")
    print(B.to_string())
    print(G.to_string())
    print(T.to_string())


if __name__ == "__main__":
    main()
