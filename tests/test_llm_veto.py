"""Tests for traderec/llm_veto.py, the frozen W8/W9 LLM veto (design v3.3 §3 M5; red team M9).

Offline only. The API response fixture (tests/fixtures/w8w9/veto_response_proceed.json) is synthetic: it follows the
documented Messages API shape for the server-side web search tool (checked 2026-09-29) with a placeholder model
string, because recording a real response needs a paid key. The model always comes from the environment; these
tests pass "test-model".
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pytest
import requests

from traderec import llm_veto
from traderec.config import load_config

ROOT = Path(__file__).resolve().parent.parent
FIX = Path(__file__).parent / "fixtures" / "w8w9"
CFG = load_config()
VETO8 = CFG.module("W8")["veto"]
VETO9 = CFG.module("W9")["veto"]
ENV = {llm_veto.MODEL_ENV: "test-model", llm_veto.KEY_ENV: "sk-test-not-a-real-key"}
FACTS8 = {"signal_date": "2026-10-15", "oil_facts": "- Brent crude futures BZZ26 closed -7.0% on the day.",
          "market_facts": "- Polymarket \"US announces end of Iranian blockade by December 31, 2026?\" moved from "
                          "55% to 81%."}
WH = "https://www.whitehouse.gov/briefings-statements/2026/10/statement-on-the-strait-of-hormuz/"
ST = "https://www.state.gov/releases/2026/10/joint-statement-on-hormuz-shipping/"


def response(**changes: Any) -> dict:
    payload = json.loads((FIX / "veto_response_proceed.json").read_text())
    payload.update(changes)
    return payload


def with_answer(answer: str, **changes: Any) -> dict:
    payload = response(**changes)
    payload["content"][-1] = {"type": "text", "text": answer}
    return payload


class FakeResponse:
    def __init__(self, status_code: int = 200, payload: Any = None, text: str | None = None) -> None:
        self.status_code = status_code
        self.text = text if text is not None else json.dumps(payload)


class FakeSession:
    """Answers POSTs in order; records url, headers and body of each."""

    def __init__(self, *answers: Any) -> None:
        self.answers = list(answers)
        self.calls: list[dict] = []

    def post(self, url, headers=None, data=None, timeout=None):
        self.calls.append({"url": url, "headers": dict(headers or {}), "body": json.loads(data), "raw": data,
                           "timeout": timeout})
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer if isinstance(answer, FakeResponse) else FakeResponse(payload=answer)


class NoNetwork:
    def post(self, *args, **kwargs):
        pytest.fail("the veto must not call the API")


def veto(session: Any, module: str = "W8", facts: dict | None = None, cfg: dict | None = None,
         env: dict | None = None) -> dict:
    return llm_veto.run_veto(module, facts or FACTS8, cfg or VETO8, session=session,
                             env=ENV if env is None else env, sleep=lambda s: None)


# --- the frozen parts ---------------------------------------------------------------------------------------

def test_prompts_are_pinned_in_the_constitution() -> None:
    for module in ("W8", "W9"):
        assert CFG.module(module)["veto"]["prompt_sha256"] == llm_veto.prompt_sha256(module)
        assert set(llm_veto.VERDICTS[module]) >= {llm_veto.PROCEED, "VETO_UNCERTAIN", "VETO_OTHER_CAUSE"}
    text = llm_veto.render_prompt("W8", FACTS8)
    assert "2026-10-15" in text and "BZZ26" in text and "only reaches official" in text and "$" not in text


def test_a_changed_prompt_fails_closed(monkeypatch) -> None:
    monkeypatch.setitem(llm_veto.PROMPTS, "W8", llm_veto.PROMPTS["W8"] + "Also buy more.")
    res = veto(NoNetwork())
    assert res["status"] == "unavailable" and not res["proceed"]
    assert "pinned prompt_sha256" in res["problems"][0]


@pytest.mark.parametrize("env, missing", [({}, 2), ({llm_veto.MODEL_ENV: "test-model"}, 1),
                                          ({llm_veto.KEY_ENV: "sk-test"}, 1)])
def test_no_key_or_no_model_fails_closed_without_calling_the_api(env: dict, missing: int) -> None:
    res = veto(NoNetwork(), env=env)
    assert res["status"] == "unavailable" and not res["proceed"] and len(res["problems"]) == missing
    assert res["request_sha256"] is None


def test_no_model_identifiers_in_the_repository() -> None:
    """Contract §0.4: no model identifiers in code, config, docs or tests (the model comes from the environment).

    Model versions start at one, so a scratch path such as /tmp/<name>-0/ is not a hit."""
    pattern = re.compile(r"\bclaude-(?:[a-z]+-)?[1-9]")
    hits = []
    for top in ("traderec", "config", "docs", "tests", ".github"):
        for path in (ROOT / top).rglob("*"):
            if path.is_file() and path.suffix in (".py", ".yaml", ".yml", ".md", ".json", ".txt", ".toml"):
                if pattern.search(path.read_text(encoding="utf-8", errors="ignore")):
                    hits.append(str(path.relative_to(ROOT)))
    assert not hits, hits


# --- a proceeding answer ------------------------------------------------------------------------------------

def test_proceed_needs_two_allow_listed_pages_the_search_returned() -> None:
    session = FakeSession(response())
    res = veto(session)
    assert res["status"] == "proceed" and res["proceed"] and res["verdict"] == llm_veto.PROCEED
    assert res["citations"] == sorted([WH.replace("www.", "").rstrip("/"), ST.replace("www.", "").rstrip("/")])
    assert res["usage"] == {"input_tokens": 6039, "output_tokens": 431, "web_search_requests": 1}
    assert res["reason"].startswith("Both pages")
    # hashes: the model is recorded by hash only, the request by the hash of the exact bytes sent
    call = session.calls[0]
    assert res["model_sha256"] == hashlib.sha256(b"test-model").hexdigest()
    assert res["request_sha256"] == hashlib.sha256(call["raw"]).hexdigest()
    assert res["prompt_sha256"] == VETO8["prompt_sha256"]
    assert "test-model" not in json.dumps({k: v for k, v in res.items() if k != "model_sha256"})


def test_request_shape() -> None:
    session = FakeSession(response())
    veto(session)
    call = session.calls[0]
    assert call["url"] == llm_veto.API_URL
    assert call["headers"]["x-api-key"] == ENV[llm_veto.KEY_ENV] and call["headers"]["anthropic-version"]
    body = call["body"]
    assert body["model"] == "test-model" and body["max_tokens"] == VETO8["max_tokens"]
    assert not {"temperature", "top_p", "top_k"} & set(body)                  # the model's defaults apply
    assert ENV[llm_veto.KEY_ENV] not in call["raw"].decode()                   # the key only in the header
    (tool,) = body["tools"]
    assert tool == {"type": VETO8["web_search_tool"], "name": "web_search", "max_uses": VETO8["max_searches"],
                    "allowed_domains": VETO8["allowed_domains"], "allowed_callers": ["direct"]}
    assert body["messages"][0]["content"] == llm_veto.render_prompt("W8", FACTS8)


def test_the_logged_response_is_sanitised() -> None:
    res = veto(FakeSession(response()))
    text = json.dumps(res["response"])
    assert "encrypted_content" not in text and "encrypted_index" not in text and "test-model" not in text
    kinds = [b["type"] for b in res["response"]]
    assert kinds == ["text", "server_tool_use", "web_search_tool_result", "text"]
    assert res["response"][2]["results"][0]["url"] == WH


# --- answers that fail closed -------------------------------------------------------------------------------

def _answer(verdict: str, cites: list[str]) -> str:
    return json.dumps({"verdict": verdict, "citations": cites, "reason": "test"})


def test_a_citation_the_search_never_returned_does_not_count() -> None:
    res = veto(FakeSession(with_answer(_answer("PROCEED", [WH, "https://www.state.gov/made-up-page"]))))
    assert res["status"] == "invalid" and not res["proceed"] and "1 valid citations" in res["problems"][0]


def test_a_citation_off_the_allow_list_does_not_count() -> None:
    payload = with_answer(_answer("PROCEED", [WH, "https://news.example.com/story"]))
    payload["content"][2]["content"].append({"type": "web_search_result", "url": "https://news.example.com/story",
                                             "title": "x", "encrypted_content": "e", "page_age": None})
    res = veto(FakeSession(payload))
    assert res["status"] == "invalid" and len(res["citations"]) == 1


def test_one_citation_is_not_enough_but_a_veto_needs_none() -> None:
    assert veto(FakeSession(with_answer(_answer("PROCEED", [WH]))))["status"] == "invalid"
    res = veto(FakeSession(with_answer(_answer("VETO_REVERSED", []))))
    assert res["status"] == "veto" and res["verdict"] == "VETO_REVERSED" and not res["proceed"]


@pytest.mark.parametrize("text", [
    _answer("BUY_NOW", [WH, ST]),                                        # not in the fixed set
    _answer("PROCEED", [WH, ST]) + " " + _answer("VETO_UNCERTAIN", []),  # two answers
    "PROCEED",                                                           # no JSON
    "{\"verdict\": \"PROCEED\", \"citations\": [",                       # truncated JSON
])
def test_malformed_answers_are_invalid(text: str) -> None:
    res = veto(FakeSession(with_answer(text)))
    assert res["status"] == "invalid" and not res["proceed"]


@pytest.mark.parametrize("stop", ["refusal", "max_tokens", "tool_use"])
def test_other_stop_reasons_are_invalid(stop: str) -> None:
    res = veto(FakeSession(response(stop_reason=stop)))
    assert res["status"] == "invalid" and f"stop_reason '{stop}'" in res["problems"][0]


def test_pause_turn_is_continued_with_the_paused_content() -> None:
    first = response(stop_reason="pause_turn", usage={"input_tokens": 100, "output_tokens": 10})
    first["content"] = first["content"][:3]                                 # paused after the search results
    second = response()
    second["content"] = second["content"][3:]                               # the answer
    session = FakeSession(first, second)
    res = veto(session)
    assert res["status"] == "proceed" and res["requests"] == 2
    assert session.calls[1]["body"]["messages"][1] == {"role": "assistant", "content": first["content"]}
    assert res["usage"]["input_tokens"] == 100 + 6039


def test_a_turn_still_paused_after_the_limit_is_invalid() -> None:
    paused = response(stop_reason="pause_turn")
    paused["content"] = paused["content"][:3]
    cfg = {**VETO8, "max_continuations": 1}
    res = veto(FakeSession(copy.deepcopy(paused), copy.deepcopy(paused)), cfg=cfg)
    assert res["status"] == "invalid" and res["requests"] == 2


def test_http_retries_then_fails_closed() -> None:
    session = FakeSession(FakeResponse(529, text="overloaded"), requests.ConnectionError("reset"), response())
    assert veto(session)["status"] == "proceed" and len(session.calls) == 3
    session = FakeSession(*[FakeResponse(503, text="down")] * 4)
    res = veto(session)
    assert res["status"] == "unavailable" and res["problems"] == ["HTTP 503"] and len(session.calls) == 4
    session = FakeSession(FakeResponse(400, text="bad request"))
    res = veto(session)
    assert res["status"] == "unavailable" and len(session.calls) == 1


def test_w9_prompt_and_verdicts() -> None:
    facts = {"signal_date": "2026-10-15", "price_facts": "- CLX26 crude futures closed +6.0%.",
             "supply_facts": "- Supply loss recorded: 1.5 million barrels a day."}
    payload = with_answer(_answer("VETO_RESTORED", []))
    res = veto(FakeSession(payload), module="W9", facts=facts, cfg=VETO9)
    assert res["status"] == "veto" and res["verdict"] == "VETO_RESTORED"
    res = veto(FakeSession(with_answer(_answer("VETO_REVERSED", []))), module="W9", facts=facts, cfg=VETO9)
    assert res["status"] == "invalid"                                       # a W8 verdict is not in W9's set
