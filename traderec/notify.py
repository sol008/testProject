"""Delivery: Gmail API send (with an .eml outbox fallback), one GitHub issue per trade, healthchecks.io pings.

Environment (GitHub Actions secrets):
  GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN   OAuth refresh-token flow (scripts/gmail_oauth_setup.py)
  ALERT_TO_EMAIL      the owner's Gmail address; emails go to and from it
  GITHUB_TOKEN, GITHUB_REPOSITORY                               issue creation ("owner/repo")
  HC_PING_URL         healthchecks.io ping URL

Nothing here prints, logs or returns a secret. Every function fails soft: `send` writes the message to the outbox
when it can't send, `create_issue` returns None and `healthcheck` swallows errors.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from datetime import datetime, timezone
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import format_datetime, make_msgid
from pathlib import Path

import requests

from .types import RenderedEmail

__all__ = ["build_message", "create_issue", "healthcheck", "send", "write_outbox"]

log = logging.getLogger(__name__)

TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GITHUB_API = "https://api.github.com"
GMAIL_ENV = ("GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "ALERT_TO_EMAIL")
# Outbox copies never carry the real address: ALERT_TO_EMAIL is a secret and the outbox may be committed.
OUTBOX_ADDRESS = "traderec-outbox@example.invalid"
TIMEOUT = 30
_HC_SUFFIX = {"start": "/start", "success": "", "ok": "", "fail": "/fail", "failure": "/fail", "error": "/fail"}
_REPO = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")


def _slug(email: RenderedEmail) -> str:
    meta = email.meta or {}
    base = meta.get("slug") or "-".join(str(meta[k]) for k in ("kind", "trade_id") if meta.get(k)) or email.subject
    return re.sub(r"[^a-z0-9]+", "-", str(base).lower()).strip("-")[:60] or "email"


def _one_line(s: object) -> str:
    return re.sub(r"[\r\n]+", " ", str(s)).strip()


def build_message(email: RenderedEmail, address: str) -> EmailMessage:
    """multipart/alternative (text/plain first, then HTML), From and To = `address`.

    The subject may be non-ASCII: it is RFC 2047-encoded on serialisation. X-Traderec-Trade-Id comes from
    email.meta["trade_id"] when present.
    """
    msg = EmailMessage()
    msg["From"] = address
    msg["To"] = address
    msg["Subject"] = _one_line(email.subject)
    msg["Date"] = format_datetime(datetime.now(timezone.utc))
    msg["Message-ID"] = make_msgid(idstring=_slug(email)[:40], domain="traderec.local")
    trade_id = (email.meta or {}).get("trade_id")
    if trade_id:
        msg["X-Traderec-Trade-Id"] = _one_line(trade_id)
    msg.set_content(email.text or "", subtype="plain", charset="utf-8", cte="quoted-printable")
    if email.html:
        msg.add_alternative(email.html, subtype="html", charset="utf-8", cte="quoted-printable")
    return msg


def write_outbox(email: RenderedEmail, outbox: Path) -> Path:
    """Write outbox/<UTC timestamp>-<slug>.eml (creating the directory) and return its path."""
    outbox = Path(outbox)
    outbox.mkdir(parents=True, exist_ok=True)
    base = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{_slug(email)}"
    path, n = outbox / f"{base}.eml", 1
    while path.exists():
        n += 1
        path = outbox / f"{base}-{n}.eml"
    path.write_bytes(build_message(email, OUTBOX_ADDRESS).as_bytes(policy=SMTP))
    return path


def _oauth_error(resp: requests.Response) -> str:
    """The OAuth error code (e.g. "invalid_grant": the refresh token expired or was revoked); never the body."""
    try:
        err = resp.json().get("error")
    except (ValueError, AttributeError):
        return ""
    return f" ({err})" if isinstance(err, str) and re.fullmatch(r"[a-z_]{1,40}", err) else ""


def _not_sent(email: RenderedEmail, outbox: Path, reason: str, status: int | None = None) -> dict:
    result: dict = {"sent": False, "reason": reason}
    if status is not None:
        result["status"] = status
    try:
        result["path"] = str(write_outbox(email, outbox))
    except OSError as exc:
        log.warning("could not write the outbox copy (%s)", type(exc).__name__)
    log.warning("email not sent: %s", reason)
    return result


def send(email: RenderedEmail, *, dry_run: bool, outbox: Path) -> dict:
    """Send via the Gmail API: refresh the access token, then users.messages.send with the base64url MIME.

    dry_run, or any of GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN / ALERT_TO_EMAIL missing:
      write the .eml to `outbox` -> {"sent": False, "path": str, "reason": ...}
    success -> {"sent": True, "id": <gmail message id>}
    HTTP or network error -> {"sent": False, "status": <HTTP status, if any>, "reason": ..., "path": <outbox copy>}
    """
    creds = {k: (os.environ.get(k) or "").strip() for k in GMAIL_ENV}
    missing = [k for k, v in creds.items() if not v]
    if dry_run or missing:
        reason = "dry_run" if dry_run else "missing credentials: " + ", ".join(missing)
        return {"sent": False, "path": str(write_outbox(email, outbox)), "reason": reason}

    try:
        tok = requests.post(TOKEN_URL, data={
            "grant_type": "refresh_token",
            "client_id": creds["GMAIL_CLIENT_ID"],
            "client_secret": creds["GMAIL_CLIENT_SECRET"],
            "refresh_token": creds["GMAIL_REFRESH_TOKEN"],
        }, timeout=TIMEOUT)
    except requests.RequestException as exc:
        return _not_sent(email, outbox, f"token request failed ({type(exc).__name__})")
    if tok.status_code != 200:
        return _not_sent(email, outbox, "token refresh failed" + _oauth_error(tok), tok.status_code)
    try:
        access_token = tok.json().get("access_token")
    except (ValueError, AttributeError):
        access_token = None
    if not access_token:
        return _not_sent(email, outbox, "token response had no access_token", tok.status_code)

    raw = base64.urlsafe_b64encode(build_message(email, creds["ALERT_TO_EMAIL"]).as_bytes(policy=SMTP)).decode("ascii")
    try:
        resp = requests.post(GMAIL_SEND_URL, headers={"Authorization": f"Bearer {access_token}"},
                             json={"raw": raw}, timeout=TIMEOUT)
    except requests.RequestException as exc:
        return _not_sent(email, outbox, f"gmail send failed ({type(exc).__name__})")
    if not 200 <= resp.status_code < 300:
        return _not_sent(email, outbox, "gmail send failed", resp.status_code)
    try:
        message_id = resp.json().get("id")
    except (ValueError, AttributeError):
        message_id = None
    return {"sent": True, "id": message_id}


def create_issue(title: str, body: str, labels: list[str] | None = None) -> str | None:
    """Open a GitHub issue in GITHUB_REPOSITORY with GITHUB_TOKEN; return its html_url, or None when the env is
    missing or anything fails. If the labels are rejected (HTTP 422) the issue is created without them."""
    token = (os.environ.get("GITHUB_TOKEN") or "").strip()
    repo = (os.environ.get("GITHUB_REPOSITORY") or "").strip()
    if not token or not _REPO.fullmatch(repo):
        return None
    url = f"{GITHUB_API}/repos/{repo}/issues"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "traderec"}
    payload: dict = {"title": _one_line(title)[:256], "body": body}
    if labels:
        payload["labels"] = [str(label) for label in labels]
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT)
        if resp.status_code == 422 and "labels" in payload:
            payload.pop("labels")
            resp = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT)
        if resp.status_code != 201:
            log.warning("GitHub issue not created (HTTP %s)", resp.status_code)
            return None
        html_url = resp.json().get("html_url")
        return str(html_url) if html_url else None
    except (requests.RequestException, ValueError, AttributeError) as exc:
        log.warning("GitHub issue not created (%s)", type(exc).__name__)
        return None


def healthcheck(status: str) -> None:
    """Ping HC_PING_URL: "start" -> /start, "fail" -> /fail, "success" -> the plain URL. Silent on every error;
    no-op without the env var or for an unknown status."""
    try:
        url = (os.environ.get("HC_PING_URL") or "").strip()
        suffix = _HC_SUFFIX.get(str(status).strip().lower())
        if not url or suffix is None:
            return
        requests.get(url.rstrip("/") + suffix, timeout=10)
    except Exception:  # noqa: BLE001 - a monitoring ping must never break the run
        pass
