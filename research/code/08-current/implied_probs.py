"""Risk-neutral probabilities P(S_T > K) = N(d2) (lognormal, strike-specific IV) for the key strikes of the
candidate structures in price_structures.py. Risk-neutral odds overstate real-world downside odds (variance/skew
risk premia) and ignore jumps; used only as a calibration anchor vs subjective estimates in the report.
"""
from __future__ import annotations

import math

import pandas as pd
from scipy.stats import norm

ASOF = pd.Timestamp("2026-09-28")
R = 0.040  # ~13w T-bill 4.06%, 6m 4.34% (FRED DGS6MO 9/24) -> use 4.0-4.3%; small effect
# (underlying, spot, expiry, strike, iv%, dividend/carry yield)
ROWS = [
    ("TLT", 78.62, "2027-03-19", 81, 13, 0.045), ("TLT", 78.62, "2027-03-19", 88, 14, 0.045),
    ("SPY", 765.61, "2027-03-19", 705, 17, 0.011), ("SPY", 765.61, "2027-03-19", 610, 25, 0.011),
    ("IBIT", 47.21, "2027-12-17", 50, 50, 0.0), ("IBIT", 47.21, "2027-12-17", 70, 48, 0.0),
    ("USO", 150.01, "2026-12-18", 135, 49, 0.0), ("USO", 150.01, "2026-12-18", 105, 53, 0.0),
    ("USO", 150.01, "2026-12-18", 165, 51, 0.0), ("USO", 150.01, "2026-12-18", 210, 57, 0.0),
    ("GLD", 377.91, "2027-03-19", 390, 26, 0.0), ("GLD", 377.91, "2027-03-19", 445, 25, 0.0),
    ("MU", 1053.98, "2027-03-19", 950, 54, 0.0005), ("MU", 1053.98, "2027-03-19", 690, 56, 0.0005),
    ("SMH", 600.01, "2027-03-19", 540, 38, 0.004), ("SMH", 600.01, "2027-03-19", 420, 43, 0.004),
    ("CCJ", 87.04, "2027-03-19", 90, 48, 0.001), ("CCJ", 87.04, "2027-03-19", 120, 49, 0.001),
    ("BX", 114.56, "2027-03-19", 120, 39, 0.04), ("BX", 114.56, "2027-03-19", 155, 40, 0.04),
    # FXY: q = yen deposit yield earned by the trust net of 0.40% fee (~1.2% - 0.4% = ~0.8%); the USD-JPY rate
    # differential then enters through (R - q), matching the FX forward.
    ("FXY", 58.22, "2027-03-19", 60, 13, 0.008), ("FXY", 58.22, "2027-03-19", 64, 16, 0.008),
]


def main():
    out = []
    for und, s, exp, k, iv, q in ROWS:
        t = (pd.Timestamp(exp) - ASOF).days / 365.0
        sig = iv / 100
        d2 = (math.log(s / k) + (R - q - 0.5 * sig * sig) * t) / (sig * math.sqrt(t))
        out.append({"underlying": und, "expiry": exp, "strike": k, "iv%": iv, "T_yrs": round(t, 2),
                    "P(S_T>K)%": round(norm.cdf(d2) * 100, 1), "P(S_T<K)%": round(norm.cdf(-d2) * 100, 1),
                    "K/S-1 %": round((k / s - 1) * 100, 1)})
    df = pd.DataFrame(out)
    print(df.to_string())
    print("\nNote FXY: q=0.8% approximates the trust's net yen yield; approximate.")


if __name__ == "__main__":
    main()
