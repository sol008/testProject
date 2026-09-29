"""
Track 35 — closed-end fund discounts in crashes: how wide, how fast they close, and what a rule caught.

Track 24 (f5_cef_index.py) tested a 139-fund panel with a 2-sd discount signal. This script is a small,
independent look at the *episodes* (2008-09, 2020, 2022, 2025) for 20 well-known funds whose NAV Yahoo
publishes as "X<ticker>X": the widest discount in each episode, how many sessions the discount took to
recover half-way, and the 60-session price return after (a) the hindsight trough and (b) a pre-registered
rule (first close with the discount >= 2.5 sd below its trailing-252-session mean, then a 40-session cooldown).

Outputs: output/cef_episodes.csv, output/cef_rule_trades.csv, output/cef_snapshot.csv
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import yfinance as yf

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUT, exist_ok=True)

FUNDS = ["PCN", "PTY", "PDI", "PHK", "GAB", "ADX", "CII", "UTG", "BST", "ETV", "NFJ", "EOS", "RQI", "RNP",
         "USA", "TY", "GAM", "BDJ", "EVT", "PEO"]
EPISODES = {"GFC 2008-09": ("2008-09-01", "2009-06-30"), "Covid 2020": ("2020-02-15", "2020-06-30"),
            "2022 bear": ("2022-01-01", "2022-12-31"), "Tariff shock 2025": ("2025-03-15", "2025-06-30")}
H = 60


def main():
    navs = [f"X{f}X" for f in FUNDS]
    px = yf.download(FUNDS + navs, start="2004-01-01", progress=False, auto_adjust=False, threads=True)
    close = px["Close"]
    adj = px["Adj Close"]
    ep_rows, rule_rows, snap = [], [], []
    for f in FUNDS:
        nav = close.get(f"X{f}X")
        if nav is None or nav.dropna().empty:
            print("no NAV for", f)
            continue
        df = pd.concat([close[f].rename("p"), adj[f].rename("tr"), nav.rename("nav")], axis=1)
        df["nav"] = df["nav"].where(df["nav"] > 0).ffill(limit=3)
        df = df.dropna(subset=["p", "nav"])
        df["disc"] = df["p"] / df["nav"] - 1
        # drop obvious bad NAV prints (discount outside -60%..+60%)
        df.loc[(df["disc"] < -0.6) | (df["disc"] > 0.6), "disc"] = np.nan
        df["tr"] = df["tr"].ffill()
        snap.append(dict(fund=f, date=df.index[-1].date(), discount=df["disc"].iloc[-1],
                         disc_1y_mean=df["disc"].iloc[-252:].mean(), disc_since_2010_mean=df.loc["2010":, "disc"].mean()))
        # --- episodes (hindsight trough) ---
        for name, (a, b) in EPISODES.items():
            g = df.loc[a:b, "disc"].dropna()
            if len(g) < 20:
                continue
            t = g.idxmin()
            pre = df.loc[:a, "disc"].iloc[-252:].mean()
            i = df.index.get_loc(t)
            after = df.iloc[i:i + H + 1]
            half = pre - (pre - g.min()) / 2
            rec = after.index[after["disc"] >= half]
            ep_rows.append(dict(fund=f, episode=name, trough_date=t.date(), trough_discount=float(g.min()),
                                pre_episode_discount=float(pre),
                                sessions_to_half_recover=int(df.index.get_loc(rec[0]) - i) if len(rec) else np.nan,
                                disc_60s_later=float(df["disc"].iloc[min(i + H, len(df) - 1)]),
                                price_tr_60s=float(df["tr"].iloc[min(i + H, len(df) - 1)] / df["tr"].iloc[i] - 1)))
        # --- rule: z-score of discount vs trailing 252 sessions ---
        m = df["disc"].rolling(252, min_periods=200).mean()
        s = df["disc"].rolling(252, min_periods=200).std()
        z = (df["disc"] - m) / s
        i = 0
        idx = df.index
        while i < len(df) - H - 1:
            if pd.notna(z.iloc[i]) and z.iloc[i] <= -2.5:
                e = idx[i]
                ent = df["tr"].iloc[i + 1]  # next session's close (the design buys at the next open; close is a proxy)
                ex = df["tr"].iloc[min(i + 1 + H, len(df) - 1)]
                rule_rows.append(dict(fund=f, entry=idx[i + 1].date(), z=float(z.iloc[i]), discount=float(df["disc"].iloc[i]),
                                      disc_60s=float(df["disc"].iloc[min(i + 1 + H, len(df) - 1)]),
                                      ret_60s=float(ex / ent - 1)))
                i += 40
            i += 1
    ep = pd.DataFrame(ep_rows).round(4)
    ep.to_csv(os.path.join(OUT, "cef_episodes.csv"), index=False)
    rules = pd.DataFrame(rule_rows).round(4)
    rules.to_csv(os.path.join(OUT, "cef_rule_trades.csv"), index=False)
    pd.DataFrame(snap).round(4).to_csv(os.path.join(OUT, "cef_snapshot.csv"), index=False)
    pd.set_option("display.width", 250, "display.max_columns", 20, "display.max_rows", 500)
    print(ep.groupby("episode").agg(n=("fund", "count"), trough=("trough_discount", "median"), pre=("pre_episode_discount", "median"),
                                    half_recover_sessions=("sessions_to_half_recover", "median"),
                                    ret60=("price_tr_60s", "median"), ret60_mean=("price_tr_60s", "mean")).round(3))
    print(ep.to_string(index=False))
    if not rules.empty:
        rules["year"] = pd.to_datetime(rules["entry"]).dt.year
        print("rule trades:", len(rules), "mean 60s return", round(rules["ret_60s"].mean(), 4), "median", round(rules["ret_60s"].median(), 4),
              "win rate", round((rules["ret_60s"] > 0).mean(), 3))
        print(rules.groupby("year").agg(n=("fund", "count"), mean_ret=("ret_60s", "mean"), median_ret=("ret_60s", "median"),
                                        disc=("discount", "mean"), disc60=("disc_60s", "mean")).round(3))
    print(pd.DataFrame(snap).round(3).to_string(index=False))


if __name__ == "__main__":
    main()
