"""Shadow-book rules (design v3.2 §3 "Shadow ledger"): logged automatically, never emailed, no LLM.

* ST-1b: M1's entry rule without the VIX gate (about 8 signals a year). It is the wider evidence set for
  M1 (design §3 M1 "Shadow", §7.3).
* W10: uptrend crash day (track 17; design §3 M5 "W10", §12.1). It fires on the first S&P 500 close of
  -3% or worse, declustered over 20 sessions, when the prior close is above its 200-day average. It is
  void if VIX > 45. W10 stays in the shadow book under the calendar-day reading of "60 days".
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from traderec import indicators
from traderec.modules.m1_dipbuy import as_float, closes_upto, dip_entry_check, value_on

W10_SMA_SESSIONS = 200


def st1b_entry_check(spy: pd.DataFrame, vix: pd.Series | None, date: str, cfg_m1: dict) -> dict:
    """ST-1b: `m1_entry_check` without the VIX gate (same arguments, same M1 parameters).

    The VIX close is still reported when available, but it never blocks the signal, and a missing VIX is
    not a reason. `vix` may be None. Returns {"signal", "close", "sma200", "rsi2", "vix", "reasons"}.
    """
    return dip_entry_check(spy, vix, date, cfg_m1, vix_gate=False)


def _sessions_since(index: pd.DatetimeIndex, last_trigger: pd.Timestamp, date: pd.Timestamp) -> int:
    """Sessions after `last_trigger` up to and including `date`.

    This equals the difference in session positions when both dates are sessions.
    """
    return int(((index > last_trigger) & (index <= date)).sum())


def w10_check(spx: pd.DataFrame, vix: pd.Series, date: str, last_trigger: str | None, cfg_w10: dict) -> dict:
    """W10 trigger on raw ^GSPC closes up to `date` (track 17; design §3 M5 "W10").

    Triggers when all hold:
    * ret = close[date] / close[prev] - 1 <= drop_pct (-3%), where prev is the session before `date`;
    * close[prev] > SMA200[prev] (the 200-session average ending at prev);
    * last_trigger is None, or sessions since last_trigger >= decluster_sessions (20); the sessions are
      counted after last_trigger up to and including `date`;
    * VIX[date] <= void_vix_above (45).

    Fail-closed: no ^GSPC close stamped `date`, fewer than 201 closes ("insufficient history"), or no VIX
    close stamped `date` ("vix missing") give trigger=False.

    Returns {"trigger", "ret", "prev_close", "sma200_prev", "vix", "reasons"}. `reasons` lists the
    conditions that held when it triggers, and the ones that failed otherwise.
    """
    ts = pd.Timestamp(date)
    vix_value = value_on(vix, ts)
    out: dict[str, Any] = {"trigger": False, "ret": None, "prev_close": None, "sma200_prev": None,
                           "vix": vix_value, "reasons": []}

    close = closes_upto(spx["close"], ts)
    if close.empty or close.index[-1] != ts:
        out["reasons"] = [f"no ^GSPC close on {ts.date()}"]
        return out
    if len(close) < W10_SMA_SESSIONS + 1:
        out["reasons"] = ["insufficient history"]
        return out

    c, prev_close = float(close.iloc[-1]), float(close.iloc[-2])
    sma_prev = as_float(indicators.sma(close.iloc[:-1], W10_SMA_SESSIONS).iloc[-1])
    ret = c / prev_close - 1.0
    out.update(ret=ret, prev_close=prev_close, sma200_prev=sma_prev)

    drop_pct = float(cfg_w10["drop_pct"])
    decluster = int(cfg_w10["decluster_sessions"])
    void_above = float(cfg_w10["void_vix_above"])
    passed: list[str] = []
    failed: list[str] = []

    if ret <= drop_pct:
        passed.append(f"S&P 500 {ret:+.2%} <= {drop_pct:+.1%}")
    else:
        failed.append(f"S&P 500 {ret:+.2%} > {drop_pct:+.1%} (no crash day)")

    if sma_prev is None:
        failed.append(f"SMA{W10_SMA_SESSIONS} undefined at the prior close")
    elif prev_close > sma_prev:
        passed.append(f"prior close {prev_close:.2f} > SMA{W10_SMA_SESSIONS} {sma_prev:.2f}")
    else:
        failed.append(f"prior close {prev_close:.2f} <= SMA{W10_SMA_SESSIONS} {sma_prev:.2f} (no uptrend)")

    if last_trigger is None:
        passed.append("no earlier trigger")
    else:
        since = _sessions_since(close.index, pd.Timestamp(last_trigger), ts)
        if since >= decluster:
            passed.append(f"{since} sessions since the last trigger >= {decluster}")
        else:
            failed.append(f"{since} sessions since the last trigger < {decluster} (declustered)")

    if vix_value is None:
        failed.append("vix missing")
    elif vix_value <= void_above:
        passed.append(f"VIX {vix_value:.2f} <= {void_above:g}")
    else:
        failed.append(f"VIX {vix_value:.2f} > {void_above:g} (void)")

    out["trigger"] = not failed
    out["reasons"] = failed if failed else passed
    return out
