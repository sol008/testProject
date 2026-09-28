"""s08 - Bitcoin variance risk premium, 2021-03 .. 2026-09 (Deribit DVOL 30-day implied vol index vs
realised BTC volatility over the next 30 calendar days; 365-day annualisation, 24/7 trading).
Also a naive 30-day ATM straddle P&L proxy (ATM IV = k x DVOL, k = 0.95) for buyer and seller.
Access note: Deribit does not serve US persons; US-listed IBIT options are the accessible vehicle.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common14 import DATA_DIR, OUT, bs_price, save, yf_close


def main():
    dv = pd.read_csv(DATA_DIR / "deribit_dvol_btc.csv", parse_dates=["date"]).set_index("date").close.rename("dvol")
    px = yf_close("BTC-USD")
    px = px[~px.index.duplicated()]
    r = np.log(px).diff()
    rv_fwd = r[::-1].rolling(30).apply(lambda x: np.sqrt(np.mean(x ** 2) * 365), raw=True)[::-1].shift(-1) * 100
    rv_past = r.rolling(30).apply(lambda x: np.sqrt(np.mean(x ** 2) * 365), raw=True) * 100
    d = pd.concat([dv, rv_fwd.rename("rv_fwd30"), rv_past.rename("rv_past30"), px.rename("px")], axis=1).dropna(subset=["dvol", "px"])
    d["vrp"] = d.dvol - d.rv_fwd30
    d["var_swap_buyer"] = (d.rv_fwd30 ** 2 - d.dvol ** 2) / d.dvol ** 2
    rows = []
    for per, g in [("all", d)] + [(str(y), g) for y, g in d.groupby(d.index.year)]:
        g = g.dropna(subset=["rv_fwd30"])
        if len(g) < 30:
            continue
        rows.append(dict(period=per, days=len(g), mean_dvol=g.dvol.mean(), mean_rv_fwd=g.rv_fwd30.mean(),
                         mean_vrp=g.vrp.mean(), median_vrp=g.vrp.median(), p_implied_below_realised=(g.vrp < 0).mean(),
                         var_swap_buyer_mean=g.var_swap_buyer.mean()))
    t = pd.DataFrame(rows)
    save(t, "s08_btc_vrp", index=False)
    # conditional: implied minus trailing realised (is 'IV below recent RV' a cheap-vol signal for BTC?)
    g = d.dropna(subset=["rv_fwd30", "rv_past30"]).copy()
    g["gap"] = g.dvol - g.rv_past30
    g["bucket"] = pd.cut(g.gap, [-100, -10, -5, 0, 5, 10, 100])
    cond = g.groupby("bucket").agg(days=("vrp", "size"), mean_vrp=("vrp", "mean"), median_vrp=("vrp", "median"),
                                   p_implied_below_realised=("vrp", lambda x: (x < 0).mean()),
                                   var_swap_buyer=("var_swap_buyer", "mean")).reset_index()
    cond["bucket"] = cond.bucket.astype(str)
    save(cond, "s08_btc_vrp_conditional", index=False)
    print(cond.round(3).to_string(index=False))
    # straddle proxy on non-overlapping 30-day blocks
    blocks = d.iloc[::30].copy()
    res = []
    for dt0, row in blocks.iterrows():
        dt1 = dt0 + pd.Timedelta(days=30)
        if dt1 not in d.index:
            continue
        S0, S1 = row.px, d.loc[dt1, "px"]
        iv = 0.95 * row.dvol / 100
        prem = bs_price(S0, S0, 30 / 365, 0.04, 0.0, iv, "call") + bs_price(S0, S0, 30 / 365, 0.04, 0.0, iv, "put")
        pay = abs(S1 - S0)
        res.append(dict(date=dt0, long_straddle=pay / (prem * 1.02) - 1, short_straddle_pct_spot=(prem * 0.98 - pay) / S0))
    st = pd.DataFrame(res)
    st.to_csv(OUT / "s08_btc_straddles.csv", index=False, float_format="%.4f")
    summ = pd.DataFrame([dict(n=len(st), long_mean=st.long_straddle.mean(), long_median=st.long_straddle.median(),
                              long_win=(st.long_straddle > 0).mean(), short_mean_pct_spot=st.short_straddle_pct_spot.mean(),
                              short_worst_pct_spot=st.short_straddle_pct_spot.min())])
    save(summ, "s08_btc_straddle_summary", index=False)
    print(t.round(3).to_string(index=False))
    print(summ.round(4).to_string(index=False))
    print("latest DVOL", d.dvol.iloc[-1], "past-30d RV", round(d.rv_past30.iloc[-1], 1))


if __name__ == "__main__":
    main()
