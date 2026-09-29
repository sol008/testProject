"""Email text for M4, the crash call spread (design v3.3 §3 M4; docs/PHASE_B_CONTRACTS.md §8).

Merged into `traderec.emails`' tables at import. Same rules as emails.py: no digits in the templates below; every
number comes from the facts built in `traderec.runners.m4` (entry_facts / exit_facts) through the number registry.
Labels (MODULE_NAMES, MODULE_STATUS, MODULE_CONFIDENCE) are fixed, reviewed text and are registered verbatim.

Facts read here, NEW_TRADE: spx_close, spx_high, spx_drawdown (a fraction), high_sessions, drop_from_high (a
fraction), vix, vix_min, cooldown_days, root, contracts_label, long_strike, short_strike, short_strike_ratio,
expiry, execute_date, limit_price, max_debit_usd, width_usd, max_multiple, exit_date, last_close_date,
close_sessions_before, american_root (SPY only), fallback_from (only when SPY replaced XSP) and base_rates
(since, signals, episodes, win_rate, mean_pct, is_mean_pct, oos_since, lost_all_share). EXIT: root,
contracts_label, expiry, execute_date, limit_price, entry_date, entry_price, mid_price, retry_date (first attempt)
or retry_of (the retry).
"""
from __future__ import annotations

_WHY_EXIT = [
    ("The close was planned when you bought: at least one trading day before expiry, so Robinhood never has to "
     "close it for you on expiry day, and the result is locked in.",),
    ("Tomorrow, {execute_date:date}, is the planned close. If it doesn't fill, {retry_date:date} is left for one "
     "retry: the last trading day before it expires on {expiry:date}.", None),
    ("The close of {retry_of:date} didn't fill, so this is the one retry, with fresh prices. Tomorrow, "
     "{execute_date:date}, is the last trading day before it expires on {expiry:date}.", None),
    ("You bought it on {entry_date:date} for a net {entry_price:money2} a share; tonight the middle of the quotes is "
     "{mid_price:money2}.", None),
    ("Profit or loss doesn't change anything: the exit was decided when you bought.",),
]

_ONE_SENTENCE_EXIT = (
    "Your {root} call spread expires on {expiry:date}, so sell to close all {contracts_label} after "
    "10:00 ET on {execute_date:date} at a net price of {limit_price:money2}.",
    "Your {root} call spread expires on {expiry:date}, so sell to close all of it after 10:00 ET on "
    "{execute_date:date}.",
    "Your call spread expires soon, so sell to close all of it after 10:00 ET tomorrow.",
)

TEXT: dict = {
    "MODULE_NAMES": {"M4": "Crash call spread"},
    "MODULE_STATUS": {"M4": "policy module, 90-day exception"},
    "MODULE_CONFIDENCE": {
        "M4": "Low: a capped-loss bet on a rebound after a crash; the evidence is a dozen crises, mostly the quick "
              "recoveries of recent decades",
    },
    "DEFAULT_TICKERS": {"M4": "XSP"},
    "PLAN_NAMES_EXIT_EMAIL": {"M4"},      # the exit plan below already says when the EXIT email comes
    "ONE_SENTENCE": {
        "M4": {
            "NEW_TRADE": (
                "The S&P 500 is {spx_drawdown:apct1} below its high of the past year and the VIX is at {vix:num1}, "
                "so buy {contracts_label} of the {root} call spread with strikes {long_strike:num} and "
                "{short_strike:num}, expiring {expiry:date}, after 10:00 ET on {execute_date:date} at a net price "
                "of {limit_price:money2}.",
                "The S&P 500 crashed and fear is high, so buy {contracts_label} of the {root} call spread in this "
                "email after 10:00 ET on {execute_date:date}.",
                "The S&P 500 crashed and fear is high, so buy the call spread in this email after 10:00 ET "
                "tomorrow.",
            ),
            "EXIT": _ONE_SENTENCE_EXIT,
            "EXIT:expiry_rule": _ONE_SENTENCE_EXIT,
        },
    },
    "WHY": {
        "M4": {
            "NEW_TRADE": [
                ("The S&P 500 closed at {spx_close:num2}, {spx_drawdown:apct1} below its highest close of the last "
                 "{high_sessions:int} trading days ({spx_high:num2}). The rule needs a fall of "
                 "{drop_from_high:apct0} or more.",
                 "The S&P 500 closed {spx_drawdown:apct1} below its high of the past year. The rule needs a fall of "
                 "{drop_from_high:apct0} or more.",
                 "The S&P 500 is far below its high of the past year."),
                ("The VIX (Wall Street's fear gauge, read from option prices) closed at {vix:num2}, at or above "
                 "{vix_min:num}: investors are scared.",
                 "The VIX (Wall Street's fear gauge) is at or above {vix_min:num}: investors are scared.",
                 "The VIX (Wall Street's fear gauge) is high: investors are scared."),
                ("It's the first day both held in {cooldown_days:int} days. The rule acts once per crash, then "
                 "waits, so it never holds two spreads at once.",
                 "It's the first day both held. The rule acts once per crash, then waits."),
                ("A call spread = you buy one call option and sell a higher one with the same expiry. Here you buy "
                 "the {long_strike:num} call (about where {root} closed) and sell the {short_strike:num} call (about "
                 "{short_strike_ratio:pct0} of it), and you pay the difference up front: the debit.",
                 "A call spread = you buy one call option and sell a higher one with the same expiry, and you pay "
                 "the difference up front: the debit."),
                ("At expiry a contract is worth between zero and the gap between the strikes "
                 "({width_usd:money}). So the spread pays up to about {max_multiple:num1} times the debit if the "
                 "market climbs back, and loses the whole debit if it doesn't.",
                 "It pays up to the gap between the strikes if the market climbs back, and loses the whole debit if "
                 "it doesn't."),
                ("The bet, in plain words: after crashes like this the market has usually bounced back within a few "
                 "months. The spread profits from that bounce, and the most you can lose is what you pay.",),
                ("Since {since:year} the spread returned {mean_pct:sppct0} of the debit per trade on average, and "
                 "{win_rate:pct0} of trades made money. Most of that came from the quick recoveries after "
                 "{oos_since:year}; before then the average was {is_mean_pct:sppct0}.",
                 "In testing the spread returned {mean_pct:sppct0} of the debit per trade on average.", None),
                ("{fallback_from} options failed tonight's liquidity check, so this uses {root} options instead.",
                 None),
            ],
            "EXIT": _WHY_EXIT,
            "EXIT:expiry_rule": _WHY_EXIT,
        },
    },
    "EXIT_PLAN": {
        "M4": {
            "NEW_TRADE": [
                ("Sell to close the whole spread on {exit_date:date}, {close_sessions_before:int} trading days "
                 "before it expires on {expiry:date}. You'll get an EXIT email the evening before, with the prices.",
                 "Sell to close the whole spread on {exit_date:date}, before it expires on {expiry:date}. You'll "
                 "get an EXIT email the evening before, with the prices.",
                 "Sell to close the whole spread a couple of trading days before it expires. You'll get an EXIT "
                 "email the evening before, with the prices."),
                ("If that close doesn't fill, an EXIT email the next evening gives fresh prices for "
                 "{last_close_date:date}, the last trading day before expiry. Never hold it into expiry day.",
                 "If that close doesn't fill, an EXIT email the next evening gives fresh prices. Never hold it into "
                 "expiry day."),
                ("No stop-loss and no profit target: the rule was tested this way, and the close date is fixed now.",),
            ],
        },
    },
    "RISKS": {
        "M4": [
            ("You can lose the whole debit, up to {max_debit_usd:money}: {lost_all_share:pct0} of past trades did, "
             "when the market kept falling.",
             "You can lose the whole debit, up to {max_debit_usd:money}, if the market keeps falling.",
             "You can lose the whole debit if the market keeps falling."),
            ("The evidence is thin: {signals:int} signals in {episodes:int} crises since {since:year}, priced on a "
             "model, not on real quotes. The paper phase measures it on real prices.",
             "The evidence is thin: about a dozen crises, priced on a model, not on real quotes."),
            ("{american_root} options are American-style: the call you sold can be assigned early, most often just "
             "before {american_root} goes ex-dividend while that call is in the money. If that happens, note it on "
             "the trade's issue.", None),
        ],
    },
}
