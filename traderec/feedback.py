"""Owner feedback: the fills recorded as comments on each trade's GitHub issue (design §7 go-live gates).

Every order-bearing email opens a GitHub issue. The owner answers with one comment per order:

    filled 6000 @ 766.10          (dollars @ price; "$" and thousands commas are fine)
    filled 2500 @ 612.40 QQQ      (the ticker last, or first, for emails with several orders)
    skipped   /   skipped QQQ

The monthly job reads the comments of the month's issues and measures two go-live gates:
- emails handled: the share of issues with at least one "filled" or "skipped" comment (target >= 90%);
- practice fills vs the fill model: the gap between the owner's price and the paper broker's fill price for
  the same order, in basis points (target: median within 10 bp).
"""
from __future__ import annotations

import os
import re
from typing import Any, Callable

import requests

GITHUB_API = "https://api.github.com"
TIMEOUT = 20
FILL_TOLERANCE_BPS = 10.0

_NUM = r"\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
_TICKER = r"[A-Z][A-Z0-9.\-]{0,9}"
_FILLED = re.compile(rf"(?im)^\s*(?:(?P<ticker>{_TICKER})\s+)?filled\s+{_NUM}\s*@\s*{_NUM}"
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
    """Every fill or skip line in one comment: [{"status": "filled"|"skipped", "ticker", "dollars", "price"}]."""
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


def match_fills(issue: dict, recorded: list[dict], model_fills: list[dict]) -> list[dict]:
    """Pair the owner's fills with the paper fills of the same trade: [{"ticker", "owner", "model", "gap_bps"}].

    A recorded fill without a ticker matches the issue's only ticker (single-order emails). The gap is signed
    so that a positive number is worse for the owner: paid more on a buy, received less on a sell.
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
        gap = side * (r["price"] / float(model["price"]) - 1.0) * 1e4
        out.append({"ticker": ticker, "owner": r["price"], "model": float(model["price"]), "gap_bps": gap})
    return out


def review(issues: list[dict], model_fills: list[dict], *,
           fetch: Callable[[str], list[str] | None] = fetch_comments) -> dict[str, Any]:
    """Gate inputs for the monthly report from the month's trade issues.

    Returns {"issues", "handled", "measured", "fills": [...], "median_gap_bps", "fills_ok"}; `handled` and
    `fills_ok` are None when GitHub could not be read.
    """
    handled, measured, fills = 0, 0, []
    for issue in issues:
        comments = fetch(issue["url"])
        if comments is None:
            continue
        measured += 1
        recorded = [r for body in comments for r in parse_comment(body)]
        if recorded:
            handled += 1
        fills += match_fills(issue, recorded, model_fills)
    gaps = sorted(abs(f["gap_bps"]) for f in fills)
    median = None
    if gaps:
        mid = len(gaps) // 2
        median = gaps[mid] if len(gaps) % 2 else (gaps[mid - 1] + gaps[mid]) / 2
    return {
        "issues": len(issues), "measured": measured, "handled": handled if measured else None,
        "fills": fills, "median_gap_bps": median,
        "fills_ok": None if median is None else median <= FILL_TOLERANCE_BPS,
    }
