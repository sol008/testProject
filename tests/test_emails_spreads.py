"""Option-spread emails: order kind (b) of design §3a, docs/PHASE_B_CONTRACTS.md §8. Offline.

Module text (M4, W8) is injected by monkeypatching the shared email tables, so these tests hold whatever the M4 and
W8/W9 builds write in traderec/email_text/.
"""
from __future__ import annotations

import dataclasses
import re

import pytest

from traderec import emails
from traderec.emails import DISCLAIMER, PAPER_BANNER, render
from traderec.types import OrderIntent, Recommendation
from traderec.validator import ALLOWED_LITERALS, html_to_text, numeric_tokens, validate

HEAD = "9f2c3a1b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8"
ISSUE = "https://github.com/sol008/testProject/issues/40"
TABLES = ("MODULE_NAMES", "MODULE_STATUS", "MODULE_CONFIDENCE", "DEFAULT_TICKERS", "ONE_SENTENCE", "WHY",
          "EXIT_PLAN", "RISKS")
BOX_LABELS = ["ACTION", "SIZE", "STRESS", "WINDOW", "ODDS", "CONFIDENCE", "STATUS"]
NEW_TRADE_SECTIONS = ["IN ONE SENTENCE", "WHAT YOU'RE BUYING: A CALL DEBIT SPREAD", "DO THIS IN ROBINHOOD", "WHAT IF",
                      "HOW YOU GET OUT (DECIDED NOW)", "WHY THIS TRADE", "THE ODDS", "RISKS AND TAX",
                      "YOUR PORTFOLIO AFTER THIS TRADE", "RECORD YOUR FILL"]
EXIT_SECTIONS = ["IN ONE SENTENCE", "WHAT YOU'RE CLOSING", "DO THIS IN ROBINHOOD", "WHAT IF",
                 "HOW YOU GET OUT (DECIDED NOW)", "WHY CLOSE IT NOW", "THE ODDS", "RISKS AND TAX",
                 "YOUR PORTFOLIO AFTER THIS TRADE", "RECORD YOUR FILL"]


def ctx(**over):
    base = {"mode": "paper", "nav": 100000.0, "ledger_head": HEAD, "issue_url": ISSUE,
            "data_asof": "2026-09-29 22:17 ET", "sources": ["cboe:XSP", "fred:SP500", "cboe:VIX"],
            "constitution_version": "3.4.0",
            "portfolio_after": [{"name": "XSP call spread (M4)", "value": 1490.0, "pct": 0.0149},
                                {"name": "Cash / T-bills (taxable)", "value": 98510.0, "pct": 0.9851}]}
    base.update(over)
    return base


def leg(root, right, strike, expiry, position):
    occ = f"{root}{expiry[2:4]}{expiry[5:7]}{expiry[8:]}{right}{round(strike * 1000):08d}"
    return {"occ": occ, "root": root, "right": right, "strike": strike, "expiry": expiry, "position": position,
            "ratio": 1}


XSP_LEGS = [leg("XSP", "C", 770.0, "2026-12-18", "long"), leg("XSP", "C", 810.0, "2026-12-18", "short")]
DAL_LEGS = [leg("DAL", "C", 52.5, "2026-12-18", "long"), leg("DAL", "C", 57.5, "2026-12-18", "short")]
SPY_LEGS = [leg("SPY", "C", 745.0, "2026-12-18", "long"), leg("SPY", "C", 780.0, "2026-12-18", "short")]
USO_LEGS = [leg("USO", "P", 80.0, "2026-12-18", "long"), leg("USO", "P", 75.0, "2026-12-18", "short")]


def spread_order(module, root, side, legs, contracts, limit, maximum, *, tid, created, reason="entry"):
    return OrderIntent(intent_id=f"O-{created}-{module}-0001", trade_id=tid, module=module, account="taxable",
                       ticker=root, side=side, created_date=created, reason=reason, close_all=side == "sell",
                       order_type="spread_limit", legs=None if legs is None else [dict(x) for x in legs],
                       contracts=contracts, limit_price=limit, max_price=maximum)


M4_TID = "T-2026-09-29-M4"
M4_BASE_RATES = {"since": 1990, "trades_per_year": 0.7, "win_rate": 0.77, "mean_pct": 35.0, "worst_pct": -100.0}


def m4_entry(**facts_over) -> Recommendation:
    facts = {"root": "XSP", "underlying_name": "Mini-S&P 500 index", "strategy_label": "call debit spread",
             "legs": XSP_LEGS, "expiry": "2026-12-18", "contracts": 2, "limit_price": 7.45, "max_price": 8.20,
             "debit_usd": 1490.0, "max_debit_usd": 1640.0, "max_value_usd": 8000.0, "breakeven": 777.45,
             "spot": 768.12, "exit_date": "2026-12-17", "stress_usd": 1640.0, "stress_pct": 1.64,
             "section_1256": True, "settlement": "cash-settled, European-style", "execute_date": "2026-09-30",
             "spx_drawdown": -0.172, "vix": 34.6, "base_rates": dict(M4_BASE_RATES)}
    facts.update(facts_over)
    facts = {k: v for k, v in facts.items() if v is not None}
    order = spread_order("M4", "XSP", "buy", XSP_LEGS, 2, 7.45, 8.20, tid=M4_TID, created="2026-09-29")
    return Recommendation(kind="NEW_TRADE", module="M4", trade_id=M4_TID, created_date="2026-09-29", orders=[order],
                          facts=facts,
                          forecasts=[{"forecast_id": "F-2026-09-29-M4-a", "trade_id": M4_TID, "module": "M4",
                                      "question": "the spread closes with a profit", "p": 0.6, "resolves": "on_exit",
                                      "due": None}])


def m4_exit(reason="time_stop", **facts_over) -> Recommendation:
    facts = {"contracts": 2, "limit_price": 12.30, "max_price": 11.80, "credit_usd": 2460.0,
             "min_credit_usd": 2360.0, "entry_price": 7.45, "pnl_usd": 1010.0, "pnl_pct": 67.79, "reason": reason,
             "execute_date": "2026-12-17", "exit_date": "2026-12-17"}
    facts.update(facts_over)
    order = spread_order("M4", "XSP", "sell", XSP_LEGS, 2, 12.30, 11.80, tid=M4_TID, created="2026-12-16",
                         reason=reason)
    return Recommendation(kind="EXIT", module="M4", trade_id=M4_TID, created_date="2026-12-16", orders=[order],
                          facts=facts)


W8_TID = "T-2026-10-01-W8"


def w8_entry(**facts_over) -> Recommendation:
    facts = {"root": "DAL", "strategy_label": "call debit spread", "legs": DAL_LEGS, "expiry": "2026-12-18",
             "contracts": 4, "limit_price": 1.45, "max_price": 1.60, "debit_usd": 580.0, "max_debit_usd": 640.0,
             "max_value_usd": 2000.0, "breakeven": 53.95, "spot": 51.80, "exit_date": "2026-10-29",
             "stress_usd": 640.0, "stress_pct": 0.64, "section_1256": False, "settlement": "shares, American-style",
             "execute_date": "2026-10-02", "take_profit_frac": 0.8}
    facts.update(facts_over)
    order = spread_order("W8", "DAL", "buy", DAL_LEGS, 4, 1.45, 1.60, tid=W8_TID, created="2026-10-01")
    return Recommendation(kind="NEW_TRADE", module="W8", trade_id=W8_TID, created_date="2026-10-01", orders=[order],
                          facts=facts)


def bare(module, root, legs, contracts, limit, maximum, *, side="buy", kind="NEW_TRADE", facts=None):
    """Only the order: every optional fact is missing."""
    tid = f"T-2026-10-01-{module}"
    order = spread_order(module, root, side, legs, contracts, limit, maximum, tid=tid, created="2026-10-01")
    return Recommendation(kind=kind, module=module, trade_id=tid, created_date="2026-10-01", orders=[order],
                          facts=dict(facts or {}))


M4_TEXT = {
    "MODULE_NAMES": "Crash call spread",
    "MODULE_STATUS": "policy module, 90-day exception",
    "MODULE_CONFIDENCE": "Low: a handful of crisis episodes",
    "ONE_SENTENCE": {"NEW_TRADE": ("The S&P 500 is {spx_drawdown:apct1} below its high and the VIX is {vix:num1}, "
                                   "so buy {spreads_phrase} {when} and close them by {exit_date:date}.",)},
    "WHY": {"NEW_TRADE": [("The S&P 500 closed {spx_drawdown:apct1} below its high with the VIX at {vix:num1}.",)]},
    "EXIT_PLAN": {"NEW_TRADE": [("No profit target: the spread is held to the planned close.",)]},
    "RISKS": [("A crash can deepen after the signal, and then the spread loses its whole debit.",)],
}
W8_TEXT = {
    "MODULE_NAMES": "De-escalation call spread",
    "MODULE_STATUS": "policy module, small",
    "EXIT_PLAN": {"NEW_TRADE": [("Take the profit once the spread is worth {take_profit_frac:pct0} of its maximum "
                                 "value.",)]},
}


def use_text(monkeypatch, module, text):
    """Make `module`'s entries in the shared email tables exactly `text` (none where `text` has no entry)."""
    for table in TABLES:
        target = getattr(emails, table)
        if table in text:
            monkeypatch.setitem(target, module, text[table])
        else:
            monkeypatch.delitem(target, module, raising=False)
    monkeypatch.setattr(emails, "PLAN_NAMES_EXIT_EMAIL", set(emails.PLAN_NAMES_EXIT_EMAIL) - {module})


@pytest.fixture
def m4_text(monkeypatch):
    use_text(monkeypatch, "M4", M4_TEXT)


@pytest.fixture
def no_text(monkeypatch):
    for module in ("M4", "W8", "W9"):
        use_text(monkeypatch, module, {})
    monkeypatch.delitem(emails.TICKER_NAMES, "XSP", raising=False)


def flat(text: str) -> str:
    """Text with box borders dropped and whitespace collapsed, so wrapped phrases can be matched."""
    return " ".join(text.replace("│", " ").split())


def steps_of(text: str) -> list[str]:
    return re.findall(r"(?m)^  \d+\. (.*)$", text.replace("\n     ", " "))


def box(text: str) -> dict[str, str]:
    """The headline box as {LABEL: value}, wrapped lines joined."""
    rows: dict[str, str] = {}
    label = None
    for line in text.splitlines():
        m = re.match(r"^│ (?:([A-Z]+)\s)?\s*(.*?)\s*│$", line)
        if not m:
            continue
        label = m.group(1) or label
        rows[label] = (rows.get(label, "") + " " + m.group(2)).strip()
    return rows


def sections_in_order(text: str, sections: list[str]) -> bool:
    positions = [text.index(f"\n{s}\n") for s in sections]
    return positions == sorted(positions)


# ------------------------------------------------------------------------------------------ opening a spread

def test_m4_new_trade_renders_every_section_and_validates(m4_text):
    rec = m4_entry()
    email = render(rec, ctx())
    assert email.subject == ("[PAPER][TRADE T-2026-09-29-M4] BUY 2 XSP 770/810 call spreads, 18 Dec, limit $7.45 — "
                             "Crash call spread (M4) — after 10:00 ET Wed 30 Sep")
    assert email.text.startswith(PAPER_BANNER)
    assert list(box(email.text)) == BOX_LABELS
    assert sections_in_order(email.text, NEW_TRADE_SECTIONS)
    assert "Ledger head: 9f2c3a1b4d5e\n" in email.text and M4_TID in email.text
    assert DISCLAIMER.split(";")[0] in flat(email.text)
    assert email.meta["order_type"] == "spread_limit" and email.meta["kind"] == "NEW_TRADE"
    assert email.meta["trade_id"] == M4_TID and email.meta["execute_date"] == "2026-09-30"
    assert validate(email) == []


def test_m4_new_trade_headline_box(m4_text):
    rows = box(render(m4_entry(), ctx()).text)
    assert rows["ACTION"] == ("BUY 2 XSP 770/810 call spreads (buy the 770 call, sell the 810 call), expiring Fri 18 "
                              "Dec 2026, at one net limit of $7.45 per share, in your individual (taxable) account")
    assert rows["SIZE"] == "$1,490 net debit (2 × $745) = 1.49% of your $100,000 portfolio"
    assert rows["STRESS"] == ("Max loss −$1,640 (−1.64% of portfolio): the whole debit if the re-price at the stated "
                              "maximum fills. It can't lose more")
    assert rows["WINDOW"] == ("Place after 10:00 ET on Wed 30 Sep. Not filled by 11:00 ET: re-enter once at $8.20, "
                              "the stated maximum; otherwise skip")
    assert rows["ODDS"] == "77% of past trades made money; average +35%, worst −100% (of the debit)"
    assert rows["CONFIDENCE"] == "Low: a handful of crisis episodes"
    assert rows["STATUS"] == "PAPER · M4 policy module, 90-day exception · paper phase"


def test_m4_new_trade_has_seven_exact_robinhood_steps(m4_text):
    assert steps_of(render(m4_entry(), ctx()).text) == [
        "After 10:00 ET on Wed 30 Sep, open Robinhood and switch to your individual account (Account → Individual)",
        "Search XSP, then tap Trade → Trade Options",
        "At the top choose Buy and Call, then the expiration Fri 18 Dec 2026",
        "Tap Select, then the 770 and 810 calls: set the 770 to Buy and the 810 to Sell. Robinhood shows one Call "
        "Debit Spread; tap Continue",
        "Limit price: $7.45 (the net debit, per share) · Contracts: 2 · Time in force: Good for day",
        "Review → Submit. The total should be about $1,490 (2 × $745)",
        "Record the fill (link below)",
    ]


def test_m4_new_trade_what_if_exit_plan_explainer_and_tax(m4_text):
    f = flat(render(m4_entry(), ctx()).text)
    # what if
    assert ("Not filled by 11:00 ET: cancel it and place it once more at $8.20, the stated maximum ($1,640 in all). "
            "If that doesn't fill by the close, skip the trade and comment skipped.") in f
    assert "XSP moved a lot before you place it: place it anyway at these prices, and don't chase." in f
    assert "If the spread now costs more than $8.20, it won't fill" in f
    assert "Robinhood shows a different price for the spread (its mid and natural prices move all day): type $7.45 " \
           "yourself." in f
    assert "Robinhood offers only one leg, or won't take both strikes as one order: skip the trade. Never leg in" in f
    # how you get out: the planned close from facts.exit_date, then the module's EXIT_PLAN text
    assert ("Planned close: sell to close the whole spread (both legs, one order) by Thu 17 Dec, at least one trading "
            "day before it expires on Fri 18 Dec. - No profit target: the spread is held to the planned close. - "
            "You'll get an email telling you to sell") in f
    assert emails.SPREAD_NO_STOP not in f                   # the module's own plan replaces the generic line
    # the spread explainer, in plain English
    assert "Two options on XSP (Mini-S&P 500 index) in one order: buy the 770 call and sell the 810 call, both " \
           "expiring Fri 18 Dec 2026." in f
    assert "Robinhood shows option prices per share, and one contract is 100 times that, so each spread costs " \
           "$745." in f
    assert "Most you can lose: what you pay, $1,490 in all ($1,640 if the re-price at the stated maximum fills). " \
           "That happens if XSP ends at or below 770 at expiry." in f
    assert "Most it can be worth: the width between the strikes, 40 × 100 = $4,000 per spread, $8,000 in all. That " \
           "happens if XSP ends at or above 810 at expiry." in f
    assert "Breakeven at expiry: XSP at 777.45, the 770 strike plus the $7.45 you pay. XSP is at 768.12 now." in f
    assert "XSP options are cash-settled and European-style: they can't be exercised early" in f
    assert "Exact contracts, for reference: XSP261218C00770000 (buy) and XSP261218C00810000 (sell)." in f
    # risks and tax
    assert "The most you can lose is the debit: $1,490 at the limit, up to $1,640 (1.64% of the portfolio)" in f
    assert "American-style" not in f and "ordinary income" not in f
    assert ("Tax: this is your individual (taxable) account, and XSP options are Section 1256 contracts: gains and "
            "losses count 60% long-term and 40% short-term (the 60/40 rule)") in f
    # portfolio after and the fill comment, in spread wording
    assert re.search(r"XSP call spread \(M4\)\s+\$1,490\s+1\.5%", render(m4_entry(), ctx()).text)
    assert (f"Open {ISSUE} and add a comment: filled <contracts> @ <net price> (the number of spreads that filled and "
            "the net price per share you paid, for example filled 2 @ 7.45), or skipped.") in f
    assert "The paper broker records its own fill from the mid-morning option quotes" in f


def test_m4_module_text_drives_the_sentence_why_odds_and_risks(m4_text):
    email = render(m4_entry(), ctx())
    f = flat(email.text)
    assert ("The S&P 500 is 17.2% below its high and the VIX is 34.6, so buy 2 XSP 770/810 call spreads after 10:00 "
            "ET on Wed 30 Sep and close them by Thu 17 Dec.") in f
    assert "WHY THIS TRADE The S&P 500 closed 17.2% below its high with the VIX at 34.6." in f
    assert ("Since 1990 this rule fired 0.7 times a year; 77% of trades made money; average +35%; worst −100%. For a "
            "spread these percentages are of the debit you pay") in f
    assert "60%: the spread closes with a profit" in f
    risks = f[f.index("RISKS AND TAX"):f.index("YOUR PORTFOLIO")]
    assert risks.index("A crash can deepen after the signal") < risks.index("The most you can lose is the debit")
    assert validate(email) == []


def test_generic_text_when_a_module_has_none(no_text):
    email = render(m4_entry(strategy_label="crash call debit spread"), ctx())
    f = flat(email.text)
    assert "WHAT YOU'RE BUYING: A CRASH CALL DEBIT SPREAD" in email.text
    assert "Robinhood shows one Call Debit Spread; tap Continue" in f        # the app's name, not the module's label
    assert "— M4 (M4) —" in email.subject
    assert ("Buy 2 XSP 770/810 call spreads after 10:00 ET on Wed 30 Sep for about $1,490, as the M4 rule says: a bet "
            "that XSP rises, where the most you can lose is what you pay.") in f
    assert "The M4 rule's entry conditions all passed on the close of Tue 29 Sep." in f
    assert emails.SPREAD_NO_STOP in f
    assert "CONFIDENCE Rule-based" in f and "STATUS PAPER · M4 module · paper phase" in f
    assert validate(email) == []


# ------------------------------------------------------------------------------------------ closing a spread

def test_m4_exit_closes_the_whole_spread(m4_text):
    email = render(m4_exit(), ctx())
    assert email.subject == ("[PAPER][EXIT T-2026-09-29-M4] CLOSE 2 XSP 770/810 call spreads, 18 Dec, limit $12.30 — "
                             "Crash call spread (M4) — after 10:00 ET Thu 17 Dec")
    assert sections_in_order(email.text, EXIT_SECTIONS)
    rows = box(email.text)
    assert list(rows) == ["ACTION", "SIZE", "STRESS", "WINDOW", "ODDS", "RESULT", "CONFIDENCE", "STATUS"]
    assert rows["ACTION"] == ("SELL TO CLOSE 2 XSP 770/810 call spreads (sell the 770 call, buy back the 810 call), "
                              "expiring Fri 18 Dec 2026, at one net limit of $12.30 per share (a credit), in your "
                              "individual (taxable) account")
    assert rows["SIZE"] == "The whole position: about $2,460 back at the limit, at least $2,360 at the stated minimum"
    assert rows["STRESS"] == "None once closed: this ends the trade"
    assert rows["WINDOW"] == ("Place after 10:00 ET on Thu 17 Dec. Not filled by 11:00 ET: re-enter once at $11.80, "
                              "the stated minimum; otherwise wait for tomorrow's email")
    assert rows["RESULT"] == "+$1,010 (+67.79%) so far at tonight's mid prices, before closing"
    assert steps_of(email.text) == [
        "After 10:00 ET on Thu 17 Dec, open Robinhood and switch to your individual account (Account → Individual)",
        "Search XSP, then tap your 770/810 call spread expiring Fri 18 Dec 2026 (2 contracts)",
        "Tap Trade → Close position, so both legs close together in one order",
        "Limit price: $12.30 (the net credit, per share) · Contracts: 2, all of them · Time in force: Good for day",
        "Review → Submit. You should get back about $2,460",
        "Record the fill (link below)",
    ]
    f = flat(email.text)
    assert ("Not filled by 11:00 ET: cancel it and place it once more at $11.80, the stated minimum ($2,360 in all). "
            "If that doesn't fill by the close, keep the spread: you'll get a new EXIT email tomorrow evening with "
            "fresh prices.") in f
    assert "Never close one leg alone (legging out)" in f
    assert "This email is the exit." in f and "you'll get a new EXIT email tomorrow evening" in f
    assert "The planned holding time is up, so sell to close your 2 XSP 770/810 call spreads after 10:00 ET on Thu " \
           "17 Dec." in f
    assert "The planned close date is Thu 17 Dec: the rule closes the spread then, whatever the result." in f
    assert "Result so far at tonight's mid prices: +$1,010 (+67.79%), on the $7.45 per share you paid." in f
    assert ("Closing sells the call you own and buys back the one you sold, in one order at one net price. That price "
            "is a credit, so money comes back to you: $1,230 per spread at the limit, $2,460 in all.") in f
    assert "An exit needs no odds" in f and "Section 1256" in f
    assert "the net price per share you received, for example filled 2 @ 12.30" in f
    assert validate(email) == []


@pytest.mark.parametrize("reason, sentence", [
    ("time_stop", "The planned holding time is up, so sell to close your 2 XSP 770/810 call spreads"),
    ("take_profit", "The spread reached its profit target, so sell to close your 2 XSP 770/810 call spreads"),
    ("invalidation", "The reason for this trade no longer holds, so sell to close your 2 XSP 770/810 call spreads"),
    ("expiry_rule", "The options expire soon, so sell to close your 2 XSP 770/810 call spreads"),
    ("other", "The M4 exit rule fired: sell to close your 2 XSP 770/810 call spreads"),
])
def test_every_exit_reason_has_a_plain_sentence(no_text, reason, sentence):
    email = render(m4_exit(reason), ctx())
    f = flat(email.text)
    assert sentence in f
    assert "The exit was decided when you bought" in f
    assert validate(email) == []


# ------------------------------------------------------------------------------------------ W8-like: DAL

def test_w8_dal_call_spread_is_not_section_1256(monkeypatch):
    use_text(monkeypatch, "W8", W8_TEXT)
    email = render(w8_entry(), ctx(portfolio_after=[]))
    assert email.subject == ("[PAPER][TRADE T-2026-10-01-W8] BUY 4 DAL 52.5/57.5 call spreads, 18 Dec, limit $1.45 — "
                             "De-escalation call spread (W8) — after 10:00 ET Fri 2 Oct")
    f = flat(email.text)
    assert "60/40" not in f and "long-term" not in f
    assert ("Tax: this is your individual (taxable) account, and DAL options are not Section 1256 contracts: gains "
            "are short-term, taxed as ordinary income.") in f
    assert "Two options on DAL (Delta Air Lines stock) in one order: buy the 52.5 call and sell the 57.5 call" in f
    assert "DAL options are American-style and settle in shares" in f
    assert ("the call you sold can be exercised early (assignment), most often just before DAL pays a dividend. "
            "You'd then be short DAL shares, still covered by the call you own.") in f
    assert "Planned close: sell to close the whole spread (both legs, one order) by Thu 29 Oct" in f
    assert "Take the profit once the spread is worth 80% of its maximum value." in f
    assert "Breakeven at expiry: DAL at 53.95, the 52.5 strike plus the $1.45 you pay. DAL is at 51.80 now." in f
    steps = steps_of(email.text)
    assert len(steps) == 7
    assert steps[3] == ("Tap Select, then the 52.5 and 57.5 calls: set the 52.5 to Buy and the 57.5 to Sell. "
                        "Robinhood shows one Call Debit Spread; tap Continue")
    assert steps[4] == "Limit price: $1.45 (the net debit, per share) · Contracts: 4 · Time in force: Good for day"
    assert "SIZE $580 net debit (4 × $145) = 0.58% of your $100,000 portfolio" in f
    assert validate(email) == []


# ------------------------------------------------------------------------------------------ fallbacks

def test_missing_optional_facts_fall_back_gracefully(no_text):
    """Facts empty: the order alone gives the numbers; labels, tax and settlement come from the root."""
    email = render(bare("W8", "SPY", SPY_LEGS, 1, 9.80, 10.40), {})
    assert email.subject == ("[PAPER][TRADE T-2026-10-01-W8] BUY 1 SPY 745/780 call spread, 18 Dec, limit $9.80 — "
                             "W8 (W8) — after 10:00 ET Fri 2 Oct")
    rows = box(email.text)
    assert rows["SIZE"] == "$980 net debit"
    assert rows["STRESS"].startswith("Max loss −$1,040: the whole debit")
    assert rows["ODDS"] == "No base rate on file yet; the paper phase is measuring it"
    f = flat(email.text)
    assert "Two options on SPY (S&P 500 index fund)" in f and "WHAT YOU'RE BUYING: A CALL DEBIT SPREAD" in f
    assert "Most it can be worth: the width between the strikes, 35 × 100 = $3,500 per spread" in f
    assert "Breakeven at expiry: SPY at 754.80, the 745 strike plus the $9.80 you pay." in f
    assert "SPY options are American-style" in f and "SPY options are not Section 1256 contracts" in f
    assert "Planned close: sell to close the whole spread (both legs, one order) at least one trading day before it " \
           "expires on Fri 18 Dec." in f
    assert "Not available for this run." in f and "There's no GitHub issue link this time." in f
    assert len(steps_of(email.text)) == 7
    assert validate(email) == []


def test_index_root_defaults_without_labels(no_text):
    """XSP with only the order's numbers: the root decides the name, Section 1256 and settlement."""
    email = render(bare("M4", "XSP", XSP_LEGS, 2, 7.45, 8.20), ctx())
    f = flat(email.text)
    assert "Two options on XSP (Mini-S&P 500 index, one-tenth of the S&P 500)" in f
    assert "SIZE $1,490 net debit (2 × $745) = 1.49% of your $100,000 portfolio" in f
    assert "Max loss −$1,640 (−1.64% of portfolio)" in f
    assert "Breakeven at expiry: XSP at 777.45, the 770 strike plus the $7.45 you pay." in f
    assert "XSP is at" not in f                              # no spot, no sentence about it
    assert "cash-settled and European-style" in f and "Section 1256" in f
    assert validate(email) == []


def test_put_debit_spread_reads_the_other_way(no_text):
    email = render(bare("W9", "USO", USO_LEGS, 3, 1.20, 1.35), ctx())
    f = flat(email.text)
    assert "BUY 3 USO 80/75 put spreads" in email.subject
    assert "a bet that USO falls" in f and "At the top choose Buy and Put" in f
    assert "That happens if USO ends at or above 80 at expiry." in f
    assert "Breakeven at expiry: USO at 78.80, the 80 strike minus the $1.20 you pay." in f
    assert "You'd then own USO shares, still covered by the put you own." in f
    assert validate(email) == []


@pytest.mark.parametrize("side, kind", [("buy", "NEW_TRADE"), ("sell", "EXIT")])
def test_an_order_the_email_cannot_describe_is_not_placed(no_text, side, kind):
    email = render(bare("M4", "XSP", None, 1, None, None, side=side, kind=kind), ctx())
    assert steps_of(email.text) == [
        "This email doesn't show both strikes, the expiration and the limit price, so don't place anything",
        "Record skipped (link below)"]
    assert "Don't guess them: place nothing and record skipped" in flat(email.text)
    assert validate(email) == []


# ------------------------------------------------------------------------------------------ both parts, validator

@pytest.mark.parametrize("make", [m4_entry, m4_exit, w8_entry,
                                  lambda: bare("W8", "SPY", SPY_LEGS, 1, 9.80, 10.40),
                                  lambda: bare("W9", "USO", USO_LEGS, 3, 1.20, 1.35)])
def test_every_spread_email_validates_in_both_parts_within_seven_steps(m4_text, make):
    email = render(make(), ctx())
    assert 1 <= len(steps_of(email.text)) <= 7
    assert validate(email) == []
    visible = html_to_text(email.html)
    assert set(numeric_tokens(email.text)) == set(numeric_tokens(visible))    # the same numbers in both parts
    for phrase in ("Do this in Robinhood", "What if", "How you get out (decided now)", "Risks and tax",
                   "Record your fill", "11:00 ET", "filled <contracts> @ <net price>"):
        assert phrase in visible, phrase
    assert not re.search(r"<(img|script|link|iframe)\b|\bsrc=", email.html, re.I)


def test_html_part_carries_the_explainer_and_the_steps(m4_text):
    email = render(m4_entry(), ctx())
    visible, text = flat(html_to_text(email.html)).lower(), flat(email.text).lower()     # the text part's headings
    for phrase in ("What you're buying: a call debit spread", "Most it can be worth: the width between the strikes",
                   "Tap Select, then the 770 and 810 calls", "Never leg in", "Section 1256 contracts",
                   "Planned close: sell to close the whole spread"):
        assert phrase.lower() in visible and phrase.lower() in text, phrase
    assert "<ol " in email.html and email.html.count("<li ") >= 7


def test_validator_blocks_a_changed_spread_number(m4_text):
    email = render(m4_entry(), ctx())
    assert "11:00" in ALLOWED_LITERALS
    changed = dataclasses.replace(email, text=email.text.replace("Limit price: $7.45", "Limit price: $7.55"))
    assert any('"$7.55"' in p for p in validate(changed))
    strikes = dataclasses.replace(email, subject=email.subject.replace("770/810", "775/810"))
    assert any(p.startswith("subject:") and "775/810" in p for p in validate(strikes))
    later = dataclasses.replace(email, text=email.text.replace("Not filled by 11:00 ET", "Not filled by 11:30 ET"))
    assert any('"11:30"' in p for p in validate(later))


def test_live_mode_labels_the_spread_live(m4_text):
    email = render(m4_entry(), ctx(mode="live"))
    assert email.subject.startswith("[LIVE][TRADE T-2026-09-29-M4] BUY 2 XSP 770/810 call spreads")
    assert email.text.startswith("LIVE TRADE") and "paper broker" not in email.text
    assert validate(email) == []


def test_etf_orders_still_get_the_etf_email():
    tid = "T-2026-10-01-M1"
    order = OrderIntent(intent_id="O-2026-10-01-M1-001", trade_id=tid, module="M1", account="ira", ticker="SPY",
                        side="buy", created_date="2026-10-01", reason="entry", dollars=6000.0)
    email = render(Recommendation(kind="NEW_TRADE", module="M1", trade_id=tid, created_date="2026-10-01",
                                  orders=[order], facts={}), {})
    assert "spread" not in email.text.lower() and "order_type" not in email.meta
    assert "Order type: Market · Buy in: Dollars" in email.text
