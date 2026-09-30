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


def test_resume_after_a_month_end_still_runs_that_months_review(cfg, history, tmp_path):
    """A segment ending on a month's last day: the next one must run the month's review (scheduled on the 1st with the
    month-end as-of date), which the Phase C4b chunks skipped five times before this was fixed."""
    provider, capture = R.AsOfProvider(history), R.CaptureServices()
    R.replay(cfg, provider, tmp_path / "state", LAUNCH, "2025-09-30", capture, progress_every=0)
    rows = R.replay(cfg, provider, tmp_path / "state", LAUNCH, "2025-10-03", capture, resume=True, progress_every=0)
    assert [(r["kind"], r["date"]) for r in rows][:2] == [("monthly", "2025-09"), ("daily", "2025-10-01")]
    assert rows[0]["status"] == "ok"
    state = json.loads((tmp_path / "state" / "state.json").read_text())
    assert state["runs"]["monthly:2025-09"]["status"] == "ok" and "monthly:2025-09" in state["runs"]
    again = R.replay(cfg, provider, tmp_path / "state", LAUNCH, "2025-10-03", capture, resume=True, progress_every=0)
    assert again == []                                                                 # nothing left to run


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


# ------------------------------------------------------------------------------------------------------
# Phase C4b (design v4 A.5, second item): the proxy fund bars, the g1-only override and reconcile-g1's helpers
# ------------------------------------------------------------------------------------------------------

def _index_bars(start: str, end: str, seed: int, level: float) -> pd.DataFrame:
    """Synthetic index bars: a random-walk close; the open differs from the prior close on even sessions (a real open)
    and equals it on odd ones (Yahoo's pattern for the indices in the 1980s)."""
    days = pd.bdate_range(start, end)
    rng = np.random.default_rng(seed)
    close = pd.Series(level * np.exp(np.cumsum(rng.normal(0.0003, 0.01, len(days)))), index=days)
    prev = close.shift(1).fillna(close.iloc[0])
    open_ = prev * np.where(np.arange(len(days)) % 2 == 0, 1.003, 1.0)
    return pd.DataFrame({"open": open_, "high": np.maximum(open_, close) * 1.004, "low": np.minimum(open_, close) * 0.996,
                         "close": close, "adj_close": close, "volume": 1.0}, index=days)


def test_fund_proxy_returns_are_track_26s_model_with_the_prior_tbill_print():
    idx = _index_bars("2020-01-01", "2020-03-31", 7, 3000.0)
    div = pd.Series(0.02 / 252, index=idx.index)                                   # 2% a year of dividends
    tbill = pd.Series(0.015, index=pd.bdate_range("2019-12-01", "2020-03-31"))
    tbill.loc["2020-02-03":] = 0.01                                                # a lower print from 3 Feb
    p = R.FUND_PROXY
    f = R.fund_proxy_returns(idx, div, tbill, L=p["L"], fee=p["fee"], spread=p["spread"], days=p["days"])
    day = pd.Timestamp("2020-02-03")                                               # its own print is not out yet
    r_px = idx["close"].loc[day] / idx["close"].shift(1).loc[day] - 1.0
    assert f.loc[day] == pytest.approx(2.0 * (r_px + 0.02 / 252) - (0.015 + 0.0070) / 252 - 0.008945 / 252, abs=1e-12)
    day2 = pd.Timestamp("2020-02-04")                                              # the prior print: 3 Feb's
    r2 = idx["close"].loc[day2] / idx["close"].loc[day] - 1.0
    assert f.loc[day2] == pytest.approx(2.0 * (r2 + 0.02 / 252) - (0.01 + 0.0070) / 252 - 0.008945 / 252, abs=1e-12)
    assert np.isnan(f.iloc[0]) and f.index.equals(idx.index)
    assert p == {"L": 2.0, "fee": 0.008945, "spread": 0.0070, "days": 252}          # track 26: fee(2x) = 0.0945% + 0.80%


def test_leveraged_fund_proxy_splices_by_ratio_and_uses_real_opens_only():
    idx = _index_bars("2020-01-01", "2020-06-30", 3, 1000.0)
    f = pd.Series(0.001, index=idx.index)                                          # a flat modelled return
    f.iloc[0] = np.nan
    first = pd.Timestamp("2020-04-01")
    real = pd.DataFrame({"open": [10.0, 10.1], "high": [10.2, 10.2], "low": [9.9, 10.0], "close": [10.05, 10.1],
                         "adj_close": [9.0, 9.05], "volume": [1.0, 1.0]},
                        index=pd.DatetimeIndex([first, first + pd.Timedelta(days=1)]))
    proxy, meta = R.leveraged_fund_proxy(idx, f, real, L=2.0)
    # the first session has no modelled return and the second no prior fund close (no open): the proxy starts on the third
    assert proxy.index[-1] < first and proxy.index[0] == idx.index[2]
    assert meta["first_real"] == "2020-04-01" and meta["sessions"] == len(proxy)
    level = (1.0 + f.dropna().loc[:first]).cumprod()
    assert meta["ratio"] == pytest.approx(10.05 / level.loc[first])                 # the model's level meets the real close
    last = proxy.index[-1]
    assert proxy.at[last, "close"] == pytest.approx(10.05 / 1.001)                  # one modelled day before it
    assert (proxy["adj_close"] == proxy["close"]).all() and (proxy["volume"] == 0).all()
    prev_close = proxy["close"].shift(1)
    prev_idx = idx["close"].shift(1)
    real_open = idx["open"] != prev_idx
    for day in proxy.index[1:]:
        if real_open[day]:
            assert proxy.at[day, "open"] == pytest.approx(prev_close[day] * (1 + 2 * (idx.at[day, "open"] / prev_idx[day] - 1)))
        else:
            assert proxy.at[day, "open"] == pytest.approx(prev_close[day])          # no real open: the prior close
    assert 0.4 < meta["real_open_share"] < 0.6 and meta["real_opens_from"] is None  # every other session: never the rule
    assert (proxy["high"] >= proxy[["open", "close"]].max(axis=1) - 1e-12).all()
    assert (proxy["low"] <= proxy[["open", "close"]].min(axis=1) + 1e-12).all()


def test_index_dividends_qqq_implied_yield_and_the_fallbacks(monkeypatch):
    days = pd.bdate_range("2020-01-01", "2021-12-31")
    closes = pd.Series(100.0, index=days)
    q_adj = pd.Series(100.0 * (1 + 0.01 / 252) ** np.arange(len(days)), index=days)  # 1% a year of distributions
    qqq = pd.DataFrame({"close": pd.Series(100.0, index=days), "adj_close": q_adj}).loc["2020-07-01":]
    d, note = R.index_dividends("^NDX", closes, qqq)
    assert d.loc[:"2020-06-30"].eq(0.006 / 252).all() and "0.6% a year before it" in note
    assert d.iloc[-1] == pytest.approx(0.01 / 252, rel=1e-6) and "QQQ's implied yield" in note

    def no_track26():
        raise ImportError("track 26 unavailable")

    monkeypatch.setattr(R, "_track26", no_track26)                                   # no cached inputs: the constant
    d2, note2 = R.index_dividends("^GSPC", closes)
    assert d2.eq(0.023 / 252).all() and "constant 2.3% a year" in note2
    d3, note3 = R.index_dividends("^XYZ", closes)
    assert d3.eq(0.0).all() and "constant 0.0% a year" in note3


def test_splice_fund_proxies_flags_every_proxy_and_keeps_the_real_bars(monkeypatch):
    idx = _index_bars("2019-01-01", "2021-03-31", 11, 2000.0)
    ndx = _index_bars("2019-01-01", "2021-03-31", 12, 8000.0)
    days = pd.bdate_range("2021-01-04", periods=60)
    real = {"SSO": _bars(pd.Series(20.0 + np.arange(60) * 0.01, index=days)),
            "QLD": _bars(pd.Series(40.0 + np.arange(60) * 0.02, index=days)),
            "SPY": _bars(pd.Series(300.0 + np.arange(60) * 0.1, index=days))}
    h = R.History(bars={**real, "^GSPC": idx, "^NDX": ndx}, vix={}, btc=pd.Series(dtype=float),
                  tbill=pd.Series(0.02, index=pd.bdate_range("2018-12-01", "2021-03-31")))
    monkeypatch.setattr(R, "index_dividends",
                        lambda index, closes, qqq_bars=None, days=252: (pd.Series(0.02 / days, index=closes.index), "a test yield"))
    info = R.splice_fund_proxies(h, load_config(), start="2019-01-01")
    for fund in ("SSO", "QLD", "SPY"):
        assert h.proxy_before[fund] == "2021-01-04" and info[fund]["first_real"] == "2021-01-04"
        b = h.bars[fund]
        assert b.index.is_monotonic_increasing and not b.index.duplicated().any() and b.index.name == "date"
        assert b.index[0] < pd.Timestamp("2019-02-01") and b.index[-1] == days[-1]
        assert b.loc["2021-01-04":].equals(real[fund])                               # the real bars are untouched
    assert "proxy = track 26's 2x model on ^GSPC" in h.flags["SSO"] and "a test yield" in h.flags["SSO"]
    assert "0.70%" in h.flags["SSO"] and "0.89%" in h.flags["SSO"] and "2 x the index's overnight move" in h.flags["SSO"]
    assert "2x model on ^NDX" in h.flags["QLD"] and h.sources["daily_bars:QLD"] == "yfinance+track26-proxy"
    assert "proxy = ^GSPC x" in h.flags["SPY"] and "no module trades SPY" in h.flags["SPY"]
    ratio = 300.0 / idx.at[pd.Timestamp("2021-01-04"), "close"]                      # SPY: the index scaled to its first close
    assert h.bars["SPY"].at[pd.Timestamp("2020-06-01"), "close"] == pytest.approx(idx.at[pd.Timestamp("2020-06-01"), "close"] * ratio)
    assert info["SSO"]["ratio"] == pytest.approx(20.0 / (1.0 + R.fund_proxy_returns(idx, pd.Series(0.02 / 252, index=idx.index), h.tbill)).dropna().loc[:"2021-01-04"].cumprod().iloc[-1])


def test_g1_only_config_turns_the_book_into_the_legs_alone():
    cfg = load_config()
    c = R.g1_only_config(cfg, governor=False).constitution
    g = c["growth"]
    assert g["sleeves"]["G2"]["weight"] == 0.0 and g["sleeves"]["G2"]["instrument"] == cfg.constitution["growth"]["sleeves"]["G2"]["instrument"]
    assert g["sleeves"]["W10"]["weight"] == 0.0
    assert all(c["modules"][m]["enabled"] is False for m in R.V33_MODULES)
    assert all(v["enabled"] is False for v in c["shadow"].values() if isinstance(v, dict)) and c["shadow"]["ST1"]["enabled"] is False
    assert g["governor"]["full_until"] == 1.0 and g["hard_stop"]["at"] == 1.0
    from traderec.growth import governor
    assert governor.G(0.5, g) == 1.0 and not governor.hard_stop(0.5, g)              # forced to G = 1, no hard stop
    with_gov = R.g1_only_config(cfg).constitution["growth"]
    assert with_gov["governor"] == cfg.constitution["growth"]["governor"]
    assert with_gov["hard_stop"] == cfg.constitution["growth"]["hard_stop"]
    assert g["rule_e"] == cfg.constitution["growth"]["rule_e"]                        # production's Rule E stays
    assert cfg.constitution["growth"]["sleeves"]["G2"]["weight"] > 0                  # the original is untouched
    assert cfg.constitution["modules"]["W10"]["enabled"] is True


@pytest.fixture(scope="module")
def g1_only_replayed(history, tmp_path_factory):
    """The synthetic market through the G1-only override, once without the governor and once with it."""
    root = tmp_path_factory.mktemp("g1only")
    a, b, c = root / "nogov", root / "gov", root / "gov-nocut"
    R.run_segment(R.g1_only_config(load_config(), governor=False), history, a, LAUNCH, UNTIL, book="g1-only",
                  extra={"governor": False})
    R.run_segment(R.g1_only_config(load_config()), history, b, LAUNCH, UNTIL, book="g1-only", extra={"governor": True})
    R.run_segment(R.g1_only_config(load_config()), history, c, LAUNCH, UNTIL, book="g1-only", extra={"governor": True},
                  cut=False)                                                          # the look-ahead twin
    return a, b, c


def test_g1_only_replay_runs_the_legs_alone_and_skips_g2_without_alerts(g1_only_replayed):
    a, _, _ = g1_only_replayed
    seg = json.loads((a / "segment.json").read_text())
    assert seg["book"] == "g1-only" and seg["governor"] is False
    runs = pd.read_csv(a / "runs.csv")
    assert set(runs["status"]) <= {"ok", "no_session"}, runs[runs["status"] == "exception"]["error"].tolist()
    recs = R.ledger_records(a / "state")
    dec = R.growth_decisions(recs)
    assert dec["sunday"].tolist() == [d for k, d, _ in R.schedule(LAUNCH, UNTIL) if k == "weekly"]
    assert (dec["G"] == 1.0).all() and dec["g2_on"].isna().all() and dec["orders_sent"].max() <= 3
    orders = [r["payload"] for r in recs if r["record_type"] == "order"]
    assert orders and {o["module"] for o in orders} <= {"G1", "GROWTH"} and {o["ticker"] for o in orders} <= {"SSO", "QLD", "SGOV"}
    assert not [r for r in recs if r["record_type"] in ("shadow", "signal")]          # the v3.3 modules and shadow books are off
    alerts = pd.DataFrame(json.loads((a / "state" / "state.json").read_text()).get("alerts", []))
    assert not len(alerts) or not alerts["message"].str.contains("G2").any()         # the Bitcoin leg never alerts
    g2 = [r["payload"]["G2"] for r in recs if r["record_type"] == "growth_decision"]
    assert all(x["signal"] is False and "g1-only" in x["reason"] for x in g2)
    from traderec.growth import weekly as growth_weekly
    assert growth_weekly._g2 is not R.g2_off                                          # restored after the run


def test_reconcile_g1_writes_the_tables_from_both_runs(g1_only_replayed, history, tmp_path):
    a, b, c = g1_only_replayed
    out = tmp_path / "out"
    summary = R.reconcile_g1(load_config(), a, b, out, history=history, lookahead=(b, c))
    s = summary.groupby("metric")["value"].max()                                        # some metrics appear once per run
    assert s["max orders in one email"] <= 3 and s["hard stop fired"] == 0 and s["data served after the as-of date"] == 0
    assert s["identical decisions with and without the as-of cut"] == 1                # no look-ahead in the g1-only book
    assert s["provider calls that returned future rows without the cut"] > 0
    for name in ("book_vs_track38.csv", "calendar_years.csv", "episodes.csv", "sundays.csv", "g1_switches.csv", "nav_monthly.csv",
                 "governor_path.csv"):
        assert (out / name).exists()
    books = pd.read_csv(out / "book_vs_track38.csv").set_index("book")
    assert "track 38: 2x blend, equity part only" in books.index
    assert books.loc["reference: the two legs band-free at 100% equity (track 38's '2x blend, equity part only')", "sessions"] > 0
    sun = pd.read_csv(out / "sundays.csv")
    assert {"nav_ira_nogov", "nav_ira_gov", "G", "drawdown", "SSO_in", "QLD_in_gov"} <= set(sun.columns) and len(sun) > 0
    ep = pd.read_csv(out / "episodes.csv").set_index("episode")
    assert ep.loc["Aug 25 - Dec 31 1987", "track38_blend_2x_50pct"] == pytest.approx(-0.127)
    assert ep["pipeline_nogov"].isna().all()                                          # no 1987 in the synthetic market


def test_episode_returns_run_from_the_close_before_the_first_date():
    days = pd.bdate_range("2020-01-01", "2020-04-30")
    nav = pd.Series(100.0, index=days)
    fall = nav.loc["2020-02-19":"2020-03-23"].index
    nav.loc[fall] = np.linspace(99.0, 80.0, len(fall))
    nav.loc["2020-03-24":] = 85.0
    ep = R.episode_returns(nav, (("Feb 19 - Mar 23 2020", "2020-02-19", "2020-03-23"),
                                 ("before the data", "2019-01-01", "2019-02-01"), ("Jan - Oct 2022", "2022-01-03", "2022-10-12")))
    assert ep["Feb 19 - Mar 23 2020"] == pytest.approx(80.0 / 100.0 - 1.0)
    assert np.isnan(ep["before the data"]) and np.isnan(ep["Jan - Oct 2022"])


def test_reference_sleeve_switches_at_mondays_open_after_the_sunday_decision():
    sessions = pd.bdate_range("2024-01-08", "2024-01-19")                               # two Monday-to-Friday weeks
    bars = _bars(pd.Series(np.linspace(100.0, 110.0, len(sessions)), index=sessions))
    states = pd.Series({pd.Timestamp("2024-01-07"): True, pd.Timestamp("2024-01-14"): False})
    r_cash = pd.Series(0.0001, index=sessions)
    r = R._sleeve_returns(bars, states, sessions, r_cash)
    mon1, tue1, mon2, tue2 = (pd.Timestamp(d) for d in ("2024-01-08", "2024-01-09", "2024-01-15", "2024-01-16"))
    assert r[mon1] == pytest.approx(bars.at[mon1, "close"] / bars.at[mon1, "open"] - 1.0)          # in at Monday's open
    assert r[tue1] == pytest.approx(bars.at[tue1, "close"] / bars.at[mon1, "close"] - 1.0)
    fri1 = pd.Timestamp("2024-01-12")
    assert r[mon2] == pytest.approx(bars.at[mon2, "open"] / bars.at[fri1, "close"] - 1.0)          # out at Monday's open
    assert r[tue2] == pytest.approx(0.0001)


def test_decision_payload_drops_the_record_hashes_two_replays_never_share():
    h = "a" * 64
    p = {"ids": {"x": h}, "facts": {"ids": {"y": h}, "rule_e": {"scored": [{"record": h, "trigger_record": h, "edge_pct": 1.5}]}},
         "record": "not-a-hash"}
    assert R._decision_payload(p) == {"facts": {"rule_e": {"scored": [{"edge_pct": 1.5}]}}, "record": "not-a-hash"}
