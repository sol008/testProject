"""Owner feedback: the fills recorded as comments on each trade's GitHub issue (design §7 go-live gates).

Every order-bearing email opens a GitHub issue. The owner answers with one comment per order:

    filled 6000 @ 766.10          (dollars @ price; "$" and thousands commas are fine)
    filled 2500 @ 612.40 QQQ      (the ticker last, or first, for emails with several orders)
    filled 2 @ 7.45 XSP           (option spreads: contracts @ net price per share; "2 contracts" is fine)
    skipped   /   skipped QQQ

The monthly job reads the comments of the month's issues and measures two go-live gates:
- emails handled: the share of issues with at least one "filled" or "skipped" comment (target >= 90%);
- execution realism, as pre-registered in track 18 §5.4(3) (research/18-short-horizon-execution-sizing-paper.md):
  "practice-account fills differ from the fill model by <= 10 bp on average for stocks/ETFs and <= 20% of the
  half-spread for options. Otherwise make the model more conservative and restart the looks."

How the rule is measured here:
- a gap compares the owner's price with the paper broker's fill price for the same order, signed so that a positive
  number is worse for the owner (paid more on a buy, received less on a sell);
- ETFs: the AVERAGE gap in bp of the model price must be at most FILL_TOLERANCE_BPS (10 bp);
- option spreads: each gap is expressed in half-spreads, the half-spread being half the natural width (the sum of
  the legs' ask - bid) that the paper fill stored from the 10:17 ET quote; the AVERAGE of these must be at most
  SPREAD_FILL_TOLERANCE_HALF_SPREAD (20%). A spread fill stored without a natural width (a settlement at expiry, an
  older state) cannot be put in half-spreads: it is reported but left out of that average;
- both averages are one-sided, as the rule's remedy is: fills worse than the model fail the gate ("make the model more
  conservative"); fills better than the model pass it, and the quarterly cost review reports them (a cheaper model
  needs 60 practice fills, track 18 §6.1);
- `fills_ok` passes only when every measured group (ETFs, spreads) is within its tolerance, and is None when nothing
  was measured. The medians of |gap| (`median_gap_bps`, `spread_median_gap_bps`) and the counts are reported too, so
  a review can see whether one fill drives an average.

A typo must not decide the gate, so each "filled" line is checked before it counts, and rejected with a reason
(logged, and listed in `review()["rejected"]`) when:
- a number is malformed ("7.45.5"), or the price is not above zero;
- an ETF amount is not above zero;
- a spread's contract count is not a whole number of at least one, or exceeds the order (the paper fill's contracts;
  MAX_CONTRACTS when the fill does not record them);
- the ticker is not one of the email's orders;
- the gap is more than MAX_GAP (50%) of the model price: a slipped decimal or a wrong field, not a fill.
A spread price may be typed per share (7.45), per contract (745) or as the order's total (1490 for 2 contracts, the
"total should be about $1,490" of the email): the comment's contract count gives the total's divisor, and the reading
closest to the model's price is used. A paper fill is a spread fill when it says so (`order_type`, `multiplier` above
1 or `legs`) or, for fills stored with the Phase A keys only, when its module trades nothing but spreads
(SPREAD_MODULES).
"""
from __future__ import annotations

import logging
import math
import os
import re
from typing import Any, Callable

import requests

log = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
TIMEOUT = 20
FILL_TOLERANCE_BPS = 10.0                  # ETFs: the average gap, bp of the model price (track 18 §5.4(3))
SPREAD_FILL_TOLERANCE_HALF_SPREAD = 0.20   # option spreads: the average gap, in half-spreads (track 18 §5.4(3))
MAX_GAP = 0.50                             # a gap beyond 50% of the model price is a typo, not a fill
MAX_CONTRACTS = 100                        # contracts, when the paper fill does not record the order's own count
SPREAD_MODULES = frozenset({"M4", "W8", "W9"})   # modules whose orders are all spreads (runners.SPREAD_MODULES)
CONTRACT_MULTIPLIER = 100                  # one option contract = 100 x the per-share price

_LOOSE = r"[-−]?\s*\$?\s*\d[\d,.]*"        # a number as typed; checked strictly by _number()
_STRICT = re.compile(r"^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$")
_TICKER = r"(?-i:[A-Z][A-Z0-9.\-]{0,9})"    # upper case only: "not skipped" or "I" + verb is no ticker line
_UNIT = r"(?:\s*(?:contracts?|spreads?|x)\b)?"      # "filled 2 contracts @ 7.45" (spreads)
_FILLED = re.compile(rf"(?im)^\s*(?:(?P<ticker>{_TICKER})\s+)?filled\s+(?P<qty>{_LOOSE}){_UNIT}\s*@\s*"
                     rf"(?P<price>{_LOOSE})(?:[ \t]+(?P<after>{_TICKER})\b)?")
_SKIPPED = re.compile(rf"(?im)^\s*(?:(?P<ticker>{_TICKER})\s+)?skip(?:ped)?\b(?:[ \t]+(?P<after>{_TICKER})\b)?")
_ISSUE = re.compile(r"^https://github\.com/(?P<repo>[^/\s]+/[^/\s]+)/issues/(?P<num>\d+)/?$")


def _number(s: str) -> float | None:
    """A typed number ("$13,077", "7.45", "-2"), or None when it is malformed ("7.45.5", "1,2,3")."""
    t = s.replace(" ", "").replace("\t", "").replace("$", "").replace("−", "-").rstrip(".,")
    sign = -1.0 if t.startswith("-") else 1.0
    t = t.lstrip("-")
    if not _STRICT.match(t):
        return None
    return sign * float(t.replace(",", ""))


def _ticker(m: re.Match) -> str | None:
    """The ticker before or after the line's verb."""
    return m.group("ticker") or m.group("after") or None


def parse_comment(body: str) -> list[dict[str, Any]]:
    """Every fill or skip line in one comment: [{"status": "filled"|"skipped", "ticker", "dollars", "price", "line"}].

    `dollars` is the first number of the line: dollars for ETF orders, the number of contracts for option spreads
    (`match_fills` reports it as `contracts` once it knows the order was a spread). A malformed number is None, with
    "problem" saying why; `match_fills` rejects such a line."""
    out: list[dict[str, Any]] = []
    for m in _FILLED.finditer(body or ""):
        qty, price = _number(m.group("qty")), _number(m.group("price"))
        row = {"status": "filled", "ticker": _ticker(m), "dollars": qty, "price": price, "line": m.group(0).strip()}
        bad = [f'"{m.group(k).strip()}" is not a number' for k, v in (("qty", qty), ("price", price)) if v is None]
        if bad:
            row["problem"] = "; ".join(bad)
        out.append(row)
    for m in _SKIPPED.finditer(body or ""):
        out.append({"status": "skipped", "ticker": _ticker(m), "dollars": None, "price": None,
                    "line": m.group(0).strip()})
    return out


def api_comments_url(issue_url: str) -> str | None:
    m = _ISSUE.match((issue_url or "").strip())
    if not m:
        return None
    return f"{GITHUB_API}/repos/{m.group('repo')}/issues/{m.group('num')}/comments"


def fetch_comments(issue_url: str, *, get: Callable[..., Any] = requests.get) -> list[str] | None:
    """Comment bodies of an issue (oldest first), or None when GitHub is unavailable (no token, error)."""
    url = api_comments_url(issue_url)
    token = os.environ.get("GITHUB_TOKEN")
    if not url or not token:
        return None
    try:
        resp = get(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                                 "X-GitHub-Api-Version": "2022-11-28"}, params={"per_page": 100}, timeout=TIMEOUT)
    except requests.RequestException:
        return None
    if getattr(resp, "status_code", 0) != 200:
        return None
    try:
        return [str(c.get("body") or "") for c in resp.json()]
    except (ValueError, AttributeError):
        return None


def _num(x: Any) -> float | None:
    if isinstance(x, bool) or x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _multiplier(fill: dict) -> float | None:
    """The contract multiplier a fill records (spread fills: 100), or None."""
    m = fill.get("multiplier")
    return float(m) if isinstance(m, (int, float)) and not isinstance(m, bool) and m > 1 else None


def is_spread_fill(fill: dict) -> bool:
    """True for a paper fill of an option spread (see the module docstring)."""
    if fill.get("order_type") == "spread_limit" or fill.get("legs") or _multiplier(fill):
        return True
    return fill.get("module") in SPREAD_MODULES


def _ordered_contracts(model: dict, multiplier: float) -> int | None:
    """The order's contracts, from the paper fill: its qty, else its dollars / (price x multiplier)."""
    qty = _num(model.get("qty"))
    if qty is not None and qty >= 1:
        return int(round(qty))
    dollars, price = _num(model.get("dollars")), _num(model.get("price"))
    if dollars and price and price > 0:
        n = abs(dollars) / (price * multiplier)
        return int(round(n)) if n >= 0.5 else None
    return None


def spread_price_per_share(price: float, contracts: float, model_price: float,
                           multiplier: float = CONTRACT_MULTIPLIER) -> tuple[float, str]:
    """The owner's spread price per share and how it was typed: "per share" (7.45), "per contract" (745) or "total"
    (1490 for 2 contracts). The reading closest to the model's price (by ratio) wins."""
    readings = [(price, "per share"), (price / multiplier, "per contract")]
    if contracts and contracts > 1:
        readings.append((price / (contracts * multiplier), "total"))
    return min(readings, key=lambda r: abs(math.log(r[0] / model_price)))


def match_fills(issue: dict, recorded: list[dict], model_fills: list[dict],
                rejected: list[dict] | None = None) -> list[dict]:
    """Pair the owner's fills with the paper fills of the same trade: [{"ticker", "owner", "model", "gap_bps"}].

    A recorded fill without a ticker matches the issue's only ticker (single-order emails). The gap is signed so that
    a positive number is worse for the owner. Option spread rows also carry "spread": True, "contracts", "typed" (per
    share, per contract or total), "gap_usd" (dollars per contract), "half_spread" and "gap_half_spread" (the gap in
    half-spreads, None when the paper fill has no natural width); their prices are net per share, so "gap_bps" is in
    bp of the debit (or credit). A line that fails a check (module docstring) is left out, logged, and appended to
    `rejected` as {"url", "trade_id", "ticker", "line", "reason"}.
    """
    tickers = issue.get("tickers") or []
    out: list[dict] = []

    def reject(r: dict, ticker: str | None, reason: str) -> None:
        entry = {"url": issue.get("url"), "trade_id": issue.get("trade_id"), "ticker": ticker,
                 "line": r.get("line") or "", "reason": reason}
        log.warning("fill comment not used for %s %s: %r (%s)", issue.get("trade_id"), ticker or "", entry["line"],
                    reason)
        if rejected is not None:
            rejected.append(entry)

    latest: dict[str, dict] = {}            # a correction is a new comment: the latest line per ticker wins
    for r in recorded:
        ticker = r["ticker"] or (tickers[0] if len(tickers) == 1 else None)
        if ticker is None:
            if r["status"] == "filled":
                reject(r, None, "no ticker, and the email has several orders")
            continue
        if tickers and ticker not in tickers:
            if r["status"] == "filled":
                reject(r, ticker, f"{ticker} is not an order in this email ({', '.join(tickers)})")
            continue
        latest[ticker] = r
    for ticker, r in latest.items():
        if r["status"] != "filled":
            continue
        model = next((f for f in model_fills if f["ticker"] == ticker and f["trade_id"] == issue["trade_id"]
                      and f.get("fill_date", "") > issue.get("date", "")), None)
        model_price = _num(model.get("price")) if model is not None else None
        if model_price is None or model_price <= 0:
            continue                         # no paper fill to compare with (not filled, or settled at zero)
        if r.get("problem"):
            reject(r, ticker, r["problem"])
            continue
        owner = r["price"]
        if owner is None or owner <= 0:
            reject(r, ticker, "the price must be above zero")
            continue
        side = 1.0 if model["side"] == "buy" else -1.0
        if not is_spread_fill(model):
            if r["dollars"] is None or r["dollars"] <= 0:
                reject(r, ticker, "the dollar amount must be above zero")
                continue
            if abs(owner / model_price - 1.0) > MAX_GAP:
                reject(r, ticker, f"{owner:g} is more than {MAX_GAP:.0%} away from the model's {model_price:g}: a typo?")
                continue
            out.append({"ticker": ticker, "owner": owner, "model": model_price,
                        "gap_bps": side * (owner / model_price - 1.0) * 1e4})
            continue
        multiplier = _multiplier(model) or CONTRACT_MULTIPLIER
        contracts = r["dollars"]
        if contracts is None or contracts < 1 or not float(contracts).is_integer():
            reject(r, ticker, "the number of contracts must be a whole number of at least one")
            continue
        ordered = _ordered_contracts(model, multiplier)
        cap = ordered if ordered is not None else MAX_CONTRACTS
        if contracts > cap:
            reject(r, ticker, f"{contracts:g} contracts is more than the order's {cap}"
                   + ("" if ordered is not None else " (a sanity cap)"))
            continue
        per_share, typed = spread_price_per_share(owner, contracts, model_price, multiplier)
        if abs(per_share / model_price - 1.0) > MAX_GAP:
            reject(r, ticker, f"{owner:g} is more than {MAX_GAP:.0%} away from the model's {model_price:g} per share, "
                              "however it is read: a typo?")
            continue
        width = _num(model.get("natural_width"))
        half = width / 2.0 if width and width > 0 else None
        if half is None:
            log.info("spread fill %s %s has no natural width: left out of the half-spread average",
                     issue.get("trade_id"), ticker)
        out.append({"ticker": ticker, "owner": per_share, "model": model_price,
                    "gap_bps": side * (per_share / model_price - 1.0) * 1e4, "spread": True,
                    "contracts": int(contracts), "typed": typed,
                    "gap_usd": side * (per_share - model_price) * multiplier, "half_spread": half,
                    "gap_half_spread": side * (per_share - model_price) / half if half else None})
    return out


def _median(xs: list[float]) -> float | None:
    s = sorted(xs)
    if not s:
        return None
    mid = len(s) // 2
    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2


def _mean(xs: list[float]) -> float | None:
    return sum(xs) / len(xs) if xs else None


_EPS = 1e-9                                # float noise at the boundary: "at most 10 bp" includes 10.000000000001


def etf_gate(rows: list[dict]) -> dict[str, Any]:
    """Track 18 §5.4(3) for stocks and ETFs: the average gap at most FILL_TOLERANCE_BPS (one-sided)."""
    gaps = [float(r["gap_bps"]) for r in rows]
    mean = _mean(gaps)
    return {"n": len(gaps), "mean_gap_bps": mean, "median_gap_bps": _median([abs(g) for g in gaps]),
            "ok": None if mean is None else mean <= FILL_TOLERANCE_BPS + _EPS}


def spread_gate(rows: list[dict]) -> dict[str, Any]:
    """Track 18 §5.4(3) for options: the average gap at most 20% of the half-spread (one-sided), over the spread
    fills whose paper fill stored a natural width."""
    measured = [float(r["gap_half_spread"]) for r in rows if r.get("gap_half_spread") is not None]
    mean = _mean(measured)
    return {"n": len(rows), "measured": len(measured), "mean_gap_half_spread": mean,
            "median_gap_half_spread": _median([abs(g) for g in measured]),
            "median_gap_bps": _median([abs(float(r["gap_bps"])) for r in rows]),
            "ok": None if mean is None else mean <= SPREAD_FILL_TOLERANCE_HALF_SPREAD + _EPS}


def review(issues: list[dict], model_fills: list[dict], *,
           fetch: Callable[[str], list[str] | None] = fetch_comments) -> dict[str, Any]:
    """Gate inputs for the monthly report from the month's trade issues.

    Returns {"issues", "measured", "handled",
    ETFs: "fills" (rows), "n", "mean_gap_bps" (the gate's statistic), "median_gap_bps" (median |gap|),
    "etf_fills_ok", "tolerance_bps";
    spreads: "spread_fills" (rows), "spread_n", "spread_measured" (rows with a half-spread),
    "spread_mean_gap_half_spread" (the gate's statistic), "spread_median_gap_half_spread", "spread_median_gap_bps"
    (median |gap| in bp of the net price), "spread_fills_ok", "spread_tolerance_half_spread";
    "fills_ok" (every measured group within its tolerance), "rejected" (lines not used, with the reason)}.
    `handled` and the `*_ok` keys are None when GitHub could not be read or nothing was measured.
    """
    handled, measured, fills, spread_fills, rejected = 0, 0, [], [], []
    for issue in issues:
        comments = fetch(issue["url"])
        if comments is None:
            continue
        measured += 1
        recorded = [r for body in comments for r in parse_comment(body)]
        if recorded:
            handled += 1
        for row in match_fills(issue, recorded, model_fills, rejected):
            (spread_fills if row.get("spread") else fills).append(row)
    etf, spread = etf_gate(fills), spread_gate(spread_fills)
    checks = [ok for ok in (etf["ok"], spread["ok"]) if ok is not None]
    return {
        "issues": len(issues), "measured": measured, "handled": handled if measured else None,
        "fills": fills, "n": etf["n"], "mean_gap_bps": etf["mean_gap_bps"], "median_gap_bps": etf["median_gap_bps"],
        "etf_fills_ok": etf["ok"], "tolerance_bps": FILL_TOLERANCE_BPS,
        "spread_fills": spread_fills, "spread_n": spread["n"], "spread_measured": spread["measured"],
        "spread_mean_gap_half_spread": spread["mean_gap_half_spread"],
        "spread_median_gap_half_spread": spread["median_gap_half_spread"],
        "spread_median_gap_bps": spread["median_gap_bps"], "spread_fills_ok": spread["ok"],
        "spread_tolerance_half_spread": SPREAD_FILL_TOLERANCE_HALF_SPREAD,
        "fills_ok": all(checks) if checks else None, "rejected": rejected,
    }
