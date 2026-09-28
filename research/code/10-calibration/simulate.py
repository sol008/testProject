"""Toy simulations for the monthly calibrate-and-improve loop.

Every function is deterministic given its seed.  Run `python run_all.py` to
reproduce every number quoted in ../../10-calibration-and-self-improvement.md.

A  forecaster_detection  - how fast can we tell skilled from unskilled
                           forecasters with live trades only vs. live +
                           shadow book + calibration gym, vs. P&L alone?
B  permabull_trap        - why baselines must be physical (not risk-neutral)
                           and tests clustered by month.
C  peeking               - monthly t-tests vs an anytime-valid e-process.
D  improvement_loop      - naive "switch to the best recent variant" vs a
                           guarded, pre-registered, forward-validated loop.
E  drawdown_bands        - what a *normal* drawdown looks like.
F  streak_sizing         - Bayesian vs naive sizing after streaks.
G  archetype_allocation  - Beta/NIG + Thompson allocation, live vs shadow data.
H  recalibration_curves  - Platt vs isotonic as a function of sample size.
I  cusum_decay           - how long P&L-based edge-decay detection takes.
"""
from __future__ import annotations

import numpy as np
from scipy import stats

from bayes import (BetaBinomial, NormalInverseGamma, bayesian_kelly_binary,
                   kelly_binary, thompson_allocation)
from recalibration import fit_isotonic, fit_platt
from scoring import icc_oneway, log_loss

CLIP = 0.01


# ============================================================================
# helpers
# ============================================================================
def normal_mixture_eprocess(S, V, rho):
    """One-sided (lambda > 0) Gaussian-mixture test martingale for H0: drift <= 0.
    S: cumulative sum of increments; V: cumulative variance proxy; rho: mixing
    precision.  E_t = 2 sqrt(rho/(V+rho)) exp(S^2/(2(V+rho))) Phi(S/sqrt(V+rho)).
    Reject H0 the first time E_t >= 1/alpha (Ville's inequality).  With the
    variance estimated from data this is 'asymptotically' anytime-valid; the
    simulations below check its false-positive rate empirically."""
    S = np.asarray(S, float)
    V = np.asarray(V, float)
    den = V + rho
    log_e = (np.log(2) + 0.5 * np.log(rho / den) + S ** 2 / (2 * den)
             + stats.norm.logcdf(S / np.sqrt(den)))
    return np.exp(np.minimum(log_e, 700))


def _probs_above(c, h, mu_hat, sigma_b, v):
    """P(residual return over h months > c) for a forecaster with posterior
    mean mu_hat (per month), believed monthly vol sigma_b, posterior var v."""
    sd = np.sqrt(sigma_b ** 2 * h + v * h ** 2)
    return 1 - stats.norm.cdf((c - mu_hat * h) / sd)


def _score_diffs(p, q, y):
    p = np.clip(p, CLIP, 1 - CLIP)
    q = np.clip(q, CLIP, 1 - CLIP)
    dlog = np.where(y, np.log(p / q), np.log((1 - p) / (1 - q)))
    dbri = (q - y) ** 2 - (p - y) ** 2
    return dlog, dbri


# ============================================================================
# A. forecaster detection
# ============================================================================
Q_LIVE = [(1, 0.0), (3, 0.0), (3, 0.10), (3, -0.10), (6, 0.0), (6, 0.15)]
Q_SHADOW = [(1, 0.0), (3, 0.0), (3, 0.10), (3, -0.10)]
Q_GYM = [(1, 0.0)]
BUCKETS = (1, 3, 6)


def _forecaster_views(kind, mu, rng, tau):
    """Return (mu_hat, believed sigma multiplier, posterior var) for a
    forecaster type.  c = corr(signal-based mu_hat, true mu)."""
    shape = mu.shape
    if kind.startswith("skilled"):
        c = float(kind.split("_")[1])
        omega2 = tau ** 2 * (1 / c ** 2 - 1)
        s = mu + rng.normal(0, np.sqrt(omega2), shape)
        k = c ** 2
        return k * s, 1.0, tau ** 2 * (1 - k)
    if kind == "overconfident_0.7":
        # real signal (c = 0.7) but mu_hat doubled and vol under-estimated by 25%
        c = 0.7
        omega2 = tau ** 2 * (1 / c ** 2 - 1)
        s = mu + rng.normal(0, np.sqrt(omega2), shape)
        return 2 * c ** 2 * s, 0.75, 0.0
    if kind == "noise":  # confident but uninformative: same spread as skilled_0.5
        return rng.normal(0, 0.5 * tau, shape), 1.0, tau ** 2 * 0.75
    if kind == "noise_small":  # near the H0 boundary (tiny deviations)
        return rng.normal(0, 0.1 * tau, shape), 1.0, tau ** 2 * 0.99
    raise ValueError(kind)


def _base_kind(kind):
    return kind[:-len("_recal")] if kind.endswith("_recal") else kind


def _batched_platt(X, Y, prior_sd=0.5, iters=12):
    """MAP logistic recalibration logit p = a + b*x per row (world), with
    N(0, prior_sd^2) on a and N(1, prior_sd^2) on b.  X, Y: (worlds, n)."""
    a = np.zeros(X.shape[0])
    b = np.ones(X.shape[0])
    lam = 1 / prior_sd ** 2
    for _ in range(iters):
        eta = a[:, None] + b[:, None] * X
        mu = 1 / (1 + np.exp(-eta))
        w = mu * (1 - mu)
        r = Y - mu
        ga = r.sum(1) - lam * a
        gb = (r * X).sum(1) - lam * (b - 1)
        haa = w.sum(1) + lam
        hab = (w * X).sum(1)
        hbb = (w * X * X).sum(1) + lam
        det = haa * hbb - hab ** 2
        a = a + (hbb * ga - hab * gb) / det
        b = b + (-hab * ga + haa * gb) / det
    return a, b


def forecaster_detection(n_sims=400, months=36, universe=500, n_shadow=30, n_controls=10,
                         n_gym=200, tau=0.01, sigma=0.08,
                         kinds=("skilled_0.3", "skilled_0.5", "skilled_0.7",
                                "overconfident_0.7", "overconfident_0.7_recal",
                                "noise", "noise_small"),
                         eval_months=(3, 6, 12, 24, 36), alpha=0.05, recal_window=12,
                         min_family_n=150, seed=20260928):
    """Residual (benchmark-relative) returns: r_i(h) = mu_i*h + sigma*sum z.
    Market baseline assumes mu = 0 (efficient market for residual returns).
    Per month each forecaster: live = top-1 |mu_hat|; shadow = next 30;
    controls = 10 random others; gym = 200 random names, one 1-month question.

    '<kind>_recal' re-scores the same forecasts after a rolling, strictly
    out-of-sample Platt map fitted on the previous `recal_window` months of
    resolved 1-month questions (the calibration gym's job).

    Tests of H0 'no better than the market' (mean log-score differential <= 0):
      fixed   : one candidate-clustered t-test at month M (valid only if M was
                the single pre-registered analysis date)
      seq     : pre-registered looks at every eval month, alpha split equally
                (Bonferroni) -- valid for a scheduled review calendar
      eproc1m : anytime-valid e-process on the monthly 1-month questions
      eprocC  : anytime-valid e-process on 3-month-old cohorts (1m + 3m questions)
      pnl     : t-test / e-process on the live pick's market-hedged P&L."""
    rng = np.random.default_rng(seed)
    groups = ("live", "shadow", "controls", "gym")
    qsets = dict(live=Q_LIVE, shadow=Q_SHADOW, controls=Q_SHADOW, gym=Q_GYM)
    acc = {k: {g: {m: np.zeros((months, len(BUCKETS), 6, n_sims)) for m in ("log", "brier")}
               for g in groups} for k in kinds}
    one_month = {k: {g: np.zeros((months, 3, n_sims)) for g in groups} for k in kinds}
    pnl = {k: np.zeros((months, n_sims)) for k in kinds}
    icc_samples = {k: [] for k in kinds}
    width = dict(live=1, shadow=n_shadow, controls=n_controls, gym=n_gym)
    families = sorted({q for g in groups for q in qsets[g]})
    fam_width = {f: sum(width[g] for g in groups if f in qsets[g]) for f in families}
    recal_kinds = [k for k in kinds if k.endswith("_recal")]
    hist_x = {k: {f: np.zeros((months, n_sims, fam_width[f])) for f in families} for k in recal_kinds}
    hist_y = {k: {f: np.zeros((months, n_sims, fam_width[f])) for f in families} for k in recal_kinds}
    maps = {}
    rows = np.arange(n_sims)[:, None]
    ar = np.arange(n_sims)
    for t in range(months):
        mu = rng.normal(0, tau, (n_sims, universe))
        z = rng.normal(0, 1, (n_sims, universe, 6))
        cum = mu[..., None] * np.arange(1, 7) + sigma * np.cumsum(z, axis=2)  # (s,u,6)
        gym_idx = np.argsort(rng.random((n_sims, universe)), axis=1)[:, :n_gym]
        base_cache = {}
        for kind in kinds:
            base = _base_kind(kind)
            if base not in base_cache:
                mu_hat, sig_mult, v = _forecaster_views(base, mu, rng, tau)
                order = np.argsort(-np.abs(mu_hat), axis=1)
                top = order[:, : 1 + n_shadow]
                keys = rng.random((n_sims, universe))
                keys[rows, top] = np.inf
                ctrl = np.argsort(keys, axis=1)[:, :n_controls]
                base_cache[base] = (mu_hat, sig_mult, v, dict(
                    live=top[:, :1], shadow=top[:, 1:], controls=ctrl, gym=gym_idx))
            mu_hat, sig_mult, v, idx = base_cache[base]
            recal = kind.endswith("_recal")
            if recal:
                # one Platt map per question family, fitted only on questions
                # of that family that had resolved before month t (no look-ahead)
                # families with < min_family_n resolved questions borrow the
                # map of the data-rich 1-month family (pooling), else identity
                maps[kind] = {}
                identity = (np.zeros(n_sims), np.ones(n_sims))
                fallback = identity
                for f in families:  # sorted: the 1-month family comes first
                    hi = t - f[0]
                    lo = max(0, hi - recal_window + 1)
                    n_f = (hi - lo + 1) * fam_width[f] if hi >= 0 else 0
                    if n_f >= min_family_n:
                        X = hist_x[kind][f][lo:hi + 1].transpose(1, 0, 2).reshape(n_sims, -1)
                        Y = hist_y[kind][f][lo:hi + 1].transpose(1, 0, 2).reshape(n_sims, -1)
                        maps[kind][f] = _batched_platt(X, Y)
                        if f == families[0]:
                            fallback = maps[kind][f]
                    else:
                        maps[kind][f] = fallback
                col = {f: 0 for f in families}
            lp = idx["live"][:, 0]
            pnl[kind][t] = np.sign(mu_hat[ar, lp]) * cum[ar, lp, 0]
            for g in groups:
                ii = idx[g]
                mh = mu_hat[rows, ii]
                per_q = {"log": [], "brier": []}
                horizons = []
                for (h, c) in qsets[g]:
                    y = cum[rows, ii, h - 1] > c
                    p = _probs_above(c, h, mh, sigma * sig_mult, v)
                    if recal:
                        x_raw = np.log(np.clip(p, 1e-6, 1 - 1e-6) / np.clip(1 - p, 1e-6, 1))
                        a_map, b_map = maps[kind][(h, c)]
                        p = 1 / (1 + np.exp(-(a_map[:, None] + b_map[:, None] * x_raw)))
                        w_ = ii.shape[1]
                        c0 = col[(h, c)]
                        hist_x[kind][(h, c)][t, :, c0:c0 + w_] = x_raw
                        hist_y[kind][(h, c)][t, :, c0:c0 + w_] = y
                        col[(h, c)] = c0 + w_
                    q = 1 - stats.norm.cdf(c / (sigma * np.sqrt(h)))
                    dl, db = _score_diffs(p, q, y)
                    per_q["log"].append(dl)
                    per_q["brier"].append(db)
                    horizons.append(h)
                    if h == 1:
                        one_month[kind][g][t] = np.stack(
                            [dl.sum(1), (dl ** 2).sum(1), np.full(n_sims, dl.shape[1])])
                horizons = np.array(horizons)
                if g == "live" and t < 24 and kind in ("skilled_0.7", "noise"):
                    icc_samples[kind].append(np.stack(per_q["log"], axis=2)[:50])
                for m in ("log", "brier"):
                    D = np.stack(per_q[m], axis=2)  # (s, cands, nq)
                    for bi, b in enumerate(BUCKETS):
                        mask = horizons <= b
                        S = D[:, :, mask].sum(2)
                        n = mask.sum()
                        acc[kind][g][m][t, bi] = np.stack([
                            S.sum(1), (S ** 2).sum(1), n * S.sum(1),
                            np.full(n_sims, n ** 2 * S.shape[1]),
                            np.full(n_sims, S.shape[1]), np.full(n_sims, n * S.shape[1])])

    def clustered(tot):
        sS, sS2, snS, sn2, G, N = tot
        mean = sS / N
        var = G / (G - 1) * (sS2 - 2 * mean * snS + mean ** 2 * sn2) / N ** 2
        return mean, var, G, N

    regimes = {"live_only": ("live",), "live+shadow": ("live", "shadow", "controls"),
               "live+shadow+gym": ("live", "shadow", "controls", "gym")}
    results = {"params": dict(n_sims=n_sims, universe=universe, n_shadow=n_shadow,
                              n_controls=n_controls, n_gym=n_gym, tau=tau, sigma=sigma,
                              ic_1m={k: _ic(k, tau, sigma) for k in kinds},
                              eval_months=list(eval_months), alpha=alpha)}
    det = {}
    n_looks = len(eval_months)
    for kind in kinds:
        det[kind] = {}
        for rname, gs in regimes.items():
            for m in ("log", "brier"):
                out = []
                min_p = np.ones(n_sims)
                for M in eval_months:
                    tot = np.zeros((6, n_sims))
                    for t in range(min(M, months)):
                        a = M - t
                        bi = 2 if a >= 6 else (1 if a >= 3 else (0 if a >= 1 else None))
                        if bi is None:
                            continue
                        for g in gs:
                            tot += acc[kind][g][m][t, bi]
                    mean, var, G, N = clustered(tot)
                    pval = 1 - stats.t.cdf(mean / np.sqrt(var), np.maximum(G - 1, 1))
                    min_p = np.minimum(min_p, pval)
                    out.append(dict(month=M, fixed=float(np.mean(pval < alpha)),
                                    seq=float(np.mean(min_p < alpha / n_looks)),
                                    mean_diff_per_q=float(np.mean(mean)),
                                    questions=float(np.mean(N)), clusters=float(np.mean(G))))
                det[kind][f"{rname}|{m}"] = out
            if rname == "live_only":
                continue
            # e-process on 1-month questions
            xs, vs = [], []
            for t in range(months):
                s1 = sum(one_month[kind][g][t][0] for g in gs)
                s2 = sum(one_month[kind][g][t][1] for g in gs)
                n1 = sum(one_month[kind][g][t][2] for g in gs)
                xbar = s1 / n1
                xs.append(xbar)
                vs.append(np.maximum(s2 / n1 - xbar ** 2, 1e-12) / np.maximum(n1 - 1, 1))
            xs, vs = np.array(xs), np.array(vs)
            E = normal_mixture_eprocess(np.cumsum(xs, 0), np.cumsum(vs, 0), rho=4 * vs[0])
            crossed = np.maximum.accumulate(E >= 1 / alpha, axis=0)
            det[kind][f"{rname}|eproc1m"] = [
                dict(month=M, detect=float(np.mean(crossed[M - 1]))) for M in eval_months]
            # e-process on cohorts once their 1m and 3m questions have resolved
            xs, vs = [], []
            for t in range(months - 2):  # cohort t complete at month t + 3
                tot = sum(acc[kind][g]["log"][t, 1] for g in gs)
                mean, var, _, _ = clustered(tot)
                xs.append(mean)
                vs.append(np.maximum(var, 1e-12))
            xs, vs = np.array(xs), np.array(vs)
            E = normal_mixture_eprocess(np.cumsum(xs, 0), np.cumsum(vs, 0), rho=4 * vs[0])
            crossed = np.maximum.accumulate(E >= 1 / alpha, axis=0)
            det[kind][f"{rname}|eprocC"] = [
                dict(month=M, detect=float(np.mean(crossed[M - 3])) if M >= 3 else 0.0)
                for M in eval_months]
        # P&L of the live pick
        out = []
        P = pnl[kind]
        min_p = np.ones(n_sims)
        for M in eval_months:
            x = P[:M]
            tt = x.mean(0) / (x.std(0, ddof=1) / np.sqrt(M))
            pval = 1 - stats.t.cdf(tt, M - 1)
            min_p = np.minimum(min_p, pval)
            out.append(dict(month=M, fixed=float(np.mean(pval < alpha)),
                            seq=float(np.mean(min_p < alpha / n_looks)),
                            mean_pnl=float(np.mean(x))))
        det[kind]["pnl|ttest"] = out
        Epnl = normal_mixture_eprocess(np.cumsum(P, 0),
                                       np.arange(1, months + 1)[:, None] * sigma ** 2,
                                       rho=4 * sigma ** 2)
        crossed = np.maximum.accumulate(Epnl >= 1 / alpha, axis=0)
        det[kind]["pnl|eprocess"] = [dict(month=M, detect=float(np.mean(crossed[M - 1])))
                                     for M in eval_months]
        if icc_samples[kind]:
            arr = np.concatenate(icc_samples[kind], axis=0)
            vals = arr.reshape(-1, arr.shape[-1])
            grp = np.repeat(np.arange(vals.shape[0]), vals.shape[1])
            results.setdefault("icc_live_log", {})[kind] = icc_oneway(vals.ravel(), grp)
    for kind in maps:
        results.setdefault("final_platt_maps", {})[kind] = {
            f"h{f[0]}_c{f[1]:+.2f}": dict(a_mean=float(ab[0].mean()), b_mean=float(ab[1].mean()))
            for f, ab in maps[kind].items()}
    results["detection"] = det
    P = pnl["skilled_0.7"]
    m_, s_ = P.mean(), P.std()
    results["pnl_skilled_0.7_per_trade_sr"] = float(m_ / s_)
    results["pnl_skilled_0.7_months_for_80pct_power"] = float((2.486 / (m_ / s_)) ** 2)
    return results


def _ic(kind, tau, sigma):
    if kind.startswith("skilled") or kind.startswith("overconfident"):
        c = float(kind.split("_")[1])
    else:
        c = 0.0
    return c * tau / np.sqrt(tau ** 2 + sigma ** 2)


# ============================================================================
# B. permabull trap: risk-neutral vs physical baselines; iid vs month clusters
# ============================================================================
def permabull_trap(n_sims=2000, months=24, n_q=200, erp=0.006, sigma_m=0.045, sigma=0.08,
                   optimist_drift=0.02, eval_months=(6, 12, 24), alpha=0.05, seed=11):
    """Stocks: R = f_t + r_i, f_t ~ N(erp, sigma_m^2) common to the month.
    Questions: 'P(1-month total return > 0)' on n_q random stocks per month.
    Forecasters (no stock-specific skill at all):
      'beta_only' : knows the equity risk premium (p = physical probability)
      'optimist'  : believes every stock drifts +optimist_drift per month
    Baselines: risk-neutral q_RN = 0.5 (zero drift), physical q_P (true drift).
    Tests: naive iid t-test over questions vs month-clustered t-test."""
    rng = np.random.default_rng(seed)
    tot_sd = np.sqrt(sigma_m ** 2 + sigma ** 2)
    q_rn = 0.5
    q_p = 1 - stats.norm.cdf(-erp / tot_sd)
    p_opt = 1 - stats.norm.cdf(-optimist_drift / tot_sd)
    f = rng.normal(erp, sigma_m, (n_sims, months))
    r = rng.normal(0, sigma, (n_sims, months, n_q))
    y = (f[..., None] + r) > 0
    res = {}
    for name, p, q in (("beta_only_vs_riskneutral", q_p, q_rn),
                       ("beta_only_vs_physical", q_p, q_p),
                       ("optimist_vs_physical", p_opt, q_p)):
        dl = np.where(y, np.log(p / q), np.log((1 - p) / (1 - q)))
        rows = []
        for M in eval_months:
            d = dl[:, :M, :]
            flat = d.reshape(n_sims, -1)
            m = flat.mean(1)
            sd = flat.std(1, ddof=1)
            if np.all(sd == 0):
                p_iid = np.ones(n_sims)
                p_clu = np.ones(n_sims)
            else:
                t_iid = m / (sd / np.sqrt(flat.shape[1]))
                p_iid = 1 - stats.norm.cdf(t_iid)
                mm = d.mean(2)  # monthly means -> clusters
                t_clu = mm.mean(1) / (mm.std(1, ddof=1) / np.sqrt(M))
                p_clu = 1 - stats.t.cdf(t_clu, M - 1)
            rows.append(dict(month=M, true_expected_diff_per_q=float(
                q_p * np.log(p / q) + (1 - q_p) * np.log((1 - p) / (1 - q))),
                claim_skill_iid=float(np.mean(p_iid < alpha)),
                claim_skill_month_clustered=float(np.mean(p_clu < alpha))))
        res[name] = rows
    res["params"] = dict(q_physical=float(q_p), q_risk_neutral=q_rn, p_optimist=float(p_opt),
                         n_q=n_q, erp=erp)
    return res


# ============================================================================
# C. monthly peeking: t-test every month vs anytime-valid e-process
# ============================================================================
def peeking(n_sims=20000, months=60, sigma=0.06, sr_alt=1.0, alpha=0.05, seed=5):
    rng = np.random.default_rng(seed)
    out = {}
    for label, mu in (("null_zero_edge", 0.0), (f"edge_SR{sr_alt:g}", sr_alt * sigma / np.sqrt(12))):
        x = rng.normal(mu, sigma, (n_sims, months))
        t_idx = np.arange(1, months + 1)
        cs = np.cumsum(x, 1)
        mean = cs / t_idx
        csq = np.cumsum(x ** 2, 1)
        var = (csq - t_idx * mean ** 2) / np.maximum(t_idx - 1, 1)
        with np.errstate(divide="ignore", invalid="ignore"):
            tstat = mean / np.sqrt(var / t_idx)
        pv = np.ones_like(tstat)
        pv[:, 2:] = 1 - stats.t.cdf(tstat[:, 2:], t_idx[2:] - 1)
        peek_reject = np.maximum.accumulate(pv < alpha, axis=1)
        E = normal_mixture_eprocess(cs, t_idx * sigma ** 2, rho=6 * sigma ** 2)
        e_reject = np.maximum.accumulate(E >= 1 / alpha, axis=1)
        rows = []
        for M in (12, 24, 36, 60):
            fixed = pv[:, M - 1] < alpha
            rows.append(dict(month=M, fixed_horizon_single_test=float(fixed.mean()),
                             monthly_peeking_ttest=float(peek_reject[:, M - 1].mean()),
                             anytime_valid_eprocess=float(e_reject[:, M - 1].mean())))
        out[label] = rows
    return out


# ============================================================================
# D. naive vs guarded self-improvement loop
# ============================================================================
def improvement_loop(n_worlds=4000, months=60, K=12, e0=0.010, delta_mean=-0.001,
                     delta_sd=0.003, sigma_common=0.054, sigma_idio=0.027, seed=3,
                     validation_months=6, prior_sd=0.003, p_adopt=0.95, switch_cost=0.002):
    """K rule variants are shadow-tracked every month.  Variant k has true
    monthly edge e0 + delta_k (delta ~ N(delta_mean, delta_sd); most tweaks
    are neutral-to-harmful).  Observed shadow return x_kt = e_k + common + idio.

    Policies
      static    : never change the rule
      naive3/12 : each month switch to the variant with the best trailing
                  3 / 12-month shadow return
      guarded   : every 6 months nominate the best variant on *past* data,
                  pre-register it, then validate it on the NEXT 6 months of
                  fresh shadow data only; adopt if the posterior (skeptical
                  N(0, prior_sd^2) prior on the paired difference) gives
                  P(better) >= p_adopt; at most one change per 6 months.
      oracle    : knows the true edges.
    Returns the average true monthly edge actually run, #switches and the
    share of worlds ending on a rule worse than the original."""
    rng = np.random.default_rng(seed)
    delta = rng.normal(delta_mean, delta_sd, (n_worlds, K))
    delta[:, 0] = 0.0
    e = e0 + delta
    x = (e[:, None, :] + sigma_common * rng.normal(0, 1, (n_worlds, months, 1))
         + sigma_idio * rng.normal(0, 1, (n_worlds, months, K)))
    W = np.arange(n_worlds)
    res = {}

    def summarize(live_hist, switches):
        true_edge = e[W[:, None], live_hist]  # (worlds, months)
        net = true_edge.mean() - switches.mean() * switch_cost / months
        return dict(avg_true_edge_bp_per_month=float(true_edge.mean() * 1e4),
                    vs_static_bp_per_month=float((true_edge.mean() - e0) * 1e4),
                    vs_static_net_of_switch_cost_bp=float((net - e0) * 1e4),
                    switches_mean=float(switches.mean()),
                    end_worse_than_original=float(np.mean(e[W, live_hist[:, -1]] < e0)),
                    end_on_best=float(np.mean(live_hist[:, -1] == e.argmax(1))))

    res["static"] = summarize(np.zeros((n_worlds, months), int), np.zeros(n_worlds))
    res["oracle"] = summarize(np.tile(e.argmax(1)[:, None], (1, months)),
                              (e.argmax(1) != 0).astype(float))
    for win in (3, 12):
        live = np.zeros(n_worlds, int)
        hist = np.zeros((n_worlds, months), int)
        sw = np.zeros(n_worlds)
        for t in range(months):
            hist[:, t] = live
            if t + 1 >= win:
                trail = x[:, t + 1 - win: t + 1, :].mean(1)
                best = trail.argmax(1)
                sw += best != live
                live = best
        res[f"naive_trailing_{win}m"] = summarize(hist, sw)
    # guarded
    live = np.zeros(n_worlds, int)
    hist = np.zeros((n_worlds, months), int)
    sw = np.zeros(n_worlds)
    cand = np.full(n_worlds, -1)
    reg_t = np.full(n_worlds, -1)
    last_change = np.full(n_worlds, -999)
    for t in range(months):
        hist[:, t] = live
        # evaluate candidates whose validation window just completed
        done = (cand >= 0) & (t + 1 - reg_t >= validation_months)
        if done.any():
            wi = np.nonzero(done)[0]
            seg = [x[w, reg_t[w]: t + 1, :] for w in wi]
            d = np.array([s[:, cand[w]] - s[:, live[w]] for s, w in zip(seg, wi)])
            n = d.shape[1]
            dbar = d.mean(1)
            s2 = d.var(1, ddof=1) / n
            post_var = 1 / (1 / prior_sd ** 2 + 1 / s2)
            post_mean = post_var * (dbar / s2)
            p_better = 1 - stats.norm.cdf(-post_mean / np.sqrt(post_var))
            adopt = (p_better >= p_adopt) & (t - last_change[wi] >= 6)
            live[wi[adopt]] = cand[wi[adopt]]
            sw[wi[adopt]] += 1
            last_change[wi[adopt]] = t
            cand[wi] = -1
        # nominate every 6 months using all past data, validate on future data
        if (t + 1) % 6 == 0:
            free = cand < 0
            past = x[:, : t + 1, :].mean(1)
            past[W, live] = -np.inf
            best = past.argmax(1)
            cand[free] = best[free]
            reg_t[free] = t + 1
    res["guarded_forward_validated"] = summarize(hist, sw)
    res["params"] = dict(K=K, e0=e0, delta_mean=delta_mean, delta_sd=delta_sd,
                         paired_diff_sd=float(sigma_idio * np.sqrt(2)), months=months,
                         switch_cost_bp=switch_cost * 1e4)
    return res


# ============================================================================
# E. drawdown bands
# ============================================================================
def max_drawdown(paths):
    """paths: (n, T) of simple returns -> max drawdown per path (fraction)."""
    w = np.cumprod(1 + paths, axis=1)
    w = np.concatenate([np.ones((w.shape[0], 1)), w], axis=1)
    peak = np.maximum.accumulate(w, axis=1)
    return (1 - w / peak).max(axis=1)


def drawdown_bands(n_sims=20000, seed=17):
    rng = np.random.default_rng(seed)
    out = []
    for mu_a, vol_a in ((0.15, 0.20), (0.25, 0.25), (0.30, 0.40), (0.0, 0.25)):
        mu_m, vol_m = mu_a / 12, vol_a / np.sqrt(12)
        r = rng.normal(mu_m, vol_m, (n_sims, 60))
        for T in (12, 24, 60):
            dd = max_drawdown(r[:, :T])
            out.append(dict(model=f"normal mu={mu_a:.0%} vol={vol_a:.0%} (SR {mu_a / vol_a:.2f})",
                            months=T,
                            p50=float(np.percentile(dd, 50)), p80=float(np.percentile(dd, 80)),
                            p95=float(np.percentile(dd, 95))))
    # lumpy few-trades book: 12 trades / yr, 5% of equity at risk, +3R w.p. .35 else -1R
    f, pw, R = 0.05, 0.35, 3.0
    trades = np.where(rng.random((n_sims, 60)) < pw, f * R, -f)
    for T in (12, 24, 60):
        dd = max_drawdown(trades[:, :T])
        out.append(dict(model="12 trades/yr, 5% risk, +3R p=.35 (EV +0.4R/trade)", months=T,
                        p50=float(np.percentile(dd, 50)), p80=float(np.percentile(dd, 80)),
                        p95=float(np.percentile(dd, 95))))
    losing = np.mean(np.array([np.max(np.diff(np.flatnonzero(np.r_[1, row > 0, 1])) - 1)
                               for row in trades[:5000, :24]]) >= 5)
    return dict(bands=out, p_5plus_consecutive_losses_in_24_trades=float(losing))


# ============================================================================
# F. streaks and sizing
# ============================================================================
def streak_sizing(b=1.5, prior_mean=0.45, strengths=(20, 50), fraction=0.25):
    rows = []
    for strength in strengths:
        prior = BetaBinomial.from_mean_strength(prior_mean, strength)
        for label, wins, n in (("prior", 0, 0), ("3 wins in 3", 3, 3), ("5 wins in 5", 5, 5),
                               ("8 wins in 8", 8, 8), ("5 losses in 5", 0, 5),
                               ("12 of 24", 12, 24)):
            post = prior.update(wins, n)
            mle = wins / n if n else prior_mean
            rows.append(dict(prior_strength=strength, history=label,
                             posterior_mean=post.mean,
                             p_edge=post.prob_greater(1 / (1 + b)),
                             bayes_quarter_kelly=bayesian_kelly_binary(post, b, fraction),
                             naive_mle_quarter_kelly=fraction * kelly_binary(mle, b)))
    return dict(payoff_b=b, breakeven=1 / (1 + b), rows=rows)


# ============================================================================
# G. archetype allocation: live-only vs shadow-informed
# ============================================================================
def archetype_allocation(n_worlds=1000, years=3, live_per_year=18, shadow_per_month=15,
                         true_means=(-0.05, 0.05, 0.15, 0.25), sd=1.2, shadow_weight=0.5,
                         shadow_haircut=0.05, seed=23):
    """Per-trade returns in R-multiples.  NIG posterior per archetype, skeptical
    prior mean 0 worth 10 trades.  Live trades are assigned by Thompson draws
    (floor 10 %, cap 50 %).  'shadow' adds paper trades from each archetype's
    top ideas, down-weighted (power prior, weight 0.5) and haircut."""
    rng = np.random.default_rng(seed)
    mu = np.array(true_means)
    K = len(mu)
    best = int(mu.argmax())
    res = {}
    for mode in ("live_only", "live+shadow"):
        ident = np.zeros((years,))
        wbest = np.zeros((years,))
        for w in range(n_worlds):
            post = [NormalInverseGamma.from_beliefs(0.0, 10, sd, 10) for _ in range(K)]
            weights = np.full(K, 1 / K)
            for yr in range(years):
                for m in range(12):
                    n_live = rng.binomial(live_per_year, 1 / 12)
                    draws = np.column_stack([p.mu_posterior().rvs(400, random_state=rng)
                                             for p in post])
                    alloc = thompson_allocation(draws, weights)
                    weights = alloc["weights"]
                    if n_live:
                        arms = rng.choice(K, size=n_live, p=weights)
                        for a in arms:
                            post[a] = post[a].update([rng.normal(mu[a], sd)])
                    if mode == "live+shadow":
                        for a in range(K):
                            xs = rng.normal(mu[a] - shadow_haircut, sd, shadow_per_month)
                            # power prior: shadow evidence counts at shadow_weight
                            p = post[a]
                            n = shadow_per_month * shadow_weight
                            xbar = xs.mean()
                            ss = shadow_weight * np.sum((xs - xbar) ** 2)
                            kn = p.kappa + n
                            post[a] = NormalInverseGamma(
                                (p.kappa * p.mu0 + n * xbar) / kn, kn, p.a + n / 2,
                                p.b + 0.5 * ss + p.kappa * n * (xbar - p.mu0) ** 2 / (2 * kn))
                means = np.array([p.mu0 for p in post])
                ident[yr] += means.argmax() == best
                wbest[yr] += weights[best]
        res[mode] = [dict(year=y + 1, p_identify_best=float(ident[y] / n_worlds),
                          weight_on_best=float(wbest[y] / n_worlds)) for y in range(years)]
    res["params"] = dict(true_means=list(true_means), sd=sd, live_per_year=live_per_year,
                         shadow_per_month=shadow_per_month, shadow_weight=shadow_weight)
    return res


# ============================================================================
# H. recalibration learning curves
# ============================================================================
def miscalibration_lr_test(p, y, eps=1e-4):
    """Likelihood-ratio test of H0: the identity map (a=0, b=1) is correct,
    vs the unpenalised logistic recalibration. Returns the chi2(2) p-value.
    Used as the gate: only adopt a recalibration map when this fires."""
    from scoring import calibration_slope_intercept, expit
    p = np.clip(np.asarray(p, float), eps, 1 - eps)
    y = np.asarray(y, float)
    fit = calibration_slope_intercept(p, y)
    x = np.log(p / (1 - p))
    p1 = np.clip(expit(fit["a"] + fit["b"] * x), eps, 1 - eps)
    ll0 = np.sum(y * np.log(p) + (1 - y) * np.log(1 - p))
    ll1 = np.sum(y * np.log(p1) + (1 - y) * np.log(1 - p1))
    return float(stats.chi2.sf(max(0.0, 2 * (ll1 - ll0)), 2))


def recalibration_curves(n_rep=200, ns=(25, 50, 100, 150, 250, 500, 1000, 2000),
                         n_test=20000, seed=31):
    rng = np.random.default_rng(seed)
    out = {}
    scenarios = {
        # LLM-like: overconfident (slope ~0.55) and optimistic (+0.25 logit)
        "overconfident_optimistic": dict(slope=1.8, bias=0.25, noise=0.3),
        # already well calibrated: recalibration can only cost
        "well_calibrated": dict(slope=1.0, bias=0.0, noise=0.3),
    }
    for name, sc in scenarios.items():
        rows = []
        lt = rng.normal(0, 1.0, n_test)
        pt = 1 / (1 + np.exp(-lt))
        yt = rng.random(n_test) < pt
        praw_t = 1 / (1 + np.exp(-(sc["slope"] * lt + sc["bias"] + rng.normal(0, sc["noise"], n_test))))
        base_raw = log_loss(praw_t, yt)
        base_oracle = log_loss(pt, yt)
        for n in ns:
            gp, gi, gg, worse_p, worse_i, worse_g, fired = [], [], [], 0, 0, 0, 0
            for _ in range(n_rep):
                l = rng.normal(0, 1.0, n)
                pr = 1 / (1 + np.exp(-(sc["slope"] * l + sc["bias"] + rng.normal(0, sc["noise"], n))))
                y = rng.random(n) < 1 / (1 + np.exp(-l))
                pm = fit_platt(pr, y)
                im = fit_isotonic(pr, y)
                lp = log_loss(pm.apply(praw_t), yt)
                li = log_loss(im.apply(praw_t), yt)
                gate = miscalibration_lr_test(pr, y) < 0.05
                lg = lp if gate else base_raw
                fired += gate
                gp.append(base_raw - lp)
                gi.append(base_raw - li)
                gg.append(base_raw - lg)
                worse_p += lp > base_raw
                worse_i += li > base_raw
                worse_g += lg > base_raw
            rows.append(dict(n_train=n, platt_gain_nats=float(np.mean(gp)),
                             isotonic_gain_nats=float(np.mean(gi)),
                             gated_platt_gain_nats=float(np.mean(gg)),
                             platt_p_worse=worse_p / n_rep, isotonic_p_worse=worse_i / n_rep,
                             gated_p_worse=worse_g / n_rep, gate_fired=fired / n_rep))
        out[name] = dict(raw_logloss=base_raw, oracle_logloss=base_oracle,
                         max_possible_gain=base_raw - base_oracle, rows=rows)
    return out


# ============================================================================
# I. CUSUM edge-decay detection with few trades
# ============================================================================
def cusum_decay(mu_good=0.3, mu_bad=0.0, sd=1.2, trades_per_year=12, years=5,
                false_alarm_target=0.10, n_sims=20000, change_at=24, seed=41):
    rng = np.random.default_rng(seed)
    T = trades_per_year * years
    k = (mu_bad - mu_good) / sd ** 2
    mid = (mu_good + mu_bad) / 2

    def run_max(x):
        """Vectorised Page CUSUM paths (same recursion as overfitting.cusum_downshift)."""
        s = np.zeros(x.shape[0])
        stats_ = []
        for j in range(x.shape[1]):
            s = np.maximum(0, s + k * (x[:, j] - mid))
            stats_.append(s.copy())
        return np.array(stats_).T

    good = run_max(rng.normal(mu_good, sd, (n_sims, T)))
    h = float(np.quantile(good.max(1), 1 - false_alarm_target))
    x = rng.normal(mu_good, sd, (n_sims, T))
    x[:, change_at:] = rng.normal(mu_bad, sd, (n_sims, T - change_at))
    st = run_max(x)
    alarm = np.where((st >= h).any(1), (st >= h).argmax(1), -1)
    valid = alarm >= change_at
    delay = alarm[valid] - change_at
    return dict(h=h, false_alarm_5y=false_alarm_target,
                detected_within_horizon=float(np.mean(valid)),
                median_delay_trades=float(np.median(delay)) if len(delay) else None,
                p80_delay_trades=float(np.percentile(delay, 80)) if len(delay) else None,
                early_false_alarm_before_change=float(np.mean((alarm >= 0) & (alarm < change_at))),
                params=dict(mu_good=mu_good, mu_bad=mu_bad, sd=sd, change_at_trade=change_at,
                            horizon_trades=T))
