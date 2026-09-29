"""Delivery (traderec.notify) and the one-time Gmail OAuth helper. Offline: every network call is faked."""
from __future__ import annotations

import base64
import email
import email.policy
import http.client
import importlib.util
import json
import re
import threading
import urllib.parse
from pathlib import Path

import pytest
import requests

from traderec import notify
from traderec.types import RenderedEmail

ROOT = Path(__file__).resolve().parent.parent
ENV_VARS = ("GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "ALERT_TO_EMAIL", "GITHUB_TOKEN",
            "GITHUB_REPOSITORY", "HC_PING_URL")
SECRETS = {"GMAIL_CLIENT_ID": "1234-client.apps.googleusercontent.com", "GMAIL_CLIENT_SECRET": "GOCSPX-client-secret",
           "GMAIL_REFRESH_TOKEN": "1//refresh-token-secret", "ALERT_TO_EMAIL": "owner@example.com"}
ACCESS_TOKEN = "ya29.access-token-secret"


class FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        if self._payload is None:
            raise ValueError("no JSON")
        return self._payload


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """No real credentials and no real network in any test here."""
    for var in ENV_VARS:
        monkeypatch.delenv(var, raising=False)

    def refuse(*args, **kwargs):
        raise AssertionError("unexpected network call")

    monkeypatch.setattr(requests, "post", refuse)
    monkeypatch.setattr(requests, "get", refuse)


@pytest.fixture
def mail() -> RenderedEmail:
    return RenderedEmail(
        subject="[PAPER][TRADE T-2026-10-01-M1] BUY $6,000 SPY — Uptrend dip-buy (M1) — before 9:30 ET Fri 2 Oct",
        text="PAPER TRADE — no real money. Place it in your practice account or just log it.\n\nBuy $6,000 of SPY.\n",
        html="<!doctype html><html><body><p>PAPER TRADE — no real money.</p><p>Buy $6,000 of SPY.</p></body></html>",
        numbers_registered=["$6,000", "Fri 2 Oct"],
        meta={"kind": "NEW_TRADE", "trade_id": "T-2026-10-01-M1", "slug": "new_trade-T-2026-10-01-M1"})


def parse(data: bytes):
    return email.message_from_bytes(data, policy=email.policy.default)


def assert_both_parts(msg, mail: RenderedEmail) -> None:
    assert msg.get_content_type() == "multipart/alternative"
    plain, html = msg.get_body(("plain",)), msg.get_body(("html",))
    assert plain.get_content().replace("\r\n", "\n") == mail.text
    assert html.get_content().replace("\r\n", "\n").strip() == mail.html
    assert str(msg["Subject"]) == mail.subject
    assert msg["X-Traderec-Trade-Id"] == "T-2026-10-01-M1"
    assert msg["Message-ID"]


def assert_no_secrets(obj) -> None:
    blob = repr(obj)
    for secret in (*SECRETS.values(), ACCESS_TOKEN):
        if secret != SECRETS["ALERT_TO_EMAIL"]:
            assert secret not in blob


# ------------------------------------------------------------------------------------------ send

def test_dry_run_writes_a_parseable_eml_with_both_parts(tmp_path, mail):
    outbox = tmp_path / "state" / "outbox"
    result = notify.send(mail, dry_run=True, outbox=outbox)
    assert result["sent"] is False and result["reason"] == "dry_run"
    path = Path(result["path"])
    assert path.parent == outbox and re.fullmatch(r"\d{8}T\d{6}Z-new-trade-t-2026-10-01-m1\.eml", path.name)
    msg = parse(path.read_bytes())
    assert_both_parts(msg, mail)
    assert msg["To"] == msg["From"] == notify.OUTBOX_ADDRESS
    again = notify.send(mail, dry_run=True, outbox=outbox)       # same second: no overwrite
    assert again["path"] != result["path"] and len(list(outbox.iterdir())) == 2


def test_missing_credentials_fall_back_to_the_outbox_without_network(tmp_path, mail, monkeypatch):
    monkeypatch.setenv("ALERT_TO_EMAIL", SECRETS["ALERT_TO_EMAIL"])
    monkeypatch.setenv("GMAIL_CLIENT_ID", SECRETS["GMAIL_CLIENT_ID"])
    result = notify.send(mail, dry_run=False, outbox=tmp_path)
    assert result["sent"] is False
    assert result["reason"] == "missing credentials: GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN"
    data = Path(result["path"]).read_bytes()
    assert SECRETS["ALERT_TO_EMAIL"].encode() not in data          # the outbox never holds the real address
    assert_both_parts(parse(data), mail)


def test_gmail_success_path(tmp_path, mail, monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        if url == notify.TOKEN_URL:
            return FakeResponse(200, {"access_token": ACCESS_TOKEN, "expires_in": 3599, "token_type": "Bearer"})
        if url == notify.GMAIL_SEND_URL:
            return FakeResponse(200, {"id": "18c0ffee", "threadId": "18c0ffee", "labelIds": ["SENT"]})
        raise AssertionError(url)

    monkeypatch.setattr(requests, "post", fake_post)
    result = notify.send(mail, dry_run=False, outbox=tmp_path / "outbox")
    assert result == {"sent": True, "id": "18c0ffee"}
    assert_no_secrets(result)
    assert not (tmp_path / "outbox").exists()

    (token_url, token_kw), (send_url, send_kw) = calls
    assert token_kw["data"] == {"grant_type": "refresh_token", "client_id": SECRETS["GMAIL_CLIENT_ID"],
                                "client_secret": SECRETS["GMAIL_CLIENT_SECRET"],
                                "refresh_token": SECRETS["GMAIL_REFRESH_TOKEN"]}
    assert send_kw["headers"] == {"Authorization": f"Bearer {ACCESS_TOKEN}"}
    msg = parse(base64.urlsafe_b64decode(send_kw["json"]["raw"]))
    assert msg["To"] == msg["From"] == SECRETS["ALERT_TO_EMAIL"]
    assert_both_parts(msg, mail)


def test_gmail_http_error_returns_status_without_secrets(tmp_path, mail, monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)

    def fake_post(url, **kwargs):
        if url == notify.TOKEN_URL:
            return FakeResponse(200, {"access_token": ACCESS_TOKEN})
        return FakeResponse(403, {"error": {"code": 403, "message": f"denied for {ACCESS_TOKEN}"}})

    monkeypatch.setattr(requests, "post", fake_post)
    result = notify.send(mail, dry_run=False, outbox=tmp_path)
    assert result["sent"] is False and result["status"] == 403 and result["reason"] == "gmail send failed"
    assert Path(result["path"]).exists()                         # kept for a manual resend
    assert_no_secrets(result)


def test_token_refresh_failure_reports_the_oauth_error_code(tmp_path, mail, monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    calls = []

    def fake_post(url, **kwargs):
        calls.append(url)
        return FakeResponse(400, {"error": "invalid_grant", "error_description": "Token has been expired or revoked."})

    monkeypatch.setattr(requests, "post", fake_post)
    result = notify.send(mail, dry_run=False, outbox=tmp_path)
    assert result["sent"] is False and result["status"] == 400
    assert result["reason"] == "token refresh failed (invalid_grant)"
    assert calls == [notify.TOKEN_URL]                           # never tried to send
    assert_no_secrets(result)


def test_network_errors_are_reported_without_details(tmp_path, mail, monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)

    def fake_post(url, **kwargs):
        raise requests.ConnectionError(f"failed posting refresh_token={SECRETS['GMAIL_REFRESH_TOKEN']}")

    monkeypatch.setattr(requests, "post", fake_post)
    result = notify.send(mail, dry_run=False, outbox=tmp_path)
    assert result["sent"] is False and result["reason"] == "token request failed (ConnectionError)"
    assert_no_secrets(result)


# ------------------------------------------------------------------------------------------ issues

def test_create_issue_returns_none_without_env():
    assert notify.create_issue("title", "body") is None


def test_create_issue_posts_and_returns_the_url(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "ghs_token-secret")
    monkeypatch.setenv("GITHUB_REPOSITORY", "sol008/testProject")
    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse(201, {"html_url": "https://github.com/sol008/testProject/issues/12", "number": 12})

    monkeypatch.setattr(requests, "post", fake_post)
    url = notify.create_issue("[PAPER] T-2026-10-01-M1 BUY SPY", "Comment filled <dollars> @ <price>",
                              labels=["trade", "M1"])
    assert url == "https://github.com/sol008/testProject/issues/12"
    (api, kwargs), = calls
    assert api == "https://api.github.com/repos/sol008/testProject/issues"
    assert kwargs["headers"]["Authorization"] == "Bearer ghs_token-secret"
    assert kwargs["json"] == {"title": "[PAPER] T-2026-10-01-M1 BUY SPY", "body": "Comment filled <dollars> @ <price>",
                              "labels": ["trade", "M1"]}


def test_create_issue_retries_without_rejected_labels_and_fails_soft(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "ghs_token-secret")
    monkeypatch.setenv("GITHUB_REPOSITORY", "sol008/testProject")
    payloads = []

    def fake_post(url, **kwargs):
        payloads.append(dict(kwargs["json"]))
        if "labels" in kwargs["json"]:
            return FakeResponse(422, {"message": "Validation Failed"})
        return FakeResponse(201, {"html_url": "https://github.com/sol008/testProject/issues/13"})

    monkeypatch.setattr(requests, "post", fake_post)
    assert notify.create_issue("t", "b", labels=["nope"]) == "https://github.com/sol008/testProject/issues/13"
    assert "labels" in payloads[0] and "labels" not in payloads[1]

    monkeypatch.setattr(requests, "post", lambda url, **kw: FakeResponse(500))
    assert notify.create_issue("t", "b") is None

    def boom(url, **kw):
        raise requests.Timeout("slow")

    monkeypatch.setattr(requests, "post", boom)
    assert notify.create_issue("t", "b") is None
    monkeypatch.setenv("GITHUB_REPOSITORY", "not a repo/../x")
    assert notify.create_issue("t", "b") is None


# ------------------------------------------------------------------------------------------ healthchecks

def test_healthcheck_is_a_no_op_without_env(monkeypatch):
    pings = []
    monkeypatch.setattr(requests, "get", lambda url, **kw: pings.append(url))
    for status in ("start", "success", "fail"):
        notify.healthcheck(status)
    assert pings == []


def test_healthcheck_pings_and_swallows_errors(monkeypatch):
    monkeypatch.setenv("HC_PING_URL", "https://hc-ping.com/abc-123/")
    pings = []
    monkeypatch.setattr(requests, "get", lambda url, **kw: pings.append(url))
    for status in ("start", "success", "fail", "bogus"):
        notify.healthcheck(status)
    assert pings == ["https://hc-ping.com/abc-123/start", "https://hc-ping.com/abc-123",
                     "https://hc-ping.com/abc-123/fail"]

    def down(url, **kw):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(requests, "get", down)
    notify.healthcheck("fail")                                   # no exception


# ------------------------------------------------------------------------------------------ OAuth helper

def load_setup_script():
    spec = importlib.util.spec_from_file_location("gmail_oauth_setup", ROOT / "scripts" / "gmail_oauth_setup.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_browser(consent: dict, state_override: str | None = None):
    """Stand-in for the user's browser: record the consent URL, then follow Google's redirect to the loopback."""
    def open_(url, *args, **kwargs):
        consent.update(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))
        redirect = urllib.parse.urlsplit(consent["redirect_uri"])
        query = urllib.parse.urlencode({"state": state_override or consent["state"], "code": "4/auth-code",
                                        "scope": consent["scope"]})

        def follow():
            conn = http.client.HTTPConnection(redirect.hostname, redirect.port, timeout=10)
            conn.request("GET", "/?" + query)
            conn.getresponse().read()
            conn.close()

        threading.Thread(target=follow, daemon=True).start()
        return True
    return open_


@pytest.fixture
def client_json(tmp_path):
    path = tmp_path / "client_secret.json"
    path.write_text(json.dumps({"installed": {"client_id": SECRETS["GMAIL_CLIENT_ID"],
                                              "client_secret": SECRETS["GMAIL_CLIENT_SECRET"],
                                              "redirect_uris": ["http://localhost"]}}))
    return path


def test_oauth_setup_prints_only_the_refresh_token(monkeypatch, capsys, client_json):
    setup = load_setup_script()
    consent: dict = {}
    exchanged = []
    monkeypatch.setattr(setup.webbrowser, "open", fake_browser(consent))

    def fake_post(url, **kwargs):
        exchanged.append((url, kwargs["data"]))
        return FakeResponse(200, {"access_token": ACCESS_TOKEN, "refresh_token": SECRETS["GMAIL_REFRESH_TOKEN"],
                                  "expires_in": 3599, "scope": setup.SCOPE, "token_type": "Bearer"})

    monkeypatch.setattr(setup.requests, "post", fake_post)
    assert setup.main(["--client-secret-json", str(client_json), "--timeout", "20"]) == 0

    assert consent["scope"] == "https://www.googleapis.com/auth/gmail.send"
    assert consent["access_type"] == "offline" and consent["prompt"] == "consent"
    assert consent["redirect_uri"].startswith("http://127.0.0.1:") and consent["code_challenge_method"] == "S256"
    (url, data), = exchanged
    assert url == "https://oauth2.googleapis.com/token"
    assert data["code"] == "4/auth-code" and data["grant_type"] == "authorization_code"
    assert data["redirect_uri"] == consent["redirect_uri"] and data["code_verifier"]

    out, err = capsys.readouterr()
    assert SECRETS["GMAIL_REFRESH_TOKEN"] in out
    for name in ("GMAIL_REFRESH_TOKEN", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "ALERT_TO_EMAIL", "In production",
                 "7 days"):
        assert name in out
    assert ACCESS_TOKEN not in out + err and SECRETS["GMAIL_CLIENT_SECRET"] not in out + err
    assert "4/auth-code" not in out + err


def test_oauth_setup_rejects_a_forged_state(monkeypatch, client_json):
    setup = load_setup_script()
    monkeypatch.setattr(setup.webbrowser, "open", fake_browser({}, state_override="forged"))
    monkeypatch.setattr(setup.requests, "post", lambda *a, **k: pytest.fail("must not exchange a forged code"))
    with pytest.raises(SystemExit, match="state_mismatch"):
        setup.main(["--client-secret-json", str(client_json), "--timeout", "20"])


def test_oauth_setup_help_explains_itself(capsys):
    with pytest.raises(SystemExit) as exc:
        load_setup_script().main(["--help"])
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "--client-secret-json" in out and "In production" in out and "gmail.send" in out
