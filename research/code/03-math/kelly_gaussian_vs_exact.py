"""Mean-variance ('Gaussian') Kelly f = mu/sigma^2 vs the exact Kelly for skewed payoffs.

Positively skewed bets (lotteries, trend trades) are UNDER-bet by mu/sigma^2; negatively
skewed bets (crisis buys with big losses, short-option-like trades) are OVER-bet - and if the
rare loss is missing from the sample used to estimate sigma, the over-bet can be ruinous.
"""
import numpy as np
import pandas as pd

from common import CRISIS, EVENT5, OPTION, TREND, BinaryTrade, save_table

SHORT_VOL = BinaryTrade("Short-option-like (p=.95, +5% / -60%)", 0.95, 0.05, 0.60)
rows = []
for t in (CRISIS, TREND, OPTION, EVENT5, SHORT_VOL):
    fg = t.ev / t.sd ** 2
    fk = t.kelly
    skew = (t.p * (t.b - t.ev) ** 3 + t.q * (-t.a - t.ev) ** 3) / t.sd ** 3
    rows.append({"Trade": t.name, "Skewness": f"{skew:+.2f}", "Exact Kelly": f"{100 * fk:.1f}%",
                 "mu/sigma^2": f"{100 * fg:.1f}%", "Ratio": f"{fg / fk:.2f}x",
                 "Growth at mu/sigma^2 (% of max)": f"{100 * float(t.growth(fg)) / float(t.growth(fk)):.0f}%"})
# the short-option trade estimated from a calm sample that never saw the loss
calm_sd = 0.01  # a few years of small, steady gains
rows.append({"Trade": "Same short-option trade, sigma estimated from a calm sample (1%)", "Skewness": "n/a",
             "Exact Kelly": f"{100 * SHORT_VOL.kelly:.1f}%",
             "mu/sigma^2": f"{100 * 0.05 / calm_sd ** 2:.0f}%", "Ratio": f"{0.05 / calm_sd ** 2 / SHORT_VOL.kelly:.0f}x",
             "Growth at mu/sigma^2 (% of max)": "ruin (one loss wipes out)"})
df = pd.DataFrame(rows)
save_table(df, "g9_gaussian_vs_exact_kelly")
if __name__ == "__main__":
    pd.set_option("display.width", 250)
    print(df.to_string())
