"""Sanity tests for the reference implementation.

    python test_reference.py        (or: python -m pytest test_reference.py)
"""
from __future__ import annotations

import os
import tempfile

import numpy as np

import bayes
import overfitting as of
import scoring as sc
from ledger import Ledger, LedgerError
from recalibration import fit_platt
from simulate import normal_mixture_eprocess


def test_brier_and_log_basics():
    y = np.array([1, 0, 1, 1, 0])
    assert sc.brier(y.astype(float), y) == 0.0
    assert abs(sc.brier(np.full(5, 0.5), y) - 0.25) < 1e-12
    assert sc.log_score(np.full(5, 0.5), y) == np.log(0.5)


def test_murphy_and_corp_identities():
    rng = np.random.default_rng(0)
    p = rng.beta(2, 2, 2000)
    y = (rng.random(2000) < np.clip(p * 1.2 - 0.1, 0, 1)).astype(float)
    m = sc.murphy_decomposition(p, y, bins=10)
    assert abs(m["identity_error"]) < 1e-12
    c = sc.corp_decomposition(p, y)
    assert abs(c["brier"] - (c["mcb"] - c["dsc"] + c["unc"])) < 1e-12
    assert c["mcb"] >= 0 and c["dsc"] >= 0


def test_log_score_diff_is_kelly_growth():
    # Kelly bettor with belief p buys p of wealth in YES contracts priced q and
    # 1-p in NO contracts priced 1-q; wealth multiplier = p/q or (1-p)/(1-q).
    rng = np.random.default_rng(1)
    p = rng.uniform(0.05, 0.95, 500)
    q = rng.uniform(0.05, 0.95, 500)
    y = (rng.random(500) < 0.5).astype(float)
    growth = np.where(y == 1, np.log(p / q), np.log((1 - p) / (1 - q)))
    assert np.allclose(growth, sc.log_score_diff(p, q, y))


def test_calibration_slope_recovers_truth():
    rng = np.random.default_rng(2)
    l = rng.normal(0, 1.5, 20000)
    y = (rng.random(20000) < sc.expit(l)).astype(float)
    p_over = sc.expit(2.0 * l)  # overconfident: true slope is 0.5
    fit = sc.calibration_slope_intercept(p_over, y)
    assert abs(fit["b"] - 0.5) < 0.05 and abs(fit["a"]) < 0.05
    pm = fit_platt(p_over, y)
    assert abs(pm.b - 0.5) < 0.05


def test_beta_and_nig_updates():
    b = bayes.BetaBinomial.from_mean_strength(0.45, 20).update(5, 5)
    assert abs(b.mean - 14 / 25) < 1e-12
    nig = bayes.NormalInverseGamma.from_beliefs(0.0, 10, 1.0, 10)
    rng = np.random.default_rng(3)
    x = rng.normal(0.3, 1.0, 5000)
    post = nig.update(x)
    assert abs(post.mu0 - x.mean() * 5000 / 5010) < 1e-9
    assert post.prob_edge_positive() > 0.999


def test_shrinkage_and_thompson():
    eb = bayes.empirical_bayes_normal([0.5, 0.0, -0.2, 0.1], [0.5, 0.5, 0.5, 0.05])
    # the noisy +0.5 estimate is pulled much further than the precise 0.1
    assert abs(eb["theta"][0] - 0.5) > abs(eb["theta"][3] - 0.1)
    rng = np.random.default_rng(4)
    draws = rng.normal([0.0, 0.1, 0.2, 0.3], 0.1, (4000, 4))
    out = bayes.thompson_allocation(draws, floor=0.1, cap=0.5, damping=1.0, max_step=1.0)
    w = out["weights"]
    assert abs(w.sum() - 1) < 1e-9 and w.min() >= 0.1 - 1e-9 and w.max() <= 0.5 + 1e-9


def test_sharpe_inference():
    assert of.psr(0.3, 0.0, 36) > of.psr(0.3, 0.0, 12)
    sr_m = 1.2 / np.sqrt(12)
    assert of.dsr(sr_m, 36, 20, 1 / 36) < of.psr(sr_m, 0.0, 36)
    # Bailey et al. (2014): ~5 years of data allow only ~45 independent trials
    assert 4.5 < of.min_btl_years(45, 1.0) < 5.5


def test_pbo_noise_is_high():
    rng = np.random.default_rng(5)
    assert of.pbo_cscv(rng.normal(0, 1, (120, 40)))["pbo"] > 0.3


def test_eprocess_controls_false_positives_under_monthly_peeking():
    rng = np.random.default_rng(6)
    sigma = 0.06
    x = rng.normal(0.0, sigma, (4000, 60))
    E = normal_mixture_eprocess(np.cumsum(x, 1), np.arange(1, 61) * sigma ** 2, rho=6 * sigma ** 2)
    fpr = np.mean((E >= 20).any(axis=1))
    assert fpr <= 0.05


def test_ledger_tamper_and_ordering_rules():
    d = tempfile.mkdtemp()
    path = os.path.join(d, "l.jsonl")
    L = Ledger(path)
    L.append("forecast", dict(forecast_id="f1", parent_id="c1", family="gym", question="q",
                              resolution_rule="at_date", resolution_criteria={},
                              resolution_date="2026-11-01T00:00:00Z", p_raw=0.6, p_final=0.58,
                              calibration_map="identity", baseline={}),
             as_of="2026-10-01T00:00:00Z", created_at="2026-10-01T00:00:00.000Z")
    try:  # an at_date question cannot resolve early
        L.append("resolution", dict(forecast_id="f1", outcome=1, resolved_at="2026-10-15T00:00:00Z",
                                    source="x", status="resolved"),
                 as_of="2026-10-15T00:00:00Z", created_at="2026-10-15T00:00:00.000Z")
        raise AssertionError("early resolution accepted")
    except LedgerError:
        pass
    ok, _ = L.verify()
    assert ok
    lines = open(path).read().splitlines()
    open(path, "w").write(lines[0].replace('"p_final":0.58', '"p_final":0.7') + "\n")
    ok, msg = _unverified_handle(path).verify()
    assert not ok and "hash mismatch" in msg


def _unverified_handle(path):
    """A Ledger object that skips the constructor's own verification."""
    obj = Ledger.__new__(Ledger)
    obj.path = path
    return obj


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            n += 1
            print("ok ", name)
    print(f"{n} tests passed")
