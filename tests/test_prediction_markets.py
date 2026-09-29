"""Tests for traderec/data/prediction_markets.py: the rolling, rule-based market map that fails closed.

Offline: parsers and the pick rule on small fixtures trimmed from real Polymarket gamma and Kalshi responses
(recorded 2026-09-29, tests/fixtures/w8w9/), and the live adapter against a fake HTTP session. The live smoke tests
at the bottom run only with RUN_NETWORK_TESTS=1.
"""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any

import pytest
import requests

from traderec.config import load_config
from traderec.data.prediction_markets import (KALSHI_URL, POLYMARKET_URL, SEARCH_PAGES, Http, PredictionMarkets,
                                              family_quotes, market_date, normalise_kalshi_market,
                                              normalise_polymarket_market, pick_nearest, pick_on_or_after,
                                              release_dates_from_markets)
from traderec.data.providers import DataError

FIX = Path(__file__).parent / "fixtures" / "w8w9"
W8 = load_config().module("W8")
BLOCKADE = W8["markets"]["trigger"]["blockade_end"]
HORMUZ = W8["markets"]["trigger"]["hormuz_normal"]
CEASEFIRE = W8["markets"]["invalidation"]


def fixture(name: str) -> Any:
    return json.loads((FIX / name).read_text())


def quotes_from_search(payload: dict) -> list[dict]:
    return [normalise_polymarket_market(m, ev) for ev in payload["events"] for m in ev["markets"]]


class FakeResponse:
    def __init__(self, status_code: int = 200, payload: Any = None, text: str | None = None) -> None:
        self.status_code = status_code
        self.text = text if text is not None else json.dumps(payload)


class FakeSession:
    """Answers GETs with handler(url, params); records every call."""

    def __init__(self, handler) -> None:
        self.handler = handler
        self.calls: list[tuple[str, Any]] = []

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append((url, params))
        answer = self.handler(url, params)
        if isinstance(answer, Exception):
            raise answer
        return answer


def adapter(handler) -> tuple[PredictionMarkets, FakeSession, list[float]]:
    session, sleeps = FakeSession(handler), []
    return PredictionMarkets(Http(session=session, sleep=sleeps.append)), session, sleeps


# --- parsing ------------------------------------------------------------------------------------------------

def test_market_date_reads_names_with_and_without_a_year() -> None:
    assert market_date("December 31, 2026", "2026-12-31") == ("2026-12-31", None)
    assert market_date("October 31", "2026-10-31") == ("2026-10-31", None)
    assert market_date("Dec 1, 2026", "2026-12-01") == ("2026-12-01", None)
    assert market_date("January 31", "2027-01-31") == ("2027-01-31", None)
    assert market_date("December 31", "2027-01-01")[0] == "2026-12-31"        # end just after the name date
    date, problem = market_date("September 30", "2027-01-26")                  # a real gamma oddity
    assert date == "2026-09-30" and "disagree" in problem
    assert market_date("end of June", "2026-06-30")[0] is None


def test_polymarket_listed_resolved_and_flawed_markets() -> None:
    live = {"id": 1, "question": "Q?", "outcomes": '["Yes", "No"]', "outcomePrices": '["0.55", "0.45"]',
            "active": True, "closed": False, "acceptingOrders": True, "endDate": "2027-01-01T04:59:00Z"}
    q = normalise_polymarket_market(live)
    assert (q["yes"], q["listed"], q["resolved"], q["end"]) == (0.55, True, False, "2026-12-31")
    assert not normalise_polymarket_market(live, {"id": 9, "closed": True})["listed"]     # stale closed event
    done = normalise_polymarket_market({**live, "closed": True, "outcomePrices": '["1", "0"]',
                                        "umaResolutionStatus": "resolved"})
    assert (done["listed"], done["resolved"], done["outcome"]) == (False, True, "yes")
    halted = normalise_polymarket_market({**live, "closed": True, "outcomePrices": '["0.5", "0.5"]'})
    assert not halted["resolved"] and halted["problem"] == "closed but not resolved"
    assert normalise_polymarket_market({**live, "outcomePrices": '["1.5", "0"]'})["yes"] is None
    assert normalise_polymarket_market({**live, "outcomes": '["Up", "Down"]'})["problem"] == "no Yes outcome price"


def test_kalshi_market_mid_or_last() -> None:
    m = fixture("kalshi_markets.json")["KXHORMUZNORM"]["markets"][0]
    q = normalise_kalshi_market(m)
    assert q["venue"] == "kalshi" and q["listed"] and q["end"] and 0.0 <= q["yes"] <= 1.0
    settled = normalise_kalshi_market({**m, "status": "finalized", "result": "no"})
    assert settled["resolved"] and settled["outcome"] == "no" and not settled["listed"]
    one_sided = normalise_kalshi_market({**m, "yes_bid_dollars": "0.0000", "yes_ask_dollars": "1.0000",
                                         "last_price_dollars": "0.0100"})
    assert one_sided["yes"] == pytest.approx(0.01)


# --- the pick rule ----------------------------------------------------------------------------------------

def test_blockade_family_maps_like_track_17() -> None:
    quotes = family_quotes(quotes_from_search(fixture("pm_search_blockade.json")), BLOCKADE["pattern"])
    pick = pick_on_or_after(quotes, "2026-12-27")            # signal 28 Sep + 90 days -> "by Dec 31" (track 17)
    assert pick["status"] == "ok" and pick["date"] == "2026-12-31" and pick["market"]["id"] == "3128886"
    assert pick_on_or_after(quotes, "2026-10-28")["market"]["question"].endswith("October 31, 2026?")
    missing = pick_on_or_after(quotes, "2027-04-01")
    assert missing["status"] == "missing" and missing["market"] is None


def test_hormuz_family_ignores_other_wordings() -> None:
    quotes = family_quotes(quotes_from_search(fixture("pm_search_hormuz.json")), HORMUZ["pattern"])
    assert quotes and all(q["question"].startswith("Strait of Hormuz traffic returns to normal by") for q in quotes)
    assert not any("end of" in q["question"] for q in quotes)
    pick = pick_on_or_after(quotes, "2026-12-27")
    assert pick["status"] == "ok" and pick["date"] == "2026-12-31"


def test_ceasefire_map_skips_the_stale_closed_event() -> None:
    """Gamma still serves a closed event whose markets look open ("US-Iran ceasefire continues through October 31?"
    at 25.5%). Only the live event's market may be picked (56%)."""
    quotes = family_quotes(quotes_from_search(fixture("pm_search_ceasefire.json")), CEASEFIRE["pattern"])
    stale = [q for q in quotes if q["question"].startswith("US-Iran")]
    assert stale and not any(q["listed"] for q in stale)
    pick = pick_on_or_after(quotes, "2026-10-27")            # first listed date >= a 27 Oct time stop
    assert pick["status"] == "ok" and pick["market"]["id"] == "4641065" and pick["market"]["yes"] == 0.56


def test_duplicate_listed_markets_are_ambiguous() -> None:
    payload = fixture("pm_search_ceasefire.json")
    live = next(ev for ev in payload["events"] if not ev["closed"])
    twin = copy.deepcopy(live)
    twin["id"] = "999"
    for m in twin["markets"]:
        m["id"] = "9" + str(m["id"])
    payload["events"].append(twin)
    quotes = family_quotes(quotes_from_search(payload), CEASEFIRE["pattern"])
    pick = pick_on_or_after(quotes, "2026-10-27")
    assert pick["status"] == "ambiguous" and "2 listed markets" in pick["reason"]


def test_a_flawed_market_that_could_be_the_pick_is_ambiguous() -> None:
    payload = fixture("pm_search_blockade.json")
    market = next(m for m in payload["events"][0]["markets"] if m["id"] == "4906128")     # November 30, 2026
    market["endDate"] = "2027-03-01T04:59:00Z"                                            # name and end disagree
    quotes = family_quotes(quotes_from_search(payload), BLOCKADE["pattern"])
    assert pick_on_or_after(quotes, "2026-11-15")["status"] == "ambiguous"
    assert pick_on_or_after(quotes, "2026-12-15")["status"] == "ok"                       # not a candidate there


def test_trigger_markets_are_the_listed_date_nearest_90_days_out() -> None:
    """W8's trigger rule: the listed date nearest signal + 90 days, on or after the planned time stop. On 28 Sep 2026
    it names "by Dec 31" in both families (track 17), and it keeps a ~3-month horizon as the ladders roll."""
    blockade = family_quotes(quotes_from_search(fixture("pm_search_blockade.json")), BLOCKADE["pattern"])
    hormuz = family_quotes(quotes_from_search(fixture("pm_search_hormuz.json")), HORMUZ["pattern"])
    assert pick_nearest(blockade, "2026-12-27", "2026-10-27")["date"] == "2026-12-31"      # 28 Sep
    assert pick_nearest(hormuz, "2026-12-27", "2026-10-27")["date"] == "2026-12-31"
    assert pick_nearest(blockade, "2027-01-12", "2026-11-13")["date"] == "2026-12-31"      # 14 Oct
    assert pick_nearest(blockade, "2027-02-18", "2026-12-21")["date"] == "2027-03-31"      # 20 Nov
    assert pick_nearest(hormuz, "2027-02-18", "2026-12-21")["date"] == "2026-12-31"
    assert pick_nearest(hormuz, "2027-04-01", "2027-01-15")["status"] == "missing"
    assert pick_nearest(blockade, "2026-12-27", "2026-10-27", incomplete=True)["status"] == "ambiguous"


def test_pick_nearest_fails_closed_on_duplicates_and_flawed_markets() -> None:
    quotes = family_quotes(quotes_from_search(fixture("pm_search_blockade.json")), BLOCKADE["pattern"])
    dup = [*quotes, {**next(q for q in quotes if q["id"] == "3128886"), "id": "dup"}]
    assert pick_nearest(dup, "2026-12-27", "2026-10-27")["status"] == "ambiguous"
    flawed = [{**q, "problem": "name date and end date disagree"} if q["id"] == "4906129" else q for q in quotes]
    assert pick_nearest(flawed, "2026-12-27", "2026-10-27")["status"] == "ok"                # further than Dec 31
    assert pick_nearest(flawed, "2027-03-01", "2026-10-27")["status"] == "ambiguous"         # as near as the pick


def test_an_incomplete_listing_fails_closed() -> None:
    quotes = family_quotes(quotes_from_search(fixture("pm_search_blockade.json")), BLOCKADE["pattern"])
    assert pick_on_or_after(quotes, "2026-12-27", incomplete=True)["status"] == "ambiguous"


def test_release_dates_from_kalshi_markets() -> None:
    k = fixture("kalshi_markets.json")
    assert release_dates_from_markets(k["KXFEDDECISION"]["markets"])[:2] == ["2026-10-28", "2026-12-09"]
    assert release_dates_from_markets(k["KXCPI"]["markets"])[:3] == ["2026-10-14", "2026-11-10", "2026-12-10"]
    assert release_dates_from_markets(k["KXPAYROLLS"]["markets"])[:3] == ["2026-10-02", "2026-11-06", "2026-12-04"]


# --- the live adapter on a fake session ---------------------------------------------------------------------

def test_family_search_and_pagination() -> None:
    page = fixture("pm_search_blockade.json")

    def handler(url, params):
        assert url == f"{POLYMARKET_URL}/public-search" and params["q"] == "Iranian blockade"
        more = params["page"] == 1
        return FakeResponse(payload={**page, "pagination": {"hasMore": more}} if more else
                            {"events": [], "pagination": {"hasMore": False}})
    pm, session, _ = adapter(handler)
    fam = pm.family(BLOCKADE)
    assert not fam["incomplete"] and len(session.calls) == 2 and len(pm.payload_sha256) == 2
    assert pick_on_or_after(fam["quotes"], "2026-12-27")["market"]["id"] == "3128886"

    pm, session, _ = adapter(lambda url, params: FakeResponse(payload={**page, "pagination": {"hasMore": True}}))
    fam = pm.family(BLOCKADE)
    assert fam["incomplete"] and len(session.calls) == SEARCH_PAGES
    assert pick_on_or_after(fam["quotes"], "2026-12-27")["status"] == "ambiguous"


def test_refresh_merges_open_and_closed_markets() -> None:
    by_id = fixture("pm_markets_by_id.json")

    def handler(url, params):
        assert url == f"{POLYMARKET_URL}/markets"
        closed = dict(params)["closed"]
        assert sorted(v for k, v in params if k == "id") == ["2910435", "3128886", "4641065"]
        return FakeResponse(payload=by_id[closed])
    pm, session, _ = adapter(handler)
    got = pm.refresh(["3128886", "4641065", "2910435"])
    assert set(got) == {"3128886", "4641065", "2910435"} and len(session.calls) == 2
    assert got["2910435"]["resolved"] and got["2910435"]["outcome"] == "no"
    assert got["4641065"]["listed"] and got["4641065"]["yes"] == 0.56
    assert pm.refresh([]) == {}


def test_release_calendar_fails_closed_on_an_empty_series() -> None:
    k = fixture("kalshi_markets.json")

    def handler(url, params):
        assert url == f"{KALSHI_URL}/markets" and params["status"] == "open"
        return FakeResponse(payload=k.get(params["series_ticker"], {"markets": [], "cursor": ""}))
    pm, _, _ = adapter(handler)
    cal = pm.release_dates({"FOMC": "KXFEDDECISION", "CPI": "KXCPI", "NFP": "KXPAYROLLS"})
    assert cal["FOMC"][0] == "2026-10-28" and cal["CPI"][0] == "2026-10-14" and cal["NFP"][0] == "2026-10-02"
    with pytest.raises(DataError):
        pm.release_dates({"XX": "KXNOSUCHSERIES"})


def test_kalshi_family() -> None:
    k = fixture("kalshi_markets.json")
    pm, _, _ = adapter(lambda url, params: FakeResponse(payload=k["KXHORMUZNORM"]))
    spec = {"venue": "kalshi", "series": "KXHORMUZNORM",
            "pattern": r"^Will the .*Strait of Hormuz.* before (?P<date>[A-Z][a-z]+ \d{1,2}, \d{4})\?$"}
    fam = pm.family(spec)
    assert fam["quotes"] and all(q["date"] and not q["problem"] for q in fam["quotes"])
    with pytest.raises(DataError):
        pm.family({**spec, "venue": "nowhere"})


def test_http_retry_policy() -> None:
    answers = [FakeResponse(503, text="busy"), requests.ConnectionError("reset"), FakeResponse(payload={"ok": 1})]
    pm, session, sleeps = adapter(lambda url, params: answers.pop(0))
    assert pm.http.get_json("https://example.test/x") == {"ok": 1}
    assert sleeps == [1.0, 2.0] and len(session.calls) == 3
    pm, session, sleeps = adapter(lambda url, params: FakeResponse(404, text="nope"))
    with pytest.raises(DataError, match="HTTP 404"):
        pm.http.get_json("https://example.test/x")
    assert len(session.calls) == 1 and sleeps == []
    pm, _, _ = adapter(lambda url, params: FakeResponse(200, text="<html>"))
    with pytest.raises(DataError, match="invalid JSON"):
        pm.http.get_json("https://example.test/x")


# --- live smoke tests (RUN_NETWORK_TESTS=1) -----------------------------------------------------------------

network = pytest.mark.skipif(os.environ.get("RUN_NETWORK_TESTS") != "1",
                             reason="live smoke test: set RUN_NETWORK_TESTS=1 to reach Polymarket and Kalshi")


@network
@pytest.mark.parametrize("name", ["blockade_end", "hormuz_normal"])
def test_live_trigger_families_map(name: str) -> None:
    fam = PredictionMarkets().family(W8["markets"]["trigger"][name])
    assert fam["quotes"] and not fam["incomplete"]
    assert all(q["date"] for q in fam["quotes"] if q["listed"])


@network
def test_live_release_calendar() -> None:
    cal = PredictionMarkets().release_dates(W8["release_ban"]["series"])
    assert set(cal) == {"FOMC", "CPI", "NFP"} and all(cal.values())
