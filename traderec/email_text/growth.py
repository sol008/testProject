"""Email text for the growth book: the Sunday email and the Rule E exit (design v4 §9, §3a.7; track 32 §4.4, §6).

`TEXT` is merged into `traderec.emails`' shared tables at import (labels for the GROWTH module and the fund names).
`PHRASES` holds the numbered sentences of both emails: each is a template whose `{field}` placeholders are filled
from the facts record by `traderec.growth.email` (through the number registry) and re-read by the validator's slot
check (`traderec.validator.check_slots`, kinds GROWTH and RULE_E), which rebuilds every field from the facts alone. So
one template serves both the renderer and the check, and a number in the wrong slot fails. Same rules as emails.py: no
digits in any template; a fund's own numbers come from `growth.email.risk_box.funds` through the facts.

`STATIC` holds the sentences without numbers (the what-if block, the Robinhood steps, the tax line).
"""
from __future__ import annotations

TEXT: dict = {
    "MODULE_NAMES": {"GROWTH": "Growth book", "G1": "Leveraged index trend", "G2": "Bitcoin switch"},
    "MODULE_STATUS": {"GROWTH": "policy module, one Sunday email a week", "G1": "growth-book sleeve",
                      "G2": "growth-book sleeve"},
    "MODULE_CONFIDENCE": {
        "GROWTH": "Central case about nine to ten percent a year; thirty percent or more only if the last decade repeats",
    },
    "TICKER_NAMES": {"SSO": "2x S&P 500 fund", "QLD": "2x Nasdaq-100 fund"},
}

INDEX_NAMES = {"^GSPC": "S&P 500", "^NDX": "Nasdaq-100", "BTC-USD": "Bitcoin"}
SOURCE_LABELS = {"nasdaq": "Nasdaq", "fred:SP500": "FRED", "cboe-quote": "CBOE", "robinhood": "Robinhood",
                 "yahoo-quote": "Yahoo", "daily_bars:BTC-USD": "Yahoo (BTC-USD)", "second source": "the second source",
                 "replay-echo": "the replay echo"}
STATE_WORDS = {("in", True): "switches in", ("in", False): "stays in", ("out", True): "switches out",
               ("out", False): "stays out", ("on", True): "switches on", ("on", False): "stays on",
               ("off", True): "switches off", ("off", False): "stays off"}
REASON_WORDS = {"switch_off": "the sleeve switched off", "switch_on": "the sleeve switched on",
                "governor_cut": "the governor cut the size", "governor_restore": "the governor restored the size",
                "rebalance": "a rebalance back to target", "hard_stop": "the hard stop: everything to the cash fund",
                "fund_buys": "it funds the buys below", "idle_cash_to_sgov": "idle cash goes to the cash fund",
                "w10_entry": "the crash-day buy", "rule_e": "Rule E, the emergency exit",
                "g3_entry": "a promoted gems rule's entry, from the reserve", "g3_exit": "the gems rule's exit"}

# The numbered sentences. {placeholders} are fields of the slot table (growth.email.slot_specs); a placeholder in
# angle brackets is literal text substituted before the template is used (a ticker, an index name, "above"/"below").
PHRASES: dict[str, str] = {
    # the one line
    "summary": "This week: {n_rec} recommendation, {n_orders} orders.",
    "summary_one": "This week: {n_rec} recommendation, {n_orders} order.",
    "summary_none": "This week: no change.",
    # target vs now
    "row": "<ticker> <state> {tp} {tu} {h} {d}",
    "book": "The book is {dd} below its peak of {peak}, so the size is {G}",
    "nav": "NAV {nav}: IRA {ira}, taxable {taxable}",
    "governor": "full size until the book is {full} below its peak, then down to {floor} of full size at {floor_at}, "
                "and everything is sold to the cash fund at {hs}",
    "gems": "the gems reserve ({g3}, on paper until a rule is promoted) and the cash sleeve ({cash})",
    # the gems paragraph (design v4 §3 G3; Phase C4a): the promoted rules' slots and the shadow tally
    "gems_promoted": "the gems reserve's cash part ({g3}; the promoted rules' slots hold the rest) and the cash sleeve "
                     "({cash})",
    "gems_live": "{open} of at most {max} single names are open: the promoted gems rules hold {slots} and {sgov} of the "
                 "reserve stays in the cash fund",
    "gems_slot": "<ticker> (<state>): {usd} since <entry>, out by <due> at the latest; discount {disc} at the signal "
                 "(z {z})",
    "gems_slot_trust": "<ticker> (<state>): {usd} since <entry>; discount {disc} at the signal",
    "gems_slot_pending": "<ticker>: buy {usd} this week; discount {disc} at the signal of <when> (z {z})",
    "gems_slot_pending_trust": "<ticker>: buy {usd} this week; discount {disc} at the signal of <when>",
    "gems_tally": "<rule>: {n} shadow trades closed, mean excess {ex} over <basis>; {k} of {m} promotion checks pass",
    "gems_tally_partial": "<rule>: {n} shadow trades closed, no scored excess yet; {k} of {m} promotion checks pass",
    # the why
    "why_g1": "the <index> closed {c}, {p} <ab> its {n}-day average of {s}",
    "why_g1_band": "it needs {band} beyond the average to switch",
    "why_g2": "Bitcoin's weekly close was {wc}: <ab1> its {w}-week average of {ma} and <ab2> its {n}-day average "
              "of {sma}",
    "why_vol": "Bitcoin's realised volatility is {vol}, so the sleeve runs at {factor} of its weight",
    # step 1 and step 2
    "sell_all": "Sell all <ticker>, market ({h1} at Friday's close)",
    "sell_usd": "Sell {s1} of <ticker>, market, in dollars",
    "buy": "Buy {b} of <ticker>, market, in dollars",
    "cash_rule": "each buy is at most {mh} of the cash it needs, so Robinhood's hold-back on market orders never "
                 "blocks it (a queued buy may use at most {q})",
    "deferred": "next Sunday: <verb> {d} of <ticker>",
    "dropped": "dropped this week: <verb> {x} of <ticker>",
    "skipped": "<ticker>: a change of {x} is inside its no-trade band",
    # risk
    "crash": "a {year}-style day costs this book about {crash} before any rule can act",
    "hard_stop": "the hard stop sells everything at {hs}",
    "ira": "IRA gains can't be withdrawn before <age> without a {penalty} extra tax",
    "rb_reset": "<ticker> resets every day: it aims for <mult> the <index>'s move each day, not over weeks. If the "
                "index rises {up} and then falls {down} (back to even), the fund is down {chop}. Choppy markets eat "
                "it while the index goes nowhere",
    "rb_wipeout": "One day can wipe <ticker> out: a {wipe} index fall in a day takes the whole fund (the prospectus "
                  "risk). A {year}-style day ({crash_day} for the index, the S&P's worst) would cost it {crash_fund}",
    "rb_history": "Real history: bought and held, <ticker> fell {dd} at its worst (<when>); with this rule the worst "
                  "was {rule_dd}. Monday's fill comes after the weekend's news, so the price can be far from Friday's",
    "rb_cost": "<ticker> costs more than it looks: a {fee} fee plus built-in borrowing of about {borrow} a year at "
               "today's rates",
    "rb_gap": "Bitcoin trades all week, but <ticker> trades only in market hours, so weekend moves arrive as a "
              "Monday gap: the worst was {gap} (<when>), and a gap beyond {five} comes on about {odds} of Mondays",
    "rb_switch": "The switch can't dodge a crash inside a week: in <when> the switched Bitcoin sleeve's worst drawdown "
                 "was {dd}; the forward planning number is {fdd}",
    "rb_fee": "<ticker> is a <mult> fund with no daily reset, and it costs a {fee} fee a year",
    # sources
    "source": "<index> closed {p} on the primary source and {q} on <source>",
    # Rule E scored in the Sunday email
    "rule_e_score": "Rule E sold <ticker> on <when> at {price}; a Sunday exit would have sold at about {alt} (Friday's "
                    "close), so the exit scored {edge}",
    "rule_e_count": "Rule E has fired {n} of at most {max} times this year",
    # the Rule E email
    "re_trigger": "the <index> closed {c}, {p} below its {n}-day average of {s}",
    "re_sell": "Sell all <ticker>, market, queued for the next open: about {h} at tonight's close",
    "re_count": "Rule E has fired {n} of at most {max} times this year (and at most {w} a week); beyond that, exits "
                "wait for Sunday",
}

STATIC: dict[str, str] = {
    "summary_no_orders": "Nothing to place this week.",
    "why_none": "No sleeve changed its state this week.",
    "why_data": "<index>: no signal this week (<reason>), so <ticker> keeps its state.",
    "rule_e_pending": "Rule E sold <ticker> on <when>: that sale fills at the next open, so this email carries no new "
                      "order for it, and its shares still show in the account until then.",
    "sale_pending": "A sale of <ticker> queued on <when> has not filled yet: it fills at the next open, so this email "
                    "carries no new order for it.",
    "deferred_none": "Nothing is deferred.",
    "gems_none": "<rule>: no shadow trades closed yet.",
    "gems_passed": "<rule>: its promotion test passed; set status: live in the constitution to trade the reserve with it.",
    "gems_order_buy": "This week's Step 2 buys it.",
    "gems_order_sell": "This week's Step 1 sells it.",
    "gems_order_deferred": "Its buy is deferred to next Sunday.",
    "step1_none": "Nothing to sell: Step 1 is empty this week.",
    "step2_none": "Nothing to buy this week.",
    "tax_ira":"Tax: no tax on trades inside the IRA. Every switch happens in the IRA; nothing in the taxable "
               "account is sold.",
    "monday_gap": "Monday's fill comes after the weekend's news: the price can be far from Friday's close.",
    "what_if_gap": "The open gaps up or down: place the orders anyway. The rules decide on Friday's close, not on "
                   "Monday's price.",
    "what_if_queued": "A Step 1 sell still shows Queued after the open: wait for Filled before the buys, then place "
                      "them any time that day.",
    "what_if_power": "Robinhood shows less buying power than a buy needs: enter what the cash rule above allows "
                     "(that share of what it shows) and record the dollars you entered.",
    "what_if_dollars": "A dollar order is refused: buy whole shares worth about the amount (amount divided by the "
                       "share price shown), and record the dollars you got.",
    "what_if_missed": "You missed the day: place the orders the next trading day in the same order, and record the "
                      "prices. The paper broker fills at the stated open either way.",
    "what_if_holiday": "Monday is an NYSE holiday: everything moves to Tuesday, and the email says so above.",
    "step_open": "Open Robinhood and switch to your IRA (Account → Retirement)",
    "step_sells": "Step one, tonight or before the deadline above: for each sell, search the ticker, tap Trade → Sell, "
                  "Order type: Market, then Sell all (for a dollar sell: Sell in: Dollars and the amount). "
                  "Review → Submit: Robinhood queues it for the open",
    "step_no_sells": "Nothing to sell tonight: go straight to the buys on the day above",
    "step_check": "From the time above on the day above: check Account → History shows every sell as Filled",
    "step_buys": "For each buy, search the ticker, tap Trade → Buy, Order type: Market · Buy in: Dollars",
    "step_amount": "Amount: the dollars above (if buying power is lower, the share of it the email allows). "
                   "Review → Submit: it fills at once",
    "step_record": "Record each fill on its GitHub issue (links below): filled <dollars> @ <price>, or skipped",
    "step_record_no_issue": "Note each fill: the dollars and the price, or that you skipped it",
    "step_nothing": "Nothing to place this week: every sleeve is on target.",
    "tuesday": "Your IRA has no limited margin, so Monday's sale proceeds settle overnight: the buys are placed on "
               "Tuesday.",
    "re_sgov": "Buy the cash fund with the proceeds any time this week, as a market order in dollars. Sunday's email "
               "re-decides every sleeve on Friday's close; this leg re-enters only when its index is back above its "
               "average by the band.",
    "re_score": "Score: this exit is scored against waiting for Sunday (the price you get against the price a Sunday "
                "exit would have got), and the result is recorded at the next Sunday run.",
    "re_step_search": "Search <ticker>, then tap Trade → Sell",
    "re_step_market": "Order type: Market, then Sell all (it sells the whole position)",
    "re_step_record": "Record the fill on the issue (link below): filled <dollars> @ <price>, or skipped",
}
