"""Owner fill comments on trade issues (design §7 gates: emails handled, practice fills vs the model)."""
import pytest

from traderec import feedback


def test_parse_comment_variants():
    assert feedback.parse_comment("filled 6000 @ 766.10") == [
        {"status": "filled", "ticker": None, "dollars": 6000.0, "price": 766.10}]
    assert feedback.parse_comment("SPY filled $13,077 @ $640.49\nIEF filled 16587 @ 112.41")[1] == {
        "status": "filled", "ticker": "IEF", "dollars": 16587.0, "price": 112.41}
    assert feedback.parse_comment("Skipped, I was travelling")[0]["status"] == "skipped"
    assert feedback.parse_comment("looks good, will do it tomorrow") == []


def test_api_url():
    assert feedback.api_comments_url("https://github.com/sol008/testProject/issues/12") == \
        "https://api.github.com/repos/sol008/testProject/issues/12/comments"
    assert feedback.api_comments_url("https://example.com/x") is None


def test_fetch_without_token_is_none(monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    assert feedback.fetch_comments("https://github.com/a/b/issues/1") is None


def test_review_measures_handled_and_gaps():
    issues = [
        {"url": "u1", "trade_id": "T-1", "date": "2026-10-01", "tickers": ["SPY"]},
        {"url": "u2", "trade_id": "T-2", "date": "2026-10-05", "tickers": ["IEF", "GLD"]},
        {"url": "u3", "trade_id": "T-3", "date": "2026-10-09", "tickers": ["IBIT"]},
    ]
    fills = [
        {"trade_id": "T-1", "ticker": "SPY", "side": "buy", "price": 700.0, "fill_date": "2026-10-02"},
        {"trade_id": "T-2", "ticker": "IEF", "side": "sell", "price": 100.0, "fill_date": "2026-10-06"},
    ]
    comments = {"u1": ["filled 6000 @ 700.35"], "u2": ["IEF filled 5000 @ 99.95", "GLD skipped"], "u3": []}
    out = feedback.review(issues, fills, fetch=comments.get)
    assert out["measured"] == 3 and out["handled"] == 2
    gaps = {f["ticker"]: round(f["gap_bps"], 2) for f in out["fills"]}
    assert gaps == {"SPY": 5.0, "IEF": 5.0}          # paid 5 bp more; received 5 bp less
    assert out["median_gap_bps"] == pytest.approx(5.0) and out["fills_ok"] is True


def test_review_without_github():
    out = feedback.review([{"url": "u", "trade_id": "T", "date": "2026-10-01", "tickers": ["SPY"]}], [],
                          fetch=lambda url: None)
    assert out["handled"] is None and out["fills_ok"] is None


def test_ticker_after_the_price_and_skip_with_ticker():
    assert feedback.parse_comment("filled 2500 @ 612.40 QQQ") == [
        {"status": "filled", "ticker": "QQQ", "dollars": 2500.0, "price": 612.40}]
    assert feedback.parse_comment("skipped GLD")[0]["ticker"] == "GLD"
    assert feedback.parse_comment("filled 6000 @ 766.10 thanks")[0]["ticker"] is None


def test_latest_comment_per_order_wins():
    issue = {"url": "u", "trade_id": "T-1", "date": "2026-10-01", "tickers": ["SPY"]}
    fills = [{"trade_id": "T-1", "ticker": "SPY", "side": "buy", "price": 700.0, "fill_date": "2026-10-02"}]
    out = feedback.review([issue], fills, fetch=lambda url: ["filled 6000 @ 770.00", "filled 6000 @ 700.07"])
    assert len(out["fills"]) == 1 and out["fills"][0]["owner"] == 700.07
