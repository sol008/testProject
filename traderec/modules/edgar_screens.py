"""EDGAR/FINRA shadow screens: the pure rules, with no I/O (design v3.3 §3 "Shadow ledger" and §5 never-list;
track 16 §10.2 SH-1 to SH-4; track 05 §3.7 and §11 A for CEF tender capture). The runner
(`traderec.runners.edgar`) fetches the filings and prices, keeps the state and writes the ledger.

Setups (all shadow only: no emails, no orders, no LLM):

* SH1 insider cluster buy (a monitor of a rejected setup): >= 2 directors or officers with open-market purchases
  filed within 30 calendar days; 90-day issuer lockout; next open, out at the close of session 20.
* SH2 special dividend (incubate): a declared dividend >= 1.5x the median regular dividend of the prior 2 years
  (or the first dividend) and >= 1% of the price, ex-date 3-75 days after the 8-K; in at the close after the
  8-K, out at the close before the ex-date (never through it).
* SH3 activist Schedule 13D (a monitor of a rejected setup): an original 13D by a listed activist fund; in at the
  close after the filing, out at the close of session 20.
* SH4 near-completion cash merger (a cash substitute, incubate): a cash deal, vote passed, all required regulatory
  approvals received, expected close <= 30 days, no financing condition; in at the close after the last approval
  8-K, out at the deal's close (cash), a break, or the design's 60-day cap.
* CEF tender capture (track 05): a listed fund's self-tender at >= 98% of NAV while it trades >= 8% below NAV; in
  at the next open, tender, sell the remainder.

Conventions (track 16 §1.2-§1.3):

* D is the EDGAR filing date and s1 the first session after it. Every event records two entries, the open of s1
  (design §1: emails go out after 22:17 ET, so entries are at the next open) and the close of s1 (the track's
  primary entry). Each setup's promotion test uses the basis its track pre-registered (config ``entry``).
* Returns use total-return prices: adj_close, and an open put on the same basis (open x adj_close / close).
* Excess = the return minus the benchmark's over the same window: SPY from a $2bn market cap, IWM below.
* Net = excess minus the round-trip cost of the event's market-cap bucket (track 16 §1.3).
* Market features are measured before the filing's first session: the last close and the 20-session median dollar
  volume before the first session on or after D (track 16 fastev.py).
"""
from __future__ import annotations

import math
import re
from collections.abc import Iterable, Sequence
from typing import Any

import pandas as pd

from traderec.market_calendar import is_trading_day, iso, next_trading_day, prev_trading_day

SETUPS: dict[str, str] = {
    "SH1": "insider cluster buy",
    "SH2": "special dividend",
    "SH3": "activist Schedule 13D",
    "SH4": "near-completion cash merger",
    "CEF": "CEF tender capture",
}

# Track 16 activist_13d.py: "known activists" (about 80 names, including some post-2015 entrants, so mild hindsight).
# Kept verbatim so the shadow record matches the tested definition; a name match can misfire (e.g. a family
# partnership whose name contains "ELLIOTT "), as it could in the backtest.
KNOWN_ACTIVISTS: tuple[str, ...] = (
    "ELLIOTT ", "ICAHN", "TRIAN ", "THIRD POINT", "PERSHING SQUARE", "JANA PARTNERS", "VALUEACT", "STARBOARD VALUE",
    "CORVEX", "SACHEM HEAD", "ENGAGED CAPITAL", "LEGION PARTNERS", "LAND & BUILDINGS", "ANCORA", "BARINGTON",
    "CLINTON GROUP", "MARCATO", "GLENVIEW", "RELATIONAL INVESTORS", "BLUE HARBOUR", "CEVIAN", "LONE STAR VALUE",
    "BIGLARI", "GAMCO", "GABELLI", "MILL ROAD", "RAGING CAPITAL", "STEEL PARTNERS", "WYNNEFIELD", "PL CAPITAL",
    "STILWELL", "FRONTFOUR", "SCOPIA", "SANDELL", "SOUTHEASTERN ASSET", "OASIS MANAGEMENT", "MANGROVE PARTNERS",
    "SABA CAPITAL", "BULLDOG INVESTORS", "KARPUS", "CANNELL", "HARBINGER", "CASABLANCA", "SHAMROCK", "PIRATE CAPITAL",
    "WESTERN INVESTMENT", "ENGINE CAPITAL", "VOSS CAPITAL", "SARISSA", "HG VORA", "JCP INVESTMENT", "BLR PARTNERS",
    "LEUCADIA", "CARL C. ICAHN", "SPRING OWL", "LITESPEED", "SOROS",
    "MANTLE RIDGE", "IMPACTIVE", "POLITAN", "IRENIC", "BLACKWELLS", "MACELLUM", "BROWNING WEST", "ANSON FUNDS",
    "DRIVER MANAGEMENT", "INCLUSIVE CAPITAL", "LEGION", "ALTAI", "CAAS CAPITAL", "SNOW PARK", "D. E. SHAW", "KENT LAKE",
    "ELEMENT POINT", "STADIUM CAPITAL", "PALLINGHURST", "VINTAGE CAPITAL", "ENVIRO STAR", "ANCORA ALTERNATIVES",
    "LAMPE CONWAY", "BRADLEY RADOFF", "TOMS CAPITAL", "STARBOARD", "ELLIOTT INVESTMENT",
)

# Track 16 insider_events.py: which security titles count as common stock.
COMMON_OK = re.compile(r"common|ordinary|class [abc]\b|capital stock|^shares|share[s]? of|stock$|^stock")
COMMON_BAD = re.compile(r"prefer|note|warrant|unit|debenture|depositar|right|option|bond|trust pref|convertible|"
                        r"lp int|partnership|membership|limited")
TOP_TITLE = re.compile(r"\bCEO\b|CHIEF EXECUTIVE|\bCFO\b|CHIEF FINANCIAL|PRESIDENT|\bCHAIR")

DEFAULT_COSTS: tuple[tuple[float, float, str], ...] = (      # track 16 §1.3, round trip by market cap
    (1.0e10, 0.0015, "large"), (2.0e9, 0.003, "mid"), (3.0e8, 0.008, "small"), (5.0e7, 0.020, "micro"),
    (0.0, 0.040, "nano"))
UNKNOWN_CAP_COST = 0.020


# --------------------------------------------------------------------------------------------------------
# Sessions and market features
# --------------------------------------------------------------------------------------------------------

def first_session_after(d: str) -> str:
    """s1: the first NYSE session after date `d` (the NYSE calendar; the runner schedules with it)."""
    return iso(next_trading_day(d))


def nth_session_after(d: str, n: int) -> str:
    """The n-th NYSE session after `d` (n >= 1)."""
    day = str(d)[:10]
    for _ in range(max(1, int(n))):
        day = iso(next_trading_day(day))
    return day


def anchor_session(d: str) -> str:
    """The first session on or after `d` (`d` itself when it is a session)."""
    return str(d)[:10] if is_trading_day(d) else first_session_after(d)


def market_features(bars: pd.DataFrame | None, d: str, lookback: int = 20) -> dict:
    """Price and liquidity before the filing's first session (track 16 fastev.py).

    {"price" (last close before the anchor session), "dvol20" (median close x volume, 20 sessions), "hist"
    (sessions of history), "last_bar", "stale"}. The anchor is the first session on or after D. `stale` is True
    when the last bar before it is more than a week older than the session before the anchor.
    """
    out: dict[str, Any] = {"price": None, "dvol20": None, "hist": 0, "last_bar": None, "stale": True}
    if bars is None or not len(bars):
        return out
    anchor = pd.Timestamp(anchor_session(d))
    before = bars[bars.index < anchor].dropna(subset=["close"])
    if before.empty:
        return out
    tail = before.tail(lookback)
    dv = (tail["close"] * tail["volume"]).dropna()
    last = before.index[-1]
    expected = pd.Timestamp(prev_trading_day(anchor))
    out.update(price=float(before["close"].iloc[-1]), dvol20=float(dv.median()) if len(dv) else None,
               hist=int(len(before)), last_bar=iso(last), stale=bool(last < expected - pd.Timedelta(days=7)))
    return out


def market_cap(shares: float | None, price: float | None,
               public_float: float | None = None) -> tuple[float | None, str]:
    """(market cap, basis): shares x price; else the last reported public float (a lower bound); else (None, "")."""
    if shares and price and shares > 0 and price > 0:
        return float(shares) * float(price), "shares"
    if public_float and public_float > 0:
        return float(public_float), "public_float"
    return None, ""


def cost_for(mcap: float | None, costs: Sequence[Sequence[Any]] | None = None) -> tuple[str, float]:
    """(bucket, round-trip cost) for a market cap (track 16 §1.3); an unknown cap costs 2%."""
    if mcap is None or not math.isfinite(float(mcap)) or mcap <= 0:
        return "unknown", UNKNOWN_CAP_COST
    for row in (costs or DEFAULT_COSTS):
        lo, cost = float(row[0]), float(row[1])
        label = str(row[2]) if len(row) > 2 else f">={lo:.0f}"
        if mcap >= lo:
            return label, cost
    return "unknown", UNKNOWN_CAP_COST


def benchmark_for(mcap: float | None, large_cap_min: float = 2.0e9) -> str:
    """SPY for a market cap of $2bn or more, IWM below or unknown (track 16 conventions)."""
    return "SPY" if mcap is not None and mcap >= large_cap_min else "IWM"


def universe_check(features: dict, mcap: float | None, rules: dict) -> list[str]:
    """Reasons an event fails its universe filter (design §5 floors; track 16 §10.2); [] when it passes."""
    reasons = []
    price, dvol, hist = features.get("price"), features.get("dvol20"), int(features.get("hist") or 0)
    if features.get("stale"):
        reasons.append("stale price data")
    if "min_price" in rules and (price is None or price < float(rules["min_price"])):
        reasons.append(f"price {_fmt(price)} below {rules['min_price']}")
    if "min_mcap" in rules:
        if mcap is None:
            reasons.append("market cap unknown")
        elif mcap < float(rules["min_mcap"]):
            reasons.append(f"market cap {_fmt(mcap)} below {float(rules['min_mcap']):,.0f}")
    if "min_dvol20" in rules and (dvol is None or dvol < float(rules["min_dvol20"])):
        reasons.append(f"20-day median dollar volume {_fmt(dvol)} below {float(rules['min_dvol20']):,.0f}")
    if "min_history" in rules and hist < int(rules["min_history"]):
        reasons.append(f"{hist} sessions of history, fewer than {rules['min_history']}")
    return reasons


def _fmt(x: Any) -> str:
    return "unknown" if x is None else f"{float(x):,.2f}"


# --------------------------------------------------------------------------------------------------------
# SH1: insider clusters (track 16 §3.1)
# --------------------------------------------------------------------------------------------------------

def form4_purchase(doc: dict, filing_date: str, adsh: str, max_lag_days: int = 14) -> dict | None:
    """A Form 4's qualifying open-market purchase, summed over its lines (track 16 §3.1), or None.

    Rules: an original Form 4 (document type "4"); the first-listed reporting owner (a joint filing counts once),
    who must be a director or an officer (pure 10% holders are out); non-derivative lines with code P, acquired,
    shares and price > 0, a common-stock title, transaction form type 4, filed 0-14 days after the trade.
    Returns {"issuer_cik", "issuer", "symbol", "owner_cik", "owner", "date", "adsh", "shares", "value", "vwap",
    "first_trade", "last_trade", "top", "director", "officer"}.
    """
    if doc.get("document_type") != "4" or not doc.get("owners"):
        return None
    owner = doc["owners"][0]
    if not (owner.get("director") or owner.get("officer")):
        return None
    lines = []
    for tx in doc.get("transactions", []):
        if tx.get("code") != "P" or tx.get("acq_disp") != "A" or tx.get("form_type") not in ("4", ""):
            continue
        shares, price = tx.get("shares"), tx.get("price")
        if not shares or shares <= 0 or not price or price <= 0 or not tx.get("date"):
            continue
        title = str(tx.get("title") or "").lower().strip()
        if not COMMON_OK.search(title) or COMMON_BAD.search(title):
            continue
        lag = (pd.Timestamp(filing_date) - pd.Timestamp(tx["date"])).days
        if not 0 <= lag <= int(max_lag_days):
            continue
        lines.append(tx)
    if not lines:
        return None
    shares = sum(float(t["shares"]) for t in lines)
    value = sum(float(t["shares"]) * float(t["price"]) for t in lines)
    issuer = doc.get("issuer") or {}
    return {"issuer_cik": issuer.get("cik"), "issuer": issuer.get("name"), "symbol": issuer.get("symbol"),
            "owner_cik": owner.get("cik"), "owner": owner.get("name"), "date": str(filing_date)[:10], "adsh": adsh,
            "shares": shares, "value": value, "vwap": value / shares,
            "first_trade": min(t["date"] for t in lines), "last_trade": max(t["date"] for t in lines),
            "top": bool(TOP_TITLE.search(str(owner.get("title") or "").upper())),
            "director": bool(owner.get("director")), "officer": bool(owner.get("officer"))}


def insider_cluster(purchases: Iterable[dict], window_days: int = 30, min_insiders: int = 2, *,
                    not_before: str | None = None) -> dict | None:
    """The first cluster in one issuer's purchases (track 16 §3.1), or None.

    The first filing date t (on or after `not_before`) on which >= `min_insiders` distinct insiders have filed
    purchases dated within [t - window + 1, t]. Returns {"date", "insiders", "value", "vwap", "n_top",
    "first_trade", "last_trade", "adsh" (the filings in the window), "completing" (t's filings)}.
    """
    ps = [p for p in purchases if p.get("date") and p.get("owner_cik") is not None]
    for t in sorted({p["date"] for p in ps}):
        if not_before and t < not_before:
            continue
        lo = (pd.Timestamp(t) - pd.Timedelta(days=int(window_days) - 1)).strftime("%Y-%m-%d")
        win = [p for p in ps if lo <= p["date"] <= t]
        owners = {p["owner_cik"] for p in win}
        if len(owners) < int(min_insiders):
            continue
        shares = sum(float(p.get("shares") or 0) for p in win)
        value = sum(float(p.get("value") or 0) for p in win)
        tops = {p["owner_cik"] for p in win if p.get("top")}
        return {"date": t, "insiders": len(owners), "value": value, "vwap": value / shares if shares else None,
                "n_top": len(tops), "first_trade": min(p.get("first_trade") or p["date"] for p in win),
                "last_trade": max(p.get("last_trade") or p["date"] for p in win),
                "adsh": sorted({p["adsh"] for p in win}), "completing": sorted({p["adsh"] for p in win
                                                                                 if p["date"] == t})}
    return None


def ticker_check(bars: pd.DataFrame | None, trade_date: str, vwap: float | None, tolerance: float = 0.25) -> dict:
    """Does the ticker's close on the last trade date sit within +-25% of the insiders' price? (track 16 §1.5)

    Guards against a reused or wrong ticker. {"ok", "close", "ratio"}; not ok without a close or a price.
    """
    if bars is None or vwap is None or vwap <= 0:
        return {"ok": False, "close": None, "ratio": None}
    upto = bars[bars.index <= pd.Timestamp(trade_date)]["close"].dropna()
    if upto.empty:
        return {"ok": False, "close": None, "ratio": None}
    close = float(upto.iloc[-1])
    ratio = close / float(vwap)
    ok = abs(math.log(ratio)) <= math.log(1.0 + float(tolerance)) if ratio > 0 else False
    return {"ok": bool(ok), "close": close, "ratio": ratio}


# --------------------------------------------------------------------------------------------------------
# SH2: special dividends (track 16 §4.3)
# --------------------------------------------------------------------------------------------------------

def infer_dividends(bars: pd.DataFrame | None) -> pd.Series:
    """Per-share cash dividends by ex-date, from the adj_close / close ratio (the pipeline credits them the same way).

    yfinance scales history before an ex-date t by (1 - d / close[t-1]), so d = close[t-1] x (1 - f[t-1] / f[t])
    with f = adj_close / close. Moves below 0.01% of the price are noise.
    """
    if bars is None or len(bars) < 2:
        return pd.Series(dtype=float)
    f = bars["adj_close"] / bars["close"]
    prev_close = bars["close"].shift(1)
    div = prev_close * (1.0 - f.shift(1) / f)
    return div[div > prev_close * 1e-4].dropna()


def special_dividend_ex_date(parsed: dict, price: float | None) -> tuple[str | None, str]:
    """(ex-date, basis) for a declared special dividend.

    A stated ex-date wins. A distribution of 25% of the price or more goes ex on the session after the payable
    date (exchange rule). Otherwise, with T+1 settlement (since 28 May 2024), the ex-date is the record date, or
    the session before it when the record date is not a session.
    """
    if parsed.get("ex_date"):
        return parsed["ex_date"], "stated"
    amount, record, payable = parsed.get("amount"), parsed.get("record_date"), parsed.get("payable_date")
    if amount and price and amount / price >= 0.25 and payable:
        return first_session_after(payable), "payable date + 1 session (distribution >= 25% of price)"
    if record:
        return (record if is_trading_day(record) else iso(prev_trading_day(record))), "record date (T+1)"
    return None, "none"


def special_dividend_check(parsed: dict, bars: pd.DataFrame | None, d: str, price: float | None, cfg: dict) -> dict:
    """SH2's event definition (track 16 §10.2) on a parsed declaration and the stock's history before D.

    {"ok", "reasons", "amount", "yield", "regular_median", "prior_dividends", "ex_date", "ex_basis", "exit_due"};
    `exit_due` is the last session before the ex-date (the planned exit).
    """
    reasons: list[str] = []
    amount = float(parsed["amount"])
    day = pd.Timestamp(str(d)[:10])
    divs = infer_dividends(bars[bars.index <= day] if bars is not None else None)
    lookback = pd.Timedelta(days=int(cfg.get("regular_lookback_days", 730)))
    prior = divs[(divs.index >= day - lookback) & (divs.index < day)]
    regular = float(prior.median()) if len(prior) else 0.0
    ex, basis = special_dividend_ex_date(parsed, price)
    lo, hi = (int(x) for x in cfg.get("ex_date_days", (3, 75)))
    if parsed.get("contingent"):
        reasons.append("contingent on another event (e.g. a merger closing)")
    exit_due = None
    if ex is None:
        reasons.append("no ex-date or record date")
    else:
        days = (pd.Timestamp(ex) - day).days
        if not lo <= days <= hi:
            reasons.append(f"ex-date {days} days after the 8-K, outside {lo}-{hi}")
        exit_due = iso(prev_trading_day(ex))
        if exit_due <= first_session_after(d):
            reasons.append("no session between entry and the ex-date")
    mult = float(cfg.get("min_multiple_of_regular", 1.5))
    if regular > 0 and amount < mult * regular:
        reasons.append(f"{amount:.4f} is less than {mult}x the median regular dividend {regular:.4f}")
    yld = amount / price if price else None
    if yld is None:
        reasons.append("no price")
    elif yld < float(cfg.get("min_yield", 0.01)):
        reasons.append(f"yield {yld:.2%} below {float(cfg.get('min_yield', 0.01)):.0%}")
    return {"ok": not reasons, "reasons": reasons, "amount": amount, "yield": yld, "regular_median": regular,
            "prior_dividends": int(len(prior)), "ex_date": ex, "ex_basis": basis, "exit_due": exit_due}


# --------------------------------------------------------------------------------------------------------
# SH3: activist Schedule 13D (track 16 §6.5)
# --------------------------------------------------------------------------------------------------------

def activist_match(filer_names: Iterable[str], names: Iterable[str] = KNOWN_ACTIVISTS) -> str | None:
    """The first listed activist whose name appears among a 13D's filers (upper-case substring match), or None."""
    joined = " " + " | ".join(str(n or "").upper() for n in filer_names) + " "
    return next((a for a in names if a in joined), None)


# --------------------------------------------------------------------------------------------------------
# SH4: near-completion cash mergers (track 16 §4.1, §10.2)
# --------------------------------------------------------------------------------------------------------

def merger_apply(deal: dict, update: dict, d: str) -> dict:
    """A copy of a watched deal with what a filing dated `d` says (see `traderec.data.edgar.parse_merger_update`).

    Records the first date the vote passed and the first date all regulatory approvals were reported received,
    the latest expected closing date, and completion or termination (with the event date).
    """
    out = dict(deal)
    day = str(d)[:10]
    if update.get("vote") == "approved" and not out.get("vote_date"):
        out["vote_date"] = day
    if update.get("vote") == "rejected":
        out["terminated"], out["terminated_date"] = True, day
    if update.get("regulatory") == "received" and not out.get("regulatory_date"):
        out["regulatory_date"] = day
    if update.get("expected_close"):
        out["expected_close"], out["close_basis"] = update["expected_close"], update.get("close_basis")
        out["expected_close_said"] = day
    if update.get("completed") and not out.get("completed"):
        out["completed"], out["completed_date"] = True, str(update.get("event_date") or day)[:10]
    if update.get("terminated") and not out.get("terminated"):
        out["terminated"], out["terminated_date"] = True, day
    if any(update.get(k) for k in ("vote", "regulatory", "expected_close", "completed", "terminated")):
        out["last_update"] = day                           # the date the rule is checked as of (merger news only)
    return out


def merger_trigger(deal: dict, d: str, cfg: dict) -> dict:
    """SH4's event definition on a watched deal as of filing date `d`: {"ok", "reasons", "days_to_close"}.

    A cash deal (a per-share cash price, no stock component), no financing condition (stated), the vote passed,
    all required regulatory approvals reported received, and an expected closing date 0-30 days after D. A deal
    that has closed or ended does not trigger.
    """
    reasons: list[str] = []
    if not deal.get("cash"):
        reasons.append("no per-share cash price")
    if deal.get("stock"):
        reasons.append("stock component")
    if deal.get("financing_condition") is True:
        reasons.append("financing condition")
    elif deal.get("financing_condition") is None:
        reasons.append("financing condition not stated")
    if not deal.get("vote_date"):
        reasons.append("shareholder vote not reported passed")
    if not deal.get("regulatory_date"):
        reasons.append("regulatory approvals not reported received")
    days = None
    if not deal.get("expected_close"):
        reasons.append("no expected closing date")
    else:
        days = (pd.Timestamp(deal["expected_close"]) - pd.Timestamp(str(d)[:10])).days
        if not 0 <= days <= int(cfg.get("max_days_to_close", 30)):
            reasons.append(f"expected close {days} days away, not 0-{cfg.get('max_days_to_close', 30)}")
    if deal.get("completed") or deal.get("terminated"):
        reasons.append("deal already completed or ended")
    return {"ok": not reasons, "reasons": reasons, "days_to_close": days}


# --------------------------------------------------------------------------------------------------------
# CEF tender capture (track 05 §3.7, §11 A)
# --------------------------------------------------------------------------------------------------------

def cef_tender_check(terms: dict, price: float | None, nav: float | None, entry_day: str, cfg: dict) -> dict:
    """The CEF tender-capture definition: {"ok", "reasons", "discount", "days_to_expiry"}.

    A self-tender at >= 98% of NAV, not conditional, while the fund trades at a discount of 8% or more; the offer
    must expire within the design's 60-day holding cap of the entry session.
    """
    reasons: list[str] = []
    pct = terms.get("pct_nav")
    if pct is None:
        reasons.append("no price as a percentage of NAV")
    elif pct < float(cfg.get("min_pct_nav", 0.98)):
        reasons.append(f"tender at {pct:.1%} of NAV, below {float(cfg.get('min_pct_nav', 0.98)):.0%}")
    if terms.get("conditional"):
        reasons.append("conditional tender offer")
    discount = None
    if not price or not nav:
        reasons.append("no NAV" if not nav else "no price")
    else:
        discount = price / nav - 1.0
        if discount > -float(cfg.get("min_discount", 0.08)):
            reasons.append(f"discount {discount:.1%} narrower than {float(cfg.get('min_discount', 0.08)):.0%}")
    days = None
    if not terms.get("expiry"):
        reasons.append("no expiration date")
    else:
        days = (pd.Timestamp(terms["expiry"]) - pd.Timestamp(entry_day)).days
        if days < 1:
            reasons.append("offer expires before the entry")
        elif days > int(cfg.get("max_hold_days", 60)):
            reasons.append(f"offer expires {days} days after entry, beyond the {cfg.get('max_hold_days', 60)}-day cap")
    return {"ok": not reasons, "reasons": reasons, "discount": discount, "days_to_expiry": days}


# --------------------------------------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------------------------------------

def _tr(bars: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """(open, close) on a total-return basis: adj_close, and open x adj_close / close."""
    close_tr = bars["adj_close"].where(bars["adj_close"].notna(), bars["close"])
    open_tr = bars["open"] * (close_tr / bars["close"])
    return open_tr, close_tr


def value_on(series: pd.Series, day: pd.Timestamp, *, on_or_before: bool = True) -> float | None:
    """The positive value on `day` (or the last one before it, with `on_or_before`), else None."""
    s = series.dropna()
    s = s[s.index <= day] if on_or_before else s[s.index == day]
    if s.empty:
        return None
    v = float(s.iloc[-1])
    return v if math.isfinite(v) and v > 0 else None


def entry_day(bars: pd.DataFrame, d: str) -> pd.Timestamp | None:
    """The stock's first trading day after the filing date (its own bars, so a halt delays the entry)."""
    after = bars.index[bars.index > pd.Timestamp(str(d)[:10])]
    return after[0] if len(after) else None


def window_returns(bars: pd.DataFrame, bench: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp,
                   cost: float) -> dict | None:
    """Returns from `start` to the close of `end`, on both entry bases, net of `cost`.

    {"open": {...}, "close": {...}}, each {"raw", "bench", "excess", "net"}; None when a price is missing.
    """
    s_open, s_close = _tr(bars)
    b_open, b_close = _tr(bench)
    exit_s, exit_b = value_on(s_close, end), value_on(b_close, end)
    if exit_s is None or exit_b is None:
        return None
    out = {}
    for basis, s_in, b_in in (("open", s_open, b_open), ("close", s_close, b_close)):
        e_s = value_on(s_in, start, on_or_before=False)
        e_b = value_on(b_in, start)
        if e_s is None or e_b is None:
            return None
        raw, bench_ret = exit_s / e_s - 1.0, exit_b / e_b - 1.0
        out[basis] = {"raw": raw, "bench": bench_ret, "excess": raw - bench_ret, "net": raw - bench_ret - cost}
    return out


def filing_reaction(bars: pd.DataFrame, bench: pd.DataFrame, d: str) -> float | None:
    """The close(D-1) -> close(D+1) excess return around a filing (track 16 §3.4): the last close before the
    filing's anchor session to the close of the first session after D, minus the benchmark's."""
    anchor = pd.Timestamp(anchor_session(d))
    first = entry_day(bars, d)
    if first is None:
        return None
    _, s_close = _tr(bars)
    _, b_close = _tr(bench)
    pre_s = s_close[s_close.index < anchor].dropna()
    pre_b = b_close[b_close.index < anchor].dropna()
    post_s, post_b = value_on(s_close, first, on_or_before=False), value_on(b_close, first)
    if pre_s.empty or pre_b.empty or post_s is None or post_b is None:
        return None
    return (post_s / float(pre_s.iloc[-1]) - 1.0) - (post_b / float(pre_b.iloc[-1]) - 1.0)


def follow_exit(bars: pd.DataFrame, start: pd.Timestamp, hold_sessions: int) -> pd.Timestamp | None:
    """The close of session `hold_sessions` after the entry session, in the stock's own bars (None if not yet)."""
    idx = bars.index
    pos = idx.get_indexer([start])[0]
    if pos < 0 or pos + int(hold_sessions) >= len(idx):
        return None
    return idx[pos + int(hold_sessions)]


def observed_ex_date(bars: pd.DataFrame, expected: str, amount: float, sessions: int = 5) -> str | None:
    """The ex-date the price data shows for the declared dividend near `expected` (+-5 sessions), or None.

    A dividend counts when it is 0.75x to 2x the declared amount: a special is often paid with a regular dividend
    on the same ex-date, and the price data shows only their sum.
    """
    divs = infer_dividends(bars)
    idx = bars.index
    if divs.empty or not len(idx):
        return None
    pos = int(idx.searchsorted(pd.Timestamp(expected)))
    lo, hi = idx[max(0, pos - sessions)], idx[min(len(idx) - 1, pos + sessions)]
    near = divs[(divs.index >= lo) & (divs.index <= hi)]
    near = near[(near >= 0.75 * amount) & (near <= 2.0 * amount)]
    return iso(near.index[0]) if len(near) else None


def score_merger(entry: dict, start: pd.Timestamp, exit_date: pd.Timestamp, exit_price: float, cost: float) -> dict:
    """SH4 at its exit: from the recorded entry prices ({"open", "close"}) to `exit_price` on `exit_date` (the deal's
    cash at its closing date, or the close after a break or at the time stop). A taken-over stock's bars may be
    gone by then, so this works from prices alone. Returns {"exit_date", "days", "exit_price", "open": {...},
    "close": {...}} with {"entry", "raw", "net", "annualized"} per entry basis."""
    days = max(1, (pd.Timestamp(exit_date) - pd.Timestamp(start)).days)
    out: dict[str, Any] = {"exit_date": iso(exit_date), "days": days, "exit_price": float(exit_price)}
    for basis in ("open", "close"):
        px = float(entry[basis])
        raw = float(exit_price) / px - 1.0
        net = raw - float(cost)
        out[basis] = {"entry": px, "raw": raw, "net": net,
                      "annualized": (1.0 + net) ** (365.0 / days) - 1.0 if net > -1.0 else -1.0}
    return out


def score_cef(bars: pd.DataFrame, bench: pd.DataFrame, start: pd.Timestamp, sell_day: pd.Timestamp,
              accepted: float, tender_price: float | None, cost: float) -> dict | None:
    """CEF tender capture at its exit: `accepted` of the position is bought by the fund at `tender_price`, the rest
    is sold at the close of `sell_day`. Returns {"exit_date", "open": {...}, "close": {...}} with {"entry", "raw",
    "bench", "excess", "net"} per entry basis (raw prices; the fund's distributions are left out), or None."""
    sell_px = value_on(bars["close"], sell_day)
    if sell_px is None:
        return None
    a = min(max(float(accepted), 0.0), 1.0) if tender_price else 0.0
    proceeds = a * float(tender_price or 0.0) + (1.0 - a) * sell_px
    b_open, b_close = _tr(bench)
    b_exit = value_on(b_close, sell_day)
    out: dict[str, Any] = {"exit_date": iso(sell_day), "accepted": a, "tender_price": tender_price,
                           "remainder_price": sell_px}
    for basis, col, b_series in (("open", "open", b_open), ("close", "close", b_close)):
        entry = value_on(bars[col], start, on_or_before=False)
        b_in = value_on(b_series, start)
        if entry is None or b_in is None or b_exit is None:
            return None
        raw = proceeds / entry - 1.0
        bench_ret = b_exit / b_in - 1.0
        out[basis] = {"entry": entry, "raw": raw, "bench": bench_ret, "excess": raw - bench_ret, "net": raw - cost}
    return out


# --------------------------------------------------------------------------------------------------------
# Promotion tests and summaries (track 16 §10.2, §10.4 P2)
# --------------------------------------------------------------------------------------------------------

def primary_return(event: dict) -> float | None:
    """The number an event's promotion test uses: the net return on its setup's pre-registered entry basis."""
    for score in (event.get("scores") or {}).values():
        if isinstance(score, dict) and score.get("return") is not None:
            return float(score["return"])
    return None


def t_stat(values: Sequence[float]) -> float | None:
    """The plain per-trade t-statistic of the mean."""
    v = [float(x) for x in values if x is not None and math.isfinite(float(x))]
    if len(v) < 2:
        return None
    s = pd.Series(v)
    sd = float(s.std(ddof=1))
    return float(s.mean() / (sd / math.sqrt(len(v)))) if sd > 0 else None


def clustered_t(values: Sequence[float], dates: Sequence[str]) -> float | None:
    """Month-clustered t-statistic (track 16 common.py): returns are averaged within each calendar month first."""
    df = pd.DataFrame({"r": list(values), "d": pd.to_datetime(list(dates))}).dropna()
    if df.empty:
        return None
    g = df.groupby(df["d"].dt.to_period("M"))["r"].mean()
    if len(g) < 3 or float(g.std(ddof=1)) == 0:
        return None
    return float(g.mean() / (g.std(ddof=1) / math.sqrt(len(g))))


def setup_stats(events: Iterable[dict], setup: str) -> dict:
    """n, mean, median, win rate, t and month-clustered t of the closed events of one setup."""
    closed = [e for e in events if e.get("setup") == setup and e.get("status") == "closed"]
    rets = [(primary_return(e), e.get("signal_date")) for e in closed]
    rets = [(r, d) for r, d in rets if r is not None]
    vals = [r for r, _ in rets]
    s = pd.Series(vals, dtype=float)
    return {"setup": setup, "n": len(vals), "mean": float(s.mean()) if vals else None,
            "median": float(s.median()) if vals else None,
            "win_rate": float((s > 0).mean()) if vals else None, "t": t_stat(vals),
            "t_clustered": clustered_t(vals, [d for _, d in rets]) if vals else None,
            "rolling_mean_30": float(s.tail(30).mean()) if len(vals) >= 30 else None,
            "open": sum(1 for e in events if e.get("setup") == setup and e.get("status") in ("pending_entry", "open")),
            "void": sum(1 for e in events if e.get("setup") == setup and e.get("status") == "void")}


def promotion_test(events: Sequence[dict], setup: str, rule: dict | None, *, tbill: float | None = None) -> dict:
    """A setup's pre-registered promotion test (track 16 §10.2) on its closed shadow events.

    SH1, SH3: >= 60 trades, mean net excess >= +1.0%, month-clustered t >= 2.5, and the median filing reaction
    (close D-1 -> D+1, excess) below +1.0% over the same period. SH2: >= 30 trades, mean net >= +0.5%, t >= 2.0,
    median > 0. SH4: >= 30 deals, realised annualised return >= T-bill + 3% net, and no break loss above 2% of the
    shadow book at the rule's position weight. CEF tender capture has no pre-registered test in track 05: the
    statistics are reported and "passed" is None. Promotion always needs the owner's approval (track 16 P2);
    "demote" is set when the rolling mean of the last 30 trades is negative.
    Returns {"setup", "stats", "checks": [{"name", "value", "threshold", "ok"}], "passed", "demote"}.
    """
    stats = setup_stats(events, setup)
    closed = [e for e in events if e.get("setup") == setup and e.get("status") == "closed"
              and primary_return(e) is not None]
    checks: list[dict] = []

    def check(name: str, value: Any, threshold: Any, ok: bool) -> None:
        checks.append({"name": name, "value": value, "threshold": threshold, "ok": bool(ok)})

    rule = rule or {}
    if setup in ("SH1", "SH3") and rule:
        reactions = [float(e["filing_reaction"]) for e in closed if e.get("filing_reaction") is not None]
        med = float(pd.Series(reactions).median()) if reactions else None
        check("trades", stats["n"], rule["min_trades"], stats["n"] >= int(rule["min_trades"]))
        check("mean net excess", stats["mean"], rule["min_mean"], (stats["mean"] or -1) >= float(rule["min_mean"]))
        check("month-clustered t", stats["t_clustered"], rule["min_t"],
              (stats["t_clustered"] or -99) >= float(rule["min_t"]))
        check("median filing reaction", med, rule["max_reaction_median"],
              med is not None and med < float(rule["max_reaction_median"]))
    elif setup == "SH2" and rule:
        check("trades", stats["n"], rule["min_trades"], stats["n"] >= int(rule["min_trades"]))
        check("mean net excess", stats["mean"], rule["min_mean"], (stats["mean"] or -1) >= float(rule["min_mean"]))
        check("t", stats["t"], rule["min_t"], (stats["t"] or -99) >= float(rule["min_t"]))
        check("median", stats["median"], 0.0, (stats["median"] or 0.0) > 0.0)
    elif setup == "SH4" and rule:
        days = sum(float(e.get("hold_days") or 0) for e in closed)
        total = sum(primary_return(e) or 0.0 for e in closed)
        annual = total * 365.0 / days if days > 0 else None      # capital-time weighted, as if held one after another
        bills = [float(e["tbill"]) for e in closed if e.get("tbill") is not None]
        hurdle = (sum(bills) / len(bills) if bills else float(tbill or 0.0)) + float(rule["min_excess_annualized"])
        worst = min((primary_return(e) or 0.0 for e in closed), default=0.0)
        book_loss = -worst * float(rule["position_weight"]) if worst < 0 else 0.0
        check("deals", stats["n"], rule["min_trades"], stats["n"] >= int(rule["min_trades"]))
        check("annualised net return", annual, hurdle, annual is not None and annual >= hurdle)
        check("worst break loss, share of book", book_loss, rule["max_break_loss_book"],
              book_loss <= float(rule["max_break_loss_book"]))
    passed = all(c["ok"] for c in checks) if checks else None
    demote = stats["rolling_mean_30"] is not None and stats["rolling_mean_30"] < 0
    return {"setup": setup, "stats": stats, "checks": checks, "passed": passed, "demote": bool(demote)}


def reaction_split(events: Iterable[dict], setup: str, asof: str, months: int = 24) -> dict:
    """Track 16 §10.4 P2, the rolling split of the §3.4 table (SH1, SH3): over the closed events signalled in the
    `months` months to `asof`, the filing reaction (close D-1 -> D+1, excess) against the follower's excess from
    the close of s1 (gross) and its net return on the setup's entry basis."""
    since = (pd.Timestamp(asof) - pd.DateOffset(months=months)).strftime("%Y-%m-%d")
    rows = [e for e in events if e.get("setup") == setup and e.get("status") == "closed"
            and since < str(e.get("signal_date", "")) <= asof]
    react = [float(e["filing_reaction"]) for e in rows if e.get("filing_reaction") is not None]
    gross = [float(s["close"]["excess"]) for e in rows for s in (e.get("scores") or {}).values()
             if isinstance(s, dict) and isinstance(s.get("close"), dict) and s["close"].get("excess") is not None]
    net = [r for r in (primary_return(e) for e in rows) if r is not None]
    return {"setup": setup, "since": since, "n": len(rows),
            "filing_reaction_mean": sum(react) / len(react) if react else None,
            "filing_reaction_median": float(pd.Series(react).median()) if react else None,
            "follower_gross_mean": sum(gross) / len(gross) if gross else None,
            "follower_net_mean": sum(net) / len(net) if net else None}


def book_summary(events: Iterable[dict], month: str | None = None) -> list[dict]:
    """Monthly-report rows per setup: {"name", "signals", "closed", "mean_ret"} (the report's shadow-book shape).

    With `month` ("YYYY-MM"), signals are those dated in the month and closed those that exited in it.
    """
    rows = []
    events = list(events)
    for setup, label in SETUPS.items():
        mine = [e for e in events if e.get("setup") == setup]
        if month:
            signals = [e for e in mine if str(e.get("signal_date", ""))[:7] == month]
            closed = [e for e in mine if e.get("status") == "closed" and str(e.get("exit_date", ""))[:7] == month]
        else:
            signals, closed = mine, [e for e in mine if e.get("status") == "closed"]
        rets = [r for r in (primary_return(e) for e in closed) if r is not None]
        if signals or closed:
            rows.append({"name": f"EDGAR {setup} {label}", "signals": len(signals), "closed": len(closed),
                         "mean_ret": sum(rets) / len(rets) if rets else None})
    return rows
