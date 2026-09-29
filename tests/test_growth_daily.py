"""The daily run under the growth book (design v4 §3, the status table; Phase C3): offline, synthetic.

The market is tests/test_pipeline.py's (an M1 dip on 14-15 Oct 2025, a -3.1% S&P day on 7 Oct 2025, M2's first monthly
decision on 1 Oct 2025, the Bitcoin switch on at launch) plus the book's tickers. With the production config (growth
enabled, M1/M4/W8/W9 shadow, M2 retired, M3 superseded by G2) the v3.3 modules place no orders and send no emails,
their shadow books keep logging, W10's signal is handed to the Sunday job, and a cancelled order's alert says why.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest
from test_growth import GrowthProvider, btc_on, cfg_for, growth_intent, market, ramp_index
from test_pipeline import LAUNCH, SESSIONS, Recorder, SynthProvider, _bars

from traderec import growth, pipeline, runners
from traderec.config import load_config
from traderec.types import OrderIntent, Recommendation


def book_provider(missing: set | None = None) -> SynthProvider:
    """test_pipeline's market with SSO, QLD, ^NDX, SGOV and BTC-USD bars (the growth book's tickers)."""
    p = SynthProvider(missing)
    spy = p.frames["SPY"]["close"]
    p.frames["^NDX"] = _bars(spy * 30.0)
    p.frames["SSO"] = _bars(spy * 0.2)
    p.frames["QLD"] = _bars(spy * 0.15)
    p.frames["SGOV"] = _bars(pd.Series(100.0, index=SESSIONS))
    p.frames["BTC-USD"] = _bars(p.btc)                                 # every UTC day: G2's Sunday second source
    return p


def run_days(cfg, provider, state_dir: Path, rec: Recorder, start: str, end: str) -> None:
    """The production order over a window: daily Monday to Friday, weekly on Sundays."""
    for day in pd.date_range(start, end, freq="D"):
        d = day.strftime("%Y-%m-%d")
        if day.weekday() < 5:
            res = pipeline.run_daily(cfg, provider, state_dir, date=d, services=rec.services())
        elif day.weekday() == 6:
            res = pipeline.run_weekly(cfg, provider, state_dir, date=d, services=rec.services())
        else:
            continue
        assert res.status in ("ok", "no_session"), res.summary()


def state_of(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def records(state_dir: Path, kind: str | None = None) -> list[dict]:
    recs = [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]
    return [r for r in recs if kind is None or r["record_type"] == kind]


# ------------------------------------------------------------------------------------- the status helpers
def test_module_statuses_are_read_from_the_constitution():
    cfg = load_config()
    assert growth.enabled(cfg)
    assert {m: growth.module_trades(cfg, m) for m in ("M1", "M2", "M3", "M4", "W8", "W9", "W10", "G1", "GROWTH")} == {
        "M1": False, "M2": False, "M3": False, "M4": False, "W8": False, "W9": False, "W10": True, "G1": True, "GROWTH": True}
    off = growth.with_enabled(cfg, False)
    assert all(growth.module_trades(off, m) for m in ("M1", "M2", "M3", "M4", "W8", "W9", "W10"))
    assert growth.status_blocks_trading("superseded_by: G2") and growth.status_blocks_trading("Shadow")
    assert growth.status_blocks_trading("retired") and not growth.status_blocks_trading("active")
    assert not growth.status_blocks_trading("paper") and not growth.status_blocks_trading("")


# ------------------------------------------------------------------------- the daily run under the book
def test_shadow_and_retired_modules_place_no_orders_and_the_book_trades(tmp_path):
    cfg = load_config()                                                # production: growth on, the v4 statuses
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    rec = Recorder()
    run_days(cfg, book_provider(), state_dir, rec, LAUNCH, "2025-10-24")
    st = state_of(state_dir)
    kinds = [(e.meta.get("kind"), e.meta.get("trade_id")) for e in rec.sent]
    assert [k for k in kinds if k[0] != "GROWTH"] == [], kinds        # no M1 / M2 / M3 / W10 entry emails
    assert [k[0] for k in kinds] == ["GROWTH"] * 3                    # only the Sunday emails (5, 12, 19 Oct)
    assert st["modules"]["M1"]["open_trade"] is None and st["modules"]["M3"]["open_trade"] is None
    modules_with_lots = {k.split("|")[2] for k in st["broker"]["lots"]}
    assert modules_with_lots >= {"G1", "G2"} and not modules_with_lots & {"M1", "M2", "M3"}
    orders = records(state_dir, "order")
    assert {o["payload"]["module"] for o in orders} <= {"G1", "G2", "GROWTH", "W10"}
    # M1 is shadow: its own rule keeps logging as the ST1 shadow book (next to ST1B), entered at the next open
    st1 = st["shadow"]["ST1"]
    trades = st1["trades"] + ([st1["open_trade"]] if st1.get("open_trade") else [])
    assert trades and trades[0]["signal_date"] == "2025-10-15" and trades[0]["fill_date"] == "2025-10-16"
    assert any(r["payload"].get("book") == "ST1" and r["payload"].get("event") == "signal" and r["as_of"] == "2025-10-15"
               for r in records(state_dir, "shadow"))
    assert not [r for r in records(state_dir, "signal") if r["payload"].get("module") == "M1"]   # no daily M1 records
    # M2 is retired: the monthly decision is logged (the shadow series), nothing is sent or deferred
    m2 = [r for r in records(state_dir, "shadow") if r["payload"].get("book") == "M2"]
    assert [r["as_of"] for r in m2] == ["2025-10-01"] and m2[0]["payload"]["event"] == "monthly_targets"
    assert [r["as_of"] for r in records(state_dir, "signal") if r["payload"].get("module") == "M2"] == ["2025-10-01"]
    assert st["modules"]["M2"]["deferred"] == [] and st["modules"]["M2"]["history"] == []
    # M3 is superseded by G2: the daily catch-up never runs, G2 holds the IBIT lot
    assert not [r for r in records(state_dir, "signal") if r["payload"].get("module") == "M3"]
    assert "ira|IBIT|G2" in st["broker"]["lots"] and st["modules"]["M3"]["on"] is None
    assert st["counters"]["trades"] == {}                              # the v3.3 trade budget saw nothing


def test_the_same_market_trades_the_v33_book_when_growth_is_off(tmp_path):
    cfg = growth.with_enabled(load_config(), False)
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    rec = Recorder()
    run_days(cfg, book_provider(), state_dir, rec, LAUNCH, "2025-10-17")
    kinds = {(e.meta.get("kind"), (e.meta.get("trade_id") or "")[-3:]) for e in rec.sent}
    assert {("SWITCH_ON", "-M3"), ("REBALANCE", "-M2"), ("NEW_TRADE", "W10"), ("NEW_TRADE", "-M1")} <= kinds
    assert "ST1" not in state_of(state_dir)["shadow"]                  # the ST1 book exists only while M1 is shadow


def test_w10_signal_is_handed_to_the_sunday_job_and_bought_from_cash_on_monday(tmp_path):
    cfg = load_config()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    rec = Recorder()
    run_days(cfg, book_provider(), state_dir, rec, LAUNCH, "2025-10-10")        # the -3.1% day is Tue 7 Oct
    st = state_of(state_dir)
    fired = st["modules"]["W10"]["fired"]
    assert fired["signal_date"] == "2025-10-07" and fired["ret"] < -0.03 and fired["close"] > 0
    assert fired["second_source"]["source"] == "nasdaq" and "handled" not in fired
    assert st["modules"]["W10"]["open_trade"] is None
    assert [e.meta.get("kind") for e in rec.sent] == ["GROWTH"]       # Sunday 5 Oct's email only; no W10 email
    sig = [r for r in records(state_dir, "signal") if r["payload"].get("module") == "W10" and r["payload"].get("check") == "fired"]
    assert [r["as_of"] for r in sig] == ["2025-10-07"] and sig[0]["payload"]["handoff"] == "sunday_email"
    assert [e["signal_date"] for e in st["shadow"]["W10"]["events"]] == ["2025-10-07"]   # the shadow record too
    run_days(cfg, book_provider(), state_dir, rec, "2025-10-11", "2025-10-13")           # Sunday, then Monday
    st = state_of(state_dir)
    facts = st["growth"]["last_facts"]
    assert facts["w10"]["state"] == "fired" and facts["w10"]["signal_date"] == "2025-10-07"
    assert [(o["ticker"], o["sleeve"]) for o in facts["orders"]["step2"] if o["sleeve"] == "W10"] == [("SPY", "W10")]
    ot = st["modules"]["W10"]["open_trade"]
    assert ot["trade_id"] == "T-2025-10-07-W10" and ot["status"] == "open" and ot["fill_date"] == "2025-10-13"
    assert ot["exit_date"] == "2026-01-09" and "ira|SPY|W10" in st["broker"]["lots"]
    assert st["modules"]["W10"]["fired"]["handled"] == "2025-10-12" and st["modules"]["W10"]["fired"]["sent"] is True
    assert [e.meta.get("kind") for e in rec.sent] == ["GROWTH", "GROWTH"]   # the entry rides Sunday 12 Oct's email
    assert "SPY" in rec.sent[-1].text and "W10" in rec.sent[-1].text


def test_w10_emits_its_own_order_when_growth_is_off(tmp_path):
    cfg = growth.with_enabled(load_config(), False)
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    rec = Recorder()
    run_days(cfg, book_provider(), state_dir, rec, LAUNCH, "2025-10-08")
    st = state_of(state_dir)
    assert "fired" not in st["modules"]["W10"] and st["modules"]["W10"]["open_trade"]["trade_id"] == "T-2025-10-07-W10"
    assert ("NEW_TRADE", "T-2025-10-07-W10") in {(e.meta.get("kind"), e.meta.get("trade_id")) for e in rec.sent}


# ------------------------------------------------------------------------------- the emit gate, the runners
def test_emit_logs_a_shadow_record_for_a_shadow_module_and_lets_exits_through(tmp_path):
    cfg = load_config()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    run = pipeline.Run(cfg, book_provider(), state_dir, "daily", "2025-10-15")
    try:
        buy = OrderIntent(intent_id="O-1", trade_id="T-2025-10-15-M1", module="M1", account="ira", ticker="SPY",
                          side="buy", created_date="2025-10-15", reason="entry", dollars=6_000.0)
        rec = Recommendation("NEW_TRADE", "M1", "T-2025-10-15-M1", "2025-10-15", [buy], {"any": 1})
        assert run.emit(rec) is False
        assert run.broker.pending() == [] and run.outgoing == []
        shadow = [r for r in run.ledger.records("shadow")]
        assert shadow[-1]["payload"]["event"] == "blocked_by_status" and shadow[-1]["payload"]["status"] == "shadow"
        assert shadow[-1]["payload"]["orders"][0]["intent_id"] == "O-1" and shadow[-1]["payload"]["book"] == "M1"
        # an EXIT of a position the module still holds is not blocked by its status: it reaches the renderer
        sell = OrderIntent(intent_id="O-2", trade_id="T-2025-10-15-M1", module="M1", account="ira", ticker="SPY",
                           side="sell", created_date="2025-10-15", reason="exit_rule", close_all=True)
        out = run.emit(Recommendation("EXIT", "M1", "T-2025-10-15-M1", "2025-10-15", [sell], {}))
        assert not any(r["payload"].get("event") == "blocked_by_status" and r["payload"].get("kind") == "EXIT"
                       for r in run.ledger.records("shadow"))
        assert out is True and [o.intent_id for o in run.broker.pending()] == ["O-2"] and len(run.outgoing) == 1
    finally:
        run.close()
    assert pipeline.EXIT_KINDS == ("EXIT", "SWITCH_OFF")


def test_m4_and_w8_w9_entries_are_skipped_while_shadow(tmp_path, monkeypatch):
    cfg = load_config()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    calls: list[str] = []
    sig = {"signal": True, "confirmed": True, "drawdown": -0.2, "vix": 35.0, "close": 3_000.0}
    monkeypatch.setattr(runners.m4, "_evaluate", lambda run, checks, cfg_m4, st: dict(sig))
    monkeypatch.setattr(runners.m4, "_enter", lambda *a, **k: calls.append("M4 enter"))
    monkeypatch.setattr(runners.m4, "_twin_signal", lambda run, s: calls.append("twin signal"))
    monkeypatch.setattr(runners.m4, "_twin_evening", lambda run: None)
    for name in ("_w8", "_w9"):
        monkeypatch.setattr(runners.macro, name, lambda run, ctx, name=name: calls.append(name))

    class Ctx:
        pm = md = object()

        def __init__(self, run):
            pass

    monkeypatch.setattr(runners.macro, "_Ctx", Ctx)
    for flag, expect in ((True, ["twin signal"]), (False, ["twin signal", "M4 enter", "_w8", "_w9"])):
        calls.clear()
        run = pipeline.Run(growth.with_enabled(cfg, flag), book_provider(), state_dir, "daily", "2025-10-15")
        try:
            runners.m4.daily(run, {"vix_series": pd.Series([15.0], index=[pd.Timestamp("2025-10-15")]), "vix": 15.0})
            runners.macro.daily(run, {})
            assert calls == expect, (flag, calls)
            if flag:
                assert any(r["payload"].get("event") == "signal_while_shadow" and r["payload"].get("book") == "M4"
                           for r in run.ledger.records("shadow"))
        finally:
            run.close()


# ------------------------------------------------------------ the SGOV sweep is listed after W10 (a C3 replay bug)
def test_the_sgov_sweep_is_listed_and_queued_after_w10_so_w10_keeps_its_cash():
    from traderec.broker import PaperBroker
    from traderec.growth import orders as orders_mod

    gcfg = load_config().constitution["growth"]
    targets = orders_mod.sleeve_targets({"SSO": True, "QLD": True}, True, 80_000.0, 1.0, gcfg, w10_buy_usd=4_800.0)
    held = {"SSO": 20_000.0, "QLD": 20_000.0, "IBIT": 24_000.0, "SGOV": 0.0}
    w10 = {"buy_usd": 4_800.0, "ticker": "SPY", "module": "W10", "trade_id": "T-2025-10-07-W10"}
    os = orders_mod.build_order_set(targets, held, 16_000.0, G=1.0, G_last_order=1.0, cfg_growth=gcfg, w10=w10)
    assert [(o["action"], o["ticker"], o["usd"]) for o in os["orders"]] == [("buy", "SPY", 4_800.0), ("buy", "SGOV", 11_200.0)]
    b = PaperBroker.new(cfg_for())
    b._cash["ira"] = 16_000.0
    for n, o in enumerate(os["orders"], start=1):
        b.queue(growth_intent(n, o["ticker"], "buy", o["usd"], created="2025-10-12", module=o["module"],
                              cap=0.90 if o["ticker"] != "SGOV" else None))
    fills = b.fill_pending("2025-10-13", {"SPY": 500.0})
    assert [(f.ticker, f.dollars) for f in fills] == [("SPY", 4_800.0), ("SGOV", 11_200.0)] and b.cancelled == []


# ---------------------------------------------------------------------------------- the cancel reason
def test_cancel_alert_carries_the_brokers_reason(tmp_path):
    cfg = cfg_for()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created="2026-09-27")
    run = pipeline.Run(cfg, GrowthProvider(**market(ramp_index(), btc_on())), state_dir, "daily", "2026-09-28")
    try:
        run.broker.queue(growth_intent(9, "SSO", "buy", 75_000.0))       # 93.75% of the $80k: the 90% cap cancels it
        pipeline._fill_pending(run, run.bars("SPY").index)
        alerts = [a for a in run.state["alerts"] if a["kind"] == "fill"]
        assert len(alerts) == 1 and "O-9" in alerts[0]["message"] and "exceeds 90%" in alerts[0]["message"]
        assert "no open price" not in alerts[0]["message"]
        corr = [r for r in run.ledger.records("correction") if "cancelled_order" in r["payload"]]
        assert corr[-1]["payload"]["reason"].startswith("buy of $75,000.00 exceeds 90%")
        assert pipeline._cancel_reason(run, "O-9").startswith("buy of $75,000.00") and pipeline._cancel_reason(run, "O-x") is None
    finally:
        run.close()


@pytest.mark.parametrize("flag", [True, False])
def test_dry_runs_change_nothing_under_either_book(tmp_path, flag):
    cfg = growth.with_enabled(load_config(), flag)
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    before = (state_dir / "state.json").read_bytes(), (state_dir / "ledger.jsonl").read_bytes()
    res = pipeline.run_daily(cfg, book_provider(), state_dir, date=LAUNCH, dry_run=True, services=Recorder().services())
    assert res.status == "ok" and res.dry_run
    assert ((state_dir / "state.json").read_bytes(), (state_dir / "ledger.jsonl").read_bytes()) == before
