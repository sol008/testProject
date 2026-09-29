"""Email text for W8 and W9, the macro-event call debit spreads (design v3.3 §3 M5; contract §8).

Merged into emails.py's tables at import. Same rules as emails.py: no digits in templates, every number comes from
`rec.facts` through the registry (facts built by `traderec.runners.macro.entry_facts` / `exit_facts`). Strike pairs
are written as words ("buy the X call, sell the Y call"): "X/Y" would read as one unregistered fraction token.
TICKER_NAMES is left alone on purpose: the facts carry `underlying_name` and `ticker_name`, and XSP belongs to M4's
text, so adding it here would collide at merge time.
"""
from __future__ import annotations

_WHEN = "after 10:00 ET on {execute_date:date}"
_DECIDED = ("The exit was decided when you bought: profit or loss doesn't change it.",)
_VETO_LINE = ("An AI check could only veto this trade; it cannot start one. It found no reason to stop it.",)

TEXT: dict = {
    "MODULE_NAMES": {"W8": "De-escalation call spread", "W9": "Barrel-loss oil call spread"},
    "MODULE_STATUS": {"W8": "policy module, small", "W9": "paper module"},
    "MODULE_CONFIDENCE": {
        "W8": "Low: a small bet on the stock drift that followed past peace deals; few past cases",
        "W9": "Low: a paper-only oil bet on very few past supply losses; it also hedges the book's peace bet",
    },
    "DEFAULT_TICKERS": {"W8": "XSP", "W9": "USO"},
    # the exit-plan templates below say when the EXIT email comes
    "PLAN_NAMES_EXIT_EMAIL": {"W8", "W9"},
    "ONE_SENTENCE": {
        "W8": {
            "NEW_TRADE": (
                "Oil fell hard on official peace news and the prediction markets moved with it, so buy "
                "{contracts:int} {root} {spread_word} (buy the {long_strike:num} call, sell the {short_strike:num} "
                "call, expiring {expiry:date}) " + _WHEN + ".",
                "Oil fell hard on official peace news, so buy {contracts:int} {root} {spread_word} " + _WHEN + ".",
            ),
            "EXIT:take_profit": (
                "The {root} {spread_word} reached {take_profit_frac:pct0} of its maximum value, so sell to close "
                + _WHEN + ".",
            ),
            "EXIT:time_stop": (
                "The {time_stop_sessions:int}-trading-day limit is up, so sell the {root} {spread_word} to close "
                + _WHEN + ".",
            ),
            "EXIT:invalidation": (
                "The ceasefire market fell below {invalidation_below:pct0}, so the peace trade is off: sell the {root} "
                "{spread_word} to close " + _WHEN + ".",
                "The ceasefire is failing, so the peace trade is off: sell the {root} {spread_word} to close "
                + _WHEN + ".",
            ),
            "EXIT:expiry_rule": (
                "Expiry is getting close, so sell the {root} {spread_word} to close " + _WHEN + ".",
            ),
            "EXIT": ("Sell the {root} {spread_word} to close " + _WHEN + ".",),
        },
        "W9": {
            "NEW_TRADE": (
                "Oil jumped as barrels went physically offline, so buy {contracts:int} {root} {spread_word} (buy the "
                "{long_strike:num} call, sell the {short_strike:num} call, expiring {expiry:date}) " + _WHEN + ".",
                "Oil jumped as barrels went physically offline, so buy {contracts:int} {root} {spread_word} "
                + _WHEN + ".",
            ),
            "EXIT:take_profit": (
                "The {root} {spread_word} is worth {take_profit_multiple:num} times what it cost, so sell to close "
                + _WHEN + ".",
            ),
            "EXIT:time_stop": (
                "The {time_stop_sessions:int}-trading-day limit is up, so sell the {root} {spread_word} to close "
                + _WHEN + ".",
            ),
            "EXIT:invalidation": (
                "The oil shock is fading, so sell the {root} {spread_word} to close " + _WHEN + ".",
            ),
            "EXIT:expiry_rule": (
                "Expiry is getting close, so sell the {root} {spread_word} to close " + _WHEN + ".",
            ),
            "EXIT": ("Sell the {root} {spread_word} to close " + _WHEN + ".",),
        },
    },
    "WHY": {
        "W8": {
            "NEW_TRADE": [
                ("Oil fell hard today: {brent_contract} (Brent crude for {brent_month:month}) closed {brent_ret:spct1} "
                 "and BNO, the Brent oil fund, {bno_ret:spct1}. The rule needs a fall of {oil_drop:apct0} or more.",
                 "Brent crude for {brent_month:month} ({brent_contract}) closed {brent_ret:spct1} today. The rule needs "
                 "a fall of {oil_drop:apct0} or more.",
                 "BNO, the Brent oil fund, closed {bno_ret:spct1} today. The rule needs a fall of {oil_drop:apct0} or "
                 "more.",
                 "Oil fell hard today."),
                ("On Polymarket, a prediction market, the odds that \"{pm_question}\" went from {pm_prev:pct0} to "
                 "{pm_price:pct0} since the last session. The rule needs a jump of {pm_jump_points:int} points or a "
                 "move through {pm_through:pct0}.",
                 "The prediction-market odds of peace jumped today."),
                ("An official announcement backs it: the veto check found it on {n_citations:int} official government "
                 "pages ({veto_sources}).",
                 "An official announcement backs it: the veto check found it on official government pages."),
                ("The bet: after past peace deals oil fell on the first day, but US stocks kept rising for weeks. In "
                 "{events:int} de-escalations since {since:year}, the S&P 500 was higher {horizon_sessions:int} trading "
                 "days later {spx_up_rate:pct0} of the time.",
                 "The bet: after past peace deals oil fell on the first day, but US stocks kept rising for weeks."),
                ("This trade never shorts oil: after past ceasefire headlines, oil shorts opened at the close faced a "
                 "median move of {short_adverse_pct:ppct1} against them within weeks.",
                 "This trade never shorts oil: after past ceasefire headlines, shorting oil at the close lost money."),
                _VETO_LINE,
            ],
            "EXIT:take_profit": [
                ("The spread is worth about {value_mid:money2} a share, at least {take_profit_frac:pct0} of the most it "
                 "can be worth ({width:money2} a share). The rule takes the profit instead of waiting for the rest.",
                 "The spread reached {take_profit_frac:pct0} of the most it can be worth. The rule takes the profit "
                 "instead of waiting for the rest."),
                _DECIDED,
            ],
            "EXIT:time_stop": [
                ("You have held it {sessions_held:int} trading sessions: the {time_stop_sessions:int}-trading-day limit "
                 "is up, so the rule sells whatever it's worth.",
                 "The {time_stop_sessions:int}-trading-day limit is up, so the rule sells whatever it's worth."),
                _DECIDED,
            ],
            "EXIT:invalidation": [
                ("The Polymarket market \"{invalidation_question}\" is at {invalidation_price:pct0}, below "
                 "{invalidation_below:pct0}: the ceasefire looks like it's failing, and with it the reason for this "
                 "trade.",
                 "The ceasefire market fell below {invalidation_below:pct0}: the reason for this trade is gone."),
                _DECIDED,
            ],
            "EXIT:expiry_rule": [
                ("The options expire on {expiry:date}. The rules close spreads well before expiry, to avoid assignment "
                 "and the wild last days.",),
                _DECIDED,
            ],
        },
        "W9": {
            "NEW_TRADE": [
                ("Oil jumped: {oil_contract} crude futures closed {oil_ret:spct1}. The rule needs a rise of "
                 "{oil_jump:pct0} or more.",
                 "Oil prices jumped today."),
                ("About {mbd_offline:num1} million barrels a day of exports are physically offline ({supply_what}), "
                 "with no fix expected for {no_restoration_days:int} days, per {supply_sources}.",
                 "At least a million barrels a day of exports are physically offline, per official sources."),
                ("In the few past cases where barrels were really lost ({events:int} since {since:year}), oil kept "
                 "rising: WTI averaged {wti_mean_20d_pct:sppct1} over the next {horizon_sessions:int} trading days.",
                 None),
                ("This is a paper-only module: too few past cases to trust with money. It also hedges the book's peace "
                 "bet.",),
                _VETO_LINE,
            ],
            "EXIT:take_profit": [
                ("The spread is worth about {value_mid:money2} a share, {take_profit_multiple:num} times what it cost. "
                 "The rule takes the profit.",
                 "The spread is worth {take_profit_multiple:num} times what it cost. The rule takes the profit."),
                _DECIDED,
            ],
            "EXIT:time_stop": [
                ("You have held it {sessions_held:int} trading sessions: the {time_stop_sessions:int}-trading-day limit "
                 "is up, so the rule sells whatever it's worth.",
                 "The {time_stop_sessions:int}-trading-day limit is up, so the rule sells whatever it's worth."),
                _DECIDED,
            ],
            "EXIT:invalidation": [
                ("The oil shock is fading: {invalidation_reason}.",
                 "The oil shock is fading: crude fell back or the lost barrels came back."),
                _DECIDED,
            ],
            "EXIT:expiry_rule": [
                ("The options expire on {expiry:date}. The rules close spreads well before expiry, to avoid assignment "
                 "and the wild last days.",),
                _DECIDED,
            ],
        },
    },
    "EXIT_PLAN": {
        "W8": {
            "NEW_TRADE": [
                ("Take profit: sell to close once the spread is worth {take_profit_frac:pct0} of its maximum value "
                 "(about {tp_value_usd:money} for your {contracts:int} {spread_word}).",
                 "Take profit: sell to close once the spread is worth {take_profit_frac:pct0} of its maximum value."),
                ("Time limit: otherwise sell after {time_stop_sessions:int} trading days, on {exit_date:date}, whatever "
                 "it's worth.",
                 "Time limit: otherwise sell after {time_stop_sessions:int} trading days, whatever it's worth."),
                ("Early exit: sell if the Polymarket market \"{invalidation_question}\" falls below "
                 "{invalidation_below:pct0} (it's {invalidation_price:pct0} now). That would mean the ceasefire is "
                 "failing.",
                 "Early exit: sell if the prediction-market odds that the ceasefire holds fall below "
                 "{invalidation_below:pct0}."),
                ("Each exit comes as an EXIT email the evening before, with its limit price. No stop-loss: the most you "
                 "can lose is what you pay.",),
            ],
        },
        "W9": {
            "NEW_TRADE": [
                ("Take profit: sell to close once the spread is worth {take_profit_multiple:num} times what you paid "
                 "(about {tp_value_usd:money}).",
                 "Take profit: sell to close once the spread is worth {take_profit_multiple:num} times what you paid."),
                ("Time limit: otherwise sell after {time_stop_sessions:int} trading days, on {exit_date:date}, whatever "
                 "it's worth.",
                 "Time limit: otherwise sell after {time_stop_sessions:int} trading days, whatever it's worth."),
                ("Early exit: sell if WTI crude closes below its level before the supply loss, or if the lost barrels "
                 "come back.",),
                ("Each exit comes as an EXIT email the evening before, with its limit price. No stop-loss: the most you "
                 "can lose is what you pay.",),
            ],
        },
    },
    "RISKS": {
        "W8": [
            ("If stocks don't rise, the spread can lose most or all of the {max_debit_usd:money} you pay. That's the "
             "planning loss in the box above.",
             "If stocks don't rise, the spread can lose most or all of what you pay."),
            ("Peace deals fail: recent ones collapsed within weeks. The ceasefire-market exit is there for that.",),
            ("It counts toward the book's single peace bet: airlines, stocks and falling oil all move together this "
             "year, so the system caps them together.",),
        ],
        "W9": [
            ("If oil doesn't keep rising, the spread can lose most or all of the {max_debit_usd:money} you pay. That's "
             "the planning loss in the box above.",
             "If oil doesn't keep rising, the spread can lose most or all of what you pay."),
            ("Oil fund options are costly to trade: getting in and out eats a large share of the price. That's one "
             "reason this module is paper-only.",),
            ("Supply shocks can reverse fast when barrels are rerouted or restored; the early exit is there for that.",),
        ],
    },
}
