"""The historical replay harness (scripts/replay.py) on a synthetic market: offline and deterministic.

The market mirrors tests/test_pipeline.py: an uptrend with a -3.1% S&P day on 7 Oct 2025 (W10), a two-day
SPY dip with VIX at 25 on 14-15 Oct 2025 (M1), the Bitcoin 10-week switch on at launch (M3), and M2's first
monthly decision on 1 Oct 2025. The harness must drive the real pipeline through it without look-ahead.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from traderec import growth
from traderec.config import load_config
from traderec.data.providers import DataError
from traderec.market_calendar import is_trading_day

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "replay.py"
START, END = "2023-01-03", "2026-03-31"
SESSIONS = pd.DatetimeIndex([d for d in pd.date_range(START, END, freq="B") if is_trading_day(d)])
DIP_DAYS = [pd.Timestamp("2025-10-14"), pd.Timestamp("2025-10-15")]
W10_DAY = pd.Timestamp("2025-10-07")
LAUNCH, UNTIL = "2025-09-29", "2025-11-07"


def _load_script():
    spec = importlib.util.spec_from_file_location("replay_script", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["replay_script"] = mod
    spec.loader.exec_module(mod)
    return mod


R = _load_script()


def _walk(rng: np.random.Generator, n: int, drift: float, vol: float, start: float) -> np.ndarray:
    return start * np.exp(np.cumsum(rng.normal(drift, vol, n)))


def _bars(close: pd.Series, adj: pd.Series | None = None) -> pd.DataFrame:
    prev = close.shift(1).fillna(close.iloc[0])
    open_ = prev * 1.0005
    return pd.DataFrame({"open": open_, "high": np.maximum(open_, close) * 1.002,
                         "low": np.minimum(open_, close) * 0.998, "close": close,
                         "adj_close": close if adj is None else adj, "volume": 1_000_000.0})


def synthetic_history() -> "R.History":
    rng = np.random.default_rng(20250929)
    n = len(SESSIONS)
    r = rng.normal(0.0006, 0.004, n)
    r[SESSIONS.get_loc(W10_DAY)] = np.log(0.969)
    i0 = SESSIONS.get_loc(DIP_DAYS[0])
    r[i0:i0 + 2] = np.log(0.975)
    r[i0 + 2:i0 + 8] = np.log(1.006)
    spy = pd.Series(400.0 * np.exp(np.cumsum(r)), index=SESSIONS)
    vix = pd.Series(15.0, index=SESSIONS)
    vix.loc[DIP_DAYS] = 25.0
    bars = {"SPY": _bars(spy), "^GSPC": _bars(spy * 10.0), "^VIX": _bars(vix)}
    drifts = {"QQQ": 0.0008, "GLD": 0.0005, "USO": -0.0004, "FXE": -0.0002, "FXY": -0.0003, "FXA": 0.0002,
              "IBIT": 0.0015}
    for t, mu in drifts.items():
        bars[t] = _bars(pd.Series(_walk(rng, n, mu, 0.008, 50.0), index=SESSIONS))
    bars["IEF"] = _bars(pd.Series(_walk(rng, n, 0.0003, 0.003, 95.0), index=SESSIONS))
    days = pd.date_range("2023-01-01", END, freq="D")
    btc = pd.Series(_walk(np.random.default_rng(1234), len(days), 0.002, 0.02, 20_000.0), index=days)
    # the growth book's tickers (design v4): the Nasdaq-100, the 2x funds, the cash vehicle, Yahoo's BTC-USD
    bars["^NDX"] = _bars(spy * 30.0)
    bars["SSO"] = _bars(spy * 0.2)
    bars["QLD"] = _bars(spy * 0.15)
    bars["SGOV"] = _bars(pd.Series(100.0, index=SESSIONS))
    bars["BTC-USD"] = _bars(btc)
    tbill = pd.Series(0.04, index=pd.bdate_range("2022-12-01", END))
    tbill.loc["2025-10-01":] = 0.038            # a later print, to check the as-of rule
    return R.History(bars=bars, vix={"VIX": vix}, btc=btc, tbill=tbill,
                     flags={"note": "synthetic market"}, sources={"daily_bars:SPY": "synthetic"})


@pytest.fixture(scope="module")
def cfg():
    """The v3.3 book: the replay pins the weekly job's M3 switch, so the v4 growth book is off (tests/test_growth.py)."""
    return growth.with_enabled(load_config(), False)


@pytest.fixture(scope="module")
def history():
    return synthetic_history()


def _replay(cfg, history, root: Path, *, cut: bool = True):
    provider = R.AsOfProvider(history, cut=cut)
    capture = R.CaptureServices(root / "emails")
    rows = R.replay(cfg, provider, root / "state", LAUNCH, UNTIL, capture, progress_every=0)
    return provider, capture, rows


@pytest.fixture(scope="module")
def replayed(cfg, history, tmp_path_factory):
    root = tmp_path_factory.mktemp("replay")
    provider, capture, rows = _replay(cfg, history, root)
    return root, provider, capture, rows


# ------------------------------------------------------------------------------------------------------
# the provider and the schedule
# ------------------------------------------------------------------------------------------------------

def test_asof_provider_serves_nothing_after_the_run_date(history):
    p = R.AsOfProvider(history)
    p.set_asof("2025-10-07")
    assert p.daily_bars("SPY").index[-1] == pd.Timestamp("2025-10-07")
    assert p.vix("^VIX").index[-1] == pd.Timestamp("2025-10-07")
    assert p.btc_daily_utc().index[-1] == pd.Timestamp("2025-10-07")        # that UTC day ends at 20:00 ET
    p.set_asof("2025-10-01")
    assert p.tbill_rate() == pytest.approx(0.04)                             # the 1 Oct print is not out yet
    p.set_asof("2025-10-02")
    assert p.tbill_rate() == pytest.approx(0.038)
    assert p.served_after_asof == 0


def test_second_source_is_an_echo_and_is_counted(history):
    p = R.AsOfProvider(history)
    p.set_asof("2025-10-07")
    got = p.second_source_close("^GSPC", "2025-10-07")
    assert got == {"close": float(history.bars["^GSPC"].at[W10_DAY, "close"]), "source": R.ECHO_SOURCE}
    assert p.second_source_close("SPY", "2025-10-08") is None                # after the as-of date
    assert p.echoes == [("^GSPC", "2025-10-07")]
    with pytest.raises(DataError):
        p.daily_bars("CLX25.NYM")                                            # contango veto: not checked


def test_historical_second_sources_and_the_signal_day_check(cfg, history):
    h = R.History(bars=history.bars, vix=history.vix, btc=history.btc, tbill=history.tbill,
                  second={"SPY": ("nasdaq", history.bars["SPY"]["close"] * 1.0005),        # within 0.1%
                          "^GSPC": ("fred:SP500", history.bars["^GSPC"]["close"].drop(W10_DAY))})
    p = R.AsOfProvider(h, second_source="history")
    p.set_asof("2025-10-15")
    assert p.second_source_close("SPY", "2025-10-15")["source"] == "nasdaq"
    assert p.second_source_close("^GSPC", "2025-10-07") is None                 # no FRED print: fail closed
    assert not p.echoes and p.second_calls[-1] == ("^GSPC", "2025-10-07", None)
    chk = R.second_source_check(h, cfg, ["2025-10-15"], ["2025-10-07"]).set_index("module")
    assert bool(chk.at["M1", "ok"]) and chk.at["M1", "diff"] == pytest.approx(0.0005)
    assert not bool(chk.at["W10", "ok"]) and not bool(chk.at["W10", "rule_on_second"])


def test_schedule_is_in_production_order():
    plan = R.schedule("2025-09-27", "2025-10-06")
    assert plan[:2] == [("weekly", "2025-09-28", "2025-09-28"), ("daily", "2025-09-29", "2025-09-29")]
    i = plan.index(("monthly", "2025-09", "2025-09-30"))
    assert plan[i + 1] == ("daily", "2025-10-01", "2025-10-01")              # 08:13 ET before 22:17 ET
    assert ("weekly", "2025-10-05", "2025-10-05") in plan
    assert not [p for p in plan if p[0] == "daily" and pd.Timestamp(p[1]).weekday() > 4]


# ------------------------------------------------------------------------------------------------------
# a replay through the real pipeline
# ------------------------------------------------------------------------------------------------------

def test_replay_runs_the_pipeline_end_to_end(replayed):
    root, provider, capture, rows = replayed
    runs = pd.DataFrame(rows)
    assert set(runs["status"]) <= {"ok", "no_session"}, runs[runs["status"] == "exception"]["error"].tolist()
    assert list(runs[runs["kind"] == "monthly"]["date"]) == ["2025-09", "2025-10"]
    assert provider.served_after_asof == 0
    assert provider.echoes and {t for t, _ in provider.echoes} == {"SPY", "^GSPC"}
    kinds = [e["kind"] for e in capture.emails]
    assert {"SWITCH_ON", "REBALANCE", "NEW_TRADE", "EXIT", "MONTHLY"} <= set(kinds)
    assert sum(e["validator_errors"] for e in capture.emails) == 0
    assert capture.issue_calls > 0 and not [s for _, s in capture.pings if s == "fail"]
    assert len(list((root / "emails").glob("*.txt"))) == len(capture.emails)
    ok, why = R.pipeline.verify_ledger(root / "state")
    assert ok, why


def test_trades_and_decisions_are_extracted(replayed):
    root, *_ = replayed
    state = json.loads((root / "state" / "state.json").read_text())
    recs = R.ledger_records(root / "state")
    trades = R.pipeline_trades(state, recs)
    m1 = trades[trades["module"] == "M1"].iloc[0]
    assert (m1["signal"], m1["entry"]) == ("2025-10-15", "2025-10-16")
    assert (m1["status"], m1["reason"]) == ("closed", "exit_rule")
    assert m1["ret_total"] == pytest.approx(m1["ret_price"], abs=1e-12)     # no dividend during the hold
    w10 = trades[trades["module"] == "W10"].iloc[0]
    assert (w10["signal"], w10["entry"], w10["status"]) == ("2025-10-07", "2025-10-08", "open")
    marks = pd.DataFrame(state["marks"])
    m2 = R.m2_decisions(recs, marks)
    assert set(m2["date"]) == {"2025-10-01", "2025-11-03"} and set(m2["leg"]) == set(R.ETF8)
    assert (m2["target_frac"].dropna() <= 0.25 + 1e-9).all()
    weeks = R.m3_weeks(recs)
    assert weeks["on"].iloc[0] and weeks["week_end"].iloc[0] == "2025-09-28"
    snap = [r["payload"] for r in recs if r["record_type"] == "snapshot"][0]
    assert snap["spy_check"]["source"] == R.ECHO_SOURCE                    # flagged in the ledger itself


def test_no_look_ahead_in_the_pipeline(cfg, history, replayed, tmp_path):
    """Full histories (no as-of cut) must give the same decisions: the pipeline cuts at the run date itself."""
    root, *_ = replayed
    provider, _, rows = _replay(cfg, history, tmp_path, cut=False)
    assert provider.served_after_asof > 0                                   # the future was on offer
    keep = ("recommendation", "order", "fill", "signal", "mark", "shadow", "snapshot", "forecast", "resolution")

    def decisions(state_dir: Path) -> list:
        return [(r["record_type"], r["as_of"], r["payload"]) for r in R.ledger_records(state_dir)
                if r["record_type"] in keep]

    assert decisions(tmp_path / "state") == decisions(root / "state")


def test_resumed_segment_files_cover_the_whole_window(cfg, history, tmp_path):
    R.run_segment(cfg, history, tmp_path, LAUNCH, "2025-10-03")
    first = json.loads((tmp_path / "segment.json").read_text())
    R.run_segment(cfg, history, tmp_path, LAUNCH, "2025-10-10", resume=True)
    seg = json.loads((tmp_path / "segment.json").read_text())
    runs = pd.read_csv(tmp_path / "runs.csv")
    emails = pd.read_csv(tmp_path / "emails.csv")
    assert seg["runs"] == len(runs) and runs["date"].is_unique and runs["date"].iloc[-1] == "2025-10-10"
    assert seg["echoes"] > first["echoes"]
    assert emails["n"].tolist() == list(range(1, len(emails) + 1))           # numbering continues
    assert len(list((tmp_path / "emails").glob("*.txt"))) == len(emails)


def test_resume_continues_after_the_last_run(cfg, history, tmp_path):
    provider, capture = R.AsOfProvider(history), R.CaptureServices()
    R.replay(cfg, provider, tmp_path / "state", LAUNCH, "2025-10-03", capture, progress_every=0)
    rows = R.replay(cfg, provider, tmp_path / "state", LAUNCH, "2025-10-08", capture, resume=True,
                    progress_every=0)
    assert [(r["kind"], r["date"]) for r in rows][0] == ("weekly", "2025-10-05")
    assert all(r["status"] in ("ok", "no_session") for r in rows)


# ------------------------------------------------------------------------------------------------------
# the growth book (design v4 Appendix A.4 test 9): the Sunday run in the loop, no look-ahead, the new CSVs
# ------------------------------------------------------------------------------------------------------

def test_growth_book_replay_runs_the_sunday_job_without_look_ahead(history, tmp_path):
    cfg_on = load_config()                                             # production: the growth book on
    a, b = tmp_path / "cut", tmp_path / "nocut"
    R.run_segment(cfg_on, history, a, LAUNCH, UNTIL)
    R.run_segment(cfg_on, history, b, LAUNCH, UNTIL, cut=False)
    runs = pd.read_csv(a / "runs.csv")
    assert set(runs["status"]) <= {"ok", "no_session"}, runs[runs["status"] == "exception"]["error"].tolist()
    seg_a, seg_b = (json.loads((w / "segment.json").read_text()) for w in (a, b))
    assert seg_a["served_after_asof"] == 0 and seg_b["served_after_asof"] > 0
    recs = R.ledger_records(a / "state")
    dec = R.growth_decisions(recs)
    assert dec["sunday"].tolist() == [d for k, d, _ in R.schedule(LAUNCH, UNTIL) if k == "weekly"]
    assert 0 < dec["orders_sent"].sum() and dec["orders_sent"].max() <= 3
    assert dec["G"].min() > 0 and dec["hard_stop"].fillna(False).astype(bool).sum() == 0
    assert {r["payload"]["module"] for r in recs if r["record_type"] == "order"} <= {"G1", "G2", "GROWTH", "W10"}
    assert R.compare_runs(a, b)["identical"]                           # the Sunday decisions too
    # the reconciliation helpers and CSVs
    ira = R.ira_path(recs)
    marks = json.loads((a / "state" / "state.json").read_text())["marks"]
    assert len(ira) == len(marks) and ira.iloc[0] <= 80_000.0 * 1.01
    stats = R.path_stats(ira)
    assert stats["sessions"] == len(ira) and stats["maxdd"] <= 0.0 and stats["worst_day_date"] is not None
    ev = R._events(pd.Series({pd.Timestamp("2025-10-05"): False, pd.Timestamp("2025-10-12"): True,
                              pd.Timestamp("2025-10-19"): None, pd.Timestamp("2025-10-26"): False}))
    assert ev == [("2025-10-12", "on"), ("2025-10-26", "off")]
    assert R.match_events(ev, [("2025-10-19", "on"), ("2025-10-26", "off")]) == {
        "matched": 2, "extra": 0, "missed": 0, "max_lag_days": 7, "mean_lag_days": 3.5}
    out = tmp_path / "out"
    summary = R.reconcile_growth(cfg_on, a, out, history=history, lookahead=(a, b)).set_index("metric")["value"]
    assert summary["identical decisions with and without the as-of cut"] == 1
    assert summary["max orders in one email"] <= 3 and summary["hard stop fired"] == 0
    assert summary["M1 orders queued"] == 0 and summary["M3 orders queued"] == 0
    for name in ("book_vs_track38.csv", "calendar_years.csv", "g2_switches.csv", "sundays.csv", "nav_monthly.csv"):
        assert (out / name).stat().st_size > 0


# ------------------------------------------------------------------------------------------------------
# reconciliation helpers
# ------------------------------------------------------------------------------------------------------

def test_match_trades_classifies_and_diffs():
    pipe = pd.DataFrame({"signal": ["2020-01-02", "2020-02-03", "2020-05-01"],
                         "entry": ["2020-01-03", "2020-02-04", "2020-05-04"],
                         "exit": ["2020-01-08", "2020-02-07", None], "ret": [0.012, -0.01, None]})
    res = pd.DataFrame({"signal": ["2020-01-02", "2020-02-03", "2020-03-02", "2021-01-04"],
                        "entry": ["2020-01-03", "2020-02-04", "2020-03-03", "2021-01-05"],
                        "exit": ["2020-01-08", "2020-02-10", "2020-03-05", "2021-01-07"],
                        "net": [0.010, -0.012, 0.02, 0.01]})
    m = R.match_trades(pipe, res, "2020-01-01", "2020-12-31").set_index("signal")
    assert m["status"].to_dict() == {"2020-01-02": "matched", "2020-02-03": "matched", "2020-03-02": "missed",
                                     "2020-05-01": "extra"}
    assert m.at["2020-01-02", "ret_diff"] == pytest.approx(0.002)
    assert bool(m.at["2020-01-02", "same_exit"]) and not bool(m.at["2020-02-03", "same_exit"])


def test_switch_events_are_matched_by_week():
    weeks = pd.date_range("2020-01-05", periods=6, freq="W-SUN")
    res = pd.DataFrame({"on": [0.0, 1.0, 1.0, 0.0, 0.0, 1.0]}, index=weeks)
    pipe = pd.DataFrame({"week_end": [w.strftime("%Y-%m-%d") for w in weeks],
                         "on": [False, True, False, False, False, True]})
    sw = R.match_switches(pipe, res, "2020-01-01", "2020-12-31")
    assert sw["agree"].tolist() == [True, True, False, True, True, True]
    # research: on (w2), off (w4), on (w6); pipeline: on (w2), off (w3), on (w6)
    assert R.event_summary(sw) == {"matched": 2, "missed": 1, "extra": 1}


def test_m2_sleeve_pnl_from_fills():
    dates = pd.DatetimeIndex(["2020-01-02", "2020-01-03", "2020-01-06", "2020-01-07"])
    closes = pd.DataFrame({"IEF": [100.0, 101.0, 102.0, 103.0]}, index=dates)
    fills = pd.DataFrame([
        {"fill_date": "2020-01-03", "module": "M2", "ticker": "IEF", "side": "buy", "qty": 10.0, "dollars": 1005.0},
        {"fill_date": "2020-01-06", "module": None, "ticker": "IEF", "side": "dividend", "qty": None, "price": 0.5,
         "dollars": 5.0},
        {"fill_date": "2020-01-07", "module": "M2", "ticker": "IEF", "side": "sell", "qty": 10.0, "dollars": 1025.0},
    ])
    nav = pd.Series(10_000.0, index=dates)
    sl = R.sleeve_pnl(fills, closes, pd.Series(0.0, index=dates), nav, "M2")
    assert sl["pnl"].tolist() == pytest.approx([0.0, 5.0, 15.0, 5.0])      # bought at 100.5, +0.5 dividend, sold 102.5
    assert sl["pnl"].sum() == pytest.approx(1025.0 + 5.0 - 1005.0)
    assert sl["contrib"].sum() == pytest.approx(25.0 / 10_000.0)
    assert sl["weight"].tolist() == pytest.approx([0.0, 0.101, 0.102, 0.0])
    assert R.sleeve_pnl(fills, closes, pd.Series(0.0, index=dates), nav, "M3")["pnl"].abs().sum() == 0.0


def test_ibit_proxy_from_hourly_candles():
    hours = pd.date_range("2024-01-08 00:00", "2024-01-10 00:00", freq="h")   # UTC; ET = UTC - 5 in January
    price = pd.Series(np.arange(len(hours), dtype=float) + 1000.0, index=hours)
    hourly = pd.DataFrame({"open": price, "high": price + 0.5, "low": price - 0.5, "close": price + 1.0,
                           "volume": 1.0})
    out = R.ibit_proxy(hourly, pd.DatetimeIndex(["2024-01-08", "2024-01-09"]), ratio=0.001)
    nine = price[pd.Timestamp("2024-01-08 14:00")]                           # 9:00 ET candle
    four = price[pd.Timestamp("2024-01-08 21:00")]                           # 16:00 ET candle
    assert out.at[pd.Timestamp("2024-01-08"), "open"] == pytest.approx(0.001 * (nine + nine + 1.0) / 2)
    assert out.at[pd.Timestamp("2024-01-08"), "close"] == pytest.approx(0.001 * four)
    assert (out["adj_close"] == out["close"]).all() and len(out) == 2


def test_max_drawdown():
    nav = pd.Series([100.0, 110.0, 99.0, 120.0, 90.0, 95.0], index=pd.date_range("2020-01-01", periods=6))
    dd, peak, trough = R.max_drawdown(nav)
    assert dd == pytest.approx(0.25) and (peak, trough) == ("2020-01-04", "2020-01-05")
