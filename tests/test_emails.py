"""Email renderer and number validator (traderec.emails, traderec.validator). Offline."""
from __future__ import annotations

import dataclasses
import re

import pytest

from traderec.emails import DISCLAIMER, PAPER_BANNER, NumberRegistry, render, render_monthly
from traderec.types import OrderIntent, Recommendation, RenderedEmail
from traderec.validator import ALLOWED_LITERALS, numeric_tokens, validate

HEAD = "9f2c3a1b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8"
M1_RULE = {"sma_trend": 200, "rsi_period": 2, "rsi_below": 10, "vix_min": 20.0, "exit_sma": 5, "max_sessions": 20}
M1_BASE_RATES = {"since": 2008, "trades_per_year": 3.8, "win_rate": 0.82, "mean_pct": 0.88, "planning_mean_pct": 0.43,
                 "median_hold_sessions": 3, "worst_pct": -9.4, "max_drawdown_pct": -14}
TRADE_SECTIONS = ["IN ONE SENTENCE", "DO THIS IN ROBINHOOD", "WHAT IF", "HOW YOU GET OUT (DECIDED NOW)", "THE ODDS",
                  "RISKS AND TAX", "YOUR PORTFOLIO AFTER THIS TRADE", "RECORD YOUR FILL"]
BOX_LABELS = ["ACTION", "SIZE", "STRESS", "WINDOW", "ODDS", "CONFIDENCE", "STATUS"]


def ctx(**over):
    base = {"mode": "paper", "nav": 100000.0, "ledger_head": HEAD,
            "issue_url": "https://github.com/sol008/testProject/issues/12", "data_asof": "2026-10-01 22:17 ET",
            "sources": ["yfinance:SPY", "nasdaq:SPY", "cboe:VIX"], "constitution_version": "3.2.0",
            "portfolio_after": [{"name": "SPY (M1 dip-buy)", "value": 6000.0, "pct": 0.06},
                                {"name": "IBIT (M3 Bitcoin switch)", "value": 3000.0, "pct": 0.03},
                                {"name": "Cash", "value": 91000.0, "pct": 0.91}]}
    base.update(over)
    return base


def order(tid, module, ticker, side, dollars=None, *, close_all=False, reason="entry", account="ira", meta=None,
          created="2026-10-01"):
    return OrderIntent(intent_id=f"O-{tid[2:]}-001", trade_id=tid, module=module, account=account, ticker=ticker,
                       side=side, created_date=created, reason=reason, dollars=dollars, close_all=close_all,
                       meta=meta or {})


def m1_entry(**facts_over) -> Recommendation:
    tid = "T-2026-10-01-M1"
    facts = {"module_name": "Uptrend dip-buy", "dollars": 6000.0, "stress_usd": 1956.0, "stress_pct": 1.956,
             "execute_date": "2026-10-02", "close": 663.27, "sma200": 640.12, "rsi2": 7.31, "vix": 21.37,
             "rule": dict(M1_RULE), "base_rates": dict(M1_BASE_RATES), "time_stop_date": "2026-10-30",
             "exit_plan": None}
    facts.update(facts_over)
    facts = {k: v for k, v in facts.items() if v is not None}
    return Recommendation(kind="NEW_TRADE", module="M1", trade_id=tid, created_date="2026-10-01",
                          orders=[order(tid, "M1", "SPY", "buy", 6000.0)], facts=facts,
                          forecasts=[{"forecast_id": "F-2026-10-01-M1-a", "trade_id": tid, "module": "M1",
                                      "question": "the trade closes with a profit", "p": 0.75,
                                      "resolves": "on_exit", "due": None}])


def m1_exit(reason="exit_rule", **facts_over) -> Recommendation:
    tid = "T-2026-10-01-M1"
    facts = {"module_name": "Uptrend dip-buy", "reason": reason, "close": 671.02, "sma5": 668.4, "exit_sma": 5,
             "max_sessions": 20, "sessions_held": 3 if reason == "exit_rule" else 20, "execute_date": "2026-10-07",
             "position_value": 6071.5, "pnl_usd": 71.5, "pnl_pct": 1.19}
    facts.update(facts_over)
    return Recommendation(kind="EXIT", module="M1", trade_id=tid, created_date="2026-10-06",
                          orders=[order(tid, "M1", "SPY", "sell", close_all=True, reason=reason, created="2026-10-06")],
                          facts=facts)


def m2_rebalance(**facts_over) -> Recommendation:
    tid = "T-2026-10-01-M2"
    orders = [order(tid, "M2", "SPY", "buy", 1200.0, reason="rebalance", meta={"ref_price": 663.27}),
              order(tid, "M2", "FXE", "sell", close_all=True, reason="rebalance"),
              order(tid, "M2", "GLD", "buy", 800.0, reason="rebalance")]
    facts = {"module_name": "Trend book", "execute_date": "2026-10-02", "rf_annual": 0.041, "lookback_sessions": 252,
             "gross_cap_pct_nav": 0.60, "single_leg_cap_pct_nav": 0.25, "band_rel": 0.25, "band_abs_usd": 300,
             "max_orders_per_email": 3, "stress_usd": 4500.0, "stress_pct": 4.5,
             "signals": {"SPY": {"ret_252": 0.183, "excess": 0.142, "sign": 1},
                         "FXE": {"ret_252": -0.021, "excess": -0.062, "sign": -1},
                         "GLD": {"ret_252": 0.25, "excess": 0.209, "sign": 1}},
             "targets": {"targets": {"SPY": 11200.0, "FXE": 0.0, "GLD": 4800.0}, "scalers": {}, "notes": []},
             "deferred": [{"ticker": "FXY", "side": "sell", "dollars": 900.0}], "skipped_band": ["USO"],
             "prices": {"GLD": 312.4}}
    facts.update(facts_over)
    return Recommendation(kind="REBALANCE", module="M2", trade_id=tid, created_date="2026-10-01", orders=orders,
                          facts=facts, forecasts=[{"forecast_id": "F-2026-10-01-M2-a", "question": "SPY is up over "
                                                   "the next month", "p": 0.54}])


def m3_switch(on=True, account="ira", **facts_over) -> Recommendation:
    tid = "T-2026-10-04-M3"
    ticker = "BTC-USD" if account == "coinbase" else "IBIT"
    if on:
        o = order(tid, "M3", ticker, "buy", 3000.0, reason="switch_on", account=account, created="2026-10-04")
        facts = {"weekly_close": 83169.0, "sma": 79450.25, "weeks": 10, "week_end": "2026-10-04",
                 "sleeve_pct_nav": 0.03, "stress_usd": 1350.0, "stress_pct": 1.35, "close": 47.12}
    else:
        o = order(tid, "M3", ticker, "sell", close_all=True, reason="switch_off", account=account, created="2026-11-08")
        facts = {"weekly_close": 76010.0, "sma": 79900.0, "weeks": 10, "week_end": "2026-11-08",
                 "pnl_usd": -212.0, "pnl_pct": -7.07}
    facts.update(facts_over)
    return Recommendation(kind="SWITCH_ON" if on else "SWITCH_OFF", module="M3", trade_id=tid,
                          created_date=o.created_date, orders=[o], facts=facts,
                          forecasts=[{"forecast_id": "F-2026-10-04-M3-a", "question": "this position closes with a "
                                      "profit", "p": 0.45}] if on else [])


W10_BASE_RATES = {"since": 1993, "trades_per_year": 0.5, "win_rate": 0.88, "mean_pct": 7.6, "placebo_mean_pct": 2.7,
                  "worst_pct": -8.6, "worst_interim_pct": -31, "planning_mean_pct": 3.8}


def w10_entry(**facts_over) -> Recommendation:
    tid = "T-2026-10-01-W10"
    facts = {"ticker": "SPY", "account": "ira", "dollars": 6000.0, "execute_date": "2026-10-02", "close": 745.10,
             "stress_usd": 1950.0, "stress_pct": 1.95, "horizon_stress_usd": 2886.0, "horizon_stress_pct": 2.886,
             "spx_close": 7443.95, "spx_prev_close": 7683.69, "spx_ret": -0.0312, "sma200_prev": 7212.40,
             "drop_pct": -0.03, "decluster_sessions": 20, "max_calendar_days": 90, "exit_date": "2026-12-31",
             "rule": {"sma_trend": 200}, "base_rates": dict(W10_BASE_RATES)}
    facts.update(facts_over)
    return Recommendation(kind="NEW_TRADE", module="W10", trade_id=tid, created_date="2026-10-01",
                          orders=[order(tid, "W10", "SPY", "buy", 6000.0)], facts=facts,
                          forecasts=[{"forecast_id": "F-2026-10-01-W10-a", "trade_id": tid, "module": "W10",
                                      "question": "the trade closes with a profit", "p": 0.8,
                                      "resolves": "on_exit", "due": None}])


def w10_exit(**facts_over) -> Recommendation:
    tid = "T-2026-10-01-W10"
    facts = {"ticker": "SPY", "account": "ira", "execute_date": "2026-12-31", "reason": "calendar_stop",
             "entry_date": "2026-10-02", "days_held": 89, "sessions_held": 62, "max_calendar_days": 90,
             "pnl_usd": 402.5, "pnl_pct": 6.71, "qty": 8.052, "keep_qty": 16.5, "position_value": 6402.5,
             "base_rates": dict(W10_BASE_RATES)}
    facts.update(facts_over)
    return Recommendation(kind="EXIT", module="W10", trade_id=tid, created_date="2026-12-30",
                          orders=[order(tid, "W10", "SPY", "sell", close_all=True, reason="calendar_stop",
                                        created="2026-12-30")], facts=facts)


ALL_KINDS = {
    "m1_entry": m1_entry, "m1_exit_rule": m1_exit, "m1_time_stop": lambda: m1_exit("time_stop"),
    "m2_rebalance": m2_rebalance, "m3_on": m3_switch, "m3_off": lambda: m3_switch(on=False),
    "m3_on_coinbase": lambda: m3_switch(account="coinbase"), "w10_entry": w10_entry, "w10_exit": w10_exit,
}
SIXTY_DAY = re.compile(r"\b60(?:-day| days?| calendar)")


def flat(text: str) -> str:
    """Text with box borders dropped and whitespace collapsed, so wrapped phrases can be matched."""
    return " ".join(text.replace("│", " ").split())


def steps_of(text: str) -> list[str]:
    return re.findall(r"(?m)^  \d+\. (.*)$", text)


# ------------------------------------------------------------------------------------------ registry

def test_registry_formatters_return_and_record_strings():
    reg = NumberRegistry()
    assert reg.fmt_money(6000) == "$6,000"
    assert reg.fmt_money(-1956.4) == "−$1,956"
    assert reg.fmt_money(663.271, cents=True) == "$663.27"
    assert reg.fmt_money(-0.2) == "$0"                      # no "−$0"
    assert reg.fmt_pct(0.06) == "6%"
    assert reg.fmt_pct(0.82, decimals=0) == "82%"
    assert reg.fmt_pct(0.88, decimals=2, signed=True, points=True) == "+0.88%"
    assert reg.fmt_pct(-9.4, points=True) == "−9.4%"
    assert reg.fmt_num(3.8) == "3.8"
    assert reg.fmt_num(2008, grouping=False) == "2008"
    assert reg.fmt_num(100000) == "100,000"
    assert reg.fmt_date("2026-10-02") == "Fri 2 Oct"
    assert reg.fmt_date("2026-10-02", "long") == "Fri 2 Oct 2026"
    assert reg.fmt_date("2026-09-01", "month") == "September 2026"
    assert reg.numbers[:3] == ["$6,000", "−$1,956", "$663.27"]
    assert "Fri 2 Oct" in reg.numbers and "September 2026" in reg.numbers
    assert len(reg.numbers) == len(set(reg.numbers))


# ------------------------------------------------------------------------------------------ trade emails

@pytest.mark.parametrize("name", sorted(ALL_KINDS))
def test_every_kind_renders_all_sections_and_validates(name):
    rec = ALL_KINDS[name]()
    email = render(rec, ctx())
    assert isinstance(email, RenderedEmail)
    assert email.subject.startswith("[PAPER][")
    assert email.text.startswith(PAPER_BANNER)
    for label in BOX_LABELS:
        assert re.search(rf"(?m)^│ {label}\s", email.text), label
    venue = "COINBASE" if rec.orders[0].account == "coinbase" else "ROBINHOOD"
    sections = [s.replace("ROBINHOOD", venue) for s in TRADE_SECTIONS]
    positions = [email.text.index(s) for s in sections]
    assert positions == sorted(positions), "sections out of order"
    assert re.search(r"(?m)^WHY (THIS TRADE|SELL NOW|THESE ORDERS)$", email.text)
    assert 1 <= len(steps_of(email.text)) <= 7
    assert "Ledger head: 9f2c3a1b4d5e\n" in email.text
    assert rec.trade_id in email.text
    assert DISCLAIMER.split(";")[0] in email.text.replace("\n", " ")
    assert email.meta["trade_id"] == rec.trade_id and email.meta["kind"] == rec.kind
    # HTML: same content, self-contained
    assert "PAPER TRADE" in email.html and "In one sentence" in email.html and "Record your fill" in email.html
    assert not re.search(r"<(img|script|link|iframe)\b|\bsrc=", email.html, re.I)
    assert validate(email) == []


def test_subjects_follow_the_spec_format():
    assert render(m1_entry(), ctx()).subject == (
        "[PAPER][TRADE T-2026-10-01-M1] BUY $6,000 SPY — Uptrend dip-buy (M1) — before 9:30 ET Fri 2 Oct")
    assert render(m1_exit(), ctx()).subject == "[PAPER][EXIT T-2026-10-01-M1] SELL all SPY — Uptrend dip-buy (M1)"
    assert render(m2_rebalance(), ctx()).subject == (
        "[PAPER][TREND T-2026-10-01-M2] Trend book: 3 orders — before 9:30 ET Fri 2 Oct")
    assert render(m3_switch(), ctx()).subject == "[PAPER][BTC T-2026-10-04-M3] Bitcoin switch ON: BUY $3,000 IBIT"
    assert render(m3_switch(on=False), ctx()).subject == "[PAPER][BTC T-2026-10-04-M3] Bitcoin switch OFF: SELL all IBIT"


def test_new_trade_has_exact_robinhood_steps_and_headline():
    email = render(m1_entry(), ctx())
    assert steps_of(email.text.replace("\n     ", " ")) == [
        "Open Robinhood and switch to your IRA (Account → Retirement)",
        "Search SPY",
        "Tap Trade → Buy",
        "Order type: Market · Buy in: Dollars",
        "Amount: $6,000",
        "Review → Submit. Robinhood queues after-hours market orders and fills them at the 9:30 ET open",
        "Record the fill (link below)",
    ]
    flat_ = flat(email.text)
    assert "SIZE $6,000 = 6% of your $100,000 portfolio" in flat_
    assert "Planning loss −$1,956 (−1.96% of portfolio)" in flat_
    assert "82% of past trades made money; average +0.88%, worst −9.4%" in flat_
    assert "Since 2008 this rule fired 3.8 times a year; 82% of trades made money; average +0.88%; worst −9.4%." in flat_
    assert "RSI(2) is 7.3, below 10. RSI(2) below 10 = SPY fell sharply" in flat_
    assert "sell at the open of the next session (Fri 30 Oct)" in flat_
    assert "about 9 shares of SPY at the last close of $663.27" in flat_
    assert "Tax: no tax on trades inside the IRA." in flat_
    assert "filled <dollars> @ <price>" in flat_ and "https://github.com/sol008/testProject/issues/12" in flat_
    assert "STATUS PAPER · M1 policy module · paper phase" in flat_


def test_exit_uses_sell_all_and_reports_result():
    email = render(m1_exit(), ctx())
    flat_ = flat(email.text)
    assert "Tap Sell all (it sells your whole SPY position)" in flat_
    assert "RESULT +$72 (+1.19%) so far" in flat_
    assert "This email is the exit." in flat_
    time_stop = flat(render(m1_exit("time_stop"), ctx()).text)
    assert "held 20 trading sessions" in time_stop and "time stop" in time_stop


def test_sell_by_shares_when_another_module_holds_the_ticker():
    email = render(m1_exit(qty=9.046512, keep_qty=16.5), ctx())
    flat_ = flat(email.text)
    assert "Sell all" not in email.subject and "SELL 9.046512 shares SPY" in email.subject
    assert "Order type: Market · Sell in: Shares" in flat_
    assert "Shares: 9.046512 (this trade only; keep your other 16.5 shares" in flat_
    assert validate(email) == []


def test_rule_constants_come_from_facts_not_templates():
    rule = dict(M1_RULE, rsi_below=5, sma_trend=150)
    email = render(m1_entry(rule=rule), ctx())
    flat_ = flat(email.text)
    assert "below 5." in flat_ and "150-day average" in flat_ and "200-day" not in flat_
    assert validate(email) == []
    bare = render(m1_entry(rule=None, base_rates=None, time_stop_date=None), ctx())
    assert "200-day" not in bare.text and "RSI(2)" not in bare.text     # no constants invented
    assert "long-term average" in bare.text
    assert validate(bare) == []


def test_exit_plan_from_facts_is_shown_verbatim():
    plan = ["Sell at the next open after SPY closes above its 5-day average.",
            "Time stop: sell at the open of session 21."]
    email = render(m1_entry(exit_plan=plan), ctx())
    flat_ = flat(email.text)
    assert plan[0] in flat_ and plan[1] in flat_
    assert validate(email) == []


def test_live_mode_is_labelled_live():
    email = render(m1_entry(), ctx(mode="live"))
    assert email.subject.startswith("[LIVE][TRADE ")
    assert "PAPER" not in email.subject and not email.text.startswith("PAPER")
    assert email.text.startswith("LIVE TRADE")
    assert validate(email) == []


def test_rebalance_table_and_deferred_legs():
    email = render(m2_rebalance(), ctx())
    flat_ = flat(email.text)
    assert re.search(r"FXE\s+euro currency fund\s+Sell\s+Sell all", email.text)
    assert email.text.index("FXE ") < email.text.index("SPY  ")        # sells first
    assert "Coming in the next trading day's evening email (at most 3 orders per email): FXY." in flat_
    assert "Deferred" not in flat_                                     # deferred legs aren't held a month
    assert "Skipped because the change is too small to bother: USO." in flat_
    assert "SPY +18.3% Yes $11,200" in flat_
    assert "Buys $2,000; sell all FXE (see the table below)" in flat_
    assert validate(email) == []


def test_rebalance_follow_up_batch_is_labelled_as_part_n():
    tid = "T-2026-10-01-M2"
    orders = [order(tid, "M2", "FXY", "sell", 900.0, reason="rebalance", created="2026-10-02"),
              order(tid, "M2", "QQQ", "buy", 700.0, reason="rebalance", created="2026-10-02")]
    rec = m2_rebalance(batch=2, execute_date="2026-10-05", deferred=[])
    rec = dataclasses.replace(rec, orders=orders, created_date="2026-10-02")
    email = render(rec, ctx())
    assert email.subject == "[PAPER][TREND T-2026-10-01-M2] Trend book, part 2: 2 orders — before 9:30 ET Mon 5 Oct"
    flat_ = flat(email.text)
    assert "Part 2 of this month's trend check: place these 2 orders at the open on Mon 5 Oct to finish this " \
           "month's rebalance." in flat_
    assert "(part 2 of this month's rebalance)" in flat_
    assert email.meta["batch"] == 2 and email.meta["slug"].endswith("-part-2")
    assert validate(email) == []
    more = render(dataclasses.replace(rec, facts={**rec.facts, "deferred": ["GLD"]}), ctx())
    assert "the rest come in the next trading day's evening email" in flat(more.text)
    first = render(m2_rebalance(batch=1), ctx())
    assert ", part" not in first.subject and "Part 1" not in first.text


def test_m3_without_max_hold_days_implies_no_forced_close():
    for rec in (m3_switch(), m3_switch(on=False), m3_switch(account="coinbase")):
        text = render(rec, ctx()).text
        assert not re.search(r"\b60\b|calendar day", text)


def test_w10_entry_explains_the_crash_day_buy():
    email = render(w10_entry(), ctx())
    assert email.subject == ("[PAPER][TRADE T-2026-10-01-W10] BUY $6,000 SPY — Uptrend crash-day buy (W10) — before "
                             "9:30 ET Fri 2 Oct")
    assert validate(email) == []
    assert not SIXTY_DAY.search(email.text) and not SIXTY_DAY.search(email.subject)
    assert steps_of(email.text.replace("\n     ", " "))[1:6] == [
        "Search SPY", "Tap Trade → Buy", "Order type: Market · Buy in: Dollars", "Amount: $6,000",
        "Review → Submit. Robinhood queues after-hours market orders and fills them at the 9:30 ET open"]
    f = flat(email.text)
    # headline box
    assert "−$1,950 (−1.95% of portfolio) if SPY repeats its worst crash on record; −$2,886 (−2.89%) over the " \
           "full hold" in f
    assert "88% of past trades made money; average +7.6%, worst −8.6%" in f
    assert "CONFIDENCE Low to medium: a small timing edge on about three months of market exposure; proven only " \
           "after 1990" in f
    assert "STATUS PAPER · W10 policy module, 90-day exception · paper phase" in f
    # one sentence, why, exit plan
    assert "The S&P 500 fell 3.12% today while its trend was up, so buy $6,000 of SPY at the open on Fri 2 Oct " \
           "and hold it until Thu 31 Dec." in f
    assert "The S&P 500 fell 3.12% today, closing at 7,443.95 (the day before: 7,683.69)." in f
    assert "It's the first drop of 3% or more in 20 trading sessions" in f
    assert "the S&P closed above its 200-day average of 7,212.40, so the trend was up." in f
    assert "buy the shock, hold about three months, and sell on a fixed date." in f
    assert "Since 1993, these trades averaged +7.6%, against +2.7% for random entry days held just as long." in f
    assert "not in older data, so this is a small, cheap bet." in f
    assert "Sell all at the open on Thu 31 Dec: the last trading day within 90 calendar days of the purchase. " \
           "You'll get an EXIT email the evening before." in f
    assert "No stop-loss, no profit target and no early exit." in f
    assert "You'll get an email telling you to sell" not in f      # the plan already says when the email comes
    # odds and risks
    assert "Since 1993 this rule fired 0.5 times a year; 88% of trades made money; average +7.6%; worst −8.6%." in f
    assert "80%: the trade closes with a profit" in f
    assert "A crash can deepen after the first shock. Since 1993, the worst trade was down 31% at one point" in f
    assert "Planning loss over the full hold: about $2,886 (2.89% of the portfolio)" in f
    assert "A market order at the open fills at whatever price the market opens at" in f
    assert "Tax: no tax on trades inside the IRA." in f


def test_w10_optional_facts_name_the_year_and_the_worst_episode():
    email = render(w10_entry(edge_since=1990, worst_interim_when="March 2020"), ctx())
    f = flat(email.text)
    assert "The edge shows only after 1990, not in older data" in f
    assert "In March 2020 this trade was down 31% at its worst before it recovered." in f
    assert validate(email) == []
    bare = render(w10_entry(rule={}, spx_close=None, spx_prev_close=None, spx_ret=None, exit_date=None), ctx())
    fb = flat(bare.text)
    assert "200-day" not in fb and "long-term average of 7,212.40" in fb
    assert "had a big one-day drop" in fb and "within 90 calendar days of the purchase" in fb
    assert validate(bare) == []


def test_w10_exit_sells_this_trades_shares_at_the_holding_limit():
    email = render(w10_exit(), ctx())
    assert email.subject == "[PAPER][EXIT T-2026-10-01-W10] SELL 8.052 shares SPY — Uptrend crash-day buy (W10)"
    assert validate(email) == []
    assert not SIXTY_DAY.search(email.text)
    f = flat(email.text)
    assert "The 90-day holding limit is up, so sell all the SPY from this trade at the open on Thu 31 Dec." in f
    assert "Shares: 8.052 (this trade only; keep your other 16.5 shares" in f
    assert "You bought on Fri 2 Oct and have held it 89 calendar days (62 trading sessions). The next open is the " \
           "last trading session within the 90-day limit, so the rule says sell." in f
    assert "The exit was decided when you bought" in f
    assert "RESULT +$402 (+6.71%) so far" in f and "Result so far: +$402 (+6.71%), before this sale." in f
    assert "For reference: since 1993 this rule fired" in f
    sell_all = render(w10_exit(qty=None, keep_qty=None, reason="unlisted_reason"), ctx())
    assert "SELL all SPY" in sell_all.subject and "Tap Sell all" in flat(sell_all.text)
    assert "The 90-day holding limit is up" in flat(sell_all.text)   # W10 has one exit rule
    assert validate(sell_all) == []


def test_coinbase_route_uses_coinbase_steps_and_taxable_line():
    email = render(m3_switch(account="coinbase"), ctx())
    flat_ = flat(email.text)
    assert "DO THIS IN COINBASE" in email.text and "Robinhood" not in flat_
    assert "24/7" in flat_ and "Tap Buy & sell → Buy" in flat_
    assert "short-term gains are taxed as ordinary income" in flat_
    assert validate(email) == []


def test_minimal_recommendation_still_renders_and_validates():
    rec = Recommendation(kind="NEW_TRADE", module="M9", trade_id="T-2026-10-01-M9", created_date="2026-10-01",
                         orders=[order("T-2026-10-01-M9", "M9", "SPY", "buy", 1000.0)], facts={})
    email = render(rec, {})
    assert email.subject.startswith("[PAPER][TRADE T-2026-10-01-M9] BUY $1,000 SPY")
    assert "Not available for this run." in email.text
    assert validate(email) == []


def test_data_labels_with_digits_are_registered():
    email = render(m1_entry(module_name="ST-1 dip-buy", confidence="Medium (N = 533 variants)"), ctx())
    assert "ST-1 dip-buy (M1)" in email.subject
    assert validate(email) == []


def test_stress_pct_given_as_a_fraction_is_detected():
    email = render(m1_entry(stress_pct=0.01956), ctx())
    assert "(−1.96% of portfolio)" in flat(email.text)


def test_portfolio_after_in_percent_units():
    rows = [{"name": "SPY", "value": 6000.0, "pct": 6.0}, {"name": "Cash", "value": 94000.0, "pct": 94.0}]
    email = render(m1_entry(), ctx(portfolio_after=rows))
    assert re.search(r"SPY\s+\$6,000\s+6%", email.text) and re.search(r"Cash\s+\$94,000\s+94%", email.text)


# ------------------------------------------------------------------------------------------ validator

def test_validator_flags_a_stray_number_in_text_subject_and_html():
    email = render(m1_entry(), ctx())
    bad_text = dataclasses.replace(email, text=email.text + "\nUpside is about 18%.\n")
    problems = validate(bad_text)
    assert len(problems) == 1 and '"18%"' in problems[0] and problems[0].startswith("text:")
    bad_subject = dataclasses.replace(email, subject=email.subject + " — 18% upside")
    assert any(p.startswith("subject:") and "18%" in p for p in validate(bad_subject))
    bad_html = dataclasses.replace(email, html=email.html.replace("</body>", "<p>Target 18%</p></body>"))
    assert any(p.startswith("html:") and "18%" in p for p in validate(bad_html))


def test_validator_catches_changed_numbers_and_flipped_signs():
    email = render(m1_entry(), ctx())
    changed = dataclasses.replace(email, text=email.text.replace("Amount: $6,000", "Amount: $6,500"))
    assert any('"$6,500"' in p for p in validate(changed))
    flipped = dataclasses.replace(email, text=email.text.replace("worst −9.4%", "worst +9.4%"))
    assert any('"+9.4%"' in p for p in validate(flipped))
    placeholder = dataclasses.replace(email, text=email.text + "\nSell at {target:money}.\n")
    assert any("placeholder" in p for p in validate(placeholder))


def test_validator_skips_ids_hashes_urls_steps_and_allowed_literals():
    text = ("Trade T-2026-10-01-M1 · order O-2026-10-01-M1-001 · ledger 9f2c3a1b4d5e · module M1 · v3.2.0\n"
            "  1. Open Robinhood\n  2. Review → Submit at the 9:30 ET open (Coinbase: 24/7; S&P 500; §8)\n"
            "See https://github.com/sol008/testProject/issues/12\n")
    assert numeric_tokens(text) == ["9:30", "24/7", "S&P 500", "§8"]
    assert validate(RenderedEmail(subject="[PAPER][TRADE T-2026-10-01-M1] BUY SPY", text=text, html="")) == []
    assert {"9:30", "24/7"} <= ALLOWED_LITERALS
    # a number is a number wherever it sits: mid-line "3." is not a step
    assert validate(RenderedEmail(subject="x", text="Buy 3. Now", html="")) != []


def test_numeric_tokens_cover_money_percent_dates_and_times():
    assert numeric_tokens("BUY $6,000 on Fri 2 Oct at 10am; −$1,956 (1.96%); 2026-10-02 22:17; 3.8x; 100,000") == [
        "$6,000", "Fri 2 Oct", "10am", "−$1,956", "1.96%", "2026-10-02 22:17", "3.8x", "100,000"]


# ------------------------------------------------------------------------------------------ monthly

def monthly_report(**over):
    report = {"month": "2026-10", "nav": 100512.3, "nav_prev": 100000.0, "nav_start": 100000.0,
              "spy_ret_month": 0.012, "spy_ret_since_start": 0.012, "tbill_ret_month": 0.0034,
              "tbill_ret_since_start": 0.0034, "drawdown": 0.004, "trades_opened": 3, "trades_closed": 2,
              "trades": [{"module": "M1", "opened": 1, "closed": 1, "pnl_usd": 71.5},
                         {"module": "M3", "opened": 1, "closed": 1, "pnl_usd": -212.0}],
              "forecasts_resolved": 4, "forecasts_open": 3, "forecast_mean_brier": 0.1834,
              "forecast_hit_rate": 0.5, "forecast_mean_p": 0.61,
              "shadow": [{"name": "ST-1b (M1 without the VIX gate)", "signals": 2, "closed": 1, "mean_ret": 0.0071}],
              "runs_expected": 22, "runs_on_time": 22, "validator_failures": 0, "data_problems": 0,
              "emails_sent": 5, "emails_handled": 5, "ledger_ok": True, "months_elapsed": 1.1, "trades_to_date": 3,
              "changes": []}
    report.update(over)
    return report


def test_monthly_clean_month():
    email = render_monthly(monthly_report(), ctx())
    assert email.subject == "[PAPER][MONTHLY] October 2026 review — NAV $100,512 (+0.51%)"
    flat_ = flat(email.text)
    assert email.text.startswith("PAPER PHASE")
    assert "PROBLEMS FIRST None this month" in flat_
    assert "Your portfolio +0.51% +0.51%" in flat_ and "SPY (buy and hold) +1.2% +1.2%" in flat_
    assert "M1 Uptrend dip-buy 1 1 +$72" in flat_ and "M3 Bitcoin trend switch 1 1 −$212" in flat_
    assert "Mean Brier score 0.183" in flat_ and "said 61%; 50% came true" in flat_
    assert "ST-1b (M1 without the VIX gate) 2 1 +0.71%" in flat_
    assert "Months of paper trading at least 3 1.1 no" in flat_
    assert "Paper trades (edge evidence; advisory) 30 3 advisory" in flat_
    assert "No rule changes this month (design §8)." in flat_
    assert validate(email) == []


def test_monthly_puts_failures_first():
    email = render_monthly(monthly_report(runs_on_time=21, validator_failures=1, data_problems=1,
                                          data_notes=["nasdaq second source down on 2026-10-14"], ledger_ok=False),
                           ctx())
    assert "— 4 problems —" in email.subject
    text = email.text
    assert text.index("PROBLEMS FIRST") < text.index("RESULTS") < text.index("OPERATIONS")
    problems = text[text.index("PROBLEMS FIRST"):text.index("RESULTS")]
    flat_ = flat(problems)
    assert "The validator blocked 1 email this month." in flat_
    assert "1 data problem: nasdaq second source down on 2026-10-14." in flat_
    assert "1 of 22 runs was late or missing." in flat_
    assert "ledger failed verification" in flat_
    assert validate(email) == []


def test_monthly_lists_rule_changes():
    email = render_monthly(monthly_report(changes=["M2 band_abs_usd 300 -> 250 (approved 2026-10-01)"]), ctx())
    flat_ = flat(email.text)
    assert "Rule changes this month (design §8):" in flat_ and "band_abs_usd 300 -> 250" in flat_
    assert "No rule changes" not in flat_
    assert validate(email) == []


def test_monthly_tolerates_a_sparse_report():
    email = render_monthly({"month": "2026-10"}, {})
    assert email.subject == "[PAPER][MONTHLY] October 2026 review"
    assert validate(email) == []
