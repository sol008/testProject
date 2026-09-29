#!/usr/bin/env python3
"""One-time helper: get a Gmail API refresh token so traderec can email you from GitHub Actions.

Run it once, on your own computer (not in CI):

    python scripts/gmail_oauth_setup.py --client-secret-json ~/Downloads/client_secret_XXXX.json

Without --client-secret-json it asks for the client ID and secret (the secret is typed hidden).

Before you run it (Google Cloud Console, about ten minutes):
  1. Create a project and enable the Gmail API (APIs & Services -> Library -> Gmail API -> Enable).
  2. Set up the OAuth consent screen (Google Auth Platform): user type External, your Gmail address as a
     test user, and the scope https://www.googleapis.com/auth/gmail.send.
  3. Publish it: Audience -> Publishing status -> "In production". While it says "Testing", Google expires
     the refresh token after 7 days and the emails stop. An unverified personal app is fine: on the consent
     page click Advanced -> "Go to <app name> (unsafe)".
  4. Create an OAuth client: Clients -> Create client -> Application type "Desktop app", then download its
     JSON (client_secret_....json).

What this script does:
  - starts a one-shot web server on 127.0.0.1, on a free port (the OAuth loopback redirect);
  - opens Google's consent page in your browser for one scope, gmail.send (send-only: it can't read your
    mail), with access_type=offline and prompt=consent so Google returns a refresh token, plus a random
    `state` value that is checked on the way back and a PKCE challenge;
  - exchanges the returned code at https://oauth2.googleapis.com/token;
  - prints ONLY the refresh token, and how to store it and the other values as GitHub secrets.

Nothing is written to disk and no other token or secret is printed. Needs Python 3 and `requests`.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import http.server
import json
import secrets
import sys
import time
import urllib.parse
import webbrowser
from pathlib import Path

import requests

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/gmail.send"

INSTRUCTIONS = """
Next: add four GitHub Actions secrets (repo -> Settings -> Secrets and variables -> Actions ->
New repository secret):
  GMAIL_REFRESH_TOKEN   the token above
  GMAIL_CLIENT_ID       "client_id" from your OAuth client JSON
  GMAIL_CLIENT_SECRET   "client_secret" from the same JSON
  ALERT_TO_EMAIL        the Gmail address you just signed in with (emails go to and from it)

Or with the GitHub CLI, from the repo folder (each command asks for the value):
  gh secret set GMAIL_REFRESH_TOKEN
  gh secret set GMAIL_CLIENT_ID
  gh secret set GMAIL_CLIENT_SECRET
  gh secret set ALERT_TO_EMAIL

IMPORTANT: set the OAuth consent screen to "In production" (Google Auth Platform -> Audience ->
Publish app). While it is in "Testing", this refresh token expires after 7 days.
The token also dies if you change your Google password or leave it unused for 6 months; then run
this script again and update GMAIL_REFRESH_TOKEN.
"""


def _err(msg: str) -> None:
    print(msg, file=sys.stderr)


def load_client(path: str | None) -> tuple[str, str]:
    """(client_id, client_secret) from the downloaded Desktop client JSON, or typed in."""
    if path:
        try:
            data = json.loads(Path(path).expanduser().read_text())
        except (OSError, ValueError) as exc:
            raise SystemExit(f"Could not read {path}: {type(exc).__name__}") from None
        block = data.get("installed") or data.get("web") or data
        client_id, client_secret = block.get("client_id"), block.get("client_secret")
        if not client_id or not client_secret:
            raise SystemExit("That JSON has no client_id/client_secret. Download the JSON of a Desktop-app OAuth "
                             "client.")
        return str(client_id), str(client_secret)
    client_id = input("OAuth client ID: ").strip()
    client_secret = getpass.getpass("OAuth client secret (hidden): ").strip()
    if not client_id or not client_secret:
        raise SystemExit("Both the client ID and the client secret are needed.")
    return client_id, client_secret


def pkce_pair() -> tuple[str, str]:
    """(code_verifier, S256 code_challenge)."""
    verifier = secrets.token_urlsafe(64)[:128]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=")
    return verifier, challenge.decode("ascii")


class _Server(http.server.HTTPServer):
    expected_state: str = ""
    result: dict[str, str]


class _Handler(http.server.BaseHTTPRequestHandler):
    server: _Server

    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        if parsed.path not in ("", "/") or not ({"code", "error"} & params.keys()):
            self.send_response(404)
            self.end_headers()
            return
        if not secrets.compare_digest(params.get("state", ""), self.server.expected_state):
            self.server.result = {"error": "state_mismatch"}
        elif "error" in params:
            self.server.result = {"error": params["error"]}
        else:
            self.server.result = {"code": params["code"]}
        done = "code" in self.server.result
        page = ("Done. You can close this tab and go back to the terminal." if done
                else "Something went wrong. Check the terminal.")
        body = f"<!doctype html><html><body><h3>{page}</h3></body></html>".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - keep the code out of the terminal
        return


def authorize(client_id: str, *, open_browser: bool = True, port: int = 0, timeout: float = 300.0
              ) -> tuple[str, str, str]:
    """Run the consent flow; return (code, redirect_uri, code_verifier)."""
    server = _Server(("127.0.0.1", port), _Handler)
    server.timeout = 1.0
    server.result = {}
    server.expected_state = secrets.token_urlsafe(32)
    redirect_uri = f"http://127.0.0.1:{server.server_address[1]}/"
    verifier, challenge = pkce_pair()
    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": SCOPE,
        "access_type": "offline", "prompt": "consent", "state": server.expected_state,
        "code_challenge": challenge, "code_challenge_method": "S256",
    })
    try:
        _err("Opening Google's consent page. If no browser opens, paste this URL into one:\n" + url + "\n")
        if open_browser:
            webbrowser.open(url)
        deadline = time.monotonic() + timeout
        while not server.result and time.monotonic() < deadline:
            server.handle_request()
    finally:
        server.server_close()
    if not server.result:
        raise SystemExit("Timed out waiting for the consent redirect. Run the script again.")
    if "error" in server.result:
        raise SystemExit(f"Consent failed: {server.result['error']}. Run the script again.")
    return server.result["code"], redirect_uri, verifier


def exchange(code: str, client_id: str, client_secret: str, redirect_uri: str, verifier: str) -> str:
    """Trade the authorization code for tokens; return the refresh token only."""
    try:
        resp = requests.post(TOKEN_URL, data={
            "code": code, "client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri,
            "grant_type": "authorization_code", "code_verifier": verifier,
        }, timeout=30)
    except requests.RequestException as exc:
        raise SystemExit(f"Token request failed: {type(exc).__name__}") from None
    try:
        data = resp.json()
    except ValueError:
        data = {}
    if resp.status_code != 200:
        err = data.get("error") if isinstance(data.get("error"), str) else "unknown error"
        raise SystemExit(f"Token exchange failed (HTTP {resp.status_code}: {err}).")
    refresh = data.get("refresh_token")
    if not refresh:
        raise SystemExit("Google returned no refresh token. Remove the app at https://myaccount.google.com/permissions "
                         "and run this script again.")
    return str(refresh)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--client-secret-json", metavar="PATH",
                        help="the Desktop-app OAuth client JSON downloaded from Google Cloud")
    parser.add_argument("--no-browser", action="store_true", help="print the consent URL instead of opening it")
    parser.add_argument("--port", type=int, default=0, help="loopback port (default: any free port)")
    parser.add_argument("--timeout", type=float, default=300.0, help="seconds to wait for the consent (default 300)")
    args = parser.parse_args(argv)

    client_id, client_secret = load_client(args.client_secret_json)
    code, redirect_uri, verifier = authorize(client_id, open_browser=not args.no_browser, port=args.port,
                                             timeout=args.timeout)
    refresh = exchange(code, client_id, client_secret, redirect_uri, verifier)
    print("Your Gmail refresh token (treat it like a password; don't commit it or paste it anywhere else):\n")
    print(refresh)
    print(INSTRUCTIONS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
