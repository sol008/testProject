"""Plain-English trade emails: `render()` for one decision, `render_monthly()` for the monthly review.

Design: research/00-SYSTEM-DESIGN-v3.md §3a and §9, research/11-trade-email-spec.md and
research/20-executability-check.md. One email = one decision, written for a busy retail trader using the
Robinhood app: short sentences, every term explained inline, and at most 7 taps with exact values.

Number registry
---------------
Every number in an email comes from a `NumberRegistry` formatter (`fmt_money`, `fmt_pct`, `fmt_num`,
`fmt_date`), which returns the string and records it in `RenderedEmail.numbers_registered`. Templates hold
no digits: only list step numbers and `validator.ALLOWED_LITERALS` ("9:30", "10:00", "24/7", "S&P 500",
"§8"). Rule constants (200-day average, RSI below 10, ...) are read from `rec.facts`, never typed into a
template, so `validator.validate()` can prove that every number came from the data. Data-layer strings
that contain digits (ids, labels, forecast questions, URLs, `exit_plan` lines) are registered verbatim.

Templates use `{key:spec}` placeholders filled from `rec.facts` (plus derived values). A sentence whose
facts are missing falls back to a variant without that number, or is left out. Specs: `money`/`money2`
(whole dollars / cents), `pct0..2` (a fraction: 0.06 -> 6%), `ppct0..2` (percent units, for keys ending in
`_pct`: 0.88 -> 0.88%), `num`/`num1..3`, `int`, `year`, `date` ("Fri 3 Oct"), `datel`, `dateiso`,
`month`, `str`; prefix `s` shows a + sign, prefix `n` shows the value as a loss (−abs), prefix `a` shows the
magnitude ("fell {spx_ret:apct2}" -> "fell 3.12%").

The label tables (MODULE_NAMES, MODULE_STATUS, MODULE_CONFIDENCE) are fixed, reviewed text; like data-layer
labels they are registered verbatim, so W10's "90-day exception" and "proven only after 1990" pass the validator.

ctx keys (all optional)
-----------------------
mode                 "paper" (default) | "live"
nav                  total portfolio value in USD, for "% of portfolio"
portfolio_after      [{"name", "value", "pct"}]; `pct` is a fraction (0.06 = 6%) and is computed from
                     value / nav when missing. A pct column summing to more than 1.5 is read as percent units.
ledger_head          ledger head hash (first 12 characters shown)
issue_url            the trade's GitHub issue, where the fill is recorded
data_asof            data snapshot time, shown verbatim (e.g. "2026-10-02 22:17 ET")
sources              list of data sources (or one string)
constitution_version e.g. "3.2.0"
next_session         YYYY-MM-DD of the next session, used when facts carry no execute_date

rec.facts keys read by `render` (all optional)
----------------------------------------------
Nested dicts are searched one level deep, so `{"rule": cfg_m1, "signal": entry_check}` works as well as a
flat dict.
- module_name, confidence, status, stage   labels (defaults per module below)
- account ("ira" | "taxable" | "coinbase"), ticker, ticker_name   default: from the first order
- dollars          buy amount in USD (default: sum of the buy orders' dollars)
- execute_date     YYYY-MM-DD of the session the orders fill at (default: next weekday after created_date;
                   holidays are not known here, so the pipeline should pass it)
- stress_usd       planning loss in USD (magnitude); stress_pct: the same in percent units (1.96 = 1.96%,
                   per the `_pct` convention; a fraction is detected when it matches stress_usd / nav).
                   Missing stress_pct is computed as stress_usd / nav.
- exit_plan        list of plain-English lines (or one string), shown verbatim; default: module template
- base_rates       {"since", "trades_per_year", "win_rate" (fraction), "mean_pct", "planning_mean_pct",
                   "median_hold_sessions", "worst_pct", "max_drawdown_pct"} (the `_pct` ones in percent units)
- close            last close of the ticker (why-text and whole-share estimates)
- position_value   value of the position being sold; qty / keep_qty: shares of this trade / shares of the
                   same ticker held for another module (then the email sells by shares, not "Sell all")
- pnl_usd, pnl_pct result so far on EXIT / SWITCH_OFF (pnl_pct in percent units)
- M1: sma200, rsi2, vix, sma5, sessions_held, reason ("exit_rule" | "time_stop"), and the rule constants
      sma_trend, rsi_period, rsi_below, vix_min, exit_sma, max_sessions; time_stop_date
- M2: signals {ticker: {"ret_252", "excess", "sign", ...}}, targets {ticker: dollars} (or the m2_targets
      dict), rf_annual, lookback_sessions, gross_cap_pct_nav, single_leg_cap_pct_nav, band_rel,
      band_abs_usd, max_orders_per_email, deferred (legs that come in the next trading day's follow-up email),
      skipped_band, prices {ticker: last close}, batch (2, 3, ... on a follow-up email with the same trade_id;
      labelled "part N" and said to finish the month's rebalance unless more legs are still deferred)
- M3: weekly_close, sma, weeks, week_end, sleeve_pct_nav
- W10: spx_close, spx_prev_close, spx_ret (fraction), sma200_prev, drop_pct (fraction), decluster_sessions,
       max_calendar_days, sma_trend (shows "200-day" when present), exit_date (the planned sell session),
       horizon_stress_usd / horizon_stress_pct (planning loss over the full hold, percent units), base_rates
       (+ placebo_mean_pct, worst_interim_pct, optional edge_since and worst_interim_when, e.g. "March 2020");
       EXIT: reason "calendar_stop", entry_date, days_held, sessions_held
OrderIntent.meta may carry "ref_price", "qty" and "keep_qty" per order (REBALANCE).
"""
from __future__ import annotations

import html as _html
import math
import numbers
import re
import string
import textwrap
from datetime import date, datetime, timedelta
from typing import Any, Iterable

from .types import OrderIntent, Recommendation, RenderedEmail

__all__ = [
    "DISCLAIMER", "GATE_DEFAULTS", "NumberRegistry", "PAPER_BANNER", "render", "render_monthly",
]

MINUS = "−"
TEXT_WIDTH = 72
BOX_WIDTH = 70

DISCLAIMER = ("Automated research generated for your personal use by an AI system; not individualized advice "
              "from a licensed professional. You decide.")
PAPER_BANNER = "PAPER TRADE — no real money. Place it in your practice account or just log it."
LIVE_BANNER = "LIVE TRADE — real money. Place it exactly as shown below."
PAPER_MONTHLY_BANNER = "PAPER PHASE — no real money. These results come from the paper broker."
LIVE_MONTHLY_BANNER = "LIVE — these results are real money."

MODULE_NAMES = {"M1": "Uptrend dip-buy", "M2": "Trend book", "M3": "Bitcoin trend switch",
                "W10": "Uptrend crash-day buy"}
MODULE_STATUS = {"M1": "policy module", "M2": "trend sleeve", "M3": "policy module, opt-in sleeve",
                 "W10": "policy module, 90-day exception"}
MODULE_CONFIDENCE = {
    "M1": "Medium: a tested rule with a small, steady edge",
    "M2": "Low to medium: trend rules pay off over years, not months",
    "M3": "Low: a risk switch that follows Bitcoin's trend, not a prediction",
    "W10": "Low to medium: a small timing edge on about three months of market exposure; proven only after 1990",
}
DEFAULT_TICKERS = {"M1": "SPY", "M3": "IBIT", "W10": "SPY"}
# Modules whose exit-plan template already says when the sell email comes (no generic reminder appended).
PLAN_NAMES_EXIT_EMAIL = {"W10"}
TICKER_NAMES = {
    "SPY": "S&P 500 index fund", "VOO": "S&P 500 index fund", "QQQ": "Nasdaq tech-heavy index fund",
    "IEF": "medium-term US Treasury bond fund", "TLT": "long-term US Treasury bond fund", "GLD": "gold fund",
    "USO": "US oil fund", "BNO": "Brent oil fund", "FXE": "euro currency fund", "FXY": "Japanese yen fund",
    "FXA": "Australian dollar fund", "IBIT": "iShares Bitcoin ETF", "FBTC": "Fidelity Bitcoin ETF",
    "SGOV": "T-bill fund", "BIL": "T-bill fund", "DAL": "Delta Air Lines stock", "BTC-USD": "Bitcoin",
}
ACCOUNT_LABELS = {"ira": "IRA", "taxable": "individual (taxable) account", "coinbase": "Coinbase account"}
ACCOUNT_SWITCH = {
    "ira": "Open Robinhood and switch to your IRA (Account → Retirement)",
    "taxable": "Open Robinhood and switch to your individual account (Account → Individual)",
}
TAX_LINES = {
    "ira": "Tax: no tax on trades inside the IRA.",
    "taxable": "Tax: this is a taxable account, so short-term gains are taxed as ordinary income.",
    "coinbase": "Tax: Coinbase is a taxable account, so short-term gains are taxed as ordinary income.",
}
KIND_TAGS = {"NEW_TRADE": "TRADE", "EXIT": "EXIT", "REBALANCE": "TREND", "SWITCH_ON": "BTC", "SWITCH_OFF": "BTC"}
BUY_KINDS = ("NEW_TRADE", "SWITCH_ON")
SELL_KINDS = ("EXIT", "SWITCH_OFF")
QUEUE_STEP = "Review → Submit. Robinhood queues after-hours market orders and fills them at the 9:30 ET open"

# Go-live gate at 25% size (design §7); used when the monthly report does not carry its own thresholds.
GATE_DEFAULTS = {"gate_months": 3, "gate_trades": 30, "gate_on_time": 0.95, "gate_emails_handled": 0.90}
BRIER_COIN_FLIP_P = 0.5     # always forecasting 50% ...
BRIER_COIN_FLIP = 0.25      # ... scores a Brier of 0.25
FEW_FORECASTS = 30          # below this many scored forecasts the monthly email calls the gap noise


# --------------------------------------------------------------------------------------------- the registry

def _strip_zeros(body: str) -> str:
    return body.rstrip("0").rstrip(".") if "." in body else body


def _sign(v: float, body: str, signed: bool) -> str:
    nonzero = any(c in "123456789" for c in body)
    if v < 0 and nonzero:
        return MINUS
    return "+" if signed and v > 0 and nonzero else ""


def _to_date(d: Any) -> date:
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    return date.fromisoformat(str(d).strip()[:10])


_SPEC = re.compile(r"^(?P<mod>[sna]?)(?P<kind>money|ppct|pct|num|int|year|dateiso|datel|date|month|str)?(?P<dec>\d)?$")
_DATE_STYLES = {"date": "short", "datel": "long", "dateiso": "iso", "month": "month"}


class NumberRegistry:
    """Formats numbers for an email and records every string it hands out.

    `numbers` becomes `RenderedEmail.numbers_registered`; the validator accepts exactly these tokens.
    """

    def __init__(self) -> None:
        self.numbers: list[str] = []
        self._seen: set[str] = set()

    def register(self, value: Any) -> str:
        """Record a data-layer string verbatim (only strings with digits need it) and return it."""
        s = "" if value is None else str(value)
        if s not in self._seen and any(ch.isdigit() for ch in s):
            self._seen.add(s)
            self.numbers.append(s)
        return s

    def fmt_money(self, x: float, *, cents: bool = False, signed: bool = False) -> str:
        """6000 -> "$6,000"; -1956.4 -> "−$1,956"; cents=True -> "$663.27"; signed=True -> "+$120"."""
        v = float(x)
        body = format(abs(v), ",.2f" if cents else ",.0f")
        return self.register(_sign(v, body, signed) + "$" + body)

    def fmt_pct(self, x: float, *, decimals: int = 1, signed: bool = False, points: bool = False) -> str:
        """A fraction as a percent (0.06 -> "6%", 0.0196 -> "2%" at 1 decimal); points=True when x is already in
        percent units (0.88 -> "0.88%" with decimals=2). Trailing zeros are dropped."""
        v = float(x) if points else float(x) * 100.0
        body = _strip_zeros(format(abs(v), f",.{decimals}f"))
        return self.register(_sign(v, body, signed) + body + "%")

    def fmt_num(self, x: float, *, decimals: int | None = None, grouping: bool = True, signed: bool = False,
                strip: bool | None = None) -> str:
        """decimals=None: whole numbers as integers, otherwise up to 2 decimals (3.8 -> "3.8").
        grouping=False for years (2008). strip drops trailing zeros (default only when decimals is None)."""
        v = float(x)
        if decimals is None:
            decimals = 0 if v.is_integer() else 2
            strip = True if strip is None else strip
        body = format(abs(v), ("," if grouping else "") + f".{decimals}f")
        if strip:
            body = _strip_zeros(body)
        return self.register(_sign(v, body, signed) + body)

    def fmt_date(self, d: Any, style: str = "short") -> str:
        """"short": "Fri 3 Oct"; "long": "Fri 3 Oct 2026"; "iso": "2026-10-03"; "month": "October 2026";
        "day": "3 Oct 2026". Accepts YYYY-MM-DD strings, dates, datetimes and pandas Timestamps."""
        dd = _to_date(d)
        if style == "short":
            s = f"{dd:%a} {dd.day} {dd:%b}"
        elif style == "long":
            s = f"{dd:%a} {dd.day} {dd:%b} {dd.year}"
        elif style == "iso":
            s = dd.isoformat()
        elif style == "month":
            s = f"{dd:%B} {dd.year}"
        elif style == "day":
            s = f"{dd.day} {dd:%b} {dd.year}"
        else:
            raise ValueError(f"unknown date style {style!r}")
        return self.register(s)

    def fmt(self, value: Any, spec: str = "") -> str:
        """Format by template spec (see the module docstring)."""
        m = _SPEC.match(spec or "")
        if not m:
            raise ValueError(f"unknown format spec {spec!r}")
        mod, kind, dec = m.group("mod"), m.group("kind"), m.group("dec")
        places = int(dec) if dec is not None else None
        if kind is None:
            if isinstance(value, str):
                return self.register(value)
            kind = "date" if isinstance(value, date) else "num"
        if kind == "str":
            return self.register(str(value))
        if kind in _DATE_STYLES:
            return self.fmt_date(value, _DATE_STYLES[kind])
        v = float(value)
        if mod == "n":
            v = -abs(v)
        elif mod == "a":
            v = abs(v)
        signed = mod == "s"
        if kind == "money":
            return self.fmt_money(v, cents=bool(places), signed=signed)
        if kind in ("pct", "ppct"):
            return self.fmt_pct(v, decimals=1 if places is None else places, signed=signed, points=kind == "ppct")
        if kind == "int":
            return self.fmt_num(round(v), decimals=0, signed=signed)
        if kind == "year":
            return self.fmt_num(v, decimals=0, grouping=False)
        return self.fmt_num(v, decimals=places, signed=signed, strip=False if places is not None else None)


# ------------------------------------------------------------------------------------------ fact templates

def _is_num(v: Any) -> bool:
    if isinstance(v, bool) or not isinstance(v, numbers.Real):
        return False
    return not math.isnan(float(v))


def _is_missing(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip()
    if isinstance(v, numbers.Real) and not isinstance(v, bool):
        return math.isnan(float(v))
    return False


def lookup(facts: Any, key: str) -> Any:
    """facts[key]; "a.b" walks nested dicts; otherwise nested dicts are searched one level deep."""
    if not isinstance(facts, dict):
        return None
    if "." in key:
        cur: Any = facts
        for part in key.split("."):
            if not isinstance(cur, dict) or part not in cur:
                return None
            cur = cur[part]
        return cur
    if key in facts:
        return facts[key]
    for v in facts.values():
        if isinstance(v, dict) and key in v:
            return v[key]
    return None


class _Missing(Exception):
    pass


class _Filler(string.Formatter):
    """str.format over facts, with every value formatted (and registered) by the NumberRegistry."""

    def __init__(self, reg: NumberRegistry, facts: dict) -> None:
        super().__init__()
        self.reg = reg
        self.facts = facts

    def get_field(self, field_name, args, kwargs):  # the whole name is the key ("base_rates.win_rate")
        return self.get_value(field_name, args, kwargs), field_name

    def get_value(self, key, args, kwargs):
        value = kwargs[key] if key in kwargs else lookup(self.facts, key)
        if _is_missing(value):
            raise _Missing(key)
        return value

    def format_field(self, value, format_spec):
        return self.reg.fmt(value, format_spec)

    def ready(self, template: str, extra: dict) -> bool:
        for _, field, _, _ in self.parse(template):
            if field is None:
                continue
            try:
                self.get_value(field, (), extra)
            except _Missing:
                return False
        return True

    def first(self, alternatives: Iterable[str | None], extra: dict) -> str | None:
        """The first alternative whose facts are all present, filled in; None if none is."""
        for t in alternatives:
            if t is not None and self.ready(t, extra):
                return self.vformat(t, (), extra)
        return None


# ---------------------------------------------------------------------------------------------- templates
# Each entry is a tuple of alternatives: the first one whose facts are all present is used. A trailing None
# means "leave the sentence out" when nothing fits. No digits here: numbers come from facts only.

ONE_SENTENCE: dict[str, dict[str, tuple]] = {
    "M1": {
        "NEW_TRADE": (
            "{ticker} dropped sharply while its long-term trend is still up and fear is high, so buy "
            "{dollars:money} of {ticker} {when} and sell on the first bounce.",
        ),
        "EXIT:exit_rule": (
            "{ticker} bounced above its {exit_sma:int}-day average, so sell all the {ticker} from this trade {when}.",
            "{ticker} bounced, so sell all the {ticker} from this trade {when}.",
        ),
        "EXIT:time_stop": (
            "{ticker} didn't bounce within {max_sessions:int} trading sessions, so the time stop says sell all of "
            "it {when}.",
            "{ticker} didn't bounce in time, so the time stop says sell all of it {when}.",
        ),
    },
    "M2": {
        "REBALANCE": (
            "Monthly trend check: place {orders_phrase} {when} so the trend book holds only the markets that "
            "beat T-bills over the past year.",
        ),
    },
    "M3": {
        "SWITCH_ON": (
            "Bitcoin's weekly close is above its {weeks:int}-week average, so buy {dollars:money} of {ticker} {when} "
            "and hold it while the trend lasts.",
            "Bitcoin's weekly trend turned up, so buy {dollars:money} of {ticker} {when} and hold it while the "
            "trend lasts.",
        ),
        "SWITCH_OFF": (
            "Bitcoin's weekly close fell below its {weeks:int}-week average, so sell all your {ticker} {when}.",
            "Bitcoin's weekly trend turned down, so sell all your {ticker} {when}.",
        ),
    },
    "W10": {
        "NEW_TRADE": (
            "The S&P 500 fell {spx_ret:apct2} today while its trend was up, so buy {dollars:money} of {ticker} {when} "
            "and hold it until {exit_date:date}.",
            "The S&P 500 had a big one-day drop while its trend was up, so buy {dollars:money} of {ticker} {when} "
            "and hold it until {exit_date:date}.",
            "The S&P 500 had a big one-day drop while its trend was up, so buy {dollars:money} of {ticker} {when} "
            "and hold it about three months.",
        ),
        "EXIT:calendar_stop": (
            "The {max_calendar_days:int}-day holding limit is up, so sell all the {ticker} from this trade {when}.",
            "The holding limit is up, so sell all the {ticker} from this trade {when}.",
        ),
    },
}
ONE_SENTENCE["W10"]["EXIT"] = ONE_SENTENCE["W10"]["EXIT:calendar_stop"]     # W10 has one exit rule
# REBALANCE follow-up emails (facts["batch"] >= 2) carry the legs that didn't fit in the earlier email.
FOLLOW_UP_SENTENCE = {
    "final": ("Part {batch:int} of this month's trend check: place {orders_phrase} {when} to finish this month's "
              "rebalance.",),
    "more": ("Part {batch:int} of this month's trend check: place {orders_phrase} {when}; the rest come in "
             "the next trading day's evening email.",),
}
GENERIC_ONE_SENTENCE = {
    "NEW_TRADE": ("Buy {dollars:money} of {ticker} {when}, as the {module_name} rule says.",
                  "Buy {ticker} {when}, as the {module_name} rule says."),
    "EXIT": ("The {module_name} exit rule fired: sell all your {ticker} from this trade {when}.",),
    "REBALANCE": ("Place {orders_phrase} {when}.",),
    "SWITCH_ON": ("Buy {dollars:money} of {ticker} {when}.", "Buy {ticker} {when}."),
    "SWITCH_OFF": ("Sell all your {ticker} {when}.",),
}

WHY: dict[str, dict[str, list[tuple]]] = {
    "M1": {
        "NEW_TRADE": [
            ("{ticker} closed at {close:money2}, above its {sma_trend:int}-day average of {sma200:money2} (the "
             "average close of the last {sma_trend:int} trading days). So the long-term trend is up.",
             "{ticker} closed above its {sma_trend:int}-day average (the average close of the last "
             "{sma_trend:int} trading days). So the long-term trend is up.",
             "{ticker} closed above its long-term average, so the long-term trend is up."),
            ("RSI({rsi_period:int}) is {rsi2:num1}, below {rsi_below:num}. RSI({rsi_period:int}) below "
             "{rsi_below:num} = {ticker} fell sharply over the last {rsi_period:int} days (RSI compares recent up "
             "days with down days).",
             "RSI({rsi_period:int}) is below {rsi_below:num}. That means {ticker} fell sharply over the last "
             "{rsi_period:int} days.",
             "A short-term gauge (RSI) says {ticker} fell sharply over the last few days."),
            ("The VIX (Wall Street's fear gauge, read from option prices) closed at {vix:num2}, at or above "
             "{vix_min:num}. Investors are nervous, and in testing, dips bought while fear was high bounced best.",
             "The VIX (Wall Street's fear gauge) is at or above {vix_min:num}. In testing, dips bought while fear "
             "was high bounced best.",
             "The VIX (Wall Street's fear gauge) is high. In testing, dips bought while fear was high bounced best."),
            ("The bet: a short, sharp drop inside an uptrend usually bounces within days. You buy the dip and sell "
             "on the first close above the {exit_sma:int}-day average.",
             "The bet: a short, sharp drop inside an uptrend usually bounces within days. You buy the dip and sell "
             "on the first bounce."),
        ],
        "EXIT:exit_rule": [
            ("{ticker} closed at {close:money2}, above its {exit_sma:int}-day average of {sma5:money2}. That's the "
             "bounce this trade was waiting for, so the rule says sell at the next open.",
             "{ticker} closed above its {exit_sma:int}-day average. That's the bounce this trade was waiting for, "
             "so the rule says sell at the next open.",
             "{ticker} bounced. That's what this trade was waiting for, so the rule says sell at the next open."),
            ("Profit or loss doesn't change anything: the exit was decided when you bought.",),
        ],
        "EXIT:time_stop": [
            ("This trade has been held {sessions_held:int} trading sessions, and {ticker} never closed above its "
             "{exit_sma:int}-day average. The time stop says: sell at the next open and move on.",
             "{ticker} didn't bounce within {max_sessions:int} trading sessions. The time stop says: sell at the "
             "next open and move on.",
             "{ticker} didn't bounce in time. The time stop says: sell at the next open and move on."),
            ("Profit or loss doesn't change anything: the exit was decided when you bought.",),
        ],
    },
    "M2": {
        "REBALANCE": [
            ("Once a month the trend book checks {n_legs:int} ETFs: US stocks, Treasury bonds, gold, oil and "
             "currencies. It holds each one only while its return over the last {lookback_sessions:int} trading "
             "days (about a year) beats T-bills (short-term US government debt, paying about {rf_annual:pct1} a "
             "year).",
             "Once a month the trend book checks its ETFs: US stocks, Treasury bonds, gold, oil and currencies. It "
             "holds each one only while its past-year return beats T-bills (short-term US government debt)."),
            ("Calmer ETFs get more dollars and jumpier ones fewer, so each adds similar risk. The whole book is "
             "capped at {gross_cap_pct_nav:pct0} of the portfolio, and any one ETF at "
             "{single_leg_cap_pct_nav:pct0}.",
             "Calmer ETFs get more dollars and jumpier ones fewer, so each adds similar risk."),
            ("To keep this to a few taps, changes smaller than {band_rel:pct0} of a target or {band_abs_usd:money} "
             "are skipped. Selling a holding to zero always goes through.", None),
        ],
    },
    "M3": {
        "SWITCH_ON": [
            ("Bitcoin's weekly close (week ending {week_end:date}) was {weekly_close:money}, above its "
             "{weeks:int}-week average of {sma:money}.",
             "Bitcoin's weekly close is above its {weeks:int}-week average.",
             "Bitcoin's weekly close is above its long-run weekly average."),
            ("The switch is ON: hold a small Bitcoin position {holding}.",),
            ("This is a risk switch, not a prediction. It keeps you in Bitcoin while it trends up and gets you out "
             "when the trend breaks. Most of the result is simply Bitcoin's own ups and downs.",),
        ],
        "SWITCH_OFF": [
            ("Bitcoin's weekly close (week ending {week_end:date}) was {weekly_close:money}, below its "
             "{weeks:int}-week average of {sma:money}.",
             "Bitcoin's weekly close fell below its {weeks:int}-week average.",
             "Bitcoin's weekly close fell below its long-run weekly average."),
            ("The switch is OFF: sell the position and wait. You'll get an email when the weekly close is back "
             "above the average.",),
        ],
    },
    "W10": {
        "NEW_TRADE": [
            ("The S&P 500 fell {spx_ret:apct2} today, closing at {spx_close:num2} (the day before: "
             "{spx_prev_close:num2}).",
             "The S&P 500 fell {spx_ret:apct2} today.",
             "The S&P 500 had a big one-day drop today."),
            ("It's the first drop of {drop_pct:apct0} or more in {decluster_sessions:int} trading sessions: a fresh "
             "shock, not one more down day in a slide.",
             "It's the first drop this big in {decluster_sessions:int} trading sessions: a fresh shock, not one more "
             "down day in a slide.",
             "It's the first drop this big in weeks: a fresh shock, not one more down day in a slide."),
            ("The day before, the S&P closed above its {sma_trend:int}-day average of {sma200_prev:num2}, so the "
             "trend was up.",
             "The day before, the S&P closed above its long-term average of {sma200_prev:num2}, so the trend was up.",
             "The day before, the S&P closed above its long-term average, so the trend was up."),
            ("The bet, in plain words: buy the shock, hold about three months, and sell on a fixed date.",),
            ("Since {since:year}, these trades averaged {mean_pct:sppct1}, against {placebo_mean_pct:sppct1} for "
             "random entry days held just as long.",
             "In testing, these trades averaged {mean_pct:sppct1}, against {placebo_mean_pct:sppct1} for random "
             "entry days held just as long.", None),
            ("The edge shows only after {edge_since:year}, not in older data, so this is a small, cheap bet.",
             "The edge shows only in recent decades, not in older data, so this is a small, cheap bet."),
        ],
        "EXIT:calendar_stop": [
            ("You bought on {entry_date:date} and have held it {days_held:int} calendar days ({sessions_held:int} "
             "trading sessions). The next open is the last trading session within the {max_calendar_days:int}-day "
             "limit, so the rule says sell.",
             "The next open is the last trading session within the {max_calendar_days:int}-day limit, so the rule "
             "says sell.",
             "The holding limit is up: the next open is the last trading session inside it, so the rule says sell."),
            ("The exit was decided when you bought: profit or loss doesn't change it.",),
        ],
    },
}
WHY["W10"]["EXIT"] = WHY["W10"]["EXIT:calendar_stop"]
GENERIC_WHY = {
    "NEW_TRADE": [("The {module_name} rule's entry conditions all passed on the close of {created:date}.",)],
    "EXIT": [("The {module_name} rule's exit condition fired, so the plan says sell at the next open.",)],
    "REBALANCE": [("This is the {module_name} monthly re-decision.",)],
    "SWITCH_ON": [("The {module_name} turned on.",)],
    "SWITCH_OFF": [("The {module_name} turned off.",)],
}
RESULT_SO_FAR = ("Result so far: {pnl_usd:smoney} ({pnl_pct:sppct2}), before this sale.", None)

EXIT_PLAN: dict[str, dict[str, list[tuple]]] = {
    "M1": {
        "NEW_TRADE": [
            ("Sell at the next open after {ticker} first closes above its {exit_sma:int}-day average (the average "
             "of the last {exit_sma:int} closes). You'll get an EXIT email that evening.",
             "Sell at the next open after {ticker}'s first close above its short-term average. You'll get an EXIT "
             "email that evening."),
            ("Time stop: if that hasn't happened after {max_sessions:int} trading sessions, sell at the open of the "
             "next session ({time_stop_date:date}).",
             "Time stop: if that hasn't happened after {max_sessions:int} trading sessions, sell at the next open.",
             "Time stop: if it hasn't bounced within about a month, sell anyway."),
            ("No stop-loss and no bracket order: the rule was tested without one, and stops tend to sell right at "
             "the bottom of these dips.",),
        ],
    },
    "M2": {
        "REBALANCE": [
            ("There's no separate exit: every ETF is re-decided at the next monthly check (the first trading day "
             "of the month).",),
            ("An ETF is sold to zero when its past-year return falls below T-bills'. You'll get those orders by "
             "email.",),
        ],
    },
    "M3": {
        "SWITCH_ON": [
            ("Sell when Bitcoin's weekly close falls below its {weeks:int}-week average. The system checks every "
             "Sunday night and emails you.",
             "Sell when Bitcoin's weekly close falls below its weekly average. The system checks every Sunday night "
             "and emails you."),
            ("No stop-loss: the weekly switch is the exit.",),
        ],
    },
    "W10": {
        "NEW_TRADE": [
            ("Sell all at the open on {exit_date:date}: the last trading day within {max_calendar_days:int} calendar "
             "days of the purchase. You'll get an EXIT email the evening before.",
             "Sell all at the open on {exit_date:date}, a date fixed now. You'll get an EXIT email the evening before.",
             "Sell all at the open of the last trading day within {max_calendar_days:int} calendar days of the "
             "purchase. You'll get an EXIT email the evening before.",
             "Sell all on a fixed date about three months after the purchase. You'll get an EXIT email the evening "
             "before."),
            ("No stop-loss, no profit target and no early exit. The rule was tested this way, and the sell date is "
             "fixed now.",),
        ],
    },
}

RISKS: dict[str, list[tuple]] = {
    "M1": [
        ("No stop-loss: the rule was tested without one. If this dip turns into a crash, the loss can be large. In "
         "testing the worst trade returned {worst_pct:ppct1}.",
         "No stop-loss: the rule was tested without one. If this dip turns into a crash, the loss can be large."),
    ],
    "M2": [
        ("Trend rules lose money in choppy markets and can lag for a year or more. They tend to help in long "
         "crises, when dip-buying hurts.",),
    ],
    "M3": [
        ("Bitcoin can fall hard within days, before the weekly switch reacts. That's why the position is small "
         "({sleeve_pct_nav:pct0} of the portfolio).",
         "Bitcoin can fall hard within days, before the weekly switch reacts. That's why the position is kept "
         "small."),
    ],
    "W10": [
        ("A crash can deepen after the first shock. In {worst_interim_when} this trade was down "
         "{worst_interim_pct:appct0} at its worst before it recovered.",
         "A crash can deepen after the first shock. Since {since:year}, the worst trade was down "
         "{worst_interim_pct:appct0} at one point before it recovered.",
         "A crash can deepen after the first shock, and this trade has no stop-loss."),
        ("No stop-loss and no early exit: you hold through the swings until the sell date. The worst finished trade "
         "since {since:year} returned {worst_pct:ppct1}.",
         "No stop-loss and no early exit: you hold through the swings until the sell date."),
    ],
}
# Shown after the stress line when facts carry a horizon-matched planning loss (W10: the worst full hold).
HORIZON_RISK = ("Planning loss over the full hold: about {horizon_stress_usd:money} ({horizon_stress_frac:pct2} of "
                "the portfolio), a bad-case drop over the whole holding period.", None)


# Phase B module text (M4, W8, W9) lives in traderec/email_text/<module>.py and is merged into the tables above.
from .email_text import merge_module_text as _merge_module_text  # noqa: E402

_merge_module_text(globals())


# ------------------------------------------------------------------------------------------- serialisation
# An email is a list of blocks: ("banner", str), ("box", [(label, value)]), ("h", str), ("p", str),
# ("ol", [str]), ("ul", [str]), ("table", (headers, rows)), ("footer", [str]). Both parts are built from the
# same blocks, so the text and HTML parts carry the same content.

def _wrap(s: str, width: int = TEXT_WIDTH, first: str = "", rest: str = "") -> str:
    return textwrap.fill(s, width=width, initial_indent=first, subsequent_indent=rest,
                         break_long_words=False, break_on_hyphens=False)


def _box_text(rows: list[tuple[str, str]]) -> str:
    label_w = max(len(label) for label, _ in rows) + 2
    inner = BOX_WIDTH - 4
    lines = ["┌" + "─" * (BOX_WIDTH - 2) + "┐"]
    for label, value in rows:
        parts = textwrap.wrap(value, inner - label_w, break_long_words=False, break_on_hyphens=False) or [""]
        for i, part in enumerate(parts):
            content = f"{label if i == 0 else '':<{label_w}}{part}"
            lines.append(f"│ {content:<{inner}} │")
    lines.append("└" + "─" * (BOX_WIDTH - 2) + "┘")
    return "\n".join(lines)


def _table_text(headers: list[str], rows: list[list[str]]) -> str:
    widths = [max(len(str(r[i])) for r in [headers, *rows]) for i in range(len(headers))]

    def line(r: list[str]) -> str:
        return ("  " + "  ".join(str(c).ljust(w) for c, w in zip(r, widths))).rstrip()

    return "\n".join([line(headers), "  " + "  ".join("-" * w for w in widths), *(line(r) for r in rows)])


def _to_text(blocks: list[tuple[str, Any]]) -> str:
    out: list[str] = []
    heading: str | None = None
    for kind, payload in blocks:
        if kind == "h":
            heading = payload.upper()
            continue
        if kind == "banner":
            s = payload                      # one exact line: the mode label opens the body
        elif kind == "p":
            s = _wrap(payload)
        elif kind == "box":
            s = _box_text(payload)
        elif kind == "ol":
            s = "\n".join(_wrap(item, first=f"  {i}. ", rest="     ") for i, item in enumerate(payload, 1))
        elif kind == "ul":
            s = "\n".join(_wrap(item, first="  - ", rest="    ") for item in payload)
        elif kind == "table":
            s = _table_text(*payload)
        elif kind == "footer":
            s = "--\n" + "\n".join(_wrap(line) for line in payload)
        else:
            raise ValueError(f"unknown block {kind!r}")
        out.append(f"{heading}\n{s}" if heading else s)
        heading = None
    return "\n\n".join(out) + "\n"


_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
_MONO = "Menlo,Consolas,'Courier New',monospace"
_CSS = {
    "wrap": f"max-width:640px;margin:0 auto;padding:16px;font-family:{_FONT};font-size:16px;line-height:1.5;"
            "color:#111111;background:#ffffff;",
    "banner": "background:#fff4d6;border:1px solid #e0b64a;border-radius:6px;padding:10px 12px;font-weight:bold;"
              "margin:0 0 14px;",
    "banner_live": "background:#fde2e1;border:1px solid #d9534f;border-radius:6px;padding:10px 12px;"
                   "font-weight:bold;margin:0 0 14px;",
    "box": f"width:100%;border-collapse:collapse;border:2px solid #111111;font-family:{_MONO};font-size:14px;"
           "margin:0 0 8px;",
    "box_label": "padding:6px 8px;font-weight:bold;vertical-align:top;white-space:nowrap;"
                 "border-bottom:1px solid #dddddd;",
    "box_value": "padding:6px 8px;vertical-align:top;border-bottom:1px solid #dddddd;",
    "h": "font-size:17px;line-height:1.3;margin:22px 0 6px;",
    "p": "margin:0 0 10px;",
    "list": "margin:0 0 10px;padding-left:24px;",
    "li": "margin:0 0 6px;",
    "table": "border-collapse:collapse;width:100%;font-size:14px;margin:0 0 10px;",
    "th": "text-align:left;padding:6px;border-bottom:2px solid #111111;",
    "td": "text-align:left;padding:6px;border-bottom:1px solid #dddddd;vertical-align:top;",
    "footer": "font-size:12px;line-height:1.5;color:#555555;margin:24px 0 0;padding-top:10px;"
              "border-top:1px solid #dddddd;",
    "hidden": "display:none;max-height:0;overflow:hidden;opacity:0;",
}
_URL_RE = re.compile(r"https?://[^\s<>\"']+[^\s<>\"'.,;:!?)]")


def _h(s: str) -> str:
    """Escape, then turn URLs into links."""
    return _URL_RE.sub(lambda m: f'<a href="{m.group(0)}" style="color:#0b57d0;">{m.group(0)}</a>',
                       _html.escape(s, quote=True))


def _to_html(blocks: list[tuple[str, Any]], subject: str, preheader: str, live: bool) -> str:
    body: list[str] = []
    for kind, payload in blocks:
        if kind == "banner":
            body.append(f'<div style="{_CSS["banner_live" if live else "banner"]}">{_h(payload)}</div>')
        elif kind == "box":
            rows = "".join(f'<tr><td style="{_CSS["box_label"]}">{_h(k)}</td>'
                           f'<td style="{_CSS["box_value"]}">{_h(v)}</td></tr>' for k, v in payload)
            body.append(f'<table role="presentation" style="{_CSS["box"]}">{rows}</table>')
        elif kind == "h":
            body.append(f'<h2 style="{_CSS["h"]}">{_h(payload)}</h2>')
        elif kind == "p":
            body.append(f'<p style="{_CSS["p"]}">{_h(payload)}</p>')
        elif kind in ("ol", "ul"):
            items = "".join(f'<li style="{_CSS["li"]}">{_h(i)}</li>' for i in payload)
            body.append(f'<{kind} style="{_CSS["list"]}">{items}</{kind}>')
        elif kind == "table":
            headers, rows = payload
            head = "".join(f'<th style="{_CSS["th"]}">{_h(c)}</th>' for c in headers)
            trs = "".join("<tr>" + "".join(f'<td style="{_CSS["td"]}">{_h(str(c))}</td>' for c in r) + "</tr>"
                          for r in rows)
            body.append(f'<table style="{_CSS["table"]}"><tr>{head}</tr>{trs}</table>')
        elif kind == "footer":
            body.append(f'<div style="{_CSS["footer"]}">' + "<br>".join(_h(line) for line in payload) + "</div>")
        else:
            raise ValueError(f"unknown block {kind!r}")
    return ("<!doctype html>\n<html><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<title>{_html.escape(subject)}</title></head>\n"
            "<body style=\"margin:0;padding:0;background:#ffffff;\">\n"
            f"<div style=\"{_CSS['hidden']}\">{_html.escape(preheader)}</div>\n"
            f"<div style=\"{_CSS['wrap']}\">\n" + "\n".join(body) + "\n</div>\n</body></html>\n")


def _rows_table(rows: list[dict], nav: Any, reg: NumberRegistry) -> tuple[list[str], list[list[str]]] | None:
    """The portfolio table from [{"name", "value", "pct"}]."""
    if not rows:
        return None
    pcts = [r.get("pct") for r in rows if isinstance(r, dict) and _is_num(r.get("pct"))]
    as_points = sum(abs(float(p)) for p in pcts) > 1.5
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        value, pct = r.get("value"), r.get("pct")
        if not _is_num(pct) and _is_num(value) and _is_num(nav) and nav:
            pct, points = float(value) / float(nav), False
        else:
            points = as_points
        out.append([reg.register(str(r.get("name", ""))),
                    reg.fmt_money(value) if _is_num(value) else "—",
                    reg.fmt_pct(pct, decimals=1, points=points) if _is_num(pct) else "—"])
    return (["Holding", "Value", "% of portfolio"], out) if out else None


# ------------------------------------------------------------------------------------------ trade emails

def _next_weekday(d: date) -> date:
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _items(x: Any) -> list[str]:
    """Tickers from a list of strings / order dicts, or a dict keyed by ticker."""
    if isinstance(x, dict):
        return [str(k) for k in x]
    if isinstance(x, (list, tuple)):
        return [str(i.get("ticker", "")) if isinstance(i, dict) else str(i) for i in x if i]
    return []


class _TradeEmail:
    def __init__(self, rec: Recommendation, ctx: dict) -> None:
        self.rec = rec
        self.ctx = ctx or {}
        self.facts: dict = dict(rec.facts or {})
        self.reg = NumberRegistry()
        self.filler = _Filler(self.reg, self.facts)
        self.kind = (rec.kind or "").upper()
        self.module = rec.module or ""
        self.live = str(self.ctx.get("mode", "paper")).lower() == "live"
        self.MODE = "LIVE" if self.live else "PAPER"
        self.orders: list[OrderIntent] = list(rec.orders or [])
        first = self.orders[0] if self.orders else None
        f = self.facts
        self.account = str(f.get("account") or (first.account if first else "ira")).lower()
        self.coinbase = self.account == "coinbase"
        self.venue = "Coinbase" if self.coinbase else "Robinhood"
        # data-layer labels are inserted verbatim, so they are registered (only strings with digits are recorded)
        reg = self.reg.register
        self.ticker = reg(f.get("ticker") or (first.ticker if first else DEFAULT_TICKERS.get(self.module, "")))
        self.ticker_name = reg(f.get("ticker_name") or TICKER_NAMES.get(self.ticker, "fund"))
        self.module_name = reg(f.get("module_name") or MODULE_NAMES.get(self.module, self.module))
        reg(self.module)
        self.nav = float(self.ctx["nav"]) if _is_num(self.ctx.get("nav")) and self.ctx["nav"] else None
        self.is_buy = self.kind in BUY_KINDS
        self.is_sell = self.kind in SELL_KINDS
        self.reason = str(f.get("reason") or (first.reason if first else "") or "")
        batch = f.get("batch")
        self.batch = int(batch) if self.kind == "REBALANCE" and _is_num(batch) and batch >= 2 else None
        self.issue_url = self.ctx.get("issue_url") or None
        self.buys = [o for o in self.orders if o.side == "buy"]
        # sells first: they free up cash for the buys
        self.table_orders = sorted(self.orders, key=lambda o: 0 if o.side == "sell" else 1)

        dollars = f.get("dollars")
        if not _is_num(dollars):
            buy_dollars = [o.dollars for o in self.buys if _is_num(o.dollars)]
            dollars = sum(buy_dollars) if buy_dollars else None
        self.dollars = float(dollars) if _is_num(dollars) else None

        try:
            ed = f.get("execute_date") or f.get("next_session") or self.ctx.get("next_session")
            self.execute_date: date | None = _to_date(ed) if ed else _next_weekday(_to_date(rec.created_date))
        except (TypeError, ValueError):
            self.execute_date = None

        stress_usd, stress_frac = self._loss(f.get("stress_usd"), f.get("stress_pct"))
        horizon_usd, horizon_frac = self._loss(f.get("horizon_stress_usd"), f.get("horizon_stress_pct"))

        if self.coinbase:
            when = "as soon as you can (Coinbase trades 24/7)"
        elif self.execute_date:
            when = f"at the open on {self.reg.fmt_date(self.execute_date)}"
        else:
            when = "at the next open"
        n = len(self.orders)
        orders_phrase = ("this order" if n == 1 else "no orders" if n == 0 else
                         f"these {self.reg.fmt_num(n)} orders")
        holding = ("on Coinbase" if self.coinbase
                   else f"through {self.ticker}, a Bitcoin ETF (a fund that trades like a stock)")
        derived = {
            "ticker": self.ticker, "ticker_name": self.ticker_name, "module": self.module,
            "module_name": self.module_name, "dollars": self.dollars, "nav": self.nav,
            "size_frac": (self.dollars / self.nav) if (self.dollars is not None and self.nav) else None,
            "stress_usd": stress_usd, "stress_frac": stress_frac, "execute_date": self.execute_date,
            "horizon_stress_usd": horizon_usd, "horizon_stress_frac": horizon_frac,
            "when": when, "orders_phrase": orders_phrase, "n_orders": n, "holding": holding, "batch": self.batch,
            "created": rec.created_date or None,
            "account_label": ACCOUNT_LABELS.get(self.account, self.account),
        }
        signals = f.get("signals")
        if isinstance(signals, dict) and signals:
            derived["n_legs"] = len(signals)
        elif isinstance(f.get("legs"), dict):
            derived["n_legs"] = len(f["legs"])
        self.derived = {k: v for k, v in derived.items() if not _is_missing(v)}

    # -------------------------------------------------------------- helpers
    def _loss(self, usd: Any, pct: Any) -> tuple[float | None, float | None]:
        """A planning loss as (USD magnitude, fraction of NAV). `pct` is in percent units (the `_pct` convention);
        a fraction passed instead is detected when it matches usd / nav. A missing pct is computed as usd / nav."""
        usd_v = abs(float(usd)) if _is_num(usd) else None
        if _is_num(pct):
            p = abs(float(pct))
            frac = p / 100.0
            if usd_v is not None and self.nav:
                implied = usd_v / self.nav
                if abs(frac - implied) > 5e-4 and abs(p - implied) <= 5e-4:
                    frac = p
            return usd_v, frac
        return usd_v, (usd_v / self.nav if usd_v is not None and self.nav else None)

    def t(self, *alternatives: str | None, **extra: Any) -> str | None:
        return self.filler.first(alternatives, {**self.derived, **extra})

    def lines(self, templates: list[tuple]) -> list[str]:
        return [s for alts in templates for s in [self.t(*alts)] if s]

    def templates(self, table: dict) -> list[tuple] | None:
        """This module's entry for "KIND:reason" (e.g. "EXIT:time_stop"), else for KIND."""
        per_module = table.get(self.module, {})
        for key in (f"{self.kind}:{self.reason}", self.kind):
            if key in per_module:
                return per_module[key]
        return None

    def _sell_amount(self, qty: Any, keep: Any) -> str | None:
        """'Sell N shares' text when another module holds the same ticker; None means 'Sell all'."""
        if _is_num(qty) and _is_num(keep) and float(keep) > 0:
            return f"{self.reg.fmt_num(qty, decimals=6, strip=True)} shares"
        return None

    # -------------------------------------------------------------- pieces
    def subject(self) -> str:
        tag = KIND_TAGS.get(self.kind, self.kind or "TRADE")
        tid = self.reg.register(self.rec.trade_id or "")
        prefix = f"[{self.MODE}][{tag} {tid}]" if tid else f"[{self.MODE}][{tag}]"
        money = f"{self.reg.fmt_money(self.dollars)} " if self.dollars is not None else ""
        window = (" — Coinbase, 24/7" if self.coinbase else
                  f" — before 9:30 ET {self.reg.fmt_date(self.execute_date)}" if self.execute_date else "")
        name = f"{self.module_name} ({self.module})"
        sell_what = self._sell_amount(self.facts.get("qty"), self.facts.get("keep_qty")) or "all"
        if self.kind == "NEW_TRADE":
            return f"{prefix} BUY {money}{self.ticker} — {name}{window}"
        if self.kind == "EXIT":
            return f"{prefix} SELL {sell_what} {self.ticker} — {name}"
        if self.kind == "REBALANCE":
            n = len(self.orders)
            count = "no orders" if n == 0 else f"{self.reg.fmt_num(n)} order{'s' if n != 1 else ''}"
            title = f"{self.module_name}, part {self.reg.fmt_num(self.batch)}" if self.batch else self.module_name
            return f"{prefix} {title}: {count}{window if n else ''}"
        if self.kind == "SWITCH_ON":
            return f"{prefix} Bitcoin switch ON: BUY {money}{self.ticker}"
        if self.kind == "SWITCH_OFF":
            return f"{prefix} Bitcoin switch OFF: SELL {sell_what} {self.ticker}"
        return f"{prefix} {name}"

    def headline(self) -> list[tuple[str, str]]:
        acct = ACCOUNT_LABELS.get(self.account, self.account)
        where = f"in your {acct}"
        if self.is_buy:
            money = f"{self.reg.fmt_money(self.dollars)} of " if self.dollars is not None else ""
            action = f"BUY {money}{self.ticker} ({self.ticker_name}) {where}"
            action += "" if self.coinbase else ", as a market order in dollars"
            size = self.t("{dollars:money} = {size_frac:pct1} of your {nav:money} portfolio",
                          "{dollars:money}") or "See the order below"
            stress = self.t("Planning loss {stress_usd:nmoney} ({stress_frac:npct2} of portfolio) if {ticker} "
                            "repeats its worst crash on record",
                            "Planning loss {stress_usd:nmoney} if {ticker} repeats its worst crash on record")
            horizon = self.t("{horizon_stress_usd:nmoney} ({horizon_stress_frac:npct2}) over the full hold",
                             "{horizon_stress_usd:nmoney} over the full hold")
            if stress and horizon:
                stress += "; " + horizon
            elif horizon:
                stress = "Planning loss " + horizon
            stress = stress or "Not computed for this trade"
        elif self.is_sell:
            what = self._sell_amount(self.facts.get("qty"), self.facts.get("keep_qty")) or "all"
            action = f"SELL {what} {self.ticker} ({self.ticker_name}) {where}"
            size = self.t("All of it: about {position_value:money} ({pos_frac:pct1} of portfolio) at the last close",
                          "All of it: about {position_value:money} at the last close",
                          pos_frac=(float(self.facts["position_value"]) / self.nav
                                    if _is_num(self.facts.get("position_value")) and self.nav else None),
                          ) or f"All the {self.ticker} this trade bought"
            stress = "None once sold: this closes the position"
        else:
            n = len(self.orders)
            desc = ", ".join(f"{o.side} {o.ticker}" for o in self.table_orders)
            part = f" (part {self.reg.fmt_num(self.batch)} of this month's rebalance)" if self.batch else ""
            action = (f"{self.reg.fmt_num(n)} order{'s' if n != 1 else ''} {where}{part}: {desc}" if n
                      else "No orders this month")
            buy_total = sum(float(o.dollars) for o in self.buys if _is_num(o.dollars))
            sells = [o for o in self.orders if o.side == "sell"]
            sell_total = sum(float(o.dollars) for o in sells if _is_num(o.dollars) and not o.close_all)
            parts = []
            if self.buys:
                parts.append(f"buys {self.reg.fmt_money(buy_total)}")
            if sell_total:
                parts.append(f"sells {self.reg.fmt_money(sell_total)}")
            closes = [o.ticker for o in sells if o.close_all]
            if closes:
                parts.append("sell all " + ", ".join(closes))
            joined = "; ".join(parts)
            size = (joined[:1].upper() + joined[1:] + " (see the table below)") if parts else "Nothing to trade"
            stress = self.t("Planning loss {stress_usd:nmoney} ({stress_frac:npct2} of portfolio) for the whole "
                            "trend book, its worst month on record",
                            ) or "Counted once for the whole trend book"
        if self.coinbase:
            window = "Any time after this email; Coinbase trades 24/7"
        elif self.kind == "REBALANCE" and not self.orders:
            window = "Nothing to place this month"
        else:
            window = self.t("Place {it} any time before 9:30 ET {execute_date:date}; {it_fills} at the open",
                            it="them" if len(self.orders) > 1 else "it",
                            it_fills="they fill" if len(self.orders) > 1 else "it fills",
                            ) or "Place it before the next 9:30 ET open"
        rows = [("ACTION", action), ("SIZE", size), ("STRESS", stress), ("WINDOW", window),
                ("ODDS", self.odds_line())]
        if self.is_sell:
            result = self.t("{pnl_usd:smoney} ({pnl_pct:sppct2}) so far, before this sale")
            if result:
                rows.append(("RESULT", result))
        confidence = self.reg.register(self.facts.get("confidence") or
                                       MODULE_CONFIDENCE.get(self.module, "Rule-based"))
        status = self.reg.register(self.facts.get("status") or MODULE_STATUS.get(self.module, "module"))
        stage = self.reg.register(self.facts.get("stage") or ("live" if self.live else "paper phase"))
        rows += [("CONFIDENCE", confidence), ("STATUS", f"{self.MODE} · {self.module} {status} · {stage}")]
        return rows

    def odds_line(self) -> str:
        if self.is_sell:
            return "Not needed: the rule decides the exit, not a forecast"
        base = self.t("{win_rate:pct0} of past trades made money; average {mean_pct:sppct2}, worst {worst_pct:ppct1}",
                      "{win_rate:pct0} of past trades made money")
        if base:
            return base
        fc = self._forecasts()
        if fc:
            p, question = fc[0].get("p"), fc[0].get("question")
            line = self.t("Forecast: {p:pct0} — {question}", "Forecast: {p:pct0}", p=p, question=question)
            if line:
                return line
        return "No base rate on file yet; the paper phase is measuring it"

    def one_sentence(self) -> str:
        alts = ONE_SENTENCE.get(self.module, {})
        chosen = alts.get(f"{self.kind}:{self.reason}") or alts.get(self.kind) or ()
        if self.batch:
            chosen = FOLLOW_UP_SENTENCE["more" if _items(self.facts.get("deferred")) else "final"]
        return (self.t(*chosen) or self.t(*GENERIC_ONE_SENTENCE.get(self.kind, ())) or
                f"{self.module_name}: see the order below.")

    def steps(self) -> list[str]:
        record = "Record the fill (link below)" if self.issue_url else "Note the fill: dollars and price"
        if self.coinbase:
            if self.is_sell:
                return ["Open the Coinbase app", "Tap Buy & sell → Sell", "Choose Bitcoin (BTC)",
                        "Tap Max (it sells all of it)", "Preview → Sell now. Coinbase fills it right away",
                        record]
            amount = self.t("Amount: {dollars:money}, entered in dollars") or "Amount: the dollars in this email"
            return ["Open the Coinbase app", "Tap Buy & sell → Buy", "Choose Bitcoin (BTC)", amount,
                    "Preview → Buy now. Coinbase fills it right away", record]
        switch = ACCOUNT_SWITCH.get(self.account, f"Open Robinhood and switch to your {self.account} account")
        if self.kind == "REBALANCE":
            if not self.orders:
                return ["Nothing to place this month: every holding is within its no-trade band"]
            return [switch,
                    "Go down the table from the top (sells first). For each row: search the ticker, then tap "
                    "Trade → Buy or Sell",
                    "Order type: Market · Buy in / Sell in: Dollars",
                    "Amount: the dollars in the table. Where it says Sell all, tap Sell all; where it gives shares, "
                    "sell in Shares",
                    QUEUE_STEP,
                    "Repeat for the next row",
                    "Record the fills (link below)" if self.issue_url else "Note the fills: dollars and prices"]
        if self.is_sell:
            shares = self._sell_amount(self.facts.get("qty"), self.facts.get("keep_qty"))
            if shares:
                keep = self.reg.fmt_num(self.facts["keep_qty"], decimals=6, strip=True)
                middle = ["Order type: Market · Sell in: Shares",
                          f"Shares: {shares.split()[0]} (this trade only; keep your other {keep} shares, they belong "
                          f"to another module)"]
            else:
                middle = ["Order type: Market", f"Tap Sell all (it sells your whole {self.ticker} position)"]
            return [switch, f"Search {self.ticker}", "Tap Trade → Sell", *middle, QUEUE_STEP, record]
        amount = self.t("Amount: {dollars:money}") or "Amount: the dollars in this email"
        return [switch, f"Search {self.ticker}", "Tap Trade → Buy", "Order type: Market · Buy in: Dollars",
                amount, QUEUE_STEP, record]

    def _price(self, ticker: str, order: OrderIntent | None = None) -> float | None:
        meta = (order.meta or {}) if order is not None else {}
        if _is_num(meta.get("ref_price")):
            return float(meta["ref_price"])
        for key in ("prices", "closes"):
            table = self.facts.get(key)
            if isinstance(table, dict) and _is_num(table.get(ticker)):
                return float(table[ticker])
        if ticker == self.ticker and _is_num(self.facts.get("close")):
            return float(self.facts["close"])
        return None

    def what_if(self) -> list[str]:
        if self.coinbase:
            verb = "sell" if self.is_sell else "buy"
            return [f"The price moves a lot before you {verb}: {verb} anyway. The switch doesn't depend on the price.",
                    "There's no open to miss: Coinbase trades 24/7. Place it as soon as you can after this email.",
                    "The app asks about a recurring buy: choose One time."]
        if self.is_sell:
            return ["The price jumps or drops at the open: sell anyway. The exit rule doesn't depend on the price.",
                    "You missed the open: sell during the trading day as a market order, and record the price you "
                    "got.",
                    "Sell all isn't offered: sell in Shares and enter every share you hold for this trade."]
        items = ["The price jumps or drops at the open: the rule still applies. Don't chase it and don't skip it "
                 "unless an email tells you to.",
                 "You missed the open: place it anyway as a market order during the trading day, and record the "
                 "price you got."]
        if self.kind == "REBALANCE":
            items.append("Robinhood says you don't have enough buying power: place the sells now; after they fill at "
                         "9:30 ET, place the buys and record their prices.")
            estimates = []
            for o in self.buys:
                price = self._price(o.ticker, o)
                if price and _is_num(o.dollars):
                    estimates.append(f"{o.ticker} {self.reg.fmt_num(round(float(o.dollars) / price))}")
            tail = (" At the last closes that's about: " + ", ".join(estimates) + " shares.") if estimates else ""
            items.append("Robinhood won't take a dollar order: buy whole shares worth about the amount instead "
                         "(amount ÷ share price, rounded)." + tail)
            return items
        price = self._price(self.ticker)
        if price and self.dollars is not None:
            n = round(self.dollars / price)
            if n >= 1:
                items.append(self.t("Robinhood won't take a dollar order: buy whole shares instead, about {n:int} "
                                    "shares of {ticker} at the last close of {px:money2}.", n=n, px=price))
            else:
                items.append(f"Robinhood won't take a dollar order: the amount is less than one share of "
                             f"{self.ticker}, so skip it and record skipped.")
        else:
            items.append("Robinhood won't take a dollar order: buy whole shares worth about the amount instead "
                         "(amount ÷ share price, rounded).")
        return items

    def exit_plan(self) -> list[str]:
        if self.is_sell:
            out = ["This email is the exit. Once you've sold, this trade is closed; nothing else to do."]
            if self.module == "M3":
                out.append("If the switch turns back on, you'll get a new email.")
            return out
        given = self.facts.get("exit_plan")
        from_template = False
        if isinstance(given, str) and given.strip():
            out = [self.reg.register(given.strip())]
        elif isinstance(given, (list, tuple)) and given:
            out = [self.reg.register(str(x)) for x in given if str(x).strip()]
        elif isinstance(given, dict) and given:
            out = [self.reg.register(str(v)) for v in given.values() if isinstance(v, str) and v.strip()]
        else:
            out = self.lines(self.templates(EXIT_PLAN) or [])
            from_template = True
        if self.kind == "REBALANCE":
            return out or ["Every ETF is re-decided at the next monthly check."]
        if not (from_template and self.module in PLAN_NAMES_EXIT_EMAIL):
            out.append("You'll get an email telling you to sell when any of these fire. You don't need to watch the "
                       "screen.")
        return out

    def why_heading(self) -> str:
        return ("Why sell now" if self.is_sell else "Why these orders" if self.kind == "REBALANCE"
                else "Why this trade")

    def why(self) -> list[tuple[str, Any]]:
        templates = self.templates(WHY) or GENERIC_WHY.get(self.kind, [])
        blocks: list[tuple[str, Any]] = [("p", s) for s in self.lines(templates)]
        if self.is_sell:
            result = self.t(*RESULT_SO_FAR)
            if result:
                blocks.append(("p", result))
        if self.kind == "REBALANCE":
            table = self._signals_table()
            if table:
                blocks.append(("p", "Where each ETF stands:"))
                blocks.append(("table", table))
            deferred, skipped = _items(self.facts.get("deferred")), _items(self.facts.get("skipped_band"))
            if deferred:
                blocks.append(("p", (self.t("Coming in the next trading day's evening email (at most "
                                            "{max_orders_per_email:int} orders per email): ")
                                     or "Coming in the next trading day's evening email: ")
                               + ", ".join(deferred) + "."))
            if skipped:
                blocks.append(("p", "Skipped because the change is too small to bother: " + ", ".join(skipped) + "."))
        if not blocks:
            blocks.append(("p", f"The {self.module_name} rule fired."))
        return blocks

    def _signals_table(self) -> tuple[list[str], list[list[str]]] | None:
        signals = self.facts.get("signals")
        if not isinstance(signals, dict) or not signals:
            return None
        targets = self.facts.get("targets")
        if isinstance(targets, dict) and isinstance(targets.get("targets"), dict):
            targets = targets["targets"]
        targets = targets if isinstance(targets, dict) else {}
        rows = []
        for ticker, sig in signals.items():
            sig = sig if isinstance(sig, dict) else {}
            ret = sig.get("ret_252")
            excess, sign = sig.get("excess"), sig.get("sign")
            beats = (float(sign) > 0) if _is_num(sign) else (float(excess) > 0) if _is_num(excess) else None
            target = targets.get(ticker)
            rows.append([str(ticker),
                         self.reg.fmt_pct(ret, decimals=1, signed=True) if _is_num(ret) else "—",
                         "—" if beats is None else "Yes" if beats else "No",
                         self.reg.fmt_money(target) if _is_num(target) else "—"])
        return ["ETF", "Past-year return", "Beats T-bills?", "Target"], rows

    def odds(self) -> list[tuple[str, Any]]:
        blocks: list[tuple[str, Any]] = []
        if self.is_sell:
            blocks.append(("p", "An exit needs no odds: the rule decides, not a forecast."))
        first = self.t("Since {since:year} this rule fired {trades_per_year:num1} times a year",
                       "In testing this rule fired {trades_per_year:num1} times a year")
        rest = [s for s in (self.t("{win_rate:pct0} of trades made money"),
                            self.t("average {mean_pct:sppct2}"),
                            self.t("worst {worst_pct:ppct1}")) if s]
        clauses = ([first] if first else []) + rest
        if clauses:
            sentence = "; ".join(clauses) + "."
            if not self.is_sell:
                blocks.append(("p", sentence[0].upper() + sentence[1:]))
            else:
                blocks.append(("p", "For reference: " + sentence[0].lower() + sentence[1:]))
        if not self.is_sell:
            for s in (self.t("For planning, the system assumes {planning_mean_pct:sppct2} per trade, about half the "
                             "tested average, because live results usually come in weaker than backtests.", None),
                      self.t("Typical hold: {median_hold_sessions:int} trading days. Worst drawdown of the rule in "
                             "testing: {max_drawdown_pct:ppct0}.",
                             "Typical hold: {median_hold_sessions:int} trading days.", None)):
                if s:
                    blocks.append(("p", s))
            fc = []
            for f in self._forecasts():
                line = self.t("{p:pct0}: {question} (due {due:date})", "{p:pct0}: {question}",
                              p=f.get("p"), question=f.get("question"), due=f.get("due"))
                if line:
                    fc.append(line)
            if fc:
                blocks.append(("p", "Forecasts logged for scoring (the monthly email grades them):"))
                blocks.append(("ul", fc))
            if not clauses and not fc:
                blocks.append(("p", "No base rate is on file for this rule yet. The paper phase is measuring it."))
        return blocks

    def _forecasts(self) -> list[dict]:
        return [f for f in (self.rec.forecasts or []) if isinstance(f, dict) and _is_num(f.get("p"))]

    def risks(self) -> list[str]:
        out: list[str] = []
        if self.is_sell:
            out.append(f"Selling locks in the result. If {self.ticker} rallies after you sell, that's the rule working "
                       "as tested, not a mistake.")
        else:
            out += self.lines(RISKS.get(self.module, []))
            if self.kind == "REBALANCE":
                stress = self.t("The trend book is sized so its worst month on record would cost about "
                                "{stress_usd:money} ({stress_frac:pct2} of the portfolio).", None)
            else:
                stress = self.t("The size is set so a repeat of {ticker}'s worst crash on record would cost about "
                                "{stress_usd:money} ({stress_frac:pct2} of the portfolio). That's the planning loss "
                                "in the box above.", None)
            if stress:
                out.append(stress)
            horizon = self.t(*HORIZON_RISK)
            if horizon:
                out.append(horizon)
            if not self.coinbase:
                out.append("A market order at the open fills at whatever price the market opens at, even after "
                           "overnight news.")
        out.append(TAX_LINES.get(self.account, TAX_LINES["taxable"]))
        return out

    def record_fill(self) -> str:
        if self.issue_url and len(self.rec.orders) > 1:
            s = (f"Open {self.reg.register(self.issue_url)} and add one comment per order: filled <dollars> @ "
                 "<price> <ticker> (what you spent or got, the price, then the ticker), or skipped <ticker>. The "
                 "GitHub mobile app works.")
        elif self.issue_url:
            s = (f"Open {self.reg.register(self.issue_url)} and add a comment: filled <dollars> @ <price> (what you "
                 "spent or got, and the price), or skipped. The GitHub mobile app works.")
        else:
            s = ("There's no GitHub issue link this time. Note the dollars and the price you got (or that you "
                 "skipped); the monthly review asks for it.")
        if not self.live:
            s += (" The paper broker records its own fill at the open either way; your note lets the system compare "
                  "practice fills with its model.")
        return s

    def footer(self) -> list[str]:
        version = self.reg.register(self.ctx.get("constitution_version") or "unknown")
        tid = self.reg.register(self.rec.trade_id or "none")
        lines = [f"Trade {tid} · module {self.module} ({self.module_name}) · constitution v{version}"]
        sources = self.ctx.get("sources")
        if isinstance(sources, (list, tuple)):
            sources = ", ".join(str(s) for s in sources)
        asof = self.reg.register(self.ctx.get("data_asof") or "unknown")
        lines.append(f"Data as of {asof} · sources: {self.reg.register(sources or 'not recorded')}")
        head = str(self.ctx.get("ledger_head") or "")
        lines.append(f"Ledger head: {self.reg.register(head[:12]) if head else 'not recorded'}")
        ids = [self.reg.register(str(f["forecast_id"])) for f in self._forecasts() if f.get("forecast_id")]
        if ids:
            lines.append("Forecasts: " + ", ".join(ids))
        lines.append(DISCLAIMER)
        return lines

    def build(self) -> RenderedEmail:
        subject = self.subject()
        sentence = self.one_sentence()
        blocks: list[tuple[str, Any]] = [
            ("banner", LIVE_BANNER if self.live else PAPER_BANNER),
            ("box", self.headline()),
            ("h", "In one sentence"), ("p", sentence),
            ("h", f"Do this in {self.venue}"),
        ]
        if self.kind == "REBALANCE" and self.orders:
            blocks.append(("table", self._order_table()))
        blocks += [
            ("ol", self.steps()),
            ("h", "What if"), ("ul", self.what_if()),
            ("h", "How you get out (decided now)"), ("ul", self.exit_plan()),
            ("h", self.why_heading()), *self.why(),
            ("h", "The odds"), *self.odds(),
            ("h", "Risks and tax"), ("ul", self.risks()),
            ("h", "Your portfolio after this trade"),
        ]
        table = _rows_table(self.ctx.get("portfolio_after") or [], self.nav, self.reg)
        blocks.append(("table", table) if table else ("p", "Not available for this run."))
        blocks += [("h", "Record your fill"), ("p", self.record_fill()), ("footer", self.footer())]
        slug = f"{self.kind.lower()}-{self.rec.trade_id}" if self.rec.trade_id else self.kind.lower()
        if self.batch:
            slug += f"-part-{self.batch}"
        meta = {"kind": self.kind, "module": self.module, "trade_id": self.rec.trade_id, "mode": self.MODE.lower(),
                "created_date": self.rec.created_date,
                "execute_date": self.execute_date.isoformat() if self.execute_date else None, "slug": slug,
                "batch": self.batch or 1}
        return RenderedEmail(subject=subject, text=_to_text(blocks),
                             html=_to_html(blocks, subject, sentence, self.live),
                             numbers_registered=list(self.reg.numbers), meta=meta)

    def _order_table(self) -> tuple[list[str], list[list[str]]]:
        rows = []
        for o in self.table_orders:
            if o.side == "sell" and o.close_all:
                meta = o.meta or {}
                amount = self._sell_amount(meta.get("qty"), meta.get("keep_qty")) or "Sell all"
            elif _is_num(o.dollars):
                amount = self.reg.fmt_money(o.dollars)
            else:
                amount = "—"
            rows.append([o.ticker, TICKER_NAMES.get(o.ticker, "fund"), o.side.capitalize(), amount])
        return ["Ticker", "What it is", "Action", "Dollars"], rows


def render(rec: Recommendation, ctx: dict) -> RenderedEmail:
    """Render one decision (NEW_TRADE, EXIT, REBALANCE, SWITCH_ON, SWITCH_OFF) as a text + HTML email.

    See the module docstring for the ctx and rec.facts keys. Every number goes through the registry;
    check the result with `traderec.validator.validate` before sending.
    """
    return _TradeEmail(rec, ctx or {}).build()


# ---------------------------------------------------------------------------------------- monthly review

def render_monthly(report: dict, ctx: dict) -> RenderedEmail:
    """Render the monthly review (design §7, §8): failures first, then results, trades, forecasts, the shadow
    book, operations, the paper-phase gate and rule changes.

    report keys (flat; all optional except month; fractions unless noted):
      month                   "YYYY-MM" of the month reviewed
      nav, nav_prev, nav_start NAV at month end, at the previous month end, at the paper-phase start (USD)
      ret_month, ret_since_start                 portfolio returns (computed from the NAVs when missing)
      spy_ret_month, spy_ret_since_start         SPY total return, for comparison
      tbill_ret_month, tbill_ret_since_start     T-bill return, for comparison
      drawdown                current drawdown from the NAV peak
      trades_opened, trades_closed               counts this month
      trades                  [{"module", "opened", "closed", "pnl_usd"}] per module
      forecasts_resolved, forecasts_open         counts
      forecast_mean_brier, forecast_hit_rate, forecast_mean_p   for the forecasts scored this month
      shadow                  [{"name", "signals", "closed", "mean_ret"}] shadow-book rows
      runs_expected, runs_on_time                scheduled runs this month and how many ran on time
      validator_failures, data_problems          counts this month; data_notes: [str]
      emails_sent, emails_handled                trade emails this month and how many got a fill/skip comment
      ledger_ok               bool: the hash chain verified
      fills_ok                bool | None: practice fills within tolerance of the fill model (None = not measured)
      months_elapsed, trades_to_date             paper phase so far
      on_time_rate_to_date, validator_failures_to_date, emails_handled_rate_to_date   gate inputs (default:
                              this month's values)
      fills_ok_to_date        bool | None: the fills gate to date (default: fills_ok)
      gate_months, gate_trades, gate_on_time, gate_emails_handled   thresholds (default GATE_DEFAULTS, design §7)
      edge_p, edge_units, edge_threshold, edge_binding   the evidence meter: P(edge > 0) on the wide book, its
                              resolved units, the go-live threshold, and whether it binds (30 selected trades)
      stage, next_quarterly, quarterly_this_month   "paper" | "live"; the next quarterly review ("YYYY-Qn")
      open_trades             [{"module", "trade_id", "status"}]; paused_modules [{"module", "date", "reason"}]
      changes                 [str] rule changes this month (design §8); empty = none
      failures                [str] extra problems to show first
    ctx: mode, ledger_head, data_asof, sources, constitution_version (as for `render`).
    """
    r: dict[str, Any] = dict(GATE_DEFAULTS)
    r.update({k: v for k, v in (report or {}).items() if v is not None})
    ctx = ctx or {}
    reg = NumberRegistry()
    filler = _Filler(reg, r)
    live = str(ctx.get("mode", "paper")).lower() == "live"
    MODE = "LIVE" if live else "PAPER"

    def num(k: str) -> float | None:
        return float(r[k]) if _is_num(r.get(k)) else None

    # derived values
    derived: dict[str, Any] = {}
    nav, nav_prev, nav_start = num("nav"), num("nav_prev"), num("nav_start")
    if num("ret_month") is None and nav is not None and nav_prev:
        derived["ret_month"] = nav / nav_prev - 1.0
    if num("ret_since_start") is None and nav is not None and nav_start:
        derived["ret_since_start"] = nav / nav_start - 1.0
    runs_expected, runs_on_time = num("runs_expected"), num("runs_on_time")
    on_time_rate = runs_on_time / runs_expected if runs_expected and runs_on_time is not None else None
    sent, handled = num("emails_sent"), num("emails_handled")
    handled_rate = handled / sent if sent and handled is not None else None
    derived["on_time_rate"] = on_time_rate
    derived["handled_rate"] = handled_rate
    derived = {k: v for k, v in derived.items() if v is not None}

    def t(*alternatives: str | None, **extra: Any) -> str | None:
        return filler.first(alternatives, {**derived, **extra})

    month_label = "this month"
    try:
        month_label = reg.fmt_date(_to_date(str(r.get("month", ""))[:7] + "-01"), "month")
    except ValueError:
        pass

    # failures first
    def plural(n: float | None, one: str, many: str) -> str:
        return one if n == 1 else many

    failures: list[str] = []
    vf = num("validator_failures") or 0
    if vf > 0:
        failures.append(t("The validator blocked {validator_failures:int} " + plural(vf, "email", "emails") +
                          " this month.") or "")
    dp = num("data_problems") or 0
    if dp > 0:
        notes = [reg.register(str(n)) for n in (r.get("data_notes") or []) if str(n).strip()]
        failures.append((t("{data_problems:int} " + plural(dp, "data problem", "data problems")) or "Data problems")
                        + (": " + "; ".join(notes) if notes else "") + ".")
    if runs_expected is not None and runs_on_time is not None and runs_on_time < runs_expected:
        late = runs_expected - runs_on_time
        failures.append(t("{late:int} of {runs_expected:int} runs " + plural(late, "was", "were") +
                          " late or missing.", late=late) or "")
    if r.get("ledger_ok") is False:
        failures.append("The ledger failed verification. Don't trust this report until it's fixed.")
    if r.get("fills_ok") is False:
        failures.append("Practice-account fills differ from the fill model by more than the tolerance.")
    failures += [reg.register(str(f)) for f in (r.get("failures") or []) if str(f).strip()]
    failures = [f for f in failures if f]

    # the gate (go live at quarter size, design §7)
    months = num("months_elapsed")
    trades_to_date = num("trades_to_date")
    on_time_td = num("on_time_rate_to_date") if num("on_time_rate_to_date") is not None else on_time_rate
    vf_td = num("validator_failures_to_date")
    vf_td = vf_td if vf_td is not None else num("validator_failures")
    handled_td = num("emails_handled_rate_to_date")
    handled_td = handled_td if handled_td is not None else handled_rate
    ledger_ok = r.get("ledger_ok")
    gate_rows, checks = _gate_rows(reg, r, months=months, on_time=on_time_td, vf=vf_td, handled=handled_td,
                                   fills_ok=r.get("fills_ok_to_date", r.get("fills_ok")), ledger_ok=ledger_ok,
                                   trades=trades_to_date)
    passed = sum(1 for c in checks if c)

    # subject
    problems = (f" — {reg.fmt_num(len(failures))} problem{'s' if len(failures) != 1 else ''}"
                if failures else "")
    nav_part = t(" — NAV {nav:money} ({ret_month:spct2})", " — NAV {nav:money}") or ""
    subject = f"[{MODE}][MONTHLY] {month_label} review{problems}{nav_part}"

    # headline box
    box = [("PROBLEMS", f"{reg.fmt_num(len(failures))}, listed first below" if failures else "None this month"),
           ("NAV", t("{nav:money}: {ret_month:spct2} this month, {ret_since_start:spct2} since start",
                     "{nav:money}: {ret_month:spct2} this month", "{nav:money}") or "Not available"),
           ("VS SPY", t("SPY {spy_ret_month:spct2} this month, {spy_ret_since_start:spct2} since start",
                        "SPY {spy_ret_month:spct2} this month") or "Not available"),
           ("VS T-BILLS", t("T-bills {tbill_ret_month:spct2} this month, {tbill_ret_since_start:spct2} since start",
                            "T-bills {tbill_ret_month:spct2} this month") or "Not available"),
           ("TRADES", t("{trades_opened:int} opened, {trades_closed:int} closed") or "Not available"),
           ("FORECASTS", t("{forecasts_resolved:int} scored; mean Brier {forecast_mean_brier:num3}",
                           "{forecasts_resolved:int} scored") or "None scored yet"),
           ("GATE", f"{reg.fmt_num(passed)} of {reg.fmt_num(len(checks))} go-live checks pass"),
           ("STATUS", f"{MODE} · constitution v{reg.register(ctx.get('constitution_version') or 'unknown')}")]

    blocks: list[tuple[str, Any]] = [("banner", LIVE_MONTHLY_BANNER if live else PAPER_MONTHLY_BANNER),
                                     ("box", box), ("h", "Problems first")]
    blocks.append(("ul", failures) if failures else
                  ("p", "None this month: runs on time, no validator failures, no data problems."))

    # results
    blocks.append(("h", "Results"))

    def cell(key: str) -> str:
        v = num(key) if key in r else derived.get(key)
        return reg.fmt_pct(v, decimals=2, signed=True) if v is not None else "—"

    blocks.append(("table", (["", "This month", "Since start"],
                             [["Your portfolio", cell("ret_month"), cell("ret_since_start")],
                              ["SPY (buy and hold)", cell("spy_ret_month"), cell("spy_ret_since_start")],
                              ["T-bills (the no-risk rate)", cell("tbill_ret_month"), cell("tbill_ret_since_start")]])))
    for s in (t("Portfolio value: {nav:money}.", None),
              t("Down {drawdown:pct1} from the portfolio's peak.", None) if (num("drawdown") or 0) > 0 else None):
        if s:
            blocks.append(("p", s))

    # trades
    blocks.append(("h", "Trades"))
    blocks.append(("p", t("{trades_opened:int} opened and {trades_closed:int} closed this month.") or
                   "No trade counts in this report."))
    trade_rows = []
    for row in r.get("trades") or []:
        if not isinstance(row, dict):
            continue
        mod = str(row.get("module", ""))
        trade_rows.append([reg.register(f"{mod} {MODULE_NAMES.get(mod, '')}".strip()),
                           reg.fmt_num(row["opened"]) if _is_num(row.get("opened")) else "—",
                           reg.fmt_num(row["closed"]) if _is_num(row.get("closed")) else "—",
                           reg.fmt_money(row["pnl_usd"], signed=True) if _is_num(row.get("pnl_usd")) else "—"])
    if trade_rows:
        blocks.append(("table", (["Module", "Opened", "Closed", "Result"], trade_rows)))
    blocks += [("p", s) for s in (_open_trades_line(reg, r.get("open_trades")),
                                  _paused_line(reg, r.get("paused_modules"))) if s]

    # forecasts
    blocks.append(("h", "Forecast scores"))
    fc = [s for s in (
        t("{forecasts_resolved:int} forecasts were scored this month ({forecasts_open:int} still open).",
          "{forecasts_resolved:int} forecasts were scored this month."),
        t("Mean Brier score {forecast_mean_brier:num3}: the average squared miss, so lower is better. Always "
          "saying {coin_p:pct0} would score {coin:num2}.", None, coin_p=BRIER_COIN_FLIP_P, coin=BRIER_COIN_FLIP),
        t("On average the forecasts said {forecast_mean_p:pct0}; {forecast_hit_rate:pct0} came true.", None),
    ) if s]
    if fc and (num("forecasts_resolved") or 0) < FEW_FORECASTS:
        fc.append("With this few scored forecasts, the gap between the two is mostly noise.")
    blocks.append(("p", " ".join(fc) if fc else "No forecasts were scored this month."))

    # shadow book
    blocks.append(("h", "Shadow book (rules tracked on paper only, never emailed)"))
    blocks += _shadow_blocks(reg, r.get("shadow"), "this month")

    # operations
    blocks.append(("h", "Operations"))
    ops = [s for s in (
        t("Runs on time: {runs_on_time:int} of {runs_expected:int}.", None),
        t("Validator failures: {validator_failures:int}.", None),
        t("Data problems: {data_problems:int}.", None),
        t("Trade emails: {emails_sent:int} sent, {emails_handled:int} handled (a fill or skip recorded).", None),
        t("Practice fills against the fill model: a median gap of {median_fill_gap_bps:num1} bp this month.", None),
        None if ledger_ok is None else f"Ledger verified: {_yes_no(ledger_ok)}.",
    ) if s]
    blocks.append(("ul", ops) if ops else ("p", "No operations data in this report."))

    # gate
    blocks.append(("h", "Paper-phase gate (going live at quarter size)"))
    blocks.append(("table", (["Check", "Needed", "Now", "Pass?"], gate_rows)))
    blocks.append(("p", "All checks pass: the go-live review with you can happen." if passed == len(checks)
                   else f"Not yet: {reg.fmt_num(passed)} of {reg.fmt_num(len(checks))} checks pass. Going live is "
                        "an operations gate; the edge evidence stays advisory until there are enough trades."))
    edge_note = t("The edge evidence scores {edge_units:int} resolved results of the same rules run wide: the dip-buy "
                  "without its VIX gate, every Bitcoin switch, the trend book's positions month by month and every "
                  "crash day, against a sceptical starting view that most edges are small.", None) \
        if num("edge_p") is not None else None
    stage = str(r.get("stage") or "").lower()
    next_q = _quarter_label(r.get("next_quarterly"), reg)
    stage_note = None
    if stage in ("paper", "live") and next_q:
        when = "right after this review" if r.get("quarterly_this_month") else "after its last monthly review"
        stage_note = (f"Stage: {stage}. The next quarterly review ({next_q}) comes {when}; it recommends the "
                      "go-live and ramp decisions, and you decide.")
    blocks += [("p", s) for s in (edge_note, stage_note) if s]

    # rule changes
    blocks.append(("h", "Rule changes"))
    changes = [reg.register(str(c)) for c in (r.get("changes") or []) if str(c).strip()]
    if changes:
        blocks.append(("p", "Rule changes this month (design §8):"))
        blocks.append(("ul", changes))
    else:
        blocks.append(("p", "No rule changes this month (design §8)."))

    head = str(ctx.get("ledger_head") or "")
    sources = ctx.get("sources")
    if isinstance(sources, (list, tuple)):
        sources = ", ".join(str(s) for s in sources)
    blocks.append(("footer", [
        f"Monthly review for {month_label} · constitution v{reg.register(ctx.get('constitution_version') or 'unknown')}",
        f"Data as of {reg.register(ctx.get('data_asof') or 'unknown')} · sources: "
        f"{reg.register(sources or 'not recorded')}",
        f"Ledger head: {reg.register(head[:12]) if head else 'not recorded'}",
        DISCLAIMER,
    ]))
    preheader = failures[0] if failures else f"{month_label} review: no problems."
    month = str(r.get("month", ""))
    meta = {"kind": "MONTHLY", "month": month, "mode": MODE.lower(), "slug": f"monthly-{month}".rstrip("-"),
            "failures": len(failures)}
    return RenderedEmail(subject=subject, text=_to_text(blocks), html=_to_html(blocks, subject, preheader, live),
                         numbers_registered=list(reg.numbers), meta=meta)


# ----------------------------------------------------------------------------- review helpers (gate, open trades)
# Shared by render_monthly and the quarterly and annual reviews (design §7 gate, §8 reviews). Same rules as the
# trade emails: no digits in templates; every number goes through the registry.

TRADE_STATUS = {"open": "open", "pending_entry": "entry order waiting", "pending_exit": "exit order waiting"}


def _yes_no(ok: bool | None) -> str:
    return "not measured" if ok is None else "yes" if ok else "no"


def _fnum(r: dict, key: str) -> float | None:
    v = lookup(r, key)
    return float(v) if _is_num(v) else None


def _quarter_label(key: Any, reg: NumberRegistry) -> str | None:
    """"2026-Q3" -> "Q3 2026" (registered), or None."""
    m = re.match(r"^(\d{4})-Q([1-4])$", str(key or ""))
    return reg.register(f"Q{m.group(2)} {m.group(1)}") if m else None


def _gate_rows(reg: NumberRegistry, r: dict, *, months: float | None, on_time: float | None, vf: float | None,
               handled: float | None, fills_ok: bool | None, ledger_ok: bool | None,
               trades: float | None) -> tuple[list[list[str]], list[bool | None]]:
    """The go-live gate table (design §7): the operations checks, the trade count that makes the edge evidence
    binding, and the edge evidence itself when the report carries it. Returns (rows, checks); the edge counts as a
    check only once it binds."""
    rows: list[list[str]] = []
    checks: list[bool | None] = []

    def gate(label: str, needed: str, now: str, ok: bool | None) -> None:
        rows.append([label, needed, now, _yes_no(ok)])
        checks.append(ok)

    gm, gt, gon, geh = (_fnum(r, k) for k in ("gate_months", "gate_trades", "gate_on_time", "gate_emails_handled"))
    gate("Months of paper trading", f"at least {reg.fmt_num(gm)}" if gm is not None else "—",
         reg.fmt_num(months, decimals=1, strip=True) if months is not None else "—",
         None if months is None or gm is None else months >= gm)
    gate("Runs on time", f"at least {reg.fmt_pct(gon, decimals=0)}" if gon is not None else "—",
         reg.fmt_pct(on_time, decimals=1) if on_time is not None else "—",
         None if on_time is None or gon is None else on_time >= gon)
    gate("Validator failures", "none", reg.fmt_num(vf) if vf is not None else "—", None if vf is None else vf == 0)
    gate("Emails handled (fill or skip recorded)", f"at least {reg.fmt_pct(geh, decimals=0)}" if geh is not None
         else "—", reg.fmt_pct(handled, decimals=1) if handled is not None else "—",
         None if handled is None or geh is None else handled >= geh)
    gate("Practice fills match the fill model", "yes", _yes_no(fills_ok), fills_ok)
    gate("Ledger verifies", "yes", _yes_no(ledger_ok), ledger_ok)
    rows.append(["Paper trades (edge evidence; advisory)", reg.fmt_num(gt) if gt is not None else "—",
                 reg.fmt_num(trades) if trades is not None else "—",
                 "advisory" if trades is None or gt is None or trades < gt else "yes"])
    edge_p, thr = _fnum(r, "edge_p"), _fnum(r, "edge_threshold")
    if edge_p is not None or "edge_units" in r:
        binding = r.get("edge_binding") is True
        ok = None if edge_p is None or thr is None else edge_p >= thr
        rows.append(["Chance of a real edge (the same rules run wide)",
                     f"at least {reg.fmt_pct(thr, decimals=0)}" if thr is not None else "—",
                     reg.fmt_pct(edge_p, decimals=0) if edge_p is not None else "too few results",
                     _yes_no(ok) if binding else "advisory"])
        if binding:
            checks.append(ok)
    return rows, checks


def _shadow_blocks(reg: NumberRegistry, rows: Any, period: str) -> list[tuple[str, Any]]:
    """The shadow-book table: books with signals or closed trades in the period; enabled books without any are
    named in one line, and disabled idle books (Phase B books not switched on yet) are left out."""
    table, quiet = [], []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        name = reg.register(str(row.get("name", "")))
        if not (row.get("signals") or row.get("closed")):
            if row.get("enabled", True) is not False:
                quiet.append(name)
            continue
        table.append([name, reg.fmt_num(row["signals"]) if _is_num(row.get("signals")) else "—",
                      reg.fmt_num(row["closed"]) if _is_num(row.get("closed")) else "—",
                      reg.fmt_pct(row["mean_ret"], decimals=2, signed=True) if _is_num(row.get("mean_ret")) else "—"])
    blocks: list[tuple[str, Any]] = []
    if table:
        blocks.append(("table", (["Rule", "Signals", "Closed", "Average result"], table)))
    if quiet:
        blocks.append(("p", f"No activity {period}: " + "; ".join(quiet) + "."))
    return blocks or [("p", f"No shadow-book activity {period}.")]


def _open_trades_line(reg: NumberRegistry, rows: Any) -> str | None:
    items = [f"{reg.register(str(o.get('module', '')))} {reg.register(str(o.get('trade_id', '')))} "
             f"({TRADE_STATUS.get(str(o.get('status')), 'open')})" for o in rows or [] if isinstance(o, dict)]
    return ("Open now: " + "; ".join(items) + ".") if items else None


def _paused_line(reg: NumberRegistry, rows: Any) -> str | None:
    items = []
    for p in rows or []:
        if not isinstance(p, dict):
            continue
        when = f" since {reg.fmt_date(p['date'], 'long')}" if p.get("date") else ""
        items.append(f"{reg.register(str(p.get('module', '')))}{when} ({reg.register(str(p.get('reason', '')))})")
    return ("Back in the shadow ledger by a kill switch: " + "; ".join(items) + ".") if items else None


class _ReviewEmail:
    """Plumbing shared by the quarterly and annual review emails: the registry, templates, tables and footer."""

    KIND = "REVIEW"
    TITLE = "Review"
    PERIOD = "this period"

    def __init__(self, report: dict, ctx: dict) -> None:
        self.r: dict[str, Any] = {k: v for k, v in (report or {}).items() if v is not None}
        self.ctx = ctx or {}
        self.reg = NumberRegistry()
        self.filler = _Filler(self.reg, self.r)
        self.live = str(self.ctx.get("mode", "paper")).lower() == "live"
        self.MODE = "LIVE" if self.live else "PAPER"

    # --- formatting -------------------------------------------------------------------------------
    def t(self, *alternatives: str | None, **extra: Any) -> str | None:
        return self.filler.first(alternatives, extra)

    def num(self, key: str) -> float | None:
        return _fnum(self.r, key)

    def pct(self, v: Any, decimals: int = 0, *, signed: bool = False, points: bool = False) -> str:
        return self.reg.fmt_pct(v, decimals=decimals, signed=signed, points=points) if _is_num(v) else "—"

    def n(self, v: Any, decimals: int | None = None, *, signed: bool = False) -> str:
        return self.reg.fmt_num(v, decimals=decimals, signed=signed) if _is_num(v) else "—"

    def money(self, v: Any, *, signed: bool = False) -> str:
        return self.reg.fmt_money(v, signed=signed) if _is_num(v) else "—"

    def label(self, s: Any) -> str:
        return self.reg.register(str(s))

    def rows(self, key: str) -> list[dict]:
        v = lookup(self.r, key)
        return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []

    # --- shared sections --------------------------------------------------------------------------
    def problems(self) -> list[str]:
        """The review's problems (structured, rendered here) and its alert messages (verbatim), failures first."""
        out: list[str] = []
        for p in self.rows("problems"):
            kind, n = p.get("kind"), _fnum(p, "n")
            if kind == "validator":
                s = self.t("The validator blocked {n:int} " + ("email." if n == 1 else "emails."), **p)
            elif kind == "data":
                notes = [self.label(x) for x in p.get("notes") or [] if str(x).strip()]
                s = (self.t("{n:int} " + ("data problem" if n == 1 else "data problems"), **p) or "Data problems") \
                    + (": " + "; ".join(notes) if notes else "") + "."
            else:
                s = self.t(*PROBLEM_TEXT.get(str(kind), (None,)), **p)
            if s:
                out.append(s)
        out += [self.label(m) for m in self.r.get("failures") or [] if str(m).strip()]
        return out

    def results_table(self) -> tuple[str, Any]:
        def cell(key: str) -> str:
            return self.pct(self.num(key), 2, signed=True)

        return ("table", (["", self.PERIOD.capitalize(), "Since start"],
                          [["Your portfolio", cell("ret_period"), cell("ret_since_start")],
                           ["SPY (buy and hold)", cell("spy_ret_period"), cell("spy_ret_since_start")],
                           ["T-bills (the no-risk rate)", cell("tbill_ret_period"), cell("tbill_ret_since_start")]]))

    def trades_blocks(self) -> list[tuple[str, Any]]:
        blocks: list[tuple[str, Any]] = [("p", self.t("{trades_opened:int} trades opened and {trades_closed:int} "
                                                      f"closed {self.PERIOD}.") or "No trade counts in this review.")]
        rows = [[self.label(f"{row.get('module', '')} {MODULE_NAMES.get(str(row.get('module')), '')}".strip()),
                 self.n(row.get("opened")), self.n(row.get("closed")), self.money(row.get("pnl_usd"), signed=True)]
                for row in self.rows("trades")]
        if rows:
            blocks.append(("table", (["Module", "Opened", "Closed", "Result"], rows)))
        return blocks

    def shadow_blocks(self) -> list[tuple[str, Any]]:
        return [("h", "Shadow books (rules tracked on paper only, never emailed)"),
                *_shadow_blocks(self.reg, self.rows("shadow"), self.PERIOD)]

    def footer(self) -> list[str]:
        head = str(self.ctx.get("ledger_head") or "")
        sources = self.ctx.get("sources")
        if isinstance(sources, (list, tuple)):
            sources = ", ".join(str(s) for s in sources)
        return [f"{self.TITLE} for {self.period_label()} · constitution "
                f"v{self.label(self.ctx.get('constitution_version') or 'unknown')}",
                f"Data as of {self.label(self.ctx.get('data_asof') or 'unknown')} · sources: "
                f"{self.label(sources or 'not recorded')}",
                f"Ledger head: {self.label(head[:12]) if head else 'not recorded'}",
                DISCLAIMER]

    def period_label(self) -> str:
        return self.label(self.r.get("label") or "this period")

    def email(self, subject: str, blocks: list[tuple[str, Any]], preheader: str, meta: dict) -> RenderedEmail:
        return RenderedEmail(subject=subject, text=_to_text(blocks), html=_to_html(blocks, subject, preheader, self.live),
                             numbers_registered=list(self.reg.numbers),
                             meta={"kind": self.KIND, "mode": self.MODE.lower(), **meta})


# Problems the reviews compute (reports.quarterly_report / annual_report "problems"), failures first.
PROBLEM_TEXT: dict[str, tuple] = {
    "late_runs": ("{late:int} of {expected:int} scheduled runs were late or missing.",),
    "ledger": ("The ledger failed verification. Don't trust this review until it's fixed.",),
    "fills": ("Practice fills differ from the fill model: a median gap of {median_gap_bps:num1} bp, against a "
              "tolerance of {tolerance_bps:num} bp.",
              "Practice fills differ from the fill model by more than the tolerance."),
    "calibration_gross": ("Gross calibration bias in {family}: the forecasts said {mean_p:pct0} and {hit_rate:pct0} came "
                          "true ({n:int} scored). That fails the go-live rule until the forecasts are fixed.",),
    "calibration_warning": ("Calibration warning for {family}: the forecasts said {mean_p:pct0} and {hit_rate:pct0} came "
                            "true ({n:int} scored).",),
    "drift": ("Base-rate drift in {family}: {win_rate:pct0} won against a base rate of {base_win_rate:pct0}; the average "
              "was {mean_pct:sppct2} against {base_mean_pct:sppct2} ({n:int} resolved).",
              "Base-rate drift in {family} ({n:int} resolved)."),
    "kill_switch": ("{module} went back to the shadow ledger on {date:date}: {reason}.",
                    "{module} went back to the shadow ledger: {reason}."),
    "m2_review": ("The trend book (M2) is {drawdown:pct1} below its peak, at or past the {review_drawdown:pct0} "
                  "review trigger: review it with the owner.",),
    "m2_pause": ("The trend book's (M2) Sharpe over the last {window:int} months is {sharpe:num2}, below "
                 "{pause_sharpe:num1}: the design says pause it to the shadow ledger. You decide.",),
}
COST_ADVICE = {
    "keep": ("The fill model stands.",),
    "more_conservative": ("Practice fills are worse than the model by more than {costs.tolerance_bps:num} bp on "
                          "average: the recommendation is a more conservative fill model at the next change window. "
                          "You decide; past fills are never re-priced.",),
    "cut_supported": ("Practice fills beat the model on {costs.practice_fills:int} fills (a cheaper model needs at least "
                      "{costs.cut_min_fills:int}): a cheaper fill model is supported. You decide.",),
    "no_practice_fills": ("Without practice fills the model can only become more conservative; a cheaper model needs "
                          "{costs.cut_min_fills:int} practice fills.",),
}
CALIBRATION_STATUS = {"gross": "gross bias", "warning": "warning", "ok": "ok", "few": "too few"}
DRIFT_STATUS = {"too few": "too few", "in line": "in line", "early sign": "early sign", "drift": "drift"}
RETIRE_STATUS = {"keep": "keep", "too early": "too early to judge", "candidate": "retirement candidate",
                 "killed": "paused by its kill switch"}


class _QuarterlyEmail(_ReviewEmail):
    KIND = "QUARTERLY"
    TITLE = "Quarterly review"
    PERIOD = "this quarter"

    def build(self) -> RenderedEmail:
        r = self.r
        failures = self.problems()
        live = str(r.get("stage") or "").lower() == "live"
        gate_rows, checks = _gate_rows(
            self.reg, r, months=self.num("months_elapsed"), on_time=self.num("on_time_rate_to_date"),
            vf=self.num("validator_failures_to_date"), handled=self.num("emails_handled_rate_to_date"),
            fills_ok=r.get("fills_ok_to_date"), ledger_ok=r.get("ledger_ok"), trades=self.num("trades_to_date"))
        passed, total = sum(1 for c in checks if c), len(checks)
        ramp = r.get("ramp") if isinstance(r.get("ramp"), dict) else {}
        if live:
            decision = ("Full size: all checks pass" if ramp.get("full_ok") else
                        "Half size: all checks pass" if ramp.get("half_ok") else "Stay at the current size")
            short = ("full-size checks pass" if ramp.get("full_ok") else
                     "half-size checks pass" if ramp.get("half_ok") else "ramp: not yet")
        elif r.get("go_live_ready"):
            decision = self.t("All go-live checks pass: hold the go-live review with you ({pilot_size:pct0} size)",
                              "All go-live checks pass: hold the go-live review with you") or ""
            short = "go-live checks pass"
        else:
            decision = f"Stay on paper: {self.n(passed)} of {self.n(total)} go-live checks pass"
            short = f"go-live: {self.n(passed)} of {self.n(total)} checks pass"
        label = self.period_label()
        problems = f" — {self.n(len(failures))} problem{'s' if len(failures) != 1 else ''}" if failures else ""
        subject = f"[{self.MODE}][QUARTERLY] {label} review{problems} — {short}"

        maps = self.rows("calibration.maps")
        ready_maps = [m for m in maps if m.get("status") == "recommend map"]
        box = [
            ("PROBLEMS", f"{self.n(len(failures))}, listed first below" if failures else "None this quarter"),
            ("DECISION", decision),
            ("EDGE", self.t("{edge_p:pct0} chance of a real edge from {edge_units:int} results (needs "
                            "{edge_threshold:pct0}; " + ("binding" if r.get("edge_binding") else "advisory") + ")")
             or "Too few results yet"),
            ("KAPPA", self.t("κ̂ {kappa.kappa:num2}" + (" (the starting view only)" if lookup(r, "kappa.prior_only")
                                                      else "") + "; sizing stays at κ {kappa.sizing_kappa:num1}")
             or "Not computed"),
            ("CALIBRATION", self.t("{calibration.pooled.n:int} scored: said {calibration.pooled.mean_p:pct0}, "
                                   "{calibration.pooled.hit_rate:pct0} came true") or "No scored forecasts yet"),
            ("COSTS", self.t("Fill model {costs.cost_usd:money} on {costs.fills:int} fills ({costs.cost_bps:num1} bp)",
                             "No paper fills this quarter")),
            ("MAPS", f"{self.n(len(ready_maps))} recommended" if ready_maps else "Identity maps (none due)"),
            ("STATUS", f"{self.MODE} · stage {self.label(r.get('stage') or 'paper')} · constitution "
                       f"v{self.label(self.ctx.get('constitution_version') or 'unknown')}"),
        ]
        blocks: list[tuple[str, Any]] = [("banner", LIVE_MONTHLY_BANNER if self.live else PAPER_MONTHLY_BANNER),
                                         ("box", box), ("h", "Problems first")]
        blocks.append(("ul", failures) if failures else
                      ("p", "None this quarter: runs on time, no validator failures, no calibration or drift flags."))
        blocks += self.gate_blocks(gate_rows, passed, total, live, ramp)
        blocks += [("h", "Results this quarter"), self.results_table()]
        blocks += [("p", s) for s in (
            self.t("Portfolio value: {nav:money}. The deepest drop from the peak this quarter was "
                   "{max_drawdown_period:pct1}.", "Portfolio value: {nav:money}.", None),) if s]
        blocks += self.trades_blocks()
        blocks += self.edge_blocks()
        blocks += self.kappa_blocks()
        blocks += self.cost_blocks()
        blocks += self.calibration_blocks()
        blocks += self.drift_blocks()
        blocks += self.map_blocks(maps)
        blocks += self.module_review_blocks()
        blocks += self.shadow_blocks()
        blocks += [("h", "Rule changes"),
                   ("p", self.t("No rule changes (design §8). Reviews only recommend: a change needs a forward "
                                "comparison of at least {change_forward_months:int} months, at most one change per "
                                "parameter per quarter, and your decision at the annual review.",
                                "No rule changes (design §8). Reviews only recommend; you decide.")),
                   ("footer", self.footer())]
        quarter = str(r.get("quarter", ""))
        return self.email(subject, blocks, failures[0] if failures else f"{label} review: {short}.",
                          {"quarter": quarter, "slug": f"quarterly-{quarter}".rstrip("-"), "failures": len(failures)})

    def gate_blocks(self, rows: list[list[str]], passed: int, total: int, live: bool,
                    ramp: dict) -> list[tuple[str, Any]]:
        r = self.r
        blocks: list[tuple[str, Any]] = [("h", "Go-live and ramp (you decide)"),
                                         ("table", (["Check", "Needed", "Now", "Pass?"], rows))]
        if not live:
            if r.get("go_live_ready"):
                s = self.t("All go-live checks pass. The recommendation: hold the go-live review with you and start "
                           "at {pilot_size:pct0} of the target size. Nothing changes until you decide.",
                           "All go-live checks pass: hold the go-live review with you. Nothing changes until you "
                           "decide.")
            else:
                s = (f"Not yet: {self.n(passed)} of {self.n(total)} checks pass, so the recommendation is to stay on "
                     "paper. Going live is an operations gate; the next quarterly review looks again.")
            blocks.append(("p", s))
            if not r.get("edge_binding"):
                blocks.append(("p", self.t("The edge evidence is advisory until the paper book has {gate_trades:int} "
                                           "trades ({trades_to_date:int} so far).",
                                           "The edge evidence is advisory until the paper book has enough trades.")))
            return blocks
        th = ramp.get("thresholds") if isinstance(ramp.get("thresholds"), dict) else {}
        half, full = ramp.get("half") or {}, ramp.get("full") or {}

        def row(label: str, needed: str, now: str, ok: Any) -> list[str]:
            return [label, needed, now, _yes_no(ok if isinstance(ok, bool) else None)]

        half_rows = [
            row("Months live", f"at least {self.n(th.get('ramp_half_live_months'))}", self.n(ramp.get("live_months")),
                half.get("live_months")),
            row("Live trades", f"at least {self.n(th.get('ramp_half_live_trades'))}", self.n(ramp.get("live_trades")),
                half.get("live_trades")),
            row("Chance of a real edge (paper at half weight)", f"at least {self.pct(th.get('ramp_half_edge'))}",
                self.pct(ramp.get("edge_p_weighted")), half.get("edge")),
            row("κ̂ (realised over claimed edge)", f"at least {self.n(th.get('ramp_half_kappa'), 1)}",
                self.n(ramp.get("kappa"), 2), half.get("kappa")),
            row("Implementation shortfall (share of the paper edge)",
                f"at most {self.pct(th.get('ramp_half_shortfall'))}", self.pct(ramp.get("shortfall")),
                half.get("shortfall")),
        ]
        full_rows = [
            row("Resolved trades (paper at half weight)", f"at least {self.n(th.get('ramp_full_resolved'))}",
                self.n(ramp.get("resolved_weighted"), 1), full.get("resolved")),
            row("Chance of a real edge (paper at half weight)", f"at least {self.pct(th.get('ramp_full_edge'))}",
                self.pct(ramp.get("edge_p_weighted")), full.get("edge")),
            row("Calibration verified", "yes", _yes_no(full.get("calibration")), full.get("calibration")),
        ]
        blocks += [("p", self.t("Ramp to half size ({ramp.thresholds.half_size:pct0} of the target):",
                                "Ramp to half size:")),
                   ("table", (["Check", "Needed", "Now", "Pass?"], half_rows)),
                   ("p", "Ramp to full size:"), ("table", (["Check", "Needed", "Now", "Pass?"], full_rows)),
                   ("p", "Every ramp step is yours to take at the review; kill switches demote modules on their own.")]
        return blocks

    def edge_blocks(self) -> list[tuple[str, Any]]:
        rows = []
        for f in self.rows("edge_families"):
            rows.append([self.label(f.get("label") or f.get("family", "")), self.n(f.get("units")),
                         self.pct(f.get("mean_excess"), 2, signed=True), self.n(f.get("sharpe"), 2, signed=True),
                         self.pct(f.get("p_positive")) if f.get("usable") else "too few"])
        blocks: list[tuple[str, Any]] = [("h", "Edge evidence: the same rules run wide")]
        if rows:
            blocks.append(("table", (["Family", "Results", "Average after T-bills", "Sharpe per result",
                                      "Chance of an edge"], rows)))
        blocks.append(("p", self.t(
            "All families together: a {edge_p:pct0} chance that the edge is real, from {edge_units:int} results. Each "
            "family joins once it has {edge_min_units:int} results. The starting view is sceptical (most edges are "
            "small), so a few good results move it little.",
            "Not enough resolved results for the edge evidence yet: each family joins once it has "
            "{edge_min_units:int}.",
            "Not enough resolved results for the edge evidence yet.")))
        return blocks

    def kappa_blocks(self) -> list[tuple[str, Any]]:
        rows = [[self.label(m.get("module", "")), self.n(m.get("trades")),
                 self.pct(m.get("claimed_mean_pct"), 2, signed=True, points=True),
                 self.pct(m.get("realized_mean_pct"), 2, signed=True, points=True),
                 self.n(m.get("kappa_obs"), 2) if m.get("used") else "too few"]
                for m in self.rows("kappa.modules")]
        blocks: list[tuple[str, Any]] = [("h", "Claimed vs realised edge")]
        if rows:
            blocks.append(("table", (["Module", "Closed trades", "Backtest average", "Realised average", "Ratio"],
                                     rows)))
        interval = self.pct(0.8)
        if lookup(self.r, "kappa.prior_only"):
            s = self.t("κ̂ is the share of the backtested edge that shows up in real trades. It stays at the starting "
                       "view of {kappa.prior_mean:num2} until a module has {kappa.min_trades:int} closed trades. "
                       "Sizing keeps κ at {kappa.sizing_kappa:num1} through the pilot; the ramp to half size needs "
                       "κ̂ of at least {ramp_half_kappa:num1}.",
                       "κ̂ stays at its starting view until modules have enough closed trades.")
        else:
            s = self.t("κ̂ is the share of the backtested edge that shows up in real trades: {kappa.kappa:num2} "
                       "(" + interval + " range {kappa.lo80:num2} to {kappa.hi80:num2}), from a starting view of "
                       "{kappa.prior_mean:num2}. Sizing keeps κ at {kappa.sizing_kappa:num1} through the pilot; the "
                       "ramp to half size needs κ̂ of at least {ramp_half_kappa:num1}.",
                       "κ̂ is {kappa.kappa:num2}; sizing keeps κ at {kappa.sizing_kappa:num1} through the pilot.")
        blocks.append(("p", s or "κ̂ was not computed."))
        return blocks

    def cost_blocks(self) -> list[tuple[str, Any]]:
        blocks: list[tuple[str, Any]] = [("h", "Costs and slippage"), ("p", self.t(
            "The fill model charged {costs.cost_usd:money} on {costs.fills:int} paper fills worth {costs.dollars:money} "
            "this quarter ({costs.cost_bps:num1} bp of what was traded).", "No paper fills this quarter."))]
        rows = [[self.label(x.get("ticker", "")), self.n(x.get("fills")), self.money(x.get("dollars")),
                 f"{self.n(x.get('cost_bps'), 1)} bp" if _is_num(x.get("cost_bps")) else "—"]
                for x in self.rows("costs.by_ticker")]
        if rows:
            blocks.append(("table", (["Ticker", "Fills", "Traded", "Model cost"], rows)))
        blocks.append(("p", self.t(
            "Your practice fills against the model: {costs.practice_fills:int} measured, a median gap of "
            "{costs.median_gap_bps:num1} bp and an average of {costs.mean_gap_bps:snum1} bp (above zero means worse "
            "for you).", "No practice fills were recorded this quarter.")))
        prac = [[self.label(x.get("ticker", "")), self.n(x.get("fills")),
                 f"{self.n(x.get('median_gap_bps'), 1)} bp", f"{self.n(x.get('mean_gap_bps'), 1, signed=True)} bp"]
                for x in self.rows("costs.practice_by_ticker")]
        if prac:
            blocks.append(("table", (["Ticker", "Practice fills", "Median gap", "Average gap"], prac)))
        advice = self.t(*COST_ADVICE.get(str(lookup(self.r, "costs.advice")), (None,)))
        if advice:
            blocks.append(("p", advice))
        return blocks

    def calibration_blocks(self) -> list[tuple[str, Any]]:
        rows = []
        for f in self.rows("calibration.families"):
            status = ("gross" if f.get("gross_bias") else "warning" if f.get("warning") else
                      "ok" if f.get("enough") else "few")
            gap = (f"{self.pct(f.get('diff'), signed=True)} ({self.pct(f.get('lo90'), signed=True)} to "
                   f"{self.pct(f.get('hi90'), signed=True)})") if _is_num(f.get("diff")) else "—"
            rows.append([self.label(f.get("label") or f.get("family", "")), self.n(f.get("n")),
                         self.pct(f.get("mean_p")), self.pct(f.get("hit_rate")), gap, CALIBRATION_STATUS[status]])
        blocks: list[tuple[str, Any]] = [("h", "Calibration: are the stated odds honest?")]
        if rows:
            blocks.append(("table", (["Forecast family", "Scored", "Said", "Came true",
                                      f"Gap ({self.pct(0.9)} range)", "Status"], rows)))
        blocks.append(("p", self.t(
            "All forecasts: {calibration.pooled.n:int} scored; they said {calibration.pooled.mean_p:pct0} on average and "
            "{calibration.pooled.hit_rate:pct0} came true. A warning needs {calibration.min_forecasts:int} scored "
            "forecasts in a family; a gap wholly beyond {calibration.gross_tolerance:pct0} is a gross bias, which would "
            "fail the go-live rule.", "No forecasts have been scored yet.")))
        return blocks

    def drift_blocks(self) -> list[tuple[str, Any]]:
        rows = []
        for d in self.rows("drift"):
            won = f"{self.pct(d.get('win_rate'))} ({self.pct(d.get('base_win_rate'))})"
            avg = (f"{self.pct(d.get('mean_pct'), 2, signed=True, points=True)} "
                   f"({self.pct(d.get('base_mean_pct'), 2, signed=True, points=True)})")
            rows.append([self.label(d.get("label") or d.get("family", "")), self.n(d.get("n")), won, avg,
                         DRIFT_STATUS.get(str(d.get("status")), "—")])
        blocks: list[tuple[str, Any]] = [("h", "Base-rate drift")]
        if rows:
            blocks.append(("table", (["Rule", "Resolved", "Won (base rate)", "Average (base rate)", "Status"], rows)))
        blocks.append(("p", self.t("Drift is actionable from {drift_min_signals:int} resolved results; before that a "
                                   "difference is only an early sign.", "No rule has a base rate to compare yet.")))
        return blocks

    def map_blocks(self, maps: list[dict]) -> list[tuple[str, Any]]:
        blocks: list[tuple[str, Any]] = [("h", "Recalibration maps")]
        due = [m for m in maps if m.get("status") != "identity"]
        if not due:
            largest = max(maps, key=lambda m: m.get("n") or 0, default=None)
            blocks.append(("p", self.t(
                "Every family keeps the identity map (the stated odds as they are): a map needs "
                "{calibration.map_min_forecasts:int} scored forecasts in a family, and the largest, {big}, has "
                "{big_n:int}.", "Every family keeps the identity map (the stated odds as they are).",
                big=self.label(largest.get("label")) if largest else None, big_n=largest.get("n") if largest else None)))
            return blocks
        rows, lines = [], []
        for m in due:
            rec = "adopt the map" if m.get("status") == "recommend map" else "keep the identity map"
            rows.append([self.label(m.get("label") or m.get("family", "")), self.n(m.get("n")),
                         self.n(m.get("lr_p"), 3), self.n(m.get("oos_gain"), 4, signed=True), rec])
            if m.get("status") == "recommend map":
                for x in m.get("mapped") or []:
                    lines.append(f"{self.label(m.get('label', ''))}: {self.pct(x.get('stated'))} becomes "
                                 f"{self.pct(x.get('recalibrated'))}.")
        blocks.append(("table", (["Family", "Scored", "Test p-value", "Out-of-sample gain", "Recommendation"], rows)))
        if lines:
            blocks.append(("ul", lines))
        blocks.append(("p", "A map is recommended only when the test rejects the stated odds and the map scores better "
                            "on the newer half of the forecasts. Nothing is applied until you decide."))
        return blocks

    def module_review_blocks(self) -> list[tuple[str, Any]]:
        w = "module_reviews.w10"
        m = "module_reviews.m2"
        items = [
            self.t("W10: back in the shadow ledger since {" + w + ".disabled.date:date}: {" + w + ".disabled.reason}.",
                   None) if lookup(self.r, w + ".disabled") else
            self.t("W10: active. Its worst trade so far returned {" + w + ".worst_return:spct1} (the kill switch fires "
                   "at {" + w + ".single_trade_limit:pct0}); its realized result is {" + w + ".cum_pnl:smoney} (the "
                   "limit is {" + w + ".cum_limit_usd:money}).",
                   "W10: active, with no closed trades yet; its kill switch fires at one trade down "
                   "{" + w + ".single_trade_limit:apct0}.", "W10: active."),
            self.t("M2 (trend book): {" + m + ".drawdown:pct1} below its peak (review at {" + m + ".review_drawdown:pct0}"
                   "); Sharpe {" + m + ".sharpe:num2} over {" + m + ".months:int} months (pause below "
                   "{" + m + ".pause_sharpe:num1} once {" + m + ".window:int} months exist).",
                   "M2 (trend book): {" + m + ".drawdown:pct1} below its peak (review at {" + m + ".review_drawdown:pct0}"
                   "); too few months for a Sharpe yet.", None),
        ]
        paused = _paused_line(self.reg, [p for p in self.rows("module_reviews.paused") if p.get("module") != "W10"])
        items = [s for s in items + [paused] if s]
        return [("h", "Kill switches and module reviews"), ("ul", items) if items else ("p", "Nothing to review.")]


def render_quarterly(report: dict, ctx: dict) -> RenderedEmail:
    """Render the quarterly review (design §7, §8): failures first, then the go-live and ramp gates (the owner
    decides), results, the edge evidence on the wide book, κ̂, costs and slippage, calibration, base-rate drift,
    recalibration maps, kill switches and module reviews, the shadow books and rule changes (none: reviews only
    recommend).

    report: `traderec.reports.quarterly_report` (quarter, label, the gate keys shared with render_monthly, kappa,
    costs, calibration, drift, module_reviews, ramp, problems, failures, ...). Every key is optional except the
    period label. ctx: mode, ledger_head, data_asof, sources, constitution_version (as for `render_monthly`).
    """
    return _QuarterlyEmail(report, ctx).build()


class _AnnualEmail(_ReviewEmail):
    KIND = "ANNUAL"
    TITLE = "Annual review"
    PERIOD = "this year"

    def build(self) -> RenderedEmail:
        r = self.r
        failures = self.problems()
        decisions = self.decisions()
        label = self.period_label()
        problems = f" — {self.n(len(failures))} problem{'s' if len(failures) != 1 else ''}" if failures else ""
        subject = (f"[{self.MODE}][ANNUAL] {label} review with you{problems} — {self.n(len(decisions))} "
                   f"decision{'s' if len(decisions) != 1 else ''}")
        slope = lookup(r, "calibration.slope")
        candidates = [x for x in self.rows("retirement") if x.get("status") == "candidate"]
        box = [
            ("PROBLEMS", f"{self.n(len(failures))}, listed first below" if failures else "None this year"),
            ("RESULT", self.t("{nav:money}: {ret_period:spct2} this year; SPY {spy_ret_period:spct2}; T-bills "
                              "{tbill_ret_period:spct2}", "{nav:money}: {ret_period:spct2} this year", "{nav:money}")
             or "Not available"),
            ("TRADES", self.t("{trades_year:int} of the {budget:int} allowed", "{trades_year:int}") or "Not available"),
            ("CALIBRATION", self.t("slope {calibration.slope.b:num2}") if isinstance(slope, dict)
             else "Too few scored forecasts for a slope"),
            ("RETIREMENTS", ", ".join(f"{self.label(x.get('module'))}: candidate" for x in candidates) if candidates
             else "None recommended"),
            ("W10", W10_ADVICE_SHORT.get(str(lookup(r, "w10.recommendation")), "Keep")),
            ("M2", M2_STATUS_SHORT.get(str(lookup(r, "m2.status")), "No trigger")),
            ("STATUS", f"{self.MODE} · stage {self.label(r.get('stage') or 'paper')} · constitution "
                       f"v{self.label(self.ctx.get('constitution_version') or 'unknown')}"),
        ]
        blocks: list[tuple[str, Any]] = [("banner", LIVE_MONTHLY_BANNER if self.live else PAPER_MONTHLY_BANNER),
                                         ("box", box), ("h", "Problems first")]
        blocks.append(("ul", failures) if failures else ("p", "None this year."))
        blocks += [("h", "Decisions for you"), ("ol", decisions),
                   ("p", "These are recommendations. Nothing changes until you decide.")]
        blocks += [("h", "The year's results"), self.results_table()]
        blocks += [("p", s) for s in (
            self.t("Portfolio value: {nav:money}. The deepest drop from the peak this year was "
                   "{max_drawdown_period:pct1}.", "Portfolio value: {nav:money}.", None),) if s]
        blocks += self.trades_blocks()
        blocks += self.calibration_blocks()
        blocks += self.retirement_blocks()
        blocks += self.w10_blocks()
        blocks += self.m2_blocks()
        blocks += self.budget_blocks()
        blocks += [("h", "Rule changes"), ("p", self.t(
            "Nothing changes automatically. A parameter changes only if the change holds before and after "
            "{rules_hold_since:year} and clears the multiple-testing bar for the number of variants tried, after a "
            "forward comparison of at least {change_forward_months:int} months (design §8). Nothing changes because "
            "of one good or bad month.",
            "Nothing changes automatically (design §8). Nothing changes because of one good or bad month.")),
            ("footer", self.footer())]
        year = str(r.get("year", ""))
        return self.email(subject, blocks, failures[0] if failures else f"{label} review with you.",
                          {"year": year, "slug": f"annual-{year}".rstrip("-"), "failures": len(failures),
                           "decisions": len(decisions)})

    def decisions(self) -> list[str]:
        r = self.r
        out = [self.t(*W10_ADVICE.get(str(lookup(r, "w10.recommendation")), W10_ADVICE["keep"])) or
               W10_ADVICE["keep"][-1]]
        out.append(self.t(*M2_ADVICE.get(str(lookup(r, "m2.status")), M2_ADVICE["ok"])) or M2_ADVICE["ok"][-1])
        candidates = [x for x in self.rows("retirement") if x.get("status") == "candidate"]
        if candidates:
            out += [f"Retire {self.label(x.get('module'))}? Its chance of a real edge is {self.pct(x.get('p_positive'))} "
                    f"after {self.n(x.get('trades'))} trades, and its shadow evidence is negative too. Retiring needs "
                    "your decision (or a documented thesis invalidation)." for x in candidates]
        else:
            out.append("Keep every module: no retirement test fires. Retirement also follows a documented thesis "
                       "invalidation, which is your call.")
        slope = lookup(r, "calibration.slope")
        if isinstance(slope, dict) and _is_num(slope.get("b_hi90")) and float(slope["b_hi90"]) < 1.0:
            out.append("Calibration: the forecasts are over-confident (the slope is below one). Consider shrinking the "
                       "frozen forecast probabilities toward the base rates at a quarterly review.")
        elif isinstance(slope, dict) and _is_num(slope.get("b_lo90")) and float(slope["b_lo90"]) > 1.0:
            out.append("Calibration: the forecasts are timid (the slope is above one). Consider bolder frozen "
                       "probabilities at a quarterly review.")
        else:
            out.append("Calibration: no change; the slope gives no reason to move the frozen forecast probabilities.")
        if (self.num("budget_hits") or 0) > 0 or (self.num("positions_hits") or 0) > 0:
            out.append(self.t("Trade budget: the budget of {budget:int} bound {budget_hits:int} times and the open-position "
                              "cap of {max_open_positions:int} bound {positions_hits:int} times this year. Review both "
                              "with the evidence below.") or "Trade budget: review the caps that bound this year.")
        else:
            out.append(self.t("Hurdle and budget: keep the {hurdle_bp:int} bp hurdle and the budget of {budget:int} "
                              "trades a year. Neither bound this year, and every module so far is a policy module, "
                              "which the hurdle exempts.", "Hurdle and budget: keep both.") or "")
        return [s for s in out if s]

    def calibration_blocks(self) -> list[tuple[str, Any]]:
        slope = lookup(self.r, "calibration.slope")
        if isinstance(slope, dict):
            b_lo, b_hi = _fnum(slope, "b_lo90"), _fnum(slope, "b_hi90")
            verdict = ("over-confident: the stated odds are too extreme" if b_hi is not None and b_hi < 1.0 else
                       "timid: the stated odds could be bolder" if b_lo is not None and b_lo > 1.0 else
                       "consistent with honest odds")
            s = self.t("Calibration slope {calibration.slope.b:num2} (" + self.pct(0.9) + " range "
                       "{calibration.slope.b_lo90:num2} to {calibration.slope.b_hi90:num2}) on "
                       "{calibration.slope.n:int} scored forecasts: " + verdict + ". A slope of one means the stated "
                       "odds are right; below one, too extreme.")
        else:
            s = self.t("Too few scored forecasts for a calibration slope yet ({calibration.pooled.n:int} of the "
                       "{calibration.min_slope_forecasts:int} needed, with at least two different stated odds).",
                       "Too few scored forecasts for a calibration slope yet.")
        blocks: list[tuple[str, Any]] = [("h", "Calibration slope"), ("p", s or "")]
        citl = self.t("Overall the forecasts said {calibration.pooled.mean_p:pct0} and {calibration.pooled.hit_rate:pct0} "
                      "came true.", None)
        if citl:
            blocks.append(("p", citl + (" Calibration counts as verified for the full-size ramp."
                                        if lookup(self.r, "calibration.verified") else "")))
        return blocks

    def retirement_blocks(self) -> list[tuple[str, Any]]:
        rows = [[self.label(x.get("module", "")), self.n(x.get("trades")), self.n(x.get("months")),
                 self.pct(x.get("p_positive")), self.pct(x.get("shadow_p_positive")),
                 RETIRE_STATUS.get(str(x.get("status")), "—")] for x in self.rows("retirement")]
        blocks: list[tuple[str, Any]] = [("h", "Retirements")]
        if rows:
            blocks.append(("table", (["Module", "Trades", "Months", "Chance of an edge", "Shadow evidence", "Status"],
                                     rows)))
        blocks.append(("p", self.t(
            "A module becomes a retirement candidate when its chance of a real edge falls below {retire_edge:pct0} after "
            "at least {retire_min_trades:int} trades and {retire_min_months:int} months, and its shadow evidence is "
            "negative too. Never on a losing streak alone.",
            "A module becomes a retirement candidate only on the pre-registered tests, never on a losing streak.")))
        return blocks

    def w10_blocks(self) -> list[tuple[str, Any]]:
        w = self.r.get("w10") if isinstance(self.r.get("w10"), dict) else {}
        rec = w.get("record") if isinstance(w.get("record"), dict) else {}
        rows = []
        for h in ("60", "90"):
            x = rec.get(h) if isinstance(rec.get(h), dict) else {}
            ref = x.get("reference") if isinstance(x.get("reference"), dict) else {}
            rows.append([f"{self.n(float(h))} days", self.n(x.get("scored")), self.pct(x.get("mean_ret"), 2, signed=True),
                         self.pct(x.get("win_rate")),
                         f"{self.pct(ref.get('mean_pct'), 2, signed=True, points=True)}; {self.pct(ref.get('win_rate'))}"
                         f" won; random days {self.pct(ref.get('placebo_mean_pct'), 2, signed=True, points=True)}"])
        since = self.reg.fmt(w.get("reference_since"), "year") if _is_num(w.get("reference_since")) else None
        head = ["Held", "Scored", "Average", "Won", f"Reference since {since}" if since else "Reference"]
        blocks: list[tuple[str, Any]] = [
            ("h", "W10: the annual re-decision"),
            ("p", self.t("The shadow record holds every uptrend crash day: {w10.events:int} so far, {w10.events_year:int} "
                         "this year, each scored at both horizons (including days when W10 was already open).",
                         "The shadow record holds every uptrend crash day, scored at both horizons.")),
            ("table", (head, rows)),
            ("p", self.t("W10's own trades: {w10.trades:int} closed; realized result {w10.cum_pnl:smoney}. The "
                         "recommendation is the first decision above.",
                         "W10 has no closed trades yet. The recommendation is the first decision above.")),
        ]
        return [b for b in blocks if b[1]]

    def m2_blocks(self) -> list[tuple[str, Any]]:
        return [("h", "M2: review and pause triggers"), ("p", self.t(
            "The trend book is {m2.drawdown:pct1} below its peak (the deepest drop so far: {m2.max_drawdown:pct1}); the "
            "design reviews it at {m2.review_drawdown:pct0}. Its Sharpe over the last {m2.months:int} months is "
            "{m2.sharpe:num2}; it pauses to the shadow ledger below {m2.pause_sharpe:num1} once {m2.window:int} months "
            "exist.",
            "The trend book is {m2.drawdown:pct1} below its peak; the design reviews it at {m2.review_drawdown:pct0}. "
            "Too few months for a Sharpe yet.", "No trend-book months to review yet.") or "")]

    def budget_blocks(self) -> list[tuple[str, Any]]:
        return [("h", "Hurdle and trade budget"), ("p", self.t(
            "{trades_year:int} trades this year against a budget of {budget:int} (the design's target is "
            "{trades_target_low:int} to {trades_target_high:int} a year); at most {max_open_positions:int} open at once. "
            "The budget bound {budget_hits:int} times and the open-position cap {positions_hits:int} times. The "
            "{hurdle_bp:int} bp hurdle applies to discretionary trades only.",
            "{trades_year:int} trades this year against a budget of {budget:int}.", None) or
            "No trade counts in this review.")]


W10_ADVICE = {
    "keep": ("Keep W10 as a policy module (the default). It trades too rarely for any rule to test its edge, so the "
             "shadow record above is the evidence; its damage limits stay in force.",),
    "consider_shadow": ("Consider moving W10 back to the shadow ledger: at {w10.record.90.scored:int} scored crash days, "
                        "its record averages {w10.record.90.mean_ret:spct2} at ninety days, below random entry days "
                        "({w10.record.90.reference.placebo_mean_pct:sppct2} since {w10.reference_since:year}).",
                        "Consider moving W10 back to the shadow ledger: its record is below random entry days.",),
    "back_to_shadow": ("W10's kill switch fired on {w10.disabled.date:date} ({w10.disabled.reason}). It stays in the "
                       "shadow ledger unless you bring it back.",
                       "W10's kill switch fired. It stays in the shadow ledger unless you bring it back.",),
}
W10_ADVICE_SHORT = {"keep": "Keep as a policy module", "consider_shadow": "Consider the shadow ledger",
                    "back_to_shadow": "In the shadow ledger (kill switch)"}
M2_ADVICE = {
    "ok": ("Trend book (M2): no trigger; keep it.",),
    "review": ("Trend book (M2): review it. It is {m2.drawdown:pct1} below its peak, at or past the "
               "{m2.review_drawdown:pct0} review trigger.", "Trend book (M2): review it (drawdown trigger)."),
    "pause": ("Trend book (M2): pause it to the shadow ledger, as the design says: its Sharpe over {m2.window:int} "
              "months is {m2.sharpe:num2}, below {m2.pause_sharpe:num1}.",
              "Trend book (M2): pause it to the shadow ledger (Sharpe trigger)."),
}
M2_STATUS_SHORT = {"ok": "No trigger", "review": "Review due", "pause": "Pause recommended"}


def render_annual(report: dict, ctx: dict) -> RenderedEmail:
    """Render the annual review with the owner (design §3, §8): failures first, the decisions to take (W10's
    re-decision against its shadow record, M2's triggers, retirements, calibration, the hurdle and the budget), then
    the year's results, the calibration slope, retirement tests, W10's record at 60 and 90 days, M2, the budget and
    the rule-change bar.

    report: `traderec.reports.annual_report`. Every key is optional except the year label. ctx: as for
    `render_monthly`.
    """
    return _AnnualEmail(report, ctx).build()
