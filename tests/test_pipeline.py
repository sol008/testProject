"""End-to-end tests of the run pipeline on a synthetic market (offline, deterministic).

The synthetic market is built so that, in October-November 2025:
- the Bitcoin 10-week switch is on (M3 opens at launch);
- SPY has a sharp two-day dip on 14-15 Oct 2025 with VIX at 25 inside a long uptrend (M1 fires, then exits);
- M2 makes its first monthly decision on 1 Oct 2025 (the first session after the launch month);
- IEF pays a dividend on an ex-date while M2 holds it.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from traderec import growth, pipeline
from traderec.config import load_config
from traderec.ledger import Ledger
from traderec.market_calendar import is_trading_day
from traderec.options.chain import occ_symbol
from traderec.reports import run_punctuality
from traderec.types import OrderIntent

START, END = "2023-01-03", "2026-03-31"
SESSIONS = pd.DatetimeIndex([d for d in pd.date_range(START, END, freq="B") if is_trading_day(d)])
DIP_DAYS = [pd.Timestamp("2025-10-14"), pd.Timestamp("2025-10-15")]
W10_DAY = pd.Timestamp("2025-10-07")        # a -3.1% S&P day inside the uptrend (design v3.3 W10)
IEF_EX_DATE = pd.Timestamp("2025-11-03")
LAUNCH = "2025-09-29"


def _walk(rng: np.random.Generator, n: int, drift: float, vol: float, start: float) -> np.ndarray:
    return start * np.exp(np.cumsum(rng.normal(drift, vol, n)))


def _bars(close: pd.Series, adj: pd.Series | None = None) -> pd.DataFrame:
    prev = close.shift(1).fillna(close.iloc[0])
    open_ = prev * 1.0005
    return pd.DataFrame({
        "open": open_, "high": np.maximum(open_, close) * 1.002, "low": np.minimum(open_, close) * 0.998,
        "close": close, "adj_close": close if adj is None else adj, "volume": 1_000_000.0,
    })


class SynthProvider:
    """Implements the DataProvider protocol on synthetic data."""

    def __init__(self, missing: set[tuple[str, str]] | None = None) -> None:
        rng = np.random.default_rng(20250929)
        n = len(SESSIONS)
        r = rng.normal(0.0006, 0.004, n)                                   # daily log returns
        r[SESSIONS.get_loc(W10_DAY)] = np.log(0.969)                        # the W10 shock
        i0 = SESSIONS.get_loc(DIP_DAYS[0])                                  # the M1 dip: two -2.5% days,
        r[i0:i0 + 2] = np.log(0.975)                                        # then a steady recovery
        r[i0 + 2:i0 + 8] = np.log(1.006)
        spy = pd.Series(400.0 * np.exp(np.cumsum(r)), index=SESSIONS)
        vix = pd.Series(15.0, index=SESSIONS)
        vix.loc[DIP_DAYS] = 25.0
        self.frames: dict[str, pd.DataFrame] = {"SPY": _bars(spy), "^GSPC": _bars(spy * 10.0),
                                                "^VIX": _bars(vix)}
        self.vix_series = vix
        drifts = {"QQQ": 0.0008, "GLD": 0.0005, "USO": -0.0004, "FXE": -0.0002, "FXY": -0.0003,
                  "FXA": 0.0002, "IBIT": 0.0015}
        for t, mu in drifts.items():
            self.frames[t] = _bars(pd.Series(_walk(rng, n, mu, 0.008, 50.0), index=SESSIONS))
        ief = pd.Series(_walk(rng, n, 0.0003, 0.003, 95.0), index=SESSIONS)
        adj = ief.copy()
        prev_close = float(ief.shift(1).loc[IEF_EX_DATE])
        adj.loc[adj.index < IEF_EX_DATE] *= (1.0 - 0.30 / prev_close)   # a $0.30 distribution
        self.frames["IEF"] = _bars(ief, adj)
        days = pd.date_range("2023-01-01", END, freq="D")
        # Bitcoin has its own generator, so edits to the other paths never move the switch (on at launch)
        self.btc = pd.Series(_walk(np.random.default_rng(1234), len(days), 0.002, 0.02, 20_000.0), index=days)
        self.missing = missing or set()
        self.calls: list[str] = []

    def daily_bars(self, ticker: str) -> pd.DataFrame:
        self.calls.append(ticker)
        if ticker not in self.frames:
            raise KeyError(ticker)
        df = self.frames[ticker]
        drop = [pd.Timestamp(d) for t, d in self.missing if t == ticker]
        return df.drop(index=[d for d in drop if d in df.index])

    def vix(self, name: str = "VIX") -> pd.Series:
        return self.vix_series

    def btc_daily_utc(self) -> pd.Series:
        return self.btc

    def tbill_rate(self) -> float:
        return 0.04

    def second_source_close(self, ticker: str, date: str) -> dict | None:
        df = self.frames.get(ticker)
        ts = pd.Timestamp(date)
        if df is None or ts not in df.index:
            return None
        return {"close": float(df.at[ts, "close"]), "source": "nasdaq"}


class Recorder:
    """Stands in for Gmail, GitHub issues and healthchecks."""

    def __init__(self) -> None:
        self.sent: list = []
        self.issues: list[tuple[str, str]] = []
        self.pings: list[str] = []
        self.comments: dict[str, list[str]] = {}

    def services(self) -> pipeline.Services:
        def send(email, *, dry_run, outbox):
            self.sent.append(email)
            return {"sent": not dry_run, "id": f"msg-{len(self.sent)}"} if not dry_run else \
                {"sent": False, "path": str(Path(outbox) / f"{len(self.sent)}.eml"), "reason": "dry run"}

        def create_issue(title, body, labels=None):
            self.issues.append((title, body))
            return f"https://github.com/example/repo/issues/{len(self.issues)}"

        def fetch_comments(url):
            return list(self.comments.get(url, []))

        return pipeline.Services(send=send, create_issue=create_issue, healthcheck=self.pings.append,
                                 fetch_comments=fetch_comments)


@pytest.fixture()
def cfg():
    """The v3.3 book: these tests pin the weekly job's M3 switch, so the v4 growth book is off (tests/test_growth.py)."""
    return growth.with_enabled(load_config(), False)


@pytest.fixture()
def world(tmp_path, cfg):
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    return state_dir, SynthProvider(), Recorder()


def _run_until(cfg, state_dir, provider, rec, end: str, start: str = LAUNCH) -> list[pipeline.RunResult]:
    out = []
    for day in pd.date_range(start, end, freq="D"):
        d = day.strftime("%Y-%m-%d")
        if day.weekday() == 6:
            out.append(pipeline.run_weekly(cfg, provider, state_dir, date=d, services=rec.services()))
        elif day.weekday() < 5:
            out.append(pipeline.run_daily(cfg, provider, state_dir, date=d, services=rec.services()))
    return out


def _state(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def _kinds(rec: Recorder) -> list[str]:
    return [e.meta.get("kind") for e in rec.sent]


def test_full_cycle(cfg, world):
    state_dir, provider, rec = world
    results = _run_until(cfg, state_dir, provider, rec, "2025-11-28")
    statuses = {r.status for r in results}
    assert statuses <= {"ok", "no_session"}, statuses
    st = _state(state_dir)

    assert not [a for a in st["alerts"] if a["kind"] in ("validator", "fill", "cluster")], st["alerts"]
    kinds = _kinds(rec)
    # M3 switches on at launch, M2 rebalances in October, W10 buys the 7 Oct shock, M1 buys and sells the dip
    assert "SWITCH_ON" in kinds
    assert "REBALANCE" in kinds
    new = [e.meta.get("trade_id") for e in rec.sent if e.meta.get("kind") == "NEW_TRADE"]
    exits = [e.meta.get("trade_id") for e in rec.sent if e.meta.get("kind") == "EXIT"]
    assert sorted(t[-3:] for t in new) == ["-M1", "W10"] and [t[-3:] for t in exits] == ["-M1"]

    # at most three orders per email (design §3a.3)
    for email in rec.sent:
        assert email.meta.get("kind")
    m1_hist = st["modules"]["M1"]["history"]
    assert len(m1_hist) == 1 and m1_hist[0]["entry_date"] == "2025-10-16"
    assert m1_hist[0]["exit_reason"] == "exit_rule"
    assert st["modules"]["M1"]["open_trade"] is None
    lots = st["broker"]["lots"]
    assert any(k.startswith("ira|IBIT|M3") for k in lots)
    assert any(k.endswith("|M2") for k in lots)
    assert not any(k.endswith("|M1") for k in lots)
    assert lots["ira|SPY|W10"]["opened"] == "2025-10-08"                 # still held on 28 Nov
    resolved = st["forecasts"]["resolved"]
    assert {f["event"] for f in resolved} >= {"profit", "time_stop", "leg_up_next_month"}
    assert all(f["trade_id"] != "T-2025-10-07-W10" for f in resolved)      # W10 resolves at its exit
    assert st["dividends"] and st["dividends"][0]["ticker"] == "IEF"
    ok, why = Ledger(state_dir / "ledger.jsonl").verify()
    assert ok, why
    assert rec.pings.count("fail") == 0


def test_rebalance_emails_have_at_most_three_orders(cfg, world):
    state_dir, provider, rec = world
    _run_until(cfg, state_dir, provider, rec, "2025-10-10")
    recs = [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]
    rebalances = [r["payload"] for r in recs if r["record_type"] == "recommendation"
                  and r["payload"]["kind"] == "REBALANCE"]
    assert rebalances
    assert all(len(r["orders"]) <= 3 for r in rebalances)


def test_idempotent_rerun(cfg, world):
    state_dir, provider, rec = world
    pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    size = (state_dir / "ledger.jsonl").stat().st_size
    again = pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    assert again.status == "already_done"
    assert (state_dir / "ledger.jsonl").stat().st_size == size


def test_dry_run_changes_nothing(cfg, world):
    state_dir, provider, rec = world
    before = (state_dir / "state.json").read_bytes(), (state_dir / "ledger.jsonl").read_bytes()
    res = pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, dry_run=True, services=rec.services())
    assert res.status == "ok" and res.dry_run
    assert rec.sent and not rec.issues            # emails rendered, no GitHub issues in a dry run
    assert ((state_dir / "state.json").read_bytes(), (state_dir / "ledger.jsonl").read_bytes()) == before


def test_force_rerun_restores_pre_state(cfg, world):
    state_dir, provider, rec = world
    pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    pending_before = len(_state(state_dir)["broker"]["pending"])
    res = pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, force=True, services=rec.services())
    assert res.status == "ok"
    st = _state(state_dir)
    assert len(st["broker"]["pending"]) == pending_before      # not doubled
    recs = [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]
    assert any(r["record_type"] == "correction" and "superseded_seq" in r["payload"] for r in recs)


def test_missing_data_is_retryable(cfg, tmp_path):
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = SynthProvider(missing={("SPY", LAUNCH)})
    rec = Recorder()
    res = pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    assert res.status == "data_missing"
    assert "fail" in rec.pings
    ok = pipeline.run_daily(cfg, SynthProvider(), state_dir, date=LAUNCH, services=rec.services())
    assert ok.status == "ok"


def test_old_run_records_and_alerts_are_compacted(cfg, world):
    """`runs` and `alerts` never used to shrink (about 90 KB and 32 KB after nine months). Records older than
    400 days keep only what the reports still read: the status and sequence number (runs on time since launch),
    the emails sent (the [LIVE] record) and validator alerts (counted to date)."""
    state_dir, provider, rec = world
    st = _state(state_dir)
    old = {"status": "ok", "at": "2024-06-04T02:30:00+00:00", "run_seq": 1, "ledger_seq": [1, 5],
           "notes": ["interest credited $0.00 at 0.0400"]}
    live = [{"subject": "[LIVE] NEW TRADE", "outcome": "sent", "trade_id": "T-2024-06-03-M1", "kind": "NEW_TRADE"}]
    st["runs"].update({"daily:2024-06-03": {**old, "emails": live}, "options:2024-06-03": dict(old),
                       "monthly:2024-05": {**old, "emails": []}, "hourly:2024-06-03T14Z": dict(old),
                       "daily:2025-09-26": {**old, "notes": ["recent"]}})
    st["alerts"] = [{"date": "2024-06-03", "run": "daily:2024-06-03", "kind": "data", "message": "old data"},
                    {"date": "2024-06-03", "run": "daily:2024-06-03", "kind": "validator", "message": "kept"},
                    {"date": "2024-05", "run": "monthly:2024-05", "kind": "email", "message": "old month"},
                    {"date": "2025-09-26", "run": "daily:2025-09-26", "kind": "data", "message": "recent"}]
    (state_dir / "state.json").write_text(json.dumps(st))
    res = pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    assert res.status == "ok"
    st = _state(state_dir)                                             # cutoff: 400 days before 29 Sep 2025
    assert st["runs"]["daily:2024-06-03"] == {"status": "ok", "run_seq": 1, "emails": live}
    assert st["runs"]["options:2024-06-03"] == {"status": "ok", "run_seq": 1}
    assert st["runs"]["monthly:2024-05"] == {"status": "ok", "run_seq": 1}
    assert st["runs"]["hourly:2024-06-03T14Z"] == {"status": "ok", "run_seq": 1}
    assert st["runs"]["daily:2025-09-26"]["notes"] == ["recent"] and st["runs"]["daily:2025-09-26"]["at"]
    assert st["runs"][f"init:{LAUNCH}"]["at"] and st["runs"][f"daily:{LAUNCH}"]["notes"]
    mine = [a["message"] for a in st["alerts"] if a["message"] in ("old data", "kept", "old month", "recent")]
    assert mine == ["kept", "recent"]
    # the go-live gate's "runs on time since launch" still counts the compacted daily and options runs
    since_2024 = dict(st, created="2024-06-03")
    assert run_punctuality(since_2024, "2024-06-03", "2024-06-03", "2025-09-29") == (2, 2)


def test_weekend_is_no_session(cfg, world):
    state_dir, provider, rec = world
    res = pipeline.run_daily(cfg, provider, state_dir, date="2025-10-04", services=rec.services())
    assert res.status == "no_session"


def test_truncated_ledger_is_detected(cfg, world):
    state_dir, provider, rec = world
    pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    path = state_dir / "ledger.jsonl"
    lines = path.read_text().splitlines(keepends=True)
    path.write_text("".join(lines[:-1]))
    with pytest.raises(pipeline.RunError):
        pipeline.run_daily(cfg, provider, state_dir, date="2025-09-30", services=rec.services())


def test_missed_run_fills_at_the_right_open(cfg, world):
    state_dir, provider, rec = world
    pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, services=rec.services())   # M3 buy queued
    # 30 Sep is missed; the 1 Oct run must fill the IBIT order at the 30 Sep open
    pipeline.run_daily(cfg, provider, state_dir, date="2025-10-01", services=rec.services())
    st = _state(state_dir)
    lot = st["broker"]["lots"]["ira|IBIT|M3"]
    assert lot["opened"] == "2025-09-30"
    expected = float(provider.frames["IBIT"].at[pd.Timestamp("2025-09-30"), "open"]) * (1 + 3 / 1e4)
    assert lot["cost"] / lot["qty"] == pytest.approx(expected)


def test_status_text(cfg, world):
    state_dir, provider, rec = world
    pipeline.run_daily(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    text = pipeline.status_text(cfg, state_dir)
    assert "NAV" in text and "M3" in text


def test_bitcoin_switch_off_sells_on_monday(cfg, world):
    state_dir, provider, rec = world
    crash = provider.btc.index >= pd.Timestamp("2025-10-20")
    provider.btc.loc[crash] = provider.btc.loc[crash] * 0.55          # a 45% fall: the weekly close breaks the SMA
    _run_until(cfg, state_dir, provider, rec, "2025-11-04")
    kinds = _kinds(rec)
    assert "SWITCH_ON" in kinds and "SWITCH_OFF" in kinds
    st = _state(state_dir)
    hist = st["modules"]["M3"]["history"]
    assert len(hist) == 1 and hist[0]["exit_reason"] == "switch_off"
    assert pd.Timestamp(hist[0]["exit_date"]).weekday() == 0              # sold at Monday's open
    assert not any(k.startswith("ira|IBIT|") for k in st["broker"]["lots"])
    assert any(f["module"] == "M3" and f["event"] == "profit" for f in st["forecasts"]["resolved"])


def test_monthly_review_renders_and_validates(cfg, world):
    state_dir, provider, rec = world
    _run_until(cfg, state_dir, provider, rec, "2025-10-31")
    issues = _state(state_dir)["issues"]
    assert issues and all(i["url"].startswith("https://github.com/") for i in issues)
    for i in issues[:-1]:                                   # every trade email but the last gets a fill note
        rec.comments[i["url"]] = ["skipped"] if len(i["tickers"]) > 1 else ["filled 3000 @ 1.0"]
    res = pipeline.run_monthly(cfg, provider, state_dir, month="2025-10", services=rec.services())
    assert res.status == "ok"
    monthly = [e for e in rec.sent if e.meta.get("kind") == "MONTHLY"]
    assert len(monthly) == 1
    assert "October 2025" in monthly[0].subject
    st = _state(state_dir)
    assert not [a for a in st["alerts"] if a["kind"] == "validator"]
    recs = [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]
    report = [r["payload"] for r in recs if r["record_type"] == "monthly_report"][-1]
    assert report["runs_expected"] == report["runs_on_time"] == 23
    assert report["trades_opened"] >= 2
    october = [i for i in issues if i["date"].startswith("2025-10")]
    assert report["emails_sent"] == len(october)
    assert report["emails_handled"] == len([i for i in october if i["url"] in rec.comments])
    again = pipeline.run_monthly(cfg, provider, state_dir, month="2025-10", services=rec.services())
    assert again.status == "already_done"


def test_w10_buys_the_shock_and_sells_at_the_90_day_limit(cfg, world):
    state_dir, provider, rec = world
    _run_until(cfg, state_dir, provider, rec, "2026-01-09")
    st = _state(state_dir)
    w10 = [e for e in rec.sent if (e.meta.get("trade_id") or "").endswith("-W10")]
    assert [e.meta.get("kind") for e in w10] == ["NEW_TRADE", "EXIT"]
    hist = st["modules"]["W10"]["history"]
    assert len(hist) == 1
    assert hist[0]["entry_date"] == "2025-10-08" and hist[0]["exit_date"] == "2026-01-06"   # 8 Oct + 90 days
    assert hist[0]["exit_reason"] == "calendar_stop"
    assert (pd.Timestamp(hist[0]["exit_date"]) - pd.Timestamp(hist[0]["entry_date"])).days <= 90
    assert any(f["trade_id"] == "T-2025-10-07-W10" and "outcome" in f for f in st["forecasts"]["resolved"])
    events = st["shadow"]["W10"]["events"]
    assert [e["signal_date"] for e in events] == ["2025-10-07"]
    assert set(events[0]["scores"]) == {"60", "90"} and events[0]["scores"]["60"]["exit_date"] == "2025-12-05"
    assert not [a for a in st["alerts"] if a["kind"] in ("validator", "cluster")]


def test_w10_unconfirmed_by_the_second_source_is_shadow_only(cfg, tmp_path):
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider, rec = SynthProvider(), Recorder()
    real_second = provider.second_source_close

    def disagree(ticker, date):                                          # the second source says -2.9%
        if ticker == "^GSPC" and date == "2025-10-07":
            prev = float(provider.frames["^GSPC"]["close"].loc[:"2025-10-06"].iloc[-1])
            return {"close": prev * 0.971, "source": "fred:SP500"}
        return real_second(ticker, date)

    provider.second_source_close = disagree
    _run_until(cfg, state_dir, provider, rec, "2025-10-10")
    st = _state(state_dir)
    assert st["modules"]["W10"]["open_trade"] is None and not any(k.endswith("|W10") for k in st["broker"]["lots"])
    assert any(a["kind"] == "data" and "W10" in a["message"] for a in st["alerts"])
    assert [e["signal_date"] for e in st["shadow"]["W10"]["events"]] == ["2025-10-07"]   # still recorded


def test_admission_prices_pending_buys_at_their_ticker_stress(cfg, tmp_path):
    """Tonight's pending buys count in the open stress as if filled, each at its ticker's stress. W10's SPY buy, with
    no SPY lot in the book, is not priced at risk.MISSING_STRESS (100%) and leaves room for M3's IBIT switch-on."""
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = SynthProvider()
    prev, day = "2025-10-07", "2025-10-08"
    run = pipeline.Run(cfg, provider, state_dir, "daily", day)
    try:
        run.state["marks"] = [{"date": prev, "nav": 100_000.0, "drawdown": 0.0, "peak": 100_000.0}]
        for t, dollars in (("IEF", 30_000.0), ("GLD", 20_000.0)):         # M2 holds IEF and GLD only
            run.broker.queue(OrderIntent(intent_id=f"O-{prev}-M2-{t}", trade_id=f"T-{prev}-M2", module="M2",
                                         account="ira", ticker=t, side="buy", created_date=prev, reason="rebalance",
                                         dollars=dollars))
        opens = {t: float(provider.frames[t].at[pd.Timestamp(day), "open"]) for t in ("IEF", "GLD")}
        assert len(run.broker.fill_pending(day, opens)) == 2
        run.broker.queue(OrderIntent(intent_id=f"O-{day}-W10-0001", trade_id=f"T-{day}-W10", module="W10",
                                     account="ira", ticker="SPY", side="buy", created_date=day, reason="entry",
                                     dollars=6_000.0))
        legs = [{"occ": occ_symbol("XSP", "2025-12-19", "C", k), "root": "XSP", "right": "C", "strike": k,
                 "expiry": "2025-12-19", "position": pos, "ratio": 1} for k, pos in ((670.0, "long"), (700.0, "short"))]
        run.broker.queue(OrderIntent(intent_id=f"O-{day}-M4-0002", trade_id=f"T-{day}-M4", module="M4",
                                     account="taxable", ticker="XSP", side="buy", created_date=day, reason="entry",
                                     order_type="spread_limit", legs=legs, contracts=1, limit_price=8.0, max_price=8.5))
        stress = run.stress()
        assert "SPY" in stress and "XSP" not in stress          # a spread counts at its maximum debit, not by root
        book = run.open_stress(stress)
        assert book["by_module"]["M2"] == pytest.approx(0.045 * 100_000.0)          # the M2 sleeve at its cap
        assert book["pending"] == pytest.approx(6_000.0 * 0.326 + 850.0)            # W10 at its 32.6% floor, not 100%
        adm = run.admit("M3", "IBIT", 0.03 * 100_000.0)
        assert adm["ok"] and adm["dollars"] == pytest.approx(3_000.0) and adm["binding"] is None
    finally:
        run.close()
