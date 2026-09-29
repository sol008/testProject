"""(c) Base rates: how often has anyone, or anything, compounded at 100% a year?

1. Perfect-hindsight single stocks: every US-listed survivor in the track-07 month-end panel
   (Yahoo total-return prices, 2003-01 .. 2026-09; about 5,900 tickers still listed in Sept 2026).
   For every start month and stock with a price >= $3 and >= $1M average daily dollar volume, the
   forward 1/3/5/10-year multiple. Survivorship makes these numbers *too high* (the dead are missing).
2. World Cup Championship of Futures Trading winners 1984-2025 (real-money accounts; source:
   worldcupchampionships.com historical standings, fetched 29 Sep 2026).
Outputs: results/c1_hindsight_stocks.csv|md, results/c2_world_cup_winners.csv|md, results/c2b_world_cup_summary.csv|md
"""
from __future__ import annotations

import os
import pickle

import numpy as np
import pandas as pd

import common34 as C

PANELS = os.path.join(os.path.dirname(os.path.dirname(C.SCRATCH)), "07-multibaggers", "panels.pkl")

WORLD_CUP = [  # (year, winner, net return %)
    (1984, "Ralph Casazzone", 264.3), (1985, "Ralph Casazzone", 1283.0), (1986, "Henry Thayer", 231.0),
    (1987, "Larry Williams", 11376.0), (1988, "David Kline", 148.0), (1989, "Mike Lundgren", 176.5),
    (1990, "Mike Lundgren", 244.3), (1991, "Thomas Kobara", 200.2), (1992, "Mike Lundgren", 212.6),
    (1993, "Richard Hedreen", 173.3), (1994, "Frank Suler", 85.5), (1995, "Dennis Minogue", 219.2),
    (1996, "Reinhart Rentsch", 95.2), (1997, "Michelle Williams", 1001.0), (1998, "Jason Park", 99.3),
    (1999, "Chuck Hughes", 315.6), (2000, "Kurt Sakaeda", 595.3), (2001, "David Cash", 53.0),
    (2002, "John Holsinger", 608.1), (2003, "Int'l Cap MGMT", 88.4), (2004, "Kurt Sakaeda", 929.1),
    (2005, "Ed Twardus", 278.0), (2006, "Kevin Davey", 106.7), (2007, "Michael Cook", 249.7),
    (2008, "Andrea Unger", 671.9), (2009, "Andrea Unger", 115.4), (2010, "Andrea Unger", 239.6),
    (2011, "Tim Rea", 104.1), (2012, "Cary Kinkle", 199.6), (2013, "Victoria Grimsley", 106.0),
    (2014, "Michael Cook", 366.0), (2015, "Chuck Hughes", 309.1), (2016, "Artur Teregulov", 914.8),
    (2017, "Stefano Serafini", 217.2), (2018, "Petra Ilona Zacek", 257.9), (2019, "Sadanand Kalasabail", 266.0),
    (2020, "Stefan Seibert", 342.3), (2021, "Kevin McCormick", 253.8), (2022, "Stefan Seibert", 262.3),
    (2023, "Ivan Scherman", 491.4), (2024, "Brent Carlile", 532.3), (2025, "Tirutrade AG", 324.7),
]


def hindsight_stocks():
    p = pickle.load(open(PANELS, "rb"))
    adj, px, dv = p["adj"], p["px"], p["dvol3m"]
    elig = (px >= 3) & (dv >= 1e6)
    mret = adj.pct_change()
    rows = []
    for yrs in (1, 3, 5, 10):
        k = 12 * yrs
        fwd = adj.shift(-k) / adj
        # data hygiene (as in track 07): drop windows containing a single month above +300%
        # (Yahoo adjusted-close errors, e.g. TDS 2003-05 and CHRD's bankruptcy relisting)
        jump = mret[::-1].rolling(k, min_periods=1).max()[::-1].shift(-1)
        m = fwd.where(elig & (jump <= 3.0)).stack().dropna()
        m = m[np.isfinite(m) & (m > 0)]
        hit100 = m >= 2.0 ** yrs
        hit30 = m >= 1.3 ** yrs
        by_stock_100 = hit100.groupby(level=1).any()
        best = m.idxmax()
        rows.append({
            "horizon": f"{yrs} year{'s' if yrs > 1 else ''}",
            "stock-windows (start months x stocks)": f"{len(m):,}",
            "stocks": f"{m.index.get_level_values(1).nunique():,}",
            "share compounding >= 30%/yr": C.fmt(hit30.mean(), digits=1),
            "share compounding >= 100%/yr": C.fmt(hit100.mean(), digits=2),
            "stocks that ever did >= 100%/yr": f"{int(by_stock_100.sum()):,} ({by_stock_100.mean():.1%})",
            "best window": f"{best[1]} from {best[0]}: {m.max():,.0f}x ({m.max() ** (1 / yrs) - 1:.0%}/yr)",
            "median window": f"{m.median():.2f}x",
        })
    return C.save_table(pd.DataFrame(rows), "c1_hindsight_stocks")


def world_cup():
    df = pd.DataFrame(WORLD_CUP, columns=["year", "winner", "net return %"])
    C.save_table(df, "c2_world_cup_winners")
    r = df["net return %"] / 100
    rep = df.groupby("winner").size()
    summ = pd.DataFrame([{
        "years": len(df), "median winning return": C.fmt(r.median()),
        "lowest winning return": f"{df.loc[r.idxmin(), 'year']}: {r.min():+.0%}",
        "highest": f"{df.loc[r.idxmax(), 'year']}: {r.max():+,.0%}",
        "winning returns >= +100%": f"{int((r >= 1).sum())} of {len(df)}",
        "winning returns >= +1000%": f"{int((r >= 10).sum())} of {len(df)}",
        "repeat winners": ", ".join(f"{n} ({c})" for n, c in rep[rep > 1].items()),
    }])
    return C.save_table(summ, "c2b_world_cup_summary")


def main():
    pd.set_option("display.width", 250)
    print(world_cup().to_string())
    print(hindsight_stocks().to_string())


if __name__ == "__main__":
    main()
