"""The Sunday email, the validator's GROWTH and RULE_E slots, and Rule E (design v4 Appendix A.4 groups 4 and 6,
the §11 first Sunday end to end). Offline, on tests/test_growth.py's fake providers and fixtures."""
from __future__ import annotations

import copy
import dataclasses
import json
import re
from pathlib import Path

import pandas as pd
import pytest

from test_growth import (END, HIST_START, LAUNCH, GrowthProvider, Recorder, btc_on, cfg_for, frame, market, path,
                         ramp_index, records, state_of, trading_days)

from traderec import pipeline
from traderec.emails import NumberRegistry
from traderec.growth import rule_e
from traderec.growth.email import render_growth, render_rule_e, slot_specs
from traderec.validator import _fmt_spec, html_to_text, validate

FIRST_SUNDAY_TEXT = ("This week: 1 recommendation, 3 orders.", "Nothing to sell: Step 1 is empty this week.",
                     "Buy $20,000 of SSO, market, in dollars", "Buy $20,000 of QLD, market, in dollars",
                     "Buy $24,000 of IBIT, market, in dollars", "Deferred to next Sunday: buy $16,000 of SGOV",
                     "Before you hold SSO (2x S&P 500 fund)", "Before you hold QLD (2x Nasdaq-100 fund)",
                     "Before you hold IBIT (iShares Bitcoin ETF)",
                     "a 1987-style day costs this book about 29.5% before any rule can act",
                     "the hard stop sells everything at −40%", "IRA gains can't be withdrawn before 59½ without a 10%",
                     "Tax: no tax on trades inside the IRA", "each buy is at most 95% of the cash it needs",
                     "S&P 500 closed 7,743 on the primary source and 7,743 on Nasdaq")


class IssueRecorder(Recorder):
    """The Recorder of test_growth plus GitHub issues (one URL per call)."""

    def __init__(self) -> None:
        super().__init__()
        self.issues: list[tuple[str, str, list | None]] = []

    def services(self) -> pipeline.Services:
        base = super().services()

        def create_issue(title, body, labels=None):
            self.issues.append((title, body, labels))
            return f"https://github.com/example/repo/issues/{len(self.issues)}"
        return dataclasses.replace(base, create_issue=create_issue)


def cfg_with_issues(**over):
    cfg = cfg_for(**over)
    cfg.account["github_issues"] = True
    return cfg


def daily(cfg, provider, state_dir, day: str, rec: Recorder):
    res = pipeline.run_daily(cfg, provider, state_dir, date=day, services=rec.services())
    assert res.status == "ok", res.summary()
    return res


def growth_state(state_dir: Path) -> dict:
    return state_of(state_dir)["growth"]


def write_state(state_dir: Path, st: dict) -> None:
    (state_dir / "state.json").write_text(json.dumps(st))


def blocks_of(text: str) -> list[str]:
    return [b for b in text.split("\n\n") if b.strip()]


def flat(text: str) -> str:
    """The text part with its 72-column wrapping and box borders undone (phrases are compared whole, as the
    validator reads them)."""
    return re.sub(r"\s+", " ", re.sub(r"[─-╿]", " ", text))


# ================================================================ the §11 first Sunday email, end to end
@pytest.fixture(scope="module")
def first_sunday(tmp_path_factory):
    """The design §11 first Sunday through the real weekly job: the state, the email and the issues."""
    cfg = cfg_with_issues()
    state_dir = tmp_path_factory.mktemp("first") / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = GrowthProvider(**market(ramp_index(), btc_on()))
    rec = IssueRecorder()
    res = pipeline.run_weekly(cfg, provider, state_dir, date=LAUNCH, services=rec.services())
    assert res.status == "ok" and rec.pings[-1] == "success", res.summary()
    return {"cfg": cfg, "state_dir": state_dir, "provider": provider, "rec": rec, "res": res,
            "facts": state_of(state_dir)["growth"]["last_facts"], "email": rec.sent[-1]}


def test_first_sunday_email_renders_validates_three_orders_the_deferral_and_three_issues(first_sunday):
    email, rec, res = first_sunday["email"], first_sunday["rec"], first_sunday["res"]
    assert len(rec.sent) == 1 and validate(email) == []
    assert email.subject.startswith("[PAPER][GROWTH G-2026-09-27] week 39: 3 orders")
    assert [e["outcome"] for e in res.emails] == ["sent"] and res.emails[0]["kind"] == "GROWTH"
    text, html = flat(email.text), flat(html_to_text(email.html))
    for phrase in FIRST_SUNDAY_TEXT:
        assert phrase in text, phrase
        assert phrase in html, phrase
    # the body order of design §9: summary, target vs now, why, step 1, step 2, deferred, risks, Robinhood, what if
    order = ["THIS WEEK", "TARGET VS NOW", "WHY", "STEP 1: THE SELLS", "STEP 2: THE BUYS", "DEFERRED", "RISKS AND TAX",
             "DO THIS IN ROBINHOOD", "WHAT IF", "SOURCES (TWO-SOURCE CHECKS)", "RECORD YOUR FILLS"]
    positions = [text.index(h) for h in order]
    assert positions == sorted(positions)
    buys = [text.index(f"Buy ${usd} of {t}") for t, usd in (("SSO", "20,000"), ("QLD", "20,000"), ("IBIT", "24,000"))]
    assert buys == sorted(buys)
    assert "Buy $16,000 of SGOV" not in text                           # deferred, not an order
    steps = email.text.split("DO THIS IN ROBINHOOD")[1].split("WHAT IF")[0]
    assert len(re.findall(r"\n  \d+\. ", steps)) <= 7 and "Account → Retirement" in steps and "Buy in: Dollars" in steps
    # one issue per order, titled with the order, recorded for the fill comments (feedback matches by trade id)
    assert [t.split(" — ")[0] for t, _, _ in rec.issues] == [
        "[PAPER][GROWTH G-2026-09-27-SSO] Buy $20,000 of SSO (1 of 3)",
        "[PAPER][GROWTH G-2026-09-27-QLD] Buy $20,000 of QLD (2 of 3)",
        "[PAPER][GROWTH G-2026-09-27-IBIT] Buy $24,000 of IBIT (3 of 3)"]
    assert all(labels == ["traderec", "paper", "GROWTH"] for _, _, labels in rec.issues)
    assert "This week: 1 recommendation, 3 orders." in rec.issues[0][1] and "issues/1" in rec.issues[1][1]
    assert all("Record your fill as a comment" in body for _, body, _ in rec.issues)
    issues = state_of(first_sunday["state_dir"])["issues"]
    assert [(i["trade_id"], i["tickers"], i["kind"]) for i in issues] == [
        ("G-2026-09-27-SSO", ["SSO"], "GROWTH"), ("G-2026-09-27-QLD", ["QLD"], "GROWTH"), ("G-2026-09-27-IBIT", ["IBIT"], "GROWTH")]
    for k, t in enumerate(("SSO", "QLD", "IBIT"), start=1):
        assert f"{t}: https://github.com/example/repo/issues/{k}" in text
    # the recommendation record carries the facts and the growth_decision / order_set ids
    facts = first_sunday["facts"]
    recs = records(first_sunday["state_dir"], "recommendation")
    assert len(recs) == 1 and recs[0]["payload"]["kind"] == "GROWTH" and recs[0]["payload"]["trade_id"] == "G-2026-09-27"
    assert recs[0]["payload"]["facts"]["ids"]["growth_decision"] == facts["ids"]["growth_decision"]
    assert recs[0]["payload"]["ids"]["order_set"] == facts["ids"]["order_set"]
    assert facts["email"]["record"] == recs[0]["hash"] and facts["email"]["blocked"] is False
    assert set(facts["ids"]) == {"growth_decision", "governor", "order_set"}
    assert [o["intent_id"] for o in facts["orders"]["step2"]] == [o["intent_id"] for o in recs[0]["payload"]["orders"]]
    assert email.meta["kind"] == "GROWTH" and email.meta["trade_id"] == "G-2026-09-27"
    assert email.meta["facts"] == {k: v for k, v in facts.items() if k != "email"}    # the send result is added after
    assert facts["risk"]["funds"].keys() == {"SSO", "QLD", "IBIT"} and facts["limited_margin"] is True
    assert facts["rule_e"]["count_year"] == 0 and facts["rule_e"]["scored"] == []


def test_first_sunday_dry_run_renders_into_the_outbox_without_sending(tmp_path):
    cfg = cfg_with_issues()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    rec = IssueRecorder()
    res = pipeline.run_weekly(cfg, GrowthProvider(**market(ramp_index(), btc_on())), state_dir, date=LAUNCH, dry_run=True,
                              services=rec.services())
    assert res.status == "ok" and [e["outcome"] for e in res.emails] == ["outbox"]
    assert rec.issues == [] and len(rec.sent) == 1 and validate(rec.sent[0]) == []
    assert "There's no GitHub issue link this time" in flat(rec.sent[0].text)


# ================================================================ 4. the validator: value AND slot
def test_validator_rejects_a_number_that_is_not_in_the_facts(first_sunday):
    email = first_sunday["email"]
    foreign = dataclasses.replace(email, text=email.text.replace("Buy $20,000 of SSO", "Buy $21,000 of SSO"))
    problems = validate(foreign)
    assert problems and any('"$21,000" is not registered' in p for p in problems)
    # a registered number in the wrong slot (IBIT's $24,000 on SSO's line) fails the slot check
    swapped = dataclasses.replace(email, text=email.text.replace("Buy $20,000 of SSO", "Buy $24,000 of SSO"))
    problems = validate(swapped)
    assert problems and any("b__s2_SSO" in p and '"$24,000"' in p and '"$20,000"' in p for p in problems)
    # the same on the target table, the why line and the risk box
    for old, new, field in (("SSO   in       25%", "SSO   in       30%", "tp__row_SSO"),
                            ("closed 7,743, ", "closed 7,371, ", "c__why_SSO"),
                            ("a 0.84% fee", "a 0.89% fee", "fee__rb_cost_SSO")):
        assert old in email.text, old
        bad = dataclasses.replace(email, text=email.text.replace(old, new))
        assert any(field in p for p in validate(bad)), (field, validate(bad))
    # changing the facts under the email fails too: the values are rebuilt from the facts, not the text
    facts = copy.deepcopy(email.meta["facts"])
    facts["orders"]["step2"][0]["usd"] = 19_000.0
    bad = dataclasses.replace(email, meta={**email.meta, "facts": facts})
    assert any("b__s2_SSO" in p and '"$19,000"' in p for p in validate(bad))
    # dropping a required phrase (the deferred line) fails the "reworded or changed" check
    gone = dataclasses.replace(email, text=email.text.replace("Deferred to next Sunday: buy $16,000 of SGOV", "Deferred: SGOV"))
    assert any("missing (reworded or changed)" in p for p in validate(gone))


def test_validator_formatter_matches_the_registry():
    cases = [(20000.0, "money"), (101.234, "money2"), (-9084.4, "smoney"), (0.0, "smoney"), (20000.0, "smoney"),
             (0.0, "pct1"), (0.173, "pct1"), (0.15, "pct0"), (0.4, "npct0"), (7.46, "ppct1"), (-20.5, "ppct1"),
             (0.84, "ppct2"), (10.0, "ppct0"), (-1.8, "appct1"), (-40.0, "nppct0"), (1.25, "sppct2"), (7743.0, "num0"),
             (7205.4, "num0"), (1.0, "num2"), (0.667, "num2"), (3, "int"), (39, "int"), (1987, "year"), (200, "int")]
    for value, spec in cases:
        assert _fmt_spec(value, spec) == NumberRegistry().fmt(value, spec), (value, spec)


# ================================================================ 4. the risk box, Step 1 / Step 2, the deferred line
def facts_variant(base: dict, **over) -> dict:
    f = copy.deepcopy(base)
    f.update(over)
    return f


def all_out(base: dict) -> dict:
    """A week with every sleeve out, nothing held and no orders: no leveraged fund is bought or held."""
    f = copy.deepcopy(base)
    for s in f["sleeves"]:
        s["state"] = "off" if s["ticker"] == "IBIT" else ("reserve" if s["ticker"] == "SGOV" else "out")
        s["held_usd"], s["delta_usd"], s["changed"] = 0.0, 0.0, False
        if s["ticker"] != "SGOV":
            s["target_usd"], s["target_pct"] = 0.0, 0.0
    f["orders"].update(step1=[], step2=[], deferred=[], dropped=[], skipped=[])
    f["summary"] = {"changes": 0, "orders": 0, "recommendation": False}
    f["risk"]["leveraged_held"], f["risk"]["funds"] = [], {}
    return f


def test_risk_box_is_present_whenever_sso_qld_or_ibit_is_bought_or_held(first_sunday):
    base = first_sunday["facts"]
    # bought this week: three boxes (the first Sunday)
    text = first_sunday["email"].text
    assert flat(text).count("how it can hurt you") == 3
    # nothing bought or held: no box, and the email still validates
    quiet = render_growth(all_out(base), {"mode": "paper"})
    assert validate(quiet) == [] and "how it can hurt you" not in flat(quiet.text)
    assert "This week: no change." in quiet.text and "no change" in quiet.subject
    # held but no order: the box for the held fund only
    held = all_out(base)
    sso = next(s for s in held["sleeves"] if s["ticker"] == "SSO")
    sso.update(state="in", held_usd=20_400.0, target_usd=20_000.0, target_pct=25.0, delta_usd=-400.0)
    held["risk"]["funds"] = {"SSO": base["risk"]["funds"]["SSO"]}
    email = render_growth(held, {"mode": "paper"})
    assert validate(email) == [] and flat(email.text).count("how it can hurt you") == 1 and "Before you hold SSO" in email.text
    # the box cannot be dropped: a rendered email without it fails, and facts without the fund's numbers fail
    box_start = first_sunday["email"].text.index("RISKS AND TAX")
    box_end = first_sunday["email"].text.index("Crash risk:")
    stripped = dataclasses.replace(first_sunday["email"], text=text[:box_start] + "RISKS AND TAX\n" + text[box_end:])
    problems = validate(stripped)
    assert any("missing (reworded or changed)" in p and "resets every day" in p for p in problems)
    no_numbers = copy.deepcopy(held)
    no_numbers["risk"]["funds"] = {}
    assert any("risk box: SSO is bought or held" in p for p in validate(render_growth(no_numbers, {"mode": "paper"})))


def test_step_1_sells_come_before_step_2_buys_and_the_deferred_line(first_sunday):
    base = first_sunday["facts"]
    f = copy.deepcopy(base)
    f["orders"]["step1"] = [
        {"action": "sell_all", "ticker": "SSO", "held_usd": 11_800.0, "usd": None, "rank": 1, "reason": "switch_off",
         "sleeve": "G1", "intent_id": "O-1", "trade_id": "G-2026-10-04-SSO"},
        {"action": "sell", "ticker": "IBIT", "held_usd": 21_084.0, "usd": 9_084.0, "rank": 2, "reason": "governor_cut",
         "sleeve": "G2", "intent_id": "O-2", "trade_id": "G-2026-10-04-IBIT"}]
    f["orders"]["step2"] = [{"action": "buy", "ticker": "QLD", "usd": 5_000.0, "cash_cap_usd": 18_000.0, "rank": 3,
                             "reason": "rebalance", "sleeve": "G1", "intent_id": "O-3", "trade_id": "G-2026-10-04-QLD"}]
    f["orders"]["deferred"] = [{"action": "buy", "ticker": "SGOV", "usd": 15_500.0, "sleeve": "SGOV",
                                "why": "the 3 orders are used; the SGOV buy of idle cash may wait a week"}]
    f["summary"] = {"changes": 2, "orders": 3, "recommendation": True}
    for s in f["sleeves"]:
        s["held_usd"] = {"SSO": 11_800.0, "QLD": 12_000.0, "IBIT": 21_084.0, "SGOV": 0.0}[s["ticker"]]
    email = render_growth(f, {"mode": "paper", "issue_urls": {"O-1": "https://github.com/x/y/issues/7"}})
    assert validate(email) == []
    t = flat(email.text)
    i1, s1, s2, i2, b, d = (t.index("STEP 1: THE SELLS"), t.index("Sell all SSO, market ($11,800 at Friday's close)"),
                            t.index("Sell $9,084 of IBIT, market, in dollars"), t.index("STEP 2: THE BUYS"),
                            t.index("Buy $5,000 of QLD, market, in dollars"), t.index("DEFERRED"))
    assert i1 < s1 < s2 < i2 < b < d
    assert "Deferred to next Sunday: buy $15,500 of SGOV (the 3 orders are used" in t
    assert "the sleeve switched off" in t and "the governor cut the size" in t
    assert "Step 1 tonight, Step 2 Mon 28 Sep from 9:35 ET" in email.subject
    assert "Place these tonight, or before 9:20 ET on Mon 28 Sep" in t
    assert "Place these on Mon 28 Sep from 9:35 ET, once every Step 1 sell shows Filled." in t
    assert "check Account → History shows every sell as Filled" in t
    assert "SSO: https://github.com/x/y/issues/7" in t
    # without limited margin, Step 2 is Tuesday (design §3a.4)
    tuesday = render_growth(facts_variant(f, limited_margin=False), {"mode": "paper"})
    assert validate(tuesday) == [] and "Place these on Tue 29 Sep from 9:35 ET" in flat(tuesday.text)
    assert "no limited margin, so Monday's sale proceeds settle overnight" in flat(tuesday.text)
    # a Monday holiday moves everything to Tuesday, and the email says so
    holiday = render_growth(facts_variant(f, holiday="2026-09-08", execute_date="2026-09-08"), {"mode": "paper"})
    assert validate(holiday) == []
    assert "Monday is an NYSE holiday: Step 1 by 9:20 ET on Tue 8 Sep, Step 2 that day from 9:35 ET." in flat(holiday.text)
    # LIVE label
    live = render_growth(facts_variant(f, label="LIVE"), {"mode": "live"})
    assert live.subject.startswith("[LIVE][GROWTH") and "LIVE TRADE" in live.text and validate(live) == []


def test_no_change_week_sends_the_short_email_unless_switched_off(tmp_path):
    cfg = cfg_for()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = GrowthProvider(**market(ramp_index(), btc_on()))
    rec = Recorder()
    for sunday in (LAUNCH, "2026-10-04"):                      # the buys, then the SGOV sweep of the idle cash
        assert pipeline.run_weekly(cfg, provider, state_dir, date=sunday, services=rec.services()).status == "ok"
        daily(cfg, provider, state_dir, (pd.Timestamp(sunday) + pd.Timedelta(days=1)).strftime("%Y-%m-%d"), rec)
    res = pipeline.run_weekly(cfg, provider, state_dir, date="2026-10-11", services=rec.services())
    assert res.status == "ok" and [e["outcome"] for e in res.emails] == ["sent"]
    email = rec.sent[-1]
    assert validate(email) == [] and email.subject == "[PAPER][GROWTH G-2026-10-11] week 41: no change"
    assert "This week: no change." in email.text and "Nothing to place this week" in flat(email.text)
    assert "Buy $" not in email.text and "Sell all" not in email.text
    assert flat(email.text).count("how it can hurt you") == 3     # the funds are held
    facts = growth_state(state_dir)["last_facts"]
    assert facts["summary"]["orders"] == 0 and facts["email"]["subject"] == email.subject
    # switched off: the week is only in the ledger and the state
    const = copy.deepcopy(cfg.constitution)
    const["growth"]["email"]["send_no_change"] = False
    quiet = dataclasses.replace(cfg, constitution=const)
    res = pipeline.run_weekly(quiet, provider, state_dir, date="2026-10-18", services=rec.services())
    assert res.status == "ok" and res.emails == [] and any("send_no_change is off" in n for n in res.notes)


# ================================================================ 6. Rule E
def crash_market(gspc_drop_day: str = "2026-09-30", ndx_drop_day: str | None = None, factor: float = 0.85) -> dict:
    """The §11 ramp, then the S&P 500 (and the Nasdaq-100 on its own day) close `factor` x below the ramp: under
    the 200-day average, mid-week."""
    days = trading_days()
    index = path(days, [(HIST_START, 6_500.0), ("2026-09-25", 7_743.0), (END, 7_743.0)])
    index.loc[index.index >= pd.Timestamp(gspc_drop_day)] = 7_743.0 * factor
    mk = market(index, btc_on())
    ndx = path(days, [(HIST_START, 6_500.0 * 3), ("2026-09-25", 7_743.0 * 3), (END, 7_743.0 * 3)])
    ndx.loc[ndx.index >= pd.Timestamp(ndx_drop_day or gspc_drop_day)] = 7_743.0 * 3 * factor
    mk["bars"]["^NDX"] = frame(ndx)
    return mk


def invested(cfg, provider, state_dir, rec):
    """The first Sunday and its Monday fills: SSO, QLD and IBIT held."""
    assert pipeline.run_weekly(cfg, provider, state_dir, date=LAUNCH, services=rec.services()).status == "ok"
    daily(cfg, provider, state_dir, "2026-09-28", rec)
    daily(cfg, provider, state_dir, "2026-09-29", rec)
    assert {k.split("|")[1] for k in state_of(state_dir)["broker"]["lots"]} == {"SSO", "QLD", "IBIT"}


def test_rule_e_fires_on_a_weekday_close_below_the_sma_exit_only_once_a_week_and_is_scored_on_sunday(tmp_path):
    cfg = cfg_with_issues()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = GrowthProvider(**crash_market())
    rec = IssueRecorder()
    invested(cfg, provider, state_dir, rec)
    assert len(rec.sent) == 1                                    # the Sunday email only; Monday and Tuesday are quiet
    # Wednesday's close is 15% below the ramp: below the 200-day average on both indexes (no band)
    day = daily(cfg, provider, state_dir, "2026-09-30", rec)
    assert [e["kind"] for e in day.emails] == ["RULE_E"] and day.emails[0]["outcome"] == "sent"
    email = rec.sent[-1]
    assert validate(email) == []
    assert email.subject == "[PAPER][EXIT G-2026-09-30-RULE-E] Rule E: Sell all SSO and QLD — before 9:30 ET Thu 1 Oct"
    assert len(blocks_of(email.text)) <= 10
    text = flat(email.text)
    assert "Rule E, the emergency exit, fired at the close of Wed 30 Sep" in text
    assert "the S&P 500 closed 6,582, " in text and "below its 200-day average of" in text
    assert "Sell all SSO, market, queued for the next open: about $" in text and "(Thu 1 Oct)." in text
    assert "Sell all QLD, market, queued for the next open" in text
    assert "Buy the cash fund with the proceeds any time this week" in text
    assert "scored against waiting for Sunday" in text
    assert "Rule E has fired 1 of at most 6 times this year (and at most 1 a week)" in text
    assert "without the 2% band" in text and "Order type: Market, then Sell all" in text
    # exit-only: two "Sell all" orders queued for the next open, nothing bought; the legs are out
    st = state_of(state_dir)
    pending = st["broker"]["pending"]
    assert [(o["ticker"], o["side"], o["close_all"], o["reason"]) for o in pending] == [
        ("SSO", "sell", True, "rule_e"), ("QLD", "sell", True, "rule_e")]
    assert all(o["created_date"] == "2026-09-30" and o["module"] == "G1" for o in pending)
    re_st = st["growth"]["rule_e"]
    assert re_st["count_week"] == 1 and re_st["count_year"] == 1 and re_st["week"] == "2026-W40"
    assert re_st["last"]["tickers"] == ["SSO", "QLD"] and re_st["last"]["date"] == "2026-09-30" and re_st["last"]["score"] is None
    assert len(re_st["pending"]) == 2
    assert st["growth"]["sleeves"]["G1"]["SSO"]["in"] is False and st["growth"]["sleeves"]["G1"]["SSO"]["rule_e_exit"] == "2026-09-30"
    assert st["growth"]["sleeves"]["G1"]["QLD"]["in"] is False
    exits = [r for r in records(state_dir, "rule_e") if r["payload"]["event"] == "exit"]
    assert len(exits) == 1 and [lg["ticker"] for lg in exits[0]["payload"]["legs"]] == ["SSO", "QLD"]
    assert exits[0]["payload"]["legs"][0]["check"]["ok"] is True and exits[0]["payload"]["count_year"] == 1
    assert re_st["last"]["record"] == exits[0]["hash"]
    # one issue per leg, on the existing per-trade mechanism
    titles = [t for t, _, _ in rec.issues[3:]]
    assert titles == ["[PAPER][EXIT G-2026-09-30-SSO] Sell all SSO (1 of 2) — Rule E: Sell all SSO and QLD — before 9:30 ET Thu 1 Oct",
                      "[PAPER][EXIT G-2026-09-30-QLD] Sell all QLD (2 of 2) — Rule E: Sell all SSO and QLD — before 9:30 ET Thu 1 Oct"]
    assert [i["trade_id"] for i in st["issues"][3:]] == ["G-2026-09-30-SSO", "G-2026-09-30-QLD"]
    assert "SSO: https://github.com/example/repo/issues/4" in text
    # Thursday: the sells fill at the open; the close is still below, but the week's one Rule E is used: logged, not sent
    day = daily(cfg, provider, state_dir, "2026-10-01", rec)
    assert [(f["ticker"], f["side"]) for f in day.fills] == [("SSO", "sell"), ("QLD", "sell")]
    assert day.emails == [] and len(rec.sent) == 2
    st = state_of(state_dir)
    assert st["growth"]["rule_e"]["count_week"] == 1 and st["broker"]["pending"] == []
    assert {k.split("|")[1] for k in st["broker"]["lots"]} == {"IBIT"}
    capped = [r for r in records(state_dir, "rule_e") if r["payload"]["event"] == "capped"]
    assert capped == []                                          # the legs are out: nothing to trigger on Thursday
    # Sunday: scored against waiting for Sunday (the fill against Friday's close), and the Sunday email says so
    res = pipeline.run_weekly(cfg, provider, state_dir, date="2026-10-04", services=rec.services())
    assert res.status == "ok", res.summary()
    facts = growth_state(state_dir)["last_facts"]
    scored = facts["rule_e"]["scored"]
    assert [s["ticker"] for s in scored] == ["SSO", "QLD"] and facts["rule_e"]["count_year"] == 1
    fills = {f["intent_id"]: f for f in st["fills"]}
    sso = scored[0]
    assert sso["exit_price"] == pytest.approx(fills[sso["intent_id"]]["price"], abs=1e-4) and sso["exit_date"] == "2026-10-01"
    assert sso["alt_price"] == pytest.approx(float(provider.daily_bars("SSO").loc["2026-10-02", "close"]), abs=1e-4)
    assert sso["alt_date"] == "2026-10-02" and sso["alt_action"] == "exit"
    assert sso["edge_pct"] == pytest.approx(100.0 * (sso["exit_price"] / sso["alt_price"] - 1.0), abs=0.01)
    scores = [r for r in records(state_dir, "rule_e") if r["payload"]["event"] == "score"]
    assert [r["payload"]["ticker"] for r in scores] == ["SSO", "QLD"] and scores[0]["payload"]["trigger_record"] == exits[0]["hash"]
    re_st = growth_state(state_dir)["rule_e"]
    assert re_st["pending"] == [] and len(re_st["scores"]) == 2 and re_st["last"]["score"][0]["ticker"] == "SSO"
    assert re_st["running_pct"] == pytest.approx(scored[0]["edge_pct"] + scored[1]["edge_pct"], abs=0.01)
    sunday = rec.sent[-1]
    assert validate(sunday) == [] and "RULE E" in sunday.text
    assert "Rule E sold SSO on Thu 1 Oct at $" in flat(sunday.text) and "so the exit scored" in flat(sunday.text)
    assert "Rule E has fired 1 of at most 6 times this year" in flat(sunday.text)
    # the Sunday rule keeps the legs out (the close is far below the average): no second sell, the cash goes to SGOV
    assert [(o["action"], o["ticker"]) for o in facts["orders"]["step1"]] == []
    assert [(o["action"], o["ticker"]) for o in facts["orders"]["step2"]] == [("buy", "SGOV")]
    assert not [a for a in state_of(state_dir)["alerts"] if a["kind"] in ("fill", "order", "validator")]


def test_a_friday_rule_e_exit_is_not_sold_again_by_the_sunday_job(tmp_path):
    """Phase C4b finding 1: a Rule E sale queued on Friday night fills at Monday's open, so on Sunday the lot is still
    there; the Sunday job must not queue a second "Sell all" (live, a duplicate market sell) and its email says the
    sale is pending. Monday fills exactly one sale per leg; the next Sunday scores both."""
    cfg = cfg_with_issues()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = GrowthProvider(**crash_market("2026-10-02"))           # the drop lands on Friday 2 October
    rec = IssueRecorder()
    invested(cfg, provider, state_dir, rec)
    for d in ("2026-09-30", "2026-10-01"):
        assert daily(cfg, provider, state_dir, d, rec).emails == []
    day = daily(cfg, provider, state_dir, "2026-10-02", rec)
    assert [e["kind"] for e in day.emails] == ["RULE_E"]
    st = state_of(state_dir)
    assert [(o["ticker"], o["created_date"]) for o in st["broker"]["pending"]] == [("SSO", "2026-10-02"), ("QLD", "2026-10-02")]
    # Sunday: the legs are out and their sales are queued: no second sell; the idle cash goes to SGOV as usual
    res = pipeline.run_weekly(cfg, provider, state_dir, date="2026-10-04", services=rec.services())
    assert res.status == "ok", res.summary()
    facts = growth_state(state_dir)["last_facts"]
    assert [(o["action"], o["ticker"]) for o in facts["orders"]["step1"]] == []
    assert [(o["action"], o["ticker"]) for o in facts["orders"]["step2"]] == [("buy", "SGOV")]
    assert not [o for o in facts["orders"]["deferred"] if o["ticker"] in ("SSO", "QLD")]
    assert [(p["ticker"], p["created_date"], p["reason"], p["close_all"]) for p in facts["rule_e"]["pending_sells"]] == [
        ("SSO", "2026-10-02", "rule_e", True), ("QLD", "2026-10-02", "rule_e", True)]
    order_set = records(state_dir, "order_set")[-1]["payload"]
    assert set(order_set["pending_sells"]) == {"SSO", "QLD"} and order_set["held_after_pending"]["SSO"] == 0.0
    assert order_set["held"]["SSO"] > 0.0                             # the lot is still there at Friday's close
    sunday = rec.sent[-1]
    assert validate(sunday) == []
    text = flat(sunday.text)
    assert ("Rule E sold SSO on Fri 2 Oct: that sale fills at the next open, so this email carries no new order for it"
            in text)
    assert "Rule E sold QLD on Fri 2 Oct" in text
    st = state_of(state_dir)
    assert [(o["ticker"], o["created_date"]) for o in st["broker"]["pending"]] == [
        ("SSO", "2026-10-02"), ("QLD", "2026-10-02"), ("SGOV", "2026-10-04")]
    # Monday: exactly one sale per leg fills, nothing is cancelled, no alert
    day = daily(cfg, provider, state_dir, "2026-10-05", rec)
    assert [(f["ticker"], f["side"]) for f in day.fills][:2] == [("SSO", "sell"), ("QLD", "sell")]
    assert sum(1 for f in day.fills if f["ticker"] in ("SSO", "QLD")) == 2
    st = state_of(state_dir)
    assert st["broker"]["cancelled"] == [] and st["broker"]["pending"] == []
    lots = {k.split("|")[1] for k in st["broker"]["lots"]}
    assert "IBIT" in lots and not lots & {"SSO", "QLD"}
    assert not [a for a in st["alerts"] if a["kind"] in ("fill", "order", "validator")]
    # the next Sunday scores both exits against waiting for Sunday
    res = pipeline.run_weekly(cfg, provider, state_dir, date="2026-10-11", services=rec.services())
    assert res.status == "ok", res.summary()
    scored = growth_state(state_dir)["last_facts"]["rule_e"]["scored"]
    assert [(s["ticker"], s["exit_date"]) for s in scored] == [("SSO", "2026-10-05"), ("QLD", "2026-10-05")]
    assert growth_state(state_dir)["last_facts"]["rule_e"]["pending_sells"] == []


def test_rule_e_weekly_cap_a_second_leg_later_in_the_week_waits_for_sunday(tmp_path):
    cfg = cfg_for()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = GrowthProvider(**crash_market(gspc_drop_day="2026-10-01", ndx_drop_day="2026-09-30"))
    rec = Recorder()
    invested(cfg, provider, state_dir, rec)
    day = daily(cfg, provider, state_dir, "2026-09-30", rec)      # the Nasdaq-100 crosses on Wednesday: QLD out
    assert [e["kind"] for e in day.emails] == ["RULE_E"] and "Sell all QLD —" in rec.sent[-1].subject
    assert "SSO" not in rec.sent[-1].subject
    day = daily(cfg, provider, state_dir, "2026-10-01", rec)      # the S&P 500 crosses on Thursday: capped, logged
    assert day.emails == [] and any("the weekly cap" in n for n in day.notes)
    st = state_of(state_dir)
    capped = [r for r in records(state_dir, "rule_e") if r["payload"]["event"] == "capped"]
    assert len(capped) == 1 and capped[0]["payload"]["reason"] == "the weekly cap"
    assert [lg["ticker"] for lg in capped[0]["payload"]["legs"]] == ["SSO"]
    assert st["growth"]["rule_e"]["capped"][0]["tickers"] == ["SSO"] and st["growth"]["sleeves"]["G1"]["SSO"]["in"] is True
    assert [o["ticker"] for o in st["broker"]["pending"]] == []     # QLD's sell filled Thursday; no SSO order
    assert pipeline.run_weekly(cfg, provider, state_dir, date="2026-10-04", services=rec.services()).status == "ok"
    facts = growth_state(state_dir)["last_facts"]                 # Sunday sells SSO under the weekly rule
    assert [(o["action"], o["ticker"], o["reason"]) for o in facts["orders"]["step1"]] == [("sell_all", "SSO", "switch_off")]
    assert len(facts["rule_e"]["scored"]) == 1 and facts["rule_e"]["scored"][0]["ticker"] == "QLD"


def test_rule_e_annual_cap_the_seventh_is_logged_not_sent(tmp_path):
    cfg = cfg_for()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = GrowthProvider(**crash_market())
    rec = Recorder()
    invested(cfg, provider, state_dir, rec)
    st = state_of(state_dir)
    st["growth"]["rule_e"] = {"count_week": 0, "count_year": 6, "last": None, "week": "2026-W39", "year": "2026",
                              "pending": [], "scores": [], "capped": [], "running_pct": 0.0}
    write_state(state_dir, st)
    day = daily(cfg, provider, state_dir, "2026-09-30", rec)
    assert day.emails == [] and any("the annual cap" in n for n in day.notes)
    st = state_of(state_dir)
    assert st["broker"]["pending"] == [] and st["growth"]["sleeves"]["G1"]["SSO"]["in"] is True
    assert st["growth"]["rule_e"]["count_year"] == 6 and st["growth"]["rule_e"]["capped"][0]["reason"] == "the annual cap"
    capped = [r for r in records(state_dir, "rule_e") if r["payload"]["event"] == "capped"]
    assert len(capped) == 1 and capped[0]["payload"]["count_year"] == 7
    # the counters reset with the ISO week and the year
    re_st = rule_e.rule_e_state(st["growth"], "2026-10-05")
    assert re_st["count_week"] == 0 and re_st["week"] == "2026-W41" and re_st["count_year"] == 6
    re_st = rule_e.rule_e_state(st["growth"], "2027-01-04")
    assert re_st["count_year"] == 0 and re_st["year"] == "2027"
    assert rule_e.week_key("2026-09-27") == "2026-W39" and rule_e.week_key("2026-09-28") == "2026-W40"


def test_rule_e_is_moot_when_paused_and_fails_closed_without_a_second_source(tmp_path):
    cfg = cfg_for()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    mk = crash_market()
    provider = GrowthProvider(**mk)
    rec = Recorder()
    invested(cfg, provider, state_dir, rec)
    # the second source disagrees on the drop day: no exit tonight, a data alert, Sunday decides
    bad = GrowthProvider(**mk, disagree={("^GSPC", "2026-09-30"): 1.2, ("^NDX", "2026-09-30"): 1.2})
    day = daily(cfg, bad, state_dir, "2026-09-30", rec)
    assert day.emails == [] and state_of(state_dir)["broker"]["pending"] == []
    assert any(a["kind"] == "data" and "Rule E SSO" in a["message"] for a in state_of(state_dir)["alerts"])
    assert records(state_dir, "rule_e") == []
    # paused after the hard stop: Rule E does nothing
    st = state_of(state_dir)
    st["growth"]["paused"] = True
    write_state(state_dir, st)
    day = daily(cfg, provider, state_dir, "2026-10-01", rec)
    assert day.emails == [] and records(state_dir, "rule_e") == [] and state_of(state_dir)["broker"]["pending"] == []


def test_rule_e_email_renders_from_its_facts_and_the_validator_checks_its_slots():
    facts = {"kind": "RULE_E", "label": "PAPER", "date": "2026-09-30", "week": 40, "execute_date": "2026-10-01",
             "trade_id": "G-2026-09-30-SSO", "count_week": 1, "count_year": 3, "max_per_week": 1, "max_per_year": 6,
             "vehicle": "SGOV", "account": "ira", "constitution_version": "3.3.0", "ids": {"rule_e": "abc123"},
             "legs": [{"ticker": "SSO", "index": "^GSPC", "close": 6155.7, "sma200": 7205.4, "pct_vs_sma": -14.57,
                       "sma_days": 200, "band_pct": 2.0, "held_usd": 15_800.0, "intent_id": "O-1",
                       "trade_id": "G-2026-09-30-SSO"}]}
    email = render_rule_e(facts, {"mode": "paper", "ledger_head": "9f2c3a1b4d5e6f70", "issue_urls": {"O-1": "https://github.com/x/y/issues/9"}})
    assert validate(email) == []
    assert email.subject == "[PAPER][EXIT G-2026-09-30-SSO] Rule E: Sell all SSO — before 9:30 ET Thu 1 Oct"
    text = flat(email.text)
    assert "the S&P 500 closed 6,156, 14.6% below its 200-day average of 7,205, so the SSO leg is out" in text
    assert "Sell all SSO, market, queued for the next open: about $15,800 at tonight's close (Thu 1 Oct)." in text
    assert "Rule E has fired 3 of at most 6 times this year (and at most 1 a week)" in text
    assert "https://github.com/x/y/issues/9" in text and len(blocks_of(email.text)) <= 10
    assert email.meta["kind"] == "RULE_E" and email.meta["facts"] == facts
    wrong = dataclasses.replace(email, text=email.text.replace("about $15,800", "about $15,000"))
    assert any('"$15,000" is not registered' in p for p in validate(wrong))
    swapped = dataclasses.replace(email, text=email.text.replace("closed 6,156, ", "closed 7,205, "))
    assert any("c__re_trigger_SSO" in p for p in validate(swapped))
    assert [s["key"] for s in slot_specs({})] == ["summary"]           # an empty record has only its one line
