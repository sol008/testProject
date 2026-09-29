"""Technical indicators used by the rules. Pure functions on pandas Series."""
from __future__ import annotations

import numpy as np
import pandas as pd


def sma(series: pd.Series, n: int) -> pd.Series:
    return series.rolling(n, min_periods=n).mean()


def rsi_wilder(close: pd.Series, n: int = 2) -> pd.Series:
    """Wilder RSI (smoothing alpha = 1/n). Needs a long history (>= 250 sessions) for the seed to wash out."""
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()
    avg_loss = loss.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi = 100.0 - 100.0 / (1.0 + rs)
    # No losses in the window -> RSI 100; no gains and no losses -> undefined (NaN)
    rsi = rsi.where(avg_loss != 0.0, np.where(avg_gain > 0.0, 100.0, np.nan))
    return rsi


def ewma_vol(close: pd.Series, span: int = 60, periods_per_year: int = 252) -> pd.Series:
    """Annualised EWMA volatility of daily log returns."""
    r = np.log(close).diff()
    return np.sqrt(periods_per_year * (r ** 2).ewm(span=span, adjust=False, min_periods=span // 2).mean())


def worst_n_session_loss(close: pd.Series, n: int = 10) -> float:
    """Most negative n-session return in the series (e.g. -0.326 for the S&P 500 over 10 sessions)."""
    ret = close / close.shift(n) - 1.0
    return float(ret.min())


def total_return(close: pd.Series, n: int) -> float:
    if len(close) <= n:
        return float("nan")
    return float(close.iloc[-1] / close.iloc[-1 - n] - 1.0)
