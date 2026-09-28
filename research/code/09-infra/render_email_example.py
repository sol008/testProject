#!/usr/bin/env python3
"""Dry-run renderer for a trade-alert email (track 09 feasibility prototype). SENDS NOTHING.

Builds a multipart/alternative (text + HTML) message from a FICTIONAL trade record, validates
all numbers with validate_numbers.py, writes an .eml file, and prints the shape of the JSON
payload that would go to Resend (POST https://api.resend.com/emails) and the size of the
base64url "raw" field the Gmail API (users.messages.send) would take.

Usage: python3 render_email_example.py [out_dir]
"""
import base64
import html
import json
import os
import sys
from email.message import EmailMessage
from email.utils import format_datetime, make_msgid
from datetime import datetime, timezone

from validate_numbers import render, validate

SNAPSHOT = {  # produced by the data layer; FICTIONAL values
    "ticker": "EXMPL", "asof": "2026-09-28T20:00:00Z", "last_close": 12.45, "offer_price": 13.50,
    "gross_spread": 0.0843, "annualized_spread": 0.231, "expected_close": "2027-01-15",
    "limit_price": 12.40, "shares": 400, "position_usd": 4960.0, "position_pct_of_equity": 0.05,
    "max_loss_usd": 1240.0, "p_deal_closes": 0.88, "valid_until": "2026-09-30 16:00 ET",
    "stop_price": 10.90, "rec_id": "TR-2026-0007", "valid_until_short": "Sep 30 4pm ET",
}
# What the LLM is allowed to produce: prose + placeholders (no bare digits), via structured output.
LLM_SECTIONS = {
    "one_liner": "Buy {{ticker}} below {{limit_price|usd}} to capture the cash takeover spread to {{offer_price|usd}}.",
    "why": "A buyer agreed to pay {{offer_price|usd}} cash per share. The stock trades a little below that "
           "because the deal could still fail. If it closes by {{expected_close}}, the gap is a "
           "{{gross_spread|pct}} gain ({{annualized_spread|pct}} annualized).",
    "risks": "If regulators block the deal the stock could fall back toward its pre-deal price; we size the "
             "position so that loss is about {{max_loss_usd|usd}}. Our estimated chance the deal closes: "
             "{{p_deal_closes|pct}}.",
}
ORDER_ROWS = [("Action", "BUY (open long)"), ("Symbol", "{{ticker}}"), ("Quantity", "{{shares|int}} shares"),
              ("Order type", "LIMIT, day order"), ("Limit price", "{{limit_price|usd}} (do not chase above)"),
              ("Recommendation valid until", "{{valid_until}}"), ("Exit plan", "Hold to deal close; sell if it closes below {{stop_price|usd}}"),
              ("Size", "{{position_usd|usd}} = {{position_pct_of_equity|pct}} of equity")]


def build():
    s = SNAPSHOT
    sec = {k: render(v, s) for k, v in LLM_SECTIONS.items()}
    rows = [(k, render(v, s)) for k, v in ORDER_ROWS]
    subject = render("[{{rec_id}}] BUY {{ticker}} | limit {{limit_price|usd}} | valid to {{valid_until_short}}", s)
    text = "\n".join([
        f"SAMPLE / FICTIONAL - NOT A RECOMMENDATION.  AI-generated research for personal use.",
        "", sec["one_liner"], "", "ORDER TICKET", *[f"  {k:28s} {v}" for k, v in rows],
        "", "WHY (plain English)", sec["why"], "", "RISKS / WHAT WOULD MAKE THIS WRONG", sec["risks"],
        "", f"Data snapshot: {s['asof']} | numbers auto-checked against snapshot | id {s['rec_id']}",
        "Record your fill: comment on the matching GitHub issue, e.g. 'filled <qty> @ <price>'.",
    ])
    trs = "".join(f"<tr><td style='padding:4px 12px 4px 0;color:#555'>{html.escape(k)}</td>"
                  f"<td style='padding:4px 0'><b>{html.escape(v)}</b></td></tr>" for k, v in rows)
    body_html = f"""<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#111;max-width:640px">
<div style="display:none;max-height:0;overflow:hidden">{html.escape(sec['one_liner'])}</div>
<p style="font-size:12px;color:#a00">SAMPLE / FICTIONAL - NOT A RECOMMENDATION. AI-generated research for personal use.</p>
<p style="font-size:17px"><b>{html.escape(sec['one_liner'])}</b></p>
<h3>Order ticket</h3><table style="border-collapse:collapse">{trs}</table>
<h3>Why (plain English)</h3><p>{html.escape(sec['why'])}</p>
<h3>Risks / what would make this wrong</h3><p>{html.escape(sec['risks'])}</p>
<p style="font-size:12px;color:#666">Data snapshot {html.escape(s['asof'])} · numbers auto-checked against snapshot · id {html.escape(s['rec_id'])}</p>
</body></html>"""
    problems = validate(text, s) + validate(subject, s)
    if problems:
        raise SystemExit("BLOCKED - validator problems: " + "; ".join(problems))
    msg = EmailMessage()
    msg["From"] = "TradeRec <onboarding@resend.dev>"      # Resend test sender (to own address only)
    msg["To"] = "you@example.com"                          # placeholder - real address lives in a secret
    msg["Subject"] = subject
    msg["Date"] = format_datetime(datetime.now(timezone.utc))
    msg["Message-ID"] = make_msgid(idstring=s["rec_id"], domain="traderec.invalid")
    msg["X-TradeRec-ID"] = s["rec_id"]
    msg.set_content(text)
    msg.add_alternative(body_html, subtype="html")
    return msg, subject, text, body_html


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    msg, subject, text, body_html = build()
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "sample_trade_alert.eml")
    with open(path, "wb") as f:
        f.write(bytes(msg))
    resend_payload = {"from": msg["From"], "to": ["<RECIPIENT_FROM_SECRET>"], "subject": subject,
                      "text": text, "html": body_html, "headers": {"X-TradeRec-ID": msg["X-TradeRec-ID"]},
                      "tags": [{"name": "rec_id", "value": "TR-2026-0007"}]}
    print("subject:", subject, f"({len(subject)} chars)")
    print("eml written:", path, f"({os.path.getsize(path)} bytes)")
    print("Resend payload keys:", list(resend_payload), "| + header Idempotency-Key:", msg["X-TradeRec-ID"])
    print("Gmail API raw (base64url) length:", len(base64.urlsafe_b64encode(bytes(msg))))
    print("\n--- text/plain part ---\n" + text)


if __name__ == "__main__":
    main()
