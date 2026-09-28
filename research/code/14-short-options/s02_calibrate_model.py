"""s02 - Calibrate / validate the synthetic SPX option pricer against CBOE indices built from REAL prices.

For each monthly roll (third Friday; Thursday if Friday is a holiday) we price, with the model, the
exact CBOE index positions and compare the monthly option P&L (index return minus T-bill return,
i.e. the overlay only) with the real index:
  PUT  : short 1-month ATM put, collateral = strike           -> P&L / K
  PUTY : short 1-month 2% OTM put, collateral = strike        -> P&L / K
  CNDR : short 20-delta put+call, long 5-delta put+call, collateral = 10 x max loss
  BFLY : short ATM put+call, long 5% OTM put+call,     collateral = 10 x max loss
Model settings tried: skew mode {'skew' (SKEW-index scaled), 'fixed'} x IV markup {-10,-5,0,+5}%.
The in-sample (1990-2007) fit picks the setting; 2008-2026 is the out-of-sample check.
Also fits the quoted-spread model to the 2026-09-28 SPX snapshot.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import optmodel as om
from common14 import OUT, cboe, dense, put_index, save


def third_fridays(idx: pd.DatetimeIndex) -> pd.DatetimeIndex:
    days = pd.Series(idx, index=idx)
    out = []
    for (y, mth), g in days.groupby([idx.year, idx.month]):
        fr = pd.date_range(f"{y}-{mth:02d}-01", periods=31, freq="D")
        fr = fr[(fr.month == mth) & (fr.dayofweek == 4)]
        tf = fr[2]
        # last trading day on or before the third Friday
        cand = g[g <= tf]
        if len(cand):
            out.append(cand.iloc[-1])
    return pd.DatetimeIndex(out)


def model_cycles(mk: pd.DataFrame, rolls: pd.DatetimeIndex, mode: str, markup: float) -> pd.DataFrame:
    rows = []
    for d0, d1 in zip(rolls[:-1], rolls[1:]):
        row0 = mk.loc[d0]
        S0, S1 = row0.spx, mk.loc[d1].spx
        tau = float((d1 - d0).days)
        r, q = row0.rf, row0.q
        vl = np.array([[row0.vix9d, row0.vix, row0.vix3m, row0.vix6m]])
        m = np.array([om.m_from_mode(row0.m_skew, mode)])
        t = np.array([tau])

        def px(K, kind):
            p, _ = om.price(S0, np.array([K]), t, r, q, vl, m, kind, iv_markup=markup)
            return float(p[0])

        def kd(delta, kind):
            return float(om.strike_for_delta(S0, t, r, q, vl, m, delta, kind, iv_markup=markup)[0])

        # PUT (ATM) and PUTY (2% OTM)
        Katm = S0
        p_atm = px(Katm, "put")
        put_pnl = (p_atm - max(Katm - S1, 0)) / Katm
        Ky = S0 * 0.98
        p_y = px(Ky, "put")
        puty_pnl = (p_y - max(Ky - S1, 0)) / Ky
        # CNDR
        kp20, kp5 = kd(0.20, "put"), kd(0.05, "put")
        kc20, kc5 = kd(0.20, "call"), kd(0.05, "call")
        credit = px(kp20, "put") - px(kp5, "put") + px(kc20, "call") - px(kc5, "call")
        ml = max(kp20 - kp5, kc5 - kc20)
        pay = (max(kp20 - S1, 0) - max(kp5 - S1, 0)) + (max(S1 - kc20, 0) - max(S1 - kc5, 0))
        cndr_pnl = (credit - pay) / (10 * ml)
        # BFLY
        kpw, kcw = S0 * 0.95, S0 * 1.05
        credit_b = px(S0, "put") + px(S0, "call") - px(kpw, "put") - px(kcw, "call")
        ml_b = max(S0 - kpw, kcw - S0)
        pay_b = (max(S0 - S1, 0) - max(kpw - S1, 0)) + (max(S1 - S0, 0) - max(S1 - kcw, 0))
        bfly_pnl = (credit_b - pay_b) / (10 * ml_b)
        rows.append(dict(d0=d0, d1=d1, PUT=put_pnl, PUTY=puty_pnl, CNDR=cndr_pnl, BFLY=bfly_pnl,
                         cndr_credit_over_ml=credit / (ml - credit) if ml > credit else np.nan,
                         p_atm_pct=p_atm / S0))
    return pd.DataFrame(rows).set_index("d0")


def actual_cycles(rolls: pd.DatetimeIndex, mk: pd.DataFrame) -> pd.DataFrame:
    ser = {"PUT": put_index(), "PUTY": dense(cboe("PUTY")), "CNDR": dense(cboe("CNDR")), "BFLY": dense(cboe("BFLY"))}
    rows = []
    for d0, d1 in zip(rolls[:-1], rolls[1:]):
        rf = mk.loc[d0].rf * (d1 - d0).days / 365.0
        row = {"d0": d0}
        for k, s in ser.items():
            a = s.reindex([d0, d1])
            row[k] = a.iloc[1] / a.iloc[0] - 1 - rf if a.notna().all() else np.nan
        rows.append(row)
    return pd.DataFrame(rows).set_index("d0")


def fit_spread_model():
    ch = pd.read_csv(om.SNAP)
    s = ch[(ch.ticker == "^SPX") & (ch.bid > 0) & (ch.ask > ch.bid) & ch.dte.between(14, 63)]
    s = s[((s.kind == "put") & (s.moneyness.between(0.80, 1.0))) | ((s.kind == "call") & (s.moneyness.between(1.0, 1.08)))]
    b = pd.cut(s.mid, [0, 1, 2, 3, 5, 8, 12, 20, 35, 60, 100, 200])
    tab = s.groupby(b).agg(n=("mid", "size"), mid=("mid", "median"), spread=("spread", "median"),
                           spread_pct=("spread_pct_mid", "median"))
    import statsmodels.api as sm
    fit = sm.QuantReg(s.spread, sm.add_constant(s.mid)).fit(q=0.5)
    return tab, fit.params


def main():
    mk = om.market()
    rolls = third_fridays(mk.index)
    rolls = rolls[rolls >= "1990-02-01"]
    act = actual_cycles(rolls, mk)
    results = []
    all_models = {}
    for mode in ["skew", "blend", "fixed"]:
        for markup in [-0.15, -0.10, -0.05, 0.0, 0.05]:
            mod = model_cycles(mk, rolls, mode, markup)
            all_models[(mode, markup)] = mod
            for per, a, b in [("IS 1990-2007", "1990-01-01", "2007-12-31"), ("OOS 2008-2026", "2008-01-01", "2026-12-31")]:
                for k in ["PUT", "PUTY", "CNDR", "BFLY"]:
                    j = pd.concat([mod[k].rename("model"), act[k].rename("actual")], axis=1).loc[a:b].dropna()
                    if len(j) < 12:
                        continue
                    results.append(dict(mode=mode, markup=markup, period=per, index=k, n=len(j),
                                        model_mean=j.model.mean(), actual_mean=j.actual.mean(),
                                        diff=j.model.mean() - j.actual.mean(),
                                        diff_t=(j.model - j.actual).mean() / ((j.model - j.actual).std() / np.sqrt(len(j))),
                                        corr=j.corr().iloc[0, 1],
                                        model_hit=(j.model > 0).mean(), actual_hit=(j.actual > 0).mean(),
                                        model_worst=j.model.min(), actual_worst=j.actual.min()))
    res = pd.DataFrame(results)
    save(res, "model_calibration_vs_cboe", index=False)
    # score: IS mean abs diff across indices, scaled by each index's IS mean abs actual
    isr = res[res.period.str.startswith("IS")].copy()
    isr["abs_diff_bp"] = (isr["diff"].abs() * 1e4)
    score = isr.groupby(["mode", "markup"]).abs_diff_bp.mean().sort_values()
    print("IS mean |model - actual| monthly overlay return (bp), by setting:\n", score.round(1).to_string())
    best = score.index[0]
    print("best setting:", best)
    with pd.option_context("display.width", 200, "display.max_columns", 20):
        print(res[(res["mode"] == best[0]) & (res.markup == best[1])].round(4).to_string(index=False))
        print(res[(res["mode"] == "fixed") & (res.markup == 0.0)].round(4).to_string(index=False))
    tab, params = fit_spread_model()
    print(tab.round(3).to_string())
    print("spread = a + b*mid (median regression):", params.round(4).to_dict())
    tab.to_csv(OUT / "spx_spread_by_premium_20260928.csv", float_format="%.4f")
    pd.Series({"best_mode": best[0], "best_markup": best[1], "spread_a": params.iloc[0], "spread_b": params.iloc[1]}).to_csv(
        OUT / "model_settings.csv")
    # save the monthly model/actual series for the chosen setting
    mod = all_models[best]
    j = pd.concat({"model": mod[["PUT", "PUTY", "CNDR", "BFLY"]], "actual": act}, axis=1)
    j.to_csv(OUT / "model_vs_actual_monthly.csv", float_format="%.5f")


if __name__ == "__main__":
    main()
