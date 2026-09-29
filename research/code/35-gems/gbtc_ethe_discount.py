"""
Track 35 — GBTC / ETHE discount-to-NAV history and the ETF-conversion catalyst.

Yahoo carries no NAV series for the Grayscale trusts, so NAV is rebuilt from the coin price and an
implied coins-per-share path:
  * coins-per-share is calibrated from the post-conversion period (when the trust traded within
    ~0.3% of NAV) as the median of close / coin price, on Yahoo's split-adjusted closes (Yahoo folds
    the July-2024 Mini-Trust spin-offs into the price series as a 0.9x split factor, so the ratio is
    continuous across the spin-off);
  * it is then decayed backwards/forwards at the sponsor fee (GBTC 2.0%/yr before 11-Jan-2024, 1.5%
    after; ETHE 2.5% throughout).
Discount D = close / (coins_per_share * coin_price) - 1.

Outputs (research/code/35-gems/output/):
  gbtc_ethe_discount_daily.csv   daily discounts (2 columns)
  gbtc_ethe_summary.csv          yearly stats + key dates
  gbtc_ethe_rules.csv            the returns of a few pre-registered entry rules
"""
from __future__ import annotations

import os
from datetime import timedelta

import numpy as np
import pandas as pd
import yfinance as yf

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUT, exist_ok=True)

TRUSTS = {
    "GBTC": dict(coin="BTC-USD", conversion="2024-01-11", calib=("2024-02-01", "2024-06-30"),
                 fee_before=0.020, fee_after=0.015,
                 events={"BlackRock files (15-Jun-2023)": "2023-06-15",
                         "DC Circuit ruling (29-Aug-2023)": "2023-08-29",
                         "SEC approval (10-Jan-2024)": "2024-01-10"}),
    "ETHE": dict(coin="ETH-USD", conversion="2024-07-23", calib=("2024-08-01", "2024-10-31"),
                 fee_before=0.025, fee_after=0.025,
                 events={"SEC 19b-4 approval (23-May-2024)": "2024-05-23",
                         "ETF launch (23-Jul-2024)": "2024-07-23"}),
}


def load(tickers):
    d = yf.download(tickers, start="2015-01-01", progress=False, auto_adjust=False, threads=True)["Close"]
    return d


def discount_series(px: pd.Series, coin: pd.Series, cfg) -> tuple[pd.Series, pd.Series]:
    df = pd.concat([px.rename("px"), coin.rename("coin")], axis=1).dropna()
    conv = pd.Timestamp(cfg["conversion"])
    c0, c1 = map(pd.Timestamp, cfg["calib"])
    ratio = (df["px"] / df["coin"])
    ref = ratio.loc[c0:c1].median()
    t_ref = c0 + (c1 - c0) / 2
    yrs = (df.index - t_ref).days / 365.25
    # fee decay: before conversion the fee was fee_before, after it fee_after
    fee = np.where(df.index < conv, cfg["fee_before"], cfg["fee_after"])
    # integrate piecewise: cps(t) = ref * exp(-fee * (t - t_ref)), with the fee that applied on each side
    # (a small approximation across the conversion date itself)
    cps = ref * np.exp(-fee * yrs)
    nav = cps * df["coin"]
    disc = df["px"] / nav - 1
    return disc.rename("discount"), pd.Series(cps, index=df.index, name="coins_per_share")


def window_return(s: pd.Series, start, end) -> float:
    s = s.dropna()
    a = s.loc[:pd.Timestamp(start)]
    b = s.loc[:pd.Timestamp(end)]
    if a.empty or b.empty:
        return np.nan
    return float(b.iloc[-1] / a.iloc[-1] - 1)


def main():
    px = load(list(TRUSTS) + [c["coin"] for c in TRUSTS.values()])
    daily = {}
    summary_rows = []
    rule_rows = []
    for t, cfg in TRUSTS.items():
        disc, cps = discount_series(px[t], px[cfg["coin"]], cfg)
        daily[t] = disc
        # sanity prints of the implied coins per share (Yahoo-adjusted; multiply by 1/0.9 before Jul-2024
        # to compare with the sponsor's published figure)
        for d in ["2021-02-01", "2022-12-30", cfg["conversion"]]:
            v = cps.loc[:pd.Timestamp(d)]
            if not v.empty:
                print(f"{t} implied coins/share {d}: {v.iloc[-1]:.6f} (x1/0.9 = {v.iloc[-1]/0.9:.6f})")
        for y, g in disc.groupby(disc.index.year):
            summary_rows.append(dict(trust=t, year=y, mean=g.mean(), min=g.min(), min_date=g.idxmin().date(),
                                     max=g.max(), max_date=g.idxmax().date(), days_le_m30=int((g <= -0.30).sum()),
                                     days_le_m40=int((g <= -0.40).sum())))
        conv = pd.Timestamp(cfg["conversion"])
        coin = px[cfg["coin"]]
        # ---- rules ----
        for thr in (-0.20, -0.30, -0.40):
            hit = disc[disc <= thr]
            if hit.empty:
                continue
            e = hit.index[0]
            r_trust = window_return(px[t], e, conv)
            r_coin = window_return(coin, e, conv)
            path = px[t].loc[e:conv].dropna()
            mdd = float((path / path.cummax() - 1).min())
            trough = disc.loc[e:conv].min()
            rule_rows.append(dict(trust=t, rule=f"first close with discount <= {thr:.0%}, hold to conversion",
                                  entry=e.date(), entry_discount=float(disc.loc[e]), exit=conv.date(),
                                  days=(conv - e).days, trust_return=r_trust, coin_return=r_coin,
                                  excess_from_discount=(1 + r_trust) / (1 + r_coin) - 1,
                                  max_drawdown_on_path=mdd, widest_discount_on_path=float(trough)))
        # hindsight: widest discount to conversion
        e = disc.loc[:conv].idxmin()
        rule_rows.append(dict(trust=t, rule="HINDSIGHT: widest discount, hold to conversion", entry=e.date(),
                              entry_discount=float(disc.loc[e]), exit=conv.date(), days=(conv - e).days,
                              trust_return=window_return(px[t], e, conv), coin_return=window_return(coin, e, conv),
                              excess_from_discount=(1 + window_return(px[t], e, conv)) / (1 + window_return(coin, e, conv)) - 1,
                              max_drawdown_on_path=np.nan, widest_discount_on_path=float(disc.loc[e])))
        # 60-day windows that fit the design's holding cap
        for label, d in cfg["events"].items():
            d = pd.Timestamp(d)
            for h in (1, 60):
                end = d + timedelta(days=h)
                rt = window_return(px[t], d - timedelta(days=1), end)
                rc = window_return(coin, d - timedelta(days=1), end)
                d0 = disc.loc[:d - timedelta(days=1)]
                d1 = disc.loc[:end]
                rule_rows.append(dict(trust=t, rule=f"event window: {label}, prior close -> +{h}d", entry=(d - timedelta(days=1)).date(),
                                      entry_discount=float(d0.iloc[-1]) if not d0.empty else np.nan, exit=end.date(), days=h + 1,
                                      trust_return=rt, coin_return=rc, excess_from_discount=(1 + rt) / (1 + rc) - 1,
                                      max_drawdown_on_path=np.nan, widest_discount_on_path=float(d1.iloc[-1]) if not d1.empty else np.nan))
        # the last 60 days before conversion
        e = conv - timedelta(days=60)
        rt, rc = window_return(px[t], e, conv), window_return(coin, e, conv)
        rule_rows.append(dict(trust=t, rule="last 60 days before conversion", entry=e.date(),
                              entry_discount=float(disc.loc[:e].iloc[-1]), exit=conv.date(), days=60, trust_return=rt,
                              coin_return=rc, excess_from_discount=(1 + rt) / (1 + rc) - 1, max_drawdown_on_path=np.nan,
                              widest_discount_on_path=float(disc.loc[e:conv].min())))
    pd.DataFrame(daily).round(4).to_csv(os.path.join(OUT, "gbtc_ethe_discount_daily.csv"))
    pd.DataFrame(summary_rows).round(4).to_csv(os.path.join(OUT, "gbtc_ethe_summary.csv"), index=False)
    rules = pd.DataFrame(rule_rows).round(4)
    rules.to_csv(os.path.join(OUT, "gbtc_ethe_rules.csv"), index=False)
    pd.set_option("display.width", 250, "display.max_columns", 20)
    print(pd.DataFrame(summary_rows).round(3).to_string(index=False))
    print(rules.to_string(index=False))


if __name__ == "__main__":
    main()
