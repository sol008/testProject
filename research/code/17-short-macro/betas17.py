"""2026 war-regime sensitivities: daily-return betas and correlations of candidate 'oil unwind' instruments to USO
(Mar 2 - Sep 28, 2026), plus the same over 2022 (Russia war) for comparison. Used to size/choose expressions."""
from __future__ import annotations

import numpy as np
import pandas as pd

from lib17 import SCRATCH, asset_panel

P = asset_panel()
ASSETS = ["SPX", "QQQ", "IWM", "TLT", "GOLD", "UUP", "BTC", "XLE", "JETS", "DAL", "UAL", "LUV", "INDA", "EIDO", "EEM", "FXY", "BNO"]


def betas(a: str, b: str):
    df = pd.DataFrame({k: P[k] for k in ["USO"] + ASSETS}).loc[a:b].pct_change().dropna(how="all")
    rows = []
    for k in ASSETS:
        x = df[["USO", k]].dropna()
        if len(x) < 30:
            continue
        beta = np.cov(x[k], x["USO"])[0, 1] / x["USO"].var()
        rows.append({"asset": k, "beta_to_USO": beta, "corr": x.corr().iloc[0, 1], "vol_ann%": x[k].std() * np.sqrt(252) * 100,
                     "n": len(x)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    b26 = betas("2026-03-02", "2026-09-28")
    b22 = betas("2022-02-24", "2022-12-30")
    m = b26.merge(b22, on="asset", suffixes=("_2026", "_2022"))
    print(m.round(3).to_string(index=False))
    m.to_csv(SCRATCH / "betas_to_uso.csv", index=False)
