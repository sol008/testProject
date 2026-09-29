"""Owner feedback: the fills recorded as comments on each trade's GitHub issue (design §7 go-live gates).

Every order-bearing email opens a GitHub issue. The owner answers with one comment per order:

    filled 6000 @ 766.10          (dollars @ price; "$" and thousands commas are fine)
    filled 2500 @ 612.40 QQQ      (the ticker last, or first, for emails with several orders)
    filled 2 @ 7.45 XSP           (option spreads: contracts @ net price per share; "2 contracts" is fine)
    skipped   /   skipped QQQ

The monthly job reads the comments of the month's issues and measures two go-live gates:
- emails handled: the share of issues with at least one "filled" or "skipped" comment (target >= 90%);
- practice fills vs the fill model: the gap between the owner's price and the paper broker's fill price for
  the same order, in basis points (target: median within 10 bp).

Option spreads (docs/PHASE_B_CONTRACTS.md §8) are measured apart, because their gaps are of another size:
- the gap is in basis points of the net price per share: of the debit when opening, of the credit when
  closing. Each spread row also carries the gap in dollars per contract (`gap_usd`), for the reports;
- the gate is a median gap within SPREAD_FILL_TOLERANCE_BPS (200 bp, 2% of the net price). That is the room the
  fill model leaves between the order's limit (mid + 0.3 x the natural width) and its stated maximum
  (mid + 0.5 x the natural width) once the liquidity rule holds (natural width <= 10% of the debit; design §4);
- `fills_ok` passes only when every measured group (ETFs, spreads) is within its tolerance;
- a price typed per contract (745 for a 7.45 spread) is read as per share.
A paper fill is a spread fill when it says so (`order_type`, `multiplier` above 1 or `legs`) or, for fills stored
with the Phase A keys only, when its module trades nothing but spreads (SPREAD_MODULES).
"""
from __future__ import annotations

import os
import re
from typing import Any, Callable

import requests

GITHUB_API = "https://api.github.com"
TIMEOUT = 20
FILL_TOLERANCE_BPS = 10.0
SPREAD_FILL_TOLERANCE_BPS = 200.0     # option spreads: median gap in bp of the net price (see the docstring)
SPREAD_MODULES = frozenset({"M4", "W8", "W9"})   # modules whose orders are all spreads (runners.SPREAD_MODULES)
CONTRACT_MULTIPLIER = 100             # one option contract = 100 x the per-share price

_NUM = r"\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
_TICKER = r"[A-Z][A-Z0-9.\-]{0,9}"
_UNIT = r"(?:\s*(?:contracts?|spreads?|x)\b)?"      # "filled 2 contracts @ 7.45" (spreads)
_FILLED = re.compile(rf"(?im)^\s*(?:(?P<ticker>{_TICKER})\s+)?filled\s+{_NUM}{_UNIT}\s*@\s*{_NUM}"
                     rf"(?:[ \t]+(?P<after>{_TICKER})\b)?")
_SKIPPED = re.compile(rf"(?im)^\s*(?:(?P<ticker>{_TICKER})\s+)?skip(?:ped)?\b(?:[ \t]+(?P<after>{_TICKER})\b)?")
_ISSUE = re.compile(r"^https://github\.com/(?P<repo>[^/\s]+/[^/\s]+)/issues/(?P<num>\d+)/?$")


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def _ticker(m: re.Match) -> str | None:
    """The ticker before or after the line's verb, upper-cased; the case-insensitive match lets "i" words in."""
    for t in (m.group("ticker"), m.group("after")):
        if t and t.isupper():
            return t
    return None


def parse_comment(body: str) -> list[dict[str, Any]]:
    """Every fill or skip line in one comment: [{"status": "filled"|"skipped", "ticker", "dollars", "price"}].

    `dollars` is the first number of the line: dollars for ETF orders, the number of contracts for option spreads
    (`match_fills` reports it as `contracts` once it knows the order was a spread)."""
    out: list[dict[str, Any]] = []
    for m in _FILLED.finditer(body or ""):
        out.append({"status": "filled", "ticker": _ticker(m), "dollars": _num(m.group(2)),
                    "price": _num(m.group(3))})
    for m in _SKIPPED.finditer(body or ""):
        out.append({"status": "skipped", "ticker": _ticker(m), "dollars": None, "price": None})
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


def _multiplier(fill: dict) -> float | None:
    """The contract multiplier a fill records (spread fills: 100), or None."""
    m = fill.get("multiplier")
    return float(m) if isinstance(m, (int, float)) and not isinstance(m, bool) and m > 1 else None


def is_spread_fill(fill: dict) -> bool:
    """True for a paper fill of an option spread (see the module docstring)."""
    if fill.get("order_type") == "spread_limit" or fill.get("legs") or _multiplier(fill):
        return True
    return fill.get("module") in SPREAD_MODULES


def match_fills(issue: dict, recorded: list[dict], model_fills: list[dict]) -> list[dict]:
    """Pair the owner's fills with the paper fills of the same trade: [{"ticker", "owner", "model", "gap_bps"}].

    A recorded fill without a ticker matches the issue's only ticker (single-order emails). The gap is signed
    so that a positive number is worse for the owner: paid more on a buy, received less on a sell. Option spread
    rows also carry "spread": True, "contracts" (the comment's first number) and "gap_usd", the gap in dollars
    per contract; their prices are net per share of the spread, so "gap_bps" is in bp of the debit (or credit).
    """
    tickers = issue.get("tickers") or []
    latest: dict[str, dict] = {}            # a correction is a new comment: the latest line per ticker wins
    for r in recorded:
        ticker = r["ticker"] or (tickers[0] if len(tickers) == 1 else None)
        if ticker:
            latest[ticker] = r
    out = []
    for ticker, r in latest.items():
        if r["status"] != "filled":
            continue
        model = next((f for f in model_fills if f["ticker"] == ticker and f["trade_id"] == issue["trade_id"]
                      and f.get("fill_date", "") > issue.get("date", "")), None)
        if not ticker or model is None or not model.get("price"):
            continue
        side = 1.0 if model["side"] == "buy" else -1.0
        model_price, owner = float(model["price"]), r["price"]
        if not is_spread_fill(model):
            gap = side * (owner / model_price - 1.0) * 1e4
            out.append({"ticker": ticker, "owner": owner, "model": model_price, "gap_bps": gap})
            continue
        multiplier = _multiplier(model) or CONTRACT_MULTIPLIER
        if multiplier / 2 <= owner / model_price <= multiplier * 2:     # typed per contract (745 for 7.45)
            owner = owner / multiplier
        contracts = r["dollars"]
        out.append({"ticker": ticker, "owner": owner, "model": model_price,
                    "gap_bps": side * (owner / model_price - 1.0) * 1e4, "spread": True,
                    "contracts": int(contracts) if float(contracts).is_integer() else contracts,
                    "gap_usd": side * (owner - model_price) * multiplier})
    return out


def _median_abs_gap(rows: list[dict]) -> float | None:
    gaps = sorted(abs(f["gap_bps"]) for f in rows)
    if not gaps:
        return None
    mid = len(gaps) // 2
    return gaps[mid] if len(gaps) % 2 else (gaps[mid - 1] + gaps[mid]) / 2


def review(issues: list[dict], model_fills: list[dict], *,
           fetch: Callable[[str], list[str] | None] = fetch_comments) -> dict[str, Any]:
    """Gate inputs for the monthly report from the month's trade issues.

    Returns {"issues", "handled", "measured", "fills": [...], "median_gap_bps", "spread_fills": [...],
    "spread_median_gap_bps", "spread_fills_ok", "fills_ok"}. `fills` and `median_gap_bps` are the ETF orders,
    `spread_*` the option spreads (bp of the net price); `fills_ok` needs every measured group within its
    tolerance. `handled` and the `*_ok` keys are None when GitHub could not be read or nothing was measured.
    """
    handled, measured, fills, spread_fills = 0, 0, [], []
    for issue in issues:
        comments = fetch(issue["url"])
        if comments is None:
            continue
        measured += 1
        recorded = [r for body in comments for r in parse_comment(body)]
        if recorded:
            handled += 1
        for row in match_fills(issue, recorded, model_fills):
            (spread_fills if row.get("spread") else fills).append(row)
    median, spread_median = _median_abs_gap(fills), _median_abs_gap(spread_fills)
    etf_ok = None if median is None else median <= FILL_TOLERANCE_BPS
    spread_ok = None if spread_median is None else spread_median <= SPREAD_FILL_TOLERANCE_BPS
    checks = [ok for ok in (etf_ok, spread_ok) if ok is not None]
    return {
        "issues": len(issues), "measured": measured, "handled": handled if measured else None,
        "fills": fills, "median_gap_bps": median,
        "spread_fills": spread_fills, "spread_median_gap_bps": spread_median, "spread_fills_ok": spread_ok,
        "fills_ok": all(checks) if checks else None,
    }
