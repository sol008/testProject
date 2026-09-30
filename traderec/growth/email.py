"""The Sunday growth email and the Rule E exit email (design v4 §9, §3a.7; track 32 §4.2, §4.4, §6).

`render_growth(facts, ctx)` renders the Sunday email from the facts record the weekly job writes to
`state.growth.last_facts` (docs/phase-c/growth.md §4); `render_rule_e(facts, ctx)` the <= 10-line exit-only email
from `traderec.growth.rule_e`'s facts. No LLM: templates from `traderec.email_text.growth` filled from the facts
through the number registry, as every other email.

Value AND slot (design §9 "Validator", §10). `slot_specs(facts)` (and `rule_e_slot_specs`) lists every numbered
phrase of the email: a template with `{field}` placeholders and, for each field, the value from the facts and the
format spec. The renderer fills the templates from that table, and the validator (`traderec.validator.check_slots`,
kinds GROWTH and RULE_E) rebuilds the same table from `meta["facts"]` with its own formatter and requires each phrase
to show exactly those values wherever it occurs; every phrase is required, so the risk box cannot be dropped when a
leveraged fund is bought or held. The table is built from the facts alone, never from the rendered text.

ctx keys (all optional): mode ("paper" | "live"), ledger_head, issue_urls ({intent_id: url}), issue_url (Rule E),
data_asof, sources, constitution_version, limited_margin (default: facts["limited_margin"], else True).
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Callable

from traderec.email_text import growth as text
from traderec.emails import (DISCLAIMER, LIVE_BANNER, PAPER_BANNER, QUEUE_STEP, TICKER_NAMES, NumberRegistry,
                             _to_html, _to_text)
from traderec.types import RenderedEmail

__all__ = ["fill_slot", "render_growth", "render_rule_e", "rule_e_slot_specs", "slot_specs"]

_ANGLE = re.compile(r"<(\w+)>")
_FIELD = re.compile(r"\{(\w+)\}")


def _num(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def _lit(template: str, subs: dict[str, str]) -> str:
    """Substitute the `<name>` literals of a template (a ticker, an index name, "above"/"below")."""
    return _ANGLE.sub(lambda m: subs[m.group(1)], template)


def _slot(out: list[dict], key: str, template: str, fields: dict[str, tuple[Any, str]] | None = None, *,
          subs: dict[str, str] | None = None, literals: tuple[str, ...] = ()) -> dict | None:
    """Add a phrase to the slot table when every field has a value; return it (or None when a value is missing)."""
    fields = dict(fields or {})
    for name, (value, spec) in fields.items():
        if spec in ("str",):
            if value is None:
                return None
        elif _num(value) is None:
            return None
    subs = dict(subs or {})
    # field names are made unique per phrase (`{c}` -> `{c__why_SSO}`), so two legs' phrases never share a value
    suffix = re.sub(r"\W", "_", key)
    template = _FIELD.sub(lambda m: "{" + m.group(1) + "__" + suffix + "}", _lit(template, subs))
    slot = {"key": key, "template": template, "fields": {f"{name}__{suffix}": fs for name, fs in fields.items()},
            "literals": sorted({s for s in (*subs.values(), *literals) if any(ch.isdigit() for ch in s)})}
    out.append(slot)
    return slot


def fill_slot(slot: dict, fmt: Callable[[Any, str], str]) -> str:
    """The phrase with its fields formatted by `fmt(value, spec)` (the renderer's registry or the validator's)."""
    return slot["template"].format(**{name: fmt(value, spec) for name, (value, spec) in slot["fields"].items()})


def _index_name(index: str | None) -> str:
    return text.INDEX_NAMES.get(str(index or ""), str(index or "the index"))


def _day_label(iso_date: Any, fallback: str) -> str:
    """"Thu 1 Oct" for a template literal (the registry's short date style), or `fallback`."""
    try:
        d = date.fromisoformat(str(iso_date)[:10])
    except (TypeError, ValueError):
        return fallback
    return f"{d:%a} {d.day} {d:%b}"


def _fund_name(ticker: str, facts: dict) -> str:
    funds = (facts.get("risk") or {}).get("funds") or {}
    return str((funds.get(ticker) or {}).get("name") or TICKER_NAMES.get(ticker) or "fund")


def _leveraged(facts: dict) -> list[str]:
    """The funds the risk box must cover, from the facts alone: bought this week or held, in `required_for` order."""
    risk = facts.get("risk") or {}
    required = list(risk.get("required_for") or [])
    bought = {o.get("ticker") for o in ((facts.get("orders") or {}).get("step2") or [])}
    held = {s.get("ticker") for s in (facts.get("sleeves") or []) if (_num(s.get("held_usd")) or 0.0) > 0}
    return [t for t in required if t in bought or t in held]


def slot_specs(facts: dict) -> list[dict]:
    """The Sunday email's numbered phrases, from the facts record alone (see the module docstring).

    Each entry: {"key", "template" (with `{field}` placeholders only), "fields": {field: (value, spec)},
    "literals": [data-layer strings with digits that the template shows verbatim]}.
    """
    P = text.PHRASES
    out: list[dict] = []
    summary = facts.get("summary") or {}
    n_orders = int(_num(summary.get("orders")) or 0)
    if n_orders:
        _slot(out, "summary", P["summary" if n_orders != 1 else "summary_one"],
              {"n_rec": (1, "int"), "n_orders": (n_orders, "int")})
    else:
        _slot(out, "summary", P["summary_none"])
    nav, gov = facts.get("nav") or {}, facts.get("governor") or {}
    _slot(out, "nav", P["nav"], {"nav": (nav.get("total"), "money"), "ira": (nav.get("ira"), "money"),
                                 "taxable": (nav.get("taxable"), "money")})
    _slot(out, "book", P["book"], {"dd": (nav.get("drawdown"), "pct1"), "peak": (nav.get("peak"), "money"),
                                   "G": (gov.get("G"), "num2")})
    _slot(out, "governor", P["governor"], {"full": (gov.get("full_until"), "pct0"), "floor": (gov.get("floor"), "num2"),
                                           "floor_at": (gov.get("floor_at"), "pct0"),
                                           "hs": (gov.get("hard_stop_at"), "npct0")})
    for s in facts.get("sleeves") or []:
        t = str(s.get("ticker") or "")
        _slot(out, f"row_{t}", P["row"], {"tp": (s.get("target_pct"), "ppct1"), "tu": (s.get("target_usd"), "money"),
                                          "h": (s.get("held_usd"), "money"), "d": (s.get("delta_usd"), "smoney")},
              subs={"ticker": t, "state": str(s.get("state") or "")})
        why = s.get("why") or {}
        if s.get("name", "").startswith("G1") and why.get("signal") and s.get("changed"):
            pct = _num(why.get("pct_vs_sma"))
            _slot(out, f"why_{t}", P["why_g1"], {"c": (why.get("close"), "num0"), "p": (pct, "appct1"),
                                                 "n": (why.get("sma_days"), "int"), "s": (why.get("sma200"), "num0")},
                  subs={"index": _index_name(why.get("index")), "ab": "above" if (pct or 0.0) >= 0 else "below"})
        elif s.get("name", "").startswith("G2") and why.get("signal") and s.get("changed"):
            _slot(out, f"why_{t}", P["why_g2"], {"wc": (why.get("weekly_close"), "money"), "w": (why.get("ma_weeks"), "int"),
                                                 "ma": (why.get("ma10w"), "money"), "n": (why.get("sma_days"), "int"),
                                                 "sma": (why.get("sma200"), "money")},
                  subs={"ab1": "above" if why.get("above_ma10w") else "below",
                        "ab2": "above" if why.get("above_sma200") else "below"})
        if s.get("name", "").startswith("G2") and (_num(why.get("vol_cut_factor")) or 1.0) < 1.0:
            _slot(out, "why_vol", P["why_vol"], {"vol": (why.get("vol60_pct"), "ppct0"),
                                                 "factor": (why.get("vol_cut_factor"), "num2")})
        if s.get("name", "").startswith("G3") and s.get("state") == "reserve":
            _slot(out, "gems", P["gems_promoted" if why.get("promoted_rules") else "gems"],
                  {"g3": (why.get("g3_reserve_usd"), "money"), "cash": (why.get("cash_sleeve_usd"), "money")})
    _gems_slots(out, facts)
    orders = facts.get("orders") or {}
    for o in orders.get("step1") or []:
        t = str(o.get("ticker") or "")
        if o.get("action") == "sell_all":
            _slot(out, f"s1_{t}", P["sell_all"], {"h1": (o.get("held_usd"), "money")}, subs={"ticker": t})
        else:
            _slot(out, f"s1_{t}", P["sell_usd"], {"s1": (o.get("usd"), "money")}, subs={"ticker": t})
    for o in orders.get("step2") or []:
        t = str(o.get("ticker") or "")
        _slot(out, f"s2_{t}", P["buy"], {"b": (o.get("usd"), "money")}, subs={"ticker": t})
    if orders.get("step2"):
        _slot(out, "cash_rule", P["cash_rule"], {"mh": (orders.get("market_hours_cash_frac"), "pct0"),
                                                 "q": (orders.get("queued_cash_frac"), "pct0")})
    for o in orders.get("deferred") or []:
        t = str(o.get("ticker") or "")
        if o.get("action") == "sell_all":
            _slot(out, f"def_{t}", P["sell_all"].replace("Sell all", "next Sunday: sell all"),
                  {"h1": (o.get("held_usd"), "money")}, subs={"ticker": t})
        else:
            _slot(out, f"def_{t}", P["deferred"], {"d": (o.get("usd"), "money")},
                  subs={"ticker": t, "verb": "buy" if o.get("action") == "buy" else "sell"})
    for o in orders.get("dropped") or []:
        t = str(o.get("ticker") or "")
        _slot(out, f"drop_{t}", P["dropped"], {"x": (o.get("usd"), "money")},
              subs={"ticker": t, "verb": "buy" if o.get("action", "buy") == "buy" else "sell"})
    for o in orders.get("skipped") or []:
        t = str(o.get("ticker") or "")
        _slot(out, f"skip_{t}", P["skipped"], {"x": (o.get("usd"), "amoney")}, subs={"ticker": t})
    risk = facts.get("risk") or {}
    _slot(out, "crash", P["crash"], {"year": (risk.get("crash_day_year"), "year"),
                                     "crash": (risk.get("crash_day_loss_pct"), "ppct1")})
    _slot(out, "hard_stop", P["hard_stop"], {"hs": (risk.get("drawdown_limit_pct"), "nppct0")})
    ira = risk.get("ira") or {}
    if ira.get("age") is not None:
        _slot(out, "ira", P["ira"], {"penalty": (ira.get("penalty_pct"), "ppct0")}, subs={"age": str(ira["age"])})
    funds = risk.get("funds") or {}
    for t in _leveraged(facts):
        f = funds.get(t) or {}
        mult = int(_num(f.get("multiple")) or 1)
        index = str(f.get("index") or _index_name(None))
        if mult > 1:
            crash_day = _num(risk.get("crash_day_index_pct"))
            _slot(out, f"rb_reset_{t}", P["rb_reset"], {"up": (f.get("chop_up_pct"), "ppct0"),
                                                       "down": (f.get("chop_down_pct"), "ppct1"),
                                                       "chop": (f.get("chop_fund_pct"), "appct1")},
                  subs={"ticker": t, "mult": f"{mult}x", "index": index})
            _slot(out, f"rb_wipeout_{t}", P["rb_wipeout"],
                  {"wipe": (f.get("wipeout_index_day_pct"), "ppct0"), "crash_day": (crash_day, "ppct1"),
                   "year": (risk.get("crash_day_year"), "year"),
                   "crash_fund": (None if crash_day is None else abs(mult * crash_day), "ppct0")},
                  subs={"ticker": t})
            _slot(out, f"rb_history_{t}", P["rb_history"], {"dd": (f.get("worst_drawdown_pct"), "appct0"),
                                                           "rule_dd": (f.get("rule_drawdown_pct"), "appct0")},
                  subs={"ticker": t, "when": str(f.get("worst_drawdown_when") or "in its history")})
            _slot(out, f"rb_cost_{t}", P["rb_cost"], {"fee": (f.get("fee_pct"), "ppct2"),
                                                     "borrow": (f.get("borrow_pct"), "ppct0")}, subs={"ticker": t})
        else:
            _slot(out, f"rb_gap_{t}", P["rb_gap"], {"gap": (f.get("weekend_gap_worst_pct"), "ppct1"),
                                                   "five": (f.get("gap_threshold_pct"), "ppct0"),
                                                   "odds": (f.get("gap_over_5pct_odds_pct"), "ppct1")},
                  subs={"ticker": t, "when": str(f.get("weekend_gap_when") or "on record")})
            _slot(out, f"rb_switch_{t}", P["rb_switch"], {"dd": (f.get("switch_drawdown_pct"), "appct0"),
                                                         "fdd": (f.get("forward_drawdown_pct"), "appct0")},
                  subs={"when": str(f.get("switch_drawdown_when") or "its history")})
            _slot(out, f"rb_fee_{t}", P["rb_fee"], {"fee": (f.get("fee_pct"), "ppct2")},
                  subs={"ticker": t, "mult": f"{mult}x"})
    for src in facts.get("sources") or []:
        t = str(src.get("ticker") or "")
        if src.get("a") is None or src.get("b") is None:
            continue
        spec = "money" if t.upper().startswith("BTC") else "num0"
        label = text.SOURCE_LABELS.get(str(src.get("b_source") or ""), str(src.get("b_source") or "the second source"))
        _slot(out, f"src_{t}", P["source"], {"p": (src.get("a"), spec), "q": (src.get("b"), spec)},
              subs={"index": _index_name(t), "source": label})
    re_facts = facts.get("rule_e") or {}
    for sc in re_facts.get("scored") or []:
        t = str(sc.get("ticker") or "")
        _slot(out, f"re_{t}", P["rule_e_score"], {"price": (sc.get("exit_price"), "money2"),
                                                  "alt": (sc.get("alt_price"), "money2"),
                                                  "edge": (sc.get("edge_pct"), "sppct2")},
              subs={"ticker": t, "when": _day_label(sc.get("exit_date"), "its exit day")})
    if _num(re_facts.get("count_year")):
        _slot(out, "re_count", P["rule_e_count"], {"n": (re_facts.get("count_year"), "int"),
                                                   "max": (re_facts.get("max_per_year"), "int")})
    return out


def _gems_slots(out: list[dict], facts: dict) -> None:
    """The gems paragraph's phrases (design v4 §3 G3; Phase C4a) from `facts["g3"]`: the promoted rules' line, one
    per live slot (a fund slot names its z, a trust slot has none), and one tally per rule with closed shadow trades.
    A pending slot without a buy this week has no numbers of its own (the renderer's waiting line covers it)."""
    P = text.PHRASES
    g3 = facts.get("g3") or {}
    if not isinstance(g3, dict):
        return
    if g3.get("promoted_rules"):
        _slot(out, "gems_live", P["gems_live"], {"open": (g3.get("single_names_open"), "int"),
                                                 "max": (g3.get("single_names_max"), "int"),
                                                 "slots": (g3.get("slots_usd"), "money"), "sgov": (g3.get("sgov_usd"), "money")})
    for slot in g3.get("slots") or []:
        t, status = str(slot.get("ticker") or ""), str(slot.get("status") or "")
        trust = slot.get("z") is None
        fields = {"usd": (slot.get("usd"), "money"), "disc": (slot.get("discount"), "spct1")}
        if not trust:
            fields["z"] = (slot.get("z"), "snum2")
        if status == "pending_entry":
            if (_num(slot.get("usd")) or 0.0) <= 0:
                continue
            _slot(out, f"gems_slot_{t}", P["gems_slot_pending_trust" if trust else "gems_slot_pending"], fields,
                  subs={"ticker": t, "when": _day_label(slot.get("signal_date"), "its signal day")})
        else:
            subs = {"ticker": t, "state": "open" if status == "open" else "selling next",
                    "entry": _day_label(slot.get("entry"), "its entry day")}
            if not trust:
                subs["due"] = _day_label(slot.get("exit_due"), "the time stop")
            _slot(out, f"gems_slot_{t}", P["gems_slot_trust" if trust else "gems_slot"], fields, subs=subs)
    for name, sh in (g3.get("shadow") or {}).items():
        if not isinstance(sh, dict) or int(_num(sh.get("n")) or 0) <= 0:
            continue
        prom = sh.get("promotion") or {}
        label = str(sh.get("label") or name)
        fields = {"n": (sh.get("n"), "int"), "k": (prom.get("checks_ok"), "int"), "m": (prom.get("checks_total"), "int")}
        if _num(sh.get("mean_excess")) is not None:
            _slot(out, f"gems_tally_{name}", P["gems_tally"], {**fields, "ex": (sh.get("mean_excess"), "spct2")},
                  subs={"rule": label, "basis": str(sh.get("basis") or "random entry")})
        else:
            _slot(out, f"gems_tally_{name}", P["gems_tally_partial"], fields, subs={"rule": label})


def rule_e_slot_specs(facts: dict) -> list[dict]:
    """The Rule E email's numbered phrases, from its facts alone (`traderec.growth.rule_e`)."""
    P = text.PHRASES
    out: list[dict] = []
    for leg in facts.get("legs") or []:
        t = str(leg.get("ticker") or "")
        _slot(out, f"re_trigger_{t}", P["re_trigger"], {"c": (leg.get("close"), "num0"), "p": (leg.get("pct_vs_sma"), "appct1"),
                                                        "n": (leg.get("sma_days"), "int"), "s": (leg.get("sma200"), "num0")},
              subs={"index": _index_name(leg.get("index"))})
        _slot(out, f"re_sell_{t}", P["re_sell"], {"h": (leg.get("held_usd"), "money")}, subs={"ticker": t})
    _slot(out, "re_count", P["re_count"], {"n": (facts.get("count_year"), "int"), "max": (facts.get("max_per_year"), "int"),
                                           "w": (facts.get("max_per_week"), "int")})
    return out


# ------------------------------------------------------------------------------------------- the Sunday email

class _GrowthEmail:
    def __init__(self, facts: dict, ctx: dict) -> None:
        self.f = dict(facts or {})
        self.ctx = dict(ctx or {})
        self.reg = NumberRegistry()
        self.live = str(self.ctx.get("mode") or ("live" if self.f.get("label") == "LIVE" else "paper")).lower() == "live"
        self.MODE = "LIVE" if self.live else "PAPER"
        self.slots = {s["key"]: s for s in slot_specs(self.f)}
        self.orders = self.f.get("orders") or {}
        self.step1 = list(self.orders.get("step1") or [])
        self.step2 = list(self.orders.get("step2") or [])
        self.n_orders = len(self.step1) + len(self.step2)
        self.date = str(self.f.get("date") or "")
        self.execute = str(self.f.get("execute_date") or "")
        self.holiday = self.f.get("holiday")
        lm = self.ctx.get("limited_margin", self.f.get("limited_margin", True))
        self.limited_margin = True if lm is None else bool(lm)
        self.trade_id = f"G-{self.date}"
        self.issue_urls: dict[str, str] = dict(self.ctx.get("issue_urls") or {})
        self.problems: list[str] = []
        self.week = self.reg.fmt_num(self.f.get("week") or 0) if _num(self.f.get("week")) else "?"
        self.step1_label = self.reg.register("Step 1")
        self.step2_label = self.reg.register("Step 2")
        max_orders = int(_num(self.orders.get("max_orders")) or 3)
        if self.n_orders > max_orders:
            self.problems.append(f"{self.n_orders} orders exceed the {max_orders} an email may carry")
        funds = (self.f.get("risk") or {}).get("funds") or {}
        for t in _leveraged(self.f):
            if t not in funds:
                self.problems.append(f"risk box: no fund numbers for {t} in the facts")

    # ---------------------------------------------------------------- helpers
    def phrase(self, key: str) -> str | None:
        slot = self.slots.get(key)
        if slot is None:
            return None
        for lit in slot["literals"]:
            self.reg.register(lit)
        return fill_slot(slot, self.reg.fmt)

    def date_(self, d: Any, style: str = "short") -> str:
        try:
            return self.reg.fmt_date(d, style)
        except (TypeError, ValueError):
            return self.reg.register(str(d))

    def buy_day(self) -> str:
        """The day Step 2 is placed: the execute date, or its next weekday without limited margin (Tuesday)."""
        from datetime import timedelta
        try:
            d = date.fromisoformat(self.execute[:10])
        except ValueError:
            return "the next trading day"
        if not self.limited_margin:
            d += timedelta(days=1)
            while d.weekday() >= 5:
                d += timedelta(days=1)
        return self.reg.fmt_date(d)

    # ---------------------------------------------------------------- pieces
    def subject(self) -> str:
        tid = self.reg.register(self.trade_id)
        prefix = f"[{self.MODE}][GROWTH {tid}] week {self.week}:"
        if not self.n_orders:
            return f"{prefix} no change"
        n = self.reg.fmt_num(self.n_orders)
        what = f"{n} order{'s' if self.n_orders != 1 else ''}"
        if self.step1 and self.step2:
            when = f"{self.step1_label} tonight, {self.step2_label} {self.buy_day()} from 9:35 ET"
        elif self.step1:
            when = f"sells for the open on {self.date_(self.execute)}"
        else:
            when = f"buys on {self.buy_day()} from 9:35 ET"
        return f"{prefix} {what} — {when}"

    def headline(self) -> list[tuple[str, str]]:
        f = self.f
        nav, gov = f.get("nav") or {}, f.get("governor") or {}
        this_week = "no change" if not self.n_orders else self.phrase("summary").replace("This week: ", "").rstrip(".")
        size = (f"G {self.reg.fmt_num(gov.get('G'), decimals=2, strip=False)} · "
                f"{self.reg.fmt_pct(nav.get('drawdown') or 0.0, decimals=1)} below the peak"
                if _num(gov.get("G")) is not None else "not available")
        if gov.get("paused"):
            size += " · PAUSED after the hard stop (buys blocked until the review)"
        book = self.phrase("nav") or "not available"
        step1_when = f"tonight, or before 9:20 ET {self.date_(self.execute)}"
        step2_when = f"{self.buy_day()} from 9:35 ET, once {self.step1_label} shows Filled"
        window = f"{self.step1_label}: {step1_when} · {self.step2_label}: {step2_when}"
        rows = [("STATUS", f"{self.MODE} · GROWTH (growth book) · policy module · week {self.week} · decided "
                           f"{self.date_(self.date)} on the closes of {self.date_(f.get('friday') or self.date)}"),
                ("THIS WEEK", this_week), ("BOOK", book), ("SIZE", size), ("WINDOW", window)]
        return rows

    def target_table(self) -> tuple[list[str], list[list[str]]]:
        rows = []
        for s in self.f.get("sleeves") or []:
            t = str(s.get("ticker") or "")
            row = self.phrase(f"row_{t}")
            cells = row.split(" ") if row else [t, str(s.get("state") or ""), "—", "—", "—", "—"]
            sleeve = str(s.get("name") or "").split(" ")[0]
            if sleeve == "G3":
                sleeve = "G3 + cash" if s.get("state") == "reserve" else "G3 gems"
            rows.append([self.reg.register(sleeve), *cells])
        return ["Sleeve", "Fund", "State", "Target (% of IRA)", "Target $", "Now $", "Change"], rows

    def why_lines(self) -> list[str]:
        out: list[str] = []
        for s in self.f.get("sleeves") or []:
            t, name = str(s.get("ticker") or ""), str(s.get("name") or "")
            why = s.get("why") or {}
            if name.startswith("G3"):
                continue
            if not why.get("signal") and (name.startswith("G1") or name.startswith("G2")):
                reason = self.reg.register(str(why.get("reason") or "no data"))
                index = "Bitcoin" if name.startswith("G2") else _index_name(why.get("index"))
                out.append(f"{index}: no signal this week ({reason}), so {t} keeps its state ({s.get('state')}).")
                continue
            if not s.get("changed"):
                continue
            verb = text.STATE_WORDS.get((str(s.get("state")), True), f"is {s.get('state')}")
            phrase = self.phrase(f"why_{t}")
            if phrase is None:
                continue
            if name.startswith("G1"):
                out.append(f"On {self.date_(why.get('session') or self.f.get('friday') or self.date)} {phrase}: {t} "
                           f"{verb}" + (f" ({self.reg.register(str(why.get('reason')))})." if why.get("reason") else "."))
            else:
                out.append(f"On {self.date_(why.get('week_end') or self.date)} {phrase}: {t} {verb}.")
        vol = self.phrase("why_vol")
        if vol:
            out.append(vol + ".")
        if not out:
            out.append(text.STATIC["why_none"])
        book = self.phrase("book")
        gov = self.phrase("governor")
        if book:
            out.append(f"{book} ({gov})." if gov else f"{book}.")
        w10 = self.f.get("w10") or {}
        if w10.get("state") == "fired" and any(o.get("sleeve") == "W10" for o in self.step2):
            out.append(f"The crash-day buy (W10) fired on {self.date_(w10.get('signal_date') or self.date)}: its SPY "
                       "buy below comes from the cash fund and is held about three months; its exit comes in a later "
                       "Sunday email.")
        elif w10.get("state") in ("open", "pending_entry", "pending_exit") and w10.get("exit_due"):
            out.append(f"The crash-day buy (W10) holds SPY until {self.date_(w10['exit_due'])}; the daily run sends "
                       "its exit.")
        return out

    def gems_lines(self) -> list[str]:
        """The gems paragraph (design v4 §3 G3): the promoted rules' slots and orders, what waits, and each rule's
        shadow tally with its promotion test; a passed test says what the owner does next (no digits of its own)."""
        g3 = self.f.get("g3") or {}
        if not isinstance(g3, dict):
            return []
        out: list[str] = []
        live = self.phrase("gems_live")
        if live:
            out.append(live + ".")
        tails = {"buy": "gems_order_buy", "sell": "gems_order_sell", "deferred": "gems_order_deferred"}
        for slot in g3.get("slots") or []:
            phrase = self.phrase(f"gems_slot_{slot.get('ticker')}")
            if phrase:
                tail = text.STATIC.get(tails.get(str(slot.get("order") or ""), ""), "")
                out.append(phrase + "." + (f" {tail}" if tail else ""))
        for w in g3.get("waiting") or []:
            out.append(f"{w.get('ticker')}: its entry waits ({self.reg.register(str(w.get('why') or ''))}).")
        for name, sh in (g3.get("shadow") or {}).items():
            if not isinstance(sh, dict):
                continue
            label = str(sh.get("label") or name)
            phrase = self.phrase(f"gems_tally_{name}")
            out.append((phrase + ".") if phrase else _lit(text.STATIC["gems_none"], {"rule": label}))
            if (sh.get("promotion") or {}).get("passed") and str(sh.get("status")) != "live":
                out.append(_lit(text.STATIC["gems_passed"], {"rule": label}))
        return out

    def step1_lines(self) -> list[str]:
        out = []
        for o in self.step1:
            t = str(o.get("ticker") or "")
            phrase = self.phrase(f"s1_{t}") or f"Sell all {t}, market"
            why = text.REASON_WORDS.get(str(o.get("reason") or ""), "")
            out.append(f"{phrase}" + (f": {why}." if why else "."))
        return out

    def step2_lines(self) -> list[str]:
        out = []
        for o in self.step2:
            t = str(o.get("ticker") or "")
            phrase = self.phrase(f"s2_{t}") or f"Buy {t}, market, in dollars"
            why = text.REASON_WORDS.get(str(o.get("reason") or ""), "")
            out.append(f"{phrase}" + (f": {why}." if why else "."))
        return out

    def deferred_lines(self) -> list[str]:
        out = []
        for o in self.orders.get("deferred") or []:
            t = str(o.get("ticker") or "")
            phrase = self.phrase(f"def_{t}")
            why = self.reg.register(str(o.get("why") or ""))
            if phrase:
                out.append(f"Deferred to {phrase[0].lower() + phrase[1:]}" + (f" ({why})." if why else "."))
        for o in self.orders.get("dropped") or []:
            t = str(o.get("ticker") or "")
            phrase = self.phrase(f"drop_{t}")
            why = self.reg.register(str(o.get("why") or ""))
            if phrase:
                out.append(f"W10 {phrase}" + (f" ({why})." if why else "."))
        for o in self.orders.get("skipped") or []:
            phrase = self.phrase(f"skip_{o.get('ticker')}")
            reason = self.reg.register(str(o.get("reason") or ""))
            if phrase:
                out.append(f"{phrase}" + (f" ({reason})." if reason else "."))
        return out or [text.STATIC["deferred_none"]]

    def risk_blocks(self) -> list[tuple[str, Any]]:
        blocks: list[tuple[str, Any]] = []
        for t in _leveraged(self.f):
            name = self.reg.register(_fund_name(t, self.f))
            rows = [("FUND", f"Before you hold {t} ({name}): how it can hurt you")]
            for key, label in (("rb_reset", "RESET"), ("rb_wipeout", "ONE DAY"), ("rb_history", "HISTORY"),
                               ("rb_cost", "COST"), ("rb_gap", "GAP"), ("rb_switch", "SWITCH"), ("rb_fee", "FEE")):
                phrase = self.phrase(f"{key}_{t}")
                if phrase:
                    rows.append((label, phrase + "."))
            blocks.append(("box", rows))
        lines = []
        for key, lead in (("crash", "Crash risk: "), ("hard_stop", "The limit: ")):
            phrase = self.phrase(key)
            if phrase:
                lines.append(lead + phrase + ".")
        lines.append(text.STATIC["monday_gap"])
        ira = self.phrase("ira")
        if ira:
            lines.append(ira + ".")
        lines.append(text.STATIC["tax_ira"])
        blocks.append(("ul", lines))
        return blocks

    def steps(self) -> list[str]:
        S = text.STATIC
        if not self.n_orders:
            return [S["step_nothing"]]
        record = S["step_record"] if self.issue_urls else S["step_record_no_issue"]
        out = [S["step_open"]]
        out.append(S["step_sells"] if self.step1 else S["step_no_sells"])
        if self.step2:
            if self.step1:
                out.append(S["step_check"])
            out += [S["step_buys"], S["step_amount"]]
        out.append(record)
        if not self.limited_margin:
            out.append(S["tuesday"])
        return out[:7]

    def what_if(self) -> list[str]:
        S = text.STATIC
        items = [S["what_if_gap"]]
        if self.step1 and self.step2:
            items.append(S["what_if_queued"])
        if self.step2:
            items += [S["what_if_power"], S["what_if_dollars"]]
        items.append(S["what_if_missed"])
        items.append(S["what_if_holiday"])
        return items

    def source_lines(self) -> list[str]:
        out = []
        for src in self.f.get("sources") or []:
            t = str(src.get("ticker") or "")
            name = self.reg.register(_index_name(t))
            when = self.date_(src["date"]) if src.get("date") else "this week"
            phrase = self.phrase(f"src_{t}")
            if phrase:
                verdict = "agree" if src.get("agree") else "disagree, so no signal and the state was kept"
                out.append(f"{phrase} ({when}): {verdict}.")
            else:
                out.append(f"{name} ({when}): no second source, so no signal and the state was kept.")
        return out or ["No source checks recorded."]

    def record_fills(self) -> str:
        if not self.n_orders:
            return "Nothing to record this week."
        links = []
        for o in self.step1 + self.step2:
            url = self.issue_urls.get(str(o.get("intent_id") or ""))
            if url:
                links.append(f"{o.get('ticker')}: {self.reg.register(url)}")
        if links:
            s = ("Each order has its own GitHub issue. After you act, comment on it: filled <dollars> @ <price> (what "
                 "you spent or got, and the price), or skipped. " + "; ".join(links) + ". The GitHub mobile app works.")
        else:
            s = ("There's no GitHub issue link this time. Note the dollars and the price of each order (or that you "
                 "skipped it); the monthly review asks for it.")
        if not self.live:
            s += (" The paper broker records its own fills at the open either way; your notes let the system compare "
                  "practice fills with its model.")
        return s

    def rule_e_lines(self) -> list[str]:
        out = []
        re_f = self.f.get("rule_e") or {}
        for p in re_f.get("pending_sells") or []:          # a sale already queued: this email carries no order for it
            key = "rule_e_pending" if str(p.get("reason") or "") == "rule_e" else "sale_pending"
            out.append(_lit(text.STATIC[key], {"ticker": str(p.get("ticker") or ""),
                                               "when": self.date_(p.get("created_date") or self.date)}))
        for sc in re_f.get("scored") or []:
            phrase = self.phrase(f"re_{sc.get('ticker')}")
            if phrase:
                out.append(phrase + " (positive: Rule E sold higher).")
        count = self.phrase("re_count")
        if count:
            out.append(count + ".")
        return out

    def footer(self) -> list[str]:
        f = self.f
        version = self.reg.register(str(self.ctx.get("constitution_version") or f.get("constitution_version") or "unknown"))
        lines = [f"Growth book (GROWTH) · week {self.week} · decided {self.date_(self.date, 'long')} on the closes of "
                 f"{self.date_(f.get('friday') or self.date)} · constitution v{version}"]
        sources = self.ctx.get("sources")
        if isinstance(sources, (list, tuple)):
            sources = ", ".join(str(s) for s in sources)
        asof = self.reg.register(str(self.ctx.get("data_asof") or self.date or "unknown"))
        lines.append(f"Data as of {asof} · sources: {self.reg.register(sources or 'not recorded')}")
        head = str(self.ctx.get("ledger_head") or "")
        ids = f.get("ids") or {}
        recs = ", ".join(f"{k} {self.reg.register(str(v)[:12])}" for k, v in ids.items() if v and k in ("growth_decision", "order_set"))
        lines.append(f"Ledger head: {self.reg.register(head[:12]) if head else 'not recorded'}"
                     + (f" · records: {recs}" if recs else ""))
        lines.append(DISCLAIMER)
        return lines

    def build(self) -> RenderedEmail:
        subject = self.subject()
        summary = self.phrase("summary") or text.STATIC["summary_no_orders"]
        blocks: list[tuple[str, Any]] = [("banner", LIVE_BANNER if self.live else PAPER_BANNER),
                                         ("box", self.headline()), ("h", "This week"), ("p", summary)]
        if self.holiday:
            blocks.append(("p", f"Monday is an NYSE holiday: {self.step1_label} by 9:20 ET on {self.date_(self.holiday)}, "
                                f"{self.step2_label} that day from 9:35 ET."))
        if (self.f.get("governor") or {}).get("paused"):
            blocks.append(("p", "The hard stop has been hit: every sleeve is sold to the cash fund and no buy goes out "
                                "until the review with you. The daily run keeps marking the book."))
        blocks += [("h", "Target vs now"), ("table", self.target_table())]
        gems = self.phrase("gems")
        gems_lines = self.gems_lines()
        if gems or gems_lines:
            blocks.append(("h", "Gems"))
            if gems:
                blocks.append(("p", f"The cash fund (SGOV) holds {gems}."))
            if gems_lines:
                blocks.append(("ul", gems_lines))
        blocks += [("h", "Why"), ("ul", self.why_lines())]
        # headings carry no dates: the text part upper-cases them, which would change a date's registered form
        blocks.append(("h", f"{self.step1_label}: the sells"))
        if self.step1:
            blocks += [("p", f"Place these tonight, or before 9:20 ET on {self.date_(self.execute)}; they fill at the "
                             "9:30 ET open."), ("ol", self.step1_lines())]
        else:
            blocks.append(("p", text.STATIC["step1_none"]))
        blocks.append(("h", f"{self.step2_label}: the buys"))
        if self.step2:
            when = (f"Place these on {self.buy_day()} from 9:35 ET, once every {self.step1_label} sell shows Filled."
                    if self.step1 else f"Place these on {self.buy_day()} from 9:35 ET (nothing to wait for: "
                                       f"{self.step1_label} is empty).")
            blocks += [("p", when), ("ol", self.step2_lines())]
            rule = self.phrase("cash_rule")
            if rule:
                blocks.append(("p", f"The cash rule: {rule}."))
        else:
            blocks.append(("p", text.STATIC["step2_none"]))
        blocks += [("h", "Deferred"), ("ul", self.deferred_lines())]
        rule_e = self.rule_e_lines()
        if rule_e:
            blocks += [("h", "Rule E"), ("ul", rule_e)]
        blocks += [("h", "Risks and tax"), *self.risk_blocks()]
        blocks += [("h", "Do this in Robinhood"), ("ol", self.steps()), ("h", "What if"), ("ul", self.what_if()),
                   ("h", "Sources (two-source checks)"), ("ul", self.source_lines()),
                   ("h", "Record your fills"), ("p", self.record_fills()), ("footer", self.footer())]
        meta = {"kind": "GROWTH", "module": "GROWTH", "trade_id": self.trade_id, "mode": self.MODE.lower(),
                "created_date": self.date, "execute_date": self.execute or None, "slug": f"growth-{self.date}",
                "facts": self.f, "slots": [s["template"] for s in self.slots.values()],
                "slots_required": [s["template"] for s in self.slots.values()], "order_problems": list(self.problems),
                "orders": len(self.step1) + len(self.step2)}
        return RenderedEmail(subject=subject, text=_to_text(blocks), html=_to_html(blocks, subject, summary, self.live),
                             numbers_registered=list(self.reg.numbers), meta=meta)


def render_growth(facts: dict, ctx: dict | None = None) -> RenderedEmail:
    """The Sunday email from the facts record (`state.growth.last_facts`); validate it with `validator.validate`."""
    return _GrowthEmail(facts, ctx or {}).build()


# --------------------------------------------------------------------------------------------- the Rule E email

def render_rule_e(facts: dict, ctx: dict | None = None) -> RenderedEmail:
    """The exit-only Rule E email (<= 10 lines; design §9): the trigger with its numbers, "Sell all X, market,
    queued for the next open", "buy SGOV any time this week", the score line, the Robinhood taps, the issue link."""
    ctx = dict(ctx or {})
    f = dict(facts or {})
    reg = NumberRegistry()
    live = str(ctx.get("mode") or ("live" if f.get("label") == "LIVE" else "paper")).lower() == "live"
    MODE = "LIVE" if live else "PAPER"
    slots = {s["key"]: s for s in rule_e_slot_specs(f)}

    def phrase(key: str) -> str | None:
        slot = slots.get(key)
        if slot is None:
            return None
        for lit in slot["literals"]:
            reg.register(lit)
        return fill_slot(slot, reg.fmt)

    legs = list(f.get("legs") or [])
    tickers = [str(leg.get("ticker") or "") for leg in legs]
    trade_id = reg.register(str(f.get("trade_id") or f"G-{f.get('date')}-RULE-E"))
    execute = str(f.get("execute_date") or "")
    when = reg.fmt_date(execute) if execute else "the next open"
    subject = f"[{MODE}][EXIT {trade_id}] Rule E: Sell all {' and '.join(tickers)} — before 9:30 ET {when}"
    triggers = []
    for leg in legs:
        t = str(leg.get("ticker") or "")
        tr = phrase(f"re_trigger_{t}")
        if tr:
            triggers.append(f"{tr}, so the {t} leg is out")
    day = reg.fmt_date(f["date"]) if f.get("date") else "today"
    band = reg.fmt_pct(legs[0]["band_pct"], points=True) if legs and _num(legs[0].get("band_pct")) is not None else None
    trigger = (f"Rule E, the emergency exit, fired at the close of {day}: " + "; ".join(triggers) + ". "
               "This is the weekly rule checked daily, without" + (f" the {band} band" if band else " the band") + ".")
    sells = [(phrase(f"re_sell_{t}") or f"Sell all {t}, market, queued for the next open") + f" ({when})." for t in tickers]
    score = text.STATIC["re_score"]
    count = phrase("re_count")
    if count:
        score += f" {count}."
    steps = [text.STATIC["step_open"]]
    for t in tickers:
        steps.append(_lit(text.STATIC["re_step_search"], {"ticker": t}))
        steps.append(text.STATIC["re_step_market"])
    steps.append(QUEUE_STEP)
    by_intent = {str(leg.get("intent_id") or ""): str(leg.get("ticker") or "") for leg in legs}
    urls = {by_intent.get(str(k), str(k)): str(u) for k, u in (ctx.get("issue_urls") or {}).items() if u}
    if ctx.get("issue_url"):
        urls.setdefault("", str(ctx["issue_url"]))
    if urls:
        steps.append(text.STATIC["re_step_record"])
        links = "; ".join(f"{t}: {reg.register(u)}" if t else reg.register(u) for t, u in urls.items())
        record = f"Record the fill as a comment on its issue ({links}): filled <dollars> @ <price>, or skipped."
    else:
        steps.append(text.STATIC["step_record_no_issue"])
        record = "There's no GitHub issue link this time: note the dollars and the price you got, or that you skipped it."
    version = reg.register(str(ctx.get("constitution_version") or f.get("constitution_version") or "unknown"))
    head = str(ctx.get("ledger_head") or "")
    footer = [f"Rule E exit {trade_id} · module G1 (growth book) · constitution v{version}",
              f"Data as of {reg.register(str(ctx.get('data_asof') or f.get('date') or 'unknown'))}",
              f"Ledger head: {reg.register(head[:12]) if head else 'not recorded'}", DISCLAIMER]
    blocks: list[tuple[str, Any]] = [("banner", LIVE_BANNER if live else PAPER_BANNER), ("p", trigger),
                                     *[("p", s) for s in sells], ("p", text.STATIC["re_sgov"]), ("p", score),
                                     ("ol", steps[:7]), ("p", record), ("footer", footer)]
    meta = {"kind": "RULE_E", "module": "G1", "trade_id": trade_id, "mode": MODE.lower(), "created_date": f.get("date"),
            "execute_date": execute or None, "slug": f"rule-e-{f.get('date')}", "facts": f,
            "slots": [s["template"] for s in slots.values()], "slots_required": [s["template"] for s in slots.values()],
            "order_problems": [] if legs else ["Rule E email with no leg to sell"], "orders": len(legs)}
    return RenderedEmail(subject=subject, text=_to_text(blocks), html=_to_html(blocks, subject, sells[0] if sells else subject, live),
                         numbers_registered=list(reg.numbers), meta=meta)
